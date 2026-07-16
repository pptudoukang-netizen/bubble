# 微信好友排行榜开发进度交接文档

更新时间：2026-05-01

项目路径：`F:\game\bubble`

关联文档：

- `WECHAT_FRIEND_LEADERBOARD_SPEC.md`
- `WECHAT_FRIEND_LEADERBOARD_HANDOFF.md`

## 1. 当前结论

微信好友排行榜目前仍采用“源码目录 + 构建后装配”的方式接入。

核心源码位置：

- 主域排行榜补丁：`open-data/wechatgame/rank-main-patch.js`
- 开放数据域入口：`open-data/bubble/index.js`
- 构建后装配插件：`packages/build-loading-splash/main.js`
- 手动装配脚本：`tools/patch-wechat-friend-rank.js`

当前构建产物装配位置：

- `build/wechatgame/rank-main-patch.js`
- `build/wechatgame/bubble/index.js`
- `build/wechatgame/game.json`
- `build/wechatgame/main.js`

注意：`build/` 是构建产物目录。重新构建后需要确保排行榜补丁重新装配。如果 Cocos Creator 没有触发项目 package 的 `build-finished` hook，需要手动执行：

```powershell
node tools\patch-wechat-friend-rank.js
```

## 2. 已完成内容

### 2.1 构建后自动装配

已扩展 `packages/build-loading-splash/main.js`。

微信小游戏构建完成后会执行：

- 修复 `project.config.json`
- 写入 `game.json.openDataContext = "bubble"`
- 复制 `open-data/bubble` 到 `build/wechatgame/bubble`
- 复制 `open-data/wechatgame/rank-main-patch.js` 到 `build/wechatgame/rank-main-patch.js`
- 向 `build/wechatgame/main.js` 注入：

```js
require('./rank-main-patch').install();
```

如果关键文件、目录、注入点缺失，会直接抛错。

### 2.2 手动装配脚本

新增：

- `tools/patch-wechat-friend-rank.js`

用途：当 Cocos Creator 没有加载项目 package，或重构建后排行榜补丁丢失时，手动恢复排行榜产物。

命令：

```powershell
node tools\patch-wechat-friend-rank.js
```

### 2.3 主域排行榜补丁

文件：

- `open-data/wechatgame/rank-main-patch.js`

职责：

- patch `GameBootstrap._recordCurrentLevelWin(snapshot)`
- 胜利后调用 `wx.setUserCloudStorage`
- 写入 `max_pass_level`
- 写入 `total_score`
- 创建 `WechatFriendRankLayer`
- 将开放数据域 `sharedCanvas` 显示到 Cocos 节点
- 绑定排行榜按钮、Tab、关闭按钮和滚动事件

当前 UI 层级：

- `WechatFriendRankLayer`
  - 主域全屏遮罩
  - `cc.BlockInputEvents`
  - 使用 `cc.Graphics` 绘制全屏半透明遮罩
- `WechatFriendRankPanel`
  - 内部排行榜面板
  - 按 `720x1280` 等比缩放
- `WechatFriendRankSharedCanvas`
  - 显示开放数据域绘制结果

已修复：

- 排行榜位置不对：改为挂到 Cocos `Canvas` 节点下，并按父节点尺寸缩放。
- 遮罩没有覆盖全屏：主域 `WechatFriendRankLayer` 现在绘制全屏半透明遮罩。
- 开放数据域内部重复遮罩：已去掉 `open-data/bubble/index.js` 中的全屏半透明背景。
- Cocos `Error 1510`：scheduler 不再使用 `cc.director` 作为 target，改为专用 target，并调用 `scheduler.enableForTarget(target)`。

## 3. 开放数据域

文件：

- `open-data/bubble/index.js`

职责：

- 获取 `wx.getSharedCanvas()`
- 监听 `wx.onMessage`
- 处理排行榜消息：
  - `show_progress_rank`
  - `show_total_rank`
  - `hide_rank`
  - `scroll_rank`
- 读取好友云存储：
  - `max_pass_level`
  - `total_score`
- 排序并绘制排行榜 UI

已修复：

- 调试器中非排行榜消息触发报错：

```text
Open data rank message requires type.
```

现在主域发送消息会带：

```js
source: "bubble_friend_rank"
```

开放数据域只处理排行榜协议消息。微信工具或开放数据域自身的其他消息会忽略。

这不是业务数据兜底，只是消息总线协议过滤。

## 4. 数据结构

### 4.1 关卡排行

云存储 key：

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

排序规则：

1. `maxPassedLevel` 降序
2. `totalScoreSnapshot` 降序
3. `updatedAt` 升序

### 4.2 总分排行

云存储 key：

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

排序规则：

1. `score` 降序
2. `passedLevel` 降序
3. `updatedAt` 升序

## 5. 最近相关修复

### 5.1 微信开发者工具 `gameContext:1 500`

排查过程：

- 禁用排行榜后仍报错。
- 禁用 Cocos 分离引擎后仍报错。
- 最小游戏入口仍报错。
- 用户使用微信开发者工具新建空小游戏也报同样错误。

结论：

- 该问题不是本项目、排行榜、Cocos 构建产物或开放数据域导致。
- 根因在本机微信开发者工具环境、缓存或安装版本。

### 5.2 游戏圈入口图标加载失败

报错：

```text
Game circle entry icon load failed:
image/gaming_circle/jump,
Bundle resources doesn't contain image/gaming_circle/jump
```

根因：

- `image/gaming_circle/jump.png` 位于 `assets/image/gaming_circle/jump.png`
- 代码使用 `BundleLoader.loadRes("image/gaming_circle/jump")`
- 当时的旧版 `BundleLoader` 只读取内置 Resources bundle
- 该图片不在旧版内置资源目录，因此运行时加载失败；当前工程已移除该 bundle

当前源码修复：

- `assets/scripts/bootstrap/GameBootstrapUiFlowMethods.js`
- 已移除运行时加载 `image/gaming_circle/jump`
- 改为使用 `LevelView.prefab` 中 `game_circle_btn` 自带的 `spriteFrame`
- 如果 prefab 缺图，直接抛错：

```text
game_circle_btn is missing prefab spriteFrame.
```

注意：这项源码修复需要重新构建 Cocos 产物后才会进入 `build/wechatgame/assets/main/index.js`。

## 6. 验证命令

排行榜补丁语法检查：

```powershell
node --check open-data\wechatgame\rank-main-patch.js
node --check open-data\bubble\index.js
```

当前微信产物语法检查：

```powershell
node --check build\wechatgame\rank-main-patch.js
node --check build\wechatgame\bubble\index.js
```

游戏圈入口源码语法检查：

```powershell
node --check assets\scripts\bootstrap\GameBootstrapUiFlowMethods.js
```

重构建后装配排行榜：

```powershell
node tools\patch-wechat-friend-rank.js
```

## 7. 微信开发者工具测试流程

1. 使用 Cocos Creator 重新构建微信小游戏。
2. 执行：

```powershell
node tools\patch-wechat-friend-rank.js
```

3. 微信开发者工具打开：

```text
F:\game\bubble\build\wechatgame
```

4. 清缓存并重新编译。
5. 完成一局胜利。
6. 检查是否调用 `wx.setUserCloudStorage`。
7. 回到选关页，点击排行榜按钮。
8. 验证：

- 全屏半透明遮罩覆盖正常
- 排行榜面板居中且尺寸正确
- 关卡排行默认显示
- 总分排行 Tab 可切换
- 列表可滚动
- 关闭按钮可关闭
- 关闭后不遮挡底层操作

## 8. 调试脚本

以下脚本用于问题隔离：

- `tools/disable-wechat-friend-rank-for-debug.js`
- `tools/disable-wechat-separate-engine-for-debug.js`
- `tools/enable-wechat-minimal-boot-for-debug.js`
- `tools/restore-wechat-debug-backup.js`

这些脚本只用于定位问题，不是正式构建流程的一部分。

## 9. 当前风险和待办

1. 主域排行榜逻辑仍是构建后补丁形式，尚未完全源码化到 `assets/scripts`。
2. Cocos Creator 未必稳定触发 `packages/build-loading-splash` 的 `build-finished` hook，因此保留手动装配脚本。
3. `build/` 仍是产物目录，重构建会覆盖其中内容。
4. 真实好友云存储、微信授权、好友可见性仍需真机或开发者工具登录账号验证。
5. 开放数据域头像目前仍为昵称首字占位，未接入真实 `avatarUrl` 图片绘制。
6. 总分目前仍依赖本地累计状态，不是正式账号总分服务。

## 10. 严格模式说明

本次排行榜相关修复没有新增业务兜底逻辑。

已保留 Fail-Fast 行为：

- 缺少微信 API 时直接抛错
- 缺少 `sharedCanvas` 时直接抛错
- 云存储数据结构非法时直接抛错
- prefab 缺少必需节点或必需组件时直接抛错
- 游戏圈入口按钮缺少 prefab spriteFrame 时直接抛错

存在的非业务兜底：

- 开放数据域只忽略非排行榜协议消息。这是消息总线过滤，不是业务数据兜底。
- 开放数据域网络失败时显示错误文案。这是 UI 验收要求，不是排行榜数据兜底。
