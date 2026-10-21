"""Clean generated images into true pixel art and pack them as uniform sprite sheets.

usage: uv run --with unfake --with pillow --with numpy tools/art/pack.py [id ...]

For each component in components.json with a raw image in .art-work/raw/<id>.png:
1. unfake: detect the art-pixel grid, downscale by dominant colour, snap to the shared palette,
   flood-fill the green background to transparency, clean up jaggies.
2. Split frames at fully transparent column gaps, then pack them into equal cells (bottom-centre aligned).
3. Write public/art/<id>.png and public/art/manifest.json.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from blobs import blobs, split_by_blobs

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
RAW = ROOT / ".art-work" / "raw"
OUT = ROOT / "public" / "art"
TILE = 48


def unfake(src: Path, dst: Path, scale: float | None = None) -> None:
    subprocess.run([
        shutil.which("unfake") or "unfake", str(src), "-o", str(dst), "-c", "24", "--transparent-background",
        *(["-s", str(max(1, round(scale)))] if scale else []),
        "--background-tolerance", "40", "--cleanup", "morph,jaggy", "-q",
    ], check=True)


PALETTE = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)]
                    for h in (HERE / "resurrect-64.hex").read_text().split()], float)


def to_palette(image: np.ndarray) -> np.ndarray:
    """Snap every opaque colour to the nearest shared-palette colour (redmean distance)."""
    opaque = image[..., 3] > 0
    colors = image[opaque][:, :3].astype(float)
    r = (colors[:, None, 0] + PALETTE[None, :, 0]) / 2
    d = PALETTE[None] - colors[:, None]
    dist = (2 + r / 256) * d[..., 0] ** 2 + 4 * d[..., 1] ** 2 + (2 + (255 - r) / 256) * d[..., 2] ** 2
    image[opaque, :3] = PALETTE[dist.argmin(axis=1)].astype(np.uint8)
    return image


def raw_frame_box(src: Path, frame: int, count: int) -> tuple[int, int]:
    """Width and height (raw pixels) of one frame of a generated sheet, found on a 4x-reduced mask."""
    raw = np.array(Image.open(src).convert("RGB"))[::4, ::4].astype(int)
    r, g, b = raw[..., 0], raw[..., 1], raw[..., 2]
    mask = ~((g > 120) & (g - np.maximum(r, b) > 60)) & ~((r > 180) & (b > 180) & (g < 110))
    labels = blobs(mask)
    sizes = np.bincount(labels.ravel())
    cols = np.nonzero(mask.any(axis=0))[0]
    left, width = cols.min(), (cols.max() + 1 - cols.min()) / count
    owner = {}
    for label in range(1, labels.max() + 1):
        if sizes[label] < 6:
            continue
        xs = np.nonzero(labels == label)[1]
        owner[label] = min(count - 1, int((xs.mean() - left) // width))
    picked = np.isin(labels, [label for label, slot in owner.items() if slot == frame])
    ys, xs = np.nonzero(picked)
    return (xs.max() - xs.min() + 1) * 4, (ys.max() - ys.min() + 1) * 4


def packed_frame_box(component_id: str, frame: int) -> tuple[int, int]:
    entry = next(e for e in json.loads((OUT / "manifest.json").read_text()) if e["id"] == component_id)
    w, h = entry["frame"]
    alpha = np.array(Image.open(OUT / f"{component_id}.png").convert("RGBA"))[:, frame * w:(frame + 1) * w, 3] > 0
    ys, xs = np.nonzero(alpha)
    return xs.max() - xs.min() + 1, ys.max() - ys.min() + 1


def fit_scale(component: dict, src: Path) -> float | None:
    """Pick the art-pixel size so that one frame ends up a given size, keeping sprites consistent.

    "fit": {"frame": j, "h": 53}                                  -> frame j is 53 px tall
    "fit": {"frame": j, "like": "monster-dragon", "refFrame": i, "dim": "w"} -> as wide as that frame
    """
    fit = component.get("fit")
    if not fit:
        return None
    w, h = raw_frame_box(src, fit["frame"], len(component["frames"]))
    if "like" in fit:
        rw, rh = packed_frame_box(fit["like"], fit.get("refFrame", 0))
        return (w / rw) if fit.get("dim") == "w" else (h / rh)
    return (w / fit["w"]) if "w" in fit else (h / fit["h"])


def remove_magenta(image: np.ndarray) -> np.ndarray:
    r, g, b = (image[..., i].astype(int) for i in range(3))
    image[(r > 180) & (b > 180) & (g < 110), 3] = 0
    return image


def remove_green(image: np.ndarray) -> np.ndarray:
    r, g, b = (image[..., i].astype(int) for i in range(3))
    green = (g > 120) & (g - np.maximum(r, b) > 60)
    image[green, 3] = 0
    return image


def segments(alpha: np.ndarray) -> list[tuple[int, int]]:
    cols = alpha.any(axis=0)
    spans, start = [], None
    for x, filled in enumerate(cols):
        if filled and start is None:
            start = x
        if not filled and start is not None:
            spans.append((start, x))
            start = None
    if start is not None:
        spans.append((start, len(cols)))
    return spans


def merge_to(spans: list[tuple[int, int]], count: int) -> list[tuple[int, int]]:
    """Merge the closest neighbouring spans until the expected frame count remains (detached sparks etc.)."""
    spans = list(spans)
    while len(spans) > count:
        gaps = [spans[i + 1][0] - spans[i][1] for i in range(len(spans) - 1)]
        i = int(np.argmin(gaps))
        spans[i:i + 2] = [(spans[i][0], spans[i + 1][1])]
    return spans


def pack_tiles(component: dict, src: Path) -> dict:
    """Ground tiles are plain squares on magenta: cut each out, shrink to TILE px, snap to the palette."""
    raw = np.array(Image.open(src).convert("RGBA"))
    raw = remove_magenta(raw)
    spans = [s for s in segments(raw[..., 3] > 0) if s[1] - s[0] > 20]
    if component.get("autotile") and len(spans) != len(component["frames"]):
        raise ValueError(f"{component['id']}: expected five isolated material squares, got {len(spans)}")
    tiles = []
    for x0, x1 in spans[:len(component["frames"])]:
        part = raw[:, x0:x1]
        rows = np.nonzero(part[..., 3].any(axis=1))[0]
        crop = part[rows.min():rows.max() + 1]
        inset = max(2, crop.shape[1] // 40)  # drop the soft rim that would show as seams
        if not component.get("autotile"):
            crop = crop[inset:-inset, inset:-inset]
        tile = Image.fromarray(crop, "RGBA").resize((TILE, TILE),
                    Image.Resampling.NEAREST if component.get("autotile") else Image.Resampling.BOX)
        tiles.append(np.array(tile))
    # Ground keeps its own colours (reduced to a few): the shared palette has no good sand or snow tones,
    # and snapping turned sand pink.
    if component.get("autotile"):
        for i, tile in enumerate(tiles):
            # Preserve a full masonry bond: a narrow crop can omit every vertical joint.
            if i == 3 and component["id"] != "tile-town-port":
                tile[16:32, 16:32] = np.array(Image.fromarray(tile[8:40, 8:40]).resize((16, 16), Image.Resampling.NEAREST))
            tile[..., :3] = np.array(Image.fromarray(tile[..., :3]).quantize(colors=10).convert("RGB"))
            # Match the repeat boundaries without blending new colours into the pixel art.
            region = tile if i < 2 else tile[16:32, 16:32]
            region[-1, :] = region[0, :]
            region[:, -1] = region[:, 0]
        # Light/dark ground motifs also share their border when placed next to each other.
        pair = Image.fromarray(np.concatenate(tiles[:2], axis=1)[..., :3]).quantize(colors=10).convert("RGB")
        tiles[0][..., :3], tiles[1][..., :3] = np.split(np.array(pair), 2, axis=1)
        tiles[1][[0, -1], :] = tiles[0][[0, -1], :]
        tiles[1][:, [0, -1]] = tiles[0][:, [0, -1]]
    sheet = np.concatenate(tiles, axis=1)
    sheet[..., 3] = 255
    if not component.get("autotile"):
        reduced = Image.fromarray(sheet[..., :3]).quantize(colors=12, method=Image.Quantize.MEDIANCUT).convert("RGB")
        sheet[..., :3] = np.array(reduced)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, "RGBA").save(OUT / f"{component['id']}.png")
    colors = len(np.unique(sheet[..., :3].reshape(-1, 3), axis=0))
    print(f"{component['id']}: {len(tiles)} frames of {TILE}x{TILE}, {colors} colours")
    return {"id": component["id"], "group": component["group"], "name": component["name"],
            "frame": [TILE, TILE], "frames": component["frames"][:len(tiles)], "colors": colors}


def pack(component: dict) -> dict | None:
    src = RAW / f"{component['id']}.png"
    if not src.exists():
        return None
    tmp = ROOT / ".art-work" / f"{component['id']}-unfake.png"
    if component.get("kind") == "backdrop":
        # A full scene: keep every pixel, only snap the grid and the palette.
        # Generated scenes come out with coarse pixels; sample them at the target width instead.
        scale = Image.open(src).width / component["size"][0]
        subprocess.run([shutil.which("unfake") or "unfake", str(src), "-o", str(tmp), "-c", "32", "-q",
                        "-s", str(max(1, round(scale)))], check=True)
        image = np.array(Image.open(tmp).convert("RGBA").resize(
            tuple(component["size"]), Image.Resampling.NEAREST))
        # Source colours preserve painted moonlight and torch falloff in full-scene maps.
        if component.get("palette") != "source":
            image = to_palette(image)
        if component["id"] == "bg-town-port":
            # Keep beach sand and cliff highlights distinct from the desert's gold.
            for source, target in [((251, 185, 84), (253, 203, 176)), ((230, 144, 78), (252, 167, 144))]:
                image[np.all(image[..., :3] == source, axis=-1), :3] = target
        OUT.mkdir(parents=True, exist_ok=True)
        Image.fromarray(image, "RGBA").save(OUT / f"{component['id']}.png")
        h, w = image.shape[:2]
        print(f"{component['id']}: backdrop {w}x{h}")
        return {"id": component["id"], "group": component["group"], "name": component["name"],
                "frame": [w, h], "frames": component["frames"], "colors": len(np.unique(image[..., :3].reshape(-1, 3), axis=0))}
    if component.get("kind") == "tile":
        return pack_tiles(component, src)
    unfake(src, tmp, fit_scale(component, src))
    image = np.array(Image.open(tmp).convert("RGBA"))
    image = to_palette(remove_magenta(image) if component.get("kind") == "tile" else remove_green(image))
    alpha = image[..., 3] > 0
    spans = segments(alpha)
    # Drop tiny specks that are not part of any frame.
    spans = [s for s in spans if s[1] - s[0] >= 2]
    expected = len(component["frames"])
    warning = None
    if len(spans) > expected:
        spans = merge_to(spans, expected)
    frames = []
    if len(spans) < expected:
        # Poses overlap in columns (e.g. a swung sword reaches over the next pose). Cutting by columns
        # would leave a sword tip in the neighbour's frame, so give each connected blob to its pose.
        frames = split_by_blobs(image, spans[0][0], spans[-1][1], expected)
        warning = "コマが横に重なっていたため、絵の塊ごとに振り分けて切り出した"
    for x0, x1 in ([] if frames else spans):
        part = image[:, x0:x1]
        rows = np.nonzero(part[..., 3].any(axis=1))[0]
        cols = np.nonzero(part[..., 3].any(axis=0))[0]
        frame = part[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
        if component.get("kind") == "tile":
            frame = frame[2:-2, 2:-2]  # generated tiles carry a darker rim that shows as seams
        frames.append(frame)
    # Align frames on their feet (the bottom quarter), not on their full width: a swung sword or a
    # jet of fire must not shift the body sideways between frames.
    def foot(frame: np.ndarray) -> int:
        alpha = frame[..., 3] > 0
        bottom = alpha[int(alpha.shape[0] * 0.75):]
        xs = np.nonzero(bottom)[1] if bottom.any() else np.nonzero(alpha)[1]
        return int(np.median(xs))
    feet = [foot(f) for f in frames]
    reach = max(max(fx, f.shape[1] - fx) for f, fx in zip(frames, feet))
    cell_w = reach * 2
    cell_h = max(f.shape[0] for f in frames)
    sheet = np.zeros((cell_h, cell_w * len(frames), 4), np.uint8)
    for i, (frame, fx) in enumerate(zip(frames, feet)):
        h, w = frame.shape[:2]
        x = i * cell_w + reach - fx
        sheet[cell_h - h:, x:x + w] = frame
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, "RGBA").save(OUT / f"{component['id']}.png")
    colors = len(np.unique(sheet[sheet[..., 3] > 0][:, :3], axis=0))
    entry = {"id": component["id"], "group": component["group"], "name": component["name"],
             "frame": [cell_w, cell_h], "frames": component["frames"][:len(frames)] + [f"?{i}" for i in range(len(frames) - expected)],
             "colors": colors}
    if warning:
        entry["warning"] = warning
    print(f"{component['id']}: {len(frames)} frames of {cell_w}x{cell_h}, {colors} colours{' — ' + warning if warning else ''}")
    return entry


def main() -> None:
    components = json.loads((HERE / "components.json").read_text())["components"]
    wanted = sys.argv[1:]
    if wanted == ["--meta"]:
        wanted = ["--none--"]
    manifest_path = OUT / "manifest.json"
    manifest = {c["id"]: c for c in json.loads(manifest_path.read_text())} if manifest_path.exists() else {}
    for component in components:
        if wanted and component["id"] not in wanted:
            continue
        entry = pack(component)
        if entry:
            manifest[component["id"]] = entry
    # Art contracts also follow components.json with --meta, without changing any PNG.
    keys = ("name", "group", "sub", "use", "frameNames", "sequences", "recolor", "windows",
            "reach", "water", "bridge", "town", "inn", "church", "library", "shop", "regions", "field", "fieldLight")
    for component in components:
        if component["id"] in manifest:
            entry = manifest[component["id"]]
            for key in keys:
                if key in component:
                    entry[key] = component[key]
                else:
                    entry.pop(key, None)
            w, h = entry["frame"]
            entry["foot"] = component.get("foot", [w / 2, h])
    order = [c["id"] for c in components]
    manifest_path.write_text(json.dumps([manifest[i] for i in order if i in manifest], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
