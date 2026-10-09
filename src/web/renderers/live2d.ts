/// <reference types="vite/client" />
import type { Application } from "pixi.js";
import type { Cubism4InternalModel, Live2DModel, MotionPriority } from "@jannchie/pixi-live2d-display/cubism4";
import type { Expression, Gesture } from "../../core/decider";
import type { MotionParams } from "../../core/motion";
import type { Renderer } from "./renderer";
import { loadMapping, type ModelMapping } from "./mapping";

export class Live2DRenderer implements Renderer {
  private app?: Application;
  private model?: Live2DModel;
  private internal?: Cubism4InternalModel;
  private mapping?: ModelMapping;
  private expression?: Expression;
  private lastFrameMs?: number;
  private forcePriority?: MotionPriority;
  private gestureSequence = 0;

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
    const [{ Application }, { Live2DModel, Cubism4InternalModel, MotionPriority }] = await Promise.all([
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
      // This plugin caches raw GL textures and only touches Pixi's legacy textureGC.
      // Keep this model's textures resident so Pixi 8.22 GC cannot delete them after 60s.
      for (const texture of model.textures) texture.source.autoGarbageCollect = false;
      const scale = Math.min(this.canvas.width * 0.9 / model.width, this.canvas.height * 0.9 / model.height);
      model.scale.set(scale);
      model.anchor.set(0.5, 0.5);
      model.position.set(this.canvas.width / 2, this.canvas.height / 2);
      app.stage.addChild(model);
      this.model = model;
      this.internal = model.internalModel;
      this.mapping = mapping;
      this.forcePriority = MotionPriority.FORCE;
      this.app = app;
    } catch (error) {
      model?.destroy();
      if (initialized) app.destroy(false, { children: true });
      throw error;
    }
  }

  setExpression(expression: Expression): void {
    if (expression === this.expression) return;
    this.expression = expression;
    const name = this.mapping?.expressions?.[expression];
    if (name && this.model) {
      void this.model.expression(name).catch((error) => console.warn(`表情 ${name} を読めません:`, error));
    }
  }

  playGesture(gesture: Gesture): void {
    const filename = this.mapping?.gestures?.[gesture];
    if (!filename || !this.internal || this.forcePriority === undefined) return;
    const manager = this.internal.motionManager;
    const sequence = ++this.gestureSequence;
    const priority = this.forcePriority;
    for (const [group, motions] of Object.entries(manager.definitions)) {
      const index = motions?.findIndex((motion) => motion.File.split("/").at(-1) === filename) ?? -1;
      if (index < 0) continue;
      void (async () => {
        const motion = await manager.loadMotion(group, index);
        if (!motion || sequence !== this.gestureSequence) return;
        // Model files may mark gestures as loops; this API is always one-shot.
        motion.setIsLoop(false);
        await manager.startMotion(group, index, priority);
      })().catch((error) => console.warn(`ジェスチャー ${filename} を読めません:`, error));
      return;
    }
    console.warn(`ジェスチャー ${filename} が model3.json の Motions にありません`);
  }

  apply(params: MotionParams): void {
    if (!this.app || !this.internal || !this.mapping) return;
    const now = performance.now();
    // Avoid a physics backlog after a hidden tab resumes; Cubism expects seconds.
    const dt = this.lastFrameMs === undefined ? 0 : Math.min((now - this.lastFrameMs) / 1000, 0.1);
    this.lastFrameMs = now;
    const core = this.internal.coreModel;
    for (const [id, binding] of Object.entries(this.mapping.parameters)) {
      core.setParameterValueById(id, params[binding.source] * binding.scale + binding.offset);
    }
    // Restore this baseline after drawing so additive expressions/physics never accumulate.
    core.saveParameters();
    const manager = this.internal.motionManager;
    // Calling update on an empty queue requests a random idle motion; never do that.
    if (!manager.isFinished()) manager.update(core, now / 1000);
    else if (manager.playing) {
      manager.stopAllMotions();
      manager.playing = false;
    }
    manager.expressionManager?.update(core, now / 1000);
    this.internal.physics?.evaluate(core, dt);
    // Only explicit gestures use model motions; core still owns idle/blink/gaze.
    core.update();
    this.app.render();
    core.loadParameters();
  }
}
