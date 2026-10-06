// ════════════════════════════════════════════════════════════════════════════
// BD en memoria para el ciclo de vida de Campañas de Contenido — v4.1163
//
// Sigue la regla de `db-inbox-stub.mjs`: NO reimplementa el criterio, solo
// persiste lo que el SQL real dice (upserts, transiciones, inscripciones con
// su UNIQUE, eventos). Si el controlador dejara de escribir el estado o
// duplicara ejecuciones, este doble lo mostraría y la prueba fallaría.
//
// El JSONB de Postgres se devuelve parseado (como hace `pg`), para que lo
// que lee el controlador sea lo mismo que en producción.
// ════════════════════════════════════════════════════════════════════════════

export const datos = (globalThis.__CA_STUB__ ??= {
  campaigns: [],
  executions: [],
  enrollments: [],
  events: [],
  consultas: [],
  templates: [],
  templateVersions: [],
  overrides: [],
});

export const reset = () => {
  const d = globalThis.__CA_STUB__;
  d.campaigns = [];
  d.executions = [];
  d.enrollments = [];
  d.events = [];
  d.consultas = [];
  d.templates = [];
  d.templateVersions = [];
  d.overrides = [];
};

const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();
const J = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
};
const ahora = () => new Date().toISOString();

const countsFor = (campaignId) => ({
  executionCount: datos.executions.filter((e) => String(e.campaignId) === String(campaignId)).length,
  enrollmentCount: datos.enrollments.filter((n) => String(n.campaignId) === String(campaignId)).length,
});

const withCounts = (c) => {
  const execs = datos.executions
    .filter((e) => String(e.campaignId) === String(c.id))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const last = execs[0];
  return {
    ...c,
    ...countsFor(c.id),
    lastExecutionAt: last?.createdAt || null,
    lastExecutionStatus: last?.status || null,
    lastPeriodoLabel: last?.periodoLabel || null,
  };
};

const query = async (sql, params = []) => {
  const t = norm(sql);
  datos.consultas.push({ sql: t, params });

  // DDL / ensures: no hacen nada; la primera consulta de catálogo declara
  // todo presente para no correr la ráfaga (igual que en producción, donde
  // las tablas ya existen).
  if (/^(CREATE|ALTER|DROP|COMMENT|CREATE INDEX)/i.test(t)) return { rows: [] };
  if (/information_schema/.test(t)) {
    return { rows: [{ table_name: 'ContentActivationCampaign' }, { table_name: 'ContentActivationExecution' }, { table_name: 'ContentActivationEnrollment' }, { table_name: 'ContentActivationEvent' }] };
  }

  // ── Plantillas (v4.1166) ──────────────────────────────────────────────
  if (/INSERT INTO "ContentActivationTemplateVersion"/.test(t)) {
    const [id, templateId, version, design, html, subject, preheader, note, createdBy] = params;
    datos.templateVersions.push({
      id, templateId, version, design: J(design), html, subject, preheader, note, createdBy,
      createdAt: ahora(),
    });
    return { rows: [] };
  }
  if (/INSERT INTO "ContentActivationTemplate"\(/.test(t)) {
    const [id, scope, name, channel, design, html, subject, preheader, createdBy] = params;
    const status = /'borrador'/.test(t) ? 'borrador' : 'activa';
    datos.templates.push({
      id, scope, name, channel, design: J(design), html, subject, preheader,
      isDefault: false, status, version: 1, createdBy,
      createdAt: ahora(), updatedAt: ahora(),
    });
    return { rows: [] };
  }
  if (/FROM "ContentActivationTemplate" t/.test(t)) {
    let rows = [...datos.templates];
    // `status = ANY($N)` (gestor con ?all=1 / ?status=) o literal `status='activa'`.
    const anyM = t.match(/status = ANY\(\$(\d+)\)/);
    if (anyM) {
      const lista = params[Number(anyM[1]) - 1] || [];
      rows = rows.filter((x) => lista.includes(x.status));
    } else if (/status='activa'/.test(t)) {
      rows = rows.filter((x) => x.status === 'activa');
    }
    const chanM = t.match(/channel=\$(\d+)/);
    if (chanM) rows = rows.filter((x) => String(x.channel) === String(params[Number(chanM[1]) - 1]));
    const scopeM = t.match(/scope=\$(\d+)/);
    if (scopeM && params[Number(scopeM[1]) - 1]) rows = rows.filter((x) => String(x.scope) === String(params[Number(scopeM[1]) - 1]));
    rows = rows.map((x) => ({ ...x, versions: datos.templateVersions.filter((v) => String(v.templateId) === String(x.id)).length }));
    // Orden del servidor: predeterminadas primero, luego recientes.
    rows.sort((a, b) => Number(b.isDefault || false) - Number(a.isDefault || false)
      || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return { rows: rows.slice(0, 100) };
  }
  if (/SELECT \* FROM "ContentActivationTemplate" WHERE id=\$1/.test(t)) {
    const x = datos.templates.find((r) => String(r.id) === String(params[0]));
    return { rows: x ? [{ ...x }] : [] };
  }
  if (/FROM "ContentActivationTemplateVersion" WHERE "templateId"=\$1 AND version=\$2/.test(t)) {
    const v = datos.templateVersions.find((r) => String(r.templateId) === String(params[0]) && Number(r.version) === Number(params[1]));
    return { rows: v ? [{ ...v }] : [] };
  }
  if (/FROM "ContentActivationTemplateVersion" WHERE "templateId"=\$1 ORDER BY version DESC/.test(t)) {
    const rows = datos.templateVersions
      .filter((r) => String(r.templateId) === String(params[0]))
      .sort((a, b) => Number(b.version) - Number(a.version));
    return { rows: rows.map((r) => ({ ...r })) };
  }
  if (/UPDATE "ContentActivationTemplate" SET design=\$2/.test(t)) {
    const [id, design, html, subject, preheader, name, next] = params;
    const x = datos.templates.find((r) => String(r.id) === String(id));
    if (x) {
      x.design = J(design); x.html = html; x.subject = subject; x.preheader = preheader;
      x.name = name; x.version = next; x.updatedAt = ahora();
    }
    return { rows: [] };
  }
  if (/UPDATE "ContentActivationTemplate" SET status=\$2/.test(t)) {
    const x = datos.templates.find((r) => String(r.id) === String(params[0]));
    if (x) { x.status = params[1]; x.updatedAt = ahora(); }
    return { rows: [] };
  }
  if (/UPDATE "ContentActivationTemplate" SET "isDefault"=FALSE WHERE channel=\$1 AND scope=\$2/.test(t)) {
    for (const x of datos.templates) {
      if (String(x.channel) === String(params[0]) && String(x.scope) === String(params[1])) x.isDefault = false;
    }
    return { rows: [] };
  }
  if (/UPDATE "ContentActivationTemplate" SET "isDefault"=TRUE WHERE id=\$1/.test(t)) {
    const x = datos.templates.find((r) => String(r.id) === String(params[0]));
    if (x) x.isDefault = true;
    return { rows: [] };
  }
  if (/DELETE FROM "ContentActivationTemplateVersion" WHERE "templateId"=\$1/.test(t)) {
    datos.templateVersions = datos.templateVersions.filter((r) => String(r.templateId) !== String(params[0]));
    return { rows: [] };
  }
  if (/DELETE FROM "ContentActivationTemplate" WHERE id=\$1/.test(t)) {
    datos.templates = datos.templates.filter((r) => String(r.id) !== String(params[0]));
    return { rows: [] };
  }
  if (/SELECT COUNT\(\*\)::int AS n FROM "ContentActivationTemplate"/.test(t)) {
    // Conteo total o por nombre (siembra idempotente de las 4 del flujo).
    const nameM = t.match(/WHERE name='([^']+)'/);
    const rows = nameM
      ? datos.templates.filter((x) => x.name === nameM[1])
      : datos.templates;
    return { rows: [{ n: rows.length }] };
  }
  if (/FROM "ContentActivationTemplate" WHERE scope='global' AND channel='email' AND name=\$1/.test(t)) {
    const x = datos.templates.find((r) => r.scope === 'global' && r.channel === 'email' && String(r.name) === String(params[0]));
    return { rows: x ? [{ id: x.id }] : [] };
  }
  if (/FROM "ContentActivationTemplate" WHERE scope='global' AND channel='email' AND status='activa'/.test(t)) {
    return { rows: datos.templates.filter((r) => r.scope === 'global' && r.channel === 'email' && r.status === 'activa').map((r) => ({ id: r.id, name: r.name, version: r.version })) };
  }
  // ── Overrides de calendario (v4.1169) ────────────────────────────────
  if (/INSERT INTO "ContentActivationScheduleOverride"/.test(t)) {
    // El SQL trae la acción como literal ('omitir' / 'reprogramar'); los $N
    // son: omitir → (id, campaign, ciclo, paso, reason, createdBy);
    // reprogramar → (id, campaign, ciclo, paso, newDate, reason, createdBy).
    const actM = t.match(/'(omitir|reprogramar)'/);
    const action = actM ? actM[1] : 'omitir';
    const [id, campaignId, cycleIndex, stepKey, p5, p6, p7] = params;
    datos.overrides ??= [];
    const newDate = action === 'reprogramar' ? p5 : null;
    const reason = String(action === 'reprogramar' ? p6 : p5) || '';
    const createdBy = action === 'reprogramar' ? p7 : p6;
    const i = datos.overrides.findIndex((o) => String(o.campaignId) === String(campaignId) && Number(o.cycleIndex) === Number(cycleIndex) && String(o.stepKey) === String(stepKey));
    const row = { id, campaignId, cycleIndex: Number(cycleIndex), stepKey, action, newDate: newDate || null, reason: reason || '', createdBy, createdAt: ahora() };
    if (i >= 0) datos.overrides[i] = row;
    else datos.overrides.push(row);
    return { rows: [] };
  }
  if (/^SELECT "cycleIndex", "stepKey", action, "newDate" FROM "ContentActivationScheduleOverride" WHERE "campaignId"=\$1/.test(t)) {
    return { rows: (datos.overrides || []).filter((o) => String(o.campaignId) === String(params[0])).map((o) => ({ ...o })) };
  }
  if (/DELETE FROM "ContentActivationScheduleOverride"/.test(t)) {
    datos.overrides = (datos.overrides || []).filter((o) => !(String(o.campaignId) === String(params[0]) && Number(o.cycleIndex) === Number(params[1]) && String(o.stepKey) === String(params[2])));
    return { rows: [] };
  }

  // ── Campañas ──────────────────────────────────────────────────────────
  if (/INSERT INTO "ContentActivationCampaign"/.test(t)) {
    const p = params;
    const row = {
      id: p[0], clubId: p[1], name: p[2], description: p[3], objetivo: p[4],
      contributionCampaignId: p[5], startAt: p[6], endAt: p[7], timezone: p[8],
      frecuencia: p[9], customDays: p[10], canales: p[11],
      scopeDef: J(p[12]), audienceMode: p[13], audienceSnapshot: J(p[14]),
      excludedContactIds: p[15], manualRecipients: J(p[16]), savedSegmentId: p[17],
      contentDef: J(p[18]), audienceDef: J(p[19]), flowDef: J(p[20]),
      followRules: J(p[21]), variables: J(p[22]),
      status: p[23], createdBy: p[24], senderSiteId: p[25],
      updatedAt: ahora(),
    };
    const i = datos.campaigns.findIndex((c) => String(c.id) === String(row.id));
    if (i >= 0) datos.campaigns[i] = { ...datos.campaigns[i], ...row };
    else datos.campaigns.push({ ...row, createdAt: ahora() });
    return { rows: [] };
  }
  if (/SELECT \* FROM "ContentActivationCampaign" WHERE id=\$1/.test(t)) {
    const c = datos.campaigns.find((x) => String(x.id) === String(params[0]));
    return { rows: c ? [{ ...c }] : [] };
  }
  if (/FROM "ContentActivationCampaign" c/.test(t)) {
    return { rows: datos.campaigns.map(withCounts) };
  }
  if (/UPDATE "ContentActivationCampaign" SET status=\$2/.test(t)) {
    const c = datos.campaigns.find((x) => String(x.id) === String(params[0]));
    if (c) { c.status = params[1]; c.updatedAt = ahora(); }
    return { rows: [] };
  }
  if (/DELETE FROM "ContentActivationCampaign" WHERE id=\$1/.test(t)) {
    datos.campaigns = datos.campaigns.filter((x) => String(x.id) !== String(params[0]));
    return { rows: [] };
  }
  if (/SELECT \(SELECT COUNT\(\*\)::int FROM "ContentActivationExecution"/.test(t)) {
    const id = params[0];
    return {
      rows: [{
        executions: datos.executions.filter((e) => String(e.campaignId) === String(id)).length,
        enrollments: datos.enrollments.filter((n) => String(n.campaignId) === String(id)).length,
        events: datos.events.filter((v) => String(v.campaignId) === String(id)).length,
      }],
    };
  }

  // ── Ejecuciones ───────────────────────────────────────────────────────
  if (/INSERT INTO "ContentActivationExecution"/.test(t)) {
    const [id, campaignId, periodoLabel, startAt, endAt] = params;
    let status = 'programada';
    if (t.endsWith(",'activa')")) status = 'activa';
    datos.executions.push({ id, campaignId, periodoLabel, startAt, endAt, status, createdAt: ahora() });
    return { rows: [] };
  }
  if (/FROM "ContentActivationExecution" e WHERE e\."campaignId"=\$1/.test(t)) {
    const rows = datos.executions
      .filter((e) => String(e.campaignId) === String(params[0]))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((e) => ({
        ...e,
        enrolled: datos.enrollments.filter((n) => String(n.executionId) === String(e.id)).length,
        received: datos.enrollments.filter((n) => String(n.executionId) === String(e.id) && n.status === 'contenido_recibido').length,
      }));
    return { rows };
  }
  if (/FROM "ContentActivationExecution" WHERE "campaignId"=\$1 AND status IN/.test(t)) {
    const rows = datos.executions
      .filter((e) => String(e.campaignId) === String(params[0]) && ['programada', 'activa'].includes(e.status))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { rows: rows.slice(0, 1) };
  }
  if (/UPDATE "ContentActivationExecution" SET status='cerrada' WHERE id=\$1/.test(t)) {
    const e = datos.executions.find((x) => String(x.id) === String(params[0]));
    if (e) e.status = 'cerrada';
    return { rows: [] };
  }

  // ── Inscripciones (UNIQUE executionId+contactId como en producción) ──
  if (/INSERT INTO "ContentActivationEnrollment"/.test(t)) {
    const [id, executionId, campaignId, contactId, siteId, siteType, channel, contactSnapshot] = params;
    const dup = datos.enrollments.some((n) => String(n.executionId) === String(executionId) && String(n.contactId) === String(contactId));
    if (!dup) {
      datos.enrollments.push({
        id, executionId, campaignId, contactId, siteId, siteType, channel,
        status: 'por_enviar', attempts: 0, nextActionAt: ahora(),
        contactSnapshot: J(contactSnapshot), createdAt: ahora(), updatedAt: ahora(),
      });
    }
    return { rows: [] };
  }
  if (/SELECT \* FROM "ContentActivationEnrollment" WHERE id=\$1/.test(t)) {
    const n = datos.enrollments.find((x) => String(x.id) === String(params[0]));
    return { rows: n ? [{ ...n }] : [] };
  }
  if (/UPDATE "ContentActivationEnrollment" SET status='pausada'/.test(t)) {
    const n = datos.enrollments.find((x) => String(x.id) === String(params[0]));
    if (n) { n.status = 'pausada'; n.updatedAt = ahora(); }
    return { rows: [] };
  }
  if (/UPDATE "ContentActivationEnrollment" SET status='por_enviar',attempts=0/.test(t)) {
    const n = datos.enrollments.find((x) => String(x.id) === String(params[0]));
    if (n) { n.status = 'por_enviar'; n.attempts = 0; n.nextActionAt = ahora(); n.updatedAt = ahora(); }
    return { rows: [] };
  }

  // ── Lecturas para el calendario (v4.1169: overlay de estados reales) ──
  // Ancladas con ^SELECT: el stub evalúa por subcadena y un SELECT suelto
  // interceptaría otros statements (p. ej. el DELETE de overrides).
  if (/^SELECT id, "periodoLabel", "startAt", "endAt", status, "createdAt" FROM "ContentActivationExecution" WHERE "campaignId"=\$1/.test(t)) {
    return {
      rows: datos.executions
        .filter((e) => String(e.campaignId) === String(params[0]))
        .sort((a, b) => String(a.startAt || a.createdAt).localeCompare(String(b.startAt || b.createdAt)))
        .map((e) => ({ ...e })),
    };
  }
  if (/^SELECT type, channel, metadata, "executionId", "createdAt" FROM "ContentActivationEvent" WHERE "campaignId"=\$1/.test(t)) {
    return {
      rows: datos.events
        .filter((v) => String(v.campaignId) === String(params[0]))
        .map((v) => ({ ...v })),
    };
  }
  if (/^SELECT status, COUNT\(\*\)::int AS n FROM "ContentActivationEnrollment" WHERE "executionId"=\$1 GROUP BY/.test(t)) {
    const counts = {};
    for (const n of datos.enrollments.filter((x) => String(x.executionId) === String(params[0]))) {
      counts[n.status] = (counts[n.status] || 0) + 1;
    }
    return { rows: Object.entries(counts).map(([status, n]) => ({ status, n })) };
  }
  if (/INSERT INTO "ContentActivationEvent"/.test(t)) {
    const [id, enrollmentId, executionId, campaignId, type, channel, messageLogId, metadata] = params;
    datos.events.push({ id, enrollmentId, executionId, campaignId, type, channel, messageLogId, metadata: J(metadata), createdAt: ahora() });
    return { rows: [] };
  }

  // ── Catálogos ajenos que el flujo toca ────────────────────────────────
  if (/SELECT slug FROM "ContributionCampaign" WHERE id=\$1/.test(t)) {
    return { rows: [{ slug: 'rotary-en-accion' }] };
  }
  if (/SELECT \* FROM "Club" WHERE id=\$1 LIMIT 1/.test(t)) {
    return { rows: [{ id: params[0], name: 'Club Uno', domain: 'club1.example.org', logo: '', districtId: null }] };
  }
  if (/SELECT key, value FROM "Setting"/.test(t)) return { rows: [] };
  if (/FROM "District"/.test(t)) return { rows: [] };
  if (/FROM "ClubParticipationProfile"/.test(t) || /INSERT INTO "ClubParticipationProfile"/.test(t)) return { rows: [] };
  if (/FROM "User"/.test(t)) return { rows: [] };

  return { rows: [] };
};

export default { query };
export { query };
