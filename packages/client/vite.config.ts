import { lingui as linguiSolidPlugin } from "@lingui-solid/vite-plugin";
import devtools from "@solid-devtools/transform";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import babelMacrosPlugin from "vite-plugin-babel-macros";
import Inspect from "vite-plugin-inspect";
import { VitePWA } from "vite-plugin-pwa";
import solidPlugin from "vite-plugin-solid";
import solidSvg from "vite-plugin-solid-svg";

import codegenPlugin from "./codegen.plugin";

const base = process.env.BASE_PATH ?? "/";

// STELLIS: bake the current git SHA + build timestamp into the bundle so
// the UI can display which version a user is actually running — vital
// when debugging "but I refreshed!" PWA-cache mismatches.
const gitSha = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      cwd: __dirname,
    }).trim();
  } catch {
    return "dev";
  }
})();
const buildTime = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  base,
  define: {
    __STELLIS_SHA__: JSON.stringify(gitSha),
    __STELLIS_BUILD__: JSON.stringify(buildTime),
  },
  plugins: [
    Inspect(),
    devtools(),
    codegenPlugin(),
    babelMacrosPlugin(),
    linguiSolidPlugin(),
    solidPlugin(),
    solidSvg({
      defaultAsComponent: false,
    }),
    VitePWA({
      srcDir: "src",
      registerType: "autoUpdate",
      filename: "serviceWorker.ts",
      strategies: "injectManifest",
      injectManifest: {
        maximumFileSizeToCacheInBytes: 6000000,
      },
      manifest: {
        name: "Stellis",
        short_name: "Stellis",
        description: "Личное небо. По приглашениям.",
        categories: ["productivity", "personalization"],
        start_url: base,
        orientation: "portrait",
        display_override: ["window-controls-overlay"],
        display: "standalone",
        background_color: "#11141C",
        theme_color: "#11141C",
        icons: [
          {
            src: `${base}assets/web/android-chrome-192x192.png`,
            type: "image/png",
            sizes: "192x192",
          },
          {
            src: `${base}assets/web/android-chrome-512x512.png`,
            type: "image/png",
            sizes: "512x512",
          },
          {
            src: `${base}assets/web/monochrome.svg`,
            type: "image/svg+xml",
            sizes: "48x48 72x72 96x96 128x128 256x256",
            purpose: "monochrome",
          },
          {
            src: `${base}assets/web/masking-512x512.png`,
            type: "image/png",
            sizes: "512x512",
            purpose: "maskable",
          },
        ],
        // TODO: take advantage of shortcuts
      },
    }),
  ],
  build: {
    target: "esnext",
    rollupOptions: {
      external: ["hast"],
    },
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ["hast"],
  },
  resolve: {
    alias: {
      "styled-system": resolve(__dirname, "styled-system"),
      ...readdirSync(resolve(__dirname, "components")).reduce(
        (p, f) => ({
          ...p,
          [`@revolt/${f}`]: resolve(__dirname, "components", f),
        }),
        {},
      ),
    },
  },
});
