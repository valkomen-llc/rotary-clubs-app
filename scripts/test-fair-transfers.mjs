#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Trasladar el dinero de unas postulaciones.  npm run test:fair:transfers
// v4.1026.0
//
// Dos mitades y las dos hacen falta:
//
//   · EL CRITERIO — puro: qué inscripción se puede trasladar, cuál no y con
//     qué salida; contra qué sitio se registra; y el plan de la selección.
//   · LAS INVARIANTES — leídas de los archivos: que este módulo no escriba,
//     que la resolución no escriba, y que la pantalla monte LA MISMA barra de
//     la Bóveda en vez de una copia. Eso no lo ve ninguna prueba de criterio:
//     el código seguiría siendo válido y el fallo sería mudo — las dos
//     pantallas registrarían un desembolso y sólo una llevaría lo que se
//     corrija después.
//
// **No necesita Postgres, credenciales ni red.**
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const T = await import('../server/lib/projectFairTransfers.js');
const { collectionLabel } = await import('../server/lib/collectionSources.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const lee = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
/** El archivo SIN comentarios: el que explica una regla puede nombrar lo que la
 *  regla prohíbe, y una comprobación sobre el texto crudo fallaría contra su
 *  propia documentación (la lección de v4.991). */
const codigo = (p) => lee(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PAGADA = { id: 's1', status: 'paid', publicRef: 'FP-WZ2W3J', clubName: 'Barranquilla' };
const PAGO = { id: 'pay1', clubId: 'club-feria', currency: 'USD', netAmount: 94.7 };
const SALDO = { restante: 94.7, completo: false };
const PERMISO = { ok: true, motivo: null, aviso: null };
const SITIO = 'club-feria';

// ── 1. El catálogo de bloqueos ───────────────────────────────────────
section('1. Los bloqueos y su salida');
{
    ok('el catálogo es cerrado', T.BLOCK_IDS.length === 5);
    // ⚠️ Cada bloqueo lleva su salida: uno cuya única respuesta es «no se
    // puede» se lee como una avería (v4.1008).
    const sinSalida = T.BLOCK_IDS.filter(id => !T.TRANSFER_BLOCKS[id].salida);
    eq('todos dicen qué hacer', sinSalida, []);
    ok('el que manda a la Bóveda lo dice', T.TRANSFER_BLOCKS.sin_movimiento.donde === 'boveda');
    ok('`no_disponible` no trae motivo propio', T.TRANSFER_BLOCKS.no_disponible.motivo === null);
    // Un id inventado no se puede rotular ni contar.
    ok('un bloqueo desconocido devuelve null', T.describeBlock('inventado') === null);
    ok('el motivo específico gana al del catálogo',
        T.describeBlock('no_disponible', 'Lo libera en 3 día(s).').motivo === 'Lo libera en 3 día(s).');
    ok('sin motivo específico, el del catálogo',
        T.describeBlock('sin_cobro').motivo === T.TRANSFER_BLOCKS.sin_cobro.motivo);
}

// ── 2. El rótulo ─────────────────────────────────────────────────────
section('2. Cómo se nombra una inscripción');
{
    const desdeSubmission = T.submissionLabel(PAGADA);
    // ⚠️ EL MISMO NOMBRE QUE EL CORREO DEL TRASLADO. Con dos formatos, quien
    // confirma el giro y quien recibe el comprobante leerían dos rótulos para
    // la misma fila y no habría forma de cruzarlos.
    const desdePago = collectionLabel({
        type: 'project_fair_registration', publicRef: 'FP-WZ2W3J', clubName: 'Barranquilla',
    })?.name;
    eq('el rótulo es el del correo', desdeSubmission, desdePago);
    eq('con la forma pedida', desdeSubmission, 'Inscripción FP-WZ2W3J · Barranquilla');
    eq('sin club, sólo la referencia', T.submissionLabel({ publicRef: 'FP-1' }), 'Inscripción FP-1');
}

// ── 3. Una postulación ───────────────────────────────────────────────
section('3. Qué se puede trasladar y qué no');
{
    const elegible = T.transferItem({ submission: PAGADA, payment: PAGO, balance: SALDO, permission: PERMISO, siteClubId: SITIO });
    ok('la pagada con movimiento disponible entra', !!elegible.elegible);
    // ⚠️ LA FORMA EXACTA que consume la barra de la Bóveda: es lo que hace que
    // la barra sea la misma y no una copia con otro contrato.
    eq('con la forma que la barra consume',
        Object.keys(elegible.elegible).sort(),
        ['clase', 'currency', 'paymentId', 'restante', 'titulo']);
    eq('el id es el del PAGO, no el de la postulación', elegible.elegible.paymentId, 'pay1');
    eq('se gira lo que le FALTA', elegible.elegible.restante, 94.7);
    eq('la clase es `disponible`', elegible.elegible.clase, 'disponible');

    const sinPagar = T.transferItem({ submission: { ...PAGADA, status: 'pending' }, payment: PAGO, balance: SALDO, permission: PERMISO, siteClubId: SITIO });
    eq('sin el cobro confirmado se bloquea', sinPagar.bloqueo?.id, 'sin_cobro');

    // ⚠️ EL CASO QUE DE VERDAD VA A APARECER AL ESTRENAR ESTO: las
    // inscripciones cobradas antes de v4.1025 no tienen fila de `Payment`
    // hasta que alguien corra la reconstrucción. Sin este bloqueo con su
    // salida, el módulo entero se vería como «no funciona».
    const sinMovimiento = T.transferItem({ submission: PAGADA, payment: null, balance: null, permission: null, siteClubId: SITIO });
    eq('pagada y sin movimiento manda a la Bóveda', sinMovimiento.bloqueo?.id, 'sin_movimiento');
    ok('y dice dónde resolverlo', sinMovimiento.bloqueo?.donde === 'boveda' && /Buscar cobros sin registrar/.test(sinMovimiento.bloqueo?.salida));

    const ajeno = T.transferItem({ submission: PAGADA, payment: { ...PAGO, clubId: 'otro' }, balance: SALDO, permission: PERMISO, siteClubId: SITIO });
    eq('un movimiento de otro sitio se bloquea', ajeno.bloqueo?.id, 'otro_sitio');
    const sinSitio = T.transferItem({ submission: PAGADA, payment: { ...PAGO, clubId: null }, balance: SALDO, permission: PERMISO, siteClubId: SITIO });
    eq('un movimiento sin sitio también', sinSitio.bloqueo?.id, 'otro_sitio');

    const retenido = T.transferItem({
        submission: PAGADA, payment: PAGO, balance: SALDO, siteClubId: SITIO,
        permission: { ok: false, motivo: 'El proveedor todavía retiene este dinero: lo libera en 3 día(s).' },
    });
    eq('lo que el proveedor retiene se bloquea', retenido.bloqueo?.id, 'no_disponible');
    // El motivo de `canDisburse` viaja TEXTUAL: ya trae su causa y sus días, y
    // repetirlo acá daría dos textos para el mismo hecho.
    ok('con el motivo de `canDisburse`, no uno genérico', /3 día\(s\)/.test(retenido.bloqueo?.motivo));

    const completo = T.transferItem({ submission: PAGADA, payment: PAGO, balance: { restante: 0, completo: true }, permission: PERMISO, siteClubId: SITIO });
    eq('lo ya trasladado se bloquea', completo.bloqueo?.id, 'ya_trasladado');
    const restanteCero = T.transferItem({ submission: PAGADA, payment: PAGO, balance: { restante: 0, completo: false }, permission: PERMISO, siteClubId: SITIO });
    eq('y un restante en cero, también', restanteCero.bloqueo?.id, 'ya_trasladado');

    // ⚠️ EL AVISO NO BLOQUEA Y SE DICE. Un cobro reconstruido nace sin fecha de
    // liberación del proveedor: su estado es una suposición prudente, no un
    // dato, y quien registra el giro tiene que saberlo.
    const conAviso = T.transferItem({
        submission: PAGADA, payment: PAGO, balance: SALDO, siteClubId: SITIO,
        permission: { ok: true, motivo: null, aviso: 'Comprobá en tu banco que el dinero salió.' },
    });
    ok('un aviso no bloquea', !!conAviso.elegible);
    ok('y viaja', /banco/.test(conAviso.aviso));

    ok('el bloqueado se nombra igual que el elegible', sinMovimiento.titulo === elegible.titulo);
}

// ── 4. El sitio del traslado ─────────────────────────────────────────
section('4. Contra qué sitio se registra');
{
    const pagos = [{ clubId: 'a' }, { clubId: 'b' }, { clubId: 'b' }];
    // ⚠️ PARA UN ADMINISTRADOR DE SITIO ES SIEMPRE EL SUYO: `clubDe` en el
    // registro ignora el `clubId` del cuerpo para todo el que no sea el
    // operador, así que elegir otro daría una barra que promete un traslado y
    // recibe «no existe en este sitio».
    eq('un administrador de sitio registra contra el suyo',
        T.pickTransferSite(pagos, { sessionClubId: 'mio', isOperator: false }), 'mio');
    eq('el operador toma el que reúne más cobros',
        T.pickTransferSite(pagos, { sessionClubId: 'mio', isOperator: true }), 'b');
    // Estable: si dependiera del orden en que la base devolvió las filas, la
    // misma selección se registraría contra sitios distintos en dos intentos.
    eq('el desempate es estable',
        T.pickTransferSite([{ clubId: 'z' }, { clubId: 'a' }], { sessionClubId: null, isOperator: true }), 'a');
    eq('el desempate no depende del orden',
        T.pickTransferSite([{ clubId: 'a' }, { clubId: 'z' }], { sessionClubId: null, isOperator: true }), 'a');
    eq('sin cobros, el de la sesión',
        T.pickTransferSite([], { sessionClubId: 'mio', isOperator: true }), 'mio');
}

// ── 5. El plan ───────────────────────────────────────────────────────
section('5. El plan de la selección');
{
    const items = [
        T.transferItem({ submission: PAGADA, payment: PAGO, balance: SALDO, permission: PERMISO, siteClubId: SITIO }),
        T.transferItem({ submission: { ...PAGADA, id: 's2', publicRef: 'FP-2' }, payment: { ...PAGO, id: 'pay2', currency: 'COP', netAmount: 250000 }, balance: { restante: 250000, completo: false }, permission: PERMISO, siteClubId: SITIO }),
        T.transferItem({ submission: { ...PAGADA, id: 's3', publicRef: 'FP-3' }, payment: null, permission: null, siteClubId: SITIO }),
        T.transferItem({ submission: { ...PAGADA, id: 's4', publicRef: 'FP-4' }, payment: null, permission: null, siteClubId: SITIO }),
    ];
    const plan = T.planTransfers(items);
    eq('cuenta lo elegido', plan.elegidos, 4);
    eq('separa lo que entra', plan.elegibles.length, 2);
    eq('y lo que queda fuera', plan.bloqueados.length, 2);
    // ⚠️ LOS TOTALES SON POR MONEDA Y NUNCA SE SUMAN ENTRE ELLAS: es la regla
    // del módulo financiero desde v4.841, y acá la selección mezcla de verdad.
    eq('los totales van por moneda', plan.porMoneda, { USD: 94.7, COP: 250000 });
    ok('no hay ningún total único', !('total' in plan) && !('totalGeneral' in plan));
    eq('los motivos se agrupan', plan.motivos.length, 1);
    eq('con su recuento', plan.motivos[0].cuantos, 2);
    ok('y con ejemplos', plan.motivos[0].ejemplos.length === 2);

    const frase = T.describeTransferPlan(plan);
    ok('la frase dice el hecho', /2 inscripciones/.test(frase) && /USD/.test(frase) && /2 queda/.test(frase), frase);
    ok('sin nada que trasladar lo dice', /no se puede trasladar/.test(T.describeTransferPlan(T.planTransfers([items[2]]))));

    // Un aviso repetido se dice UNA vez: tres renglones idénticos son ruido.
    const conAvisos = T.planTransfers([
        { elegible: { paymentId: 'a', restante: 1, currency: 'USD', titulo: 'a', clase: 'disponible' }, aviso: 'mismo' },
        { elegible: { paymentId: 'b', restante: 1, currency: 'USD', titulo: 'b', clase: 'disponible' }, aviso: 'mismo' },
    ]);
    eq('los avisos no se repiten', conAvisos.avisos, ['mismo']);
}

// ── 6. Lo que ninguna prueba de criterio ve ──────────────────────────
section('6. Un solo motor de desembolsos');
{
    const criterio = codigo('../server/lib/projectFairTransfers.js');
    const controlador = codigo('../server/controllers/projectFairAdminController.js');
    const pantalla = codigo('../src/pages/admin/PostulacionesPagos.tsx');

    // ⚠️ ESTE MÓDULO RESUELVE Y NO REGISTRA.
    ok('el criterio no escribe en la base', !/INSERT|UPDATE\s|DELETE\s/i.test(criterio));

    // La resolución es LECTURA. Se mira el cuerpo del manejador, no el archivo
    // entero: el controlador tiene decenas de escrituras legítimas.
    const cuerpo = controlador.slice(controlador.indexOf('export const resolveTransfers'));
    ok('la resolución existe', cuerpo.length > 0);
    ok('y no escribe nada', !/INSERT INTO|UPDATE "|DELETE FROM/i.test(cuerpo), 'resolveTransfers escribe');

    // ⚠️ LA PANTALLA MONTA LA MISMA BARRA. Con un segundo formulario, el día
    // que se agregue un campo al desembolso una de las dos se queda sin él.
    ok('Postulaciones importa la barra de la Bóveda',
        /from '\.\.\/\.\.\/components\/admin\/wallet\/BulkDisbursementBar'/.test(pantalla));
    ok('y la monta', /<BulkDisbursementBar/.test(pantalla));
    // Y NO llama por su cuenta al endpoint que registra: eso lo hace la barra.
    ok('no hay un segundo camino al registro',
        !/disbursements\/bulk/.test(pantalla), 'la pantalla llama al registro por su cuenta');

    // Un solo compositor del nombre de un cobro.
    const fuentes = codigo('../server/lib/collectionSources.js');
    eq('hay UN compositor del nombre',
        (fuentes.match(/export const composeCollectionName/g) || []).length, 1);
    ok('y el criterio del traslado lo importa',
        /composeCollectionName/.test(criterio) && !/itemLabel/.test(criterio));

    // La ruta literal va ANTES de las paramétricas (`check:routes` lo comprueba
    // en general; acá se fija que exista y que sea POST).
    const rutas = codigo('../server/routes/project-fair.js');
    ok('la ruta está declarada',
        /router\.post\('\/admin\/postulaciones\/transfers\/resolve'/.test(rutas));
    ok('con el gate del módulo', /transfers\/resolve', authMiddleware, requireSiteAdmin/.test(rutas));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} comprobaciones, ${fail} fallos.`);
process.exit(fail === 0 ? 0 : 1);
