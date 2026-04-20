#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import print_function

import argparse
import math
import os
import sys

try:
    import cv2
    import numpy as np
except ImportError:
    sys.stderr.write(
        "OpenCV is required. Install it with: pip install opencv-python numpy\n"
    )
    sys.exit(1)


SUPPORTED_EXTENSIONS = (".png", ".webp", ".tga", ".bmp", ".jpg", ".jpeg")


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Smartly remove UI image backgrounds by sampling dominant border colors "
            "and clearing only edge-connected background regions."
        )
    )
    parser.add_argument("input", help="Input image file or directory.")
    parser.add_argument(
        "-o",
        "--output",
        help="Output file or directory. Defaults to <image>_nobg.png or <dir>/nobg_output.",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Recursively scan the input directory for supported images.",
    )
    parser.add_argument(
        "--tolerance",
        type=int,
        default=28,
        help="Color distance tolerance for background matching.",
    )
    parser.add_argument(
        "--edge-width",
        type=int,
        default=2,
        help="How many pixels around the border are sampled as background candidates.",
    )
    parser.add_argument(
        "--sample-step",
        type=int,
        default=1,
        help="Border sample step. Increase it for large images to run faster.",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=1,
        help="Pixels with alpha below this are treated as transparent background.",
    )
    parser.add_argument(
        "--cluster-step",
        type=int,
        default=16,
        help="Color quantization step used to cluster border colors.",
    )
    parser.add_argument(
        "--max-colors",
        type=int,
        default=3,
        help="Maximum number of border background color clusters to keep.",
    )
    parser.add_argument(
        "--trim",
        action="store_true",
        help="Crop the output to the visible content bounds after background removal.",
    )
    parser.add_argument(
        "--suffix",
        default="_nobg",
        help="Output file suffix for processed files.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting existing output files.",
    )
    args = parser.parse_args()

    if args.tolerance < 0:
        parser.error("--tolerance must be >= 0")
    if args.edge_width < 1:
        parser.error("--edge-width must be >= 1")
    if args.sample_step < 1:
        parser.error("--sample-step must be >= 1")
    if args.alpha_threshold < 0 or args.alpha_threshold > 255:
        parser.error("--alpha-threshold must be between 0 and 255")
    if args.cluster_step < 1 or args.cluster_step > 255:
        parser.error("--cluster-step must be between 1 and 255")
    if args.max_colors < 1:
        parser.error("--max-colors must be >= 1")
    return args


def ensure_dir(path):
    if path and not os.path.isdir(path):
        os.makedirs(path)


def strip_extension(path):
    return os.path.splitext(path)[0]


def default_output_path(input_path):
    if os.path.isfile(input_path):
        return strip_extension(input_path) + "_nobg.png"
    return os.path.join(input_path, "nobg_output")


def is_supported_image(path):
    return os.path.isfile(path) and path.lower().endswith(SUPPORTED_EXTENSIONS)


def collect_input_files(input_path, recursive):
    if os.path.isfile(input_path):
        if not is_supported_image(input_path):
            raise ValueError("Unsupported image file: {0}".format(input_path))
        return [os.path.abspath(input_path)]

    if not os.path.isdir(input_path):
        raise ValueError("Input path does not exist: {0}".format(input_path))

    found = []
    if recursive:
        for root, _, files in os.walk(input_path):
            for name in files:
                full_path = os.path.join(root, name)
                if is_supported_image(full_path):
                    found.append(os.path.abspath(full_path))
    else:
        for name in os.listdir(input_path):
            full_path = os.path.join(input_path, name)
            if is_supported_image(full_path):
                found.append(os.path.abspath(full_path))

    found.sort()
    return found


def read_image_unchanged(path):
    buffer_data = np.fromfile(path, dtype=np.uint8)
    if buffer_data.size == 0:
        raise ValueError("Unable to read image data: {0}".format(path))

    image = cv2.imdecode(buffer_data, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError("Unable to decode image: {0}".format(path))
    return image


def open_as_bgra(path):
    image = read_image_unchanged(path)
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)

    channels = image.shape[2]
    if channels == 4:
        return image
    if channels == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    raise ValueError("Unsupported channel count for image: {0}".format(path))


def quantize_color(rgb, step):
    return (
        int(rgb[0] / step) * step,
        int(rgb[1] / step) * step,
        int(rgb[2] / step) * step,
    )


def color_distance(left, right):
    dr = left[0] - right[0]
    dg = left[1] - right[1]
    db = left[2] - right[2]
    return math.sqrt(dr * dr + dg * dg + db * db)


def get_border_coordinates(width, height, edge_width, sample_step):
    coordinates = []
    seen = set()
    max_edge_x = min(edge_width, width)
    max_edge_y = min(edge_width, height)

    for y in range(height):
        for x in range(width):
            if (
                x >= max_edge_x and x < width - max_edge_x and
                y >= max_edge_y and y < height - max_edge_y
            ):
                continue
            if sample_step > 1 and (x + y) % sample_step != 0:
                continue
            key = (x, y)
            if key not in seen:
                seen.add(key)
                coordinates.append(key)
    return coordinates


def collect_background_colors(image, edge_width, sample_step, cluster_step, max_colors, alpha_threshold):
    height, width = image.shape[:2]
    buckets = {}
    border_coordinates = get_border_coordinates(width, height, edge_width, sample_step)

    for x, y in border_coordinates:
        pixel = image[y, x]
        if int(pixel[3]) < alpha_threshold:
            continue

        rgb = (int(pixel[2]), int(pixel[1]), int(pixel[0]))
        bucket_key = quantize_color(rgb, cluster_step)
        if bucket_key not in buckets:
            buckets[bucket_key] = {
                "sum_r": 0,
                "sum_g": 0,
                "sum_b": 0,
                "count": 0,
            }

        bucket = buckets[bucket_key]
        bucket["sum_r"] += rgb[0]
        bucket["sum_g"] += rgb[1]
        bucket["sum_b"] += rgb[2]
        bucket["count"] += 1

    if not buckets:
        return []

    ranked = sorted(
        buckets.items(),
        key=lambda item: item[1]["count"],
        reverse=True,
    )
    background_colors = []

    for _, bucket in ranked:
        average = (
            int(round(float(bucket["sum_r"]) / bucket["count"])),
            int(round(float(bucket["sum_g"]) / bucket["count"])),
            int(round(float(bucket["sum_b"]) / bucket["count"])),
        )

        keep = True
        for existing in background_colors:
            if color_distance(average, existing) <= cluster_step:
                keep = False
                break

        if keep:
            background_colors.append(average)

        if len(background_colors) >= max_colors:
            break

    return background_colors


def estimate_dynamic_tolerance(image, background_colors, edge_width, sample_step, alpha_threshold, base_tolerance):
    if not background_colors:
        return base_tolerance

    height, width = image.shape[:2]
    border_coordinates = get_border_coordinates(width, height, edge_width, sample_step)
    distances = []

    for x, y in border_coordinates:
        pixel = image[y, x]
        if int(pixel[3]) < alpha_threshold:
            continue

        rgb = (int(pixel[2]), int(pixel[1]), int(pixel[0]))
        nearest = 1000000.0
        for background in background_colors:
            current = color_distance(rgb, background)
            if current < nearest:
                nearest = current
        distances.append(nearest)

    if not distances:
        return base_tolerance

    mean_distance = sum(distances) / float(len(distances))
    variance = 0.0
    for value in distances:
        delta = value - mean_distance
        variance += delta * delta
    variance /= float(len(distances))
    dynamic = int(round(mean_distance + math.sqrt(variance) * 2.0 + 8.0))
    if dynamic < base_tolerance:
        return base_tolerance
    if dynamic > 96:
        return 96
    return dynamic


def build_background_candidate_mask(image, background_colors, tolerance, alpha_threshold):
    alpha = image[:, :, 3]
    candidate_mask = np.where(alpha < alpha_threshold, 255, 0).astype(np.uint8)

    if not background_colors:
        return candidate_mask

    bgr = image[:, :, :3].astype(np.float32)
    nearest_distance = None

    for background in background_colors:
        background_bgr = np.array(
            [background[2], background[1], background[0]],
            dtype=np.float32,
        )
        diff = bgr - background_bgr
        distance = np.sqrt(
            diff[:, :, 0] * diff[:, :, 0] +
            diff[:, :, 1] * diff[:, :, 1] +
            diff[:, :, 2] * diff[:, :, 2]
        )

        if nearest_distance is None:
            nearest_distance = distance
        else:
            nearest_distance = np.minimum(nearest_distance, distance)

    candidate_mask = np.where(nearest_distance <= tolerance, 255, candidate_mask).astype(np.uint8)
    return candidate_mask


def select_border_connected_labels(labels, candidate_mask):
    height, width = candidate_mask.shape
    border_labels = set()

    if width == 0 or height == 0:
        return border_labels

    for x in range(width):
        if candidate_mask[0, x]:
            border_labels.add(int(labels[0, x]))
        if candidate_mask[height - 1, x]:
            border_labels.add(int(labels[height - 1, x]))

    for y in range(height):
        if candidate_mask[y, 0]:
            border_labels.add(int(labels[y, 0]))
        if candidate_mask[y, width - 1]:
            border_labels.add(int(labels[y, width - 1]))

    if 0 in border_labels:
        border_labels.remove(0)
    return border_labels


def flood_remove_background(image, background_colors, tolerance, alpha_threshold):
    candidate_mask = build_background_candidate_mask(
        image,
        background_colors,
        tolerance,
        alpha_threshold,
    )
    if cv2.countNonZero(candidate_mask) == 0:
        return image.copy(), 0

    label_count, labels = cv2.connectedComponents(candidate_mask, 4)
    if label_count <= 1:
        output = image.copy()
        output[:, :, :] = np.where(candidate_mask[:, :, None] > 0, 0, output)
        removed = int(cv2.countNonZero(candidate_mask))
        return output, removed

    border_labels = select_border_connected_labels(labels, candidate_mask)
    if not border_labels:
        return image.copy(), 0

    background_mask = np.isin(labels, list(border_labels)).astype(np.uint8) * 255
    output = image.copy()
    output[background_mask > 0] = (0, 0, 0, 0)
    removed = int(cv2.countNonZero(background_mask))
    return output, removed


def trim_to_visible_bounds(image):
    alpha = image[:, :, 3]
    non_zero_points = cv2.findNonZero(alpha)
    if non_zero_points is None:
        return image, None

    x, y, width, height = cv2.boundingRect(non_zero_points)
    return image[y:y + height, x:x + width].copy(), (x, y, x + width, y + height)


def build_output_path(input_file, input_root, output_target, suffix):
    if os.path.isfile(input_root):
        if output_target.lower().endswith(".png"):
            return output_target
        return strip_extension(output_target) + ".png"

    relative_path = os.path.relpath(input_file, input_root)
    relative_root = strip_extension(relative_path)
    output_file = relative_root + suffix + ".png"
    return os.path.join(output_target, output_file)


def write_png(output_path, image_bgra):
    output_dir = os.path.dirname(output_path)
    ensure_dir(output_dir)

    success, encoded = cv2.imencode(".png", image_bgra)
    if not success:
        raise ValueError("Unable to encode PNG: {0}".format(output_path))
    encoded.tofile(output_path)


def process_image(input_file, input_root, output_target, args):
    image = open_as_bgra(input_file)
    background_colors = collect_background_colors(
        image,
        args.edge_width,
        args.sample_step,
        args.cluster_step,
        args.max_colors,
        args.alpha_threshold,
    )
    tolerance = estimate_dynamic_tolerance(
        image,
        background_colors,
        args.edge_width,
        args.sample_step,
        args.alpha_threshold,
        args.tolerance,
    )

    output, removed = flood_remove_background(
        image,
        background_colors,
        tolerance,
        args.alpha_threshold,
    )

    trim_box = None
    if args.trim:
        output, trim_box = trim_to_visible_bounds(output)

    output_path = build_output_path(input_file, input_root, output_target, args.suffix)
    if os.path.exists(output_path) and not args.overwrite:
        raise ValueError("Output already exists: {0}".format(output_path))

    write_png(output_path, output)
    return {
        "source": input_file,
        "output": output_path,
        "background_colors": background_colors,
        "tolerance": tolerance,
        "removed_pixels": removed,
        "trim_box": trim_box,
    }


def main():
    args = parse_args()
    input_path = os.path.abspath(args.input)
    output_target = os.path.abspath(args.output or default_output_path(input_path))

    try:
        input_files = collect_input_files(input_path, args.recursive)
    except ValueError as exc:
        sys.stderr.write(str(exc) + "\n")
        return 1

    if not input_files:
        sys.stderr.write("No supported images were found.\n")
        return 1

    processed = 0
    failures = 0

    for input_file in input_files:
        try:
            result = process_image(input_file, input_path, output_target, args)
        except Exception as exc:
            failures += 1
            print("Skipped {0}: {1}".format(input_file, exc))
            continue

        processed += 1
        print(
            "Processed {0} -> {1} | removed_pixels={2} | tolerance={3} | bg_colors={4}".format(
                result["source"],
                result["output"],
                result["removed_pixels"],
                result["tolerance"],
                result["background_colors"],
            )
        )

    if processed == 0:
        sys.stderr.write("No image was processed successfully.\n")
        return 1

    print("Completed: processed={0}, skipped={1}".format(processed, failures))
    return 0


if __name__ == "__main__":
    sys.exit(main())
