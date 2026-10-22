import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works from any folder or subpath (GitHub Pages, Cloudflare Pages, etc.)
  base: "./",
  server: { port: 5174 },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});
