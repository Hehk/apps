import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin/vite";

export default defineConfig({
  plugins: [
    stylex(),
    react(),
    {
      name: "stylex-fallback-stylesheet",
      apply: "build",
      transformIndexHtml() {
        return [{ tag: "link", attrs: { rel: "stylesheet", href: "/assets/stylex.css" } }];
      },
    },
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
