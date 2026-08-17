#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// RECALCULAR LA RETENCIÓN.  npm run test:fee-recalc
// v4.861.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED.
//
// Los números son los REALES de los dos aportes reportados —Rodrigo, 50.000 COP
// y Melissa, US$ 10— no unos inventados para que la prueba pase. Es la misma
// exigencia que las pruebas del sismo en `test:contribution`.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { MOTIVOS, planPayment, planRecalc, registroDeCorreccion } from '../server/lib/feeRecalc.js';
import { mergeRules, DEFAULT_RULES } from '../server/lib/feeRules.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

const AHORA = new Date('2026-08-17T19:00:00Z');
const AL_2_1 = mergeRules({ platform: { percent: 0.021, fixed: 0 } });

// Los dos aportes del reporte, tal como los muestra la Bóveda.
const RODRIGO = {
    id: 'p-rodrigo', clubId: 'c-4281', status: 'succeeded', isPlatformCollection: true,
    amount: 50000, currency: 'COP', applicationFee: 2500, netAmount: 43871,
    clubAvailableOn: new Date('2026-08-24T00:00:00Z'), createdAt: new Date('2026-08-16T19:31:00Z'),
};
const MELISSA = {
    id: 'p-melissa', clubId: 'c-4281', status: 'succeeded', isPlatformCollection: true,
    amount: 10, currency: 'USD', applicationFee: 0.5, netAmount: 8.91,
    clubAvailableOn: new Date('2026-08-24T00:00:00Z'), createdAt: new Date('2026-08-16T23:29:00Z'),
};

// ── 1. Los dos aportes reportados ───────────────────────────────────
section('1. Los números reales del reporte');

const r = planPayment(RODRIGO, { rules: AL_2_1, ahora: AHORA });
ok('el aporte de Rodrigo se puede corregir', r.puede, r.motivo);
eq('la retención pasa de 2.500 a 1.050', [r.plataformaAntes, r.plataformaAhora], [2500, 1050]);
// ⚠️ LA COMISIÓN DEL PROCESADOR NO SE TOCA. Está MEDIDA contra el balance
// transaction de Stripe (USD 1,16 × TRM) y recalcularla sería inventar.
eq('la comisión de Stripe se conserva intacta', r.procesador, 3629);
eq('el neto sube de 43.871 a 45.321', [r.netoAntes, r.netoAhora], [43871, 45321]);
eq('y la cuenta cierra', r.bruto - r.procesador - r.plataformaAhora, r.netoAhora);
eq('lo que el club gana es lo que la plataforma deja de retener', r.diferencia, 1450);

const m = planPayment(MELISSA, { rules: AL_2_1, ahora: AHORA });
ok('el aporte de Melissa se puede corregir', m.puede, m.motivo);
eq('la retención pasa de 0,50 a 0,21', [m.plataformaAntes, m.plataformaAhora], [0.5, 0.21]);
eq('la comisión de Stripe se conserva', m.procesador, 0.59);
eq('el neto sube de 8,91 a 9,20', [m.netoAntes, m.netoAhora], [8.91, 9.20]);
eq('y la cuenta cierra', Math.round((m.bruto - m.procesador - m.plataformaAhora) * 100) / 100, m.netoAhora);

// ── 2. El límite ────────────────────────────────────────────────────
section('2. Sólo el dinero que es IMPOSIBLE que se haya girado');

// ⚠️ No hay vínculo por fila entre un `Payment` y el retiro que se lo llevó, así
// que «¿ya se retiró?» no se puede contestar. Lo que sí se puede DEMOSTRAR es
// que si todavía no está disponible, no puede haber salido.
const retirable = planPayment(
    { ...RODRIGO, clubAvailableOn: new Date('2026-08-10T00:00:00Z') },
    { rules: AL_2_1, ahora: AHORA }
);
ok('un aporte YA retirable se rechaza', !retirable.puede);
eq('y dice por qué', retirable.motivo, 'ya_retirable');

const sinFecha = planPayment({ ...RODRIGO, clubAvailableOn: null }, { rules: AL_2_1, ahora: AHORA });
ok('sin fecha de disponibilidad NO se toca', !sinFecha.puede);
eq('ante la duda no se corrige', sinFecha.motivo, 'sin_fecha');

const pendiente = planPayment({ ...RODRIGO, status: 'pending' }, { rules: AL_2_1, ahora: AHORA });
eq('un cobro no acreditado se rechaza', pendiente.motivo, 'no_cobrado');

const ajena = planPayment({ ...RODRIGO, isPlatformCollection: false }, { rules: AL_2_1, ahora: AHORA });
eq('lo que no recauda la plataforma no tiene retención nuestra', ajena.motivo, 'ajena');

// Todo motivo tiene su texto: un descarte sin motivo obliga a adivinar.
ok('todo motivo está redactado',
    ['ya_retirable', 'sin_fecha', 'no_cobrado', 'sin_importe', 'sin_cambio', 'ajena']
        .every(k => typeof MOTIVOS[k] === 'string' && MOTIVOS[k].length > 20));

// ── 3. Es idempotente ───────────────────────────────────────────────
section('3. Correr dos veces no cambia nada la segunda');

const yaCorregido = { ...RODRIGO, applicationFee: 1050, netAmount: 45321 };
const segunda = planPayment(yaCorregido, { rules: AL_2_1, ahora: AHORA });
ok('un aporte ya corregido no se vuelve a tocar', !segunda.puede);
eq('y se dice que ya coincide', segunda.motivo, 'sin_cambio');

// Con la tarifa de siempre, nada cambia — que es lo que tiene que pasar si
// alguien lo corre sin haber cambiado la tarifa.
const conLaDeSiempre = planPayment(RODRIGO, { rules: DEFAULT_RULES, ahora: AHORA });
eq('con el 5 % de siempre no hay nada que corregir', conLaDeSiempre.motivo, 'sin_cambio');

// ── 4. La tanda ─────────────────────────────────────────────────────
section('4. El plan de una tanda');

const plan = planRecalc(
    [RODRIGO, MELISSA, { ...RODRIGO, id: 'p-viejo', clubAvailableOn: new Date('2026-08-01T00:00:00Z') }],
    { rules: AL_2_1, ahora: AHORA }
);
eq('se corrigen dos de tres', plan.aplicables.length, 2);
eq('y el descartado se REPORTA con su motivo', plan.descartados[0].motivo, 'ya_retirable');
ok('con un ejemplo para poder mirarlo', plan.descartados[0].ejemplos.includes('p-viejo'));

// ⚠️ LOS TOTALES SON POR MONEDA. Nunca una cifra que sume COP con USD — la
// regla del módulo desde v4.841, y acá el error sería sobre una corrección.
eq('los totales van por moneda', Object.keys(plan.porMoneda).sort(), ['COP', 'USD']);
eq('los pesos por su lado', plan.porMoneda.COP.diferencia, 1450);
eq('y los dólares por el suyo', plan.porMoneda.USD.diferencia, 0.29);
ok('ninguna clave cruza monedas', !('total' in plan.porMoneda));

// ── 5. La traza ─────────────────────────────────────────────────────
section('5. La corrección queda registrada');

const reg = registroDeCorreccion(r, { por: 'admin@rotary.org', cuando: AHORA, motivo: 'la tarifa bajó a 2,1 %' });
eq('guarda el valor ANTERIOR', reg.platformFrom, 2500);
eq('y el nuevo', reg.platformTo, 1050);
eq('el neto anterior y el nuevo', [reg.netFrom, reg.netTo], [43871, 45321]);
ok('quién la hizo', reg.by === 'admin@rotary.org');
ok('cuándo', typeof reg.at === 'string' && reg.at.startsWith('2026-08-17'));
ok('con qué regla', /2\.1 %/.test(reg.rule), reg.rule);
ok('y por qué', /2,1/.test(reg.reason));

// ── 6. Sobre los archivos ───────────────────────────────────────────
section('6. Lo que no se ve mirando una pantalla');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const spec = read('server/lib/feeRecalc.js');
const ctrl = read('server/controllers/payoutController.js');
const rutas = read('server/routes/payouts.js');

ok('el criterio es puro: no importa la base ni la red',
    !/from '\.\/(db|prisma)\.js'/.test(spec) && !/\bfetch\(/.test(spec));

// ⚠️ LA REGLA DE v4.854 SIGUE EN PIE. Sincronizar NO puede recalcular: un
// cálculo que se dispara como efecto secundario de otra operación es lo que
// reescribe la contabilidad sin que nadie lo decida. Esta versión agrega una
// vía DELIBERADA; no afloja aquélla.
ok('el sync sigue SIN recalcular la retención',
    /Number\.isFinite\(Number\(payment\.applicationFee\)\)/.test(read('server/controllers/financialController.js')));

// De ENSAYO salvo que se pida aplicar, como el backfill del libro mayor.
ok('no escribe nada sin `apply: true`', /const aplicar = req\.body\?\.apply === true/.test(ctrl));
ok('y lo dice en la respuesta del ensayo', /Nada se escribió/.test(ctrl));

// El límite va en el WHERE, no después: un aporte ya retirable ni se mira.
ok('el límite se aplica EN LA CONSULTA', /"clubAvailableOn" > \$1/.test(ctrl));
// Y otra vez al escribir: entre leer y escribir puede pasar el tiempo.
ok('y otra vez en el UPDATE, con candado sobre la retención anterior',
    /WHERE id = \$1 AND "applicationFee" = \$5 AND "clubAvailableOn" > \$6/.test(ctrl));

ok('es del operador de la plataforma',
    /router\.post\('\/admin\/fee-rules\/recalculate', roleMiddleware\(superAdminRoles\)/.test(rutas));

// ── Resultado ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('La corrección es deliberada, acotada y queda registrada.');
