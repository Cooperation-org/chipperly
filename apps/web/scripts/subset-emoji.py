"""Subset Twemoji Mozilla (COLRv0) to the emoji the app can show.

Usage: python scripts/subset-emoji.py [path/to/Twemoji.Mozilla.ttf]
(see app/fonts/README.md). Scans the shared constants and the web app
source for every code point the emoji font has a glyph for, then writes
app/fonts/twemoji-chipperly.woff2.
"""
import glob
import io
import os
import subprocess
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("TMP", "/tmp"), "TwemojiMozilla.ttf")
OUT = os.path.join(ROOT, "apps", "web", "app", "fonts", "twemoji-chipperly.woff2")

font = TTFont(SRC)
cmap = font.getBestCmap()

used = set()
patterns = [
    "packages/shared/src/**/*.ts",
    "apps/web/components/**/*.tsx",
    "apps/web/app/**/*.tsx",
    "apps/web/lib/**/*.ts",
    "apps/api/src/seed/**/*.ts",
]
for pat in patterns:
    for path in glob.glob(os.path.join(ROOT, pat), recursive=True):
        if "node_modules" in path or os.sep + "out" + os.sep in path:
            continue
        text = io.open(path, encoding="utf-8", errors="ignore").read()
        for ch in text:
            cp = ord(ch)
            if cp >= 0x2000 and cp in cmap:
                used.add(cp)

# Always keep the joiners and variation selector so sequences shape correctly.
for cp in (0xFE0F, 0x200D, 0x20E3):
    if cp in cmap:
        used.add(cp)

print("code points kept:", len(used))
unicodes = ",".join(f"U+{cp:04X}" for cp in sorted(used))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
subprocess.check_call([
    sys.executable, "-m", "fontTools.subset", SRC,
    f"--unicodes={unicodes}",
    "--flavor=woff2",
    "--layout-features=*",
    "--name-IDs=*",
    f"--output-file={OUT}",
])
print("wrote", OUT, os.path.getsize(OUT), "bytes")
sub = TTFont(OUT)
missing = [ch for ch in sorted(used) if ch not in sub.getBestCmap()]
print("missing after subset:", missing)
