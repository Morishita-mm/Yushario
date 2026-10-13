"""Check the data-only art contract, without repacking or third-party dependencies.

Usage: python3 tools/art/check_manifest.py [path/to/manifest.json]
"""
import json
import math
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "art"
THEMES = {"village", "port", "snow", "desert", "volcano"}
META = ("frameNames", "sequences", "recolor", "windows", "reach", "water", "bridge",
        "town", "inn", "church", "regions", "field", "fieldLight")
errors = []


def check(ok, message):
    if not ok:
        errors.append(message)


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def vector(value, length=2):
    return isinstance(value, list) and len(value) == length and all(number(n) for n in value)


def points(values, where):
    check(isinstance(values, list) and bool(values) and all(vector(p) for p in values), f"{where}: invalid points")


def box(value, where):
    check(isinstance(value, dict) and all(number(value.get(k)) for k in ("x", "y", "w", "h"))
          and value.get("w", 0) > 0 and value.get("h", 0) > 0, f"{where}: invalid box")


def ramp(value, where):
    check(isinstance(value, list) and bool(value) and all(isinstance(c, str) and
          re.fullmatch(r"#[0-9a-fA-F]{6}", c) for c in value), f"{where}: invalid colour ramp")


def part(value, entries, where):
    if not isinstance(value, list) or len(value) != 2 or not all(isinstance(x, str) for x in value):
        check(False, f"{where}: expected [component id, frame name]")
        return
    entry = entries.get(value[0])
    check(entry is not None and value[1] in entry.get("frameNames", entry.get("frames", [])),
          f"{where}: unknown frame {value}")


def floor(value, where):
    for key in ("base", "joint", "highlight"):
        ramp([value.get(key)], f"{where}.{key}")
    for key in ("row", "spacing"):
        check(number(value.get(key)) and value[key] > 1, f"{where}.{key}: must be > 1")
    check(number(value.get("stagger")), f"{where}.stagger: invalid number")


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT / "manifest.json"
    manifest = json.loads(path.read_text())
    components = json.loads((ROOT / "tools/art/components.json").read_text())["components"]
    entries = {e["id"]: e for e in manifest}
    check(len(entries) == len(manifest), "duplicate component IDs")
    check(list(entries) == [c["id"] for c in components], "component IDs/order differ from components.json")
    for c in components:
        e = entries.get(c["id"])
        if e is None:
            continue
        cid = e["id"]
        if "palette" in c:
            check(c.get("kind") == "backdrop" and c["palette"] == "source", f"{cid}: invalid source palette mode")
        check(bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", cid)), f"{cid}: unsafe ID")
        size = e.get("frame")
        if not vector(size) or not all(isinstance(n, int) and n > 0 for n in size):
            check(False, f"{cid}: frame must be positive integer [width, height]")
            continue
        w, h = size
        frames = e.get("frameNames", e.get("frames", []))
        check(bool(frames) and len(set(frames)) == len(frames) and all(isinstance(n, str) and n.strip() for n in frames), f"{cid}: reference names must be unique/nonempty")
        check(e.get("frames") == c["frames"] and len(frames) == len(c["frames"]), f"{cid}: frame labels/count differ from source")
        foot = e.get("foot")
        check(vector(foot) and 0 <= foot[0] <= w and 0 <= foot[1] <= h, f"{cid}: foot outside cell")
        check(foot == c.get("foot", [w / 2, h]), f"{cid}: foot differs from packing contract")
        for key in META:
            check(e.get(key) == c.get(key), f"{cid}.{key}: metadata differs from components.json (run pack.py --meta)")
        png = OUT / f"{cid}.png"
        if not png.is_file():
            check(False, f"{cid}: PNG missing")
        else:
            header = png.read_bytes()[:24]
            check(header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR", f"{cid}: invalid PNG")
            check(len(header) == 24 and struct.unpack(">II", header[16:24]) == (w * len(frames), h), f"{cid}: PNG dimensions do not match horizontal cells")
        for name, sequence in e.get("sequences", {}).items():
            check(isinstance(name, str) and bool(name) and isinstance(sequence, list) and bool(sequence)
                  and all(p in frames for p in sequence), f"{cid}.{name}: unknown/empty sequence")
        if "recolor" in e:
            colors = e["recolor"]
            ramp(colors["tunic"], f"{cid}.tunic"); ramp(colors["cape"], f"{cid}.cape")
            check(bool(colors["variants"]), f"{cid}: no colour variants")
            for tunic, cape in colors["variants"]:
                ramp(tunic, f"{cid}.variant.tunic"); ramp(cape, f"{cid}.variant.cape")
                check(len(tunic) == len(colors["tunic"]) and len(cape) == len(colors["cape"]), f"{cid}: variant ramp lengths differ")
        if "water" in e:
            water = e["water"]
            check(number(water["horizon"]) and 0 <= water["horizon"] <= 1, f"{cid}: water horizon outside image")
            check(len(water["minimumSteps"]) == len(water["ramps"]), f"{cid}: water ramp/step count mismatch")
            for i, colors in enumerate(water["ramps"]):
                ramp(colors, f"{cid}.water")
                step = water["minimumSteps"][i]
                check(isinstance(step, int) and 0 <= step < len(colors), f"{cid}: invalid water minimum step")
        for name, windows in e.get("windows", {}).items():
            check(name in frames, f"{cid}: unknown window frame {name}")
            check(all(vector(p, 4) and p[2] > 0 and p[3] > 0 for p in windows), f"{cid}: invalid window rectangle")
        for name, offset in e.get("fieldLight", {}).items():
            check(name in frames and vector(offset), f"{cid}: invalid field light offset {name}")
        if "reach" in e:
            check(number(e["reach"]) and e["reach"] > 0, f"{cid}: invalid striking distance")
        if "bridge" in e:
            b = e["bridge"]
            part([cid, b["waterFrame"]], entries, cid); part([cid, b["deckFrame"]], entries, cid)
            check(vector(b["waterRows"]) and 0 <= b["waterRows"][0] <= b["waterRows"][1] < h, f"{cid}: water rows outside cell")
            for kind in ("walled", "open"):
                cut = b["cuts"][kind]
                check(vector(cut) and cut[0] >= 0 and cut[1] > 0 and sum(cut) <= w, f"{cid}: {kind} cut outside cell")
                check(number(b["top"][kind]), f"{cid}: invalid bridge top")
            check(b["canal"]["overlap"] < w and b["band"]["height"] > 0, f"{cid}: invalid canal repeat/band")
        if "regions" in e:
            check(set(e["regions"]) == THEMES, f"{cid}: missing world regions")
            for theme, slots in e["regions"].items():
                points(slots, f"{cid}.{theme}")
                check(all(0 <= n <= 1 for p in slots for n in p), f"{cid}.{theme}: outside map fractions")
        if "town" in e:
            town = e["town"]
            check(set(town["looks"]) == THEMES, f"{cid}: missing town looks")
            for theme, look in town["looks"].items():
                for key in ("ground", "street", "path", "river", "cliff", "inn", "shop", "church", "library", "lamp"):
                    if key in look:
                        part(look[key], entries, f"{theme}.{key}")
                for p in look["houses"] + look["trees"]:
                    part(p, entries, theme)
                for frame in look["centre"][1]:
                    part([look["centre"][0], frame], entries, theme)
                for prop in look["extras"]:
                    part(prop[:2], entries, theme); check(vector(prop[2:]), f"{theme}: invalid prop position")
            for theme, look in town["looks"].items():
                if "backdrop" not in look:
                    check("layout" not in look, f"{theme}: layout needs backdrop")
                    continue
                part(look["backdrop"], entries, theme)
                check(entries[look["backdrop"][0]]["frame"] == [960, 540], f"{theme}: backdrop must be 960x540")
                layout = look.get("layout", town)
                nodes = layout["nodes"]
                required = {"plazaW", "plazaE", "board", "shop", "well", "bridge", "fire", "crystal", "library", "homeE", "gate", "inn", "church"}
                check(required <= nodes.keys(), f"{theme}: missing walking stop")
                for key, point in nodes.items():
                    check(vector(point) and 16 <= point[0] <= 944 and 60 <= point[1] <= 480, f"{theme}.{key}: unsafe walking position")
                reached = {"gate"}
                for a, b in layout["edges"]:
                    check(a in nodes and b in nodes, f"{theme}: missing edge endpoint")
                for _ in nodes:
                    for a, b in layout["edges"]:
                        if a in reached or b in reached:
                            reached.update((a, b))
                check(reached == set(nodes), f"{theme}: disconnected walking graph")
                check(set(layout["entrances"]) == {"church", "inn", "library", "shop"}, f"{theme}: expected four doors")
                for key, door in layout["entrances"].items():
                    check(vector(door) and nodes[key][1] > door[1], f"{theme}.{key}: invalid doorstep")
                    check(vector(layout["buildings"][key]), f"{theme}.{key}: invalid building")
                check(layout["buildings"]["houses"] == [], f"{theme}: houses already in backdrop")
                for key in ("inn", "church"):
                    box(layout["spots"][key], f"{theme}.spots.{key}")
                for point in [layout["buildings"]["board"], layout["crystal"], layout["fire"], *layout["innSleep"].values()]:
                    check(vector(point), f"{theme}: invalid placement")
            for key, p in town["buildings"].items():
                if key != "houses" or p:
                    points(p if key == "houses" else [p], f"town.{key}")
            for key in ("trees", "lamps", "benches", "gatePosts"):
                points(town[key], f"town.{key}")
            river = town["river"]
            points(river["points"] + [river["bridge"], river["waterfall"], town["stairs"]], "town.river")
            check(len(river["points"]) > 1 and river["radius"] > 0 and river["bank"] >= 0, "town: invalid river")
            check(all(isinstance(c, list) and len(c) == 3 and all(number(n) for n in c) and c[0] < c[1] for c in town["cliffs"]), "town: invalid cliffs")
            box(town["plaza"], "town.plaza")
            for key in ("centre", "crystal", "fire"):
                points([town[key]], f"town.{key}")
            for key, p in town["spots"].items():
                box(p, f"town.spots.{key}")
            points([town["innSleep"]["balloon"], town["innSleep"]["count"]], "town.innSleep")
            for key, p in town["nodes"].items():
                points([p], f"town.nodes.{key}")
            check(all(a[0] == b[0] or a[1] == b[1] for a, b in zip(river["points"], river["points"][1:])), "town: river must be orthogonal")
            check(all(town["plaza"][k] % 16 == 0 for k in ("x", "y", "w", "h")), "town: plaza must follow grid")
            for key in ("plazaW", "plazaE", "board", "shop", "well", "bridge", "fire", "crystal", "library", "homeE", "gate"):
                check(key in town["nodes"], f"town: required node {key} missing")
            check(all(a in town["nodes"] and b in town["nodes"] for a, b in town["edges"]), "town: edge references missing node")
            check(all([a, b] in town["edges"] or [b, a] in town["edges"] for a, b in town["paved"]), "town: paved street is not an edge")
            doors = town["entrances"]
            check(set(doors) == {"church", "inn", "library", "shop"}, "town: expected four entrances")
            for key, door in doors.items():
                points([door], f"town.entrances.{key}")
                check(key in town["nodes"] and town["nodes"][key][1] > door[1], f"town: {key} needs a clear doorstep node")
            reached = {"gate"}
            for _ in town["nodes"]:
                for a, b in town["edges"]:
                    if a in reached or b in reached:
                        reached.update((a, b))
            check(reached == set(town["nodes"]), "town: disconnected walking graph")
            check(town["fences"]["overlap"] < entries["obj-fence-sign"]["frame"][0], "town: nonpositive fence repeat")
        for key in ("inn", "church"):
            if key not in e:
                continue
            room = e[key]
            points(room["slots"], f"{key}.slots"); floor(room["floor"], key)
            check(isinstance(room["wallCopies"], int) and room["wallCopies"] > 0, f"{key}: invalid wall repeat")
            check(number(room["floorBottom"]), f"{key}: invalid floor edge")
            if key == "inn":
                points([room["rug"], room["balloon"], room["report"]], key)
                check(vector(room["hit"], 4) and room["hit"][2] > 0 and room["hit"][3] > 0, "inn: invalid bed hit area")
                check(room["floorTop"] < room["floorBottom"], "inn: reversed floor edges")
            else:
                points([room["altar"], *room["candles"], *room["pews"]], key)
                box(room["priest"], "church.priest")
                check(room["rug"]["top"] < room["rug"]["bottom"], "church: reversed rug edges")
        if "field" in e:
            field = e["field"]
            points(field["fights"], f"{cid}.fights")
            check(e["frame"] == [960, 540] and len(e["frames"]) == 1, f"{cid}: invalid field backdrop")
            check(all(vector(p) and 100 <= p[0] <= 800 and 120 <= p[1] <= 465
                      for p in field["fights"]), f"{cid}: fight outside safe map area")
            lights = field.get("lights")
            check(isinstance(lights, list), f"{cid}: missing lights")
            for light in lights if isinstance(lights, list) else []:
                check(isinstance(light, list) and len(light) == 3
                      and light[0] in ("torch", "crystal", "lantern", "mushroom")
                      and vector(light[1:]) and 0 <= light[1] <= 960 and 0 <= light[2] <= 540,
                      f"{cid}: invalid light")
    # These are the owners consumed by the current shared scenes, not optional plugin hooks.
    for cid, key in (("bld-inn", "town"), ("obj-canal", "bridge"),
                     ("inn-wall", "inn"), ("church-wall", "church"), ("world-map", "regions")):
        check(key in entries.get(cid, {}), f"{cid}: required {key} metadata missing")
    for theme in ("meadow", "cave", "forest"):
        check("field" in entries.get(f"bg-field-{theme}", {}), f"{theme}: field metadata missing")
    required_sequences = {
        "hero-walk": ("front", "right"), "hero-walk-back": ("back",), "hero-pray": ("prayer",),
        "ui-weapons": ("tiers",),
        "church-priest": ("idle",), "obj-crystal": ("glow",), "obj-campfire": ("fire",),
        "fx-battle": ("slash", "spell", "poof"), "fx-enemy": ("claw", "fire", "curse", "rocks"),
        "amb-butterfly": ("yellow", "white"), "amb-leaf": ("fall",), "amb-drip": ("splash",), "amb-gull": ("flap",),
    }
    for job in ("warrior", "mage", "thief", "priest"):
        required_sequences[f"party-{job}"] = ("attack", "follow")
        required_sequences[f"party-{job}-back"] = ("attack",)
    for monster in ("slime", "ghost", "golem", "dragon"):
        required_sequences[f"monster-{monster}"] = ("idle",)
        required_sequences[f"monster-{monster}-side"] = ("idle", "attack")
        required_sequences[f"monster-{monster}-attack"] = ("attack",)
    for cid, names in required_sequences.items():
        for name in names:
            check(name in entries.get(cid, {}).get("sequences", {}), f"{cid}: required sequence {name} missing")
    check(entries.get("ui-weapons", {}).get("sequences", {}).get("tiers")
          == ["iron dagger", "blue steel sword", "gold legend sword"], "ui-weapons: expected three ordered weapon tiers")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    print(f"Art contract OK: {len(entries)} components, named frames, feet, colours and placements")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, TypeError, ValueError, OSError, IndexError, struct.error) as error:
        print(f"Invalid art manifest: {error}", file=sys.stderr)
        sys.exit(1)
