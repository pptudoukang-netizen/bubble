import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def parse_args():
    parser = argparse.ArgumentParser(description="Process map slice images into a clean smooth black-background style.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def assert_directory(path_value, label):
    path = Path(path_value)
    if not path.exists():
        raise FileNotFoundError(f"{label} does not exist: {path}")
    if not path.is_dir():
        raise NotADirectoryError(f"{label} must be a directory: {path}")
    return path


def assert_file(path_value, label):
    path = Path(path_value)
    if not path.exists():
        raise FileNotFoundError(f"{label} does not exist: {path}")
    if not path.is_file():
        raise FileNotFoundError(f"{label} must be a file: {path}")
    return path


def list_images(input_dir):
    files = [path for path in sorted(input_dir.iterdir()) if path.suffix.lower() in IMAGE_EXTENSIONS]
    if len(files) == 0:
        raise RuntimeError(f"No supported images found: {input_dir}")
    return files


def read_rgb(path):
    image = Image.open(path).convert("RGB")
    return np.array(image)


def make_subject_mask(rgb):
    max_channel = rgb.max(axis=2)
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    mask = ((max_channel > 18) | ((max_channel > 10) & (saturation > 8))).astype(np.uint8) * 255
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    contours, _hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    clean = np.zeros_like(mask)
    image_area = mask.shape[0] * mask.shape[1]
    minimum_area = max(4, int(image_area * 0.00008))
    for contour in contours:
        if cv2.contourArea(contour) >= minimum_area:
            cv2.drawContours(clean, [contour], -1, 255, thickness=cv2.FILLED)
    clean = cv2.GaussianBlur(clean, (3, 3), 0)
    return clean


def reference_stats(reference_rgb):
    mask = make_subject_mask(reference_rgb)
    subject = reference_rgb[mask > 0]
    if subject.size == 0:
        raise RuntimeError("Reference image has no detectable subject pixels")
    hsv = cv2.cvtColor(subject.reshape((-1, 1, 3)), cv2.COLOR_RGB2HSV).reshape((-1, 3))
    return {
        "sat_p50": float(np.percentile(hsv[:, 1], 50)),
        "val_p50": float(np.percentile(hsv[:, 2], 50)),
        "sat_p85": float(np.percentile(hsv[:, 1], 85)),
        "val_p85": float(np.percentile(hsv[:, 2], 85)),
    }


def adjust_to_reference(rgb, mask, stats):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    active = mask > 0
    if np.count_nonzero(active) == 0:
        raise RuntimeError("Image has no detectable subject pixels")
    sat = hsv[:, :, 1][active]
    val = hsv[:, :, 2][active]
    sat_median = float(np.percentile(sat, 50))
    val_median = float(np.percentile(val, 50))
    if sat_median <= 0:
        raise RuntimeError("Image subject saturation is invalid")
    if val_median <= 0:
        raise RuntimeError("Image subject brightness is invalid")
    sat_scale = np.clip(stats["sat_p50"] / sat_median, 0.88, 1.18)
    val_scale = np.clip(stats["val_p50"] / val_median, 0.9, 1.15)
    hsv[:, :, 1][active] = np.clip(hsv[:, :, 1][active] * sat_scale, 0, 255)
    hsv[:, :, 2][active] = np.clip(hsv[:, :, 2][active] * val_scale, 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)


def soften_color_blocks(rgb, mask):
    active = mask > 0
    pixels = rgb[active]
    if pixels.shape[0] < 8:
        raise RuntimeError("Too few subject pixels for style processing")
    unique_colors = np.unique(pixels.reshape((-1, 3)), axis=0)
    if unique_colors.shape[0] < 8:
        return rgb
    cluster_count = int(np.clip(np.sqrt(pixels.shape[0]) / 2.5, 14, 36))
    data = pixels.astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 32, 0.8)
    _compactness, labels, centers = cv2.kmeans(data, cluster_count, None, criteria, 2, cv2.KMEANS_PP_CENTERS)
    quantized = centers[labels.flatten()].reshape((-1, 3)).astype(np.uint8)
    result = rgb.copy()
    blended = cv2.addWeighted(pixels.reshape((-1, 1, 3)), 0.72, quantized.reshape((-1, 1, 3)), 0.28, 0)
    result[active] = blended.reshape((-1, 3))
    return result


def process_image(rgb, stats):
    mask = make_subject_mask(rgb)
    denoised = cv2.fastNlMeansDenoisingColored(rgb, None, 5, 5, 7, 21)
    smooth = cv2.bilateralFilter(denoised, 7, 44, 44)
    smooth = cv2.pyrMeanShiftFiltering(smooth, 5, 12)
    adjusted = adjust_to_reference(smooth, mask, stats)
    color_blocked = soften_color_blocks(adjusted, mask)
    refined = cv2.bilateralFilter(color_blocked, 5, 28, 28)
    blurred = cv2.GaussianBlur(refined, (0, 0), 0.9)
    sharpened = cv2.addWeighted(refined, 1.08, blurred, -0.08, 0)
    alpha = (mask.astype(np.float32) / 255.0)[:, :, None]
    black = np.zeros_like(sharpened)
    composed = (sharpened.astype(np.float32) * alpha + black.astype(np.float32) * (1.0 - alpha)).astype(np.uint8)
    composed[mask < 8] = 0
    return composed


def main():
    args = parse_args()
    input_dir = assert_directory(args.input, "Input directory")
    output_dir = Path(args.output)
    reference_path = assert_file(args.reference, "Reference image")
    if output_dir.exists() and not output_dir.is_dir():
        raise NotADirectoryError(f"Output path must be a directory: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    files = list_images(input_dir)
    stats = reference_stats(read_rgb(reference_path))
    for image_path in files:
        output_path = output_dir / f"{image_path.stem}.png"
        if output_path.exists() and not args.overwrite:
            raise FileExistsError(f"Output already exists: {output_path}")
        processed = process_image(read_rgb(image_path), stats)
        Image.fromarray(processed, "RGB").save(output_path)
        print(f"[OK] {image_path.name} -> {output_path}")
    print(f"Processed {len(files)} images.")


if __name__ == "__main__":
    main()
