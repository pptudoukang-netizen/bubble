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
        "--content-alpha-threshold",
        type=int,
        default=48,
        help=(
            "Alpha threshold used to decide whether a region contains real "
            "visible content. Low-alpha dust/shadow leftovers below this value "
            "are ignored."
        ),
    )
    parser.add_argument(
        "--min-content-pixels",
        type=int,
        default=24,
        help=(
            "Ignore regions with fewer than this many pixels at "
            "--content-alpha-threshold. Use 0 to keep all low-alpha fragments."
        ),
    )
    parser.add_argument(
        "--trim-alpha-threshold",
        type=int,
        default=16,
        help=(
            "Alpha threshold used when tightening exported crops to the smallest "
            "visible bounding box. Pixels below this value are ignored for bounds."
        ),
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
        "--solid-alpha-threshold",
        type=int,
        default=48,
        help=(
            "Alpha threshold used to detect solid cores inside a connected region. "
            "When multiple solid cores are found, the region is split into separate "
            "elements. Use 0 to disable."
        ),
    )
    parser.add_argument(
        "--solid-core-min-pixels",
        type=int,
        default=200,
        help=(
            "Only solid cores with at least this many pixels can trigger a split."
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
    if args.content_alpha_threshold < 0 or args.content_alpha_threshold > 255:
        parser.error("--content-alpha-threshold must be between 0 and 255")
    if args.min_content_pixels < 0:
        parser.error("--min-content-pixels must be >= 0")
    if args.trim_alpha_threshold < 0 or args.trim_alpha_threshold > 255:
        parser.error("--trim-alpha-threshold must be between 0 and 255")
    if args.padding < 0:
        parser.error("--padding must be >= 0")
    if args.merge_gap < 0:
        parser.error("--merge-gap must be >= 0")
    if args.solid_alpha_threshold < 0 or args.solid_alpha_threshold > 255:
        parser.error("--solid-alpha-threshold must be between 0 and 255")
    if args.solid_core_min_pixels < 1:
        parser.error("--solid-core-min-pixels must be >= 1")
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
        return [], None

    label_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    components = []

    for label_index in range(1, label_count):
        x = int(stats[label_index, cv2.CC_STAT_LEFT])
        y = int(stats[label_index, cv2.CC_STAT_TOP])
        width = int(stats[label_index, cv2.CC_STAT_WIDTH])
        height = int(stats[label_index, cv2.CC_STAT_HEIGHT])
        pixel_count = int(stats[label_index, cv2.CC_STAT_AREA])
        components.append({
            "label_id": label_index,
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "pixel_count": pixel_count,
        })

    return components, labels


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


def assign_pixels_to_solid_cores(parent, alpha_sub, core_labels, major_core_ids):
    eligible = parent & (alpha_sub >= 1)
    if not np.any(eligible):
        raise ValueError("Component has no visible pixels.")

    distance_maps = []
    for core_id in major_core_ids:
        core_only = (core_labels == core_id).astype(np.uint8)
        distance_maps.append(
            cv2.distanceTransform(1 - core_only, cv2.DIST_L2, 5)
        )

    assigned_regions = {}
    for core_id in major_core_ids:
        assigned_regions[core_id] = np.zeros(parent.shape, dtype=bool)

    ys, xs = np.where(eligible)
    for y, x in zip(ys, xs):
        best_index = 0
        best_distance = distance_maps[0][y, x]
        for index in range(1, len(major_core_ids)):
            current_distance = distance_maps[index][y, x]
            if current_distance < best_distance:
                best_distance = current_distance
                best_index = index
        assigned_regions[major_core_ids[best_index]][y, x] = True

    return assigned_regions


def solid_cores_have_vertical_gap(parent, alpha_sub, core_labels, major_core_ids, gap_threshold):
    cores = []
    for core_id in major_core_ids:
        ys, _ = np.where(core_labels == core_id)
        if ys.size == 0:
            raise ValueError("Solid core {0} has no pixels.".format(core_id))
        cores.append((int(ys.min()), int(ys.max()), core_id))

    cores.sort(key=lambda item: item[0])
    for index in range(len(cores) - 1):
        gap_start = cores[index][1] + 1
        gap_end = cores[index + 1][0] - 1
        if gap_end < gap_start:
            return False

        gap_alpha = alpha_sub[gap_start:gap_end + 1, :]
        gap_parent = parent[gap_start:gap_end + 1, :]
        found_separator = False
        for row_index in range(gap_alpha.shape[0]):
            opaque = gap_parent[row_index] & (gap_alpha[row_index] >= gap_threshold)
            if not np.any(opaque):
                found_separator = True
                break
        if not found_separator:
            return False

    return True


def split_single_component_by_solid_cores(
    component,
    labels,
    alpha_channel,
    solid_threshold,
    core_min_pixels,
):
    label_id = component["label_id"]
    ys, xs = np.where(labels == label_id)
    x0 = int(xs.min())
    x1 = int(xs.max())
    y0 = int(ys.min())
    y1 = int(ys.max())

    parent = labels[y0:y1 + 1, x0:x1 + 1] == label_id
    alpha_sub = alpha_channel[y0:y1 + 1, x0:x1 + 1]
    solid = (parent & (alpha_sub >= solid_threshold)).astype(np.uint8)
    core_count, core_labels, stats, _ = cv2.connectedComponentsWithStats(solid, 8)

    major_core_ids = [
        index for index in range(1, core_count)
        if int(stats[index, cv2.CC_STAT_AREA]) >= core_min_pixels
    ]
    if len(major_core_ids) <= 1:
        return [component]

    if not solid_cores_have_vertical_gap(
        parent,
        alpha_sub,
        core_labels,
        major_core_ids,
        solid_threshold,
    ):
        return [component]

    assigned_regions = assign_pixels_to_solid_cores(
        parent,
        alpha_sub,
        core_labels,
        major_core_ids,
    )

    split_components = []
    for core_id in major_core_ids:
        region_mask = assigned_regions[core_id]
        if not np.any(region_mask):
            raise ValueError(
                "Solid-core assignment produced an empty region for label {0}.".format(
                    label_id
                )
            )

        ys2, xs2 = np.where(region_mask)
        local_y0 = int(ys2.min())
        local_x0 = int(xs2.min())
        local_y1 = int(ys2.max())
        local_x1 = int(xs2.max())
        local_mask = region_mask[local_y0:local_y1 + 1, local_x0:local_x1 + 1]

        split_components.append({
            "x": x0 + local_x0,
            "y": y0 + local_y0,
            "width": local_x1 - local_x0 + 1,
            "height": local_y1 - local_y0 + 1,
            "pixel_count": int(region_mask.sum()),
            "region_mask": local_mask,
        })

    return split_components


def split_merged_components(
    components,
    labels,
    alpha_channel,
    solid_threshold,
    core_min_pixels,
):
    if solid_threshold <= 0:
        return list(components)

    split_components = []
    for component in components:
        split_components.extend(
            split_single_component_by_solid_cores(
                component,
                labels,
                alpha_channel,
                solid_threshold,
                core_min_pixels,
            )
        )
    return split_components


def component_content_pixel_count(component, labels, alpha_channel, threshold):
    if threshold <= 0:
        return component["pixel_count"]

    x = component["x"]
    y = component["y"]
    width = component["width"]
    height = component["height"]
    alpha_sub = alpha_channel[y:y + height, x:x + width]

    if "region_mask" in component:
        component_mask = component["region_mask"]
    elif "label_id" in component:
        label_sub = labels[y:y + height, x:x + width]
        component_mask = label_sub == component["label_id"]
    else:
        component_mask = np.ones(alpha_sub.shape, dtype=bool)

    content_mask = component_mask & (alpha_sub >= threshold)
    return int(content_mask.sum())


def filter_components(
    components,
    labels,
    alpha_channel,
    min_pixels,
    min_width,
    min_height,
    content_alpha_threshold,
    min_content_pixels,
):
    filtered = []
    for component in components:
        if component["pixel_count"] < min_pixels:
            continue
        if component["width"] < min_width:
            continue
        if component["height"] < min_height:
            continue
        content_pixel_count = component_content_pixel_count(
            component,
            labels,
            alpha_channel,
            content_alpha_threshold,
        )
        if content_pixel_count < min_content_pixels:
            continue
        component["content_pixel_count"] = content_pixel_count
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


def tighten_export_crop(crop, alpha_threshold):
    alpha = crop[:, :, 3]
    opaque = alpha >= alpha_threshold
    if not np.any(opaque):
        raise ValueError("Export crop has no opaque pixels at alpha threshold {0}.".format(
            alpha_threshold
        ))

    ys, xs = np.where(opaque)
    top = int(ys.min())
    bottom = int(ys.max())
    left = int(xs.min())
    right = int(xs.max())
    return crop[top:bottom + 1, left:right + 1], left, top


def write_png(output_path, image_bgra):
    directory = os.path.dirname(output_path)
    ensure_dir(directory)

    success, encoded = cv2.imencode(".png", image_bgra)
    if not success:
        raise ValueError("Unable to encode PNG: {0}".format(output_path))

    encoded.tofile(output_path)


def export_components(
    image,
    labels,
    components,
    export_dir,
    prefix,
    padding,
    min_file_size_kb,
    trim_alpha_threshold,
):
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
        if "region_mask" in component:
            local_mask = component["region_mask"]
            if local_mask.shape[0] != crop.shape[0] or local_mask.shape[1] != crop.shape[1]:
                raise ValueError(
                    "Component region_mask shape does not match export crop: {0}".format(
                        component
                    )
                )
            foreign_pixels = np.logical_not(local_mask)
        else:
            label_id = component["label_id"]
            region_labels = labels[top:bottom, left:right]
            foreign_pixels = region_labels != label_id
        crop[foreign_pixels, 3] = 0
        crop, trim_left, trim_top = tighten_export_crop(crop, trim_alpha_threshold)

        file_name = "{0}_{1:03d}.png".format(prefix, export_index)
        output_path = os.path.join(export_dir, file_name)
        write_png(output_path, crop)

        if min_file_size_bytes > 0:
            file_size = os.path.getsize(output_path)
            if file_size < min_file_size_bytes:
                os.remove(output_path)
                continue

        export_x = left + trim_left
        export_y = top + trim_top
        export_width = crop.shape[1]
        export_height = crop.shape[0]
        exported.append({
            "index": export_index,
            "file": output_path,
            "x": export_x,
            "y": export_y,
            "width": export_width,
            "height": export_height,
            "pixel_count": component["pixel_count"],
            "content_pixel_count": component.get("content_pixel_count"),
            "export_x": export_x,
            "export_y": export_y,
            "export_width": export_width,
            "export_height": export_height,
        })
        export_index += 1

    return exported


def process_image(input_file, input_root, output_root, args):
    image, has_transparency = open_as_bgra(input_file)
    if not has_transparency:
        raise ValueError("Image has no transparent background data: {0}".format(input_file))

    alpha_channel = image[:, :, 3]
    height, width = image.shape[:2]

    components, labels = find_connected_components(alpha_channel, args.alpha_threshold)
    if labels is None:
        raise ValueError("No opaque UI pixels were found: {0}".format(input_file))
    components = merge_nearby_components(components, args.merge_gap)
    components = split_merged_components(
        components,
        labels,
        alpha_channel,
        args.solid_alpha_threshold,
        args.solid_core_min_pixels,
    )
    components = filter_components(
        components,
        labels,
        alpha_channel,
        args.min_pixels,
        args.min_width,
        args.min_height,
        args.content_alpha_threshold,
        args.min_content_pixels,
    )
    components = sort_components(components)

    export_dir = build_export_dir(input_file, input_root, output_root)
    exported = export_components(
        image,
        labels,
        components,
        export_dir,
        args.prefix,
        args.padding,
        args.min_file_size_kb,
        args.trim_alpha_threshold,
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
            "content_alpha_threshold": args.content_alpha_threshold,
            "min_content_pixels": args.min_content_pixels,
            "trim_alpha_threshold": args.trim_alpha_threshold,
            "padding": args.padding,
            "merge_gap": args.merge_gap,
            "solid_alpha_threshold": args.solid_alpha_threshold,
            "solid_core_min_pixels": args.solid_core_min_pixels,
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
