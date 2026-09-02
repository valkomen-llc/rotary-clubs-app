// ════════════════════════════════════════════════════════════════════
// Lo comisionado en las inscripciones — pruebas del CRITERIO — v4.984
//
// No necesitan base, credenciales ni red: prueban las decisiones —qué parte
// del recargo es ingreso, cómo se lee un desglose venga como venga y cómo se
// agrega sin mezclar monedas—, separadas de la orquestación.
//
//   npm run test:registration-revenue
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    LINE_MEANING, REVENUE_FLOWS, parseSurchargeLines, revenueOfRecord,
    aggregateRevenue, unknownLines, unclassifiedLineKeys,
} from '../server/lib/registrationRevenue.js';
import { SURCHARGE_LINES, computeSurcharge, DEFAULT_SURCHARGE } from '../server/lib/checkoutSurcharge.js';

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);

// ── 1. De quién es cada línea ────────────────────────────────────────
grupo('No todo el recargo es ingreso');

check('el traslado interbancario SÍ lo monetiza la plataforma',
    LINE_MEANING.transfer?.ours === true);
check('la comisión de la pasarela NO es ingreso',
    LINE_MEANING.gateway?.ours === false);

// ⚠️ Al agregar una línea al recargo hay que clasificarla: sin esto se cobra
// y no se sabe de quién es, y el panel la deja fuera en silencio.
check('toda línea declarada del recargo está clasificada',
    unclassifiedLineKeys().length === 0, unclassifiedLineKeys().join(', '));
check('los dos flujos que cobran recargo están declarados',
    REVENUE_FLOWS.length === 2
    && REVENUE_FLOWS.some(f => f.key === 'project_fair')
    && REVENUE_FLOWS.some(f => f.key === 'event_registration'));

// ── 2. Un solo lector para las dos formas de guardarlo ───────────────
grupo('El desglose se lee igual venga como cadena o como objeto');

const comoCadena = parseSurchargeLines('gateway:11600,transfer:8400');
const comoObjeto = parseSurchargeLines({ gateway: 11600, transfer: 8400 });
check('la cadena del registro de asistentes se interpreta',
    comoCadena.gateway === 11600 && comoCadena.transfer === 8400);
check('el objeto de la Feria da lo MISMO',
    JSON.stringify(comoCadena) === JSON.stringify(comoObjeto));
check('lo vacío no inventa líneas',
    Object.keys(parseSurchargeLines('')).length === 0
    && Object.keys(parseSurchargeLines(null)).length === 0
    && Object.keys(parseSurchargeLines(undefined)).length === 0);
check('un valor ilegible se descarta, no se cuenta como cero',
    parseSurchargeLines('gateway:abc,transfer:8400').gateway === undefined);
check('los espacios de una cadena no crean una clave distinta',
    parseSurchargeLines(' transfer : 8400 ').transfer === 8400);

// ── 3. Lo de un cobro, separado por dueño ────────────────────────────
grupo('Un cobro, repartido por quién se queda con cada parte');

const cobro = revenueOfRecord({
    currency: 'COP', lines: 'gateway:11600,transfer:8400', surchargeAmount: 20000,
});
check('lo nuestro es SÓLO el traslado', cobro.ours === 8400);
check('la pasarela va aparte y no suma a lo nuestro', cobro.passthrough === 11600);
check('el total es la suma de las líneas', cobro.total === 20000);

// ⚠️ El total del DESGLOSE manda sobre el declarado: es lo que de verdad se
// cobró línea por línea.
const discrepa = revenueOfRecord({
    currency: 'COP', lines: { gateway: 11600, transfer: 8400 }, surchargeAmount: 99999,
});
check('el desglose manda sobre un total declarado que no cuadra',
    discrepa.total === 20000);

// ⚠️ SIN DESGLOSE NO SE REPARTE NADA. Atribuir el 2,1 % con la tarifa de HOY
// sería inventar el dato que se vino a medir: la tarifa es configurable y pudo
// ser otra el día del cobro.
const sinDesglose = revenueOfRecord({ currency: 'COP', surchargeAmount: 20000 });
check('sin desglose, lo nuestro es 0 y se marca como no desglosado',
    sinDesglose.ours === 0 && sinDesglose.hasBreakdown === false);
check('sin desglose el total SÍ se conserva: es una medida',
    sinDesglose.total === 20000);

// Ante la duda, no es nuestro.
const rara = revenueOfRecord({ currency: 'COP', lines: 'inventada:5000,transfer:8400' });
check('una línea que el catálogo no reconoce no cuenta como ingreso',
    rara.ours === 8400 && rara.unknown === 5000);

// ── 4. Agregar sin mezclar monedas ───────────────────────────────────
grupo('Cada moneda por su lado, nunca una cifra que las sume');

const registros = [
    { flow: 'project_fair', currency: 'COP', lines: { gateway: 7250, transfer: 5250 } },
    { flow: 'project_fair', currency: 'COP', lines: { gateway: 7250, transfer: 5250 } },
    { flow: 'event_registration', currency: 'COP', lines: 'gateway:11600,transfer:8400' },
    { flow: 'event_registration', currency: 'USD', lines: 'gateway:2.9,transfer:2.1' },
    { flow: 'event_registration', currency: 'USD', surchargeAmount: 5 },
];
const { monedas, flujos } = aggregateRevenue(registros);

check('hay una fila por moneda y ninguna que las sume',
    monedas.length === 2 && monedas.map(m => m.currency).join(',') === 'COP,USD');
const cop = monedas.find(m => m.currency === 'COP');
const usd = monedas.find(m => m.currency === 'USD');
check('lo comisionado en pesos suma sólo los traslados en pesos',
    cop.ours === 5250 + 5250 + 8400);
check('lo comisionado en dólares no toca lo de pesos', usd.ours === 2.1);
check('el cobro sin desglose se CUENTA aparte, no como cero',
    usd.cobros === 2 && usd.conDesglose === 1 && usd.sinDesglose === 1);

check('el desglose por flujo separa la Feria del evento',
    flujos.find(f => f.flow === 'project_fair' && f.currency === 'COP').ours === 10500
    && flujos.find(f => f.flow === 'event_registration' && f.currency === 'COP').ours === 8400);
check('un flujo no declarado cae en «otro», no se descarta',
    aggregateRevenue([{ flow: 'lo_que_sea', currency: 'COP', lines: { transfer: 100 } }])
        .flujos[0].flow === 'otro');
check('un registro sin moneda no entra: no se le puede asignar ninguna',
    aggregateRevenue([{ flow: 'project_fair', lines: { transfer: 100 } }]).monedas.length === 0);

check('las líneas desconocidas se DICEN',
    unknownLines([{ currency: 'COP', lines: 'inventada:1,transfer:2' }]).join(',') === 'inventada');

// ── 5. Contra el cálculo REAL del recargo ────────────────────────────
//
// Los números de las pruebas no son inventados para que pasen: salen de
// `computeSurcharge`, que es lo que de verdad se le cobra a alguien.
grupo('Cuadra con lo que el recargo cobra de verdad');

const q = computeSurcharge(400000, {
    config: DEFAULT_SURCHARGE, currency: 'COP', flow: 'event_registration',
});
const desdeElCobro = revenueOfRecord({
    currency: 'COP',
    lines: q.lines.map(l => `${l.key}:${l.amount}`).join(','),
    surchargeAmount: q.surcharge,
});
check('sobre los 400.000 del registro nacional, el total coincide',
    desdeElCobro.total === q.surcharge, `${desdeElCobro.total} vs ${q.surcharge}`);
check('y lo nuestro es exactamente la línea del traslado',
    desdeElCobro.ours === q.lines.find(l => l.key === 'transfer').amount);
check('lo nuestro NO es el recargo entero',
    desdeElCobro.ours < desdeElCobro.total);

// ── 6. El camino: dónde queda escrito el desglose ────────────────────
//
// El criterio puede estar bien y el defecto vivir en el camino (la lección de
// v4.744): si la Feria vuelve a guardar el desglose sólo dentro del `Payment`
// —que se escribe únicamente cuando `cfg.clubId` está configurado— la única
// copia queda en Stripe y este panel no tiene qué leer. Se lee el archivo.
grupo('La Feria guarda su desglose en la inscripción, no sólo en el Payment');

const feria = readFileSync(new URL('../server/controllers/projectFairController.js', import.meta.url), 'utf8');
check('el desglose se escribe en la metadata de la inscripción',
    /surcharge: surchargeFromMetadata\(session\.metadata\)/.test(feria));
const dentroDelIf = feria.indexOf('if (submission.clubId)');
const dondeSeGuarda = feria.indexOf('surcharge: surchargeFromMetadata(session.metadata)');
check('y se escribe FUERA del bloque que depende de `cfg.clubId`',
    dondeSeGuarda > 0 && dentroDelIf > 0 && dondeSeGuarda < dentroDelIf);
// Se cuentan los LECTORES, no la forma de leer: el único que queda usa
// legítimamente `md.surchargeLines`, así que exigir cero ahí daba un falso
// negativo. Lo que no puede haber es un segundo.
const lectores = (feria.match(/\.surchargeLines/g) || []).length;
check('hay UN solo lector del desglose en la Feria',
    lectores === 1, `lectores=${lectores}`);

const ctrl = readFileSync(new URL('../server/controllers/payoutController.js', import.meta.url), 'utf8');
check('el endpoint lee las DOS puntas',
    /FROM "ProjectFairSubmission"/.test(ctrl) && /FROM "EventRegistrationPayment"/.test(ctrl));
check('no castea el JSON en SQL: lo lee en JS',
    !/metadata::jsonb|payload::jsonb/.test(ctrl));

const rutas = readFileSync(new URL('../server/routes/payouts.js', import.meta.url), 'utf8');
check('la ruta es del operador de la plataforma',
    /registration-revenue', roleMiddleware\(superAdminRoles\)/.test(rutas));

// ── 7. La pantalla no suma las dos preguntas ─────────────────────────
grupo('El panel no mezcla lo descontado con lo sumado');

const tsx = readFileSync(new URL('../src/components/admin/RegistrationRevenuePanel.tsx', import.meta.url), 'utf8');
check('la cifra grande es lo NUESTRO, no el recargo entero',
    /money\(m\.ours, m\.currency\)/.test(tsx));
check('lo que cubre la pasarela se dice que no es ingreso',
    /no es ingreso/.test(tsx));
check('los cobros sin desglose se dicen en la pantalla',
    /sinDesglose > 0/.test(tsx));

console.log(`\n${pasadas}/${pasadas + fallos.length} comprobaciones OK`);
if (fallos.length) {
    console.log(`\nFallaron:\n${fallos.map(f => `  - ${f}`).join('\n')}`);
    process.exit(1);
}
