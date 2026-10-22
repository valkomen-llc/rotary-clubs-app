# Persistencia del Editor Visual de Plantillas — v4.1235

Editor: `src/components/admin/email-marketing/VisualTemplateEditor.tsx`.
Lo abren Rotary en Acción (`RotaryMarketingInteligente.tsx`, con
`campaignContext`, para los tres canales: `rotary_en_accion`,
`directorio_clubes`, `feria_proyectos`) y Plantillas de Email Marketing
(`TemplatesTab.tsx`, con `templateId`).

## El incidente: «guardo, recargo y vuelve la versión anterior»

«Guardar y Sincronizar» SÍ escribía en la base
(`POST /rotary-en-accion/marketing/campaigns/:id/apply-template` →
`UPDATE "RotaryMarketingCampaign" SET design=…`). Lo que lo borraba era
`server/lib/ensureRotaryMarketingSchema.js`: su `_ready` es de módulo, así que
**corre en cada arranque en frío** (Vercel levanta instancias nuevas sin aviso),
y sus semillas hacían `ON CONFLICT (code) DO UPDATE` con:

- `design`/`contentHtml` reescritos para **toda campaña en `draft`** (los tres canales);
- en Directorio y Feria, además `name`, `subject`, `preheader` y
  `messageCentral` reescritos **siempre**, sin mirar el estado;
- las tres plantillas maestras (`tpl-*-master` en `ContentActivationTemplate`)
  con `design = EXCLUDED.design` sin condición.

Mientras la misma instancia seguía viva todo parecía guardado; al recargar, salir
o volver más tarde, otra instancia ya había re-sembrado. Por eso el síntoma era
intermitente y el guardado "respondía bien".

## La regla

- **`RotaryMarketingCampaign."customizedAt"`**: lo fija `applyCampaignTemplate`
  (y `declareAbWinner`, que también cambia el asunto). Con fecha, **ninguna
  semilla vuelve a tocar** diseño, HTML, nombre, asunto, preheader ni mensaje
  central. Un borrador sin personalizar sigue recibiendo el copy del código.
- **Rescate de lo editado antes de v4.1235**: el ensure marca
  `customizedAt = "updatedAt"` donde `"updatedAt" > "createdAt" + 1 minuto`
  (las semillas nunca tocan `updatedAt`). Corre ANTES del bucle de semillas.
  Es conservador: una campaña sólo aprobada/programada también queda marcada,
  y eso sólo significa que se conserva lo que hay en la base.
- **Plantillas maestras**: la semilla sólo actualiza
  `WHERE COALESCE(version,1) <= 1`. Guardar (`saveMasterTemplate` o
  `updateTemplate`) sube la versión, y desde ahí la semilla no la toca.
- Cualquier semilla nueva de una tabla que el editor escriba **tiene que
  respetar estas marcas**. Una semilla con `DO UPDATE` sin condición sobre un
  campo editable es el mismo bug otra vez.

## Guardado en el editor

- "Foto" serializada `{nombre, asunto, preheader, diseño}`; **«Cambios sin
  guardar»** = la foto actual ≠ la última que el servidor confirmó.
- El éxito sólo se da por bueno si el servidor devuelve la fila
  (`data.campaign.id` en campañas, `data.template` en plantillas).
- Los guardados van **en fila** (`saveChainRef`) y cada uno manda el estado más
  reciente (`latestStateRef`): una respuesta tardía no puede pisar una edición
  posterior. `saveUntilClean` repite si se editó durante el guardado.
- **Autoguardado** (4 s sin cambios) **sólo en campañas**: en plantillas cada
  guardado crea una versión y no conviene llenarlas de intermedias. Tras un
  error no reintenta en bucle; se reanuda al volver a editar.
- Salida: «Volver» pregunta (guardar / descartar); `beforeunload` mientras haya
  algo pendiente; y si el editor se desmonta sin pasar por «Volver» (navegación
  interna) o la página se cierra, en campañas se envía lo pendiente con
  `keepalive` **sin HTML** — el servidor lo compila desde el diseño
  (`applyCampaignTemplate` ya no deja `contentHtml` desfasado de `design`).
  Si la persona eligió descartar, no se envía nada.
- **Correo de prueba**: si hay cambios, guarda primero y envía el asunto y el
  HTML **persistidos**; si el guardado falla, no envía.
- `applyCampaignTemplate` responde 400 a un diseño sin `blocks` (no pisa nada) y
  un fallo al resolver el club o sincronizar con Email Marketing ya no se
  reporta como fallo del guardado (la campaña ya quedó escrita).

## Pruebas

Ambas contra **Postgres real** (las semillas son SQL: un stub no prueba nada) y
simulando arranques en frío con un import nuevo del módulo del ensure. Borran y
recrean las tablas de marketing de la base indicada: usar una base de prueba.

```
TEST_DATABASE_URL=postgres://…/base_de_prueba npm run test:template:persistence
TEST_DATABASE_URL=postgres://…/base_de_prueba npm run test:template:persistence:ui
```

- `test:template:persistence` (55): guardar en los tres canales, dos arranques
  en frío, lo que devuelve `GET /marketing/campaigns`, rescate de ediciones
  previas, maestra guardada, guardado sin HTML y diseño inválido.
- `test:template:persistence:ui` (52): el editor real en Chromium con los
  controladores reales detrás. Por canal: editar asunto/preheader, texto en
  negrilla, agregar y subir un bloque, guardar, arranque en frío, recargar y
  verificar lienzo y orden. Además autoguardado, salir guardando/descartando,
  `beforeunload`, desmontaje con keepalive, correo de prueba y error de guardado.

Con el servidor anterior a v4.1235 la primera falla en los tres canales tras el
arranque (diseño re-sembrado; en Directorio el asunto vuelve a «Haz que tu club
sea reconocido…») y la de UI no encuentra el bloque editado al recargar.
