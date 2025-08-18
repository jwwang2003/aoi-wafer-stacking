import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const ANALYZE = process.env.ANALYZE === 'true';

export default defineConfig(async ({ command, mode }) => ({
  plugins: [
    react(),
    // show how much each lib/module contributes to final chunks
    ANALYZE && visualizer({
      filename: 'bundle-stats.html',   // output file in project root (or 'dist/stats.html')
      template: 'treemap',             // 'treemap' | 'sunburst' | 'network'
      gzipSize: true,
      brotliSize: true,
      sourcemap: true,
      open: true,                      // auto-open after build
    }),
  ].filter(Boolean),

  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },

  clearScreen: false,
  server: {
    port: 8001,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 8002 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },

  // helpful when analyzing
  build: {
    sourcemap: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1500,
  },
}));
