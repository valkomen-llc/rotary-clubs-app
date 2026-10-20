// Rotary en Acción — controlador (v4.1118). Motor universal de captación:
// una sola experiencia que se adapta al contexto (campaña/tema/programa/área).
import db from '../lib/db.js';
import { ensureRotaryEnAccionSchema } from '../lib/ensureRotaryEnAccionSchema.js';
import { listTaxonomies, treeTaxonomies, upsertTaxonomy, setTaxonomyActive, getConfig, putConfig, saveDraft, getDraft, deleteDraft } from '../lib/rotaryStore.js';
import { universalCampaignId, resolveContext, postSubmit } from '../lib/rotaryEngine.js';
import { DISTRICT_CATALOG } from '../lib/rotaryClubs.js';
import { shapeSubmission, validateSubmission, consentTextFor, consentIsConfigured, POST_PLATFORMS, MAX_POSTS, MAX_PARTICIPATING_CLUBS } from '../lib/contentSubmissionSpec.js';
import { presignSubmissionUpload, headSubmissionFile, stagingKeyBelongs } from '../lib/submissionFiles.js';
import { createSubmission } from '../lib/contentSubmissionStore.js';
import { enqueueArticle, autoArticlesEnabled } from '../lib/submissionArticleEngine.js';
import { normalizeContent } from '../lib/contributionSpec.js';
import { resolveToken } from '../lib/contentActivationStore.js';
import { campaignIdsInScope } from './contributionCampaignController.js';
import { resolveScope, dashboard } from '../lib/rotaryDashboard.js';

const fail = (res, e, code = 500) => res.status(code).json({ error: e?.message || 'Error' });

// Texto general de autorización (v4.1123): el módulo es Rotary en Acción, no
// una campaña, y nunca se muestra ni se guarda un texto provisional. Se copia
// EXACTO a la fila (regla del consentimiento) y enlaza los documentos reales
// del footer (my.rotary.org), sin inventar URLs.
export const GENERAL_CONSENT_TEXT = 'Autorizo el tratamiento y uso del contenido, fotografías, videos e información que envío a través de Rotary en Acción para fines de comunicación y difusión institucional, de acuerdo con los Términos de Servicio (https://my.rotary.org/terms-of-use) y la Política de Privacidad (https://my.rotary.org/privacy-policy) aplicables.';

// ─── GET /config — público ─────────────────────────────────────────────
export const getEngineConfig = async (req, res) => {
  try {
    await ensureRotaryEnAccionSchema();
    const { campaign, topic, program, area, ref, ca_token } = req.query;
    const ctx = await resolveContext({ campaign, topic, program, area, ref });
    const cfg = await getConfig();

    // Detección dinámica del sitio activo para cabecera e identidad multisitio
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    let site = null;
    try {
      const { resolveSiteId } = await import('../lib/linkRedirectStore.js');
      const siteId = await resolveSiteId(host);
      if (siteId) {
        const { rows: siteRows } = await db.query(
          `SELECT id, name, logo, district, domain, subdomain FROM "Club" WHERE id=$1 LIMIT 1`,
          [siteId]
        );
        if (siteRows[0]) {
          site = {
            id: siteRows[0].id,
            name: siteRows[0].name,
            logo: siteRows[0].logo,
            district: siteRows[0].district,
            domain: siteRows[0].domain,
            subdomain: siteRows[0].subdomain,
          };
        }
      }
    } catch {}

    // Identificación inteligente: el token de campaña ya sabe club/contacto.
    let prefill = {};
    if (ca_token) {
      try {
        const tok = await resolveToken(String(ca_token));
        if (tok) {
          const { rows } = await db.query(
            `SELECT c.name, c."lastName", c.email, c.district, c."siteId", c."orgRole"
             FROM "WhatsAppContact" c WHERE c.id=$1`, [tok.contactId]).catch(() => ({ rows: [] }));
          const c = rows[0];
          if (c) prefill = { senderName: [c.name, c.lastName].filter(Boolean).join(' '), senderEmail: c.email || '', district: c.district || '', club: c.siteId || '', role: c.orgRole || '' };
          // El enlace de campaña también fija el contexto.
          if (tok.campaignId && !ctx.campaign) {
            const { rows: cs } = await db.query(`SELECT * FROM "ContentActivationCampaign" WHERE id=$1`, [tok.campaignId]).catch(() => ({ rows: [] }));
            if (cs[0]?.contributionCampaignId) {
              const { rows: cc } = await db.query(`SELECT * FROM "ContributionCampaign" WHERE id=$1`, [cs[0].contributionCampaignId]).catch(() => ({ rows: [] }));
              if (cc[0]) ctx.campaign = cc[0];
              ctx.mode = 'campaign';
            }
          }
        }
      } catch { /* prefill es cortesía, nunca bloquea */ }
    }
    const camp = ctx.campaign;
    const content = camp ? normalizeContent(camp.content) : {};
    const sub = content.submissions || {};
    // Contexto dinámico (v4.1119): la campaña sugiere tipo/programa/área por
    // palabras clave. Solo se conservan slugs de taxonomías activas; el
    // usuario puede cambiar la preselección.
    let suggested = {};
    if (ctx.mode === 'campaign' && camp) {
      try {
        const { suggestForCampaign } = await import('../lib/rotaryTaxonomySpec.js');
        const cand = suggestForCampaign(camp.name, camp.slug);
        for (const [kind, slug] of [['tipo', cand.tipo], ['programa', cand.programa], ['area', cand.area]]) {
          if (!slug) continue;
          const { rows } = await db.query(
            `SELECT slug, name FROM "RotaryTaxonomy" WHERE kind=$1 AND slug=$2 AND active=TRUE LIMIT 1`,
            [kind, slug]);
          if (rows[0]) {
            if (kind === 'tipo') { suggested.tipo = rows[0].slug; suggested.tipoName = rows[0].name; }
            if (kind === 'programa') { suggested.programa = rows[0].slug; suggested.programaName = rows[0].name; }
            if (kind === 'area') { suggested.area = rows[0].slug; suggested.areaName = rows[0].name; }
          }
        }
      } catch { /* sin sugerencia: el formulario arranca neutro */ }
    }
    const tax = await treeTaxonomies();
    const isProjectFair = host.includes('rotaryprojectfair') || req.query.canal === 'feria' || req.query.mode === 'project_fair' || req.query.initiative === 'feria_proyectos';
    res.json({
      site,
      isProjectFair,
      mode: ctx.mode,
      campaign: camp ? { id: camp.id, slug: camp.slug, name: camp.name, headline: sub.headline || camp.name, intro: sub.intro || '', thanksMessage: sub.thanksMessage || '', consentText: consentTextFor(sub), consentIsProvisional: !consentIsConfigured(sub.consentText), image: content.hero?.image || '' } : null,
      contextTax: ctx.tax,
      suggested,
      taxonomies: tax,
      photoRules: { minToSubmit: 5, recommended: 5, reelMin: 5, maxFiles: 11, ...(cfg.photoRules || {}), minToSubmit: 5, maxFiles: 11 },
      requireStory: !!cfg.requireStory,
      catalogs: { districts: DISTRICT_CATALOG },
      platforms: POST_PLATFORMS,
      limits: { maxFiles: 11, maxClubs: MAX_PARTICIPATING_CLUBS, maxPosts: MAX_POSTS },
      prefill,
    });
  } catch (e) { return fail(res, e); }
};

// ─── POST /presign — público ───────────────────────────────────────────
export const presign = async (req, res) => {
  try {
    const { campaignId, contentType, filename, size, type, name } = req.body || {};
    const resolvedType = contentType || type;
    const resolvedName = filename || name;
    const camp = campaignId
      ? (await db.query(`SELECT id FROM "ContributionCampaign" WHERE id=$1 OR slug=$1`, [String(campaignId)]).then((r) => r.rows[0]).catch(() => null))
      : null;
    const cid = camp?.id || (await universalCampaignId());
    const out = await presignSubmissionUpload({ campaignId: cid, contentType: resolvedType, filename: resolvedName, size });
    if (!out.ok) {
      return res.status(400).json({ error: out.errores?.[0] || 'No se pudo preparar la subida.', errores: out.errores });
    }
    res.json({ ...out, campaignId: cid });
  } catch (e) { return fail(res, e, 400); }
};

// ─── POST /submit — público ────────────────────────────────────────────
export const submit = async (req, res) => {
  try {
    await ensureRotaryEnAccionSchema();
    const { campaignSlug, ca_token, utm_source, utm_medium, utm_campaign } = req.body || {};
    const ctx = await resolveContext({ campaign: campaignSlug });
    const camp = ctx.campaign || await db.query(`SELECT * FROM "ContributionCampaign" WHERE id=$1`, [await universalCampaignId()]).then((r) => r.rows[0]);
    if (!camp) return res.status(404).json({ error: 'No encontramos el canal de recepción.' });
    const cfg = await getConfig();
    const minPhotos = Math.max(5, Number(cfg.photoRules?.minToSubmit ?? 5));

    const data = shapeSubmission(req.body);
    const juicio = validateSubmission(data, {
      districtCatalog: DISTRICT_CATALOG,
      minPhotos,
      maxPhotos: 10,
      maxVideos: 1,
    });
    if (!juicio.ok) return res.status(400).json({ error: juicio.errors[0], errors: juicio.errors });

    const archivos = [];
    for (const f of data.files) {
      if (!stagingKeyBelongs(f.key, camp.id)) return res.status(400).json({ error: 'Uno de los archivos no corresponde a este envío. Volvé a adjuntarlo.' });
      const head = await headSubmissionFile(f.key, { filename: f.filename, contentType: f.contentType });
      if (!head.ok) return res.status(400).json({ error: head.error });
      archivos.push({ ...f, bytes: head.bytes, kind: head.kind, contentType: head.mime || f.contentType });
    }

    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    let origin = { clubId: null, host };
    try {
      const { resolveSiteId } = await import('../lib/linkRedirectStore.js');
      origin.clubId = await resolveSiteId(host);
    } catch (e) {
      console.warn('[rotary-en-accion] origen no resuelto por host:', e.message);
    }

    // Fallback inteligente si el host no resuelve a un club concreto (ej. app.clubplatform.org)
    if (!origin.clubId && data.club) {
      try {
        const { siteMatchKey } = await import('../lib/submissionArticleSpec.js');
        const sKey = siteMatchKey(data.club);
        const { rows: matched } = await db.query(
          `SELECT id, name FROM "Club" WHERE status != 'inactive' AND type != 'district'`
        );
        const found = matched.find(c => siteMatchKey(c.name) === sKey);
        if (found) origin.clubId = found.id;
      } catch {}
    }
    if (!origin.clubId && data.district) {
      try {
        const { rows: distClub } = await db.query(
          `SELECT id FROM "Club" WHERE type = 'district' AND (district = $1 OR "districtId" = $1) LIMIT 1`,
          [String(data.district)]
        );
        if (distClub[0]) origin.clubId = distClub[0].id;
      } catch {}
    }
    if (!origin.clubId && (camp.slug === 'rotary-en-accion' || camp.id === 'rotary-en-accion-universal')) {
      origin.clubId = camp.recipientClubId || '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a';
    }

    const submission = await createSubmission({
      campaignId: camp.id, data, files: archivos,
      consentText: GENERAL_CONSENT_TEXT,
      warnings: juicio.warnings, origin,
    });

    // Attribution de campaña + UTM (nunca tumba).
    try {
      const { attributeSubmission } = await import('./contentActivationEngine.js');
      if (ca_token) await attributeSubmission(submission.id, String(ca_token), { channel: 'rotary_en_accion' });
      if (utm_source || utm_medium || utm_campaign) {
        await db.query(`UPDATE "ContributionSubmission" SET "utmSource"=$2,"utmMedium"=$3,"utmCampaign"=$4 WHERE id=$1`,
          [submission.id, utm_source || null, utm_medium || null, utm_campaign || null]).catch(() => {});
      }
    } catch { /* noop */ }

    if (autoArticlesEnabled()) {
      enqueueArticle({ submissionId: submission.id, campaignId: camp.id, clubId: origin.clubId || camp.recipientClubId || null }).catch(() => {});
    }
    postSubmit(submission, { files: archivos, photoRules: cfg.photoRules, windowDays: Number(cfg.duplicateWindowDays) || 90 }).catch(() => {});

    res.json({ ok: true, id: submission.id, warnings: juicio.warnings, campaign: { id: camp.id, slug: camp.slug, name: camp.name } });
  } catch (e) { return fail(res, e); }
};

// ─── Borradores — público con token ────────────────────────────────────
export const saveDraftEp = async (req, res) => {
  try {
    const { token, campaignId, payload, contactEmail } = req.body || {};
    const out = await saveDraft({ token, campaignId, payload, contactEmail });
    res.json({ ok: true, ...out });
  } catch (e) { return fail(res, e); }
};
export const getDraftEp = async (req, res) => {
  try {
    const d = await getDraft(req.params.token);
    if (!d) return res.status(404).json({ error: 'Borrador no encontrado.' });
    res.json({ draft: d });
  } catch (e) { return fail(res, e); }
};
export const deleteDraftEp = async (req, res) => {
  try { await deleteDraft(req.params.token); res.json({ ok: true }); } catch (e) { return fail(res, e); }
};

// ─── POST /assist — IA que pregunta, no que inventa ─────────────────────
export const assist = async (req, res) => {
  try {
    const { story = '', fields = {} } = req.body || {};
    const { assistantQuestions } = await import('../lib/rotaryTaxonomySpec.js');
    const len = String(story).trim().length;
    const base = assistantQuestions({
      logro: len > 200, participantes: !!fields.asistentes, beneficiarios: !!fields.beneficiarios,
      lugar: !!fields.lugar, papelClub: len > 120, resultado: len > 300,
    });
    let ai = [];
    if (len > 0 && len < 400) {
      try {
        const { routeToModel } = await import('../lib/ai-router.js');
        const raw = await routeToModel('gemini-2.5-flash',
          'Ayudas a un rotario a contar mejor su historia. Devuelve SOLO JSON: {"preguntas":["..."]}. Máximo 3 preguntas concretas basadas en su texto. No inventes datos.',
          `Historia: ${String(story).slice(0, 1200)}`, [], { maxTokens: 300 });
        const m = String(raw || '').match(/\{[\s\S]*\}/);
        if (m) { const j = JSON.parse(m[0]); if (Array.isArray(j.preguntas)) ai = j.preguntas.slice(0, 3); }
      } catch { /* sin IA no hay sugerencias: el formulario sigue igual */ }
    }
    const seen = new Set();
    const preguntas = [...ai, ...base].filter((q) => !seen.has(q) && seen.add(q)).slice(0, 4);
    res.json({ preguntas, short: len < 60 });
  } catch (e) { return fail(res, e); }
};

// ─── Admin: taxonomías ─────────────────────────────────────────────────
export const adminList = async (req, res) => {
  try {
    const { kind } = req.query;
    const rows = kind ? await listTaxonomies(kind) : await treeTaxonomies();
    res.json(Array.isArray(rows) ? { taxonomies: rows } : rows);
  } catch (e) { return fail(res, e); }
};
export const adminUpsert = async (req, res) => {
  try {
    if (!['tipo', 'area', 'programa', 'tema'].includes(req.body.kind)) return res.status(400).json({ error: 'kind inválido' });
    if (!req.body.slug || !req.body.name) return res.status(400).json({ error: 'slug y nombre obligatorios' });
    const id = await upsertTaxonomy(req.body, req.user?.id);
    res.status(201).json({ ok: true, id });
  } catch (e) { return fail(res, e); }
};
export const adminActive = async (req, res) => {
  try { await setTaxonomyActive(req.params.id, req.body.active !== false); res.json({ ok: true }); } catch (e) { return fail(res, e); }
};
export const adminConfigGet = async (req, res) => {
  try { res.json({ config: await getConfig() }); } catch (e) { return fail(res, e); }
};
export const adminConfigPut = async (req, res) => {
  try { res.json({ ok: true, config: await putConfig(req.body || {}) }); } catch (e) { return fail(res, e); }
};

// ─── Admin: analítica (solo datos reportados, nunca estimados) ──────────
export const stats = async (req, res) => {
  try {
    await ensureRotaryEnAccionSchema();
    const uni = await universalCampaignId();    const funnel = await db.query(
      `SELECT status, COUNT(*)::int AS n FROM "ContributionSubmission" GROUP BY status`).then((r) => r.rows).catch(() => []);
    const byTipo = await db.query(
      `SELECT COALESCE(NULLIF("contentType",''),'sin_clasificar') AS k, COUNT(*)::int AS n FROM "ContributionSubmission" GROUP BY 1 ORDER BY 2 DESC LIMIT 20`).then((r) => r.rows).catch(() => []);
    const byArea = await db.query(
      `SELECT COALESCE(NULLIF("areaFocus",''),'sin_clasificar') AS k, COUNT(*)::int AS n FROM "ContributionSubmission" GROUP BY 1 ORDER BY 2 DESC LIMIT 20`).then((r) => r.rows).catch(() => []);
    const byProg = await db.query(
      `SELECT COALESCE(NULLIF(program,''),'sin_clasificar') AS k, COUNT(*)::int AS n FROM "ContributionSubmission" GROUP BY 1 ORDER BY 2 DESC LIMIT 20`).then((r) => r.rows).catch(() => []);
    const byMonth = await db.query(
      `SELECT to_char("createdAt",'YYYY-MM') AS k, COUNT(*)::int AS n FROM "ContributionSubmission" GROUP BY 1 ORDER BY 1 DESC LIMIT 12`).then((r) => r.rows).catch(() => []);
    const impacto = await db.query(
      `SELECT COUNT(*)::int AS solicitudes,
        COALESCE(SUM((impact->>'beneficiarios')::int),0)::int AS beneficiarios,
        COALESCE(SUM((impact->>'voluntarios')::int),0)::int AS voluntarios,
        COALESCE(SUM((impact->>'horas')::int),0)::int AS horas,
        COALESCE(SUM((impact->>'fondosRecaudados')::numeric),0)::float AS "fondosRecaudados",
        COALESCE(SUM((impact->>'fondosInvertidos')::numeric),0)::float AS "fondosInvertidos",
        COALESCE(SUM((impact->>'capacitados')::int),0)::int AS capacitados
       FROM "ContributionSubmission" WHERE impact IS NOT NULL`).then((r) => r.rows[0]).catch(() => ({}));
    const ciudades = await db.query(
      `SELECT city AS k, COUNT(*)::int AS n FROM "ContributionSubmission" WHERE city IS NOT NULL AND city<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 50`).then((r) => r.rows).catch(() => []);
    const universal = await db.query(`SELECT COUNT(*)::int AS n FROM "ContributionSubmission" WHERE "campaignId"=$1`, [uni]).then((r) => r.rows[0]?.n || 0).catch(() => 0);
    res.json({ funnel, porTipo: byTipo, porArea: byArea, porPrograma: byProg, porMes: byMonth, impactoReportado: impacto, ciudades, universal, reportedOnly: true });
  } catch (e) { return fail(res, e); }
};

// ─── Admin: tablero de gestión y analítica ───────────────────────────────
// Respeta el mismo alcance de la bandeja (campaignIdsInScope) y fija el
// distrito del no operador al suyo. Sin inventar: todo sale de registros.
export const board = async (req, res) => {
  try {
    const alcance = await campaignIdsInScope(req);
    const scope = await resolveScope(req, alcance);
    const data = await dashboard(scope, {
      from: req.query.from, to: req.query.to, district: req.query.district,
      club: req.query.club, contentType: req.query.contentType || req.query.tipo,
      status: req.query.status || req.query.estado, gran: req.query.gran,
    });
    res.json(data);
  } catch (e) { return fail(res, e); }
};

export const related = async (req, res) => {  try {
    const { rows } = await db.query(`SELECT * FROM "ContributionSubmission" WHERE id=$1`, [req.params.id]);
    const s = rows[0];
    if (!s) return res.status(404).json({ error: 'No encontrada' });
    const { findDuplicates } = await import('../lib/rotaryEngine.js');
    const clubs = await db.query(`SELECT "clubKey" FROM "ContributionSubmissionClub" WHERE "submissionId"=$1`, [s.id]).then((r) => r.rows.map((x) => x.clubKey)).catch(() => []);
    const dups = await findDuplicates({ excludeId: s.id, clubText: s.club, clubKeys: clubs, activityDate: s.activityDate, title: s.title, city: s.city, campaignId: s.campaignId });
    res.json({ related: dups });
  } catch (e) { return fail(res, e); }
};

// ─── Feria de Proyectos: Búsqueda de Proyectos Existentes ───────────────
export const searchFairProjects = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const queryTerm = `%${q}%`;
    const results = [];

    // 1. Proyectos generales en "Project"
    try {
      const { rows: projectRows } = await db.query(
        `SELECT p.id, p.title, p.description, p.category, p."clubId", c.name as "clubName", c.district
         FROM "Project" p
         LEFT JOIN "Club" c ON c.id = p."clubId"
         WHERE p."deletedAt" IS NULL
           AND ($1 = '%%' OR p.title ILIKE $1 OR p.description ILIKE $1 OR c.name ILIKE $1)
         ORDER BY p."createdAt" DESC
         LIMIT 10`,
        [queryTerm]
      );
      for (const r of projectRows) {
        results.push({
          id: r.id,
          source: 'project',
          title: r.title,
          description: r.description ? r.description.slice(0, 160) + '...' : '',
          club: r.clubName || 'Club Rotario',
          district: r.district || '',
          area: r.category || '',
          edition: 'Banco de Proyectos',
        });
      }
    } catch (e) {
      console.warn('[searchFairProjects] error querying Project:', e.message);
    }

    // 2. Postulaciones oficiales de la Feria en "ProjectFairSubmission"
    try {
      const { rows: fairRows } = await db.query(
        `SELECT id, "publicRef", "projectName", "projectDescription", "clubName", district, "focusAreaLabel", "editionKey"
         FROM "ProjectFairSubmission"
         WHERE "archivedAt" IS NULL
           AND ($1 = '%%' OR "projectName" ILIKE $1 OR "clubName" ILIKE $1 OR "publicRef" ILIKE $1)
         ORDER BY "createdAt" DESC
         LIMIT 15`,
        [queryTerm]
      );
      for (const r of fairRows) {
        results.push({
          id: r.id,
          source: 'fair_submission',
          publicRef: r.publicRef,
          title: r.projectName,
          description: r.projectDescription ? r.projectDescription.slice(0, 160) + '...' : '',
          club: r.clubName || '',
          district: r.district || '',
          area: r.focusAreaLabel || '',
          edition: r.editionKey || 'Feria de Proyectos Colombia',
        });
      }
    } catch (e) {
      console.warn('[searchFairProjects] error querying ProjectFairSubmission:', e.message);
    }

    res.json({ results });
  } catch (e) {
    return fail(res, e);
  }
};

// ─── Feria de Proyectos: Bandeja Especializada de Solicitudes ───────────
export const getFairSubmissions = async (req, res) => {
  try {
    await ensureRotaryEnAccionSchema();
    const {
      status, district, club, country, area, edition, goalType, q,
      tab = 'all', page = 1, perPage = 25
    } = req.query;

    const alcance = await campaignIdsInScope(req);
    const scope = await resolveScope(req, alcance);

    const conditions = [];
    const params = [];
    let pIdx = 1;

    // Filtro transversal al canal de la Feria de Proyectos
    conditions.push(`(
      s."submissionType" = 'project_fair'
      OR s."projectFairEdition" IS NOT NULL
      OR s."projectGoalType" IS NOT NULL
      OR s."originHost" ILIKE '%projectfair%'
      OR s."originHost" ILIKE '%feriadeproyectos%'
    )`);

    // Aislamiento de alcance si el usuario no es operador global
    if (!scope.isOperator) {
      if (Array.isArray(scope.campaignIds) && scope.campaignIds.length > 0) {
        conditions.push(`(s."campaignId" = ANY($${pIdx}) OR s."originClubId" = $${pIdx + 1})`);
        params.push(scope.campaignIds, req.user?.clubId || '');
        pIdx += 2;
      } else if (req.user?.clubId) {
        conditions.push(`s."originClubId" = $${pIdx}`);
        params.push(req.user.clubId);
        pIdx++;
      }
    }

    // Filtros por pestaña rápida
    if (tab === 'nuevos') {
      conditions.push(`s."projectGoalType" = 'nuevo'`);
    } else if (tab === 'avances') {
      conditions.push(`s."projectGoalType" IN ('avances', 'nueva_etapa')`);
    } else if (tab === 'historias') {
      conditions.push(`s."projectGoalType" = 'historia_exito'`);
    } else if (tab === 'financiacion') {
      conditions.push(`(s."projectGoalType" = 'buscar_aliados_financiacion' OR (s."projectEvolution"->>'necesidadesActuales') IS NOT NULL)`);
    } else if (tab === 'alianzas') {
      conditions.push(`(
        (s."projectEvolution"->>'participacionInternacional') IS NOT NULL
        OR (s."projectEvolution"->>'clubesAliados') IS NOT NULL
      )`);
    } else if (tab === 'listos') {
      conditions.push(`s.status = 'listo_difusion'`);
    } else if (tab === 'publicados') {
      conditions.push(`s.status = 'publicado'`);
    }

    if (status) {
      conditions.push(`s.status = $${pIdx}`);
      params.push(status);
      pIdx++;
    }
    if (district) {
      conditions.push(`s.district ILIKE $${pIdx}`);
      params.push(`%${district}%`);
      pIdx++;
    }
    if (club) {
      conditions.push(`s.club ILIKE $${pIdx}`);
      params.push(`%${club}%`);
      pIdx++;
    }
    if (country) {
      conditions.push(`s.country ILIKE $${pIdx}`);
      params.push(`%${country}%`);
      pIdx++;
    }
    if (area) {
      conditions.push(`(s."areaFocus" = $${pIdx} OR $${pIdx} = ANY(s."secondaryAreas"))`);
      params.push(area);
      pIdx++;
    }
    if (edition) {
      conditions.push(`s."projectFairEdition" ILIKE $${pIdx}`);
      params.push(`%${edition}%`);
      pIdx++;
    }
    if (goalType) {
      conditions.push(`s."projectGoalType" = $${pIdx}`);
      params.push(goalType);
      pIdx++;
    }
    if (q) {
      conditions.push(`(s.title ILIKE $${pIdx} OR s.club ILIKE $${pIdx} OR s."senderName" ILIKE $${pIdx} OR s.city ILIKE $${pIdx})`);
      params.push(`%${q}%`);
      pIdx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalQuery = `SELECT COUNT(*)::int as total FROM "ContributionSubmission" s ${whereClause}`;
    const totalRes = await db.query(totalQuery, params);
    const total = totalRes.rows[0]?.total || 0;

    const offset = (Math.max(1, Number(page)) - 1) * Number(perPage);
    const listQuery = `
      SELECT s.*,
        (SELECT COUNT(*)::int FROM "ContributionSubmissionFile" f WHERE f."submissionId" = s.id AND f.kind = 'image') as "imageCount",
        (SELECT COUNT(*)::int FROM "ContributionSubmissionFile" f WHERE f."submissionId" = s.id AND f.kind = 'video') as "videoCount",
        (SELECT json_agg(json_build_object('id', f.id, 'kind', f.kind, 's3Key', f."s3Key", 'filename', f.filename))
         FROM "ContributionSubmissionFile" f WHERE f."submissionId" = s.id) as files
      FROM "ContributionSubmission" s
      ${whereClause}
      ORDER BY s."createdAt" DESC
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;
    const { rows: submissions } = await db.query(listQuery, [...params, Number(perPage), offset]);

    const baseWhere = `(
      s."submissionType" = 'project_fair'
      OR s."projectFairEdition" IS NOT NULL
      OR s."projectGoalType" IS NOT NULL
      OR s."originHost" ILIKE '%projectfair%'
      OR s."originHost" ILIKE '%feriadeproyectos%'
    )`;
    const metricsRes = await db.query(`
      SELECT
        COUNT(*)::int as total,
        COUNT(DISTINCT s.club)::int as "clubesParticipantes",
        COUNT(DISTINCT s.district)::int as distritos,
        COUNT(DISTINCT COALESCE(s.country, 'Colombia'))::int as paises,
        COUNT(CASE WHEN s."projectGoalType" = 'nuevo' THEN 1 END)::int as nuevos,
        COUNT(CASE WHEN s."projectGoalType" IN ('avances', 'nueva_etapa') THEN 1 END)::int as actualizaciones,
        COUNT(CASE WHEN s."projectGoalType" = 'historia_exito' THEN 1 END)::int as "historiasExito",
        COUNT(CASE WHEN s."projectGoalType" = 'buscar_aliados_financiacion' OR (s."projectEvolution"->>'necesidadesActuales') IS NOT NULL THEN 1 END)::int as "buscanFinanciacion",
        COUNT(CASE WHEN (s."projectEvolution"->>'participacionInternacional') IS NOT NULL OR (s."projectEvolution"->>'clubesAliados') IS NOT NULL THEN 1 END)::int as "alianzasInternacionales",
        COUNT(CASE WHEN s.status = 'listo_difusion' THEN 1 END)::int as "listasDifusion",
        COUNT(CASE WHEN s.status = 'publicado' THEN 1 END)::int as publicadas
      FROM "ContributionSubmission" s
      WHERE ${baseWhere}
    `);
    const resumen = metricsRes.rows[0] || {};

    const facetsRes = await db.query(`
      SELECT
        ARRAY_AGG(DISTINCT s.district) FILTER (WHERE s.district IS NOT NULL AND s.district <> '') as distritos,
        ARRAY_AGG(DISTINCT s.club) FILTER (WHERE s.club IS NOT NULL AND s.club <> '') as clubes,
        ARRAY_AGG(DISTINCT COALESCE(s.country, 'Colombia')) FILTER (WHERE s.country IS NOT NULL) as paises,
        ARRAY_AGG(DISTINCT s."projectFairEdition") FILTER (WHERE s."projectFairEdition" IS NOT NULL) as ediciones
      FROM "ContributionSubmission" s
      WHERE ${baseWhere}
    `);
    const facets = facetsRes.rows[0] || {};

    res.json({
      submissions,
      total,
      page: Number(page),
      perPage: Number(perPage),
      resumen,
      facets: {
        distritos: facets.distritos || [],
        clubes: facets.clubes || [],
        paises: facets.paises || ['Colombia'],
        ediciones: facets.ediciones || ['XII Edición Valledupar 2027', 'XI Edición Bucaramanga 2026', 'X Edición Cartagena 2025'],
      }
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ─── Feria de Proyectos: Métricas y Trazabilidad ────────────────────────
export const getFairStats = async (req, res) => {
  try {
    const baseWhere = `(
      s."submissionType" = 'project_fair'
      OR s."projectFairEdition" IS NOT NULL
      OR s."projectGoalType" IS NOT NULL
      OR s."originHost" ILIKE '%projectfair%'
      OR s."originHost" ILIKE '%feriadeproyectos%'
    )`;

    const [areasRes, goalsRes, timelineRes, geographicRes] = await Promise.all([
      db.query(`SELECT COALESCE(s."areaFocus", 'Otras iniciativas') as area, COUNT(*)::int as total
                FROM "ContributionSubmission" s WHERE ${baseWhere} GROUP BY 1 ORDER BY 2 DESC`),
      db.query(`SELECT COALESCE(s."projectGoalType", 'general') as goal, COUNT(*)::int as total
                FROM "ContributionSubmission" s WHERE ${baseWhere} GROUP BY 1 ORDER BY 2 DESC`),
      db.query(`SELECT TO_CHAR(s."createdAt", 'YYYY-MM') as mes, COUNT(*)::int as total
                FROM "ContributionSubmission" s WHERE ${baseWhere} GROUP BY 1 ORDER BY 1 ASC LIMIT 12`),
      db.query(`SELECT COALESCE(s.country, 'Colombia') as pais, COUNT(DISTINCT s.district)::int as distritos, COUNT(DISTINCT s.club)::int as clubes, COUNT(*)::int as total
                FROM "ContributionSubmission" s WHERE ${baseWhere} GROUP BY 1 ORDER BY 4 DESC`),
    ]);

    res.json({
      porArea: areasRes.rows,
      porObjetivo: goalsRes.rows,
      evolucionMes: timelineRes.rows,
      distribucionGeografica: geographicRes.rows,
    });
  } catch (e) {
    return fail(res, e);
  }
};

