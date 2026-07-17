"use strict";

var BoardLayout = require("./BoardLayout");
var LevelBoardSupportValidator = require("./LevelBoardSupportValidator");
var RandomChallengeRules = require("./RandomChallengeRules");

var COLOR_POOL = ["R", "G", "B", "Y", "P"];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(fieldName + " must be a string.");
  }
  var normalized = value.trim();
  if (!normalized) {
    throw new Error(fieldName + " must be non-empty.");
  }
  return normalized;
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requirePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return value;
}

function requireNumberInRange(value, fieldName, min, max) {
  if (typeof value !== "number" || value < min || value > max) {
    throw new Error(fieldName + " must be in [" + min + ", " + max + "].");
  }
  return value;
}

function hashString(text) {
  var source = requireNonEmptyString(text, "seed");
  var hash = 2166136261;
  for (var index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  var state = hashString(seed);
  if (state === 0) {
    throw new Error("Random challenge seed produced an invalid zero state.");
  }
  return function () {
    state += 0x6D2B79F5;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickIndex(random, length, fieldName) {
  var safeLength = requirePositiveInteger(length, fieldName + " length");
  var index = Math.floor(random() * safeLength);
  if (!Number.isInteger(index) || index < 0 || index >= safeLength) {
    throw new Error(fieldName + " pick index out of range.");
  }
  return index;
}

function pickFrom(random, items, fieldName) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(fieldName + " must be a non-empty array.");
  }
  return items[pickIndex(random, items.length, fieldName)];
}

function shuffleCopy(random, items, fieldName) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(fieldName + " must be a non-empty array.");
  }
  var result = items.slice();
  for (var index = result.length - 1; index > 0; index -= 1) {
    var swapIndex = pickIndex(random, index + 1, fieldName);
    var temp = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = temp;
  }
  return result;
}

function resolveTier(options) {
  var opts = requireObject(options, "Random challenge options");
  if (opts.tier !== undefined) {
    var tier = requireObject(opts.tier, "Random challenge tier");
    return clone(tier);
  }
  return RandomChallengeRules.resolveTierByHighestUnlockedLevel(
    requirePositiveInteger(opts.highestUnlockedLevel, "highestUnlockedLevel")
  );
}

function selectColors(random, colorCount) {
  var safeColorCount = requirePositiveInteger(colorCount, "colorCount");
  if (safeColorCount > COLOR_POOL.length) {
    throw new Error("Random challenge colorCount exceeds color pool.");
  }
  return shuffleCopy(random, COLOR_POOL, "Random challenge colors").slice(0, safeColorCount);
}

function getUpperNeighborCoordinates(row, col) {
  if (row <= 0) {
    return [];
  }
  if (row % 2 === 1) {
    return [
      { row: row - 1, col: col },
      { row: row - 1, col: col + 1 }
    ];
  }
  return [
    { row: row - 1, col: col - 1 },
    { row: row - 1, col: col }
  ];
}

function isOccupied(layout, row, col) {
  if (row < 0 || row >= layout.length) {
    return false;
  }
  var rowString = layout[row];
  if (typeof rowString !== "string" || col < 0 || col >= rowString.length) {
    return false;
  }
  return rowString.charAt(col) !== ".";
}

function hasUpperSupport(layout, row, col) {
  var upperNeighbors = getUpperNeighborCoordinates(row, col);
  for (var index = 0; index < upperNeighbors.length; index += 1) {
    var neighbor = upperNeighbors[index];
    if (isOccupied(layout, neighbor.row, neighbor.col)) {
      return true;
    }
  }
  return false;
}

function buildLayout(random, tier, colors) {
  var rowCount = requirePositiveInteger(tier.rowCount, "tier.rowCount");
  var fillRate = requireNumberInRange(tier.fillRate, "tier.fillRate", 0.5, 0.95);
  var layout = [];
  var colorCounts = {};
  colors.forEach(function (color) {
    colorCounts[color] = 0;
  });

  for (var row = 0; row < rowCount; row += 1) {
    var columnCount = BoardLayout.getRowColumnCount(row, BoardLayout.defaultColumns);
    var chars = [];
    for (var col = 0; col < columnCount; col += 1) {
      var mustFill = row < 2;
      var supported = mustFill || hasUpperSupport(layout, row, col);
      var edgeColumn = col === 0 || col === columnCount - 1;
      var rowFillRate = edgeColumn ? Math.min(0.95, fillRate + 0.08) : fillRate;
      if (supported && (mustFill || random() <= rowFillRate)) {
        var color = pickFrom(random, colors, "Random challenge layout color");
        chars.push(color);
        colorCounts[color] += 1;
      } else {
        chars.push(".");
      }
    }
    layout.push(chars.join(""));
  }

  colors.forEach(function (color, index) {
    if (colorCounts[color] > 0) {
      return;
    }
    var targetRow = Math.min(index, layout.length - 1);
    var rowChars = layout[targetRow].split("");
    var targetCol = Math.min(index, rowChars.length - 1);
    var previous = rowChars[targetCol];
    if (previous !== ".") {
      colorCounts[previous] -= 1;
    }
    rowChars[targetCol] = color;
    colorCounts[color] += 1;
    layout[targetRow] = rowChars.join("");
  });

  return {
    rows: layout,
    colorCounts: colorCounts
  };
}

function pickTargetColor(random, colors, colorCounts) {
  var candidates = colors.filter(function (color) {
    return colorCounts[color] > 0;
  });
  if (candidates.length === 0) {
    throw new Error("Random challenge layout has no collectable colors.");
  }
  return pickFrom(random, candidates, "Random challenge target colors");
}

function buildSpawnWeights(random, colors) {
  var weights = {};
  colors.forEach(function (color) {
    weights[color] = 1 + Math.floor(random() * 4) * 0.1;
  });
  return weights;
}

function buildJarColors(colors, targetColor) {
  if (colors.indexOf(targetColor) === -1) {
    throw new Error("Random challenge target color must exist in colors before jar creation.");
  }
  return COLOR_POOL.slice();
}

function buildRewardItems(tier) {
  if (!Array.isArray(tier.rewardItems) || tier.rewardItems.length === 0) {
    throw new Error("Random challenge tier.rewardItems must be a non-empty array.");
  }
  return tier.rewardItems.map(function (item, index) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Random challenge tier.rewardItems[" + index + "] must be object.");
    }
    if (item.id !== "coin" && item.id !== "stamina") {
      throw new Error("Random challenge tier.rewardItems[" + index + "].id must be coin or stamina.");
    }
    return {
      id: item.id,
      count: requirePositiveInteger(item.count, "tier.rewardItems[" + index + "].count")
    };
  });
}

function createSeed() {
  var now = Date.now();
  var randomSuffix = Math.floor(Math.random() * 1000000);
  return "random_challenge_" + now + "_" + randomSuffix;
}

function buildConfig(options) {
  var opts = requireObject(options, "Random challenge options");
  var seed = opts.seed === undefined
    ? createSeed()
    : requireNonEmptyString(opts.seed, "Random challenge seed");
  var tier = resolveTier(opts);
  var random = createSeededRandom(seed);
  var colors = selectColors(random, requirePositiveInteger(tier.colorCount, "tier.colorCount"));
  var layoutResult = buildLayout(random, tier, colors);
  var targetColor = pickTargetColor(random, colors, layoutResult.colorCounts);
  var targetValue = Math.max(3, Math.floor(layoutResult.colorCounts[targetColor] * tier.targetCollectRatio));
  var jarColors = buildJarColors(colors, targetColor);

  var config = {
    schemaVersion: 1,
    gameMode: "glass_marble_bubble",
    coordinateSystem: "odd-r-hex",
    layoutNotes: {
      description: "Generated random challenge map. Top-to-bottom rows. Each character represents one grid cell.",
      legend: {},
      pattern: "seeded_random"
    },
    sharedDefaults: {
      collectMode: "any_with_same_color_bonus",
      loseConditions: [
        {
          type: "reach_danger_line",
          value: 1
        },
        {
          type: "run_out_of_shots",
          value: 1
        }
      ],
      fallingRules: {
        maxDynamicMarbles: 10,
        maxBounces: 2,
        enableMarbleMarbleCollision: true
      }
    },
    level: {
      levelId: RandomChallengeRules.LEVEL_ID,
      code: "L1001_RANDOM_CHALLENGE",
      difficulty: "challenge",
      teaches: [
        "random_challenge"
      ],
      colorCount: colors.length,
      colors: colors,
      shotLimit: requirePositiveInteger(tier.shotLimit, "tier.shotLimit"),
      targetScore: requirePositiveInteger(tier.targetScore, "tier.targetScore"),
      dropInterval: requirePositiveInteger(tier.dropInterval, "tier.dropInterval"),
      jarCount: jarColors.length,
      jarColors: jarColors,
      spawnWeights: buildSpawnWeights(random, colors),
      jarRules: {
        rimBounce: 0.68,
        collectZoneScale: 1.1,
        sameColorBonus: 1.5
      },
      winConditions: [
        {
          type: "collect_color",
          value: targetValue,
          color: targetColor
        }
      ],
      bonusObjectives: [
        {
          type: "clear_with_shots_remaining",
          value: 3
        }
      ],
      clearRewardItems: buildRewardItems(tier),
      layout: layoutResult.rows,
      designNotes: "Generated by RandomChallengeGenerator v" + RandomChallengeRules.GENERATOR_VERSION + " from seed " + seed + ".",
      difficultyScore: tier.id * 20,
      specialEntities: [],
      levelType: "normal",
      playMode: "shot_limited",
      initialDropSpaceRows: 8,
      adPowerupRules: {
        allowed: [
          "three_line_elimination",
          "plus_three_balls"
        ],
        maxGrantsPerRun: {
          three_line_elimination: 1,
          plus_three_balls: 1
        }
      },
      randomChallenge: {
        mode: RandomChallengeRules.MODE,
        seed: seed,
        generatorVersion: RandomChallengeRules.GENERATOR_VERSION,
        difficultyTier: tier.id
      }
    },
    difficultyScaleMax: 100
  };

  colors.forEach(function (color) {
    config.layoutNotes.legend[color] = color;
  });
  config.layoutNotes.legend["."] = "empty";
  LevelBoardSupportValidator.assertInitialBoardSupported(config.level, RandomChallengeRules.LEVEL_KEY);

  return config;
}

module.exports = {
  createSeed: createSeed,
  buildConfig: buildConfig
};
