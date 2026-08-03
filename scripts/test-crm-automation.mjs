// Pruebas del motor de automatización del WhatsApp CRM.
//
//   node scripts/test-crm-automation.mjs
//
// Necesita una base PostgreSQL vacía en `DATABASE_URL` con el schema de Prisma
// ya aplicado. NO apuntarla a producción: el guion escribe y borra filas.
//
// La llamada a la Cloud API de Meta se intercepta reemplazando `globalThis.fetch`.
// Es lo que permite comprobar el camino completo —guardrails, envío, registro en
// el log, condiciones sobre el mensaje— sin mandarle nada a nadie.
import crypto from 'crypto';

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}
if (/neon\.tech|amazonaws|supabase/.test(process.env.DATABASE_URL) && !process.env.ALLOW_REMOTE_DB) {
  console.error('DATABASE_URL parece de un entorno real. Abortado.');
  process.exit(1);
}

const { default: db } = await import('../server/lib/db.js');
const { ensureAutomationSchema } = await import('../server/lib/ensureAutomationSchema.js');
const { deriveLifecycleState, LIFECYCLE_KEYS } = await import('../server/lib/lifecycleSpec.js');
const { runLifecycleSweep } = await import('../server/lib/crmLifecycle.js');
const { validateJourney, resolveVariables } = await import('../server/lib/journeySpec.js');
const { nextAllowedSendTime, evaluateSend, DEFAULT_SETTINGS, suppressContact } = await import('../server/lib/crmGuardrails.js');
const { buildAudienceSql, countAudience } = await import('../server/lib/crmSegments.js');
const { ensureSeedJourneys } = await import('../server/lib/journeySeeds.js');
const { enrollFromEvents, advanceRuns } = await import('../server/lib/journeyEngine.js');

let passed = 0, failed = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) { passed++; results.push(`  ✓ ${name}`); }
  else { failed++; results.push(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { results.push(`\n${title}`); }

const DAY = 86_400_000;
const uuid = () => crypto.randomUUID();

// ── 1. Derivación del ciclo de vida (pura) ──────────────────────────────────
section('1. Estados del ciclo de vida');
{
  const base = {
    status: 'active', subscriptionStatus: 'active', hasDomain: true, hasAdminUser: true,
    hasPublishedContent: true, hasCompletedTraining: true, contentTracked: true,
    activationPhasesTotal: 7, activationPhasesCompleted: 7, lastActivityAt: new Date(),
  };
  const now = new Date('2026-08-03T12:00:00Z');
  const d = (patch) => deriveLifecycleState({ ...base, ...patch }, now).state;

  check('cancelado gana sobre todo', d({ status: 'cancelled' }) === 'cancelado');
  check('sitio inactivo → suspendido', d({ status: 'inactive' }) === 'suspendido');
  check('vencido hace 1 día → suscripción vencida',
    d({ expirationDate: new Date(now - 1 * DAY) }) === 'suscripcion_vencida');
  check('vencido hace 4 días → período de gracia',
    d({ expirationDate: new Date(now - 4 * DAY) }) === 'periodo_gracia');
  check('vencido hace 10 días → suspendido',
    d({ expirationDate: new Date(now - 10 * DAY) }) === 'suspendido');
  check('vence en 20 días → próximo a renovar',
    d({ expirationDate: new Date(now.getTime() + 20 * DAY) }) === 'proximo_renovar');
  check('vence en 200 días → NO es próximo a renovar',
    d({ expirationDate: new Date(now.getTime() + 200 * DAY) }) !== 'proximo_renovar');
  check('volvió de vencido → reactivado',
    d({ previousState: 'periodo_gracia', previousStateSince: new Date(now - 3 * DAY) }) === 'reactivado');
  check('sin dominio ni admin → pendiente de activación',
    d({ hasDomain: false, hasAdminUser: false }) === 'pendiente_activacion');
  check('sin ninguna fase → onboarding pendiente',
    d({ activationPhasesCompleted: 0 }) === 'onboarding_pendiente');
  check('fases a medias → onboarding iniciado',
    d({ activationPhasesCompleted: 3 }) === 'onboarding_iniciado');
  check('sin contenido → en implementación',
    d({ hasPublishedContent: false }) === 'en_implementacion');
  check('aviso de desarrollo → sitio en pruebas',
    d({ developmentBannerActive: true }) === 'sitio_pruebas');
  check('sin capacitación → capacitación pendiente',
    d({ hasCompletedTraining: false }) === 'capacitacion_pendiente');
  check('sin actividad reciente → bajo uso',
    d({ lastActivityAt: new Date(now - 60 * DAY) }) === 'activo_bajo_uso');
  check('con actividad reciente → uso frecuente',
    d({ lastActivityAt: new Date(now - 2 * DAY) }) === 'activo_uso_frecuente');
  check('estado fijado a mano manda',
    d({ manualState: 'prospecto', status: 'inactive' }) === 'prospecto');

  // El caso que motivó `contentTracked`: un distrito no tiene Post ni Publication.
  const district = deriveLifecycleState({
    ...base, contentTracked: false, hasPublishedContent: false, lastActivityAt: null,
  }, now).state;
  check('un distrito NO cae en "en implementación" por no tener posts',
    district === 'sitio_produccion', `dio ${district}`);

  check('todos los estados derivables existen en el catálogo',
    LIFECYCLE_KEYS.length === 17);
}

// ── 2. Validación de recorridos (pura) ──────────────────────────────────────
section('2. Validación de recorridos');
{
  const ok = {
    name: 'X', trigger: { type: 'site.created' },
    settings: { entryNodeId: 'a' },
    nodes: [
      { id: 'a', type: 'send_template', templateId: 't1', next: 'b' },
      { id: 'b', type: 'wait', days: 1, next: 'c' },
      { id: 'c', type: 'exit', reason: 'fin' },
    ],
  };
  check('un recorrido correcto no da errores', validateJourney(ok).length === 0,
    JSON.stringify(validateJourney(ok)));

  check('detecta plantilla sin asignar',
    validateJourney({ ...ok, nodes: [{ id: 'a', type: 'send_template', next: null }] })
      .some(e => e.includes('plantilla')));

  check('detecta referencia colgante',
    validateJourney({ ...ok, nodes: [{ id: 'a', type: 'send_template', templateId: 't', next: 'zzz' }] })
      .some(e => e.includes('zzz')));

  check('detecta espera de cero',
    validateJourney({ ...ok, nodes: [{ id: 'a', type: 'wait', days: 0, next: null }] })
      .some(e => e.includes('mayor que cero')));

  // Un ciclo sin espera gira sin fin dentro de una vuelta del motor.
  const loop = {
    ...ok, settings: { entryNodeId: 'a' },
    nodes: [
      { id: 'a', type: 'condition', condition: { kind: 'audience' }, nextTrue: 'b', nextFalse: 'b' },
      { id: 'b', type: 'tag', add: ['x'], next: 'a' },
    ],
  };
  check('detecta un ciclo SIN espera', validateJourney(loop).some(e => e.includes('ciclo sin espera')));

  // El mismo ciclo con una espera en medio es legítimo (un recorrido que sondea).
  const loopOk = {
    ...ok, settings: { entryNodeId: 'a' },
    nodes: [
      { id: 'a', type: 'condition', condition: { kind: 'audience' }, nextTrue: 'w', nextFalse: 'w' },
      { id: 'w', type: 'wait', days: 1, next: 'a' },
    ],
  };
  check('un ciclo CON espera es válido', !validateJourney(loopOk).some(e => e.includes('ciclo')));

  check('detecta un resultado de mensaje inobservable (clic)',
    validateJourney({
      ...ok, nodes: [{ id: 'a', type: 'condition', condition: { kind: 'message', is: 'clicked' }, nextTrue: null, nextFalse: null }],
    }).some(e => e.includes('no se puede observar')));

  check('el nodo inicial sale de settings, no del orden del array',
    validateJourney({
      ...ok, settings: { entryNodeId: 'c' },
      nodes: [{ id: 'c', type: 'exit' }, { id: 'a', type: 'send_template', templateId: 't' }],
    }).length === 0);
}

// ── 3. Variables ────────────────────────────────────────────────────────────
section('3. Variables de plantilla');
{
  const ctx = {
    contact: { name: 'Ana', language: 'es' },
    signals: { name: 'Club Valledupar', expirationDate: '2026-09-15T00:00:00Z', domain: 'club.org', siteType: 'club' },
    lifecycle: { label: 'Próximo a renovar' },
    links: { renewal: 'https://x.co/renovar' },
  };
  const r = resolveVariables(['nombre_contacto', 'nombre_club', 'fecha_vencimiento', 'link_renovacion'], ctx);
  check('resuelve en el orden pedido', r.values[0] === 'Ana' && r.values[1] === 'Club Valledupar');
  check('formatea la fecha en español', /septiembre/.test(r.values[2]), r.values[2]);
  check('no falta ninguna', r.missing.length === 0);

  const missing = resolveVariables(['nombre_contacto', 'link_capacitacion'], ctx);
  check('reporta la variable que no se pudo resolver',
    missing.missing.includes('link_capacitacion'));
  check('un token desconocido también se reporta',
    resolveVariables(['inventado'], ctx).missing.includes('inventado'));
}

// ── 4. Ventana horaria ──────────────────────────────────────────────────────
section('4. Ventana de envío');
{
  const s = { ...DEFAULT_SETTINGS };
  // 15:00 UTC = 10:00 en Bogotá → dentro de la ventana 08:00-20:00.
  check('dentro de la ventana no aplaza',
    nextAllowedSendTime(new Date('2026-08-03T15:00:00Z'), s, 'America/Bogota') === null);

  // 05:00 UTC = 00:00 en Bogotá → fuera; debe aplazar hasta las 08:00 locales.
  const deferred = nextAllowedSendTime(new Date('2026-08-03T05:00:00Z'), s, 'America/Bogota');
  check('de madrugada aplaza', deferred instanceof Date);
  check('aplaza al comienzo de la ventana local (13:00 UTC = 08:00 Bogotá)',
    deferred && deferred.toISOString().startsWith('2026-08-03T13:00'), deferred?.toISOString());

  // La misma hora UTC cae en otra hora local en Madrid: 05:00 UTC = 07:00 allá,
  // así que también está fuera, pero por menos margen.
  const madrid = nextAllowedSendTime(new Date('2026-08-03T05:00:00Z'), s, 'Europe/Madrid');
  check('la ventana se evalúa en la zona del destinatario, no del servidor',
    madrid && madrid.toISOString().startsWith('2026-08-03T06:00'), madrid?.toISOString());

  const weekend = nextAllowedSendTime(
    new Date('2026-08-01T15:00:00Z'), { ...s, sendWeekdays: [1, 2, 3, 4, 5] }, 'America/Bogota');
  check('un sábado con sólo días hábiles se aplaza al lunes',
    weekend && weekend.getUTCDate() === 3, weekend?.toISOString());
}

// ── 5. Construcción de audiencias ───────────────────────────────────────────
section('5. Segmentación');
{
  const b = buildAudienceSql({
    match: 'all',
    rules: [
      { field: 'lifecycleState', op: 'in', value: ['proximo_renovar'] },
      { field: 'orgRole', op: 'eq', value: 'president' },
    ],
  });
  check('arma el WHERE con parámetros', b.where.includes('$1') && b.where.includes('$2'));
  check('no interpola valores en el SQL', !b.where.includes('president'));
  check('los valores viajan como parámetros', b.params[1] === 'president');

  const bad = buildAudienceSql({ rules: [{ field: 'DROP TABLE', op: 'eq', value: 'x' }] });
  check('un campo desconocido se DESCARTA y se reporta',
    bad.where === null && bad.skipped.length === 1);

  const badOp = buildAudienceSql({ rules: [{ field: 'orgRole', op: "'; DELETE FROM", value: 'x' }] });
  check('un operador desconocido se descarta', badOp.where === null && badOp.skipped.length === 1);
}

// ── 6. Integración contra la base ───────────────────────────────────────────
section('6. Recorrido completo contra la base');

const CLUB = uuid();            // el sitio "Origen" (la plataforma)
const CLIENT_CLUB = uuid();     // un club cliente
const CONTACT = uuid();
const TEMPLATE = uuid();
let sentPayloads = [];

try {
  await ensureAutomationSchema();
  check('ensureAutomationSchema crea las tablas',
    (await db.query(`SELECT COUNT(*)::int n FROM information_schema.tables
                     WHERE table_name IN ('CrmJourney','CrmJourneyRun','CrmEvent','CrmLifecycleState','CrmAlert','CrmSuppression','CrmJourneyStep')`)
    ).rows[0].n === 7);

  check('agrega las columnas de vínculo al contacto',
    (await db.query(`SELECT COUNT(*)::int n FROM information_schema.columns
                     WHERE table_name='WhatsAppContact' AND column_name IN ('siteId','orgRole','consentState','lastInboundAt')`)
    ).rows[0].n === 4);

  // Es idempotente: correrla dos veces no debe romper nada.
  await ensureAutomationSchema();

  // Datos mínimos.
  const soon = new Date(Date.now() + 20 * DAY);
  await db.query(`INSERT INTO "Club" (id,name,status,"subscriptionStatus",domain,"createdAt","updatedAt")
                  VALUES ($1,'Plataforma Origen','active','active','origen.org',NOW(),NOW())`, [CLUB]);
  await db.query(`INSERT INTO "Club" (id,name,status,"subscriptionStatus",domain,"expirationDate","createdAt","updatedAt")
                  VALUES ($1,'Club Valledupar','active','active','valledupar.org',$2,NOW() - INTERVAL '400 days',NOW())`,
                  [CLIENT_CLUB, soon]);
  await db.query(`INSERT INTO "WhatsAppConfig" (id,"clubId","phoneNumberId","wabaId","accessToken","verifyToken",enabled,"createdAt","updatedAt")
                  VALUES ($1,$2,'PN1','WABA1','tok','vt',true,NOW(),NOW())`, [uuid(), CLUB]);
  await db.query(`INSERT INTO "WhatsAppTemplate" (id,"clubId",name,"displayName",category,language,status,"bodyText","createdAt","updatedAt")
                  VALUES ($1,$2,'aviso_renovacion','Aviso de renovación','MARKETING','es','approved','Hola {{1}}, {{2}} vence el {{3}}.',NOW(),NOW())`,
                  [TEMPLATE, CLUB]);
  await db.query(`INSERT INTO "WhatsAppContact"
                    (id,"clubId",name,phone,status,tags,"siteId","siteType","orgRole","consentState",language,"createdAt","updatedAt")
                  VALUES ($1,$2,'Ana Presidenta','+573001112233','active',ARRAY[]::text[],$3,'club','president','granted','es',NOW(),NOW())`,
                  [CONTACT, CLUB, CLIENT_CLUB]);

  // ── Primera observación: fotografía, NO dispara ──────────────────────────
  const first = await runLifecycleSweep({ now: new Date() });
  check('la primera vuelta observa los sitios', first.sites === 2, `sites=${first.sites}`);
  check('la primera vuelta NO emite transiciones (evita el alud del día 1)',
    first.transitions === 0, `transitions=${first.transitions}`);

  const st = await db.query(`SELECT state FROM "CrmLifecycleState" WHERE "siteId"=$1`, [CLIENT_CLUB]);
  check('el club que vence en 20 días queda en "próximo a renovar"',
    st.rows[0]?.state === 'proximo_renovar', st.rows[0]?.state);

  const lifecycleEvents = await db.query(`SELECT COUNT(*)::int n FROM "CrmEvent" WHERE type='lifecycle.entered'`);
  check('no hay eventos de transición todavía', lifecycleEvents.rows[0].n === 0);

  const expiring = await db.query(`SELECT COUNT(*)::int n FROM "CrmEvent" WHERE type='subscription.expiring'`);
  check('sí hay evento de "próxima a vencer"', expiring.rows[0].n === 1);

  // Un hecho viejo NO se convierte en evento (ventana de 7 días).
  const oldSite = await db.query(`SELECT COUNT(*)::int n FROM "CrmEvent" WHERE type='site.created' AND "siteId"=$1`, [CLIENT_CLUB]);
  check('un sitio creado hace 400 días no emite "site.created"', oldSite.rows[0].n === 0);

  // ── Transición real ─────────────────────────────────────────────────────
  await db.query(`UPDATE "Club" SET "expirationDate"=NOW() - INTERVAL '1 day' WHERE id=$1`, [CLIENT_CLUB]);
  const second = await runLifecycleSweep({ now: new Date() });
  check('el cambio de estado produce una transición', second.transitions === 1, `transitions=${second.transitions}`);

  const entered = await db.query(
    `SELECT payload FROM "CrmEvent" WHERE type='lifecycle.entered' AND "siteId"=$1`, [CLIENT_CLUB]);
  check('la transición emite lifecycle.entered', entered.rows.length === 1);
  check('el evento dice a qué estado entró',
    entered.rows[0]?.payload?.state === 'suscripcion_vencida', JSON.stringify(entered.rows[0]?.payload));

  // ── Recorridos precargados ──────────────────────────────────────────────
  const seeded = await ensureSeedJourneys(CLUB);
  check('siembra los dos recorridos', seeded.created.length === 2, seeded.created.join(','));
  const reseeded = await ensureSeedJourneys(CLUB);
  check('la siembra no pisa lo ya existente', reseeded.created.length === 0);

  const seedRow = await db.query(`SELECT * FROM "CrmJourney" WHERE "clubId"=$1 AND key='renovacion_suscripcion'`, [CLUB]);
  check('el recorrido sembrado nace en borrador', seedRow.rows[0].status === 'draft');
  check('nace sin plantillas asignadas (no puede enviar por accidente)',
    validateJourney(seedRow.rows[0]).some(e => e.includes('plantilla')));

  // ── Un recorrido propio, listo para enviar ──────────────────────────────
  const JOURNEY = uuid();
  await db.query(
    `INSERT INTO "CrmJourney" (id,"clubId",key,name,status,audience,trigger,nodes,settings)
     VALUES ($1,$2,'prueba','Prueba de envío','active',$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb)`,
    [
      JOURNEY, CLUB,
      JSON.stringify({ match: 'all', rules: [{ field: 'orgRole', op: 'eq', value: 'president' }] }),
      JSON.stringify({ type: 'lifecycle.entered', state: 'suscripcion_vencida' }),
      JSON.stringify([
        { id: 'aviso', type: 'send_template', templateId: TEMPLATE,
          variables: ['nombre_contacto', 'nombre_club', 'fecha_vencimiento'], next: 'esperar' },
        { id: 'esperar', type: 'wait', days: 3, next: 'etiquetar' },
        { id: 'etiquetar', type: 'tag', add: ['aviso_enviado'], next: 'fin' },
        { id: 'fin', type: 'exit', reason: 'listo' },
      ]),
      JSON.stringify({ entryNodeId: 'aviso', reentry: 'per_event', exitOnEvents: ['subscription.renewed'] }),
    ]
  );

  // Meta interceptada.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('graph.facebook.com')) {
      sentPayloads.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ messages: [{ id: `wamid.${sentPayloads.length}` }] }) };
    }
    return realFetch(url, opts);
  };

  // Mediodía en Bogotá para no chocar con la ventana horaria.
  const noon = new Date();
  noon.setUTCHours(16, 0, 0, 0);

  const enrolled = await enrollFromEvents({ clubId: CLUB, now: noon });
  check('inscribe al contacto del sitio del evento', enrolled.enrolled === 1, JSON.stringify(enrolled));

  const runsAfter = await db.query(`SELECT * FROM "CrmJourneyRun" WHERE "journeyId"=$1`, [JOURNEY]);
  check('la inscripción apunta al club cliente, no al Origen',
    runsAfter.rows[0]?.siteId === CLIENT_CLUB);

  // Reprocesar no vuelve a inscribir (dedupe por evento).
  await db.query(`UPDATE "CrmEvent" SET "processedAt"=NULL WHERE type='lifecycle.entered'`);
  const again = await enrollFromEvents({ clubId: CLUB, now: noon });
  check('reprocesar el mismo evento NO duplica la inscripción', again.enrolled === 0);

  // ── Envío ───────────────────────────────────────────────────────────────
  const delivered = await advanceRuns({ clubId: CLUB, now: noon });
  check('el motor envía un mensaje', delivered.sent === 1, JSON.stringify(delivered));
  check('llamó a Meta con una plantilla', sentPayloads[0]?.type === 'template');
  check('mandó las tres variables en orden',
    sentPayloads[0]?.template?.components?.[0]?.parameters?.length === 3,
    JSON.stringify(sentPayloads[0]?.template?.components));
  check('la primera variable es el nombre del contacto',
    sentPayloads[0]?.template?.components?.[0]?.parameters?.[0]?.text === 'Ana Presidenta');

  const log = await db.query(`SELECT * FROM "WhatsAppMessageLog" WHERE "journeyId"=$1`, [JOURNEY]);
  check('deja el mensaje en el log con su recorrido', log.rows.length === 1 && log.rows[0].status === 'sent');
  check('el log guarda la inscripción que lo originó', !!log.rows[0].journeyRunId);

  const parked = await db.query(`SELECT * FROM "CrmJourneyRun" WHERE "journeyId"=$1`, [JOURNEY]);
  check('la inscripción queda esperando en el paso siguiente',
    parked.rows[0].currentNodeId === 'etiquetar' && parked.rows[0].waitUntil !== null,
    `nodo=${parked.rows[0].currentNodeId}`);
  check('la espera de 3 días se agenda en el futuro',
    new Date(parked.rows[0].waitUntil).getTime() > noon.getTime() + 2 * DAY);

  // Volver a correr antes de tiempo no hace nada.
  const tooSoon = await advanceRuns({ clubId: CLUB, now: noon });
  check('no avanza una inscripción cuya espera no venció', tooSoon.sent === 0 && tooSoon.processed === 0);

  // ── Guardrails ──────────────────────────────────────────────────────────
  const contactRow = (await db.query(`SELECT * FROM "WhatsAppContact" WHERE id=$1`, [CONTACT])).rows[0];
  const templateRow = (await db.query(`SELECT * FROM "WhatsAppTemplate" WHERE id=$1`, [TEMPLATE])).rows[0];

  const dup = await evaluateSend(contactRow, templateRow, { clubId: CLUB, now: noon });
  check('no repite la misma plantilla dentro del enfriamiento',
    dup.decision === 'skip' && dup.reason === 'duplicate_template', JSON.stringify(dup));

  const night = new Date(noon); night.setUTCHours(6, 0, 0, 0);
  const other = { ...templateRow, name: 'otra_plantilla' };
  const nightVerdict = await evaluateSend(contactRow, other, { clubId: CLUB, now: night });
  check('de madrugada APLAZA (no descarta)',
    nightVerdict.decision === 'defer' && nightVerdict.reason === 'outside_send_window', JSON.stringify(nightVerdict));

  const noConsent = await evaluateSend({ ...contactRow, consentState: 'unknown' }, other, { clubId: CLUB, now: noon });
  check('sin consentimiento no manda marketing',
    noConsent.decision === 'skip' && noConsent.reason === 'consent_missing');

  const utility = await evaluateSend({ ...contactRow, consentState: 'unknown' }, { ...other, category: 'UTILITY' }, { clubId: CLUB, now: noon });
  check('una plantilla de utilidad sí pasa sin consentimiento explícito',
    utility.decision === 'send', JSON.stringify(utility));

  await suppressContact({ clubId: CLUB, phone: '+573001112233', reason: 'opt_out', source: 'test' });
  const suppressed = await evaluateSend(
    (await db.query(`SELECT * FROM "WhatsAppContact" WHERE id=$1`, [CONTACT])).rows[0],
    other, { clubId: CLUB, now: noon });
  check('la lista de exclusión descarta el envío',
    suppressed.decision === 'skip' && ['suppressed', 'opted_out', 'consent_denied'].includes(suppressed.reason),
    JSON.stringify(suppressed));

  // La baja sobrevive al borrado y re-alta del contacto: es el punto de tener
  // la lista aparte.
  await db.query(`DELETE FROM "WhatsAppContact" WHERE id=$1`, [CONTACT]);
  const REBORN = uuid();
  await db.query(`INSERT INTO "WhatsAppContact"
                    (id,"clubId",name,phone,status,tags,"siteId","siteType","orgRole","consentState","createdAt","updatedAt")
                  VALUES ($1,$2,'Ana otra vez','+573001112233','active',ARRAY[]::text[],$3,'club','president','granted',NOW(),NOW())`,
                  [REBORN, CLUB, CLIENT_CLUB]);
  const rebornRow = (await db.query(`SELECT * FROM "WhatsAppContact" WHERE id=$1`, [REBORN])).rows[0];
  const stillBlocked = await evaluateSend(rebornRow, other, { clubId: CLUB, now: noon });
  check('la baja sobrevive a borrar y volver a crear el contacto',
    stillBlocked.decision === 'skip' && stillBlocked.reason === 'suppressed', JSON.stringify(stillBlocked));

  // ── Condición de salida ─────────────────────────────────────────────────
  await db.query(`DELETE FROM "CrmSuppression" WHERE "clubId"=$1`, [CLUB]);
  await db.query(`UPDATE "WhatsAppContact" SET "optedOutAt"=NULL,"consentState"='granted' WHERE id=$1`, [REBORN]);
  await db.query(`UPDATE "CrmJourneyRun" SET "contactId"=$1,"waitUntil"=$2,"currentNodeId"='etiquetar' WHERE "journeyId"=$3`,
    [REBORN, noon, JOURNEY]);
  // La condición de salida mira los eventos ocurridos DESPUÉS de la inscripción,
  // así que el evento tiene que fecharse después de `enrolledAt` (que es `noon`).
  // Con NOW() real la prueba dependería de la hora a la que se corriera.
  await db.query(
    `INSERT INTO "CrmEvent" (id,type,"siteId","occurredAt","processedAt") VALUES ($1,'subscription.renewed',$2,$3,$3)`,
    [uuid(), CLIENT_CLUB, new Date(noon.getTime() + 500)]);

  const exited = await advanceRuns({ clubId: CLUB, now: new Date(noon.getTime() + 1000) });
  const finalRun = (await db.query(`SELECT * FROM "CrmJourneyRun" WHERE "journeyId"=$1`, [JOURNEY])).rows[0];
  check('el club que renovó SALE del recorrido',
    finalRun.status === 'completed' && String(finalRun.exitReason).includes('subscription.renewed'),
    `${finalRun.status} / ${finalRun.exitReason}`);
  check('y no le manda el resto de los mensajes', exited.sent === 0);

  // ── Aislamiento de la audiencia ─────────────────────────────────────────
  const count = await countAudience(CLUB, { match: 'all', rules: [{ field: 'lifecycleState', op: 'in', value: ['suscripcion_vencida'] }] });
  check('la audiencia resuelve contra el estado del sitio del contacto', count.total === 1, JSON.stringify(count));

  const noneCount = await countAudience(CLUB, { match: 'all', rules: [{ field: 'orgRole', op: 'eq', value: 'treasurer' }] });
  check('un filtro que no aplica devuelve cero', noneCount.total === 0);

  globalThis.fetch = realFetch;
} catch (err) {
  failed++;
  results.push(`  ✗ EXCEPCIÓN: ${err.message}\n${err.stack}`);
}

// ── Limpieza ────────────────────────────────────────────────────────────────
try {
  await db.query(`DELETE FROM "CrmJourneyStep"`);
  await db.query(`DELETE FROM "CrmJourneyRun"`);
  await db.query(`DELETE FROM "CrmJourney"`);
  await db.query(`DELETE FROM "CrmEvent"`);
  await db.query(`DELETE FROM "CrmLifecycleState"`);
  await db.query(`DELETE FROM "CrmAlert"`);
  await db.query(`DELETE FROM "CrmSuppression"`);
  await db.query(`DELETE FROM "WhatsAppMessageLog"`);
  await db.query(`DELETE FROM "WhatsAppContact" WHERE "clubId"=$1`, [CLUB]);
  await db.query(`DELETE FROM "WhatsAppTemplate" WHERE "clubId"=$1`, [CLUB]);
  await db.query(`DELETE FROM "WhatsAppConfig" WHERE "clubId"=$1`, [CLUB]);
  await db.query(`DELETE FROM "Club" WHERE id IN ($1,$2)`, [CLUB, CLIENT_CLUB]);
} catch { /* la limpieza no debe tapar el resultado de las pruebas */ }

console.log(results.join('\n'));
console.log(`\n${passed} pasaron, ${failed} fallaron.`);
await db.pool.end().catch(() => {});
process.exit(failed ? 1 : 0);
