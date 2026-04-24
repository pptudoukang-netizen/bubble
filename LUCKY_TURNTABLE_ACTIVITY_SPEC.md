# 幸运转盘活动设计文档（V1）

更新时间：2026-04-24
项目路径：`E:/cocos_project/bubble`

## 1. 活动目标

幸运转盘用于给玩家提供每日轻量福利入口，补充签到、每日任务、广告奖励和商城之间的资源循环。

V1 目标：
- 每天提供 1 次免费抽奖。
- 支持看广告追加抽奖次数。
- 支持金币抽奖作为轻度金币消耗口。
- 奖励只发放当前项目已有资源：金币、体力、4 类救场道具。
- 使用独立本地存档，避免污染签到、商城、广告限额和背包状态。

V1 不做：
- 付费货币抽奖。
- 服务端奖池下发。
- 实物、皮肤、碎片、累计大奖。
- 分享加次数，避免微信平台策略风险。
- 复杂保底和动态概率调参。

## 2. 现有系统接入点

当前项目已有转盘入口图标：
- `assets/image/icon/icon_turntable.png`

可复用的现有模块：
- `PlayerResourceStore`：发放金币、体力，或扣除金币抽奖成本。
- `InventoryStore`：发放 `swap_ball`、`rainbow_ball`、`blast_ball`、`barrier_hammer`。
- `AdService`：展示激励视频。
- `AdRewardQuotaStore`：可作为广告抽奖次数和冷却的参考实现。
- `TelemetryService`：记录活动曝光、抽奖、领奖和失败。
- `TipsPresenter`：展示抽奖结果提示。

幸运转盘应新增独立配置和状态，不复用签到状态，不占用商城每日限购，不改变广告失败补偿逻辑。

## 3. 活动入口

入口位置：
- 选关页功能入口区，使用 `icon_turntable.png`。
- 与签到、背包、排行榜、每日任务入口保持同一视觉层级。

红点规则：
- 今天还有免费次数时显示红点。
- 抽完免费次数后红点消失。
- 仅剩广告次数或金币次数时不显示红点，避免强打扰。

入口可见条件：
- `LuckyTurntableConfig.enabled === true`。
- V1 默认常驻开放，不做开始/结束日期。

## 4. 抽奖模式

| 模式 | 次数 | 成本 | 红点 | 说明 |
| --- | ---: | --- | --- | --- |
| `free` | 每日 1 次 | 免费 | 显示 | 每天自然日刷新 |
| `ad` | 每日 3 次 | 完整观看激励视频 | 不显示 | 广告失败或未看完不扣次数 |
| `coin` | 每日 5 次 | 金币 120 | 不显示 | 金币不足不可抽 |

抽奖优先级：
1. 若有免费次数，按钮显示“免费抽奖”。
2. 免费次数用完后，若广告可用，按钮显示“看广告抽奖”。
3. 广告次数用完或广告不可用时，显示“120 金币抽奖”。

## 5. 奖池配置

V1 使用 8 格转盘。

推荐奖池：

| 格子 | 奖励 | 数量 | 权重 | 概率 |
| --- | --- | ---: | ---: | ---: |
| 1 | 金币 | 30 | 2200 | 22% |
| 2 | 金币 | 80 | 1800 | 18% |
| 3 | 金币 | 150 | 900 | 9% |
| 4 | 换球 | 1 | 1600 | 16% |
| 5 | 彩虹球 | 1 | 1100 | 11% |
| 6 | 炸裂球 | 1 | 850 | 8.5% |
| 7 | 破障锤 | 1 | 850 | 8.5% |
| 8 | 体力 | 1 | 700 | 7% |

设计理由：
- 金币小奖占比最高，保证每日福利稳定。
- `swap_ball` 权重较高，承担基础救场补给。
- 高价值道具 `blast_ball` 和 `barrier_hammer` 权重较低，避免破坏关卡压力。
- 体力权重较低，避免削弱每日自然恢复和广告补体力价值。

## 6. 配置文件

已新增默认配置：
- `assets/scripts/config/LuckyTurntableConfig.js`

核心结构：

```js
{
  enabled: true,
  activityId: "lucky_turntable_v1",
  dailyFreeSpinLimit: 1,
  dailyAdSpinLimit: 3,
  dailyCoinSpinLimit: 5,
  coinSpinCost: 120,
  segments: [
    {
      segmentId: "coin_30",
      weight: 2200,
      rewardItems: [
        { id: "coin", count: 30 }
      ]
    }
  ]
}
```

配置规则：
- `weight` 必须为正整数。
- 总权重不要求固定为 10000，但 V1 默认按 10000 配置，方便读概率。
- `rewardItems` 支持 `coin`、`stamina` 和当前背包支持的 4 类道具。
- 单个格子 V1 只配置 1 种奖励，方便 UI 展示。

## 7. 玩家存档结构

建议新增独立存档 key：`bubble_lucky_turntable_state_v1`。

```json
{
  "version": 1,
  "dayKey": "2026-04-24",
  "spinCounts": {
    "free": 1,
    "ad": 0,
    "coin": 0
  },
  "lastSpinAt": 1713931200000,
  "spinLogs": [
    {
      "spinId": "turntable_1713931200000_0001",
      "mode": "free",
      "segmentId": "swap_ball_1",
      "rewardItems": [
        { "id": "swap_ball", "count": 1 }
      ],
      "timestamp": 1713931200000
    }
  ]
}
```

字段规则：
- `dayKey`：本地自然日，格式 `YYYY-MM-DD`。
- 日期变化后重置 `spinCounts`。
- `spinLogs` 只保留最近 20 条，避免本地存档膨胀。
- 抽奖结果和奖励发放都成功后再写入日志。

## 8. 模块拆分

### 8.1 LuckyTurntableStore

职责：
- 读取和保存转盘状态。
- 每日跨天重置次数。
- 规范化异常存档。

核心接口：
- `load(now)`
- `save(state)`
- `ensureDailyReset(state, now)`
- `getTodayKey(now)`
- `appendSpinLog(state, log)`

### 8.2 LuckyTurntableService

职责：
- 判断可抽奖模式。
- 扣除金币或等待广告完成。
- 按权重抽奖。
- 发放奖励。
- 写入抽奖次数和日志。

核心接口：
- `getAvailableSpinModes(now)`
- `resolveDefaultSpinMode(now)`
- `canSpin(mode, now)`
- `spin(mode, now)`
- `hasFreeSpin(now)`

### 8.3 LuckyTurntableRewardService

职责：
- 统一发放奖励。
- `coin` 和 `stamina` 写入 `PlayerResourceStore`。
- 道具写入 `InventoryStore`。

核心接口：
- `grantRewardItems(rewardItems, reason)`

建议 `reason`：
- `lucky_turntable_free`
- `lucky_turntable_ad`
- `lucky_turntable_coin`

### 8.4 LuckyTurntableViewController

职责：
- 渲染 8 格转盘、指针、按钮、剩余次数。
- 播放转动动画。
- 在动画结束后展示奖励结果。
- 刷新红点和顶部资源。

## 9. 抽奖流程

免费抽奖：
1. 打开转盘面板。
2. 检查今日免费次数是否剩余。
3. 点击抽奖。
4. 按权重计算中奖格子。
5. 发放奖励。
6. 写入次数和日志。
7. 播放转盘动画并展示奖励。
8. 刷新红点。

广告抽奖：
1. 检查广告次数、冷却和广告服务可用性。
2. 展示激励视频。
3. 只有完整观看成功后才进入抽奖。
4. 广告失败或中途关闭不增加次数，不发奖励。

金币抽奖：
1. 检查金币余额是否不少于 `coinSpinCost`。
2. 先扣金币。
3. 抽奖并发放奖励。
4. 若奖励发放失败，必须回滚金币。

## 10. UI 设计建议

面板结构：
- 顶部：标题“幸运转盘”、关闭按钮。
- 中部：8 格转盘和固定指针。
- 下方：主按钮，根据当前可用模式显示不同文案。
- 底部：今日剩余次数。

按钮文案：
- 免费次数剩余：`免费抽奖`
- 免费已用且广告可用：`看广告抽奖`
- 广告不可用或已用完：`120 金币抽奖`
- 金币不足：`金币不足`
- 今日次数全用完：`今日已抽完`

动画要求：
- 服务先确定中奖结果，再播放动画。
- 动画最终停在中奖格子。
- 奖励发放应在动画前完成或与结果锁定同步完成，避免动画停中但到账失败。

## 11. 权重随机规则

V1 使用本地随机：
1. 计算所有启用格子的总权重。
2. 生成 `[1, totalWeight]` 的随机数。
3. 按权重累加命中格子。

注意：
- 本地随机不能作为强公平或强反作弊方案。
- 后续接服务端后，应由服务端返回 `spinId`、`segmentId` 和签名。

## 12. 与其他系统的关系

签到：
- 转盘免费次数是额外福利，不替代签到奖励。
- 转盘首日奖励总期望要低于签到第 7 天大奖。

每日任务：
- 如果每日任务接入 `watch_ad` 或 `spend_coin` 事件，转盘广告和金币抽奖可以自然推进任务。
- 转盘不直接改每日任务状态，由事件系统处理。

商城：
- 金币抽奖提供金币消耗口，但不能比商城购买道具更稳定。
- 转盘高价值道具概率要低于直接购买的确定性价值。

广告：
- 广告抽奖只在完整观看成功后计次数。
- 广告抽奖次数独立于失败页补偿和补体力次数，避免互相占用。

## 13. 埋点建议

推荐事件：
- `lucky_turntable_open`
- `lucky_turntable_spin_click`
- `lucky_turntable_ad_request`
- `lucky_turntable_ad_complete`
- `lucky_turntable_spin_success`
- `lucky_turntable_spin_fail`
- `lucky_turntable_reward_grant`

关键字段：
- `activity_id`
- `spin_id`
- `mode`
- `segment_id`
- `reward_items`
- `coin_cost`
- `day_key`
- `remaining_free`
- `remaining_ad`
- `remaining_coin`

## 14. 错误码

- `TURNTABLE_DISABLED`
- `TURNTABLE_MODE_INVALID`
- `TURNTABLE_FREE_LIMIT_REACHED`
- `TURNTABLE_AD_LIMIT_REACHED`
- `TURNTABLE_AD_NOT_COMPLETED`
- `TURNTABLE_COIN_LIMIT_REACHED`
- `TURNTABLE_COIN_NOT_ENOUGH`
- `TURNTABLE_REWARD_INVALID`
- `TURNTABLE_REWARD_GRANT_FAILED`
- `TURNTABLE_SAVE_FAILED`

## 15. 测试验收清单

功能：
- 每天首次进入选关页时，转盘入口显示红点。
- 免费抽奖成功后，免费次数变为 0，红点消失。
- 广告完整观看成功后才抽奖。
- 广告取消不扣次数、不发奖励。
- 金币抽奖成功后金币正确扣除。
- 金币不足时不能抽奖。
- 抽中奖励后金币、体力或背包数量正确增加。
- 今日次数用完后按钮不可点击。

跨天：
- 日期变化后免费、广告、金币次数全部重置。
- 昨日抽奖日志保留最近记录但不影响今日次数。

异常：
- 奖池为空时不能抽奖。
- 权重为 0 或负数的格子不参与抽奖。
- 未知奖励 ID 不发放并返回错误。
- 发奖失败时金币抽奖要回滚金币。

体验：
- 转盘停留格子与实际奖励一致。
- 结果弹窗与奖励到账一致。
- 顶部金币和背包入口在抽奖后刷新。

## 16. 推荐实现顺序

1. 接入 `LuckyTurntableConfig.js`。
2. 新增 `LuckyTurntableStore`，完成每日次数状态。
3. 新增 `LuckyTurntableService`，实现次数校验、权重抽奖和奖励发放。
4. 接入选关页入口和免费次数红点。
5. 制作 `LuckyTurntableView` prefab 和 `LuckyTurntableViewController`。
6. 接入广告抽奖和金币抽奖。
7. 补充埋点与回归测试。

## 17. 一句话结论

幸运转盘 V1 应定位为“每日一次免费福利 + 少量广告追加 + 轻度金币消耗”。它的价值在于增加回访和惊喜感，而不是替代商城或签到的稳定资源产出。
