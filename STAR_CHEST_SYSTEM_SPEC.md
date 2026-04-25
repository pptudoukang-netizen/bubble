# 星星宝箱系统设计文档（V1）

更新时间：2026-04-25
项目路径：`E:/coco_project/bubble`

## 1. 设计目标

星星宝箱系统用于把关卡星级转化为长期成长奖励，让玩家在追求更高星级时有明确回报。

V1 目标：
- 玩家累计获得指定数量星星后，可以开启 1 次星星宝箱。
- 星星来源复用现有关卡结算星级，不新增关卡评分规则。
- 奖励只发放当前项目已有资源：金币、体力、4 类救场道具。
- 支持老玩家按历史星星数补领可开启次数。
- 使用独立存档记录宝箱开启状态，不污染关卡进度、签到、背包和转盘状态。

V1 不做：
- 付费宝箱、广告加倍、分享加倍。
- 限时赛季星星、排行榜星星。
- 宝箱等级、复杂保底、动态概率。
- 新道具、新货币、新皮肤。

## 2. 当前系统接入点

现有能力：
- `StarRatingPolicy`：根据通关快照计算 0~3 星。
- `LevelProgressStore`：记录 `completedLevels` 与 `starsByLevel`，每关只保存历史最高星级。
- `GameBootstrapUiFlowMethods._recordCurrentLevelWin`：通关成功后计算星级并写入关卡进度。
- `PlayerResourceStore`：管理体力与金币。
- `InventoryStore`：管理 `swap_ball`、`rainbow_ball`、`blast_ball`、`barrier_hammer`。
- `TelemetryService`：可用于记录宝箱曝光、开启和发奖结果。
- `TipsPresenter`：可用于展示开启结果提示。

星星宝箱不直接修改 `StarRatingPolicy`，也不改变 `LevelProgressStore.recordCompletion` 的语义。系统只读取 `starsByLevel` 计算累计星星，并用自己的存档记录已经消耗过的星星进度。

## 3. 核心规则

V1 推荐规则：
- 每累计 `15` 颗星星，可以开启 `1` 次星星宝箱。
- 星星只按每关历史最高星级计算。
- 重复通关同一关时，只有刷新历史最高星级的差值才会增加可开宝箱进度。
- 开启宝箱只消耗“宝箱进度”，不减少选关页展示的关卡星级。
- 当玩家已有历史星星时，首次进入系统应按历史总星数计算可开启次数。

示例：
- 第 1 关从 0 星变为 3 星，累计进度 +3。
- 第 1 关从 2 星提升到 3 星，累计进度只 +1。
- 第 1 关已经 3 星，再次 3 星通关，累计进度 +0。
- 总星数 32，已消耗星星进度 15，则剩余进度 17，可开启 1 次，开启后已消耗进度变为 30。

## 4. 推荐参数

| 参数 | V1 推荐值 | 说明 |
| --- | ---: | --- |
| 每次开启所需星星 | 15 | 前 30 关最多 90 星，可开启 6 次，节奏清晰 |
| 单次开启奖励格数 | 1 | V1 保持简单，避免结算弹窗复杂 |
| 是否允许连续开启 | 是 | 当可开启次数大于 1 时支持逐次开启，也可后续扩展一键开启 |
| 是否消耗关卡星级 | 否 | 只消耗宝箱进度，不影响地图星星显示 |
| 是否显示红点 | 是 | 有可开启次数时显示 |
| 是否支持补领 | 是 | 根据历史 `starsByLevel` 计算 |

阈值选择理由：
- 10 星过快，前期宝箱过密，容易挤压签到和闯关有礼的奖励感。
- 20 星偏慢，玩家需要较多关卡才能体验第一次开启。
- 15 星约等于 5 个满星关卡，适合作为 V1 的长期轻目标。

## 5. 奖励内容

V1 使用固定权重奖励池。每次开启命中 1 个奖励项。

| 奖励项 ID | 奖励 | 数量 | 权重 | 概率 |
| --- | --- | ---: | ---: | ---: |
| `coin_120` | 金币 | 120 | 2400 | 24% |
| `coin_200` | 金币 | 200 | 1600 | 16% |
| `stamina_1` | 体力 | 1 | 1200 | 12% |
| `swap_ball_1` | 换球 | 1 | 1600 | 16% |
| `rainbow_ball_1` | 彩虹球 | 1 | 1000 | 10% |
| `blast_ball_1` | 炸裂球 | 1 | 800 | 8% |
| `barrier_hammer_1` | 破障锤 | 1 | 800 | 8% |
| `coin_100_swap_1` | 金币 + 换球 | 100 + 1 | 600 | 6% |

奖励设计原则：
- 金币占比最高，保证每次开启都有稳定价值。
- `swap_ball` 权重较高，作为基础救场补给。
- `rainbow_ball`、`blast_ball`、`barrier_hammer` 权重较低，避免过早破坏关卡压力。
- 小组合奖励保留惊喜感，但权重低于单项奖励。
- 单次宝箱期望价值应低于“闯关有礼”阶段大奖，避免主线里程碑奖励失去存在感。

## 6. 配置结构建议

后续实现时可新增 `assets/scripts/config/StarChestConfig.js`：

```js
"use strict";

module.exports = {
  enabled: true,
  activityId: "star_chest_v1",
  title: "星星宝箱",
  starsPerChest: 15,
  showRedDotWhenOpenable: true,
  maxClaimLogs: 20,
  rewards: [
    {
      rewardId: "coin_120",
      weight: 2400,
      rewardItems: [
        { id: "coin", count: 120 }
      ]
    },
    {
      rewardId: "coin_200",
      weight: 1600,
      rewardItems: [
        { id: "coin", count: 200 }
      ]
    },
    {
      rewardId: "stamina_1",
      weight: 1200,
      rewardItems: [
        { id: "stamina", count: 1 }
      ]
    },
    {
      rewardId: "swap_ball_1",
      weight: 1600,
      rewardItems: [
        { id: "swap_ball", count: 1 }
      ]
    },
    {
      rewardId: "rainbow_ball_1",
      weight: 1000,
      rewardItems: [
        { id: "rainbow_ball", count: 1 }
      ]
    },
    {
      rewardId: "blast_ball_1",
      weight: 800,
      rewardItems: [
        { id: "blast_ball", count: 1 }
      ]
    },
    {
      rewardId: "barrier_hammer_1",
      weight: 800,
      rewardItems: [
        { id: "barrier_hammer", count: 1 }
      ]
    },
    {
      rewardId: "coin_100_swap_1",
      weight: 600,
      rewardItems: [
        { id: "coin", count: 100 },
        { id: "swap_ball", count: 1 }
      ]
    }
  ]
};
```

配置规则：
- `starsPerChest` 必须为正整数。
- `rewardId` 必须唯一。
- `weight` 必须为正整数。
- `rewardItems` 支持 `coin`、`stamina` 和当前背包支持的 4 类道具。
- 禁止配置空奖励。
- V1 总权重建议保持 10000，便于策划阅读概率。

## 7. 玩家存档结构

建议新增独立存档 key：`bubble_star_chest_state_v1`。

```json
{
  "version": 1,
  "activityId": "star_chest_v1",
  "consumedStars": 15,
  "openedCount": 1,
  "lastOpenAt": 1713931200000,
  "openLogs": [
    {
      "openId": "star_chest_1713931200000_0001",
      "totalStarsAtOpen": 32,
      "consumedStarsAfterOpen": 15,
      "rewardId": "swap_ball_1",
      "rewardItems": [
        { "id": "swap_ball", "count": 1 }
      ],
      "timestamp": 1713931200000
    }
  ]
}
```

字段规则：
- `consumedStars`：已经用于开启宝箱的星星进度，必须为非负整数。
- `openedCount`：历史开启次数，仅用于展示和埋点，不参与核心校验。
- `openLogs`：仅保留最近 `maxClaimLogs` 条，避免本地存档膨胀。
- 可开启次数实时计算，不需要存储。

核心计算：
```js
totalStars = sum(levelProgress.starsByLevel);
availableStars = Math.max(0, totalStars - starChestState.consumedStars);
openableCount = Math.floor(availableStars / config.starsPerChest);
progressStars = availableStars % config.starsPerChest;
```

如果配置版本升级并调整 `starsPerChest`，V1 建议保持旧存档继续按 `consumedStars` 计算，不重置玩家进度。若改动幅度较大，应使用新的 `activityId`。

## 8. 状态计算

星星宝箱入口与面板需要 3 类状态：

| 状态 | 条件 | UI 表现 |
| --- | --- | --- |
| `locked` | `totalStars <= 0` 且 `openableCount === 0` | 显示 0/15，按钮置灰 |
| `progressing` | `openableCount === 0` 且已有进度 | 显示 `progressStars/starsPerChest`，按钮置灰 |
| `openable` | `openableCount > 0` | 按钮高亮，入口红点 |

补充规则：
- 当 `openableCount > 1` 时，按钮文案仍显示“开启”，旁边展示“可开启 xN”。
- 打开一次后重新计算进度与可开启次数。
- 红点只在 `openableCount > 0` 时显示。

## 9. 模块拆分

### 9.1 StarChestConfig

职责：
- 定义星星阈值、奖励池、活动开关和日志数量。
- 由服务层读取，不在 UI 中硬编码数值。

### 9.2 StarChestStore

职责：
- 读取与保存星星宝箱存档。
- 规范化坏存档。
- 记录开启日志。

核心接口：
- `load()`
- `save(state)`
- `normalizeState(raw)`
- `appendOpenLog(state, log, maxLogs)`

### 9.3 StarChestService

职责：
- 从 `LevelProgressStore` 的 `starsByLevel` 计算总星星。
- 计算当前进度、可开启次数和红点状态。
- 执行开启校验、奖励抽取、奖励发放和状态保存。

核心接口：
- `getChestSummary(levelProgress)`
- `hasOpenableChest(levelProgress)`
- `canOpen(levelProgress)`
- `openChest(levelProgress, now)`
- `calculateTotalStars(levelProgress)`

### 9.4 StarChestRewardService

职责：
- 按权重命中奖励项。
- 发放 `coin`、`stamina` 到 `PlayerResourceStore`。
- 发放道具到 `InventoryStore`。
- 发放失败时返回明确错误，不写入已开启状态。

建议 `reason` 固定为：
- `star_chest_open`

### 9.5 StarChestViewController

职责：
- 渲染宝箱面板、星星进度条、可开启次数和奖励结果。
- 处理开启按钮点击。
- 开启成功后刷新入口红点、顶部资源与背包状态。

## 10. 开启流程

开启 1 次星星宝箱：
1. 读取 `LevelProgressStore` 当前关卡星级进度。
2. 读取 `StarChestStore` 当前宝箱存档。
3. 计算 `totalStars`、`availableStars`、`openableCount`。
4. 校验 `openableCount > 0`。
5. 按配置权重抽取奖励。
6. 发放奖励到金币、体力或背包。
7. 将 `consumedStars += starsPerChest`，`openedCount += 1`。
8. 写入 `openLogs`。
9. 保存星星宝箱存档。
10. 刷新 UI、入口红点、顶部资源与背包状态。

重要规则：
- 奖励发放失败时，不增加 `consumedStars`。
- 存档保存失败时，应提示“开启失败，请重试”，避免玩家误以为奖励已到账。
- 不允许仅依赖按钮置灰防重复开启，服务层必须校验 `openableCount`。

## 11. UI 设计建议

入口：
- 放在选关页功能入口区，与签到、背包、转盘、闯关有礼同级。
- 推荐图标：宝箱 + 星星。
- 有可开启次数时显示红点。

面板结构：
- 顶部：标题“星星宝箱”和关闭按钮。
- 中部：宝箱主体、当前进度 `x/15`、进度条。
- 右侧或下方：可开启次数，例如“可开启 x2”。
- 底部：开启按钮和可能获得的奖励预览。

按钮状态：
- `locked` / `progressing`：按钮置灰，文案“继续收集”。
- `openable`：按钮高亮，文案“开启”。
- 开启动画中：按钮禁用，避免重复点击。

奖励反馈：
- 开启后弹出结果：例如“获得：金币 x120”或“获得：换球 x1”。
- 若命中组合奖励，逐项展示。
- 结果弹窗关闭后，面板进度立即刷新。

## 12. 与其他系统关系

关卡星级：
- 星星宝箱只读取 `starsByLevel`，不改变星级评分和关卡展示。
- 刷新历史最高星级时，宝箱进度自然增长。

闯关有礼：
- 闯关有礼奖励“达到关卡里程碑”。
- 星星宝箱奖励“累计星级表现”。
- 两者可以同时存在，但星星宝箱单次价值应低于里程碑大奖。

每日任务：
- 每日任务里的 `earn_star` 只统计当日行为。
- 星星宝箱统计历史累计星星，两者不共享存档。

幸运转盘：
- 转盘是每日随机福利。
- 星星宝箱是长期星级目标。
- 两者奖励池可复用资源，但宝箱不使用每日次数。

背包与商城：
- 星星宝箱会产出救场道具，因此高价值道具权重应低于金币与基础道具。
- 宝箱产出不应比商城购买更稳定，避免削弱金币消费意义。

## 13. 埋点建议

推荐事件：
- `star_chest_open_panel`
- `star_chest_progress_exposed`
- `star_chest_open_click`
- `star_chest_open_success`
- `star_chest_open_fail`
- `star_chest_reward_grant`

关键字段：
- `activity_id`
- `total_stars`
- `consumed_stars`
- `available_stars`
- `stars_per_chest`
- `openable_count`
- `reward_id`
- `reward_items`
- `fail_reason`

## 14. 错误码

- `STAR_CHEST_DISABLED`
- `STAR_CHEST_NOT_ENOUGH_STARS`
- `STAR_CHEST_REWARD_POOL_EMPTY`
- `STAR_CHEST_REWARD_INVALID`
- `STAR_CHEST_REWARD_GRANT_FAILED`
- `STAR_CHEST_SAVE_FAILED`
- `STAR_CHEST_STATE_INVALID`

## 15. 测试验收清单

功能：
- 新玩家 0 星时，宝箱进度显示 `0/15`，按钮不可点。
- 累计获得 15 星后，入口显示红点，面板显示可开启 1 次。
- 总星数 30 且未开启过时，显示可开启 2 次。
- 开启 1 次后，`consumedStars` 增加 15，可开启次数正确减少。
- 已有历史星星的老玩家首次打开时，可以按总星数补领开启次数。
- 重复通关已满星关卡，不增加宝箱可开启次数。
- 单关从 1 星提升到 3 星后，总星数只增加 2。

奖励：
- 命中奖励后，金币、体力或背包数量正确增加。
- 未知奖励 ID 不发放，并返回错误。
- 奖励发放失败时，不写入 `consumedStars`。
- 组合奖励能逐项到账并正确展示。

边界：
- `starsPerChest` 为 0 或负数时，系统应禁用并报配置错误。
- 奖励池为空时不能开启。
- 本地存档损坏时恢复默认状态，不影响游戏启动。
- `consumedStars` 大于当前总星数时，进度显示为 0，不出现负数。

体验：
- 可开启时红点稳定显示，开启后按剩余次数刷新。
- 连续开启时不会重复点击造成多发奖励。
- 奖励结果与实际到账一致。
- 顶部金币、体力和背包入口在开启后刷新。

## 16. 推荐实现顺序

1. 新增 `StarChestConfig.js`。
2. 新增 `StarChestStore`，完成存档读写与规范化。
3. 新增 `StarChestService`，完成总星数、进度和可开启次数计算。
4. 接入 `StarChestRewardService`，复用金币、体力和背包发放逻辑。
5. 在选关页增加星星宝箱入口与红点。
6. 制作 `StarChestView` prefab 和 `StarChestViewController`。
7. 通关记录更新后刷新入口红点。
8. 补充埋点与回归测试。

## 17. 一句话结论

星星宝箱 V1 应定位为“累计星级表现奖励”：玩家每获得 15 颗星即可开启 1 次宝箱，奖励从金币、体力和现有救场道具中按权重产出，既鼓励满星挑战，又不改变现有关卡星级、背包和活动系统的边界。
