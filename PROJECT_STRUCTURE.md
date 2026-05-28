# PROJECT_STRUCTURE.md

## 项目定位

本项目是 Cocos Creator 2.4.9 微信小游戏项目，核心玩法是泡泡龙关卡制闯关。主工程代码在 `assets/scripts`，关卡配置在 `assets/resources/config/levels`，微信云函数在 `cloudfunctions`，开放数据域在 `open-data`。

项目遵守 `AGENTS.md` 中的 Fail-Fast 严格模式：优先暴露错误，不通过默认值、静默返回、mock 或兜底分支掩盖问题。

## 根目录概览

- `assets/`：Cocos 资源、场景、脚本、预制体、图片、音频等主体内容。
- `assets/scens/game.fire`：主场景。
- `assets/scripts/`：运行时脚本主体。
- `assets/resources/`：Resources 分包资源，包含局内和选关预制体。
- `assets/map/`：地图分包资源，包含无限浮岛选关地图配置、浮岛预制体、地标预制体、传送阵和主角图片。
- `assets/ui/`：UI 分包资源，包含弹窗预制体与 UI 图片。
- `assets/resources/config/levels/`：关卡 JSON 配置，文件名形如 `level_001.json`。
- `cloudfunctions/`：微信云开发函数源码。
- `build-templates/wechatgame/`：微信小游戏构建模板与云函数模板。
- `open-data/`：微信开放数据域逻辑。
- `tools/`：校验、同步、构建修复、调试辅助脚本。
- `settings/`：Cocos Creator 项目设置。
- `package.json`：校验脚本入口。

## 运行入口

主入口是 `assets/scripts/bootstrap/GameBootstrap.js`。

`GameBootstrap.js` 是 Cocos 组件声明文件，负责暴露 Inspector 属性，并把实际实现挂载到组件方法上。具体业务实现拆在多个 `GameBootstrap*Methods.js` 文件中：

- `GameBootstrapCompositionMethods.js`：`onLoad` 初始化中枢，创建 Store、Service、Manager、Renderer、Audio、Tips、NetworkLoading 等。
- `GameBootstrapStartupMethods.js`：启动加载流程，预加载分包、选关预制体、关卡配置，并展示 LoadingView。
- `GameBootstrapGameplayInputMethods.js`：局内触摸输入、瞄准、发射、update 驱动。
- `GameBootstrapLevelRuntimeMethods.js`：启动关卡、重开、终态判断。
- `GameBootstrapLevelSelectFlowMethods.js`：选关页面、关卡进度、胜利记录、星级，并预加载 `map` 分包浮岛地图资源。
- `GameBootstrapRouteEditorFlowMethods.js`：加载关卡与路线编辑器流程。
- `GameBootstrapPowerupInventoryMethods.js`：背包、开局道具、局内技能球和广告补给。
- `GameBootstrapStatusResourceFlowMethods.js`：顶部资源、体力恢复、新手礼、状态文本。
- `GameBootstrapRankingShopChestFlowMethods.js`：排行榜、商店、购买、星星宝箱。
- `GameBootstrapDailyTaskFlowMethods.js`：每日任务和好友体力赠送。
- `GameBootstrapSignInAwardFlowMethods.js`：签到与奖励弹窗。
- `GameBootstrapGameCircleFlowMethods.js`：游戏圈福利与原生按钮适配。
- `GameBootstrapSettingsFlowMethods.js`：设置页和音频开关/音量。
- `GameBootstrapAdRewardMethods.js`：激励广告、广告奖励、频控。
- `GameBootstrapAudioMethods.js`：背景音乐、音效、震动。
- `GameBootstrapShareFlowMethods.js`：微信分享。
- `GameBootstrapRuntimeConfigMethods.js`：运行模式、视口、安全区、棋盘参数。
- `GameBootstrapLifecycleMethods.js`：生命周期和 resize 处理。

`GameBootstrapShared.js` 汇总所有依赖和常量，是 bootstrap 层的共享依赖入口。

## 核心模块分层

### bootstrap

路径：`assets/scripts/bootstrap`

应用编排层。它连接 UI、玩法内核、渲染、服务、存储、广告、微信能力和音频。修改业务流程时通常先从这里找到真实调用链。

- `LevelSelectView.js`：选关页顶层 UI 渲染入口，负责顶部状态和入口按钮绑定，并调用浮岛地图渲染器。
- `LevelSelectFloatingMap.js`：按 `assets/map/config/floating_map.json` 渲染 200 关无限上滚动浮岛地图，负责虚拟列表、关卡点状态、主角、传送阵和背景跟随。

### core

路径：`assets/scripts/core`

- `GameManager.js`：玩法状态机和运行时核心。负责开局、瞄准、发射、技能、结算、胜负、分数、运行时事件、runtime snapshot。
- `GameManagerShotResolutionMethods.js`：发射命中后的消除、掉落、收集等结算扩展。
- `AdRevivePolicy.js`：广告复活策略，统一复活补球、目标色选择和 LoseView 描述文案。
- `ProjectileMath.js`：弹道与几何计算。
- `StarRatingPolicy.js`：星级计算策略。

### systems

路径：`assets/scripts/systems`

玩法底层系统：

- `BubbleGrid.js`：棋盘格与格子状态。
- `MatchSystem.js`：同色匹配消除。
- `SupportSystem.js`：连通/悬空判断。
- `FallingMarbleSystem.js`：掉落球运动。
- `JarCollectorSystem.js`：底部罐子收集。
- `ShooterController.js`：射手和待发球。
- `TrajectoryPredictor.js`：瞄准轨迹预测。
- `BaseSystem.js`：系统基类。

### render

路径：`assets/scripts/render`

渲染层只根据关卡配置和 runtime snapshot 同步 Cocos 节点：

- `LevelRenderer.js`：渲染入口、资源预加载、事件 handler、公共节点/资源逻辑。
- `LevelRendererSceneMethods.js`：棋盘、HUD、底部面板、弹道、掉落、罐子、胜负弹窗、动画等具体渲染。
- `PrefabFactory.js`：预制体实例化辅助。
- `RenderNodeHelpers.js`：节点操作辅助。

### config

路径：`assets/scripts/config`

配置层。重点文件：

- `LevelManager.js`：按关卡 ID 生成 key，调用 `LevelConfigLoader` 加载并缓存关卡配置。
- `LevelConfigLoader.js`：关卡配置加载、校验、规范化。这里大量使用 Fail-Fast 校验。
- `BoardLayout.js`：棋盘布局参数。
- `AimTuningProfiles.js`：瞄准调参配置。
- `DailyTaskConfig.js`、`DailySignInConfig.js`、`ShopGoodsConfig.js`、`ShopRulesConfig.js`、`StarChestConfig.js`、`GameCircleWelfareConfig.js` 等：业务静态配置。
- `RuntimeModeConfig.js`：运行模式配置。

### services

路径：`assets/scripts/services`

业务服务层，封装规则和平台能力：

- 广告：`AdService.js`、`AdRewardCatalog.js`、`AdRewardQuotaStore.js`
- 每日任务：`DailyTaskService.js`、`DailyTaskRewardService.js`
- 商店：`ShopConfigService.js`、`ShopStateService.js`、`ShopPurchaseService.js`
- 星星宝箱：`StarChestService.js`、`StarChestRewardService.js`
- 微信能力：`WechatShareService.js`、`FriendGiftService.js`、`GameCircleButtonAdapter.js`
- 游戏圈福利：`GameCircleWelfareService.js`
- 埋点：`TelemetryService.js`

### utils

路径：`assets/scripts/utils`

通用工具与本地状态：

- `StrictStorage.js`：严格本地存储读写，不吞 JSON 错误。
- `BundleLoader.js`：分包/资源加载。
- `Logger.js`、`DebugFlags.js`：日志和调试开关。
- 各种 Store：`LevelProgressStore.js`、`PlayerResourceStore.js`、`InventoryStore.js`、`SelectedPowerupsStore.js`、`DailyTaskStore.js`、`SignInStore.js`、`StarChestStore.js`、`ShopStateStore.js`、`StaminaRecoveryStore.js`、`NewGiftStore.js`、`RouteConfigStore.js`、`GameCircleWelfareStore.js`、`LeaderboardStore.js`。

### ui

路径：`assets/scripts/ui`

独立 UI 控制器：

- `LoadingViewController.js`
- `StartGameViewController.js`
- `BackpackViewController.js`
- `InventoryViewController.js`
- `DailyTaskViewController.js`
- `ShopViewController.js`
- `BuyViewController.js`
- `RankingViewController.js`
- `GameCircleWelfareViewController.js`
- `TipsPresenter.js`
- `NetworkLoadingOverlay.js`
- `PopupPanelAnimator.js`

## 主要运行链路

### 启动到选关

1. Cocos 加载 `assets/scens/game.fire`。
2. 场景挂载 `GameBootstrap`。
3. `GameBootstrap.onLoad` 初始化中枢对象和业务状态。
4. `GameBootstrap.start` 调用启动加载流程。
5. 启动任务预加载 resources/ui/map 分包、选关预制体、浮岛地图配置与关卡配置，并检查好友体力领取。
6. 加载完成后进入选关页。

### 选关到开局

1. 选关页触发 `_onLevelSelectTap`。
2. 浮岛地图只允许点击 `levelId <= highestUnlockedLevel` 的关卡点。
3. 进入开局道具/体力检查流程。
4. `_loadLevelById` 调用 `levelManager.loadLevel(levelId)`。
5. `LevelManager` 使用 `LevelConfigLoader` 加载并校验 `levels/level_###.json`。
6. `gameManager.startLevel(levelConfig)` 生成运行时状态。
7. `levelRenderer.renderLevel(levelConfig, snapshot)` 渲染局内场景。

### 局内交互

1. `GameBootstrapGameplayInputMethods` 接收触摸。
2. 瞄准输入传给 `gameManager.beginAim` / `setAim` / `endAim`。
3. 发射触发 `gameManager.fireShot`。
4. `GameManager` 调用 systems 完成命中、消除、掉落、收集、胜负判断。
5. `GameBootstrap.update` 刷新 `GameManager.update(dt)`，再让 `LevelRenderer.refreshRuntime` 同步画面。
6. runtime event 驱动音效、震动、埋点、结果弹窗和奖励流程。

## 关卡配置

关卡文件位于 `assets/resources/config/levels/`，命名规则为 `level_###.json`。`LevelConfigLoader` 会校验：

- `schemaVersion`
- `coordinateSystem`
- `level.levelId` 与文件名匹配
- `level.code` 前缀
- 颜色集合、布局行、射击次数、目标分、下落间隔
- 特殊球/障碍球配置
- 关卡模式、初始下压空间和局内广告道具规则
- 通关奖励配置
- 罐子、目标、调参配置等

关卡配置缺字段或结构不符合预期时应直接报错，不应在调用侧补默认值。

## 微信相关

- `cloudfunctions/`：实际云函数源码。
- `build-templates/wechatgame/cloudfunctions/`：构建模板中的云函数。
- `open-data/`：微信开放数据域排行榜逻辑。
- `settings/wechatgame.json`：微信小游戏构建相关设置。

微信能力在运行时代码中主要通过 `WechatShareService`、`FriendGiftService`、`GameCircleButtonAdapter`、`AdService` 进入。

## 工具与校验

`package.json` 提供以下校验脚本：

- `npm run validate:stamina`
- `npm run validate:levels`
- `npm run validate:level-sync`
- `npm run validate:aim`
- `npm run validate:shots`
- `npm run validate:release`
- `npm run generate:floating-map`
- `npm run validate`

修改浮岛地图资源、容量表或 200 关地图规划后，运行 `npm run generate:floating-map` 重新生成 `assets/map/config/floating_map.json`。修改关卡、瞄准、射击、发布配置或体力相关逻辑后，优先运行对应校验。

## 修改建议

接手任务时建议顺序：

1. 先读本文件，确认模块边界。
2. 再读 `AGENTS.md`，确认 Fail-Fast 约束。
3. 使用 CodeGraph 查找真实调用链。
4. 只阅读和修改与任务直接相关的文件。
5. 不做无关重构。
6. 不添加兜底逻辑，除非任务明确要求。
