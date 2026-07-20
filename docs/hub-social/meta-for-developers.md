# Hub Social — Configuración en Meta for Developers (paso a paso)

Guía operativa para registrar, configurar y llevar a **producción** la aplicación
de Meta que usa el Hub Social para conectar Facebook e Instagram de los clientes.

> **Regla durable del proyecto:** ningún deploy/migración debe ejecutar operaciones
> destructivas de base de datos. Los modelos del Hub Social son **aditivos**.

---

## 0. Requisitos previos

| Requisito | Detalle |
|-----------|---------|
| Cuenta de Meta Business | [business.facebook.com](https://business.facebook.com) — para verificación del negocio |
| Cuenta de desarrollador | [developers.facebook.com](https://developers.facebook.com) |
| Dominio productivo | `app.clubplatform.org` (o el dominio central de OAuth) con HTTPS |
| Política de privacidad pública | URL accesible (obligatoria para App Review) |
| Términos de servicio públicos | URL accesible |

---

## 1. Crear la aplicación

1. Ir a **developers.facebook.com → My Apps → Create App**.
2. **Tipo de app**: elegir **"Business"** (no "Consumer"). El tipo Business habilita
   Facebook Login for Business, Instagram Graph API, Webhooks y Messenger, y se
   asocia a un Meta Business Portfolio.
3. Nombre de la app (ej. *Rotary Club Platform — Social Hub*), email de contacto y
   seleccionar el **Business Portfolio** verificado.
4. Al crearse se obtiene el **App ID** (público) y el **App Secret** (secreto).

### Credenciales → variables de entorno (Vercel)

| Variable | Valor | Notas |
|----------|-------|-------|
| `META_APP_ID` | App ID | Público. Ya hay un default en código; setearlo es opcional pero recomendado. |
| `META_APP_SECRET` | App Secret | **Secreto.** Settings → Basic → *Show*. Nunca commitear. |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | del producto *Instagram* | Solo para el flujo "Instagram Login directo" (cuentas sin Fanpage). |
| `META_WEBHOOK_VERIFY_TOKEN` | string arbitrario | El mismo que se ingresa al suscribir el webhook. |
| `TOKEN_ENCRYPTION_KEY` | 64 hex (32 bytes) | Cifrado AES-256-GCM de tokens. Generar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | string | Protege los endpoints de cron. |

---

## 2. Productos oficiales a agregar a la app

En **Dashboard → Add Product**, agregar:

| Producto | Para qué |
|----------|----------|
| **Facebook Login for Business** | Flujo OAuth 2.0 y obtención de Page Access Tokens. |
| **Instagram Graph API** | Publicar y leer insights/comentarios de Instagram Business. |
| *(Graph API — implícito)* | La Graph API está disponible por defecto para la app. |
| **Webhooks** | Eventos en tiempo real: comentarios, mensajes, menciones, feed. |
| **Messenger** | Recibir/responder mensajes de Páginas (Messenger). |
| **Instagram** *(Instagram Login)* | Solo si se soporta conexión IG directa sin Fanpage. |

---

## 3. Configurar Facebook Login for Business (OAuth)

En **Facebook Login for Business → Settings**:

1. **Valid OAuth Redirect URIs** — agregar exactamente:
   - `https://app.clubplatform.org/api/social/callback/meta`
   - `https://app.clubplatform.org/api/social/callback/instagram` (si se usa IG directo)
   - Para pruebas locales/preview, agregar también las URLs correspondientes.
2. **Client OAuth Login**: ON. **Web OAuth Login**: ON.
3. **Enforce HTTPS**: ON.
4. En **Settings → Basic**:
   - **App Domains**: `clubplatform.org`
   - **Privacy Policy URL** y **Terms of Service URL** (obligatorias).
   - **Category** de la app y **Business Use**.

> El código construye la redirect URI desde `APP_URL`/`NODE_ENV`
> (`getRedirectUri` en `socialPublishingController.js`). Debe coincidir **carácter
> por carácter** con la registrada acá.

---

## 4. Permisos (scopes) por funcionalidad

La app pide **solo** los permisos necesarios. Matriz:

| Funcionalidad | Permisos requeridos |
|---------------|---------------------|
| Listar Páginas del usuario | `pages_show_list` |
| Publicar en Página (FB) | `pages_manage_posts`, `pages_read_engagement` |
| Metadata / gestión de Página | `pages_manage_metadata` |
| Publicar en Instagram | `instagram_basic`, `instagram_content_publish` |
| Insights de Instagram | `instagram_manage_insights` |
| Insights de Página (FB) | `read_insights` |
| Comentarios de Instagram | `instagram_manage_comments` |
| Mensajes de Instagram (DM) | `instagram_manage_messages` |
| Messenger de Página | `pages_messaging` |
| Selección de negocio/activos | `business_management` |

Scopes que ya solicita el código en OAuth (`metaService.js → REQUIRED_SCOPES`):
`pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_metadata,
instagram_basic, instagram_content_publish, business_management`.

> Para habilitar **Métricas**, **Comentarios** y **Mensajes** en producción hay que
> **agregar** los permisos correspondientes al OAuth y **aprobarlos en App Review**
> (ver §7). Mientras no estén aprobados, esas secciones del Hub muestran estados
> vacíos explicativos, sin romper el resto.

---

## 5. Configurar Webhooks

En **Webhooks** (o dentro de cada producto → Webhooks):

1. **Callback URL**: `https://app.clubplatform.org/api/social/webhooks/meta`
2. **Verify Token**: el mismo valor de `META_WEBHOOK_VERIFY_TOKEN`.
3. Meta hará un `GET` con `hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`.
   El endpoint responde el `challenge` si el token coincide
   (`verifyMetaWebhook`). Debe dar **verificación exitosa**.
4. **Suscribir campos** por objeto:
   - Objeto **Page**: `feed`, `mentions`, `messages`, `messaging_postbacks`.
   - Objeto **Instagram**: `comments`, `mentions`, `messages`.
5. La firma `X-Hub-Signature-256` se valida contra el cuerpo crudo con el App Secret
   (`verifySignature`). El POST se monta con `express.raw` **antes** del parser JSON
   (ver `api/index.js`).

---

## 6. Modo Desarrollo vs. Producción

- **Development Mode**: la app solo funciona con usuarios con rol en la app
  (Admins/Developers/Testers). Ideal para probar todo el flujo con cuentas propias
  **antes** de App Review.
  - Agregar testers en **App Roles → Roles / Test Users**.
- **Live Mode**: requiere App Review aprobada de los permisos avanzados + Business
  Verification + política de privacidad. Recién entonces cualquier usuario puede
  conectar sus cuentas.
- Cambiar el switch **App Mode: Development → Live** en la barra superior una vez
  aprobado.

---

## 7. App Review (revisión de permisos avanzados)

1. **Business Verification**: en Meta Business Settings, verificar el negocio
   (documentación legal de la organización). Requisito para permisos avanzados.
2. **App Review → Permissions and Features**: solicitar cada permiso avanzado con:
   - **Screencast** mostrando el flujo real (conectar cuenta → publicar → leer
     métricas/comentarios/mensajes).
   - **Descripción del caso de uso** y cómo se usa cada permiso.
   - Instrucciones de prueba (usuario de prueba, pasos).
3. Permisos que típicamente requieren review para este Hub:
   `pages_manage_posts`, `pages_read_engagement`, `pages_manage_metadata`,
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`,
   `instagram_manage_comments`, `instagram_manage_messages`, `pages_messaging`,
   `read_insights`, `business_management`.
4. **Advanced Access**: pedir *Advanced Access* (no solo Standard) para que funcione
   con cuentas fuera de la app.

---

## 8. Checklist para pasar a producción

- [ ] App tipo **Business** creada y asociada a un Business Portfolio verificado.
- [ ] `META_APP_SECRET`, `TOKEN_ENCRYPTION_KEY`, `META_WEBHOOK_VERIFY_TOKEN`,
      `CRON_SECRET` seteados en Vercel.
- [ ] Redirect URIs registradas exactamente.
- [ ] Privacy Policy + Terms URLs públicas.
- [ ] Webhook verificado (GET challenge OK) y campos suscritos.
- [ ] Business Verification aprobada.
- [ ] App Review aprobada para los permisos usados (Advanced Access).
- [ ] Crons configurados (`publish-scheduled`, `social-maintenance`) con `CRON_SECRET`.
- [ ] App en **Live Mode**.

---

## 9. Pruebas recomendadas

1. **OAuth**: conectar una Página propia; verificar que aparezcan la Página y su IG
   Business vinculado en *Cuentas*.
2. **Publicación inmediata**: publicar una imagen en FB e IG; verificar `externalId`.
3. **Programación**: programar a +2 min; confirmar que el cron `publish-scheduled` la
   publica y actualiza el estado.
4. **Webhook**: comentar en un post de prueba; verificar que aparezca en *Bandeja →
   Comentarios* y una fila `processed` en *Auditoría → Webhooks recibidos*.
5. **Responder/ocultar** comentario; **responder** un DM.
6. **Métricas**: *Actualizar métricas* y confirmar snapshot en el dashboard.
7. **Token**: forzar expiración y verificar que `social-maintenance` marque la cuenta
   como *reconectar*.
8. **Firma inválida**: postear al webhook sin firma válida → debe responder `403`.

---

## 10. Errores comunes

| Síntoma | Causa / solución |
|---------|------------------|
| `redirect_uri` mismatch | La URI no coincide con la registrada. Revisar `APP_URL`. |
| `META_APP_SECRET no configurada` | Setear la env var en Vercel. |
| Webhook verify falla (403) | `META_WEBHOOK_VERIFY_TOKEN` no coincide. |
| Insights vacíos | Falta `read_insights` / `instagram_manage_insights` aprobado. |
| No se pueden leer comentarios/DMs | Falta permiso de comments/messages + suscripción del webhook. |
| Publica FB pero no IG | La cuenta IG debe ser **Business/Creator** y estar vinculada a la Página. |
