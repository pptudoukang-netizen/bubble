"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var PROJECT_ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function assertFile(relativePath) {
  var fullPath = path.join(PROJECT_ROOT, relativePath);
  assert.strictEqual(fs.existsSync(fullPath), true, "Missing level editor file: " + relativePath);
  return fullPath;
}

function assertSourceContract() {
  var levelSelectSource = read("assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods.js");
  assert(levelSelectSource.indexOf("this._openMapEditorScene();") >= 0, "LevelView/test_btn must open the map editor scene.");
  assert(levelSelectSource.indexOf("gameBundle.loadScene(MAP_EDITOR_SCENE_PATH") >= 0, "Map editor scene must load from the game bundle.");
  assert(levelSelectSource.indexOf("_onLevelSelectLocalEditedLevelTap") >= 0, "LevelView must expose the local edited level list.");
  assert(levelSelectSource.indexOf("{ mode: \"test\", testSource: \"local\" }") >= 0, "Local edited levels must enter isolated test mode.");

  var levelViewSource = read("assets/scripts/bootstrap/LevelSelectView.js");
  assert(levelViewSource.indexOf("local_level_test_btn") >= 0, "LevelView must create local_level_test_btn.");
  assert(levelViewSource.indexOf("label.string = \"本地\"") >= 0, "Local edited level button must have visible local label.");

  var pickerSource = read("assets/scripts/editor/MapEditorLevelPicker.js");
  assert(pickerSource.indexOf("SpriteProxyLayerHelper.createProxyRoot") >= 0, "Level picker popup must use Sprite proxy roots.");
  assert(pickerSource.indexOf("setSpriteRenderEnabled(sourceNode, false") >= 0, "Level picker source Sprites must be disabled after proxying.");
  assert(pickerSource.indexOf("rowNode.__pickerLevelId") >= 0, "Virtual level picker rows must use their rebound level id.");
  assert(pickerSource.indexOf("content.setAnchorPoint(0.5, 1)") >= 0, "Level picker content must use a stable top anchor.");
  assert(pickerSource.indexOf("content.on(cc.Node.EventType.POSITION_CHANGED, this._updateVirtualRows, this)") >= 0, "Level picker must refresh virtual rows from actual content movement.");

  var controllerSource = read("assets/scripts/editor/MapEditorController.js");
  assert(controllerSource.indexOf("new MapEditorLevelCatalog()") >= 0, "Map editor must use the online level catalog.");
  assert(controllerSource.indexOf("saveLevel(normalizedConfig)") >= 0, "Map editor save must write the local edited level store.");
  assert(controllerSource.indexOf("syncLevels(records)") >= 0, "Map editor must sync local drafts to cloud.");
  assert.strictEqual(controllerSource.indexOf("_writeExportFile"), -1, "Map editor must not retain the old file export path.");
  assert.strictEqual(controllerSource.indexOf("_installExtendedSpecialPalette"), -1, "Editor special tools must come from serialized scene nodes.");
  assert(controllerSource.indexOf("hasLevel(levelId)") >= 0, "Map editor must check the local draft before loading an editable level.");
  assert(controllerSource.indexOf("已优先加载第 ") >= 0, "Map editor must identify a locally loaded draft in its status text.");
  assert(controllerSource.indexOf('node.on("editing-did-ended", this._onInputLevelEditingDidEnded, this)') >= 0, "input_level must select a level when editing ends.");
  assert(controllerSource.indexOf("this._availableLevelIds.indexOf(levelId)") >= 0, "input_level must reject ids outside the loaded online catalog.");
  assert(controllerSource.indexOf("this._localEditedLevelStore.clearAll()") >= 0, "clear_local must delete all saved local level drafts.");
  assert(controllerSource.indexOf("cc.Node.EventType.TOUCH_MOVE, this._onBoardPaintMove") >= 0, "Editor board must support drag painting.");
  assert(controllerSource.indexOf("this._paintBoardSegment(this._boardPaintPreviousPoint, point)") >= 0, "Editor drag painting must interpolate fast pointer movement.");
  assert(controllerSource.indexOf('requireNode(this.node, "input_ball_num")') >= 0, "Editor must bind input_ball_num.");
  assert(controllerSource.indexOf("this._applyBallCountInputToLevel(config.level)") >= 0, "Editor save must apply input_ball_num to shotLimit.");
  assert.strictEqual(controllerSource.indexOf("destroy requires input_level EditBox"), -1, "Editor destroy must tolerate input_level being destroyed before the component.");
  [
    'black: "K"',
    'orange: "O"',
    'white: "W"'
  ].forEach(function (mappingSource) {
    assert(controllerSource.indexOf(mappingSource) >= 0, "Map editor palette missing color mapping: " + mappingSource);
  });
  var boardImportSource = read("assets/scripts/editor/MapEditorBoardImport.js");
  [
    'black: "K"',
    'orange: "O"',
    'white: "W"'
  ].forEach(function (mappingSource) {
    assert(boardImportSource.indexOf(mappingSource) >= 0, "Map editor import missing color mapping: " + mappingSource);
  });
}

function assertAssets() {
  assertFile("assets/game/scens/editor.fire");
  assertFile("assets/game/scens/editor.fire.meta");
  assertFile("assets/game/image/editor/honeycomb.png");
  assertFile("assets/game/image/editor/honeycomb.png.meta");
  var sceneSource = read("assets/game/scens/editor.fire");
  assert(sceneSource.indexOf("f3a8bLBTV5vcIGSo7TF1uf4") >= 0, "Editor scene must mount MapEditorController.");
  assert(sceneSource.indexOf("86626e1a-cf7a-435e-9bd1-d69c51186d6e") >= 0, "Editor scene must reference the honeycomb SpriteFrame.");
  assert.strictEqual(sceneSource.indexOf("levelDataResourcePath"), -1, "Editor scene must not keep the obsolete local asset-folder catalog.");
  var sceneData = JSON.parse(sceneSource);
  var ballLayout = sceneData.find(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "ball_layot";
  });
  assert(ballLayout, "Editor scene must contain ball_layot.");
  var expectedExtendedColorTools = {
    black: "e54bab9d-414a-4f86-917c-36279555f14e",
    orange: "f3a90ff1-4e77-4f0c-b215-d7adce21b383",
    white: "28b64742-6845-4d93-929b-ab507bd2f0f5"
  };
  var ballChildren = ballLayout._children.map(function (childRef) {
    return sceneData[childRef.__id__];
  });
  Object.keys(expectedExtendedColorTools).forEach(function (toolName) {
    var toolNode = ballChildren.find(function (childNode) {
      return childNode && childNode._name === toolName;
    });
    assert(toolNode, "Editor scene ball_layot missing color tool: " + toolName);
    assert.strictEqual(toolNode._components.length, 1, "Editor color tool must have one Sprite: " + toolName);
    var sprite = sceneData[toolNode._components[0].__id__];
    assert(sprite && sprite.__type__ === "cc.Sprite", "Editor color tool must reference a Sprite: " + toolName);
    assert.strictEqual(sprite._spriteFrame.__uuid__, expectedExtendedColorTools[toolName], "Editor color SpriteFrame mismatch: " + toolName);
  });
  var propLayout = sceneData.find(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "prop_layot";
  });
  assert(propLayout, "Editor scene must contain prop_layot.");
  var expectedStaticTools = {
    molotov: "ada1d590-3913-4956-9f66-d8e04ddca734",
    swirl: "f1e1f9c0-222d-466b-bf8c-73d31b60301d",
    vine_spirit: "1797d01f-6210-45a6-90f9-ccdc8158fae3",
    wormhole_left: "04d628f6-0efc-45b5-9a60-5e95f19fa5a3",
    wormhole_right: "04d628f6-0efc-45b5-9a60-5e95f19fa5a3"
  };
  var propChildren = propLayout._children.map(function (childRef) {
    return sceneData[childRef.__id__];
  });
  Object.keys(expectedStaticTools).forEach(function (toolName) {
    var toolNode = propChildren.find(function (childNode) {
      return childNode && childNode._name === toolName;
    });
    assert(toolNode, "Editor scene prop_layot missing static tool: " + toolName);
    assert.strictEqual(toolNode._active, true, "Editor static tool must be active: " + toolName);
    assert.strictEqual(toolNode._components.length, 1, "Editor static tool must have one Sprite: " + toolName);
    var sprite = sceneData[toolNode._components[0].__id__];
    assert(sprite && sprite.__type__ === "cc.Sprite", "Editor static tool must reference a Sprite: " + toolName);
    assert.strictEqual(sprite._spriteFrame.__uuid__, expectedStaticTools[toolName], "Editor static tool SpriteFrame mismatch: " + toolName);
  });
  var inputLevelNode = sceneData.find(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "input_level";
  });
  var rowInputNode = sceneData.find(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "checkerboard_row";
  });
  var ballCountInputNode = sceneData.find(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "input_ball_num";
  });
  assert(inputLevelNode, "Editor scene must contain input_level.");
  assert(rowInputNode, "Editor scene must contain checkerboard_row.");
  assert(ballCountInputNode, "Editor scene must contain input_ball_num.");
  assert(
    inputLevelNode._trs.array[0] !== rowInputNode._trs.array[0] || inputLevelNode._trs.array[1] !== rowInputNode._trs.array[1],
    "input_level must not overlap checkerboard_row."
  );
  var inputLevelComponent = sceneData[inputLevelNode._components[0].__id__];
  assert(inputLevelComponent && inputLevelComponent.__type__ === "cc.EditBox", "input_level must contain cc.EditBox.");
  var ballCountInputComponent = sceneData[ballCountInputNode._components[0].__id__];
  assert(ballCountInputComponent && ballCountInputComponent.__type__ === "cc.EditBox", "input_ball_num must contain cc.EditBox.");
  var clearLocalNode = sceneData.find(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "clear_local";
  });
  assert(clearLocalNode, "Editor scene must contain clear_local.");
  var clearLocalButton = sceneData[clearLocalNode._components[0].__id__];
  assert(clearLocalButton && clearLocalButton.__type__ === "cc.Button", "clear_local must contain cc.Button.");
  var projectSettings = JSON.parse(read("settings/project.json"));
  assert(Array.isArray(projectSettings["excluded-modules"]), "settings/project.json excluded-modules must be an array.");
  assert.strictEqual(projectSettings["excluded-modules"].indexOf("EditBox"), -1, "Map editor requires the Cocos EditBox module.");
}

function createMemoryBackend() {
  var values = {};
  return {
    readText: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    writeText: function (key, text) {
      values[key] = text;
    },
    removeText: function (key) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) {
        return false;
      }
      delete values[key];
      return true;
    },
    describe: function () {
      return "memory";
    }
  };
}

function assertSplitterObjectiveAlignment() {
  var previousCc = global.cc;
  global.cc = {
    Class: function (definition) {
      return definition;
    },
    Component: function () {}
  };
  try {
    var controllerPath = path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorController");
    delete require.cache[require.resolve(controllerPath)];
    var controllerDefinition = require(controllerPath);
    var sourceConfig = JSON.parse(read("assets/map/config/levels/level_001.json"));
    var boardData = {
      layout: sourceConfig.level.layout.slice(),
      specialEntities: [
        {
          id: "editor_splitter_regression",
          entityCategory: "reactive_ball",
          entityType: "splitter",
          row: 1,
          col: 0,
          splitColor: "R"
        }
      ],
      colors: sourceConfig.level.colors.slice(),
      totalColorBalls: 46,
      splitterColor: "R"
    };
    var merged = controllerDefinition._buildMergedLevelConfig.call({
      _editingLevelConfig: sourceConfig,
      _ballCountInput: { string: String(sourceConfig.level.shotLimit) },
      _applyBallCountInputToLevel: controllerDefinition._applyBallCountInputToLevel,
      _collectBoardData: function () {
        return boardData;
      }
    }, 1);
    var collectColorConditions = merged.level.winConditions.filter(function (objective) {
      return objective.type === "collect_color";
    });
    assert.strictEqual(collectColorConditions.length, 1, "Editor splitter save must preserve exactly one collect_color objective.");
    assert.strictEqual(collectColorConditions[0].color, "R", "Editor splitter save must align collect_color with splitColor.");
    assert.strictEqual(collectColorConditions[0].value, 23, "Editor splitter save must preserve the configured collect target value.");
    var LevelConfigLoader = require(path.join(PROJECT_ROOT, "assets/scripts/config/LevelConfigLoader"));
    LevelConfigLoader.normalizeLevelConfig(merged, "level_001");

    var extendedLayout = sourceConfig.level.layout.slice();
    extendedLayout[0] = "KOW" + extendedLayout[0].slice(3);
    var extendedMerged = controllerDefinition._buildMergedLevelConfig.call({
      _editingLevelConfig: sourceConfig,
      _ballCountInput: { string: String(sourceConfig.level.shotLimit) },
      _applyBallCountInputToLevel: controllerDefinition._applyBallCountInputToLevel,
      _collectBoardData: function () {
        return {
          layout: extendedLayout,
          specialEntities: [],
          colors: ["R", "B", "K", "O", "W"],
          totalColorBalls: 46,
          splitterColor: null
        };
      }
    }, 1);
    assert.deepStrictEqual(
      extendedMerged.level.colors,
      ["R", "B", "K", "O", "W"],
      "Editor save must preserve black, orange, and white palette colors."
    );
    ["K", "O", "W"].forEach(function (colorCode) {
      assert(
        typeof extendedMerged.level.spawnWeights[colorCode] === "number" && extendedMerged.level.spawnWeights[colorCode] > 0,
        "Editor save must create a positive spawn weight for " + colorCode + "."
      );
    });
    LevelConfigLoader.normalizeLevelConfig(extendedMerged, "level_001");
  } finally {
    if (previousCc === undefined) {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function assertArbitraryPaletteColorsUpdateLevelConfig() {
  var previousCc = global.cc;
  global.cc = {
    Class: function (definition) {
      return definition;
    },
    Component: function () {}
  };
  try {
    var controllerPath = path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorController");
    delete require.cache[require.resolve(controllerPath)];
    var controllerDefinition = require(controllerPath);
    var sourceConfig = JSON.parse(read("assets/map/config/levels/level_001.json"));
    var yellowLayout = sourceConfig.level.layout.slice();
    yellowLayout[0] = yellowLayout[0].slice(0, 2) + "Y" + yellowLayout[0].slice(3);
    var merged = controllerDefinition._buildMergedLevelConfig.call({
      _editingLevelConfig: sourceConfig,
      _ballCountInput: { string: String(sourceConfig.level.shotLimit) },
      _applyBallCountInputToLevel: controllerDefinition._applyBallCountInputToLevel,
      _collectBoardData: function () {
        return {
          layout: yellowLayout,
          specialEntities: [],
          colors: ["B", "R", "Y"],
          totalColorBalls: 46,
          splitterColor: null
        };
      }
    }, 1);
    assert.deepStrictEqual(merged.level.colors, ["R", "B", "Y"], "Editor save must add any palette color used by the board.");
    assert.strictEqual(merged.level.colorCount, 3, "Editor save must keep colorCount aligned with board colors.");
    assert.strictEqual(merged.level.spawnWeights.R, sourceConfig.level.spawnWeights.R, "Editor save must preserve an existing red spawn weight.");
    assert.strictEqual(merged.level.spawnWeights.B, sourceConfig.level.spawnWeights.B, "Editor save must preserve an existing blue spawn weight.");
    assert.strictEqual(merged.level.spawnWeights.Y, 1, "Editor save must assign the campaign rule weight to a newly used yellow color.");
    var LevelConfigLoader = require(path.join(PROJECT_ROOT, "assets/scripts/config/LevelConfigLoader"));
    LevelConfigLoader.normalizeLevelConfig(merged, "level_001");

    var redOnlyLayout = sourceConfig.level.layout.map(function (rowString) {
      return rowString.replace(/B/g, "R");
    });
    var conflicting = controllerDefinition._buildMergedLevelConfig.call({
      _editingLevelConfig: sourceConfig,
      _ballCountInput: { string: String(sourceConfig.level.shotLimit) },
      _applyBallCountInputToLevel: controllerDefinition._applyBallCountInputToLevel,
      _collectBoardData: function () {
        return {
          layout: redOnlyLayout,
          specialEntities: [],
          colors: ["R"],
          totalColorBalls: 46,
          splitterColor: null
        };
      }
    }, 1);
    assert.throws(function () {
      LevelConfigLoader.normalizeLevelConfig(conflicting, "level_001");
    }, /winConditions\[0\]\.color must exist in level\.colors/, "Editor save must still expose a real collect-target color conflict.");

    var levelTwoConfig = JSON.parse(read("assets/map/config/levels/level_002.json"));
    var levelTwoLayoutWithoutGreen = levelTwoConfig.level.layout.map(function (rowString) {
      return rowString.replace(/G/g, "B");
    });
    var levelTwoMerged = controllerDefinition._buildMergedLevelConfig.call({
      _editingLevelConfig: levelTwoConfig,
      _ballCountInput: { string: String(levelTwoConfig.level.shotLimit) },
      _applyBallCountInputToLevel: controllerDefinition._applyBallCountInputToLevel,
      _collectBoardData: function () {
        return {
          layout: levelTwoLayoutWithoutGreen,
          specialEntities: [],
          colors: ["R", "B"],
          totalColorBalls: 63,
          splitterColor: null
        };
      }
    }, 2);
    assert.deepStrictEqual(
      levelTwoMerged.level.openingShotBalls,
      ["R", "B", "R", "B"],
      "Editor save must rebuild level 2 opening shots after green is removed from the board."
    );
    LevelConfigLoader.normalizeLevelConfig(levelTwoMerged, "level_002");
  } finally {
    if (previousCc === undefined) {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function assertBoardDragPaintsContinuousCells() {
  var previousCc = global.cc;
  global.cc = {
    Class: function (definition) {
      return definition;
    },
    Component: function () {}
  };
  try {
    var controllerPath = path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorController");
    delete require.cache[require.resolve(controllerPath)];
    var controllerDefinition = require(controllerPath);
    var paintedKeys = [];
    var fakeController = {
      _cellNodes: {
        "0:0": { isValid: true, x: 0, y: 0 },
        "0:1": { isValid: true, x: 60, y: 0 },
        "0:2": { isValid: true, x: 120, y: 0 }
      },
      _cells: {
        "0:0": {},
        "0:1": {},
        "0:2": {}
      },
      _boardPaintVisitedKeys: {},
      _resolveCellKeyAtBoardPoint: controllerDefinition._resolveCellKeyAtBoardPoint,
      _paintCellKeyOnce: controllerDefinition._paintCellKeyOnce,
      _onCellTap: function (row, col) {
        paintedKeys.push(row + ":" + col);
      }
    };
    controllerDefinition._paintBoardSegment.call(fakeController, { x: 0, y: 0 }, { x: 120, y: 0 });
    assert.deepStrictEqual(paintedKeys, ["0:0", "0:1", "0:2"], "A fast drag must continuously paint every crossed board cell once.");
    controllerDefinition._paintBoardSegment.call(fakeController, { x: 120, y: 0 }, { x: 0, y: 0 });
    assert.deepStrictEqual(paintedKeys, ["0:0", "0:1", "0:2"], "A single drag must not repaint already visited cells.");
  } finally {
    if (previousCc === undefined) {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function assertBallCountInputDisplaysAndConfiguresShotLimit() {
  var previousCc = global.cc;
  global.cc = {
    Class: function (definition) {
      return definition;
    },
    Component: function () {}
  };
  try {
    var controllerPath = path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorController");
    delete require.cache[require.resolve(controllerPath)];
    var controllerDefinition = require(controllerPath);
    var sourceConfig = JSON.parse(read("assets/map/config/levels/level_001.json"));
    var input = { string: "", placeholder: "", enabled: false };
    controllerDefinition._syncBallCountInputFromLevel.call({
      _ballCountInput: input
    }, sourceConfig.level);
    assert.strictEqual(input.string, String(sourceConfig.level.shotLimit), "input_ball_num must display the loaded shotLimit.");
    assert.strictEqual(input.enabled, true, "input_ball_num must be editable for shot_limited levels.");

    input.string = "37";
    var editedLevel = JSON.parse(JSON.stringify(sourceConfig.level));
    controllerDefinition._applyBallCountInputToLevel.call({
      _ballCountInput: input
    }, editedLevel);
    assert.strictEqual(editedLevel.shotLimit, 37, "input_ball_num must update level.shotLimit.");

    ["", "0", "12.5", "abc"].forEach(function (invalidValue) {
      input.string = invalidValue;
      assert.throws(function () {
        controllerDefinition._applyBallCountInputToLevel.call({
          _ballCountInput: input
        }, JSON.parse(JSON.stringify(sourceConfig.level)));
      }, /发射球数量必须是正整数/, "input_ball_num must reject invalid value: " + invalidValue);
    });
  } finally {
    if (previousCc === undefined) {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function assertDestroyToleratesCocosChildDestructionOrder() {
  var previousCc = global.cc;
  global.cc = {
    Class: function (definition) {
      return definition;
    },
    Component: function () {},
    Node: {
      EventType: {
        TOUCH_START: "touch-start",
        TOUCH_MOVE: "touch-move",
        TOUCH_END: "touch-end",
        TOUCH_CANCEL: "touch-cancel"
      }
    }
  };
  try {
    var controllerPath = path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorController");
    delete require.cache[require.resolve(controllerPath)];
    var controllerDefinition = require(controllerPath);
    var closeCount = 0;
    controllerDefinition.onDestroy.call({
      _inputLevelEditBox: {
        node: {
          isValid: false,
          off: function () {
            throw new Error("Destroyed input_level must not be unbound.");
          }
        }
      },
      _checkerboardNode: {
        isValid: false,
        off: function () {
          throw new Error("Destroyed checkerboard must not be unbound.");
        }
      },
      _levelPicker: {
        close: function () {
          closeCount += 1;
        }
      }
    });
    assert.strictEqual(closeCount, 1, "Editor destroy must still release the level picker after child nodes are destroyed.");

    var inputOffCount = 0;
    var boardOffCount = 0;
    controllerDefinition.onDestroy.call({
      _inputLevelEditBox: {
        node: {
          isValid: true,
          off: function () {
            inputOffCount += 1;
          }
        }
      },
      _checkerboardNode: {
        isValid: true,
        off: function () {
          boardOffCount += 1;
        }
      },
      _levelPicker: {
        close: function () {
          closeCount += 1;
        }
      }
    });
    assert.strictEqual(inputOffCount, 1, "Editor destroy must unbind input_level while it is still valid.");
    assert.strictEqual(boardOffCount, 4, "Editor destroy must unbind all board paint events while checkerboard is valid.");
    assert.strictEqual(closeCount, 2, "Editor destroy must close the level picker in both destruction orders.");
  } finally {
    if (previousCc === undefined) {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function createVirtualPickerRow() {
  var label = { string: "" };
  var bgNode = { color: null };
  return {
    active: false,
    y: 0,
    scale: 1,
    __pickerLevelId: 0,
    getChildByName: function (name) {
      if (name === "label") {
        return {
          getComponent: function () {
            return label;
          }
        };
      }
      if (name === "bg") {
        return bgNode;
      }
      throw new Error("Unexpected virtual picker child: " + name);
    },
    __label: label
  };
}

function assertVirtualPickerFollowsContentPosition() {
  var previousCc = global.cc;
  global.cc = {
    Class: function (definition) {
      return definition;
    },
    Component: function () {},
    color: function (r, g, b, a) {
      return { r: r, g: g, b: b, a: a };
    },
    Label: function () {}
  };
  try {
    var Picker = require(path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorLevelPicker"));
    var picker = new Picker({ isValid: true });
    picker._useVirtualList = true;
    picker._levelIds = Array.from({ length: 1000 }, function (_, index) {
      return index + 1;
    });
    picker._selectedLevelId = 0;
    picker._contentNode = {
      isValid: true,
      height: 56000,
      y: 196 + (7 * 56)
    };
    picker._scrollView = {};
    picker._rowNodes = Array.from({ length: 11 }, createVirtualPickerRow);
    picker._rowProxyRoot = null;
    picker._titleLabel = {
      node: { isValid: true },
      string: ""
    };
    picker._updateVirtualRows();
    assert.strictEqual(picker._rowNodes[0].__pickerLevelId, 8, "Virtual picker must render level 8 after scrolling one viewport.");
    assert.strictEqual(picker._rowNodes[0].__label.string, "第8关", "Virtual picker row label must follow the rebound level id.");
    assert.strictEqual(picker._rowNodes[0].y, -420, "Virtual picker row must use top-anchored content coordinates.");
    assert.strictEqual(picker._titleLabel.string, "选择关卡（8-14 / 1000）", "Virtual picker title must expose the current visible range.");
  } finally {
    if (previousCc === undefined) {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function assertSaveValidationUsesVisibleTip() {
  var previousCc = global.cc;
  global.cc = {
    Class: function (definition) {
      return definition;
    },
    Component: function () {}
  };
  try {
    var controllerPath = path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorController");
    delete require.cache[require.resolve(controllerPath)];
    var controllerDefinition = require(controllerPath);
    var shownMessage = "";
    var saveCalled = false;
    var handled = controllerDefinition._onSaveLocalTap.call({
      _currentLevelId: 1,
      _buildMergedLevelConfig: function () {
        throw new Error("splitter 配置不合法");
      },
      _showSaveValidationTip: function (message) {
        shownMessage = message;
        return true;
      },
      _localEditedLevelStore: {
        saveLevel: function () {
          saveCalled = true;
          throw new Error("validation failure must not reach storage");
        }
      }
    });
    assert.strictEqual(handled, true, "Editor save validation error must be handled by the visible tip boundary.");
    assert.strictEqual(shownMessage, "splitter 配置不合法", "Editor save validation tip must preserve the exact error message.");
    assert.strictEqual(saveCalled, false, "Editor must not write an invalid level after showing the validation tip.");

    var validSource = JSON.parse(read("assets/map/config/levels/level_001.json"));
    assert.throws(function () {
      controllerDefinition._onSaveLocalTap.call({
        _currentLevelId: 1,
        _buildMergedLevelConfig: function () {
          return validSource;
        },
        _showSaveValidationTip: function () {
          throw new Error("storage failures must not be converted into validation tips");
        },
        _localEditedLevelStore: {
          saveLevel: function () {
            throw new Error("local storage unavailable");
          }
        }
      });
    }, /local storage unavailable/, "Editor local storage failure must remain fail-fast.");
  } finally {
    if (previousCc === undefined) {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function assertLocalDraftPriorityDecision() {
  var previousCc = global.cc;
  global.cc = {
    Class: function (definition) {
      return definition;
    },
    Component: function () {}
  };
  try {
    var controllerPath = path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorController");
    delete require.cache[require.resolve(controllerPath)];
    var controllerDefinition = require(controllerPath);
    var checkedLevelIds = [];
    var localSource = controllerDefinition._resolvePreferredLevelSource.call({
      _localEditedLevelStore: {
        hasLevel: function (levelId) {
          checkedLevelIds.push(levelId);
          return true;
        }
      }
    }, 61);
    assert.strictEqual(localSource, "local", "Editor must prefer the saved local draft for the selected level.");
    assert.deepStrictEqual(checkedLevelIds, [61], "Editor must check the selected level id in local storage.");

    var onlineSource = controllerDefinition._resolvePreferredLevelSource.call({
      _localEditedLevelStore: {
        hasLevel: function () {
          return false;
        }
      }
    }, 62);
    assert.strictEqual(onlineSource, "online", "Editor may use the online level only when no local draft exists.");
  } finally {
    if (previousCc === undefined) {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function assertInputLevelParsing() {
  var previousCc = global.cc;
  global.cc = {
    Class: function (definition) {
      return definition;
    },
    Component: function () {}
  };
  try {
    var controllerPath = path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorController");
    delete require.cache[require.resolve(controllerPath)];
    var controllerDefinition = require(controllerPath);
    var context = {
      _inputLevelEditBox: { string: "061" },
      _availableLevelIds: [1, 61, 1000]
    };
    assert.strictEqual(controllerDefinition._readInputLevelId.call(context), 61, "input_level must parse a zero-padded valid level id.");
    context._inputLevelEditBox.string = "1001";
    assert.throws(function () {
      controllerDefinition._readInputLevelId.call(context);
    }, /关卡ID不在可选范围内/, "input_level must reject a level id outside the loaded catalog.");
    context._inputLevelEditBox.string = "abc";
    assert.throws(function () {
      controllerDefinition._readInputLevelId.call(context);
    }, /请输入有效的关卡ID/, "input_level must reject non-numeric text.");
  } finally {
    if (previousCc === undefined) {
      delete global.cc;
    } else {
      global.cc = previousCc;
    }
  }
}

function assertLocalStore() {
  global.cc = {};
  var LocalEditedLevelStore = require(path.join(PROJECT_ROOT, "assets/scripts/config/LocalEditedLevelStore"));
  var store = new LocalEditedLevelStore({
    backend: createMemoryBackend()
  });
  var rawConfig = JSON.parse(read("assets/map/config/levels/level_001.json"));
  assert.strictEqual(store.hasLevel(1), false, "Unsaved local level must not be reported as present.");
  var saveResult = store.saveLevel(rawConfig, 123);
  assert.strictEqual(saveResult.levelId, 1, "Local edited level save must preserve levelId.");
  assert.strictEqual(store.hasLevel(1), true, "Saved local level must be reported as present.");
  assert.deepStrictEqual(store.listLevelIds(), [1], "Local edited level index must list the saved level.");
  assert.strictEqual(store.loadLevel(1).level.levelId, 1, "Local edited level must load through strict normalization.");
  assert.strictEqual(store.loadAllRecords()[0].updatedAt, 123, "Local edited level sync record must preserve updatedAt.");
  var clearResult = store.clearAll();
  assert.strictEqual(clearResult.removedCount, 1, "Local edited level clear must report the removed draft count.");
  assert.strictEqual(store.hasLevel(1), false, "Cleared local level must no longer be reported as present.");
  assert.deepStrictEqual(store.listLevelIds(), [], "Local edited level index must be empty after clearing.");
  assert.throws(function () {
    store.loadLevel(1);
  }, /Local edited level is not saved/, "Cleared local level must not remain loadable.");
}

function assertAllOnlineLevelsAreImportable() {
  var LevelConfigLoader = require(path.join(PROJECT_ROOT, "assets/scripts/config/LevelConfigLoader"));
  var LevelPackCompactCodec = require(path.join(PROJECT_ROOT, "assets/scripts/config/LevelPackCompactCodec"));
  var MapEditorBoardImport = require(path.join(PROJECT_ROOT, "assets/scripts/editor/MapEditorBoardImport"));
  var importedCount = 0;
  for (var levelId = 1; levelId <= 10; levelId += 1) {
    var levelKey = "level_" + String(levelId).padStart(3, "0");
    var rawLocal = JSON.parse(read("assets/map/config/levels/" + levelKey + ".json"));
    MapEditorBoardImport.importLevelToCellStates(LevelConfigLoader.normalizeLevelConfig(rawLocal, levelKey));
    importedCount += 1;
  }
  var packDir = path.join(PROJECT_ROOT, "remote-level-packs");
  fs.readdirSync(packDir).filter(function (fileName) {
    return /^levels_pack_.*\.json$/.test(fileName);
  }).forEach(function (fileName) {
    var compactPack = JSON.parse(fs.readFileSync(path.join(packDir, fileName), "utf8"));
    var expandedPack = LevelPackCompactCodec.expandPack(compactPack);
    Object.keys(expandedPack.levels).forEach(function (levelKey) {
      var normalized = LevelConfigLoader.normalizeLevelConfig(expandedPack.levels[levelKey], levelKey);
      MapEditorBoardImport.importLevelToCellStates(normalized);
      importedCount += 1;
    });
  });
  assert.strictEqual(importedCount, 1000, "Map editor must import all 1000 current online levels.");
}

function assertCloudDraftIsolation() {
  var clientSource = read("assets/scripts/services/LevelEditorCloudSyncService.js");
  var cloudSource = read("cloudfunctions/levelEditorDrafts/index.js");
  var templateSource = read("build-templates/wechatgame/cloudfunctions/levelEditorDrafts/index.js");
  assert.strictEqual(cloudSource, templateSource, "Level editor cloud function source and build template must match.");
  assert(cloudSource.indexOf('COLLECTION_NAME = "level_editor_drafts"') >= 0, "Cloud sync must use the isolated level_editor_drafts collection.");
  assert.strictEqual(cloudSource.indexOf("level-packs"), -1, "Cloud sync must not write online level packs.");
  assert(clientSource.indexOf("levelEditorDrafts_v20260718_v1") >= 0, "Client must verify the cloud function deployment marker.");
  assert(cloudSource.indexOf("levelEditorDrafts_v20260718_v1") >= 0, "Cloud function must expose the expected deployment marker.");
}

function assertExtendedColorRuntimeContracts() {
  var rendererSource = read("gameplay-src/render/LevelRenderer.js");
  var reviveSource = read("gameplay-src/core/AdRevivePolicy.js");
  var startGameSource = read("assets/scripts/bootstrap/GameBootstrapPowerupInventoryMethods.js");
  var expectedPaths = {
    K: "black_ball",
    O: "orange_ball",
    W: "white_ball"
  };
  Object.keys(expectedPaths).forEach(function (colorCode) {
    var fileName = expectedPaths[colorCode];
    assert(
      rendererSource.indexOf(colorCode + ': "game/image/ball/' + fileName + '"') >= 0,
      "LevelRenderer must map color " + colorCode + " to " + fileName + "."
    );
    assert(
      startGameSource.indexOf(colorCode + ': "ui/image/preview_balls/' + fileName + '"') >= 0,
      "StartGameView must map color " + colorCode + " to its UI-owned preview."
    );
    assertFile("assets/ui/image/preview_balls/" + fileName + ".png");
    assertFile("assets/ui/image/preview_balls/" + fileName + ".png.meta");
  });
  assert(reviveSource.indexOf('K: "黑球"') >= 0, "Ad revive must name black balls.");
  assert(reviveSource.indexOf('O: "橙球"') >= 0, "Ad revive must name orange balls.");
  assert(reviveSource.indexOf('W: "白球"') >= 0, "Ad revive must name white balls.");
}

assertSourceContract();
assertAssets();
assertVirtualPickerFollowsContentPosition();
assertSplitterObjectiveAlignment();
assertArbitraryPaletteColorsUpdateLevelConfig();
assertBoardDragPaintsContinuousCells();
assertBallCountInputDisplaysAndConfiguresShotLimit();
assertDestroyToleratesCocosChildDestructionOrder();
assertSaveValidationUsesVisibleTip();
assertLocalDraftPriorityDecision();
assertInputLevelParsing();
assertLocalStore();
assertAllOnlineLevelsAreImportable();
assertCloudDraftIsolation();
assertExtendedColorRuntimeContracts();

console.log("Level editor integration validation passed.");
