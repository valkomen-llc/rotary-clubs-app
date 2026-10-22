<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## La dirección de un artículo — v4.873

El Difusor de Publicaciones (`/admin/publicaciones`) no dejaba definir el slug,
así que un artículo se abría por su id: `/blog/1f6c8e2a-4b93-4d1e-…`. Se reportó
como «aparecen unos caracteres muy raros en el URL».

| Archivo | Qué es |
|---|---|
| `server/lib/postSlug.js` | El CRITERIO. **Puro**: palabras reservadas, choque de unicidad y dirección por sitio |
| `src/lib/postSlug.ts` | Espejo MÍNIMO: armar el slug mientras se escribe y enseñar a dónde queda |
| `resolvePostSlug` en `contentController.js` | La resolución, compartida por los cuatro caminos que escriben `Post.slug` |

Pruebas: `npm run test:post-slug` (49 casos, **sin base, credenciales ni red**;
incluye la paridad de los dos espejos y se salta ese bloque si falta `esbuild`).

**Reglas durables:**

- **EL SLUG ES DEL ARTÍCULO; EL DOMINIO LO PONE CADA SITIO.** Una publicación
  centralizada es UNA fila que se muestra en varios sitios (`targetClubIds`), así
  que su dirección es una sola y cambia con el dominio de quien la muestra:
  `rotary4281.org/blog/x` y `feria.org/blog/x` son el MISMO artículo. Por eso el
  slug no se guarda por sitio y la vista previa recorre los destinos elegidos en
  vez de suponer un dominio.
- **⚠️ `Post.slug` es ÚNICO EN TODA LA PLATAFORMA**, no por sitio como el de
  `CalendarEvent`. Dos publicaciones no pueden compartirlo aunque se muestren en
  sitios distintos: se libera con sufijo ANTES de escribir y **se avisa**. Sin
  eso el choque sale como un error del driver que no explica nada; con un cambio
  silencioso, se manda a buscar el artículo a una dirección que no es.
- **LOS CUATRO CAMINOS pasan por el mismo resolutor** —`createPost`,
  `updatePost`, `createPublication`, `updatePublication`—. Una noticia de club
  puede chocar con una publicación centralizada porque comparten la tabla. Lo
  comprueba una prueba contando las llamadas.
- **NO SE ESCRIBE UN SEGUNDO SLUGIFY.** `seoSpec.js` ya lo tenía, junto con los
  anchos con los que Google recorta el título y la descripción. Con dos
  catálogos, el panel avisaría de un límite que la auditoría no aplica. En
  `postSlug.js` vive **sólo** lo que aquél no tiene. Lo comprueba una prueba
  sobre el archivo.
- **El servidor NO confía en el slug del cliente**: lo normaliza siempre.
  Escribirlo tal como llega deja pasar una palabra reservada y choca con el
  índice único.
- **Un slug inservible no se sustituye a la callada**: se intenta con el título
  y, si tampoco, se guarda sin dirección amigable y **se dice**. El artículo se
  sigue abriendo por su id, que es como funcionaba antes — el endpoint público
  acepta `id OR slug` desde v4.420.
- **Un guardado que no toca el slug no le mueve la dirección** a un artículo que
  ya está circulando (`slug !== undefined`).
- **Al enlazar un artículo, `slug || id`.** `NewsSection.tsx` enlazaba SÓLO por
  id y era la vía por la que se veían los identificadores; `Blog.tsx` y
  `BlogPost.tsx` ya lo hacían bien. Al agregar un enlace a un artículo, mirar
  que no vuelva a quedar sólo el id.
- **Ninguna dirección pública se compone con `#`** — la aplicación dejó
  HashRouter hace decenas de versiones y quedaba una vista previa del panel de
  Noticias con `/#/blog/`, que enseñaba al administrador una dirección que no
  existe.
- **Un sitio sin dominio ni subdominio no se nombra**: se dice cuántos son, no
  se inventa un anfitrión.
- **`normalizeProjectSlug` es OTRA cosa** y por eso se renombró: corta en 80 y
  el de artículos en 75 —el ancho que declara `seoSpec.LIMITS`—. No se
  unificaron a propósito: cambiar el corte movería la dirección de proyectos ya
  publicados. Al tocar los slugs de proyecto, converger.
