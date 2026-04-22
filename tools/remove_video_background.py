#!/usr/bin/env python
# -*- coding: utf-8 -*-

from __future__ import print_function

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

try:
    import cv2
    import numpy as np
except ImportError:
    sys.stderr.write(
        "OpenCV and NumPy are required. Install with: pip install opencv-python numpy\n"
    )
    sys.exit(1)

try:
    from rembg import new_session, remove
except ImportError:
    sys.stderr.write(
        "rembg is required. Install with: pip install rembg onnxruntime\n"
    )
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Remove video background frame by frame using rembg. "
            "Supports transparent WebM output or solid-color MP4 output."
        )
    )
    parser.add_argument("input", help="Input video file path.")
    parser.add_argument(
        "-o",
        "--output",
        help="Output video file path. Default is <input>_nobg.webm or <input>_nobg.mp4",
    )
    parser.add_argument(
        "--mode",
        choices=("alpha", "color"),
        default="alpha",
        help="alpha: transparent video (webm), color: fill background with a solid color (mp4).",
    )
    parser.add_argument(
        "--bg-color",
        default="255,255,255",
        help="Background color in R,G,B for --mode color (default: 255,255,255).",
    )
    parser.add_argument(
        "--model",
        default="u2net",
        help="rembg model name, e.g. u2net, u2netp, isnet-general-use.",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="Process at most N frames (0 means all frames).",
    )
    parser.add_argument(
        "--keep-audio",
        action="store_true",
        help="Try to keep original audio track in output video.",
    )
    parser.add_argument(
        "--post-process-mask",
        action="store_true",
        help="Enable rembg mask post-processing for cleaner edges.",
    )
    args = parser.parse_args()

    if args.max_frames < 0:
        parser.error("--max-frames must be >= 0")

    if args.mode == "color":
        args.bg_color_rgb = parse_rgb_color(args.bg_color, parser)
    else:
        args.bg_color_rgb = None

    return args


def parse_rgb_color(text, parser):
    parts = text.split(",")
    if len(parts) != 3:
        parser.error("--bg-color must be in R,G,B format, e.g. 255,255,255")

    try:
        red = int(parts[0].strip())
        green = int(parts[1].strip())
        blue = int(parts[2].strip())
    except ValueError:
        parser.error("--bg-color values must be integers in [0,255]")

    for value in (red, green, blue):
        if value < 0 or value > 255:
            parser.error("--bg-color values must be in [0,255]")

    return red, green, blue


def default_output_path(input_path, mode):
    root, _ = os.path.splitext(input_path)
    if mode == "alpha":
        return root + "_nobg.webm"
    return root + "_nobg.mp4"


def ensure_ffmpeg_available():
    if shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "ffmpeg not found in PATH. Please install ffmpeg and make sure it is available in command line."
        )


def ensure_parent_dir(path):
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        os.makedirs(parent)


def open_video_capture(path):
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise RuntimeError("Unable to open input video: {0}".format(path))
    return capture


def safe_fps(raw_fps):
    if raw_fps is None or raw_fps <= 0 or np.isnan(raw_fps):
        return 30.0
    return float(raw_fps)


def encode_png_bytes(image_bgr):
    success, encoded = cv2.imencode(".png", image_bgr)
    if not success:
        raise RuntimeError("Failed to encode frame to PNG bytes.")
    return encoded.tobytes()


def decode_to_bgra(image_bytes):
    array_data = np.frombuffer(image_bytes, dtype=np.uint8)
    decoded = cv2.imdecode(array_data, cv2.IMREAD_UNCHANGED)
    if decoded is None:
        raise RuntimeError("Failed to decode rembg output frame.")

    if decoded.ndim == 2:
        decoded = cv2.cvtColor(decoded, cv2.COLOR_GRAY2BGRA)
    elif decoded.shape[2] == 3:
        decoded = cv2.cvtColor(decoded, cv2.COLOR_BGR2BGRA)
    elif decoded.shape[2] != 4:
        raise RuntimeError("Unsupported channel count in rembg output frame.")

    return decoded


def composite_with_color(bgra_image, rgb_color):
    red, green, blue = rgb_color
    background_bgr = np.array([blue, green, red], dtype=np.float32)

    alpha = bgra_image[:, :, 3:4].astype(np.float32) / 255.0
    foreground_bgr = bgra_image[:, :, :3].astype(np.float32)
    composed = foreground_bgr * alpha + background_bgr * (1.0 - alpha)
    return composed.astype(np.uint8)


def write_image(path, image, extension):
    success, encoded = cv2.imencode(extension, image)
    if not success:
        raise RuntimeError("Failed to encode frame for output: {0}".format(path))
    encoded.tofile(path)


def remove_background_frames(args, frames_dir):
    capture = open_video_capture(args.input)
    session = new_session(args.model)

    fps = safe_fps(capture.get(cv2.CAP_PROP_FPS))
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    processed = 0

    try:
        while True:
            ok, frame_bgr = capture.read()
            if not ok:
                break

            frame_bytes = encode_png_bytes(frame_bgr)
            removed_bytes = remove(
                frame_bytes,
                session=session,
                post_process_mask=args.post_process_mask,
            )
            frame_bgra = decode_to_bgra(removed_bytes)

            frame_index = processed + 1
            if args.mode == "alpha":
                output_frame_path = os.path.join(
                    frames_dir,
                    "frame_{0:06d}.png".format(frame_index),
                )
                write_image(output_frame_path, frame_bgra, ".png")
            else:
                composited_bgr = composite_with_color(frame_bgra, args.bg_color_rgb)
                output_frame_path = os.path.join(
                    frames_dir,
                    "frame_{0:06d}.jpg".format(frame_index),
                )
                write_image(output_frame_path, composited_bgr, ".jpg")

            processed += 1
            if processed % 30 == 0:
                if total_frames > 0:
                    print("Processed {0}/{1} frames...".format(processed, total_frames))
                else:
                    print("Processed {0} frames...".format(processed))

            if args.max_frames > 0 and processed >= args.max_frames:
                break
    finally:
        capture.release()

    if processed == 0:
        raise RuntimeError("No frames were processed from input video.")

    print("Frame processing done: {0} frame(s).".format(processed))
    return fps


def build_ffmpeg_command(args, frames_dir, fps_value):
    if args.mode == "alpha":
        frame_pattern = os.path.join(frames_dir, "frame_%06d.png")
        video_codec_args = [
            "-c:v",
            "libvpx-vp9",
            "-pix_fmt",
            "yuva420p",
            "-auto-alt-ref",
            "0",
        ]
    else:
        frame_pattern = os.path.join(frames_dir, "frame_%06d.jpg")
        video_codec_args = [
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "18",
            "-preset",
            "medium",
        ]

    command = [
        "ffmpeg",
        "-y",
        "-framerate",
        "{0:.6f}".format(fps_value),
        "-i",
        frame_pattern,
    ]

    if args.keep_audio:
        command.extend(["-i", args.input, "-map", "0:v:0", "-map", "1:a?"])
    else:
        command.extend(["-map", "0:v:0"])

    command.extend(video_codec_args)

    if args.keep_audio:
        if args.mode == "alpha":
            command.extend(["-c:a", "libopus", "-b:a", "128k"])
        else:
            command.extend(["-c:a", "aac", "-b:a", "192k"])
        command.append("-shortest")

    command.append(args.output)
    return command


def run_ffmpeg(command):
    result = subprocess.run(command, capture_output=True, text=True, errors="replace")
    if result.returncode != 0:
        stderr_text = (result.stderr or "").strip()
        raise RuntimeError("ffmpeg failed:\n{0}".format(stderr_text))


def main():
    args = parse_args()
    args.input = os.path.abspath(args.input)
    if not os.path.isfile(args.input):
        sys.stderr.write("Input video file does not exist: {0}\n".format(args.input))
        return 1

    args.output = os.path.abspath(args.output or default_output_path(args.input, args.mode))
    ensure_ffmpeg_available()
    ensure_parent_dir(args.output)

    temp_root = tempfile.mkdtemp(prefix="remove_video_bg_")
    frames_dir = os.path.join(temp_root, "frames")
    os.makedirs(frames_dir)

    try:
        print("Removing background frame by frame...")
        fps_value = remove_background_frames(args, frames_dir)

        ffmpeg_command = build_ffmpeg_command(args, frames_dir, fps_value)
        print("Encoding output video with ffmpeg...")
        run_ffmpeg(ffmpeg_command)
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)

    print("Done.")
    print("Input : {0}".format(args.input))
    print("Output: {0}".format(args.output))
    return 0


if __name__ == "__main__":
    sys.exit(main())
