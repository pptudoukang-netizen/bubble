# 微信好友排行榜开发文档（V1）

更新时间：2026-04-23  
项目路径：`E:/cocos_project/bubble`

## 1. 目标与范围

本版本排行榜只做微信好友范围，且仅包含两个榜单：

- `关卡排行`：按好友最大闯关数排行（最高通关关卡）
- `总分排行`：按账号维度展示好友累计总分（全局一张榜）

技术方案采用微信开放数据域（Open Data Context）实现，主域负责上报与展示入口，开放数据域负责拉取好友数据并绘制榜单。

## 2. 首版边界（必须遵守）

首版只做：

- 微信好友榜（Open Data Context）
- 关卡排行
- 总分排行

首版不做：

- 世界排行榜
- 群排行榜
- 周榜/月榜
- 跨服/后端实时排行服务
- 反作弊服务端校验

## 3. 数据键设计

云存储采用固定 key 方案：

- 关卡榜：`max_pass_level`
- 总分榜：`total_score`

说明：

- 值统一存为 JSON 字符串，便于后续扩展字段。

## 4. 值结构设计

### 4.1 关卡榜值（`max_pass_level`）

```json
{
  "maxPassedLevel": 30,
  "totalScoreSnapshot": 235600,
  "updatedAt": 1776931200000
}
```

字段说明：

- `maxPassedLevel`：最大通关关卡（主排序字段）
- `totalScoreSnapshot`：该进度下的总分快照（同关卡时辅助排序）
- `updatedAt`：更新时间戳（毫秒）

### 4.2 总分榜值（`total_score`）

```json
{
  "score": 235600,
  "passedLevel": 30,
  "updatedAt": 1776931200000
}
```

字段说明：

- `score`：累计总分（主排序字段）
- `passedLevel`：已通过最高关卡（同分时辅助排序）
- `updatedAt`：更新时间戳（毫秒）

## 5. 排序规则

### 5.1 关卡排行

- 第一排序：`maxPassedLevel` 降序
- 第二排序：`totalScoreSnapshot` 降序
- 第三排序：`updatedAt` 升序（更早达成者在前）

### 5.2 总分排行

- 第一排序：`score` 降序
- 第二排序：`passedLevel` 降序
- 第三排序：`updatedAt` 升序

## 6. 上报时机与更新策略

### 6.1 关卡排行上报

触发时机：

- 玩家关卡胜利结算后

更新规则：

- 当本次通关关卡 `levelId` 大于历史 `maxPassedLevel` 时，覆盖 `max_pass_level`
- 当 `levelId` 等于历史 `maxPassedLevel` 且 `totalScoreSnapshot` 更高时，可覆盖（用于同关卡下稳定排序）

### 6.2 总分排行上报

触发时机：

- 任意导致总分变化的时机（关卡结算、奖励发放）

更新规则：

- 以最新总分覆盖 `total_score`

## 7. 主域与开放数据域职责

### 7.1 主域职责

- 维护本地成绩与总分
- 调用 `wx.setUserCloudStorage` 上报 key/value
- 通过 `wx.getOpenDataContext().postMessage(...)` 通知开放数据域渲染指定榜单
- 将 `sharedCanvas` 贴图到 Cocos 节点显示

### 7.2 开放数据域职责

- 接收主域消息（`show_progress_rank` / `show_total_rank`）
- 调用 `wx.getFriendCloudStorage` 获取好友云存储
- 解析并排序数据
- 在 `sharedCanvas` 绘制榜单 UI

## 8. 消息协议

主域发往开放数据域：

```json
{
  "type": "show_progress_rank"
}
```

```json
{
  "type": "show_total_rank"
}
```

关闭榜单：

```json
{
  "type": "hide_rank"
}
```

## 9. 核心接口示例

### 9.1 主域上报最大闯关数

```js
function submitMaxPassLevel(levelId, totalScore) {
  const value = JSON.stringify({
    maxPassedLevel: levelId,
    totalScoreSnapshot: totalScore,
    updatedAt: Date.now()
  });

  wx.setUserCloudStorage({
    KVDataList: [{ key: "max_pass_level", value }]
  });
}
```

### 9.2 主域上报总分

```js
function submitTotalScore(totalScore, passedLevel) {
  const value = JSON.stringify({
    score: totalScore,
    passedLevel: passedLevel ?? 0,
    updatedAt: Date.now()
  });

  wx.setUserCloudStorage({
    KVDataList: [{ key: "total_score", value }]
  });
}
```

### 9.3 主域请求显示榜单

```js
function showProgressRank() {
  wx.getOpenDataContext().postMessage({
    type: "show_progress_rank"
  });
}

function showTotalRank() {
  wx.getOpenDataContext().postMessage({
    type: "show_total_rank"
  });
}
```

## 10. UI 入口建议

- 关卡排行入口：主界面、选关页
- 总分排行入口：主界面、个人信息页

展示统一使用同一排行榜面板，顶部 Tab 两项：

- `关卡排行`
- `总分排行`

## 11. 开发拆分建议

### 11.1 主域模块

- `RankUploadService`：封装上报逻辑
- `RankPanelController`：排行榜弹窗开关、消息派发
- `PlayerScoreService`：提供总分和最大闯关数查询

### 11.2 开放数据域模块

- `OpenDataMessageHandler`：消息分发
- `FriendStorageReader`：好友数据读取与解析
- `RankSorter`：排序逻辑
- `RankCanvasRenderer`：榜单绘制

## 12. 验收清单（V1）

- 能正常显示关卡排行（读取 `max_pass_level`）
- 能正常显示总分排行（读取 `total_score`）
- 同一玩家重复结算后，最大闯关数不会回退
- 最大闯关数提升后，关卡排行可刷新
- 总分变化后总分榜可刷新
- 无网络或数据缺失时榜单可降级显示（空态文案）
- 排行榜切换不卡死、不黑屏

## 13. 后续扩展（V2+）

- 世界排行榜（服务端）
- 周榜与赛季榜
- 防作弊校验与异常分过滤
- 排名奖励与邮件发放
