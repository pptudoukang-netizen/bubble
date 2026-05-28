#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import print_function

import argparse
import os
import sys

import cv2
import numpy as np
from PIL import Image


SUPPORTED_EXTENSIONS = (".png", ".webp", ".tga", ".bmp", ".jpg", ".jpeg")
CHANNELS = ("red", "green", "blue", "alpha", "luminance")


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Precise channel/key cutout tool. It preserves RGB values exactly and only writes alpha."
        )
    )
    parser.add_argument("--input", required=True, help="Input image file or directory.")
    parser.add_argument("--output", required=True, help="Output PNG file or directory.")
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Recursively process supported image files when --input is a directory.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting existing output files.",
    )
    parser.add_argument(
        "--suffix",
        default="_cutout",
        help="Output suffix used when --input is a directory or --output is a directory.",
    )

    subparsers = parser.add_subparsers(dest="mode", required=True)

    key_parser = subparsers.add_parser(
        "key",
        help="Set alpha to 0 for pixels matching a precise RGB key color.",
    )
    key_parser.add_argument(
        "--key-rgb",
        required=True,
        help="Key color in R,G,B format, e.g. 0,0,0 or 0,255,0.",
    )
    key_parser.add_argument(
        "--tolerance",
        type=int,
        default=0,
        help="Maximum per-channel absolute RGB distance from key color. 0 means exact match.",
    )
    key_parser.add_argument(
        "--edge-connected",
        action="store_true",
        help="Only remove key-colored regions connected to image borders.",
    )

    channel_parser = subparsers.add_parser(
        "channel",
        help="Build alpha from one source channel without changing RGB.",
    )
    channel_parser.add_argument(
        "--channel",
        required=True,
        choices=CHANNELS,
        help="Source channel used as matte.",
    )
    channel_parser.add_argument(
        "--as-alpha",
        action="store_true",
        help="Use the selected channel value directly as alpha.",
    )
    channel_parser.add_argument(
        "--threshold",
        type=int,
        help="Hard threshold. Alpha becomes 255 when channel >= threshold, otherwise 0.",
    )
    channel_parser.add_argument(
        "--invert",
        action="store_true",
        help="Invert the selected channel before applying --as-alpha or --threshold.",
    )

    mask_parser = subparsers.add_parser(
        "mask",
        help="Use an external grayscale/alpha mask image as alpha.",
    )
    mask_parser.add_argument("--mask", required=True, help="Mask image path. Must match input image size.")
    mask_parser.add_argument(
        "--mask-channel",
        required=True,
        choices=CHANNELS,
        help="Mask channel used as alpha.",
    )
    mask_parser.add_argument(
        "--invert-mask",
        action="store_true",
        help="Invert the mask channel before writing alpha.",
    )

    args = parser.parse_args()
    validate_args(parser, args)
    return args


def validate_args(parser, args):
    if args.mode == "key":
        parse_rgb(args.key_rgb, parser)
        if args.tolerance < 0 or args.tolerance > 255:
            parser.error("--tolerance must be between 0 and 255")

    if args.mode == "channel":
        if args.as_alpha and args.threshold is not None:
            parser.error("Use only one of --as-alpha or --threshold")
        if not args.as_alpha and args.threshold is None:
            parser.error("channel mode requires --as-alpha or --threshold")
        if args.threshold is not None and (args.threshold < 0 or args.threshold > 255):
            parser.error("--threshold must be between 0 and 255")


def parse_rgb(text, parser):
    parts = text.split(",")
    if len(parts) != 3:
        parser.error("--key-rgb must be R,G,B, e.g. 0,0,0")

    values = []
    for part in parts:
        try:
            value = int(part.strip())
        except ValueError:
            parser.error("--key-rgb values must be integers")
        if value < 0 or value > 255:
            parser.error("--key-rgb values must be between 0 and 255")
        values.append(value)

    return tuple(values)


def is_supported_image(path):
    return os.path.isfile(path) and path.lower().endswith(SUPPORTED_EXTENSIONS)


def collect_input_files(input_path, recursive):
    if os.path.isfile(input_path):
        if not is_supported_image(input_path):
            raise ValueError("Unsupported image file: {0}".format(input_path))
        return [os.path.abspath(input_path)]

    if not os.path.isdir(input_path):
        raise ValueError("Input path does not exist: {0}".format(input_path))

    files = []
    if recursive:
        for root, _dirs, names in os.walk(input_path):
            for name in names:
                full_path = os.path.join(root, name)
                if is_supported_image(full_path):
                    files.append(os.path.abspath(full_path))
    else:
        for name in os.listdir(input_path):
            full_path = os.path.join(input_path, name)
            if is_supported_image(full_path):
                files.append(os.path.abspath(full_path))

    files.sort()
    if not files:
        raise ValueError("No supported image files found: {0}".format(input_path))
    return files


def open_rgba(path):
    image = Image.open(path).convert("RGBA")
    return np.array(image, dtype=np.uint8)


def write_rgba_png(path, rgba):
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)
    Image.fromarray(rgba, mode="RGBA").save(path)


def channel_values(rgba, channel):
    if channel == "red":
        return rgba[:, :, 0]
    if channel == "green":
        return rgba[:, :, 1]
    if channel == "blue":
        return rgba[:, :, 2]
    if channel == "alpha":
        return rgba[:, :, 3]
    if channel == "luminance":
        rgb = rgba[:, :, :3].astype(np.float32)
        return np.clip(
            rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722,
            0,
            255,
        ).astype(np.uint8)
    raise ValueError("Unsupported channel: {0}".format(channel))


def edge_connected_mask(candidate_mask):
    height, width = candidate_mask.shape
    if height == 0 or width == 0:
        raise ValueError("Empty image mask")

    label_count, labels = cv2.connectedComponents(candidate_mask.astype(np.uint8), 4)
    if label_count <= 1:
        return candidate_mask.astype(bool)

    border_labels = set()
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

    if not border_labels:
        return np.zeros_like(candidate_mask, dtype=bool)

    return np.isin(labels, list(border_labels))


def apply_key_cutout(rgba, args):
    key_rgb = np.array(parse_rgb(args.key_rgb, argparse.ArgumentParser()), dtype=np.int16)
    rgb = rgba[:, :, :3].astype(np.int16)
    distance = np.abs(rgb - key_rgb.reshape((1, 1, 3)))
    candidate = np.all(distance <= args.tolerance, axis=2)

    if args.edge_connected:
        remove_mask = edge_connected_mask(candidate)
    else:
        remove_mask = candidate

    output = rgba.copy()
    output[:, :, 3] = np.where(remove_mask, 0, output[:, :, 3]).astype(np.uint8)
    return output


def apply_channel_cutout(rgba, args):
    matte = channel_values(rgba, args.channel)
    if args.invert:
        matte = (255 - matte).astype(np.uint8)

    if args.as_alpha:
        alpha = matte
    else:
        alpha = np.where(matte >= args.threshold, 255, 0).astype(np.uint8)

    output = rgba.copy()
    output[:, :, 3] = alpha
    return output


def apply_mask_cutout(rgba, args):
    mask_rgba = open_rgba(args.mask)
    if mask_rgba.shape[0] != rgba.shape[0] or mask_rgba.shape[1] != rgba.shape[1]:
        raise ValueError(
            "Mask size must match input size. Input={0}x{1}, mask={2}x{3}".format(
                rgba.shape[1],
                rgba.shape[0],
                mask_rgba.shape[1],
                mask_rgba.shape[0],
            )
        )

    alpha = channel_values(mask_rgba, args.mask_channel)
    if args.invert_mask:
        alpha = (255 - alpha).astype(np.uint8)

    output = rgba.copy()
    output[:, :, 3] = alpha
    return output


def process_rgba(rgba, args):
    if args.mode == "key":
        return apply_key_cutout(rgba, args)
    if args.mode == "channel":
        return apply_channel_cutout(rgba, args)
    if args.mode == "mask":
        return apply_mask_cutout(rgba, args)
    raise ValueError("Unsupported mode: {0}".format(args.mode))


def build_output_path(input_file, input_root, output_target, suffix):
    if os.path.isfile(input_root):
        if output_target.lower().endswith(".png"):
            return output_target
        if os.path.isdir(output_target):
            return os.path.join(
                output_target,
                os.path.splitext(os.path.basename(input_file))[0] + suffix + ".png",
            )
        raise ValueError("Single-file output must be a .png file or an existing directory")

    relative_path = os.path.relpath(input_file, input_root)
    relative_stem = os.path.splitext(relative_path)[0]
    return os.path.join(output_target, relative_stem + suffix + ".png")


def assert_rgb_unchanged(before, after, source):
    if not np.array_equal(before[:, :, :3], after[:, :, :3]):
        raise RuntimeError("RGB changed unexpectedly: {0}".format(source))


def process_file(input_file, input_root, output_target, args):
    rgba = open_rgba(input_file)
    output = process_rgba(rgba, args)
    assert_rgb_unchanged(rgba, output, input_file)

    output_path = build_output_path(input_file, input_root, output_target, args.suffix)
    if os.path.exists(output_path) and not args.overwrite:
        raise FileExistsError("Output already exists: {0}".format(output_path))

    write_rgba_png(output_path, output)
    alpha_changed = int(np.count_nonzero(rgba[:, :, 3] != output[:, :, 3]))
    transparent_pixels = int(np.count_nonzero(output[:, :, 3] == 0))
    return output_path, alpha_changed, transparent_pixels


def main():
    args = parse_args()
    input_path = os.path.abspath(args.input)
    output_target = os.path.abspath(args.output)
    input_files = collect_input_files(input_path, args.recursive)

    processed = 0
    for input_file in input_files:
        output_path, alpha_changed, transparent_pixels = process_file(
            input_file,
            input_path,
            output_target,
            args,
        )
        processed += 1
        print(
            "Processed {0} -> {1} | alpha_changed={2} | transparent_pixels={3}".format(
                input_file,
                output_path,
                alpha_changed,
                transparent_pixels,
            )
        )

    print("Completed: processed={0}".format(processed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
