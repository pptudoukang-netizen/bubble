"use strict";

var DebugFlags = require("../utils/DebugFlags");
var Logger = require("../utils/Logger");
var RouteEditorState = require("./RouteEditorState");
var LevelSelectPolicy = require("./LevelSelectPolicy");
var LevelSelectView = require("./LevelSelectView");
var BootstrapButtonFactory = require("./BootstrapButtonFactory");
var StarRatingPolicy = require("../core/StarRatingPolicy");
var BundleLoader = require("../utils/BundleLoader");
var GameCircleWelfareViewController = require("../ui/GameCircleWelfareViewController");
var RankingViewController = require("../ui/RankingViewController");
var ShopViewController = require("../ui/ShopViewController");
var BuyViewController = require("../ui/BuyViewController");
var PopupPanelAnimator = require("../ui/PopupPanelAnimator");
var UiModalReleaseHelper = require("../utils/UiModalReleaseHelper");

var SETTING_VOLUME_STEP = 0.1;
var SETTING_STATUS_X_ENABLED = -18;
var SETTING_STATUS_X_DISABLED = 18;
var SETTING_VOLUME_ICON_OPEN_PATH = "image/setting/sound_on_icon";
var SETTING_VOLUME_ICON_CLOSE_PATH = "image/setting/sound_off_icon";
var GAME_CIRCLE_WELFARE_VIEW_PREFAB_PATH = "prefabs/ui/GamingCircleView";
var RANKING_VIEW_PREFAB_PATH = "prefabs/ui/RankingView";
var SHOP_VIEW_PREFAB_PATH = "prefabs/ui/ShopView";
var BUY_VIEW_PREFAB_PATH = "prefabs/ui/BuyView";
var MAX_LEVEL_MAP_PREFAB_INDEX = 10;
var SIGN_IN_PREFAB_CANDIDATES = [
  "prefabs/ui/SignInView ",
  "prefabs/ui/SignInView"
];
var SIGN_IN_BUTTON_SPRITE_PATHS = {
  claimed: "image/sign/btn_cyan",
  claimable: "image/sign/btn_green",
  locked: "image/sign/btn_blue"
};
var SIGN_IN_DAY_BG_SPRITE_PATHS = {
  claimed: "image/sign/item_bg3",
  claimable: "image/sign/item_bg2",
  locked: "image/sign/item_bg1"
};
var SIGN_IN_ITEM_ICON_PATHS = {
  coin: "image/props/coin",
  stamina: "image/props/treasure_chest",
  gift_pack: "image/props/gift_pack",
  precise_aim: "image/props/aim",
  swap_ball: "image/props/gift_pack",
  rainbow_ball: "image/props/rainbow_ball",
  blast_ball: "image/props/blast_ball",
  barrier_hammer: "image/props/barrier_hammer",
  snow_removal: "image/props/snow_removal"
};
var SIGN_IN_DAY_ITEM_ICON_PATHS = {
  2: {
    swap_ball: "image/props/change_ball"
  }
};
var SIGN_IN_ITEM_DISPLAY_NAMES = {
  coin: "金币",
  stamina: "体力",
  gift_pack: "大礼包",
  precise_aim: "精确瞄准",
  swap_ball: "换球",
  rainbow_ball: "彩虹球",
  blast_ball: "炸裂球",
  barrier_hammer: "破障锤",
  snow_removal: "除雪剂"
};
var AWARD_VIEW_PREFAB_PATH = "prefabs/ui/AwardView";
var AWARD_ITEM_ICON_PATHS = {
  coin: "image/props/coin",
  stamina: "image/props/love",
  precise_aim: "image/props/aim",
  swap_ball: "image/props/change_ball",
  rainbow_ball: "image/props/rainbow_ball",
  blast_ball: "image/props/blast_ball",
  barrier_hammer: "image/props/barrier_hammer",
  snow_removal: "image/props/snow_removal"
};
var AWARD_ITEM_DISPLAY_NAMES = {
  coin: "金币",
  stamina: "体力",
  precise_aim: "精确瞄准",
  swap_ball: "换球",
  rainbow_ball: "彩虹球",
  blast_ball: "炸裂球",
  barrier_hammer: "破障锤",
  snow_removal: "除雪剂"
};
var hasOwn = Object.prototype.hasOwnProperty;

function formatRewardItems(items) {
  return (Array.isArray(items) ? items : []).map(function (item) {
    var itemId = item && typeof item.id === "string" ? item.id : "";
    var count = Math.max(1, Math.floor(Number(item && item.count) || 1));
    return (SIGN_IN_ITEM_DISPLAY_NAMES[itemId] || itemId || "奖励") + " x" + count;
  }).join("、") || "奖励";
}

function showStatusAndTip(host, message) {
  if (!host || typeof message !== "string" || !message) {
    return;
  }

  host._setStatus(message);
  if (host.tipsPresenter && typeof host.tipsPresenter.showText === "function") {
    host.tipsPresenter.showText(message);
  }
}

function hideGameCircleWelfareViewNode(host) {
  if (!host) {
    return;
  }
  if (host.gameCircleButtonAdapter && typeof host.gameCircleButtonAdapter.hideAllButtons === "function") {
    host.gameCircleButtonAdapter.hideAllButtons();
  }
  UiModalReleaseHelper.releaseCachedModal(host, {
    label: "GameCircleWelfareView",
    nodeKey: "_gameCircleWelfareViewNode",
    prefabKey: "_gameCircleWelfareViewPrefab",
    controllerKey: "_gameCircleWelfareViewController"
  });
}

function resolveGameCirclePlatform(host) {
  if (host && host.gameCircleButtonAdapter && host.gameCircleButtonAdapter.platform) {
    return host.gameCircleButtonAdapter.platform;
  }
  if (typeof wx !== "undefined") {
    return wx;
  }
  if (typeof window !== "undefined" && window.wx) {
    return window.wx;
  }
  return null;
}

function isGameCircleWelfareViewVisible(host) {
  return !!(
    host &&
    host._gameCircleWelfareViewNode &&
    cc.isValid(host._gameCircleWelfareViewNode) &&
    host._gameCircleWelfareViewNode.active
  );
}

function resolveStarChestFailMessage(reason, summary) {
  if (reason === "STAR_CHEST_DISABLED") {
    return "星星宝箱暂未开放";
  }
  if (reason === "STAR_CHEST_NOT_ENOUGH_STARS") {
    var starsPerChest = Math.max(1, Math.floor(Number(summary && summary.starsPerChest) || 15));
    var progressStars = Math.max(0, Math.floor(Number(summary && summary.progressStars) || 0));
    return "当前没有可领取奖励，收集星星 " + progressStars + "/" + starsPerChest;
  }
  if (reason === "STAR_CHEST_REWARD_POOL_EMPTY") {
    return "当前没有可领取奖励";
  }
  return "领取失败，请重试";
}

function resolveGameCircleFailMessage(error) {
  var message = error && error.message ? error.message : String(error);
  if (message === "GAME_CIRCLE_DATA_NOT_REFRESHED") {
    return "请先刷新游戏圈进度";
  }
  if (message === "GAME_CIRCLE_TASK_NOT_COMPLETE") {
    return "任务尚未完成";
  }
  if (message === "GAME_CIRCLE_TASK_ALREADY_CLAIMED") {
    return "奖励已领取";
  }
  if (message === "GAME_CIRCLE_AUTH_DENIED") {
    return "请在微信小游戏环境下完成授权后再打开游戏圈福利";
  }
  if (message === "NETWORK_LOADING_TIMEOUT") {
    return "网络请求超时，请重试";
  }
  if (message.indexOf("wx.getGameClubData is unavailable") >= 0) {
    return "游戏圈数据仅微信小游戏环境可刷新";
  }
  if (message.indexOf("wx.createGameClubButton is unavailable") >= 0) {
    return "游戏圈入口仅微信小游戏环境可用";
  }
  if (message.indexOf("api scope is not declared in the privacy agreement") >= 0) {
    return "请先在微信后台隐私保护指引声明游戏圈数据";
  }
  if (message.indexOf("GAME_CIRCLE_ENCRYPTED_DATA_REQUIRES_DECRYPTION") >= 0) {
    return "游戏圈数据需后端解密后刷新";
  }
  if (message.indexOf("Game circle data missing like count metric") >= 0) {
    return "游戏圈点赞数据字段未返回";
  }
  if (message.indexOf("Game circle platform response missing dataList") >= 0) {
    if (message.length > 90) {
      message = message.slice(0, 90);
    }
    return "游戏圈数据结构异常：" + message;
  }
  if (message.length > 90) {
    message = message.slice(0, 90);
  }
  return "游戏圈福利失败：" + message;
}

function normalizeAwardPopupItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Award popup requires non-empty reward items.");
  }

  return items.map(function (item, index) {
    if (!item || typeof item !== "object") {
      throw new Error("Invalid reward item at index " + index + ".");
    }

    if (typeof item.id !== "string" || !item.id) {
      throw new Error("Reward item id is required at index " + index + ".");
    }

    if (!hasOwn.call(AWARD_ITEM_DISPLAY_NAMES, item.id)) {
      throw new Error("Unsupported reward item id: " + item.id);
    }

    var count = Number(item.count);
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("Reward item count must be a positive integer for id: " + item.id);
    }

    return {
      id: item.id,
      count: count
    };
  });
}

module.exports = {
  DebugFlags: DebugFlags,
  Logger: Logger,
  RouteEditorState: RouteEditorState,
  LevelSelectPolicy: LevelSelectPolicy,
  LevelSelectView: LevelSelectView,
  BootstrapButtonFactory: BootstrapButtonFactory,
  StarRatingPolicy: StarRatingPolicy,
  BundleLoader: BundleLoader,
  GameCircleWelfareViewController: GameCircleWelfareViewController,
  RankingViewController: RankingViewController,
  ShopViewController: ShopViewController,
  BuyViewController: BuyViewController,
  PopupPanelAnimator: PopupPanelAnimator,
  SETTING_VOLUME_STEP: SETTING_VOLUME_STEP,
  SETTING_STATUS_X_ENABLED: SETTING_STATUS_X_ENABLED,
  SETTING_STATUS_X_DISABLED: SETTING_STATUS_X_DISABLED,
  SETTING_VOLUME_ICON_OPEN_PATH: SETTING_VOLUME_ICON_OPEN_PATH,
  SETTING_VOLUME_ICON_CLOSE_PATH: SETTING_VOLUME_ICON_CLOSE_PATH,
  GAME_CIRCLE_WELFARE_VIEW_PREFAB_PATH: GAME_CIRCLE_WELFARE_VIEW_PREFAB_PATH,
  RANKING_VIEW_PREFAB_PATH: RANKING_VIEW_PREFAB_PATH,
  SHOP_VIEW_PREFAB_PATH: SHOP_VIEW_PREFAB_PATH,
  BUY_VIEW_PREFAB_PATH: BUY_VIEW_PREFAB_PATH,
  MAX_LEVEL_MAP_PREFAB_INDEX: MAX_LEVEL_MAP_PREFAB_INDEX,
  SIGN_IN_PREFAB_CANDIDATES: SIGN_IN_PREFAB_CANDIDATES,
  SIGN_IN_BUTTON_SPRITE_PATHS: SIGN_IN_BUTTON_SPRITE_PATHS,
  SIGN_IN_DAY_BG_SPRITE_PATHS: SIGN_IN_DAY_BG_SPRITE_PATHS,
  SIGN_IN_ITEM_ICON_PATHS: SIGN_IN_ITEM_ICON_PATHS,
  SIGN_IN_DAY_ITEM_ICON_PATHS: SIGN_IN_DAY_ITEM_ICON_PATHS,
  SIGN_IN_ITEM_DISPLAY_NAMES: SIGN_IN_ITEM_DISPLAY_NAMES,
  AWARD_VIEW_PREFAB_PATH: AWARD_VIEW_PREFAB_PATH,
  AWARD_ITEM_ICON_PATHS: AWARD_ITEM_ICON_PATHS,
  AWARD_ITEM_DISPLAY_NAMES: AWARD_ITEM_DISPLAY_NAMES,
  hasOwn: hasOwn,
  formatRewardItems: formatRewardItems,
  showStatusAndTip: showStatusAndTip,
  hideGameCircleWelfareViewNode: hideGameCircleWelfareViewNode,
  resolveGameCirclePlatform: resolveGameCirclePlatform,
  isGameCircleWelfareViewVisible: isGameCircleWelfareViewVisible,
  resolveStarChestFailMessage: resolveStarChestFailMessage,
  resolveGameCircleFailMessage: resolveGameCircleFailMessage,
  normalizeAwardPopupItems: normalizeAwardPopupItems
};
