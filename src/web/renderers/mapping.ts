import type { MotionParams } from "../../core/motion";

export type ParameterMapping = Record<string, {
  source: keyof MotionParams;
  scale: number;
  offset: number;
}>;

// Same JSON shape as a model's mapping.json; values are applied as source * scale + offset.
const DEFAULT_MAPPING: ParameterMapping = {
  ParamAngleX: { source: "headX", scale: 30, offset: 0 },
  ParamAngleY: { source: "headY", scale: 30, offset: 0 },
  ParamAngleZ: { source: "headX", scale: 15, offset: 0 },
  ParamBodyAngleX: { source: "bodyX", scale: 10, offset: 0 },
  ParamEyeLOpen: { source: "eyeOpen", scale: 1, offset: 0 },
  ParamEyeROpen: { source: "eyeOpen", scale: 1, offset: 0 },
  ParamMouthForm: { source: "mouthSmile", scale: 1, offset: 0 },
  ParamBrowLY: { source: "brow", scale: 1, offset: 0 },
  ParamBrowRY: { source: "brow", scale: 1, offset: 0 },
};
const SOURCES: readonly (keyof MotionParams)[] = [
  "headX", "headY", "bodyX", "eyeOpen", "mouthSmile", "brow",
];

export async function loadMapping(modelUrl: URL): Promise<ParameterMapping> {
  const url = new URL("mapping.json", modelUrl);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 404) return DEFAULT_MAPPING;
  if (!response.ok) throw new Error(`mapping.json を読めません (HTTP ${response.status})`);
  const input: unknown = await response.json();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("mapping.json はパラメータIDをキーとするオブジェクトにしてください");
  }
  const mapping: ParameterMapping = Object.create(null);
  for (const [id, value] of Object.entries(input)) {
    if (!id || !value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`mapping.json の ${id} が不正です`);
    }
    const binding = value as Record<string, unknown>;
    const scale = binding.scale === undefined ? 1 : binding.scale;
    const offset = binding.offset === undefined ? 0 : binding.offset;
    if (typeof binding.source !== "string" || !SOURCES.includes(binding.source as keyof MotionParams)
      || typeof scale !== "number" || !Number.isFinite(scale)
      || typeof offset !== "number" || !Number.isFinite(offset)
      || Object.keys(binding).some((key) => !["source", "scale", "offset"].includes(key))) {
      throw new Error(`mapping.json の ${id}: source・有限数のscale/offsetのみ指定できます`);
    }
    mapping[id] = { source: binding.source as keyof MotionParams, scale, offset };
  }
  return mapping;
}
