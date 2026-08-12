"use strict";

function attachLevelRendererSceneOcclusionMethods(LevelRenderer, deps) {
  var BoardLayout = deps.BoardLayout;
  var BOARD_BUBBLE_SIZE = deps.BOARD_BUBBLE_SIZE;
  var BOARD_OCCLUSION_RESOURCES = deps.BOARD_OCCLUSION_RESOURCES;
  var BOARD_OCCLUSION_CLOCK_RESOURCE = deps.BOARD_OCCLUSION_CLOCK_RESOURCE;
  var ensureSprite = deps.ensureSprite;
  var ensureLabel = deps.ensureLabel;
  var CLOUD_BREATH_HALF_DURATION_SECONDS = 2.4;
  var CLOUD_BREATH_START_OPACITY = 244;
  var CLOUD_BREATH_MAX_OPACITY = 252;
  var CLOUD_BREATH_MIN_OPACITY = 236;

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

  function configureCountdownClock(rootNode, spriteFrame) {
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
    clockNode.setPosition(0, 0);
    clockNode.zIndex = 1;
    clockNode.setContentSize(originalSize);
    var clockSprite = ensureSprite(clockNode, spriteFrame);
    clockSprite.trim = false;
    clockSprite.sizeMode = cc.Sprite.SizeMode.RAW;
    return {
      labelY: -originalSize.height * 0.25,
      labelWidth: originalSize.width - 8,
      labelHeight: Math.floor(originalSize.height * 0.36)
    };
  }

  function configureCountdownLabel(rootNode, zone, bounds, clockSpriteFrame) {
    var labelNode = new cc.Node("Countdown");
    labelNode.parent = rootNode;
    labelNode.setPosition(0, 0);
    labelNode.zIndex = 2;
    labelNode.setContentSize(72, 56);
    var label = ensureLabel(labelNode, "", 42, 48, cc.Label.HorizontalAlign.CENTER);
    labelNode.color = cc.color(255, 138, 31);

    if (zone.remainingShots !== null) {
      if (!Number.isInteger(zone.remainingShots) || zone.remainingShots <= 0) {
        throw new Error("Board occlusion remainingShots must be a positive integer while active.");
      }
      label.overflow = cc.Label.Overflow.NONE;
      label.enableWrapText = false;
      label.string = String(zone.remainingShots);
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
      var clockLayout = configureCountdownClock(rootNode, clockSpriteFrame);
      labelNode.setPosition(0, clockLayout.labelY);
      labelNode.setContentSize(clockLayout.labelWidth, clockLayout.labelHeight);
      label.fontSize = 16;
      label.lineHeight = 18;
      var timedOutline = labelNode.getComponent(cc.LabelOutline);
      if (!timedOutline) {
        timedOutline = labelNode.addComponent(cc.LabelOutline);
      }
      timedOutline.color = cc.color(66, 74, 63);
      timedOutline.width = 2;
      label.string = Math.ceil(zone.remainingTimeMs / 1000) + "秒";
      return;
    }
    label.string = "道具清理";
  }

  function configureOcclusionMotion(imageNode, visualType) {
    imageNode.stopAllActions();
    if (visualType === "cloud") {
      imageNode.opacity = CLOUD_BREATH_START_OPACITY;
      imageNode.runAction(cc.repeatForever(cc.sequence(
        cc.fadeTo(CLOUD_BREATH_HALF_DURATION_SECONDS, CLOUD_BREATH_MAX_OPACITY),
        cc.fadeTo(CLOUD_BREATH_HALF_DURATION_SECONDS, CLOUD_BREATH_MIN_OPACITY)
      )));
      return;
    }
    if (visualType === "leaves") {
      imageNode.opacity = 255;
      imageNode.angle = 0;
      return;
    }
    throw new Error("Unsupported board occlusion visual type: " + visualType);
  }

  function buildOcclusionRenderKey(runtimeSnapshot, snapshot) {
    return [
      snapshot.version,
      runtimeSnapshot.board.maxColumns,
      runtimeSnapshot.board.viewportOffsetY
    ].join("|");
  }

  function requireOcclusionSnapshot(runtimeSnapshot) {
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
    return snapshot;
  }

  LevelRenderer.prototype._renderBoardOcclusions = function (runtimeSnapshot) {
    var snapshot = requireOcclusionSnapshot.call(this, runtimeSnapshot);
    var renderKey = buildOcclusionRenderKey(runtimeSnapshot, snapshot);
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

  LevelRenderer.prototype._refreshBoardOcclusionCountdowns = function (runtimeSnapshot) {
    var snapshot = requireOcclusionSnapshot.call(this, runtimeSnapshot);
    if (this.layers.boardOcclusion.children.length !== snapshot.activeZones.length) {
      throw new Error("Board occlusion countdown refresh requires one rendered node per active zone.");
    }
    snapshot.activeZones.forEach(function (zone, zoneIndex) {
      requireFinite(zone.remainingTimeMs, "Board occlusion remainingTimeMs");
      if (zone.remainingTimeMs <= 0) {
        throw new Error("Board occlusion remainingTimeMs must be positive while active.");
      }
      var rootName = "BoardOcclusion_" + zoneIndex + "_" + zone.id;
      var rootNode = this.layers.boardOcclusion.getChildByName(rootName);
      if (!rootNode || !rootNode.isValid) {
        throw new Error("Board occlusion countdown root node is missing: " + rootName);
      }
      var labelNode = rootNode.getChildByName("Countdown");
      if (!labelNode || !labelNode.isValid) {
        throw new Error("Board occlusion countdown label node is missing: " + rootName);
      }
      var label = labelNode.getComponent(cc.Label);
      if (!label) {
        throw new Error("Board occlusion countdown label component is missing: " + rootName);
      }
      label.string = Math.ceil(zone.remainingTimeMs / 1000) + "秒";
    }, this);
    this.lastBoardOcclusionRenderKey = buildOcclusionRenderKey(runtimeSnapshot, snapshot);
  };
}

module.exports = attachLevelRendererSceneOcclusionMethods;
