// Acceso a datos de activación. Todo SQL parametrizado, sin ORM para tablas runtime.
import crypto from 'crypto';
import db from './db.js';
import { ensureContentActivationSchema } from './ensureContentActivationSchema.js';

export const nid = (p = '') => p + crypto.randomUUID().replace(/-/g, '').slice(0, 12) + Date.now().toString(36);

export async function listCampaigns({ clubId } = {}) {
  await ensureContentActivationSchema();
  const { rows } = await db.query(
    `SELECT c.*,
      (SELECT COUNT(*)::int FROM "ContentActivationExecution" e WHERE e."campaignId"=c.id) AS "executionCount",
      (SELECT COUNT(*)::int FROM "ContentActivationEnrollment" n WHERE n."campaignId"=c.id) AS "enrollmentCount"
     FROM "ContentActivationCampaign" c
     ${clubId ? 'WHERE c."clubId"=$1 OR c."clubId" IS NULL' : ''}
     ORDER BY c."updatedAt" DESC LIMIT 100`,
    clubId ? [clubId] : []
  );
  return rows;
}
export async function getCampaign(id) {
  await ensureContentActivationSchema();
  const { rows } = await db.query(`SELECT * FROM "ContentActivationCampaign" WHERE id=$1`, [id]);
  return rows[0] || null;
}
export async function upsertCampaign(data, actorClubId) {
  await ensureContentActivationSchema();
  const id = data.id || nid('ca_');
  await db.query(
    `INSERT INTO "ContentActivationCampaign"(id,"clubId",name,description,objetivo,"contributionCampaignId","startAt","endAt",timezone,frecuencia,"customDays",canales,"audienceDef","flowDef","followRules",variables,status,"createdBy","updatedAt")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, objetivo=EXCLUDED.objetivo,
       "contributionCampaignId"=EXCLUDED."contributionCampaignId","startAt"=EXCLUDED."startAt","endAt"=EXCLUDED."endAt",
       timezone=EXCLUDED.timezone, frecuencia=EXCLUDED.frecuencia,"customDays"=EXCLUDED."customDays",canales=EXCLUDED.canales,
       "audienceDef"=EXCLUDED."audienceDef","flowDef"=EXCLUDED."flowDef","followRules"=EXCLUDED."followRules",
       variables=EXCLUDED.variables,status=EXCLUDED.status,"updatedAt"=NOW()`,
    [id, actorClubId || data.clubId || null, data.name, data.description || '', data.objetivo || '',
      data.contributionCampaignId || null, data.startAt || null, data.endAt || null,
      data.timezone || 'America/Bogota', data.frecuencia || 'mensual', data.customDays || null,
      data.canales || ['whatsapp'], JSON.stringify(data.audienceDef || {}), JSON.stringify(data.flowDef || []),
      JSON.stringify(data.followRules || {}), JSON.stringify(data.variables || {}),
      data.status || 'borrador', data.createdBy || null]
  );
  return getCampaign(id);
}
export async function setCampaignStatus(id, status) {
  await ensureContentActivationSchema();
  await db.query(`UPDATE "ContentActivationCampaign" SET status=$2,"updatedAt"=NOW() WHERE id=$1`, [id, status]);
  return getCampaign(id);
}
export async function listExecutions(campaignId) {
  await ensureContentActivationSchema();
  const { rows } = await db.query(
    `SELECT e.*, (SELECT COUNT(*)::int FROM "ContentActivationEnrollment" n WHERE n."executionId"=e.id) AS enrolled,
      (SELECT COUNT(*)::int FROM "ContentActivationEnrollment" n WHERE n."executionId"=e.id AND n.status='contenido_recibido') AS received
     FROM "ContentActivationExecution" e WHERE e."campaignId"=$1 ORDER BY e."createdAt" DESC`, [campaignId]);
  return rows;
}
export async function createExecution(campaignId, periodoLabel, startAt, endAt) {
  await ensureContentActivationSchema();
  const id = nid('ex_');
  await db.query(
    `INSERT INTO "ContentActivationExecution"(id,"campaignId","periodoLabel","startAt","endAt",status) VALUES($1,$2,$3,$4,$5,'programada')`,
    [id, campaignId, periodoLabel, startAt || null, endAt || null]);
  return id;
}
export async function listEnrollments(executionId, limit = 200) {
  await ensureContentActivationSchema();
  const { rows } = await db.query(
    `SELECT * FROM "ContentActivationEnrollment" WHERE "executionId"=$1 ORDER BY "updatedAt" DESC LIMIT $2`, [executionId, limit]);
  return rows;
}
export async function listEvents({ executionId, enrollmentId, campaignId, limit = 300 }) {
  await ensureContentActivationSchema();
  const conds = [];
  const params = [];
  if (executionId) { params.push(executionId); conds.push(`"executionId"=$${params.length}`); }
  if (enrollmentId) { params.push(enrollmentId); conds.push(`"enrollmentId"=$${params.length}`); }
  if (campaignId) { params.push(campaignId); conds.push(`"campaignId"=$${params.length}`); }
  params.push(limit);
  const { rows } = await db.query(
    `SELECT * FROM "ContentActivationEvent" ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY "createdAt" DESC LIMIT $${params.length}`,
    params);
  return rows;
}
export async function addEvent({ enrollmentId, executionId, campaignId, type, channel, messageLogId, metadata }) {
  await ensureContentActivationSchema();
  const id = nid('ev_');
  await db.query(
    `INSERT INTO "ContentActivationEvent"(id,"enrollmentId","executionId","campaignId",type,channel,"messageLogId",metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, enrollmentId || null, executionId, campaignId, type, channel || null, messageLogId || null, JSON.stringify(metadata || {})]);
  return id;
}
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
export async function createLinkToken({ executionId, enrollmentId, campaignId, contactId, days = 60, utmSource, utmMedium, utmCampaign, channel, messageId, recipientId, segmentId }) {
  await ensureContentActivationSchema();
  // Columnas UTM/atribución v4.1118: si aún no existen, se crean al vuelo.
  await db.query(`ALTER TABLE "ContentActivationLinkToken" ADD COLUMN IF NOT EXISTS "utmSource" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "ContentActivationLinkToken" ADD COLUMN IF NOT EXISTS "utmMedium" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "ContentActivationLinkToken" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "ContentActivationLinkToken" ADD COLUMN IF NOT EXISTS "channel" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "ContentActivationLinkToken" ADD COLUMN IF NOT EXISTS "messageId" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "ContentActivationLinkToken" ADD COLUMN IF NOT EXISTS "recipientId" TEXT`).catch(() => {});
  await db.query(`ALTER TABLE "ContentActivationLinkToken" ADD COLUMN IF NOT EXISTS "segmentId" TEXT`).catch(() => {});
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  await db.query(
    `INSERT INTO "ContentActivationLinkToken"("tokenHash","executionId","enrollmentId","campaignId","contactId","expiresAt","utmSource","utmMedium","utmCampaign","channel","messageId","recipientId","segmentId") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [tokenHash, executionId, enrollmentId, campaignId, contactId || null, expiresAt,
      utmSource || null, utmMedium || null, utmCampaign || null, channel || null, messageId || null, recipientId || null, segmentId || null]);
  return { token, tokenHash, expiresAt };
}
export async function resolveToken(tokenHashOrPlain) {
  await ensureContentActivationSchema();
  const h = /^[a-f0-9]{64}$/i.test(String(tokenHashOrPlain)) ? String(tokenHashOrPlain) : hashToken(tokenHashOrPlain);
  const { rows } = await db.query(`SELECT * FROM "ContentActivationLinkToken" WHERE "tokenHash"=$1`, [h]);
  return rows[0] || null;
}
export async function markTokenUsed(tokenHash) {
  await db.query(`UPDATE "ContentActivationLinkToken" SET "usedAt"=NOW() WHERE "tokenHash"=$1`, [tokenHash]).catch(() => {});
}
export async function getProfile(siteId) {
  await ensureContentActivationSchema();
  const { rows } = await db.query(`SELECT * FROM "ClubParticipationProfile" WHERE "siteId"=$1`, [siteId]);
  return rows[0] || null;
}
export async function upsertProfile(siteId, patch, siteType = 'club') {
  await ensureContentActivationSchema();
  await db.query(
    `INSERT INTO "ClubParticipationProfile"("siteId","siteType","updatedAt") VALUES($1,$2,NOW()) ON CONFLICT("siteId") DO NOTHING`,
    [siteId, siteType]);
  const keys = Object.keys(patch || {});
  if (!keys.length) return getProfile(siteId);
  const sets = keys.map((k, i) => `"${k}"=$${i + 2}`).join(',');
  await db.query(`UPDATE "ClubParticipationProfile" SET ${sets},"updatedAt"=NOW() WHERE "siteId"=$1`, [siteId, ...keys.map((k) => patch[k])]);
  return getProfile(siteId);
}
