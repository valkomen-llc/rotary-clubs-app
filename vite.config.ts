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
  server: {
    proxy: {
      '/api/whatsapp-qr': {
        target: 'http://76.13.101.187:5001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://76.13.101.187:5001',
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── Vendor splitting for optimal caching ──
          // IMPORTANT: Do NOT add a catch-all for all node_modules
          // — that creates circular chunk dependencies.

          // React core (changes rarely → long cache)
          if (id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }

          // Recharts + D3 (heavy charting lib, only used in Analytics)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }

          // Rich text editor (only used in admin)
          if (id.includes('node_modules/react-quill') || id.includes('node_modules/quill')) {
            return 'vendor-editor';
          }

          // Lucide icons (large source → tree-shaken chunk)
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
});
