<!-- Léelo ANTES de tocar la sección «Hoteles de la conferencia», la pestaña «🏨 Hoteles y alojamiento» o sus subidas. -->

# Hoteles de la conferencia — v4.1275.0

Pedido del comité (XIII Conferencia, Villavicencio 2027): mostrar en la ficha
pública del evento las diapositivas de los hoteles (tarifas, servicios,
condiciones, contactos), legibles en el teléfono, con descarga opcional de la
guía completa, todo administrable por evento y sin tocar código.

## Dónde vive

| Pieza | Archivo |
|---|---|
| El CRITERIO, puro (normalizar, publicar, sniff de bytes, historial, prefijos, archivos sin uso) | `server/lib/eventHotels.js` (+ `.d.ts`; lo importan servidor, sitio y panel) |
| S3: subida prefirmada, lectura, publicación, borrado acotado, listado | `server/lib/eventHotelsStorage.js` |
| Subidas, validación, optimización y limpieza | `server/controllers/eventHotelsController.js` |
| Rutas | `server/routes/calendar.js` (`/api/calendar/events/:id/hotels/*`) |
| Sello e historial al guardar | PUT `/api/calendar/events/:id` (`stampHotelsUpdate`) |
| Sección pública (y vista previa) | `src/components/EventHotelsSection.tsx`, en `src/pages/EventoDetalle.tsx` |
| Vista ampliada con zoom | `src/components/EventHotelsLightbox.tsx` |
| Editor del panel | `src/components/admin/events/EventHotelsEditor.tsx` (pestaña `hoteles` de `src/pages/admin/Events.tsx`) |
| Cliente de subida | `src/lib/eventHotelsUpload.ts` |
| Pruebas | `npm run test:event-hotels` (111, sin red) · `HOTELS_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:event-hotels:e2e` (41, Postgres real + S3 simulado + routers reales) |

**Sin tablas nuevas.** Datos en `CalendarEvent.metadata.hotels` (Jsonb), uno
por evento. Las imágenes van a S3, nunca a la base.

## Esquema

```js
metadata.hotels = {
  enabled, title, description,          // title por defecto «Hoteles de la conferencia»
  slides: [{ id, imageUrl, mediumUrl?, thumbUrl?, width?, height?, altText, enabled, fileName? }],
  showThumbnails, allowDownload,
  document: { url, fileName, sizeBytes, uploadedAt } | null,
  ratesUpdatedOn,                       // 'AAAA-MM-DD' opcional («Tarifas actualizadas al …»)
  updatedAt, updatedBy, history,        // SELLADOS por el servidor
}
```

## Reglas durables

- **Posición fija en la ficha**: columna principal, `MediaGallery` →
  `EventHotelsSection` → `htmlContent`. La prueba lo comprueba por posición.
- **Nunca un contenedor vacío**: apagada, sin diapositivas o todas inactivas →
  `publicHotelsView` devuelve `null` y no se pinta nada. Un evento sin
  `metadata.hotels` no cambia en absoluto.
- **Nunca recortar**: `object-contain` en el visor y en la ampliada; el visor
  reserva el alto de la diapositiva más alta (sin saltos). Sin reproducción
  automática (la gente necesita tiempo para leer). Sharp redimensiona con
  `fit: 'inside'` y `withoutEnlargement`: nada de recortes ni postproceso.
- **El tipo se juzga por los BYTES, ya subidos**: JPEG/PNG/WebP por firma;
  PDF por `%PDF-` + `%%EOF`, y se rechaza si declara `/JavaScript`, `/JS`,
  `/Launch` o `/EmbeddedFile` (barrera razonable, no antivirus). Lo rechazado
  se borra.
- **El archivo nunca pasa por la función** (tope de 4,5 MB de Vercel): PUT
  prefirmado a `private/event-hotels/{evento}/incoming/`, luego el servidor
  lee el objeto, valida, optimiza y publica en `events/hotels/{evento}/`.
- **Optimización**: WebP en tres tamaños (2400 / 1400 / 480 px de lado largo),
  fondo blanco para PNG transparentes, sin metadatos, caché inmutable (claves
  únicas). Mínimo legible 800 px de lado largo y 400 de corto; tope 60 MP.
- **Topes configurables** por entorno: `EVENT_HOTELS_MAX_IMAGE_MB` (15) y
  `EVENT_HOTELS_MAX_DOCUMENT_MB` (40). Máximo 40 diapositivas.
- **Permisos**: capacidad `media` del evento (la de Multimedia) vía
  `assertEventCapability`; sin grant que decida, sólo `SITE_ADMIN_ROLES`. Un
  evento ajeno «no existe» (404). Con alcance acotado, la clave `hotels` de la
  metadata la escribe sólo quien tenga `media`.
- **El historial no se puede falsificar**: `stampHotelsUpdate` toma
  `updatedAt/updatedBy/history` de lo YA guardado; si hubo cambios, sella la
  hora del servidor y agrega una entrada (tope 50). Guardar sin cambios no
  agrega nada. Los endpoints públicos quitan `history` y `updatedBy`
  (`stripPrivateHotelsFields`).
- **Liberar archivos es explícito y acotado**: «Archivos sin uso» en el panel.
  Sólo objetos del prefijo del evento, con más de 24 h, y que ninguna fila de
  `CalendarEvent` mencione (metadata, HTML, portada o galería, de CUALQUIER
  evento). La Biblioteca y otras secciones nunca se tocan. Quitar o reemplazar
  una diapositiva en el panel NO borra nada por sí solo.
- **Reemplazar** conserva posición, texto alternativo y estado; elegir de la
  Biblioteca deja la diapositiva sin versiones optimizadas (usa la URL tal cual).

## Fase 2 (pendiente, documentada): PDF → diapositivas

Hoy un PDF se acepta como **guía descargable**. Si se suelta en el visor, el
panel explica cómo exportar las páginas como imágenes (PowerPoint/Keynote:
Archivo → Exportar → JPEG/PNG). Convertir páginas a imágenes requiere una
dependencia importante (`pdfjs-dist` en el navegador, ~2 MB de worker, o
poppler/pdfium en el servidor, no disponible en Vercel). Camino recomendado:
`pdfjs-dist` cargado con `import()` SOLO en el editor, renderizar cada página a
2400 px en un canvas y subirla por el MISMO flujo de diapositivas (el servidor
vuelve a validar cada imagen), conservando el PDF como guía si se autoriza.

## Pendientes conocidos

- **CORS del bucket**: la subida es un PUT del navegador a S3, como en los
  aportes de contenido y la plantilla de la Feria.
- Un PUT prefirmado que nunca se confirma deja un objeto en
  `private/event-hotels/`; conviene una regla de ciclo de vida que lo borre.
