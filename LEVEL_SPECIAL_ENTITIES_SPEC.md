# 关卡特殊球与障碍球配置说明

## 1. 目标

本文档定义关卡配置中“技能球”和“障碍球”的 JSON 字段设计，并给出在关卡中放置：

- `彩虹技能球`
- `炸裂技能球`
- `石头障碍球`

的推荐写法。

目标原则：

- 保持现有 `layout` 结构不变
- 普通颜色球与特殊实体分离配置
- 程序加载简单
- 策划修改直观、不容易写错

## 2. 推荐配置思路

建议保留当前字段：

- `layout`

继续仅表示：

- 普通颜色球
- 空位

不要把技能球和障碍球直接编码进 `layout` 字符串里。

推荐新增字段：

- `specialEntities`

这样一层负责“特殊覆盖”，语义最清楚。

## 3. 字段设计

### 3.1 顶层新增字段

放在每个 `level` 对象下：

```json
"specialEntities": []
```

若关卡没有特殊球或障碍球，则可为空数组。

### 3.2 `specialEntities` 单项结构

```json
{
  "id": "skill_rainbow_01",
  "entityCategory": "skill_ball",
  "entityType": "rainbow",
  "row": 2,
  "col": 3
}
```

### 3.3 字段说明

- `id`
  - 字符串
  - 当前关卡内唯一
  - 用于调试、日志和关卡编辑器定位

- `entityCategory`
  - 字符串
  - 可选值：
    - `skill_ball`
    - `obstacle_ball`

- `entityType`
  - 字符串
  - 当 `entityCategory = "skill_ball"` 时：
    - `rainbow`
    - `blast`
  - 当 `entityCategory = "obstacle_ball"` 时：
    - `stone`
    - `ice`

- `row`
  - 数字
  - 对应 `layout` 的行索引
  - 建议从 `0` 开始

- `col`
  - 数字
  - 对应 `layout[row]` 中的列索引
  - 建议从 `0` 开始

## 4. 放置规则

### 4.1 推荐规则

`specialEntities` 中标记的位置，在 `layout` 里建议写成：

- `.`

也就是：

- `layout` 只描述普通球
- `specialEntities` 占据那些本来为空的位置

这样可避免歧义。

### 4.2 不推荐写法

不要同时在同一个 `row + col` 位置：

- `layout` 写普通颜色球
- `specialEntities` 再覆盖一个特殊实体

虽然程序可以做“覆盖优先”，但策划表容易出错。

### 4.3 推荐校验规则

加载关卡时建议做这些检查：

1. `specialEntities` 的坐标必须在 `layout` 范围内
2. 同一格不能出现两个 `specialEntities`
3. `specialEntities` 占用格在 `layout` 中必须为 `.`
4. `entityType` 必须和 `entityCategory` 对应合法

## 5. 为什么不用单字符编码

比如不用这种方式：

```json
"layout": [
  "R.GS...."
]
```

原因：

- 可读性差
- 策划容易记错字母含义
- 后续扩展新特殊球会越来越乱
- 程序解析和调试都不如结构化字段清楚

## 6. 推荐扩展字段

首版最小实现只需要：

- `id`
- `entityCategory`
- `entityType`
- `row`
- `col`

如果后续要扩展，可以再加：

```json
{
  "innerColor": "B",
  "spawnVisible": true,
  "dropToCannonOnFall": true,
  "priority": 1,
  "notes": "Placed near center bridge to teach blast usage"
}
```

建议含义：

- `innerColor`
  - 仅 `ice` 障碍球使用
  - 表示解冻后转成的普通颜色球
  - 可选值：`R` `G` `B` `Y`

- `spawnVisible`
  - 是否在开局直接显示
  - 默认 `true`

- `dropToCannonOnFall`
  - 仅技能球使用
  - 默认 `true`

- `priority`
  - 用于编辑器或调试排序

- `notes`
  - 仅策划备注

首版可以先不实现这些扩展字段。

## 7. 推荐完整字段示例

```json
"specialEntities": [
  {
    "id": "skill_rainbow_01",
    "entityCategory": "skill_ball",
    "entityType": "rainbow",
    "row": 1,
    "col": 3
  },
  {
    "id": "skill_blast_01",
    "entityCategory": "skill_ball",
    "entityType": "blast",
    "row": 2,
    "col": 5
  },
    {
      "id": "stone_01",
      "entityCategory": "obstacle_ball",
      "entityType": "stone",
      "row": 3,
      "col": 4
    },
    {
      "id": "ice_01",
      "entityCategory": "obstacle_ball",
      "entityType": "ice",
      "row": 4,
      "col": 2,
      "innerColor": "B"
    }
  ]
```

## 8. 不同实体的程序语义

### 8.1 彩虹技能球

```json
{
  "id": "skill_rainbow_01",
  "entityCategory": "skill_ball",
  "entityType": "rainbow",
  "row": 1,
  "col": 3
}
```

语义：

- 开局在该格生成彩虹技能球
- 如果掉落成功，进入炮台作为下一发技能球

### 8.2 炸裂技能球

```json
{
  "id": "skill_blast_01",
  "entityCategory": "skill_ball",
  "entityType": "blast",
  "row": 2,
  "col": 5
}
```

语义：

- 开局在该格生成炸裂技能球
- 如果掉落成功，进入炮台作为下一发技能球

### 8.3 石头障碍球

```json
{
  "id": "stone_01",
  "entityCategory": "obstacle_ball",
  "entityType": "stone",
  "row": 3,
  "col": 4
}
```

语义：

- 开局在该格生成石头障碍球
- 不参与普通三消
- 可随断支撑掉落
- 可被炸裂技能球清除

### 8.4 冰冻障碍球

```json
{
  "id": "ice_01",
  "entityCategory": "obstacle_ball",
  "entityType": "ice",
  "row": 4,
  "col": 2,
  "innerColor": "B"
}
```

语义：

- 开局在该格生成冰冻障碍球
- 外层冰壳不参与普通三消
- `innerColor` 表示解冻后转成的普通颜色球
- 相邻消除或炸裂技能球命中后可解冻
- 解冻后按普通颜色球继续参与后续逻辑

## 9. 关卡中的典型放法

### 9.1 彩虹技能球

推荐放置在：

- 关键桥接附近
- 高收益挂点附近
- 明显能帮助玩家理解其价值的位置

不要放得过于边缘，否则玩家不容易感知价值。

### 9.2 炸裂技能球

推荐放置在：

- 结构核心附近
- 石头障碍球附近
- 明显需要“炸一下”才能通的区域附近

### 9.3 石头障碍球

推荐放置在：

- 桥接点
- 封路点
- 中心结构的关键阻挡位

首版不要铺太多，避免关卡显得生硬。

### 9.4 冰冻障碍球

推荐放置在：

- 关键颜色球位置
- 需要先处理外层、再处理内核的两步解题点
- 彩虹球和炸裂球都能影响到的局部结构里

首版建议单颗或少量出现，不要一开始就成片铺开。

## 10. 推荐落地顺序

建议程序实现时按顺序来：

1. 支持 `specialEntities` 读取
2. 支持 `rainbow`
3. 支持 `blast`
4. 支持 `stone`
5. 支持 `blast` 清除 `stone`
6. 支持 `ice + innerColor`
7. 支持相邻消除触发 `ice` 解冻

## 11. 一句话结论

关卡配置里最推荐的做法是：

- `layout` 只存普通颜色球
- `specialEntities` 单独放技能球和障碍球

这样最清晰、最稳，也最方便后续继续扩展。
