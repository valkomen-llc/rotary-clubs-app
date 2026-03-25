import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── Vendor splitting for optimal caching ──

          // React core (rarely changes → long cache)
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }

          // Lucide icons (44MB source → tree-shake into own chunk)
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }

          // Recharts (heavy charting lib, only used in Analytics)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }

          // Rich text editor (only used in a few admin pages)
          if (id.includes('node_modules/react-quill') || id.includes('node_modules/quill')) {
            return 'vendor-editor';
          }

          // Remaining node_modules
          if (id.includes('node_modules/')) {
            return 'vendor-misc';
          }
        },
      },
    },
    // Raise the warning limit since we're now splitting properly
    chunkSizeWarningLimit: 300,
  },
});
