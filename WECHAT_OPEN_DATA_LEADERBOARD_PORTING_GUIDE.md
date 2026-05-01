# 微信小游戏开放数据域排行榜移植指南

更新时间：2026-05-01

本文档用于把本项目的微信好友排行榜开放数据域方案，移植到其他微信小游戏项目。

## 1. 方案组成

本方案分为两部分：

- 主域：负责上传玩家排行数据、创建排行榜弹层、把开放数据域 `sharedCanvas` 贴到主域界面。
- 开放数据域：负责读取好友云存储、排序、绘制排行榜 UI。

本项目当前文件：

- 主域补丁：`open-data/wechatgame/rank-main-patch.js`
- 开放数据域入口：`open-data/bubble/index.js`
- 开放数据域图片：`open-data/bubble/image/ranking/*.png`
- 构建后装配：`packages/build-loading-splash/main.js`
- 手动装配脚本：`tools/patch-wechat-friend-rank.js`

## 2. 必需目录结构

移植时建议保持如下结构：

```text
open-data/
  bubble/
    index.js
    image/
      ranking/
        bg.png
        btn_close.png
        1.png
        2.png
        3.png
        avatar.png
        avatar_frame.png
        item_bg_1.png
        item_bg2.png
        item_bg_3.png
  wechatgame/
    rank-main-patch.js
```

构建后的微信小游戏目录需要有：

```text
build/wechatgame/
  game.json
  main.js
  rank-main-patch.js
  bubble/
    index.js
    image/ranking/*.png
```

`game.json` 必须包含：

```json
{
  "openDataContext": "bubble"
}
```

注意：开放数据域里 `wx.createImage().src` 使用的是小游戏根目录路径。本项目图片路径写成：

```js
"bubble/image/ranking/bg.png"
```

不要写成：

```js
"image/ranking/bg.png"
```

否则微信开发者工具会去找 `build/wechatgame/image/ranking/bg.png`，导致 `ENOENT`。

## 3. 微信后台隐私配置

排行榜读取好友数据会调用：

- `wx.getFriendCloudStorage`
- `wx.setUserCloudStorage`

必须在微信公众平台配置用户隐私保护指引：

- 信息类型：`微信朋友关系`
- 用途：好友排行榜、关卡排行、总分排行等

否则会报：

```text
getFriendCloudStorage:fail api scope is not declared in the privacy agreement
errno: 112
```

主域调用敏感 API 前需要先调用：

```js
wx.requirePrivacyAuthorize(...)
```

本项目主域补丁已经做了授权单飞处理，避免同一时刻弹出多个相同授权窗。

## 4. 云存储数据结构

本方案使用两个云存储 key。

关卡进度：

```text
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

排序：

1. `maxPassedLevel` 降序
2. `totalScoreSnapshot` 降序
3. `updatedAt` 升序

总分：

```text
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

排序：

1. `score` 降序
2. `passedLevel` 降序
3. `updatedAt` 升序

## 5. 主域接入点

主域补丁需要完成四件事。

### 5.1 安装补丁

在微信小游戏构建产物的 `main.js` 场景加载成功后注入：

```js
require("./rank-main-patch").install();
```

本项目构建插件会自动插入到：

```js
console.log("Success to load scene: " + launchScene);
```

之前。

### 5.2 上传数据

本项目补丁 patch 了：

```js
GameBootstrap._recordCurrentLevelWin(snapshot)
```

胜利后会写入：

```js
wx.setUserCloudStorage({
  KVDataList: [
    { key: "max_pass_level", value: "..." },
    { key: "total_score", value: "..." }
  ]
});
```

移植到其他项目时，需要把这里替换成项目自己的胜利结算入口。

必须能拿到：

- 当前关卡 ID
- 本局得分
- 当前尝试 ID，防止同一局重复上报

### 5.3 打开排行榜

主域创建：

```text
WechatFriendRankLayer
  WechatFriendRankPanel
    WechatFriendRankSharedCanvas
```

核心逻辑：

- `wx.getOpenDataContext().canvas` 作为 `cc.Texture2D` 来源
- 把 `sharedCanvas` 贴到 `cc.Sprite`
- 打开后发送消息：

```js
wx.getOpenDataContext().postMessage({
  source: "bubble_friend_rank",
  type: "show_total_rank"
});
```

如果要打开关卡排行，发送：

```js
{
  source: "bubble_friend_rank",
  type: "show_progress_rank"
}
```

### 5.4 刷新 sharedCanvas 纹理

开放数据域绘制是异步的，主域必须持续刷新贴图：

```js
texture.handleLoadedTexture();
```

本项目在排行榜打开期间每 `0.12s` 刷新一次，关闭时停止。

不要用“发送两次 show 消息”解决首帧刷新问题。重复调用 `wx.getFriendCloudStorage` 可能叠出多个相同隐私授权弹窗。

## 6. 开放数据域协议

开放数据域只处理带有以下 source 的消息：

```js
source: "bubble_friend_rank"
```

支持消息：

```js
{ source: "bubble_friend_rank", type: "show_progress_rank" }
{ source: "bubble_friend_rank", type: "show_total_rank" }
{ source: "bubble_friend_rank", type: "hide_rank" }
{ source: "bubble_friend_rank", type: "scroll_rank", deltaY: 120 }
```

开放数据域会忽略非排行榜协议消息，避免微信工具或其他 SDK 消息误触发错误。

## 7. UI 移植

本项目开放域 UI 按主域 `RankingView` / `RankingItem` 的布局绘制：

- 画布：`720x1280`
- 面板：`645x1008`
- 列表：`593x789`
- 行项：`593x143`
- 行间距：`8`

使用图片：

```text
bg.png
btn_close.png
1.png
2.png
3.png
avatar.png
avatar_frame.png
item_bg_1.png
item_bg2.png
item_bg_3.png
```

如果移植到其他项目，优先把主域排行榜 prefab 的尺寸、坐标和图片资源同步到开放数据域，而不是重新手绘近似 UI。

## 8. 隐私授权去重

主域需要防止同一时刻多次调用：

```js
wx.requirePrivacyAuthorize
```

本项目使用：

```js
var rankPrivacyAuthorizationPending = false;
var rankPrivacyAuthorizationCallbacks = [];
```

如果授权请求正在进行，后续回调进入队列，不再弹第二个授权窗。

同时要避免同一按钮绑定两个打开排行榜事件。本项目不额外给 `ranking_btn` 绑定第二个 `TOUCH_END`，而是同步主域按钮已有的 handler。

## 9. 开放数据域请求去重

开放域中同一个 rankType 正在加载时，不重复调用：

```js
wx.getFriendCloudStorage
```

本项目使用：

```js
var currentRequestRankType = "";
```

当 `currentViewMode === "loading"` 且 rankType 相同时，直接忽略重复请求。

这不是数据兜底，只是避免敏感 API 重入导致重复授权窗。

## 10. 构建装配

Cocos Creator 重建后会覆盖 `build/wechatgame`，所以需要构建后装配。

本项目自动装配做了：

1. 写入 `game.json.openDataContext = "bubble"`
2. 复制 `open-data/bubble` 到 `build/wechatgame/bubble`
3. 复制 `open-data/wechatgame/rank-main-patch.js` 到 `build/wechatgame/rank-main-patch.js`
4. 向 `build/wechatgame/main.js` 注入：

```js
require("./rank-main-patch").install();
```

手动装配命令：

```powershell
node tools\patch-wechat-friend-rank.js
```

## 11. 常见问题

### 11.1 errno 112

原因：微信后台隐私保护指引没有声明 `微信朋友关系`，或配置未生效。

处理：

- 配置用户隐私保护指引
- 清缓存
- 重新编译

### 11.2 图片 ENOENT

错误示例：

```text
ENOENT: no such file or directory, open 'build/wechatgame/image/ranking/bg.png'
```

原因：开放域图片路径没带开放数据域目录名前缀。

应使用：

```js
"bubble/image/ranking/bg.png"
```

### 11.3 首次授权后只显示初始提示

原因：开放域首次加载图片和好友数据是异步的，主域没有持续刷新 `sharedCanvas` 贴图。

处理：打开排行榜期间持续调用：

```js
texture.handleLoadedTexture();
```

### 11.4 需要点击两次允许

原因通常是：

- 同一按钮绑定了两个排行榜打开事件
- 或重复调用 `wx.getFriendCloudStorage`

处理：

- 主域授权请求单飞
- 开放域同 rankType 加载中去重
- 不要用重复发送 `show_total_rank` 解决刷新问题

### 11.5 `Unexpected end of JSON input`

原因：本地排行状态还未创建时，某些环境 `localStorage.getItem` 返回空字符串。

处理：只把 `null`、`undefined`、空字符串视为未创建状态；非空非法 JSON 仍然直接抛错。

## 12. 移植检查清单

- `game.json` 已配置 `openDataContext`
- 开放数据域目录已复制到构建产物
- 图片路径包含开放数据域目录前缀
- 微信后台已声明 `微信朋友关系`
- 主域调用敏感 API 前已 `wx.requirePrivacyAuthorize`
- 主域没有重复绑定排行榜按钮
- 主域打开排行榜后持续刷新 `sharedCanvas`
- 开放域 `wx.getFriendCloudStorage` 有请求中去重
- 云存储 value 是合法 JSON 字符串
- 缺字段、类型错误、非法状态会直接抛错

## 13. 严格模式说明

本方案不应该添加以下逻辑：

- mock 好友数据
- 接口失败时显示空榜
- JSON 解析失败时重置为默认数据
- 云存储字段缺失时自动补全
- `catch` 后只打印日志继续运行

允许的非业务兜底只有两类：

- 忽略非排行榜协议消息，避免开放数据域消息总线误触发
- 同一敏感 API 请求中的重入去重，避免重复授权窗

除此之外，非法状态应直接抛错。
