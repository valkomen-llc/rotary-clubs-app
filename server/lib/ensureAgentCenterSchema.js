// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — el esquema, en runtime (v4.1315.0)
//
// Tablas fuera de Prisma (`CREATE TABLE IF NOT EXISTS`, sin FK), creadas por
// fases: una tabla vacía promete una función, así que cada fase crea sólo las
// suyas.
//
// Fase 1 — Registro (v4.1315.0):
//   AgentTemplate          la identidad de un agente: equipo, nivel, origen,
//                          estado y su borrador de trabajo (`draft`).
//   AgentTemplateVersion   cada versión PUBLICADA, inmutable.
//   AgentSkill             bloques de instrucciones reutilizables (las
//                          habilidades de .agent/skills y las propias).
//   AgentInstallation      dónde trabaja: la plataforma o un sitio, encendida o
//                          no, fijada a una versión, con sus ajustes.
//   AgentAuditLog          quién cambió qué de la configuración, antes y después.
//   AgentSiteTypePolicy    con qué TIPOS DE SITIO se integran los agentes.
//   AgentSetting           ajustes de la plataforma (interruptor general…).
//
// Fase 2 — Runtime (v4.1316.0):
//   AgentToolGrant     qué herramienta usa cada instalación y en qué modo.
//   AgentTask          la cola: estado, intentos, lease, idempotencia.
//   AgentRun           cada ejecución de una tarea (modelo, tokens, costo).
//   AgentRunStep       cada paso: llamada al modelo o a una herramienta.
//   AgentApproval      acciones propuestas con su carga CONGELADA y su huella.
//   AgentWorkflowRun   cada ejecución de un workflow (los pilotos) y su informe.
//   AgentSchedule      programaciones: diaria, semanal, cada N min, por evento.
//   AgentEvent         la bandeja de eventos que emiten los módulos.
//
// Fase 3 — Despliegues (v4.1317.0):
//   AgentRollout        un despliegue con nombre: qué agentes, a qué tipos de
//                       sitio o sitios, en qué oleadas, en qué estado.
//   AgentRolloutTarget  cada sitio del despliegue, su oleada y qué se le
//                       instaló (para revertir exactamente eso).
//
// La tabla heredada "Agent" NO se toca: cada fila migrada queda referida por
// `legacyAgentId`, y publicar una versión la actualiza (espejo) para que el
// chat de siempre siga respondiendo con lo publicado durante la transición.
//
// Están en la lista del guardián de `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908). Lo fija
// `npm run test:agents:registry`.
export const OWNED_COLUMNS = {
    AgentTemplate: [],
    AgentTemplateVersion: [],
    AgentSkill: [],
    AgentInstallation: [],
    AgentAuditLog: [],
    AgentSiteTypePolicy: [],
    AgentSetting: [],
    // Fase 2 — runtime (v4.1316.0)
    AgentToolGrant: [],
    AgentTask: [],
    AgentRun: [],
    AgentRunStep: [],
    AgentApproval: [],
    AgentWorkflowRun: [],
    AgentSchedule: [],
    AgentEvent: [],
    // Fase 3 — despliegues (v4.1317.0)
    AgentRollout: [],
    AgentRolloutTarget: [],
};
const TABLES = Object.keys(OWNED_COLUMNS);

export async function ensureAgentCenterSchema() {
    if (_ready) return;
    const columnas = Object.entries(OWNED_COLUMNS).flatMap(([t, cols]) => cols.map(c => `${t}.${c}`));
    const { rows } = await db.query(
        `SELECT (SELECT COUNT(*) FROM unnest($1::text[]) AS t(name) WHERE to_regclass('public."' || t.name || '"') IS NOT NULL)::int AS tablas,
                (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_name || '.' || column_name = ANY($2))::int AS columnas`,
        [TABLES, columnas]
    );
    if (rows[0]?.tablas === TABLES.length && rows[0]?.columnas === columnas.length) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentTemplate" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            key TEXT NOT NULL UNIQUE,
            team TEXT NOT NULL DEFAULT 'comunicaciones',
            level TEXT NOT NULL DEFAULT 'any',
            origin TEXT NOT NULL DEFAULT 'custom',
            status TEXT NOT NULL DEFAULT 'draft',
            "sourceRef" JSONB NOT NULL DEFAULT '{}'::jsonb,
            draft JSONB NOT NULL DEFAULT '{}'::jsonb,
            "currentVersionId" TEXT,
            "allowedSiteTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            "ownerSiteId" TEXT,
            "legacyAgentId" TEXT UNIQUE,
            "avatarSeed" TEXT,
            "avatarColor" TEXT,
            "sortOrder" INT NOT NULL DEFAULT 0,
            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentTemplate_team_idx" ON "AgentTemplate" (team, "sortOrder")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentTemplateVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "templateId" TEXT NOT NULL,
            version INT NOT NULL,
            snapshot JSONB NOT NULL,
            changelog TEXT,
            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("templateId", version)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentSkill" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT,
            body TEXT NOT NULL DEFAULT '',
            origin TEXT NOT NULL DEFAULT 'custom',
            "sourceRef" JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentInstallation" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "templateId" TEXT NOT NULL,
            "versionId" TEXT,
            "scopeType" TEXT NOT NULL DEFAULT 'site',
            "siteId" TEXT,
            enabled BOOLEAN NOT NULL DEFAULT false,
            "disabledReason" TEXT,
            overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
            "modelPolicy" JSONB NOT NULL DEFAULT '{}'::jsonb,
            budget JSONB NOT NULL DEFAULT '{}'::jsonb,
            "responsibleUserId" TEXT,
            "rolloutId" TEXT,
            "legacyAgentId" TEXT UNIQUE,
            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    // Una plantilla se instala UNA vez por ámbito. La plataforma usa '' como
    // sitio para que el índice único también la cubra (NULL no choca con NULL).
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "AgentInstallation_scope_uq" ON "AgentInstallation" ("templateId", "scopeType", COALESCE("siteId", ''))`);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentInstallation_site_idx" ON "AgentInstallation" ("siteId")`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentAuditLog" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "actorId" TEXT,
            "actorRole" TEXT,
            "entityType" TEXT NOT NULL,
            "entityId" TEXT,
            action TEXT NOT NULL,
            "siteId" TEXT,
            before JSONB,
            after JSONB,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentAuditLog_created_idx" ON "AgentAuditLog" ("createdAt" DESC)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentSiteTypePolicy" (
            "siteType" TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT false,
            "allowedTeams" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            notes TEXT,
            "updatedBy" TEXT,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentSetting" (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL DEFAULT '{}'::jsonb,
            "updatedBy" TEXT,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    // ── Fase 2 ──
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentToolGrant" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "installationId" TEXT NOT NULL,
            tool TEXT NOT NULL,
            mode TEXT NOT NULL DEFAULT 'read',
            "grantedBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("installationId", tool)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentTask" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "installationId" TEXT NOT NULL,
            "siteId" TEXT,
            kind TEXT NOT NULL DEFAULT 'goal',
            title TEXT,
            input JSONB NOT NULL DEFAULT '{}'::jsonb,
            output JSONB,
            status TEXT NOT NULL DEFAULT 'queued',
            priority INT NOT NULL DEFAULT 5,
            attempts INT NOT NULL DEFAULT 0,
            "maxAttempts" INT NOT NULL DEFAULT 3,
            "leaseUntil" TIMESTAMPTZ,
            "dueAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "parentTaskId" TEXT,
            "delegationChain" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            "workflowRunId" TEXT,
            "requestedBy" TEXT,
            "idempotencyKey" TEXT UNIQUE,
            "lastError" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "finishedAt" TIMESTAMPTZ
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentTask_claim_idx" ON "AgentTask" (status, "dueAt", priority)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentTask_site_idx" ON "AgentTask" ("siteId", "createdAt" DESC)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentRun" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "taskId" TEXT NOT NULL,
            "installationId" TEXT,
            "siteId" TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            model TEXT,
            provider TEXT,
            "inputTokens" INT NOT NULL DEFAULT 0,
            "outputTokens" INT NOT NULL DEFAULT 0,
            "costUsd" NUMERIC(14,6) NOT NULL DEFAULT 0,
            steps INT NOT NULL DEFAULT 0,
            error TEXT,
            "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "finishedAt" TIMESTAMPTZ
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentRun_task_idx" ON "AgentRun" ("taskId")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentRun_started_idx" ON "AgentRun" ("startedAt" DESC)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentRunStep" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "runId" TEXT NOT NULL,
            seq INT NOT NULL,
            kind TEXT NOT NULL,
            tool TEXT,
            args JSONB,
            result JSONB,
            ok BOOLEAN NOT NULL DEFAULT true,
            "latencyMs" INT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentRunStep_run_idx" ON "AgentRunStep" ("runId", seq)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentApproval" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "taskId" TEXT,
            "runId" TEXT,
            "installationId" TEXT,
            "siteId" TEXT,
            tool TEXT NOT NULL,
            args JSONB NOT NULL DEFAULT '{}'::jsonb,
            hash TEXT NOT NULL,
            risk TEXT NOT NULL,
            summary TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            "decidedBy" TEXT,
            "decidedAt" TIMESTAMPTZ,
            "decisionNote" TEXT,
            result JSONB,
            "expiresAt" TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentApproval_status_idx" ON "AgentApproval" (status, "createdAt" DESC)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentWorkflowRun" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "workflowKey" TEXT NOT NULL,
            "siteId" TEXT,
            "installationId" TEXT,
            trigger TEXT NOT NULL DEFAULT 'manual',
            input JSONB NOT NULL DEFAULT '{}'::jsonb,
            status TEXT NOT NULL DEFAULT 'running',
            report JSONB,
            "aiSummary" TEXT,
            "aiNote" TEXT,
            "scheduleId" TEXT,
            "requestedBy" TEXT,
            "idempotencyKey" TEXT UNIQUE,
            error TEXT,
            "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "finishedAt" TIMESTAMPTZ
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentWorkflowRun_site_idx" ON "AgentWorkflowRun" ("siteId", "startedAt" DESC)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentSchedule" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "workflowKey" TEXT NOT NULL,
            "siteId" TEXT NOT NULL,
            cadence TEXT NOT NULL,
            input JSONB NOT NULL DEFAULT '{}'::jsonb,
            enabled BOOLEAN NOT NULL DEFAULT true,
            "nextRunAt" TIMESTAMPTZ,
            "lastRunAt" TIMESTAMPTZ,
            "lastRunId" TEXT,
            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            type TEXT NOT NULL,
            "siteId" TEXT,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            "processedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AgentEvent_pending_idx" ON "AgentEvent" ("processedAt", "createdAt")`);

    // ── Fase 3 ──
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentRollout" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name TEXT NOT NULL,
            preset TEXT,
            "templateKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            "siteTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            "siteIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            platform BOOLEAN NOT NULL DEFAULT false,
            waves JSONB NOT NULL DEFAULT '[]'::jsonb,
            "autoActivate" BOOLEAN NOT NULL DEFAULT false,
            status TEXT NOT NULL DEFAULT 'draft',
            "currentWave" INT NOT NULL DEFAULT 0,
            "totalWaves" INT NOT NULL DEFAULT 0,
            "targetCount" INT NOT NULL DEFAULT 0,
            notes TEXT,
            "createdBy" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AgentRolloutTarget" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "rolloutId" TEXT NOT NULL,
            "siteId" TEXT,
            wave INT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            "installationIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
            reason TEXT,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("rolloutId", "siteId")
        )
    `);

    _ready = true;
}

export default { ensureAgentCenterSchema, OWNED_COLUMNS };
