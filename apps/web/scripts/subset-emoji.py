"""Subset Twemoji Mozilla (COLRv0) to the emoji the app can show.

Usage: python scripts/subset-emoji.py [path/to/Twemoji.Mozilla.ttf]
(see app/fonts/README.md). Scans the shared constants and the web app
source for every code point the emoji font has a glyph for, then writes
app/fonts/twemoji-chipperly.woff2.

With an emoji name list beside the font (emojibase-compact.json, see the
README) it also writes the searchable set: lib/emoji/all.json and the font
that draws it, app/fonts/twemoji-all.woff2.
"""
import glob
import io
import json
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


# --- The searchable set: every emoji the font can draw, with the words to find it by. ---
NAMES = os.path.join(os.path.dirname(SRC), "emojibase-compact.json")
if not os.path.exists(NAMES):
    print("no", NAMES, "- searchable set left as it is")
    sys.exit(0)

# Sequences the font joins into one glyph (a ZWJ sequence it lacks would draw as its separate parts).
ligatures = set()
for lookup in font["GSUB"].table.LookupList.Lookup:
    for sub in lookup.SubTable:
        sub = getattr(sub, "ExtSubTable", sub)
        if getattr(sub, "LookupType", None) != 4:
            continue
        for first, ligs in sub.ligatures.items():
            for lig in ligs:
                ligatures.add((first, *lig.Component))


def drawable(emoji):
    cps = [ord(ch) for ch in emoji]
    if any(cp not in cmap for cp in cps if cp != 0xFE0F):
        return False
    bare = [cp for cp in cps if cp != 0xFE0F]
    if len(bare) == 1:
        return True
    return any(tuple(cmap[cp] for cp in seq) in ligatures for seq in (cps, bare) if all(cp in cmap for cp in seq))


# ponytail: no flags (group 9), no skin-tone variants and no loose components (group 2); add them if someone asks.
rows = []
for entry in json.load(io.open(NAMES, encoding="utf-8")):
    if entry.get("group") in (None, 2, 9) or not drawable(entry["unicode"]):
        continue
    words = " ".join(dict.fromkeys(" ".join([entry["label"], *entry.get("tags", [])]).lower().split()))
    rows.append([entry["unicode"], words])

ALL_JSON = os.path.join(ROOT, "apps", "web", "lib", "emoji", "all.json")
ALL_FONT = os.path.join(ROOT, "apps", "web", "app", "fonts", "twemoji-all.woff2")
os.makedirs(os.path.dirname(ALL_JSON), exist_ok=True)
with io.open(ALL_JSON, "w", encoding="utf-8", newline="\n") as f:
    json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    f.write("\n")
all_cps = used | {ord(ch) for emoji, _ in rows for ch in emoji}
subprocess.check_call([
    sys.executable, "-m", "fontTools.subset", SRC,
    "--unicodes=" + ",".join(f"U+{cp:04X}" for cp in sorted(all_cps)),
    "--flavor=woff2",
    "--layout-features=*",
    "--name-IDs=*",
    f"--output-file={ALL_FONT}",
])
print("searchable emoji:", len(rows), "json", os.path.getsize(ALL_JSON), "bytes, font", os.path.getsize(ALL_FONT), "bytes")
