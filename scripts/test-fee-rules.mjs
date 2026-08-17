#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LAS REGLAS DE COMISIÓN.  npm run test:fee-rules
// v4.854.0 — Fase 2 del rediseño de la Bóveda
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro y vive aparte de la
// orquestación, como el resto de este módulo.
//
// Lo que protegen sobre todo son dos cosas que no se ven mirando una pantalla:
// que DESPLEGAR ESTO NO CAMBIE NINGUNA CIFRA, y que cambiar la tarifa mañana no
// reescriba lo que se cobró ayer.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    FEE_RULES_KEY, DEFAULT_RULES, SCOPES,
    resolveRate, computeFee, platformFee, estimatedProcessorFee, breakdown,
    validateRules, mergeRules, parseRules, describeRate,
} from '../server/lib/feeRules.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 1. Desplegar esto no cambia ninguna cifra ───────────────────────
section('1. Sin configurar nada, todo sale EXACTAMENTE como antes');

// Es la comprobación que autoriza el despliegue. El 5 % estaba escrito a mano
// en cinco sitios; si el valor por defecto no lo reprodujera, la primera
// donación tras el despliegue retendría otra cantidad.
eq('la plataforma retiene el 5 %', DEFAULT_RULES.platform.percent, 0.05);
eq('sin componente fijo', DEFAULT_RULES.platform.fixed, 0);
eq('el estimado del procesador sigue siendo 2,9 % + 0,30',
    [DEFAULT_RULES.processor.percent, DEFAULT_RULES.processor.fixed], [0.029, 0.30]);

// El caso real: un aporte de 50.000 pesos.
eq('50.000 COP retienen 2.500 de plataforma', platformFee(50000, { currency: 'COP' }), 2500);
// Y uno de 10 dólares.
eq('10 USD retienen 0,50', platformFee(10, { currency: 'USD' }), 0.5);

// El estimado, con la fórmula heredada tal cual.
eq('el estimado en dólares es el de siempre',
    estimatedProcessorFee(10, { currency: 'USD' }), Math.round((10 * 0.029 + 0.30) * 100) / 100);

// ── 2. El orden de la cascada ───────────────────────────────────────
section('2. Lo particular gana sobre lo general, nunca al revés');

const REGLAS = mergeRules({
    platform: {
        percent: 0.05,
        byCurrency: { COP: { percent: 0.04 } },
        bySite: { 'c-especial': { percent: 0.02 } },
    },
});

eq('sin nada configurado manda la general',
    resolveRate(REGLAS, { scope: 'platform', currency: 'USD' }).percent, 0.05);
eq('la tarifa de la MONEDA le gana a la general',
    resolveRate(REGLAS, { scope: 'platform', currency: 'COP' }).percent, 0.04);
eq('y el acuerdo del SITIO le gana a la de la moneda',
    resolveRate(REGLAS, { scope: 'platform', currency: 'COP', clubId: 'c-especial' }).percent, 0.02);

// ⚠️ De dónde salió cada mitad: sin esto, «¿por qué a este club se le retuvo el
// 2 %?» no se puede contestar dos semanas después.
eq('se dice de dónde salió cada mitad',
    resolveRate(REGLAS, { scope: 'platform', currency: 'COP', clubId: 'c-especial' }).source,
    { percent: 'sitio', fixed: 'general' });

// ⚠️ CERO ES UNA TARIFA VÁLIDA. Con `||` en vez de una comprobación de
// null, un club exento se leería como «no configurado» y volvería a pagar el
// 5 % — el mismo error que `feedRunAt` o que `blockAmountsApply`.
const CON_EXENCION = mergeRules({ platform: { bySite: { 'c-exento': { percent: 0 } } } });
eq('un club EXENTO retiene cero, no el 5 % por omisión',
    platformFee(50000, { rules: CON_EXENCION, currency: 'COP', clubId: 'c-exento' }), 0);

// ── 3. El redondeo ──────────────────────────────────────────────────
section('3. La comisión se redondea a la unidad de SU moneda');

// El peso no tiene centavos. Hasta v4.853 la comisión salía con decimales que
// la moneda no tiene: es el defecto de `roundMoney(8.915)` por la otra punta.
eq('en pesos no quedan decimales', platformFee(50001, { currency: 'COP' }), 2500);
eq('en dólares sí, dos', platformFee(10.33, { currency: 'USD' }), 0.52);

// Una tarifa fija mayor que el aporte daría un neto negativo.
const CARO = mergeRules({ platform: { fixed: 100 } });
eq('la comisión nunca supera el bruto',
    platformFee(10, { rules: CARO, currency: 'USD' }), 10);
eq('un bruto de cero no genera comisión', platformFee(0, { currency: 'USD' }), 0);
eq('ni uno negativo', platformFee(-5, { currency: 'USD' }), 0);

// ── 4. El desglose ──────────────────────────────────────────────────
section('4. El neto se DERIVA; nunca se recibe de fuera');

const d = breakdown(50000, { currency: 'COP' });
eq('bruto − plataforma − procesador = neto', d.neto, d.bruto - d.plataforma - d.procesador);
eq('sin dato real, la base es «estimada»', d.base, 'estimada');

// Con la comisión REAL de Stripe, el estimado no se usa.
const real = breakdown(50000, { currency: 'COP', processorFee: 1875 });
eq('con el dato real se usa ése', real.procesador, 1875);
eq('y se declara «medida»', real.base, 'medida');
eq('el neto se recalcula con él', real.neto, 50000 - 2500 - 1875);

// ⚠️ `0` es una comisión REAL posible —un cobro sin costo de procesamiento— y
// tiene que distinguirse de «no llegó el dato».
const cero = breakdown(50000, { currency: 'COP', processorFee: 0 });
eq('una comisión real de CERO se toma como medida', [cero.procesador, cero.base], [0, 'medida']);

// ── 5. Validar lo que llega del panel ───────────────────────────────
section('5. El operador escribe, el CÓDIGO decide');

// El error de dedo más probable y más caro: escribir «5» queriendo decir 5 %.
// Se RECHAZA en vez de interpretarse — adivinar acá es quedarse con el 500 %.
const cinco = validateRules({ platform: { percent: 5 } });
ok('«5» en vez de «0.05» se RECHAZA', cinco.errors.length > 0);
ok('y el error dice cómo se escribe', /tanto por uno/.test(cinco.errors[0]));

ok('una tarifa negativa se rechaza', validateRules({ platform: { percent: -0.1 } }).errors.length > 0);
ok('un texto que no es número se rechaza', validateRules({ platform: { percent: 'gratis' } }).errors.length > 0);

const bueno = validateRules({ platform: { percent: 0.03 } });
eq('una tarifa válida pasa', bueno.errors.length, 0);
eq('y se guarda', bueno.rules.platform.percent, 0.03);

// AVISOS, no errores: se puede guardar y hay que decirlo. Tratarlos igual
// convertiría cualquier aviso en un bloqueo y se dejarían de leer.
ok('el componente fijo en dólares sobre toda moneda se AVISA',
    validateRules({}).warnings.some(w => /dólares/i.test(w) && /TODAS las monedas/i.test(w)));
ok('pero no impide guardar', validateRules({}).errors.length === 0);
ok('una retención desproporcionada se avisa',
    validateRules({ platform: { percent: 0.9 } }).warnings.some(w => /90 %/.test(w)));

// El catálogo es CERRADO: una tercera retención que nadie sabe de dónde salió
// no se puede ni expresar.
const colado = validateRules({ platform: { percent: 0.05 }, oculta: { percent: 0.99 } });
ok('una regla inventada se descarta', !('oculta' in colado.rules));
eq('sólo existen las dos declaradas', SCOPES, ['platform', 'processor']);

// ── 6. Guardar a medias no deja la plataforma sin tarifa ────────────
section('6. Lo que no se tocó conserva su valor');

const parcial = mergeRules({ platform: { byCurrency: { COP: { percent: 0.04 } } } });
eq('la general sobrevive a un guardado parcial', parcial.platform.percent, 0.05);
eq('y el procesador entero también', parcial.processor.fixed, 0.30);
eq('lo configurado se aplica', parcial.platform.byCurrency.COP.percent, 0.04);

// ⚠️ ESTO CORRE EN EL CAMINO DEL COBRO: una configuración ilegible NO puede
// tumbar un pago. Degrada a la tarifa vigente, que es lo que había antes.
eq('un JSON roto degrada a la tarifa por defecto', parseRules('{no es json').platform.percent, 0.05);
eq('y una configuración vacía también', parseRules(null).platform.percent, 0.05);
eq('lo guardado se lee', parseRules(JSON.stringify({ platform: { percent: 0.03 } })).platform.percent, 0.03);

// Y no se contamina el objeto por defecto entre llamadas.
mergeRules({ platform: { percent: 0.01 } });
eq('mergeRules no muta DEFAULT_RULES', DEFAULT_RULES.platform.percent, 0.05);

// ── 7. Cómo se explica ──────────────────────────────────────────────
section('7. Un porcentaje suelto no dice si además hay un fijo');

eq('sin fijo, sólo el porcentaje', describeRate({ percent: 0.05, fixed: 0, currency: 'COP' }), '5 %');
eq('con fijo, los dos y su moneda',
    describeRate({ percent: 0.029, fixed: 0.30, currency: 'USD' }), '2.9 % + 0.30 USD');
eq('el fijo se escribe con los decimales de SU moneda',
    describeRate({ percent: 0.029, fixed: 1200, currency: 'COP' }), '2.9 % + 1200 COP');

// ── 8. Sobre los archivos ───────────────────────────────────────────
section('8. Lo que no se ve mirando una pantalla');

const spec = read('server/lib/feeRules.js');
const store = read('server/lib/feeRulesStore.js');
const pagos = read('server/controllers/paymentController.js');
const fin = read('server/controllers/financialController.js');
const rutas = read('server/routes/payouts.js');

ok('el criterio es puro: no importa la base ni la red',
    !/from '\.\/(db|prisma)\.js'/.test(spec) && !/\bfetch\(/.test(spec));

// ⚠️ NINGUNA COPIA SUELTA. Es el defecto que esta versión corrige: cinco copias
// de una tarifa es cómo se llega a que dos caminos de cobro retengan cantidades
// distintas por el mismo concepto. Se busca la EXPRESIÓN, no la mención: los
// comentarios que explican de dónde se viene tienen que poder nombrarla.
const sinComentarios = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

for (const [nombre, src] of [['paymentController', pagos], ['financialController', fin]]) {
    const limpio = sinComentarios(src);
    ok(`${nombre}: ya no declara el porcentaje a mano`,
        !/PLATFORM_FEE_PERCENTAGE\s*=\s*0?\.\d/.test(limpio));
    ok(`${nombre}: ya no calcula el estimado de Stripe a mano`,
        !/\*\s*0\.029/.test(limpio));
    ok(`${nombre}: usa el criterio compartido`,
        /from '\.\.\/lib\/feeRules\.js'/.test(src));
}

// ⚠️ LA REGLA MÁS IMPORTANTE DE ESTA VERSIÓN. Sincronizar un aporte de marzo no
// puede aplicarle la tarifa de abril. Antes se recalculaba y no se notaba
// porque la tarifa era una constante; desde que se puede cambiar, recalcular
// sería reescribir la historia financiera de un cobro que ya ocurrió.
ok('el sync usa la retención GUARDADA, no la que regiría hoy',
    /Number\.isFinite\(Number\(payment\.applicationFee\)\)/.test(fin));
ok('y sólo calcula cuando falta',
    /\?\s*Number\(payment\.applicationFee\)\s*:\s*platformFee\(/.test(fin));

// La tarifa es de la infraestructura compartida, no de una organización.
ok('las reglas son del operador de la plataforma',
    /router\.get\('\/admin\/fee-rules', roleMiddleware\(superAdminRoles\)/.test(rutas)
    && /router\.put\('\/admin\/fee-rules', roleMiddleware\(superAdminRoles\)/.test(rutas));

// Esto corre por cada cobro: sin caché, cada aporte pagaría un viaje a la base
// para leer un número que cambia una vez al año.
ok('la lectura va cacheada', /TTL_MS/.test(store));
ok('y toda escritura la invalida', /invalidateFeeRules\(\);/.test(store));
ok('leer las reglas nunca lanza', /catch \(e\)[\s\S]{0,200}cache = DEFAULT_RULES/.test(store));

// Guardar en `PlatformConfig` es lo que la hace configurable sin desplegar, y
// evita una columna nueva en un modelo de Prisma — el riesgo de `logo_intl`.
eq('vive en PlatformConfig', FEE_RULES_KEY, 'financial_fee_rules');
ok('no se agregó ninguna columna a Payment',
    !/applicationFeeRate|feeRuleId/.test(read('server/prisma/schema.prisma')));

// ── Resultado ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('La tarifa vive en un solo sitio y no reescribe la historia.');
