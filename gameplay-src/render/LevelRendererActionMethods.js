"use strict";

function attachLevelRendererActionMethods(LevelRenderer, context) {


LevelRenderer.prototype.setLoseAdPresentation = function (options) {
  options = options || {};
  var showVideoIcon = options.showVideoIcon === true;
  var showCoinIcon = options.showCoinIcon === true;
  if (showVideoIcon && showCoinIcon) {
    throw new Error("LoseView revive button cannot show video and coin icons at the same time.");
  }
  this.loseAdPresentation = {
    showVideoIcon: showVideoIcon,
    showCoinIcon: showCoinIcon
  };
};

LevelRenderer.prototype.setLoseCoinPresentation = function (options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("LoseView coin presentation options are required.");
  }
  var cost = Math.floor(Number(options.cost));
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error("LoseView coin revive cost must be a positive integer.");
  }
  if (typeof options.getCoinCount !== "function") {
    throw new Error("LoseView coin presentation requires getCoinCount.");
  }
  this.loseCoinPresentation = {
    cost: cost,
    getCoinCount: options.getCoinCount
  };
};

LevelRenderer.prototype.setAddBallTipsCoinPresentation = function (options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("AddBallTipsView coin presentation options are required.");
  }
  var cost = Math.floor(Number(options.cost));
  if (!Number.isInteger(cost) || cost <= 0) {
    throw new Error("AddBallTipsView coin cost must be a positive integer.");
  }
  if (typeof options.getCoinCount !== "function") {
    throw new Error("AddBallTipsView coin presentation requires getCoinCount.");
  }
  this.addBallTipsCoinPresentation = {
    cost: cost,
    getCoinCount: options.getCoinCount
  };
};

LevelRenderer.prototype.setWinActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.winActionHandlers = {
    onNextLevel: typeof handlers.onNextLevel === "function" ? handlers.onNextLevel : null,
    onRetryLevel: typeof handlers.onRetryLevel === "function" ? handlers.onRetryLevel : null
  };
};

LevelRenderer.prototype.setLoseActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.loseActionHandlers = {
    onRetryLevel: typeof handlers.onRetryLevel === "function" ? handlers.onRetryLevel : null,
    onBackLevel: typeof handlers.onBackLevel === "function" ? handlers.onBackLevel : null,
    onWatchAd: typeof handlers.onWatchAd === "function" ? handlers.onWatchAd : null,
    onCoinRevive: typeof handlers.onCoinRevive === "function" ? handlers.onCoinRevive : null
  };
};

LevelRenderer.prototype.setAddBallTipsActionHandlers = function (handlers) {
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    throw new Error("AddBallTipsView action handlers are required.");
  }
  if (typeof handlers.onClose !== "function") {
    throw new Error("AddBallTipsView requires onClose handler.");
  }
  if (typeof handlers.onWatchAd !== "function") {
    throw new Error("AddBallTipsView requires onWatchAd handler.");
  }
  if (typeof handlers.onCoinBuy !== "function") {
    throw new Error("AddBallTipsView requires onCoinBuy handler.");
  }
  this.addBallTipsActionHandlers = {
    onClose: handlers.onClose,
    onWatchAd: handlers.onWatchAd,
    onCoinBuy: handlers.onCoinBuy
  };
};

LevelRenderer.prototype.setPauseActionHandlers = function (handlers) {
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    throw new Error("PauseView action handlers are required.");
  }
  if (typeof handlers.onContinue !== "function") {
    throw new Error("PauseView requires onContinue handler.");
  }
  if (typeof handlers.onRetryLevel !== "function") {
    throw new Error("PauseView requires onRetryLevel handler.");
  }
  if (typeof handlers.onExitLevel !== "function") {
    throw new Error("PauseView requires onExitLevel handler.");
  }
  this.pauseActionHandlers = {
    onContinue: handlers.onContinue,
    onRetryLevel: handlers.onRetryLevel,
    onExitLevel: handlers.onExitLevel
  };
};

LevelRenderer.prototype.setResultViewLifecycleHandlers = function (handlers) {
  handlers = handlers || {};
  this.resultViewLifecycleHandlers = {
    onRescueSuccessfulViewShow: typeof handlers.onRescueSuccessfulViewShow === "function" ? handlers.onRescueSuccessfulViewShow : null,
    onWinViewShow: typeof handlers.onWinViewShow === "function" ? handlers.onWinViewShow : null,
    onWinViewHide: typeof handlers.onWinViewHide === "function" ? handlers.onWinViewHide : null,
    onLoseViewShow: typeof handlers.onLoseViewShow === "function" ? handlers.onLoseViewShow : null,
    onLoseViewHide: typeof handlers.onLoseViewHide === "function" ? handlers.onLoseViewHide : null
  };
};

LevelRenderer.prototype.setGameplayActionHandlers = function (handlers) {
  handlers = handlers || {};
  this.gameplayActionHandlers = {
    onBackToLevel: typeof handlers.onBackToLevel === "function" ? handlers.onBackToLevel : null,
    onOpenPause: typeof handlers.onOpenPause === "function" ? handlers.onOpenPause : null,
    onOpenSettings: typeof handlers.onOpenSettings === "function" ? handlers.onOpenSettings : null,
    onOpenPropDescription: typeof handlers.onOpenPropDescription === "function" ? handlers.onOpenPropDescription : null,
    onClosePropDescription: typeof handlers.onClosePropDescription === "function" ? handlers.onClosePropDescription : null,
    onUseRainbow: typeof handlers.onUseRainbow === "function" ? handlers.onUseRainbow : null,
    onUseBlast: typeof handlers.onUseBlast === "function" ? handlers.onUseBlast : null,
    onUseSwap: typeof handlers.onUseSwap === "function" ? handlers.onUseSwap : null,
    onUseBarrierHammer: typeof handlers.onUseBarrierHammer === "function" ? handlers.onUseBarrierHammer : null,
    onUseSnowRemoval: typeof handlers.onUseSnowRemoval === "function" ? handlers.onUseSnowRemoval : null,
    onUseAssistSpiritSkill: typeof handlers.onUseAssistSpiritSkill === "function" ? handlers.onUseAssistSpiritSkill : null,
    onUseThreeLineElimination: typeof handlers.onUseThreeLineElimination === "function" ? handlers.onUseThreeLineElimination : null,
    onUsePlusThreeBalls: typeof handlers.onUsePlusThreeBalls === "function" ? handlers.onUsePlusThreeBalls : null,
    onRecoverAdRunPowerupByAd: typeof handlers.onRecoverAdRunPowerupByAd === "function" ? handlers.onRecoverAdRunPowerupByAd : null,
    onSelectRainbowColor: typeof handlers.onSelectRainbowColor === "function" ? handlers.onSelectRainbowColor : null,
    onRecoverInventoryByAd: typeof handlers.onRecoverInventoryByAd === "function" ? handlers.onRecoverInventoryByAd : null
  };
};

LevelRenderer.prototype.setFallingMarbleSystem = function (fallingMarbleSystem, boardAdvancePresentationTarget) {
  if (
    !fallingMarbleSystem ||
    typeof fallingMarbleSystem.requestEliminationPresentationDropRelease !== "function"
  ) {
    throw new Error("LevelRenderer.setFallingMarbleSystem requires FallingMarbleSystem.");
  }
  if (
    boardAdvancePresentationTarget !== undefined &&
    (
      !boardAdvancePresentationTarget ||
      typeof boardAdvancePresentationTarget.notifyBoardAdvanceEliminationPresentationComplete !== "function"
    )
  ) {
    throw new Error("LevelRenderer.setFallingMarbleSystem requires board advance presentation target when provided.");
  }
  this.bubbleShatterRenderer.setPresentationCompleteHandler(function () {
    fallingMarbleSystem.requestEliminationPresentationDropRelease();
    if (boardAdvancePresentationTarget) {
      boardAdvancePresentationTarget.notifyBoardAdvanceEliminationPresentationComplete();
    }
  });
};

LevelRenderer.prototype._invokeWinAction = function (action) {
  var handler = null;
  if (action === "next") {
    handler = this.winActionHandlers.onNextLevel;
  } else if (action === "retry") {
    handler = this.winActionHandlers.onRetryLevel;
  } else if (action === "back") {
    handler = this.loseActionHandlers.onBackLevel;
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype._invokeLoseAction = function (action) {
  var handler = null;
  if (action === "retry") {
    handler = this.loseActionHandlers.onRetryLevel;
  } else if (action === "back") {
    handler = this.loseActionHandlers.onBackLevel;
  } else if (action === "ad") {
    handler = this.loseActionHandlers.onWatchAd;
  } else if (action === "coin") {
    handler = this.loseActionHandlers.onCoinRevive;
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype._invokeAddBallTipsAction = function (action) {
  var handler = null;
  if (action === "close") {
    handler = this.addBallTipsActionHandlers.onClose;
  } else if (action === "ad") {
    handler = this.addBallTipsActionHandlers.onWatchAd;
  } else if (action === "coin") {
    handler = this.addBallTipsActionHandlers.onCoinBuy;
  } else {
    throw new Error("Unsupported AddBallTipsView action: " + action);
  }

  if (typeof handler !== "function") {
    throw new Error("AddBallTipsView action handler is missing: " + action);
  }

  handler();
};

LevelRenderer.prototype._invokePauseAction = function (action) {
  var handler = null;
  if (action === "continue") {
    handler = this.pauseActionHandlers.onContinue;
  } else if (action === "retry") {
    handler = this.pauseActionHandlers.onRetryLevel;
  } else if (action === "exit") {
    handler = this.pauseActionHandlers.onExitLevel;
  } else {
    throw new Error("Unsupported PauseView action: " + action);
  }
  if (typeof handler !== "function") {
    throw new Error("PauseView action handler is missing: " + action);
  }
  handler();
};

LevelRenderer.prototype._invokeGameplayAction = function (action) {
  if (this.gameplayInteractionEnabled !== true) {
    return;
  }

  var handler = null;
  if (action === "back") {
    handler = this.gameplayActionHandlers.onBackToLevel;
  } else if (action === "open_pause") {
    handler = this.gameplayActionHandlers.onOpenPause;
  } else if (action === "open_settings") {
    handler = this.gameplayActionHandlers.onOpenSettings;
  } else if (action === "open_prop_description") {
    handler = this.gameplayActionHandlers.onOpenPropDescription;
  } else if (action === "close_prop_description") {
    handler = this.gameplayActionHandlers.onClosePropDescription;
  } else if (action === "use_rainbow") {
    handler = this.gameplayActionHandlers.onUseRainbow;
  } else if (action === "use_blast") {
    handler = this.gameplayActionHandlers.onUseBlast;
  } else if (action === "use_swap") {
    handler = this.gameplayActionHandlers.onUseSwap;
  } else if (action === "use_barrier_hammer") {
    handler = this.gameplayActionHandlers.onUseBarrierHammer;
  } else if (action === "use_snow_removal") {
    handler = this.gameplayActionHandlers.onUseSnowRemoval;
  } else if (action === "use_assist_spirit_skill") {
    handler = this.gameplayActionHandlers.onUseAssistSpiritSkill;
  } else if (action === "use_precise_aim") {
    handler = this.gameplayActionHandlers.onUsePreciseAim;
  } else if (action === "use_three_line_elimination") {
    handler = this.gameplayActionHandlers.onUseThreeLineElimination;
  } else if (action === "use_plus_three_balls") {
    handler = this.gameplayActionHandlers.onUsePlusThreeBalls;
  } else if (action.indexOf("select_rainbow_color:") === 0) {
    handler = this.gameplayActionHandlers.onSelectRainbowColor;
    if (typeof handler === "function") {
      handler(action.slice("select_rainbow_color:".length));
      return;
    }
  } else if (action.indexOf("recover_inventory:") === 0) {
    handler = this.gameplayActionHandlers.onRecoverInventoryByAd;
    if (typeof handler === "function") {
      handler(action.slice("recover_inventory:".length));
      return;
    }
  } else if (action.indexOf("recover_ad_powerup:") === 0) {
    handler = this.gameplayActionHandlers.onRecoverAdRunPowerupByAd;
    if (typeof handler === "function") {
      handler(action.slice("recover_ad_powerup:".length));
      return;
    }
  }

  if (typeof handler !== "function") {
    return;
  }

  handler();
};

LevelRenderer.prototype.setGameplayInteractionEnabled = function (enabled) {
  if (typeof enabled !== "boolean") {
    throw new Error("Gameplay interaction enabled state must be boolean.");
  }
  this.gameplayInteractionEnabled = enabled;
};

LevelRenderer.prototype._notifyResultViewLifecycle = function (handlerName) {
  if (!this.resultViewLifecycleHandlers) {
    return;
  }
  var handler = this.resultViewLifecycleHandlers[handlerName];
  if (typeof handler === "function") {
    handler();
  }
};

LevelRenderer.prototype._notifyActiveResultViewsHidden = function () {
  if (!this.layers || !this.layers.modal) {
    return;
  }
  var winView = this.layers.modal.getChildByName("WinView");
  if (winView && winView.active) {
    this._notifyResultViewLifecycle("onWinViewHide");
  }
  var loseView = this.layers.modal.getChildByName("LoseView");
  if (loseView && loseView.active) {
    this._notifyResultViewLifecycle("onLoseViewHide");
  }
};
}

module.exports = attachLevelRendererActionMethods;
