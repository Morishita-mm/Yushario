import { defineConfig } from "vite";

export default defineConfig({
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
