"""Generate pi-desktop icon set from pi.dev's official SVG favicon.

Uses rsvg-convert (librsvg) to render SVG → PNG, then Python PIL to produce
.icns (macOS), .ico (Windows), and all required marketing sizes.
"""
import os
import subprocess
import struct
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
ICONS_DIR = os.path.join(PROJECT, "src-tauri", "icons")
SVG_SRC = "/tmp/pi-favicon-svg"
MASTER_SIZE = 1024

os.makedirs(ICONS_DIR, exist_ok=True)

# ── Step 1: Render SVG → 1024x1024 PNG via rsvg-convert ──────────
master_png = os.path.join(ICONS_DIR, "icon.png")
subprocess.run(
    ["/opt/homebrew/bin/rsvg-convert", "-w", str(MASTER_SIZE), "-h", str(MASTER_SIZE),
     "-o", master_png, SVG_SRC],
    check=True,
)
print(f"  ✓ {MASTER_SIZE}x{MASTER_SIZE} master → icon.png ({os.path.getsize(master_png)} bytes)")

master = Image.open(master_png)

# ── Step 2: Downscale variants ──────────────────────────────────
sizes = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

for fname, size in sizes.items():
    thumb = master.resize((size, size), Image.LANCZOS)
    path = os.path.join(ICONS_DIR, fname)
    thumb.save(path)
    print(f"  ✓ {fname} ({size}x{size})")

# ── Step 3: Generate icon.icns (macOS) ──────────────────────────
# Apple ICNS spec: raw ARGB data with ic07/ic08/ic09/ic10/ic11/ic12/ic13/ic14 entries
icns_sizes = [16, 32, 64, 128, 256, 512, 1024]

def write_icns_icon_type(f, icon_type, img):
    """Write one icon entry: 4-byte type + 4-byte length + raw ARGB data."""
    w, h = img.size
    raw = b""
    for y in range(h):
        for x in range(w):
            r, g, b, a = img.getpixel((x, y))
            raw += struct.pack("BBBB", a, r, g, b)  # ICNS uses ARGB
    entry_len = 8 + len(raw)
    f.write(icon_type.encode())
    f.write(struct.pack(">I", entry_len))
    f.write(raw)

icns_path = os.path.join(ICONS_DIR, "icon.icns")
with open(icns_path, "wb") as f:
    # Header: 'icns' + total file size (placeholder)
    f.write(b"icns")
    f.write(struct.pack(">I", 0))  # will overwrite later
    for s in icns_sizes:
        icon_type = f"ic{str(s).zfill(2)}" if s < 100 else f"ic{str(s)}"
        thumb = master.resize((s, s), Image.LANCZOS)
        write_icns_icon_type(f, icon_type, thumb)
    # Write total size at offset 4
    total_size = f.tell()
    f.seek(4)
    f.write(struct.pack(">I", total_size))
print(f"  ✓ icon.icns ({total_size} bytes, {len(icns_sizes)} sizes)")

# ── Step 4: Generate icon.ico (Windows) ─────────────────────────
ico_sizes = [16, 24, 32, 48, 64, 128, 256]

def write_ico(f, img, size):
    """Write one ICO entry: raw 32-bit BGRA + AND mask."""
    thumb = img.resize((size, size), Image.LANCZOS)
    # BMP data (BGRA, bottom-up)
    bmp_data = b""
    for y in range(size - 1, -1, -1):
        for x in range(size):
            r, g, b, a = thumb.getpixel((x, y))
            bmp_data += struct.pack("BBBB", b, g, r, a)
    # 32-bit BMP: no AND mask needed
    return size, bmp_data

ico_path = os.path.join(ICONS_DIR, "icon.ico")
entries = []
with open(ico_path, "wb") as f:
    # ICO header
    f.write(struct.pack("<HHH", 0, 1, len(ico_sizes)))  # reserved, type=ico, count
    # Write directory entries + collect data
    offset = 6 + 16 * len(ico_sizes)
    img_data_list = []
    for s in ico_sizes:
        thumb = master.resize((s, s), Image.LANCZOS)
        data = b""
        # BIH + pixels (BGRA bottom-up)
        bih = struct.pack("<IiiHHIIiiII",
            40, s, s * 2, 1, 32, 0,
            s * s * 4, 0, 0, 0, 0)
        data += bih
        for y in range(s - 1, -1, -1):
            for x in range(s):
                r, g, b, a = thumb.getpixel((x, y))
                data += struct.pack("BBBB", b, g, r, a)
        data_size = len(data)
        f.write(struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, data_size, offset))
        img_data_list.append(data)
        offset += data_size
    for data in img_data_list:
        f.write(data)
print(f"  ✓ icon.ico ({os.path.getsize(ico_path)} bytes, {len(ico_sizes)} sizes)")

print(f"\nDone — {len(os.listdir(ICONS_DIR))} files in {ICONS_DIR}")
