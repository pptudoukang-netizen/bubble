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
  this.trappedSpriteRescueActive = false;
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
  this.trappedSpriteRescueActive = levelConfig.level.levelType === "trapped_sprite_rescue";
  return this;
};

BoardViewportSystem.prototype.getOffsetY = function () {
  return this.offsetY;
};

BoardViewportSystem.prototype.getTopAttachY = function () {
  return BoardLayout.boardStartY + this.offsetY;
};

BoardViewportSystem.prototype.resetToZeroForCompletion = function () {
  this.offsetY = 0;
  this.targetOffsetY = 0;
  this.phase = "idle";
  this.moveDurationSec = 0;
  this.moveElapsedSec = 0;
  this.moveStartOffsetY = 0;
  this.introActive = false;
  return this.offsetY;
};

BoardViewportSystem.prototype.isMoving = function () {
  return this.phase === "intro_scrolling" || this.phase === "settling";
};

BoardViewportSystem.prototype.planIntroPosition = function (cells) {
  if (!Array.isArray(cells)) {
    throw new Error("BoardViewportSystem.planIntroPosition requires cells array.");
  }
  if (this.trappedSpriteRescueActive) {
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
  if (this.trappedSpriteRescueActive) {
    throw new Error("BoardViewportSystem.planSettle is disabled in trapped sprite rescue mode.");
  }
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
  if (this.trappedSpriteRescueActive) {
    throw new Error("BoardViewportSystem.shiftOffsetYByRows is disabled in trapped sprite rescue mode.");
  }
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
  snapshot.trappedSpriteRescueActive = this.trappedSpriteRescueActive;
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
