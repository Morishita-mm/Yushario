// Data carried by the existing art manifest, not a drawing/layout engine.
import type { TownTheme } from "./themes";

export type Point = [number, number];
export type Box = { x: number; y: number; w: number; h: number };
export type Part = [string, string];
export type Look = {
  ground: Part; street: Part; canal?: Part;
  inn: Part; shop: Part; church: Part; library: Part; houses: [Part, Part];
  centre: [string, string[]]; trees: Part[]; lamp: Part;
  extras: [string, string, number, number][]; tint?: string;
};
export type TownArt = {
  looks: Record<TownTheme, Look>;
  buildings: { church: Point; library: Point; inn: Point; shop: Point; board: Point; houses: Point[] };
  trees: Point[]; lamps: Point[]; benches: Point[]; centre: Point; crystal: Point; fire: Point;
  fences: { ranges: Point[]; y: number; overlap: number };
  walls: { y: number; overlap: number; gap: number; towers: number[]; gate: number };
  spots: { inn: Box; church: Box };
  innSleep: { balloon: Point; count: Point }; // Offsets from buildings.inn.
  nodes: Record<string, Point>; edges: [string, string][];
};
export type Floor = { base: string; joint: string; highlight: string; row: number; spacing: number; stagger: number };
export type InnArt = {
  wallCopies: number; wallBottom: number; floorTop: number; floorBottom: number; floor: Floor;
  rug: Point; slots: Point[]; hit: [number, number, number, number]; balloon: Point; report: Point;
};
export type ChurchArt = {
  wallCopies: number; wallTop: number; floorBottom: number; floor: Floor;
  rug: { x: number; top: number; bottom: number };
  altar: Point; candles: Point[]; pews: Point[]; slots: Point[]; priest: Box;
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
  water?: WaterArt; bridge?: BridgeArt; town?: TownArt; inn?: InnArt; church?: ChurchArt;
  field?: { textures: [string, string, number, number, number, number][]; props: [string, string, number, number][]; fights: Point[] };
  regions?: Record<TownTheme, Point[]>;
};
