# 每日任务系统设计文档（V1）

更新时间：2026-04-24
项目路径：`E:/cocos_project/bubble`

## 1. 设计目标

每日任务系统用于补充签到、商城、背包和广告奖励之间的日常循环，让玩家每天有明确的小目标和稳定奖励。

V1 目标：
- 提供 5 个低压力每日目标。
- 支持每日自然日刷新。
- 支持任务进度、完成、领取奖励和红点提示。
- 奖励只发放当前项目已有资源：金币。
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

首版任务：

| 任务 ID | 名称 | 类型 | 目标 | 奖励 | 说明 |
| --- | --- | --- | ---: | --- | --- |
| `clear_level_5` | 通过 5 个关卡 | `clear_level` | 5 | 金币 500 | 任意关卡胜利后计数 |
| `spend_stamina_20` | 使用体力 20 点 | `spend_stamina` | 20 | 金币 500 | 体力真正扣除成功后按扣除数量累加 |
| `use_rainbow_ball_2` | 使用彩虹球道具 2 次 | `use_powerup` | 2 | 金币 200 | 使用 `rainbow_ball` 并生效后计数 |
| `use_barrier_hammer_1` | 使用锤子道具 1 次 | `use_powerup` | 1 | 金币 100 | 使用 `barrier_hammer` 并生效后计数 |
| `gift_friend_stamina_3` | 赠送好友体力 3 次 | `gift_friend_stamina` | 3 | 金币 300 | 自研好友体力礼物创建并分享成功后计数，每次扣除自身 1 点体力 |

设计原则：
- 任务目标应结合体力获取、关卡节奏和好友赠送入口确认每日可完成性。
- 奖励总价值低于签到第 7 天大奖，避免挤压签到价值。
- 好友赠送任务需要依赖真实赠送成功事件，未成功赠送不推进进度。

## 4. 配置结构

建议新增 `assets/scripts/config/DailyTaskConfig.js`：

```js
"use strict";

module.exports = {
  resetTime: "00:00",
  resetTimezone: "Asia/Shanghai",
  tasks: [
    {
      taskId: "clear_level_5",
      title: "通过 5 个关卡",
      type: "clear_level",
      target: 5,
      sortOrder: 10,
      enabled: true,
      rewardItems: [
        { id: "coin", count: 500 }
      ]
    },
    {
      taskId: "spend_stamina_20",
      title: "使用体力 20 点",
      type: "spend_stamina",
      target: 20,
      sortOrder: 20,
      enabled: true,
      rewardItems: [
        { id: "coin", count: 500 }
      ]
    },
    {
      taskId: "use_rainbow_ball_2",
      title: "使用彩虹球道具 2 次",
      type: "use_powerup",
      target: 2,
      sortOrder: 30,
      enabled: true,
      rewardItems: [
        { id: "coin", count: 200 }
      ]
    },
    {
      taskId: "use_barrier_hammer_1",
      title: "使用锤子道具 1 次",
      type: "use_powerup",
      target: 1,
      sortOrder: 40,
      enabled: true,
      rewardItems: [
        { id: "coin", count: 100 }
      ]
    },
    {
      taskId: "gift_friend_stamina_3",
      title: "赠送好友体力 3 次",
      type: "gift_friend_stamina",
      target: 3,
      sortOrder: 50,
      enabled: true,
      rewardItems: [
        { id: "coin", count: 300 }
      ]
    }
  ],
  progressRules: {
    maxProgressPerTaskPerEvent: 20,
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
    "clear_level_5": {
      "progress": 2,
      "claimed": false,
      "completedAt": 0,
      "claimedAt": 0
    },
    "spend_stamina_20": {
      "progress": 10,
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
- 发放失败时返回明确错误，不吞掉异常。

核心接口：
- `grantRewardItems(rewardItems, reason)`

建议 `reason` 固定为：
- `daily_task_clear_level`
- `daily_task_spend_stamina`
- `daily_task_use_rainbow_ball`
- `daily_task_use_barrier_hammer`
- `daily_task_gift_friend_stamina`

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
| `clear_level` | `_recordCurrentLevelWin` 成功后 | `{ levelId, stars }` | `clear_level_5` |
| `spend_stamina` | 体力真正扣除成功后 | `{ amount, reason }` | `spend_stamina_20` |
| `use_powerup` | 道具真正扣除并生效后 | `{ itemId, powerupType }` | `use_rainbow_ball_2`, `use_barrier_hammer_1` |
| `gift_friend_stamina` | 好友体力赠送成功且自身 1 点体力扣除成功后 | `{ friendId, amount }` | `gift_friend_stamina_3` |

接入原则：
- 只有行为真正成功后才记录任务进度。
- 失败、取消、体力扣除失败、道具未生效或好友赠送失败不推进进度。
- 同一事件只推进匹配任务，不做隐式连带奖励。
- `use_powerup` 必须按 `itemId` 精确匹配任务，使用其他道具不推进彩虹球或锤子任务。
- 好友体力赠送扣除自身 1 点体力后，同时按 1 点推进 `spend_stamina_20`。
- 好友体力赠送使用自研云函数 `createSelfManagedFriendStaminaGift` 创建礼物记录，再用普通分享携带 `friendGiftId`。
- 分享失败或云函数失败必须回滚本次扣除的 1 点体力，不推进任务进度。

## 8. 领取流程

领取单个任务奖励：
1. 加载任务状态并执行跨天重置检查。
2. 找到任务配置，确认任务启用。
3. 校验 `progress >= target`。
4. 校验 `claimed === false`。
5. 发放奖励到金币。
6. 写入 `claimed = true` 与 `claimedAt`。
7. 保存任务状态。
8. 刷新选关页顶部金币和任务红点。

重要规则：
- 奖励发放与领取状态要尽量在同一同步流程内完成。
- 如果奖励发放失败，不写入 `claimed = true`。
- 如果保存任务状态失败，首版可提示“领取失败，请重试”，不要重复弹奖励动画。

## 9. 红点规则

每日任务入口红点显示条件：
- 存在任一任务 `progress >= target && claimed === false`。

红点刷新时机：
- 进入选关页。
- 通关胜利记录后。
- 体力扣除成功后。
- 使用道具成功后。
- 好友体力赠送成功后。
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
- 领取成功后弹出 `获得：金币 x500`。
- 面板内该行立即变为已领取。
- 顶部金币数同步刷新。

## 11. 与签到、商城、广告的关系

签到：
- 签到是登录周期奖励，每日任务是行为目标奖励。
- 每日任务不设置登录奖励，避免玩家认为签到被拆分。

商城：
- 每日任务产出的金币可以进入商城闭环。
- 每日任务不影响商城每日限购次数。

广告：
- V1 每日任务不设置广告任务。
- 广告奖励仍由广告系统独立管理，每日任务不增加广告每日次数上限。

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
- `event_amount`
- `item_id`

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
- V1 只允许 `coin` 奖励。

### 13.5 事件数量非法

- `spend_stamina` 的 `amount` 必须是正整数。
- `gift_friend_stamina` 每次成功赠送按 1 次计数，不按赠送体力数量计数。
- `gift_friend_stamina` 赠送前必须检查自身剩余体力，赠送成功后必须扣除自身 1 点体力。
- `gift_friend_stamina` 必须在礼物记录创建、分享返回、体力扣除最终保留后才记录进度。
- `use_powerup` 的 `itemId` 必须是当前任务要求的道具 ID。

### 13.6 进度溢出

- `progress` 默认 clamp 到 `target`。
- 例如一次消耗 5 点体力，`spend_stamina_20` 从 18/20 变为 20/20，而不是 23/20。

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
- 任意关卡胜利后，通关任务进度 +1，累计 5 次后完成。
- 体力真正扣除成功后，体力任务按扣除数量累加，累计 20 点后完成。
- 使用彩虹球成功后，彩虹球任务进度 +1，使用其他道具不推进该任务。
- 使用锤子成功后，锤子任务进度 +1，使用其他道具不推进该任务。
- 好友体力赠送成功后，赠送任务进度 +1，累计 3 次后完成。
- 好友体力赠送成功后，自身体力 -1，使用体力任务进度 +1。
- 普通分享成功不应推进好友体力赠送任务。
- 可领取任务显示红点。
- 领取奖励后金币数量正确增加。
- 已领取任务不能重复领取。

跨天：
- 日期变化后任务进度重置。
- 昨日已完成未领取任务不会保留。
- 新一天所有任务可重新计数和领取。

异常：
- 未完成任务不能领取。
- 未知任务 ID 返回错误。
- 未知奖励 ID 不写领取状态。
- 体力扣除失败不推进体力任务。
- 道具未扣除或未生效不推进道具任务。
- 好友体力赠送失败不推进赠送任务。

体验：
- 领取后入口红点及时消失。
- 金币顶部栏及时刷新。
- 任务面板重新打开后进度与领取状态正确显示。

## 16. 推荐实现顺序

1. 新增 `DailyTaskConfig.js`。
2. 新增 `DailyTaskStore.js`，完成跨天重置和状态规范化。
3. 新增 `DailyTaskService.js`，实现事件推进与领取校验。
4. 接入通关、体力消耗、道具使用、好友体力赠送事件。
5. 接入选关页每日任务入口和红点。
6. 制作 `DailyTaskView` prefab 与 `DailyTaskViewController`。
7. 补充埋点和回归测试。

## 17. 一句话结论

每日任务 V1 应定位为“轻量日常目标 + 金币奖励 + 独立本地状态”。它不应该替代签到或广告系统，而是把玩家每天本来会做的通关、消耗体力、使用道具和好友互动，整理成可见、可领取、可追踪的小闭环。
