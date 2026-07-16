"use strict";

var PACK_FORMAT_COMPACT_V1 = "compact-schema-v1";

var ENTITY_TYPE_TO_CODE = {
  "obstacle_ball/ice": "i",
  "obstacle_ball/stone": "s",
  "reactive_ball/molotov": "m",
  "reactive_ball/splitter": "p",
  "reactive_ball/swirl": "w",
  "reactive_ball/vine_spirit": "v",
  "reactive_ball/wormhole": "h",
  "locked_ball/locked": "l",
  "key_ball/key": "k",
  "skill_ball/blast": "b",
  "skill_ball/rainbow": "r"
};

var ENTITY_CODE_TO_TYPE = {
  i: { category: "obstacle_ball", type: "ice", idPrefix: "ice" },
  s: { category: "obstacle_ball", type: "stone", idPrefix: "stone" },
  m: { category: "reactive_ball", type: "molotov", idPrefix: "molotov" },
  p: { category: "reactive_ball", type: "splitter", idPrefix: "splitter" },
  w: { category: "reactive_ball", type: "swirl", idPrefix: "swirl" },
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

function assertString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(fieldName + " must be a non-empty string.");
  }
  return value.trim();
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
  return compact;
}

function expandLevelConfig(compactConfig, pack, levelKey) {
  assertObject(pack, "compact level pack");
  assertObject(compactConfig, "compact level config " + levelKey);
  assertObject(compactConfig.level, "compact level object " + levelKey);
  if (!Array.isArray(compactConfig.level.specialEntities)) {
    throw new Error("compact level.specialEntities must be an array: " + levelKey);
  }

  var expanded = clone(compactConfig);
  expanded.schemaVersion = pack.levelSchemaVersion;
  expanded.coordinateSystem = pack.coordinateSystem;
  expanded.sharedDefaults = clone(pack.sharedDefaults);
  expanded.level.specialEntities = compactConfig.level.specialEntities.map(function (entry, index) {
    return decodeSpecialEntity(entry, index, levelKey);
  });
  return expanded;
}

function compactPack(fullPack) {
  assertObject(fullPack, "remote level pack");
  assertObject(fullPack.levels, "remote level pack levels");

  var compact = {
    schemaVersion: fullPack.schemaVersion,
    format: PACK_FORMAT_COMPACT_V1,
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
  if (compactPackData.format !== PACK_FORMAT_COMPACT_V1) {
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
  PACK_FORMAT_COMPACT_V1: PACK_FORMAT_COMPACT_V1,
  compactPack: compactPack,
  expandPack: expandPack
};
