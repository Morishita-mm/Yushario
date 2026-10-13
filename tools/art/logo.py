"""Turn the ChatGPT logo into the app's pixel-art logo files.

usage: uv run --with pillow --with numpy tools/art/logo.py

The source .art-work/raw/logo.png has the one-line YUSHARIO wordmark on the left and the square icon
on the right, on #FF00FF magenta. Its pixels are not on an exact grid, so each output size is redrawn
by picking the most common colour in each cell. Writes public/logo/*, public/favicon.ico and the
terminal pixels in src/server/logo-pixels.ts.
"""
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).parent.parent.parent
RAW = ROOT / ".art-work" / "raw" / "logo.png"
OUT = ROOT / "public" / "logo"


def parts() -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Wordmark and icon, each cropped, with its foreground mask."""
    a = np.array(Image.open(RAW).convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mask = ~((r > 150) & (b > 150) & (g < 120))
    mask &= ~((np.minimum(r, b) - g > 50) & (np.minimum(r, b) > 100))  # magenta-tinted fringe
    cols = mask.sum(0) > 2
    spans, start = [], None
    for x, filled in enumerate([*cols, False]):
        if filled and start is None:
            start = x
        if not filled and start is not None:
            if x - start > 20:
                spans.append((start, x))
            start = None
    # The wordmark is everything left of the widest gap; the icon is what follows.
    gaps = [spans[i + 1][0] - spans[i][1] for i in range(len(spans) - 1)]
    cut = int(np.argmax(gaps))
    out = {}
    for name, (x0, x1) in {"wordmark": (spans[0][0], spans[cut][1]), "icon": (spans[cut + 1][0], spans[-1][1])}.items():
        m = mask[:, x0:x1]
        ys = np.nonzero(m.any(1))[0]
        out[name] = (a[ys.min():ys.max() + 1, x0:x1].astype(np.uint8), m[ys.min():ys.max() + 1])
    return out


def redraw(rgb: np.ndarray, mask: np.ndarray, w: int, h: int, colors: int, method: Image.Quantize) -> np.ndarray:
    """Most common colour per output cell, after reducing the source to a few colours."""
    # Paint the magenta background like the dark outline, so it takes no colour of its own.
    rgb = np.where(mask[..., None], rgb, rgb[mask].min(axis=0)).astype(np.uint8)
    q = Image.fromarray(rgb).quantize(colors=colors, method=method, dither=Image.Dither.NONE)
    palette = np.array(q.getpalette()[:colors * 3]).reshape(-1, 3)
    labels = np.array(q).astype(int)
    labels[~mask] = colors  # background
    ys = np.linspace(0, mask.shape[0], h + 1).astype(int)
    xs = np.linspace(0, mask.shape[1], w + 1).astype(int)
    out = np.zeros((h, w, 4), np.uint8)
    for j in range(h):
        for i in range(w):
            cell = labels[ys[j]:ys[j + 1], xs[i]:xs[i + 1]].ravel()
            counts = np.bincount(cell, minlength=colors + 1)
            if counts[colors] > 0.6 * cell.size:
                continue
            counts[colors] = 0
            out[j, i, :3], out[j, i, 3] = palette[counts.argmax()], 255
    return out


def fit(part: tuple[np.ndarray, np.ndarray], colors: int, width: int | None = None, height: int | None = None,
        method: Image.Quantize = Image.Quantize.FASTOCTREE) -> np.ndarray:
    rgb, mask = part
    h0, w0 = mask.shape
    w, h = (width, round(h0 * width / w0)) if width else (round(w0 * height / h0), height)
    return redraw(rgb, mask, w, h, colors, method)


def scaled(im: np.ndarray, k: int) -> np.ndarray:
    return np.kron(im, np.ones((k, k, 1), np.uint8))


def png(im: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(im, "RGBA").save(buf, "PNG")
    return buf.getvalue()


def main() -> None:
    p = parts()
    title = fit(p["wordmark"], 32, width=114)       # start screen, shown 6x
    header = fit(p["wordmark"], 24, height=54)      # top-left of the app, 1:1
    terminal = fit(p["wordmark"], 16, height=27)    # half-block characters: 2 pixels per row
    # Octree keeps the small red gem in the wordmark; median cut keeps the icon's gold frame.
    icon32 = fit(p["icon"], 16, width=32, method=Image.Quantize.MEDIANCUT)
    icon16 = fit(p["icon"], 12, width=16, method=Image.Quantize.MEDIANCUT)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "title.png").write_bytes(png(scaled(title, 6)))
    (OUT / "logo.png").write_bytes(png(header))
    (OUT / "icon-32.png").write_bytes(png(icon32))
    (OUT / "icon-16.png").write_bytes(png(icon16))

    og = np.zeros((640, 1280, 4), np.uint8)
    og[...] = (0x2e, 0x22, 0x2f, 255)
    big = scaled(title, 8)
    y, x = (640 - big.shape[0]) // 2, (1280 - big.shape[1]) // 2
    area = og[y:y + big.shape[0], x:x + big.shape[1]]
    area[...] = np.where(big[..., 3:] > 0, big, area)
    (OUT / "og-1280x640.png").write_bytes(png(og))

    # The ICO holds the exact 16px and 32px PNGs.
    icons = [png(icon16), png(icon32)]
    header_bytes, offset = struct.pack("<HHH", 0, 1, len(icons)), 6 + 16 * len(icons)
    for size, data in zip((16, 32), icons):
        header_bytes += struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    (ROOT / "public" / "favicon.ico").write_bytes(header_bytes + b"".join(icons))

    colors, rows = [], []
    for row in terminal:
        line = ""
        for px in row:
            if px[3] == 0:
                line += "."
                continue
            hexc = "%02x%02x%02x" % tuple(px[:3])
            if hexc not in colors:
                colors.append(hexc)
            line += format(colors.index(hexc), "x")
        rows.append(line)
    assert len(colors) <= 16
    (ROOT / "src" / "server" / "logo-pixels.ts").write_text(
        "// Generated by tools/art/logo.py; same artwork as the browser logo.\n"
        f"export const logoColors = {json.dumps(colors)};\nexport const logoPixels = [\n"
        + "".join(f'  "{row}",\n' for row in rows) + "];\n")
    print(f"title {title.shape[1] * 6}x{title.shape[0] * 6}, header {header.shape[1]}x{header.shape[0]}, "
          f"terminal {terminal.shape[1]}x{terminal.shape[0]}")


if __name__ == "__main__":
    main()
