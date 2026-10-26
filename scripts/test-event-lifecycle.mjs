// ════════════════════════════════════════════════════════════════════
// El ciclo de vida de un evento — pruebas del CRITERIO — v4.1247
//
// Sin base, sin red y sin credenciales: prueban la decisión de qué evento
// es próximo, en curso, finalizado o «por confirmar», y en qué sección de
// `/eventos` cae. Los datos del caso real son los que devuelve hoy
// `GET /api/clubs/<Distrito 4281>/events`.
//
//   npm run test:event-lifecycle
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    describeLifecycle, partitionPublicEvents, temporalOf, effectiveWindow,
    eventTimezone, siteTimezone, editorialStatusOf, isPubliclyVisible,
    toZonedInputValue, zonedInputToIso, endOfLocalDay, formatInZone,
} from '../server/lib/eventLifecycle.js';

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);

const BOGOTA = 'America/Bogota';
const ms = (iso) => new Date(iso).getTime();
const conLifecycle = (ev, nowMs) => ({ ...ev, lifecycle: describeLifecycle(ev, { nowMs, fallbackTz: BOGOTA }) });
const ids = (lista) => lista.map(e => e.id);

// Referencia: 26 de octubre de 2026, 10:00 en Bogotá.
const HOY = ms('2026-10-26T15:00:00Z');

// ── El caso real del Distrito 4281 ──
const CANCUN = {
    id: 'cancun', title: 'Instituto Rotary Cancún 2026', type: 'meeting',
    startDate: '2026-09-17T12:30:00.000Z', endDate: '2026-09-19T18:00:00.000Z',
    metadata: { venue: { name: 'Iberostar Selection Cancún' } }, createdAt: '2026-08-09T23:00:44.226Z',
};
const VALLEDUPAR = {
    id: 'valledupar', title: 'XII Rotary Project Fair Colombia 2027', type: 'Fundraising',
    startDate: '2027-01-28T12:00:00.000Z', endDate: '2027-01-30T14:30:00.000Z',
    metadata: {}, createdAt: '2026-08-09T20:29:49.441Z',
};
const VILLAVICENCIO = {
    id: 'villavicencio', title: 'XIII Conferencia Rotaria del Distrito 4281', type: 'conference',
    startDate: '2027-05-29T18:00:00.000Z', endDate: '2027-05-30T14:30:00.000Z',
    metadata: {}, createdAt: '2026-08-09T21:30:36.086Z',
};

grupo('11. Caso real — Instituto Rotary Cancún 2026, con fecha de referencia 26/10/2026');
{
    const lista = [CANCUN, VALLEDUPAR, VILLAVICENCIO].map(e => conLifecycle(e, HOY));
    const { upcoming, past, tbd } = partitionPublicEvents(lista, HOY);
    check('Cancún NO está en «Próximos eventos»', !ids(upcoming).includes('cancun'), ids(upcoming).join(', '));
    check('Cancún está en «Eventos anteriores»', ids(past).includes('cancun'));
    check('Cancún queda como «finalizado»', lista[0].lifecycle.temporal === 'finished');
    check('Valledupar (enero 2027) sigue como próximo', ids(upcoming).includes('valledupar'));
    check('Villavicencio (mayo 2027) sigue como próximo', ids(upcoming).includes('villavicencio'));
    check('Los próximos van del más cercano al más lejano', ids(upcoming).join() === 'valledupar,villavicencio', ids(upcoming).join());
    check('Nadie cae en «Fecha por confirmar»', tbd.length === 0);
    check('Cancún conserva título, ubicación y fechas', past[0].title === CANCUN.title && past[0].startDate === CANCUN.startDate && past[0].metadata.venue.name === 'Iberostar Selection Cancún');
    // Mientras se realizaba, estaba «en curso»; un instante después del cierre, ya no.
    const durante = ms('2026-09-18T15:00:00Z');
    check('El 18/09/2026 Cancún estaba «en curso»', describeLifecycle(CANCUN, { nowMs: durante }).temporal === 'ongoing');
    check('El 19/09/2026 a las 13:01 de Cancún ya terminó', describeLifecycle({ ...CANCUN, metadata: { timezone: 'America/Cancun' } }, { nowMs: ms('2026-09-19T18:01:00Z') }).temporal === 'finished');
}

grupo('1–3. Ayer, mañana y hoy (evento de un día, sin hora de fin)');
{
    const ayer = { id: 'ayer', startDate: '2026-10-25T23:00:00Z', metadata: {} };     // 18:00 del 25 en Bogotá
    const manana = { id: 'manana', startDate: '2026-10-27T13:00:00Z', metadata: {} };  // 08:00 del 27
    const hoyTemprano = { id: 'hoyTemprano', startDate: '2026-10-26T12:00:00Z', metadata: {} }; // 07:00 de hoy, ya empezó
    const hoyTarde = { id: 'hoyTarde', startDate: '2026-10-27T00:30:00Z', metadata: {} };       // 19:30 de hoy (00:30Z del 27)
    const { upcoming, past } = partitionPublicEvents([ayer, manana, hoyTemprano, hoyTarde].map(e => conLifecycle(e, HOY)), HOY);
    check('1. El de ayer NO aparece entre los próximos', !ids(upcoming).includes('ayer') && ids(past).includes('ayer'));
    check('2. El de mañana aparece entre los próximos', ids(upcoming).includes('manana'));
    check('3. El de hoy que ya empezó sigue visible (en curso hasta la medianoche local)', ids(upcoming).includes('hoyTemprano')
        && describeLifecycle(hoyTemprano, { nowMs: HOY }).temporal === 'ongoing');
    check('3. El de hoy por la noche es «próximo»', describeLifecycle(hoyTarde, { nowMs: HOY }).temporal === 'upcoming');
    check('3. Su fecha local es HOY aunque en UTC ya sea mañana',
        toZonedInputValue(hoyTarde.startDate, BOGOTA, true) === '2026-10-26');
    const medianoche = ms('2026-10-27T05:00:00Z'); // 00:00 del 27 en Bogotá
    check('3. A las 23:59 de hoy sigue vigente', describeLifecycle(hoyTemprano, { nowMs: medianoche - 60_000 }).temporal === 'ongoing');
    check('3. A las 00:00 de mañana pasa a finalizado', describeLifecycle(hoyTemprano, { nowMs: medianoche }).temporal === 'finished');
    check('Sin fin: no se inventa una duración — termina con el día local', effectiveWindow(hoyTemprano, BOGOTA).endsAt === medianoche);
}

grupo('4–5. Eventos de varios días');
{
    const enMarcha = { id: 'enMarcha', startDate: '2026-10-24T14:00:00Z', endDate: '2026-10-28T22:00:00Z', metadata: {} };
    const terminado = { id: 'terminado', startDate: '2026-10-20T14:00:00Z', endDate: '2026-10-23T22:00:00Z', metadata: {} };
    const lista = [enMarcha, terminado].map(e => conLifecycle(e, HOY));
    const { upcoming, past } = partitionPublicEvents(lista, HOY);
    check('4. El que todavía no termina aparece «En curso»', lista[0].lifecycle.temporal === 'ongoing' && ids(upcoming).includes('enMarcha'));
    check('5. El que ya terminó pasa al historial', lista[1].lifecycle.temporal === 'finished' && ids(past).includes('terminado'));
    const proximo = conLifecycle({ id: 'proximo', startDate: '2026-11-02T14:00:00Z', metadata: {} }, HOY);
    check('Los «en curso» se destacan antes que los próximos', ids(partitionPublicEvents([proximo, lista[0]], HOY).upcoming).join() === 'enMarcha,proximo');
    const viejo = conLifecycle({ id: 'viejo', startDate: '2026-01-10T14:00:00Z', metadata: {} }, HOY);
    check('El historial va del más reciente al más antiguo', ids(partitionPublicEvents([viejo, lista[1]], HOY).past).join() === 'terminado,viejo');
    const finAntesQueInicio = { startDate: '2026-10-26T14:00:00Z', endDate: '2026-10-20T14:00:00Z', metadata: {} };
    check('Un fin anterior al inicio se ignora (rige el día del inicio)', effectiveWindow(finAntesQueInicio, BOGOTA).endsAt === ms('2026-10-27T05:00:00Z'));
}

grupo('6–8. Fecha por confirmar, cancelado y borrador');
{
    const porConfirmar = { id: 'tbd', startDate: '2026-01-01T00:00:00Z', metadata: { dateTbd: true }, createdAt: '2026-10-01' };
    const cancelado = { id: 'cancelado', startDate: '2026-11-15T14:00:00Z', metadata: { status: 'cancelled' } };
    const borrador = { id: 'borrador', startDate: '2026-11-20T14:00:00Z', metadata: { status: 'draft' } };
    const lista = [porConfirmar, cancelado, borrador].map(e => conLifecycle(e, HOY));
    const { upcoming, past, tbd } = partitionPublicEvents(lista, HOY);
    check('6. Sin fecha confirmada → «Próximamente», nunca como finalizado', ids(tbd).join() === 'tbd' && !ids(past).includes('tbd'));
    check('6. Su fecha de relleno no se expone', lista[0].lifecycle.startsAt === null && lista[0].lifecycle.endsAt === null);
    check('7. El cancelado no aparece como próximo', !ids(upcoming).includes('cancelado') && !ids(tbd).includes('cancelado'));
    check('7. …ni en el historial', !ids(past).includes('cancelado'));
    check('8. El borrador no aparece en ninguna sección', ![...upcoming, ...past, ...tbd].some(e => e.id === 'borrador'));
    check('8. El borrador no es visible sin sesión', !isPubliclyVisible(borrador) && isPubliclyVisible(cancelado));
    check('Sin estado guardado = publicado (los eventos que ya existen no cambian)', editorialStatusOf({ metadata: {} }) === 'published' && editorialStatusOf({}) === 'published');
    check('Un estado desconocido también se toma como publicado', editorialStatusOf({ metadata: { status: 'loquesea' } }) === 'published');
    check('El metadata puede venir como texto JSON', editorialStatusOf({ metadata: '{"status":"draft"}' }) === 'draft');
}

grupo('9. Zonas horarias');
{
    // Un evento «todo el día» el 26/10 en Madrid (UTC+1 desde el 25/10) y en Bogotá (UTC-5).
    const madrid = { startDate: '2026-10-25T23:00:00Z', metadata: { allDay: true, timezone: 'Europe/Madrid' } };
    const w = effectiveWindow(madrid, BOGOTA);
    check('Madrid: empieza a las 00:00 locales del 26 (23:00Z del 25)', w.startsAt === ms('2026-10-25T23:00:00Z'), new Date(w.startsAt).toISOString());
    check('Madrid: termina a las 00:00 locales del 27 (23:00Z del 26)', w.endsAt === ms('2026-10-26T23:00:00Z'), new Date(w.endsAt).toISOString());
    // A las 20:00 de Bogotá del 26 (01:00Z del 27), en Madrid ya es el 27: terminó.
    const noche = ms('2026-10-27T01:00:00Z');
    check('A las 20:00 de Bogotá, el evento de Madrid ya terminó', describeLifecycle(madrid, { nowMs: noche }).temporal === 'finished');
    check('El mismo instante es OTRO día según la zona (26 en Madrid, 25 en Bogotá)',
        toZonedInputValue(madrid.startDate, 'Europe/Madrid', true) === '2026-10-26' && toZonedInputValue(madrid.startDate, BOGOTA, true) === '2026-10-25');
    const bogotaNoche = { startDate: '2026-10-26T05:00:00Z', metadata: { allDay: true, timezone: BOGOTA } };
    check('…y el mismo «todo el día del 26» en Bogotá sigue vigente a esa hora', describeLifecycle(bogotaNoche, { nowMs: noche }).temporal === 'ongoing');
    check('Cancún usa su propia zona', eventTimezone({ metadata: { timezone: 'America/Cancun' } }, BOGOTA) === 'America/Cancun');
    check('Una zona inválida cae al respaldo del sitio', eventTimezone({ metadata: { timezone: 'Marte/Olympus' } }, BOGOTA) === BOGOTA);
    check('Sitio: su ajuste manda', siteTimezone({ setting: 'America/Lima', country: 'Colombia' }) === 'America/Lima');
    check('Sitio: sin ajuste, el país', siteTimezone({ country: 'Argentina' }) === 'America/Argentina/Buenos_Aires');
    check('Sitio: sin país conocido, la variable de entorno', siteTimezone({ country: 'Atlántida', envDefault: 'Europe/Madrid' }) === 'Europe/Madrid');
    check('Sitio: sin nada, la zona institucional', siteTimezone({}) === BOGOTA);
    // Cambio de horario: el día de inicio del horario de verano en Nueva York tiene 23 horas.
    const dst = endOfLocalDay(ms('2026-03-08T12:00:00Z'), 'America/New_York');
    check('Cambio de horario: la medianoche se calcula bien', dst === ms('2026-03-09T04:00:00Z'), new Date(dst).toISOString());
    // Lo que muestra el panel y lo que guarda son el mismo instante.
    const guardado = zonedInputToIso('2026-09-17T07:30', 'America/Cancun');
    check('Panel: 07:30 en Cancún se guarda como 12:30Z', guardado === '2026-09-17T12:30:00.000Z', guardado);
    check('Panel: y se vuelve a mostrar como 07:30', toZonedInputValue(guardado, 'America/Cancun') === '2026-09-17T07:30');
    check('Panel: lo que el input acaba de escribir se respeta tal cual', toZonedInputValue('2026-09-17T07:30', 'Europe/Madrid') === '2026-09-17T07:30');
    check('Sitio público: la hora se escribe en la zona del evento',
        /7:30|07:30/.test(formatInZone(CANCUN.startDate, 'America/Cancun', 'es-CO', { hour: '2-digit', minute: '2-digit' })));
}

grupo('10. Un evento finalizado conserva su ficha');
{
    const servidor = readFileSync(new URL('../server/routes/clubs.js', import.meta.url), 'utf8');
    const detalle = servidor.slice(servidor.indexOf("router.get('/:clubId/events/:id'"), servidor.indexOf("router.get('/:clubId/events',"));
    check('La ficha no filtra por fecha (sólo oculta borradores)', !/startDate"?\s*[<>]=?|NOW\(\)/.test(detalle) && /isPubliclyVisible/.test(detalle));
    check('La ficha devuelve el ciclo de vida', /lifecycle/.test(detalle));
}

grupo('11–12. Cambio de fecha y cambio de día, sin intervención');
{
    const ev = { id: 'mov', startDate: '2026-10-20T14:00:00Z', metadata: {} };
    check('11. Antes del cambio: finalizado', describeLifecycle(ev, { nowMs: HOY }).temporal === 'finished');
    check('11. El administrador lo mueve a noviembre: vuelve a próximo', describeLifecycle({ ...ev, startDate: '2026-11-20T14:00:00Z' }, { nowMs: HOY }).temporal === 'upcoming');
    const lc = describeLifecycle({ startDate: '2026-10-27T14:00:00Z', metadata: {} }, { nowMs: HOY });
    check('12. Hoy es próximo', temporalOf(lc, HOY) === 'upcoming');
    check('12. Pasado mañana, el MISMO lifecycle dice finalizado (re-evaluación sin volver a pedir nada)', temporalOf(lc, HOY + 2 * 86_400_000) === 'finished');
    const servidor = readFileSync(new URL('../server/routes/clubs.js', import.meta.url), 'utf8');
    check('12. La lista pública no se guarda en caché', /no-store/.test(servidor.slice(servidor.indexOf("router.get('/:clubId/events',"))));
}

grupo('13–14. Filtros por categoría y vista móvil (la página)');
{
    const pagina = readFileSync(new URL('../src/pages/Eventos.tsx', import.meta.url), 'utf8');
    check('13. La categoría se aplica a la vista elegida (próximos o anteriores)', /byCategory\(\s*lists\.upcoming\s*\)/.test(pagina) && /byCategory\(\s*lists\.past\s*\)/.test(pagina));
    check('Selector «Próximos eventos | Eventos anteriores»', pagina.includes('Próximos eventos') && pagina.includes('Eventos anteriores'));
    check('Sección «Fecha por confirmar»', pagina.includes('Fecha por confirmar'));
    check('Mensaje cuando no hay próximos', pagina.includes('Actualmente no hay eventos programados'));
    check('El selector es accesible (tablist / aria-selected)', pagina.includes('role="tablist"') && pagina.includes('aria-selected'));
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    check('El historial tiene su propia dirección (/eventos/anteriores)', pagina.includes("'/eventos/anteriores'") && app.includes('path="/eventos/anteriores"'));
    check('14. La rejilla sigue siendo responsive (1 columna en móvil, 3 en escritorio)', pagina.includes('grid-cols-1 md:grid-cols-3'));
    check('No se depende sólo del reloj del navegador (se corrige con la hora del servidor)', /headers\.get\('date'\)/i.test(pagina));
}

console.log(`\n${pasadas} pasadas, ${fallos.length} fallidas`);
if (fallos.length) {
    console.log('Fallaron:\n - ' + fallos.join('\n - '));
    process.exit(1);
}
