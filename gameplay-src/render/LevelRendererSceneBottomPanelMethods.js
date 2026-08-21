"use strict";

function attachLevelRendererSceneBottomPanelMethods(LevelRenderer, context) {
  var BALL_RESOURCES = context.BALL_RESOURCES;
  var BOTTOM_PANEL_POWERUP_SLOTS = context.BOTTOM_PANEL_POWERUP_SLOTS;
  var BoardLayout = context.BoardLayout;
  var POWERUP_ICON_RESOURCES = context.POWERUP_ICON_RESOURCES;
  var PREFAB_PATHS = context.PREFAB_PATHS;
  var attachLevelRendererSceneBottomPanelMethods = context.attachLevelRendererSceneBottomPanelMethods;
  var ensureSprite = context.ensureSprite;
  var requireChildNode = context.requireChildNode;
  var resolveBottomPanelBoardTargets = context.resolveBottomPanelBoardTargets;

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
    crystalGunButtonNode: resolveButtonNode("crystal_gun_btn"),
    rainbowPrismBallButtonNode: resolveButtonNode("rainbow_prism_ball_btn"),
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
  var crystalGunButtonNode = powerupButtonNodes.crystalGunButtonNode;
  var rainbowPrismBallButtonNode = powerupButtonNodes.rainbowPrismBallButtonNode;
  var threeLineButtonNode = powerupButtonNodes.threeLineButtonNode;
  var plusBallButtonNode = powerupButtonNodes.plusBallButtonNode;
  var directionsButtonNode = requireChildNode(panel, "directions_btn", "BttomPanel");

  this._bindBottomPanelButton(rainbowButtonNode, "use_rainbow");
  this._bindBottomPanelButton(preciseAimButtonNode, "use_precise_aim");
  this._bindBottomPanelButton(changeButtonNode, "use_swap");
  this._bindBottomPanelButton(destroyButtonNode, "use_barrier_hammer");
  this._bindBottomPanelButton(snowRemovalButtonNode, "use_snow_removal");
  this._bindBottomPanelButton(bombButtonNode, "use_blast");
  this._bindBottomPanelButton(crystalGunButtonNode, "use_crystal_gun");
  this._bindBottomPanelButton(rainbowPrismBallButtonNode, "use_rainbow_prism_ball");
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
  if (!Object.prototype.hasOwnProperty.call(skillInventory, "crystal_gun")) {
    throw new Error("Bottom panel requires crystal_gun inventory count.");
  }
  var crystalGunCount = Number(skillInventory.crystal_gun);
  if (!Number.isInteger(crystalGunCount) || crystalGunCount < 0) {
    throw new Error("Bottom panel crystal_gun count must be a non-negative integer.");
  }
  if (!Object.prototype.hasOwnProperty.call(skillInventory, "rainbow_prism_ball")) {
    throw new Error("Bottom panel requires rainbow_prism_ball inventory count.");
  }
  var rainbowPrismBallCount = Number(skillInventory.rainbow_prism_ball);
  if (!Number.isInteger(rainbowPrismBallCount) || rainbowPrismBallCount < 0) {
    throw new Error("Bottom panel rainbow_prism_ball count must be a non-negative integer.");
  }
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
  var canUseCrystalGun = canUsePowerup && !pendingBarrierHammer && crystalGunCount > 0;
  var canUseRainbowPrismBall = canUsePowerup && !pendingBarrierHammer && rainbowPrismBallCount > 0;
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
  crystalGunButtonNode.active = crystalGunCount > 0;
  if (crystalGunButtonNode.active) {
    var crystalGunNumBgNode = requireChildNode(crystalGunButtonNode, "num_bg", "crystal_gun_btn");
    var crystalGunVideoNode = requireChildNode(crystalGunButtonNode, "vido_btn", "crystal_gun_btn");
    crystalGunNumBgNode.active = true;
    crystalGunVideoNode.active = false;
    this._setBottomPanelCount(crystalGunButtonNode, crystalGunCount);
  }
  rainbowPrismBallButtonNode.active = rainbowPrismBallCount > 0;
  if (rainbowPrismBallButtonNode.active) {
    var rainbowPrismNumBgNode = requireChildNode(rainbowPrismBallButtonNode, "num_bg", "rainbow_prism_ball_btn");
    var rainbowPrismVideoNode = requireChildNode(rainbowPrismBallButtonNode, "vido_btn", "rainbow_prism_ball_btn");
    rainbowPrismNumBgNode.active = true;
    rainbowPrismVideoNode.active = false;
    this._setBottomPanelCount(rainbowPrismBallButtonNode, rainbowPrismBallCount);
  }
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
  this._setBottomPanelButtonEnabled(crystalGunButtonNode, canUseCrystalGun, {
    dimWhenDisabled: false
  });
  this._setBottomPanelButtonEnabled(rainbowPrismBallButtonNode, canUseRainbowPrismBall, {
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
}

module.exports = attachLevelRendererSceneBottomPanelMethods;
