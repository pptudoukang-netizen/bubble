# split_ui_elements.py 参数参考

## 命令模板

```bash
python tools/split_ui_elements.py INPUT [-o OUTPUT] [OPTIONS]
```

- `INPUT`：单张图或目录（`.png` / `.webp` / `.tga` / `.bmp`）
- `-o OUTPUT`：输出目录；省略时默认为 `<图名>_slices` 或 `<目录>/split_output`
- `--recursive`：递归扫描目录

## 全部参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `--alpha-threshold` | 1 | 连通域不透明判定（0–255） |
| `--min-pixels` | 6 | 忽略像素数少于此的连通域 |
| `--min-width` | 1 | 忽略宽度小于此的导出（游戏 UI 推荐 12） |
| `--min-height` | 1 | 忽略高度小于此的导出 |
| `--padding` | 0 | 导出 bbox 四周额外透明边距 |
| `--merge-gap` | 0 | bbox 相距 ≤N 像素时合并（多段字/图标可用） |
| `--solid-alpha-threshold` | 48 | 实心核阈值；`0` 禁用上下拆分 |
| `--solid-core-min-pixels` | 200 | 参与拆分的实心核最小面积 |
| `--prefix` | element | 输出文件名前缀 |
| `--manifest-name` | split_manifest.json | 清单文件名 |
| `--min-file-size-kb` | 1 | 小于此 KB 的 PNG 删除；`0` 保留全部 |

## 调参顺序

1. 先默认 + `--min-width 12` 跑全图
2. 仍有误合并（上下两张）→ 保持 `--solid-alpha-threshold 48`，勿改连通阈值为 32 全图
3. 仍有多段字被拆开 → 谨慎增大 `--merge-gap`（仅当确认为同一 UI）
4. 噪点过多 → 增大 `--min-pixels` 或 `--min-file-size-kb`
5. 需保留极窄装饰条 → 降低 `--min-width` 并接受碎屑或改源图

## manifest 字段

每个 `components[]` 项含：`index`、`file`、`x`、`y`、`width`、`height`、`pixel_count`、`export_x`、`export_y`、`export_width`、`export_height`。
