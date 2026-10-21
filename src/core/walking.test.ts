import { describe, expect, it } from "vitest";
import { nearestRoadPoint, relocateWalk, roadRoute, roadStep, walkTo, type Roads } from "./walking";
import manifest from "../../public/art/manifest.json";
import { STATION_SLOTS, type PropStation } from "./town-station";

const road: Roads = {
  nodes: { west: [0, 0], corner: [100, 0], south: [100, 100] },
  edges: [["west", "corner"], ["corner", "south"]],
};

describe("walking along streets", () => {
  it("cannot reverse off a road when a replay clock rewinds (PV 6–7 seconds)", () => {
    expect(roadStep(480, 302, [480, 424], -2500)).toMatchObject({ x: 480, y: 302, move: 0, arrived: false });
    expect(roadStep(480, 302, [480, 424], 0)).toMatchObject({ x: 480, y: 302, move: 0 });
  });

  it("moves at 36 px/s and lands exactly on a node, never cutting the next corner", () => {
    expect(roadStep(20, 0, [100, 0], 1000)).toMatchObject({ x: 56, y: 0, move: 36, arrived: false });
    expect(roadStep(99.7, 0, [100, 0], 1)).toMatchObject({ x: 99.736, arrived: false });
    expect(roadStep(99.7, 0, [100, 0], 100)).toMatchObject({ x: 100, y: 0, arrived: true });
    expect(roadStep(100, 0, [100, 0], 100)).toMatchObject({ x: 100, y: 0, move: 0, arrived: true });
  });

  it("routes only through connected edges, in either direction", () => {
    expect(roadRoute(road, "west", "south")).toEqual(["corner", "south"]);
    expect(roadRoute(road, "south", "west")).toEqual(["corner", "west"]);
    expect(roadRoute(road, "west", "missing")).toEqual([]);
    expect(roadRoute(road, "west", "west")).toEqual([]);
  });

  it("projects onto the closest point of a segment, not the closest node", () => {
    expect(nearestRoadPoint(road, 45, 8)).toMatchObject({ x: 45, y: 0, distance: 8 });
    expect(nearestRoadPoint(road, -10, 0)).toMatchObject({ x: 0, y: 0, distance: 10 });
    expect(nearestRoadPoint({ nodes: {}, edges: [] }, 0, 0)).toBeUndefined();
    expect(nearestRoadPoint({ nodes: { a: [5, 6], b: [5, 6] }, edges: [["a", "b"]] }, 5, 8))
      .toMatchObject({ x: 5, y: 6, distance: 2 });
  });

  it("preserves identity, route and direction state for an unchanged lane", () => {
    const walker = { x: 50, y: 0, at: "west", path: ["corner", "south"], dx: 1, dy: 0, walked: 31, waitUntil: 99 };
    expect(relocateWalk(road, structuredClone(road), walker, "south")).toBe(walker);
    const expanded = { ...road, nodes: { ...road.nodes, extra: [200, 100] as const }, edges: [...road.edges, ["south", "extra"] as const] };
    expect(relocateWalk(road, expanded, walker, "south")).toBe(walker);
    const waiting = { ...walker, x: 0, path: [] };
    expect(relocateWalk(road, expanded, waiting, "west")).toBe(waiting);
  });

  it("replans on the nearest new street when layouts differ", () => {
    const shifted: Roads = { ...road, nodes: { west: [0, 20], corner: [100, 20], south: [100, 100] } };
    const walker = { x: 45, y: 0, at: "west", path: ["corner", "south"] };
    const next = relocateWalk(road, shifted, walker, "south");
    expect(next).toEqual({ x: 45, y: 20, at: "corner", path: ["corner", "south"] });
    expect(walker).toEqual({ x: 45, y: 0, at: "west", path: ["corner", "south"] });
    expect(walkTo(road, 45, 0, "west")).toEqual({ x: 45, y: 0, at: "west", path: ["west"] });
    expect(walkTo(road, 100, 0, "south")).toEqual({ x: 100, y: 0, at: "corner", path: ["south"] });
    const split: Roads = { nodes: { a: [0, 0], b: [100, 0], gate: [200, 0] }, edges: [["a", "b"]] };
    expect(walkTo(split, 40, 0, "gate")).toBeUndefined();
  });
});

// Feet/ground contact, not the upright torso: a hero in front may occlude a fountain.
const town = manifest.find((entry) => entry.id === "bld-inn")!.town!;
const layouts = Object.entries(town.looks).map(([theme, look]) => ({
  theme, roads: (("layout" in look && look.layout) || town) as unknown as Roads,
}));
// Ground-level foundations; the tall sprites' roofs may occlude the street behind.
const buildings = [[293, 140, 421, 174], [539, 140, 671, 174], [291, 320, 423, 378], [539, 320, 671, 378],
  [200, 310, 288, 354], [765, 310, 865, 354], [742, 370, 792, 398], [912, 150, 958, 160]];

describe("the five shipped town street graphs", () => {
  for (const { theme, roads } of layouts) {
    it(`${theme}: tower has one orthogonal approach below its foundation and station slots stay on clear ground`, () => {
      expect(roads.nodes.tower).toEqual([925, 240]);
      expect(roads.edges.filter((edge) => edge.includes("tower"))).toEqual([["eastExit", "tower"]]);
      expect(roads.nodes.eastExit[0]).toBe(roads.nodes.tower[0]);
      for (const station of Object.keys(STATION_SLOTS) as PropStation[]) {
        const [nx, ny] = roads.nodes[station];
        for (const [dx, dy] of STATION_SLOTS[station]) {
          const x = nx + dx, y = ny + dy;
          expect(x).toBeGreaterThanOrEqual(192); expect(x).toBeLessThanOrEqual(944);
          expect(y).toBeLessThanOrEqual(474);
          for (const [left, top, right, bottom] of buildings) {
            expect(x + 14 > left && x - 14 < right && y > top && y - 4 < bottom, `${station}: slot`).toBe(false);
          }
        }
      }
    });
    it(`${theme}: every road is connected and clears fountain, buildings and river/lava`, () => {
      for (const node of Object.keys(roads.nodes)) {
        if (node !== "gate") expect(roadRoute(roads, node, "gate").length).toBeGreaterThan(0);
      }
      for (const [a, b] of roads.edges) {
        const start = roads.nodes[a], end = roads.nodes[b];
        for (let i = 0; i <= 100; i++) {
          const x = start[0] + (end[0] - start[0]) * i / 100;
          const y = start[1] + (end[1] - start[1]) * i / 100;
          // Painted island spans about x435–525/y218–284. Include the boots' width.
          const nearX = Math.max(0, Math.abs(x - 480) - 14);
          const nearY = Math.max(0, Math.abs(y - 250) - 4);
          expect((nearX / 46) ** 2 + (nearY / 34) ** 2, `${a}–${b} at ${x},${y}`).toBeGreaterThan(1);
          for (const [left, top, right, bottom] of buildings) {
            expect(x + 14 > left && x - 14 < right && y > top && y - 4 < bottom, `${a}–${b}: building`).toBe(false);
          }
          // Western water is crossed only on the two painted bridge decks.
          if (x < 192) expect(y >= 240 && y <= 258 || y >= 442 && y <= 458, `${a}–${b}: water`).toBe(true);
        }
      }
    });
  }

  it("keeps all four non-village themes on exactly the same graph", () => {
    for (const { roads } of layouts.filter((l) => l.theme !== "village")) expect(roads).toEqual(layouts.find((l) => l.theme === "port")!.roads);
  });

  it("projects the village southern street by the minimum distance, without resetting the stop", () => {
    const village = layouts.find((l) => l.theme === "village")!.roads;
    const port = layouts.find((l) => l.theme === "port")!.roads;
    const result = relocateWalk(village, port, { x: 450, y: 424, at: "south", path: ["inn"] }, "inn");
    expect(result).toMatchObject({ x: 434, y: 424 });
    expect(nearestRoadPoint(port, 450, 424)?.distance).toBe(16);
    expect(result.path.at(-1)).toBe("inn");
  });
});
