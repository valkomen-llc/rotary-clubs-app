# Sitio web de Club Platform — v4.1348

El sitio institucional de la PROPIA plataforma, administrado desde el panel
central (`app.clubplatform.org/admin/sitio-institucional`) con el mismo motor
por contenedores que usan los sitios del ecosistema. Léelo antes de tocar el
módulo.

## Diagnóstico que motivó el diseño (2026-11-23)

| Qué se miró | Qué había de verdad |
|---|---|
| `clubplatform.org` | En Vercel pertenece a OTRO proyecto (`saas-landing`, la carpeta `saas-landing/`), cuyo `vercel.json` redirige todo a `app.clubplatform.org`. La aplicación principal (`rotary-clubs-website`) no recibe ese dominio. |
| «Crear website» del acceso | Lleva a `/registro`: aprovisiona el sitio de un CLUB. No crea nada para la plataforma. |
| `src/pages/LandingPage.tsx` | Inalcanzable en producción (tres redirecciones lo tapaban) y con testimonios y cifras inventadas. Ya no se importa; el archivo quedó sin uso. |
| Motor de sitios | Cada sitio es una fila de `Club`; `GET /api/clubs/by-domain` resuelve el tenant y `SmartHome` pinta una portada FIJA por tipo. No hay editor de páginas genérico para sitios de club. |
| Editor por contenedores | Sí existe, en la landing de Programas (v4.1281): lista cerrada de bloques, saneado en servidor, borrador ≠ publicado, bloqueo optimista, vista previa firmada, versiones. Es lo que se reutilizó. |
| Analíticas | GA4 Data API filtrando `hostName CONTAINS`. La entrada fija «Club Platform (Principal)» filtra `clubplatform.org`, que también casa con cada `{club}.clubplatform.org` y con el panel. No se excluía `/admin`. |
| SEO | El `<head>`, `robots.txt` y `sitemap.xml` se resuelven en el servidor por host (`seoServe.js`). |
| Agentes de IA | Hay catálogo y runtime (Command Center), ligados a sitios de club. Para redactar se usa `ai-router.routeToModel`. |

## La decisión: entidad propia, NO una fila de `Club`

El encargo pedía decidir entre registrar la plataforma como un sitio más o
crear una entidad «Sitio de plataforma». Es lo segundo, por evidencia: una fila
`Club.type = 'platform'` se colaba, sin filtro por tipo, en el catálogo y los
conteos de Analíticas, el KPI de clubes del dashboard, ocho selectores del panel
que llaman a `/api/admin/clubs` sin `?type=`, la distribución de noticias, el CRM
institucional, el barrido de SEO, las listas `type != 'district'` de Rotary en
Acción y el cron que suspende sitios por vencimiento. Además `by-domain` no
tiene subdominios reservados.

Por eso:

- **Seis tablas `PlatformSite*`, sin `clubId` y sin claves foráneas.** El sitio
  institucional no es un tenant. `test:platform-site` fija que ninguna lleve
  `clubId` y que el módulo no escriba en `Club`.
- **No se agregó `platform` a `ENTITY_TYPES`.** El sistema distingue: plataforma
  central (el panel), sitio institucional (`PlatformSite`), sitios de clubes y
  demás tipos (`Club`).
- De un club sólo se LEEN columnas públicas (`id, name, logo, domain, type`) de
  sitios activos con dominio propio, para el contenedor «Sitios del ecosistema».

## Archivos

| Qué | Dónde |
|---|---|
| Criterio puro y su espejo | `server/lib/platformSiteSpec.js`, `src/lib/platformSiteSpec.ts` |
| Esquema, almacén, controlador, rutas | `server/lib/ensurePlatformSiteSchema.js`, `server/lib/platformSiteStore.js`, `server/controllers/platformSiteController.js`, `server/routes/platform-site.js` |
| Head, robots y sitemap sin JavaScript | `server/lib/platformSiteServe.js` (lo llama `api/index.js`) |
| Renderizador público | `src/components/platform-site/PlatformSiteView.tsx`, `PlatformIcon.tsx` |
| Página pública y vista previa | `src/pages/PlatformSitePage.tsx` |
| Módulo del panel | `src/pages/admin/PlatformSiteAdmin.tsx`, `src/components/admin/platform-site/{api.ts,EditorTab.tsx,Tabs.tsx}` |
| Pruebas | `scripts/test-platform-site.mjs` (en `prebuild`), `scripts/test-platform-site-e2e.mjs` |

## Reglas durables

- **Publicar y ACTIVAR son dos decisiones.** `publish` deja la versión lista;
  `publicLive` (pestaña «Dominio», sólo administrador central, exige escribir el
  dominio) es lo que hace que el host público la muestre. Lo público responde
  404 hasta que ocurren las dos.
- **El borrador nunca se sirve sin token.** La vista previa es
  `/vista-previa/sitio-institucional[/pagina]?t=…`, firmada con HMAC, una hora,
  `no-store` y `X-Robots-Tag: noindex` (también en el catch-all).
- **Una capacidad sólo se anuncia si está VERIFICADA** (`solutions.items[].verified`).
  Nacen sin verificar. El asistente de redacción no puede marcarlas.
- **Un botón o enlace del menú que apunta a un contenedor que no se pinta
  tampoco se pinta** (`blockReadiness`): era un ancla a ninguna parte.
- **Los avisos de edición (`notes`) no viajan a lo público.**
- **Nunca HTML, CSS ni JS.** Catálogos cerrados; `javascript:` no es un enlace.
- **Direcciones reservadas** (`RESERVED_SLUGS`): el sitio y la aplicación
  comparten despliegue; una página `admin`, `api`, `login`… se rechaza al guardar.
- **Administrador central = `superadmin`, o `administrator` SIN club**
  (`isCentralAdmin`, la regla de `campaignScope.isOperator`). Un `administrator`
  con club es el administrador local de ese club: 403.
- **El rol se lee de la base en cada petición**: retirar un acceso surte efecto
  con el mismo token.
- **Una edición invalida la aprobación**: `reviewedVersion` debe ser igual a
  `draftVersion` para publicar con revisión obligatoria.
- **Reversión no borra**: escribe una versión NUEVA con `restoredFrom`.
- **`clubplatform.org` no redirige a ciegas.** Se quitaron las redirecciones de
  `index.html` y `ClubContext`; `PlatformSitePage` pregunta al servidor y, si el
  sitio no está en vivo, lleva al panel. La del servidor (`saas_redirect`) se
  apaga sola sólo con el sitio en vivo en ese host.
- **Clases `bg-rotary-*` sin modificador de opacidad** (v4.719): con
  `bg-rotary-navy/95` la cabecera quedó transparente. Lo fija la prueba.
- **Analíticas**: entrada `platform-site` con `exactHostnames` (filtro
  `inListFilter` de host exacto + `pagePath` que no empiece por `/admin`). El
  conteo propio (`PlatformSiteDaily`) no guarda IP, sólo cuenta el sitio en vivo
  y descarta peticiones con sesión del panel.

## Flujo y roles

Borrador → Vista previa → Revisión → Publicación.

| Rol | Puede |
|---|---|
| Administrador central | Todo: crear, editar, revisar, publicar, revertir, dominio, accesos, solicitudes |
| Editor del sitio institucional | Editar el borrador, enviarlo a revisión, gestionar solicitudes |
| Revisor | Ver el borrador, aprobar o pedir cambios (con motivo) |
| Sin acceso | 403 en el servidor |

Editor y revisor se conceden por correo a cuentas existentes («Accesos»).
Entran por la dirección directa `/admin/sitio-institucional`: la entrada del
menú sólo se pinta al administrador central.

## Uso

1. Panel central → «Sitio web de Club Platform» → **Crear sitio institucional**.
2. «Páginas y contenido»: editar contenedores, verificar capacidades, elegir
   sitios del ecosistema. **Guardar borrador**.
3. «Diseño» (correo de contacto, menú, pie) y «SEO» (título, descripción,
   imagen para compartir).
4. «Vista previa» en escritorio, tableta y móvil.
5. Enviar a revisión → aprobar → **Publicar cambios**.
6. «Dominio»: comprobar conexión y, con autorización, **Activar el sitio público**.
7. Ante un error: «Versiones» → **Revertir a ésta**, o «Dominio» → desactivar.

## Pendientes para publicación (requieren autorización, no se hicieron)

1. **Mover `clubplatform.org` y `www.clubplatform.org`** del proyecto de Vercel
   `saas-landing` al proyecto `rotary-clubs-website`. Hasta entonces, activar el
   sitio no tiene efecto visible: la pestaña «Dominio» lo detecta y lo dice.
2. Validar y marcar como verificadas las capacidades de «Soluciones».
3. Revisar los textos iniciales (son la propuesta editorial del encargo) y las
   respuestas de las preguntas frecuentes.
4. Subir la imagen para compartir y, si se quiere, capturas reales del producto
   (la portada usa por omisión una representación esquemática, no una captura).
5. Configurar el correo de contacto y elegir, con permiso de cada club, los
   sitios del ecosistema que se muestran.
6. Decidir si el widget global de chat debe mostrarse en el sitio institucional.
7. No construido: traducción por idioma del contenido (hoy un idioma por sitio),
   entrada de menú para editores y revisores, e instalación de agentes del
   Command Center sobre este sitio (el asistente usa el enrutador de modelos).

## Cómo se probó

- `npm run test:platform-site`: 183 comprobaciones puras; con
  `TEST_DATABASE_URL`, 47 más contra Postgres.
- `npm run test:platform-site:e2e` (base local + `dist/`): 75 comprobaciones —
  matriz de permisos por HTTP con tokens reales, borrador que no se filtra,
  vista previa, activación, formulario, reversión, y Chromium sobre el build:
  sitio público a 1440/820/390 px sin desborde, head resuelto sin JavaScript,
  panel, vista previa responsive y cero errores de consola.
