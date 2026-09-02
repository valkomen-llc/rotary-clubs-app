#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El CAMINO del pago de una inscripción.  npm run test:fair:payment:path
// v4.978.0
//
// POR QUÉ NO ALCANZA `test:fair:payment`. Aquélla prueba el CRITERIO —qué
// cuenta como pago confirmado, qué frase se muestra— y es puro, así que no ve
// nada de lo que de verdad puede fallar: que se pregunte al proveedor ANTES de
// cobrar, que dos pulsaciones no abran dos cobros, que un webhook cierre el
// intento que corresponde, y que quien ya pagó no vuelva a pagar. Es la
// lección de v4.744: el criterio era correcto y el defecto estaba en el camino.
//
// No necesita Postgres ni Stripe: los dos se sustituyen con un hook de
// resolución de módulos. Recorre los trece casos que el pedido enumera.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-fair-payment-stub.mjs', HERE).href;
const STRIPE = new URL('./scripts/fixtures/stripe-fair-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js`, no contra `/lib/db.js`: los módulos de
// `server/lib` se importan entre sí como './db.js' y con el sufijo largo no
// casarían — la prueba no fallaría ruidosamente, se conectaría a un Postgres
// que no está (la trampa que costó una vuelta en v4.847).
register(
    `data:text/javascript,export async function resolve(s,c,n){` +
    `if(/(^|\\/)db\\.js$/.test(s))return{url:${JSON.stringify(DB)},shortCircuit:true};` +
    `if(s==='stripe')return{url:${JSON.stringify(STRIPE)},shortCircuit:true};` +
    `return n(s,c)}`,
    HERE
);

const db = await import(DB);
const stripe = await import(STRIPE);
const fair = await import('../server/controllers/projectFairController.js');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

const nuevo = (submission = {}, cfg = {}) => { db.reset(submission, cfg); stripe.reset(); };
const pagar = (id) => stripe.pagar(id);
const REQ = { headers: { origin: 'https://feria.test' } };
const cobrar = (opts = {}) => fair.beginCheckout('sub_1', { req: REQ, ...opts });

/** Simula el webhook de rechazo tal como llega de la pasarela. */
const rechazo = (code = 'card_declined', paymentIntentId = 'pi_ok') => fair.handlePaymentFailed({
    id: paymentIntentId, object: 'payment_intent',
    metadata: { submissionId: 'sub_1' },
    last_payment_error: { code, decline_code: code, message: 'Your card was declined. request_id: req_9aZ' },
});

// ════════════════════════════════════════════════════════════════════
section('1. Usuario nuevo que paga correctamente');

nuevo();
const r1 = await cobrar();
ok('se abre el cobro', !!r1.url && !r1.reused, JSON.stringify(r1));
eq('una sola sesión en la pasarela', stripe.llamadas.create, 1);
eq('y un solo intento, abierto', db.abiertos().length, 1);
eq('la inscripción guarda su sesión', db.submission().stripeSessionId, r1.sessionId);

await fair.confirmPaidSession(pagar(r1.sessionId));
eq('la inscripción queda pagada', db.submission().status, 'paid');
eq('el intento queda aprobado', db.intentos()[0].status, 'succeeded');
eq('y no queda ninguno abierto', db.abiertos().length, 0);

section('2. Tarjeta declinada y segundo intento exitoso');

nuevo();
const a2 = await cobrar();
await rechazo('card_declined');
eq('la inscripción queda «failed», no pagada', db.submission().status, 'failed');
eq('el intento #1 queda rechazado', db.intentos()[0].status, 'failed');
eq('con su código, para soporte', db.intentos()[0].failureCode, 'card_declined');

// ⚠️ EL DEFECTO QUE ESTE MÓDULO CORRIGE. Un rechazo NO es un pago: el club
// tiene que poder volver a intentarlo. Si esta aserción se pusiera en verde
// tomando el intento anterior por un pago, volvería el callejón sin salida.
const vista2 = await fair.paymentStateFor(db.submission());
ok('se le sigue ofreciendo pagar', vista2.canPay);
eq('con el rótulo del reintento', vista2.actionLabel, 'Reintentar pago');
ok('y sin el texto del gateway a la vista', !JSON.stringify(vista2).includes('req_9aZ'));

const b2 = await cobrar();
// La sesión sigue abierta en la pasarela: se RETOMA en vez de abrir otra.
eq('no se creó una segunda sesión', stripe.llamadas.create, 1);
ok('se retoma la que seguía abierta', b2.reused && b2.url === a2.url);
eq('y se abre el intento #2', db.intentos().length, 2);

await fair.confirmPaidSession(pagar(a2.sessionId));
eq('el pago queda confirmado', db.submission().status, 'paid');
eq('el historial conserva los DOS intentos', db.intentos().length, 2);
eq('el primero sigue rechazado', db.intentos()[0].status, 'failed');
eq('y el segundo aprobado', db.intentos()[1].status, 'succeeded');

section('3. Tarjeta declinada varias veces');

nuevo();
const a3 = await cobrar();
await rechazo('card_declined');
await cobrar();
await rechazo('insufficient_funds');
await cobrar();
await rechazo('expired_card');
eq('tres intentos, todos conservados', db.intentos().length, 3);
eq('los tres con su motivo', db.intentos().map(a => a.failureCode), ['card_declined', 'insufficient_funds', 'expired_card']);
const vista3 = await fair.paymentStateFor(db.submission());
ok('y sigue habiendo salida', vista3.canPay);
eq('la numeración es 1,2,3', vista3.attempts.map(a => a.n), [1, 2, 3]);
eq('el motivo mostrado es el del ÚLTIMO fallo', vista3.detail.startsWith('La tarjeta está vencida.'), true);

section('4. Abandona el checkout y vuelve después');

nuevo();
const a4 = await cobrar();
// No paga, no cancela: simplemente se va. La sesión sigue viva.
const b4 = await cobrar();
ok('se le devuelve la MISMA sesión', b4.reused && b4.url === a4.url);
eq('sin abrir otra en la pasarela', stripe.llamadas.create, 1);
eq('ni otro intento', db.intentos().length, 1);

section('5. La sesión caducó: se abre otra y el club no queda encerrado');

nuevo();
const a5 = await cobrar();
stripe.caducar(a5.sessionId);
const b5 = await cobrar();
ok('se abre una sesión nueva', !b5.reused && b5.url !== a5.url);
eq('la caducada quedó cerrada', db.intentos()[0].status, 'expired');
eq('y hay exactamente un intento abierto', db.abiertos().length, 1);

section('6. Cambia de tarjeta / el importe cambió con la TRM');

nuevo({}, { registration: { priceMode: 'USD', amountUsd: 62 } });
const a6 = await cobrar();
db.config.registration.amountUsd = 70;   // la convocatoria cambió de precio
const b6 = await cobrar();
// Reutilizar una sesión que cobra un valor que ya no es el vigente sería
// cobrar de menos: se expira y se abre otra.
ok('no se reutiliza una sesión con otro importe', !b6.reused);
ok('la vieja se expiró en la pasarela', stripe.llamadas.expire >= 1);
// ⚠️ EL IMPORTE VIGENTE ES EL PRECIO **CON** EL RECARGO: 70 USD + 5 % = 73,50.
// Esta comprobación esperaba 7.000 desde v4.980 y venía FALLANDO —el número se
// quedó con el precio pelado cuando el recargo empezó a sumarse—. Y desde
// v4.981 el cobro viaja repartido en varias partidas, así que `amount_total`
// es su SUMA, igual que en Stripe.
eq('y la nueva cobra el importe vigente', stripe.sesiones.get(b6.sessionId).amount_total, 7350);

section('7. El pago se confirmó por webhook mientras el club no estaba');

nuevo();
const a7 = await cobrar();
pagar(a7.sessionId);                         // la pasarela ya cobró
await fair.confirmPaidSession(stripe.sesiones.get(a7.sessionId));
eq('la inscripción está pagada', db.submission().status, 'paid');
// El club vuelve y pulsa «Completar pago» sin saberlo.
const r7 = await cobrar();
ok('NO se abre un segundo cobro', r7.alreadyPaid === true, JSON.stringify(r7));
eq('y no se creó otra sesión', stripe.llamadas.create, 1);

section('8. El frontend muestra pendiente y el backend ya tiene el pago');

// Es el caso 6 del pedido: el webhook nunca llegó, así que nuestra fila dice
// «pendiente» y la pasarela dice «pagado». Sin la sincronización previa, el
// club pagaría dos veces por un problema de sincronización.
nuevo();
const a8 = await cobrar();
db.submission().status = 'pending_payment';   // el webhook se perdió
db.intentos()[0].status = 'open';
pagar(a8.sessionId);                          // pero la pasarela SÍ cobró

const r8 = await cobrar();
ok('se detecta el pago antes de cobrar', r8.alreadyPaid === true, JSON.stringify(r8));
eq('la inscripción queda pagada sola', db.submission().status, 'paid');
eq('sin una segunda sesión', stripe.llamadas.create, 1);

// Y el mero hecho de mirar el panel basta para que se destrabe.
nuevo();
const a8b = await cobrar();
db.submission().status = 'pending_payment';
pagar(a8b.sessionId);
const sync = await fair.syncPaymentState(db.submission());
eq('sincronizar al cargar el panel lo resuelve', sync.submission.status, 'paid');
const vista8 = await fair.paymentStateFor(sync.submission);
ok('y ya no se ofrece pagar', !vista8.canPay && vista8.paid);

// La consulta ANTES de cobrar es lo único que separa este caso de un segundo
// cobro, así que se comprueba a solas: sin ella, el club paga dos veces.
nuevo();
const a8c = await cobrar();
db.submission().status = 'pending_payment';
db.submission().stripeSessionId = null;          // nuestra fila lo perdió
db.intentos()[0].status = 'canceled';            // y el intento ya se cerró
pagar(a8c.sessionId);
const r8c = await cobrar({ sessionId: a8c.sessionId });   // el retorno de la pasarela
ok('con la sesión que trae el retorno, tampoco se cobra dos veces', r8c.alreadyPaid === true, JSON.stringify(r8c));
eq('y sigue habiendo una sola sesión', stripe.llamadas.create, 1);

section('9. Doble clic sobre «Completar pago»');

nuevo();
const [x9, y9] = await Promise.all([cobrar(), cobrar()]);
// ⚠️ El candado vive en el `ON CONFLICT` parcial del SQL, no en JavaScript: si
// se quita de la consulta, el doble inserta dos intentos y esta aserción falla.
eq('un solo intento abierto', db.abiertos().length, 1);
eq('y un solo intento en total', db.intentos().length, 1);
ok('las dos pulsaciones llevan a un cobro utilizable', !!x9.url && !!y9.url);
const vivas9 = [...stripe.sesiones.values()].filter(s => s.status === 'open');
eq('y sólo queda UNA sesión viva en la pasarela', vivas9.length, 1);

section('10. Múltiples pestañas pagando a la vez');

nuevo();
const r10 = await Promise.all([cobrar(), cobrar(), cobrar(), cobrar()]);
eq('cuatro pestañas, un intento', db.intentos().length, 1);
const vivas10 = [...stripe.sesiones.values()].filter(s => s.status === 'open');
eq('y una sola sesión viva', vivas10.length, 1);
ok('todas reciben un enlace', r10.every(r => !!r.url));
// Confirmar una de ellas paga UNA vez: no hay cuatro cobros que conciliar.
await fair.confirmPaidSession(pagar(vivas10[0].id));
eq('el pago se acredita una sola vez', db.submission().status, 'paid');
eq('con un solo intento aprobado', db.intentos().filter(a => a.status === 'succeeded').length, 1);

section('11. Refresco durante el checkout');

nuevo();
const a11 = await cobrar();
// Recargar el panel no puede abrir otro cobro ni perder el que hay.
const vista11 = await fair.paymentStateFor((await fair.syncPaymentState(db.submission())).submission);
ok('sigue pendiente y con acción', vista11.canPay);
const b11 = await cobrar();
ok('y vuelve al mismo enlace', b11.reused && b11.url === a11.url);
eq('sin sesiones de más', stripe.llamadas.create, 1);

section('12. Pago exitoso pero la redirección final falló');

nuevo();
const a12 = await cobrar();
pagar(a12.sessionId);
// El navegador nunca volvió: no hay `session_id` en ninguna URL. Lo único que
// hay es la sesión guardada en la inscripción, y con eso alcanza.
const sync12 = await fair.syncPaymentState(db.submission());
eq('el panel lo resuelve solo al abrirse', sync12.submission.status, 'paid');
eq('y el intento queda aprobado', db.intentos()[0].status, 'succeeded');

section('13. Volver a pagar una inscripción ya confirmada');

nuevo({ status: 'paid', paidAt: new Date().toISOString() });
const r13 = await cobrar();
ok('no se abre ningún cobro', r13.alreadyPaid === true);
eq('ni se llamó a la pasarela para crear', stripe.llamadas.create, 0);
eq('ni quedó ningún intento', db.intentos().length, 0);
const vista13 = await fair.paymentStateFor(db.submission());
ok('y la pantalla no ofrece la acción', !vista13.canPay && vista13.actionLabel === null);

// Una inscripción reembolsada tampoco se vuelve a cobrar por su cuenta: es una
// decisión administrativa y la salida se DICE, no se deja un botón muerto.
nuevo({ status: 'refunded' });
const r13b = await cobrar();
eq('reembolsada: se bloquea con su motivo', r13b.blocked, 'refunded');
ok('y el motivo dice qué hacer', /Escríbenos/.test(r13b.error));

section('14. Lo que no puede pasar aunque falle todo');

// Sin precio configurado no se cobra: mandar a alguien a pagar cero es peor
// que decirle que la convocatoria no está lista.
nuevo({}, { registration: { priceMode: 'USD', amountUsd: 0 } });
const r14 = await cobrar();
eq('sin precio no se abre cobro', r14.blocked, 'pricing');
eq('y no se llamó a la pasarela', stripe.llamadas.create, 0);

// La pasarela caída no confirma un pago que no vimos: la inscripción se queda
// pendiente, que es el lado seguro.
nuevo();
const a14 = await cobrar();
stripe.romperLectura('connection error');
const sync14 = await fair.syncPaymentState(db.submission());
eq('si la pasarela no responde, no se inventa un pago', sync14.submission.status, 'pending_payment');
ok('y no revienta', sync14.changed === false);

// Una inscripción que no existe se dice, no se crea.
nuevo();
const r14b = await fair.beginCheckout('sub_inexistente', { req: REQ });
eq('inscripción desconocida', r14b.blocked, 'not_found');

section('15. El cobro no se pide desde el cuerpo de la petición');

const portal = (await import('fs')).readFileSync(new URL('../server/controllers/projectFairPortalController.js', import.meta.url), 'utf8');
// ⚠️ La inscripción sale del TOKEN. Si viniera del cuerpo, cualquiera con este
// endpoint abriría un cobro contra la inscripción de otro club.
ok('startCheckout usa la inscripción del token',
    /beginCheckout\(req\.portal\.submissionId/.test(portal));
ok('y no la toma del body', !/beginCheckout\(req\.body/.test(portal));

// ⚠️ Y EL PANEL SINCRONIZA ANTES DE PINTAR. Sin esta llamada, un pago
// confirmado mientras el club no estaba se seguiría mostrando como pendiente
// y con el botón de pagar encima — el caso 6 del pedido.
ok('/portal/me pregunta al proveedor antes de responder',
    /submission = \(await syncPaymentState\(submission\)\)\.submission;/.test(portal));
ok('y devuelve el veredicto ya resuelto', /payment: await paymentStateFor\(submission\)/.test(portal));

const rutas = (await import('fs')).readFileSync(new URL('../server/routes/project-fair.js', import.meta.url), 'utf8');
ok('la ruta del panel exige sesión', /portal\/checkout', portal\.portalAuth/.test(rutas));

// El bloqueo de los formularios NO se aflojó: es la regla que sigue en pie.
// Y se comprueba en las DOS mitades, porque el criterio puede quedar intacto
// mientras un manejador deja de consultarlo — y eso no lo ve nadie: el código
// es válido, los tipos están bien y el formulario simplemente se guarda.
const formularios = (await import('fs')).readFileSync(new URL('../server/controllers/projectFormsController.js', import.meta.url), 'utf8');
ok('sin pago confirmado los formularios siguen bloqueados',
    /submission\?\.status !== 'paid'/.test(formularios));

// Los manejadores que ESCRIBEN tienen que cortar con el veredicto, no sólo
// calcularlo: guardar y enviar son los dos únicos caminos por los que un
// formulario cambia, y los dos van detrás del mismo `canEdit`.
const cuerpoDe = (nombre) => {
    const i = formularios.indexOf(`export const ${nombre} = async (req, res) => {`);
    if (i < 0) return '';
    const j = formularios.indexOf('\n};', i);
    return formularios.slice(i, j < 0 ? undefined : j);
};
for (const manejador of ['saveForm', 'submitForm']) {
    const cuerpo = cuerpoDe(manejador);
    ok(`${manejador} existe y consulta el veredicto`, /editability\(submission, record, cfg, account\)/.test(cuerpo));
    ok(`${manejador} RECHAZA cuando no se puede editar`,
        /if \(!edit\.canEdit\) return res\.status\(403\)/.test(cuerpo));
}

// ⚠️ Y LA LECTURA TAMBIÉN (v4.979). Las escrituras estaban cerradas y el
// formulario SE PODÍA ABRIR: `getForm` devolvía la plantilla entera con
// `canEdit:false`. Se reportó como «cualquier usuario que no ha completado el
// pago puede acceder a los formularios».
ok('getForm corta sin pago confirmado', /if \(!formIsAvailable\(submission\)\) \{/.test(cuerpoDe('getForm')));
ok('y responde 402 con el motivo',
    /return res\.status\(402\)[\s\S]{0,220}needsPayment: true/.test(cuerpoDe('getForm')));

// La puerta se decide con el criterio del PAGO, no con `canEdit`: un reembolso
// o un plazo vencido dejan el formulario en solo lectura y el club sigue
// pudiendo consultarlo. Cerrar ahí le quitaría el acceso a un trabajo hecho.
ok('la puerta usa el criterio puro del pago',
    /import \{ hasConfirmedPayment \} from '\.\.\/lib\/projectFairPayment\.js'/.test(formularios)
    && /export const formIsAvailable = \(submission\) => hasConfirmedPayment\(submission\)/.test(formularios));

// La tarjeta lo DECLARA, así que la pantalla no vuelve a decidirlo.
ok('la tarjeta declara si el formulario se puede abrir',
    /available: formIsAvailable\(submission\)/.test(formularios));


section('16. La pantalla ofrece la salida donde se mira primero');

const pantalla = (await import('fs')).readFileSync(new URL('../src/pages/MiProyecto.tsx', import.meta.url), 'utf8');
ok('hay una acción de pago cableada al endpoint del panel',
    /project-fair\/portal\/checkout/.test(pantalla) && /const handlePay/.test(pantalla));
// La acción va JUNTO al aviso que la reclama: hasta v4.977 el bloqueo de los
// formularios se anunciaba sin nada que pulsar (regla del modo Fotográfico,
// v4.798).
ok('y va junto al aviso del bloqueo', /<PaymentCallout[\s\S]{0,400}bloqueo=/.test(pantalla));
ok('el botón se apaga mientras se pide la sesión', /disabled=\{paying\}/.test(pantalla));
// El envoltorio va en el ámbito del MÓDULO: declarado dentro de la página
// sería un tipo nuevo en cada render (v4.971).
// La tarjeta sin `available` NO navega, y la ausencia del campo —un servidor
// anterior— se comporta como antes (regla aditiva).
ok('la tarjeta deja de ser un enlace sin pago', /const abrible = form\.available !== false;/.test(pantalla));
ok('y sólo es un botón cuando se puede abrir', /abrible \? 'button' : 'div'/.test(pantalla));
ok('el clic se cablea sólo si es abrible', /abrible \? \{ onClick: onOpen \}/.test(pantalla));
ok('y se dice qué lo habilita', /Se habilita con el pago/.test(pantalla));

// Entrar por la dirección directa da el candado, no un error rojo: pintar un
// bloqueo como avería manda a diagnosticar lo que no está roto.
const vista = (await import('fs')).readFileSync(new URL('../src/components/project-forms/ProjectFormView.tsx', import.meta.url), 'utf8');
ok('el 402 se reconoce en la vista del formulario',
    /r\.status === 402 \|\| !!body\?\.needsPayment/.test(vista));
ok('y se pinta como candado, no como error', /if \(bloqueadoPorPago\) \{/.test(vista));

ok('PaymentCallout está en el ámbito del módulo', /^const PaymentCallout = /m.test(pantalla));

section('17. El precio se fija Y SE COBRA en pesos (v4.982)');

// ⚠️ EL DEFECTO QUE ESTA SECCIÓN EXISTE PARA NO REPETIR, reportado con la
// pantalla de Stripe delante: una inscripción de 250.000 COP salía a US$ 82,44
// (TRM nuestra 3.184) y Stripe la volvía a presentar en pesos con SU tasa
// (3.301,44), o sea 272.170 COP. El precio publicado subía y bajaba con el
// dólar dos veces, una por cada conversión.
const COP = {
    registration: { priceMode: 'COP', amountCop: 250_000, concept: 'Inscripción de proyecto' },
};
nuevo({}, COP);
db.ponerTrm(3184);
const r17 = await cobrar();
const s17 = stripe.sesiones.get(r17.sessionId);
const p17 = s17.__payload?.line_items || [];

eq('la sesión se crea en pesos', s17.currency, 'cop');
ok('y todas sus partidas también', p17.every(li => li.price_data.currency === 'cop'));
// 250.000 + 2,9 % (7.250) + 2,1 % (5.250) = 262.500, en centavos de peso.
eq('el cobro es el total del desglose, en centavos de peso', s17.amount_total, 26_250_000);
eq('la inscripción va primera y por su precio', p17[0]?.price_data?.unit_amount, 25_000_000);
eq('la pasarela cobra su comisión aparte', p17[1]?.price_data?.unit_amount, 725_000);
eq('y el traslado interbancario también', p17[2]?.price_data?.unit_amount, 525_000);
ok('ninguna partida menciona dólares',
    !p17.some(li => /USD|dólar/i.test(JSON.stringify(li.price_data.product_data || {}))));
// La TRM viaja como referencia para poder conciliar, no como el importe.
eq('el equivalente en dólares queda en la metadata', s17.metadata.chargeCurrency, 'COP');

// La sesión abierta se reutiliza sólo si cobra lo mismo Y en la misma moneda.
const r17b = await cobrar();
ok('un segundo clic reutiliza la misma sesión', r17b.reused === true && r17b.url === r17.url);
eq('y no abre un segundo cobro', stripe.llamadas.create, 1);

section('18. Sin TRM se cobra igual: la tasa no gobierna el precio');

// Hasta v4.981 un proveedor de TRM caído respondía 503 y dejaba a un club sin
// poder pagar sus 250.000 pesos por no haber podido consultar el dólar. El
// cobro en pesos no necesita la tasa, así que la tasa no puede impedirlo.
const sinTrm = fair.computePricing({ registration: { priceMode: 'COP', amountCop: 250_000 } }, null);
ok('el precio en pesos queda listo para cobrar', sinTrm.ready === true && sinTrm.error === null);
eq('y son los pesos configurados', sinTrm.amountCop, 250_000);
// Un hueco es la verdad; un cero sería una afirmación.
eq('el equivalente en dólares queda en null, no en cero', sinTrm.amountUsd, null);

const cotiza = fair.quoteCheckout(sinTrm, {
    enabled: { project_fair: true },
    lines: { gateway: { percent: 0.029, fixed: 0 }, transfer: { percent: 0.021, fixed: 0 } },
    byCurrency: {},
});
eq('se cobra en pesos', cotiza.chargeCurrency, 'COP');
eq('y el importe es el total del desglose', cotiza.chargeAmount, 262_500);
eq('sin TRM no se inventa una conversión', cotiza.chargeUsd, null);

// Con la tasa disponible, el equivalente vuelve — como REFERENCIA.
const conTrm = fair.computePricing({ registration: { priceMode: 'COP', amountCop: 250_000 } }, { rate: 3184 });
eq('con TRM el equivalente se calcula', conTrm.amountUsd, 78.52);
eq('pero el cobro sigue siendo en pesos',
    fair.quoteCheckout(conTrm, { enabled: { project_fair: false } }).chargeCurrency, 'COP');

// El precio en dólares no cambió de comportamiento.
const enUsd = fair.computePricing({ registration: { priceMode: 'USD', amountUsd: 62 } }, null);
eq('un precio en dólares se sigue cobrando en dólares',
    fair.quoteCheckout(enUsd, { enabled: { project_fair: false } }).chargeCurrency, 'USD');

console.log(`\n${fail ? '❌' : '✅'} test:fair:payment:path — ${pass} pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
