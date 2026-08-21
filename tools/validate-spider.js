"use strict";

var fs = require("fs");
var path = require("path");

var LevelConfigLoader = require("../assets/scripts/config/LevelConfigLoader");
var LevelPackCompactCodec = require("../assets/scripts/config/LevelPackCompactCodec");
var PropDescriptionConfig = require("../assets/scripts/config/PropDescriptionConfig");
var GameBootstrapSpecialIntroduceFlowMethods = require("../assets/scripts/bootstrap/GameBootstrapSpecialIntroduceFlowMethods");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var BubbleGrid = require("../gameplay-src/systems/BubbleGrid");
var BoardViewportSystem = require("../gameplay-src/systems/BoardViewportSystem");
var MatchSystem = require("../gameplay-src/systems/MatchSystem");
var GameManager = require("../gameplay-src/core/GameManager");
var AudioManager = require("../assets/scripts/audio/AudioManager");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var attachLevelRendererSceneSpiderBoardMethods = require("../gameplay-src/render/LevelRendererSceneSpiderBoardMethods");

var ROOT = path.resolve(__dirname, "..");
var LEVEL_KEY = "level_spider_test";
var CONFIG_PATH = path.join(ROOT, "assets/map/config/levels/" + LEVEL_KEY + ".json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDeferred() {
  var resolve;
  var reject;
  var promise = new Promise(function (resolvePromise, rejectPromise) {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise: promise, resolve: resolve, reject: reject };
}

function expectNormalizeFailure(rawConfig, expectedMessage) {
  var failed = false;
  try {
    LevelConfigLoader.normalizeLevelConfig(rawConfig, LEVEL_KEY);
  } catch (error) {
    failed = true;
    assert(
      error && typeof error.message === "string" && error.message.indexOf(expectedMessage) >= 0,
      "Unexpected spider config validation error: " + (error && error.message)
    );
  }
  assert(failed, "Expected spider config validation to fail: " + expectedMessage);
}

function countSpiderCocoons(cells, row) {
  return cells.filter(function (cell) {
    return cell.row === row &&
      cell.entityCategory === "obstacle_ball" &&
      cell.entityType === "spider_cocoon";
  }).length;
}

function validateConfigContract(rawConfig, normalized) {
  assert(normalized.level.spiderRows.length === 3, "Spider test must contain three spiders.");
  assert(normalized.level.spiderRows.filter(function (spider) {
    return spider.lockRowId === "lower_spider_row" && spider.row === 7;
  }).length === 2, "Lower spider row must retain two explicit anchors.");
  assert(normalized.level.spiderRows.filter(function (spider) {
    return spider.lockRowId === "upper_spider_row" && spider.row === 2;
  }).length === 1, "Upper spider row must retain one explicit anchor.");

  var compact = LevelPackCompactCodec.compactPack({
    schemaVersion: 1,
    packId: "spider_validation_pack",
    from: 1,
    to: 1,
    levels: { level_001: normalized }
  });
  var expanded = LevelPackCompactCodec.expandPack(compact).levels.level_001;
  assert(
    JSON.stringify(expanded.level.spiderRows) === JSON.stringify(normalized.level.spiderRows),
    "Compact level codec must preserve spider ids, rows, columns and lock ids."
  );

  var duplicateId = clone(rawConfig);
  duplicateId.level.spiderRows[1].id = duplicateId.level.spiderRows[0].id;
  expectNormalizeFailure(duplicateId, "duplicate id");

  var emptyAnchor = clone(rawConfig);
  emptyAnchor.level.spiderRows[0].col = 1;
  expectNormalizeFailure(emptyAnchor, "anchor must be an ordinary ball");

  var splitSameRowLock = clone(rawConfig);
  splitSameRowLock.level.spiderRows[2].lockRowId = "different_lower_row";
  expectNormalizeFailure(splitSameRowLock, "must use one lockRowId");
}

function createGrid(normalized) {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var grid = new BubbleGrid();
  var viewport = new BoardViewportSystem();
  grid.attachBoardViewport(viewport);
  grid.initialize({});
  viewport.configureLevel(normalized);
  grid.configureLevel(normalized);
  return grid;
}

function validateRuntime(normalized) {
  var grid = createGrid(normalized);
  var matchSystem = new MatchSystem();
  var lastRemovalNotification = [];
  grid.attachCellRemovalListener(function (removedCells) {
    lastRemovalNotification = removedCells.slice();
  });
  matchSystem.configureLevel(normalized);

  assert(grid.getActiveSpiderRow() === 7, "The lowest spider row must filter special hits first.");
  assert(grid.snapshot().activeSpiderRow === 7, "Board snapshot must expose the active spider row.");
  assert(grid.snapshot().spiderRows.length === 2, "Board snapshot must expose one cobweb entry per locked row.");
  assert(countSpiderCocoons(grid.getCells(), 2) === 7, "Upper row empty slots must be filled by seven cocoons.");
  assert(countSpiderCocoons(grid.getCells(), 7) === 6, "Lower odd row empty slots must be filled by six cocoons.");
  assert(grid.getCell(7, 0).spiderId === "lower_spider_left", "Spider anchor must expose its spider id.");
  assert(grid.getCell(7, 3).spiderLocked === true, "Existing balls in a spider row must be locked.");
  assert(grid.getCell(7, 1).entityType === "spider_cocoon", "Empty spider-row slots must become cocoons.");
  assert(grid.getCell(6, 0).spiderProtected === true, "Cells above the lowest spider row must be special-protected.");
  assert(matchSystem.findMatchGroup(grid, grid.getCell(7, 0)).length === 0, "Spider anchors below the threshold must not fabricate a match.");
  assert(matchSystem.findMatchGroup(grid, grid.getCell(7, 3)).length === 0, "Spider-locked row balls must not join ordinary color matches.");
  assert(grid.removeCells([grid.getCell(7, 3)]).length === 0, "Locked non-anchor balls must reject ordinary removal.");
  assert(grid.removeCells([grid.getCell(7, 1)]).length === 0, "Spider cocoons must reject direct removal while the row is locked.");

  var hostMatchGrid = createGrid(normalized);
  var hostMatchSystem = new MatchSystem();
  hostMatchSystem.configureLevel(normalized);
  hostMatchGrid.addBubble({ row: 8, col: 0 }, "R");
  var hostMatch = hostMatchSystem.findMatchGroup(hostMatchGrid, hostMatchGrid.getCell(8, 0));
  assert(hostMatch.length === 3, "A spider host must complete an ordinary three-ball color match.");
  assert(hostMatch.some(function (cell) {
    return cell.spiderId === "lower_spider_left";
  }), "The ordinary color match must contain the spider host ball.");
  var hostMatchRemoval = hostMatchGrid.removeCells(hostMatch);
  assert(hostMatchRemoval.length === 3, "The ordinary color match must remove all three matched balls.");
  assert(hostMatchRemoval.some(function (cell) {
    return cell.spiderId === "lower_spider_left";
  }), "Ordinary color elimination must remove the spider host ball.");
  assert(hostMatchGrid.getCell(7, 0).entityType === "spider_cocoon", "Removing one matched spider host must replace it with a cocoon while another spider remains.");
  assert(hostMatchGrid.getActiveSpiderRow() === 7, "The remaining spider must keep the row locked after an ordinary host match.");

  var filtered = grid.resolveBubbleShieldHits([
    grid.getCell(6, 0),
    grid.getCell(7, 1),
    grid.getCell(7, 0)
  ]);
  assert(filtered.removedShields.length === 0, "Spider range filtering must not fabricate shield removals.");
  assert(
    filtered.removableCells.length === 1 && filtered.removableCells[0].id === "7_0",
    "Special range filtering must retain only the hit spider anchor at the lowest lock layer."
  );

  var firstRemoval = grid.removeCells([grid.getCell(7, 0)]);
  assert(firstRemoval.length === 1 && firstRemoval[0].spiderId === "lower_spider_left", "First lower spider host must be removable.");
  assert(grid.getActiveSpiderRow() === 7, "One remaining spider must keep the lower row locked.");
  assert(grid.getSpiderRows().filter(function (row) { return row.row === 7; })[0].spiders.length === 1, "Lower row must retain one spider owner.");
  assert(grid.getCell(7, 0).entityType === "spider_cocoon", "Removed spider host must be replaced by a cocoon while another spider remains.");
  assert(countSpiderCocoons(grid.getCells(), 7) === 7, "First spider removal must raise the lower cocoon count to seven.");

  var finalLowerFiltered = grid.resolveBubbleShieldHits([grid.getCell(7, 6)]).removableCells;
  var finalLowerRemoval = grid.removeCells(finalLowerFiltered);
  var removedLowerCocoons = lastRemovalNotification.filter(function (cell) {
    return cell.entityType === "spider_cocoon";
  });
  assert(
    finalLowerRemoval.length === finalLowerFiltered.length && finalLowerRemoval.length === 1,
    "Automatic cocoon cleanup must not inflate the authoritative special-hit removal result."
  );
  assert(finalLowerRemoval[0].spiderId === "lower_spider_right", "Second lower spider host must be removed.");
  assert(removedLowerCocoons.length === 7, "Last lower spider must clear all seven lower cocoons together.");
  assert(grid.getActiveSpiderRow() === 2, "Clearing the lower lock must advance the special filter to the upper row.");
  assert(grid.getCell(7, 3).spiderLocked === false, "Last lower spider must unlock surviving row balls.");
  assert(grid.getCell(7, 0) === null, "Cleared lower cocoons must leave empty cells.");

  var manager = new GameManager();
  manager.systems.bubbleGrid = grid;
  var eventCocoons = manager._pushSpiderCocoonBreakEvent(removedLowerCocoons);
  assert(eventCocoons.length === 7, "Cocoon removal event must contain every simultaneous lower-row cocoon.");
  var cocoonEvent = manager.pendingRuntimeEvents[manager.pendingRuntimeEvents.length - 1];
  assert(cocoonEvent.type === "spider_cocoons_removed" && cocoonEvent.cocoons.length === 7, "Runtime must emit one simultaneous cocoon animation event.");

  var finalUpperRemoval = grid.removeCells([grid.getCell(2, 3)]);
  assert(finalUpperRemoval.length === 1, "Final upper host removal must return only the requested host.");
  assert(lastRemovalNotification.filter(function (cell) { return cell.entityType === "spider_cocoon"; }).length === 7, "Last upper spider must notify all upper cocoon removals.");
  assert(grid.getActiveSpiderRow() === null, "All spider protection must end after the final host is removed.");
  assert(grid.getCell(2, 0).spiderLocked !== true, "Final spider removal must restore surviving upper balls.");
}

function validateLockedSpecialInteractions(rawConfig) {
  var swirlRaw = clone(rawConfig);
  swirlRaw.level.layout[6] = "RBRBR.RBRBR";
  swirlRaw.level.specialEntities = [{
    id: "spider_track_swirl",
    entityCategory: "reactive_ball",
    entityType: "swirl",
    row: 6,
    col: 5
  }];
  var swirlGrid = createGrid(LevelConfigLoader.normalizeLevelConfig(swirlRaw, LEVEL_KEY));
  var swirlRejected = false;
  try {
    swirlGrid.rotateSwirlNeighborsClockwise(swirlGrid.getCell(6, 5));
  } catch (error) {
    swirlRejected = error.message.indexOf("spider-locked track cell") >= 0;
  }
  assert(swirlRejected, "Swirl rotation must reject a track intersecting a spider-locked row.");

  var blackHoleRaw = clone(rawConfig);
  blackHoleRaw.level.layout[6] = "RBRBR.RBRBR";
  blackHoleRaw.level.specialEntities = [{
    id: "spider_protected_black_hole",
    entityCategory: "hazard_ball",
    entityType: "black_hole",
    row: 6,
    col: 5,
    capacity: 3
  }];
  var blackHoleGrid = createGrid(LevelConfigLoader.normalizeLevelConfig(blackHoleRaw, LEVEL_KEY));
  var manager = new GameManager();
  manager.systems.bubbleGrid = blackHoleGrid;
  var resolution = { blackHolesUnloaded: [] };
  var remaining = manager._unloadBlackHolesHitByRange(
    [blackHoleGrid.getCell(6, 5)],
    blackHoleGrid,
    resolution,
    "spider_validation"
  );
  assert(remaining.length === 0, "Spider-protected black holes must be filtered before range unload.");
  assert(resolution.blackHolesUnloaded.length === 0, "Spider filtering must not record a black-hole unload above the lowest layer.");
  assert(blackHoleGrid.getCell(6, 5).capacity === 3, "Spider-protected black hole capacity must remain unchanged.");
}

function validatePresentationContract() {
  [
    "spider.png",
    "cobweb.png",
    "spider_cocoon_01.png",
    "spider_cocoon_02.png",
    "spider_cocoon_03.png",
    "spider_cocoon_04.png",
    "spider_cocoon_05.png",
    "spider_cocoon_06.png",
    "spider_cocoon_07.png",
    "spider_cocoon_08.png",
    "spider_cocoon_09.png"
  ].forEach(function (fileName) {
    var filePath = path.join(ROOT, "assets/game/image/spider", fileName);
    assert(fs.existsSync(filePath), "Spider asset is missing: " + fileName + ".");
    assert(fs.existsSync(filePath + ".meta"), "Spider asset meta is missing: " + fileName + ".meta.");
  });
  var crawlingAudioPath = path.join(ROOT, "assets/audio/sound/spider_crawling.mp3");
  assert(fs.existsSync(crawlingAudioPath), "Spider crawling audio asset is missing.");
  assert(fs.existsSync(crawlingAudioPath + ".meta"), "Spider crawling audio meta is missing.");
  var resourceSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererResourceConfig.js"), "utf8");
  var boardSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSceneSpiderBoardMethods.js"), "utf8");
  var fxSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererSceneSpiderFxMethods.js"), "utf8");
  var runtimeSource = fs.readFileSync(path.join(ROOT, "gameplay-src/render/LevelRendererRuntimeMethods.js"), "utf8");
  assert(resourceSource.indexOf('COBWEB: "game/image/spider/cobweb"') >= 0, "Cobweb resource mapping is missing.");
  assert(resourceSource.indexOf('SPIDER_COCOON: "game/image/spider/spider_cocoon_01"') >= 0, "Normal cocoon visual must use frame 01.");
  assert(boardSource.indexOf("webNode.setContentSize(720, 102)") >= 0, "Locked rows must render the authored 720x102 cobweb.");
  assert(boardSource.indexOf("boardSnapshot.spiderRows") >= 0, "Board renderer must use one row-wide web snapshot per active lock.");
  assert(boardSource.indexOf("resolveNearestScreenBoundaryStart(") >= 0, "Pending spiders must render beyond their nearest screen boundary.");
  assert(boardSource.indexOf("cc.moveTo(SPIDER_ENTRANCE_DURATION_SECONDS") >= 0, "Spider entrance must use the fixed two-second move action.");
  assert(
    runtimeSource.indexOf('this.spiderEntranceState = runtimeSnapshot.board.spiderRows.length ? "pending" : "none";') >= 0,
    "Each rendered spider level must initialize one pending entrance."
  );
  assert(fxSource.indexOf("SPIDER_COCOON_0") >= 0, "Cocoon removal must play frames 01 through 09.");

  assert(
    attachLevelRendererSceneSpiderBoardMethods.SPIDER_ENTRANCE_DURATION_SECONDS === 2,
    "Spider entrance duration must remain exactly two seconds."
  );
  var bounds = { left: -360, right: 360, bottom: -640, top: 640 };
  var size = attachLevelRendererSceneSpiderBoardMethods.SPIDER_RENDER_SIZE;
  var leftStart = attachLevelRendererSceneSpiderBoardMethods.resolveNearestScreenBoundaryStart(
    { x: -292.5, y: 109 },
    bounds,
    size
  );
  assert(leftStart.edge === "left", "Lower-left spider must enter from the nearest left screen edge.");
  assert(leftStart.position.x + size.width * 0.5 < bounds.left, "Left entrance start must be fully outside the screen.");
  var rightStart = attachLevelRendererSceneSpiderBoardMethods.resolveNearestScreenBoundaryStart(
    { x: 97.5, y: 109 },
    bounds,
    size
  );
  assert(rightStart.edge === "right", "Lower-right spider must enter from the nearest right screen edge.");
  assert(rightStart.position.x - size.width * 0.5 > bounds.right, "Right entrance start must be fully outside the screen.");
  var topStart = attachLevelRendererSceneSpiderBoardMethods.resolveNearestScreenBoundaryStart(
    { x: 0, y: 600 },
    bounds,
    size
  );
  assert(topStart.edge === "top", "A top-near spider must enter from the top screen edge.");

  var audioConfig = GameBootstrapAudioMethods._buildAudioConfig.call({
    _getGameplayBgmPath: function () { return "sound/game_bg1"; },
    _parseAudioResourceList: GameBootstrapAudioMethods._parseAudioResourceList,
    fairyAssistHitSfxResources: "sound/hit_spirit_1,sound/hit_spirit_2,sound/hit_spirit_3,sound/hit_spirit_4,sound/hit_spirit_5",
    spiderCrawlingSfxResource: "sound/spider_crawling"
  });
  assert(
    audioConfig.sfxMap.spiderCrawling === "sound/spider_crawling",
    "Spider crawling audio config must map to sound/spider_crawling."
  );
}

function validateSpiderEntranceAction() {
  var previousCc = global.cc;
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var moves = [];
  global.cc = {
    sequence: function () {
      return Array.prototype.slice.call(arguments);
    },
    moveTo: function (duration, x, y) {
      moves.push({ duration: duration, x: x, y: y });
      return { type: "move", duration: duration, x: x, y: y };
    },
    callFunc: function (callback) {
      return { type: "call", callback: callback };
    }
  };

  function RendererFixture() {}
  RendererFixture.prototype._renderBoard = function () {};
  attachLevelRendererSceneSpiderBoardMethods(RendererFixture, {
    BALL_RESOURCES: {},
    ensureSprite: function () {}
  });
  var renderer = Object.create(RendererFixture.prototype);
  renderer.spiderEntranceState = "pending";
  renderer.spiderEntranceTargets = {
    spider_a: { x: -130, y: 399 },
    spider_b: { x: 97.5, y: 109 }
  };
  renderer.spiderNodes = {
    spider_a: {
      isValid: true,
      stopAllActions: function () {},
      runAction: function (actions) {
        actions.forEach(function (action) {
          if (action.type === "call") {
            action.callback();
          }
        });
      }
    },
    spider_b: {
      isValid: true,
      stopAllActions: function () {},
      runAction: function (actions) {
        actions.forEach(function (action) {
          if (action.type === "call") {
            action.callback();
          }
        });
      }
    }
  };

  return renderer.playSpiderEntrance().then(function (result) {
    assert(result.durationSeconds === 2, "Spider entrance result must report the exact two-second duration.");
    assert(moves.length === 2, "Every spider must receive one entrance move action.");
    assert(moves.every(function (move) { return move.duration === 2; }), "Every spider move action must last exactly two seconds.");
    assert(renderer.spiderEntranceState === "complete", "Spider entrance must complete only after every spider arrives.");
  }).finally(function () {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  });
}

function validateSpiderCrawlingAudioLifecycle() {
  var previousCc = global.cc;
  var hadCc = Object.prototype.hasOwnProperty.call(global, "cc");
  var playedLoop = null;
  var stoppedAudioId = null;
  global.cc = {
    audioEngine: {
      setEffectsVolume: function () {},
      playEffect: function (clip, loop) {
        assert(clip && clip.id === "spider_crawling", "Spider crawling playback must use the preloaded clip.");
        playedLoop = loop;
        return 27;
      },
      setFinishCallback: function () {},
      stopEffect: function (audioId) {
        stoppedAudioId = audioId;
      }
    }
  };
  var manager = Object.create(AudioManager.prototype);
  manager.settings = { sfxEnabled: true, sfxVolume: 0.8 };
  manager.sfxMap = { spiderCrawling: "sound/spider_crawling" };
  manager._exclusiveSfxPlaybacks = {};
  manager._tryUnlockWebAudio = function () {};
  manager._loadClip = function (resourcePath) {
    assert(resourcePath === "sound/spider_crawling", "Spider crawling SFX must resolve to its exact resource path.");
    return Promise.resolve({ id: "spider_crawling" });
  };

  return manager.playExclusiveSfx("spiderCrawling", "spiderCrawling", { loop: true }).then(function (audioId) {
    assert(audioId === 27, "Spider crawling playback must expose its audio id.");
    assert(playedLoop === true, "Spider crawling audio must loop for the full entrance movement.");
    assert(manager.stopExclusiveSfx("spiderCrawling") === true, "Spider crawling channel must stop after movement.");
    assert(stoppedAudioId === 27, "Stopping spider crawling must stop its exact audio instance.");
  }).finally(function () {
    if (hadCc) {
      global.cc = previousCc;
    } else {
      delete global.cc;
    }
  });
}

function validateCountdownSpiderEntranceOrdering() {
  var countdown = createDeferred();
  var entrance = createDeferred();
  var events = [];
  var settled = false;
  var host = {
    spiderCrawlingSfxResource: "sound/spider_crawling",
    gameManager: {
      getRuntimeSnapshot: function () {
        return { board: { specialEntities: [] } };
      }
    },
    levelRenderer: {
      hasPendingSpiderEntrance: function () { return true; },
      playGameEntryCountdown: function () {
        events.push("countdown_started");
        return countdown.promise;
      },
      warmupGameplayInteractionAssets: function () {
        events.push("interaction_warmup_started");
        return Promise.resolve();
      },
      playSpiderEntrance: function () {
        events.push("spider_entrance_started");
        return entrance.promise;
      }
    },
    audioManager: {
      preloadPaths: function (paths) {
        assert(paths.length === 1 && paths[0] === "sound/spider_crawling", "Countdown must preload the crawling clip.");
        events.push("spider_audio_preload_requested");
        return Promise.resolve([{ id: "spider_crawling" }]);
      },
      playExclusiveSfx: function (channelName, keyOrPath, options) {
        assert(channelName === "spiderCrawling" && keyOrPath === "spiderCrawling", "Spider crawling must use its exclusive channel.");
        assert(options && options.loop === true, "Spider crawling must loop while spiders are moving.");
        events.push("spider_audio_started");
        return Promise.resolve(31);
      },
      stopExclusiveSfx: function (channelName) {
        assert(channelName === "spiderCrawling", "Spider crawling stop must target its exclusive channel.");
        events.push("spider_audio_stopped");
        return true;
      }
    },
    _playSfx: function (key) {
      assert(key === "gameEntryCountdown", "Countdown must retain its own existing SFX.");
    },
    _stopWindTunnelAmbientSfx: function () { return false; },
    _runSpiderEntranceAfterCountdown: GameBootstrapAudioMethods._runSpiderEntranceAfterCountdown
  };
  var readiness = GameBootstrapAudioMethods._runGameEntryCountdown.call(host).then(function () {
    settled = true;
  });
  assert(events.indexOf("spider_entrance_started") < 0, "Spider entrance must not begin before countdown completion.");
  assert(events.indexOf("spider_audio_preload_requested") >= 0, "Spider crawling audio must preload before countdown.");

  return Promise.resolve().then(function () {
    return Promise.resolve();
  }).then(function () {
    assert(events.indexOf("countdown_started") >= 0, "Countdown must start after crawling audio preload succeeds.");
    countdown.resolve();
    return Promise.resolve();
  }).then(function () {
    return Promise.resolve();
  }).then(function () {
    assert(events.indexOf("spider_audio_started") >= 0, "Spider crawling audio must start when countdown completes.");
    assert(events.indexOf("spider_entrance_started") >= 0, "Spider movement must start when countdown completes.");
    assert(settled === false, "Gameplay entry must wait for the two-second spider entrance.");
    entrance.resolve();
    return readiness;
  }).then(function () {
    assert(settled === true, "Gameplay entry must finish after spider entrance completion.");
    assert(events[events.length - 1] === "spider_audio_stopped", "Spider crawling audio must stop when movement completes.");
  });
}

function validateSpiderIntroduction(normalized) {
  var descriptions = PropDescriptionConfig.buildListDefinitions(normalized).filter(function (definition) {
    return definition.key === "special_spider";
  });
  assert(descriptions.length === 1, "Spider rows must expose one spider prop description.");
  assert(
    descriptions[0].iconPath === "game/image/spider/spider",
    "Spider prop description must use the authored spider image."
  );

  var grid = createGrid(normalized);
  var introduceHost = {
    currentLevelConfig: normalized,
    specialIntroduceStore: {
      hasViewed: function () { return false; },
      markViewed: function () {}
    },
    _specialIntroduceQueue: [],
    _specialIntroduceQueuedKeys: {},
    _specialIntroduceCurrentKey: "",
    _showNextSpecialIntroduceView: function () { return Promise.resolve(false); }
  };
  var appended = GameBootstrapSpecialIntroduceFlowMethods._syncSpecialIntroduceForRuntimeSnapshot.call(
    introduceHost,
    {
      state: "running",
      timedLevel: false,
      objectives: null,
      board: { cells: grid.getCells() }
    }
  );
  assert(appended === true, "Runtime spider cocoons must enqueue the spider introduction.");
  assert(
    introduceHost._specialIntroduceQueue.length === 1 &&
    introduceHost._specialIntroduceQueue[0] === "spider",
    "All runtime spider cocoons must share one spider introduction key."
  );
}

function main() {
  var entranceOnly = process.argv.indexOf("--entrance-only") >= 0;
  if (entranceOnly) {
    validatePresentationContract();
    return validateSpiderEntranceAction().then(function () {
      return validateSpiderCrawlingAudioLifecycle();
    }).then(function () {
      return validateCountdownSpiderEntranceOrdering();
    }).then(function () {
      console.log("[OK] spider entrance", "nearest-edge two-second movement and synchronized crawling audio validated");
    });
  }
  var rawConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  var normalized = LevelConfigLoader.normalizeLevelConfig(clone(rawConfig), LEVEL_KEY);
  validateConfigContract(rawConfig, normalized);
  validateRuntime(normalized);
  validateLockedSpecialInteractions(rawConfig);
  validatePresentationContract();
  validateSpiderIntroduction(normalized);
  return validateSpiderEntranceAction().then(function () {
    return validateSpiderCrawlingAudioLifecycle();
  }).then(function () {
    return validateCountdownSpiderEntranceOrdering();
  }).then(function () {
    console.log("[OK] spider", "row locks, host matching, nearest-edge two-second entrance, crawling audio, cocoon animation and cobweb rendering validated");
  });
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
