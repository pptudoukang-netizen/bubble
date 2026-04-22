# 关卡配置规范

## 1. 文档目标

本文档用于总结当前版本的关卡设计规则，并约束关卡 JSON 的字段结构、难度曲线和配置口径。

当前版本已经覆盖：

- 正式关卡：`1~30`
- 示例关卡：`level_021_special_entities_example.json`
- 特殊实体：
  - `彩虹技能球`
  - `炸裂技能球`
  - `石头障碍球`
  - `冰冻障碍球`

本文档是当前关卡配置的总说明。  
特殊实体的单独字段说明，见：

- [LEVEL_SPECIAL_ENTITIES_SPEC.md](E:\cocos_project\bubble\LEVEL_SPECIAL_ENTITIES_SPEC.md)

## 2. 当前关卡设计总结

### 2.1 核心过关规则

当前版本的关卡默认以 `winConditions` 作为通关依据。

统一口径：

- 必须完成 `clear_all`
- 同时完成本关配置的收集目标

当前正式关卡中，`winConditions` 主要采用两类组合：

- `clear_all + collect_any`
- `clear_all + collect_color`

`bonusObjectives` 为附加挑战，不影响通关本身。

### 2.2 当前难度设计规则

当前版本采用：

- 难度总分满分 `100`
- 第 `1~2` 关为低难教学关
- 第 `3` 关开始直接进入高强度曲线

当前曲线：

- `1~2` 关：`difficultyScore = 10`
- `3~9` 关：`70~79`
- `10~15` 关：`80~88`
- `16~24` 关：`90~99`
- `25~30` 关：`100`

### 2.3 当前球量规则

当前正式关卡采用以下总球量约束：

- 每关玻璃球总数不少于 `30`
- 每关玻璃球总数不大于 `60`

这里的“总球数”包括：

- `layout` 中的普通颜色球
- `specialEntities` 中的技能球和障碍球

当前 `1~30` 关实际范围：

- 最少：`30`
- 最多：`58`

### 2.4 当前收集目标规则

当前版本收集目标随难度递增：

- 前期较低
- 后期持续上升

当前 `1~30` 关收集目标范围：

- 最低：`2`
- 最高：`32`

目标类型：

- `collect_any`
- `collect_color`

### 2.5 当前发射球数量规则

当前版本发射球数量也采用递增设计。

当前 `1~30` 关发射球数量范围：

- 最低：`18`
- 最高：`40`

说明：

- 当前配置按你的最新要求，难度越高，发射球数量也越高
- 这套规则是当前项目的既定口径

### 2.6 当前特殊实体引入节奏

当前正式关卡的设计节奏如下：

- `1~9` 关：无特殊实体，先强调基础结构和收集
- `10` 关开始：引入 `石头障碍球`
- `12` 关开始：引入 `彩虹技能球`
- `14` 关开始：引入 `炸裂技能球`
- `16` 关开始：引入 `冰冻障碍球`
- `20` 关以后：进入多系统复合局面

## 3. 权威文件与目录

当前项目中的主要关卡文件：

- 总表：
  - [LEVEL_CONFIG_SAMPLE.json](E:\cocos_project\bubble\LEVEL_CONFIG_SAMPLE.json)
- 单关目录：
  - [levels](E:\cocos_project\bubble\levels)

当前正式单关文件：

- `level_001.json` 到 `level_030.json`

当前示例文件：

- `level_021_special_entities_example.json`

说明：

- 正式关卡以 `level_001.json ~ level_030.json` 为准
- `level_021_special_entities_example.json` 仅作为字段示例，不计入正式关卡序列

## 4. 文件命名规范

- 文件名格式：`level_001.json`
- `level.levelId` 必须和文件编号一致
- `level.code` 必须以 `Lxxx_` 开头

例如：

- `level_020.json`
- `code = "L020_MVP_FINALE"`

## 5. 顶层结构规范

每个单关文件采用如下结构：

```json
{
  "schemaVersion": 1,
  "gameMode": "glass_marble_bubble",
  "coordinateSystem": "odd-r-hex",
  "layoutNotes": {},
  "sharedDefaults": {},
  "level": {},
  "difficultyScaleMax": 100
}
```

约束：

- `schemaVersion = 1`
- `gameMode = "glass_marble_bubble"`
- `coordinateSystem = "odd-r-hex"`
- `difficultyScaleMax = 100`

## 6. `level` 节点字段规范

### 6.1 基础字段

- `levelId`
- `code`
- `difficulty`
- `difficultyScore`
- `teaches`
- `colorCount`
- `colors`
- `shotLimit`
- `dropInterval`
- `jarCount`
- `jarColors`
- `spawnWeights`
- `jarRules`
- `winConditions`
- `bonusObjectives`
- `layout`
- `designNotes`

### 6.2 当前 `difficulty` 可用值

- `tutorial`
- `advanced`
- `hard`
- `expert`

说明：

- 当前正式配置已不再使用 `easy` / `normal`
- 如果后续需要补回这两个标签，必须同步更新设计文档和分析脚本

### 6.3 `difficultyScore`

- 范围：`1~100`
- 当前项目中满分固定为 `100`
- 必须与 `difficultyScaleMax` 保持一致口径

### 6.4 `colorCount` 与 `colors`

约束：

- `colorCount` 必须等于 `colors.length`
- 当前正式版本主要使用：
  - `3` 色
  - `4` 色

### 6.5 `shotLimit`

当前项目口径：

- 随难度递增
- 必须是正整数

### 6.6 `dropInterval`

说明：

- 表示顶部下压节奏
- 数值越小，压力越高

当前曲线：

- 低难：`8`
- 中段：`5~4`
- 高段：`3~2`

### 6.7 `jarCount` 与 `jarColors`

约束：

- `jarCount` 必须等于 `jarColors.length`
- 当前版本最多 `4`

### 6.8 `spawnWeights`

约束：

- 必须覆盖 `colors` 中所有颜色
- 所有权重必须大于 `0`

### 6.9 `layout`

约束：

- 每一行必须是字符串
- 每个字符只能是：
  - `.`
  - 当前 `colors` 中定义的颜色码
- `layout` 仅用于普通颜色球和空位
- 不要把技能球和障碍球直接写进 `layout`

### 6.10 `winConditions`

当前正式关卡规则：

- 必须包含 `clear_all`
- 必须再包含一个收集目标：
  - `collect_any`
  - 或 `collect_color`

### 6.11 `bonusObjectives`

只作为附加挑战使用，常见类型：

- `collect_any`
- `collect_color`
- `collect_same_color_bonus_hits`
- `clear_with_shots_remaining`
- `single_turn_drop_count`

## 7. 特殊实体配置规则

当前推荐使用：

- `specialEntities`

它用于放置：

- `skill_ball`
- `obstacle_ball`

当前可用实体类型：

- 技能球：
  - `rainbow`
  - `blast`
- 障碍球：
  - `stone`
  - `ice`

冰冻球额外字段：

- `innerColor`

详细说明见：

- [LEVEL_SPECIAL_ENTITIES_SPEC.md](E:\cocos_project\bubble\LEVEL_SPECIAL_ENTITIES_SPEC.md)

## 8. 当前难度曲线摘要

下面是当前 `1~30` 关的整体设计摘要：

### 8.1 教学段

- `1~2` 关
- 低难教学
- 球量 `30~32`
- 发射球 `18~19`
- 收集目标 `2~3`

### 8.2 高压引入段

- `3~9` 关
- 难度分从 `70` 起跳
- 球量 `34~38`
- 发射球 `20~23`
- 收集目标 `4~10`
- 无特殊实体，以结构和收集要求提压

### 8.3 中段机制引入

- `10~15` 关
- 难度分 `80~88`
- 球量 `39~43`
- 发射球 `24~26`
- 收集目标 `11~16`
- 开始引入：
  - `stone`
  - `rainbow`
  - `blast`

### 8.4 高段复合挑战

- `16~24` 关
- 难度分 `90~99`
- 球量 `44~52`
- 发射球 `27~34`
- 收集目标 `17~26`
- 开始引入：
  - `ice`
  - 技能球与障碍球混合布局

### 8.5 终段满分关

- `25~30` 关
- 难度分 `100`
- 球量 `54~58`
- 发射球 `35~40`
- 收集目标 `27~32`
- 多系统复合设计

## 9. 关卡设计准则

当前版本建议保持以下原则：

- 每关必须同时有“清屏压力”和“收集压力”
- 难度提升不能只靠卡步数，也要靠结构和特殊实体
- `layout` 的可读性要保留，不要因为堆密度变成纯噪音
- 特殊实体要用于制造局面问题，而不是无意义堆数量

具体建议：

- `stone` 用于封路和结构阻挡
- `ice` 用于增加“两步解题”
- `rainbow` 用于修正颜色
- `blast` 用于解结构和清障

## 10. 配置校验建议

建议加载关卡时至少检查：

1. `levelId` 与文件名一致
2. `difficultyScore` 在 `1~100`
3. 总球数在 `30~60`
4. `shotLimit` 为正整数
5. `winConditions` 包含 `clear_all`
6. `winConditions` 至少包含一个收集目标
7. `specialEntities` 坐标不能越界
8. `specialEntities` 不应和 `layout` 普通球重叠
9. `ice` 类型必须带 `innerColor`

## 11. 推荐编辑流程

推荐顺序：

1. 先确定该关的难度分和目标球量
2. 再确定收集目标和发射球数量
3. 再布置普通 `layout`
4. 最后再放 `specialEntities`
5. 修改后回查：
   - 总球数
   - 收集目标
   - 发射球数量
   - 特殊实体数量

## 12. 一句话结论

当前关卡配置的核心原则是：

- 用 `difficultyScore` 量化难度
- 用 `30~60` 的球量保证局面厚度
- 用递增的收集目标和发射球数量形成统一曲线
- 用 `specialEntities` 管理技能球与障碍球

这样既能维持策划可控性，也能让程序读取结构保持清晰稳定。
