# 闯关有礼活动设计文档（V1）

更新时间：2026-04-24
项目路径：`E:/cocos_project/bubble`

## 1. 活动目标

闯关有礼用于奖励玩家持续推进主线关卡，把“打到第几关”变成清晰可见的阶段目标。

V1 目标：
- 按通关里程碑发放一次性奖励。
- 引导玩家从前 30 关逐步推进。
- 奖励只使用当前项目已有资源：金币、体力、4 类救场道具。
- 使用独立活动存档记录领奖状态。
- 不改变关卡解锁、星级评分和体力消耗规则。

V1 不做：
- 付费通行证。
- 排行榜冲榜奖励。
- 限时倒计时活动。
- 服务端活动下发。
- 重复刷关领奖。

## 2. 活动定位

闯关有礼是“长期成长奖励”，和其他系统的定位区分如下：

| 系统 | 奖励节奏 | 核心目标 |
| --- | --- | --- |
| 签到 | 每日登录 | 留存 |
| 每日任务 | 当日行为 | 日活循环 |
| 幸运转盘 | 每日随机福利 | 惊喜与补给 |
| 闯关有礼 | 关卡里程碑 | 推进主线 |

闯关有礼不需要每日刷新，也不应该催促玩家重复刷同一关。它只奖励首次达到关键关卡节点。

## 3. 现有系统接入点

当前项目已有入口图标：
- `assets/image/icon/icon_break_through.png`

可复用的现有模块：
- `LevelProgressStore`：读取 `completedLevels`、`starsByLevel`、`highestUnlockedLevel`。
- `PlayerResourceStore`：发放金币和体力。
- `InventoryStore`：发放 `swap_ball`、`rainbow_ball`、`blast_ball`、`barrier_hammer`。
- `TelemetryService`：记录活动打开、奖励领取、领取失败。
- `TipsPresenter`：展示领取成功提示。

稳定接入位置：
- 通关成功后，`GameBootstrapUiFlowMethods._recordCurrentLevelWin` 已经写入关卡进度。
- 进度写入后刷新活动红点即可，不需要在战斗系统里直接处理活动逻辑。

## 4. 活动入口

入口位置：
- 选关页功能入口区，使用 `icon_break_through.png`。
- 与签到、每日任务、转盘、背包入口保持同一层级。

入口文案：
- 推荐显示为“闯关有礼”。

入口可见条件：
- V1 默认常驻开放。
- 当至少存在一个未领取且已达成的奖励时显示红点。

红点规则：
- 任一里程碑 `completedLevelId >= requiredLevelId && claimed === false` 时显示红点。
- 只差一点但未达成时不显示红点。
- 全部已领取后红点消失。

## 5. 活动规则

基础规则：
- 玩家首次通关指定关卡后，可领取对应里程碑奖励。
- 每个里程碑奖励只能领取一次。
- 领取状态独立保存，不依赖 UI 动画状态。
- 已通关玩家首次打开活动时，应自动识别历史进度并展示可领取奖励。

是否要求星级：
- V1 不要求星级，只要求通关。
- 星级目标可作为 V2 扩展，例如“累计获得 30 星”或“第 20 关 3 星通关”。

是否允许补领：
- 允许补领。
- 例如玩家已经通关第 15 关，首次打开活动时，第 3、5、10、15 关奖励都应变为可领取。

## 6. V1 里程碑奖励

首版建议覆盖前 30 关，与当前资源目录中的关卡数量匹配。

| 里程碑 ID | 达成条件 | 奖励 | 设计意图 |
| --- | ---: | --- | --- |
| `clear_003` | 通关第 3 关 | 金币 x100 | 新手期轻补给 |
| `clear_005` | 通关第 5 关 | 换球 x1 | 引导基础救场道具 |
| `clear_008` | 通关第 8 关 | 金币 x150、体力 x1 | 支撑继续推进 |
| `clear_010` | 通关第 10 关 | 彩虹球 x1 | 首个阶段奖励 |
| `clear_015` | 通关第 15 关 | 金币 x250、换球 x1 | 中段补给 |
| `clear_020` | 通关第 20 关 | 炸裂球 x1、破障锤 x1 | 高难节点补给 |
| `clear_025` | 通关第 25 关 | 金币 x400、彩虹球 x1 | 后段推进奖励 |
| `clear_030` | 通关第 30 关 | 金币 x600、炸裂球 x1、破障锤 x1 | V1 大奖 |

奖励设计原则：
- 前 10 关奖励偏轻，避免过早堆资源。
- 15 关后逐步提供高价值道具，应对难度抬升。
- 第 30 关作为阶段大奖，但总价值不超过长期活动奖励的想象空间。

## 7. 配置结构建议

后续实现时可新增 `assets/scripts/config/BreakthroughGiftConfig.js`。

```js
"use strict";

module.exports = {
  enabled: true,
  activityId: "breakthrough_gift_v1",
  title: "闯关有礼",
  milestones: [
    {
      milestoneId: "clear_003",
      requiredLevelId: 3,
      title: "通关第 3 关",
      sortOrder: 10,
      rewardItems: [
        { id: "coin", count: 100 }
      ]
    },
    {
      milestoneId: "clear_005",
      requiredLevelId: 5,
      title: "通关第 5 关",
      sortOrder: 20,
      rewardItems: [
        { id: "swap_ball", count: 1 }
      ]
    }
  ]
};
```

配置规则：
- `milestoneId` 必须唯一。
- `requiredLevelId` 必须为正整数。
- `rewardItems` 支持 `coin`、`stamina` 和当前背包支持的 4 类道具。
- `sortOrder` 控制 UI 展示顺序。
- 禁止同一个里程碑配置空奖励。

## 8. 玩家存档结构

建议新增独立存档 key：`bubble_breakthrough_gift_state_v1`。

```json
{
  "version": 1,
  "activityId": "breakthrough_gift_v1",
  "claimedMilestones": {
    "clear_003": {
      "claimedAt": 1713931200000,
      "requiredLevelId": 3
    },
    "clear_005": {
      "claimedAt": 1713932600000,
      "requiredLevelId": 5
    }
  },
  "claimLogs": [
    {
      "milestoneId": "clear_003",
      "requiredLevelId": 3,
      "rewardItems": [
        { "id": "coin", "count": 100 }
      ],
      "timestamp": 1713931200000
    }
  ]
}
```

字段规则：
- `claimedMilestones` 只记录已经领取的里程碑。
- 未领取状态通过配置和关卡进度实时计算，不需要重复存储。
- `claimLogs` 只保留最近 20 条，方便调试即可。
- 如果活动版本升级，使用新的 `activityId`，避免旧领奖状态误用。

## 9. 状态计算

每个里程碑有 3 种 UI 状态：

| 状态 | 条件 | UI 表现 |
| --- | --- | --- |
| `locked` | 未通关要求关卡 | 显示进度，按钮置灰 |
| `claimable` | 已通关要求关卡且未领取 | 按钮高亮，入口红点 |
| `claimed` | 已领取 | 显示已领取 |

达成判断：
```js
isReached = !!completedLevels[String(requiredLevelId)]
```

也可以使用：
```js
isReached = highestUnlockedLevel > requiredLevelId
```

推荐优先使用 `completedLevels`，因为它直接表达“该关已通关”，语义更稳。

## 10. 模块拆分

### 10.1 BreakthroughGiftStore

职责：
- 读取与保存活动领奖状态。
- 规范化坏存档。
- 记录领取日志。

核心接口：
- `load()`
- `save(state)`
- `isClaimed(state, milestoneId)`
- `markClaimed(state, milestone, now)`

### 10.2 BreakthroughGiftService

职责：
- 根据关卡进度计算里程碑状态。
- 判断是否有可领取奖励。
- 执行领取校验和奖励发放。

核心接口：
- `getMilestoneList(levelProgress)`
- `hasClaimableReward(levelProgress)`
- `canClaim(milestoneId, levelProgress)`
- `claimReward(milestoneId, levelProgress, now)`

### 10.3 BreakthroughGiftRewardService

职责：
- 统一发放里程碑奖励。
- `coin` 和 `stamina` 写入 `PlayerResourceStore`。
- 其他道具写入 `InventoryStore`。

建议 `reason` 固定为：
- `breakthrough_gift_clear_003`
- `breakthrough_gift_clear_005`
- 其余里程碑按同样格式生成。

### 10.4 BreakthroughGiftViewController

职责：
- 渲染里程碑列表。
- 展示当前通关进度。
- 处理领取按钮点击。
- 领取后刷新列表、红点和顶部资源。

## 11. 领取流程

领取单个里程碑奖励：
1. 读取 `LevelProgressStore` 当前进度。
2. 读取 `BreakthroughGiftStore` 当前领奖状态。
3. 找到里程碑配置。
4. 校验玩家已通关 `requiredLevelId`。
5. 校验该里程碑尚未领取。
6. 发放奖励到金币、体力或背包。
7. 写入 `claimedMilestones` 和 `claimLogs`。
8. 保存活动状态。
9. 刷新活动面板、入口红点、顶部资源和背包状态。

重要规则：
- 奖励发放失败时，不写入已领取。
- 存档保存失败时，应提示领取失败，避免玩家误以为到账。
- 不允许仅靠按钮置灰防重复领取，服务层必须校验 `claimedMilestones`。

## 12. UI 设计建议

面板结构：
- 顶部：标题“闯关有礼”、关闭按钮。
- 顶部信息：当前已通关最高关卡，例如“当前进度：第 12 关”。
- 中部：纵向里程碑列表。
- 每条里程碑展示：目标关卡、奖励图标、状态按钮。
- 底部：提示“通关指定关卡即可领取一次奖励”。

列表表现：
- 已领取奖励置灰并显示对勾。
- 可领取奖励高亮并靠前展示。
- 未达成奖励显示进度，例如“还差 3 关”。

按钮文案：
- `locked`：`未达成`
- `claimable`：`领取`
- `claimed`：`已领取`

## 13. 与其他系统的关系

每日任务：
- 通关行为可以同时推进每日任务。
- 闯关有礼只看历史通关进度，不参与每日任务计数。

幸运转盘：
- 两者都可能发放道具，但节奏不同。
- 转盘是每日随机，闯关有礼是固定里程碑，奖励价值可以更确定。

签到：
- 签到奖励按天，闯关有礼按关卡。
- 第 30 关大奖可以略强于单日签到，但不应超过完整 7 天签到总价值。

商城：
- 闯关有礼发放的道具会降低短期购买需求，因此高价值道具集中在 20 关后。
- 金币奖励不应高到让商城价格失去意义。

## 14. 埋点建议

推荐事件：
- `breakthrough_gift_open`
- `breakthrough_gift_milestone_exposed`
- `breakthrough_gift_claim_click`
- `breakthrough_gift_claim_success`
- `breakthrough_gift_claim_fail`

关键字段：
- `activity_id`
- `milestone_id`
- `required_level_id`
- `highest_unlocked_level`
- `is_completed`
- `reward_items`
- `fail_reason`

## 15. 错误码

- `BREAKTHROUGH_GIFT_DISABLED`
- `BREAKTHROUGH_GIFT_MILESTONE_NOT_FOUND`
- `BREAKTHROUGH_GIFT_NOT_REACHED`
- `BREAKTHROUGH_GIFT_ALREADY_CLAIMED`
- `BREAKTHROUGH_GIFT_REWARD_INVALID`
- `BREAKTHROUGH_GIFT_REWARD_GRANT_FAILED`
- `BREAKTHROUGH_GIFT_SAVE_FAILED`

## 16. 测试验收清单

功能：
- 新玩家打开活动时，所有里程碑均为未达成。
- 通关第 3 关后，第 3 关奖励变为可领取。
- 已通关第 15 关的老玩家首次打开活动时，第 3、5、8、10、15 关奖励均可领取。
- 领取奖励后金币、体力或背包数量正确增加。
- 已领取奖励不能重复领取。
- 领取全部已达成奖励后入口红点消失。

边界：
- 配置中不存在的里程碑不能领取。
- 未通关目标关卡时不能领取。
- 奖励 ID 非法时不写入已领取。
- 存档损坏时能恢复默认状态，不影响游戏启动。

体验：
- 可领取奖励在列表中足够醒目。
- 顶部资源在领奖后即时刷新。
- 背包道具在领奖后能正确显示。
- 入口红点在通关、打开面板、领奖后都能正确刷新。

## 17. 推荐实现顺序

1. 新增 `BreakthroughGiftConfig.js`。
2. 新增 `BreakthroughGiftStore`。
3. 新增 `BreakthroughGiftService`，完成状态计算和领取校验。
4. 接入奖励发放服务。
5. 接入选关页入口和红点。
6. 制作活动面板 prefab 和 `BreakthroughGiftViewController`。
7. 通关成功后刷新入口红点。
8. 补充埋点和回归测试。

## 18. 一句话结论

闯关有礼 V1 应定位为“主线推进里程碑奖励”。它给玩家一个持续向前打关的理由，并把现有金币、体力和救场道具以可预期的节奏发出去，不干扰每日活动和商城闭环。
