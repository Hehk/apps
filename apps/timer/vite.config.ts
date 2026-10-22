import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin/vite";
import stylexForTests from "@stylexjs/unplugin/rollup";

export default defineConfig(({ mode }) => {
  if (mode === "test") {
    return { plugins: [stylexForTests(), react()] };
  }
  return {
    plugins: [stylex(), react()],
    server: {
      host: "0.0.0.0",
      port: 5174,
      strictPort: true,
    },
  };
});
