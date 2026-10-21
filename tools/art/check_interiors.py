"""Fixed library/shop contract: supplied sheets and furniture-safe placement data."""


def check_interiors(entries, components, check):
    sources = {c["id"]: c for c in components}
    sheets = {
        "hero-library-read": ("read", 3), "hero-library-search": ("search", 4),
        "hero-shop-browse": ("browse", 3), "npc-librarian": ("idle", 2), "npc-shopkeeper": ("idle", 2),
    }
    for cid, (sequence, count) in sheets.items():
        entry = entries.get(cid, {})
        check(sequence in entry.get("sequences", {}), f"{cid}: required {sequence} sequence missing")
        check(len(entry.get("frames", [])) == count, f"{cid}: wrong supplied frame count")
        width, height = entry.get("frame", [0, 0])
        check(46 <= height <= 58 and entry.get("foot") == [width / 2, height], f"{cid}: expected hero-scale feet")
    for key in ("library", "shop"):
        cid = f"bg-{key}"
        entry, source = entries.get(cid, {}), sources.get(cid, {})
        check(source.get("kind") == "backdrop" and source.get("palette") == "source", f"{cid}: expected source-palette backdrop")
        check(entry.get("frame") == [960, 540] and entry.get("frames") == ["backdrop"]
              and 0 < entry.get("colors", 0) <= 32, f"{cid}: expected 960x540, one frame, at most 32 colours")
        room = entry.get(key)
        check(isinstance(room, dict), f"{cid}: required {key} metadata missing")
        if not isinstance(room, dict):
            continue
        groups = [room["slots"]["read"], room["slots"]["search"]] if key == "library" else [room["slots"]]
        check([len(group) for group in groups] == ([3, 3] if key == "library" else [4]), f"{key}: unexpected slot counts")
        slots = [point for group in groups for point in group]
        check(len({tuple(p) for p in slots}) == len(slots), f"{key}: duplicate slots")
        dx, dy, w, h = room["hit"]
        check(w > 0 and h > 0, f"{key}: invalid hero hit area")
        for x, y in slots:
            check(0 <= x + dx < x + dx + w <= 960 and 0 <= y + dy < y + dy + h <= 540, f"{key}: hero hit outside backdrop")
            for ox, oy in (room["report"], room["label"]):
                check(0 <= x + ox <= 960 and 0 <= y + oy <= 540, f"{key}: decoration outside backdrop")
        npc, exit = room["npc"], room["exit"]
        check(0 <= npc["x"] < npc["x"] + npc["w"] <= 960 and 0 <= npc["y"] < npc["y"] + npc["h"] <= 540, f"{key}: NPC outside backdrop")
        check(exit["w"] > 0 and exit["x"] + exit["w"] / 2 == 480 and 480 <= exit["y"] < exit["y"] + exit["h"] <= 540, f"{key}: exit must align with doorway")
    town = entries.get("bld-inn", {}).get("town", {})
    for layout in [town, *[look["layout"] for look in town.get("looks", {}).values() if "layout" in look]]:
        for key in ("library", "shop"):
            check(key in layout.get("nodes", {}) and key in layout.get("spots", {}), f"town: missing {key} entrance/hotspot")
