# 每日任务系统设计文档（V1）

更新时间：2026-04-24
项目路径：`E:/cocos_project/bubble`

## 1. 设计目标

每日任务系统用于补充签到、商城、背包和广告奖励之间的日常循环，让玩家每天有明确的小目标和稳定奖励。

V1 目标：
- 提供 3~5 个低压力每日目标。
- 支持每日自然日刷新。
- 支持任务进度、完成、领取奖励和红点提示。
- 奖励只发放当前项目已有资源：金币、体力、4 类救场道具。
- 与现有本地存档、通关记录、广告奖励和背包系统保持低耦合。

V1 不做：
- 长周期周任务、赛季任务、成就系统。
- 服务端任务下发和反作弊。
- 复杂活动任务、付费任务、任务刷新道具。
- 分享任务，避免微信平台策略风险。

## 2. 现有系统接入点

当前项目已有能力：
- `PlayerResourceStore`：管理体力与金币，存储 key 为 `bubble_player_resources_v1`。
- `InventoryStore`：管理 `swap_ball`、`rainbow_ball`、`blast_ball`、`barrier_hammer`。
- `SignInStore`：管理 7 天签到状态。
- `LevelProgressStore`：记录已通关关卡和星级。
- `AdRewardQuotaStore`：管理广告奖励的每日次数和冷却。
- `TelemetryService`：已有埋点入口。
- `GameBootstrapUiFlowMethods._recordCurrentLevelWin`：通关成功时的稳定接入点。

每日任务应新增独立状态，不写进签到、背包或广告存档里。任务系统只消费事件并发放奖励，不直接改动关卡流程规则。

## 3. V1 任务范围

推荐首版任务：

| 任务 ID | 名称 | 类型 | 目标 | 奖励 | 说明 |
| --- | --- | --- | ---: | --- | --- |
| `login_today` | 今日登录 | `login` | 1 | 金币 50 | 进入选关页后自动完成 |
| `clear_level_1` | 通关 1 次 | `clear_level` | 1 | 金币 100 | 任意关卡胜利 |
| `earn_star_3` | 获得 3 颗星 | `earn_star` | 3 | `swap_ball` x1 | 按本日通关获得星数累加 |
| `use_powerup_1` | 使用 1 次道具 | `use_powerup` | 1 | 金币 80 | 使用局内救场道具时计数 |
| `watch_ad_1` | 完整观看 1 次广告 | `watch_ad` | 1 | `barrier_hammer` x1 | 任意奖励广告完整观看成功 |

设计原则：
- 任务目标都在 10 分钟内可完成。
- 奖励总价值低于签到第 7 天大奖，避免挤压签到价值。
- 广告任务可配置关闭，避免广告位未配置时出现不可完成任务。

## 4. 配置结构

建议新增 `assets/scripts/config/DailyTaskConfig.js`：

```js
"use strict";

module.exports = {
  resetTime: "00:00",
  resetTimezone: "Asia/Shanghai",
  autoCompleteLoginTask: true,
  tasks: [
    {
      taskId: "login_today",
      title: "今日登录",
      type: "login",
      target: 1,
      sortOrder: 10,
      enabled: true,
      rewardItems: [
        { id: "coin", count: 50 }
      ]
    },
    {
      taskId: "clear_level_1",
      title: "通关 1 次",
      type: "clear_level",
      target: 1,
      sortOrder: 20,
      enabled: true,
      rewardItems: [
        { id: "coin", count: 100 }
      ]
    },
    {
      taskId: "earn_star_3",
      title: "获得 3 颗星",
      type: "earn_star",
      target: 3,
      sortOrder: 30,
      enabled: true,
      rewardItems: [
        { id: "swap_ball", count: 1 }
      ]
    },
    {
      taskId: "use_powerup_1",
      title: "使用 1 次道具",
      type: "use_powerup",
      target: 1,
      sortOrder: 40,
      enabled: true,
      rewardItems: [
        { id: "coin", count: 80 }
      ]
    },
    {
      taskId: "watch_ad_1",
      title: "完整观看 1 次广告",
      type: "watch_ad",
      target: 1,
      sortOrder: 50,
      enabled: true,
      rewardItems: [
        { id: "barrier_hammer", count: 1 }
      ]
    }
  ],
  progressRules: {
    maxProgressPerTaskPerEvent: 1,
    clampProgressToTarget: true
  }
};
```

## 5. 玩家存档结构

建议新增独立存档 key：`bubble_daily_task_state_v1`。

```json
{
  "version": 1,
  "dayKey": "2026-04-24",
  "tasks": {
    "login_today": {
      "progress": 1,
      "claimed": false,
      "completedAt": 1713931200000,
      "claimedAt": 0
    },
    "clear_level_1": {
      "progress": 0,
      "claimed": false,
      "completedAt": 0,
      "claimedAt": 0
    }
  },
  "claimLogs": []
}
```

字段规则：
- `dayKey`：本地自然日，格式 `YYYY-MM-DD`。
- 日期变化时重置 `tasks`，保留最近少量 `claimLogs` 可选。
- `progress`：非负整数，最大不超过任务 `target`。
- `claimed`：奖励是否已领取。
- `completedAt`：首次达到目标的时间戳。
- `claimedAt`：领取奖励时间戳。

## 6. 模块拆分

### 6.1 DailyTaskStore

职责：
- 读取与保存每日任务状态。
- 日期变化时重置任务进度。
- 规范化异常存档，避免坏数据影响启动。

核心接口：
- `load(now)`
- `save(state)`
- `ensureDailyReset(state, now)`
- `getTodayKey(now)`

### 6.2 DailyTaskService

职责：
- 根据配置推进任务进度。
- 判断任务是否完成、可领取。
- 执行领取流程并调用奖励发放。

核心接口：
- `recordEvent(eventType, payload, now)`
- `getTaskList(now)`
- `canClaim(taskId, now)`
- `claimReward(taskId, now)`
- `hasClaimableTask(now)`

### 6.3 DailyTaskRewardService

职责：
- 统一发放任务奖励。
- `coin` 写入 `PlayerResourceStore` 的 `coins`。
- 其他道具写入 `InventoryStore`。
- 发放失败时返回明确错误，不吞掉异常。

核心接口：
- `grantRewardItems(rewardItems, reason)`

建议 `reason` 固定为：
- `daily_task_login`
- `daily_task_clear_level`
- `daily_task_earn_star`
- `daily_task_use_powerup`
- `daily_task_watch_ad`

### 6.4 DailyTaskViewController

职责：
- 渲染任务列表、进度条、完成状态、领取按钮。
- 处理领取按钮点击。
- 展示奖励领取反馈。

首版 UI 可以复用签到弹窗风格，作为独立面板挂在选关页入口 `icon_daily_tasks`。

## 7. 事件接入设计

任务系统只监听业务事件，不主动侵入业务流程。

| 事件类型 | 触发位置 | Payload | 影响任务 |
| --- | --- | --- | --- |
| `login` | 进入选关页并完成资源加载 | `{}` | `login_today` |
| `level_win` | `_recordCurrentLevelWin` 成功后 | `{ levelId, stars }` | `clear_level_1`, `earn_star_3` |
| `powerup_used` | 道具真正扣除并生效后 | `{ itemId, powerupType }` | `use_powerup_1` |
| `ad_completed` | 激励视频完整观看并发奖前后 | `{ entryKey, rewardType }` | `watch_ad_1` |

接入原则：
- 只有行为真正成功后才记录任务进度。
- 失败、取消、广告未完整观看不推进进度。
- 同一事件只推进匹配任务，不做隐式连带奖励。

## 8. 领取流程

领取单个任务奖励：
1. 加载任务状态并执行跨天重置检查。
2. 找到任务配置，确认任务启用。
3. 校验 `progress >= target`。
4. 校验 `claimed === false`。
5. 发放奖励到金币或背包。
6. 写入 `claimed = true` 与 `claimedAt`。
7. 保存任务状态。
8. 刷新选关页顶部金币、背包入口和任务红点。

重要规则：
- 奖励发放与领取状态要尽量在同一同步流程内完成。
- 如果奖励发放失败，不写入 `claimed = true`。
- 如果保存任务状态失败，首版可提示“领取失败，请重试”，不要重复弹奖励动画。

## 9. 红点规则

每日任务入口红点显示条件：
- 存在任一任务 `progress >= target && claimed === false`。

红点刷新时机：
- 进入选关页。
- 登录任务自动完成后。
- 通关胜利记录后。
- 使用道具成功后。
- 广告奖励成功后。
- 任务奖励领取后。
- 每日跨天重置后。

未完成但有进度时不显示红点，避免打扰。

## 10. UI 设计建议

入口：
- 选关页功能入口使用现有 `assets/image/icon/icon_daily_tasks.png`。
- 入口放在签到、背包、排行榜附近，保持主页功能区一致。

面板结构：
- 顶部：标题“每日任务”和关闭按钮。
- 中部：任务列表，纵向 5 条。
- 每条任务包含：任务名、奖励图标、进度 `x/y`、领取按钮。
- 底部：提示“每日 00:00 刷新”。

按钮状态：
- 未完成：按钮置灰，显示 `进行中`。
- 可领取：按钮高亮，显示 `领取`。
- 已领取：按钮置灰，显示 `已领取`。

反馈：
- 领取成功后弹出 `获得：金币 x100` 或 `获得：换球 x1`。
- 面板内该行立即变为已领取。
- 顶部金币数和背包入口状态同步刷新。

## 11. 与签到、商城、广告的关系

签到：
- 签到是登录周期奖励，每日任务是行为目标奖励。
- 登录任务奖励必须低于签到奖励，避免玩家认为签到被拆分。

商城：
- 每日任务产出的金币和道具可以进入商城/背包闭环。
- 每日任务不影响商城每日限购次数。

广告：
- 广告任务只统计完整观看成功。
- 如果激励视频未配置或平台不支持，可通过配置关闭 `watch_ad_1`。
- 广告任务不增加广告每日次数上限，只作为观看后的附加任务进度。

## 12. 埋点建议

推荐事件：
- `daily_task_panel_open`
- `daily_task_progress`
- `daily_task_complete`
- `daily_task_claim_success`
- `daily_task_claim_fail`

关键字段：
- `task_id`
- `task_type`
- `progress`
- `target`
- `reward_items`
- `reason`
- `day_key`

## 13. 边界规则

### 13.1 跨天重置

- 打开面板、进入选关页、记录任务事件、领取奖励前都要执行 `ensureDailyReset`。
- 日期变化后，未领取奖励直接过期。
- V1 不补发过期奖励。

### 13.2 重复领取

- 同一任务每天只能领取一次。
- 以 `claimed` 为准，不以动画状态或按钮状态为准。

### 13.3 任务配置变更

- 配置移除的任务不再展示。
- 存档里多余任务保留但不参与逻辑。
- 新增任务当天可立即初始化为 0 进度。

### 13.4 奖励非法

- 未知奖励 ID 不发放，并返回 `DAILY_TASK_REWARD_INVALID`。
- 道具 ID 必须在 `InventoryStore` 支持范围内。

### 13.5 进度溢出

- `progress` 默认 clamp 到 `target`。
- 例如一次通关获得 3 星，`earn_star_3` 从 1/3 变为 3/3，而不是 4/3。

## 14. 错误码

- `DAILY_TASK_NOT_FOUND`
- `DAILY_TASK_DISABLED`
- `DAILY_TASK_NOT_COMPLETED`
- `DAILY_TASK_ALREADY_CLAIMED`
- `DAILY_TASK_REWARD_INVALID`
- `DAILY_TASK_REWARD_GRANT_FAILED`
- `DAILY_TASK_SAVE_FAILED`

## 15. 测试验收清单

功能：
- 首次进入选关页后，登录任务自动完成。
- 任意关卡胜利后，通关任务进度 +1。
- 3 星通关后，星数任务直接完成。
- 使用道具成功后，道具任务进度 +1。
- 完整观看激励视频后，广告任务进度 +1。
- 可领取任务显示红点。
- 领取奖励后金币或背包数量正确增加。
- 已领取任务不能重复领取。

跨天：
- 日期变化后任务进度重置。
- 昨日已完成未领取任务不会保留。
- 新一天登录任务可再次完成。

异常：
- 未完成任务不能领取。
- 未知任务 ID 返回错误。
- 未知奖励 ID 不写领取状态。
- 广告取消或失败不推进广告任务。

体验：
- 领取后入口红点及时消失。
- 金币顶部栏及时刷新。
- 背包数量在背包面板重进后正确显示。

## 16. 推荐实现顺序

1. 新增 `DailyTaskConfig.js`。
2. 新增 `DailyTaskStore.js`，完成跨天重置和状态规范化。
3. 新增 `DailyTaskService.js`，实现事件推进与领取校验。
4. 接入登录、通关、道具使用、广告完成事件。
5. 接入选关页每日任务入口和红点。
6. 制作 `DailyTaskView` prefab 与 `DailyTaskViewController`。
7. 补充埋点和回归测试。

## 17. 一句话结论

每日任务 V1 应定位为“轻量日常目标 + 现有资源奖励 + 独立本地状态”。它不应该替代签到或广告系统，而是把玩家每天本来会做的登录、通关、拿星、用道具和看广告，整理成可见、可领取、可追踪的小闭环。
