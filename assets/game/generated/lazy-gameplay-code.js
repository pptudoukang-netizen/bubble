// [wechat-gameplay-code-bundle]
(function () {
  var runtimeGlobal = null;
  if (typeof GameGlobal !== "undefined" && GameGlobal) {
    runtimeGlobal = GameGlobal;
  } else if (typeof window !== "undefined" && window) {
    runtimeGlobal = window;
  } else if (typeof globalThis !== "undefined" && globalThis) {
    runtimeGlobal = globalThis;
  }
  var runtimeGlobals = [];
  function rememberRuntimeGlobal(candidate) {
    if (candidate && runtimeGlobals.indexOf(candidate) < 0) {
      runtimeGlobals.push(candidate);
    }
  }
  if (runtimeGlobal) {
    rememberRuntimeGlobal(runtimeGlobal);
  }
  if (typeof GameGlobal !== "undefined") {
    rememberRuntimeGlobal(GameGlobal);
  }
  if (typeof window !== "undefined") {
    rememberRuntimeGlobal(window);
  }
  if (typeof globalThis !== "undefined") {
    rememberRuntimeGlobal(globalThis);
  }
  function resolvePreviousRequire() {
    for (var index = 0; index < runtimeGlobals.length; index += 1) {
      if (runtimeGlobals[index] && typeof runtimeGlobals[index].__BUBBLE_COCOS_REQUIRE__ === "function") {
        return runtimeGlobals[index].__BUBBLE_COCOS_REQUIRE__;
      }
    }
    if (typeof __require === "function") {
      return __require;
    }
    for (var requireIndex = 0; requireIndex < runtimeGlobals.length; requireIndex += 1) {
      if (runtimeGlobals[requireIndex] && typeof runtimeGlobals[requireIndex].__require === "function") {
        return runtimeGlobals[requireIndex].__require;
      }
    }
    return null;
  }
  var previousRequire = resolvePreviousRequire();
  var gameplayCodeHash = "91cd111e6ab0db3a1dc62ceea09e86d6d56cc1bf75f964ca2eca2bcab28fb7ab";
  var lazyRequire = (function (modules, cache, entries) {
    function load(moduleId, jumped) {
      if (!cache[moduleId]) {
        if (!modules[moduleId]) {
          var tail = String(moduleId).split("/").pop();
          if (modules[tail]) {
            moduleId = tail;
          } else {
            if (!jumped && previousRequire) {
              return previousRequire(tail, true);
            }
            throw new Error("Cannot find gameplay module '" + moduleId + "'");
          }
        }
        var module = cache[moduleId] = { exports: {} };
        modules[moduleId][0].call(module.exports, function (request) {
          var dependencyMap = modules[moduleId][1];
          var mapped = Object.prototype.hasOwnProperty.call(dependencyMap, request) ? dependencyMap[request] : request;
          return load(mapped);
        }, module, module.exports);
      }
      return cache[moduleId].exports;
    }
    for (var index = 0; index < entries.length; index += 1) {
      load(entries[index]);
    }
    return load;
  })({
"AdRevivePolicy":[function(require,module,exports){
"use strict";

var AD_REVIVE_GRANTED_SHOTS = 10;
var AD_REVIVE_GRANTED_TIME_SECONDS = 10;
var AD_REVIVE_TARGET_COLOR_BALLS = 2;

var COLOR_DISPLAY_NAMES = {
  R: "红球",
  G: "绿球",
  B: "蓝球",
  Y: "黄球",
  P: "紫球",
  K: "黑球",
  O: "橙球",
  W: "白球"
};

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(fieldName + " must be an object.");
  }
  return value;
}

function requireLevel(levelConfig) {
  requireObject(levelConfig, "Ad revive level config");
  return requireObject(levelConfig.level, "Ad revive level data");
}

function requireAvailableColors(level) {
  if (!Array.isArray(level.colors) || level.colors.length <= 0) {
    throw new Error("Ad revive requires level.colors.");
  }
  level.colors.forEach(function (colorCode, index) {
    if (typeof colorCode !== "string" || !COLOR_DISPLAY_NAMES[colorCode]) {
      throw new Error("Ad revive level color is unsupported at index " + index + ".");
    }
  });
  return level.colors.slice();
}

function requireSupportedLevelColor(level, colorCode, fieldName) {
  if (typeof colorCode !== "string" || !COLOR_DISPLAY_NAMES[colorCode]) {
    throw new Error(fieldName + " must be a supported color.");
  }
  var colors = requireAvailableColors(level);
  if (colors.indexOf(colorCode) < 0) {
    throw new Error(fieldName + " must exist in level.colors: " + colorCode);
  }
  return colorCode;
}

function findPrimaryCollectionObjective(levelConfig) {
  var level = requireLevel(levelConfig);
  var sources = [level.bonusObjectives, level.winConditions];
  for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    if (!Array.isArray(sources[sourceIndex])) {
      throw new Error("Ad revive level objectives must be arrays.");
    }
    for (var objectiveIndex = 0; objectiveIndex < sources[sourceIndex].length; objectiveIndex += 1) {
      var objective = sources[sourceIndex][objectiveIndex];
      if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
        throw new Error("Ad revive objective entry must be an object.");
      }
      if (objective.type === "collect_any" || objective.type === "collect_color" || objective.type === "collect_ice_snowball") {
        return objective;
      }
    }
  }
  throw new Error("Ad revive requires a collection objective.");
}

function getRuntimeBoardCells(runtimeSnapshot) {
  requireObject(runtimeSnapshot, "Ad revive runtime snapshot");
  requireObject(runtimeSnapshot.board, "Ad revive runtime board");
  if (!Array.isArray(runtimeSnapshot.board.cells)) {
    throw new Error("Ad revive runtime board cells must be an array.");
  }
  return runtimeSnapshot.board.cells;
}

function getRuntimeObjectiveSnapshot(runtimeSnapshot) {
  requireObject(runtimeSnapshot, "Ad revive runtime snapshot");
  return requireObject(runtimeSnapshot.objectives, "Ad revive runtime objectives");
}

function isObjectiveCompleted(runtimeSnapshot) {
  var objectives = getRuntimeObjectiveSnapshot(runtimeSnapshot);
  if (!Number.isFinite(objectives.progress) || objectives.progress < 0) {
    throw new Error("Ad revive objective progress must be a non-negative number.");
  }
  if (!Number.isFinite(objectives.target) || objectives.target <= 0) {
    throw new Error("Ad revive objective target must be a positive number.");
  }
  return objectives.progress >= objectives.target;
}

function chooseColorByCounts(level, counts, fieldName) {
  var colors = requireAvailableColors(level);
  var bestColor = null;
  var bestCount = -1;
  colors.forEach(function (colorCode) {
    var count = counts[colorCode];
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(fieldName + " count must be a non-negative integer: " + colorCode);
    }
    if (count > bestCount) {
      bestColor = colorCode;
      bestCount = count;
    }
  });
  if (!bestColor || bestCount <= 0) {
    throw new Error(fieldName + " cannot resolve a target color.");
  }
  return bestColor;
}

function resolveCollectAnyTargetColor(level, cells) {
  var counts = {};
  requireAvailableColors(level).forEach(function (colorCode) {
    counts[colorCode] = 0;
  });
  cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Ad revive board cell must be an object.");
    }
    if (typeof cell.color === "string" && Object.prototype.hasOwnProperty.call(counts, cell.color)) {
      counts[cell.color] += 1;
    }
  });
  return chooseColorByCounts(level, counts, "Ad revive collect_any board color");
}

function resolveCollectIceSnowballTargetColor(level, cells) {
  var counts = {};
  requireAvailableColors(level).forEach(function (colorCode) {
    counts[colorCode] = 0;
  });
  cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Ad revive board cell must be an object.");
    }
    if (cell.entityType === "ice") {
      requireSupportedLevelColor(level, cell.innerColor, "Ad revive ice innerColor");
      counts[cell.innerColor] += 1;
    }
  });
  return chooseColorByCounts(level, counts, "Ad revive collect_ice_snowball target");
}

function resolveReviveTargetColor(levelConfig, runtimeSnapshot) {
  var level = requireLevel(levelConfig);
  var objective = findPrimaryCollectionObjective(levelConfig);
  if (objective.type === "collect_color") {
    return requireSupportedLevelColor(level, objective.color, "Ad revive collect_color objective color");
  }

  var cells = getRuntimeBoardCells(runtimeSnapshot);
  if (objective.type === "collect_any") {
    return resolveCollectAnyTargetColor(level, cells);
  }
  if (objective.type === "collect_ice_snowball") {
    return resolveCollectIceSnowballTargetColor(level, cells);
  }

  throw new Error("Unsupported ad revive objective type: " + objective.type);
}

function buildRevivePlan(levelConfig, runtimeSnapshot) {
  var level = requireLevel(levelConfig);
  if (level.playMode === "timed_infinite_shots") {
    return {
      grantedShots: 0,
      grantedTimeSeconds: AD_REVIVE_GRANTED_TIME_SECONDS,
      targetColor: null,
      targetColorBallCount: 0,
      randomBallCount: 0,
      description: "+" + AD_REVIVE_GRANTED_TIME_SECONDS + "秒"
    };
  }
  if (level.playMode !== "shot_limited") {
    throw new Error("Ad revive level.playMode is unsupported: " + level.playMode);
  }
  var objectiveCompleted = isObjectiveCompleted(runtimeSnapshot);
  var targetColor = objectiveCompleted ? null : resolveReviveTargetColor(levelConfig, runtimeSnapshot);
  return {
    grantedShots: AD_REVIVE_GRANTED_SHOTS,
    grantedTimeSeconds: 0,
    targetColor: targetColor,
    targetColorBallCount: objectiveCompleted ? 0 : AD_REVIVE_TARGET_COLOR_BALLS,
    randomBallCount: objectiveCompleted ? AD_REVIVE_TARGET_COLOR_BALLS : 0,
    description: objectiveCompleted ? buildRandomReviveDescription() : buildReviveDescriptionFromColor(targetColor)
  };
}

function buildRandomReviveDescription() {
  return "增加随机球x" + AD_REVIVE_GRANTED_SHOTS;
}

function buildReviveDescriptionFromColor(targetColor) {
  if (!COLOR_DISPLAY_NAMES[targetColor]) {
    throw new Error("Ad revive description target color is unsupported: " + targetColor);
  }
  return "增加" + COLOR_DISPLAY_NAMES[targetColor] + "x" + AD_REVIVE_GRANTED_SHOTS;
}

function buildReviveDescription(levelConfig, runtimeSnapshot) {
  return buildRevivePlan(levelConfig, runtimeSnapshot).description;
}

module.exports = {
  AD_REVIVE_GRANTED_SHOTS: AD_REVIVE_GRANTED_SHOTS,
  AD_REVIVE_GRANTED_TIME_SECONDS: AD_REVIVE_GRANTED_TIME_SECONDS,
  AD_REVIVE_TARGET_COLOR_BALLS: AD_REVIVE_TARGET_COLOR_BALLS,
  buildRevivePlan: buildRevivePlan,
  buildReviveDescription: buildReviveDescription,
  resolveReviveTargetColor: resolveReviveTargetColor
};

},{}],
"BaseSystem":[function(require,module,exports){
"use strict";

function BaseSystem(name) {
  this.name = name;
  this.ready = false;
  this.context = null;
  this.lastLevelId = null;
}

BaseSystem.prototype.initialize = function (context) {
  this.context = context || {};
  this.ready = true;
  return this;
};

BaseSystem.prototype.configureLevel = function (levelConfig) {
  this.lastLevelId = levelConfig.level.levelId;
  return this;
};

BaseSystem.prototype.snapshot = function () {
  return {
    name: this.name,
    ready: this.ready,
    lastLevelId: this.lastLevelId
  };
};

module.exports = BaseSystem;

},{}],
"BoardOcclusionSystem":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");
var BoardOcclusionConfig = require("../../assets/scripts/config/BoardOcclusionConfig");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireObject(value, description) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(description + " must be an object.");
  }
  return value;
}

function BoardOcclusionSystem() {
  BaseSystem.call(this, "BoardOcclusionSystem");
  this.plan = BoardOcclusionConfig.createNonePlan();
  this.variantId = null;
  this.selectionSeed = null;
  this.activeZones = [];
  this.version = 0;
}

BoardOcclusionSystem.prototype = Object.create(BaseSystem.prototype);
BoardOcclusionSystem.prototype.constructor = BoardOcclusionSystem;

BoardOcclusionSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  if (!levelConfig || !levelConfig.level) {
    throw new Error("BoardOcclusionSystem requires level config.");
  }
  this.plan = BoardOcclusionConfig.normalizePlan(
    levelConfig.level.boardOcclusionPlan,
    levelConfig.level,
    levelConfig.meta && levelConfig.meta.resourceKey ? levelConfig.meta.resourceKey : levelConfig.level.code
  );
  this.variantId = null;
  this.selectionSeed = null;
  this.activeZones = [];
  this.version += 1;
  return this;
};

BoardOcclusionSystem.prototype.startRun = function (startContext) {
  requireObject(startContext, "Board occlusion startContext");
  if (typeof startContext.seed !== "string" || !startContext.seed) {
    throw new Error("Board occlusion startContext.seed must be a non-empty string.");
  }
  if (!Number.isInteger(startContext.attemptIndex) || startContext.attemptIndex <= 0) {
    throw new Error("Board occlusion startContext.attemptIndex must be a positive integer.");
  }
  if (typeof startContext.runMode !== "string" || !startContext.runMode) {
    throw new Error("Board occlusion startContext.runMode must be a non-empty string.");
  }

  this.selectionSeed = startContext.seed;
  if (this.plan.mode === BoardOcclusionConfig.MODE_NONE) {
    this.variantId = null;
    this.activeZones = [];
    this.version += 1;
    return this.snapshotForRender();
  }

  var variantIndex;
  if (this.plan.mode === BoardOcclusionConfig.MODE_PER_ATTEMPT) {
    var baseOffset = BoardOcclusionConfig.hashString(
      this.selectionSeed.split(":attempt:")[0] + ":" + this.plan.generatorVersion
    ) % this.plan.variants.length;
    variantIndex = (baseOffset + startContext.attemptIndex - 1) % this.plan.variants.length;
  } else if (this.plan.mode === BoardOcclusionConfig.MODE_PER_RUN) {
    variantIndex = BoardOcclusionConfig.hashString(
      this.selectionSeed + ":" + this.plan.generatorVersion
    ) % this.plan.variants.length;
  } else {
    throw new Error("Unsupported board occlusion mode at run start: " + this.plan.mode);
  }

  var variant = this.plan.variants[variantIndex];
  if (!variant) {
    throw new Error("Board occlusion selected variant is missing at index " + variantIndex + ".");
  }
  this.variantId = variant.id;
  this.activeZones = variant.zones.map(function (zone) {
    var runtimeZone = clone(zone);
    runtimeZone.remainingShots = zone.clearRule.kind === "item_or_shots"
      ? zone.clearRule.shots
      : null;
    runtimeZone.remainingTimeMs = zone.clearRule.kind === "item_or_seconds"
      ? zone.clearRule.seconds * 1000
      : null;
    return runtimeZone;
  });
  this.version += 1;
  return this.snapshotForRender();
};

BoardOcclusionSystem.prototype.hasActiveZones = function () {
  return this.activeZones.length > 0;
};

BoardOcclusionSystem.prototype._removeExpiredZones = function () {
  var removed = [];
  this.activeZones = this.activeZones.filter(function (zone) {
    var expiredByShots = zone.remainingShots !== null && zone.remainingShots <= 0;
    var expiredByTime = zone.remainingTimeMs !== null && zone.remainingTimeMs <= 0;
    if (expiredByShots || expiredByTime) {
      removed.push(zone.id);
      return false;
    }
    return true;
  });
  if (removed.length) {
    this.version += 1;
  }
  return removed;
};

BoardOcclusionSystem.prototype.onShotFired = function () {
  var changed = false;
  this.activeZones.forEach(function (zone) {
    if (zone.remainingShots !== null) {
      zone.remainingShots -= 1;
      changed = true;
    }
  });
  if (changed) {
    this.version += 1;
  }
  return this._removeExpiredZones();
};

BoardOcclusionSystem.prototype.update = function (dt, paused) {
  if (typeof dt !== "number" || !isFinite(dt) || dt < 0) {
    throw new Error("BoardOcclusionSystem.update dt must be a non-negative finite number.");
  }
  if (typeof paused !== "boolean") {
    throw new Error("BoardOcclusionSystem.update paused must be boolean.");
  }
  if (paused || dt === 0 || !this.activeZones.length) {
    return [];
  }
  var changedBucket = false;
  this.activeZones.forEach(function (zone) {
    if (zone.remainingTimeMs === null) {
      return;
    }
    var previousBucket = Math.ceil(zone.remainingTimeMs / 1000);
    zone.remainingTimeMs = Math.max(0, zone.remainingTimeMs - dt * 1000);
    var nextBucket = Math.ceil(zone.remainingTimeMs / 1000);
    if (previousBucket !== nextBucket) {
      changedBucket = true;
    }
  });
  if (changedBucket) {
    this.version += 1;
  }
  return this._removeExpiredZones();
};

BoardOcclusionSystem.prototype.clearAllWithItem = function () {
  if (!this.activeZones.length) {
    return [];
  }
  var removed = this.activeZones.map(function (zone) {
    return zone.id;
  });
  this.activeZones = [];
  this.version += 1;
  return removed;
};

BoardOcclusionSystem.prototype.snapshotForRender = function () {
  return {
    version: this.version,
    mode: this.plan.mode,
    variantId: this.variantId,
    selectionSeed: this.selectionSeed,
    activeZones: this.activeZones.map(function (zone) {
      return {
        id: zone.id,
        visualType: zone.visualType,
        cells: clone(zone.cells),
        clearRule: clone(zone.clearRule),
        remainingShots: zone.remainingShots,
        remainingTimeMs: zone.remainingTimeMs
      };
    })
  };
};

BoardOcclusionSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.plan = clone(this.plan);
  snapshot.runtime = this.snapshotForRender();
  return snapshot;
};

module.exports = BoardOcclusionSystem;

},{"./BaseSystem":"BaseSystem","../../assets/scripts/config/BoardOcclusionConfig":"BoardOcclusionConfig"}],
"BoardViewportConfig":[function(require,module,exports){
"use strict";

function assertPositiveFiniteNumber(value, fieldName) {
  if (typeof value !== "number" || !isFinite(value) || value <= 0) {
    throw new Error("BoardViewportConfig." + fieldName + " must be a positive finite number.");
  }
  return value;
}

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("BoardViewportConfig." + fieldName + " must be a positive integer.");
  }
  return value;
}

var BoardViewportConfig = {
  targetVisibleRows: assertPositiveInteger(10, "targetVisibleRows"),
  minLayoutRows: assertPositiveInteger(7, "minLayoutRows"),
  topCollapseMinEmptySlots: assertPositiveInteger(6, "topCollapseMinEmptySlots"),
  introScrollSpeedPxPerSec: assertPositiveFiniteNumber(320, "introScrollSpeedPxPerSec"),
  gameplayMoveDurationPerRowSec: assertPositiveFiniteNumber(0.30, "gameplayMoveDurationPerRowSec")
};

module.exports = BoardViewportConfig;

},{}],
"BoardViewportSystem":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var BoardViewportConfig = require("../config/BoardViewportConfig");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCannonSafetyLineY() {
  return BoardLayout.getCannonTopLineY();
}

function getHudBottomLineY() {
  return BoardLayout.getHudBottomLineY();
}

function collectOccupiedRows(cells) {
  var rowMap = {};
  (cells || []).forEach(function (cell) {
    if (!cell || !Number.isInteger(cell.row)) {
      throw new Error("BoardViewportSystem cell row must be an integer.");
    }
    rowMap[cell.row] = true;
  });
  return Object.keys(rowMap).map(Number).sort(function (a, b) {
    return a - b;
  });
}

function getBubbleTopY(row, viewportOffsetY) {
  return BoardLayout.boardStartY - row * BoardLayout.rowHeight + viewportOffsetY + BoardLayout.bubbleRadius;
}

function getBubbleBottomY(row, viewportOffsetY) {
  return BoardLayout.boardStartY - row * BoardLayout.rowHeight + viewportOffsetY - BoardLayout.bubbleRadius;
}

function countVisibleOccupiedRows(cells, viewportOffsetY) {
  var occupiedRows = collectOccupiedRows(cells);
  var cannonLineY = getCannonSafetyLineY();
  var visibleCount = 0;
  occupiedRows.forEach(function (row) {
    var topY = getBubbleTopY(row, viewportOffsetY);
    var bottomY = getBubbleBottomY(row, viewportOffsetY);
    if (topY <= getHudBottomLineY() && bottomY >= cannonLineY) {
      visibleCount += 1;
    }
  });
  return visibleCount;
}

function computeOffsetForBottomRowAtHudSlot(bottomRow, slotNumber) {
  if (!Number.isInteger(bottomRow) || bottomRow < 0) {
    throw new Error("BoardViewportSystem bottom row must be a non-negative integer.");
  }
  if (!Number.isInteger(slotNumber) || slotNumber <= 0) {
    throw new Error("BoardViewportSystem HUD row slot must be a positive integer.");
  }
  var bottomCenterY = BoardLayout.boardStartY - bottomRow * BoardLayout.rowHeight;
  var targetCenterY = getHudBottomLineY() - BoardLayout.bubbleRadius - (slotNumber - 1) * BoardLayout.rowHeight;
  return targetCenterY - bottomCenterY;
}

function computeOffsetForTopRowAtHud(cells) {
  if (!cells.length) {
    return 0;
  }
  var topRow = collectOccupiedRows(cells)[0];
  var topCenterY = BoardLayout.boardStartY - topRow * BoardLayout.rowHeight;
  var topEdgeY = topCenterY + BoardLayout.bubbleRadius;
  return getHudBottomLineY() - topEdgeY;
}

function computeDirectDisplayOffsetY(cells) {
  return computeOffsetForTopRowAtHud(cells);
}

function computeIntroTargetOffsetY(cells) {
  var occupiedRows = collectOccupiedRows(cells);
  var logicalSpan = occupiedRows[occupiedRows.length - 1] - occupiedRows[0] + 1;
  if (logicalSpan <= BoardViewportConfig.targetVisibleRows) {
    return computeDirectDisplayOffsetY(cells);
  }
  return computeOffsetForBottomRowAtHudSlot(
    occupiedRows[occupiedRows.length - 1],
    BoardViewportConfig.targetVisibleRows
  );
}

function computeSettleTargetOffsetY(cells, currentOffsetY) {
  if (!cells.length) {
    return currentOffsetY;
  }

  var occupiedRows = collectOccupiedRows(cells);
  var topRow = occupiedRows[0];
  var bottomRow = occupiedRows[occupiedRows.length - 1];
  var logicalSpan = bottomRow - topRow + 1;
  if (logicalSpan <= BoardViewportConfig.targetVisibleRows) {
    return computeOffsetForTopRowAtHud(cells);
  }
  return computeOffsetForBottomRowAtHudSlot(bottomRow, BoardViewportConfig.targetVisibleRows);
}

function BoardViewportSystem() {
  BaseSystem.call(this, "BoardViewportSystem");
  this.offsetY = 0;
  this.targetOffsetY = 0;
  this.phase = "idle";
  this.moveDurationSec = 0;
  this.moveElapsedSec = 0;
  this.moveStartOffsetY = 0;
  this.introActive = false;
  this.minOffsetY = 0;
  this.maxOffsetY = 0;
}

BoardViewportSystem.prototype = Object.create(BaseSystem.prototype);
BoardViewportSystem.prototype.constructor = BoardViewportSystem;

BoardViewportSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.offsetY = 0;
  this.targetOffsetY = 0;
  this.phase = "idle";
  this.moveDurationSec = 0;
  this.moveElapsedSec = 0;
  this.moveStartOffsetY = 0;
  this.introActive = false;
  this.minOffsetY = 0;
  this.maxOffsetY = 0;
  return this;
};

BoardViewportSystem.prototype.getOffsetY = function () {
  return this.offsetY;
};

BoardViewportSystem.prototype.getTopAttachY = function () {
  return BoardLayout.boardStartY + this.offsetY;
};

BoardViewportSystem.prototype.isMoving = function () {
  return this.phase === "intro_scrolling" || this.phase === "settling";
};

BoardViewportSystem.prototype.planIntroPosition = function (cells) {
  if (!Array.isArray(cells)) {
    throw new Error("BoardViewportSystem.planIntroPosition requires cells array.");
  }
  if (!cells.length) {
    this.offsetY = 0;
    this.targetOffsetY = 0;
    this.phase = "idle";
    this.introActive = false;
    return {
      needsScroll: false,
      startOffsetY: 0,
      targetOffsetY: 0
    };
  }

  var occupiedRows = collectOccupiedRows(cells);
  var logicalSpan = occupiedRows[occupiedRows.length - 1] - occupiedRows[0] + 1;
  var startOffsetY;
  var targetOffsetY;

  if (logicalSpan <= BoardViewportConfig.targetVisibleRows) {
    targetOffsetY = computeDirectDisplayOffsetY(cells);
    startOffsetY = targetOffsetY;
  } else {
    startOffsetY = computeDirectDisplayOffsetY(cells);
    targetOffsetY = computeIntroTargetOffsetY(cells);
  }

  this.minOffsetY = computeOffsetForTopRowAtHud(cells);
  this.maxOffsetY = logicalSpan <= BoardViewportConfig.targetVisibleRows
    ? this.minOffsetY
    : computeSettleTargetOffsetY(cells, this.minOffsetY);
  this.offsetY = startOffsetY;
  this.targetOffsetY = targetOffsetY;
  this.moveStartOffsetY = startOffsetY;
  this.introActive = Math.abs(targetOffsetY - startOffsetY) > 0.5;
  if (this.introActive) {
    this.phase = "intro_scrolling";
    this.moveDurationSec = Math.abs(targetOffsetY - startOffsetY) / BoardViewportConfig.introScrollSpeedPxPerSec;
    this.moveElapsedSec = 0;
  } else {
    this.offsetY = targetOffsetY;
    this.targetOffsetY = targetOffsetY;
    this.phase = "idle";
    this.introActive = false;
  }

  return {
    needsScroll: this.introActive,
    startOffsetY: startOffsetY,
    targetOffsetY: targetOffsetY
  };
};

BoardViewportSystem.prototype.planSettle = function (boardSnapshot) {
  if (!boardSnapshot || !Array.isArray(boardSnapshot.cells)) {
    throw new Error("BoardViewportSystem.planSettle requires board snapshot with cells.");
  }
  if (this.introActive) {
    throw new Error("BoardViewportSystem.planSettle cannot run during intro scroll.");
  }

  var cells = boardSnapshot.cells;
  if (!cells.length) {
    this.targetOffsetY = this.offsetY;
    this.phase = "idle";
    return this.offsetY;
  }

  var targetOffsetY = computeSettleTargetOffsetY(cells, this.offsetY);
  this.minOffsetY = computeOffsetForTopRowAtHud(cells);
  var occupiedRows = collectOccupiedRows(cells);
  var logicalSpan = occupiedRows[occupiedRows.length - 1] - occupiedRows[0] + 1;
  this.maxOffsetY = logicalSpan <= BoardViewportConfig.targetVisibleRows
    ? this.minOffsetY
    : computeSettleTargetOffsetY(cells, this.minOffsetY);
  if (Math.abs(targetOffsetY - this.offsetY) <= 0.5) {
    this.targetOffsetY = this.offsetY;
    this.phase = "idle";
    return this.offsetY;
  }

  var rowDelta = Math.abs(targetOffsetY - this.offsetY) / BoardLayout.rowHeight;
  this.moveStartOffsetY = this.offsetY;
  this.targetOffsetY = targetOffsetY;
  this.moveDurationSec = BoardViewportConfig.gameplayMoveDurationPerRowSec * rowDelta;
  this.moveElapsedSec = 0;
  this.phase = "settling";
  return targetOffsetY;
};

BoardViewportSystem.prototype.getMaxOffsetY = function () {
  return this.maxOffsetY;
};

BoardViewportSystem.prototype.shiftOffsetYByRows = function (rowCount) {
  if (!Number.isInteger(rowCount)) {
    throw new Error("BoardViewportSystem.shiftOffsetYByRows requires integer rowCount.");
  }
  if (this.isMoving()) {
    throw new Error("BoardViewportSystem.shiftOffsetYByRows cannot start while viewport is moving.");
  }
  var nextOffsetY = this.offsetY - rowCount * BoardLayout.rowHeight;
  if (nextOffsetY > this.maxOffsetY) {
    throw new Error("BoardViewportSystem offsetY cannot move above top HUD limit.");
  }
  if (Math.abs(nextOffsetY - this.offsetY) <= 0.5) {
    this.targetOffsetY = this.offsetY;
    this.phase = "idle";
    this.moveDurationSec = 0;
    this.moveElapsedSec = 0;
    return this.offsetY;
  }
  var rowDelta = Math.abs(nextOffsetY - this.offsetY) / BoardLayout.rowHeight;
  this.moveStartOffsetY = this.offsetY;
  this.targetOffsetY = nextOffsetY;
  this.moveDurationSec = BoardViewportConfig.gameplayMoveDurationPerRowSec * rowDelta;
  this.moveElapsedSec = 0;
  this.phase = "settling";
  return nextOffsetY;
};

BoardViewportSystem.prototype.update = function (dt) {
  if (!this.isMoving()) {
    return false;
  }
  if (typeof dt !== "number" || !isFinite(dt) || dt < 0) {
    throw new Error("BoardViewportSystem.update requires non-negative finite dt.");
  }

  this.moveElapsedSec += dt;
  var duration = Math.max(this.moveDurationSec, 0.0001);
  var progress = clamp(this.moveElapsedSec / duration, 0, 1);
  this.offsetY = this.moveStartOffsetY + (this.targetOffsetY - this.moveStartOffsetY) * progress;

  if (progress >= 1) {
    this.offsetY = this.targetOffsetY;
    if (this.phase === "intro_scrolling") {
      this.introActive = false;
    }
    this.phase = "idle";
    this.moveDurationSec = 0;
    this.moveElapsedSec = 0;
    return true;
  }
  return false;
};

BoardViewportSystem.prototype.finishIntroImmediately = function () {
  if (!this.introActive) {
    return;
  }
  this.offsetY = this.targetOffsetY;
  this.introActive = false;
  this.phase = "idle";
  this.moveDurationSec = 0;
  this.moveElapsedSec = 0;
};

BoardViewportSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.offsetY = this.offsetY;
  snapshot.targetOffsetY = this.targetOffsetY;
  snapshot.phase = this.phase;
  snapshot.visibleRowSpan = BoardViewportConfig.targetVisibleRows;
  snapshot.introActive = this.introActive;
  snapshot.isMoving = this.isMoving();
  return snapshot;
};

BoardViewportSystem.computeSettleTargetOffsetY = computeSettleTargetOffsetY;
BoardViewportSystem.computeDirectDisplayOffsetY = computeDirectDisplayOffsetY;
BoardViewportSystem.computeIntroTargetOffsetY = computeIntroTargetOffsetY;
BoardViewportSystem.countVisibleOccupiedRows = countVisibleOccupiedRows;
BoardViewportSystem.countTopRowOccupied = function (cells) {
  if (!Array.isArray(cells)) {
    throw new Error("BoardViewportSystem.countTopRowOccupied requires cells array.");
  }
  return cells.filter(function (cell) {
    return cell && cell.row === 0;
  }).length;
};

BoardViewportSystem.countTopRowEmptySlots = function (cells, maxColumns) {
  if (!Array.isArray(cells)) {
    throw new Error("BoardViewportSystem.countTopRowEmptySlots requires cells array.");
  }
  if (!Number.isInteger(maxColumns) || maxColumns <= 0) {
    throw new Error("BoardViewportSystem.countTopRowEmptySlots requires positive integer maxColumns.");
  }
  var topRowColumns = BoardLayout.getRowColumnCount(0, maxColumns);
  var topRowOccupied = BoardViewportSystem.countTopRowOccupied(cells);
  if (topRowOccupied > topRowColumns) {
    throw new Error("BoardViewportSystem top row occupied count exceeds row column count.");
  }
  return topRowColumns - topRowOccupied;
};

BoardViewportSystem.countOccupiedRowSpan = function (cells) {
  var rows = collectOccupiedRows(cells);
  if (!rows.length) {
    return 0;
  }
  return rows[rows.length - 1] - rows[0] + 1;
};

BoardViewportSystem.shouldTriggerTopAnchorCollapse = function (cells, maxColumns) {
  if (!cells.length) {
    return false;
  }
  if (!Number.isInteger(maxColumns) || maxColumns <= 0) {
    throw new Error("BoardViewportSystem.shouldTriggerTopAnchorCollapse requires positive integer maxColumns.");
  }
  return BoardViewportSystem.countTopRowEmptySlots(cells, maxColumns) >= BoardViewportConfig.topCollapseMinEmptySlots;
};

module.exports = BoardViewportSystem;

},{"./BaseSystem":"BaseSystem","../../assets/scripts/config/BoardLayout":"BoardLayout","../config/BoardViewportConfig":"BoardViewportConfig"}],
"BubbleGrid":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var DebugFlags = require("../../assets/scripts/utils/DebugFlags");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function keyFor(row, col) {
  return row + ":" + col;
}

function buildColorCountSignature(colorCounts) {
  return Object.keys(colorCounts).sort().map(function (color) {
    return color + ":" + colorCounts[color];
  }).join("|");
}

function normalize(vector) {
  var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

var EPSILON = 0.000001;
var MIN_VISUAL_CELL_DISTANCE = BoardLayout.bubbleDiameter - 0.5;
var VINE_SPIRIT_MAX_HEALTH = 3;

function isVineSpiritCell(cell) {
  return !!(
    cell &&
    cell.entityCategory === "reactive_ball" &&
    cell.entityType === "vine_spirit"
  );
}

function isWormholeCell(cell) {
  return !!(
    cell &&
    cell.entityCategory === "reactive_ball" &&
    cell.entityType === "wormhole"
  );
}

function isVineProtectedCell(cell) {
  return !!(
    cell &&
    (
      isVineSpiritCell(cell) ||
      (cell.entityCategory === "normal_ball" && typeof cell.vineOwnerId === "string" && cell.vineOwnerId)
    )
  );
}

function collectOccupiedRows(cells) {
  var rowMap = {};
  (cells || []).forEach(function (cell) {
    if (!cell || !Number.isInteger(cell.row)) {
      throw new Error("BubbleGrid cell row must be an integer.");
    }
    rowMap[cell.row] = true;
  });
  return Object.keys(rowMap).map(function (row) {
    return Number(row);
  }).sort(function (a, b) {
    return a - b;
  });
}

function assertNoDuplicateCellCoordinates(cells) {
  var occupied = {};
  (cells || []).forEach(function (cell) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("BubbleGrid cell coordinates must be integers.");
    }
    var key = keyFor(cell.row, cell.col);
    if (occupied[key]) {
      throw new Error("BubbleGrid contains duplicate cell coordinates: " + key);
    }
    occupied[key] = true;
  });
}

function createSpecialEntityRecord(entity, row, col) {
  var lockedColor = null;
  if (entity.entityCategory === "locked_ball" && entity.entityType === "locked") {
    if (typeof entity.lockedColor !== "string" || !entity.lockedColor) {
      throw new Error("Locked special entity requires lockedColor.");
    }
    lockedColor = entity.lockedColor;
  }

  var record = {
    id: entity.id || ("special_" + row + "_" + col),
    entityCategory: entity.entityCategory,
    entityType: entity.entityType,
    innerColor: entity.innerColor || null,
    splitColor: entity.splitColor || null,
    lockedColor: lockedColor,
    blastRadius: Number.isInteger(entity.blastRadius) ? entity.blastRadius : null,
    moveDirection: typeof entity.moveDirection === "string" && entity.moveDirection
      ? entity.moveDirection
      : null,
    row: row,
    col: col
  };
  if (entity.entityCategory === "reactive_ball" && entity.entityType === "vine_spirit") {
    record.health = Number.isInteger(entity.health) ? entity.health : VINE_SPIRIT_MAX_HEALTH;
    record.maxHealth = VINE_SPIRIT_MAX_HEALTH;
  }
  return record;
}

function BubbleGrid() {
  BaseSystem.call(this, "BubbleGrid");
  this.layout = [];
  this.specialEntities = [];
  this.coordinateSystem = "odd-r-hex";
  this.cells = [];
  this.maxColumns = 0;
  this.version = 0;
  this.boardViewport = null;
  this._cellMap = {};
  this._cellsByRow = {};
  this._specialCellMap = {};
  this._vineOwnerByCell = {};
  this._vinePreviewOwnerByCell = {};
}

BubbleGrid.prototype = Object.create(BaseSystem.prototype);
BubbleGrid.prototype.constructor = BubbleGrid;

BubbleGrid.prototype.attachBoardViewport = function (boardViewport) {
  if (!boardViewport || typeof boardViewport.getOffsetY !== "function") {
    throw new Error("BubbleGrid.attachBoardViewport requires BoardViewportSystem.");
  }
  this.boardViewport = boardViewport;
  return this;
};

BubbleGrid.prototype._requireViewportOffsetY = function () {
  if (!this.boardViewport || typeof this.boardViewport.getOffsetY !== "function") {
    throw new Error("BubbleGrid requires attached BoardViewportSystem.");
  }
  return this.boardViewport.getOffsetY();
};

BubbleGrid.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  if (!levelConfig || !levelConfig.level) {
    throw new Error("BubbleGrid.configureLevel requires level config.");
  }
  if (!this.boardViewport) {
    throw new Error("BubbleGrid.configureLevel requires attached BoardViewportSystem.");
  }
  if (!Number.isInteger(levelConfig.level.initialDropSpaceRows) || levelConfig.level.initialDropSpaceRows < 8) {
    throw new Error("BubbleGrid requires level.initialDropSpaceRows >= 8.");
  }
  this.layout = levelConfig.level.layout.slice();
  this.specialEntities = Array.isArray(levelConfig.level.specialEntities)
    ? clone(levelConfig.level.specialEntities)
    : [];
  this.coordinateSystem = levelConfig.coordinateSystem || this.coordinateSystem;
  this._vineOwnerByCell = {};
  this._vinePreviewOwnerByCell = {};
  var layoutMaxColumns = this.layout.reduce(function (max, row) {
    return Math.max(max, row.length);
  }, 0);
  if (!Number.isInteger(BoardLayout.defaultColumns) || BoardLayout.defaultColumns <= 0) {
    throw new Error("BoardLayout.defaultColumns must be a positive integer.");
  }
  this.maxColumns = Math.max(BoardLayout.defaultColumns, layoutMaxColumns);
  this._normalizeLayoutRows();
  this._rebuildSpecialCellMap();
  this.version = 1;
  this._rebuildCaches();
  this.boardViewport.planIntroPosition(this.cells);
  this.assertNoVisualOverlap("configureLevel");
  return this;
};

BubbleGrid.prototype.getColumnCountForRow = function (row) {
  return BoardLayout.getRowColumnCount(row, this.maxColumns);
};

BubbleGrid.prototype.isValidCell = function (row, col) {
  return row >= 0 && col >= 0 && col < this.getColumnCountForRow(row);
};

BubbleGrid.prototype._normalizeRowString = function (rowIndex, rowString) {
  var rowColumns = this.getColumnCountForRow(rowIndex);
  var source = typeof rowString === "string" ? rowString : "";
  var normalized = source.slice(0, rowColumns);

  if (normalized.length < rowColumns) {
    normalized += ".".repeat(rowColumns - normalized.length);
  }

  return normalized;
};

BubbleGrid.prototype._normalizeLayoutRows = function () {
  this.layout = this.layout.map(function (rowString, rowIndex) {
    return this._normalizeRowString(rowIndex, rowString);
  }, this);
};

BubbleGrid.prototype._rebuildSpecialCellMap = function () {
  this._specialCellMap = {};

  (this.specialEntities || []).forEach(function (entity) {
    if (!entity || !this.isValidCell(entity.row, entity.col)) {
      return;
    }

    this._specialCellMap[keyFor(entity.row, entity.col)] = createSpecialEntityRecord(entity, entity.row, entity.col);
  }, this);
};

BubbleGrid.prototype._createNormalCell = function (row, col, colorCode) {
  var cellKey = keyFor(row, col);
  return {
    row: row,
    col: col,
    color: colorCode,
    id: row + "_" + col,
    entityCategory: "normal_ball",
    entityType: null,
    vineOwnerId: Object.prototype.hasOwnProperty.call(this._vineOwnerByCell, cellKey)
      ? this._vineOwnerByCell[cellKey]
      : null,
    vinePreviewOwnerId: Object.prototype.hasOwnProperty.call(this._vinePreviewOwnerByCell, cellKey)
      ? this._vinePreviewOwnerByCell[cellKey]
      : null,
    isSpecial: false
  };
};

BubbleGrid.prototype._createSpecialCell = function (entity, row, col) {
  var lockedColor = null;
  if (entity.entityCategory === "locked_ball" && entity.entityType === "locked") {
    if (typeof entity.lockedColor !== "string" || !entity.lockedColor) {
      throw new Error("Locked special cell requires lockedColor.");
    }
    lockedColor = entity.lockedColor;
  }

  var cell = {
    row: row,
    col: col,
    color: null,
    id: entity.id || ("special_" + row + "_" + col),
    entityCategory: entity.entityCategory,
    entityType: entity.entityType,
    innerColor: entity.innerColor || null,
    splitColor: entity.splitColor || null,
    lockedColor: lockedColor,
    blastRadius: Number.isInteger(entity.blastRadius) ? entity.blastRadius : null,
    moveDirection: typeof entity.moveDirection === "string" && entity.moveDirection
      ? entity.moveDirection
      : null,
    isSpecial: true
  };
  if (isVineSpiritCell(entity)) {
    if (!Number.isInteger(entity.health) || entity.health <= 0 || entity.health > VINE_SPIRIT_MAX_HEALTH) {
      throw new Error("Vine spirit special cell requires health in [1, 3].");
    }
    cell.health = entity.health;
    cell.maxHealth = VINE_SPIRIT_MAX_HEALTH;
  }
  return cell;
};

BubbleGrid.prototype._rebuildCaches = function () {
  this.cells = [];
  this._cellMap = {};
  this._cellsByRow = {};

  this.layout.forEach(function (row, rowIndex) {
    var normalizedRow = this._normalizeRowString(rowIndex, row);
    this.layout[rowIndex] = normalizedRow;
    normalizedRow.split("").forEach(function (cellCode, columnIndex) {
      if (cellCode === ".") {
        return;
      }

      var cell = this._createNormalCell(rowIndex, columnIndex, cellCode);

      this.cells.push(cell);
      this._cellMap[keyFor(rowIndex, columnIndex)] = cell;
      this._pushCellToRowBucket(cell);
    }, this);
  }, this);

  Object.keys(this._specialCellMap).forEach(function (key) {
    if (this._cellMap[key]) {
      // Keep normal layout data authoritative when overlap happens by mistake.
      return;
    }

    var entity = this._specialCellMap[key];
    var specialCell = this._createSpecialCell(entity, entity.row, entity.col);
    this.cells.push(specialCell);
    this._cellMap[key] = specialCell;
    this._pushCellToRowBucket(specialCell);
  }, this);
};

BubbleGrid.prototype._pushCellToRowBucket = function (cell) {
  if (!cell || !Number.isInteger(cell.row)) {
    throw new Error("BubbleGrid row bucket requires integer cell.row.");
  }
  var rowKey = String(cell.row);
  if (!this._cellsByRow[rowKey]) {
    this._cellsByRow[rowKey] = [];
  }
  this._cellsByRow[rowKey].push(cell);
};

BubbleGrid.prototype._resolveSegmentPaddingRows = function (collisionRadius) {
  var radius = typeof collisionRadius === "number" ? collisionRadius : BoardLayout.bubbleDiameter;
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error("BubbleGrid segment padding requires positive collision radius.");
  }
  var rowHeight = BoardLayout.rowHeight;
  if (typeof rowHeight !== "number" || !Number.isFinite(rowHeight) || rowHeight <= 0) {
    throw new Error("BoardLayout.rowHeight must be a positive number.");
  }
  return Math.ceil(radius / rowHeight) + 1;
};

BubbleGrid.prototype._resolveSegmentRowBounds = function (startPoint, endPoint, paddingRows) {
  if (!startPoint || !endPoint) {
    throw new Error("BubbleGrid segment row bounds require start and end points.");
  }
  var rowHeight = BoardLayout.rowHeight;
  if (typeof rowHeight !== "number" || !Number.isFinite(rowHeight) || rowHeight <= 0) {
    throw new Error("BoardLayout.rowHeight must be a positive number.");
  }
  var padding = Math.max(0, Math.floor(Number(paddingRows) || 0));
  var minSegmentY = Math.min(startPoint.y, endPoint.y);
  var maxSegmentY = Math.max(startPoint.y, endPoint.y);
  var viewportOffsetY = this._requireViewportOffsetY();
  var minRow = Math.floor((BoardLayout.boardStartY - maxSegmentY + viewportOffsetY) / rowHeight) - padding;
  var maxRow = Math.ceil((BoardLayout.boardStartY - minSegmentY + viewportOffsetY) / rowHeight) + padding;
  return {
    minRow: Math.max(0, minRow),
    maxRow: Math.min(this.getRowCount() + 1, maxRow)
  };
};

BubbleGrid.prototype._iterateCellsNearSegment = function (startPoint, endPoint, paddingRows, callback) {
  if (typeof callback !== "function") {
    throw new Error("BubbleGrid segment iteration requires callback.");
  }
  var bounds = this._resolveSegmentRowBounds(startPoint, endPoint, paddingRows);
  for (var row = bounds.minRow; row <= bounds.maxRow; row += 1) {
    var rowCells = this._cellsByRow[String(row)];
    if (!rowCells || !rowCells.length) {
      continue;
    }
    for (var cellIndex = 0; cellIndex < rowCells.length; cellIndex += 1) {
      callback.call(this, rowCells[cellIndex]);
    }
  }
};

BubbleGrid.prototype._testSegmentCircleHit = function (cell, startPoint, segment, segmentLengthSq, radius) {
  var center = this.getCellPosition(cell.row, cell.col);
  var startToCenter = {
    x: startPoint.x - center.x,
    y: startPoint.y - center.y
  };
  var radiusSq = radius * radius;
  var c = dot(startToCenter, startToCenter) - radiusSq;
  var hitT = null;

  if (c <= 0) {
    hitT = 0;
  } else if (segmentLengthSq > EPSILON) {
    var b = 2 * dot(segment, startToCenter);
    var discriminant = b * b - 4 * segmentLengthSq * c;
    if (discriminant >= 0) {
      var sqrtDiscriminant = Math.sqrt(discriminant);
      var t1 = (-b - sqrtDiscriminant) / (2 * segmentLengthSq);
      var t2 = (-b + sqrtDiscriminant) / (2 * segmentLengthSq);

      if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
        hitT = clamp(t1, 0, 1);
      } else if (t2 >= -EPSILON && t2 <= 1 + EPSILON) {
        hitT = clamp(t2, 0, 1);
      }
    }
  }

  if (hitT === null) {
    return null;
  }

  return {
    cell: cell,
    center: center,
    t: hitT,
    distanceToStartSq: c
  };
};

BubbleGrid.prototype._shouldReplaceSegmentHit = function (currentBest, candidate) {
  if (!candidate) {
    return false;
  }
  if (!currentBest) {
    return true;
  }
  return (
    candidate.t < currentBest.t - EPSILON ||
    (Math.abs(candidate.t - currentBest.t) <= EPSILON && candidate.distanceToStartSq < currentBest.distanceToStartSq)
  );
};

BubbleGrid.prototype._buildSegmentCollisionResult = function (bestHit, startPoint, segment) {
  var hitPoint = {
    x: startPoint.x + segment.x * bestHit.t,
    y: startPoint.y + segment.y * bestHit.t
  };
  var hitNormal = normalize({
    x: hitPoint.x - bestHit.center.x,
    y: hitPoint.y - bestHit.center.y
  });

  if (Math.abs(hitNormal.x) <= 0.0001 && Math.abs(hitNormal.y) <= 0.0001) {
    hitNormal = normalize({
      x: -segment.x,
      y: -segment.y
    });
  }

  return {
    cell: clone(bestHit.cell),
    point: hitPoint,
    normal: hitNormal,
    t: bestHit.t
  };
};

BubbleGrid.prototype._ensureRow = function (rowIndex) {
  while (this.layout.length <= rowIndex) {
    this.layout.push(".".repeat(this.getColumnCountForRow(this.layout.length)));
  }
};

BubbleGrid.prototype._setCell = function (row, col, color) {
  this._ensureRow(row);
  var normalizedRow = this._normalizeRowString(row, this.layout[row]);
  var chars = normalizedRow.split("");
  chars[col] = color;
  this.layout[row] = chars.join("");
};

BubbleGrid.prototype._clearSpecialCell = function (row, col) {
  delete this._specialCellMap[keyFor(row, col)];
};

BubbleGrid.prototype.getSpecialEntities = function () {
  return Object.keys(this._specialCellMap).map(function (key) {
    return clone(this._specialCellMap[key]);
  }, this);
};

BubbleGrid.prototype.getRowCount = function () {
  return this.layout.length;
};

BubbleGrid.prototype.getCells = function () {
  return clone(this.cells);
};

BubbleGrid.prototype.getClearableCells = function () {
  return clone(this.cells.filter(function (cell) {
    return !isWormholeCell(cell);
  }));
};

BubbleGrid.prototype.hasWormholePair = function () {
  var wormholeCount = this.cells.filter(isWormholeCell).length;
  if (wormholeCount !== 0 && wormholeCount !== 2) {
    throw new Error("BubbleGrid requires exactly two live wormholes when wormhole is configured.");
  }
  return wormholeCount === 2;
};

BubbleGrid.prototype.getVineSpirits = function () {
  return this.getCells().filter(isVineSpiritCell).sort(function (left, right) {
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    if (left.col !== right.col) {
      return left.col - right.col;
    }
    return String(left.id).localeCompare(String(right.id));
  });
};

BubbleGrid.prototype.findNearestNormalCellForVine = function (spiritCell, reservedCellKeys) {
  if (!isVineSpiritCell(spiritCell)) {
    throw new Error("Vine target selection requires a vine spirit cell.");
  }
  if (!reservedCellKeys || typeof reservedCellKeys !== "object" || Array.isArray(reservedCellKeys)) {
    throw new Error("Vine target selection requires reserved cell key map.");
  }
  Object.keys(reservedCellKeys).forEach(function (reservedKey) {
    if (reservedCellKeys[reservedKey] !== true) {
      throw new Error("Vine target reserved cell key map must contain true flags.");
    }
  });

  var spiritPosition = this.getCellPosition(spiritCell.row, spiritCell.col);
  var candidates = this.getCells().filter(function (cell) {
    if (cell.entityCategory !== "normal_ball" || typeof cell.color !== "string" || !cell.color) {
      return false;
    }
    if (typeof cell.vineOwnerId === "string" && cell.vineOwnerId) {
      return false;
    }
    if (typeof cell.vinePreviewOwnerId === "string" && cell.vinePreviewOwnerId) {
      return false;
    }
    return reservedCellKeys[keyFor(cell.row, cell.col)] !== true;
  }).map(function (cell) {
    var position = this.getCellPosition(cell.row, cell.col);
    var dx = position.x - spiritPosition.x;
    var dy = position.y - spiritPosition.y;
    return {
      cell: cell,
      distanceSq: dx * dx + dy * dy
    };
  }, this).sort(function (left, right) {
    if (left.distanceSq !== right.distanceSq) {
      return left.distanceSq - right.distanceSq;
    }
    if (left.cell.row !== right.cell.row) {
      return left.cell.row - right.cell.row;
    }
    if (left.cell.col !== right.cell.col) {
      return left.cell.col - right.cell.col;
    }
    return String(left.cell.id).localeCompare(String(right.cell.id));
  });

  return candidates.length ? clone(candidates[0].cell) : null;
};

BubbleGrid.prototype.beginVinePreview = function (spiritId, targetCell) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Vine preview requires spiritId.");
  }
  if (!targetCell || !Number.isInteger(targetCell.row) || !Number.isInteger(targetCell.col)) {
    throw new Error("Vine preview requires target cell coordinates.");
  }
  var spirit = this.getVineSpirits().filter(function (cell) {
    return cell.id === spiritId;
  })[0];
  if (!spirit) {
    throw new Error("Vine preview owner is not a live vine spirit: " + spiritId);
  }
  var liveTarget = this.getCell(targetCell.row, targetCell.col);
  if (!liveTarget || liveTarget.entityCategory !== "normal_ball") {
    throw new Error("Vine preview target must be a live normal ball.");
  }
  if (typeof liveTarget.vineOwnerId === "string" && liveTarget.vineOwnerId) {
    throw new Error("Vine preview target is already entangled.");
  }
  if (typeof liveTarget.vinePreviewOwnerId === "string" && liveTarget.vinePreviewOwnerId) {
    throw new Error("Vine preview target already has a preview owner.");
  }
  this._vinePreviewOwnerByCell[keyFor(liveTarget.row, liveTarget.col)] = spiritId;
  this.version += 1;
  this._rebuildCaches();
  return this.getCell(liveTarget.row, liveTarget.col);
};

BubbleGrid.prototype.completeVineEntanglement = function (spiritId, targetCell) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Vine entanglement requires spiritId.");
  }
  if (!targetCell || !Number.isInteger(targetCell.row) || !Number.isInteger(targetCell.col)) {
    throw new Error("Vine entanglement requires target cell coordinates.");
  }
  var cellKey = keyFor(targetCell.row, targetCell.col);
  if (this._vinePreviewOwnerByCell[cellKey] !== spiritId) {
    throw new Error("Vine entanglement preview owner mismatch at " + cellKey + ".");
  }
  var liveTarget = this.getCell(targetCell.row, targetCell.col);
  if (!liveTarget || liveTarget.entityCategory !== "normal_ball") {
    throw new Error("Vine entanglement target must remain a live normal ball.");
  }
  delete this._vinePreviewOwnerByCell[cellKey];
  this._vineOwnerByCell[cellKey] = spiritId;
  this.version += 1;
  this._rebuildCaches();
  return this.getCell(targetCell.row, targetCell.col);
};

BubbleGrid.prototype.removeVineAt = function (row, col) {
  var cellKey = keyFor(row, col);
  var ownerId = this._vineOwnerByCell[cellKey];
  if (typeof ownerId !== "string" || !ownerId) {
    throw new Error("Vine removal requires an entangled normal ball at " + cellKey + ".");
  }
  var liveCell = this.getCell(row, col);
  if (!liveCell || liveCell.entityCategory !== "normal_ball") {
    throw new Error("Vine removal target must be a live normal ball at " + cellKey + ".");
  }
  delete this._vineOwnerByCell[cellKey];
  this.version += 1;
  this._rebuildCaches();
  liveCell.vineOwnerId = ownerId;
  liveCell.vinePreviewOwnerId = null;
  return liveCell;
};

BubbleGrid.prototype._clearVinesByOwner = function (spiritId) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Vine owner cleanup requires spiritId.");
  }
  var clearedVines = [];
  Object.keys(this._vineOwnerByCell).forEach(function (cellKey) {
    if (this._vineOwnerByCell[cellKey] !== spiritId) {
      return;
    }
    var coordinates = cellKey.split(":").map(Number);
    clearedVines.push({
      ownerId: spiritId,
      row: coordinates[0],
      col: coordinates[1],
      cellId: coordinates[0] + "_" + coordinates[1]
    });
    delete this._vineOwnerByCell[cellKey];
  }, this);
  Object.keys(this._vinePreviewOwnerByCell).forEach(function (cellKey) {
    if (this._vinePreviewOwnerByCell[cellKey] === spiritId) {
      delete this._vinePreviewOwnerByCell[cellKey];
    }
  }, this);
  return clearedVines;
};

BubbleGrid.prototype.damageVineSpirit = function (spiritId) {
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Vine spirit damage requires spiritId.");
  }
  var spiritKey = null;
  var spiritRecord = null;
  Object.keys(this._specialCellMap).forEach(function (cellKey) {
    var candidate = this._specialCellMap[cellKey];
    if (candidate.id !== spiritId) {
      return;
    }
    if (!isVineSpiritCell(candidate)) {
      throw new Error("Vine spirit damage id belongs to another special entity: " + spiritId);
    }
    spiritKey = cellKey;
    spiritRecord = candidate;
  }, this);
  if (!spiritRecord || !spiritKey) {
    throw new Error("Vine spirit damage requires a live spirit: " + spiritId);
  }
  if (!Number.isInteger(spiritRecord.health) || spiritRecord.health <= 0 || spiritRecord.health > VINE_SPIRIT_MAX_HEALTH) {
    throw new Error("Vine spirit runtime health is invalid: " + spiritId);
  }

  var healthBefore = spiritRecord.health;
  spiritRecord.health -= 1;
  var destroyed = spiritRecord.health === 0;
  var clearedVines = [];
  if (destroyed) {
    delete this._specialCellMap[spiritKey];
    clearedVines = this._clearVinesByOwner(spiritId);
  }

  this.version += 1;
  this._rebuildCaches();
  return {
    spiritId: spiritId,
    row: spiritRecord.row,
    col: spiritRecord.col,
    healthBefore: healthBefore,
    healthAfter: destroyed ? 0 : spiritRecord.health,
    destroyed: destroyed,
    clearedVines: clearedVines
  };
};

BubbleGrid.prototype.assertNoVisualOverlap = function (source) {
  assertNoDuplicateCellCoordinates(this.cells);
  if (!DebugFlags.get("gridOverlapCheck")) {
    return true;
  }

  for (var leftIndex = 0; leftIndex < this.cells.length; leftIndex += 1) {
    var leftCell = this.cells[leftIndex];
    var leftPosition = this.getCellPosition(leftCell.row, leftCell.col);
    for (var rightIndex = leftIndex + 1; rightIndex < this.cells.length; rightIndex += 1) {
      var rightCell = this.cells[rightIndex];
      var rightPosition = this.getCellPosition(rightCell.row, rightCell.col);
      var dx = leftPosition.x - rightPosition.x;
      var dy = leftPosition.y - rightPosition.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < MIN_VISUAL_CELL_DISTANCE) {
        throw new Error(
          "BubbleGrid visual overlap after " + source + ": " +
          keyFor(leftCell.row, leftCell.col) + " and " + keyFor(rightCell.row, rightCell.col)
        );
      }
    }
  }
  return true;
};

BubbleGrid.prototype.getMaxColumns = function () {
  return this.maxColumns;
};

BubbleGrid.prototype.getViewportOffsetY = function () {
  return this._requireViewportOffsetY();
};

BubbleGrid.prototype.getCell = function (row, col) {
  var cell = this._cellMap[keyFor(row, col)];
  return cell ? clone(cell) : null;
};

BubbleGrid.prototype.hasCell = function (row, col) {
  return !!this._cellMap[keyFor(row, col)];
};

BubbleGrid.prototype.getCellPosition = function (row, col) {
  return BoardLayout.getCellPosition(row, col, this.maxColumns, this._requireViewportOffsetY());
};

BubbleGrid.prototype.getNeighborCoordinates = function (row, col) {
  var offsets = row % 2 === 1 ? [
    { row: -1, col: 0 },
    { row: -1, col: 1 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 }
  ] : [
    { row: -1, col: -1 },
    { row: -1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
    { row: 1, col: -1 },
    { row: 1, col: 0 }
  ];

  return offsets.map(function (offset) {
    return {
      row: row + offset.row,
      col: col + offset.col
    };
  }).filter(function (candidate) {
    return this.isValidCell(candidate.row, candidate.col);
  }, this);
};

BubbleGrid.prototype.getClockwiseNeighborCoordinates = function (row, col) {
  var center = this.getCellPosition(row, col);
  var coordinates = this.getNeighborCoordinates(row, col);
  if (coordinates.length !== 6) {
    throw new Error("BubbleGrid clockwise track requires six valid neighbor cells.");
  }
  return coordinates.map(function (coordinate) {
    var position = this.getCellPosition(coordinate.row, coordinate.col);
    return {
      row: coordinate.row,
      col: coordinate.col,
      angle: Math.atan2(position.y - center.y, position.x - center.x)
    };
  }, this).sort(function (left, right) {
    return right.angle - left.angle;
  }).map(function (coordinate) {
    return {
      row: coordinate.row,
      col: coordinate.col
    };
  });
};

BubbleGrid.prototype.rotateSwirlNeighborsClockwise = function (swirlCell) {
  if (
    !swirlCell ||
    swirlCell.entityCategory !== "reactive_ball" ||
    swirlCell.entityType !== "swirl" ||
    !Number.isInteger(swirlCell.row) ||
    !Number.isInteger(swirlCell.col)
  ) {
    throw new Error("BubbleGrid swirl rotation requires a swirl cell.");
  }
  var liveSwirlCell = this.getCell(swirlCell.row, swirlCell.col);
  if (!liveSwirlCell || liveSwirlCell.id !== swirlCell.id || liveSwirlCell.entityType !== "swirl") {
    throw new Error("BubbleGrid swirl rotation requires the live swirl center.");
  }

  var track = this.getClockwiseNeighborCoordinates(swirlCell.row, swirlCell.col);
  var occupiedBefore = [];
  var colorCountsBefore = {};
  track.forEach(function (coordinate) {
    var cell = this.getCell(coordinate.row, coordinate.col);
    if (!cell) {
      occupiedBefore.push(null);
      return;
    }
    if (cell.entityCategory !== "normal_ball" || typeof cell.color !== "string" || !cell.color) {
      throw new Error(
        "BubbleGrid swirl track only supports normal colored bubbles at " + coordinate.row + ":" + coordinate.col + "."
      );
    }
    occupiedBefore.push(cell);
    if (!Object.prototype.hasOwnProperty.call(colorCountsBefore, cell.color)) {
      colorCountsBefore[cell.color] = 0;
    }
    colorCountsBefore[cell.color] += 1;
  }, this);

  if (occupiedBefore.every(function (cell) { return cell === null; })) {
    return [];
  }

  track.forEach(function (coordinate) {
    delete this._vineOwnerByCell[keyFor(coordinate.row, coordinate.col)];
    delete this._vinePreviewOwnerByCell[keyFor(coordinate.row, coordinate.col)];
    this._setCell(coordinate.row, coordinate.col, ".");
  }, this);

  var moves = [];
  occupiedBefore.forEach(function (cell, sourceIndex) {
    if (!cell) {
      return;
    }
    var source = track[sourceIndex];
    var target = track[(sourceIndex + 1) % track.length];
    this._setCell(target.row, target.col, cell.color);
    if (typeof cell.vineOwnerId === "string" && cell.vineOwnerId) {
      this._vineOwnerByCell[keyFor(target.row, target.col)] = cell.vineOwnerId;
    }
    if (typeof cell.vinePreviewOwnerId === "string" && cell.vinePreviewOwnerId) {
      this._vinePreviewOwnerByCell[keyFor(target.row, target.col)] = cell.vinePreviewOwnerId;
    }
    moves.push({
      color: cell.color,
      fromRow: source.row,
      fromCol: source.col,
      toRow: target.row,
      toCol: target.col,
      targetCellId: target.row + "_" + target.col
    });
  }, this);

  this.version += 1;
  this._rebuildCaches();
  this.assertNoVisualOverlap("swirl rotation");

  var occupiedAfter = this.getNeighborCells(swirlCell.row, swirlCell.col);
  var colorCountsAfter = {};
  occupiedAfter.forEach(function (cell) {
    if (cell.entityCategory !== "normal_ball" || typeof cell.color !== "string" || !cell.color) {
      throw new Error("BubbleGrid swirl rotation produced a non-normal track cell.");
    }
    if (!Object.prototype.hasOwnProperty.call(colorCountsAfter, cell.color)) {
      colorCountsAfter[cell.color] = 0;
    }
    colorCountsAfter[cell.color] += 1;
  });
  if (occupiedAfter.length !== moves.length) {
    throw new Error("BubbleGrid swirl rotation changed the number of track bubbles.");
  }
  if (buildColorCountSignature(colorCountsAfter) !== buildColorCountSignature(colorCountsBefore)) {
    throw new Error("BubbleGrid swirl rotation changed track colors.");
  }
  return moves;
};

BubbleGrid.prototype.shiftWormholeInterior = function () {
  var wormholes = this.getCells().filter(isWormholeCell).sort(function (left, right) {
    return left.col - right.col;
  });
  if (!wormholes.length) {
    return null;
  }
  if (wormholes.length !== 2) {
    throw new Error("BubbleGrid wormhole shift requires exactly two wormholes.");
  }
  var leftWormhole = wormholes[0];
  var rightWormhole = wormholes[1];
  if (leftWormhole.row !== rightWormhole.row) {
    throw new Error("BubbleGrid wormholes must remain on the same row.");
  }
  if (rightWormhole.col - leftWormhole.col < 2) {
    throw new Error("BubbleGrid wormholes require at least one interior slot.");
  }
  if (
    (leftWormhole.moveDirection !== "left" && leftWormhole.moveDirection !== "right") ||
    leftWormhole.moveDirection !== rightWormhole.moveDirection
  ) {
    throw new Error("BubbleGrid wormhole pair requires matching left/right moveDirection.");
  }

  var track = [];
  for (var col = leftWormhole.col + 1; col < rightWormhole.col; col += 1) {
    if (!this.isValidCell(leftWormhole.row, col)) {
      throw new Error("BubbleGrid wormhole interior contains an invalid cell.");
    }
    track.push({ row: leftWormhole.row, col: col });
  }
  var occupiedBefore = track.map(function (coordinate) {
    return this.getCell(coordinate.row, coordinate.col);
  }, this);
  var occupiedCountBefore = occupiedBefore.filter(Boolean).length;

  track.forEach(function (coordinate) {
    var coordinateKey = keyFor(coordinate.row, coordinate.col);
    delete this._vineOwnerByCell[coordinateKey];
    delete this._vinePreviewOwnerByCell[coordinateKey];
    this._clearSpecialCell(coordinate.row, coordinate.col);
    this._setCell(coordinate.row, coordinate.col, ".");
  }, this);

  var directionStep = leftWormhole.moveDirection === "right" ? 1 : -1;
  var moves = [];
  occupiedBefore.forEach(function (cell, sourceIndex) {
    if (!cell) {
      return;
    }
    var targetIndex = (sourceIndex + directionStep + track.length) % track.length;
    var source = track[sourceIndex];
    var target = track[targetIndex];
    var targetKey = keyFor(target.row, target.col);
    var targetCellId = null;
    if (cell.entityCategory === "normal_ball") {
      if (typeof cell.color !== "string" || !cell.color) {
        throw new Error("BubbleGrid wormhole normal cell requires color.");
      }
      this._setCell(target.row, target.col, cell.color);
      if (typeof cell.vineOwnerId === "string" && cell.vineOwnerId) {
        this._vineOwnerByCell[targetKey] = cell.vineOwnerId;
      }
      if (typeof cell.vinePreviewOwnerId === "string" && cell.vinePreviewOwnerId) {
        this._vinePreviewOwnerByCell[targetKey] = cell.vinePreviewOwnerId;
      }
      targetCellId = target.row + "_" + target.col;
    } else {
      this._setCell(target.row, target.col, ".");
      this._specialCellMap[targetKey] = createSpecialEntityRecord(cell, target.row, target.col);
      targetCellId = String(cell.id);
    }
    moves.push({
      cellId: String(cell.id),
      entityCategory: cell.entityCategory,
      entityType: cell.entityType,
      fromRow: source.row,
      fromCol: source.col,
      toRow: target.row,
      toCol: target.col,
      targetCellId: targetCellId
    });
  }, this);

  this.version += 1;
  this._rebuildCaches();
  this.assertNoVisualOverlap("wormhole shift");
  var occupiedCountAfter = track.reduce(function (count, coordinate) {
    return count + (this.hasCell(coordinate.row, coordinate.col) ? 1 : 0);
  }.bind(this), 0);
  if (occupiedCountAfter !== occupiedCountBefore) {
    throw new Error("BubbleGrid wormhole shift changed the number of occupied interior cells.");
  }
  return {
    row: leftWormhole.row,
    leftWormholeId: leftWormhole.id,
    leftCol: leftWormhole.col,
    rightWormholeId: rightWormhole.id,
    rightCol: rightWormhole.col,
    moveDirection: leftWormhole.moveDirection,
    slotCount: track.length,
    moves: moves
  };
};

BubbleGrid.prototype.getNeighborCells = function (row, col) {
  return this.getNeighborCoordinates(row, col).map(function (candidate) {
    return this.getCell(candidate.row, candidate.col);
  }, this).filter(Boolean);
};

BubbleGrid.prototype.getOccupiedNeighborCount = function (row, col) {
  return this.getNeighborCoordinates(row, col).reduce(function (count, neighbor) {
    return count + (this.hasCell(neighbor.row, neighbor.col) ? 1 : 0);
  }.bind(this), 0);
};


BubbleGrid.prototype.getOccupiedNeighborStats = function (row, col) {
  return this.getNeighborCoordinates(row, col).reduce(function (stats, neighbor) {
    if (!this.hasCell(neighbor.row, neighbor.col)) {
      return stats;
    }

    stats.total += 1;
    if (neighbor.row < row) {
      stats.upper += 1;
    } else if (neighbor.row === row) {
      stats.same += 1;
    } else {
      stats.lower += 1;
    }

    return stats;
  }.bind(this), {
    total: 0,
    upper: 0,
    same: 0,
    lower: 0
  });
};

BubbleGrid.prototype.isAttachableCell = function (row, col, direction, options) {
  options = options || {};

  if (!this.isValidCell(row, col) || this.hasCell(row, col)) {
    return false;
  }

  if (row === 0) {
    return options.allowTopRow !== false;
  }

  var minOccupiedNeighbors = typeof options.minOccupiedNeighbors === "number"
    ? Math.max(1, Math.floor(options.minOccupiedNeighbors))
    : 1;
  var minUpperOccupiedNeighbors = typeof options.minUpperOccupiedNeighbors === "number"
    ? Math.max(0, Math.floor(options.minUpperOccupiedNeighbors))
    : 0;
  var occupiedStats = this.getOccupiedNeighborStats(row, col);

  if (occupiedStats.total < minOccupiedNeighbors) {
    return false;
  }

  if (occupiedStats.upper < minUpperOccupiedNeighbors) {
    return false;
  }

  return this._isAttachmentCandidateReachable({ row: row, col: col }, direction || { x: 0, y: 1 });
};

BubbleGrid.prototype.findFirstAttachableSlotOnSegment = function (startPoint, endPoint, direction, slotProbeRadius, slotCaptureTightness) {
  if (!startPoint || !endPoint) {
    return null;
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var a = dot(segment, segment);
  if (a <= EPSILON) {
    return null;
  }

  var radius = typeof slotProbeRadius === "number"
    ? slotProbeRadius
    : Math.max(10, BoardLayout.bubbleRadius * 0.62);
  var captureTightness = typeof slotCaptureTightness === "number"
    ? clamp(slotCaptureTightness, 0.45, 1)
    : 0.78;
  var captureRadius = radius * captureTightness;
  var captureRadiusSq = captureRadius * captureRadius;
  var minEntryAlignment = this.levelConfig &&
    this.levelConfig.level &&
    typeof this.levelConfig.level.aimSlotOpenMinAlignment === "number"
    ? clamp(this.levelConfig.level.aimSlotOpenMinAlignment, -0.2, 0.95)
    : 0.2;

  var slotPaddingRows = Math.ceil(radius / BoardLayout.rowHeight) + 2;
  var rowBounds = this._resolveSegmentRowBounds(startPoint, endPoint, slotPaddingRows);
  var best = null;

  for (var row = rowBounds.minRow; row <= rowBounds.maxRow; row += 1) {
    for (var col = 0; col < this.getColumnCountForRow(row); col += 1) {
      if (!this.isAttachableCell(row, col, direction, { minOccupiedNeighbors: 2, minUpperOccupiedNeighbors: 1, allowTopRow: true })) {
        continue;
      }

      var center = this.getCellPosition(row, col);
      var toStart = {
        x: startPoint.x - center.x,
        y: startPoint.y - center.y
      };
      var b = 2 * dot(segment, toStart);
      var c = dot(toStart, toStart) - radius * radius;
      var discriminant = b * b - 4 * a * c;
      if (discriminant < 0) {
        continue;
      }

      var sqrtDiscriminant = Math.sqrt(discriminant);
      var t1 = (-b - sqrtDiscriminant) / (2 * a);
      var t2 = (-b + sqrtDiscriminant) / (2 * a);
      var hitT = null;

      if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
        hitT = clamp(t1, 0, 1);
      } else if (t2 >= -EPSILON && t2 <= 1 + EPSILON) {
        hitT = clamp(t2, 0, 1);
      }

      if (hitT === null) {
        continue;
      }

      var centerT = clamp(-dot(segment, toStart) / a, 0, 1);
      var closestPoint = {
        x: startPoint.x + segment.x * centerT,
        y: startPoint.y + segment.y * centerT
      };
      var dxClosest = closestPoint.x - center.x;
      var dyClosest = closestPoint.y - center.y;
      var closestDistanceSq = dxClosest * dxClosest + dyClosest * dyClosest;
      if (closestDistanceSq > captureRadiusSq) {
        continue;
      }

      var entryAssessment = this._buildSlotEntryAssessment(row, col, direction || segment, minEntryAlignment);
      if (!entryAssessment.allowed) {
        continue;
      }

      var captureDistanceRatio = 1 - clamp(Math.sqrt(closestDistanceSq) / Math.max(captureRadius, EPSILON), 0, 1);
      var slotConfidence = clamp(
        captureDistanceRatio * 0.45 +
        entryAssessment.alignmentScore * 0.35 +
        entryAssessment.opennessScore * 0.2,
        0,
        1
      );

      if (
        !best ||
        hitT < best.t - EPSILON ||
        (
          Math.abs(hitT - best.t) <= EPSILON &&
          (
            slotConfidence > best.confidence + 0.015 ||
            (
              Math.abs(slotConfidence - best.confidence) <= 0.015 &&
              centerT < best.centerT - EPSILON
            )
          )
        )
      ) {
        best = {
          row: row,
          col: col,
          center: center,
          t: hitT,
          centerT: centerT,
          confidence: slotConfidence,
          entryAlignment: entryAssessment.entryAlignment,
          openNeighborCount: entryAssessment.openNeighborCount,
          point: {
            x: startPoint.x + segment.x * hitT,
            y: startPoint.y + segment.y * hitT
          }
        };
      }
    }
  }

  if (!best) {
    return null;
  }

  return {
    cell: { row: best.row, col: best.col },
    point: best.point,
    center: best.center,
    t: best.t,
    confidence: best.confidence,
    entryAlignment: best.entryAlignment,
    openNeighborCount: best.openNeighborCount
  };
};

BubbleGrid.prototype._buildSlotEntryAssessment = function (row, col, incomingDirection, minEntryAlignment) {
  var center = this.getCellPosition(row, col);
  var openNeighbors = this.getNeighborCoordinates(row, col).filter(function (neighbor) {
    return !this.hasCell(neighbor.row, neighbor.col);
  }, this);

  if (!openNeighbors.length) {
    return {
      allowed: false,
      entryAlignment: -1,
      alignmentScore: 0,
      opennessScore: 0,
      openNeighborCount: 0
    };
  }

  var incoming = normalize(incomingDirection || { x: 0, y: 1 });
  var bestAlignment = -1;

  openNeighbors.forEach(function (neighbor) {
    var neighborPos = this.getCellPosition(neighbor.row, neighbor.col);
    var openDirection = normalize({
      x: center.x - neighborPos.x,
      y: center.y - neighborPos.y
    });
    bestAlignment = Math.max(bestAlignment, dot(incoming, openDirection));
  }, this);

  var threshold = typeof minEntryAlignment === "number" ? minEntryAlignment : 0.2;
  var normalizedAlignment = clamp((bestAlignment - threshold) / Math.max(1 - threshold, EPSILON), 0, 1);
  var opennessScore = clamp(openNeighbors.length / 4, 0, 1);

  return {
    allowed: bestAlignment >= threshold - EPSILON,
    entryAlignment: bestAlignment,
    alignmentScore: normalizedAlignment,
    opennessScore: opennessScore,
    openNeighborCount: openNeighbors.length
  };
};
BubbleGrid.prototype.findCollision = function (point, collisionRadius) {
  var nearest = null;
  var nearestDistance = Number.MAX_VALUE;
  var radius = typeof collisionRadius === "number" ? collisionRadius : BoardLayout.collisionDistance;

  this.cells.forEach(function (cell) {
    var cellPosition = this.getCellPosition(cell.row, cell.col);
    var dx = point.x - cellPosition.x;
    var dy = point.y - cellPosition.y;
    var distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= radius && distance < nearestDistance) {
      nearest = cell;
      nearestDistance = distance;
    }
  }, this);

  return nearest ? clone(nearest) : null;
};

BubbleGrid.prototype.findCollisionOnSegment = function (startPoint, endPoint, collisionRadius) {
  if (!startPoint || !endPoint) {
    return null;
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var a = dot(segment, segment);

  if (a <= EPSILON) {
    var staticCollision = this.findCollision(endPoint, collisionRadius);
    if (!staticCollision) {
      return null;
    }

    var staticCenter = this.getCellPosition(staticCollision.row, staticCollision.col);
    return {
      cell: staticCollision,
      point: clone(endPoint),
      normal: normalize({
        x: endPoint.x - staticCenter.x,
        y: endPoint.y - staticCenter.y
      }),
      t: 1
    };
  }

  var radius = typeof collisionRadius === "number" ? collisionRadius : BoardLayout.bubbleDiameter;
  var bestHit = null;
  var paddingRows = this._resolveSegmentPaddingRows(radius);

  this._iterateCellsNearSegment(startPoint, endPoint, paddingRows, function (cell) {
    var candidate = this._testSegmentCircleHit(cell, startPoint, segment, a, radius);
    if (this._shouldReplaceSegmentHit(bestHit, candidate)) {
      bestHit = candidate;
    }
  });

  if (!bestHit) {
    return null;
  }

  return this._buildSegmentCollisionResult(bestHit, startPoint, segment);
};

BubbleGrid.prototype.findCollisionsOnSegmentForRadii = function (startPoint, endPoint, radii) {
  if (!startPoint || !endPoint) {
    return null;
  }
  if (!Array.isArray(radii) || !radii.length) {
    throw new Error("BubbleGrid.findCollisionsOnSegmentForRadii requires non-empty radii.");
  }

  var segment = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y
  };
  var segmentLengthSq = dot(segment, segment);
  if (segmentLengthSq <= EPSILON) {
    var staticHits = {};
    radii.forEach(function (radiusValue) {
      var radius = typeof radiusValue === "number" ? radiusValue : BoardLayout.bubbleDiameter;
      var staticCollision = this.findCollision(endPoint, radius);
      staticHits[radius] = staticCollision ? {
        cell: staticCollision,
        point: clone(endPoint),
        normal: normalize({
          x: endPoint.x - this.getCellPosition(staticCollision.row, staticCollision.col).x,
          y: endPoint.y - this.getCellPosition(staticCollision.row, staticCollision.col).y
        }),
        t: 1
      } : null;
    }, this);
    return staticHits;
  }

  var uniqueRadii = [];
  var maxRadius = 0;
  radii.forEach(function (radiusValue) {
    var radius = typeof radiusValue === "number" ? radiusValue : BoardLayout.bubbleDiameter;
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error("BubbleGrid.findCollisionsOnSegmentForRadii requires positive radius.");
    }
    if (uniqueRadii.indexOf(radius) === -1) {
      uniqueRadii.push(radius);
    }
    if (radius > maxRadius) {
      maxRadius = radius;
    }
  });

  var bestHits = {};
  uniqueRadii.forEach(function (radius) {
    bestHits[radius] = null;
  });
  var paddingRows = this._resolveSegmentPaddingRows(maxRadius);

  this._iterateCellsNearSegment(startPoint, endPoint, paddingRows, function (cell) {
    uniqueRadii.forEach(function (radius) {
      var candidate = this._testSegmentCircleHit(cell, startPoint, segment, segmentLengthSq, radius);
      if (this._shouldReplaceSegmentHit(bestHits[radius], candidate)) {
        bestHits[radius] = candidate;
      }
    }, this);
  });

  var results = {};
  uniqueRadii.forEach(function (radius) {
    var bestHit = bestHits[radius];
    results[radius] = bestHit ? this._buildSegmentCollisionResult(bestHit, startPoint, segment) : null;
  }, this);
  return results;
};

BubbleGrid.prototype.findAttachmentCell = function (point, collidedCell, direction, previousPoint) {
  if (!collidedCell) {
    return this._findTopSlot(point.x);
  }

  var incomingDirection = direction || { x: 0, y: 1 };
  var candidates = this.getNeighborCoordinates(collidedCell.row, collidedCell.col).filter(function (candidate) {
    if (this.hasCell(candidate.row, candidate.col)) {
      return false;
    }

    return this._isAttachmentCandidateReachable(candidate, incomingDirection);
  }, this);

  if (!candidates.length) {
    candidates = this.getNeighborCoordinates(collidedCell.row, collidedCell.col).filter(function (candidate) {
      return !this.hasCell(candidate.row, candidate.col);
    }, this);
  }

  if (!candidates.length) {
    return this._findTopSlot(point.x);
  }

  var collidedPosition = this.getCellPosition(collidedCell.row, collidedCell.col);
  var contact = this._resolveAttachmentContact(
    previousPoint || point,
    point,
    collidedPosition,
    incomingDirection
  );

  candidates.sort(function (a, b) {
    var posA = this.getCellPosition(a.row, a.col);
    var posB = this.getCellPosition(b.row, b.col);
    var scoreA = this._measureAttachmentScore(contact.point, contact.normal, collidedPosition, posA);
    var scoreB = this._measureAttachmentScore(contact.point, contact.normal, collidedPosition, posB);
    return scoreA - scoreB;
  }.bind(this));

  return candidates[0];
};

BubbleGrid.prototype._isAttachmentCandidateReachable = function (candidate, direction) {
  var openNeighbors = this.getNeighborCoordinates(candidate.row, candidate.col).filter(function (neighbor) {
    return !this.hasCell(neighbor.row, neighbor.col);
  }, this);

  if (!openNeighbors.length) {
    return false;
  }

  var incoming = normalize({
    x: -((direction && direction.x) || 0),
    y: -((direction && direction.y) || 1)
  });
  var candidatePosition = this.getCellPosition(candidate.row, candidate.col);
  var bestAlignment = -1;

  openNeighbors.forEach(function (openNeighbor) {
    var openPosition = this.getCellPosition(openNeighbor.row, openNeighbor.col);
    var escapeVector = normalize({
      x: openPosition.x - candidatePosition.x,
      y: openPosition.y - candidatePosition.y
    });
    bestAlignment = Math.max(bestAlignment, dot(incoming, escapeVector));
  }, this);

  return bestAlignment > -0.05;
};

BubbleGrid.prototype._resolveAttachmentContact = function (previousPoint, currentPoint, collidedPosition, direction) {
  var start = previousPoint || currentPoint;
  var end = currentPoint || previousPoint;
  var fallbackNormal = normalize({
    x: -((direction && direction.x) || 0),
    y: -((direction && direction.y) || 1)
  });
  var segment = {
    x: end.x - start.x,
    y: end.y - start.y
  };
  var radius = BoardLayout.bubbleDiameter;
  var a = dot(segment, segment);
  var contactPoint = null;

  if (a > 0) {
    var toStart = {
      x: start.x - collidedPosition.x,
      y: start.y - collidedPosition.y
    };
    var b = 2 * dot(segment, toStart);
    var c = dot(toStart, toStart) - radius * radius;
    var discriminant = b * b - 4 * a * c;

    if (discriminant >= 0) {
      var sqrtDiscriminant = Math.sqrt(discriminant);
      var t1 = (-b - sqrtDiscriminant) / (2 * a);
      var t2 = (-b + sqrtDiscriminant) / (2 * a);
      var hitT = null;

      if (t1 >= 0 && t1 <= 1) {
        hitT = t1;
      } else if (t2 >= 0 && t2 <= 1) {
        hitT = t2;
      }

      if (hitT !== null) {
        contactPoint = {
          x: start.x + segment.x * hitT,
          y: start.y + segment.y * hitT
        };
      }
    }
  }

  if (!contactPoint) {
    var closestT = a > 0 ? clamp(dot({
      x: collidedPosition.x - start.x,
      y: collidedPosition.y - start.y
    }, segment) / a, 0, 1) : 0;
    var closestPoint = {
      x: start.x + segment.x * closestT,
      y: start.y + segment.y * closestT
    };
    var fallbackFromSegment = normalize({
      x: closestPoint.x - collidedPosition.x,
      y: closestPoint.y - collidedPosition.y
    });
    var resolvedNormal = (Math.abs(fallbackFromSegment.x) > 0.0001 || Math.abs(fallbackFromSegment.y) > 0.0001)
      ? fallbackFromSegment
      : fallbackNormal;

    contactPoint = {
      x: collidedPosition.x + resolvedNormal.x * radius,
      y: collidedPosition.y + resolvedNormal.y * radius
    };
  }

  var contactNormal = normalize({
    x: contactPoint.x - collidedPosition.x,
    y: contactPoint.y - collidedPosition.y
  });

  if (Math.abs(contactNormal.x) <= 0.0001 && Math.abs(contactNormal.y) <= 0.0001) {
    contactNormal = fallbackNormal;
  }

  return {
    point: contactPoint,
    normal: contactNormal
  };
};

BubbleGrid.prototype._measureAttachmentScore = function (contactPoint, contactNormal, collidedPosition, candidatePosition) {
  var candidateVector = normalize({
    x: candidatePosition.x - collidedPosition.x,
    y: candidatePosition.y - collidedPosition.y
  });
  var alignment = clamp(dot(contactNormal, candidateVector), -1, 1);
  var alignmentPenalty = (1 - alignment) * 420;
  var reversePenalty = alignment < -0.2 ? 40000 : 0;
  var dxContact = contactPoint.x - candidatePosition.x;
  var dyContact = contactPoint.y - candidatePosition.y;
  var distancePenalty = dxContact * dxContact + dyContact * dyContact;
  return distancePenalty + alignmentPenalty + reversePenalty;
};

BubbleGrid.prototype._findTopSlot = function (impactX) {
  var row = 0;
  var bestCol = 0;
  var bestDistance = Number.MAX_VALUE;

  for (var col = 0; col < this.getColumnCountForRow(row); col += 1) {
    if (this.hasCell(row, col)) {
      continue;
    }

    var pos = this.getCellPosition(row, col);
    var distance = Math.abs(impactX - pos.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCol = col;
    }
  }

  if (bestDistance < Number.MAX_VALUE) {
    return { row: row, col: bestCol };
  }

  var fallbackRow = this.getRowCount();
  var fallbackColumns = this.getColumnCountForRow(fallbackRow);
  var fallbackBaseX = this.getCellPosition(fallbackRow, 0).x;

  return {
    row: fallbackRow,
    col: Math.max(0, Math.min(fallbackColumns - 1, Math.round((impactX - fallbackBaseX) / BoardLayout.cellWidth)))
  };
};

BubbleGrid.prototype.getCoordinatesWithinRadius = function (row, col, radius) {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error("BubbleGrid.getCoordinatesWithinRadius requires a non-negative integer radius.");
  }

  var visited = {};
  var queue = [{
    row: row,
    col: col,
    distance: 0
  }];
  var result = [];

  for (var cursor = 0; cursor < queue.length; cursor += 1) {
    var current = queue[cursor];
    var key = keyFor(current.row, current.col);
    if (visited[key]) {
      continue;
    }
    visited[key] = true;
    result.push({
      row: current.row,
      col: current.col,
      distance: current.distance
    });
    if (current.distance >= radius) {
      continue;
    }
    this.getNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
      var neighborKey = keyFor(neighbor.row, neighbor.col);
      if (!visited[neighborKey]) {
        queue.push({
          row: neighbor.row,
          col: neighbor.col,
          distance: current.distance + 1
        });
      }
    });
  }

  return result;
};

BubbleGrid.prototype.findSplitterSpawnCell = function (splitterCell) {
  if (!splitterCell || !Number.isInteger(splitterCell.row) || !Number.isInteger(splitterCell.col)) {
    throw new Error("BubbleGrid.findSplitterSpawnCell requires splitter cell coordinates.");
  }

  var candidates = [];
  for (var row = 0; row < this.getRowCount(); row += 1) {
    for (var col = 0; col < this.getColumnCountForRow(row); col += 1) {
      if (this.isAttachableCell(row, col, { x: 0, y: 1 }, { allowTopRow: true })) {
        candidates.push({
          row: row,
          col: col
        });
      }
    }
  }

  if (!candidates.length) {
    return null;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
};

BubbleGrid.prototype.addBubble = function (cell, colorOrBall) {
  var row = cell.row;
  var col = cell.col;

  if (typeof colorOrBall === "string") {
    this._clearSpecialCell(row, col);
    this._setCell(row, col, colorOrBall);
  } else if (colorOrBall && typeof colorOrBall === "object") {
    if (
      colorOrBall.entityCategory === "skill_ball" ||
      colorOrBall.entityCategory === "obstacle_ball" ||
      colorOrBall.entityCategory === "reactive_ball" ||
      colorOrBall.entityCategory === "locked_ball" ||
      colorOrBall.entityCategory === "key_ball"
    ) {
      this._setCell(row, col, ".");
      this._specialCellMap[keyFor(row, col)] = createSpecialEntityRecord(colorOrBall, row, col);
    } else {
      this._clearSpecialCell(row, col);
      this._setCell(row, col, colorOrBall.color || ".");
    }
  } else {
    this._clearSpecialCell(row, col);
    this._setCell(row, col, ".");
  }

  this.version += 1;
  this._rebuildCaches();
  this.assertNoVisualOverlap("addBubble");
  return this.getCell(row, col);
};

BubbleGrid.prototype._removeCellsByMode = function (cells, allowVineDrop) {
  if (typeof allowVineDrop !== "boolean") {
    throw new Error("BubbleGrid cell removal mode requires allowVineDrop boolean.");
  }
  var removed = [];
  var touchedKeys = {};

  (cells || []).forEach(function (cell) {
    if (!cell) {
      return;
    }

    var key = keyFor(cell.row, cell.col);
    if (touchedKeys[key] || !this.hasCell(cell.row, cell.col)) {
      return;
    }

    var liveCell = this.getCell(cell.row, cell.col);
    if (isWormholeCell(liveCell) || (!allowVineDrop && isVineProtectedCell(liveCell))) {
      return;
    }

    if (allowVineDrop) {
      if (isVineSpiritCell(liveCell)) {
        this._clearVinesByOwner(liveCell.id);
      } else if (
        liveCell.entityCategory === "normal_ball" &&
        (
          (typeof liveCell.vineOwnerId === "string" && liveCell.vineOwnerId) ||
          (typeof liveCell.vinePreviewOwnerId === "string" && liveCell.vinePreviewOwnerId)
        )
      ) {
        delete this._vineOwnerByCell[key];
        delete this._vinePreviewOwnerByCell[key];
        liveCell.vineOwnerId = null;
        liveCell.vinePreviewOwnerId = null;
      }
    }

    touchedKeys[key] = true;
    removed.push(liveCell);
    this._setCell(cell.row, cell.col, ".");
    this._clearSpecialCell(cell.row, cell.col);
  }, this);

  if (removed.length) {
    this.version += 1;
    this._rebuildCaches();
    this.assertNoVisualOverlap("removeCells");
  }

  return removed;
};

BubbleGrid.prototype.removeCells = function (cells) {
  return this._removeCellsByMode(cells, false);
};

BubbleGrid.prototype.removeFloatingCells = function (cells) {
  if (!Array.isArray(cells)) {
    throw new Error("BubbleGrid.removeFloatingCells requires cells array.");
  }
  return this._removeCellsByMode(cells, true);
};

BubbleGrid.prototype.getTopAttachY = function () {
  return this.boardViewport.getTopAttachY();
};

BubbleGrid.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.coordinateSystem = this.coordinateSystem;
  snapshot.rowCount = this.getRowCount();
  snapshot.maxColumns = this.maxColumns;
  snapshot.cellCount = this.cells.length;
  snapshot.viewportOffsetY = this.getViewportOffsetY();
  snapshot.topAttachY = this.getTopAttachY();
  snapshot.dangerReached = false;
  snapshot.cells = this.getCells();
  snapshot.specialEntities = this.getSpecialEntities();
  snapshot.version = this.version;
  return snapshot;
};

module.exports = BubbleGrid;























},{"./BaseSystem":"BaseSystem","../../assets/scripts/config/BoardLayout":"BoardLayout","../../assets/scripts/utils/DebugFlags":"DebugFlags"}],
"BubbleShatterRenderer":[function(require,module,exports){
"use strict";

var BundleLoader = require("../../assets/scripts/utils/BundleLoader");
var EFFECT_RESOURCE_PATH = "game/effects/BubbleShatter";
var SHATTER_LIFETIME = 0.48;
var SHATTER_SEQUENCE_INTERVAL_SEC = 0.03;
var FIRST_FRAME_BURST_TIME = 0.055;
var EXPANDED_QUAD_SCALE = 3;
var SHATTER_SPREAD = 0.92;
var SHATTER_GRAVITY = 0.5;
var SHATTER_ROTATION = 2.4;
var SHATTER_FADE_START = 0.62;
var ELIMINATION_DROP_RELEASE_EARLY_SEC = 0.5;
var UV_EPSILON = 0.000001;
var UV_CORNER_EPSILON = 0.0001;
var SCHEDULE_ONCE_REPEAT = 0;
var BATCH_PAYLOAD_MAX = 65535;

function requireDirectorScheduler(description) {
  if (!cc || !cc.director || typeof cc.director.getScheduler !== "function") {
    throw new Error(description + " requires cc.director.getScheduler.");
  }
  var scheduler = cc.director.getScheduler();
  if (!scheduler || typeof scheduler.schedule !== "function" || typeof scheduler.unschedule !== "function") {
    throw new Error(description + " requires director scheduler APIs.");
  }
  return scheduler;
}

function resolvePresentationReleaseDelaySec(lastShatterStartDelaySec) {
  var safeLastStartDelaySec = assertFiniteNumber(lastShatterStartDelaySec, "Presentation release last shatter start delay");
  if (safeLastStartDelaySec < 0) {
    throw new Error("Presentation release last shatter start delay must be non-negative.");
  }
  var shatterVisualLeadSec = SHATTER_LIFETIME * SHATTER_FADE_START - FIRST_FRAME_BURST_TIME;
  return Math.max(0, safeLastStartDelaySec + shatterVisualLeadSec - ELIMINATION_DROP_RELEASE_EARLY_SEC);
}

function assertFiniteNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(fieldName + " must be finite.");
  }
  return numberValue;
}

function assertPositiveNumber(value, fieldName) {
  var numberValue = assertFiniteNumber(value, fieldName);
  if (numberValue <= 0) {
    throw new Error(fieldName + " must be positive.");
  }
  return numberValue;
}

function hashStringToUnit(value) {
  if (typeof value !== "string" || !value) {
    throw new Error("Bubble shatter seed requires non-empty cell id.");
  }
  var hash = 2166136261;
  for (var index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function buildPlayPlanSignature(playPlan) {
  if (!Array.isArray(playPlan)) {
    throw new Error("Bubble shatter play plan signature requires playPlan array.");
  }
  var signature = "";
  for (var index = 0; index < playPlan.length; index += 1) {
    var entry = playPlan[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Bubble shatter play plan signature requires entry objects.");
    }
    if (!entry.cell || (typeof entry.cell.id !== "string" && typeof entry.cell.id !== "number")) {
      throw new Error("Bubble shatter play plan signature requires cell id.");
    }
    if (!Number.isFinite(entry.delaySec) || entry.delaySec < 0) {
      throw new Error("Bubble shatter play plan signature requires non-negative delaySec.");
    }
    if (index > 0) {
      signature += "|";
    }
    signature += String(entry.cell.id) + "@" + entry.delaySec.toFixed(3);
  }
  return signature;
}

function buildUvBasis(spriteFrame) {
  if (!spriteFrame || !spriteFrame.isValid) {
    throw new Error("Bubble shatter requires valid SpriteFrame.");
  }
  var uv = spriteFrame.uv;
  if (!uv || uv.length < 8) {
    throw new Error("Bubble shatter SpriteFrame requires four UV corners.");
  }

  var originX = assertFiniteNumber(uv[0], "Bubble shatter UV origin x");
  var originY = assertFiniteNumber(uv[1], "Bubble shatter UV origin y");
  var axisXX = assertFiniteNumber(uv[2], "Bubble shatter UV right x") - originX;
  var axisXY = assertFiniteNumber(uv[3], "Bubble shatter UV right y") - originY;
  var axisYX = assertFiniteNumber(uv[4], "Bubble shatter UV top x") - originX;
  var axisYY = assertFiniteNumber(uv[5], "Bubble shatter UV top y") - originY;
  var axisXLengthSquared = axisXX * axisXX + axisXY * axisXY;
  var axisYLengthSquared = axisYX * axisYX + axisYY * axisYY;
  if (axisXLengthSquared <= UV_EPSILON || axisYLengthSquared <= UV_EPSILON) {
    throw new Error("Bubble shatter SpriteFrame UV basis is degenerate.");
  }

  var expectedTopRightX = originX + axisXX + axisYX;
  var expectedTopRightY = originY + axisXY + axisYY;
  if (
    Math.abs(expectedTopRightX - Number(uv[6])) > UV_CORNER_EPSILON ||
    Math.abs(expectedTopRightY - Number(uv[7])) > UV_CORNER_EPSILON
  ) {
    throw new Error("Bubble shatter SpriteFrame UV corners must form a parallelogram.");
  }

  return {
    originAxisX: cc.v4(originX, originY, axisXX, axisXY),
    axisY: cc.v4(axisYX, axisYY, axisXLengthSquared, axisYLengthSquared)
  };
}

function assertUnitInterval(value, fieldName) {
  var numberValue = assertFiniteNumber(value, fieldName);
  if (numberValue < 0 || numberValue > 1) {
    throw new Error(fieldName + " must be between 0 and 1.");
  }
  return numberValue;
}

function encodeUnitIntervalToUint16(value, fieldName) {
  return Math.round(assertUnitInterval(value, fieldName) * BATCH_PAYLOAD_MAX);
}

function encodeUint16High(value) {
  return Math.floor(value / 256);
}

function encodeUint16Low(value) {
  return value % 256;
}

function applyBatchPayload(node, payloadColor, seed, normalizedAge) {
  if (!node || !node.isValid) {
    throw new Error("Bubble shatter batch payload requires valid node.");
  }
  if (!payloadColor || typeof payloadColor !== "object") {
    throw new Error("Bubble shatter batch payload requires reusable color.");
  }

  var encodedSeed = encodeUnitIntervalToUint16(seed, "Bubble shatter seed");
  var encodedAge = encodeUnitIntervalToUint16(normalizedAge, "Bubble shatter normalized age");
  payloadColor.r = encodeUint16High(encodedSeed);
  payloadColor.g = encodeUint16Low(encodedSeed);
  payloadColor.b = encodeUint16High(encodedAge);
  payloadColor.a = 255;
  node.color = payloadColor;
  node.opacity = encodeUint16Low(encodedAge);
}

var BubbleShatterSprite = cc.Class({
  extends: cc.Component,

  ctor: function () {
    this._sprite = null;
    this._material = null;
    this._payloadColor = null;
    this._seed = 0;
    this._elapsed = 0;
    this._lifetime = SHATTER_LIFETIME;
    this._playing = false;
    this._releaseHandler = null;
  },

  initialize: function (options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new Error("BubbleShatterSprite initialize options are required.");
    }
    if (!options.material || !options.material.isValid) {
      throw new Error("BubbleShatterSprite requires valid shared material.");
    }
    if (!options.spriteFrame || !options.spriteFrame.isValid) {
      throw new Error("BubbleShatterSprite requires valid SpriteFrame.");
    }
    if (typeof options.releaseHandler !== "function") {
      throw new Error("BubbleShatterSprite requires releaseHandler.");
    }

    var baseWidth = assertPositiveNumber(options.width, "Bubble shatter width");
    var baseHeight = assertPositiveNumber(options.height, "Bubble shatter height");
    var seed = assertFiniteNumber(options.seed, "Bubble shatter seed");

    this._sprite = this.node.getComponent(cc.Sprite);
    if (!this._sprite) {
      throw new Error("BubbleShatterSprite node requires Sprite component.");
    }
    this._sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
    this._sprite.trim = true;
    this._sprite.spriteFrame = options.spriteFrame;
    this.node.setContentSize(baseWidth * EXPANDED_QUAD_SCALE, baseHeight * EXPANDED_QUAD_SCALE);
    this._material = this._sprite.setMaterial(0, options.material);
    if (!this._material) {
      throw new Error("BubbleShatterSprite material is missing.");
    }
    if (!this._payloadColor) {
      this._payloadColor = new cc.Color(0, 0, 0, 255);
    }

    this._elapsed = FIRST_FRAME_BURST_TIME;
    this._lifetime = SHATTER_LIFETIME;
    this._seed = seed;
    this._releaseHandler = options.releaseHandler;
    applyBatchPayload(this.node, this._payloadColor, this._seed, this._elapsed / this._lifetime);
    this._playing = true;
    this.enabled = true;
  },

  stop: function () {
    this._playing = false;
    this._releaseHandler = null;
    this.enabled = false;
  },

  update: function (dt) {
    if (!this._playing) {
      return;
    }
    var deltaTime = assertFiniteNumber(dt, "Bubble shatter delta time");
    if (deltaTime < 0) {
      throw new Error("Bubble shatter delta time cannot be negative.");
    }

    this._elapsed = Math.min(this._lifetime, this._elapsed + deltaTime);
    applyBatchPayload(this.node, this._payloadColor, this._seed, this._elapsed / this._lifetime);
    if (this._elapsed < this._lifetime) {
      return;
    }

    var releaseHandler = this._releaseHandler;
    if (typeof releaseHandler !== "function") {
      throw new Error("BubbleShatterSprite completion requires releaseHandler.");
    }
    this._playing = false;
    this._releaseHandler = null;
    this.enabled = false;
    releaseHandler(this);
  }
});

function BubbleShatterRenderer(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("BubbleShatterRenderer options are required.");
  }
  if (!options.boardLayout || typeof options.boardLayout.getCellPosition !== "function") {
    throw new Error("BubbleShatterRenderer requires BoardLayout.getCellPosition.");
  }
  if (!options.ballResources || typeof options.ballResources !== "object" || Array.isArray(options.ballResources)) {
    throw new Error("BubbleShatterRenderer requires ball resources.");
  }
  if (typeof options.resolveBallCode !== "function") {
    throw new Error("BubbleShatterRenderer requires resolveBallCode.");
  }

  this.boardLayout = options.boardLayout;
  this.ballResources = options.ballResources;
  this.resolveBallCode = options.resolveBallCode;
  this.bubbleWidth = assertPositiveNumber(options.bubbleWidth, "Bubble shatter base width");
  this.bubbleHeight = assertPositiveNumber(options.bubbleHeight, "Bubble shatter base height");
  this.layer = null;
  this.effectAsset = null;
  this.effectLoadPromise = null;
  this.activeComponents = [];
  this.nodePool = [];
  this.sharedMaterials = {};
  this.currentResolution = null;
  this.playedCellIds = {};
  this.pendingCellIds = {};
  this.pendingScheduleCallbacks = {};
  this.presentationCompleteHandler = null;
  this.presentationTrackedResolution = null;
  this.presentationTrackedPlanSignature = "";
  this.presentationCompleteNotified = false;
  this.presentationReleaseCallback = null;
  this.releaseComponentHandler = this._releaseComponent.bind(this);
}

BubbleShatterRenderer.prototype.setPresentationCompleteHandler = function (handler) {
  if (typeof handler !== "function") {
    throw new Error("BubbleShatterRenderer requires presentationCompleteHandler function.");
  }
  this.presentationCompleteHandler = handler;
};

BubbleShatterRenderer.prototype.setLayer = function (layer) {
  if (!layer || !layer.isValid) {
    throw new Error("BubbleShatterRenderer requires valid layer.");
  }
  this.layer = layer;
};

BubbleShatterRenderer.prototype.preload = function () {
  if (cc.game.renderType === cc.game.RENDER_TYPE_CANVAS) {
    throw new Error("Bubble shatter shader requires WebGL renderer.");
  }
  if (this.effectAsset && this.effectAsset.isValid) {
    return Promise.resolve(this.effectAsset);
  }
  if (this.effectLoadPromise) {
    return this.effectLoadPromise;
  }
  if (!cc.EffectAsset) {
    throw new Error("Bubble shatter requires cc.EffectAsset.");
  }

  this.effectLoadPromise = new Promise(function (resolve, reject) {
    BundleLoader.loadRes(EFFECT_RESOURCE_PATH, cc.EffectAsset, function (error, effectAsset) {
      if (error) {
        reject(new Error("Bubble shatter effect load failed: " + error.message));
        return;
      }
      if (!effectAsset || !effectAsset.isValid) {
        reject(new Error("Bubble shatter effect asset is invalid: " + EFFECT_RESOURCE_PATH));
        return;
      }
      this.effectAsset = effectAsset;
      resolve(effectAsset);
    }.bind(this));
  }.bind(this)).catch(function (error) {
    this.effectLoadPromise = null;
    throw error;
  }.bind(this));
  return this.effectLoadPromise;
};

BubbleShatterRenderer.prototype.reset = function () {
  while (this.activeComponents.length > 0) {
    this._releaseComponent(this.activeComponents[this.activeComponents.length - 1], true);
  }
  this._cancelPendingSchedules();
  this._resetPresentationTracking(true);
  this.currentResolution = null;
  this.playedCellIds = {};
};

BubbleShatterRenderer.prototype.releaseAfterGameplayBundleUnload = function () {
  this.reset();
  this.sharedMaterials = {};
  this.effectAsset = null;
  this.effectLoadPromise = null;
};

BubbleShatterRenderer.prototype._resetPresentationTracking = function (notifyComplete) {
  this._cancelPendingPresentationRelease();
  if (notifyComplete === true) {
    this._notifyPresentationComplete();
  }
  this.presentationTrackedResolution = null;
  this.presentationTrackedPlanSignature = "";
  this.presentationCompleteNotified = false;
};

BubbleShatterRenderer.prototype._armPresentationRelease = function (resolution, playPlan) {
  if (!Array.isArray(playPlan)) {
    throw new Error("Bubble shatter presentation release requires playPlan array.");
  }
  this.presentationTrackedResolution = resolution;
  this.presentationCompleteNotified = false;
  if (!playPlan.length) {
    this._notifyPresentationComplete();
    return;
  }
  var lastEntry = playPlan[playPlan.length - 1];
  if (!Number.isFinite(lastEntry.delaySec) || lastEntry.delaySec < 0) {
    throw new Error("Bubble shatter presentation release requires non-negative last delaySec.");
  }
  var releaseDelaySec = resolvePresentationReleaseDelaySec(lastEntry.delaySec);
  this._schedulePresentationRelease(releaseDelaySec);
};

BubbleShatterRenderer.prototype._schedulePresentationRelease = function (delaySec) {
  if (!Number.isFinite(delaySec) || delaySec < 0) {
    throw new Error("Bubble shatter presentation release delaySec must be a non-negative number.");
  }
  this._cancelPendingPresentationRelease();
  if (delaySec <= 0) {
    this._notifyPresentationComplete();
    return;
  }
  if (!this.layer || !this.layer.isValid) {
    throw new Error("Bubble shatter presentation release requires mounted layer.");
  }
  var self = this;
  this.presentationReleaseCallback = function () {
    self.presentationReleaseCallback = null;
    self._notifyPresentationComplete();
  };
  var scheduler = requireDirectorScheduler("Bubble shatter presentation release");
  scheduler.schedule(this.presentationReleaseCallback, this.layer, 0, SCHEDULE_ONCE_REPEAT, delaySec, false);
};

BubbleShatterRenderer.prototype._cancelPendingPresentationRelease = function () {
  if (
    this.presentationReleaseCallback &&
    this.layer &&
    this.layer.isValid
  ) {
    var scheduler = requireDirectorScheduler("Bubble shatter presentation release cancel");
    scheduler.unschedule(this.presentationReleaseCallback, this.layer);
  }
  this.presentationReleaseCallback = null;
};

BubbleShatterRenderer.prototype._notifyPresentationComplete = function () {
  if (this.presentationCompleteNotified) {
    return;
  }
  this.presentationCompleteNotified = true;
  if (typeof this.presentationCompleteHandler !== "function") {
    return;
  }
  this.presentationCompleteHandler();
};

BubbleShatterRenderer.prototype.isCellShatterPending = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Bubble shatter pending lookup requires cell id.");
  }
  return !!this.pendingCellIds[String(cellId)];
};

BubbleShatterRenderer.prototype._cancelPendingSchedules = function () {
  if (this.layer && this.layer.isValid && Object.keys(this.pendingScheduleCallbacks).length > 0) {
    var scheduler = requireDirectorScheduler("Bubble shatter pending schedule cancel");
    for (var cellId in this.pendingScheduleCallbacks) {
      if (Object.prototype.hasOwnProperty.call(this.pendingScheduleCallbacks, cellId)) {
        scheduler.unschedule(this.pendingScheduleCallbacks[cellId], this.layer);
      }
    }
  }
  this.pendingCellIds = {};
  this.pendingScheduleCallbacks = {};
};

BubbleShatterRenderer.prototype._hideBoardBubbleNode = function (cellId, boardBubbleNodes) {
  var sourceNode = boardBubbleNodes[String(cellId)];
  if (sourceNode && sourceNode.isValid) {
    sourceNode.active = false;
  }
};

BubbleShatterRenderer.prototype._getSharedMaterial = function (spritePath, spriteFrame) {
  if (typeof spritePath !== "string" || !spritePath) {
    throw new Error("Bubble shatter shared material requires sprite path.");
  }
  if (!spriteFrame || !spriteFrame.isValid) {
    throw new Error("Bubble shatter shared material requires valid SpriteFrame.");
  }
  var cachedMaterial = this.sharedMaterials[spritePath];
  if (cachedMaterial) {
    if (!cachedMaterial.isValid) {
      throw new Error("Bubble shatter shared material is invalid: " + spritePath);
    }
    return cachedMaterial;
  }
  if (!this.effectAsset || !this.effectAsset.isValid) {
    throw new Error("Bubble shatter shared material requires preloaded effect.");
  }

  var material = cc.Material.create(this.effectAsset);
  if (!material) {
    throw new Error("Bubble shatter shared material creation failed: " + spritePath);
  }
  var uvBasis = buildUvBasis(spriteFrame);
  material.setProperty("uvOriginAxisX", uvBasis.originAxisX);
  material.setProperty("uvAxisY", uvBasis.axisY);
  material.setProperty(
    "motionParams",
    cc.v4(SHATTER_SPREAD, SHATTER_GRAVITY, SHATTER_ROTATION, SHATTER_FADE_START)
  );
  this.sharedMaterials[spritePath] = material;
  return material;
};

BubbleShatterRenderer.prototype._buildPlayPlan = function (resolution) {
  var matchedById = {};
  for (var matchedIndex = 0; matchedIndex < resolution.matched.length; matchedIndex += 1) {
    var matchedCell = resolution.matched[matchedIndex];
    matchedById[String(matchedCell.id)] = matchedCell;
  }

  var entries = [];
  if (Array.isArray(resolution.eliminationSequence) && resolution.eliminationSequence.length > 0) {
    for (var sequenceIndex = 0; sequenceIndex < resolution.eliminationSequence.length; sequenceIndex += 1) {
      var sequenceEntry = resolution.eliminationSequence[sequenceIndex];
      if (!sequenceEntry || typeof sequenceEntry !== "object" || Array.isArray(sequenceEntry)) {
        throw new Error("Bubble shatter elimination sequence entry must be an object.");
      }
      var cellId = String(sequenceEntry.cellId);
      var cell = matchedById[cellId];
      if (!cell) {
        throw new Error("Bubble shatter elimination sequence cell is missing from matched: " + cellId);
      }
      if (!this._isEligibleCell(cell)) {
        continue;
      }
      if (!Number.isFinite(Number(sequenceEntry.delayMs)) || Number(sequenceEntry.delayMs) < 0) {
        throw new Error("Bubble shatter elimination sequence delayMs must be a non-negative number: " + cellId);
      }
      entries.push({
        cell: cell,
        delaySec: Number(sequenceEntry.delayMs) / 1000,
        worldPosition: sequenceEntry.worldPosition
      });
    }
    return entries;
  }

  var eligibleIndex = 0;
  for (var cellIndex = 0; cellIndex < resolution.matched.length; cellIndex += 1) {
    var cell = resolution.matched[cellIndex];
    if (!this._isEligibleCell(cell)) {
      continue;
    }
    entries.push({
      cell: cell,
      delaySec: eligibleIndex * SHATTER_SEQUENCE_INTERVAL_SEC,
      worldPosition: null
    });
    eligibleIndex += 1;
  }
  return entries;
};

BubbleShatterRenderer.prototype._scheduleCellShatter = function (
  entry,
  resolution,
  boardSnapshot,
  boardBubbleNodes,
  spriteFrameCache
) {
  var cell = entry.cell;
  var cellId = String(cell.id);
  if (this.playedCellIds[cellId] || this.pendingCellIds[cellId]) {
    return;
  }

  var delaySec = entry.delaySec;
  if (!Number.isFinite(delaySec) || delaySec < 0) {
    throw new Error("Bubble shatter delay must be a non-negative finite number: " + cellId);
  }

  var playPosition = this._resolveCellPosition(cell, resolution, boardSnapshot, boardBubbleNodes, entry.worldPosition);
  var self = this;
  var callback = function () {
    delete self.pendingCellIds[cellId];
    delete self.pendingScheduleCallbacks[cellId];
    self._playCellShatter(cell, playPosition, resolution, boardSnapshot, boardBubbleNodes, spriteFrameCache);
  };

  if (delaySec <= 0) {
    callback();
    return;
  }

  this.pendingCellIds[cellId] = true;
  this.pendingScheduleCallbacks[cellId] = callback;
  var scheduler = requireDirectorScheduler("Bubble shatter delayed play");
  scheduler.schedule(callback, this.layer, 0, SCHEDULE_ONCE_REPEAT, delaySec, false);
};

BubbleShatterRenderer.prototype._playCellShatter = function (
  cell,
  presetPosition,
  resolution,
  boardSnapshot,
  boardBubbleNodes,
  spriteFrameCache
) {
  if (typeof cell.id !== "string" && typeof cell.id !== "number") {
    throw new Error("Bubble shatter matched cell requires id.");
  }
  var cellId = String(cell.id);
  if (this.playedCellIds[cellId]) {
    return;
  }
  if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
    throw new Error("Bubble shatter matched cell requires integer coordinates: " + cellId);
  }

  this._hideBoardBubbleNode(cellId, boardBubbleNodes);

  var ballCode = this.resolveBallCode(cell);
  if (typeof ballCode !== "string" || !ballCode) {
    throw new Error("Bubble shatter matched cell requires ball visual code: " + cellId);
  }
  var spritePath = this.ballResources[ballCode];
  if (typeof spritePath !== "string" || !spritePath) {
    throw new Error("Bubble shatter ball resource is missing: " + ballCode);
  }
  var spriteFrame = spriteFrameCache[spritePath];
  if (!spriteFrame || !spriteFrame.isValid) {
    throw new Error("Bubble shatter SpriteFrame is not preloaded: " + spritePath);
  }
  var sharedMaterial = this._getSharedMaterial(spritePath, spriteFrame);

  var position = this._resolveCellPosition(cell, resolution, boardSnapshot, boardBubbleNodes, presetPosition);
  var component = this._acquireComponent();
  component.node.name = "BubbleShatter_" + cellId;
  component.node.parent = this.layer;
  component.node.setPosition(position.x, position.y);
  component.node.active = true;
  component.initialize({
    material: sharedMaterial,
    spriteFrame: spriteFrame,
    width: this.bubbleWidth,
    height: this.bubbleHeight,
    seed: hashStringToUnit(cellId),
    releaseHandler: this.releaseComponentHandler
  });
  this.activeComponents.push(component);
  this.playedCellIds[cellId] = true;
};

BubbleShatterRenderer.prototype._isEligibleCell = function (cell) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
    throw new Error("Bubble shatter matched entry must be a cell object.");
  }
  if (cell.entityCategory === "normal_ball") {
    return true;
  }
  if (
    cell.entityCategory === "skill_ball" ||
    cell.entityCategory === "obstacle_ball" ||
    cell.entityCategory === "reactive_ball" ||
    cell.entityCategory === "locked_ball" ||
    cell.entityCategory === "key_ball"
  ) {
    return false;
  }
  throw new Error("Unsupported bubble shatter entityCategory: " + cell.entityCategory);
};

BubbleShatterRenderer.prototype._resolveCellPosition = function (
  cell,
  resolution,
  boardSnapshot,
  boardBubbleNodes,
  presetPosition
) {
  if (
    presetPosition &&
    typeof presetPosition === "object" &&
    !Array.isArray(presetPosition) &&
    Number.isFinite(Number(presetPosition.x)) &&
    Number.isFinite(Number(presetPosition.y))
  ) {
    return cc.v2(Number(presetPosition.x), Number(presetPosition.y));
  }

  var cellId = String(cell.id);
  var sourceNode = boardBubbleNodes[cellId];
  if (sourceNode && sourceNode.isValid) {
    return cc.v2(sourceNode.x, sourceNode.y);
  }

  var attachedCell = resolution.attachedCell;
  if (!attachedCell || String(attachedCell.id) !== cellId) {
    throw new Error("Bubble shatter source node is missing: " + cellId);
  }
  if (!Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Bubble shatter board snapshot requires integer maxColumns.");
  }
  return this.boardLayout.getCellPosition(
    cell.row,
    cell.col,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
};

BubbleShatterRenderer.prototype._acquireComponent = function () {
  var node = this.nodePool.length ? this.nodePool.pop() : null;
  if (!node) {
    node = new cc.Node("BubbleShatter");
    node.active = false;
    node.addComponent(cc.Sprite);
    node.addComponent(BubbleShatterSprite);
  }
  if (!node.isValid) {
    throw new Error("Bubble shatter pool returned invalid node.");
  }
  var component = node.getComponent(BubbleShatterSprite);
  if (!component) {
    throw new Error("Bubble shatter node requires BubbleShatterSprite component.");
  }
  return component;
};

BubbleShatterRenderer.prototype._releaseComponent = function (component, skipPresentationFinish) {
  if (!component || !component.node || !component.node.isValid) {
    throw new Error("Bubble shatter release requires valid component.");
  }
  var activeIndex = this.activeComponents.indexOf(component);
  if (activeIndex !== -1) {
    this.activeComponents.splice(activeIndex, 1);
  }
  component.stop();
  component.node.active = false;
  component.node.removeFromParent(false);
  this.nodePool.push(component.node);
};

BubbleShatterRenderer.prototype.playResolution = function (resolution, boardSnapshot, boardBubbleNodes, spriteFrameCache) {
  if (!this.layer || !this.layer.isValid) {
    throw new Error("Bubble shatter play requires mounted layer.");
  }
  if (!this.effectAsset || !this.effectAsset.isValid) {
    throw new Error("Bubble shatter effect must be preloaded before play.");
  }
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Bubble shatter play requires resolution.");
  }
  if (!Array.isArray(resolution.matched)) {
    throw new Error("Bubble shatter resolution requires matched array.");
  }
  if (!boardSnapshot || typeof boardSnapshot !== "object" || Array.isArray(boardSnapshot)) {
    throw new Error("Bubble shatter play requires board snapshot.");
  }
  if (!boardBubbleNodes || typeof boardBubbleNodes !== "object" || Array.isArray(boardBubbleNodes)) {
    throw new Error("Bubble shatter play requires board bubble node map.");
  }
  if (!spriteFrameCache || typeof spriteFrameCache !== "object" || Array.isArray(spriteFrameCache)) {
    throw new Error("Bubble shatter play requires SpriteFrame cache.");
  }

  if (this.currentResolution !== resolution) {
    this._cancelPendingSchedules();
    this._resetPresentationTracking(true);
    this.currentResolution = resolution;
    this.playedCellIds = {};
  }

  var playPlan = this._buildPlayPlan(resolution);
  var playPlanSignature = buildPlayPlanSignature(playPlan);
  if (
    this.presentationTrackedResolution !== resolution ||
    this.presentationTrackedPlanSignature !== playPlanSignature
  ) {
    this._armPresentationRelease(resolution, playPlan);
    this.presentationTrackedPlanSignature = playPlanSignature;
  }
  for (var index = 0; index < playPlan.length; index += 1) {
    var entry = playPlan[index];
    this._scheduleCellShatter(entry, resolution, boardSnapshot, boardBubbleNodes, spriteFrameCache);
  }
};

module.exports = BubbleShatterRenderer;

},{"../../assets/scripts/utils/BundleLoader":"BundleLoader"}],
"EliminationSequenceBuilder":[function(require,module,exports){
"use strict";

var ELIMINATION_INTERVAL_MS = 30;
var SHATTER_PRESENTATION_LIFETIME_SEC = 0.48;

function keyFor(row, col) {
  return row + ":" + col;
}

function hexDistance(rowA, colA, rowB, colB) {
  var absRow = Math.abs(rowA - rowB);
  var absCol = Math.abs(colA - colB);
  return absRow + Math.max(0, absCol - Math.floor(absRow / 2));
}

function compareClockwise(a, b, originRow, originCol) {
  var angleA = Math.atan2(a.row - originRow, a.col - originCol);
  var angleB = Math.atan2(b.row - originRow, b.col - originCol);
  if (angleA !== angleB) {
    return angleA - angleB;
  }
  if (a.row !== b.row) {
    return a.row - b.row;
  }
  return a.col - b.col;
}

function isShatterEligibleCell(cell) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
    throw new Error("Elimination presentation requires cell object.");
  }
  if (cell.entityCategory === "normal_ball") {
    return true;
  }
  if (
    cell.entityCategory === "skill_ball" ||
    cell.entityCategory === "obstacle_ball" ||
    cell.entityCategory === "reactive_ball" ||
    cell.entityCategory === "locked_ball" ||
    cell.entityCategory === "key_ball"
  ) {
    return false;
  }
  throw new Error("Unsupported elimination presentation entityCategory: " + cell.entityCategory);
}

function buildMatchedCellMap(resolution, matchedCellsOverride) {
  var matchedCells = matchedCellsOverride;
  if (!matchedCells) {
    if (!resolution || !Array.isArray(resolution.matched)) {
      return {};
    }
    matchedCells = resolution.matched;
  }
  if (!Array.isArray(matchedCells)) {
    throw new Error("Elimination presentation requires matched cells array.");
  }

  var matchedById = {};
  matchedCells.forEach(function (cell) {
    if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
      throw new Error("Elimination presentation matched cell requires id.");
    }
    matchedById[String(cell.id)] = cell;
  });
  return matchedById;
}

function resolveLastShatterStartDelaySec(resolution, matchedCellsOverride) {
  var matchedById = buildMatchedCellMap(resolution, matchedCellsOverride);

  if (resolution && Array.isArray(resolution.eliminationSequence) && resolution.eliminationSequence.length > 0) {
    var maxDelayMs = 0;
    var eligibleCount = 0;
    resolution.eliminationSequence.forEach(function (sequenceEntry) {
      if (!sequenceEntry || typeof sequenceEntry !== "object" || Array.isArray(sequenceEntry)) {
        throw new Error("Elimination presentation sequence entry must be an object.");
      }
      var cell = matchedById[String(sequenceEntry.cellId)];
      if (!cell || !isShatterEligibleCell(cell)) {
        return;
      }
      eligibleCount += 1;
      var delayMs = Number(sequenceEntry.delayMs);
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error("Elimination presentation sequence delayMs must be a non-negative number.");
      }
      if (delayMs > maxDelayMs) {
        maxDelayMs = delayMs;
      }
    });
    if (eligibleCount <= 0) {
      return 0;
    }
    return maxDelayMs / 1000;
  }

  var matchedCells = matchedCellsOverride;
  if (!matchedCells) {
    if (!resolution || !Array.isArray(resolution.matched)) {
      return 0;
    }
    matchedCells = resolution.matched;
  }
  if (!matchedCells.length) {
    return 0;
  }

  var eligibleIndex = 0;
  matchedCells.forEach(function (cell) {
    if (isShatterEligibleCell(cell)) {
      eligibleIndex += 1;
    }
  });
  if (eligibleIndex <= 0) {
    return 0;
  }
  return (eligibleIndex - 1) * (ELIMINATION_INTERVAL_MS / 1000);
}

function resolveRequiresEliminationPresentationHold(resolution, matchedCellsOverride) {
  var matchedById = buildMatchedCellMap(resolution, matchedCellsOverride);
  return Object.keys(matchedById).some(function (cellId) {
    return isShatterEligibleCell(matchedById[cellId]);
  });
}

function resolveEliminationPresentationDurationSec(resolution, matchedCellsOverride) {
  if (
    resolution &&
    Object.prototype.hasOwnProperty.call(resolution, "eliminationPresentationDurationSec")
  ) {
    var presetDuration = Number(resolution.eliminationPresentationDurationSec);
    if (!Number.isFinite(presetDuration) || presetDuration < 0) {
      throw new Error("Resolution eliminationPresentationDurationSec must be a non-negative number.");
    }
    return presetDuration;
  }

  var lastStartDelaySec = resolveLastShatterStartDelaySec(resolution, matchedCellsOverride);
  if (lastStartDelaySec <= 0) {
    var matchedById = buildMatchedCellMap(resolution, matchedCellsOverride);
    var hasEligibleCell = Object.keys(matchedById).some(function (cellId) {
      return isShatterEligibleCell(matchedById[cellId]);
    });
    if (!hasEligibleCell) {
      return 0;
    }
  }
  return lastStartDelaySec + SHATTER_PRESENTATION_LIFETIME_SEC;
}

function buildEliminationSequence(attachedCell, matchedCells, grid, scorePerBall) {
  if (!attachedCell || !Array.isArray(matchedCells) || !matchedCells.length) {
    throw new Error("buildEliminationSequence requires attached cell and matched cells.");
  }
  if (!grid || typeof grid.getCellPosition !== "function") {
    throw new Error("buildEliminationSequence requires grid with getCellPosition.");
  }
  if (!Number.isInteger(scorePerBall) || scorePerBall < 0) {
    throw new Error("buildEliminationSequence requires non-negative integer scorePerBall.");
  }

  var originRow = attachedCell.row;
  var originCol = attachedCell.col;
  var matchedByKey = {};
  matchedCells.forEach(function (cell) {
    matchedByKey[keyFor(cell.row, cell.col)] = cell;
  });

  var rings = {};
  matchedCells.forEach(function (cell) {
    var distance = hexDistance(originRow, originCol, cell.row, cell.col);
    if (!rings[distance]) {
      rings[distance] = [];
    }
    rings[distance].push(cell);
  });

  var ordered = [];
  var distances = Object.keys(rings).map(Number).sort(function (a, b) {
    return a - b;
  });

  distances.forEach(function (distance) {
    var ringCells = rings[distance].slice().sort(function (left, right) {
      return compareClockwise(left, right, originRow, originCol);
    });
    Array.prototype.push.apply(ordered, ringCells);
  });

  var sequence = [];
  var scoreEvents = [];
  ordered.forEach(function (cell, index) {
    var worldPosition = grid.getCellPosition(cell.row, cell.col);
    var delayMs = index * ELIMINATION_INTERVAL_MS;
    var points = scorePerBall;
    sequence.push({
      cellId: cell.id,
      row: cell.row,
      col: cell.col,
      worldPosition: {
        x: worldPosition.x,
        y: worldPosition.y
      },
      removeType: "match",
      points: points,
      delayMs: delayMs
    });
    scoreEvents.push({
      cellId: cell.id,
      row: cell.row,
      col: cell.col,
      points: points,
      delayMs: delayMs,
      scoreKind: "match_elimination"
    });
  });

  return {
    eliminationSequence: sequence,
    scoreEvents: scoreEvents
  };
}

module.exports = {
  buildEliminationSequence: buildEliminationSequence,
  hexDistance: hexDistance,
  resolveEliminationPresentationDurationSec: resolveEliminationPresentationDurationSec,
  resolveRequiresEliminationPresentationHold: resolveRequiresEliminationPresentationHold
};

},{}],
"FairyAssistConfig":[function(require,module,exports){
"use strict";

var COLOR_RULES = [
  {
    color: "red",
    minEliminated: 1,
    maxEliminated: 5,
    bonusStep: 1,
    canSplit: false,
    prefabPath: "prefabs/genius_red"
  },
  {
    color: "yellow",
    minEliminated: 6,
    maxEliminated: 9,
    bonusStep: 2,
    canSplit: false,
    prefabPath: "prefabs/genius_yellow"
  },
  {
    color: "green",
    minEliminated: 10,
    maxEliminated: Number.MAX_SAFE_INTEGER,
    bonusStep: 3,
    canSplit: true,
    prefabPath: "prefabs/genius_green"
  }
];

var SLOTS = [
  { index: 0, nodeName: "genius1" },
  { index: 1, nodeName: "genius2" },
  { index: 2, nodeName: "genius3" },
  { index: 3, nodeName: "genius4" },
  { index: 4, nodeName: "genius5" },
  { index: 5, nodeName: "genius6" }
];

function requirePositiveFiniteNumber(value, fieldName) {
  if (typeof value !== "number" || !isFinite(value) || value <= 0) {
    throw new Error(fieldName + " must be a positive finite number.");
  }
}

function validateColorRules(rules) {
  if (!Array.isArray(rules) || rules.length !== 3) {
    throw new Error("FairyAssistConfig.colorRules must define red, yellow and green.");
  }

  var expectedMin = 1;
  var seenColors = {};
  rules.forEach(function (rule, index) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new Error("FairyAssistConfig color rule must be an object at index " + index + ".");
    }
    if (typeof rule.color !== "string" || !rule.color) {
      throw new Error("FairyAssistConfig color rule requires color at index " + index + ".");
    }
    if (seenColors[rule.color]) {
      throw new Error("FairyAssistConfig color is duplicated: " + rule.color);
    }
    seenColors[rule.color] = true;
    if (!Number.isInteger(rule.minEliminated) || rule.minEliminated !== expectedMin) {
      throw new Error("FairyAssistConfig color ranges must be contiguous at " + rule.color + ".");
    }
    if (!Number.isInteger(rule.maxEliminated) || rule.maxEliminated < rule.minEliminated) {
      throw new Error("FairyAssistConfig maxEliminated is invalid for " + rule.color + ".");
    }
    if (!Number.isInteger(rule.bonusStep) || rule.bonusStep <= 0) {
      throw new Error("FairyAssistConfig bonusStep is invalid for " + rule.color + ".");
    }
    if (typeof rule.canSplit !== "boolean") {
      throw new Error("FairyAssistConfig canSplit must be boolean for " + rule.color + ".");
    }
    if (typeof rule.prefabPath !== "string" || !rule.prefabPath) {
      throw new Error("FairyAssistConfig prefabPath is required for " + rule.color + ".");
    }
    expectedMin = rule.maxEliminated + 1;
  });

  if (!seenColors.red || !seenColors.yellow || !seenColors.green) {
    throw new Error("FairyAssistConfig must include red, yellow and green color rules.");
  }
  if (rules[rules.length - 1].maxEliminated !== Number.MAX_SAFE_INTEGER) {
    throw new Error("FairyAssistConfig final color range must cover every positive elimination count.");
  }
}

function validateSlots(slots) {
  if (!Array.isArray(slots) || slots.length !== 6) {
    throw new Error("FairyAssistConfig.slots must define exactly six slots.");
  }

  var nodeNames = {};
  slots.forEach(function (slot, index) {
    if (!slot || slot.index !== index) {
      throw new Error("FairyAssistConfig slot indexes must be contiguous from zero.");
    }
    if (typeof slot.nodeName !== "string" || !slot.nodeName) {
      throw new Error("FairyAssistConfig slot nodeName is required at index " + index + ".");
    }
    if (nodeNames[slot.nodeName]) {
      throw new Error("FairyAssistConfig slot nodeName is duplicated: " + slot.nodeName);
    }
    nodeNames[slot.nodeName] = true;
  });
}

validateColorRules(COLOR_RULES);
validateSlots(SLOTS);

var CONFIG = {
  colorRules: COLOR_RULES,
  slots: SLOTS,
  removeCountOnMiss: 2,
  maxCollisionsPerFairy: 7,
  fairyCollisionRadius: 20,
  bounceDamping: 0.82,
  minimumUpwardSpeed: 180,
  splitAngleDegrees: 18,
  spriteWidth: 200,
  spriteHeight: 160,
  dropCollisionGlowScale: 86 / 72,
  maxGlowStacks: 7
};

if (!Number.isInteger(CONFIG.removeCountOnMiss) || CONFIG.removeCountOnMiss <= 0) {
  throw new Error("FairyAssistConfig.removeCountOnMiss must be a positive integer.");
}
if (!Number.isInteger(CONFIG.maxCollisionsPerFairy) || CONFIG.maxCollisionsPerFairy <= 0) {
  throw new Error("FairyAssistConfig.maxCollisionsPerFairy must be a positive integer.");
}
requirePositiveFiniteNumber(CONFIG.fairyCollisionRadius, "FairyAssistConfig.fairyCollisionRadius");
requirePositiveFiniteNumber(CONFIG.bounceDamping, "FairyAssistConfig.bounceDamping");
requirePositiveFiniteNumber(CONFIG.minimumUpwardSpeed, "FairyAssistConfig.minimumUpwardSpeed");
requirePositiveFiniteNumber(CONFIG.splitAngleDegrees, "FairyAssistConfig.splitAngleDegrees");
requirePositiveFiniteNumber(CONFIG.spriteWidth, "FairyAssistConfig.spriteWidth");
requirePositiveFiniteNumber(CONFIG.spriteHeight, "FairyAssistConfig.spriteHeight");
requirePositiveFiniteNumber(CONFIG.dropCollisionGlowScale, "FairyAssistConfig.dropCollisionGlowScale");
if (!Number.isInteger(CONFIG.maxGlowStacks) || CONFIG.maxGlowStacks <= 0) {
  throw new Error("FairyAssistConfig.maxGlowStacks must be a positive integer.");
}

COLOR_RULES.forEach(Object.freeze);
SLOTS.forEach(Object.freeze);
Object.freeze(COLOR_RULES);
Object.freeze(SLOTS);

module.exports = Object.freeze(CONFIG);

},{}],
"FairyAssistSystem":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");
var FairyAssistConfig = require("../config/FairyAssistConfig");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function requireFinitePoint(point, fieldName) {
  if (
    !point ||
    typeof point.x !== "number" ||
    !isFinite(point.x) ||
    typeof point.y !== "number" ||
    !isFinite(point.y)
  ) {
    throw new Error(fieldName + " must be a finite point.");
  }
  return point;
}

function countDropHitsOnFairy(drop, fairyId) {
  var hitCount = 0;
  for (var index = 0; index < drop.hitFairyIds.length; index += 1) {
    if (drop.hitFairyIds[index] === fairyId) {
      hitCount += 1;
    }
  }
  return hitCount;
}

function findColorRule(eliminatedCount) {
  if (!Number.isInteger(eliminatedCount) || eliminatedCount <= 0) {
    throw new Error("Fairy assist color requires a positive elimination count.");
  }

  for (var index = 0; index < FairyAssistConfig.colorRules.length; index += 1) {
    var rule = FairyAssistConfig.colorRules[index];
    if (eliminatedCount >= rule.minEliminated && eliminatedCount <= rule.maxEliminated) {
      return rule;
    }
  }
  throw new Error("Fairy assist color range is incomplete for elimination count " + eliminatedCount + ".");
}

function FairyAssistSystem() {
  BaseSystem.call(this, "FairyAssistSystem");
  this.slots = [];
  this.revision = 0;
  this._fairySerial = 0;
  this._entrySerial = 0;
  this.collisionCentersSynced = false;
  this._resetSlots();
}

FairyAssistSystem.prototype = Object.create(BaseSystem.prototype);
FairyAssistSystem.prototype.constructor = FairyAssistSystem;

FairyAssistSystem.prototype._resetSlots = function () {
  this.slots = FairyAssistConfig.slots.map(function (slotConfig) {
    return {
      index: slotConfig.index,
      nodeName: slotConfig.nodeName,
      position: null,
      fairy: null
    };
  });
};

FairyAssistSystem.prototype.configureLevel = function (levelConfig) {
  if (!levelConfig || !levelConfig.level) {
    throw new Error("FairyAssistSystem.configureLevel requires level config.");
  }
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.revision = 0;
  this._fairySerial = 0;
  this._entrySerial = 0;
  this.collisionCentersSynced = false;
  this._resetSlots();
  return this;
};

FairyAssistSystem.prototype.syncCollisionCenters = function (centers) {
  if (!Array.isArray(centers) || centers.length !== this.slots.length) {
    throw new Error("FairyAssistSystem.syncCollisionCenters requires one center per slot.");
  }

  for (var index = 0; index < centers.length; index += 1) {
    var center = centers[index];
    if (!center || center.index !== index) {
      throw new Error("FairyAssistSystem.syncCollisionCenters requires contiguous slot indexes.");
    }
    var slot = this.slots[index];
    if (!slot || slot.index !== index) {
      throw new Error("FairyAssistSystem slot state is inconsistent at index " + index + ".");
    }
    var boardPoint = requireFinitePoint(center, "Fairy collision center at index " + index);
    slot.position = {
      x: boardPoint.x,
      y: boardPoint.y
    };
    if (slot.fairy) {
      slot.fairy.position.x = boardPoint.x;
      slot.fairy.position.y = boardPoint.y;
    }
  }
  this.collisionCentersSynced = true;
  return this;
};

FairyAssistSystem.prototype._getActiveFairies = function () {
  return this.slots.filter(function (slot) {
    return slot.fairy !== null;
  }).map(function (slot) {
    return slot.fairy;
  });
};

FairyAssistSystem.prototype._removeByDeparturePriority = function (count) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("FairyAssistSystem._removeByDeparturePriority requires positive count.");
  }

  var active = this._getActiveFairies().sort(function (left, right) {
    if (left.bonusStep !== right.bonusStep) {
      return right.bonusStep - left.bonusStep;
    }
    return left.enteredAt - right.enteredAt;
  });
  var removals = active.slice(0, count);
  var events = [];

  removals.forEach(function (fairy) {
    var slot = this.slots[fairy.slotIndex];
    if (!slot || !slot.fairy || slot.fairy.id !== fairy.id) {
      throw new Error("FairyAssistSystem active fairy slot state is inconsistent.");
    }
    slot.fairy = null;
    events.push({
      type: "remove",
      fairyId: fairy.id,
      color: fairy.color,
      slotIndex: fairy.slotIndex
    });
  }, this);

  if (events.length > 0) {
    this.revision += 1;
  }
  return events;
};

FairyAssistSystem.prototype._resolveDestinationSlot = function () {
  var emptySlots = [];
  for (var index = 0; index < this.slots.length; index += 1) {
    if (this.slots[index].fairy === null) {
      emptySlots.push(this.slots[index]);
    }
  }
  if (emptySlots.length > 0) {
    var randomIndex = Math.floor(Math.random() * emptySlots.length);
    return {
      slot: emptySlots[randomIndex],
      replacedFairy: null
    };
  }

  var occupied = this.slots.slice().sort(function (left, right) {
    if (left.fairy.bonusStep !== right.fairy.bonusStep) {
      return left.fairy.bonusStep - right.fairy.bonusStep;
    }
    return left.fairy.enteredAt - right.fairy.enteredAt;
  });
  if (!occupied.length || !occupied[0].fairy) {
    throw new Error("FairyAssistSystem replacement requires occupied slots.");
  }
  return {
    slot: occupied[0],
    replacedFairy: occupied[0].fairy
  };
};

FairyAssistSystem.prototype._spawnFairy = function (eliminatedCount, spawnFrom) {
  if (!this.collisionCentersSynced) {
    throw new Error("FairyAssistSystem spawn requires board-space centers synced from renderer.");
  }
  var rule = findColorRule(eliminatedCount);
  var destination = this._resolveDestinationSlot();
  var slot = destination.slot;
  requireFinitePoint(slot.position, "Fairy assist destination slot position");
  var replacedFairy = destination.replacedFairy;
  var fairy = {
    id: "fairy_assist_" + (this._fairySerial += 1),
    color: rule.color,
    bonusStep: rule.bonusStep,
    canSplit: rule.canSplit,
    prefabPath: rule.prefabPath,
    slotIndex: slot.index,
    position: {
      x: slot.position.x,
      y: slot.position.y
    },
    spawnFrom: {
      x: spawnFrom.x,
      y: spawnFrom.y
    },
    enteredAt: this._entrySerial += 1,
    glowStacks: 0
  };

  slot.fairy = fairy;
  this.revision += 1;
  return [{
    type: "spawn",
    fairyId: fairy.id,
    color: fairy.color,
    slotIndex: fairy.slotIndex,
    from: clone(fairy.spawnFrom),
    to: clone(fairy.position),
    replacedFairyId: replacedFairy ? replacedFairy.id : null
  }];
};

FairyAssistSystem.prototype.resolveAfterShot = function (resolution, grid) {
  if (!resolution || !Array.isArray(resolution.matched) || !Array.isArray(resolution.floating)) {
    throw new Error("FairyAssistSystem.resolveAfterShot requires matched and floating arrays.");
  }
  if (!grid || typeof grid.getCellPosition !== "function") {
    throw new Error("FairyAssistSystem.resolveAfterShot requires grid.getCellPosition.");
  }

  if (resolution.matched.length === 0) {
    return this._removeByDeparturePriority(FairyAssistConfig.removeCountOnMiss);
  }

  var lastEliminated = resolution.matched[resolution.matched.length - 1];
  if (!lastEliminated || !Number.isInteger(lastEliminated.row) || !Number.isInteger(lastEliminated.col)) {
    throw new Error("Fairy assist spawn requires final eliminated cell coordinates.");
  }
  var spawnFrom = requireFinitePoint(
    grid.getCellPosition(lastEliminated.row, lastEliminated.col),
    "Fairy assist spawn point"
  );
  return this._spawnFairy(resolution.matched.length, spawnFrom);
};

FairyAssistSystem.prototype.resolveFirstCollision = function (drop, bubbleRadius) {
  if (!this.collisionCentersSynced) {
    throw new Error("FairyAssistSystem collision requires board-space centers synced from renderer.");
  }
  if (!drop || !drop.position || !Array.isArray(drop.hitFairyIds)) {
    throw new Error("FairyAssistSystem collision requires drop position and hitFairyIds.");
  }
  requireFinitePoint(drop.position, "Fairy assist collision drop position");
  if (typeof bubbleRadius !== "number" || !isFinite(bubbleRadius) || bubbleRadius <= 0) {
    throw new Error("FairyAssistSystem collision requires positive bubbleRadius.");
  }

  var collisionDistance = FairyAssistConfig.fairyCollisionRadius + bubbleRadius;
  var collisionDistanceSq = collisionDistance * collisionDistance;
  for (var index = 0; index < this.slots.length; index += 1) {
    var fairy = this.slots[index].fairy;
    if (fairy === null) {
      continue;
    }
    if (countDropHitsOnFairy(drop, fairy.id) >= FairyAssistConfig.maxCollisionsPerFairy) {
      continue;
    }
    var dx = drop.position.x - fairy.position.x;
    var dy = drop.position.y - fairy.position.y;
    if (dx * dx + dy * dy > collisionDistanceSq) {
      continue;
    }

    drop.hitFairyIds.push(fairy.id);
    this.revision += 1;
    return {
      fairy: fairy,
      collisionDistance: collisionDistance,
      dx: dx,
      dy: dy
    };
  }
  return null;
};

FairyAssistSystem.prototype.snapshotForRender = function () {
  return {
    revision: this.revision,
    slots: this.slots
  };
};

FairyAssistSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.revision = this.revision;
  snapshot.slots = clone(this.slots);
  return snapshot;
};

module.exports = FairyAssistSystem;

},{"./BaseSystem":"BaseSystem","../config/FairyAssistConfig":"FairyAssistConfig"}],
"FallingMarbleSystem":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var FairyAssistConfig = require("../config/FairyAssistConfig");
var FallingRulesDefaults = require("../config/FallingRulesDefaults");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(vector) {
  var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function reflectVector(vector, normal) {
  var dot = vector.x * normal.x + vector.y * normal.y;
  return {
    x: vector.x - 2 * dot * normal.x,
    y: vector.y - 2 * dot * normal.y
  };
}

function rotateVector(vector, degrees) {
  var radians = degrees * Math.PI / 180;
  var cosine = Math.cos(radians);
  var sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine
  };
}

function getJarRenderCenterY() {
  return (Number(BoardLayout.jarBaseY) || 0) + (Number(BoardLayout.jarRenderYOffset) || 0);
}

function resolveInitialDropVelocity(cell, standardVelocity) {
  if (Object.prototype.hasOwnProperty.call(cell, "__molotovBlastVelocity")) {
    var molotovVelocity = cell.__molotovBlastVelocity;
    if (
      !molotovVelocity ||
      typeof molotovVelocity.x !== "number" ||
      typeof molotovVelocity.y !== "number" ||
      !isFinite(molotovVelocity.x) ||
      !isFinite(molotovVelocity.y)
    ) {
      throw new Error("FallingMarbleSystem molotov blast velocity must be finite.");
    }
    return {
      x: molotovVelocity.x,
      y: molotovVelocity.y
    };
  }
  return standardVelocity;
}

var DROP_LAUNCH_ANGLE_MIN_DEG = 15;
var DROP_LAUNCH_ANGLE_MAX_DEG = 165;
var DROP_LAUNCH_VERTICAL_ANGLE_DEG = 90;
var DROP_LAUNCH_VERTICAL_EXCLUSION_DEG = 15;

function hashDropLaunchUnit(seedMaterial) {
  if (typeof seedMaterial !== "string" || !seedMaterial) {
    throw new Error("Drop launch hash requires non-empty seed material.");
  }
  var hash = 2166136261;
  for (var index = 0; index < seedMaterial.length; index += 1) {
    hash ^= seedMaterial.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function buildDownwardLaunchVelocity(speed, seedMaterial) {
  if (typeof speed !== "number" || !isFinite(speed) || speed <= 0) {
    throw new Error("Drop launch speed must be a positive finite number.");
  }
  var unit = hashDropLaunchUnit(seedMaterial);
  var angleDeg = resolveDownwardLaunchAngleDeg(unit);
  var angleRad = angleDeg * Math.PI / 180;
  return {
    x: Math.cos(angleRad) * speed,
    y: -Math.sin(angleRad) * speed
  };
}

function resolveDownwardLaunchAngleDeg(unit) {
  if (typeof unit !== "number" || !isFinite(unit) || unit < 0 || unit > 1) {
    throw new Error("Drop launch angle unit must be a finite number between 0 and 1.");
  }
  var leftMax = DROP_LAUNCH_VERTICAL_ANGLE_DEG - DROP_LAUNCH_VERTICAL_EXCLUSION_DEG;
  var rightMin = DROP_LAUNCH_VERTICAL_ANGLE_DEG + DROP_LAUNCH_VERTICAL_EXCLUSION_DEG;
  if (unit < 0.5) {
    return DROP_LAUNCH_ANGLE_MIN_DEG + unit * 2 * (leftMax - DROP_LAUNCH_ANGLE_MIN_DEG);
  }
  return rightMin + (unit - 0.5) * 2 * (DROP_LAUNCH_ANGLE_MAX_DEG - rightMin);
}

function buildDropLaunchSeed(sourceId, launchIndex, dropSerial) {
  if (typeof sourceId !== "string" && typeof sourceId !== "number") {
    throw new Error("Drop launch seed requires sourceId.");
  }
  if (!Number.isInteger(launchIndex) || launchIndex < 0) {
    throw new Error("Drop launch seed requires non-negative integer launchIndex.");
  }
  if (!Number.isInteger(dropSerial) || dropSerial <= 0) {
    throw new Error("Drop launch seed requires positive integer dropSerial.");
  }
  return String(sourceId) + ":" + launchIndex + ":" + dropSerial;
}

function resolveDownwardLaunchSpeed(fallingSystem, index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Drop launch speed requires non-negative integer index.");
  }
  return fallingSystem.initialSpeedY + (index % 5) * 36;
}

function resolveDropKind(options) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, "dropKind")) {
    return null;
  }
  if (options.dropKind !== "victory_board_drop") {
    throw new Error("FallingMarbleSystem.registerDrops unsupported dropKind: " + options.dropKind);
  }
  return options.dropKind;
}

function createEmptyUpdateResult() {
  return {
    updated: false,
    surplusUpdated: false,
    collected: [],
    cleanupScored: [],
    missed: [],
    bounced: 0,
    bounceEvents: [],
    fairyHits: [],
    splits: []
  };
}

var SURPLUS_SHOT_INTERVAL_SEC = 0.2;
var SURPLUS_TURRET_ROTATE_INTERVAL_SEC = 0.2;
var DEFERRED_DROP_STAGGER_SEC = 0.05;
var SURPLUS_TURRET_ANGLE_MIN_DEG = 60;
var SURPLUS_TURRET_ANGLE_MAX_DEG = 120;
var SURPLUS_TURRET_ANGLE_STEP_DEG = 15;
var SURPLUS_TURRET_ANGLE_LADDER = [];
for (
  var surplusAngleDeg = SURPLUS_TURRET_ANGLE_MIN_DEG;
  surplusAngleDeg <= SURPLUS_TURRET_ANGLE_MAX_DEG;
  surplusAngleDeg += SURPLUS_TURRET_ANGLE_STEP_DEG
) {
  if (surplusAngleDeg !== DROP_LAUNCH_VERTICAL_ANGLE_DEG) {
    SURPLUS_TURRET_ANGLE_LADDER.push(surplusAngleDeg);
  }
}

function resolveLaunchDeviationFromTurretAngleDeg(turretAngleDeg) {
  if (typeof turretAngleDeg !== "number" || !isFinite(turretAngleDeg)) {
    throw new Error("Surplus turret angle must be finite.");
  }
  if (
    turretAngleDeg < SURPLUS_TURRET_ANGLE_MIN_DEG ||
    turretAngleDeg > SURPLUS_TURRET_ANGLE_MAX_DEG ||
    turretAngleDeg % SURPLUS_TURRET_ANGLE_STEP_DEG !== 0 ||
    turretAngleDeg === DROP_LAUNCH_VERTICAL_ANGLE_DEG
  ) {
    throw new Error("Surplus turret angle must be a non-vertical 15° step between 60° and 120°.");
  }
  return 90 - turretAngleDeg;
}

function FallingMarbleSystem() {
  BaseSystem.call(this, "FallingMarbleSystem");
  this.maxDynamicMarbles = 0;
  this.maxBounces = 0;
  this.totalFallen = 0;
  this.lastDrops = [];
  this.activeDrops = [];
  this.lastCollectedDrops = [];
  this.lastMissedDrops = [];
  this.lastBounceCount = 0;
  this.gravity = Math.max(300, Number(BoardLayout.dropGravity));
  this.initialSpeedY = Math.max(0, Number(BoardLayout.dropInitialSpeedY));
  this.horizontalSpeed = FallingRulesDefaults.horizontalSpeed;
  this.bounceDamping = FallingRulesDefaults.bounceDamping;
  this.cleanupY = BoardLayout.jarBaseY - BoardLayout.bubbleDiameter * 4;
  this.jarCount = 0;
  this.jarColors = [];
  this.jarRules = {
    rimBounce: 0.72,
    collectZoneScale: 1,
    sameColorBonus: 1.6
  };
  this.jarZones = [];
  this.rimEdgeThickness = Math.max(1, Number(BoardLayout.jarSideCollisionWidth) || 40);
  this._dropSerial = 0;
  this._spawnedDropsBuffer = [];
  this._renderSnapshotCache = null;
  this._renderSnapshotDirty = true;
  this._dropLeftLimit = BoardLayout.boardLeft;
  this._dropRightLimit = BoardLayout.boardRight;
  this.maxDropLifeTime = FallingRulesDefaults.maxDropLifeTime;
  this.maxRimBounces = 5;
  this.stuckDistanceThreshold = 2.5;
  this.stuckTimeThreshold = 0.32;
  this.jarGapAttractAccel = 760;
  this.jarGapMaxSpeed = 260;
  this.rimBounceLiftMin = 55;
  this.rimBounceSpeed = Math.max(120, Number(BoardLayout.jarRimBounceSpeed) || 260);
  this.rimBounceDecay = 0.84;
  this._jarAttractTopY = getJarRenderCenterY();
  this._jarAttractBottomY = getJarRenderCenterY() - BoardLayout.jarHeight;
  this._layoutSignature = "";
  this.pendingSurplusShotBalls = [];
  this.pendingSurplusShotOrigin = null;
  this.pendingSurplusShotIndex = 0;
  this.pendingSurplusShotTimer = 0;
  this.surplusTurretAngleDeg = 90;
  this.surplusTurretRotateTimer = 0;
  this.surplusAngleCursor = 0;
  this.surplusAngleDirection = 1;
  this.surplusVolleySeed = 0;
  this.fairyAssistSystem = null;
  this.deferredDrops = [];
  this.pendingEliminationPresentationRelease = false;
  this.lastUpdateDt = 0;
}

FallingMarbleSystem.prototype = Object.create(BaseSystem.prototype);
FallingMarbleSystem.prototype.constructor = FallingMarbleSystem;

FallingMarbleSystem.prototype.attachFairyAssistSystem = function (fairyAssistSystem) {
  if (!fairyAssistSystem || typeof fairyAssistSystem.resolveFirstCollision !== "function") {
    throw new Error("FallingMarbleSystem.attachFairyAssistSystem requires FairyAssistSystem.");
  }
  this.fairyAssistSystem = fairyAssistSystem;
  return this;
};

FallingMarbleSystem.prototype.configureLevel = function (levelConfig) {
  if (!this.fairyAssistSystem) {
    throw new Error("FallingMarbleSystem.configureLevel requires attached FairyAssistSystem.");
  }
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  var rules = (levelConfig.sharedDefaults && levelConfig.sharedDefaults.fallingRules) || {};

  if (
    !Number.isInteger(FallingRulesDefaults.maxDynamicMarbles) ||
    FallingRulesDefaults.maxDynamicMarbles <= 0
  ) {
    throw new Error("FallingRulesDefaults.maxDynamicMarbles must be a positive integer.");
  }
  this.maxDynamicMarbles = FallingRulesDefaults.maxDynamicMarbles;
  this.maxBounces = rules.maxBounces || 0;
  this.totalFallen = 0;
  this._spawnedDropsBuffer.length = 0;
  this.lastDrops = [];
  this.activeDrops = [];
  this.lastCollectedDrops = [];
  this.lastMissedDrops = [];
  this.lastBounceCount = 0;
  this.gravity = Math.max(300, Number(BoardLayout.dropGravity));
  this.initialSpeedY = Math.max(0, Number(BoardLayout.dropInitialSpeedY));
  this.horizontalSpeed = typeof rules.horizontalSpeed === "number" ? Math.max(40, rules.horizontalSpeed) : FallingRulesDefaults.horizontalSpeed;
  this.jarGapAttractAccel = typeof rules.jarGapAttractAccel === "number" ? Math.max(0, rules.jarGapAttractAccel) : 760;
  this.jarGapMaxSpeed = typeof rules.jarGapMaxSpeed === "number" ? Math.max(40, rules.jarGapMaxSpeed) : 260;
  this.maxDropLifeTime = typeof rules.maxDropLifeTime === "number" ? Math.max(1.2, rules.maxDropLifeTime) : FallingRulesDefaults.maxDropLifeTime;
  this.stuckDistanceThreshold = typeof rules.stuckDistanceThreshold === "number" ? Math.max(0.5, rules.stuckDistanceThreshold) : 2.5;
  this.stuckTimeThreshold = typeof rules.stuckTimeThreshold === "number" ? Math.max(0.08, rules.stuckTimeThreshold) : 0.32;
  this.bounceDamping = typeof rules.bounceDamping === "number" ? clamp(rules.bounceDamping, 0.45, 0.95) : FallingRulesDefaults.bounceDamping;
  var cleanupUpperBound = BoardLayout.jarBaseY - BoardLayout.bubbleDiameter * 1.5;
  var defaultCleanupY = BoardLayout.jarBaseY - BoardLayout.bubbleDiameter * 4;
  this.cleanupY = typeof rules.cleanupY === "number"
    ? Math.min(rules.cleanupY, cleanupUpperBound)
    : defaultCleanupY;

  this.jarCount = levelConfig.level && levelConfig.level.jarCount ? levelConfig.level.jarCount : 0;
  this.jarColors = levelConfig.level && Array.isArray(levelConfig.level.jarColors)
    ? levelConfig.level.jarColors.slice()
    : [];

  var jarRules = levelConfig.level && levelConfig.level.jarRules ? levelConfig.level.jarRules : {};
  this.jarRules = {
    rimBounce: typeof jarRules.rimBounce === "number" ? clamp(jarRules.rimBounce, 0.45, 0.95) : 0.72,
    collectZoneScale: typeof jarRules.collectZoneScale === "number" ? clamp(jarRules.collectZoneScale, 0.72, 1.2) : 1,
    sameColorBonus: typeof jarRules.sameColorBonus === "number" ? Math.max(1, jarRules.sameColorBonus) : 1.6
  };
  this.maxRimBounces = typeof jarRules.maxRimBounces === "number" ? Math.max(0, Math.floor(jarRules.maxRimBounces)) : 5;
  this.rimBounceLiftMin = typeof jarRules.rimBounceLiftMin === "number"
    ? Math.max(0, jarRules.rimBounceLiftMin)
    : 55;
  this.rimBounceSpeed = typeof jarRules.rimBounceSpeed === "number"
    ? Math.max(120, jarRules.rimBounceSpeed)
    : (typeof rules.rimBounceSpeed === "number"
      ? Math.max(120, rules.rimBounceSpeed)
      : Math.max(120, Number(BoardLayout.jarRimBounceSpeed) || 260));
  this.rimBounceDecay = typeof jarRules.rimBounceDecay === "number"
    ? clamp(jarRules.rimBounceDecay, 0.55, 0.98)
    : (typeof rules.rimBounceDecay === "number"
      ? clamp(rules.rimBounceDecay, 0.55, 0.98)
      : 0.84);

  this.jarZones = this._buildJarZones();
  this._rebuildDropBounds();
  this._layoutSignature = this._buildLayoutSignature();
  this._dropSerial = 0;
  this._renderSnapshotCache = null;
  this._renderSnapshotDirty = true;
  this.pendingSurplusShotBalls = [];
  this.pendingSurplusShotOrigin = null;
  this.pendingSurplusShotIndex = 0;
  this.pendingSurplusShotTimer = 0;
  this.surplusTurretAngleDeg = 90;
  this.surplusTurretRotateTimer = 0;
  this.surplusAngleCursor = 0;
  this.surplusAngleDirection = 1;
  this.surplusVolleySeed = 0;
  this.deferredDrops = [];
  return this;
};

FallingMarbleSystem.prototype._buildLayoutSignature = function () {
  return [
    BoardLayout.boardLeft,
    BoardLayout.boardRight,
    BoardLayout.jarBaseY,
    BoardLayout.jarRenderYOffset,
    BoardLayout.jarWidth,
    BoardLayout.jarHeight,
    BoardLayout.jarMouthWidth,
    BoardLayout.jarLayoutWidth,
    this.jarColors.length
  ].join("|");
};

FallingMarbleSystem.prototype._rebuildDropBounds = function () {
  this._dropLeftLimit = BoardLayout.boardLeft;
  this._dropRightLimit = BoardLayout.boardRight;

  if (this.jarZones && this.jarZones.length) {
    this._jarAttractTopY = this.jarZones.reduce(function (maxValue, zone) {
      return Math.max(maxValue, zone.mouthY + zone.contactBand * 1.8);
    }, Number.NEGATIVE_INFINITY);
    this._jarAttractBottomY = this.jarZones.reduce(function (minValue, zone) {
      return Math.min(minValue, zone.bottomY - BoardLayout.bubbleRadius * 0.4);
    }, Number.POSITIVE_INFINITY);
  } else {
    this._jarAttractTopY = getJarRenderCenterY();
    this._jarAttractBottomY = getJarRenderCenterY() - BoardLayout.jarHeight;
  }
};

FallingMarbleSystem.prototype._buildJarZones = function () {
  var count = this.jarColors.length || this.jarCount;
  if (!count) {
    return [];
  }

  var jarLayout = BoardLayout.getJarLayout(count);
  var jarPositions = jarLayout.positions;
  var mouthHalfWidth = jarLayout.mouthWidth * 0.5;
  var edgeThickness = clamp(this.rimEdgeThickness * jarLayout.scale, 1, mouthHalfWidth);
  // 需求：左右边缘碰撞区各 40（从边界向内）。
  var outerHalfWidth = mouthHalfWidth;
  var innerHalfWidth = Math.max(0, mouthHalfWidth - edgeThickness);
  var collectHalfWidth = innerHalfWidth - BoardLayout.bubbleRadius;
  if (!isFinite(collectHalfWidth) || collectHalfWidth <= 0) {
    throw new Error("Jar mouth must be wide enough to fully contain one falling ball.");
  }
  var jarHeight = jarLayout.renderHeight;
  var baseJarCenterY = getJarRenderCenterY();

  var zones = [];
  for (var index = 0; index < count; index += 1) {
    var jarCenterY = baseJarCenterY + BoardLayout.getJarRenderYOffset(index, count);
    var mouthY = jarCenterY + jarHeight * 0.24;
    var bottomY = jarCenterY - jarHeight * 0.42;
    zones.push({
      index: index,
      color: this.jarColors[index] || null,
      x: jarPositions[index] || 0,
      mouthY: mouthY,
      bottomY: bottomY,
      collectHalfWidth: collectHalfWidth,
      innerHalfWidth: innerHalfWidth,
      outerHalfWidth: outerHalfWidth,
      // Compatibility alias for existing renderer references.
      rimHalfWidth: outerHalfWidth,
      edgeThickness: edgeThickness,
      contactBand: 18,
      rimBounce: this.jarRules.rimBounce,
      sameColorBonus: this.jarRules.sameColorBonus
    });
  }

  for (var zoneIndex = 0; zoneIndex < zones.length; zoneIndex += 1) {
    var previousZone = zoneIndex > 0 ? zones[zoneIndex - 1] : null;
    var nextZone = zoneIndex + 1 < zones.length ? zones[zoneIndex + 1] : null;
    var collisionLeft = previousZone
      ? (previousZone.x + zones[zoneIndex].x) * 0.5
      : BoardLayout.boardLeft;
    var collisionRight = nextZone
      ? (zones[zoneIndex].x + nextZone.x) * 0.5
      : BoardLayout.boardRight;
    if (!isFinite(collisionLeft) || !isFinite(collisionRight) || collisionLeft >= collisionRight) {
      throw new Error("Jar collision partition must have positive finite width at index " + zoneIndex + ".");
    }
    zones[zoneIndex].collisionLeft = collisionLeft;
    zones[zoneIndex].collisionRight = collisionRight;
  }

  return zones;
};

FallingMarbleSystem.prototype.hasActiveDrops = function () {
  return (
    this.activeDrops.length > 0 ||
    this.deferredDrops.length > 0 ||
    this.pendingSurplusShotBalls.length > 0
  );
};

FallingMarbleSystem.prototype._countActiveDrops = function (drops) {
  var source = drops || this.activeDrops;
  var count = 0;
  for (var index = 0; index < source.length; index += 1) {
    var drop = source[index];
    if (drop.active && drop.inJar !== true) {
      count += 1;
    }
  }
  return count;
};

FallingMarbleSystem.prototype._applyDropLaunchVelocity = function (drop, launchIndex) {
  if (!drop) {
    throw new Error("Drop launch velocity requires drop.");
  }
  if (typeof drop.sourceId !== "string" && typeof drop.sourceId !== "number") {
    throw new Error("Drop launch velocity requires sourceId.");
  }
  if (!Number.isInteger(launchIndex) || launchIndex < 0) {
    throw new Error("Drop launch velocity requires non-negative integer launchIndex.");
  }
  if (!Number.isInteger(drop.launchDropSerial) || drop.launchDropSerial <= 0) {
    throw new Error("Drop launch velocity requires positive launchDropSerial.");
  }

  var launchSpeed = resolveDownwardLaunchSpeed(this, launchIndex);
  var launchSeed = buildDropLaunchSeed(drop.sourceId, launchIndex, drop.launchDropSerial);
  var launchVelocity = buildDownwardLaunchVelocity(launchSpeed, launchSeed);
  drop.velocity = {
    x: launchVelocity.x,
    y: launchVelocity.y
  };
  drop.launchIndex = launchIndex;
  return drop;
};

FallingMarbleSystem.prototype._advanceDropMotion = function (drop, dt) {
  if (!drop || drop.active !== true) {
    throw new Error("Drop motion advance requires active drop.");
  }
  if (typeof dt !== "number" || !Number.isFinite(dt) || dt < 0) {
    throw new Error("Drop motion advance requires non-negative finite dt.");
  }
  if (dt <= 0) {
    return;
  }
  drop.jarCooldown = Math.max(0, (drop.jarCooldown || 0) - dt);
  this._applyGapAttraction(drop, dt);
  drop.velocity.y -= this.gravity * dt;
  drop.position.x += drop.velocity.x * dt;
  drop.position.y += drop.velocity.y * dt;
  drop.rotation += drop.rotationSpeed * dt;
  drop.lifeTime = (drop.lifeTime || 0) + dt;
  this._clampDropToSideBounds(drop);
};

FallingMarbleSystem.prototype._clampDropToSideBounds = function (drop) {
  if (!drop || !drop.position || typeof drop.position.x !== "number" || !isFinite(drop.position.x)) {
    throw new Error("Falling drop side-bound clamp requires finite position.x.");
  }
  var clampedX = clamp(drop.position.x, this._dropLeftLimit, this._dropRightLimit);
  if (clampedX === drop.position.x) {
    return false;
  }
  drop.position.x = clampedX;
  return true;
};

FallingMarbleSystem.prototype._isDropPressingSideBounds = function (drop) {
  if (!drop || !drop.position || typeof drop.position.x !== "number" || !isFinite(drop.position.x)) {
    throw new Error("Falling drop side-bound contact requires finite position.x.");
  }
  if (!drop.velocity || typeof drop.velocity.x !== "number" || !isFinite(drop.velocity.x)) {
    throw new Error("Falling drop side-bound contact requires finite velocity.x.");
  }

  var epsilon = 0.001;
  return (
    (drop.position.x <= this._dropLeftLimit + epsilon && drop.velocity.x <= 0) ||
    (drop.position.x >= this._dropRightLimit - epsilon && drop.velocity.x >= 0)
  );
};

FallingMarbleSystem.prototype._applySideWallEscape = function (drop, allowLift) {
  if (!drop || !drop.velocity || typeof drop.velocity.x !== "number" || !isFinite(drop.velocity.x)) {
    throw new Error("Falling drop side-wall escape requires finite velocity.x.");
  }
  if (!drop.position || typeof drop.position.x !== "number" || !isFinite(drop.position.x)) {
    throw new Error("Falling drop side-wall escape requires finite position.x.");
  }

  var escapeDirection = drop.position.x <= this._dropLeftLimit ? 1 : -1;
  var minEscapeSpeed = Math.max(40, this.horizontalSpeed * 0.45);
  var reboundSpeed = Math.max(Math.abs(drop.velocity.x) * this.bounceDamping, minEscapeSpeed);
  drop.velocity.x = escapeDirection * reboundSpeed;

  if (allowLift === true && drop.remainingBounces > 0) {
    drop.velocity.y = Math.max(drop.velocity.y, -420) + 140;
    drop.remainingBounces -= 1;
  }
};

FallingMarbleSystem.prototype.requestEliminationPresentationDropRelease = function () {
  this.pendingEliminationPresentationRelease = true;
};

FallingMarbleSystem.prototype.processPendingEliminationPresentationRelease = function (dt) {
  if (this.pendingEliminationPresentationRelease !== true) {
    return false;
  }
  this.pendingEliminationPresentationRelease = false;
  this.releaseEliminationPresentationDropHold(dt);
  return true;
};

FallingMarbleSystem.prototype._prepareDeferredDropForActivation = function (drop, activationIndex) {
  if (!drop || drop.active !== true) {
    throw new Error("Deferred drop activation requires active drop.");
  }
  if (!drop.position || typeof drop.position.x !== "number" || !isFinite(drop.position.x)) {
    throw new Error("Deferred drop activation requires finite position.x.");
  }
  if (typeof drop.position.y !== "number" || !isFinite(drop.position.y)) {
    throw new Error("Deferred drop activation requires finite position.y.");
  }
  if (!drop.velocity || typeof drop.velocity.x !== "number" || !isFinite(drop.velocity.x)) {
    throw new Error("Deferred drop activation requires finite velocity.x.");
  }
  if (typeof drop.velocity.y !== "number" || !isFinite(drop.velocity.y)) {
    throw new Error("Deferred drop activation requires finite velocity.y.");
  }
  if (drop.dropKind === "surplus_shot") {
    throw new Error("Deferred drop queue cannot contain surplus_shot drops.");
  }
  if (!Number.isInteger(activationIndex) || activationIndex < 0) {
    throw new Error("Deferred drop activation requires non-negative integer activationIndex.");
  }
  if (!Number.isInteger(drop.launchIndex) || drop.launchIndex < 0) {
    throw new Error("Deferred drop activation requires non-negative integer launchIndex.");
  }

  this._applyDropLaunchVelocity(drop, drop.launchIndex);

  if (activationIndex > 0) {
    var existingDelay = typeof drop.startDelay === "number" && isFinite(drop.startDelay) && drop.startDelay > 0
      ? drop.startDelay
      : 0;
    drop.startDelay = existingDelay + activationIndex * DEFERRED_DROP_STAGGER_SEC;
  }

  drop.lifeTime = 0;
  drop.stuckTimer = 0;
  drop.lastStuckX = drop.position.x;
  drop.lastStuckY = drop.position.y;
  drop.inJar = false;
  drop.jarIndex = -1;
  drop.jarColor = null;
  drop.jarCooldown = 0;
  return drop;
};

FallingMarbleSystem.prototype._flushDeferredDrops = function () {
  if (!this.deferredDrops.length) {
    return 0;
  }
  if (this.maxDynamicMarbles <= 0) {
    throw new Error("FallingMarbleSystem._flushDeferredDrops requires positive maxDynamicMarbles.");
  }

  var activated = 0;
  while (this.deferredDrops.length > 0 && this._countActiveDrops() < this.maxDynamicMarbles) {
    var drop = this.deferredDrops.shift();
    this._prepareDeferredDropForActivation(drop, activated);
    this._activateDropBatch([drop]);
    activated += 1;
  }
  return activated;
};

FallingMarbleSystem.prototype._buildDropFromCell = function (
  cell,
  index,
  grid,
  startDelay,
  dropKind,
  holdUntilEliminationPresentationComplete
) {
  if (!cell || !grid || typeof grid.getCellPosition !== "function") {
    throw new Error("FallingMarbleSystem._buildDropFromCell requires cell and grid.");
  }
  if (typeof cell.id !== "string" && typeof cell.id !== "number") {
    throw new Error("FallingMarbleSystem drop cell requires id.");
  }

  var start = grid.getCellPosition(cell.row, cell.col);
  var dropSerial = this._dropSerial + 1;
  var launchSpeed = resolveDownwardLaunchSpeed(this, index);
  var launchSeed = buildDropLaunchSeed(cell.id, index, dropSerial);
  var launchVelocity = buildDownwardLaunchVelocity(launchSpeed, launchSeed);
  var standardVelocity = {
    x: launchVelocity.x,
    y: launchVelocity.y
  };
  var rotationDirection = launchVelocity.x >= 0 ? 1 : -1;

  return {
    id: String(cell.id) + "_drop_" + (this._dropSerial += 1),
    sourceId: cell.id,
    color: cell.color,
    entityCategory: cell.entityCategory || "normal_ball",
    entityType: cell.entityType || null,
    splitColor: typeof cell.splitColor === "string" ? cell.splitColor : null,
    innerColor: cell.innerColor || null,
    iceSnowballAlreadyCollected: cell.iceSnowballAlreadyCollected === true,
    row: cell.row,
    col: cell.col,
    position: { x: start.x, y: start.y },
    velocity: resolveInitialDropVelocity(cell, standardVelocity),
    remainingBounces: this.maxBounces,
    rotation: 0,
    rotationSpeed: rotationDirection * (180 + index * 25),
    jarCooldown: 0,
    startDelay: startDelay,
    holdUntilEliminationPresentationComplete: holdUntilEliminationPresentationComplete === true,
    rimBounceCount: 0,
    lastRimBounceSpeed: 0,
    lifeTime: 0,
    stuckTimer: 0,
    lastStuckX: start.x,
    lastStuckY: start.y,
    inJar: false,
    jarIndex: -1,
    jarColor: null,
    active: true,
    launchIndex: index,
    launchDropSerial: dropSerial,
    dropKind: dropKind,
    rootDropId: Object.prototype.hasOwnProperty.call(cell, "rootDropId")
      ? String(cell.rootDropId)
      : String(cell.id),
    hitFairyIds: [],
    fairyBonusSteps: 0,
    finalMultiplier: 1,
    glowStacks: 0,
    splitGeneration: 0
  };
};

FallingMarbleSystem.prototype._activateDropBatch = function (drops) {
  if (!drops || !drops.length) {
    return [];
  }
  if (this.maxDynamicMarbles <= 0) {
    throw new Error("FallingMarbleSystem._activateDropBatch requires positive maxDynamicMarbles.");
  }

  var activated = [];
  var activeCount = this._countActiveDrops();
  for (var index = 0; index < drops.length; index += 1) {
    var drop = drops[index];
    if (activeCount + activated.length >= this.maxDynamicMarbles) {
      this.deferredDrops.push(drop);
      continue;
    }
    if (!Number.isInteger(drop.launchIndex) || drop.launchIndex < 0) {
      throw new Error("FallingMarbleSystem._activateDropBatch requires non-negative integer launchIndex.");
    }
    if (!Number.isInteger(drop.launchDropSerial) || drop.launchDropSerial <= 0) {
      throw new Error("FallingMarbleSystem._activateDropBatch requires positive launchDropSerial.");
    }
    if (drop.dropKind !== "surplus_shot") {
      this._applyDropLaunchVelocity(drop, drop.launchIndex);
    } else if (
      !drop.velocity ||
      typeof drop.velocity.x !== "number" ||
      !isFinite(drop.velocity.x) ||
      typeof drop.velocity.y !== "number" ||
      !isFinite(drop.velocity.y)
    ) {
      throw new Error("Surplus shot activation requires finite launch velocity.");
    }
    activated.push(drop);
  }

  if (activated.length > 0) {
    Array.prototype.push.apply(this.activeDrops, activated);
    this.totalFallen += activated.length;
    this._renderSnapshotDirty = true;
  }
  return activated;
};

FallingMarbleSystem.prototype.releaseEliminationPresentationDropHold = function (dt) {
  var safeDt = typeof dt === "number" && Number.isFinite(dt) && dt > 0 ? dt : 0;
  var released = false;
  this.activeDrops.forEach(function (drop) {
    if (drop && drop.holdUntilEliminationPresentationComplete === true) {
      drop.holdUntilEliminationPresentationComplete = false;
      released = true;
      if (safeDt > 0) {
        this._advanceDropMotion(drop, safeDt);
      }
    }
  }, this);
  this.deferredDrops.forEach(function (drop) {
    if (drop && drop.holdUntilEliminationPresentationComplete === true) {
      drop.holdUntilEliminationPresentationComplete = false;
      released = true;
    }
  });
  if (released) {
    this._renderSnapshotDirty = true;
  }
};

FallingMarbleSystem.prototype.hasPendingSurplusShots = function () {
  return this.pendingSurplusShotBalls.length > 0;
};

FallingMarbleSystem.prototype._resetSurplusAngleState = function (seed) {
  if (!Number.isInteger(seed)) {
    throw new Error("FallingMarbleSystem surplus volley requires integer seed.");
  }
  this.surplusVolleySeed = seed;
  var startFromLowEnd = seed % 2 === 0;
  this.surplusAngleCursor = startFromLowEnd ? 0 : SURPLUS_TURRET_ANGLE_LADDER.length - 1;
  this.surplusAngleDirection = startFromLowEnd ? 1 : -1;
  this.surplusTurretAngleDeg = SURPLUS_TURRET_ANGLE_LADDER[this.surplusAngleCursor];
  this.surplusTurretRotateTimer = SURPLUS_TURRET_ROTATE_INTERVAL_SEC;
};

FallingMarbleSystem.prototype._advanceSurplusTurretAngle = function () {
  var nextCursor = this.surplusAngleCursor + this.surplusAngleDirection;
  if (nextCursor < 0 || nextCursor >= SURPLUS_TURRET_ANGLE_LADDER.length) {
    this.surplusAngleDirection = -this.surplusAngleDirection;
    nextCursor = this.surplusAngleCursor + this.surplusAngleDirection;
  }
  if (nextCursor < 0 || nextCursor >= SURPLUS_TURRET_ANGLE_LADDER.length) {
    throw new Error("FallingMarbleSystem surplus turret angle cursor out of range.");
  }
  this.surplusAngleCursor = nextCursor;
  this.surplusTurretAngleDeg = SURPLUS_TURRET_ANGLE_LADDER[this.surplusAngleCursor];
};

FallingMarbleSystem.prototype.getSurplusTurretAimDirection = function () {
  var launchDeviationDeg = resolveLaunchDeviationFromTurretAngleDeg(this.surplusTurretAngleDeg);
  var radians = launchDeviationDeg * Math.PI / 180;
  return normalize({
    x: Math.sin(radians),
    y: Math.cos(radians)
  });
};

FallingMarbleSystem.prototype.isSurplusVolleyActive = function () {
  return this.pendingSurplusShotBalls.length > 0 || this.pendingSurplusShotOrigin !== null;
};

FallingMarbleSystem.prototype.getPendingSurplusShotCount = function () {
  if (this.pendingSurplusShotBalls.length > 0 && !this.pendingSurplusShotOrigin) {
    throw new Error("FallingMarbleSystem pending surplus shots require origin.");
  }
  return this.pendingSurplusShotBalls.length;
};

FallingMarbleSystem.prototype._createSurplusShotDrop = function (ball, spawnIndex, origin) {
  if (!ball || typeof ball !== "object") {
    throw new Error("Surplus shot ball must be object at index " + spawnIndex + ".");
  }
  if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number") {
    throw new Error("Surplus shot drop requires shooter origin.");
  }

  var launchDirection = this.getSurplusTurretAimDirection();
  var launchDeviationDeg = resolveLaunchDeviationFromTurretAngleDeg(this.surplusTurretAngleDeg);
  var launchSpeed = 980;
  var horizontalSpeed = launchDirection.x * launchSpeed;
  var upwardSpeed = launchDirection.y * launchSpeed;
  var dropSerial = this._dropSerial + 1;

  return {
    id: "surplus_shot_" + (this._dropSerial += 1),
    sourceId: "surplus_shot",
    color: ball.color || null,
    entityCategory: ball.entityCategory || "normal_ball",
    entityType: ball.entityType || null,
    innerColor: ball.innerColor || null,
    iceSnowballAlreadyCollected: false,
    row: -1,
    col: -1,
    position: {
      x: origin.x,
      y: origin.y + BoardLayout.bubbleRadius * 0.15
    },
    velocity: {
      x: horizontalSpeed,
      y: upwardSpeed
    },
    remainingBounces: this.maxBounces,
    rotation: 0,
    rotationSpeed: horizontalSpeed >= 0 ? 220 : -220,
    jarCooldown: 0,
    rimBounceCount: 0,
    lastRimBounceSpeed: 0,
    lifeTime: 0,
    stuckTimer: 0,
    lastStuckX: origin.x,
    lastStuckY: origin.y,
    inJar: false,
    jarIndex: -1,
    jarColor: null,
    active: true,
    launchIndex: spawnIndex,
    launchDropSerial: dropSerial,
    dropKind: "surplus_shot",
    launchAngleDeg: launchDeviationDeg,
    turretAngleDeg: this.surplusTurretAngleDeg,
    rootDropId: "surplus_shot_" + spawnIndex,
    hitFairyIds: [],
    fairyBonusSteps: 0,
    finalMultiplier: 1,
    glowStacks: 0,
    splitGeneration: 0
  };
};

FallingMarbleSystem.prototype._spawnSurplusShotBatch = function (balls, origin, startIndex) {
  if (!balls || !balls.length) {
    throw new Error("FallingMarbleSystem._spawnSurplusShotBatch requires at least one ball.");
  }

  var spawned = [];
  for (var index = 0; index < balls.length; index += 1) {
    spawned.push(this._createSurplusShotDrop(balls[index], startIndex + index, origin));
  }

  return this._activateDropBatch(spawned);
};

FallingMarbleSystem.prototype._spawnNextSurplusShot = function () {
  if (!this.pendingSurplusShotBalls.length) {
    return [];
  }
  if (!this.pendingSurplusShotOrigin) {
    throw new Error("FallingMarbleSystem pending surplus shots require origin.");
  }
  if (this._countActiveDrops() >= this.maxDynamicMarbles) {
    return [];
  }
  var ball = this.pendingSurplusShotBalls.shift();
  var drop = this._createSurplusShotDrop(ball, this.pendingSurplusShotIndex, this.pendingSurplusShotOrigin);
  this.pendingSurplusShotIndex += 1;
  this.lastDrops = this._activateDropBatch([drop]);
  if (!this.pendingSurplusShotBalls.length) {
    this.pendingSurplusShotOrigin = null;
  }
  return this.lastDrops;
};

FallingMarbleSystem.prototype._processPendingSurplusShots = function (dt) {
  var volleyActive = this.isSurplusVolleyActive();
  if (!volleyActive) {
    this.pendingSurplusShotTimer = 0;
    this.surplusTurretRotateTimer = 0;
    return false;
  }
  if (!this.pendingSurplusShotOrigin) {
    throw new Error("FallingMarbleSystem pending surplus shots require origin.");
  }

  var updated = false;
  var safeDt = typeof dt === "number" && isFinite(dt) && dt > 0 ? dt : 0;
  if (safeDt > 0) {
    this.surplusTurretRotateTimer -= safeDt;
    if (this.surplusTurretRotateTimer <= 0) {
      this._advanceSurplusTurretAngle();
      this.surplusTurretRotateTimer = SURPLUS_TURRET_ROTATE_INTERVAL_SEC;
      updated = true;
    }
  }

  if (!this.pendingSurplusShotBalls.length) {
    return updated;
  }

  this.pendingSurplusShotTimer -= safeDt;
  if (this.pendingSurplusShotTimer > 0) {
    return updated;
  }

  this._spawnNextSurplusShot();
  updated = true;
  if (this.pendingSurplusShotBalls.length) {
    this.pendingSurplusShotTimer = SURPLUS_SHOT_INTERVAL_SEC;
  } else {
    this.pendingSurplusShotTimer = 0;
    this.pendingSurplusShotIndex = 0;
  }
  return updated;
};

FallingMarbleSystem.prototype.registerDrops = function (cells, grid, options) {
  this.lastDrops = [];

  if (!cells || !cells.length || !grid || this.maxDynamicMarbles <= 0) {
    return this.lastDrops;
  }

  var startDelay = 0;
  if (options && Object.prototype.hasOwnProperty.call(options, "startDelay")) {
    if (typeof options.startDelay !== "number" || !Number.isFinite(options.startDelay) || options.startDelay < 0) {
      throw new Error("FallingMarbleSystem.registerDrops startDelay must be a non-negative number.");
    }
    startDelay = options.startDelay;
  }
  var holdUntilEliminationPresentationComplete = false;
  if (options && Object.prototype.hasOwnProperty.call(options, "holdUntilEliminationPresentationComplete")) {
    if (options.holdUntilEliminationPresentationComplete !== true) {
      throw new Error("FallingMarbleSystem.registerDrops holdUntilEliminationPresentationComplete must be true when provided.");
    }
    holdUntilEliminationPresentationComplete = true;
  }
  var dropKind = resolveDropKind(options);

  this.lastDrops = cells.map(function (cell, index) {
    return this._buildDropFromCell(
      cell,
      index,
      grid,
      startDelay,
      dropKind,
      holdUntilEliminationPresentationComplete
    );
  }, this);

  this._activateDropBatch(this.lastDrops);
  return this.lastDrops;
};

FallingMarbleSystem.prototype.registerSurplusShotsFromOrigin = function (balls, origin, levelSeed) {
  if (!balls || !balls.length) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires at least one ball.");
  }
  if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number") {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires shooter origin.");
  }
  if (!Number.isInteger(levelSeed)) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires integer levelSeed.");
  }
  if (this.maxDynamicMarbles <= 0) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin requires positive maxDynamicMarbles.");
  }
  if (this.pendingSurplusShotBalls.length) {
    throw new Error("FallingMarbleSystem.registerSurplusShotsFromOrigin cannot run while surplus shots are pending.");
  }

  this._resetSurplusAngleState(levelSeed);
  this.pendingSurplusShotBalls = balls.slice();
  this.pendingSurplusShotOrigin = {
    x: origin.x,
    y: origin.y
  };
  this.pendingSurplusShotIndex = 0;
  this.pendingSurplusShotTimer = 0;
  this._spawnNextSurplusShot();
  if (this.pendingSurplusShotBalls.length) {
    this.pendingSurplusShotTimer = SURPLUS_SHOT_INTERVAL_SEC;
  }
  return this.lastDrops;
};

FallingMarbleSystem.prototype._getJarZoneByIndex = function (jarIndex) {
  if (!this.jarZones || !this.jarZones.length) {
    return null;
  }

  if (jarIndex >= 0 && jarIndex < this.jarZones.length && this.jarZones[jarIndex].index === jarIndex) {
    return this.jarZones[jarIndex];
  }

  for (var i = 0; i < this.jarZones.length; i += 1) {
    if (this.jarZones[i].index === jarIndex) {
      return this.jarZones[i];
    }
  }

  return null;
};

FallingMarbleSystem.prototype._findNearestJarZone = function (x) {
  if (!this.jarZones || !this.jarZones.length) {
    return null;
  }

  var nearest = null;
  var minDx = Number.POSITIVE_INFINITY;
  for (var i = 0; i < this.jarZones.length; i += 1) {
    var zone = this.jarZones[i];
    var dx = Math.abs((x || 0) - zone.x);
    if (dx < minDx) {
      minDx = dx;
      nearest = zone;
    }
  }
  return nearest;
};

FallingMarbleSystem.prototype._findJarCollisionZone = function (x) {
  if (typeof x !== "number" || !isFinite(x)) {
    throw new Error("Jar collision lookup requires finite x.");
  }
  if (x < this._dropLeftLimit || x > this._dropRightLimit) {
    return null;
  }
  if (!this.jarZones || !this.jarZones.length) {
    return null;
  }

  for (var i = 0; i < this.jarZones.length; i += 1) {
    var zone = this.jarZones[i];
    var includesRightBoundary = i === this.jarZones.length - 1;
    if (
      x >= zone.collisionLeft &&
      (x < zone.collisionRight || (includesRightBoundary && x <= zone.collisionRight))
    ) {
      return zone;
    }
  }

  throw new Error("Jar collision partitions must continuously cover the board width.");
};

FallingMarbleSystem.prototype._consumeDropInteraction = function (result, interaction) {
  if (!interaction) {
    return;
  }

  if (interaction.bounced) {
    if (!Number.isInteger(interaction.bounceCount) || interaction.bounceCount < 1) {
      throw new Error("FallingMarbleSystem bounced interaction requires positive integer bounceCount.");
    }
    if (!Number.isInteger(interaction.glowStacks) || interaction.glowStacks < 0) {
      throw new Error("FallingMarbleSystem bounced interaction requires non-negative integer glowStacks.");
    }
    if (!Number.isInteger(interaction.jarIndex) || interaction.jarIndex < 0 || interaction.jarIndex >= this.jarCount) {
      throw new Error("FallingMarbleSystem bounced interaction requires valid jarIndex.");
    }
    result.bounced += 1;
    result.bounceEvents.push({
      bounceCount: interaction.bounceCount,
      glowStacks: interaction.glowStacks,
      jarIndex: interaction.jarIndex
    });
  }

  if (interaction.collected) {
    result.collected.push(interaction.collected);
  }

  if (interaction.cleanupScored) {
    result.cleanupScored.push(interaction.cleanupScored);
  }

  if (interaction.missed) {
    result.missed.push(interaction.missed);
  }
};

FallingMarbleSystem.prototype._forceDropResolution = function (drop, collectPreferred) {
  var inJarZone = drop.inJar === true ? this._getJarZoneByIndex(drop.jarIndex) : null;
  if (collectPreferred && inJarZone) {
    drop.active = false;
    return {
      collected: this._createCollectedEvent(drop, inJarZone)
    };
  }

  var nearestZone = collectPreferred && drop.position
    ? this._findNearestJarZone(drop.position.x)
    : null;
  if (nearestZone) {
    var cleanupScored = this._createCollectedEvent(drop, nearestZone);
    cleanupScored.scoreOnly = true;
    cleanupScored.reason = "outside_jar_cleanup";
    drop.active = false;
    return {
      cleanupScored: cleanupScored
    };
  }

  drop.active = false;
  return {
    missed: this._createMissedEvent(drop)
  };
};

FallingMarbleSystem.prototype._applyGapAttraction = function (drop, dt) {
  if (drop.inJar || !this.jarZones || this.jarZones.length < 2) {
    return;
  }

  if (drop.position.y > this._jarAttractTopY || drop.position.y < this._jarAttractBottomY) {
    return;
  }

  var nearestZone = this._findNearestJarZone(drop.position.x);
  if (!nearestZone) {
    return;
  }

  var dx = nearestZone.x - drop.position.x;
  if (Math.abs(dx) < 0.5) {
    return;
  }

  var direction = dx > 0 ? 1 : -1;
  drop.velocity.x += direction * this.jarGapAttractAccel * dt;
  drop.velocity.x = clamp(drop.velocity.x, -this.jarGapMaxSpeed, this.jarGapMaxSpeed);
};

FallingMarbleSystem.prototype._resolveStuckDropIfNeeded = function (drop, dt) {
  if (drop.inJar) {
    drop.stuckTimer = 0;
    drop.lastStuckX = drop.position.x;
    drop.lastStuckY = drop.position.y;
    return null;
  }

  var dx = drop.position.x - (typeof drop.lastStuckX === "number" ? drop.lastStuckX : drop.position.x);
  var dy = drop.position.y - (typeof drop.lastStuckY === "number" ? drop.lastStuckY : drop.position.y);
  var movedSq = dx * dx + dy * dy;
  var distanceThreshold = this.stuckDistanceThreshold * this.stuckDistanceThreshold;
  if (movedSq <= distanceThreshold) {
    drop.stuckTimer = (drop.stuckTimer || 0) + dt;
  } else {
    drop.stuckTimer = 0;
    drop.lastStuckX = drop.position.x;
    drop.lastStuckY = drop.position.y;
  }

  if ((drop.stuckTimer || 0) < this.stuckTimeThreshold) {
    return null;
  }

  return this._forceDropResolution(drop, true);
};

FallingMarbleSystem.prototype._createCollectedEvent = function (drop, zone) {
  var sameColor = !!(zone && zone.color && drop.color === zone.color);

  return {
    id: drop.id,
    sourceId: drop.sourceId,
    color: drop.color,
    entityCategory: drop.entityCategory || "normal_ball",
    entityType: drop.entityType || null,
    splitColor: typeof drop.splitColor === "string" ? drop.splitColor : null,
    innerColor: drop.innerColor || null,
    iceSnowballAlreadyCollected: drop.iceSnowballAlreadyCollected === true,
    row: drop.row,
    col: drop.col,
    position: {
      x: drop.position.x,
      y: drop.position.y
    },
    jarIndex: zone ? zone.index : -1,
    jarColor: zone ? zone.color : null,
    sameColor: sameColor,
    bonusMultiplier: sameColor ? zone.sameColorBonus : 1,
    fairyBonusSteps: drop.fairyBonusSteps,
    fairyMultiplier: drop.finalMultiplier,
    finalMultiplier: drop.finalMultiplier,
    glowStacks: drop.glowStacks,
    rootDropId: drop.rootDropId,
    splitGeneration: drop.splitGeneration,
    hitFairyIds: drop.hitFairyIds.slice()
  };
};

FallingMarbleSystem.prototype._isFairySplittableDrop = function (drop) {
  return !!(
    drop &&
    drop.entityCategory === "normal_ball" &&
    drop.entityType === null &&
    typeof drop.color === "string" &&
    drop.color &&
    drop.splitGeneration === 0
  );
};

FallingMarbleSystem.prototype._createSplitChildren = function (drop) {
  if (!this._isFairySplittableDrop(drop)) {
    throw new Error("Green fairy split requires a splittable normal drop.");
  }
  var angles = [-FairyAssistConfig.splitAngleDegrees, FairyAssistConfig.splitAngleDegrees];
  return angles.map(function (angle, index) {
    var child = clone(drop);
    child.id = drop.rootDropId + "_fairy_split_" + (this._dropSerial += 1);
    child.velocity = rotateVector(drop.velocity, angle);
    child.rotationSpeed = index === 0 ? -Math.abs(drop.rotationSpeed) : Math.abs(drop.rotationSpeed);
    child.splitGeneration = 1;
    child.active = true;
    child.lifeTime = 0;
    child.stuckTimer = 0;
    child.lastStuckX = child.position.x;
    child.lastStuckY = child.position.y;
    return child;
  }, this);
};

FallingMarbleSystem.prototype._applyFairyCollision = function (drop, activeDropCount) {
  if (drop && drop.dropKind === "victory_board_drop") {
    return null;
  }
  if (!this.fairyAssistSystem) {
    throw new Error("FallingMarbleSystem fairy collision requires FairyAssistSystem.");
  }
  var collision = this.fairyAssistSystem.resolveFirstCollision(drop, BoardLayout.bubbleRadius);
  if (!collision) {
    return null;
  }

  var normal;
  var distance = Math.sqrt(collision.dx * collision.dx + collision.dy * collision.dy);
  if (distance > 0.000001) {
    normal = {
      x: collision.dx / distance,
      y: collision.dy / distance
    };
  } else {
    normal = normalize({
      x: -drop.velocity.x,
      y: -drop.velocity.y
    });
    if (normal.x === 0 && normal.y === 0) {
      normal = { x: 0, y: 1 };
    }
  }

  var reflected = reflectVector(drop.velocity, normal);
  drop.velocity.x = reflected.x * FairyAssistConfig.bounceDamping;
  drop.velocity.y = Math.max(
    reflected.y * FairyAssistConfig.bounceDamping,
    FairyAssistConfig.minimumUpwardSpeed
  );
  drop.position.x = collision.fairy.position.x + normal.x * collision.collisionDistance;
  drop.position.y = collision.fairy.position.y + normal.y * collision.collisionDistance;
  drop.fairyBonusSteps += collision.fairy.bonusStep;
  drop.finalMultiplier = 1 + drop.fairyBonusSteps;
  if (!Number.isInteger(drop.glowStacks) || drop.glowStacks < 0) {
    throw new Error("Falling drop glowStacks must be a non-negative integer.");
  }
  drop.glowStacks = Math.min(FairyAssistConfig.maxGlowStacks, drop.glowStacks + 1);

  var result = {
    fairyId: collision.fairy.id,
    fairyColor: collision.fairy.color,
    dropId: drop.id,
    bonusStep: collision.fairy.bonusStep,
    finalMultiplier: drop.finalMultiplier,
    splitChildren: []
  };

  if (collision.fairy.canSplit && this._isFairySplittableDrop(drop)) {
    if (!Number.isInteger(activeDropCount) || activeDropCount <= 0) {
      throw new Error("Green fairy split requires positive active drop count.");
    }
    if (activeDropCount + 1 > this.maxDynamicMarbles) {
      throw new Error(
        "Green fairy split exceeds maxDynamicMarbles: " +
        (activeDropCount + 1) + " > " + this.maxDynamicMarbles + "."
      );
    }
    result.splitChildren = this._createSplitChildren(drop);
    drop.active = false;
  }
  return result;
};

FallingMarbleSystem.prototype._createMissedEvent = function (drop) {
  return {
    id: drop.id,
    sourceId: drop.sourceId,
    color: drop.color,
    entityCategory: drop.entityCategory || "normal_ball",
    entityType: drop.entityType || null,
    splitColor: typeof drop.splitColor === "string" ? drop.splitColor : null,
    innerColor: drop.innerColor || null,
    row: drop.row,
    col: drop.col,
    reason: "fell_outside_jar"
  };
};

FallingMarbleSystem.prototype._applyRimArcBounce = function (drop, zone, side, edgeType, bottomPoint) {
  var edgeX = edgeType === "outer"
    ? zone.x + side * zone.outerHalfWidth
    : zone.x + side * zone.innerHalfWidth;
  var edgeCenter = {
    x: edgeX,
    y: zone.mouthY
  };
  var desiredXSign = edgeType === "outer" ? side : -side;

  var normal = normalize({
    x: bottomPoint.x - edgeCenter.x,
    y: bottomPoint.y - edgeCenter.y
  });

  // Keep the reflected direction semantically correct:
  // outer edge => bounce away from jar, inner edge => bounce toward jar center.
  if (Math.abs(normal.x) < 0.18 || normal.x * desiredXSign < 0) {
    normal = normalize({
      x: desiredXSign,
      y: 0.52
    });
  }

  var reflected = reflectVector(drop.velocity, normal);
  var reflectedSideSpeed = Math.abs(reflected.x) * zone.rimBounce;
  var reflectedUpSpeed = Math.abs(reflected.y) * zone.rimBounce;
  var minSideSpeed = this.horizontalSpeed * 0.22;
  var sideSpeed = Math.max(minSideSpeed, reflectedSideSpeed);
  var upSpeed = Math.max(this.rimBounceLiftMin, reflectedUpSpeed);
  var currentSpeed = Math.sqrt(sideSpeed * sideSpeed + upSpeed * upSpeed) || 1;
  var bounceIndex = Math.max(0, Math.floor(drop.rimBounceCount || 0));
  var decayByCount = this.rimBounceSpeed * Math.pow(this.rimBounceDecay, bounceIndex);
  var previousBounceSpeed = Number(drop.lastRimBounceSpeed) || 0;
  var decayByPrevious = previousBounceSpeed > 0
    ? previousBounceSpeed * this.rimBounceDecay
    : decayByCount;
  // Inspector 配置决定首次缸口反弹速度；后续反弹只允许按次数和上次速度继续衰减。
  var targetBounceSpeed = Math.min(decayByCount, decayByPrevious);
  targetBounceSpeed = Math.max(this.rimBounceLiftMin + 1, targetBounceSpeed);
  var speedScale = targetBounceSpeed / currentSpeed;
  var finalSideSpeed = sideSpeed * speedScale;
  var finalUpSpeed = upSpeed * speedScale;
  if (finalUpSpeed < this.rimBounceLiftMin) {
    finalUpSpeed = this.rimBounceLiftMin;
    if (targetBounceSpeed > finalUpSpeed) {
      finalSideSpeed = Math.sqrt(Math.max(0, targetBounceSpeed * targetBounceSpeed - finalUpSpeed * finalUpSpeed));
    } else {
      finalSideSpeed = 0;
    }
  }
  // Always preserve the semantic lateral direction:
  // outer edge -> outward, inner edge -> toward jar center.
  drop.velocity.x = desiredXSign * finalSideSpeed;
  drop.velocity.y = finalUpSpeed;
  drop.lastRimBounceSpeed = Math.sqrt(
    drop.velocity.x * drop.velocity.x + drop.velocity.y * drop.velocity.y
  );
  drop.rimBounceCount = (drop.rimBounceCount || 0) + 1;

  // Move the center slightly above the rim collision band to avoid sticky repeated hits.
  drop.position.y = zone.mouthY + zone.contactBand + BoardLayout.bubbleRadius * 0.2;
  drop.jarCooldown = 0.09;
};

FallingMarbleSystem.prototype._processJarInteraction = function (drop) {
  if (!this.jarZones.length) {
    return null;
  }

  if (drop.inJar) {
    var inJarZone = this._getJarZoneByIndex(drop.jarIndex);
    if (!inJarZone) {
      drop.active = false;
      return {
        missed: this._createMissedEvent(drop)
      };
    }

    drop.jarColor = inJarZone.color || drop.jarColor || null;
    // Keep marbles sinking toward the center once they pass the mouth.
    drop.position.x += (inJarZone.x - drop.position.x) * 0.2;
    drop.velocity.x *= 0.75;
    drop.velocity.y = Math.min(drop.velocity.y, -140);
    drop.rotationSpeed *= 0.9;

    var settleY = inJarZone.bottomY + BoardLayout.bubbleRadius * 0.35;
    if (drop.position.y <= settleY) {
      drop.active = false;
      return {
        collected: this._createCollectedEvent(drop, inJarZone)
      };
    }

    return {
      inJar: true
    };
  }

  var bottomPoint = {
    x: drop.position.x,
    y: drop.position.y - BoardLayout.bubbleRadius
  };

  var zone = this._findJarCollisionZone(bottomPoint.x);
  if (!zone) {
    return null;
  }
  var dx = bottomPoint.x - zone.x;
  var absDx = Math.abs(dx);

  if (
    absDx <= zone.collectHalfWidth &&
    bottomPoint.y <= zone.mouthY + zone.contactBand &&
    drop.position.y >= zone.bottomY &&
    drop.velocity.y <= 0
  ) {
    drop.inJar = true;
    drop.jarIndex = zone.index;
    drop.jarColor = zone.color || null;
    drop.velocity.x *= 0.35;
    drop.velocity.y = Math.min(drop.velocity.y, -120);
    return {
      inJar: true
    };
  }

  if (
    drop.velocity.y < 0 &&
    bottomPoint.y <= zone.mouthY + zone.contactBand &&
    bottomPoint.y >= zone.mouthY - zone.edgeThickness * 1.4
  ) {
    var side = dx >= 0 ? 1 : -1;
    var outerEdgeThreshold = zone.innerHalfWidth + zone.edgeThickness * 0.5;
    var edgeType = absDx >= outerEdgeThreshold ? "outer" : "inner";
    if ((drop.rimBounceCount || 0) >= this.maxRimBounces) {
      edgeType = "inner";
    }

    this._applyRimArcBounce(drop, zone, side, edgeType, bottomPoint);
    return {
      bounced: true,
      bounceCount: drop.rimBounceCount,
      glowStacks: drop.glowStacks,
      jarIndex: zone.index,
      edgeType: edgeType
    };
  }

  return null;
};

FallingMarbleSystem.prototype.update = function (dt) {
  var result = createEmptyUpdateResult();
  var safeDt = typeof dt === "number" && isFinite(dt) && dt > 0 ? dt : 0;
  this.lastUpdateDt = safeDt;

  result.surplusUpdated = this._processPendingSurplusShots(safeDt);
  this._flushDeferredDrops();

  var layoutSignature = this._buildLayoutSignature();
  if (layoutSignature !== this._layoutSignature) {
    this.jarZones = this._buildJarZones();
    this._rebuildDropBounds();
    this._layoutSignature = layoutSignature;
    this._renderSnapshotDirty = true;
  }

  if (!safeDt || !this.activeDrops.length) {
    this.lastCollectedDrops = [];
    this.lastMissedDrops = [];
    this.lastBounceCount = 0;
    return result;
  }

  var drops = this.activeDrops;
  var activeDropCount = 0;
  for (var activeIndex = 0; activeIndex < drops.length; activeIndex += 1) {
    if (drops[activeIndex].active) {
      activeDropCount += 1;
    }
  }
  var spawnedDrops = this._spawnedDropsBuffer;
  spawnedDrops.length = 0;
  var writeIndex = 0;
  for (var readIndex = 0; readIndex < drops.length; readIndex += 1) {
    var drop = drops[readIndex];
    if (!drop.active) {
      continue;
    }

    result.updated = true;
    if (drop.holdUntilEliminationPresentationComplete === true) {
      drops[writeIndex] = drop;
      writeIndex += 1;
      this._renderSnapshotDirty = true;
      continue;
    }
    if (typeof drop.startDelay === "number" && drop.startDelay > 0) {
      drop.startDelay = Math.max(0, drop.startDelay - dt);
      drops[writeIndex] = drop;
      writeIndex += 1;
      this._renderSnapshotDirty = true;
      continue;
    }

    drop.lifeTime = (drop.lifeTime || 0) + dt;
    if (drop.lifeTime >= this.maxDropLifeTime) {
      this._consumeDropInteraction(result, this._forceDropResolution(drop, true));
      activeDropCount -= 1;
      continue;
    }

    drop.jarCooldown = Math.max(0, (drop.jarCooldown || 0) - dt);
    this._applyGapAttraction(drop, dt);
    drop.velocity.y -= this.gravity * dt;
    drop.position.x += drop.velocity.x * dt;
    drop.position.y += drop.velocity.y * dt;
    drop.rotation += drop.rotationSpeed * dt;

    var fairyCollision = this._applyFairyCollision(drop, activeDropCount + spawnedDrops.length);
    if (fairyCollision) {
      result.fairyHits.push({
        fairyId: fairyCollision.fairyId,
        fairyColor: fairyCollision.fairyColor,
        dropId: fairyCollision.dropId,
        bonusStep: fairyCollision.bonusStep,
        finalMultiplier: fairyCollision.finalMultiplier
      });
      if (fairyCollision.splitChildren.length > 0) {
        Array.prototype.push.apply(spawnedDrops, fairyCollision.splitChildren);
        result.splits.push({
          rootDropId: drop.rootDropId,
          sourceDropId: drop.id,
          childDropIds: fairyCollision.splitChildren.map(function (child) {
            return child.id;
          })
        });
        activeDropCount -= 1;
        continue;
      }
    }

    var jarInteraction = this._processJarInteraction(drop);
    if (jarInteraction) {
      this._consumeDropInteraction(result, jarInteraction);

      if (drop.active) {
        this._clampDropToSideBounds(drop);
        if (this._isDropPressingSideBounds(drop)) {
          this._applySideWallEscape(drop, false);
        }
        drops[writeIndex] = drop;
        writeIndex += 1;
      } else {
        activeDropCount -= 1;
      }
      continue;
    }

    var clampedToSideBounds = this._clampDropToSideBounds(drop);
    if (
      (clampedToSideBounds || this._isDropPressingSideBounds(drop))
    ) {
      this._applySideWallEscape(drop, drop.dropKind !== "victory_board_drop");
    }

    this._consumeDropInteraction(result, this._resolveStuckDropIfNeeded(drop, dt));
    if (!drop.active) {
      activeDropCount -= 1;
      continue;
    }

    if (drop.position.y <= this.cleanupY) {
      drop.active = false;
      result.missed.push(this._createMissedEvent(drop));
      activeDropCount -= 1;
    }
    if (drop.active) {
      drops[writeIndex] = drop;
      writeIndex += 1;
    }
  }
  if (writeIndex !== drops.length) {
    drops.length = writeIndex;
  }
  if (spawnedDrops.length > 0) {
    Array.prototype.push.apply(drops, spawnedDrops);
    this.totalFallen += spawnedDrops.length;
  }
  this._flushDeferredDrops();

  this.lastCollectedDrops = result.collected.slice();
  this.lastMissedDrops = result.missed.slice();
  this.lastBounceCount = result.bounced;
  this._renderSnapshotDirty = true;

  return result;
};

FallingMarbleSystem.prototype.snapshotForRender = function () {
  var visibleDropCount = this._countVisibleFallingDrops();
  if (!this._renderSnapshotCache) {
    this._renderSnapshotCache = {
      activeDrops: this.activeDrops,
      activeDropCount: visibleDropCount,
      jarZones: this.jarZones
    };
    this._renderSnapshotDirty = false;
    return this._renderSnapshotCache;
  }

  if (this._renderSnapshotDirty) {
    this._renderSnapshotCache.activeDrops = this.activeDrops;
    this._renderSnapshotCache.activeDropCount = visibleDropCount;
    this._renderSnapshotCache.jarZones = this.jarZones;
    this._renderSnapshotDirty = false;
  }
  return this._renderSnapshotCache;
};

FallingMarbleSystem.prototype._countVisibleFallingDrops = function () {
  var count = 0;
  for (var index = 0; index < this.activeDrops.length; index += 1) {
    if (this.activeDrops[index].active) {
      count += 1;
    }
  }
  return count;
};

FallingMarbleSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.maxDynamicMarbles = this.maxDynamicMarbles;
  snapshot.maxBounces = this.maxBounces;
  snapshot.totalFallen = this.totalFallen;
  snapshot.lastDrops = clone(this.lastDrops);
  snapshot.activeDrops = clone(this.activeDrops);
  snapshot.activeDropCount = this.activeDrops.length;
  snapshot.lastCollectedDrops = clone(this.lastCollectedDrops);
  snapshot.lastMissedDrops = clone(this.lastMissedDrops);
  snapshot.lastBounceCount = this.lastBounceCount;
  snapshot.jarZones = clone(this.jarZones);
  return snapshot;
};

module.exports = FallingMarbleSystem;

},{"./BaseSystem":"BaseSystem","../../assets/scripts/config/BoardLayout":"BoardLayout","../config/FairyAssistConfig":"FairyAssistConfig","../config/FallingRulesDefaults":"FallingRulesDefaults"}],
"FallingRulesDefaults":[function(require,module,exports){
"use strict";

var FallingRulesDefaults = {
  gravity: 900,
  initialSpeedY: 240,
  horizontalSpeed: 165,
  maxDropLifeTime: 6,
  bounceDamping: 0.82,
  maxDynamicMarbles: 9999
};

module.exports = FallingRulesDefaults;

},{}],
"GameManager":[function(require,module,exports){
"use strict";

var Logger = require("../../assets/scripts/utils/Logger");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var FairyAssistConfig = require("../config/FairyAssistConfig");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");
var ShooterController = require("../systems/ShooterController");
var TrajectoryPredictor = require("../systems/TrajectoryPredictor");
var BubbleGrid = require("../systems/BubbleGrid");
var MatchSystem = require("../systems/MatchSystem");
var SupportSystem = require("../systems/SupportSystem");
var FairyAssistSystem = require("../systems/FairyAssistSystem");
var BoardViewportSystem = require("../systems/BoardViewportSystem");
var FallingMarbleSystem = require("../systems/FallingMarbleSystem");
var JarCollectorSystem = require("../systems/JarCollectorSystem");
var BoardOcclusionSystem = require("../systems/BoardOcclusionSystem");
var ProjectileMath = require("./ProjectileMath");
var AdRevivePolicy = require("./AdRevivePolicy");
var StarRatingPolicy = require("../../assets/scripts/core/StarRatingPolicy");
var createGameManagerShotResolutionMethods = require("./GameManagerShotResolutionMethods");

var clone = ProjectileMath.clone;
var distance = ProjectileMath.distance;
var lerpPoint = ProjectileMath.lerpPoint;
var quantize = ProjectileMath.quantize;
var buildProjectilePathFromShotPlan = ProjectileMath.buildProjectilePathFromShotPlan;
var measurePathDistance = ProjectileMath.measurePathDistance;
var buildAimGuidePath = ProjectileMath.buildAimGuidePath;
var AD_REVIVE_ALLOWED_STATES = {
  out_of_shots: true,
  lost_danger: true,
  lost_objective: true
};
var ADD_BALL_PROMPT_STATE = "out_of_shots_add_ball_prompt";
var COLLECTION_OBJECTIVE_TYPES = {
  collect_any: true,
  collect_color: true,
  collect_ice_snowball: true
};
var AD_RUN_POWERUP_TYPES = {
  three_line_elimination: true,
  plus_three_balls: true
};
var PLUS_THREE_BALLS_AMOUNT = 10;
var SNOW_REMOVAL_CLEAR_COUNT = 10;
var SPLITTER_SPAWN_DELAY_SEC = 0.2;
var VINE_CAST_SHOT_INTERVAL = 3;
var VINE_CAST_PREVIEW_DURATION = SpecialAnimationTiming.vineCast.previewDuration;
var TIMED_LEVEL_RENDER_BUCKET_MS = 250;
var BUBBLE_BREAK_SOUND_INTERVAL_MS = 30;

function assertFiniteNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(fieldName + " must be finite.");
  }
  return numberValue;
}

function assertPositiveNumber(value, fieldName) {
  var numberValue = assertFiniteNumber(value, fieldName);
  if (numberValue <= 0) {
    throw new Error(fieldName + " must be positive.");
  }
  return numberValue;
}

function assertPositiveInteger(value, fieldName) {
  var numberValue = assertFiniteNumber(value, fieldName);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(fieldName + " must be a positive integer.");
  }
  return numberValue;
}

function readRunPowerupCount(inventory, powerupType) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    throw new Error("Ad run powerup inventory must be an object.");
  }
  if (!Object.prototype.hasOwnProperty.call(inventory, powerupType)) {
    return 0;
  }
  var count = Math.floor(assertFiniteNumber(inventory[powerupType], "Ad run powerup inventory." + powerupType));
  if (count < 0) {
    throw new Error("Ad run powerup inventory cannot be negative: " + powerupType);
  }
  return count;
}

function createEmptyResolution() {
  return {
    attachedCell: null,
    matched: [],
    floating: [],
    collected: [],
    thawed: [],
    iceCollected: 0,
    matchedObjectiveCollected: [],
    injectedSkills: [],
    reactiveTriggered: [],
    blastExplosions: [],
    spawnedBySplitters: [],
    swirlRotations: [],
    wormholeShifts: [],
    vineCastEvaluated: false,
    vineCasts: [],
    vineSpiritHits: [],
    releasedVines: [],
    witheredVines: [],
    collectedKeys: [],
    unlockedLockedBalls: [],
    fairyAssistEvents: [],
    fairyAssistResolved: false,
    impact: null,
    scoreDelta: 0,
    boardCleared: false,
    boardDropped: false,
    boardViewportAdjusted: false,
    topAnchorCollapse: false,
    eliminationSequence: [],
    scoreEvents: [],
    dangerReached: false
  };
}

function requireDropGlowStacks(value, description) {
  if (!Number.isInteger(value) || value < 0 || value > FairyAssistConfig.maxGlowStacks) {
    throw new Error(description + " requires glowStacks in [0, " + FairyAssistConfig.maxGlowStacks + "].");
  }
  return value;
}

function resolveCollectedDropAudioGlowStacks(collectedDrops) {
  if (!Array.isArray(collectedDrops) || !collectedDrops.length) {
    throw new Error("Collected drop audio requires non-empty collectedDrops.");
  }

  var maxGlowStacks = 0;
  collectedDrops.forEach(function (drop) {
    var glowStacks = requireDropGlowStacks(drop.glowStacks, "Collected drop audio");
    if (glowStacks > maxGlowStacks) {
      maxGlowStacks = glowStacks;
    }
  });
  return maxGlowStacks;
}

var RAINBOW_TIE_BREAK_ORDER = {
  R: 8,
  G: 7,
  B: 6,
  Y: 5,
  P: 4,
  K: 3,
  O: 2,
  W: 1
};

// 普通匹配消除按固定每球基础分计分；连击增量在结算链路中叠加。
var BASE_SCORE_RULES = {
  shotBase: 120,
  attachBase: 30,
  blastBase: 30,
  matchedDrop: 10,
  floatingDrop: 80,
  blastDrop: 100,
  jarCollectBase: 60,
  skillOverflow: 220
};

var SCORE_HEAT_PROFILES = {
  tutorial: {
    multiplier: 0.88,
    perShotRange: [170, 250]
  },
  normal: {
    multiplier: 0.98,
    perShotRange: [220, 320]
  },
  hard: {
    multiplier: 1.08,
    perShotRange: [270, 390]
  },
  expert: {
    multiplier: 1.16,
    perShotRange: [320, 470]
  }
};

var SCORE_HEAT_DIFFICULTY_ALIAS = {
  beginner: "tutorial",
  easy: "tutorial",
  advanced: "normal",
  medium: "normal",
  difficult: "hard"
};

function resolveImpactBounceBoardAdvanceDelay() {
  if (typeof SpecialAnimationTiming.calculateImpactBounceTotalDuration !== "function") {
    throw new Error("SpecialAnimationTiming.calculateImpactBounceTotalDuration is required.");
  }

  return SpecialAnimationTiming.calculateImpactBounceTotalDuration(
    IMPACT_BOUNCE_PUSH_DISTANCE,
    IMPACT_BOUNCE_SPEED
  );
}

function requireImpactBounceTiming() {
  if (!SpecialAnimationTiming.impactBounce || typeof SpecialAnimationTiming.impactBounce !== "object") {
    throw new Error("SpecialAnimationTiming.impactBounce is required.");
  }
  return SpecialAnimationTiming.impactBounce;
}

var IMPACT_BOUNCE_TIMING = requireImpactBounceTiming();
var IMPACT_BOUNCE_PUSH_DISTANCE = assertPositiveNumber(
  IMPACT_BOUNCE_TIMING.defaultPushDistance,
  "SpecialAnimationTiming.impactBounce.defaultPushDistance"
);
var IMPACT_BOUNCE_SPEED = assertPositiveNumber(
  BoardLayout.impactBounceSpeed,
  "BoardLayout.impactBounceSpeed"
);
// 碰撞反馈播放完成后再下压，避免命中反馈与网格位移同帧造成视觉偏差。
var BOARD_ADVANCE_AFTER_IMPACT_DELAY = assertPositiveNumber(
  resolveImpactBounceBoardAdvanceDelay(),
  "Board advance after impact delay"
);
var BOARD_ADVANCE_DELAY_EPSILON = 0.000001;
var KEY_UNLOCK_BOARD_ADVANCE_BLOCK_DELAY = SpecialAnimationTiming.keyUnlock.totalDuration;
if (
  !SpecialAnimationTiming.swirlRotation ||
  typeof SpecialAnimationTiming.swirlRotation.duration !== "number" ||
  !isFinite(SpecialAnimationTiming.swirlRotation.duration) ||
  SpecialAnimationTiming.swirlRotation.duration <= 0
) {
  throw new Error("SpecialAnimationTiming.swirlRotation.duration must be positive.");
}
if (SpecialAnimationTiming.swirlRotation.angleDegrees !== 60) {
  throw new Error("SpecialAnimationTiming.swirlRotation.angleDegrees must be exactly 60.");
}
var SWIRL_ROTATION_DURATION = SpecialAnimationTiming.swirlRotation.duration;
if (
  !SpecialAnimationTiming.wormholeShift ||
  typeof SpecialAnimationTiming.wormholeShift.duration !== "number" ||
  !isFinite(SpecialAnimationTiming.wormholeShift.duration) ||
  SpecialAnimationTiming.wormholeShift.duration <= 0
) {
  throw new Error("SpecialAnimationTiming.wormholeShift.duration must be positive.");
}
var WORMHOLE_SHIFT_DURATION = SpecialAnimationTiming.wormholeShift.duration;
// 最后一颗入缸后，延迟再弹出 WinView。
var WIN_SETTLEMENT_DELAY_SEC = 1;
var DEFAULT_JAR_SCORE_BOOST_MULTIPLIER = 2;
var DEFAULT_JAR_SCORE_BOOST_DURATION_MS = 5000;
// 第二次连消起，每个匹配碎裂球每增加一层连击额外加 5 分；UI 显示为连击+1、+2…
var COMBO_BONUS_PER_HIT = 5;
function resolveBallDisplayCode(ball) {
  if (!ball) {
    return null;
  }

  if (ball.color) {
    return ball.color;
  }

  if (ball.entityType === "rainbow") {
    return "RAINBOW";
  }

  if (ball.entityType === "blast") {
    return "BLAST";
  }

  if (ball.entityType === "stone") {
    return "STONE";
  }

  if (ball.entityType === "molotov") {
    return "MOLOTOV";
  }

  if (ball.entityType === "splitter") {
    return "SPLIT_" + ball.splitColor;
  }

  if (ball.entityType === "swirl") {
    return "SWIRL";
  }

  if (ball.entityType === "locked") {
    return "LOCKED";
  }

  if (ball.entityType === "key") {
    return "KEY";
  }

  return null;
}

function isSkillBall(cellOrBall) {
  return !!(cellOrBall && cellOrBall.entityCategory === "skill_ball");
}

function isIceBall(cellOrBall) {
  return !!(
    cellOrBall &&
    cellOrBall.entityCategory === "obstacle_ball" &&
    cellOrBall.entityType === "ice"
  );
}

function isStoneBall(cellOrBall) {
  return !!(
    cellOrBall &&
    cellOrBall.entityCategory === "obstacle_ball" &&
    cellOrBall.entityType === "stone"
  );
}

function isBarrierObstacleBall(cellOrBall) {
  return isStoneBall(cellOrBall) || isIceBall(cellOrBall);
}

function isBlastBall(ball) {
  return !!(ball && ball.entityCategory === "skill_ball" && ball.entityType === "blast");
}

function isRainbowBall(ball) {
  return !!(ball && ball.entityCategory === "skill_ball" && ball.entityType === "rainbow");
}

function isMolotovBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "molotov");
}

function isSplitterBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "splitter");
}

function isSwirlBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "swirl");
}

function isWormholeBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "wormhole");
}

function isVineSpiritBall(ball) {
  return !!(ball && ball.entityCategory === "reactive_ball" && ball.entityType === "vine_spirit");
}

function isVineEntangledBall(ball) {
  return !!(
    ball &&
    ball.entityCategory === "normal_ball" &&
    typeof ball.vineOwnerId === "string" &&
    ball.vineOwnerId
  );
}

function isLockedBall(ball) {
  return !!(ball && ball.entityCategory === "locked_ball" && ball.entityType === "locked");
}

function isKeyBall(ball) {
  return !!(ball && ball.entityCategory === "key_ball" && ball.entityType === "key");
}

function resolveIceInnerColor(cellOrBall) {
  if (!cellOrBall) {
    return null;
  }

  if (typeof cellOrBall.innerColor === "string" && cellOrBall.innerColor) {
    return cellOrBall.innerColor;
  }

  return null;
}

function buildBubbleBreakShatterDelaysMs(removedCells, eliminationSequence) {
  if (!Array.isArray(removedCells) || !removedCells.length) {
    return [];
  }

  if (typeof eliminationSequence !== "undefined") {
    if (!Array.isArray(eliminationSequence)) {
      throw new Error("Bubble break event eliminationSequence must be an array when provided.");
    }
    var removedCellIds = {};
    removedCells.forEach(function (cell) {
      if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
        throw new Error("Bubble break event removed cell requires id.");
      }
      removedCellIds[String(cell.id)] = true;
    });

    return eliminationSequence.filter(function (entry) {
      if (!entry || (typeof entry.cellId !== "string" && typeof entry.cellId !== "number")) {
        throw new Error("Bubble break event elimination sequence entry requires cellId.");
      }
      return removedCellIds[String(entry.cellId)] === true;
    }).map(function (entry) {
      var delayMs = Number(entry.delayMs);
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error("Bubble break event elimination sequence delayMs must be non-negative.");
      }
      return delayMs;
    });
  }

  return removedCells.map(function (cell, index) {
    if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
      throw new Error("Bubble break event removed cell requires id.");
    }
    return index * BUBBLE_BREAK_SOUND_INTERVAL_MS;
  });
}

function requireSnowRemovalTargetCoordinates(cell, description) {
  if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
    throw new Error(description + " requires integer row and col.");
  }
  return cell;
}

function compareSnowRemovalTargetsFromBoardBottom(left, right) {
  requireSnowRemovalTargetCoordinates(left, "Snow removal left target");
  requireSnowRemovalTargetCoordinates(right, "Snow removal right target");
  if (left.row !== right.row) {
    return right.row - left.row;
  }
  return left.col - right.col;
}

function buildSnowRemovalTargetKey(targets) {
  if (!Array.isArray(targets)) {
    throw new Error("Snow removal target key requires target array.");
  }
  return targets.map(function (target) {
    requireSnowRemovalTargetCoordinates(target, "Snow removal target");
    return target.row + ":" + target.col;
  }).sort().join(",");
}

function buildIceSnowballCollectEntry(cell, innerColor) {
  if (!cell || typeof cell !== "object") {
    throw new Error("Ice snowball collect entry requires cell.");
  }
  if (typeof innerColor !== "string" || !innerColor) {
    throw new Error("Ice snowball collect entry requires innerColor.");
  }

  var entry = {
    id: cell.id,
    innerColor: innerColor
  };
  if (Number.isInteger(cell.row) && Number.isInteger(cell.col)) {
    entry.row = cell.row;
    entry.col = cell.col;
  }
  if (cell.position && typeof cell.position.x === "number" && typeof cell.position.y === "number") {
    entry.x = cell.position.x;
    entry.y = cell.position.y;
  }
  return entry;
}

function buildActiveProjectile(firedBall, shotPlan) {
  var pathPoints = buildProjectilePathFromShotPlan(shotPlan);
  var displayCode = resolveBallDisplayCode(firedBall);

  return {
    position: clone(pathPoints[0]),
    color: displayCode,
    ball: firedBall ? clone(firedBall) : null,
    speed: BoardLayout.projectileSpeed,
    pathPoints: pathPoints,
    segmentIndex: 0,
    segmentProgress: 0,
    targetCell: shotPlan && shotPlan.targetCell ? clone(shotPlan.targetCell) : null,
    shotPlan: shotPlan ? clone(shotPlan) : null
  };
}

function buildRuntimeProjectileSnapshot(projectile) {
  if (!projectile) {
    return null;
  }

  return {
    position: {
      x: projectile.position.x,
      y: projectile.position.y
    },
    color: projectile.color,
    ball: projectile.ball ? clone(projectile.ball) : null
  };
}

function findPrimaryCollectionObjective(levelConfig) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  if (!level) {
    return null;
  }

  var sources = [level.bonusObjectives, level.winConditions];
  for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    var objectives = Array.isArray(sources[sourceIndex]) ? sources[sourceIndex] : [];
    for (var objectiveIndex = 0; objectiveIndex < objectives.length; objectiveIndex += 1) {
      var objective = objectives[objectiveIndex];
      if (objective && COLLECTION_OBJECTIVE_TYPES[objective.type] === true) {
        return objective;
      }
    }
  }

  return null;
}

function listCollectionRewardObjectives(levelConfig) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  if (!level) {
    throw new Error("Collection reward evaluation requires level config.");
  }
  if (!Array.isArray(level.winConditions)) {
    throw new Error("Collection reward evaluation requires level.winConditions array.");
  }
  if (!Array.isArray(level.bonusObjectives)) {
    throw new Error("Collection reward evaluation requires level.bonusObjectives array.");
  }

  return level.bonusObjectives.concat(level.winConditions).filter(function (objective) {
    return objective && COLLECTION_OBJECTIVE_TYPES[objective.type] === true;
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeStarThresholds(scoreHeatBand) {
  var band = scoreHeatBand || {};
  var star1 = Math.max(0, Math.floor(Number(band.min) || 0));
  var star2 = Math.max(star1, Math.floor(Number(band.target) || 0));
  var star3 = Math.max(star2, Math.floor(Number(band.max) || 0));

  return {
    star1: star1,
    star2: star2,
    star3: star3
  };
}

function calculateStarRating(score, scoreHeatBand) {
  var thresholds = normalizeStarThresholds(scoreHeatBand);
  var safeScore = Math.max(0, Math.floor(Number(score) || 0));
  var stars = 0;

  if (thresholds.star1 > 0 && safeScore >= thresholds.star1) {
    stars += 1;
  }
  if (thresholds.star2 > 0 && safeScore >= thresholds.star2) {
    stars += 1;
  }
  if (thresholds.star3 > 0 && safeScore >= thresholds.star3) {
    stars += 1;
  }

  return stars;
}

function calculateStarProgress(score, scoreHeatBand) {
  var thresholds = normalizeStarThresholds(scoreHeatBand);
  var safeScore = Math.max(0, Number(score) || 0);
  var maxThreshold = Math.max(0, thresholds.star3);

  if (maxThreshold <= 0) {
    return 0;
  }

  return clamp(safeScore / maxThreshold, 0, 1);
}

function cloneScoreRules(rules) {
  return Object.keys(rules || {}).reduce(function (result, key) {
    result[key] = Number(rules[key]) || 0;
    return result;
  }, {});
}

function resolveScoreHeatDifficulty(levelConfig) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  var rawDifficulty = typeof (level && level.difficulty) === "string"
    ? level.difficulty.trim().toLowerCase()
    : "";
  if (!rawDifficulty) {
    return "normal";
  }

  if (SCORE_HEAT_PROFILES[rawDifficulty]) {
    return rawDifficulty;
  }

  return SCORE_HEAT_DIFFICULTY_ALIAS[rawDifficulty] || "normal";
}

function buildScoreRulesForLevel(levelConfig) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  var difficulty = resolveScoreHeatDifficulty(levelConfig);
  var profile = SCORE_HEAT_PROFILES[difficulty] || SCORE_HEAT_PROFILES.normal;
  var multiplier = profile.multiplier;

  var difficultyScore = Number(level && level.difficultyScore);
  if (Number.isFinite(difficultyScore) && difficultyScore > 0) {
    // 用配置里的 difficultyScore 做轻量热度修正（不影响关卡可读性）。
    multiplier += (difficultyScore - 70) * 0.0015;
  }

  multiplier = clamp(multiplier, 0.82, 1.22);

  var rules = cloneScoreRules(BASE_SCORE_RULES);
  Object.keys(rules).forEach(function (key) {
    if (key === "matchedDrop") {
      return;
    }
    rules[key] = Math.max(1, Math.round(rules[key] * multiplier));
  });

  return {
    difficulty: difficulty,
    multiplier: multiplier,
    rules: rules
  };
}

function buildScoreHeatBand(levelConfig, scoreProfile) {
  var level = levelConfig && levelConfig.level ? levelConfig.level : null;
  var configuredTargetScore = Math.max(0, Math.floor(Number(level && level.targetScore) || 0));
  var targetScore = configuredTargetScore;

  if (targetScore <= 0) {
    var shotLimit = Math.max(0, Math.floor(Number(level && level.shotLimit) || 0));
    var profile = scoreProfile && SCORE_HEAT_PROFILES[scoreProfile.difficulty]
      ? SCORE_HEAT_PROFILES[scoreProfile.difficulty]
      : SCORE_HEAT_PROFILES.normal;
    var perShotRange = profile.perShotRange || [220, 320];
    var objective = findPrimaryCollectionObjective(levelConfig);
    var objectiveTarget = objective ? Math.max(0, Math.floor(Number(objective.value) || 0)) : 0;
    var objectiveBoost = objectiveTarget * (scoreProfile && scoreProfile.rules ? scoreProfile.rules.jarCollectBase : BASE_SCORE_RULES.jarCollectBase);
    var fallbackMin = Math.round(shotLimit * perShotRange[0] + objectiveBoost * 0.5);
    var fallbackMax = Math.round(shotLimit * perShotRange[1] + objectiveBoost);
    if (fallbackMax < fallbackMin) {
      fallbackMax = fallbackMin;
    }
    targetScore = Math.round((fallbackMin + fallbackMax) * 0.5);
  }

  targetScore = Math.max(1, targetScore);
  var starThresholds = level && level.starThresholds !== undefined
    ? StarRatingPolicy.resolveStarThresholds(levelConfig)
    : StarRatingPolicy.buildStarThresholdsFromTargetScore(targetScore);

  return {
    min: starThresholds.star1,
    target: starThresholds.star2,
    max: starThresholds.star3,
    targetScore: targetScore,
    difficulty: scoreProfile ? scoreProfile.difficulty : "normal",
    multiplier: scoreProfile ? Number(scoreProfile.multiplier.toFixed(3)) : 1
  };
}

function GameManager(options) {
  options = options || {};

  this.poolManager = options.poolManager || null;
  this.levelManager = options.levelManager || null;
  this.state = "idle";
  this.currentLevel = null;
  this.remainingShots = 0;
  this.score = 0;
  this.comboStreak = 0;
  this.maxComboStreak = 0;
  this.shotsFired = 0;
  this.dropInterval = 0;
  this.lastFiredColor = null;
  this.lastResolution = createEmptyResolution();
  this.activeProjectile = null;
  this.pendingProjectileFinalize = false;
  this.pendingShotPlan = null;
  this.isAiming = false;
  this.trajectoryCacheKey = null;
  this.trajectoryCachePlan = null;
  this._aimGuidePathCacheKey = "";
  this._aimGuidePathCache = null;
  this._cachedAdRunPowerupAllowed = null;
  this.cachedBoardVersion = -1;
  this.cachedBoardViewportOffsetY = null;
  this.cachedBoardSnapshot = null;
  this.cachedJarSnapshotKey = "";
  this.cachedJarSnapshot = null;
  this.sameColorJarCollected = 0;
  this.sameColorJarBonusScore = 0;
  this.iceCollectedTotal = 0;
  this.isTimedInfiniteShots = false;
  this.timeLimitMs = 0;
  this.remainingTimeMs = 0;
  this.timerPaused = false;
  this.requiredStarCount = 0;
  this.adRunPowerupInventory = {};
  this.adRunPowerupGrantCounts = {};
  this.impactSequence = 0;
  this.runtimeEventSequence = 0;
  this.pendingRuntimeEvents = [];
  this.surplusShotAimRecenterRevision = 0;
  this.surplusShotAimRecentered = false;
  this.pendingBoardAdvanceSpecialAnimationDelay = 0;
  this.pendingBoardAdvanceDelay = 0;
  this.pendingBoardAdvanceEliminationPresentation = false;
  this.pendingDeferredEnsureMinimumVisibleBoardRows = false;
  this.pendingDropIntervalBoardAdvance = false;
  this.boardAdvancedThisFrame = false;
  this.boardAdvanceUpdateSerial = 0;
  this.pendingBoardAdvanceScheduledUpdateSerial = -1;
  this.pendingWinSettlementDelay = 0;
  this.pendingSplitterSpawns = [];
  this.pendingMolotovBlastQueue = [];
  this.activeMolotovBlast = null;
  this.molotovBlastTriggeredIds = {};
  this.molotovResolutionPending = false;
  this.molotovPendingResolutionContext = null;
  this.pendingSwirlRotationRemaining = 0;
  this.pendingSwirlRotationResolution = null;
  this.pendingWormholeShiftRemaining = 0;
  this.pendingWormholeShiftResolution = null;
  this.pendingVineCastRemaining = 0;
  this.pendingVineCastResolution = null;
  this.pendingBarrierHammer = false;
  this.pendingRainbowColorSelection = null;
  this.ricochetGuideActive = false;
  this.jarScoreBoostActive = false;
  this.jarScoreBoostMultiplier = 1;
  this.jarScoreBoostRemainingMs = 0;
  this._lastTimerRenderBucket = -1;
  this.scoreRules = cloneScoreRules(BASE_SCORE_RULES);
  this.scoreHeatBand = buildScoreHeatBand(null, {
    difficulty: "normal",
    multiplier: 1,
    rules: this.scoreRules
  });
  this.systems = {
    shooterController: new ShooterController(),
    trajectoryPredictor: new TrajectoryPredictor(),
    boardViewportSystem: new BoardViewportSystem(),
    bubbleGrid: new BubbleGrid(),
    matchSystem: new MatchSystem(),
    supportSystem: new SupportSystem(),
    fairyAssistSystem: new FairyAssistSystem(),
    fallingMarbleSystem: new FallingMarbleSystem(),
    jarCollectorSystem: new JarCollectorSystem(),
    boardOcclusionSystem: new BoardOcclusionSystem()
  };
  this.systems.bubbleGrid.attachBoardViewport(this.systems.boardViewportSystem);
  this.systems.fallingMarbleSystem.attachFairyAssistSystem(this.systems.fairyAssistSystem);
}

GameManager.prototype.bootstrap = function () {
  this._registerPools();

  Object.keys(this.systems).forEach(function (key) {
    this.systems[key].initialize({
      poolManager: this.poolManager,
      levelManager: this.levelManager,
      gameManager: this
    });
  }, this);

  this.state = "bootstrapped";
  Logger.info("Core modules ready", Object.keys(this.systems));
  return this;
};

GameManager.prototype.startLevel = function (levelConfig, startContext) {
  this.currentLevel = levelConfig;
  if (!levelConfig || !levelConfig.level) {
    throw new Error("GameManager.startLevel requires level config.");
  }
  if (!startContext || typeof startContext !== "object" || Array.isArray(startContext)) {
    throw new Error("GameManager.startLevel requires explicit startContext.");
  }
  var level = levelConfig.level;
  this.isTimedInfiniteShots = level.playMode === "timed_infinite_shots";
  this.timeLimitMs = this.isTimedInfiniteShots ? assertPositiveInteger(level.timeLimitSeconds, "level.timeLimitSeconds") * 1000 : 0;
  this.remainingTimeMs = this.timeLimitMs;
  this.timerPaused = false;
  this._lastTimerRenderBucket = this.isTimedInfiniteShots
    ? Math.ceil(this.remainingTimeMs / TIMED_LEVEL_RENDER_BUCKET_MS)
    : -1;
  this.requiredStarCount = 1;
  this.remainingShots = this.isTimedInfiniteShots ? 0 : assertPositiveInteger(level.shotLimit, "level.shotLimit");
  this.score = 0;
  this.comboStreak = 0;
  this.maxComboStreak = 0;
  this.shotsFired = 0;
  this.levelRandomSeed = assertPositiveInteger(level.levelId, "level.levelId");
  this.lastFiredColor = null;
  this.lastResolution = createEmptyResolution();
  this.activeProjectile = null;
  this.pendingProjectileFinalize = false;
  this.pendingShotPlan = null;
  this.isAiming = false;
  this.trajectoryCacheKey = null;
  this.trajectoryCachePlan = null;
  this._aimGuidePathCacheKey = "";
  this._aimGuidePathCache = null;
  this._cachedAdRunPowerupAllowed = null;
  this.cachedBoardVersion = -1;
  this.cachedBoardViewportOffsetY = null;
  this.cachedBoardSnapshot = null;
  this.cachedJarSnapshotKey = "";
  this.cachedJarSnapshot = null;
  this.sameColorJarCollected = 0;
  this.sameColorJarBonusScore = 0;
  this.iceCollectedTotal = 0;
  this.adRunPowerupInventory = {};
  this.adRunPowerupGrantCounts = {};
  this.impactSequence = 0;
  this.runtimeEventSequence = 0;
  this.pendingRuntimeEvents = [];
  this.surplusShotAimRecenterRevision = 0;
  this.surplusShotAimRecentered = false;
  this.pendingBoardAdvanceSpecialAnimationDelay = 0;
  this.pendingBoardAdvanceDelay = 0;
  this.pendingBoardAdvanceEliminationPresentation = false;
  this.pendingDeferredEnsureMinimumVisibleBoardRows = false;
  this.pendingDropIntervalBoardAdvance = false;
  this.boardAdvancedThisFrame = false;
  this.boardAdvanceUpdateSerial = 0;
  this.pendingBoardAdvanceScheduledUpdateSerial = -1;
  this.pendingWinSettlementDelay = 0;
  this.pendingSplitterSpawns = [];
  this.pendingMolotovBlastQueue = [];
  this.activeMolotovBlast = null;
  this.molotovBlastTriggeredIds = {};
  this.molotovResolutionPending = false;
  this.molotovPendingResolutionContext = null;
  this.pendingSwirlRotationRemaining = 0;
  this.pendingSwirlRotationResolution = null;
  this.pendingWormholeShiftRemaining = 0;
  this.pendingWormholeShiftResolution = null;
  this.pendingVineCastRemaining = 0;
  this.pendingVineCastResolution = null;
  this.pendingBarrierHammer = false;
  this.pendingRainbowColorSelection = null;
  this.ricochetGuideActive = false;
  this.jarScoreBoostActive = false;
  this.jarScoreBoostMultiplier = 1;
  this.jarScoreBoostRemainingMs = 0;
  var scoreProfile = buildScoreRulesForLevel(levelConfig);
  this.scoreRules = scoreProfile.rules;
  this.scoreHeatBand = buildScoreHeatBand(levelConfig, scoreProfile);

  Object.keys(this.systems).forEach(function (key) {
    this.systems[key].configureLevel(levelConfig);
  }, this);
  this.systems.boardOcclusionSystem.startRun(startContext);

  this._rebuildCachedAdRunPowerupAllowed();
  this._aimGuidePathCacheKey = "";
  this._aimGuidePathCache = null;

  this.state = "running";
  Logger.info("Level started", levelConfig.level.code);
  return this.getRuntimeSnapshot();
};

GameManager.prototype._createImpactEventFromCell = function (centerCell) {
  if (!centerCell || !this.systems || !this.systems.bubbleGrid) {
    return null;
  }

  var grid = this.systems.bubbleGrid;
  if (!grid.isValidCell(centerCell.row, centerCell.col)) {
    return null;
  }

  var centerPosition = grid.getCellPosition(centerCell.row, centerCell.col);
  var neighborCoords = grid.getNeighborCoordinates(centerCell.row, centerCell.col);
  var neighbors = [];
  for (var i = 0; i < neighborCoords.length; i += 1) {
    var coord = neighborCoords[i];
    var neighborCell = grid.getCell(coord.row, coord.col);
    if (!neighborCell) {
      continue;
    }

    var neighborPosition = grid.getCellPosition(coord.row, coord.col);
    neighbors.push({
      id: neighborCell.id,
      row: neighborCell.row,
      col: neighborCell.col,
      x: neighborPosition.x,
      y: neighborPosition.y
    });
  }

  if (!neighbors.length) {
    return null;
  }

  this.impactSequence += 1;
  return {
    seq: this.impactSequence,
    center: {
      x: centerPosition.x,
      y: centerPosition.y
    },
    neighbors: neighbors,
    pushDistance: IMPACT_BOUNCE_PUSH_DISTANCE,
    bounceSpeed: IMPACT_BOUNCE_SPEED
  };
};

GameManager.prototype._filterImpactEventSurvivors = function (impact, removedCells) {
  if (!impact) {
    return null;
  }
  if (!Array.isArray(removedCells)) {
    throw new Error("Filter impact survivors requires removedCells array.");
  }
  if (!Array.isArray(impact.neighbors)) {
    throw new Error("Impact event requires neighbors array.");
  }

  var removedIds = {};
  for (var removedIndex = 0; removedIndex < removedCells.length; removedIndex += 1) {
    var removedCell = removedCells[removedIndex];
    if (!removedCell || (typeof removedCell.id !== "string" && typeof removedCell.id !== "number")) {
      throw new Error("Filter impact survivors requires removed cell id.");
    }
    removedIds[removedCell.id] = true;
  }

  var grid = this.systems.bubbleGrid;
  var survivingNeighbors = [];
  for (var neighborIndex = 0; neighborIndex < impact.neighbors.length; neighborIndex += 1) {
    var neighbor = impact.neighbors[neighborIndex];
    if (!neighbor || (typeof neighbor.id !== "string" && typeof neighbor.id !== "number")) {
      throw new Error("Impact neighbor requires id.");
    }
    if (removedIds[neighbor.id]) {
      continue;
    }
    if (!Number.isInteger(neighbor.row) || !Number.isInteger(neighbor.col)) {
      throw new Error("Impact neighbor requires row and col.");
    }
    var liveCell = grid.getCell(neighbor.row, neighbor.col);
    if (!liveCell || liveCell.id !== neighbor.id) {
      continue;
    }
    var neighborPosition = grid.getCellPosition(neighbor.row, neighbor.col);
    survivingNeighbors.push({
      id: liveCell.id,
      row: liveCell.row,
      col: liveCell.col,
      x: neighborPosition.x,
      y: neighborPosition.y
    });
  }

  if (!survivingNeighbors.length) {
    return null;
  }

  return {
    seq: impact.seq,
    center: impact.center,
    neighbors: survivingNeighbors,
    pushDistance: impact.pushDistance,
    bounceSpeed: impact.bounceSpeed
  };
};

GameManager.prototype._applyPostImpactBoardShiftPolicy = function (resolution) {
  if (!resolution || !resolution.impact) {
    this._ensureMinimumVisibleBoardRows(resolution);
    return false;
  }
  if (this._isWaitingBoardAdvance()) {
    throw new Error("Post-impact board shift cannot start while board advance is already pending.");
  }

  this.pendingDeferredEnsureMinimumVisibleBoardRows = true;
  this.pendingDropIntervalBoardAdvance = false;
  this.pendingBoardAdvanceSpecialAnimationDelay = Math.max(
    this._resolveBoardAdvanceSpecialAnimationDelay(resolution),
    BOARD_ADVANCE_AFTER_IMPACT_DELAY
  );
  this.pendingBoardAdvanceDelay = 0;
  this.pendingBoardAdvanceEliminationPresentation = this._requiresBoardAdvanceEliminationPresentationWait(resolution);
  this.pendingBoardAdvanceScheduledUpdateSerial = Math.floor(assertFiniteNumber(
    this.boardAdvanceUpdateSerial,
    "GameManager boardAdvanceUpdateSerial"
  ));
  return true;
};

GameManager.prototype._flushDeferredBoardShiftAfterImpact = function () {
  if (this.pendingDeferredEnsureMinimumVisibleBoardRows) {
    this.pendingDeferredEnsureMinimumVisibleBoardRows = false;
    this._ensureMinimumVisibleBoardRows(this.lastResolution);
  }
  this.pendingDropIntervalBoardAdvance = false;
};

GameManager.prototype._getScoreRule = function (key) {
  if (this.scoreRules && typeof this.scoreRules[key] === "number") {
    return this.scoreRules[key];
  }
  return BASE_SCORE_RULES[key] || 0;
};

GameManager.prototype._isWaitingBoardAdvance = function () {
  return this.pendingBoardAdvanceSpecialAnimationDelay > 0 ||
    this.pendingBoardAdvanceDelay > 0 ||
    this.pendingBoardAdvanceEliminationPresentation === true ||
    this.pendingDeferredEnsureMinimumVisibleBoardRows ||
    this.pendingDropIntervalBoardAdvance;
};

GameManager.prototype._hasBoardAdvancedThisFrame = function () {
  if (typeof this.boardAdvancedThisFrame !== "boolean") {
    throw new Error("GameManager boardAdvancedThisFrame must be boolean.");
  }
  return this.boardAdvancedThisFrame;
};

GameManager.prototype._markBoardAdvancedThisFrame = function () {
  this.boardAdvancedThisFrame = true;
};

GameManager.prototype._isBoardAdvanceBusy = function () {
  var viewport = this.systems.boardViewportSystem;
  if (viewport && typeof viewport.isMoving === "function" && viewport.isMoving()) {
    return true;
  }
  if (viewport && viewport.introActive) {
    return true;
  }
  return this._isWaitingBoardAdvance() || this._hasBoardAdvancedThisFrame();
};

GameManager.prototype._isBoardAdvanceScheduledThisUpdate = function () {
  var updateSerial = Math.floor(assertFiniteNumber(this.boardAdvanceUpdateSerial, "GameManager boardAdvanceUpdateSerial"));
  var scheduledSerial = Math.floor(assertFiniteNumber(this.pendingBoardAdvanceScheduledUpdateSerial, "GameManager pendingBoardAdvanceScheduledUpdateSerial"));
  if (updateSerial < 0) {
    throw new Error("GameManager boardAdvanceUpdateSerial must be non-negative.");
  }
  return updateSerial > 0 && scheduledSerial === updateSerial;
};

GameManager.prototype._resolveBoardAdvanceSpecialAnimationDelay = function (resolution) {
  if (!resolution || typeof resolution !== "object") {
    throw new Error("Board advance special animation delay requires resolution.");
  }
  if (!Array.isArray(resolution.collectedKeys)) {
    throw new Error("Board advance special animation delay requires resolution.collectedKeys array.");
  }
  if (!Array.isArray(resolution.unlockedLockedBalls)) {
    throw new Error("Board advance special animation delay requires resolution.unlockedLockedBalls array.");
  }

  if (resolution.collectedKeys.length > 0 && resolution.unlockedLockedBalls.length > 0) {
    return KEY_UNLOCK_BOARD_ADVANCE_BLOCK_DELAY;
  }
  return 0;
};

GameManager.prototype._requiresBoardAdvanceEliminationPresentationWait = function (resolution) {
  if (!resolution || typeof resolution !== "object") {
    throw new Error("Board advance elimination presentation wait requires resolution.");
  }
  if (!Array.isArray(resolution.matched)) {
    throw new Error("Board advance elimination presentation wait requires resolution.matched array.");
  }
  return resolution.matched.length > 0;
};

GameManager.prototype.notifyBoardAdvanceEliminationPresentationComplete = function () {
  if (typeof this.pendingBoardAdvanceEliminationPresentation !== "boolean") {
    throw new Error("GameManager pendingBoardAdvanceEliminationPresentation must be boolean.");
  }
  this.pendingBoardAdvanceEliminationPresentation = false;
};

GameManager.prototype._hasPendingSplitterSpawns = function () {
  if (!Array.isArray(this.pendingSplitterSpawns)) {
    throw new Error("GameManager pendingSplitterSpawns must be an array.");
  }
  return this.pendingSplitterSpawns.length > 0;
};

GameManager.prototype._hasPendingMolotovBlasts = function () {
  if (!Array.isArray(this.pendingMolotovBlastQueue)) {
    throw new Error("GameManager pendingMolotovBlastQueue must be an array.");
  }
  if (typeof this.molotovResolutionPending !== "boolean") {
    throw new Error("GameManager molotovResolutionPending must be a boolean.");
  }
  return this.molotovResolutionPending || this.activeMolotovBlast !== null || this.pendingMolotovBlastQueue.length > 0;
};

GameManager.prototype._hasPendingSwirlRotation = function () {
  if (typeof this.pendingSwirlRotationRemaining !== "number" || !isFinite(this.pendingSwirlRotationRemaining)) {
    throw new Error("GameManager pendingSwirlRotationRemaining must be finite.");
  }
  if (this.pendingSwirlRotationRemaining < 0) {
    throw new Error("GameManager pendingSwirlRotationRemaining must not be negative.");
  }
  if (this.pendingSwirlRotationRemaining > 0 && !this.pendingSwirlRotationResolution) {
    throw new Error("GameManager pending swirl rotation requires its resolution.");
  }
  return this.pendingSwirlRotationRemaining > 0;
};

GameManager.prototype._hasPendingWormholeShift = function () {
  if (typeof this.pendingWormholeShiftRemaining !== "number" || !isFinite(this.pendingWormholeShiftRemaining)) {
    throw new Error("GameManager pendingWormholeShiftRemaining must be finite.");
  }
  if (this.pendingWormholeShiftRemaining < 0) {
    throw new Error("GameManager pendingWormholeShiftRemaining must not be negative.");
  }
  if (this.pendingWormholeShiftRemaining > 0 && !this.pendingWormholeShiftResolution) {
    throw new Error("GameManager pending wormhole shift requires its resolution.");
  }
  return this.pendingWormholeShiftRemaining > 0;
};

GameManager.prototype._hasPendingVineCast = function () {
  if (typeof this.pendingVineCastRemaining !== "number" || !isFinite(this.pendingVineCastRemaining)) {
    throw new Error("GameManager pendingVineCastRemaining must be finite.");
  }
  if (this.pendingVineCastRemaining < 0) {
    throw new Error("GameManager pendingVineCastRemaining must not be negative.");
  }
  if (this.pendingVineCastRemaining > 0 && !this.pendingVineCastResolution) {
    throw new Error("GameManager pending vine cast requires its resolution.");
  }
  return this.pendingVineCastRemaining > 0;
};

GameManager.prototype._beginVineCastForResolution = function (resolution) {
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Vine cast requires resolution.");
  }
  if (typeof resolution.vineCastEvaluated !== "boolean") {
    throw new Error("Vine cast requires resolution.vineCastEvaluated boolean.");
  }
  if (!Array.isArray(resolution.vineCasts)) {
    throw new Error("Vine cast requires resolution.vineCasts array.");
  }
  if (this._hasPendingVineCast() || this.pendingVineCastResolution !== null) {
    throw new Error("Vine cast cannot start while another cast is pending.");
  }
  if (resolution.vineCastEvaluated) {
    return false;
  }
  resolution.vineCastEvaluated = true;
  if (!Number.isInteger(this.shotsFired) || this.shotsFired <= 0) {
    throw new Error("Vine cast evaluation requires positive shotsFired.");
  }
  if (this.shotsFired % VINE_CAST_SHOT_INTERVAL !== 0) {
    return false;
  }

  var grid = this.systems.bubbleGrid;
  if (!grid || typeof grid.getVineSpirits !== "function") {
    throw new Error("Vine cast requires BubbleGrid.getVineSpirits.");
  }
  if (typeof grid.findNearestNormalCellForVine !== "function" || typeof grid.beginVinePreview !== "function") {
    throw new Error("Vine cast requires BubbleGrid vine target and preview methods.");
  }
  var spirits = grid.getVineSpirits();
  if (!spirits.length) {
    return false;
  }

  var reservedCellKeys = {};
  spirits.forEach(function (spirit) {
    var target = grid.findNearestNormalCellForVine(spirit, reservedCellKeys);
    if (!target) {
      return;
    }
    var targetKey = target.row + ":" + target.col;
    reservedCellKeys[targetKey] = true;
    grid.beginVinePreview(spirit.id, target);
    resolution.vineCasts.push({
      id: "vine_cast_" + this.shotsFired + "_" + spirit.id,
      spiritId: spirit.id,
      spiritRow: spirit.row,
      spiritCol: spirit.col,
      targetId: target.id,
      targetRow: target.row,
      targetCol: target.col,
      duration: VINE_CAST_PREVIEW_DURATION,
      completed: false
    });
  }, this);
  if (!resolution.vineCasts.length) {
    return false;
  }

  this.pendingVineCastRemaining = VINE_CAST_PREVIEW_DURATION;
  this.pendingVineCastResolution = resolution;
  return true;
};

GameManager.prototype._beginSwirlRotationForResolution = function (resolution) {
  if (!resolution) {
    throw new Error("Swirl rotation requires resolution.");
  }
  if (this._hasPendingSwirlRotation() || this.pendingSwirlRotationResolution !== null) {
    throw new Error("Swirl rotation cannot start while another rotation is pending.");
  }
  var grid = this.systems.bubbleGrid;
  if (!grid || typeof grid.getCells !== "function") {
    throw new Error("Swirl rotation requires BubbleGrid.getCells.");
  }
  var centers = grid.getCells().filter(isSwirlBall).sort(function (left, right) {
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    if (left.col !== right.col) {
      return left.col - right.col;
    }
    return String(left.id).localeCompare(String(right.id));
  });
  if (!centers.length) {
    return false;
  }
  if (typeof grid.rotateSwirlNeighborsClockwise !== "function") {
    throw new Error("Swirl rotation requires BubbleGrid.rotateSwirlNeighborsClockwise.");
  }
  if (!Array.isArray(resolution.swirlRotations)) {
    throw new Error("Swirl rotation requires resolution.swirlRotations.");
  }

  centers.forEach(function (center) {
    var moves = grid.rotateSwirlNeighborsClockwise(center);
    if (!moves.length) {
      return;
    }
    resolution.swirlRotations.push({
      id: "swirl_" + this.shotsFired + "_" + center.id,
      centerId: center.id,
      centerRow: center.row,
      centerCol: center.col,
      duration: SWIRL_ROTATION_DURATION,
      angleDegrees: SpecialAnimationTiming.swirlRotation.angleDegrees,
      moves: moves
    });
  }, this);
  if (!resolution.swirlRotations.length) {
    return false;
  }
  this.pendingSwirlRotationRemaining = SWIRL_ROTATION_DURATION;
  this.pendingSwirlRotationResolution = resolution;
  return true;
};

GameManager.prototype._beginWormholeShiftForResolution = function (resolution) {
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Wormhole shift requires resolution.");
  }
  if (this._hasPendingWormholeShift() || this.pendingWormholeShiftResolution !== null) {
    throw new Error("Wormhole shift cannot start while another shift is pending.");
  }
  var grid = this.systems.bubbleGrid;
  if (!grid || typeof grid.getCells !== "function") {
    throw new Error("Wormhole shift requires BubbleGrid.getCells.");
  }
  var wormholes = grid.getCells().filter(isWormholeBall);
  if (!wormholes.length) {
    return false;
  }
  if (wormholes.length !== 2) {
    throw new Error("Wormhole shift requires exactly two live wormholes.");
  }
  if (typeof grid.shiftWormholeInterior !== "function") {
    throw new Error("Wormhole shift requires BubbleGrid.shiftWormholeInterior.");
  }
  if (!Array.isArray(resolution.wormholeShifts)) {
    throw new Error("Wormhole shift requires resolution.wormholeShifts.");
  }
  var shift = grid.shiftWormholeInterior();
  if (!shift) {
    throw new Error("BubbleGrid.shiftWormholeInterior must return a shift for a live wormhole pair.");
  }
  if (!Array.isArray(shift.moves)) {
    throw new Error("Wormhole shift result requires moves array.");
  }
  shift.moves.forEach(function (move) {
    if (!move || move.entityType !== "splitter") {
      return;
    }
    this.pendingSplitterSpawns.forEach(function (pending) {
      if (String(pending.id) === move.cellId) {
        pending.row = move.toRow;
        pending.col = move.toCol;
      }
    });
    resolution.reactiveTriggered.forEach(function (triggered) {
      if (triggered && String(triggered.id) === move.cellId) {
        triggered.row = move.toRow;
        triggered.col = move.toCol;
      }
    });
  }, this);
  resolution.wormholeShifts.push({
    id: "wormhole_" + this.shotsFired,
    row: shift.row,
    leftWormholeId: shift.leftWormholeId,
    leftCol: shift.leftCol,
    rightWormholeId: shift.rightWormholeId,
    rightCol: shift.rightCol,
    moveDirection: shift.moveDirection,
    slotCount: shift.slotCount,
    duration: WORMHOLE_SHIFT_DURATION,
    moves: shift.moves
  });
  this.pendingWormholeShiftRemaining = WORMHOLE_SHIFT_DURATION;
  this.pendingWormholeShiftResolution = resolution;
  return true;
};

GameManager.prototype._scoreSwirlFloatingDrops = function (resolution, cells) {
  if (!resolution || !Array.isArray(cells)) {
    throw new Error("Swirl floating score requires resolution and cells.");
  }
  if (!cells.length) {
    return 0;
  }
  var scorePerBall = this._getScoreRule("floatingDrop");
  if (!Number.isInteger(scorePerBall) || scorePerBall < 0) {
    throw new Error("Swirl floating drop score must be a non-negative integer.");
  }
  var gained = cells.length * scorePerBall;
  this.score += gained;
  resolution.scoreDelta += gained;
  return gained;
};

GameManager.prototype._continueAfterSwirlRotation = function (resolution) {
  if (!resolution) {
    throw new Error("Swirl completion requires resolution.");
  }
  if (this._beginWormholeShiftForResolution(resolution)) {
    return;
  }
  if (this._beginVineCastForResolution(resolution)) {
    return;
  }
  this._continueAfterVineCast(resolution);
};

GameManager.prototype._continueAfterWormholeShift = function (resolution) {
  if (!resolution) {
    throw new Error("Wormhole completion requires resolution.");
  }
  if (this._beginVineCastForResolution(resolution)) {
    return;
  }
  this._continueAfterVineCast(resolution);
};

GameManager.prototype._continueAfterVineCast = function (resolution) {
  if (!resolution) {
    throw new Error("Vine cast completion requires resolution.");
  }
  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
    return;
  }
  if (this._tryTopAnchorCollapse()) {
    return;
  }
  var eliminationPresentationWasComplete = this.pendingBoardAdvanceEliminationPresentation === false;
  if (this._applyPostImpactBoardShiftPolicy(resolution)) {
    if (eliminationPresentationWasComplete) {
      this.notifyBoardAdvanceEliminationPresentationComplete();
    }
    return;
  }
  if (this._scheduleBoardAdvanceAfterImpact()) {
    return;
  }
  if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
    if (
      this.systems.fallingMarbleSystem.hasActiveDrops() ||
      this._isBoardAdvanceBusy() ||
      this._hasPendingSplitterSpawns() ||
      this._hasPendingMolotovBlasts() ||
      this._hasPendingVineCast()
    ) {
      this.state = "out_of_shots_pending";
    } else {
      this._showOutOfShotsAddBallPrompt();
    }
  }
};

GameManager.prototype._updatePendingVineCast = function (dt) {
  if (!this._hasPendingVineCast()) {
    return false;
  }
  var safeDt = assertFiniteNumber(dt, "Pending vine cast dt");
  if (safeDt < 0) {
    throw new Error("Pending vine cast dt must not be negative.");
  }
  this.pendingVineCastRemaining = Math.max(0, this.pendingVineCastRemaining - safeDt);
  if (this.pendingVineCastRemaining > 0) {
    return false;
  }

  var resolution = this.pendingVineCastResolution;
  if (resolution !== this.lastResolution) {
    throw new Error("Pending vine cast resolution must remain lastResolution.");
  }
  if (!Array.isArray(resolution.vineCasts) || !resolution.vineCasts.length) {
    throw new Error("Pending vine cast requires non-empty resolution.vineCasts.");
  }
  var grid = this.systems.bubbleGrid;
  if (!grid || typeof grid.completeVineEntanglement !== "function") {
    throw new Error("Pending vine cast requires BubbleGrid.completeVineEntanglement.");
  }
  resolution.vineCasts.forEach(function (cast) {
    if (!cast || cast.completed !== false) {
      throw new Error("Pending vine cast entry must be incomplete.");
    }
    var entangled = grid.completeVineEntanglement(cast.spiritId, {
      row: cast.targetRow,
      col: cast.targetCol
    });
    if (!entangled || entangled.vineOwnerId !== cast.spiritId) {
      throw new Error("Vine cast completion failed to entangle its target.");
    }
    cast.completed = true;
  });
  this._pushRuntimeEvent("vine_entangled", {
    count: resolution.vineCasts.length
  });
  this.pendingVineCastResolution = null;
  this._continueAfterVineCast(resolution);
  return true;
};

GameManager.prototype._updatePendingSwirlRotation = function (dt) {
  if (!this._hasPendingSwirlRotation()) {
    return false;
  }
  var safeDt = assertFiniteNumber(dt, "Pending swirl rotation dt");
  if (safeDt < 0) {
    throw new Error("Pending swirl rotation dt must not be negative.");
  }
  this.pendingSwirlRotationRemaining = Math.max(0, this.pendingSwirlRotationRemaining - safeDt);
  if (this.pendingSwirlRotationRemaining > 0) {
    return false;
  }

  var resolution = this.pendingSwirlRotationResolution;
  if (resolution !== this.lastResolution) {
    throw new Error("Pending swirl rotation resolution must remain lastResolution.");
  }
  var grid = this.systems.bubbleGrid;
  var newlyFloating = [];
  while (true) {
    var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
    if (!floatingCells.length) {
      break;
    }
    var removedFloating = grid.removeFloatingCells(floatingCells);
    if (!removedFloating.length) {
      throw new Error("Swirl connection scan found cells that could not be removed.");
    }
    this._appendUniqueCells(newlyFloating, removedFloating);
    this._appendUniqueCells(resolution.floating, removedFloating);
    this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
    this._cancelPendingSplitterSpawnsForDroppedCells(removedFloating);
    this._registerResolutionDrops(removedFloating, grid, resolution, undefined, {
      skipEliminationPresentationHold: true
    });
    this.systems.jarCollectorSystem.collect([]);
  }
  this._appendUniqueCells(resolution.collected, newlyFloating);
  this._scoreSwirlFloatingDrops(resolution, newlyFloating);
  resolution.boardCleared = this._isBoardCleared(grid);
  this.pendingSwirlRotationResolution = null;
  this._continueAfterSwirlRotation(resolution);
  return true;
};

GameManager.prototype._updatePendingWormholeShift = function (dt) {
  if (!this._hasPendingWormholeShift()) {
    return false;
  }
  var safeDt = assertFiniteNumber(dt, "Pending wormhole shift dt");
  if (safeDt < 0) {
    throw new Error("Pending wormhole shift dt must not be negative.");
  }
  this.pendingWormholeShiftRemaining = Math.max(0, this.pendingWormholeShiftRemaining - safeDt);
  if (this.pendingWormholeShiftRemaining > 0) {
    return false;
  }
  var resolution = this.pendingWormholeShiftResolution;
  if (resolution !== this.lastResolution) {
    throw new Error("Pending wormhole shift resolution must remain lastResolution.");
  }
  var grid = this.systems.bubbleGrid;
  var newlyFloating = [];
  while (true) {
    var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
    if (!floatingCells.length) {
      break;
    }
    var removedFloating = grid.removeFloatingCells(floatingCells);
    if (!removedFloating.length) {
      throw new Error("Wormhole support scan found cells that could not be removed.");
    }
    this._appendUniqueCells(newlyFloating, removedFloating);
    this._appendUniqueCells(resolution.floating, removedFloating);
    this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
    this._cancelPendingSplitterSpawnsForDroppedCells(removedFloating);
    this._registerResolutionDrops(removedFloating, grid, resolution, undefined, {
      skipEliminationPresentationHold: true
    });
    this.systems.jarCollectorSystem.collect([]);
  }
  this._appendUniqueCells(resolution.collected, newlyFloating);
  this._scoreSwirlFloatingDrops(resolution, newlyFloating);
  resolution.boardCleared = this._isBoardCleared(grid);
  this.pendingWormholeShiftResolution = null;
  this._continueAfterWormholeShift(resolution);
  return true;
};

GameManager.prototype._queuePendingSplitterSpawn = function (splitterCell, resolution) {
  if (!splitterCell || !Number.isInteger(splitterCell.row) || !Number.isInteger(splitterCell.col)) {
    throw new Error("Pending splitter spawn requires splitter cell coordinates.");
  }
  if (typeof splitterCell.splitColor !== "string" || !splitterCell.splitColor) {
    throw new Error("Pending splitter spawn requires splitColor.");
  }
  if (!resolution || !Array.isArray(resolution.spawnedBySplitters)) {
    throw new Error("Pending splitter spawn requires resolution.spawnedBySplitters.");
  }
  if (!Array.isArray(resolution.reactiveTriggered)) {
    throw new Error("Pending splitter spawn requires resolution.reactiveTriggered.");
  }

  var pendingId = splitterCell.id;
  if (typeof pendingId !== "string" && typeof pendingId !== "number") {
    throw new Error("Pending splitter spawn requires splitter id.");
  }
  for (var index = 0; index < this.pendingSplitterSpawns.length; index += 1) {
    if (this.pendingSplitterSpawns[index].id === pendingId) {
      throw new Error("Duplicate pending splitter spawn: " + pendingId);
    }
  }

  this.pendingSplitterSpawns.push({
    id: pendingId,
    row: splitterCell.row,
    col: splitterCell.col,
    splitColor: splitterCell.splitColor,
    remainingDelay: SPLITTER_SPAWN_DELAY_SEC
  });
  resolution.reactiveTriggered.push({
    id: pendingId,
    entityType: "splitter",
    row: splitterCell.row,
    col: splitterCell.col
  });
};

GameManager.prototype._cancelPendingSplitterSpawn = function (splitterCell) {
  if (!splitterCell || (typeof splitterCell.id !== "string" && typeof splitterCell.id !== "number")) {
    throw new Error("Cancel pending splitter spawn requires splitter id.");
  }
  if (!Array.isArray(this.pendingSplitterSpawns)) {
    throw new Error("GameManager pendingSplitterSpawns must be an array.");
  }

  var pendingId = splitterCell.id;
  var nextPending = [];
  var canceled = false;
  for (var index = 0; index < this.pendingSplitterSpawns.length; index += 1) {
    var pending = this.pendingSplitterSpawns[index];
    if (!pending || typeof pending !== "object") {
      throw new Error("Pending splitter spawn entry must be object.");
    }
    if (pending.id === pendingId) {
      canceled = true;
      continue;
    }
    nextPending.push(pending);
  }
  this.pendingSplitterSpawns = nextPending;
  return canceled;
};

GameManager.prototype._updatePendingSplitterSpawns = function (dt) {
  if (!this._hasPendingSplitterSpawns()) {
    return false;
  }
  if (this._isBoardAdvanceBusy()) {
    return false;
  }

  var safeDt = Number(dt);
  if (!Number.isFinite(safeDt) || safeDt < 0) {
    throw new Error("Pending splitter spawn update requires non-negative finite dt.");
  }

  var grid = this.systems.bubbleGrid;
  var nextPending = [];
  var spawnedCells = [];
  for (var index = 0; index < this.pendingSplitterSpawns.length; index += 1) {
    var pending = this.pendingSplitterSpawns[index];
    if (!pending || typeof pending !== "object") {
      throw new Error("Pending splitter spawn entry must be object.");
    }

    pending.remainingDelay -= safeDt;
    if (pending.remainingDelay > 0) {
      nextPending.push(pending);
      continue;
    }

    var spawnCell = grid.findSplitterSpawnCell(pending);
    if (!spawnCell) {
      throw new Error("Pending splitter spawn requires an available spawn cell.");
    }
    var spawnedCell = grid.addBubble(spawnCell, pending.splitColor);
    if (!spawnedCell) {
      throw new Error("Pending splitter spawn failed to add bubble.");
    }
    spawnedCell.sourceSplitterId = pending.id;
    spawnedCell.sourceSplitterRow = pending.row;
    spawnedCell.sourceSplitterCol = pending.col;
    spawnedCells.push(spawnedCell);
  }

  this.pendingSplitterSpawns = nextPending;
  if (!spawnedCells.length) {
    return false;
  }

  if (!this.lastResolution || !Array.isArray(this.lastResolution.spawnedBySplitters)) {
    throw new Error("Pending splitter spawn requires lastResolution.spawnedBySplitters.");
  }
  Array.prototype.push.apply(this.lastResolution.spawnedBySplitters, spawnedCells);
  if (this.state === "won_pending" && !this._isBoardCleared(grid)) {
    this.state = "running";
  }
  this._ensureMinimumVisibleBoardRows(this.lastResolution);
  if (this.state === "out_of_shots_pending" && !this.systems.fallingMarbleSystem.hasActiveDrops() && !this._hasPendingSplitterSpawns() && !this._hasPendingMolotovBlasts() && !this._hasPendingSwirlRotation() && !this._hasPendingWormholeShift() && !this._hasPendingVineCast() && !this._isBoardAdvanceBusy()) {
    this._showOutOfShotsAddBallPrompt();
  }
  if (grid && typeof grid.assertNoVisualOverlap === "function") {
    grid.assertNoVisualOverlap("pending splitter spawn");
  }
  return true;
};

GameManager.prototype._scheduleBoardAdvanceAfterImpact = function () {
  return false;
};

GameManager.prototype._updatePendingBoardAdvance = function (dt) {
  if (!this._isWaitingBoardAdvance()) {
    return false;
  }
  if (this._isBoardAdvanceScheduledThisUpdate()) {
    return false;
  }

  var safeDt = assertFiniteNumber(dt, "Pending board advance dt");
  if (safeDt < 0) {
    throw new Error("Pending board advance dt must be non-negative.");
  }
  var remainingDt = safeDt;
  if (this.pendingBoardAdvanceSpecialAnimationDelay > 0) {
    var previousAnimationDelay = this.pendingBoardAdvanceSpecialAnimationDelay;
    this.pendingBoardAdvanceSpecialAnimationDelay = Math.max(0, previousAnimationDelay - remainingDt);
    if (this.pendingBoardAdvanceSpecialAnimationDelay <= BOARD_ADVANCE_DELAY_EPSILON) {
      this.pendingBoardAdvanceSpecialAnimationDelay = 0;
    }
    if (this.pendingBoardAdvanceSpecialAnimationDelay > 0) {
      return false;
    }
    remainingDt = Math.max(0, remainingDt - previousAnimationDelay);
  }

  this.pendingBoardAdvanceDelay = Math.max(0, this.pendingBoardAdvanceDelay - remainingDt);
  if (this.pendingBoardAdvanceDelay <= BOARD_ADVANCE_DELAY_EPSILON) {
    this.pendingBoardAdvanceDelay = 0;
  }
  if (this.pendingBoardAdvanceDelay > 0) {
    return false;
  }
  if (this.pendingBoardAdvanceEliminationPresentation === true) {
    return false;
  }

  this._flushDeferredBoardShiftAfterImpact();
  this.pendingBoardAdvanceScheduledUpdateSerial = -1;
  return true;
};

GameManager.prototype._scheduleWinSettlement = function () {
  if (this.state === "won") {
    throw new Error("Cannot schedule win settlement from won state.");
  }
  if (this.pendingWinSettlementDelay > 0) {
    throw new Error("Win settlement delay is already scheduled.");
  }

  this.pendingWinSettlementDelay = WIN_SETTLEMENT_DELAY_SEC;
  this.state = "won_settlement_pending";
  Logger.info("Win settlement scheduled", {
    delaySec: WIN_SETTLEMENT_DELAY_SEC
  });
};

GameManager.prototype._updatePendingWinSettlement = function (dt) {
  if (this.state !== "won_settlement_pending") {
    return false;
  }
  if (this.pendingWinSettlementDelay <= 0) {
    throw new Error("won_settlement_pending requires positive pendingWinSettlementDelay.");
  }

  var safeDt = Math.max(0, Number(dt) || 0);
  this.pendingWinSettlementDelay = Math.max(0, this.pendingWinSettlementDelay - safeDt);
  if (this.pendingWinSettlementDelay > 0) {
    return false;
  }

  this.state = "won";
  if (typeof this._pushRuntimeEvent === "function") {
    this._pushRuntimeEvent("win_settlement_ready", {});
  }
  Logger.info("Win settlement delay finished");
  return true;
};

GameManager.prototype._clearJarScoreBoost = function () {
  this.jarScoreBoostActive = false;
  this.jarScoreBoostMultiplier = 1;
  this.jarScoreBoostRemainingMs = 0;
};

GameManager.prototype.activateJarScoreBoost = function (options) {
  options = options || {};
  var multiplier = Math.max(
    1,
    Number(options.multiplier || options.jarScoreBoostMultiplier) || DEFAULT_JAR_SCORE_BOOST_MULTIPLIER
  );
  var durationMs = Math.max(
    0,
    Math.floor(Number(options.durationMs || options.jarScoreBoostRemainingMs) || DEFAULT_JAR_SCORE_BOOST_DURATION_MS)
  );

  if (multiplier <= 1 || durationMs <= 0) {
    this._clearJarScoreBoost();
    return this.getRuntimeSnapshot();
  }

  this.jarScoreBoostActive = true;
  this.jarScoreBoostMultiplier = multiplier;
  this.jarScoreBoostRemainingMs = durationMs;
  this._pushRuntimeEvent("jar_score_boost_activated", {
    boost_multiplier: multiplier,
    remaining_ms: durationMs
  });
  return this.getRuntimeSnapshot(this._drainRuntimeEvents());
};

GameManager.prototype._updateJarScoreBoost = function (dt) {
  if (!this.jarScoreBoostActive) {
    return false;
  }

  var safeDtMs = Math.max(0, Number(dt) || 0) * 1000;
  if (safeDtMs <= 0) {
    return false;
  }

  var previousRemainingMs = this.jarScoreBoostRemainingMs;
  this.jarScoreBoostRemainingMs = Math.max(0, previousRemainingMs - safeDtMs);
  if (this.jarScoreBoostRemainingMs > 0) {
    return this.jarScoreBoostRemainingMs !== previousRemainingMs;
  }

  this._clearJarScoreBoost();
  this._pushRuntimeEvent("jar_score_boost_expired");
  return true;
};

GameManager.prototype._isBoardCleared = function (grid) {
  if (!grid || typeof grid.getCells !== "function") {
    throw new Error("Board cleared check requires BubbleGrid.getCells.");
  }
  var cells = grid.getCells();
  if (!Array.isArray(cells)) {
    throw new Error("Board cleared check requires BubbleGrid.getCells array.");
  }
  return cells.every(isWormholeBall);
};

GameManager.prototype._resolveOutOfShotsOutcome = function () {
  if (this._isBoardCleared(this.systems.bubbleGrid)) {
    this._resolveBoardClearedOutcome();
    return;
  }

  this.state = "out_of_shots";
};

GameManager.prototype._showOutOfShotsAddBallPrompt = function () {
  if (this._isBoardCleared(this.systems.bubbleGrid)) {
    this._resolveBoardClearedOutcome();
    return;
  }

  this.state = ADD_BALL_PROMPT_STATE;
};

GameManager.prototype.confirmOutOfShotsAddBallPromptClosed = function () {
  if (this.state !== ADD_BALL_PROMPT_STATE) {
    throw new Error("Add ball prompt can only be closed from state: " + ADD_BALL_PROMPT_STATE);
  }

  this._resolveOutOfShotsOutcome();
  return this.getRuntimeSnapshot();
};

GameManager.prototype._pushBubbleBreakEvent = function (removedCells, eliminationSequence) {
  if (!Array.isArray(removedCells) || !removedCells.length) {
    return;
  }

  var shatterDelaysMs = buildBubbleBreakShatterDelaysMs(removedCells, eliminationSequence);
  if (!shatterDelaysMs.length) {
    return;
  }

  this._pushRuntimeEvent("bubble_break", {
    count: shatterDelaysMs.length,
    shatterDelaysMs: shatterDelaysMs
  });
};

GameManager.prototype._pushBombExplosionEvent = function () {
  this._pushRuntimeEvent("bomb_explosion", {});
};

GameManager.prototype._pushLockOpenEvent = function (unlockedCell) {
  if (!unlockedCell || (typeof unlockedCell.id !== "string" && typeof unlockedCell.id !== "number")) {
    throw new Error("Lock open sfx requires unlocked cell id.");
  }
  if (!Number.isInteger(unlockedCell.row) || !Number.isInteger(unlockedCell.col)) {
    throw new Error("Lock open sfx requires unlocked cell coordinates.");
  }

  this._pushRuntimeEvent("lock_open", {
    id: unlockedCell.id,
    row: unlockedCell.row,
    col: unlockedCell.col
  });
};

GameManager.prototype._pushRuntimeEvent = function (type, payload) {
  if (typeof type !== "string" || !type) {
    return;
  }

  this.runtimeEventSequence += 1;
  var eventData = {
    id: this.runtimeEventSequence,
    type: type
  };

  if (payload && typeof payload === "object") {
    Object.keys(payload).forEach(function (key) {
      eventData[key] = payload[key];
    });
  }

  this.pendingRuntimeEvents.push(eventData);
};

GameManager.prototype._pushFairyAssistDepartEvents = function (events) {
  if (!Array.isArray(events)) {
    throw new Error("Fairy assist depart events requires array.");
  }

  events.forEach(function (event) {
    if (!event || typeof event.type !== "string") {
      throw new Error("Fairy assist event requires type.");
    }
    if (event.type === "remove") {
      if (typeof event.fairyId !== "string" || !event.fairyId) {
        throw new Error("Fairy assist remove event requires fairyId.");
      }
      this._pushRuntimeEvent("fairy_assist_depart", {
        fairyId: event.fairyId,
        reason: "remove"
      });
      return;
    }
    if (event.type === "spawn") {
      if (typeof event.replacedFairyId === "string" && event.replacedFairyId) {
        this._pushRuntimeEvent("fairy_assist_depart", {
          fairyId: event.replacedFairyId,
          reason: "replace"
        });
      }
    }
  }, this);
};

GameManager.prototype._drainRuntimeEvents = function () {
  if (!Array.isArray(this.pendingRuntimeEvents) || !this.pendingRuntimeEvents.length) {
    return [];
  }

  var drained = this.pendingRuntimeEvents.slice();
  this.pendingRuntimeEvents.length = 0;
  return drained;
};

GameManager.prototype._getCachedBoardSnapshot = function () {
  var grid = this.systems.bubbleGrid;
  var viewportOffsetY = grid.getViewportOffsetY();
  if (
    !this.cachedBoardSnapshot ||
    this.cachedBoardVersion !== grid.version ||
    this.cachedBoardViewportOffsetY !== viewportOffsetY
  ) {
    this.cachedBoardSnapshot = grid.snapshot();
    this.cachedBoardVersion = grid.version;
    this.cachedBoardViewportOffsetY = viewportOffsetY;
  }
  return this.cachedBoardSnapshot;
};

GameManager.prototype.updateBoardViewportIntro = function (dt) {
  var safeDt = assertFiniteNumber(dt, "GameManager.updateBoardViewportIntro dt");
  if (safeDt < 0) {
    throw new Error("GameManager.updateBoardViewportIntro dt must be non-negative.");
  }
  var viewport = this.systems.boardViewportSystem;
  if (!viewport || typeof viewport.update !== "function") {
    throw new Error("GameManager.updateBoardViewportIntro requires BoardViewportSystem.");
  }
  if (!viewport.introActive && !viewport.isMoving()) {
    return null;
  }
  var viewportFinished = viewport.update(safeDt);
  if (viewportFinished && typeof this._onBoardViewportMoveFinished === "function") {
    this._onBoardViewportMoveFinished();
  }
  return this.getRuntimeSnapshot(this._drainRuntimeEvents(), { refreshScope: "full" });
};

GameManager.prototype._buildJarSnapshotKey = function () {
  var jars = this.systems.jarCollectorSystem;
  var colorKey = jars.jarColors.map(function (colorCode) {
    return colorCode + ":" + (jars.collectedByColor[colorCode] || 0);
  }).join(",");
  return [
    jars.collectedTotal,
    jars.objectiveTarget,
    colorKey,
    jars.lastCollected.length
  ].join("|");
};

GameManager.prototype._getCachedJarSnapshot = function () {
  var key = this._buildJarSnapshotKey();
  if (!this.cachedJarSnapshot || this.cachedJarSnapshotKey !== key) {
    this.cachedJarSnapshot = this.systems.jarCollectorSystem.snapshot();
    this.cachedJarSnapshotKey = key;
  }
  return this.cachedJarSnapshot;
};

GameManager.prototype._registerIceCollection = function (cells) {
  if (!Array.isArray(cells) || !cells.length) {
    return 0;
  }

  var iceObstacleCells = [];
  var thawEntries = [];

  cells.forEach(function (cell) {
    if (!cell) {
      return;
    }
    if (cell.entityCategory === "obstacle_ball" && cell.entityType === "ice") {
      iceObstacleCells.push(cell);
      return;
    }
    if (cell.entityCategory === "normal_ball") {
      if (typeof cell.color !== "string" || !cell.color) {
        throw new Error("Thawed ice snowball collection requires color.");
      }
      thawEntries.push(buildIceSnowballCollectEntry(cell, cell.color));
    }
  });

  var gained = this._registerIceSnowballCollection(iceObstacleCells);
  if (thawEntries.length) {
    this.iceCollectedTotal += thawEntries.length;
    if (this.lastResolution) {
      this.lastResolution.iceCollected += thawEntries.length;
    }
    gained += thawEntries.length;
    this._pushRuntimeEvent("ice_snowball_collect", {
      count: thawEntries.length,
      entries: thawEntries
    });
  }
  return gained;
};

GameManager.prototype._registerIceSnowballCollection = function (cells) {
  if (!Array.isArray(cells) || !cells.length) {
    return 0;
  }

  var gained = 0;
  var entries = [];
  cells.forEach(function (cell) {
    if (!(
      cell &&
      cell.entityCategory === "obstacle_ball" &&
      cell.entityType === "ice" &&
      cell.iceSnowballAlreadyCollected !== true
    )) {
      return;
    }

    var innerColor = cell.innerColor || resolveIceInnerColor(cell);
    entries.push(buildIceSnowballCollectEntry(cell, innerColor));
    cell.iceSnowballAlreadyCollected = true;
    gained += 1;
  });
  if (gained <= 0) {
    return 0;
  }

  this.iceCollectedTotal += gained;
  if (this.lastResolution) {
    this.lastResolution.iceCollected += gained;
  }
  this._pushRuntimeEvent("ice_snowball_collect", {
    count: gained,
    entries: entries
  });
  return gained;
};

GameManager.prototype._thawIceCellAtCurrentPosition = function (grid, targetCell) {
  if (!grid || typeof grid.addBubble !== "function") {
    throw new Error("Ice thaw requires BubbleGrid.addBubble.");
  }
  if (!isIceBall(targetCell)) {
    throw new Error("Ice thaw target must be an ice obstacle.");
  }
  var innerColor = resolveIceInnerColor(targetCell);
  if (!innerColor) {
    throw new Error("Ice thaw target requires innerColor.");
  }
  var thawedCell = grid.addBubble({
    row: targetCell.row,
    col: targetCell.col
  }, innerColor);
  if (!thawedCell || thawedCell.entityCategory !== "normal_ball" || thawedCell.color !== innerColor) {
    throw new Error("Ice thaw must replace obstacle with inner normal ball.");
  }
  return thawedCell;
};

GameManager.prototype._getPrimaryObjectiveProgressValue = function (objective, jarsSnapshot) {
  if (!objective || typeof objective.type !== "string") {
    return 0;
  }

  var jars = jarsSnapshot || this._getCachedJarSnapshot();
  if (objective.type === "collect_any") {
    return Math.max(0, Number(jars && jars.collectedTotal) || 0);
  }

  if (objective.type === "collect_color") {
    var colorCode = typeof objective.color === "string" ? objective.color : "";
    if (!colorCode) {
      return 0;
    }
    var byColor = jars && jars.collectedByColor ? jars.collectedByColor : {};
    return Math.max(0, Number(byColor[colorCode]) || 0);
  }

  if (objective.type === "collect_ice_snowball") {
    return Math.max(0, Number(this.iceCollectedTotal) || 0);
  }

  return 0;
};

GameManager.prototype._areCollectionRewardObjectivesCompleted = function () {
  var objectives = listCollectionRewardObjectives(this.currentLevel);
  if (!objectives.length) {
    return false;
  }

  var jarsSnapshot = this._getCachedJarSnapshot();
  if (!jarsSnapshot) {
    return false;
  }

  for (var index = 0; index < objectives.length; index += 1) {
    var objective = objectives[index];
    var target = assertPositiveInteger(objective.value, "Collection reward objective value");
    if (this._getPrimaryObjectiveProgressValue(objective, jarsSnapshot) < target) {
      return false;
    }
  }

  return true;
};

GameManager.prototype._hasRequiredStarRating = function () {
  var requiredStarCount = assertPositiveInteger(this.requiredStarCount, "GameManager.requiredStarCount");
  if (requiredStarCount !== 1) {
    throw new Error("Clear win requires requiredStarCount to be 1.");
  }
  return calculateStarRating(this.score, this.scoreHeatBand) >= requiredStarCount;
};

GameManager.prototype._isClearWinCompleted = function () {
  return this._hasRequiredStarRating() && this._isBoardCleared(this.systems.bubbleGrid);
};

GameManager.prototype._resolveClearWinOutcome = function () {
  if (this.isTimedInfiniteShots) {
    this.state = "won";
    return;
  }

  if (this.remainingShots > 0) {
    this._beginSurplusShotBonus();
    return;
  }

  this._scheduleWinSettlement();
};

GameManager.prototype._buildPrimaryObjectiveSnapshot = function (jarsSnapshot) {
  var objective = findPrimaryCollectionObjective(this.currentLevel);
  if (!objective) {
    return {
      type: null,
      color: null,
      iconCode: null,
      target: 0,
      progress: 0,
      rawProgress: 0,
      progressText: "-",
      iceCollectedTotal: Math.max(0, Number(this.iceCollectedTotal) || 0)
    };
  }

  var target = Math.max(0, Math.floor(Number(objective.value) || 0));
  var rawProgress = this._getPrimaryObjectiveProgressValue(objective, jarsSnapshot);
  var progress = target > 0 ? Math.min(rawProgress, target) : rawProgress;
  var iconCode = null;
  if (objective.type === "collect_any") {
    iconCode = "RAINBOW";
  } else if (objective.type === "collect_color") {
    iconCode = typeof objective.color === "string" ? objective.color : null;
  } else if (objective.type === "collect_ice_snowball") {
    iconCode = "ICE_SNOWBALL";
  }

  return {
    type: objective.type,
    color: typeof objective.color === "string" ? objective.color : null,
    iconCode: iconCode,
    target: target,
    progress: progress,
    rawProgress: rawProgress,
    progressText: target > 0 ? (progress + "/" + target) : String(progress),
    iceCollectedTotal: Math.max(0, Number(this.iceCollectedTotal) || 0)
  };
};

GameManager.prototype.setAim = function (point) {
  if (
    this.state !== "running" ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this._hasPendingSwirlRotation() ||
    this._hasPendingWormholeShift() ||
    this._hasPendingVineCast() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection
  ) {
    return this.getRuntimeSnapshot();
  }

  this.systems.shooterController.setAimFromPoint(point);
  this._refreshShotPlan(false);
  return this.getRuntimeSnapshot();
};

GameManager.prototype.beginAim = function (point) {
  if (
    this.state !== "running" ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this._hasPendingSwirlRotation() ||
    this._hasPendingWormholeShift() ||
    this._hasPendingVineCast() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection
  ) {
    return this.getRuntimeSnapshot();
  }

  this.isAiming = true;
  if (point) {
    this.systems.shooterController.setAimFromPoint(point);
  }

  this._refreshShotPlan(true);
  return this.getRuntimeSnapshot();
};

GameManager.prototype.endAim = function () {
  this.isAiming = false;
  this.pendingShotPlan = null;
  return this.getRuntimeSnapshot();
};

GameManager.prototype.fireShot = function () {
  if (
    this.state !== "running" ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this._hasPendingSwirlRotation() ||
    this._hasPendingWormholeShift() ||
    this._hasPendingVineCast() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection
  ) {
    return this.getRuntimeSnapshot();
  }

  if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
    this._showOutOfShotsAddBallPrompt();
    return this.getRuntimeSnapshot();
  }

  var shotPlan = this.pendingShotPlan;
  if (!shotPlan || !shotPlan.valid || !shotPlan.targetCell) {
    // 发射优先沿用当前幽灵球路线；仅在缺失时才临时重算。
    this._refreshShotPlan(true);
    shotPlan = this.pendingShotPlan;
  }
  if (!shotPlan || !shotPlan.valid || !shotPlan.targetCell) {
    Logger.warn("Missing valid shot plan, fire aborted");
    return this.getRuntimeSnapshot();
  }

  var remainingShotsAfterFire = this.isTimedInfiniteShots ? 0 : this.remainingShots - 1;
  var queueResult = this.systems.shooterController.advanceQueue(
    remainingShotsAfterFire,
    this.isTimedInfiniteShots
  );
  this.systems.shooterController.resetAimDirection();

  if (!this.isTimedInfiniteShots) {
    this.remainingShots = remainingShotsAfterFire;
  }
  this.shotsFired += 1;
  this.lastFiredColor = queueResult.firedColor;
  this.lastResolution = createEmptyResolution();
  this.activeProjectile = buildActiveProjectile(queueResult.firedBall, shotPlan);
  this.pendingProjectileFinalize = false;
  this.pendingShotPlan = null;
  this.isAiming = false;

  Logger.info("Shot fired", queueResult.firedColor, "remaining", this.remainingShots, "bounce", shotPlan.wallBounceCount);
  return this.getRuntimeSnapshot();
};

GameManager.prototype.grantPowerupInventory = function (powerupType, count) {
  var shooterController = this.systems && this.systems.shooterController
    ? this.systems.shooterController
    : null;
  if (!shooterController || typeof shooterController.addInventory !== "function") {
    return {
      accepted: false,
      reason: "inventory_system_unavailable",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grantResult = shooterController.addInventory(powerupType, count);
  if (!grantResult || !grantResult.accepted) {
    return {
      accepted: false,
      reason: grantResult && grantResult.reason ? grantResult.reason : "inventory_grant_failed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  return {
    accepted: true,
    powerupType: grantResult.entityType,
    gained: grantResult.gained,
    total: grantResult.total,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype._isInstantAdPowerupBusy = function () {
  var canUseInstantPowerup = this.state === "running" || this.state === ADD_BALL_PROMPT_STATE;
  return !!(
    !canUseInstantPowerup ||
    this.activeProjectile ||
    this._isBoardAdvanceBusy() ||
    this._hasPendingSplitterSpawns() ||
    this._hasPendingMolotovBlasts() ||
    this._hasPendingSwirlRotation() ||
    this._hasPendingWormholeShift() ||
    this._hasPendingVineCast() ||
    this.pendingBarrierHammer ||
    this.pendingRainbowColorSelection ||
    this.systems.fallingMarbleSystem.hasActiveDrops()
  );
};

GameManager.prototype._getAdPowerupRules = function () {
  var level = this.currentLevel && this.currentLevel.level ? this.currentLevel.level : null;
  return level && level.adPowerupRules ? level.adPowerupRules : null;
};

GameManager.prototype._isAdRunPowerupAllowed = function (powerupType) {
  if (AD_RUN_POWERUP_TYPES[powerupType] !== true) {
    throw new Error("Unsupported ad run powerup type: " + powerupType);
  }

  var rules = this._getAdPowerupRules();
  if (!rules || !Array.isArray(rules.allowed)) {
    return false;
  }
  return rules.allowed.indexOf(powerupType) >= 0;
};

GameManager.prototype.grantAdRunPowerup = function (powerupType, count) {
  if (!this._isAdRunPowerupAllowed(powerupType)) {
    return {
      accepted: false,
      reason: "not_allowed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var safeCount = assertPositiveInteger(count, "Ad run powerup grant count");
  var granted = readRunPowerupCount(this.adRunPowerupGrantCounts, powerupType);
  this.adRunPowerupGrantCounts[powerupType] = granted + safeCount;
  this.adRunPowerupInventory[powerupType] = readRunPowerupCount(this.adRunPowerupInventory, powerupType) + safeCount;
  return {
    accepted: true,
    powerupType: powerupType,
    gained: safeCount,
    total: this.adRunPowerupInventory[powerupType],
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.grantPreparedAdRunPowerup = function (powerupType, count) {
  if (!this._isAdRunPowerupAllowed(powerupType)) {
    return {
      accepted: false,
      reason: "not_allowed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var safeCount = assertPositiveInteger(count, "Prepared ad run powerup grant count");
  this.adRunPowerupInventory[powerupType] = readRunPowerupCount(this.adRunPowerupInventory, powerupType) + safeCount;
  return {
    accepted: true,
    powerupType: powerupType,
    gained: safeCount,
    total: this.adRunPowerupInventory[powerupType],
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.activateRicochetGuide = function () {
  if (this.ricochetGuideActive === true) {
    throw new Error("Ricochet guide is already active for this attempt.");
  }
  this.ricochetGuideActive = true;
  this._aimGuidePathCacheKey = "";
  this._aimGuidePathCache = null;
  return {
    accepted: true,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.usePreciseAim = function () {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (this.ricochetGuideActive === true) {
    return {
      accepted: false,
      reason: "already_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var shooterController = this.systems && this.systems.shooterController
    ? this.systems.shooterController
    : null;
  if (!shooterController || typeof shooterController.consumePreciseAim !== "function") {
    throw new Error("Precise aim requires ShooterController.consumePreciseAim.");
  }

  var consumeResult = shooterController.consumePreciseAim();
  if (!consumeResult || typeof consumeResult !== "object") {
    throw new Error("Precise aim consume result must be an object.");
  }
  if (consumeResult.accepted !== true) {
    if (typeof consumeResult.reason !== "string" || !consumeResult.reason) {
      throw new Error("Precise aim consume failure requires reason.");
    }
    return {
      accepted: false,
      reason: consumeResult.reason,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.activateRicochetGuide();
  this._pushRuntimeEvent("powerup_precise_aim", {
    remaining: consumeResult.remaining
  });
  return {
    accepted: true,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype._consumeAdRunPowerup = function (powerupType) {
  if (!this._isAdRunPowerupAllowed(powerupType)) {
    return {
      accepted: false,
      reason: "not_allowed"
    };
  }

  var current = readRunPowerupCount(this.adRunPowerupInventory, powerupType);
  if (current <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  this.adRunPowerupInventory[powerupType] = current - 1;
  return {
    accepted: true,
    remaining: this.adRunPowerupInventory[powerupType]
  };
};

GameManager.prototype.usePlusThreeBalls = function () {
  if (this.isTimedInfiniteShots) {
    return {
      accepted: false,
      reason: "timed_infinite_shots",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var consumeResult = this._consumeAdRunPowerup("plus_three_balls");
  if (!consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult.reason,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.remainingShots += PLUS_THREE_BALLS_AMOUNT;
  var queueResult = this.systems.shooterController.syncFiniteShotQueue(this.remainingShots);
  if (!queueResult || queueResult.accepted !== true) {
    throw new Error("Plus three balls failed to sync shooter queue.");
  }
  this.state = "running";
  this._pushRuntimeEvent("ad_powerup_plus_three_balls", {
    amount: PLUS_THREE_BALLS_AMOUNT,
    remaining_shots: this.remainingShots
  });
  return {
    accepted: true,
    added: PLUS_THREE_BALLS_AMOUNT,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};

GameManager.prototype.previewThreeLineElimination = function () {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (!this._isAdRunPowerupAllowed("three_line_elimination")) {
    return {
      accepted: false,
      reason: "not_allowed",
      snapshot: this.getRuntimeSnapshot()
    };
  }
  if (readRunPowerupCount(this.adRunPowerupInventory, "three_line_elimination") <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var cells = grid.getCells();
  if (!cells.length) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var rowsByIndex = {};
  cells.forEach(function (cell) {
    rowsByIndex[cell.row] = true;
  });
  var rows = Object.keys(rowsByIndex).map(function (row) {
    return Number(row);
  }).sort(function (a, b) {
    return b - a;
  }).slice(0, 3);
  if (!rows.length) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  return {
    accepted: true,
    rows: rows.map(function (row) {
      return {
        row: row,
        y: grid.getCellPosition(row, 0).y
      };
    }),
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.useThreeLineElimination = function (expectedRows) {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var preview = this.previewThreeLineElimination();
  if (!preview.accepted) {
    return preview;
  }

  if (Array.isArray(expectedRows)) {
    var expectedKey = expectedRows.map(function (entry) {
      return typeof entry === "number" ? entry : entry.row;
    }).sort().join(",");
    var actualKey = preview.rows.map(function (entry) {
      return entry.row;
    }).sort().join(",");
    if (expectedKey !== actualKey) {
      throw new Error("Three-line elimination rows changed before resolution.");
    }
  }

  var consumeResult = this._consumeAdRunPowerup("three_line_elimination");
  if (!consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult.reason,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var targetRows = preview.rows.map(function (entry) {
    return entry.row;
  });
  var targetRowMap = {};
  targetRows.forEach(function (row) {
    targetRowMap[row] = true;
  });

  var lineCells = grid.getCells().filter(function (cell) {
    return targetRowMap[cell.row] === true;
  });
  var removedLineCells = grid.removeCells(lineCells);
  this._pushBubbleBreakEvent(removedLineCells);
  var resolution = createEmptyResolution();
  resolution.matched = removedLineCells;
  this._resolveVinesAfterRemoval(removedLineCells, grid, resolution);
  this._collectRemovedKeysAndResolveUnlocks(removedLineCells, grid, resolution);
  this._registerMatchedObjectiveCollection(removedLineCells, resolution.eliminationSequence, resolution, grid);
  if (removedLineCells.length) {
    resolution.impact = this._createImpactEventFromCell(removedLineCells[0]);
  }

  var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
  var removedFloating = grid.removeFloatingCells(floatingCells);
  this._appendUniqueCells(resolution.floating, removedFloating);
  this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
  var fallingCandidates = removedLineCells.concat(resolution.floating);
  this._registerResolutionDrops(fallingCandidates, grid, resolution, undefined, {
    matchedCellsForDelay: removedLineCells
  });
  this.systems.jarCollectorSystem.collect([]);

  resolution.collected = fallingCandidates;
  resolution.boardCleared = this._isBoardCleared(grid);
  this.lastResolution = resolution;
  this._applyPostImpactBoardShiftPolicy(this.lastResolution);
  this.pendingShotPlan = null;
  this.isAiming = false;

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  this._pushRuntimeEvent("ad_powerup_three_line_elimination", {
    rows: targetRows.slice(),
    removed: removedLineCells.length,
    floating: removedFloating.length,
    ice_collected: resolution.iceCollected
  });

  return {
    accepted: true,
    rows: preview.rows,
    removed: removedLineCells.length,
    floating: removedFloating.length,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};

GameManager.prototype.reviveFromAd = function () {
  if (AD_REVIVE_ALLOWED_STATES[this.state] !== true) {
    throw new Error("Ad revive can only run from a lose state: " + this.state);
  }
  if (this.activeProjectile) {
    throw new Error("Ad revive cannot run while a projectile is active.");
  }
  if (!this.systems || !this.systems.bubbleGrid) {
    throw new Error("Ad revive requires BubbleGrid.");
  }
  var reviveRuntimeSnapshot = this.isTimedInfiniteShots
    ? null
    : {
      board: {
        cells: this.systems.bubbleGrid.getCells()
      },
      objectives: this._buildPrimaryObjectiveSnapshot(this._getCachedJarSnapshot())
    };
  var revivePlan = AdRevivePolicy.buildRevivePlan(this.currentLevel, reviveRuntimeSnapshot);
  var previousRemainingShots = this.remainingShots;
  var previousRemainingTimeMs = this.remainingTimeMs;
  if (this.isTimedInfiniteShots) {
    if (revivePlan.grantedShots !== 0 || !Number.isInteger(revivePlan.grantedTimeSeconds) || revivePlan.grantedTimeSeconds <= 0) {
      throw new Error("Timed ad revive requires positive grantedTimeSeconds and zero grantedShots.");
    }
    this.remainingTimeMs = previousRemainingTimeMs + revivePlan.grantedTimeSeconds * 1000;
    this._lastTimerRenderBucket = Math.ceil(this.remainingTimeMs / TIMED_LEVEL_RENDER_BUCKET_MS);
    this.timerPaused = false;
  } else {
    if (!Number.isInteger(revivePlan.grantedShots) || revivePlan.grantedShots <= 0 || revivePlan.grantedTimeSeconds !== 0) {
      throw new Error("Shot-limited ad revive requires positive grantedShots and zero grantedTimeSeconds.");
    }
    if (!this.systems.shooterController || typeof this.systems.shooterController.setUpcomingNormalBalls !== "function") {
      throw new Error("Ad revive requires ShooterController.setUpcomingNormalBalls.");
    }
    if (typeof this.systems.shooterController.setUpcomingRandomNormalBalls !== "function") {
      throw new Error("Ad revive requires ShooterController.setUpcomingRandomNormalBalls.");
    }
    this.remainingShots = previousRemainingShots + revivePlan.grantedShots;
    var queueResult = revivePlan.targetColorBallCount > 0
      ? this.systems.shooterController.setUpcomingNormalBalls(
        revivePlan.targetColor,
        revivePlan.targetColorBallCount
      )
      : this.systems.shooterController.setUpcomingRandomNormalBalls(revivePlan.randomBallCount);
    if (!queueResult || queueResult.accepted !== true) {
      throw new Error("Ad revive failed to assign supply balls.");
    }
  }

  this.state = "running";
  this.isAiming = false;
  this.pendingShotPlan = null;
  this.pendingProjectileFinalize = false;
  this.lastResolution = createEmptyResolution();
  this._pushRuntimeEvent("ad_revive_granted", {
    previous_remaining_shots: previousRemainingShots,
    remaining_shots: this.remainingShots,
    granted_shots: revivePlan.grantedShots,
    previous_remaining_time_ms: previousRemainingTimeMs,
    remaining_time_ms: this.remainingTimeMs,
    granted_time_seconds: revivePlan.grantedTimeSeconds,
    target_color: revivePlan.targetColor,
    target_color_ball_count: revivePlan.targetColorBallCount,
    random_ball_count: revivePlan.randomBallCount
  });

  return {
    accepted: true,
    previousRemainingShots: previousRemainingShots,
    remainingShots: this.remainingShots,
    grantedShots: revivePlan.grantedShots,
    previousRemainingTimeMs: previousRemainingTimeMs,
    remainingTimeMs: this.remainingTimeMs,
    grantedTimeSeconds: revivePlan.grantedTimeSeconds,
    targetColor: revivePlan.targetColor,
    targetColorBallCount: revivePlan.targetColorBallCount,
    randomBallCount: revivePlan.randomBallCount,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};

GameManager.prototype.useSkillBall = function (entityType) {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.activeProjectile || this._isBoardAdvanceBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingBarrierHammer) {
    return {
      accepted: false,
      reason: "targeting_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingRainbowColorSelection) {
    return {
      accepted: false,
      reason: "rainbow_color_selection_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var equipResult = this.systems.shooterController.equipSkillBall(entityType);
  if (!equipResult || !equipResult.accepted) {
    return {
      accepted: false,
      reason: equipResult && equipResult.reason ? equipResult.reason : "equip_failed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (entityType === "rainbow") {
    var colors = this.currentLevel && this.currentLevel.level && Array.isArray(this.currentLevel.level.colors)
      ? this.currentLevel.level.colors.slice()
      : [];
    if (!colors.length) {
      throw new Error("Rainbow color selection requires level.colors.");
    }

    this.isAiming = false;
    this.pendingShotPlan = null;
    this.pendingRainbowColorSelection = {
      colors: colors
    };
  } else if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  return {
    accepted: true,
    entityType: entityType,
    remaining: equipResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.useSwapBall = function () {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.activeProjectile || this._isBoardAdvanceBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingBarrierHammer) {
    return {
      accepted: false,
      reason: "targeting_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingRainbowColorSelection) {
    return {
      accepted: false,
      reason: "rainbow_color_selection_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var swapResult = this.systems.shooterController.swapCurrentAndNextBall();
  if (!swapResult || !swapResult.accepted) {
    return {
      accepted: false,
      reason: swapResult && swapResult.reason ? swapResult.reason : "swap_failed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  return {
    accepted: true,
    remaining: swapResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.previewSnowRemoval = function () {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var shooterController = this.systems && this.systems.shooterController
    ? this.systems.shooterController
    : null;
  if (!shooterController || !shooterController.skillInventory) {
    throw new Error("Snow removal requires ShooterController skillInventory.");
  }
  if (!Object.prototype.hasOwnProperty.call(shooterController.skillInventory, "snow_removal")) {
    throw new Error("Snow removal inventory count is missing.");
  }
  var inventoryCount = Math.floor(assertFiniteNumber(shooterController.skillInventory.snow_removal, "snow_removal inventory"));
  if (inventoryCount < 0) {
    throw new Error("snow_removal inventory cannot be negative.");
  }
  if (inventoryCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var boardOcclusionSystem = this.systems.boardOcclusionSystem;
  if (!boardOcclusionSystem || typeof boardOcclusionSystem.snapshotForRender !== "function") {
    throw new Error("Snow removal requires BoardOcclusionSystem.");
  }
  var occlusionSnapshot = boardOcclusionSystem.snapshotForRender();
  if (!Array.isArray(occlusionSnapshot.activeZones)) {
    throw new Error("Board occlusion snapshot requires activeZones array.");
  }
  if (occlusionSnapshot.activeZones.length > 0) {
    return {
      accepted: true,
      targetKind: "board_occlusion",
      targets: occlusionSnapshot.activeZones.map(function (zone) {
        if (!zone || typeof zone.id !== "string" || !zone.id) {
          throw new Error("Board occlusion removal preview requires zone ids.");
        }
        return zone.id;
      }),
      clearCount: occlusionSnapshot.activeZones.length,
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var snowCells = grid.getCells().filter(function (cell) {
    return isIceBall(cell);
  }).sort(compareSnowRemovalTargetsFromBoardBottom);
  if (!snowCells.length) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var targets = snowCells.slice(0, SNOW_REMOVAL_CLEAR_COUNT).map(function (cell) {
    requireSnowRemovalTargetCoordinates(cell, "Snow removal preview target");
    return {
      row: cell.row,
      col: cell.col
    };
  });

  return {
    accepted: true,
    targetKind: "ice",
    targets: targets,
    clearCount: targets.length,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.useSnowRemoval = function (expectedTargets) {
  if (this._isInstantAdPowerupBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var preview = this.previewSnowRemoval();
  if (!preview.accepted) {
    return preview;
  }
  if (preview.targetKind === "board_occlusion") {
    if (Array.isArray(expectedTargets)) {
      var expectedOcclusionKey = expectedTargets.slice().sort().join("|");
      var actualOcclusionKey = preview.targets.slice().sort().join("|");
      if (expectedOcclusionKey !== actualOcclusionKey) {
        throw new Error("Board occlusion removal targets changed before resolution.");
      }
    }
    var occlusionConsumeResult = this.systems.shooterController.consumeSnowRemoval();
    if (!occlusionConsumeResult || !occlusionConsumeResult.accepted) {
      return {
        accepted: false,
        reason: occlusionConsumeResult && occlusionConsumeResult.reason
          ? occlusionConsumeResult.reason
          : "inventory_empty",
        snapshot: this.getRuntimeSnapshot()
      };
    }
    var removedZoneIds = this.systems.boardOcclusionSystem.clearAllWithItem();
    if (removedZoneIds.length !== preview.targets.length) {
      throw new Error("Board occlusion removal count changed before resolution.");
    }
    this.pendingShotPlan = null;
    this.isAiming = false;
    this._pushRuntimeEvent("board_occlusion_cleared", {
      reason: "snow_removal",
      zoneIds: removedZoneIds
    });
    this._pushRuntimeEvent("powerup_snow_removal", {
      target_kind: "board_occlusion",
      targets: removedZoneIds.slice(),
      removed: removedZoneIds.length,
      floating: 0,
      ice_collected: 0
    });
    return {
      accepted: true,
      targetKind: "board_occlusion",
      targets: removedZoneIds,
      removed: removedZoneIds.length,
      thawed: 0,
      floating: 0,
      remaining: occlusionConsumeResult.remaining,
      snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
    };
  }
  if (preview.targetKind !== "ice") {
    throw new Error("Unsupported snow removal targetKind: " + preview.targetKind);
  }
  if (Array.isArray(expectedTargets)) {
    var expectedKey = buildSnowRemovalTargetKey(expectedTargets);
    var actualKey = buildSnowRemovalTargetKey(preview.targets);
    if (expectedKey !== actualKey) {
      throw new Error("Snow removal targets changed before resolution.");
    }
  }

  var consumeResult = this.systems.shooterController.consumeSnowRemoval();
  if (!consumeResult || !consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult && consumeResult.reason ? consumeResult.reason : "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var targetCells = preview.targets.map(function (target) {
    requireSnowRemovalTargetCoordinates(target, "Snow removal use target");
    var cell = grid.getCell(target.row, target.col);
    if (!isIceBall(cell)) {
      throw new Error("Snow removal target is no longer a snow block: " + target.row + "," + target.col);
    }
    return cell;
  });
  var thawedSnowCells = targetCells.map(function (cell) {
    return this._thawIceCellAtCurrentPosition(grid, cell);
  }, this);
  if (thawedSnowCells.length !== targetCells.length) {
    throw new Error("Snow removal thawed count mismatch.");
  }

  var resolution = createEmptyResolution();
  resolution.thawed = thawedSnowCells;
  if (thawedSnowCells.length) {
    resolution.impact = this._createImpactEventFromCell(thawedSnowCells[0]);
  }
  this.lastResolution = resolution;
  resolution.iceCollected = this._registerIceCollection(thawedSnowCells);

  var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
  var removedFloating = grid.removeFloatingCells(floatingCells);
  this._registerResolutionDrops(removedFloating, grid, resolution, undefined, {
    matchedCellsForDelay: thawedSnowCells
  });
  this.systems.jarCollectorSystem.collect([]);

  resolution.floating = removedFloating;
  resolution.collected = removedFloating;
  resolution.boardCleared = this._isBoardCleared(grid);
  this._applyPostImpactBoardShiftPolicy(this.lastResolution);
  this.pendingShotPlan = null;
  this.isAiming = false;

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  this._pushRuntimeEvent("powerup_snow_removal", {
    targets: preview.targets.slice(),
    removed: thawedSnowCells.length,
    floating: removedFloating.length,
    ice_collected: resolution.iceCollected
  });

  return {
    accepted: true,
    targets: preview.targets,
    removed: thawedSnowCells.length,
    thawed: thawedSnowCells.length,
    floating: removedFloating.length,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot(this._drainRuntimeEvents())
  };
};

GameManager.prototype.beginBarrierHammer = function () {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.activeProjectile || this._isBoardAdvanceBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.pendingRainbowColorSelection) {
    return {
      accepted: false,
      reason: "rainbow_color_selection_active",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var hammerCount = this.systems &&
    this.systems.shooterController &&
    this.systems.shooterController.skillInventory
    ? Math.max(0, Math.floor(Number(this.systems.shooterController.skillInventory.barrier_hammer) || 0))
    : 0;
  if (hammerCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var hasBarrierObstacle = false;
  var grid = this.systems && this.systems.bubbleGrid ? this.systems.bubbleGrid : null;
  var cells = grid && typeof grid.getCells === "function" ? grid.getCells() : [];
  for (var i = 0; i < cells.length; i += 1) {
    if (isBarrierObstacleBall(cells[i])) {
      hasBarrierObstacle = true;
      break;
    }
  }

  if (!hasBarrierObstacle) {
    return {
      accepted: false,
      reason: "no_obstacle",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.pendingBarrierHammer = true;
  this.pendingRainbowColorSelection = null;
  this.isAiming = false;
  this.pendingShotPlan = null;
  return {
    accepted: true,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.cancelBarrierHammer = function () {
  this.pendingBarrierHammer = false;
  return {
    accepted: true,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.selectRainbowColor = function (colorCode) {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (!this.pendingRainbowColorSelection) {
    return {
      accepted: false,
      reason: "not_selecting_rainbow_color",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (typeof colorCode !== "string" || this.pendingRainbowColorSelection.colors.indexOf(colorCode) === -1) {
    return {
      accepted: false,
      reason: "invalid_color",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var resolveResult = this.systems.shooterController.resolveCurrentRainbowColor(colorCode);
  if (!resolveResult || !resolveResult.accepted) {
    return {
      accepted: false,
      reason: resolveResult && resolveResult.reason ? resolveResult.reason : "rainbow_color_resolve_failed",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  this.pendingRainbowColorSelection = null;
  this.pendingShotPlan = null;
  this.isAiming = false;

  return {
    accepted: true,
    color: colorCode,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.useBarrierHammerAt = function (point) {
  if (this.state !== "running") {
    return {
      accepted: false,
      reason: "state_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (!this.pendingBarrierHammer) {
    return {
      accepted: false,
      reason: "not_targeting",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (this.activeProjectile || this._isBoardAdvanceBusy()) {
    return {
      accepted: false,
      reason: "busy",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
    return {
      accepted: false,
      reason: "invalid_point",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var grid = this.systems.bubbleGrid;
  var collision = grid.findCollision(point, BoardLayout.bubbleRadius * 1.05);
  if (!collision) {
    return {
      accepted: false,
      reason: "no_target",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var targetCell = grid.getCell(collision.row, collision.col);
  if (!targetCell || (!isStoneBall(targetCell) && !isIceBall(targetCell))) {
    return {
      accepted: false,
      reason: "target_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  if (isIceBall(targetCell) && !resolveIceInnerColor(targetCell)) {
    return {
      accepted: false,
      reason: "target_invalid",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var consumeResult = this.systems.shooterController.consumeBarrierHammer();
  if (!consumeResult || !consumeResult.accepted) {
    return {
      accepted: false,
      reason: consumeResult && consumeResult.reason ? consumeResult.reason : "inventory_empty",
      snapshot: this.getRuntimeSnapshot()
    };
  }

  var resolution = createEmptyResolution();
  resolution.impact = this._createImpactEventFromCell({
    row: targetCell.row,
    col: targetCell.col
  });

  if (isStoneBall(targetCell)) {
    var removedObstacle = grid.removeCells([targetCell]);
    this._pushBubbleBreakEvent(removedObstacle);
    this._collectRemovedKeysAndResolveUnlocks(removedObstacle, grid, resolution);
    var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
    var removedFloating = grid.removeFloatingCells(floatingCells);
    this._appendUniqueCells(resolution.floating, removedFloating);
    this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);

    this._registerResolutionDrops(resolution.floating, grid, resolution);
    this.systems.jarCollectorSystem.collect([]);

    resolution.matched = removedObstacle;
    resolution.collected = resolution.floating.slice();
    resolution.boardCleared = this._isBoardCleared(grid);
  } else {
    var thawedCell = this._thawIceCellAtCurrentPosition(grid, targetCell);
    resolution.thawed = thawedCell ? [thawedCell] : [];
    if (typeof this._registerIceCollection === "function") {
      resolution.iceCollected = this._registerIceCollection(resolution.thawed);
    }
    resolution.boardCleared = this._isBoardCleared(grid);
    this.systems.fallingMarbleSystem.registerDrops([], grid);
    this.systems.jarCollectorSystem.collect([]);
  }

  this.pendingBarrierHammer = false;
  this.lastResolution = resolution;
  this._applyPostImpactBoardShiftPolicy(this.lastResolution);

  if (this.isAiming) {
    this._refreshShotPlan(true);
  }

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  return {
    accepted: true,
    removed: resolution.matched.length,
    thawed: resolution.thawed.length,
    floating: resolution.floating.length,
    remaining: consumeResult.remaining,
    snapshot: this.getRuntimeSnapshot()
  };
};

GameManager.prototype.pauseTimedLevelTimer = function () {
  if (!this.isTimedInfiniteShots) {
    return this.getRuntimeSnapshot();
  }
  this.timerPaused = true;
  return this.getRuntimeSnapshot();
};

GameManager.prototype.resumeTimedLevelTimer = function () {
  if (!this.isTimedInfiniteShots) {
    return this.getRuntimeSnapshot();
  }
  this.timerPaused = false;
  return this.getRuntimeSnapshot();
};

GameManager.prototype.update = function (dt) {
  var safeDt = assertFiniteNumber(dt, "GameManager.update dt");
  if (safeDt < 0) {
    throw new Error("GameManager.update dt must be non-negative.");
  }
  this.boardAdvanceUpdateSerial += 1;
  this.boardAdvancedThisFrame = false;
  var timedOutOcclusionZoneIds = this.systems.boardOcclusionSystem.update(
    safeDt,
    this.state !== "running" || this.timerPaused
  );
  if (timedOutOcclusionZoneIds.length) {
    this._pushRuntimeEvent("board_occlusion_cleared", {
      reason: "countdown",
      zoneIds: timedOutOcclusionZoneIds
    });
  }
  var timerChanged = false;
  if (this.state === "running" && this.isTimedInfiniteShots && !this.timerPaused) {
    var previousRemainingTimeMs = this.remainingTimeMs;
    this.remainingTimeMs = Math.max(0, previousRemainingTimeMs - safeDt * 1000);
    if (this.remainingTimeMs <= 0) {
      timerChanged = true;
    } else {
      var nextTimerRenderBucket = Math.ceil(this.remainingTimeMs / TIMED_LEVEL_RENDER_BUCKET_MS);
      if (nextTimerRenderBucket !== this._lastTimerRenderBucket) {
        this._lastTimerRenderBucket = nextTimerRenderBucket;
        timerChanged = true;
      }
    }
    if (this.remainingTimeMs <= 0) {
      this.state = "lost_objective";
      return this.getRuntimeSnapshot(this._drainRuntimeEvents());
    }
  }

  var hadProjectile = !!this.activeProjectile;
  var hadFallingDrops = this.systems.fallingMarbleSystem.hasActiveDrops();

  if (this.pendingProjectileFinalize && this.activeProjectile) {
    this.pendingProjectileFinalize = false;
    this._finalizePlannedShot();
  }

  if (this.activeProjectile) {
    var projectile = this.activeProjectile;
    var remainingDistance = projectile.speed * dt;
    var EPSILON = 0.000001;
    var maxStepCount = 48;
    var stepCount = 0;

    while (remainingDistance > EPSILON && this.activeProjectile && stepCount < maxStepCount) {
      stepCount += 1;
      var pathPoints = projectile.pathPoints || [];
      if (projectile.segmentIndex >= pathPoints.length - 1) {
        // Defer heavy attach/match resolution to next frame to avoid end-of-flight frame spikes.
        this.pendingProjectileFinalize = true;
        break;
      }

      var fromPoint = pathPoints[projectile.segmentIndex];
      var toPoint = pathPoints[projectile.segmentIndex + 1];
      var segmentLength = distance(fromPoint, toPoint);

      if (segmentLength <= EPSILON) {
        projectile.segmentIndex += 1;
        projectile.segmentProgress = 0;
        projectile.position = clone(toPoint);
        continue;
      }

      var segmentRemaining = segmentLength - projectile.segmentProgress;
      if (segmentRemaining <= EPSILON) {
        projectile.segmentIndex += 1;
        projectile.segmentProgress = 0;
        projectile.position = clone(toPoint);
        continue;
      }

      var step = Math.min(remainingDistance, segmentRemaining);
      if (step <= EPSILON) {
        // Guard against pathological float stalls near segment ends.
        remainingDistance = 0;
        break;
      }
      var nextProgress = projectile.segmentProgress + step;
      var t = nextProgress / segmentLength;

      projectile.position = lerpPoint(fromPoint, toPoint, t);
      projectile.segmentProgress = nextProgress;
      remainingDistance -= step;

      if (projectile.segmentProgress >= segmentLength - EPSILON) {
        projectile.segmentIndex += 1;
        projectile.segmentProgress = 0;
        projectile.position = clone(toPoint);
      }
    }

    if (stepCount >= maxStepCount && this.activeProjectile) {
      Logger.warn("Projectile step budget exceeded in single frame", {
        segmentIndex: projectile.segmentIndex,
        pathCount: (projectile.pathPoints || []).length
      });
    }
  }

  var viewportWasMoving = this.systems.boardViewportSystem.isMoving();
  var fallingStep = this.systems.fallingMarbleSystem.update(dt);
  var surplusUpdated = !!(fallingStep && fallingStep.surplusUpdated);
  var viewportFinished = this.systems.boardViewportSystem.update(dt);
  if (viewportFinished && typeof this._onBoardViewportMoveFinished === "function") {
    this._onBoardViewportMoveFinished();
  }
  var viewportUpdated = viewportWasMoving || viewportFinished;
  var fallingUpdated = !!(fallingStep && fallingStep.updated);
  var collectedDrops = fallingStep && Array.isArray(fallingStep.collected) ? fallingStep.collected : [];
  var cleanupScoredDrops = fallingStep && Array.isArray(fallingStep.cleanupScored) ? fallingStep.cleanupScored : [];
  var fairyHits = fallingStep && Array.isArray(fallingStep.fairyHits) ? fallingStep.fairyHits : [];
  var fairySplits = fallingStep && Array.isArray(fallingStep.splits) ? fallingStep.splits : [];
  var runtimeEvents = this._drainRuntimeEvents();
  var bounceEvents = fallingStep && Array.isArray(fallingStep.bounceEvents) ? fallingStep.bounceEvents : [];
  bounceEvents.forEach(function (bounceEvent) {
    if (!bounceEvent || !Number.isInteger(bounceEvent.bounceCount) || bounceEvent.bounceCount < 1) {
      throw new Error("FallingMarbleSystem bounce event requires positive integer bounceCount.");
    }
    if (!Number.isInteger(bounceEvent.jarIndex) || bounceEvent.jarIndex < 0) {
      throw new Error("FallingMarbleSystem bounce event requires non-negative integer jarIndex.");
    }
    var glowStacks = requireDropGlowStacks(bounceEvent.glowStacks, "FallingMarbleSystem bounce event");
    this._pushRuntimeEvent("jar_rim_bounce", {
      bounceCount: bounceEvent.bounceCount,
      glowStacks: glowStacks,
      jarIndex: bounceEvent.jarIndex
    });
  }, this);
  fairyHits.forEach(function (hit) {
    this._pushRuntimeEvent("fairy_assist_hit", hit);
  }, this);
  fairySplits.forEach(function (split) {
    this._pushRuntimeEvent("fairy_assist_split", split);
  }, this);
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());

  if (collectedDrops.length) {
    this._pushRuntimeEvent("jar_collect_bottom", {
      count: collectedDrops.length,
      glowStacks: resolveCollectedDropAudioGlowStacks(collectedDrops)
    });
    this._registerIceSnowballCollection(collectedDrops);
    this._injectCollectedSkillBalls(collectedDrops);
    this.systems.jarCollectorSystem.collect(collectedDrops);
    this._applyJarCollectionScore(collectedDrops);

    if (this.lastResolution && Array.isArray(this.lastResolution.collected)) {
      this.lastResolution.collected = this.lastResolution.collected.concat(collectedDrops.map(function (drop) {
        return {
          id: drop.id,
          color: drop.color,
          entityCategory: drop.entityCategory || "normal_ball",
          entityType: drop.entityType || null,
          splitColor: typeof drop.splitColor === "string" ? drop.splitColor : null,
          innerColor: drop.innerColor || null,
          row: drop.row,
          col: drop.col,
          jarIndex: drop.jarIndex,
          jarColor: drop.jarColor,
          sameColor: !!drop.sameColor,
          bonusMultiplier: typeof drop.bonusMultiplier === "number" ? drop.bonusMultiplier : 1,
          fairyBonusSteps: drop.fairyBonusSteps,
          fairyMultiplier: drop.fairyMultiplier,
          finalMultiplier: drop.finalMultiplier,
          glowStacks: drop.glowStacks,
          rootDropId: drop.rootDropId,
          splitGeneration: drop.splitGeneration,
          hitFairyIds: drop.hitFairyIds.slice()
        };
      }));
    }
  }
  if (cleanupScoredDrops.length) {
    this._applyJarCollectionScore(cleanupScoredDrops);
  }
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());
  var scoreBoostChanged = this._updateJarScoreBoost(dt);
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());

  var boardAdvancedThisFrame = viewportFinished || this._updatePendingBoardAdvance(dt) || this._hasBoardAdvancedThisFrame();
  var swirlRotationWasPending = this._hasPendingSwirlRotation();
  var swirlRotationCompleted = boardAdvancedThisFrame ? false : this._updatePendingSwirlRotation(dt);
  var wormholeShiftWasPending = this._hasPendingWormholeShift();
  var wormholeShiftCompleted = boardAdvancedThisFrame || swirlRotationWasPending || this._hasPendingSwirlRotation()
    ? false
    : this._updatePendingWormholeShift(dt);
  var vineCastWasPending = this._hasPendingVineCast();
  var vineCastCompleted = boardAdvancedThisFrame || swirlRotationWasPending || this._hasPendingSwirlRotation() || wormholeShiftWasPending || this._hasPendingWormholeShift()
    ? false
    : this._updatePendingVineCast(dt);
  var blockOtherSpecialUpdates = swirlRotationWasPending || this._hasPendingSwirlRotation() || wormholeShiftWasPending || this._hasPendingWormholeShift() || vineCastWasPending || this._hasPendingVineCast();
  var splitterSpawned = boardAdvancedThisFrame || blockOtherSpecialUpdates ? false : this._updatePendingSplitterSpawns(dt);
  var molotovBlastUpdated = boardAdvancedThisFrame || blockOtherSpecialUpdates ? false : this._updatePendingMolotovBlasts(dt);
  runtimeEvents = runtimeEvents.concat(this._drainRuntimeEvents());
  var hasProjectile = !!this.activeProjectile;
  var hasFallingDrops = this.systems.fallingMarbleSystem.hasActiveDrops();
  var hasPendingSplitterSpawns = this._hasPendingSplitterSpawns();
  var hasPendingMolotovBlasts = this._hasPendingMolotovBlasts();
  var hasPendingSwirlRotation = this._hasPendingSwirlRotation();
  var hasPendingWormholeShift = this._hasPendingWormholeShift();
  var hasPendingVineCast = this._hasPendingVineCast();

  if (
    this.state === "won_surplus_shots_pending" &&
    !this.surplusShotAimRecentered &&
    !this.systems.fallingMarbleSystem.hasPendingSurplusShots()
  ) {
    this.surplusShotAimRecentered = true;
    this.surplusShotAimRecenterRevision += 1;
  }

  if (
    splitterSpawned &&
    this.state === "running" &&
    !this.isTimedInfiniteShots &&
    this.remainingShots <= 0 &&
    !hasFallingDrops &&
    !hasPendingSplitterSpawns &&
    !hasPendingMolotovBlasts &&
    !hasPendingSwirlRotation &&
    !hasPendingWormholeShift &&
    !hasPendingVineCast &&
    !this._isBoardAdvanceBusy()
  ) {
    this._showOutOfShotsAddBallPrompt();
  }

  if (
    molotovBlastUpdated &&
    this.state === "running" &&
    !this.isTimedInfiniteShots &&
    this.remainingShots <= 0 &&
    !hasFallingDrops &&
    !hasPendingSplitterSpawns &&
    !hasPendingMolotovBlasts &&
    !hasPendingSwirlRotation &&
    !hasPendingWormholeShift &&
    !hasPendingVineCast &&
    !this._isBoardAdvanceBusy()
  ) {
    this._showOutOfShotsAddBallPrompt();
  }

  if (boardAdvancedThisFrame && (this.state === "running" || this.state === "out_of_shots_pending")) {
    if (this.state === "running" && !this.isTimedInfiniteShots && this.remainingShots <= 0) {
      if (hasFallingDrops) {
        this.state = "out_of_shots_pending";
      } else {
        this._showOutOfShotsAddBallPrompt();
      }
    }
  }

  if (this.state === "won_pending" && !hasProjectile && !hasFallingDrops && !hasPendingSplitterSpawns && !hasPendingMolotovBlasts && !hasPendingSwirlRotation && !hasPendingWormholeShift && !hasPendingVineCast) {
    this._resolveBoardClearedOutcome();
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (
    this.state === "won_surplus_shots_pending" &&
    !hasProjectile &&
    !hasFallingDrops &&
    !hasPendingSplitterSpawns &&
    !hasPendingMolotovBlasts &&
    !hasPendingSwirlRotation &&
    !hasPendingWormholeShift &&
    !hasPendingVineCast &&
    !this.systems.fallingMarbleSystem.hasPendingSurplusShots()
  ) {
    if (typeof this._pushRuntimeEvent === "function") {
      this._pushRuntimeEvent("surplus_shots_finished", {});
    }
    this._scheduleWinSettlement();
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (this.state === "won_settlement_pending") {
    this._updatePendingWinSettlement(dt);
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (this.state === "out_of_shots_pending" && !hasProjectile && !hasFallingDrops && !hasPendingSplitterSpawns && !hasPendingMolotovBlasts && !hasPendingSwirlRotation && !hasPendingWormholeShift && !hasPendingVineCast && !this._isBoardAdvanceBusy()) {
    this._showOutOfShotsAddBallPrompt();
    return this.getRuntimeSnapshot(runtimeEvents);
  }

  if (
    !hasProjectile &&
    !hasFallingDrops &&
    !hadProjectile &&
    !hadFallingDrops &&
    !collectedDrops.length &&
    !scoreBoostChanged &&
    !splitterSpawned &&
    !molotovBlastUpdated &&
    !swirlRotationCompleted &&
    !wormholeShiftCompleted &&
    !vineCastCompleted &&
    !surplusUpdated &&
    !viewportUpdated &&
    !boardAdvancedThisFrame &&
    !runtimeEvents.length &&
    !timerChanged
  ) {
    return null;
  }

  if (
    hasProjectile ||
    hasFallingDrops ||
    fallingUpdated ||
    hadProjectile ||
    hadFallingDrops ||
    collectedDrops.length ||
    scoreBoostChanged ||
    splitterSpawned ||
    molotovBlastUpdated ||
    swirlRotationCompleted ||
    wormholeShiftCompleted ||
    vineCastCompleted ||
    surplusUpdated ||
    viewportUpdated ||
    boardAdvancedThisFrame ||
    runtimeEvents.length ||
    timerChanged
  ) {
    var refreshScope = "full";
    if (
      hasProjectile &&
      !hasFallingDrops &&
      !fallingUpdated &&
      collectedDrops.length === 0 &&
      !scoreBoostChanged &&
      !splitterSpawned &&
      !molotovBlastUpdated &&
      !swirlRotationCompleted &&
      !wormholeShiftCompleted &&
      !vineCastCompleted &&
      !surplusUpdated &&
      !viewportUpdated &&
      !boardAdvancedThisFrame &&
      runtimeEvents.length === 0 &&
      !timerChanged
    ) {
      refreshScope = "projectile";
    } else if (
      timerChanged &&
      !hasProjectile &&
      !hasFallingDrops &&
      !fallingUpdated &&
      collectedDrops.length === 0 &&
      !scoreBoostChanged &&
      !splitterSpawned &&
      !molotovBlastUpdated &&
      !swirlRotationCompleted &&
      !wormholeShiftCompleted &&
      !vineCastCompleted &&
      !surplusUpdated &&
      !viewportUpdated &&
      !boardAdvancedThisFrame &&
      runtimeEvents.length === 0
    ) {
      refreshScope = "timer";
    } else if (
      (hasFallingDrops || fallingUpdated) &&
      !hasProjectile &&
      collectedDrops.length === 0 &&
      !scoreBoostChanged &&
      !splitterSpawned &&
      !molotovBlastUpdated &&
      !swirlRotationCompleted &&
      !wormholeShiftCompleted &&
      !vineCastCompleted &&
      !surplusUpdated &&
      !viewportUpdated &&
      !boardAdvancedThisFrame &&
      runtimeEvents.length === 0 &&
      !timerChanged
    ) {
      refreshScope = "falling";
    }

    return this.getRuntimeSnapshot(runtimeEvents, { refreshScope: refreshScope });
  }

  return null;
};
Object.assign(GameManager.prototype, createGameManagerShotResolutionMethods({
  Logger: Logger,
  BoardLayout: BoardLayout,
  clone: clone,
  quantize: quantize,
  buildProjectilePathFromShotPlan: buildProjectilePathFromShotPlan,
  measurePathDistance: measurePathDistance,
  RAINBOW_TIE_BREAK_ORDER: RAINBOW_TIE_BREAK_ORDER,
  isSkillBall: isSkillBall,
  isIceBall: isIceBall,
  isBlastBall: isBlastBall,
  isRainbowBall: isRainbowBall,
  isMolotovBall: isMolotovBall,
  isSplitterBall: isSplitterBall,
  isVineSpiritBall: isVineSpiritBall,
  isVineEntangledBall: isVineEntangledBall,
  isLockedBall: isLockedBall,
  isKeyBall: isKeyBall,
  resolveIceInnerColor: resolveIceInnerColor,
  createEmptyResolution: createEmptyResolution,
  COMBO_BONUS_PER_HIT: COMBO_BONUS_PER_HIT,
  findPrimaryCollectionObjective: findPrimaryCollectionObjective,
  listCollectionRewardObjectives: listCollectionRewardObjectives
}));

GameManager.prototype.debugDropBottomRow = function () {
  if (this.state !== "running" || this.activeProjectile) {
    return this.getRuntimeSnapshot();
  }

  var grid = this.systems.bubbleGrid;
  var cells = grid.getCells();
  if (!cells.length) {
    return this.getRuntimeSnapshot();
  }

  var bottomRow = cells.reduce(function (maxRow, cell) {
    return Math.max(maxRow, cell.row);
  }, 0);
  var bottomCells = cells.filter(function (cell) {
    return cell.row === bottomRow;
  });

  if (!bottomCells.length) {
    return this.getRuntimeSnapshot();
  }

  var removedBottom = grid.removeCells(bottomCells);
  if (!removedBottom.length) {
    return this.getRuntimeSnapshot();
  }

  var resolution = createEmptyResolution();
  resolution.collected = removedBottom;
  if (removedBottom.length) {
    resolution.impact = this._createImpactEventFromCell(removedBottom[0]);
  }
  this._collectRemovedKeysAndResolveUnlocks(removedBottom, grid, resolution);

  this._registerResolutionDrops(removedBottom, grid, resolution);
  this.systems.jarCollectorSystem.collect([]);

  resolution.boardCleared = this._isBoardCleared(grid);
  this.lastResolution = resolution;
  this._ensureMinimumVisibleBoardRows(this.lastResolution);
  this.pendingShotPlan = null;
  this.isAiming = false;

  if (resolution.boardCleared) {
    this._resolveBoardClearedOutcome();
  }

  Logger.info("Debug bottom-row drop", {
    row: bottomRow,
    removed: removedBottom.length,
    falling: removedBottom.length,
    injectedSkills: resolution.injectedSkills.length
  });

  return this.getRuntimeSnapshot();
};

GameManager.prototype._rebuildCachedAdRunPowerupAllowed = function () {
  var adRules = this._getAdPowerupRules();
  var allowed = {};
  if (adRules && Array.isArray(adRules.allowed)) {
    adRules.allowed.forEach(function (powerupType) {
      allowed[powerupType] = true;
    });
  }
  this._cachedAdRunPowerupAllowed = allowed;
};

GameManager.prototype._getCachedAimGuidePath = function (origin, direction, maxBounces, topAttachY) {
  var safeOrigin = origin ? origin : BoardLayout.shooterOrigin;
  var safeDirection = direction ? direction : { x: 0, y: 1 };
  var cacheKey = [
    topAttachY,
    maxBounces,
    quantize(safeOrigin.x, 0.1).toFixed(1),
    quantize(safeOrigin.y, 0.1).toFixed(1),
    quantize(safeDirection.x, 0.001).toFixed(3),
    quantize(safeDirection.y, 0.001).toFixed(3)
  ].join("|");
  if (this._aimGuidePathCacheKey !== cacheKey) {
    this._aimGuidePathCacheKey = cacheKey;
    this._aimGuidePathCache = buildAimGuidePath(safeOrigin, safeDirection, maxBounces, topAttachY);
  }
  return this._aimGuidePathCache;
};

GameManager.prototype.getTurnsUntilDrop = function () {
  return null;
};

GameManager.prototype.getRuntimeSnapshot = function (runtimeEvents, renderOptions) {
  renderOptions = renderOptions || {};
  if (
    Object.prototype.hasOwnProperty.call(renderOptions, "refreshScope") &&
    typeof renderOptions.refreshScope !== "string"
  ) {
    throw new Error("getRuntimeSnapshot renderOptions.refreshScope must be string.");
  }
  var fallingSystem = this.systems.fallingMarbleSystem;
  var fairyAssistSystem = this.systems.fairyAssistSystem;
  var systemSnapshots = {
    fairyAssistSystem: fairyAssistSystem.snapshotForRender(),
    // Renderer currently relies on falling snapshot (active drops + jar zones).
    fallingMarbleSystem: typeof fallingSystem.snapshotForRender === "function"
      ? fallingSystem.snapshotForRender()
      : fallingSystem.snapshot(),
    boardOcclusionSystem: this.systems.boardOcclusionSystem.snapshotForRender()
  };
  var jarsSnapshot = this._getCachedJarSnapshot();
  var objectiveSnapshot = this._buildPrimaryObjectiveSnapshot(jarsSnapshot);
  if (!this._cachedAdRunPowerupAllowed) {
    this._rebuildCachedAdRunPowerupAllowed();
  }
  var adRunPowerupAllowed = this._cachedAdRunPowerupAllowed;

  var shooterController = this.systems.shooterController;
  var shooterSnapshot = shooterController.getShooterStateForRender();
  shooterSnapshot.ricochetGuideActive = this.ricochetGuideActive === true;
  var topAttachY = this.systems.bubbleGrid && typeof this.systems.bubbleGrid.getTopAttachY === "function"
    ? this.systems.bubbleGrid.getTopAttachY()
    : (BoardLayout.boardStartY + BoardLayout.bubbleRadius);
  shooterSnapshot.aimGuidePath = this._getCachedAimGuidePath(
    shooterSnapshot.aim ? shooterSnapshot.aim.origin : BoardLayout.shooterOrigin,
    shooterSnapshot.aim ? shooterSnapshot.aim.direction : { x: 0, y: 1 },
    shooterSnapshot.ricochetGuideActive ? (this.systems.trajectoryPredictor ? this.systems.trajectoryPredictor.maxBounces : 0) : 0,
    topAttachY
  );
  shooterSnapshot.isAiming = this.isAiming;
  shooterSnapshot.infiniteShots = !!this.isTimedInfiniteShots;
  shooterSnapshot.pendingBarrierHammer = this.state === "running" && this.pendingBarrierHammer;
  shooterSnapshot.pendingRainbowColorSelection = this.state === "running" && this.pendingRainbowColorSelection
    ? this.pendingRainbowColorSelection
    : null;
  shooterSnapshot.canUsePowerups = !!(
    this.state === "running" &&
    !this.activeProjectile &&
    !this._isBoardAdvanceBusy() &&
    !this._hasPendingSwirlRotation() &&
    !this._hasPendingWormholeShift() &&
    !this._hasPendingVineCast() &&
    !this.pendingRainbowColorSelection
  );
  shooterSnapshot.trajectory = this.isAiming && this.pendingShotPlan && !this.activeProjectile && !this.pendingRainbowColorSelection
    ? this.pendingShotPlan
    : null;

  shooterSnapshot.surplusShotAimRecenterRevision = this.surplusShotAimRecenterRevision;
  if (this.state === "won_surplus_shots_pending") {
    var fallingMarbleSystem = this.systems.fallingMarbleSystem;
    if (!fallingMarbleSystem || typeof fallingMarbleSystem.getSurplusTurretAimDirection !== "function") {
      throw new Error("Surplus shot render requires FallingMarbleSystem.getSurplusTurretAimDirection.");
    }
    if (typeof fallingMarbleSystem.isSurplusVolleyActive !== "function") {
      throw new Error("Surplus shot render requires FallingMarbleSystem.isSurplusVolleyActive.");
    }
    if (typeof fallingMarbleSystem.getPendingSurplusShotCount !== "function") {
      throw new Error("Surplus shot render requires FallingMarbleSystem.getPendingSurplusShotCount.");
    }
    var surplusAimOrigin = shooterSnapshot.aim && shooterSnapshot.aim.origin
      ? shooterSnapshot.aim.origin
      : BoardLayout.shooterOrigin;
    var surplusAimDirection = fallingMarbleSystem.getSurplusTurretAimDirection();
    shooterSnapshot.surplusRemainingShots = fallingMarbleSystem.getPendingSurplusShotCount();
    if (fallingMarbleSystem.isSurplusVolleyActive()) {
      shooterSnapshot.aim = {
        origin: surplusAimOrigin,
        direction: surplusAimDirection
      };
    } else if (this.surplusShotAimRecentered) {
      shooterSnapshot.surplusShotAimRecenterDirection = surplusAimDirection;
    }
    shooterSnapshot.trajectory = null;
    shooterSnapshot.aimGuidePath = [];
  }

  return {
    state: this.state,
    surplusShotsSettling: this.state === "won_surplus_shots_pending",
    levelCode: this.currentLevel ? this.currentLevel.level.code : null,
    remainingShots: this.remainingShots,
    infiniteShots: !!this.isTimedInfiniteShots,
    timedLevel: !!this.isTimedInfiniteShots,
    timeLimitMs: Math.max(0, Math.floor(assertFiniteNumber(this.timeLimitMs, "runtime timeLimitMs"))),
    remainingTimeMs: Math.max(0, Math.ceil(assertFiniteNumber(this.remainingTimeMs, "runtime remainingTimeMs"))),
    timerPaused: !!this.timerPaused,
    requiredStarCount: Math.max(0, Math.floor(assertFiniteNumber(this.requiredStarCount, "runtime requiredStarCount"))),
    score: this.score,
    shotsFired: this.shotsFired,
    jarScoreBoostActive: this.jarScoreBoostActive,
    jarScoreBoostMultiplier: this.jarScoreBoostMultiplier,
    jarScoreBoostRemainingMs: Math.max(0, Math.floor(Number(this.jarScoreBoostRemainingMs) || 0)),
    dropInterval: 0,
    boardViewport: this.systems.boardViewportSystem.snapshot(),
    inputLocked: this._isBoardAdvanceBusy() || this._hasPendingSwirlRotation() || this._hasPendingWormholeShift() || this._hasPendingVineCast() || this.state !== "running",
    turnsUntilDrop: this.getTurnsUntilDrop(),
    lastFiredColor: this.lastFiredColor,
    // Keep runtime snapshot light during flight to avoid per-frame deep-clone spikes.
    lastResolution: this.lastResolution,
    activeProjectile: buildRuntimeProjectileSnapshot(this.activeProjectile),
    board: this._getCachedBoardSnapshot(),
    shooter: shooterSnapshot,
    jars: jarsSnapshot,
    objectives: objectiveSnapshot,
    adRunPowerups: this.adRunPowerupInventory,
    adRunPowerupAllowed: adRunPowerupAllowed,
    winStats: {
      totalScore: this.score,
      // 结算进度与顶部 HUD 保持同口径，避免显示不一致。
      sameColorProgress: objectiveSnapshot ? (objectiveSnapshot.progress || 0) : 0,
      sameColorTarget: objectiveSnapshot ? (objectiveSnapshot.target || 0) : 0,
      sameColorBonusScore: this.sameColorJarBonusScore,
      starRating: calculateStarRating(this.score, this.scoreHeatBand),
      starProgress: calculateStarProgress(this.score, this.scoreHeatBand),
      starThresholds: normalizeStarThresholds(this.scoreHeatBand),
      collectionRewardCompleted: this._areCollectionRewardObjectivesCompleted(),
      scoreHeatBand: this.scoreHeatBand,
      scoreDifficulty: this.scoreHeatBand ? this.scoreHeatBand.difficulty : "normal",
      maxComboStreak: this.maxComboStreak
    },
    runtimeEvents: Array.isArray(runtimeEvents) ? runtimeEvents.slice() : [],
    systems: systemSnapshots,
    refreshScope: renderOptions.refreshScope || "full"
  };
};

GameManager.prototype._registerPools = function () {
  if (!this.poolManager) {
    return;
  }

  this.poolManager.register("bubble");
  this.poolManager.register("fallingMarble");
  this.poolManager.register("fx");
};

module.exports = GameManager;













},{"../../assets/scripts/utils/Logger":"Logger","../../assets/scripts/config/BoardLayout":"BoardLayout","../config/FairyAssistConfig":"FairyAssistConfig","../config/SpecialAnimationTiming":"SpecialAnimationTiming","../systems/ShooterController":"ShooterController","../systems/TrajectoryPredictor":"TrajectoryPredictor","../systems/BubbleGrid":"BubbleGrid","../systems/MatchSystem":"MatchSystem","../systems/SupportSystem":"SupportSystem","../systems/FairyAssistSystem":"FairyAssistSystem","../systems/BoardViewportSystem":"BoardViewportSystem","../systems/FallingMarbleSystem":"FallingMarbleSystem","../systems/JarCollectorSystem":"JarCollectorSystem","../systems/BoardOcclusionSystem":"BoardOcclusionSystem","./ProjectileMath":"ProjectileMath","./AdRevivePolicy":"AdRevivePolicy","../../assets/scripts/core/StarRatingPolicy":"StarRatingPolicy","./GameManagerShotResolutionMethods":"GameManagerShotResolutionMethods"}],
"GameManagerShotResolutionMethods":[function(require,module,exports){
"use strict";

var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");
var BoardViewportSystem = require("../systems/BoardViewportSystem");
var EliminationSequenceBuilder = require("./EliminationSequenceBuilder");
var JarScoreConfig = require("../config/JarScoreConfig");

function createGameManagerShotResolutionMethods(deps) {
  var Logger = deps.Logger;
  var BoardLayout = deps.BoardLayout;
  var clone = deps.clone;
  var quantize = deps.quantize;
  var buildProjectilePathFromShotPlan = deps.buildProjectilePathFromShotPlan;
  var measurePathDistance = deps.measurePathDistance;
  var isSkillBall = deps.isSkillBall;
  var isIceBall = deps.isIceBall;
  var isBlastBall = deps.isBlastBall;
  var isRainbowBall = deps.isRainbowBall;
  var isMolotovBall = deps.isMolotovBall;
  var isSplitterBall = deps.isSplitterBall;
  var isVineSpiritBall = deps.isVineSpiritBall;
  var isVineEntangledBall = deps.isVineEntangledBall;
  var isLockedBall = deps.isLockedBall;
  var isKeyBall = deps.isKeyBall;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var createEmptyResolution = deps.createEmptyResolution;
  var findPrimaryCollectionObjective = deps.findPrimaryCollectionObjective;
  var listCollectionRewardObjectives = deps.listCollectionRewardObjectives;
  var COMBO_BONUS_PER_HIT = deps.COMBO_BONUS_PER_HIT;
  var MOLOTOV_BLAST_ANIMATION_DURATION = SpecialAnimationTiming.molotovBlast.totalDuration;
  var MOLOTOV_BLAST_TRIGGER_DELAY = SpecialAnimationTiming.molotovBlast.blastTriggerDelay;
  var FLOATING_ICE_DROP_DELAY = SpecialAnimationTiming.iceSnowballCollect.floatingIceDropDelay;
  var KEY_UNLOCK_DROP_DELAY = SpecialAnimationTiming.keyUnlock.totalDuration;
  var MOLOTOV_BLAST_DROP_INNER_SPEED = 860;
  var MOLOTOV_BLAST_DROP_OUTER_SPEED = 640;
  var ELIMINATION_SEQUENCE_INTERVAL_MS = 30;

  function requireFinitePoint(point, ownerName) {
    if (
      !point ||
      typeof point.x !== "number" ||
      typeof point.y !== "number" ||
      !isFinite(point.x) ||
      !isFinite(point.y)
    ) {
      throw new Error(ownerName + " position must be finite.");
    }
    return point;
  }

  function requirePositiveFiniteNumber(value, ownerName) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      throw new Error(ownerName + " must be a positive finite number.");
    }
    return value;
  }

  function measureWorldDistanceSqBetweenCells(leftCell, rightCell, grid) {
    if (!leftCell || !Number.isInteger(leftCell.row) || !Number.isInteger(leftCell.col)) {
      throw new Error("World distance requires left cell coordinates.");
    }
    if (!rightCell || !Number.isInteger(rightCell.row) || !Number.isInteger(rightCell.col)) {
      throw new Error("World distance requires right cell coordinates.");
    }
    if (!grid || typeof grid.getCellPosition !== "function") {
      throw new Error("World distance requires grid.getCellPosition.");
    }

    var leftPosition = requireFinitePoint(
      grid.getCellPosition(leftCell.row, leftCell.col),
      "Left cell"
    );
    var rightPosition = requireFinitePoint(
      grid.getCellPosition(rightCell.row, rightCell.col),
      "Right cell"
    );
    var dx = rightPosition.x - leftPosition.x;
    var dy = rightPosition.y - leftPosition.y;
    return dx * dx + dy * dy;
  }

  function compareWorldDistanceSq(leftDistanceSq, rightDistanceSq) {
    if (typeof leftDistanceSq !== "number" || !isFinite(leftDistanceSq)) {
      throw new Error("World distance compare requires left distanceSq.");
    }
    if (typeof rightDistanceSq !== "number" || !isFinite(rightDistanceSq)) {
      throw new Error("World distance compare requires right distanceSq.");
    }
    return leftDistanceSq - rightDistanceSq;
  }

  function compareKeysForStableTiebreak(leftKey, rightKey) {
    if (!leftKey || !Number.isInteger(leftKey.row) || !Number.isInteger(leftKey.col)) {
      throw new Error("Key tiebreak requires left key coordinates.");
    }
    if (!rightKey || !Number.isInteger(rightKey.row) || !Number.isInteger(rightKey.col)) {
      throw new Error("Key tiebreak requires right key coordinates.");
    }
    if (leftKey.row !== rightKey.row) {
      return leftKey.row - rightKey.row;
    }
    if (leftKey.col !== rightKey.col) {
      return leftKey.col - rightKey.col;
    }
    return String(leftKey.id).localeCompare(String(rightKey.id));
  }

  function compareLocksForStableTiebreak(leftLock, rightLock) {
    if (!leftLock || !Number.isInteger(leftLock.row) || !Number.isInteger(leftLock.col)) {
      throw new Error("Lock tiebreak requires left lock coordinates.");
    }
    if (!rightLock || !Number.isInteger(rightLock.row) || !Number.isInteger(rightLock.col)) {
      throw new Error("Lock tiebreak requires right lock coordinates.");
    }
    if (leftLock.row !== rightLock.row) {
      return leftLock.row - rightLock.row;
    }
    if (leftLock.col !== rightLock.col) {
      return leftLock.col - rightLock.col;
    }
    return String(leftLock.id).localeCompare(String(rightLock.id));
  }

  function hasUnlockEntryForKey(keyCell, unlockedLockedBalls) {
    if (!keyCell || (typeof keyCell.id !== "string" && typeof keyCell.id !== "number")) {
      throw new Error("Key unlock lookup requires key id.");
    }
    if (!Array.isArray(unlockedLockedBalls)) {
      throw new Error("Key unlock lookup requires unlockedLockedBalls array.");
    }
    return unlockedLockedBalls.some(function (entry) {
      return entry && entry.__sourceKeyId === keyCell.id;
    });
  }

  function findNearestLockForKey(keyCell, lockedTargets, grid) {
    if (!keyCell) {
      throw new Error("Nearest lock selection requires key cell.");
    }
    if (!Array.isArray(lockedTargets) || !lockedTargets.length) {
      throw new Error("Nearest lock selection requires locked targets.");
    }

    var nearestLock = null;
    var nearestDistanceSq = null;
    lockedTargets.forEach(function (lockCell) {
      var distanceSq = measureWorldDistanceSqBetweenCells(keyCell, lockCell, grid);
      if (
        nearestLock === null ||
        compareWorldDistanceSq(distanceSq, nearestDistanceSq) < 0 ||
        (
          compareWorldDistanceSq(distanceSq, nearestDistanceSq) === 0 &&
          compareLocksForStableTiebreak(lockCell, nearestLock) < 0
        )
      ) {
        nearestLock = lockCell;
        nearestDistanceSq = distanceSq;
      }
    });

    if (!nearestLock) {
      throw new Error("Nearest lock selection failed for key: " + keyCell.id);
    }
    return nearestLock;
  }

  function buildNearestKeyLockPairings(groupKeys, lockedTargets, grid) {
    if (!Array.isArray(groupKeys) || !groupKeys.length) {
      throw new Error("Nearest key lock pairing requires group keys.");
    }
    if (!Array.isArray(lockedTargets) || !lockedTargets.length) {
      throw new Error("Nearest key lock pairing requires locked targets.");
    }
    if (lockedTargets.length < groupKeys.length) {
      throw new Error("Nearest key lock pairing requires at least one locked target per key.");
    }

    if (groupKeys.length === 1) {
      return [{
        keyCell: groupKeys[0],
        lockCell: findNearestLockForKey(groupKeys[0], lockedTargets, grid)
      }];
    }

    var remainingKeys = groupKeys.slice();
    var remainingLocks = lockedTargets.slice();
    var pairings = [];

    while (remainingKeys.length && remainingLocks.length) {
      var bestPair = null;
      var bestDistanceSq = null;

      remainingKeys.forEach(function (keyCell) {
        remainingLocks.forEach(function (lockCell) {
          var distanceSq = measureWorldDistanceSqBetweenCells(keyCell, lockCell, grid);
          if (
            !bestPair ||
            compareWorldDistanceSq(distanceSq, bestDistanceSq) < 0 ||
            (
              compareWorldDistanceSq(distanceSq, bestDistanceSq) === 0 &&
              (
                compareKeysForStableTiebreak(keyCell, bestPair.keyCell) < 0 ||
                (
                  compareKeysForStableTiebreak(keyCell, bestPair.keyCell) === 0 &&
                  compareLocksForStableTiebreak(lockCell, bestPair.lockCell) < 0
                )
              )
            )
          ) {
            bestPair = {
              keyCell: keyCell,
              lockCell: lockCell
            };
            bestDistanceSq = distanceSq;
          }
        });
      });

      if (!bestPair) {
        throw new Error("Nearest key lock pairing failed to resolve target.");
      }

      pairings.push(bestPair);
      remainingKeys = remainingKeys.filter(function (cell) {
        return cell.id !== bestPair.keyCell.id;
      });
      remainingLocks = remainingLocks.filter(function (cell) {
        return cell.id !== bestPair.lockCell.id;
      });
    }

    return pairings;
  }

  function buildMolotovBlastDropVelocity(active, cell, grid) {
    if (!active || !Number.isInteger(active.row) || !Number.isInteger(active.col)) {
      throw new Error("Molotov blast drop velocity requires active coordinates.");
    }
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error("Molotov blast drop velocity requires cell coordinates.");
    }
    if (!grid || typeof grid.getCellPosition !== "function") {
      throw new Error("Molotov blast drop velocity requires grid.getCellPosition.");
    }
    var blastCenter = requireFinitePoint(
      grid.getCellPosition(active.row, active.col),
      "Molotov blast center"
    );
    var cellCenter = requireFinitePoint(
      grid.getCellPosition(cell.row, cell.col),
      "Molotov blasted cell"
    );
    var dx = cellCenter.x - blastCenter.x;
    var dy = cellCenter.y - blastCenter.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (!isFinite(distance) || distance <= 0) {
      throw new Error("Molotov blast drop velocity requires non-zero blast direction.");
    }
    var maxDistance = requirePositiveFiniteNumber(BoardLayout.cellWidth, "Molotov blast cell width") * active.blastRadius;
    var distanceRatio = Math.max(0, Math.min(1, distance / maxDistance));
    var speed = MOLOTOV_BLAST_DROP_INNER_SPEED -
      (MOLOTOV_BLAST_DROP_INNER_SPEED - MOLOTOV_BLAST_DROP_OUTER_SPEED) * distanceRatio;
    return {
      x: dx / distance * speed,
      y: dy / distance * speed
    };
  }

  function resolveNextEliminationDelayMs(resolution) {
    if (!resolution || !Array.isArray(resolution.eliminationSequence)) {
      throw new Error("Molotov elimination presentation requires resolution.eliminationSequence.");
    }

    var maxDelayMs = -ELIMINATION_SEQUENCE_INTERVAL_MS;
    resolution.eliminationSequence.forEach(function (entry) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("Molotov elimination presentation sequence entry must be an object.");
      }
      var delayMs = Number(entry.delayMs);
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error("Molotov elimination presentation delayMs must be non-negative.");
      }
      if (delayMs > maxDelayMs) {
        maxDelayMs = delayMs;
      }
    });
    return maxDelayMs + ELIMINATION_SEQUENCE_INTERVAL_MS;
  }

  function appendMolotovEliminationSequence(resolution, cells, grid) {
    if (!resolution || !Array.isArray(resolution.eliminationSequence)) {
      throw new Error("Molotov elimination presentation requires resolution.eliminationSequence.");
    }
    if (!Array.isArray(cells)) {
      throw new Error("Molotov elimination presentation requires cells array.");
    }
    if (!grid || typeof grid.getCellPosition !== "function") {
      throw new Error("Molotov elimination presentation requires grid.getCellPosition.");
    }

    var sequenceCellIds = {};
    resolution.eliminationSequence.forEach(function (entry) {
      if (!entry || (typeof entry.cellId !== "string" && typeof entry.cellId !== "number")) {
        throw new Error("Molotov elimination presentation sequence entry requires cellId.");
      }
      sequenceCellIds[String(entry.cellId)] = true;
    });

    var nextDelayMs = resolveNextEliminationDelayMs(resolution);
    cells.forEach(function (cell) {
      if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
        throw new Error("Molotov elimination presentation requires removed cell id.");
      }
      if (cell.entityCategory !== "normal_ball") {
        return;
      }
      if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
        throw new Error("Molotov elimination presentation requires cell coordinates: " + cell.id);
      }
      var cellId = String(cell.id);
      if (sequenceCellIds[cellId]) {
        return;
      }

      var worldPosition = requireFinitePoint(
        grid.getCellPosition(cell.row, cell.col),
        "Molotov elimination presentation cell"
      );
      resolution.eliminationSequence.push({
        cellId: cell.id,
        row: cell.row,
        col: cell.col,
        worldPosition: {
          x: worldPosition.x,
          y: worldPosition.y
        },
        removeType: "molotov_blast",
        points: 0,
        delayMs: nextDelayMs
      });
      sequenceCellIds[cellId] = true;
      nextDelayMs += ELIMINATION_SEQUENCE_INTERVAL_MS;
    });
  }

  function buildTriggeredSplitterIdsFromPendingSpawns(pendingSplitterSpawns) {
    if (!Array.isArray(pendingSplitterSpawns)) {
      throw new Error("Molotov splitter dedup requires pendingSplitterSpawns array.");
    }
    var triggeredSplitterIds = {};
    pendingSplitterSpawns.forEach(function (pending) {
      if (!pending || typeof pending !== "object" || Array.isArray(pending)) {
        throw new Error("Molotov splitter dedup requires pending splitter entry.");
      }
      if (typeof pending.id !== "string" && typeof pending.id !== "number") {
        throw new Error("Molotov splitter dedup requires pending splitter id.");
      }
      triggeredSplitterIds[pending.id] = true;
    });
    return triggeredSplitterIds;
  }

  return {
    _resetComboStreak: function () {
      this.comboStreak = 0;
    },

    _getMatchedDropScorePerBallForNextCombo: function (matchedRuleKey) {
      if (typeof matchedRuleKey !== "undefined" && (typeof matchedRuleKey !== "string" || !matchedRuleKey)) {
        throw new Error("Matched combo score rule key must be a non-empty string.");
      }
      var ruleKey = typeof matchedRuleKey === "undefined" ? "matchedDrop" : matchedRuleKey;
      var baseScore = this._getScoreRule(ruleKey);
      if (!Number.isInteger(baseScore) || baseScore < 0) {
        throw new Error("Matched drop score rule must be a non-negative integer.");
      }
      if (!Number.isInteger(this.comboStreak) || this.comboStreak < 0) {
        throw new Error("Combo streak must be a non-negative integer.");
      }
      if (!Number.isInteger(COMBO_BONUS_PER_HIT) || COMBO_BONUS_PER_HIT <= 0) {
        throw new Error("Combo bonus per hit must be a positive integer.");
      }

      return baseScore + this.comboStreak * COMBO_BONUS_PER_HIT;
    },

    _resolveComboAttachAnchor: function (resolution) {
      if (!resolution) {
        throw new Error("Combo attach anchor requires resolution.");
      }

      var attachedCell = resolution.attachedCell;
      if (
        attachedCell &&
        Number.isInteger(attachedCell.row) &&
        Number.isInteger(attachedCell.col)
      ) {
        return {
          row: attachedCell.row,
          col: attachedCell.col
        };
      }

      var impact = resolution.impact;
      if (
        impact &&
        impact.center &&
        typeof impact.center.x === "number" &&
        isFinite(impact.center.x) &&
        typeof impact.center.y === "number" &&
        isFinite(impact.center.y)
      ) {
        return {
          x: impact.center.x,
          y: impact.center.y
        };
      }

      var blastExplosions = resolution.blastExplosions;
      if (Array.isArray(blastExplosions) && blastExplosions.length) {
        var blastExplosion = blastExplosions[0];
        if (
          !blastExplosion ||
          !Number.isInteger(blastExplosion.row) ||
          !Number.isInteger(blastExplosion.col)
        ) {
          throw new Error("Combo blast attach anchor requires blast explosion row and col.");
        }
        return {
          row: blastExplosion.row,
          col: blastExplosion.col
        };
      }

      throw new Error("Combo attach anchor requires resolution.attachedCell or impact.center.");
    },

    _registerComboElimination: function (resolution) {
      if (!resolution) {
        throw new Error("Combo registration requires resolution.");
      }

      var matchedCount = Array.isArray(resolution.matched) ? resolution.matched.length : 0;
      var floatingCount = Array.isArray(resolution.floating) ? resolution.floating.length : 0;
      if (matchedCount + floatingCount <= 0) {
        return;
      }

      this.comboStreak += 1;
      if (this.comboStreak > this.maxComboStreak) {
        this.maxComboStreak = this.comboStreak;
      }
      if (this.comboStreak < 2) {
        return;
      }

      var comboDisplay = this.comboStreak - 1;
      var comboBonusAlreadyApplied = resolution.comboMatchedScoreBonusApplied === true;
      var bonusGained = comboBonusAlreadyApplied
        ? resolution.comboMatchedScoreBonus
        : COMBO_BONUS_PER_HIT;
      if (!Number.isInteger(bonusGained) || bonusGained <= 0) {
        throw new Error("Combo bonus gained must be a positive integer.");
      }
      if (!comboBonusAlreadyApplied) {
        this.score += bonusGained;
        resolution.scoreDelta += bonusGained;
      }

      if (typeof this._pushRuntimeEvent === "function") {
        var attachAnchor = this._resolveComboAttachAnchor(resolution);
        var comboEventPayload = {
          combo_display: comboDisplay,
          combo_streak: this.comboStreak,
          bonus_gained: bonusGained
        };
        if (Object.prototype.hasOwnProperty.call(attachAnchor, "row")) {
          comboEventPayload.attach_row = attachAnchor.row;
          comboEventPayload.attach_col = attachAnchor.col;
        } else {
          comboEventPayload.attach_x = attachAnchor.x;
          comboEventPayload.attach_y = attachAnchor.y;
        }
        this._pushRuntimeEvent("combo_bonus_awarded", comboEventPayload);
      }

      Logger.info("Combo bonus", {
        comboDisplay: comboDisplay,
        comboStreak: this.comboStreak,
        bonusGained: bonusGained
      });
    },

    _applyJarCollectionScore: function (collectedDrops) {
      if (!collectedDrops || !collectedDrops.length) {
        return 0;
      }

      var jarColors = this.systems.jarCollectorSystem && Array.isArray(this.systems.jarCollectorSystem.jarColors)
        ? this.systems.jarCollectorSystem.jarColors
        : [];
      var scoredDrops = collectedDrops.filter(function (drop) {
        return !!(drop && typeof drop.color === "string" && jarColors.indexOf(drop.color) !== -1);
      });

      if (!scoredDrops.length) {
        return 0;
      }

      var jarCollectBase = this._getScoreRule("jarCollectBase");
      var jarCount = this.systems.jarCollectorSystem.jarCount;
      var scoreBoostMultiplier = this.jarScoreBoostActive
        ? Math.max(1, Number(this.jarScoreBoostMultiplier) || 1)
        : 1;
      var isScoreBoosted = scoreBoostMultiplier > 1;
      var computeDropPoints = function (drop) {
        var baseScore = JarScoreConfig.getBaseScoreForJarIndex(jarCount, drop.jarIndex);
        var sameColorMultiplier = typeof drop.bonusMultiplier === "number" ? Math.max(1, drop.bonusMultiplier) : 1;
        if (typeof drop.fairyMultiplier !== "number" || !isFinite(drop.fairyMultiplier) || drop.fairyMultiplier < 1) {
          throw new Error("Scored jar drop requires fairyMultiplier >= 1.");
        }
        var multiplier = sameColorMultiplier * drop.fairyMultiplier * scoreBoostMultiplier;
        return Math.round(baseScore * multiplier);
      };
      var gainedByJarIndex = {};
      var gained = 0;
      scoredDrops.forEach(function (drop) {
        if (typeof drop.jarIndex !== "number" || !Number.isInteger(drop.jarIndex) || drop.jarIndex < 0) {
          throw new Error("Scored jar drop requires non-negative integer jarIndex.");
        }
        var dropPoints = computeDropPoints(drop);
        gained += dropPoints;
        gainedByJarIndex[drop.jarIndex] = (gainedByJarIndex[drop.jarIndex] || 0) + dropPoints;
      });
      var jarScoreEntries = Object.keys(gainedByJarIndex).map(function (jarIndexKey) {
        return {
          jar_index: Number(jarIndexKey),
          gained: gainedByJarIndex[jarIndexKey]
        };
      });
      jarScoreEntries.sort(function (left, right) {
        return left.jar_index - right.jar_index;
      });
      var scoredDropEntries = scoredDrops.map(function (drop) {
        var baseScore = JarScoreConfig.getBaseScoreForJarIndex(jarCount, drop.jarIndex);
        return {
          drop_id: drop.id,
          jar_index: drop.jarIndex,
          base_score: baseScore,
          same_color_multiplier: drop.bonusMultiplier,
          fairy_multiplier: drop.fairyMultiplier,
          score_boost_multiplier: scoreBoostMultiplier,
          final_score: computeDropPoints(drop)
        };
      });
      var stoneDropEntries = collectedDrops.filter(function (drop) {
        return drop && drop.entityCategory === "obstacle_ball" && drop.entityType === "stone";
      }).map(function (drop) {
        return {
          drop_id: drop.id,
          jar_index: drop.jarIndex,
          base_score: 0,
          same_color_multiplier: 1,
          fairy_multiplier: 1,
          score_boost_multiplier: 1,
          final_score: 0
        };
      });
      if (stoneDropEntries.length) {
        Array.prototype.push.apply(scoredDropEntries, stoneDropEntries);
      }
      var sameColorCount = scoredDrops.reduce(function (count, drop) {
        return count + (drop.sameColor && drop.scoreOnly !== true ? 1 : 0);
      }, 0);
      var bonusGained = scoredDrops.reduce(function (sum, drop) {
        var baseScore = JarScoreConfig.getBaseScoreForJarIndex(jarCount, drop.jarIndex);
        var total = computeDropPoints(drop);
        return sum + Math.max(0, total - baseScore);
      }, 0);

      this.score += gained;
      this.sameColorJarCollected += sameColorCount;
      this.sameColorJarBonusScore += bonusGained;

      if (this.lastResolution) {
        this.lastResolution.scoreDelta += gained;
      }
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("jar_collect_scored", {
          count: scoredDrops.length,
          gained: gained,
          entries: jarScoreEntries,
          drop_entries: scoredDropEntries,
          is_score_boosted: isScoreBoosted,
          boost_multiplier: scoreBoostMultiplier
        });
      }

      Logger.info("Jar collect", {
        count: scoredDrops.length,
        gained: gained,
        sameColorCount: sameColorCount,
        bonusGained: bonusGained,
        isScoreBoosted: isScoreBoosted,
        scoreBoostMultiplier: scoreBoostMultiplier
      });

      return gained;
    },

    _applyResolutionDropScore: function (resolution, matchedRuleKey, options) {
      if (!resolution) {
        return 0;
      }

      var scoreOptions = {};
      if (typeof options !== "undefined") {
        if (!options || typeof options !== "object" || Array.isArray(options)) {
          throw new Error("Resolution drop score options must be an object.");
        }
        scoreOptions = options;
      }
      if (typeof matchedRuleKey !== "undefined" && (typeof matchedRuleKey !== "string" || !matchedRuleKey)) {
        throw new Error("Matched score rule key must be a non-empty string.");
      }
      var ruleKey = typeof matchedRuleKey === "undefined" ? "matchedDrop" : matchedRuleKey;
      var matchedCount = Array.isArray(resolution.matched) ? resolution.matched.length : 0;
      var floatingCount = Array.isArray(resolution.floating) ? resolution.floating.length : 0;
      var baseMatchedScorePerBall = this._getScoreRule(ruleKey);
      if (!Number.isInteger(baseMatchedScorePerBall) || baseMatchedScorePerBall < 0) {
        throw new Error("Matched drop score rule must be a non-negative integer.");
      }
      var matchedScorePerBall = Object.prototype.hasOwnProperty.call(scoreOptions, "matchedScorePerBall")
        ? scoreOptions.matchedScorePerBall
        : baseMatchedScorePerBall;
      if (!Number.isInteger(matchedScorePerBall) || matchedScorePerBall < baseMatchedScorePerBall) {
        throw new Error("Matched score per ball must be an integer not lower than the base score.");
      }
      var matchedScore = matchedCount * matchedScorePerBall;
      var floatingScore = floatingCount * this._getScoreRule("floatingDrop");
      var gained = matchedScore + floatingScore;
      if (gained <= 0) {
        return 0;
      }

      var comboMatchedScoreBonus = matchedCount * (matchedScorePerBall - baseMatchedScorePerBall);
      resolution.comboMatchedScoreBonus = comboMatchedScoreBonus;
      resolution.comboMatchedScoreBonusApplied = comboMatchedScoreBonus > 0;
      resolution.matchedScorePerBall = matchedScorePerBall;
      this.score += gained;
      resolution.scoreDelta += gained;

      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("drop_score_awarded", {
          matched: matchedCount,
          floating: floatingCount,
          matched_score_per_ball: matchedScorePerBall,
          gained: gained
        });
      }

      Logger.info("Drop score", {
        matched: matchedCount,
        floating: floatingCount,
        matchedScorePerBall: matchedScorePerBall,
        gained: gained
      });

      return gained;
    },

    _scheduleBoardViewportSettle: function (resolution) {
      var viewport = this.systems.boardViewportSystem;
      var grid = this.systems.bubbleGrid;
      if (!viewport || !grid) {
        throw new Error("Board viewport settle requires BoardViewportSystem and BubbleGrid.");
      }
      if (viewport.introActive) {
        return false;
      }
      var boardSnapshot = grid.snapshot();
      viewport.planSettle(boardSnapshot);
      if (resolution) {
        resolution.boardViewportAdjusted = viewport.isMoving();
      }
      if (viewport.isMoving() && typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("board_view_move_started", {
          targetOffsetY: viewport.targetOffsetY
        });
      }
      return viewport.isMoving();
    },

    _onBoardViewportMoveFinished: function () {
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("board_view_move_finished", {});
      }
    },

    _tryTopAnchorCollapse: function () {
      if (this.state !== "running" && this.state !== "out_of_shots_pending") {
        return false;
      }
      var grid = this.systems.bubbleGrid;
      var cells = grid.getCells();
      var wormholeCount = cells.filter(function (cell) {
        return cell && cell.entityCategory === "reactive_ball" && cell.entityType === "wormhole";
      }).length;
      if (wormholeCount !== 0 && wormholeCount !== 2) {
        throw new Error("Top anchor collapse requires exactly two live wormholes.");
      }
      if (!cells.length) {
        return false;
      }
      if (!Number.isInteger(grid.maxColumns) || grid.maxColumns <= 0) {
        throw new Error("Top anchor collapse requires positive integer bubbleGrid.maxColumns.");
      }
      if (!BoardViewportSystem.shouldTriggerTopAnchorCollapse(cells, grid.maxColumns)) {
        return false;
      }
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("top_anchor_collapse_started", {
          topRowCount: BoardViewportSystem.countTopRowOccupied(cells),
          topRowEmptySlots: BoardViewportSystem.countTopRowEmptySlots(cells, grid.maxColumns)
        });
      }
      var collapsibleCells = cells.filter(function (cell) {
        return !(cell && cell.entityCategory === "reactive_ball" && cell.entityType === "wormhole");
      });
      var removedCells = grid.removeFloatingCells(collapsibleCells);
      if (removedCells.length !== collapsibleCells.length) {
        throw new Error("Top anchor collapse must remove every non-wormhole board cell.");
      }
      this._cancelPendingSplitterSpawnsForDroppedCells(removedCells);
      if (this.lastResolution) {
        this.lastResolution.topAnchorCollapse = true;
        this._appendUniqueCells(this.lastResolution.floating, removedCells);
      }
      this._registerResolutionDrops(removedCells, grid, this.lastResolution, {
        dropKind: "victory_board_drop"
      }, {
        skipEliminationPresentationHold: true
      });
      this.state = "won_pending";
      return true;
    },

    _ensureMinimumVisibleBoardRows: function (resolution) {
      if (this._tryTopAnchorCollapse()) {
        return true;
      }
      if (this.state !== "running" && this.state !== "out_of_shots_pending") {
        return false;
      }
      return this._scheduleBoardViewportSettle(resolution);
    },

    _refreshShotPlan: function (force) {
      if (this.state !== "running" || this.activeProjectile || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingSwirlRotation() || this._hasPendingWormholeShift() || this._hasPendingVineCast()) {
        this.pendingShotPlan = null;
        return;
      }

      if (!force && !this.isAiming) {
        this.pendingShotPlan = null;
        return;
      }

      var shooterController = this.systems.shooterController;
      var cacheKey = this._buildShotPlanCacheKey({
        aim: {
          origin: shooterController.origin,
          direction: shooterController.aimDirection
        }
      });

      if (this.trajectoryCacheKey === cacheKey && this.trajectoryCachePlan) {
        this.pendingShotPlan = this.trajectoryCachePlan;
        return;
      }

      var planned = this.systems.trajectoryPredictor.predictShotPlan(
        this.systems.bubbleGrid,
        shooterController.origin,
        shooterController.aimDirection
      );

      if (planned && planned.valid) {
        if (planned.collidedCell) {
          planned.collidedCellPosition = this.systems.bubbleGrid.getCellPosition(
            planned.collidedCell.row,
            planned.collidedCell.col
          );
        }
        planned.pathPoints = buildProjectilePathFromShotPlan(planned);
        planned.totalDistance = measurePathDistance(planned.pathPoints);
      }

      this.pendingShotPlan = planned || null;
      this.trajectoryCacheKey = cacheKey;
      this.trajectoryCachePlan = planned || null;
    },

    _buildShotPlanCacheKey: function (shooterSnapshot) {
      var aim = shooterSnapshot && shooterSnapshot.aim ? shooterSnapshot.aim : { origin: { x: 0, y: 0 }, direction: { x: 0, y: 1 } };
      var direction = aim.direction || { x: 0, y: 1 };
      var origin = aim.origin || { x: 0, y: 0 };
      var grid = this.systems.bubbleGrid;
      var quantizedDX = quantize(direction.x, 0.001).toFixed(3);
      var quantizedDY = quantize(direction.y, 0.001).toFixed(3);
      var quantizedOX = quantize(origin.x, 0.1).toFixed(1);
      var quantizedOY = quantize(origin.y, 0.1).toFixed(1);

      return [
        grid.version,
        grid.getViewportOffsetY(),
        this.systems.trajectoryPredictor.maxBounces,
        quantizedOX,
        quantizedOY,
        quantizedDX,
        quantizedDY
      ].join("|");
    },

    _buildRainbowAssimilationContext: function (targetCell) {
      var grid = this.systems.bubbleGrid;
      var contactsByKey = {};
      var contactCells = [];
      var candidatesByColor = {};
      var rainbowQueue = [];
      var rainbowVisited = {};

      var addContactCell = function (cell) {
        var key = cell.row + ":" + cell.col;
        if (!contactsByKey[key]) {
          contactsByKey[key] = true;
          contactCells.push(cell);
        }
      };

      var addCandidateCell = function (cell) {
        var position = grid.getCellPosition(cell.row, cell.col);
        var candidate = candidatesByColor[cell.color];
        if (
          !candidate ||
          position.y > candidate.position.y ||
          (position.y === candidate.position.y && position.x < candidate.position.x)
        ) {
          candidatesByColor[cell.color] = {
            color: cell.color,
            sourceCell: cell,
            position: position
          };
        }
      };

      var enqueueRainbowContact = function (cell) {
        var key = cell.row + ":" + cell.col;
        addContactCell(cell);
        if (!rainbowVisited[key]) {
          rainbowVisited[key] = true;
          rainbowQueue.push(cell);
        }
      };

      grid.getNeighborCoordinates(targetCell.row, targetCell.col).forEach(function (coord) {
        var cell = grid.getCell(coord.row, coord.col);
        if (cell) {
          if (typeof cell.color === "string" && cell.color) {
            addContactCell(cell);
            addCandidateCell(cell);
          } else if (isRainbowBall(cell)) {
            enqueueRainbowContact(cell);
          }
        }
      });

      for (var cursor = 0; cursor < rainbowQueue.length; cursor += 1) {
        var rainbowCell = rainbowQueue[cursor];
        grid.getNeighborCoordinates(rainbowCell.row, rainbowCell.col).forEach(function (coord) {
          var cell = grid.getCell(coord.row, coord.col);
          if (cell) {
            if (typeof cell.color === "string" && cell.color) {
              addCandidateCell(cell);
            } else if (isRainbowBall(cell)) {
              enqueueRainbowContact(cell);
            }
          }
        });
      }

      return {
        contactCells: contactCells,
        candidates: Object.keys(candidatesByColor).map(function (color) {
          return candidatesByColor[color];
        })
      };
    },

    _buildRainbowContactCandidates: function (targetCell) {
      return this._buildRainbowAssimilationContext(targetCell).candidates;
    },

    _isRainbowSelfOnlyContact: function (cell) {
      return !!(
        isBlastBall(cell) ||
        (
          cell &&
          cell.entityCategory === "obstacle_ball" &&
          cell.entityType === "stone"
        )
      );
    },

    _selectRandomRainbowAttachColor: function () {
      var level = this.currentLevel && this.currentLevel.level ? this.currentLevel.level : null;
      if (!level || !Array.isArray(level.colors) || !level.colors.length) {
        throw new Error("Rainbow random attach requires level.colors.");
      }
      if (!level.spawnWeights || typeof level.spawnWeights !== "object" || Array.isArray(level.spawnWeights)) {
        throw new Error("Rainbow random attach requires level.spawnWeights.");
      }

      var colors = level.colors.slice();
      var totalWeight = colors.reduce(function (sum, colorCode) {
        var weight = level.spawnWeights[colorCode];
        if (typeof weight !== "number" || weight <= 0) {
          throw new Error("Rainbow random attach spawn weight must be > 0: " + colorCode);
        }

        return sum + weight;
      }, 0);
      var threshold = Math.random() * totalWeight;
      var running = 0;

      for (var i = 0; i < colors.length; i += 1) {
        var colorCode = colors[i];
        running += level.spawnWeights[colorCode];
        if (threshold <= running) {
          return colorCode;
        }
      }

      throw new Error("Rainbow random attach failed to select a color.");
    },

    _getVirtualRainbowColorAt: function (cell, colorByKey) {
      var key = cell.row + ":" + cell.col;
      if (Object.prototype.hasOwnProperty.call(colorByKey, key)) {
        return colorByKey[key];
      }

      var gridCell = this.systems.bubbleGrid.getCell(cell.row, cell.col);
      return gridCell && typeof gridCell.color === "string" ? gridCell.color : null;
    },

    _findVirtualRainbowMatchGroup: function (targetCell, colorByKey) {
      var grid = this.systems.bubbleGrid;
      var targetColor = this._getVirtualRainbowColorAt(targetCell, colorByKey);
      if (!targetColor) {
        throw new Error("Rainbow resolution requires a target color.");
      }

      var queue = [{
        row: targetCell.row,
        col: targetCell.col
      }];
      var visited = {};
      var group = [];

      for (var cursor = 0; cursor < queue.length; cursor += 1) {
        var current = queue[cursor];
        var key = current.row + ":" + current.col;
        if (visited[key]) {
          continue;
        }

        visited[key] = true;
        if (this._getVirtualRainbowColorAt(current, colorByKey) !== targetColor) {
          continue;
        }

        group.push({
          row: current.row,
          col: current.col
        });

        grid.getNeighborCoordinates(current.row, current.col).forEach(function (neighbor) {
          var neighborKey = neighbor.row + ":" + neighbor.col;
          if (visited[neighborKey]) {
            return;
          }

          if (this._getVirtualRainbowColorAt(neighbor, colorByKey) === targetColor) {
            queue.push({
              row: neighbor.row,
              col: neighbor.col
            });
          }
        }, this);
      }

      if (!this.systems.matchSystem || !Number.isInteger(this.systems.matchSystem.matchThreshold)) {
        throw new Error("Rainbow resolution requires MatchSystem.matchThreshold.");
      }

      var threshold = this.systems.matchSystem.matchThreshold;
      return group.length >= threshold ? group : [];
    },

    _evaluateRainbowCandidate: function (targetCell, contactCells, candidate) {
      var colorByKey = {};
      colorByKey[targetCell.row + ":" + targetCell.col] = candidate.color;
      contactCells.forEach(function (cell) {
        colorByKey[cell.row + ":" + cell.col] = candidate.color;
      });

      var matchedCells = this._findVirtualRainbowMatchGroup(targetCell, colorByKey);
      return {
        color: candidate.color,
        sourceCell: candidate.sourceCell,
        position: candidate.position,
        dropCount: matchedCells.length,
        matchedCount: matchedCells.length
      };
    },

    _selectRainbowAssimilation: function (targetCell, collidedCell) {
      if (this._isRainbowSelfOnlyContact(collidedCell)) {
        return {
          color: this._selectRandomRainbowAttachColor(),
          contactCells: [],
          expectedDropCount: 0,
          matchedCount: 0
        };
      }

      var context = this._buildRainbowAssimilationContext(targetCell);
      var contactCells = context.contactCells;
      if (!contactCells.length) {
        return {
          color: this._selectRandomRainbowAttachColor(),
          contactCells: [],
          expectedDropCount: 0,
          matchedCount: 0
        };
      }

      var candidates = context.candidates;
      if (!candidates.length) {
        return {
          color: this._selectRandomRainbowAttachColor(),
          contactCells: contactCells,
          expectedDropCount: 0,
          matchedCount: 0
        };
      }

      var best = null;
      candidates.forEach(function (candidate) {
        var evaluated = this._evaluateRainbowCandidate(targetCell, contactCells, candidate);
        if (
          !best ||
          evaluated.dropCount > best.dropCount ||
          (
            evaluated.dropCount === best.dropCount &&
            (
              evaluated.position.y > best.position.y ||
              (evaluated.position.y === best.position.y && evaluated.position.x < best.position.x)
            )
          )
        ) {
          best = evaluated;
        }
      }, this);

      return {
        color: best.color,
        contactCells: contactCells,
        expectedDropCount: best.dropCount,
        matchedCount: best.matchedCount
      };
    },

    _resolveRainbowShot: function (projectile, targetCell) {
      var grid = this.systems.bubbleGrid;
      var collidedCell = projectile && projectile.shotPlan ? projectile.shotPlan.collidedCell : null;
      var assimilation = this._selectRainbowAssimilation(targetCell, collidedCell);
      grid.addBubble(targetCell, assimilation.color);
      assimilation.contactCells.forEach(function (cell) {
        grid.addBubble({
          row: cell.row,
          col: cell.col
        }, assimilation.color);
      });

      var attachedBubble = grid.getCell(targetCell.row, targetCell.col);
      return this._resolveAttachment(attachedBubble);
    },

    _injectCollectedSkillBalls: function (collectedDrops) {
      var skillCells = (collectedDrops || []).filter(function (cell) {
        return isSkillBall(cell) && (cell.entityType === "rainbow" || cell.entityType === "blast");
      });
      if (!skillCells.length) {
        return 0;
      }

      var resolution = this.lastResolution;
      if (!resolution || !Array.isArray(resolution.injectedSkills)) {
        return 0;
      }

      skillCells.sort(function (a, b) {
        var leftJar = typeof a.jarIndex === "number" ? a.jarIndex : -1;
        var rightJar = typeof b.jarIndex === "number" ? b.jarIndex : -1;
        if (leftJar !== rightJar) {
          return leftJar - rightJar;
        }

        return String(a.id || "").localeCompare(String(b.id || ""));
      });

      var injectedCount = 0;
      skillCells.forEach(function (cell) {
        var receiveResult = this.systems.shooterController.addSkillInventory(cell.entityType, 1);
        if (receiveResult && receiveResult.accepted) {
          resolution.injectedSkills.push({
            id: cell.id,
            entityType: cell.entityType,
            status: "stored",
            total: receiveResult.total,
            jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1
          });
          if (typeof this._pushRuntimeEvent === "function") {
            this._pushRuntimeEvent("skill_powerup_collected", {
              entityType: cell.entityType,
              sourceId: cell.id,
              total: receiveResult.total,
              jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1
            });
          }
          injectedCount += 1;
        }
      }, this);

      return injectedCount;
    },

    _appendUniqueCells: function (target, cells) {
      var seen = {};
      (target || []).forEach(function (cell) {
        if (cell) {
          seen[cell.row + ":" + cell.col + ":" + cell.id] = true;
        }
      });
      (cells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }
        var key = cell.row + ":" + cell.col + ":" + cell.id;
        if (seen[key]) {
          return;
        }
        seen[key] = true;
        target.push(cell);
      });
      return target;
    },

    _findMatchedBallCollectionObjective: function () {
      if (typeof listCollectionRewardObjectives !== "function") {
        throw new Error("Matched objective collection requires listCollectionRewardObjectives.");
      }
      var objectives = listCollectionRewardObjectives(this.currentLevel);
      for (var index = 0; index < objectives.length; index += 1) {
        var objective = objectives[index];
        if (objective && (objective.type === "collect_any" || objective.type === "collect_color")) {
          return objective;
        }
      }
      return null;
    },

    _buildMatchedObjectiveCollectionEntries: function (collectedCells, eliminationSequence, grid) {
      if (!Array.isArray(collectedCells)) {
        throw new Error("Matched objective collection entries require collected cells array.");
      }
      if (!Array.isArray(eliminationSequence)) {
        throw new Error("Matched objective collection entries require eliminationSequence array.");
      }
      if (grid !== undefined && (!grid || typeof grid.getCellPosition !== "function")) {
        throw new Error("Matched objective collection entries require grid.getCellPosition when grid is provided.");
      }

      var sequenceByCellId = {};
      eliminationSequence.forEach(function (entry) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error("Matched objective collection sequence entry must be an object.");
        }
        if (typeof entry.cellId !== "string" && typeof entry.cellId !== "number") {
          throw new Error("Matched objective collection sequence entry requires cellId.");
        }
        sequenceByCellId[String(entry.cellId)] = entry;
      });

      return collectedCells.map(function (cell) {
        if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
          throw new Error("Matched objective collected cell requires id.");
        }
        var sequenceEntry = sequenceByCellId[String(cell.id)];
        if (!sequenceEntry) {
          if (!grid) {
            throw new Error("Matched objective collected cell missing elimination sequence: " + cell.id);
          }
          var cellPosition = requireFinitePoint(
            grid.getCellPosition(cell.row, cell.col),
            "Matched objective collected cell"
          );
          return {
            id: cell.id,
            color: cell.color,
            row: cell.row,
            col: cell.col,
            worldPosition: {
              x: cellPosition.x,
              y: cellPosition.y
            },
            delayMs: 0
          };
        }
        if (
          !sequenceEntry.worldPosition ||
          typeof sequenceEntry.worldPosition.x !== "number" ||
          typeof sequenceEntry.worldPosition.y !== "number" ||
          !isFinite(sequenceEntry.worldPosition.x) ||
          !isFinite(sequenceEntry.worldPosition.y)
        ) {
          throw new Error("Matched objective collection requires sequence worldPosition: " + cell.id);
        }

        return {
          id: cell.id,
          color: cell.color,
          row: cell.row,
          col: cell.col,
          worldPosition: {
            x: sequenceEntry.worldPosition.x,
            y: sequenceEntry.worldPosition.y
          },
          delayMs: sequenceEntry.delayMs
        };
      });
    },

    _registerMatchedObjectiveCollection: function (matchedCells, eliminationSequence, resolution, grid) {
      if (!resolution) {
        throw new Error("Matched objective collection requires resolution.");
      }
      if (!Array.isArray(matchedCells)) {
        throw new Error("Matched objective collection requires matched cells array.");
      }
      if (!Array.isArray(resolution.matchedObjectiveCollected)) {
        throw new Error("Resolution requires matchedObjectiveCollected array.");
      }

      var objective = this._findMatchedBallCollectionObjective();
      if (!objective) {
        return [];
      }
      var jarCollectorSystem = this.systems.jarCollectorSystem;
      if (!jarCollectorSystem || typeof jarCollectorSystem.collectEliminatedObjectiveCells !== "function") {
        throw new Error("Matched objective collection requires JarCollectorSystem.collectEliminatedObjectiveCells.");
      }

      var alreadyCollected = {};
      resolution.matchedObjectiveCollected.forEach(function (entry) {
        if (!entry || (typeof entry.id !== "string" && typeof entry.id !== "number")) {
          throw new Error("Resolution matchedObjectiveCollected entry requires id.");
        }
        alreadyCollected[String(entry.id)] = true;
      });
      var pendingCells = matchedCells.filter(function (cell) {
        if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
          throw new Error("Matched objective collection matched cell requires id.");
        }
        return alreadyCollected[String(cell.id)] !== true;
      });
      if (!pendingCells.length) {
        return [];
      }

      var collectedCells = jarCollectorSystem.collectEliminatedObjectiveCells(pendingCells, objective);
      if (!collectedCells.length) {
        return [];
      }

      var eventEntries = this._buildMatchedObjectiveCollectionEntries(collectedCells, eliminationSequence, grid);
      resolution.matchedObjectiveCollected = resolution.matchedObjectiveCollected.concat(eventEntries);
      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("matched_objective_collect", {
          objectiveType: objective.type,
          objectiveColor: objective.type === "collect_color" ? objective.color : null,
          count: eventEntries.length,
          entries: eventEntries
        });
      }
      return eventEntries;
    },

    _splitMolotovDropCandidates: function (cells) {
      if (!Array.isArray(cells)) {
        throw new Error("Molotov drop candidate split requires cells array.");
      }
      var immediate = [];
      for (var index = 0; index < cells.length; index += 1) {
        var cell = cells[index];
        if (!cell) {
          throw new Error("Molotov drop candidate cell is required.");
        }
        if (isKeyBall(cell)) {
          continue;
        }
        immediate.push(cell);
      }
      return {
        immediate: immediate
      };
    },

    _buildThawedFloatingIceDropCell: function (cell) {
      if (!isIceBall(cell)) {
        throw new Error("Thawed floating ice drop requires ice obstacle cell.");
      }
      var innerColor = resolveIceInnerColor(cell);
      if (typeof innerColor !== "string" || !innerColor) {
        throw new Error("Thawed floating ice drop requires innerColor.");
      }

      var thawedDropCell = clone(cell);
      thawedDropCell.entityCategory = "normal_ball";
      thawedDropCell.entityType = null;
      thawedDropCell.color = innerColor;
      thawedDropCell.iceSnowballAlreadyCollected = true;
      return thawedDropCell;
    },

    _prepareResolutionDropCells: function (cells, resolution) {
      if (!Array.isArray(cells)) {
        throw new Error("Resolution drop preparation requires cells array.");
      }

      var immediateCells = [];
      var delayedIceDropCells = [];

      cells.forEach(function (cell) {
        if (!cell) {
          throw new Error("Resolution drop preparation requires cell.");
        }
        if (!isIceBall(cell)) {
          immediateCells.push(cell);
          return;
        }
        if (!resolution) {
          throw new Error("Resolution drop preparation requires resolution when ice cells are present.");
        }
        if (typeof this._registerIceCollection !== "function") {
          throw new Error("Resolution drop preparation requires _registerIceCollection for ice cells.");
        }

        var innerColor = resolveIceInnerColor(cell);
        if (typeof innerColor !== "string" || !innerColor) {
          throw new Error("Floating ice drop requires innerColor.");
        }

        resolution.iceCollected += this._registerIceCollection([cell]);
        if (!Array.isArray(resolution.thawed)) {
          resolution.thawed = [];
        }
        resolution.thawed.push({
          id: cell.id,
          row: cell.row,
          col: cell.col,
          color: innerColor
        });
        delayedIceDropCells.push(this._buildThawedFloatingIceDropCell(cell));
      }, this);

      return {
        immediate: immediateCells,
        delayedIce: delayedIceDropCells
      };
    },

    _buildResolutionDropRegisterOptions: function (resolution, dropOptions, timingOptions) {
      if (
        dropOptions !== undefined &&
        (
          !dropOptions ||
          typeof dropOptions !== "object" ||
          Array.isArray(dropOptions)
        )
      ) {
        throw new Error("Resolution drop registration dropOptions must be an object when provided.");
      }
      if (
        timingOptions !== undefined &&
        (
          !timingOptions ||
          typeof timingOptions !== "object" ||
          Array.isArray(timingOptions)
        )
      ) {
        throw new Error("Resolution drop registration timingOptions must be an object when provided.");
      }

      var matchedCellsForDelay = timingOptions && timingOptions.matchedCellsForDelay;
      if (
        matchedCellsForDelay !== undefined &&
        (!Array.isArray(matchedCellsForDelay) || !matchedCellsForDelay.length)
      ) {
        throw new Error("Resolution drop registration matchedCellsForDelay must be a non-empty array when provided.");
      }

      var skipEliminationPresentationHold = !!(
        timingOptions &&
        Object.prototype.hasOwnProperty.call(timingOptions, "skipEliminationPresentationHold")
      );
      if (skipEliminationPresentationHold && timingOptions.skipEliminationPresentationHold !== true) {
        throw new Error("Resolution drop registration skipEliminationPresentationHold must be true when provided.");
      }

      var requiresEliminationHold = skipEliminationPresentationHold
        ? false
        : EliminationSequenceBuilder.resolveRequiresEliminationPresentationHold(
          resolution,
          matchedCellsForDelay
        );
      var baseDelay = 0;
      if (dropOptions && Object.prototype.hasOwnProperty.call(dropOptions, "startDelay")) {
        if (
          typeof dropOptions.startDelay !== "number" ||
          !Number.isFinite(dropOptions.startDelay) ||
          dropOptions.startDelay < 0
        ) {
          throw new Error("Resolution drop registration dropOptions.startDelay must be a non-negative number.");
        }
        baseDelay = dropOptions.startDelay;
      }

      var registerOptions = dropOptions ? Object.assign({}, dropOptions) : {};
      registerOptions.startDelay = baseDelay;
      if (requiresEliminationHold) {
        registerOptions.holdUntilEliminationPresentationComplete = true;
      }
      return registerOptions;
    },

    _registerResolutionDrops: function (cells, grid, resolution, dropOptions, timingOptions) {
      if (!Array.isArray(cells)) {
        throw new Error("Resolution drop registration requires cells array.");
      }
      if (
        dropOptions !== undefined &&
        (
          !dropOptions ||
          typeof dropOptions !== "object" ||
          Array.isArray(dropOptions)
        )
      ) {
        throw new Error("Resolution drop registration dropOptions must be an object when provided.");
      }
      if (
        timingOptions !== undefined &&
        (
          !timingOptions ||
          typeof timingOptions !== "object" ||
          Array.isArray(timingOptions)
        )
      ) {
        throw new Error("Resolution drop registration timingOptions must be an object when provided.");
      }

      var pendingCells = cells.filter(function (cell) {
        if (!cell) {
          throw new Error("Resolution drop registration requires cell.");
        }
        return cell.__resolutionDropRegistered !== true;
      });
      if (!pendingCells.length) {
        return;
      }

      var prepared = this._prepareResolutionDropCells(pendingCells, resolution);
      var registerOptions = this._buildResolutionDropRegisterOptions(resolution, dropOptions, timingOptions);
      var immediateCandidates = this._splitMolotovDropCandidates(prepared.immediate);
      if (immediateCandidates.immediate.length) {
        this.systems.fallingMarbleSystem.registerDrops(
          immediateCandidates.immediate,
          grid,
          registerOptions
        );
        immediateCandidates.immediate.forEach(function (cell) {
          cell.__resolutionDropRegistered = true;
        });
      }

      if (prepared.delayedIce.length) {
        var delayedCandidates = this._splitMolotovDropCandidates(prepared.delayedIce);
        if (delayedCandidates.immediate.length) {
          var delayedIceRegisterOptions = this._buildResolutionDropRegisterOptions(
            resolution,
            { startDelay: FLOATING_ICE_DROP_DELAY },
            timingOptions
          );
          this.systems.fallingMarbleSystem.registerDrops(
            delayedCandidates.immediate,
            grid,
            delayedIceRegisterOptions
          );
          delayedCandidates.immediate.forEach(function (cell) {
            cell.__resolutionDropRegistered = true;
          });
        }
      }
    },

    _resolveFairyAssistsAfterResolution: function (resolution) {
      if (!resolution || !Array.isArray(resolution.fairyAssistEvents)) {
        throw new Error("Fairy assist resolution requires resolution.fairyAssistEvents.");
      }
      if (resolution.fairyAssistResolved === true) {
        throw new Error("Fairy assist resolution cannot run twice for one shot.");
      }
      if (!this.systems || !this.systems.fairyAssistSystem) {
        throw new Error("Fairy assist resolution requires FairyAssistSystem.");
      }

      resolution.fairyAssistEvents = this.systems.fairyAssistSystem.resolveAfterShot(
        resolution,
        this.systems.bubbleGrid
      );
      this._pushFairyAssistDepartEvents(resolution.fairyAssistEvents);
      resolution.fairyAssistResolved = true;
    },

    _resetMolotovBlastSequence: function () {
      this.pendingMolotovBlastQueue = [];
      this.activeMolotovBlast = null;
      this.molotovBlastTriggeredIds = {};
    },

    _queueMolotovBlasts: function (molotovs, resolution) {
      if (!Array.isArray(molotovs)) {
        throw new Error("Molotov blast queue requires molotovs array.");
      }
      if (!resolution || !Array.isArray(resolution.reactiveTriggered)) {
        throw new Error("Molotov blast queue requires resolution.reactiveTriggered.");
      }
      if (!Array.isArray(this.pendingMolotovBlastQueue)) {
        throw new Error("GameManager pendingMolotovBlastQueue must be an array.");
      }
      if (!this.molotovBlastTriggeredIds || typeof this.molotovBlastTriggeredIds !== "object") {
        throw new Error("GameManager molotovBlastTriggeredIds must be an object.");
      }

      molotovs.forEach(function (molotov) {
        if (!molotov || (typeof molotov.id !== "string" && typeof molotov.id !== "number")) {
          throw new Error("Molotov blast queue requires molotov id.");
        }
        if (this.molotovBlastTriggeredIds[molotov.id]) {
          return;
        }
        var radius = molotov.blastRadius;
        if (!Number.isInteger(radius) || radius !== 2) {
          throw new Error("Molotov blastRadius must be 2.");
        }
        if (!Number.isInteger(molotov.row) || !Number.isInteger(molotov.col)) {
          throw new Error("Molotov blast queue requires molotov coordinates.");
        }
        this.molotovBlastTriggeredIds[molotov.id] = true;
        this.pendingMolotovBlastQueue.push({
          id: molotov.id,
          row: molotov.row,
          col: molotov.col,
          blastRadius: radius
        });
      }, this);

      this._startNextMolotovBlastIfIdle(resolution);
    },

    _startNextMolotovBlastIfIdle: function (resolution) {
      if (this.activeMolotovBlast) {
        return;
      }
      if (!Array.isArray(this.pendingMolotovBlastQueue) || !this.pendingMolotovBlastQueue.length) {
        return;
      }
      if (!resolution || !Array.isArray(resolution.reactiveTriggered)) {
        throw new Error("Molotov blast start requires resolution.reactiveTriggered.");
      }

      var next = this.pendingMolotovBlastQueue.shift();
      if (!next || (typeof next.id !== "string" && typeof next.id !== "number")) {
        throw new Error("Molotov blast start requires pending entry id.");
      }
      if (!Number.isInteger(next.row) || !Number.isInteger(next.col)) {
        throw new Error("Molotov blast start requires pending entry coordinates.");
      }
      if (!Number.isInteger(next.blastRadius) || next.blastRadius !== 2) {
        throw new Error("Molotov blast start requires blastRadius 2.");
      }

      this.activeMolotovBlast = {
        id: next.id,
        row: next.row,
        col: next.col,
        blastRadius: next.blastRadius,
        elapsed: 0,
        blastExecuted: false,
        completeExecuted: false
      };
      resolution.reactiveTriggered.push({
        id: next.id,
        entityType: "molotov",
        row: next.row,
        col: next.col
      });
      this._pushBombExplosionEvent();
      this._executeMolotovBlastPhaseAtAnimationStart(resolution);
    },

    _executeMolotovBlastPhaseAtAnimationStart: function (resolution) {
      if (MOLOTOV_BLAST_TRIGGER_DELAY !== 0) {
        return false;
      }
      if (!this.activeMolotovBlast || this.activeMolotovBlast.blastExecuted) {
        return false;
      }
      if (!this.molotovPendingResolutionContext) {
        return false;
      }
      this.activeMolotovBlast.blastExecuted = true;
      this._executeMolotovBlastPhase(this.activeMolotovBlast, this.systems.bubbleGrid, resolution);
      return true;
    },

    _executeMolotovBlastPhase: function (active, grid, resolution) {
      if (!active || (typeof active.id !== "string" && typeof active.id !== "number")) {
        throw new Error("Molotov blast phase requires active blast id.");
      }
      if (!Number.isInteger(active.row) || !Number.isInteger(active.col)) {
        throw new Error("Molotov blast phase requires active blast coordinates.");
      }
      if (!Number.isInteger(active.blastRadius) || active.blastRadius !== 2) {
        throw new Error("Molotov blast phase requires blastRadius 2.");
      }
      if (!resolution) {
        throw new Error("Molotov blast phase requires resolution.");
      }
      if (!this.molotovPendingResolutionContext || !Array.isArray(this.molotovPendingResolutionContext.allRemoved)) {
        throw new Error("Molotov blast phase requires molotovPendingResolutionContext.allRemoved.");
      }

      var blastCells = [];
      grid.getCoordinatesWithinRadius(active.row, active.col, active.blastRadius).forEach(function (coord) {
        if (coord.distance === 0) {
          return;
        }
        var occupiedCell = grid.getCell(coord.row, coord.col);
        if (!occupiedCell || isLockedBall(occupiedCell)) {
          return;
        }
        blastCells.push(occupiedCell);
      });

      this._resolveVinesHitByExplosion(blastCells, grid, resolution);
      var removableBlastCells = blastCells.filter(function (cell) {
        return !isVineEntangledBall(cell) && !isVineSpiritBall(cell);
      });
      var removedByBlast = grid.removeCells(removableBlastCells);
      this._resolveVinesAfterRemoval(removedByBlast, grid, resolution);
      appendMolotovEliminationSequence(resolution, removedByBlast, grid);
      this._pushBubbleBreakEvent(removedByBlast, resolution.eliminationSequence);
      removedByBlast.forEach(function (cell) {
        cell.__molotovBlastVelocity = buildMolotovBlastDropVelocity(active, cell, grid);
      });

      var removedKeys = this._triggerKeysAndResolveUnlocks(removedByBlast, grid, resolution);
      var triggeredSplitterIds = this.molotovPendingResolutionContext.triggeredSplitterIds;
      if (!triggeredSplitterIds || typeof triggeredSplitterIds !== "object" || Array.isArray(triggeredSplitterIds)) {
        throw new Error("Molotov blast phase requires context.triggeredSplitterIds.");
      }
      this._triggerAdjacentSplitters(removedByBlast, grid, resolution, triggeredSplitterIds);

      var chainMolotovs = this._collectAdjacentMolotovs(removedByBlast, grid, this.molotovBlastTriggeredIds);
      this._queueMolotovBlasts(chainMolotovs, resolution);

      var removedSourceMolotov = [];
      var liveSourceMolotov = grid.getCell(active.row, active.col);
      if (liveSourceMolotov) {
        if (!isMolotovBall(liveSourceMolotov)) {
          throw new Error("Molotov blast source cell is not molotov.");
        }
        removedSourceMolotov = grid.removeCells([liveSourceMolotov]);
        this._resolveVinesAfterRemoval(removedSourceMolotov, grid, resolution);
        appendMolotovEliminationSequence(resolution, removedSourceMolotov, grid);
        this._pushBubbleBreakEvent(removedSourceMolotov, resolution.eliminationSequence);
        this._registerMatchedObjectiveCollection(removedSourceMolotov, resolution.eliminationSequence, resolution, grid);
      }

      this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedKeys);
      this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedByBlast);
      this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedSourceMolotov);
      this._cancelPendingSplitterSpawnsForDroppedCells(removedByBlast.concat(removedKeys).concat(removedSourceMolotov));
      this._registerResolutionDrops(
        removedByBlast.concat(removedKeys),
        grid,
        resolution,
        undefined,
        {
          matchedCellsForDelay: this.molotovPendingResolutionContext.allRemoved.slice()
        }
      );

      resolution.matched = this.molotovPendingResolutionContext.allRemoved.slice();
      resolution.collected = this.molotovPendingResolutionContext.allRemoved.slice();
      this._registerMatchedObjectiveCollection(removedByBlast, resolution.eliminationSequence, resolution, grid);
      this._resolveMolotovFloatingAfterBoardMutation(grid, resolution);
    },

    _completeMolotovBlast: function (active, grid, resolution) {
      if (!active || (typeof active.id !== "string" && typeof active.id !== "number")) {
        throw new Error("Molotov blast completion requires active blast id.");
      }
      if (!Number.isInteger(active.row) || !Number.isInteger(active.col)) {
        throw new Error("Molotov blast completion requires active blast coordinates.");
      }
      if (!resolution) {
        throw new Error("Molotov blast completion requires resolution.");
      }
      if (!this.molotovPendingResolutionContext || !Array.isArray(this.molotovPendingResolutionContext.allRemoved)) {
        throw new Error("Molotov blast completion requires molotovPendingResolutionContext.allRemoved.");
      }

      var liveMolotov = grid.getCell(active.row, active.col);
      if (liveMolotov) {
        if (!isMolotovBall(liveMolotov)) {
          throw new Error("Molotov blast completion cell is not molotov.");
        }
        var removedMolotov = grid.removeCells([liveMolotov]);
        appendMolotovEliminationSequence(resolution, removedMolotov, grid);
        this._pushBubbleBreakEvent(removedMolotov, resolution.eliminationSequence);
        this._appendUniqueCells(this.molotovPendingResolutionContext.allRemoved, removedMolotov);
        resolution.matched = this.molotovPendingResolutionContext.allRemoved.slice();
        resolution.collected = this.molotovPendingResolutionContext.allRemoved.slice();
        this._registerMatchedObjectiveCollection(removedMolotov, resolution.eliminationSequence, resolution, grid);
        this._resolveMolotovFloatingAfterBoardMutation(grid, resolution);
      }
    },

    _updatePendingMolotovBlasts: function (dt) {
      if (!this._hasPendingMolotovBlasts()) {
        return false;
      }
      if (this._isBoardAdvanceBusy()) {
        return false;
      }

      var safeDt = Number(dt);
      if (!Number.isFinite(safeDt) || safeDt < 0) {
        throw new Error("Pending molotov blast update requires non-negative finite dt.");
      }
      if (!this.lastResolution) {
        throw new Error("Pending molotov blast update requires lastResolution.");
      }

      var grid = this.systems.bubbleGrid;
      var resolution = this.lastResolution;
      var updated = false;

      if (!this.activeMolotovBlast) {
        if (!this.pendingMolotovBlastQueue.length && this.molotovResolutionPending) {
          this._finalizeMolotovPendingResolution();
          return true;
        }
        this._startNextMolotovBlastIfIdle(resolution);
        return !!this.activeMolotovBlast;
      }

      var active = this.activeMolotovBlast;
      active.elapsed += safeDt;

      if (!active.blastExecuted && active.elapsed >= MOLOTOV_BLAST_TRIGGER_DELAY) {
        active.blastExecuted = true;
        this._executeMolotovBlastPhase(active, grid, resolution);
        updated = true;
      }

      if (!active.completeExecuted && active.elapsed >= MOLOTOV_BLAST_ANIMATION_DURATION) {
        active.completeExecuted = true;
        this._completeMolotovBlast(active, grid, resolution);
        this.activeMolotovBlast = null;
        updated = true;

        if (this.pendingMolotovBlastQueue.length) {
          this._startNextMolotovBlastIfIdle(resolution);
        } else {
          this._finalizeMolotovPendingResolution();
        }
      }

      if (grid && typeof grid.assertNoVisualOverlap === "function") {
        grid.assertNoVisualOverlap("pending molotov blast");
      }
      return updated;
    },

    _beginMolotovPendingResolution: function (resolution, dropScoreRuleKey, syncRemoved) {
      if (!resolution) {
        throw new Error("Molotov pending resolution requires resolution.");
      }
      if (typeof dropScoreRuleKey !== "string" || !dropScoreRuleKey) {
        throw new Error("Molotov pending resolution requires dropScoreRuleKey.");
      }
      if (!Array.isArray(syncRemoved)) {
        throw new Error("Molotov pending resolution requires syncRemoved array.");
      }

      this.molotovResolutionPending = true;
      this.molotovPendingResolutionContext = {
        dropScoreRuleKey: dropScoreRuleKey,
        allRemoved: syncRemoved.slice(),
        triggeredSplitterIds: {}
      };

      this._cancelPendingSplitterSpawnsForDroppedCells(syncRemoved);
      this.molotovPendingResolutionContext.triggeredSplitterIds = buildTriggeredSplitterIdsFromPendingSpawns(this.pendingSplitterSpawns);
      this.systems.jarCollectorSystem.collect([]);

      appendMolotovEliminationSequence(resolution, syncRemoved, this.systems.bubbleGrid);
      this._pushBubbleBreakEvent(syncRemoved, resolution.eliminationSequence);
      resolution.matched = syncRemoved.slice();
      resolution.collected = syncRemoved.slice();
      this._registerMatchedObjectiveCollection(
        syncRemoved,
        resolution.eliminationSequence,
        resolution,
        this.systems.bubbleGrid
      );
      resolution.boardCleared = false;
      this._executeMolotovBlastPhaseAtAnimationStart(resolution);
    },

    _resolveMolotovFloatingAfterBoardMutation: function (grid, resolution) {
      if (!this.molotovPendingResolutionContext || !Array.isArray(this.molotovPendingResolutionContext.allRemoved)) {
        throw new Error("Molotov floating resolution requires molotovPendingResolutionContext.allRemoved.");
      }
      if (!grid || typeof grid.removeCells !== "function") {
        throw new Error("Molotov floating resolution requires bubble grid.");
      }
      if (!resolution || !Array.isArray(resolution.floating)) {
        throw new Error("Molotov floating resolution requires resolution.floating array.");
      }
      if (!this.systems.supportSystem || typeof this.systems.supportSystem.findFloatingCells !== "function") {
        throw new Error("Molotov floating resolution requires supportSystem.findFloatingCells.");
      }

      var removedAllFloating = [];
      while (true) {
        if (Array.isArray(resolution.collectedKeys) && resolution.collectedKeys.length) {
          this._resolveCollectedKeyUnlocks(grid, resolution);
        }

        var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
        if (!floatingCells.length) {
          break;
        }
        var removedFloating = grid.removeFloatingCells(floatingCells);
        if (!removedFloating.length) {
          throw new Error("Molotov floating resolution found cells that could not be removed.");
        }

        this._appendUniqueCells(removedAllFloating, removedFloating);
        this._appendUniqueCells(resolution.floating, removedFloating);
        this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
        this._cancelPendingSplitterSpawnsForDroppedCells(removedFloating);
        this._removeSpawnedSplitterEntriesForCells(removedFloating, resolution);
        this._registerResolutionDrops(
          removedFloating,
          grid,
          resolution,
          undefined,
          {
            matchedCellsForDelay: this.molotovPendingResolutionContext.allRemoved
          }
        );
        this.systems.jarCollectorSystem.collect([]);
      }
      if (!removedAllFloating.length) {
        return [];
      }
      resolution.collected = this.molotovPendingResolutionContext.allRemoved.concat(resolution.floating);
      return removedAllFloating;
    },

    _finalizeMolotovPendingResolution: function () {
      if (!this.molotovResolutionPending) {
        return;
      }
      var context = this.molotovPendingResolutionContext;
      if (!context || !Array.isArray(context.allRemoved)) {
        throw new Error("Molotov pending resolution finalize requires context.allRemoved.");
      }
      if (typeof context.dropScoreRuleKey !== "string" || !context.dropScoreRuleKey) {
        throw new Error("Molotov pending resolution finalize requires dropScoreRuleKey.");
      }
      if (!this.lastResolution) {
        throw new Error("Molotov pending resolution finalize requires lastResolution.");
      }

      var resolution = this.lastResolution;
      var grid = this.systems.bubbleGrid;
      this._resolveMolotovFloatingAfterBoardMutation(grid, resolution);

      resolution.matched = context.allRemoved.slice();
      resolution.collected = context.allRemoved.concat(resolution.floating);
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, context.dropScoreRuleKey);
      this._registerComboElimination(resolution);

      this.molotovResolutionPending = false;
      this.molotovPendingResolutionContext = null;
      this._resolveFairyAssistsAfterResolution(resolution);

      if (this._beginSwirlRotationForResolution(resolution)) {
        return;
      }
      if (this._beginWormholeShiftForResolution(resolution)) {
        return;
      }
      if (this._beginVineCastForResolution(resolution)) {
        return;
      }

      if (resolution.boardCleared) {
        this._resolveBoardClearedOutcome();
        return;
      }
      if (this._tryTopAnchorCollapse()) {
        return;
      }
      var eliminationPresentationWasComplete = this.pendingBoardAdvanceEliminationPresentation === false;
      if (this._applyPostImpactBoardShiftPolicy(resolution)) {
        if (eliminationPresentationWasComplete) {
          this.notifyBoardAdvanceEliminationPresentationComplete();
        }
        return;
      }
      if (this._scheduleBoardAdvanceAfterImpact()) {
        return;
      }
      if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
        if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingVineCast()) {
          this.state = "out_of_shots_pending";
        } else {
          this._showOutOfShotsAddBallPrompt();
        }
      }
    },

    _cancelPendingSplitterSpawnsForDroppedCells: function (cells) {
      if (!Array.isArray(cells)) {
        throw new Error("Cancel pending splitter spawns requires cells array.");
      }
      if (typeof this._cancelPendingSplitterSpawn !== "function") {
        throw new Error("Cancel pending splitter spawns requires GameManager._cancelPendingSplitterSpawn.");
      }

      for (var index = 0; index < cells.length; index += 1) {
        var cell = cells[index];
        if (!cell) {
          throw new Error("Cancel pending splitter spawns requires cell.");
        }
        if (isSplitterBall(cell)) {
          this._cancelPendingSplitterSpawn(cell);
        }
      }
    },

    _removeSpawnedSplitterEntriesForCells: function (cells, resolution) {
      if (!Array.isArray(cells)) {
        throw new Error("Remove spawned splitter entries requires cells array.");
      }
      if (!resolution || !Array.isArray(resolution.spawnedBySplitters)) {
        throw new Error("Remove spawned splitter entries requires resolution.spawnedBySplitters array.");
      }
      if (!cells.length || !resolution.spawnedBySplitters.length) {
        return 0;
      }

      var removedKeys = {};
      cells.forEach(function (cell) {
        if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
          throw new Error("Remove spawned splitter entries requires cell coordinates.");
        }
        removedKeys[cell.row + ":" + cell.col] = true;
        if (typeof cell.id === "string" || typeof cell.id === "number") {
          removedKeys[String(cell.id)] = true;
        }
      });

      var kept = [];
      var removedCount = 0;
      resolution.spawnedBySplitters.forEach(function (spawnedCell) {
        if (!spawnedCell || !Number.isInteger(spawnedCell.row) || !Number.isInteger(spawnedCell.col)) {
          throw new Error("Spawned splitter entry requires coordinates.");
        }
        var coordinateKey = spawnedCell.row + ":" + spawnedCell.col;
        var idKey = (typeof spawnedCell.id === "string" || typeof spawnedCell.id === "number")
          ? String(spawnedCell.id)
          : null;
        if (removedKeys[coordinateKey] || (idKey && removedKeys[idKey])) {
          removedCount += 1;
          return;
        }
        kept.push(spawnedCell);
      });

      resolution.spawnedBySplitters = kept;
      return removedCount;
    },

    _removeUnsupportedUnlockedCells: function (unlockedEntries, grid, resolution) {
      if (!Array.isArray(unlockedEntries)) {
        throw new Error("Unsupported unlocked flush requires unlockedEntries array.");
      }
      if (!unlockedEntries.length) {
        return [];
      }
      if (!grid || typeof grid.removeCells !== "function") {
        throw new Error("Unsupported unlocked flush requires bubble grid.");
      }
      if (!resolution || !Array.isArray(resolution.floating)) {
        throw new Error("Unsupported unlocked flush requires resolution.floating array.");
      }
      if (!this.systems.supportSystem || typeof this.systems.supportSystem.findFloatingCells !== "function") {
        throw new Error("Unsupported unlocked flush requires supportSystem.findFloatingCells.");
      }

      var unlockedPositions = {};
      unlockedEntries.forEach(function (entry) {
        if (!entry || !Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
          throw new Error("Unsupported unlocked flush requires unlocked cell coordinates.");
        }
        unlockedPositions[entry.row + ":" + entry.col] = true;
      });

      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var targets = floatingCells.filter(function (cell) {
        return unlockedPositions[cell.row + ":" + cell.col] === true;
      });
      if (!targets.length) {
        return [];
      }

      var removed = grid.removeCells(targets);
      this._appendUniqueCells(resolution.floating, removed);
      if (removed.length) {
        this._cancelPendingSplitterSpawnsForDroppedCells(removed);
        this._registerResolutionDrops(removed, grid, resolution, {
          startDelay: KEY_UNLOCK_DROP_DELAY
        });
      }
      return removed;
    },

    _resolveCollectedKeyUnlocks: function (grid, resolution) {
      if (!grid || typeof grid.getSpecialEntities !== "function" || typeof grid.addBubble !== "function") {
        throw new Error("Collected key unlock requires bubble grid.");
      }
      if (!resolution || !Array.isArray(resolution.collectedKeys)) {
        throw new Error("Collected key unlock requires resolution.collectedKeys array.");
      }
      if (!Array.isArray(resolution.unlockedLockedBalls)) {
        throw new Error("Collected key unlock requires resolution.unlockedLockedBalls array.");
      }
      if (!Array.isArray(resolution.floating)) {
        throw new Error("Collected key unlock requires resolution.floating array.");
      }

      var pendingKeys = resolution.collectedKeys.filter(function (keyCell) {
        return keyCell && !hasUnlockEntryForKey(keyCell, resolution.unlockedLockedBalls);
      });
      if (!pendingKeys.length) {
        return [];
      }

      var manager = this;
      var unlocked = [];
      pendingKeys.forEach(function (keyCell) {
        if (typeof keyCell.id !== "string" && typeof keyCell.id !== "number") {
          throw new Error("Collected key requires id.");
        }
      });

      var lockedTargets = grid.getSpecialEntities().filter(function (cell) {
        return isLockedBall(cell);
      });
      if (!lockedTargets.length) {
        throw new Error("Collected key has no locked target.");
      }
      if (lockedTargets.length < pendingKeys.length) {
        throw new Error("Collected keys exceed remaining locked targets.");
      }

      var pairings = buildNearestKeyLockPairings(pendingKeys, lockedTargets, grid);
      pairings.forEach(function (pair) {
        var keyCell = pair.keyCell;
        var targetCell = pair.lockCell;
        if (typeof targetCell.lockedColor !== "string" || !targetCell.lockedColor) {
          throw new Error("Locked ball requires lockedColor before unlock.");
        }
        var unlockedCell = grid.addBubble({ row: targetCell.row, col: targetCell.col }, targetCell.lockedColor);
        if (!unlockedCell) {
          throw new Error("Locked ball unlock failed for key: " + keyCell.id);
        }
        unlocked.push({
          id: unlockedCell.id,
          row: unlockedCell.row,
          col: unlockedCell.col,
          color: unlockedCell.color,
          entityCategory: unlockedCell.entityCategory,
          entityType: unlockedCell.entityType,
          __sourceKeyId: keyCell.id
        });
        manager._pushLockOpenEvent(unlockedCell);
      });

      this._appendUniqueCells(resolution.unlockedLockedBalls, unlocked);
      this._removeUnsupportedUnlockedCells(unlocked, grid, resolution);
      return unlocked;
    },

    _triggerKeysAndResolveUnlocks: function (removedCells, grid, resolution) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Key removal trigger requires removedCells array.");
      }
      var removedKeys = this._triggerAdjacentKeys(removedCells, grid, resolution);
      if (removedKeys.length) {
        this._resolveCollectedKeyUnlocks(grid, resolution);
      }
      return removedKeys;
    },

    _collectRemovedKeysAndResolveUnlocks: function (removedCells, grid, resolution) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Removed key collection requires removedCells array.");
      }
      var removedKeys = removedCells.filter(function (cell) {
        return isKeyBall(cell);
      });
      if (!removedKeys.length) {
        return [];
      }
      this._appendUniqueCells(resolution.collectedKeys, removedKeys);
      this._resolveCollectedKeyUnlocks(grid, resolution);
      return removedKeys;
    },

    _releaseVineOnce: function (cell, grid, resolution, sourceType) {
      if (!isVineEntangledBall(cell)) {
        throw new Error("Vine release requires an entangled normal ball.");
      }
      if (!grid || typeof grid.removeVineAt !== "function") {
        throw new Error("Vine release requires BubbleGrid.removeVineAt.");
      }
      if (!resolution || !Array.isArray(resolution.releasedVines)) {
        throw new Error("Vine release requires resolution.releasedVines.");
      }
      if (sourceType !== "direct_hit" && sourceType !== "adjacent_elimination" && sourceType !== "explosion") {
        throw new Error("Vine release sourceType is invalid: " + sourceType);
      }
      var alreadyReleased = resolution.releasedVines.some(function (entry) {
        return entry && entry.cellId === cell.id;
      });
      if (alreadyReleased) {
        return null;
      }
      var liveCell = grid.getCell(cell.row, cell.col);
      if (!liveCell || !isVineEntangledBall(liveCell)) {
        throw new Error("Vine release target must remain entangled: " + cell.id);
      }
      var released = grid.removeVineAt(cell.row, cell.col);
      var entry = {
        cellId: released.id,
        ownerId: released.vineOwnerId,
        row: released.row,
        col: released.col,
        sourceType: sourceType
      };
      resolution.releasedVines.push(entry);
      return entry;
    },

    _damageVineSpiritOnce: function (spirit, grid, resolution, sourceType) {
      if (!isVineSpiritBall(spirit)) {
        throw new Error("Vine spirit damage requires a vine spirit.");
      }
      if (!grid || typeof grid.damageVineSpirit !== "function") {
        throw new Error("Vine spirit damage requires BubbleGrid.damageVineSpirit.");
      }
      if (!resolution || !Array.isArray(resolution.vineSpiritHits) || !Array.isArray(resolution.witheredVines)) {
        throw new Error("Vine spirit damage requires resolution vine arrays.");
      }
      if (sourceType !== "direct_hit" && sourceType !== "adjacent_elimination" && sourceType !== "explosion") {
        throw new Error("Vine spirit damage sourceType is invalid: " + sourceType);
      }
      var alreadyDamaged = resolution.vineSpiritHits.some(function (entry) {
        return entry && entry.spiritId === spirit.id;
      });
      if (alreadyDamaged) {
        return null;
      }
      var result = grid.damageVineSpirit(spirit.id);
      var hitEntry = {
        spiritId: result.spiritId,
        row: result.row,
        col: result.col,
        healthBefore: result.healthBefore,
        healthAfter: result.healthAfter,
        destroyed: result.destroyed,
        sourceType: sourceType
      };
      resolution.vineSpiritHits.push(hitEntry);
      result.clearedVines.forEach(function (withered) {
        resolution.witheredVines.push({
          cellId: withered.cellId,
          ownerId: withered.ownerId,
          row: withered.row,
          col: withered.col
        });
      });
      return hitEntry;
    },

    _resolveVinesAfterRemoval: function (removedCells, grid, resolution) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Vine adjacency resolution requires removedCells array.");
      }
      if (!removedCells.length) {
        return;
      }
      if (!grid || typeof grid.getNeighborCoordinates !== "function" || typeof grid.getCell !== "function") {
        throw new Error("Vine adjacency resolution requires bubble grid.");
      }
      var entangledById = {};
      var spiritsById = {};
      removedCells.forEach(function (removedCell) {
        if (!removedCell || !Number.isInteger(removedCell.row) || !Number.isInteger(removedCell.col)) {
          throw new Error("Vine adjacency resolution requires removed cell coordinates.");
        }
        grid.getNeighborCoordinates(removedCell.row, removedCell.col).forEach(function (coordinate) {
          var neighbor = grid.getCell(coordinate.row, coordinate.col);
          if (isVineEntangledBall(neighbor)) {
            entangledById[neighbor.id] = neighbor;
          }
          if (isVineSpiritBall(neighbor)) {
            spiritsById[neighbor.id] = neighbor;
          }
        });
      });
      Object.keys(entangledById).sort().forEach(function (cellId) {
        this._releaseVineOnce(entangledById[cellId], grid, resolution, "adjacent_elimination");
      }, this);
      Object.keys(spiritsById).sort().forEach(function (spiritId) {
        this._damageVineSpiritOnce(spiritsById[spiritId], grid, resolution, "adjacent_elimination");
      }, this);
    },

    _resolveVinesHitByExplosion: function (affectedCells, grid, resolution) {
      if (!Array.isArray(affectedCells)) {
        throw new Error("Vine explosion resolution requires affectedCells array.");
      }
      if (!grid || typeof grid.getCell !== "function") {
        throw new Error("Vine explosion resolution requires bubble grid.");
      }
      var entangledById = {};
      var spiritsById = {};
      affectedCells.forEach(function (affectedCell) {
        if (!affectedCell || !Number.isInteger(affectedCell.row) || !Number.isInteger(affectedCell.col)) {
          throw new Error("Vine explosion resolution requires affected cell coordinates.");
        }
        var liveCell = grid.getCell(affectedCell.row, affectedCell.col);
        if (isVineEntangledBall(liveCell)) {
          entangledById[liveCell.id] = liveCell;
        }
        if (isVineSpiritBall(liveCell)) {
          spiritsById[liveCell.id] = liveCell;
        }
      });
      Object.keys(entangledById).sort().forEach(function (cellId) {
        this._releaseVineOnce(entangledById[cellId], grid, resolution, "explosion");
      }, this);
      Object.keys(spiritsById).sort().forEach(function (spiritId) {
        this._damageVineSpiritOnce(spiritsById[spiritId], grid, resolution, "explosion");
      }, this);
    },

    _resolveDirectVineImpact: function (projectile, grid, resolution) {
      if (!projectile || !projectile.shotPlan || !projectile.shotPlan.collidedCell) {
        return;
      }
      var collided = projectile.shotPlan.collidedCell;
      if (!Number.isInteger(collided.row) || !Number.isInteger(collided.col)) {
        throw new Error("Direct vine impact requires collided cell coordinates.");
      }
      var liveCell = grid.getCell(collided.row, collided.col);
      if (liveCell && isVineEntangledBall(liveCell)) {
        this._releaseVineOnce(liveCell, grid, resolution, "direct_hit");
        return;
      }
      if (liveCell && isVineSpiritBall(liveCell)) {
        this._damageVineSpiritOnce(liveCell, grid, resolution, "direct_hit");
        return;
      }
      if (isVineEntangledBall(collided)) {
        var vineWasReleased = resolution.releasedVines.some(function (entry) {
          return entry && entry.cellId === collided.id;
        });
        if (!vineWasReleased) {
          throw new Error("Directly hit vine disappeared without a release record: " + collided.id);
        }
      }
      if (isVineSpiritBall(collided)) {
        var spiritWasDamaged = resolution.vineSpiritHits.some(function (entry) {
          return entry && entry.spiritId === collided.id;
        });
        if (!spiritWasDamaged) {
          throw new Error("Directly hit vine spirit disappeared without a damage record: " + collided.id);
        }
      }
    },

    _triggerAdjacentKeys: function (removedCells, grid, resolution) {
      var touched = {};
      var keys = [];
      (removedCells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }
        if (isKeyBall(cell)) {
          touched[cell.row + ":" + cell.col] = true;
          keys.push(cell);
        }
        grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coord) {
          var key = coord.row + ":" + coord.col;
          if (touched[key]) {
            return;
          }
          var neighbor = grid.getCell(coord.row, coord.col);
          if (!isKeyBall(neighbor)) {
            return;
          }
          touched[key] = true;
          keys.push(neighbor);
        });
      });

      if (!keys.length) {
        return [];
      }

      var liveKeys = keys.filter(function (keyCell) {
        return grid.hasCell(keyCell.row, keyCell.col);
      });
      var removedKeys = grid.removeCells(liveKeys);
      this._appendUniqueCells(removedKeys, keys);
      this._appendUniqueCells(resolution.collectedKeys, removedKeys);
      return removedKeys;
    },

    _triggerAdjacentSplitters: function (removedCells, grid, resolution, triggeredSplitterIds) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Adjacent splitter trigger requires removedCells array.");
      }
      var manager = this;
      var touched = {};
      var triggered = [];
      removedCells.forEach(function (cell) {
        if (!cell) {
          throw new Error("Adjacent splitter trigger requires removed cell.");
        }
        grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coord) {
          var key = coord.row + ":" + coord.col;
          if (touched[key]) {
            return;
          }
          var splitter = grid.getCell(coord.row, coord.col);
          if (!isSplitterBall(splitter)) {
            return;
          }
          touched[key] = true;
          if (triggeredSplitterIds[splitter.id]) {
            return;
          }
          triggeredSplitterIds[splitter.id] = true;
          if (typeof splitter.splitColor !== "string" || !splitter.splitColor) {
            throw new Error("Splitter requires splitColor.");
          }
          if (typeof manager._queuePendingSplitterSpawn !== "function") {
            throw new Error("Splitter trigger requires GameManager._queuePendingSplitterSpawn.");
          }
          manager._queuePendingSplitterSpawn(splitter, resolution);
          triggered.push(splitter);
        });
      });

      return triggered;
    },

    _collectAdjacentMolotovs: function (removedCells, grid, queuedMolotovIds) {
      if (!Array.isArray(removedCells)) {
        throw new Error("Adjacent molotov collection requires removedCells array.");
      }
      if (!grid || typeof grid.getNeighborCoordinates !== "function" || typeof grid.getCell !== "function") {
        throw new Error("Adjacent molotov collection requires bubble grid.");
      }
      if (!queuedMolotovIds || typeof queuedMolotovIds !== "object") {
        throw new Error("Adjacent molotov collection requires queued id map.");
      }
      var molotovs = [];
      var blockedMolotovIds = {};
      var seenMolotovIds = {};
      Object.keys(queuedMolotovIds).forEach(function (id) {
        if (queuedMolotovIds[id] !== true) {
          throw new Error("Adjacent molotov queued id map must contain true flags.");
        }
        blockedMolotovIds[id] = true;
      });

      function collectMolotov(cell) {
        if (cell && isMolotovBall(cell)) {
          if (typeof cell.id !== "string" && typeof cell.id !== "number") {
            throw new Error("Adjacent molotov collection requires molotov id.");
          }
          if (!blockedMolotovIds[cell.id] && !seenMolotovIds[cell.id]) {
            seenMolotovIds[cell.id] = true;
            molotovs.push(cell);
          }
        }
      }

      removedCells.forEach(function (cell) {
        if (!cell) {
          throw new Error("Adjacent molotov collection requires removed cell.");
        }
        collectMolotov(cell);
        var neighborCoordinates = grid.getNeighborCoordinates(cell.row, cell.col);
        if (!Array.isArray(neighborCoordinates)) {
          throw new Error("Adjacent molotov collection requires neighbor coordinates array.");
        }
        neighborCoordinates.forEach(function (coord) {
          var neighbor = grid.getCell(coord.row, coord.col);
          collectMolotov(neighbor);
        });
      });
      return molotovs;
    },

    _resolveReactiveEntitiesAfterRemoval: function (removedCells, grid, resolution) {
      if (!removedCells || !removedCells.length) {
        return [];
      }

      this._resetMolotovBlastSequence();
      this._resolveVinesAfterRemoval(removedCells, grid, resolution);

      var collected = [];
      var queuedMolotovIds = {};
      var triggeredSplitterIds = {};

      var removedKeys = this._triggerKeysAndResolveUnlocks(removedCells, grid, resolution);
      this._appendUniqueCells(collected, removedKeys);
      this._triggerAdjacentSplitters(removedCells, grid, resolution, triggeredSplitterIds);

      var molotovs = this._collectAdjacentMolotovs(removedCells, grid, queuedMolotovIds);
      if (molotovs.length) {
        this._queueMolotovBlasts(molotovs, resolution);
      }

      var iceRemoved = collected.filter(function (cell) {
        return isIceBall(cell);
      });
      if (iceRemoved.length && typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(iceRemoved);
      }

      return collected;
    },

    _findAdjacentIceCells: function (cells, grid) {
      var touched = {};
      var adjacentIce = [];

      (cells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }

        grid.getNeighborCoordinates(cell.row, cell.col).forEach(function (coord) {
          var key = coord.row + ":" + coord.col;
          if (touched[key]) {
            return;
          }

          var neighbor = grid.getCell(coord.row, coord.col);
          if (!isIceBall(neighbor)) {
            return;
          }

          touched[key] = true;
          adjacentIce.push(neighbor);
        });
      });

      return adjacentIce;
    },

    _thawIceCells: function (cells, grid) {
      var thawed = [];
      var touched = {};

      (cells || []).forEach(function (cell) {
        if (!cell) {
          return;
        }

        var key = cell.row + ":" + cell.col;
        if (touched[key]) {
          return;
        }

        touched[key] = true;
        var currentCell = grid.getCell(cell.row, cell.col);
        if (!isIceBall(currentCell)) {
          return;
        }

        var innerColor = resolveIceInnerColor(currentCell);
        if (!innerColor) {
          return;
        }

        var thawedCell = grid.addBubble({ row: cell.row, col: cell.col }, innerColor);
        if (thawedCell) {
          thawed.push(thawedCell);
        }
      });

      if (thawed.length > 0) {
        this._pushRuntimeEvent("ice_thawed", {
          count: thawed.length
        });
      }

      return thawed;
    },

    _resolveBlastShot: function (projectile, targetCell) {
      var resolution = createEmptyResolution();

      var grid = this.systems.bubbleGrid;
      var centerCoordinate = null;
      if (targetCell && grid.isValidCell(targetCell.row, targetCell.col)) {
        centerCoordinate = {
          row: targetCell.row,
          col: targetCell.col
        };
      } else if (projectile && projectile.shotPlan && projectile.shotPlan.collidedCell) {
        centerCoordinate = {
          row: projectile.shotPlan.collidedCell.row,
          col: projectile.shotPlan.collidedCell.col
        };
      } else if (projectile && projectile.position) {
        var fallbackCenterCell = grid.findCollision(projectile.position, BoardLayout.bubbleDiameter * 1.15);
        if (fallbackCenterCell) {
          centerCoordinate = {
            row: fallbackCenterCell.row,
            col: fallbackCenterCell.col
          };
        }
      }
      if (!centerCoordinate) {
        throw new Error("Blast shot requires a resolved explosion center.");
      }

      var blastCells = [];
      var iceCellsToThaw = [];
      var affectedCoords = [{
        row: centerCoordinate.row,
        col: centerCoordinate.col
      }].concat(grid.getNeighborCoordinates(centerCoordinate.row, centerCoordinate.col));
      var touched = {};

      affectedCoords.forEach(function (coord) {
        var key = coord.row + ":" + coord.col;
        if (touched[key]) {
          return;
        }
        touched[key] = true;

        var occupiedCell = grid.getCell(coord.row, coord.col);
        if (occupiedCell) {
          if (isIceBall(occupiedCell)) {
            iceCellsToThaw.push(occupiedCell);
          } else if (isLockedBall(occupiedCell)) {
            return;
          } else {
            blastCells.push(occupiedCell);
          }
        }
      });

      this._resolveVinesHitByExplosion(blastCells, grid, resolution);
      var removableBlastCells = blastCells.filter(function (cell) {
        return !isVineEntangledBall(cell) && !isVineSpiritBall(cell);
      });
      var removedBlastCells = grid.removeCells(removableBlastCells);
      this._resolveVinesAfterRemoval(removedBlastCells, grid, resolution);
      if (!Array.isArray(resolution.blastExplosions)) {
        throw new Error("Blast resolution requires blastExplosions array.");
      }
      if (!Number.isInteger(this.shotsFired) || this.shotsFired <= 0) {
        throw new Error("Blast explosion requires a positive shotsFired id.");
      }
      resolution.blastExplosions.push({
        id: "blast_shot_" + this.shotsFired,
        entityType: "blast",
        row: centerCoordinate.row,
        col: centerCoordinate.col
      });
      this._pushBombExplosionEvent();
      resolution.thawed = this._thawIceCells(iceCellsToThaw, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(resolution.thawed);
      }
      var removedReactive = this._resolveReactiveEntitiesAfterRemoval(removedBlastCells, grid, resolution);
      if (this._hasPendingMolotovBlasts()) {
        this._beginMolotovPendingResolution(
          resolution,
          "blastDrop",
          removedBlastCells.concat(removedReactive)
        );
        Logger.info("Blast resolution pending molotov", {
          cleared: removedBlastCells.length,
          thawed: resolution.thawed.length,
          injectedSkills: resolution.injectedSkills.length
        });
        return resolution;
      }

      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeFloatingCells(floatingCells);
      this._appendUniqueCells(resolution.floating, removedFloating);
      this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
      var removedAll = removedBlastCells.concat(removedReactive).concat(resolution.floating);
      this._cancelPendingSplitterSpawnsForDroppedCells(removedAll);

      var matchedCells = removedBlastCells.concat(removedReactive);
      this._registerResolutionDrops(
        resolution.floating,
        grid,
        resolution,
        undefined,
        {
          matchedCellsForDelay: matchedCells
        }
      );
      this.systems.jarCollectorSystem.collect([]);

      this._pushBubbleBreakEvent(matchedCells);
      resolution.matched = matchedCells;
      this._registerMatchedObjectiveCollection(matchedCells, resolution.eliminationSequence, resolution, grid);
      resolution.collected = removedAll;
      resolution.impact = this._createImpactEventFromCell(centerCoordinate);
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, "blastDrop");
      this._registerComboElimination(resolution);

      Logger.info("Blast resolution", {
        cleared: removedBlastCells.length,
        thawed: resolution.thawed.length,
        floating: resolution.floating.length,
        injectedSkills: resolution.injectedSkills.length,
        scoreDelta: resolution.scoreDelta
      });

      return resolution;
    },

    _finalizePlannedShot: function () {
      if (!this.activeProjectile) {
        return;
      }

      var projectile = this.activeProjectile;
      var grid = this.systems.bubbleGrid;
      var targetCell = projectile.targetCell;

      if (!targetCell || grid.hasCell(targetCell.row, targetCell.col)) {
        var fallbackPoint = projectile.shotPlan && projectile.shotPlan.hitPoint
          ? projectile.shotPlan.hitPoint
          : projectile.position;
        var fallbackCollidedCell = projectile.shotPlan ? projectile.shotPlan.collidedCell : null;
        targetCell = grid.findAttachmentCell(
          fallbackPoint,
          fallbackCollidedCell,
          this.systems.shooterController.getAimState().direction,
          projectile.position
        );
      }

      var firedBall = projectile.ball || {
        ballCategory: "normal",
        color: projectile.color,
        entityCategory: "normal_ball",
        entityType: null
      };

      if (isBlastBall(firedBall)) {
        this.lastResolution = this._resolveBlastShot(projectile, targetCell);
      } else if (isRainbowBall(firedBall)) {
        this.lastResolution = this._resolveRainbowShot(projectile, targetCell);
      } else {
        var attachedColor = firedBall.color;
        var attachedBubble = grid.addBubble(targetCell, attachedColor);
        this.lastResolution = this._resolveAttachment(attachedBubble);
      }
      this._resolveDirectVineImpact(projectile, grid, this.lastResolution);
      if (!this.molotovResolutionPending) {
        this._resolveFairyAssistsAfterResolution(this.lastResolution);
      }
      var swirlRotationStarted = !this.molotovResolutionPending && this._beginSwirlRotationForResolution(this.lastResolution);
      var wormholeShiftStarted = !this.molotovResolutionPending && !swirlRotationStarted && this._beginWormholeShiftForResolution(this.lastResolution);
      var vineCastStarted = !this.molotovResolutionPending && !swirlRotationStarted && !wormholeShiftStarted && this._beginVineCastForResolution(this.lastResolution);
      var postShotSpecialStarted = swirlRotationStarted || wormholeShiftStarted || vineCastStarted;
      var deferredBoardShift = postShotSpecialStarted ? true : this._applyPostImpactBoardShiftPolicy(this.lastResolution);

      var noEliminationTriggered = !(
        this.lastResolution &&
        Array.isArray(this.lastResolution.matched) &&
        this.lastResolution.matched.length > 0
      );
      if (noEliminationTriggered) {
        this._resetComboStreak();
        if (typeof this._pushRuntimeEvent === "function") {
          this._pushRuntimeEvent("shot_no_elimination");
        }
      }

      this.activeProjectile = null;
      this.pendingProjectileFinalize = false;
      var clearedOcclusionZoneIds = this.systems.boardOcclusionSystem.onShotFired();
      if (clearedOcclusionZoneIds.length) {
        this._pushRuntimeEvent("board_occlusion_cleared", {
          reason: "shot_count",
          zoneIds: clearedOcclusionZoneIds
        });
      }

      if (postShotSpecialStarted) {
        this.pendingShotPlan = null;
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this.state = "out_of_shots_pending";
        }
        return;
      }

      if (this.lastResolution.boardCleared) {
        this._resolveBoardClearedOutcome();
        return;
      }

      if (this._tryTopAnchorCollapse()) {
        this.pendingShotPlan = null;
        return;
      }

      if (this._hasPendingMolotovBlasts()) {
        this.pendingShotPlan = null;
        if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
          this.state = "out_of_shots_pending";
        }
        return;
      }

      if (deferredBoardShift) {
        this.pendingShotPlan = null;
        return;
      }

      if (this._ensureMinimumVisibleBoardRows(this.lastResolution)) {
        this.pendingShotPlan = null;
        if (this.state === "won_pending") {
          return;
        }
        return;
      }

      if (!this.isTimedInfiniteShots && this.remainingShots <= 0) {
        if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._isBoardAdvanceBusy() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingVineCast()) {
          this.state = "out_of_shots_pending";
        } else {
          this._showOutOfShotsAddBallPrompt();
        }
        return;
      }

      this.pendingShotPlan = null;
    },

    _resolveAttachment: function (attachedBubble) {
      var resolution = createEmptyResolution();
      resolution.attachedCell = attachedBubble;
      resolution.impact = this._createImpactEventFromCell(attachedBubble);

      var grid = this.systems.bubbleGrid;
      var matchedCells = this.systems.matchSystem.findMatchGroup(grid, attachedBubble);

      if (!matchedCells.length) {
        this.systems.supportSystem.clearFloatingCells();
        this.systems.fallingMarbleSystem.registerDrops([], grid);
        this.systems.jarCollectorSystem.collect([]);
        resolution.boardCleared = this._isBoardCleared(grid);
        return resolution;
      }

      var removedMatches = grid.removeCells(matchedCells);
      var removedReactiveMatches = this._resolveReactiveEntitiesAfterRemoval(removedMatches, grid, resolution);
      if (resolution.impact) {
        resolution.impact = this._filterImpactEventSurvivors(
          resolution.impact,
          removedMatches.concat(removedReactiveMatches)
        );
      }
      var adjacentIceCells = this._findAdjacentIceCells(removedMatches, grid);
      resolution.thawed = this._thawIceCells(adjacentIceCells, grid);
      if (typeof this._registerIceCollection === "function") {
        resolution.iceCollected += this._registerIceCollection(resolution.thawed);
      }

      if (this._hasPendingMolotovBlasts()) {
        this._beginMolotovPendingResolution(
          resolution,
          "matchedDrop",
          removedMatches.concat(removedReactiveMatches)
        );
        Logger.info("Resolution pending molotov", {
          matched: removedMatches.length,
          thawed: resolution.thawed.length,
          injectedSkills: resolution.injectedSkills.length
        });
        return resolution;
      }

      var floatingCells = this.systems.supportSystem.findFloatingCells(grid);
      var removedFloating = grid.removeFloatingCells(floatingCells);
      this._appendUniqueCells(resolution.floating, removedFloating);
      this._collectRemovedKeysAndResolveUnlocks(removedFloating, grid, resolution);
      var collectedCells = removedMatches.concat(removedReactiveMatches).concat(resolution.floating);
      this._cancelPendingSplitterSpawnsForDroppedCells(collectedCells);

      var matchedCellsForScore = removedMatches.concat(removedReactiveMatches);
      var matchedScorePerBall = this._getMatchedDropScorePerBallForNextCombo("matchedDrop");
      var eliminationData = EliminationSequenceBuilder.buildEliminationSequence(
        attachedBubble,
        matchedCellsForScore,
        grid,
        matchedScorePerBall
      );
      resolution.eliminationSequence = eliminationData.eliminationSequence;
      resolution.scoreEvents = eliminationData.scoreEvents;

      resolution.matched = matchedCellsForScore;
      this._registerMatchedObjectiveCollection(
        matchedCellsForScore,
        resolution.eliminationSequence,
        resolution,
        grid
      );
      this._registerResolutionDrops(resolution.floating, grid, resolution);
      this.systems.jarCollectorSystem.collect([]);

      this._pushBubbleBreakEvent(matchedCellsForScore, resolution.eliminationSequence);
      resolution.collected = collectedCells;
      resolution.boardCleared = this._isBoardCleared(grid);
      this._applyResolutionDropScore(resolution, "matchedDrop", {
        matchedScorePerBall: matchedScorePerBall
      });
      this._registerComboElimination(resolution);

      Logger.info("Resolution", {
        matched: removedMatches.length,
        thawed: resolution.thawed.length,
        floating: resolution.floating.length,
        collected: collectedCells.length,
        injectedSkills: resolution.injectedSkills.length,
        scoreDelta: resolution.scoreDelta
      });

      return resolution;
    },

    _isPrimaryObjectiveCompleted: function () {
      var objective = findPrimaryCollectionObjective(this.currentLevel);
      if (!objective) {
        return true;
      }

      var target = Math.max(0, Math.floor(Number(objective.value) || 0));
      if (target <= 0) {
        return true;
      }

      var jarsSnapshot = this._getCachedJarSnapshot();
      if (!jarsSnapshot) {
        return false;
      }

      if (typeof this._getPrimaryObjectiveProgressValue === "function") {
        return this._getPrimaryObjectiveProgressValue(objective, jarsSnapshot) >= target;
      }

      return true;
    },

    _resolveBoardClearedOutcome: function () {
      // 清屏后若仍有掉落中的玻璃球，先进入等待态；
      // 等掉落完成并计分后，再决定本局最终胜负。
      if (this.systems.fallingMarbleSystem.hasActiveDrops() || this._hasPendingSplitterSpawns() || this._hasPendingMolotovBlasts() || this._hasPendingSwirlRotation() || this._hasPendingWormholeShift() || this._hasPendingVineCast()) {
        this.state = "won_pending";
        return;
      }

      if (!this._isClearWinCompleted()) {
        this.state = "lost_objective";
        return;
      }

      this._resolveClearWinOutcome();
    },

    _beginSurplusShotBonus: function () {
      if (this.isTimedInfiniteShots) {
        throw new Error("Surplus shot bonus cannot run in timed infinite-shot mode.");
      }

      var remainingCount = Math.floor(Number(this.remainingShots) || 0);
      if (!Number.isInteger(remainingCount) || remainingCount <= 0) {
        throw new Error("Surplus shot bonus requires positive remainingShots.");
      }

      var shooterController = this.systems.shooterController;
      if (!shooterController || typeof shooterController.drainRemainingShotBalls !== "function") {
        throw new Error("Surplus shot bonus requires ShooterController.drainRemainingShotBalls.");
      }

      var fallingMarbleSystem = this.systems.fallingMarbleSystem;
      if (!fallingMarbleSystem || typeof fallingMarbleSystem.registerSurplusShotsFromOrigin !== "function") {
        throw new Error("Surplus shot bonus requires FallingMarbleSystem.registerSurplusShotsFromOrigin.");
      }
      if (typeof fallingMarbleSystem.hasPendingSurplusShots !== "function") {
        throw new Error("Surplus shot bonus requires FallingMarbleSystem.hasPendingSurplusShots.");
      }

      if (this.activeProjectile) {
        throw new Error("Surplus shot bonus cannot start while projectile is active.");
      }
      if (fallingMarbleSystem.hasActiveDrops()) {
        throw new Error("Surplus shot bonus cannot start while board drops are still active.");
      }

      var aimState = shooterController.getAimState();
      var origin = aimState && aimState.origin ? aimState.origin : null;
      if (!origin || typeof origin.x !== "number" || typeof origin.y !== "number") {
        throw new Error("Surplus shot bonus requires shooter aim origin.");
      }

      var drainedBalls = shooterController.drainRemainingShotBalls(remainingCount);
      this.remainingShots = 0;
      this.isAiming = false;
      this.pendingShotPlan = null;
      this.surplusShotAimRecentered = false;
      fallingMarbleSystem.registerSurplusShotsFromOrigin(drainedBalls, origin, this.levelRandomSeed);
      this.state = "won_surplus_shots_pending";
      if (!fallingMarbleSystem.hasPendingSurplusShots()) {
        this.surplusShotAimRecentered = true;
        this.surplusShotAimRecenterRevision += 1;
      }

      if (typeof this._pushRuntimeEvent === "function") {
        this._pushRuntimeEvent("surplus_shots_started", {
          count: drainedBalls.length
        });
      }

      Logger.info("Surplus shot bonus started", {
        count: drainedBalls.length
      });
    }
  };
}

module.exports = createGameManagerShotResolutionMethods;

},{"../config/SpecialAnimationTiming":"SpecialAnimationTiming","../systems/BoardViewportSystem":"BoardViewportSystem","./EliminationSequenceBuilder":"EliminationSequenceBuilder","../config/JarScoreConfig":"JarScoreConfig"}],
"JarCollectorSystem":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function createZeroMap(colors) {
  return (colors || []).reduce(function (result, colorCode) {
    result[colorCode] = 0;
    return result;
  }, {});
}

function getCollectAnyTarget(levelConfig) {
  var objectives = levelConfig.level.bonusObjectives || [];
  for (var i = 0; i < objectives.length; i += 1) {
    if (objectives[i].type === "collect_any") {
      return objectives[i].value || 0;
    }
  }

  return 0;
}

function requireCollectObjective(objective) {
  if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
    throw new Error("Eliminated objective collection requires objective.");
  }
  if (objective.type !== "collect_any" && objective.type !== "collect_color") {
    throw new Error("Eliminated objective collection unsupported objective type: " + objective.type);
  }
  if (objective.type === "collect_color" && (typeof objective.color !== "string" || !objective.color)) {
    throw new Error("Eliminated collect_color objective requires color.");
  }
}

function isCollectableEliminatedCell(cell, objective, jarColors) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
    throw new Error("Eliminated objective collection requires cell objects.");
  }
  if (cell.entityCategory !== "normal_ball") {
    return false;
  }
  if (typeof cell.color !== "string" || !cell.color) {
    throw new Error("Eliminated normal ball requires color.");
  }
  if (objective.type === "collect_color") {
    return cell.color === objective.color;
  }
  return jarColors.indexOf(cell.color) !== -1;
}

function JarCollectorSystem() {
  BaseSystem.call(this, "JarCollectorSystem");
  this.jarCount = 0;
  this.jarColors = [];
  this.collectedTotal = 0;
  this.collectedByColor = {};
  this.objectiveTarget = 0;
  this.lastCollected = [];
}

JarCollectorSystem.prototype = Object.create(BaseSystem.prototype);
JarCollectorSystem.prototype.constructor = JarCollectorSystem;

JarCollectorSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.jarCount = levelConfig.level.jarCount || 0;
  this.jarColors = (levelConfig.level.jarColors || []).slice();
  this.collectedTotal = 0;
  this.collectedByColor = createZeroMap(this.jarColors);
  this.objectiveTarget = getCollectAnyTarget(levelConfig);
  this.lastCollected = [];
  return this;
};

JarCollectorSystem.prototype.collect = function (cells) {
  this.lastCollected = [];

  (cells || []).forEach(function (cell) {
    if (!cell || this.jarColors.indexOf(cell.color) === -1) {
      return;
    }

    this.collectedTotal += 1;
    this.collectedByColor[cell.color] = (this.collectedByColor[cell.color] || 0) + 1;
    this.lastCollected.push({
      color: cell.color,
      row: cell.row,
      col: cell.col,
      id: cell.id,
      jarIndex: typeof cell.jarIndex === "number" ? cell.jarIndex : -1,
      jarColor: cell.jarColor || null,
      sameColor: !!cell.sameColor,
      bonusMultiplier: typeof cell.bonusMultiplier === "number" ? cell.bonusMultiplier : 1
    });
  }, this);

  return this.snapshot();
};

JarCollectorSystem.prototype.collectEliminatedObjectiveCells = function (cells, objective) {
  if (!Array.isArray(cells)) {
    throw new Error("Eliminated objective collection requires cells array.");
  }
  requireCollectObjective(objective);
  if (objective.type === "collect_color" && this.jarColors.indexOf(objective.color) === -1) {
    throw new Error("Eliminated collect_color target must be present in jarColors: " + objective.color);
  }

  var collected = [];
  cells.forEach(function (cell) {
    if (!isCollectableEliminatedCell(cell, objective, this.jarColors)) {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(this.collectedByColor, cell.color)) {
      throw new Error("Eliminated objective color missing from collectedByColor: " + cell.color);
    }

    this.collectedTotal += 1;
    this.collectedByColor[cell.color] += 1;
    collected.push({
      color: cell.color,
      row: cell.row,
      col: cell.col,
      id: cell.id
    });
  }, this);

  return collected;
};

JarCollectorSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.jarCount = this.jarCount;
  snapshot.jarColors = this.jarColors.slice();
  snapshot.collectedTotal = this.collectedTotal;
  snapshot.collectedByColor = Object.assign({}, this.collectedByColor);
  snapshot.objectiveTarget = this.objectiveTarget;
  snapshot.objectiveProgress = Math.min(this.collectedTotal, this.objectiveTarget || this.collectedTotal);
  snapshot.lastCollected = clone(this.lastCollected);
  return snapshot;
};

module.exports = JarCollectorSystem;


},{"./BaseSystem":"BaseSystem"}],
"JarScoreConfig":[function(require,module,exports){
"use strict";

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("JarScoreConfig." + fieldName + " must be a positive integer.");
  }
  return value;
}

function assertBaseScoreTable(table) {
  if (!Array.isArray(table) || !table.length) {
    throw new Error("JarScoreConfig base score table must be a non-empty array.");
  }
  table.forEach(function (score, index) {
    if (!Number.isInteger(score) || score < 0) {
      throw new Error("JarScoreConfig base score at index " + index + " must be a non-negative integer.");
    }
  });
  return table.slice();
}

var JarScoreConfig = {
  baseScoresByJarCount: {
    1: assertBaseScoreTable([120]),
    2: assertBaseScoreTable([80, 80]),
    3: assertBaseScoreTable([60, 120, 60]),
    4: assertBaseScoreTable([40, 90, 90, 40]),
    5: assertBaseScoreTable([40, 60, 120, 60, 40])
  }
};

JarScoreConfig.getBaseScoresForJarCount = function (jarCount) {
  var count = assertPositiveInteger(jarCount, "jarCount");
  if (!Object.prototype.hasOwnProperty.call(this.baseScoresByJarCount, count)) {
    throw new Error("JarScoreConfig has no base score table for jarCount " + count + ".");
  }
  return this.baseScoresByJarCount[count].slice();
};

JarScoreConfig.getBaseScoreForJarIndex = function (jarCount, jarIndex) {
  var table = this.getBaseScoresForJarCount(jarCount);
  if (!Number.isInteger(jarIndex) || jarIndex < 0 || jarIndex >= table.length) {
    throw new Error("JarScoreConfig jarIndex " + jarIndex + " is out of range for jarCount " + jarCount + ".");
  }
  return table[jarIndex];
};

module.exports = JarScoreConfig;

},{}],
"LevelRenderer":[function(require,module,exports){
"use strict";

var Logger = require("../../assets/scripts/utils/Logger");
var DebugFlags = require("../../assets/scripts/utils/DebugFlags");
var BundleLoader = require("../../assets/scripts/utils/BundleLoader");
var PrefabFactory = require("./PrefabFactory");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");
var FairyAssistConfig = require("../config/FairyAssistConfig");
var JarScoreConfig = require("../config/JarScoreConfig");
var PropDescriptionConfig = require("../../assets/scripts/config/PropDescriptionConfig");
var RUNTIME_REFRESH_SCOPE = require("../../assets/scripts/config/RuntimeRefreshScope");
var StarRatingPolicy = require("../../assets/scripts/core/StarRatingPolicy");
var AdRevivePolicy = require("../core/AdRevivePolicy");
var AdRewardCatalog = require("../../assets/scripts/services/AdRewardCatalog");
var RenderNodeHelpers = require("../../assets/scripts/render/RenderNodeHelpers");
var SpriteProxyLayerHelper = require("../../assets/scripts/utils/SpriteProxyLayerHelper");
var BubbleShatterRenderer = require("./BubbleShatterRenderer");
var WormholeShaderRenderer = require("./WormholeShaderRenderer");
var LightningChainRenderer = require("./LightningChainRenderer");
var PropDescriptionViewController = require("../../assets/scripts/ui/PropDescriptionViewController");
var attachLevelRendererSceneMethods = require("./LevelRendererSceneMethods");
var attachLevelRendererFairyMethods = require("./LevelRendererFairyMethods");

var loadSpriteFrame = RenderNodeHelpers.loadSpriteFrame;
var createSolidWhiteSpriteFrame = RenderNodeHelpers.createSolidWhiteSpriteFrame;
var ensureSprite = RenderNodeHelpers.ensureSprite;
var ensureLabel = RenderNodeHelpers.ensureLabel;
var ensureOutline = RenderNodeHelpers.ensureOutline;
var clearChildren = RenderNodeHelpers.clearChildren;
var getOrCreateChild = RenderNodeHelpers.getOrCreateChild;

var BALL_RESOURCES = {
  R: "game/image/ball/red_ball",
  G: "game/image/ball/green_ball",
  B: "game/image/ball/blue_ball",
  Y: "game/image/ball/yellow_ball",
  P: "game/image/ball/purple_ball",
  K: "game/image/ball/black_ball",
  O: "game/image/ball/orange_ball",
  W: "game/image/ball/white_ball",
  RAINBOW: "game/image/ball/rainbow_ball",
  BLAST: "game/image/ball/bomb_ball",
  STONE: "game/image/ball/stone_ball",
  ICE: "game/image/ball/ice_ball",
  MOLOTOV: "game/image/props/fire_box",
  KEY: "game/image/props/key",
  LOCKED: "ui/image/commone/lock",
  SPLIT_R: "game/image/ball/split_red_ball",
  SPLIT_G: "game/image/ball/split_green_ball",
  SPLIT_B: "game/image/ball/split_blue_ball",
  SPLIT_Y: "game/image/ball/split_yellow_ball",
  SPLIT_P: "game/image/ball/split_purple_ball",
  SWIRL: "game/image/ball/swirl_ball",
  WORMHOLE: "game/image/ball/wormhole",
  VINE_SPIRIT: "game/image/ball/vine_spirit",
  VINES: "game/image/ball/vines",
  ICE_SNOWBALL: "game/image/ball/ice_ball",
  BLOCKADE_LINE: "game/image/ball/blockade_line",
  LIGHT: "game/image/ball/light_ball",
  SNOW_REMOVAL_TOOLS: "game/image/ball/snow_removal_tools"
};

var BOARD_OCCLUSION_RESOURCES = {
  cloud: "game/image/props/cloud",
  leaves: "game/image/props/leaves"
};
var BOARD_OCCLUSION_CLOCK_RESOURCE = "game/image/props/clock";

var WORMHOLE_DIRECTION_ARROW_RESOURCE = "game/image/ball/arrow";
var WORMHOLE_DIRECTION_ARROW_SIZE = new cc.Size(42, 42);
var WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE = 18;
var WORMHOLE_DIRECTION_ARROW_STAGGER = 0.12;
var WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION = 0.2;
var WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION = 0.24;
var WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE = 0.28;

var JAR_RESOURCES = {
  R: "game/image/jar/red_jar",
  G: "game/image/jar/green_jar",
  B: "game/image/jar/blue_jar",
  Y: "game/image/jar/yellow_jar",
  P: "game/image/jar/purple_jar"
};

var JAR_MASK_RESOURCES = {
  R: "game/image/jar/red_jar_mask",
  G: "game/image/jar/green_jar_mask",
  B: "game/image/jar/blue_jar_mask",
  Y: "game/image/jar/yellow_jar_mask",
  P: "game/image/jar/purple_jar_mask"
};

var JAR_SCORE_RESOURCE_COLOR_NAMES = {
  R: "red",
  G: "green",
  B: "blue",
  Y: "yellow",
  P: "purple"
};

var JAR_SCORE_RESOURCE_VALUES = {
  40: true,
  60: true,
  80: true,
  90: true,
  120: true
};

function resolveJarScoreSpritePath(colorCode, baseScore) {
  var colorName = JAR_SCORE_RESOURCE_COLOR_NAMES[colorCode];
  if (!colorName) {
    throw new Error("Unsupported jar score color: " + colorCode);
  }
  if (!Number.isInteger(baseScore) || !JAR_SCORE_RESOURCE_VALUES[baseScore]) {
    throw new Error("Unsupported jar base score sprite value: " + baseScore);
  }
  return "game/image/jar/" + colorName + "_" + baseScore;
}

var REWARD_ITEM_RESOURCES = {
  coin: "ui/image/props/coin",
  stamina: "ui/image/props/love"
};

var LOSE_STATUS_RESOURCES = {
  complete: "ui/image/lose/complete",
  incomplete: "ui/image/lose/un_complete"
};

var POWERUP_ICON_RESOURCES = {
  rainbow: "ui/image/props/rainbow_ball",
  swap: "ui/image/props/change_ball",
  blast: "ui/image/props/blast_ball",
  barrier_hammer: "ui/image/props/barrier_hammer",
  precise_aim: "ui/image/props/aim",
  snow_removal: "ui/image/props/snow_removal",
  three_line_elimination: "ui/image/props/three_line_elimination",
  plus_three_balls: "ui/image/props/plus_ball"
};

var FAIRY_ANIMATION_BUNDLE_NAME = "animation";
var EXPLODE_ANIMATION_CLIP_PATH = "explode";
var FIREWORKS_PREFAB_PATH = "prefabs/fireworks";
var BOARD_CLEAR_FIREWORKS_BURST_COUNT = 1;
var BOARD_CLEAR_FIREWORKS_INTERVAL_SEC = 1.1;

var HUD_STAR_RESOURCES = {
  lit: "game/image/ball/img101",
  unlit: "game/image/ball/img106"
};
var TOP_SLOT_STAR_RESOURCE = "game/top_star";
var GAME_RESOURCE_PATH_PREFIX = "game/";

var PREFAB_PATHS = {
  gameView: "game/prefabs/ui/GameView",
  hudPanel: "prefabs/ui/HudPanel",
  winView: "prefabs/ui/WinView",
  loseView: "prefabs/ui/LoseView",
  addBallTipsView: "prefabs/ui/AddBallTipsView",
  pauseView: "prefabs/ui/PauseView",
  propDescriptionView: "prefabs/ui/PropDescriptionView",
  bubbleItem: "game/prefabs/game/BubbleItem",
  fireBubbleItem: "game/prefabs/game/FireBubbleItem",
  splitBubbleItem: "game/prefabs/game/SplitBubbleItem",
  lockingBubbleItem: "game/prefabs/game/LockingBubbleItem",
  keyBubbleItem: "game/prefabs/game/KeyBubbleItem",
  jarItem: "game/prefabs/game/JarItem",
  shooterPanel: "game/prefabs/game/ShooterPanel",
  propsBtn: "game/prefabs/game/PropsBtn",
  previewBall: "game/prefabs/game/PreviewBall"
};

var JAR_RENDER_Y_OFFSET = Number(BoardLayout.jarRenderYOffset) || 0;
var GUIDE_DOT_SPACING = 42;
var GUIDE_DOT_RADIUS = 8;
var GUIDE_DOT_SIZE = GUIDE_DOT_RADIUS * 2;
var GUIDE_DOT_FAR_SCALE = 0.5;
var GUIDE_DOT_MAX_COUNT = 64;
var GUIDE_DOT_MIN_SCALE = 0.5;
var GUIDE_DOT_MAX_SCALE = 1;
var GUIDE_DOT_SPRITE_PATH = "game/image/ball/white_point";
var GUIDE_DOT_TINTS = {
  R: { r: 255, g: 80, b: 80 },
  G: { r: 78, g: 214, b: 100 },
  B: { r: 72, g: 150, b: 255 },
  Y: { r: 255, g: 211, b: 62 },
  P: { r: 184, g: 96, b: 255 },
  K: { r: 48, g: 48, b: 48 },
  O: { r: 255, g: 145, b: 45 },
  W: { r: 245, g: 245, b: 245 }
};
var BARRIER_HAMMER_HINT_SIZE = new cc.Size(46, 46);
var BARRIER_HAMMER_HINT_OFFSET_X = 16;
var BARRIER_HAMMER_HINT_OFFSET_Y = 18;
var BARRIER_HAMMER_HINT_TAP_OFFSET_X = -10;
var BARRIER_HAMMER_HINT_TAP_OFFSET_Y = -12;
var BARRIER_HAMMER_HINT_LIFT_DURATION = 0.16;
var BARRIER_HAMMER_HINT_STRIKE_DURATION = 0.12;
var BARRIER_HAMMER_HINT_PAUSE_DURATION = 0.1;

function resolveRefreshScope(runtimeSnapshot, options) {
  options = options || {};
  if (typeof options.scope === "string" && options.scope) {
    return options.scope;
  }
  if (runtimeSnapshot && typeof runtimeSnapshot.refreshScope === "string" && runtimeSnapshot.refreshScope) {
    return runtimeSnapshot.refreshScope;
  }
  return RUNTIME_REFRESH_SCOPE.FULL;
}

function assertValidRefreshScope(scope) {
  var valid = false;
  Object.keys(RUNTIME_REFRESH_SCOPE).forEach(function (key) {
    if (RUNTIME_REFRESH_SCOPE[key] === scope) {
      valid = true;
    }
  });
  if (!valid) {
    throw new Error("refreshRuntime requires valid scope: " + scope);
  }
}
var TEST_SLOT_RADIUS = Math.floor(BoardLayout.bubbleRadius * 0.88);
var SHOOTER_MAX_ROTATION = 75;
var ICE_OVERLAY_OPACITY = 255;
var BOARD_BUBBLE_SIZE = new cc.Size(BoardLayout.bubbleDiameter, BoardLayout.bubbleDiameter);
// vine_spirit.png and vines.png share a 140x172 raw canvas; render at exact half scale.
var VINE_VISUAL_SIZE = new cc.Size(70, 86);
var NEXT_SHOT_BUBBLE_SIZE = new cc.Size(50, 50);
var JAR_RENDER_SIZE = new cc.Size(
  Math.max(1, Number(BoardLayout.jarWidth) || 237),
  Math.max(1, Number(BoardLayout.jarHeight) || 230)
);
var POPUP_CONTENT_CONTAINER_NAME = "ContentContainer";
var POPUP_OPEN_ANIM_DURATION = 0.2;
var POPUP_OPEN_ANIM_FROM_SCALE = 0.82;
var WIN_POPUP_OPEN_ANIM_DURATION = 0.24;
var WIN_POPUP_OPEN_ANIM_FROM_SCALE = 0.72;
var WIN_STAR_ANIM_START_DELAY = 0.06;
var WIN_STAR_ANIM_STAGGER = 0.07;
var WIN_STAR_PUNCH_FROM_SCALE = 1.56;
var WIN_STAR_PUNCH_DOWN_SCALE = 0.9;
var WIN_STAR_SHRINK_DURATION = 0.2;
var WIN_STAR_RECOVER_DURATION = 0.08;
function requireImpactBounceTiming() {
  if (!SpecialAnimationTiming.impactBounce || typeof SpecialAnimationTiming.impactBounce !== "object") {
    throw new Error("SpecialAnimationTiming.impactBounce is required.");
  }
  return SpecialAnimationTiming.impactBounce;
}
var IMPACT_BOUNCE_TIMING = requireImpactBounceTiming();
var IMPACT_DEFAULT_PUSH_DISTANCE = IMPACT_BOUNCE_TIMING.defaultPushDistance;
var IMPACT_MIN_PUSH_DURATION = IMPACT_BOUNCE_TIMING.minPushDuration;
var IMPACT_MIN_RETURN_DURATION = IMPACT_BOUNCE_TIMING.minReturnDuration;
var IMPACT_RETURN_DURATION_RATIO = IMPACT_BOUNCE_TIMING.returnDurationRatio;
var SHOT_NO_DROP_SHAKE_OFFSET = 10;
var SHOT_NO_DROP_SHAKE_STEP_DURATION = 0.035;
var ROUTE_LINE_WIDTH_ACTIVE = 6;
var ROUTE_LINE_WIDTH_IDLE = 4;
var ROUTE_POINT_RADIUS_ACTIVE = 7;
var ROUTE_POINT_RADIUS_IDLE = 5;
var ICE_THAW_SHAKE_OFFSET = 7;
var ICE_THAW_SHAKE_STEP_DURATION = 0.04;
var ICE_COLLECT_FLY_DURATION = SpecialAnimationTiming.iceSnowballCollect.flyDuration;
var ICE_COLLECT_BEZIER_ARC = 120;
var ICE_COLLECT_FLY_Z_INDEX = 1100;
var ICE_COLLECT_FLY_EASE_RATE = 2;
var ICE_COLLECT_FLY_TWEEN_EASING = "quadIn";
var SPLITTER_SPAWN_FLY_DURATION = 0.36;
var SPLITTER_SPAWN_BEZIER_ARC = 96;
var COMMENT_ANIMATION_RESOURCES = {
  good: "ui/animation/comments/good",
  great: "ui/animation/comments/great",
  excellent: "ui/animation/comments/excellent",
  unbelievable: "ui/animation/comments/unbelievable"
};
var COMMENT_ANIMATION_TIERS = [
  { threshold: 12, key: "unbelievable" },
  { threshold: 10, key: "excellent" },
  { threshold: 7, key: "great" },
  { threshold: 5, key: "good" }
];
var COMMENT_ANIMATION_IN_DURATION = 0.2;
var COMMENT_ANIMATION_SETTLE_DURATION = 0.05;
var COMMENT_ANIMATION_HOLD_DURATION = 0.5;
var COMMENT_ANIMATION_OUT_DURATION = 0.3;
var COMMENT_ANIMATION_START_SCALE = 0.8;
var COMMENT_ANIMATION_PUNCH_SCALE = 1.1;
var COMMENT_ANIMATION_NORMAL_SCALE = 1;
var COMMENT_ANIMATION_OUT_SCALE = 1.3;
var LOSE_COIN_REVIVE_COST = 500;

var ROUTE_EDITOR_COLORS = [
  { r: 255, g: 195, b: 0 },
  { r: 53, g: 197, b: 255 },
  { r: 104, g: 211, b: 145 },
  { r: 255, g: 120, b: 120 },
  { r: 179, g: 132, b: 255 },
  { r: 255, g: 153, b: 68 }
];

function getCollectionObjectiveList(levelConfig) {
  if (!levelConfig || !levelConfig.level) {
    throw new Error("Level config is required for collection objectives.");
  }
  if (!Array.isArray(levelConfig.level.bonusObjectives)) {
    throw new Error("level.bonusObjectives must be an array for collection objectives.");
  }
  if (!Array.isArray(levelConfig.level.winConditions)) {
    throw new Error("level.winConditions must be an array for collection objectives.");
  }

  return levelConfig.level.bonusObjectives.concat(levelConfig.level.winConditions);
}

function hasIceSnowballCollectionObjective(levelConfig) {
  var objectives = getCollectionObjectiveList(levelConfig);
  for (var i = 0; i < objectives.length; i += 1) {
    var objective = objectives[i];
    if (objective && objective.type === "collect_ice_snowball") {
      return true;
    }
  }
  return false;
}

function findCollectionObjective(levelConfig) {
  var allObjectives = getCollectionObjectiveList(levelConfig);

  for (var i = 0; i < allObjectives.length; i += 1) {
    var objective = allObjectives[i];
    if (!objective || typeof objective.type !== "string") {
      throw new Error("Collection objective entry must include type.");
    }

    if (objective.type === "collect_any" || objective.type === "collect_color" || objective.type === "collect_ice_snowball") {
      return objective;
    }
  }

  return null;
}

function retainSpriteFrame(spriteFrame, path) {
  if (!spriteFrame) {
    throw new Error("Cannot retain empty sprite frame: " + path);
  }
  if (typeof spriteFrame.addRef !== "function") {
    throw new Error("SpriteFrame.addRef is required for gameplay sprite: " + path);
  }
  spriteFrame.addRef();
  return spriteFrame;
}

function releaseRetainedSpriteFrame(spriteFrame, path) {
  if (!spriteFrame) {
    return;
  }
  if (typeof spriteFrame.decRef !== "function") {
    throw new Error("SpriteFrame.decRef is required for gameplay sprite: " + path);
  }
  spriteFrame.decRef();
}

function releaseRetainedSpriteFramesByPrefix(cache, pathPrefix) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    throw new Error("LevelRenderer retained SpriteFrame cache must be an object.");
  }
  if (typeof pathPrefix !== "string" || pathPrefix.length === 0 || pathPrefix.charAt(pathPrefix.length - 1) !== "/") {
    throw new Error("LevelRenderer retained SpriteFrame path prefix must end with '/'.");
  }
  Object.keys(cache).forEach(function (path) {
    if (path.indexOf(pathPrefix) !== 0) {
      return;
    }
    var spriteFrame = cache[path];
    delete cache[path];
    releaseRetainedSpriteFrame(spriteFrame, path);
  });
}

function assertNoPendingSpriteFrameLoadsByPrefix(loadPromises, pathPrefix) {
  if (!loadPromises || typeof loadPromises !== "object" || Array.isArray(loadPromises)) {
    throw new Error("LevelRenderer SpriteFrame load promise cache must be an object.");
  }
  var pendingPaths = Object.keys(loadPromises).filter(function (path) {
    return path.indexOf(pathPrefix) === 0;
  });
  if (pendingPaths.length > 0) {
    throw new Error("Cannot release gameplay assets while SpriteFrames are still loading: " + pendingPaths.join(", "));
  }
}

function hasValidSpriteFrame(spriteFrame) {
  if (!spriteFrame) {
    return false;
  }
  if (cc && typeof cc.isValid === "function") {
    return cc.isValid(spriteFrame);
  }
  return true;
}

function pushUniqueSpritePath(paths, path, label) {
  if (typeof path !== "string" || !path) {
    throw new Error("Sprite path is required: " + label);
  }
  if (paths.indexOf(path) < 0) {
    paths.push(path);
  }
}

function pushBallSpritePath(paths, code, label) {
  if (!code) {
    return;
  }
  if (typeof code !== "string" || !BALL_RESOURCES[code]) {
    throw new Error("Unsupported ball sprite code for " + label + ": " + code);
  }
  pushUniqueSpritePath(paths, BALL_RESOURCES[code], label);
}

function collectBallVisualSpritePaths(paths, ballLike, label) {
  var code = resolveBallCode(ballLike);
  pushBallSpritePath(paths, code, label);
  if (
    ballLike &&
    typeof ballLike === "object" &&
    (
      ballLike.entityType === "vine_spirit" ||
      (typeof ballLike.vineOwnerId === "string" && ballLike.vineOwnerId) ||
      (typeof ballLike.vinePreviewOwnerId === "string" && ballLike.vinePreviewOwnerId)
    )
  ) {
    pushUniqueSpritePath(paths, BALL_RESOURCES.VINES, label + "/vines");
  }
  if (isIceBallLike(ballLike)) {
    pushUniqueSpritePath(paths, BALL_RESOURCES.ICE, label + "/ice_overlay");
  }
}

function collectRuntimeBoardSpritePaths(paths, runtimeSnapshot) {
  if (!runtimeSnapshot || runtimeSnapshot.board === undefined) {
    return;
  }
  if (!runtimeSnapshot.board || typeof runtimeSnapshot.board !== "object" || Array.isArray(runtimeSnapshot.board)) {
    throw new Error("Runtime board snapshot must be an object.");
  }
  if (!Array.isArray(runtimeSnapshot.board.cells)) {
    throw new Error("Runtime board snapshot cells must be an array.");
  }
  runtimeSnapshot.board.cells.forEach(function (cell, index) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Runtime board cell must be an object at index " + index + ".");
    }
    collectBallVisualSpritePaths(paths, cell, "runtime board cell " + index);
  });
}

function buildObjectiveDisplayForObjective(objective, runtimeSnapshot) {
  var jars = runtimeSnapshot && runtimeSnapshot.jars ? runtimeSnapshot.jars : null;
  var objectiveSnapshot = runtimeSnapshot && runtimeSnapshot.objectives ? runtimeSnapshot.objectives : null;

  if (!objective) {
    return {
      iconCode: null,
      progress: 0,
      target: 0,
      remaining: 0,
      remainingText: "0",
      progressText: "-"
    };
  }

  if (
    objectiveSnapshot &&
    typeof objectiveSnapshot.type === "string" &&
    objectiveSnapshot.type === objective.type
  ) {
    var snapshotProgress = Math.max(0, Number(objectiveSnapshot.progress) || 0);
    var snapshotTarget = Math.max(0, Number(objectiveSnapshot.target) || 0);
    var snapshotRemaining = Math.max(0, snapshotTarget - snapshotProgress);
    return {
      iconCode: objectiveSnapshot.iconCode || null,
      progress: snapshotProgress,
      target: snapshotTarget,
      remaining: snapshotRemaining,
      remainingText: String(snapshotRemaining),
      progressText: snapshotTarget > 0 ? (snapshotProgress + "/" + snapshotTarget) : String(snapshotProgress)
    };
  }

  var target = Math.max(0, Number(objective.value) || 0);
  if (objective.type === "collect_any") {
    var collectedAny = jars ? (Number(jars.collectedTotal) || 0) : 0;
    var progressAny = target > 0 ? Math.min(collectedAny, target) : collectedAny;
    return {
      iconCode: "RAINBOW",
      progress: progressAny,
      target: target,
      remaining: Math.max(0, target - progressAny),
      remainingText: String(Math.max(0, target - progressAny)),
      progressText: progressAny + "/" + target
    };
  }

  if (objective.type === "collect_color") {
    var colorCode = typeof objective.color === "string" ? objective.color : null;
    var collectedByColor = jars && jars.collectedByColor ? jars.collectedByColor : {};
    var collectedColor = colorCode ? (Number(collectedByColor[colorCode]) || 0) : 0;
    var progressColor = target > 0 ? Math.min(collectedColor, target) : collectedColor;
    return {
      iconCode: colorCode,
      progress: progressColor,
      target: target,
      remaining: Math.max(0, target - progressColor),
      remainingText: String(Math.max(0, target - progressColor)),
      progressText: progressColor + "/" + target
    };
  }

  if (objective.type === "collect_ice_snowball") {
    var iceCollected = objectiveSnapshot ? (Number(objectiveSnapshot.iceCollectedTotal) || 0) : 0;
    var iceProgress = target > 0 ? Math.min(iceCollected, target) : iceCollected;
    return {
      iconCode: "ICE_SNOWBALL",
      progress: iceProgress,
      target: target,
      remaining: Math.max(0, target - iceProgress),
      remainingText: String(Math.max(0, target - iceProgress)),
      progressText: iceProgress + "/" + target
    };
  }

  return {
    iconCode: null,
    progress: 0,
    target: 0,
    remaining: 0,
    remainingText: "0",
    progressText: "-"
  };
}

function buildObjectiveDisplayData(levelConfig, runtimeSnapshot) {
  return buildObjectiveDisplayForObjective(findCollectionObjective(levelConfig), runtimeSnapshot);
}

function buildHudTargetDisplayData(levelConfig, runtimeSnapshot) {
  var objectives = getCollectionObjectiveList(levelConfig);
  var ballObjective = null;
  var iceSnowballObjective = null;

  for (var i = 0; i < objectives.length; i += 1) {
    var objective = objectives[i];
    if (!objective || typeof objective.type !== "string") {
      throw new Error("HUD target objective entry must include type.");
    }

    if (
      !ballObjective &&
      (objective.type === "collect_any" || objective.type === "collect_color")
    ) {
      ballObjective = objective;
    } else if (!iceSnowballObjective && objective.type === "collect_ice_snowball") {
      iceSnowballObjective = objective;
    }
  }

  return {
    ball: ballObjective ? buildObjectiveDisplayForObjective(ballObjective, runtimeSnapshot) : null,
    iceSnowball: iceSnowballObjective ? buildObjectiveDisplayForObjective(iceSnowballObjective, runtimeSnapshot) : null
  };
}

function applyIceSnowballHudDisplayProgress(hudTargetDisplay, displayProgress) {
  if (!hudTargetDisplay || !hudTargetDisplay.iceSnowball) {
    return hudTargetDisplay;
  }
  if (!Number.isInteger(displayProgress) || displayProgress < 0) {
    throw new Error("Ice snowball HUD display progress must be a non-negative integer.");
  }

  var target = hudTargetDisplay.iceSnowball.target;
  if (!Number.isInteger(target) || target <= 0) {
    throw new Error("Ice snowball HUD display requires positive integer target.");
  }

  var progress = Math.min(displayProgress, target);
  var remaining = Math.max(0, target - progress);
  return {
    ball: hudTargetDisplay.ball,
    iceSnowball: {
      iconCode: hudTargetDisplay.iceSnowball.iconCode,
      progress: progress,
      target: target,
      remaining: remaining,
      remainingText: String(remaining),
      progressText: progress + "/" + target
    }
  };
}

function buildStateText(runtimeSnapshot) {
  if (runtimeSnapshot.state === "won") {
    return "";
  }

  if (runtimeSnapshot.state === "lost_danger") {
    return "触碰危险线";
  }

  if (runtimeSnapshot.state === "lost_objective") {
    return "目标未完成";
  }

  if (runtimeSnapshot.state === "out_of_shots_pending") {
    return "步数耗尽，等待掉落结算";
  }

  if (runtimeSnapshot.state === "out_of_shots_add_ball_prompt") {
    return "步数耗尽，等待加球确认";
  }

  if (runtimeSnapshot.state === "out_of_shots") {
    return "步数耗尽";
  }

  if (runtimeSnapshot.state === "won_surplus_shots_pending") {
    return "剩余球结算中";
  }

  if (runtimeSnapshot.state === "won_pending") {
    return "清屏结算中";
  }

  if (runtimeSnapshot.state === "won_settlement_pending") {
    return "";
  }

  var matched = runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution.matched.length : 0;
  var floating = runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution.floating.length : 0;
  if (matched || floating) {
    return "";
  }

  return "";
}

function buildResultTexts(runtimeSnapshot) {
  return null;
}

function resolveWinStarRating(levelConfig, runtimeSnapshot) {
  return StarRatingPolicy.calculateStarRatingFromSnapshot(runtimeSnapshot);
}

function buildHudRenderKey(levelConfig, runtimeSnapshot, iceSnowballDisplayProgress) {
  var levelCode = levelConfig && levelConfig.level ? levelConfig.level.code : "";
  var matched = runtimeSnapshot && runtimeSnapshot.lastResolution && runtimeSnapshot.lastResolution.matched
    ? runtimeSnapshot.lastResolution.matched.length
    : 0;
  var floating = runtimeSnapshot && runtimeSnapshot.lastResolution && runtimeSnapshot.lastResolution.floating
    ? runtimeSnapshot.lastResolution.floating.length
    : 0;
  var objectiveDisplay = buildObjectiveDisplayData(levelConfig, runtimeSnapshot);
  var hudTargetDisplay = buildHudTargetDisplayData(levelConfig, runtimeSnapshot);
  if (Number.isInteger(iceSnowballDisplayProgress) && iceSnowballDisplayProgress >= 0) {
    hudTargetDisplay = applyIceSnowballHudDisplayProgress(hudTargetDisplay, iceSnowballDisplayProgress);
  }

  return [
    levelCode,
    runtimeSnapshot ? runtimeSnapshot.state : "",
    runtimeSnapshot ? runtimeSnapshot.score : 0,
    runtimeSnapshot ? runtimeSnapshot.turnsUntilDrop : "",
    matched,
    floating,
    objectiveDisplay.progress || 0,
    objectiveDisplay.iconCode || "",
    objectiveDisplay.progressText ? objectiveDisplay.progressText : "",
    hudTargetDisplay.ball ? hudTargetDisplay.ball.remainingText : "",
    hudTargetDisplay.ball ? hudTargetDisplay.ball.progressText : "",
    hudTargetDisplay.ball ? hudTargetDisplay.ball.iconCode : "",
    hudTargetDisplay.iceSnowball ? hudTargetDisplay.iceSnowball.remainingText : "",
    hudTargetDisplay.iceSnowball ? hudTargetDisplay.iceSnowball.progressText : "",
    hudTargetDisplay.iceSnowball ? hudTargetDisplay.iceSnowball.iconCode : ""
  ].join("|");
}

function quantizeRenderValue(value, step) {
  return Math.round(value / step) * step;
}

function resolveRuntimeBallKey(ballLike) {
  if (!ballLike || typeof ballLike !== "object") {
    return "";
  }
  if (typeof ballLike.color === "string" && ballLike.color) {
    return ballLike.color;
  }
  if (typeof ballLike.entityType === "string" && ballLike.entityType) {
    return ballLike.entityType;
  }
  return "";
}

function buildBottomPanelRenderKey(runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    return "";
  }
  var shooter = runtimeSnapshot.shooter ? runtimeSnapshot.shooter : {};
  var skillInventory = shooter.skillInventory ? shooter.skillInventory : {};
  if (!Object.prototype.hasOwnProperty.call(skillInventory, "precise_aim")) {
    throw new Error("Bottom panel render key requires precise_aim count.");
  }
  var preciseAimCount = Number(skillInventory.precise_aim);
  if (!Number.isInteger(preciseAimCount) || preciseAimCount < 0) {
    throw new Error("Bottom panel render key precise_aim count must be a non-negative integer.");
  }
  if (!Object.prototype.hasOwnProperty.call(skillInventory, "snow_removal")) {
    throw new Error("Bottom panel render key requires snow_removal count.");
  }
  var snowRemovalCount = Number(skillInventory.snow_removal);
  if (!Number.isInteger(snowRemovalCount) || snowRemovalCount < 0) {
    throw new Error("Bottom panel render key snow_removal count must be a non-negative integer.");
  }
  var adRunPowerups = runtimeSnapshot.adRunPowerups ? runtimeSnapshot.adRunPowerups : {};
  var adRunPowerupAllowed = runtimeSnapshot.adRunPowerupAllowed ? runtimeSnapshot.adRunPowerupAllowed : {};
  if (!runtimeSnapshot.systems || !runtimeSnapshot.systems.boardOcclusionSystem) {
    throw new Error("Bottom panel render key requires board occlusion snapshot.");
  }
  var boardOcclusionVersion = runtimeSnapshot.systems.boardOcclusionSystem.version;
  if (!Number.isInteger(boardOcclusionVersion) || boardOcclusionVersion < 0) {
    throw new Error("Bottom panel render key requires non-negative board occlusion version.");
  }
  return [
    runtimeSnapshot.state || "",
    shooter.canUsePowerups ? 1 : 0,
    shooter.pendingBarrierHammer ? 1 : 0,
    shooter.pendingRainbowColorSelection ? 1 : 0,
    runtimeSnapshot.infiniteShots ? 1 : 0,
    Math.max(0, Math.floor(Number(skillInventory.rainbow) || 0)),
    Math.max(0, Math.floor(Number(skillInventory.blast) || 0)),
    Math.max(0, Math.floor(Number(skillInventory.swap) || 0)),
    Math.max(0, Math.floor(Number(skillInventory.barrier_hammer) || 0)),
    preciseAimCount,
    shooter.ricochetGuideActive === true ? 1 : 0,
    snowRemovalCount,
    Math.max(0, Math.floor(Number(adRunPowerups.three_line_elimination) || 0)),
    Math.max(0, Math.floor(Number(adRunPowerups.plus_three_balls) || 0)),
    adRunPowerupAllowed.three_line_elimination === true ? 1 : 0,
    adRunPowerupAllowed.plus_three_balls === true ? 1 : 0,
    boardOcclusionVersion
  ].join("|");
}

function buildShooterRenderKey(runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    return "";
  }
  var shooter = runtimeSnapshot.shooter ? runtimeSnapshot.shooter : {};
  var aim = shooter.aim ? shooter.aim : { origin: {}, direction: {} };
  var origin = aim.origin ? aim.origin : {};
  var direction = aim.direction ? aim.direction : {};
  var trajectory = shooter.trajectory;
  var projectile = runtimeSnapshot.activeProjectile;
  var rainbowSelection = shooter.pendingRainbowColorSelection;
  var rainbowColorsKey = rainbowSelection && Array.isArray(rainbowSelection.colors)
    ? rainbowSelection.colors.join(",")
    : "";
  return [
    runtimeSnapshot.remainingShots,
    shooter.infiniteShots ? 1 : 0,
    shooter.isAiming ? 1 : 0,
    shooter.ricochetGuideActive === true ? 1 : 0,
    shooter.canUsePowerups ? 1 : 0,
    shooter.pendingBarrierHammer ? 1 : 0,
    rainbowColorsKey,
    quantizeRenderValue(origin.x || 0, 0.5).toFixed(1),
    quantizeRenderValue(origin.y || 0, 0.5).toFixed(1),
    quantizeRenderValue(direction.x || 0, 0.001).toFixed(3),
    quantizeRenderValue(direction.y || 0, 0.001).toFixed(3),
    resolveRuntimeBallKey(shooter.currentBall || shooter.currentColor),
    resolveRuntimeBallKey(shooter.nextBall || shooter.nextColor),
    shooter.queueAdvanceRevision,
    shooter.surplusShotAimRecenterRevision,
    Math.max(0, Math.floor(Number(shooter.skillInventory && shooter.skillInventory.swap) || 0)),
    trajectory && trajectory.targetCell ? (trajectory.targetCell.row + ":" + trajectory.targetCell.col) : "",
    projectile && projectile.position
      ? (Math.round(projectile.position.x) + ":" + Math.round(projectile.position.y))
      : ""
  ].join("|");
}

function buildTimerRenderKey(runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    return "";
  }
  var jarSeconds = runtimeSnapshot.jarScoreBoostActive
    ? Math.ceil(Math.max(0, Number(runtimeSnapshot.jarScoreBoostRemainingMs) || 0) / 1000)
    : 0;
  var timedTick = runtimeSnapshot.timedLevel
    ? Math.ceil(Math.max(0, Number(runtimeSnapshot.remainingTimeMs) || 0) / 250)
    : -1;
  return [
    runtimeSnapshot.jarScoreBoostActive ? 1 : 0,
    jarSeconds,
    runtimeSnapshot.timedLevel ? 1 : 0,
    timedTick
  ].join("|");
}

function buildJarRenderKey(levelConfig, runtimeSnapshot) {
  var jarColors = levelConfig && levelConfig.level && Array.isArray(levelConfig.level.jarColors)
    ? levelConfig.level.jarColors
    : [];
  var progress = runtimeSnapshot && runtimeSnapshot.jars && runtimeSnapshot.jars.collectedByColor
    ? runtimeSnapshot.jars.collectedByColor
    : {};
  var zones = runtimeSnapshot &&
    runtimeSnapshot.systems &&
    runtimeSnapshot.systems.fallingMarbleSystem &&
    Array.isArray(runtimeSnapshot.systems.fallingMarbleSystem.jarZones)
    ? runtimeSnapshot.systems.fallingMarbleSystem.jarZones
    : [];

  var progressKey = jarColors.map(function (colorCode) {
    return colorCode + ":" + (progress[colorCode] || 0);
  }).join(",");
  var zoneKey = zones.map(function (zone) {
    return [
      zone.index,
      zone.x,
      zone.mouthY,
      zone.bottomY,
      zone.innerHalfWidth,
      zone.outerHalfWidth,
      zone.contactBand
    ].join(":");
  }).join(",");

  return progressKey + "|" + zoneKey;
}

function buildGuidePathKey(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) {
    return "";
  }

  return pathPoints.map(function (point) {
    return Math.round(point.x * 10) + ":" + Math.round(point.y * 10);
  }).join("|");
}

function pointDistance(a, b) {
  var dx = (b.x || 0) - (a.x || 0);
  var dy = (b.y || 0) - (a.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function clipGuidePathToDistance(pathPoints, maxDistance) {
  if (!pathPoints || pathPoints.length < 2) {
    return pathPoints;
  }

  var limit = Number(maxDistance);
  if (!isFinite(limit)) {
    return pathPoints;
  }

  if (limit <= 0) {
    return [pathPoints[0]];
  }

  var result = [{
    x: pathPoints[0].x,
    y: pathPoints[0].y
  }];
  var remaining = limit;
  var EPSILON = 0.0001;

  for (var index = 1; index < pathPoints.length; index += 1) {
    var from = pathPoints[index - 1];
    var to = pathPoints[index];
    var segmentLength = pointDistance(from, to);
    if (segmentLength <= EPSILON) {
      continue;
    }

    if (remaining >= segmentLength - EPSILON) {
      result.push({
        x: to.x,
        y: to.y
      });
      remaining -= segmentLength;
      continue;
    }

    var t = remaining / segmentLength;
    result.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t
    });
    break;
  }

  return result;
}

function measurePathDistance(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) {
    return 0;
  }

  var total = 0;
  for (var index = 1; index < pathPoints.length; index += 1) {
    total += pointDistance(pathPoints[index - 1], pathPoints[index]);
  }
  return total;
}

function resolveGuideFrontClipDistance(trajectory) {
  if (!trajectory || typeof trajectory.totalDistance !== "number") {
    return null;
  }

  var clipRadiusScale = Math.max(0, Number(BoardLayout.guideFrontClipRadiusScale) || 1);
  var tailClipDistance = BoardLayout.bubbleRadius * clipRadiusScale;
  if (trajectory.targetCellPosition && trajectory.collidedCellPosition) {
    var centerDistance = pointDistance(trajectory.targetCellPosition, trajectory.collidedCellPosition);
    tailClipDistance = (centerDistance * 0.5) * clipRadiusScale;
  }

  var frontDistance = Math.max(0, trajectory.totalDistance - tailClipDistance);

  if (trajectory.origin && trajectory.hitPoint) {
    var prefixPoints = [{
      x: trajectory.origin.x,
      y: trajectory.origin.y
    }];
    (trajectory.wallPoints || []).forEach(function (wallPoint) {
      prefixPoints.push({
        x: wallPoint.x,
        y: wallPoint.y
      });
    });
    prefixPoints.push({
      x: trajectory.hitPoint.x,
      y: trajectory.hitPoint.y
    });
    var distanceToHit = measurePathDistance(prefixPoints);
    if (isFinite(distanceToHit) && distanceToHit > 0) {
      frontDistance = Math.min(frontDistance, distanceToHit);
    }
  }

  return frontDistance;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveImpactBounceSpeed(impact) {
  var impactSpeed = Number(impact && impact.bounceSpeed);
  if (isFinite(impactSpeed) && impactSpeed > 0) {
    return Math.max(80, impactSpeed);
  }

  var boardBounceSpeed = Number(BoardLayout.impactBounceSpeed);
  if (!isFinite(boardBounceSpeed) || boardBounceSpeed <= 0) {
    throw new Error("BoardLayout.impactBounceSpeed must be a positive number.");
  }
  return Math.max(80, boardBounceSpeed);
}

function getJarBaseY() {
  return Number(BoardLayout.jarBaseY) || 0;
}

function resolveBallCode(ballLike) {
  if (!ballLike) {
    return null;
  }

  if (typeof ballLike === "string") {
    return ballLike;
  }

  if (typeof ballLike === "object") {
    if (typeof ballLike.color === "string" && ballLike.color) {
      return ballLike.color;
    }

    if (isIceBallLike(ballLike)) {
      var innerColor = resolveIceInnerColor(ballLike);
      if (innerColor) {
        return innerColor;
      }
    }

    if (ballLike.entityType === "rainbow") {
      return "RAINBOW";
    }

    if (ballLike.entityType === "blast") {
      return "BLAST";
    }

    if (ballLike.entityType === "stone") {
      return "STONE";
    }

    if (ballLike.entityType === "molotov") {
      return "MOLOTOV";
    }

    if (ballLike.entityType === "key") {
      return "KEY";
    }

    if (ballLike.entityType === "locked") {
      return "LOCKED";
    }

    if (ballLike.entityType === "splitter") {
      if (typeof ballLike.splitColor !== "string" || !BALL_RESOURCES["SPLIT_" + ballLike.splitColor]) {
        throw new Error("Splitter visual requires supported splitColor.");
      }
      return "SPLIT_" + ballLike.splitColor;
    }

    if (ballLike.entityType === "swirl") {
      return "SWIRL";
    }

    if (ballLike.entityType === "wormhole") {
      return "WORMHOLE";
    }

    if (ballLike.entityType === "vine_spirit") {
      return "VINE_SPIRIT";
    }
  }

  return null;
}

function isIceBallLike(ballLike) {
  return !!(
    ballLike &&
    typeof ballLike === "object" &&
    ballLike.entityCategory === "obstacle_ball" &&
    ballLike.entityType === "ice"
  );
}

function resolveIceInnerColor(ballLike) {
  if (!ballLike || typeof ballLike !== "object") {
    return null;
  }

  if (typeof ballLike.innerColor === "string" && ballLike.innerColor) {
    return ballLike.innerColor;
  }

  return null;
}

function resolveBallVisualKey(ballLike) {
  var code = resolveBallCode(ballLike) || "NONE";
  var iceFlag = isIceBallLike(ballLike) && !!resolveIceInnerColor(ballLike) ? "ICE" : "NORMAL";
  return code + "|" + iceFlag;
}

function computeShooterAngle(direction) {
  var dirX = direction && typeof direction.x === "number" ? direction.x : 0;
  var dirY = direction && typeof direction.y === "number" ? direction.y : 1;
  if (Math.abs(dirX) < 0.0001 && Math.abs(dirY) < 0.0001) {
    return 0;
  }

  // Shooter art faces up by default, so angle is measured from +Y axis.
  var rawAngle = Math.atan2(dirX, dirY) * 180 / Math.PI;
  return clamp(-rawAngle, -SHOOTER_MAX_ROTATION, SHOOTER_MAX_ROTATION);
}

function createRouteColor(index, isActive) {
  var base = ROUTE_EDITOR_COLORS[index % ROUTE_EDITOR_COLORS.length];
  return cc.color(base.r, base.g, base.b, isActive ? 255 : 190);
}

function LevelRenderer(rootNode) {
  this.rootNode = rootNode;
  this.spriteFrameCache = {};
  this.spriteFrameLoadPromises = {};
  this.fairyPrefabCache = {};
  this.fairyPrefabLoadPromises = {};
  this.fireworksPrefab = null;
  this.fireworksPrefabLoadPromise = null;
  this.explodeAnimationClip = null;
  this.explodeAnimationClipPromise = null;
  this.layers = null;
  this.prefabFactory = new PrefabFactory();
  this.bubbleShatterRenderer = new BubbleShatterRenderer({
    boardLayout: BoardLayout,
    ballResources: BALL_RESOURCES,
    resolveBallCode: resolveBallCode,
    bubbleWidth: BOARD_BUBBLE_SIZE.width,
    bubbleHeight: BOARD_BUBBLE_SIZE.height
  });
  this.wormholeShaderRenderer = new WormholeShaderRenderer();
  this.lightningChainRenderer = new LightningChainRenderer();
  this._sharedWarmupPromise = null;
  this.currentLevelConfig = null;
  this.lastRuntimeSnapshot = null;
  this.displayedIceSnowballCollectedTotal = 0;
  this.lastBoardVersion = -1;
  this.lastBoardViewportOffsetY = null;
  this.lastBoardOcclusionRenderKey = "";
  this.whiteMaskFrames = {};
  this.whiteMaskTextures = [];
  this.lastHudRenderKey = "";
  this.lastHudStarRating = null;
  this.hudStarDisplayedRating = null;
  this.hudStarQueuedRating = 0;
  this.hudStarAnimationQueue = [];
  this.hudStarAnimationActive = false;
  this.lastJarRenderKey = "";
  this.lastBottomPanelRenderKey = "";
  this.lastShooterRenderKey = "";
  this.lastTimerRenderKey = "";
  this.lastWinViewRenderKey = "";
  this.lastAddBallTipsViewRenderKey = "";
  this.lastRenderedFallingCount = 0;
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.lastGuideDotColorCode = null;
  this.guideDotNodes = [];
  this.gameplayInteractionEnabled = true;
  this.lastImpactSeq = -1;
  this.lastNoDropShakeEventId = -1;
  this.lastIceThawShakeSeq = -1;
  this.lastIceSnowballCollectEventId = -1;
  this.lastMatchedObjectiveCollectEventId = -1;
  this.lastSkillPowerupCollectedEventId = -1;
  this.skillPowerupCollectedFeedbackQueue = [];
  this.skillPowerupCollectedFeedbackActive = false;
  this.skillPowerupCollectedFeedbackActiveState = null;
  this.lastKeyUnlockAnimationKey = "";
  this.splitterSpawnAnimatedEntryKeys = {};
  this.splitterSpawnHiddenCellIds = {};
  this.molotovBlastHiddenCellIds = {};
  this.molotovBlastAnimatedIds = {};
  this.swirlRotationAnimatedIds = {};
  this.wormholeShiftAnimatedIds = {};
  this.wormholeDirectionGuideRoot = null;
  this.lastWormholeDirectionGuideKey = "";
  this.blastExplosionAnimatedIds = {};
  this.lastCommentResolution = null;
  this.boardClearFireworksRoot = null;
  this.boardClearFireworksActive = false;
  this.boardClearFireworksBurstSerial = 0;
  this.bottomPanelInitialBoardTargets = null;
  this.boardBubbleNodes = {};
  this.boardBubbleNodePool = {};
  this.boardCellRenderKeys = {};
  this.currentResolutionFloatingCellIds = {};
  this.boardRenderTick = 1;
  this.topSlotStarNodes = {};
  this.topSlotStarNodePool = [];
  this.topSlotStarRenderTick = 1;
  this.barrierHammerHintNodes = {};
  this.lastBarrierHammerHintKey = "";
  this.testSlotNodes = {};
  this.testSlotNodePool = [];
  this.testGridRenderTick = 1;
  this.fallingDropNodes = {};
  this.fallingDropNodePool = {};
  this.fallingRenderTick = 1;
  this.jarFractionNodePool = [];
  this.jarFractionDisplayGeneration = 0;
  this.jarFractionDisplaySerial = 0;
  this.lastJarCollectScoredEvent = null;
  this.ballScoreNodePool = [];
  this.ballScoreDisplayGeneration = 0;
  this.currentBallScoreResolution = null;
  this.playedBallScoreCellIds = {};
  this.pendingBallScoreCellIds = {};
  this.pendingBallScoreCallbacks = {};
  this.winActionHandlers = {
    onNextLevel: null,
    onRetryLevel: null
  };
  this.loseActionHandlers = {
    onRetryLevel: null,
    onBackLevel: null,
    onWatchAd: null,
    onCoinRevive: null
  };
  this.addBallTipsActionHandlers = {
    onClose: null,
    onWatchAd: null,
    onCoinBuy: null
  };
  this.pauseActionHandlers = {
    onContinue: null,
    onRetryLevel: null,
    onExitLevel: null
  };
  this.propDescriptionViewController = null;
  this.resultViewLifecycleHandlers = {
    onWinViewShow: null,
    onWinViewHide: null,
    onLoseViewShow: null,
    onLoseViewHide: null
  };
  this.loseAdPresentation = {
    showVideoIcon: true,
    showCoinIcon: false
  };
  this.loseCoinPresentation = {
    cost: LOSE_COIN_REVIVE_COST,
    getCoinCount: null
  };
  this.addBallTipsCoinPresentation = {
    cost: 0,
    getCoinCount: null
  };
  this.gameplayActionHandlers = {
    onBackToLevel: null,
    onOpenPause: null,
    onOpenSettings: null,
    onOpenPropDescription: null,
    onClosePropDescription: null,
    onUseRainbow: null,
    onUseBlast: null,
    onUseSwap: null,
    onUseBarrierHammer: null,
    onUseSnowRemoval: null,
    onUseThreeLineElimination: null,
    onUsePlusThreeBalls: null,
    onRecoverAdRunPowerupByAd: null,
    onSelectRainbowColor: null,
    onRecoverInventoryByAd: null
  };
}

LevelRenderer.prototype.setLoseAdPresentation = function (options) {
  options = options || {};
  var showVideoIcon = options.showVideoIcon === true;
  var showCoinIcon = options.showCoinIcon === true;
  if (showVideoIcon && showCoinIcon) {
    throw new Error("LoseView revive button cannot show video and coin icons at the same time.");
  }
  this.loseAdPresentation = {
    showVideoIcon: showVideoIcon,
    showCoinIcon: showCoinIcon
  };
};

LevelRenderer.prototype.setLoseCoinPresentation = function (options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("LoseView coin presentation options are required.");
  }
  var cost = Math.floor(Number(options.cost));
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error("LoseView coin revive cost must be a positive integer.");
  }
  if (typeof options.getCoinCount !== "function") {
    throw new Error("LoseView coin presentation requires getCoinCount.");
  }
  this.loseCoinPresentation = {
    cost: cost,
    getCoinCount: options.getCoinCount
  };
};

LevelRenderer.prototype.setAddBallTipsCoinPresentation = function (options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("AddBallTipsView coin presentation options are required.");
  }
  var cost = Math.floor(Number(options.cost));
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error("AddBallTipsView coin cost must be a positive integer.");
  }
  if (typeof options.getCoinCount !== "function") {
    throw new Error("AddBallTipsView coin presentation requires getCoinCount.");
  }
  this.addBallTipsCoinPresentation = {
    cost: cost,
    getCoinCount: options.getCoinCount
  };
};

LevelRenderer.prototype.warmupSharedAssets = function () {
  if (this._sharedWarmupPromise) {
    return this._sharedWarmupPromise;
  }

  this._sharedWarmupPromise = Promise.all([
    this._preloadSprites(this._collectCommonSpritePaths()),
    this._preloadFairyPrefabs(),
    this._preloadExplodeAnimationClip(),
    this._preloadFireworksPrefab(),
    this.prefabFactory.preload(this._collectPrefabPaths()),
    this.bubbleShatterRenderer.preload(),
    this.wormholeShaderRenderer.preload()
  ]).catch(function (error) {
    this._sharedWarmupPromise = null;
    throw error;
  }.bind(this));

  return this._sharedWarmupPromise;
};

LevelRenderer.prototype.preloadLightningChainEffect = function () {
  return BundleLoader.ensureGameplayBundleLoaded().then(function () {
    return this._preloadSprites(LightningChainRenderer.RESOURCE_PATHS);
  }.bind(this));
};

LevelRenderer.prototype.playLightningChainEffect = function (config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Board lightning chain config is required.");
  }
  if (!this.layers || !this.layers.shatter || !this.layers.shatter.isValid) {
    throw new Error("Board lightning chain requires rendered gameplay layers.");
  }
  if (!this.lastRuntimeSnapshot || !this.lastRuntimeSnapshot.board) {
    throw new Error("Board lightning chain requires current board snapshot.");
  }
  if (!Array.isArray(config.hitPoints) || config.hitPoints.length === 0) {
    throw new Error("Board lightning chain requires at least one hit point.");
  }

  var boardSnapshot = this.lastRuntimeSnapshot.board;
  if (!Array.isArray(boardSnapshot.cells)) {
    throw new Error("Board lightning chain requires board.cells.");
  }
  if (!Number.isInteger(boardSnapshot.maxColumns) || boardSnapshot.maxColumns <= 0) {
    throw new Error("Board lightning chain requires positive board.maxColumns.");
  }
  if (
    typeof boardSnapshot.viewportOffsetY !== "number" ||
    !isFinite(boardSnapshot.viewportOffsetY)
  ) {
    throw new Error("Board lightning chain requires finite board.viewportOffsetY.");
  }

  var resolvedHitPoints = config.hitPoints.map(function (hitPoint, index) {
    if (!hitPoint || typeof hitPoint !== "object" || Array.isArray(hitPoint)) {
      throw new Error("Board lightning chain hit point " + index + " must be an object.");
    }
    if (
      (typeof hitPoint.id !== "string" && typeof hitPoint.id !== "number") ||
      String(hitPoint.id).length === 0
    ) {
      throw new Error("Board lightning chain hit point " + index + " requires bubble id.");
    }
    if (!Number.isInteger(hitPoint.row) || !Number.isInteger(hitPoint.col)) {
      throw new Error("Board lightning chain hit point " + index + " requires integer row and col.");
    }

    var normalizedId = String(hitPoint.id);
    var boardCell = null;
    for (var cellIndex = 0; cellIndex < boardSnapshot.cells.length; cellIndex += 1) {
      var candidate = boardSnapshot.cells[cellIndex];
      if (
        candidate &&
        (typeof candidate.id === "string" || typeof candidate.id === "number") &&
        String(candidate.id) === normalizedId
      ) {
        boardCell = candidate;
        break;
      }
    }
    if (!boardCell) {
      throw new Error("Board lightning chain target is not present on the board: " + normalizedId);
    }
    if (boardCell.row !== hitPoint.row || boardCell.col !== hitPoint.col) {
      throw new Error("Board lightning chain target coordinates do not match bubble: " + normalizedId);
    }

    var position = BoardLayout.getCellPosition(
      hitPoint.row,
      hitPoint.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );
    return {
      id: normalizedId,
      x: position.x,
      y: position.y
    };
  });

  return this.lightningChainRenderer.play(
    this.layers.shatter,
    this.spriteFrameCache,
    {
      chainId: config.chainId,
      origin: config.origin,
      hitPoints: resolvedHitPoints,
      onHit: config.onHit
    }
  );
};

LevelRenderer.prototype.setWinActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.winActionHandlers = {
    onNextLevel: typeof handlers.onNextLevel === "function" ? handlers.onNextLevel : null,
    onRetryLevel: typeof handlers.onRetryLevel === "function" ? handlers.onRetryLevel : null
  };
};

LevelRenderer.prototype.setLoseActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.loseActionHandlers = {
    onRetryLevel: typeof handlers.onRetryLevel === "function" ? handlers.onRetryLevel : null,
    onBackLevel: typeof handlers.onBackLevel === "function" ? handlers.onBackLevel : null,
    onWatchAd: typeof handlers.onWatchAd === "function" ? handlers.onWatchAd : null,
    onCoinRevive: typeof handlers.onCoinRevive === "function" ? handlers.onCoinRevive : null
  };
};

LevelRenderer.prototype.setAddBallTipsActionHandlers = function (handlers) {
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    throw new Error("AddBallTipsView action handlers are required.");
  }
  if (typeof handlers.onClose !== "function") {
    throw new Error("AddBallTipsView requires onClose handler.");
  }
  if (typeof handlers.onWatchAd !== "function") {
    throw new Error("AddBallTipsView requires onWatchAd handler.");
  }
  if (typeof handlers.onCoinBuy !== "function") {
    throw new Error("AddBallTipsView requires onCoinBuy handler.");
  }
  this.addBallTipsActionHandlers = {
    onClose: handlers.onClose,
    onWatchAd: handlers.onWatchAd,
    onCoinBuy: handlers.onCoinBuy
  };
};

LevelRenderer.prototype.setPauseActionHandlers = function (handlers) {
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    throw new Error("PauseView action handlers are required.");
  }
  if (typeof handlers.onContinue !== "function") {
    throw new Error("PauseView requires onContinue handler.");
  }
  if (typeof handlers.onRetryLevel !== "function") {
    throw new Error("PauseView requires onRetryLevel handler.");
  }
  if (typeof handlers.onExitLevel !== "function") {
    throw new Error("PauseView requires onExitLevel handler.");
  }
  this.pauseActionHandlers = {
    onContinue: handlers.onContinue,
    onRetryLevel: handlers.onRetryLevel,
    onExitLevel: handlers.onExitLevel
  };
};

LevelRenderer.prototype.setResultViewLifecycleHandlers = function (handlers) {
  handlers = handlers || {};
  this.resultViewLifecycleHandlers = {
    onWinViewShow: typeof handlers.onWinViewShow === "function" ? handlers.onWinViewShow : null,
    onWinViewHide: typeof handlers.onWinViewHide === "function" ? handlers.onWinViewHide : null,
    onLoseViewShow: typeof handlers.onLoseViewShow === "function" ? handlers.onLoseViewShow : null,
    onLoseViewHide: typeof handlers.onLoseViewHide === "function" ? handlers.onLoseViewHide : null
  };
};

LevelRenderer.prototype.setGameplayActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.gameplayActionHandlers = {
    onBackToLevel: typeof handlers.onBackToLevel === "function" ? handlers.onBackToLevel : null,
    onOpenPause: typeof handlers.onOpenPause === "function" ? handlers.onOpenPause : null,
    onOpenSettings: typeof handlers.onOpenSettings === "function" ? handlers.onOpenSettings : null,
    onOpenPropDescription: typeof handlers.onOpenPropDescription === "function" ? handlers.onOpenPropDescription : null,
    onClosePropDescription: typeof handlers.onClosePropDescription === "function" ? handlers.onClosePropDescription : null,
    onUseRainbow: typeof handlers.onUseRainbow === "function" ? handlers.onUseRainbow : null,
    onUseBlast: typeof handlers.onUseBlast === "function" ? handlers.onUseBlast : null,
    onUseSwap: typeof handlers.onUseSwap === "function" ? handlers.onUseSwap : null,
    onUseBarrierHammer: typeof handlers.onUseBarrierHammer === "function" ? handlers.onUseBarrierHammer : null,
    onUseSnowRemoval: typeof handlers.onUseSnowRemoval === "function" ? handlers.onUseSnowRemoval : null,
    onUseThreeLineElimination: typeof handlers.onUseThreeLineElimination === "function" ? handlers.onUseThreeLineElimination : null,
    onUsePlusThreeBalls: typeof handlers.onUsePlusThreeBalls === "function" ? handlers.onUsePlusThreeBalls : null,
    onRecoverAdRunPowerupByAd: typeof handlers.onRecoverAdRunPowerupByAd === "function" ? handlers.onRecoverAdRunPowerupByAd : null,
    onSelectRainbowColor: typeof handlers.onSelectRainbowColor === "function" ? handlers.onSelectRainbowColor : null,
    onRecoverInventoryByAd: typeof handlers.onRecoverInventoryByAd === "function" ? handlers.onRecoverInventoryByAd : null
  };
};

LevelRenderer.prototype.setFallingMarbleSystem = function (fallingMarbleSystem, boardAdvancePresentationTarget) {
  if (
    !fallingMarbleSystem ||
    typeof fallingMarbleSystem.requestEliminationPresentationDropRelease !== "function"
  ) {
    throw new Error("LevelRenderer.setFallingMarbleSystem requires FallingMarbleSystem.");
  }
  if (
    boardAdvancePresentationTarget !== undefined &&
    (
      !boardAdvancePresentationTarget ||
      typeof boardAdvancePresentationTarget.notifyBoardAdvanceEliminationPresentationComplete !== "function"
    )
  ) {
    throw new Error("LevelRenderer.setFallingMarbleSystem requires board advance presentation target when provided.");
  }
  this.bubbleShatterRenderer.setPresentationCompleteHandler(function () {
    fallingMarbleSystem.requestEliminationPresentationDropRelease();
    if (boardAdvancePresentationTarget) {
      boardAdvancePresentationTarget.notifyBoardAdvanceEliminationPresentationComplete();
    }
  });
};

LevelRenderer.prototype._invokeWinAction = function (action) {
  var handler = null;
  if (action === "next") {
    handler = this.winActionHandlers.onNextLevel;
  } else if (action === "retry") {
    handler = this.winActionHandlers.onRetryLevel;
  } else if (action === "back") {
    handler = this.loseActionHandlers.onBackLevel;
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype._invokeLoseAction = function (action) {
  var handler = null;
  if (action === "retry") {
    handler = this.loseActionHandlers.onRetryLevel;
  } else if (action === "back") {
    handler = this.loseActionHandlers.onBackLevel;
  } else if (action === "ad") {
    handler = this.loseActionHandlers.onWatchAd;
  } else if (action === "coin") {
    handler = this.loseActionHandlers.onCoinRevive;
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype._invokeAddBallTipsAction = function (action) {
  var handler = null;
  if (action === "close") {
    handler = this.addBallTipsActionHandlers.onClose;
  } else if (action === "ad") {
    handler = this.addBallTipsActionHandlers.onWatchAd;
  } else if (action === "coin") {
    handler = this.addBallTipsActionHandlers.onCoinBuy;
  } else {
    throw new Error("Unsupported AddBallTipsView action: " + action);
  }

  if (typeof handler !== "function") {
    throw new Error("AddBallTipsView action handler is missing: " + action);
  }

  handler();
};

LevelRenderer.prototype._invokePauseAction = function (action) {
  var handler = null;
  if (action === "continue") {
    handler = this.pauseActionHandlers.onContinue;
  } else if (action === "retry") {
    handler = this.pauseActionHandlers.onRetryLevel;
  } else if (action === "exit") {
    handler = this.pauseActionHandlers.onExitLevel;
  } else {
    throw new Error("Unsupported PauseView action: " + action);
  }
  if (typeof handler !== "function") {
    throw new Error("PauseView action handler is missing: " + action);
  }
  handler();
};

LevelRenderer.prototype._invokeGameplayAction = function (action) {
  if (this.gameplayInteractionEnabled !== true) {
    return;
  }

  var handler = null;
  if (action === "back") {
    handler = this.gameplayActionHandlers.onBackToLevel;
  } else if (action === "open_pause") {
    handler = this.gameplayActionHandlers.onOpenPause;
  } else if (action === "open_settings") {
    handler = this.gameplayActionHandlers.onOpenSettings;
  } else if (action === "open_prop_description") {
    handler = this.gameplayActionHandlers.onOpenPropDescription;
  } else if (action === "close_prop_description") {
    handler = this.gameplayActionHandlers.onClosePropDescription;
  } else if (action === "use_rainbow") {
    handler = this.gameplayActionHandlers.onUseRainbow;
  } else if (action === "use_blast") {
    handler = this.gameplayActionHandlers.onUseBlast;
  } else if (action === "use_swap") {
    handler = this.gameplayActionHandlers.onUseSwap;
  } else if (action === "use_barrier_hammer") {
    handler = this.gameplayActionHandlers.onUseBarrierHammer;
  } else if (action === "use_snow_removal") {
    handler = this.gameplayActionHandlers.onUseSnowRemoval;
  } else if (action === "use_precise_aim") {
    handler = this.gameplayActionHandlers.onUsePreciseAim;
  } else if (action === "use_three_line_elimination") {
    handler = this.gameplayActionHandlers.onUseThreeLineElimination;
  } else if (action === "use_plus_three_balls") {
    handler = this.gameplayActionHandlers.onUsePlusThreeBalls;
  } else if (action.indexOf("select_rainbow_color:") === 0) {
    handler = this.gameplayActionHandlers.onSelectRainbowColor;
    if (typeof handler === "function") {
      handler(action.slice("select_rainbow_color:".length));
      return;
    }
  } else if (action.indexOf("recover_inventory:") === 0) {
    handler = this.gameplayActionHandlers.onRecoverInventoryByAd;
    if (typeof handler === "function") {
      handler(action.slice("recover_inventory:".length));
      return;
    }
  } else if (action.indexOf("recover_ad_powerup:") === 0) {
    handler = this.gameplayActionHandlers.onRecoverAdRunPowerupByAd;
    if (typeof handler === "function") {
      handler(action.slice("recover_ad_powerup:".length));
      return;
    }
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype.setGameplayInteractionEnabled = function (enabled) {
  if (typeof enabled !== "boolean") {
    throw new Error("Gameplay interaction enabled state must be boolean.");
  }
  this.gameplayInteractionEnabled = enabled;
};

LevelRenderer.prototype._notifyResultViewLifecycle = function (handlerName) {
  if (!this.resultViewLifecycleHandlers) {
    return;
  }
  var handler = this.resultViewLifecycleHandlers[handlerName];
  if (typeof handler === "function") {
    handler();
  }
};

LevelRenderer.prototype._notifyActiveResultViewsHidden = function () {
  if (!this.layers || !this.layers.modal) {
    return;
  }
  var winView = this.layers.modal.getChildByName("WinView");
  if (winView && winView.active) {
    this._notifyResultViewLifecycle("onWinViewHide");
  }
  var loseView = this.layers.modal.getChildByName("LoseView");
  if (loseView && loseView.active) {
    this._notifyResultViewLifecycle("onLoseViewHide");
  }
};

LevelRenderer.prototype.renderLevel = function (levelConfig, runtimeSnapshot) {
  this.lightningChainRenderer.reset("render_level");
  if (typeof this._stopBoardClearFireworks === "function") {
    this._stopBoardClearFireworks("render_level");
  }
  this._destroyWormholeDirectionGuide();
  if (typeof this._cancelSkillPowerupCollectedFeedback !== "function") {
    throw new Error("LevelRenderer requires collected skill powerup feedback cleanup.");
  }
  this._cancelSkillPowerupCollectedFeedback();
  this.currentLevelConfig = levelConfig;
  this.lastRuntimeSnapshot = runtimeSnapshot;
  this.displayedIceSnowballCollectedTotal = 0;
  this.lastBoardVersion = -1;
  this.lastBoardViewportOffsetY = null;
  this.lastBoardOcclusionRenderKey = "";
  this.lastHudRenderKey = "";
  this.lastHudStarRating = null;
  this.hudStarDisplayedRating = null;
  this.hudStarQueuedRating = 0;
  this.hudStarAnimationQueue = [];
  this.hudStarAnimationActive = false;
  this.lastJarRenderKey = "";
  this.lastBottomPanelRenderKey = "";
  this.lastShooterRenderKey = "";
  this.lastTimerRenderKey = "";
  this.lastRenderedFallingCount = 0;
  this.lastGuideDotsVisible = false;
  this.lastGuidePathKey = "";
  this.lastGuideDotColorCode = null;
  this.guideDotNodes = [];
  this.lastImpactSeq = -1;
  this.lastNoDropShakeEventId = -1;
  this.lastIceThawShakeSeq = -1;
  this.lastIceSnowballCollectEventId = -1;
  this.lastMatchedObjectiveCollectEventId = -1;
  this.lastSkillPowerupCollectedEventId = -1;
  this.skillPowerupCollectedFeedbackQueue = [];
  this.skillPowerupCollectedFeedbackActive = false;
  this.skillPowerupCollectedFeedbackActiveState = null;
  this.lastKeyUnlockAnimationKey = "";
  this.splitterSpawnAnimatedEntryKeys = {};
  this.splitterSpawnHiddenCellIds = {};
  this.molotovBlastHiddenCellIds = {};
  this.molotovBlastAnimatedIds = {};
  this.swirlRotationAnimatedIds = {};
  this.wormholeShiftAnimatedIds = {};
  this.wormholeDirectionGuideRoot = null;
  this.lastWormholeDirectionGuideKey = "";
  this.blastExplosionAnimatedIds = {};
  this.lastCommentResolution = null;
  this.boardClearFireworksRoot = null;
  this.boardClearFireworksActive = false;
  this.boardClearFireworksBurstSerial = 0;
  this.bottomPanelInitialBoardTargets = null;
  this.currentResolutionFloatingCellIds = {};
  this.boardRenderTick = 1;
  this.topSlotStarNodes = {};
  this.topSlotStarNodePool = [];
  this.topSlotStarRenderTick = 1;
  this.testSlotNodes = {};
  this.testSlotNodePool = [];
  this.testGridRenderTick = 1;
  this.fallingRenderTick = 1;
  this._ensureLayers();
  this.bubbleShatterRenderer.setLayer(this.layers.shatter);
  this.bubbleShatterRenderer.reset();
  this.setGameplayLayersVisible(true);

  var spritePaths = this._collectSpritePaths(levelConfig, runtimeSnapshot);

  return BundleLoader.ensureGameplayBundleLoaded().then(function () {
    return Promise.all([
      this.warmupSharedAssets(),
      this._preloadSprites(spritePaths)
    ]);
  }.bind(this)).then(function () {
    clearChildren(this.layers.background);
    clearChildren(this.layers.board);
    clearChildren(this.layers.boardOcclusion);
    this.wormholeDirectionGuideRoot = null;
    this.lastWormholeDirectionGuideKey = "";
    this.boardBubbleNodes = {};
    this.boardBubbleNodePool = {};
    this.boardCellRenderKeys = {};
    this.topSlotStarNodes = {};
    this.topSlotStarNodePool = [];
    this.barrierHammerHintNodes = {};
    this.lastBarrierHammerHintKey = "";
    clearChildren(this.layers.testGrid);
    this.testSlotNodes = {};
    this.testSlotNodePool = [];
    clearChildren(this.layers.falling);
    this.fallingDropNodes = {};
    this.fallingDropNodePool = {};
    clearChildren(this.layers.jarOcclusion);
    clearChildren(this.layers.jars);
    this._recycleJarFractionNodesBeforeHudClear();
    this._resetBallScoreHudBeforeHudClear();
    clearChildren(this.layers.hud);
    clearChildren(this.layers.dangerLine);
    clearChildren(this.layers.overlay);
    clearChildren(this.layers.comment);
    this._notifyActiveResultViewsHidden();
    clearChildren(this.layers.modal);
    this.lastWinViewRenderKey = "";
    this.lastAddBallTipsViewRenderKey = "";
    clearChildren(this.layers.routeEditor);
    clearChildren(this.layers.shooter);
    clearChildren(this.layers.testGrid);

    this._mountGameViewScaffold();
    this.syncBoardLayoutHudBottomLine();
    if (this._fairyAssistSystem) {
      this.syncFairyAssistCollisionCenters();
    }
    this._renderBackground();
    this._renderHud(levelConfig, runtimeSnapshot);
    this._initializeComboBatterHud();
    this._initializeFractionHud();
    this._initializeBallScoreHud();
    this._renderJarScoreBoostTimer(runtimeSnapshot);
    this._renderTimedLevelTimer(runtimeSnapshot);
    this._renderBottomPanel(runtimeSnapshot);
    this._queueSkillPowerupCollectedFeedback(runtimeSnapshot);
    this._renderBoard(runtimeSnapshot.board);
    this._renderBoardOcclusions(runtimeSnapshot);
    this._syncBarrierHammerStoneHints(runtimeSnapshot);
    this._renderMainland(runtimeSnapshot.board);
    this._renderJianbian(runtimeSnapshot.board);
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this._renderFairyAssists(runtimeSnapshot);
    this._renderFallingDrops(runtimeSnapshot);
    this._renderTestGrid(runtimeSnapshot.board);
    this._renderShooter(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile, runtimeSnapshot.remainingShots);
    this._renderWinView(runtimeSnapshot);
    this._renderAddBallTipsView(runtimeSnapshot);
    this._renderLoseView(runtimeSnapshot);
    this._renderResultPopup(runtimeSnapshot);
    this._syncDisplayedIceSnowballCollectedTotal(runtimeSnapshot);
    this.lastHudRenderKey = buildHudRenderKey(
      levelConfig,
      runtimeSnapshot,
      this._resolveIceSnowballHudDisplayProgress(runtimeSnapshot)
    );
    this.lastJarRenderKey = buildJarRenderKey(levelConfig, runtimeSnapshot);
    this.lastBottomPanelRenderKey = buildBottomPanelRenderKey(runtimeSnapshot);
    this.lastShooterRenderKey = buildShooterRenderKey(runtimeSnapshot);
    this.lastTimerRenderKey = buildTimerRenderKey(runtimeSnapshot);
    Logger.info("Rendered runtime view", levelConfig.level.code);
  }.bind(this));
};

LevelRenderer.prototype.refreshRuntime = function (levelConfig, runtimeSnapshot, options) {
  this.currentLevelConfig = levelConfig;
  this.lastRuntimeSnapshot = runtimeSnapshot;
  var scope = resolveRefreshScope(runtimeSnapshot, options);
  assertValidRefreshScope(scope);
  this._syncBoardClearFireworks(runtimeSnapshot);

  if (scope === RUNTIME_REFRESH_SCOPE.PROJECTILE) {
    this._refreshRuntimeProjectile(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.SHOOTER_AIM_ANGLE) {
    this._refreshRuntimeShooterAimAngle(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.SHOOTER_AIM) {
    this._refreshRuntimeShooterAim(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.FALLING) {
    this._refreshRuntimeFalling(runtimeSnapshot);
    return;
  }
  if (scope === RUNTIME_REFRESH_SCOPE.TIMER) {
    this._refreshRuntimeTimer(runtimeSnapshot);
    return;
  }

  this._refreshRuntimeFull(levelConfig, runtimeSnapshot);
};

LevelRenderer.prototype._refreshRuntimeProjectile = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.activeProjectile) {
    throw new Error("Projectile refresh scope requires activeProjectile.");
  }
  this._updateProjectileOnly(runtimeSnapshot.activeProjectile);
};

LevelRenderer.prototype._refreshRuntimeShooterAimAngle = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.shooter) {
    throw new Error("Shooter aim angle refresh scope requires shooter snapshot.");
  }
  this._renderShooterAimAngleOnly(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile);
};

LevelRenderer.prototype._refreshRuntimeShooterAim = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.shooter) {
    throw new Error("Shooter aim refresh scope requires shooter snapshot.");
  }
  this._renderShooter(
    runtimeSnapshot.shooter,
    runtimeSnapshot.activeProjectile,
    runtimeSnapshot.remainingShots
  );
  var nextShooterKey = buildShooterRenderKey(runtimeSnapshot);
  if (!runtimeSnapshot.activeProjectile) {
    this.lastShooterRenderKey = nextShooterKey;
  }
};

LevelRenderer.prototype._refreshRuntimeFalling = function (runtimeSnapshot) {
  var fallingSnapshot = runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var activeFallingCount = fallingSnapshot
    ? Math.max(0, Math.floor(Number(fallingSnapshot.activeDropCount) || 0))
    : 0;
  if (activeFallingCount > 0 || this.lastRenderedFallingCount > 0) {
    this._renderFallingDrops(runtimeSnapshot);
  }
  this._renderFairyAssists(runtimeSnapshot);
};

LevelRenderer.prototype._refreshRuntimeTimer = function (runtimeSnapshot) {
  var nextTimerKey = buildTimerRenderKey(runtimeSnapshot);
  if (nextTimerKey !== this.lastTimerRenderKey) {
    this._renderJarScoreBoostTimer(runtimeSnapshot);
    this._renderTimedLevelTimer(runtimeSnapshot);
    this.lastTimerRenderKey = nextTimerKey;
  }
};

LevelRenderer.prototype._refreshRuntimeFull = function (levelConfig, runtimeSnapshot) {
  var boardViewportOffsetY = runtimeSnapshot.board.viewportOffsetY;
  if (typeof boardViewportOffsetY !== "number" || !isFinite(boardViewportOffsetY)) {
    throw new Error("Runtime board viewportOffsetY must be a finite number.");
  }
  var boardChanged = runtimeSnapshot.board.version !== this.lastBoardVersion ||
    boardViewportOffsetY !== this.lastBoardViewportOffsetY;
  this.bubbleShatterRenderer.playResolution(
    runtimeSnapshot.lastResolution,
    runtimeSnapshot.board,
    this.boardBubbleNodes,
    this.spriteFrameCache
  );
  this._playBallScoreDisplay(runtimeSnapshot);
  if (boardChanged) {
    this._renderBoard(runtimeSnapshot.board);
    this._renderTestGrid(runtimeSnapshot.board);
    this._renderMainland(runtimeSnapshot.board);
    this._renderJianbian(runtimeSnapshot.board);
  }
  this._renderBoardOcclusions(runtimeSnapshot);
  this._playSwirlRotationAnimation(runtimeSnapshot);
  this._playWormholeShiftAnimation(runtimeSnapshot);
  this._syncBarrierHammerStoneHints(runtimeSnapshot);

  if (!this._shouldFlyIceSnowballToHud(levelConfig)) {
    this._syncDisplayedIceSnowballCollectedTotal(runtimeSnapshot);
  }

  var iceSnowballDisplayProgress = this._resolveIceSnowballHudDisplayProgress(runtimeSnapshot);
  var nextHudKey = buildHudRenderKey(levelConfig, runtimeSnapshot, iceSnowballDisplayProgress);
  if (nextHudKey !== this.lastHudRenderKey) {
    this._renderHud(levelConfig, runtimeSnapshot);
    this.lastHudRenderKey = nextHudKey;
  }

  var nextTimerKey = buildTimerRenderKey(runtimeSnapshot);
  if (nextTimerKey !== this.lastTimerRenderKey) {
    this._renderJarScoreBoostTimer(runtimeSnapshot);
    this._renderTimedLevelTimer(runtimeSnapshot);
    this.lastTimerRenderKey = nextTimerKey;
  }

  var nextBottomPanelKey = buildBottomPanelRenderKey(runtimeSnapshot);
  if (nextBottomPanelKey !== this.lastBottomPanelRenderKey) {
    this._renderBottomPanel(runtimeSnapshot);
    this.lastBottomPanelRenderKey = nextBottomPanelKey;
  }
  this._queueSkillPowerupCollectedFeedback(runtimeSnapshot);

  var nextJarKey = buildJarRenderKey(levelConfig, runtimeSnapshot);
  if (nextJarKey !== this.lastJarRenderKey) {
    this._renderBottomJars(levelConfig, runtimeSnapshot);
    this.lastJarRenderKey = nextJarKey;
  }

  var fallingSnapshot = runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var activeFallingCount = fallingSnapshot ? Math.max(0, Math.floor(Number(fallingSnapshot.activeDropCount) || 0)) : 0;
  if (activeFallingCount > 0 || this.lastRenderedFallingCount > 0) {
    this._renderFallingDrops(runtimeSnapshot);
  }
  this._renderFairyAssists(runtimeSnapshot);

  this._playIceThawShake(runtimeSnapshot);
  this._playMatchedObjectiveCollectFly(runtimeSnapshot);
  this._playIceSnowballCollectFly(runtimeSnapshot);
  this._playShotNoDropScreenShake(runtimeSnapshot);
  this._playComboBatterDisplay(runtimeSnapshot);
  this._playJarFractionDisplay(runtimeSnapshot);
  this._playImpactBounce(runtimeSnapshot);
  this._playKeyUnlockAnimation(runtimeSnapshot);
  this._playSplitterSpawnAnimation(runtimeSnapshot);
  this._playMolotovBlastAnimation(runtimeSnapshot);
  this._playBlastExplosionAnimation(runtimeSnapshot);
  this._playCommentAnimation(runtimeSnapshot);

  var hasActiveProjectile = !!(runtimeSnapshot.activeProjectile);
  var nextShooterKey = buildShooterRenderKey(runtimeSnapshot);
  if (hasActiveProjectile || nextShooterKey !== this.lastShooterRenderKey) {
    this._renderShooter(runtimeSnapshot.shooter, runtimeSnapshot.activeProjectile, runtimeSnapshot.remainingShots);
    if (!hasActiveProjectile) {
      this.lastShooterRenderKey = nextShooterKey;
    }
  }

  this._renderWinView(runtimeSnapshot);
  this._renderAddBallTipsView(runtimeSnapshot);
  this._renderLoseView(runtimeSnapshot);
  this._renderResultPopup(runtimeSnapshot);
};

LevelRenderer.RUNTIME_REFRESH_SCOPE = RUNTIME_REFRESH_SCOPE;

LevelRenderer.prototype._forEachGameplayLayer = function (callback) {
  if (typeof callback !== "function") {
    throw new Error("Gameplay layer callback must be a function.");
  }
  if (!this.layers) {
    return;
  }

  Object.keys(this.layers).forEach(function (layerKey) {
    var layerNode = this.layers[layerKey];
    if (!layerNode || !layerNode.isValid) {
      throw new Error("Gameplay layer node is missing or invalid: " + layerKey);
    }
    callback(layerNode, layerKey);
  }.bind(this));
};

LevelRenderer.prototype.setGameplayLayersVisible = function (visible) {
  if (typeof visible !== "boolean") {
    throw new Error("setGameplayLayersVisible requires boolean visible.");
  }
  if (!this.layers) {
    if (visible) {
      this._ensureLayers();
    }
    return;
  }

  if (!visible) {
    this.lightningChainRenderer.reset("hide_gameplay_layers");
    this._notifyActiveResultViewsHidden();
    if (typeof this._stopBoardClearFireworks === "function") {
      this._stopBoardClearFireworks("hide_gameplay_layers");
    }
  }

  this._forEachGameplayLayer(function (layerNode) {
    layerNode.active = visible;
  });
};

LevelRenderer.prototype._ensureLayers = function () {
  if (this.layers) {
    return;
  }

  this.layers = {
    background: this._getOrCreateLayer("BackgroundLayer", 0),
    dangerLine: this._getOrCreateLayer("DangerLineLayer", 10),
    jars: this._getOrCreateLayer("JarLayer", 20),
    shooter: this._getOrCreateLayer("ShooterLayer", 25),
    overlay: this._getOrCreateLayer("OverlayLayer", 30),
    board: this._getOrCreateLayer("BoardLayer", 40),
    boardOcclusion: this._getOrCreateLayer("BoardOcclusionLayer", 43),
    shatter: this._getOrCreateLayer("BubbleShatterLayer", 44),
    // 掉落球前置到固定球前方，提升层次与动效可见度。
    falling: this._getOrCreateLayer("FallingLayer", 45),
    // 罐体遮罩继续位于掉落球之上，保持“入缸后被遮挡”的视觉。
    jarOcclusion: this._getOrCreateLayer("JarOcclusionLayer", 46),
    testGrid: this._getOrCreateLayer("TestGridLayer", 47),
    routeEditor: this._getOrCreateLayer("RouteEditorLayer", 48),
    hud: this._getOrCreateLayer("HUDLayer", 50),
    comment: this._getOrCreateLayer("CommentLayer", 95),
    modal: this._getOrCreateLayer("ModalLayer", 100)
  };
};
LevelRenderer.prototype._getOrCreateLayer = function (name, zIndex) {
  var node = this.rootNode.getChildByName(name);
  if (!node) {
    node = new cc.Node(name);
    node.parent = this.rootNode;
  }

  if (this.rootNode && this.rootNode.getContentSize) {
    var rootSize = this.rootNode.getContentSize();
    if (rootSize && rootSize.width > 0 && rootSize.height > 0) {
      node.setContentSize(rootSize);
      node.setPosition(0, 0);
    }
  }

  node.zIndex = zIndex;
  return node;
};

LevelRenderer.prototype._collectSpritePaths = function (levelConfig, runtimeSnapshot) {
  var paths = this._collectCommonSpritePaths().slice();

  if (!levelConfig || !levelConfig.level || typeof levelConfig.level !== "object") {
    throw new Error("LevelRenderer sprite collection requires level config.");
  }

  var level = levelConfig.level;
  if (!Array.isArray(level.colors)) {
    throw new Error("LevelRenderer sprite collection requires level.colors.");
  }
  level.colors.forEach(function (colorCode, index) {
    pushBallSpritePath(paths, colorCode, "level.colors[" + index + "]");
  });

  if (!Array.isArray(level.jarColors)) {
    throw new Error("LevelRenderer sprite collection requires level.jarColors.");
  }
  level.jarColors.forEach(function (colorCode, index) {
    if (typeof colorCode !== "string" || !JAR_RESOURCES[colorCode] || !JAR_MASK_RESOURCES[colorCode]) {
      throw new Error("Unsupported jar color for level.jarColors[" + index + "]: " + colorCode);
    }
    var baseScore = JarScoreConfig.getBaseScoreForJarIndex(level.jarColors.length, index);
    pushUniqueSpritePath(paths, JAR_RESOURCES[colorCode], "level.jarColors[" + index + "]");
    pushUniqueSpritePath(paths, JAR_MASK_RESOURCES[colorCode], "level.jarColors[" + index + "]/mask");
    pushUniqueSpritePath(
      paths,
      resolveJarScoreSpritePath(colorCode, baseScore),
      "level.jarColors[" + index + "]/base-score"
    );
  });

  getCollectionObjectiveList(levelConfig).forEach(function (objective) {
    if (!objective || typeof objective.type !== "string") {
      throw new Error("Sprite preload objective entry must include type.");
    }
    if (objective.type === "collect_any") {
      pushUniqueSpritePath(paths, BALL_RESOURCES.RAINBOW, "collect_any objective");
      return;
    }
    if (objective.type === "collect_color") {
      pushBallSpritePath(paths, objective.color, "collect_color objective");
      return;
    }
    if (objective.type === "collect_ice_snowball") {
      pushUniqueSpritePath(paths, BALL_RESOURCES.ICE_SNOWBALL, "collect_ice_snowball objective");
      pushUniqueSpritePath(paths, BALL_RESOURCES.ICE, "collect_ice_snowball objective overlay");
    }
  });

  if (level.specialEntities !== undefined) {
    if (!Array.isArray(level.specialEntities)) {
      throw new Error("LevelRenderer sprite collection requires level.specialEntities array when present.");
    }
    level.specialEntities.forEach(function (entity, index) {
      collectBallVisualSpritePaths(paths, entity, "level.specialEntities[" + index + "]");
      if (entity && entity.entityType === "wormhole") {
        pushUniqueSpritePath(paths, WORMHOLE_DIRECTION_ARROW_RESOURCE, "wormhole direction guide");
      }
    });
  }
  if (!level.boardOcclusionPlan || !Array.isArray(level.boardOcclusionPlan.variants)) {
    throw new Error("LevelRenderer sprite collection requires level.boardOcclusionPlan.");
  }
  level.boardOcclusionPlan.variants.forEach(function (variant, variantIndex) {
    if (!variant || !Array.isArray(variant.zones)) {
      throw new Error("Board occlusion variant requires zones: " + variantIndex);
    }
    variant.zones.forEach(function (zone, zoneIndex) {
      if (!zone || !BOARD_OCCLUSION_RESOURCES[zone.visualType]) {
        throw new Error("Unsupported board occlusion visual type at " + variantIndex + ":" + zoneIndex);
      }
      if (!zone.clearRule || typeof zone.clearRule.kind !== "string") {
        throw new Error("Board occlusion zone requires clearRule at " + variantIndex + ":" + zoneIndex);
      }
      pushUniqueSpritePath(
        paths,
        BOARD_OCCLUSION_RESOURCES[zone.visualType],
        "board occlusion " + zone.visualType
      );
      if (zone.clearRule.kind === "item_or_seconds") {
        pushUniqueSpritePath(
          paths,
          BOARD_OCCLUSION_CLOCK_RESOURCE,
          "board occlusion countdown clock"
        );
      }
    });
  });

  collectRuntimeBoardSpritePaths(paths, runtimeSnapshot);

  if (runtimeSnapshot && runtimeSnapshot.shooter) {
    collectBallVisualSpritePaths(
      paths,
      runtimeSnapshot.shooter.currentBall !== undefined ? runtimeSnapshot.shooter.currentBall : runtimeSnapshot.shooter.currentColor,
      "runtime shooter current ball"
    );
    collectBallVisualSpritePaths(
      paths,
      runtimeSnapshot.shooter.nextBall !== undefined ? runtimeSnapshot.shooter.nextBall : runtimeSnapshot.shooter.nextColor,
      "runtime shooter next ball"
    );
  }

  if (runtimeSnapshot && runtimeSnapshot.activeProjectile) {
    collectBallVisualSpritePaths(
      paths,
      runtimeSnapshot.activeProjectile.ball !== undefined ? runtimeSnapshot.activeProjectile.ball : runtimeSnapshot.activeProjectile.color,
      "runtime active projectile"
    );
  }
  if (
    runtimeSnapshot &&
    runtimeSnapshot.shooter &&
    runtimeSnapshot.shooter.pendingRainbowColorSelection &&
    Array.isArray(runtimeSnapshot.shooter.pendingRainbowColorSelection.colors)
  ) {
    runtimeSnapshot.shooter.pendingRainbowColorSelection.colors.forEach(function (colorCode) {
      pushBallSpritePath(paths, colorCode, "pending rainbow color");
    });
  }

  var objectiveDisplay = buildObjectiveDisplayData(levelConfig, runtimeSnapshot);
  if (objectiveDisplay.iconCode) {
    pushBallSpritePath(paths, objectiveDisplay.iconCode, "objective display");
  }
  var hudTargetDisplay = buildHudTargetDisplayData(levelConfig, runtimeSnapshot);
  if (hudTargetDisplay.ball && hudTargetDisplay.ball.iconCode) {
    pushBallSpritePath(paths, hudTargetDisplay.ball.iconCode, "HUD target ball");
  }
  if (hudTargetDisplay.iceSnowball && hudTargetDisplay.iceSnowball.iconCode) {
    pushBallSpritePath(paths, hudTargetDisplay.iceSnowball.iconCode, "HUD ice snowball target");
    pushUniqueSpritePath(paths, BALL_RESOURCES.ICE, "HUD ice snowball overlay");
  }

  if (level.clearRewardItems !== undefined) {
    if (!Array.isArray(level.clearRewardItems)) {
      throw new Error("LevelRenderer sprite collection requires level.clearRewardItems array when present.");
    }
    level.clearRewardItems.forEach(function (rewardItem) {
      if (!rewardItem || !REWARD_ITEM_RESOURCES[rewardItem.id]) {
        throw new Error("Unsupported level clear reward item id: " + (rewardItem && rewardItem.id));
      }
      pushUniqueSpritePath(paths, REWARD_ITEM_RESOURCES[rewardItem.id], "level clear reward " + rewardItem.id);
    });
  }

  return paths.filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._collectRetainedSpritePaths = function () {
  return this._collectCommonSpritePaths().filter(function (path, index, list) {
    return !!path && list.indexOf(path) === index;
  });
};

LevelRenderer.prototype.releaseLevelSpecificSpriteCache = function () {
  var retainPaths = {};
  this._collectRetainedSpritePaths().forEach(function (path) {
    retainPaths[path] = true;
  });

  Object.keys(this.spriteFrameCache).forEach(function (path) {
    if (retainPaths[path]) {
      return;
    }
    var spriteFrame = this.spriteFrameCache[path];
    delete this.spriteFrameCache[path];
    releaseRetainedSpriteFrame(spriteFrame, path);
  }.bind(this));
};

LevelRenderer.prototype.releaseAfterGameplayBundleUnload = function () {
  this.lightningChainRenderer.reset("gameplay_bundle_unload");
  if (typeof this._releaseJarFractionNodesBeforeGameplayBundleUnload !== "function") {
    throw new Error("LevelRenderer requires jar fraction bundle release cleanup.");
  }
  this._releaseJarFractionNodesBeforeGameplayBundleUnload();
  assertNoPendingSpriteFrameLoadsByPrefix(this.spriteFrameLoadPromises, GAME_RESOURCE_PATH_PREFIX);
  releaseRetainedSpriteFramesByPrefix(this.spriteFrameCache, GAME_RESOURCE_PATH_PREFIX);
  this.fairyPrefabCache = {};
  this.fairyPrefabLoadPromises = {};
  this.fireworksPrefab = null;
  this.fireworksPrefabLoadPromise = null;
  this.explodeAnimationClip = null;
  this.explodeAnimationClipPromise = null;
  this._sharedWarmupPromise = null;
  if (!this.bubbleShatterRenderer || typeof this.bubbleShatterRenderer.releaseAfterGameplayBundleUnload !== "function") {
    throw new Error("LevelRenderer requires BubbleShatterRenderer.releaseAfterGameplayBundleUnload.");
  }
  this.bubbleShatterRenderer.releaseAfterGameplayBundleUnload();
  if (!this.wormholeShaderRenderer || typeof this.wormholeShaderRenderer.releaseAfterGameplayBundleUnload !== "function") {
    throw new Error("LevelRenderer requires WormholeShaderRenderer.releaseAfterGameplayBundleUnload.");
  }
  this.wormholeShaderRenderer.releaseAfterGameplayBundleUnload();
  if (this.prefabFactory && typeof this.prefabFactory.releaseLoadedCacheByPrefix === "function") {
    this.prefabFactory.releaseLoadedCacheByPrefix(GAME_RESOURCE_PATH_PREFIX);
  } else {
    throw new Error("LevelRenderer requires PrefabFactory.releaseLoadedCacheByPrefix.");
  }
  this.lastHudRenderKey = "";
  this.lastJarRenderKey = "";
  this.lastBottomPanelRenderKey = "";
  this.lastShooterRenderKey = "";
  this.lastTimerRenderKey = "";
  this.lastWinViewRenderKey = "";
  this.lastAddBallTipsViewRenderKey = "";
  this.bottomPanelInitialBoardTargets = null;
};

LevelRenderer.prototype._setGuideDotsActiveCount = function (guideCanvas, count, dotFrame, dotTint) {
  var required = Math.max(0, Math.floor(Number(count) || 0));
  if (required > 0 && !dotTint) {
    throw new Error("Guide dots require a color tint when visible.");
  }
  for (var index = 0; index < required; index += 1) {
    var dotNode = this.guideDotNodes[index];
    if (!dotNode || !cc.isValid(dotNode)) {
      dotNode = new cc.Node("GuideDot_" + index);
      dotNode.__guideDotFrame = null;
      this.guideDotNodes[index] = dotNode;
    }

    if (dotNode.parent !== guideCanvas) {
      dotNode.parent = guideCanvas;
    }

    if (dotNode.__guideDotFrame !== dotFrame) {
      ensureSprite(dotNode, dotFrame);
      dotNode.setContentSize(GUIDE_DOT_SIZE, GUIDE_DOT_SIZE);
      dotNode.__guideDotFrame = dotFrame;
    }

    dotNode.active = true;
    dotNode.opacity = 255;
    dotNode.scale = 1;
    dotNode.color = cc.color(dotTint.r, dotTint.g, dotTint.b);
  }

  for (var recycleIndex = required; recycleIndex < this.guideDotNodes.length; recycleIndex += 1) {
    var inactiveNode = this.guideDotNodes[recycleIndex];
    if (inactiveNode && cc.isValid(inactiveNode)) {
      inactiveNode.stopAllActions();
      inactiveNode.scale = 1;
      inactiveNode.active = false;
    }
  }
};

LevelRenderer.prototype._collectCommonSpritePaths = function () {
  var paths = [
    GUIDE_DOT_SPRITE_PATH,
    BALL_RESOURCES.RAINBOW,
    BALL_RESOURCES.BLAST,
    BALL_RESOURCES.BLOCKADE_LINE,
    BALL_RESOURCES.LIGHT,
    BALL_RESOURCES.SNOW_REMOVAL_TOOLS,
    HUD_STAR_RESOURCES.lit,
    HUD_STAR_RESOURCES.unlit,
    TOP_SLOT_STAR_RESOURCE,
    LOSE_STATUS_RESOURCES.complete,
    LOSE_STATUS_RESOURCES.incomplete,
    REWARD_ITEM_RESOURCES.coin,
    REWARD_ITEM_RESOURCES.stamina,
    POWERUP_ICON_RESOURCES.rainbow,
    POWERUP_ICON_RESOURCES.swap,
    POWERUP_ICON_RESOURCES.blast,
    POWERUP_ICON_RESOURCES.barrier_hammer,
    POWERUP_ICON_RESOURCES.precise_aim,
    POWERUP_ICON_RESOURCES.snow_removal,
    POWERUP_ICON_RESOURCES.three_line_elimination,
    POWERUP_ICON_RESOURCES.plus_three_balls,
    COMMENT_ANIMATION_RESOURCES.good,
    COMMENT_ANIMATION_RESOURCES.great,
    COMMENT_ANIMATION_RESOURCES.excellent,
    COMMENT_ANIMATION_RESOURCES.unbelievable
  ];
  LightningChainRenderer.RESOURCE_PATHS.forEach(function (path) {
    paths.push(path);
  });
  PropDescriptionConfig.getAllIconPaths().forEach(function (path) {
    paths.push(path);
  });
  return paths.filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._collectPrefabPaths = function () {
  var preloadPaths = [
    PREFAB_PATHS.gameView,
    PREFAB_PATHS.winView,
    PREFAB_PATHS.loseView,
    PREFAB_PATHS.addBallTipsView,
    PREFAB_PATHS.pauseView,
    PREFAB_PATHS.propDescriptionView,
    PREFAB_PATHS.shooterPanel,
    PREFAB_PATHS.propsBtn,
    PREFAB_PATHS.bubbleItem,
    PREFAB_PATHS.fireBubbleItem,
    PREFAB_PATHS.splitBubbleItem,
    PREFAB_PATHS.lockingBubbleItem,
    PREFAB_PATHS.keyBubbleItem,
    PREFAB_PATHS.jarItem,
    PREFAB_PATHS.previewBall
  ];

  return preloadPaths.filter(function (path, index, list) {
    return !!path && list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._collectFairyPrefabPaths = function () {
  return FairyAssistConfig.colorRules.map(function (rule) {
    if (!rule || typeof rule.prefabPath !== "string" || !rule.prefabPath) {
      throw new Error("Fairy prefab path is required for color rule.");
    }
    return rule.prefabPath;
  }).filter(function (path, index, list) {
    return list.indexOf(path) === index;
  });
};

LevelRenderer.prototype._preloadFairyPrefabs = function () {
  var paths = this._collectFairyPrefabPaths();
  return BundleLoader.ensureNamedBundleLoaded(FAIRY_ANIMATION_BUNDLE_NAME).then(function (bundle) {
    return Promise.all(paths.map(function (path) {
      if (this.fairyPrefabCache[path]) {
        return Promise.resolve(this.fairyPrefabCache[path]);
      }
      if (this.fairyPrefabLoadPromises[path]) {
        return this.fairyPrefabLoadPromises[path];
      }

      this.fairyPrefabLoadPromises[path] = new Promise(function (resolve, reject) {
        if (!bundle || typeof bundle.load !== "function") {
          reject(new Error("Fairy animation bundle is invalid."));
          return;
        }
        bundle.load(path, cc.Prefab, function (error, prefab) {
          if (error) {
            reject(new Error("Load fairy prefab failed `" + FAIRY_ANIMATION_BUNDLE_NAME + "/" + path + "`: " + error.message));
            return;
          }
          if (!prefab) {
            reject(new Error("Load fairy prefab returned empty asset: " + FAIRY_ANIMATION_BUNDLE_NAME + "/" + path));
            return;
          }
          this.fairyPrefabCache[path] = prefab;
          delete this.fairyPrefabLoadPromises[path];
          resolve(prefab);
        }.bind(this));
      }.bind(this)).catch(function (error) {
        delete this.fairyPrefabLoadPromises[path];
        throw error;
      }.bind(this));
      return this.fairyPrefabLoadPromises[path];
    }, this));
  }.bind(this));
};

LevelRenderer.prototype._preloadExplodeAnimationClip = function () {
  if (this.explodeAnimationClip) {
    return Promise.resolve(this.explodeAnimationClip);
  }
  if (this.explodeAnimationClipPromise) {
    return this.explodeAnimationClipPromise;
  }

  this.explodeAnimationClipPromise = BundleLoader.ensureNamedBundleLoaded(FAIRY_ANIMATION_BUNDLE_NAME).then(function (bundle) {
    return new Promise(function (resolve, reject) {
      if (!bundle || typeof bundle.load !== "function") {
        reject(new Error("Explode animation bundle is invalid."));
        return;
      }
      bundle.load(EXPLODE_ANIMATION_CLIP_PATH, cc.AnimationClip, function (error, clip) {
        if (error) {
          reject(new Error("Load explode animation clip failed `" + FAIRY_ANIMATION_BUNDLE_NAME + "/" + EXPLODE_ANIMATION_CLIP_PATH + "`: " + error.message));
          return;
        }
        if (!clip) {
          reject(new Error("Load explode animation clip returned empty asset: " + FAIRY_ANIMATION_BUNDLE_NAME + "/" + EXPLODE_ANIMATION_CLIP_PATH));
          return;
        }
        if (typeof clip.duration !== "number" || !isFinite(clip.duration) || clip.duration <= 0) {
          reject(new Error("Explode animation clip duration is invalid: " + clip.duration));
          return;
        }
        this.explodeAnimationClip = clip;
        this.explodeAnimationClipPromise = null;
        resolve(clip);
      }.bind(this));
    }.bind(this));
  }.bind(this)).catch(function (error) {
    this.explodeAnimationClipPromise = null;
    throw error;
  }.bind(this));

  return this.explodeAnimationClipPromise;
};

LevelRenderer.prototype._preloadFireworksPrefab = function () {
  if (this.fireworksPrefab) {
    return Promise.resolve(this.fireworksPrefab);
  }
  if (this.fireworksPrefabLoadPromise) {
    return this.fireworksPrefabLoadPromise;
  }

  this.fireworksPrefabLoadPromise = BundleLoader.ensureNamedBundleLoaded(FAIRY_ANIMATION_BUNDLE_NAME).then(function (bundle) {
    return new Promise(function (resolve, reject) {
      if (!bundle || typeof bundle.load !== "function") {
        reject(new Error("Fireworks animation bundle is invalid."));
        return;
      }
      bundle.load(FIREWORKS_PREFAB_PATH, cc.Prefab, function (error, prefab) {
        if (error) {
          reject(new Error("Load fireworks prefab failed `" + FAIRY_ANIMATION_BUNDLE_NAME + "/" + FIREWORKS_PREFAB_PATH + "`: " + error.message));
          return;
        }
        if (!prefab) {
          reject(new Error("Load fireworks prefab returned empty asset: " + FAIRY_ANIMATION_BUNDLE_NAME + "/" + FIREWORKS_PREFAB_PATH));
          return;
        }
        this.fireworksPrefab = prefab;
        this.fireworksPrefabLoadPromise = null;
        resolve(prefab);
      }.bind(this));
    }.bind(this));
  }.bind(this)).catch(function (error) {
    this.fireworksPrefabLoadPromise = null;
    throw error;
  }.bind(this));

  return this.fireworksPrefabLoadPromise;
};

LevelRenderer.prototype._preloadSprites = function (paths) {
  return Promise.all(paths.map(function (path) {
    var cachedSpriteFrame = this.spriteFrameCache[path];
    if (cachedSpriteFrame) {
      if (hasValidSpriteFrame(cachedSpriteFrame)) {
        return Promise.resolve(cachedSpriteFrame);
      }
      delete this.spriteFrameCache[path];
    }
    if (this.spriteFrameLoadPromises[path]) {
      return this.spriteFrameLoadPromises[path];
    }

    this.spriteFrameLoadPromises[path] = loadSpriteFrame(path).then(function (spriteFrame) {
      this.spriteFrameCache[path] = retainSpriteFrame(spriteFrame, path);
      delete this.spriteFrameLoadPromises[path];
      return this.spriteFrameCache[path];
    }.bind(this)).catch(function (error) {
      delete this.spriteFrameLoadPromises[path];
      throw error;
    }.bind(this));
    return this.spriteFrameLoadPromises[path];
  }, this));
};

var LEVEL_RENDERER_SCENE_DEPS = {
  Logger: Logger,
  DebugFlags: DebugFlags,
  BoardLayout: BoardLayout,
  SpecialAnimationTiming: SpecialAnimationTiming,
  BALL_RESOURCES: BALL_RESOURCES,
  WORMHOLE_DIRECTION_ARROW_RESOURCE: WORMHOLE_DIRECTION_ARROW_RESOURCE,
  WORMHOLE_DIRECTION_ARROW_SIZE: WORMHOLE_DIRECTION_ARROW_SIZE,
  WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE: WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE,
  WORMHOLE_DIRECTION_ARROW_STAGGER: WORMHOLE_DIRECTION_ARROW_STAGGER,
  WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION: WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION,
  WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION: WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION,
  WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE: WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE,
  LOSE_STATUS_RESOURCES: LOSE_STATUS_RESOURCES,
  JAR_RESOURCES: JAR_RESOURCES,
  JAR_MASK_RESOURCES: JAR_MASK_RESOURCES,
  resolveJarScoreSpritePath: resolveJarScoreSpritePath,
  REWARD_ITEM_RESOURCES: REWARD_ITEM_RESOURCES,
  POWERUP_ICON_RESOURCES: POWERUP_ICON_RESOURCES,
  HUD_STAR_RESOURCES: HUD_STAR_RESOURCES,
  TOP_SLOT_STAR_RESOURCE: TOP_SLOT_STAR_RESOURCE,
  PREFAB_PATHS: PREFAB_PATHS,
  JAR_RENDER_Y_OFFSET: JAR_RENDER_Y_OFFSET,
  GUIDE_DOT_SPACING: GUIDE_DOT_SPACING,
  GUIDE_DOT_RADIUS: GUIDE_DOT_RADIUS,
  GUIDE_DOT_SIZE: GUIDE_DOT_SIZE,
  GUIDE_DOT_FAR_SCALE: GUIDE_DOT_FAR_SCALE,
  GUIDE_DOT_MAX_COUNT: GUIDE_DOT_MAX_COUNT,
  GUIDE_DOT_SPRITE_PATH: GUIDE_DOT_SPRITE_PATH,
  GUIDE_DOT_TINTS: GUIDE_DOT_TINTS,
  BARRIER_HAMMER_HINT_SIZE: BARRIER_HAMMER_HINT_SIZE,
  BARRIER_HAMMER_HINT_OFFSET_X: BARRIER_HAMMER_HINT_OFFSET_X,
  BARRIER_HAMMER_HINT_OFFSET_Y: BARRIER_HAMMER_HINT_OFFSET_Y,
  BARRIER_HAMMER_HINT_TAP_OFFSET_X: BARRIER_HAMMER_HINT_TAP_OFFSET_X,
  BARRIER_HAMMER_HINT_TAP_OFFSET_Y: BARRIER_HAMMER_HINT_TAP_OFFSET_Y,
  BARRIER_HAMMER_HINT_LIFT_DURATION: BARRIER_HAMMER_HINT_LIFT_DURATION,
  BARRIER_HAMMER_HINT_STRIKE_DURATION: BARRIER_HAMMER_HINT_STRIKE_DURATION,
  BARRIER_HAMMER_HINT_PAUSE_DURATION: BARRIER_HAMMER_HINT_PAUSE_DURATION,
  TEST_SLOT_RADIUS: TEST_SLOT_RADIUS,
  FairyAssistConfig: FairyAssistConfig,
  ICE_OVERLAY_OPACITY: ICE_OVERLAY_OPACITY,
  BOARD_BUBBLE_SIZE: BOARD_BUBBLE_SIZE,
  BOARD_OCCLUSION_RESOURCES: BOARD_OCCLUSION_RESOURCES,
  BOARD_OCCLUSION_CLOCK_RESOURCE: BOARD_OCCLUSION_CLOCK_RESOURCE,
  VINE_VISUAL_SIZE: VINE_VISUAL_SIZE,
  NEXT_SHOT_BUBBLE_SIZE: NEXT_SHOT_BUBBLE_SIZE,
  JAR_RENDER_SIZE: JAR_RENDER_SIZE,
  POPUP_CONTENT_CONTAINER_NAME: POPUP_CONTENT_CONTAINER_NAME,
  POPUP_OPEN_ANIM_DURATION: POPUP_OPEN_ANIM_DURATION,
  POPUP_OPEN_ANIM_FROM_SCALE: POPUP_OPEN_ANIM_FROM_SCALE,
  WIN_POPUP_OPEN_ANIM_DURATION: WIN_POPUP_OPEN_ANIM_DURATION,
  WIN_POPUP_OPEN_ANIM_FROM_SCALE: WIN_POPUP_OPEN_ANIM_FROM_SCALE,
  WIN_STAR_ANIM_START_DELAY: WIN_STAR_ANIM_START_DELAY,
  WIN_STAR_ANIM_STAGGER: WIN_STAR_ANIM_STAGGER,
  WIN_STAR_PUNCH_FROM_SCALE: WIN_STAR_PUNCH_FROM_SCALE,
  WIN_STAR_PUNCH_DOWN_SCALE: WIN_STAR_PUNCH_DOWN_SCALE,
  WIN_STAR_SHRINK_DURATION: WIN_STAR_SHRINK_DURATION,
  WIN_STAR_RECOVER_DURATION: WIN_STAR_RECOVER_DURATION,
  IMPACT_DEFAULT_PUSH_DISTANCE: IMPACT_DEFAULT_PUSH_DISTANCE,
  IMPACT_MIN_PUSH_DURATION: IMPACT_MIN_PUSH_DURATION,
  IMPACT_MIN_RETURN_DURATION: IMPACT_MIN_RETURN_DURATION,
  IMPACT_RETURN_DURATION_RATIO: IMPACT_RETURN_DURATION_RATIO,
  SHOT_NO_DROP_SHAKE_OFFSET: SHOT_NO_DROP_SHAKE_OFFSET,
  SHOT_NO_DROP_SHAKE_STEP_DURATION: SHOT_NO_DROP_SHAKE_STEP_DURATION,
  ROUTE_LINE_WIDTH_ACTIVE: ROUTE_LINE_WIDTH_ACTIVE,
  ROUTE_LINE_WIDTH_IDLE: ROUTE_LINE_WIDTH_IDLE,
  ROUTE_POINT_RADIUS_ACTIVE: ROUTE_POINT_RADIUS_ACTIVE,
  ROUTE_POINT_RADIUS_IDLE: ROUTE_POINT_RADIUS_IDLE,
  ICE_THAW_SHAKE_OFFSET: ICE_THAW_SHAKE_OFFSET,
  ICE_THAW_SHAKE_STEP_DURATION: ICE_THAW_SHAKE_STEP_DURATION,
  ICE_COLLECT_FLY_DURATION: ICE_COLLECT_FLY_DURATION,
  ICE_COLLECT_BEZIER_ARC: ICE_COLLECT_BEZIER_ARC,
  ICE_COLLECT_FLY_Z_INDEX: ICE_COLLECT_FLY_Z_INDEX,
  ICE_COLLECT_FLY_EASE_RATE: ICE_COLLECT_FLY_EASE_RATE,
  ICE_COLLECT_FLY_TWEEN_EASING: ICE_COLLECT_FLY_TWEEN_EASING,
  SPLITTER_SPAWN_FLY_DURATION: SPLITTER_SPAWN_FLY_DURATION,
  SPLITTER_SPAWN_BEZIER_ARC: SPLITTER_SPAWN_BEZIER_ARC,
  FIREWORKS_PREFAB_PATH: FIREWORKS_PREFAB_PATH,
  BOARD_CLEAR_FIREWORKS_BURST_COUNT: BOARD_CLEAR_FIREWORKS_BURST_COUNT,
  BOARD_CLEAR_FIREWORKS_INTERVAL_SEC: BOARD_CLEAR_FIREWORKS_INTERVAL_SEC,
  loadSpriteFrame: loadSpriteFrame,
  createSolidWhiteSpriteFrame: createSolidWhiteSpriteFrame,
  ensureSprite: ensureSprite,
  ensureLabel: ensureLabel,
  ensureOutline: ensureOutline,
  clearChildren: clearChildren,
  getOrCreateChild: getOrCreateChild,
  SpriteProxyLayerHelper: SpriteProxyLayerHelper,
  PropDescriptionViewController: PropDescriptionViewController,
  buildObjectiveDisplayData: buildObjectiveDisplayData,
  buildHudTargetDisplayData: buildHudTargetDisplayData,
  applyIceSnowballHudDisplayProgress: applyIceSnowballHudDisplayProgress,
  hasIceSnowballCollectionObjective: hasIceSnowballCollectionObjective,
  buildStateText: buildStateText,
  buildResultTexts: buildResultTexts,
  resolveWinStarRating: resolveWinStarRating,
  buildHudRenderKey: buildHudRenderKey,
  buildJarRenderKey: buildJarRenderKey,
  buildGuidePathKey: buildGuidePathKey,
  clipGuidePathToDistance: clipGuidePathToDistance,
  resolveGuideFrontClipDistance: resolveGuideFrontClipDistance,
  pointDistance: pointDistance,
  resolveImpactBounceSpeed: resolveImpactBounceSpeed,
  getJarBaseY: getJarBaseY,
  resolveBallCode: resolveBallCode,
  isIceBallLike: isIceBallLike,
  resolveIceInnerColor: resolveIceInnerColor,
  resolveBallVisualKey: resolveBallVisualKey,
  computeShooterAngle: computeShooterAngle,
  createRouteColor: createRouteColor,
  buildAdRevivePlan: AdRevivePolicy.buildRevivePlan,
  buildAdReviveDescription: AdRevivePolicy.buildReviveDescription,
  resolveLoseRewardEntry: AdRewardCatalog.resolveLoseRewardEntry,
  clamp: clamp,
  JarScoreConfig: JarScoreConfig
};

attachLevelRendererSceneMethods(LevelRenderer, LEVEL_RENDERER_SCENE_DEPS);
attachLevelRendererFairyMethods(LevelRenderer);

function resolveCommentAnimationKey(clearedCount) {
  for (var index = 0; index < COMMENT_ANIMATION_TIERS.length; index += 1) {
    var tier = COMMENT_ANIMATION_TIERS[index];
    if (clearedCount >= tier.threshold) {
      return tier.key;
    }
  }

  return null;
}

LevelRenderer.prototype._playCommentAnimation = function (runtimeSnapshot) {
  if (!runtimeSnapshot) {
    throw new Error("Comment animation requires runtime snapshot.");
  }
  if (!runtimeSnapshot.lastResolution) {
    throw new Error("Comment animation requires lastResolution.");
  }

  var resolution = runtimeSnapshot.lastResolution;
  if (resolution === this.lastCommentResolution) {
    return;
  }

  if (!Array.isArray(resolution.matched)) {
    throw new Error("Comment animation requires lastResolution.matched array.");
  }
  if (!Array.isArray(resolution.floating)) {
    throw new Error("Comment animation requires lastResolution.floating array.");
  }

  var matchedCount = resolution.matched.length;
  var floatingCount = resolution.floating.length;
  var clearedCount = matchedCount + floatingCount;
  var commentKey = resolveCommentAnimationKey(clearedCount);
  if (!commentKey) {
    return;
  }

  this.lastCommentResolution = resolution;
  if (!this.layers || !this.layers.comment) {
    throw new Error("Comment animation requires CommentLayer.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Comment animation requires cc.tween.");
  }

  var spritePath = COMMENT_ANIMATION_RESOURCES[commentKey];
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Comment animation sprite is not preloaded: " + spritePath);
  }

  clearChildren(this.layers.comment);
  var commentNode = new cc.Node("Comment_" + commentKey);
  commentNode.parent = this.layers.comment;
  commentNode.setPosition(0, 0);
  commentNode.setScale(COMMENT_ANIMATION_START_SCALE);
  commentNode.opacity = 255;
  ensureSprite(commentNode, spriteFrame);
  commentNode.setContentSize(spriteFrame.getOriginalSize());

  cc.tween(commentNode)
    .to(COMMENT_ANIMATION_IN_DURATION, {
      scale: COMMENT_ANIMATION_PUNCH_SCALE
    }, {
      easing: "backOut"
    })
    .to(COMMENT_ANIMATION_SETTLE_DURATION, {
      scale: COMMENT_ANIMATION_NORMAL_SCALE
    }, {
      easing: "quadOut"
    })
    .delay(COMMENT_ANIMATION_HOLD_DURATION)
    .to(COMMENT_ANIMATION_OUT_DURATION, {
      scale: COMMENT_ANIMATION_OUT_SCALE,
      opacity: 0
    }, {
      easing: "quadIn"
    })
    .call(function () {
      if (commentNode && commentNode.isValid) {
        commentNode.removeFromParent(true);
      }
    })
    .start();
};

LevelRenderer.prototype._instantiateOrCreate = function (prefabPath, parent, name) {
  var existing = parent && name ? parent.getChildByName(name) : null;
  if (existing) {
    return existing;
  }

  var node = prefabPath ? this.prefabFactory.instantiate(prefabPath, parent, name) : null;
  if (!node) {
    node = new cc.Node(name);
    node.parent = parent;
  }
  return node;
};

LevelRenderer.prototype._applyBallVisual = function (node, ballLike, forcedSize) {
  var spriteTarget = node.getChildByName("Icon") || node;
  var spriteCode = resolveBallCode(ballLike);
  var spritePath = BALL_RESOURCES[spriteCode];
  if (!spritePath) {
    throw new Error("Unsupported ball visual code: " + spriteCode);
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Missing preloaded ball sprite frame: " + spritePath);
  }

  spriteTarget.active = true;
  spriteTarget.opacity = 255;
  var sprite = ensureSprite(spriteTarget, spriteFrame);
  sprite.trim = spriteCode !== "VINE_SPIRIT";
  var visualSize = forcedSize || spriteFrame.getOriginalSize();
  spriteTarget.setContentSize(visualSize);

  var iceOverlayNode = getOrCreateChild(spriteTarget, "IceOverlay");
  var shouldShowIceOverlay = isIceBallLike(ballLike) && !!resolveIceInnerColor(ballLike);
  if (shouldShowIceOverlay) {
    var iceFrame = this.spriteFrameCache[BALL_RESOURCES.ICE];
    if (iceFrame) {
      iceOverlayNode.active = true;
      iceOverlayNode.setPosition(0, 0);
      iceOverlayNode.opacity = ICE_OVERLAY_OPACITY;
      iceOverlayNode.zIndex = 5;
      ensureSprite(iceOverlayNode, iceFrame);
      iceOverlayNode.setContentSize(visualSize);
    } else {
      iceOverlayNode.active = false;
    }
  } else {
    iceOverlayNode.active = false;
  }
};

LevelRenderer.prototype._applyJarVisual = function (node, colorCode) {
  var spriteTarget = node.getChildByName("Icon") || node;
  var spriteFrame = this.spriteFrameCache[JAR_RESOURCES[colorCode]];
  if (!spriteFrame) {
    return;
  }

  var jarSprite = ensureSprite(spriteTarget, spriteFrame);
  jarSprite.trim = false;
  spriteTarget.setContentSize(JAR_RENDER_SIZE);
};

LevelRenderer.prototype._applyJarMaskVisual = function (node, colorCode) {
  var maskNode = node.getChildByName("mask") || node.getChildByName("Mask");
  if (!maskNode) {
    return;
  }

  var spriteFrame = this.spriteFrameCache[JAR_MASK_RESOURCES[colorCode]];
  if (!spriteFrame) {
    return;
  }

  ensureSprite(maskNode, spriteFrame);
  maskNode.setContentSize(JAR_RENDER_SIZE);
};

module.exports = LevelRenderer;


},{"../../assets/scripts/utils/Logger":"Logger","../../assets/scripts/utils/DebugFlags":"DebugFlags","../../assets/scripts/utils/BundleLoader":"BundleLoader","./PrefabFactory":"PrefabFactory","../../assets/scripts/config/BoardLayout":"BoardLayout","../config/SpecialAnimationTiming":"SpecialAnimationTiming","../config/FairyAssistConfig":"FairyAssistConfig","../config/JarScoreConfig":"JarScoreConfig","../../assets/scripts/config/PropDescriptionConfig":"PropDescriptionConfig","../../assets/scripts/config/RuntimeRefreshScope":"RuntimeRefreshScope","../../assets/scripts/core/StarRatingPolicy":"StarRatingPolicy","../core/AdRevivePolicy":"AdRevivePolicy","../../assets/scripts/services/AdRewardCatalog":"AdRewardCatalog","../../assets/scripts/render/RenderNodeHelpers":"RenderNodeHelpers","../../assets/scripts/utils/SpriteProxyLayerHelper":"SpriteProxyLayerHelper","./BubbleShatterRenderer":"BubbleShatterRenderer","./WormholeShaderRenderer":"WormholeShaderRenderer","./LightningChainRenderer":"LightningChainRenderer","../../assets/scripts/ui/PropDescriptionViewController":"PropDescriptionViewController","./LevelRendererSceneMethods":"LevelRendererSceneMethods","./LevelRendererFairyMethods":"LevelRendererFairyMethods"}],
"LevelRendererFairyMethods":[function(require,module,exports){
"use strict";

var FairyAssistConfig = require("../config/FairyAssistConfig");
var SpecialAnimationTiming = require("../config/SpecialAnimationTiming");

var SLOT_POSITION_EPSILON = 0.01;
var GLOW_PULSE_DURATION = 0.48;
var GLOW_HIT_EFFECT_DURATION = 2;

function requireFairyTiming() {
  var timing = SpecialAnimationTiming.fairyAssist;
  if (!timing || typeof timing !== "object" || Array.isArray(timing)) {
    throw new Error("SpecialAnimationTiming.fairyAssist is required.");
  }
  if (typeof timing.flyInDuration !== "number" || !isFinite(timing.flyInDuration) || timing.flyInDuration <= 0) {
    throw new Error("SpecialAnimationTiming.fairyAssist.flyInDuration must be positive.");
  }
  if (typeof timing.flyOutDuration !== "number" || !isFinite(timing.flyOutDuration) || timing.flyOutDuration <= 0) {
    throw new Error("SpecialAnimationTiming.fairyAssist.flyOutDuration must be positive.");
  }
  if (typeof timing.flyOutDistance !== "number" || !isFinite(timing.flyOutDistance) || timing.flyOutDistance <= 0) {
    throw new Error("SpecialAnimationTiming.fairyAssist.flyOutDistance must be positive.");
  }
  return timing;
}

var FAIRY_TIMING = requireFairyTiming();

function requireFairyRoot(renderer) {
  if (!renderer.layers || !renderer.layers.hud) {
    throw new Error("Fairy rendering requires HUD layer.");
  }
  var gameViewNode = renderer.layers.hud.getChildByName("GameView");
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Fairy rendering requires GameView node.");
  }
  var root = gameViewNode.getChildByName("geniuses");
  if (!root || !root.isValid) {
    throw new Error("GameView requires geniuses node.");
  }
  return root;
}

function requireSlotNode(root, slotSnapshot, slotConfig) {
  if (!slotSnapshot || slotSnapshot.index !== slotConfig.index || slotSnapshot.nodeName !== slotConfig.nodeName) {
    throw new Error("Fairy snapshot slot contract mismatch at index " + slotConfig.index + ".");
  }
  var node = root.getChildByName(slotConfig.nodeName);
  if (!node || !node.isValid) {
    throw new Error("GameView/geniuses requires node " + slotConfig.nodeName + ".");
  }
  if (node.__fairySlotContractValidated !== true) {
    readPrefabSlotPosition(node, slotConfig.nodeName);
    node.__fairySlotContractValidated = true;
  }
  return node;
}

function readPrefabSlotPosition(node, nodeName) {
  if (!node || !node.isValid) {
    throw new Error("Fairy slot position requires valid node: " + nodeName + ".");
  }
  if (node.__fairySlotPrefabPosition) {
    var cached = node.__fairySlotPrefabPosition;
    if (
      typeof cached.x !== "number" ||
      !isFinite(cached.x) ||
      typeof cached.y !== "number" ||
      !isFinite(cached.y)
    ) {
      throw new Error("Fairy slot cached prefab position is invalid: " + nodeName + ".");
    }
    return cached;
  }
  if (
    typeof node.x !== "number" ||
    !isFinite(node.x) ||
    typeof node.y !== "number" ||
    !isFinite(node.y)
  ) {
    throw new Error("Fairy slot prefab position must be finite: " + nodeName + ".");
  }
  node.__fairySlotPrefabPosition = {
    x: node.x,
    y: node.y
  };
  return node.__fairySlotPrefabPosition;
}

function resolveFairySpawnPosition(renderer, spawnFrom) {
  if (
    !spawnFrom ||
    typeof spawnFrom.x !== "number" ||
    !isFinite(spawnFrom.x) ||
    typeof spawnFrom.y !== "number" ||
    !isFinite(spawnFrom.y)
  ) {
    throw new Error("Fairy spawnFrom must be a finite point.");
  }
  if (typeof renderer._convertBoardPointToGameView !== "function") {
    throw new Error("Fairy spawn rendering requires _convertBoardPointToGameView.");
  }
  return renderer._convertBoardPointToGameView(spawnFrom.x, spawnFrom.y);
}

function destroyNode(node) {
  if (!node || !node.isValid) {
    return;
  }
  node.stopAllActions();
  node.removeFromParent(false);
  node.destroy();
}

function disableSlotSprite(node) {
  var sprite = node.getComponent(cc.Sprite);
  if (!sprite) {
    return;
  }
  sprite.spriteFrame = null;
  sprite.enabled = false;
}

function playRequiredPrefabAnimation(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " requires valid prefab node.");
  }
  var animation = node.getComponent(cc.Animation);
  if (!animation) {
    throw new Error(description + " requires cc.Animation.");
  }
  var clip = animation.defaultClip || null;
  if (!clip && typeof animation.getClips === "function") {
    var clips = animation.getClips();
    if (Array.isArray(clips) && clips.length > 0) {
      clip = clips[0];
    }
  }
  if (!clip) {
    throw new Error(description + " requires an animation clip.");
  }
  if (typeof clip.name === "string" && clip.name) {
    animation.play(clip.name);
    return;
  }
  animation.play();
}

function instantiateFairyPrefab(renderer, prefabPath, parent, nodeName, description) {
  if (!renderer || !renderer.fairyPrefabCache) {
    throw new Error(description + " requires fairy prefab cache.");
  }
  if (typeof prefabPath !== "string" || !prefabPath) {
    throw new Error(description + " requires prefabPath.");
  }
  var prefab = renderer.fairyPrefabCache[prefabPath];
  if (!prefab) {
    throw new Error(description + " prefab was not preloaded: " + prefabPath);
  }
  var prefabNode = cc.instantiate(prefab);
  if (!prefabNode || !prefabNode.isValid) {
    throw new Error(description + " prefab instantiate failed: " + prefabPath);
  }
  prefabNode.name = nodeName;
  prefabNode.parent = parent;
  prefabNode.setPosition(0, 0);
  prefabNode.opacity = 255;
  prefabNode.scale = 1;
  prefabNode.active = true;
  playRequiredPrefabAnimation(prefabNode, description);
  return prefabNode;
}

function requireFairyVisualNode(renderer, node, prefabPath) {
  disableSlotSprite(node);
  var visualNode = node.getChildByName("FairyPrefabVisual");
  if (visualNode && visualNode.isValid && node.__fairyPrefabPath === prefabPath) {
    visualNode.active = true;
    return visualNode;
  }
  if (visualNode) {
    destroyNode(visualNode);
  }
  visualNode = instantiateFairyPrefab(renderer, prefabPath, node, "FairyPrefabVisual", "Fairy slot " + node.name);
  node.__fairyPrefabPath = prefabPath;
  return visualNode;
}

function hideFairyGlow(node) {
  var glowNode = node.getChildByName("FairyGlow");
  if (!glowNode) {
    return;
  }
  glowNode.stopAllActions();
  glowNode.active = false;
  glowNode.scale = 1;
  glowNode.opacity = 255;
}

function applyGlow(renderer, node, prefabPath, glowStacks) {
  if (!Number.isInteger(glowStacks) || glowStacks < 0) {
    throw new Error("Fairy glowStacks must be a non-negative integer.");
  }
  node.__fairyGlowStacks = glowStacks;

  if (glowStacks === 0) {
    hideFairyGlow(node);
    return;
  }

  var glowNode = node.getChildByName("FairyGlow");
  if (glowNode && glowNode.isValid && node.__fairyGlowPrefabPath !== prefabPath) {
    destroyNode(glowNode);
    glowNode = null;
  }
  if (!glowNode || !glowNode.isValid) {
    glowNode = instantiateFairyPrefab(renderer, prefabPath, node, "FairyGlow", "Fairy glow");
    glowNode.zIndex = -1;
    node.__fairyGlowPrefabPath = prefabPath;
  }
  glowNode.stopAllActions();
  glowNode.active = true;
  playRequiredPrefabAnimation(glowNode, "Fairy glow");

  var visualStacks = Math.min(glowStacks, FairyAssistConfig.maxGlowStacks);
  var baseScale = 1.04 + visualStacks * 0.025;
  var peakScale = baseScale + 0.08;
  glowNode.opacity = Math.min(210, 48 + visualStacks * 13);
  glowNode.scale = baseScale;

  var pulseCycle = cc.sequence(
    cc.scaleTo(GLOW_PULSE_DURATION, peakScale),
    cc.scaleTo(GLOW_PULSE_DURATION, baseScale)
  );
  var cycleDuration = GLOW_PULSE_DURATION * 2;
  var fullCycles = Math.floor(GLOW_HIT_EFFECT_DURATION / cycleDuration);
  var remainder = GLOW_HIT_EFFECT_DURATION - fullCycles * cycleDuration;
  var pulseActions = [];
  if (fullCycles > 0) {
    pulseActions.push(cc.repeat(pulseCycle, fullCycles));
  }
  if (remainder > SLOT_POSITION_EPSILON) {
    if (remainder <= GLOW_PULSE_DURATION) {
      var partialPeak = baseScale + (peakScale - baseScale) * (remainder / GLOW_PULSE_DURATION);
      pulseActions.push(cc.scaleTo(remainder, partialPeak));
    } else {
      pulseActions.push(cc.scaleTo(GLOW_PULSE_DURATION, peakScale));
      pulseActions.push(cc.scaleTo(remainder - GLOW_PULSE_DURATION, baseScale));
    }
  }
  pulseActions.push(cc.callFunc(function () {
    hideFairyGlow(node);
  }));
  glowNode.runAction(cc.sequence.apply(cc, pulseActions));
}

function configureFairyNode(renderer, node, fairy) {
  if (!fairy || typeof fairy.id !== "string" || !fairy.id) {
    throw new Error("Fairy render state requires id.");
  }
  if (typeof fairy.prefabPath !== "string" || !fairy.prefabPath) {
    throw new Error("Fairy render state requires prefabPath.");
  }

  requireFairyVisualNode(renderer, node, fairy.prefabPath);
  node.__fairyId = fairy.id;
  node.__fairyColor = fairy.color;
  node.__fairyEntering = false;
  node.active = true;
  node.opacity = 255;
  node.scale = 1;
  applyGlow(renderer, node, fairy.prefabPath, fairy.glowStacks);
}

function playFairyEntry(renderer, node, fairy, slotPosition, token) {
  configureFairyNode(renderer, node, fairy);
  node.__fairyEntering = true;
  var spawnPosition = resolveFairySpawnPosition(renderer, fairy.spawnFrom);
  node.setPosition(spawnPosition.x, spawnPosition.y);
  node.opacity = 0;
  node.scale = 0.72;

  var deltaX = slotPosition.x - spawnPosition.x;
  var deltaY = slotPosition.y - spawnPosition.y;
  var controlLift = Math.max(80, Math.abs(deltaY) * 0.22);
  var bezier = [
    cc.v2(spawnPosition.x + deltaX * 0.3, spawnPosition.y + deltaY * 0.3 + controlLift),
    cc.v2(spawnPosition.x + deltaX * 0.7, spawnPosition.y + deltaY * 0.7 + controlLift),
    cc.v2(slotPosition.x, slotPosition.y)
  ];
  node.runAction(cc.sequence(
    cc.spawn(
      cc.bezierTo(FAIRY_TIMING.flyInDuration, bezier),
      cc.fadeIn(FAIRY_TIMING.flyInDuration),
      cc.scaleTo(FAIRY_TIMING.flyInDuration, 1)
    ),
    cc.callFunc(function () {
      if (node.__fairyRenderToken !== token || node.__fairyId !== fairy.id) {
        return;
      }
      node.__fairyEntering = false;
      node.setPosition(slotPosition.x, slotPosition.y);
      node.opacity = 255;
      node.scale = 1;
    })
  ));
}

function playFairyDepartFlyOut(node, token, onComplete) {
  if (!node || !node.isValid) {
    throw new Error("Fairy depart fly out requires valid node.");
  }
  var startX = node.x;
  var startY = node.y;
  if (typeof startX !== "number" || !isFinite(startX) || typeof startY !== "number" || !isFinite(startY)) {
    throw new Error("Fairy depart fly out requires finite node position.");
  }

  hideFairyGlow(node);
  node.stopAllActions();
  node.runAction(cc.sequence(
    cc.moveTo(FAIRY_TIMING.flyOutDuration, startX, startY + FAIRY_TIMING.flyOutDistance),
    cc.callFunc(function () {
      if (node.__fairyRenderToken !== token) {
        return;
      }
      if (typeof onComplete === "function") {
        onComplete();
      }
    })
  ));
}

function hideFairyNode(node, token) {
  if (!node.__fairyId) {
    hideFairyGlow(node);
    node.active = false;
    return;
  }
  playFairyDepartFlyOut(node, token, function () {
    node.active = false;
    node.__fairyId = null;
    node.__fairyColor = null;
    node.__fairyEntering = false;
    node.__fairyGlowStacks = 0;
    hideFairyGlow(node);
  });
}

function replaceFairyNode(renderer, node, fairy, slotPosition, token) {
  playFairyDepartFlyOut(node, token, function () {
    playFairyEntry(renderer, node, fairy, slotPosition, token);
  });
}

function attachLevelRendererFairyMethods(LevelRenderer) {
  LevelRenderer.prototype.setFairyAssistSystem = function (fairyAssistSystem) {
    if (!fairyAssistSystem || typeof fairyAssistSystem.syncCollisionCenters !== "function") {
      throw new Error("LevelRenderer.setFairyAssistSystem requires FairyAssistSystem.");
    }
    this._fairyAssistSystem = fairyAssistSystem;
    return this;
  };

  LevelRenderer.prototype.syncFairyAssistCollisionCenters = function () {
    if (!this._fairyAssistSystem) {
      throw new Error("LevelRenderer.syncFairyAssistCollisionCenters requires bound FairyAssistSystem.");
    }
    if (!this.layers || !this.layers.board) {
      throw new Error("Board layer is required before syncing fairy collision centers.");
    }
    var root = requireFairyRoot(this);
    var boardLayer = this.layers.board;
    var centers = FairyAssistConfig.slots.map(function (slotConfig) {
      var slotNode = root.getChildByName(slotConfig.nodeName);
      if (!slotNode || !slotNode.isValid) {
        throw new Error("GameView/geniuses requires node " + slotConfig.nodeName + " for collision sync.");
      }
      var slotPosition = readPrefabSlotPosition(slotNode, slotConfig.nodeName);
      if (typeof root.convertToWorldSpaceAR !== "function") {
        throw new Error("Fairy slot root must support convertToWorldSpaceAR.");
      }
      if (typeof boardLayer.convertToNodeSpaceAR !== "function") {
        throw new Error("Board layer must support convertToNodeSpaceAR.");
      }
      var worldPos = root.convertToWorldSpaceAR(cc.v2(slotPosition.x, slotPosition.y));
      var boardPos = boardLayer.convertToNodeSpaceAR(worldPos);
      if (
        !boardPos ||
        typeof boardPos.x !== "number" ||
        !isFinite(boardPos.x) ||
        typeof boardPos.y !== "number" ||
        !isFinite(boardPos.y)
      ) {
        throw new Error("Fairy slot collision center conversion failed at " + slotConfig.nodeName + ".");
      }
      return {
        index: slotConfig.index,
        x: boardPos.x,
        y: boardPos.y
      };
    });
    this._fairyAssistSystem.syncCollisionCenters(centers);
    return this;
  };

  LevelRenderer.prototype._renderFairyAssists = function (runtimeSnapshot) {
    if (!runtimeSnapshot || !runtimeSnapshot.systems || !runtimeSnapshot.systems.fairyAssistSystem) {
      throw new Error("Fairy rendering requires runtime FairyAssistSystem snapshot.");
    }
    var snapshot = runtimeSnapshot.systems.fairyAssistSystem;
    if (!Array.isArray(snapshot.slots) || snapshot.slots.length !== FairyAssistConfig.slots.length) {
      throw new Error("Fairy rendering requires exactly six slot snapshots.");
    }

    var root = requireFairyRoot(this);
    FairyAssistConfig.slots.forEach(function (slotConfig) {
      var slotSnapshot = snapshot.slots[slotConfig.index];
      var node = requireSlotNode(root, slotSnapshot, slotConfig);
      var slotPosition = readPrefabSlotPosition(node, slotConfig.nodeName);
      var fairy = slotSnapshot.fairy;

      if (fairy === null) {
        if (!node.__fairyId) {
          hideFairyGlow(node);
          node.active = false;
          return;
        }
        if (node.__fairyPendingTargetId === null) {
          return;
        }
        node.__fairyPendingTargetId = null;
        node.__fairyRenderToken = Number.isInteger(node.__fairyRenderToken)
          ? node.__fairyRenderToken + 1
          : 1;
        var hideToken = node.__fairyRenderToken;
        hideFairyNode(node, hideToken);
        return;
      }
      if (!fairy.position) {
        throw new Error("Fairy snapshot position is required for slot " + slotConfig.nodeName + ".");
      }

      if (node.__fairyId === fairy.id) {
        node.__fairyPendingTargetId = fairy.id;
        if (node.__fairyEntering !== true) {
          node.setPosition(slotPosition.x, slotPosition.y);
          node.active = true;
          node.opacity = 255;
          node.scale = 1;
        }
        if (node.__fairyGlowStacks !== fairy.glowStacks) {
          if (typeof fairy.prefabPath !== "string" || !fairy.prefabPath) {
            throw new Error("Active fairy slot requires prefabPath.");
          }
          requireFairyVisualNode(this, node, fairy.prefabPath);
          applyGlow(this, node, fairy.prefabPath, fairy.glowStacks);
        }
        return;
      }

      if (node.__fairyPendingTargetId === fairy.id) {
        return;
      }
      node.__fairyPendingTargetId = fairy.id;
      node.__fairyRenderToken = Number.isInteger(node.__fairyRenderToken)
        ? node.__fairyRenderToken + 1
        : 1;
      var token = node.__fairyRenderToken;

      if (node.__fairyId && node.active) {
        replaceFairyNode(this, node, fairy, slotPosition, token);
        return;
      }
      node.stopAllActions();
      playFairyEntry(this, node, fairy, slotPosition, token);
    }, this);
  };
}

module.exports = attachLevelRendererFairyMethods;

},{"../config/FairyAssistConfig":"FairyAssistConfig","../config/SpecialAnimationTiming":"SpecialAnimationTiming"}],
"LevelRendererSceneBoardMethods":[function(require,module,exports){
"use strict";

function attachLevelRendererSceneBoardMethods(LevelRenderer, deps) {
  var DebugFlags = deps.DebugFlags;
  var BoardLayout = deps.BoardLayout;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var TOP_SLOT_STAR_RESOURCE = deps.TOP_SLOT_STAR_RESOURCE;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var ICE_OVERLAY_OPACITY = deps.ICE_OVERLAY_OPACITY;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var VINE_VISUAL_SIZE = deps.VINE_VISUAL_SIZE;
  var TEST_SLOT_RADIUS = deps.TEST_SLOT_RADIUS;
  var FairyAssistConfig = deps.FairyAssistConfig;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var clearChildren = deps.clearChildren;
  var getOrCreateChild = deps.getOrCreateChild;
  var resolveBallVisualKey = deps.resolveBallVisualKey;
  var isIceBallLike = deps.isIceBallLike;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var DROP_COLLISION_GLOW_NODE_NAME = "DropCollisionGlow";
  var DROP_COLLISION_GLOW_SIZE = {
    width: BoardLayout.bubbleDiameter * FairyAssistConfig.dropCollisionGlowScale,
    height: BoardLayout.bubbleDiameter * FairyAssistConfig.dropCollisionGlowScale
  };
  var TOP_SLOT_STAR_Z_INDEX = -1;
  var TOP_SLOT_STAR_DIM_OPACITY = 150;
  var TOP_SLOT_STAR_BRIGHT_OPACITY = 255;
  var TOP_SLOT_STAR_MIN_SCALE = 0.92;
  var TOP_SLOT_STAR_MAX_SCALE = 1.08;
  var TOP_SLOT_STAR_TWINKLE_DURATION = 0.45;
  var VINE_OVERLAY_NODE_NAME = "VinesOverlay";
  var VINE_HEALTH_NODE_NAME = "VineSpiritHealth";
  var VINE_PREVIEW_FADE_DURATION = 0.18;

  function requirePositiveSize(size, fieldName) {
    if (
      !size ||
      typeof size.width !== "number" ||
      !isFinite(size.width) ||
      size.width <= 0 ||
      typeof size.height !== "number" ||
      !isFinite(size.height) ||
      size.height <= 0
    ) {
      throw new Error(fieldName + " must be a positive size.");
    }
    return size;
  }

  function resolveDropGlowSpriteTarget(dropNode) {
    if (!dropNode || !dropNode.isValid) {
      throw new Error("Drop collision glow requires falling drop node.");
    }
    var iconNode = dropNode.getChildByName("Icon");
    var iconSprite = iconNode && iconNode.isValid ? iconNode.getComponent(cc.Sprite) : null;
    if (iconSprite && iconSprite.spriteFrame) {
      return {
        node: iconNode,
        sprite: iconSprite
      };
    }

    var rootSprite = dropNode.getComponent(cc.Sprite);
    if (rootSprite && rootSprite.spriteFrame) {
      return {
        node: dropNode,
        sprite: rootSprite
      };
    }

    throw new Error("Drop collision glow requires a rendered SpriteFrame on the falling drop.");
  }

  function hideDropCollisionGlowFrom(parentNode) {
    if (!parentNode || !parentNode.isValid) {
      return;
    }
    var glowNode = parentNode.getChildByName(DROP_COLLISION_GLOW_NODE_NAME);
    if (!glowNode) {
      return;
    }
    glowNode.active = false;
    glowNode.opacity = 255;
  }

  function hideDropCollisionGlow(dropNode) {
    hideDropCollisionGlowFrom(dropNode);
    var iconNode = dropNode && dropNode.isValid ? dropNode.getChildByName("Icon") : null;
    hideDropCollisionGlowFrom(iconNode);
  }

  function ensureDropCollisionGlowNode(targetNode) {
    var glowNode = targetNode.getChildByName(DROP_COLLISION_GLOW_NODE_NAME);
    if (!glowNode) {
      glowNode = new cc.Node(DROP_COLLISION_GLOW_NODE_NAME);
      glowNode.parent = targetNode;
      glowNode.setPosition(0, 0);
      glowNode.zIndex = 12;
    }
    var glowSprite = glowNode.getComponent(cc.Sprite);
    if (!glowSprite) {
      glowSprite = glowNode.addComponent(cc.Sprite);
    }
    if (!glowSprite) {
      throw new Error("Drop collision glow node requires cc.Sprite.");
    }
    return {
      node: glowNode,
      sprite: glowSprite
    };
  }

  function isNormalColorFallingDrop(drop) {
    if (!drop || typeof drop !== "object" || Array.isArray(drop)) {
      throw new Error("Falling drop glow requires drop object.");
    }
    if (drop.entityCategory !== "normal_ball") {
      return false;
    }
    if (drop.entityType !== null) {
      return false;
    }
    if (typeof drop.color !== "string" || !drop.color) {
      throw new Error("Normal falling drop glow requires color.");
    }
    return true;
  }

  function applyDropCollisionGlow(renderer, dropNode, drop) {
    if (!drop || !Number.isInteger(drop.glowStacks) || drop.glowStacks < 0) {
      throw new Error("Falling drop glowStacks must be a non-negative integer.");
    }
    if (!isNormalColorFallingDrop(drop)) {
      hideDropCollisionGlow(dropNode);
      return;
    }
    var visualStacks = Math.min(drop.glowStacks, FairyAssistConfig.maxGlowStacks);
    if (visualStacks === 0) {
      hideDropCollisionGlow(dropNode);
      return;
    }

    var target = resolveDropGlowSpriteTarget(dropNode);
    var glow = ensureDropCollisionGlowNode(target.node);
    var glowSpriteFrame = renderer.spriteFrameCache[BALL_RESOURCES.LIGHT];
    if (!glowSpriteFrame) {
      throw new Error("Drop collision glow light sprite was not preloaded: " + BALL_RESOURCES.LIGHT);
    }

    ensureSprite(glow.node, glowSpriteFrame);
    glow.node.setContentSize(DROP_COLLISION_GLOW_SIZE);
    glow.node.active = true;
    glow.node.opacity = Math.min(255, 55 + visualStacks * 28);
    glow.node.setScale(1);
  }

  function isBoardSpecialPrefabCell(cell) {
    return !!(
      cell &&
      (
        cell.entityType === "molotov" ||
        cell.entityType === "splitter" ||
        cell.entityType === "locked" ||
        cell.entityType === "key"
      )
    );
  }

  function buildBoardCellRenderKey(cell, boardSnapshot) {
    if (!cell || !cell.id) {
      throw new Error("Board cell render key requires cell id.");
    }
    if (!boardSnapshot || typeof boardSnapshot !== "object") {
      throw new Error("Board cell render key requires board snapshot.");
    }
    var lockedColorKey = "";
    if (cell.entityType === "locked") {
      if (typeof cell.lockedColor !== "string" || !cell.lockedColor) {
        throw new Error("LockingBubbleItem render key requires lockedColor.");
      }
      lockedColorKey = cell.lockedColor;
    }
    return [
      String(cell.id),
      cell.row,
      cell.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY,
      resolveBoardBubblePrefabPath(cell),
      resolveBallVisualKey(cell),
      lockedColorKey,
      typeof cell.health === "number" ? cell.health : "",
      typeof cell.vineOwnerId === "string" ? cell.vineOwnerId : "",
      typeof cell.vinePreviewOwnerId === "string" ? cell.vinePreviewOwnerId : ""
    ].join("|");
  }

  function resolveBoardBubblePrefabPath(cell) {
    if (!cell || !isBoardSpecialPrefabCell(cell)) {
      return PREFAB_PATHS.bubbleItem;
    }
    if (cell.entityType === "molotov") {
      return PREFAB_PATHS.fireBubbleItem;
    }
    if (cell.entityType === "splitter") {
      return PREFAB_PATHS.splitBubbleItem;
    }
    if (cell.entityType === "locked") {
      return PREFAB_PATHS.lockingBubbleItem;
    }
    if (cell.entityType === "key") {
      return PREFAB_PATHS.keyBubbleItem;
    }
    throw new Error("Unsupported board special prefab entityType: " + cell.entityType);
  }

  function getNodePool(poolMap, prefabPath) {
    if (!poolMap || typeof poolMap !== "object" || Array.isArray(poolMap)) {
      throw new Error("Board node pool map is required.");
    }
    if (typeof prefabPath !== "string" || !prefabPath) {
      throw new Error("Board node pool prefabPath is required.");
    }
    if (!Array.isArray(poolMap[prefabPath])) {
      poolMap[prefabPath] = [];
    }
    return poolMap[prefabPath];
  }

  function requireVisualChild(node, childName, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " node is required.");
    }
    var child = node.getChildByName(childName);
    if (!child || !child.isValid) {
      throw new Error(ownerName + " requires child `" + childName + "`.");
    }
    return child;
  }

  function requireTopSlotStarFrame(renderer) {
    if (typeof TOP_SLOT_STAR_RESOURCE !== "string" || !TOP_SLOT_STAR_RESOURCE) {
      throw new Error("Top slot star resource path is required.");
    }
    var spriteFrame = renderer.spriteFrameCache[TOP_SLOT_STAR_RESOURCE];
    if (!spriteFrame) {
      throw new Error("Missing preloaded top slot star sprite frame: " + TOP_SLOT_STAR_RESOURCE);
    }
    if (typeof spriteFrame.getOriginalSize !== "function") {
      throw new Error("Top slot star sprite frame requires getOriginalSize.");
    }
    return spriteFrame;
  }

  function requireTopSlotBoardSnapshot(boardSnapshot) {
    if (!boardSnapshot || typeof boardSnapshot !== "object" || Array.isArray(boardSnapshot)) {
      throw new Error("Top slot star rendering requires board snapshot.");
    }
    if (!Array.isArray(boardSnapshot.cells)) {
      throw new Error("Top slot star rendering requires boardSnapshot.cells array.");
    }
    if (!Number.isInteger(boardSnapshot.maxColumns) || boardSnapshot.maxColumns <= 0) {
      throw new Error("Top slot star rendering requires positive integer boardSnapshot.maxColumns.");
    }
    if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
      throw new Error("Top slot star rendering requires finite boardSnapshot.viewportOffsetY.");
    }
    if (typeof boardSnapshot.topAttachY !== "number" || !isFinite(boardSnapshot.topAttachY)) {
      throw new Error("Top slot star rendering requires finite boardSnapshot.topAttachY.");
    }
  }

  function buildTopRowOccupiedMap(boardSnapshot) {
    var occupied = {};
    boardSnapshot.cells.forEach(function (cell) {
      if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
        throw new Error("Top slot star rendering requires object board cells.");
      }
      if (!Number.isInteger(cell.row) || cell.row < 0) {
        throw new Error("Top slot star rendering requires non-negative integer cell.row.");
      }
      if (!Number.isInteger(cell.col) || cell.col < 0) {
        throw new Error("Top slot star rendering requires non-negative integer cell.col.");
      }
      if (cell.row === 0) {
        occupied[cell.col] = true;
      }
    });
    return occupied;
  }

  function applyTopSlotStarVisual(node, spriteFrame) {
    if (!node || !node.isValid) {
      throw new Error("Top slot star node is required.");
    }
    ensureSprite(node, spriteFrame);
    node.setContentSize(spriteFrame.getOriginalSize());
    node.active = true;
    node.zIndex = TOP_SLOT_STAR_Z_INDEX;
    startTopSlotStarTwinkle(node);
  }

  function startTopSlotStarTwinkle(node) {
    if (!node || !node.isValid) {
      throw new Error("Top slot star twinkle requires valid node.");
    }
    if (node.__topSlotStarTwinkleActive === true) {
      return;
    }
    if (
      typeof cc.repeatForever !== "function" ||
      typeof cc.sequence !== "function" ||
      typeof cc.spawn !== "function" ||
      typeof cc.fadeTo !== "function" ||
      typeof cc.scaleTo !== "function"
    ) {
      throw new Error("Top slot star twinkle requires Cocos action APIs.");
    }

    node.stopAllActions();
    node.opacity = TOP_SLOT_STAR_DIM_OPACITY;
    node.setScale(TOP_SLOT_STAR_MIN_SCALE);
    node.__topSlotStarTwinkleActive = true;
    node.runAction(cc.repeatForever(cc.sequence(
      cc.spawn(
        cc.fadeTo(TOP_SLOT_STAR_TWINKLE_DURATION, TOP_SLOT_STAR_BRIGHT_OPACITY),
        cc.scaleTo(TOP_SLOT_STAR_TWINKLE_DURATION, TOP_SLOT_STAR_MAX_SCALE)
      ),
      cc.spawn(
        cc.fadeTo(TOP_SLOT_STAR_TWINKLE_DURATION, TOP_SLOT_STAR_DIM_OPACITY),
        cc.scaleTo(TOP_SLOT_STAR_TWINKLE_DURATION, TOP_SLOT_STAR_MIN_SCALE)
      )
    )));
  }

  function restoreSpriteNodeVisible(node, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " node is required.");
    }
    node.active = true;
    node.opacity = 255;
    var sprite = node.getComponent(cc.Sprite);
    if (sprite) {
      sprite.enabled = true;
    }
  }

  function restoreGenericBubbleVisualState(node) {
    restoreSpriteNodeVisible(node, "Bubble visual");
    var iconNode = node.getChildByName("Icon");
    if (iconNode && iconNode.isValid) {
      restoreSpriteNodeVisible(iconNode, "Bubble visual Icon");
    }
  }

  function rebindKeyBubbleVisual(renderer, node) {
    restoreSpriteNodeVisible(node, "KeyBubbleItem");
    var iconNode = requireVisualChild(node, "Icon", "KeyBubbleItem");
    iconNode.active = true;
    var keyNode = requireVisualChild(node, "key", "KeyBubbleItem");
    restoreSpriteNodeVisible(keyNode, "KeyBubbleItem key");

    var keyFrame = renderer.spriteFrameCache[BALL_RESOURCES.KEY];
    if (!keyFrame) {
      throw new Error("Missing preloaded KeyBubbleItem sprite frame: " + BALL_RESOURCES.KEY);
    }
    ensureSprite(keyNode, keyFrame);
  }

  function restoreBoardBubbleVisualState(renderer, node, cell) {
    if (cell && cell.entityType === "key") {
      rebindKeyBubbleVisual(renderer, node);
      return;
    }
    restoreGenericBubbleVisualState(node);
    if (cell && cell.entityType === "locked") {
      var lockNode = requireVisualChild(node, "lock", "LockingBubbleItem");
      restoreSpriteNodeVisible(lockNode, "LockingBubbleItem lock");
    }
  }

  function syncVineOverlay(renderer, node, cell) {
    if (!node || !node.isValid) {
      throw new Error("Vine overlay requires valid board node.");
    }
    var spriteTarget = node.getChildByName("Icon") || node;
    var overlayNode = getOrCreateChild(spriteTarget, VINE_OVERLAY_NODE_NAME);
    var isEntangled = !!(cell && typeof cell.vineOwnerId === "string" && cell.vineOwnerId);
    var isPreview = !!(cell && typeof cell.vinePreviewOwnerId === "string" && cell.vinePreviewOwnerId);
    if (!isEntangled && !isPreview) {
      overlayNode.stopAllActions();
      overlayNode.__vinePreviewActive = false;
      overlayNode.active = false;
      overlayNode.opacity = 255;
      return;
    }
    var vinesFrame = renderer.spriteFrameCache[BALL_RESOURCES.VINES];
    if (!vinesFrame) {
      throw new Error("Vine overlay sprite was not preloaded: " + BALL_RESOURCES.VINES);
    }
    overlayNode.active = true;
    overlayNode.setPosition(0, 0);
    overlayNode.zIndex = 12;
    var vinesSprite = ensureSprite(overlayNode, vinesFrame);
    vinesSprite.trim = false;
    overlayNode.setContentSize(VINE_VISUAL_SIZE);
    if (isPreview) {
      if (overlayNode.__vinePreviewActive !== true) {
        overlayNode.stopAllActions();
        overlayNode.opacity = 80;
        overlayNode.__vinePreviewActive = true;
        overlayNode.runAction(cc.repeatForever(cc.sequence(
          cc.fadeTo(VINE_PREVIEW_FADE_DURATION, 210),
          cc.fadeTo(VINE_PREVIEW_FADE_DURATION, 80)
        )));
      }
      return;
    }
    overlayNode.stopAllActions();
    overlayNode.__vinePreviewActive = false;
    overlayNode.opacity = 255;
  }

  function syncVineSpiritHealth(node, cell) {
    if (!node || !node.isValid) {
      throw new Error("Vine spirit health requires valid board node.");
    }
    var healthNode = getOrCreateChild(node, VINE_HEALTH_NODE_NAME);
    if (!cell || cell.entityType !== "vine_spirit") {
      healthNode.active = false;
      return;
    }
    if (!Number.isInteger(cell.health) || cell.health <= 0 || cell.health > 3) {
      throw new Error("Vine spirit render health must be in [1, 3].");
    }
    healthNode.active = true;
    healthNode.setPosition(23, -25);
    healthNode.zIndex = 20;
    healthNode.color = cc.Color.WHITE;
    var label = ensureLabel(healthNode, String(cell.health), 20, 22);
    label.horizontalAlign = cc.Label.HorizontalAlign.CENTER;
    label.verticalAlign = cc.Label.VerticalAlign.CENTER;
    var outline = healthNode.getComponent(cc.LabelOutline);
    if (!outline) {
      outline = healthNode.addComponent(cc.LabelOutline);
    }
    if (!outline) {
      throw new Error("Vine spirit health requires cc.LabelOutline.");
    }
    outline.color = cc.Color.BLACK;
    outline.width = 2;
  }

  function instantiateRequired(prefabFactory, prefabPath, parent, name, ownerName) {
    if (!prefabFactory || typeof prefabFactory.instantiate !== "function") {
      throw new Error(ownerName + " requires prefabFactory.instantiate.");
    }
    var node = prefabFactory.instantiate(prefabPath, parent, name);
    if (!node || !node.isValid) {
      throw new Error(ownerName + " prefab instantiate failed: " + prefabPath);
    }
    return node;
  }

  function requireNodePrefabPath(node, ownerName) {
    if (!node || typeof node.__bubblePrefabPath !== "string" || !node.__bubblePrefabPath) {
      throw new Error(ownerName + " requires __bubblePrefabPath.");
    }
    return node.__bubblePrefabPath;
  }

LevelRenderer.prototype._syncCurrentResolutionFloatingCellIds = function () {
  if (!this.lastRuntimeSnapshot || !this.lastRuntimeSnapshot.lastResolution) {
    throw new Error("Board rendering requires lastRuntimeSnapshot.lastResolution.");
  }
  var floating = this.lastRuntimeSnapshot.lastResolution.floating;
  if (!Array.isArray(floating)) {
    throw new Error("Board rendering requires lastResolution.floating array.");
  }

  var floatingCellIds = {};
  floating.forEach(function (cell) {
    if (!cell || (typeof cell.id !== "string" && typeof cell.id !== "number")) {
      throw new Error("Board rendering requires every floating cell to have an id.");
    }
    floatingCellIds[String(cell.id)] = true;
  });
  this.currentResolutionFloatingCellIds = floatingCellIds;
  return floatingCellIds;
};

LevelRenderer.prototype._renderBoard = function (boardSnapshot) {
  this._syncCurrentResolutionFloatingCellIds();
  this.lastBoardVersion = boardSnapshot.version;
  this.lastBoardViewportOffsetY = boardSnapshot.viewportOffsetY;
  this.boardRenderTick += 1;
  var currentTick = this.boardRenderTick;
  if (!this.boardCellRenderKeys || typeof this.boardCellRenderKeys !== "object") {
    this.boardCellRenderKeys = {};
  }

  boardSnapshot.cells.forEach(function (cell) {
    var cellId = String(cell.id);
    var renderKey = buildBoardCellRenderKey(cell, boardSnapshot);
    var cachedRenderKey = this.boardCellRenderKeys[cellId];
    var existingNode = this.boardBubbleNodes[cellId];
    if (existingNode && cachedRenderKey === renderKey) {
      existingNode.__boardTick = currentTick;
      if (!existingNode.parent || existingNode.parent !== this.layers.board) {
        existingNode.parent = this.layers.board;
      }
      restoreBoardBubbleVisualState(this, existingNode, cell);
      this.wormholeShaderRenderer.syncNode(existingNode, cell);
      syncVineOverlay(this, existingNode, cell);
      syncVineSpiritHealth(existingNode, cell);
      this._applySplitterSpawnHiddenBoardState(existingNode, cell.id);
      this._applyMolotovBlastHiddenBoardState(existingNode, cell.id);
      return;
    }

    this.boardCellRenderKeys[cellId] = renderKey;
    var cellPosition = BoardLayout.getCellPosition(cell.row, cell.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var bubbleNode = this._acquireBoardBubbleNode(cell);
    bubbleNode.__boardTick = currentTick;
    bubbleNode.setPosition(cellPosition.x, cellPosition.y);
    bubbleNode.setScale(1);
    bubbleNode.opacity = 255;
    this._applyBoardBubbleVisualCached(bubbleNode, cell, BOARD_BUBBLE_SIZE);
    this.wormholeShaderRenderer.syncNode(bubbleNode, cell);
    syncVineOverlay(this, bubbleNode, cell);
    syncVineSpiritHealth(bubbleNode, cell);
    this._applySplitterSpawnHiddenBoardState(bubbleNode, cell.id);
    this._applyMolotovBlastHiddenBoardState(bubbleNode, cell.id);
  }, this);

  this._recycleInactiveBoardBubbleNodes(currentTick);
  this._syncWormholeDirectionGuide(boardSnapshot);
  this._renderTopSlotStars(boardSnapshot);
};

LevelRenderer.prototype._renderTopSlotStars = function (boardSnapshot) {
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Top slot star rendering requires board layer.");
  }
  requireTopSlotBoardSnapshot(boardSnapshot);

  this.topSlotStarRenderTick += 1;
  var currentTick = this.topSlotStarRenderTick;
  var starFrame = requireTopSlotStarFrame(this);
  var occupied = buildTopRowOccupiedMap(boardSnapshot);
  var topRowColumns = BoardLayout.getRowColumnCount(0, boardSnapshot.maxColumns);
  for (var col = 0; col < topRowColumns; col += 1) {
    if (occupied[col]) {
      continue;
    }
    var slotId = "0:" + col;
    var slotPosition = BoardLayout.getCellPosition(0, col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var starNode = this._acquireTopSlotStarNode(slotId, starFrame);
    starNode.__topSlotStarTick = currentTick;
    starNode.setPosition(slotPosition.x, slotPosition.y);
    applyTopSlotStarVisual(starNode, starFrame);
  }

  this._recycleInactiveTopSlotStarNodes(currentTick);
};

LevelRenderer.prototype._acquireTopSlotStarNode = function (slotId, spriteFrame) {
  if (typeof slotId !== "string" || !slotId) {
    throw new Error("Top slot star node requires slotId.");
  }
  var existing = this.topSlotStarNodes[slotId];
  if (existing && existing.isValid) {
    if (existing.parent !== this.layers.board) {
      existing.parent = this.layers.board;
    }
    applyTopSlotStarVisual(existing, spriteFrame);
    return existing;
  }

  var node = this.topSlotStarNodePool.length > 0 ? this.topSlotStarNodePool.pop() : null;
  if (!node || !node.isValid) {
    node = new cc.Node("TopSlotStar_" + slotId.replace(":", "_"));
  }
  node.name = "TopSlotStar_" + slotId.replace(":", "_");
  if (node.parent !== this.layers.board) {
    node.parent = this.layers.board;
  }
  applyTopSlotStarVisual(node, spriteFrame);
  this.topSlotStarNodes[slotId] = node;
  return node;
};

LevelRenderer.prototype._recycleInactiveTopSlotStarNodes = function (activeTick) {
  for (var slotId in this.topSlotStarNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.topSlotStarNodes, slotId)) {
      continue;
    }
    var node = this.topSlotStarNodes[slotId];
    if (node && node.__topSlotStarTick === activeTick) {
      continue;
    }
    if (node && node.isValid) {
      node.stopAllActions();
      node.__topSlotStarTwinkleActive = false;
      node.active = false;
      node.removeFromParent(false);
      this.topSlotStarNodePool.push(node);
    }
    delete this.topSlotStarNodes[slotId];
  }
};

LevelRenderer.prototype._acquireBoardBubbleNode = function (cell) {
  if (!cell || !cell.id) {
    throw new Error("Board bubble node requires cell id.");
  }
  var nodeId = String(cell.id);
  var existing = this.boardBubbleNodes[nodeId];
  if (existing) {
    var expectedPath = resolveBoardBubblePrefabPath(cell);
    if (existing.__bubblePrefabPath !== expectedPath) {
      this._removeBarrierHammerHintNodeByCellId(nodeId);
      this.wormholeShaderRenderer.resetNode(existing);
      existing.stopAllActions();
      existing.active = false;
      existing.removeFromParent(false);
      getNodePool(this.boardBubbleNodePool, requireNodePrefabPath(existing, "Board bubble node")).push(existing);
      delete this.boardBubbleNodes[nodeId];
    } else {
      this._resetBubblePrefabNode(existing, cell);
      return existing;
    }
  }

  var prefabPath = resolveBoardBubblePrefabPath(cell);
  var pool = getNodePool(this.boardBubbleNodePool, prefabPath);
  var node = pool.length ? pool.pop() : null;
  if (!node) {
    node = instantiateRequired(this.prefabFactory, prefabPath, null, null, "Board bubble node");
    node.__bubblePrefabPath = prefabPath;
    node.setScale(1);
  }
  node.__bubblePrefabPath = prefabPath;
  this._resetBubblePrefabNode(node, cell);

  node.name = "Bubble_" + nodeId;
  if (node.parent !== this.layers.board) {
    node.parent = this.layers.board;
  }
  node.active = true;
  node.setScale(1);
  this.boardBubbleNodes[nodeId] = node;
  return node;
};

LevelRenderer.prototype._resetBubblePrefabNode = function (node, cell) {
  if (!node || !node.isValid) {
    throw new Error("Bubble prefab node is required.");
  }
  if (!this.wormholeShaderRenderer || typeof this.wormholeShaderRenderer.resetNode !== "function") {
    throw new Error("Bubble prefab reset requires WormholeShaderRenderer.");
  }
  if (!cell || cell.entityType !== "wormhole") {
    this.wormholeShaderRenderer.resetNode(node);
  }
  node.stopAllActions();
  node.angle = 0;
  node.opacity = 255;
  node.active = true;
  restoreBoardBubbleVisualState(this, node, cell);

  if (cell && cell.entityType === "key") {
    requireVisualChild(node, "Icon", "KeyBubbleItem").active = true;
    requireVisualChild(node, "key", "KeyBubbleItem").active = true;
  } else if (cell && cell.entityType === "locked") {
    requireVisualChild(node, "Icon", "LockingBubbleItem").active = true;
    requireVisualChild(node, "lock", "LockingBubbleItem").active = true;
  }
};

LevelRenderer.prototype._applyBoardBubbleVisualCached = function (node, cell, forcedSize) {
  if (!node || !cell) {
    throw new Error("Board bubble visual requires node and cell.");
  }

  if (cell.entityType === "key" || cell.entityType === "molotov") {
    node.__ballVisualKey = "prefab:" + cell.entityType;
    return;
  }

  if (cell.entityType === "locked") {
    if (typeof cell.lockedColor !== "string" || !cell.lockedColor) {
      throw new Error("LockingBubbleItem visual requires lockedColor.");
    }
    this._applyBallVisualCached(node, { color: cell.lockedColor }, forcedSize);
    return;
  }

  if (cell.entityType === "splitter") {
    this._applyBallVisualCached(node, cell, forcedSize);
    return;
  }

  if (cell.entityType === "vine_spirit") {
    this._applyBallVisualCached(node, cell, VINE_VISUAL_SIZE);
    return;
  }

  this._applyBallVisualCached(node, cell, forcedSize);
};

LevelRenderer.prototype._recycleInactiveBoardBubbleNodes = function (activeTick) {
  if (
    !this.currentResolutionFloatingCellIds ||
    typeof this.currentResolutionFloatingCellIds !== "object" ||
    Array.isArray(this.currentResolutionFloatingCellIds)
  ) {
    throw new Error("Inactive board bubble recycling requires current floating cell id map.");
  }
  for (var cellId in this.boardBubbleNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.boardBubbleNodes, cellId)) {
      continue;
    }

    var node = this.boardBubbleNodes[cellId];
    if (node && node.__boardTick === activeTick) {
      continue;
    }
    if (
      this.bubbleShatterRenderer &&
      this.bubbleShatterRenderer.isCellShatterPending(cellId) &&
      this.currentResolutionFloatingCellIds[cellId] !== true
    ) {
      continue;
    }

    if (node) {
      this._removeBarrierHammerHintNodeByCellId(cellId);
      this.wormholeShaderRenderer.resetNode(node);
      node.stopAllActions();
      node.active = false;
      node.removeFromParent(false);
      getNodePool(this.boardBubbleNodePool, requireNodePrefabPath(node, "Board bubble node")).push(node);
    }

    delete this.boardBubbleNodes[cellId];
    if (this.boardCellRenderKeys && Object.prototype.hasOwnProperty.call(this.boardCellRenderKeys, cellId)) {
      delete this.boardCellRenderKeys[cellId];
    }
  }
};

LevelRenderer.prototype._renderFallingDrops = function (runtimeSnapshot) {
  if (!this.layers || !this.layers.falling) {
    return;
  }

  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var drops = fallingSnapshot && fallingSnapshot.activeDrops ? fallingSnapshot.activeDrops : [];
  this.fallingRenderTick += 1;
  var currentTick = this.fallingRenderTick;
  if (!drops.length) {
    this._recycleInactiveFallingDropNodes(currentTick);
    this.lastRenderedFallingCount = 0;
    return;
  }

  for (var dropIndex = 0; dropIndex < drops.length; dropIndex += 1) {
    var drop = drops[dropIndex];
    var dropId = String(drop.id);
    if (!dropId) {
      continue;
    }
    if (!drop.active) {
      continue;
    }

    var dropNode = this._acquireFallingDropNode(drop);
    dropNode.__fallingTick = currentTick;
    dropNode.setPosition(drop.position.x, drop.position.y);
    dropNode.angle = drop.rotation || 0;
    dropNode.opacity = 255;
    this._applyBoardBubbleVisualCached(dropNode, drop, BOARD_BUBBLE_SIZE);
    applyDropCollisionGlow(this, dropNode, drop);
  }
  this._recycleInactiveFallingDropNodes(currentTick);
  this.lastRenderedFallingCount = drops.length;
};

LevelRenderer.prototype._acquireFallingDropNode = function (drop) {
  if (!drop || !drop.id) {
    throw new Error("Falling drop node requires drop id.");
  }
  var dropId = String(drop.id);
  var existing = this.fallingDropNodes[dropId];
  if (existing) {
    var expectedPath = resolveBoardBubblePrefabPath(drop);
    if (existing.__bubblePrefabPath !== expectedPath) {
      existing.stopAllActions();
      existing.active = false;
      existing.removeFromParent(false);
      getNodePool(this.fallingDropNodePool, requireNodePrefabPath(existing, "Falling drop node")).push(existing);
      delete this.fallingDropNodes[dropId];
    } else {
      this._resetBubblePrefabNode(existing, drop);
      return existing;
    }
  }

  var prefabPath = resolveBoardBubblePrefabPath(drop);
  var pool = getNodePool(this.fallingDropNodePool, prefabPath);
  var node = pool.length ? pool.pop() : null;
  if (!node) {
    node = instantiateRequired(this.prefabFactory, prefabPath, null, null, "Falling drop node");
    node.__bubblePrefabPath = prefabPath;
    node.setScale(1);
  }
  node.__bubblePrefabPath = prefabPath;
  this._resetBubblePrefabNode(node, drop);

  node.name = "Falling_" + dropId;
  if (node.parent !== this.layers.falling) {
    node.parent = this.layers.falling;
  }
  node.setScale(1);
  node.active = true;
  this.fallingDropNodes[dropId] = node;
  return node;
};

LevelRenderer.prototype._recycleInactiveFallingDropNodes = function (activeTick) {
  for (var dropId in this.fallingDropNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.fallingDropNodes, dropId)) {
      continue;
    }
    var node = this.fallingDropNodes[dropId];
    if (node && node.__fallingTick === activeTick) {
      continue;
    }

    if (node) {
      node.stopAllActions();
      node.active = false;
      node.removeFromParent(false);
      getNodePool(this.fallingDropNodePool, requireNodePrefabPath(node, "Falling drop node")).push(node);
    }
    delete this.fallingDropNodes[dropId];
  }
};


LevelRenderer.prototype._renderTestGrid = function (boardSnapshot) {
  if (!this.layers || !this.layers.testGrid) {
    return;
  }

  if (!DebugFlags.get("testLayer")) {
    this.layers.testGrid.active = false;
    return;
  }

  this.layers.testGrid.active = true;
  this.layers.testGrid.opacity = 255;
  this.testGridRenderTick += 1;
  var currentTick = this.testGridRenderTick;

  var occupied = {};
  (boardSnapshot.cells || []).forEach(function (cell) {
    occupied[cell.row + ":" + cell.col] = true;
  });

  var index = 1;
  for (var row = 0; row < boardSnapshot.rowCount; row += 1) {
    var rowColumns = BoardLayout.getRowColumnCount(row, boardSnapshot.maxColumns);
    for (var col = 0; col < rowColumns; col += 1) {
      var key = row + ":" + col;
      var isOccupied = !!occupied[key];
      var cellPosition = BoardLayout.getCellPosition(row, col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
      var slotNode = this._acquireTestSlotNode(row, col);
      slotNode.__testGridTick = currentTick;
      slotNode.setPosition(cellPosition.x, cellPosition.y);
      slotNode.opacity = 200;
      slotNode.zIndex = 0;

      var graphics = slotNode.getComponent(cc.Graphics) || slotNode.addComponent(cc.Graphics);
      graphics.clear();
      graphics.fillColor = isOccupied ? new cc.Color(130, 220, 255, 92) : new cc.Color(255, 255, 255, 46);
      graphics.strokeColor = isOccupied ? new cc.Color(130, 220, 255, 215) : new cc.Color(255, 255, 255, 140);
      graphics.lineWidth = 2;
      graphics.circle(0, 0, TEST_SLOT_RADIUS);
      graphics.fill();
      graphics.stroke();

      var labelNode = new cc.Node("IndexLabel");
      labelNode.parent = slotNode;
      labelNode.zIndex = 2;
      labelNode.setPosition(0, 0);
      labelNode.setContentSize(TEST_SLOT_RADIUS * 1.9, TEST_SLOT_RADIUS * 1.6);
      labelNode.opacity = 255;
      var indexLabel = ensureLabel(labelNode, String(index), 22, 24);
      indexLabel.overflow = cc.Label.Overflow.NONE;
      indexLabel.enableWrapText = false;
      labelNode.color = cc.color(0, 0, 0);

      index += 1;
    }
  }

  this._recycleInactiveTestSlotNodes(currentTick);
};

LevelRenderer.prototype._acquireTestSlotNode = function (row, col) {
  var slotId = row + ":" + col;
  var existing = this.testSlotNodes[slotId];
  if (existing) {
    return existing;
  }

  var slotNode = this.testSlotNodePool.length ? this.testSlotNodePool.pop() : null;
  if (!slotNode) {
    slotNode = new cc.Node("TestSlot_" + row + "_" + col);
  }

  slotNode.name = "TestSlot_" + row + "_" + col;
  if (slotNode.parent !== this.layers.testGrid) {
    slotNode.parent = this.layers.testGrid;
  }
  slotNode.active = true;
  this.testSlotNodes[slotId] = slotNode;
  return slotNode;
};

LevelRenderer.prototype._recycleInactiveTestSlotNodes = function (activeTick) {
  for (var slotId in this.testSlotNodes) {
    if (!Object.prototype.hasOwnProperty.call(this.testSlotNodes, slotId)) {
      continue;
    }

    var slotNode = this.testSlotNodes[slotId];
    if (slotNode && slotNode.__testGridTick === activeTick) {
      continue;
    }

    if (slotNode) {
      slotNode.active = false;
      slotNode.removeFromParent(false);
      this.testSlotNodePool.push(slotNode);
    }

    delete this.testSlotNodes[slotId];
  }
};


}

module.exports = attachLevelRendererSceneBoardMethods;

},{}],
"LevelRendererSceneFxMethods":[function(require,module,exports){
"use strict";

function attachLevelRendererSceneFxMethods(LevelRenderer, deps) {
  var BoardLayout = deps.BoardLayout;
  var SpecialAnimationTiming = deps.SpecialAnimationTiming;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var WORMHOLE_DIRECTION_ARROW_RESOURCE = deps.WORMHOLE_DIRECTION_ARROW_RESOURCE;
  var WORMHOLE_DIRECTION_ARROW_SIZE = deps.WORMHOLE_DIRECTION_ARROW_SIZE;
  var WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE = deps.WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE;
  var WORMHOLE_DIRECTION_ARROW_STAGGER = deps.WORMHOLE_DIRECTION_ARROW_STAGGER;
  var WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION = deps.WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION;
  var WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION = deps.WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION;
  var WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE = deps.WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var BARRIER_HAMMER_HINT_SIZE = deps.BARRIER_HAMMER_HINT_SIZE;
  var BARRIER_HAMMER_HINT_OFFSET_X = deps.BARRIER_HAMMER_HINT_OFFSET_X;
  var BARRIER_HAMMER_HINT_OFFSET_Y = deps.BARRIER_HAMMER_HINT_OFFSET_Y;
  var BARRIER_HAMMER_HINT_TAP_OFFSET_X = deps.BARRIER_HAMMER_HINT_TAP_OFFSET_X;
  var BARRIER_HAMMER_HINT_TAP_OFFSET_Y = deps.BARRIER_HAMMER_HINT_TAP_OFFSET_Y;
  var BARRIER_HAMMER_HINT_LIFT_DURATION = deps.BARRIER_HAMMER_HINT_LIFT_DURATION;
  var BARRIER_HAMMER_HINT_STRIKE_DURATION = deps.BARRIER_HAMMER_HINT_STRIKE_DURATION;
  var BARRIER_HAMMER_HINT_PAUSE_DURATION = deps.BARRIER_HAMMER_HINT_PAUSE_DURATION;
  var IMPACT_DEFAULT_PUSH_DISTANCE = deps.IMPACT_DEFAULT_PUSH_DISTANCE;
  var IMPACT_MIN_PUSH_DURATION = deps.IMPACT_MIN_PUSH_DURATION;
  var IMPACT_MIN_RETURN_DURATION = deps.IMPACT_MIN_RETURN_DURATION;
  var IMPACT_RETURN_DURATION_RATIO = deps.IMPACT_RETURN_DURATION_RATIO;
  var SHOT_NO_DROP_SHAKE_OFFSET = deps.SHOT_NO_DROP_SHAKE_OFFSET;
  var SHOT_NO_DROP_SHAKE_STEP_DURATION = deps.SHOT_NO_DROP_SHAKE_STEP_DURATION;
  var ICE_THAW_SHAKE_OFFSET = deps.ICE_THAW_SHAKE_OFFSET;
  var ICE_THAW_SHAKE_STEP_DURATION = deps.ICE_THAW_SHAKE_STEP_DURATION;
  var ICE_COLLECT_FLY_DURATION = deps.ICE_COLLECT_FLY_DURATION;
  var ICE_COLLECT_BEZIER_ARC = deps.ICE_COLLECT_BEZIER_ARC;
  var ICE_COLLECT_FLY_Z_INDEX = deps.ICE_COLLECT_FLY_Z_INDEX;
  var ICE_COLLECT_FLY_EASE_RATE = deps.ICE_COLLECT_FLY_EASE_RATE;
  var ICE_COLLECT_FLY_TWEEN_EASING = deps.ICE_COLLECT_FLY_TWEEN_EASING;
  var SPLITTER_SPAWN_FLY_DURATION = deps.SPLITTER_SPAWN_FLY_DURATION;
  var SPLITTER_SPAWN_BEZIER_ARC = deps.SPLITTER_SPAWN_BEZIER_ARC;
  var FIREWORKS_PREFAB_PATH = deps.FIREWORKS_PREFAB_PATH;
  var BOARD_CLEAR_FIREWORKS_BURST_COUNT = deps.BOARD_CLEAR_FIREWORKS_BURST_COUNT;
  var BOARD_CLEAR_FIREWORKS_INTERVAL_SEC = deps.BOARD_CLEAR_FIREWORKS_INTERVAL_SEC;
  var ensureSprite = deps.ensureSprite;
  var getOrCreateChild = deps.getOrCreateChild;
  var resolveImpactBounceSpeed = deps.resolveImpactBounceSpeed;
  var resolveBallCode = deps.resolveBallCode;
  var isIceBallLike = deps.isIceBallLike;
  var resolveIceInnerColor = deps.resolveIceInnerColor;
  var hasIceSnowballCollectionObjective = deps.hasIceSnowballCollectionObjective;
  var pointDistance = deps.pointDistance;
  var POWERUP_ICON_RESOURCES = deps.POWERUP_ICON_RESOURCES;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;

  function requireVisualChild(node, childName, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " node is required.");
    }
    var child = node.getChildByName(childName);
    if (!child || !child.isValid) {
      throw new Error(ownerName + " requires child `" + childName + "`.");
    }
    return child;
  }

  function instantiateRequired(prefabFactory, prefabPath, parent, name, ownerName) {
    if (!prefabFactory || typeof prefabFactory.instantiate !== "function") {
      throw new Error(ownerName + " requires prefabFactory.instantiate.");
    }
    var node = prefabFactory.instantiate(prefabPath, parent, name);
    if (!node || !node.isValid) {
      throw new Error(ownerName + " prefab instantiate failed: " + prefabPath);
    }
    return node;
  }

  function applyIceCollectFlyEaseAction(action) {
    if (!action || typeof action.easing !== "function") {
      throw new Error("Ice collect fly action requires easing support.");
    }
    if (typeof cc.easeIn !== "function") {
      throw new Error("Ice collect fly requires cc.easeIn.");
    }
    if (typeof ICE_COLLECT_FLY_EASE_RATE !== "number" || !isFinite(ICE_COLLECT_FLY_EASE_RATE) || ICE_COLLECT_FLY_EASE_RATE <= 0) {
      throw new Error("Ice collect fly ease rate must be positive.");
    }
    return action.easing(cc.easeIn(ICE_COLLECT_FLY_EASE_RATE));
  }
  var SPLITTER_SPAWN_FLY_DURATION = deps.SPLITTER_SPAWN_FLY_DURATION;
  var SPLITTER_SPAWN_BEZIER_ARC = deps.SPLITTER_SPAWN_BEZIER_ARC;
  var loadSpriteFrame = deps.loadSpriteFrame;
  var createSolidWhiteSpriteFrame = deps.createSolidWhiteSpriteFrame;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var clearChildren = deps.clearChildren;
  var getOrCreateChild = deps.getOrCreateChild;
  function requireFinitePoint(point, ownerName) {
    if (
      !point ||
      typeof point.x !== "number" ||
      typeof point.y !== "number" ||
      !isFinite(point.x) ||
      !isFinite(point.y)
    ) {
      throw new Error(ownerName + " position must be finite.");
    }
    return point;
  }

  function requirePositiveFiniteNumber(value, ownerName) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      throw new Error(ownerName + " must be a positive finite number.");
    }
    return value;
  }

  function requireBoardClearFireworksPrefab(renderer) {
    if (!renderer || !renderer.fireworksPrefab) {
      throw new Error("Board clear fireworks requires preloaded prefab: animation/" + FIREWORKS_PREFAB_PATH);
    }
    return renderer.fireworksPrefab;
  }

  function requireBoardClearFireworksRootParent(renderer) {
    if (!renderer || typeof renderer._getGameViewNode !== "function") {
      throw new Error("Board clear fireworks requires _getGameViewNode.");
    }
    var gameViewNode = renderer._getGameViewNode();
    if (!gameViewNode || !gameViewNode.isValid) {
      throw new Error("Board clear fireworks requires GameView node.");
    }
    return gameViewNode;
  }

  function requireBoardClearFireworksSpawnArea(renderer) {
    var gameViewNode = requireBoardClearFireworksRootParent(renderer);
    if (typeof gameViewNode.getContentSize !== "function") {
      throw new Error("Board clear fireworks requires GameView size.");
    }
    var rootSize = gameViewNode.getContentSize();
    if (
      !rootSize ||
      typeof rootSize.width !== "number" ||
      typeof rootSize.height !== "number" ||
      !isFinite(rootSize.width) ||
      !isFinite(rootSize.height) ||
      rootSize.width <= 0 ||
      rootSize.height <= 0
    ) {
      throw new Error("Board clear fireworks GameView size is invalid.");
    }
    return {
      centerX: 0,
      centerY: rootSize.height * 0.22,
      halfWidth: rootSize.width * 0.2,
      halfHeight: rootSize.height * 0.14
    };
  }

  function createRandomPointInArea(area) {
    if (!area || typeof area !== "object" || Array.isArray(area)) {
      throw new Error("Board clear fireworks spawn area is required.");
    }
    requirePositiveFiniteNumber(area.halfWidth, "Board clear fireworks halfWidth");
    requirePositiveFiniteNumber(area.halfHeight, "Board clear fireworks halfHeight");
    return {
      x: area.centerX + (Math.random() * 2 - 1) * area.halfWidth,
      y: area.centerY + (Math.random() * 2 - 1) * area.halfHeight
    };
  }

  function requireParticleSystem(node, ownerName) {
    if (!node || !node.isValid) {
      throw new Error(ownerName + " requires valid node.");
    }
    var particleSystem = node.getComponent(cc.ParticleSystem);
    if (!particleSystem) {
      throw new Error(ownerName + " requires cc.ParticleSystem.");
    }
    if (typeof particleSystem.resetSystem !== "function") {
      throw new Error(ownerName + " ParticleSystem requires resetSystem.");
    }
    return particleSystem;
  }

  function stopParticleSystemIfPresent(node) {
    if (!node || !node.isValid) {
      return;
    }
    var particleSystem = node.getComponent(cc.ParticleSystem);
    if (particleSystem && typeof particleSystem.stopSystem === "function") {
      particleSystem.stopSystem();
    }
  }

  function instantiateBoardClearFireworks(renderer, parent, position) {
    var targetPosition = requireFinitePoint(position, "Board clear fireworks");
    var prefab = requireBoardClearFireworksPrefab(renderer);
    var node = cc.instantiate(prefab);
    if (!node || !node.isValid) {
      throw new Error("Board clear fireworks prefab instantiate failed: animation/" + FIREWORKS_PREFAB_PATH);
    }
    renderer.boardClearFireworksBurstSerial += 1;
    node.name = "BoardClearFireworks_" + renderer.boardClearFireworksBurstSerial;
    node.parent = parent;
    node.zIndex = renderer.boardClearFireworksBurstSerial;
    node.setPosition(targetPosition.x, targetPosition.y);
    node.active = true;
    var particleSystem = requireParticleSystem(node, "Board clear fireworks");
    particleSystem.resetSystem();
    return node;
  }

  function spawnBoardClearFireworksBurst(renderer) {
    if (!renderer || renderer.boardClearFireworksActive !== true) {
      return;
    }
    var root = renderer.boardClearFireworksRoot;
    if (!root || !root.isValid) {
      throw new Error("Board clear fireworks root became invalid while active.");
    }
    var burstCount = Math.floor(Number(BOARD_CLEAR_FIREWORKS_BURST_COUNT));
    if (!Number.isInteger(burstCount) || burstCount <= 0) {
      throw new Error("Board clear fireworks burst count must be positive integer.");
    }
    var area = requireBoardClearFireworksSpawnArea(renderer);
    for (var index = 0; index < burstCount; index += 1) {
      instantiateBoardClearFireworks(renderer, root, createRandomPointInArea(area));
    }
  }

  function requireExplodeAnimationClip(renderer, ownerName) {
    if (!renderer || !renderer.explodeAnimationClip) {
      throw new Error(ownerName + " requires preloaded explode animation clip.");
    }
    if (typeof renderer.explodeAnimationClip.duration !== "number" || !isFinite(renderer.explodeAnimationClip.duration) || renderer.explodeAnimationClip.duration <= 0) {
      throw new Error(ownerName + " explode animation clip duration is invalid.");
    }
    if (typeof renderer.explodeAnimationClip.speed !== "number" || !isFinite(renderer.explodeAnimationClip.speed) || renderer.explodeAnimationClip.speed <= 0) {
      throw new Error(ownerName + " explode animation clip speed is invalid.");
    }
    return renderer.explodeAnimationClip;
  }

  function requireExplodeSpriteFrameSize(spriteFrame, ownerName) {
    var size = null;
    if (spriteFrame && typeof spriteFrame.getOriginalSize === "function") {
      size = spriteFrame.getOriginalSize();
    } else if (spriteFrame && typeof spriteFrame.getRect === "function") {
      size = spriteFrame.getRect();
    }
    if (
      !size ||
      typeof size.width !== "number" ||
      typeof size.height !== "number" ||
      !isFinite(size.width) ||
      !isFinite(size.height) ||
      size.width <= 0 ||
      size.height <= 0
    ) {
      throw new Error(ownerName + " explode animation spriteFrame size is invalid.");
    }
    return size;
  }

  function requireExplodeSpriteFrame(spriteFrame, ownerName, frameIndex) {
    if (!spriteFrame || (typeof spriteFrame.getOriginalSize !== "function" && typeof spriteFrame.getRect !== "function")) {
      throw new Error(ownerName + " explode animation spriteFrame keyframe " + frameIndex + " is invalid.");
    }
    requireExplodeSpriteFrameSize(spriteFrame, ownerName);
    return spriteFrame;
  }

  function requireExplodeSpriteFrameKeyframes(clip, ownerName) {
    if (!clip.curveData || typeof clip.curveData !== "object" || Array.isArray(clip.curveData)) {
      throw new Error(ownerName + " explode animation clip curveData is invalid.");
    }
    if (!clip.curveData.comps || typeof clip.curveData.comps !== "object" || Array.isArray(clip.curveData.comps)) {
      throw new Error(ownerName + " explode animation clip requires cc.Sprite curveData.");
    }
    var spriteCurve = clip.curveData.comps["cc.Sprite"];
    if (!spriteCurve || typeof spriteCurve !== "object" || Array.isArray(spriteCurve)) {
      throw new Error(ownerName + " explode animation clip requires cc.Sprite spriteFrame curve.");
    }
    var sourceFrames = spriteCurve.spriteFrame;
    if (!Array.isArray(sourceFrames) || !sourceFrames.length) {
      throw new Error(ownerName + " explode animation clip spriteFrame keyframes are required.");
    }
    var previousFrameTime = -1;
    return sourceFrames.map(function (entry, index) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(ownerName + " explode animation keyframe " + index + " is invalid.");
      }
      if (typeof entry.frame !== "number" || !isFinite(entry.frame) || entry.frame < 0) {
        throw new Error(ownerName + " explode animation keyframe " + index + " frame is invalid.");
      }
      if (entry.frame < previousFrameTime) {
        throw new Error(ownerName + " explode animation keyframes must be ordered.");
      }
      previousFrameTime = entry.frame;
      return {
        time: entry.frame / clip.speed,
        spriteFrame: requireExplodeSpriteFrame(entry.value, ownerName, index)
      };
    });
  }

  function playExplodeSpriteFrameSequence(fxNode, sprite, clip, ownerName, onFinished) {
    if (typeof cc.tween !== "function") {
      throw new Error(ownerName + " explode animation requires cc.tween.");
    }
    var keyframes = requireExplodeSpriteFrameKeyframes(clip, ownerName);
    var totalDuration = clip.duration / clip.speed;
    var firstSize = requireExplodeSpriteFrameSize(keyframes[0].spriteFrame, ownerName);
    fxNode.setContentSize(firstSize.width, firstSize.height);
    sprite.spriteFrame = keyframes[0].spriteFrame;

    var tween = cc.tween(fxNode);
    var currentTime = 0;
    keyframes.slice(1).forEach(function (keyframe) {
      if (keyframe.time < currentTime) {
        throw new Error(ownerName + " explode animation keyframe time is invalid.");
      }
      var delay = keyframe.time - currentTime;
      if (delay > 0) {
        tween = tween.delay(delay);
      }
      tween = tween.call(function () {
        if (fxNode && fxNode.isValid && sprite && sprite.node && sprite.node.isValid) {
          sprite.spriteFrame = keyframe.spriteFrame;
        }
      });
      currentTime = keyframe.time;
    });
    if (totalDuration < currentTime) {
      throw new Error(ownerName + " explode animation duration is shorter than keyframes.");
    }
    if (totalDuration > currentTime) {
      tween = tween.delay(totalDuration - currentTime);
    }
    tween
      .call(function () {
        if (typeof onFinished === "function") {
          onFinished();
        }
        if (fxNode && fxNode.isValid) {
          fxNode.removeFromParent(true);
        }
      })
      .start();
  }

  function playExplosionAnimationAt(renderer, nodeName, position, ownerName, onFinished) {
    var targetPosition = requireFinitePoint(position, ownerName);
    if (!renderer.layers || !renderer.layers.board || !renderer.layers.board.isValid) {
      throw new Error(ownerName + " requires board layer.");
    }
    if (typeof cc === "undefined" || !cc || typeof cc.Node !== "function") {
      throw new Error(ownerName + " requires cc.Node.");
    }

    var clip = requireExplodeAnimationClip(renderer, ownerName);
    var fxNode = new cc.Node(nodeName);
    fxNode.parent = renderer.layers.board;
    fxNode.setPosition(targetPosition.x, targetPosition.y);
    fxNode.zIndex = 130;
    fxNode.active = true;

    var sprite = fxNode.addComponent(cc.Sprite);
    if (!sprite) {
      throw new Error(ownerName + " requires cc.Sprite.");
    }
    playExplodeSpriteFrameSequence(fxNode, sprite, clip, ownerName, onFinished);
    return fxNode;
  }

  function requireNodePrefabPath(node, ownerName) {
    if (!node || typeof node.__bubblePrefabPath !== "string" || !node.__bubblePrefabPath) {
      throw new Error(ownerName + " requires __bubblePrefabPath.");
    }
    return node.__bubblePrefabPath;
  }

  function findUnlockedTargetsForKey(keyCell, unlockedCells) {
    if (typeof keyCell.id !== "string" && typeof keyCell.id !== "number") {
      throw new Error("Key unlock animation requires key id.");
    }
    if (!Array.isArray(unlockedCells)) {
      throw new Error("Key unlock animation requires unlockedCells array.");
    }
    var candidates = unlockedCells.filter(function (cell) {
      return !!(cell && cell.__sourceKeyId === keyCell.id);
    });
    if (candidates.length !== 1) {
      throw new Error("Key unlock animation requires exactly one unlocked target for key: " + keyCell.id);
    }
    return candidates;
  }

  function createKeyUnlockAnimationKey(resolution) {
    var keys = Array.isArray(resolution && resolution.collectedKeys) ? resolution.collectedKeys : [];
    var unlocked = Array.isArray(resolution && resolution.unlockedLockedBalls) ? resolution.unlockedLockedBalls : [];
    return keys.map(function (cell) {
      return cell.id + "@" + cell.row + ":" + cell.col;
    }).join("|") + "->" + unlocked.map(function (cell) {
      return cell.id + "@" + cell.row + ":" + cell.col + ":" + cell.__sourceKeyId;
    }).join("|");
  }

  function resolveKeyUnlockTargetNode(renderer, targetCell) {
    if (!targetCell || !targetCell.id) {
      throw new Error("Key unlock animation requires target cell id.");
    }
    var normalizedId = String(targetCell.id);
    var targetNode = renderer.boardBubbleNodes[normalizedId];
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    targetNode = renderer.layers.board.getChildByName("Bubble_" + normalizedId);
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    return null;
  }

  function resolveKeyUnlockMotionProgress(linearProgress) {
    if (typeof linearProgress !== "number" || !isFinite(linearProgress)) {
      throw new Error("Key unlock motion progress must be finite.");
    }
    var strength = 0.72;
    return linearProgress + Math.sin(linearProgress * Math.PI * 2) * strength / (Math.PI * 2);
  }

  function applyKeyUnlockFlyFrame(keyFx, startPosition, targetPosition, linearProgress, arcHeight) {
    if (!keyFx || !keyFx.isValid) {
      throw new Error("Key unlock fly node must remain valid during animation.");
    }
    if (!startPosition || !targetPosition) {
      throw new Error("Key unlock fly animation requires start and target positions.");
    }
    if (typeof arcHeight !== "number" || !isFinite(arcHeight)) {
      throw new Error("Key unlock fly arc height must be finite.");
    }

    var motionProgress = resolveKeyUnlockMotionProgress(linearProgress);
    var arcProgress = Math.sin(motionProgress * Math.PI);
    keyFx.x = startPosition.x + (targetPosition.x - startPosition.x) * motionProgress;
    keyFx.y = startPosition.y + (targetPosition.y - startPosition.y) * motionProgress + arcHeight * arcProgress;
    keyFx.scale = 1 + (0.72 - 1) * motionProgress;
  }

  function createSplitterSpawnEntryKey(cell) {
    if (!cell || !cell.id) {
      throw new Error("Splitter spawn entry key requires cell id.");
    }
    return String(cell.id) + "<-" + String(cell.sourceSplitterId) + "@" + cell.row + ":" + cell.col;
  }

  function resolveSplitterSpawnTargetNode(renderer, spawnedCell) {
    if (!spawnedCell || !spawnedCell.id) {
      throw new Error("Splitter spawn animation requires spawned cell id.");
    }
    var normalizedId = String(spawnedCell.id);
    var targetNode = renderer.boardBubbleNodes[normalizedId];
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    targetNode = renderer.layers.board.getChildByName("Bubble_" + normalizedId);
    if (targetNode && targetNode.isValid) {
      return targetNode;
    }
    return null;
  }

LevelRenderer.prototype._hideSplitterSpawnTarget = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Splitter spawn hide requires cell id.");
  }
  var normalizedId = String(cellId);
  this.splitterSpawnHiddenCellIds[normalizedId] = true;
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (targetNode && targetNode.isValid) {
    targetNode.stopAllActions();
    targetNode.opacity = 0;
    targetNode.active = false;
  }
};

LevelRenderer.prototype._revealSplitterSpawnTarget = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Splitter spawn reveal requires cell id.");
  }
  var normalizedId = String(cellId);
  delete this.splitterSpawnHiddenCellIds[normalizedId];
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (!targetNode || !targetNode.isValid) {
    return;
  }
  targetNode.active = true;
  targetNode.opacity = 255;
  targetNode.setScale(1);
  if (typeof cc.tween !== "function") {
    return;
  }
  cc.tween(targetNode)
    .to(0.08, { scale: 1.12 }, { easing: "quadOut" })
    .to(0.1, { scale: 1 }, { easing: "quadIn" })
    .start();
};

LevelRenderer.prototype._applySplitterSpawnHiddenBoardState = function (bubbleNode, cellId) {
  if (!bubbleNode || !bubbleNode.isValid) {
    return;
  }
  if (!this.splitterSpawnHiddenCellIds[String(cellId)]) {
    return;
  }
  bubbleNode.stopAllActions();
  bubbleNode.opacity = 0;
  bubbleNode.active = false;
};

LevelRenderer.prototype._hideMolotovBlastSource = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Molotov blast hide requires cell id.");
  }
  var normalizedId = String(cellId);
  this.molotovBlastHiddenCellIds[normalizedId] = true;
  var targetNode = this.boardBubbleNodes[normalizedId];
  if (targetNode && targetNode.isValid) {
    targetNode.stopAllActions();
    targetNode.opacity = 0;
    targetNode.active = false;
  }
};

LevelRenderer.prototype._clearMolotovBlastHiddenSource = function (cellId) {
  if (typeof cellId !== "string" && typeof cellId !== "number") {
    throw new Error("Molotov blast clear hide requires cell id.");
  }
  delete this.molotovBlastHiddenCellIds[String(cellId)];
};

LevelRenderer.prototype._applyMolotovBlastHiddenBoardState = function (bubbleNode, cellId) {
  if (!bubbleNode || !bubbleNode.isValid) {
    return;
  }
  if (!this.molotovBlastHiddenCellIds[String(cellId)]) {
    return;
  }
  bubbleNode.stopAllActions();
  bubbleNode.opacity = 0;
  bubbleNode.active = false;
};

LevelRenderer.prototype._buildBarrierHammerHintAction = function (hintNode) {
  if (!hintNode || !hintNode.isValid) {
    throw new Error("Barrier hammer hint action requires hint node.");
  }
  if (
    typeof cc.callFunc !== "function" ||
    typeof cc.spawn !== "function" ||
    typeof cc.sequence !== "function" ||
    typeof cc.repeatForever !== "function" ||
    typeof cc.moveTo !== "function" ||
    typeof cc.rotateTo !== "function" ||
    typeof cc.delayTime !== "function"
  ) {
    throw new Error("Barrier hammer hint animation requires Cocos action APIs.");
  }

  var liftX = BARRIER_HAMMER_HINT_OFFSET_X;
  var liftY = BARRIER_HAMMER_HINT_OFFSET_Y;
  var strikeX = BARRIER_HAMMER_HINT_OFFSET_X + BARRIER_HAMMER_HINT_TAP_OFFSET_X;
  var strikeY = BARRIER_HAMMER_HINT_OFFSET_Y + BARRIER_HAMMER_HINT_TAP_OFFSET_Y;
  return cc.repeatForever(cc.sequence(
    cc.callFunc(function () {
      hintNode.setPosition(liftX, liftY);
      hintNode.angle = -26;
      hintNode.opacity = 255;
    }),
    cc.spawn(
      cc.moveTo(BARRIER_HAMMER_HINT_STRIKE_DURATION, strikeX, strikeY),
      cc.rotateTo(BARRIER_HAMMER_HINT_STRIKE_DURATION, 18)
    ),
    cc.delayTime(BARRIER_HAMMER_HINT_PAUSE_DURATION),
    cc.spawn(
      cc.moveTo(BARRIER_HAMMER_HINT_LIFT_DURATION, liftX, liftY),
      cc.rotateTo(BARRIER_HAMMER_HINT_LIFT_DURATION, -26)
    )
  ));
};

LevelRenderer.prototype._removeBarrierHammerHintNodeByCellId = function (cellId) {
  if (typeof cellId !== "string" || !cellId) {
    throw new Error("Barrier hammer hint removal requires cell id.");
  }
  if (!this.barrierHammerHintNodes || typeof this.barrierHammerHintNodes !== "object" || Array.isArray(this.barrierHammerHintNodes)) {
    throw new Error("Barrier hammer hint nodes map is required.");
  }

  var hintNode = this.barrierHammerHintNodes[cellId];
  if (hintNode && hintNode.isValid) {
    hintNode.stopAllActions();
    hintNode.removeFromParent(true);
  }
  delete this.barrierHammerHintNodes[cellId];
};

LevelRenderer.prototype._clearBarrierHammerStoneHints = function () {
  if (!this.barrierHammerHintNodes || typeof this.barrierHammerHintNodes !== "object" || Array.isArray(this.barrierHammerHintNodes)) {
    throw new Error("Barrier hammer hint nodes map is required.");
  }

  Object.keys(this.barrierHammerHintNodes).forEach(function (cellId) {
    this._removeBarrierHammerHintNodeByCellId(cellId);
  }, this);
};

LevelRenderer.prototype._ensureBarrierHammerHintNode = function (bubbleNode, cellId, spriteFrame) {
  if (!bubbleNode || !bubbleNode.isValid) {
    throw new Error("Barrier hammer hint requires valid bubble node.");
  }
  if (typeof cellId !== "string" || !cellId) {
    throw new Error("Barrier hammer hint requires cell id.");
  }
  if (!spriteFrame) {
    throw new Error("Barrier hammer hint requires sprite frame.");
  }
  if (!BARRIER_HAMMER_HINT_SIZE || typeof BARRIER_HAMMER_HINT_SIZE.width !== "number" || typeof BARRIER_HAMMER_HINT_SIZE.height !== "number") {
    throw new Error("Barrier hammer hint requires valid size.");
  }
  if (!this.barrierHammerHintNodes || typeof this.barrierHammerHintNodes !== "object" || Array.isArray(this.barrierHammerHintNodes)) {
    throw new Error("Barrier hammer hint nodes map is required.");
  }

  var hintNode = this.barrierHammerHintNodes[cellId];
  if (hintNode && hintNode.isValid && hintNode.parent !== bubbleNode) {
    hintNode.stopAllActions();
    hintNode.removeFromParent(true);
    delete this.barrierHammerHintNodes[cellId];
    hintNode = null;
  }

  if (!hintNode || !hintNode.isValid) {
    hintNode = new cc.Node("BarrierHammerHint");
    this.barrierHammerHintNodes[cellId] = hintNode;
    hintNode.parent = bubbleNode;
    hintNode.zIndex = 120;
    hintNode.setAnchorPoint(0.5, 0.5);
    hintNode.setPosition(BARRIER_HAMMER_HINT_OFFSET_X, BARRIER_HAMMER_HINT_OFFSET_Y);
    hintNode.angle = -26;
    hintNode.opacity = 255;
    hintNode.setContentSize(BARRIER_HAMMER_HINT_SIZE);
    ensureSprite(hintNode, spriteFrame);
    hintNode.runAction(this._buildBarrierHammerHintAction(hintNode));
  } else {
    hintNode.parent = bubbleNode;
    hintNode.active = true;
    hintNode.zIndex = 120;
    hintNode.setContentSize(BARRIER_HAMMER_HINT_SIZE);
    ensureSprite(hintNode, spriteFrame);
  }
};

LevelRenderer.prototype._syncBarrierHammerStoneHints = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    throw new Error("Barrier hammer hints require runtime snapshot.");
  }
  var shooterSnapshot = runtimeSnapshot.shooter;
  if (!shooterSnapshot || typeof shooterSnapshot !== "object") {
    throw new Error("Barrier hammer hints require shooter snapshot.");
  }
  var boardSnapshot = runtimeSnapshot.board;
  if (!boardSnapshot || typeof boardSnapshot !== "object" || !Array.isArray(boardSnapshot.cells)) {
    throw new Error("Barrier hammer hints require board cells.");
  }

  if (!shooterSnapshot.pendingBarrierHammer) {
    this._clearBarrierHammerStoneHints();
    this.lastBarrierHammerHintKey = "inactive";
    return;
  }

  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Barrier hammer hints require board layer.");
  }

  var spritePath = POWERUP_ICON_RESOURCES.barrier_hammer;
  if (typeof spritePath !== "string" || !spritePath) {
    throw new Error("Barrier hammer hint sprite path is missing.");
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Missing preloaded barrier hammer hint sprite: " + spritePath);
  }

  var activeCellIds = {};
  boardSnapshot.cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object") {
      throw new Error("Barrier hammer hint requires valid board cell.");
    }
    if (cell.entityType !== "stone") {
      return;
    }
    if (!cell.id) {
      throw new Error("Stone cell requires id for barrier hammer hint.");
    }

    var cellId = String(cell.id);
    var bubbleNode = this.boardBubbleNodes[cellId];
    if (!bubbleNode || !bubbleNode.isValid) {
      throw new Error("Barrier hammer hint target bubble node is missing: " + cellId);
    }
    activeCellIds[cellId] = true;
    this._ensureBarrierHammerHintNode(bubbleNode, cellId, spriteFrame);
  }, this);

  Object.keys(this.barrierHammerHintNodes).forEach(function (cellId) {
    if (!activeCellIds[cellId]) {
      this._removeBarrierHammerHintNodeByCellId(cellId);
    }
  }, this);

  this.lastBarrierHammerHintKey = [
    "active",
    boardSnapshot.version,
    Object.keys(activeCellIds).sort().join(",")
  ].join("|");
};

LevelRenderer.prototype._playKeyUnlockAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var collectedKeys = resolution && Array.isArray(resolution.collectedKeys) ? resolution.collectedKeys : [];
  var unlockedCells = resolution && Array.isArray(resolution.unlockedLockedBalls) ? resolution.unlockedLockedBalls : [];
  if (!collectedKeys.length || !unlockedCells.length) {
    return;
  }

  var animationKey = createKeyUnlockAnimationKey(resolution);
  if (!animationKey || animationKey === this.lastKeyUnlockAnimationKey) {
    return;
  }
  this.lastKeyUnlockAnimationKey = animationKey;

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Key unlock animation requires board snapshot.");
  }
  if (typeof cc === "undefined" || !cc || typeof cc.tween !== "function") {
    throw new Error("Key unlock animation requires cc.tween.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Key unlock animation requires board layer.");
  }

  var boardSnapshot = runtimeSnapshot.board;
  var flyDuration = SpecialAnimationTiming.keyUnlock.flyDuration;
  var keyShrinkDuration = SpecialAnimationTiming.keyUnlock.shrinkDuration;
  var lockShakeStep = SpecialAnimationTiming.keyUnlock.lockShakeStepDuration;
  var lockShakeOffset = 8;

  collectedKeys.forEach(function (keyCell) {
    if (!keyCell) {
      throw new Error("Key unlock animation requires collected key.");
    }
    if (typeof keyCell.id !== "string" && typeof keyCell.id !== "number") {
      throw new Error("Key unlock animation requires collected key id.");
    }

    var targetCells = findUnlockedTargetsForKey(keyCell, unlockedCells);
    var primaryTarget = targetCells[0];
    var keyPosition = BoardLayout.getCellPosition(keyCell.row, keyCell.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var targetPosition = BoardLayout.getCellPosition(primaryTarget.row, primaryTarget.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
    var travelDistance = pointDistance(keyPosition, targetPosition);
    var arcHeight = Math.max(64, Math.min(140, travelDistance * 0.28));

    var keyFx = instantiateRequired(this.prefabFactory, PREFAB_PATHS.keyBubbleItem, this.layers.board, "KeyUnlockFly_" + keyCell.id, "Key unlock animation KeyBubbleItem");
    keyFx.setPosition(keyPosition.x, keyPosition.y);
    keyFx.setScale(1);
    keyFx.opacity = 255;
    keyFx.zIndex = 120;
    requireVisualChild(keyFx, "Icon", "KeyBubbleItem").active = false;
    requireVisualChild(keyFx, "key", "KeyBubbleItem").active = true;

    var lockFxNodes = targetCells.map(function (targetCell) {
      var targetNode = resolveKeyUnlockTargetNode(this, targetCell);
      if (targetNode) {
        targetNode.opacity = 0;
      }

      var lockPosition = BoardLayout.getCellPosition(targetCell.row, targetCell.col, boardSnapshot.maxColumns, boardSnapshot.viewportOffsetY);
      var lockFx = instantiateRequired(this.prefabFactory, PREFAB_PATHS.lockingBubbleItem, this.layers.board, "LockUnlockFx_" + targetCell.id, "Key unlock animation LockingBubbleItem");
      lockFx.setPosition(lockPosition.x, lockPosition.y);
      lockFx.setScale(1);
      lockFx.opacity = 255;
      lockFx.zIndex = 110;
      this._applyBoardBubbleVisualCached(lockFx, {
        entityType: "locked",
        lockedColor: targetCell.color
      }, BOARD_BUBBLE_SIZE);
      return {
        targetNode: targetNode,
        lockFx: lockFx,
        lockNode: requireVisualChild(lockFx, "lock", "LockingBubbleItem")
      };
    }, this);

    var cleanup = function () {
      if (keyFx && keyFx.isValid) {
        keyFx.removeFromParent(true);
      }
      lockFxNodes.forEach(function (entry) {
        if (entry.targetNode && entry.targetNode.isValid) {
          entry.targetNode.opacity = 255;
        }
        if (entry.lockFx && entry.lockFx.isValid) {
          entry.lockFx.removeFromParent(true);
        }
      });
    };

    var shakeLocks = function () {
      var remaining = lockFxNodes.length;
      var markDone = function () {
        remaining -= 1;
        if (remaining <= 0) {
          cleanup();
        }
      };

      lockFxNodes.forEach(function (entry) {
        var lockNode = entry.lockNode;
        lockNode.stopAllActions();
        var baseX = lockNode.x;
        var baseY = lockNode.y;
        cc.tween(lockNode)
          .to(lockShakeStep, { x: baseX - lockShakeOffset, y: baseY })
          .to(lockShakeStep, { x: baseX + lockShakeOffset, y: baseY })
          .to(lockShakeStep, { x: baseX - lockShakeOffset * 0.55, y: baseY })
          .to(lockShakeStep, { x: baseX + lockShakeOffset * 0.55, y: baseY })
          .to(lockShakeStep, { x: baseX, y: baseY, opacity: 0 })
          .call(markDone)
          .start();
      });
    };

    var flyState = { progress: 0 };
    cc.tween(flyState)
      .to(flyDuration, {
        progress: 1
      }, {
        progress: function (start, end, current, ratio) {
          var linearProgress = start + (end - start) * ratio;
          applyKeyUnlockFlyFrame(keyFx, keyPosition, targetPosition, linearProgress, arcHeight);
          return linearProgress;
        }
      })
      .call(function () {
        applyKeyUnlockFlyFrame(keyFx, keyPosition, targetPosition, 1, arcHeight);
        cc.tween(keyFx)
          .to(keyShrinkDuration, {
            scale: 0.35,
            opacity: 0
          }, {
            easing: "quadIn"
          })
          .call(shakeLocks)
          .start();
      })
      .start();
  }, this);
};

LevelRenderer.prototype._playSplitterSpawnAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var spawnedCells = resolution && Array.isArray(resolution.spawnedBySplitters) ? resolution.spawnedBySplitters : [];
  if (!spawnedCells.length) {
    return;
  }

  if (!this.splitterSpawnAnimatedEntryKeys || typeof this.splitterSpawnAnimatedEntryKeys !== "object") {
    throw new Error("Splitter spawn animated entry keys map is required.");
  }

  var pendingSpawnCells = spawnedCells.filter(function (spawnedCell) {
    if (!spawnedCell || !spawnedCell.id) {
      throw new Error("Splitter spawn animation requires spawned cell id.");
    }
    var entryKey = createSplitterSpawnEntryKey(spawnedCell);
    return !this.splitterSpawnAnimatedEntryKeys[entryKey];
  }, this);
  if (!pendingSpawnCells.length) {
    return;
  }

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Splitter spawn animation requires board snapshot.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Splitter spawn animation requires board layer.");
  }

  var boardSnapshot = runtimeSnapshot.board;
  var flyDuration = Math.max(0.2, Number(SPLITTER_SPAWN_FLY_DURATION) || 0.36);
  var bezierArc = Math.max(36, Number(SPLITTER_SPAWN_BEZIER_ARC) || 96);

  pendingSpawnCells.forEach(function (spawnedCell) {
    if (!spawnedCell || !spawnedCell.id) {
      throw new Error("Splitter spawn animation requires spawned cell id.");
    }
    if (typeof spawnedCell.sourceSplitterId !== "string" && typeof spawnedCell.sourceSplitterId !== "number") {
      throw new Error("Splitter spawn animation requires sourceSplitterId.");
    }
    if (!Number.isInteger(spawnedCell.sourceSplitterRow) || !Number.isInteger(spawnedCell.sourceSplitterCol)) {
      throw new Error("Splitter spawn animation requires source splitter coordinates.");
    }
    if (!Number.isInteger(spawnedCell.row) || !Number.isInteger(spawnedCell.col)) {
      throw new Error("Splitter spawn animation requires spawned cell coordinates.");
    }
    if (typeof spawnedCell.color !== "string" || !spawnedCell.color) {
      throw new Error("Splitter spawn animation requires spawned cell color.");
    }

    var entryKey = createSplitterSpawnEntryKey(spawnedCell);
    this.splitterSpawnAnimatedEntryKeys[entryKey] = true;

    var targetNode = resolveSplitterSpawnTargetNode(this, spawnedCell);
    if (!targetNode || !targetNode.isValid) {
      throw new Error("Splitter spawn animation target node missing: " + spawnedCell.id);
    }

    this._hideSplitterSpawnTarget(spawnedCell.id);

    var startPosition = BoardLayout.getCellPosition(
      spawnedCell.sourceSplitterRow,
      spawnedCell.sourceSplitterCol,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );
    var endPosition = BoardLayout.getCellPosition(
      spawnedCell.row,
      spawnedCell.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );

    var fxNode = new cc.Node("SplitterSpawnFx_" + spawnedCell.id);
    fxNode.parent = this.layers.board;
    fxNode.zIndex = (targetNode.zIndex || 0) + 2;
    fxNode.setPosition(startPosition.x, startPosition.y);
    fxNode.setScale(0.82);
    fxNode.opacity = 255;
    this._applyBallVisualCached(fxNode, {
      color: spawnedCell.color
    }, BOARD_BUBBLE_SIZE);

    var finishFx = function () {
      if (fxNode && fxNode.isValid) {
        fxNode.removeFromParent(true);
      }
      this._revealSplitterSpawnTarget(spawnedCell.id);
    }.bind(this);

    var startX = startPosition.x;
    var startY = startPosition.y;
    var endX = endPosition.x;
    var endY = endPosition.y;
    var controlY = Math.max(startY, endY) + bezierArc;
    var controlX = (startX + endX) * 0.5;

    fxNode.stopAllActions();
    if (
      fxNode.runAction &&
      typeof cc.bezierTo === "function" &&
      typeof cc.sequence === "function" &&
      typeof cc.callFunc === "function" &&
      typeof cc.v2 === "function"
    ) {
      var bezier = [
        cc.v2(controlX, controlY),
        cc.v2(controlX, controlY),
        cc.v2(endX, endY)
      ];
      fxNode.runAction(cc.sequence(
        cc.bezierTo(flyDuration, bezier),
        cc.callFunc(finishFx)
      ));
      return;
    }

    if (typeof cc.tween !== "function") {
      finishFx();
      return;
    }

    cc.tween(fxNode)
      .to(flyDuration, {
        x: endX,
        y: endY,
        scale: 1
      }, {
        easing: "sineOut"
      })
      .call(finishFx)
      .start();
  }, this);
};

LevelRenderer.prototype._playSwirlRotationAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.swirlRotations)) {
    throw new Error("Swirl animation requires lastResolution.swirlRotations.");
  }
  if (!resolution.swirlRotations.length) {
    return;
  }
  if (!this.swirlRotationAnimatedIds || typeof this.swirlRotationAnimatedIds !== "object") {
    throw new Error("Swirl animated id map is required.");
  }
  if (
    typeof cc.moveTo !== "function" ||
    typeof cc.rotateBy !== "function" ||
    typeof cc.sequence !== "function" ||
    typeof cc.callFunc !== "function"
  ) {
    throw new Error("Swirl animation requires Cocos action APIs.");
  }
  var boardSnapshot = runtimeSnapshot.board;
  if (!boardSnapshot || !Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Swirl animation requires board snapshot geometry.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Swirl animation requires finite board viewportOffsetY.");
  }

  resolution.swirlRotations.forEach(function (rotation) {
    if (!rotation || typeof rotation.id !== "string" || !rotation.id) {
      throw new Error("Swirl animation requires rotation id.");
    }
    if (this.swirlRotationAnimatedIds[rotation.id]) {
      return;
    }
    if (rotation.duration !== SpecialAnimationTiming.swirlRotation.duration) {
      throw new Error("Swirl animation duration must match SpecialAnimationTiming.");
    }
    if (rotation.angleDegrees !== 60) {
      throw new Error("Swirl animation angle must be exactly 60 degrees.");
    }
    if (!Array.isArray(rotation.moves) || !rotation.moves.length) {
      throw new Error("Swirl animation requires occupied track moves.");
    }
    this.swirlRotationAnimatedIds[rotation.id] = true;

    rotation.moves.forEach(function (move) {
      if (
        !move ||
        !Number.isInteger(move.fromRow) ||
        !Number.isInteger(move.fromCol) ||
        !Number.isInteger(move.toRow) ||
        !Number.isInteger(move.toCol) ||
        typeof move.targetCellId !== "string" ||
        !move.targetCellId
      ) {
        throw new Error("Swirl animation move is invalid.");
      }
      var bubbleNode = this.boardBubbleNodes[move.targetCellId];
      if (!bubbleNode || !bubbleNode.isValid) {
        throw new Error("Swirl animation target bubble node missing: " + move.targetCellId);
      }
      var startPosition = BoardLayout.getCellPosition(
        move.fromRow,
        move.fromCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      var targetPosition = BoardLayout.getCellPosition(
        move.toRow,
        move.toCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      bubbleNode.stopAllActions();
      bubbleNode.setPosition(startPosition.x, startPosition.y);
      bubbleNode.runAction(cc.moveTo(rotation.duration, targetPosition.x, targetPosition.y));
    }, this);

    if (typeof rotation.centerId !== "string" && typeof rotation.centerId !== "number") {
      throw new Error("Swirl animation requires centerId.");
    }
    var centerNode = this.boardBubbleNodes[String(rotation.centerId)];
    if (!centerNode || !centerNode.isValid) {
      throw new Error("Swirl animation center node missing: " + rotation.centerId);
    }
    centerNode.stopAllActions();
    centerNode.angle = 0;
    centerNode.runAction(cc.sequence(
      cc.rotateBy(rotation.duration, -rotation.angleDegrees),
      cc.callFunc(function () {
        if (!centerNode || !centerNode.isValid) {
          throw new Error("Swirl animation center node was destroyed before completion.");
        }
        centerNode.angle = 0;
      })
    ));
  }, this);
};

LevelRenderer.prototype._playWormholeShiftAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.wormholeShifts)) {
    throw new Error("Wormhole animation requires lastResolution.wormholeShifts.");
  }
  if (!resolution.wormholeShifts.length) {
    return;
  }
  if (!this.wormholeShiftAnimatedIds || typeof this.wormholeShiftAnimatedIds !== "object") {
    throw new Error("Wormhole animated id map is required.");
  }
  if (typeof cc.moveTo !== "function") {
    throw new Error("Wormhole animation requires Cocos action APIs.");
  }
  var boardSnapshot = runtimeSnapshot.board;
  if (!boardSnapshot || !Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Wormhole animation requires board snapshot geometry.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Wormhole animation requires finite board viewportOffsetY.");
  }

  resolution.wormholeShifts.forEach(function (shift) {
    if (!shift || typeof shift.id !== "string" || !shift.id) {
      throw new Error("Wormhole animation requires shift id.");
    }
    if (this.wormholeShiftAnimatedIds[shift.id]) {
      return;
    }
    if (shift.duration !== SpecialAnimationTiming.wormholeShift.duration) {
      throw new Error("Wormhole animation duration must match SpecialAnimationTiming.");
    }
    if (shift.moveDirection !== "left" && shift.moveDirection !== "right") {
      throw new Error("Wormhole animation requires left/right moveDirection.");
    }
    if (!Array.isArray(shift.moves)) {
      throw new Error("Wormhole animation requires moves array.");
    }
    this.wormholeShiftAnimatedIds[shift.id] = true;

    shift.moves.forEach(function (move) {
      if (
        !move ||
        !Number.isInteger(move.fromRow) ||
        !Number.isInteger(move.fromCol) ||
        !Number.isInteger(move.toRow) ||
        !Number.isInteger(move.toCol) ||
        typeof move.targetCellId !== "string" ||
        !move.targetCellId
      ) {
        throw new Error("Wormhole animation move is invalid.");
      }
      var bubbleNode = this.boardBubbleNodes[move.targetCellId];
      if (!bubbleNode || !bubbleNode.isValid) {
        throw new Error("Wormhole animation target bubble node missing: " + move.targetCellId);
      }
      var startPosition = BoardLayout.getCellPosition(
        move.fromRow,
        move.fromCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      var targetPosition = BoardLayout.getCellPosition(
        move.toRow,
        move.toCol,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      bubbleNode.stopAllActions();
      bubbleNode.setPosition(startPosition.x, startPosition.y);
      bubbleNode.runAction(cc.moveTo(shift.duration, targetPosition.x, targetPosition.y));
    }, this);

    [shift.leftWormholeId, shift.rightWormholeId].forEach(function (wormholeId) {
      if (typeof wormholeId !== "string" && typeof wormholeId !== "number") {
        throw new Error("Wormhole animation requires endpoint ids.");
      }
      var wormholeNode = this.boardBubbleNodes[String(wormholeId)];
      if (!wormholeNode || !wormholeNode.isValid) {
        throw new Error("Wormhole animation endpoint node missing: " + wormholeId);
      }
      if (wormholeNode.__wormholeShaderActive !== true) {
        throw new Error("Wormhole animation endpoint must keep its flow shader active: " + wormholeId);
      }
    }, this);
  }, this);
};

LevelRenderer.prototype._destroyWormholeDirectionGuide = function () {
  if (!this.wormholeDirectionGuideRoot) {
    this.lastWormholeDirectionGuideKey = "";
    return;
  }
  if (!this.wormholeDirectionGuideRoot.isValid) {
    throw new Error("Wormhole direction guide root became invalid unexpectedly.");
  }
  if (typeof this.wormholeDirectionGuideRoot.destroy !== "function") {
    throw new Error("Wormhole direction guide root requires destroy API.");
  }
  this.wormholeDirectionGuideRoot.removeFromParent(true);
  this.wormholeDirectionGuideRoot.destroy();
  this.wormholeDirectionGuideRoot = null;
  this.lastWormholeDirectionGuideKey = "";
};

LevelRenderer.prototype._syncWormholeDirectionGuide = function (boardSnapshot) {
  if (!boardSnapshot || !Array.isArray(boardSnapshot.cells) || !Number.isInteger(boardSnapshot.maxColumns)) {
    throw new Error("Wormhole direction guide requires board snapshot geometry.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Wormhole direction guide requires finite board viewportOffsetY.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Wormhole direction guide requires board layer.");
  }

  var wormholes = boardSnapshot.cells.filter(function (cell) {
    return !!(cell && cell.entityCategory === "reactive_ball" && cell.entityType === "wormhole");
  }).sort(function (left, right) {
    return left.col - right.col;
  });

  if (!wormholes.length) {
    this._destroyWormholeDirectionGuide();
    return;
  }
  if (wormholes.length !== 2) {
    throw new Error("Wormhole direction guide requires exactly two wormholes.");
  }

  var leftWormhole = wormholes[0];
  var rightWormhole = wormholes[1];
  if (!Number.isInteger(leftWormhole.row) || !Number.isInteger(leftWormhole.col) ||
      !Number.isInteger(rightWormhole.row) || !Number.isInteger(rightWormhole.col)) {
    throw new Error("Wormhole direction guide requires integer endpoint coordinates.");
  }
  if (leftWormhole.row !== rightWormhole.row) {
    throw new Error("Wormhole direction guide endpoints must share one row.");
  }
  if (rightWormhole.col - leftWormhole.col < 2) {
    throw new Error("Wormhole direction guide requires at least one interior slot.");
  }
  if ((leftWormhole.moveDirection !== "left" && leftWormhole.moveDirection !== "right") ||
      leftWormhole.moveDirection !== rightWormhole.moveDirection) {
    throw new Error("Wormhole direction guide requires matching left/right moveDirection.");
  }

  var direction = leftWormhole.moveDirection;
  var guideKey = [
    leftWormhole.row,
    leftWormhole.col,
    rightWormhole.col,
    direction,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  ].join("|");
  if (this.lastWormholeDirectionGuideKey === guideKey) {
    if (!this.wormholeDirectionGuideRoot || !this.wormholeDirectionGuideRoot.isValid) {
      throw new Error("Wormhole direction guide key requires a valid guide root.");
    }
    return;
  }

  var arrowFrame = this.spriteFrameCache[WORMHOLE_DIRECTION_ARROW_RESOURCE];
  if (!arrowFrame || !arrowFrame.isValid) {
    throw new Error("Wormhole direction guide requires preloaded arrow SpriteFrame: " + WORMHOLE_DIRECTION_ARROW_RESOURCE);
  }
  if (!WORMHOLE_DIRECTION_ARROW_SIZE ||
      typeof WORMHOLE_DIRECTION_ARROW_SIZE.width !== "number" || WORMHOLE_DIRECTION_ARROW_SIZE.width <= 0 ||
      typeof WORMHOLE_DIRECTION_ARROW_SIZE.height !== "number" || WORMHOLE_DIRECTION_ARROW_SIZE.height <= 0) {
    throw new Error("Wormhole direction arrow size must be positive.");
  }
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE,
    "Wormhole direction arrow travel distance"
  );
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_STAGGER,
    "Wormhole direction arrow stagger"
  );
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION,
    "Wormhole direction arrow fade-in duration"
  );
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION,
    "Wormhole direction arrow fade-out duration"
  );
  requirePositiveFiniteNumber(
    WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE,
    "Wormhole direction arrow cycle pause"
  );
  if (typeof cc.Node !== "function" || typeof cc.sequence !== "function" ||
      typeof cc.spawn !== "function" || typeof cc.callFunc !== "function" ||
      typeof cc.delayTime !== "function" || typeof cc.moveBy !== "function" ||
      typeof cc.fadeTo !== "function" || typeof cc.scaleTo !== "function" ||
      typeof cc.repeatForever !== "function") {
    throw new Error("Wormhole direction guide requires Cocos node and action APIs.");
  }

  this._destroyWormholeDirectionGuide();

  var guideRoot = new cc.Node("WormholeDirectionGuide");
  guideRoot.parent = this.layers.board;
  guideRoot.zIndex = 1000;
  this.wormholeDirectionGuideRoot = guideRoot;
  this.lastWormholeDirectionGuideKey = guideKey;

  var interiorSlotCount = rightWormhole.col - leftWormhole.col - 1;
  var directionSign = direction === "right" ? 1 : -1;
  for (var slotIndex = 0; slotIndex < interiorSlotCount; slotIndex += 1) {
    var col = leftWormhole.col + 1 + slotIndex;
    var position = BoardLayout.getCellPosition(
      leftWormhole.row,
      col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );
    if (!position || typeof position.x !== "number" || !isFinite(position.x) ||
        typeof position.y !== "number" || !isFinite(position.y)) {
      throw new Error("Wormhole direction guide received invalid cell position.");
    }

    var arrowNode = new cc.Node("DirectionArrow_" + slotIndex);
    arrowNode.parent = guideRoot;
    arrowNode.setContentSize(WORMHOLE_DIRECTION_ARROW_SIZE);
    arrowNode.setPosition(position.x, position.y);
    arrowNode.angle = direction === "right" ? 0 : 180;
    arrowNode.opacity = 0;
    arrowNode.setScale(0.78);
    ensureSprite(arrowNode, arrowFrame);

    var flowOrder = direction === "right" ? slotIndex : interiorSlotCount - 1 - slotIndex;
    var initialDelay = flowOrder * WORMHOLE_DIRECTION_ARROW_STAGGER;
    var trailingDelay = (interiorSlotCount - flowOrder) * WORMHOLE_DIRECTION_ARROW_STAGGER +
      WORMHOLE_DIRECTION_ARROW_CYCLE_PAUSE;
    var baseX = position.x;
    var baseY = position.y;
    arrowNode.runAction(cc.repeatForever(cc.sequence(
      cc.callFunc(function (node, data) {
        if (!node || !node.isValid) {
          throw new Error("Wormhole direction arrow was destroyed during animation.");
        }
        node.setPosition(data.x, data.y);
        node.opacity = 0;
        node.setScale(0.78);
      }, arrowNode, { x: baseX, y: baseY }),
      cc.delayTime(initialDelay),
      cc.spawn(
        cc.moveBy(WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION, directionSign * WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE * 0.5, 0),
        cc.fadeTo(WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION, 235),
        cc.scaleTo(WORMHOLE_DIRECTION_ARROW_FADE_IN_DURATION, 1)
      ),
      cc.spawn(
        cc.moveBy(WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION, directionSign * WORMHOLE_DIRECTION_ARROW_TRAVEL_DISTANCE * 0.5, 0),
        cc.fadeTo(WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION, 0),
        cc.scaleTo(WORMHOLE_DIRECTION_ARROW_FADE_OUT_DURATION, 0.82)
      ),
      cc.delayTime(trailingDelay)
    )));
  }
};

LevelRenderer.prototype._playMolotovBlastAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var triggered = resolution && Array.isArray(resolution.reactiveTriggered) ? resolution.reactiveTriggered : [];
  var molotovTriggers = triggered.filter(function (entry) {
    return !!(entry && entry.entityType === "molotov");
  });
  if (!molotovTriggers.length) {
    return;
  }

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Molotov blast animation requires board snapshot.");
  }
  var boardSnapshot = runtimeSnapshot.board;

  molotovTriggers.forEach(function (trigger) {
    if (!trigger || (typeof trigger.id !== "string" && typeof trigger.id !== "number")) {
      throw new Error("Molotov blast animation requires trigger id.");
    }
    if (!Number.isInteger(trigger.row) || !Number.isInteger(trigger.col)) {
      throw new Error("Molotov blast animation requires trigger coordinates.");
    }

    var normalizedId = String(trigger.id);
    var blastPosition = requireFinitePoint(BoardLayout.getCellPosition(
      trigger.row,
      trigger.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    ), "Molotov blast");
    if (this.molotovBlastAnimatedIds[normalizedId]) {
      return;
    }
    this.molotovBlastAnimatedIds[normalizedId] = true;
    this._hideMolotovBlastSource(normalizedId);

    playExplosionAnimationAt(this, "MolotovBlastFx_" + normalizedId, blastPosition, "Molotov blast animation", function () {
      this._clearMolotovBlastHiddenSource(normalizedId);
    }.bind(this));
  }, this);
};

LevelRenderer.prototype._playBlastExplosionAnimation = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  if (!resolution) {
    return;
  }
  if (!Array.isArray(resolution.blastExplosions)) {
    throw new Error("Blast explosion animation requires lastResolution.blastExplosions.");
  }
  var explosions = resolution.blastExplosions;
  if (!explosions.length) {
    return;
  }

  if (!runtimeSnapshot.board || !Number.isInteger(runtimeSnapshot.board.maxColumns)) {
    throw new Error("Blast explosion animation requires board snapshot.");
  }
  var boardSnapshot = runtimeSnapshot.board;

  explosions.forEach(function (explosion) {
    if (!explosion || (typeof explosion.id !== "string" && typeof explosion.id !== "number")) {
      throw new Error("Blast explosion animation requires explosion id.");
    }
    if (!Number.isInteger(explosion.row) || !Number.isInteger(explosion.col)) {
      throw new Error("Blast explosion animation requires explosion coordinates.");
    }
    if (explosion.entityType !== "blast") {
      throw new Error("Blast explosion animation requires entityType blast.");
    }

    var normalizedId = String(explosion.id);
    if (this.blastExplosionAnimatedIds[normalizedId]) {
      return;
    }
    this.blastExplosionAnimatedIds[normalizedId] = true;

    var explosionPosition = requireFinitePoint(BoardLayout.getCellPosition(
      explosion.row,
      explosion.col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    ), "Blast explosion");
    playExplosionAnimationAt(this, "BlastExplosionFx_" + normalizedId, explosionPosition, "Blast explosion animation", null);
  }, this);
};

LevelRenderer.prototype._spawnIceSnowballFlyFxNode = function (nodeName, gameViewX, gameViewY, innerColor) {
  var parentNode = this._getGameViewNode();
  if (!parentNode || !parentNode.isValid) {
    throw new Error("GameView is required for ice snowball fly fx.");
  }
  if (typeof nodeName !== "string" || !nodeName) {
    throw new Error("Ice snowball fly fx requires node name.");
  }
  if (typeof innerColor !== "string" || !innerColor) {
    throw new Error("Ice snowball fly fx requires innerColor.");
  }
  if (typeof gameViewX !== "number" || typeof gameViewY !== "number" || !isFinite(gameViewX) || !isFinite(gameViewY)) {
    throw new Error("Ice snowball fly fx requires finite GameView position.");
  }

  var fxNode = new cc.Node(nodeName);
  fxNode.parent = parentNode;
  fxNode.zIndex = ICE_COLLECT_FLY_Z_INDEX;
  fxNode.setPosition(gameViewX, gameViewY);
  fxNode.setScale(1);
  fxNode.opacity = 255;
  this._applyBallVisualCached(fxNode, {
    entityCategory: "obstacle_ball",
    entityType: "ice",
    innerColor: innerColor
  }, BOARD_BUBBLE_SIZE);
  return fxNode;
};

LevelRenderer.prototype._spawnIceSnowballFxNode = function (nodeName, baseX, baseY, innerColor, zIndexBase) {
  if (!this.layers || !this.layers.board) {
    throw new Error("Ice snowball fx requires board layer.");
  }
  if (typeof nodeName !== "string" || !nodeName) {
    throw new Error("Ice snowball fx requires node name.");
  }
  if (typeof innerColor !== "string" || !innerColor) {
    throw new Error("Ice snowball fx requires innerColor.");
  }

  var fxNode = new cc.Node(nodeName);
  fxNode.parent = this.layers.board;
  fxNode.zIndex = typeof zIndexBase === "number" ? zIndexBase : 10;
  fxNode.setPosition(baseX, baseY);
  fxNode.setScale(1);
  fxNode.opacity = 255;
  this._applyBallVisualCached(fxNode, {
    entityCategory: "obstacle_ball",
    entityType: "ice",
    innerColor: innerColor
  }, BOARD_BUBBLE_SIZE);
  return fxNode;
};

LevelRenderer.prototype._flyIceFxNodeToHudTarget = function (fxNode, startX, startY, options) {
  if (!fxNode) {
    throw new Error("Ice fx fly requires fxNode.");
  }

  var targetBoardPos = options && options.targetBoardPos ? options.targetBoardPos : null;
  var flyDuration = Math.max(0.18, Number(options && options.flyDuration) || Number(ICE_COLLECT_FLY_DURATION) || 0.34);
  var bezierArc = Math.max(40, Number(options && options.bezierArc) || Number(ICE_COLLECT_BEZIER_ARC) || 120);
  var startDelay = Math.max(0, Number(options && options.startDelay) || 0);
  var onArrive = options && typeof options.onArrive === "function" ? options.onArrive : null;
  var onComplete = options && typeof options.onComplete === "function" ? options.onComplete : null;

  var finishFx = function () {
    if (fxNode && fxNode.isValid && fxNode.parent) {
      fxNode.removeFromParent(true);
    }
    if (onComplete) {
      onComplete();
    }
  };

  if (!targetBoardPos) {
    finishFx();
    return;
  }

  var baseX = startX;
  var baseY = startY;
  var endX = targetBoardPos.x;
  var endY = targetBoardPos.y;
  var controlY = Math.max(baseY, endY) + bezierArc;
  var controlX = (baseX + endX) * 0.5;

  fxNode.stopAllActions();
  if (
    fxNode.runAction &&
    typeof cc.bezierTo === "function" &&
    typeof cc.spawn === "function" &&
    typeof cc.sequence === "function" &&
    typeof cc.callFunc === "function" &&
    typeof cc.delayTime === "function" &&
    typeof cc.scaleTo === "function" &&
    typeof cc.fadeTo === "function" &&
    typeof cc.v2 === "function"
  ) {
    var bezier = [
      cc.v2(controlX, controlY),
      cc.v2(controlX, controlY),
      cc.v2(endX, endY)
    ];
    var flyAction = cc.spawn(
      applyIceCollectFlyEaseAction(cc.bezierTo(flyDuration, bezier)),
      applyIceCollectFlyEaseAction(cc.scaleTo(flyDuration, 0.38)),
      applyIceCollectFlyEaseAction(cc.fadeTo(flyDuration, 120))
    );
    var actionChain = [];
    if (startDelay > 0) {
      actionChain.push(cc.delayTime(startDelay));
    }
    actionChain.push(flyAction);
    actionChain.push(cc.callFunc(function () {
      if (onArrive) {
        onArrive();
      }
      finishFx();
    }));
    fxNode.runAction(cc.sequence.apply(null, actionChain));
    return;
  }

  if (typeof cc.tween !== "function") {
    finishFx();
    return;
  }

  if (typeof ICE_COLLECT_FLY_TWEEN_EASING !== "string" || !ICE_COLLECT_FLY_TWEEN_EASING) {
    throw new Error("Ice collect fly tween easing must be a non-empty string.");
  }

  var collectTween = cc.tween(fxNode);
  if (startDelay > 0) {
    collectTween = collectTween.delay(startDelay);
  }
  if (typeof collectTween.bezierTo === "function") {
    collectTween
      .parallel(
        cc.tween().bezierTo(
          flyDuration,
          cc.v2(controlX, controlY),
          cc.v2(controlX, controlY),
          cc.v2(endX, endY),
          { easing: ICE_COLLECT_FLY_TWEEN_EASING }
        ),
        cc.tween().to(flyDuration, { scale: 0.38 }, { easing: ICE_COLLECT_FLY_TWEEN_EASING }),
        cc.tween().to(flyDuration, { opacity: 120 }, { easing: ICE_COLLECT_FLY_TWEEN_EASING })
      )
      .call(function () {
        if (onArrive) {
          onArrive();
        }
        finishFx();
      })
      .start();
    return;
  }

  collectTween
    .to(flyDuration, {
      x: endX,
      y: endY,
      scale: 0.38,
      opacity: 120
    }, {
      easing: ICE_COLLECT_FLY_TWEEN_EASING
    })
    .call(function () {
      if (onArrive) {
        onArrive();
      }
      finishFx();
    })
    .start();
};

LevelRenderer.prototype._shouldFlyIceSnowballToHud = function (levelConfig) {
  var config = levelConfig || this.currentLevelConfig;
  if (!config) {
    return false;
  }
  return hasIceSnowballCollectionObjective(config);
};

LevelRenderer.prototype._playIceSnowballCollectFly = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  if (!this._shouldFlyIceSnowballToHud(this.currentLevelConfig)) {
    return;
  }

  var targetGameViewPos = this._getHudTargetIceBallPositionInGameView();
  if (!targetGameViewPos) {
    this._syncDisplayedIceSnowballCollectedTotal(runtimeSnapshot);
    this._refreshIceSnowballHudTarget();
    return;
  }

  var runtimeEvents = runtimeSnapshot.runtimeEvents;
  var maxProcessedEventId = this.lastIceSnowballCollectEventId;
  var flyDuration = Math.max(0.18, Number(ICE_COLLECT_FLY_DURATION) || 0.34);
  var bezierArc = Math.max(40, Number(ICE_COLLECT_BEZIER_ARC) || 120);
  var boardSnapshot = runtimeSnapshot.board;

  for (var index = 0; index < runtimeEvents.length; index += 1) {
    var event = runtimeEvents[index];
    if (!event || event.type !== "ice_snowball_collect") {
      continue;
    }
    if (typeof event.id !== "number" || !isFinite(event.id)) {
      throw new Error("ice_snowball_collect event requires a numeric id.");
    }
    if (event.id <= this.lastIceSnowballCollectEventId) {
      continue;
    }
    if (!Array.isArray(event.entries) || !event.entries.length) {
      continue;
    }

    maxProcessedEventId = Math.max(maxProcessedEventId, event.id);
    event.entries.forEach(function (entry, entryIndex) {
      if (!entry || (typeof entry.id !== "string" && typeof entry.id !== "number")) {
        throw new Error("Ice snowball collect entry requires id.");
      }
      var position = this._resolveIceSnowballCollectStartPositionInGameView(entry, boardSnapshot);
      var fxNode = this._spawnIceSnowballFlyFxNode(
        "IceCollectFx_" + entry.id + "_" + event.id + "_" + entryIndex,
        position.x,
        position.y,
        entry.innerColor
      );
      this._flyIceFxNodeToHudTarget(fxNode, position.x, position.y, {
        targetBoardPos: targetGameViewPos,
        flyDuration: flyDuration,
        bezierArc: bezierArc,
        startDelay: 0.03,
        onArrive: function () {
          this._incrementDisplayedIceSnowballCollectedTotal();
          this._refreshIceSnowballHudTarget();
        }.bind(this)
      });
    }, this);
  }

  this.lastIceSnowballCollectEventId = maxProcessedEventId;
};

LevelRenderer.prototype._playIceThawShake = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var impact = resolution && resolution.impact ? resolution.impact : null;
  var thawedCells = resolution && Array.isArray(resolution.thawed) ? resolution.thawed : [];
  if (!impact || !impact.seq || !thawedCells.length || impact.seq === this.lastIceThawShakeSeq) {
    return;
  }

  this.lastIceThawShakeSeq = impact.seq;
  if (!this.layers || !this.layers.board) {
    return;
  }

  var boardSnapshot = runtimeSnapshot.board;
  var offset = Math.max(2, Number(ICE_THAW_SHAKE_OFFSET) || 0);
  var stepDuration = Math.max(0.02, Number(ICE_THAW_SHAKE_STEP_DURATION) || 0.04);

  thawedCells.forEach(function (cell) {
    if (!cell) {
      return;
    }

    var innerColor = typeof cell.color === "string" && cell.color ? cell.color : resolveIceInnerColor(cell);
    if (typeof innerColor !== "string" || !innerColor) {
      throw new Error("Ice thaw animation requires inner color.");
    }

    var bubbleNode = cell.id ? this.layers.board.getChildByName("Bubble_" + cell.id) : null;
    var baseX = null;
    var baseY = null;
    var fxZIndex = 10;

    if (bubbleNode) {
      if (bubbleNode.__iceThawShakeSeq === impact.seq) {
        return;
      }
      bubbleNode.__iceThawShakeSeq = impact.seq;
      baseX = bubbleNode.x;
      baseY = bubbleNode.y;
      fxZIndex = (bubbleNode.zIndex || 0) + 1;
      bubbleNode.stopAllActions();
      bubbleNode.__thawHiddenSeq = impact.seq;
      bubbleNode.opacity = 0;
      bubbleNode.active = false;
    } else {
      if (
        !boardSnapshot ||
        !Number.isInteger(boardSnapshot.maxColumns) ||
        typeof boardSnapshot.viewportOffsetY !== "number" ||
        !isFinite(boardSnapshot.viewportOffsetY) ||
        !Number.isInteger(cell.row) ||
        !Number.isInteger(cell.col)
      ) {
        throw new Error("Ice thaw animation requires board position when bubble node is missing.");
      }
      var cellPosition = BoardLayout.getCellPosition(
        cell.row,
        cell.col,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
      baseX = cellPosition.x;
      baseY = cellPosition.y;
    }

    var fxNode = this._spawnIceSnowballFxNode(
      "IceThawFx_" + (cell.id || (cell.row + "_" + cell.col)) + "_" + impact.seq,
      baseX,
      baseY,
      innerColor,
      fxZIndex
    );

    var revealBubble = function () {
      if (!bubbleNode || bubbleNode.__thawHiddenSeq !== impact.seq) {
        return;
      }
      bubbleNode.active = true;
      bubbleNode.opacity = 255;
      bubbleNode.__thawHiddenSeq = -1;
    };

    var finishShakeFx = function () {
      revealBubble();
      if (fxNode && fxNode.isValid && fxNode.parent) {
        fxNode.removeFromParent(true);
      }
    };

    if (typeof cc.tween !== "function") {
      finishShakeFx();
      return;
    }

    cc.tween(fxNode)
      .to(stepDuration, { x: baseX - offset, y: baseY })
      .to(stepDuration, { x: baseX + offset, y: baseY })
      .to(stepDuration, { x: baseX - offset * 0.7, y: baseY })
      .to(stepDuration, { x: baseX + offset * 0.7, y: baseY })
      .to(stepDuration, { x: baseX, y: baseY })
      .call(finishShakeFx)
      .start();
  }, this);
};

LevelRenderer.prototype._playShotNoDropScreenShake = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  var runtimeEvents = runtimeSnapshot.runtimeEvents;
  var shakeEvent = null;
  for (var index = 0; index < runtimeEvents.length; index += 1) {
    var event = runtimeEvents[index];
    if (event && event.type === "shot_no_drop") {
      shakeEvent = event;
    }
  }

  if (!shakeEvent) {
    return;
  }
  if (typeof shakeEvent.id !== "number" || !isFinite(shakeEvent.id)) {
    throw new Error("shot_no_drop event requires a numeric id.");
  }
  if (shakeEvent.id === this.lastNoDropShakeEventId) {
    return;
  }

  this.lastNoDropShakeEventId = shakeEvent.id;
  if (!this.layers) {
    throw new Error("shot_no_drop screen shake requires renderer layers.");
  }

  var offset = Number(SHOT_NO_DROP_SHAKE_OFFSET);
  var stepDuration = Number(SHOT_NO_DROP_SHAKE_STEP_DURATION);
  if (!isFinite(offset) || offset <= 0) {
    throw new Error("shot_no_drop screen shake offset must be positive.");
  }
  if (!isFinite(stepDuration) || stepDuration <= 0) {
    throw new Error("shot_no_drop screen shake step duration must be positive.");
  }
  if (
    typeof cc.sequence !== "function" ||
    typeof cc.moveTo !== "function" ||
    typeof cc.callFunc !== "function"
  ) {
    throw new Error("shot_no_drop screen shake requires Cocos actions.");
  }

  var layerNames = [
    "dangerLine",
    "jars",
    "shooter",
    "board",
    "falling",
    "jarOcclusion",
    "testGrid"
  ];
  layerNames.forEach(function (name) {
    var layer = this.layers[name];
    if (!layer || !layer.isValid) {
      throw new Error("shot_no_drop screen shake requires layer: " + name);
    }
    if (typeof layer.runAction !== "function" || typeof layer.stopAllActions !== "function") {
      throw new Error("shot_no_drop screen shake layer must support Cocos actions: " + name);
    }

    var basePosition = layer.__shotNoDropShakeBasePosition;
    if (basePosition) {
      layer.setPosition(basePosition.x, basePosition.y);
    } else {
      basePosition = {
        x: layer.x,
        y: layer.y
      };
    }
    if (
      typeof basePosition.x !== "number" ||
      typeof basePosition.y !== "number" ||
      !isFinite(basePosition.x) ||
      !isFinite(basePosition.y)
    ) {
      throw new Error("shot_no_drop screen shake layer position is invalid: " + name);
    }
    layer.__shotNoDropShakeBasePosition = basePosition;
    layer.stopAllActions();

    layer.runAction(cc.sequence(
      cc.moveTo(stepDuration, basePosition.x - offset, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x + offset, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x - offset * 0.6, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x + offset * 0.6, basePosition.y),
      cc.moveTo(stepDuration, basePosition.x, basePosition.y),
      cc.callFunc(function () {
        layer.__shotNoDropShakeBasePosition = null;
      })
    ));
  }, this);
};

LevelRenderer.prototype._startBoardClearFireworks = function () {
  if (this.boardClearFireworksActive === true) {
    if (!this.boardClearFireworksRoot || !this.boardClearFireworksRoot.isValid) {
      throw new Error("Board clear fireworks active state requires valid root.");
    }
    return;
  }
  if (
    typeof cc.sequence !== "function" ||
    typeof cc.callFunc !== "function" ||
    typeof cc.delayTime !== "function" ||
    typeof cc.repeatForever !== "function"
  ) {
    throw new Error("Board clear fireworks requires Cocos action APIs.");
  }
  requireBoardClearFireworksPrefab(this);
  var rootParent = requireBoardClearFireworksRootParent(this);
  var existingRoot = rootParent.getChildByName("BoardClearFireworksRoot");
  if (existingRoot && existingRoot.isValid) {
    throw new Error("Board clear fireworks root already exists.");
  }

  var intervalSec = Number(BOARD_CLEAR_FIREWORKS_INTERVAL_SEC);
  requirePositiveFiniteNumber(intervalSec, "Board clear fireworks interval");
  var root = new cc.Node("BoardClearFireworksRoot");
  root.parent = rootParent;
  root.setPosition(0, 0);
  root.zIndex = 300;
  root.active = true;
  this.boardClearFireworksRoot = root;
  this.boardClearFireworksActive = true;
  spawnBoardClearFireworksBurst(this);
  root.runAction(cc.repeatForever(cc.sequence(
    cc.delayTime(intervalSec),
    cc.callFunc(function () {
      spawnBoardClearFireworksBurst(this);
    }.bind(this))
  )));
};

LevelRenderer.prototype._stopBoardClearFireworks = function () {
  var root = this.boardClearFireworksRoot;
  this.boardClearFireworksRoot = null;
  this.boardClearFireworksActive = false;
  if (!root || !root.isValid) {
    return;
  }
  root.stopAllActions();
  root.children.slice().forEach(function (child) {
    stopParticleSystemIfPresent(child);
  });
  root.removeFromParent(false);
  root.destroy();
};

LevelRenderer.prototype._syncBoardClearFireworks = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot.state !== "string") {
    throw new Error("Board clear fireworks requires runtime snapshot state.");
  }
  if (
    runtimeSnapshot.state === "won_pending" ||
    runtimeSnapshot.state === "won_surplus_shots_pending" ||
    runtimeSnapshot.state === "won_settlement_pending"
  ) {
    this._startBoardClearFireworks();
    return;
  }
  this._stopBoardClearFireworks();
};

LevelRenderer.prototype._playImpactBounce = function (runtimeSnapshot) {
  var resolution = runtimeSnapshot && runtimeSnapshot.lastResolution ? runtimeSnapshot.lastResolution : null;
  var impact = resolution && resolution.impact ? resolution.impact : null;
  if (!impact || !impact.seq || impact.seq === this.lastImpactSeq) {
    return;
  }

  this.lastImpactSeq = impact.seq;
  if (!this.layers || !this.layers.board) {
    return;
  }

  var center = impact.center || { x: 0, y: 0 };
  var pushDistance = Math.max(2, Number(impact.pushDistance) || IMPACT_DEFAULT_PUSH_DISTANCE);
  var bounceSpeed = resolveImpactBounceSpeed(impact);
  var pushDuration = Math.max(IMPACT_MIN_PUSH_DURATION, pushDistance / bounceSpeed);
  var returnDuration = Math.max(IMPACT_MIN_RETURN_DURATION, pushDuration * IMPACT_RETURN_DURATION_RATIO);
  var neighbors = Array.isArray(impact.neighbors) ? impact.neighbors : [];
  var fallingActiveCount = runtimeSnapshot && runtimeSnapshot.systems &&
    runtimeSnapshot.systems.fallingMarbleSystem
    ? Math.max(0, Number(runtimeSnapshot.systems.fallingMarbleSystem.activeDropCount) || 0)
    : 0;
  var neighborBudget = fallingActiveCount >= 36 ? 2 : (fallingActiveCount >= 18 ? 4 : neighbors.length);

  for (var index = 0; index < neighbors.length && index < neighborBudget; index += 1) {
    var neighbor = neighbors[index];
    if (!neighbor || !neighbor.id) {
      continue;
    }

    var bubbleNode = this.layers.board.getChildByName("Bubble_" + neighbor.id);
    if (!bubbleNode) {
      continue;
    }

    var baseX = typeof neighbor.x === "number"
      ? neighbor.x
      : (typeof neighbor.position === "object" && typeof neighbor.position.x === "number"
        ? neighbor.position.x
        : bubbleNode.x);
    var baseY = typeof neighbor.y === "number"
      ? neighbor.y
      : (typeof neighbor.position === "object" && typeof neighbor.position.y === "number"
        ? neighbor.position.y
        : bubbleNode.y);
    var dirX = baseX - center.x;
    var dirY = baseY - center.y;
    var len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len < 0.0001) {
      dirX = 0;
      dirY = 1;
      len = 1;
    }

    var pushX = baseX + dirX / len * pushDistance;
    var pushY = baseY + dirY / len * pushDistance;

    bubbleNode.stopAllActions();
    bubbleNode.x = baseX;
    bubbleNode.y = baseY;

    if (typeof cc.tween !== "function") {
      bubbleNode.x = baseX;
      bubbleNode.y = baseY;
      continue;
    }

    cc.tween(bubbleNode)
      .to(pushDuration, {
        x: pushX,
        y: pushY
      }, {
        easing: "quadOut"
      })
      .to(returnDuration, {
        x: baseX,
        y: baseY
      }, {
        easing: "quadIn"
      })
      .start();
  }
};
}

module.exports = attachLevelRendererSceneFxMethods;

},{}],
"LevelRendererSceneHudMethods":[function(require,module,exports){
"use strict";

var SceneShared = require("./LevelRendererSceneShared");

function attachLevelRendererSceneHudMethods(LevelRenderer, deps) {
  var Logger = deps.Logger;
  var requireChildNode = SceneShared.requireChildNode;
  var BoardLayout = deps.BoardLayout;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var POWERUP_ICON_RESOURCES = deps.POWERUP_ICON_RESOURCES;
  var HUD_STAR_RESOURCES = deps.HUD_STAR_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var JarScoreConfig = deps.JarScoreConfig;
  var WIN_STAR_PUNCH_FROM_SCALE = deps.WIN_STAR_PUNCH_FROM_SCALE;
  var WIN_STAR_PUNCH_DOWN_SCALE = deps.WIN_STAR_PUNCH_DOWN_SCALE;
  var WIN_STAR_SHRINK_DURATION = deps.WIN_STAR_SHRINK_DURATION;
  var WIN_STAR_RECOVER_DURATION = deps.WIN_STAR_RECOVER_DURATION;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildHudTargetDisplayData = deps.buildHudTargetDisplayData;
  var applyIceSnowballHudDisplayProgress = deps.applyIceSnowballHudDisplayProgress;
  var hasIceSnowballCollectionObjective = deps.hasIceSnowballCollectionObjective;
  var buildStateText = deps.buildStateText;
  var buildHudRenderKey = deps.buildHudRenderKey;
  var resolveWinStarRating = deps.resolveWinStarRating;
  var clamp = deps.clamp;
  var HUD_STAR_MARKER_FALLBACK_RATIOS = [0.3 / 0.85, 0.6 / 0.85, 1];
  var HUD_STAR_PARTICLE_NODE_NAME = "starParticle";
  var HUD_STAR_PARTICLE_DURATION = 0.7;
  var HUD_STAR_PARTICLE_HOLD_DURATION = 0.5;
  var HUD_STAR_PUNCH_SCALE = 1.35;
  var HUD_STAR_PUNCH_UP_DURATION = 0.12;
  var HUD_STAR_PUNCH_DOWN_DURATION = 0.14;
  var BOTTOM_PANEL_POWERUP_SLOTS = [
    { nodeName: "plus_ball_btn", iconKey: "plus_three_balls" },
    { nodeName: "eliminate_three_line_btn", iconKey: "three_line_elimination" },
    { nodeName: "precise_aim_btn", iconKey: "precise_aim" },
    { nodeName: "rainbow_btn", iconKey: "rainbow" },
    { nodeName: "change_btn", iconKey: "swap" },
    { nodeName: "destroy_btn", iconKey: "barrier_hammer" },
    { nodeName: "snow_removal_btn", iconKey: "snow_removal" },
    { nodeName: "bomb_btn", iconKey: "blast" }
  ];
  var POWERUP_LOAD_ANIMATION_CONFIG = {
    rainbow: {
      buttonNodeName: "rainbow_btn",
      spriteCode: "RAINBOW"
    },
    blast: {
      buttonNodeName: "bomb_btn",
      spriteCode: "BLAST"
    }
  };
  var SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING = 16;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE = 1.24;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE = 0.96;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE = 1.13;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE = 1.34;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE = 0.92;
  var SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE = 1.16;
  var SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION = 0.11;
  var SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION = 0.08;
  var SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION = 0.1;
  var SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION = 0.12;
  var SKILL_POWERUP_COLLECT_FEEDBACK_GAP_DURATION = 0.08;

  function resolveBottomPanelBoardTargets(runtimeSnapshot) {
    if (!runtimeSnapshot.board || typeof runtimeSnapshot.board !== "object") {
      throw new Error("Bottom panel requires board snapshot.");
    }
    if (!Array.isArray(runtimeSnapshot.board.cells)) {
      throw new Error("Bottom panel requires board cells.");
    }

    var hasIce = false;
    var hasStone = false;
    runtimeSnapshot.board.cells.forEach(function (cell, index) {
      if (!cell || typeof cell !== "object") {
        throw new Error("Bottom panel board.cells[" + index + "] must be an object.");
      }
      if (cell.entityCategory === "obstacle_ball" && cell.entityType === "ice") {
        hasIce = true;
      }
      if (cell.entityCategory === "obstacle_ball" && cell.entityType === "stone") {
        hasStone = true;
      }
    });

    if (
      !runtimeSnapshot.systems ||
      !runtimeSnapshot.systems.boardOcclusionSystem ||
      !Array.isArray(runtimeSnapshot.systems.boardOcclusionSystem.activeZones)
    ) {
      throw new Error("Bottom panel requires board occlusion snapshot.");
    }
    return {
      hasIce: hasIce,
      hasStone: hasStone,
      hasBoardOcclusion: runtimeSnapshot.systems.boardOcclusionSystem.activeZones.length > 0
    };
  }

LevelRenderer.prototype._ensureHudStarAnimationState = function () {
  var lastMissing = typeof this.lastHudStarRating === "undefined";
  var displayedMissing = typeof this.hudStarDisplayedRating === "undefined";
  var queuedMissing = typeof this.hudStarQueuedRating === "undefined";
  var queueMissing = typeof this.hudStarAnimationQueue === "undefined";
  var activeMissing = typeof this.hudStarAnimationActive === "undefined";
  var missingCount = 0;

  missingCount += lastMissing ? 1 : 0;
  missingCount += displayedMissing ? 1 : 0;
  missingCount += queuedMissing ? 1 : 0;
  missingCount += queueMissing ? 1 : 0;
  missingCount += activeMissing ? 1 : 0;

  if (missingCount === 5) {
    this.lastHudStarRating = null;
    this.hudStarDisplayedRating = null;
    this.hudStarQueuedRating = 0;
    this.hudStarAnimationQueue = [];
    this.hudStarAnimationActive = false;
    return;
  }

  if (missingCount > 0) {
    throw new Error("HUD star animation state is partially initialized.");
  }

  if (this.lastHudStarRating !== null && (typeof this.lastHudStarRating !== "number" || !isFinite(this.lastHudStarRating))) {
    throw new Error("HUD star last rating must be a finite number or null.");
  }
  if (this.hudStarDisplayedRating !== null && (typeof this.hudStarDisplayedRating !== "number" || !isFinite(this.hudStarDisplayedRating))) {
    throw new Error("HUD star displayed rating must be a finite number or null.");
  }
  if (typeof this.hudStarQueuedRating !== "number" || !isFinite(this.hudStarQueuedRating)) {
    throw new Error("HUD star queued rating must be a finite number.");
  }
  if (!Array.isArray(this.hudStarAnimationQueue)) {
    throw new Error("HUD star animation queue must be an array.");
  }
  if (typeof this.hudStarAnimationActive !== "boolean") {
    throw new Error("HUD star animation active state must be boolean.");
  }
};


LevelRenderer.prototype._renderHud = function (levelConfig, runtimeSnapshot) {
  var panel = this._getMountedHudPanel();
  if (!panel) {
    Logger.warn("HudPanel not found in mounted GameView.");
    return;
  }
  var hudTargetDisplay = this._buildHudTargetDisplayForRender(levelConfig, runtimeSnapshot);

  // this._setHudLabel(panel, "LevelTitle", "关卡");
  this._setHudLabel(panel, "LevelValue", String(levelConfig.level.levelId));
  // this._setHudLabel(panel, "ScoreTitle", "得分");
  this._setHudLabel(panel, "ScoreValue", String(runtimeSnapshot.score));
  // this._setHudLabel(panel, "TargetTitle", "目标:");
  this._renderHudTargets(panel, hudTargetDisplay);
  this._renderHudStarProgress(panel, runtimeSnapshot);
  var pauseButtonNode = requireChildNode(panel, "pause_btn", "HudPanel");
  this._bindBottomPanelButton(pauseButtonNode, "open_pause");
  this._setBottomPanelButtonEnabled(pauseButtonNode, true, {
    dimWhenDisabled: false
  });
  var stateValueNode = panel.getChildByName("StateValue");
  if (stateValueNode) {
    stateValueNode.active = false;
  }
  var dropValueNode = panel.getChildByName("DropValue");
  if (dropValueNode) {
    dropValueNode.active = false;
  }
};

var COMBO_BATTER_POP_DURATION = 0.15;
var COMBO_BATTER_SETTLE_DURATION = 0.1;
var COMBO_BATTER_HOLD_DURATION = 0.85;
var COMBO_BATTER_FADE_DURATION = 0.25;
var COMBO_BATTER_POP_SCALE = 1.2;
var COMBO_BATTER_OFFSET_Y = -30;

var JAR_FRACTION_MOUTH_OFFSET_RATIO = 0.24;
var JAR_FRACTION_START_Y_OFFSET = 20;
var JAR_FRACTION_RISE_DURATION = 0.55;
var JAR_FRACTION_FADE_DURATION = 0.25;
var JAR_FRACTION_RISE_DISTANCE = 72;
var JAR_FRACTION_END_SCALE = 2;
var JAR_FRACTION_START_SCALE = 0.6;

var BALL_SCORE_FADE_IN_DURATION = 0.2;
var BALL_SCORE_HOLD_DURATION = 0.5;
var BALL_SCORE_FADE_OUT_RISE_DURATION = 0.2;
var BALL_SCORE_RISE_DISTANCE = 20;
var MATCHED_TARGET_COLLECT_FLY_DURATION = 0.46;
var MATCHED_TARGET_COLLECT_BEZIER_ARC = 90;
var MATCHED_TARGET_COLLECT_PARTICLE_SIZE = 34;
var MATCHED_TARGET_COLLECT_Z_INDEX = 1250;
var MATCHED_TARGET_COLLECT_PUNCH_SCALE = 1.16;
var MATCHED_TARGET_COLLECT_PUNCH_UP_DURATION = 0.08;
var MATCHED_TARGET_COLLECT_PUNCH_DOWN_DURATION = 0.1;
  var BALL_SCORE_Z_INDEX = 1200;
  var SCHEDULE_ONCE_REPEAT = 0;
  var SNOW_REMOVAL_FX_SIZE = 96;
  var SNOW_REMOVAL_FX_Z_INDEX = 1300;
  var SNOW_REMOVAL_FX_SWEEP_DISTANCE = 96;
  var SNOW_REMOVAL_FX_SWEEP_TO_LEFT_DURATION = 0.28;
  var SNOW_REMOVAL_FX_SWEEP_TO_RIGHT_DURATION = 0.48;
  var SNOW_REMOVAL_FX_SWEEP_RETURN_DURATION = 0.28;
  var POWERUP_LOAD_FX_Z_INDEX = 1340;
  var POWERUP_LOAD_FLY_DURATION = 0.34;
  var POWERUP_LOAD_BEZIER_ARC = 110;
  var POWERUP_LOAD_START_SCALE = 0.62;
  var POWERUP_LOAD_END_SCALE = 1.05;

function requireDirectorScheduler(description) {
  if (!cc || !cc.director || typeof cc.director.getScheduler !== "function") {
    throw new Error(description + " requires cc.director.getScheduler.");
  }
  var scheduler = cc.director.getScheduler();
  if (!scheduler || typeof scheduler.schedule !== "function" || typeof scheduler.unschedule !== "function") {
    throw new Error(description + " requires director scheduler APIs.");
  }
  return scheduler;
}

LevelRenderer.prototype._initializeComboBatterHud = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for combo batter HUD.");
  }

  var batterNode = gameViewNode.getChildByName("batter");
  if (!batterNode || !batterNode.isValid) {
    throw new Error("GameView.batter node is missing.");
  }

  var batterLabel = batterNode.getComponent(cc.Label);
  if (!batterLabel) {
    throw new Error("GameView.batter label component is missing.");
  }

  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Combo batter HUD requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(batterNode);
  batterNode.active = false;
  batterNode.opacity = 255;
  batterNode.setScale(1, 1);
  batterLabel.string = "0";
  this.lastComboBatterEventId = -1;
};

LevelRenderer.prototype._resolveComboBatterPositionInGameView = function (comboEvent, runtimeSnapshot) {
  if (!comboEvent || typeof comboEvent !== "object") {
    throw new Error("Combo batter position requires combo event.");
  }
  if (!runtimeSnapshot || !runtimeSnapshot.board) {
    throw new Error("Combo batter position requires runtimeSnapshot.board.");
  }

  function offsetComboBatterPosition(position) {
    if (!position || typeof position.x !== "number" || !isFinite(position.x) || typeof position.y !== "number" || !isFinite(position.y)) {
      throw new Error("Combo batter position requires finite x and y.");
    }
    return {
      x: position.x,
      y: position.y + COMBO_BATTER_OFFSET_Y
    };
  }

  var boardSnapshot = runtimeSnapshot.board;
  if (Number.isInteger(comboEvent.attach_row) && Number.isInteger(comboEvent.attach_col)) {
    if (!Number.isInteger(boardSnapshot.maxColumns)) {
      throw new Error("Combo batter position requires boardSnapshot.maxColumns.");
    }
    if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
      throw new Error("Combo batter position requires boardSnapshot.viewportOffsetY.");
    }
    var boardPos = BoardLayout.getCellPosition(
      comboEvent.attach_row,
      comboEvent.attach_col,
      boardSnapshot.maxColumns,
      boardSnapshot.viewportOffsetY
    );
    return offsetComboBatterPosition(this._convertBoardPointToGameView(boardPos.x, boardPos.y));
  }

  if (
    typeof comboEvent.attach_x === "number" &&
    isFinite(comboEvent.attach_x) &&
    typeof comboEvent.attach_y === "number" &&
    isFinite(comboEvent.attach_y)
  ) {
    return offsetComboBatterPosition(this._convertBoardPointToGameView(comboEvent.attach_x, comboEvent.attach_y));
  }

  throw new Error("combo_bonus_awarded requires attach_row/attach_col or attach_x/attach_y.");
};

LevelRenderer.prototype._playComboBatterDisplay = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  var comboEvent = null;
  for (var index = 0; index < runtimeSnapshot.runtimeEvents.length; index += 1) {
    var event = runtimeSnapshot.runtimeEvents[index];
    if (event && event.type === "combo_bonus_awarded") {
      comboEvent = event;
    }
  }

  if (!comboEvent) {
    return;
  }
  if (typeof comboEvent.id !== "number" || !isFinite(comboEvent.id)) {
    throw new Error("combo_bonus_awarded event requires a numeric id.");
  }
  if (comboEvent.id === this.lastComboBatterEventId) {
    return;
  }

  var comboDisplay = Math.floor(Number(comboEvent.combo_display));
  if (!Number.isInteger(comboDisplay) || comboDisplay < 1) {
    throw new Error("combo_bonus_awarded requires positive integer combo_display.");
  }

  this.lastComboBatterEventId = comboEvent.id;

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for combo batter display.");
  }

  var batterNode = gameViewNode.getChildByName("batter");
  if (!batterNode || !batterNode.isValid) {
    throw new Error("GameView.batter node is missing.");
  }

  var batterLabel = batterNode.getComponent(cc.Label);
  if (!batterLabel) {
    throw new Error("GameView.batter label component is missing.");
  }

  if (typeof cc.tween !== "function") {
    throw new Error("Combo batter display requires cc.tween.");
  }

  cc.Tween.stopAllByTarget(batterNode);
  batterNode.active = true;
  batterNode.opacity = 255;
  batterNode.setScale(0.6, 0.6);
  batterLabel.string = "+" + String(comboDisplay);

  var attachPosition = this._resolveComboBatterPositionInGameView(comboEvent, runtimeSnapshot);
  batterNode.setPosition(attachPosition.x, attachPosition.y);
  batterNode.zIndex = 1200;

  cc.tween(batterNode)
    .to(COMBO_BATTER_POP_DURATION, {
      scale: COMBO_BATTER_POP_SCALE
    }, {
      easing: "backOut"
    })
    .to(COMBO_BATTER_SETTLE_DURATION, {
      scale: 1
    })
    .delay(COMBO_BATTER_HOLD_DURATION)
    .to(COMBO_BATTER_FADE_DURATION, {
      opacity: 0
    })
    .call(function () {
      batterNode.active = false;
      batterLabel.string = "0";
      batterNode.opacity = 255;
      batterNode.setScale(1, 1);
    })
    .start();
};

LevelRenderer.prototype._initializeFractionHud = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for fraction HUD.");
  }

  var fractionNode = gameViewNode.getChildByName("fraction");
  if (!fractionNode || !fractionNode.isValid) {
    throw new Error("GameView.fraction node is missing.");
  }

  var fractionLabel = fractionNode.getComponent(cc.Label);
  if (!fractionLabel) {
    throw new Error("GameView.fraction label component is missing.");
  }

  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Fraction HUD requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(fractionNode);
  fractionNode.active = false;
  fractionNode.opacity = 255;
  fractionNode.setScale(1, 1);
  fractionLabel.string = "+0";
  this.jarFractionDisplayGeneration += 1;
  this.lastJarCollectScoredEvent = null;
  this._recycleJarFractionNodesBeforeHudClear();
};

LevelRenderer.prototype._initializeBallScoreHud = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for ball score HUD.");
  }

  var templateNode = gameViewNode.getChildByName("ball_score");
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.ball_score node is missing.");
  }

  var scoreLabel = templateNode.getComponent(cc.Label);
  if (!scoreLabel) {
    throw new Error("GameView.ball_score label component is missing.");
  }

  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Ball score HUD requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(templateNode);
  templateNode.active = false;
  templateNode.opacity = 255;
  templateNode.setScale(1, 1);
  scoreLabel.string = "+0";
  this.currentBallScoreResolution = null;
  this.playedBallScoreCellIds = {};
  this.pendingBallScoreCellIds = {};
  this.pendingBallScoreCallbacks = {};
  this._pruneBallScoreNodePool();
};

LevelRenderer.prototype._pruneBallScoreNodePool = function () {
  if (!Array.isArray(this.ballScoreNodePool)) {
    throw new Error("ballScoreNodePool must be an array.");
  }
  this.ballScoreNodePool = this.ballScoreNodePool.filter(function (node) {
    return !!(node && node.isValid);
  });
};

LevelRenderer.prototype._cancelPendingBallScoreSchedules = function () {
  if (!this.pendingBallScoreCallbacks || typeof this.pendingBallScoreCallbacks !== "object") {
    throw new Error("pendingBallScoreCallbacks must be an object.");
  }

  var pendingCellIds = Object.keys(this.pendingBallScoreCallbacks);
  if (!pendingCellIds.length) {
    this.pendingBallScoreCellIds = {};
    return;
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required to cancel ball score schedules.");
  }

  var scheduler = requireDirectorScheduler("Ball score pending schedule cancel");
  for (var index = 0; index < pendingCellIds.length; index += 1) {
    var cellId = pendingCellIds[index];
    scheduler.unschedule(this.pendingBallScoreCallbacks[cellId], gameViewNode);
  }
  this.pendingBallScoreCellIds = {};
  this.pendingBallScoreCallbacks = {};
};

LevelRenderer.prototype._recycleBallScoreNode = function (scoreNode) {
  if (!scoreNode || !scoreNode.isValid) {
    throw new Error("Ball score recycle requires a valid node.");
  }
  if (scoreNode.__isBallScoreClone !== true) {
    throw new Error("Ball score recycle requires pooled clone node.");
  }
  if (!Array.isArray(this.ballScoreNodePool)) {
    throw new Error("ballScoreNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Ball score recycle requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(scoreNode);
  scoreNode.active = false;
  scoreNode.opacity = 255;
  scoreNode.setScale(1, 1);
  var scoreLabel = scoreNode.getComponent(cc.Label);
  if (!scoreLabel) {
    throw new Error("Ball score recycle requires cc.Label.");
  }
  scoreLabel.string = "+0";
  scoreNode.removeFromParent(false);
  this.ballScoreNodePool.push(scoreNode);
};

LevelRenderer.prototype._recycleBallScoreNodesBeforeHudClear = function () {
  if (!Array.isArray(this.ballScoreNodePool)) {
    throw new Error("ballScoreNodePool must be an array.");
  }

  var gameViewNode = this._getGameViewNode();
  if (gameViewNode && gameViewNode.isValid) {
    var children = gameViewNode.children.slice();
    for (var index = 0; index < children.length; index += 1) {
      var childNode = children[index];
      if (!childNode || !childNode.isValid || childNode.__isBallScoreClone !== true) {
        continue;
      }
      this._recycleBallScoreNode(childNode);
    }
  }

  this._pruneBallScoreNodePool();
};

LevelRenderer.prototype._resetBallScoreHudBeforeHudClear = function () {
  this._cancelPendingBallScoreSchedules();
  this._recycleBallScoreNodesBeforeHudClear();
  this.currentBallScoreResolution = null;
  this.playedBallScoreCellIds = {};
  this.pendingBallScoreCellIds = {};
};

LevelRenderer.prototype._acquireBallScoreNode = function (gameViewNode, templateNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required to acquire ball score node.");
  }
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.ball_score template node is required.");
  }
  if (typeof cc.instantiate !== "function") {
    throw new Error("Ball score display requires cc.instantiate.");
  }
  if (!Array.isArray(this.ballScoreNodePool)) {
    throw new Error("ballScoreNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Ball score acquire requires cc.Tween.stopAllByTarget.");
  }

  this._pruneBallScoreNodePool();
  var scoreNode = this.ballScoreNodePool.length ? this.ballScoreNodePool.pop() : null;
  if (!scoreNode) {
    scoreNode = cc.instantiate(templateNode);
    scoreNode.__isBallScoreClone = true;
  }
  if (!scoreNode.isValid) {
    throw new Error("Ball score pooled node is invalid.");
  }
  if (scoreNode.__isBallScoreClone !== true) {
    throw new Error("Ball score pooled node must be marked as clone.");
  }

  cc.Tween.stopAllByTarget(scoreNode);
  scoreNode.parent = gameViewNode;
  scoreNode.active = true;
  scoreNode.opacity = 0;
  scoreNode.setScale(1, 1);
  scoreNode.zIndex = BALL_SCORE_Z_INDEX;
  return scoreNode;
};

LevelRenderer.prototype._findBallScoreSequenceEntry = function (resolution, cellId, eventIndex) {
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    throw new Error("Ball score sequence lookup requires resolution.");
  }
  if (!Array.isArray(resolution.eliminationSequence)) {
    throw new Error("Ball score display requires eliminationSequence array.");
  }
  if (
    Number.isInteger(eventIndex) &&
    eventIndex >= 0 &&
    eventIndex < resolution.eliminationSequence.length
  ) {
    var indexedEntry = resolution.eliminationSequence[eventIndex];
    if (!indexedEntry || typeof indexedEntry !== "object" || Array.isArray(indexedEntry)) {
      throw new Error("Ball score elimination sequence entry must be an object.");
    }
    if (String(indexedEntry.cellId) === cellId) {
      return indexedEntry;
    }
  }

  for (var index = 0; index < resolution.eliminationSequence.length; index += 1) {
    var sequenceEntry = resolution.eliminationSequence[index];
    if (!sequenceEntry || typeof sequenceEntry !== "object" || Array.isArray(sequenceEntry)) {
      throw new Error("Ball score elimination sequence entry must be an object.");
    }
    if (String(sequenceEntry.cellId) === cellId) {
      return sequenceEntry;
    }
  }
  return null;
};

LevelRenderer.prototype._resolveBallScorePositionInGameView = function (scoreEvent, resolution, boardSnapshot, eventIndex) {
  if (!scoreEvent || typeof scoreEvent !== "object" || Array.isArray(scoreEvent)) {
    throw new Error("Ball score display requires score event.");
  }
  if (typeof scoreEvent.cellId !== "string" && typeof scoreEvent.cellId !== "number") {
    throw new Error("Ball score event requires cellId.");
  }

  var cellId = String(scoreEvent.cellId);
  var worldPosition = scoreEvent.worldPosition || null;
  if (!worldPosition) {
    var sequenceEntry = this._findBallScoreSequenceEntry(resolution, cellId, eventIndex);
    worldPosition = sequenceEntry ? sequenceEntry.worldPosition : null;
  }
  if (
    worldPosition &&
    typeof worldPosition === "object" &&
    !Array.isArray(worldPosition) &&
    Number.isFinite(Number(worldPosition.x)) &&
    Number.isFinite(Number(worldPosition.y))
  ) {
    return this._convertBoardPointToGameView(Number(worldPosition.x), Number(worldPosition.y));
  }

  if (
    !boardSnapshot ||
    !Number.isInteger(boardSnapshot.maxColumns) ||
    typeof boardSnapshot.viewportOffsetY !== "number" ||
    !isFinite(boardSnapshot.viewportOffsetY)
  ) {
    throw new Error("Ball score display requires board snapshot.");
  }
  if (!Number.isInteger(scoreEvent.row) || !Number.isInteger(scoreEvent.col)) {
    throw new Error("Ball score event requires row and col when worldPosition is missing.");
  }

  var boardPos = BoardLayout.getCellPosition(
    scoreEvent.row,
    scoreEvent.col,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
  return this._convertBoardPointToGameView(boardPos.x, boardPos.y);
};

LevelRenderer.prototype._spawnBallScoreDisplay = function (scoreEvent, position) {
  if (!scoreEvent || typeof scoreEvent !== "object" || Array.isArray(scoreEvent)) {
    throw new Error("Ball score display requires score event.");
  }
  var points = Number(scoreEvent.points);
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("Ball score event requires positive integer points.");
  }
  if (!position || typeof position.x !== "number" || typeof position.y !== "number" || !isFinite(position.x) || !isFinite(position.y)) {
    throw new Error("Ball score display requires finite position.");
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for ball score display.");
  }

  var templateNode = gameViewNode.getChildByName("ball_score");
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.ball_score node is missing.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Ball score display requires cc.tween.");
  }

  var renderer = this;
  var scoreNode = this._acquireBallScoreNode(gameViewNode, templateNode);
  scoreNode.name = "ball_score_" + String(scoreEvent.cellId);
  scoreNode.setPosition(position.x, position.y);

  var scoreLabel = scoreNode.getComponent(cc.Label);
  if (!scoreLabel) {
    throw new Error("Ball score clone requires cc.Label.");
  }
  scoreLabel.string = "+" + String(points);

  var startY = scoreNode.y;
  cc.tween(scoreNode)
    .to(BALL_SCORE_FADE_IN_DURATION, {
      opacity: 255
    })
    .delay(BALL_SCORE_HOLD_DURATION)
    .parallel(
      cc.tween().to(BALL_SCORE_FADE_OUT_RISE_DURATION, {
        y: startY + BALL_SCORE_RISE_DISTANCE
      }, {
        easing: "quadOut"
      }),
      cc.tween().to(BALL_SCORE_FADE_OUT_RISE_DURATION, {
        opacity: 0
      })
    )
    .call(function () {
      renderer._recycleBallScoreNode(scoreNode);
    })
    .start();
};

LevelRenderer.prototype._scheduleBallScoreEvent = function (scoreEvent, resolution, boardSnapshot, eventIndex, displayGeneration) {
  if (!scoreEvent || typeof scoreEvent !== "object" || Array.isArray(scoreEvent)) {
    throw new Error("Ball score schedule requires score event.");
  }
  if (typeof scoreEvent.cellId !== "string" && typeof scoreEvent.cellId !== "number") {
    throw new Error("Ball score schedule requires cellId.");
  }
  if (!Number.isInteger(eventIndex) || eventIndex < 0) {
    throw new Error("Ball score schedule requires non-negative event index.");
  }
  if (!Number.isInteger(displayGeneration) || displayGeneration < 0) {
    throw new Error("Ball score schedule requires non-negative display generation.");
  }
  var cellId = String(scoreEvent.cellId);
  var eventKey = String(displayGeneration) + ":" + String(eventIndex);
  if (this.playedBallScoreCellIds[eventKey] || this.pendingBallScoreCellIds[eventKey]) {
    return;
  }

  var points = Number(scoreEvent.points);
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("Ball score event requires positive integer points: " + cellId);
  }
  var delayMs = Number(scoreEvent.delayMs);
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("Ball score event delayMs must be a non-negative number: " + cellId);
  }

  var position = this._resolveBallScorePositionInGameView(scoreEvent, resolution, boardSnapshot, eventIndex);
  var self = this;
  var callback = function () {
    if (self.currentBallScoreResolution !== resolution || self.ballScoreDisplayGeneration !== displayGeneration) {
      return;
    }
    delete self.pendingBallScoreCellIds[eventKey];
    delete self.pendingBallScoreCallbacks[eventKey];
    self.playedBallScoreCellIds[eventKey] = true;
    self._spawnBallScoreDisplay(scoreEvent, position);
  };

  if (delayMs <= 0) {
    callback();
    return;
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required to schedule ball score display.");
  }

  this.pendingBallScoreCellIds[eventKey] = true;
  this.pendingBallScoreCallbacks[eventKey] = callback;
  var scheduler = requireDirectorScheduler("Ball score delayed display");
  scheduler.schedule(callback, gameViewNode, 0, SCHEDULE_ONCE_REPEAT, delayMs / 1000, false);
};

LevelRenderer.prototype._playBallScoreDisplay = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.lastResolution) {
    throw new Error("Ball score display requires runtimeSnapshot.lastResolution.");
  }
  if (!runtimeSnapshot.board) {
    throw new Error("Ball score display requires runtimeSnapshot.board.");
  }

  var resolution = runtimeSnapshot.lastResolution;
  if (!Array.isArray(resolution.scoreEvents)) {
    throw new Error("Ball score display requires scoreEvents array.");
  }
  if (resolution !== this.currentBallScoreResolution) {
    this._cancelPendingBallScoreSchedules();
    this.currentBallScoreResolution = resolution;
    this.ballScoreDisplayGeneration += 1;
    this.playedBallScoreCellIds = {};
    this.pendingBallScoreCellIds = {};
    this.pendingBallScoreCallbacks = {};
  }
  if (!resolution.scoreEvents.length) {
    return;
  }

  for (var index = 0; index < resolution.scoreEvents.length; index += 1) {
    this._scheduleBallScoreEvent(
      resolution.scoreEvents[index],
      resolution,
      runtimeSnapshot.board,
      index,
      this.ballScoreDisplayGeneration
    );
  }
};

LevelRenderer.prototype._pruneJarFractionNodePool = function () {
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }
  this.jarFractionNodePool = this.jarFractionNodePool.filter(function (node) {
    return !!(node && node.isValid);
  });
};

LevelRenderer.prototype._recycleJarFractionNode = function (fractionNode) {
  if (!fractionNode || !fractionNode.isValid) {
    throw new Error("Jar fraction recycle requires a valid node.");
  }
  if (fractionNode.__isJarFractionClone !== true) {
    throw new Error("Jar fraction recycle requires pooled clone node.");
  }
  if (fractionNode.__isJarFractionPooled === true) {
    throw new Error("Jar fraction node cannot be recycled twice.");
  }
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Jar fraction recycle requires cc.Tween.stopAllByTarget.");
  }

  cc.Tween.stopAllByTarget(fractionNode);
  fractionNode.active = false;
  fractionNode.opacity = 255;
  fractionNode.setScale(1, 1);
  var fractionLabel = fractionNode.getComponent(cc.Label);
  if (!fractionLabel) {
    throw new Error("Jar fraction recycle requires cc.Label.");
  }
  fractionLabel.string = "+0";
  fractionNode.__jarFractionDisplayToken = null;
  fractionNode.removeFromParent(false);
  fractionNode.__isJarFractionPooled = true;
  this.jarFractionNodePool.push(fractionNode);
};

LevelRenderer.prototype._recycleJarFractionNodesBeforeHudClear = function () {
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }

  var gameViewNode = this._getGameViewNode();
  if (gameViewNode && gameViewNode.isValid) {
    var children = gameViewNode.children.slice();
    for (var index = 0; index < children.length; index += 1) {
      var childNode = children[index];
      if (!childNode || !childNode.isValid || childNode.__isJarFractionClone !== true) {
        continue;
      }
      this._recycleJarFractionNode(childNode);
    }
  }

  this._pruneJarFractionNodePool();
};

LevelRenderer.prototype._releaseJarFractionNodesBeforeGameplayBundleUnload = function () {
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Jar fraction bundle release requires cc.Tween.stopAllByTarget.");
  }

  this.jarFractionDisplayGeneration += 1;
  this.lastJarCollectScoredEvent = null;
  this._pruneJarFractionNodePool();

  var fractionNodes = this.jarFractionNodePool.slice();
  var gameViewNode = this._getGameViewNode();
  if (gameViewNode && gameViewNode.isValid) {
    if (!Array.isArray(gameViewNode.children)) {
      throw new Error("GameView children must be an array during jar fraction bundle release.");
    }
    gameViewNode.children.slice().forEach(function (childNode) {
      if (childNode && childNode.isValid && childNode.__isJarFractionClone === true) {
        fractionNodes.push(childNode);
      }
    });
  }

  fractionNodes.forEach(function (fractionNode) {
    if (!fractionNode || !fractionNode.isValid || fractionNode.__isJarFractionClone !== true) {
      throw new Error("Jar fraction bundle release requires valid clone nodes.");
    }
    cc.Tween.stopAllByTarget(fractionNode);
    fractionNode.__jarFractionDisplayToken = null;
    fractionNode.destroy();
  });
  this.jarFractionNodePool = [];
};

LevelRenderer.prototype._acquireJarFractionNode = function (gameViewNode, templateNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required to acquire jar fraction node.");
  }
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.fraction template node is required.");
  }
  if (typeof cc.instantiate !== "function") {
    throw new Error("Jar fraction display requires cc.instantiate.");
  }
  if (!Array.isArray(this.jarFractionNodePool)) {
    throw new Error("jarFractionNodePool must be an array.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Jar fraction acquire requires cc.Tween.stopAllByTarget.");
  }

  this._pruneJarFractionNodePool();
  var fractionNode = this.jarFractionNodePool.length ? this.jarFractionNodePool.pop() : null;
  if (!fractionNode) {
    fractionNode = cc.instantiate(templateNode);
    fractionNode.__isJarFractionClone = true;
    fractionNode.__isJarFractionPooled = true;
  }
  if (!fractionNode.isValid) {
    throw new Error("Jar fraction pooled node is invalid.");
  }
  if (fractionNode.__isJarFractionClone !== true) {
    throw new Error("Jar fraction pooled node must be marked as clone.");
  }
  if (fractionNode.__isJarFractionPooled !== true) {
    throw new Error("Jar fraction pooled node must be marked as pooled.");
  }

  cc.Tween.stopAllByTarget(fractionNode);
  fractionNode.parent = gameViewNode;
  fractionNode.__isJarFractionPooled = false;
  fractionNode.active = true;
  fractionNode.opacity = 255;
  fractionNode.setScale(JAR_FRACTION_START_SCALE, JAR_FRACTION_START_SCALE);
  fractionNode.zIndex = 1200;
  return fractionNode;
};

LevelRenderer.prototype._resolveJarMouthPositionInGameView = function (jarIndex) {
  if (!Number.isInteger(jarIndex) || jarIndex < 0) {
    throw new Error("Jar fraction display requires non-negative integer jarIndex.");
  }
  if (!this.layers || !this.layers.jars) {
    throw new Error("Jar layer is required for fraction display.");
  }

  var jarNode = this.layers.jars.getChildByName("BottomJar_" + jarIndex);
  if (!jarNode || !jarNode.isValid) {
    throw new Error("BottomJar_" + jarIndex + " is missing for fraction display.");
  }

  var jarHeight = Number(BoardLayout.jarHeight);
  if (!Number.isFinite(jarHeight) || jarHeight <= 0) {
    throw new Error("BoardLayout.jarHeight must be a positive number.");
  }

  var mouthAnchor = jarNode.getChildByName("FractionMouthAnchor");
  if (!mouthAnchor) {
    mouthAnchor = new cc.Node("FractionMouthAnchor");
    mouthAnchor.parent = jarNode;
    mouthAnchor.setPosition(0, jarHeight * JAR_FRACTION_MOUTH_OFFSET_RATIO);
  }

  return this._convertNodePositionToGameView(mouthAnchor);
};

LevelRenderer.prototype._spawnJarFractionDisplay = function (entry) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Jar fraction display requires entry object.");
  }
  var jarIndex = entry.jar_index;
  if (!Number.isInteger(jarIndex) || jarIndex < 0) {
    throw new Error("Jar fraction entry requires non-negative integer jar_index.");
  }
  var gained = Math.floor(Number(entry.gained));
  if (!Number.isInteger(gained) || gained <= 0) {
    throw new Error("Jar fraction entry requires positive integer gained.");
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for jar fraction display.");
  }

  var templateNode = gameViewNode.getChildByName("fraction");
  if (!templateNode || !templateNode.isValid) {
    throw new Error("GameView.fraction node is missing.");
  }
  if (typeof cc.instantiate !== "function") {
    throw new Error("Jar fraction display requires cc.instantiate.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Jar fraction display requires cc.tween.");
  }

  var renderer = this;
  var displayGeneration = this.jarFractionDisplayGeneration;
  var fractionNode = this._acquireJarFractionNode(gameViewNode, templateNode);
  var displayToken = String(displayGeneration) + ":" + String(++this.jarFractionDisplaySerial);
  fractionNode.__jarFractionDisplayToken = displayToken;
  fractionNode.name = "fraction_" + String(jarIndex);

  var mouthPosition = this._resolveJarMouthPositionInGameView(jarIndex);
  fractionNode.setPosition(mouthPosition.x, mouthPosition.y + JAR_FRACTION_START_Y_OFFSET);

  var fractionLabel = fractionNode.getComponent(cc.Label);
  if (!fractionLabel) {
    throw new Error("Jar fraction clone requires cc.Label.");
  }
  fractionLabel.string = "+" + String(gained);

  var startY = fractionNode.y;
  var fadeDelay = Math.max(0, JAR_FRACTION_RISE_DURATION - JAR_FRACTION_FADE_DURATION);
  cc.tween(fractionNode)
    .parallel(
      cc.tween().to(JAR_FRACTION_RISE_DURATION, {
        scale: JAR_FRACTION_END_SCALE
      }, {
        easing: "quadOut"
      }),
      cc.tween().to(JAR_FRACTION_RISE_DURATION, {
        y: startY + JAR_FRACTION_RISE_DISTANCE
      }, {
        easing: "quadOut"
      }),
      cc.tween().delay(fadeDelay).to(JAR_FRACTION_FADE_DURATION, {
        opacity: 0
      })
    )
    .call(function () {
      if (
        renderer.jarFractionDisplayGeneration !== displayGeneration ||
        fractionNode.__jarFractionDisplayToken !== displayToken
      ) {
        return;
      }
      renderer._recycleJarFractionNode(fractionNode);
    })
    .start();
};

LevelRenderer.prototype._playJarFractionDisplay = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }

  var scoreEvent = null;
  for (var index = 0; index < runtimeSnapshot.runtimeEvents.length; index += 1) {
    var event = runtimeSnapshot.runtimeEvents[index];
    if (event && event.type === "jar_collect_scored") {
      scoreEvent = event;
    }
  }

  if (!scoreEvent) {
    return;
  }
  if (typeof scoreEvent.id !== "number" || !isFinite(scoreEvent.id)) {
    throw new Error("jar_collect_scored event requires a numeric id.");
  }
  if (scoreEvent === this.lastJarCollectScoredEvent) {
    return;
  }
  if (!Array.isArray(scoreEvent.entries)) {
    throw new Error("jar_collect_scored event requires entries array.");
  }
  if (!scoreEvent.entries.length) {
    return;
  }

  for (var entryIndex = 0; entryIndex < scoreEvent.entries.length; entryIndex += 1) {
    this._spawnJarFractionDisplay(scoreEvent.entries[entryIndex]);
  }
  this.lastJarCollectScoredEvent = scoreEvent;
};

LevelRenderer.prototype._renderJarScoreBoostTimer = function (runtimeSnapshot) {
  if (!this.layers || !this.layers.hud) {
    throw new Error("HUD layer is missing when rendering jar score boost timer.");
  }

  var gameViewNode = this.layers.hud.getChildByName("GameView");
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is missing when rendering jar score boost timer.");
  }

  var timerNode = gameViewNode.getChildByName("timer");
  if (!timerNode || !timerNode.isValid) {
    throw new Error("GameView.timer node is missing.");
  }

  var timerLabel = timerNode.getComponent(cc.Label);
  if (!timerLabel) {
    throw new Error("GameView.timer label component is missing.");
  }

  var boostActive = !!(runtimeSnapshot && runtimeSnapshot.jarScoreBoostActive);
  var remainingMs = Math.max(0, Math.floor(Number(runtimeSnapshot && runtimeSnapshot.jarScoreBoostRemainingMs) || 0));
  if (!boostActive) {
    timerNode.active = false;
    timerLabel.string = "0";
    return;
  }

  var remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  timerNode.active = true;
  timerLabel.string = String(remainingSeconds);
};

LevelRenderer.prototype._renderTimedLevelTimer = function (runtimeSnapshot) {
  var timedLevel = !!(runtimeSnapshot && runtimeSnapshot.timedLevel);
  var panel = this._getMountedHudPanel();
  if (!panel) {
    if (timedLevel) {
      throw new Error("Timed level requires HudPanel.");
    }
    return;
  }

  var timerNode = panel.getChildByName("timer");
  if (!timerNode || !timerNode.isValid) {
    if (timedLevel) {
      throw new Error("Timed level requires HudPanel.timer node.");
    }
    return;
  }

  var timerLabel = timerNode.getComponent(cc.Label);
  if (!timerLabel) {
    if (timedLevel) {
      throw new Error("HudPanel.timer requires Label component.");
    }
    timerNode.active = false;
    return;
  }

  if (!timedLevel) {
    timerNode.active = false;
    timerLabel.string = "0";
    return;
  }

  var remainingMsValue = Number(runtimeSnapshot.remainingTimeMs);
  if (!Number.isFinite(remainingMsValue)) {
    throw new Error("Timed level runtime snapshot requires finite remainingTimeMs.");
  }
  var remainingMs = Math.max(0, Math.ceil(remainingMsValue));
  var remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  var minutes = Math.floor(remainingSeconds / 60);
  var seconds = remainingSeconds % 60;
  timerNode.active = true;
  timerLabel.string = minutes + ":" + (seconds < 10 ? "0" + seconds : String(seconds));
};

LevelRenderer.prototype.playThreeLineEliminationAnimation = function (rows) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Three-line elimination animation requires rows.");
  }
  if (!this.layers || !this.layers.board) {
    throw new Error("Three-line elimination animation requires board layer.");
  }

  var spritePath = BALL_RESOURCES.BLOCKADE_LINE;
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Three-line elimination animation requires preloaded blockade line sprite.");
  }

  var boardLeft = Number(BoardLayout.boardLeft);
  var boardRight = Number(BoardLayout.boardRight);
  if (!Number.isFinite(boardLeft) || !Number.isFinite(boardRight) || boardRight <= boardLeft) {
    throw new Error("Three-line elimination animation requires valid board bounds.");
  }

  var duration = 0.18;
  var lightNodes = rows.map(function (entry, index) {
    if (!entry || !Number.isFinite(Number(entry.y))) {
      throw new Error("Three-line elimination row requires finite y.");
    }
    var node = new cc.Node("ThreeLineLight_" + index);
    node.parent = this.layers.board;
    node.zIndex = 200 + index;
    ensureSprite(node, spriteFrame);
    node.setContentSize(Math.max(1, boardRight - boardLeft), Math.max(1, BoardLayout.rowHeight));
    node.setPosition(boardLeft - node.width * 0.5, Number(entry.y));
    node.opacity = 255;
    return node;
  }, this);

  return new Promise(function (resolve) {
    var remaining = lightNodes.length;
    lightNodes.forEach(function (node) {
      var finish = function () {
        if (node && cc.isValid(node)) {
          node.removeFromParent();
        }
        remaining -= 1;
        if (remaining === 0) {
          resolve();
        }
      };

      if (typeof cc.tween === "function") {
        cc.tween(node)
          .to(duration, { x: boardRight + node.width * 0.5 })
          .call(finish)
          .start();
      } else {
        node.runAction(cc.sequence(
          cc.moveTo(duration, boardRight + node.width * 0.5, node.y),
          cc.callFunc(finish)
        ));
      }
    });
  });
};

LevelRenderer.prototype._getMountedHudPanel = function () {
  if (!this.layers || !this.layers.hud) {
    return null;
  }

  var directPanel = this.layers.hud.getChildByName("HudPanel");
  if (directPanel) {
    return directPanel;
  }

  var gameViewNode = this.layers.hud.getChildByName("GameView");
  if (!gameViewNode) {
    return null;
  }

  return gameViewNode.getChildByName("HudPanel");
};

LevelRenderer.prototype._bindBottomPanelButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__bottomPanelBoundAction === action) {
    return;
  }

  if (buttonNode.__bottomPanelHandlers) {
    if (typeof buttonNode.off !== "function") {
      throw new Error("Bottom panel button requires off support: " + buttonNode.name);
    }
    buttonNode.off(cc.Node.EventType.TOUCH_START, buttonNode.__bottomPanelHandlers.touchStart, this);
    buttonNode.off(cc.Node.EventType.TOUCH_END, buttonNode.__bottomPanelHandlers.touchEnd, this);
    buttonNode.off(cc.Node.EventType.TOUCH_CANCEL, buttonNode.__bottomPanelHandlers.touchCancel, this);
  }

  buttonNode.__bottomPanelBoundAction = action;
  var touchStartHandler = function (event) {
    if (event) {
      event.stopPropagation();
    }
  };
  var touchEndHandler = function (event) {
    if (event) {
      event.stopPropagation();
    }
    var button = buttonNode.getComponent(cc.Button);
    if (button && !button.interactable) {
      return;
    }
    this._invokeGameplayAction(action);
  };
  var touchCancelHandler = function (event) {
    if (event) {
      event.stopPropagation();
    }
  };

  buttonNode.__bottomPanelHandlers = {
    touchStart: touchStartHandler,
    touchEnd: touchEndHandler,
    touchCancel: touchCancelHandler
  };
  buttonNode.on(cc.Node.EventType.TOUCH_START, touchStartHandler, this);
  buttonNode.on(cc.Node.EventType.TOUCH_END, touchEndHandler, this);
  buttonNode.on(cc.Node.EventType.TOUCH_CANCEL, touchCancelHandler, this);
};

LevelRenderer.prototype._setBottomPanelButtonEnabled = function (buttonNode, enabled, options) {
  if (!buttonNode) {
    return;
  }

  var safeOptions = options && typeof options === "object" ? options : {};
  var dimWhenDisabled = safeOptions.dimWhenDisabled !== false;
  var button = buttonNode.getComponent(cc.Button);
  if (button) {
    button.interactable = !!enabled;
  }
  buttonNode.opacity = (!enabled && dimWhenDisabled) ? 150 : 255;
};

LevelRenderer.prototype._setShooterChangeButtonSpin = function (buttonNode, enabled) {
  if (!buttonNode) {
    return;
  }

  if (!enabled) {
    if (buttonNode.__changeButtonSpinEnabled) {
      buttonNode.stopAllActions();
      buttonNode.__changeButtonSpinEnabled = false;
      buttonNode.angle = 0;
    }
    return;
  }

  if (buttonNode.__changeButtonSpinEnabled) {
    return;
  }

  buttonNode.stopAllActions();
  buttonNode.angle = 0;
  buttonNode.__changeButtonSpinEnabled = true;
  buttonNode.runAction(
    cc.repeatForever(
      cc.rotateBy(1.6, -360)
    )
  );
};

LevelRenderer.prototype._setBottomPanelCount = function (buttonNode, count) {
  if (!buttonNode) {
    return;
  }

  var numBgNode = buttonNode.getChildByName("num_bg");
  var numNode = numBgNode ? numBgNode.getChildByName("num") : null;
  if (!numNode) {
    return;
  }

  var label = numNode.getComponent(cc.Label);
  if (!label) {
    label = numNode.addComponent(cc.Label);
  }
  label.string = String(Math.max(0, Math.floor(Number(count) || 0)));
};

LevelRenderer.prototype._setBottomPanelInventoryPresentation = function (buttonNode, count, adAction) {
  if (!buttonNode) {
    throw new Error("Bottom panel powerup button is required.");
  }
  if (typeof adAction !== "string" || !adAction) {
    throw new Error("Bottom panel ad action is required.");
  }

  var numBgNode = buttonNode.getChildByName("num_bg");
  var videoButtonNode = buttonNode.getChildByName("vido_btn");
  if (!numBgNode) {
    throw new Error("Bottom panel powerup button requires num_bg: " + buttonNode.name);
  }
  if (!videoButtonNode) {
    throw new Error("Bottom panel powerup button requires vido_btn: " + buttonNode.name);
  }

  var numericCount = Number(count);
  if (!Number.isFinite(numericCount)) {
    throw new Error("Bottom panel inventory count must be finite: " + buttonNode.name);
  }
  var inventoryCount = Math.max(0, Math.floor(numericCount));
  var hasInventory = inventoryCount > 0;
  buttonNode.active = true;
  numBgNode.active = hasInventory;
  videoButtonNode.active = !hasInventory;
  if (hasInventory) {
    this._setBottomPanelCount(buttonNode, inventoryCount);
  } else {
    this._bindBottomPanelButton(buttonNode, adAction);
    this._bindBottomPanelButton(videoButtonNode, adAction);
  }
};

LevelRenderer.prototype._ensureBottomPanelPowerupButtons = function (propsContentNode) {
  if (!propsContentNode || !propsContentNode.isValid) {
    throw new Error("Bottom panel powerup buttons require valid content node.");
  }

  var resolveButtonNode = function (nodeName) {
    return requireChildNode(propsContentNode, nodeName, "BttomPanel/props_scroll/view/content");
  };

  if (!propsContentNode.__bottomPanelPowerupButtonsReady) {
    BOTTOM_PANEL_POWERUP_SLOTS.forEach(function (slot, index) {
      var buttonNode = this._instantiateOrCreate(PREFAB_PATHS.propsBtn, propsContentNode, slot.nodeName);
      if (!buttonNode) {
        throw new Error("Bottom panel powerup button prefab must be preloaded: " + PREFAB_PATHS.propsBtn);
      }
      buttonNode.setSiblingIndex(index);
      this._rebindBottomPanelPowerupIcon(buttonNode, slot.iconKey);
    }, this);

    var layout = propsContentNode.getComponent(cc.Layout);
    if (layout && typeof layout.updateLayout === "function") {
      layout.updateLayout();
    }

    propsContentNode.__bottomPanelPowerupButtonsReady = true;
  }

  return {
    rainbowButtonNode: resolveButtonNode("rainbow_btn"),
    preciseAimButtonNode: resolveButtonNode("precise_aim_btn"),
    changeButtonNode: resolveButtonNode("change_btn"),
    destroyButtonNode: resolveButtonNode("destroy_btn"),
    snowRemovalButtonNode: resolveButtonNode("snow_removal_btn"),
    bombButtonNode: resolveButtonNode("bomb_btn"),
    threeLineButtonNode: resolveButtonNode("eliminate_three_line_btn"),
    plusBallButtonNode: resolveButtonNode("plus_ball_btn")
  };
};

LevelRenderer.prototype._rebindBottomPanelPowerupIcon = function (buttonNode, powerupType) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("Bottom panel powerup icon requires valid button node.");
  }
  if (!POWERUP_ICON_RESOURCES || !POWERUP_ICON_RESOURCES[powerupType]) {
    throw new Error("Bottom panel powerup icon path missing: " + powerupType);
  }

  var iconNode = requireChildNode(buttonNode, "icon", "Bottom panel " + buttonNode.name);
  var sprite = iconNode.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("Bottom panel powerup icon requires cc.Sprite: " + buttonNode.name);
  }

  var spritePath = POWERUP_ICON_RESOURCES[powerupType];
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Missing preloaded bottom panel powerup icon: " + spritePath);
  }
  if (typeof spriteFrame.getRect !== "function") {
    throw new Error("Bottom panel powerup icon spriteFrame requires getRect: " + spritePath);
  }
  if (!cc.Sprite.SizeMode || cc.Sprite.SizeMode.CUSTOM === undefined) {
    throw new Error("Bottom panel powerup icon requires cc.Sprite.SizeMode.CUSTOM.");
  }

  var bounds = iconNode.getContentSize();
  if (!bounds || !Number.isFinite(bounds.width) || bounds.width <= 0 ||
      !Number.isFinite(bounds.height) || bounds.height <= 0) {
    throw new Error("Bottom panel powerup icon bounds must be positive: " + buttonNode.name);
  }
  var rect = spriteFrame.getRect();
  if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
      rect.width <= 0 || rect.height <= 0) {
    throw new Error("Bottom panel powerup icon rect size is invalid: " + spritePath);
  }

  sprite.trim = true;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  sprite.spriteFrame = spriteFrame;

  var scale = Math.min(bounds.width / rect.width, bounds.height / rect.height);
  iconNode.setContentSize(rect.width * scale, rect.height * scale);
};

LevelRenderer.prototype._renderBottomPanel = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    throw new Error("Bottom panel requires runtime snapshot.");
  }
  if (!this.layers || !this.layers.hud) {
    return;
  }

  var panel = this.layers.hud.getChildByName("BttomPanel");
  if (!panel) {
    return;
  }

  panel.active = true;
  if (!panel.__bottomPanelLayoutInitialized) {
    var panelWidget = panel.getComponent(cc.Widget);
    if (panelWidget && panelWidget.updateAlignment) {
      panelWidget.updateAlignment();
    }
    panel.__bottomPanelLayoutInitialized = true;
  }

  var propsScrollNode = requireChildNode(panel, "props_scroll", "BttomPanel");
  var propsViewNode = requireChildNode(propsScrollNode, "view", "BttomPanel/props_scroll");
  var propsContentNode = requireChildNode(propsViewNode, "content", "BttomPanel/props_scroll/view");
  var powerupButtonNodes = this._ensureBottomPanelPowerupButtons(propsContentNode);
  var rainbowButtonNode = powerupButtonNodes.rainbowButtonNode;
  var preciseAimButtonNode = powerupButtonNodes.preciseAimButtonNode;
  var changeButtonNode = powerupButtonNodes.changeButtonNode;
  var destroyButtonNode = powerupButtonNodes.destroyButtonNode;
  var snowRemovalButtonNode = powerupButtonNodes.snowRemovalButtonNode;
  var bombButtonNode = powerupButtonNodes.bombButtonNode;
  var threeLineButtonNode = powerupButtonNodes.threeLineButtonNode;
  var plusBallButtonNode = powerupButtonNodes.plusBallButtonNode;
  var directionsButtonNode = requireChildNode(panel, "directions_btn", "BttomPanel");

  this._bindBottomPanelButton(rainbowButtonNode, "use_rainbow");
  this._bindBottomPanelButton(preciseAimButtonNode, "use_precise_aim");
  this._bindBottomPanelButton(changeButtonNode, "use_swap");
  this._bindBottomPanelButton(destroyButtonNode, "use_barrier_hammer");
  this._bindBottomPanelButton(snowRemovalButtonNode, "use_snow_removal");
  this._bindBottomPanelButton(bombButtonNode, "use_blast");
  this._bindBottomPanelButton(threeLineButtonNode, "use_three_line_elimination");
  this._bindBottomPanelButton(plusBallButtonNode, "use_plus_three_balls");
  this._bindBottomPanelButton(directionsButtonNode, "open_prop_description");
  this._setBottomPanelButtonEnabled(directionsButtonNode, true, {
    dimWhenDisabled: false
  });

  var skillInventory = runtimeSnapshot && runtimeSnapshot.shooter && runtimeSnapshot.shooter.skillInventory
    ? runtimeSnapshot.shooter.skillInventory
    : {};
  if (!Object.prototype.hasOwnProperty.call(skillInventory, "precise_aim")) {
    throw new Error("Bottom panel requires precise_aim inventory count.");
  }
  var preciseAimCount = Number(skillInventory.precise_aim);
  if (!Number.isInteger(preciseAimCount) || preciseAimCount < 0) {
    throw new Error("Bottom panel precise_aim count must be a non-negative integer.");
  }
  var rainbowCount = Math.max(0, Math.floor(Number(skillInventory.rainbow) || 0));
  var blastCount = Math.max(0, Math.floor(Number(skillInventory.blast) || 0));
  var swapCount = Math.max(0, Math.floor(Number(skillInventory.swap) || 0));
  var destroyCount = Math.max(0, Math.floor(Number(skillInventory.barrier_hammer) || 0));
  if (!Object.prototype.hasOwnProperty.call(skillInventory, "snow_removal")) {
    throw new Error("Bottom panel requires snow_removal inventory count.");
  }
  var snowRemovalCount = Number(skillInventory.snow_removal);
  if (!Number.isInteger(snowRemovalCount) || snowRemovalCount < 0) {
    throw new Error("Bottom panel snow_removal count must be a non-negative integer.");
  }
  if (!runtimeSnapshot.adRunPowerups || typeof runtimeSnapshot.adRunPowerups !== "object" || Array.isArray(runtimeSnapshot.adRunPowerups)) {
    throw new Error("Bottom panel requires adRunPowerups snapshot.");
  }
  if (!runtimeSnapshot.adRunPowerupAllowed || typeof runtimeSnapshot.adRunPowerupAllowed !== "object" || Array.isArray(runtimeSnapshot.adRunPowerupAllowed)) {
    throw new Error("Bottom panel requires adRunPowerupAllowed snapshot.");
  }
  var adRunPowerups = runtimeSnapshot.adRunPowerups;
  var adRunPowerupAllowed = runtimeSnapshot.adRunPowerupAllowed;
  var readAdRunPowerupCount = function (powerupType) {
    if (!Object.prototype.hasOwnProperty.call(adRunPowerups, powerupType)) {
      return 0;
    }
    var count = Number(adRunPowerups[powerupType]);
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Bottom panel ad run powerup count must be a non-negative integer: " + powerupType);
    }
    return count;
  };
  var threeLineCount = readAdRunPowerupCount("three_line_elimination");
  var plusBallCount = readAdRunPowerupCount("plus_three_balls");
  var shooterSnapshot = runtimeSnapshot && runtimeSnapshot.shooter ? runtimeSnapshot.shooter : {};
  var pendingBarrierHammer = !!shooterSnapshot.pendingBarrierHammer;
  var pendingRainbowColorSelection = !!shooterSnapshot.pendingRainbowColorSelection;
  var preciseAimActive = shooterSnapshot.ricochetGuideActive === true;
  var boardTargets = resolveBottomPanelBoardTargets(runtimeSnapshot);
  var showBarrierHammer = boardTargets.hasStone || pendingBarrierHammer;
  var showSnowRemoval = boardTargets.hasIce || boardTargets.hasBoardOcclusion;
  var canUsePowerup = !!shooterSnapshot.canUsePowerups;
  var canUseRainbow = canUsePowerup && !pendingBarrierHammer && rainbowCount > 0;
  var canUsePreciseAim = canUsePowerup && !pendingBarrierHammer && !preciseAimActive && preciseAimCount > 0;
  var canUseSwap = canUsePowerup && !pendingBarrierHammer && swapCount > 0;
  var canUseBarrierHammer = showBarrierHammer && (pendingBarrierHammer || (canUsePowerup && destroyCount > 0));
  var canUseSnowRemoval = showSnowRemoval && canUsePowerup && !pendingBarrierHammer && snowRemovalCount > 0;
  var canUseBlast = canUsePowerup && !pendingBarrierHammer && blastCount > 0;
  var canUseThreeLine = canUsePowerup && !pendingBarrierHammer && threeLineCount > 0;
  var canUsePlusBall = canUsePowerup && !pendingBarrierHammer && !runtimeSnapshot.infiniteShots && plusBallCount > 0;

  this._setBottomPanelInventoryPresentation(rainbowButtonNode, rainbowCount, "recover_inventory:rainbow");
  this._setBottomPanelInventoryPresentation(preciseAimButtonNode, preciseAimCount, "recover_inventory:precise_aim");
  this._setBottomPanelInventoryPresentation(changeButtonNode, swapCount, "recover_inventory:swap");
  if (showBarrierHammer) {
    this._setBottomPanelInventoryPresentation(destroyButtonNode, destroyCount, "recover_inventory:barrier_hammer");
  } else {
    destroyButtonNode.active = false;
  }
  if (showSnowRemoval) {
    this._setBottomPanelInventoryPresentation(snowRemovalButtonNode, snowRemovalCount, "recover_inventory:snow_removal");
  } else {
    snowRemovalButtonNode.active = false;
  }
  this._setBottomPanelInventoryPresentation(bombButtonNode, blastCount, "recover_inventory:blast");
  if (adRunPowerupAllowed.three_line_elimination === true) {
    this._setBottomPanelInventoryPresentation(threeLineButtonNode, threeLineCount, "recover_ad_powerup:three_line_elimination");
  } else if (threeLineButtonNode) {
    threeLineButtonNode.active = false;
  }
  if (adRunPowerupAllowed.plus_three_balls === true && !runtimeSnapshot.infiniteShots) {
    this._setBottomPanelInventoryPresentation(plusBallButtonNode, plusBallCount, "recover_ad_powerup:plus_three_balls");
  } else if (plusBallButtonNode) {
    plusBallButtonNode.active = false;
  }
  this._setBottomPanelButtonEnabled(rainbowButtonNode, rainbowCount > 0 ? canUseRainbow : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(preciseAimButtonNode, preciseAimCount > 0 ? canUsePreciseAim : (!pendingRainbowColorSelection && !preciseAimActive), {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(changeButtonNode, swapCount > 0 ? canUseSwap : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
  if (showBarrierHammer) {
    this._setBottomPanelButtonEnabled(destroyButtonNode, destroyCount > 0 ? canUseBarrierHammer : !pendingRainbowColorSelection, {
      dimWhenDisabled: false
    });
  }
  if (showSnowRemoval) {
    this._setBottomPanelButtonEnabled(snowRemovalButtonNode, snowRemovalCount > 0 ? canUseSnowRemoval : !pendingRainbowColorSelection, {
      dimWhenDisabled: false
    });
  }
  this._setBottomPanelButtonEnabled(bombButtonNode, blastCount > 0 ? canUseBlast : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(threeLineButtonNode, threeLineCount > 0 ? canUseThreeLine : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(plusBallButtonNode, plusBallCount > 0 ? canUsePlusBall : !pendingRainbowColorSelection, {
    dimWhenDisabled: false
  });

  var layout = propsContentNode.getComponent(cc.Layout);
  if (layout && typeof layout.updateLayout === "function") {
    layout.updateLayout();
  }
};

LevelRenderer.prototype._requireSkillPowerupCollectedFeedbackNodes = function (entityType) {
  var config = POWERUP_LOAD_ANIMATION_CONFIG[entityType];
  if (!config) {
    throw new Error("Unsupported collected skill powerup feedback type: " + entityType);
  }
  if (!this.layers || !this.layers.hud) {
    throw new Error("Collected skill powerup feedback requires HUD layer.");
  }

  var panelNode = requireChildNode(this.layers.hud, "BttomPanel", "HUD layer");
  var scrollNode = requireChildNode(panelNode, "props_scroll", "BttomPanel");
  var viewNode = requireChildNode(scrollNode, "view", "BttomPanel/props_scroll");
  var contentNode = requireChildNode(viewNode, "content", "BttomPanel/props_scroll/view");
  var buttonNode = requireChildNode(
    contentNode,
    config.buttonNodeName,
    "BttomPanel/props_scroll/view/content"
  );
  var badgeNode = requireChildNode(
    buttonNode,
    "num_bg",
    "BttomPanel/props_scroll/view/content/" + config.buttonNodeName
  );
  if (!buttonNode.active || !badgeNode.active) {
    throw new Error("Collected skill powerup feedback requires visible inventory nodes: " + entityType);
  }

  return {
    scrollNode: scrollNode,
    viewNode: viewNode,
    contentNode: contentNode,
    buttonNode: buttonNode,
    badgeNode: badgeNode
  };
};

LevelRenderer.prototype._revealSkillPowerupCollectedFeedbackButton = function (nodes) {
  var scrollView = nodes.scrollNode.getComponent(cc.ScrollView);
  if (!scrollView) {
    throw new Error("Collected skill powerup feedback requires cc.ScrollView.");
  }
  if (typeof scrollView.stopAutoScroll !== "function") {
    throw new Error("Collected skill powerup feedback requires ScrollView.stopAutoScroll.");
  }
  if (typeof nodes.buttonNode.getBoundingBoxToWorld !== "function" ||
      typeof nodes.viewNode.getBoundingBoxToWorld !== "function") {
    throw new Error("Collected skill powerup feedback requires world bounding boxes.");
  }

  scrollView.stopAutoScroll();
  var buttonRect = nodes.buttonNode.getBoundingBoxToWorld();
  var viewRect = nodes.viewNode.getBoundingBoxToWorld();
  var rectValues = [buttonRect.xMin, buttonRect.xMax, viewRect.xMin, viewRect.xMax];
  rectValues.forEach(function (value) {
    if (!Number.isFinite(value)) {
      throw new Error("Collected skill powerup feedback requires finite world bounds.");
    }
  });

  var leftLimit = viewRect.xMin + SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING;
  var rightLimit = viewRect.xMax - SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING;
  var deltaWorldX = 0;
  if (buttonRect.xMin < leftLimit) {
    deltaWorldX = leftLimit - buttonRect.xMin;
  } else if (buttonRect.xMax > rightLimit) {
    deltaWorldX = rightLimit - buttonRect.xMax;
  } else {
    return;
  }

  var contentParent = nodes.contentNode.parent;
  if (!contentParent || !contentParent.isValid || typeof contentParent.convertToNodeSpaceAR !== "function") {
    throw new Error("Collected skill powerup feedback requires valid content parent transform.");
  }
  var localOrigin = contentParent.convertToNodeSpaceAR(cc.v2(0, 0));
  var localShift = contentParent.convertToNodeSpaceAR(cc.v2(deltaWorldX, 0));
  var deltaLocalX = localShift.x - localOrigin.x;
  if (!Number.isFinite(deltaLocalX)) {
    throw new Error("Collected skill powerup feedback scroll delta must be finite.");
  }
  nodes.contentNode.setPosition(nodes.contentNode.x + deltaLocalX, nodes.contentNode.y);

  buttonRect = nodes.buttonNode.getBoundingBoxToWorld();
  viewRect = nodes.viewNode.getBoundingBoxToWorld();
  if (
    buttonRect.xMin < viewRect.xMin + SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING ||
    buttonRect.xMax > viewRect.xMax - SKILL_POWERUP_COLLECT_FEEDBACK_VIEW_PADDING
  ) {
    throw new Error("Collected skill powerup feedback button failed to enter the visible scroll area.");
  }
};

LevelRenderer.prototype._playNextSkillPowerupCollectedFeedback = function () {
  if (this.skillPowerupCollectedFeedbackActive === true) {
    return;
  }
  if (!Array.isArray(this.skillPowerupCollectedFeedbackQueue)) {
    throw new Error("Collected skill powerup feedback queue must be an array.");
  }
  if (!this.skillPowerupCollectedFeedbackQueue.length) {
    return;
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Collected skill powerup feedback requires cc.tween.");
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Collected skill powerup feedback requires cc.Tween.stopAllByTarget.");
  }

  var entityType = this.skillPowerupCollectedFeedbackQueue.shift();
  var nodes = this._requireSkillPowerupCollectedFeedbackNodes(entityType);
  this._revealSkillPowerupCollectedFeedbackButton(nodes);

  var buttonBaseScaleX = nodes.buttonNode.scaleX;
  var buttonBaseScaleY = nodes.buttonNode.scaleY;
  var buttonBaseAngle = nodes.buttonNode.angle;
  var badgeBaseScaleX = nodes.badgeNode.scaleX;
  var badgeBaseScaleY = nodes.badgeNode.scaleY;
  var transformValues = [
    buttonBaseScaleX,
    buttonBaseScaleY,
    buttonBaseAngle,
    badgeBaseScaleX,
    badgeBaseScaleY
  ];
  transformValues.forEach(function (value) {
    if (!Number.isFinite(value)) {
      throw new Error("Collected skill powerup feedback requires finite node transforms.");
    }
  });

  cc.Tween.stopAllByTarget(nodes.buttonNode);
  cc.Tween.stopAllByTarget(nodes.badgeNode);
  this.skillPowerupCollectedFeedbackActive = true;
  var activeState = {
    buttonNode: nodes.buttonNode,
    badgeNode: nodes.badgeNode,
    buttonBaseScaleX: buttonBaseScaleX,
    buttonBaseScaleY: buttonBaseScaleY,
    buttonBaseAngle: buttonBaseAngle,
    badgeBaseScaleX: badgeBaseScaleX,
    badgeBaseScaleY: badgeBaseScaleY
  };
  this.skillPowerupCollectedFeedbackActiveState = activeState;
  var renderer = this;

  cc.tween(nodes.badgeNode)
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION, {
      scaleX: badgeBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE,
      scaleY: badgeBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SCALE
    }, {
      easing: "backOut"
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION, {
      scaleX: badgeBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE,
      scaleY: badgeBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_SQUASH_SCALE
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION, {
      scaleX: badgeBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE,
      scaleY: badgeBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BADGE_REBOUND_SCALE
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION, {
      scaleX: badgeBaseScaleX,
      scaleY: badgeBaseScaleY
    })
    .start();

  cc.tween(nodes.buttonNode)
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_PUNCH_DURATION, {
      scaleX: buttonBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE,
      scaleY: buttonBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SCALE,
      angle: buttonBaseAngle - 7
    }, {
      easing: "backOut"
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_SQUASH_DURATION, {
      scaleX: buttonBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE,
      scaleY: buttonBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_SQUASH_SCALE,
      angle: buttonBaseAngle + 5
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_REBOUND_DURATION, {
      scaleX: buttonBaseScaleX * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE,
      scaleY: buttonBaseScaleY * SKILL_POWERUP_COLLECT_FEEDBACK_BUTTON_REBOUND_SCALE,
      angle: buttonBaseAngle - 3
    })
    .to(SKILL_POWERUP_COLLECT_FEEDBACK_RECOVER_DURATION, {
      scaleX: buttonBaseScaleX,
      scaleY: buttonBaseScaleY,
      angle: buttonBaseAngle
    })
    .delay(SKILL_POWERUP_COLLECT_FEEDBACK_GAP_DURATION)
    .call(function () {
      if (renderer.skillPowerupCollectedFeedbackActiveState !== activeState) {
        throw new Error("Collected skill powerup feedback active state changed during playback.");
      }
      nodes.buttonNode.setScale(buttonBaseScaleX, buttonBaseScaleY);
      nodes.buttonNode.angle = buttonBaseAngle;
      nodes.badgeNode.setScale(badgeBaseScaleX, badgeBaseScaleY);
      renderer.skillPowerupCollectedFeedbackActive = false;
      renderer.skillPowerupCollectedFeedbackActiveState = null;
      renderer._playNextSkillPowerupCollectedFeedback();
    })
    .start();
};

LevelRenderer.prototype._cancelSkillPowerupCollectedFeedback = function () {
  if (!Array.isArray(this.skillPowerupCollectedFeedbackQueue)) {
    throw new Error("Collected skill powerup feedback queue must be initialized before cleanup.");
  }
  this.skillPowerupCollectedFeedbackQueue.length = 0;

  if (this.skillPowerupCollectedFeedbackActive !== true) {
    if (this.skillPowerupCollectedFeedbackActiveState !== null) {
      throw new Error("Inactive collected skill powerup feedback cannot keep active state.");
    }
    return;
  }
  if (typeof cc.Tween === "undefined" || typeof cc.Tween.stopAllByTarget !== "function") {
    throw new Error("Collected skill powerup feedback cleanup requires cc.Tween.stopAllByTarget.");
  }

  var activeState = this.skillPowerupCollectedFeedbackActiveState;
  if (!activeState || typeof activeState !== "object" || Array.isArray(activeState)) {
    throw new Error("Active collected skill powerup feedback requires active state.");
  }
  if (!activeState.buttonNode || !activeState.buttonNode.isValid ||
      !activeState.badgeNode || !activeState.badgeNode.isValid) {
    throw new Error("Collected skill powerup feedback cleanup requires valid animated nodes.");
  }

  cc.Tween.stopAllByTarget(activeState.buttonNode);
  cc.Tween.stopAllByTarget(activeState.badgeNode);
  activeState.buttonNode.setScale(activeState.buttonBaseScaleX, activeState.buttonBaseScaleY);
  activeState.buttonNode.angle = activeState.buttonBaseAngle;
  activeState.badgeNode.setScale(activeState.badgeBaseScaleX, activeState.badgeBaseScaleY);
  this.skillPowerupCollectedFeedbackActive = false;
  this.skillPowerupCollectedFeedbackActiveState = null;
};

LevelRenderer.prototype._queueSkillPowerupCollectedFeedback = function (runtimeSnapshot) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object" || Array.isArray(runtimeSnapshot)) {
    throw new Error("Collected skill powerup feedback requires runtime snapshot.");
  }
  if (!Array.isArray(runtimeSnapshot.runtimeEvents)) {
    throw new Error("Collected skill powerup feedback requires runtimeEvents array.");
  }
  if (!Array.isArray(this.skillPowerupCollectedFeedbackQueue)) {
    throw new Error("Collected skill powerup feedback queue must be initialized.");
  }
  if (!Number.isInteger(this.lastSkillPowerupCollectedEventId) || this.lastSkillPowerupCollectedEventId < -1) {
    throw new Error("Collected skill powerup feedback event id state is invalid.");
  }

  runtimeSnapshot.runtimeEvents.forEach(function (event) {
    if (!event || event.type !== "skill_powerup_collected") {
      return;
    }
    if (!Number.isInteger(event.id) || event.id <= 0) {
      throw new Error("skill_powerup_collected event requires a positive integer id.");
    }
    if (event.id <= this.lastSkillPowerupCollectedEventId) {
      return;
    }
    if (!POWERUP_LOAD_ANIMATION_CONFIG[event.entityType]) {
      throw new Error("skill_powerup_collected event has unsupported entityType: " + event.entityType);
    }
    if (!Number.isInteger(event.total) || event.total <= 0) {
      throw new Error("skill_powerup_collected event requires a positive integer total.");
    }

    this.lastSkillPowerupCollectedEventId = event.id;
    this.skillPowerupCollectedFeedbackQueue.push(event.entityType);
  }, this);

  this._playNextSkillPowerupCollectedFeedback();
};

LevelRenderer.prototype.isPowerupLoadAnimationInProgress = function () {
  return this.powerupLoadAnimationInProgress === true;
};

LevelRenderer.prototype.playPowerupLoadAnimation = function (entityType) {
  if (typeof entityType !== "string" || !POWERUP_LOAD_ANIMATION_CONFIG[entityType]) {
    throw new Error("Unsupported powerup load animation type: " + entityType);
  }
  if (this.powerupLoadAnimationInProgress === true) {
    throw new Error("Powerup load animation cannot overlap.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Powerup load animation requires cc.tween.");
  }
  if (!BOARD_BUBBLE_SIZE || !Number.isFinite(BOARD_BUBBLE_SIZE.width) || !Number.isFinite(BOARD_BUBBLE_SIZE.height) ||
      BOARD_BUBBLE_SIZE.width <= 0 || BOARD_BUBBLE_SIZE.height <= 0) {
    throw new Error("Powerup load animation requires valid BOARD_BUBBLE_SIZE.");
  }

  var config = POWERUP_LOAD_ANIMATION_CONFIG[entityType];
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Powerup load animation requires GameView.");
  }

  var bottomPanelNode = this.layers && this.layers.hud
    ? this.layers.hud.getChildByName("BttomPanel")
    : null;
  var propsScrollNode = requireChildNode(bottomPanelNode, "props_scroll", "BttomPanel");
  var propsViewNode = requireChildNode(propsScrollNode, "view", "BttomPanel/props_scroll");
  var propsContentNode = requireChildNode(propsViewNode, "content", "BttomPanel/props_scroll/view");
  var buttonNode = requireChildNode(propsContentNode, config.buttonNodeName, "BttomPanel/props_scroll/view/content");
  var iconNode = requireChildNode(buttonNode, "icon", "BttomPanel/props_scroll/view/content/" + config.buttonNodeName);
  var startPosition = this._convertNodePositionToGameView(iconNode);

  var shooterPanel = this.layers && this.layers.shooter
    ? this.layers.shooter.getChildByName("ShooterPanel")
    : null;
  if (!shooterPanel || !shooterPanel.isValid) {
    throw new Error("Powerup load animation requires ShooterPanel.");
  }
  var currentBallAnchor = requireChildNode(shooterPanel, "CurrentBallAnchor", "ShooterPanel");
  var endPosition = this._convertNodePositionToGameView(currentBallAnchor);

  var spritePath = BALL_RESOURCES[config.spriteCode];
  if (!spritePath) {
    throw new Error("Powerup load animation sprite path missing: " + config.spriteCode);
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Powerup load animation sprite frame is missing: " + spritePath);
  }

  var fxNode = new cc.Node("powerup_load_fx_" + entityType);
  fxNode.parent = gameViewNode;
  fxNode.zIndex = POWERUP_LOAD_FX_Z_INDEX;
  fxNode.opacity = 255;
  fxNode.scale = POWERUP_LOAD_START_SCALE;
  fxNode.setPosition(startPosition);
  fxNode.setContentSize(BOARD_BUBBLE_SIZE.width, BOARD_BUBBLE_SIZE.height);
  ensureSprite(fxNode, spriteFrame);

  var deltaX = endPosition.x - startPosition.x;
  var deltaY = endPosition.y - startPosition.y;
  var arc = Math.max(POWERUP_LOAD_BEZIER_ARC, Math.abs(deltaY) * 0.28);
  var bezierPoints = [
    cc.v2(startPosition.x + deltaX * 0.28, startPosition.y + deltaY * 0.2 + arc),
    cc.v2(startPosition.x + deltaX * 0.72, startPosition.y + deltaY * 0.78 + arc),
    cc.v2(endPosition.x, endPosition.y)
  ];
  var renderer = this;
  this.powerupLoadAnimationInProgress = true;

  return new Promise(function (resolve) {
    cc.tween(fxNode)
      .parallel(
        cc.tween().bezierTo(
          POWERUP_LOAD_FLY_DURATION,
          bezierPoints[0],
          bezierPoints[1],
          bezierPoints[2]
        ),
        cc.tween().to(POWERUP_LOAD_FLY_DURATION, {
          scale: POWERUP_LOAD_END_SCALE
        }, {
          easing: "quadOut"
        })
      )
      .to(0.08, {
        scale: 0.35,
        opacity: 0
      }, {
        easing: "quadIn"
      })
      .call(function () {
        if (fxNode && fxNode.isValid) {
          fxNode.destroy();
        }
        renderer.powerupLoadAnimationInProgress = false;
        resolve();
      })
      .start();
  });
};

LevelRenderer.prototype.playSnowRemovalAnimation = function () {
  if (typeof cc.tween !== "function") {
    throw new Error("Snow removal animation requires cc.tween.");
  }
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Snow removal animation requires GameView.");
  }
  var bottomPanelNode = this.layers && this.layers.hud
    ? this.layers.hud.getChildByName("BttomPanel")
    : null;
  var propsScrollNode = requireChildNode(bottomPanelNode, "props_scroll", "BttomPanel");
  var propsViewNode = requireChildNode(propsScrollNode, "view", "BttomPanel/props_scroll");
  var propsContentNode = requireChildNode(propsViewNode, "content", "BttomPanel/props_scroll/view");
  var snowButtonNode = requireChildNode(propsContentNode, "snow_removal_btn", "BttomPanel/props_scroll/view/content");
  var iconNode = requireChildNode(snowButtonNode, "icon", "BttomPanel/props_scroll/view/content/snow_removal_btn");
  var startPosition = this._convertNodePositionToGameView(iconNode);
  var spritePath = BALL_RESOURCES.SNOW_REMOVAL_TOOLS;
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Snow removal tool sprite frame is missing: " + spritePath);
  }

  var fxNode = new cc.Node("snow_removal_tool_fx");
  fxNode.parent = gameViewNode;
  fxNode.zIndex = SNOW_REMOVAL_FX_Z_INDEX;
  fxNode.setPosition(startPosition);
  fxNode.setContentSize(SNOW_REMOVAL_FX_SIZE, SNOW_REMOVAL_FX_SIZE);
  fxNode.scale = 0.72;
  fxNode.opacity = 255;
  var sprite = ensureSprite(fxNode, spriteFrame);
  if (!cc.Sprite.SizeMode || cc.Sprite.SizeMode.CUSTOM === undefined) {
    throw new Error("Snow removal animation requires cc.Sprite.SizeMode.CUSTOM.");
  }
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

  return new Promise(function (resolve) {
    cc.tween(fxNode)
      .to(0.28, {
        x: 0,
        y: 0,
        scale: 1.12
      }, {
        easing: "quadOut"
      })
      .call(function () {
        fxNode.angle = 45;
      })
      .to(SNOW_REMOVAL_FX_SWEEP_TO_LEFT_DURATION, {
        x: -SNOW_REMOVAL_FX_SWEEP_DISTANCE
      })
      .to(SNOW_REMOVAL_FX_SWEEP_TO_RIGHT_DURATION, {
        x: SNOW_REMOVAL_FX_SWEEP_DISTANCE
      })
      .to(SNOW_REMOVAL_FX_SWEEP_RETURN_DURATION, {
        x: 0
      })
      .to(0.12, {
        opacity: 0
      })
      .call(function () {
        if (fxNode && fxNode.isValid) {
          fxNode.destroy();
        }
        resolve();
      })
      .start();
  });
};

LevelRenderer.prototype._getHudTargetLayout = function (panel) {
  return requireChildNode(panel, "target_layout", "HudPanel");
};

LevelRenderer.prototype._resolveHudTargetSlot = function (targetLayout, slotName) {
  var cardName = "";
  if (slotName === "ball") {
    cardName = "item_ball";
  } else if (slotName === "ice_ball") {
    cardName = "item_ice_ball";
  } else {
    throw new Error("Unsupported HUD target slot: " + slotName);
  }

  var cardNode = requireChildNode(targetLayout, cardName, "HudPanel/target_layout");
  var targetNode = requireChildNode(cardNode, slotName, "HudPanel/target_layout/" + cardName);
  return {
    cardNode: cardNode,
    targetNode: targetNode,
    description: "HudPanel/target_layout/" + cardName + "/" + slotName
  };
};

LevelRenderer.prototype._renderHudTargets = function (panel, targetDisplay) {
  if (!targetDisplay || typeof targetDisplay !== "object" || Array.isArray(targetDisplay)) {
    throw new Error("HUD target display data must be an object.");
  }

  var targetLayout = this._getHudTargetLayout(panel);
  this._renderHudTargetSlot(targetLayout, "ball", targetDisplay.ball);
  this._renderHudTargetSlot(targetLayout, "ice_ball", targetDisplay.iceSnowball);

  var layout = targetLayout.getComponent(cc.Layout);
  if (layout && typeof layout.updateLayout === "function") {
    layout.updateLayout();
  }
};

LevelRenderer.prototype._renderHudTargetSlot = function (targetLayout, slotName, displayData) {
  var slot = this._resolveHudTargetSlot(targetLayout, slotName);
  var cardNode = slot.cardNode;
  var targetNode = slot.targetNode;
  var valueNode = requireChildNode(targetNode, "TargetValue", slot.description);
  var completeNode = requireChildNode(targetNode, "complete", slot.description);
  var valueLabel = valueNode.getComponent(cc.Label);
  if (!valueLabel) {
    throw new Error(slot.description + "/TargetValue requires cc.Label.");
  }

  if (!displayData) {
    cardNode.active = false;
    targetNode.active = false;
    valueNode.active = false;
    completeNode.active = false;
    valueLabel.string = "";
    return;
  }

  if (typeof displayData.iconCode !== "string" || !displayData.iconCode) {
    throw new Error("HUD target display iconCode is required: " + slotName);
  }
  if (typeof displayData.remaining !== "number" || !isFinite(displayData.remaining) || displayData.remaining < 0) {
    throw new Error("HUD target display remaining is required: " + slotName);
  }
  if (typeof displayData.remainingText !== "string" || !displayData.remainingText) {
    throw new Error("HUD target display remainingText is required: " + slotName);
  }

  var spritePath = BALL_RESOURCES[displayData.iconCode];
  if (!spritePath) {
    throw new Error("Unsupported HUD target icon code: " + displayData.iconCode);
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("HUD target sprite frame is missing: " + spritePath);
  }

  cardNode.active = true;
  targetNode.active = true;
  ensureSprite(targetNode, spriteFrame);
  var targetComplete = displayData.remaining <= 0;
  valueNode.active = !targetComplete;
  completeNode.active = targetComplete;
  valueLabel.string = displayData.remainingText;
};

LevelRenderer.prototype._readRuntimeIceSnowballCollectedTotal = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !runtimeSnapshot.objectives) {
    return 0;
  }
  var total = Number(runtimeSnapshot.objectives.iceCollectedTotal);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error("Runtime snapshot iceCollectedTotal must be a non-negative number.");
  }
  return Math.floor(total);
};

LevelRenderer.prototype._syncDisplayedIceSnowballCollectedTotal = function (runtimeSnapshot) {
  this.displayedIceSnowballCollectedTotal = this._readRuntimeIceSnowballCollectedTotal(runtimeSnapshot);
};

LevelRenderer.prototype._resolveIceSnowballHudDisplayProgress = function (runtimeSnapshot) {
  if (!this._shouldFlyIceSnowballToHud(this.currentLevelConfig)) {
    return this._readRuntimeIceSnowballCollectedTotal(runtimeSnapshot);
  }
  return Math.max(0, Math.floor(Number(this.displayedIceSnowballCollectedTotal) || 0));
};

LevelRenderer.prototype._buildHudTargetDisplayForRender = function (levelConfig, runtimeSnapshot) {
  var hudTargetDisplay = buildHudTargetDisplayData(levelConfig, runtimeSnapshot);
  return applyIceSnowballHudDisplayProgress(
    hudTargetDisplay,
    this._resolveIceSnowballHudDisplayProgress(runtimeSnapshot)
  );
};

LevelRenderer.prototype._incrementDisplayedIceSnowballCollectedTotal = function () {
  var next = Math.floor(Number(this.displayedIceSnowballCollectedTotal) || 0) + 1;
  if (!Number.isInteger(next) || next <= 0) {
    throw new Error("Displayed ice snowball collected total must increment to a positive integer.");
  }
  this.displayedIceSnowballCollectedTotal = next;
};

LevelRenderer.prototype._refreshIceSnowballHudTarget = function () {
  if (!this.currentLevelConfig || !this.lastRuntimeSnapshot) {
    throw new Error("Ice snowball HUD target refresh requires level config and runtime snapshot.");
  }
  var panel = this._getMountedHudPanel();
  if (!panel) {
    return;
  }

  var targetLayout = this._getHudTargetLayout(panel);
  var hudTargetDisplay = this._buildHudTargetDisplayForRender(this.currentLevelConfig, this.lastRuntimeSnapshot);
  this._renderHudTargetSlot(targetLayout, "ice_ball", hudTargetDisplay.iceSnowball);
  var layout = targetLayout.getComponent(cc.Layout);
  if (layout && typeof layout.updateLayout === "function") {
    layout.updateLayout();
  }
  this.lastHudRenderKey = buildHudRenderKey(
    this.currentLevelConfig,
    this.lastRuntimeSnapshot,
    this._resolveIceSnowballHudDisplayProgress(this.lastRuntimeSnapshot)
  );
};

LevelRenderer.prototype._getHudTargetIceBallPositionInGameView = function () {
  var panel = this._getMountedHudPanel();
  var targetLayout = panel ? panel.getChildByName("target_layout") : null;
  var iceCardNode = targetLayout ? targetLayout.getChildByName("item_ice_ball") : null;
  var ballNode = iceCardNode ? iceCardNode.getChildByName("ice_ball") : null;
  if (!iceCardNode || !iceCardNode.active || !ballNode || !ballNode.active || !ballNode.parent) {
    return null;
  }

  return this._convertNodePositionToGameView(ballNode);
};

LevelRenderer.prototype._getHudTargetBallNode = function () {
  var panel = this._getMountedHudPanel();
  var targetLayout = panel ? panel.getChildByName("target_layout") : null;
  var ballCardNode = targetLayout ? targetLayout.getChildByName("item_ball") : null;
  var ballNode = ballCardNode ? ballCardNode.getChildByName("ball") : null;
  if (!ballCardNode || !ballCardNode.active || !ballNode || !ballNode.active || !ballNode.parent) {
    return null;
  }
  return ballNode;
};

LevelRenderer.prototype._getHudTargetBallPositionInGameView = function () {
  var ballNode = this._getHudTargetBallNode();
  if (!ballNode) {
    return null;
  }
  return this._convertNodePositionToGameView(ballNode);
};

LevelRenderer.prototype._resolveMatchedObjectiveCollectStartPositionInGameView = function (entry, boardSnapshot) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Matched objective collect entry is required.");
  }
  if (typeof entry.color !== "string" || !entry.color) {
    throw new Error("Matched objective collect entry requires color.");
  }

  var worldPosition = entry.worldPosition;
  if (
    worldPosition &&
    typeof worldPosition === "object" &&
    !Array.isArray(worldPosition) &&
    typeof worldPosition.x === "number" &&
    typeof worldPosition.y === "number" &&
    isFinite(worldPosition.x) &&
    isFinite(worldPosition.y)
  ) {
    return this._convertBoardPointToGameView(worldPosition.x, worldPosition.y);
  }

  if (
    !boardSnapshot ||
    !Number.isInteger(boardSnapshot.maxColumns) ||
    typeof boardSnapshot.viewportOffsetY !== "number" ||
    !isFinite(boardSnapshot.viewportOffsetY)
  ) {
    throw new Error("Matched objective collect entry position requires board snapshot.");
  }
  if (!Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
    throw new Error("Matched objective collect entry requires row and col when worldPosition is missing.");
  }

  var boardPos = BoardLayout.getCellPosition(
    entry.row,
    entry.col,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
  return this._convertBoardPointToGameView(boardPos.x, boardPos.y);
};

LevelRenderer.prototype._buildMatchedObjectiveCollectBezierPoints = function (startPosition, endPosition) {
  if (!startPosition || !endPosition) {
    throw new Error("Matched objective collect bezier requires start and end positions.");
  }
  var deltaX = endPosition.x - startPosition.x;
  var deltaY = endPosition.y - startPosition.y;
  var arc = Math.max(MATCHED_TARGET_COLLECT_BEZIER_ARC, Math.abs(deltaY) * 0.18);
  return [
    cc.v2(startPosition.x + deltaX * 0.25, startPosition.y + arc),
    cc.v2(startPosition.x + deltaX * 0.72, endPosition.y + arc * 0.55),
    cc.v2(endPosition.x, endPosition.y)
  ];
};

LevelRenderer.prototype._playMatchedObjectiveTargetPunch = function () {
  var targetNode = this._getHudTargetBallNode();
  if (!targetNode || !targetNode.isValid) {
    throw new Error("Matched objective collect target punch requires HUD target ball node.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Matched objective collect target punch requires cc.tween.");
  }

  targetNode.stopAllActions();
  targetNode.scale = 1;
  cc.tween(targetNode)
    .to(MATCHED_TARGET_COLLECT_PUNCH_UP_DURATION, { scale: MATCHED_TARGET_COLLECT_PUNCH_SCALE })
    .to(MATCHED_TARGET_COLLECT_PUNCH_DOWN_DURATION, { scale: 1 })
    .start();
};

LevelRenderer.prototype._spawnMatchedObjectiveCollectParticle = function (entry, startPosition, endPosition) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Matched objective collect particle requires entry.");
  }
  if (typeof entry.color !== "string" || !entry.color) {
    throw new Error("Matched objective collect particle requires color.");
  }
  if (!startPosition || typeof startPosition.x !== "number" || typeof startPosition.y !== "number" || !isFinite(startPosition.x) || !isFinite(startPosition.y)) {
    throw new Error("Matched objective collect particle requires finite start position.");
  }
  if (!endPosition || typeof endPosition.x !== "number" || typeof endPosition.y !== "number" || !isFinite(endPosition.x) || !isFinite(endPosition.y)) {
    throw new Error("Matched objective collect particle requires finite end position.");
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for matched objective collect particle.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("Matched objective collect particle requires cc.tween.");
  }
  if (typeof cc.Node !== "function") {
    throw new Error("Matched objective collect particle requires cc.Node.");
  }

  var spritePath = BALL_RESOURCES[entry.color];
  if (!spritePath) {
    throw new Error("Matched objective collect particle unsupported color: " + entry.color);
  }
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("Matched objective collect particle sprite frame is missing: " + spritePath);
  }

  var particleNode = new cc.Node("matched_objective_collect_" + String(entry.id));
  particleNode.parent = gameViewNode;
  particleNode.zIndex = MATCHED_TARGET_COLLECT_Z_INDEX;
  particleNode.opacity = 0;
  particleNode.scale = 0.72;
  particleNode.setPosition(startPosition.x, startPosition.y);
  particleNode.setContentSize(MATCHED_TARGET_COLLECT_PARTICLE_SIZE, MATCHED_TARGET_COLLECT_PARTICLE_SIZE);
  ensureSprite(particleNode, spriteFrame);

  var delayMs = Number(entry.delayMs);
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("Matched objective collect particle delayMs must be non-negative.");
  }
  var bezierPoints = this._buildMatchedObjectiveCollectBezierPoints(startPosition, endPosition);
  var renderer = this;
  cc.tween(particleNode)
    .delay(delayMs / 1000)
    .call(function () {
      particleNode.opacity = 255;
    })
    .parallel(
      cc.tween().bezierTo(
        MATCHED_TARGET_COLLECT_FLY_DURATION,
        bezierPoints[0],
        bezierPoints[1],
        bezierPoints[2]
      ),
      cc.tween().to(MATCHED_TARGET_COLLECT_FLY_DURATION, {
        scale: 0.5,
        opacity: 210
      }, {
        easing: "quadIn"
      })
    )
    .call(function () {
      renderer._playMatchedObjectiveTargetPunch();
      particleNode.destroy();
    })
    .start();
};

LevelRenderer.prototype._playMatchedObjectiveCollectFly = function (runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.runtimeEvents)) {
    return;
  }
  if (!runtimeSnapshot.board) {
    throw new Error("Matched objective collect fly requires runtimeSnapshot.board.");
  }

  var targetPosition = null;
  for (var eventIndex = 0; eventIndex < runtimeSnapshot.runtimeEvents.length; eventIndex += 1) {
    var event = runtimeSnapshot.runtimeEvents[eventIndex];
    if (!event || event.type !== "matched_objective_collect") {
      continue;
    }
    if (typeof event.id !== "number" || !isFinite(event.id)) {
      throw new Error("matched_objective_collect event requires numeric id.");
    }
    if (event.id <= this.lastMatchedObjectiveCollectEventId) {
      continue;
    }
    if (!Array.isArray(event.entries) || !event.entries.length) {
      throw new Error("matched_objective_collect event requires entries.");
    }

    if (!targetPosition) {
      targetPosition = this._getHudTargetBallPositionInGameView();
      if (!targetPosition) {
        throw new Error("matched_objective_collect event requires active HUD ball target.");
      }
    }

    event.entries.forEach(function (entry) {
      var startPosition = this._resolveMatchedObjectiveCollectStartPositionInGameView(entry, runtimeSnapshot.board);
      this._spawnMatchedObjectiveCollectParticle(entry, startPosition, targetPosition);
    }, this);
    this.lastMatchedObjectiveCollectEventId = event.id;
  }
};

LevelRenderer.prototype._convertBoardPointToGameView = function (x, y) {
  if (!this.layers || !this.layers.board) {
    throw new Error("Board layer is required for coordinate conversion.");
  }
  if (typeof x !== "number" || typeof y !== "number" || !isFinite(x) || !isFinite(y)) {
    throw new Error("Board point conversion requires finite x/y.");
  }

  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView is required for board point conversion.");
  }

  var worldPos = this.layers.board.convertToWorldSpaceAR(cc.v2(x, y));
  return gameViewNode.convertToNodeSpaceAR(worldPos);
};

LevelRenderer.prototype._resolveIceSnowballCollectStartPositionInGameView = function (entry, boardSnapshot) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Ice snowball collect entry is required.");
  }
  if (typeof entry.innerColor !== "string" || !entry.innerColor) {
    throw new Error("Ice snowball collect entry requires innerColor.");
  }

  if (typeof entry.x === "number" && typeof entry.y === "number" && isFinite(entry.x) && isFinite(entry.y)) {
    if (this.layers && this.layers.falling) {
      var gameViewNode = this._getGameViewNode();
      if (!gameViewNode || !gameViewNode.isValid) {
        throw new Error("GameView is required for falling drop collect position.");
      }
      var worldPos = this.layers.falling.convertToWorldSpaceAR(cc.v2(entry.x, entry.y));
      return gameViewNode.convertToNodeSpaceAR(worldPos);
    }
    return this._convertBoardPointToGameView(entry.x, entry.y);
  }

  if (
    !boardSnapshot ||
    !Number.isInteger(boardSnapshot.maxColumns) ||
    typeof boardSnapshot.viewportOffsetY !== "number" ||
    !isFinite(boardSnapshot.viewportOffsetY)
  ) {
    throw new Error("Ice snowball collect entry position requires board snapshot.");
  }
  if (!Number.isInteger(entry.row) || !Number.isInteger(entry.col)) {
    throw new Error("Ice snowball collect entry requires row and col when x/y are missing.");
  }

  var boardPos = BoardLayout.getCellPosition(
    entry.row,
    entry.col,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
  return this._convertBoardPointToGameView(boardPos.x, boardPos.y);
};

LevelRenderer.prototype._alignHudPanelToTop = function (panel) {
  // Keep for backward compatibility. HudPanel positioning is now driven by GameView's SafeArea+Widget.
  return;
};

LevelRenderer.prototype._setHudLabel = function (panel, childName, text) {
  var node = getOrCreateChild(panel, childName);
  var label = node.getComponent(cc.Label);
  if (!label) {
    label = node.addComponent(cc.Label);
  }
  label.string = text;
};

LevelRenderer.prototype._getHudProgressBar = function (panel) {
  var progressNode = panel ? panel.getChildByName("ProgressBar") : null;
  if (!progressNode) {
    return null;
  }

  return progressNode.getComponent(cc.ProgressBar);
};

LevelRenderer.prototype._getHudStarNodes = function (panel) {
  var progressNode = panel ? panel.getChildByName("ProgressBar") : null;
  if (!progressNode) {
    return [];
  }

  return [
    progressNode.getChildByName("star1"),
    progressNode.getChildByName("star2"),
    progressNode.getChildByName("star3") || progressNode.getChildByName("start3")
  ];
};

LevelRenderer.prototype._setHudStarLit = function (starNode, lit) {
  if (!starNode) {
    return;
  }

  var spritePath = lit ? HUD_STAR_RESOURCES.lit : HUD_STAR_RESOURCES.unlit;
  var spriteFrame = this.spriteFrameCache[spritePath];
  if (!spriteFrame) {
    throw new Error("HUD star sprite frame is missing: " + spritePath);
  }

  starNode.active = true;
  ensureSprite(starNode, spriteFrame);
  starNode.color = cc.color(255, 255, 255);
  starNode.opacity = 255;
};

LevelRenderer.prototype._getGameViewNode = function () {
  if (!this.layers || !this.layers.hud) {
    return null;
  }

  return this.layers.hud.getChildByName("GameView");
};

LevelRenderer.prototype._getHudStarParticleNode = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for HUD star particle.");
  }

  var particleNode = gameViewNode.getChildByName(HUD_STAR_PARTICLE_NODE_NAME);
  if (!particleNode || !particleNode.isValid) {
    throw new Error("GameView requires starParticle node.");
  }
  particleNode.zIndex = 1000;
  return particleNode;
};

LevelRenderer.prototype._convertNodePositionToGameView = function (node) {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for coordinate conversion.");
  }
  if (!node || !node.isValid || !node.parent || !node.parent.isValid) {
    throw new Error("Valid source node is required for coordinate conversion.");
  }

  var worldPosition = node.parent.convertToWorldSpaceAR(node.getPosition());
  return gameViewNode.convertToNodeSpaceAR(worldPosition);
};

LevelRenderer.prototype._resolveShooterParticleStartPosition = function () {
  var shooterPanel = this.layers && this.layers.shooter
    ? this.layers.shooter.getChildByName("ShooterPanel")
    : null;
  if (!shooterPanel || !shooterPanel.isValid) {
    throw new Error("ShooterPanel is required for HUD star particle start position.");
  }

  var shooterNode = requireChildNode(shooterPanel, "CurrentBallAnchor", "ShooterPanel");
  return this._convertNodePositionToGameView(shooterNode);
};

LevelRenderer.prototype._buildHudStarBezierPoints = function (startPosition, endPosition) {
  if (!startPosition || !endPosition) {
    throw new Error("HUD star particle bezier requires start and end positions.");
  }

  var deltaX = endPosition.x - startPosition.x;
  var deltaY = endPosition.y - startPosition.y;
  return [
    cc.v2(startPosition.x + deltaX * 0.28, startPosition.y + Math.max(120, deltaY * 0.28)),
    cc.v2(startPosition.x + deltaX * 0.72, endPosition.y + Math.max(80, Math.abs(deltaX) * 0.12)),
    cc.v2(endPosition.x, endPosition.y)
  ];
};

LevelRenderer.prototype._playHudStarPunch = function (starNode) {
  if (!starNode || !starNode.isValid) {
    throw new Error("HUD star punch requires a valid star node.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("HUD star punch requires cc.tween.");
  }

  starNode.stopAllActions();
  starNode.scale = 1;
  cc.tween(starNode)
    .to(HUD_STAR_PUNCH_UP_DURATION, { scale: HUD_STAR_PUNCH_SCALE })
    .to(HUD_STAR_PUNCH_DOWN_DURATION, { scale: 1 })
    .start();
};

LevelRenderer.prototype._playHudStarParticleToStar = function (starNode, onArrive, onComplete) {
  if (!starNode || !starNode.isValid) {
    throw new Error("HUD star particle requires a valid target star node.");
  }
  if (typeof cc.tween !== "function") {
    throw new Error("HUD star particle requires cc.tween.");
  }

  var particleNode = this._getHudStarParticleNode();
  var particleSystem = particleNode.getComponent(cc.ParticleSystem);
  if (!particleSystem) {
    throw new Error("GameView.starParticle requires cc.ParticleSystem.");
  }

  var startPosition = this._resolveShooterParticleStartPosition();
  var endPosition = this._convertNodePositionToGameView(starNode);
  particleNode.stopAllActions();
  particleNode.active = true;
  particleNode.setPosition(startPosition);
  if (typeof particleSystem.resetSystem !== "function") {
    throw new Error("GameView.starParticle ParticleSystem requires resetSystem.");
  }
  particleSystem.resetSystem();

  var bezierPoints = this._buildHudStarBezierPoints(startPosition, endPosition);
  cc.tween(particleNode)
    .bezierTo(
      HUD_STAR_PARTICLE_DURATION,
      bezierPoints[0],
      bezierPoints[1],
      bezierPoints[2]
    )
    .call(function () {
      if (typeof onArrive === "function") {
        onArrive();
      }
    })
    .delay(HUD_STAR_PARTICLE_HOLD_DURATION)
    .call(function () {
      if (typeof particleSystem.stopSystem === "function") {
        particleSystem.stopSystem();
      }
      particleNode.active = false;
      if (typeof onComplete === "function") {
        onComplete();
      }
    })
    .start();
};

LevelRenderer.prototype._runHudStarAnimationQueue = function () {
  this._ensureHudStarAnimationState();
  if (this.hudStarAnimationActive) {
    return;
  }
  if (this.hudStarAnimationQueue.length === 0) {
    return;
  }

  var item = this.hudStarAnimationQueue.shift();
  if (!item || !item.starNode || !item.starNode.isValid) {
    throw new Error("HUD star animation queue contains invalid target.");
  }

  this.hudStarAnimationActive = true;
  this._playHudStarParticleToStar(item.starNode, function () {
    this._setHudStarLit(item.starNode, true);
    this.hudStarDisplayedRating = Math.max(
      Math.floor(Number(this.hudStarDisplayedRating) || 0),
      Math.floor(Number(item.rating) || 0)
    );
    this._playHudStarPunch(item.starNode);
  }.bind(this), function () {
    this.hudStarAnimationActive = false;
    this._runHudStarAnimationQueue();
  }.bind(this));
};

LevelRenderer.prototype._queueHudStarUnlockAnimations = function (starNodes, nextRating) {
  this._ensureHudStarAnimationState();
  if (!Array.isArray(starNodes)) {
    throw new Error("HUD star unlock animation requires star nodes.");
  }
  var queuedRating = Math.max(0, Math.floor(Number(this.hudStarQueuedRating) || 0));
  if (nextRating <= queuedRating) {
    return;
  }

  for (var index = queuedRating; index < nextRating; index += 1) {
    var starNode = starNodes[index];
    if (!starNode || !starNode.isValid) {
      throw new Error("HUD star node is missing for rating index " + index + ".");
    }
    this.hudStarAnimationQueue.push({
      starNode: starNode,
      rating: index + 1
    });
  }
  this.hudStarQueuedRating = nextRating;
  this._runHudStarAnimationQueue();
};

LevelRenderer.prototype._resolveHudStarMarkerRatios = function (winStats) {
  var thresholds = winStats && winStats.starThresholds ? winStats.starThresholds : null;
  var star1 = Math.max(0, Number(thresholds && thresholds.star1) || 0);
  var star2 = Math.max(0, Number(thresholds && thresholds.star2) || 0);
  var star3 = Math.max(0, Number(thresholds && thresholds.star3) || 0);

  if (star3 <= 0) {
    return HUD_STAR_MARKER_FALLBACK_RATIOS.slice();
  }

  return [
    clamp(star1 / star3, 0, 1),
    clamp(star2 / star3, 0, 1),
    1
  ];
};

LevelRenderer.prototype._layoutHudStarMarkers = function (panel, winStats, starNodes) {
  var progressBar = this._getHudProgressBar(panel);
  if (!progressBar || !Array.isArray(starNodes) || !starNodes.length) {
    return;
  }

  var progressNode = progressBar.node || null;
  var progressSize = progressNode && progressNode.getContentSize
    ? progressNode.getContentSize()
    : null;
  var totalLength = Math.max(
    0,
    Number(progressBar.totalLength) ||
      (progressSize ? Number(progressSize.width) : 0) ||
      Number(progressNode && progressNode.width) ||
      0
  );
  if (totalLength <= 0) {
    return;
  }

  var markerRatios = this._resolveHudStarMarkerRatios(winStats);
  starNodes.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }

    var markerX = Math.round(totalLength * markerRatios[index] * 1000) / 1000;
    starNode.setPosition(markerX, starNode.y || 0);
  });
};

LevelRenderer.prototype._renderHudStarProgress = function (panel, runtimeSnapshot) {
  this._ensureHudStarAnimationState();
  var progressBar = this._getHudProgressBar(panel);
  var winStats = runtimeSnapshot && runtimeSnapshot.winStats ? runtimeSnapshot.winStats : null;
  var starProgress = winStats ? clamp(Number(winStats.starProgress) || 0, 0, 1) : 0;
  var starRating = winStats ? clamp(Math.floor(Number(winStats.starRating) || 0), 0, 3) : 0;

  if (progressBar) {
    progressBar.progress = starProgress;
  }

  var starNodes = this._getHudStarNodes(panel);
  this._layoutHudStarMarkers(panel, winStats, starNodes);
  if (this.lastHudStarRating === null) {
    this.lastHudStarRating = starRating;
    this.hudStarDisplayedRating = starRating;
    this.hudStarQueuedRating = starRating;
    starNodes.forEach(function (starNode, index) {
      this._setHudStarLit(starNode, index < starRating);
    }, this);
    return;
  }

  var displayedRating = Math.max(0, Math.floor(Number(this.hudStarDisplayedRating) || 0));
  if (starRating < displayedRating) {
    this.hudStarAnimationQueue = [];
    this.hudStarAnimationActive = false;
    this.hudStarDisplayedRating = starRating;
    this.hudStarQueuedRating = starRating;
    displayedRating = starRating;
  }

  starNodes.forEach(function (starNode, index) {
    this._setHudStarLit(starNode, index < displayedRating);
  }, this);
  this.lastHudStarRating = starRating;
  this._queueHudStarUnlockAnimations(starNodes, starRating);
};

}

module.exports = attachLevelRendererSceneHudMethods;

},{"./LevelRendererSceneShared":"LevelRendererSceneShared"}],
"LevelRendererSceneJarMethods":[function(require,module,exports){
"use strict";

function attachLevelRendererSceneJarMethods(LevelRenderer, deps) {
  var Logger = deps.Logger;
  var DebugFlags = deps.DebugFlags;
  var BoardLayout = deps.BoardLayout;
  var JAR_RESOURCES = deps.JAR_RESOURCES;
  var JAR_MASK_RESOURCES = deps.JAR_MASK_RESOURCES;
  var resolveJarScoreSpritePath = deps.resolveJarScoreSpritePath;
  var JAR_RENDER_SIZE = deps.JAR_RENDER_SIZE;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var clearChildren = deps.clearChildren;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildJarRenderKey = deps.buildJarRenderKey;
  var getJarBaseY = deps.getJarBaseY;
  var createSolidWhiteSpriteFrame = deps.createSolidWhiteSpriteFrame;
  var JarScoreConfig = deps.JarScoreConfig;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var JAR_RENDER_Y_OFFSET = deps.JAR_RENDER_Y_OFFSET;

LevelRenderer.prototype._clearJarDropContainers = function () {
  if (!this.layers || !this.layers.jars) {
    return;
  }

  this.layers.jars.children.forEach(function (jarNode) {
    var container = jarNode.getChildByName("FallingInJar");
    if (container) {
      clearChildren(container);
    }
  });
};

LevelRenderer.prototype._findJarInteriorZone = function (drop, runtimeSnapshot) {
  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var zones = fallingSnapshot && Array.isArray(fallingSnapshot.jarZones)
    ? fallingSnapshot.jarZones
    : [];
  if (!zones.length) {
    return null;
  }

  var bottomY = drop.position.y - BoardLayout.bubbleRadius;
  var topY = drop.position.y + BoardLayout.bubbleRadius;
  for (var index = 0; index < zones.length; index += 1) {
    var zone = zones[index];
    var dx = Math.abs(drop.position.x - zone.x);
    var xInside = dx <= Math.max(6, zone.innerHalfWidth || 0);
    // Delay occlusion so marbles are hidden later, after sinking deeper into the jar mouth.
    var hideTriggerY = zone.mouthY - Math.max(10, BoardLayout.bubbleRadius * 0.35);
    var underMouth = bottomY <= hideTriggerY;
    var aboveBottom = topY >= ((zone.bottomY || 0) + 2);
    if (xInside && underMouth && aboveBottom) {
      return zone;
    }
  }

  return null;
};

LevelRenderer.prototype._resolveJarDropContainer = function (drop, runtimeSnapshot) {
  var zone = this._findJarInteriorZone(drop, runtimeSnapshot);
  if (!zone || !this.layers || !this.layers.jars) {
    return null;
  }

  var jarNode = this.layers.jars.getChildByName("BottomJar_" + zone.index);
  if (!jarNode) {
    return null;
  }

  return this._ensureJarDropContainer(jarNode);
};

LevelRenderer.prototype._ensureJarDropContainer = function (jarNode) {
  var container = getOrCreateChild(jarNode, "FallingInJar");
  var maskNode = jarNode.getChildByName("mask") || jarNode.getChildByName("Mask");

  container.zIndex = 10;
  if (maskNode) {
    maskNode.zIndex = 20;
  }

  return container;
};

LevelRenderer.prototype._getWhiteSpriteFrameForSize = function (width, height) {
  var safeWidth = Math.max(1, Math.floor(width || 1));
  var safeHeight = Math.max(1, Math.floor(height || 1));
  var key = safeWidth + "x" + safeHeight;

  if (this.whiteMaskFrames[key]) {
    return this.whiteMaskFrames[key];
  }

  var created = createSolidWhiteSpriteFrame(safeWidth, safeHeight);
  if (!created) {
    Logger.warn("Failed to create white sprite frame", key);
    return null;
  }

  this.whiteMaskTextures.push(created.texture);
  this.whiteMaskFrames[key] = created.frame;
  return created.frame;
};

LevelRenderer.prototype._renderJarCollisionMasks = function (runtimeSnapshot) {
  var maskRoot = getOrCreateChild(this.layers.overlay, "JarCollisionMaskRoot");
  maskRoot.zIndex = 29;
  clearChildren(maskRoot);
  if (!DebugFlags.get("testLayer")) {
    maskRoot.active = false;
    return;
  }
  maskRoot.active = true;

  var fallingSnapshot = runtimeSnapshot && runtimeSnapshot.systems && runtimeSnapshot.systems.fallingMarbleSystem
    ? runtimeSnapshot.systems.fallingMarbleSystem
    : null;
  var zones = fallingSnapshot && Array.isArray(fallingSnapshot.jarZones)
    ? fallingSnapshot.jarZones
    : [];

  zones.forEach(function (zone, index) {
    var rimHeight = Math.max(6, (zone.contactBand || 16) * 2);
    var rimWidth = Math.max(8, (zone.rimHalfWidth || 0) * 2);

    var rimFrame = this._getWhiteSpriteFrameForSize(rimWidth, rimHeight);
    if (rimFrame) {
      var rimNode = new cc.Node("RimMask_" + index);
      rimNode.parent = maskRoot;
      rimNode.setPosition(zone.x || 0, zone.mouthY || 0);
      rimNode.color = cc.color(255, 255, 255);
      rimNode.opacity = 80;
      ensureSprite(rimNode, rimFrame);
      rimNode.setContentSize(rimWidth, rimHeight);
    }
}, this);

};
LevelRenderer.prototype._renderBottomJars = function (levelConfig, runtimeSnapshot) {
  if (!levelConfig || !levelConfig.level || !Array.isArray(levelConfig.level.jarColors) || levelConfig.level.jarColors.length === 0) {
    throw new Error("Bottom jar rendering requires non-empty level.jarColors.");
  }
  var jarColors = levelConfig.level.jarColors;
  var jarCount = jarColors.length;
  var jarProgress = runtimeSnapshot.jars ? runtimeSnapshot.jars.collectedByColor : {};
  var jarLayout = BoardLayout.getJarLayout(jarCount);
  var jarPositions = jarLayout.positions;


  jarColors.forEach(function (colorCode, index) {
    var jarNode = this._instantiateOrCreate(PREFAB_PATHS.jarItem, this.layers.jars, "BottomJar_" + index);
    var jarYOffset = BoardLayout.getJarRenderYOffset(index, jarCount);
    jarNode.setPosition(jarPositions[index], getJarBaseY() + JAR_RENDER_Y_OFFSET + jarYOffset);
    jarNode.zIndex = BoardLayout.getJarRenderZIndex(index, jarCount);
    jarNode.setScale(jarLayout.scale);
    this._applyJarVisual(jarNode, colorCode);
    this._applyJarMaskVisual(jarNode, colorCode);
    this._ensureJarDropContainer(jarNode);

    var scoreNode = jarNode.getChildByName("score");
    if (!scoreNode || !scoreNode.isValid) {
      throw new Error("JarItem prefab requires score child node.");
    }
    var baseScore = JarScoreConfig.getBaseScoreForJarIndex(jarCount, index);
    var scoreSpritePath = resolveJarScoreSpritePath(colorCode, baseScore);
    var scoreSpriteFrame = this.spriteFrameCache[scoreSpritePath];
    if (!scoreSpriteFrame) {
      throw new Error("Jar base score SpriteFrame is not loaded: " + scoreSpritePath);
    }
    ensureSprite(scoreNode, scoreSpriteFrame);
    scoreNode.setContentSize(scoreSpriteFrame.getOriginalSize());

    var countNode = getOrCreateChild(jarNode, "CountLabel");
    countNode.setPosition(0, -118);
    countNode.color = cc.color(255, 255, 255);
    ensureLabel(countNode, String(jarProgress[colorCode] || 0), 34, 38);
    ensureOutline(countNode, cc.color(83, 109, 138), 3);
  }, this);

  this._renderJarOcclusionLayer(jarColors);
  this._renderJarCollisionMasks(runtimeSnapshot);
};

LevelRenderer.prototype._renderJarOcclusionLayer = function (jarColors) {
  if (!this.layers || !this.layers.jarOcclusion) {
    throw new Error("Jar occlusion rendering requires JarOcclusionLayer.");
  }
  if (!this.layers.jars || !this.layers.jars.isValid) {
    throw new Error("Jar occlusion rendering requires JarLayer.");
  }

  clearChildren(this.layers.jarOcclusion);
  jarColors.forEach(function (colorCode, index) {
    var spritePath = JAR_MASK_RESOURCES[colorCode];
    var spriteFrame = spritePath ? this.spriteFrameCache[spritePath] : null;
    if (!spriteFrame || !spriteFrame.isValid) {
      throw new Error("Jar occlusion SpriteFrame is not loaded: " + spritePath);
    }

    var jarNode = this.layers.jars.getChildByName("BottomJar_" + index);
    if (!jarNode || !jarNode.isValid) {
      throw new Error("Jar occlusion rendering requires BottomJar_" + index + ".");
    }
    if (!Number.isFinite(jarNode.x) || !Number.isFinite(jarNode.y) ||
        !Number.isFinite(jarNode.scaleX) || jarNode.scaleX <= 0 ||
        !Number.isFinite(jarNode.scaleY) || jarNode.scaleY <= 0) {
      throw new Error("BottomJar_" + index + " requires finite position and positive scale.");
    }

    var maskNode = new cc.Node("JarOcclusion_" + index);
    maskNode.parent = this.layers.jarOcclusion;
    maskNode.setPosition(jarNode.x, jarNode.y);
    maskNode.setScale(jarNode.scaleX, jarNode.scaleY);
    maskNode.zIndex = jarNode.zIndex;
    maskNode.opacity = 255;
    var maskSprite = ensureSprite(maskNode, spriteFrame);
    maskSprite.trim = false;
    maskNode.setContentSize(JAR_RENDER_SIZE);
  }, this);
};
}

module.exports = attachLevelRendererSceneJarMethods;

},{}],
"LevelRendererSceneMethods":[function(require,module,exports){
"use strict";

var attachLevelRendererSceneScaffoldMethods = require("./LevelRendererSceneScaffoldMethods");
var attachLevelRendererSceneBoardMethods = require("./LevelRendererSceneBoardMethods");
var attachLevelRendererSceneShooterMethods = require("./LevelRendererSceneShooterMethods");
var attachLevelRendererSceneFxMethods = require("./LevelRendererSceneFxMethods");
var attachLevelRendererSceneHudMethods = require("./LevelRendererSceneHudMethods");
var attachLevelRendererSceneJarMethods = require("./LevelRendererSceneJarMethods");
var attachLevelRendererScenePopupMethods = require("./LevelRendererScenePopupMethods");
var attachLevelRendererSceneOcclusionMethods = require("./LevelRendererSceneOcclusionMethods");

function attachLevelRendererSceneMethods(LevelRenderer, deps) {
  attachLevelRendererSceneScaffoldMethods(LevelRenderer, deps);
  attachLevelRendererSceneBoardMethods(LevelRenderer, deps);
  attachLevelRendererSceneOcclusionMethods(LevelRenderer, deps);
  attachLevelRendererSceneShooterMethods(LevelRenderer, deps);
  attachLevelRendererSceneFxMethods(LevelRenderer, deps);
  attachLevelRendererSceneHudMethods(LevelRenderer, deps);
  attachLevelRendererSceneJarMethods(LevelRenderer, deps);
  attachLevelRendererScenePopupMethods(LevelRenderer, deps);
}

module.exports = attachLevelRendererSceneMethods;

},{"./LevelRendererSceneScaffoldMethods":"LevelRendererSceneScaffoldMethods","./LevelRendererSceneBoardMethods":"LevelRendererSceneBoardMethods","./LevelRendererSceneShooterMethods":"LevelRendererSceneShooterMethods","./LevelRendererSceneFxMethods":"LevelRendererSceneFxMethods","./LevelRendererSceneHudMethods":"LevelRendererSceneHudMethods","./LevelRendererSceneJarMethods":"LevelRendererSceneJarMethods","./LevelRendererScenePopupMethods":"LevelRendererScenePopupMethods","./LevelRendererSceneOcclusionMethods":"LevelRendererSceneOcclusionMethods"}],
"LevelRendererSceneOcclusionMethods":[function(require,module,exports){
"use strict";

function attachLevelRendererSceneOcclusionMethods(LevelRenderer, deps) {
  var BoardLayout = deps.BoardLayout;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var BOARD_OCCLUSION_RESOURCES = deps.BOARD_OCCLUSION_RESOURCES;
  var BOARD_OCCLUSION_CLOCK_RESOURCE = deps.BOARD_OCCLUSION_CLOCK_RESOURCE;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;

  function requireFinite(value, description) {
    if (typeof value !== "number" || !isFinite(value)) {
      throw new Error(description + " must be finite.");
    }
    return value;
  }

  function resolveZoneBounds(zone, boardSnapshot) {
    if (!Array.isArray(zone.cells) || !zone.cells.length) {
      throw new Error("Board occlusion render zone requires cells.");
    }
    var positions = zone.cells.map(function (cell) {
      if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
        throw new Error("Board occlusion render cell requires integer coordinates.");
      }
      return BoardLayout.getCellPosition(
        cell.row,
        cell.col,
        boardSnapshot.maxColumns,
        boardSnapshot.viewportOffsetY
      );
    });
    var minX = Math.min.apply(null, positions.map(function (point) { return point.x; }));
    var maxX = Math.max.apply(null, positions.map(function (point) { return point.x; }));
    var minY = Math.min.apply(null, positions.map(function (point) { return point.y; }));
    var maxY = Math.max.apply(null, positions.map(function (point) { return point.y; }));
    return {
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
      width: Math.max(BOARD_BUBBLE_SIZE.width * 1.45, maxX - minX + BOARD_BUBBLE_SIZE.width * 1.45),
      height: Math.max(BOARD_BUBBLE_SIZE.height * 1.45, maxY - minY + BOARD_BUBBLE_SIZE.height * 1.45)
    };
  }

  function configureCountdownClock(rootNode, spriteFrame, y) {
    if (!spriteFrame || typeof spriteFrame.getOriginalSize !== "function") {
      throw new Error("Board occlusion countdown clock requires a valid SpriteFrame.");
    }
    var originalSize = spriteFrame.getOriginalSize();
    if (!originalSize || originalSize.width <= 0 || originalSize.height <= 0) {
      throw new Error("Board occlusion countdown clock original size is invalid.");
    }
    if (!cc.Sprite.SizeMode || cc.Sprite.SizeMode.RAW === undefined) {
      throw new Error("Board occlusion countdown clock requires cc.Sprite.SizeMode.RAW.");
    }
    var clockNode = new cc.Node("CountdownClock");
    clockNode.parent = rootNode;
    clockNode.setPosition(-38, y);
    clockNode.setContentSize(originalSize);
    var clockSprite = ensureSprite(clockNode, spriteFrame);
    clockSprite.trim = false;
    clockSprite.sizeMode = cc.Sprite.SizeMode.RAW;
    clockNode.setScale(26 / Math.max(originalSize.width, originalSize.height));
  }

  function configureCountdownLabel(rootNode, zone, bounds, clockSpriteFrame) {
    var countdownY = -bounds.height * 0.5 + 22;
    var labelNode = new cc.Node("Countdown");
    labelNode.parent = rootNode;
    labelNode.setPosition(0, countdownY);
    labelNode.setContentSize(120, 34);
    var label = ensureLabel(labelNode, "", 25, 29, cc.Label.HorizontalAlign.CENTER);
    labelNode.color = cc.color(255, 249, 212);
    var outline = labelNode.getComponent(cc.LabelOutline);
    if (!outline) {
      outline = labelNode.addComponent(cc.LabelOutline);
    }
    outline.color = cc.color(66, 74, 63);
    outline.width = 3;

    if (zone.remainingShots !== null) {
      if (!Number.isInteger(zone.remainingShots) || zone.remainingShots <= 0) {
        throw new Error("Board occlusion remainingShots must be a positive integer while active.");
      }
      label.string = zone.remainingShots + " 发";
      return;
    }
    if (zone.remainingTimeMs !== null) {
      requireFinite(zone.remainingTimeMs, "Board occlusion remainingTimeMs");
      if (zone.remainingTimeMs <= 0) {
        throw new Error("Board occlusion remainingTimeMs must be positive while active.");
      }
      if (!clockSpriteFrame) {
        throw new Error("Board occlusion timed zone clock was not preloaded: " + BOARD_OCCLUSION_CLOCK_RESOURCE);
      }
      configureCountdownClock(rootNode, clockSpriteFrame, countdownY);
      labelNode.setPosition(18, countdownY);
      labelNode.setContentSize(82, 34);
      label.string = Math.ceil(zone.remainingTimeMs / 1000) + " 秒";
      return;
    }
    label.string = "道具清理";
  }

  function configureOcclusionMotion(imageNode, visualType) {
    imageNode.stopAllActions();
    if (visualType === "cloud") {
      imageNode.opacity = 228;
      imageNode.runAction(cc.repeatForever(cc.sequence(
        cc.fadeTo(1.25, 250),
        cc.fadeTo(1.25, 218)
      )));
      return;
    }
    if (visualType === "leaves") {
      imageNode.opacity = 255;
      imageNode.angle = -2;
      imageNode.runAction(cc.repeatForever(cc.sequence(
        cc.rotateTo(1.15, 2.5),
        cc.rotateTo(1.15, -2)
      )));
      return;
    }
    throw new Error("Unsupported board occlusion visual type: " + visualType);
  }

  LevelRenderer.prototype._renderBoardOcclusions = function (runtimeSnapshot) {
    if (!runtimeSnapshot || !runtimeSnapshot.board) {
      throw new Error("Board occlusion rendering requires runtime board snapshot.");
    }
    if (!runtimeSnapshot.systems || !runtimeSnapshot.systems.boardOcclusionSystem) {
      throw new Error("Board occlusion rendering requires system snapshot.");
    }
    if (!this.layers || !this.layers.boardOcclusion || !this.layers.boardOcclusion.isValid) {
      throw new Error("Board occlusion rendering requires BoardOcclusionLayer.");
    }
    var snapshot = runtimeSnapshot.systems.boardOcclusionSystem;
    if (!Number.isInteger(snapshot.version) || snapshot.version < 0) {
      throw new Error("Board occlusion render version must be a non-negative integer.");
    }
    if (!Array.isArray(snapshot.activeZones)) {
      throw new Error("Board occlusion render activeZones must be an array.");
    }
    var renderKey = [
      snapshot.version,
      runtimeSnapshot.board.maxColumns,
      runtimeSnapshot.board.viewportOffsetY
    ].join("|");
    if (renderKey === this.lastBoardOcclusionRenderKey) {
      return;
    }

    this.layers.boardOcclusion.children.slice().forEach(function (child) {
      if (!child || !child.isValid || typeof child.destroy !== "function") {
        throw new Error("Board occlusion cleanup requires valid destroyable children.");
      }
      child.stopAllActions();
      child.destroy();
    });
    snapshot.activeZones.forEach(function (zone, zoneIndex) {
      if (!zone || typeof zone.id !== "string" || !zone.id) {
        throw new Error("Board occlusion render zone requires id.");
      }
      var spritePath = BOARD_OCCLUSION_RESOURCES[zone.visualType];
      if (!spritePath) {
        throw new Error("Board occlusion resource missing for type: " + zone.visualType);
      }
      var spriteFrame = this.spriteFrameCache[spritePath];
      if (!spriteFrame) {
        throw new Error("Board occlusion sprite was not preloaded: " + spritePath);
      }
      if (typeof spriteFrame.getOriginalSize !== "function") {
        throw new Error("Board occlusion spriteFrame requires getOriginalSize: " + spritePath);
      }
      var originalSize = spriteFrame.getOriginalSize();
      if (!originalSize || originalSize.width <= 0 || originalSize.height <= 0) {
        throw new Error("Board occlusion sprite original size is invalid: " + spritePath);
      }

      var bounds = resolveZoneBounds(zone, runtimeSnapshot.board);
      var rootNode = new cc.Node("BoardOcclusion_" + zoneIndex + "_" + zone.id);
      rootNode.parent = this.layers.boardOcclusion;
      rootNode.setPosition(bounds.centerX, bounds.centerY);
      rootNode.setContentSize(bounds.width, bounds.height);

      var imageNode = new cc.Node("Visual");
      imageNode.parent = rootNode;
      imageNode.setPosition(0, 0);
      imageNode.setContentSize(originalSize);
      var sprite = ensureSprite(imageNode, spriteFrame);
      if (!cc.Sprite.SizeMode || cc.Sprite.SizeMode.RAW === undefined) {
        throw new Error("Board occlusion rendering requires cc.Sprite.SizeMode.RAW.");
      }
      sprite.trim = false;
      sprite.sizeMode = cc.Sprite.SizeMode.RAW;
      var coverScale = Math.max(bounds.width / originalSize.width, bounds.height / originalSize.height);
      imageNode.setScale(coverScale);
      configureOcclusionMotion(imageNode, zone.visualType);
      var clockSpriteFrame = zone.remainingTimeMs !== null
        ? this.spriteFrameCache[BOARD_OCCLUSION_CLOCK_RESOURCE]
        : null;
      configureCountdownLabel(rootNode, zone, bounds, clockSpriteFrame);
    }, this);
    this.lastBoardOcclusionRenderKey = renderKey;
  };
}

module.exports = attachLevelRendererSceneOcclusionMethods;

},{}],
"LevelRendererScenePopupMethods":[function(require,module,exports){
"use strict";

var SceneShared = require("./LevelRendererSceneShared");

function buildLoseRevivePresentation(levelConfig, revivePlan) {
  if (!levelConfig || !levelConfig.level || typeof levelConfig.level.playMode !== "string") {
    throw new Error("LoseView revive presentation requires level.playMode.");
  }
  if (!revivePlan || typeof revivePlan !== "object" || Array.isArray(revivePlan)) {
    throw new Error("LoseView revive presentation requires revive plan.");
  }
  if (levelConfig.level.playMode === "timed_infinite_shots") {
    if (revivePlan.grantedShots !== 0 || !Number.isInteger(revivePlan.grantedTimeSeconds) || revivePlan.grantedTimeSeconds <= 0) {
      throw new Error("Timed LoseView revive presentation requires positive grantedTimeSeconds and zero grantedShots.");
    }
    return {
      description: "+" + revivePlan.grantedTimeSeconds + "秒",
      descriptionX: 0,
      showBall: false
    };
  }
  if (levelConfig.level.playMode !== "shot_limited") {
    throw new Error("LoseView revive presentation level.playMode is unsupported: " + levelConfig.level.playMode);
  }
  if (!Number.isInteger(revivePlan.grantedShots) || revivePlan.grantedShots <= 0 || revivePlan.grantedTimeSeconds !== 0) {
    throw new Error("Shot-limited LoseView revive presentation requires positive grantedShots and zero grantedTimeSeconds.");
  }
  return {
    description: "赠送" + revivePlan.grantedShots + "球",
    descriptionX: 32,
    showBall: true
  };
}

function attachLevelRendererScenePopupMethods(LevelRenderer, deps) {
  var requireChildNode = SceneShared.requireChildNode;
  var setRequiredLabelString = SceneShared.setRequiredLabelString;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var LOSE_STATUS_RESOURCES = deps.LOSE_STATUS_RESOURCES;
  var REWARD_ITEM_RESOURCES = deps.REWARD_ITEM_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var SpriteProxyLayerHelper = deps.SpriteProxyLayerHelper;
  var PropDescriptionViewController = deps.PropDescriptionViewController;
  var POPUP_CONTENT_CONTAINER_NAME = deps.POPUP_CONTENT_CONTAINER_NAME;
  var WIN_VIEW_PROXY_ROOT_NAME = "win_view_auto_proxy_root";
  var LOSE_VIEW_PROXY_ROOT_NAME = "lose_view_auto_proxy_root";
  var ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME = "add_ball_tips_view_auto_proxy_root";
  var PAUSE_VIEW_PROXY_ROOT_NAME = "pause_view_auto_proxy_root";
  var POPUP_OPEN_ANIM_DURATION = deps.POPUP_OPEN_ANIM_DURATION;
  var POPUP_OPEN_ANIM_FROM_SCALE = deps.POPUP_OPEN_ANIM_FROM_SCALE;
  var WIN_POPUP_OPEN_ANIM_DURATION = deps.WIN_POPUP_OPEN_ANIM_DURATION;
  var WIN_POPUP_OPEN_ANIM_FROM_SCALE = deps.WIN_POPUP_OPEN_ANIM_FROM_SCALE;
  var WIN_STAR_ANIM_START_DELAY = deps.WIN_STAR_ANIM_START_DELAY;
  var WIN_STAR_ANIM_STAGGER = deps.WIN_STAR_ANIM_STAGGER;
  var WIN_STAR_PUNCH_FROM_SCALE = deps.WIN_STAR_PUNCH_FROM_SCALE;
  var WIN_STAR_PUNCH_DOWN_SCALE = deps.WIN_STAR_PUNCH_DOWN_SCALE;
  var WIN_STAR_SHRINK_DURATION = deps.WIN_STAR_SHRINK_DURATION;
  var WIN_STAR_RECOVER_DURATION = deps.WIN_STAR_RECOVER_DURATION;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var getOrCreateChild = deps.getOrCreateChild;
  var buildResultTexts = deps.buildResultTexts;
  var resolveWinStarRating = deps.resolveWinStarRating;
  var buildAdRevivePlan = deps.buildAdRevivePlan;
  var resolveLoseRewardEntry = deps.resolveLoseRewardEntry;
  var LOSE_NO_REVIVE_ACTION_BUTTON_Y = -285;
  function ensureLoseOriginalY(node, description) {
    if (!node || !node.isValid) {
      throw new Error(description + " is required.");
    }
    if (typeof node.y !== "number") {
      throw new Error(description + " position Y is invalid.");
    }
    if (typeof node._loseOriginalY !== "number") {
      node._loseOriginalY = node.y;
    }
  }

  function applyLoseReviveLayout(loseContent, canRevive) {
    var backButtonNode = requireChildNode(loseContent, "btn_back", "LoseView");

    ensureLoseOriginalY(backButtonNode, "LoseView/btn_back");

    if (canRevive) {
      backButtonNode.setPosition(backButtonNode.x, backButtonNode._loseOriginalY);
      return;
    }

    backButtonNode.setPosition(backButtonNode.x, LOSE_NO_REVIVE_ACTION_BUTTON_Y);
  }

  function setNodeTreeActive(node, active) {
    if (!node || !node.isValid) {
      throw new Error("LoseView node tree target is required.");
    }
    node.active = active === true;
    if (!Array.isArray(node.children)) {
      throw new Error("LoseView node tree children must be an array: " + node.name);
    }
    node.children.forEach(function (childNode) {
      setNodeTreeActive(childNode, active);
    });
  }

  function renderLoseFailureStatus(renderer, loseContent, runtimeSnapshot) {
    if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
      throw new Error("LoseView failure status requires runtime snapshot.");
    }
    if (!runtimeSnapshot.board || typeof runtimeSnapshot.board !== "object" || Array.isArray(runtimeSnapshot.board)) {
      throw new Error("LoseView failure status requires runtimeSnapshot.board.");
    }
    if (!Array.isArray(runtimeSnapshot.board.cells)) {
      throw new Error("LoseView failure status requires runtimeSnapshot.board.cells.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object" || Array.isArray(runtimeSnapshot.winStats)) {
      throw new Error("LoseView failure status requires runtimeSnapshot.winStats.");
    }

    var starRating = Number(runtimeSnapshot.winStats.starRating);
    if (!Number.isInteger(starRating) || starRating < 0) {
      throw new Error("LoseView failure status requires non-negative integer winStats.starRating.");
    }

    var ballComplete = runtimeSnapshot.board.cells.length === 0;
    var starComplete = starRating >= 1;
    var failTips;
    if (starComplete && !ballComplete) {
      failTips = "分数已达标\n但是还有球球未清空";
    } else if (ballComplete && !starComplete) {
      failTips = "球球已清空\n但是分数未达标";
    } else if (!ballComplete && !starComplete) {
      failTips = "分数未达标\n且球球也未清空";
    } else {
      throw new Error("LoseView failure status cannot be shown for a completed board and score.");
    }

    var failTipsNode = requireChildNode(loseContent, "fail_tips", "LoseView");
    var statusLayoutNode = requireChildNode(loseContent, "taget", "LoseView");
    var ballStatusNode = requireChildNode(statusLayoutNode, "ball_complete", "LoseView/taget");
    var starStatusNode = requireChildNode(statusLayoutNode, "star_complete", "LoseView/taget");
    var completeSpriteFrame = renderer.spriteFrameCache[LOSE_STATUS_RESOURCES.complete];
    var incompleteSpriteFrame = renderer.spriteFrameCache[LOSE_STATUS_RESOURCES.incomplete];
    if (!completeSpriteFrame) {
      throw new Error("LoseView complete status sprite is not preloaded: " + LOSE_STATUS_RESOURCES.complete);
    }
    if (!incompleteSpriteFrame) {
      throw new Error("LoseView incomplete status sprite is not preloaded: " + LOSE_STATUS_RESOURCES.incomplete);
    }

    setRequiredLabelString(failTipsNode, failTips, "LoseView/fail_tips");
    ensureSprite(ballStatusNode, ballComplete ? completeSpriteFrame : incompleteSpriteFrame);
    ensureSprite(starStatusNode, starComplete ? completeSpriteFrame : incompleteSpriteFrame);
  }

  function renderLoseReviveGain(renderer, loseContent, levelConfig, runtimeSnapshot, canRevive) {
    var getNode = requireChildNode(loseContent, "get", "LoseView");
    if (!canRevive) {
      setNodeTreeActive(getNode, false);
      return;
    }
    setNodeTreeActive(getNode, true);
    if (typeof buildAdRevivePlan !== "function") {
      throw new Error("LoseView requires buildAdRevivePlan.");
    }
    var revivePlan = buildAdRevivePlan(levelConfig, runtimeSnapshot);
    var presentation = buildLoseRevivePresentation(levelConfig, revivePlan);
    var ballNode = requireChildNode(getNode, "handsel_ball", "LoseView/get");
    var desNode = requireChildNode(getNode, "handsel_des", "LoseView/get");
    if (typeof desNode.setPosition !== "function" || typeof desNode.y !== "number") {
      throw new Error("LoseView/get/handsel_des position is invalid.");
    }
    desNode.setPosition(presentation.descriptionX, desNode.y);
    setRequiredLabelString(desNode, presentation.description, "LoseView/get/handsel_des");
    ballNode.active = presentation.showBall;
    if (!presentation.showBall) {
      return;
    }

    var iconCode = revivePlan.targetColor ? revivePlan.targetColor : "RAINBOW";
    var spritePath = BALL_RESOURCES[iconCode];
    if (!spritePath) {
      throw new Error("LoseView revive gain unsupported icon code: " + iconCode);
    }
    var spriteFrame = renderer.spriteFrameCache[spritePath];
    if (!spriteFrame) {
      throw new Error("LoseView revive gain sprite is not preloaded: " + spritePath);
    }
    ensureSprite(ballNode, spriteFrame);
  }

  function renderLoseCoinButton(renderer, loseContent, canRevive) {
    var coinButtonNode = requireChildNode(loseContent, "btn_coin", "LoseView");
    if (!canRevive) {
      setNodeTreeActive(coinButtonNode, false);
      return;
    }
    setNodeTreeActive(coinButtonNode, true);
    if (!renderer.loseCoinPresentation || typeof renderer.loseCoinPresentation !== "object") {
      throw new Error("LoseView requires coin presentation.");
    }
    var cost = Math.floor(Number(renderer.loseCoinPresentation.cost));
    if (!Number.isInteger(cost) || cost <= 0) {
      throw new Error("LoseView coin revive cost must be a positive integer.");
    }
    if (typeof renderer.loseCoinPresentation.getCoinCount !== "function") {
      throw new Error("LoseView coin presentation requires getCoinCount.");
    }
    var coinCount = Math.floor(Number(renderer.loseCoinPresentation.getCoinCount()));
    if (!Number.isInteger(coinCount) || coinCount < 0) {
      throw new Error("LoseView coin count must be a non-negative integer.");
    }

    var labelNode = requireChildNode(coinButtonNode, "label", "LoseView/btn_coin");
    var coinNode = requireChildNode(coinButtonNode, "coin", "LoseView/btn_coin");
    var numNode = requireChildNode(coinNode, "num", "LoseView/btn_coin/coin");
    setRequiredLabelString(labelNode, String(cost) + "复活", "LoseView/btn_coin/label");
    setRequiredLabelString(numNode, String(coinCount), "LoseView/btn_coin/coin/num");
    renderer._bindLoseButton(coinButtonNode, "coin");
  }

  function renderAddBallTipsCoinButton(renderer, panel) {
    var coinButtonNode = requireChildNode(panel, "coin_btn", "AddBallTipsView/Panel");
    if (!renderer.addBallTipsCoinPresentation || typeof renderer.addBallTipsCoinPresentation !== "object") {
      throw new Error("AddBallTipsView requires coin presentation.");
    }
    var cost = Math.floor(Number(renderer.addBallTipsCoinPresentation.cost));
    if (!Number.isInteger(cost) || cost <= 0) {
      throw new Error("AddBallTipsView coin cost must be a positive integer.");
    }
    if (typeof renderer.addBallTipsCoinPresentation.getCoinCount !== "function") {
      throw new Error("AddBallTipsView coin presentation requires getCoinCount.");
    }
    var coinCount = Math.floor(Number(renderer.addBallTipsCoinPresentation.getCoinCount()));
    if (!Number.isInteger(coinCount) || coinCount < 0) {
      throw new Error("AddBallTipsView coin count must be a non-negative integer.");
    }

    var labelNode = requireChildNode(coinButtonNode, "lab", "AddBallTipsView/Panel/coin_btn");
    setRequiredLabelString(labelNode, String(cost), "AddBallTipsView/Panel/coin_btn/lab");
    renderer._bindAddBallTipsButton(coinButtonNode, "coin");
  }

LevelRenderer.prototype._setWinValueText = function (valueNode, text) {
  if (!valueNode) {
    return;
  }

  var label = valueNode.getComponent(cc.Label);
  if (!label) {
    label = valueNode.addComponent(cc.Label);
  }
  label.string = text;
};

  function getRuntimeWinClearRewardItems(runtimeSnapshot) {
    if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
      throw new Error("WinView clear rewards require won runtime snapshot.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
      throw new Error("WinView clear rewards require runtimeSnapshot.winStats.");
    }
    if (!Array.isArray(runtimeSnapshot.winStats.clearRewardItems)) {
      throw new Error("WinView clear rewards require winStats.clearRewardItems.");
    }
    return runtimeSnapshot.winStats.clearRewardItems;
  }

  function resolveRewardItemSpritePath(itemId) {
    if (!REWARD_ITEM_RESOURCES || !REWARD_ITEM_RESOURCES[itemId]) {
      throw new Error("WinView unsupported reward item id: " + itemId);
    }
    return REWARD_ITEM_RESOURCES[itemId];
  }

  function requireWinChild(parentNode, childName, ownerName) {
    if (!parentNode || !parentNode.isValid) {
      throw new Error("WinView requires valid parent for " + childName + ".");
    }
    var childNode = parentNode.getChildByName(childName);
    if (!childNode || !childNode.isValid) {
      throw new Error("WinView " + ownerName + " requires child node: " + childName);
    }
    return childNode;
  }

LevelRenderer.prototype._renderWinAwardInfo = function (winContent, rewardItems) {
  if (!Array.isArray(rewardItems)) {
    throw new Error("WinView award_info requires reward items array.");
  }
  var awardInfoNode = winContent ? winContent.getChildByName("award_info") : null;
  if (rewardItems.length === 0) {
    if (awardInfoNode) {
      awardInfoNode.active = false;
    }
    return;
  }

  if (!awardInfoNode || !awardInfoNode.isValid) {
    throw new Error("WinView requires award_info when clearRewardItems are configured.");
  }
  awardInfoNode.active = true;

  var giftListNode = requireWinChild(awardInfoNode, "gift_list", "award_info");
  var templateNode = requireWinChild(giftListNode, "gift", "award_info.gift_list");
  var activeNodes = [];

  rewardItems.forEach(function (rewardItem, index) {
    if (!rewardItem || typeof rewardItem !== "object") {
      throw new Error("WinView clear reward item must be object at index " + index + ".");
    }
    var itemId = typeof rewardItem.id === "string" ? rewardItem.id : "";
    var count = Number(rewardItem.count);
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("WinView clear reward count must be positive integer: " + itemId);
    }

    var itemNode = null;
    if (index === 0) {
      itemNode = templateNode;
    } else {
      itemNode = giftListNode.getChildByName("gift_" + index);
      if (!itemNode) {
        if (typeof cc.instantiate !== "function") {
          throw new Error("WinView multiple reward items require cc.instantiate.");
        }
        itemNode = cc.instantiate(templateNode);
        itemNode.name = "gift_" + index;
        itemNode.parent = giftListNode;
      }
    }

    itemNode.active = true;
    activeNodes.push(itemNode);

    var iconNode = requireWinChild(itemNode, "icon", itemNode.name);
    var numNode = requireWinChild(itemNode, "num", itemNode.name);
    var spritePath = resolveRewardItemSpritePath(itemId);
    var spriteFrame = this.spriteFrameCache[spritePath];
    if (!spriteFrame || (cc && typeof cc.isValid === "function" && !cc.isValid(spriteFrame))) {
      throw new Error("WinView reward sprite is not preloaded: " + spritePath);
    }

    ensureSprite(iconNode, spriteFrame);
    var iconSize = iconNode.getContentSize();
    if (!iconSize || iconSize.width <= 0 || iconSize.height <= 0) {
      iconNode.setContentSize(spriteFrame.getOriginalSize());
    }
    this._setWinValueText(numNode, "x" + count);
  }, this);

  giftListNode.children.forEach(function (child) {
    if (activeNodes.indexOf(child) === -1) {
      child.active = false;
    }
  });

  var layout = giftListNode.getComponent(cc.Layout);
  if (layout) {
    layout.spacingX = rewardItems.length > 1 ? 24 : 0;
    if (typeof layout.updateLayout === "function") {
      layout.updateLayout();
    }
  }
};

LevelRenderer.prototype._renderWinMaxScoreStamp = function (scoreBgNode, runtimeSnapshot) {
  var maxScoreNode = requireWinChild(scoreBgNode, "max_score", "score_bg");
  maxScoreNode.setSiblingIndex(scoreBgNode.children.length - 1);
  if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
    maxScoreNode.active = false;
    return;
  }
  if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
    throw new Error("WinView max_score requires runtimeSnapshot.winStats.");
  }
  if (typeof runtimeSnapshot.winStats.isPersonalBestScore !== "boolean") {
    throw new Error("WinView max_score requires boolean winStats.isPersonalBestScore.");
  }
  maxScoreNode.active = runtimeSnapshot.winStats.isPersonalBestScore;
};

LevelRenderer.prototype._ensurePopupMaskVisible = function (popupNode, opacity) {
  if (!popupNode) {
    return;
  }

  var maskNode = popupNode.getChildByName("mask");
  if (!maskNode) {
    return;
  }

  var popupSize = popupNode.getContentSize();
  if (this.rootNode && this.rootNode.getContentSize) {
    var rootSize = this.rootNode.getContentSize();
    if (rootSize && rootSize.width > 0 && rootSize.height > 0) {
      popupSize = rootSize;
      popupNode.setContentSize(rootSize);
    }
  }

  var maskFrame = this._getWhiteSpriteFrameForSize(popupSize.width, popupSize.height);
  if (maskFrame) {
    ensureSprite(maskNode, maskFrame);
    maskNode.setContentSize(popupSize);
  }

  maskNode.active = true;
  maskNode.color = cc.color(0, 0, 0);
  maskNode.opacity = typeof opacity === "number" ? opacity : 100;
  maskNode.zIndex = -10;
};

LevelRenderer.prototype._ensurePopupContentContainer = function (popupNode) {
  if (!popupNode) {
    return null;
  }

  var container = popupNode.getChildByName(POPUP_CONTENT_CONTAINER_NAME);
  if (!container) {
    container = new cc.Node(POPUP_CONTENT_CONTAINER_NAME);
    container.parent = popupNode;
    container.setPosition(0, 0);
    container.zIndex = 0;
  }

  var popupSize = popupNode.getContentSize();
  if (popupSize && popupSize.width > 0 && popupSize.height > 0) {
    container.setContentSize(popupSize);
  }

  popupNode.children.slice().forEach(function (child) {
    if (!child || child === container || child.name === "mask") {
      return;
    }

    var localPos = child.getPosition();
    var childScaleX = child.scaleX;
    var childScaleY = child.scaleY;
    var childAngle = child.angle;
    var childZIndex = child.zIndex;

    child.parent = container;
    child.setPosition(localPos);
    child.scaleX = childScaleX;
    child.scaleY = childScaleY;
    child.angle = childAngle;
    child.zIndex = childZIndex;
  });

  return container;
};

LevelRenderer.prototype._playPopupContentOpenAnimation = function (container, options) {
  if (!container) {
    return;
  }

  options = options || {};
  var duration = typeof options.duration === "number" ? options.duration : POPUP_OPEN_ANIM_DURATION;
  var fromScale = typeof options.fromScale === "number" ? options.fromScale : POPUP_OPEN_ANIM_FROM_SCALE;
  var easing = typeof options.easing === "string" && options.easing ? options.easing : "backOut";

  container.stopAllActions();
  container.opacity = 0;
  container.scale = fromScale;

  if (typeof cc.tween !== "function") {
    container.opacity = 255;
    container.scale = 1;
    return;
  }

  cc.tween(container)
    .to(duration, {
      opacity: 255,
      scale: 1
    }, {
      easing: easing
    })
    .start();
};

LevelRenderer.prototype._bindWinButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__winBoundAction === action) {
    return;
  }

  buttonNode.__winBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeWinAction(action);
  }, this);
};

LevelRenderer.prototype._getWinStarNodes = function (winContent) {
  if (!winContent) {
    return [];
  }

  return [
    winContent.getChildByName("star1"),
    winContent.getChildByName("star2"),
    winContent.getChildByName("star3") || winContent.getChildByName("start3")
  ];
};

LevelRenderer.prototype._renderWinStars = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  var stars = this._getWinStarNodes(winContent);
  var safeStarRating = Math.max(0, Math.min(3, Math.floor(Number(starRating) || 0)));
  stars.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }
    starNode.active = index < safeStarRating;
  });
};

LevelRenderer.prototype._playWinStarsPunchAnimation = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  var stars = this._getWinStarNodes(winContent);
  var safeStarRating = Math.max(0, Math.min(3, Math.floor(Number(starRating) || 0)));

  stars.forEach(function (starNode, index) {
    if (!starNode) {
      return;
    }

    starNode.stopAllActions();
    if (index >= safeStarRating || !starNode.active) {
      starNode.scale = 1;
      return;
    }

    starNode.scale = WIN_STAR_PUNCH_FROM_SCALE;
    if (typeof cc.tween !== "function") {
      starNode.scale = 1;
      return;
    }

    cc.tween(starNode)
      .delay(WIN_STAR_ANIM_START_DELAY + index * WIN_STAR_ANIM_STAGGER)
      // 由慢到快收缩，制造“砸下去”的打击感。
      .to(WIN_STAR_SHRINK_DURATION, {
        scale: WIN_STAR_PUNCH_DOWN_SCALE
      }, {
        easing: "quartIn"
      })
      .to(WIN_STAR_RECOVER_DURATION, {
        scale: 1
      }, {
        easing: "quadOut"
      })
      .start();
  });
};

LevelRenderer.prototype._playWinPopupOpenAnimation = function (winContent, starRating) {
  if (!winContent) {
    return;
  }

  this._playPopupContentOpenAnimation(winContent, {
    duration: WIN_POPUP_OPEN_ANIM_DURATION,
    fromScale: WIN_POPUP_OPEN_ANIM_FROM_SCALE,
    easing: "backOut"
  });
  this._playWinStarsPunchAnimation(winContent, starRating);
};

  function requireRuntimeWinStats(runtimeSnapshot) {
    if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
      throw new Error("WinView render key requires won runtime snapshot.");
    }
    if (!runtimeSnapshot.winStats || typeof runtimeSnapshot.winStats !== "object") {
      throw new Error("WinView render key requires runtimeSnapshot.winStats.");
    }
    return runtimeSnapshot.winStats;
  }

  function requireFiniteWinNumber(value, description) {
    var numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(description + " must be a finite number.");
    }
    return numberValue;
  }

  function resolveWinLevelDisplayText(levelConfig) {
    if (!levelConfig || !levelConfig.level) {
      throw new Error("WinView level display requires level config.");
    }
    var randomChallenge = levelConfig.level.randomChallenge;
    if (randomChallenge && randomChallenge.mode === "random_challenge") {
      return "挑战关";
    }
    var levelId = Math.floor(Number(levelConfig.level.levelId));
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("WinView level display requires positive integer level id.");
    }
    return "第" + levelId + "关";
  }

  function buildWinViewRenderKey(levelConfig, runtimeSnapshot) {
    if (!levelConfig || !levelConfig.level) {
      throw new Error("WinView render key requires level config.");
    }

    var levelId = Math.floor(Number(levelConfig.level.levelId));
    if (!Number.isInteger(levelId) || levelId <= 0) {
      throw new Error("WinView render key requires positive integer level id.");
    }

    var winStats = requireRuntimeWinStats(runtimeSnapshot);
    if (typeof winStats.isPersonalBestScore !== "boolean") {
      throw new Error("WinView render key requires boolean isPersonalBestScore.");
    }
    var starRating = resolveWinStarRating(levelConfig, runtimeSnapshot);
    if (!Number.isFinite(starRating)) {
      throw new Error("WinView render key requires finite star rating.");
    }

    return JSON.stringify({
      levelId: levelId,
      totalScore: requireFiniteWinNumber(winStats.totalScore, "WinView render key totalScore"),
      personalBest: winStats.isPersonalBestScore,
      rewardItems: getRuntimeWinClearRewardItems(runtimeSnapshot),
      starRating: Math.floor(starRating)
    });
  }

LevelRenderer.prototype._bindLoseButton = function (buttonNode, action) {
  if (!buttonNode || buttonNode.__loseBoundAction === action) {
    return;
  }

  buttonNode.__loseBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeLoseAction(action);
  }, this);
};

LevelRenderer.prototype._bindAddBallTipsButton = function (buttonNode, action) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("AddBallTipsView button is required for action: " + action);
  }
  if (!buttonNode.getComponent(cc.Button)) {
    throw new Error("AddBallTipsView button requires cc.Button: " + buttonNode.name);
  }
  if (buttonNode.__addBallTipsBoundAction === action) {
    return;
  }
  if (buttonNode.__addBallTipsBoundAction) {
    throw new Error("AddBallTipsView button already has a different action: " + buttonNode.name);
  }

  buttonNode.__addBallTipsBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokeAddBallTipsAction(action);
  }, this);
};

LevelRenderer.prototype._bindPauseButton = function (buttonNode, action) {
  if (!buttonNode || !buttonNode.isValid) {
    throw new Error("PauseView button is required for action: " + action);
  }
  if (!buttonNode.getComponent(cc.Button)) {
    throw new Error("PauseView button requires cc.Button: " + buttonNode.name);
  }
  if (buttonNode.__pauseBoundAction === action) {
    return;
  }
  if (buttonNode.__pauseBoundAction) {
    throw new Error("PauseView button already has a different action: " + buttonNode.name);
  }

  buttonNode.__pauseBoundAction = action;
  buttonNode.on(cc.Node.EventType.TOUCH_END, function (event) {
    if (event) {
      event.stopPropagation();
    }
    this._invokePauseAction(action);
  }, this);
};

LevelRenderer.prototype.showPauseView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PauseView requires the gameplay modal layer.");
  }
  var existing = this.layers.modal.getChildByName("PauseView");
  if (existing && existing.active) {
    throw new Error("PauseView is already active.");
  }

  var pauseView = existing || this._instantiateOrCreate(PREFAB_PATHS.pauseView, this.layers.modal, "PauseView");
  if (!pauseView || !pauseView.isValid) {
    throw new Error("PauseView prefab could not be instantiated.");
  }
  pauseView.active = true;
  pauseView.setPosition(0, 0);
  SpriteProxyLayerHelper.destroyProxyRoot(pauseView, PAUSE_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(pauseView, 164);
  var pauseContent = this._ensurePopupContentContainer(pauseView);
  var panel = requireChildNode(pauseContent, "Panel", "PauseView content");

  this._bindPauseButton(requireChildNode(panel, "btn_close", "PauseView/Panel"), "continue");
  this._bindPauseButton(requireChildNode(panel, "continue", "PauseView/Panel"), "continue");
  this._bindPauseButton(requireChildNode(panel, "rechage", "PauseView/Panel"), "retry");
  this._bindPauseButton(requireChildNode(panel, "back", "PauseView/Panel"), "exit");
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: pauseView,
    proxyRootName: PAUSE_VIEW_PROXY_ROOT_NAME
  });
  this._playPopupContentOpenAnimation(pauseContent);
};

LevelRenderer.prototype.hidePauseView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PauseView hide requires the gameplay modal layer.");
  }
  var pauseView = this.layers.modal.getChildByName("PauseView");
  if (!pauseView || !pauseView.isValid || !pauseView.active) {
    throw new Error("Cannot hide an inactive PauseView.");
  }
  pauseView.active = false;
};

LevelRenderer.prototype.showPropDescriptionView = function (levelConfig) {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PropDescriptionView requires the gameplay modal layer.");
  }
  if (!levelConfig || typeof levelConfig !== "object" || Array.isArray(levelConfig)) {
    throw new Error("PropDescriptionView requires current levelConfig.");
  }
  var existing = this.layers.modal.getChildByName("PropDescriptionView");
  if (existing && existing.isValid && existing.active) {
    throw new Error("PropDescriptionView is already active.");
  }
  if (existing && existing.isValid) {
    existing.removeFromParent(false);
    existing.destroy();
    this.propDescriptionViewController = null;
  }

  var viewNode = this._instantiateOrCreate(
    PREFAB_PATHS.propDescriptionView,
    this.layers.modal,
    "PropDescriptionView"
  );
  if (!viewNode || !viewNode.isValid) {
    throw new Error("PropDescriptionView prefab could not be instantiated.");
  }
  viewNode.active = true;
  viewNode.setPosition(0, 0);
  this._ensurePopupMaskVisible(viewNode, 164);
  var popupContent = this._ensurePopupContentContainer(viewNode);
  requireChildNode(popupContent, "Panel", "PropDescriptionView content");

  if (
    !this.propDescriptionViewController ||
    this.propDescriptionViewController.node !== viewNode ||
    !this.propDescriptionViewController.node.isValid
  ) {
    this.propDescriptionViewController = new PropDescriptionViewController({
      node: viewNode,
      onClose: function () {
        this._invokeGameplayAction("close_prop_description");
      }.bind(this)
    });
  }
  try {
    this.propDescriptionViewController.render({
      levelConfig: levelConfig,
      spriteFrameCache: this.spriteFrameCache
    });
  } catch (error) {
    viewNode.removeFromParent(false);
    viewNode.destroy();
    this.propDescriptionViewController = null;
    throw error;
  }
  this._playPopupContentOpenAnimation(popupContent);
};

LevelRenderer.prototype.hidePropDescriptionView = function () {
  if (!this.layers || !this.layers.modal || !this.layers.modal.isValid) {
    throw new Error("PropDescriptionView hide requires the gameplay modal layer.");
  }
  var viewNode = this.layers.modal.getChildByName("PropDescriptionView");
  if (!viewNode || !viewNode.isValid || !viewNode.active) {
    throw new Error("Cannot hide an inactive PropDescriptionView.");
  }
  viewNode.removeFromParent(false);
  viewNode.destroy();
  this.propDescriptionViewController = null;
};

LevelRenderer.prototype._renderWinView = function (runtimeSnapshot) {
  var existing = this.layers.modal.getChildByName("WinView");
  var wasActive = !!(existing && existing.active);
  if (!runtimeSnapshot || runtimeSnapshot.state !== "won") {
    if (existing) {
      existing.active = false;
      if (wasActive) {
        this._notifyResultViewLifecycle("onWinViewHide");
      }
    }
    this.lastWinViewRenderKey = "";
    return;
  }

  var renderKey = buildWinViewRenderKey(this.currentLevelConfig, runtimeSnapshot);
  if (
    existing &&
    existing.active &&
    this.lastWinViewRenderKey === renderKey &&
    SpriteProxyLayerHelper.hasAutoProxyTree(existing, WIN_VIEW_PROXY_ROOT_NAME)
  ) {
    return;
  }

  var winView = existing;
  if (!winView) {
    winView = this._instantiateOrCreate(PREFAB_PATHS.winView, this.layers.modal, "WinView");
  }

  if (!winView) {
    throw new Error("WinView prefab could not be instantiated.");
  }

  winView.active = true;
  winView.setPosition(0, 0);
  SpriteProxyLayerHelper.destroyProxyRoot(winView, WIN_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(winView, 100);
  var winContent = this._ensurePopupContentContainer(winView);

  var winStats = requireRuntimeWinStats(runtimeSnapshot);
  var totalScore = requireFiniteWinNumber(winStats.totalScore, "WinView totalScore");
  var scoreBgNode = winContent ? winContent.getChildByName("score_bg") : null;
  var rewardItems = getRuntimeWinClearRewardItems(runtimeSnapshot);
  this._setWinValueText(requireWinChild(scoreBgNode, "score_value", "score_bg"), String(totalScore));
  this._renderWinAwardInfo(winContent, rewardItems);
  this._renderWinMaxScoreStamp(scoreBgNode, runtimeSnapshot);

  var starRating = resolveWinStarRating(this.currentLevelConfig, runtimeSnapshot);
  this._renderWinStars(winContent, starRating);
  if (!wasActive) {
    this._playWinPopupOpenAnimation(winContent, starRating);
  }

  var levelBgNode = winContent ? winContent.getChildByName("level_bg") : null;
  var currentLevelNode = levelBgNode
    ? levelBgNode.getChildByName("cur_level")
    : (winContent ? winContent.getChildByName("cur_level") : null);
  this._setWinValueText(currentLevelNode, resolveWinLevelDisplayText(this.currentLevelConfig));

  var closeButtonNode = winContent ? winContent.getChildByName("btn_close") : null;
  if (!closeButtonNode && winView) {
    closeButtonNode = winView.getChildByName("btn_close");
  }
  this._bindWinButton(closeButtonNode, "back");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_next") : null, "next");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_retry") : null, "retry");
  this._bindWinButton(winContent ? winContent.getChildByName("btn_back") : null, "back");
  var maxScoreNode = scoreBgNode ? requireWinChild(scoreBgNode, "max_score", "score_bg") : null;
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: winView,
    proxyRootName: WIN_VIEW_PROXY_ROOT_NAME,
    excludeRoots: maxScoreNode ? [maxScoreNode] : []
  });
  this.lastWinViewRenderKey = renderKey;
  if (!wasActive) {
    this._notifyResultViewLifecycle("onWinViewShow");
  }
};

LevelRenderer.prototype._renderAddBallTipsView = function (runtimeSnapshot) {
  var existing = this.layers.modal.getChildByName("AddBallTipsView");
  var wasActive = !!(existing && existing.active);
  if (!runtimeSnapshot || runtimeSnapshot.state !== "out_of_shots_add_ball_prompt") {
    if (existing) {
      existing.active = false;
    }
    this.lastAddBallTipsViewRenderKey = "";
    return;
  }

  var renderKey = [
    runtimeSnapshot.state,
    Math.max(0, Math.floor(Number(runtimeSnapshot.remainingShots))),
    this.addBallTipsCoinPresentation ? Math.floor(Number(this.addBallTipsCoinPresentation.cost)) : 0
  ].join("|");
  if (
    existing &&
    existing.active &&
    this.lastAddBallTipsViewRenderKey === renderKey &&
    SpriteProxyLayerHelper.hasAutoProxyTree(existing, ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME)
  ) {
    return;
  }

  var tipsView = existing;
  if (!tipsView) {
    tipsView = this._instantiateOrCreate(PREFAB_PATHS.addBallTipsView, this.layers.modal, "AddBallTipsView");
  }
  if (!tipsView) {
    throw new Error("AddBallTipsView prefab could not be instantiated.");
  }

  tipsView.active = true;
  tipsView.setPosition(0, 0);
  SpriteProxyLayerHelper.destroyProxyRoot(tipsView, ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(tipsView, 200);
  var content = this._ensurePopupContentContainer(tipsView);
  var panel = requireChildNode(content, "Panel", "AddBallTipsView content");
  if (!wasActive) {
    this._playPopupContentOpenAnimation(content);
  }

  var adButtonNode = requireChildNode(panel, "ad_btn", "AddBallTipsView/Panel");
  var adLabelNode = requireChildNode(adButtonNode, "lab", "AddBallTipsView/Panel/ad_btn");
  setRequiredLabelString(adLabelNode, "10", "AddBallTipsView/Panel/ad_btn/lab");
  this._bindAddBallTipsButton(requireChildNode(panel, "btn_close", "AddBallTipsView/Panel"), "close");
  this._bindAddBallTipsButton(adButtonNode, "ad");
  renderAddBallTipsCoinButton(this, panel);
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: tipsView,
    proxyRootName: ADD_BALL_TIPS_VIEW_PROXY_ROOT_NAME
  });
  this.lastAddBallTipsViewRenderKey = renderKey;
};

LevelRenderer.prototype._renderLoseView = function (runtimeSnapshot) {
  var isLoseState = !!(
    runtimeSnapshot &&
    (runtimeSnapshot.state === "lost_danger" || runtimeSnapshot.state === "out_of_shots" || runtimeSnapshot.state === "lost_objective")
  );
  var existing = this.layers.modal.getChildByName("LoseView");
  var wasActive = !!(existing && existing.active);
  if (!isLoseState) {
    if (existing) {
      existing.active = false;
      if (wasActive) {
        this._notifyResultViewLifecycle("onLoseViewHide");
      }
    }
    return;
  }

  var loseView = existing;
  if (!loseView) {
    loseView = this._instantiateOrCreate(PREFAB_PATHS.loseView, this.layers.modal, "LoseView");
  }

  if (!loseView) {
    return;
  }

  loseView.active = true;
  loseView.setPosition(0, 0);
  SpriteProxyLayerHelper.destroyProxyRoot(loseView, LOSE_VIEW_PROXY_ROOT_NAME);
  this._ensurePopupMaskVisible(loseView, 164);
  var loseContent = this._ensurePopupContentContainer(loseView);
  if (!wasActive) {
    this._playPopupContentOpenAnimation(loseContent);
  }

  renderLoseFailureStatus(this, loseContent, runtimeSnapshot);

  var loseRewardEntry = typeof resolveLoseRewardEntry === "function"
    ? resolveLoseRewardEntry(runtimeSnapshot.state)
    : null;
  var canRevive = !!loseRewardEntry;
  renderLoseReviveGain(this, loseContent, this.currentLevelConfig, runtimeSnapshot, canRevive);
  renderLoseCoinButton(this, loseContent, canRevive);
  var adButtonNode = loseContent ? loseContent.getChildByName("btn_ad") : null;
  if (adButtonNode) {
    if (!canRevive) {
      setNodeTreeActive(adButtonNode, false);
    } else if (loseRewardEntry) {
      setNodeTreeActive(adButtonNode, true);
      var videoIconNode = adButtonNode.getChildByName("vido_icon");
      var coinIconNode = adButtonNode.getChildByName("coin");
      var showVideoIcon = !!(this.loseAdPresentation && this.loseAdPresentation.showVideoIcon);
      var showCoinIcon = !!(this.loseAdPresentation && this.loseAdPresentation.showCoinIcon);
      if (showVideoIcon && showCoinIcon) {
        throw new Error("LoseView revive button cannot show video and coin icons at the same time.");
      }
      if (videoIconNode) {
        videoIconNode.active = showVideoIcon;
      }
      if (coinIconNode) {
        coinIconNode.active = showCoinIcon;
      }
      var awardTipsNode = adButtonNode.getChildByName("award_tips");
      var awardTipsLabel = awardTipsNode ? awardTipsNode.getComponent(cc.Label) : null;
      if (awardTipsLabel) {
        awardTipsLabel.string = awardTipsLabel.string || String(loseRewardEntry.awardTips || "");
      }
      this._bindLoseButton(adButtonNode, "ad");
    }
  }

  applyLoseReviveLayout(loseContent, canRevive);

  var loseCloseButtonNode = loseContent ? loseContent.getChildByName("btn_close") : null;
  if (!loseCloseButtonNode && loseView) {
    loseCloseButtonNode = loseView.getChildByName("btn_close");
  }
  this._bindLoseButton(loseCloseButtonNode, "back");
  this._bindLoseButton(loseContent ? loseContent.getChildByName("btn_back") : null, "back");
  SpriteProxyLayerHelper.rebuildAutoProxyTree({
    rootNode: loseView,
    proxyRootName: LOSE_VIEW_PROXY_ROOT_NAME
  });
  if (!wasActive) {
    this._notifyResultViewLifecycle("onLoseViewShow");
  }
};

LevelRenderer.prototype._renderResultPopup = function (runtimeSnapshot) {
  var popup = this._instantiateOrCreate(null, this.layers.modal, "ResultPopup");
  var resultTexts = buildResultTexts(runtimeSnapshot);

  if (!resultTexts) {
    popup.active = false;
    return;
  }

  popup.active = true;
  popup.setPosition(0, 40);

  var bg = getOrCreateChild(popup, "PopupBg");
  var frame = this._getWhiteSpriteFrameForSize(1, 1);
  if (frame) {
    ensureSprite(bg, frame);
    bg.setContentSize(new cc.Size(540, 320));
    bg.opacity = 215;
  }

  var title = getOrCreateChild(popup, "Title");
  title.setPosition(0, 50);
  title.color = cc.color(255, 255, 255);
  ensureLabel(title, resultTexts.title, 54, 58);
  ensureOutline(title, cc.color(83, 109, 138), 4);

  var subtitle = getOrCreateChild(popup, "Subtitle");
  subtitle.setPosition(0, -20);
  subtitle.color = cc.color(255, 250, 235);
  ensureLabel(subtitle, resultTexts.subtitle, 28, 34);
  ensureOutline(subtitle, cc.color(83, 109, 138), 3);

  var detail = getOrCreateChild(popup, "Detail");
  detail.setPosition(0, -95);
  detail.color = cc.color(255, 250, 235);
  ensureLabel(detail, resultTexts.detail, 24, 30);
  ensureOutline(detail, cc.color(83, 109, 138), 2);
};
}

module.exports = attachLevelRendererScenePopupMethods;
module.exports.buildLoseRevivePresentation = buildLoseRevivePresentation;

},{"./LevelRendererSceneShared":"LevelRendererSceneShared"}],
"LevelRendererSceneScaffoldMethods":[function(require,module,exports){
"use strict";

var BundleLoader = require("../../assets/scripts/utils/BundleLoader");
var SceneShared = require("./LevelRendererSceneShared");

function attachLevelRendererSceneScaffoldMethods(LevelRenderer, deps) {
  var BoardLayout = deps.BoardLayout;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var requireChildNode = SceneShared.requireChildNode;
  var GAME_ENTRY_COUNTDOWN_STEP_INTERVAL = 1;
  var GAME_ENTRY_GO_SCALE_DURATION = 0.3;
  var GAME_ENTRY_GO_HOLD_DURATION = 0.2;
  var GAME_ENTRY_GO_START_SCALE = 0.2;
  var GAME_ENTRY_GO_END_SCALE = 1.2;
  var GAME_ENTRY_COUNTDOWN_MASK_NAME = "GameEntryCountdownMask";
  var GAME_ENTRY_COUNTDOWN_MASK_OPACITY = 80;
  var GAME_ENTRY_COUNTDOWN_MASK_Z_INDEX = 900;
  var GAME_ENTRY_COUNTDOWN_TIMER_Z_INDEX = 901;
  var GAME_ENTRY_COUNTDOWN_GO_Z_INDEX = 902;
  var GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY = "__gameEntryCountdownLayerState";

function requirePositiveContentSize(size, description) {
  if (
    !size ||
    typeof size.width !== "number" ||
    typeof size.height !== "number" ||
    !isFinite(size.width) ||
    !isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error(description + " requires positive content size.");
  }
}

LevelRenderer.prototype._ensureGameViewPrefabReady = function () {
  return this.prefabFactory.load(PREFAB_PATHS.gameView);
};

LevelRenderer.prototype._mountGameViewScaffold = function () {
  if (!this.layers) {
    throw new Error("Gameplay layers are required before mounting GameView scaffold.");
  }

  var gameViewNode = this.prefabFactory.instantiate(PREFAB_PATHS.gameView, this.layers.hud, "GameView");
  if (!gameViewNode) {
    throw new Error("GameView prefab must be preloaded before mount: " + PREFAB_PATHS.gameView);
  }
  gameViewNode.setPosition(0, 0);
  gameViewNode.active = true;

  var mountedBgNode = this._moveGameViewChildToLayer(gameViewNode, "bg", this.layers.background, "bg");
  var mountedDangerLineNode = this._moveGameViewChildToLayer(gameViewNode, "DangerLine", this.layers.dangerLine, "DangerLine");
  mountedDangerLineNode.active = false;
  var mountedBottomPanelNode = this._moveGameViewChildToLayer(gameViewNode, "BttomPanel", this.layers.hud, "BttomPanel");
  this._flushGameViewScaffoldLayout([
    gameViewNode,
    mountedBgNode,
    mountedDangerLineNode,
    mountedBottomPanelNode
  ]);
};

LevelRenderer.prototype.prepareForLevelSelectReturn = function () {
  this._ensureLayers();
  this.lightningChainRenderer.reset("level_select_return");
  if (typeof this._cancelSkillPowerupCollectedFeedback !== "function") {
    throw new Error("Level select return requires collected skill powerup feedback cleanup.");
  }
  this._cancelSkillPowerupCollectedFeedback();
  if (typeof this._stopBoardClearFireworks === "function") {
    this._stopBoardClearFireworks("level_select_return");
  }
  if (this.layers && this.layers.hud && this.layers.hud.isValid) {
    var gameViewNode = this.layers.hud.getChildByName("GameView");
    if (gameViewNode && gameViewNode.isValid) {
      gameViewNode.stopAllActions();
      gameViewNode.__gameEntryCountdownActive = false;
      var countdownLayerState = gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY];
      var timerNode = countdownLayerState ? countdownLayerState.timerNode : gameViewNode.getChildByName("timer");
      if (timerNode && timerNode.isValid) {
        timerNode.stopAllActions();
      }
      var goNode = countdownLayerState ? countdownLayerState.goNode : gameViewNode.getChildByName("go");
      if (goNode && goNode.isValid) {
        goNode.stopAllActions();
      }
      this._destroyGameEntryCountdownMask(gameViewNode);
      this._restoreGameEntryCountdownNodes(gameViewNode);
    }
  }
};

LevelRenderer.prototype._createGameEntryCountdownMask = function (gameViewNode, timerNode, goNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown mask requires GameView.");
  }
  if (!timerNode || !timerNode.isValid) {
    throw new Error("Game entry countdown mask requires timer node.");
  }
  if (!goNode || !goNode.isValid) {
    throw new Error("Game entry countdown mask requires go node.");
  }
  if (!this.layers || !this.layers.hud || !this.layers.hud.isValid) {
    throw new Error("Game entry countdown mask requires HUD layer.");
  }
  if (!this.rootNode || !this.rootNode.isValid || typeof this.rootNode.getContentSize !== "function") {
    throw new Error("Game entry countdown mask requires root node content size.");
  }
  if (typeof cc.Graphics !== "function") {
    throw new Error("Game entry countdown mask requires cc.Graphics.");
  }
  if (this.layers.hud.getChildByName(GAME_ENTRY_COUNTDOWN_MASK_NAME)) {
    throw new Error("Game entry countdown mask is already mounted.");
  }

  var rootSize = this.rootNode.getContentSize();
  requirePositiveContentSize(rootSize, "Game entry countdown mask");

  var maskNode = new cc.Node(GAME_ENTRY_COUNTDOWN_MASK_NAME);
  maskNode.parent = this.layers.hud;
  maskNode.setContentSize(rootSize);
  maskNode.setPosition(0, 0);
  maskNode.opacity = GAME_ENTRY_COUNTDOWN_MASK_OPACITY;
  maskNode.zIndex = GAME_ENTRY_COUNTDOWN_MASK_Z_INDEX;

  var graphics = maskNode.addComponent(cc.Graphics);
  graphics.fillColor = cc.color(0, 0, 0, GAME_ENTRY_COUNTDOWN_MASK_OPACITY);
  graphics.rect(-rootSize.width * 0.5, -rootSize.height * 0.5, rootSize.width, rootSize.height);
  graphics.fill();
};

LevelRenderer.prototype._promoteGameEntryCountdownNodes = function (gameViewNode, timerNode, goNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown node promotion requires GameView.");
  }
  if (!timerNode || !timerNode.isValid) {
    throw new Error("Game entry countdown node promotion requires timer node.");
  }
  if (!goNode || !goNode.isValid) {
    throw new Error("Game entry countdown node promotion requires go node.");
  }
  if (!this.layers || !this.layers.hud || !this.layers.hud.isValid) {
    throw new Error("Game entry countdown node promotion requires HUD layer.");
  }
  if (gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY]) {
    throw new Error("Game entry countdown nodes are already promoted.");
  }

  gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY] = {
    timerNode: timerNode,
    timerParent: timerNode.parent,
    timerX: timerNode.x,
    timerY: timerNode.y,
    timerZIndex: timerNode.zIndex,
    goNode: goNode,
    goParent: goNode.parent,
    goX: goNode.x,
    goY: goNode.y,
    goZIndex: goNode.zIndex
  };

  var timerWorldPosition = timerNode.convertToWorldSpaceAR(cc.v2(0, 0));
  var goWorldPosition = goNode.convertToWorldSpaceAR(cc.v2(0, 0));
  timerNode.parent = this.layers.hud;
  timerNode.setPosition(this.layers.hud.convertToNodeSpaceAR(timerWorldPosition));
  timerNode.zIndex = GAME_ENTRY_COUNTDOWN_TIMER_Z_INDEX;
  goNode.parent = this.layers.hud;
  goNode.setPosition(this.layers.hud.convertToNodeSpaceAR(goWorldPosition));
  goNode.zIndex = GAME_ENTRY_COUNTDOWN_GO_Z_INDEX;
};

LevelRenderer.prototype._restoreGameEntryCountdownNodes = function (gameViewNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown node restore requires GameView.");
  }

  var state = gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY];
  if (state) {
    if (!state.timerParent || !state.timerParent.isValid) {
      throw new Error("Game entry countdown timer original parent is invalid.");
    }
    if (!state.goParent || !state.goParent.isValid) {
      throw new Error("Game entry countdown go original parent is invalid.");
    }
    if (!state.timerNode || !state.timerNode.isValid) {
      throw new Error("Game entry countdown timer node is invalid during restore.");
    }
    if (!state.goNode || !state.goNode.isValid) {
      throw new Error("Game entry countdown go node is invalid during restore.");
    }

    state.timerNode.parent = state.timerParent;
    state.timerNode.setPosition(state.timerX, state.timerY);
    state.timerNode.zIndex = state.timerZIndex;
    state.goNode.parent = state.goParent;
    state.goNode.setPosition(state.goX, state.goY);
    state.goNode.zIndex = state.goZIndex;
    delete gameViewNode[GAME_ENTRY_COUNTDOWN_LAYER_STATE_KEY];
  }
};

LevelRenderer.prototype._destroyGameEntryCountdownMask = function (gameViewNode) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown mask cleanup requires GameView.");
  }

  if (!this.layers || !this.layers.hud || !this.layers.hud.isValid) {
    throw new Error("Game entry countdown mask cleanup requires HUD layer.");
  }

  var maskNode = this.layers.hud.getChildByName(GAME_ENTRY_COUNTDOWN_MASK_NAME);
  if (maskNode && maskNode.isValid) {
    maskNode.removeFromParent(false);
    maskNode.destroy();
  }
};

LevelRenderer.prototype.playGameEntryCountdown = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("Game entry countdown requires GameView.");
  }

  var timerNode = requireChildNode(gameViewNode, "timer", "GameView");
  var timerLabel = timerNode.getComponent(cc.Label);
  if (!timerLabel) {
    throw new Error("GameView/timer requires cc.Label.");
  }
  var goNode = requireChildNode(gameViewNode, "go", "GameView");
  if (!goNode.getComponent(cc.Sprite)) {
    throw new Error("GameView/go requires cc.Sprite.");
  }
  if (
    typeof cc.sequence !== "function" ||
    typeof cc.spawn !== "function" ||
    typeof cc.callFunc !== "function" ||
    typeof cc.delayTime !== "function" ||
    typeof cc.scaleTo !== "function" ||
    typeof cc.fadeTo !== "function"
  ) {
    throw new Error("Game entry countdown requires Cocos action APIs.");
  }
  if (gameViewNode.__gameEntryCountdownActive === true) {
    throw new Error("Game entry countdown is already active.");
  }

  timerNode.stopAllActions();
  goNode.stopAllActions();
  this._createGameEntryCountdownMask(gameViewNode, timerNode, goNode);
  this._promoteGameEntryCountdownNodes(gameViewNode, timerNode, goNode);
  gameViewNode.__gameEntryCountdownActive = true;
  var self = this;
  timerNode.active = true;
  timerNode.opacity = 255;
  timerLabel.string = "3";
  goNode.active = false;
  goNode.opacity = 0;
  goNode.setScale(GAME_ENTRY_GO_START_SCALE);

  return new Promise(function (resolve) {
    gameViewNode.runAction(cc.sequence(
      cc.delayTime(GAME_ENTRY_COUNTDOWN_STEP_INTERVAL),
      cc.callFunc(function () {
        timerLabel.string = "2";
      }),
      cc.delayTime(GAME_ENTRY_COUNTDOWN_STEP_INTERVAL),
      cc.callFunc(function () {
        timerLabel.string = "1";
      }),
      cc.delayTime(GAME_ENTRY_COUNTDOWN_STEP_INTERVAL),
      cc.callFunc(function () {
        timerNode.active = false;
        goNode.active = true;
        goNode.opacity = 0;
        goNode.setScale(GAME_ENTRY_GO_START_SCALE);
        goNode.runAction(cc.sequence(
          cc.spawn(
            cc.scaleTo(GAME_ENTRY_GO_SCALE_DURATION, GAME_ENTRY_GO_END_SCALE),
            cc.fadeTo(GAME_ENTRY_GO_SCALE_DURATION, 255)
          ),
          cc.delayTime(GAME_ENTRY_GO_HOLD_DURATION),
          cc.callFunc(function () {
            goNode.active = false;
            self._destroyGameEntryCountdownMask(gameViewNode);
            self._restoreGameEntryCountdownNodes(gameViewNode);
            gameViewNode.__gameEntryCountdownActive = false;
            resolve();
          })
        ));
      })
    ));
  });
};

LevelRenderer.prototype.syncBoardLayoutHudBottomLineAsync = function () {
  var self = this;
  this._ensureLayers();
  return BundleLoader.ensureGameplayBundleLoaded().then(function () {
    return self._ensureGameViewPrefabReady();
  }).then(function () {
    self.syncBoardLayoutHudBottomLine();
  });
};

LevelRenderer.prototype.syncBoardLayoutHudBottomLine = function () {
  this._ensureLayers();
  var gameViewNode = this.layers.hud.getChildByName("GameView");
  if (!gameViewNode || !gameViewNode.isValid) {
    this._mountGameViewScaffold();
    gameViewNode = this.layers.hud.getChildByName("GameView");
  }
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView is required before syncing HudPanel bottom line.");
  }
  var hudPanelNode = gameViewNode.getChildByName("HudPanel");
  if (!hudPanelNode || !hudPanelNode.isValid) {
    throw new Error("GameView requires HudPanel before syncing board viewport HUD boundary.");
  }
  this._flushGameViewScaffoldLayout([gameViewNode, hudPanelNode]);
  BoardLayout.syncHudBottomLineYFromHudPanel(hudPanelNode, this.layers.board);
  if (this._fairyAssistSystem) {
    this.syncFairyAssistCollisionCenters();
  }
};

LevelRenderer.prototype._moveGameViewChildToLayer = function (gameViewNode, childName, targetLayer, targetName) {
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required before moving child: " + childName);
  }
  if (!targetLayer || !targetLayer.isValid) {
    throw new Error("GameView child target layer is required: " + childName);
  }

  var child = gameViewNode.getChildByName(childName);
  if (!child || !child.isValid) {
    throw new Error("GameView requires child node: " + childName);
  }

  child.removeFromParent(false);
  child.name = targetName || childName;
  child.parent = targetLayer;
  child.active = true;
  return child;
};

LevelRenderer.prototype._flushGameViewScaffoldLayout = function (nodes) {
  if (!Array.isArray(nodes)) {
    throw new Error("GameView scaffold layout nodes must be an array.");
  }

  nodes.forEach(function (node) {
    if (!node || !node.isValid) {
      throw new Error("GameView scaffold layout node is invalid.");
    }

    var safeArea = node.getComponent(cc.SafeArea);
    if (safeArea && safeArea.enabled && typeof safeArea.updateArea === "function") {
      safeArea.updateArea();
    }

    var widget = node.getComponent(cc.Widget);
    if (widget && widget.enabled && typeof widget.updateAlignment === "function") {
      widget.updateAlignment();
    }
  });
};

LevelRenderer.prototype._renderBackground = function () {
  var mountedBgNode = this.layers && this.layers.background
    ? (this.layers.background.getChildByName("bg") || this.layers.background.getChildByName("Background"))
    : null;
  if (mountedBgNode) {
    mountedBgNode.active = true;
    return;
  }

  var sceneBgNode = this.rootNode
    ? (this.rootNode.getChildByName("bg") || this.rootNode.getChildByName("Bg"))
    : null;
  var runtimeBgNode = this.layers && this.layers.background
    ? this.layers.background.getChildByName("Background")
    : null;
  if (sceneBgNode) {
    sceneBgNode.active = true;
    if (runtimeBgNode) {
      runtimeBgNode.active = false;
    }
    return;
  }

  throw new Error("Game background node is required. Mount GameView prefab with static bg sprite.");
};

LevelRenderer.prototype._getMountedBgNode = function () {
  if (!this.layers || !this.layers.background) {
    throw new Error("Background layer is required.");
  }

  var bgNode = this.layers.background.getChildByName("bg");
  if (!bgNode || !bgNode.isValid) {
    throw new Error("Mounted GameView bg node is required.");
  }

  return bgNode;
};

LevelRenderer.prototype._resolveMainlandNode = function () {
  var mainlandNode = this._getMountedBgNode().getChildByName("mainland");
  if (!mainlandNode || !mainlandNode.isValid) {
    throw new Error("GameView bg/mainland node is required.");
  }

  return mainlandNode;
};

LevelRenderer.prototype._resolveTopRowBubbleVisualTopY = function (boardSnapshot) {
  if (!boardSnapshot || typeof boardSnapshot !== "object" || Array.isArray(boardSnapshot)) {
    throw new Error("Top row bubble visual top requires board snapshot.");
  }
  if (typeof boardSnapshot.topAttachY !== "number" || !isFinite(boardSnapshot.topAttachY)) {
    throw new Error("Board snapshot topAttachY must be a finite number.");
  }
  if (typeof boardSnapshot.viewportOffsetY !== "number" || !isFinite(boardSnapshot.viewportOffsetY)) {
    throw new Error("Board snapshot viewportOffsetY must be a finite number.");
  }
  if (!Array.isArray(boardSnapshot.cells)) {
    throw new Error("Board snapshot cells must be an array.");
  }
  if (typeof boardSnapshot.maxColumns !== "number" || !isFinite(boardSnapshot.maxColumns) || boardSnapshot.maxColumns <= 0) {
    throw new Error("Board snapshot maxColumns must be a positive finite number.");
  }

  var bubbleRadius = Number(BoardLayout.bubbleRadius);
  if (!isFinite(bubbleRadius) || bubbleRadius <= 0) {
    throw new Error("BoardLayout.bubbleRadius must be a positive finite number.");
  }

  var topRow = null;
  boardSnapshot.cells.forEach(function (cell) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Board snapshot cell entry must be an object.");
    }
    var row = Math.floor(Number(cell.row));
    if (!Number.isInteger(row) || row < 0) {
      throw new Error("Board snapshot cell row must be a non-negative integer.");
    }
    if (cell.entityCategory === "reactive_ball" && cell.entityType === "wormhole") {
      return;
    }
    if (topRow === null || row < topRow) {
      topRow = row;
    }
  });

  if (topRow === null) {
    return boardSnapshot.topAttachY + bubbleRadius;
  }

  var topRowCenter = BoardLayout.getCellPosition(
    topRow,
    0,
    boardSnapshot.maxColumns,
    boardSnapshot.viewportOffsetY
  );
  return topRowCenter.y + bubbleRadius;
};

LevelRenderer.prototype._alignNodeYToTopRowBubbleVisualTop = function (node, localSpaceRoot, boardSnapshot) {
  if (!node || !node.isValid) {
    throw new Error("Top row bubble alignment requires a valid target node.");
  }
  if (!localSpaceRoot || !localSpaceRoot.isValid) {
    throw new Error("Top row bubble alignment requires a valid local space root node.");
  }
  if (!this.layers || !this.layers.board || !this.layers.board.isValid) {
    throw new Error("Board layer is required for top row bubble alignment.");
  }

  var topRowVisualTopY = this._resolveTopRowBubbleVisualTopY(boardSnapshot);
  var boardTopWorld = this.layers.board.convertToWorldSpaceAR(cc.v2(0, topRowVisualTopY));
  var anchorPosInLocal = localSpaceRoot.convertToNodeSpaceAR(boardTopWorld);
  node.active = true;
  node.setPosition(node.x, anchorPosInLocal.y);
};

LevelRenderer.prototype._renderMainland = function (boardSnapshot) {
  var mainlandNode = this._resolveMainlandNode();
  var bgNode = mainlandNode.parent;
  if (!bgNode || !bgNode.isValid) {
    throw new Error("Mainland parent bg node is required.");
  }

  this._alignNodeYToTopRowBubbleVisualTop(mainlandNode, bgNode, boardSnapshot);
};

LevelRenderer.prototype._resolveJianbianNode = function () {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for jianbian alignment.");
  }

  var jianbianNode = gameViewNode.getChildByName("jianbian");
  if (!jianbianNode || !jianbianNode.isValid) {
    throw new Error("GameView/jianbian node is required.");
  }

  return jianbianNode;
};

LevelRenderer.prototype._renderJianbian = function (boardSnapshot) {
  var gameViewNode = this._getGameViewNode();
  if (!gameViewNode || !gameViewNode.isValid) {
    throw new Error("GameView node is required for jianbian alignment.");
  }

  var jianbianNode = this._resolveJianbianNode();
  this._alignNodeYToTopRowBubbleVisualTop(jianbianNode, gameViewNode, boardSnapshot);
};
}

module.exports = attachLevelRendererSceneScaffoldMethods;

},{"../../assets/scripts/utils/BundleLoader":"BundleLoader","./LevelRendererSceneShared":"LevelRendererSceneShared"}],
"LevelRendererSceneShared":[function(require,module,exports){
"use strict";

function requireChildNode(parentNode, childName, parentDescription) {
  if (!parentNode || !parentNode.isValid) {
    throw new Error(parentDescription + " is required.");
  }
  var childNode = parentNode.getChildByName(childName);
  if (!childNode || !childNode.isValid) {
    throw new Error(parentDescription + "/" + childName + " is required.");
  }
  return childNode;
}

function requireLabelComponent(node, description) {
  if (!node || !node.isValid) {
    throw new Error(description + " is required.");
  }
  var label = node.getComponent(cc.Label);
  if (!label) {
    throw new Error(description + " requires cc.Label.");
  }
  return label;
}

function setRequiredLabelString(node, value, description) {
  var label = requireLabelComponent(node, description);
  label.string = String(value);
}

module.exports = {
  requireChildNode: requireChildNode,
  requireLabelComponent: requireLabelComponent,
  setRequiredLabelString: setRequiredLabelString
};

},{}],
"LevelRendererSceneShooterMethods":[function(require,module,exports){
"use strict";

var SceneShared = require("./LevelRendererSceneShared");

function attachLevelRendererSceneShooterMethods(LevelRenderer, deps) {
  var requireChildNode = SceneShared.requireChildNode;
  var BoardLayout = deps.BoardLayout;
  var BALL_RESOURCES = deps.BALL_RESOURCES;
  var PREFAB_PATHS = deps.PREFAB_PATHS;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var NEXT_SHOT_BUBBLE_SIZE = deps.NEXT_SHOT_BUBBLE_SIZE;
  var GUIDE_DOT_SPACING = deps.GUIDE_DOT_SPACING;
  var GUIDE_DOT_RADIUS = deps.GUIDE_DOT_RADIUS;
  var GUIDE_DOT_SIZE = deps.GUIDE_DOT_SIZE;
  var GUIDE_DOT_FAR_SCALE = deps.GUIDE_DOT_FAR_SCALE;
  var GUIDE_DOT_MAX_COUNT = deps.GUIDE_DOT_MAX_COUNT;
  var GUIDE_DOT_MIN_SCALE = deps.GUIDE_DOT_MIN_SCALE;
  var GUIDE_DOT_MAX_SCALE = deps.GUIDE_DOT_MAX_SCALE;
  var GUIDE_DOT_SPRITE_PATH = deps.GUIDE_DOT_SPRITE_PATH;
  var GUIDE_DOT_TINTS = deps.GUIDE_DOT_TINTS;
  var ROUTE_LINE_WIDTH_ACTIVE = deps.ROUTE_LINE_WIDTH_ACTIVE;
  var ROUTE_LINE_WIDTH_IDLE = deps.ROUTE_LINE_WIDTH_IDLE;
  var ROUTE_POINT_RADIUS_ACTIVE = deps.ROUTE_POINT_RADIUS_ACTIVE;
  var ROUTE_POINT_RADIUS_IDLE = deps.ROUTE_POINT_RADIUS_IDLE;
  var computeShooterAngle = deps.computeShooterAngle;
  var createRouteColor = deps.createRouteColor;
  var buildGuidePathKey = deps.buildGuidePathKey;
  var clipGuidePathToDistance = deps.clipGuidePathToDistance;
  var resolveGuideFrontClipDistance = deps.resolveGuideFrontClipDistance;
  var resolveBallVisualKey = deps.resolveBallVisualKey;
  var getOrCreateChild = deps.getOrCreateChild;
  var clearChildren = deps.clearChildren;
  var ensureLabel = deps.ensureLabel;
  var ensureOutline = deps.ensureOutline;
  var SHOOTER_HANDOFF_DURATION = 0.34;
  var SHOOTER_HANDOFF_ARC_HEIGHT = 52;
  var SHOOTER_AIM_RECENTER_DURATION = 0.28;
  var SHOOTER_HERO_NODE_NAME = "handler_milu";
  var SHOOTER_HERO_IDLE_CLIP_NAME = "genius_hero_idle";
  var SHOOTER_HERO_FIRE_CLIP_NAME = "genius_hero_pao";
  var SHOOTER_PREFAB_LAYOUT_NODE_NAMES = [
    SHOOTER_HERO_NODE_NAME,
    "CurrentBallAnchor",
    "ChangeBtn",
    "Shooter",
    "ShooterBase",
    "NextBallDock",
    "NextBallAnchor",
    "TurretNumBg",
    "Surplus"
  ];

  function syncShooterPrefabLayout(shooterPanel, aimOrigin) {
    if (
      !aimOrigin ||
      typeof aimOrigin.x !== "number" ||
      !isFinite(aimOrigin.x) ||
      typeof aimOrigin.y !== "number" ||
      !isFinite(aimOrigin.y)
    ) {
      throw new Error("ShooterPanel layout requires a finite aim origin.");
    }

    var layoutNodes = {};
    SHOOTER_PREFAB_LAYOUT_NODE_NAMES.forEach(function (nodeName) {
      layoutNodes[nodeName] = requireChildNode(shooterPanel, nodeName, "ShooterPanel");
    });

    if (!shooterPanel.__shooterPrefabRelativeLayout) {
      var prefabOriginNode = layoutNodes.CurrentBallAnchor;
      var prefabOriginX = prefabOriginNode.x;
      var prefabOriginY = prefabOriginNode.y;
      if (
        typeof prefabOriginX !== "number" ||
        !isFinite(prefabOriginX) ||
        typeof prefabOriginY !== "number" ||
        !isFinite(prefabOriginY)
      ) {
        throw new Error("ShooterPanel/CurrentBallAnchor prefab position must be finite.");
      }

      shooterPanel.__shooterPrefabRelativeLayout = {};
      SHOOTER_PREFAB_LAYOUT_NODE_NAMES.forEach(function (nodeName) {
        var node = layoutNodes[nodeName];
        if (
          typeof node.x !== "number" ||
          !isFinite(node.x) ||
          typeof node.y !== "number" ||
          !isFinite(node.y)
        ) {
          throw new Error("ShooterPanel/" + nodeName + " prefab position must be finite.");
        }
        shooterPanel.__shooterPrefabRelativeLayout[nodeName] = {
          x: node.x - prefabOriginX,
          y: node.y - prefabOriginY
        };
      });
    }

    SHOOTER_PREFAB_LAYOUT_NODE_NAMES.forEach(function (nodeName) {
      var relativePosition = shooterPanel.__shooterPrefabRelativeLayout[nodeName];
      if (!relativePosition) {
        throw new Error("ShooterPanel prefab relative layout is missing " + nodeName + ".");
      }
      layoutNodes[nodeName].setPosition(
        aimOrigin.x + relativePosition.x,
        aimOrigin.y + relativePosition.y
      );
    });

    return layoutNodes;
  }

  function requireShooterHeroAnimation(heroNode) {
    if (!heroNode || !heroNode.isValid) {
      throw new Error("Shooter hero animation requires " + SHOOTER_HERO_NODE_NAME + " node.");
    }
    var animation = heroNode.getComponent(cc.Animation);
    if (!animation) {
      throw new Error("Shooter hero animation requires cc.Animation on " + SHOOTER_HERO_NODE_NAME + ".");
    }
    if (typeof animation.getClips !== "function") {
      throw new Error("Shooter hero animation requires getClips API.");
    }
    return animation;
  }

  function requireShooterHeroClip(animation, clipName) {
    var clips = animation.getClips();
    if (!Array.isArray(clips) || clips.length <= 0) {
      throw new Error("Shooter hero animation requires clips.");
    }
    for (var i = 0; i < clips.length; i += 1) {
      if (clips[i] && clips[i].name === clipName) {
        return clips[i];
      }
    }
    throw new Error("Shooter hero animation clip is missing: " + clipName + ".");
  }

  function playShooterHeroClip(heroNode, clipName, onFinished) {
    var animation = requireShooterHeroAnimation(heroNode);
    var clip = requireShooterHeroClip(animation, clipName);
    if (!onFinished && heroNode.__shooterHeroPlayingClip === clipName) {
      return clip;
    }

    var previousToken = typeof heroNode.__shooterHeroAnimationToken === "number"
      ? heroNode.__shooterHeroAnimationToken
      : 0;
    heroNode.__shooterHeroAnimationToken = previousToken + 1;
    var token = heroNode.__shooterHeroAnimationToken;
    heroNode.__shooterHeroPlayingClip = clipName;

    if (onFinished) {
      if (typeof animation.once !== "function") {
        throw new Error("Shooter hero animation requires once API.");
      }
      animation.once("finished", function () {
        if (heroNode.__shooterHeroAnimationToken === token) {
          onFinished();
        }
      });
    }
    animation.play(clip.name);
    return clip;
  }

  function playShooterHeroIdle(heroNode) {
    return playShooterHeroClip(heroNode, SHOOTER_HERO_IDLE_CLIP_NAME, null);
  }

  function resolveFiniteRemainingShots(remainingShots, shooterSnapshot, description) {
    if (shooterSnapshot && shooterSnapshot.infiniteShots) {
      return null;
    }
    if (!Number.isInteger(remainingShots) || remainingShots < 0) {
      throw new Error(description + " requires a non-negative integer remainingShots.");
    }
    return remainingShots;
  }
  var RAINBOW_COLOR_SELECTOR_BUTTON_SIZE = 72;
  var RAINBOW_COLOR_SELECTOR_RADIUS = 142;
  var RAINBOW_COLOR_SELECTOR_ANGLE_STEP = 35;
  var RAINBOW_COLOR_SELECTOR_MAX_SPREAD = 140;

LevelRenderer.prototype._renderRainbowColorSelector = function (shooterPanel, shooterSnapshot, aim) {
  var selectorNode = getOrCreateChild(shooterPanel, "RainbowColorSelector");
  var selection = shooterSnapshot && shooterSnapshot.pendingRainbowColorSelection
    ? shooterSnapshot.pendingRainbowColorSelection
    : null;
  if (!selection) {
    selectorNode.active = false;
    return;
  }

  var colors = Array.isArray(selection.colors) ? selection.colors.slice() : [];
  if (!colors.length) {
    throw new Error("Rainbow color selector requires colors.");
  }

  selectorNode.active = true;
  selectorNode.zIndex = 80;
  var originX = aim.origin.x;
  var originY = aim.origin.y;
  var selectorKey = colors.join("|") + "@" + Math.round(originX) + ":" + Math.round(originY);
  var shouldAnimate = selectorNode.__selectorKey !== selectorKey;
  selectorNode.__selectorKey = selectorKey;

  var buttonSize = new cc.Size(RAINBOW_COLOR_SELECTOR_BUTTON_SIZE, RAINBOW_COLOR_SELECTOR_BUTTON_SIZE);
  var radius = RAINBOW_COLOR_SELECTOR_RADIUS;
  var spread = Math.min(
    RAINBOW_COLOR_SELECTOR_MAX_SPREAD,
    Math.max(0, (colors.length - 1) * RAINBOW_COLOR_SELECTOR_ANGLE_STEP)
  );
  var startAngle = 90 + spread * 0.5;

  colors.forEach(function (colorCode, index) {
    if (!BALL_RESOURCES[colorCode]) {
      throw new Error("Rainbow color selector missing ball resource: " + colorCode);
    }

    var buttonNode = getOrCreateChild(selectorNode, "RainbowColor_" + colorCode);
    buttonNode.active = true;
    buttonNode.zIndex = index + 1;
    buttonNode.setContentSize(buttonSize);
    buttonNode.setScale(1);
    buttonNode.opacity = 255;
    if (!buttonNode.getComponent(cc.Button)) {
      buttonNode.addComponent(cc.Button);
    }
    this._applyBallVisualCached(buttonNode, colorCode, buttonSize);
    this._bindBottomPanelButton(buttonNode, "select_rainbow_color:" + colorCode);

    var angle = colors.length === 1 ? 90 : startAngle - (spread * index / (colors.length - 1));
    var radians = angle * Math.PI / 180;
    var targetX = originX + Math.cos(radians) * radius;
    var targetY = originY + Math.sin(radians) * radius;

    if (shouldAnimate || buttonNode.__rainbowTargetKey !== selectorKey) {
      buttonNode.stopAllActions();
      buttonNode.setPosition(originX, originY);
      buttonNode.setScale(0.35);
      buttonNode.opacity = 0;
      buttonNode.runAction(cc.sequence(
        cc.delayTime(index * 0.035),
        cc.spawn(
          cc.moveTo(0.18, targetX, targetY),
          cc.scaleTo(0.18, 1),
          cc.fadeTo(0.12, 255)
        )
      ));
      buttonNode.__rainbowTargetKey = selectorKey;
    } else {
      buttonNode.setPosition(targetX, targetY);
    }
  }, this);

  selectorNode.children.slice().forEach(function (child) {
    if (child.name.indexOf("RainbowColor_") === 0) {
      var colorCode = child.name.slice("RainbowColor_".length);
      child.active = colors.indexOf(colorCode) !== -1;
    }
  });
};

LevelRenderer.prototype.isShooterHandoffInProgress = function () {
  if (!this.layers || !this.layers.shooter) {
    return false;
  }
  var shooterPanel = this.layers.shooter.getChildByName("ShooterPanel");
  if (!shooterPanel) {
    return false;
  }
  return shooterPanel.__shooterHandoffInProgress === true;
};

LevelRenderer.prototype._renderShooter = function (shooterSnapshot, activeProjectile, remainingShots) {
  var shooterPanel = this.layers.shooter.getChildByName("ShooterPanel");
  if (!shooterPanel) {
    shooterPanel = this._instantiateOrCreate(PREFAB_PATHS.shooterPanel, this.layers.shooter, "ShooterPanel");
  }

  var aim = shooterSnapshot && shooterSnapshot.aim
    ? shooterSnapshot.aim
    : { origin: BoardLayout.shooterOrigin, direction: { x: 0, y: 1 } };
  var layoutNodes = syncShooterPrefabLayout(shooterPanel, aim.origin);
  var finiteRemainingShots = resolveFiniteRemainingShots(
    remainingShots,
    shooterSnapshot,
    "Shooter render"
  );
  this._syncShooterAimRecenter(
    shooterPanel,
    layoutNodes.Shooter,
    shooterSnapshot,
    activeProjectile,
    computeShooterAngle(aim.direction)
  );
  this._syncShooterHeroAnimation(
    shooterPanel,
    layoutNodes[SHOOTER_HERO_NODE_NAME],
    shooterSnapshot,
    activeProjectile,
    finiteRemainingShots
  );

  var trajectory = shooterSnapshot.trajectory;
  var canUsePowerup = !!(shooterSnapshot && shooterSnapshot.canUsePowerups);
  var pendingBarrierHammer = !!(shooterSnapshot && shooterSnapshot.pendingBarrierHammer);
  var shooterInventory = shooterSnapshot && shooterSnapshot.skillInventory
    ? shooterSnapshot.skillInventory
    : {};
  var swapCount = Math.max(0, Math.floor(Number(shooterInventory.swap) || 0));
  var currentAnchor = layoutNodes.CurrentBallAnchor;
  currentAnchor.setScale(1);
  var currentBallLike = shooterSnapshot.currentBall || shooterSnapshot.currentColor;
  currentAnchor.active = !!currentBallLike;
  if (currentAnchor.active) {
    this._applyBallVisualCached(currentAnchor, currentBallLike, BOARD_BUBBLE_SIZE);
  }
  this._renderRainbowColorSelector(shooterPanel, shooterSnapshot, aim);

  var changeButtonNode = layoutNodes.ChangeBtn;
  var hasSwapInventory = swapCount > 0;
  changeButtonNode.active = hasSwapInventory;
  this._setShooterChangeButtonSpin(changeButtonNode, hasSwapInventory);
  if (hasSwapInventory) {
    this._bindBottomPanelButton(changeButtonNode, "use_swap");
    this._setBottomPanelButtonEnabled(
      changeButtonNode,
      canUsePowerup &&
      !pendingBarrierHammer &&
      !!(shooterSnapshot.currentBall && shooterSnapshot.nextBall),
      {
        dimWhenDisabled: false
      }
    );
  }

  var nextAnchor = layoutNodes.NextBallAnchor;
  nextAnchor.setScale(1);
  nextAnchor.opacity = 255;
  var nextBallLike = shooterSnapshot.nextBall || shooterSnapshot.nextColor;
  nextAnchor.active = !!nextBallLike;
  if (nextAnchor.active) {
    this._applyBallVisualCached(nextAnchor, nextBallLike, NEXT_SHOT_BUBBLE_SIZE);
  }
  this._syncShooterBallHandoff(
    shooterPanel,
    layoutNodes,
    shooterSnapshot,
    activeProjectile,
    currentBallLike,
    nextBallLike,
    finiteRemainingShots
  );

  var shotsValue = finiteRemainingShots === null ? 0 : finiteRemainingShots;
  if (
    shooterSnapshot &&
    Object.prototype.hasOwnProperty.call(shooterSnapshot, "surplusRemainingShots")
  ) {
    if (shooterSnapshot.infiniteShots) {
      throw new Error("Shooter render cannot show surplusRemainingShots in infinite-shot mode.");
    }
    if (!Number.isInteger(shooterSnapshot.surplusRemainingShots) || shooterSnapshot.surplusRemainingShots < 0) {
      throw new Error("Shooter render requires non-negative integer surplusRemainingShots.");
    }
    shotsValue = shooterSnapshot.surplusRemainingShots;
  }
  var surplusNode = layoutNodes.Surplus;
  var turretNumBgSprite = layoutNodes.TurretNumBg.getComponent(cc.Sprite);
  if (!turretNumBgSprite) {
    throw new Error("ShooterPanel TurretNumBg requires cc.Sprite.");
  }
  if (!turretNumBgSprite.spriteFrame) {
    throw new Error("ShooterPanel TurretNumBg requires SpriteFrame.");
  }
  var surplusLabel = surplusNode.getComponent(cc.Label);
  if (!surplusLabel) {
    throw new Error("ShooterPanel Surplus requires cc.Label.");
  }
  surplusLabel.string = shooterSnapshot && shooterSnapshot.infiniteShots ? "无限" : String(shotsValue);
  if (!shooterSnapshot.infiniteShots && shotsValue < 10) {
    surplusLabel.node.color = cc.color(255, 72, 72);
  } else {
    surplusLabel.node.color = cc.Color.WHITE;
  }

  var ghost = getOrCreateChild(shooterPanel, "GhostBubble");
  var hasTrajectory = !!(trajectory && trajectory.targetCellPosition && trajectory.pathPoints && trajectory.pathPoints.length >= 2);
  var wallBounceCount = hasTrajectory && Number.isInteger(trajectory.wallBounceCount)
    ? trajectory.wallBounceCount
    : 0;
  var ricochetGuideActive = !!(shooterSnapshot && shooterSnapshot.ricochetGuideActive);
  var shouldShowGhost = BoardLayout.showGhostBubble !== false && (ricochetGuideActive || wallBounceCount === 0);
  ghost.active = shouldShowGhost && !activeProjectile && hasTrajectory && !!currentBallLike;
  if (ghost.active) {
    ghost.setPosition(trajectory.targetCellPosition.x, trajectory.targetCellPosition.y);
    ghost.setScale(1);
    ghost.opacity = 140;
    this._applyBallVisualCached(ghost, currentBallLike, BOARD_BUBBLE_SIZE);
  }

  var projectileNode = getOrCreateChild(this.layers.shooter, "ActiveProjectile");
  if (activeProjectile) {
    projectileNode.active = true;
    projectileNode.setPosition(activeProjectile.position.x, activeProjectile.position.y);
    projectileNode.setScale(1);
    this._applyBallVisualCached(projectileNode, activeProjectile.ball || activeProjectile.color, BOARD_BUBBLE_SIZE);
  } else {
    projectileNode.active = false;
  }

  this._syncShooterGuideDots(shooterPanel, shooterSnapshot, activeProjectile);

  var dock = layoutNodes.NextBallDock;
  dock.active = false;
};

LevelRenderer.prototype._syncShooterBallHandoff = function (
  shooterPanel,
  layoutNodes,
  shooterSnapshot,
  activeProjectile,
  currentBallLike,
  nextBallLike,
  finiteRemainingShots
) {
  var revision = shooterSnapshot.queueAdvanceRevision;
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Shooter handoff requires a non-negative queueAdvanceRevision.");
  }

  if (typeof shooterPanel.__lastQueueAdvanceRevision !== "number") {
    shooterPanel.__lastQueueAdvanceRevision = revision;
    return;
  }
  if (revision < shooterPanel.__lastQueueAdvanceRevision) {
    throw new Error("Shooter queueAdvanceRevision cannot move backwards.");
  }

  if (revision > shooterPanel.__lastQueueAdvanceRevision) {
    if (revision !== shooterPanel.__lastQueueAdvanceRevision + 1) {
      throw new Error("Shooter queueAdvanceRevision must advance one step at a time.");
    }
    if (finiteRemainingShots === 0) {
      shooterPanel.__lastQueueAdvanceRevision = revision;
      layoutNodes.CurrentBallAnchor.active = false;
      layoutNodes.NextBallAnchor.active = false;
      return;
    }
    if (!activeProjectile) {
      throw new Error("Shooter handoff animation requires an active projectile.");
    }
    if (!currentBallLike) {
      if (nextBallLike) {
        throw new Error("Shooter handoff cannot keep next ball without promoted current ball.");
      }
      shooterPanel.__lastQueueAdvanceRevision = revision;
      return;
    }
    if (shooterPanel.__shooterHandoffInProgress) {
      throw new Error("Shooter handoff animation cannot overlap.");
    }

    shooterPanel.__lastQueueAdvanceRevision = revision;
    this._playShooterBallHandoff(
      shooterPanel,
      layoutNodes.CurrentBallAnchor,
      layoutNodes.NextBallAnchor,
      currentBallLike,
      nextBallLike,
      revision
    );
  }

  if (shooterPanel.__shooterHandoffInProgress) {
    layoutNodes.CurrentBallAnchor.active = false;
    layoutNodes.NextBallAnchor.active = false;
  }
};

LevelRenderer.prototype._syncShooterHeroAnimation = function (
  shooterPanel,
  heroNode,
  shooterSnapshot,
  activeProjectile,
  finiteRemainingShots
) {
  var revision = shooterSnapshot.queueAdvanceRevision;
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Shooter hero animation requires a non-negative queueAdvanceRevision.");
  }

  if (typeof shooterPanel.__lastShooterHeroFireRevision !== "number") {
    shooterPanel.__lastShooterHeroFireRevision = revision;
    playShooterHeroIdle(heroNode);
    return;
  }
  if (revision < shooterPanel.__lastShooterHeroFireRevision) {
    throw new Error("Shooter hero animation queueAdvanceRevision cannot move backwards.");
  }

  if (revision > shooterPanel.__lastShooterHeroFireRevision) {
    if (revision !== shooterPanel.__lastShooterHeroFireRevision + 1) {
      throw new Error("Shooter hero animation queueAdvanceRevision must advance one step at a time.");
    }
    if (finiteRemainingShots === 0) {
      shooterPanel.__lastShooterHeroFireRevision = revision;
      playShooterHeroIdle(heroNode);
      return;
    }
    if (!activeProjectile) {
      throw new Error("Shooter hero fire animation requires an active projectile.");
    }
    shooterPanel.__lastShooterHeroFireRevision = revision;
    this._playShooterHeroFireAnimation(heroNode);
    return;
  }

  if (!heroNode.__shooterHeroPlayingClip) {
    playShooterHeroIdle(heroNode);
  }
};

LevelRenderer.prototype._playShooterHeroFireAnimation = function (heroNode) {
  playShooterHeroClip(heroNode, SHOOTER_HERO_FIRE_CLIP_NAME, function () {
    playShooterHeroIdle(heroNode);
  });
};

LevelRenderer.prototype._syncShooterAimRecenter = function (
  shooterPanel,
  shooterNode,
  shooterSnapshot,
  activeProjectile,
  targetAngle
) {
  var revision = shooterSnapshot.queueAdvanceRevision;
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Shooter aim recenter requires a non-negative queueAdvanceRevision.");
  }
  var surplusRecenterRevision = shooterSnapshot.surplusShotAimRecenterRevision;
  if (!Number.isInteger(surplusRecenterRevision) || surplusRecenterRevision < 0) {
    throw new Error("Shooter aim recenter requires a non-negative surplusShotAimRecenterRevision.");
  }

  if (typeof shooterPanel.__lastAimRecenterRevision !== "number") {
    shooterPanel.__lastAimRecenterRevision = revision;
    shooterNode.angle = targetAngle;
  }
  if (typeof shooterPanel.__lastSurplusAimRecenterRevision !== "number") {
    shooterPanel.__lastSurplusAimRecenterRevision = surplusRecenterRevision;
  }
  if (revision < shooterPanel.__lastAimRecenterRevision) {
    throw new Error("Shooter aim recenter queueAdvanceRevision cannot move backwards.");
  }
  if (surplusRecenterRevision < shooterPanel.__lastSurplusAimRecenterRevision) {
    throw new Error("Shooter aim recenter surplusShotAimRecenterRevision cannot move backwards.");
  }

  if (revision > shooterPanel.__lastAimRecenterRevision) {
    if (revision !== shooterPanel.__lastAimRecenterRevision + 1) {
      throw new Error("Shooter aim recenter queueAdvanceRevision must advance one step at a time.");
    }
    if (!activeProjectile) {
      throw new Error("Shooter aim recenter requires an active projectile.");
    }
    if (shooterPanel.__shooterAimRecenterInProgress) {
      throw new Error("Shooter aim recenter animation cannot overlap.");
    }

    shooterPanel.__lastAimRecenterRevision = revision;
    this._playShooterAimRecenter(shooterPanel, shooterNode, revision);
    return;
  }

  if (surplusRecenterRevision > shooterPanel.__lastSurplusAimRecenterRevision) {
    if (shooterPanel.__shooterAimRecenterInProgress) {
      throw new Error("Shooter surplus aim recenter animation cannot overlap.");
    }
    var surplusRecenterDirection = shooterSnapshot.surplusShotAimRecenterDirection;
    if (
      !surplusRecenterDirection ||
      typeof surplusRecenterDirection.x !== "number" ||
      !isFinite(surplusRecenterDirection.x) ||
      typeof surplusRecenterDirection.y !== "number" ||
      !isFinite(surplusRecenterDirection.y)
    ) {
      throw new Error("Shooter surplus aim recenter requires a finite surplusShotAimRecenterDirection.");
    }

    shooterPanel.__lastSurplusAimRecenterRevision = surplusRecenterRevision;
    shooterNode.angle = computeShooterAngle(surplusRecenterDirection);
    this._playShooterAimRecenter(shooterPanel, shooterNode, revision);
    return;
  }

  if (!shooterPanel.__shooterAimRecenterInProgress) {
    shooterNode.angle = targetAngle;
  }
};

LevelRenderer.prototype._playShooterAimRecenter = function (shooterPanel, shooterNode, revision) {
  var fromAngle = shooterNode.angle;
  if (Math.abs(fromAngle) < 0.01) {
    shooterNode.angle = 0;
    return;
  }

  shooterNode.stopAllActions();
  shooterPanel.__shooterAimRecenterInProgress = true;

  shooterNode.runAction(cc.sequence(
    cc.rotateTo(SHOOTER_AIM_RECENTER_DURATION, 0).easing(cc.easeSineOut()),
    cc.callFunc(function () {
      if (shooterPanel.__lastAimRecenterRevision !== revision) {
        throw new Error("Shooter aim recenter revision changed before animation completed.");
      }
      shooterPanel.__shooterAimRecenterInProgress = false;
      shooterNode.angle = 0;
    })
  ));
};

LevelRenderer.prototype._playShooterBallHandoff = function (
  shooterPanel,
  currentAnchor,
  nextAnchor,
  promotedBallLike,
  nextBallLike,
  revision
) {
  var handoffNode = getOrCreateChild(shooterPanel, "NextBallHandoff");
  handoffNode.stopAllActions();
  handoffNode.active = true;
  handoffNode.opacity = 255;
  handoffNode.setScale(1);
  handoffNode.setPosition(nextAnchor.x, nextAnchor.y);
  this._applyBallVisualCached(handoffNode, promotedBallLike, NEXT_SHOT_BUBBLE_SIZE);

  currentAnchor.active = false;
  nextAnchor.active = false;
  shooterPanel.__shooterHandoffInProgress = true;

  var deltaX = currentAnchor.x - nextAnchor.x;
  var deltaY = currentAnchor.y - nextAnchor.y;
  var controlPoint1 = cc.v2(
    nextAnchor.x + deltaX * 0.34,
    nextAnchor.y + deltaY * 0.34 + SHOOTER_HANDOFF_ARC_HEIGHT
  );
  var controlPoint2 = cc.v2(
    nextAnchor.x + deltaX * 0.72,
    nextAnchor.y + deltaY * 0.72 + SHOOTER_HANDOFF_ARC_HEIGHT
  );
  var destination = cc.v2(currentAnchor.x, currentAnchor.y);
  var targetScale = BOARD_BUBBLE_SIZE.width / NEXT_SHOT_BUBBLE_SIZE.width;

  handoffNode.runAction(cc.sequence(
    cc.spawn(
      cc.bezierTo(
        SHOOTER_HANDOFF_DURATION,
        [controlPoint1, controlPoint2, destination]
      ).easing(cc.easeSineInOut()),
      cc.scaleTo(SHOOTER_HANDOFF_DURATION, targetScale)
    ),
    cc.callFunc(function () {
      if (shooterPanel.__lastQueueAdvanceRevision !== revision) {
        throw new Error("Shooter handoff revision changed before animation completed.");
      }
      handoffNode.active = false;
      handoffNode.setScale(1);
      shooterPanel.__shooterHandoffInProgress = false;
      currentAnchor.active = !!promotedBallLike;
      nextAnchor.active = !!nextBallLike;
    })
  ));
};

LevelRenderer.prototype._syncShooterGuideDots = function (shooterPanel, shooterSnapshot, activeProjectile) {
  var guideDots = getOrCreateChild(shooterPanel, "GuideDots");
  var currentBall = shooterSnapshot ? shooterSnapshot.currentBall : null;
  if (currentBall) {
    if (currentBall.ballCategory === "normal") {
      if (currentBall.entityCategory !== "normal_ball") {
        throw new Error("Guide dot normal ball requires entityCategory normal_ball.");
      }
      if (typeof currentBall.color !== "string" || !GUIDE_DOT_TINTS[currentBall.color]) {
        throw new Error("Guide dot normal ball requires a supported color.");
      }
      this.lastGuideDotColorCode = currentBall.color;
    } else if (currentBall.ballCategory === "skill") {
      if (currentBall.entityCategory !== "skill_ball" ||
        (currentBall.entityType !== "rainbow" && currentBall.entityType !== "blast")) {
        throw new Error("Guide dot skill ball requires a supported firing powerup.");
      }
    } else {
      throw new Error("Guide dot current ball requires normal or skill ballCategory.");
    }
  }
  var trajectory = shooterSnapshot ? shooterSnapshot.trajectory : null;
  var hasTrajectory = !!(
    trajectory &&
    trajectory.valid &&
    trajectory.targetCellPosition &&
    trajectory.pathPoints &&
    trajectory.pathPoints.length >= 2
  );
  var guidePath = null;
  if (hasTrajectory) {
    var aimGuidePath = shooterSnapshot && Array.isArray(shooterSnapshot.aimGuidePath)
      ? shooterSnapshot.aimGuidePath
      : null;
    guidePath = aimGuidePath && aimGuidePath.length >= 2
      ? aimGuidePath
      : trajectory.pathPoints;
    // 辅助线最长只显示到“幽灵球与上方碰撞球之间”的碰撞前端位置，且不超过实际命中点。
    var frontDistance = resolveGuideFrontClipDistance(trajectory);
    if (guidePath && frontDistance !== null) {
      guidePath = clipGuidePathToDistance(guidePath, frontDistance);
    }
  }

  var shouldShowGuide = !activeProjectile &&
    !!(shooterSnapshot && shooterSnapshot.isAiming) &&
    !!(guidePath && guidePath.length >= 2);

  if (shouldShowGuide) {
    if (!this.lastGuideDotColorCode || !GUIDE_DOT_TINTS[this.lastGuideDotColorCode]) {
      throw new Error("Visible guide dots require a previously resolved normal ball color.");
    }
    var guideKey = buildGuidePathKey(guidePath) + "|" + this.lastGuideDotColorCode;
    guideDots.active = true;
    if (!this.lastGuideDotsVisible || guideKey !== this.lastGuidePathKey) {
      this._renderGuideDots(guideDots, guidePath, this.lastGuideDotColorCode);
      this.lastGuidePathKey = guideKey;
    }
    this.lastGuideDotsVisible = true;
  } else if (this.lastGuideDotsVisible) {
    guideDots.active = false;
    this._renderGuideDots(guideDots, null);
    this.lastGuideDotsVisible = false;
    this.lastGuidePathKey = "";
  } else {
    guideDots.active = false;
  }
};

LevelRenderer.prototype._renderShooterAimAngleOnly = function (shooterSnapshot, activeProjectile) {
  if (!this.layers || !this.layers.shooter) {
    throw new Error("Shooter aim angle refresh requires shooter layer.");
  }
  if (!shooterSnapshot || !shooterSnapshot.aim) {
    throw new Error("Shooter aim angle refresh requires shooter aim.");
  }

  var shooterPanel = this.layers.shooter.getChildByName("ShooterPanel");
  if (!shooterPanel) {
    throw new Error("Shooter aim angle refresh requires ShooterPanel.");
  }

  var aim = shooterSnapshot.aim;
  var layoutNodes = syncShooterPrefabLayout(shooterPanel, aim.origin);
  var shooterNode = layoutNodes.Shooter;
  if (shooterPanel.__shooterAimRecenterInProgress) {
    shooterNode.stopAllActions();
    shooterPanel.__shooterAimRecenterInProgress = false;
  }
  shooterNode.angle = computeShooterAngle(aim.direction);
  // 轻量刷新只跳过炮台 UI 重绘，辅助线仍按当前轨迹每帧更新。
  this._syncShooterGuideDots(shooterPanel, shooterSnapshot, activeProjectile);
};

LevelRenderer.prototype._updateProjectileOnly = function (activeProjectile) {
  if (!this.layers || !this.layers.shooter) {
    throw new Error("Projectile refresh requires shooter layer.");
  }
  if (!activeProjectile || !activeProjectile.position) {
    throw new Error("Projectile refresh requires active projectile position.");
  }

  var projectileNode = getOrCreateChild(this.layers.shooter, "ActiveProjectile");
  projectileNode.active = true;
  projectileNode.setPosition(activeProjectile.position.x, activeProjectile.position.y);
  projectileNode.setScale(1);
  this._applyBallVisualCached(
    projectileNode,
    activeProjectile.ball || activeProjectile.color,
    BOARD_BUBBLE_SIZE
  );
};

LevelRenderer.prototype._applyBallVisualCached = function (node, ballLike, forcedSize) {
  if (!node) {
    return;
  }

  var visualKey = resolveBallVisualKey(ballLike);
  var sizeKey = forcedSize ? (Math.round(forcedSize.width) + "x" + Math.round(forcedSize.height)) : "auto";
  var cacheKey = visualKey + "|" + sizeKey;
  if (node.__ballVisualKey === cacheKey) {
    return;
  }

  this._applyBallVisual(node, ballLike, forcedSize);
  node.__ballVisualKey = cacheKey;
};

LevelRenderer.prototype._renderGuideDots = function (guideContainer, pathPoints, colorCode) {
  var guideCanvas = getOrCreateChild(guideContainer, "GuideDotsCanvas");
  var dotFrame = this.spriteFrameCache[GUIDE_DOT_SPRITE_PATH];
  if (!dotFrame || !pathPoints || pathPoints.length < 2) {
    this._setGuideDotsActiveCount(guideCanvas, 0, dotFrame, null);
    return;
  }
  var dotTint = GUIDE_DOT_TINTS[colorCode];
  if (!dotTint) {
    throw new Error("Guide dot tint is missing for color: " + colorCode);
  }

  var positions = [];
  var walkedDistance = 0;
  for (var segmentIndex = 1; segmentIndex < pathPoints.length; segmentIndex += 1) {
    var from = pathPoints[segmentIndex - 1];
    var to = pathPoints[segmentIndex];
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var segmentLength = Math.sqrt(dx * dx + dy * dy);
    if (segmentLength < 0.0001) {
      continue;
    }

    var dotsOnSegment = Math.max(1, Math.floor(segmentLength / GUIDE_DOT_SPACING));
    for (var i = 1; i <= dotsOnSegment; i += 1) {
      var t = i / dotsOnSegment;
      positions.push({
        x: from.x + dx * t,
        y: from.y + dy * t,
        distance: walkedDistance + segmentLength * t
      });
    }
    walkedDistance += segmentLength;
  }

  if (positions.length > GUIDE_DOT_MAX_COUNT) {
    var sampled = [];
    var sampleStep = positions.length / GUIDE_DOT_MAX_COUNT;
    for (var sampleIndex = 0; sampleIndex < GUIDE_DOT_MAX_COUNT; sampleIndex += 1) {
      sampled.push(positions[Math.floor(sampleIndex * sampleStep)]);
    }
    positions = sampled;
  }

  var maxDistance = positions[positions.length - 1].distance;
  var nearScale = 1;
  var farScale = GUIDE_DOT_FAR_SCALE;
  var scaleSpan = nearScale - farScale;

  this._setGuideDotsActiveCount(guideCanvas, positions.length, dotFrame, dotTint);
  for (var pointIndex = 0; pointIndex < positions.length; pointIndex += 1) {
    var dotNode = this.guideDotNodes[pointIndex];
    if (!dotNode || !cc.isValid(dotNode)) {
      throw new Error("Guide dot node is missing after allocation: " + pointIndex);
    }
    var point = positions[pointIndex];
    dotNode.setPosition(point.x, point.y);
    var distanceRatio = maxDistance > 0.0001 ? point.distance / maxDistance : 0;
    dotNode.scale = nearScale - scaleSpan * distanceRatio;
  }
};

LevelRenderer.prototype.renderRouteEditor = function (editorState) {
  this._ensureLayers();

  var routeLayer = this.layers.routeEditor;
  if (!editorState || !Array.isArray(editorState.routes)) {
    routeLayer.active = false;
    clearChildren(routeLayer);
    return;
  }

  var hasRoutes = editorState.routes.some(function (route) {
    return route && Array.isArray(route.points) && route.points.length > 0;
  });
  routeLayer.active = !!(editorState.enabled || hasRoutes);

  var canvas = getOrCreateChild(routeLayer, "RouteCanvas");
  var graphics = canvas.getComponent(cc.Graphics) || canvas.addComponent(cc.Graphics);
  graphics.clear();

  var infoNode = getOrCreateChild(routeLayer, "RouteInfo");
  infoNode.setContentSize(420, 160);
  infoNode.setPosition(-110, 0);
  infoNode.zIndex = 5;
  var infoLabel = ensureLabel(infoNode, "", 24, 32, cc.Label.HorizontalAlign.LEFT);
  infoLabel.overflow = cc.Label.Overflow.RESIZE_HEIGHT;
  infoLabel.enableWrapText = true;
  infoNode.color = cc.color(255, 255, 255);
  ensureOutline(infoNode, cc.color(24, 42, 59), 2);

  var activeRouteId = editorState.activeRouteId;
  var totalPointCount = 0;
  var activeRoute = null;

  editorState.routes.forEach(function (route, index) {
    if (!route || !Array.isArray(route.points) || route.points.length <= 0) {
      return;
    }

    totalPointCount += route.points.length;
    var isActive = route.id === activeRouteId;
    if (isActive) {
      activeRoute = route;
    }

    var strokeColor = createRouteColor(index, isActive);
    graphics.lineWidth = isActive ? ROUTE_LINE_WIDTH_ACTIVE : ROUTE_LINE_WIDTH_IDLE;
    graphics.strokeColor = strokeColor;
    graphics.moveTo(route.points[0].x, route.points[0].y);
    for (var pointIndex = 1; pointIndex < route.points.length; pointIndex += 1) {
      graphics.lineTo(route.points[pointIndex].x, route.points[pointIndex].y);
    }
    graphics.stroke();

    graphics.fillColor = strokeColor;
    route.points.forEach(function (point) {
      graphics.circle(
        point.x,
        point.y,
        isActive ? ROUTE_POINT_RADIUS_ACTIVE : ROUTE_POINT_RADIUS_IDLE
      );
    });
    graphics.fill();
  });

  if (!activeRoute && editorState.routes.length > 0) {
    activeRoute = editorState.routes[0];
  }

  var latestPoint = activeRoute && Array.isArray(activeRoute.points) && activeRoute.points.length > 0
    ? activeRoute.points[activeRoute.points.length - 1]
    : null;
  var modeText = editorState.enabled ? "开启" : "关闭";
  infoLabel.string = [
    "路线编辑: " + modeText,
    "路线数: " + editorState.routes.length,
    "总点位: " + totalPointCount,
    "当前路线: " + (activeRoute ? activeRoute.name : "-"),
    "当前点数: " + (activeRoute && activeRoute.points ? activeRoute.points.length : 0),
    "最后坐标: " + (latestPoint ? (latestPoint.x + ", " + latestPoint.y) : "-")
  ].join("\n");
  infoNode.active = routeLayer.active;
};
}

module.exports = attachLevelRendererSceneShooterMethods;

},{"./LevelRendererSceneShared":"LevelRendererSceneShared"}],
"LightningChainRenderer":[function(require,module,exports){
"use strict";

var RESOURCE_PATHS = {
  arcPrimary: "game/image/skill/lightning/lightning_arc_long_01",
  arcSecondary: "game/image/skill/lightning/lightning_arc_long_02",
  ring: "game/image/skill/lightning/lightning_ring",
  sparkBurst: "game/image/skill/lightning/blue_spark_burst",
  starburst: "game/image/skill/lightning/blue_starburst",
  boltPrimary: "game/image/skill/lightning/blue_lightning_bolt_01",
  boltSecondary: "game/image/skill/lightning/blue_lightning_bolt_02",
  starGlowLarge: "game/image/skill/lightning/purple_star_glow_large",
  starGlowSmall: "game/image/skill/lightning/purple_star_glow_small"
};

var RESOURCE_KEYS = Object.keys(RESOURCE_PATHS);
var SEGMENT_HEIGHT = 56;
var SEGMENT_ENDPOINT_OVERLAP = 14;
var SEGMENT_FADE_IN_DURATION = 0.035;
var SEGMENT_FRAME_DURATION = 0.055;
var SEGMENT_FADE_OUT_DURATION = 0.11;
var HIT_STAGGER_DURATION = 0.085;
var FINAL_HOLD_DURATION = 0.32;
var RING_WIDTH = 118;
var RING_HEIGHT = 107;
var SPARK_BURST_WIDTH = 74;
var SPARK_BURST_HEIGHT = 76;
var STARBURST_WIDTH = 59;
var STARBURST_HEIGHT = 64;
var STAR_GLOW_LARGE_WIDTH = 70;
var STAR_GLOW_LARGE_HEIGHT = 70;
var STAR_GLOW_SMALL_WIDTH = 47;
var STAR_GLOW_SMALL_HEIGHT = 48;
var BOLT_PRIMARY_WIDTH = 44;
var BOLT_PRIMARY_HEIGHT = 58;
var BOLT_SECONDARY_WIDTH = 57;
var BOLT_SECONDARY_HEIGHT = 58;
var EFFECT_Z_INDEX = 700;
var MIN_SEGMENT_LENGTH = 1;

function requireFinitePoint(point, ownerName) {
  if (
    !point ||
    typeof point !== "object" ||
    Array.isArray(point) ||
    typeof point.x !== "number" ||
    typeof point.y !== "number" ||
    !isFinite(point.x) ||
    !isFinite(point.y)
  ) {
    throw new Error(ownerName + " must contain finite x and y.");
  }
  return point;
}

function requireChainId(chainId) {
  if (
    (typeof chainId !== "string" && typeof chainId !== "number") ||
    String(chainId).length === 0
  ) {
    throw new Error("Lightning chain id must be a non-empty string or number.");
  }
  return String(chainId);
}

function requireHitPoint(hitPoint, index, usedIds) {
  requireFinitePoint(hitPoint, "Lightning chain hit point " + index);
  if (
    (typeof hitPoint.id !== "string" && typeof hitPoint.id !== "number") ||
    String(hitPoint.id).length === 0
  ) {
    throw new Error("Lightning chain hit point " + index + " requires id.");
  }

  var normalizedId = String(hitPoint.id);
  if (usedIds[normalizedId]) {
    throw new Error("Lightning chain hit point id must be unique: " + normalizedId);
  }
  usedIds[normalizedId] = true;

  return {
    id: normalizedId,
    x: hitPoint.x,
    y: hitPoint.y
  };
}

function validatePlayConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Lightning chain play config is required.");
  }

  var chainId = requireChainId(config.chainId);
  var origin = requireFinitePoint(config.origin, "Lightning chain origin");
  if (!Array.isArray(config.hitPoints) || config.hitPoints.length === 0) {
    throw new Error("Lightning chain requires at least one hit point.");
  }
  if (config.onHit !== undefined && typeof config.onHit !== "function") {
    throw new Error("Lightning chain onHit must be a function when provided.");
  }

  var usedIds = {};
  var hitPoints = config.hitPoints.map(function (hitPoint, index) {
    return requireHitPoint(hitPoint, index, usedIds);
  });

  var previousPoint = origin;
  hitPoints.forEach(function (hitPoint, index) {
    resolveSegmentGeometry(previousPoint, hitPoint, index);
    previousPoint = hitPoint;
  });

  return {
    chainId: chainId,
    origin: {
      x: origin.x,
      y: origin.y
    },
    hitPoints: hitPoints,
    onHit: config.onHit
  };
}

function resolveSegmentGeometry(startPoint, endPoint, index) {
  requireFinitePoint(startPoint, "Lightning chain segment " + index + " start");
  requireFinitePoint(endPoint, "Lightning chain segment " + index + " end");

  var dx = endPoint.x - startPoint.x;
  var dy = endPoint.y - startPoint.y;
  var distance = Math.sqrt(dx * dx + dy * dy);
  if (!isFinite(distance) || distance < MIN_SEGMENT_LENGTH) {
    throw new Error("Lightning chain segment " + index + " length must be at least " + MIN_SEGMENT_LENGTH + ".");
  }

  return {
    x: startPoint.x,
    y: startPoint.y,
    width: distance + SEGMENT_ENDPOINT_OVERLAP,
    height: SEGMENT_HEIGHT,
    angle: Math.atan2(dy, dx) * 180 / Math.PI
  };
}

function requireActionApis() {
  [
    "sequence",
    "spawn",
    "callFunc",
    "delayTime",
    "fadeTo",
    "scaleTo",
    "rotateBy"
  ].forEach(function (apiName) {
    if (typeof cc[apiName] !== "function") {
      throw new Error("Lightning chain effect requires cc." + apiName + ".");
    }
  });
}

function requireLayer(layer) {
  if (!layer || !layer.isValid) {
    throw new Error("Lightning chain effect requires a valid render layer.");
  }
  return layer;
}

function requireSpriteFrames(spriteFrameCache) {
  if (!spriteFrameCache || typeof spriteFrameCache !== "object" || Array.isArray(spriteFrameCache)) {
    throw new Error("Lightning chain effect requires SpriteFrame cache.");
  }

  var spriteFrames = {};
  RESOURCE_KEYS.forEach(function (key) {
    var path = RESOURCE_PATHS[key];
    var spriteFrame = spriteFrameCache[path];
    if (!spriteFrame) {
      throw new Error("Lightning chain SpriteFrame is not preloaded: " + path);
    }
    if (typeof cc.isValid === "function" && !cc.isValid(spriteFrame)) {
      throw new Error("Lightning chain SpriteFrame is invalid: " + path);
    }
    spriteFrames[key] = spriteFrame;
  });
  return spriteFrames;
}

function createSpriteNode(parent, name, spriteFrame, width, height, zIndex) {
  if (typeof width !== "number" || !isFinite(width) || width <= 0) {
    throw new Error(name + " width must be positive.");
  }
  if (typeof height !== "number" || !isFinite(height) || height <= 0) {
    throw new Error(name + " height must be positive.");
  }

  var node = new cc.Node(name);
  node.parent = parent;
  node.setContentSize(width, height);
  node.zIndex = zIndex;
  var sprite = node.addComponent(cc.Sprite);
  sprite.spriteFrame = spriteFrame;
  sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
  return {
    node: node,
    sprite: sprite
  };
}

function createSegmentNode(root, spriteFrames, startPoint, endPoint, index) {
  var geometry = resolveSegmentGeometry(startPoint, endPoint, index);
  var entry = createSpriteNode(
    root,
    "LightningSegment_" + index,
    spriteFrames.arcPrimary,
    geometry.width,
    geometry.height,
    index * 10
  );
  entry.node.anchorX = 0;
  entry.node.anchorY = 0.5;
  entry.node.setPosition(geometry.x, geometry.y);
  entry.node.angle = geometry.angle;
  entry.node.opacity = 0;
  entry.node.active = false;
  return entry;
}

function createCenteredSprite(root, name, spriteFrame, width, height, zIndex, point) {
  var entry = createSpriteNode(root, name, spriteFrame, width, height, zIndex);
  entry.node.setPosition(point.x, point.y);
  entry.node.opacity = 0;
  entry.node.active = false;
  return entry;
}

function createImpactNodes(root, spriteFrames, point, index) {
  var zIndex = index * 10 + 2;
  var ring = createCenteredSprite(
    root,
    "LightningRing_" + index,
    spriteFrames.ring,
    RING_WIDTH,
    RING_HEIGHT,
    zIndex,
    point
  );
  var sparkBurst = createCenteredSprite(
    root,
    "LightningSparkBurst_" + index,
    spriteFrames.sparkBurst,
    SPARK_BURST_WIDTH,
    SPARK_BURST_HEIGHT,
    zIndex + 1,
    point
  );
  var starburst = createCenteredSprite(
    root,
    "LightningStarburst_" + index,
    spriteFrames.starburst,
    STARBURST_WIDTH,
    STARBURST_HEIGHT,
    zIndex + 2,
    point
  );
  var starGlowLarge = createCenteredSprite(
    root,
    "LightningStarGlowLarge_" + index,
    spriteFrames.starGlowLarge,
    STAR_GLOW_LARGE_WIDTH,
    STAR_GLOW_LARGE_HEIGHT,
    zIndex + 3,
    point
  );
  var starGlowSmall = createCenteredSprite(
    root,
    "LightningStarGlowSmall_" + index,
    spriteFrames.starGlowSmall,
    STAR_GLOW_SMALL_WIDTH,
    STAR_GLOW_SMALL_HEIGHT,
    zIndex + 4,
    point
  );
  var boltPrimary = createCenteredSprite(
    root,
    "LightningBoltPrimary_" + index,
    spriteFrames.boltPrimary,
    BOLT_PRIMARY_WIDTH,
    BOLT_PRIMARY_HEIGHT,
    zIndex + 5,
    point
  );
  var boltSecondary = createCenteredSprite(
    root,
    "LightningBoltSecondary_" + index,
    spriteFrames.boltSecondary,
    BOLT_SECONDARY_WIDTH,
    BOLT_SECONDARY_HEIGHT,
    zIndex + 6,
    point
  );

  boltPrimary.node.angle = -38;
  boltSecondary.node.angle = 42;

  return {
    ring: ring,
    sparkBurst: sparkBurst,
    starburst: starburst,
    starGlowLarge: starGlowLarge,
    starGlowSmall: starGlowSmall,
    boltPrimary: boltPrimary,
    boltSecondary: boltSecondary
  };
}

function requireActiveNode(node, ownerName) {
  if (!node || !node.isValid) {
    throw new Error(ownerName + " was destroyed during lightning chain playback.");
  }
}

function playSegment(entry, spriteFrames) {
  requireActiveNode(entry.node, "Lightning segment");
  entry.node.active = true;
  entry.node.opacity = 0;
  entry.sprite.spriteFrame = spriteFrames.arcPrimary;
  entry.node.runAction(cc.sequence(
    cc.fadeTo(SEGMENT_FADE_IN_DURATION, 255),
    cc.delayTime(SEGMENT_FRAME_DURATION),
    cc.callFunc(function () {
      requireActiveNode(entry.node, "Lightning segment");
      entry.sprite.spriteFrame = spriteFrames.arcSecondary;
    }),
    cc.delayTime(SEGMENT_FRAME_DURATION),
    cc.callFunc(function () {
      requireActiveNode(entry.node, "Lightning segment");
      entry.sprite.spriteFrame = spriteFrames.arcPrimary;
    }),
    cc.fadeTo(SEGMENT_FADE_OUT_DURATION, 0)
  ));
}

function playImpact(entry) {
  var impactNodes = [
    entry.ring.node,
    entry.sparkBurst.node,
    entry.starburst.node,
    entry.starGlowLarge.node,
    entry.starGlowSmall.node,
    entry.boltPrimary.node,
    entry.boltSecondary.node
  ];
  impactNodes.forEach(function (node) {
    requireActiveNode(node, "Lightning impact");
    node.active = true;
    node.opacity = 0;
    node.setScale(0.42);
  });

  entry.ring.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.045, 255),
      cc.scaleTo(0.11, 1)
    ),
    cc.spawn(
      cc.fadeTo(0.18, 0),
      cc.scaleTo(0.18, 1.34),
      cc.rotateBy(0.18, 34)
    )
  ));
  entry.sparkBurst.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.035, 255),
      cc.scaleTo(0.08, 1.08)
    ),
    cc.spawn(
      cc.fadeTo(0.16, 0),
      cc.scaleTo(0.16, 1.5)
    )
  ));
  entry.starburst.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.03, 255),
      cc.scaleTo(0.07, 1)
    ),
    cc.spawn(
      cc.fadeTo(0.15, 0),
      cc.scaleTo(0.15, 1.42),
      cc.rotateBy(0.15, -28)
    )
  ));
  entry.starGlowLarge.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.045, 230),
      cc.scaleTo(0.09, 1)
    ),
    cc.spawn(
      cc.fadeTo(0.16, 0),
      cc.scaleTo(0.16, 1.36)
    )
  ));
  entry.starGlowSmall.node.runAction(cc.sequence(
    cc.delayTime(0.035),
    cc.spawn(
      cc.fadeTo(0.035, 255),
      cc.scaleTo(0.07, 1.1)
    ),
    cc.spawn(
      cc.fadeTo(0.13, 0),
      cc.scaleTo(0.13, 1.55)
    )
  ));
  entry.boltPrimary.node.runAction(cc.sequence(
    cc.spawn(
      cc.fadeTo(0.025, 255),
      cc.scaleTo(0.06, 1.05)
    ),
    cc.spawn(
      cc.fadeTo(0.13, 0),
      cc.scaleTo(0.13, 1.34)
    )
  ));
  entry.boltSecondary.node.runAction(cc.sequence(
    cc.delayTime(0.025),
    cc.spawn(
      cc.fadeTo(0.025, 255),
      cc.scaleTo(0.06, 1.05)
    ),
    cc.spawn(
      cc.fadeTo(0.12, 0),
      cc.scaleTo(0.12, 1.3)
    )
  ));
}

function LightningChainRenderer() {
  this.activeRoot = null;
  this.activeState = null;
  this.serial = 0;
}

LightningChainRenderer.prototype.isPlaying = function () {
  return this.activeState !== null;
};

LightningChainRenderer.prototype.play = function (layer, spriteFrameCache, config) {
  requireActionApis();
  requireLayer(layer);
  var spriteFrames = requireSpriteFrames(spriteFrameCache);
  var normalizedConfig = validatePlayConfig(config);

  if (this.activeState !== null || (this.activeRoot && this.activeRoot.isValid)) {
    throw new Error("Lightning chain effect is already playing.");
  }

  this.serial += 1;
  var root = new cc.Node("LightningChainFx_" + normalizedConfig.chainId + "_" + this.serial);
  root.parent = layer;
  root.setPosition(0, 0);
  root.zIndex = EFFECT_Z_INDEX;
  this.activeRoot = root;

  var segments = [];
  var impacts = [];
  var previousPoint = normalizedConfig.origin;
  normalizedConfig.hitPoints.forEach(function (hitPoint, index) {
    segments.push(createSegmentNode(root, spriteFrames, previousPoint, hitPoint, index));
    impacts.push(createImpactNodes(root, spriteFrames, hitPoint, index));
    previousPoint = hitPoint;
  });

  return new Promise(function (resolve) {
    var state = {
      chainId: normalizedConfig.chainId,
      root: root,
      resolve: resolve,
      completedHitIds: []
    };
    this.activeState = state;
    var timeline = [];

    normalizedConfig.hitPoints.forEach(function (hitPoint, index) {
      if (index > 0) {
        timeline.push(cc.delayTime(HIT_STAGGER_DURATION));
      }
      timeline.push(cc.callFunc(function () {
        if (this.activeState !== state) {
          throw new Error("Lightning chain active state changed during playback.");
        }
        requireActiveNode(root, "Lightning chain root");
        playSegment(segments[index], spriteFrames);
        playImpact(impacts[index]);
        state.completedHitIds.push(hitPoint.id);
        if (normalizedConfig.onHit) {
          normalizedConfig.onHit(hitPoint, index);
        }
      }.bind(this)));
    }, this);

    timeline.push(cc.delayTime(FINAL_HOLD_DURATION));
    timeline.push(cc.callFunc(function () {
      this._finishActiveState(state, false, "completed");
    }.bind(this)));
    root.runAction(cc.sequence.apply(null, timeline));
  }.bind(this));
};

LightningChainRenderer.prototype._finishActiveState = function (state, cancelled, reason) {
  if (this.activeState !== state) {
    throw new Error("Lightning chain finish state does not match active state.");
  }

  var root = state.root;
  if (root && root.isValid) {
    root.stopAllActions();
    root.children.slice().forEach(function (child) {
      if (child && child.isValid) {
        child.stopAllActions();
      }
    });
    root.removeFromParent(false);
    root.destroy();
  }

  this.activeRoot = null;
  this.activeState = null;
  state.resolve({
    chainId: state.chainId,
    cancelled: cancelled,
    reason: reason,
    completedHitIds: state.completedHitIds.slice()
  });
};

LightningChainRenderer.prototype.reset = function (reason) {
  if (typeof reason !== "string" || reason.length === 0) {
    throw new Error("Lightning chain reset reason is required.");
  }
  if (this.activeState === null) {
    if (this.activeRoot && this.activeRoot.isValid) {
      throw new Error("Lightning chain root cannot exist without active state.");
    }
    this.activeRoot = null;
    return;
  }
  this._finishActiveState(this.activeState, true, reason);
};

LightningChainRenderer.RESOURCE_PATHS = RESOURCE_KEYS.map(function (key) {
  return RESOURCE_PATHS[key];
});
LightningChainRenderer.validatePlayConfig = validatePlayConfig;
LightningChainRenderer.resolveSegmentGeometry = resolveSegmentGeometry;

module.exports = LightningChainRenderer;

},{}],
"MatchSystem":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function keyFor(cell) {
  return cell.row + ":" + cell.col;
}

function isVineEntangled(cell) {
  return !!(
    cell &&
    cell.entityCategory === "normal_ball" &&
    typeof cell.vineOwnerId === "string" &&
    cell.vineOwnerId
  );
}

function MatchSystem() {
  BaseSystem.call(this, "MatchSystem");
  this.matchThreshold = 3;
  this.availableColors = [];
  this.lastMatches = [];
}

MatchSystem.prototype = Object.create(BaseSystem.prototype);
MatchSystem.prototype.constructor = MatchSystem;

MatchSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.availableColors = levelConfig.level.colors.slice();
  this.lastMatches = [];
  return this;
};

MatchSystem.prototype.findMatchGroup = function (grid, startCell) {
  if (!startCell) {
    this.lastMatches = [];
    return [];
  }

  var startFromGrid = grid.getCell(startCell.row, startCell.col);
  if (isVineEntangled(startFromGrid)) {
    this.lastMatches = [];
    return [];
  }
  var targetColor = (startFromGrid && startFromGrid.color) || startCell.color;

  if (!targetColor) {
    this.lastMatches = [];
    return [];
  }

  var queue = [{
    row: startCell.row,
    col: startCell.col
  }];
  var visited = {};
  var group = [];

  for (var cursor = 0; cursor < queue.length; cursor += 1) {
    var current = queue[cursor];
    var key = keyFor(current);
    if (visited[key]) {
      continue;
    }

    visited[key] = true;
    var gridCell = grid.getCell(current.row, current.col);
    if (!gridCell || gridCell.color !== targetColor || isVineEntangled(gridCell)) {
      continue;
    }

    group.push(gridCell);

    grid.getNeighborCoordinates(gridCell.row, gridCell.col).forEach(function (neighbor) {
      var neighborKey = keyFor(neighbor);
      if (visited[neighborKey]) {
        return;
      }

      var neighborCell = grid.getCell(neighbor.row, neighbor.col);
      if (neighborCell && neighborCell.color === targetColor && !isVineEntangled(neighborCell)) {
        queue.push({
          row: neighbor.row,
          col: neighbor.col
        });
      }
    });
  }

  this.lastMatches = group.length >= this.matchThreshold ? clone(group) : [];
  return clone(this.lastMatches);
};

MatchSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.matchThreshold = this.matchThreshold;
  snapshot.availableColors = this.availableColors.slice();
  snapshot.lastMatches = clone(this.lastMatches);
  return snapshot;
};

module.exports = MatchSystem;

},{"./BaseSystem":"BaseSystem"}],
"PrefabFactory":[function(require,module,exports){
"use strict";

var Logger = require("../../assets/scripts/utils/Logger");
var BundleLoader = require("../../assets/scripts/utils/BundleLoader");

function loadPrefab(path) {
  return new Promise(function (resolve, reject) {
    BundleLoader.loadRes(path, cc.Prefab, function (error, prefab) {
      if (error) {
        reject(new Error("Load prefab failed `" + path + "`: " + error.message));
        return;
      }

      if (!prefab) {
        reject(new Error("Load prefab returned empty asset: " + path));
        return;
      }

      resolve(prefab);
    });
  });
}

function PrefabFactory() {
  this._prefabCache = {};
  this._resolvedCache = {};
}

function releasePrefabAsset(prefab, path) {
  if (!prefab) {
    return;
  }
  if (typeof prefab.decRef !== "function") {
    throw new Error("PrefabFactory requires retained Prefab.decRef to release: " + path);
  }
  prefab.decRef();
}

function retainPrefabAsset(prefab, path) {
  if (!prefab || typeof prefab.addRef !== "function") {
    throw new Error("PrefabFactory requires Prefab.addRef to retain: " + path);
  }
  prefab.addRef();
  return prefab;
}

function requireCachePathPrefix(pathPrefix) {
  if (typeof pathPrefix !== "string" || pathPrefix.length === 0) {
    throw new Error("PrefabFactory cache path prefix must be a non-empty string.");
  }
  if (pathPrefix.trim() !== pathPrefix || pathPrefix.charAt(pathPrefix.length - 1) !== "/") {
    throw new Error("PrefabFactory cache path prefix must be normalized and end with '/': " + pathPrefix);
  }
  return pathPrefix;
}

function collectCachedPaths(factory) {
  var paths = Object.keys(factory._prefabCache);
  Object.keys(factory._resolvedCache).forEach(function (path) {
    if (paths.indexOf(path) < 0) {
      paths.push(path);
    }
  });
  return paths;
}

function releaseCachedPaths(factory, paths) {
  var releasedCount = 0;
  paths.forEach(function (path) {
    var instantiatedPrefab = factory._prefabCache[path];
    var resolvedPrefab = factory._resolvedCache[path];
    if (instantiatedPrefab && resolvedPrefab && instantiatedPrefab !== resolvedPrefab) {
      throw new Error("PrefabFactory cache ownership mismatch: " + path);
    }
    var retainedPrefab = instantiatedPrefab;
    if (!retainedPrefab) {
      retainedPrefab = resolvedPrefab;
    }
    if (retainedPrefab) {
      releasePrefabAsset(retainedPrefab, path);
      releasedCount += 1;
    }
    delete factory._prefabCache[path];
    delete factory._resolvedCache[path];
  });
  return releasedCount;
}

PrefabFactory.prototype.preload = function (paths) {
  return Promise.all(paths.map(function (path) {
    return this.load(path);
  }, this));
};

PrefabFactory.prototype.load = function (path) {
  if (this._resolvedCache.hasOwnProperty(path)) {
    return Promise.resolve(this._resolvedCache[path]);
  }

  return loadPrefab(path).then(function (prefab) {
    var retainedPrefab = retainPrefabAsset(prefab, path);
    this._resolvedCache[path] = retainedPrefab;
    this._prefabCache[path] = retainedPrefab;
    Logger.info("Prefab ready", path);

    return retainedPrefab;
  }.bind(this));
};

PrefabFactory.prototype.instantiate = function (path, parent, name) {
  var prefab = this._prefabCache[path] || null;
  if (!prefab) {
    return null;
  }

  var node = cc.instantiate(prefab);
  if (name) {
    node.name = name;
  }

  if (parent) {
    node.parent = parent;
  }

  return node;
};

PrefabFactory.prototype.resetLoadedCache = function () {
  this._prefabCache = {};
  this._resolvedCache = {};
};

PrefabFactory.prototype.releaseLoadedCache = function () {
  releaseCachedPaths(this, collectCachedPaths(this));
  this.resetLoadedCache();
};

PrefabFactory.prototype.releaseLoadedCacheByPrefix = function (pathPrefix) {
  var normalizedPrefix = requireCachePathPrefix(pathPrefix);
  var matchedPaths = collectCachedPaths(this).filter(function (path) {
    return path.indexOf(normalizedPrefix) === 0;
  });
  if (matchedPaths.length === 0) {
    throw new Error("PrefabFactory found no cached prefabs for path prefix: " + normalizedPrefix);
  }
  return releaseCachedPaths(this, matchedPaths);
};

module.exports = PrefabFactory;

},{"../../assets/scripts/utils/Logger":"Logger","../../assets/scripts/utils/BundleLoader":"BundleLoader"}],
"ProjectileMath":[function(require,module,exports){
"use strict";

var BoardLayout = require("../../assets/scripts/config/BoardLayout");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function distance(a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function quantize(value, step) {
  return Math.round(value / step) * step;
}

function normalizeDirection(vector) {
  var vx = vector && typeof vector.x === "number" ? vector.x : 0;
  var vy = vector && typeof vector.y === "number" ? vector.y : 1;
  var length = Math.sqrt(vx * vx + vy * vy) || 1;
  return {
    x: vx / length,
    y: vy / length
  };
}

function appendUniquePathPoint(pathPoints, point) {
  if (!point) {
    return;
  }

  if (!pathPoints.length || distance(pathPoints[pathPoints.length - 1], point) > 0.001) {
    pathPoints.push(clone(point));
  }
}

function resolveFirstBounceWallX(shotPlan, origin, target) {
  var direction = shotPlan && shotPlan.direction ? shotPlan.direction : null;
  if (direction && Math.abs(direction.x) > 0.0001) {
    return direction.x > 0 ? BoardLayout.boardRight : BoardLayout.boardLeft;
  }

  return target.x >= origin.x ? BoardLayout.boardRight : BoardLayout.boardLeft;
}

function buildBounceWallSequence(firstWallX, bounceCount) {
  var sequence = [];
  if (!bounceCount || bounceCount <= 0) {
    return sequence;
  }

  var isLeftFirst = Math.abs(firstWallX - BoardLayout.boardLeft) <= Math.abs(firstWallX - BoardLayout.boardRight);
  for (var i = 0; i < bounceCount; i += 1) {
    var useLeft = isLeftFirst ? (i % 2 === 0) : (i % 2 === 1);
    sequence.push(useLeft ? BoardLayout.boardLeft : BoardLayout.boardRight);
  }

  return sequence;
}

function buildReconstructedBouncePoints(origin, target, wallSequence) {
  if (!wallSequence.length) {
    return [];
  }

  var laneWidth = Math.abs(BoardLayout.boardRight - BoardLayout.boardLeft);
  var firstWallX = wallSequence[0];
  var lastWallX = wallSequence[wallSequence.length - 1];
  var firstSpanX = Math.abs(firstWallX - origin.x);
  var middleSpanX = Math.max(0, wallSequence.length - 1) * laneWidth;
  var lastSpanX = Math.abs(target.x - lastWallX);
  var totalSpanX = firstSpanX + middleSpanX + lastSpanX;
  var deltaY = target.y - origin.y;
  var EPSILON = 0.000001;
  if (totalSpanX <= EPSILON) {
    return null;
  }

  var bouncePoints = [];
  for (var i = 0; i < wallSequence.length; i += 1) {
    var cumulativeSpanX = firstSpanX + i * laneWidth;
    var t = cumulativeSpanX / totalSpanX;
    if (t <= EPSILON || t >= 1 - EPSILON) {
      return null;
    }

    bouncePoints.push({
      x: wallSequence[i],
      y: origin.y + deltaY * t
    });
  }

  return bouncePoints;
}

function buildProjectilePathFromShotPlan(shotPlan) {
  var origin = shotPlan && shotPlan.origin ? clone(shotPlan.origin) : clone(BoardLayout.shooterOrigin);
  var target = shotPlan && shotPlan.targetCellPosition ? clone(shotPlan.targetCellPosition) : clone(origin);
  var bounceCount = shotPlan && typeof shotPlan.wallBounceCount === "number"
    ? Math.max(0, Math.floor(shotPlan.wallBounceCount))
    : 0;

  var pathPoints = [];
  appendUniquePathPoint(pathPoints, origin);
  if (bounceCount > 0) {
    var firstWallX = resolveFirstBounceWallX(shotPlan, origin, target);
    var wallSequence = buildBounceWallSequence(firstWallX, bounceCount);
    var bouncePoints = buildReconstructedBouncePoints(origin, target, wallSequence);
    if (bouncePoints && bouncePoints.length) {
      bouncePoints.forEach(function (point) {
        appendUniquePathPoint(pathPoints, point);
      });
    }
  }

  appendUniquePathPoint(pathPoints, target);

  if (pathPoints.length < 2) {
    pathPoints.push(clone(target));
  }

  return pathPoints;
}

function measurePathDistance(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) {
    return 0;
  }

  var total = 0;
  for (var i = 1; i < pathPoints.length; i += 1) {
    total += distance(pathPoints[i - 1], pathPoints[i]);
  }

  return total;
}

function buildAimGuidePath(origin, direction, maxBounces, topY) {
  var start = origin ? clone(origin) : clone(BoardLayout.shooterOrigin);
  var rayDirection = normalizeDirection(direction || { x: 0, y: 1 });
  var maxBounceCount = Math.max(0, Math.floor(Number(maxBounces) || 0));
  var topBoundaryY = typeof topY === "number" ? topY : (BoardLayout.boardStartY + BoardLayout.bubbleRadius);
  var EPSILON = 0.000001;

  var pathPoints = [];
  appendUniquePathPoint(pathPoints, start);

  var currentPoint = clone(start);
  var currentDirection = clone(rayDirection);
  var remainingBounces = maxBounceCount;

  for (var guard = 0; guard < maxBounceCount + 3; guard += 1) {
    var distanceToTop = Number.POSITIVE_INFINITY;
    if (currentDirection.y > EPSILON) {
      var projectedTopDistance = (topBoundaryY - currentPoint.y) / currentDirection.y;
      if (projectedTopDistance > EPSILON) {
        distanceToTop = projectedTopDistance;
      }
    }

    var distanceToWall = Number.POSITIVE_INFINITY;
    if (Math.abs(currentDirection.x) > EPSILON) {
      var boundaryX = currentDirection.x > 0 ? BoardLayout.boardRight : BoardLayout.boardLeft;
      var projectedWallDistance = (boundaryX - currentPoint.x) / currentDirection.x;
      if (projectedWallDistance > EPSILON) {
        distanceToWall = projectedWallDistance;
      }
    }

    var hitWall = isFinite(distanceToWall) &&
      distanceToWall < distanceToTop - EPSILON &&
      remainingBounces > 0;
    var travelDistance = hitWall ? distanceToWall : distanceToTop;

    if (!isFinite(travelDistance) || travelDistance <= EPSILON) {
      break;
    }

    currentPoint = {
      x: currentPoint.x + currentDirection.x * travelDistance,
      y: currentPoint.y + currentDirection.y * travelDistance
    };
    appendUniquePathPoint(pathPoints, currentPoint);

    if (!hitWall) {
      break;
    }

    currentDirection.x = -currentDirection.x;
    remainingBounces -= 1;
    currentPoint = {
      x: currentPoint.x + currentDirection.x * 0.01,
      y: currentPoint.y + currentDirection.y * 0.01
    };
  }

  if (pathPoints.length < 2) {
    appendUniquePathPoint(pathPoints, {
      x: start.x + rayDirection.x * 180,
      y: start.y + rayDirection.y * 180
    });
  }

  return pathPoints;
}

module.exports = {
  clone: clone,
  distance: distance,
  lerpPoint: lerpPoint,
  quantize: quantize,
  normalizeDirection: normalizeDirection,
  appendUniquePathPoint: appendUniquePathPoint,
  resolveFirstBounceWallX: resolveFirstBounceWallX,
  buildBounceWallSequence: buildBounceWallSequence,
  buildReconstructedBouncePoints: buildReconstructedBouncePoints,
  buildProjectilePathFromShotPlan: buildProjectilePathFromShotPlan,
  measurePathDistance: measurePathDistance,
  buildAimGuidePath: buildAimGuidePath
};

},{"../../assets/scripts/config/BoardLayout":"BoardLayout"}],
"ShooterController":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeVector(vector) {
  var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createNormalBall(colorCode) {
  return {
    ballCategory: "normal",
    color: colorCode,
    entityCategory: "normal_ball",
    entityType: null
  };
}

function createSkillBall(entityType) {
  return {
    ballCategory: "skill",
    color: null,
    entityCategory: "skill_ball",
    entityType: entityType
  };
}

function resolveBallDisplayCode(ball) {
  if (!ball) {
    return null;
  }

  if (ball.color) {
    return ball.color;
  }

  if (ball.entityType === "rainbow") {
    return "RAINBOW";
  }

  if (ball.entityType === "blast") {
    return "BLAST";
  }

  if (ball.entityType === "stone") {
    return "STONE";
  }

  return null;
}

function requireRemainingShotCount(value, description) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(description + " must be a non-negative integer.");
  }
  return value;
}

function ShooterController() {
  BaseSystem.call(this, "ShooterController");
  this.shotLimit = 0;
  this.availableColors = [];
  this.spawnWeights = {};
  this.skillInventory = {
    precise_aim: 0,
    rainbow: 0,
    blast: 0,
    swap: 0,
    barrier_hammer: 0,
    snow_removal: 0
  };
  this.currentBall = null;
  this.nextBall = null;
  this.authoredOpeningQueue = [];
  this.currentColor = null;
  this.nextColor = null;
  this.queueAdvanceRevision = 0;
  this.aimDirection = { x: 0, y: 1 };
  this.origin = clone(BoardLayout.shooterOrigin);
  this.maxAimAngleDeg = 75;
}

ShooterController.prototype = Object.create(BaseSystem.prototype);
ShooterController.prototype.constructor = ShooterController;

ShooterController.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.shotLimit = levelConfig.level.shotLimit || 0;
  this.availableColors = (levelConfig.level.colors || []).slice();
  this.spawnWeights = Object.assign({}, levelConfig.level.spawnWeights || {});
  this.skillInventory.rainbow = 0;
  this.skillInventory.blast = 0;
  this.skillInventory.precise_aim = 0;
  var initialPowerups = levelConfig && levelConfig.level && levelConfig.level.initialPowerups
    ? levelConfig.level.initialPowerups
    : {};
  this.skillInventory.swap = Math.max(0, Math.floor(Number(initialPowerups.swap) || 0));
  this.skillInventory.barrier_hammer = Math.max(0, Math.floor(Number(initialPowerups.barrier_hammer) || 0));
  this.skillInventory.snow_removal = 0;
  this.currentBall = null;
  this.nextBall = null;
  this.authoredOpeningQueue = [];
  if (levelConfig.level.openingShotBalls !== undefined && levelConfig.level.initialShotBalls !== undefined) {
    throw new Error("ShooterController openingShotBalls and initialShotBalls cannot both be configured.");
  }
  if (levelConfig.level.openingShotBalls !== undefined) {
    this._applyOpeningShotBalls(levelConfig.level.openingShotBalls);
  }
  this._syncQueueForRemainingShots(
    levelConfig.level.playMode === "timed_infinite_shots" ? 2 : this.shotLimit
  );
  this.queueAdvanceRevision = 0;
  if (Array.isArray(levelConfig.level.initialShotBalls)) {
    this._applyInitialShotBalls(levelConfig.level.initialShotBalls);
    this._syncQueueForRemainingShots(
      levelConfig.level.playMode === "timed_infinite_shots" ? 2 : this.shotLimit
    );
  }
  this._syncLegacyColorFields();
  this.aimDirection = { x: 0, y: 1 };
  var configuredMaxAimAngle = levelConfig.level && typeof levelConfig.level.aimMaxAngleDeg === "number"
    ? levelConfig.level.aimMaxAngleDeg
    : 75;
  this.maxAimAngleDeg = clamp(configuredMaxAimAngle, 35, 85);
  return this;
};

ShooterController.prototype._applyInitialShotBalls = function (initialShotBalls) {
  if (!Array.isArray(initialShotBalls) || initialShotBalls.length <= 0 || initialShotBalls.length > 2) {
    throw new Error("ShooterController initialShotBalls must contain 1 or 2 colors.");
  }
  initialShotBalls.forEach(function (colorCode, index) {
    if (this.availableColors.indexOf(colorCode) === -1) {
      throw new Error("ShooterController initialShotBalls[" + index + "] must exist in availableColors: " + colorCode);
    }
  }, this);
  this.currentBall = createNormalBall(initialShotBalls[0]);
  if (initialShotBalls.length >= 2) {
    this.nextBall = createNormalBall(initialShotBalls[1]);
  }
};

ShooterController.prototype._applyOpeningShotBalls = function (openingShotBalls) {
  if (!Array.isArray(openingShotBalls) || openingShotBalls.length < 3 || openingShotBalls.length > 6) {
    throw new Error("ShooterController openingShotBalls must contain 3 to 6 colors.");
  }
  if (openingShotBalls.length > this.shotLimit) {
    throw new Error("ShooterController openingShotBalls length must not exceed shotLimit.");
  }
  openingShotBalls.forEach(function (colorCode, index) {
    if (this.availableColors.indexOf(colorCode) === -1) {
      throw new Error("ShooterController openingShotBalls[" + index + "] must exist in availableColors: " + colorCode);
    }
  }, this);
  this.authoredOpeningQueue = openingShotBalls.slice();
};

ShooterController.prototype.resetAimDirection = function () {
  this.aimDirection = { x: 0, y: 1 };
  return this.getAimState();
};

ShooterController.prototype.setAimFromPoint = function (point) {
  var dx = point.x - this.origin.x;
  var dy = point.y - this.origin.y;
  var minForward = 8;
  if (dy < minForward) {
    dy = minForward;
  }

  var maxAimRadians = (this.maxAimAngleDeg * Math.PI) / 180;
  var maxAbsDx = Math.tan(maxAimRadians) * dy;
  dx = clamp(dx, -maxAbsDx, maxAbsDx);
  this.aimDirection = normalizeVector({ x: dx, y: dy });
  return this.getAimState();
};

ShooterController.prototype._syncQueueForRemainingShots = function (remainingShotCount) {
  requireRemainingShotCount(remainingShotCount, "ShooterController remainingShotCount");

  if (remainingShotCount <= 0) {
    this.currentBall = null;
    this.nextBall = null;
    this._syncLegacyColorFields();
    return {
      currentBall: null,
      nextBall: null
    };
  }

  if (!this.currentBall) {
    this.currentBall = this._pickNormalBall();
    if (!this.currentBall) {
      throw new Error("ShooterController requires current ball for remaining shots.");
    }
  }

  if (remainingShotCount === 1) {
    this.nextBall = null;
    this._syncLegacyColorFields();
    return {
      currentBall: clone(this.currentBall),
      nextBall: null
    };
  }

  if (!this.nextBall) {
    this.nextBall = this._pickNormalBall();
    if (!this.nextBall) {
      throw new Error("ShooterController requires next ball for remaining shots.");
    }
  }

  this._syncLegacyColorFields();
  return {
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall)
  };
};

ShooterController.prototype.syncFiniteShotQueue = function (remainingShotCount) {
  var result = this._syncQueueForRemainingShots(remainingShotCount);
  return {
    accepted: true,
    remainingShotCount: remainingShotCount,
    currentBall: result.currentBall,
    nextBall: result.nextBall
  };
};

ShooterController.prototype.advanceQueue = function (remainingShotCountAfterFire, infiniteShots) {
  if (!this.currentBall) {
    throw new Error("ShooterController.advanceQueue requires current ball.");
  }

  var firedBall = clone(this.currentBall);
  this.currentBall = this.nextBall ? clone(this.nextBall) : null;
  this.nextBall = null;

  if (infiniteShots) {
    this._syncQueueForRemainingShots(2);
  } else {
    this._syncQueueForRemainingShots(
      requireRemainingShotCount(remainingShotCountAfterFire, "ShooterController remainingShotCountAfterFire")
    );
  }

  this.queueAdvanceRevision += 1;
  this._syncLegacyColorFields();

  return {
    firedBall: firedBall,
    firedColor: resolveBallDisplayCode(firedBall),
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall),
    queueAdvanceRevision: this.queueAdvanceRevision,
    currentColor: this.currentColor,
    nextColor: this.nextColor
  };
};

ShooterController.prototype.addSkillInventory = function (entityType, count) {
  if (entityType !== "rainbow" && entityType !== "blast") {
    return {
      accepted: false,
      reason: "invalid_skill_type"
    };
  }

  return this.addInventory(entityType, count);
};

ShooterController.prototype.addInventory = function (entityType, count) {
  var supportedTypes = ["precise_aim", "rainbow", "blast", "swap", "barrier_hammer", "snow_removal"];
  if (supportedTypes.indexOf(entityType) === -1) {
    return {
      accepted: false,
      reason: "invalid_inventory_type"
    };
  }

  var gained = Math.max(1, Math.floor(Number(count) || 1));
  this.skillInventory[entityType] = Math.max(0, Math.floor(Number(this.skillInventory[entityType]) || 0)) + gained;
  return {
    accepted: true,
    entityType: entityType,
    gained: gained,
    total: this.skillInventory[entityType]
  };
};

ShooterController.prototype.consumePreciseAim = function () {
  if (!Object.prototype.hasOwnProperty.call(this.skillInventory, "precise_aim")) {
    throw new Error("ShooterController precise_aim inventory is missing.");
  }
  var preciseAimCount = Number(this.skillInventory.precise_aim);
  if (!Number.isInteger(preciseAimCount) || preciseAimCount < 0) {
    throw new Error("ShooterController precise_aim inventory must be a non-negative integer.");
  }
  if (preciseAimCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  this.skillInventory.precise_aim = preciseAimCount - 1;
  return {
    accepted: true,
    remaining: this.skillInventory.precise_aim
  };
};

ShooterController.prototype.setUpcomingNormalBalls = function (colorCode, count) {
  if (this.availableColors.indexOf(colorCode) < 0) {
    throw new Error("ShooterController revive color must exist in availableColors: " + colorCode);
  }
  if (!Number.isInteger(count) || count <= 0 || count > 2) {
    throw new Error("ShooterController revive queue count must be 1 or 2.");
  }

  this.authoredOpeningQueue = [];
  if (count >= 1) {
    this.currentBall = createNormalBall(colorCode);
  }
  if (count >= 2) {
    this.nextBall = createNormalBall(colorCode);
  } else {
    this.nextBall = null;
  }
  this._syncLegacyColorFields();
  return {
    accepted: true,
    color: colorCode,
    assignedCount: count,
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall)
  };
};

ShooterController.prototype.setUpcomingRandomNormalBalls = function (count) {
  if (!Number.isInteger(count) || count <= 0 || count > 2) {
    throw new Error("ShooterController revive random queue count must be 1 or 2.");
  }

  this.authoredOpeningQueue = [];
  if (count >= 1) {
    this.currentBall = this._pickNormalBall();
    if (!this.currentBall) {
      throw new Error("ShooterController revive random current ball is missing.");
    }
  }
  if (count >= 2) {
    this.nextBall = this._pickNormalBall();
    if (!this.nextBall) {
      throw new Error("ShooterController revive random next ball is missing.");
    }
  } else {
    this.nextBall = null;
  }
  this._syncLegacyColorFields();
  return {
    accepted: true,
    assignedCount: count,
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall)
  };
};

ShooterController.prototype.equipSkillBall = function (entityType) {
  if (entityType !== "rainbow" && entityType !== "blast") {
    return {
      accepted: false,
      reason: "invalid_skill_type"
    };
  }

  var inventoryCount = Math.max(0, Math.floor(Number(this.skillInventory[entityType]) || 0));
  if (inventoryCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  if (this.currentBall && this.currentBall.ballCategory === "skill") {
    return {
      accepted: false,
      reason: "current_slot_occupied_by_skill"
    };
  }

  this.skillInventory[entityType] = inventoryCount - 1;
  this.currentBall = createSkillBall(entityType);
  this._syncLegacyColorFields();

  return {
    accepted: true,
    entityType: entityType,
    remaining: this.skillInventory[entityType]
  };
};

ShooterController.prototype.resolveCurrentRainbowColor = function (colorCode) {
  if (this.availableColors.indexOf(colorCode) === -1) {
    return {
      accepted: false,
      reason: "invalid_color"
    };
  }

  if (!this.currentBall || this.currentBall.entityCategory !== "skill_ball" || this.currentBall.entityType !== "rainbow") {
    return {
      accepted: false,
      reason: "current_ball_not_rainbow"
    };
  }

  this.currentBall = createNormalBall(colorCode);
  this._syncLegacyColorFields();

  return {
    accepted: true,
    color: colorCode,
    currentBall: clone(this.currentBall)
  };
};

ShooterController.prototype.swapCurrentAndNextBall = function () {
  var swapCount = Math.max(0, Math.floor(Number(this.skillInventory.swap) || 0));
  if (swapCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  if (!this.currentBall || !this.nextBall) {
    return {
      accepted: false,
      reason: "queue_missing"
    };
  }

  var nextCurrent = clone(this.nextBall);
  var nextPreview = clone(this.currentBall);
  this.currentBall = nextCurrent;
  this.nextBall = nextPreview;
  this.skillInventory.swap = swapCount - 1;
  this._syncLegacyColorFields();

  return {
    accepted: true,
    remaining: this.skillInventory.swap,
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall)
  };
};

ShooterController.prototype.consumeBarrierHammer = function () {
  var hammerCount = Math.max(0, Math.floor(Number(this.skillInventory.barrier_hammer) || 0));
  if (hammerCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  this.skillInventory.barrier_hammer = hammerCount - 1;
  return {
    accepted: true,
    remaining: this.skillInventory.barrier_hammer
  };
};

ShooterController.prototype.consumeSnowRemoval = function () {
  if (!Object.prototype.hasOwnProperty.call(this.skillInventory, "snow_removal")) {
    throw new Error("ShooterController snow_removal inventory is missing.");
  }
  var snowRemovalCount = Number(this.skillInventory.snow_removal);
  if (!Number.isInteger(snowRemovalCount) || snowRemovalCount < 0) {
    throw new Error("ShooterController snow_removal inventory must be a non-negative integer.");
  }
  if (snowRemovalCount <= 0) {
    return {
      accepted: false,
      reason: "inventory_empty"
    };
  }

  this.skillInventory.snow_removal = snowRemovalCount - 1;
  return {
    accepted: true,
    remaining: this.skillInventory.snow_removal
  };
};

ShooterController.prototype.getAimState = function () {
  return {
    origin: clone(this.origin),
    direction: clone(this.aimDirection)
  };
};

ShooterController.prototype.drainRemainingShotBalls = function (remainingCount) {
  if (!Number.isInteger(remainingCount) || remainingCount <= 0) {
    throw new Error("ShooterController.drainRemainingShotBalls requires positive integer remainingCount.");
  }

  var drained = [];
  var current = this.currentBall ? clone(this.currentBall) : null;
  var next = this.nextBall ? clone(this.nextBall) : null;

  for (var index = 0; index < remainingCount; index += 1) {
    if (!current) {
      throw new Error("ShooterController.drainRemainingShotBalls requires current ball at index " + index + ".");
    }
    drained.push(clone(current));
    if (index === remainingCount - 1) {
      break;
    }
    current = next ? clone(next) : this._pickNormalBall();
    if (!current) {
      throw new Error("ShooterController.drainRemainingShotBalls requires next ball at index " + index + ".");
    }
    next = this._pickNormalBall();
    if (!next) {
      throw new Error("ShooterController.drainRemainingShotBalls requires generated preview ball at index " + index + ".");
    }
  }

  this.currentBall = null;
  this.nextBall = null;
  this._syncLegacyColorFields();

  return drained;
};

ShooterController.prototype.getShooterStateForRender = function () {
  return {
    currentBall: this.currentBall,
    nextBall: this.nextBall,
    queueAdvanceRevision: this.queueAdvanceRevision,
    skillInventory: this.skillInventory,
    currentColor: this.currentColor,
    nextColor: this.nextColor,
    aim: {
      origin: this.origin,
      direction: this.aimDirection
    },
    shotLimit: this.shotLimit
  };
};

ShooterController.prototype.getShooterState = function () {
  return {
    currentBall: clone(this.currentBall),
    nextBall: clone(this.nextBall),
    queueAdvanceRevision: this.queueAdvanceRevision,
    skillInventory: clone(this.skillInventory),
    currentColor: this.currentColor,
    nextColor: this.nextColor,
    authoredOpeningQueue: this.authoredOpeningQueue.slice(),
    aim: this.getAimState(),
    shotLimit: this.shotLimit
  };
};

ShooterController.prototype._pickColor = function () {
  if (!this.availableColors.length) {
    return null;
  }

  var totalWeight = this.availableColors.reduce(function (sum, colorCode) {
    return sum + (this.spawnWeights[colorCode] || 1);
  }.bind(this), 0);

  var threshold = Math.random() * totalWeight;
  var running = 0;

  for (var i = 0; i < this.availableColors.length; i += 1) {
    var colorCode = this.availableColors[i];
    running += this.spawnWeights[colorCode] || 1;
    if (threshold <= running) {
      return colorCode;
    }
  }

  return this.availableColors[this.availableColors.length - 1];
};

ShooterController.prototype._pickNormalBall = function () {
  var colorCode = this.authoredOpeningQueue.length > 0
    ? this.authoredOpeningQueue.shift()
    : this._pickColor();
  if (!colorCode) {
    return null;
  }
  return createNormalBall(colorCode);
};

ShooterController.prototype._syncLegacyColorFields = function () {
  this.currentColor = resolveBallDisplayCode(this.currentBall);
  this.nextColor = resolveBallDisplayCode(this.nextBall);
};

ShooterController.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.shotLimit = this.shotLimit;
  snapshot.currentBall = clone(this.currentBall);
  snapshot.nextBall = clone(this.nextBall);
  snapshot.queueAdvanceRevision = this.queueAdvanceRevision;
  snapshot.skillInventory = clone(this.skillInventory);
  snapshot.currentColor = this.currentColor;
  snapshot.nextColor = this.nextColor;
  snapshot.authoredOpeningQueue = this.authoredOpeningQueue.slice();
  snapshot.origin = clone(this.origin);
  snapshot.aimDirection = clone(this.aimDirection);
  snapshot.maxAimAngleDeg = this.maxAimAngleDeg;
  return snapshot;
};

module.exports = ShooterController;

},{"./BaseSystem":"BaseSystem","../../assets/scripts/config/BoardLayout":"BoardLayout"}],
"SpecialAnimationTiming":[function(require,module,exports){
"use strict";

var keyUnlock = {
  flyDuration: 0.62,
  shrinkDuration: 0.08,
  lockShakeStepDuration: 0.04,
  lockShakeStepCount: 5
};

keyUnlock.totalDuration =
  keyUnlock.flyDuration +
  keyUnlock.shrinkDuration +
  keyUnlock.lockShakeStepDuration * keyUnlock.lockShakeStepCount;

var molotovBlast = {
  totalDuration: 0.2,
  blastTriggerDelay: 0
};

var swirlRotation = {
  duration: 0.4,
  angleDegrees: 60
};

var wormholeShift = {
  duration: 0.35
};

var vineCast = {
  previewDuration: 0.65
};

var fairyAssist = {
  flyInDuration: 0.45,
  flyOutDuration: 0.65,
  flyOutDistance: 880
};

function requirePositiveNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!isFinite(numberValue) || numberValue <= 0) {
    throw new Error(fieldName + " must be a positive number.");
  }
  return numberValue;
}

function calculateImpactBounceTotalDuration(pushDistance, bounceSpeed) {
  var safePushDistance = requirePositiveNumber(pushDistance, "Impact bounce pushDistance");
  var safeBounceSpeed = requirePositiveNumber(bounceSpeed, "Impact bounce bounceSpeed");
  var pushDuration = Math.max(
    impactBounce.minPushDuration,
    safePushDistance / safeBounceSpeed
  );
  var returnDuration = Math.max(
    impactBounce.minReturnDuration,
    pushDuration * impactBounce.returnDurationRatio
  );
  return pushDuration + returnDuration + impactBounce.settleDuration;
}

var impactBounce = {
  defaultPushDistance: 12,
  defaultBounceSpeed: 220,
  minPushDuration: 0.028,
  minReturnDuration: 0.06,
  returnDurationRatio: 2.2,
  settleDuration: 0.04
};

impactBounce.totalDuration = calculateImpactBounceTotalDuration(
  impactBounce.defaultPushDistance,
  impactBounce.defaultBounceSpeed
);

var iceSnowballCollect = {
  thawShakeStepDuration: 0.04,
  thawShakeStepCount: 5,
  flyStartDelay: 0.03,
  flyDuration: 0.62
};

iceSnowballCollect.thawShakeTotalDuration =
  iceSnowballCollect.thawShakeStepDuration * iceSnowballCollect.thawShakeStepCount;

iceSnowballCollect.floatingIceDropDelay =
  iceSnowballCollect.thawShakeTotalDuration +
  iceSnowballCollect.flyStartDelay;

module.exports = Object.freeze({
  keyUnlock: Object.freeze(keyUnlock),
  molotovBlast: Object.freeze(molotovBlast),
  swirlRotation: Object.freeze(swirlRotation),
  wormholeShift: Object.freeze(wormholeShift),
  vineCast: Object.freeze(vineCast),
  fairyAssist: Object.freeze(fairyAssist),
  impactBounce: Object.freeze(impactBounce),
  iceSnowballCollect: Object.freeze(iceSnowballCollect),
  calculateImpactBounceTotalDuration: calculateImpactBounceTotalDuration
});

},{}],
"SupportSystem":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function keyFor(row, col) {
  return row + ":" + col;
}

function isLockedAnchor(cell) {
  return !!(
    cell &&
    cell.entityCategory === "locked_ball" &&
    cell.entityType === "locked"
  );
}

function isWormholeAnchor(cell) {
  return !!(
    cell &&
    cell.entityCategory === "reactive_ball" &&
    cell.entityType === "wormhole"
  );
}

function SupportSystem() {
  BaseSystem.call(this, "SupportSystem");
  this.anchorRows = 1;
  this.lastFloatingCells = [];
}

SupportSystem.prototype = Object.create(BaseSystem.prototype);
SupportSystem.prototype.constructor = SupportSystem;

SupportSystem.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  this.anchorRows = 1;
  this.lastFloatingCells = [];
  return this;
};

SupportSystem.prototype.findFloatingCells = function (grid) {
  if (!grid || !Array.isArray(grid.cells)) {
    throw new Error("SupportSystem.findFloatingCells requires grid.cells.");
  }

  var cells = grid.cells;
  var visited = {};
  var queue = [];
  var queueIndex = 0;

  for (var seedIndex = 0; seedIndex < cells.length; seedIndex += 1) {
    var seedCell = cells[seedIndex];
    if (seedCell.row < this.anchorRows || isLockedAnchor(seedCell) || isWormholeAnchor(seedCell)) {
      queue.push({
        row: seedCell.row,
        col: seedCell.col
      });
    }
  }

  while (queueIndex < queue.length) {
    var current = queue[queueIndex];
    queueIndex += 1;
    var currentKey = keyFor(current.row, current.col);
    if (visited[currentKey]) {
      continue;
    }

    visited[currentKey] = true;
    var neighborCoords = grid.getNeighborCoordinates(current.row, current.col);
    for (var neighborIndex = 0; neighborIndex < neighborCoords.length; neighborIndex += 1) {
      var neighbor = neighborCoords[neighborIndex];
      var neighborKey = keyFor(neighbor.row, neighbor.col);
      if (visited[neighborKey]) {
        continue;
      }
      if (!grid.hasCell(neighbor.row, neighbor.col)) {
        continue;
      }
      queue.push(neighbor);
    }
  }

  this.lastFloatingCells = [];
  for (var cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
    var cell = cells[cellIndex];
    if (!visited[keyFor(cell.row, cell.col)]) {
      this.lastFloatingCells.push(cell);
    }
  }

  return clone(this.lastFloatingCells);
};

SupportSystem.prototype.clearFloatingCells = function () {
  this.lastFloatingCells = [];
  return [];
};

SupportSystem.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.anchorRows = this.anchorRows;
  snapshot.lastFloatingCells = clone(this.lastFloatingCells);
  return snapshot;
};

module.exports = SupportSystem;

},{"./BaseSystem":"BaseSystem"}],
"TrajectoryPredictor":[function(require,module,exports){
"use strict";

var BaseSystem = require("./BaseSystem");
var BoardLayout = require("../../assets/scripts/config/BoardLayout");

function normalize(vector) {
  var length = Math.sqrt(vector.x * vector.x + vector.y * vector.y) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function distance(a, b) {
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nearlySamePoint(a, b, epsilon) {
  if (!a || !b) {
    return false;
  }

  var maxError = typeof epsilon === "number" ? epsilon : 0.5;
  return Math.abs(a.x - b.x) <= maxError && Math.abs(a.y - b.y) <= maxError;
}

function pushPathPoint(points, point) {
  if (!point) {
    return;
  }

  if (!points.length || !nearlySamePoint(points[points.length - 1], point)) {
    points.push(clone(point));
  }
}

function buildFallbackPlan(grid, origin, direction) {
  var impactX = origin.x + direction.x * 1200;
  var targetCell = grid.findAttachmentCell({ x: impactX, y: grid.getTopAttachY() }, null, direction, origin);
  var targetCellPosition = grid.getCellPosition(targetCell.row, targetCell.col);

  return {
    valid: true,
    origin: clone(origin),
    direction: clone(direction),
    pathPoints: [clone(origin), clone(targetCellPosition)],
    wallPoints: [],
    wallBounceCount: 0,
    hitType: "fallback",
    hitPoint: { x: impactX, y: grid.getTopAttachY() },
    collidedCell: null,
    targetCell: clone(targetCell),
    targetCellPosition: clone(targetCellPosition),
    totalDistance: distance(origin, targetCellPosition)
  };
}

function buildPlan(origin, direction, wallPoints, hitType, hitPoint, collidedCell, targetCell, targetCellPosition) {
  var pathPoints = [];
  pushPathPoint(pathPoints, origin);

  (wallPoints || []).forEach(function (wallPoint) {
    pushPathPoint(pathPoints, wallPoint);
  });

  // Keep reflection geometry physically correct: travel to the real hit point first.
  pushPathPoint(pathPoints, hitPoint);

  // Then do a tiny snap segment into the final attachment slot center.
  pushPathPoint(pathPoints, targetCellPosition);

  var totalDistance = 0;
  for (var i = 1; i < pathPoints.length; i += 1) {
    totalDistance += distance(pathPoints[i - 1], pathPoints[i]);
  }

  return {
    valid: true,
    origin: clone(origin),
    direction: clone(direction),
    pathPoints: pathPoints,
    wallPoints: clone(wallPoints || []),
    wallBounceCount: (wallPoints || []).length,
    hitType: hitType,
    hitPoint: clone(hitPoint),
    collidedCell: collidedCell ? clone(collidedCell) : null,
    targetCell: clone(targetCell),
    targetCellPosition: clone(targetCellPosition),
    totalDistance: totalDistance
  };
}

function TrajectoryPredictor() {
  BaseSystem.call(this, "TrajectoryPredictor");
  this.maxBounces = 6;
  this.maxRayDistance = 2800;
  this.wallEpsilon = 0.01;
  this.predictionCollisionRadius = Math.max(BoardLayout.bubbleRadius, BoardLayout.collisionDistance - 4);
  this.tunnelAssistRadius = Math.max(BoardLayout.bubbleRadius, this.predictionCollisionRadius - 8);
  this.slotProbeRadius = Math.max(12, BoardLayout.bubbleRadius * 0.62);
  this.slotCaptureTightness = 0.78;
  this.slotBubbleTieDistance = 14;
  this.slotPriorityConfidence = 0.58;
}

TrajectoryPredictor.prototype = Object.create(BaseSystem.prototype);
TrajectoryPredictor.prototype.constructor = TrajectoryPredictor;

TrajectoryPredictor.prototype.configureLevel = function (levelConfig) {
  BaseSystem.prototype.configureLevel.call(this, levelConfig);
  var configured = levelConfig.level && typeof levelConfig.level.aimMaxBounces === "number"
    ? levelConfig.level.aimMaxBounces
    : 6;
  this.maxBounces = Math.max(0, Math.min(8, Math.floor(configured)));

  var configuredCollisionRadius = levelConfig.level && typeof levelConfig.level.aimCollisionRadius === "number"
    ? levelConfig.level.aimCollisionRadius
    : (BoardLayout.collisionDistance - 4);
  this.predictionCollisionRadius = Math.max(
    BoardLayout.bubbleRadius,
    Math.min(BoardLayout.bubbleDiameter, configuredCollisionRadius)
  );

  var configuredTunnelAssistRadius = levelConfig.level && typeof levelConfig.level.aimTunnelAssistRadius === "number"
    ? levelConfig.level.aimTunnelAssistRadius
    : (this.predictionCollisionRadius - 8);
  this.tunnelAssistRadius = Math.max(
    BoardLayout.bubbleRadius,
    Math.min(this.predictionCollisionRadius, configuredTunnelAssistRadius)
  );

  var configuredSlotProbeRadius = levelConfig.level && typeof levelConfig.level.aimSlotProbeRadius === "number"
    ? levelConfig.level.aimSlotProbeRadius
    : (BoardLayout.bubbleRadius * 0.62);
  this.slotProbeRadius = Math.max(10, Math.min(BoardLayout.bubbleRadius, configuredSlotProbeRadius));

  var configuredSlotCaptureTightness = levelConfig.level && typeof levelConfig.level.aimSlotCaptureTightness === "number"
    ? levelConfig.level.aimSlotCaptureTightness
    : 0.78;
  this.slotCaptureTightness = Math.max(0.45, Math.min(1, configuredSlotCaptureTightness));

  var configuredSlotBubbleTieDistance = levelConfig.level && typeof levelConfig.level.aimSlotVsBubbleTieDistance === "number"
    ? levelConfig.level.aimSlotVsBubbleTieDistance
    : 14;
  this.slotBubbleTieDistance = Math.max(0, Math.min(BoardLayout.bubbleDiameter, configuredSlotBubbleTieDistance));

  var configuredSlotPriorityConfidence = levelConfig.level && typeof levelConfig.level.aimSlotPriorityConfidence === "number"
    ? levelConfig.level.aimSlotPriorityConfidence
    : 0.58;
  this.slotPriorityConfidence = clamp(configuredSlotPriorityConfidence, 0, 1);

  return this;
};

TrajectoryPredictor.prototype.predictShotPlan = function (grid, origin, direction) {
  if (!grid || !origin || !direction) {
    return null;
  }

  var rayOrigin = clone(origin);
  var rayDirection = normalize(direction);
  var currentPoint = clone(origin);
  var currentDirection = normalize(direction);
  var wallPoints = [];
  var topAttachY = grid.getTopAttachY();
  var EPSILON = 0.000001;

  for (var bounce = 0; bounce <= this.maxBounces; bounce += 1) {
    var distanceToWall = Number.POSITIVE_INFINITY;

    if (Math.abs(currentDirection.x) > EPSILON) {
      var boundaryX = currentDirection.x > 0 ? BoardLayout.boardRight : BoardLayout.boardLeft;
      var projectedWallDistance = (boundaryX - currentPoint.x) / currentDirection.x;
      if (projectedWallDistance > EPSILON) {
        distanceToWall = projectedWallDistance;
      }
    }

    var probeDistance = Math.min(this.maxRayDistance, isFinite(distanceToWall) ? distanceToWall : this.maxRayDistance);
    var probeEnd = {
      x: currentPoint.x + currentDirection.x * probeDistance,
      y: currentPoint.y + currentDirection.y * probeDistance
    };

    var collisionInfo = grid.findCollisionOnSegment(currentPoint, probeEnd, this.predictionCollisionRadius);
    var distanceToBubble = Number.POSITIVE_INFINITY;
    if (collisionInfo) {
      distanceToBubble = collisionInfo.t * probeDistance;
    }

    var slotInfo = grid.findFirstAttachableSlotOnSegment(
      currentPoint,
      probeEnd,
      currentDirection,
      this.slotProbeRadius,
      this.slotCaptureTightness
    );
    var distanceToSlot = Number.POSITIVE_INFINITY;
    if (slotInfo) {
      distanceToSlot = slotInfo.t * probeDistance;
    }

    var distanceToTop = Number.POSITIVE_INFINITY;
    if (currentDirection.y > EPSILON) {
      var projectedTopDistance = (topAttachY - currentPoint.y) / currentDirection.y;
      if (projectedTopDistance > EPSILON) {
        distanceToTop = projectedTopDistance;
      }
    }

    var preferSlot = this._shouldPreferSlotCandidate(slotInfo, distanceToSlot, distanceToBubble, EPSILON);
    var effectiveSlotDistance = preferSlot ? distanceToSlot : Number.POSITIVE_INFINITY;
    var minDistance = Math.min(distanceToBubble, effectiveSlotDistance, distanceToTop, distanceToWall);

    if (!isFinite(minDistance)) {
      return buildFallbackPlan(grid, rayOrigin, rayDirection);
    }

    if (preferSlot && distanceToSlot <= minDistance + EPSILON && slotInfo) {
      return buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "slot",
        slotInfo.point,
        null,
        slotInfo.cell,
        slotInfo.center
      );
    }

    if (distanceToBubble <= minDistance + EPSILON && collisionInfo) {
      var bubbleImpactPoint = clone(collisionInfo.point);
      var targetFromBubble = grid.findAttachmentCell(
        bubbleImpactPoint,
        collisionInfo.cell,
        currentDirection,
        currentPoint
      );
      var bubbleTargetPosition = grid.getCellPosition(targetFromBubble.row, targetFromBubble.col);

      if (currentDirection.y > 0 && targetFromBubble.row > collisionInfo.cell.row) {
        var tryRadii = [
          this.predictionCollisionRadius,
          this.tunnelAssistRadius,
          Math.max(BoardLayout.bubbleRadius, this.tunnelAssistRadius - 8)
        ];
        var uniqueRadii = [];
        tryRadii.forEach(function (r) {
          var radius = Math.max(BoardLayout.bubbleRadius, Math.min(this.predictionCollisionRadius, r));
          if (uniqueRadii.indexOf(radius) === -1) {
            uniqueRadii.push(radius);
          }
        }, this);

        var bestCandidate = {
          collision: collisionInfo,
          target: targetFromBubble,
          position: bubbleTargetPosition
        };

        var collisionsByRadius = grid.findCollisionsOnSegmentForRadii(currentPoint, probeEnd, uniqueRadii);
        uniqueRadii.forEach(function (radius) {
          var candidateCollision = collisionsByRadius ? collisionsByRadius[radius] : null;
          if (!candidateCollision) {
            return;
          }

          var candidateTarget = grid.findAttachmentCell(
            candidateCollision.point,
            candidateCollision.cell,
            currentDirection,
            currentPoint
          );
          var candidatePosition = grid.getCellPosition(candidateTarget.row, candidateTarget.col);
          var shouldReplace = false;

          if (candidateTarget.row < bestCandidate.target.row) {
            shouldReplace = true;
          } else if (
            candidateTarget.row === bestCandidate.target.row &&
            candidateCollision.t > bestCandidate.collision.t + EPSILON
          ) {
            shouldReplace = true;
          }

          if (shouldReplace) {
            bestCandidate = {
              collision: candidateCollision,
              target: candidateTarget,
              position: candidatePosition
            };
          }
        });

        collisionInfo = bestCandidate.collision;
        bubbleImpactPoint = clone(bestCandidate.collision.point);
        targetFromBubble = bestCandidate.target;
        bubbleTargetPosition = bestCandidate.position;
      }

      return buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "bubble",
        bubbleImpactPoint,
        collisionInfo.cell,
        targetFromBubble,
        bubbleTargetPosition
      );
    }

    if (distanceToTop <= minDistance + EPSILON) {
      var topImpactPoint = {
        x: currentPoint.x + currentDirection.x * distanceToTop,
        y: topAttachY
      };
      var targetFromTop = grid.findAttachmentCell(topImpactPoint, null, currentDirection, currentPoint);
      var topTargetPosition = grid.getCellPosition(targetFromTop.row, targetFromTop.col);

      return buildPlan(
        rayOrigin,
        rayDirection,
        wallPoints,
        "top",
        topImpactPoint,
        null,
        targetFromTop,
        topTargetPosition
      );
    }

    if (distanceToWall <= minDistance + EPSILON && isFinite(distanceToWall) && bounce < this.maxBounces) {
      var wallPoint = {
        x: currentPoint.x + currentDirection.x * distanceToWall,
        y: currentPoint.y + currentDirection.y * distanceToWall
      };
      wallPoints.push(wallPoint);

      currentDirection = {
        x: -currentDirection.x,
        y: currentDirection.y
      };
      currentPoint = {
        x: wallPoint.x + currentDirection.x * this.wallEpsilon,
        y: wallPoint.y + currentDirection.y * this.wallEpsilon
      };
      continue;
    }

    return buildFallbackPlan(grid, rayOrigin, rayDirection);
  }

  return buildFallbackPlan(grid, rayOrigin, rayDirection);
};

TrajectoryPredictor.prototype._shouldPreferSlotCandidate = function (slotInfo, distanceToSlot, distanceToBubble, epsilon) {
  if (!slotInfo || !isFinite(distanceToSlot)) {
    return false;
  }

  if (!isFinite(distanceToBubble)) {
    return true;
  }

  var tieDistance = Math.max(0, this.slotBubbleTieDistance || 0);
  var gap = distanceToSlot - distanceToBubble;
  var slotConfidence = clamp(typeof slotInfo.confidence === "number" ? slotInfo.confidence : 0, 0, 1);

  if (tieDistance <= epsilon) {
    return gap <= epsilon && slotConfidence >= Math.max(0, this.slotPriorityConfidence - 0.08);
  }

  if (gap <= -tieDistance) {
    return true;
  }

  if (gap >= tieDistance) {
    return false;
  }

  var closeness = 1 - clamp(Math.abs(gap) / tieDistance, 0, 1);
  var blendedScore = slotConfidence * 0.75 + closeness * 0.25;
  var requiredConfidence = gap <= epsilon
    ? Math.max(0, this.slotPriorityConfidence - 0.08)
    : this.slotPriorityConfidence;

  return blendedScore >= requiredConfidence;
};

TrajectoryPredictor.prototype.snapshot = function () {
  var snapshot = BaseSystem.prototype.snapshot.call(this);
  snapshot.maxBounces = this.maxBounces;
  snapshot.maxRayDistance = this.maxRayDistance;
  snapshot.predictionCollisionRadius = this.predictionCollisionRadius;
  snapshot.tunnelAssistRadius = this.tunnelAssistRadius;
  snapshot.slotProbeRadius = this.slotProbeRadius;
  snapshot.slotCaptureTightness = this.slotCaptureTightness;
  snapshot.slotBubbleTieDistance = this.slotBubbleTieDistance;
  snapshot.slotPriorityConfidence = this.slotPriorityConfidence;
  return snapshot;
};

module.exports = TrajectoryPredictor;









},{"./BaseSystem":"BaseSystem","../../assets/scripts/config/BoardLayout":"BoardLayout"}],
"WormholeShaderRenderer":[function(require,module,exports){
"use strict";

var BundleLoader = require("../../assets/scripts/utils/BundleLoader");
var EFFECT_RESOURCE_PATH = "game/effects/WormholeFlow";
var UV_EPSILON = 0.000001;
var UV_CORNER_EPSILON = 0.0001;
var MOTION_PARAMS = [0.55, 4.8, 1.6, 2.0];
var SHAPE_PARAMS = [0.44, 0.33, 0.025, 0.13];
var BLUE_HIGHLIGHT = [0.10, 0.65, 1.0, 1.0];
var PURPLE_HIGHLIGHT = [0.55, 0.18, 1.0, 1.0];

function requireFiniteNumber(value, fieldName) {
  var numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(fieldName + " must be finite.");
  }
  return numberValue;
}

function buildUvBasis(spriteFrame) {
  if (!spriteFrame || !spriteFrame.isValid) {
    throw new Error("Wormhole shader requires valid SpriteFrame.");
  }
  var uv = spriteFrame.uv;
  if (!uv || uv.length < 8) {
    throw new Error("Wormhole shader SpriteFrame requires four UV corners.");
  }

  var originX = requireFiniteNumber(uv[0], "Wormhole shader UV origin x");
  var originY = requireFiniteNumber(uv[1], "Wormhole shader UV origin y");
  var axisXX = requireFiniteNumber(uv[2], "Wormhole shader UV right x") - originX;
  var axisXY = requireFiniteNumber(uv[3], "Wormhole shader UV right y") - originY;
  var axisYX = requireFiniteNumber(uv[4], "Wormhole shader UV top x") - originX;
  var axisYY = requireFiniteNumber(uv[5], "Wormhole shader UV top y") - originY;
  var axisXLengthSquared = axisXX * axisXX + axisXY * axisXY;
  var axisYLengthSquared = axisYX * axisYX + axisYY * axisYY;
  if (axisXLengthSquared <= UV_EPSILON || axisYLengthSquared <= UV_EPSILON) {
    throw new Error("Wormhole shader SpriteFrame UV basis is degenerate.");
  }

  var expectedTopRightX = originX + axisXX + axisYX;
  var expectedTopRightY = originY + axisXY + axisYY;
  if (
    Math.abs(expectedTopRightX - Number(uv[6])) > UV_CORNER_EPSILON ||
    Math.abs(expectedTopRightY - Number(uv[7])) > UV_CORNER_EPSILON
  ) {
    throw new Error("Wormhole shader SpriteFrame UV corners must form a parallelogram.");
  }

  return {
    originAxisX: cc.v4(originX, originY, axisXX, axisXY),
    axisY: cc.v4(axisYX, axisYY, axisXLengthSquared, axisYLengthSquared)
  };
}

function resolveSpriteTarget(node) {
  if (!node || !node.isValid || typeof node.getChildByName !== "function") {
    throw new Error("Wormhole shader requires valid bubble node.");
  }
  var iconNode = node.getChildByName("Icon");
  var spriteTarget = iconNode && iconNode.isValid ? iconNode : node;
  var sprite = spriteTarget.getComponent(cc.Sprite);
  if (!sprite) {
    throw new Error("Wormhole shader target requires cc.Sprite.");
  }
  if (typeof sprite.getMaterial !== "function" || typeof sprite.setMaterial !== "function") {
    throw new Error("Wormhole shader target requires Sprite material APIs.");
  }
  return {
    node: spriteTarget,
    sprite: sprite
  };
}

function WormholeShaderRenderer() {
  this.effectAsset = null;
  this.effectLoadPromise = null;
  this.sharedMaterial = null;
}

WormholeShaderRenderer.prototype.preload = function () {
  if (cc.game.renderType === cc.game.RENDER_TYPE_CANVAS) {
    throw new Error("Wormhole shader requires WebGL renderer.");
  }
  if (this.effectAsset && this.effectAsset.isValid) {
    return Promise.resolve(this.effectAsset);
  }
  if (this.effectLoadPromise) {
    return this.effectLoadPromise;
  }
  if (!cc.EffectAsset) {
    throw new Error("Wormhole shader requires cc.EffectAsset.");
  }

  this.effectLoadPromise = new Promise(function (resolve, reject) {
    BundleLoader.loadRes(EFFECT_RESOURCE_PATH, cc.EffectAsset, function (error, effectAsset) {
      if (error) {
        reject(new Error("Wormhole shader effect load failed: " + error.message));
        return;
      }
      if (!effectAsset || !effectAsset.isValid) {
        reject(new Error("Wormhole shader effect asset is invalid: " + EFFECT_RESOURCE_PATH));
        return;
      }
      this.effectAsset = effectAsset;
      resolve(effectAsset);
    }.bind(this));
  }.bind(this)).catch(function (error) {
    this.effectLoadPromise = null;
    throw error;
  }.bind(this));
  return this.effectLoadPromise;
};

WormholeShaderRenderer.prototype.releaseAfterGameplayBundleUnload = function () {
  this.sharedMaterial = null;
  this.effectAsset = null;
  this.effectLoadPromise = null;
};

WormholeShaderRenderer.prototype._getSharedMaterial = function (spriteFrame) {
  if (this.sharedMaterial) {
    if (!this.sharedMaterial.isValid) {
      throw new Error("Wormhole shader shared material is invalid.");
    }
    return this.sharedMaterial;
  }
  if (!this.effectAsset || !this.effectAsset.isValid) {
    throw new Error("Wormhole shader material requires preloaded effect.");
  }
  if (!cc.Material || typeof cc.Material.create !== "function") {
    throw new Error("Wormhole shader requires cc.Material.create.");
  }

  var material = cc.Material.create(this.effectAsset);
  if (!material || !material.isValid || typeof material.setProperty !== "function") {
    throw new Error("Wormhole shader material creation failed.");
  }
  var uvBasis = buildUvBasis(spriteFrame);
  material.setProperty("uvOriginAxisX", uvBasis.originAxisX);
  material.setProperty("uvAxisY", uvBasis.axisY);
  material.setProperty("motionParams", cc.v4(MOTION_PARAMS[0], MOTION_PARAMS[1], MOTION_PARAMS[2], MOTION_PARAMS[3]));
  material.setProperty("shapeParams", cc.v4(SHAPE_PARAMS[0], SHAPE_PARAMS[1], SHAPE_PARAMS[2], SHAPE_PARAMS[3]));
  material.setProperty("blueHighlight", cc.v4(BLUE_HIGHLIGHT[0], BLUE_HIGHLIGHT[1], BLUE_HIGHLIGHT[2], BLUE_HIGHLIGHT[3]));
  material.setProperty("purpleHighlight", cc.v4(PURPLE_HIGHLIGHT[0], PURPLE_HIGHLIGHT[1], PURPLE_HIGHLIGHT[2], PURPLE_HIGHLIGHT[3]));
  this.sharedMaterial = material;
  return material;
};

WormholeShaderRenderer.prototype.syncNode = function (node, cell) {
  if (!cell || cell.entityType !== "wormhole") {
    this.resetNode(node);
    return;
  }
  if (node.__wormholeShaderActive === true) {
    var activeTarget = resolveSpriteTarget(node);
    if (node.__wormholeShaderSprite !== activeTarget.sprite) {
      throw new Error("Wormhole shader active Sprite changed unexpectedly.");
    }
    return;
  }

  var target = resolveSpriteTarget(node);
  if (!target.sprite.spriteFrame || !target.sprite.spriteFrame.isValid) {
    throw new Error("Wormhole shader requires rendered wormhole SpriteFrame.");
  }
  var originalMaterial = target.sprite.getMaterial(0);
  if (!originalMaterial || !originalMaterial.isValid) {
    throw new Error("Wormhole shader requires valid original Sprite material.");
  }
  var appliedMaterial = target.sprite.setMaterial(0, this._getSharedMaterial(target.sprite.spriteFrame));
  if (!appliedMaterial || !appliedMaterial.isValid) {
    throw new Error("Wormhole shader material binding failed.");
  }

  node.__wormholeShaderActive = true;
  node.__wormholeShaderSprite = target.sprite;
  node.__wormholeOriginalMaterial = originalMaterial;
};

WormholeShaderRenderer.prototype.resetNode = function (node) {
  if (!node || !node.isValid) {
    throw new Error("Wormhole shader reset requires valid bubble node.");
  }
  if (node.__wormholeShaderActive !== true) {
    node.__wormholeShaderActive = false;
    return;
  }
  if (!node.__wormholeShaderSprite || !node.__wormholeOriginalMaterial) {
    throw new Error("Wormhole shader reset requires captured Sprite material state.");
  }
  if (!node.__wormholeOriginalMaterial.isValid) {
    throw new Error("Wormhole shader original Sprite material is invalid.");
  }

  var restoredMaterial = node.__wormholeShaderSprite.setMaterial(0, node.__wormholeOriginalMaterial);
  if (!restoredMaterial || !restoredMaterial.isValid) {
    throw new Error("Wormhole shader original material restore failed.");
  }
  node.__wormholeShaderActive = false;
  node.__wormholeShaderSprite = null;
  node.__wormholeOriginalMaterial = null;
};

module.exports = WormholeShaderRenderer;

},{"../../assets/scripts/utils/BundleLoader":"BundleLoader"}]
  }, {}, []);
  if (runtimeGlobal) {
    runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;
    runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;
    runtimeGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__ = gameplayCodeHash;
  }
  if (typeof window !== "undefined" && window) {
    window.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;
    window.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;
    window.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__ = gameplayCodeHash;
  }
  if (typeof GameGlobal !== "undefined" && GameGlobal) {
    GameGlobal.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;
    GameGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;
    GameGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__ = gameplayCodeHash;
  }
  if (typeof globalThis !== "undefined" && globalThis) {
    globalThis.__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ = lazyRequire;
    globalThis.__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ = true;
    globalThis.__BUBBLE_LAZY_GAMEPLAY_CODE_HASH__ = gameplayCodeHash;
  }
}());
