// ════════════════════════════════════════════════════════════════════════════
// Calendario editorial + recurrencia única + plantillas por paso — v4.1169
//
// Caso obligatorio: campaña mensual 05/10/2026 → 30/06/2027 America/Bogota
// con flujo Día 0/7/14/21. Verifica proyección exacta, corte en endAt,
// overrides, estados reales, vista previa del paso y paridad servidor/espejo.
//
// Sin red, sin Postgres real (doble en memoria).
// ════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-activation-stub.mjs', HERE).href;

register(
  `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
        return n(s,c);
     }`,
  HERE
);

let ok = 0;
const malos = [];
const check = (nombre, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { malos.push(nombre); console.log(`  ✗ ${nombre}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = (t) => console.log(`\n── ${t} ──`);

const S = await import('../server/lib/contentActivationSchedule.js');
const stub = await import('./fixtures/db-activation-stub.mjs');

const CAMP = {
  name: 'Rotary en Acción – Prueba con Yaneth y Juan Felipe',
  startAt: '2026-10-05T14:22:00.000Z', // 09:22 America/Bogota
  endAt: '2027-06-30T14:22:00.000Z',
  timezone: 'America/Bogota',
  frecuencia: 'mensual',
  flowDef: [
    { dayOffset: 0, key: 'invitacion', channel: 'email', condition: 'siempre' },
    { dayOffset: 7, key: 'recordatorio', channel: 'email', condition: 'no_solicitud' },
    { dayOffset: 14, key: 'segundo_recordatorio', channel: 'email', condition: 'no_solicitud' },
    { dayOffset: 21, key: 'ultimo_llamado', channel: 'email', condition: 'no_solicitud' },
  ],
};

grupo('1 · Proyección del caso obligatorio (oct-2026 → jun-2027)');
{
  const occ = S.occurrencesForCampaign(CAMP);
  check('9 ciclos × 4 pasos = 36 ocurrencias', occ.length === 36, `n=${occ.length}`);
  check('primera: 05/10/2026 09:22 invitación',
    occ[0].fecha === '05/10/2026' && occ[0].hora === '09:22' && occ[0].stepKey === 'invitacion' && occ[0].cycleIndex === 0,
    JSON.stringify(occ[0]));
  check('ciclo 2 ancla 05/11/2026', occ[4].fecha === '05/11/2026' && occ[4].periodo === 'Noviembre 2026', JSON.stringify(occ[4]));
  const last = occ[occ.length - 1];
  check('última: 26/06/2027 último llamado (21d tras el 05/06)',
    last.fecha === '26/06/2027' && last.stepKey === 'ultimo_llamado' && last.cycleIndex === 8, JSON.stringify(last));
  check('nada después del cierre 30/06/2027',
    occ.every((o) => new Date(o.scheduledAt).getTime() <= new Date(CAMP.endAt).getTime()));
  check('hora pared 09:22 en todas', occ.every((o) => o.hora === '09:22' && o.timezone === 'America/Bogota'));
  check('canal email en todas', occ.every((o) => o.channel === 'email'));
  // Diciembre como muestra intermedia.
  const dic = occ.filter((o) => o.periodo === 'Diciembre 2026').map((o) => o.fecha);
  check('diciembre 2026: 05, 12, 19, 26', JSON.stringify(dic) === JSON.stringify(['05/12/2026', '12/12/2026', '19/12/2026', '26/12/2026']), JSON.stringify(dic));
}

grupo('2 · Reglas de recurrencia y corte');
{
  // Clamp mensual: 31 ene → 28 feb 2026 (no overflow a marzo).
  const anclas = S.cycleStarts({ startAt: '2026-01-31T14:00:00.000Z', frecuencia: 'mensual', timezone: 'America/Bogota' });
  check('clamp 31ene→28feb', anclas[1].startsWith('2026-02-28'), anclas[1]);
  check('luego 31mar', anclas[2].startsWith('2026-03-31'), anclas[2]);
  // Secuencia que pisa el cierre: ciclo que empieza antes pero pasos que caen después se podan.
  const occ = S.occurrencesForCampaign({
    ...CAMP, startAt: '2027-06-20T14:00:00.000Z', endAt: '2027-06-30T14:00:00.000Z',
  });
  check('pasos post-cierre podados (solo día 0 y 7)', occ.length === 2 && occ.every((o) => o.cycleIndex === 0), `n=${occ.length}`);
  // Ciclo que empezaría después del cierre no existe.
  check('sin anclas tras endAt', S.cycleStarts({ startAt: CAMP.startAt, frecuencia: 'mensual', timezone: 'America/Bogota', endAt: CAMP.endAt }).length === 9);
  // Otros ritmos.
  check('unica → 1 ancla', S.cycleStarts({ startAt: CAMP.startAt, frecuencia: 'unica', timezone: 'America/Bogota' }).length === 1);
  check('semanal +7d pared', S.cycleStarts({ startAt: '2026-10-05T14:00:00.000Z', frecuencia: 'semanal', timezone: 'America/Bogota' })[1].startsWith('2026-10-12'));
  check('quincenal +15d', S.cycleStarts({ startAt: '2026-10-05T14:00:00.000Z', frecuencia: 'quincenal', timezone: 'America/Bogota' })[1].startsWith('2026-10-20'));
  check('personalizada 10d', S.cycleStarts({ startAt: '2026-10-05T14:00:00.000Z', frecuencia: 'personalizada', customDays: 10, timezone: 'America/Bogota' })[1].startsWith('2026-10-15'));
  // cycleIndexOf: bordes.
  const base = { startAt: CAMP.startAt, frecuencia: 'mensual', timezone: 'America/Bogota' };
  check('antes del inicio → -1', S.cycleIndexOf(base, '2026-10-04T00:00:00.000Z') === -1);
  check('ancla 0 → 0', S.cycleIndexOf(base, CAMP.startAt) === 0);
  check('04/11 → 0', S.cycleIndexOf(base, '2026-11-04T23:59:00.000Z') === 0);
  check('05/11 → 1', S.cycleIndexOf(base, '2026-11-05T14:22:00.000Z') === 1);
}

grupo('3 · Paridad servidor ↔ espejo navegador');
{
  execSync(
    './node_modules/.bin/esbuild src/lib/contentActivationSchedule.ts --bundle --platform=node --format=esm --outfile=/tmp/spec-sched-front.mjs --log-level=error',
    { stdio: 'inherit' }
  );
  const front = await import(pathToFileURL('/tmp/spec-sched-front.mjs').href);
  const a = S.occurrencesForCampaign(CAMP);
  const b = front.occurrencesForCampaign(CAMP);
  check('misma proyección (36 idénticas)', JSON.stringify(a) === JSON.stringify(b), `a=${a.length} b=${b.length}`);
  const c = S.cycleStarts({ startAt: '2026-01-31T14:00:00.000Z', frecuencia: 'mensual', timezone: 'America/Bogota' });
  const d = front.cycleStarts({ startAt: '2026-01-31T14:00:00.000Z', frecuencia: 'mensual', timezone: 'America/Bogota' });
  check('mismo clamp en espejo', JSON.stringify(c) === JSON.stringify(d));
}

grupo('4 · Overrides en la proyección pura');
{
  const occ = S.occurrencesForCampaign(CAMP, {
    overrides: [
      { cycleIndex: 1, stepKey: 'recordatorio', action: 'omitir' },
      { cycleIndex: 2, stepKey: 'invitacion', action: 'reprogramar', newDate: '2026-12-10T14:00:00.000Z' },
    ],
  });
  const om = occ.find((o) => o.cycleIndex === 1 && o.stepKey === 'recordatorio');
  const re = occ.find((o) => o.cycleIndex === 2 && o.stepKey === 'invitacion');
  check('omitir marca estadoBase', om?.estadoBase === 'omitido');
  check('reprogramar cambia fecha y flag', re?.reprogramado === true && re?.scheduledAt === '2026-12-10T14:00:00.000Z', re?.scheduledAt);
  check('el resto intacto', occ.filter((o) => o.estadoBase === 'omitido').length === 1 && occ.filter((o) => o.reprogramado).length === 1);
}

grupo('5 · Variables con punto y default en el envío');
{
  const M = await import('../server/lib/contentActivationMail.js');
  // El pipeline entrega vars PLANAS (resolveCampaignVars); el render unificado
  // las proyecta a ámbitos: {{club.name}} y {{contact.first_name|…} resuelven.
  const flat = {
    recipient_name: 'Yaneth', club_name: 'Cali',
    district_name: 'Distrito 4281', campaign_name: 'Feria', form_url: 'https://f',
  };
  const f = M.buildFinalEmail({
    subject: 'Hola {{contact.first_name|Amigo}} ({{club.name}})',
    preheader: '', htmlBody: '<p>{{district.name}} · {{campaign.url}}</p>', footer: '', ctaUrl: '', vars: flat,
  });
  check('dotted + default resuelven', f.subject === 'Hola Yaneth (Cali)' && f.html.includes('Distrito 4281'), f.subject);
  const g = M.buildFinalEmail({ subject: 'Hola {{contact.first_name|Amigo}}', preheader: '', htmlBody: '<p>x</p>', footer: '', ctaUrl: '', vars: {} });
  check('ausente usa default', g.subject === 'Hola Amigo', g.subject);
}

grupo('6 · Calendario API: proyección + estados + overrides + previa');
stub.reset();
const SUPER = { user: { role: 'superadmin', id: 'u1' }, headers: {} };
const TPLC = await import('../server/controllers/contentActivationTemplateController.js');
const CACT = await import('../server/controllers/contentActivationController.js');
const res = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const correr = async (h, req) => { const r = res(); await h(req, r); return r; };

// Siembra (2 institucionales + 4 del flujo).
let r = await correr(TPLC.list, { ...SUPER, query: {} });
check('siembra incluye las 4 del flujo', (r.body?.templates || []).length === 6, `n=${r.body?.templates?.length}`);
const { flowTemplateMap } = await import('../server/lib/contentActivationTemplates.js');
const fmap = await flowTemplateMap();
check('mapa flujo→plantilla (4 claves)', ['invitacion', 'recordatorio', 'segundo_recordatorio', 'ultimo_llamado'].every((k) => fmap[k]?.templateId), JSON.stringify(Object.keys(fmap)));

// Campaña mensual con pasos vinculados a plantillas.
const flowVinculado = CAMP.flowDef.map((s) => {
  const link = { invitacion: fmap.invitacion, recordatorio: fmap.recordatorio, segundo_recordatorio: fmap.segundo_recordatorio, ultimo_llamado: fmap.ultimo_llamado }[s.key];
  return { ...s, templateId: link?.templateId || null, templateVersion: link?.templateVersion ?? null };
});
r = await correr(CACT.create, {
  ...SUPER,
  body: {
    name: CAMP.name, contributionCampaignId: 'cc1',
    startAt: CAMP.startAt, endAt: CAMP.endAt, timezone: CAMP.timezone, frecuencia: 'mensual',
    canales: ['email'], scopeDef: { type: 'district', ids: [] },
    audienceMode: 'fixed', audienceSnapshot: [], audienceDef: { match: 'all', rules: [] },
    contentDef: { email: { subject: 'S', bodyText: 'Hola' }, whatsapp: { body: 'Hola' } },
    flowDef: flowVinculado,
  },
});
const campId = r.body?.campaign?.id || r.body?.id;
check('campaña creada', r.code === 201 && !!campId, `code=${r.code} ${r.body?.error || ''}`);
const guardada = (await correr(CACT.detail, { ...SUPER, params: { id: campId } })).body?.campaign;
check('flowDef conserva templateId (normalizado)', (guardada?.flowDef || []).every((s) => typeof s.templateId === 'string' && s.templateId.length > 4), JSON.stringify((guardada?.flowDef || []).map((s) => s.templateId)));

r = await correr(CACT.calendar, { ...SUPER, params: { id: campId }, query: {} });
check('calendario: 36 ocurrencias', r.code === 200 && r.body?.total === 36, `code=${r.code} total=${r.body?.total}`);
check('ocurrencias traen plantilla vinculada', (r.body?.occurrences || []).every((o) => typeof o.templateId === 'string'), 'falta templateId');
check('estados en vocabulario', (r.body?.occurrences || []).every((o) => ['programado', 'pendiente', 'proyectado', 'omitido', 'enviado', 'fallido', 'pausado', 'cancelado'].includes(o.estado)), JSON.stringify((r.body?.occurrences || []).map((o) => o.estado).filter((e, i, a) => a.indexOf(e) === i)));
check('proximaEnSerie presente', (r.body?.occurrences || []).some((o) => o.proximaEnSerie));

// Estado real: ejecución + evento de envío en ciclo 0 / invitación.
stub.datos.executions.push({ id: 'ex_t1', campaignId: campId, periodoLabel: 'Octubre 2026', startAt: CAMP.startAt, endAt: null, status: 'activa', createdAt: CAMP.startAt });
stub.datos.events.push({ id: 'ev_t1', enrollmentId: 'en_x', executionId: 'ex_t1', campaignId: campId, type: 'email_enviado', channel: 'email', messageLogId: null, metadata: { step: 'invitacion' }, createdAt: '2026-10-05T15:00:00.000Z' });
r = await correr(CACT.calendar, { ...SUPER, params: { id: campId }, query: {} });
const inv0 = (r.body?.occurrences || []).find((o) => o.cycleIndex === 0 && o.stepKey === 'invitacion');
check('envío real → enviado', inv0?.estado === 'enviado', inv0?.estado);
const rec0 = (r.body?.occurrences || []).find((o) => o.cycleIndex === 0 && o.stepKey === 'recordatorio');
check('sin eventos y futuro relativo → programado o pendiente', ['programado', 'pendiente'].includes(rec0?.estado), rec0?.estado);

// Overrides: omitir una futura lejana, guards de pasado y post-cierre.
const futura = (r.body?.occurrences || []).find((o) => o.cycleIndex === 8 && o.stepKey === 'recordatorio');
r = await correr(CACT.scheduleOverride, { ...SUPER, params: { id: campId }, body: { cycleIndex: 8, stepKey: 'recordatorio', action: 'omitir', reason: 'prueba' } });
check('omitir futura → 200', r.code === 200, `code=${r.code} ${r.body?.error || ''}`);
r = await correr(CACT.calendar, { ...SUPER, params: { id: campId }, query: {} });
check('omitida se refleja', (r.body?.occurrences || []).find((o) => o.cycleIndex === 8 && o.stepKey === 'recordatorio')?.estado === 'omitido');
r = await correr(CACT.scheduleOverride, { ...SUPER, params: { id: campId }, body: { cycleIndex: 0, stepKey: 'invitacion', action: 'omitir' } });
check('omitir pasada → 400', r.code === 400, `code=${r.code}`);
r = await correr(CACT.scheduleOverride, { ...SUPER, params: { id: campId }, body: { cycleIndex: 8, stepKey: 'ultimo_llamado', action: 'reprogramar', newDate: '2027-07-15T14:00:00.000Z' } });
check('reprogramar post-cierre → 400', r.code === 400, `code=${r.code}`);
r = await correr(CACT.scheduleOverride, { ...SUPER, params: { id: campId }, body: { cycleIndex: 8, stepKey: 'recordatorio', action: 'limpiar' } });
check('limpiar revierte', r.code === 200, `code=${r.code}`);
r = await correr(CACT.calendar, { ...SUPER, params: { id: campId }, query: {} });
check('limpia vuelve a programado/pendiente', ['programado', 'pendiente'].includes((r.body?.occurrences || []).find((o) => o.cycleIndex === 8 && o.stepKey === 'recordatorio')?.estado));

// Vista previa del paso: plantilla + variables + remitente.
r = await correr(CACT.stepPreview, { ...SUPER, params: { id: campId }, query: { cycleIndex: '0', stepKey: 'invitacion', testName: 'Yaneth' } });
check('step-preview email 200 con html', r.code === 200 && typeof r.body?.html === 'string' && r.body.html.length > 100, `code=${r.code}`);
check('previa resuelve destinatario (sin literales)', r.code === 200 && !String(r.body?.html || '').includes('{{contact.first_name') && !String(r.body?.html || '').includes('{{club.name'), 'literales sin resolver');
check('previa informa plantilla y ocurrencia', r.body?.template?.id === fmap.invitacion.templateId && r.body?.occurrence?.stepKey === 'invitacion', JSON.stringify(r.body?.template));

// Tick usa la plantilla vinculada (snapshot en el evento).
{
  const ENG = await import('../server/lib/contentActivationEngine.js');
  const msg = await ENG.renderStepMessage(
    { name: CAMP.name },
    { key: 'ultimo_llamado', channel: 'email', templateId: fmap.ultimo_llamado.templateId, templateVersion: fmap.ultimo_llamado.templateVersion },
    { nombre: 'Juan', club: 'Club Rotario Cali', distrito: 'Distrito 4281', formulario_url: 'https://f' }
  );
  check('tick renderiza plantilla del paso', msg.text.includes('Cali') && msg.template?.id === fmap.ultimo_llamado.templateId, msg.text.slice(0, 120));
  const msg2 = await ENG.renderStepMessage({ name: 'X' }, { key: 'invitacion', channel: 'whatsapp', template: 'Hola {{nombre}}' }, { nombre: 'Ana' });
  check('sin vínculo: inline como antes', msg2.text.includes('Ana') && msg2.template === null, msg2.text);
}

console.log('\n' + '─'.repeat(60));
if (malos.length) {
  console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
  for (const m of malos) console.log('   ·', m);
  process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
