# Hub Social — Arquitectura

Centro unificado de gestión de Facebook e Instagram: conexión de cuentas (OAuth),
publicación/programación con IA, métricas, bandeja de mensajes y comentarios,
webhooks en tiempo real y auditoría. Multi-tenant por **Club** (organización/sitio).

Guía de setup del portal Meta: **[meta-for-developers.md](./meta-for-developers.md)**.

---

## 1. Visión general

```
                 ┌──────────────────────────────────────────────┐
                 │                Frontend (React)              │
                 │  /admin/social-hub  → SocialHub.tsx (tabs)   │
                 │  Cuentas · Publicar · Biblioteca · Métricas  │
                 │  · Bandeja · Auditoría                       │
                 └───────────────┬──────────────────────────────┘
                                 │ REST /api/social/*  (Bearer JWT)
                 ┌───────────────▼──────────────────────────────┐
                 │        Backend (Express · Vercel serverless)  │
                 │  routes/social.js → controllers               │
                 │   · socialPublishingController (OAuth+publish)│
                 │   · socialWebhookController   (webhooks)      │
                 │   · socialInsightsController  (métricas)      │
                 │   · socialInboxController     (bandeja)       │
                 │  services: metaService, socialPublishService, │
                 │   metaWebhookService, insightsService,        │
                 │   instagramLoginService                       │
                 │  lib: tokenCrypto (AES-256-GCM), socialAudit  │
                 └───────┬───────────────────────┬──────────────┘
                         │                        │
                ┌────────▼─────────┐    ┌─────────▼──────────┐
                │  Postgres (Neon) │    │  Meta Graph API    │
                │  Prisma models   │    │  + Webhooks (push) │
                └──────────────────┘    └────────────────────┘
                         ▲
                ┌────────┴───────────────────────┐
                │  Vercel Cron                    │
                │  · publish-scheduled (5 min)    │
                │  · social-maintenance (diario)  │
                └─────────────────────────────────┘
```

Diseño orientado a **servicios independientes** dentro del monolito serverless:
cada dominio (OAuth, publicación, webhooks, insights, bandeja) es un
controller + service desacoplado, comunicándose por la base de datos y colas
lógicas (tabla `SocialWebhookEvent` como cola de eventos). Esto permite extraer
cualquiera a un microservicio/worker dedicado sin reescribir el resto.

---

## 2. Modelo de datos (Prisma)

Todos los modelos son **aditivos** (seguros para `prisma db push`).

| Modelo | Rol |
|--------|-----|
| `SocialAccount` | Cuenta conectada (FB Page / IG Business). Token cifrado, estado, permisos, `tokenVersion`. Único por `[clubId, platform, platformId]`. |
| `SocialPublication` | Publicación (draft/scheduled/published/…). Copies por plataforma, variantes de imagen, `targetAccounts` con outcome por cuenta. |
| `ScheduledPost` | Post programado de video (flujo legacy de VideoProject). |
| `SocialWebhookEvent` | **Cola** de eventos crudos de webhook. `status`: received/processed/failed/ignored. |
| `SocialConversation` + `SocialMessage` | Bandeja de DMs/Messenger. Hilo + mensajes in/out. |
| `SocialComment` | Comentarios en posts/reels. Estado, sentiment IA, sugerencia IA, oculto. |
| `SocialMetricSnapshot` | Serie temporal de Insights a nivel cuenta o media. |
| `SocialAuditLog` | Bitácora de acciones sensibles. |

Relaciones nuevas: `SocialAccount` → `webhookEvents`, `conversations`, `comments`,
`metricSnapshots`. `SocialPublication` → `comments`, `metricSnapshots`.

Aislamiento por tenant: casi todo lleva `clubId`. Los controllers filtran por
`req.user.clubId` (rol club) o permiten `?clubId=` (rol `administrator`).

---

## 3. Endpoints (`/api/social`)

### Cuentas / OAuth
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/connect/meta` | URL de OAuth (state firmado HMAC). |
| GET | `/callback/meta` | Callback público; descubre Páginas + IG y persiste cuentas. |
| GET | `/connect/instagram`, `/callback/instagram` | Flujo IG directo (sin Fanpage). |
| GET | `/accounts` | Lista cuentas (sin token). |
| POST | `/accounts/:id/verify` | Ping de token → estado. |
| DELETE | `/accounts/:id` | Desconectar. |

### Publicación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/publish` | Publicar inmediato o programar (`scheduledFor`). |
| GET | `/publications` | Biblioteca (filtros status/search). |
| DELETE | `/publications/:id` | Eliminar draft/scheduled/error. |

### Insights
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/insights/overview` | Resumen agregado (últimos snapshots). |
| GET | `/insights/accounts/:id` | Serie temporal de una cuenta. |
| POST | `/insights/refresh` | Captura en vivo + snapshot. |

### Bandeja
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/inbox/comments` | Listar comentarios. |
| POST | `/inbox/comments/:id/reply` | Responder. |
| POST | `/inbox/comments/:id/hide` | Ocultar/mostrar. |
| PATCH | `/inbox/comments/:id` | Estado / sentiment / sugerencia. |
| GET | `/inbox/conversations` | Listar hilos. |
| GET | `/inbox/conversations/:id/messages` | Mensajes de un hilo. |
| POST | `/inbox/conversations/:id/reply` | Enviar mensaje (Send API). |
| PATCH | `/inbox/conversations/:id` | Estado / asignación. |

### Webhooks / Auditoría
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/webhooks/meta` | Handshake de verificación (público). |
| POST | `/webhooks/meta` | Ingest de eventos (raw body + firma). Montado en `api/index.js`. |
| GET | `/webhooks/events` | Diagnóstico de eventos recibidos. |
| GET | `/audit` | Bitácora de auditoría. |

---

## 4. Flujo OAuth y ciclo de vida del token

1. `/connect/meta` genera URL con `state` firmado (HMAC-SHA256, TTL 30 min, lleva
   `clubId|userId`).
2. Usuario autoriza → Meta redirige a `/callback/meta` con `code`.
3. `code` → **user token corto** → **user token largo** (~60 días).
4. `/me/accounts` enumera Páginas; cada una trae su **Page Access Token largo**.
5. Por cada Página se detecta el **IG Business** vinculado.
6. Se persiste una fila `SocialAccount` por Página y por IG, con el token **cifrado**
   (AES-256-GCM, `tokenCrypto`) y `tokenVersion=1`.

**Ciclo de vida** (`cron/social-maintenance`, diario):
- Marca `status='expired'` las cuentas con `expiresAt < now` → aparecen como
  "reconectar" en el panel.
- Captura snapshots de métricas por cuenta activa.
- La reconexión es el mismo flujo OAuth (re-emite tokens largos).

Los Page Access Tokens son de larga duración mientras el user token siga válido y el
usuario mantenga su rol de admin en la Página; por eso la estrategia principal es
**detección + reconexión asistida** más que refresh silencioso.

---

## 5. Procesamiento asíncrono de webhooks

1. Meta hace `POST /api/social/webhooks/meta` con el evento.
2. El handler valida la **firma** `X-Hub-Signature-256` sobre el **cuerpo crudo**
   (por eso `express.raw` antes del JSON parser).
3. Normaliza el payload en eventos planos (`normalizeWebhookPayload`).
4. Procesamiento **liviano inline** (upsert de comentarios/conversaciones/mensajes) y
   persistencia de cada evento en `SocialWebhookEvent` (la "cola").
5. Responde `200 EVENT_RECEIVED` rápido (Meta reintenta ante no-200).

Escalado futuro: mover el paso 4 a un worker que consuma `SocialWebhookEvent`
`status='received'` (desacople total emisor/procesador). El esquema ya lo soporta.

---

## 6. Integración con Content Studio / IA

La pestaña **Publicar** reutiliza `PostGenerator` (Content Studio): genera imagen
(KIE/OpenAI) + copies por plataforma (GPT-4o) y publica vía `POST /api/social/publish`.
Los comentarios pueden enriquecerse con **sentiment** y **sugerencia de respuesta**
de los agentes IA (`SocialComment.sentiment` / `aiSuggestion`), consumidos por la
Bandeja. Regla del proyecto: **no postprocesar** el output del modelo de imagen.

---

## 7. Seguridad y permisos

- **Tokens cifrados** en reposo (AES-256-GCM, IV+auth tag, formato versionado `v1:`).
  Nunca se devuelven al frontend (`serialiseAccount` los omite).
- **OAuth state firmado** (anti-CSRF/replay).
- **Firma de webhooks** verificada en tiempo constante.
- **Autorización por rol**: solo `administrator` o usuarios del club dueño pueden
  conectar/desconectar/publicar/responder. Aislamiento por `clubId`.
- **Auditoría**: `SocialAuditLog` registra connect/disconnect/publish/reply/hide/
  webhook/token_expired. Best-effort (nunca rompe el flujo principal).

---

## 8. Manejo de errores

| Situación | Respuesta del sistema |
|-----------|-----------------------|
| Permisos insuficientes | Mensaje claro + acción "reconectar". Secciones dependientes muestran estado vacío explicativo. |
| Token expirado | `status='expired'`, badge "reconectar", cron lo detecta. |
| Cuenta desconectada / token legacy | Bloqueo de publish con motivo; `needsReconnect`. |
| Rate limit / error temporal de Meta | Outcome por cuenta con el error; publish parcial soportado (`status='partial'`). |
| Publicación rechazada | Se persiste el outcome con el error; no se pierde el contenido. |
| Webhook con firma inválida | `403`, evento descartado. |
| Envío de DM fallido | Mensaje guardado como `failed` (no se pierde el texto). |

---

## 9. Roadmap por fases

- **Fase 1–3 (hecho):** OAuth multi-cuenta, cifrado, publicación FB/IG imagen,
  programación + cron, biblioteca, calendario.
- **Fase 4 — Fundación (esta entrega):** modelos aditivos (webhooks, bandeja,
  métricas, auditoría), receptor de Webhooks, servicio de Insights + dashboard,
  bandeja de comentarios/mensajes, auditoría, cron de mantenimiento, **página Hub
  Social unificada**.
- **Fase 5 — Formatos:** carruseles, video, reels, historias (extender
  `socialPublishService.publishToAccount` + `mediaType`).
- **Fase 6 — Analítica avanzada:** demografía, ciudades, países, horarios óptimos,
  rendimiento por publicación (media insights → `SocialMetricSnapshot scope='media'`).
- **Fase 7 — IA en Bandeja:** moderación (detección de lenguaje ofensivo) y respuestas
  sugeridas con los agentes de la plataforma.
- **Fase 8 — Más plataformas:** LinkedIn, X (el `platform` del schema ya los contempla).

---

## 10. Archivos clave

```
server/
  routes/social.js                         # todas las rutas del Hub
  controllers/
    socialPublishingController.js          # OAuth + publish + schedule (+ auditoría)
    socialWebhookController.js             # verify + ingest + procesamiento
    socialInsightsController.js            # overview/series/refresh
    socialInboxController.js               # comentarios + mensajes
  services/
    metaService.js                         # Graph API OAuth + discovery
    socialPublishService.js                # publish FB/IG
    metaWebhookService.js                  # firma + normalización
    insightsService.js                     # FB/IG Insights
    instagramLoginService.js               # IG directo
  lib/
    tokenCrypto.js                         # AES-256-GCM
    socialAudit.js                         # bitácora
  routes/cron.js                           # publish-scheduled + social-maintenance
api/index.js                               # mount + webhook raw (producción)
src/pages/admin/SocialHub.tsx              # módulo unificado (tabs)
src/components/admin/social-hub/           # MetricsDashboard, InboxCenter, AuditPanel
src/components/admin/content-studio/       # AccountManager, PostGenerator, PublicationLibrary (reuso)
```
