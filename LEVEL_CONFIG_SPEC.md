# 关卡配置规范（阶段五）

## 1. 目标

本规范用于约束 `1~20` 关的配置结构，确保：

- 配置改动不依赖逻辑代码修改
- 难度曲线可量化、可回归
- 编辑目录与运行目录保持一致

## 2. 权威目录

- 运行时权威目录：`assets/resources/config/levels`
- 编辑镜像目录：`levels`

约束：所有运行配置以 `assets/resources/config/levels` 为准，修改后执行同步脚本把结果镜像到 `levels`。

## 3. 文件命名

- 文件名：`level_001.json` ~ `level_020.json`
- `level.levelId` 必须与文件编号一致
- `level.code` 必须以 `Lxxx_` 开头（例如 `L010_...`）

## 4. 核心字段约束

根节点：

- `schemaVersion = 1`
- `coordinateSystem = odd-r-hex`

`level` 节点：

- `difficulty`: `tutorial | easy | normal | hard | expert | advanced`
- `colorCount`: 必须等于 `colors.length`
- `colors`: 仅允许 `R/G/B/Y/P`，且不可重复
- `jarCount`: 必须等于 `jarColors.length`，且每关最多 `4`
- `targetScore`: 必须为正整数，表示本关 3 星目标分
- `spawnWeights`: 必须覆盖 `colors` 中所有颜色且权重 > 0
- `layout`: 每行只允许 `.` 或 `colors` 中定义的色码
- `winConditions`: 至少包含 `clear_all`

星级判定口径：

- 1 星：分数达到 `targetScore * 1 / 3`
- 2 星：分数达到 `targetScore * 2 / 3`
- 3 星：分数达到 `targetScore`

`jarRules` 建议范围：

- `rimBounce`: `[0.4, 0.95]`
- `collectZoneScale`: `[0.7, 1.4]`
- `sameColorBonus`: `[1, 3]`

## 5. 难度曲线基线

阶段五采用 5 档曲线：

- `tutorial`（1~3）：教学与基础爽点
- `easy`（4~7）：引入收集目标，保留容错
- `normal`（8~13）：四色与路径规划
- `hard`：保留兼容口径
- `expert`（14~20）：复合目标与更高压力
- `advanced`：保留兼容旧配置口径，运行时按 `normal` 处理

瞄准参数默认档位已支持 `easy` 独立配置，不再复用 `normal`。

## 6. 调试与校验脚本

在项目根目录执行：

```bash
node tools/validate-level-content.js
node tools/analyze-level-curve.js
node tools/validate-aim-profiles.js
node tools/validate-shot-regression.js
```

说明：

- `validate-level-content.js`：校验结构、字段和跨字段一致性
- `analyze-level-curve.js`：输出难度分并检查阶段内趋势
- `validate-aim-profiles.js`：校验 `aim*` 分层参数
- `validate-shot-regression.js`：校验关键关卡轨迹稳定样本

## 7. 编辑流程（建议）

1. 修改 `assets/resources/config/levels/level_xxx.json`
2. 运行内容校验和难度曲线分析
3. 执行同步脚本：

```bash
node tools/sync-level-configs.js
```

4. 再跑一次回归脚本，确认无回退
