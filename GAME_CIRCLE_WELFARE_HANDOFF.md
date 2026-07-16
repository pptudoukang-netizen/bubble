# 游戏圈福利功能交接文档

更新时间：2026-04-30
项目路径：`E:/coco_project/bubble`

## 1. 当前状态

游戏圈福利 V1 已完成客户端主体功能接入。

已完成：
- 新增活动设计文档：`GAME_CIRCLE_WELFARE_ACTIVITY_SPEC.md`。
- 接入选关页入口 `LevelView/bottom_layer/game_circle_btn`。
- 接入活动面板预制体 `GamingCircleView`。
- 实现 3 个任务：加入游戏圈、每日点赞 3 个帖子、每日发表 1 个帖子。
- 实现任务进度刷新、领取奖励、红点、埋点、每日重置和一次性任务领取状态。
- 使用微信游戏圈真实数据推进任务，不用点击入口作为完成依据。

未完成/待验证：
- 需要微信真机或开发者工具验证 `wx.createGameClubButton` 透明原生按钮位置。
- 需要微信真机或开发者工具验证 `wx.getGameClubData` 返回结构和 `dataType` 枚举值。
- 如平台返回的是加密数据，需要接入后端或云函数解密后再回传标准指标。

## 2. 关键文件

配置：
- `assets/scripts/config/GameCircleWelfareConfig.js`
- `assets/scripts/config/GameCircleWelfareConfig.js.meta`

存档：
- `assets/scripts/utils/GameCircleWelfareStore.js`
- `assets/scripts/utils/GameCircleWelfareStore.js.meta`
- localStorage key：`bubble_game_circle_welfare_state_v1`

平台适配：
- `assets/scripts/services/GameCircleButtonAdapter.js`
- `assets/scripts/services/GameCircleButtonAdapter.js.meta`

业务服务：
- `assets/scripts/services/GameCircleWelfareService.js`
- `assets/scripts/services/GameCircleWelfareService.js.meta`

面板控制器：
- `assets/scripts/ui/GameCircleWelfareViewController.js`
- `assets/scripts/ui/GameCircleWelfareViewController.js.meta`

启动与 UI 接入：
- `assets/scripts/bootstrap/GameBootstrap.js`
- `assets/scripts/bootstrap/GameBootstrapUiFlowMethods.js`

资源与预制体：
- `assets/ui/prefabs/GamingCircleView.prefab`
- `assets/map/prefabs/ui/LevelView.prefab`
- `assets/image/gaming_circle/*`
- `assets/image/icon/icon_gaming_circle.png`

## 3. 任务配置

当前任务位于 `GameCircleWelfareConfig.js`：

| 任务 ID | 名称 | 指标 | 目标 | 重置 | 奖励 |
| --- | --- | --- | ---: | --- | --- |
| `join_game_circle` | 加入游戏圈 | `join_time` | 1 | 一次性 | 金币 120 |
| `like_posts_3_daily` | 每日点赞3个帖子 | `today_like_post_count` | 3 | 每日 | 金币 100 |
| `publish_post_1_daily` | 每日发表1个帖子 | `today_publish_post_count` | 1 | 每日 | `swap_ball` x1 |

`dataTypes` 当前配置：

```js
dataTypes: {
  joinTime: 1,
  todayLikePostCount: 4,
  todayPublishPostCount: 6
}
```

注意：这些 `dataType` 值必须用微信游戏圈接口实际返回核对。若枚举不一致，只改配置，不改业务逻辑。

## 4. 调用链

启动初始化：
1. `GameBootstrap.onLoad`
2. 初始化 `GameCircleWelfareConfig`
3. 初始化 `GameCircleWelfareStore`
4. 初始化 `GameCircleButtonAdapter`
5. 初始化 `GameCircleWelfareService`

入口渲染：
1. `GameBootstrapUiFlowMethods._showLevelSelectView`
2. `_renderLevelSelectContent`
3. `_ensureGameCircleEntryButton`
4. 查找 `LevelView/bottom_layer/game_circle_btn`
5. 绑定点击打开 `GamingCircleView`
6. `_updateGameCircleEntryState` 更新红点

打开面板：
1. 点击 `game_circle_btn`
2. `_showGameCircleWelfareView`
3. 加载 `prefabs/ui/GamingCircleView`
4. 创建 `GameCircleWelfareViewController`
5. `_renderGameCircleWelfareView`
6. `GameCircleWelfareService.getSummary`
7. `GameCircleWelfareViewController.render`

刷新进度：
1. 面板任务按钮显示“刷新”时点击
2. `_refreshGameCircleWelfareProgress`
3. `GameCircleWelfareService.refreshMetrics`
4. `GameCircleButtonAdapter.getGameClubData`
5. `parsePlatformMetrics`
6. `GameCircleWelfareStore.markRefreshed`
7. 保存状态并刷新面板、红点

领取奖励：
1. 面板任务按钮显示“领取”时点击
2. `_claimGameCircleWelfareTask`
3. `GameCircleWelfareService.claimTask`
4. 复用 `StarChestRewardService.grantRewardItems`
5. 写入领取状态
6. 刷新资源、背包、面板和红点
7. 展示 `AwardView`

## 5. 预制体结构要求

`LevelView.prefab`：
- 必须存在 `bottom_layer`
- `bottom_layer` 下必须存在 `game_circle_btn`
- `game_circle_btn` 必须包含 `cc.Sprite`
- `game_circle_btn` 必须包含 `cc.Button`

当前 `game_circle_btn` 已在 `LevelView` 中创建，位置在 `bottom_layer` 下。

`GamingCircleView.prefab`：
- 根节点：`GamingCircleView`
- 必须存在 `mask`
- 必须存在 `Panel`
- 必须存在 `btn_close`
- 必须存在 `sure_btn`
- 必须存在 `task_list`
- `task_list` 下必须存在 `task_item1`、`task_item2`、`task_item3`

每个 `task_item` 必须包含：
- `go_btn`
- `task_name`
- `describe`
- `progress_value`
- `progressBar`
- `award_icon`
- `num`

缺任何节点都会直接报错。

## 6. 严格模式边界

已按项目 Fail-Fast 原则处理：
- 配置缺失直接报错。
- 任务数量不是 3 个直接报错。
- 任务 ID 重复直接报错。
- 奖励 ID 不属于当前资源体系直接报错。
- `GamingCircleView` 结构不符合预期直接报错。
- `LevelView/bottom_layer/game_circle_btn` 缺失直接报错。
- 平台数据缺字段、类型错误直接报错。
- 未刷新游戏圈数据不能领奖。
- 任务未完成不能领奖。
- 已领取不能重复领奖。
- 点击游戏圈入口不会推进任务进度。

没有添加任务完成兜底、默认进度兜底或 mock 数据兜底。

## 7. 已处理问题

问题：启动时报错 `this._hideGameCircleWelfareView is not a function`

处理：
- 增加内部 `hideGameCircleWelfareViewNode(host)` 清理函数。
- 各弹窗互斥关闭点改为调用该 helper，避免启动期方法映射未就绪时中断流程。

问题：`LevelView` 已新增 `game_circle_btn`

处理：
- `_ensureGameCircleEntryButton` 不再运行时创建入口按钮。
- 现在严格查找 `bottom_layer/game_circle_btn`，缺失直接报错。

## 8. 验证记录

已执行：

```powershell
node --check assets\scripts\config\GameCircleWelfareConfig.js
node --check assets\scripts\utils\GameCircleWelfareStore.js
node --check assets\scripts\services\GameCircleButtonAdapter.js
node --check assets\scripts\services\GameCircleWelfareService.js
node --check assets\scripts\ui\GameCircleWelfareViewController.js
node --check assets\scripts\bootstrap\GameBootstrap.js
node --check assets\scripts\bootstrap\GameBootstrapUiFlowMethods.js
```

已跑服务层 smoke test：
- 刷新游戏圈指标后 3 个任务可领取。
- 领取后状态写入。
- 每日任务跨天后重置进度和领取状态。

未验证：
- 微信真机原生按钮层级、位置和点击穿透。
- 微信真机 `wx.getGameClubData` 实际 `dataList` 格式。
- 真实游戏圈加入、点赞、发帖数据是否即时刷新。

## 9. 真机联调建议

1. 先确认 `game_circle_btn` 在选关页显示正常。
2. 点击入口打开 `GamingCircleView`。
3. 在微信环境确认 `sure_btn` 和未完成任务的 `go_btn` 区域上方有透明原生 `GameClubButton`。
4. 点击“刷新”触发 `wx.getGameClubData`。
5. 观察埋点：
   - `game_circle_welfare_open`
   - `game_circle_entry_click`
   - `game_circle_data_refresh_start`
   - `game_circle_data_refresh_success`
   - `game_circle_data_refresh_fail`
   - `game_circle_reward_claim_success`
   - `game_circle_reward_claim_fail`
6. 若刷新失败，优先检查 `GameCircleButtonAdapter.getGameClubData` 的返回结构。
7. 若任务进度始终为 0，优先核对 `GameCircleWelfareConfig.dataTypes`。

## 10. 已知风险

- 当前 `GameCircleButtonAdapter` 假定 `wx.getGameClubData` 返回 `dataList`，每项含 `dataType` 和 `value`。如果微信返回的是加密数据或字段名不同，需要在 adapter 或服务层增加正式解析逻辑。
- 当前透明原生按钮只在面板打开后同步；如果面板有动画、屏幕旋转或安全区变化，需要重新调用 `_renderGameCircleWelfareView` 以同步坐标。
- 非微信环境刷新会失败并提示“游戏圈数据仅微信小游戏环境可刷新”，这是预期行为。

## 11. 相关文档

- `GAME_CIRCLE_WELFARE_ACTIVITY_SPEC.md`
- 微信小游戏 `wx.createGameClubButton`：`https://developers.weixin.qq.com/minigame/dev/api/open-api/game-club/wx.createGameClubButton.html`
- 微信小游戏 `wx.getGameClubData`：`https://developers.weixin.qq.com/minigame/dev/api/open-api/game-club/wx.getGameClubData.html`
