import type { Expression } from "../../core/decider";
import type { MotionParams } from "../../core/motion";

export type ParameterMapping = Record<string, {
  source: keyof MotionParams;
  scale: number;
  offset: number;
}>;

export type ModelMapping = {
  parameters: ParameterMapping;
  expressions?: Partial<Record<Expression, string>>;
};

const EXPRESSIONS: readonly Expression[] = ["neutral", "focused", "happy", "troubled", "surprised"];

// Values are applied as source * scale + offset.
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

export async function loadMapping(modelUrl: URL): Promise<ModelMapping> {
  const url = new URL("mapping.json", modelUrl);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 404) return { parameters: DEFAULT_MAPPING };
  if (!response.ok) throw new Error(`mapping.json を読めません (HTTP ${response.status})`);
  const input: unknown = await response.json();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("mapping.json は parameters と任意の expressions を持つオブジェクトにしてください");
  }
  const config = input as Record<string, unknown>;
  if (!config.parameters || typeof config.parameters !== "object" || Array.isArray(config.parameters)
    || Object.keys(config).some((key) => !["parameters", "expressions"].includes(key))) {
    throw new Error("mapping.json: parameters オブジェクトと任意の expressions のみ指定できます");
  }
  const mapping: ParameterMapping = Object.create(null);
  for (const [id, value] of Object.entries(config.parameters)) {
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
  const expressions: Partial<Record<Expression, string>> = Object.create(null);
  if (config.expressions !== undefined) {
    if (!config.expressions || typeof config.expressions !== "object" || Array.isArray(config.expressions)) {
      throw new Error("mapping.json: expressions は表情名をキーとするオブジェクトにしてください");
    }
    for (const [expression, name] of Object.entries(config.expressions)) {
      if (!EXPRESSIONS.includes(expression as Expression) || typeof name !== "string" || !name.trim()) {
        throw new Error(`mapping.json の expressions.${expression} が不正です`);
      }
      expressions[expression as Expression] = name;
    }
  }
  return { parameters: mapping, expressions };
}
