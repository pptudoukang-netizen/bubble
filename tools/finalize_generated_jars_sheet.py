"""Convert generated jar sheet to true RGBA transparency and game-friendly size."""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


CANVAS_PADDING = 12
JAR_GAP = 8
JAR_TARGET_HEIGHT = 246
NEUTRAL_SPREAD_MAX = 20
NEUTRAL_LUMINANCE_MIN = 198.0


def require_array(value: np.ndarray, description: str) -> np.ndarray:
    if value is None or not isinstance(value, np.ndarray):
        raise ValueError(description + " must be a numpy array.")
    return value


def build_neutral_background_mask(rgb: np.ndarray) -> np.ndarray:
    require_array(rgb, "rgb")
    spread = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    luminance = np.mean(rgb, axis=2)
    return (spread <= NEUTRAL_SPREAD_MAX) & (luminance >= NEUTRAL_LUMINANCE_MIN)


def flood_fill_from_border(mask: np.ndarray) -> np.ndarray:
    require_array(mask, "mask")
    height, width = mask.shape
    visited = np.zeros((height, width), dtype=bool)
    selected = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((0, x))
        queue.append((height - 1, x))
    for y in range(height):
        queue.append((y, 0))
        queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        if y < 0 or y >= height or x < 0 or x >= width:
            continue
        if visited[y, x]:
            continue
        visited[y, x] = True
        if not mask[y, x]:
            continue
        selected[y, x] = True
        queue.append((y - 1, x))
        queue.append((y + 1, x))
        queue.append((y, x - 1))
        queue.append((y, x + 1))

    return selected


def crop_bounds(rgba: np.ndarray, padding: int) -> tuple[int, int, int, int]:
    require_array(rgba, "rgba")
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 12)
    if ys.size == 0:
        raise ValueError("sheet has no opaque pixels after background removal.")
    x0 = max(0, int(xs.min()) - padding)
    y0 = max(0, int(ys.min()) - padding)
    x1 = min(rgba.shape[1], int(xs.max()) + 1 + padding)
    y1 = min(rgba.shape[0], int(ys.max()) + 1 + padding)
    return x0, y0, x1, y1


def resize_to_target_height(image: Image.Image, target_height: int) -> Image.Image:
    if target_height <= 0:
        raise ValueError("target height must be positive.")
    scale = target_height / float(image.height)
    target_width = max(1, int(round(image.width * scale)))
    return image.resize((target_width, target_height), Image.Resampling.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.is_file():
        raise FileNotFoundError("input image not found: " + str(input_path))

    source = Image.open(input_path).convert("RGBA")
    rgba = np.array(source, dtype=np.uint8)
    rgb = rgba[:, :, :3]
    background = flood_fill_from_border(build_neutral_background_mask(rgb))
    rgba[background, 3] = 0

    x0, y0, x1, y1 = crop_bounds(rgba, CANVAS_PADDING)
    cropped = Image.fromarray(rgba[y0:y1, x0:x1], mode="RGBA")
    resized = resize_to_target_height(cropped, JAR_TARGET_HEIGHT)

    canvas = Image.new(
        "RGBA",
        (resized.width + CANVAS_PADDING * 2, resized.height + CANVAS_PADDING * 2),
        (0, 0, 0, 0),
    )
    canvas.paste(resized, (CANVAS_PADDING, CANVAS_PADDING), resized)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, format="PNG")
    print("saved", output_path, canvas.size)


if __name__ == "__main__":
    main()
