---
name: split-ui-elements
description: >-
  Splits transparent PNG/WebP UI sprite sheets into per-element crops using
  tools/split_ui_elements.py (alpha connected components, optional solid-core
  split for vertically stacked icons, tight bbox export). Use when the user asks
  to split/cut/export UI elements, sprite sheets, 游戏内UI, element_XXX slices,
  or run split_ui_elements.py.
---

# 透明 UI 图集拆分

## 脚本位置

`tools/split_ui_elements.py`（依赖 `opencv-python`、`numpy`）

## 标准命令

```bash
python tools/split_ui_elements.py "<输入图或目录>" -o "<输出目录>" --min-width 12
```

**bubble 游戏内 UI 示例**（已验证参数）：

```bash
python tools/split_ui_elements.py \
  "E:\coco_project\美术\泡泡龙\效果图\地图\新UI\游戏内UI.png" \
  -o "E:\coco_project\美术\泡泡龙\效果图\地图\新UI\游戏UI" \
  --min-width 12
```

执行前：若需全量重导，先删除输出目录中的 `element_*.png` 与 `split_manifest.json`。

## 工作流清单

```
- [ ] 确认输入为带透明通道的 PNG/WebP（无透明则脚本直接报错）
- [ ] 清空旧切片（全量重导时）
- [ ] 运行 split_ui_elements.py
- [ ] 核对 split_manifest.json 中的数量与坐标
- [ ] 抽查问题编号（如 element_014、底部大条、细竖条）
```

## 算法要点（勿改错方向）

1. **主路径**：`alpha >= --alpha-threshold`（默认 1）做 8 连通域，每个连通域导出**最小包围盒**。
2. **导出裁剪**：仅保留当前 label/region 像素；再按 `alpha_threshold` **收紧**包围盒，去掉底部/四周多余透明区。
3. **误合并（上下两张图粘成一块）**：启用实心核拆分（默认开启）——在同一连通域内找 `alpha >= 48` 的实心核；**仅当实心核之间有一条横向透明分隔行**时才拆（如胶片图标 + 气泡）。**禁止**用分水岭把单图标内部切碎。
4. **细竖条碎屑**（宽 5–10px、落在大条内部）：多为独立连通域，用 `--min-width 12` 过滤，不要靠提高 `--alpha-threshold` 误伤正常小图标。

## 默认参数（游戏 UI 图集）

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `--alpha-threshold` | 1 | 连通域判定 |
| `--solid-alpha-threshold` | 48 | 实心核；`0` 关闭上下拆分 |
| `--solid-core-min-pixels` | 200 | 触发拆分的最小实心核面积 |
| `--min-width` | 12 | 过滤面板内竖向碎条 |
| `--min-file-size-kb` | 1 | 过小文件不保留 |
| `--merge-gap` | 0 | 非 0 会把邻近 bbox 合并 |

完整参数表见 [reference.md](reference.md)。

## 常见问题与处理

| 现象 | 原因 | 处理 |
|------|------|------|
| 两张独立 UI 合成一张 | 半透明像素桥接 | 保持默认实心核拆分；确认上下存在透明分隔 |
| 单张图标被切成多块 | 误用分水岭/全局高 threshold | 回退脚本默认；勿设 `--peak-kernel-size`（已移除） |
| 底部大量透明边 | 光晕计入 bbox | 脚本已 `tighten_export_crop`；检查导出图 |
| element_105–114 类细竖条 | 与大条并排的独立连通域 | `--min-width 12` |
| 底部大条被拆成竖条 | 并排实心核误拆 | 已限制为「仅垂直间隙拆分」；大条应单文件导出 |

## 输出物

- `element_001.png` … 按阅读顺序编号
- `split_manifest.json`：源图、参数、每个切片的 `x/y/width/height` 与导出路径

## 项目约束

遵循根目录 `AGENTS.md`：禁止兜底/静默吞错；输入无透明、参数非法时让脚本失败并上报。

## 完成后说明

向用户报告：导出数量、输出目录、使用的关键参数、是否仍有需人工指定的 bbox（应用 `split_backpack_ui_assets.py` 类手动表）。
