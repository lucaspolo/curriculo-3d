import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const between = (text, start, end) => text.slice(text.indexOf(start) + start.length, text.indexOf(end));

/**
 * /v2 is another look for the same resume. Its page holds only placeholders; the title, the description
 * and the whole content block come from index.html, which stays the single source of the text.
 */
function contentFromIndex() {
  return {
    name: "content-from-index",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (!html.includes("<!-- content:from-index -->")) return html;
        const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
        const head = [/<title>[\s\S]*?<\/title>/, /<meta\s+name="description"[\s\S]*?\/>/].map((re) => index.match(re)[0]);
        return html
          .replace("<!-- head:from-index -->", head.join("\n    "))
          .replace("<!-- content:from-index -->", between(index, "<!-- content:start -->", "<!-- content:end -->").trim());
      },
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any folder or subpath (GitHub Pages, Cloudflare Pages, etc.)
  base: "./",
  plugins: [contentFromIndex()],
  server: { port: 5174 },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});
