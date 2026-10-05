// ════════════════════════════════════════════════════════════════════════════
// Ciclo de vida de Campañas de Contenido — v4.1163
//
// Prueba FUNCIONAL con BD en memoria (`fixtures/db-activation-stub.mjs`): se
// ejercitan los HANDLERS reales (crear → editar → programar → reprogramar →
// activar → pausar → reactivar → duplicar → eliminar) y se comprueba estado,
// historial y permisos en cada paso.
//
// Sin red, sin Postgres, sin IA. Lo que NO se puede probar aquí (el tick con
// audiencia dinámica real) se cubre con aserciones de código en
// `test:content:activation`.
// ════════════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-activation-stub.mjs', HERE).href;

register(
  `data:text/javascript,export async function resolve(s,c,n){
        if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
        return n(s,c);
     }`,
  HERE
);

const CTRL = await import('../server/controllers/contentActivationController.js');
const stub = await import(DB);

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✓ ${n}`); }
  else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = (t) => console.log(`\n── ${t} ──`);

const res = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const correr = async (handler, req) => { const r = res(); await handler(req, r); return r; };
// Super Admin CON club asociado: el alcance global no depende del sitio.
const SUPER = { user: { role: 'superadmin', id: 'u-super', clubId: 'club-9' }, headers: {} };
// Admin de distrito ajeno, con alcance hidratado en el token (sin DB).
const DISTRITO = { user: { role: 'district_admin', id: 'u-d9', districtId: 'd9', clubId: 'club-9' }, headers: {} };

const BASE = {
  name: 'Rotary en Acción — Participación recurrente',
  description: 'Campaña permanente para motivar a los clubes.',
  objetivo: 'Motivar el reporte mensual.',
  contributionCampaignId: 'cc1',
  startAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  endAt: new Date(Date.now() + 60 * 86400000).toISOString(),
  timezone: 'America/Bogota',
  frecuencia: 'mensual',
  canales: ['email'],
  scopeDef: { type: 'club', ids: ['club-1'] },
  audienceMode: 'fixed',
  audienceSnapshot: [
    { contactId: 'c1', channel: 'email', name: 'Ana', email: 'ana@club.org' },
    { contactId: 'c2', channel: 'whatsapp', name: 'Luis', phone: '+57300111' },
  ],
  audienceDef: { match: 'all', rules: [{ field: 'role', op: 'in', value: ['president'] }], sources: ['crm_contacts'] },
  contentDef: { email: { subject: 'Comparte tu actividad', bodyText: 'Hola, cuéntanos qué hizo tu club.' }, whatsapp: { body: '' } },
  flowDef: [{ dayOffset: 0, key: 'invitacion', channel: 'email', condition: 'siempre', waitDays: 0, action: 'enviar', expect: 'clic' }],
  followRules: { stopOnResponse: true, maxAttempts: 5 },
};

stub.reset();

grupo('1 · Crear como borrador y editar');
let r = await correr(CTRL.create, { ...SUPER, body: { ...BASE } });
check('crear devuelve 201 en borrador', r.code === 201 && r.body?.campaign?.status === 'borrador', `code=${r.code} ${r.body?.error || ''}`);
const id = r.body?.campaign?.id;
check('tiene id propio', Boolean(id));

r = await correr(CTRL.update, { ...SUPER, params: { id }, body: { name: 'Rotary en Acción — Participación recurrente (editada)', description: 'Nueva descripción' } });
check('editar cambia nombre y descripción', r.code === 200 && r.body?.campaign?.name.includes('(editada)'), `code=${r.code} ${r.body?.error || ''}`);

r = await correr(CTRL.update, { ...SUPER, params: { id }, body: { startAt: new Date(Date.now() + 60 * 86400000).toISOString(), endAt: new Date(Date.now() + 2 * 86400000).toISOString() } });
check('reprogramar con fin anterior al inicio → 400', r.code === 400, `code=${r.code}`);

grupo('2 · Programar, reprogramar y cancelar programación');
r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'programada' } });
check('borrador→programada', r.code === 200 && r.body?.campaign?.status === 'programada', `code=${r.code} ${r.body?.error || ''}`);

const nuevaFecha = new Date(Date.now() + 5 * 86400000).toISOString();
r = await correr(CTRL.update, { ...SUPER, params: { id }, body: { startAt: nuevaFecha } });
check('cambiar fecha en programada actualiza', r.code === 200 && r.body?.campaign?.startAt === nuevaFecha, `code=${r.code} ${r.body?.error || ''}`);
r = await correr(CTRL.detail, { ...SUPER, params: { id } });
check('el detalle refleja la fecha reprogramada (tarjeta sincronizada)', r.body?.campaign?.startAt === nuevaFecha);

r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'activa' } });
check('programada→activa exige audiencia/contenido (borrador incompleto daría 400)', r.code === 200, `code=${r.code} ${r.body?.error || ''}`);

grupo('3 · Activar una sola vez: sin ejecuciones ni inscripciones duplicadas');
const execs1 = stub.datos.executions.filter((e) => String(e.campaignId) === String(id));
check('activar crea UNA ejecución', execs1.length === 1 && execs1[0].status === 'activa', `n=${execs1.length}`);
const enrs1 = stub.datos.enrollments.filter((n) => String(n.campaignId) === String(id));
check('inscribe la foto fija (2 contactos)', enrs1.length === 2, `n=${enrs1.length}`);

r = await correr(CTRL.enroll, { ...SUPER, params: { id } });
const enrs2 = stub.datos.enrollments.filter((n) => String(n.campaignId) === String(id));
check('re-inscribir NO duplica (UNIQUE executionId+contactId)', enrs2.length === 2, `n=${enrs2.length}`);

r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'programada' } });
check('activa→programada bloqueada por FLOW', r.code === 400, `code=${r.code}`);

grupo('4 · Pausar, reprogramar en pausa y reactivar sin perder historial');
r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'pausada' } });
check('activa→pausada (conserva configuración)', r.code === 200 && r.body?.campaign?.status === 'pausada', `code=${r.code} ${r.body?.error || ''}`);

const fechaPausa = new Date(Date.now() + 9 * 86400000).toISOString();
r = await correr(CTRL.update, { ...SUPER, params: { id }, body: { startAt: fechaPausa, frecuencia: 'quincenal' } });
check('en pausa se reprograma fecha y frecuencia', r.code === 200 && r.body?.campaign?.frecuencia === 'quincenal', `code=${r.code} ${r.body?.error || ''}`);

r = await correr(CTRL.update, { ...SUPER, params: { id }, body: { name: 'INTENTO' } });
check('en pausa el nombre NO cambia (solo parcial + fechas)', r.code === 200 && !String(r.body?.campaign?.name).includes('INTENTO'), `name=${r.body?.campaign?.name}`);

r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'activa' } });
check('pausada→activa (reanudar)', r.code === 200, `code=${r.code} ${r.body?.error || ''}`);
const execs2 = stub.datos.executions.filter((e) => String(e.campaignId) === String(id));
check('reactivar REUTILIZA la ejecución (no crea otra)', execs2.length === 1, `n=${execs2.length}`);
check('el historial de inscripciones sigue intacto', stub.datos.enrollments.filter((n) => String(n.campaignId) === String(id)).length === 2);

grupo('5 · Duplicar: nace borrador sin historial');
r = await correr(CTRL.duplicate, { ...SUPER, params: { id } });
check('duplicar devuelve 201 en borrador', r.code === 201 && r.body?.campaign?.status === 'borrador', `code=${r.code} ${r.body?.error || ''}`);
const copiaId = r.body?.campaign?.id;
check('la copia tiene (copia) en el nombre', String(r.body?.campaign?.name).includes('(copia)'));
check('la copia NO hereda ejecuciones', stub.datos.executions.filter((e) => String(e.campaignId) === String(copiaId)).length === 0);
check('la copia conserva ámbito y frecuencia', r.body?.campaign?.scopeDef?.type === 'club' && r.body?.campaign?.frecuencia === 'quincenal');

r = await correr(CTRL.duplicate, { ...SUPER, params: { id: copiaId } });
check('copia de copia se numera (copia 2)', String(r.body?.campaign?.name).includes('(copia 2)'), `name=${r.body?.campaign?.name}`);
const copia2Id = r.body?.campaign?.id;

grupo('6 · Eliminar: confirmación, real sin historial y archivado con historial');
r = await correr(CTRL.remove, { ...SUPER, params: { id: copiaId }, body: {} });
check('sin confirm explícita → 400', r.code === 400, `code=${r.code}`);

r = await correr(CTRL.remove, { ...SUPER, params: { id: copia2Id }, body: { confirm: true } });
check('copia sin historial: borrado REAL', r.code === 200 && r.body?.deleted === true && r.body?.policy === 'hard', `code=${r.code} ${JSON.stringify(r.body)}`);
r = await correr(CTRL.detail, { ...SUPER, params: { id: copia2Id } });
check('tras borrado real ya no existe (404)', r.code === 404, `code=${r.code}`);

r = await correr(CTRL.remove, { ...SUPER, params: { id }, body: { confirm: true } });
check('con ejecuciones: ARCHIVADA, no destruida', r.code === 200 && r.body?.archived === true && r.body?.policy === 'soft', `code=${r.code} ${JSON.stringify(r.body)}`);
check('el historial sobrevive al archivado', stub.datos.executions.filter((e) => String(e.campaignId) === String(id)).length === 1
  && stub.datos.enrollments.filter((n) => String(n.campaignId) === String(id)).length === 2);
r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'borrador' } });
check('archivada→borrador (restaurar)', r.code === 200 && r.body?.campaign?.status === 'borrador', `code=${r.code} ${r.body?.error || ''}`);

grupo('7 · Finalizar y reactivar (recurrente)');
r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'programada' } });
check('borrador→programada de nuevo', r.code === 200, `code=${r.code} ${r.body?.error || ''}`);
r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'borrador' } });
check('programada→borrador deja evento programacion_cancelada', r.code === 200
  && stub.datos.events.some((e) => String(e.campaignId) === String(id) && e.type === 'programacion_cancelada'));
r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'programada' } });
r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'activa' } });
r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'finalizada' } });
check('activa→finalizada', r.code === 200 && r.body?.campaign?.status === 'finalizada', `code=${r.code} ${r.body?.error || ''}`);
r = await correr(CTRL.transition, { ...SUPER, params: { id }, body: { status: 'activa' } });
check('finalizada→activa (reactivar recurrente)', r.code === 200, `code=${r.code} ${r.body?.error || ''}`);
const tipos = stub.datos.events.filter((e) => String(e.campaignId) === String(id)).map((e) => e.type);
for (const t of ['campana_activada', 'campana_pausada', 'campana_reactivada', 'campana_archivada', 'campana_finalizada']) {
  check(`trazabilidad: evento ${t}`, tipos.includes(t));
}

grupo('8 · Permisos: visible no es modificable');
// Campaña legado: sin ámbito ni remitente, con club propietario ajeno.
// Visible por regla de lectura, pero NO modificable fuera del sitio.
stub.datos.campaigns.push({
  id: 'legacy1', clubId: 'club-1', name: 'Campaña legado', description: '', objetivo: '',
  contributionCampaignId: null, startAt: null, endAt: null, timezone: 'America/Bogota',
  frecuencia: 'mensual', customDays: null, canales: ['email'], scopeDef: { type: 'district', ids: [] },
  audienceMode: 'dynamic', audienceSnapshot: null, excludedContactIds: [], manualRecipients: [],
  savedSegmentId: null, contentDef: {}, audienceDef: { match: 'all', rules: [] }, flowDef: [],
  followRules: {}, variables: {}, status: 'borrador', createdBy: null, senderSiteId: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
r = await correr(CTRL.detail, { ...DISTRITO, params: { id: 'legacy1' } });
check('distrito ajeno VE la campaña legado (lectura)', r.code === 200, `code=${r.code} ${r.body?.error || ''}`);
for (const [nombre, handler, req] of [
  ['editar', CTRL.update, { ...DISTRITO, params: { id: 'legacy1' }, body: { description: 'x' } }],
  ['transicionar', CTRL.transition, { ...DISTRITO, params: { id: 'legacy1' }, body: { status: 'pausada' } }],
  ['duplicar', CTRL.duplicate, { ...DISTRITO, params: { id: 'legacy1' } }],
  ['eliminar', CTRL.remove, { ...DISTRITO, params: { id: 'legacy1' }, body: { confirm: true } }],
]) {
  const rr = await correr(handler, req);
  check(`${nombre} de campaña ajena → 403`, rr.code === 403, `code=${rr.code}`);
}
r = await correr(CTRL.transition, { ...DISTRITO, params: { id: 'inexistente' }, body: { status: 'pausada' } });
check('campaña inexistente → 404 (no 403)', r.code === 404, `code=${r.code}`);

console.log('\n' + '─'.repeat(60));
if (malos.length) {
  console.log(`❌ ${malos.length} fallo(s) de ${ok + malos.length}:`);
  for (const m of malos) console.log('   ·', m);
  process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, todas en verde.`);
