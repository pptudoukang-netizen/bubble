"use strict";

var BoardLayout = {
  boardStartY: 515,
  bubbleDiameter: 72,
  bubbleGap: 0,
  rowHeight: 64,
  projectileSpeed: 960,
  impactBounceSpeed: 220,
  jarRimBounceSpeed: 260,
  dropGravity: 900,
  dropInitialSpeedY: 240,
  bubbleRadius: 36,
  boardLeft: -324,
  boardRight: 324,
  dangerLineY: -180,
  shooterOrigin: { x: 0, y: -430 },
  showGhostBubble: true,
  guideFrontClipRadiusScale: 1,
  guideDotPulseSpeedScale: 1,
  jarBaseY: -665,
  jarRenderYOffset: 20,
  jarWidth: 237,
  jarHeight: 230,
  jarSideCollisionWidth: 40,
  jarSlotWidth: 237,
  jarSpacingReduction: 20,
  jarSideYOffset: 20,
  jarLayoutWidth: 0,
  defaultColumns: 10,
  hudBottomLineY: null
};

BoardLayout.cellWidth = BoardLayout.bubbleDiameter + BoardLayout.bubbleGap;
BoardLayout.collisionDistance = BoardLayout.bubbleDiameter - 6;

BoardLayout.getRowColumnCount = function (row, maxColumns) {
  var columns = Math.max(1, maxColumns || this.defaultColumns || 10);
  return row % 2 === 0 ? columns : Math.max(1, columns - 1);
};
BoardLayout.getCellPosition = function (row, col, maxColumns, viewportOffsetY) {
  if (typeof viewportOffsetY !== "number" || !isFinite(viewportOffsetY)) {
    throw new Error("BoardLayout.getCellPosition requires finite viewportOffsetY.");
  }
  var columns = Math.max(1, maxColumns || this.defaultColumns || 10);
  var rowColumns = this.getRowColumnCount(row, columns);
  var baseX = -((columns - 1) * this.cellWidth) / 2 + ((columns - rowColumns) * 0.5 * this.cellWidth);
  return {
    x: baseX + col * this.cellWidth,
    y: this.boardStartY - row * this.rowHeight + viewportOffsetY
  };
};

BoardLayout.getCannonTopLineY = function () {
  if (!this.shooterOrigin || typeof this.shooterOrigin.y !== "number" || !isFinite(this.shooterOrigin.y)) {
    throw new Error("BoardLayout.shooterOrigin.y must be a finite number.");
  }
  if (typeof this.bubbleDiameter !== "number" || !isFinite(this.bubbleDiameter)) {
    throw new Error("BoardLayout.bubbleDiameter must be a finite number.");
  }
  return this.shooterOrigin.y + this.bubbleDiameter;
};

BoardLayout.getHudBottomLineY = function () {
  if (typeof this.hudBottomLineY !== "number" || !isFinite(this.hudBottomLineY)) {
    throw new Error("BoardLayout.hudBottomLineY must be synced from HudPanel before use.");
  }
  return this.hudBottomLineY;
};

BoardLayout.syncHudBottomLineYFromHudPanel = function (hudPanelNode, boardLayerNode) {
  if (!hudPanelNode || !hudPanelNode.isValid) {
    throw new Error("BoardLayout.syncHudBottomLineYFromHudPanel requires valid HudPanel node.");
  }
  if (!boardLayerNode || !boardLayerNode.isValid) {
    throw new Error("BoardLayout.syncHudBottomLineYFromHudPanel requires valid board layer node.");
  }
  if (typeof hudPanelNode.convertToWorldSpaceAR !== "function") {
    throw new Error("HudPanel node must support convertToWorldSpaceAR.");
  }
  if (typeof boardLayerNode.convertToNodeSpaceAR !== "function") {
    throw new Error("Board layer node must support convertToNodeSpaceAR.");
  }

  var height = Number(hudPanelNode.height);
  if (!isFinite(height) || height <= 0) {
    throw new Error("HudPanel height must be a positive finite number.");
  }
  var anchorPoint = hudPanelNode.getAnchorPoint();
  if (!anchorPoint || typeof anchorPoint.y !== "number" || !isFinite(anchorPoint.y)) {
    throw new Error("HudPanel anchorPoint.y must be a finite number.");
  }
  var localBottomOffsetY = -height * (1 - anchorPoint.y);
  var worldBottomCenter = hudPanelNode.convertToWorldSpaceAR(cc.v2(0, localBottomOffsetY));
  var boardBottomCenter = boardLayerNode.convertToNodeSpaceAR(worldBottomCenter);
  if (!boardBottomCenter || typeof boardBottomCenter.y !== "number" || !isFinite(boardBottomCenter.y)) {
    throw new Error("HudPanel bottom Y conversion to board space failed.");
  }
  this.hudBottomLineY = boardBottomCenter.y;
};

BoardLayout.getJarLayoutWidth = function () {
  var fallbackWidth = Math.abs(this.boardRight - this.boardLeft);
  return Math.max(1, this.jarLayoutWidth || fallbackWidth);
};

BoardLayout.getJarCenterPositions = function (jarCount) {
  var count = Math.max(0, Math.floor(jarCount || 0));
  if (!count) {
    return [];
  }

  var layoutWidth = this.getJarLayoutWidth();
  var slotWidth = this.jarSlotWidth || 200;
  var totalSlotWidth = count * slotWidth;
  var gap = 0;
  if (count > 1 && totalSlotWidth < layoutWidth) {
    gap = (layoutWidth - totalSlotWidth) / (count - 1);
  }

  var spacingReduction = this.jarSpacingReduction;
  if (typeof spacingReduction !== "number" || !isFinite(spacingReduction)) {
    throw new Error("BoardLayout.jarSpacingReduction must be a finite number.");
  }
  var step = slotWidth + gap - spacingReduction;
  if (step <= 0) {
    throw new Error("Jar layout step must be positive after jarSpacingReduction.");
  }
  var positions = [];

  if (count % 2 === 1) {
    positions.push(0);
    for (var ring = 1; positions.length < count; ring += 1) {
      positions.push(ring * step);
      if (positions.length < count) {
        positions.push(-ring * step);
      }
    }
  } else {
    var halfStep = step * 0.5;
    for (var index = 0; positions.length < count; index += 1) {
      var offset = halfStep + index * step;
      positions.push(-offset);
      if (positions.length < count) {
        positions.push(offset);
      }
    }
  }

  return positions;
};

BoardLayout.getJarRenderYOffset = function (jarIndex, jarCount) {
  var count = Math.max(0, Math.floor(jarCount || 0));
  if (count <= 1) {
    return 0;
  }
  if (!Number.isInteger(jarIndex) || jarIndex < 0 || jarIndex >= count) {
    throw new Error("BoardLayout.getJarRenderYOffset requires valid jarIndex for jarCount " + count + ".");
  }
  var sideOffset = this.jarSideYOffset;
  if (typeof sideOffset !== "number" || !isFinite(sideOffset)) {
    throw new Error("BoardLayout.jarSideYOffset must be a finite number.");
  }

  var positions = this.getJarCenterPositions(count);
  var jarX = positions[jarIndex];
  if (count % 2 === 1) {
    return jarX === 0 ? 0 : sideOffset;
  }
  if (count === 2) {
    return sideOffset;
  }

  var minAbsX = positions.reduce(function (minValue, x) {
    return Math.min(minValue, Math.abs(x));
  }, Infinity);
  return Math.abs(jarX) > minAbsX + 0.001 ? sideOffset : 0;
};

BoardLayout.getJarRenderZIndex = function (jarIndex, jarCount) {
  var count = Math.max(0, Math.floor(jarCount || 0));
  if (!count) {
    return 0;
  }
  if (!Number.isInteger(jarIndex) || jarIndex < 0 || jarIndex >= count) {
    throw new Error("BoardLayout.getJarRenderZIndex requires valid jarIndex for jarCount " + count + ".");
  }
  if (count === 1) {
    return 0;
  }

  var positions = this.getJarCenterPositions(count);
  var absValues = positions.map(function (x) {
    return Math.abs(x);
  });
  var maxAbsX = absValues.reduce(function (maxValue, value) {
    return Math.max(maxValue, value);
  }, 0);
  var minAbsX = absValues.reduce(function (minValue, value) {
    return Math.min(minValue, value);
  }, Infinity);
  if (maxAbsX - minAbsX < 0.001) {
    return 0;
  }

  var jarAbsX = Math.abs(positions[jarIndex]);
  var centerWeight = (maxAbsX - jarAbsX) / (maxAbsX - minAbsX);
  return Math.round(centerWeight * (count - 1));
};

module.exports = BoardLayout;



