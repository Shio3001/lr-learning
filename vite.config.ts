// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // crypto, buffer, process などをブラウザで使えるようにする
      include: ["crypto"],
    }),
  ],
  resolve: {
    alias: {
      // Node標準をブラウザ用に差し替える
      crypto: "crypto-browserify",
      stream: "stream-browserify",
      buffer: "buffer",
    },
  },
});
