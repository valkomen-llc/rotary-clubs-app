// Biblioteca de plantillas de mensajes (v4.1166)
//
// Separa PLANTILLA de CAMPAÑA: la plantilla define diseño/contenido; la
// campaña COPIA una versión concreta al usarla (snapshot en su `contentDef`)
// y guarda `templateId/templateVersion` como referencia. Editar una plantilla
// NUNCA reescribe campañas: solo crea una versión nueva que cada campaña
// adopta explícitamente ("actualizar a la última").
//
// Tablas runtime (patrón idempotente del módulo, sin Prisma):
//   ContentActivationTemplate(id, scope, name, channel, design, html, subject,
//     preheader, isDefault, status, version, createdBy, createdAt, updatedAt)
//   ContentActivationTemplateVersion(id, templateId, version, design, html,
//     subject, preheader, note, createdBy, createdAt) — inmutable.
import db from './db.js';
import { nid } from './contentActivationStore.js';
import { sanitizeEmailHtml, EMAIL_HTML_MAX } from './contentActivationMail.js';
import { defaultContentDef } from './contentActivationSpec.js';

export async function ensureTemplateSchema() {
  await db.query(`CREATE TABLE IF NOT EXISTS "ContentActivationTemplate"(
    id TEXT PRIMARY KEY, scope TEXT DEFAULT 'global', name TEXT NOT NULL,
    channel TEXT DEFAULT 'email', design JSONB DEFAULT '{}', html TEXT DEFAULT '',
    subject TEXT DEFAULT '', preheader TEXT DEFAULT '',
    "isDefault" BOOLEAN DEFAULT FALSE, status TEXT DEFAULT 'activa',
    version INT DEFAULT 1, "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
  await db.query(`CREATE TABLE IF NOT EXISTS "ContentActivationTemplateVersion"(
    id TEXT PRIMARY KEY, "templateId" TEXT NOT NULL, version INT NOT NULL,
    design JSONB DEFAULT '{}', html TEXT DEFAULT '',
    subject TEXT DEFAULT '', preheader TEXT DEFAULT '',
    note TEXT DEFAULT '', "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
  )`).catch(() => {});
}

const row = (r) => {
  if (!r) return null;
  const J = (v) => (typeof v === 'string' ? JSON.parse(v) : (v || {}));
  return { ...r, design: J(r.design) };
};

const scopeOf = (tpl) => String(tpl?.scope || 'global');

/** ¿Esta sesión alcanza esta plantilla? Global: solo operador; propia: su sitio. */
export function templateVisibleTo(tpl, { isGlobal = false, clubIds = [], districtIds = [] } = {}) {
  if (!tpl) return false;
  if (scopeOf(tpl) === 'global') return true; // ver: todas las globales se ofrecen
  if (isGlobal) return true;
  const s = scopeOf(tpl);
  if (s.startsWith('district:')) return (districtIds || []).includes(s.slice(9));
  return (clubIds || []).includes(s);
}

/** ¿Puede escribirla? Las globales, solo el operador; las propias, su sitio. */
export function templateWritableBy(tpl, grant = {}) {
  if (!tpl) return false;
  if (scopeOf(tpl) === 'global') return !!grant.isGlobal;
  if (grant.isGlobal) return true;
  const s = scopeOf(tpl);
  if (s.startsWith('district:')) return (grant.districtIds || []).includes(s.slice(9));
  return (grant.clubIds || []).includes(s);
}

export async function listTemplates({ scope = null } = {}) {
  await ensureTemplateSchema();
  await seedDefaults().catch(() => {});
  const params = [];
  let where = `status='activa'`;
  if (scope) { params.push(String(scope)); where += ` AND scope=$${params.length}`; }
  const { rows } = await db.query(
    `SELECT id, scope, name, channel, subject, preheader, "isDefault", status, version, "createdBy", "createdAt", "updatedAt",
      (SELECT COUNT(*)::int FROM "ContentActivationTemplateVersion" v WHERE v."templateId"=t.id) AS versions
     FROM "ContentActivationTemplate" t WHERE ${where} ORDER BY "isDefault" DESC, "updatedAt" DESC LIMIT 100`, params);
  return rows;
}

export async function getTemplate(id, version = null) {
  await ensureTemplateSchema();
  const { rows } = await db.query(`SELECT * FROM "ContentActivationTemplate" WHERE id=$1`, [id]);
  const tpl = row(rows[0]);
  if (!tpl) return null;
  if (version != null && Number(version) !== Number(tpl.version)) {
    const { rows: vs } = await db.query(
      `SELECT * FROM "ContentActivationTemplateVersion" WHERE "templateId"=$1 AND version=$2`, [id, Number(version)]);
    if (!vs[0]) return { ...tpl, versionMissing: true };
    const v = row(vs[0]);
    return { ...tpl, design: v.design, html: v.html, subject: v.subject, preheader: v.preheader, version: v.version, pinned: true };
  }
  return tpl;
}

export async function getTemplateVersions(id) {
  await ensureTemplateSchema();
  const { rows } = await db.query(
    `SELECT id, version, subject, note, "createdBy", "createdAt", LENGTH(html) AS "htmlBytes" FROM "ContentActivationTemplateVersion" WHERE "templateId"=$1 ORDER BY version DESC`, [id]);
  return rows;
}

async function saveVersionRow(tpl, note = '', createdBy = null) {
  await db.query(
    `INSERT INTO "ContentActivationTemplateVersion"(id,"templateId",version,design,html,subject,preheader,note,"createdBy")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [nid('tv_'), tpl.id, tpl.version, JSON.stringify(tpl.design || {}), tpl.html || '',
      tpl.subject || '', tpl.preheader || '', String(note || '').slice(0, 300), createdBy]);
}

const cleanHtml = (html) => {
  const s = sanitizeEmailHtml(html);
  if (Buffer.byteLength(s, 'utf8') > EMAIL_HTML_MAX) {
    const e = new Error(`El diseño supera los ${Math.round(EMAIL_HTML_MAX / 1024)} KB.`);
    e.status = 400;
    throw e;
  }
  return s;
};

export async function createTemplate({ scope = 'global', name, channel = 'email', design = {}, html = '', subject = '', preheader = '', createdBy = null }) {
  await ensureTemplateSchema();
  if (!String(name || '').trim()) { const e = new Error('El nombre de la plantilla es obligatorio.'); e.status = 400; throw e; }
  if (!['email', 'whatsapp'].includes(channel)) { const e = new Error('Canal inválido.'); e.status = 400; throw e; }
  const id = nid('ct_');
  const safeScope = String(scope || 'global');
  await db.query(
    `INSERT INTO "ContentActivationTemplate"(id,scope,name,channel,design,html,subject,preheader,"isDefault",status,version,"createdBy")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,FALSE,'borrador',1,$9)`,
    [id, safeScope, String(name).slice(0, 160), channel, JSON.stringify(design || {}), channel === 'email' ? cleanHtml(html) : String(html || '').slice(0, 8000),
      String(subject || '').slice(0, 200), String(preheader || '').slice(0, 300), createdBy]);
  const tpl = await getTemplate(id);
  await saveVersionRow(tpl, 'Versión inicial', createdBy);
  return tpl;
}

export async function updateTemplate(id, { design, html, subject, preheader, name, note = '', createdBy = null }) {
  const cur = await getTemplate(id);
  if (!cur) { const e = new Error('Plantilla no encontrada.'); e.status = 404; throw e; }
  if (!['borrador', 'activa'].includes(cur.status)) { const e = new Error('Solo se editan plantillas en borrador o activas.'); e.status = 400; throw e; }
  const next = Number(cur.version) + 1;
  const htmlFinal = cur.channel === 'email' ? cleanHtml(html ?? cur.html) : String(html ?? cur.html ?? '').slice(0, 8000);
  await db.query(
    `UPDATE "ContentActivationTemplate" SET design=$2,html=$3,subject=$4,preheader=$5,name=$6,version=$7,"updatedAt"=NOW() WHERE id=$1`,
    [id, JSON.stringify(design ?? cur.design ?? {}), htmlFinal,
      subject !== undefined ? String(subject).slice(0, 200) : cur.subject,
      preheader !== undefined ? String(preheader).slice(0, 300) : cur.preheader,
      name !== undefined ? String(name).slice(0, 160) : cur.name, next]);
  const tpl = await getTemplate(id);
  await saveVersionRow(tpl, note || `Versión ${next}`, createdBy);
  // Las campañas NO se tocan: adoptan la nueva versión solo con "actualizar".
  return tpl;
}

export async function duplicateTemplate(id, { createdBy = null, scope = null } = {}) {
  const cur = await getTemplate(id);
  if (!cur) { const e = new Error('Plantilla no encontrada.'); e.status = 404; throw e; }
  const base = String(cur.name || 'Plantilla').replace(/\s\(copia(?:\s\d+)?\)$/, '');
  return createTemplate({
    scope: scope || cur.scope, name: `${base} (copia)`, channel: cur.channel,
    design: cur.design, html: cur.html, subject: cur.subject, preheader: cur.preheader, createdBy,
  });
}

export async function archiveTemplate(id, archived = true) {
  await ensureTemplateSchema();
  await db.query(`UPDATE "ContentActivationTemplate" SET status=$2,"updatedAt"=NOW() WHERE id=$1`, [id, archived ? 'archivada' : 'activa']);
  return getTemplate(id);
}

// ─── Ciclo de vida (v4.1167) ────────────────────────────────────────────
// borrador → activa ⇄ inactiva, archivada desde cualquiera (menos borrador,
// que se elimina directo). Archivada solo vuelve a activa.
// La predeterminada exige estar activa.
export const TEMPLATE_STATUS_FLOW = {
  borrador: ['activa', 'archivada'],
  activa: ['inactiva', 'archivada'],
  inactiva: ['activa', 'archivada'],
  archivada: ['activa'],
};
export const TEMPLATE_STATUS_IDS = Object.keys(TEMPLATE_STATUS_FLOW);

export const canTransitionTemplate = (from, to) =>
  Array.isArray(TEMPLATE_STATUS_FLOW[from]) && TEMPLATE_STATUS_FLOW[from].includes(to);

export async function setTemplateStatus(id, to) {
  const cur = await getTemplate(id);
  if (!cur) {
    const e = new Error('Plantilla no encontrada.');
    e.status = 404;
    throw e;
  }
  if (cur.status === to) return cur;
  if (!canTransitionTemplate(cur.status, to)) {
    const e = new Error(`Transición ${cur.status} → ${to} no permitida.`);
    e.status = 400;
    throw e;
  }
  await db.query(`UPDATE "ContentActivationTemplate" SET status=$2,"updatedAt"=NOW() WHERE id=$1`, [id, to]);
  return getTemplate(id);
}

export async function removeTemplate(id) {
  const cur = await getTemplate(id);
  if (!cur) { const e = new Error('Plantilla no encontrada.'); e.status = 404; throw e; }
  if (cur.status !== 'archivada') { const e = new Error('Archiva la plantilla antes de eliminarla.'); e.status = 400; throw e; }
  if (cur.isDefault) { const e = new Error('La plantilla predeterminada no se elimina: elige otra como predeterminada primero.'); e.status = 400; throw e; }
  await db.query(`DELETE FROM "ContentActivationTemplateVersion" WHERE "templateId"=$1`, [id]);
  await db.query(`DELETE FROM "ContentActivationTemplate" WHERE id=$1`, [id]);
  return true;
}

export async function setDefaultTemplate(id) {
  const cur = await getTemplate(id);
  if (!cur) { const e = new Error('Plantilla no encontrada.'); e.status = 404; throw e; }
  if (cur.status !== 'activa') { const e = new Error('Solo una plantilla activa puede ser predeterminada.'); e.status = 400; throw e; }
  await db.query(`UPDATE "ContentActivationTemplate" SET "isDefault"=FALSE WHERE channel=$1 AND scope=$2`, [cur.channel, cur.scope]);
  await db.query(`UPDATE "ContentActivationTemplate" SET "isDefault"=TRUE WHERE id=$1`, [id]);
  return getTemplate(id);
}

// ─── Predeterminadas del sistema ─────────────────────────────────────────
// Migra el contenido actual (defaultContentDef) al versionado: la primera vez
// que se lista sin plantillas, nacen "Rotary en Acción · Institucional" en
// ambos canales, editables desde el administrador como cualquier otra.
function seedEmailDesign() {
  const d = defaultContentDef();
  const paras = String(d.email.bodyText || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    version: 1,
    settings: { bg: '#EEF1F5', contentBg: '#FFFFFF', font: 'Arial, Helvetica, sans-serif', textColor: '#333333', linkColor: '#0c3c7c', width: 600 },
    blocks: [
      { id: 'seed-h1', type: 'heading', text: 'Lo que hace tu club merece ser compartido', level: 2, align: 'center', color: '#0c3c7c' },
      ...paras.map((p, i) => ({ id: `seed-p${i}`, type: 'text', text: p, align: 'left', color: '#333333', size: 15 })),
      { id: 'seed-cta', type: 'button', text: d.email.ctaText || 'Compartir una actividad →', href: '{{form_url}}', bg: '#0c3c7c', color: '#ffffff', align: 'center', radius: 8 },
      { id: 'seed-div', type: 'divider', color: '#e5e7eb', thickness: 1 },
      { id: 'seed-cierre', type: 'text', text: 'Te tomará solo unos minutos. Puedes regresar cada vez que tu club tenga una nueva actividad para compartir.', align: 'center', color: '#6b7280', size: 13 },
    ],
  };
}

export async function seedDefaults() {
  await ensureTemplateSchema();
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM "ContentActivationTemplate"`);
  if ((rows[0]?.n || 0) > 0) return false;
  const d = defaultContentDef();
  const email = await createTemplate({
    scope: 'global', name: 'Rotary en Acción · Institucional', channel: 'email',
    design: seedEmailDesign(), html: '', subject: d.email.subject, preheader: d.email.preheader, createdBy: 'system',
  });
  if (email.status !== 'activa') await setTemplateStatus(email.id, 'activa');
  await db.query(`UPDATE "ContentActivationTemplate" SET "isDefault"=TRUE WHERE id=$1`, [email.id]);
  const wa = await createTemplate({
    scope: 'global', name: 'Rotary en Acción · Institucional', channel: 'whatsapp',
    design: { headerType: 'none', headerText: '', body: d.whatsapp.body, footer: '', buttons: [] },
    html: '', subject: '', preheader: '', createdBy: 'system',
  });
  if ((await getTemplate(wa.id))?.status !== 'activa') await setTemplateStatus(wa.id, 'activa');
  await db.query(`UPDATE "ContentActivationTemplate" SET "isDefault"=TRUE WHERE id=$1`, [wa.id]);
  return true;
}

export default {
  ensureTemplateSchema, templateVisibleTo, templateWritableBy,
  listTemplates, getTemplate, getTemplateVersions,
  createTemplate, updateTemplate, duplicateTemplate,
  archiveTemplate, setTemplateStatus, canTransitionTemplate, TEMPLATE_STATUS_IDS,
  removeTemplate, setDefaultTemplate, seedDefaults,
};
