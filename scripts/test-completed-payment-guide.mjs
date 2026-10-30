#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Guía de pago por COLROTARIOS / AvalPay en el paso 4 — v4.1268.0
//
//   npm run test:completed:payment-guide
//
// Sin base, credenciales ni red. Comprueba el CRITERIO (configuración por
// evento, enlace sólo https, pasos armados con el proveedor y el concepto
// reales, la semilla de Villavicencio sin pisar lo que guarde el panel) y las
// guardas del código (la tarjeta es un componente de nivel superior, abre una
// pestaña nueva con `noopener noreferrer`, no hay iframe, el borrador retoma
// el paso sin guardar la contraseña).
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const leer = (f) => readFileSync(`${REPO}/${f}`, 'utf8');
const spec = await import('../server/lib/completedRegistrationSpec.js');

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);

const SLUG = 'inscripcion-conferencia-distrital-villavicencio-2027';
const AVALPAY = 'https://micrositios.avalpaycenter.com/fundacion-colombian-rotarios-ma';

grupo('1. La configuración por evento');
{
    const vacia = spec.normalizeCompletedConfig({});
    check('un formulario cualquiera nace SIN guía', vacia.paymentGuide.enabled === false);
    check('…y sin guía pública', spec.publicPaymentGuide(vacia.paymentGuide) === null);

    const villa = spec.normalizeCompletedConfig({ slug: SLUG, enabled: true });
    check('Villavicencio, sin la clave guardada, toma la de su semilla', villa.paymentGuide.enabled === true
        && villa.paymentGuide.url === AVALPAY && villa.paymentGuide.providerName === 'AvalPay');
    check('el concepto es el de la conferencia, no «Feria de Proyectos»',
        villa.paymentGuide.concept === 'Conferencia Villavicencio 2027');
    check('la despliega «Pasarela de pagos de COLROTARIOS»', villa.paymentGuide.method === 'pasarela_colrotarios'
        && spec.PAYMENT_METHODS.some(m => m.value === villa.paymentGuide.method));

    const apagada = spec.normalizeCompletedConfig({ slug: SLUG, paymentGuide: { enabled: false } });
    check('si el panel la apagó, la semilla NO la vuelve a encender', apagada.paymentGuide.enabled === false);
    const otroConcepto = spec.normalizeCompletedConfig({ slug: SLUG, paymentGuide: { enabled: true, url: AVALPAY, concept: 'Otro concepto' } });
    check('el concepto que guarde el panel manda', otroConcepto.paymentGuide.concept === 'Otro concepto');
    check('una configuración guardada sobrevive a otra normalización (idempotente)',
        JSON.stringify(spec.normalizeCompletedConfig(villa)) === JSON.stringify(villa));
}

grupo('2. El enlace de pago');
check('https se acepta', spec.safePaymentUrl(AVALPAY) === AVALPAY);
check('http NO (destino de pago inseguro)', spec.safePaymentUrl('http://micrositios.avalpaycenter.com/x') === '');
check('javascript: NO', spec.safePaymentUrl('javascript:alert(1)') === '');
check('basura NO', spec.safePaymentUrl('no es un enlace') === '');
check('sin enlace válido, la guía no se publica aunque esté encendida',
    spec.publicPaymentGuide({ enabled: true, url: 'http://x.org', providerName: 'AvalPay' }) === null);
check('un método inventado cae a COLROTARIOS',
    spec.normalizePaymentGuide({ enabled: true, method: 'efectivo' }).method === 'pasarela_colrotarios');

grupo('3. Lo que ve el participante');
{
    const g = spec.publicPaymentGuide(spec.normalizeCompletedConfig({ slug: SLUG }).paymentGuide,
        'XIII Conferencia Rotaria del Distrito 4281 – Villavicencio 2027');
    check('el título pedido', g.title === 'Realiza tu aporte de inscripción con COLROTARIOS');
    check('la introducción nombra el evento y AvalPay', /Villavicencio 2027/.test(g.intro) && /AvalPay/.test(g.intro));
    check('el botón dice «Ir a pagar con AvalPay»', g.buttonLabel === 'Ir a pagar con AvalPay');
    check('cuatro pasos, en orden', g.steps.map(s => s.key).join(',') === 'open,concept,pay,receipt');
    check('el paso 1 nombra el MISMO botón', g.steps[0].text.includes('«Ir a pagar con AvalPay»') && /nueva pestaña/.test(g.steps[0].text));
    check('el paso 2 nombra el campo y el concepto',
        g.steps[1].text.includes('«Aportes Colrotarios»') && g.steps[1].text.includes('«Conferencia Villavicencio 2027»'));
    check('el paso 4 manda a volver y adjuntar', /Regresa a este formulario/.test(g.steps[3].text)
        && g.steps[3].text.includes('«Subir comprobante de pago del aporte»'));
    check('la advertencia dice que pagar NO completa la inscripción',
        /no completa automáticamente tu inscripción/.test(g.warning) && /validará posteriormente/.test(g.warning));
    check('la indicación junto al comprobante', g.receiptHint === 'Adjunta aquí el comprobante que descargaste al finalizar tu pago en AvalPay.');

    const otro = spec.publicPaymentGuide({ enabled: true, url: AVALPAY, providerName: 'PayU', concept: 'Conferencia Bidistrital 4281-4271', buttonLabel: 'Pagar ahora' });
    check('con otro proveedor y botón, los pasos se reescriben solos',
        otro.steps[0].text.includes('«Pagar ahora»') && otro.steps[1].text.includes('Bidistrital') && /PayU/.test(otro.steps[2].text));
    const sinConcepto = spec.publicPaymentGuide({ enabled: true, url: AVALPAY, providerName: 'AvalPay' });
    check('sin concepto configurado no se inventa uno', !/«[^»]*2027»/.test(sinConcepto.steps[1].text)
        && /corresponde a este evento/.test(sinConcepto.steps[1].text));
}

grupo('4. El servidor');
{
    const ctrl = leer('server/controllers/completedRegistrationController.js');
    check('la configuración pública publica SÓLO la guía saneada', /paymentGuide: publicPaymentGuide\(config\.paymentGuide, event\.title\)/.test(ctrl));
    check('el registro sigue naciendo «submitted» (la guía no confirma nada)',
        /'submitted', COMPLETED_SOURCE/.test(leer('server/lib/completedRegistrationStore.js')));
    const admin = leer('server/controllers/completedRegistrationAdminController.js');
    check('guardarla pasa por el mismo control del panel (requireEvent) y se normaliza',
        /export const saveConfig[\s\S]{0,200}requireEvent\(req, res\)[\s\S]{0,200}normalizeCompletedConfig/.test(admin));
}

grupo('5. La pantalla');
{
    const form = leer('src/pages/CompletarInscripcion.tsx');
    check('la tarjeta es un componente de NIVEL SUPERIOR', /\nconst PaymentGuideCard = \(/.test(form));
    check('se pinta sólo con el método de la guía elegido',
        /guide && field\.key === 'paymentMethod' && value === guide\.method && \(\s*<PaymentGuideCard/.test(form));
    check('el botón abre una pestaña NUEVA con noopener noreferrer',
        /<a href=\{guide\.url\} target="_blank" rel="noopener noreferrer"/.test(form));
    check('nada de iframe', !/<iframe/i.test(form));
    check('la animación se apaga con «reducir movimiento»', /motion-reduce:transition-none/.test(form));
    check('la indicación junto al comprobante sólo con ese método',
        /guide && answers\.paymentMethod === guide\.method && \(\s*<p[^>]*>\s*<Info[^>]*\/> \{guide\.receiptHint\}/.test(form));
    const m = /const value: Draft = \{([^}]*)\}/.exec(form);
    check('el borrador guarda el paso, sin contraseña', Boolean(m) && /stepIndex/.test(m[1]) && !/password|credential/i.test(m[1]));
    check('volver de pagar retoma el paso guardado', /useState\(\(\) => draft\?\.stepIndex \|\| 0\)/.test(form));
    check('si había pedido cuenta, la contraseña se vuelve a pedir en vez de enviar sin cuenta',
        /wantsAccount && accountMode !== 'off' && !sessionMatches && !credentials\.password/.test(form));
    check('el formulario no pide datos de tarjeta ni bancarios',
        !/cardNumber|numeroTarjeta|cvv|cvc|accountNumber|numeroCuenta/i.test(form));
}

console.log(`\n${pasadas} comprobaciones pasaron${fallos.length ? `, ${fallos.length} FALLARON:` : '.'}`);
for (const f of fallos) console.log(`  ✗ ${f}`);
process.exit(fallos.length ? 1 : 0);
