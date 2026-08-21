"use strict";

var fs = require("fs");
var path = require("path");

global.cc = {
  log: function () {}
};

var BoardLayout = require("../assets/scripts/config/BoardLayout");
var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var CrystalGunPath = require("../gameplay-src/core/CrystalGunPath");
var GameManager = require("../gameplay-src/core/GameManager");
var ShooterController = require("../gameplay-src/systems/ShooterController");

var PROJECT_ROOT = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(relativePath) {
  var text = fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, relativePath), "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function coordinateKey(cell) {
  return cell.row + ":" + cell.col;
}

function assertPath(actual, expected, description) {
  assert(
    actual.cells.map(coordinateKey).join("|") === expected.join("|"),
    description + ": " + actual.cells.map(coordinateKey).join("|")
  );
}

function buildGeometryGrid() {
  return {
    getColumnCountForRow: function (row) {
      return BoardLayout.getRowColumnCount(row, BoardLayout.defaultColumns);
    },
    getCellPosition: function (row, col) {
      return BoardLayout.getCellPosition(row, col, BoardLayout.defaultColumns, 0);
    },
    isValidCell: function (row, col) {
      if (!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0) {
        return false;
      }
      return col < BoardLayout.getRowColumnCount(row, BoardLayout.defaultColumns);
    }
  };
}

function validateGeometry() {
  var grid = buildGeometryGrid();
  var landing = { row: 8, col: 5 };
  var landingPoint = grid.getCellPosition(landing.row, landing.col);
  var steepRight = CrystalGunPath.buildPath(grid, landing, landingPoint, { x: 0.2, y: 1 });
  assertPath(
    steepRight,
    ["7:5", "6:5", "5:5", "4:6", "3:5"],
    "A steep shot must include every coordinate intersected by the real forward ray"
  );
  assert(steepRight.cells.length === CrystalGunPath.MAX_AFFECTED_ROWS, "Crystal gun must affect at most five rows.");
  assert(
    Math.abs(steepRight.direction.x - (0.2 / Math.sqrt(1.04))) < 0.000001 &&
      Math.abs(steepRight.direction.y - (1 / Math.sqrt(1.04))) < 0.000001,
    "Crystal gun must retain the normalized physical impact direction."
  );

  var shallowRight = CrystalGunPath.buildPath(grid, landing, landingPoint, { x: 0.8, y: 0.6 });
  assertPath(
    shallowRight,
    ["7:5", "7:6", "6:7", "6:8", "5:8", "4:9", "4:10"],
    "A shallow shot must include every intersected ball coordinate before leaving the right board edge"
  );
  assert(
    shallowRight.cells.map(coordinateKey).join("|") !== steepRight.cells.map(coordinateKey).join("|"),
    "Different firing angles must not collapse to the same fixed upper-right diagonal."
  );

  var shallowLeft = CrystalGunPath.buildPath(grid, landing, landingPoint, { x: -0.8, y: 0.6 });
  assertPath(
    shallowLeft,
    ["7:4", "7:3", "6:3", "6:2", "5:1", "4:1", "4:0"],
    "A shallow reflected-left ray must include every intersected coordinate before leaving the board"
  );

  var vertical = CrystalGunPath.buildPath(grid, landing, landingPoint, { x: 0, y: 1 });
  assertPath(
    vertical,
    ["7:4", "7:5", "6:5", "5:4", "5:5", "4:5", "3:4", "3:5"],
    "Exactly vertical fire must include both tangent balls when the ray crosses two cells in one row"
  );
  assert(
    vertical.cells.length > CrystalGunPath.MAX_AFFECTED_ROWS,
    "Five affected rows may contain more than five intersected balls."
  );

  var inwardLanding = { row: 6, col: 0 };
  var inwardFromLeftBoundary = CrystalGunPath.buildPath(
    grid,
    inwardLanding,
    grid.getCellPosition(inwardLanding.row, inwardLanding.col),
    { x: 0.2, y: 1 }
  );
  assertPath(
    inwardFromLeftBoundary,
    ["5:0", "4:0", "3:0", "2:1", "1:0"],
    "Touching an odd-row edge must not stop a real ray that continues inside the board"
  );

  var outwardLanding = { row: 6, col: 1 };
  var leaveLeftBoundary = CrystalGunPath.buildPath(
    grid,
    outwardLanding,
    grid.getCellPosition(outwardLanding.row, outwardLanding.col),
    { x: -0.8, y: 0.6 }
  );
  assertPath(leaveLeftBoundary, ["5:0"], "The scan must stop once the real ray leaves the left board edge");

  var topLanding = { row: 2, col: 5 };
  var topStop = CrystalGunPath.buildPath(
    grid,
    topLanding,
    grid.getCellPosition(topLanding.row, topLanding.col),
    { x: 0.2, y: 1 }
  );
  assertPath(topStop, ["1:5", "0:5"], "Crystal gun scan must stop at the top row");

  var rejectedDirection = false;
  try {
    CrystalGunPath.buildPath(
      grid,
      { row: 5, col: 4 },
      grid.getCellPosition(5, 4),
      { x: 0.5, y: 0 }
    );
  } catch (error) {
    rejectedDirection = error.message.indexOf("requires an upward impactDirection") >= 0;
  }
  assert(rejectedDirection, "Crystal gun must reject a non-upward impact direction.");
}

function buildNormalizedLevel() {
  var raw = readJson("assets/map/config/levels/level_001.json");
  raw.level.specialEntities = [{
    id: "crystal_gun_validation",
    entityCategory: "skill_ball",
    entityType: "crystal_gun",
    row: 4,
    col: 5
  }];
  return LevelConfigLoader.normalizeLevelConfig(raw, "level_001");
}

function validateConfigAndCodec() {
  var normalized = buildNormalizedLevel();
  var crystalGun = normalized.level.specialEntities[0];
  assert(
    crystalGun.entityCategory === "skill_ball" && crystalGun.entityType === "crystal_gun",
    "LevelConfigLoader must preserve skill_ball/crystal_gun."
  );

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "crystal_gun_validation_pack",
    from: 1,
    to: 1,
    levels: {
      level_001: normalized
    }
  });
  var encoded = compact.levels.level_001.level.specialEntities[0];
  assert(encoded[2] === "g", "Compact crystal gun must use entity code g.");
  var expanded = LevelPackCompactCodec.expandPack(compact);
  var restored = expanded.levels.level_001.level.specialEntities[0];
  assert(
    restored.entityCategory === "skill_ball" && restored.entityType === "crystal_gun",
    "Compact round trip must restore skill_ball/crystal_gun."
  );
}

function validateInventoryAndCollection() {
  var levelConfig = buildNormalizedLevel();
  var shooter = new ShooterController();
  shooter.initialize({});
  shooter.configureLevel(levelConfig);
  assert(shooter.skillInventory.crystal_gun === 0, "Crystal gun inventory must initialize to zero.");

  var manager = new GameManager();
  manager.systems = {
    shooterController: shooter
  };
  manager.lastResolution = {
    injectedSkills: []
  };
  var events = [];
  manager._pushRuntimeEvent = function (eventType, payload) {
    events.push(Object.assign({ type: eventType }, payload));
  };
  var injected = manager._injectCollectedSkillBalls([{
    id: "collected_crystal_gun",
    entityCategory: "skill_ball",
    entityType: "crystal_gun",
    jarIndex: 0
  }]);
  assert(injected === 1, "Collected crystal gun must enter runtime skill inventory.");
  assert(shooter.skillInventory.crystal_gun === 1, "Collected crystal gun must increment runtime inventory once.");
  assert(events.length === 1 && events[0].entityType === "crystal_gun", "Crystal gun collection must emit the inventory feedback event.");

  var equipped = shooter.equipSkillBall("crystal_gun");
  assert(equipped.accepted === true && equipped.remaining === 0, "Crystal gun must equip and consume one runtime item.");
  assert(
    shooter.currentBall &&
      shooter.currentBall.entityCategory === "skill_ball" &&
      shooter.currentBall.entityType === "crystal_gun",
    "Equipped crystal gun must become the authoritative current shot ball."
  );
}

function validateFireAudio() {
  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5",
    laserSfxResource: "sound/laser",
    _parseAudioResourceList: function (value) {
      return value.split(",");
    },
    _getGameplayBgmPath: function () {
      return "sound/game_bg1";
    }
  });
  assert(audioConfig.sfxMap.laser === "sound/laser", "Audio config must map laser to sound/laser.");

  var crystalGunSfxKey = GameBootstrapAudioMethods._resolveFiredShotSfxKey({
    ballCategory: "skill",
    entityCategory: "skill_ball",
    entityType: "crystal_gun"
  });
  assert(
    crystalGunSfxKey === "laser",
    "A successful crystal gun fire must resolve to laser instead of the normal shot sound."
  );

  var normalBallSfxKey = GameBootstrapAudioMethods._resolveFiredShotSfxKey({
    ballCategory: "normal",
    entityCategory: "normal_ball",
    entityType: null,
    color: "R"
  });
  assert(
    normalBallSfxKey === "shot",
    "A successful normal-ball fire must retain the shot sound."
  );

  var rejectedUnknownCategory = false;
  try {
    GameBootstrapAudioMethods._resolveFiredShotSfxKey({
      entityCategory: "hazard_ball",
      entityType: "black_hole"
    });
  } catch (error) {
    rejectedUnknownCategory = error.message.indexOf("Unsupported fired-ball audio category") >= 0;
  }
  assert(rejectedUnknownCategory, "Shot audio routing must reject unsupported fired-ball categories.");
}

function buildResolutionGrid(cells) {
  var cellMap = {};
  cells.forEach(function (cell) {
    cellMap[coordinateKey(cell)] = clone(cell);
  });
  var geometry = buildGeometryGrid();
  return {
    getColumnCountForRow: geometry.getColumnCountForRow,
    getCellPosition: geometry.getCellPosition,
    isValidCell: geometry.isValidCell,
    getCells: function () {
      return Object.keys(cellMap).map(function (key) {
        return clone(cellMap[key]);
      });
    },
    getNeighborCoordinates: function () {
      return [];
    },
    getCell: function (row, col) {
      var cell = cellMap[row + ":" + col];
      return cell ? clone(cell) : null;
    },
    resolveBubbleShieldHits: function (targets) {
      return {
        removableCells: targets.map(clone),
        removedShields: []
      };
    },
    removeCells: function (targets) {
      return targets.map(function (target) {
        var key = coordinateKey(target);
        var live = cellMap[key];
        if (!live) {
          throw new Error("Crystal gun resolution target disappeared: " + key);
        }
        delete cellMap[key];
        return clone(live);
      });
    },
    removeFloatingCells: function (targets) {
      assert(Array.isArray(targets) && targets.length === 0, "Crystal gun validation expects no floating cells.");
      return [];
    },
    getRemainingKeys: function () {
      return Object.keys(cellMap).sort();
    }
  };
}

function validateAuthoritativeResolution() {
  var pathCells = [
    { id: "off_line_left", row: 8, col: 4, color: "R", entityCategory: "normal_ball", entityType: null },
    { id: "line_8_5", row: 8, col: 5, color: "R", entityCategory: "normal_ball", entityType: null },
    { id: "collided_on_ray", row: 8, col: 6, color: "G", entityCategory: "normal_ball", entityType: null },
    { id: "line_6_5", row: 6, col: 5, color: "B", entityCategory: "normal_ball", entityType: null },
    { id: "line_6_6", row: 6, col: 6, color: "Y", entityCategory: "normal_ball", entityType: null },
    { id: "line_5_5", row: 5, col: 5, color: "P", entityCategory: "normal_ball", entityType: null },
    { id: "line_4_5", row: 4, col: 5, color: "R", entityCategory: "normal_ball", entityType: null },
    { id: "line_4_6", row: 4, col: 6, color: "G", entityCategory: "normal_ball", entityType: null },
    { id: "adjacent_outside_line", row: 8, col: 7, color: "R", entityCategory: "normal_ball", entityType: null }
  ];
  var grid = buildResolutionGrid(pathCells);
  var manager = new GameManager();
  manager.systems = {
    bubbleGrid: grid,
    supportSystem: {
      findFloatingCells: function () {
        return [];
      },
      clearFloatingCells: function () {
        throw new Error("Crystal gun fixture without swirl must not defer support.");
      }
    },
    jarCollectorSystem: {
      collect: function (entries) {
        assert(Array.isArray(entries) && entries.length === 0, "Crystal gun resolution must flush the jar collector with an empty batch.");
        return [];
      }
    }
  };
  manager._unloadBlackHolesHitByRange = function (targets, targetGrid, resolution, sourceType) {
    assert(targetGrid === grid && sourceType === "crystal_gun", "Crystal gun must use the dedicated range source type.");
    assert(Array.isArray(resolution.blackHolesUnloaded), "Crystal gun resolution must initialize black-hole unload events.");
    return targets;
  };
  manager._pushBubbleBreakEvent = function () {};
  manager._resolveVinesAfterRemoval = function () {};
  manager._collectRemovedKeysAndResolveUnlocks = function () {};
  manager._registerMatchedObjectiveCollection = function () {};
  manager._queueBudHatchesAdjacentToCells = function (removedCells, activeResolution, shotBall) {
    assert(removedCells.length === 7, "Crystal gun must pass every occupied ray-intersected cell into the bud adjacency contract.");
    assert(activeResolution && Array.isArray(activeResolution.budHatches), "Crystal gun resolution must initialize bud hatch events.");
    assert(shotBall && shotBall.entityType === "crystal_gun", "Crystal gun bud adjacency must receive the fired skill ball.");
  };
  manager._filterFloatingSpiritCocoons = function (targets) { return targets; };
  manager._cancelPendingSplitterSpawnsForDroppedCells = function () {};
  manager._registerResolutionDrops = function () {};
  manager._createImpactEventFromCell = function (cell) { return { row: cell.row, col: cell.col }; };
  manager._isBoardCleared = function () { return false; };
  manager._applyResolutionDropScore = function (resolution, scoreRuleKey) {
    assert(scoreRuleKey === "crystalGunDrop", "Crystal gun must use its dedicated score rule.");
    return 0;
  };
  manager._registerComboElimination = function () {};

  var crystalGunBall = {
    ballCategory: "skill",
    entityCategory: "skill_ball",
    entityType: "crystal_gun"
  };
  var geometry = buildGeometryGrid();
  var hitPoint = geometry.getCellPosition(9, 5);
  var rawShotPlan = {
    valid: true,
    origin: clone(BoardLayout.shooterOrigin),
    direction: { x: 0, y: 1 },
    pathPoints: [clone(BoardLayout.shooterOrigin), clone(hitPoint)],
    wallPoints: [],
    wallBounceCount: 0,
    hitType: "bubble",
    hitPoint: clone(hitPoint),
    collidedCell: { row: 8, col: 6 },
    targetCell: { row: 9, col: 5 },
    targetCellPosition: clone(hitPoint),
    totalDistance: hitPoint.y - BoardLayout.shooterOrigin.y,
    impactDirection: { x: 0, y: 1 }
  };
  var preparedShotPlan = manager._prepareCrystalGunProjectilePath(crystalGunBall, rawShotPlan);
  var preparedEndPoint = preparedShotPlan.crystalGunPath.endPoint;
  var finalProjectilePoint = preparedShotPlan.pathPoints[preparedShotPlan.pathPoints.length - 1];
  assert(
    rawShotPlan.pathPoints.length === 2 && !rawShotPlan.crystalGunPath,
    "Crystal gun preparation must not mutate the cached trajectory plan."
  );
  assert(
    preparedEndPoint.x === geometry.getCellPosition(4, 5).x + BoardLayout.bubbleRadius &&
      preparedEndPoint.y === geometry.getCellPosition(4, 5).y,
    "Crystal gun flight must end where the ray exits its farthest occupied elimination targets."
  );
  assert(
    finalProjectilePoint.x === preparedEndPoint.x && finalProjectilePoint.y === preparedEndPoint.y,
    "Crystal gun authoritative projectile path must extend to the final elimination endpoint."
  );

  var rejectedEarlyResolution = false;
  try {
    manager._resolveCrystalGunShot({
      position: clone(hitPoint),
      pathPoints: clone(preparedShotPlan.pathPoints),
      ball: clone(crystalGunBall),
      shotPlan: clone(preparedShotPlan)
    }, { row: 9, col: 5 });
  } catch (error) {
    rejectedEarlyResolution = error.message.indexOf("must reach the final elimination endpoint") >= 0;
  }
  assert(rejectedEarlyResolution, "Crystal gun resolution must reject the first collision point before the projectile reaches its final endpoint.");
  assert(grid.getRemainingKeys().length === pathCells.length, "Rejecting early crystal gun resolution must leave the board untouched.");

  var resolution = manager._resolveCrystalGunShot({
    position: clone(preparedEndPoint),
    pathPoints: clone(preparedShotPlan.pathPoints),
    ball: clone(crystalGunBall),
    shotPlan: clone(preparedShotPlan)
  }, { row: 9, col: 5 });
  assertPath(
    resolution.crystalGunPath,
    ["8:5", "8:6", "7:5", "6:5", "6:6", "5:5", "4:5", "4:6"],
    "Resolution must include every coordinate intersected by the five-row physical hit ray"
  );
  assert(
    resolution.crystalGunPath.direction.x === 0 && resolution.crystalGunPath.direction.y === 1,
    "Resolution must retain the normalized physical ray direction."
  );
  assert(
    resolution.crystalGunPath.origin.x === buildGeometryGrid().getCellPosition(9, 5).x &&
      resolution.crystalGunPath.origin.y === buildGeometryGrid().getCellPosition(9, 5).y,
    "Resolution must retain the authoritative physical hit point as its ray origin."
  );
  assert(resolution.matched.length === 7, "An empty intersected coordinate must be skipped without stopping later removals.");
  assert(resolution.impact.row === 9 && resolution.impact.col === 5, "Crystal gun impact must remain anchored to the landing cell.");
  assert(
    grid.getRemainingKeys().join("|") === "8:4|8:7",
    "Crystal gun must clear every same-row ball crossed by the ray while leaving off-line neighbors untouched."
  );
}

function validateResourcesEditorAndIntegration() {
  var pngPath = path.resolve(PROJECT_ROOT, "assets/game/image/ball/crystal_gun.png");
  var metaPath = pngPath + ".meta";
  assert(fs.existsSync(pngPath) && fs.existsSync(metaPath), "Crystal gun image and meta must exist.");
  var laserPath = path.resolve(PROJECT_ROOT, "assets/audio/sound/laser.mp3");
  var laserMetaPath = laserPath + ".meta";
  assert(fs.existsSync(laserPath) && fs.existsSync(laserMetaPath), "Crystal gun laser audio and meta must exist.");
  var laserMeta = readJson("assets/audio/sound/laser.mp3.meta");
  assert(
    laserMeta.importer === "audio-clip" && typeof laserMeta.duration === "number" && laserMeta.duration > 0,
    "Crystal gun laser resource must be an imported non-empty audio clip."
  );
  var meta = readJson("assets/game/image/ball/crystal_gun.png.meta");
  assert(meta.importer === "texture" && meta.type === "sprite" && meta.packable === true, "Crystal gun texture must be a packable sprite.");
  assert(meta.width === 65 && meta.height === 65, "Crystal gun source image must remain 65x65.");
  assert(
    meta.subMetas && meta.subMetas.crystal_gun && meta.subMetas.crystal_gun.uuid === "d9a38bde-607f-42e7-90aa-e6100b3dfa4f",
    "Crystal gun SpriteFrame UUID must match the editor scene reference."
  );

  var editorScene = JSON.parse(readSource("assets/game/scens/editor.fire"));
  var editorNode = editorScene.find(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "crystal_gun";
  });
  assert(editorNode && editorNode._parent.__id__ === 39, "Map editor must expose crystal_gun under prop_layot.");
  var editorSprite = editorScene[editorNode._components[0].__id__];
  assert(
    editorSprite && editorSprite._spriteFrame.__uuid__ === "d9a38bde-607f-42e7-90aa-e6100b3dfa4f",
    "Map editor crystal_gun tool must use the supplied SpriteFrame."
  );

  var resourceSource = readSource("gameplay-src/render/LevelRendererResourceConfig.js");
  var selectorSource = readSource("gameplay-src/render/LevelRendererStateSelectors.js");
  var finalizeSource = readSource("gameplay-src/core/GameManagerShotFinalizeMethods.js");
  var resolverSource = readSource("gameplay-src/core/GameManagerShotCrystalGunMethods.js");
  var inputSource = readSource("gameplay-src/core/GameManagerInputMethods.js");
  var bootstrapSource = readSource("assets/scripts/bootstrap/GameBootstrap.js");
  var audioSource = readSource("assets/scripts/bootstrap/GameBootstrapAudioMethods.js");
  var gameplayInputSource = readSource("assets/scripts/bootstrap/GameBootstrapGameplayInputMethods.js");
  var rendererRuntimeSource = readSource("gameplay-src/render/LevelRendererRuntimeMethods.js");
  var shooterRendererSource = readSource("gameplay-src/render/LevelRendererSceneShooterMethods.js");
  var bottomPanelSource = readSource("gameplay-src/render/LevelRendererSceneBottomPanelMethods.js");
  assert(resourceSource.indexOf('CRYSTAL_GUN: "game/image/ball/crystal_gun"') >= 0, "Renderer must map CRYSTAL_GUN to the supplied asset.");
  assert(selectorSource.indexOf('ballLike.entityType === "crystal_gun"') >= 0, "Renderer must resolve crystal_gun ball visuals.");
  assert(finalizeSource.indexOf("this._resolveCrystalGunShot(projectile, targetCell)") >= 0, "Shot finalization must dispatch crystal_gun to its authoritative resolver.");
  assert(
    resolverSource.indexOf("projectile.shotPlan.hitPoint") >= 0 &&
      resolverSource.indexOf("projectile.shotPlan.impactDirection") >= 0,
    "Crystal gun must derive its scan from the authoritative physical hit ray."
  );
  assert(
    inputSource.indexOf("this._prepareCrystalGunProjectilePath(queueResult.firedBall, shotPlan)") >= 0 &&
      resolverSource.indexOf("must reach the final elimination endpoint before resolution") >= 0,
    "Crystal gun fire must extend the visible projectile path and defer resolution until its final elimination endpoint."
  );
  assert(
    rendererRuntimeSource.indexOf('board: this._getOrCreateLayer("BoardLayer", 40)') >= 0 &&
      rendererRuntimeSource.indexOf('crystalGunProjectile: this._getOrCreateLayer("CrystalGunProjectileLayer", 41)') >= 0,
    "Crystal gun projectile layer must render immediately above the board ball layer."
  );
  var projectileVisualSyncCalls = shooterRendererSource.match(/syncActiveProjectileVisual\(this, activeProjectile\)/g);
  assert(
    shooterRendererSource.indexOf('activeProjectile.ball.entityType === "crystal_gun"') >= 0 &&
      shooterRendererSource.indexOf("renderer.layers.crystalGunProjectile") >= 0 &&
      projectileVisualSyncCalls && projectileVisualSyncCalls.length === 2,
    "Full and projectile-only rendering must route crystal gun flight through its board-front layer."
  );
  assert(
    bootstrapSource.indexOf('default: "sound/laser"') >= 0 &&
      bootstrapSource.indexOf("_resolveFiredShotSfxKey: GameBootstrapAudioMethods._resolveFiredShotSfxKey") >= 0 &&
      audioSource.indexOf("laser: this.laserSfxResource") >= 0,
    "Crystal gun laser audio must be registered in the bootstrap audio configuration."
  );
  assert(
    audioSource.indexOf('firedBall.entityType === "crystal_gun"') >= 0 &&
      gameplayInputSource.indexOf("this._resolveFiredShotSfxKey(snapshot.activeProjectile.ball)") >= 0 &&
      gameplayInputSource.indexOf("this._playSfx(firedSfxKey)") >= 0,
    "A successful crystal gun fire must play laser while other fired balls retain the normal shot sound."
  );
  assert(bottomPanelSource.indexOf('resolveButtonNode("crystal_gun_btn")') >= 0, "Bottom panel must expose the collected crystal gun inventory.");
}

validateGeometry();
validateConfigAndCodec();
validateInventoryAndCollection();
validateFireAudio();
validateAuthoritativeResolution();
validateResourcesEditorAndIntegration();

console.log("Crystal gun validation passed.");
