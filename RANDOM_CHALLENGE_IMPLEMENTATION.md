# Random Challenge Implementation

## 功能定位

随机挑战是独立于主线 1-1000 关的挑战模式。每次从选关页点击“随机挑战”都会生成一个新的 seed，并由 seed 生成一份标准 `levelConfig`，再复用现有局内链路：

`RandomChallengeGenerator` -> `LevelConfigLoader.normalizeLevelConfig` -> `GameManager.startLevel` -> `LevelRenderer.renderLevel`

随机挑战不会写入 `LevelProgressStore`，不会解锁主线关卡，也不会修改主线选中关卡。
随机挑战胜利会按随机挑战档位配置发放奖励。

## 入口

入口使用 `LevelView.prefab` 里的现有节点：

- 节点名：`break_through_btn`
- 绑定方法：`GameBootstrapLevelSelectFlowMethods._onLevelSelectRandomChallengeTap`

`LevelSelectView` 渲染时会严格查找并绑定 `break_through_btn`；该节点缺失时直接报错，不再运行时创建入口按钮。

## 核心文件

- `assets/scripts/config/RandomChallengeRules.js`
  - 定义随机挑战固定 `levelId = 1001`、`levelKey = level_1001`、模式名、生成器版本、难度档位和奖励。
- `assets/scripts/config/RandomChallengeGenerator.js`
  - 使用 seed 生成颜色池、棋盘布局、目标、射击数、分数、罐子、掉落间隔和奖励字段。
- `assets/scripts/config/RandomChallengeManager.js`
  - 调用生成器并复用 `LevelConfigLoader.normalizeLevelConfig` 做严格校验。
  - 对原始生成配置生成稳定 `configHash`，用于日志和后续排行榜/问题定位。
- `assets/scripts/utils/RandomChallengeStore.js`
  - 保存随机挑战本地最佳分和最近一次完成记录。
- `assets/scripts/config/LevelManager.js`
  - 暴露 `createRandomChallengeRun(options)`。
- `assets/scripts/bootstrap/GameBootstrapLevelSelectFlowMethods.js`
  - 启动随机挑战、记录随机挑战胜利、按随机挑战配置发奖励、跳过主线进度。
- `assets/scripts/bootstrap/GameBootstrapLevelRuntimeMethods.js`
  - 随机挑战“重玩”复用同一个 seed。
- `assets/scripts/bootstrap/GameBootstrapStatusResourceFlowMethods.js`
  - 随机挑战“下一关”生成新 seed；返回选关不定位到 `level_1001`。

## 运行规则

### 新挑战

点击选关页“随机挑战”：

1. 根据当前 `highestUnlockedLevel` 选择难度档位。
2. 创建新 seed。
3. 生成标准关卡配置。
4. 通过 `LevelConfigLoader.normalizeLevelConfig(rawConfig, "level_1001")` 校验。
5. 进入局内。

### 重玩

结果页点击重玩：

1. 使用当前 run context 里的 seed。
2. 重新生成同一张随机图。
3. 直接进入局内。

### 下一关

结果页点击下一关：

1. 生成新 seed。
2. 进入一张新的随机图。

## 存档边界

随机挑战只写：

- `RandomChallengeStore.bestScoresByTier`
- `RandomChallengeStore.lastRun`
- `PlayerResourceStore` 中配置的随机挑战奖励

随机挑战不写：

- `LevelProgressStore.completedLevels`
- `LevelProgressStore.starsByLevel`
- `LevelProgressStore.bestScoresByLevel`
- `LevelProgressStore.highestUnlockedLevel`
- `LevelProgressStore.selectedLevelId`

## 难度档位

难度在 `RandomChallengeRules.TIERS` 中配置，按主线最高解锁关卡选择：

- 档 1：`highestUnlockedLevel >= 1`
- 档 2：`highestUnlockedLevel >= 16`
- 档 3：`highestUnlockedLevel >= 51`
- 档 4：`highestUnlockedLevel >= 121`

每档控制：

- `rowCount`
- `colorCount`
- `fillRate`
- `shotLimit`
- `targetScore`
- `dropInterval`
- `targetCollectRatio`
- `rewardItems`

`rewardItems` 会写入生成关卡的 `level.clearRewardItems`，随机挑战胜利时会完整发放并显示在 WinView 中。当前支持：

- `{ id: "coin", count: N }`
- `{ id: "stamina", count: N }`

## Fail-Fast 约束

随机挑战生成失败、字段缺失、seed 非法、配置无法通过 `LevelConfigLoader` 校验时，必须直接抛错。禁止回退到固定关卡、空棋盘、默认配置或静默失败。

## 后续扩展建议

每日挑战或排行榜版本应由云函数下发 seed，客户端生成配置后上报：

- `seed`
- `generatorVersion`
- `difficultyTier`
- `configHash`
- `score`

服务端至少需要校验 `generatorVersion + seed + configHash` 是否匹配，避免玩家上传非当前挑战配置的分数。
