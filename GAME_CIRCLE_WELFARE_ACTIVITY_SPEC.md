# 游戏圈福利活动设计文档（V1）

更新时间：2026-04-30
项目路径：`E:/coco_project/bubble`

## 1. 活动目标

游戏圈福利活动用于把玩家引导到微信小游戏游戏圈，并用轻量奖励鼓励玩家完成加入、点赞和发帖三类社区行为。

V1 目标：
- 提供 3 个基础任务：加入游戏圈、每日点赞 3 个帖子、每日发表 1 个帖子。
- 提供游戏圈入口按钮，玩家可从选关页和活动面板进入游戏圈。
- 使用微信游戏圈真实数据校验任务进度。
- 奖励只发放当前项目已有资源：金币、体力、4 类救场道具。
- 使用独立活动存档，不污染每日任务、签到、商城、背包和广告状态。

V1 不做：
- 服务端配置活动时间窗。
- 周任务、累计任务、排行榜任务。
- 评论任务、官方帖专属任务、话题帖任务。
- 未校验游戏圈数据时的手动补领奖。
- 通过点击入口直接判定任务完成。

## 2. 现有系统接入点

当前项目已有能力：
- `PlayerResourceStore`：发放金币和体力。
- `InventoryStore`：发放 `swap_ball`、`rainbow_ball`、`blast_ball`、`barrier_hammer`。
- `TelemetryService`：记录活动打开、游戏圈入口点击、数据刷新、领取成功和失败。
- `TipsPresenter`：展示刷新失败、未完成、领取成功等提示。
- `LevelView.prefab`：选关页已有底部入口区，可新增同层级游戏圈入口。

新增模块建议：
- `GameCircleWelfareConfig`：活动开关、任务配置、奖励配置和入口跳转配置。
- `GameCircleWelfareStore`：记录每个任务当日领取状态、最后一次游戏圈数据刷新时间和加入任务领取状态。
- `GameCircleWelfareService`：校验配置、解析平台数据、计算任务进度、发放奖励。
- `GameCircleWelfareViewController`：渲染活动面板和绑定领取、刷新、进入游戏圈按钮。
- `GameCircleButtonAdapter`：封装微信 `wx.createGameClubButton`、显示、隐藏、销毁和坐标同步。

## 3. 活动入口

入口位置：
- 选关页底部功能入口区新增 `game_circle_btn`。
- 与星星宝箱、排行榜、背包入口保持同一视觉层级。
- 活动面板顶部右侧保留一个“游戏圈”入口按钮，便于玩家完成任务后返回刷新进度。

按钮形态：
- Cocos 内绘制项目风格的可见按钮。
- 微信小游戏环境下，在可见按钮区域上方覆盖透明原生 `GameClubButton`。
- 非微信小游戏环境不创建活动入口，研发调试需要通过明确 debug 开关进入。

入口点击行为：
1. 点击选关页 `game_circle_btn` 打开游戏圈主页，并记录 `game_circle_entry_click`。
2. 点击活动面板内入口打开指定活动帖或游戏圈主页。
3. 从游戏圈返回游戏后，玩家点击“刷新进度”拉取游戏圈数据。
4. 刷新成功后更新任务进度和红点。

入口按钮生命周期：
- 进入选关页：创建或显示 `GameClubButton`。
- 打开活动面板：同步按钮位置到面板入口区域。
- 离开选关页、进入战斗、打开会遮挡入口的弹窗：隐藏按钮。
- 销毁选关页：销毁按钮。

## 4. 任务范围

| 任务 ID | 名称 | 游戏圈数据 | 目标 | 重置 | 奖励 | 说明 |
| --- | --- | --- | ---: | --- | --- | --- |
| `join_game_circle` | 加入游戏圈 | 加入该游戏圈时间 | 1 | 不重置 | 金币 120 | 检测到加入时间大于 0 后完成，只能领取一次 |
| `like_posts_3_daily` | 每日点赞 3 个帖子 | 当天点赞帖子数 | 3 | 每日 00:00 | 金币 100 | 以自然日点赞数为准，不累计昨日进度 |
| `publish_post_1_daily` | 每日发表 1 个帖子 | 当天发表帖子数 | 1 | 每日 00:00 | `swap_ball` x1 | 普通帖子即可完成，不要求视频帖 |

设计原则：
- 加入任务是一次性任务，避免玩家每天重复退圈再加入。
- 点赞和发帖是每日任务，只记录当天是否已领取，不保存昨日未领取奖励。
- 活动奖励总价值低于签到 7 天累计奖励，避免挤压签到和每日任务价值。
- 任务完成以平台返回数据为准，客户端本地点击和跳转记录只用于埋点。

## 5. 配置结构

建议新增 `assets/scripts/config/GameCircleWelfareConfig.js`：

```js
"use strict";

module.exports = {
  enabled: true,
  activityId: "game_circle_welfare_v1",
  resetTime: "00:00",
  resetTimezone: "Asia/Shanghai",
  entry: {
    openlink: "",
    showRedDotWhenRewardClaimable: true
  },
  tasks: [
    {
      taskId: "join_game_circle",
      title: "加入游戏圈",
      metricType: "join_time",
      target: 1,
      resetMode: "once",
      sortOrder: 10,
      rewardItems: [
        { id: "coin", count: 120 }
      ]
    },
    {
      taskId: "like_posts_3_daily",
      title: "每日点赞 3 个帖子",
      metricType: "today_like_post_count",
      target: 3,
      resetMode: "daily",
      sortOrder: 20,
      rewardItems: [
        { id: "coin", count: 100 }
      ]
    },
    {
      taskId: "publish_post_1_daily",
      title: "每日发表 1 个帖子",
      metricType: "today_publish_post_count",
      target: 1,
      resetMode: "daily",
      sortOrder: 30,
      rewardItems: [
        { id: "swap_ball", count: 1 }
      ]
    }
  ]
};
```

配置校验：
- `activityId` 必须是非空字符串。
- `tasks` 必须恰好包含 3 个任务。
- `taskId` 不允许重复。
- `metricType` 只允许使用 V1 支持的 3 种类型。
- `target` 必须是正整数。
- `rewardItems` 必须非空，奖励 ID 必须属于当前资源体系。
- `entry.openlink` 为空时，不向平台接口传 `openlink` 字段。

## 6. 存档结构

建议新增本地存储 key：`bubble_game_circle_welfare_state_v1`。

```js
{
  version: 1,
  activityId: "game_circle_welfare_v1",
  lastRefreshDate: "2026-04-30",
  lastRefreshAt: 1777564800000,
  metrics: {
    joinTime: 1777563000,
    todayLikePostCount: 3,
    todayPublishPostCount: 1
  },
  claimedTasks: {
    join_game_circle: true
  },
  dailyClaims: {
    "2026-04-30": {
      like_posts_3_daily: true,
      publish_post_1_daily: true
    }
  }
}
```

存档规则：
- `claimedTasks` 只记录一次性任务。
- `dailyClaims` 只记录按天领奖状态。
- 跨天后不迁移昨日未领取奖励。
- 活动版本升级时更换 `activityId`，避免旧领奖状态误用。
- 存档结构不符合预期时直接报错，不自动补全缺失字段。

## 7. 游戏圈数据映射

V1 只读取以下平台数据：

| 平台数据 | 本活动 metric | 用途 |
| --- | --- | --- |
| 加入该游戏圈时间 | `joinTime` | 判断 `join_game_circle` 是否完成 |
| 当天点赞帖子数 | `todayLikePostCount` | 判断 `like_posts_3_daily` 进度 |
| 当天发表帖子数 | `todayPublishPostCount` | 判断 `publish_post_1_daily` 进度 |

校验规则：
- `joinTime > 0` 时，加入任务进度为 1。
- `todayLikePostCount` 使用平台返回当天自然日值，最大展示为 `3/3`。
- `todayPublishPostCount` 使用平台返回当天自然日值，最大展示为 `1/1`。
- 平台数据缺字段、类型错误、解密失败或签名校验失败时，刷新失败并抛错。
- 刷新失败不改变本地任务进度，不发奖。

## 8. 活动面板

面板结构：
- 标题：`游戏圈福利`
- 顶部说明：`去游戏圈互动，回来刷新进度领取奖励`
- 入口按钮：`进入游戏圈`
- 刷新按钮：`刷新进度`
- 任务列表：3 条固定顺序展示
- 关闭按钮

任务行内容：
- 任务名称
- 奖励图标和数量
- 进度文本：`0/1`、`2/3`、`1/1`
- 状态按钮：`去完成`、`刷新`、`领取`、`已领取`

按钮状态：
- 未完成：显示 `去完成`，点击打开游戏圈。
- 平台数据已达标且未领取：显示 `领取`。
- 已领取：显示 `已领取`，按钮不可点。
- 未刷新过数据：显示 `刷新`，点击拉取游戏圈数据。

## 9. 红点规则

选关页入口红点显示条件：
- 任一任务平台数据已达标且未领取。
- 当天未刷新过游戏圈数据时不显示红点，避免用旧数据误导玩家。

红点刷新时机：
- 进入选关页后。
- 打开活动面板后。
- 点击“刷新进度”成功后。
- 领取任一任务奖励后。
- 自然日变化后。

## 10. 领取流程

领取单个任务奖励：
1. 加载活动配置并校验。
2. 加载活动存档并校验 `activityId`。
3. 执行跨天检查。
4. 根据任务 `metricType` 计算当前进度。
5. 若进度未达标，抛出 `GAME_CIRCLE_TASK_NOT_COMPLETE`。
6. 若任务已领取，抛出 `GAME_CIRCLE_TASK_ALREADY_CLAIMED`。
7. 发放奖励到 `PlayerResourceStore` 或 `InventoryStore`。
8. 写入领取状态。
9. 保存活动存档。
10. 刷新活动面板、入口红点、顶部资源和背包状态。
11. 记录 `game_circle_reward_claim_success`。

失败规则：
- 发奖失败不写入领取状态。
- 保存失败时抛错并提示“领取失败，请重试”。
- 未刷新平台数据时不允许领取。

## 11. 平台与后端要求

微信小游戏客户端：
- 使用 `wx.createGameClubButton` 创建游戏圈入口。
- 使用 `show`、`hide`、`destroy` 控制原生按钮生命周期。
- 使用 `wx.getGameClubData` 获取游戏圈加密数据。

后端或云函数：
- 解密 `encryptedData`。
- 校验 `signature`。
- 返回标准化后的 `joinTime`、`todayLikePostCount`、`todayPublishPostCount`。
- 返回结构缺字段时视为接口错误。

不允许：
- 客户端自行把“打开游戏圈”当作完成任务。
- 客户端自行伪造点赞数或发帖数。
- 平台数据获取失败时返回 0 进度后继续领取流程。

## 12. 埋点

| 事件名 | 触发时机 | 关键字段 |
| --- | --- | --- |
| `game_circle_welfare_open` | 打开活动面板 | `activityId` |
| `game_circle_entry_click` | 点击游戏圈入口 | `source`、`openlink` |
| `game_circle_data_refresh_start` | 点击刷新进度 | `activityId` |
| `game_circle_data_refresh_success` | 平台数据刷新成功 | `joinTime`、`todayLikePostCount`、`todayPublishPostCount` |
| `game_circle_data_refresh_fail` | 平台数据刷新失败 | `reason` |
| `game_circle_reward_claim_success` | 领取奖励成功 | `taskId`、`rewardItems` |
| `game_circle_reward_claim_fail` | 领取奖励失败 | `taskId`、`reason` |

## 13. 验收用例

正常路径：
- 玩家未加入游戏圈时，加入任务显示 `0/1`。
- 玩家加入游戏圈并刷新后，加入任务显示 `1/1` 且可领取。
- 玩家当天点赞 2 个帖子并刷新后，点赞任务显示 `2/3` 且不可领取。
- 玩家当天点赞 3 个帖子并刷新后，点赞任务可领取。
- 玩家当天发表 1 个帖子并刷新后，发帖任务可领取。
- 玩家领取奖励后，任务显示已领取，重复点击不能再次发奖。
- 次日进入活动后，点赞和发帖任务重置为未领取；加入任务保持已领取。

异常路径：
- 未刷新平台数据时点击领取，返回未完成错误。
- 平台数据解密失败时，活动面板保留旧状态并提示刷新失败。
- 配置缺少任一任务时，启动活动直接报错。
- 奖励配置含未知资源 ID 时，启动活动直接报错。
- 非微信小游戏环境创建入口按钮失败时，调试环境报错，不静默吞掉。

## 14. 后续实现步骤

1. 新增 `GameCircleWelfareConfig` 并写配置校验。
2. 新增 `GameCircleWelfareStore`，只负责活动独立存档。
3. 新增 `GameCircleButtonAdapter`，封装原生游戏圈按钮坐标、显示和销毁。
4. 新增 `GameCircleWelfareService`，接入平台数据刷新和奖励领取。
5. 新增活动面板 prefab 与 `GameCircleWelfareViewController`。
6. 在 `LevelView.prefab` 增加 `game_circle_btn` 入口节点。
7. 在 `LevelSelectView` 和 `GameBootstrapUiFlowMethods` 绑定入口、红点和面板打开逻辑。
8. 接入后端或云函数解密 `wx.getGameClubData` 返回数据。
9. 补充领取、跨天、平台失败、重复领取测试。

## 15. 参考资料

- 微信小游戏 `wx.createGameClubButton`：`https://developers.weixin.qq.com/minigame/dev/api/open-api/game-club/wx.createGameClubButton.html`
- 微信小游戏 `wx.getGameClubData`：`https://developers.weixin.qq.com/minigame/dev/api/open-api/game-club/wx.getGameClubData.html`
- 微信小游戏加密数据签名校验：`https://developers.weixin.qq.com/minigame/dev/guide/open-ability/signature.html`

游戏圈福利 V1 应定位为“社区行为引导 + 可校验轻奖励”。核心是用真实游戏圈数据判断任务，不用本地点击记录冒充完成状态；这样可以保护奖励发放正确性，也符合本项目 Fail-Fast 严格模式。
