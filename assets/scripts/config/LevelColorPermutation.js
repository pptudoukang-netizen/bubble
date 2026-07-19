"use strict";

var COLOR_GROUPS = [
  ["R", "G", "B", "Y", "P"],
  ["K", "O", "W"]
];
var ALLOWED_COLORS = COLOR_GROUPS.reduce(function (colors, group) {
  return colors.concat(group);
}, []);
var COLOR_FIELDS = ["innerColor", "splitColor", "lockedColor"];

function assertLevelConfig(levelConfig) {
  if (!levelConfig || typeof levelConfig !== "object" || Array.isArray(levelConfig)) {
    throw new Error("Level color permutation requires level config object.");
  }
  if (!levelConfig.level || typeof levelConfig.level !== "object" || Array.isArray(levelConfig.level)) {
    throw new Error("Level color permutation requires level config.level object.");
  }
}

function assertKnownColor(colorCode, fieldName) {
  if (typeof colorCode !== "string" || ALLOWED_COLORS.indexOf(colorCode) === -1) {
    throw new Error("Level color permutation unsupported " + fieldName + ": " + colorCode);
  }
}

function assertUniqueColors(colors, fieldName) {
  var seen = {};
  colors.forEach(function (colorCode, index) {
    assertKnownColor(colorCode, fieldName + "[" + index + "]");
    if (seen[colorCode] === true) {
      throw new Error("Level color permutation duplicated " + fieldName + ": " + colorCode);
    }
    seen[colorCode] = true;
  });
}

function buildColorMap(sourceColors) {
  if (!Array.isArray(sourceColors) || sourceColors.length <= 0) {
    throw new Error("Level color permutation requires non-empty level.colors.");
  }
  assertUniqueColors(sourceColors, "level.colors");

  var map = {};
  COLOR_GROUPS.forEach(function (group) {
    var offset = 1 + Math.floor(Math.random() * (group.length - 1));
    group.forEach(function (sourceColor, sourceIndex) {
      var targetColor = group[(sourceIndex + offset) % group.length];
      if (sourceColor === targetColor) {
        throw new Error("Level color permutation generated identity color mapping: " + sourceColor);
      }
      if (map[sourceColor] !== undefined) {
        throw new Error("Level color permutation duplicated mapping source: " + sourceColor);
      }
      map[sourceColor] = targetColor;
    });
  });
  return map;
}

function mapColor(colorCode, colorMap, fieldName) {
  assertKnownColor(colorCode, fieldName);
  if (colorMap[colorCode] === undefined) {
    throw new Error("Level color permutation missing mapping for " + fieldName + ": " + colorCode);
  }
  return colorMap[colorCode];
}

function mapLayoutRow(rowString, colorMap, rowIndex) {
  if (typeof rowString !== "string") {
    throw new Error("Level color permutation layout row must be string: " + rowIndex);
  }
  return rowString.split("").map(function (cellCode, colIndex) {
    if (cellCode === ".") {
      return cellCode;
    }
    return mapColor(cellCode, colorMap, "level.layout[" + rowIndex + "][" + colIndex + "]");
  }).join("");
}

function mapSpawnWeights(spawnWeights, sourceColors, colorMap) {
  if (!spawnWeights || typeof spawnWeights !== "object" || Array.isArray(spawnWeights)) {
    throw new Error("Level color permutation requires level.spawnWeights object.");
  }
  var mapped = {};
  sourceColors.forEach(function (sourceColor) {
    if (typeof spawnWeights[sourceColor] !== "number" || spawnWeights[sourceColor] <= 0) {
      throw new Error("Level color permutation requires positive spawn weight for " + sourceColor);
    }
    mapped[mapColor(sourceColor, colorMap, "level.spawnWeights key")] = spawnWeights[sourceColor];
  });
  Object.keys(spawnWeights).forEach(function (colorCode) {
    if (sourceColors.indexOf(colorCode) === -1) {
      throw new Error("Level color permutation found spawn weight outside level.colors: " + colorCode);
    }
  });
  return mapped;
}

function mapInitialShotBalls(initialShotBalls, colorMap) {
  if (initialShotBalls === undefined) {
    return undefined;
  }
  if (!Array.isArray(initialShotBalls) || initialShotBalls.length <= 0 || initialShotBalls.length > 2) {
    throw new Error("Level color permutation initialShotBalls must contain 1 or 2 colors.");
  }
  return initialShotBalls.map(function (colorCode, index) {
    return mapColor(colorCode, colorMap, "level.initialShotBalls[" + index + "]");
  });
}

function mapOpeningShotBalls(openingShotBalls, colorMap) {
  if (openingShotBalls === undefined) {
    return undefined;
  }
  if (!Array.isArray(openingShotBalls) || openingShotBalls.length < 3 || openingShotBalls.length > 6) {
    throw new Error("Level color permutation openingShotBalls must contain 3 to 6 colors.");
  }
  return openingShotBalls.map(function (colorCode, index) {
    return mapColor(colorCode, colorMap, "level.openingShotBalls[" + index + "]");
  });
}

function mapJarColors(jarColors, colorMap) {
  if (!Array.isArray(jarColors) || jarColors.length <= 0) {
    throw new Error("Level color permutation requires non-empty level.jarColors.");
  }
  return jarColors.map(function (colorCode, index) {
    return mapColor(colorCode, colorMap, "level.jarColors[" + index + "]");
  });
}

function mapObjectives(objectives, colorMap, fieldName) {
  if (objectives === undefined) {
    return undefined;
  }
  if (!Array.isArray(objectives)) {
    throw new Error("Level color permutation requires level." + fieldName + " array.");
  }
  return objectives.map(function (objective, index) {
    if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
      throw new Error("Level color permutation level." + fieldName + "[" + index + "] must be object.");
    }
    var mappedObjective = Object.assign({}, objective);
    if (objective.type === "collect_color") {
      mappedObjective.color = mapColor(
        objective.color,
        colorMap,
        "level." + fieldName + "[" + index + "].color"
      );
    }
    return mappedObjective;
  });
}

function mapSpecialEntities(specialEntities, colorMap) {
  if (specialEntities === undefined) {
    return undefined;
  }
  if (!Array.isArray(specialEntities)) {
    throw new Error("Level color permutation specialEntities must be array.");
  }
  return specialEntities.map(function (entity, index) {
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
      throw new Error("Level color permutation specialEntities[" + index + "] must be object.");
    }
    var mappedEntity = Object.assign({}, entity);
    COLOR_FIELDS.forEach(function (fieldName) {
      if (entity[fieldName] === null || entity[fieldName] === undefined) {
        return;
      }
      mappedEntity[fieldName] = mapColor(entity[fieldName], colorMap, "specialEntities[" + index + "]." + fieldName);
    });
    return mappedEntity;
  });
}

function apply(levelConfig) {
  assertLevelConfig(levelConfig);
  var level = levelConfig.level;
  if (!Array.isArray(level.colors)) {
    throw new Error("Level color permutation requires level.colors array.");
  }
  var sourceColors = level.colors.slice();
  var colorMap = buildColorMap(sourceColors);

  if (!Array.isArray(level.layout) || level.layout.length <= 0) {
    throw new Error("Level color permutation requires non-empty level.layout.");
  }

  level.colors = sourceColors.map(function (sourceColor) {
    return mapColor(sourceColor, colorMap, "level.colors");
  });
  level.colorCount = level.colors.length;
  level.layout = level.layout.map(function (rowString, rowIndex) {
    return mapLayoutRow(rowString, colorMap, rowIndex);
  });
  level.jarColors = mapJarColors(level.jarColors, colorMap);
  level.spawnWeights = mapSpawnWeights(level.spawnWeights, sourceColors, colorMap);

  var mappedInitialShotBalls = mapInitialShotBalls(level.initialShotBalls, colorMap);
  if (mappedInitialShotBalls !== undefined) {
    level.initialShotBalls = mappedInitialShotBalls;
  }

  var mappedOpeningShotBalls = mapOpeningShotBalls(level.openingShotBalls, colorMap);
  if (mappedOpeningShotBalls !== undefined) {
    level.openingShotBalls = mappedOpeningShotBalls;
  }

  var mappedBonusObjectives = mapObjectives(level.bonusObjectives, colorMap, "bonusObjectives");
  if (mappedBonusObjectives !== undefined) {
    level.bonusObjectives = mappedBonusObjectives;
  }

  var mappedWinConditions = mapObjectives(level.winConditions, colorMap, "winConditions");
  if (mappedWinConditions !== undefined) {
    level.winConditions = mappedWinConditions;
  }

  var mappedSpecialEntities = mapSpecialEntities(level.specialEntities, colorMap);
  if (mappedSpecialEntities !== undefined) {
    level.specialEntities = mappedSpecialEntities;
  }

  if (!levelConfig.meta || typeof levelConfig.meta !== "object" || Array.isArray(levelConfig.meta)) {
    throw new Error("Level color permutation requires normalized level meta.");
  }
  levelConfig.meta = Object.assign({}, levelConfig.meta);
  levelConfig.meta.colorPermutation = {
    map: colorMap,
    sourceColors: sourceColors.slice(),
    runtimeColors: level.colors.slice()
  };

  return levelConfig;
}

module.exports = {
  apply: apply
};
