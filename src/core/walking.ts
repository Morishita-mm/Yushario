export type RoadPoint = readonly [number, number];
export type Roads = { nodes: Record<string, RoadPoint>; edges: readonly (readonly [string, string])[] };
export type WalkPosition = { x: number; y: number; at: string; path: string[] };

export function roadRoute(roads: Roads, from: string, to: string): string[] {
  const previous = new Map<string, string>([[from, ""]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (node === to) break;
    for (const [a, b] of roads.edges) {
      const next = a === node ? b : b === node ? a : undefined;
      if (next && !previous.has(next)) { previous.set(next, node); queue.push(next); }
    }
  }
  if (!previous.has(to)) return [];
  const path: string[] = [];
  for (let node = to; node !== from; node = previous.get(node)!) path.unshift(node);
  return path;
}

export function nearestRoadPoint(roads: Roads, x: number, y: number) {
  let nearest: { x: number; y: number; a: string; b: string; distance: number } | undefined;
  for (const [a, b] of roads.edges) {
    const [ax, ay] = roads.nodes[a], [bx, by] = roads.nodes[b];
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    const ratio = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)) : 0;
    const px = ax + ratio * dx, py = ay + ratio * dy, distance = Math.hypot(x - px, y - py);
    if (!nearest || distance < nearest.distance) nearest = { x: px, y: py, a, b, distance };
  }
  return nearest;
}

// Keep an unchanged lane (including its direction) even when other streets differ.
export function relocateWalk(before: Roads, after: Roads, walker: WalkPosition, destination: string): WalkPosition {
  const lane = [walker.at, ...walker.path];
  const unchanged = lane.every((node) => before.nodes[node] && after.nodes[node]
    && before.nodes[node][0] === after.nodes[node][0] && before.nodes[node][1] === after.nodes[node][1])
    && lane.slice(1).every((node, i) => after.edges.some(([a, b]) =>
      a === lane[i] && b === node || b === lane[i] && a === node));
  if (unchanged) return walker;
  return walkTo(after, walker.x, walker.y, destination) ?? walker;
}

export function walkTo(after: Roads, x: number, y: number, destination: string): WalkPosition | undefined {
  const point = nearestRoadPoint(after, x, y);
  if (!point) return;
  const candidates = [point.a, point.b].map((at) => {
    const path = roadRoute(after, at, destination);
    let distance = Math.hypot(after.nodes[at][0] - point.x, after.nodes[at][1] - point.y);
    let previous = at;
    for (const node of path) {
      distance += Math.hypot(after.nodes[node][0] - after.nodes[previous][0], after.nodes[node][1] - after.nodes[previous][1]);
      previous = node;
    }
    if (at !== destination && !path.length) distance = Infinity;
    return { at, path, distance };
  }).sort((a, b) => a.distance - b.distance);
  if (candidates[0].distance === Infinity) return; // the destination cannot be reached from here
  const { at, path } = candidates[0];
  if (Math.hypot(after.nodes[at][0] - point.x, after.nodes[at][1] - point.y) > 0.001) path.unshift(at);
  return { x: point.x, y: point.y, at, path };
}

// A replay can rewind its clock. Never extrapolate backwards off the current road.
export function roadStep(x: number, y: number, target: RoadPoint, dt: number) {
  const dx = target[0] - x, dy = target[1] - y, distance = Math.hypot(dx, dy);
  const move = Math.min(distance, 36 * Math.max(0, dt) / 1000);
  const arrived = distance <= move;
  return {
    x: arrived ? target[0] : x + (distance ? dx / distance * move : 0),
    y: arrived ? target[1] : y + (distance ? dy / distance * move : 0),
    dx, dy, move, arrived,
  };
}
