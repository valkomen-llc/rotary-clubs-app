// Biblioteca de plantillas: redacción con IA, carpetas y envío a Meta.
//
// EL HUECO QUE ESTO CIERRA: hasta acá, `createTemplate` insertaba una fila local
// con estado `pending` y nada más. Meta no se enteraba, así que la plantilla NO
// existía para la Cloud API y cualquier recorrido que la usara fallaba al enviar
// con "template name does not exist". Una plantilla sólo sirve cuando Meta la
// aprobó, y para aprobarla primero hay que mandársela.
//
// El envío es un paso EXPLÍCITO, no automático al redactar. Un rechazo de Meta
// baja la calificación de calidad de la cuenta, así que el texto que escribió la
// IA lo mira una persona antes de someterlo.
import crypto from 'crypto';
import db from '../../lib/db.js';
import { resolvePlatformClubId } from '../../lib/crmTenant.js';
import { ensureAutomationSchema } from '../../lib/ensureAutomationSchema.js';
import { getWhatsAppConfig } from '../../lib/whatsappSender.js';
import { composeTemplate, composeForJourney } from '../../lib/templateComposer.js';
import {
  TEMPLATE_FOLDERS, META_CATEGORIES, LIMITS, BUTTON_TYPES, HEADER_TYPES,
  validateTemplate, toMetaComponents, renderPreview, normalizeTemplateName,
  isFolder, folderByKey,
} from '../../lib/templateSpec.js';
import { TEMPLATE_VARIABLES } from '../../lib/journeySpec.js';

const WA_API_BASE = `https://graph.facebook.com/${process.env.WA_API_VERSION || 'v21.0'}`;
const OPERATOR_ROLES = ['administrator', 'superadmin'];

const denyUnlessOperator = (req, res) => {
  if (OPERATOR_ROLES.includes(req.user?.role)) return false;
  res.status(403).json({ error: 'Sólo el superadministrador de la plataforma puede administrar las plantillas.' });
  return true;
};

const tenant = async () => {
  const clubId = await resolvePlatformClubId();
  if (!clubId) {
    const err = new Error('No hay ninguna cuenta de WhatsApp Business configurada en la plataforma.');
    err.status = 409;
    throw err;
  }
  return clubId;
};

const fail = (res, err) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[CRM templates]', err);
  res.status(status).json({ error: err.message });
};

/** Fila de la base → objeto que entienden `validateTemplate` y `toMetaComponents`. */
function rowToTemplate(row) {
  const parse = (v, fallback) => {
    if (!v) return fallback;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return fallback; }
  };
  return {
    ...row,
    buttons: parse(row.buttons, []),
    variableTokens: parse(row.variableTokens, []),
    variableSamples: parse(row.variableSamples, []),
  };
}

// ── Catálogo ────────────────────────────────────────────────────────────────
export const getTemplateCatalog = async (req, res) => {
  try {
    res.json({
      folders: TEMPLATE_FOLDERS,
      metaCategories: META_CATEGORIES,
      buttonTypes: BUTTON_TYPES,
      headerTypes: HEADER_TYPES,
      limits: LIMITS,
      variables: TEMPLATE_VARIABLES,
    });
  } catch (err) { fail(res, err); }
};

// ── Biblioteca ──────────────────────────────────────────────────────────────
/** Las plantillas agrupadas por carpeta, con el conteo de cada una. */
export const getLibrary = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    await ensureAutomationSchema();
    const clubId = await tenant();

    const params = [clubId];
    let where = `"clubId"=$1`;
    if (req.query.folder === 'none') where += ` AND (folder IS NULL OR folder='')`;
    else if (req.query.folder && isFolder(req.query.folder)) { params.push(req.query.folder); where += ` AND folder=$2`; }

    const [rows, counts] = await Promise.all([
      db.query(`SELECT * FROM "WhatsAppTemplate" WHERE ${where} ORDER BY "updatedAt" DESC`, params),
      db.query(
        `SELECT COALESCE(NULLIF(folder,''),'none') AS folder, COUNT(*)::int AS n
         FROM "WhatsAppTemplate" WHERE "clubId"=$1 GROUP BY 1`, [clubId]
      ),
    ]);

    const templates = rows.rows.map(r => {
      const t = rowToTemplate(r);
      return { ...t, validation: validateTemplate(t), preview: renderPreview(t, t.variableSamples) };
    });

    res.json({
      templates,
      folders: TEMPLATE_FOLDERS.map(f => ({
        ...f, n: counts.rows.find(c => c.folder === f.key)?.n || 0,
      })),
      unfiled: counts.rows.find(c => c.folder === 'none')?.n || 0,
      total: counts.rows.reduce((a, c) => a + c.n, 0),
    });
  } catch (err) { fail(res, err); }
};

// ── Redacción con IA ────────────────────────────────────────────────────────
/**
 * Redacta un borrador. NO lo guarda ni lo manda a Meta: devuelve el texto para
 * que una persona lo revise. Guardar y enviar son dos acciones aparte y
 * explícitas.
 */
export const composeWithAi = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const b = req.body || {};
    const out = await composeTemplate({
      goal: b.goal,
      folder: isFolder(b.folder) ? b.folder : null,
      language: b.language || 'es',
      tone: b.tone || null,
      audience: b.audience || null,
      includeButtons: b.includeButtons !== false,
      extraContext: b.extraContext || null,
      provider: b.provider || undefined,
    });
    res.json({
      ...out,
      preview: out.template ? renderPreview(out.template, out.template.variableSamples) : null,
    });
  } catch (err) {
    if (!err.status) err.status = 502;
    fail(res, err);
  }
};

/** Redacta una plantilla por cada paso de un recorrido, usando su `templateHint`. */
export const composeForJourneyStep = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const jr = await db.query(`SELECT * FROM "CrmJourney" WHERE "clubId"=$1 AND id=$2`, [clubId, req.params.id]);
    if (!jr.rows.length) return res.status(404).json({ error: 'El recorrido no existe' });

    const results = await composeForJourney({
      journey: jr.rows[0],
      folder: isFolder(req.body?.folder) ? req.body.folder : null,
      language: req.body?.language || 'es',
      provider: req.body?.provider || undefined,
    });
    res.json({ journey: { id: jr.rows[0].id, name: jr.rows[0].name }, results });
  } catch (err) {
    if (!err.status) err.status = 502;
    fail(res, err);
  }
};

// ── Guardar ─────────────────────────────────────────────────────────────────
/**
 * Crea o actualiza la plantilla en NUESTRA base.
 *
 * Una plantilla ya sometida a Meta (`metaTemplateId`) no se puede editar acá: en
 * Meta el texto es inmutable una vez aprobado. Editarla en local daría dos
 * verdades —lo que se ve en el panel y lo que Meta envía de verdad—, que es el
 * peor resultado posible. Se avisa y se ofrece duplicar.
 */
export const saveTemplate = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    await ensureAutomationSchema();
    const clubId = await tenant();
    const b = req.body || {};

    const template = {
      name: normalizeTemplateName(b.name || b.displayName),
      displayName: String(b.displayName || '').trim(),
      category: String(b.category || 'UTILITY').toUpperCase(),
      folder: isFolder(b.folder) ? b.folder : null,
      language: b.language || 'es',
      headerType: b.headerType || 'NONE',
      headerContent: b.headerContent || null,
      bodyText: String(b.bodyText || ''),
      footerText: b.footerText || null,
      buttons: Array.isArray(b.buttons) ? b.buttons : [],
      variableTokens: Array.isArray(b.variableTokens) ? b.variableTokens : [],
      variableSamples: Array.isArray(b.variableSamples) ? b.variableSamples : [],
    };
    if (!template.displayName) return res.status(400).json({ error: 'Falta el nombre legible.' });

    const validation = validateTemplate(template);

    if (req.params.id) {
      const cur = await db.query(`SELECT * FROM "WhatsAppTemplate" WHERE id=$1 AND "clubId"=$2`, [req.params.id, clubId]);
      if (!cur.rows.length) return res.status(404).json({ error: 'La plantilla no existe' });
      if (cur.rows[0].metaTemplateId) {
        return res.status(409).json({
          error: 'Esta plantilla ya está en Meta y su texto no se puede cambiar. Duplicala para trabajar sobre una copia; lo único editable es la carpeta.',
        });
      }
      const r = await db.query(
        `UPDATE "WhatsAppTemplate"
         SET name=$1,"displayName"=$2,category=$3,folder=$4,language=$5,"headerType"=$6,"headerContent"=$7,
             "bodyText"=$8,"footerText"=$9,buttons=$10,"variableTokens"=$11,"variableSamples"=$12,"updatedAt"=NOW()
         WHERE id=$13 AND "clubId"=$14 RETURNING *`,
        [template.name, template.displayName, template.category, template.folder, template.language,
         template.headerType, template.headerContent, template.bodyText, template.footerText,
         JSON.stringify(template.buttons), JSON.stringify(template.variableTokens),
         JSON.stringify(template.variableSamples), req.params.id, clubId]
      );
      const saved = rowToTemplate(r.rows[0]);
      return res.json({ ...saved, validation, preview: renderPreview(saved, saved.variableSamples) });
    }

    const r = await db.query(
      `INSERT INTO "WhatsAppTemplate"
         (id,"clubId",name,"displayName",category,folder,language,status,"headerType","headerContent",
          "bodyText","footerText",buttons,"variableTokens","variableSamples","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
       RETURNING *`,
      [crypto.randomUUID(), clubId, template.name, template.displayName, template.category, template.folder,
       template.language, template.headerType, template.headerContent, template.bodyText, template.footerText,
       JSON.stringify(template.buttons), JSON.stringify(template.variableTokens), JSON.stringify(template.variableSamples)]
    );
    const saved = rowToTemplate(r.rows[0]);
    res.status(201).json({ ...saved, validation, preview: renderPreview(saved, saved.variableSamples) });
  } catch (err) {
    if (String(err.message).includes('duplicate key')) {
      err.status = 409;
      err.message = 'Ya existe una plantilla con ese nombre técnico. Cambiá el nombre.';
    }
    fail(res, err);
  }
};

/** Mueve una plantilla de carpeta. Es lo único editable de una ya aprobada. */
export const moveToFolder = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const folder = req.body?.folder;
    if (folder && !isFolder(folder)) return res.status(400).json({ error: 'Carpeta desconocida.' });
    const r = await db.query(
      `UPDATE "WhatsAppTemplate" SET folder=$1,"updatedAt"=NOW() WHERE id=$2 AND "clubId"=$3 RETURNING *`,
      [folder || null, req.params.id, clubId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'La plantilla no existe' });
    res.json(rowToTemplate(r.rows[0]));
  } catch (err) { fail(res, err); }
};

/** Copia una plantilla para poder editar el texto de una que ya está en Meta. */
export const duplicateTemplate = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const cur = await db.query(`SELECT * FROM "WhatsAppTemplate" WHERE id=$1 AND "clubId"=$2`, [req.params.id, clubId]);
    if (!cur.rows.length) return res.status(404).json({ error: 'La plantilla no existe' });
    const t = rowToTemplate(cur.rows[0]);

    // El nombre lleva sufijo porque en Meta es único por cuenta. La copia nace
    // SIN `metaTemplateId` y en borrador: es una plantilla nueva, no la misma.
    const suffix = String(Date.now()).slice(-4);
    const r = await db.query(
      `INSERT INTO "WhatsAppTemplate"
         (id,"clubId",name,"displayName",category,folder,language,status,"headerType","headerContent",
          "bodyText","footerText",buttons,"variableTokens","variableSamples","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
       RETURNING *`,
      [crypto.randomUUID(), clubId, normalizeTemplateName(`${t.name}_v${suffix}`), `${t.displayName} (copia)`,
       t.category, t.folder, t.language, t.headerType, t.headerContent, t.bodyText, t.footerText,
       JSON.stringify(t.buttons), JSON.stringify(t.variableTokens), JSON.stringify(t.variableSamples)]
    );
    res.status(201).json(rowToTemplate(r.rows[0]));
  } catch (err) { fail(res, err); }
};

// ── Envío a Meta ────────────────────────────────────────────────────────────
/**
 * Somete la plantilla a aprobación de Meta.
 *
 * Se revalida ACÁ aunque la UI ya haya validado: la comprobación del navegador
 * ahorra un viaje, pero la que no se puede saltar es ésta.
 *
 * El error de Meta se propaga TEXTUAL. Sus mensajes de rechazo son específicos
 * ("body text contains variables that are not sequential") y traducirlos a un
 * "no se pudo enviar" dejaría a quien corrige sin saber qué corregir.
 */
export const submitToMeta = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const cur = await db.query(`SELECT * FROM "WhatsAppTemplate" WHERE id=$1 AND "clubId"=$2`, [req.params.id, clubId]);
    if (!cur.rows.length) return res.status(404).json({ error: 'La plantilla no existe' });
    const t = rowToTemplate(cur.rows[0]);

    if (t.metaTemplateId) {
      return res.status(409).json({ error: 'Esta plantilla ya fue enviada a Meta. Sincronizá para ver su estado.' });
    }

    const validation = validateTemplate(t);
    if (!validation.ok) {
      return res.status(400).json({
        error: 'La plantilla todavía no cumple las reglas de Meta.',
        validation,
      });
    }

    const config = await getWhatsAppConfig(clubId);
    if (!config?.wabaId || !config?.accessToken) {
      return res.status(409).json({ error: 'Faltan el WABA ID o el token en Configuración.' });
    }

    const payload = {
      name: t.name,
      language: t.language,
      category: t.category,
      components: toMetaComponents(t),
    };

    const metaRes = await fetch(`${WA_API_BASE}/${config.wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await metaRes.json().catch(() => ({}));

    if (!metaRes.ok || data.error) {
      const detail = data.error?.error_user_msg || data.error?.message || `Meta respondió ${metaRes.status}`;
      await db.query(
        `UPDATE "WhatsAppTemplate" SET status='rejected',"rejectionReason"=$1,"updatedAt"=NOW() WHERE id=$2`,
        [String(detail).slice(0, 500), t.id]
      ).catch(() => {});
      return res.status(400).json({ error: `Meta rechazó la plantilla: ${detail}`, payload });
    }

    // Meta devuelve el id y el estado inicial, que casi siempre es PENDING: la
    // revisión puede tardar de minutos a un día.
    const r = await db.query(
      `UPDATE "WhatsAppTemplate"
       SET "metaTemplateId"=$1, status=$2, "rejectionReason"=NULL, "submittedAt"=NOW(), "updatedAt"=NOW()
       WHERE id=$3 RETURNING *`,
      [data.id || null, String(data.status || 'pending').toLowerCase(), t.id]
    );

    res.json({
      ...rowToTemplate(r.rows[0]),
      message: 'Enviada a Meta. La revisión suele tardar entre unos minutos y 24 horas; sincronizá para ver el resultado.',
    });
  } catch (err) { fail(res, err); }
};

/** Borra la plantilla, y en Meta también si ya estaba allá. */
export const removeTemplate = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const clubId = await tenant();
    const cur = await db.query(`SELECT * FROM "WhatsAppTemplate" WHERE id=$1 AND "clubId"=$2`, [req.params.id, clubId]);
    if (!cur.rows.length) return res.status(404).json({ error: 'La plantilla no existe' });
    const t = cur.rows[0];

    // Una plantilla en uso por un recorrido no se borra: el recorrido quedaría
    // apuntando a algo inexistente y fallaría en el próximo envío.
    const used = await db.query(
      `SELECT name FROM "CrmJourney"
       WHERE "clubId"=$1 AND nodes::text LIKE '%' || $2 || '%' LIMIT 3`,
      [clubId, t.id]
    );
    if (used.rows.length) {
      return res.status(409).json({
        error: `La usan estos recorridos: ${used.rows.map(u => u.name).join(', ')}. Cambiá la plantilla de esos pasos antes de borrarla.`,
      });
    }

    if (t.metaTemplateId) {
      const config = await getWhatsAppConfig(clubId);
      if (config?.wabaId && config?.accessToken) {
        await fetch(`${WA_API_BASE}/${config.wabaId}/message_templates?name=${encodeURIComponent(t.name)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${config.accessToken}` },
        }).catch(() => { /* si Meta falla, igual se borra la fila local */ });
      }
    }

    await db.query(`DELETE FROM "WhatsAppTemplate" WHERE id=$1 AND "clubId"=$2`, [req.params.id, clubId]);
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
};

/** Vista previa sin guardar, para el editor. */
export const previewTemplate = async (req, res) => {
  try {
    if (denyUnlessOperator(req, res)) return;
    const t = req.body || {};
    res.json({
      preview: renderPreview(t, t.variableSamples || []),
      validation: validateTemplate({ ...t, name: normalizeTemplateName(t.name || t.displayName) }),
    });
  } catch (err) { fail(res, err); }
};

export default {
  getTemplateCatalog, getLibrary, composeWithAi, composeForJourneyStep,
  saveTemplate, moveToFolder, duplicateTemplate, submitToMeta, removeTemplate, previewTemplate,
};
