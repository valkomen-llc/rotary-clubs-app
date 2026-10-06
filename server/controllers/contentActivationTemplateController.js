// Biblioteca de plantillas de mensajes (v4.1166). Ver contentActivationTemplates.js
// para la regla de separación plantilla/campaña.
import { getUserGrant } from '../lib/contentActivationScope.js';
import {
  listTemplates, getTemplate, getTemplateVersions,
  createTemplate, updateTemplate, duplicateTemplate,
  archiveTemplate, setTemplateStatus, removeTemplate, setDefaultTemplate,
  templateVisibleTo, templateWritableBy, TEMPLATE_STATUS_IDS,
} from '../lib/contentActivationTemplates.js';
import { assertEmailDesign, assertWhatsAppFields, DESIGN_BLOCKS_MAX } from '../lib/contentActivationMail.js';
import { findUnknownVars } from '../lib/contentActivationVariables.js';

const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, e, code = 500) => res.status(code).json({ error: e?.message || 'Error' });
const grantOf = async (req) => getUserGrant(req).catch(() => ({ isGlobal: true, districtIds: [], clubIds: [] }));
// La ruta declara `:templateId` (ver routes/content-activation.js). Se acepta
// también `req.params.id` por compatibilidad con llamadas internas/tests viejos.
const tid = (req) => req.params.templateId ?? req.params.id;

const EMAIL_BLOCKS = ['heading', 'text', 'image', 'button', 'columns', 'divider', 'spacer'];

function validateTemplateBody(channel, { design = {}, html = '', subject = '', preheader = '' } = {}) {
  if (channel === 'email') {
    const blocks = Array.isArray(design?.blocks) ? design.blocks : null;
    if (design && Object.keys(design).length && !blocks) {
      const e = new Error('El diseño debe traer bloques.');
      e.status = 400;
      throw e;
    }
    if (blocks) {
      if (blocks.length > DESIGN_BLOCKS_MAX) {
        const e = new Error(`Máximo ${DESIGN_BLOCKS_MAX} bloques.`);
        e.status = 400;
        throw e;
      }
      for (let bi = 0; bi < blocks.length; bi++) {
        const b = blocks[bi];
        if (!b || !EMAIL_BLOCKS.includes(b.type)) {
          const e = new Error(`Bloque ${bi + 1}: tipo no permitido.`);
          e.status = 400;
          throw e;
        }
        if (!b?.id) {
          const e = new Error(`Bloque ${bi + 1}: sin identificador.`);
          e.status = 400;
          throw e;
        }
      }
    }
    assertEmailDesign({ subject, preheader, html });
  } else {
    assertWhatsAppFields(typeof design === 'object' && design !== null ? design : {});
  }
  return true;
}

export const list = async (req, res) => {
  try {
    const grant = await grantOf(req);
    // Filtros: `?channel=email|whatsapp`, `?status=borrador|activa|inactiva|archivada`
    // (o `?all=1` para gestionar todo el ciclo de vida). Sin filtros, solo
    // activas: lo que se ofrece a campañas nuevas.
    const channel = ['email', 'whatsapp'].includes(req.query.channel) ? req.query.channel : null;
    const all = req.query.all === '1' || req.query.includeArchived === '1';
    const status = TEMPLATE_STATUS_IDS.includes(req.query.status) ? req.query.status : null;
    const rows = await listTemplates({
      channel,
      statuses: status ? [status] : (all ? null : ['activa']),
      includeArchived: all,
    });
    const visibles = rows.filter((t) => templateVisibleTo(t, grant));
    return res.json({ templates: visibles });
  } catch (e) { return fail(res, e); }
};

export const detail = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const t = await getTemplate(tid(req), req.query.version ?? null);
    if (!t) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateVisibleTo(t, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    return res.json({ template: t });
  } catch (e) { return fail(res, e); }
};

export const versions = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const t = await getTemplate(tid(req));
    if (!t) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateVisibleTo(t, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    return res.json({ versions: await getTemplateVersions(tid(req)) });
  } catch (e) { return fail(res, e); }
};

export const create = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const channel = req.body.channel === 'whatsapp' ? 'whatsapp' : 'email';
    let scope = String(req.body.scope || 'global');
    if (scope === 'global' && !grant.isGlobal) {
      scope = grant.clubIds?.[0] || (grant.districtIds?.[0] ? `district:${grant.districtIds[0]}` : '');
      if (!scope) return res.status(403).json({ error: 'Tu rol no puede crear plantillas globales.' });
    }
    validateTemplateBody(channel, req.body);
    const tpl = await createTemplate({ ...req.body, channel, scope, createdBy: req.user?.id || null });
    return res.status(201).json({ template: tpl });
  } catch (e) { return fail(res, e, e.status || 500); }
};

export const update = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const cur = await getTemplate(tid(req));
    if (!cur) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateWritableBy(cur, grant)) return res.status(403).json({ error: 'No tienes permiso para modificar esta plantilla.' });
    const channel = cur.channel;
    validateTemplateBody(channel, {
      design: req.body.design ?? cur.design,
      html: req.body.html ?? cur.html,
      subject: req.body.subject ?? cur.subject,
      preheader: req.body.preheader ?? cur.preheader,
    });
    // Nueva versión: las campañas que usan la anterior NO se tocan.
    const tpl = await updateTemplate(tid(req), { ...req.body, createdBy: req.user?.id || null });
    return ok(res, { template: tpl });
  } catch (e) { return fail(res, e, e.status || 500); }
};

export const duplicate = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const cur = await getTemplate(tid(req));
    if (!cur) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateVisibleTo(cur, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    const scope = grant.isGlobal ? (req.body.scope || cur.scope) : (grant.clubIds?.[0] || cur.scope);
    const tpl = await duplicateTemplate(tid(req), { createdBy: req.user?.id || null, scope });
    return res.status(201).json({ template: tpl });
  } catch (e) { return fail(res, e, e.status || 500); }
};

export const archive = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const cur = await getTemplate(tid(req));
    if (!cur) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateWritableBy(cur, grant)) return res.status(403).json({ error: 'No tienes permiso para modificar esta plantilla.' });
    const tpl = await archiveTemplate(tid(req), req.body?.archived !== false);
    return ok(res, { template: tpl });
  } catch (e) { return fail(res, e, e.status || 500); }
};

// POST /templates/:id/status — transiciones del ciclo de vida.
export const transition = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const cur = await getTemplate(tid(req));
    if (!cur) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateWritableBy(cur, grant)) return res.status(403).json({ error: 'No tienes permiso para modificar esta plantilla.' });
    const tpl = await setTemplateStatus(tid(req), String(req.body.status || ''));
    return ok(res, { template: tpl });
  } catch (e) { return fail(res, e, e.status || 500); }
};

export const remove = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const cur = await getTemplate(tid(req));
    if (!cur) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateWritableBy(cur, grant)) return res.status(403).json({ error: 'No tienes permiso para modificar esta plantilla.' });
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirma la eliminación enviando { confirm: true }.' });
    await removeTemplate(tid(req));
    return ok(res, { deleted: true });
  } catch (e) { return fail(res, e, e.status || 500); }
};

export const setDefault = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const cur = await getTemplate(tid(req));
    if (!cur) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateWritableBy(cur, grant)) return res.status(403).json({ error: 'No tienes permiso para modificar esta plantilla.' });
    const tpl = await setDefaultTemplate(tid(req));
    return ok(res, { template: tpl });
  } catch (e) { return fail(res, e, e.status || 500); }
};

// GET /templates/:id/usage — campañas que usan esta plantilla + último uso.
// La asociación vive como snapshot en cada campaña (nunca como referencia
// viva), así que editar la plantilla no altera este listado retroactivamente.
export const usage = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const cur = await getTemplate(tid(req));
    if (!cur) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateVisibleTo(cur, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    const id = String(tid(req));
    const { default: db } = await import('../lib/db.js');
    const { rows: activaciones } = await db.query(
      `SELECT id, name, status, "updatedAt",
              "contentDef"->'email'->>'templateVersion' AS "emailVersion",
              "contentDef"->'whatsapp'->>'templateVersion' AS "waVersion"
         FROM "ContentActivationCampaign"
        WHERE "contentDef"->'email'->>'templateId' = $1 OR "contentDef"->'whatsapp'->>'templateId' = $1
        ORDER BY "updatedAt" DESC LIMIT 100`,
      [id]
    ).catch(() => ({ rows: [] }));
    const { default: prisma } = await import('../lib/prisma.js');
    const emails = await prisma.emailCampaign.findMany({
      where: { design: { path: ['_template', 'id'], equals: id } },
      select: { id: true, name: true, status: true, sentAt: true, updatedAt: true, sentCount: true, openCount: true, clickCount: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }).catch(() => []);
    const fechas = [
      ...activaciones.map((c) => c.updatedAt),
      ...emails.map((c) => c.sentAt || c.updatedAt),
    ].filter(Boolean).map((d) => new Date(d).getTime());
    return res.json({
      activationCampaigns: activaciones,
      emailCampaigns: emails,
      total: activaciones.length + emails.length,
      lastUsedAt: fechas.length ? new Date(Math.max(...fechas)).toISOString() : null,
    });
  } catch (e) { return fail(res, e); }
};

// GET /templates/:id/metrics — agregados de las campañas asociadas.
// Las métricas pertenecen a cada ejecución y sobreviven a ediciones futuras.
export const metrics = async (req, res) => {
  try {
    const grant = await grantOf(req);
    const cur = await getTemplate(tid(req));
    if (!cur) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!templateVisibleTo(cur, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    const id = String(tid(req));
    const { default: db } = await import('../lib/db.js');
    const { default: prisma } = await import('../lib/prisma.js');
    const emails = await prisma.emailCampaign.findMany({
      where: { design: { path: ['_template', 'id'], equals: id } },
      select: { id: true, name: true, status: true, sentCount: true, openCount: true, clickCount: true },
    }).catch(() => []);
    const sum = (k) => emails.reduce((a, c) => a + (Number(c[k]) || 0), 0);
    const sent = sum('sentCount');
    const { rows: act } = await db.query(
      `SELECT COUNT(DISTINCT e.id)::int AS ejecuciones,
              COUNT(n.id)::int AS inscripciones
         FROM "ContentActivationExecution" e
         LEFT JOIN "ContentActivationEnrollment" n ON n."executionId" = e.id
         JOIN "ContentActivationCampaign" c ON c.id = e."campaignId"
        WHERE c."contentDef"->'email'->>'templateId' = $1 OR c."contentDef"->'whatsapp'->>'templateId' = $1`,
      [id]
    ).catch(() => ({ rows: [{}] }));
    return res.json({
      email: {
        campanas: emails.length, enviados: sent,
        aperturas: sum('openCount'), clics: sum('clickCount'),
        tasaApertura: sent ? +(100 * sum('openCount') / sent).toFixed(1) : 0,
        tasaClic: sent ? +(100 * sum('clickCount') / sent).toFixed(1) : 0,
        porCampana: emails,
      },
      activacion: {
        ejecuciones: Number(act[0]?.ejecuciones) || 0,
        inscripciones: Number(act[0]?.inscripciones) || 0,
      },
    });
  } catch (e) { return fail(res, e); }
};

export default { list, detail, versions, create, update, duplicate, archive, transition, remove, setDefault, usage, metrics };
