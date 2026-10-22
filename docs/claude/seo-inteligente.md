<!-- Extraído de CLAUDE.md. Las reglas siguen vigentes: léelo ANTES de tocar este módulo. -->

## SEO Inteligente (AI SEO Engine) — v4.703

Servicio transversal: optimiza el posicionamiento de **cualquier** sitio de la
plataforma, sin depender de ningún módulo concreto.

| Archivo | Qué es |
|---|---|
| `server/lib/seoSpec.js` | Fuente de verdad: rutas públicas, rutas privadas, límites, pesos de la nota y catálogo de hallazgos |
| `server/lib/seoEntities.js` | Qué COSA hay detrás de cada dirección; inventario del sitio |
| `server/lib/seoRender.js` | Composición del `<head>`: reemplaza, escapa y escribe una sola vez |
| `server/lib/seoSchema.js` | JSON-LD por tipo de página |
| `server/lib/seoServe.js` | Orquesta el documento público; lo llama el catch-all de `api/index.js` |
| `server/lib/seoRules.js` | El criterio de la auditoría. **Puro**: sin base, sin red, sin IA |
| `server/lib/seoAudit.js` | Recorre el sitio y le pasa cada página a las reglas |
| `server/lib/seoAI.js` | Redacta metadatos, palabras clave, ALT y recomendaciones |
| `server/lib/seoIntegrations.js` | Search Console, GA4, PageSpeed, IndexNow… con su estado REAL |
| `server/lib/seoStore.js` | Persistencia e histórico |
| `server/lib/seoSweep.js` | AI Tracker: barrido por cron |
| `server/lib/ensureSeoSchema.js` | Crea las 6 tablas en runtime |
| `server/controllers/seoController.js` | `robots.txt` y `sitemap.xml` |
| `server/controllers/seoEngineController.js` | API del panel |
| `src/pages/admin/SeoIntelligence.tsx` | El panel (`/admin/seo`) |
| `src/lib/seoSpec.ts` | Espejo mínimo: sólo lo que hace falta para pintar |

Pruebas: `npm run test:seo` (118 casos). **No necesitan base ni credenciales** —
por eso el criterio vive en `seoRules.js`, separado de la orquestación.

**Reglas durables:**

- **El `<head>` se resuelve en el SERVIDOR, no en `useSEO`.** Los rastreadores de
  WhatsApp, Facebook, LinkedIn, Slack y Telegram **no ejecutan JavaScript**: leen
  el HTML tal como llega. `useSEO` corre demasiado tarde para ellos y queda sólo
  para la navegación interna de la SPA. Es posible porque `vercel.json` reescribe
  `/((?!api/).*)` a la función: toda página pasa por Express antes de existir.
- **Se REEMPLAZA, nunca se añade** (`stripManagedTags`). Era el defecto de fondo:
  `index.html` trae `og:title`/`og:description`/`og:url` escritos a mano y el
  servidor añadía los suyos antes de `</head>`. El documento salía con DOS
  `og:title` y toda red social lee la **primera** — la genérica de la plataforma.
  Por eso los cientos de sitios alojados compartían la misma tarjeta. Al agregar
  una etiqueta al `<head>`, agregarla a `MANAGED_NAMES`/`MANAGED_PROPS` o volverá
  a duplicarse.
- **Ninguna dirección pública se compone con `#`.** La aplicación migró a
  BrowserRouter hace decenas de versiones, pero `useSEO` seguía escribiendo la
  canonical como `dominio/#/ruta` y el sitemap publicaba lo mismo. El buscador
  descarta el fragmento, así que cada sitio venía declarando que **todas sus
  páginas son la portada** y se indexaba una sola dirección por sitio.
- **`robots.txt` y `sitemap.xml` van en la RAÍZ.** Existían sólo bajo
  `/api/public/seo/…`, donde ningún rastreador mira; las direcciones de la raíz
  caían en el catch-all y devolvían HTML. Para Google, sitios sin robots y sin
  sitemap.
- **Las reglas de `robots.txt` van sin barra final.** La comparación es por
  PREFIJO: `Disallow: /login` cubre `/login` y `/login/`; `Disallow: /login/`
  deja fuera justamente `/login`, que es la dirección que existe. Y una regla con
  `#` no bloquea nada —el fragmento nunca llega al servidor—, que es peor que no
  tenerla: da por protegido algo abierto.
- **`PRIVATE_PREFIXES` es la ÚNICA lista de lo que no se indexa.** La consumen
  robots.txt, el sitemap y la auditoría. Con dos listas se separan en silencio y
  el sitemap acaba publicando lo que robots bloquea.
- **Todo lo interpolado en el HTML se escapa** (`escapeAttr`). El nombre y la
  descripción del club se metían crudos en `content="…"`: una comilla partía la
  etiqueta y derramaba texto en el `<head>`.
- **Una entidad que ya no existe responde 404, no 200.** Un *soft 404* se indexa
  como página buena, se acumula y diluye el sitio. El módulo que reporta ese
  defecto no puede cometerlo.
- **La IA no DESCUBRE problemas: los REDACTA.** Los hallazgos salen de
  `seoRules.js`, que es aritmética y comparación de cadenas. Mismo criterio que
  `crmRecommendations.js`: darle la base a un modelo y pedirle «decime qué
  mejorar» produce cifras plausibles y no auditables. **Sin credencial de modelo
  la auditoría funciona igual**; pierde la redacción, no los hallazgos.
- **El modelo escribe, el CÓDIGO valida.** `validateMeta` comprueba longitudes y
  reintenta devolviéndole al modelo **la regla concreta que rompió**, igual que
  `templateComposer.js`. Pedirle «revisá el formato» no corrige nada. Tras los
  reintentos se repara por código (recortar sin partir palabras) en vez de tirar
  el trabajo.
- **El título que escribió una persona NO se recorta.** Lo único que se decide es
  si el nombre del sitio cabe detrás. Que sea largo es un hallazgo con su
  recomendación, no algo que el pintado resuelva por lo bajo. El `<title>` y el
  `og:title` se componen por separado: la tarjeta social tiene más espacio.
- **Lo MANUAL no lo pisa la IA, nunca.** Está en el `WHERE` del `ON CONFLICT` de
  `savePageMeta`, no en la pantalla — misma regla que `putAuto` en traducciones.
  Si el repaso nocturno puede sobrescribir un título corregido a mano, corregir a
  mano deja de tener sentido.
- **No se declara en JSON-LD lo que no se sabe.** `prune` quita los campos
  vacíos y un `Event` sin fecha **no se emite**: Schema.org la exige y un dato
  inventado no es un dato incompleto, es una declaración falsa que Google
  penaliza. Sin ciudad ni país no se declara dirección.
- **Un cero es una afirmación; un hueco es la verdad.** Impresiones, clics, CTR y
  posición **sólo** existen con Search Console conectado, y sin él se muestran
  vacíos con el motivo escrito. **Backlinks y posición real NO se reportan**:
  exigen un índice de enlaces o un proveedor de SERP que no tenemos. El volumen y
  la dificultad de una palabra clave salen de un modelo y viajan marcados
  `provenance: 'estimated'` — no son datos de SEMrush y la UI lo dice.
- **`unknown` no es un tipo de «bien».** Una integración tiene cuatro estados y
  «no se pudo comprobar» se pinta distinto de «conectado». Misma regla que el
  panel de diagnóstico del CRM.
- **La nota y la SALUD responden preguntas distintas** y por eso son dos números.
  La nota dice qué tan optimizado está; la salud, qué tan roto. Un sitio con
  descripciones cortas tiene nota media y salud perfecta; uno con canonicals
  rotas, salud por el piso. Mezclarlas escondería lo que urge.
- **El descuento de la nota es proporcional al tamaño del sitio**, pero **un
  hallazgo crítico topa su eje en 50** por grande que sea: «crítico» significa que
  algo no funciona, y promediarlo hasta hacerlo desaparecer vacía la palabra.
- **El criterio es PURO y por eso se puede probar** (`seoRules.js`). Un motor de
  auditoría que sólo se ejercita contra una base real termina sin pruebas, y
  entonces nadie se entera de que una regla cambió de signo.
- **Las seis tablas viven FUERA de Prisma**, como manda la sección de base de
  datos de este archivo, y quedan protegidas por `scripts/db-push-guard.mjs`.
- **El barrido tiene presupuesto de tiempo y candado.** El candado es un `UPDATE`
  condicional sobre `lastAuditAt` con `FOR UPDATE SKIP LOCKED`: dos vueltas
  simultáneas del cron no auditan el mismo sitio ni gastan el doble de modelo.
- **`STATIC_ROUTES` es espejo de `src/App.tsx`, escrito a mano.** El servidor no
  puede importar el árbol de rutas de React. Una ruta pública nueva que no se
  declare cae en `generic`: se degrada, no se rompe — pero pierde su Schema y su
  prioridad.
- **La auditoría NO rastrea por red.** Lee la base, que es la fuente exacta de lo
  que publicamos. Un rastreador tendría que pedir cada página y esperar a que
  React la pinte: imposible en 120 s y pagando por mirar lo que ya tenemos. Por
  lo mismo sólo ve el contenido guardado, no lo que pinta la plantilla — de ahí
  que las comprobaciones de encabezados y de páginas huérfanas se limiten al
  contenido con cuerpo propio, para no acusar en falso.

**Variables de entorno:**

| Variable | Para qué |
|---|---|
| `SEO_AUDIT_INTERVAL_HOURS` | Cada cuánto se reaudita un sitio (24 por defecto) |
| `PAGESPEED_API_KEY` | Core Web Vitals reales (laboratorio y campo) |
| `GOOGLE_SEO_CLIENT_ID` / `GOOGLE_SEO_CLIENT_SECRET` | Search Console, GA4 y Business Profile |
| `INDEXNOW_KEY` | Aviso a Bing/Yandex/Seznam. **Google no participa en IndexNow** |
| `BING_WEBMASTER_KEY` | Cobertura y consultas en Bing |
| `CRON_SECRET` | Protege `/api/cron/seo-tick`, igual que el resto de los crons |

**Pendientes conocidos:** la autorización OAuth de Search Console y GA4 está
**declarada pero no implementada** — el módulo reconoce la credencial de
aplicación y distingue «sin autorizar» de «sin configurar», pero falta el flujo
de consentimiento por sitio y la lectura de datos; hasta entonces impresiones,
clics, CTR y posición se muestran vacíos a propósito. PageSpeed está
implementado de punta a punta pero todavía no se llama desde el barrido, así que
Core Web Vitals no entra aún en la nota. Y el sitemap es un archivo único: por
encima de 50.000 direcciones habrá que partirlo en índice.
