#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El CAMINO de la cola.  npm run test:distribution:queue
// v4.864.0
//
// POR QUÉ NO ALCANZA `test:distribution`. Aquélla prueba el CRITERIO —que el
// calendario reparta, que un 368 no se reintente— y es pura, así que no ve
// nada de lo que de verdad puede fallar acá: que el reclamo sea EXCLUSIVO, que
// la idempotencia rechace el duplicado, que un destino sin permisos no
// arrastre a los demás y que un grupo no llegue nunca al proveedor.
//
// No necesita Postgres ni red: se sustituye `server/lib/db.js` por una base en
// memoria con un hook de resolución de módulos, y `globalThis.fetch` por un
// doble de Meta —el mismo recurso que usan las pruebas del CRM—. Así corre el
// código REAL de `socialPublishService.js`, no una imitación.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const STUB = new URL('./scripts/fixtures/db-distribution-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js`, no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como './db.js' y con el sufijo largo no
// casarían — la prueba se conectaría a un Postgres que no está.
register(
    `data:text/javascript,export async function resolve(s,c,n){return /(^|\\/)db\\.js$/.test(s)?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
    HERE
);

const cola = await import('../server/lib/distributionQueue.js');
const stub = await import(STUB);

let ok = 0; const malos = [];
const chk = (name, cond, detail = '') => {
    if (cond) { ok++; console.log(`  ✓ ${name}`); }
    else { malos.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => chk(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = (t) => console.log(`\n${t}`);

// ── El doble de Meta ────────────────────────────────────────────────
let respuesta = { ok: true, body: { id: '123_456' } };
let llamadas = [];
globalThis.fetch = async (url, init) => {
    llamadas.push({ url: String(url), method: init?.method || 'GET' });
    return {
        ok: respuesta.ok,
        status: respuesta.status || (respuesta.ok ? 200 : 400),
        json: async () => respuesta.body,
    };
};
const metaResponde = (r) => { respuesta = r; };
const metaFalla = (code, message, status = 400) => metaResponde({ ok: false, status, body: { error: { code, message } } });

const CONTENIDO = { kind: 'text', message: 'Hola Distrito 4281' };
const destino = (n, tipo = 'page') => ({
    targetType: tipo, targetId: `t-${n}`, targetName: `Destino ${n}`,
    socialAccountId: tipo === 'group_manual' ? null : `acct-${n}`,
});

const preparar = ({ destinos = 2, tipo = 'page', ...extra } = {}) => {
    stub.reset();
    llamadas = [];
    metaResponde({ ok: true, body: { id: '123_456' } });
    for (let i = 1; i <= destinos; i++) stub.sembrarCuenta({ id: `acct-${i}`, platformId: `t-${i}`, platform: tipo === 'instagram' ? 'instagram' : 'facebook' });
    return cola.createCampaign({
        clubId: 'club-4281', userId: 'u1', name: 'Emergencia',
        content: CONTENIDO,
        targets: Array.from({ length: destinos }, (_, i) => destino(i + 1, tipo)),
        intervalMinutes: 5, timezone: 'America/Bogota',
        now: new Date('2026-08-18T12:00:00Z'), startAt: new Date('2026-08-18T12:00:00Z'),
        ...extra,
    });
};

// ── 1. Un destino, una fila ─────────────────────────────────────────
grupo('1. La campaña se crea y cada destino es un job independiente');

const c1 = await preparar({ destinos: 3 });
chk('la campaña se creó', c1.ok, JSON.stringify(c1));
eq('una fila de campaña', stub.tablas.DistributionCampaign.length, 1);
eq('tres jobs, uno por destino', stub.tablas.DistributionJob.length, 3);
eq('y lo dice la respuesta', c1.created, 3);
const horas = stub.tablas.DistributionJob.map(j => j.scheduledAt.getTime()).sort((a, b) => a - b);
eq('separados por el intervalo', (horas[1] - horas[0]) / 60000, 5);
chk('la campaña arranca programada', stub.tablas.DistributionCampaign[0].status === 'scheduled');
chk('la fila de la campaña se escribe ANTES que los jobs',
    stub.log.findIndex(l => l.startsWith('INSERT INTO "DistributionCampaign"')) <
    stub.log.findIndex(l => l.startsWith('INSERT INTO "DistributionJob"')));

// ── 2. Idempotencia ─────────────────────────────────────────────────
grupo('2. El mismo contenido al mismo destino no entra dos veces');

// Es el doble envío del formulario, o el reintento de una petición que se
// cortó: sin el índice único, el club recibe la publicación repetida.
const dup = await cola.createCampaign({
    clubId: 'club-4281', userId: 'u1', name: 'Emergencia',
    content: CONTENIDO, targets: [destino(1), destino(1)],
    intervalMinutes: 5, timezone: 'UTC', now: new Date('2026-08-18T12:00:00Z'),
});
eq('el destino repetido se crea UNA vez', dup.created, 1);
eq('y el duplicado se cuenta aparte', dup.duplicated, 1);

// ── 3. El avance publica de verdad ──────────────────────────────────
grupo('3. El barrido publica lo que venció, y sólo eso');

await preparar({ destinos: 3 });
const a1 = await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
eq('sólo el primero venció', a1.processed, 1);
const pub = stub.tablas.DistributionJob.filter(j => j.status === 'published');
eq('un destino publicado', pub.length, 1);
chk('con el id que devolvió Meta', pub[0].externalId === '123_456');
chk('se llamó a /feed de una PÁGINA', llamadas.some(l => /\/t-1\/feed$/.test(l.url) && l.method === 'POST'));
eq('los otros dos siguen programados', stub.tablas.DistributionJob.filter(j => j.status === 'scheduled').length, 2);

// ⚠️ CAMBIO DE COMPORTAMIENTO DELIBERADO (v4.876). Antes, una vuelta con dos
// destinos atrasados los sacaba a los DOS de golpe — ignorando el intervalo
// justo cuando más importa, que es al drenar un atraso después de una pausa.
// Con el tope por vuelta en 1 (el valor por omisión), salen de a uno por
// pasada del cron. No es una regresión: es lo que el control existe para hacer.
const a2 = await cola.advance({ now: new Date('2026-08-18T12:20:00Z') });
eq('un atraso drena de a UNO por vuelta', a2.processed, 1);
eq('y lo que no entró queda pendiente, no perdido', a2.pending, 1);
const a3 = await cola.advance({ now: new Date('2026-08-18T12:21:00Z') });
eq('la vuelta siguiente saca el que faltaba', a3.processed, 1);
eq('la campaña queda completada', stub.tablas.DistributionCampaign[0].status, 'done');

// ── 4. El reclamo es exclusivo ──────────────────────────────────────
grupo('4. Dos vueltas simultáneas NO publican dos veces');

// El cron, el sondeo del navegador y el reintento manual llaman al mismo
// `advance`. Sin el UPDATE condicional sobre `attempts`, los tres despachan el
// mismo job y el destino recibe la publicación tres veces.
await preparar({ destinos: 1 });
const [r1, r2, r3] = await Promise.all([
    cola.advance({ now: new Date('2026-08-18T12:00:00Z') }),
    cola.advance({ now: new Date('2026-08-18T12:00:00Z') }),
    cola.advance({ now: new Date('2026-08-18T12:00:00Z') }),
]);
eq('sólo UNA vuelta despachó', r1.processed + r2.processed + r3.processed, 1);
eq('y Meta recibió UNA sola llamada', llamadas.filter(l => l.method === 'POST').length, 1);
eq('el job quedó con un intento', stub.tablas.DistributionJob[0].attempts, 1);

// ── 5. Un permiso no arrastra a los demás ───────────────────────────
grupo('5. Un destino sin permisos no tumba la campaña');

await preparar({ destinos: 2 });
metaFalla(200, 'Permissions error');
await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
eq('ese destino queda sin permisos', stub.tablas.DistributionJob[0].status, 'no_permission');
chk('con el mensaje TEXTUAL de Meta', stub.tablas.DistributionJob[0].error === 'Permissions error');
chk('y NO se reintenta', stub.tablas.DistributionJob[0].retryable === false);
chk('la campaña NO se pausa por un permiso', stub.tablas.DistributionCampaign[0].status !== 'paused');

metaResponde({ ok: true, body: { id: 'ok-2' } });
await cola.advance({ now: new Date('2026-08-18T12:10:00Z') });
eq('el otro destino sí sale', stub.tablas.DistributionJob[1].status, 'published');
// UNA CAMPAÑA CON DESTINOS FALLIDOS NUNCA SE MARCA EXITOSA.
eq('la campaña queda PARCIAL, no completada', stub.tablas.DistributionCampaign[0].status, 'partial');

// ── 6. Un límite detiene la campaña ─────────────────────────────────
grupo('6. Cuando Meta pide frenar, se frena');

await preparar({ destinos: 3 });
metaFalla(32, 'Page request limit reached');
await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
eq('la campaña queda en pausa', stub.tablas.DistributionCampaign[0].status, 'paused');
chk('con el motivo escrito', /frenar/i.test(stub.tablas.DistributionCampaign[0].pausedReason || ''));
chk('y con hora de reanudación', !!stub.tablas.DistributionCampaign[0].resumeAt);

const enPausa = await cola.advance({ now: new Date('2026-08-18T12:30:00Z') });
eq('en pausa no se despacha nada más', enPausa.processed, 0);

// ── 7. Un bloqueo por política nunca se reintenta ───────────────────
grupo('7. Un bloqueo por política detiene y no insiste');

await preparar({ destinos: 2 });
metaFalla(368, 'This action was blocked');
await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
eq('el destino queda fallido', stub.tablas.DistributionJob[0].status, 'failed');
chk('sin marcar reintentable', stub.tablas.DistributionJob[0].retryable === false);
eq('y la campaña se detiene', stub.tablas.DistributionCampaign[0].status, 'paused');

// ── 8. Un fallo transitorio SÍ se reprograma ────────────────────────
grupo('8. Un fallo temporal se vuelve a intentar, más tarde');

await preparar({ destinos: 1 });
metaFalla(2, 'Temporary issue', 500);
await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
const j8 = stub.tablas.DistributionJob[0];
eq('vuelve a la cola', j8.status, 'scheduled');
chk('marcado como reintentable', j8.retryable === true);
chk('la espera del PRIMER reintento son 2 minutos', j8.scheduledAt.getTime() === new Date('2026-08-18T12:00:00Z').getTime() + 2 * 60000);

// ⚠️ `attempts` ya viene incrementado por el reclamo. Contarlo dos veces
// recortaba la cadena a DOS intentos y hacía esperar 8 minutos donde tocaban 2:
// lo destapó esta prueba, no el typecheck. La cadena se agota EXACTAMENTE en
// `maxAttempts`.
await cola.advance({ now: new Date('2026-08-18T12:05:00Z') });
eq('segundo intento, y sigue vivo', stub.tablas.DistributionJob[0].status, 'scheduled');
eq('la espera crece a 8 minutos', stub.tablas.DistributionJob[0].scheduledAt.getTime(), new Date('2026-08-18T12:05:00Z').getTime() + 8 * 60000);
await cola.advance({ now: new Date('2026-08-18T12:20:00Z') });
eq('al tercer intento se rinde', stub.tablas.DistributionJob[0].status, 'failed');
eq('y son TRES intentos, no dos', stub.tablas.DistributionJob[0].attempts, 3);

// ── 9. Un grupo NO llega nunca a Meta ───────────────────────────────
grupo('9. Un grupo de Facebook no se publica solo, y el código lo respeta');

stub.reset(); llamadas = []; metaResponde({ ok: true, body: { id: 'x' } });
// Desde v4.876 un grupo necesita estar VERIFICADO para recibir trabajo — lo
// prueba la sección 18. Acá se siembra verificado para ejercitar el despacho.
stub.sembrarGrupo({ groupId: 'grupo-1', name: 'Rotary Colombia', status: 'verificado' });
const cg = await cola.createCampaign({
    clubId: 'club-4281', userId: 'u1', name: 'Emergencia',
    content: CONTENIDO,
    targets: [{ targetType: 'group_manual', targetId: 'grupo-1', targetName: 'Rotary Colombia', targetUrl: 'https://facebook.com/groups/1' }],
    intervalMinutes: 5, timezone: 'UTC', now: new Date('2026-08-18T12:00:00Z'), startAt: new Date('2026-08-18T12:00:00Z'),
});
chk('la campaña se crea igual', cg.ok);
await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
eq('el destino queda esperando a una persona', stub.tablas.DistributionJob[0].status, 'awaiting_manual');
// ⚠️ La comprobación que sostiene todo el módulo: no hay endpoint al que
// llamar, así que NO se llama a ninguno.
eq('NO se llamó a Meta ni una vez', llamadas.length, 0);

// ── 10. El registro manual lo cierra ────────────────────────────────
grupo('10. Quien publica a mano queda registrado');

const jobManual = stub.tablas.DistributionJob[0];
const m1 = await cola.markManualPublished({ jobId: jobManual.id, clubId: 'club-4281', userName: 'Ana Restrepo', postUrl: 'https://facebook.com/posts/9' });
chk('se registra', m1.ok, JSON.stringify(m1));
eq('el destino queda publicado', stub.tablas.DistributionJob[0].status, 'published');
eq('con quién lo hizo', stub.tablas.DistributionJob[0].publishedBy, 'Ana Restrepo');
eq('y con el enlace de la publicación', stub.tablas.DistributionJob[0].externalUrl, 'https://facebook.com/posts/9');
eq('la campaña queda completada', stub.tablas.DistributionCampaign[0].status, 'done');

// Un destino que publica la plataforma no se marca a mano: sería declarar un
// hecho que nadie comprobó.
await preparar({ destinos: 1 });
const m2 = await cola.markManualPublished({ jobId: stub.tablas.DistributionJob[0].id, clubId: 'club-4281', userName: 'Ana' });
chk('un destino por API no se puede marcar a mano', !m2.ok && /no se marca a mano/i.test(m2.reason));

// ── 11. Aislamiento por sitio ───────────────────────────────────────
grupo('11. Una campaña de otro sitio no existe para quien pregunta');

await preparar({ destinos: 1 });
const idCamp = stub.tablas.DistributionCampaign[0].id;
chk('el dueño la ve', !!(await cola.getCampaign({ campaignId: idCamp, clubId: 'club-4281' })));
chk('otro sitio NO la ve', (await cola.getCampaign({ campaignId: idCamp, clubId: 'club-otro' })) === null);
chk('el operador de plataforma sí', !!(await cola.getCampaign({ campaignId: idCamp, isPlatform: true })));
const rj = await cola.retryJob({ jobId: stub.tablas.DistributionJob[0].id, clubId: 'club-otro' });
chk('y no puede reintentar un destino ajeno', !rj.ok);

// ── 12. No se reintenta lo ya publicado ─────────────────────────────
grupo('12. Reintentar no puede publicar dos veces');

await preparar({ destinos: 1 });
await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
eq('salió', stub.tablas.DistributionJob[0].status, 'published');
const rj2 = await cola.retryJob({ jobId: stub.tablas.DistributionJob[0].id, clubId: 'club-4281' });
chk('reintentar un publicado se rechaza', !rj2.ok && /dos veces/i.test(rj2.reason));

// ── 13. El tope por hora corre el job, no lo descarta ───────────────
grupo('13. El límite por hora espacia; no pierde destinos');

await preparar({ destinos: 3, limits: { maxPerHour: 1 } });
await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
eq('sale uno', stub.tablas.DistributionJob.filter(j => j.status === 'published').length, 1);
const a13 = await cola.advance({ now: new Date('2026-08-18T12:30:00Z') });
eq('el siguiente no sale todavía', a13.processed, 0);
const corridos = stub.tablas.DistributionJob.filter(j => j.status === 'scheduled');
eq('pero NO se pierde: queda programado', corridos.length, 2);
chk('corrido hacia adelante', corridos.every(j => j.scheduledAt > new Date('2026-08-18T13:00:00Z')));

// ── 14. Cancelar detiene lo que falta ───────────────────────────────
grupo('14. Cancelar detiene NUESTRA cola; lo publicado ya está publicado');

await preparar({ destinos: 3 });
await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
await cola.cancelCampaign({ campaignId: stub.tablas.DistributionCampaign[0].id, userId: 'u1' });
eq('lo publicado se conserva', stub.tablas.DistributionJob.filter(j => j.status === 'published').length, 1);
eq('lo pendiente se cancela', stub.tablas.DistributionJob.filter(j => j.status === 'cancelled').length, 2);
const a14 = await cola.advance({ now: new Date('2026-08-18T13:00:00Z') });
eq('y no vuelve a despacharse nada', a14.processed, 0);

// ── 15. Pausar y reanudar ───────────────────────────────────────────
grupo('15. Pausar y reanudar');

await preparar({ destinos: 2 });
await cola.pauseCampaign({ campaignId: stub.tablas.DistributionCampaign[0].id });
eq('en pausa no sale nada', (await cola.advance({ now: new Date('2026-08-18T12:00:00Z') })).processed, 0);
await cola.resumeCampaign({ campaignId: stub.tablas.DistributionCampaign[0].id });
eq('reanudada vuelve a salir', (await cola.advance({ now: new Date('2026-08-18T12:00:00Z') })).processed, 1);

// ── 16. La traza ────────────────────────────────────────────────────
grupo('16. Queda registro de lo que pasó');

chk('se anotan los eventos', stub.tablas.DistributionEvent.length > 0);
chk('incluida la creación', stub.tablas.DistributionEvent.some(e => e.kind === 'created'));
chk('y la pausa', stub.tablas.DistributionEvent.some(e => e.kind === 'paused'));

// ── 17. Nada de esto lanza ──────────────────────────────────────────
grupo('17. La cola nunca lanza: corre dentro de un cron');

let lanzo = false;
try {
    await cola.advance({ now: new Date('2026-08-18T12:00:00Z'), campaignId: 'no-existe' });
    await cola.getCampaign({ campaignId: 'no-existe', clubId: 'x' });
    await cola.retryJob({ jobId: 'no-existe', clubId: 'x' });
    await cola.markManualPublished({ jobId: 'no-existe', clubId: 'x' });
} catch { lanzo = true; }
chk('ninguna operación sobre algo inexistente lanza', !lanzo);

// ── 18. La puerta de verificación ───────────────────────────────────
grupo('18. Un grupo sin verificar NO recibe trabajo');

const campanaConGrupo = (grupos) => {
    stub.reset(); llamadas = []; metaResponde({ ok: true, body: { id: 'x' } });
    for (const g of grupos) stub.sembrarGrupo(g);
    return cola.createCampaign({
        clubId: 'club-4281', userId: 'u1', name: 'Emergencia', content: CONTENIDO,
        targets: grupos.map(g => ({
            targetType: 'group_manual', targetId: g.groupId, targetName: g.name,
            targetUrl: 'https://facebook.com/groups/' + g.groupId,
        })),
        intervalMinutes: 5, timezone: 'UTC',
        now: new Date('2026-08-18T12:00:00Z'), startAt: new Date('2026-08-18T12:00:00Z'),
    });
};

// El estado se lee de la BASE, no del cuerpo de la petición: confiar en lo que
// mande el navegador dejaría la puerta abierta a quien conozca el endpoint.
const soloSinVerificar = await campanaConGrupo([{ groupId: 'g1', name: 'Rotary Colombia', status: 'sin_verificar' }]);
chk('con todos sin verificar, la campaña NO se crea', !soloSinVerificar.ok, JSON.stringify(soloSinVerificar));
chk('y el motivo lo dice', /no están verificados/i.test(soloSinVerificar.reason || ''));
eq('no quedó ningún trabajo', stub.tablas.DistributionJob.length, 0);

const mixta = await campanaConGrupo([
    { groupId: 'g1', name: 'Rotary Colombia', status: 'verificado' },
    { groupId: 'g2', name: 'Sin verificar aún', status: 'sin_verificar' },
    { groupId: 'g3', name: 'Vetado', status: 'sin_permiso' },
]);
chk('con uno verificado, la campaña sí se crea', mixta.ok, JSON.stringify(mixta));
eq('pero SÓLO ese genera trabajo', stub.tablas.DistributionJob.length, 1);
eq('y es el verificado', stub.tablas.DistributionJob[0].targetId, 'g1');
// Se NOMBRAN los que quedaron fuera: «algunos grupos no se pudieron usar»
// obliga a adivinar cuáles.
chk('los excluidos se nombran', mixta.warnings.some(w => /Sin verificar aún/.test(w)));
chk('y el vetado también', mixta.warnings.some(w => /Vetado/.test(w)));

// Un grupo que la campaña pide pero que NO está declarado se trata como sin
// verificar: nadie confirmó nada sobre él.
stub.reset(); llamadas = [];
const fantasma = await cola.createCampaign({
    clubId: 'club-4281', userId: 'u1', name: 'X', content: CONTENIDO,
    targets: [{ targetType: 'group_manual', targetId: 'no-declarado', targetName: 'Fantasma' }],
    intervalMinutes: 5, timezone: 'UTC', now: new Date('2026-08-18T12:00:00Z'),
});
chk('un grupo que no está declarado no pasa la puerta', !fantasma.ok);

// Una Página no pasa por esta puerta: la verificación es cosa de los grupos.
stub.reset(); llamadas = [];
stub.sembrarCuenta({ id: 'acct-1', platformId: 't-1' });
const soloPagina = await cola.createCampaign({
    clubId: 'club-4281', userId: 'u1', name: 'X', content: CONTENIDO,
    targets: [{ targetType: 'page', targetId: 't-1', targetName: 'Página', socialAccountId: 'acct-1' }],
    intervalMinutes: 5, timezone: 'UTC', now: new Date('2026-08-18T12:00:00Z'), startAt: new Date('2026-08-18T12:00:00Z'),
});
chk('una Página no necesita verificación', soloPagina.ok && stub.tablas.DistributionJob.length === 1);

// ── 19. El grupo recuerda cuándo salió lo último ────────────────────
grupo('19. Publicar a mano sella la última publicación del grupo');

await campanaConGrupo([{ groupId: 'g1', name: 'Rotary Colombia', status: 'verificado' }]);
await cola.advance({ now: new Date('2026-08-18T12:00:00Z') });
eq('el destino queda esperando a una persona', stub.tablas.DistributionJob[0].status, 'awaiting_manual');
await cola.markManualPublished({ jobId: stub.tablas.DistributionJob[0].id, clubId: 'club-4281', userName: 'Ana' });
chk('y el grupo recuerda cuándo fue', !!stub.tablas.DistributionGroup[0].lastPublishedAt);

// ── 20. El tope por vuelta ──────────────────────────────────────────
grupo('20. La concurrencia acota cuántos salen en cada pasada');

const conTope = async (concurrency) => {
    stub.reset(); llamadas = []; metaResponde({ ok: true, body: { id: 'ok' } });
    for (let i = 1; i <= 3; i++) stub.sembrarCuenta({ id: `acct-${i}`, platformId: `t-${i}` });
    await cola.createCampaign({
        clubId: 'club-4281', userId: 'u1', name: 'X', content: CONTENIDO,
        targets: [1, 2, 3].map(i => ({ targetType: 'page', targetId: `t-${i}`, targetName: `P${i}`, socialAccountId: `acct-${i}` })),
        // Todos vencidos a la vez: es el caso en que el tope de verdad actúa,
        // como al drenar un atraso después de una pausa.
        intervalMinutes: 5, timezone: 'UTC', concurrency,
        now: new Date('2026-08-18T12:00:00Z'), startAt: new Date('2026-08-18T11:00:00Z'),
    });
    return cola.advance({ now: new Date('2026-08-18T13:00:00Z') });
};
eq('con 1, sale uno por vuelta', (await conTope(1)).processed, 1);
eq('con 3, salen los tres', (await conTope(3)).processed, 3);
eq('un valor absurdo se acota', (await conTope(99)).processed, 3);

console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
