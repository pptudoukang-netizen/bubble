#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import print_function

import argparse
import io
import json
import os
import sys

try:
    unicode
except NameError:
    unicode = str

try:
    import cv2
    import numpy as np
except ImportError:
    sys.stderr.write(
        "OpenCV is required. Install it with: pip install opencv-python numpy\n"
    )
    sys.exit(1)


SUPPORTED_EXTENSIONS = (".png", ".webp", ".tga", ".bmp")


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Split UI elements from transparent images by connected alpha regions "
            "and export each element cropped to its real bounds."
        )
    )
    parser.add_argument("input", help="Input image file or directory.")
    parser.add_argument(
        "-o",
        "--output",
        help="Output directory. Defaults to <image>_slices or <dir>/split_output.",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Recursively scan the input directory for supported images.",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=1,
        help="Alpha threshold used to decide whether a pixel belongs to an element.",
    )
    parser.add_argument(
        "--min-pixels",
        type=int,
        default=6,
        help="Ignore connected regions smaller than this many opaque pixels.",
    )
    parser.add_argument(
        "--min-width",
        type=int,
        default=1,
        help="Ignore exported elements narrower than this many pixels.",
    )
    parser.add_argument(
        "--min-height",
        type=int,
        default=1,
        help="Ignore exported elements shorter than this many pixels.",
    )
    parser.add_argument(
        "--padding",
        type=int,
        default=0,
        help="Extra transparent padding added around each exported element.",
    )
    parser.add_argument(
        "--merge-gap",
        type=int,
        default=0,
        help=(
            "Merge nearby regions when their bounding boxes are within this many "
            "pixels. Useful for UI text or icons made of multiple disconnected parts."
        ),
    )
    parser.add_argument(
        "--prefix",
        default="element",
        help="File name prefix for exported slices.",
    )
    parser.add_argument(
        "--manifest-name",
        default="split_manifest.json",
        help="Name of the JSON manifest written to the output directory.",
    )
    parser.add_argument(
        "--min-file-size-kb",
        type=int,
        default=1,
        help="Delete exported slices smaller than this many KB. Use 0 to disable.",
    )
    args = parser.parse_args()
    if args.alpha_threshold < 0 or args.alpha_threshold > 255:
        parser.error("--alpha-threshold must be between 0 and 255")
    if args.min_pixels < 1:
        parser.error("--min-pixels must be >= 1")
    if args.min_width < 1:
        parser.error("--min-width must be >= 1")
    if args.min_height < 1:
        parser.error("--min-height must be >= 1")
    if args.padding < 0:
        parser.error("--padding must be >= 0")
    if args.merge_gap < 0:
        parser.error("--merge-gap must be >= 0")
    if args.min_file_size_kb < 0:
        parser.error("--min-file-size-kb must be >= 0")
    return args


def ensure_dir(path):
    if not os.path.isdir(path):
        os.makedirs(path)


def strip_extension(path):
    return os.path.splitext(path)[0]


def default_output_dir(input_path):
    if os.path.isfile(input_path):
        return strip_extension(input_path) + "_slices"
    return os.path.join(input_path, "split_output")


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


def source_has_transparency(image):
    return image.ndim == 3 and image.shape[2] == 4


def open_as_bgra(path):
    image = read_image_unchanged(path)
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA), False

    channels = image.shape[2]
    if channels == 4:
        return image, True
    if channels == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2BGRA), False
    raise ValueError("Unsupported channel count for image: {0}".format(path))


def find_connected_components(alpha_channel, threshold):
    mask = np.where(alpha_channel >= threshold, 255, 0).astype(np.uint8)
    if cv2.countNonZero(mask) == 0:
        return []

    label_count, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    components = []

    for label_index in range(1, label_count):
        x = int(stats[label_index, cv2.CC_STAT_LEFT])
        y = int(stats[label_index, cv2.CC_STAT_TOP])
        width = int(stats[label_index, cv2.CC_STAT_WIDTH])
        height = int(stats[label_index, cv2.CC_STAT_HEIGHT])
        pixel_count = int(stats[label_index, cv2.CC_STAT_AREA])
        components.append({
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "pixel_count": pixel_count,
        })

    return components


def boxes_are_close(left, right, gap):
    left_x1 = left["x"] - gap
    left_y1 = left["y"] - gap
    left_x2 = left["x"] + left["width"] - 1 + gap
    left_y2 = left["y"] + left["height"] - 1 + gap

    right_x1 = right["x"]
    right_y1 = right["y"]
    right_x2 = right["x"] + right["width"] - 1
    right_y2 = right["y"] + right["height"] - 1

    overlap_x = left_x1 <= right_x2 and right_x1 <= left_x2
    overlap_y = left_y1 <= right_y2 and right_y1 <= left_y2
    return overlap_x and overlap_y


def merge_component_pair(left, right):
    min_x = min(left["x"], right["x"])
    min_y = min(left["y"], right["y"])
    max_x = max(left["x"] + left["width"] - 1, right["x"] + right["width"] - 1)
    max_y = max(left["y"] + left["height"] - 1, right["y"] + right["height"] - 1)
    return {
        "x": min_x,
        "y": min_y,
        "width": max_x - min_x + 1,
        "height": max_y - min_y + 1,
        "pixel_count": left["pixel_count"] + right["pixel_count"],
    }


def merge_nearby_components(components, gap):
    if gap <= 0 or len(components) < 2:
        return list(components)

    merged = list(components)
    changed = True
    while changed:
        changed = False
        next_round = []
        consumed = [False] * len(merged)

        for index in range(len(merged)):
            if consumed[index]:
                continue

            current = merged[index]
            consumed[index] = True

            for other_index in range(index + 1, len(merged)):
                if consumed[other_index]:
                    continue

                if boxes_are_close(current, merged[other_index], gap):
                    current = merge_component_pair(current, merged[other_index])
                    consumed[other_index] = True
                    changed = True

            next_round.append(current)

        merged = next_round

    return merged


def filter_components(components, min_pixels, min_width, min_height):
    filtered = []
    for component in components:
        if component["pixel_count"] < min_pixels:
            continue
        if component["width"] < min_width:
            continue
        if component["height"] < min_height:
            continue
        filtered.append(component)
    return filtered


def sort_components(components):
    return sorted(
        components,
        key=lambda item: (item["y"], item["x"], item["height"] * item["width"]),
    )


def build_export_dir(input_file, input_root, output_root):
    if os.path.isfile(input_root):
        return output_root

    relative_path = os.path.relpath(input_file, input_root)
    relative_stem = strip_extension(relative_path)
    safe_stem = relative_stem.replace("\\", "__").replace("/", "__")
    return os.path.join(output_root, safe_stem)


def write_png(output_path, image_bgra):
    directory = os.path.dirname(output_path)
    ensure_dir(directory)

    success, encoded = cv2.imencode(".png", image_bgra)
    if not success:
        raise ValueError("Unable to encode PNG: {0}".format(output_path))

    encoded.tofile(output_path)


def export_components(image, components, export_dir, prefix, padding, min_file_size_kb):
    ensure_dir(export_dir)
    height, width = image.shape[:2]
    exported = []
    min_file_size_bytes = int(min_file_size_kb) * 1024
    export_index = 1

    for component in components:
        left = max(0, component["x"] - padding)
        top = max(0, component["y"] - padding)
        right = min(width, component["x"] + component["width"] + padding)
        bottom = min(height, component["y"] + component["height"] + padding)

        crop = image[top:bottom, left:right].copy()
        file_name = "{0}_{1:03d}.png".format(prefix, export_index)
        output_path = os.path.join(export_dir, file_name)
        write_png(output_path, crop)

        if min_file_size_bytes > 0:
            file_size = os.path.getsize(output_path)
            if file_size < min_file_size_bytes:
                os.remove(output_path)
                continue

        exported.append({
            "index": export_index,
            "file": output_path,
            "x": component["x"],
            "y": component["y"],
            "width": component["width"],
            "height": component["height"],
            "pixel_count": component["pixel_count"],
            "export_x": left,
            "export_y": top,
            "export_width": right - left,
            "export_height": bottom - top,
        })
        export_index += 1

    return exported


def process_image(input_file, input_root, output_root, args):
    image, has_transparency = open_as_bgra(input_file)
    if not has_transparency:
        raise ValueError("Image has no transparent background data: {0}".format(input_file))

    alpha_channel = image[:, :, 3]
    height, width = image.shape[:2]

    components = find_connected_components(alpha_channel, args.alpha_threshold)
    components = merge_nearby_components(components, args.merge_gap)
    components = filter_components(
        components,
        args.min_pixels,
        args.min_width,
        args.min_height,
    )
    components = sort_components(components)

    export_dir = build_export_dir(input_file, input_root, output_root)
    exported = export_components(
        image,
        components,
        export_dir,
        args.prefix,
        args.padding,
        args.min_file_size_kb,
    )

    return {
        "source": input_file,
        "image_width": width,
        "image_height": height,
        "output_dir": export_dir,
        "component_count": len(exported),
        "components": exported,
    }


def write_manifest(output_root, manifest_name, payload):
    ensure_dir(output_root)
    manifest_path = os.path.join(output_root, manifest_name)
    fs_encoding = sys.getfilesystemencoding() or "utf-8"

    def normalize(value):
        if isinstance(value, dict):
            normalized = {}
            for key, item in value.items():
                normalized[normalize(key)] = normalize(item)
            return normalized
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if isinstance(value, tuple):
            return [normalize(item) for item in value]
        if isinstance(value, unicode):
            return value
        if isinstance(value, str):
            return value.decode(fs_encoding, "replace")
        return value

    normalized_payload = normalize(payload)
    content = json.dumps(
        normalized_payload,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    )
    if not isinstance(content, unicode):
        content = content.decode("utf-8")

    with io.open(manifest_path, "w", encoding="utf-8") as handle:
        handle.write(content)
        handle.write(u"\n")
    return manifest_path


def main():
    args = parse_args()
    input_path = os.path.abspath(args.input)
    output_root = os.path.abspath(args.output or default_output_dir(input_path))

    try:
        input_files = collect_input_files(input_path, args.recursive)
    except ValueError as exc:
        sys.stderr.write(str(exc) + "\n")
        return 1

    if not input_files:
        sys.stderr.write("No supported images were found.\n")
        return 1

    manifest_items = []
    failures = []
    total_components = 0

    for input_file in input_files:
        try:
            item = process_image(input_file, input_path, output_root, args)
        except Exception as exc:
            failures.append({
                "source": input_file,
                "error": str(exc),
            })
            print("Skipped {0}: {1}".format(input_file, exc))
            continue

        manifest_items.append(item)
        total_components += item["component_count"]
        print(
            "Processed {0}: exported {1} element(s) -> {2}".format(
                input_file,
                item["component_count"],
                item["output_dir"],
            )
        )

    if not manifest_items:
        sys.stderr.write("No valid transparent images were processed.\n")
        return 1

    manifest = {
        "input": input_path,
        "output": output_root,
        "image_count": len(manifest_items),
        "total_component_count": total_components,
        "failure_count": len(failures),
        "failures": failures,
        "settings": {
            "alpha_threshold": args.alpha_threshold,
            "min_pixels": args.min_pixels,
            "min_width": args.min_width,
            "min_height": args.min_height,
            "padding": args.padding,
            "merge_gap": args.merge_gap,
            "prefix": args.prefix,
            "min_file_size_kb": args.min_file_size_kb,
        },
        "images": manifest_items,
    }
    manifest_path = write_manifest(output_root, args.manifest_name, manifest)
    print("Manifest written to {0}".format(manifest_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
