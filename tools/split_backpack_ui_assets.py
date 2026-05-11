from __future__ import annotations

import json
import uuid
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


SOURCE = Path(r"E:\coco_project\美术\效果图\新图\ChatGPT Image 2026年5月9日 16_15_14.png")
OUTPUT_DIR = Path(r"E:\coco_project\bubble\assets\resources\image\backpack_split")
PREVIEW_DIR = Path(r"E:\coco_project\bubble\tools\generated_previews\backpack_split")
UUID_NAMESPACE = uuid.UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")
REFERENCE_SIZE = (945, 1536)


def feather(mask: Image.Image, radius: float = 1.2) -> Image.Image:
    return mask.filter(ImageFilter.GaussianBlur(radius))


def rounded_rect(size: tuple[int, int], radius: int, blur: float = 1.2) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return feather(mask, blur)


def circle(size: tuple[int, int], blur: float = 1.2) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    inset = max(1, int(min(size) * 0.04))
    draw.ellipse((inset, inset, size[0] - inset - 1, size[1] - inset - 1), fill=255)
    return feather(mask, blur)


def ellipse(size: tuple[int, int], blur: float = 1.2) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    inset_x = max(1, int(size[0] * 0.04))
    inset_y = max(1, int(size[1] * 0.04))
    draw.ellipse((inset_x, inset_y, size[0] - inset_x - 1, size[1] - inset_y - 1), fill=255)
    return feather(mask, blur)


def polygon(size: tuple[int, int], points: list[tuple[float, float]], blur: float = 1.2) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    scaled = [(int(x * size[0]), int(y * size[1])) for x, y in points]
    draw.polygon(scaled, fill=255)
    return feather(mask, blur)


def color_key_mask(crop: Image.Image, sample: tuple[int, int], tolerance: int, blur: float = 0.9) -> Image.Image:
    rgb = crop.convert("RGB")
    bg = rgb.getpixel(sample)
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, bg)).convert("L")
    mask = diff.point(lambda value: 0 if value < tolerance else 255)
    return feather(mask.filter(ImageFilter.MaxFilter(3)), blur)


def apply_mask(crop: Image.Image, mask: Image.Image) -> Image.Image:
    rgba = crop.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


ASSETS = [
    {"name": "screen_background_dimmed", "bbox": (0, 0, 945, 1536), "mask": "rect"},
    {"name": "hud_life_bar_full", "bbox": (19, 37, 353, 124), "mask": "roundrect", "radius": 45},
    {"name": "hud_heart_icon", "bbox": (18, 39, 119, 123), "mask": "ellipse"},
    {"name": "hud_life_plus_button", "bbox": (285, 53, 347, 114), "mask": "circle"},
    {"name": "hud_coin_bar_full", "bbox": (394, 38, 708, 124), "mask": "roundrect", "radius": 45},
    {"name": "hud_coin_icon", "bbox": (395, 39, 480, 121), "mask": "circle"},
    {"name": "hud_coin_plus_button", "bbox": (640, 54, 702, 114), "mask": "circle"},
    {"name": "hud_setting_button", "bbox": (821, 38, 914, 128), "mask": "circle"},
    {"name": "star_chest_badge", "bbox": (30, 161, 151, 268), "mask": "ellipse"},
    {"name": "level_node_09", "bbox": (283, 317, 451, 442), "mask": "ellipse"},
    {"name": "level_node_10", "bbox": (510, 188, 654, 323), "mask": "ellipse"},
    {"name": "backpack_modal_full", "bbox": (42, 453, 891, 1414), "mask": "roundrect", "radius": 74},
    {"name": "backpack_panel_body", "bbox": (46, 531, 887, 1414), "mask": "roundrect", "radius": 62},
    {"name": "backpack_top_glow_bar", "bbox": (49, 454, 884, 567), "mask": "roundrect", "radius": 56},
    {"name": "backpack_title_cloud", "bbox": (277, 408, 622, 561), "mask": "ellipse"},
    {"name": "backpack_close_button", "bbox": (755, 462, 850, 557), "mask": "circle"},
    {"name": "item_card_swap_ball", "bbox": (91, 598, 270, 881), "mask": "roundrect", "radius": 28},
    {"name": "item_card_rainbow_ball", "bbox": (284, 598, 461, 881), "mask": "roundrect", "radius": 28},
    {"name": "item_card_bomb", "bbox": (476, 598, 653, 881), "mask": "roundrect", "radius": 28},
    {"name": "item_card_hammer", "bbox": (668, 598, 846, 881), "mask": "roundrect", "radius": 28},
    {"name": "selected_items_tray", "bbox": (108, 981, 827, 1203), "mask": "roundrect", "radius": 30},
    {"name": "selected_item_slot_rainbow_ball", "bbox": (145, 1001, 322, 1185), "mask": "roundrect", "radius": 24},
    {"name": "selected_item_slot_bomb", "bbox": (354, 1001, 571, 1185), "mask": "roundrect", "radius": 24},
    {"name": "start_game_button", "bbox": (286, 1243, 645, 1342), "mask": "roundrect", "radius": 42},
    {"name": "bubble_top_left_small", "bbox": (246, 431, 304, 490), "mask": "circle"},
    {"name": "bubble_left_mid", "bbox": (212, 500, 268, 557), "mask": "circle"},
    {"name": "bubble_top_right_small", "bbox": (597, 421, 658, 482), "mask": "circle"},
    {"name": "bubble_right_mid", "bbox": (664, 471, 722, 529), "mask": "circle"},
    {"name": "bubble_bottom_left_big", "bbox": (25, 1269, 108, 1353), "mask": "circle"},
    {"name": "bubble_bottom_left_small", "bbox": (79, 1340, 132, 1393), "mask": "circle"},
    {"name": "bubble_bottom_right_big", "bbox": (806, 1269, 896, 1358), "mask": "circle"},
    {"name": "bubble_bottom_right_small", "bbox": (729, 1351, 790, 1412), "mask": "circle"},
    {"name": "icon_swap_ball", "bbox": (118, 682, 232, 798), "mask": "colorkey", "sample": (2, 2), "tolerance": 22},
    {"name": "icon_rainbow_ball", "bbox": (325, 684, 421, 790), "mask": "colorkey", "sample": (2, 2), "tolerance": 24},
    {"name": "icon_bomb", "bbox": (512, 682, 606, 790), "mask": "colorkey", "sample": (2, 2), "tolerance": 24},
    {"name": "icon_hammer", "bbox": (703, 687, 812, 790), "mask": "colorkey", "sample": (2, 2), "tolerance": 26},
    {"name": "check_badge", "bbox": (410, 652, 451, 695), "mask": "circle"},
    {"name": "check_badge_large", "bbox": (285, 1013, 326, 1056), "mask": "circle"},
    {"name": "minus_button", "bbox": (156, 1135, 204, 1182), "mask": "circle"},
    {"name": "plus_button", "bbox": (270, 1135, 318, 1182), "mask": "circle"},
]


def make_mask(asset: dict, crop: Image.Image) -> Image.Image:
    size = crop.size
    kind = asset["mask"]
    if kind == "rect":
        return Image.new("L", size, 255)
    if kind == "roundrect":
        return rounded_rect(size, asset["radius"])
    if kind == "circle":
        return circle(size)
    if kind == "ellipse":
        return ellipse(size)
    if kind == "polygon":
        return polygon(size, asset["points"])
    if kind == "colorkey":
        return color_key_mask(crop, asset["sample"], asset["tolerance"])
    raise ValueError(f"unknown mask kind: {kind}")


def scaled_bbox(bbox: tuple[int, int, int, int], source_size: tuple[int, int]) -> tuple[int, int, int, int]:
    sx = source_size[0] / REFERENCE_SIZE[0]
    sy = source_size[1] / REFERENCE_SIZE[1]
    left, top, right, bottom = bbox
    return (
        round(left * sx),
        round(top * sy),
        round(right * sx),
        round(bottom * sy),
    )


def scaled_asset(asset: dict, source_size: tuple[int, int]) -> dict:
    result = dict(asset)
    result["bbox"] = scaled_bbox(tuple(asset["bbox"]), source_size)
    if "radius" in asset:
        result["radius"] = round(asset["radius"] * source_size[1] / REFERENCE_SIZE[1])
    return result


def save_preview(path: Path, image: Image.Image) -> None:
    bg = Image.new("RGBA", image.size, (18, 12, 42, 255))
    bg.alpha_composite(image)
    bg.convert("RGB").save(path)


def stable_uuid(name: str) -> str:
    return str(uuid.uuid5(UUID_NAMESPACE, f"bubble/backpack_split/{name}"))


def write_folder_meta(path: Path) -> None:
    meta = {
        "ver": "1.1.3",
        "uuid": stable_uuid(path.name),
        "importer": "folder",
        "isBundle": False,
        "bundleName": "",
        "priority": 1,
        "compressionType": {},
        "optimizeHotUpdate": {},
        "inlineSpriteFrames": {},
        "isRemoteBundle": {},
        "subMetas": {},
    }
    with Path(f"{path}.meta").open("w", encoding="utf-8") as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=2)


def write_png_meta(path: Path, size: tuple[int, int]) -> None:
    raw_uuid = stable_uuid(f"{path.stem}:texture")
    sprite_uuid = stable_uuid(f"{path.stem}:sprite")
    width, height = size
    meta = {
        "ver": "2.3.7",
        "uuid": raw_uuid,
        "importer": "texture",
        "type": "sprite",
        "wrapMode": "clamp",
        "filterMode": "bilinear",
        "premultiplyAlpha": False,
        "genMipmaps": False,
        "packable": True,
        "width": width,
        "height": height,
        "platformSettings": {},
        "subMetas": {
            path.stem: {
                "ver": "1.0.6",
                "uuid": sprite_uuid,
                "importer": "sprite-frame",
                "rawTextureUuid": raw_uuid,
                "trimType": "auto",
                "trimThreshold": 1,
                "rotated": False,
                "offsetX": 0,
                "offsetY": 0,
                "trimX": 0,
                "trimY": 0,
                "width": width,
                "height": height,
                "rawWidth": width,
                "rawHeight": height,
                "borderTop": 0,
                "borderBottom": 0,
                "borderLeft": 0,
                "borderRight": 0,
                "subMetas": {},
            }
        },
    }
    with Path(f"{path}.meta").open("w", encoding="utf-8") as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=2)


def write_contact_sheet(entries: list[tuple[str, Image.Image]]) -> None:
    tile_w = 220
    tile_h = 190
    cols = 4
    rows = (len(entries) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tile_w, rows * tile_h), (18, 12, 42))
    draw = ImageDraw.Draw(sheet)
    for index, (name, image) in enumerate(entries):
        col = index % cols
        row = index // cols
        x = col * tile_w
        y = row * tile_h
        preview = Image.new("RGBA", (tile_w, tile_h - 34), (18, 12, 42, 255))
        item = image.copy()
        item.thumbnail((tile_w - 24, tile_h - 54), Image.Resampling.LANCZOS)
        px = (preview.width - item.width) // 2
        py = (preview.height - item.height) // 2
        preview.alpha_composite(item, (px, py))
        sheet.paste(preview.convert("RGB"), (x, y))
        draw.text((x + 8, y + tile_h - 28), name[:30], fill=(235, 231, 255))
    sheet.save(PREVIEW_DIR / "contact_sheet.jpg", quality=92)


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    write_folder_meta(OUTPUT_DIR)

    source = Image.open(SOURCE).convert("RGB")
    manifest = {
        "source": str(SOURCE),
        "source_size": source.size,
        "reference_size": REFERENCE_SIZE,
        "note": "Assets are sliced from a composited concept screenshot; transparent interiors cannot be perfectly recovered from the source render.",
        "assets": [],
    }
    previews = []

    for raw_asset in ASSETS:
        asset = scaled_asset(raw_asset, source.size)
        bbox = tuple(asset["bbox"])
        crop = source.crop(bbox)
        mask = make_mask(asset, crop)
        output = apply_mask(crop, mask)
        out_path = OUTPUT_DIR / f"{asset['name']}.png"
        output.save(out_path)
        write_png_meta(out_path, output.size)
        save_preview(PREVIEW_DIR / f"{asset['name']}_preview.jpg", output)
        previews.append((asset["name"], output))
        manifest["assets"].append(
            {
                "name": asset["name"],
                "file": str(out_path),
                "bbox": bbox,
                "size": output.size,
                "mask": asset["mask"],
            }
        )

    with (OUTPUT_DIR / "manifest.json").open("w", encoding="utf-8") as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=2)
    write_contact_sheet(previews)


if __name__ == "__main__":
    main()
