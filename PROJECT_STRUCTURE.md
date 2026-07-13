# PROJECT_STRUCTURE.md

## 项目定位

本项目是 Cocos Creator 2.4.12 微信小游戏项目，核心玩法是泡泡龙关卡制闯关。主工程代码在 `assets/scripts`，本地首 10 关配置在 `assets/resources/config/levels`，11-1000 关远程包在 `remote-level-packs` 并通过微信云存储加载，微信云函数在 `cloudfunctions`，历史开放数据域资源在 `open-data`。

项目遵守 `AGENTS.md` 中的 Fail-Fast 严格模式：优先暴露错误，不通过默认值、静默返回、mock 或兜底分支掩盖问题。

## 根目录概览

- `assets/`：Cocos 资源、场景、脚本、预制体、图片、音频等主体内容。
- `assets/scens/game.fire`：主场景。
- `assets/scens/editor.fire`：关卡地图人工绘制编辑器场景，挂载 `MapEditorController`，用于在蜂窝棋盘上绘制 `layout` 与 `specialEntities` 并导出 JSON。
- `assets/scripts/`：首包运行时脚本主体，包含启动、选关、UI、服务、存储、共享配置和工具。
- `gameplay-src/`：局内玩法内核源码，不放在 `assets/` 下，避免 Cocos Creator 自动打入微信小游戏首包脚本；`tools/build-wechat-gameplay-code.js` 从该目录生成微信运行时的 `src/lazy-gameplay-code.js`，同时生成模拟器/非微信运行时使用的 `assets/resources/generated/lazy-gameplay-code.json`。
- `assets/resources/`：Resources 分包资源，包含局内和选关预制体。
- `assets/map/`：地图分包资源，包含无限浮岛选关地图配置、浮岛预制体、地标预制体、传送阵和主角图片。
- `assets/ui/`：UI 分包资源，包含弹窗预制体与 UI 图片；`assets/ui/image/commone/` 存放被 `assets/ui/prefabs/` 下两个及以上预制体共同引用的图片，其余按界面分子目录（如 `win/`、`shop/`、`sign/`）。
- `assets/game/`：局内 HUD 图片分包（微信 `subpackage`），`GameView` 等预制体仍引用该分包内 sprite；进入局内前由 `BundleLoader.ensureGameplayBundleLoaded()` 加载。
- `assets/animation/`：动画资源分包（微信 `subpackage`），当前包含局内固定精灵红/黄/绿三个动画 prefab；局内由 `LevelRenderer` 加载 `animation` bundle 后实例化。
- `assets/image/`：主场景图片资源，按引用范围分子目录：`common/`（选关 `LevelView` 与局内 `GameView` 共用）、`level_view/`（仅选关）、`icon/`（选关入口图标）。局内专用图片已迁至 `assets/game/`。
- `assets/resources/config/levels/`：本地内置关卡 JSON 配置，文件名形如 `level_001.json`；当前只内置 `level_001.json` 到 `level_010.json`。
- `assets/resources/config/level_manifest.json`：远程关卡 bootstrap manifest，只内置云环境、关卡边界和远程完整 manifest 的固定云存储 fileID。
- `remote-level-packs/`：待上传到微信云存储的远程关卡包和完整远程 manifest；当前包含 `level_manifest.json` 以及 `levels_pack_011_100.json` 到 `levels_pack_901_1000.json`，关卡包采用 `compact-schema-v1` 压缩格式。
- `docs/LEVEL_1000_DESIGN.md`：1000 关长线关卡设计、特殊球投放节奏、图案化棋盘策略和生成规则。
- `cloudfunctions/`：微信云开发函数源码。
- `build-templates/wechatgame/`：微信小游戏构建模板与云函数模板；构建后由 `packages/build-loading-splash` 自动调用 `tools/wechat-minigame-loading-patch.js` 接入微信官方封面图插件 `MinigameLoading`，封面图使用 `assets/loading/loading_bg.jpg`；随后自动调用 `tools/build-wechat-gameplay-code.js` 从 `gameplay-src` 生成 `src/lazy-gameplay-code.js`。
- `build-templates/web-mobile/`、`build-templates/web-desktop/`：Web 构建模板，包含引擎启动页 `splash.css` 与 `loading_bg.jpg`（源图来自 `assets/loading/loading_bg.jpg`）。
- `packages/build-loading-splash/`：构建完成后同步启动页模板；为 Web 产物注入 `splash.css` 引用；为微信小游戏产物修补 project config、排行榜/open-data、`MinigameLoading` 封面图，并从源码生成玩法代码延迟包。
- `packages/find-image-references/`：Cocos Creator 2.4 编辑器扩展。资源面板右键图片（若编辑器支持）或顶部菜单「扩展 -> 查找图片引用」（需先选中图片）可查找引用，输出所属自动图集，并将引用该图片的预制体、场景、动画与图集引用名称输出到控制台；对预制体/场景会额外打印具体节点路径。
- `tools/sync-loading-splash-template.js`：将 `assets/loading/loading_bg.jpg` 同步到 Web 构建模板目录。
- `tools/build-wechat-gameplay-code.js`：局内玩法源码打包工具；编辑器构建完成会由 `packages/build-loading-splash` 自动调用，也可用 `npm run build:wechat-gameplay-code` 手动补跑；输出微信脚本懒包和模拟器资源懒包。
- `open-data/`：历史微信开放数据域逻辑。当前世界排行榜由主域源码和云函数实现，不再依赖开放数据域读取好友云存储。
- `tools/`：校验、同步、构建修复、调试辅助脚本。
- `tools/first-100-level-design.js`：前 100 关权威设计规则；先按花形、水晶、雪花、星形、羽翼、皇冠六组 15～20 关主题生成整体轮廓，再校验视觉重心、左右重量、单一焦点和自然边缘，之后放置特殊球并填充聚类颜色；同时统一定义目标、发射数和每 10 关难度波形。
- `tools/rebuild-first-100-level-configs.js`：前 100 关定向重建入口；先同步 `LEVEL_CONFIG_TABLE_1_1000.csv` 前 100 行，再只重建本地 1-10、远程包 11-100 和对应 manifest 条目，不改写 101-1000 关远程包。运行命令为 `npm run generate:levels-first100`。
- `tools/clustered-level-layout.js`、`tools/rebuild-relaxed-campaign-level-configs.js`、`tools/redesign-first-100-clustered-levels.js`、`tools/redesign-levels-100-500-aesthetic.js`：1-1000 关颜色聚类与爽感校验规则；休闲解压版全量重建通过 `npm run redesign:relaxed-campaign` 同步 CSV、本地 1-10、远程 11-1000 compact 包和 manifest；前 100 关保留既有轮廓规则，100-500 关可通过 `npm run redesign:levels100-500` 重建，501-1000 关可通过 `npm run redesign:levels501-1000` 重建远程包布局、对称轮廓、色彩流动和 manifest 摘要。
- `settings/`：Cocos Creator 项目设置。
- `package.json`：校验脚本入口。

## 运行入口

主入口是 `assets/scripts/bootstrap/GameBootstrap.js`。

`DynamicAtlasBootstrap.js` 是引擎插件脚本（`isPlugin: true`），在普通业务脚本之前执行，强制开启动态合图：`cc.macro.CLEANUP_IMAGE_CACHE = false` 且 `cc.dynamicAtlasManager.enabled = true`。微信小游戏默认会清 Image 缓存，必须在此阶段关闭清理后才能参与动态合图。

`GameBootstrap.js` 是 Cocos 组件声明文件，负责暴露 Inspector 属性，并把实际实现挂载到组件方法上。具体业务实现拆在多个 `GameBootstrap*Methods.js` 文件中：

- `GameBootstrapCompositionMethods.js`：`onLoad` 初始化中枢，创建 Store、Service、Manager、Audio、Tips、NetworkLoading 等；`GameManager`/`LevelRenderer` 延迟到 `_ensureGameplayKernel()`（进入局内时加载 `game` 分包并初始化）。
- `GameBootstrapStartupMethods.js`：启动加载流程；`start()` 先展示场景内 LoadingView，再由 `_beginStartupBundlePrefetch()` 下载并加载 `resources`/`map` 分包，分包下载和 bundle 加载进度都会写入 LoadingView 进度条；随后加载选关预制体。选关页展示后立即后台预热 `ui` 分包，并继续后台执行好友体力领取与云档案同步。
- `GameBootstrapLazyModule.js` / `GameBootstrapLazyRegistry.js`：非首屏必需的 bootstrap 方法模块（签到/任务/商店/游戏圈/设置/广告/telemetry/背包等）通过 `GameBootstrapLazyModule` 在首次调用时再 `require` 对应模块；各 loader 必须使用 Cocos 可静态分析的字符串字面量路径，禁止运行时变量 `require(path)` 或对 UI Controller 做 getter 懒加载。
- `GameBootstrapGameplayInputMethods.js`：局内触摸输入、瞄准、发射、update 驱动。
- `GameBootstrapNewUserGuideMethods.js`：新账号首次进入的新手引导覆盖层，使用 `resources/image/finger.png` 指引快速开始、开局按钮和首次局内发射操作。
- `GameBootstrapLevelRuntimeMethods.js`：启动关卡、重开、终态判断，以及局内暂停编排；`GameView/pause_btn` 打开 `PauseView`，暂停期间停止玩法 update 与输入，继续恢复，重玩复用当前关卡重开链路，退出复用返回选关链路。
- `GameBootstrapLevelSelectFlowMethods.js`：选关页面、关卡进度、胜利记录、星级，并预加载 `map` 分包浮岛地图资源。
- `GameBootstrapRouteEditorFlowMethods.js`：加载关卡与路线编辑器流程。
- `GameBootstrapPowerupInventoryMethods.js`：背包、开局道具、局内技能球和广告补给。
- `GameBootstrapSpecialIntroduceFlowMethods.js`：局内首次说明弹窗编排（`IntroduceView` 特殊球说明、`GeniusTipsView` 固定精灵说明、`SartTipsView` 顶部空槽说明）；使用 `SpecialIntroduceStore` 持久化已读状态，展示期间暂停限时关计时。
- `GameBootstrapStatusResourceFlowMethods.js`：顶部资源、体力恢复、新手礼、状态文本。
- `GameBootstrapRankingShopChestFlowMethods.js`：排行榜、商店、购买、星星宝箱。
- `GameBootstrapDailyTaskFlowMethods.js`：每日任务和好友体力赠送。
- `GameBootstrapSignInAwardFlowMethods.js`：签到与奖励弹窗。
- `GameBootstrapGameCircleFlowMethods.js`：游戏圈福利与原生按钮适配。
- `GameBootstrapSettingsFlowMethods.js`：设置页和音频开关/音量。
- `GameBootstrapAdRewardMethods.js`：激励广告、广告奖励、频控。
- `GameBootstrapAudioMethods.js`：背景音乐、音效、震动。
- `GameBootstrapShareFlowMethods.js`：微信分享。
- `GameBootstrapRuntimeConfigMethods.js`：运行模式、视口、安全区、棋盘参数；Inspector 中的 `projectileSpeed`/`impactBounceSpeed`/`jarRimBounceSpeed`/`dropGravity`/`dropInitialSpeedY` 经 `_applyBoardTuningFromProperties` 写入 `BoardLayout`，进关前再次同步以支持运行时调参。
- `GameBootstrapLifecycleMethods.js`：生命周期和 resize 处理。

`GameBootstrapShared.js` 汇总所有依赖和常量，是 bootstrap 层的共享依赖入口。

## 核心模块分层

### bootstrap

路径：`assets/scripts/bootstrap`

应用编排层。它连接 UI、玩法内核、渲染、服务、存储、广告、微信能力和音频。修改业务流程时通常先从这里找到真实调用链。

- `LevelSelectView.js`：选关页顶层 UI 渲染入口，负责顶部状态和入口按钮绑定（含 `quick_start_btn` 快速开始、`back_cur_level` 回到当前关卡位置），并调用浮岛地图渲染器。
- `LevelSelectFloatingMap.js`：按 `assets/map/config/floating_map.json` 渲染 1000 关无限上滚动浮岛地图；启动时仅预加载当前焦点关卡视口所需 island prefab，滚动时按需加载其余 prefab。

### core

路径：`gameplay-src/core`

- `GameManager.js`：玩法状态机和运行时核心。负责开局、瞄准、发射、技能、结算、胜负、分数、运行时事件、runtime snapshot。过关要求为星级达到 1 星且棋盘全部球自然消除或掉落；`bonusObjectives` / `winConditions` 中的收集目标只决定本次过关奖励是否翻倍，不再触发胜利或强制全盘掉落。清屏后进入 `won_pending` 等待掉落球全部结算，再进入 `won_surplus_shots_pending`（剩余发射球抛物线入缸，可选）、`won_settlement_pending`（入缸后 1 秒）并最终切到 `won` 触发 `WinView`。
- `GameManagerShotResolutionMethods.js`：发射命中后的消除、掉落、收集等结算扩展；`_resolveBoardClearedOutcome` / `_beginSurplusShotBonus` 处理自然清屏后的星级校验、剩余球奖励与终局结算。
- `AdRevivePolicy.js`：广告复活策略，统一复活补球、目标色选择和 LoseView 描述文案。
- `ProjectileMath.js`：弹道与几何计算。
- `StarRatingPolicy.js`：星级计算策略。

### systems

路径：`gameplay-src/systems`

玩法底层系统：

- `BubbleGrid.js`：棋盘格与格子状态；几何坐标通过附着的 `BoardViewportSystem.offsetY` 计算，不再使用整数 `dropOffsetRows`。
- `BoardViewportSystem.js`：棋盘不超过 10 行时顶部贴 HUD 下沿；超过 10 行时开场和局内吸附结算后都匀速上移到 HUD 下方保留 10 行，移动期间锁定发射；逻辑第 0 行空槽 ≥6 时，结算后立即触发全盘崩塌判定。
- `MatchSystem.js`：同色匹配消除。
- `SupportSystem.js`：连通/悬空判断。
- `FairyAssistSystem.js`：管理 `GameView/geniuses` 六个固定协助精灵槽位；只要本次发射产生消除，就按匹配消除数量生成红/黄/绿精灵，未消除时移除最早两只；碰撞中心由 `LevelRenderer.syncFairyAssistCollisionCenters` 从槽位节点转换到棋盘坐标后再参与判定，并维护每精灵最多 7 次碰撞计数与光效层数 snapshot。
- `FallingMarbleSystem.js`：掉落球运动（默认重力 900）；`maxDynamicMarbles` 当前由 `FallingRulesDefaults.maxDynamicMarbles`（9999，试验值）统一控制，暂忽略关卡 `fallingRules.maxDynamicMarbles: 10`，一次注册的全部掉落球会立即进入物理模拟；固定精灵反弹、红黄绿倍率、绿色精灵单次一分为二；清屏后余球每 0.2s 连续抛射入缸（不等上一颗入缸），炮台每 0.2s 在 15°～165° 间按 15° 步进往返旋转。
- `JarCollectorSystem.js`：底部罐子收集。
- `ShooterController.js`：射手和待发球；`drainRemainingShotBalls` 在剩余球奖励阶段排空炮台队列。
- `TrajectoryPredictor.js`：瞄准轨迹预测。
- `BaseSystem.js`：系统基类。

### render

路径：`gameplay-src/render`；共享的节点工具 `RenderNodeHelpers.js` 仍保留在 `assets/scripts/render`，供首包 UI 与局内渲染共同使用。

渲染层只根据关卡配置和 runtime snapshot 同步 Cocos 节点：

- `LevelRenderer.js`：渲染入口、资源预加载、事件 handler、公共节点/资源逻辑。
- `LevelRendererSceneMethods.js`：场景渲染薄编排层，按域挂载下列子模块。
- `LevelRendererSceneShared.js`：场景渲染跨域公共节点 helper（`requireChildNode`、Label 写入等）。
- `LevelRendererSceneScaffoldMethods.js`：`GameView` 脚手架、背景/大陆/渐变层、开局倒计时与 HUD 底线同步。
- `LevelRendererSceneBoardMethods.js`：棋盘球池、掉落球、调试网格与棋盘格视觉状态。
- `LevelRendererSceneShooterMethods.js`：炮台、瞄准辅助线、彩虹选色、路线编辑器与飞行球视觉缓存。
- `LevelRendererSceneFxMethods.js`：钥匙/分裂/燃烧瓶/冰球等一次性动画、障碍锤提示、震屏与冲击反弹。
- `LevelRendererSceneHudMethods.js`：HUD 目标、星级进度、连击/分数飘字、定时器与底部道具栏；道具按钮由 `prefabs/game/PropsBtn` 动态实例化到 `GameView/BttomPanel/props_scroll/view/content`。
- `LevelRendererSceneJarMethods.js`：底部罐子、罐内掉落遮挡与碰撞遮罩。
- `LevelRendererScenePopupMethods.js`：胜/负/暂停/道具说明弹窗与结果浮层渲染（含 Sprite 代理分层）。
- `LevelRendererFairyMethods.js`：严格绑定 `GameView/geniuses/genius1...6`，从 `animation` 分包实例化三色精灵动画 prefab，保留飞入/替换/离场动画，并用同 prefab 的后置克隆表达碰撞层数。
- `BubbleShatterRenderer.js`：普通匹配球消除时的 Shader 碎裂渲染器；在棋盘节点回收前复制球的 SpriteFrame 与位置，以单球单 Sprite 的片元 Shader 生成中心块和八个放射碎片，不参与棋盘状态与掉落结算。
- `PrefabFactory.js`：预制体实例化辅助。
- `RenderNodeHelpers.js`：节点操作辅助。

### config

路径：`assets/scripts/config`

配置层。重点文件：

- `LevelManager.js`：按关卡 ID 生成 key，1-10 调用本地 `LevelConfigLoader`，11-1000 调用 `RemoteLevelPackLoader`，并缓存关卡配置；`preloadRemotePackAfterLevel(levelId)` 用于开局弹窗前在 10、100、200、300 等分包边界预下载下一段远程关卡包。
- `LevelConfigLoader.js`：本地关卡配置加载、校验、规范化，并向远程包 loader 暴露同一套规范化入口。这里大量使用 Fail-Fast 校验。
- `LevelColorPermutation.js`：普通关卡进入局内前对本次 `levelConfig` 拷贝执行颜色轮换；保持棋盘格局不变，同色球整体换成另一组颜色，不改写原始关卡缓存和收集目标字段。
- `LevelPackManifest.js`：远程关卡 bootstrap manifest、远程完整 manifest、包清单和包定位的严格校验，并要求远程包声明 `compact-schema-v1` 格式。
- `LevelPackCompactCodec.js`：远程关卡包 `compact-schema-v1` 编解码器；生成器写入压缩格式，运行时和离线工具读取后先展开为完整关卡结构。
- `RemoteLevelPackLoader.js`：先读取本地 bootstrap manifest，再使用 `wx.cloud.getTempFileURL` 下载远程完整 manifest；随后按远程 manifest 获取关卡包临时地址、下载到本地用户文件缓存，按 manifest 校验 `compact-schema-v1` 格式并展开，最后按单关复用 `LevelConfigLoader` 的规范化校验；同时提供按当前关卡预下载下一远程包的能力。
- `BoardLayout.js`：棋盘布局参数。
- `BoardViewportConfig.js`、`FairyAssistConfig.js`、`FallingRulesDefaults.js`、`JarScoreConfig.js`、`SpecialAnimationTiming.js`：局内玩法专用配置，源码位于 `gameplay-src/config`，随局内玩法延迟包加载。
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
- 玩家云端档案：`PlayerCloudProfileService.js` 通过 `playerProfile` 微信云函数同步本地玩家状态到云数据库 `player_profiles`，同步内容包含关卡进度、资源、背包、签到、商店、游戏圈福利与关卡尝试统计。本地写入经 `StrictStorage` 观察者合并上传（默认 5s debounce）；`Store.load()` 仅在 normalize 后数据变化时写回；选关页体力倒计时 ticker 只读内存状态，仅在自然恢复体力时写 storage；云端拉取后刷新选关 UI 在 `suspendWriteObserver` 内执行以避免冗余上传。
- 世界排行榜：玩家普通关卡过关后，`WorldLeaderboardService.js` 立即用本地最佳成绩和已过关数调用 `worldLeaderboard` 微信云函数写入云数据库 `world_leaderboard`。未授权昵称头像时数据库中的 `nickname` 与 `avatarUrl` 保持空字符串；用户后续授权后，排行榜入口会保存 `bubble_world_leaderboard_profile_v1` 并再次上报覆盖云端资料。排行榜只拉取前 100 名；展示时空头像使用默认头像，空昵称显示“微信用户”。
- 游戏圈福利：`GameCircleWelfareService.js`
- 埋点：`TelemetryService.js`

### utils

路径：`assets/scripts/utils`

通用工具与本地状态：

- `StrictStorage.js`：严格本地存储读写，不吞 JSON 错误。
- `BundleLoader.js`：分包/资源加载。
- `Logger.js`、`DebugFlags.js`：日志和调试开关。
- 各种 Store：`LevelProgressStore.js`、`LevelAttemptStatsStore.js`、`PlayerResourceStore.js`、`InventoryStore.js`、`SelectedPowerupsStore.js`、`DailyTaskStore.js`、`SignInStore.js`、`StarChestStore.js`、`ShopStateStore.js`、`StaminaRecoveryStore.js`、`NewGiftStore.js`、`RouteConfigStore.js`、`GameCircleWelfareStore.js`、`LeaderboardStore.js`。
- `NewUserGuideStore.js`：记录新账号新手引导步骤，未完成引导时阻止签到弹窗自动弹出。

### ui

路径：`assets/scripts/ui`

独立 UI 控制器：

- `LoadingViewController.js`
- `StartGameViewController.js`
- `PropDescriptionViewController.js`：局内道具说明弹窗；从当前关卡配置筛选特殊球，并固定列出全部六种局内道具，图标按宽 80 等比渲染，列表 Sprite 使用代理分层。
- `BackpackViewController.js`
- `InventoryViewController.js`
- `DailyTaskViewController.js`
- `ShopViewController.js`
- `BuyViewController.js`
- `RankingViewController.js`
- `GameCircleWelfareViewController.js`
- `GeniusTipsViewController.js`：固定精灵协助首次说明弹窗。
- `SartTipsViewController.js`：顶部空槽首次说明弹窗；克隆 `star` 节点到棋盘空槽位置并播放透明度呼吸动画，点击任意位置关闭。
- `IntroduceViewController.js`：特殊球/目标首次说明弹窗。
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
3. `GameBootstrap.onLoad` 初始化中枢对象和业务状态，不再提前预拉 `resources`/`map` 分包。
4. `GameBootstrap.start` 调用启动加载流程，先展示场景内 LoadingView。
5. 启动关键任务在 LoadingView 显示后调用 `_beginStartupBundlePrefetch()` 下载并加载 `resources`/`map` 分包，分包下载和 bundle 加载进度占启动进度条前段；`game.json` 构建后不再写入 `resources`、`map` 的 `preloadSubpackages`。微信构建后由 `packages/build-loading-splash` 自动调用 `tools/wechat-minigame-loading-patch.js` 接入官方封面图插件 `MinigameLoading`，在引擎初始化前展示 `images/loading_bg.jpg`，首场景加载或引擎启动后销毁封面；随后自动调用 `tools/build-wechat-gameplay-code.js` 从 `gameplay-src` 生成 `src/lazy-gameplay-code.js` 和 `assets/resources/generated/lazy-gameplay-code.json`，并由 `BundleLoader.ensureGameplayBundleLoaded()` 在进入局内前加载。选关页展示后立即调用 `_scheduleDeferredUiBundleWarmup()` 后台加载 `ui` 分包，好友体力领取与云档案同步也在选关页展示后后台执行，失败时提示用户且不阻塞首屏。
6. 关键任务完成后进入选关页；选关页渲染后按 `startupPreloadLevelCount`（默认 1）后台预热首批关卡 JSON 配置。
7. 用户点击开局弹窗「开始」后，`_loadLevelById` → `_ensureGameplayKernel()` 才加载 `game` 分包并初始化 `GameManager`/`LevelRenderer`；`_hideLevelSelectView` 会释放浮岛 prefab、`map` 分包缓存，返回选关时再按需重新加载。

### 内存管理（P1）

- `LevelSelectFloatingMap.js`：浮岛滚动后按视口 ±2 个节点保留 prefab，其余 `cc.assetManager.releaseAsset`；离开选关页时 `releaseAllCachedMapPrefabs` + `invalidateAssetCache`。
- `RemoteLevelPackLoader.js`：远程完整 manifest 每次进程内首次加载时从云存储读取；远程 compact 包 JSON 只写入 `USER_DATA_PATH` 磁盘缓存，缓存路径包含远程 manifest `version` 和包 sha256，解析后展开为当前请求关卡所需的完整结构，并发下载仍通过 `_packTextPromises` 去重。
- `LevelRenderer.js`：`releaseLevelSpecificSpriteCache()` 在返回选关时释放关卡专属 sprite，只保留跨关必需的 HUD、底部道具、评论动画等小型共用图；关卡颜色球、罐子、特殊球、胜利瓶子按当前关卡和 runtime snapshot 精确预加载。
- `BundleLoader.js`：`releaseNamedBundle(name)` 卸载分包前先调用 bundle `releaseAll()` 释放已加载资产；离开选关时卸载 `map` 分包；选关页展示后会后台预热 `ui` 分包，弹窗 prefab 仍按需加载，关闭后节点隐藏（未 destroy）故不自动卸载 `ui` 分包。
- `GameplayBundleReleaseScheduler.js`：离开局内返回选关后，超过 `gameplayBundleIdleReleaseMs`（默认 10000）未再进入局内则释放 `game` 与局内动画 `animation` 分包，并清理 `LevelRenderer` 持有的 prefab / sprite / animation 引用。
- `UiModalReleaseHelper.js`：除 `ShopView` 外，其余 UI 弹窗在 `_hide*` 时 destroy 节点并 `releaseAsset` prefab；`BuyView` 在关闭购买弹窗时释放。

### 选关到开局

1. 选关页触发 `_onLevelSelectTap`。
2. 浮岛地图只允许点击 `levelId <= highestUnlockedLevel` 的关卡点。
3. 进入开局道具/体力检查流程。
4. `_showStartGameView` 调用 `levelManager.loadLevel(levelId)` 读取当前关卡预览信息，并调用 `levelManager.preloadRemotePackAfterLevel(levelId)` 在 10、100、200、300 等分包边界预下载下一段远程关卡包。
5. `_loadLevelById` 调用 `levelManager.loadLevel(levelId)`。
6. `LevelManager` 对 1-10 使用 `LevelConfigLoader` 加载本地 `levels/level_###.json`；对 11-1000 使用 `RemoteLevelPackLoader` 先下载远程完整 manifest，再按 manifest 下载云存储关卡包并复用同一套校验。
7. `_ensureGameplayKernel()` 调用 `BundleLoader.ensureGameplayBundleLoaded()`；微信构建会先加载 `game` 分包和 `src/lazy-gameplay-code.js`，模拟器/非微信运行时会从 `resources/generated/lazy-gameplay-code` 加载同一份生成代码，再通过 `BundleLoader.requireGameplayModule("GameManager")` 与 `BundleLoader.requireGameplayModule("LevelRenderer")` 初始化局内内核。
8. `gameManager.startLevel(levelConfig)` 生成运行时状态。
9. `levelRenderer.renderLevel(levelConfig, snapshot)` 渲染局内场景。
10. 隐藏选关页后保持 `isRestarting` 门控，`levelRenderer.playGameEntryCountdown()` 依次播放 3、2、1、GO；动画结束才恢复玩法 update、触摸和局内按钮，并继续特殊球介绍或新手引导。

### 局内交互

1. `GameBootstrapGameplayInputMethods` 接收触摸。
2. `GameView/BttomPanel/directions_btn` 打开 `PropDescriptionView`；弹窗展示期间暂停玩法 update 与输入，关闭后恢复。
3. 瞄准输入传给 `gameManager.beginAim` / `setAim` / `endAim`。
4. 发射触发 `gameManager.fireShot`。
5. `GameManager` 调用 systems 完成命中、消除、掉落、收集、胜负判断。
6. 匹配消除球在原位置碎裂，只有 `SupportSystem` 判定的悬空球进入 `FallingMarbleSystem`；只要本次发射产生消除，不管是否产生悬空掉落球，都会由 `FairyAssistSystem` 生成固定精灵，未消除时按分数加成等级从高到低离场两只（同等级时更早入场的先离场）。
7. 坠落球碰撞固定精灵后累加倍率并反弹；普通球首次碰撞绿色精灵时由两个子球替换，两个子球分别落缸计分。
8. 棋盘全部球通过正常消除或悬空掉落清空后，`GameManager` 先等待所有掉落球、分裂生成和燃烧瓶结算结束，再检查最终分数是否达到 1 星；达到则继续胜利结算，未达到则失败。`bonusObjectives` / `winConditions` 中的收集目标不参与通关判定，只在胜利奖励发放时决定奖励是否翻倍。
9. 棋盘剩余球全部入缸后，若仍有 `remainingShots` 则进入 `won_surplus_shots_pending`：`ShooterController.drainRemainingShotBalls` 排空炮台队列，`FallingMarbleSystem.registerSurplusShotsFromOrigin` 每 0.2s 连续抛射、炮台每 0.2s 在 15°～165° 间旋转；全部入缸后进入 `won_settlement_pending`，停顿 1 秒再切到 `won`。无剩余发射球时直接进入 `won_settlement_pending`。
10. `GameBootstrap.update` 刷新 `GameManager.update(dt)`，再让 `LevelRenderer.refreshRuntime` 同步画面。
11. runtime event 驱动音效、震动、埋点、结果弹窗和奖励流程；`WinView` 仅在 `state === "won"` 时弹出。

### 新手引导

1. 新账号首次进入选关页时，`NewUserGuideStore` 进入 `quick_start` 步骤，`GameBootstrapNewUserGuideMethods` 在 `quick_start_btn` 上显示手指呼吸动画。
2. 点击快速开始后进入 `start_game` 步骤，开局准备弹窗渲染完成后在 `play_btn` 上显示手指呼吸动画。
3. 开局成功并渲染第一关后进入 `game_fire` 步骤，在游戏区域中间显示手指和弧形滑动轨迹，引导旋转炮台并完成一次发射。
4. 第一次真实发射成功后标记引导完成；引导未完成期间，签到界面不会自动弹出。

## 关卡配置

本地首 10 关文件位于 `assets/resources/config/levels/`，命名规则为 `level_###.json`。11-1000 关位于 `remote-level-packs/` 的 100 关分段包中。本地客户端只内置 bootstrap manifest，运行时先从云存储固定路径拉取远程完整 manifest，再由远程 manifest 定位各关卡包 fileID、sha256、bytes 与格式。远程包使用 `compact-schema-v1`：包头集中保存 `levelSchemaVersion`、`coordinateSystem`、`sharedDefaults`，单关移除说明字段并将 `level.specialEntities` 编码为短数组；`RemoteLevelPackLoader` 下载后必须先通过 `LevelPackCompactCodec` 展开为完整关卡结构，再交给 `LevelConfigLoader` 校验。`LevelConfigLoader` 会校验：

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

- `remote-level-packs/level_manifest.json` 上传到云存储 `level-packs-compact/level_manifest.json`，这是新客户端运行时拉取的完整远程 manifest。
- `remote-level-packs/levels_pack_011_100.json` 上传到云存储 `level-packs-compact/levels_pack_011_100.json`。
- 其余 compact 包同名上传到 `level-packs-compact/`。
- 当前 manifest 使用的云存储 File ID 前缀为 `cloud://cloud1-d7gqettx3e9249ca1.636c-cloud1-d7gqettx3e9249ca1-1428064608`。
- `level-packs-compact/` 是新版本 compact 静态关卡配置目录，必须在云存储权限/安全规则中允许客户端读取；否则 `wx.cloud.getTempFileURL` 会返回 `STORAGE_EXCEED_AUTHORITY`。
- 上传后云 fileID 必须与 `remote-level-packs/level_manifest.json` 中的 `packs[].fileID` 保持一致；本地 `assets/resources/config/level_manifest.json` 只需要保持 `remoteManifest.fileID` 指向固定远程 manifest 路径。
- 如果重新生成包导致 sha256、bytes 或 format 改变，必须同步更新并上传 `remote-level-packs/level_manifest.json`。在远程 manifest fileID 固定不变的前提下，云端关卡包和远程 manifest 可以版本化热更新，不需要仅因包 sha256/bytes 改变而重建客户端。

## 微信相关

- `cloudfunctions/`：实际云函数源码。
- `cloudfunctions/playerProfile`：玩家信息云端存储函数，按当前微信 `OPENID` 读写 `player_profiles` 云数据库集合。
- `cloudfunctions/worldLeaderboard`：世界排行榜云函数，按当前微信 `OPENID` 写入并读取 `world_leaderboard` 云数据库集合。
- `build-templates/wechatgame/cloudfunctions/`：构建模板中的云函数。
- `tools/wechat-minigame-loading-patch.js`：微信官方封面图插件 `MinigameLoading` 构建后装配脚本，写入 `game.json` 插件声明、修补 `game.js`/`main.js` 启动与销毁逻辑，并复制 `images/loading_bg.jpg`。
- `tools/build-wechat-gameplay-code.js`：微信小游戏局内玩法源码打包脚本；从 `gameplay-src` 生成 `src/lazy-gameplay-code.js`，`game.js` 中的 `GameGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_PATH__` 是运行时加载该脚本的唯一开关。
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
- `npm run validate:fairy-gameplay`
- `npm run validate:release`
- `npm run generate:levels1000`
- `npm run generate:levels-first100`
- `npm run redesign:relaxed-campaign`
- `npm run generate:floating-map`
- `npm run clean:wechat-cloudfunctions`
- `npm run build:wechat-gameplay-code`
- `npm run validate`

微信构建前如果 `build/wechatgame/cloudfunctions` 残留导致 Cocos 报 `ENOTEMPTY`，先运行 `npm run clean:wechat-cloudfunctions` 清理构建产物云函数目录。
修改休闲解压版 1000 关设计策略后，优先运行 `npm run redesign:relaxed-campaign` 重新同步 `LEVEL_CONFIG_TABLE_1_1000.csv`、本地首 10 关、根目录 `levels` 镜像、`remote-level-packs` 远程 compact 关卡包、`remote-level-packs/level_manifest.json` 和本地 bootstrap manifest；仅改底层生成器且不需要重写 CSV 时再运行 `npm run generate:levels1000`。修改浮岛地图资源、容量表或 1000 关地图规划后，运行 `npm run generate:floating-map` 重新生成 `assets/map/config/floating_map.json`。修改关卡、瞄准、射击、发布配置或体力相关逻辑后，优先运行对应校验。

## 修改建议

接手任务时建议顺序：

1. 先读本文件，确认模块边界。
2. 再读 `AGENTS.md`，确认 Fail-Fast 约束。
3. 使用 CodeGraph 查找真实调用链。
4. 只阅读和修改与任务直接相关的文件。
5. 不做无关重构。
6. 不添加兜底逻辑，除非任务明确要求。
