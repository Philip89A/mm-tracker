from PIL import Image, ImageDraw, ImageFont
import os

NAVY = (4, 30, 66, 255)
NAVY2 = (10, 42, 94, 255)
GOLD = (201, 162, 39, 255)
GOLD_LIGHT = (230, 200, 96, 255)

FONT_BOLD = "/c/Windows/Fonts/arialbd.ttf".replace("/c/", "C:/")

def make_icon(size, out_path, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # rounded square background, navy gradient (approximated with two rects)
    radius = int(size * radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=NAVY)

    # subtle diagonal gradient overlay
    grad = Image.new("L", (size, size), 0)
    gdraw = ImageDraw.Draw(grad)
    for y in range(size):
        val = int(40 * (y / size))
        gdraw.line([(0, y), (size, y)], fill=val)
    overlay = Image.new("RGBA", (size, size), NAVY2)
    overlay.putalpha(grad)
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    img = Image.composite(overlay, img, Image.composite(overlay, img, mask).convert("L"))
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=NAVY)
    draw.rounded_rectangle([0, int(size*0.55), size - 1, size - 1], radius=0, fill=None)

    # gold circle
    cx, cy = size / 2, size / 2
    r = size * 0.30
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)

    # "M&M" text in navy on gold circle
    try:
        font = ImageFont.truetype(FONT_BOLD, int(size * 0.22))
    except Exception:
        font = ImageFont.load_default()
    text = "M&M"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw/2 - bbox[0], cy - th/2 - bbox[1]), text, font=font, fill=NAVY)

    # small gold star top-right accent
    img.save(out_path, "PNG")

def make_maskable(size, out_path):
    # maskable icon needs safe zone padding ~ 10% each side, full bleed bg
    img = Image.new("RGBA", (size, size), NAVY)
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2
    r = size * 0.26
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)
    try:
        font = ImageFont.truetype(FONT_BOLD, int(size * 0.18))
    except Exception:
        font = ImageFont.load_default()
    text = "M&M"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw/2 - bbox[0], cy - th/2 - bbox[1]), text, font=font, fill=NAVY)
    img.save(out_path, "PNG")

out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(out_dir, exist_ok=True)

make_icon(192, os.path.join(out_dir, "icon-192.png"))
make_icon(512, os.path.join(out_dir, "icon-512.png"))
make_icon(180, os.path.join(out_dir, "apple-touch-icon.png"), radius_ratio=0.0)
make_maskable(512, os.path.join(out_dir, "icon-maskable-512.png"))

print("done")
