# PROJECT_STRUCTURE.md

## 项目定位

本项目是 Cocos Creator 2.4.12 微信小游戏项目，核心玩法是泡泡龙关卡制闯关。主工程代码在 `assets/scripts`，本地首 10 关配置在 `assets/map/config/levels`，11-1000 关远程包在 `remote-level-packs` 并通过微信云存储加载，微信云函数在 `cloudfunctions`，历史开放数据域资源在 `open-data`。

项目遵守 `AGENTS.md` 中的 Fail-Fast 严格模式：优先暴露错误，不通过默认值、静默返回、mock 或兜底分支掩盖问题。

## 根目录概览

- `assets/`：Cocos 资源、场景、脚本、预制体、图片、音频等主体内容。
- `assets/scens/boot.fire`：启动场景，只保留 Camera、Canvas、LoadingView 静态节点和挂在 Canvas 上的首包 `BootLoader` 启动组件，不挂载任何 `core` 业务脚本；这是构建设置中的首场景。
- `assets/scens/game.fire`：完整业务主场景，保留 `GameBootstrap` 及其全部 Inspector 配置；`core` 分包执行完成后才由 `BootLoader` 预加载并切入。
- `assets/game/scens/editor.fire`：位于 `game` Asset Bundle 的关卡底图编辑场景，挂载 `MapEditorController`；只允许由 `LevelView/test_btn` 加载并切入，复用 `game` 分包内的球与道具图片。
- `assets/boot/BootLoader.js`：首包内的启动组件，仅由 `boot.fire/Canvas` 挂载；`boot.fire` 首帧绘制后下载并加载 `core`，确认业务代码执行标记后预加载并切换到 `game.fire`。它不是全局插件，因此模拟器直接预览其他场景时不会误触发；该文件禁止同步 `require` 业务模块。
- `assets/scripts/`：`core` Asset Bundle（微信 `subpackage`），包含完整业务启动、选关、UI、服务、存储、共享配置和工具；不再进入内置 `main` 分包。
- `gameplay-src/`：局内玩法内核源码，不直接交给 Cocos 编译；`tools/build-wechat-gameplay-code.js` 将该目录合并成唯一生成资产 `assets/game/generated/lazy-gameplay-code.js`，由 `game` Asset Bundle 编入微信 `subpackages/game/game.js`。
- `assets/map/`：地图分包资源，包含本地关卡配置、远程关卡 bootstrap manifest、提示文案、`LevelView`、选关大背景、`image/level_view/` 选关专用图片、顶部金币/体力图标、无限浮岛选关地图配置、浮岛预制体、地标预制体、传送阵、主角图片，以及 `image/trapped_spirit/{spiritId}` 七名救援角色地图小图；救援关 `landmark1/spirit` 按浮岛节点的 `rescueSpiritId` 动态换图，选关销毁后这些资源可随 `map` 一起释放。
- `assets/ui/`：局内与选关共用、按会话生命周期持有的公共 UI 分包，包含弹窗预制体与 UI 图片；返回选关后的 `game`/`animation` 空闲释放不得清理 `ui` prefab 或 `ui/` SpriteFrame。`image/props/` 保存 UI 生命周期独立使用的金币、体力和道具图副本，`image/preview_balls/` 保存选关目标与道具说明使用的球图标，避免返回选关后 `game` bundle 延迟释放造成黑块或失效 SpriteFrame；`image/commone/` 存放多个弹窗共用图片，`fnt/` 保存 UI 自有字体。
- `assets/game/`：局内资源、关卡底图编辑场景与玩法代码分包（微信 `subpackage`），包含 `GameView`、`scens/editor.fire`、球/罐子/道具图片、`trapped_spirit/{spiritId}` 七名角色的局内被困形象、编辑器蜂窝底图、局内 HUD 图片与字体、射手 hero 动画、局内 prefab、Shader effect 与生成的 `generated/lazy-gameplay-code.js`；进入局内或关卡编辑器前由 `BundleLoader.ensureGameplayBundleLoaded()` 加载并校验玩法代码标记。
- `assets/audio/`：音频资源分包（微信 `subpackage`），全部 BGM/SFX 位于 `assets/audio/sound/`；选关与局内 BGM 在业务启动阶段并行预加载，SFX 仍在首次播放时按需加载。
- `assets/animation/`：显式命名为 `animation` 的动画资源分包（微信 `subpackage`），包含爆炸、烟花和局内固定精灵红/黄/绿动画 prefab；七名出战精灵的射手待机/递球动画位于 `assets/game/animation/{spiritId}_idle|pao.anim`，禁止 `game` prefab 通过 UUID 反向依赖该分包。
- `assets/spirit_system/`：显式命名为 `spirit_system` 的精灵系统资源分包（微信 `subpackage`），保存精灵大厅背景、角色立绘、商店资源、UI 图集、`prefabs/SpiritHallView.prefab`、`prefabs/SpiritShopView.prefab` 与多界面共用的 `prefabs/SpiritSystemTabBar.prefab`；商店面板与商品主体 Sprite 独占 `image/shop/AutoAtlas`，大厅/商店共用的控件、底栏及七名精灵碎片图标统一进入 `image/tabbar/AutoAtlas`，进阶按钮和碎片商品复用同一套碎片 SpriteFrame；大厅与商店采用 720×1280 设计分辨率和 Sprite 代理分层，通过挂载组件动态实例化共享 TabBar，重复卡片和 TabBar 的源 Sprite 仅保留逻辑、布局及点击职责，独立代理层集中渲染；大厅未拥有角色的头像代理使用内置 `2d-gray-sprite` 材质置灰，解锁后恢复 `2d-sprite`，但升级、进阶、出战按钮仍保留点击以展示救援解锁提示；大厅由 `SpiritHallScreenAdapter`、商店由 `SpiritShopScreenAdapter` 分别负责安全区、等比内容缩放、长屏分区延展、源/代理/文本层同步和背景 cover。
- `assets/image/`：非 map/game/ui 分包资源；选关专用图片已归入 `assets/map/`，局内专用图片已归入 `assets/game/`，弹窗专用图片已归入 `assets/ui/`。
- `assets/map/config/levels/`：本地内置关卡 JSON 配置，文件名形如 `level_001.json`；当前只内置 `level_001.json` 到 `level_010.json`。
- `assets/map/config/levels/level_board_occlusion_test.json`：独立遮挡玩法测试关；隐藏测试模式中的“遮挡”按钮加载该配置。该普通`shot_limited`测试关的云朵和树叶均按发射次数清除，同时覆盖动态位置轮换和除雪剂主动清除；秒数倒计时只用于正式`timed_infinite_shots`限时关。
- `assets/map/config/level_manifest.json`：远程关卡 bootstrap manifest，只内置云环境、关卡边界和远程完整 manifest 的固定云存储 fileID。
- `remote-level-packs/`：待上传到微信云存储的远程关卡包和完整远程 manifest；当前包含 `level_manifest.json` 以及 `levels_pack_011_100.json` 到 `levels_pack_901_1000.json`，关卡包采用 `compact-schema-v2` 压缩格式。
- `docs/LEVEL_1000_DESIGN.md`：1000 关长线关卡设计、特殊球投放节奏、图案化棋盘策略和生成规则。
- `docs/TRAPPED_SPRITE_RESCUE_GAMEPLAY_DESIGN.md`：以被困精灵为唯一中心支撑点的开放顶部旋转棋盘规则、配置合同、受力公式、结算时序、实现状态和验收标准。
- `cloudfunctions/`：微信云开发函数源码。
- `build-templates/wechatgame/`：微信小游戏构建模板与云函数模板；构建后由 `packages/build-loading-splash` 自动调用 `tools/wechat-minigame-loading-patch.js` 接入微信官方封面图插件 `MinigameLoading`，封面图使用 `assets/loading/loading_bg.jpg`；随后校验完整业务脚本只存在于 `subpackages/core/game.js`、玩法生成资产只存在于 `subpackages/game/game.js`，并移除旧版 `main.js` 同步加载块。
- `build-templates/web-mobile/`、`build-templates/web-desktop/`：Web 构建模板，包含引擎启动页 `splash.css` 与 `loading_bg.jpg`（源图来自 `assets/loading/loading_bg.jpg`）。
- `packages/build-loading-splash/`：构建完成后同步启动页模板；为 Web 产物注入 `splash.css` 引用；为微信小游戏产物修补 project config、排行榜/open-data、`MinigameLoading` 封面图，并严格校验 `boot.fire` 首场景、首包 `BootLoader`、`core` 业务代码分包、玩法代码所在分包及源码哈希。
- `packages/find-image-references/`：Cocos Creator 2.4 编辑器扩展。资源面板右键图片（若编辑器支持）或顶部菜单「扩展 -> 查找图片引用」（需先选中图片）可查找引用，输出所属自动图集，并将引用该图片的预制体、场景、动画与图集引用名称输出到控制台；对预制体/场景会额外打印具体节点路径。
- `tools/sync-loading-splash-template.js`：将 `assets/loading/loading_bg.jpg` 同步到 Web 构建模板目录。
- `tools/build-wechat-gameplay-code.js`：局内玩法源码打包工具；`npm run build:wechat-gameplay-code` 在 Cocos 构建前更新唯一 JS 生成资产，编辑器构建完成后由 `packages/build-loading-splash` 校验 `game` 分包中的源码哈希，禁止玩法代码进入主包或以 JSON 再发布一份。
- `tools/generate-spirit-hall-prefab.js`：精灵大厅与共享底部导航预制体的确定性生成、校验入口；严格校验 `spirit_system` 内全部依赖图片和屏幕适配组件的 UUID，生成含 `SafeAreaRoot`、等比 `DesignContent`、背景 cover、四条真实 `cc.ProgressBar`、`BottomNavigationMount`、进阶按钮动态碎片图标与 Sprite 代理分层的 `SpiritHallView.prefab`，同时生成自带逻辑层、代理渲染层和五个 Tab Button、且 SpriteFrame 全部来自 `image/tabbar/` 独立图集的 `SpiritSystemTabBar.prefab`；`--check` 会检查两份生成物、代理/源 Sprite 一一对应、图集边界和序列化引用完整性。
- `tools/generate-spirit-shop-prefab.js` / `tools/validate-spirit-shop-screen-adapter.js` / `tools/validate-spirit-shop-integration.js`：精灵商店 720×1280 Prefab 的确定性生成、全屏适配和完整业务回归入口；商店面板、商品和槽位 SpriteFrame 使用 `assets/spirit_system/image/shop/`，返回、金币、宝石及七名精灵碎片图标复用 `image/tabbar/` 共享图集，采用源节点/代理 Sprite 分层；`SpiritShopScreenAdapter` 覆盖安全区、窄屏等比缩放、19.5:9/20:9 长屏分区延展、文本层同步、底栏贴合屏幕底边和背景 cover；`BottomNavigationMount` 通过严格校验的 `SpiritSystemTabBarMount` 组件实例化只使用 `image/tabbar/` 独立图集的公用 `SpiritSystemTabBar.prefab`，不会把参考图 `assets/spirit_system/shop.png` 作为整图依赖；集成校验覆盖图集隔离、共享资源边界、资源版本迁移、每日碎片轮换、刷新、购买、库存、Tab 路由和云档案合同。
- `tools/validate-spirit-hall-screen-adapter.js`：精灵大厅屏幕适配回归校验；覆盖基准 16:9、19.5:9 长屏、带刘海压缩安全区和 20:9 超长屏，验证内容等比缩放、顶部/底部分区延展、代理节点同步与背景 cover。
- `tools/sync-boot-scene.js`：从 `game.fire` 的 LoadingView 静态节点同步生成不含 `GameBootstrap` 的 `boot.fire`，并确定性地把唯一 `BootLoader` 组件挂到 boot Canvas；启动画面节点调整后运行 `npm run sync:boot-scene`。
- `tools/validate-boot-startup.js` / `tools/verify-wechat-core-bundle.js`：分别校验源工程启动边界，以及 Cocos 构建后 `core`/`main` 脚本归属。
- `tools/validate-background-music.js`：校验选关/局内 BGM 启动预加载、同音轨请求去重、过期切换隔离，以及选关、普通关卡和随机挑战等待背景音乐切换的调用合同；运行 `npm run validate:bgm`。
- `tools/validate-bundle-boundaries.js`：校验 bundle 显式名称、全项目 UUID 唯一性、`map`/`game`/`ui` 序列化资源零跨包依赖，以及动态路径必须显式使用 `game/`、`map/` 或 `ui/` 前缀并能解析到真实资源；运行 `npm run validate:bundle-boundaries`。
- `tools/validate-ui-resource-lifecycle.js`：校验 StartGameView 目标/道具说明不依赖可释放的 `game` bundle、活动说明弹窗独立持有 prefab、`game` 空闲释放只清理 `game/` 缓存，以及 `PrefabFactory` 对缓存 prefab 使用成对 `addRef`/`decRef` 所有权；运行 `npm run validate:ui-resource-lifecycle`。
- `tools/validate-remote-level-background-preload.js`：校验启动 LoadingView 阶段会完成云档案同步与全量远端关卡包缓存、最高解锁关所在包优先、并发数固定不超过 2、重复任务复用 Promise，并禁止 StartGameView 恢复临界预下载等待；运行 `npm run validate:remote-level-preload`。
- `tools/validate-level-pack-compact-v2.js`：校验全部远程包的 V2 格式、manifest 字节数/SHA-256、990 关无损往返、遮挡方案严格数组合同、非法代码与坐标 Fail-Fast，以及远程包总体积不超过 2,000,000 字节；运行 `npm run validate:level-pack-v2`。
- `open-data/`：历史微信开放数据域逻辑。当前世界排行榜由主域源码和云函数实现，不再依赖开放数据域读取好友云存储。
- `tools/`：校验、同步、构建修复、调试辅助脚本。
- `tools/first-100-level-design.js`：前 100 关权威设计规则；Fail-Fast 读取 `E:\kxppm\decrypted_config\all_levels.json`，只提取前 100 关 `bubbles` 的占位/空位轮廓。母版 11/10 列轮廓通过归一化距离场投影到当前 11/10 列、8～15 行棋盘，并强制顶部支撑、逐行连通、普通球占位率至少70%和 100 个轮廓唯一；颜色数量、收集目标、冰球目标、特殊球、开局球序列、星级线、奖励和关卡模式全部继续使用当前项目规则。发射数由当前项目真实玩法模拟得到的 100 项逐关校准表控制，优先削减连锁掉落关的过量余球并保留高压关安全线，不读取参考项目发射数；校准表长度或数值非法时直接报错。源文件缺失、行宽或字符非法、投影不连通时直接报错，不导入参考项目玩法，也不使用默认关卡兜底。
- `tools/campaign-level-generation-config.js`：1–1000 关统一生成策略；集中维护普通球八色池、单关最多5色、计时关、漩涡/藤蔓魔灵/多对虫洞的十关节奏与阶段数量上限、冰块占比、目标分/星级线、动态遮挡、被困精灵救援排期及普通球占位率目标。普通球保持2→3→4→5色难度曲线，紫/橙/黑/白分别从21/41/61/81关解锁，解锁后的八色按每5关轮换且收集目标只从五种现有罐子支持色中选择；漩涡/藤蔓/虫洞分别从21/31/53关教学，81关后覆盖单玩法、两两组合、三玩法同关与阶段考核，后段单关上限为3个漩涡、3个藤蔓魔灵、3对虫洞；冰块从16关起按5%逐段提升至18%。救援关每100关固定投放在章内第25/42/63/86/99关，共50关；中心锚点统一固定在第6行中央，外围严格生成六角距离1至5的完整正六边形（90格），任何同色连通块最多5球，中心六邻圈按顺时针统计的连续同色最多2球。批量生成会按“纯救援、漩涡、藤蔓、双玩法、阶段考核”递进，并自动投放兼容的彩虹球、爆破球、石球、冰块、漩涡和藤蔓魔灵。全量模拟命中的异常关启用连锁风险候选筛选，并按多随机种子实测消耗校准发射球数量及最低清屏一星线；计时、虫洞和动态遮挡仍保持互斥。普通关占位目标在1–300/301–500/501–700/701–1000分别为70%/72%/74%/76%；救援关使用固定90格正六边形合同，不套用矩形棋盘占位率。
- `tools/rebuild-trapped-sprite-rescue-identities.js`：只展开并重写50个既定救援关的身份字段，将旧数字 `spriteId` 严格迁移为七名精灵大厅角色的 `spiritId`，保留所有非救援关数据，并同步受影响远程包的 SHA/字节数和 manifest；运行 `npm run generate:trapped-rescue-identities`。
- `tools/campaign-level-mode-policy.js`：玩法模式兼容入口，委托统一生成策略决定 `normal`、`special_floating_island`、`trapped_sprite_rescue` 及发射模式。每个 10 的倍数关固定为 90 秒 `timed_infinite_shots` 特殊浮岛关；计时关禁止配置发射球上限、开局长序列和“+3 球”。
- `tools/rebuild-first-100-level-configs.js`：前 100 关定向重建入口；先按当前项目设计规则同步 `LEVEL_CONFIG_TABLE_1_1000.csv` 前 100 行，再只重建本地 1-10、远程包 11-100 和对应 manifest 条目，不改写 101-1000 关远程包。运行命令为 `npm run generate:levels-first100`，重建时会复验当前玩法字段、11/10 列布局、支撑关系以及 100 个占位轮廓的唯一性。
- `tools/reference-levels-101-300-design.js`、`tools/rebuild-reference-levels-101-300.js`：101–300 关参考轮廓与逐关发射数权威规则。参考项目普通主线只存在 1–200 关，因此 101–200 一一投影同编号轮廓，201–300 使用参考 101–200 的水平镜像投影；目标棋盘仍采用当前项目 11/10 列、15 行、当前球数、颜色目标和特殊球。200 项发射数校准表缺项或数值非法时直接报错。运行 `npm run generate:levels101-300` 只重写 CSV 中非救援关的参考发射数、两个远程包及对应 manifest 条目；救援关发数继续由统一战役公式负责，并校验 200 个投影轮廓全部不同、水平重心偏移和左右占位差均不超过 0.20。
- `tools/clustered-level-layout.js`、`tools/rebuild-relaxed-campaign-level-configs.js`、`tools/redesign-first-100-clustered-levels.js`、`tools/redesign-levels-100-500-aesthetic.js`：1-1000 关颜色聚类与爽感校验规则；前 300 关保留参考占位轮廓，颜色填充和玩法仍走当前规则；101–300 参考轮廓允许来源布局本身的自然收腰边界，但仍强制顶部支撑、全盘连通、颜色聚类和低孤立率。休闲解压版全量重建通过 `npm run redesign:relaxed-campaign` 同步 CSV、本地 1-10、远程 11-1000 compact 包和 manifest；`npm run redesign:levels100-500` 会保留 101–300 参考占位，仅重建其颜色聚类并为 301–500 生成美术轮廓；501-1000 关可通过 `npm run redesign:levels501-1000` 重建远程包布局、对称轮廓、色彩流动和 manifest 摘要。
- `settings/`：Cocos Creator 项目设置。
- `package.json`：校验脚本入口。

## 运行入口

首入口是 `assets/boot/BootLoader.js`，完整业务入口仍是 `assets/scripts/bootstrap/GameBootstrap.js`。

`BootLoader.js` 是不依赖 `core`、只挂在 `boot.fire/Canvas` 上的首包组件。Cocos 激活 `boot.fire` 后，它先等待一次 `EVENT_AFTER_DRAW`，保证场景内 LoadingView 已经真正显示；微信环境随后通过 `wx.loadSubpackage("core")` 展示真实下载进度，再调用 `cc.assetManager.loadBundle("core")` 执行业务脚本。`CoreBundleReady.js` 写入严格执行标记，标记确认后才预加载并切换到 `game.fire`。

`DynamicAtlasBootstrap.js` 是引擎插件脚本（`isPlugin: true`），在普通业务脚本之前执行，强制开启动态合图：`cc.macro.CLEANUP_IMAGE_CACHE = false` 且 `cc.dynamicAtlasManager.enabled = true`。微信小游戏默认会清 Image 缓存，必须在此阶段关闭清理后才能参与动态合图。

`GameBootstrap.js` 是 Cocos 组件声明文件，负责暴露 Inspector 属性，并把实际实现挂载到组件方法上。启动 LoadingView 退场后会销毁节点并释放其 SpriteFrame；选关/局内 BGM 切换成功后停止旧音效并只保留当前 BGM 缓存，防止启动图和跨场景音频常驻。具体业务实现拆在多个 `GameBootstrap*Methods.js` 文件中：

- `GameBootstrapCompositionMethods.js`：`onLoad` 初始化中枢，创建 Store、Service、Manager、Audio、Tips、NetworkLoading 等；`GameManager`/`LevelRenderer` 延迟到 `_ensureGameplayKernel()`（进入局内时加载 `game` 分包并初始化）。
- `GameBootstrapStartupMethods.js`：启动加载流程；`start()` 先展示场景内 LoadingView，再由 `_beginStartupBundlePrefetch()` 下载并加载首屏必需的 `map` 分包，分包下载和 bundle 加载进度都会写入 LoadingView 进度条；随后并行加载选关预制体以及选关/局内两首 BGM。启动服务初始化后先在 LoadingView 内同步云档案并应用云端进度，再缓存远端关卡包（最高解锁关所在包优先、每完成一包更新 LoadingView 进度）；完整缓存成功后写入与 manifest 版本及各包 SHA 绑定的完成标记，后续启动只校验 manifest 和该标记，不再逐包读取校验。仅新账号首次进入选关时会消费 `NewUserGuideStore.initialPreparationShown` 一次性标记，将最高已解锁关传入 `prepareLevelId` 自动打开开局准备界面；新手引导同时从 `quick_start` 推进到 `start_game`，之后重启只显示选关。选关页首帧后只延迟处理好友体力领取和 `ui` 分包预热。
- `GameBootstrapLazyModule.js` / `GameBootstrapLazyRegistry.js`：非首屏必需的 bootstrap 方法模块（签到/任务/商店/游戏圈/设置/广告/telemetry/背包等）通过 `GameBootstrapLazyModule` 在首次调用时再 `require` 对应模块；各 loader 必须使用 Cocos 可静态分析的字符串字面量路径，禁止运行时变量 `require(path)` 或对 UI Controller 做 getter 懒加载。
- `GameBootstrapGameplayInputMethods.js`：局内触摸输入、瞄准、发射、update 驱动。
- `GameBootstrapNewUserGuideMethods.js`：新账号首次进入的新手引导覆盖层，使用 `ui/image/finger.png` 指引快速开始、开局按钮和首次局内发射操作。
- `GameBootstrapLevelRuntimeMethods.js`：启动关卡、重开、终态判断，以及局内暂停编排；`GameView/pause_btn` 打开 `PauseView`，暂停期间停止玩法 update 与输入，继续恢复，重玩复用当前关卡重开链路，退出复用返回选关链路。
- `GameBootstrapLevelSelectFlowMethods.js`：选关页面、关卡进度、胜利记录、星级，并预加载 `map` 分包浮岛地图资源；普通主线救援关首次或重复完成后，严格校验关卡 `spiritId` 与统一救援排期一致，并将对应精灵解锁写入 `AssistSpiritStore`，测试解锁运行不写玩家进度与精灵拥有状态。
- `GameBootstrapRouteEditorFlowMethods.js`：加载关卡与路线编辑器流程。
- `GameBootstrapPowerupInventoryMethods.js`：背包、开局道具、局内技能球和广告补给。
- `GameBootstrapSpiritHallMethods.js`：精灵大厅懒加载编排；从独立 `spirit_system` Bundle 加载大厅 Prefab 和七个精灵的动态 SpriteFrame，连接选择、对应精灵碎片升级和出战持久化；精灵养成只保留1至10级的等级晋升，不包含星级或进阶；选中未拥有角色后点击升级或出战，统一提示“该精灵尚未解锁，请先完成对应救援关卡”，不修改资源与精灵状态；大厅/商店 Tab 切换采用旧界面保持显示、新界面完成渲染后再移除旧界面的原子交接；共享 `SpiritSystemTabBar.prefab` 使用并发加载去重和 `addRef`/`decRef` 会话租约，防止页面 Prefab 释放依赖时使 TabBar 背景失效，最终关闭时才释放节点、Prefab、SpriteFrame 引用和整个 Bundle。
- `GameBootstrapSpiritShopMethods.js`：精灵商店懒加载编排；加载商店 Prefab、共享 `SpiritSystemTabBar.prefab` 和当日六个动态碎片 SpriteFrame，连接宝石消费、碎片到账、礼物/装饰库存、金币/宝石商品、每日限购、手动刷新和大厅/商店 Tab 路由；页签交接期间不释放公用 TabBar 或卸载 `spirit_system` Bundle，最终关闭时再成对释放资源与 Bundle。
- `GameBootstrapSpecialIntroduceFlowMethods.js`：局内首次说明弹窗编排（`IntroduceView` 特殊球说明、`GeniusTipsView` 固定精灵说明、`SartTipsView` 顶部空槽说明）；使用 `SpecialIntroduceStore` 持久化已读状态，展示期间暂停限时关计时。
- `GameBootstrapStatusResourceFlowMethods.js`：顶部资源、体力恢复、新手礼、状态文本。
- `GameBootstrapRankingShopChestFlowMethods.js`：排行榜、商店、购买、星星宝箱。
- `GameBootstrapDailyTaskFlowMethods.js`：每日任务和好友体力赠送。
- `GameBootstrapSignInAwardFlowMethods.js`：签到与奖励弹窗。
- `GameBootstrapGameCircleFlowMethods.js`：游戏圈福利与原生按钮适配。
- `GameBootstrapSettingsFlowMethods.js`：设置页和音频开关/音量。
- `GameBootstrapAdRewardMethods.js`：激励广告、广告奖励、频控。
- `GameBootstrapAudioMethods.js`：背景音乐、音效、震动；被困精灵完成获救时消费 `trapped_sprite_rescued` 事件并播放 `sound/cute_laughter`。
- `GameBootstrapShareFlowMethods.js`：微信分享。
- `GameBootstrapRuntimeConfigMethods.js`：运行模式、视口、安全区、棋盘参数；Inspector 中的 `projectileSpeed`/`impactBounceSpeed`/`jarRimBounceSpeed`/`dropGravity`/`dropInitialSpeedY` 经 `_applyBoardTuningFromProperties` 写入 `BoardLayout`，进关前再次同步以支持运行时调参。
- `GameBootstrapLifecycleMethods.js`：生命周期和 resize 处理。

`GameBootstrapShared.js` 汇总所有依赖和常量，是 bootstrap 层的共享依赖入口。

## 核心模块分层

### bootstrap

路径：`assets/scripts/bootstrap`

应用编排层。它连接 UI、玩法内核、渲染、服务、存储、广告、微信能力和音频。修改业务流程时通常先从这里找到真实调用链。

- `LevelSelectView.js`：选关页顶层 UI 渲染入口，负责顶部状态和入口按钮绑定；`top/top_layer/sign_btn` 是签到入口，`bottom_layer/elven_hall_btn` 打开精灵大厅；`test_btn` 进入关卡底图编辑场景，运行时从其同结构克隆 `local_level_test_btn`、`trapped_sprite_test_btn` 和 `board_occlusion_test_btn`，其中“遮挡”按钮进入独立遮挡测试关；这些按钮仅在隐藏测试模式开启后显示。`quick_start_btn` 快速开始，`back_cur_level` 回到当前关卡位置。
- `LevelSelectFloatingMap.js`：按 `assets/map/config/floating_map.json` 渲染 1000 关无限上滚动浮岛地图；配置显式携带与统一关卡生成策略一致的 50 个救援关 ID，只有这些 `trapped_sprite_rescue` 关卡使用单关 `landmark1` 浮岛，其余连续关卡优先装入普通浮岛，末尾等不足普通浮岛最小容量的非救援关使用 `landmark2`～`landmark5`；启动时仅预加载当前焦点关卡视口所需 island prefab，滚动时按需加载其余 prefab。

### core

路径：`gameplay-src/core`

- `GameManager.js`：玩法状态机和运行时核心。负责开局、瞄准、发射、技能、结算、胜负、分数、运行时事件、runtime snapshot。过关要求为星级达到 1 星且棋盘全部球自然消除或掉落；`bonusObjectives` / `winConditions` 中的收集目标只决定本次过关奖励是否翻倍，不再触发胜利或强制全盘掉落。清屏后进入 `won_pending` 等待掉落球全部结算，再进入 `won_surplus_shots_pending`（剩余发射球抛物线入缸，可选）、`won_settlement_pending`（入缸后 1 秒）并最终切到 `won` 触发 `WinView`。
- `GameManagerAssistSpiritSkillMethods.js` / `AssistSpiritSkillConfig.js`：ShooterPanel 出战精灵全局技能的权威配置与结算。Milu/Lumi 不显示全局技能；Noya 使用“本局种子 + 技能成功释放序号”生成可复现的随机三次贝塞尔路径，并让路径影响半径内的合法球按配置概率、最大数量进入掉落；只要棋盘仍有内容，即使没有合法掉落对象、曲线附近候选为0或全部概率未命中，也会正常播放技能且不强制补目标。Flora/Loco/Kelu 分别执行全盘解除藤蔓、按真实发射次数临时融雪、闪电链；Yumi 按藤蔓、雪块、闪电、龙卷风的固定优先级选择当前合法技能。玩法层先确定曲线和概率结果，表现层只播放已确定结果。
- `GameManagerShotResolutionMethods.js`：发射命中后的消除、掉落、收集等结算扩展；`_resolveBoardClearedOutcome` / `_beginSurplusShotBonus` 处理自然清屏后的星级校验、剩余球奖励与终局结算。
- 漩涡泡泡由 `GameManager` 在每次发射落位结算后启动：`BubbleGrid.rotateSwirlNeighborsClockwise()` 将中心周围六格严格顺时针轮换一格，`SpecialAnimationTiming.swirlRotation` 统一 60° / 0.4 秒时序；动画结束后 `SupportSystem.findFloatingCells()` 立即重算顶部连接并复用正常掉落链路。
- 虫洞由 `GameManager` 在漩涡阶段之后、藤蔓阶段之前处理：`BubbleGrid.getWormholePairs()` 按行严格配对，要求每个虫洞行恰好两个同方向端点；`shiftWormholeInteriors()` 在同一0.35秒阶段内将每对端点之间的普通球、特殊球与空位分别按 `moveDirection` 循环移动一格。虫洞端点是独立棋盘特效实体，不进入 `BubbleGrid.cells`、不占用蜂窝格、不参与支撑、下压边界或发射碰撞，同一坐标允许正常放置和吸附球。`WormholeShaderRenderer` 为全部端点绑定 `effects/WormholeFlow`，端点以70×70显示在独立 `WormholeLayer`，该层位于普通球 `BoardLayer` 下方；方向层为每对通道分别绘制箭头，结算位移动画不会中断材质。移动不调用颜色匹配，动画结束后统一重算支撑并让无支撑球进入掉落链路；虫洞显示不参与清屏与顶部崩塌判定。
- 藤蔓魔灵由 `GameManager` 在发射结算链中统一处理：魔灵固定 3 点生命，直接命中、爆炸范围命中或相邻格完成消除时每次结算只受 1 点伤害；缠绕球只有在六邻格内存在本次实际消除的球时才解除藤蔓并保留底层普通球，直接命中但未消除、或爆炸只覆盖缠绕球本身都不会解除。每 3 次真实发射后，存活魔灵按距离选择最近的未缠绕普通球，先预告 0.65 秒再写入归属藤蔓状态。魔灵死亡或因无支撑掉落时，`BubbleGrid` 按 owner id 同步清除其全部藤蔓；缠绕球自身掉落前也会解除藤蔓。
- 被困精灵救援关使用独立 `trapped_sprite_rescue` 类型：`TrappedSpriteRescueSystem` 以 `anchorCell` 六邻格作为唯一支撑种子，保存权威任意角旋转状态，并根据最终入射方向、命中半径和实时转动惯量计算阻尼转角；中心精灵是吸附支撑点而不是反弹点，发射球命中精灵后吸附到接触方向对应的锚点六邻合法空格，中心保留格本身不放球。吸附确实启动整盘旋转时会抑制同一击的邻居局部反弹。救援关允许彩虹球、爆破球、石球、冰块、漩涡和藤蔓魔灵；即时技能/障碍结算先进入支撑扫描，漩涡轮换和藤蔓预告等待整盘受力旋转停止后再执行，禁止双重拓扑动画并行。`BubbleGrid` 保留 `row/col` 拓扑但把碰撞、吸附、特殊实体和快照坐标转换到旋转后的世界坐标。第0行不提供支撑或吸附，发射球触碰顶部会反弹，只有球心低于炮台位置才消失；支撑扫描清空棋盘后立即发出被困精灵获救飞离事件，不等待掉落球入缸，但最终胜利结算仍等待掉落计分完成。燃烧瓶、分裂球、虫洞、锁定球、钥匙球、普通棋盘视口推进、顶部空槽崩塌、危险线和额外固定锚点全部禁用。测试关 `assets/map/config/levels/level_trapped_sprite_test.json` 已同时配置六类兼容实体，隐藏测试模式下通过选关页“精灵”按钮进入。
- `AdRevivePolicy.js`：广告复活策略；普通限球关统一补 10 球并选择目标色，计时关失败复活统一增加 10 秒，LoseView 按模式切换描述、位置与赠球图标。
- `ProjectileMath.js`：弹道与几何计算。
- `StarRatingPolicy.js`：星级计算策略；正式主线关必须显式提供 `starThresholds`，生成器按教学/练习/组合/转折/考核节拍写入48%–56%、68%–76%、86%–94%的逐步收紧阈值；仅非正式测试配置可使用50%/70%/88%的通用比例。

### systems

路径：`gameplay-src/systems`

玩法底层系统：

- `BubbleGrid.js`：棋盘格与格子状态；普通模式几何坐标通过附着的 `BoardViewportSystem.offsetY` 计算，被困精灵模式则通过 `TrappedSpriteRescueSystem` 将局部蜂窝坐标绕中心转为权威世界坐标，分段碰撞改为扫描实时旋转位置；中心精灵命中通过 `findTrappedSpriteAttachmentCell()` 选择锚点六邻合法吸附格，并禁止中心保留格吸附。漩涡泡泡使用互不重叠的六格顺时针轨道；虫洞按行形成一个或多个严格双端点对，但端点保存在独立虫洞集合而非占格集合，并在各自通道循环移动时保留特殊球字段、藤蔓归属和空位；藤蔓球在格子快照中保存 `vineOwnerId`，预告阶段保存 `vinePreviewOwnerId`，魔灵生命与藤蔓归属都由棋盘运行时状态维护。
- `BoardViewportSystem.js`：普通棋盘不超过 10 行时顶部贴 HUD 下沿；超过 10 行时开场和局内吸附结算后都匀速上移到 HUD 下方保留 10 行，移动期间锁定发射；逻辑第 0 行空槽 ≥6 时，结算后立即触发全盘崩塌判定。被困精灵模式固定 `offsetY=0`，调用 settle 或行偏移直接报错。
- `TrappedSpriteRescueSystem.js`：加载与精灵大厅同源的七名 `spiritId`、锚点、世界中心、显示比例和全部旋转参数；局内被困形象严格派生为 `game/trapped_spirit/{spiritId}`，以指数阻尼积分保存任意最终角，向棋盘提供格子世界坐标，并在旋转期间参与全局输入锁。
- `MatchSystem.js`：同色匹配消除；藤蔓球不进入同色连通组。
- `SupportSystem.js`：连通/悬空判断；普通模式仅由顶部和锁定球提供锚点，虫洞不提供支撑；被困精灵模式只从中心锚点六邻格开始搜索，第0行不再提供支撑。结构变化后无支撑球在当前发射周期进入掉落链路。
- `FairyAssistSystem.js`：管理 `GameView/geniuses` 六个固定协助精灵槽位；只要本次发射产生消除，就按匹配消除数量生成红/黄/绿精灵，未消除时移除最早两只；碰撞中心由 `LevelRenderer.syncFairyAssistCollisionCenters` 从槽位节点转换到棋盘坐标后再参与判定，并维护每精灵最多 7 次碰撞计数与光效层数 snapshot。
- `BoardOcclusionSystem.js`：管理棋盘云朵/树叶视觉遮挡；普通关按持久化关卡尝试序号在4个预校验变体间循环且连续不重复，随机挑战按Run种子固定。系统独立维护活动区域和渲染版本，普通`shot_limited`关只维护剩余发射次数，`timed_infinite_shots`限时关只维护剩余秒数；配置类型与关卡模式不一致时直接报错。遮挡不写入`BubbleGrid`，除雪剂可优先清理全部活动遮挡。
- `FallingMarbleSystem.js`：掉落球运动（默认重力 900）；`maxDynamicMarbles` 当前由 `FallingRulesDefaults.maxDynamicMarbles`（9999，试验值）统一控制，暂忽略关卡 `fallingRules.maxDynamicMarbles: 10`，一次注册的全部掉落球会立即进入物理模拟；固定精灵反弹、红黄绿倍率、绿色精灵单次一分为二；清屏后余球每 0.2s 连续抛射入缸（不等上一颗入缸），炮台每 0.2s 在 15°～165° 间按 15° 步进往返旋转。
- `JarCollectorSystem.js`：底部罐子收集。
- `ShooterController.js`：射手和待发球；前 100 关的 `openingShotBalls` 会按配置顺序先进入炮台，序列耗尽后才进入权重随机球；广告复活覆盖炮台时会明确清空未消费的开局序列；`drainRemainingShotBalls` 在剩余球奖励阶段排空炮台队列。露米出战时，`GameManager.fireShot()` 在真实队列推进后使用本局 seed、真实发射序号和当前精灵等级执行一次受控概率判定，仅当新装填 `currentBall` 为普通球时通过 `convertCurrentNormalBallToSkillBall("blast")` 转成权威炸弹球，不消费道具库存、不修改 `nextBall` 或剩余发射数。
- `TrajectoryPredictor.js`：瞄准轨迹预测；被困精灵模式使用旋转后的格子世界坐标，保留边界反弹后的最终入射方向，不计算顶部吸附；发射球触碰顶部会反弹，只有运动到炮台位置以下才返回无目标格的 `miss` 计划并消失。
- `BaseSystem.js`：系统基类。

### render

路径：`gameplay-src/render`；共享的节点工具 `RenderNodeHelpers.js` 仍保留在 `assets/scripts/render`，供首包 UI 与局内渲染共同使用。

渲染层只根据关卡配置和 runtime snapshot 同步 Cocos 节点：

- `LevelRenderer.js`：渲染入口、资源预加载、事件 handler、公共节点/资源逻辑；`TrappedSpriteLayer` 固定使用层级49，位于棋盘泡泡、碎裂和掉落泡泡层之上、HUD之下；收到一次性 `trapped_sprite_rescued` 后按真实屏幕上边界播放获救飞离，完整出屏后隐藏且不会被后续刷新拉回中心。
- `LevelRendererSceneMethods.js`：场景渲染薄编排层，按域挂载下列子模块。
- `LevelRendererSceneShared.js`：场景渲染跨域公共节点 helper（`requireChildNode`、Label 写入等）。
- `LevelRendererSceneScaffoldMethods.js`：`GameView` 脚手架、背景/大陆/渐变层、开局倒计时与 HUD 底线同步。
- `LevelRendererSceneBoardMethods.js`：棋盘球池、掉落球、调试网格与棋盘格视觉状态。
- `LevelRendererSceneOcclusionMethods.js`：在`BoardOcclusionLayer`（z=43）按格坐标与视口偏移渲染等比云朵/树叶，并显示剩余“发/秒”；普通关发射次数固定显示在遮挡正中且层级高于遮挡Sprite，限时关秒数显示在正中钟表底部框内。云朵使用4.8秒完整周期、236至252透明度范围的缓慢呼吸，树叶保持静止且不旋转。限时关`timer`局部刷新只更新现有遮挡Label与渲染版本键，不重建遮挡节点或重启呼吸动画。
- `LevelRendererSceneShooterMethods.js`：炮台、瞄准辅助线、彩虹选色、路线编辑器与飞行球视觉缓存；通过 `AssistSpiritPresentationConfig` 按 `shooterSnapshot.assistSpiritId` 安装当前出战精灵的待机/递球动画，ID 来自精灵大厅持久化的 `AssistSpiritStore.equippedSpiritId`。
- `LevelRendererSceneFxMethods.js`：钥匙/分裂/燃烧瓶/冰球等一次性动画、障碍锤提示、震屏与冲击反弹。
- `LevelRendererSceneHudMethods.js`：HUD 目标、星级进度、连击/分数飘字、定时器与底部道具栏；道具按钮由 `prefabs/game/PropsBtn` 动态实例化到 `GameView/BttomPanel/props_scroll/view/content`。
- `LevelRendererSceneJarMethods.js`：底部罐子、罐内掉落遮挡与碰撞遮罩。
- `LevelRendererScenePopupMethods.js`：胜/负/暂停/道具说明弹窗与结果浮层渲染（含 Sprite 代理分层）。
- `LevelRendererFairyMethods.js`：严格绑定 `GameView/geniuses/genius1...6`，从 `animation` 分包实例化三色精灵动画 prefab，保留飞入/替换/离场动画，并用同 prefab 的后置克隆表达碰撞层数。
- `BubbleShatterRenderer.js`：普通匹配球消除时的 Shader 碎裂渲染器；在棋盘节点回收前复制球的 SpriteFrame 与位置，以单球单 Sprite 的片元 Shader 生成中心块和八个放射碎片，不参与棋盘状态与掉落结算。
- `WormholeShaderRenderer.js`：从 `game/effects/WormholeFlow` 预加载虫洞 effect，为虫洞 Sprite 创建材质实例并维护节点池中的绑定/还原生命周期；效果使用引擎全局时间驱动，不依赖节点 Action 或脚本逐帧更新。
- `PrefabFactory.js`：预制体实例化辅助；缓存 prefab 时建立一次 `addRef` 所有权，清理缓存时只执行对应的 `decRef`。支持按规范化资源路径前缀释放，返回选关后的局内清理只释放 `game/` prefab，公共 UI prefab 保持会话级缓存；活动中的 StartGameView 道具说明弹窗另持有一份短期 prefab lease，关闭并销毁后成对释放。
- `RenderNodeHelpers.js`：节点操作辅助。

### config

路径：`assets/scripts/config`

配置层。重点文件：

- `LevelManager.js`：按关卡 ID 生成 key，1-10 调用本地 `LevelConfigLoader`，11-1000 调用 `RemoteLevelPackLoader`，并缓存关卡配置；另提供 `loadTestLevel()` 和 `loadTrappedSpriteTestLevel()` 两个显式本地测试入口；`preloadAllRemotePacks(priorityLevelId)` 用于启动 LoadingView 阶段完成全部远端关卡包的磁盘缓存。
- `LevelConfigLoader.js`：本地关卡配置加载、校验、规范化，并向远程包 loader 暴露同一套规范化入口。正式普通 `level_###` 配置统一校验顶部横向连续同色普通球不超过3个，以及排除特殊实体格后的普通球占位率不少于70%。`trapped_sprite_rescue` 使用固定90格正六边形专用形状合同，不套用矩形棋盘占位率；同时要求顶行全空、中心格保留、`spiritId` 严格属于精灵大厅七名角色、旋转字段完整；只允许彩虹球、爆破球、石球、冰块、漩涡和藤蔓魔灵，且特殊实体不得占用顶行或中心格，并禁止普通模式的 `dropInterval` 与 `initialDropSpaceRows`；全部非法状态 Fail-Fast。
- `BoardOcclusionConfig.js`：动态遮挡Schema、严格校验与正式关卡候选生成策略；1-30关显式`none`，31关起启用，80关起由单区提升为双区，被困精灵救援关固定禁用。
- `LevelBoardSupportValidator.js`：生成器、运行时配置加载和离线关卡校验共用的棋盘规则；按普通顶部支撑或救援中心锚点验证连通性。普通关统一断言顶部同色连续上限3与普通球最低占位率70%；救援关由专用校验器断言完整半径5正六边形、最大同色连通块5和中心邻圈连续同色2。
- `LevelColorPermutation.js`：普通关卡进入局内前对本次 `levelConfig` 拷贝执行颜色轮换；保持棋盘格局不变，同色球整体换成另一组颜色，不改写原始关卡缓存和收集目标字段。
- `LevelPackManifest.js`：远程关卡 bootstrap manifest、远程完整 manifest、包清单和包定位的严格校验，并要求远程包声明 `compact-schema-v2` 格式。
- `LevelPackCompactCodec.js`：远程关卡包 `compact-schema-v2` 编解码器；包头集中公共字段，特殊实体使用短数组，遮挡方案使用严格的模式/视觉/清除规则代码与扁平坐标数组；生成器写入压缩格式，运行时和离线工具读取后先无损展开为完整关卡结构。
- `RemoteLevelPackLoader.js`：先读取本地 bootstrap manifest，再使用 `wx.cloud.getTempFileURL` 下载远程完整 manifest；启动 LoadingView 阶段按最高解锁关优先、最多 2 路并发下载全部远端 compact 包到 `USER_DATA_PATH`，每包按 manifest 执行 SHA-256 完整性校验；实际读取单关时展开对应包并复用 `LevelConfigLoader` 的规范化校验。
- `LocalEditedLevelStore.js`：关卡编辑器本地草稿的权威存储层；微信使用 `USER_DATA_PATH/bubble_level_editor`，原生使用 writable path，浏览器/编辑器预览使用命名空间 localStorage。索引与单关 JSON 每次读写都经过 `LevelConfigLoader` 严格校验，不覆盖 `assets/map/config/levels` 或远端关卡包。
- `BoardLayout.js`：棋盘与底部缸布局参数；棋盘采用 11/10 交错列，5 个不同颜色缸按实时屏幕宽度等比缩放，缸口保持在屏幕内且互不重叠，缸体允许相邻叠加。
- `BoardViewportConfig.js`、`FairyAssistConfig.js`、`FallingRulesDefaults.js`、`JarScoreConfig.js`、`SpecialAnimationTiming.js`：局内玩法专用配置，源码位于 `gameplay-src/config`，随局内玩法延迟包加载。
- `AimTuningProfiles.js`：瞄准调参配置。
- `DailyTaskConfig.js`、`DailySignInConfig.js`、`ShopGoodsConfig.js`、`ShopRulesConfig.js`、`StarChestConfig.js`、`GameCircleWelfareConfig.js` 等：业务静态配置。
- `AssistSpiritConfig.js`：精灵大厅七个精灵的权威静态配置，显式声明运行时能力类型、说明、角色/UI 资源路径、1–20 级触发概率、逐级金币消耗和逐星碎片消耗；露米注册为 `produced_ball/blast`，概率表同时供大厅展示和局内权威产球判定使用；米露的普通递球不暴露特殊能力概率。
- `AssistSpiritRescueConfig.js`：正式主线50个救援关的精灵身份权威映射；与关卡生成器共用章内 `25/42/63/86/99` 排期及七名精灵循环顺序，供胜利解锁与旧档进度补偿使用，非救援关查询返回 `null`，强制查询非救援关直接报错。
- `RuntimeModeConfig.js`：运行模式配置。

### services

路径：`assets/scripts/services`

业务服务层，封装规则和平台能力：

- 广告：`AdService.js`、`WechatNativeTemplateAdAdapter.js`、`AdRewardCatalog.js`、`AdRewardQuotaStore.js`
- 每日任务：`DailyTaskService.js`、`DailyTaskRewardService.js`
- 普通商店：`ShopConfigService.js`、`ShopStateService.js`、`ShopPurchaseService.js`
- 精灵商店：`SpiritShopService.js`；严格串联 `PlayerResourceStore`、`AssistSpiritStore` 与 `SpiritShopStore`，处理宝石扣除、碎片发放、商品库存、每日限购及刷新。
- 星星宝箱：`StarChestService.js`、`StarChestRewardService.js`
- 微信能力：`WechatShareService.js`、`FriendGiftService.js`、`GameCircleButtonAdapter.js`、`WorldLeaderboardService.js`
- 玩家云端档案：`PlayerCloudProfileService.js` 通过 `playerProfile` 微信云函数同步本地玩家状态到云数据库 `player_profiles`，同步内容包含关卡进度、金币/宝石、精灵拥有状态/等级/星级/碎片/出战状态、背包、签到、普通商店、精灵商店库存与购买状态、游戏圈福利及关卡尝试统计；精灵旧档 v1 显式迁移为 v2，仅默认米露保持拥有与出战，保留七名角色原等级、星级和碎片，并在本地启动或云档应用后依据已完成救援关补齐拥有状态；旧档案缺少宝石或精灵商店字段时由客户端与云函数执行显式 schema 迁移。本地写入经 `StrictStorage` 观察者合并上传（默认 5s debounce）；`Store.load()` 仅在 normalize 后数据变化时写回；选关页体力倒计时 ticker 只读内存状态，仅在自然恢复体力时写 storage；云端拉取后刷新选关 UI 在 `suspendWriteObserver` 内执行以避免冗余上传。
- 世界排行榜：玩家普通关卡过关后，`WorldLeaderboardService.js` 立即用本地最佳成绩和已过关数调用 `worldLeaderboard` 微信云函数写入云数据库 `world_leaderboard`。未授权昵称头像时数据库中的 `nickname` 与 `avatarUrl` 保持空字符串；用户后续授权后，排行榜入口会保存 `bubble_world_leaderboard_profile_v1` 并再次上报覆盖云端资料。排行榜只拉取前 100 名；展示时空头像使用默认头像，空昵称显示“微信用户”。
- 关卡编辑器云同步：`LevelEditorCloudSyncService.js` 每次只将编辑器当前选中且已保存的单关本地草稿调用 `levelEditorDrafts` 云函数，写入独立集合 `level_editor_drafts`；文档 ID 由当前微信 `OPENID` 哈希与 `levelId` 共同组成，不同玩家上传同一关不会相互覆盖；该链路不上传、不修改 `level-packs/` 静态文件、远端 manifest 或线上正式关卡版本。
- 游戏圈福利：`GameCircleWelfareService.js`
- 埋点：`TelemetryService.js`

### utils

路径：`assets/scripts/utils`

通用工具与本地状态：

- `StrictStorage.js`：严格本地存储读写，不吞 JSON 错误。
- `BundleLoader.js`：分包/资源加载；生命周期敏感资源使用 `map/`、`game/`、`ui/` 显式前缀，禁止用同一个裸 `image/props/*` 路径跨分包复用。
- `Logger.js`、`DebugFlags.js`：日志和调试开关。
- 各种 Store：`LevelProgressStore.js`、`LevelAttemptStatsStore.js`、`PlayerResourceStore.js`、`AssistSpiritStore.js`、`SpiritShopStore.js`、`InventoryStore.js`、`SelectedPowerupsStore.js`、`DailyTaskStore.js`、`SignInStore.js`、`StarChestStore.js`、`ShopStateStore.js`、`StaminaRecoveryStore.js`、`NewGiftStore.js`、`RouteConfigStore.js`、`GameCircleWelfareStore.js`、`LeaderboardStore.js`；`PlayerResourceStore` v2 严格持久化金币、宝石和体力，`AssistSpiritStore` v2 对七精灵完整 roster、拥有状态、等级、星级、碎片和当前出战 ID 做严格校验，仅允许拥有的精灵升级、进阶和出战，并能按已完成救援关幂等补齐解锁；`SpiritShopStore` 持久化每日轮换、购买次数、永久礼物/装饰库存和购买日志。
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

- `MapEditorController.js`：`game/scens/editor` 场景运行时脚本。绑定棋盘、普通球、分裂球和特殊球工具；支持当前正式配置中的冰球、爆破球、彩虹球、石球、锁球/钥匙、燃烧瓶、分裂球、漩涡、藤蔓魔灵和左右虫洞。保存按钮把合并并严格校验后的整关配置写入本地草稿，云同步按钮只上传本地草稿，返回按钮重新进入 `game.fire`/LevelView。
- `MapEditorLevelCatalog.js`：复用 `LevelManager`、`RemoteLevelPackLoader` 和线上远端 manifest，展示当前线上 1-1000 关列表并按原正式加载链读取关卡，不再扫描或改写工程内 JSON 文件夹。
- `MapEditorLevelPicker.js`：有界虚拟 ScrollView 关卡选择弹层（顶部最小关、底部最大关）；静态背景与虚拟行背景使用独立 Sprite 代理渲染层，原 Sprite 禁用，逻辑/触摸节点保持原层级。
- `MapEditorBoardImport.js`：把当前完整 `layout`/`specialEntities` 合同导入为编辑器格子状态；`validate:level-editor` 会验证现有 1000 关全部可导入。
- `settings/project.json` 必须保留引擎 `EditBox` 模块；编辑场景的 `checkerboard_row` 依赖该组件，禁止再次加入 `excluded-modules`。

## 主要运行链路

### 启动到选关

1. Cocos 只加载内置 `main` 中的 `assets/scens/boot.fire`、LoadingView 静态资源、boot Canvas 上的 `BootLoader` 组件和动态合图插件；完整 `assets/scripts` 不参与首场景前的解析执行。
2. `boot.fire` 首帧绘制完成后，`BootLoader` 下载并加载 `core` 分包，进度直接写入首场景进度条；`CoreBundleReady` 标记确认后预加载并切换到 `assets/scens/game.fire`。
3. `game.fire` 挂载的 `GameBootstrap.onLoad` 初始化启动核心、玩家基础资源、背包/引导/音频和关卡管理；任务、星箱/圈子、商店、签到、新手礼包、广告、分享/好友、排行榜和云档案服务仍延后初始化。
4. `GameBootstrap.start` 复用完整业务场景内的 LoadingView，并调用 `_beginStartupBundlePrefetch()`，只下载并加载选关首屏必需的 `map` 分包。
5. `game.json` 构建后不写入分包 `preloadSubpackages`。项目已移除内置 `resources` bundle，避免 Cocos 在首场景前将其作为内置资源包强制加载。微信构建后由 `packages/build-loading-splash` 接入 `MinigameLoading`，校验 `BootLoader` 位于首包、完整业务脚本位于 `core`、玩法生成资产位于 `game`；`main.js` 不再同步 require 玩法脚本，也不发布玩法 JSON 副本。
6. `map` 首屏资源准备完成后，并行加载选关预制体及选关/局内两首 BGM；LoadingView 退出前，`_initializePostLoadingServices()` 初始化任务、商店、签到、广告和云相关服务。启动首次进入选关时先把新手引导推进到准备界面步骤，再以最高已解锁关作为 `prepareLevelId` 调用 `_showLevelSelectView()`；选关渲染完成后自动打开该关的准备界面。选关节点与地图内容完成后再等待一次 `EVENT_AFTER_DRAW`，此时仅延迟启动好友体力领取和 `ui` 分包预热；SFX 仍在首次播放时按需加载。
7. 用户点击开局弹窗「开始」后，`_loadLevelById` → `_ensureGameplayKernel()` 才加载 `game` 分包并初始化 `GameManager`/`LevelRenderer`；`_hideLevelSelectView` 会在 `LevelView` 仍有效时先校验并清空顶部资源图标缓存，再销毁整个 `LevelView`、释放浮岛 prefab，最后释放 `map` 分包并清空 prefab 缓存；返回选关时从重新加载的 `map` 分包完整实例化新节点，禁止复用已释放 SpriteFrame 的旧选关节点。

### 内存管理（P1）

- `LevelSelectFloatingMap.js`：浮岛滚动后按视口 ±2 个节点保留 prefab，其余 `cc.assetManager.releaseAsset`；离开选关页时 `releaseAllCachedMapPrefabs` + `invalidateAssetCache`。
- `RemoteLevelPackLoader.js`：远程完整 manifest 每次进程内首次加载时从云存储读取；远程 compact 包 JSON 在启动 LoadingView 阶段按最高解锁关优先、最多 2 路并发写入 `USER_DATA_PATH` 磁盘缓存，缓存路径包含远程 manifest `version` 和包 sha256；实际读取时才解析并展开当前请求关卡所在包，并发请求通过 `_packTextPromises` 去重，全量后台任务通过 `_allPacksPreloadPromise` 去重。
- `LevelRenderer.js`：`releaseLevelSpecificSpriteCache()` 在返回选关时释放关卡专属 sprite，只保留跨关必需的 HUD、底部道具、评论动画等小型共用图；关卡颜色球、罐子、特殊球、胜利瓶子按当前关卡和 runtime snapshot 精确预加载。
- `BundleLoader.js`：`releaseNamedBundle(name)` 卸载分包前先调用 bundle `releaseAll()` 释放已加载资产；离开选关时卸载 `map` 分包；选关页完整渲染并完成首帧绘制后才后台预热 `ui` 分包，弹窗 prefab 仍按需加载。
- `GameplayBundleReleaseScheduler.js`：离开局内返回选关后，超过 `gameplayBundleIdleReleaseMs`（默认 10000）未再进入局内则释放 `game` 与局内动画 `animation` 分包，并清理 `LevelRenderer` 持有的 prefab / sprite / animation 引用，以及碎裂、虫洞渲染器持有的 EffectAsset、材质和已完成加载 Promise；再次进入局内时必须重新预热这些分包资产。
- `UiModalReleaseHelper.js`：除 `ShopView` 外，其余 UI 弹窗在 `_hide*` 时 destroy 节点并 `releaseAsset` prefab；`BuyView` 在关闭购买弹窗时释放。

### 选关到开局

1. 选关页触发 `_onLevelSelectTap`。
2. 浮岛地图只允许点击 `levelId <= highestUnlockedLevel` 的关卡点。
3. 进入开局道具/体力检查流程。
4. `_showStartGameView` 只调用 `levelManager.loadLevel(levelId)` 读取当前关卡预览信息，不再等待任何“下一段远端包”预下载任务；远端包已由选关页首帧后的全量后台任务提前缓存。
5. `_loadLevelById` 调用 `levelManager.loadLevel(levelId)`。
6. `LevelManager` 对 1-10 使用 `LevelConfigLoader` 加载本地 `levels/level_###.json`；对 11-1000 使用 `RemoteLevelPackLoader` 先下载远程完整 manifest，再按 manifest 下载云存储关卡包并复用同一套校验。
7. `_ensureGameplayKernel()` 调用 `BundleLoader.ensureGameplayBundleLoaded()`；加载 `game` Asset Bundle 会执行其中唯一的 `generated/lazy-gameplay-code.js`，`BundleLoader` 严格校验完成标记、模块加载器和源码哈希，再通过 `requireGameplayModule("GameManager")` 与 `requireGameplayModule("LevelRenderer")` 初始化局内内核。
8. `gameManager.startLevel(levelConfig)` 生成运行时状态。
9. `levelRenderer.renderLevel(levelConfig, snapshot)` 渲染局内场景。
10. 隐藏选关页后保持 `isRestarting` 门控，`levelRenderer.playGameEntryCountdown()` 依次播放 3、2、1、GO；动画结束才恢复玩法 update、触摸和局内按钮，并继续特殊球介绍或新手引导。
11. `LevelView/test_btn` 先加载 `game` 分包，再通过 `gameBundle.loadScene("scens/editor")` 切入关卡底图编辑器；编辑器从线上 manifest 显示关卡列表，修改后只保存本地草稿或同步到独立云端草稿集合。
12. `LevelView/local_level_test_btn` 读取本地草稿索引并显示关卡列表；选中后以 `testSource: "local"` 进入现有测试模式，不扣体力、不记录普通关进度、不发放通关奖励，重试继续加载同一份本地草稿。

### 局内交互

1. `GameBootstrapGameplayInputMethods` 接收触摸。
2. `GameView/BttomPanel/directions_btn` 打开 `PropDescriptionView`；弹窗展示期间暂停玩法 update 与输入，关闭后恢复。
3. 瞄准输入传给 `gameManager.beginAim` / `setAim` / `endAim`。
4. 发射触发 `gameManager.fireShot`。
5. `GameManager` 调用 systems 完成命中、消除、掉落、收集、胜负判断；若棋盘存在一个或多个漩涡泡泡，则按稳定顺序分别将各自六格轨道顺时针旋转60°；随后所有独立虫洞对在同一阶段内将各自端点间的格子按箭头方向循环移动一格，并只统一重算支撑与掉落、不主动匹配；最后若本次为第3的倍数次发射，所有存活藤蔓魔灵按稳定顺序选择互不重复的最近普通球进行预告和缠绕，三个阶段期间都锁定输入。
6. 匹配消除球在原位置碎裂，只有 `SupportSystem` 判定的悬空球进入 `FallingMarbleSystem`；只要本次发射产生消除，不管是否产生悬空掉落球，都会由 `FairyAssistSystem` 生成固定精灵，未消除时按分数加成等级从高到低离场两只（同等级时更早入场的先离场）。
7. 坠落球碰撞固定精灵后累加倍率并反弹；普通球首次碰撞绿色精灵时由两个子球替换，两个子球分别落缸计分。
8. 棋盘全部球通过正常消除或悬空掉落清空后，`GameManager` 先等待所有掉落球、分裂生成和燃烧瓶结算结束，再检查最终分数是否达到 1 星；达到则继续胜利结算，未达到则失败。`bonusObjectives` / `winConditions` 中的收集目标不参与通关判定，只在胜利奖励发放时决定奖励是否翻倍。
9. 棋盘剩余球全部入缸后，若仍有 `remainingShots` 则进入 `won_surplus_shots_pending`：`ShooterController.drainRemainingShotBalls` 排空炮台队列，`FallingMarbleSystem.registerSurplusShotsFromOrigin` 每 0.2s 连续抛射、炮台每 0.2s 在 15°～165° 间旋转；全部入缸后进入 `won_settlement_pending`，停顿 1 秒再切到 `won`。无剩余发射球时直接进入 `won_settlement_pending`。
10. `GameBootstrap.update` 刷新 `GameManager.update(dt)`，再让 `LevelRenderer.refreshRuntime` 同步画面。
11. runtime event 驱动音效、震动、埋点、结果弹窗和奖励流程；`WinView` 仅在 `state === "won"` 时弹出。

### 新手引导

1. 新账号首次进入选关页时，启动流程消费 `NewUserGuideStore.initialPreparationShown` 一次性标记，将引导从 `quick_start` 推进至 `start_game`，并自动打开最高已解锁关的开局准备界面。
2. 开局准备弹窗渲染完成后，`GameBootstrapNewUserGuideMethods` 在 `play_btn` 上显示手指呼吸动画；关闭弹窗会回退至 `quick_start`，但一次性标记已写入，后续重启不再自动打开，改由 `quick_start_btn` 继续引导。
3. 开局成功并渲染第一关后进入 `game_fire` 步骤，在游戏区域中间显示手指和弧形滑动轨迹，引导旋转炮台并完成一次发射。
4. 第一次真实发射成功后标记引导完成；引导未完成期间，签到界面不会自动弹出。

## 关卡配置

本地首 10 关文件位于 `assets/map/config/levels/`，命名规则为 `level_###.json`。11-1000 关位于 `remote-level-packs/` 的 100 关分段包中。本地客户端只内置 bootstrap manifest，运行时先从云存储固定路径拉取远程完整 manifest，再由远程 manifest 定位各关卡包 fileID、sha256、bytes 与格式。远程包使用 `compact-schema-v2`：包头集中保存 `levelSchemaVersion`、`coordinateSystem`、`sharedDefaults`，单关移除说明字段，将 `level.specialEntities` 编码为短数组，并将 `level.boardOcclusionPlan` 编码为严格的模式/视觉/清除规则代码与扁平坐标数组；`RemoteLevelPackLoader` 下载后必须先通过 `LevelPackCompactCodec` 无损展开为完整关卡结构，再交给 `LevelConfigLoader` 校验。`LevelConfigLoader` 会校验：

- `schemaVersion`
- `coordinateSystem`
- `level.levelId` 与文件名匹配
- `level.code` 前缀
- 颜色集合、布局行、射击次数、目标分、显式星级线、下落间隔
- `initialShotBalls`（1～2 球）与 `openingShotBalls`（3～6 球）的互斥、颜色范围和模式约束
- 特殊球/障碍球配置
- 关卡模式、初始下压空间和局内广告道具规则
- 正式关卡顶部连续同色普通球不超过3个
- 排除特殊实体格和救援中心保留格后，普通球占位率不少于70%
- 被困精灵救援排期、中心锚点支撑及玩法互斥约束
- 通关奖励配置
- 罐子、目标、调参配置等

关卡配置缺字段或结构不符合预期时应直接报错，不应在调用侧补默认值。

远程包上传规则：

- `remote-level-packs/level_manifest.json` 上传到云存储 `level-packs/v2/level_manifest.json`，这是 V2 新客户端运行时拉取的完整远程 manifest；旧版 `level-packs/level_manifest.json` 与 V1 关卡包必须保留给已发布旧客户端。
- `remote-level-packs/levels_pack_011_100.json` 上传到云存储 `level-packs/v2/levels_pack_011_100.json`。
- 其余 V2 compact 包同名上传到 `level-packs/v2/`，禁止覆盖旧版 `level-packs/` 下的 V1 文件。
- 当前 manifest 使用的云存储 File ID 前缀为 `cloud://cloud1-d7gqettx3e9249ca1.636c-cloud1-d7gqettx3e9249ca1-1428064608`。
- `level-packs/` 是 compact 静态关卡配置根目录，V2 发布位于其 `v2/` 子目录；必须在云存储权限/安全规则中允许客户端读取，否则 `wx.cloud.getTempFileURL` 会返回 `STORAGE_EXCEED_AUTHORITY`。
- 上传后云 fileID 必须与 `remote-level-packs/level_manifest.json` 中的 `packs[].fileID` 保持一致；本地 `assets/map/config/level_manifest.json` 只需要保持 `remoteManifest.fileID` 指向固定远程 manifest 路径。
- 如果重新生成包导致 sha256、bytes 或 format 改变，必须同步更新并上传 `remote-level-packs/level_manifest.json`。在远程 manifest fileID 固定不变的前提下，云端关卡包和远程 manifest 可以版本化热更新，不需要仅因包 sha256/bytes 改变而重建客户端。

## 微信相关

- `cloudfunctions/`：实际云函数源码。
- `cloudfunctions/playerProfile`：玩家信息云端存储函数，按当前微信 `OPENID` 读写 `player_profiles` 云数据库集合。
- `cloudfunctions/worldLeaderboard`：世界排行榜云函数，按当前微信 `OPENID` 写入并读取 `world_leaderboard` 云数据库集合。
- `cloudfunctions/levelEditorDrafts`：关卡编辑器草稿同步云函数，按当前微信 `OPENID + levelId` 写入独立 `level_editor_drafts` 集合；禁止访问或修改线上静态关卡包。
- `build-templates/wechatgame/cloudfunctions/`：构建模板中的云函数。
- `tools/wechat-minigame-loading-patch.js`：微信官方封面图插件 `MinigameLoading` 构建后装配脚本，写入 `game.json` 插件声明、修补 `game.js`/`main.js` 启动与销毁逻辑，并复制 `images/loading_bg.jpg`。
- `tools/build-wechat-gameplay-code.js`：微信小游戏局内玩法源码打包脚本；从 `gameplay-src` 生成 `assets/game/generated/lazy-gameplay-code.js`，构建后校验其 sha256 源码哈希存在于 `subpackages/game/game.js`，同时拒绝旧 `main.js` 同步 require 和 JS/JSON 双份发布。
- `open-data/`：历史微信开放数据域排行榜逻辑。当前世界排行榜不再依赖开放数据域。
- `settings/wechatgame.json`：微信小游戏构建相关设置。

微信能力在运行时代码中主要通过 `WechatShareService`、`FriendGiftService`、`GameCircleButtonAdapter`、`WorldLeaderboardService`、`AdService` 进入。

## 工具与校验

`package.json` 提供以下校验脚本：

- `npm run validate:stamina`
- `npm run validate:levels`
- `npm run validate:level-sync`
- `npm run validate:level-editor`
- `npm run validate:aim`
- `npm run validate:shots`
- `npm run validate:fairy-gameplay`
- `npm run validate:swirl`
- `npm run validate:wormhole`
- `npm run validate:vine-spirit`
- `npm run validate:gameplay-bundle`
- `npm run validate:release`
- `npm run generate:levels1000`
- `npm run generate:levels-first100`
- `npm run redesign:relaxed-campaign`
- `npm run redesign:trapped-rescue`
- `npm run generate:floating-map`
- `npm run clean:wechat-cloudfunctions`
- `npm run build:wechat-gameplay-code`
- `npm run validate`

微信构建前如果 `build/wechatgame/cloudfunctions` 残留导致 Cocos 报 `ENOTEMPTY`，先运行 `npm run clean:wechat-cloudfunctions` 清理构建产物云函数目录。
修改休闲解压版 1000 关设计策略后，优先运行 `npm run redesign:relaxed-campaign` 重新同步 `LEVEL_CONFIG_TABLE_1_1000.csv`、本地首 10 关、根目录 `levels` 镜像、`remote-level-packs` 远程 compact 关卡包、`remote-level-packs/level_manifest.json` 和本地 bootstrap manifest；仅改底层生成器且不需要重写 CSV 时再运行 `npm run generate:levels1000`。修改浮岛地图资源、容量表、救援关排期或 1000 关地图规划后，运行 `npm run generate:floating-map` 重新生成 `assets/map/config/floating_map.json`；生成器会从 `campaign-level-generation-config.js` 读取救援关排期并强制这些关卡独占 `landmark1`。修改关卡、瞄准、射击、发布配置或体力相关逻辑后，优先运行对应校验。

## 修改建议

接手任务时建议顺序：

1. 先读本文件，确认模块边界。
2. 再读 `AGENTS.md`，确认 Fail-Fast 约束。
3. 使用 CodeGraph 查找真实调用链。
4. 只阅读和修改与任务直接相关的文件。
5. 不做无关重构。
6. 不添加兜底逻辑，除非任务明确要求。
