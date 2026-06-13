# 关卡奖励与特殊实体配置整改规则

## 1. 文档目标

本文档用于约束下一轮关卡配置整改，覆盖以下需求：

- 每个正式关卡都必须配置金币奖励。
- 首次过关按关卡配置发放完整奖励。
- 非首次过关只发放本关配置金币的 `30%`。
- 关卡特殊实体位置需要按关卡变化，避免大量关卡复用同一组坐标。
- 配置分裂球的关卡，收集目标必须设置为分裂球同色球。
- 同类特殊实体一关内可以配置多个。
- 钥匙和锁定球必须配套配置。

本文档只定义配置口径，不直接修改任何关卡 JSON。

## 2. 适用范围

适用于全部正式关卡：

- 本地关卡：`assets/resources/config/levels/level_001.json` 到 `level_100.json`
- 远程关卡包：`remote-level-packs/levels_pack_101_200.json` 到 `levels_pack_901_1000.json`
- 根目录镜像关卡：`levels/level_001.json` 到 `levels/level_100.json`

如后续通过 `npm run generate:levels1000` 重新生成关卡，生成脚本也必须遵守本文档。

## 3. 金币奖励规则

### 3.1 必配规则

每个正式关卡的 `level.clearRewardItems` 必须包含一项金币奖励：

```json
"clearRewardItems": [
  {
    "id": "coin",
    "count": 80
  }
]
```

配置要求：

- `id` 必须为 `"coin"`。
- `count` 必须是正整数。
- 按当前 loader 约束，金币数量范围继续使用 `50~300`。
- 同一关内 `clearRewardItems` 不允许重复配置同一种 `id`。
- 若配置体力奖励，`stamina` 仍只能作为可选附加奖励，不能替代金币。

### 3.2 首次过关奖励

首次过关时：

- `coin` 按配置 `count` 全额发放。
- `stamina` 如有配置，按配置 `count` 发放。

示例：

```json
"clearRewardItems": [
  { "id": "coin", "count": 100 },
  { "id": "stamina", "count": 1 }
]
```

首次过关实际发放：

```json
[
  { "id": "coin", "count": 100 },
  { "id": "stamina", "count": 1 }
]
```

### 3.3 非首次过关奖励

非首次过关时：

- 只发放金币。
- 金币数量为本关配置金币 `count * 30%`。
- 由于奖励数量必须是整数，统一向下取整：`Math.floor(count * 0.3)`。
- `stamina` 不在非首次过关时发放。

示例：

```json
"clearRewardItems": [
  { "id": "coin", "count": 100 },
  { "id": "stamina", "count": 1 }
]
```

非首次过关实际发放：

```json
[
  { "id": "coin", "count": 30 }
]
```

如果配置金币为 `80`，非首次奖励为 `Math.floor(80 * 0.3) = 24`。

### 3.4 首次判断口径

首次过关必须在写入通关记录前判断。

当前进度结构中，`LevelProgressStore` 使用：

```json
"completedLevels": {
  "1": true
}
```

因此判断口径为：

- `completedLevels[String(levelId)] !== true`：首次过关。
- `completedLevels[String(levelId)] === true`：非首次过关。

结算顺序必须保持：

1. 读取当前 `completedLevels` 判断是否首次。
2. 按首次或非首次解析奖励。
3. 写入关卡通关记录。
4. 发放奖励并刷新资源。

不能在 `recordCompletion` 之后再判断首次，否则本次首次通关会被误判为非首次。

## 4. 特殊实体通用规则

特殊实体统一配置在 `level.specialEntities`，不写入 `layout` 字符串。

基础结构：

```json
"specialEntities": [
  {
    "id": "splitter_01",
    "entityCategory": "reactive_ball",
    "entityType": "splitter",
    "splitColor": "R",
    "row": 2,
    "col": 3
  }
]
```

通用要求：

- `id` 在单关内必须唯一。
- `row` / `col` 必须是整数。
- 同一关内不能有两个特殊实体占用同一个 `row:col`。
- 特殊实体坐标必须在 `layout` 范围内。
- 特殊实体所在 `layout[row][col]` 必须是 `"."`。
- 同类实体允许配置多个，但每个实体必须有独立 `id` 和独立坐标。

允许的实体类型：

| entityCategory | entityType | 必填额外字段 |
|---|---|---|
| `skill_ball` | `rainbow` | 无 |
| `skill_ball` | `blast` | 无 |
| `obstacle_ball` | `stone` | 无 |
| `obstacle_ball` | `ice` | `innerColor` |
| `reactive_ball` | `molotov` | `blastRadius: 2` |
| `reactive_ball` | `splitter` | `splitColor` |
| `locked_ball` | `locked` | `lockedColor`, `lockGroup` |
| `key_ball` | `key` | `unlockGroup` |

## 5. 特殊实体位置差异规则

### 5.1 单关内

单关内必须满足：

- 不允许两个特殊实体坐标相同。
- 不允许特殊实体覆盖普通颜色球。
- 不允许锁定球和钥匙在同一格。

### 5.2 跨关卡

为避免大量关卡道具位置完全一致，跨关卡需要满足：

- 相邻关卡不能使用完全相同的 `specialEntities` 坐标集合。
- 同一机制章节内，连续 `5` 关不能出现超过 `2` 关使用同一组坐标集合。
- 同类实体的主坐标需要轮换，例如 `splitter_01` 不能长期固定在同一个 `row:col`。

坐标集合按实体类型分组比较：

```text
reactive_ball:splitter => row:col,row:col
locked_ball:locked => row:col,row:col
key_ball:key => row:col,row:col
```

如果两关只是 `id` 不同，但同类实体坐标集合完全一致，仍视为重复。

## 6. 分裂球与收集目标规则

### 6.1 分裂球配置

分裂球使用：

```json
{
  "id": "splitter_01",
  "entityCategory": "reactive_ball",
  "entityType": "splitter",
  "splitColor": "R",
  "row": 2,
  "col": 3
}
```

要求：

- `splitColor` 必须存在于 `level.colors`。
- 若本关有多个分裂球，每个分裂球都必须配置 `splitColor`。
- 多个分裂球可以同色，也可以不同色；但收集目标必须能覆盖本关分裂球主设计颜色。
- 分裂球禁止配置在棋盘顶部槽位，即 `row` 不能为 `0`。

### 6.2 收集目标必须与分裂球同色

只要本关配置了 `entityType: "splitter"`，`winConditions` 中必须使用 `collect_color`，且颜色必须等于分裂球的主 `splitColor`。

推荐口径：

- 单个分裂球：`collect_color.color = splitter.splitColor`。
- 多个同色分裂球：`collect_color.color = 该共同 splitColor`。
- 多个不同色分裂球：本关必须指定一个主分裂球颜色；推荐优先统一多个分裂球为同色，避免目标表达不清。

示例：

```json
"winConditions": [
  { "type": "clear_all", "value": 1 },
  { "type": "collect_color", "color": "R", "value": 18 }
],
"specialEntities": [
  {
    "id": "splitter_01",
    "entityCategory": "reactive_ball",
    "entityType": "splitter",
    "splitColor": "R",
    "row": 2,
    "col": 3
  }
]
```

禁止配置：

```json
"winConditions": [
  { "type": "clear_all", "value": 1 },
  { "type": "collect_any", "value": 18 }
]
```

原因：本关有分裂球时，收集目标必须明确引导玩家收集分裂球同色球。

## 7. 同类特殊实体多实例规则

同一关允许配置多个同类实体。

示例：多个分裂球

```json
"specialEntities": [
  {
    "id": "splitter_01",
    "entityCategory": "reactive_ball",
    "entityType": "splitter",
    "splitColor": "R",
    "row": 2,
    "col": 3
  },
  {
    "id": "splitter_02",
    "entityCategory": "reactive_ball",
    "entityType": "splitter",
    "splitColor": "R",
    "row": 4,
    "col": 5
  }
]
```

示例：两把钥匙解两个锁定球

```json
"specialEntities": [
  {
    "id": "key_g1_01",
    "entityCategory": "key_ball",
    "entityType": "key",
    "unlockGroup": "g1",
    "row": 2,
    "col": 2
  },
  {
    "id": "key_g1_02",
    "entityCategory": "key_ball",
    "entityType": "key",
    "unlockGroup": "g1",
    "row": 2,
    "col": 6
  },
  {
    "id": "locked_g1_01",
    "entityCategory": "locked_ball",
    "entityType": "locked",
    "lockedColor": "B",
    "lockGroup": "g1",
    "row": 3,
    "col": 4
  },
  {
    "id": "locked_g1_02",
    "entityCategory": "locked_ball",
    "entityType": "locked",
    "lockedColor": "G",
    "lockGroup": "g1",
    "row": 4,
    "col": 5
  }
]
```

同类多实例要求：

- `id` 使用序号后缀，例如 `_01`、`_02`。
- 坐标不能重复。
- 如果同类实体属于同一个机制组，使用同一个 group 字段。
- 如果同类实体属于不同机制组，必须使用不同 group 字段。

## 8. 钥匙与锁定球配套规则

钥匙：

```json
{
  "id": "key_g1_01",
  "entityCategory": "key_ball",
  "entityType": "key",
  "unlockGroup": "g1",
  "row": 2,
  "col": 2
}
```

锁定球：

```json
{
  "id": "locked_g1_01",
  "entityCategory": "locked_ball",
  "entityType": "locked",
  "lockedColor": "B",
  "lockGroup": "g1",
  "row": 3,
  "col": 4
}
```

配套要求：

- 每个 `locked_ball.lockGroup` 必须有同名 `key_ball.unlockGroup`。
- 每个 `key_ball.unlockGroup` 必须有同名 `locked_ball.lockGroup`。
- 同一个 group 内，钥匙数量必须等于锁定球数量；两个锁定球必须配置两把钥匙。
- 一把钥匙只能解锁一个同组锁定球。
- `lockedColor` 必须存在于 `level.colors`。
- group 命名推荐使用 `g1`、`g2`、`g3`，或带语义的短名，如 `left_gate`。
- 多把钥匙可以指向同一个 `unlockGroup`，但同组锁定球数量必须与钥匙数量一致。

禁止配置：

```json
"specialEntities": [
  {
    "id": "locked_g1_01",
    "entityCategory": "locked_ball",
    "entityType": "locked",
    "lockedColor": "B",
    "lockGroup": "g1",
    "row": 3,
    "col": 4
  }
]
```

原因：只有锁定球，没有任何 `unlockGroup: "g1"` 的钥匙。

也禁止：

```json
"specialEntities": [
  {
    "id": "key_g2_01",
    "entityCategory": "key_ball",
    "entityType": "key",
    "unlockGroup": "g2",
    "row": 2,
    "col": 2
  }
]
```

原因：只有钥匙，没有任何 `lockGroup: "g2"` 的锁定球。

## 9. 推荐人工检查清单

每关配置完成后检查：

1. 是否配置 `clearRewardItems`。
2. `clearRewardItems` 是否包含 `id: "coin"`。
3. 金币 `count` 是否在 `50~300`。
4. 是否存在重复奖励 `id`。
5. `specialEntities` 中 `id` 是否唯一。
6. `specialEntities` 坐标是否唯一。
7. 特殊实体坐标在 `layout` 中是否为 `"."`。
8. 本关特殊实体坐标集合是否与相邻关卡完全重复。
9. 有分裂球时，`winConditions` 是否为 `clear_all + collect_color`。
10. `collect_color.color` 是否等于分裂球主 `splitColor`。
11. 分裂球坐标是否避开棋盘顶部槽位 `row: 0`。
12. 每个锁定球 `lockGroup` 是否有同名钥匙 `unlockGroup`。
13. 每把钥匙 `unlockGroup` 是否有同名锁定球 `lockGroup`。
14. 同组钥匙数量是否等于同组锁定球数量。

## 10. 后续实施注意点

当前代码中已经存在以下相关能力：

- `LevelConfigLoader` 已校验 `clearRewardItems`、`specialEntities`、`splitColor`、`lockedColor`、`lockGroup`、`unlockGroup` 的基础结构。
- `LevelConfigLoader` 会强制每关 `clearRewardItems` 包含 `coin`。
- `LevelConfigLoader` 会强制分裂球关卡使用同色 `collect_color`。
- `LevelConfigLoader` 会禁止分裂球配置在棋盘顶部槽位。
- `LevelConfigLoader` 会强制钥匙和锁定球 group 双向配套，并要求同组数量一致。
- `GameBootstrapLevelSelectFlowMethods` 已在胜利结算前判断 `isFirstCompletion`。
- `GameBootstrapLevelSelectFlowMethods` 非首次过关金币按配置数量 `30%` 向下取整发放，体力只首次发放。
- `tools/validate-level-content.js` 会离线校验金币必配、分裂球目标、分裂球顶部槽位禁配、钥匙锁配套、同组数量一致和跨关卡特殊实体坐标重复。

## 11. 一句话结论

后续关卡配置整改以本文档为准：每关配置金币，复通发 `30%` 金币；特殊实体坐标要随关卡变化；分裂球必须绑定同色收集目标且避开顶部槽位；同类实体可多配；钥匙和锁定球必须按 group 双向配套且数量一致。
