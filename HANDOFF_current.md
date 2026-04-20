# HANDOFF（阶段性交接文档）

更新时间：2026-04-20  
项目路径：`E:/cocos_project/bubble`

## 1. 阶段结论
当前版本已从“可玩主链路完成，性能/手感收口”推进到“性能 / 星级 / 音频三线并行收口”阶段：
- 主流程完整：启动加载 -> 关卡选择 -> 战斗 -> 掉落结算 -> Win/Lose。
- 玩法主变更已稳定：由“消除”改为“命中后直接掉落并入缸结算”。
- 棋盘下压的主要性能热点已完成第一轮优化，整板重建问题已移除。
- 星级系统已从“剩余发射球数驱动”切换为“每关目标分数驱动”。
- 音频基础设施已接入，选关 / 战斗 BGM 已分离，核心 SFX 链路已跑通。

## 2. 本阶段已完成内容

### 2.1 玩法与时序
- 匹配命中不再直接消失，改为统一进入掉落系统。
- 技能球参与掉落，且“必须实际入缸”才计为有效生效。
- 步数耗尽时若仍有掉落球，会等待掉落完全结束后再判定胜负。
- 固定球下压延迟到命中碰撞反馈完成后执行，避免视觉偏差。
- 缸口反弹速度改为单调衰减口径，避免“越弹越快”。

### 2.2 UI / 交互 / 星级
- 启动先进入关卡选择界面，`Level_btn` 动态生成关卡节点。
- 关卡按钮支持：
- 当前关高亮。
- 已通过关卡显示 0~3 星。
- 未通过关卡灰态显示。
- HUD 新增星级进度条：
- 初始状态星星灰显。
- 分数达到阈值时实时点亮对应星星。
- WinView 星级展示已改为读取实时分数星级，不再使用剩余球逻辑。
- 星级口径已统一为：
- 1 星：`targetScore * 1 / 3`
- 2 星：`targetScore * 2 / 3`
- 3 星：`targetScore`

### 2.3 底部缸体与掉落表现
- JarItem 规格为 `237x230`。
- 缸口左右碰撞区各 `40`（从边界向内）。
- 缸体前景遮罩层（`颜色_jar_mask.png`）在掉落球上方。
- 掉落球下沉至缸底后才消失，2D 视觉遮挡正确。
- 掉落层级前置到固定球前方（遮罩仍在其上方）。

### 2.4 性能与稳定性
- 掉落球渲染路径已做节点复用、回收和瞬时创建削减。
- 命中邻居后推动效加入预算控制，掉落密集时自动降载。
- 修复偶发“掉落球卡在两缸缝隙”问题：
- 增加缝隙吸附 / 向缸中心收敛。
- 增加卡滞检测与超时强制结算兜底。
- 增加缸口反弹次数上限后的收敛策略。
- 棋盘下压性能优化已落地：
- `BoardLayer` 不再 `clearChildren + 全量重建`。
- 改为按 `cell.id` 复用棋盘泡泡节点，只更新位置和视觉。
- `testGrid` 调试层也已改为节点复用。
- 底部缸体层刷新已按实际变化收紧条件。

### 2.5 配置 / 工具链
- `level.targetScore` 已成为显式配置字段。
- `assets/resources/config/levels/level_001 ~ level_020.json` 已全部补齐 `targetScore`。
- `levels/` 镜像目录已同步。
- `LevelConfigLoader` 已标准化读取 `targetScore`。
- `validate-level-content.js` 已校验 `targetScore` 必填且为正整数。
- `LEVEL_CONFIG_SPEC.md` 已同步更新目标分和星级口径说明。
- `LevelProgressStore` 已新增 `completedLevels`，将通关与星数解耦。

### 2.6 音频
- 新增 `assets/scripts/audio/AudioManager.js`
- 新增 `assets/scripts/audio/AudioSettingsStore.js`
- 已支持：
- 背景音乐 / 音效开关与音量控制
- 本地持久化
- 资源预加载
- BGM / SFX 分通道播放
- 当前 BGM 配置：
- 选关页：`sound/level_bg`
- 游戏界面：`sound/game_bg`
- 当前已接入 SFX 节点：
- UI 点击
- 进入关卡
- 发射
- 胜利
- 失败
- 掉落玻璃球与缸口反弹碰撞时，随机播放 `ding0 ~ ding5`

## 3. 最新改动（本次交接前）
- 完成棋盘下压性能优化，实测 FPS 下降问题已有明显改善。
- 完成 HUD 实时星级进度条接入。
- 完成星级目标分配置化：
- 运行时按 `targetScore` 计算星级。
- WinView / 选关 / 存档统一同一星级口径。
- 完成音频管理器接入与双场景 BGM 切换。
- 完成掉落球碰缸口随机 `ding0~ding5` 音效接入。
- `node tools/validate-level-content.js` 已通过 `1~20` 关。

## 4. 关键文件（本阶段高频）
- `assets/scripts/bootstrap/GameBootstrap.js`
- `assets/scripts/core/GameManager.js`
- `assets/scripts/render/LevelRenderer.js`
- `assets/scripts/systems/FallingMarbleSystem.js`
- `assets/scripts/config/BoardLayout.js`
- `assets/scripts/config/LevelConfigLoader.js`
- `assets/scripts/audio/AudioManager.js`
- `assets/scripts/audio/AudioSettingsStore.js`
- `assets/scripts/utils/LevelProgressStore.js`
- `assets/resources/config/levels/level_001.json` ~ `level_020.json`
- `tools/validate-level-content.js`
- `tools/analyze-level-curve.js`
- `LEVEL_CONFIG_SPEC.md`

## 5. 当前参数 / 规则口径（接手先看）
- 发射速度：`BoardLayout.projectileSpeed`
- 命中邻居后推速度：`BoardLayout.impactBounceSpeed`
- 缸口反弹速度：`BoardLayout.jarRimBounceSpeed`
- 缸口反弹衰减：`rimBounceDecay`（支持关卡 / 全局覆盖）
- 缝隙吸附与兜底：`jarGapAttractAccel`、`jarGapMaxSpeed`、`maxDropLifeTime`、`stuckTimeThreshold`
- 星级规则：`level.targetScore`
- 1 星：`targetScore / 3`
- 2 星：`targetScore * 2 / 3`
- 3 星：`targetScore`
- BGM：
- 选关页：`sound/level_bg`
- 游戏页：`sound/game_bg`

## 6. 已知风险与注意事项
- 参数联动较强，单改某一个速度 / 衰减会影响整体手感。
- `targetScore` 当前初值沿用旧推导目标分，后续可能还需按关卡体验人工微调。
- 若继续增强碰撞反馈，要同步关注低端机帧率波动和音效触发密度。
- 缸口 `ding` 当前是“每次 rim bounce 随机播放”，如后续反馈过密，可增加节流或概率抽样。
- 音频设置入口目前只有底层能力，尚未在 UI 中暴露面板。

## 7. 建议接手顺序
1. 先跑回归：选关 -> 开局 -> 多球掉落 -> Win/Lose 结算链路。
2. 专项验证棋盘下压性能：重点看触发下压的那一帧是否仍有尖峰。
3. 专项验证星级：HUD / Win / 选关三处显示是否一致。
4. 专项验证音频：
- 选关页是否稳定播放 `level_bg`
- 进入战斗是否切到 `game_bg`
- 缸口随机 `ding` 是否正常、不过密
5. 根据体验结果微调 `targetScore`、`jarRimBounceSpeed`、`rimBounceDecay`。

## 8. 本地验证建议命令
- `node --check assets/scripts/bootstrap/GameBootstrap.js`
- `node --check assets/scripts/core/GameManager.js`
- `node --check assets/scripts/render/LevelRenderer.js`
- `node --check assets/scripts/systems/FallingMarbleSystem.js`
- `node --check assets/scripts/config/LevelConfigLoader.js`
- `node --check assets/scripts/audio/AudioManager.js`
- `node --check assets/scripts/audio/AudioSettingsStore.js`
- `node tools/validate-level-content.js`
