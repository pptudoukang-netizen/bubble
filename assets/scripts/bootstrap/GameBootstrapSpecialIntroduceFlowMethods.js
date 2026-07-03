"use strict";

var Logger = require("../utils/Logger");
var UiModalReleaseHelper = require("../utils/UiModalReleaseHelper");
var PopupPanelAnimator = require("../ui/PopupPanelAnimator");
var IntroduceViewController = require("../ui/IntroduceViewController");
var GeniusTipsViewController = require("../ui/GeniusTipsViewController");
var SartTipsViewController = require("../ui/SartTipsViewController");
var BoardLayout = require("../config/BoardLayout");
var PropDescriptionConfig = require("../config/PropDescriptionConfig");

var INTRODUCE_VIEW_PREFAB_PATH = "prefabs/ui/IntroduceView";
var GENIUS_TIPS_VIEW_PREFAB_PATH = "prefabs/ui/GeniusTipsView";
var SART_TIPS_VIEW_PREFAB_PATH = "prefabs/ui/SartTipsView";
var SART_TIPS_PANEL_NODE_NAME = "bg";
var INTRODUCE_VIEW_Z_INDEX = 520;
var GENIUS_TIPS_VIEW_Z_INDEX = 530;
var SART_TIPS_VIEW_Z_INDEX = 535;
var GENIUS_TIPS_INTRODUCE_KEY = "genius_tips";
var SART_TIPS_INTRODUCE_KEY = "top_slot_star_tips";
var INTRODUCE_ORDER = PropDescriptionConfig.SPECIAL_ORDER;
var INTRODUCE_DEFINITIONS = PropDescriptionConfig.SPECIAL_DEFINITIONS;
var INTRODUCE_KEY_BY_ENTITY_TYPE = PropDescriptionConfig.SPECIAL_KEY_BY_ENTITY_TYPE;
var hasOwn = Object.prototype.hasOwnProperty;

function requireDefinition(key) {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("Special introduce key must be a non-empty string.");
  }
  if (!hasOwn.call(INTRODUCE_DEFINITIONS, key)) {
    throw new Error("Special introduce definition missing: " + key);
  }
  return INTRODUCE_DEFINITIONS[key];
}

function requireRuntimeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Special introduce requires runtime snapshot.");
  }
  if (!snapshot.board || typeof snapshot.board !== "object" || Array.isArray(snapshot.board)) {
    throw new Error("Special introduce requires runtime board snapshot.");
  }
  if (!Array.isArray(snapshot.board.cells)) {
    throw new Error("Special introduce requires runtime board cells.");
  }
  return snapshot;
}

function resolveIntroduceKeyForCell(cell) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
    throw new Error("Special introduce board cell must be an object.");
  }
  if (typeof cell.entityType !== "string" || cell.entityType.length === 0) {
    return null;
  }
  if (hasOwn.call(INTRODUCE_KEY_BY_ENTITY_TYPE, cell.entityType)) {
    return INTRODUCE_KEY_BY_ENTITY_TYPE[cell.entityType];
  }
  throw new Error("Special introduce unsupported entityType: " + cell.entityType);
}

function collectIntroduceKeys(snapshot) {
  var safeSnapshot = requireRuntimeSnapshot(snapshot);
  var presentKeys = {};
  var objectives = safeSnapshot.objectives;
  if (objectives && typeof objectives === "object" && objectives.type === "collect_ice_snowball") {
    presentKeys.ice_snowball = true;
  }

  safeSnapshot.board.cells.forEach(function (cell) {
    var key = resolveIntroduceKeyForCell(cell);
    if (key !== null) {
      presentKeys[key] = true;
    }
  });

  return INTRODUCE_ORDER.filter(function (key) {
    return presentKeys[key] === true;
  });
}

function requireStore(host) {
  if (!host.specialIntroduceStore || typeof host.specialIntroduceStore.hasViewed !== "function") {
    throw new Error("SpecialIntroduceStore is required before syncing introductions.");
  }
  if (typeof host.specialIntroduceStore.markViewed !== "function") {
    throw new Error("SpecialIntroduceStore.markViewed is required.");
  }
  return host.specialIntroduceStore;
}

function isQueued(host, key) {
  return !!(
    host._specialIntroduceQueuedKeys &&
    host._specialIntroduceQueuedKeys[key] === true
  );
}

function buildTopRowOccupiedMap(boardSnapshot) {
  if (!boardSnapshot || typeof boardSnapshot !== "object" || Array.isArray(boardSnapshot)) {
    throw new Error("Top slot tips requires board snapshot.");
  }
  if (!Array.isArray(boardSnapshot.cells)) {
    throw new Error("Top slot tips requires boardSnapshot.cells array.");
  }

  var occupied = {};
  boardSnapshot.cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Top slot tips requires object board cells.");
    }
    if (!Number.isInteger(cell.row) || cell.row < 0) {
      throw new Error("Top slot tips requires non-negative integer cell.row.");
    }
    if (!Number.isInteger(cell.col) || cell.col < 0) {
      throw new Error("Top slot tips requires non-negative integer cell.col.");
    }
    if (cell.row === 0) {
      occupied[cell.col] = true;
    }
  });
  return occupied;
}

function collectTopEmptySlotPositions(host, boardSnapshot, viewNode) {
  if (!host.levelRenderer || !host.levelRenderer.layers || !host.levelRenderer.layers.board) {
    throw new Error("Top slot tips requires levelRenderer board layer.");
  }
  if (!boardSnapshot || typeof boardSnapshot !== "object" || Array.isArray(boardSnapshot)) {
    throw new Error("Top slot tips requires board snapshot.");
  }
  if (!Number.isInteger(boardSnapshot.maxColumns) || boardSnapshot.maxColumns <= 0) {
    throw new Error("Top slot tips requires positive integer boardSnapshot.maxColumns.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Top slot tips requires finite boardSnapshot.viewportOffsetY.");
  }
  requireValidTipsViewNode(viewNode);

  var boardLayer = host.levelRenderer.layers.board;
  if (typeof boardLayer.convertToWorldSpaceAR !== "function") {
    throw new Error("Top slot tips requires board layer convertToWorldSpaceAR.");
  }
  if (typeof viewNode.convertToNodeSpaceAR !== "function") {
    throw new Error("Top slot tips requires view node convertToNodeSpaceAR.");
  }

  var occupied = buildTopRowOccupiedMap(boardSnapshot);
  var topRowColumns = BoardLayout.getRowColumnCount(0, boardSnapshot.maxColumns);
  var slotPositions = [];
  for (var col = 0; col < topRowColumns; col += 1) {
    if (occupied[col] === true) {
      continue;
    }
    var boardPos = BoardLayout.getCellPosition(0, col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var worldPos = boardLayer.convertToWorldSpaceAR(cc.v2(boardPos.x, boardPos.y));
    var localPos = viewNode.convertToNodeSpaceAR(worldPos);
    slotPositions.push({
      col: col,
      x: localPos.x,
      y: localPos.y
    });
  }
  return slotPositions;
}

function requireValidTipsViewNode(viewNode) {
  if (!viewNode || !viewNode.isValid) {
    throw new Error("Top slot tips requires valid view node.");
  }
  return viewNode;
}

function hasTopEmptySlots(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Top slot tips sync requires runtime snapshot.");
  }
  if (!snapshot.board || typeof snapshot.board !== "object" || Array.isArray(snapshot.board)) {
    throw new Error("Top slot tips sync requires runtime board snapshot.");
  }
  var occupied = buildTopRowOccupiedMap(snapshot.board);
  var topRowColumns = BoardLayout.getRowColumnCount(0, snapshot.board.maxColumns);
  for (var col = 0; col < topRowColumns; col += 1) {
    if (occupied[col] !== true) {
      return true;
    }
  }
  return false;
}

function isAnyIntroduceTipsViewActive(host) {
  return !!(
    host._specialIntroduceViewActive === true ||
    host._specialIntroduceOpening === true ||
    host._geniusTipsViewActive === true ||
    host._geniusTipsViewOpening === true ||
    host._sartTipsViewActive === true ||
    host._sartTipsViewOpening === true
  );
}

function hasActiveFairyAssist(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("GeniusTipsView sync requires runtime snapshot.");
  }
  if (snapshot.state !== "running") {
    return false;
  }
  if (!snapshot.systems || typeof snapshot.systems !== "object" || Array.isArray(snapshot.systems)) {
    throw new Error("GeniusTipsView sync requires runtime systems snapshot.");
  }
  var fairySnapshot = snapshot.systems.fairyAssistSystem;
  if (!fairySnapshot || typeof fairySnapshot !== "object" || Array.isArray(fairySnapshot)) {
    throw new Error("GeniusTipsView sync requires FairyAssistSystem snapshot.");
  }
  if (!Array.isArray(fairySnapshot.slots)) {
    throw new Error("GeniusTipsView sync requires fairy slots.");
  }

  for (var index = 0; index < fairySnapshot.slots.length; index += 1) {
    var slot = fairySnapshot.slots[index];
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      throw new Error("GeniusTipsView sync requires fairy slot objects.");
    }
    if (slot.fairy === null) {
      continue;
    }
    if (!slot.fairy || typeof slot.fairy !== "object" || Array.isArray(slot.fairy)) {
      throw new Error("GeniusTipsView sync requires fairy objects.");
    }
    return true;
  }
  return false;
}

function pauseTimedLevelTimerForIntroduce(host) {
  if (!host.gameManager) {
    throw new Error("Special introduce requires GameManager before pausing timer.");
  }
  if (typeof host.gameManager.pauseTimedLevelTimer !== "function") {
    throw new Error("Special introduce requires GameManager.pauseTimedLevelTimer.");
  }
  host.gameManager.pauseTimedLevelTimer();
  host._specialIntroducePausedTimer = true;
}

function resumeTimedLevelTimerForIntroduce(host) {
  if (host._specialIntroducePausedTimer !== true) {
    return;
  }
  if (!host.gameManager) {
    throw new Error("Special introduce requires GameManager before resuming timer.");
  }
  if (typeof host.gameManager.resumeTimedLevelTimer !== "function") {
    throw new Error("Special introduce requires GameManager.resumeTimedLevelTimer.");
  }
  host.gameManager.resumeTimedLevelTimer();
  host._specialIntroducePausedTimer = false;
}

module.exports = {
  _ensureSpecialIntroduceViewPrefab: function () {
    if (this._specialIntroduceViewPrefab) {
      return Promise.resolve(this._specialIntroduceViewPrefab);
    }
    return this._loadPrefab(INTRODUCE_VIEW_PREFAB_PATH).then(function (prefab) {
      if (!prefab) {
        throw new Error("IntroduceView prefab is required.");
      }
      this._specialIntroduceViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _ensureGeniusTipsViewPrefab: function () {
    if (this._geniusTipsViewPrefab) {
      return Promise.resolve(this._geniusTipsViewPrefab);
    }
    return this._loadPrefab(GENIUS_TIPS_VIEW_PREFAB_PATH).then(function (prefab) {
      if (!prefab) {
        throw new Error("GeniusTipsView prefab is required.");
      }
      this._geniusTipsViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _ensureSartTipsViewPrefab: function () {
    if (this._sartTipsViewPrefab) {
      return Promise.resolve(this._sartTipsViewPrefab);
    }
    return this._loadPrefab(SART_TIPS_VIEW_PREFAB_PATH).then(function (prefab) {
      if (!prefab) {
        throw new Error("SartTipsView prefab is required.");
      }
      this._sartTipsViewPrefab = prefab;
      return prefab;
    }.bind(this));
  },

  _syncSpecialIntroduceForRuntimeSnapshot: function (snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new Error("Special introduce sync requires runtime snapshot.");
    }
    if (snapshot.state !== "running") {
      return false;
    }
    var store = requireStore(this);
    var keys = collectIntroduceKeys(snapshot);
    var appended = false;
    keys.forEach(function (key) {
      if (
        store.hasViewed(key) !== true &&
        isQueued(this, key) !== true &&
        this._specialIntroduceCurrentKey !== key
      ) {
        this._specialIntroduceQueue.push(key);
        this._specialIntroduceQueuedKeys[key] = true;
        appended = true;
      }
    }, this);
    if (appended === true) {
      this._showNextSpecialIntroduceView().catch(function (error) {
        Logger.error("Show IntroduceView failed", error && error.stack ? error.stack : String(error));
        throw error;
      });
    }
    return appended;
  },

  _syncGeniusTipsForRuntimeSnapshot: function (snapshot) {
    if (hasActiveFairyAssist(snapshot) !== true) {
      return false;
    }
    var store = requireStore(this);
    if (store.hasViewed(GENIUS_TIPS_INTRODUCE_KEY) === true) {
      return false;
    }
    if (isAnyIntroduceTipsViewActive(this) === true) {
      return false;
    }
    this._showGeniusTipsView().catch(function (error) {
      Logger.error("Show GeniusTipsView failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
    return true;
  },

  _syncSartTipsForRuntimeSnapshot: function (snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new Error("Top slot tips sync requires runtime snapshot.");
    }
    if (snapshot.state !== "running") {
      return false;
    }
    if (hasTopEmptySlots(snapshot) !== true) {
      return false;
    }
    var store = requireStore(this);
    if (store.hasViewed(SART_TIPS_INTRODUCE_KEY) === true) {
      return false;
    }
    if (isAnyIntroduceTipsViewActive(this) === true) {
      return false;
    }
    this._showSartTipsView(snapshot).catch(function (error) {
      Logger.error("Show SartTipsView failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
    return true;
  },

  _showNextSpecialIntroduceView: function () {
    if (this.isSelectingLevel === true || !this.currentLevelConfig) {
      return Promise.resolve(false);
    }
    if (isAnyIntroduceTipsViewActive(this) === true) {
      return Promise.resolve(false);
    }
    if (!Array.isArray(this._specialIntroduceQueue)) {
      throw new Error("Special introduce queue must be an array.");
    }
    if (this._specialIntroduceQueue.length === 0) {
      return Promise.resolve(false);
    }

    var key = this._specialIntroduceQueue.shift();
    delete this._specialIntroduceQueuedKeys[key];
    return this._showSpecialIntroduceView(key);
  },

  _showSpecialIntroduceView: function (key) {
    var definition = requireDefinition(key);
    this._specialIntroduceOpening = true;
    return this._ensureSpecialIntroduceViewPrefab().then(function (prefab) {
      var viewNode = this._specialIntroduceViewNode;
      if (!viewNode || !cc.isValid(viewNode)) {
        viewNode = cc.instantiate(prefab);
        if (!viewNode) {
          throw new Error("Instantiate IntroduceView prefab failed.");
        }
        viewNode.parent = this.node;
        viewNode.setPosition(0, 0);
        viewNode.zIndex = INTRODUCE_VIEW_Z_INDEX;
        this._specialIntroduceViewNode = viewNode;
        this._specialIntroduceViewController = new IntroduceViewController({
          node: viewNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._closeSpecialIntroduceView();
          }.bind(this)
        });
      }

      this._specialIntroduceCurrentKey = key;
      viewNode.active = true;
      pauseTimedLevelTimerForIntroduce(this);
      return this._specialIntroduceViewController.render(definition).then(function () {
        requireStore(this).markViewed(key);
        this._specialIntroduceViewActive = true;
        this._specialIntroduceOpening = false;
        PopupPanelAnimator.play(viewNode);
        return true;
      }.bind(this));
    }.bind(this)).catch(function (error) {
      this._specialIntroduceOpening = false;
      this._specialIntroduceViewActive = false;
      resumeTimedLevelTimerForIntroduce(this);
      throw error;
    }.bind(this));
  },

  _showSartTipsView: function (snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new Error("SartTipsView show requires runtime snapshot.");
    }
    if (!snapshot.board || typeof snapshot.board !== "object" || Array.isArray(snapshot.board)) {
      throw new Error("SartTipsView show requires runtime board snapshot.");
    }

    this._sartTipsViewOpening = true;
    return this._ensureSartTipsViewPrefab().then(function (prefab) {
      var viewNode = this._sartTipsViewNode;
      if (!viewNode || !cc.isValid(viewNode)) {
        viewNode = cc.instantiate(prefab);
        if (!viewNode) {
          throw new Error("Instantiate SartTipsView prefab failed.");
        }
        viewNode.parent = this.node;
        viewNode.setPosition(0, 0);
        viewNode.zIndex = SART_TIPS_VIEW_Z_INDEX;
        this._sartTipsViewNode = viewNode;
        this._sartTipsViewController = new SartTipsViewController({
          node: viewNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._closeSartTipsView();
          }.bind(this)
        });
      }

      var slotPositions = collectTopEmptySlotPositions(this, snapshot.board, viewNode);
      if (slotPositions.length === 0) {
        throw new Error("SartTipsView show requires at least one top empty slot.");
      }

      viewNode.active = true;
      pauseTimedLevelTimerForIntroduce(this);
      requireStore(this).markViewed(SART_TIPS_INTRODUCE_KEY);
      this._sartTipsViewController.render(slotPositions);
      this._sartTipsViewActive = true;
      this._sartTipsViewOpening = false;
      PopupPanelAnimator.play(viewNode, { targetNodeName: SART_TIPS_PANEL_NODE_NAME });
      return true;
    }.bind(this)).catch(function (error) {
      this._sartTipsViewOpening = false;
      this._sartTipsViewActive = false;
      resumeTimedLevelTimerForIntroduce(this);
      throw error;
    }.bind(this));
  },

  _showGeniusTipsView: function () {
    this._geniusTipsViewOpening = true;
    return this._ensureGeniusTipsViewPrefab().then(function (prefab) {
      var viewNode = this._geniusTipsViewNode;
      if (!viewNode || !cc.isValid(viewNode)) {
        viewNode = cc.instantiate(prefab);
        if (!viewNode) {
          throw new Error("Instantiate GeniusTipsView prefab failed.");
        }
        viewNode.parent = this.node;
        viewNode.setPosition(0, 0);
        viewNode.zIndex = GENIUS_TIPS_VIEW_Z_INDEX;
        this._geniusTipsViewNode = viewNode;
        this._geniusTipsViewController = new GeniusTipsViewController({
          node: viewNode,
          onClose: function () {
            this._playSfx("uiClick");
            this._closeGeniusTipsView();
          }.bind(this)
        });
      }

      viewNode.active = true;
      pauseTimedLevelTimerForIntroduce(this);
      requireStore(this).markViewed(GENIUS_TIPS_INTRODUCE_KEY);
      this._geniusTipsViewActive = true;
      this._geniusTipsViewOpening = false;
      PopupPanelAnimator.play(viewNode);
      return true;
    }.bind(this)).catch(function (error) {
      this._geniusTipsViewOpening = false;
      this._geniusTipsViewActive = false;
      resumeTimedLevelTimerForIntroduce(this);
      throw error;
    }.bind(this));
  },

  _closeSpecialIntroduceView: function () {
    this._specialIntroduceViewActive = false;
    this._specialIntroduceCurrentKey = "";
    resumeTimedLevelTimerForIntroduce(this);
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "IntroduceView",
      nodeKey: "_specialIntroduceViewNode",
      prefabKey: "_specialIntroduceViewPrefab",
      controllerKey: "_specialIntroduceViewController"
    });
    this._showNextSpecialIntroduceView().catch(function (error) {
      Logger.error("Show next IntroduceView failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
  },

  _closeGeniusTipsView: function () {
    this._geniusTipsViewActive = false;
    resumeTimedLevelTimerForIntroduce(this);
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "GeniusTipsView",
      nodeKey: "_geniusTipsViewNode",
      prefabKey: "_geniusTipsViewPrefab",
      controllerKey: "_geniusTipsViewController"
    });
    this._showNextSpecialIntroduceView().catch(function (error) {
      Logger.error("Show next IntroduceView after GeniusTipsView failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
  },

  _closeSartTipsView: function () {
    this._sartTipsViewActive = false;
    resumeTimedLevelTimerForIntroduce(this);
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "SartTipsView",
      nodeKey: "_sartTipsViewNode",
      prefabKey: "_sartTipsViewPrefab",
      controllerKey: "_sartTipsViewController"
    });
    this._showNextSpecialIntroduceView().catch(function (error) {
      Logger.error("Show next IntroduceView after SartTipsView failed", error && error.stack ? error.stack : String(error));
      throw error;
    });
  },

  _hideSpecialIntroduceView: function () {
    this._specialIntroduceViewActive = false;
    this._specialIntroduceOpening = false;
    this._specialIntroduceCurrentKey = "";
    if (Array.isArray(this._specialIntroduceQueue)) {
      this._specialIntroduceQueue.length = 0;
    }
    this._specialIntroduceQueuedKeys = {};
    resumeTimedLevelTimerForIntroduce(this);
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "IntroduceView",
      nodeKey: "_specialIntroduceViewNode",
      prefabKey: "_specialIntroduceViewPrefab",
      controllerKey: "_specialIntroduceViewController"
    });
    this._hideGeniusTipsView();
    this._hideSartTipsView();
  },

  _hideGeniusTipsView: function () {
    this._geniusTipsViewActive = false;
    this._geniusTipsViewOpening = false;
    resumeTimedLevelTimerForIntroduce(this);
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "GeniusTipsView",
      nodeKey: "_geniusTipsViewNode",
      prefabKey: "_geniusTipsViewPrefab",
      controllerKey: "_geniusTipsViewController"
    });
  },

  _hideSartTipsView: function () {
    this._sartTipsViewActive = false;
    this._sartTipsViewOpening = false;
    resumeTimedLevelTimerForIntroduce(this);
    UiModalReleaseHelper.releaseCachedModal(this, {
      label: "SartTipsView",
      nodeKey: "_sartTipsViewNode",
      prefabKey: "_sartTipsViewPrefab",
      controllerKey: "_sartTipsViewController"
    });
  }
};
