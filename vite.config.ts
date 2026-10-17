import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const appHtml = fileURLToPath(new URL("./src/web/rpg/app.html", import.meta.url));
const controlsHtml = fileURLToPath(new URL("./src/web/art/mock-controls.html", import.meta.url));
export default defineConfig({
  plugins: [{
    name: "shared-app-html",
    transformIndexHtml: { order: "pre", handler: (html) => html
      .replace("<!-- yushario-app -->", () => readFileSync(appHtml, "utf8"))
      .replace("<!-- yushario-mock-controls -->", () => readFileSync(controlsHtml, "utf8")) },
    configureServer(server) { server.watcher.add([appHtml, controlsHtml]); },
    handleHotUpdate({ file, server }) {
      if (file !== appHtml && file !== controlsHtml) return;
      server.ws.send({ type: "full-reload" }); return [];
    },
  }],
  build: {
    rolldownOptions: {
      input: { index: "index.html", terminal: "terminal.html", art: "art.html", mock: "mock.html" },
    },
  },
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        target: `http://127.0.0.1:${process.env.PORT ?? 8790}`,
      },
      "/ws": {
        changeOrigin: true,
        target: `http://127.0.0.1:${process.env.PORT ?? 8790}`,
        ws: true,
      },
      "/pty": {
        changeOrigin: true,
        target: `http://127.0.0.1:${process.env.PORT ?? 8790}`,
        ws: true,
      },
    },
  },
});
