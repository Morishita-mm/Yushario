import { copyFileSync } from "node:fs";
import { build } from "vite";

// Reuse Vite to emit Node ESM and erase the pi adapter's TypeScript; no runtime compiler.
await build({
  configFile: false, publicDir: false,
  build: {
    ssr: true, outDir: "lib",
    rolldownOptions: { input: {
      "server/relay": "src/server/relay.ts",
      "adapters/pi/agent-character": "adapters/pi/agent-character.ts",
    } },
  },
});
copyFileSync("src/server/equipment.json", "lib/server/equipment.json");
