#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LOS MÉTODOS DE PAGO.  npm run test:payment-methods
// v4.869.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED.
//
// Lo que protege sobre todo: que desplegar esto NO deje a la plataforma sin
// poder cobrar, y que CONFIGURADO y ACTIVADO sigan siendo dos cosas distintas.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    PAYMENT_METHODS, METHOD_IDS, PAYMENT_METHODS_KEY, MOTIVOS,
    methodStatus, methodLimits, resolveMethods, isMethodOffered,
    validateMethods, defaultConfig, mergeMethods, parseMethods, methodById,
} from '../server/lib/paymentMethods.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

const CON_TODO = { STRIPE_SECRET_KEY: 'sk_x', PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'sec' };
const SOLO_STRIPE = { STRIPE_SECRET_KEY: 'sk_x' };

// ── 1. Desplegar esto no deja a nadie sin cobrar ────────────────────
section('1. La tarjeta sigue ofreciéndose sin tocar nada');

// ⚠️ Es la comprobación que autoriza el despliegue: `card` es la única vía que
// existía hasta v4.866. Si naciera apagada, desplegar dejaría a TODA la
// plataforma sin poder recibir aportes.
const porDefecto = resolveMethods(defaultConfig(), SOLO_STRIPE);
const card = porDefecto.find(m => m.id === 'card');
ok('la tarjeta viene ACTIVADA por defecto', card.enabled);
ok('y se ofrece', card.offered);

const paypal = porDefecto.find(m => m.id === 'paypal');
// El paso que se pidió: primero se habilita a propósito.
ok('PayPal viene apagado', !paypal.enabled);
ok('y no se ofrece', !paypal.offered);

// ── 2. Configurado ≠ activado ───────────────────────────────────────
section('2. Configurado y activado son DOS cosas');

const conCredenciales = resolveMethods(defaultConfig(), CON_TODO).find(m => m.id === 'paypal');
ok('con credenciales, PayPal figura CONFIGURADO', conCredenciales.configured);
ok('pero NO se ofrece hasta activarlo', !conCredenciales.offered);
eq('y se dice por qué', conCredenciales.reason, 'desactivado');

const activadoSinNada = resolveMethods({ paypal: { enabled: true } }, SOLO_STRIPE).find(m => m.id === 'paypal');
ok('activarlo sin credenciales NO lo ofrece', !activadoSinNada.offered);
eq('y el motivo es otro', activadoSinNada.reason, 'sin_credenciales');
// Qué falta, con el nombre exacto: «no configurado» a secas manda a adivinar.
eq('se dice qué variable falta', activadoSinNada.missing, ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']);

const listo = resolveMethods({ paypal: { enabled: true } }, CON_TODO).find(m => m.id === 'paypal');
ok('con las dos cosas, se ofrece', listo.offered);
eq('y no hay motivo que dar', listo.reason, null);

// ⚠️ El estado NUNCA incluye el secreto, ni recortado.
const serializado = JSON.stringify(resolveMethods(defaultConfig(), CON_TODO));
ok('el estado no filtra el secreto', !/sk_x|sec\b/.test(serializado), serializado.slice(0, 200));

// ── 3. El catálogo es cerrado ───────────────────────────────────────
section('3. No puede aparecer una vía que nadie declaró');

eq('los métodos declarados', METHOD_IDS, ['card', 'paypal']);
const colado = validateMethods({ card: { enabled: true }, cripto: { enabled: true } }, CON_TODO);
ok('un método inventado se RECHAZA', colado.errors.length > 0);
ok('y no se guarda', !('cripto' in colado.methods));
ok('lo que no es booleano se rechaza',
    validateMethods({ card: { enabled: 'sí' } }, CON_TODO).errors.length > 0);
eq('el catálogo no cambia de sitio', PAYMENT_METHODS_KEY, 'payment_methods');

// ── 4. Avisos, no bloqueos ──────────────────────────────────────────
section('4. Se puede dejar listo, y se DICE');

const listoSinVars = validateMethods({ paypal: { enabled: true } }, SOLO_STRIPE);
eq('activar sin credenciales no es un error', listoSinVars.errors.length, 0);
ok('pero se avisa que no se ofrecerá',
    listoSinVars.warnings.some(w => /no se ofrecerá/i.test(w)), JSON.stringify(listoSinVars.warnings));

// ⚠️ Quedarse sin NINGÚN método es el error que no se descubre hasta que
// alguien intenta donar.
const sinNinguno = validateMethods({ card: { enabled: false }, paypal: { enabled: false } }, CON_TODO);
ok('apagarlo todo se avisa',
    sinNinguno.warnings.some(w => /Ningún método/i.test(w)), JSON.stringify(sinNinguno.warnings));
eq('pero no se bloquea', sinNinguno.errors.length, 0);

// ── 5. Un guardado parcial no apaga nada ────────────────────────────
section('5. Aditivo, como las tarifas');

const parcial = mergeMethods({ paypal: { enabled: true } });
ok('la tarjeta conserva su valor', parcial.card.enabled);
ok('y lo guardado se aplica', parcial.paypal.enabled);

// Esto corre en el camino del cobro: una configuración ilegible no puede dejar
// la plataforma sin poder recibir aportes.
ok('un JSON roto degrada a los valores por defecto', parseMethods('{roto').card.enabled);
ok('y una configuración vacía también', parseMethods(null).card.enabled);
ok('lo guardado se lee', parseMethods(JSON.stringify({ card: { enabled: false } })).card.enabled === false);
mergeMethods({ card: { enabled: false } });
ok('mergeMethods no muta el catálogo', methodById('card').defaultEnabled === true);

eq('isMethodOffered contesta lo mismo', isMethodOffered('paypal', { paypal: { enabled: true } }, CON_TODO), true);
eq('y con un método inexistente, false', isMethodOffered('cripto', {}, CON_TODO), false);

// ── 5b. «Se está ofreciendo» no es «en todos los aportes» ───────────
section('5b. Lo que ACOTA dónde se ofrece un método (v4.869)');

const elPaypal = methodById('paypal');
const ACTIVO = { paypal: { enabled: true } };

// ⚠️ EL DEFECTO REPORTADO. Credenciales cargadas, interruptor puesto, el panel
// decía «Se está ofreciendo» — y el botón no aparecía en rotary4281.org,
// porque el sitio cobra en COP y la cuenta está acotada a USD. El estado era
// correcto y la afirmación, incompleta.
const acotado = methodLimits(elPaypal, { ...CON_TODO, PAYPAL_CURRENCY: 'USD', PAYPAL_ENV: 'live' });
ok('con PAYPAL_CURRENCY hay un límite de moneda', acotado.some(l => l.kind === 'currency'));
ok('y nombra la moneda concreta', /USD/.test(acotado.find(l => l.kind === 'currency')?.text || ''));
ok('y dice que se convierte con la tasa del día, no con una inventada',
    /TRM se resuelve sola/i.test(acotado.find(l => l.kind === 'currency')?.text || '')
    && /nunca se inventa/i.test(acotado.find(l => l.kind === 'currency')?.text || ''),
    'la regla es «no se inventa una tasa», no «no se convierte»');

// Vacía es «la que venga»: no hay nada que acotar y no se inventa un límite.
eq('sin PAYPAL_CURRENCY no hay límite de moneda',
    methodLimits(elPaypal, { ...CON_TODO, PAYPAL_ENV: 'live' }).filter(l => l.kind === 'currency').length, 0);

// ⚠️ Sandbox es el valor por defecto A PROPÓSITO, así que hay que decirlo: un
// aporte hecho en sandbox no es dinero, y eso no se descubre mirando el panel.
ok('sin PAYPAL_ENV=live se avisa que está en pruebas',
    methodLimits(elPaypal, CON_TODO).some(l => l.kind === 'sandbox'));
ok('y una variable mal escrita cuenta como pruebas',
    methodLimits(elPaypal, { ...CON_TODO, PAYPAL_ENV: 'produccion' }).some(l => l.kind === 'sandbox'));
eq('con PAYPAL_ENV=live no se avisa nada de pruebas',
    methodLimits(elPaypal, { ...CON_TODO, PAYPAL_ENV: 'live' }).filter(l => l.kind === 'sandbox').length, 0);

// La tarjeta no tiene límites declarados: no se inventan.
eq('la tarjeta no declara límites', methodLimits(methodById('card'), CON_TODO).length, 0);
eq('un método inexistente no revienta', methodLimits(null, CON_TODO).length, 0);

// Los límites viajan CON el método: sin eso el panel no los puede pintar.
const resuelto = resolveMethods(ACTIVO, { ...CON_TODO, PAYPAL_CURRENCY: 'USD' });
const filaPaypal = resuelto.find(m => m.id === 'paypal');
ok('los límites viajan en resolveMethods', Array.isArray(filaPaypal.limits) && filaPaypal.limits.length === 2);
ok('y el método SIGUE ofreciéndose', filaPaypal.offered === true,
    'un límite acota dónde se ofrece; no lo apaga');

// El hecho del proveedor que más cuesta descubrir, dicho donde se configura.
ok('el catálogo dice que PayPal no procesa COP', /COP/.test(elPaypal.help));

// ── 6. Sobre los archivos ───────────────────────────────────────────
section('6. Lo que no se ve mirando una pantalla');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const spec = read('server/lib/paymentMethods.js');
const paypalCtrl = read('server/controllers/paypalController.js');
const rutas = read('server/routes/payouts.js');
const panel = read('src/components/admin/PaymentMethodsPanel.tsx');

ok('el criterio es puro', !/from '\.\/(db|prisma)\.js'/.test(spec) && !/\bfetch\(/.test(spec));

// ⚠️ El interruptor se comprueba EN EL SERVIDOR, no sólo al pintar el botón:
// esconder un control en la pantalla no protege el endpoint.
ok('crear un pedido de PayPal comprueba el interruptor',
    (paypalCtrl.match(/isMethodOffered\('paypal'/g) || []).length >= 2, 'debe estar en disponibilidad Y en creación');

ok('los métodos son del operador de la plataforma',
    /router\.get\('\/admin\/payment-methods', roleMiddleware\(superAdminRoles\)/.test(rutas)
    && /router\.put\('\/admin\/payment-methods', roleMiddleware\(superAdminRoles\)/.test(rutas));

// El secreto no viaja al navegador ni se pinta.
ok('el panel NO muestra ni pide el secreto',
    !/secretRef|CLIENT_SECRET.*value=|type="password"/.test(panel));
ok('y dice DÓNDE se cargan las credenciales',
    /entorno, no acá/i.test(panel));

// ⚠️ Los límites tienen que PINTARSE, o volvemos al estado que afirma de más.
ok('el panel pinta los límites del método', /m\.limits/.test(panel));
ok('y sólo cuando el método de verdad se ofrece',
    /m\.offered && \(m\.limits/.test(panel),
    'con el interruptor apagado, «sólo en USD» explica una restricción de algo que no está pasando');

// El motivo por el que un método no se ofrece está redactado.
ok('los dos motivos están escritos',
    /credenciales/i.test(MOTIVOS.sin_credenciales) && /activ/i.test(MOTIVOS.desactivado));

console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('Configurado y activado siguen siendo dos cosas distintas.');
