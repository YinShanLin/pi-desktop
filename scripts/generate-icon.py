"""Generate the π app icon set for Pi Desktop.

Outputs to src-tauri/icons/ — replaces all existing files with a consistent
π design: rounded square, blue gradient, white italic π centered.

Required output set (what Tauri references in tauri.conf.json bundle.icon
plus the standard extras for iOS / Windows Store / general use):

  32x32.png
  128x128.png
  128x128@2x.png        (256x256)
  icon.icns              (macOS, multi-size)
  icon.ico               (Windows, multi-size)
  icon.png               (master, 1024x1024)
  StoreLogo.png          (Microsoft Store, 50x50)
  Square30x30Logo.png
  Square44x44Logo.png
  Square71x71Logo.png
  Square89x89Logo.png
  Square107x107Logo.png
  Square142x142Logo.png
  Square150x150Logo.png
  Square284x284Logo.png
  Square310x310Logo.png
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ICONS_DIR = Path("/Users/ysl/AI/pi-desktop/src-tauri/icons")

# Style F accent palette — keep consistent with the app surface.
BG_TOP    = (107, 143, 247)   # #6b8ff7
BG_BOTTOM = (74, 95, 199)     # #4a5fc7
PI_WHITE  = (255, 255, 255)
HIGHLIGHT = (255, 255, 255, 28)  # subtle top sheen


def find_font() -> str | None:
    """Return the first font path that has a usable italic glyph, else None."""
    candidates = [
        # italic-capable, present on most macOS installs
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/System/Library/Fonts/Times.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Times New Roman.ttf",
        "/System/Library/Fonts/Palatino.ttc",
        "/System/Library/Fonts/Supplemental/Palatino.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def vertical_gradient(size: int) -> Image.Image:
    """Return size×size RGB image with a top→bottom gradient."""
    img = Image.new("RGB", (size, size), BG_TOP)
    px = img.load()
    top, bot = BG_TOP, BG_BOTTOM
    for y in range(size):
        t = y / max(size - 1, 1)
        r = lerp(top[0], bot[0], t)
        g = lerp(top[1], bot[1], t)
        b = lerp(top[2], bot[2], t)
        for x in range(size):
            px[x, y] = (r, g, b)
    return img


def rounded_mask(size: int, radius_px: int) -> Image.Image:
    """Return size×size 1-bit alpha mask with rounded corners."""
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        ((0, 0), (size - 1, size - 1)), radius=radius_px, fill=255
    )
    return mask


def render_pi(size: int, font_path: str | None) -> Image.Image:
    """Render the final size×size RGBA π icon."""
    canvas = vertical_gradient(size).convert("RGBA")

    # Subtle top-down sheen — vertical alpha gradient so there's no visible
    # seam at the midpoint (vs. drawing a hard rectangle).
    sheen = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    for y in range(size // 2):
        t = 1 - (y / max(size // 2 - 1, 1))  # 1.0 at top → 0.0 at midpoint
        sd.line((0, y, size, y), fill=(255, 255, 255, int(28 * t)))
    canvas = Image.alpha_composite(canvas, sheen)

    # Round the corners (~22% — macOS app-icon ratio).
    mask = rounded_mask(size, radius_px=int(size * 0.2237))
    rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rounded.paste(canvas, mask=mask)

    # Inner hairline border on top of background, inside the rounded shape.
    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle(
        ((0, 0), (size - 1, size - 1)),
        radius=int(size * 0.2237),
        outline=(255, 255, 255, 26),
        width=max(1, size // 256),
    )
    rounded = Image.alpha_composite(rounded, border)

    # Render the π character — italic, white, centered.
    # Use ~62% of size as font height; nudge baseline so optical center lines
    # up with the geometric center of the rounded square.
    font_size = int(size * 0.62)
    if font_path:
        font = ImageFont.truetype(font_path, font_size)
    else:
        font = ImageFont.load_default()

    text = "π"
    bbox = font.getbbox(text)
    if bbox is None or bbox == (0, 0, 0, 0):
        return rounded

    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2 - bbox[0]
    # Optical centering: nudge up by ~6% so italic glyphs with descenders
    # visually sit in the middle.
    y = (size - text_h) // 2 - bbox[1] - int(size * 0.06)

    draw = ImageDraw.Draw(rounded)
    draw.text((x, y), text, fill=PI_WHITE, font=font)

    return rounded


def make_size(pixels: int, font_path: str | None) -> Image.Image:
    """Render at a high master (1024) then downscale for crisp edges."""
    base = render_pi(1024, font_path)
    if pixels == 1024:
        return base
    return base.resize((pixels, pixels), Image.LANCZOS)


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGBA").save(path, "PNG", optimize=True)


def make_ico(sizes: list[int], font_path: str | None) -> Image.Image:
    """Compose a multi-size .ico file. PIL writes all sizes into one .ico."""
    frames = [make_size(s, font_path) for s in sizes]
    return frames  # returned as list for PIL's save(..., format='ICO', ...)


def main() -> None:
    font_path = find_font()
    print(f"Font: {font_path or '(default bitmap)'}")

    # Master image used for several outputs.
    master = make_size(1024, font_path)
    save_png(master, ICONS_DIR / "icon.png")

    # Standard Tauri PNG sizes.
    save_png(make_size(32, font_path), ICONS_DIR / "32x32.png")
    save_png(make_size(128, font_path), ICONS_DIR / "128x128.png")
    save_png(make_size(256, font_path), ICONS_DIR / "128x128@2x.png")

    # Windows ICO — multi-resolution. macOS .icns generation requires a
    # sequence of 16/32/64/128/256/512/1024 sizes; we build a sensible set.
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico_frames = [make_size(s, font_path).convert("RGBA") for s in ico_sizes]
    master.convert("RGBA").save(
        ICONS_DIR / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_frames[1:],
    )

    icns_sizes = [16, 32, 64, 128, 256, 512]
    icns_frames = [make_size(s, font_path).convert("RGBA") for s in icns_sizes]
    # PIL >=10 supports ICNS via save(format='ICNS', sizes=...).
    master.convert("RGBA").save(
        ICONS_DIR / "icon.icns",
        format="ICNS",
        sizes=[(s, s) for s in icns_sizes],
        append_images=icns_frames[1:],
    )

    # iOS marketing icons (Apple keeps these around for older bundling paths
    # and they double as nice-looking large icon sources).
    for px in [
        ("Square30x30Logo.png", 30),
        ("Square44x44Logo.png", 44),
        ("Square71x71Logo.png", 71),
        ("Square89x89Logo.png", 89),
        ("Square107x107Logo.png", 107),
        ("Square142x142Logo.png", 142),
        ("Square150x150Logo.png", 150),
        ("Square284x284Logo.png", 284),
        ("Square310x310Logo.png", 310),
    ]:
        name, size = px
        save_png(make_size(size, font_path), ICONS_DIR / name)

    # Microsoft Store logo (commonly 50×50 used by tauri bundle pipeline).
    save_png(make_size(50, font_path), ICONS_DIR / "StoreLogo.png")

    print("Wrote:", ICONS_DIR)


if __name__ == "__main__":
    main()