import { copyFileSync } from "node:fs";
import { build } from "vite";

// Reuse Vite to emit Node ESM and erase the pi adapter's TypeScript; no runtime compiler.
await build({
  configFile: false, publicDir: false,
  build: {
    ssr: true, outDir: "lib",
    rolldownOptions: { input: {
      "core/startup": "src/core/startup.ts",
      "server/startup": "src/server/startup.ts",
      "server/relay": "src/server/relay.ts",
      "adapters/pi/agent-character": "adapters/pi/agent-character.ts",
    } },
  },
});
copyFileSync("src/server/equipment.json", "lib/server/equipment.json");
// Keep notices with the bundled fonts and browser code, even when dist/ is copied alone.
for (const file of ["LICENSE", "NOTICE"]) copyFileSync(file, `dist/${file}`);
