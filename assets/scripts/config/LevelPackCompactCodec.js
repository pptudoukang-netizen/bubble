"use strict";

var PACK_FORMAT_COMPACT_V2 = "compact-schema-v2";

var OCCLUSION_MODE_TO_CODE = {
  none: "n",
  per_attempt_no_repeat: "a",
  per_run: "r"
};

var OCCLUSION_CODE_TO_MODE = {
  n: "none",
  a: "per_attempt_no_repeat",
  r: "per_run"
};

var OCCLUSION_VISUAL_TO_CODE = {
  cloud: "c",
  leaves: "l"
};

var OCCLUSION_CODE_TO_VISUAL = {
  c: "cloud",
  l: "leaves"
};

var OCCLUSION_CLEAR_RULE_TO_CODE = {
  item_only: "i",
  item_or_shots: "s",
  item_or_seconds: "t"
};

var OCCLUSION_CODE_TO_CLEAR_RULE = {
  i: { kind: "item_only", valueField: null },
  s: { kind: "item_or_shots", valueField: "shots" },
  t: { kind: "item_or_seconds", valueField: "seconds" }
};

var ENTITY_TYPE_TO_CODE = {
  "hazard_ball/black_hole": "q",
  "obstacle_ball/ice": "i",
  "obstacle_ball/stone": "s",
  "reactive_ball/breeder": "d",
  "reactive_ball/molotov": "m",
  "reactive_ball/spirit_cocoon": "c",
  "reactive_ball/splitter": "p",
  "reactive_ball/swirl": "w",
  "reactive_ball/transparent_ball": "t",
  "reactive_ball/vine_spirit": "v",
  "reactive_ball/wormhole": "h",
  "locked_ball/locked": "l",
  "key_ball/key": "k",
  "skill_ball/blast": "b",
  "skill_ball/rainbow": "r"
};

var ENTITY_CODE_TO_TYPE = {
  q: { category: "hazard_ball", type: "black_hole", idPrefix: "black_hole" },
  i: { category: "obstacle_ball", type: "ice", idPrefix: "ice" },
  s: { category: "obstacle_ball", type: "stone", idPrefix: "stone" },
  d: { category: "reactive_ball", type: "breeder", idPrefix: "breeder" },
  m: { category: "reactive_ball", type: "molotov", idPrefix: "molotov" },
  c: { category: "reactive_ball", type: "spirit_cocoon", idPrefix: "spirit_cocoon" },
  p: { category: "reactive_ball", type: "splitter", idPrefix: "splitter" },
  w: { category: "reactive_ball", type: "swirl", idPrefix: "swirl" },
  t: { category: "reactive_ball", type: "transparent_ball", idPrefix: "transparent_ball" },
  v: { category: "reactive_ball", type: "vine_spirit", idPrefix: "vine_spirit" },
  h: { category: "reactive_ball", type: "wormhole", idPrefix: "wormhole" },
  l: { category: "locked_ball", type: "locked", idPrefix: "locked" },
  k: { category: "key_ball", type: "key", idPrefix: "key" },
  b: { category: "skill_ball", type: "blast", idPrefix: "blast" },
  r: { category: "skill_ball", type: "rainbow", idPrefix: "rainbow" }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function assertInteger(value, fieldName) {
  if (!Number.isInteger(value)) {
    throw new Error(fieldName + " must be an integer.");
  }
  return value;
}

function assertPositiveInteger(value, fieldName) {
  var integer = assertInteger(value, fieldName);
  if (integer <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return integer;
}

function assertNonNegativeInteger(value, fieldName) {
  var integer = assertInteger(value, fieldName);
  if (integer < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return integer;
}

function assertString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(fieldName + " must be a non-empty string.");
  }
  return value.trim();
}

function assertCompactCode(value, fieldName) {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(fieldName + " must be an exact non-empty compact code.");
  }
  return value;
}

function assertExactKeys(value, expectedKeys, fieldName) {
  var actualKeys = Object.keys(assertObject(value, fieldName)).sort();
  var sortedExpectedKeys = expectedKeys.slice().sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpectedKeys)) {
    throw new Error(fieldName + " must contain exactly: " + sortedExpectedKeys.join(", ") + ".");
  }
  return value;
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(fieldName + " must be an array.");
  }
  return value;
}

function assertArrayLength(value, expectedLength, fieldName) {
  var array = assertArray(value, fieldName);
  if (array.length !== expectedLength) {
    throw new Error(fieldName + " must contain exactly " + expectedLength + " entries.");
  }
  return array;
}

function assertCanonicalId(actualId, prefix, index, fieldName) {
  var expectedId = prefix + "_" + (index + 1);
  if (actualId !== expectedId) {
    throw new Error(fieldName + " must be canonical `" + expectedId + "`.");
  }
  return actualId;
}

function encodeOcclusionClearRule(clearRule, fieldName) {
  assertObject(clearRule, fieldName);
  var kind = assertString(clearRule.kind, fieldName + ".kind");
  var code = OCCLUSION_CLEAR_RULE_TO_CODE[kind];
  if (typeof code !== "string") {
    throw new Error(fieldName + ".kind unsupported: " + kind);
  }
  if (kind === "item_only") {
    assertExactKeys(clearRule, ["kind"], fieldName);
    return [code, 0];
  }
  var valueField = kind === "item_or_shots" ? "shots" : "seconds";
  assertExactKeys(clearRule, ["kind", valueField], fieldName);
  return [code, assertPositiveInteger(clearRule[valueField], fieldName + "." + valueField)];
}

function decodeOcclusionClearRule(code, encodedValue, fieldName) {
  var typeInfo = OCCLUSION_CODE_TO_CLEAR_RULE[assertCompactCode(code, fieldName + "[1]")];
  if (!typeInfo) {
    throw new Error(fieldName + " uses unsupported clear-rule code `" + code + "`.");
  }
  if (typeInfo.valueField === null) {
    if (encodedValue !== 0) {
      throw new Error(fieldName + " item-only clear rule requires zero sentinel.");
    }
    return { kind: typeInfo.kind };
  }
  var clearRule = { kind: typeInfo.kind };
  clearRule[typeInfo.valueField] = assertPositiveInteger(
    encodedValue,
    fieldName + "[2]"
  );
  return clearRule;
}

function encodeBoardOcclusionPlan(plan, levelKey) {
  var fieldName = "level.boardOcclusionPlan " + levelKey;
  assertExactKeys(plan, ["generatorVersion", "mode", "variants"], fieldName);
  var generatorVersion = assertPositiveInteger(plan.generatorVersion, fieldName + ".generatorVersion");
  var mode = assertString(plan.mode, fieldName + ".mode");
  var modeCode = OCCLUSION_MODE_TO_CODE[mode];
  if (typeof modeCode !== "string") {
    throw new Error(fieldName + ".mode unsupported: " + mode);
  }
  var variants = assertArray(plan.variants, fieldName + ".variants");
  if (mode === "none" && variants.length !== 0) {
    throw new Error(fieldName + " none mode must have no variants.");
  }
  if (mode !== "none" && variants.length === 0) {
    throw new Error(fieldName + " active mode must have variants.");
  }
  return [generatorVersion, modeCode, variants.map(function (variant, variantIndex) {
    var variantName = fieldName + ".variants[" + variantIndex + "]";
    assertExactKeys(variant, ["id", "zones"], variantName);
    assertCanonicalId(variant.id, "variant", variantIndex, variantName + ".id");
    var zones = assertArray(variant.zones, variantName + ".zones");
    if (zones.length === 0) {
      throw new Error(variantName + ".zones must not be empty.");
    }
    return zones.map(function (zone, zoneIndex) {
      var zoneName = variantName + ".zones[" + zoneIndex + "]";
      assertExactKeys(zone, ["id", "visualType", "cells", "clearRule"], zoneName);
      assertCanonicalId(zone.id, "zone", zoneIndex, zoneName + ".id");
      var visualType = assertString(zone.visualType, zoneName + ".visualType");
      var visualCode = OCCLUSION_VISUAL_TO_CODE[visualType];
      if (typeof visualCode !== "string") {
        throw new Error(zoneName + ".visualType unsupported: " + visualType);
      }
      var clearRule = encodeOcclusionClearRule(zone.clearRule, zoneName + ".clearRule");
      var cells = assertArray(zone.cells, zoneName + ".cells");
      if (cells.length < 3 || cells.length > 7) {
        throw new Error(zoneName + ".cells must contain 3 to 7 entries.");
      }
      var encodedCells = [];
      cells.forEach(function (cell, cellIndex) {
        var cellName = zoneName + ".cells[" + cellIndex + "]";
        assertExactKeys(cell, ["row", "col"], cellName);
        encodedCells.push(assertNonNegativeInteger(cell.row, cellName + ".row"));
        encodedCells.push(assertNonNegativeInteger(cell.col, cellName + ".col"));
      });
      return [visualCode, clearRule[0], clearRule[1], encodedCells];
    });
  })];
}

function decodeBoardOcclusionPlan(encodedPlan, levelKey) {
  var fieldName = "compact level.boardOcclusionPlan " + levelKey;
  var plan = assertArrayLength(encodedPlan, 3, fieldName);
  var generatorVersion = assertPositiveInteger(plan[0], fieldName + "[0]");
  var modeCode = assertCompactCode(plan[1], fieldName + "[1]");
  var mode = OCCLUSION_CODE_TO_MODE[modeCode];
  if (typeof mode !== "string") {
    throw new Error(fieldName + " uses unsupported mode code `" + modeCode + "`.");
  }
  var encodedVariants = assertArray(plan[2], fieldName + "[2]");
  if (mode === "none" && encodedVariants.length !== 0) {
    throw new Error(fieldName + " none mode must have no variants.");
  }
  if (mode !== "none" && encodedVariants.length === 0) {
    throw new Error(fieldName + " active mode must have variants.");
  }
  return {
    generatorVersion: generatorVersion,
    mode: mode,
    variants: encodedVariants.map(function (encodedVariant, variantIndex) {
      var variantName = fieldName + "[2][" + variantIndex + "]";
      var encodedZones = assertArray(encodedVariant, variantName);
      if (encodedZones.length === 0) {
        throw new Error(variantName + " must contain at least one zone.");
      }
      return {
        id: "variant_" + (variantIndex + 1),
        zones: encodedZones.map(function (encodedZone, zoneIndex) {
          var zoneName = variantName + "[" + zoneIndex + "]";
          var zone = assertArrayLength(encodedZone, 4, zoneName);
          var visualCode = assertCompactCode(zone[0], zoneName + "[0]");
          var visualType = OCCLUSION_CODE_TO_VISUAL[visualCode];
          if (typeof visualType !== "string") {
            throw new Error(zoneName + " uses unsupported visual code `" + visualCode + "`.");
          }
          var encodedCells = assertArray(zone[3], zoneName + "[3]");
          if (encodedCells.length < 6 || encodedCells.length > 14 || encodedCells.length % 2 !== 0) {
            throw new Error(zoneName + "[3] must contain 3 to 7 row/col pairs.");
          }
          var cells = [];
          for (var cellIndex = 0; cellIndex < encodedCells.length; cellIndex += 2) {
            cells.push({
              row: assertNonNegativeInteger(encodedCells[cellIndex], zoneName + "[3][" + cellIndex + "]"),
              col: assertNonNegativeInteger(encodedCells[cellIndex + 1], zoneName + "[3][" + (cellIndex + 1) + "]")
            });
          }
          return {
            id: "zone_" + (zoneIndex + 1),
            visualType: visualType,
            cells: cells,
            clearRule: decodeOcclusionClearRule(zone[1], zone[2], zoneName)
          };
        })
      };
    })
  };
}

function makeEntityKey(entity) {
  assertObject(entity, "special entity");
  return assertString(entity.entityCategory, "special entity entityCategory") + "/" + assertString(entity.entityType, "special entity entityType");
}

function encodeSpecialEntity(entity, index, levelKey) {
  var entityKey = makeEntityKey(entity);
  var typeCode = ENTITY_TYPE_TO_CODE[entityKey];
  if (typeof typeCode !== "string") {
    throw new Error("Unsupported compact special entity type `" + entityKey + "`: " + levelKey + "#" + index);
  }

  var encoded = [
    assertInteger(entity.row, "specialEntities[" + index + "].row"),
    assertInteger(entity.col, "specialEntities[" + index + "].col"),
    typeCode
  ];

  if (typeCode === "i") {
    encoded.push(assertString(entity.innerColor, "specialEntities[" + index + "].innerColor"));
  } else if (typeCode === "m") {
    encoded.push(assertInteger(entity.blastRadius, "specialEntities[" + index + "].blastRadius"));
  } else if (typeCode === "p") {
    encoded.push(assertString(entity.splitColor, "specialEntities[" + index + "].splitColor"));
  } else if (typeCode === "l") {
    encoded.push(assertString(entity.lockedColor, "specialEntities[" + index + "].lockedColor"));
  } else if (typeCode === "h") {
    encoded.push(assertString(entity.moveDirection, "specialEntities[" + index + "].moveDirection"));
  } else if (typeCode === "q") {
    encoded.push(assertInteger(entity.capacity, "specialEntities[" + index + "].capacity"));
  }

  return encoded;
}

function decodeSpecialEntity(encoded, index, levelKey) {
  if (!Array.isArray(encoded)) {
    throw new Error("compact specialEntities[" + index + "] must be an array: " + levelKey);
  }
  if (encoded.length < 3) {
    throw new Error("compact specialEntities[" + index + "] must contain row, col and type: " + levelKey);
  }

  var typeCode = assertString(encoded[2], "compact specialEntities[" + index + "][2]");
  var typeInfo = ENTITY_CODE_TO_TYPE[typeCode];
  if (!typeInfo) {
    throw new Error("compact specialEntities[" + index + "] unsupported type code `" + typeCode + "`: " + levelKey);
  }

  var entity = {
    id: typeInfo.idPrefix + "_" + String(index + 1).padStart(3, "0"),
    entityCategory: typeInfo.category,
    entityType: typeInfo.type,
    row: assertInteger(encoded[0], "compact specialEntities[" + index + "][0]"),
    col: assertInteger(encoded[1], "compact specialEntities[" + index + "][1]")
  };

  if (typeCode === "i") {
    if (encoded.length !== 4) {
      throw new Error("compact ice specialEntities[" + index + "] must contain innerColor: " + levelKey);
    }
    entity.innerColor = assertString(encoded[3], "compact specialEntities[" + index + "][3]");
  } else if (typeCode === "m") {
    if (encoded.length !== 4) {
      throw new Error("compact molotov specialEntities[" + index + "] must contain blastRadius: " + levelKey);
    }
    entity.blastRadius = assertInteger(encoded[3], "compact specialEntities[" + index + "][3]");
  } else if (typeCode === "p") {
    if (encoded.length !== 4) {
      throw new Error("compact splitter specialEntities[" + index + "] must contain splitColor: " + levelKey);
    }
    entity.splitColor = assertString(encoded[3], "compact specialEntities[" + index + "][3]");
  } else if (typeCode === "l") {
    if (encoded.length === 5) {
      entity.lockedColor = assertString(encoded[3], "compact specialEntities[" + index + "][3]");
    } else if (encoded.length === 4) {
      entity.lockedColor = assertString(encoded[3], "compact specialEntities[" + index + "][3]");
    } else {
      throw new Error("compact locked specialEntities[" + index + "] must contain lockedColor: " + levelKey);
    }
  } else if (typeCode === "h") {
    if (encoded.length !== 4) {
      throw new Error("compact wormhole specialEntities[" + index + "] must contain moveDirection: " + levelKey);
    }
    entity.moveDirection = assertString(encoded[3], "compact specialEntities[" + index + "][3]");
  } else if (typeCode === "q") {
    if (encoded.length !== 4) {
      throw new Error("compact black_hole specialEntities[" + index + "] must contain capacity: " + levelKey);
    }
    entity.capacity = assertInteger(encoded[3], "compact specialEntities[" + index + "][3]");
  } else if (typeCode === "k") {
    if (encoded.length === 4) {
      return entity;
    }
    if (encoded.length !== 3) {
      throw new Error("compact key specialEntities[" + index + "] must not contain extra fields: " + levelKey);
    }
  } else if (encoded.length !== 3) {
    throw new Error("compact specialEntities[" + index + "] has unexpected extra fields: " + levelKey);
  }

  return entity;
}

function compactLevelConfig(levelConfig, levelKey) {
  assertObject(levelConfig, "level config " + levelKey);
  assertObject(levelConfig.level, "level config level " + levelKey);
  if (!Array.isArray(levelConfig.level.specialEntities)) {
    throw new Error("level.specialEntities must be an array before compacting: " + levelKey);
  }
  assertObject(levelConfig.level.boardOcclusionPlan, "level.boardOcclusionPlan " + levelKey);

  var compact = clone(levelConfig);
  delete compact.schemaVersion;
  delete compact.coordinateSystem;
  delete compact.gameMode;
  delete compact.layoutNotes;
  delete compact.sharedDefaults;
  delete compact.difficultyScaleMax;
  delete compact.level.teaches;
  delete compact.level.designNotes;
  compact.level.specialEntities = levelConfig.level.specialEntities.map(function (entity, index) {
    return encodeSpecialEntity(entity, index, levelKey);
  });
  compact.level.boardOcclusionPlan = encodeBoardOcclusionPlan(
    levelConfig.level.boardOcclusionPlan,
    levelKey
  );
  return compact;
}

function expandLevelConfig(compactConfig, pack, levelKey) {
  assertObject(pack, "compact level pack");
  assertObject(compactConfig, "compact level config " + levelKey);
  assertObject(compactConfig.level, "compact level object " + levelKey);
  if (!Array.isArray(compactConfig.level.specialEntities)) {
    throw new Error("compact level.specialEntities must be an array: " + levelKey);
  }
  if (!Array.isArray(compactConfig.level.boardOcclusionPlan)) {
    throw new Error("compact level.boardOcclusionPlan must be an array: " + levelKey);
  }

  var expanded = clone(compactConfig);
  expanded.schemaVersion = pack.levelSchemaVersion;
  expanded.coordinateSystem = pack.coordinateSystem;
  expanded.sharedDefaults = clone(pack.sharedDefaults);
  expanded.level.specialEntities = compactConfig.level.specialEntities.map(function (entry, index) {
    return decodeSpecialEntity(entry, index, levelKey);
  });
  expanded.level.boardOcclusionPlan = decodeBoardOcclusionPlan(
    compactConfig.level.boardOcclusionPlan,
    levelKey
  );
  return expanded;
}

function compactPack(fullPack) {
  assertObject(fullPack, "remote level pack");
  assertObject(fullPack.levels, "remote level pack levels");

  var compact = {
    schemaVersion: fullPack.schemaVersion,
    format: PACK_FORMAT_COMPACT_V2,
    packId: fullPack.packId,
    from: fullPack.from,
    to: fullPack.to,
    levelSchemaVersion: null,
    coordinateSystem: null,
    sharedDefaults: null,
    levels: {}
  };

  Object.keys(fullPack.levels).sort().forEach(function (levelKey) {
    var fullConfig = fullPack.levels[levelKey];
    assertObject(fullConfig, "remote level config " + levelKey);
    if (compact.levelSchemaVersion === null) {
      compact.levelSchemaVersion = fullConfig.schemaVersion;
      compact.coordinateSystem = fullConfig.coordinateSystem;
      compact.sharedDefaults = clone(fullConfig.sharedDefaults);
    } else {
      if (fullConfig.schemaVersion !== compact.levelSchemaVersion) {
        throw new Error("compact pack level schemaVersion mismatch: " + levelKey);
      }
      if (fullConfig.coordinateSystem !== compact.coordinateSystem) {
        throw new Error("compact pack coordinateSystem mismatch: " + levelKey);
      }
      if (JSON.stringify(fullConfig.sharedDefaults) !== JSON.stringify(compact.sharedDefaults)) {
        throw new Error("compact pack sharedDefaults mismatch: " + levelKey);
      }
    }
    compact.levels[levelKey] = compactLevelConfig(fullConfig, levelKey);
  });

  if (compact.levelSchemaVersion !== 1) {
    throw new Error("compact pack levelSchemaVersion must be 1: " + fullPack.packId);
  }
  if (compact.coordinateSystem !== "odd-r-hex") {
    throw new Error("compact pack coordinateSystem must be odd-r-hex: " + fullPack.packId);
  }
  assertObject(compact.sharedDefaults, "compact pack sharedDefaults " + fullPack.packId);
  return compact;
}

function expandPack(compactPackData) {
  assertObject(compactPackData, "compact remote level pack");
  if (compactPackData.format !== PACK_FORMAT_COMPACT_V2) {
    throw new Error("compact remote level pack format invalid: " + compactPackData.packId);
  }
  if (compactPackData.levelSchemaVersion !== 1) {
    throw new Error("compact remote level pack levelSchemaVersion must be 1: " + compactPackData.packId);
  }
  if (compactPackData.coordinateSystem !== "odd-r-hex") {
    throw new Error("compact remote level pack coordinateSystem must be odd-r-hex: " + compactPackData.packId);
  }
  assertObject(compactPackData.sharedDefaults, "compact remote level pack sharedDefaults " + compactPackData.packId);
  assertObject(compactPackData.levels, "compact remote level pack levels " + compactPackData.packId);

  var expanded = {
    schemaVersion: compactPackData.schemaVersion,
    packId: compactPackData.packId,
    from: compactPackData.from,
    to: compactPackData.to,
    levels: {}
  };
  Object.keys(compactPackData.levels).forEach(function (levelKey) {
    expanded.levels[levelKey] = expandLevelConfig(compactPackData.levels[levelKey], compactPackData, levelKey);
  });
  return expanded;
}

module.exports = {
  PACK_FORMAT_COMPACT_V2: PACK_FORMAT_COMPACT_V2,
  compactPack: compactPack,
  expandPack: expandPack
};
