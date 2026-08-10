"use strict";

var SPECIAL_ORDER = [
  "time_bonus",
  "ice",
  "splitter",
  "swirl",
  "wormhole",
  "vine_spirit",
  "locked",
  "molotov",
  "blast",
  "stone",
  "rainbow"
];

var SPECIAL_DEFINITIONS = {
  time_bonus: {
    title: "加时球",
    description: "消除加时球可为计时关额外增加 5 秒。",
    summary: "加时球消除后会立即增加 5 秒，帮你争取更多通关时间。",
    effectTitle: "时间奖励",
    effectDescription: "优先消除加时球，延长倒计时并获得更多操作空间。",
    iconPath: "ui/image/preview_balls/time_ball"
  },
  ice: {
    title: "冰冻球",
    description: "带有冰壳，需要先击破冰层，内部颜色球才能参与匹配消除。",
    summary: "冰冻球外层有冰壳，需要先融化冰层，内部颜色球才会参与消除。",
    effectTitle: "障碍作用",
    effectDescription: "优先处理冰冻球，可以打开后续消除路线并产出雪块目标。",
    iconPath: "ui/image/preview_balls/ice_ball"
  },
  splitter: {
    title: "分裂球",
    description: "击中后会生成同色球，适合扩大同色区域并制造连消。",
    summary: "分裂球被击中后会生成同色球，帮助你制造更多连消机会。",
    effectTitle: "特殊效果",
    effectDescription: "利用分裂球扩展同色区域，能更快打通棋盘结构。",
    iconPath: "ui/image/preview_balls/split_red_ball"
  },
  swirl: {
    title: "漩涡泡泡",
    description: "每次发射落位后，使周围六格沿六边形轨道顺时针旋转 60°。",
    summary: "漩涡泡泡会在每次发射落位后旋转周围六格，并重新判断顶部连接。",
    effectTitle: "旋转规则",
    effectDescription: "旋转只交换周围泡泡的位置，不改变泡泡数量和颜色；失去顶部连接的泡泡会正常掉落。",
    iconPath: "ui/image/preview_balls/swirl_ball"
  },
  wormhole: {
    title: "虫洞泡泡",
    description: "每次发射结算后，两个虫洞之间的格子会按箭头方向循环移动一格。",
    summary: "虫洞固定在同一行，普通球、特殊球和空位都会随通道一起循环移动。",
    effectTitle: "移动规则",
    effectDescription: "虫洞不可消除、不可掉落并作为固定支撑；移动不会立刻触发同色消除，但失去支撑的球会直接掉落。",
    iconPath: "ui/image/preview_balls/wormhole"
  },
  vine_spirit: {
    title: "藤蔓魔灵",
    description: "拥有 3 点生命，每 3 次发射会预告并缠绕附近的普通球。",
    summary: "直接命中、爆炸命中藤蔓魔灵或在相邻位置完成消除可造成伤害；缠绕球可通过直接命中、爆炸命中或在附近消除解开。",
    effectTitle: "藤蔓规则",
    effectDescription: "缠绕球不能参与消除；魔灵或缠绕球失去支撑时会正常掉落，掉落前解除藤蔓。魔灵死亡或掉落后，由它制造的全部藤蔓会自动枯萎。",
    iconPath: "ui/image/preview_balls/vine_spirit"
  },
  locked: {
    title: "锁定球",
    description: "需要先击中对应钥匙解锁，解锁后才能正常处理锁定球。",
    summary: "锁定球暂时无法直接消除，需要先击中对应钥匙解除锁定。",
    effectTitle: "解锁规则",
    effectDescription: "找到钥匙球并完成解锁后，锁定球才会回到可处理状态。",
    iconPath: "ui/image/preview_balls/locking_ball"
  },
  molotov: {
    title: "火焰瓶",
    description: "触发后清除周围半径两格的球，适合处理密集区域。",
    summary: "火焰瓶被触发后会影响周围区域，适合处理密集障碍。",
    effectTitle: "范围效果",
    effectDescription: "把火焰瓶留给关键结构，能一次打开更多路线。",
    iconPath: "ui/image/props/fire_box"
  },
  blast: {
    title: "炸弹球",
    description: "收集后获得炸弹道具，发射命中时可清理目标周围区域。",
    summary: "收集炸弹球后会获得局内炸弹技能，可用于清理指定区域。",
    effectTitle: "技能补给",
    effectDescription: "炸弹适合在颜色难以匹配或障碍集中时使用。",
    iconPath: "ui/image/preview_balls/bomb_ball"
  },
  stone: {
    title: "石头",
    description: "不能按普通颜色匹配消除，会阻挡消除路线。",
    summary: "石头不会按普通颜色匹配消除，会阻挡你的消除路线。",
    effectTitle: "障碍作用",
    effectDescription: "借助炸弹、火焰瓶或周围结构变化来处理石头。",
    iconPath: "ui/image/preview_balls/stone_ball"
  },
  rainbow: {
    title: "彩虹球",
    description: "收集后获得彩虹球道具，可选择关卡内任意颜色发射。",
    summary: "收集彩虹球后会获得彩虹技能，可选择需要的颜色发射。",
    effectTitle: "技能补给",
    effectDescription: "彩虹球适合补齐关键颜色，帮助完成收集目标。",
    iconPath: "ui/image/preview_balls/rainbow_ball"
  }
};

var SPECIAL_KEY_BY_ENTITY_TYPE = {
  ice: "ice",
  splitter: "splitter",
  swirl: "swirl",
  wormhole: "wormhole",
  vine_spirit: "vine_spirit",
  locked: "locked",
  key: "locked",
  molotov: "molotov",
  blast: "blast",
  stone: "stone",
  rainbow: "rainbow"
};

var POWERUP_DEFINITIONS = [
  {
    key: "precise_aim",
    title: "精确瞄准",
    description: "购买后本局立即生效，瞄准时显示完整反弹路径。",
    iconPath: "ui/image/props/aim"
  },
  {
    key: "three_line_elimination",
    title: "消三行",
    description: "立即清除棋盘最下方三行，并结算由此产生的悬空掉落。",
    iconPath: "ui/image/props/three_line_elimination"
  },
  {
    key: "plus_three_balls",
    title: "加十球",
    description: "立即增加十次可发射次数，限非无限发射关卡使用。",
    iconPath: "ui/image/props/plus_ball"
  },
  {
    key: "blast_ball",
    title: "炸弹球",
    description: "将当前发射球替换为炸弹球，命中后炸开周围区域。",
    iconPath: "ui/image/props/blast_ball"
  },
  {
    key: "rainbow_ball",
    title: "彩虹球",
    description: "选择关卡内任意颜色，将当前发射球变为该颜色。",
    iconPath: "ui/image/props/rainbow_ball"
  },
  {
    key: "swap_ball",
    title: "换球",
    description: "交换当前球和下一颗球，立即调整本次发射选择。",
    iconPath: "ui/image/props/change_ball"
  },
  {
    key: "barrier_hammer",
    title: "破障锤",
    description: "选择一个冰冻球或石头，直接击碎该障碍。",
    iconPath: "ui/image/props/barrier_hammer"
  },
  {
    key: "snow_removal",
    title: "除雪剂",
    description: "从棋盘底部开始清理最多 10 个雪块，并结算由此产生的掉落。",
    iconPath: "ui/image/props/snow_removal"
  }
];

var hasOwn = Object.prototype.hasOwnProperty;

function requireLevelConfig(levelConfig) {
  if (!levelConfig || typeof levelConfig !== "object" || Array.isArray(levelConfig)) {
    throw new Error("Prop description requires levelConfig.");
  }
  if (!levelConfig.level || typeof levelConfig.level !== "object" || Array.isArray(levelConfig.level)) {
    throw new Error("Prop description requires levelConfig.level.");
  }
  if (!Array.isArray(levelConfig.level.specialEntities)) {
    throw new Error("Prop description requires level.specialEntities.");
  }
  if (!Array.isArray(levelConfig.level.winConditions)) {
    throw new Error("Prop description requires level.winConditions.");
  }
  return levelConfig;
}

function requireSpecialKeyForEntityType(entityType) {
  if (typeof entityType !== "string" || entityType.length === 0) {
    throw new Error("Prop description special entityType must be a non-empty string.");
  }
  if (!hasOwn.call(SPECIAL_KEY_BY_ENTITY_TYPE, entityType)) {
    throw new Error("Prop description unsupported special entityType: " + entityType);
  }
  return SPECIAL_KEY_BY_ENTITY_TYPE[entityType];
}

function collectSpecialKeysForLevel(levelConfig) {
  var safeConfig = requireLevelConfig(levelConfig);
  var presentKeys = {};

  safeConfig.level.winConditions.forEach(function (condition, index) {
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
      throw new Error("Prop description winConditions[" + index + "] must be an object.");
    }
    if (typeof condition.type !== "string" || condition.type.length === 0) {
      throw new Error("Prop description winConditions[" + index + "].type is required.");
    }
    if (condition.type === "collect_ice_snowball") {
      presentKeys.ice = true;
    }
  });

  safeConfig.level.specialEntities.forEach(function (entity, index) {
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
      throw new Error("Prop description specialEntities[" + index + "] must be an object.");
    }
    presentKeys[requireSpecialKeyForEntityType(entity.entityType)] = true;
  });

  return SPECIAL_ORDER.filter(function (key) {
    return presentKeys[key] === true;
  });
}

function buildListDefinitions(levelConfig) {
  var definitions = collectSpecialKeysForLevel(levelConfig).map(function (key) {
    var definition = SPECIAL_DEFINITIONS[key];
    if (!definition) {
      throw new Error("Prop description special definition missing: " + key);
    }
    return {
      key: "special_" + key,
      title: definition.title,
      description: definition.description,
      iconPath: definition.iconPath
    };
  });

  POWERUP_DEFINITIONS.forEach(function (definition) {
    definitions.push({
      key: "powerup_" + definition.key,
      title: definition.title,
      description: definition.description,
      iconPath: definition.iconPath
    });
  });
  return definitions;
}

function getAllIconPaths() {
  var paths = SPECIAL_ORDER.map(function (key) {
    var definition = SPECIAL_DEFINITIONS[key];
    if (!definition || typeof definition.iconPath !== "string" || definition.iconPath.length === 0) {
      throw new Error("Prop description special icon path missing: " + key);
    }
    return definition.iconPath;
  });
  POWERUP_DEFINITIONS.forEach(function (definition) {
    if (!definition || typeof definition.iconPath !== "string" || definition.iconPath.length === 0) {
      throw new Error("Prop description powerup icon path missing.");
    }
    paths.push(definition.iconPath);
  });
  return paths.filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
}

module.exports = {
  SPECIAL_ORDER: SPECIAL_ORDER,
  SPECIAL_DEFINITIONS: SPECIAL_DEFINITIONS,
  SPECIAL_KEY_BY_ENTITY_TYPE: SPECIAL_KEY_BY_ENTITY_TYPE,
  POWERUP_DEFINITIONS: POWERUP_DEFINITIONS,
  buildListDefinitions: buildListDefinitions,
  collectSpecialKeysForLevel: collectSpecialKeysForLevel,
  getAllIconPaths: getAllIconPaths,
  requireSpecialKeyForEntityType: requireSpecialKeyForEntityType
};
