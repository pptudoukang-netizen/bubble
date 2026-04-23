#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Extracts key UI elements from a leaderboard mock image and lays them out onto a
transparent tiled sheet.

Why this exists:
- Some mock images include a baked checkerboard background (no alpha channel).
- UI icons (badge/avatar/star) sit on top of opaque plates, so simple alpha
  connected-component splitting does not work.

This script:
1) Removes the outer (edge-connected) background to get a transparent "whole UI".
2) Crops several regions and optionally removes their local edge-connected
   background to isolate icons.
3) Exports individual PNG sprites + a tiled preview PNG on a transparent canvas.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import sys
from dataclasses import dataclass
from typing import Iterable, Optional, Tuple

import cv2
import numpy as np
from PIL import Image


Rect = Tuple[int, int, int, int]  # (left, top, right, bottom) right/bottom are exclusive


def _load_remove_ui_background_module():
    import importlib.util

    tools_dir = os.path.dirname(os.path.abspath(__file__))
    module_path = os.path.join(tools_dir, "remove_ui_background.py")
    spec = importlib.util.spec_from_file_location("remove_ui_background", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load module: {0}".format(module_path))

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_nobg = _load_remove_ui_background_module()


@dataclass(frozen=True)
class ElementSpec:
    name: str
    rect: Rect
    remove_local_bg: bool = False
    trim: bool = True
    keep_largest_component: bool = False


def _ensure_dir(path: str) -> None:
    if not os.path.isdir(path):
        os.makedirs(path)


def _read_bgra(path: str) -> np.ndarray:
    return _nobg.open_as_bgra(path)


def _write_png(path: str, image_bgra: np.ndarray) -> None:
    _nobg.write_png(path, image_bgra)


def _crop(image_bgra: np.ndarray, rect: Rect) -> np.ndarray:
    left, top, right, bottom = rect
    height, width = image_bgra.shape[:2]
    left = max(0, min(int(left), width))
    right = max(0, min(int(right), width))
    top = max(0, min(int(top), height))
    bottom = max(0, min(int(bottom), height))
    if right <= left or bottom <= top:
        raise ValueError("Invalid crop rect: {0}".format(rect))
    return image_bgra[top:bottom, left:right].copy()


def _trim_to_visible(image_bgra: np.ndarray) -> np.ndarray:
    trimmed, _ = _nobg.trim_to_visible_bounds(image_bgra)
    return trimmed


def _remove_edge_connected_background(
    image_bgra: np.ndarray,
    *,
    tolerance: int,
    edge_width: int,
    sample_step: int,
    cluster_step: int,
    max_colors: int,
    alpha_threshold: int,
) -> np.ndarray:
    background_colors = _nobg.collect_background_colors(
        image_bgra,
        edge_width,
        sample_step,
        cluster_step,
        max_colors,
        alpha_threshold,
    )
    dynamic_tolerance = _nobg.estimate_dynamic_tolerance(
        image_bgra,
        background_colors,
        edge_width,
        sample_step,
        alpha_threshold,
        tolerance,
    )
    output, _ = _nobg.flood_remove_background(
        image_bgra,
        background_colors,
        dynamic_tolerance,
        alpha_threshold,
    )
    return output


def _panel_bbox_from_alpha(image_bgra: np.ndarray, alpha_threshold: int = 1) -> Rect:
    alpha = image_bgra[:, :, 3]
    points = cv2.findNonZero(np.where(alpha >= alpha_threshold, 255, 0).astype(np.uint8))
    if points is None:
        raise ValueError("No visible pixels found (alpha is fully transparent).")
    x, y, w, h = cv2.boundingRect(points)
    return (int(x), int(y), int(x + w), int(y + h))


def _keep_largest_alpha_component(image_bgra: np.ndarray, alpha_threshold: int = 1) -> np.ndarray:
    alpha = image_bgra[:, :, 3]
    mask = np.where(alpha >= alpha_threshold, 255, 0).astype(np.uint8)
    if cv2.countNonZero(mask) == 0:
        return image_bgra

    label_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if label_count <= 2:
        return image_bgra

    best_label = 1
    best_area = int(stats[1, cv2.CC_STAT_AREA])
    for label in range(2, label_count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area > best_area:
            best_area = area
            best_label = label

    keep = (labels == best_label)
    output = image_bgra.copy()
    output[~keep] = (0, 0, 0, 0)
    return output


def _default_output_dir(input_path: str) -> str:
    stamp = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    base = os.path.splitext(os.path.basename(input_path))[0]
    return os.path.abspath(os.path.join("temp", "ui_extract_rank_ui", "{0}_{1}".format(base, stamp)))


def _tile_images(
    entries: Iterable[Tuple[str, str]],
    *,
    out_path: str,
    padding: int = 24,
    max_width: int = 2048,
    bg_rgba: Tuple[int, int, int, int] = (0, 0, 0, 0),
) -> None:
    items = []
    for name, path in entries:
        im = Image.open(path).convert("RGBA")
        items.append((name, path, im))

    if not items:
        raise ValueError("No images to tile.")

    # Simple "shelf" packer for a compact preview sheet.
    # Order by area descending so large elements land first.
    items.sort(key=lambda item: item[2].width * item[2].height, reverse=True)

    placements = []
    cursor_x = padding
    cursor_y = padding
    row_h = 0
    sheet_w = max(padding * 2 + max(im.width for _, _, im in items), 1)

    limit_w = max(int(max_width), 256)
    for _, _, im in items:
        if cursor_x + im.width + padding > limit_w and cursor_x > padding:
            cursor_x = padding
            cursor_y += row_h + padding
            row_h = 0
        placements.append((im, cursor_x, cursor_y))
        cursor_x += im.width + padding
        row_h = max(row_h, im.height)
        sheet_w = max(sheet_w, cursor_x)

    sheet_h = cursor_y + row_h + padding
    sheet = Image.new("RGBA", (sheet_w, sheet_h), bg_rgba)
    for im, x, y in placements:
        sheet.paste(im, (x, y), im)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sheet.save(out_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract leaderboard UI elements and tile them on a transparent sheet."
    )
    parser.add_argument("input", help="Input image path (PNG/JPG/etc.).")
    parser.add_argument(
        "-o",
        "--output",
        help="Output directory. Defaults to temp/ui_extract_rank_ui/<name>_<timestamp>/",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite output directory files if they already exist.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = os.path.abspath(args.input)
    if not os.path.isfile(input_path):
        sys.stderr.write("Input not found: {0}\n".format(input_path))
        return 2

    out_dir = os.path.abspath(args.output or _default_output_dir(input_path))
    if os.path.exists(out_dir) and not args.overwrite:
        # Allow re-running without clobbering by default.
        sys.stderr.write("Output dir exists (use --overwrite): {0}\n".format(out_dir))
        return 2
    _ensure_dir(out_dir)

    # 1) Remove outer background (checkerboard / white edge), keep whole UI.
    source_bgra = _read_bgra(input_path)
    whole_ui_bgra = _remove_edge_connected_background(
        source_bgra,
        tolerance=34,
        edge_width=12,
        sample_step=1,
        cluster_step=16,
        max_colors=4,
        alpha_threshold=1,
    )

    # 2) Compute panel bbox for a stable reference (in case we later want relative specs).
    panel_bbox = _panel_bbox_from_alpha(whole_ui_bgra, alpha_threshold=1)

    # NOTE: The rects below are tuned for the provided image size (941x1672).
    # They are expressed in absolute pixels of the input image.
    specs = [
        ElementSpec("panel_whole", panel_bbox, remove_local_bg=False, trim=True),
        ElementSpec("title_bar", (80, 155, 825, 345), remove_local_bg=False, trim=True),
        ElementSpec("close_button", (785, 155, 941, 340), remove_local_bg=True, trim=True, keep_largest_component=True),
        ElementSpec("row_1", (60, 372, 885, 560), remove_local_bg=False, trim=True),
        ElementSpec("row_2", (60, 557, 885, 745), remove_local_bg=False, trim=True),
        ElementSpec("row_3", (60, 742, 885, 930), remove_local_bg=False, trim=True),
        ElementSpec("badge_1", (45, 395, 240, 575), remove_local_bg=True, trim=True, keep_largest_component=True),
        ElementSpec("badge_2", (45, 580, 240, 760), remove_local_bg=True, trim=True, keep_largest_component=True),
        ElementSpec("badge_3", (45, 765, 240, 945), remove_local_bg=True, trim=True, keep_largest_component=True),
        ElementSpec("avatar", (245, 395, 405, 575), remove_local_bg=True, trim=True, keep_largest_component=True),
        ElementSpec("star_icon", (540, 420, 690, 560), remove_local_bg=True, trim=True, keep_largest_component=True),
        ElementSpec("text_name", (360, 435, 525, 535), remove_local_bg=True, trim=True),
        ElementSpec("text_score", (655, 425, 885, 545), remove_local_bg=True, trim=True),
    ]

    saved = []
    for idx, spec in enumerate(specs, start=1):
        # Use whole_ui as base so outer background is already transparent.
        crop_source = _crop(whole_ui_bgra, spec.rect)
        if spec.remove_local_bg:
            crop_source = _remove_edge_connected_background(
                crop_source,
                tolerance=26,
                edge_width=6,
                sample_step=1,
                cluster_step=12,
                max_colors=3,
                alpha_threshold=1,
            )
            if spec.keep_largest_component:
                crop_source = _keep_largest_alpha_component(crop_source, alpha_threshold=1)
        if spec.trim:
            crop_source = _trim_to_visible(crop_source)

        filename = "{0:02d}_{1}.png".format(idx, spec.name)
        out_path = os.path.join(out_dir, filename)
        _write_png(out_path, crop_source)
        saved.append((spec.name, out_path))

    tiled_path = os.path.join(out_dir, "sheet_tiled.png")
    _tile_images(saved, out_path=tiled_path, padding=24, max_width=2048)

    print("Output:", out_dir)
    print("Panel bbox:", panel_bbox)
    print("Tiled sheet:", tiled_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
