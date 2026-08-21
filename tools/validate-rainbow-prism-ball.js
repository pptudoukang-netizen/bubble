"use strict";

var fs = require("fs");
var path = require("path");

global.cc = {
  log: function () {}
};

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var RainbowPrismBallResolver = require("../gameplay-src/core/RainbowPrismBallResolver");
var GameManager = require("../gameplay-src/core/GameManager");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var ShooterController = require("../gameplay-src/systems/ShooterController");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildLevelConfig() {
  return {
    coordinateSystem: "odd-r-hex",
    level: {
      levelId: 1,
      code: "RAINBOW_PRISM_VALIDATION",
      levelType: "normal",
      initialDropSpaceRows: 8,
      layout: [
        "P..........",
        "R.........",
        "G..........",
        "..........",
        "G..........",
        "R.........",
        "GG.........",
        "B.........",
        "...........",
        "..........",
        "R..........",
        "..........",
        "B..........",
        "R........."
      ],
      specialEntities: [{
        id: "prism_special_contact",
        entityCategory: "hazard_ball",
        entityType: "black_hole",
        capacity: 3,
        row: 8,
        col: 4
      }]
    }
  };
}

function createGrid(levelConfig) {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var resolvedLevelConfig = levelConfig || buildLevelConfig();
  var viewport = new BoardViewportSystem();
  var grid = new BubbleGrid();
  grid.attachBoardViewport(viewport);
  grid.initialize({});
  viewport.initialize({});
  viewport.configureLevel(resolvedLevelConfig);
  grid.configureLevel(resolvedLevelConfig);
  viewport.finishIntroImmediately();
  return {
    grid: grid,
    viewport: viewport
  };
}

function validatePlayableTestLevel() {
  var relativePath = "../assets/map/config/levels/level_rainbow_prism_ball_test.json";
  var configPath = path.resolve(__dirname, relativePath);
  assert(fs.existsSync(configPath), "Playable rainbow prism ball test config is missing.");
  assert(fs.existsSync(configPath + ".meta"), "Playable rainbow prism ball test config meta is missing.");
  var rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  var levelConfig = LevelConfigLoader.normalizeLevelConfig(rawConfig, "level_rainbow_prism_ball_test");
  assert(levelConfig.level.layout.length === 14, "Playable prism test must contain fourteen board rows.");
  var fixture = createGrid(levelConfig);
  var visibleCells = RainbowPrismBallResolver.collectVisibleOrdinaryCells(fixture.grid);
  assert(visibleCells.some(function (cell) { return cell.row === 13; }), "Playable prism test bottom row must be visible.");
  assert(visibleCells.every(function (cell) { return cell.row >= 3; }), "Playable prism test must keep its fully hidden rows outside the prism scan.");
  var hiddenTopCell = fixture.grid.getCell(0, 0);
  assert(hiddenTopCell && hiddenTopCell.entityCategory === "normal_ball", "Playable prism test requires hidden ordinary colors.");
  var nonOrdinaryContact = fixture.grid.getCell(13, 4);
  assert(
    nonOrdinaryContact &&
      nonOrdinaryContact.entityCategory === "obstacle_ball" &&
      nonOrdinaryContact.entityType === "stone",
    "Playable prism test requires an exposed non-ordinary stone contact target."
  );

  var levelManagerSource = fs.readFileSync(path.resolve(__dirname, "../assets/scripts/config/LevelManager.js"), "utf8");
  var levelSelectSource = fs.readFileSync(path.resolve(__dirname, "../assets/scripts/bootstrap/LevelSelectView.js"), "utf8");
  var routeSource = fs.readFileSync(path.resolve(__dirname, "../assets/scripts/bootstrap/GameBootstrapRouteEditorFlowMethods.js"), "utf8");
  var retrySource = fs.readFileSync(path.resolve(__dirname, "../assets/scripts/bootstrap/GameBootstrapLevelRuntimeMethods.js"), "utf8");
  assert(levelManagerSource.indexOf('rainbow_prism_ball: "level_rainbow_prism_ball_test"') >= 0, "Playable prism test LevelManager mapping is missing.");
  assert(levelSelectSource.indexOf('nodeName: "rainbow_prism_ball_test_btn"') >= 0, "Playable prism hidden test button is missing.");
  assert(routeSource.indexOf('grantPowerupInventory("rainbow_prism_ball", 6)') >= 0, "Playable prism test must grant six prism balls on entry.");
  assert(retrySource.indexOf('testSource === "rainbow_prism_ball"') >= 0, "Playable prism test retry source is missing.");
}

function buildShotPlan(collidedCell) {
  return {
    valid: true,
    hitType: collidedCell && collidedCell.entityType === "black_hole" ? "black_hole" : "bubble",
    hitPoint: collidedCell ? { x: collidedCell.col * 10, y: collidedCell.row * 10 } : { x: 0, y: 0 },
    collidedCell: collidedCell,
    penetratedTransparentBalls: [],
    wallBounceCount: 0
  };
}

function validateVisibleRowsAndFirstContactColor() {
  var fixture = createGrid();
  var visible = RainbowPrismBallResolver.collectVisibleOrdinaryCells(fixture.grid);
  var visibleRows = visible.map(function (cell) { return cell.row; });
  assert(visibleRows.indexOf(4) >= 0 && visibleRows.indexOf(13) >= 0, "Prism scan must include the current ten-row viewport.");
  assert(visibleRows.indexOf(0) < 0 && visibleRows.indexOf(2) < 0, "Prism scan must exclude hidden rows above the current viewport.");

  var contact = fixture.grid.getCell(6, 0);
  var plan = RainbowPrismBallResolver.resolve(fixture.grid, buildShotPlan(contact), function () {
    throw new Error("Ordinary first contact must not use random color selection.");
  });
  assert(plan.color === "G" && plan.selectionSource === "first_contact", "Ordinary first contact must determine the prism color.");
  assert(plan.targets.length === 3, "Prism must target every visible ordinary ball with the first-contact color.");
  assert(plan.targets.every(function (cell) { return cell.color === "G" && cell.row >= 4; }), "Prism targets must stay inside the visible board.");
  assert(
    plan.targets.map(function (cell) { return cell.row + ":" + cell.col; }).join(",") === "6:0,6:1,4:0",
    "Prism targets must be ordered from the bottom visible row upward with stable ascending columns per row."
  );
}

function validateSpecialContactRandomColor() {
  var fixture = createGrid();
  var special = fixture.grid.getCell(8, 4);
  var randomCalls = 0;
  var plan = RainbowPrismBallResolver.resolve(fixture.grid, buildShotPlan(special), function () {
    randomCalls += 1;
    return 0;
  });
  assert(randomCalls === 1, "Non-ordinary first contact must select one random visible board color.");
  assert(plan.color === "B", "Random selection must use the stable sorted visible color set.");
  assert(plan.selectionSource === "random_visible_board_color", "Random prism selection source must be explicit.");
  assert(plan.targets.length === 2 && plan.targets.every(function (cell) { return cell.color === "B"; }), "Random prism selection must target every visible ordinary ball of the chosen color.");
  assert(
    plan.targets.map(function (cell) { return cell.row; }).join(",") === "12,7",
    "Random-color prism targets must also be ordered from the bottom visible row upward."
  );
}

function validateAuthoritativeRemoval() {
  var fixture = createGrid();
  var grid = fixture.grid;
  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  manager.systems.supportSystem = {
    findFloatingCells: function () {
      manager.__supportScanCount = (manager.__supportScanCount || 0) + 1;
      return [];
    },
    clearFloatingCells: function () {
      throw new Error("Rainbow prism fixture without swirl must not defer support.");
    }
  };
  manager.systems.jarCollectorSystem = {
    collect: function () {}
  };
  manager.rainbowPrismRandom = function () {
    throw new Error("Ordinary first contact must not call rainbowPrismRandom.");
  };
  manager._resolveReactiveEntitiesAfterRemoval = function () { return []; };
  manager._filterFloatingSpiritCocoons = function (cells) { return cells; };
  manager._collectRemovedKeysAndResolveUnlocks = function () {};
  manager._cancelPendingSplitterSpawnsForDroppedCells = function () {};
  manager._registerResolutionDrops = function () {};
  manager._pushBubbleBreakEvent = function (removedCells, eliminationSequence) {
    manager.__bubbleBreakRemovedCells = removedCells.slice();
    manager.__bubbleBreakSequence = eliminationSequence;
  };
  manager._registerMatchedObjectiveCollection = function () {};
  manager._isBoardCleared = function () { return false; };
  manager._applyResolutionDropScore = function () {};
  manager._registerComboElimination = function () {};
  manager._resolveMultiTrappedSpiritTargets = function () {};

  var contact = grid.getCell(6, 0);
  var resolution = manager._resolveRainbowPrismBallShot({
    ball: {
      ballCategory: "skill",
      color: null,
      entityCategory: "skill_ball",
      entityType: "rainbow_prism_ball"
    },
    shotPlan: buildShotPlan(contact)
  });
  assert(resolution.rainbowPrismClear.color === "G", "Authoritative prism resolution must record the selected color.");
  assert(resolution.matched.length === 3, "Authoritative prism resolution must record every cleared visible same-color ball.");
  assert(grid.getCell(4, 0) === null && grid.getCell(6, 0) === null && grid.getCell(6, 1) === null, "Prism resolution must clear visible same-color ordinary balls.");
  assert(grid.getCell(2, 0) && grid.getCell(2, 0).color === "G", "Prism resolution must preserve hidden same-color rows.");
  assert(grid.getCell(8, 4) && grid.getCell(8, 4).entityType === "black_hole", "Prism resolution must not remove non-ordinary contact targets.");
  assert(
    resolution.matched.map(function (cell) { return cell.row + ":" + cell.col; }).join(",") === "6:0,6:1,4:0",
    "Authoritative prism removal must retain bottom-row-to-top-row order."
  );
  assert(
    resolution.eliminationSequence.map(function (entry) { return entry.row + ":" + entry.col; }).join(",") === "6:0,6:1,4:0",
    "Prism shatter sequence must execute from the bottom visible row upward."
  );
  assert(
    resolution.eliminationSequence.map(function (entry) { return entry.delayMs; }).join(",") === "0,0,30",
    "Prism balls in one row must shatter together before the next row above."
  );
  assert(
    manager.__bubbleBreakRemovedCells.length === 3 && manager.__bubbleBreakSequence === resolution.eliminationSequence,
    "Prism bubble-break presentation must use the authoritative bottom-up elimination sequence."
  );
  assert(manager.__supportScanCount === 1, "Prism resolution must perform one support scan after same-color removal.");
}

function validateInventoryRenderingAndDispatch() {
  var shooter = new ShooterController();
  var grant = shooter.addSkillInventory("rainbow_prism_ball", 2);
  assert(grant.accepted && grant.total === 2, "Shooter inventory must accept rainbow_prism_ball.");
  var equip = shooter.equipSkillBall("rainbow_prism_ball");
  assert(equip.accepted && equip.remaining === 1, "Shooter must equip one rainbow_prism_ball.");
  assert(shooter.currentBall.entityType === "rainbow_prism_ball", "Equipped prism must remain a dedicated skill-ball type.");

  var finalizeSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/core/GameManagerShotFinalizeMethods.js"), "utf8");
  var resourceSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/render/LevelRendererResourceConfig.js"), "utf8");
  var hudSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/render/LevelRendererSceneHudMethods.js"), "utf8");
  var selectorSource = fs.readFileSync(path.resolve(__dirname, "../gameplay-src/render/LevelRendererStateSelectors.js"), "utf8");
  assert(finalizeSource.indexOf("!rainbowPrismShot && projectile.shotPlan && projectile.shotPlan.hitType === \"black_hole\"") >= 0, "Prism shot must bypass black-hole absorption finalization.");
  assert(finalizeSource.indexOf("!rainbowPrismShot && projectile.shotPlan && projectile.shotPlan.hitType === \"wormhole\"") >= 0, "Prism shot must bypass wormhole absorption finalization.");
  assert(resourceSource.indexOf('RAINBOW_PRISM_BALL: "game/image/props/rainbow_prism_ball"') >= 0, "Prism projectile resource mapping is missing.");
  assert(resourceSource.indexOf('rainbow_prism_ball: "game/image/props/rainbow_prism_ball"') >= 0, "Prism bottom-panel icon mapping is missing.");
  assert(hudSource.indexOf('nodeName: "rainbow_prism_ball_btn"') >= 0, "Prism bottom-panel button slot is missing.");
  assert(selectorSource.indexOf('var rainbowPrismBallCount = Number(skillInventory.rainbow_prism_ball);') >= 0, "Prism inventory count must participate in the bottom-panel render key.");
  assert(
    fs.existsSync(path.resolve(__dirname, "../assets/game/image/props/rainbow_prism_ball.png")) &&
      fs.existsSync(path.resolve(__dirname, "../assets/game/image/props/rainbow_prism_ball.png.meta")),
    "Rainbow prism ball image and meta must exist."
  );
}

validateVisibleRowsAndFirstContactColor();
validateSpecialContactRandomColor();
validateAuthoritativeRemoval();
validateInventoryRenderingAndDispatch();
validatePlayableTestLevel();

console.log("[OK] rainbow_prism_ball", "first-contact color, random special contact, visible-row boundary, bottom-up row elimination, removal, support, inventory, rendering and playable test level validated");
