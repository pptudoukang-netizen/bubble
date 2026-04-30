# 微信好友排行榜交接文档

更新时间：2026-04-30  
项目路径：`E:/coco_project/bubble`  
关联规格：`WECHAT_FRIEND_LEADERBOARD_SPEC.md`

## 1. 当前结论

微信好友排行榜 V1 已在构建产物内完成一版可验证接入：

- 主域工程：`build/wechatgame`
- 开放数据域工程：`build/bubble`
- 微信开发者工具建议打开：`build/wechatgame`
- 开放数据域入口已复制到：`build/wechatgame/bubble/index.js`

当前实现采用微信开放数据域方案，主域负责胜利后上报与显示 sharedCanvas，开放数据域负责读取好友云存储、排序并绘制榜单。

注意：`build/` 在 `.gitignore` 中，当前改动属于构建产物内修改。如果后续重新构建微信小游戏，需要重新同步这次排行榜补丁，或把逻辑迁回 `assets/scripts` 与开放数据域源码工程。

## 2. 已完成内容

### 2.1 主域配置

- `build/wechatgame/game.json` 已增加：

```json
"openDataContext": "bubble"
```

这要求开放数据域入口位于 `build/wechatgame/bubble/index.js`。

### 2.2 主域桥接

新增文件：

- `build/wechatgame/rank-main-patch.js`

接入点：

- `build/wechatgame/main.js` 在场景加载完成后执行：

```js
require('./rank-main-patch').install();
```

主域桥接职责：

- 查找当前 `GameBootstrap` 实例。
- patch `_recordCurrentLevelWin(snapshot)`，在原有通关记录完成后上报排行榜数据。
- 使用 `wx.setUserCloudStorage` 同时写入：
- `max_pass_level`
- `total_score`
- 创建 `WechatFriendRankLayer`，把开放数据域 `sharedCanvas` 贴到 Cocos Sprite 上。
- 发送开放数据域消息：
- `show_progress_rank`
- `show_total_rank`
- `hide_rank`
- `scroll_rank`
- 绑定排行榜 Tab、关闭按钮、滑动列表。

### 2.3 开放数据域绘制

主要文件：

- `build/bubble/index.js`
- `build/wechatgame/bubble/index.js`

两份文件内容一致。`build/bubble/index.js` 是已构建出的开放数据域工程入口；`build/wechatgame/bubble/index.js` 是为了让主域工程中的 `openDataContext: "bubble"` 可以直接找到子域入口。

开放数据域职责：

- 获取 `wx.getSharedCanvas()`。
- 监听 `wx.onMessage(...)`。
- 收到 `show_progress_rank` 时读取 `max_pass_level`。
- 收到 `show_total_rank` 时读取 `total_score`。
- 调用 `wx.getFriendCloudStorage` 拉取好友云存储。
- 按规格排序后绘制当前排行榜 UI。
- 支持空态、网络异常文案、Tab 高亮、列表滚动。

## 3. 数据结构与排序

### 3.1 关卡榜

云存储 key：

```txt
max_pass_level
```

value：

```json
{
  "maxPassedLevel": 30,
  "totalScoreSnapshot": 235600,
  "updatedAt": 1776931200000
}
```

排序规则：

1. `maxPassedLevel` 降序
2. `totalScoreSnapshot` 降序
3. `updatedAt` 升序

### 3.2 总分榜

云存储 key：

```txt
total_score
```

value：

```json
{
  "score": 235600,
  "passedLevel": 30,
  "updatedAt": 1776931200000
}
```

排序规则：

1. `score` 降序
2. `passedLevel` 降序
3. `updatedAt` 升序

## 4. 当前总分口径

当前没有独立的正式账号累计总分服务，因此主域补丁维护了本地排行榜状态：

- 本地存储 key：`bubble_wechat_rank_state_v1`
- 每次胜利结算后，把本局 `snapshot.winStats.totalScore` 或 `snapshot.score` 累加到 `totalScore`。
- 使用 `_currentAttemptId` 去重，避免同一次胜利状态重复触发导致重复累计。
- `maxPassedLevel` 只升不降。
- 上报时 `max_pass_level.totalScoreSnapshot` 使用当前累计总分。
- 上报时 `total_score.passedLevel` 使用当前最大通关关卡。

后续如果实现正式 `PlayerScoreService`，应把这个本地累计逻辑替换为正式账号总分来源。

## 5. UI 说明

当前开放数据域直接用 Canvas 绘制排行榜，不依赖 Cocos 子域场景。

设计目标：

- 接近现有 `RankingView` 紫色面板风格。
- 顶部标题：`好友排行榜`
- 两个 Tab：`关卡排行`、`总分排行`
- 右上角关闭按钮。
- 列表行包含：排名、头像占位、昵称、辅助信息、主数值。

当前头像处理：

- 暂未加载微信头像图片。
- 使用昵称首字作为头像占位。

原因：

- 开放数据域头像远程加载需要额外图片加载与跨域/缓存验证。
- 当前优先完成排行榜主链路与排序展示。

## 6. 验证记录

已完成本地静态验证：

- `node --check build/wechatgame/rank-main-patch.js`
- `node --check build/bubble/index.js`
- `node --check build/wechatgame/bubble/index.js`
- `node --check build/wechatgame/main.js`
- `build/wechatgame/game.json` JSON 解析通过

已完成本地 smoke test：

- 使用模拟 `wx`
- 模拟 `sharedCanvas`
- 模拟 `getFriendCloudStorage`
- 验证 `show_progress_rank`
- 验证 `show_total_rank`
- 验证 `scroll_rank`
- 验证 `hide_rank`

未完成验证：

- 微信开发者工具真机/模拟器验证。
- 真实好友云存储读写验证。
- 微信授权与好友排行榜数据可见性验证。

## 7. 微信开发者工具验证建议

1. 打开 `build/wechatgame`。
2. 确认 `game.json` 中存在 `openDataContext: "bubble"`。
3. 确认 `build/wechatgame/bubble/index.js` 存在。
4. 登录微信开发者工具账号。
5. 进入游戏并完成一局胜利。
6. 在开发者工具中检查是否调用 `wx.setUserCloudStorage`。
7. 回到选关页点击排行榜按钮。
8. 验证默认显示 `关卡排行`。
9. 点击 `总分排行`，验证列表切换。
10. 滑动排行榜列表，验证 sharedCanvas 刷新。
11. 点击右上角关闭，验证不黑屏、不遮挡后续操作。

## 8. 风险与待办

- `build/` 被忽略：重新构建会覆盖本次构建产物改动。
- 当前主域 patch 通过运行时查找 `GameBootstrap` 实例接入，后续最好迁回源码模块。
- 当前账号累计总分是本地补丁维护的累计值，不是正式独立服务。
- 当前头像用昵称首字占位，后续可接入真实 `avatarUrl` 图片绘制。
- 当前开放数据域空态和网络失败会显示文案，这是规格验收要求，不属于业务数据兜底。

## 9. 后续建议

优先把当前补丁源码化：

- 主域新增 `assets/scripts/services/RankUploadService.js`
- 主域新增 `assets/scripts/ui/WechatRankPanelController.js`
- 主域从 `GameBootstrapUiFlowMethods._recordCurrentLevelWin` 正式调用上报服务
- 开放数据域保留轻量 `index.js`，或拆成：
- `OpenDataMessageHandler`
- `FriendStorageReader`
- `RankSorter`
- `RankCanvasRenderer`

源码化后再重新构建微信小游戏，避免 `build/` 被覆盖造成排行榜功能丢失。
