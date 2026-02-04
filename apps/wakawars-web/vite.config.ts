import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.resolve(__dirname, "src");
const packageJsonPath = path.resolve(__dirname, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const appVersion = String(packageJson.version ?? "0.0.0");
const buildTime = new Date().toISOString();
const versionPayload = JSON.stringify({
  version: appVersion,
  buildTime,
});

const versionFilePlugin = () => ({
  name: "wakawars-version-file",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const requestUrl = req.url?.split("?")[0];
      if (requestUrl !== "/version.json") {
        next();
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.end(versionPayload);
    });
  },
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "version.json",
      source: versionPayload,
    });
  },
});

export default defineConfig({
  root: rootDir,
  base: "/",
  plugins: [react(), versionFilePlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  resolve: {
    alias: {
      "@molty/shared": path.resolve(__dirname, "../../packages/shared/dist")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  }
});
