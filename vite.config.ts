import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      input: { index: "index.html", live2d: "live2d.html", art: "art.html", mock: "mock.html" },
    },
  },
  server: {
    proxy: {
      "/ws": {
        target: `http://127.0.0.1:${process.env.PORT ?? 8790}`,
        ws: true,
      },
      "/pty": {
        target: `http://127.0.0.1:${process.env.PORT ?? 8790}`,
        ws: true,
      },
    },
  },
});
