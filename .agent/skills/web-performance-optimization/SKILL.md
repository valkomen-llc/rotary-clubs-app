---
name: "Web Performance Optimization"
description: "Especialista en Core Web Vitals, tiempos de carga y optimización del rendimiento global."
---

# Web Performance Optimization — Rotary ClubPlatform

## Objective
Garantizar que cada sitio de club cargue en menos de 3 segundos, cumpla Core Web Vitals y ofrezca una experiencia premium en cualquier dispositivo.

## Core Web Vitals Targets

| Métrica | Target | Herramienta de Medición |
|---------|--------|------------------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Lighthouse, PageSpeed Insights |
| **FID** (First Input Delay) | < 100ms | Chrome UX Report |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Lighthouse |
| **INP** (Interaction to Next Paint) | < 200ms | Chrome DevTools |
| **TTFB** (Time to First Byte) | < 600ms | WebPageTest |

## Checklist de Optimización — Frontend (React/Vite)

### Imágenes
- [ ] Todas las imágenes del hero y cards usan `loading="lazy"` excepto Above the Fold
- [ ] Imágenes de S3 se sirven con dimensiones correctas via `width`/`height` explícitos (evitar CLS)
- [ ] Formatos modernos: WebP para fotos, SVG para logos e iconos
- [ ] La imagen del Hero usa `fetchpriority="high"` para priorizar LCP
- [ ] Implementar placeholder blur o skeleton para imágenes pesadas

### JavaScript
- [ ] Code splitting por rutas con `React.lazy()` + `Suspense`
- [ ] Analizar bundle size con `npx vite-bundle-visualizer`
- [ ] Mover dependencias pesadas (editor de texto, chart.js) a dynamic imports
- [ ] Eliminar imports no utilizados con tree-shaking

### CSS
- [ ] Critical CSS inline en `<head>` para Above the Fold
- [ ] Font loading optimizado: `<link rel="preload" href="...font..." as="font" crossorigin>`
- [ ] Evitar `@import` en CSS — usar `<link>` directo
- [ ] Google Fonts con `&display=swap` obligatorio

### Caching & CDN
- [ ] Assets estáticos con `Cache-Control: public, max-age=31536000, immutable`
- [ ] Sitemap cacheado 1 hora (ya implementado en `seo.js`)
- [ ] Considerar CloudFront CDN para S3 media assets

## Checklist de Optimización — Backend (Express/Vercel Serverless)

### Database
- [ ] Queries con `LIMIT` y paginación (evitar SELECT * sin límite)
- [ ] Índices en columnas frecuentes (`clubId`, `status`, `createdAt`)
- [ ] Pool de conexiones singleton (ya implementado con `pg`)
- [ ] Lazy loading de rutas en `api/index.js` (ya implementado)

### API Responses
- [ ] Responses JSON comprimidos con `compression` middleware
- [ ] Endpoints de lectura con `Cache-Control` headers apropiados
- [ ] Evitar N+1 queries — usar JOINs o batch queries

## Comandos de Auditoría

```bash
# Lighthouse CI (local)
npx lighthouse https://clubplatform.org --view

# Bundle analysis
npx vite-bundle-visualizer

# Type check (pre-push obligatorio)
npx tsc --noEmit
```

## Rules & Constraints
- No instalar dependencias pesadas sin justificación (> 50kB gzipped)
- Priorizar soluciones nativas del navegador sobre polyfills
- Toda optimización debe ser medible — antes/después con Lighthouse
- Responder en español
