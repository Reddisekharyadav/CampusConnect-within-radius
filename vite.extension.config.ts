import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

/**
 * Vite config for building the React app into extension/dist/
 * This produces a self-contained bundle (no code-splitting) that can
 * be loaded as popup inside the browser extension via popup.html.
 *
 * Key differences from the normal web build:
 * - Output goes to extension/dist/ (next to popup.html)
 * - base: "./" so all asset paths are relative (extension pages need this)
 * - Chunks rolled into a single file to avoid dynamic import issues in MV3
 */
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  define: {
    // Extension reads API URL from chrome.storage, so we inject a sentinel
    // that src/services/api.ts can detect at runtime.
    "import.meta.env.VITE_IS_EXTENSION": JSON.stringify("true"),
    // Fallback for non-extension env vars
    "import.meta.env.VITE_GOOGLE_MAPS_API_KEY": JSON.stringify(
      process.env.VITE_GOOGLE_MAPS_API_KEY ?? ""
    ),
  },
  build: {
    outDir: "extension/dist",
    emptyOutDir: true,
    // Inline assets ≤ 10 MB so extension has no external dependencies
    assetsInlineLimit: 10 * 1024 * 1024,
    rollupOptions: {
      output: {
        // Single JS chunk — MV3 extensions cannot use dynamic imports in popup
        manualChunks: undefined,
        inlineDynamicImports: true,
        // Deterministic file names for cache busting in extension updates
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
