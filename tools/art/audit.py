"""Size audit: opaque height of every frame of characters and monsters (public/art).

usage: uv run --with pillow --with numpy tools/art/audit.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).parent.parent.parent / "public" / "art"
for entry in json.loads((OUT / "manifest.json").read_text()):
    if entry["group"] not in ("勇者", "仲間", "モンスター"):
        continue
    sheet = np.array(Image.open(OUT / f"{entry['id']}.png").convert("RGBA"))
    w, h = entry["frame"]
    sizes = []
    for i, name in enumerate(entry["frames"]):
        alpha = sheet[:, i * w:(i + 1) * w, 3] > 0
        rows, cols = np.nonzero(alpha.any(axis=1))[0], np.nonzero(alpha.any(axis=0))[0]
        sizes.append(f"{name}:{cols.max() - cols.min() + 1}x{rows.max() - rows.min() + 1}" if len(rows) else f"{name}:-")
    print(f"{entry['id']:22} {' '.join(sizes)}")
