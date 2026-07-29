"""Generate 5 π icon previews for comparison. Output 128px PNGs in docs/icons/."""
from PIL import Image, ImageDraw, ImageFont
import os, math

OUT = os.path.expanduser("/Users/ysl/AI/pi-desktop/docs/icons")
os.makedirs(OUT, exist_ok=True)
SIZE = 512  # render at 512 for crisp downscale
R = int(SIZE * 0.22)
FONT_PATH = "/System/Library/Fonts/Supplemental/Times New Roman.ttf"
FONT_SIZE = int(SIZE * 0.58)
font = ImageFont.truetype(FONT_PATH, FONT_SIZE)

def rounded_mask(s, r):
    m = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle(((0, 0), (s - 1, s - 1)), r, fill=255)
    return m

def make_icon(name, bg_top, bg_bottom, text_color, sheen_alpha, border_alpha):
    """Generate one variant and save 128px PNG."""
    canvas = Image.new("RGB", (SIZE, SIZE), bg_top)
    # vertical gradient
    for y in range(SIZE):
        t = y / SIZE
        r = int((1 - t) * bg_top[0] + t * bg_bottom[0])
        g = int((1 - t) * bg_top[1] + t * bg_bottom[1])
        b = int((1 - t) * bg_top[2] + t * bg_bottom[2])
        ImageDraw.Draw(canvas).line(((0, y), (SIZE - 1, y)), fill=(r, g, b))
    canvas = canvas.convert("RGBA")

    # top sheen (gradient alpha)
    sheen = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    half = SIZE // 2
    for y in range(half):
        a = int(sheen_alpha * (1 - y / half))
        sd.line(((0, y), (SIZE - 1, y)), fill=(255, 255, 255, a))
    canvas = Image.alpha_composite(canvas, sheen)

    # round corners
    mask = rounded_mask(SIZE, R)
    rounded = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rounded.paste(canvas, mask=mask)

    # border
    border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle(((0, 0), (SIZE - 1, SIZE - 1)), R,
                         outline=(255, 255, 255, border_alpha), width=max(1, SIZE // 256))
    rounded = Image.alpha_composite(rounded, border)

    # π glyph
    draw = ImageDraw.Draw(rounded)
    bbox = font.getbbox("π")
    text_w = bbox[2] - bbox[0]
    ascent, descent = font.getmetrics()
    text_h = ascent + descent
    # optical center (6% up from geometric center for π's visual balance)
    x = (SIZE - text_w) // 2 - bbox[0]
    y_offset = int(SIZE * 0.06)
    y = (SIZE - text_h) // 2 - bbox[1] - y_offset
    draw.text((x, y), "π", fill=text_color, font=font)

    # downscale to 128
    thumb = rounded.resize((128, 128), Image.LANCZOS)
    thumb.save(os.path.join(OUT, f"{name}.png"))
    print(f"  ✓ {name}.png")

# ── 5 variants ────────────────────────────────────────────
print("Generating 5 π icon variants...")

# A — Current: blue-violet gradient + white italic π
make_icon("A-current", (107, 143, 247), (74, 95, 199),
          (255, 255, 255), sheen_alpha=70, border_alpha=26)

# B — Deeper navy + pure white π (Apple Mail style)
make_icon("B-navy", (30, 56, 140), (18, 36, 92),
          (255, 255, 255), sheen_alpha=50, border_alpha=20)

# C — Light bg + blue π (inverted — bright Dock icon)
make_icon("C-light", (240, 242, 248), (210, 215, 230),
          (37, 99, 235), sheen_alpha=80, border_alpha=30)

# D — Deep teal + golden π (warm, premium)
make_icon("D-teal-gold", (20, 30, 42), (12, 20, 30),
          (255, 190, 60), sheen_alpha=40, border_alpha=20)

# E — Purple-black + violet π (dark+accent, VS Code style)
make_icon("E-purple", (22, 18, 32), (10, 8, 16),
          (167, 139, 255), sheen_alpha=35, border_alpha=18)

print(f"\nDone — {len(os.listdir(OUT))} variants in {OUT}")
