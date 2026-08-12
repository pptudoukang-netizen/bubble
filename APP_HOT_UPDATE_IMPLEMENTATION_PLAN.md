# App 端热更新整体实现方案

## 1. 文档目的

本文定义 Bubble 项目在保持当前微信小游戏正常运行的前提下，增加原生 App 热更新能力的整体方案。

本方案覆盖两类内容：

- 远程关卡数据包更新：11-1000 关 compact JSON 包。
- 局内玩法脚本更新：由 `gameplay-src` 生成的 `lazy-gameplay-code.js`。

本方案不改变当前微信小游戏的云存储 File ID、`wx.cloud.getTempFileURL`、`wx.downloadFile` 和微信构建产物。

当前工程配置使用 Cocos Creator 2.4.12，必须在该实际构建版本上验证 `cc.assetManager.loadScript`、原生下载器和 `jsb.fileUtils` API。

## 2. 当前运行链路

### 2.1 远程关卡数据

当前 `LevelManager` 的关卡分流如下：

```text
1-10     -> LevelConfigLoader -> 本地 resources 配置
11-1000  -> RemoteLevelPackLoader
          -> wx.cloud.getTempFileURL
          -> wx.downloadFile
          -> wx.env.USER_DATA_PATH 缓存
          -> SHA-256、JSON、包范围和 schema 校验
```

相关文件：

- `assets/scripts/config/LevelManager.js`
- `assets/scripts/config/RemoteLevelPackLoader.js`
- `assets/scripts/config/LevelPackManifest.js`
- `assets/scripts/config/LevelPackIntegrity.js`
- `assets/map/config/level_manifest.json`
- `remote-level-packs/level_manifest.json`

### 2.2 局内玩法脚本

当前脚本链路如下：

```text
gameplay-src/
  -> tools/build-wechat-gameplay-code.js
  -> build/wechatgame/src/lazy-gameplay-code.js
  -> 微信 GameGlobal.__BUBBLE_LAZY_GAMEPLAY_CODE_PATH__
  -> BundleLoader.ensureGameplayCodeLoaded()
```

非微信运行时当前默认使用：

```text
assets/game/generated/lazy-gameplay-code.json
```

`assets/scripts/utils/BundleLoader.js` 已支持通过
`__BUBBLE_LAZY_GAMEPLAY_CODE_PATH__` 指向外部脚本，并使用
`cc.assetManager.loadScript()` 加载，这是 App 脚本热更新的复用入口。

## 3. 总体架构

App 和微信小游戏采用两条明确隔离的资源链路：

```text
微信小游戏
  -> 当前 RemoteLevelPackLoader
  -> cloud:// File ID
  -> wx.cloud.getTempFileURL
  -> wx.downloadFile

原生 App
  -> AppLevelPackLoader
  -> HTTPS 公网 URL
  -> cc.assetManager.downloader / 原生 Downloader
  -> jsb.fileUtils 本地缓存

原生 App 脚本
  -> AppGameplayScriptUpdateService
  -> HTTPS manifest
  -> 下载到本地临时文件
  -> SHA-256 / 签名 / 脚本加载校验
  -> 设置 __BUBBLE_LAZY_GAMEPLAY_CODE_PATH__
  -> BundleLoader.ensureGameplayCodeLoaded()
```

App 不调用 `wx.cloud`，微信小游戏不读取 App manifest，也不读取 App 热更新目录。

## 4. CloudBase 资源规划

当前公网 CDN 根地址：

```text
https://636c-cloud1-d7gqettx3e9249ca1-1428064608.tcb.qcloud.la
```

### 4.1 微信小游戏目录：保持不变

```text
level-packs/
  level_manifest.json
  levels_pack_011_100.json
  levels_pack_101_200.json
  ...
```

当前微信客户端继续使用 `cloud://` File ID 解析这些文件。

### 4.2 App 关卡目录：新增

```text
app-level-packs/v1/
  level_manifest.json
  levels_pack_011_100.json
  levels_pack_101_200.json
  ...
```

示例地址：

```text
https://636c-cloud1-d7gqettx3e9249ca1-1428064608.tcb.qcloud.la/app-level-packs/v1/level_manifest.json
```

### 4.3 App 脚本目录：新增

```text
app-hotupdate/
  manifest.json
  gameplay/
    gameplay-20260710-v1/
      lazy-gameplay-code.js
```

示例地址：

```text
https://636c-cloud1-d7gqettx3e9249ca1-1428064608.tcb.qcloud.la/app-hotupdate/manifest.json
```

云存储权限使用：

```text
客户端：所有用户可读
发布账号或服务端：仅管理员可写
```

正式资源使用版本化目录和文件名，不覆盖已经发布的脚本或关卡包路径。manifest 使用短缓存或禁止长缓存，版本化脚本和关卡包可以使用长缓存。

参考：

- [CloudBase 云存储](https://docs.cloudbase.net/storage/introduce)
- [CloudBase CDN 与缓存](https://docs.cloudbase.net/storage/pg/cdn)

## 5. App 关卡 manifest

新增 App 专用 manifest，不修改现有微信 manifest。

建议本地首包文件：

```text
assets/map/config/app_level_manifest.json
```

示例：

```json
{
  "schemaVersion": 1,
  "format": "app-level-pack-bootstrap-v1",
  "version": "levels-1000-app-v1",
  "totalLevelCount": 1000,
  "localLevelMax": 10,
  "remoteManifestUrl": "https://636c-cloud1-d7gqettx3e9249ca1-1428064608.tcb.qcloud.la/app-level-packs/v1/level_manifest.json"
}
```

远程完整 manifest 的包条目使用 HTTPS URL：

```json
{
  "id": "levels_pack_011_100",
  "from": 11,
  "to": 100,
  "url": "https://636c-cloud1-d7gqettx3e9249ca1-1428064608.tcb.qcloud.la/app-level-packs/v1/levels_pack_011_100.json",
  "sha256": "64 位小写十六进制 SHA-256",
  "bytes": 123456,
  "format": "compact-schema-v2"
}
```

`LevelPackManifest.js` 应增加 App manifest 的严格校验入口，但不得改变现有微信 manifest 的校验语义。

## 6. App 脚本 manifest

脚本 manifest 使用固定地址，脚本本身使用版本化地址。

```json
{
  "schemaVersion": 1,
  "format": "app-gameplay-script-manifest-v1",
  "channel": "native-app",
  "engineVersion": "2.4.12",
  "version": "gameplay-20260710-v1",
  "updatePolicy": "optional",
  "scriptUrl": "https://636c-cloud1-d7gqettx3e9249ca1-1428064608.tcb.qcloud.la/app-hotupdate/gameplay/gameplay-20260710-v1/lazy-gameplay-code.js",
  "sha256": "64 位小写十六进制 SHA-256",
  "bytes": 123456
}
```

`updatePolicy` 只允许以下值：

```text
disabled
  不下载远程脚本。

optional
  有新版本时尝试更新。下载、校验或加载失败时，不切换 active 版本，记录明确错误。

required
  必须完成下载、校验和加载，否则禁止进入局内。
```

## 7. 脚本更新开关

增加 App 编译期开关：

```text
assets/scripts/config/AppGameplayScriptUpdateConfig.js
```

示例：

```javascript
module.exports = Object.freeze({
  enabled: true,
  manifestUrl: "https://636c-cloud1-d7gqettx3e9249ca1-1428064608.tcb.qcloud.la/app-hotupdate/manifest.json"
});
```

开关规则：

```text
enabled = false
  App 不请求远程脚本 manifest，直接使用包内脚本。

enabled = true
  App 读取远程 manifest，再由 updatePolicy 决定是否更新。
```

开关只允许在原生 App 分支读取。微信小游戏必须在进入 App 服务前直接跳过，不得请求 App manifest。

推荐生产配置：

```text
AppGameplayScriptUpdateConfig.enabled = true
远程 manifest.updatePolicy = optional
```

出现脚本异常时可以临时设置：

```text
updatePolicy = disabled
```

需要强制修复时设置：

```text
updatePolicy = required
```

## 8. App 脚本更新流程

### 8.1 下载前

1. 判断 `cc.sys.isNative === true`。
2. 判断本地 `enabled` 开关。
3. 加载并严格校验 manifest。
4. 校验 `channel`、`format`、`engineVersion`、`version`、`scriptUrl`、`sha256` 和 `bytes`。
5. 比较当前 active 脚本版本。

### 8.2 下载和校验

1. 下载到 `.part` 临时文件。
2. 校验 HTTP 状态码。
3. 校验文件字节数。
4. 校验 SHA-256。
5. 生产环境增加 manifest 数字签名校验，建议使用 App 内置公钥验证签名。
6. 校验全部通过后，原子写入版本目录。
7. 最后更新 active 版本指针。

失败时不得把临时文件、未校验文件或新版本指针当作有效脚本。

### 8.3 加载顺序

在 `BundleLoader.ensureGameplayBundleLoaded()` 之前完成脚本准备：

```text
AppGameplayScriptUpdateService.prepare()
  -> 设置 __BUBBLE_LAZY_GAMEPLAY_CODE_PATH__
  -> BundleLoader.ensureGameplayBundleLoaded()
  -> BundleLoader.ensureGameplayCodeLoaded()
  -> cc.assetManager.loadScript()
```

脚本加载完成后必须确认：

```text
__BUBBLE_LAZY_GAMEPLAY_CODE_LOADED__ === true
__BUBBLE_LAZY_GAMEPLAY_REQUIRE__ 是函数
GameManager 和 LevelRenderer 可以正常实例化
```

## 9. 建议新增和修改的文件

### 9.1 新增文件

```text
assets/scripts/config/AppGameplayScriptUpdateConfig.js
assets/scripts/config/AppGameplayScriptManifest.js
assets/scripts/config/AppLevelPackManifest.js
assets/scripts/config/AppRemoteLevelPackLoader.js
assets/scripts/services/AppGameplayScriptUpdateService.js
assets/scripts/config/RemoteLevelPackLoaderFactory.js
assets/map/config/app_level_manifest.json
tools/build-app-gameplay-code.js
tools/generate-app-level-manifest.js
tools/validate-app-hot-update.js
```

### 9.2 需要谨慎修改的文件

```text
assets/scripts/utils/BundleLoader.js
assets/scripts/bootstrap/GameBootstrapCompositionMethods.js
assets/scripts/bootstrap/GameBootstrapShared.js
package.json
PROJECT_STRUCTURE.md
```

### 9.3 明确禁止修改现有微信产物的行为

App 脚本生成器必须使用独立输出目录。不得将 App 脚本写入：

```text
build/wechatgame/src/lazy-gameplay-code.js
assets/game/generated/lazy-gameplay-code.json
```

现有 `tools/build-wechat-gameplay-code.js` 的默认输出行为必须保持不变。

## 10. 构建和发布工具

新增 App 脚本构建命令：

```text
npm run build:app-gameplay-code
```

该命令从 `gameplay-src` 生成：

```text
app-hotupdate/gameplay/<version>/lazy-gameplay-code.js
```

并生成脚本 manifest 所需的：

- version
- bytes
- sha256
- scriptUrl
- engineVersion

新增 App 关卡 manifest 生成命令：

```text
npm run generate:app-level-manifest
```

现有关卡生成命令继续只维护微信版和本地关卡数据。App manifest 由独立命令从相同的远程包生成，避免手工修改 JSON。

新增校验命令：

```text
npm run validate:app-hot-update
```

校验内容：

- App manifest schema
- HTTPS URL
- URL 不能使用 `cloud://`
- 版本号和路径一致
- bytes 与实际文件一致
- SHA-256 与实际文件一致
- 关卡包范围连续
- 脚本 manifest 的 `channel` 必须为 `native-app`

## 11. 微信小游戏不受影响的验收条件

### 11.1 代码边界

- `RemoteLevelPackLoader.js` 的微信下载逻辑不变。
- `wx.cloud.getTempFileURL` 仍然被调用。
- `wx.downloadFile` 仍然被调用。
- 微信仍然使用 `wx.env.USER_DATA_PATH`。
- 微信不会请求 `app-hotupdate/manifest.json`。
- 微信不会请求 `app-level-packs/`。

### 11.2 构建产物边界

执行微信构建后确认：

```text
build/wechatgame/src/lazy-gameplay-code.js
仍由 tools/build-wechat-gameplay-code.js 生成

build/wechatgame/game.js
仍使用 src/lazy-gameplay-code.js

build/wechatgame 中没有 App CloudBase URL
```

### 11.3 运行验证

微信小游戏至少验证：

- 启动选关页。
- 加载第 1 关。
- 加载第 11 关，触发远程关卡包。
- 加载第 100、101 和 1000 关。
- 进入局内并加载玩法脚本。
- 关闭 App 脚本开关不会改变微信行为。

## 12. App 验收条件

### 12.1 关卡数据

- 首次安装可以加载 11-1000 关。
- 重启后命中本地缓存。
- manifest 版本变化后下载新包。
- SHA-256 错误时拒绝使用文件。
- CDN 返回旧内容时不会覆盖有效缓存。

### 12.2 脚本更新

- 本地开关关闭时不请求远程脚本。
- 远程策略为 `disabled` 时不下载脚本。
- 远程脚本版本相同时不重复下载。
- 新脚本下载后可以实例化 `GameManager` 和 `LevelRenderer`。
- SHA-256 错误时不执行脚本。
- 脚本加载完成标记缺失时不切换 active 版本。
- `required` 更新失败时不能进入局内。
- `optional` 更新失败时必须产生明确错误记录，不能静默吞掉异常。

### 12.3 网络场景

- 首次下载成功。
- 下载中断。
- 下载超时。
- HTTP 403。
- HTTP 404。
- manifest JSON 非法。
- 脚本字节数不一致。
- 脚本 SHA-256 不一致。
- 设备重启后恢复到最后一个有效版本。

## 13. 校验命令建议

```text
node --check assets/scripts/config/AppGameplayScriptUpdateConfig.js
node --check assets/scripts/config/AppGameplayScriptManifest.js
node --check assets/scripts/config/AppRemoteLevelPackLoader.js
node --check assets/scripts/services/AppGameplayScriptUpdateService.js

npm run validate:app-hot-update
npm run validate:level-sync
npm run validate:levels
npm run validate:release
```

微信构建完成后额外检查：

```text
git diff -- build/wechatgame
```

若出现与 App manifest、App 脚本 URL 或 App 下载服务相关的微信构建差异，应停止发布并检查平台分支。

## 14. 平台合规提示

Cocos 原生热更新机制面向原生平台，但远程加载脚本会涉及 App Store 和 Google Play 的动态代码规则。脚本更新应限制在已审核 App 能力范围内，不应通过远程脚本改变 App 的主要用途、绕过平台安全机制或加载原生可执行代码。

参考：

- [Cocos Creator 2.4 热更新](https://docs.cocos.com/creator/2.4/manual/en/advanced-topics/hot-update.html)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Android Dynamic Code Loading](https://developer.android.com/privacy-and-security/risks/dynamic-code-loading)

## 15. 实施顺序

1. 新增 App manifest schema 和严格校验。
2. 新增 App 关卡 Loader，先完成 HTTPS 下载与本地缓存。
3. 新增 App 脚本构建器和脚本 manifest。
4. 新增脚本更新服务、SHA-256 校验和 active 版本指针。
5. 接入 `BundleLoader` 现有外部脚本路径入口。
6. 在进入局内前接入 App 更新准备流程。
7. 加入本地开关和远程 `updatePolicy`。
8. 执行微信小游戏回归验证。
9. 执行 Android、iOS 真机验证。
10. 最后再上传 CloudBase App 目录并启用远程策略。

本方案实现阶段仍应遵守项目 Fail-Fast 规则：必填字段缺失、URL 非法、校验失败、脚本加载完成标记缺失时直接报错，不使用默认配置或静默跳过。
