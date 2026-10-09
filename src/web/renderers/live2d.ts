/// <reference types="vite/client" />
import type { Application } from "pixi.js";
import type { Cubism4InternalModel, Live2DModel } from "@jannchie/pixi-live2d-display/cubism4";
import type { MotionParams } from "../../core/motion";
import type { Renderer } from "./renderer";
import { loadMapping, type ParameterMapping } from "./mapping";

export class Live2DRenderer implements Renderer {
  private app?: Application;
  private core?: Cubism4InternalModel["coreModel"];
  private mapping?: ParameterMapping;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async init(modelPath?: string): Promise<void> {
    if (!Reflect.get(window, "Live2DCubismCore")) {
      throw new Error("Cubism Core未配置: public/live2dcubismcore.min.js が必要です");
    }
    // Vite enumerates local filenames, but loading uses the original URL so relative assets work.
    const path = modelPath ?? Object.keys(import.meta.glob("/models/default/*.model3.json")).sort()[0];
    if (!path) throw new Error("モデル未配置: models/default/*.model3.json または ?model= を指定してください");
    const url = new URL(path, location.href);
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`モデルを読めません (HTTP ${response.status}): ${url.pathname}`);
    const settings: unknown = await response.json();
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw new Error("モデル設定は .model3.json のオブジェクトが必要です");
    }
    const mapping = await loadMapping(url);

    // Cubism's module checks the global Core at import time; never import it before the check above.
    const [{ Application }, { Live2DModel, Cubism4InternalModel }] = await Promise.all([
      import("pixi.js"), import("@jannchie/pixi-live2d-display/cubism4"),
    ]);
    const app = new Application();
    let initialized = false;
    let model: Live2DModel | undefined;
    try {
      model = await Live2DModel.from({ ...settings, url: url.href }, {
        autoUpdate: false,
        autoInteract: false,
      });
      if (!(model.internalModel instanceof Cubism4InternalModel)) {
        throw new Error("Cubism 4 の .model3.json が必要です");
      }
      await app.init({
        canvas: this.canvas,
        width: this.canvas.width,
        height: this.canvas.height,
        preference: "webgl",
        backgroundAlpha: 0,
        autoStart: false,
      });
      initialized = true;
      const scale = Math.min(this.canvas.width * 0.9 / model.width, this.canvas.height * 0.9 / model.height);
      model.scale.set(scale);
      model.anchor.set(0.5, 0.5);
      model.position.set(this.canvas.width / 2, this.canvas.height / 2);
      app.stage.addChild(model);
      this.core = model.internalModel.coreModel;
      this.mapping = mapping;
      this.app = app;
    } catch (error) {
      model?.destroy();
      if (initialized) app.destroy(false, { children: true });
      throw error;
    }
  }

  apply(params: MotionParams): void {
    if (!this.app || !this.core || !this.mapping) return;
    for (const [id, binding] of Object.entries(this.mapping)) {
      this.core.setParameterValueById(id, params[binding.source] * binding.scale + binding.offset);
    }
    // The core motion layer owns idle motion: do not run the plugin's blink/motion/gaze ticker.
    this.core.update();
    this.app.render();
  }
}
