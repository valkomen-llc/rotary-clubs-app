#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Las fuentes de cobro que se pueden trasladar.  npm run test:collections
// v4.1025.0
//
// Dos mitades y las dos hacen falta:
//
//   · EL CRITERIO — puro: la cascada del sitio, el reparto de lo cobrado, el
//     rótulo de un cobro y el catálogo cerrado de fuentes.
//   · EL CAMINO — con la base sustituida en memoria: que la consulta lleve los
//     parámetros que lleva, que un cobro ya registrado deje de ser candidato,
//     que el ensayo no escriba nada y que dos vueltas no cuenten el mismo
//     dinero dos veces. Es la lección de v4.744 — el criterio puede estar
//     entero y el defecto vivir en el camino.
//
// **No necesita Postgres, credenciales ni red.**
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const STUB = new URL('./scripts/fixtures/db-collections-stub.mjs', HERE).href;

// El hook compara contra `/db.js` y no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como `'./db.js'`.
register(
    `data:text/javascript,export async function resolve(s,c,n){return /(^|\\/)db\\.js$/.test(s)?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
    HERE
);

const spec = await import('../server/lib/collectionSources.js');
const io = await import('../server/lib/projectFairCollections.js');
const trace = await import('../server/lib/paymentTrace.js');
const lote = await import('../server/lib/disbursementBatch.js');
const stub = await import(STUB);

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const lee = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
/** El archivo SIN comentarios: la regla se comprueba sobre el CÓDIGO, o el
 *  comentario que la explica la hace pasar sola (la lección de v4.991). */
const codigo = (p) => lee(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── 1. El catálogo ──────────────────────────────────────────────────
section('1. El catálogo de fuentes es CERRADO y declara lo que no está');
ok('la Feria está disponible', spec.COLLECTION_SOURCES.project_fair.available === true);
ok('el registro de asistentes está DECLARADO y no disponible',
    spec.COLLECTION_SOURCES.event_registration.available === false);
ok('y dice POR QUÉ no lo está',
    String(spec.COLLECTION_SOURCES.event_registration.reason || '').length > 40,
    'un `available:false` sin motivo obliga a ir a buscarlo al código');
eq('sólo la Feria se puede trasladar hoy', spec.availableSources(), ['project_fair']);
ok('un tipo que nadie declaró no es de ninguna fuente', spec.sourceOf({ type: 'lo_que_sea' }) === null);
ok('un pago sin tipo tampoco', spec.sourceOf({}) === null);
ok('el tipo se compara EXACTO, no por parecido',
    spec.sourceOf({ type: 'project_fair_registration_v2' }) === null,
    'un `includes` clasificaría mal una fuente nueva cuyo nombre contenga a otra');

// ── 2. El rótulo ────────────────────────────────────────────────────
section('2. Un cobro se nombra por lo que es');
eq('inscripción con referencia y club',
    spec.collectionLabel({ type: 'project_fair_registration', publicRef: 'FP-WZ2W3J', clubName: 'Rotary Barranquilla' })?.name,
    'Inscripción FP-WZ2W3J · Rotary Barranquilla');
eq('sin club, la referencia sola',
    spec.collectionLabel({ type: 'project_fair_registration', publicRef: 'FP-1' })?.name, 'Inscripción FP-1');
ok('un aporte normal no tiene rótulo de fuente', spec.collectionLabel({ campaignName: 'Terremoto' }) === null);

section('2b. Y ese rótulo llega a la ficha, al correo y al documento');
eq('la Bóveda lo pinta en la traza del movimiento',
    trace.originOf({ type: 'project_fair_registration', publicRef: 'FP-1', clubName: 'Club X' })?.label,
    'Inscripción FP-1 · Club X');
eq('el correo del traslado lo usa en vez de «Aportante sin nombre»',
    lote.donorLine({ sourceLabel: 'Inscripción FP-1 · Club X' }).name, 'Inscripción FP-1 · Club X');
eq('pero quien donó MANDA sobre el rótulo de la fuente',
    lote.donorLine({ donorName: 'Ana', sourceLabel: 'Inscripción FP-1' }).name, 'Ana');
eq('y un aporte anónimo sigue siendo anónimo',
    lote.donorLine({ isAnonymous: true, sourceLabel: 'Inscripción FP-1' }).name, 'Aportante anónimo');
eq('sin nada que decir, el respaldo de siempre — no se inventa un nombre',
    lote.donorLine({}).name, 'Aportante sin nombre');

// ── 3. La cascada del sitio ─────────────────────────────────────────
section('3. El sitio se RESUELVE y se dice de qué señal salió');
eq('lo que declaró la Convocatoria manda',
    spec.resolveCollectionSite({ configuredClubId: 'club-feria', editionClubId: 'club-edicion' }),
    { clubId: 'club-feria', signal: 'convocatoria', help: null });
eq('sin eso, el sitio del evento de la edición',
    spec.resolveCollectionSite({ editionClubId: 'club-edicion' }),
    { clubId: 'club-edicion', signal: 'edicion', help: null });
ok('sin ninguna señal NO se adivina, y se dice la salida',
    spec.resolveCollectionSite({}).clubId === null
    && String(spec.resolveCollectionSite({}).help || '').length > 40);
ok('el orden es el declarado y no se deduce', JSON.stringify(spec.SITE_SIGNALS) === '["convocatoria","edicion"]');
ok('una cadena vacía no cuenta como señal',
    spec.resolveCollectionSite({ configuredClubId: '  ', editionClubId: 'club-edicion' }).signal === 'edicion');

// ── 4. El reparto ───────────────────────────────────────────────────
section('4. El reparto de lo cobrado — y ninguna rama inventa una tarifa');
const conDesglose = spec.splitCollectionAmounts({
    total: 262500, currency: 'COP',
    surcharge: { amount: 12500, lines: { gateway: 7250, transfer: 5250 }, chargeCop: 262500 },
});
ok('con desglose, la base es MEDIDA', conDesglose.basis === 'medido');
eq('la retención de la plataforma es la línea de traslado', conDesglose.applicationFee, 5250);
eq('el neto es el precio publicado', conDesglose.netAmount, 250000);
ok('bruto = neto + las dos retenciones',
    conDesglose.netAmount + conDesglose.applicationFee + conDesglose.processorFee === 262500);

const derivado = spec.splitCollectionAmounts({
    total: 262500, currency: 'COP', surcharge: null,
    publishedAmount: 250000, publishedCurrency: 'COP',
});
ok('sin desglose, el neto sale del precio publicado y se DECLARA derivado', derivado.basis === 'derivado');
eq('y ese neto es el precio congelado', derivado.netAmount, 250000);
ok('⚠️ la retención de la plataforma NO se deriva: se dice que no se sabe',
    derivado.applicationFee === null,
    'un cero afirmaría que no retuvimos nada, que es otra cosa');
ok('y el aviso lo dice', (derivado.avisos || []).length > 0);

const otraMoneda = spec.splitCollectionAmounts({
    total: 65, currency: 'USD', surcharge: null,
    publishedAmount: 250000, publishedCurrency: 'COP',
});
ok('⚠️ con el precio en OTRA moneda no se reparte y se dice por qué',
    otraMoneda.ok === false && otraMoneda.motivo === 'sin_neto_determinable',
    'convertir con una tasa que acá no tenemos sería inventarla');
ok('un cobro sin importe tampoco se reparte',
    spec.splitCollectionAmounts({ total: 0, currency: 'COP' }).motivo === 'sin_importe');
ok('un precio publicado mayor que lo cobrado se ACOTA y se avisa',
    (() => {
        const r = spec.splitCollectionAmounts({ total: 100, currency: 'COP', publishedAmount: 250, publishedCurrency: 'COP' });
        return r.netAmount === 100 && r.avisos.length === 2;
    })());
ok('todo motivo tiene su frase en español',
    Object.keys(spec.REBUILD_REASONS).every(k => String(spec.REBUILD_REASONS[k]).length > 10));

// ── 5. La fila del movimiento ───────────────────────────────────────
section('5. La fila del movimiento — un solo constructor');
const inscripcion = {
    id: 'sub_1', publicRef: 'FP-WZ2W3J', clubName: 'Rotary Barranquilla', district: '4271',
    projectName: 'Milagro entre hilos', priceMode: 'COP', amountCop: 250000, amountUsd: null,
    amountReceived: 262500, chargeCurrency: 'COP', paidAt: '2026-09-01T10:00:00.000Z',
    stripePaymentIntentId: 'pi_1', stripeSessionId: 'cs_1',
    metadata: { payment: { surcharge: { amount: 12500, lines: { gateway: 7250, transfer: 5250 }, chargeCop: 262500 } } },
};
const draft = io.paymentDraftFor(inscripcion, { clubId: 'club-feria' });
ok('se construye', draft.ok === true, JSON.stringify(draft));
eq('la referencia es el payment intent', draft.row.providerRef, 'pi_1');
eq('el bruto es lo que de verdad entró', draft.row.amount, 262500);
eq('el neto es el precio publicado', draft.row.netAmount, 250000);
ok('es un cobro de la plataforma', draft.row.isPlatformCollection === true);
eq('y queda atado al sitio resuelto', draft.row.clubId, 'club-feria');
ok('el payload declara su tipo', draft.row.rawPayload.type === 'project_fair_registration');
ok('⚠️ y lleva a quién nombrar: sin esto el correo dice «Aportante sin nombre»',
    draft.row.rawPayload.clubName === 'Rotary Barranquilla' && draft.row.rawPayload.publicRef === 'FP-WZ2W3J');
ok('la base de la cifra queda escrita', draft.row.rawPayload.basis === 'medido');
ok('⚠️ NO se inventa ninguna fecha de liberación',
    !('availableOn' in draft.row) && !('clubAvailableOn' in draft.row),
    'una fecha estimada presentada como el calendario del proveedor es lo que la Bóveda no hace');

ok('sin sitio NO se construye una fila a medias',
    io.paymentDraftFor(inscripcion, { clubId: null }).motivo === 'sin_sitio');
ok('sin referencia del proveedor tampoco',
    io.paymentDraftFor({ ...inscripcion, stripePaymentIntentId: null, stripeSessionId: null }, { clubId: 'c' }).motivo === 'sin_referencia');
ok('sin moneda tampoco',
    io.paymentDraftFor({ ...inscripcion, chargeCurrency: null }, { clubId: 'c' }).motivo === 'sin_moneda');
eq('la sesión sirve de referencia cuando no hay intent',
    io.paymentDraftFor({ ...inscripcion, stripePaymentIntentId: null }, { clubId: 'c' }).row.providerRef, 'cs_1');

// ── 6. El camino, contra la base sustituida ─────────────────────────
section('6. El CAMINO — la reconstrucción hacia atrás');
const sembrar = () => {
    stub.reset();
    stub.tablas.CalendarEvent.push({ id: 'ev_1', clubId: 'club-feria' });
    stub.tablas.ProjectFairSubmission.push(
        { ...inscripcion, clubId: null, eventId: 'ev_1' },
        {
            ...inscripcion, id: 'sub_2', publicRef: 'FP-3X7TTE', clubName: 'Tuluá El Lago',
            stripePaymentIntentId: 'pi_2', amountReceived: 45123.75, amountCop: 42975,
            metadata: {}, clubId: null, eventId: 'ev_1',
        },
        // Una que todavía no pagó: no es candidata.
        { ...inscripcion, id: 'sub_3', publicRef: 'FP-NOPAGA', status: 'pending_payment', stripePaymentIntentId: 'pi_3', clubId: null, eventId: 'ev_1' },
    );
    for (const s of stub.tablas.ProjectFairSubmission) if (!s.status) s.status = 'paid';
    stub.tablas.ProjectFairSubmission[0].status = 'paid';
    stub.tablas.ProjectFairSubmission[1].status = 'paid';
};
sembrar();

const ensayo = await io.rebuildProjectFairPayments({ clubId: 'club-feria', apply: false });
eq('el ensayo mira las pagadas y deja fuera la que no pagó', ensayo.mirados, 2);
eq('y diría cuántas reconstruiría', ensayo.reconstruidos, 2);
ok('⚠️ EL ENSAYO NO ESCRIBE NADA', stub.tablas.Payment.length === 0,
    'mirar antes de tocar dinero es lo único que hace útil el ensayo');
ok('el neto se agrupa POR MONEDA y nunca se suma entre ellas',
    typeof ensayo.porMoneda === 'object' && !('total' in ensayo));
eq('el neto en pesos es la suma de los dos', ensayo.porMoneda.COP, 250000 + 42975);
ok('los ejemplos dicen de qué señal salió el sitio',
    ensayo.ejemplos.every(e => e.signal === 'edicion' && e.clubId === 'club-feria'));
ok('y de qué base salió cada cifra',
    ensayo.ejemplos.find(e => e.ref === 'FP-WZ2W3J').basis === 'medido'
    && ensayo.ejemplos.find(e => e.ref === 'FP-3X7TTE').basis === 'derivado');
ok('lo derivado se AVISA', Object.keys(ensayo.avisos).length === 1);

const aplicado = await io.rebuildProjectFairPayments({ clubId: 'club-feria', apply: true });
eq('al aplicar se escriben los dos movimientos', stub.tablas.Payment.length, 2);
eq('reconstruidos', aplicado.reconstruidos, 2);
ok('con el sitio resuelto por la edición',
    stub.tablas.Payment.every(p => p.clubId === 'club-feria'));
ok('y marcados como cobro de la plataforma: es lo que la Bóveda mira',
    stub.tablas.Payment.every(p => p.isPlatformCollection === true));

section('6b. Correr la reconstrucción otra vez NO cuenta el dinero dos veces');
const segunda = await io.rebuildProjectFairPayments({ clubId: 'club-feria', apply: true });
eq('ya no hay candidatos: dejan de serlo solos', segunda.mirados, 0);
eq('y no se escribió ninguna fila más', stub.tablas.Payment.length, 2);

section('6b-bis. ⚠️ LA IDEMPOTENCIA ES DE LA BASE, no del filtro de la consulta');
// El `p.id IS NULL` de arriba impide que un cobro ya registrado VUELVA a ser
// candidato, y eso alcanza para una segunda pasada. Lo que NO cubre es la
// carrera: dos vueltas simultáneas —el cron y alguien pulsando el botón— leen
// los candidatos ANTES de que ninguna inserte, y las dos llegan al INSERT con
// el mismo cobro. Ahí lo único que lo detiene es el `ON CONFLICT`, y por eso se
// ejercita el punto que lo lleva. Comprobarlo sólo con el filtro sería
// apoyarse en la barrera equivocada — la lección de
// `Payment_provider_providerRef_key` (v4.841).
stub.reset();
const dosVueltas = io.paymentDraftFor(inscripcion, { clubId: 'club-feria' });
const primera = await io.insertPayment(dosVueltas);
const segundaCarrera = await io.insertPayment(dosVueltas);
ok('la primera vuelta escribe el movimiento', !!primera);
ok('⚠️ la segunda NO escribe nada: el mismo dinero no se cuenta dos veces',
    segundaCarrera === null && stub.tablas.Payment.length === 1,
    'un SELECT previo no protege de dos peticiones concurrentes');

section('6c. Un cobro sin sitio se REPORTA con su motivo, no se salta en silencio');
stub.reset();
stub.tablas.ProjectFairSubmission.push({ ...inscripcion, status: 'paid', clubId: null, eventId: null });
const huerfano = await io.rebuildProjectFairPayments({ apply: true });
eq('no se reconstruye', huerfano.reconstruidos, 0);
ok('y el motivo queda agrupado con su ejemplo',
    huerfano.noReconstruidos.sin_sitio?.total === 1
    && huerfano.noReconstruidos.sin_sitio.ejemplos[0] === 'FP-WZ2W3J');

section('6d. El sitio pedido acota la pasada — no se reconstruye lo de otro');
stub.reset();
stub.tablas.CalendarEvent.push({ id: 'ev_otro', clubId: 'club-ajeno' });
stub.tablas.ProjectFairSubmission.push({ ...inscripcion, status: 'paid', clubId: null, eventId: 'ev_otro' });
const ajeno = await io.rebuildProjectFairPayments({ clubId: 'club-feria', apply: true });
eq('el cobro de otro sitio no se toca', ajeno.reconstruidos, 0);
eq('y no se escribió nada', stub.tablas.Payment.length, 0);

// ── 7. Invariantes sobre los archivos ───────────────────────────────
section('7. Las invariantes que sólo se ven leyendo los archivos');
const ctrl = codigo('../server/controllers/projectFairController.js');
ok('⚠️ el cobro en vivo YA NO depende de que alguien pegue un id a mano',
    !/if \(submission\.clubId\) \{/.test(ctrl),
    'era `if (submission.clubId)` y ese valor lo llenaba un campo opcional que nadie llenaba');
ok('y resuelve el sitio con la cascada', /siteForSubmission\(/.test(ctrl));

const ioSrc = codigo('../server/lib/projectFairCollections.js');
ok('⚠️ HAY UN SOLO CONSTRUCTOR DE LA FILA',
    (ioSrc.match(/export const paymentDraftFor/g) || []).length === 1);
ok('y un solo repartidor de importes en todo el servidor',
    (() => {
        const specSrc = codigo('../server/lib/collectionSources.js');
        return (specSrc.match(/export const splitCollectionAmounts/g) || []).length === 1;
    })());
ok('⚠️ el camino en vivo NO reparte por su cuenta',
    !/enMonedaDelCobro/.test(ctrl),
    'la aritmética escrita dos veces se separa en silencio y lo que se separa es cuánto se le gira a alguien');

const traceSrc = codigo('../server/lib/paymentTrace.js');
ok('⚠️ un cobro que declara su fuente queda FUERA de la heurística',
    /sourceOf\(payload\)/.test(traceSrc),
    'por parecido de importe y fecha, una inscripción se le atribuiría a un donante que no la hizo');

const walletSrc = codigo('../src/pages/admin/WalletManagement.tsx');
ok('⚠️ un cobro sin aportante RECIBE casilla de selección',
    /movementOnly=\{m\}[\s\S]{0,400}onElegir=\{cambiarEleccion\}/.test(walletSrc),
    'sin `onElegir` la tarjeta no pinta casilla y ese dinero no se puede trasladar');
ok('y sus desembolsos llegan a la pantalla',
    /desembolsos=\{desembolsos\[m\.id\]/.test(walletSrc),
    'sin ellos la tarjeta ofrecería girar otra vez algo ya girado');

const finSrc = codigo('../server/controllers/financialController.js');
ok('el servidor manda los desembolsos de los huérfanos',
    /orphans\.map\(m => m\?\.id\)/.test(finSrc));

const routesSrc = codigo('../server/routes/financial.js');
ok('la reconstrucción tiene su ruta y va autenticada',
    /wallet\/rebuild-collections', authMiddleware, requireSiteAdmin/.test(routesSrc));

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} pasaron, ${fail} fallaron`);
process.exit(fail === 0 ? 0 : 1);
