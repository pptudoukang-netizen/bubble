"use strict";

var DebugFlags = require("../utils/DebugFlags");
var Logger = require("../utils/Logger");
var BundleLoader = require("../utils/BundleLoader");
var PoolManager = require("../utils/PoolManager");
var LevelProgressStore = require("../utils/LevelProgressStore");
var PlayerResourceStore = require("../utils/PlayerResourceStore");
var InventoryStore = require("../utils/InventoryStore");
var StarChestStore = require("../utils/StarChestStore");
var ShopStateStore = require("../utils/ShopStateStore");
var GameCircleWelfareStore = require("../utils/GameCircleWelfareStore");
var SelectedPowerupsStore = require("../utils/SelectedPowerupsStore");
var SignInStore = require("../utils/SignInStore");
var RouteConfigStore = require("../utils/RouteConfigStore");
var AudioManager = require("../audio/AudioManager");
var BoardLayout = require("../config/BoardLayout");
var DailySignInConfig = require("../config/DailySignInConfig");
var StarChestConfig = require("../config/StarChestConfig");
var GameCircleWelfareConfig = require("../config/GameCircleWelfareConfig");
var ShopGoodsConfig = require("../config/ShopGoodsConfig");
var ShopRulesConfig = require("../config/ShopRulesConfig");
var LevelManager = require("../config/LevelManager");
var RuntimeModeConfig = require("../config/RuntimeModeConfig");
var GameManager = require("../core/GameManager");
var StarRatingPolicy = require("../core/StarRatingPolicy");
var LevelSelectPolicy = require("./LevelSelectPolicy");
var RouteEditorState = require("./RouteEditorState");
var ResourceGateway = require("./ResourceGateway");
var LevelSelectView = require("./LevelSelectView");
var BootstrapButtonFactory = require("./BootstrapButtonFactory");
var LevelRenderer = require("../render/LevelRenderer");
var LoadingViewController = require("../ui/LoadingViewController");
var TipsPresenter = require("../ui/TipsPresenter");
var BackpackViewController = require("../ui/BackpackViewController");
var StarChestRewardService = require("../services/StarChestRewardService");
var StarChestService = require("../services/StarChestService");
var GameCircleButtonAdapter = require("../services/GameCircleButtonAdapter");
var GameCircleWelfareService = require("../services/GameCircleWelfareService");
var ShopConfigService = require("../services/ShopConfigService");
var ShopStateService = require("../services/ShopStateService");
var ShopPurchaseService = require("../services/ShopPurchaseService");
var AdService = require("../services/AdService");
var TelemetryService = require("../services/TelemetryService");
var AdRewardQuotaStore = require("../services/AdRewardQuotaStore");
var AdRewardCatalog = require("../services/AdRewardCatalog");

var BASELINE_HALF_WIDTH = 360;
var BASELINE_HALF_HEIGHT = 640;
var JAR_RAISE_FROM_BOTTOM = 70;
var SHOOTER_RAISE_FROM_BOTTOM = 100;
var BASELINE_SIDE_PADDING = BASELINE_HALF_WIDTH - Math.abs(BoardLayout.boardRight);
var BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM = ((BoardLayout.jarBaseY + BoardLayout.jarRenderYOffset) - (-BASELINE_HALF_HEIGHT)) + JAR_RAISE_FROM_BOTTOM;
var BASELINE_JAR_RENDER_Y_OFFSET = Number(BoardLayout.jarRenderYOffset) || 0;
var BASELINE_SHOOTER_OFFSET_FROM_BOTTOM = (BoardLayout.shooterOrigin.y - (-BASELINE_HALF_HEIGHT)) + SHOOTER_RAISE_FROM_BOTTOM;
var BASELINE_DANGER_OFFSET_FROM_BOTTOM = 460;
var INVENTORY_VIEW_PREFAB_PATH = "prefabs/ui/BackpackView";
var POWERUP_TYPE_BY_ITEM_ID = {
  swap_ball: "swap",
  rainbow_ball: "rainbow",
  blast_ball: "blast",
  barrier_hammer: "barrier_hammer"
};
var ITEM_ID_BY_POWERUP_TYPE = {
  swap: "swap_ball",
  rainbow: "rainbow_ball",
  blast: "blast_ball",
  barrier_hammer: "barrier_hammer"
};
var MAX_SELECTED_POWERUPS = 4;
var MAX_SELECTED_POWERUP_TOTAL_COUNT = 4;
var INVENTORY_TOTAL_LIMIT_TIP = "关卡中最多携带" + MAX_SELECTED_POWERUP_TOTAL_COUNT + "个道具";
var RELEASE_FALSE_SCENE_FIELDS = [
  "enableSpecialEntitiesTestMode",
  "showDebugOverlay",
  "showGridTestLayer",
  "showDropTestButton",
  "enableLevelEditor",
  "enableMockRewardedAdOnUnsupported"
];

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function assertReleaseSceneFieldDisabled(component, fieldName) {
  if (component[fieldName] !== false) {
    throw new Error("Release scene field `" + fieldName + "` must be false.");
  }
}

function assertReleaseRewardedVideoAdUnitId(adUnitId) {
  if (typeof adUnitId !== "string") {
    throw new Error("Release rewardedVideoAdUnitId must be a string.");
  }
  if (adUnitId.trim().length === 0) {
    throw new Error("Release rewardedVideoAdUnitId must be configured.");
  }
}

function requireNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(fieldName + " must be a non-negative integer.");
  }
  return value;
}

module.exports = {
  DebugFlags: DebugFlags,
  Logger: Logger,
  BundleLoader: BundleLoader,
  PoolManager: PoolManager,
  LevelProgressStore: LevelProgressStore,
  PlayerResourceStore: PlayerResourceStore,
  InventoryStore: InventoryStore,
  StarChestStore: StarChestStore,
  ShopStateStore: ShopStateStore,
  GameCircleWelfareStore: GameCircleWelfareStore,
  SelectedPowerupsStore: SelectedPowerupsStore,
  SignInStore: SignInStore,
  RouteConfigStore: RouteConfigStore,
  AudioManager: AudioManager,
  BoardLayout: BoardLayout,
  DailySignInConfig: DailySignInConfig,
  StarChestConfig: StarChestConfig,
  GameCircleWelfareConfig: GameCircleWelfareConfig,
  ShopGoodsConfig: ShopGoodsConfig,
  ShopRulesConfig: ShopRulesConfig,
  LevelManager: LevelManager,
  RuntimeModeConfig: RuntimeModeConfig,
  GameManager: GameManager,
  StarRatingPolicy: StarRatingPolicy,
  LevelSelectPolicy: LevelSelectPolicy,
  RouteEditorState: RouteEditorState,
  ResourceGateway: ResourceGateway,
  LevelSelectView: LevelSelectView,
  BootstrapButtonFactory: BootstrapButtonFactory,
  LevelRenderer: LevelRenderer,
  LoadingViewController: LoadingViewController,
  TipsPresenter: TipsPresenter,
  BackpackViewController: BackpackViewController,
  StarChestRewardService: StarChestRewardService,
  StarChestService: StarChestService,
  GameCircleButtonAdapter: GameCircleButtonAdapter,
  GameCircleWelfareService: GameCircleWelfareService,
  ShopConfigService: ShopConfigService,
  ShopStateService: ShopStateService,
  ShopPurchaseService: ShopPurchaseService,
  AdService: AdService,
  TelemetryService: TelemetryService,
  AdRewardQuotaStore: AdRewardQuotaStore,
  AdRewardCatalog: AdRewardCatalog,
  BASELINE_HALF_WIDTH: BASELINE_HALF_WIDTH,
  BASELINE_HALF_HEIGHT: BASELINE_HALF_HEIGHT,
  JAR_RAISE_FROM_BOTTOM: JAR_RAISE_FROM_BOTTOM,
  SHOOTER_RAISE_FROM_BOTTOM: SHOOTER_RAISE_FROM_BOTTOM,
  BASELINE_SIDE_PADDING: BASELINE_SIDE_PADDING,
  BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM: BASELINE_JAR_RENDER_OFFSET_FROM_BOTTOM,
  BASELINE_JAR_RENDER_Y_OFFSET: BASELINE_JAR_RENDER_Y_OFFSET,
  BASELINE_SHOOTER_OFFSET_FROM_BOTTOM: BASELINE_SHOOTER_OFFSET_FROM_BOTTOM,
  BASELINE_DANGER_OFFSET_FROM_BOTTOM: BASELINE_DANGER_OFFSET_FROM_BOTTOM,
  INVENTORY_VIEW_PREFAB_PATH: INVENTORY_VIEW_PREFAB_PATH,
  POWERUP_TYPE_BY_ITEM_ID: POWERUP_TYPE_BY_ITEM_ID,
  ITEM_ID_BY_POWERUP_TYPE: ITEM_ID_BY_POWERUP_TYPE,
  MAX_SELECTED_POWERUPS: MAX_SELECTED_POWERUPS,
  MAX_SELECTED_POWERUP_TOTAL_COUNT: MAX_SELECTED_POWERUP_TOTAL_COUNT,
  INVENTORY_TOTAL_LIMIT_TIP: INVENTORY_TOTAL_LIMIT_TIP,
  RELEASE_FALSE_SCENE_FIELDS: RELEASE_FALSE_SCENE_FIELDS,
  clone: clone,
  assertReleaseSceneFieldDisabled: assertReleaseSceneFieldDisabled,
  assertReleaseRewardedVideoAdUnitId: assertReleaseRewardedVideoAdUnitId,
  requireNonNegativeInteger: requireNonNegativeInteger
};
