# 无限浮岛选关地图配置规范

## 目标

新的选关地图必须先生成稳定配置文件，再由运行时按配置渲染。运行时禁止随机决定浮岛类型、关卡分布、特殊浮岛位置或坐标，避免刷新、重进、版本更新后地图布局变化。

本规范遵守项目 Fail-Fast 严格模式：配置、资源、节点结构或关卡数据不符合预期时必须直接报错，不允许写兜底逻辑、默认值补齐、静默忽略或临时兼容分支。

## 文件位置

地图配置文件固定为：

```text
assets/map/config/floating_map.json
```

`assets/map` 是名为 `map` 的小游戏分包。运行时加载地图配置和地图预制体前，必须先加载 `map` 分包。

## 配置顶层结构

```json
{
  "schemaVersion": 1,
  "targetLevelCount": 200,
  "specialInterval": 20,
  "verticalPadding": 10,
  "normalIslandCapacities": {
    "island1": 3,
    "island2": 4,
    "island3": 4,
    "island4": 4,
    "island5": 5,
    "island6": 6,
    "island7": 6,
    "island8": 6
  },
  "nodes": []
}
```

字段说明：

- `schemaVersion`：配置版本，当前必须为 `1`。
- `targetLevelCount`：地图规划关卡总数，当前目标为 `200`。
- `specialInterval`：特殊浮岛间隔，当前必须为 `20`。
- `verticalPadding`：浮岛上下留白，当前为 `10` 像素。
- `normalIslandCapacities`：普通浮岛容量表，必须与本规范一致。
- `nodes`：浮岛节点列表，必须按 `index` 从小到大连续排列。

## 浮岛节点结构

普通浮岛：

```json
{
  "index": 0,
  "type": "normal",
  "prefab": "island1",
  "capacity": 3,
  "width": 408,
  "height": 367,
  "anchorY": 0.5,
  "levelIds": [1, 2, 3],
  "y": 193.5
}
```

特殊浮岛：

```json
{
  "index": 5,
  "type": "special",
  "prefab": "landmark2",
  "capacity": 1,
  "width": 471,
  "height": 365,
  "anchorY": 0.5,
  "levelIds": [20],
  "y": 2304.5
}
```

字段说明：

- `index`：浮岛序号，从 `0` 开始，必须连续。
- `type`：浮岛类型，只允许 `"normal"` 或 `"special"`。
- `prefab`：预制体名称，不带路径和扩展名。
- `capacity`：该浮岛承载的关卡点数量。
- `width`：生成配置时读取到的 prefab 根节点宽度。
- `height`：生成配置时读取到的 prefab 根节点高度。
- `anchorY`：生成配置时读取到的 prefab 根节点纵向锚点。
- `levelIds`：该浮岛承载的关卡 ID 列表，必须按升序排列。
- `y`：该浮岛根节点在无限滚动内容坐标系中的纵向位置，必须由前序浮岛高度、`anchorY` 和 `verticalPadding` 累计计算。

## 普通浮岛容量表

普通浮岛只允许使用 `island1-8`，容量固定如下：

| 预制体 | 关卡点数量 |
|---|---:|
| `island1` | 3 |
| `island2` | 4 |
| `island3` | 4 |
| `island4` | 4 |
| `island5` | 5 |
| `island6` | 6 |
| `island7` | 6 |
| `island8` | 6 |

配置生成脚本必须同时校验对应 prefab 内实际存在的 `level_btn` 数量与容量表一致。发现不一致时直接失败。

## 特殊浮岛规则

- 每 20 关生成一个特殊浮岛。
- 特殊关卡 ID 必须为 `20, 40, 60...`。
- 特殊浮岛只允许使用 `landmark1-5`。
- 特殊浮岛 `capacity` 必须为 `1`。
- 特殊浮岛 `levelIds` 必须只有一个关卡 ID。
- 特殊浮岛 prefab 必须存在 `level_btn1`。
- 特殊浮岛 prefab 必须存在 `teleport_point/door`。

特殊关卡不能被分配到普通浮岛。

## 关卡分配规则

配置生成时按关卡 ID 从小到大生成节点：

1. 遇到非 20 倍数关卡时，分配到普通浮岛。
2. 普通浮岛的关卡数量必须等于该 prefab 的 `capacity`，最后一个普通浮岛也必须填满。
3. 遇到 20 倍数关卡时，单独生成一个特殊浮岛。
4. `nodes` 中的关卡 ID 必须覆盖 `1...targetLevelCount`，完整、唯一、升序，不能重复或跳关。
5. 进入关卡时仍由现有关卡加载链路校验 `levels/level_###.json` 是否存在；地图配置只表达 200 关规划，不在运行时补关卡配置。

如果当前关卡总数导致最后一个普通浮岛无法填满，应在生成配置阶段失败，并由关卡配置或地图规则调整解决，不允许运行时补空节点。

## 纵向布局规则

浮岛节点的 `y` 必须根据 prefab 根节点实际高度生成，不使用固定间距。

计算规则：

- 第一个浮岛底边贴内容底部，不额外留空。
- 每个浮岛的上方和下方各保留 `verticalPadding` 像素。
- 相邻两个浮岛的视觉边界之间距离为 `verticalPadding * 2`。
- 对任意节点，底边为 `y - anchorY * height`，顶边为 `y + (1 - anchorY) * height`。
- 第 0 个节点底边必须为 `0`，不额外留空。
- 第 N 个节点底边必须等于第 N-1 个节点顶边加 `verticalPadding * 2`。

## 资源路径约定

运行时按以下路径加载资源：

```text
map/prefabs/island1
map/prefabs/island2
map/prefabs/island3
map/prefabs/island4
map/prefabs/island5
map/prefabs/island6
map/prefabs/island7
map/prefabs/island8
map/prefabs/landmark1
map/prefabs/landmark2
map/prefabs/landmark3
map/prefabs/landmark4
map/prefabs/landmark5
map/prefabs/TeleportationArray
map/image/protagonist
```

配置中的 `prefab` 字段只写名称，例如 `island3` 或 `landmark4`。运行时负责拼接 `prefabs/<name>` 后从 `map` 分包加载。

## 预制体节点约定

普通浮岛 prefab：

- 根节点名称应与 prefab 名称一致。
- 必须存在 `teleport_point`。
- 必须存在与容量表一致数量的 `level_btn1...level_btnN`。
- 每个 `level_btn` 下必须存在 `level`。
- 每个 `level_btn` 下必须存在 `level_lock`。

特殊浮岛 prefab：

- 根节点名称应与 prefab 名称一致。
- 必须存在 `teleport_point`。
- `teleport_point` 下必须存在 `door`。
- 必须存在 `level_btn1`。
- `level_btn1` 下必须存在 `level`。
- `level_btn1` 下必须存在 `level_lock`。

## 运行时渲染规则

运行时只消费 `floating_map.json`，不得重新随机生成地图结构。

渲染到 `LevelView/map` 节点下：

- 保留 `LevelView/map/bg` 作为背景图。
- 在 `LevelView/map` 下创建地图滚动内容节点。
- 根据滚动位置创建可视范围及缓冲范围内的浮岛节点。
- 超出范围的浮岛节点可回收或销毁，但再次创建时必须仍按同一配置恢复。

关卡按钮状态：

- 已解锁时，`level` 显示对应关卡 ID，`level_lock` 必须隐藏。
- 未解锁时，`level_lock` 必须显示，`level` 必须隐藏。
- 只有 `levelId <= highestUnlockedLevel` 的按钮允许进入关卡。
- 已通关和星级表现沿用现有进度数据。

主角显示：

- 主角资源使用 `map/image/protagonist`。
- 主角节点挂在最新可进入关卡的 `level_btn` 下。
- 主角节点位置为 `(0, 55)`。
- 主角节点大小为 `48 x 48`。
- 同一时间只能存在一个主角节点。

传送表现：

- 普通浮岛最后一个关卡通关后，在该浮岛 `teleport_point` 位置生成 `TeleportationArray`。
- 普通浮岛最后一个关卡未通关时，不显示传送阵。
- 特殊浮岛关卡通关后，显示 `teleport_point/door`。
- 特殊浮岛关卡未通关时，隐藏 `teleport_point/door`。

背景跟随：

- 地图滚动时，`bg` 按滚动速度的 `0.05` 倍跟随。
- 当 `bg` 顶部或底部到达屏幕边界时，停止继续向该方向跟随。
- `bg` 和 `map` 尺寸必须有效，否则直接报错。

滑动手感：

- 浮岛地图必须支持拖动后的惯性滑动。
- 惯性滑动必须在内容边界停止。
- 新一轮触摸开始时必须停止上一轮惯性。

## 配置生成校验

配置生成脚本必须校验：

- `assets/map` 分包存在。
- `assets/map/prefabs/island1-8.prefab` 均存在。
- `assets/map/prefabs/landmark1-5.prefab` 均存在。
- `assets/map/prefabs/TeleportationArray.prefab` 存在。
- `assets/map/image/protagonist.png` 存在。
- 普通浮岛 prefab 的 `level_btn` 数量与容量表一致。
- 特殊浮岛 prefab 只有一个关卡点。
- 特殊浮岛 prefab 存在 `teleport_point/door`。
- 关卡 ID 在地图配置中完整覆盖 `1...targetLevelCount`，唯一、升序。
- 特殊关卡只出现在特殊浮岛。
- 普通浮岛不包含 20 倍数关卡。
- `index` 连续。
- `y === index * islandSpacingY`。
- `capacity === levelIds.length`。
- `width`、`height`、`anchorY` 与 prefab 根节点一致。
- 相邻节点纵向位置符合 `verticalPadding` 布局规则。

任何校验失败都必须让生成流程失败，不允许生成部分配置。

## 禁止行为

- 禁止运行时使用随机数决定浮岛布局。
- 禁止配置缺失时自动生成临时地图。
- 禁止 prefab 缺节点时跳过该节点继续渲染。
- 禁止关卡缺失时隐藏按钮继续运行。
- 禁止最后一个普通浮岛未填满时补空关卡、隐藏按钮或复用旧关卡。
- 禁止使用默认 prefab、默认坐标、默认尺寸、默认容量兜底。
- 禁止吞掉地图配置加载、资源加载或节点校验异常。
