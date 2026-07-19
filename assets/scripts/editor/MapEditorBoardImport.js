"use strict";

var COLOR_NODE_TO_CODE = {
  red: "R",
  green: "G",
  blue: "B",
  yellow: "Y",
  purple: "P",
  black: "K",
  orange: "O",
  white: "W"
};

var PROP_NODE_BY_ENTITY_TYPE = {
  ice: "ice",
  blast: "blast",
  rainbow: "rainbow",
  stone: "stone",
  molotov: "molotov",
  swirl: "swirl",
  vine_spirit: "vine_spirit",
  key: "key",
  locked: "chain"
};

function colorCodeToNodeName(colorCode) {
  var nodeNames = Object.keys(COLOR_NODE_TO_CODE);
  for (var index = 0; index < nodeNames.length; index += 1) {
    var nodeName = nodeNames[index];
    if (COLOR_NODE_TO_CODE[nodeName] === colorCode) {
      return nodeName;
    }
  }
  throw new Error("未找到颜色码 `" + colorCode + "` 对应的 palette 节点。");
}

function buildSpecialEntityIndex(specialEntities) {
  var indexMap = {};
  if (!Array.isArray(specialEntities)) {
    throw new Error("level.specialEntities 必须是数组。");
  }
  specialEntities.forEach(function (entity) {
    if (!entity || !Number.isInteger(entity.row) || !Number.isInteger(entity.col)) {
      throw new Error("specialEntities 坐标非法。");
    }
    var key = entity.row + ":" + entity.col;
    if (indexMap[key]) {
      throw new Error("duplicate specialEntities cell `" + key + "`。");
    }
    indexMap[key] = entity;
  });
  return indexMap;
}

function cellStateFromSpecialEntity(entity, levelColors) {
  if (entity.entityCategory === "reactive_ball" && entity.entityType === "splitter") {
    if (typeof entity.splitColor !== "string" || levelColors.indexOf(entity.splitColor) === -1) {
      throw new Error("splitter splitColor 非法。");
    }
    return {
      kind: "splitter",
      layoutName: "split_ball_layot",
      nodeName: colorCodeToNodeName(entity.splitColor),
      colorCode: entity.splitColor,
      entityCategory: entity.entityCategory,
      entityType: entity.entityType,
      id: entity.id
    };
  }

  if (entity.entityCategory === "obstacle_ball" && entity.entityType === "ice") {
    if (typeof entity.innerColor !== "string" || levelColors.indexOf(entity.innerColor) === -1) {
      throw new Error("ice innerColor 非法。");
    }
    return {
      kind: "special",
      layoutName: "prop_layot",
      nodeName: "ice",
      entityCategory: entity.entityCategory,
      entityType: entity.entityType,
      colorCode: entity.innerColor,
      id: entity.id
    };
  }

  if (entity.entityCategory === "locked_ball" && entity.entityType === "locked") {
    if (typeof entity.lockedColor !== "string" || levelColors.indexOf(entity.lockedColor) === -1) {
      throw new Error("locked lockedColor 非法。");
    }
    return {
      kind: "special",
      layoutName: "prop_layot",
      nodeName: "chain",
      entityCategory: entity.entityCategory,
      entityType: entity.entityType,
      colorCode: entity.lockedColor,
      id: entity.id
    };
  }

  if (entity.entityCategory === "key_ball" && entity.entityType === "key") {
    return {
      kind: "special",
      layoutName: "prop_layot",
      nodeName: "key",
      entityCategory: entity.entityCategory,
      entityType: entity.entityType,
      id: entity.id
    };
  }

  if (entity.entityCategory === "reactive_ball" && entity.entityType === "molotov") {
    if (entity.blastRadius !== 2) {
      throw new Error("molotov blastRadius 必须为 2。");
    }
    return {
      kind: "special",
      layoutName: "prop_layot",
      nodeName: "molotov",
      entityCategory: entity.entityCategory,
      entityType: entity.entityType,
      blastRadius: entity.blastRadius,
      id: entity.id
    };
  }

  if (entity.entityCategory === "reactive_ball" && entity.entityType === "wormhole") {
    if (entity.moveDirection !== "left" && entity.moveDirection !== "right") {
      throw new Error("wormhole moveDirection 必须是 left 或 right。");
    }
    return {
      kind: "special",
      layoutName: "prop_layot",
      nodeName: entity.moveDirection === "left" ? "wormhole_left" : "wormhole_right",
      entityCategory: entity.entityCategory,
      entityType: entity.entityType,
      moveDirection: entity.moveDirection,
      id: entity.id
    };
  }

  var propNodeName = PROP_NODE_BY_ENTITY_TYPE[entity.entityType];
  if (propNodeName && (
    entity.entityCategory === "skill_ball" ||
    entity.entityCategory === "obstacle_ball" ||
    entity.entityCategory === "reactive_ball"
  )) {
    return {
      kind: "special",
      layoutName: "prop_layot",
      nodeName: propNodeName,
      entityCategory: entity.entityCategory,
      entityType: entity.entityType,
      id: entity.id
    };
  }

  throw new Error("编辑器暂不支持的特殊实体: " + entity.entityCategory + "/" + entity.entityType);
}

function importLevelToCellStates(levelConfig) {
  if (!levelConfig || !levelConfig.level) {
    throw new Error("levelConfig.level 缺失。");
  }

  var level = levelConfig.level;
  if (!Array.isArray(level.layout) || !level.layout.length) {
    throw new Error("level.layout 不能为空。");
  }
  if (!Array.isArray(level.colors) || !level.colors.length) {
    throw new Error("level.colors 不能为空。");
  }

  var specialIndex = buildSpecialEntityIndex(level.specialEntities);
  var cells = {};
  var rowCount = level.layout.length;

  for (var row = 0; row < rowCount; row += 1) {
    var rowString = level.layout[row];
    if (typeof rowString !== "string") {
      throw new Error("level.layout[" + row + "] 必须是字符串。");
    }
    for (var col = 0; col < rowString.length; col += 1) {
      var key = row + ":" + col;
      var cellCode = rowString[col];
      if (cellCode === ".") {
        if (specialIndex[key]) {
          cells[key] = cellStateFromSpecialEntity(specialIndex[key], level.colors);
        } else {
          cells[key] = { kind: "empty" };
        }
        continue;
      }
      if (level.colors.indexOf(cellCode) === -1) {
        throw new Error("layout 含非法颜色 `" + cellCode + "` at " + row + ":" + col);
      }
      if (specialIndex[key]) {
        throw new Error("layout 与 specialEntities 冲突 at " + row + ":" + col);
      }
      cells[key] = {
        kind: "color",
        colorCode: cellCode
      };
    }
  }

  return {
    rowCount: rowCount,
    cells: cells
  };
}

module.exports = {
  importLevelToCellStates: importLevelToCellStates,
  colorCodeToNodeName: colorCodeToNodeName
};
