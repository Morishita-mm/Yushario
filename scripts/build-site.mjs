import { build, loadConfigFromFile } from "vite";
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repo = fileURLToPath(new URL("../", import.meta.url));
const site = resolve(repo, "site");
const out = resolve(repo, "site-dist");
const config = await loadConfigFromFile({ command: "build", mode: "production" }, resolve(repo, "vite.config.ts"));
await build({
  configFile: false,
  plugins: config?.config.plugins,
  root: site,
  base: "./",
  publicDir: false,
  build: {
    outDir: out,
    emptyOutDir: true,
    rolldownOptions: {
      input: { index: resolve(site, "index.html"), demo: resolve(site, "demo.html") },
    },
  },
});
// Keep the screenshots' original-size links and dynamic town-image URLs intact.
await cp(resolve(site, "assets"), resolve(out, "assets"), { recursive: true });
await cp(resolve(repo, "public/art"), resolve(out, "art"), { recursive: true });
await cp(resolve(repo, "public/logo"), resolve(out, "logo"), { recursive: true });
for (const name of ["LICENSE", "NOTICE"]) await cp(resolve(site, name), resolve(out, name));
// The mock's preview help displays this static script's URL.
await cp(resolve(repo, "public/preview-link.js"), resolve(out, "preview-link.js"));
console.log("Static introduction + interactive demo: site-dist/");
