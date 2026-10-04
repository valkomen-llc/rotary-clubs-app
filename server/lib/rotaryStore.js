// I/O de Rotary en Acción: taxonomías, config, borradores.
import crypto from 'crypto';
import db from './db.js';
import { ensureRotaryEnAccionSchema } from './ensureRotaryEnAccionSchema.js';

export const nid = (p = '') => p + crypto.randomUUID().replace(/-/g, '').slice(0, 12) + Date.now().toString(36);

export async function listTaxonomies(kind, { activeOnly = false } = {}) {
  await ensureRotaryEnAccionSchema();
  const { rows } = await db.query(
    `SELECT * FROM "RotaryTaxonomy" WHERE kind=$1 ${activeOnly ? 'AND active=TRUE' : ''} ORDER BY "sortOrder" ASC, name ASC`,
    [kind]);
  return rows;
}
export async function treeTaxonomies() {
  await ensureRotaryEnAccionSchema();
  const { rows } = await db.query(`SELECT * FROM "RotaryTaxonomy" WHERE active=TRUE ORDER BY kind, "sortOrder" ASC`);
  const tree = { tipo: [], area: [], programa: [], tema: [] };
  for (const r of rows) if (tree[r.kind]) tree[r.kind].push(r);
  if (!tree.tipo.length) {
    const { DEFAULT_TIPOS } = await import('./rotaryTaxonomySpec.js');
    tree.tipo = DEFAULT_TIPOS.map((t, i) => ({
      id: `seed-tipo-${t.slug}`, kind: 'tipo', slug: t.slug, name: t.name,
      description: '', icon: t.icon || '', color: t.color || '', active: true, sortOrder: t.order ?? i
    }));
  }
  return tree;
}
export async function upsertTaxonomy(t, actor) {
  await ensureRotaryEnAccionSchema();
  const id = t.id || nid('rt_');
  await db.query(
    `INSERT INTO "RotaryTaxonomy"(id,kind,slug,name,description,icon,color,active,"sortOrder","parentId",rules,metadata,"updatedAt")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT(kind,slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
       icon=EXCLUDED.icon, color=EXCLUDED.color, active=EXCLUDED.active, "sortOrder"=EXCLUDED."sortOrder",
       "parentId"=EXCLUDED."parentId", rules=EXCLUDED.rules, metadata=EXCLUDED.metadata, "updatedAt"=NOW()`,
    [id, t.kind, String(t.slug || '').toLowerCase().trim(), t.name, t.description || '', t.icon || '', t.color || '',
      t.active !== false, Number(t.sortOrder) || 0, t.parentId || null,
      JSON.stringify(t.rules || {}), JSON.stringify(t.metadata || {})]);
  void actor;
  return id;
}
export async function setTaxonomyActive(id, active) {
  await ensureRotaryEnAccionSchema();
  await db.query(`UPDATE "RotaryTaxonomy" SET active=$2,"updatedAt"=NOW() WHERE id=$1`, [id, !!active]);
}
export async function getConfig() {
  await ensureRotaryEnAccionSchema();
  const { rows } = await db.query(`SELECT * FROM "RotaryConfig" WHERE id='default'`);
  return rows[0] || { photoRules: { minToSubmit: 1, recommended: 3, reelMin: 5, maxFiles: 10 } };
}
export async function putConfig(patch) {
  await ensureRotaryEnAccionSchema();
  const cur = await getConfig();
  const photoRules = { ...(cur.photoRules || {}), ...(patch.photoRules || {}) };
  await db.query(
    `UPDATE "RotaryConfig" SET "photoRules"=$1,"requireStory"=$2,"notifyOnPublish"=$3,"duplicateWindowDays"=$4,"updatedAt"=NOW() WHERE id='default'`,
    [JSON.stringify(photoRules),
      patch.requireStory ?? cur.requireStory ?? false,
      patch.notifyOnPublish ?? cur.notifyOnPublish ?? true,
      Number(patch.duplicateWindowDays) || cur.duplicateWindowDays || 90]);
  return getConfig();
}
// Borradores: token opaco para continuar después (móvil primero).
export async function saveDraft({ token, campaignId, payload, contactEmail }) {
  await ensureRotaryEnAccionSchema();
  const t = token || crypto.randomBytes(16).toString('hex');
  const id = nid('rd_');
  await db.query(
    `INSERT INTO "RotaryFormDraft"(id,token,"campaignId",payload,"contactEmail","updatedAt")
     VALUES($1,$2,$3,$4,$5,NOW())
     ON CONFLICT(token) DO UPDATE SET payload=EXCLUDED.payload,"contactEmail"=EXCLUDED."contactEmail","updatedAt"=NOW()`,
    [id, t, campaignId || null, JSON.stringify(payload || {}), contactEmail || null]);
  return { token: t };
}
export async function getDraft(token) {
  await ensureRotaryEnAccionSchema();
  const { rows } = await db.query(`SELECT * FROM "RotaryFormDraft" WHERE token=$1`, [String(token || '')]);
  return rows[0] || null;
}
export async function deleteDraft(token) {
  await ensureRotaryEnAccionSchema();
  await db.query(`DELETE FROM "RotaryFormDraft" WHERE token=$1`, [String(token || '')]).catch(() => {});
}
