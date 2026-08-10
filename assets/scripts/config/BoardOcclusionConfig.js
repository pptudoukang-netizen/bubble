"use strict";

var GENERATOR_VERSION = 1;
var ENABLED_FROM_LEVEL = 31;
var MODE_NONE = "none";
var MODE_PER_ATTEMPT = "per_attempt_no_repeat";
var MODE_PER_RUN = "per_run";
var VISUAL_TYPES = {
  cloud: true,
  leaves: true
};
var CLEAR_RULE_KINDS = {
  item_only: true,
  item_or_shots: true,
  item_or_seconds: true
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function requireNonEmptyString(value, description) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(description + " must be a non-empty string.");
  }
  return value.trim();
}

function requirePositiveInteger(value, description) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(description + " must be a positive integer.");
  }
  return value;
}

function hashString(value) {
  var text = String(value);
  var hash = 2166136261;
  for (var index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function coordKey(row, col) {
  return row + ":" + col;
}

function getOddRNeighbors(row, col) {
  var evenRow = row % 2 === 0;
  var horizontalOffset = evenRow ? -1 : 1;
  return [
    { row: row, col: col - 1 },
    { row: row, col: col + 1 },
    { row: row - 1, col: col },
    { row: row - 1, col: col + horizontalOffset },
    { row: row + 1, col: col },
    { row: row + 1, col: col + horizontalOffset }
  ];
}

function buildOccupiedMap(level) {
  if (!Array.isArray(level.layout) || level.layout.length < 4) {
    throw new Error("Board occlusion generation requires at least four layout rows.");
  }
  var specialMap = {};
  if (!Array.isArray(level.specialEntities)) {
    throw new Error("Board occlusion generation requires level.specialEntities array.");
  }
  level.specialEntities.forEach(function (entity, index) {
    var row;
    var col;
    if (Array.isArray(entity)) {
      row = entity[0];
      col = entity[1];
    } else {
      requireObject(entity, "level.specialEntities[" + index + "]");
      row = entity.row;
      col = entity.col;
    }
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      throw new Error("Board occlusion generation requires integer special entity coordinates.");
    }
    specialMap[coordKey(row, col)] = true;
  });

  var occupied = {};
  level.layout.forEach(function (rowText, row) {
    if (typeof rowText !== "string" || !rowText.length) {
      throw new Error("Board occlusion generation requires non-empty layout row " + row + ".");
    }
    for (var col = 0; col < rowText.length; col += 1) {
      if (
        row >= 2 &&
        row <= level.layout.length - 2 &&
        rowText.charAt(col) !== "." &&
        !specialMap[coordKey(row, col)]
      ) {
        occupied[coordKey(row, col)] = { row: row, col: col };
      }
    }
  });
  return occupied;
}

function growConnectedGroup(start, occupied, targetSize) {
  var selected = [];
  var selectedMap = {};
  var queue = [start];
  while (queue.length && selected.length < targetSize) {
    var current = queue.shift();
    var key = coordKey(current.row, current.col);
    if (!occupied[key] || selectedMap[key]) {
      continue;
    }
    selectedMap[key] = true;
    selected.push({ row: current.row, col: current.col });
    getOddRNeighbors(current.row, current.col)
      .filter(function (neighbor) {
        return !!occupied[coordKey(neighbor.row, neighbor.col)] && !selectedMap[coordKey(neighbor.row, neighbor.col)];
      })
      .sort(function (left, right) {
        if (left.row !== right.row) {
          return left.row - right.row;
        }
        return left.col - right.col;
      })
      .forEach(function (neighbor) {
        queue.push(neighbor);
      });
  }
  return selected.length === targetSize ? selected : null;
}

function buildCandidateGroups(level, targetSize) {
  var occupied = buildOccupiedMap(level);
  var candidates = Object.keys(occupied)
    .map(function (key) {
      return occupied[key];
    })
    .sort(function (left, right) {
      if (left.row !== right.row) {
        return left.row - right.row;
      }
      return left.col - right.col;
    })
    .map(function (cell) {
      return growConnectedGroup(cell, occupied, targetSize);
    })
    .filter(function (group) {
      return !!group;
    });

  var unique = {};
  return candidates.filter(function (group) {
    var key = group.map(function (cell) {
      return coordKey(cell.row, cell.col);
    }).sort().join("|");
    if (unique[key]) {
      return false;
    }
    unique[key] = true;
    return true;
  });
}

function groupsOverlap(left, right) {
  var leftMap = {};
  left.forEach(function (cell) {
    leftMap[coordKey(cell.row, cell.col)] = true;
  });
  return right.some(function (cell) {
    return !!leftMap[coordKey(cell.row, cell.col)];
  });
}

function buildClearRule(level, levelId, zoneIndex) {
  if (level.playMode === "timed_infinite_shots") {
    return {
      kind: "item_or_seconds",
      seconds: 12 + ((levelId + zoneIndex) % 7)
    };
  }
  if (level.playMode === "shot_limited") {
    return {
      kind: "item_or_shots",
      shots: 4 + ((levelId + zoneIndex) % 3)
    };
  }
  throw new Error("Unsupported board occlusion playMode: " + String(level.playMode));
}

function createNonePlan() {
  return {
    generatorVersion: GENERATOR_VERSION,
    mode: MODE_NONE,
    variants: []
  };
}

function createPlanForLevel(level, options) {
  requireObject(level, "Board occlusion level");
  var levelId = requirePositiveInteger(level.levelId, "Board occlusion level.levelId");
  options = requireObject(options, "Board occlusion generation options");
  var mode = requireNonEmptyString(options.mode, "Board occlusion generation mode");
  if (mode !== MODE_PER_ATTEMPT && mode !== MODE_PER_RUN) {
    throw new Error("Unsupported board occlusion generation mode: " + mode);
  }
  if (options.enabled !== true) {
    return createNonePlan();
  }

  var zoneCount = levelId >= 80 ? 2 : 1;
  var cellCount = levelId >= 120 ? 6 : (levelId >= 60 ? 5 : 4);
  var variantCount = mode === MODE_PER_ATTEMPT ? 4 : 3;
  var candidates = buildCandidateGroups(level, cellCount);
  if (candidates.length < variantCount * zoneCount) {
    throw new Error(
      "Board occlusion generation lacks connected candidates for level " + levelId +
      ": required " + (variantCount * zoneCount) + ", got " + candidates.length
    );
  }

  var baseOffset = hashString("board-occlusion:" + GENERATOR_VERSION + ":" + levelId) % candidates.length;
  var variants = [];
  var usedVariantKeys = {};
  for (var variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
    var zones = [];
    var scanIndex = 0;
    while (zones.length < zoneCount && scanIndex < candidates.length * 2) {
      var candidateIndex = (baseOffset + variantIndex * 7 + scanIndex * 5) % candidates.length;
      var candidate = candidates[candidateIndex];
      scanIndex += 1;
      if (zones.some(function (zone) {
        return groupsOverlap(zone.cells, candidate);
      })) {
        continue;
      }
      zones.push({
        id: "zone_" + (zones.length + 1),
        visualType: (levelId + zones.length) % 2 === 0 ? "cloud" : "leaves",
        cells: clone(candidate),
        clearRule: buildClearRule(level, levelId, zones.length)
      });
    }
    if (zones.length !== zoneCount) {
      throw new Error("Board occlusion generation could not build non-overlapping zones for level " + levelId + ".");
    }
    var variantKey = zones.map(function (zone) {
      return zone.cells.map(function (cell) {
        return coordKey(cell.row, cell.col);
      }).sort().join(",");
    }).sort().join(";");
    if (usedVariantKeys[variantKey]) {
      throw new Error("Board occlusion generation produced duplicate variant for level " + levelId + ".");
    }
    usedVariantKeys[variantKey] = true;
    variants.push({
      id: "variant_" + (variantIndex + 1),
      zones: zones
    });
  }

  return normalizePlan({
    generatorVersion: GENERATOR_VERSION,
    mode: mode,
    variants: variants
  }, level, "level_" + String(levelId).padStart(3, "0"));
}

function normalizeClearRule(rawRule, description) {
  var rule = requireObject(rawRule, description);
  var keys = Object.keys(rule);
  var kind = requireNonEmptyString(rule.kind, description + ".kind");
  if (!CLEAR_RULE_KINDS[kind]) {
    throw new Error(description + ".kind unsupported: " + kind);
  }
  if (kind === "item_only") {
    if (keys.length !== 1) {
      throw new Error(description + " item_only must contain only kind.");
    }
    return { kind: kind };
  }
  if (kind === "item_or_shots") {
    if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(rule, "shots")) {
      throw new Error(description + " item_or_shots must contain kind and shots.");
    }
    return {
      kind: kind,
      shots: requirePositiveInteger(rule.shots, description + ".shots")
    };
  }
  if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(rule, "seconds")) {
    throw new Error(description + " item_or_seconds must contain kind and seconds.");
  }
  return {
    kind: kind,
    seconds: requirePositiveInteger(rule.seconds, description + ".seconds")
  };
}

function normalizePlan(rawPlan, level, levelKey) {
  requireObject(level, "Board occlusion normalized level");
  var plan = requireObject(rawPlan, "level.boardOcclusionPlan");
  var generatorVersion = requirePositiveInteger(
    plan.generatorVersion,
    "level.boardOcclusionPlan.generatorVersion"
  );
  if (generatorVersion !== GENERATOR_VERSION) {
    throw new Error("Unsupported board occlusion generatorVersion " + generatorVersion + ": " + levelKey);
  }
  var mode = requireNonEmptyString(plan.mode, "level.boardOcclusionPlan.mode");
  if (mode !== MODE_NONE && mode !== MODE_PER_ATTEMPT && mode !== MODE_PER_RUN) {
    throw new Error("Unsupported board occlusion mode `" + mode + "`: " + levelKey);
  }
  if (!Array.isArray(plan.variants)) {
    throw new Error("level.boardOcclusionPlan.variants must be an array: " + levelKey);
  }
  if (mode === MODE_NONE) {
    if (plan.variants.length !== 0) {
      throw new Error("board occlusion none mode must have no variants: " + levelKey);
    }
    return createNonePlan();
  }
  if (mode === MODE_PER_ATTEMPT && plan.variants.length < 2) {
    throw new Error("per_attempt_no_repeat requires at least two variants: " + levelKey);
  }
  if (mode === MODE_PER_RUN && plan.variants.length < 1) {
    throw new Error("per_run requires at least one variant: " + levelKey);
  }
  var expectedClearRuleKind;
  if (level.playMode === "shot_limited") {
    expectedClearRuleKind = "item_or_shots";
  } else if (level.playMode === "timed_infinite_shots") {
    expectedClearRuleKind = "item_or_seconds";
  } else {
    throw new Error("Unsupported board occlusion playMode `" + String(level.playMode) + "`: " + levelKey);
  }

  var occupied = {};
  var specialCells = {};
  if (!Array.isArray(level.layout)) {
    throw new Error("Board occlusion validation requires level.layout: " + levelKey);
  }
  level.layout.forEach(function (rowText, row) {
    if (typeof rowText !== "string") {
      throw new Error("Board occlusion validation requires string layout rows: " + levelKey);
    }
    for (var col = 0; col < rowText.length; col += 1) {
      if (rowText.charAt(col) !== ".") {
        occupied[coordKey(row, col)] = true;
      }
    }
  });
  if (!Array.isArray(level.specialEntities)) {
    throw new Error("Board occlusion validation requires level.specialEntities: " + levelKey);
  }
  level.specialEntities.forEach(function (entity) {
    var row = Array.isArray(entity) ? entity[0] : entity.row;
    var col = Array.isArray(entity) ? entity[1] : entity.col;
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      throw new Error("Board occlusion validation requires integer special entity coordinates: " + levelKey);
    }
    specialCells[coordKey(row, col)] = true;
  });

  var variantIds = {};
  var normalizedVariants = plan.variants.map(function (variant, variantIndex) {
    requireObject(variant, "level.boardOcclusionPlan.variants[" + variantIndex + "]");
    var variantId = requireNonEmptyString(
      variant.id,
      "level.boardOcclusionPlan.variants[" + variantIndex + "].id"
    );
    if (variantIds[variantId]) {
      throw new Error("Duplicate board occlusion variant id `" + variantId + "`: " + levelKey);
    }
    variantIds[variantId] = true;
    if (!Array.isArray(variant.zones) || variant.zones.length < 1 || variant.zones.length > 2) {
      throw new Error("Board occlusion variant zones must contain 1 or 2 entries: " + levelKey);
    }
    var zoneIds = {};
    var variantCells = {};
    var zones = variant.zones.map(function (zone, zoneIndex) {
      requireObject(zone, "board occlusion zone");
      var zoneId = requireNonEmptyString(zone.id, "board occlusion zone.id");
      if (zoneIds[zoneId]) {
        throw new Error("Duplicate board occlusion zone id `" + zoneId + "`: " + levelKey);
      }
      zoneIds[zoneId] = true;
      var visualType = requireNonEmptyString(zone.visualType, "board occlusion zone.visualType");
      if (!VISUAL_TYPES[visualType]) {
        throw new Error("Unsupported board occlusion visualType `" + visualType + "`: " + levelKey);
      }
      if (!Array.isArray(zone.cells) || zone.cells.length < 3 || zone.cells.length > 7) {
        throw new Error("Board occlusion zone cells must contain 3 to 7 coordinates: " + levelKey);
      }
      var zoneCells = zone.cells.map(function (cell, cellIndex) {
        requireObject(cell, "board occlusion zone.cells[" + cellIndex + "]");
        if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
          throw new Error("Board occlusion cell coordinates must be integers: " + levelKey);
        }
        var key = coordKey(cell.row, cell.col);
        if (!occupied[key]) {
          throw new Error("Board occlusion cell must cover an occupied initial cell `" + key + "`: " + levelKey);
        }
        if (specialCells[key]) {
          throw new Error("Board occlusion cell cannot cover a special entity `" + key + "`: " + levelKey);
        }
        if (variantCells[key]) {
          throw new Error("Board occlusion zones overlap at `" + key + "`: " + levelKey);
        }
        variantCells[key] = true;
        return { row: cell.row, col: cell.col };
      });
      var connected = {};
      var queue = [zoneCells[0]];
      while (queue.length) {
        var current = queue.shift();
        var currentKey = coordKey(current.row, current.col);
        if (connected[currentKey]) {
          continue;
        }
        connected[currentKey] = true;
        getOddRNeighbors(current.row, current.col).forEach(function (neighbor) {
          var neighborKey = coordKey(neighbor.row, neighbor.col);
          if (variantCells[neighborKey] && zoneCells.some(function (candidate) {
            return candidate.row === neighbor.row && candidate.col === neighbor.col;
          }) && !connected[neighborKey]) {
            queue.push(neighbor);
          }
        });
      }
      if (Object.keys(connected).length !== zoneCells.length) {
        throw new Error("Board occlusion zone cells must form one connected hex region: " + levelKey);
      }
      var clearRuleDescription =
        "level.boardOcclusionPlan.variants[" + variantIndex + "].zones[" + zoneIndex + "].clearRule";
      var clearRule = normalizeClearRule(zone.clearRule, clearRuleDescription);
      if (clearRule.kind !== expectedClearRuleKind) {
        throw new Error(
          clearRuleDescription + ".kind must be " + expectedClearRuleKind +
          " when level.playMode is " + level.playMode + ": " + levelKey
        );
      }
      return {
        id: zoneId,
        visualType: visualType,
        cells: zoneCells,
        clearRule: clearRule
      };
    });
    return {
      id: variantId,
      zones: zones
    };
  });

  return {
    generatorVersion: generatorVersion,
    mode: mode,
    variants: normalizedVariants
  };
}

function buildCampaignPlan(level) {
  return createPlanForLevel(level, {
    enabled: level.levelId >= ENABLED_FROM_LEVEL && level.levelType !== "trapped_sprite_rescue",
    mode: MODE_PER_ATTEMPT
  });
}

module.exports = {
  GENERATOR_VERSION: GENERATOR_VERSION,
  ENABLED_FROM_LEVEL: ENABLED_FROM_LEVEL,
  MODE_NONE: MODE_NONE,
  MODE_PER_ATTEMPT: MODE_PER_ATTEMPT,
  MODE_PER_RUN: MODE_PER_RUN,
  VISUAL_TYPES: clone(VISUAL_TYPES),
  createNonePlan: createNonePlan,
  createPlanForLevel: createPlanForLevel,
  buildCampaignPlan: buildCampaignPlan,
  normalizePlan: normalizePlan,
  hashString: hashString
};
