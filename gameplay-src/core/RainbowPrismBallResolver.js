"use strict";

var BoardLayout = require("../../assets/scripts/config/BoardLayout");

function requireGrid(grid) {
  if (
    !grid ||
    typeof grid.getCells !== "function" ||
    typeof grid.getCellPosition !== "function"
  ) {
    throw new Error("Rainbow prism ball requires BubbleGrid cell and position access.");
  }
  return grid;
}

function requireRandomUnit(randomFn) {
  if (typeof randomFn !== "function") {
    throw new Error("Rainbow prism ball requires a random function.");
  }
  var value = randomFn();
  if (typeof value !== "number" || !isFinite(value) || value < 0 || value >= 1) {
    throw new Error("Rainbow prism ball random value must be in [0, 1).");
  }
  return value;
}

function requireNormalColor(cell, description) {
  if (typeof cell.color !== "string" || !cell.color) {
    throw new Error(description + " ordinary ball requires color.");
  }
  return cell.color;
}

function isVisibleCell(grid, cell) {
  if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
    throw new Error("Rainbow prism ball visibility scan requires integer cell coordinates.");
  }
  var position = grid.getCellPosition(cell.row, cell.col);
  if (
    !position ||
    typeof position.x !== "number" ||
    !isFinite(position.x) ||
    typeof position.y !== "number" ||
    !isFinite(position.y)
  ) {
    throw new Error("Rainbow prism ball visibility scan requires finite cell position.");
  }
  var bubbleRadius = Number(BoardLayout.bubbleRadius);
  if (!isFinite(bubbleRadius) || bubbleRadius <= 0) {
    throw new Error("Rainbow prism ball visibility scan requires positive bubbleRadius.");
  }
  var hudBottomLineY = BoardLayout.getHudBottomLineY();
  var cannonTopLineY = BoardLayout.getCannonTopLineY();
  if (hudBottomLineY <= cannonTopLineY) {
    throw new Error("Rainbow prism ball visibility bounds are inverted.");
  }
  return position.y + bubbleRadius >= cannonTopLineY &&
    position.y - bubbleRadius <= hudBottomLineY;
}

function collectVisibleOrdinaryCells(grid) {
  var safeGrid = requireGrid(grid);
  var cells = safeGrid.getCells();
  if (!Array.isArray(cells)) {
    throw new Error("Rainbow prism ball requires BubbleGrid.getCells array.");
  }
  return cells.filter(function (cell, index) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
      throw new Error("Rainbow prism ball board cell must be an object at index " + index + ".");
    }
    if (cell.entityCategory !== "normal_ball") {
      return false;
    }
    requireNormalColor(cell, "Rainbow prism ball visible");
    return isVisibleCell(safeGrid, cell);
  });
}

function compareBottomUp(left, right) {
  if (left.row !== right.row) {
    return right.row - left.row;
  }
  return left.col - right.col;
}

function resolveRandomVisibleColor(visibleOrdinaryCells, randomFn) {
  var colorMap = {};
  visibleOrdinaryCells.forEach(function (cell) {
    colorMap[requireNormalColor(cell, "Rainbow prism ball random candidate")] = true;
  });
  var colors = Object.keys(colorMap).sort();
  if (!colors.length) {
    throw new Error("Rainbow prism ball requires an ordinary color in the current visible board.");
  }
  return colors[Math.floor(requireRandomUnit(randomFn) * colors.length)];
}

function hasEarlierTransparentContact(shotPlan) {
  if (!Array.isArray(shotPlan.penetratedTransparentBalls)) {
    throw new Error("Rainbow prism ball shot plan requires penetratedTransparentBalls array.");
  }
  return shotPlan.penetratedTransparentBalls.length > 0;
}

function resolve(grid, shotPlan, randomFn) {
  var safeGrid = requireGrid(grid);
  if (!shotPlan || typeof shotPlan !== "object" || Array.isArray(shotPlan)) {
    throw new Error("Rainbow prism ball requires shotPlan.");
  }
  var visibleOrdinaryCells = collectVisibleOrdinaryCells(safeGrid);
  var collidedCell = shotPlan.collidedCell;
  var contactIsOrdinary = !hasEarlierTransparentContact(shotPlan) &&
    !!collidedCell &&
    collidedCell.entityCategory === "normal_ball";
  var selectedColor = contactIsOrdinary
    ? requireNormalColor(collidedCell, "Rainbow prism ball first contact")
    : resolveRandomVisibleColor(visibleOrdinaryCells, randomFn);
  var targets = visibleOrdinaryCells.filter(function (cell) {
    return cell.color === selectedColor;
  }).sort(compareBottomUp);
  if (!targets.length) {
    throw new Error("Rainbow prism ball selected color has no ordinary ball in the current visible board: " + selectedColor);
  }

  var visibleRows = {};
  visibleOrdinaryCells.forEach(function (cell) {
    visibleRows[cell.row] = true;
  });
  return {
    color: selectedColor,
    selectionSource: contactIsOrdinary ? "first_contact" : "random_visible_board_color",
    targets: targets,
    visibleRows: Object.keys(visibleRows).map(Number).sort(function (left, right) {
      return left - right;
    })
  };
}

module.exports = {
  collectVisibleOrdinaryCells: collectVisibleOrdinaryCells,
  isVisibleCell: isVisibleCell,
  resolve: resolve
};
