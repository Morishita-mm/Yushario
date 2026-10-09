// Delegates pixel-art component images to Codex's built-in image generation ($imagegen).
// usage: node tools/art/generate.mjs [id ...] [--parallel 4]
// Raw images land in .art-work/raw/<id>.png; run tools/art/pack.py afterwards to clean them up.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, "../../.art-work/raw");
mkdirSync(raw, { recursive: true });
const { components } = JSON.parse(readFileSync(join(here, "components.json"), "utf8"));
const style = readFileSync(join(here, "style.md"), "utf8");
// Backdrops are full scenes: no chroma-key background and no frame layout.
const backdropStyle = style.split("\n")
  .filter((line) => !line.startsWith("Background:") && !line.startsWith("Layout for sheets:"))
  .concat("Composition: one wide landscape scene filling the entire canvas edge to edge, 16:9, no characters, no monsters, no UI.")
  .join("\n");
// Tiles are often green themselves: key them on magenta instead.
const tileStyle = style.replaceAll("pure green #00FF00", "pure magenta #FF00FF").replaceAll("green gaps", "magenta gaps");
const args = process.argv.slice(2);
const parallel = Number(args[args.indexOf("--parallel") + 1]) || 4;
const wanted = args.filter((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--parallel");
const queue = components.filter((c) => !wanted.length || wanted.includes(c.id));

function prompt(c) {
  const [w, h] = c.size;
  const reference = c.ref
    ? `Before generating, open ./${c.ref}.png with the view_image tool. Image 1 is the DESIGN REFERENCE: keep exactly the same character design, colours, proportions, outline style and pixel scale.\n`
    : "";
  return `$imagegen Generate ONE image, then copy the final PNG from generated_images into the current directory as ${c.id}.png. Do not create any other files.
${reference}
Use case: stylized-concept
Asset type: pixel-art game asset for a top-down JRPG town ("${c.name}")
Primary request: ${c.prompt}
Frames: exactly ${c.frames.length} (${c.frames.map((f, i) => `${i + 1}: ${f}`).join("; ")}).
Sprite size: each frame is drawn on a ${w} x ${h} art-pixel grid, then upscaled with nearest neighbour.
${c.kind === "backdrop" ? backdropStyle : c.kind === "tile" ? tileStyle : style}`;
}

function run(c) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("codex", ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", raw, prompt(c)],
      { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => { log += d; });
    child.stderr.on("data", (d) => { log += d; });
    child.on("close", (code) => {
      const ok = existsSync(join(raw, `${c.id}.png`));
      console.log(`${ok ? "ok  " : "FAIL"} ${c.id} (${Math.round((Date.now() - started) / 1000)}s, exit ${code})`);
      if (!ok) console.log(log.split("\n").slice(-12).join("\n"));
      resolve(ok);
    });
  });
}

// Components whose reference is still pending wait for it.
async function main() {
  const done = new Set(components.filter((c) => existsSync(join(raw, `${c.id}.png`)) && !queue.includes(c)).map((c) => c.id));
  const pending = [...queue];
  const running = new Set();
  while (pending.length || running.size) {
    const ready = pending.findIndex((c) => !c.ref || done.has(c.ref) || existsSync(join(raw, `${c.ref}.png`)) && !pending.some((p) => p.id === c.ref));
    if (ready >= 0 && running.size < parallel) {
      const c = pending.splice(ready, 1)[0];
      const job = run(c).then(() => { done.add(c.id); running.delete(job); });
      running.add(job);
      continue;
    }
    if (!running.size) {
      console.log(`blocked: ${pending.map((c) => c.id).join(", ")} (missing references)`);
      break;
    }
    await Promise.race(running);
  }
}

main();
