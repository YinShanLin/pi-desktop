"""Generate a 1024x1024 app icon for Pi Desktop (macOS production use).

Outputs src-tauri/icons/icon.png, then run `npx tauri icon` to produce all
platform variants from this single source.
"""
from PIL import Image, ImageDraw, ImageFont
import os, sys

SIZE = 1024
R = int(SIZE * 0.22)        # Apple-style corner radius
FONT_PATH = "/System/Library/Fonts/Supplemental/Times New Roman.ttf"
FONT_SIZE = int(SIZE * 0.56)
OUT = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons", "icon.png")

def make_icon():
    # Gradient background: blue-violet top → darker blue bottom
    canvas = Image.new("RGB", (SIZE, SIZE), (107, 143, 247))
    for y in range(SIZE):
        t = y / SIZE
        r = int((1 - t) * 107 + t * 74)
        g = int((1 - t) * 143 + t * 95)
        b = int((1 - t) * 247 + t * 199)
        ImageDraw.Draw(canvas).line(((0, y), (SIZE - 1, y)), fill=(r, g, b))
    canvas = canvas.convert("RGBA")

    # Top sheen (subtle reflective gloss)
    sheen = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    for y in range(SIZE // 2):
        a = int(55 * (1 - y / (SIZE // 2)))
        sd.line(((0, y), (SIZE - 1, y)), fill=(255, 255, 255, a))
    canvas = Image.alpha_composite(canvas, sheen)

    # Rounded corners mask
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(((0, 0), (SIZE - 1, SIZE - 1)), R, fill=255)
    rounded = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rounded.paste(canvas, mask=mask)

    # Thin white border inside the rounded rect
    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle(((0, 0), (SIZE - 1, SIZE - 1)), R, outline=(255, 255, 255, 20), width=max(1, SIZE // 256))
    rounded = Image.alpha_composite(rounded, border)

    # "π" glyph — Times New Roman italic, centered optically
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    draw = ImageDraw.Draw(rounded)
    bbox = font.getbbox("π")
    text_w = bbox[2] - bbox[0]
    ascent, descent = font.getmetrics()
    text_h = ascent + descent
    x = (SIZE - text_w) // 2 - bbox[0]
    y = (SIZE - text_h) // 2 - bbox[1] - int(SIZE * 0.06)
    draw.text((x, y), "π", fill=(255, 255, 255), font=font)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    rounded.save(OUT)
    print(f"  ✓ {OUT} ({SIZE}×{SIZE})")

if __name__ == "__main__":
    make_icon()
