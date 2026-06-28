"use strict";

var Logger = require("../utils/Logger");
var UiModalReleaseHelper = require("../utils/UiModalReleaseHelper");
var PopupPanelAnimator = require("../ui/PopupPanelAnimator");
var IntroduceViewController = require("../ui/IntroduceViewController");
var PropDescriptionConfig = require("../config/PropDescriptionConfig");

var INTRODUCE_VIEW_PREFAB_PATH = "prefabs/ui/IntroduceView";
var INTRODUCE_VIEW_Z_INDEX = 520;
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

  _showNextSpecialIntroduceView: function () {
    if (this.isSelectingLevel === true || !this.currentLevelConfig) {
      return Promise.resolve(false);
    }
    if (this._specialIntroduceViewActive === true || this._specialIntroduceOpening === true) {
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
  }
};
