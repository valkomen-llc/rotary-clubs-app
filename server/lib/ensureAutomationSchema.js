// Crea en runtime, de forma perezosa e idempotente, las tablas del motor de
// automatización del WhatsApp CRM.
//
// POR QUÉ EN RUNTIME: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable de CLAUDE.md), así que una tabla nueva del
// schema no aparece sola en producción. Mismo patrón que `ensureTrainingSchema`,
// `ensureReelSchema` y las `ProjectFair*`.
//
// OJO CON LAS COLUMNAS DE `WhatsAppContact`: esa tabla SÍ la gestiona Prisma
// (modelo `CrmContact`, con `@@map`). Las columnas que agrega este archivo están
// declaradas ADEMÁS en `schema.prisma`, y tiene que seguir siendo así. El guardián
// `db-push-guard.mjs` compara TABLAS, no columnas: una columna que exista sólo
// acá la borraría el primer `npm run db:push` sin que nada avise.
//
// Sin claves foráneas a propósito, igual que en el resto de los módulos fuera de
// Prisma: las relaciones se resuelven por columna y así no importa el orden de
// creación ni se arriesgan cascadas de borrado entre módulos.
import db from './db.js';

let _ready = false;

// Objetos que este archivo crea. La comprobación previa (v4.659) los cuenta
// contra el catálogo para no gastar ~20 viajes a la base en cada arranque en
// frío. NO es un número de versión: es la lista real de lo que hay abajo, y hay
// que ampliarla al agregar algo o la comprobación lo dará por presente.
const EXPECTED_TABLES = [
  'CrmLifecycleState',
  'CrmEvent',
  'CrmJourney',
  'CrmJourneyRun',
  'CrmJourneyStep',
  'CrmSuppression',
  'CrmAlert',
  // Fase 3 — bandeja de conversaciones y enrutamiento (v4.696)
  'CrmConversation',
  'CrmConversationNote',
  'CrmConversationEvent',
  'CrmRoutingRule',
  'CrmAgent',
];

const EXPECTED_COLUMNS = [
  ['WhatsAppContact', 'siteId'],
  ['WhatsAppContact', 'siteType'],
  ['WhatsAppContact', 'orgRole'],
  ['WhatsAppContact', 'language'],
  ['WhatsAppContact', 'consentState'],
  ['WhatsAppContact', 'consentSource'],
  ['WhatsAppContact', 'consentAt'],
  ['WhatsAppContact', 'consentCategories'],
  ['WhatsAppContact', 'lastInboundAt'],
  ['WhatsAppMessageLog', 'journeyId'],
  ['WhatsAppMessageLog', 'journeyRunId'],
  // Campañas a varias listas (v4.921) — mismo patrón que EmailCampaign.listIds
  ['WhatsAppCampaign', 'listIds'],
  // Biblioteca de plantillas (v4.701)
  ['WhatsAppTemplate', 'folder'],
  ['WhatsAppTemplate', 'variableTokens'],
  ['WhatsAppTemplate', 'variableSamples'],
  ['WhatsAppTemplate', 'rejectionReason'],
  ['WhatsAppTemplate', 'submittedAt'],
];

export async function ensureAutomationSchema() {
  if (_ready) return;

  // Dos consultas al catálogo deciden si hay algo que hacer.
  const [tablesR, colsR] = await Promise.all([
    db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [EXPECTED_TABLES]
    ),
    db.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [[...new Set(EXPECTED_COLUMNS.map(([t]) => t))]]
    ),
  ]);
  const haveTables = new Set(tablesR.rows.map(r => r.table_name));
  const haveCols = new Set(colsR.rows.map(r => `${r.table_name}.${r.column_name}`));
  const tablesOk = EXPECTED_TABLES.every(t => haveTables.has(t));
  const colsOk = EXPECTED_COLUMNS.every(([t, c]) => haveCols.has(`${t}.${c}`));
  if (tablesOk && colsOk) { _ready = true; return; }

  await db.query(`
    -- Estado del ciclo de vida por sitio. Una fila por Club o District.
    -- Guarda el estado ANTERIOR porque el motor dispara por transición, no por
    -- estado: "está vencido" no es un evento, "acaba de vencer" sí.
    CREATE TABLE IF NOT EXISTS "CrmLifecycleState" (
      id TEXT PRIMARY KEY,
      "siteId" TEXT NOT NULL,
      "siteType" TEXT NOT NULL DEFAULT 'club',
      state TEXT NOT NULL,
      "manualState" TEXT,
      reason TEXT,
      since TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "previousState" TEXT,
      "previousStateSince" TIMESTAMP(3),
      signals JSONB NOT NULL DEFAULT '{}'::jsonb,
      "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CrmLifecycleState_site_key" ON "CrmLifecycleState"("siteId");
    CREATE INDEX IF NOT EXISTS "CrmLifecycleState_state_idx" ON "CrmLifecycleState"(state);

    -- Bitácora de eventos del sistema. Es la entrada del motor.
    -- La columna dedupeKey con índice único es lo que hace que registrar dos veces el
    -- mismo hecho (dos sondeos, un reintento de webhook) no dispare dos veces.
    CREATE TABLE IF NOT EXISTS "CrmEvent" (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      "siteId" TEXT,
      "siteType" TEXT DEFAULT 'club',
      "contactId" TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      "dedupeKey" TEXT,
      "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "processedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CrmEvent_dedupe_key" ON "CrmEvent"("dedupeKey") WHERE "dedupeKey" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "CrmEvent_pending_idx" ON "CrmEvent"("processedAt","occurredAt") WHERE "processedAt" IS NULL;
    CREATE INDEX IF NOT EXISTS "CrmEvent_site_idx" ON "CrmEvent"("siteId","type");

    -- Definición de un recorrido. La columna nodes es el grafo completo en JSON: el
    -- constructor visual lo escribe y el motor lo recorre. Se guarda como
    -- documento y no en tablas normalizadas porque el grafo se lee y se escribe
    -- SIEMPRE entero, y normalizarlo obligaría a rehacer el esquema cada vez que
    -- aparezca un tipo de nodo nuevo.
    CREATE TABLE IF NOT EXISTS "CrmJourney" (
      id TEXT PRIMARY KEY,
      "clubId" TEXT NOT NULL,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      goal TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      audience JSONB NOT NULL DEFAULT '{}'::jsonb,
      trigger JSONB NOT NULL DEFAULT '{}'::jsonb,
      nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      "isSeed" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CrmJourney_club_key" ON "CrmJourney"("clubId", key);
    CREATE INDEX IF NOT EXISTS "CrmJourney_status_idx" ON "CrmJourney"(status);

    -- Inscripción de un contacto en un recorrido. Es la unidad de trabajo del
    -- motor: el cron busca las que tengan waitUntil vencido.
    -- La columna dedupeKey evita la doble inscripción (mismo recorrido, mismo contacto,
    -- mismo disparador), que es el defecto más caro de este tipo de motor.
    CREATE TABLE IF NOT EXISTS "CrmJourneyRun" (
      id TEXT PRIMARY KEY,
      "journeyId" TEXT NOT NULL,
      "clubId" TEXT NOT NULL,
      "siteId" TEXT,
      "siteType" TEXT DEFAULT 'club',
      "contactId" TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      "currentNodeId" TEXT,
      "waitUntil" TIMESTAMP(3),
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      "dedupeKey" TEXT,
      "lockedAt" TIMESTAMP(3),
      attempts INTEGER NOT NULL DEFAULT 0,
      "lastError" TEXT,
      "exitReason" TEXT,
      "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CrmJourneyRun_dedupe_key" ON "CrmJourneyRun"("dedupeKey") WHERE "dedupeKey" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "CrmJourneyRun_due_idx" ON "CrmJourneyRun"(status, "waitUntil");
    CREATE INDEX IF NOT EXISTS "CrmJourneyRun_journey_idx" ON "CrmJourneyRun"("journeyId", status);
    CREATE INDEX IF NOT EXISTS "CrmJourneyRun_contact_idx" ON "CrmJourneyRun"("contactId");
    CREATE INDEX IF NOT EXISTS "CrmJourneyRun_site_idx" ON "CrmJourneyRun"("siteId");

    -- Traza de cada nodo ejecutado. Es lo que permite responder "por qué este
    -- club recibió esto" sin reproducir el estado del motor.
    CREATE TABLE IF NOT EXISTS "CrmJourneyStep" (
      id TEXT PRIMARY KEY,
      "runId" TEXT NOT NULL,
      "journeyId" TEXT NOT NULL,
      "nodeId" TEXT,
      "nodeType" TEXT,
      outcome TEXT NOT NULL,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      "messageLogId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "CrmJourneyStep_run_idx" ON "CrmJourneyStep"("runId","createdAt");
    CREATE INDEX IF NOT EXISTS "CrmJourneyStep_journey_idx" ON "CrmJourneyStep"("journeyId","outcome");

    -- Lista de exclusión global. Vive aparte del contacto a propósito: una baja
    -- tiene que sobrevivir al borrado y al re-alta del contacto, que es
    -- exactamente como se vuelve a escribir sin querer a quien pidió no recibir.
    CREATE TABLE IF NOT EXISTS "CrmSuppression" (
      id TEXT PRIMARY KEY,
      "clubId" TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      reason TEXT NOT NULL DEFAULT 'opt_out',
      source TEXT NOT NULL DEFAULT 'manual',
      note TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CrmSuppression_club_phone_key" ON "CrmSuppression"("clubId", phone) WHERE phone IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "CrmSuppression_club_idx" ON "CrmSuppression"("clubId");

    -- Alertas internas para el equipo (no se le envían al club).
    CREATE TABLE IF NOT EXISTS "CrmAlert" (
      id TEXT PRIMARY KEY,
      "clubId" TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      detail TEXT,
      "siteId" TEXT,
      "entityId" TEXT,
      "dedupeKey" TEXT,
      "resolvedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CrmAlert_dedupe_key" ON "CrmAlert"("dedupeKey") WHERE "dedupeKey" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "CrmAlert_open_idx" ON "CrmAlert"("clubId","createdAt") WHERE "resolvedAt" IS NULL;
  `);

  // Columnas nuevas del contacto. Declaradas también en `schema.prisma`.
  // `consentState`: granted | denied | unknown. Arranca en 'unknown' a propósito
  // — dar por otorgado un consentimiento que nadie registró es justamente lo que
  // este campo existe para impedir.
  await db.query(`
    ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "siteId" TEXT;
    ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "siteType" TEXT;
    ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "orgRole" TEXT;
    ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "language" TEXT;
    ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "consentState" TEXT NOT NULL DEFAULT 'unknown';
    ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "consentSource" TEXT;
    ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3);
    ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "consentCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];
    ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "lastInboundAt" TIMESTAMP(3);
    CREATE INDEX IF NOT EXISTS "idx_wa_contact_site" ON "WhatsAppContact"("siteId");
    CREATE INDEX IF NOT EXISTS "idx_wa_contact_consent" ON "WhatsAppContact"("consentState");
  `);

  // ── Fase 3: bandeja de conversaciones, enrutamiento y agentes ─────────────
  await db.query(`
    -- Una conversación por contacto. NO guarda los mensajes: esos ya viven en
    -- "WhatsAppMessageLog" y duplicarlos daría dos verdades sobre el mismo hilo.
    -- Esta fila es el ESTADO del hilo: en qué punto de atención está, quién lo
    -- tiene, qué quería la persona y qué sitio hay detrás.
    CREATE TABLE IF NOT EXISTS "CrmConversation" (
      id TEXT PRIMARY KEY,
      "clubId" TEXT NOT NULL,
      "contactId" TEXT NOT NULL,
      "siteId" TEXT,
      "siteType" TEXT DEFAULT 'club',
      state TEXT NOT NULL DEFAULT 'nuevo',
      intent TEXT,
      "intentMethod" TEXT,
      "intentAt" TIMESTAMP(3),
      team TEXT,
      "assignedTo" TEXT,
      "assignedAt" TIMESTAMP(3),
      "assignedBy" TEXT,
      tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      priority TEXT NOT NULL DEFAULT 'normal',
      "lastInboundAt" TIMESTAMP(3),
      "lastOutboundAt" TIMESTAMP(3),
      "botHandled" BOOLEAN NOT NULL DEFAULT false,
      "escalatedAt" TIMESTAMP(3),
      "technicalRequestId" TEXT,
      "resolvedAt" TIMESTAMP(3),
      "closedAt" TIMESTAMP(3),
      "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    -- Un solo hilo ABIERTO por contacto. El índice único es PARCIAL: al cerrarse
    -- la conversación deja de ocupar el lugar y un mensaje nuevo abre otra, con
    -- lo cual el historial queda separado por episodio en vez de ser un hilo
    -- eterno. OJO: por ser parcial, cualquier ON CONFLICT contra él tiene que
    -- repetir el predicado (mismo error que costó una corrección en v4.648).
    CREATE UNIQUE INDEX IF NOT EXISTS "CrmConversation_open_key"
      ON "CrmConversation"("clubId","contactId") WHERE "closedAt" IS NULL;
    CREATE INDEX IF NOT EXISTS "CrmConversation_state_idx" ON "CrmConversation"(state,"lastInboundAt");
    CREATE INDEX IF NOT EXISTS "CrmConversation_assignee_idx" ON "CrmConversation"("assignedTo",state);
    CREATE INDEX IF NOT EXISTS "CrmConversation_site_idx" ON "CrmConversation"("siteId");

    -- Notas internas. NUNCA se le muestran al contacto: por eso viven acá y no
    -- como un mensaje del hilo.
    CREATE TABLE IF NOT EXISTS "CrmConversationNote" (
      id TEXT PRIMARY KEY,
      "conversationId" TEXT NOT NULL,
      "authorId" TEXT,
      "authorName" TEXT,
      body TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "CrmConversationNote_conv_idx" ON "CrmConversationNote"("conversationId","createdAt");

    -- Traza de la conversación: quién la tomó, quién la reasignó, cuándo cambió
    -- de estado. Es lo que permite responder "por qué esto quedó sin atender"
    -- sin reconstruirlo de memoria.
    CREATE TABLE IF NOT EXISTS "CrmConversationEvent" (
      id TEXT PRIMARY KEY,
      "conversationId" TEXT NOT NULL,
      type TEXT NOT NULL,
      "actorId" TEXT,
      "actorName" TEXT,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "CrmConversationEvent_conv_idx" ON "CrmConversationEvent"("conversationId","createdAt");

    -- Reglas de enrutamiento, evaluadas en orden. La primera que coincide gana.
    CREATE TABLE IF NOT EXISTS "CrmRoutingRule" (
      id TEXT PRIMARY KEY,
      "clubId" TEXT NOT NULL,
      name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      intents TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      audience JSONB NOT NULL DEFAULT '{}'::jsonb,
      team TEXT,
      "assignTo" TEXT,
      "assignMode" TEXT NOT NULL DEFAULT 'team',
      "priorityLevel" TEXT NOT NULL DEFAULT 'normal',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "CrmRoutingRule_club_idx" ON "CrmRoutingRule"("clubId",active,priority);

    -- Quién puede atender, de qué equipos y si está disponible. Es una tabla
    -- aparte de "User" a propósito: ser agente del CRM no es un rol del sitio
    -- sino una asignación operativa que se prende y se apaga (vacaciones, turnos)
    -- sin tocar los permisos de la persona.
    CREATE TABLE IF NOT EXISTS "CrmAgent" (
      id TEXT PRIMARY KEY,
      "clubId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "displayName" TEXT,
      teams TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      available BOOLEAN NOT NULL DEFAULT true,
      "maxOpen" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CrmAgent_club_user_key" ON "CrmAgent"("clubId","userId");
    CREATE INDEX IF NOT EXISTS "CrmAgent_available_idx" ON "CrmAgent"("clubId",available);
  `);

  // Trazabilidad del envío automático. Sin estas dos columnas, "cuánto rindió el
  // recorrido de renovación" habría que reconstruirlo cruzando `CrmJourneyStep`
  // con el log mensaje por mensaje. Declaradas también en `schema.prisma`.
  await db.query(`
    ALTER TABLE "WhatsAppMessageLog" ADD COLUMN IF NOT EXISTS "journeyId" TEXT;
    ALTER TABLE "WhatsAppMessageLog" ADD COLUMN IF NOT EXISTS "journeyRunId" TEXT;

    -- Campañas a VARIAS listas (v4.921). "listIds" es la verdad y "listId" se
    -- conserva como el primero, por compatibilidad — el mismo patrón que
    -- EmailCampaign.listIds (v4.575). Declarada ADEMÁS en schema.prisma (el
    -- guardián de db:push compara tablas, no columnas).
    ALTER TABLE "WhatsAppCampaign" ADD COLUMN IF NOT EXISTS "listIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
    CREATE INDEX IF NOT EXISTS "idx_wa_msglog_journey" ON "WhatsAppMessageLog"("journeyId","status");
  `);

  // Biblioteca de plantillas (v4.701). Declaradas también en `schema.prisma`.
  //
  // `folder` es la organización INTERNA del equipo (bienvenida, renovación…) y
  // NO la `category` de Meta, que sólo admite MARKETING/UTILITY/AUTHENTICATION.
  // Son dos cosas distintas y por eso son dos columnas: mezclarlas obligaría a
  // elegir entre organizar el trabajo y declararle a Meta la verdad de para qué
  // se usa la plantilla —y esa declaración define el precio por conversación.
  //
  // `variableTokens` es lo que ata cada {{n}} a un dato que el motor sabe
  // resolver. Sin esa columna, una plantilla con variables se puede aprobar pero
  // ningún recorrido puede alimentarla.
  //
  // El índice único de (clubId, name) refleja una regla de Meta: el nombre es
  // único por cuenta de WhatsApp Business. Sin él, dos plantillas con el mismo
  // nombre se guardan bien acá y la segunda es rechazada allá.
  await db.query(`
    ALTER TABLE "WhatsAppTemplate" ADD COLUMN IF NOT EXISTS "folder" TEXT;
    ALTER TABLE "WhatsAppTemplate" ADD COLUMN IF NOT EXISTS "variableTokens" TEXT;
    ALTER TABLE "WhatsAppTemplate" ADD COLUMN IF NOT EXISTS "variableSamples" TEXT;
    ALTER TABLE "WhatsAppTemplate" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
    ALTER TABLE "WhatsAppTemplate" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
    CREATE INDEX IF NOT EXISTS "idx_wa_template_folder" ON "WhatsAppTemplate"("clubId","folder");
    CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppTemplate_club_name_key" ON "WhatsAppTemplate"("clubId", name);
  `);

  // Índice que necesita el tope de frecuencia por contacto. `WhatsAppMessageLog`
  // sólo estaba indexada por clubId y por campaña; el guardrail consulta
  // "cuántos mensajes recibió ESTE contacto en los últimos N días" y sin esto
  // recorre la tabla entera en cada envío.
  await db.query(`
    CREATE INDEX IF NOT EXISTS "idx_wa_msglog_contact_created" ON "WhatsAppMessageLog"("contactId","createdAt");
  `);

  // Un contacto que ya pidió la baja queda registrado en la lista de exclusión.
  // Es una sola pasada de reconciliación, idempotente por el índice único.
  await db.query(`
    INSERT INTO "CrmSuppression" (id, "clubId", phone, reason, source, note)
    SELECT gen_random_uuid()::text, c."clubId", c.phone, 'opt_out', 'migration',
           'Baja previa a la lista de exclusión (optedOutAt)'
    FROM "WhatsAppContact" c
    WHERE c."optedOutAt" IS NOT NULL AND c.phone IS NOT NULL
    ON CONFLICT DO NOTHING;
  `).catch(() => {});

  _ready = true;
}

export default ensureAutomationSchema;
