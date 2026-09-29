// Tablas de Campañas de Activación de Contenido (v4.1117).
// Patrón runtime idempotente: sin FK, sin prisma db push. Relaciones por columna.
import db from './db.js';

let _ready = false;
const EXPECTED = [
  'ContentActivationCampaign',
  'ContentActivationExecution',
  'ContentActivationEnrollment',
  'ContentActivationEvent',
  'ContentActivationLinkToken',
  'ClubParticipationProfile',
];

export async function ensureContentActivationSchema() {
  if (_ready) return;
  try {
    const r = await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [EXPECTED]
    );
    const have = new Set((r.rows || []).map((x) => x.table_name));
    if (EXPECTED.every((t) => have.has(t))) {
      // Aun así asegurar columnas de atribución en ContributionSubmission.
      await ensureSubmissionColumns().catch(() => {});
      await ensureCampaignColumns().catch(() => {});
      _ready = true;
      return;
    }
  } catch { /* seguir a crear */ }

  await db.query(`CREATE TABLE IF NOT EXISTS "ContentActivationCampaign" (
    id TEXT PRIMARY KEY,
    "clubId" TEXT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    objetivo TEXT DEFAULT '',
    "contributionCampaignId" TEXT,
    "startAt" TIMESTAMPTZ,
    "endAt" TIMESTAMPTZ,
    timezone TEXT DEFAULT 'America/Bogota',
    frecuencia TEXT DEFAULT 'mensual',
    "customDays" INT,
    canales TEXT[] DEFAULT ARRAY['whatsapp'],
    "audienceDef" JSONB DEFAULT '{"match":"all","rules":[]}',
    "flowDef" JSONB DEFAULT '[]',
    "followRules" JSONB DEFAULT '{}',
    variables JSONB DEFAULT '{}',
    status TEXT DEFAULT 'borrador',
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS "ContentActivationExecution" (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "periodoLabel" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ,
    "endAt" TIMESTAMPTZ,
    status TEXT DEFAULT 'programada',
    stats JSONB DEFAULT '{}',
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS "ContentActivationEnrollment" (
    id TEXT PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "siteId" TEXT,
    "siteType" TEXT DEFAULT 'club',
    channel TEXT DEFAULT 'whatsapp',
    status TEXT DEFAULT 'programada',
    attempts INT DEFAULT 0,
    "lastInteractionAt" TIMESTAMPTZ,
    "nextActionAt" TIMESTAMPTZ,
    "suppressionReason" TEXT,
    "contactSnapshot" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE("executionId","contactId")
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ca_enroll_exec ON "ContentActivationEnrollment"("executionId")`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ca_enroll_site ON "ContentActivationEnrollment"("siteId")`);
  await db.query(`CREATE TABLE IF NOT EXISTS "ContentActivationEvent" (
    id TEXT PRIMARY KEY,
    "enrollmentId" TEXT,
    "executionId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    type TEXT NOT NULL,
    channel TEXT,
    "messageLogId" TEXT,
    metadata JSONB DEFAULT '{}',
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ca_event_exec ON "ContentActivationEvent"("executionId")`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_ca_event_enroll ON "ContentActivationEvent"("enrollmentId")`);
  await db.query(`CREATE TABLE IF NOT EXISTS "ContentActivationLinkToken" (
    "tokenHash" TEXT PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "expiresAt" TIMESTAMPTZ,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS "ClubParticipationProfile" (
    "siteId" TEXT PRIMARY KEY,
    "siteType" TEXT DEFAULT 'club',
    "lastSubmissionAt" TIMESTAMPTZ,
    "submissionCount" INT DEFAULT 0,
    "campaignsReceived" INT DEFAULT 0,
    "messagesSent" INT DEFAULT 0,
    delivered INT DEFAULT 0,
    "messagesRead" INT DEFAULT 0,
    replied INT DEFAULT 0,
    clicks INT DEFAULT 0,
    "formsStarted" INT DEFAULT 0,
    "formsCompleted" INT DEFAULT 0,
    "articlesGenerated" INT DEFAULT 0,
    "articlesApproved" INT DEFAULT 0,
    "articlesPublished" INT DEFAULT 0,
    "lastParticipationAt" TIMESTAMPTZ,
    categorias JSONB DEFAULT '[]',
    score INT DEFAULT 0,
    level TEXT DEFAULT 'sin_reciente',
    "scoreDetail" JSONB DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);
  await ensureCampaignColumns().catch(() => {});
  await ensureSubmissionColumns().catch(() => {});
  _ready = true;
}

async function ensureCampaignColumns() {
  const cols = [
    ['scopeDef', 'JSONB'],
    ['audienceMode', 'TEXT'],
    ['audienceSnapshot', 'JSONB'],
    ['excludedContactIds', 'TEXT[]'],
    ['manualRecipients', 'JSONB'],
    ['savedSegmentId', 'TEXT'],
    ['contentDef', 'JSONB'],
    ['senderSiteId', 'TEXT'],
  ];
  for (const [col, type] of cols) {
    await db.query(
      `ALTER TABLE "ContentActivationCampaign" ADD COLUMN IF NOT EXISTS "${col}" ${type}`
    ).catch(() => {});
  }
}

async function ensureSubmissionColumns() {
  const cols = [
    ['activationCampaignId', 'TEXT'],
    ['activationExecutionId', 'TEXT'],
    ['activationEnrollmentId', 'TEXT'],
    ['activationChannel', 'TEXT'],
    ['activationMessageLogId', 'TEXT'],
    ['activationTokenHash', 'TEXT'],
  ];
  for (const [col, type] of cols) {
    await db.query(
      `ALTER TABLE "ContributionSubmission" ADD COLUMN IF NOT EXISTS "${col}" ${type}`
    ).catch(() => {});
  }
}
