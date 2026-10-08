// Esquema Rotary en Acción (v4.1118): taxonomías, configuración, borradores +
// columnas de clasificación/impacto/IA en ContributionSubmission y UTM en
// tokens de activación. Runtime idempotente, sin FK, sin Prisma.
import db from './db.js';
import { DEFAULT_TIPOS, DEFAULT_AREAS, DEFAULT_PROGRAMAS, DEFAULT_TEMAS, DEFAULT_PHOTO_RULES } from './rotaryTaxonomySpec.js';

let _ready = false;

const SUBMISSION_COLS = [
  ['contentType', 'TEXT'], ['areaFocus', 'TEXT'], ['program', 'TEXT'], ['topic', 'TEXT'],
  ['tags', 'TEXT[]'], ['impact', 'JSONB'], ['aiSuggest', 'JSONB'], ['completeness', 'JSONB'],
  ['priority', 'TEXT'], ['formatRecs', 'TEXT[]'], ['channelRecs', 'TEXT[]'],
  ['linkedSubmissionId', 'TEXT'], ['duplicateNote', 'TEXT'],
  ['notifiedPublishedAt', 'TIMESTAMPTZ'], ['mainClub', 'TEXT'],
  ['notifyUpdates', 'BOOLEAN'],
  ['utmSource', 'TEXT'], ['utmMedium', 'TEXT'], ['utmCampaign', 'TEXT'],
];
const TOKEN_COLS = [
  ['utmSource', 'TEXT'], ['utmMedium', 'TEXT'], ['utmCampaign', 'TEXT'],
  ['channel', 'TEXT'], ['messageId', 'TEXT'], ['recipientId', 'TEXT'], ['segmentId', 'TEXT'],
];

async function addCols(table, cols) {
  for (const [col, type] of cols) {
    await db.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" ${type}`).catch(() => {});
  }
}

export async function ensureRotaryEnAccionSchema() {
  if (_ready) { await addCols('ContributionSubmission', SUBMISSION_COLS).catch(() => {}); return; }
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryTaxonomy" (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    color TEXT DEFAULT '',
    active BOOLEAN DEFAULT TRUE,
    "sortOrder" INT DEFAULT 0,
    "parentId" TEXT,
    rules JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(kind, slug)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryConfig" (
    id TEXT PRIMARY KEY,
    "photoRules" JSONB DEFAULT '{"minToSubmit":5,"recommended":5,"reelMin":5,"maxFiles":11}',
    "requireStory" BOOLEAN DEFAULT FALSE,
    "notifyOnPublish" BOOLEAN DEFAULT TRUE,
    "duplicateWindowDays" INT DEFAULT 90,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query(`INSERT INTO "RotaryConfig"(id, "photoRules") VALUES('default', '{"minToSubmit":5,"recommended":5,"reelMin":5,"maxFiles":11}'::jsonb) ON CONFLICT(id) DO UPDATE SET "photoRules" = jsonb_set(jsonb_set(COALESCE("RotaryConfig"."photoRules", '{}'::jsonb), '{minToSubmit}', '5'), '{maxFiles}', '11') WHERE (COALESCE(("RotaryConfig"."photoRules"->>'minToSubmit')::int, 0) < 5 OR COALESCE(("RotaryConfig"."photoRules"->>'maxFiles')::int, 0) < 11)`);
  await db.query(`CREATE TABLE IF NOT EXISTS "RotaryFormDraft" (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    "campaignId" TEXT,
    payload JSONB DEFAULT '{}',
    "contactEmail" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Campaña universal permanente: Rotary en Acción recibe 365 días al año.
  await db.query(`INSERT INTO "ContributionCampaign"(id, slug, name, "campaignType", status, content, targeting, "recipientClubId")
    VALUES('rotary-en-accion-universal','rotary-en-accion','Rotary en Acción','rotary_en_accion','active','{}','{"mode":"all"}','8aa470c5-0a5a-4a8d-b872-38645b8b9f3a')
    ON CONFLICT(id) DO UPDATE SET status = 'active', name = 'Rotary en Acción', "recipientClubId" = COALESCE("ContributionCampaign"."recipientClubId", '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a')`).catch(() => {});
  await addCols('ContributionSubmission', SUBMISSION_COLS);
  await addCols('ContentActivationLinkToken', TOKEN_COLS).catch(() => {});
  await seedTaxonomies().catch(() => {});
  _ready = true;
}

async function seedTaxonomies() {
  const all = [...DEFAULT_TIPOS, ...DEFAULT_AREAS, ...DEFAULT_PROGRAMAS, ...DEFAULT_TEMAS];
  let order = 0;
  for (const t of all) {
    await db.query(
      `INSERT INTO "RotaryTaxonomy"(id, kind, slug, name, description, icon, color, active, "sortOrder")
       VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
       ON CONFLICT(kind, slug) DO UPDATE SET active=TRUE, name=EXCLUDED.name, icon=EXCLUDED.icon, "sortOrder"=EXCLUDED."sortOrder"`,
      [`seed-${t.kind}-${t.slug}`, t.kind, t.slug, t.name, t.description || '', t.icon || '', t.color || '', t.order ?? order++]
    ).catch(() => {});
  }
  await db.query(`UPDATE "RotaryTaxonomy" SET active=TRUE WHERE kind='tipo' AND active=FALSE`).catch(() => {});
  // Reglas de fotografía semilla desde el criterio.
  await db.query(`UPDATE "RotaryConfig" SET "photoRules"=$1 WHERE id='default' AND "photoRules" IS NULL`,
    [JSON.stringify(DEFAULT_PHOTO_RULES)]).catch(() => {});
}
