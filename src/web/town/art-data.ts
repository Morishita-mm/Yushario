// Data carried by the existing art manifest, not a drawing/layout engine.
import type { TownTheme } from "./themes";

export type Point = [number, number];
export type Box = { x: number; y: number; w: number; h: number };
export type Part = [string, string];
export type TownLayout = Pick<TownArt, "buildings" | "entrances" | "spots" | "innSleep" | "nodes" | "edges" | "crystal" | "fire">;
export type Look = {
  backdrop?: Part; layout?: TownLayout;
  ground: Part; street: Part; path: Part; river: Part; cliff: Part; waterfall?: boolean;
  inn: Part; shop: Part; church: Part; library: Part; houses: [Part, Part];
  centre: [string, string[]]; trees: Part[]; lamp: Part;
  extras: [string, string, number, number][]; tint?: string;
};
export type TownArt = {
  looks: Record<TownTheme, Look>;
  buildings: { church: Point; library: Point; inn: Point; shop: Point; board: Point; tower: Point; houses: Point[] };
  entrances: Record<string, Point>; // Door thresholds; the matching node is the clear standing place.
  plaza: Box; trees: Point[]; lamps: Point[]; benches: Point[]; centre: Point; crystal: Point; fire: Point;
  fences: { ranges: Point[]; y: number; overlap: number }; gatePosts: Point[];
  // Orthogonal cell-centre river segments; the bridge and waterfall are sprite feet.
  river: { points: Point[]; radius: number; bank: number; bridge: Point; waterfall: Point };
  cliffs: [number, number, number][]; stairs: Point; // [left, right, foot y] of each cliff edge.
  spots: { inn: Box; church: Box; library: Box; shop: Box };
  innSleep: { balloon: Point; count: Point }; // Offsets from buildings.inn.
  nodes: Record<string, Point>; edges: [string, string][]; paved: [string, string][];
};
export type InnArt = {
  slots: Point[]; hit: [number, number, number, number];
  balloon: Point; report: Point; label: Point; exit: Box;
};
export type ChurchArt = {
  slots: Point[]; hit: [number, number, number, number];
  balloon: Point; report: Point; labels: [Point, Point]; exit: Box; priest: Box;
};
export type LibraryArt = {
  slots: { read: Point[]; search: Point[] }; hit: [number, number, number, number];
  report: Point; label: Point; npc: Box; exit: Box;
};
export type ShopArt = {
  slots: Point[]; hit: [number, number, number, number];
  report: Point; label: Point; npc: Box; exit: Box;
};
export type BridgeArt = {
  waterFrame: string; deckFrame: string; waterRows: Point;
  cuts: { walled: Point; open: Point }; top: { walled: number; open: number };
  canal: { bottom: number; start: number; overlap: number }; band: { top: number; height: number };
};
export type Recolor = { tunic: string[]; cape: string[]; variants: [string[], string[]][] };
export type WaterArt = { ramps: string[][]; minimumSteps: number[]; horizon: number };
export type ArtEntry = {
  id: string; frame: Point; frames: string[]; foot: Point;
  // Only repeated display labels need distinct reference names; gallery labels stay unchanged.
  frameNames?: string[]; sequences?: Record<string, string[]>; recolor?: Recolor;
  windows?: Record<string, [number, number, number, number][]>; reach?: number;
  fieldLight?: Record<string, Point>; // Map-only light centres, relative to each prop's foot.
  water?: WaterArt; bridge?: BridgeArt; town?: TownArt; inn?: InnArt; church?: ChurchArt; library?: LibraryArt; shop?: ShopArt;
  field?: { fights: Point[]; lights: ["torch" | "crystal" | "lantern" | "mushroom", number, number][] };
  regions?: Record<TownTheme, Point[]>;
};

export function townLayout(town: TownArt, theme?: TownTheme): TownLayout {
  return theme ? town.looks[theme].layout ?? town : town;
}
