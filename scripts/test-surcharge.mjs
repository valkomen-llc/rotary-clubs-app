#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL RECARGO DE INSCRIPCIÓN.  npm run test:surcharge
// v4.980.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio es puro y vive aparte de la
// orquestación, como el resto de este sitio.
//
// Lo que protegen sobre todo son cuatro cosas que no se ven mirando una
// pantalla: que el recargo se SUME y no se descuente, que el desglose CUADRE
// con lo que se cobra, que el importe lo calcule el SERVIDOR y no el
// navegador, y que esto no toque la retención de los aportes.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    SURCHARGE_KEY, SURCHARGE_LINES, LINE_KEYS, SURCHARGE_FLOWS, FLOW_KEYS, DEFAULT_SURCHARGE,
    surchargeEnabled, resolveSurchargeRates, computeSurcharge, describeSurcharge,
    surchargeSummary, validateSurchargeConfig, mergeSurchargeConfig, parseSurchargeConfig,
} from '../server/lib/checkoutSurcharge.js';
import { DEFAULT_RULES, platformFee } from '../server/lib/feeRules.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const C = DEFAULT_SURCHARGE;
const q = (base, currency = 'COP', flow = 'project_fair', config = C) =>
    computeSurcharge(base, { config, currency, flow });

// ── 1. Lo que el cliente pidió, con sus números ──────────────────────
section('1. 2,9 % de pasarela + 2,1 % de traslado, sumados al valor');

eq('la pasarela cobra 2,9 %', C.lines.gateway.percent, 0.029);
eq('el traslado interbancario cobra 2,1 %', C.lines.transfer.percent, 0.021);
eq('sin componente fijo por defecto',
    [C.lines.gateway.fixed, C.lines.transfer.fixed], [0, 0]);

// El caso real de la Feria: 250.000 pesos.
const feria = q(250000);
eq('250.000 COP: pasarela 7.250', feria.lines.find(l => l.key === 'gateway').amount, 7250);
eq('250.000 COP: traslado 5.250', feria.lines.find(l => l.key === 'transfer').amount, 5250);
eq('250.000 COP: recargo 12.500', feria.surcharge, 12500);
eq('250.000 COP: total 262.500', feria.total, 262500);
eq('la tasa efectiva es el 5 %', Math.round(feria.percent * 10000) / 10000, 0.05);

// ⚠️ LA COMPROBACIÓN QUE DEFINE EL MÓDULO. En los aportes la comisión se
// DESCUENTA del receptor; acá se SUMA a quien paga. Si esto se invirtiera, la
// organización recibiría menos de lo que publicó.
ok('el total es MAYOR que el precio, no menor', feria.total > feria.base);
eq('el precio publicado no se toca', feria.base, 250000);

// ── 2. El desglose CUADRA con lo que se cobra ────────────────────────
section('2. Las líneas suman el total, en cualquier moneda');

// Es lo que hace legítimo enseñarle el desglose a quien paga: si el total se
// redondeara por su cuenta, las líneas no sumarían y un peso de diferencia se
// lee como un error del sistema.
let cuadran = true;
for (const moneda of ['COP', 'USD', 'EUR', 'JPY']) {
    for (const base of [1, 7, 133, 250, 12345, 250000, 999999, 0.5]) {
        const r = q(base, moneda);
        const suma = r.lines.reduce((a, l) => a + l.amount, 0);
        const redondeado = Math.round(suma * (moneda === 'COP' || moneda === 'JPY' ? 1 : 100))
            / (moneda === 'COP' || moneda === 'JPY' ? 1 : 100);
        if (redondeado !== r.surcharge || Math.abs(r.total - (r.base + r.surcharge)) > 1e-9) {
            cuadran = false;
            console.log(`    ✗ ${base} ${moneda}: líneas ${suma}, recargo ${r.surcharge}, total ${r.total}`);
        }
    }
}
ok('el recargo es la SUMA de las líneas y el total es base + recargo', cuadran);

// El peso no tiene decimales y el dólar sí: un redondeo único los escribiría mal.
eq('el peso se redondea sin decimales', q(133333, 'COP').surcharge, 6667);
eq('el dólar se redondea a dos', q(250, 'USD').surcharge, 12.5);

// ── 3. Una inscripción sin costo no lleva recargo ────────────────────
section('3. Cobrar una comisión sobre cero sería cobrar por nada');

eq('cero no genera recargo', q(0).surcharge, 0);
eq('y el total sigue siendo cero', q(0).total, 0);
eq('un importe negativo se acota en cero', q(-5000).total, 0);
eq('sin líneas que mostrar', q(0).lines.length, 0);

// Una línea en cero tampoco se pinta: un desglose lleno de ceros informa menos.
const soloPasarela = mergeSurchargeConfig({ lines: { transfer: { percent: 0 } } });
eq('una línea en cero no se pinta', q(100000, 'COP', 'project_fair', soloPasarela).lines.length, 1);

// ── 4. Dónde se aplica: catálogo CERRADO y por flujo ─────────────────
section('4. El flujo decide, y un flujo desconocido NO cobra');

eq('los dos flujos del pedido', FLOW_KEYS, ['project_fair', 'event_registration']);
ok('la Feria está encendida por defecto', surchargeEnabled(C, 'project_fair'));
ok('el evento está encendido por defecto', surchargeEnabled(C, 'event_registration'));

// ⚠️ Ante un flujo que nadie declaró, NO se cobra: equivocarse hacia el otro
// lado es cobrarle de más a alguien por un identificador mal escrito.
ok('un flujo desconocido no cobra', surchargeEnabled(C, 'inventado') === false);
eq('y su cotización sale en cero', q(250000, 'COP', 'inventado').surcharge, 0);

// Los APORTES no están en la lista, y su ausencia es deliberada: ahí la
// comisión se descuenta y la gobierna `feeRules.js`.
ok('los aportes NO son un flujo de este módulo',
    !FLOW_KEYS.includes('donation') && !FLOW_KEYS.includes('contribution'));

const apagado = mergeSurchargeConfig({ enabled: { project_fair: false } });
eq('apagado, se cobra el valor tal cual', q(250000, 'COP', 'project_fair', apagado).total, 250000);
ok('y el evento sigue encendido', surchargeEnabled(apagado, 'event_registration'));

// ── 5. Esto NO toca la retención de los aportes ──────────────────────
section('5. Dos configuraciones distintas, dos llaves distintas');

// ⚠️ Es lo que impide que cambiar una mueva la otra en silencio. Y con la
// retención por defecto en 5 %, heredarla habría cobrado ~7,9 % a cada
// inscrito sin que nadie lo decidiera.
ok('el recargo tiene su propia llave de PlatformConfig', SURCHARGE_KEY === 'checkout_surcharge');
ok('distinta de la de las tarifas', SURCHARGE_KEY !== 'financial_fee_rules');
eq('la retención de los aportes sigue en 5 %', DEFAULT_RULES.platform.percent, 0.05);
eq('y un aporte de 50.000 sigue reteniendo 2.500', platformFee(50000, { currency: 'COP' }), 2500);
ok('el recargo NO es el 5 % de la plataforma',
    C.lines.transfer.percent !== DEFAULT_RULES.platform.percent);

const spec = read('server/lib/checkoutSurcharge.js');
ok('el criterio del recargo no importa las tarifas de los aportes',
    !/from '\.\/feeRules\.js'/.test(spec));

// ── 6. El operador escribe, el CÓDIGO decide ─────────────────────────
section('6. Validación');

const malPct = validateSurchargeConfig({ lines: { gateway: { percent: 2.9 } } });
ok('«2.9» queriendo decir 2,9 % se RECHAZA', malPct.errors.length > 0);
ok('y el error dice cómo se escribe', /tanto por uno/.test(malPct.errors[0]));
// Adivinar acá es cobrarle a alguien el 290 % de su inscripción.
eq('no se interpreta: la tasa no cambia', malPct.config.lines.gateway.percent, 0.029);

ok('una tasa negativa se rechaza',
    validateSurchargeConfig({ lines: { gateway: { percent: -0.01 } } }).errors.length > 0);
ok('un texto que no es número se rechaza',
    validateSurchargeConfig({ lines: { gateway: { percent: 'dos coma nueve' } } }).errors.length > 0);
eq('el 0 % es válido: una línea sin cobro',
    validateSurchargeConfig({ lines: { transfer: { percent: 0 } } }).errors.length, 0);

// Los avisos NO bloquean: tratarlos igual convierte cualquier observación en
// un bloqueo y se dejan de leer.
const alto = validateSurchargeConfig({ lines: { gateway: { percent: 0.15 }, transfer: { percent: 0.15 } } });
eq('un recargo del 30 % avisa', alto.warnings.length > 0, true);
eq('pero no impide guardar', alto.errors.length, 0);

const todoApagado = validateSurchargeConfig({ enabled: { project_fair: false, event_registration: false } });
ok('apagarlo entero se avisa', todoApagado.warnings.some(w => /apagado/i.test(w)));

// Una clave que no está en el catálogo no se puede configurar.
const inventada = validateSurchargeConfig({ lines: { propina: { percent: 0.5 } } });
ok('una línea inventada se descarta', !('propina' in inventada.config.lines));

// ── 7. Mezcla y lectura: un guardado parcial no rompe nada ───────────
section('7. Aditivo, y nunca lanza');

eq('un guardado parcial conserva lo demás',
    mergeSurchargeConfig({ lines: { gateway: { percent: 0.03 } } }).lines.transfer.percent, 0.021);
eq('una configuración vacía es la vigente', mergeSurchargeConfig({}).lines, C.lines);
eq('null también', mergeSurchargeConfig(null).lines.gateway.percent, 0.029);

// Esto corre en el camino del cobro: una configuración ilegible no puede
// tumbar un pago.
eq('un JSON roto degrada a la vigente', parseSurchargeConfig('{roto').lines.gateway.percent, 0.029);
eq('vacío también', parseSurchargeConfig(null).lines.transfer.percent, 0.021);
eq('se lee un JSON en texto',
    parseSurchargeConfig('{"lines":{"gateway":{"percent":0.04}}}').lines.gateway.percent, 0.04);

// ── 8. La tarifa por moneda gana sobre la general ────────────────────
section('8. De lo particular a lo general');

const porMoneda = mergeSurchargeConfig({ byCurrency: { COP: { gateway: { percent: 0.035 } } } });
eq('en pesos manda la de la moneda',
    resolveSurchargeRates(porMoneda, { currency: 'COP' }).find(r => r.key === 'gateway').percent, 0.035);
eq('en dólares sigue la general',
    resolveSurchargeRates(porMoneda, { currency: 'USD' }).find(r => r.key === 'gateway').percent, 0.029);
eq('y se dice de dónde salió',
    resolveSurchargeRates(porMoneda, { currency: 'COP' }).find(r => r.key === 'gateway').source.percent, 'moneda');

// `0` es una tasa válida y `null` es «no configurado»: con `||` los dos serían
// lo mismo y una línea puesta a cero se leería como si no existiera.
const ceroEnMoneda = mergeSurchargeConfig({ byCurrency: { USD: { transfer: { percent: 0 } } } });
eq('el 0 % de una moneda se respeta',
    resolveSurchargeRates(ceroEnMoneda, { currency: 'USD' }).find(r => r.key === 'transfer').percent, 0);

// El componente fijo, que sólo significa algo en su moneda.
const conFijo = mergeSurchargeConfig({ byCurrency: { USD: { gateway: { fixed: 0.3 } } } });
eq('el fijo se suma a su línea', q(100, 'USD', 'project_fair', conFijo).lines.find(l => l.key === 'gateway').amount, 3.2);

// ── 9. Cómo se explica ───────────────────────────────────────────────
section('9. Un recargo sin nombre es un cobro sin explicar');

ok('cada línea tiene rótulo', SURCHARGE_LINES.every(l => l.label && l.label.length > 3));
ok('la descripción nombra las dos líneas con su porcentaje',
    /2\.9 %/.test(describeSurcharge(feria)) && /2\.1 %/.test(describeSurcharge(feria)));
eq('sin recargo no hay nada que decir', describeSurcharge(q(0)), '');

const filas = surchargeSummary(feria);
eq('el resumen abre con el valor y cierra con el total',
    [filas[0].kind, filas[filas.length - 1].kind], ['base', 'total']);
eq('y lleva una fila por línea', filas.filter(f => f.kind === 'fee').length, 2);

// ── 10. El importe lo calcula el SERVIDOR ────────────────────────────
section('10. El navegador PINTA; no decide cuánto se paga');

const feriaCtrl = read('server/controllers/projectFairController.js');
const eventoCtrl = read('server/controllers/eventRegistrationController.js');

// ⚠️ Si el importe viniera del cuerpo de la petición, cualquiera con el
// endpoint elegiría cuánto paga.
ok('la Feria calcula el recargo en el servidor',
    /computeSurcharge\(/.test(feriaCtrl) && /getSurchargeConfig\(\)/.test(feriaCtrl));
ok('el evento también',
    /computeSurcharge\(/.test(eventoCtrl) && /getSurchargeConfig\(\)/.test(eventoCtrl));
ok('ninguno acepta el recargo del cuerpo de la petición',
    !/req\.body\?\.surcharge/.test(feriaCtrl) && !/req\.body\?\.surcharge/.test(eventoCtrl));
ok('ni el total a cobrar',
    !/req\.body\?\.total/.test(feriaCtrl) && !/req\.body\?\.total/.test(eventoCtrl));

// Lo que se le cobra a Stripe es el TOTAL, no el precio.
ok('la Feria le cobra a Stripe el total con recargo',
    /unit_amount: Math\.round\(chargeUsd \* 100\)/.test(feriaCtrl));
ok('el evento también',
    /unit_amount: toStripeAmount\(charged, currency\)/.test(eventoCtrl));

// ⚠️ Y la sesión abierta se compara contra el TOTAL: si el recargo cambió, esa
// sesión cobra un valor que ya no es el vigente.
ok('una sesión abierta se compara contra lo que se COBRA',
    /reusableCheckout\(existing, \{ amountUsd: chargeUsd \}\)/.test(feriaCtrl));

// El precio publicado no se toca: es lo que se le anunció al club.
ok('la Feria guarda el PRECIO, no el total, en la inscripción',
    /"amountCop" = \$2, "amountUsd" = \$3/.test(feriaCtrl));

// ── 11. El evento: las tres audiencias ───────────────────────────────
section('11. Nacional, internacional y CADRE lo heredan solas');

// ⚠️ El recargo depende del FLUJO, no de la categoría: por eso una categoría
// nueva —o una cuarta audiencia— lo hereda sin tocar código.
ok('el recargo del evento no se decide por audiencia',
    !/audience === 'national'/.test(eventoCtrl) || !/surcharge/.test(eventoCtrl.split("audience === 'national'")[1] || ''));
ok('cada categoría publica sus tasas en su moneda',
    /resolveSurchargeRates\(surchargeConfig, \{ currency: category\.currency \}\)/.test(eventoCtrl));
ok('la configuración se lee UNA vez para todas las categorías',
    /let surchargeConfig = null;/.test(eventoCtrl));

// El precio congelado no se toca: es la promesa que se le hizo a quien se
// inscribió. Lo que se calcula al pagar es el recargo.
ok('el precio se sigue congelando al enviar el formulario',
    /frozenAt: new Date\(\)\.toISOString\(\)/.test(eventoCtrl));
ok('y el recargo se resuelve al abrir el pago, no al congelar',
    eventoCtrl.indexOf('const surchargeConfig = await getSurchargeConfig();')
        > eventoCtrl.indexOf('frozenAt: new Date().toISOString()'));

// ── 12. Lo que retuvo la plataforma queda registrado ─────────────────
section('12. La retención sale del recargo, no de las tarifas');

// ⚠️ Recalcularla con `feeRules` descontaría DOS veces: una al sumarla al club
// y otra al retenerla del cobro.
ok('el Payment guarda la retención', /applicationFee: retencion/.test(feriaCtrl));
ok('y sale de la línea de traslado', /lineas\.transfer/.test(feriaCtrl));
ok('no de la tarifa de los aportes',
    !/platformFee\(total/.test(feriaCtrl) && !/applicationFee: platformFee/.test(feriaCtrl));
ok('el desglose se guarda con el cobro', /surcharge: totalRecargo > 0 \? \{/.test(feriaCtrl));

// ── 13. Se ve ANTES de pagar ─────────────────────────────────────────
section('13. El desglose se muestra antes de abrir la pasarela');

const resumenEvento = read('src/pages/RegistroEvento.tsx');
const wizardFeria = read('src/pages/FeriaProyectos.tsx');
const panelClub = read('src/pages/MiProyecto.tsx');

// Un total mayor que el precio anunciado sin explicación se lee como un cobro
// indebido.
ok('el resumen del evento pinta las líneas', /totals\.quote\.lines\.map/.test(resumenEvento));
ok('y dice «Total a pagar»', /Total a pagar/.test(resumenEvento));
ok('el paso de pago de la Feria pinta las líneas', /recargo\.lines\.map/.test(wizardFeria));
ok('la banda del panel del club también', /pago\.surcharge\.lines\.map/.test(panelClub));
ok('las tres muestran el porcentaje de cada línea',
    /percentLabel\(line\.percent\)/.test(resumenEvento)
    && /percentLabel\(l\.percent\)/.test(wizardFeria)
    && /pct\(l\.percent\)/.test(panelClub));

// El valor publicado NO cambia: es lo que se anuncia.
ok('la Feria conserva el «Valor oficial de inscripción»',
    /Valor oficial de inscripción/.test(wizardFeria));

// ── 14. El panel del operador ────────────────────────────────────────
section('14. Se configura sin desplegar, y en la misma pantalla');

const rutas = read('server/routes/payouts.js');
const boveda = read('src/components/admin/CentralVault.tsx');
const panel = read('src/components/admin/SurchargePanel.tsx');

ok('las rutas son del operador de la plataforma',
    /router\.get\('\/admin\/surcharge', roleMiddleware\(superAdminRoles\)/.test(rutas)
    && /router\.put\('\/admin\/surcharge', roleMiddleware\(superAdminRoles\)/.test(rutas));
ok('el editor vive junto al de tarifas',
    /<FeeRulesPanel \/>/.test(boveda) && /<SurchargePanel \/>/.test(boveda));
ok('y dice en qué se diferencia de la tarifa de arriba',
    /descuenta/.test(panel) && /quien se inscribe/.test(panel));
ok('el ejemplo sale del MISMO cálculo del cobro',
    /computeSurcharge\(base, \{ config, currency: code, flow: 'project_fair' \}\)/.test(read('server/controllers/payoutController.js')));
ok('plegado, los avisos se siguen viendo', /datos\.warnings\.length > 0 && !abierto/.test(panel));

// ── 15. Paridad de los dos espejos ───────────────────────────────────
section('15. El navegador y el servidor dan lo MISMO');

let paridad = false;
try {
    const { build } = await import('esbuild');
    const r = await build({
        entryPoints: ['src/lib/checkoutSurcharge.ts'], bundle: true, write: false,
        format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'silent',
    });
    const esp = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
    paridad = true;

    // La matriz: si difieren, la pantalla enseña una cifra y el cobro usa otra.
    let iguales = true;
    const montos = [0, 1, 7, 133, 250, 12345, 250000, 850000, 999999, 0.5];
    for (const moneda of ['COP', 'USD', 'EUR', 'JPY', 'MXN']) {
        const tasas = {
            enabled: true,
            lines: resolveSurchargeRates(C, { currency: moneda })
                .map(t => ({ key: t.key, label: t.label, percent: t.percent, fixed: t.fixed })),
        };
        for (const monto of montos) {
            const a = computeSurcharge(monto, { config: C, currency: moneda, flow: 'event_registration' });
            const b = esp.computeSurcharge(monto, tasas, moneda, 'event_registration');
            const mismo = a.surcharge === b.surcharge && a.total === b.total && a.base === b.base
                && a.lines.length === b.lines.length
                && a.lines.every((l, i) => l.amount === b.lines[i].amount && l.key === b.lines[i].key);
            if (!mismo) {
                iguales = false;
                console.log(`    ✗ difiere ${monto} ${moneda}: ${a.total} vs ${b.total}`);
            }
        }
    }
    ok('los dos espejos calculan igual', iguales);

    // Los decimales de PRESENTACIÓN, que son los que deciden el redondeo.
    ok('y redondean igual por moneda',
        esp.roundMoney(24.804, 'USD') === 24.8 && esp.roundMoney(40320.6, 'COP') === 40321);
    // Apagado o sin tasas, el espejo tampoco cobra.
    ok('el espejo no cobra sin tasas',
        esp.computeSurcharge(250000, null, 'COP', 'event_registration').total === 250000);
    ok('ni con el recargo apagado',
        esp.computeSurcharge(250000, { enabled: false, lines: [] }, 'COP').surcharge === 0);
    ok('el resumen del espejo abre en base y cierra en total', (() => {
        const f = esp.surchargeSummary(esp.computeSurcharge(250000, {
            enabled: true, lines: [{ key: 'gateway', label: 'x', percent: 0.029, fixed: 0 }],
        }, 'COP'));
        return f[0].kind === 'base' && f[f.length - 1].kind === 'total';
    })());
    ok('y el porcentaje se escribe igual', esp.percentLabel(0.029) === '2,9 %');
} catch (e) {
    if (!paridad) console.log(`  (paridad no comprobada: ${e?.message})`);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (!paridad) console.log('  (el bloque de paridad no corrió: instalá esbuild con `npm i --no-save esbuild`)');
if (fail) process.exit(1);
console.log('El precio se anuncia tal cual; la comisión se dice y se suma antes de cobrar.');
