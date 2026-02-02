import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const rootDir = path.resolve(__dirname, "src/renderer");

export default defineConfig({
  root: rootDir,
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@molty/shared": path.resolve(__dirname, "../../packages/shared/dist")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true
  }
});
