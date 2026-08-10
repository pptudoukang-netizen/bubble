"use strict";

function requireEquippedSpiritRuntimeState(host) {
  if (!host.assistSpiritState || typeof host.assistSpiritState !== "object" || Array.isArray(host.assistSpiritState)) {
    throw new Error("Assist spirit skill requires assistSpiritState.");
  }
  var spiritId = host.assistSpiritState.equippedSpiritId;
  if (typeof spiritId !== "string" || !spiritId) {
    throw new Error("Assist spirit skill requires equippedSpiritId.");
  }
  var spirits = host.assistSpiritState.spirits;
  if (!spirits || typeof spirits !== "object" || Array.isArray(spirits)) {
    throw new Error("Assist spirit runtime requires spirits state.");
  }
  var equippedState = spirits[spiritId];
  if (!equippedState || typeof equippedState !== "object" || Array.isArray(equippedState)) {
    throw new Error("Assist spirit runtime requires equipped spirit state: " + spiritId);
  }
  if (!Number.isInteger(equippedState.level)) {
    throw new Error("Assist spirit runtime requires integer equipped spirit level: " + spiritId);
  }
  return {
    spiritId: spiritId,
    level: equippedState.level
  };
}

module.exports = {
  _syncEquippedAssistSpiritToGameManager: function () {
    if (!this.gameManager || typeof this.gameManager.setEquippedAssistSpirit !== "function") {
      throw new Error("Assist spirit runtime requires GameManager.setEquippedAssistSpirit.");
    }
    var runtimeState = requireEquippedSpiritRuntimeState(this);
    return this.gameManager.setEquippedAssistSpirit(runtimeState.spiritId, runtimeState.level);
  },

  _onUseAssistSpiritSkillTap: function () {
    if (!this.currentLevelConfig || this.isRestarting || this.isSelectingLevel || this.isGameplayPaused) {
      return;
    }
    if (this._isTerminalState() || this._assistSpiritSkillInProgress === true) {
      return;
    }
    if (!this.gameManager || typeof this.gameManager.previewAssistSpiritSkill !== "function") {
      throw new Error("Assist spirit skill requires GameManager.previewAssistSpiritSkill.");
    }
    if (!this.levelRenderer || typeof this.levelRenderer.playAssistSpiritSkillEffect !== "function") {
      throw new Error("Assist spirit skill requires LevelRenderer.playAssistSpiritSkillEffect.");
    }

    var spiritId = requireEquippedSpiritRuntimeState(this).spiritId;
    this._playSfx("uiClick");
    var preview = this.gameManager.previewAssistSpiritSkill(spiritId);
    if (!preview || preview.accepted !== true) {
      var reason = preview && typeof preview.reason === "string" ? preview.reason : "preview_failed";
      if (reason === "charging") {
        if (typeof this._tryUnlockAssistSpiritSkillChargeByAd !== "function") {
          throw new Error("Assist spirit skill charge requires rewarded-ad unlock handler.");
        }
        return this._tryUnlockAssistSpiritSkillChargeByAd();
      }
      if (reason === "no_target") {
        if (this.tipsPresenter && typeof this.tipsPresenter.showText === "function") {
          this.tipsPresenter.showText("当前棋盘没有可释放的技能目标");
        }
        return;
      }
      if (reason === "no_global_skill") {
        throw new Error("A visible ShooterPanel Skill button cannot use a spirit without a global skill.");
      }
      return;
    }

    this._assistSpiritSkillInProgress = true;
    return this.levelRenderer.playAssistSpiritSkillEffect(preview, function (skillId) {
      if (skillId === "lightning_chain") {
        this._playSfx("lighting");
        return;
      }
      if (skillId === "tornado") {
        this._playSfx("tornado");
      }
    }.bind(this)).then(function () {
      var result = this.gameManager.useAssistSpiritSkill(spiritId, preview);
      if (!result || result.accepted !== true || !result.snapshot) {
        throw new Error("Assist spirit skill resolution was not accepted.");
      }
      this._handleRuntimeStateTransition(result.snapshot);
      this.levelRenderer.refreshRuntime(this.currentLevelConfig, result.snapshot);
      this._playRuntimeAudioEvents(result.snapshot);
      this._setStatus(this._formatStatus(this.currentLevelConfig, result.snapshot));
      this._assistSpiritSkillInProgress = false;
      return result;
    }.bind(this)).catch(function (error) {
      this._assistSpiritSkillInProgress = false;
      throw error;
    }.bind(this));
  }
};
