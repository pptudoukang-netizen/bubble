# HANDOFF（当前交接文档）

更新时间：2026-04-22  
项目路径：`E:/cocos_project/bubble`

## 1. 当前版本结论
本轮迭代已从“关卡加载异常 + 关卡选择流程不完整 + 音频体验不一致”推进到“可用主流程版本”。  
当前已完成关卡选择页、地图翻页、游戏内 HUD/底部道具、设置页交互、危险线逻辑、计分逻辑和主要音效事件的串联修正。

## 2. 本轮已完成内容

### 2.1 关卡选择与地图翻页
- 关卡入口流程已调整为：启动后先进入 `LevelView`，并在 `LevelView/map` 下实例化地图预制体。
- 地图翻页按钮 `next_map/previous_map` 逻辑已修复，且无上一张/下一张时会隐藏对应按钮。
- 地图加载从“写死两张”改为按序自动尝试 `LevelMap1~LevelMap10`，已支持新增 `LevelMap3`。
- 地图翻页按钮补充 `uiClick` 点击音效。

### 2.2 关卡按钮状态与视觉规则
- 关卡按钮状态切图已按规则落地：
- 锁定关卡：`level_lock`
- 已玩过关卡：`level_bg`
- 可进入但未玩过：`level_lock1`
- 已去掉关卡按钮选中外框效果（`CurrentHighlight` 不显示）。
- 锁定关卡不显示关卡数字；已解锁/可进入关卡才显示数字。
- 关卡按钮尺寸已固定为 `120x120`，切图后保持不变。

### 2.3 游戏场景 UI 与层级
- `GameView` 新结构已接入（背景、`HudPanel`、`DangerLine`、底部按钮区）。
- `DangerLine` 层级已调整为“背景之上、其他 UI 之下”。
- 危险线位置按需求调整：距离底部基线 + 二次上移后生效。
- 危险线显示逻辑已更新：仅在“距离危险线只剩一次下降空间”时显示并进入抖动/变色警告，远离时隐藏。

### 2.4 底部道具与资源逻辑
- 底部增加返回按钮、彩虹球按钮+计数、炸弹按钮+计数。
- 获取道具后不直接消耗，先累计；点击对应道具后再替换炮台当前球。

### 2.5 设置页与音频控制
- 设置页关闭规则已改为：仅 `关闭按钮` 与 `返回按钮` 可关闭，点击其他区域不关闭。
- `btn_recover` 恢复默认已实现（音乐开、音效开、音量最大）。
- 音乐/音效加减按钮与进度星星跟随已实现。
- 支持拖动星星调节音量。
- 音乐/音效/震动开关状态“开/关”与 `status` 节点 X 坐标已按规则实现（开 `-18`，关 `18`）。
- 支持点击音量图标快速归零，并切换 `volume_open/volume_close` 图标。

### 2.6 计分与音效事件
- 计分逻辑已改为“仅入缸收集加分”，去掉了发射、附着、匹配、炸弹等直接加分入口。
- 新增入缸底收集事件音效：球落入缸底被收集时播放 `ding0`。
- 入缸底音效已做成面板配置项：`jarCollectBottomSfxResource`（默认 `sound/ding0`）。
- 缸口碰撞音效改为每次碰撞都可触发（移除会吞音效的冷却门控条件）。

### 2.7 资源与加载修复
- 修复关卡内背景资源路径错误：`image/bg` 改为有效资源 `image/game_bg`。
- 同步了根目录 `levels` 到 `assets/resources/config/levels`，覆盖并新增到 `level_030`。
- `SettingView.prefab` 缺失 UUID 引用已替换为有效资源 UUID，避免设置页加载报错。

### 2.8 体力与调试面板
- 爱心体力测试值已开放到 `GameBootstrap` 面板（`inspectorStaminaValue`）。
- 新增“启动时重置通关进度”面板开关：`resetLevelProgressOnStart`。

### 2.9 Web 手机浏览器无声修复（进行中）
- 已增加 WebAudio 解锁逻辑：
- `playBgm/playSfx` 前尝试 `AudioContext.resume()`
- 绑定全局用户手势事件进行解锁重试
- 解锁后做一次静音 buffer warmup
- 首次解锁成功后自动恢复当前 BGM
- 该问题在用户实机反馈中“仍有无声场景”，属于当前首要待验证项。

## 3. 关键改动文件
- `assets/scripts/bootstrap/LevelSelectView.js`
- `assets/scripts/bootstrap/GameBootstrap.js`
- `assets/scripts/bootstrap/GameBootstrapUiFlowMethods.js`
- `assets/scripts/core/GameManager.js`
- `assets/scripts/core/GameManagerShotResolutionMethods.js`
- `assets/scripts/systems/FallingMarbleSystem.js`
- `assets/scripts/render/LevelRenderer.js`
- `assets/scripts/render/LevelRendererSceneMethods.js`
- `assets/scripts/audio/AudioManager.js`
- `assets/scripts/utils/LevelProgressStore.js`
- `assets/resources/prefabs/ui/SettingView.prefab`
- `assets/resources/config/levels/level_014.json` ~ `level_030.json`

## 4. 本地验证记录
本轮已执行的快速验证：
- `node` 语法检查通过：
- `assets/scripts/bootstrap/LevelSelectView.js`
- `assets/scripts/bootstrap/GameBootstrap.js`
- `assets/scripts/bootstrap/GameBootstrapUiFlowMethods.js`
- `assets/scripts/core/GameManager.js`
- `assets/scripts/core/GameManagerShotResolutionMethods.js`
- `assets/scripts/systems/FallingMarbleSystem.js`
- `assets/scripts/render/LevelRenderer.js`
- `assets/scripts/render/LevelRendererSceneMethods.js`
- `assets/scripts/audio/AudioManager.js`
- 关卡文件同步后做过源/目标哈希一致性检查：`SYNC_OK`

## 5. 风险与待办
- 手机浏览器无声：代码已多轮加固，但需实机复测确认（Android Chrome / iOS Safari）。
- 新增关卡 JSON（`level_021~030`）在资源目录下首次导入需要 Editor 生成 `.meta`（刷新资源库可自动生成）。
- 本轮变更多，建议做一次完整回归：关卡选择 -> 进关 -> 掉落入缸 -> 胜负页 -> 返回关卡。

## 6. 建议接手验证顺序
1. 实机验证 Web 音频：首次触摸后 `BGM + SFX` 是否恢复正常。  
2. 连续测试缸口碰撞音：确认每次碰撞都播，且不会爆音。  
3. 验证计分只在入缸增长：发射/附着/消除过程分数保持不变。  
4. 验证三张地图翻页与按钮音效：`LevelMap1 -> LevelMap2 -> LevelMap3`。  
5. 在 Cocos Editor 刷新资源，确认 `level_021~030` 的 `.meta` 自动生成并可被加载。
