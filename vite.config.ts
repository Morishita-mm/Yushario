import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/ws": {
        target: `http://127.0.0.1:${process.env.PORT ?? 8790}`,
        ws: true,
      },
    },
  },
});
