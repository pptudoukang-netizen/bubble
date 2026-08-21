"use strict";

var BoardLayout = require("../config/BoardLayout");
var LevelConfigLoader = require("../config/LevelConfigLoader");
var LocalEditedLevelStore = require("../config/LocalEditedLevelStore");
var LevelEditorCloudSyncService = require("../services/LevelEditorCloudSyncService");
var MapEditorLevelCatalog = require("./MapEditorLevelCatalog");
var MapEditorLevelPicker = require("./MapEditorLevelPicker");
var MapEditorBoardImport = require("./MapEditorBoardImport");

var MAX_COLUMNS = BoardLayout.defaultColumns;
var WORMHOLE_RENDER_SIZE = 80;
var WIND_TUNNEL_ENTRANCE_RENDER_SIZE = { width: 110, height: 92 };
var PALETTE_SELECTED_SCALE = 1.12;
var PALETTE_NORMAL_SCALE = 1;
var TOP_BOARD_ROW_INDEX = 0;
var EDITOR_SCENE_BACK_TARGET = "game";
var EDITOR_TIP_STAY_DURATION = 2.6;
var EDITOR_TIP_FADE_DURATION = 0.2;

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
var EDITOR_COLOR_CODES = ["R", "G", "B", "Y", "P", "K", "O", "W"];

var SPECIAL_TOOL_DEFS = {
  ice: {
    entityCategory: "obstacle_ball",
    entityType: "ice",
    requiresColor: true
  },
  blast: {
    entityCategory: "skill_ball",
    entityType: "blast"
  },
  rainbow: {
    entityCategory: "skill_ball",
    entityType: "rainbow"
  },
  crystal_gun: {
    entityCategory: "skill_ball",
    entityType: "crystal_gun"
  },
  bud: {
    entityCategory: "reactive_ball",
    entityType: "bud"
  },
  stone: {
    entityCategory: "obstacle_ball",
    entityType: "stone"
  },
  chain: {
    entityCategory: "locked_ball",
    entityType: "locked",
    requiresColor: true
  },
  key: {
    entityCategory: "key_ball",
    entityType: "key"
  },
  molotov: {
    entityCategory: "reactive_ball",
    entityType: "molotov",
    blastRadius: 2
  },
  swirl: {
    entityCategory: "reactive_ball",
    entityType: "swirl"
  },
  vine_spirit: {
    entityCategory: "reactive_ball",
    entityType: "vine_spirit"
  },
  wormhole_left: {
    entityCategory: "reactive_ball",
    entityType: "wormhole",
    moveDirection: "left"
  },
  wormhole_right: {
    entityCategory: "reactive_ball",
    entityType: "wormhole",
    moveDirection: "right"
  },
  wind_tunnel_entrance: {
    entityCategory: "reactive_ball",
    entityType: "wind_tunnel_entrance"
  },
  wind_tunnel_exit: {
    entityCategory: "reactive_ball",
    entityType: "wind_tunnel_exit"
  }
};

function isNonCellSpecialEntityType(entityType) {
  return entityType === "wormhole" || entityType === "wind_tunnel_entrance";
}

function requireNode(parent, name) {
  if (!parent || !parent.isValid) {
    throw new Error("MapEditor parent node is invalid while resolving `" + name + "`.");
  }
  var node = parent.getChildByName(name);
  if (!node) {
    throw new Error("MapEditor scene missing required node `" + name + "`.");
  }
  return node;
}

function requireComponent(node, componentType) {
  var component = node.getComponent(componentType);
  if (!component) {
    throw new Error("MapEditor node `" + node.name + "` missing required component.");
  }
  return component;
}

function cloneSpriteFrame(sourceSprite) {
  if (!sourceSprite || !sourceSprite.spriteFrame) {
    throw new Error("MapEditor sprite source is missing spriteFrame.");
  }
  return sourceSprite.spriteFrame;
}

function createEmptyCellState() {
  return {
    kind: "empty"
  };
}

function cellStateKey(row, col) {
  return row + ":" + col;
}

function padLevelId(levelId) {
  return String(levelId).padStart(3, "0");
}

function syncLevelColorsFromBoard(level, boardColors, levelId) {
  if (!level || typeof level !== "object" || Array.isArray(level)) {
    throw new Error("保存时 level 配置非法。");
  }
  if (!Array.isArray(boardColors) || boardColors.length === 0) {
    throw new Error("保存时棋盘颜色列表不能为空。");
  }
  if (!level.spawnWeights || typeof level.spawnWeights !== "object" || Array.isArray(level.spawnWeights)) {
    throw new Error("保存时 level.spawnWeights 必须是对象。");
  }

  var boardColorSet = {};
  boardColors.forEach(function (colorCode) {
    if (EDITOR_COLOR_CODES.indexOf(colorCode) === -1) {
      throw new Error("保存时棋盘包含不支持的颜色 `" + colorCode + "`。");
    }
    if (boardColorSet[colorCode]) {
      throw new Error("保存时棋盘颜色列表包含重复颜色 `" + colorCode + "`。");
    }
    boardColorSet[colorCode] = true;
  });

  var activeColors = EDITOR_COLOR_CODES.filter(function (colorCode) {
    return boardColorSet[colorCode] === true;
  });
  var collectTargetColors = {};
  if (!Array.isArray(level.winConditions)) {
    throw new Error("保存时 level.winConditions 必须是数组。");
  }
  level.winConditions.forEach(function (objective) {
    if (objective && objective.type === "collect_color" && typeof objective.color === "string") {
      collectTargetColors[objective.color] = true;
    }
  });

  var previousSpawnWeights = level.spawnWeights;
  var nextSpawnWeights = {};
  activeColors.forEach(function (colorCode, index) {
    if (Object.prototype.hasOwnProperty.call(previousSpawnWeights, colorCode)) {
      var previousWeight = previousSpawnWeights[colorCode];
      if (typeof previousWeight !== "number" || previousWeight <= 0) {
        throw new Error("保存时 level.spawnWeights." + colorCode + " 必须大于 0。");
      }
      nextSpawnWeights[colorCode] = previousWeight;
    } else {
      nextSpawnWeights[colorCode] = collectTargetColors[colorCode] === true
        ? 2.4
        : 1 + ((levelId + index) % 3) * 0.12;
    }
  });

  level.colors = activeColors;
  level.colorCount = activeColors.length;
  level.spawnWeights = nextSpawnWeights;
  syncShotColorSequences(level, activeColors, levelId, collectTargetColors);
}

function assertShotColorSequence(sequence, fieldName, minLength, maxLength) {
  if (!Array.isArray(sequence) || sequence.length < minLength || sequence.length > maxLength) {
    throw new Error("保存时 level." + fieldName + " 长度必须为 " + minLength + "-" + maxLength + "。" );
  }
  sequence.forEach(function (colorCode, index) {
    if (typeof colorCode !== "string" || EDITOR_COLOR_CODES.indexOf(colorCode) === -1) {
      throw new Error("保存时 level." + fieldName + "[" + index + "] 颜色非法。");
    }
  });
}

function syncShotColorSequences(level, activeColors, levelId, collectTargetColors) {
  var activeColorSet = {};
  activeColors.forEach(function (colorCode) {
    activeColorSet[colorCode] = true;
  });

  if (level.openingShotBalls !== undefined) {
    assertShotColorSequence(level.openingShotBalls, "openingShotBalls", 3, 6);
    var openingHasRemovedColor = level.openingShotBalls.some(function (colorCode) {
      return activeColorSet[colorCode] !== true;
    });
    if (openingHasRemovedColor) {
      var activeTargetColors = activeColors.filter(function (colorCode) {
        return collectTargetColors[colorCode] === true;
      });
      if (activeTargetColors.length === 1) {
        var targetColor = activeTargetColors[0];
        var otherColors = activeColors.filter(function (colorCode) {
          return colorCode !== targetColor;
        });
        level.openingShotBalls = level.openingShotBalls.map(function (_, index) {
          if (index % 2 === 0 || otherColors.length === 0) {
            return targetColor;
          }
          return otherColors[(levelId + Math.floor(index / 2)) % otherColors.length];
        });
      } else {
        level.openingShotBalls = level.openingShotBalls.map(function (_, index) {
          return activeColors[(levelId + index) % activeColors.length];
        });
      }
    }
  }

  if (level.initialShotBalls !== undefined) {
    assertShotColorSequence(level.initialShotBalls, "initialShotBalls", 1, 2);
    level.initialShotBalls = level.initialShotBalls.map(function (colorCode, index) {
      return activeColorSet[colorCode] === true
        ? colorCode
        : activeColors[(levelId + index) % activeColors.length];
    });
  }
}

var MapEditorController = cc.Class({
  extends: cc.Component,

  properties: {},

  onLoad: function () {
    this._rowCount = 0;
    this._cells = {};
    this._nonCellSpecialOverlays = {};
    this._cellNodes = {};
    this._selectedTool = null;
    this._paletteNodes = [];
    this._selectedColorCode = null;
    this._levelCatalog = new MapEditorLevelCatalog();
    this._localEditedLevelStore = new LocalEditedLevelStore();
    this._cloudSyncService = null;
    this._isCloudSyncing = false;
    this._levelPicker = new MapEditorLevelPicker(this.node);
    this._editingLevelConfig = null;
    this._currentLevelId = 0;
    this._availableLevelIds = [];
    this._boardPaintActive = false;
    this._boardPaintPreviousPoint = null;
    this._boardPaintVisitedKeys = {};

    this._checkerboardNode = requireNode(this.node, "checkerboard");
    this._honeycombTemplate = requireNode(this._checkerboardNode, "honeycomb");
    this._honeycombTemplateSprite = requireComponent(this._honeycombTemplate, cc.Sprite);
    this._checkerboardWidget = this._checkerboardNode.getComponent(cc.Widget);
    this._bindBoardPaintInput();

    this._rowInput = requireComponent(requireNode(this.node, "checkerboard_row"), cc.EditBox);
    this._ballCountInput = requireComponent(requireNode(this.node, "input_ball_num"), cc.EditBox);
    this._inputLevelEditBox = requireComponent(requireNode(this.node, "input_level"), cc.EditBox);
    this._inputLevelEditBox.node.on("editing-did-ended", this._onInputLevelEditingDidEnded, this);
    this._bindColorPalette(requireNode(this.node, "ball_layot"), "ball_layot", "color");
    this._bindColorPalette(requireNode(this.node, "split_ball_layot"), "split_ball_layot", "splitter");
    var propLayoutNode = requireNode(this.node, "prop_layot");
    this._bindPalette(propLayoutNode, "special");
    this._bindToolButton(requireNode(this.node, "clear_btn"), { kind: "erase" });
    this._bindActionButton(requireNode(this.node, "clear_all"), this._onClearAllTap.bind(this));
    this._clearLocalButtonNode = requireNode(this.node, "clear_local");
    this._bindActionButton(this._clearLocalButtonNode, this._onClearLocalTap.bind(this));
    this._bindActionButton(requireNode(this.node, "rebuild_btn"), this._onRebuildTap.bind(this));
    this._saveLocalButtonNode = requireNode(this.node, "export_btn");
    this._saveLocalButtonNode.name = "save_local_btn";
    this._setButtonLabel(this._saveLocalButtonNode, "保存本地");
    this._bindActionButton(this._saveLocalButtonNode, this._onSaveLocalTap.bind(this));
    this._syncCloudButtonNode = this._createEditorActionButton(
      "sync_cloud_btn",
      "同步云端",
      178,
      -607,
      this._onSyncCloudTap.bind(this)
    );
    this._createEditorActionButton(
      "back_btn",
      "返回",
      -290,
      -320,
      this._onBackTap.bind(this)
    );
    this._statusLabel = this._createStatusLabel();
    this._editorTipLabel = this._createEditorTipLabel();

    this._selectMapNode = requireNode(this.node, "select_map");
    this._mapIdLabel = requireComponent(requireNode(this._selectMapNode, "map_id"), cc.Label);
    this._bindSelectMapButton(this._selectMapNode);

    this._honeycombTemplate.active = false;
    this.rebuildBoard(this._readRowCountFromInput());
    this._selectTool({ kind: "color", layoutName: "ball_layot", nodeName: "red", colorCode: "R" });
    this._setStatusText("请选择线上关卡进行编辑");
    this._openOnlineLevelPicker();
  },

  onDestroy: function () {
    var inputLevelNode = this._inputLevelEditBox && this._inputLevelEditBox.node;
    if (inputLevelNode && inputLevelNode.isValid) {
      inputLevelNode.off("editing-did-ended", this._onInputLevelEditingDidEnded, this);
    }
    if (this._checkerboardNode && this._checkerboardNode.isValid) {
      this._checkerboardNode.off(cc.Node.EventType.TOUCH_START, this._onBoardPaintStart, this);
      this._checkerboardNode.off(cc.Node.EventType.TOUCH_MOVE, this._onBoardPaintMove, this);
      this._checkerboardNode.off(cc.Node.EventType.TOUCH_END, this._onBoardPaintEnd, this);
      this._checkerboardNode.off(cc.Node.EventType.TOUCH_CANCEL, this._onBoardPaintCancel, this);
    }
    if (!this._levelPicker || typeof this._levelPicker.close !== "function") {
      throw new Error("MapEditorController destroy requires level picker.");
    }
    this._levelPicker.close();
  },

  _readRowCountFromInput: function () {
    var raw = this._rowInput.string;
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error("checkerboard_row 不能为空。");
    }
    var rowCount = Number(raw);
    if (!Number.isInteger(rowCount) || rowCount <= 0) {
      throw new Error("checkerboard_row 必须是正整数，当前值: " + raw);
    }
    return rowCount;
  },

  _syncBallCountInputFromLevel: function (level) {
    if (!level || typeof level !== "object" || Array.isArray(level)) {
      throw new Error("显示发射球数量时 level 配置非法。");
    }
    if (!this._ballCountInput) {
      throw new Error("显示发射球数量时缺少 input_ball_num。");
    }
    if (level.playMode === "shot_limited") {
      if (!Number.isInteger(level.shotLimit) || level.shotLimit <= 0) {
        throw new Error("有限发射关卡的 level.shotLimit 必须是正整数。");
      }
      this._ballCountInput.enabled = true;
      this._ballCountInput.placeholder = "发射球数量";
      this._ballCountInput.string = String(level.shotLimit);
    } else if (level.playMode === "timed_infinite_shots") {
      this._ballCountInput.string = "";
      this._ballCountInput.placeholder = "无限发射";
      this._ballCountInput.enabled = false;
    } else {
      throw new Error("不支持的关卡发射模式: " + String(level.playMode));
    }
  },

  _applyBallCountInputToLevel: function (level) {
    if (!level || typeof level !== "object" || Array.isArray(level)) {
      throw new Error("配置发射球数量时 level 配置非法。");
    }
    if (!this._ballCountInput || typeof this._ballCountInput.string !== "string") {
      throw new Error("配置发射球数量时缺少 input_ball_num。");
    }
    var rawValue = this._ballCountInput.string.trim();
    if (level.playMode === "shot_limited") {
      if (!/^[1-9]\d*$/.test(rawValue)) {
        throw new Error("发射球数量必须是正整数。");
      }
      level.shotLimit = Number(rawValue);
    } else if (level.playMode === "timed_infinite_shots") {
      if (rawValue !== "") {
        throw new Error("无限发射关卡不能配置发射球数量。");
      }
      if (Object.prototype.hasOwnProperty.call(level, "shotLimit")) {
        delete level.shotLimit;
      }
    } else {
      throw new Error("不支持的关卡发射模式: " + String(level.playMode));
    }
  },

  _bindColorPalette: function (layoutNode, layoutName, toolKind) {
    var children = layoutNode.children.slice();
    children.forEach(function (childNode) {
      var colorCode = COLOR_NODE_TO_CODE[childNode.name];
      if (!colorCode) {
        throw new Error(layoutName + " 子节点 `" + childNode.name + "` 未配置颜色映射。");
      }

      if (toolKind === "color") {
        this._bindToolButton(childNode, {
          kind: "color",
          layoutName: layoutName,
          nodeName: childNode.name,
          colorCode: colorCode
        });
        return;
      }

      if (toolKind === "splitter") {
        this._bindToolButton(childNode, {
          kind: "splitter",
          layoutName: layoutName,
          nodeName: childNode.name,
          colorCode: colorCode,
          specialDef: {
            entityCategory: "reactive_ball",
            entityType: "splitter"
          }
        });
        return;
      }

      throw new Error("未知 color palette toolKind: " + toolKind);
    }.bind(this));
  },

  _bindPalette: function (layoutNode, paletteKind) {
    var children = layoutNode.children.slice();
    children.forEach(function (childNode) {
      if (paletteKind === "color") {
        throw new Error("请使用 _bindColorPalette 绑定颜色/分裂球 palette。");
      }

      var specialDef = SPECIAL_TOOL_DEFS[childNode.name];
      if (!specialDef) {
        throw new Error("prop_layot 子节点 `" + childNode.name + "` 未配置特殊实体映射。");
      }
      this._bindToolButton(childNode, {
        kind: "special",
        layoutName: "prop_layot",
        nodeName: childNode.name,
        specialDef: specialDef
      });
    }.bind(this));
  },

  _bindToolButton: function (node, toolDef) {
    var button = node.getComponent(cc.Button);
    if (!button) {
      button = node.addComponent(cc.Button);
      button.transition = cc.Button.Transition.SCALE;
      button.zoomScale = 1.08;
    }
    node.on("click", function () {
      this._selectTool(toolDef);
    }, this);
    this._paletteNodes.push({
      node: node,
      toolDef: toolDef
    });
  },

  _bindActionButton: function (node, handler) {
    var button = node.getComponent(cc.Button);
    if (!button) {
      throw new Error("MapEditor action node `" + node.name + "` 缺少 cc.Button。");
    }
    node.on("click", handler, this);
  },

  _setButtonLabel: function (buttonNode, text) {
    if (!buttonNode || !buttonNode.isValid) {
      throw new Error("MapEditor button node 无效。");
    }
    if (typeof text !== "string" || !text) {
      throw new Error("MapEditor button label 不能为空。");
    }
    var backgroundNode = requireNode(buttonNode, "Background");
    var label = requireComponent(requireNode(backgroundNode, "Label"), cc.Label);
    label.string = text;
  },

  _createEditorActionButton: function (name, labelText, x, y, handler) {
    if (typeof name !== "string" || !name) {
      throw new Error("MapEditor action button name 不能为空。");
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("MapEditor action button position 非法: " + name);
    }
    if (typeof handler !== "function") {
      throw new Error("MapEditor action button handler 必须是函数: " + name);
    }
    var buttonNode = cc.instantiate(this._saveLocalButtonNode);
    if (!buttonNode || !buttonNode.isValid) {
      throw new Error("MapEditor action button clone 失败: " + name);
    }
    buttonNode.name = name;
    buttonNode.parent = this.node;
    buttonNode.setPosition(x, y);
    buttonNode.off("click");
    this._setButtonLabel(buttonNode, labelText);
    this._bindActionButton(buttonNode, handler);
    return buttonNode;
  },

  _createStatusLabel: function () {
    var statusNode = new cc.Node("editor_status");
    statusNode.parent = this.node;
    statusNode.setContentSize(360, 36);
    statusNode.setPosition(-50, -335);
    var label = statusNode.addComponent(cc.Label);
    label.useSystemFont = true;
    label.fontFamily = "Arial";
    label.fontSize = 22;
    label.lineHeight = 28;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    return label;
  },

  _createEditorTipLabel: function () {
    var tipNode = new cc.Node("editor_tip");
    tipNode.parent = this.node;
    tipNode.zIndex = 2000;
    tipNode.setContentSize(620, 92);
    tipNode.setPosition(0, -250);
    tipNode.color = cc.color(255, 96, 96, 255);
    var label = tipNode.addComponent(cc.Label);
    label.useSystemFont = true;
    label.fontFamily = "Arial";
    label.fontSize = 26;
    label.lineHeight = 32;
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    label.overflow = cc.Label.Overflow.SHRINK;
    label.enableWrapText = true;
    var outline = tipNode.addComponent(cc.LabelOutline);
    outline.color = cc.color(44, 18, 18, 255);
    outline.width = 3;
    tipNode.active = false;
    return label;
  },

  _showEditorTip: function (message) {
    if (typeof message !== "string" || !message.trim()) {
      throw new Error("编辑器提示语不能为空。");
    }
    if (!this._editorTipLabel || !this._editorTipLabel.node || !this._editorTipLabel.node.isValid) {
      throw new Error("编辑器提示节点未初始化。");
    }
    var tipText = message.trim();
    var tipNode = this._editorTipLabel.node;
    tipNode.stopAllActions();
    tipNode.active = true;
    tipNode.opacity = 255;
    this._editorTipLabel.string = tipText;
    this._setStatusText(tipText);
    tipNode.runAction(cc.sequence(
      cc.delayTime(EDITOR_TIP_STAY_DURATION),
      cc.fadeOut(EDITOR_TIP_FADE_DURATION),
      cc.callFunc(function () {
        tipNode.active = false;
      })
    ));
    return true;
  },

  _showSaveValidationTip: function (message) {
    if (typeof message !== "string" || !message.trim()) {
      throw new Error("保存校验提示语不能为空。");
    }
    return this._showEditorTip("保存失败：" + message.trim());
  },

  _setStatusText: function (text) {
    if (!this._statusLabel || !this._statusLabel.node || !this._statusLabel.node.isValid) {
      throw new Error("MapEditor status label 未初始化。");
    }
    if (typeof text !== "string" || !text) {
      throw new Error("MapEditor status text 不能为空。");
    }
    this._statusLabel.string = text;
  },

  _bindSelectMapButton: function (node) {
    var button = node.getComponent(cc.Button);
    if (!button) {
      button = node.addComponent(cc.Button);
      button.transition = cc.Button.Transition.SCALE;
      button.zoomScale = 1.05;
    }
    node.on("click", this._onSelectMapTap, this);
  },

  _ensureLevelCatalog: function () {
    if (!this._levelCatalog || typeof this._levelCatalog.loadLevelIndex !== "function") {
      throw new Error("MapEditor online level catalog 未初始化。");
    }
    return this._levelCatalog;
  },

  _setMapIdLabel: function (levelId) {
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("map_id levelId 必须是正整数。");
    }
    this._mapIdLabel.string = "第" + levelId + "关";
    this._inputLevelEditBox.string = String(levelId);
  },

  _readInputLevelId: function () {
    if (!this._inputLevelEditBox || typeof this._inputLevelEditBox.string !== "string") {
      throw new Error("input_level EditBox 未初始化。");
    }
    var raw = this._inputLevelEditBox.string.trim();
    if (!/^\d+$/.test(raw)) {
      throw new Error("请输入有效的关卡ID。");
    }
    var levelId = Number(raw);
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("关卡ID必须是正整数。");
    }
    if (!Array.isArray(this._availableLevelIds) || this._availableLevelIds.length === 0) {
      throw new Error("线上关卡列表尚未加载完成。");
    }
    if (this._availableLevelIds.indexOf(levelId) === -1) {
      throw new Error("关卡ID不在可选范围内：" + levelId);
    }
    return levelId;
  },

  _onInputLevelEditingDidEnded: function () {
    var levelId = 0;
    try {
      levelId = this._readInputLevelId();
    } catch (error) {
      if (!(error instanceof Error) || typeof error.message !== "string" || !error.message) {
        throw new Error("input_level 校验阶段抛出了非法异常。");
      }
      return this._showEditorTip(error.message);
    }
    this._levelPicker.close();
    this._setStatusText("正在加载第 " + levelId + " 关...");
    return this._loadLevelIntoEditor(levelId).catch(function (error) {
      this._showEditorTip("加载关卡失败：" + error.message);
      throw error;
    }.bind(this));
  },

  _onSelectMapTap: function () {
    this._openOnlineLevelPicker();
  },

  _openOnlineLevelPicker: function () {
    if (this._onlinePickerOpenPromise) {
      return this._onlinePickerOpenPromise;
    }
    var catalog = this._ensureLevelCatalog();
    this._setStatusText("正在读取线上关卡列表...");
    this._onlinePickerOpenPromise = catalog.loadLevelIndex().then(function (levelIds) {
      this._availableLevelIds = levelIds.slice();
      var selectedLevelId = this._currentLevelId;
      if (!selectedLevelId) {
        selectedLevelId = levelIds[0];
      }
      this._levelPicker.open(levelIds, selectedLevelId, function (levelId) {
        this._loadLevelIntoEditor(levelId).catch(function (error) {
          this._setStatusText("加载关卡失败: " + error.message);
          throw error;
        }.bind(this));
      }.bind(this));
      this._setStatusText("线上关卡列表已加载，共 " + levelIds.length + " 关");
      this._onlinePickerOpenPromise = null;
      return levelIds;
    }.bind(this)).catch(function (error) {
      this._onlinePickerOpenPromise = null;
      this._setStatusText("读取线上关卡失败: " + error.message);
      throw error;
    }.bind(this));
    return this._onlinePickerOpenPromise;
  },

  _resolvePreferredLevelSource: function (levelId) {
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("加载编辑关卡时 levelId 必须是正整数。");
    }
    if (!this._localEditedLevelStore || typeof this._localEditedLevelStore.hasLevel !== "function") {
      throw new Error("MapEditor 本地草稿存储缺少 hasLevel 接口。");
    }
    return this._localEditedLevelStore.hasLevel(levelId) ? "local" : "online";
  },

  _loadLevelIntoEditor: function (levelId) {
    var catalog = this._ensureLevelCatalog();
    return Promise.resolve().then(function () {
      var source = this._resolvePreferredLevelSource(levelId);
      if (source === "local") {
        return {
          source: source,
          levelConfig: this._localEditedLevelStore.loadLevel(levelId)
        };
      }
      if (source !== "online") {
        throw new Error("MapEditor 未知关卡来源: " + source);
      }
      return catalog.loadLevelConfig(levelId).then(function (levelConfig) {
        return {
          source: source,
          levelConfig: levelConfig
        };
      });
    }.bind(this)).then(function (loadResult) {
      if (!loadResult || (loadResult.source !== "local" && loadResult.source !== "online")) {
        throw new Error("MapEditor 关卡加载结果来源非法。");
      }
      var levelConfig = loadResult.levelConfig;
      var imported = MapEditorBoardImport.importLevelToCellStates(levelConfig);
      this._editingLevelConfig = levelConfig;
      this._currentLevelId = levelId;
      this._setMapIdLabel(levelId);
      this._rowInput.string = String(imported.rowCount);
      this._syncBallCountInputFromLevel(levelConfig.level);
      this._applyImportedBoard(imported.rowCount, imported.cells, imported.nonCellSpecialOverlays);
      cc.log("[MapEditor] 已加载关卡", levelId, loadResult.source);
      this._setStatusText(loadResult.source === "local"
        ? "已优先加载第 " + levelId + " 关本地草稿，可继续修改并保存"
        : "第 " + levelId + " 关无本地草稿，已加载线上关卡");
      return levelConfig;
    }.bind(this));
  },

  _applyImportedBoard: function (rowCount, cells, nonCellSpecialOverlays) {
    if (!nonCellSpecialOverlays || typeof nonCellSpecialOverlays !== "object" || Array.isArray(nonCellSpecialOverlays)) {
      throw new Error("导入关卡缺少 nonCellSpecialOverlays 覆盖层数据。");
    }
    this.rebuildBoard(rowCount);
    Object.keys(cells).forEach(function (key) {
      if (!this._cells[key]) {
        throw new Error("导入格子超出棋盘范围: " + key);
      }
      this._cells[key] = cells[key];
      this._syncCellVisual(key);
    }.bind(this));
    Object.keys(nonCellSpecialOverlays).forEach(function (key) {
      if (!this._cells[key]) {
        throw new Error("导入非占位特殊实体覆盖层超出棋盘范围: " + key);
      }
      if (this._cells[key].kind !== "empty") {
        throw new Error("导入非占位特殊实体坐标必须保持为空格: " + key);
      }
      this._nonCellSpecialOverlays[key] = nonCellSpecialOverlays[key];
      this._syncCellVisual(key);
    }.bind(this));
  },

  _selectTool: function (toolDef) {
    this._selectedTool = toolDef;
    if (toolDef.kind === "color" || toolDef.kind === "splitter") {
      this._selectedColorCode = toolDef.colorCode;
    }
    this._refreshPaletteVisual();
  },

  _refreshPaletteVisual: function () {
    this._paletteNodes.forEach(function (entry) {
      var selected = this._isSameTool(entry.toolDef, this._selectedTool);
      entry.node.scale = selected ? PALETTE_SELECTED_SCALE : PALETTE_NORMAL_SCALE;
      entry.node.opacity = selected ? 255 : 190;
    }.bind(this));
  },

  _isSameTool: function (left, right) {
    if (!left || !right) {
      return false;
    }
    if (left.kind !== right.kind) {
      return false;
    }
    if (left.kind === "color" || left.kind === "special" || left.kind === "splitter") {
      return left.layoutName === right.layoutName && left.nodeName === right.nodeName;
    }
    return left.kind === "erase" && right.kind === "erase";
  },

  rebuildBoard: function (rowCount) {
    if (!Number.isInteger(rowCount) || rowCount <= 0) {
      throw new Error("rebuildBoard rowCount 必须是正整数。");
    }

    this._rowCount = rowCount;
    this._cells = {};
    this._nonCellSpecialOverlays = {};
    this._cellNodes = {};
    this._clearCellNodes();
    this._applyCheckerboardLayout(rowCount);

    for (var row = 0; row < rowCount; row += 1) {
      var columnCount = BoardLayout.getRowColumnCount(row, MAX_COLUMNS);
      for (var col = 0; col < columnCount; col += 1) {
        var key = cellStateKey(row, col);
        this._cells[key] = createEmptyCellState();
        this._cellNodes[key] = this._createCellNode(row, col);
      }
    }
  },

  _clearCellNodes: function () {
    var children = this._checkerboardNode.children.slice();
    children.forEach(function (childNode) {
      if (childNode === this._honeycombTemplate) {
        return;
      }
      if (childNode.name.indexOf("cell_") === 0) {
        childNode.destroy();
      }
    }.bind(this));
  },

  _resolveBoardHeight: function (rowCount) {
    return BoardLayout.bubbleDiameter + (rowCount - 1) * BoardLayout.rowHeight;
  },

  _applyCheckerboardLayout: function (rowCount) {
    var boardHeight = this._resolveBoardHeight(rowCount);
    var boardWidth = this._checkerboardNode.width;
    if (!Number.isFinite(boardWidth) || boardWidth <= 0) {
      throw new Error("checkerboard 宽度非法。");
    }

    this._checkerboardNode.setContentSize(boardWidth, boardHeight);

    var canvasSize = this.node.getContentSize();
    var canvasTopY = canvasSize.height * 0.5;
    this._checkerboardNode.y = canvasTopY - boardHeight * 0.5;

    if (this._checkerboardWidget) {
      this._checkerboardWidget.isAlignTop = true;
      this._checkerboardWidget.isAlignBottom = false;
      this._checkerboardWidget.isAlignLeft = true;
      this._checkerboardWidget.isAlignRight = true;
      this._checkerboardWidget.top = 0;
      this._checkerboardWidget.left = 0;
      this._checkerboardWidget.right = 0;
      this._checkerboardWidget.updateAlignment();
    }
  },

  _createCellNode: function (row, col) {
    var position = this._resolveCellLocalPosition(row, col);
    var cellNode = new cc.Node("cell_" + row + "_" + col);
    cellNode.parent = this._checkerboardNode;
    cellNode.setContentSize(this._honeycombTemplate.getContentSize());
    cellNode.setPosition(position.x, position.y);

    var honeycombNode = new cc.Node("honeycomb");
    honeycombNode.parent = cellNode;
    var honeycombSprite = honeycombNode.addComponent(cc.Sprite);
    honeycombSprite.spriteFrame = cloneSpriteFrame(this._honeycombTemplateSprite);
    honeycombSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    honeycombNode.setContentSize(this._honeycombTemplate.getContentSize());

    var contentNode = new cc.Node("content");
    contentNode.parent = cellNode;
    contentNode.active = false;
    var contentSprite = contentNode.addComponent(cc.Sprite);
    contentSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    contentNode.setContentSize(this._honeycombTemplate.getContentSize());

    var nonCellSpecialNode = new cc.Node("non_cell_special_overlay");
    nonCellSpecialNode.parent = cellNode;
    nonCellSpecialNode.active = false;
    var nonCellSpecialSprite = nonCellSpecialNode.addComponent(cc.Sprite);
    nonCellSpecialSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    nonCellSpecialNode.setContentSize(WORMHOLE_RENDER_SIZE, WORMHOLE_RENDER_SIZE);
    nonCellSpecialNode.setSiblingIndex(contentNode.getSiblingIndex());

    return cellNode;
  },

  _bindBoardPaintInput: function () {
    this._checkerboardNode.on(cc.Node.EventType.TOUCH_START, this._onBoardPaintStart, this);
    this._checkerboardNode.on(cc.Node.EventType.TOUCH_MOVE, this._onBoardPaintMove, this);
    this._checkerboardNode.on(cc.Node.EventType.TOUCH_END, this._onBoardPaintEnd, this);
    this._checkerboardNode.on(cc.Node.EventType.TOUCH_CANCEL, this._onBoardPaintCancel, this);
  },

  _resolveBoardTouchPoint: function (event) {
    if (!event || typeof event.getLocation !== "function") {
      throw new Error("MapEditor 棋盘绘制事件缺少触摸坐标。");
    }
    var worldPoint = event.getLocation();
    if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y)) {
      throw new Error("MapEditor 棋盘触摸坐标非法。");
    }
    var localPoint = this._checkerboardNode.convertToNodeSpaceAR(worldPoint);
    if (!localPoint || !Number.isFinite(localPoint.x) || !Number.isFinite(localPoint.y)) {
      throw new Error("MapEditor 棋盘本地触摸坐标非法。");
    }
    return localPoint;
  },

  _resolveCellKeyAtBoardPoint: function (point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error("MapEditor 棋盘命中检测坐标非法。");
    }
    var maxDistanceSquared = BoardLayout.bubbleRadius * BoardLayout.bubbleRadius;
    var nearestKey = null;
    var nearestDistanceSquared = Number.POSITIVE_INFINITY;
    Object.keys(this._cellNodes).forEach(function (key) {
      var cellNode = this._cellNodes[key];
      if (!cellNode || !cellNode.isValid) {
        throw new Error("MapEditor 棋盘命中检测发现无效格子节点: " + key);
      }
      var deltaX = point.x - cellNode.x;
      var deltaY = point.y - cellNode.y;
      var distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared <= maxDistanceSquared && distanceSquared < nearestDistanceSquared) {
        nearestKey = key;
        nearestDistanceSquared = distanceSquared;
      }
    }.bind(this));
    return nearestKey;
  },

  _paintCellKeyOnce: function (key) {
    if (key !== null) {
      if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(this._cells, key)) {
        throw new Error("MapEditor 滑动绘制命中了非法格子: " + String(key));
      }
      if (this._boardPaintVisitedKeys[key] !== true) {
        var coordinates = key.split(":").map(Number);
        if (coordinates.length !== 2 || !Number.isInteger(coordinates[0]) || !Number.isInteger(coordinates[1])) {
          throw new Error("MapEditor 滑动绘制格子坐标非法: " + key);
        }
        this._onCellTap(coordinates[0], coordinates[1]);
        this._boardPaintVisitedKeys[key] = true;
      }
    }
  },

  _paintBoardSegment: function (startPoint, endPoint) {
    if (!startPoint || !endPoint ||
        !Number.isFinite(startPoint.x) || !Number.isFinite(startPoint.y) ||
        !Number.isFinite(endPoint.x) || !Number.isFinite(endPoint.y)) {
      throw new Error("MapEditor 滑动绘制线段坐标非法。");
    }
    var deltaX = endPoint.x - startPoint.x;
    var deltaY = endPoint.y - startPoint.y;
    var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    var sampleStep = BoardLayout.bubbleRadius * 0.5;
    if (!Number.isFinite(sampleStep) || sampleStep <= 0) {
      throw new Error("MapEditor 滑动绘制采样间距非法。");
    }
    var sampleCount = Math.max(1, Math.ceil(distance / sampleStep));
    for (var index = 0; index <= sampleCount; index += 1) {
      var ratio = index / sampleCount;
      var point = {
        x: startPoint.x + deltaX * ratio,
        y: startPoint.y + deltaY * ratio
      };
      this._paintCellKeyOnce(this._resolveCellKeyAtBoardPoint(point));
    }
  },

  _onBoardPaintStart: function (event) {
    if (!this._selectedTool) {
      throw new Error("滑动绘制前必须选择绘制工具。");
    }
    var point = this._resolveBoardTouchPoint(event);
    this._boardPaintActive = true;
    this._boardPaintVisitedKeys = {};
    this._boardPaintPreviousPoint = point;
    this._paintBoardSegment(point, point);
  },

  _onBoardPaintMove: function (event) {
    if (this._boardPaintActive === true) {
      var point = this._resolveBoardTouchPoint(event);
      this._paintBoardSegment(this._boardPaintPreviousPoint, point);
      this._boardPaintPreviousPoint = point;
    }
  },

  _onBoardPaintEnd: function (event) {
    if (this._boardPaintActive === true) {
      var point = this._resolveBoardTouchPoint(event);
      this._paintBoardSegment(this._boardPaintPreviousPoint, point);
    }
    this._boardPaintActive = false;
    this._boardPaintPreviousPoint = null;
    this._boardPaintVisitedKeys = {};
  },

  _onBoardPaintCancel: function () {
    this._boardPaintActive = false;
    this._boardPaintPreviousPoint = null;
    this._boardPaintVisitedKeys = {};
  },

  _resolveCellLocalPosition: function (row, col) {
    var boardPos = BoardLayout.getCellPosition(row, col, MAX_COLUMNS, 0);
    var boardHeight = this._checkerboardNode.height;
    var topRowCenterY = boardHeight * 0.5 - BoardLayout.bubbleRadius;
    return {
      x: boardPos.x,
      y: topRowCenterY - row * BoardLayout.rowHeight
    };
  },

  _onCellTap: function (row, col) {
    if (!this._selectedTool) {
      throw new Error("未选择绘制工具。");
    }

    var key = cellStateKey(row, col);
    if (this._selectedTool.kind === "erase") {
      if (this._nonCellSpecialOverlays[key]) {
        delete this._nonCellSpecialOverlays[key];
        this._syncCellVisual(key);
        return;
      }
      this._cells[key] = createEmptyCellState();
      this._syncCellVisual(key);
      return;
    }

    if (this._selectedTool.kind === "color") {
      if (this._nonCellSpecialOverlays[key]) {
        throw new Error("普通球不能占用非占位特殊实体坐标，请先擦除覆盖层: " + key);
      }
      this._cells[key] = {
        kind: "color",
        colorCode: this._selectedTool.colorCode
      };
      this._syncCellVisual(key);
      return;
    }

    if (this._selectedTool.kind === "special") {
      if (isNonCellSpecialEntityType(this._selectedTool.specialDef.entityType)) {
        if (this._cells[key].kind !== "empty") {
          throw new Error("非占位特殊实体坐标必须为空，不能与普通球或特殊实体重叠: " + key);
        }
        this._nonCellSpecialOverlays[key] = this._buildSpecialCellState(this._selectedTool, row, col);
        this._syncCellVisual(key);
        return;
      }
      if (this._nonCellSpecialOverlays[key]) {
        throw new Error("占位特殊实体不能与非占位特殊实体使用同一坐标，请先擦除覆盖层: " + key);
      }
      this._cells[key] = this._buildSpecialCellState(this._selectedTool, row, col);
      this._syncCellVisual(key);
      return;
    }

    if (this._selectedTool.kind === "splitter") {
      if (this._nonCellSpecialOverlays[key]) {
        throw new Error("分裂球不能与非占位特殊实体使用同一坐标，请先擦除覆盖层: " + key);
      }
      this._cells[key] = this._buildSplitterCellState(this._selectedTool, row, col);
      this._syncCellVisual(key);
      return;
    }

    throw new Error("未知绘制工具: " + this._selectedTool.kind);
  },

  _buildSplitterCellState: function (toolDef, row, col) {
    if (row === TOP_BOARD_ROW_INDEX) {
      throw new Error("分裂球不能放在棋盘最顶行（row 0）。");
    }

    return {
      kind: "splitter",
      layoutName: toolDef.layoutName,
      nodeName: toolDef.nodeName,
      colorCode: toolDef.colorCode,
      entityCategory: toolDef.specialDef.entityCategory,
      entityType: toolDef.specialDef.entityType,
      id: "splitter_" + toolDef.colorCode + "_" + row + "_" + col
    };
  },

  _buildSpecialCellState: function (toolDef, row, col) {
    var specialDef = toolDef.specialDef;
    var state = {
      kind: "special",
      layoutName: toolDef.layoutName,
      nodeName: toolDef.nodeName,
      entityCategory: specialDef.entityCategory,
      entityType: specialDef.entityType
    };

    if (specialDef.requiresColor) {
      if (!this._selectedColorCode) {
        throw new Error("放置 `" + toolDef.nodeName + "` 前请先选中一个颜色球作为 innerColor / lockedColor。");
      }
      state.colorCode = this._selectedColorCode;
    }

    if (specialDef.entityType === "molotov") {
      state.blastRadius = specialDef.blastRadius;
    }
    if (specialDef.entityType === "wormhole") {
      state.moveDirection = specialDef.moveDirection;
    }

    state.id = specialDef.entityType + "_" + row + "_" + col;
    return state;
  },

  _syncCellVisual: function (key) {
    var cellNode = this._cellNodes[key];
    var cellState = this._cells[key];
    if (!cellNode || !cellState) {
      throw new Error("MapEditor cell visual sync failed for `" + key + "`.");
    }

    var contentNode = cellNode.getChildByName("content");
    var contentSprite = contentNode.getComponent(cc.Sprite);
    if (!contentSprite) {
      throw new Error("MapEditor cell `" + key + "` missing content sprite.");
    }

    if (cellState.kind === "empty") {
      contentNode.active = false;
      contentSprite.spriteFrame = null;
    } else {
      var iconNode = this._resolveIconSourceNode(cellState);
      var iconSprite = iconNode.getComponent(cc.Sprite);
      if (!iconSprite || !iconSprite.spriteFrame) {
        throw new Error("MapEditor icon node `" + iconNode.name + "` 缺少 spriteFrame。");
      }

      contentSprite.spriteFrame = iconSprite.spriteFrame;
      contentNode.active = true;
    }

    var nonCellSpecialNode = cellNode.getChildByName("non_cell_special_overlay");
    var nonCellSpecialSprite = nonCellSpecialNode && nonCellSpecialNode.getComponent(cc.Sprite);
    if (!nonCellSpecialNode || !nonCellSpecialSprite) {
      throw new Error("MapEditor cell `" + key + "` missing non-cell special overlay sprite.");
    }
    var nonCellSpecialState = this._nonCellSpecialOverlays[key];
    if (!nonCellSpecialState) {
      nonCellSpecialNode.active = false;
      nonCellSpecialSprite.spriteFrame = null;
      return;
    }
    if (!isNonCellSpecialEntityType(nonCellSpecialState.entityType)) {
      throw new Error("MapEditor non-cell special overlay state type invalid at `" + key + "`.");
    }
    var nonCellSpecialIconNode = this._resolveIconSourceNode(nonCellSpecialState);
    var nonCellSpecialIconSprite = nonCellSpecialIconNode.getComponent(cc.Sprite);
    if (!nonCellSpecialIconSprite || !nonCellSpecialIconSprite.spriteFrame) {
      throw new Error("MapEditor non-cell special icon node `" + nonCellSpecialIconNode.name + "` 缺少 spriteFrame。");
    }
    nonCellSpecialSprite.spriteFrame = nonCellSpecialIconSprite.spriteFrame;
    if (nonCellSpecialState.entityType === "wind_tunnel_entrance") {
      nonCellSpecialNode.setContentSize(WIND_TUNNEL_ENTRANCE_RENDER_SIZE.width, WIND_TUNNEL_ENTRANCE_RENDER_SIZE.height);
    } else {
      nonCellSpecialNode.setContentSize(WORMHOLE_RENDER_SIZE, WORMHOLE_RENDER_SIZE);
    }
    nonCellSpecialNode.active = true;
  },

  _resolveIconSourceNode: function (cellState) {
    if (cellState.kind === "color") {
      var colorNodeName = Object.keys(COLOR_NODE_TO_CODE).filter(function (nodeName) {
        return COLOR_NODE_TO_CODE[nodeName] === cellState.colorCode;
      })[0];
      if (!colorNodeName) {
        throw new Error("未找到颜色 `" + cellState.colorCode + "` 对应的 palette 节点。");
      }
      return requireNode(requireNode(this.node, "ball_layot"), colorNodeName);
    }

    if (cellState.kind === "splitter") {
      return requireNode(requireNode(this.node, cellState.layoutName), cellState.nodeName);
    }

    if (cellState.kind === "special") {
      return requireNode(requireNode(this.node, cellState.layoutName), cellState.nodeName);
    }

    throw new Error("无法解析 cell icon，kind=" + cellState.kind);
  },

  _onClearAllTap: function () {
    Object.keys(this._cells).forEach(function (key) {
      this._cells[key] = createEmptyCellState();
      delete this._nonCellSpecialOverlays[key];
      this._syncCellVisual(key);
    }.bind(this));
  },

  _onRebuildTap: function () {
    var rowCount = this._readRowCountFromInput();
    this.rebuildBoard(rowCount);
  },

  _onClearLocalTap: function () {
    if (this._isCloudSyncing) {
      return this._showEditorTip("云端草稿同步期间不能清理本地数据。");
    }
    if (!this._localEditedLevelStore || typeof this._localEditedLevelStore.clearAll !== "function") {
      throw new Error("MapEditor 本地草稿存储缺少 clearAll 接口。");
    }
    var clearResult = this._localEditedLevelStore.clearAll();
    if (!clearResult || !Number.isInteger(clearResult.removedCount) || clearResult.removedCount < 0) {
      throw new Error("MapEditor 清理本地草稿结果非法。");
    }
    if (clearResult.removedCount === 0) {
      return this._showEditorTip("当前没有本地关卡数据。");
    }
    return this._showEditorTip(
      "已清理 " + clearResult.removedCount + " 个本地关卡；重新选关将加载线上版本。"
    );
  },

  _onSaveLocalTap: function () {
    var levelId = this._currentLevelId;
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("保存本地前必须先选择一个线上关卡。");
    }
    var levelKey = "level_" + padLevelId(levelId);
    var normalizedConfig = null;
    try {
      var rawConfig = this._buildMergedLevelConfig(levelId);
      normalizedConfig = LevelConfigLoader.normalizeLevelConfig(rawConfig, levelKey);
    } catch (error) {
      if (!(error instanceof Error) || typeof error.message !== "string" || !error.message) {
        throw new Error("保存关卡校验阶段抛出了非法异常。");
      }
      return this._showSaveValidationTip(error.message);
    }
    var saveResult = this._localEditedLevelStore.saveLevel(normalizedConfig);
    this._editingLevelConfig = saveResult.config;
    this._setStatusText("第 " + levelId + " 关已保存到本地: " + saveResult.location);
    cc.log("[MapEditor] 本地保存完成", levelId, saveResult.location);
    return saveResult;
  },

  _onSyncCloudTap: function () {
    if (this._isCloudSyncing) {
      throw new Error("云端草稿同步任务已经在进行中。");
    }
    var levelId = this._currentLevelId;
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("同步云端前必须先选择一个关卡。");
    }
    if (!this._localEditedLevelStore.hasLevel(levelId)) {
      throw new Error("同步云端前必须先保存当前第 " + levelId + " 关到本地。");
    }
    if (typeof this._localEditedLevelStore.loadRecord !== "function") {
      throw new Error("MapEditor 本地草稿存储缺少 loadRecord 接口。");
    }
    var record = this._localEditedLevelStore.loadRecord(levelId);
    if (!record || record.levelId !== levelId) {
      throw new Error("MapEditor 当前关卡本地同步记录非法。");
    }
    this._isCloudSyncing = true;
    requireComponent(this._syncCloudButtonNode, cc.Button).interactable = false;
    this._setStatusText("正在同步第 " + levelId + " 关到云端草稿库...");
    return this._ensureLevelCatalog().loadCloudEnvId().then(function (cloudEnvId) {
      if (!this._cloudSyncService) {
        this._cloudSyncService = new LevelEditorCloudSyncService({
          cloudEnvId: cloudEnvId
        });
      }
      if (this._cloudSyncService.cloudEnvId !== cloudEnvId) {
        throw new Error("编辑器云同步环境与线上关卡环境不一致。");
      }
      return this._cloudSyncService.syncLevel(record);
    }.bind(this)).then(function (result) {
      this._isCloudSyncing = false;
      requireComponent(this._syncCloudButtonNode, cc.Button).interactable = true;
      this._setStatusText("第 " + levelId + " 关云端草稿同步完成");
      cc.log("[MapEditor] 云端草稿同步完成", result);
      return result;
    }.bind(this)).catch(function (error) {
      this._isCloudSyncing = false;
      requireComponent(this._syncCloudButtonNode, cc.Button).interactable = true;
      this._setStatusText("云端草稿同步失败: " + error.message);
      throw error;
    }.bind(this));
  },

  _onBackTap: function () {
    if (this._isCloudSyncing) {
      throw new Error("云端草稿同步期间不能离开编辑器。");
    }
    var accepted = cc.director.loadScene(EDITOR_SCENE_BACK_TARGET);
    if (accepted !== true) {
      throw new Error("返回 LevelView 失败，无法加载场景: " + EDITOR_SCENE_BACK_TARGET);
    }
  },

  _collectBoardData: function () {
    var layout = [];
    var colorSet = {};
    var specialEntities = [];
    var totalColorBalls = 0;
    var splitterColor = null;

    for (var row = 0; row < this._rowCount; row += 1) {
      var columnCount = BoardLayout.getRowColumnCount(row, MAX_COLUMNS);
      var rowChars = [];
      for (var col = 0; col < columnCount; col += 1) {
        var key = cellStateKey(row, col);
        var cellState = this._cells[key];
        if (!cellState) {
          throw new Error("保存时缺少格子状态: " + key);
        }
        var nonCellSpecialOverlay = this._nonCellSpecialOverlays[key];
        if (nonCellSpecialOverlay) {
          if (!isNonCellSpecialEntityType(nonCellSpecialOverlay.entityType)) {
            throw new Error("保存时非占位特殊实体覆盖层类型非法: " + key);
          }
          if (cellState.kind !== "empty") {
            throw new Error("保存时非占位特殊实体坐标必须保持为空格: " + key);
          }
          specialEntities.push(this._buildSpecialEntityExport(nonCellSpecialOverlay, row, col));
        }

        if (cellState.kind === "color") {
          rowChars.push(cellState.colorCode);
          colorSet[cellState.colorCode] = true;
          totalColorBalls += 1;
          continue;
        }

        rowChars.push(".");
        if (cellState.kind === "splitter") {
          colorSet[cellState.colorCode] = true;
          if (splitterColor !== null && splitterColor !== cellState.colorCode) {
            throw new Error("保存失败：同一关卡的分裂球 splitColor 必须一致。");
          }
          splitterColor = cellState.colorCode;
          specialEntities.push(this._buildSpecialEntityExport(cellState, row, col));
          continue;
        }

        if (cellState.kind === "special") {
          if (cellState.colorCode) {
            colorSet[cellState.colorCode] = true;
          }
          specialEntities.push(this._buildSpecialEntityExport(cellState, row, col));
        }
      }
      layout.push(rowChars.join(""));
    }

    var colors = Object.keys(colorSet);
    if (!colors.length) {
      throw new Error("保存失败：棋盘上没有任何颜色球。");
    }
    colors.sort();

    return {
      layout: layout,
      specialEntities: specialEntities,
      colors: colors,
      totalColorBalls: totalColorBalls,
      splitterColor: splitterColor
    };
  },

  _buildMergedLevelConfig: function (levelId) {
    if (!this._editingLevelConfig || !this._editingLevelConfig.level) {
      throw new Error("缺少已加载的线上关卡配置，无法保存本地草稿。");
    }
    if (this._editingLevelConfig.level.levelId !== levelId) {
      throw new Error("当前编辑关卡 id 与保存 id 不一致。");
    }

    var config = JSON.parse(JSON.stringify(this._editingLevelConfig));
    delete config.meta;
    var boardData = this._collectBoardData();

    this._applyBallCountInputToLevel(config.level);
    config.level.layout = boardData.layout;
    config.level.specialEntities = boardData.specialEntities;
    if (boardData.splitterColor !== null) {
      if (!Array.isArray(config.level.winConditions)) {
        throw new Error("保存分裂球关卡时 level.winConditions 必须是数组。");
      }
      var collectColorConditions = config.level.winConditions.filter(function (objective) {
        return objective && objective.type === "collect_color";
      });
      if (collectColorConditions.length !== 1) {
        throw new Error("保存分裂球关卡时 winConditions 必须且只能包含一个 collect_color 目标。");
      }
      collectColorConditions[0].color = boardData.splitterColor;
    }
    syncLevelColorsFromBoard(config.level, boardData.colors, levelId);

    return {
      schemaVersion: config.schemaVersion,
      gameMode: config.gameMode,
      coordinateSystem: config.coordinateSystem,
      layoutNotes: config.layoutNotes,
      sharedDefaults: config.sharedDefaults,
      level: config.level,
      difficultyScaleMax: config.difficultyScaleMax
    };
  },

  _buildSpecialEntityExport: function (cellState, row, col) {
    var entity = {
      id: cellState.id,
      entityCategory: cellState.entityCategory,
      entityType: cellState.entityType,
      row: row,
      col: col
    };

    if (cellState.entityType === "ice") {
      entity.innerColor = cellState.colorCode;
    }
    if (cellState.entityType === "locked") {
      entity.lockedColor = cellState.colorCode;
    }
    if (cellState.entityType === "splitter") {
      entity.splitColor = cellState.colorCode;
    }
    if (cellState.entityType === "molotov") {
      if (cellState.blastRadius !== 2) {
        throw new Error("molotov blastRadius 必须为 2。");
      }
      entity.blastRadius = cellState.blastRadius;
    }
    if (cellState.entityType === "wormhole") {
      if (cellState.moveDirection !== "left" && cellState.moveDirection !== "right") {
        throw new Error("wormhole moveDirection 必须是 left 或 right。");
      }
      entity.moveDirection = cellState.moveDirection;
    }

    return entity;
  },
});

module.exports = MapEditorController;
