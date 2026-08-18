#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El CRITERIO de la Distribución multi-destino.  npm run test:distribution
// v4.864.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. Prueban `distributionSpec.js`, que es
// puro, separado de `distributionQueue.js`, que orquesta — por el mismo motivo
// que `seoRules.js` vive aparte de `seoAudit.js`: un motor de cola que sólo se
// ejercita contra Meta real termina sin pruebas, y entonces nadie se entera de
// que una regla cambió de signo.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    TARGET_TYPES, publishesViaApi, targetSupports, MANUAL_NOTICE,
    JOB_STATES, CAMPAIGN_STATES, isContentKind,
    MIN_INTERVAL_MINUTES, normalizeInterval, normalizeLimits, DEFAULT_LIMITS,
    buildSchedule, groupScheduleByDay, zonedParts,
    classifyMetaError, retryDelayMinutes, shouldRetry,
    contentHash, idempotencyKey,
    summarizeJobs, foldCampaignStatus, validateCampaign,
} from '../server/lib/distributionSpec.js';

let ok = 0; const malos = [];
const chk = (name, cond, detail = '') => {
    if (cond) { ok++; console.log(`  ✓ ${name}`); }
    else { malos.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => chk(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const TZ = 'America/Bogota';
const hhmm = (d) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

// ── 1. Los grupos no publican solos, y está DECLARADO ───────────────
grupo('1. Un grupo de Facebook no se publica por API, y el criterio lo declara');

chk('una Página publica sola', publishesViaApi('page'));
chk('Instagram publica solo', publishesViaApi('instagram'));
chk('un GRUPO no', !publishesViaApi('group_manual'));
chk('el aviso del modo asistido nombra la fecha de la retirada', /22 de abril de 2024/.test(MANUAL_NOTICE));
chk('el aviso dice que publica una persona, no la plataforma', /lo hace una persona/i.test(MANUAL_NOTICE));

// Instagram no admite enlaces en el pie. Declararlo es lo que impide ofrecer
// en la pantalla un destino que va a fallar seguro.
chk('Instagram no admite un enlace', !targetSupports('instagram', 'link'));
chk('Instagram no admite texto suelto', !targetSupports('instagram', 'text'));
chk('Instagram sí admite imagen', targetSupports('instagram', 'image'));
chk('una Página admite las cuatro formas', ['text', 'link', 'image', 'video'].every(k => targetSupports('page', k)));

// ── 2. Intervalos ───────────────────────────────────────────────────
grupo('2. El intervalo tiene un piso, y el piso tiene un motivo');

eq('15 min se respeta', normalizeInterval(15).minutes, 15);
eq('1 minuto sube al piso', normalizeInterval(1).minutes, MIN_INTERVAL_MINUTES);
chk('y se DICE por qué subió', /una vez por minuto/.test(normalizeInterval(1).reason || ''));
eq('un intervalo absurdo se acota', normalizeInterval(99999).minutes, 1440);
eq('basura cae al de 15', normalizeInterval('x').minutes, 15);
chk('lo ajustado se marca', normalizeInterval(2).adjusted === true && normalizeInterval(15).adjusted === false);

// ── 3. El calendario ────────────────────────────────────────────────
grupo('3. El calendario reparte, respeta la ventana y no programa hacia atrás');

const ahora = new Date('2026-08-18T12:00:00Z');
const s1 = buildSchedule({ startAt: new Date('2026-08-18T13:00:00Z'), intervalMinutes: 15, count: 4, timezone: TZ, now: ahora });
eq('cuatro destinos, cuatro huecos', s1.length, 4);
eq('separados 15 minutos', (s1[1].at - s1[0].at) / 60000, 15);
eq('el último cae 45 min después', (s1[3].at - s1[0].at) / 60000, 45);

// Una campaña «para ayer» saldría entera de golpe en la primera vuelta del
// cron, que es justo lo que el intervalo existe para evitar.
const pasado = buildSchedule({ startAt: new Date('2020-01-01T00:00:00Z'), intervalMinutes: 5, count: 2, timezone: TZ, now: ahora });
chk('una fecha pasada arranca AHORA, no hacia atrás', pasado[0].at.getTime() === ahora.getTime());

// Ventana horaria en hora del sitio.
const conVentana = buildSchedule({
    startAt: new Date('2026-08-18T06:00:00Z'), intervalMinutes: 60, count: 5,
    timezone: TZ, window: { from: '08:00', to: '12:00' }, perDay: 3, now: new Date('2026-08-18T05:00:00Z'),
});
eq('el primero abre la ventana a las 08:00 locales', hhmm(conVentana[0].at), '08:00');
eq('tres por día y el cuarto salta al día siguiente', conVentana[3].dateKey, '2026-08-19');
eq('y ese cuarto vuelve a abrir a las 08:00', hhmm(conVentana[3].at), '08:00');
chk('nunca se publica fuera de la franja', conVentana.every(s => {
    const m = zonedParts(s.at, TZ).minuteOfDay;
    return m >= 8 * 60 && m <= 12 * 60;
}));

// Arrancar de madrugada no dispara a las 3 a. m.
const madrugada = buildSchedule({
    startAt: new Date('2026-08-19T04:00:00Z'), intervalMinutes: 15, count: 2,
    timezone: TZ, window: { from: '08:00', to: '12:00' }, now: new Date('2026-08-19T03:00:00Z'),
});
eq('un arranque fuera de la ventana espera a que abra', hhmm(madrugada[0].at), '08:00');

// La zona horaria importa: la función corre en UTC.
const bogota = buildSchedule({ startAt: new Date('2026-08-18T05:00:00Z'), intervalMinutes: 30, count: 1, timezone: TZ, window: { from: '09:00', to: '17:00' }, now: new Date('2026-08-18T04:00:00Z') });
const madrid = buildSchedule({ startAt: new Date('2026-08-18T05:00:00Z'), intervalMinutes: 30, count: 1, timezone: 'Europe/Madrid', window: { from: '09:00', to: '17:00' }, now: new Date('2026-08-18T04:00:00Z') });
chk('«las 9 de la mañana» NO es el mismo instante en Bogotá que en Madrid', bogota[0].at.getTime() !== madrid[0].at.getTime());

eq('el calendario se agrupa por día', groupScheduleByDay(conVentana, TZ).length, 2);
eq('cero destinos, cero huecos', buildSchedule({ startAt: ahora, intervalMinutes: 15, count: 0, timezone: TZ }).length, 0);

// ── 4. Los errores de Meta ──────────────────────────────────────────
grupo('4. La CLASE del error decide, no el número');

const c = (o) => classifyMetaError(o);
eq('190 es token vencido', c({ code: 190 }).status, 'needs_reconnect');
chk('y detiene la campaña', c({ code: 190 }).pauseCampaign === true);
chk('un token vencido NO se reintenta', c({ code: 190 }).retryable === false);

eq('32 es límite de Página', c({ code: 32 }).status, 'rate_limited');
chk('un límite pausa y espera', c({ code: 32 }).pauseCampaign && c({ code: 32 }).waitMinutes === 60);
chk('un límite SÍ se reintenta', c({ code: 32 }).retryable === true);
eq('un 429 también es límite', c({ httpStatus: 429 }).status, 'rate_limited');

eq('200 es permiso', c({ code: 200 }).status, 'no_permission');
chk('un permiso NO pausa la campaña entera: es cosa de ese destino', c({ code: 200 }).pauseCampaign === false);
chk('y no se reintenta', c({ code: 200 }).retryable === false);

// Insistir ante un bloqueo por política es la conducta que Meta lee como
// abuso, y lo que está en juego es la app entera, no una campaña.
eq('368 es bloqueo por política', c({ code: 368 }).kind, 'policy');
chk('un bloqueo por política DETIENE y NUNCA reintenta', c({ code: 368 }).pauseCampaign === true && c({ code: 368 }).retryable === false);
chk('el texto «spam restriction» también detiene', c({ message: 'This action was blocked due to spam' }).retryable === false);

chk('un 500 del proveedor sí se reintenta', c({ httpStatus: 503 }).retryable === true);
chk('un fallo de red sí se reintenta', c({ network: true }).retryable === true);

// ⚠️ La regla del sitio: ante la duda NO se reintenta. Un aviso que no sale se
// ve en el historial y se relanza; uno que sale cinco veces ya salió.
chk('un error DESCONOCIDO no se reintenta por defecto', c({ code: 999999, message: 'vaya' }).retryable === false);
chk('y conserva el texto de Meta', c({ code: 999999, message: 'algo muy concreto' }).reason === 'algo muy concreto');

// ── 5. Reintentos ───────────────────────────────────────────────────
grupo('5. La espera crece y los intentos se acaban');

eq('el primer reintento espera 2 min', retryDelayMinutes(1), 2);
eq('el segundo, 8', retryDelayMinutes(2), 8);
eq('el tercero, media hora', retryDelayMinutes(3), 30);
eq('más allá no crece sin fin', retryDelayMinutes(99), 30);
chk('con intentos de sobra se reintenta', shouldRetry({ verdict: { retryable: true }, attempts: 1, limits: DEFAULT_LIMITS }));
chk('agotados los intentos, no', !shouldRetry({ verdict: { retryable: true }, attempts: 3, limits: DEFAULT_LIMITS }));
chk('un error no reintentable no se reintenta ni con intentos libres', !shouldRetry({ verdict: { retryable: false }, attempts: 0, limits: DEFAULT_LIMITS }));

// ── 6. Idempotencia ─────────────────────────────────────────────────
grupo('6. El mismo contenido al mismo destino da la MISMA llave');

const co = { kind: 'image', message: 'Hola', link: '', mediaUrl: 'https://x/y.jpg' };
eq('la huella es estable', contentHash(co), contentHash({ ...co }));
chk('el orden de las claves no la cambia', contentHash({ mediaUrl: 'https://x/y.jpg', message: 'Hola', kind: 'image' }) === contentHash(co));
chk('cambiar el texto cambia la huella', contentHash({ ...co, message: 'Otro' }) !== contentHash(co));
chk('los espacios sobrantes no cuentan', contentHash({ ...co, message: '  Hola  ' }) === contentHash(co));
eq('la llave junta campaña, destino y contenido', idempotencyKey({ campaignId: 'c1', targetId: 'g1', hash: 'abc' }), 'c1:g1:abc');
chk('sin destino no hay llave', (() => { try { idempotencyKey({ campaignId: 'c1', hash: 'a' }); return false; } catch { return true; } })());

// ── 7. Una campaña con fallos NO se marca exitosa ───────────────────
grupo('7. Nunca «completada» si algún destino falló');

const J = (s) => ({ status: s });
eq('todo publicado es completada', foldCampaignStatus([J('published'), J('published')]), 'done');
eq('con un fallo es PARCIAL, no completada', foldCampaignStatus([J('published'), J('failed')]), 'partial');
eq('sin permisos también cuenta como fallo', foldCampaignStatus([J('published'), J('no_permission')]), 'partial');
eq('todo fallido es fallida', foldCampaignStatus([J('failed'), J('needs_reconnect')]), 'failed');
eq('con algo abierto sigue en curso', foldCampaignStatus([J('published'), J('scheduled')]), 'running');
eq('un destino esperando a una persona la deja EN CURSO', foldCampaignStatus([J('published'), J('awaiting_manual')]), 'running');
eq('cancelada manda sobre todo', foldCampaignStatus([J('published')], { cancelled: true }), 'cancelled');
eq('pausada manda sobre lo abierto', foldCampaignStatus([J('scheduled')], { paused: true }), 'paused');

const resumen = summarizeJobs([J('published'), J('published'), J('failed'), J('awaiting_manual'), J('cancelled')]);
eq('el resumen cuenta por desenlace', [resumen.total, resumen.ok, resumen.fallo, resumen.abierto, resumen.cancelado], [5, 2, 1, 1, 1]);
eq('y cuenta aparte los que esperan a una persona', resumen.manual, 1);

// ── 8. La validación previa ─────────────────────────────────────────
grupo('8. Se valida ANTES de programar, y el aviso no es un error');

const dest = (tt, n) => ({ targetType: tt, targetId: n, targetName: n });
const v1 = validateCampaign({ content: { kind: 'image', mediaUrl: 'https://x/y.jpg' }, targets: [dest('page', 'A')], intervalMinutes: 15 });
chk('una campaña sana pasa', v1.ok && v1.errors.length === 0);

const v2 = validateCampaign({ content: { kind: 'image' }, targets: [dest('page', 'A')], intervalMinutes: 15 });
chk('una imagen sin archivo es ERROR', !v2.ok && v2.errors.some(e => /archivo/i.test(e)));

const v3 = validateCampaign({ content: { kind: 'text', message: 'Hola' }, targets: [], intervalMinutes: 15 });
chk('sin destinos es ERROR', !v3.ok && v3.errors.some(e => /destino/i.test(e)));

// Un destino incompatible se AVISA y se deja fuera; no bloquea la campaña.
const v4 = validateCampaign({ content: { kind: 'link', link: 'https://x', message: 'a' }, targets: [dest('page', 'A'), dest('instagram', 'IG')], intervalMinutes: 15 });
chk('un enlace hacia Instagram no bloquea: avisa', v4.ok);
chk('y NOMBRA el destino que queda fuera', v4.warnings.some(w => /IG/.test(w)));
eq('sólo queda el destino que sí puede', v4.eligible.length, 1);

// El modo asistido se avisa SIEMPRE que haya un grupo elegido.
const v5 = validateCampaign({ content: { kind: 'text', message: 'Hola' }, targets: [dest('group_manual', 'G1')], intervalMinutes: 15 });
chk('elegir un grupo avisa que no se publica solo', v5.warnings.some(w => /no se publica/i.test(w)));

const v6 = validateCampaign({ content: { kind: 'text', message: 'a' }, targets: Array.from({ length: 99 }, (_, i) => dest('page', `P${i}`)), intervalMinutes: 15 });
chk('pasarse del tope de destinos es ERROR', !v6.ok && v6.errors.some(e => /tope/i.test(e)));

const v7 = validateCampaign({ content: { kind: 'text', message: 'a' }, targets: [dest('page', 'A')], intervalMinutes: 1 });
chk('un intervalo por debajo del piso avisa y no bloquea', v7.ok && v7.warnings.length > 0);
eq('y el intervalo devuelto ya viene acotado', v7.interval, MIN_INTERVAL_MINUTES);

eq('los límites se acotan a un rango sensato', normalizeLimits({ maxTargets: 99999 }).maxTargets, 200);
eq('y lo que no se entiende cae al valor por omisión', normalizeLimits({ maxPerHour: 'x' }).maxPerHour, DEFAULT_LIMITS.maxPerHour);

// ── 9. Los catálogos son cerrados ───────────────────────────────────
grupo('9. Catálogos cerrados');

chk('un tipo de contenido inventado no existe', !isContentKind('gif'));
chk('los diez estados del pedido están', ['pending', 'scheduled', 'processing', 'published', 'failed', 'paused', 'no_permission', 'rate_limited', 'needs_reconnect', 'cancelled'].every(s => JOB_STATES[s]));
chk('más el de espera manual, que el pedido no preveía', !!JOB_STATES.awaiting_manual);
chk('«completada con fallos» existe como estado propio de campaña', !!CAMPAIGN_STATES.partial);
chk('cada destino declara qué contenidos admite', Object.values(TARGET_TYPES).every(t => Array.isArray(t.supports) && t.supports.length));

// ── 10. Lo que no puede volver ──────────────────────────────────────
grupo('10. La vía muerta no puede reaparecer');

// Dentro de un año nadie va a recordar por qué no hay grupos por API, y el
// comentario que lo explica no protege nada por sí solo.
const server = [
    'server/lib/distributionSpec.js', 'server/lib/distributionQueue.js',
    'server/controllers/distributionController.js', 'server/routes/distribution.js',
    'server/services/socialPublishService.js',
].map(read).join('\n');

// Se busca la LLAMADA, no la mención: los comentarios de estos archivos
// EXPLICAN por qué la vía no está, y tienen que poder nombrarla. Por eso se
// quitan los comentarios antes de mirar.
const sinComentarios = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
const codigo = sinComentarios(server);

chk('nadie llama al feed de un grupo', !/[/`]\s*\$?\{?[^\n]{0,40}group[^\n]{0,20}\}?\/feed/i.test(codigo));
chk('nadie pide el permiso publish_to_groups', !/publish_to_groups/.test(codigo));
chk('el scope de Meta no lo incluye', !/publish_to_groups/.test(sinComentarios(read('server/services/metaService.js'))));

// El calendario lo resuelve el SERVIDOR y viaja resuelto: con dos cálculos, la
// línea de tiempo del asistente y las horas guardadas podrían discrepar.
const panel = read('src/components/admin/content-studio/DistributionPanel.tsx');
chk('la pantalla NO rehace la aritmética del calendario', !/setMinutes|getMinutes\(\)\s*\+|\*\s*60000|addMinutes/.test(panel));
chk('la pantalla pide la vista previa al servidor', /distribution\/preview/.test(panel));

// El espejo del navegador tiene que conocer los mismos estados, o los pinta
// como texto crudo.
const espejo = read('src/lib/distributionSpec.ts');
chk('el espejo conoce todos los estados de destino', Object.keys(JOB_STATES).every(s => espejo.includes(`${s}:`)));
chk('el espejo conoce todos los estados de campaña', Object.keys(CAMPAIGN_STATES).every(s => espejo.includes(`${s}:`)));
chk('el espejo declara que un grupo no publica solo', /group_manual[^\n]*viaApi: false/.test(espejo));

console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
