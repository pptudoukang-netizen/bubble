"""Extract four colored jars from a level-select banner and tile on transparent canvas."""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SKY_RGB = np.array([145.0, 208.0, 251.0], dtype=np.float32)
SKY_DIST_THRESHOLD = 42.0
LOCK_GOLD_MIN_R = 175.0
LOCK_GOLD_MAX_B = 150.0
LOCK_GOLD_MIN_G = 120.0
JAR_TARGET_HEIGHT = 246
JAR_GAP = 8
CANVAS_PADDING = 12


def require_array(value: np.ndarray, description: str) -> np.ndarray:
    if value is None or not isinstance(value, np.ndarray):
        raise ValueError(description + " must be a numpy array.")
    return value


def sky_distance(rgb: np.ndarray) -> np.ndarray:
    require_array(rgb, "rgb")
    return np.sqrt(np.sum((rgb.astype(np.float32) - SKY_RGB) ** 2, axis=2))


def flood_fill_background(rgb: np.ndarray) -> np.ndarray:
    require_array(rgb, "rgb")
    height, width = rgb.shape[:2]
    dist = sky_distance(rgb)
    is_sky = dist <= SKY_DIST_THRESHOLD
    visited = np.zeros((height, width), dtype=bool)
    background = np.zeros((height, width), dtype=bool)
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
        if not is_sky[y, x]:
            continue
        background[y, x] = True
        queue.append((y - 1, x))
        queue.append((y + 1, x))
        queue.append((y, x - 1))
        queue.append((y, x + 1))

    return background


def build_lock_mask(rgb: np.ndarray) -> np.ndarray:
    require_array(rgb, "rgb")
    height, width = rgb.shape[:2]
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    gold = (r >= LOCK_GOLD_MIN_R) & (g >= LOCK_GOLD_MIN_G) & (b <= LOCK_GOLD_MAX_B)
    region = np.zeros((height, width), dtype=bool)
    y0 = int(height * 0.62)
    x0 = int(width * 0.36)
    x1 = int(width * 0.64)
    region[y0:height, x0:x1] = True
    blue_button = (
        (b >= 150.0)
        & (r <= 95.0)
        & (g <= 150.0)
        & (b > r + 35.0)
        & region
    )
    return (gold & region) | blue_button


def soften_alpha(rgba: np.ndarray) -> np.ndarray:
    require_array(rgba, "rgba")
    alpha = Image.fromarray(rgba[:, :, 3], mode="L")
    softened = alpha.filter(ImageFilter.GaussianBlur(radius=0.6))
    out = rgba.copy()
    out[:, :, 3] = np.array(softened, dtype=np.uint8)
    return out


def crop_alpha_bounds(rgba: np.ndarray) -> tuple[int, int, int, int]:
    require_array(rgba, "rgba")
    alpha = rgba[:, :, 3]
    ys, xs = np.where(alpha > 12)
    if ys.size == 0 or xs.size == 0:
        raise ValueError("jar crop has no visible pixels after background removal.")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def extract_jar_tile(rgba: np.ndarray) -> Image.Image:
    require_array(rgba, "rgba")
    rgb = rgba[:, :, :3]
    background = flood_fill_background(rgb)
    lock = build_lock_mask(rgb)
    out = rgba.copy()
    out[background | lock, 3] = 0
    out = soften_alpha(out)
    x0, y0, x1, y1 = crop_alpha_bounds(out)
    cropped = out[y0:y1, x0:x1]
    image = Image.fromarray(cropped, mode="RGBA")
    target_h = JAR_TARGET_HEIGHT
    scale = target_h / float(image.height)
    target_w = max(1, int(round(image.width * scale)))
    return image.resize((target_w, target_h), Image.Resampling.LANCZOS)


def compose_row(jar_images: list[Image.Image]) -> Image.Image:
    if len(jar_images) != 4:
        raise ValueError("expected exactly four jar images.")
    max_h = max(img.height for img in jar_images)
    total_w = sum(img.width for img in jar_images) + JAR_GAP * (len(jar_images) - 1)
    canvas = Image.new(
        "RGBA",
        (total_w + CANVAS_PADDING * 2, max_h + CANVAS_PADDING * 2),
        (0, 0, 0, 0),
    )
    x = CANVAS_PADDING
    for img in jar_images:
        y = CANVAS_PADDING + (max_h - img.height) // 2
        canvas.paste(img, (x, y), img)
        x += img.width + JAR_GAP
    return canvas


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
    width, height = source.size
    column_width = width // 4
    jars: list[Image.Image] = []
    for index in range(4):
        left = index * column_width
        right = (index + 1) * column_width if index < 3 else width
        tile = source.crop((left, 0, right, height))
        jars.append(extract_jar_tile(np.array(tile, dtype=np.uint8)))

    sheet = compose_row(jars)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, format="PNG")
    print("saved", output_path, sheet.size)


if __name__ == "__main__":
    main()
