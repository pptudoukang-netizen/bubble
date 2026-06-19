# PROJECT_STRUCTURE.md

## 项目定位

本项目是 Cocos Creator 2.4.9 微信小游戏项目，核心玩法是泡泡龙关卡制闯关。主工程代码在 `assets/scripts`，本地首 10 关配置在 `assets/resources/config/levels`，11-1000 关远程包在 `remote-level-packs` 并通过微信云存储加载，微信云函数在 `cloudfunctions`，历史开放数据域资源在 `open-data`。

项目遵守 `AGENTS.md` 中的 Fail-Fast 严格模式：优先暴露错误，不通过默认值、静默返回、mock 或兜底分支掩盖问题。

## 根目录概览

- `assets/`：Cocos 资源、场景、脚本、预制体、图片、音频等主体内容。
- `assets/scens/game.fire`：主场景。
- `assets/scens/editor.fire`：关卡地图人工绘制编辑器场景，挂载 `MapEditorController`，用于在蜂窝棋盘上绘制 `layout` 与 `specialEntities` 并导出 JSON。
- `assets/scripts/`：运行时脚本主体。
- `assets/resources/`：Resources 分包资源，包含局内和选关预制体。
- `assets/map/`：地图分包资源，包含无限浮岛选关地图配置、浮岛预制体、地标预制体、传送阵和主角图片。
- `assets/ui/`：UI 分包资源，包含弹窗预制体与 UI 图片；`assets/ui/image/commone/` 存放被 `assets/ui/prefabs/` 下两个及以上预制体共同引用的图片，其余按界面分子目录（如 `win/`、`shop/`、`sign/`）。
- `assets/game/`：局内 HUD 图片分包（微信 `subpackage`），`GameView` 等预制体仍引用该分包内 sprite；进入局内前由 `BundleLoader.ensureGameplayBundleLoaded()` 加载。
- `assets/image/`：主场景图片资源，按引用范围分子目录：`common/`（选关 `LevelView` 与局内 `GameView` 共用）、`level_view/`（仅选关）、`icon/`（选关入口图标）。局内专用图片已迁至 `assets/game/`。
- `assets/resources/config/levels/`：本地内置关卡 JSON 配置，文件名形如 `level_001.json`；当前只内置 `level_001.json` 到 `level_010.json`。
- `assets/resources/config/level_manifest.json`：11-1000 关远程包清单，包含云环境、包范围、云存储 fileID、sha256、字节数与远程包格式。
- `remote-level-packs/`：待上传到微信云存储的远程关卡包，当前为 `levels_pack_011_100.json` 到 `levels_pack_901_1000.json`，采用 `compact-schema-v1` 压缩格式。
- `docs/LEVEL_1000_DESIGN.md`：1000 关长线关卡设计、特殊球投放节奏、图案化棋盘策略和生成规则。
- `cloudfunctions/`：微信云开发函数源码。
- `build-templates/wechatgame/`：微信小游戏构建模板与云函数模板；构建后由 `tools/wechat-minigame-loading-patch.js` 接入微信官方封面图插件 `MinigameLoading`，封面图使用 `assets/loading/loading_bg.jpg`。
- `build-templates/web-mobile/`、`build-templates/web-desktop/`：Web 构建模板，包含引擎启动页 `splash.css` 与 `loading_bg.jpg`（源图来自 `assets/loading/loading_bg.jpg`）。
- `packages/build-loading-splash/`：构建完成后同步启动页模板，并为 Web 产物注入 `splash.css` 引用。
- `packages/find-image-references/`：Cocos Creator 2.4 编辑器扩展。资源面板右键图片（若编辑器支持）或顶部菜单「扩展 -> 查找图片引用」（需先选中图片）可查找引用，输出所属自动图集，并将引用该图片的预制体、场景、动画与图集引用名称输出到控制台；对预制体/场景会额外打印具体节点路径。
- `tools/sync-loading-splash-template.js`：将 `assets/loading/loading_bg.jpg` 同步到 Web 构建模板目录。
- `open-data/`：历史微信开放数据域逻辑。当前世界排行榜由主域源码和云函数实现，不再依赖开放数据域读取好友云存储。
- `tools/`：校验、同步、构建修复、调试辅助脚本。
- `settings/`：Cocos Creator 项目设置。
- `package.json`：校验脚本入口。

## 运行入口

主入口是 `assets/scripts/bootstrap/GameBootstrap.js`。

`DynamicAtlasBootstrap.js` 是引擎插件脚本（`isPlugin: true`），在普通业务脚本之前执行，强制开启动态合图：`cc.macro.CLEANUP_IMAGE_CACHE = false` 且 `cc.dynamicAtlasManager.enabled = true`。微信小游戏默认会清 Image 缓存，必须在此阶段关闭清理后才能参与动态合图。

`GameBootstrap.js` 是 Cocos 组件声明文件，负责暴露 Inspector 属性，并把实际实现挂载到组件方法上。具体业务实现拆在多个 `GameBootstrap*Methods.js` 文件中：

- `GameBootstrapCompositionMethods.js`：`onLoad` 初始化中枢，创建 Store、Service、Manager、Audio、Tips、NetworkLoading 等；`GameManager`/`LevelRenderer` 延迟到 `_ensureGameplayKernel()`（进入局内时加载 `game` 分包并初始化）。
- `GameBootstrapStartupMethods.js`：启动加载流程；`onLoad` 末尾即调用 `_beginStartupBundlePrefetch()` 与 `start()` 并行预拉 `resources`/`map` 分包，再加载选关预制体并展示 LoadingView；选关页展示后立即后台预热 `ui` 分包，并继续后台执行好友体力领取与云档案同步。
- `GameBootstrapLazyModule.js` / `GameBootstrapLazyRegistry.js`：非首屏必需的 bootstrap 方法模块（签到/任务/商店/游戏圈/设置/广告/telemetry/背包等）通过 `GameBootstrapLazyModule` 在首次调用时再 `require` 对应模块；各 loader 必须使用 Cocos 可静态分析的字符串字面量路径，禁止运行时变量 `require(path)` 或对 UI Controller 做 getter 懒加载。
- `GameBootstrapGameplayInputMethods.js`：局内触摸输入、瞄准、发射、update 驱动。
- `GameBootstrapNewUserGuideMethods.js`：新账号首次进入的新手引导覆盖层，使用 `resources/image/finger.png` 指引快速开始、开局按钮和首次局内发射操作。
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

- `LevelSelectView.js`：选关页顶层 UI 渲染入口，负责顶部状态和入口按钮绑定（含 `quick_start_btn` 快速开始、`back_cur_level` 回到当前关卡位置），并调用浮岛地图渲染器。
- `LevelSelectFloatingMap.js`：按 `assets/map/config/floating_map.json` 渲染 1000 关无限上滚动浮岛地图；启动时仅预加载当前焦点关卡视口所需 island prefab，滚动时按需加载其余 prefab。

### core

路径：`assets/scripts/core`

- `GameManager.js`：玩法状态机和运行时核心。负责开局、瞄准、发射、技能、结算、胜负、分数、运行时事件、runtime snapshot。过关要求为星级达到 1 星且 `winConditions` 中所有收集目标完成；达成后进入 `won_surplus_shots_pending`（剩余发射球抛物线入缸，可选）、`won_settlement_pending`（入缸后 1 秒）并最终切到 `won` 触发 `WinView`。
- `GameManagerShotResolutionMethods.js`：发射命中后的消除、掉落、收集等结算扩展；`_resolveBoardClearedOutcome` / `_beginSurplusShotBonus` 处理清屏后的剩余球奖励。
- `AdRevivePolicy.js`：广告复活策略，统一复活补球、目标色选择和 LoseView 描述文案。
- `ProjectileMath.js`：弹道与几何计算。
- `StarRatingPolicy.js`：星级计算策略。

### systems

路径：`assets/scripts/systems`

玩法底层系统：

- `BubbleGrid.js`：棋盘格与格子状态。
- `MatchSystem.js`：同色匹配消除。
- `SupportSystem.js`：连通/悬空判断。
- `FallingMarbleSystem.js`：掉落球运动；`registerSurplusShotsFromOrigin` 负责清屏后炮台剩余球的随机抛物线入缸。
- `JarCollectorSystem.js`：底部罐子收集。
- `ShooterController.js`：射手和待发球；`drainRemainingShotBalls` 在剩余球奖励阶段排空炮台队列。
- `TrajectoryPredictor.js`：瞄准轨迹预测。
- `BaseSystem.js`：系统基类。

### render

路径：`assets/scripts/render`

渲染层只根据关卡配置和 runtime snapshot 同步 Cocos 节点：

- `LevelRenderer.js`：渲染入口、资源预加载、事件 handler、公共节点/资源逻辑。
- `LevelRendererSceneMethods.js`：棋盘、特殊球预制体（火焰瓶、分裂球、锁定球、钥匙）、钥匙解锁动画、分裂球生成抛物线飞入动画、HUD（含 `set_btn` 打开设置）、底部道具面板、弹道、掉落、罐子、胜负弹窗等具体渲染。
- `PrefabFactory.js`：预制体实例化辅助。
- `RenderNodeHelpers.js`：节点操作辅助。

### config

路径：`assets/scripts/config`

配置层。重点文件：

- `LevelManager.js`：按关卡 ID 生成 key，1-10 调用本地 `LevelConfigLoader`，11-1000 调用 `RemoteLevelPackLoader`，并缓存关卡配置；`preloadRemotePackAfterLevel(levelId)` 用于开局弹窗前在 10、100、200、300 等分包边界预下载下一段远程关卡包。
- `LevelConfigLoader.js`：本地关卡配置加载、校验、规范化，并向远程包 loader 暴露同一套规范化入口。这里大量使用 Fail-Fast 校验。
- `LevelPackManifest.js`：远程关卡包 manifest 的严格校验与包定位，并要求远程包声明 `compact-schema-v1` 格式。
- `LevelPackCompactCodec.js`：远程关卡包 `compact-schema-v1` 编解码器；生成器写入压缩格式，运行时和离线工具读取后先展开为完整关卡结构。
- `RemoteLevelPackLoader.js`：读取 manifest，使用 `wx.cloud.getTempFileURL` 获取远程包临时地址，再用 `wx.downloadFile` 下载到本地用户文件缓存，按 manifest 校验 `compact-schema-v1` 格式并展开，最后按单关复用 `LevelConfigLoader` 的规范化校验；同时提供按当前关卡预下载下一远程包的能力。
- `BoardLayout.js`：棋盘布局参数。
- `AimTuningProfiles.js`：瞄准调参配置。
- `DailyTaskConfig.js`、`DailySignInConfig.js`、`ShopGoodsConfig.js`、`ShopRulesConfig.js`、`StarChestConfig.js`、`GameCircleWelfareConfig.js` 等：业务静态配置。
- `RuntimeModeConfig.js`：运行模式配置。

### services

路径：`assets/scripts/services`

业务服务层，封装规则和平台能力：

- 广告：`AdService.js`、`WechatNativeTemplateAdAdapter.js`、`AdRewardCatalog.js`、`AdRewardQuotaStore.js`
- 每日任务：`DailyTaskService.js`、`DailyTaskRewardService.js`
- 商店：`ShopConfigService.js`、`ShopStateService.js`、`ShopPurchaseService.js`
- 星星宝箱：`StarChestService.js`、`StarChestRewardService.js`
- 微信能力：`WechatShareService.js`、`FriendGiftService.js`、`GameCircleButtonAdapter.js`、`WorldLeaderboardService.js`
- 玩家云端档案：`PlayerCloudProfileService.js` 通过 `playerProfile` 微信云函数同步本地玩家状态到云数据库 `player_profiles`
- 世界排行榜：`WorldLeaderboardService.js` 优先读取本地缓存的排行榜昵称头像；缓存不存在时在点击排行榜入口后通过 `wx.getUserProfile` 获取并写入 `bubble_world_leaderboard_profile_v1`，再调用 `worldLeaderboard` 微信云函数把本地最佳成绩汇总写入云数据库 `world_leaderboard` 并拉取榜单。
- 游戏圈福利：`GameCircleWelfareService.js`
- 埋点：`TelemetryService.js`

### utils

路径：`assets/scripts/utils`

通用工具与本地状态：

- `StrictStorage.js`：严格本地存储读写，不吞 JSON 错误。
- `BundleLoader.js`：分包/资源加载。
- `Logger.js`、`DebugFlags.js`：日志和调试开关。
- 各种 Store：`LevelProgressStore.js`、`PlayerResourceStore.js`、`InventoryStore.js`、`SelectedPowerupsStore.js`、`DailyTaskStore.js`、`SignInStore.js`、`StarChestStore.js`、`ShopStateStore.js`、`StaminaRecoveryStore.js`、`NewGiftStore.js`、`RouteConfigStore.js`、`GameCircleWelfareStore.js`、`LeaderboardStore.js`。
- `NewUserGuideStore.js`：记录新账号新手引导步骤，未完成引导时阻止签到弹窗自动弹出。

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

### editor

路径：`assets/scripts/editor`

- `MapEditorController.js`：`editor` 场景运行时脚本。绑定 `checkerboard`/`ball_layot`/`split_ball_layot`/`prop_layot`/`select_map` 与操作按钮；支持拖拽 `levelDataFolder` 或配置 `levelDataResourcePath` 加载已有 `level_XXX.json`，经虚拟滚动列表选关并重建棋盘，导出时合并回原始关卡字段。
- `MapEditorLevelCatalog.js`：扫描并加载关卡 JSON。`assets/resources/...` 使用 `loadResDir`；`assets` 根目录下其它文件夹（如 `assets/levels`）在编辑器预览中通过 `Editor.assetdb` 读写。
- `MapEditorLevelPicker.js`：有界虚拟 ScrollView 关卡选择弹层（顶部最小关、底部最大关）。
- `MapEditorBoardImport.js`：关卡 `layout`/`specialEntities` 导入为编辑器格子状态。

## 主要运行链路

### 启动到选关

1. Cocos 加载 `assets/scens/game.fire`。
2. 场景挂载 `GameBootstrap`。
3. `GameBootstrap.onLoad` 初始化中枢对象和业务状态，并立即启动 `_beginStartupBundlePrefetch()` 预拉 `resources`/`map` 分包。
4. `GameBootstrap.start` 调用启动加载流程。
5. 启动关键任务复用分包预拉结果并加载选关预制体；`game.json` 构建后写入 `preloadSubpackages`（`resources`、`map`）。微信构建后由 `tools/wechat-minigame-loading-patch.js` 接入官方封面图插件 `MinigameLoading`，在引擎初始化前展示 `images/loading_bg.jpg`，首场景加载或引擎启动后销毁封面。选关页展示后立即调用 `_scheduleDeferredUiBundleWarmup()` 后台加载 `ui` 分包，好友体力领取与云档案同步也在选关页展示后后台执行，失败时提示用户且不阻塞首屏。
6. 关键任务完成后进入选关页；选关页渲染后按 `startupPreloadLevelCount`（默认 1）后台预热首批关卡 JSON 配置。
7. 用户点击开局弹窗「开始」后，`_loadLevelById` → `_ensureGameplayKernel()` 才加载 `game` 分包并初始化 `GameManager`/`LevelRenderer`；`_hideLevelSelectView` 会释放浮岛 prefab、`map` 分包缓存，返回选关时再按需重新加载。

### 内存管理（P1）

- `LevelSelectFloatingMap.js`：浮岛滚动后按视口 ±2 个节点保留 prefab，其余 `cc.assetManager.releaseAsset`；离开选关页时 `releaseAllCachedMapPrefabs` + `invalidateAssetCache`。
- `RemoteLevelPackLoader.js`：远程 compact 包 JSON 只写入 `USER_DATA_PATH` 磁盘缓存，解析后展开为当前请求关卡所需的完整结构，并发下载仍通过 `_packTextPromises` 去重。
- `LevelRenderer.js`：`releaseLevelSpecificSpriteCache()` 在返回选关时释放关卡专属 sprite，保留球/罐/HUD 共用图。
- `BundleLoader.js`：`releaseNamedBundle(name)` 供离开选关时卸载 `map` 分包；选关页展示后会后台预热 `ui` 分包，弹窗 prefab 仍按需加载，关闭后节点隐藏（未 destroy）故不自动卸载 `ui` 分包。
- `GameplayBundleReleaseScheduler.js`：离开局内返回选关后，超过 `gameplayBundleIdleReleaseMs`（默认 30000）未再进入局内则释放 `game` 分包。
- `UiModalReleaseHelper.js`：除 `ShopView` 外，其余 UI 弹窗在 `_hide*` 时 destroy 节点并 `releaseAsset` prefab；`BuyView` 在关闭购买弹窗时释放。

### 选关到开局

1. 选关页触发 `_onLevelSelectTap`。
2. 浮岛地图只允许点击 `levelId <= highestUnlockedLevel` 的关卡点。
3. 进入开局道具/体力检查流程。
4. `_showStartGameView` 调用 `levelManager.loadLevel(levelId)` 读取当前关卡预览信息，并调用 `levelManager.preloadRemotePackAfterLevel(levelId)` 在 10、100、200、300 等分包边界预下载下一段远程关卡包。
5. `_loadLevelById` 调用 `levelManager.loadLevel(levelId)`。
6. `LevelManager` 对 1-10 使用 `LevelConfigLoader` 加载本地 `levels/level_###.json`；对 11-1000 使用 `RemoteLevelPackLoader` 按 manifest 下载云存储关卡包，再复用同一套校验。
7. `gameManager.startLevel(levelConfig)` 生成运行时状态。
8. `levelRenderer.renderLevel(levelConfig, snapshot)` 渲染局内场景。

### 局内交互

1. `GameBootstrapGameplayInputMethods` 接收触摸。
2. 瞄准输入传给 `gameManager.beginAim` / `setAim` / `endAim`。
3. 发射触发 `gameManager.fireShot`。
4. `GameManager` 调用 systems 完成命中、消除、掉落、收集、胜负判断。
5. 每次掉落、收集和计分完成后，`GameManager` 检查是否同时满足 1 星与 `winConditions` 中所有收集目标；满足后不再要求清屏，也不继续等待棋盘下压。
6. 达成目标且仍有 `remainingShots` 时进入 `won_surplus_shots_pending`：`ShooterController.drainRemainingShotBalls` 排空炮台队列，`FallingMarbleSystem.registerSurplusShotsFromOrigin` 从炮台随机抛物线入缸计分；全部入缸后进入 `won_settlement_pending`，停顿 1 秒再切到 `won`。无剩余发射球时直接进入 `won_settlement_pending`。
7. `GameBootstrap.update` 刷新 `GameManager.update(dt)`，再让 `LevelRenderer.refreshRuntime` 同步画面。
8. runtime event 驱动音效、震动、埋点、结果弹窗和奖励流程；`WinView` 仅在 `state === "won"` 时弹出。

### 新手引导

1. 新账号首次进入选关页时，`NewUserGuideStore` 进入 `quick_start` 步骤，`GameBootstrapNewUserGuideMethods` 在 `quick_start_btn` 上显示手指呼吸动画。
2. 点击快速开始后进入 `start_game` 步骤，开局准备弹窗渲染完成后在 `play_btn` 上显示手指呼吸动画。
3. 开局成功并渲染第一关后进入 `game_fire` 步骤，在游戏区域中间显示手指和弧形滑动轨迹，引导旋转炮台并完成一次发射。
4. 第一次真实发射成功后标记引导完成；引导未完成期间，签到界面不会自动弹出。

## 关卡配置

本地首 10 关文件位于 `assets/resources/config/levels/`，命名规则为 `level_###.json`。11-1000 关位于 `remote-level-packs/` 的 100 关分段包中，运行时由 `assets/resources/config/level_manifest.json` 定位微信云存储 fileID。远程包使用 `compact-schema-v1`：包头集中保存 `levelSchemaVersion`、`coordinateSystem`、`sharedDefaults`，单关移除说明字段并将 `level.specialEntities` 编码为短数组；`RemoteLevelPackLoader` 下载后必须先通过 `LevelPackCompactCodec` 展开为完整关卡结构，再交给 `LevelConfigLoader` 校验。`LevelConfigLoader` 会校验：

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

远程包上传规则：

- `remote-level-packs/levels_pack_011_100.json` 上传到云存储 `level-packs-compact/levels_pack_011_100.json`。
- 其余 compact 包同名上传到 `level-packs-compact/`。
- 当前 manifest 使用的云存储 File ID 前缀为 `cloud://cloud1-d7gqettx3e9249ca1.636c-cloud1-d7gqettx3e9249ca1-1428064608`。
- `level-packs-compact/` 是新版本 compact 静态关卡配置目录，必须在云存储权限/安全规则中允许客户端读取；否则 `wx.cloud.getTempFileURL` 会返回 `STORAGE_EXCEED_AUTHORITY`。
- 上传后云 fileID 必须与 `assets/resources/config/level_manifest.json` 中的 `packs[].fileID` 保持一致。
- 如果重新生成包导致 sha256、bytes 或 format 改变，必须同步提交新的 manifest。

## 微信相关

- `cloudfunctions/`：实际云函数源码。
- `cloudfunctions/playerProfile`：玩家信息云端存储函数，按当前微信 `OPENID` 读写 `player_profiles` 云数据库集合。
- `cloudfunctions/worldLeaderboard`：世界排行榜云函数，按当前微信 `OPENID` 写入并读取 `world_leaderboard` 云数据库集合。
- `build-templates/wechatgame/cloudfunctions/`：构建模板中的云函数。
- `tools/wechat-minigame-loading-patch.js`：微信官方封面图插件 `MinigameLoading` 构建后装配脚本，写入 `game.json` 插件声明、修补 `game.js`/`main.js` 启动与销毁逻辑，并复制 `images/loading_bg.jpg`。
- `open-data/`：历史微信开放数据域排行榜逻辑。当前世界排行榜不再依赖开放数据域。
- `settings/wechatgame.json`：微信小游戏构建相关设置。

微信能力在运行时代码中主要通过 `WechatShareService`、`FriendGiftService`、`GameCircleButtonAdapter`、`WorldLeaderboardService`、`AdService` 进入。

## 工具与校验

`package.json` 提供以下校验脚本：

- `npm run validate:stamina`
- `npm run validate:levels`
- `npm run validate:level-sync`
- `npm run validate:aim`
- `npm run validate:shots`
- `npm run validate:release`
- `npm run generate:levels1000`
- `npm run generate:floating-map`
- `npm run clean:wechat-cloudfunctions`
- `npm run validate`

微信构建前如果 `build/wechatgame/cloudfunctions` 残留导致 Cocos 报 `ENOTEMPTY`，先运行 `npm run clean:wechat-cloudfunctions` 清理构建产物云函数目录。
修改 1000 关生成策略后，运行 `npm run generate:levels1000` 重新生成本地首 10 关、根目录 `levels` 镜像、`remote-level-packs` 远程关卡包和 `assets/resources/config/level_manifest.json`。修改浮岛地图资源、容量表或 1000 关地图规划后，运行 `npm run generate:floating-map` 重新生成 `assets/map/config/floating_map.json`。修改关卡、瞄准、射击、发布配置或体力相关逻辑后，优先运行对应校验。

## 修改建议

接手任务时建议顺序：

1. 先读本文件，确认模块边界。
2. 再读 `AGENTS.md`，确认 Fail-Fast 约束。
3. 使用 CodeGraph 查找真实调用链。
4. 只阅读和修改与任务直接相关的文件。
5. 不做无关重构。
6. 不添加兜底逻辑，除非任务明确要求。
