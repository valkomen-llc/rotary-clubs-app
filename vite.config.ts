import path from "path"
import { readFileSync } from "fs"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"))

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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

          // React core (changes rarely → long cache).
          //
          // v4.659 — Va PRIMERO y cubre `react/` además de `react-dom/`. Antes
          // sólo se asignaba `react-dom`, así que el propio React —incluido el
          // runtime de JSX, que usa cada componente del sitio— quedaba sin
          // asignar y Rollup lo metía en el primer chunk que lo necesitara: el
          // del editor de texto enriquecido. Resultado: el entry importaba
          // `vendor-editor` (211 kB) sólo para obtener `jsx`, de modo que TODA
          // visita pública descargaba una librería que sólo usa el panel. Al
          // fijar el núcleo aquí, los chunks del panel dejan de estar en la
          // ruta crítica de la página pública.
          //
          // Junto al núcleo van las utilidades MINÚSCULAS que usa todo el
          // sitio (`clsx`, `tailwind-merge`, `cva`: unos 3 kB en total). Sin
          // esto, `clsx` acababa dentro de `vendor-charts` —porque recharts
          // también lo usa— y el entry tenía que descargar 471 kB de gráficas
          // para obtener una función de 500 bytes.
          if (id.includes('node_modules/react/')
            || id.includes('node_modules/react-dom/')
            || id.includes('node_modules/react-router')
            || id.includes('node_modules/scheduler/')
            || id.includes('node_modules/clsx/')
            || id.includes('node_modules/tailwind-merge/')
            || id.includes('node_modules/class-variance-authority/')) {
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
