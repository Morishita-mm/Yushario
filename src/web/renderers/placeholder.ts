import type { MotionParams } from "../../core/motion";
import type { Renderer } from "./renderer";

export class PlaceholderRenderer implements Renderer {
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
  }

  apply(params: MotionParams): void {
    const ctx = this.context;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(Math.min(width, height) / 640, Math.min(width, height) / 640);

    // Torso responds to body motion independently of the face.
    ctx.fillStyle = "#526a9a";
    ctx.beginPath();
    ctx.ellipse(params.bodyX * 35, 177 + params.bodyX * 15, 100, 84, params.bodyX * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(params.headX * 35 + params.bodyX * 20, params.headY * 60);
    ctx.rotate(params.headX * 0.35);
    ctx.fillStyle = "#f1d4b8";
    ctx.strokeStyle = "#292c37";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(0, 0, 128, 142, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    for (const side of [-1, 1]) {
      const x = side * 46;
      ctx.fillStyle = "#292c37";
      ctx.beginPath();
      ctx.ellipse(x, -16, 10, Math.max(1, params.eyeOpen * 18), 0, 0, Math.PI * 2);
      ctx.fill();

      const browY = -53 - params.brow * 14;
      ctx.beginPath();
      ctx.moveTo(x - 18, browY + side * params.brow * 7);
      ctx.lineTo(x + 18, browY - side * params.brow * 7);
      ctx.stroke();
    }

    // Signed curvature: positive raises the corners, negative lowers them into a frown.
    ctx.beginPath();
    ctx.moveTo(-37, 58 - params.mouthSmile * 14);
    ctx.quadraticCurveTo(0, 61 + params.mouthSmile * 28, 37, 58 - params.mouthSmile * 14);
    ctx.stroke();
    ctx.restore();
  }
}
