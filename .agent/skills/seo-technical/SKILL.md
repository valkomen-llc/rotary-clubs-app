---
name: "SEO Technical"
description: "Webmasters enfocados en rastreo, indexación y salud técnica en buscadores."
---

# SEO Technical — Rotary ClubPlatform

## Objective
Asegurar la máxima indexación, rastreabilidad y visibilidad en Google para cada sitio de club Rotary. Agente Martín ejecuta estas auditorías.

## Arquitectura SEO del Sistema

### Endpoints SEO Existentes

| Endpoint | Función | Cache |
|----------|---------|-------|
| `GET /api/seo/sitemap.xml` | Sitemap dinámico (clubs, proyectos, noticias) | 1 hora |
| `GET /api/seo/robots.txt` | Directivas de rastreo | 24 horas |
| `GET /api/seo/og/:type/:id` | Open Graph metadata (project/news/club) | Sin cache |

### Estructura de URLs (Hash Router)

> ⚠️ **Limitación actual**: El sistema usa HashRouter (`/#/ruta`). Google puede indexar fragment URLs pero NO es ideal.

Rutas principales indexables:
```
/ (Home)
/#/quienes-somos
/#/nuestras-causas
/#/proyectos
/#/blog
/#/eventos
/#/contacto
/#/rotaract
/#/interact
/#/intercambio-jovenes
/#/la-fundacion-rotaria
/#/maneras-de-contribuir
/#/shop
```

## Checklist de Auditoría SEO

### Meta Tags (por página)
- [ ] Cada página tiene `<title>` único (50-60 chars) con nombre del club + ciudad
- [ ] Meta description única (150-160 chars) con CTA implícito
- [ ] `<meta name="robots" content="index, follow">`
- [ ] Canonical URL configurado para evitar duplicados en multitenant

### Open Graph (para compartir en redes)
- [ ] `og:title` — Título descriptivo con nombre del club
- [ ] `og:description` — Resumen atractivo
- [ ] `og:image` — Logo del club o imagen del proyecto (mín. 1200x630px)
- [ ] `og:url` — URL canónica
- [ ] `og:type` — website/article/profile según el contenido
- [ ] Twitter Card meta tags (`twitter:card`, `twitter:title`, etc.)

### Structured Data (JSON-LD)
- [ ] **Organization**: Nombre, logo, ciudad, país, relación con Rotary International
- [ ] **Event**: Para cada CalendarEvent con fecha, ubicación y descripción
- [ ] **Article**: Para cada Post/Noticia publicada
- [ ] **BreadcrumbList**: Navegación jerárquica

### Indexación Multitenant
- [ ] Cada subdominio (`club.clubplatform.org`) tiene su propio sitemap
- [ ] Dominios custom resuelven correctamente con canonical apropiado
- [ ] `hreflang` configurado si hay contenido en múltiples idiomas
- [ ] No hay páginas admin/login indexadas (`Disallow: /api/`, `/#/admin/`)

## Agent Tool: `run_seo_audit`
Martín puede ejecutar auditorías automáticas que revisan:
1. Settings de SEO configurados (seo_title, seo_description)
2. Completitud de OG data (logo, imágenes en proyectos/noticias)
3. Volumen de contenido (posts, proyectos, eventos)
4. Genera un score A/B/C/D con recomendaciones específicas

## Agent Tool: `generate_seo_content`
Martín puede generar automáticamente:
- Title tags optimizados por página
- Meta descriptions con keywords relevantes
- Keywords lists por temática (proyectos, rotaract, etc.)
- Structured Data JSON-LD (Organization, Event)
- Se guardan automáticamente en la tabla `Setting`

## Directivas robots.txt (ya implementadas)

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /#/admin/
Disallow: /#/login
Disallow: /#/registro

User-agent: AhrefsBot
Crawl-delay: 10

User-agent: SemrushBot
Crawl-delay: 10
```

## Rules & Constraints
- Nunca modificar robots.txt para bloquear contenido público
- Siempre validar structured data con Google Rich Results Test
- Priorizar contenido local (ciudad + servicio) en keywords
- Responder en español
