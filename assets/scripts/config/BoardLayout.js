"use strict";

var BoardLayout = {
  boardStartY: 515,
  bubbleDiameter: 65,
  bubbleGap: 0,
  rowHeight: 58,
  projectileSpeed: 960,
  impactBounceSpeed: 220,
  jarRimBounceSpeed: 260,
  dropGravity: 900,
  dropInitialSpeedY: 240,
  bubbleRadius: 32.5,
  boardLeft: -325,
  boardRight: 325,
  dangerLineY: -180,
  shooterOrigin: { x: 0, y: -430 },
  showGhostBubble: true,
  guideFrontClipRadiusScale: 1,
  guideDotPulseSpeedScale: 1,
  jarBaseY: -665,
  jarRenderYOffset: 50,
  jarWidth: 237,
  jarHeight: 230,
  jarMouthWidth: 227,
  jarHorizontalPadding: 4,
  jarSideCollisionWidth: 40,
  jarSideYOffset: 10,
  jarLayoutWidth: 0,
  defaultColumns: 11,
  hudBottomLineY: null
};

BoardLayout.cellWidth = BoardLayout.bubbleDiameter + BoardLayout.bubbleGap;
BoardLayout.collisionDistance = BoardLayout.bubbleDiameter - 6;

BoardLayout.getRowColumnCount = function (row, maxColumns) {
  var columns = Math.max(1, maxColumns || this.defaultColumns || 11);
  return row % 2 === 0 ? columns : Math.max(1, columns - 1);
};
BoardLayout.getCellPosition = function (row, col, maxColumns, viewportOffsetY) {
  if (typeof viewportOffsetY !== "number" || !isFinite(viewportOffsetY)) {
    throw new Error("BoardLayout.getCellPosition requires finite viewportOffsetY.");
  }
  var columns = Math.max(1, maxColumns || this.defaultColumns || 11);
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
  return this.getJarLayout(jarCount).positions.slice();
};

BoardLayout.getJarLayout = function (jarCount) {
  if (!Number.isInteger(jarCount) || jarCount <= 0) {
    throw new Error("BoardLayout.getJarLayout requires positive integer jarCount.");
  }
  var count = jarCount;
  var layoutWidth = this.getJarLayoutWidth();
  var jarWidth = Number(this.jarWidth);
  var jarHeight = Number(this.jarHeight);
  var mouthWidth = Number(this.jarMouthWidth);
  var horizontalPadding = Number(this.jarHorizontalPadding);
  if (!isFinite(jarWidth) || jarWidth <= 0 || !isFinite(jarHeight) || jarHeight <= 0) {
    throw new Error("BoardLayout jarWidth and jarHeight must be positive finite numbers.");
  }
  if (!isFinite(mouthWidth) || mouthWidth <= 0 || mouthWidth > jarWidth) {
    throw new Error("BoardLayout.jarMouthWidth must be within (0, jarWidth].");
  }
  if (!isFinite(horizontalPadding) || horizontalPadding < 0 || horizontalPadding * 2 >= layoutWidth) {
    throw new Error("BoardLayout.jarHorizontalPadding must leave positive jar layout width.");
  }
  var availableWidth = layoutWidth - horizontalPadding * 2;
  var scale = Math.min(1, availableWidth / (count * mouthWidth));
  if (!isFinite(scale) || scale <= 0) {
    throw new Error("BoardLayout jar scale must be a positive finite number.");
  }
  var renderedMouthWidth = mouthWidth * scale;
  var renderedWidth = jarWidth * scale;
  var renderedHeight = jarHeight * scale;
  var centerSpan = availableWidth - renderedMouthWidth;
  var step = count === 1 ? 0 : centerSpan / (count - 1);
  var positions = [];
  for (var index = 0; index < count; index += 1) {
    positions.push(count === 1 ? 0 : -centerSpan * 0.5 + step * index);
  }
  for (var positionIndex = 0; positionIndex < positions.length; positionIndex += 1) {
    var left = positions[positionIndex] - renderedMouthWidth * 0.5;
    var right = positions[positionIndex] + renderedMouthWidth * 0.5;
    var halfLayoutWidth = layoutWidth * 0.5;
    if (left < -halfLayoutWidth - 0.001 || right > halfLayoutWidth + 0.001) {
      throw new Error("Jar mouth exceeds screen width at index " + positionIndex + ".");
    }
    if (positionIndex > 0 && positions[positionIndex] - positions[positionIndex - 1] < renderedMouthWidth - 0.001) {
      throw new Error("Jar mouths overlap at index " + (positionIndex - 1) + " and " + positionIndex + ".");
    }
  }
  return {
    count: count,
    layoutWidth: layoutWidth,
    scale: scale,
    positions: positions,
    mouthWidth: renderedMouthWidth,
    renderWidth: renderedWidth,
    renderHeight: renderedHeight,
    centerStep: step
  };
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

  var centerIndex = (count - 1) * 0.5;
  var distanceFromCenter = Math.ceil(Math.abs(jarIndex - centerIndex));
  return distanceFromCenter * sideOffset;
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



