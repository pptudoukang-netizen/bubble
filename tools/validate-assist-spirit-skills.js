"use strict";

var fs = require("fs");
var path = require("path");

global.cc = {
  log: function () {},
  warn: function () {},
  error: function () {}
};

var projectRoot = path.resolve(__dirname, "..");
var BoardLayout = require("../assets/scripts/config/BoardLayout");
var AssistSpiritConfig = require("../assets/scripts/config/AssistSpiritConfig");
var AssistSpiritSkillConfig = require("../gameplay-src/config/AssistSpiritSkillConfig");
var AssistSpiritSkillChargeConfig = require("../gameplay-src/config/AssistSpiritSkillChargeConfig");
var AssistSpiritPresentationConfig = require("../gameplay-src/config/AssistSpiritPresentationConfig");
var GameManager = require("../gameplay-src/core/GameManager");
var GameBootstrapAudioMethods = require("../assets/scripts/bootstrap/GameBootstrapAudioMethods");
var GameBootstrapAssistSpiritSkillMethods = require("../assets/scripts/bootstrap/GameBootstrapAssistSpiritSkillMethods");

function assert(condition, message) {
  if (!condition) {
    throw new Error("[validate-assist-spirit-skills] " + message);
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
}

function createLevelConfig(options) {
  var levelConfig = readJson("assets/map/config/levels/level_test.json");
  levelConfig.level.levelId = options.levelId;
  levelConfig.level.code = "ASSIST_SPIRIT_SKILL_" + options.levelId;
  levelConfig.level.layout = options.onlyIce
    ? [
      "...........",
      "..........",
      "...........",
      "..........",
      "...........",
      "..........",
      "...........",
      ".........."
    ]
    : (options.singleBall ? [
      "R..........",
      "..........",
      "...........",
      "..........",
      "...........",
      "..........",
      "...........",
      ".........."
    ]
    : [
      "RRRR.......",
      "RRRR......",
      "RRRR.......",
      "..........",
      "...........",
      "..........",
      "...........",
      ".........."
    ]);
  levelConfig.level.specialEntities = [];
  levelConfig.level.boardOcclusionPlan = {
    generatorVersion: 1,
    mode: "none",
    variants: []
  };
  if (options.withVine) {
    levelConfig.level.specialEntities.push({
      id: "assist_vine",
      entityCategory: "reactive_ball",
      entityType: "vine_spirit",
      row: 2,
      col: 4
    });
  }
  if (options.withIce) {
    levelConfig.level.specialEntities.push({
      id: "assist_ice",
      entityCategory: "obstacle_ball",
      entityType: "ice",
      innerColor: "B",
      row: 1,
      col: 4
    });
  }
  return levelConfig;
}

function startManager(spiritId, spiritLevel, options) {
  BoardLayout.hudBottomLineY = BoardLayout.boardStartY + BoardLayout.bubbleRadius;
  var manager = new GameManager();
  manager.setEquippedAssistSpirit(spiritId, spiritLevel);
  var levelConfig = createLevelConfig(options);
  manager.startLevel(levelConfig, {
    runMode: "assist_spirit_skill_validation",
    attemptIndex: 1,
    seed: "assist-spirit-skill:" + options.levelId
  });
  if (
    options.startCharged !== false &&
    AssistSpiritSkillConfig.getBySpiritId(spiritId).skillId
  ) {
    manager.assistSpiritSkillCharge = AssistSpiritSkillChargeConfig.getMaxCharge(spiritId, spiritLevel);
  }
  return manager;
}

function addActiveVine(manager) {
  var grid = manager.systems.bubbleGrid;
  grid.beginVinePreview("assist_vine", { row: 0, col: 0 });
  grid.completeVineEntanglement("assist_vine", { row: 0, col: 0 });
}

function validateResourcesAndPrefab() {
  AssistSpiritSkillConfig.getAllSpritePaths().forEach(function (resourcePath) {
    var relativePng = resourcePath.slice("game/".length) + ".png";
    assert(
      fs.existsSync(path.join(projectRoot, "assets/game", relativePng)),
      "Missing configured skill image: " + resourcePath
    );
  });
  var prefab = readJson("assets/game/prefabs/game/ShooterPanel.prefab");
  var skillNodes = prefab.filter(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "Skill";
  });
  assert(skillNodes.length === 1, "ShooterPanel must contain exactly one Skill node.");
  var skillNodeIndex = prefab.indexOf(skillNodes[0]);
  var componentTypes = skillNodes[0]._components.map(function (reference) {
    return prefab[reference.__id__].__type__;
  });
  assert(componentTypes.indexOf("cc.Sprite") >= 0, "ShooterPanel Skill requires cc.Sprite.");
  assert(componentTypes.indexOf("cc.Button") >= 0, "ShooterPanel Skill requires cc.Button.");
  assert(skillNodeIndex > 0, "ShooterPanel Skill node must be serialized.");
  var adChildNodes = prefab.filter(function (entry) {
    return entry && entry.__type__ === "cc.Node" && entry._name === "ad" && entry._parent && entry._parent.__id__ === skillNodeIndex;
  });
  assert(adChildNodes.length === 1, "ShooterPanel Skill requires exactly one ad child label.");

  var shooterRendererSource = fs.readFileSync(
    path.join(projectRoot, "gameplay-src/render/LevelRendererSceneShooterMethods.js"),
    "utf8"
  );
  assert(
    shooterRendererSource.indexOf('"SkillChargeFill"') >= 0 &&
      shooterRendererSource.indexOf("cc.Sprite.Type.FILLED") >= 0 &&
      shooterRendererSource.indexOf("cc.Sprite.FillType.VERTICAL") >= 0,
    "ShooterPanel Skill charge presentation requires a top-down filled color layer."
  );
  var chargeVisualStart = shooterRendererSource.indexOf("function syncAssistSkillChargeVisual");
  var chargeVisualEnd = shooterRendererSource.indexOf("function syncShooterPrefabLayout", chargeVisualStart);
  assert(
    chargeVisualStart >= 0 && chargeVisualEnd > chargeVisualStart,
    "ShooterPanel Skill charge visual synchronization is required."
  );
  var chargeVisualSource = shooterRendererSource.slice(chargeVisualStart, chargeVisualEnd);
  var fillSizeModeIndex = chargeVisualSource.indexOf("fill.sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM");
  var fillFrameIndex = chargeVisualSource.indexOf("fill.sprite.spriteFrame = skillFrame");
  var fillLayoutAfterFrameIndex = chargeVisualSource.lastIndexOf("fill.node.setContentSize(skillNode.getContentSize())");
  assert(
    fillSizeModeIndex >= 0 &&
      fillFrameIndex > fillSizeModeIndex &&
      fillLayoutAfterFrameIndex > fillFrameIndex &&
      chargeVisualSource.indexOf("fill.node.setAnchorPoint(skillNode.anchorX, skillNode.anchorY)") >= 0,
    "ShooterPanel SkillChargeFill must preserve authored anchor and size after its first SpriteFrame assignment."
  );
  var assistSkillButtonStart = shooterRendererSource.indexOf('this._bindBottomPanelButton(assistSkillNode, "use_assist_spirit_skill")');
  var assistSkillButtonEnd = shooterRendererSource.indexOf("var nextAnchor", assistSkillButtonStart);
  assert(
    assistSkillButtonStart >= 0 && assistSkillButtonEnd > assistSkillButtonStart,
    "ShooterPanel Skill button binding is required."
  );
  var assistSkillButtonSource = shooterRendererSource.slice(assistSkillButtonStart, assistSkillButtonEnd);
  assert(
    assistSkillButtonSource.indexOf("shooterSnapshot.assistSpiritSkillCharged !== true") >= 0 &&
      assistSkillButtonSource.indexOf("shooterSnapshot.assistSpiritSkillAvailable === true") >= 0 &&
      assistSkillButtonSource.indexOf("dimWhenDisabled: false") < 0,
    "ShooterPanel Skill must keep the charging state tappable for its rewarded-ad flow while dimming unavailable full-charge states."
  );
  var levelRendererSource = fs.readFileSync(
    path.join(projectRoot, "gameplay-src/render/LevelRenderer.js"),
    "utf8"
  );
  var shooterRenderKeyStart = levelRendererSource.indexOf("function buildShooterRenderKey(runtimeSnapshot)");
  var shooterRenderKeyEnd = levelRendererSource.indexOf("function buildTimerRenderKey", shooterRenderKeyStart);
  assert(
    shooterRenderKeyStart >= 0 && shooterRenderKeyEnd > shooterRenderKeyStart,
    "LevelRenderer shooter render key is required."
  );
  var shooterRenderKeySource = levelRendererSource.slice(shooterRenderKeyStart, shooterRenderKeyEnd);
  [
    "shooter.assistSpiritSkillCharge",
    "shooter.assistSpiritSkillChargeMax",
    "shooter.assistSpiritSkillCharged",
    "shooter.assistSpiritSkillAvailable",
    "shooter.assistSpiritSkillUnavailableReason"
  ].forEach(function (fieldName) {
    assert(
      shooterRenderKeySource.indexOf(fieldName) >= 0,
      "Shooter render key must include assist spirit skill state: " + fieldName
    );
  });
  var fallingRefreshStart = levelRendererSource.indexOf("LevelRenderer.prototype._refreshRuntimeFalling = function");
  var fallingRefreshEnd = levelRendererSource.indexOf("LevelRenderer.prototype._refreshRuntimeTimer", fallingRefreshStart);
  assert(
    fallingRefreshStart >= 0 && fallingRefreshEnd > fallingRefreshStart,
    "LevelRenderer falling refresh is required."
  );
  var fallingRefreshSource = levelRendererSource.slice(fallingRefreshStart, fallingRefreshEnd);
  assert(
    fallingRefreshSource.indexOf("buildShooterRenderKey(runtimeSnapshot)") >= 0 &&
      fallingRefreshSource.indexOf("this._renderShooter(") >= 0 &&
      fallingRefreshSource.indexOf("nextShooterKey !== this.lastShooterRenderKey") >= 0,
    "Falling refresh must update ShooterPanel when skill availability changes before drops settle."
  );

  var effectSource = fs.readFileSync(
    path.join(projectRoot, "gameplay-src/render/LevelRendererAssistSpiritSkillMethods.js"),
    "utf8"
  );
  var tornadoBranchStart = effectSource.indexOf('if (plan.skillId === "tornado")');
  var tornadoBranchEnd = effectSource.indexOf("return playPulse(", tornadoBranchStart);
  assert(tornadoBranchStart >= 0 && tornadoBranchEnd > tornadoBranchStart, "Tornado effect branch is required.");
  var tornadoBranch = effectSource.slice(tornadoBranchStart, tornadoBranchEnd);
  assert(
    tornadoBranch.indexOf("cc.bezierTo") >= 0 &&
    tornadoBranch.indexOf("plan.path.control1") >= 0 &&
    tornadoBranch.indexOf("plan.path.control2") >= 0,
    "Tornado image must move along its configured cubic Bezier path."
  );
  assert(tornadoBranch.indexOf("rotate") < 0, "Tornado image must not rotate.");
  assert(tornadoBranch.indexOf("fade") < 0, "Tornado image must not fade during path movement.");
  assert(
    tornadoBranch.indexOf("cc.spawn") >= 0 &&
    tornadoBranch.indexOf("cc.repeat") >= 0 &&
    tornadoBranch.indexOf("TORNADO_BREATH_MAX_SCALE_X, 1") >= 0 &&
    tornadoBranch.indexOf("TORNADO_BREATH_MIN_SCALE_X, 1") >= 0,
    "Tornado image must breathe on width only while moving."
  );
  var effectStartCallbackIndex = effectSource.indexOf("onSkillEffectStarted(plan.skillId);");
  var lightningEffectBranchIndex = effectSource.indexOf('if (plan.skillId === "lightning_chain")');
  var tornadoEffectBranchIndex = effectSource.indexOf('if (plan.skillId === "tornado")');
  assert(
    effectStartCallbackIndex >= 0 &&
      effectStartCallbackIndex < lightningEffectBranchIndex &&
      effectStartCallbackIndex < tornadoEffectBranchIndex,
    "Lightning and tornado audio callbacks must fire at their actual effect start."
  );

  var assistBootstrapSource = fs.readFileSync(
    path.join(projectRoot, "assets/scripts/bootstrap/GameBootstrapAssistSpiritSkillMethods.js"),
    "utf8"
  );
  assert(
    assistBootstrapSource.indexOf('if (skillId === "lightning_chain")') >= 0 &&
      assistBootstrapSource.indexOf('this._playSfx("lighting")') >= 0 &&
      assistBootstrapSource.indexOf('if (skillId === "tornado")') >= 0 &&
      assistBootstrapSource.indexOf('this._playSfx("tornado")') >= 0,
    "Lightning and tornado effect starts must play their SFX."
  );
}

function validateSkillAudio() {
  [
    "assets/audio/sound/tornado.mp3",
    "assets/audio/sound/lighting.mp3",
    "assets/audio/sound/ablation.mp3",
    "assets/audio/sound/vines.mp3",
    "assets/audio/sound/skill_completed.mp3"
  ].forEach(function (relativePath) {
    assert(fs.existsSync(path.join(projectRoot, relativePath)), "Missing assist spirit skill audio: " + relativePath);
  });

  var expectedSfxKeyBySkillId = {
    permanent_thaw: "ablation",
    release_vines: "vines"
  };
  Object.keys(expectedSfxKeyBySkillId).forEach(function (skillId) {
    var playedSfxKeys = [];
    GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
      _trackRuntimeTelemetryEvent: function () {},
      _playSfx: function (sfxKey) {
        playedSfxKeys.push(sfxKey);
      }
    }, {
      runtimeEvents: [{
        type: "assist_spirit_skill_resolved",
        skill_id: skillId
      }]
    });
    assert(
      playedSfxKeys.length === 1 && playedSfxKeys[0] === expectedSfxKeyBySkillId[skillId],
      skillId + " must play " + expectedSfxKeyBySkillId[skillId] + " exactly once."
    );
  });

  var resolvedLightningSfxKeys = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (sfxKey) {
      resolvedLightningSfxKeys.push(sfxKey);
    }
  }, {
    runtimeEvents: [{
      type: "assist_spirit_skill_resolved",
      skill_id: "lightning_chain"
    }]
  });
  assert(
    resolvedLightningSfxKeys.length === 0,
    "Resolved lightning event must not replay the effect-start lighting SFX."
  );

  var resolvedTornadoSfxKeys = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (sfxKey) {
      resolvedTornadoSfxKeys.push(sfxKey);
    }
  }, {
    runtimeEvents: [{
      type: "assist_spirit_skill_resolved",
      skill_id: "tornado"
    }]
  });
  assert(
    resolvedTornadoSfxKeys.length === 0,
    "Resolved tornado event must not replay the effect-start tornado SFX."
  );

  var chargeReadySfxKeys = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (sfxKey) {
      chargeReadySfxKeys.push(sfxKey);
    }
  }, {
    runtimeEvents: [{
      type: "assist_spirit_skill_ready",
      charge_max: 25
    }]
  });
  assert(
    chargeReadySfxKeys.length === 1 && chargeReadySfxKeys[0] === "skillCompleted",
    "Assist spirit skill charging completion must play skillCompleted exactly once."
  );

  var audioMethodsSource = fs.readFileSync(
    path.join(projectRoot, "assets/scripts/bootstrap/GameBootstrapAudioMethods.js"),
    "utf8"
  );
  assert(
    audioMethodsSource.indexOf('event.skill_id === "lightning_chain" || event.skill_id === "tornado"') >= 0,
    "Resolved tornado and lightning events must be explicitly recognized as already played at effect start."
  );

  var vineEntangleSfxKeys = [];
  GameBootstrapAudioMethods._playRuntimeAudioEvents.call({
    _trackRuntimeTelemetryEvent: function () {},
    _playSfx: function (sfxKey) {
      vineEntangleSfxKeys.push(sfxKey);
    }
  }, {
    runtimeEvents: [{
      type: "vine_entanglement_started",
      count: 1
    }]
  });
  assert(
    vineEntangleSfxKeys.length === 1 && vineEntangleSfxKeys[0] === "vines",
    "Vine release and vine entanglement start must share the vines sound."
  );
}

function collectSpriteFrameMetadataFiles(directory) {
  assert(fs.existsSync(directory), "Missing assist spirit animation frame directory: " + directory);
  var metadataFiles = [];
  fs.readdirSync(directory, { withFileTypes: true }).forEach(function (entry) {
    var entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      metadataFiles = metadataFiles.concat(collectSpriteFrameMetadataFiles(entryPath));
      return;
    }
    if (entry.name.slice(-9) === ".png.meta") {
      metadataFiles.push(entryPath);
    }
  });
  return metadataFiles.sort();
}

function readSingleSpriteFrameUuid(metadataPath, ownerName) {
  var metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  var subMetaNames = Object.keys(metadata.subMetas);
  assert(subMetaNames.length === 1, ownerName + " SpriteFrame metadata must contain exactly one subMeta.");
  var spriteFrameMeta = metadata.subMetas[subMetaNames[0]];
  assert(
    spriteFrameMeta && typeof spriteFrameMeta.uuid === "string" && spriteFrameMeta.uuid,
    ownerName + " SpriteFrame metadata requires uuid."
  );
  return spriteFrameMeta.uuid;
}

function collectSpiritSpriteFrameUuids(spiritId) {
  var directory = path.join(projectRoot, "assets/game/animation", spiritId);
  var uuidMap = {};
  collectSpriteFrameMetadataFiles(directory).forEach(function (metadataPath) {
    var uuid = readSingleSpriteFrameUuid(metadataPath, spiritId);
    assert(uuidMap[uuid] !== true, spiritId + " animation contains duplicate SpriteFrame uuid: " + uuid);
    uuidMap[uuid] = true;
  });
  assert(Object.keys(uuidMap).length > 0, spiritId + " animation requires SpriteFrame metadata.");
  return uuidMap;
}

function collectOrderedActionSpriteFrameUuids(spiritId, actionName) {
  var directory = path.join(projectRoot, "assets/game/animation", spiritId, actionName);
  var metadataFiles = collectSpriteFrameMetadataFiles(directory);
  assert(metadataFiles.length > 0, spiritId + " " + actionName + " animation requires sequence frames.");
  return metadataFiles.map(function (metadataPath) {
    return readSingleSpriteFrameUuid(metadataPath, spiritId + " " + actionName);
  });
}

function validateShooterAssistSpiritAnimations() {
  var configuredSpiritIds = AssistSpiritConfig.getCatalog().map(function (spirit) {
    return spirit.id;
  });
  var miluClipsByAction = {
    idle: readJson("assets/game/animation/milu_idle.anim"),
    pao: readJson("assets/game/animation/milu_pao.anim")
  };
  var presentationSpiritIds = AssistSpiritPresentationConfig.getSpiritIds();
  assert(
    JSON.stringify(presentationSpiritIds) === JSON.stringify(configuredSpiritIds),
    "Shooter animation roster must exactly match Spirit Hall roster."
  );
  assert(
    AssistSpiritPresentationConfig.getAllClipPaths().length === configuredSpiritIds.length * 2,
    "Every assist spirit requires idle and deliver clips."
  );

  configuredSpiritIds.forEach(function (spiritId) {
    var presentation = AssistSpiritPresentationConfig.getBySpiritId(spiritId);
    var allowedSpriteFrameUuids = collectSpiritSpriteFrameUuids(spiritId);
    [
      {
        actionName: "idle",
        path: presentation.idleClipPath,
        name: presentation.idleClipName
      },
      {
        actionName: "pao",
        path: presentation.deliverClipPath,
        name: presentation.deliverClipName
      }
    ].forEach(function (expected) {
      var relativePath = "assets/" + expected.path + ".anim";
      var clip = readJson(relativePath);
      assert(clip.__type__ === "cc.AnimationClip", relativePath + " must be cc.AnimationClip.");
      assert(clip._name === expected.name, relativePath + " clip name must be " + expected.name + ".");
      assert(Number.isInteger(clip.wrapMode) && clip.wrapMode > 0, relativePath + " wrapMode is invalid.");
      assert(Number.isFinite(clip._duration) && clip._duration > 0, relativePath + " duration must be positive.");
      var miluClip = miluClipsByAction[expected.actionName];
      assert(clip._duration === miluClip._duration, relativePath + " duration must match milu_" + expected.actionName + ".");
      assert(clip.sample === miluClip.sample, relativePath + " sample must match milu_" + expected.actionName + ".");
      assert(clip.speed === miluClip.speed, relativePath + " speed must match milu_" + expected.actionName + ".");
      var spriteFrames = clip.curveData &&
        clip.curveData.comps &&
        clip.curveData.comps["cc.Sprite"] &&
        clip.curveData.comps["cc.Sprite"].spriteFrame;
      assert(Array.isArray(spriteFrames) && spriteFrames.length > 0, relativePath + " requires SpriteFrame keys.");
      spriteFrames.forEach(function (frame) {
        var frameUuid = frame && frame.value && frame.value.__uuid__;
        assert(
          typeof frameUuid === "string" && allowedSpriteFrameUuids[frameUuid] === true,
          relativePath + " references a SpriteFrame outside " + spiritId + " animation frames."
        );
      });
      if (spiritId !== "milu") {
        var expectedFrameUuids = collectOrderedActionSpriteFrameUuids(spiritId, expected.actionName);
        var previousSequenceIndex = -1;
        var previousFrameTime = -1;
        spriteFrames.forEach(function (frame) {
          var frameUuid = frame.value.__uuid__;
          var sequenceIndex = expectedFrameUuids.indexOf(frameUuid);
          assert(
            sequenceIndex >= 0,
            relativePath + " must reference SpriteFrames from its " + expected.actionName + " sequence directory."
          );
          assert(
            sequenceIndex > previousSequenceIndex,
            relativePath + " SpriteFrame keys must preserve filename order without duplicates."
          );
          assert(
            Number.isFinite(frame.frame) && frame.frame >= 0 && frame.frame < clip._duration,
            relativePath + " SpriteFrame key time must be within the clip duration."
          );
          assert(
            frame.frame > previousFrameTime,
            relativePath + " SpriteFrame key times must be strictly increasing."
          );
          previousSequenceIndex = sequenceIndex;
          previousFrameTime = frame.frame;
        });
      }
    });
  });

  var runtimeSource = fs.readFileSync(
    path.join(projectRoot, "gameplay-src/render/LevelRendererSceneShooterMethods.js"),
    "utf8"
  );
  assert(
    runtimeSource.indexOf("shooterSnapshot.assistSpiritId") >= 0 &&
    runtimeSource.indexOf("presentation.deliverClipName") >= 0 &&
    runtimeSource.indexOf("presentation.idleClipName") >= 0,
    "Shooter renderer must select idle and deliver clips from equipped assist spirit id."
  );
}

function validateVisibilityConfig() {
  assert(AssistSpiritSkillConfig.getBySpiritId("milu").skillId === null, "Milu must not show a skill.");
  assert(AssistSpiritSkillConfig.getBySpiritId("lumi").skillId === null, "Lumi must not show a global skill.");
  var lumiAbility = AssistSpiritConfig.getAbilityRuntimeConfig("lumi");
  assert(
    lumiAbility.abilityType === "produced_ball" && lumiAbility.producedBallType === "blast",
    "Lumi must register blast as an authoritative produced ball."
  );
  ["noya", "flora", "loco", "kelu", "yumi"].forEach(function (spiritId) {
    var config = AssistSpiritSkillConfig.getBySpiritId(spiritId);
    assert(typeof config.skillId === "string" && config.skillId, spiritId + " requires a global skill.");
    assert(typeof config.iconPath === "string" && config.iconPath, spiritId + " requires an icon.");
  });
}

function validateEquippedSpiritLevelInjection() {
  var received = null;
  var host = {
    assistSpiritState: {
      equippedSpiritId: "lumi",
      spirits: {
        lumi: {
          level: 7
        }
      }
    },
    gameManager: {
      setEquippedAssistSpirit: function (spiritId, level) {
        received = {
          spiritId: spiritId,
          level: level
        };
        return received;
      }
    }
  };
  var result = GameBootstrapAssistSpiritSkillMethods._syncEquippedAssistSpiritToGameManager.call(host);
  assert(
    result === received && received.spiritId === "lumi" && received.level === 7,
    "Gameplay bootstrap must inject both equipped Lumi id and persisted level."
  );
}

function validateFloraAndYumiVinePriority() {
  var flora = startManager("flora", 1, { levelId: 901, withVine: true, withIce: true });
  assert(
    flora.getRuntimeSnapshot([]).shooter.assistSpiritId === "flora",
    "Equipped Spirit Hall id must reach shooterSnapshot.assistSpiritId."
  );
  addActiveVine(flora);
  var floraPreview = flora.previewAssistSpiritSkill("flora");
  assert(floraPreview.accepted && floraPreview.skillId === "release_vines", "Flora must preview vine release.");
  var floraResult = flora.useAssistSpiritSkill("flora", floraPreview);
  assert(floraResult.accepted, "Flora vine release must resolve.");
  assert(!flora.systems.bubbleGrid.getCell(0, 0).vineOwnerId, "Flora must clear the active vine.");

  var yumi = startManager("yumi", 1, { levelId: 902, withVine: true, withIce: true });
  addActiveVine(yumi);
  var yumiPreview = yumi.previewAssistSpiritSkill("yumi");
  assert(
    yumiPreview.accepted &&
    yumiPreview.skillId === "release_vines" &&
    yumiPreview.resolvedSpiritId === "flora",
    "Yumi must prioritize vine release over snow."
  );
}

function validatePermanentThawAndYumiSnowPriority() {
  var loco = startManager("loco", 1, { levelId: 903, withVine: false, withIce: true });
  var preview = loco.previewAssistSpiritSkill("loco");
  assert(preview.accepted && preview.skillId === "permanent_thaw", "Loco must preview permanent thaw.");
  var result = loco.useAssistSpiritSkill("loco", preview);
  assert(result.accepted, "Loco permanent thaw must resolve.");
  var thawed = loco.systems.bubbleGrid.getCell(1, 4);
  assert(
    thawed && thawed.entityCategory === "normal_ball" && thawed.color === "B" && thawed.temporaryThawed !== true,
    "Permanent thaw must replace ice with its inner normal ball."
  );
  loco.shotsFired += 10;
  assert(
    loco.systems.bubbleGrid.getCell(1, 4).entityCategory === "normal_ball",
    "Permanent thaw must not restore ice after later shots."
  );

  var yumi = startManager("yumi", 1, { levelId: 904, withVine: false, withIce: true });
  var yumiPreview = yumi.previewAssistSpiritSkill("yumi");
  assert(
    yumiPreview.accepted &&
    yumiPreview.skillId === "permanent_thaw" &&
    yumiPreview.resolvedSpiritId === "loco",
    "Yumi must choose permanent thaw when snow is the highest-priority obstacle."
  );
}

function evaluateBezierPoint(curve, t) {
  var inverse = 1 - t;
  return {
    x:
      inverse * inverse * inverse * curve.start.x +
      3 * inverse * inverse * t * curve.control1.x +
      3 * inverse * t * t * curve.control2.x +
      t * t * t * curve.end.x,
    y:
      inverse * inverse * inverse * curve.start.y +
      3 * inverse * inverse * t * curve.control1.y +
      3 * inverse * t * t * curve.control2.y +
      t * t * t * curve.end.y
  };
}

function distanceSquaredToSegment(point, start, end) {
  var deltaX = end.x - start.x;
  var deltaY = end.y - start.y;
  var lengthSquared = deltaX * deltaX + deltaY * deltaY;
  var projection = lengthSquared > 0
    ? ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared
    : 0;
  var clamped = Math.max(0, Math.min(1, projection));
  var closestX = start.x + deltaX * clamped;
  var closestY = start.y + deltaY * clamped;
  return Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2);
}

function distanceSquaredToBezier(point, curve) {
  var minimum = Infinity;
  var previous = evaluateBezierPoint(curve, 0);
  for (var index = 1; index <= AssistSpiritSkillConfig.TORNADO_PATH_SAMPLE_SEGMENTS; index += 1) {
    var current = evaluateBezierPoint(
      curve,
      index / AssistSpiritSkillConfig.TORNADO_PATH_SAMPLE_SEGMENTS
    );
    minimum = Math.min(minimum, distanceSquaredToSegment(point, previous, current));
    previous = current;
  }
  return minimum;
}

function validateLightningThenTornadoPriority() {
  var yumi = startManager("yumi", 1, { levelId: 905, withVine: false, withIce: false });
  var yumiPreview = yumi.previewAssistSpiritSkill("yumi");
  assert(
    yumiPreview.accepted &&
    yumiPreview.skillId === "lightning_chain" &&
    yumiPreview.resolvedSpiritId === "kelu",
    "Yumi must prefer lightning when the obstacle-free board has chain targets."
  );

  var noya = startManager("noya", 1, { levelId: 906, withVine: false, withIce: false });
  var tornadoPreview = noya.previewAssistSpiritSkill("noya");
  assert(
    tornadoPreview.accepted &&
    tornadoPreview.skillId === "tornado" &&
    tornadoPreview.effectPath === "game/image/skill/tornado" &&
    tornadoPreview.path &&
    tornadoPreview.path.control1 &&
    tornadoPreview.path.control2,
    "Noya must use the configured tornado image and cubic Bezier path."
  );
  assert(
    tornadoPreview.maxTargets === 2 && tornadoPreview.targets.length <= tornadoPreview.maxTargets,
    "Lv1 tornado must use the configured two-target limit."
  );
  tornadoPreview.targets.forEach(function (target) {
    var position = noya.systems.bubbleGrid.getCellPosition(target.row, target.col);
    assert(
      distanceSquaredToBezier(position, tornadoPreview.path) <=
        Math.pow(AssistSpiritSkillConfig.TORNADO_PATH_INFLUENCE_RADIUS, 2),
      "Tornado may only drop balls inside the configured path influence radius."
    );
  });

  var repeatedPreview = noya.previewAssistSpiritSkill("noya");
  assert(
    JSON.stringify(repeatedPreview.path) === JSON.stringify(tornadoPreview.path) &&
    JSON.stringify(repeatedPreview.targets) === JSON.stringify(tornadoPreview.targets),
    "Repeated previews must keep the same seeded tornado path and distance-ordered targets."
  );

  var sameSeedNoya = startManager("noya", 1, { levelId: 906, withVine: false, withIce: false });
  var sameSeedPreview = sameSeedNoya.previewAssistSpiritSkill("noya");
  assert(
    JSON.stringify(sameSeedPreview.path) === JSON.stringify(tornadoPreview.path) &&
    JSON.stringify(sameSeedPreview.targets) === JSON.stringify(tornadoPreview.targets),
    "The same run seed must reproduce the tornado path and targets."
  );

  var differentSeedNoya = startManager("noya", 1, { levelId: 907, withVine: false, withIce: false });
  var differentSeedPreview = differentSeedNoya.previewAssistSpiritSkill("noya");
  assert(
    differentSeedPreview.accepted &&
    JSON.stringify(differentSeedPreview.path) !== JSON.stringify(tornadoPreview.path),
    "Different run seeds must produce different tornado paths."
  );

  var tornadoResult = noya.useAssistSpiritSkill("noya", tornadoPreview);
  assert(tornadoResult.accepted, "Seeded tornado preview must resolve successfully.");
  assert(
    noya.assistSpiritSkillResolutionSequence === 1,
    "Successful tornado resolution must advance the assist spirit skill sequence."
  );

  var lowLevelNoya = startManager("noya", 1, {
    levelId: 921,
    withVine: false,
    withIce: false,
    singleBall: true
  });
  var lowLevelPreview = lowLevelNoya.previewAssistSpiritSkill("noya");
  assert(
    lowLevelPreview.accepted &&
    lowLevelPreview.targets.length <= 1,
    "Tornado must use every nearby legal ball up to its level cap, without probability rolls."
  );
  var lowLevelResult = lowLevelNoya.useAssistSpiritSkill("noya", lowLevelPreview);
  assert(
    lowLevelResult.accepted,
    "A low-level tornado must resolve without any probability branch."
  );

  var noCandidateNoya = startManager("noya", 1, {
    levelId: 922,
    withVine: false,
    withIce: true,
    onlyIce: true
  });
  var noCandidatePreview = noCandidateNoya.previewAssistSpiritSkill("noya");
  assert(
    noCandidatePreview.accepted &&
    noCandidatePreview.nearbyCandidateCount === 0 &&
    noCandidatePreview.targets.length === 0 &&
    noCandidatePreview.path,
    "Tornado must remain usable for presentation when the board has no legal drop candidates."
  );
  var noCandidateResult = noCandidateNoya.useAssistSpiritSkill("noya", noCandidatePreview);
  assert(
    noCandidateResult.accepted &&
    noCandidateResult.targetCount === 0 &&
    noCandidateNoya.systems.bubbleGrid.getCells().some(function (cell) {
      return cell.entityType === "ice";
    }),
    "No-candidate tornado must resolve without forcing an ineligible obstacle to drop."
  );
}

function validateGlobalSkillLevelGrowth() {
  var expectedBySkillId = {
    tornado: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10],
    release_vines: [1, 2, 3, 4, 5, 6, 7, 8, 9, null],
    permanent_thaw: [1, 2, 3, 4, 5, 6, 7, 8, 9, null],
    lightning_chain: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10]
  };
  var levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  levels.forEach(function (level, index) {
    Object.keys(expectedBySkillId).forEach(function (skillId) {
      var runtimeConfig = AssistSpiritConfig.getGlobalSkillRuntimeConfig(skillId, level);
      assert(
        runtimeConfig.maxTargets === expectedBySkillId[skillId][index],
        skillId + " must expose the configured target limit at Lv." + level + "."
      );
      if (level > 1) {
        var previousConfig = AssistSpiritConfig.getGlobalSkillRuntimeConfig(skillId, level - 1);
        assert(
          runtimeConfig.chargeMax < previousConfig.chargeMax,
          skillId + " must gain a shorter charge requirement at every level."
        );
      }
    });
  });
  assert(
    AssistSpiritConfig.getGlobalSkillChargeMax(1) === 25 &&
    AssistSpiritConfig.getGlobalSkillChargeMax(10) === 11,
    "Global skill charge must shorten from 25 to 11 normal-ball eliminations."
  );

  var levelTenKelu = startManager("kelu", 10, {
    levelId: 932,
    withVine: false,
    withIce: false
  });
  var levelTenPreview = levelTenKelu.previewAssistSpiritSkill("kelu");
  assert(
    levelTenPreview.accepted &&
    levelTenPreview.maxTargets === 10 &&
    levelTenPreview.targets.length === 10,
    "Lv10 Kelu must build a ten-target lightning chain on a populated board."
  );

  var levelTenNoya = startManager("noya", 10, {
    levelId: 933,
    withVine: false,
    withIce: false
  });
  var levelTenTornado = levelTenNoya.previewAssistSpiritSkill("noya");
  assert(
    levelTenTornado.accepted &&
    levelTenTornado.maxTargets === 10 &&
    levelTenTornado.targets.length <= 10,
    "Lv10 Noya must expose a ten-target cap."
  );

  var yumi = startManager("yumi", 10, {
    levelId: 934,
    withVine: false,
    withIce: false
  });
  assert(
    yumi.getAssistSpiritSkillAvailability().maxCharge === 11,
    "Yumi must use its own level for global-skill charge."
  );
}

function validateLightningTopAnchorCollapseSameResolution() {
  var kelu = startManager("kelu", 1, {
    levelId: 907,
    withVine: false,
    withIce: false
  });
  var preview = kelu.previewAssistSpiritSkill("kelu");
  assert(
    preview.accepted &&
    preview.skillId === "lightning_chain" &&
    preview.targets.length >= 2,
    "Kelu top-collapse validation requires an accepted multi-target lightning chain."
  );

  var result = kelu.useAssistSpiritSkill("kelu", preview);
  assert(result.accepted, "Kelu lightning chain must resolve before top-collapse validation.");
  assert(
    kelu.lastResolution.topAnchorCollapse === true &&
    kelu.state === "won_pending",
    "Lightning-created top empty slots must trigger top-anchor collapse in the same skill resolution."
  );
  assert(
    kelu.systems.bubbleGrid.getCells().length === 0,
    "Same-resolution top-anchor collapse must remove every remaining non-wormhole bubble."
  );
  assert(
    result.snapshot.runtimeEvents.some(function (event) {
      return event && event.type === "top_anchor_collapse_started";
    }),
    "Lightning same-resolution collapse must emit top_anchor_collapse_started immediately."
  );
}

function validateTornadoTopAnchorCollapseSameResolution() {
  var noya = startManager("noya", 1, {
    levelId: 906,
    withVine: false,
    withIce: false
  });
  var preview = noya.previewAssistSpiritSkill("noya");
  assert(
    preview.accepted &&
      preview.skillId === "tornado" &&
      preview.targets.length > 0,
    "Noya top-collapse validation requires an accepted tornado with at least one target."
  );

  var result = noya.useAssistSpiritSkill("noya", preview);
  assert(result.accepted, "Noya tornado must resolve before top-collapse validation.");
  assert(
    noya.lastResolution.topAnchorCollapse === true &&
      noya.state === "won_pending",
    "Tornado-created top empty slots must trigger top-anchor collapse in the same skill resolution."
  );
  assert(
    noya.systems.bubbleGrid.getCells().length === 0,
    "Tornado same-resolution top-anchor collapse must remove every remaining non-wormhole bubble."
  );
  assert(
    result.snapshot.runtimeEvents.some(function (event) {
      return event && event.type === "top_anchor_collapse_started";
    }),
    "Tornado same-resolution collapse must emit top_anchor_collapse_started immediately."
  );
}

function validateAssistSpiritSkillCharge() {
  var levelOneChargeMax = AssistSpiritSkillChargeConfig.getMaxCharge("kelu", 1);
  var chargingKelu = startManager("kelu", 1, {
    levelId: 930,
    withVine: false,
    withIce: false,
    startCharged: false
  });
  var initialAvailability = chargingKelu.getAssistSpiritSkillAvailability();
  assert(
      initialAvailability.reason === "charging" &&
      initialAvailability.charge === 0 &&
      initialAvailability.maxCharge === levelOneChargeMax,
    "A global assist skill must begin each run uncharged."
  );

  var chargeCells = [];
  for (var index = 0; index < levelOneChargeMax - 1; index += 1) {
    chargeCells.push({
      id: "skill_charge_" + index,
      entityCategory: "normal_ball"
    });
  }
  chargeCells.push({
    id: "skill_charge_obstacle",
    entityCategory: "obstacle_ball"
  });
  assert(
    chargingKelu._collectAssistSpiritSkillCharge(chargeCells, "board_elimination") === levelOneChargeMax - 1,
    "Only eliminated normal balls may contribute assist skill charge."
  );
  assert(
    chargingKelu._collectAssistSpiritSkillCharge([chargeCells[0]], "floating_drop") === 0,
    "The same removed normal ball must never charge twice."
  );
  assert(
    chargingKelu._collectAssistSpiritSkillCharge([{ id: "skill_charge_final", entityCategory: "normal_ball" }], "board_elimination") === 1,
    "The final normal ball must complete assist skill charge."
  );
  var chargedAvailability = chargingKelu.getAssistSpiritSkillAvailability();
  assert(
    chargedAvailability.available === true && chargedAvailability.isCharged === true,
    "A fully charged global assist skill with legal targets must become usable."
  );

  var chargedPreview = chargingKelu.previewAssistSpiritSkill("kelu");
  var chargedResult = chargingKelu.useAssistSpiritSkill("kelu", chargedPreview);
  assert(
    chargedResult.accepted === true && chargingKelu.assistSpiritSkillCharge === 0,
    "Successful global assist skill use must consume all charge."
  );

  var adKelu = startManager("kelu", 1, {
    levelId: 931,
    withVine: false,
    withIce: false,
    startCharged: false
  });
  adKelu._collectAssistSpiritSkillCharge([{ id: "skill_charge_ad_partial", entityCategory: "normal_ball" }], "board_elimination");
  var adGrantResult = adKelu.grantAssistSpiritSkillChargeFromAd();
  assert(
    adGrantResult.accepted === true &&
      adKelu.assistSpiritSkillCharge === levelOneChargeMax &&
      adGrantResult.snapshot.shooter.assistSpiritSkillCharge === levelOneChargeMax,
    "A completed rewarded ad must immediately fill the current skill charge."
  );
  assert(
    adGrantResult.snapshot.runtimeEvents.some(function (event) {
      return event.type === "assist_spirit_skill_ad_granted";
    }),
    "Rewarded ad charge must emit an authoritative grant event."
  );
}

function fireOnePlannedShot(manager) {
  var targetCell = manager.systems.bubbleGrid.getCell(0, 0);
  assert(targetCell, "Produced-ball validation requires a target cell at 0,0.");
  manager.pendingShotPlan = {
    valid: true,
    hitType: "cell",
    targetCell: {
      row: targetCell.row,
      col: targetCell.col
    },
    targetCellPosition: manager.systems.bubbleGrid.getCellPosition(targetCell.row, targetCell.col),
    origin: {
      x: manager.systems.shooterController.origin.x,
      y: manager.systems.shooterController.origin.y
    },
    wallBounceCount: 0
  };
  return manager.fireShot();
}

function findProducedBallRollEvent(snapshot) {
  var events = snapshot.runtimeEvents.filter(function (event) {
    return event.type === "assist_spirit_produced_ball_rolled";
  });
  assert(events.length <= 1, "One real shot cannot emit multiple produced-ball roll events.");
  return events.length === 1 ? events[0] : null;
}

function validateLumiProducedBallProbability() {
  var triggeredLumi = startManager("lumi", 1, {
    levelId: 924,
    withVine: false,
    withIce: false
  });
  var triggeredBefore = triggeredLumi.getRuntimeSnapshot([]);
  assert(
    triggeredBefore.shooter.currentBall.ballCategory === "normal" &&
    triggeredBefore.shooter.nextBall.ballCategory === "normal",
    "Lumi must start from the authored normal-ball queue."
  );
  var triggeredSnapshot = fireOnePlannedShot(triggeredLumi);
  var triggeredEvent = findProducedBallRollEvent(triggeredSnapshot);
  assert(
    triggeredEvent &&
    triggeredEvent.triggered === true &&
    triggeredEvent.probability_percent === 3 &&
    triggeredEvent.roll_basis_points < 300,
    "Lumi Lv1 must use the configured 3 percent seeded roll."
  );
  assert(
    triggeredSnapshot.shooter.currentBall.ballCategory === "skill" &&
    triggeredSnapshot.shooter.currentBall.entityType === "blast",
    "A successful Lumi roll must replace the newly loaded authoritative current ball with blast."
  );
  assert(
    triggeredSnapshot.shooter.nextBall.ballCategory === "normal" &&
    triggeredSnapshot.shooter.skillInventory.blast === 0,
    "Lumi conversion must not alter nextBall or consume blast inventory."
  );
  assert(
    triggeredLumi.activeProjectile.ball.ballCategory === "normal" &&
    triggeredSnapshot.remainingShots === triggeredBefore.remainingShots - 1,
    "Lumi conversion must not rewrite the fired ball or remaining-shot accounting."
  );

  var repeatedLumi = startManager("lumi", 1, {
    levelId: 924,
    withVine: false,
    withIce: false
  });
  var repeatedEvent = findProducedBallRollEvent(fireOnePlannedShot(repeatedLumi));
  assert(
    repeatedEvent &&
    repeatedEvent.roll_basis_points === triggeredEvent.roll_basis_points &&
    repeatedEvent.triggered === triggeredEvent.triggered,
    "The same run seed and shot sequence must reproduce Lumi's probability result."
  );

  var missedLumi = startManager("lumi", 10, {
    levelId: 925,
    withVine: false,
    withIce: false
  });
  var missedSnapshot = fireOnePlannedShot(missedLumi);
  var missedEvent = findProducedBallRollEvent(missedSnapshot);
  assert(
    missedEvent &&
    missedEvent.triggered === false &&
    missedEvent.probability_percent === 30 &&
    missedEvent.roll_basis_points >= 3000,
    "Lumi Lv10 must use the configured 30 percent seeded roll without forcing success."
  );
  assert(
    missedSnapshot.shooter.currentBall.ballCategory === "normal",
    "A missed Lumi roll must keep the newly loaded normal ball unchanged."
  );

  var lastShotLumi = startManager("lumi", 10, {
    levelId: 924,
    withVine: false,
    withIce: false
  });
  lastShotLumi.remainingShots = 1;
  lastShotLumi.systems.shooterController.syncFiniteShotQueue(1);
  var lastShotSnapshot = fireOnePlannedShot(lastShotLumi);
  assert(
    !findProducedBallRollEvent(lastShotSnapshot) &&
    lastShotSnapshot.shooter.currentBall === null &&
    lastShotSnapshot.shooter.nextBall === null,
    "Lumi must not roll or create a ball when the fired shot leaves no loaded slot."
  );

  var duplicateRejected = false;
  try {
    triggeredLumi._resolveAssistSpiritProducedBallAfterFire();
  } catch (error) {
    duplicateRejected = /exactly once per real shot/.test(error.message);
  }
  assert(duplicateRejected, "Lumi produced-ball probability must reject duplicate evaluation for one shot.");

  var milu = startManager("milu", 1, {
    levelId: 924,
    withVine: false,
    withIce: false
  });
  var miluSnapshot = fireOnePlannedShot(milu);
  assert(
    !findProducedBallRollEvent(miluSnapshot) &&
    miluSnapshot.shooter.currentBall.ballCategory === "normal",
    "Milu must retain the original normal delivery behavior without a probability roll."
  );
}

validateResourcesAndPrefab();
validateSkillAudio();
validateShooterAssistSpiritAnimations();
validateVisibilityConfig();
validateEquippedSpiritLevelInjection();
validateAssistSpiritSkillCharge();
validateLightningTopAnchorCollapseSameResolution();
validateTornadoTopAnchorCollapseSameResolution();
validateLumiProducedBallProbability();
validateFloraAndYumiVinePriority();
validatePermanentThawAndYumiSnowPriority();
validateLightningThenTornadoPriority();
validateGlobalSkillLevelGrowth();

console.log("[OK] ShooterPanel assist spirits: equipped animations, skills, effects and resolved audio");
