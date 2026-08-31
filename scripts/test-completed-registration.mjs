#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Inscripciones completadas — pruebas del CRITERIO — v4.944.0
//
// No necesitan base, credenciales ni red: prueban las decisiones —el
// formulario de cuatro pasos, la validación, el comprobante aceptado, el
// código, la semilla del slug y la marca de duplicados—, separadas de la
// orquestación, por el mismo motivo que `seoRules.js` vive aparte de
// `seoAudit.js`. El CAMINO del servidor lo prueba `test:completed:path`.
//
//   npm run test:completed
//
// El bloque del espejo del navegador pide `esbuild` y se salta solo si falta.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    COMPLETED_SOURCE, ONLINE_SOURCE,
    COMPLETED_STATUS_KEYS, ACCREDITABLE_STATUSES, completedStatusMeta,
    PAYMENT_METHODS, MEMBERSHIP_OPTIONS, membershipLabel, clubRoleOptions, clubRoleLabel,
    GUEST_TYPE_OPTIONS, guestTypeLabel,
    RECEIPT_MAX_BYTES, receiptExtensionFor, checkReceiptMeta,
    RESERVED_SLUGS, normalizeCompletedSlug, normalizeCompletedConfig,
    completedCodePrefixFor, buildCompletedCode,
    buildCompletedSchema, flattenCompletedFields, isCompletedFieldRequired,
    completedOptionsFor, validateCompletedAnswers,
    duplicateMatchKind, buildDuplicateFlags,
    COMPLETED_FORM_SEEDS, seedForSlug, matchSeedEvent,
    formatEventDates, eventPlaceOf, defaultNotifySubject,
    resolveEmailVariables, buildCompletedEmail,
} from '../server/lib/completedRegistrationSpec.js';
import importSpec from '../server/lib/completedImportSpec.js';
import { rotaryCatalogFor, isFieldVisible } from '../server/lib/eventRegistrationSpec.js';
import { receiptKeyBelongs, RECEIPT_PREFIX } from '../server/lib/completedReceipts.js';

let pasadas = 0;
const fallos = [];
const check = (nombre, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ✓ ${nombre}`); }
    else { fallos.push(nombre); console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);

const CATALOGOS = { districts: rotaryCatalogFor({}) };
const CONFIG = normalizeCompletedConfig({ enabled: true, slug: 'x', rolePeriod: '2026-2027' });

const RESPUESTAS_VALIDAS = {
    firstName: 'Yaneth', lastName: 'Solano', documentNumber: '52111222',
    email: 'yaneth@example.com', phone: '+57 3001234567',
    district: '4281', clubName: 'Bogotá Multicentro', membershipType: 'socio_activo',
    clubRole: 'presidente_electo',
    eps: 'Sanitas', foodAllergy: 'Ninguno',
    emergencyName: 'Pedro Solano', emergencyPhone: '+57 3007654321',
    paymentMethod: 'transferencia', comments: '',
};

// ── 1. Estados ───────────────────────────────────────────────────────
grupo('Estados del registro completado');
check('cinco estados, con «Pendiente de validación» primero',
    COMPLETED_STATUS_KEYS[0] === 'submitted' && COMPLETED_STATUS_KEYS.length === 5,
    COMPLETED_STATUS_KEYS.join(', '));
check('el envío NUNCA nace confirmado: submitted no es acreditable',
    completedStatusMeta('submitted').accreditable === false);
check('validado y pago confirmado son los acreditables',
    JSON.stringify(ACCREDITABLE_STATUSES) === JSON.stringify(['validated', 'payment_confirmed']));
check('un estado desconocido cae a un meta neutro, no revienta',
    completedStatusMeta('otro').label === 'otro' && completedStatusMeta('otro').accreditable === false);
check('las fuentes están rotuladas y son distintas',
    COMPLETED_SOURCE === 'manual_completed_registration' && ONLINE_SOURCE === 'online_registration');

// ── 2. El formulario y su rama ───────────────────────────────────────
grupo('El formulario de cuatro pasos, con la rama socio / invitado (v4.958)');
const schema = buildCompletedSchema(CONFIG);
// Cinco pasos DECLARADOS y cuatro RECORRIDOS: `cargo` e `invitado` son ramas
// excluyentes del mismo lugar. `visibles` es lo que el navegador pinta.
const visibles = (answers) => schema.steps.filter(st => isFieldVisible(st, answers)).map(st => st.key);
check('cinco pasos declarados: la rama vive en el esquema, no en la pantalla',
    JSON.stringify(schema.steps.map(s => s.key)) === JSON.stringify(['participante', 'cargo', 'invitado', 'evento', 'pago']),
    schema.steps.map(s => s.key).join(', '));
check('el socio recorre CUATRO pasos y ve el del cargo',
    JSON.stringify(visibles({ membershipType: 'socio_activo' }))
    === JSON.stringify(['participante', 'cargo', 'evento', 'pago']));
check('el invitado recorre CUATRO pasos y ve el suyo, nunca el del cargo',
    JSON.stringify(visibles({ membershipType: 'invitado' }))
    === JSON.stringify(['participante', 'invitado', 'evento', 'pago']));
check('con la respuesta en blanco YA se recorren cuatro: el contador no salta',
    visibles({}).length === 4 && visibles({}).includes('cargo'));

const paso1 = schema.steps[0].fields.map(f => f.key);
check('paso 1: nombre y apellido SEPARADOS, documento, email, teléfono, distrito, club y vínculo',
    JSON.stringify(paso1) === JSON.stringify([
        'firstName', 'lastName', 'documentNumber', 'email', 'phone',
        'district', 'clubName', 'membershipType']),
    paso1.join(', '));
check('el teléfono es tel (selector de país) y el correo es email',
    schema.steps[0].fields.find(f => f.key === 'phone').type === 'tel'
    && schema.steps[0].fields.find(f => f.key === 'email').type === 'email');
check('el vínculo ofrece DOS opciones: socio o invitado (v4.958)',
    JSON.stringify(MEMBERSHIP_OPTIONS.map(o => o.value)) === JSON.stringify(['socio_activo', 'invitado']),
    MEMBERSHIP_OPTIONS.map(o => o.value).join(', '));
check('la opción retirada se deja de OFRECER y se sigue ENTENDIENDO (regla v4.708)',
    membershipLabel('sin_club') === 'No pertenezco actualmente a un Club Rotario');
check('sin «sin_club», distrito y club ya no arrastran una condición muerta',
    !schema.steps[0].fields.find(f => f.key === 'district').requiredIf
    && !schema.steps[0].fields.find(f => f.key === 'clubName').requiredIf);

const paso2 = schema.steps[1];
check('paso 2: el rótulo lleva el período rotario',
    paso2.label.includes('2026-2027') && paso2.fields[0].label.includes('2026-2027'));
check('paso 2: cuatro cargos y «otro» despliega el campo condicional',
    paso2.fields[0].options.length === 4
    && JSON.stringify(paso2.fields[1].showIf) === JSON.stringify({ key: 'clubRole', in: ['otro_cargo'] }));
// v4.951 — del reporte con la captura del mapeo: la columna «Sí es invitado,
// seleccione una opción:» del archivo histórico no tenía destino porque la
// pregunta no existía en el formulario. Es un campo del ESQUEMA (no un extra
// del importador): así el formulario público lo pregunta, la ficha lo muestra
// y el mapeo lo ofrece solo — la prueba de que la lista es UNA (v4.950).
// v4.958 — el tipo de invitado, con el catálogo REAL del formulario de
// referencia: cuatro opciones y UNA sola marcable. Deja de ser el texto libre
// de v4.951, que se abrió así cuando sólo se conocía una respuesta.
const pasoInvitado = schema.steps[2];
const invitado = pasoInvitado.fields.find(f => f.key === 'guestType');
check('el paso del invitado tiene UNA pregunta, de opción única y obligatoria',
    pasoInvitado.fields.length === 1 && invitado.type === 'radio' && invitado.required === true
    && GUEST_TYPE_OPTIONS.length === 4);
check('las cuatro opciones son las del formulario de referencia',
    JSON.stringify(GUEST_TYPE_OPTIONS.map(o => o.label)) === JSON.stringify([
        'Soy Cónyuge de Past-Gobernador',
        'Soy cónyuge de socio activo',
        'No soy cónyuge de un socio activo, solo soy un invitado',
        'Soy familia de intercambistas']));
check('el rótulo se conserva letra por letra: es lo que mapea la columna histórica',
    invitado.label === 'Sí es invitado, seleccione una opción');
check('a un invitado NO se le exige el cargo, y a un socio NO se le exige el tipo de invitado',
    validateCompletedAnswers(CONFIG, {
        ...RESPUESTAS_VALIDAS, membershipType: 'invitado', clubRole: '', guestType: 'conyuge_socio_activo',
    }, CATALOGOS).ok
    && validateCompletedAnswers(CONFIG, { ...RESPUESTAS_VALIDAS, membershipType: 'socio_activo' }, CATALOGOS).ok);
check('un invitado SIN marcar su opción no pasa',
    Boolean(validateCompletedAnswers(CONFIG, {
        ...RESPUESTAS_VALIDAS, membershipType: 'invitado', guestType: '',
    }, CATALOGOS).errors.guestType));
check('el catálogo es CERRADO: un valor inventado se rechaza',
    Boolean(validateCompletedAnswers(CONFIG, {
        ...RESPUESTAS_VALIDAS, membershipType: 'invitado', guestType: 'lo que sea',
    }, CATALOGOS).errors.guestType));
check('guestTypeLabel cae al valor crudo: los textos libres de v4.951 se siguen leyendo',
    guestTypeLabel('conyuge_socio_activo') === 'Soy cónyuge de socio activo'
    && guestTypeLabel('Soy cónyuge de socio activo') === 'Soy cónyuge de socio activo');
check('el período es de la EDICIÓN: otro período reescribe los rótulos',
    buildCompletedSchema({ rolePeriod: '2027-2028' }).steps[1].fields[0].options
        .some(o => o.label.includes('2027-2028')));
check('clubRoleLabel resuelve el rótulo con su período',
    clubRoleLabel('presidente_electo', '2026-2027') === 'Presidente electo año Rotario 2026-2027');

const paso3 = schema.steps[3].fields.map(f => f.key);
check('paso 3: EPS, alergia y el contacto de emergencia con su teléfono',
    JSON.stringify(paso3) === JSON.stringify(['eps', 'foodAllergy', 'emergencyName', 'emergencyPhone'])
    && schema.steps[3].fields[3].type === 'tel');

const paso4 = schema.steps[4];
check('paso 4: método de pago, comprobante y comentarios opcionales',
    JSON.stringify(paso4.fields.map(f => f.key)) === JSON.stringify(['paymentMethod', 'receipt', 'comments'])
    && paso4.fields[2].required === false);
check('los tres métodos de pago del pedido',
    JSON.stringify(PAYMENT_METHODS.map(m => m.value)) === JSON.stringify(['pasarela_colrotarios', 'transferencia', 'otro']));
check('el comprobante es un campo de ARCHIVO y no entra a la validación de respuestas',
    paso4.fields[1].type === 'file'
    && !flattenCompletedFields(CONFIG).some(f => f.key === 'receipt'));

// ── 3. Obligatoriedad ────────────────────────────────────────────────
grupo('Distrito y club: obligatorios para los dos vínculos');
const distrito = schema.steps[0].fields.find(f => f.key === 'district');
check('con socio activo, el distrito es obligatorio',
    isCompletedFieldRequired(distrito, { membershipType: 'socio_activo' }) === true);
check('con invitado también', isCompletedFieldRequired(distrito, { membershipType: 'invitado' }) === true);

// ── 4. Validación ────────────────────────────────────────────────────
grupo('Validación del servidor');
check('las respuestas completas pasan',
    validateCompletedAnswers(CONFIG, RESPUESTAS_VALIDAS, CATALOGOS).ok === true,
    JSON.stringify(validateCompletedAnswers(CONFIG, RESPUESTAS_VALIDAS, CATALOGOS).errors));
{
    const vacio = validateCompletedAnswers(CONFIG, {}, CATALOGOS);
    check('el envío vacío marca cada obligatorio', !vacio.ok
        && ['firstName', 'lastName', 'documentNumber', 'email', 'phone', 'membershipType', 'clubRole', 'eps', 'paymentMethod']
            .every(k => vacio.errors[k]));
}
check('un correo inválido se rechaza',
    Boolean(validateCompletedAnswers(CONFIG, { ...RESPUESTAS_VALIDAS, email: 'no-es-correo' }, CATALOGOS).errors.email));
check('un teléfono de tres dígitos se rechaza',
    Boolean(validateCompletedAnswers(CONFIG, { ...RESPUESTAS_VALIDAS, phone: '123' }, CATALOGOS).errors.phone));
check('«otro cargo» exige decir cuál',
    Boolean(validateCompletedAnswers(CONFIG, { ...RESPUESTAS_VALIDAS, clubRole: 'otro_cargo' }, CATALOGOS).errors.clubRoleOther));
check('con el cargo dicho, pasa',
    validateCompletedAnswers(CONFIG, { ...RESPUESTAS_VALIDAS, clubRole: 'otro_cargo', clubRoleOther: 'Secretario' }, CATALOGOS).ok);
check('sin distrito ni club NO se pasa: los dos son obligatorios (v4.958)',
    Boolean(validateCompletedAnswers(CONFIG, {
        ...RESPUESTAS_VALIDAS, district: '', clubName: '',
    }, CATALOGOS).errors.district));
check('un método de pago inventado se rechaza (catálogo cerrado)',
    Boolean(validateCompletedAnswers(CONFIG, { ...RESPUESTAS_VALIDAS, paymentMethod: 'efectivo_magico' }, CATALOGOS).errors.paymentMethod));
check('un club que figura en OTRO distrito se rechaza (v4.706)',
    Boolean(validateCompletedAnswers(CONFIG, {
        ...RESPUESTAS_VALIDAS, district: '4281', clubName: 'Barranquilla',
    }, CATALOGOS).errors.clubName));
check('un club que no figura en ningún catálogo se ACEPTA: la lista ayuda, no cierra',
    validateCompletedAnswers(CONFIG, {
        ...RESPUESTAS_VALIDAS, clubName: 'Rotary Club Nuevo 2027',
    }, CATALOGOS).ok);

// ── 5. Catálogos del formulario ──────────────────────────────────────
grupo('Catálogos distrito → club');
const campoDistrito = schema.steps[0].fields.find(f => f.key === 'district');
const campoClub = schema.steps[0].fields.find(f => f.key === 'clubName');
check('el distrito SIEMPRE ofrece su lista (acá no se pregunta el país)',
    (completedOptionsFor(campoDistrito, {}, CATALOGOS) || []).length >= 2);
check('sin distrito elegido, el club es texto libre',
    completedOptionsFor(campoClub, {}, CATALOGOS) === null);
check('con el 4281 elegido, salen SUS clubes',
    (completedOptionsFor(campoClub, { district: '4281' }, CATALOGOS) || [])
        .some(o => o.value === 'Bogotá Multicentro'));
check('un distrito fuera del catálogo deja el club a mano',
    completedOptionsFor(campoClub, { district: 'District 6960' }, CATALOGOS) === null);
check('sin catálogo, el distrito también es texto libre',
    completedOptionsFor(campoDistrito, {}, {}) === null);

// ── 6. Comprobante ───────────────────────────────────────────────────
grupo('El comprobante aceptado');
check('PDF, JPG, PNG y WebP entran',
    ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
        .every(m => checkReceiptMeta({ contentType: m, size: 1024 }).ok));
check('un ejecutable no entra',
    !checkReceiptMeta({ contentType: 'application/x-msdownload', filename: 'virus.exe', size: 10 }).ok);
check('la extensión rescata un MIME vacío (comprobante.jpeg → jpg)',
    receiptExtensionFor('', 'comprobante.jpeg') === 'jpg'
    && receiptExtensionFor('application/octet-stream', 'pago.pdf') === 'pdf');
check('más de 10 MB se rechaza con el peso en el mensaje',
    checkReceiptMeta({ contentType: 'image/png', size: RECEIPT_MAX_BYTES + 1 }).errores.some(e => e.includes('10 MB')));
check('un archivo vacío se rechaza',
    !checkReceiptMeta({ contentType: 'image/png', size: 0 }).ok);
check('la clave del comprobante pertenece a SU evento',
    receiptKeyBelongs(`${RECEIPT_PREFIX}/evento-1/abc.pdf`, 'evento-1')
    && !receiptKeyBelongs(`${RECEIPT_PREFIX}/evento-2/abc.pdf`, 'evento-1')
    && !receiptKeyBelongs(`${RECEIPT_PREFIX}/evento-1/../evento-2/abc.pdf`, 'evento-1')
    && !receiptKeyBelongs('media/foto.png', 'evento-1'));

// ── 7. Configuración y código ────────────────────────────────────────
grupo('Configuración, slug y código');
check('el slug se normaliza (tildes, espacios, barra inicial)',
    normalizeCompletedSlug('/Inscripción Conferencia — 2027') === 'inscripcion-conferencia-2027');
check('las rutas del sitio están reservadas',
    ['admin', 'eventos', 'registro', 'aniversarios'].every(s => RESERVED_SLUGS.includes(s)));
check('la configuración nace APAGADA salvo decisión explícita',
    normalizeCompletedConfig({}).enabled === false
    && normalizeCompletedConfig({ enabled: true }).enabled === true);
check('el prefijo del código se limpia a mayúsculas',
    normalizeCompletedConfig({ codePrefix: 'cr4281-2027 ' }).codePrefix === 'CR4281-2027');
check('sin prefijo propio se deriva del de la edición, nunca queda anónimo',
    completedCodePrefixFor({}, { codePrefix: 'RPF13' }) === 'RPF13-C'
    && completedCodePrefixFor({ codePrefix: 'CR4281-2027' }, { codePrefix: 'RPF13' }) === 'CR4281-2027'
    && completedCodePrefixFor({}, {}) === 'REG-C');
check('el código tiene la forma CR4281-2027-XXXXX',
    /^CR4281-2027-[A-HJ-NP-Z2-9]{5}$/.test(buildCompletedCode('CR4281-2027')));

// ── 8. La semilla de la XIII Conferencia ─────────────────────────────
grupo('La semilla del slug pedido');
const SEED_SLUG = 'inscripcion-conferencia-distrital-villavicencio-2027';
const seed = seedForSlug(SEED_SLUG);
check('la URL pedida está sembrada, con su prefijo CR4281-2027 y encendida',
    Boolean(seed) && seed.config.codePrefix === 'CR4281-2027' && seed.config.enabled === true
    && seed.config.rolePeriod === '2026-2027');
check('un slug ajeno no tiene semilla', seedForSlug('otro-formulario') === null);
const EVENTO_XIII = { id: 'ev1', title: 'XIII Conferencia Rotaria del Distrito 4281 – Villavicencio 2027' };
check('el evento de la XIII Conferencia casa sin ambigüedad',
    matchSeedEvent(seed, [EVENTO_XIII, { id: 'ev2', title: 'XII Feria de Proyectos Valledupar 2027' }])?.id === 'ev1');
check('con DOS candidatos no se ata ninguno: la ambigüedad no se adivina',
    matchSeedEvent(seed, [EVENTO_XIII, { id: 'ev3', title: 'Pre Conferencia Villavicencio 2027' }]) === null);
check('sin candidatos tampoco', matchSeedEvent(seed, []) === null);
check('toda semilla usa un slug ya normalizado',
    COMPLETED_FORM_SEEDS.every(s => s.slug === normalizeCompletedSlug(s.slug)));

// ── 9. Duplicados ────────────────────────────────────────────────────
grupo('Duplicados: marcar y relacionar, nunca borrar');
const yo = { email: 'Yaneth@Example.com', documentNumber: '52111222' };
check('coincidencia por correo, sin distinguir mayúsculas',
    duplicateMatchKind({ email: 'yaneth@example.com', documentNumber: '999' }, yo) === 'correo');
check('por documento',
    duplicateMatchKind({ email: 'otra@example.com', documentNumber: '52111222' }, yo) === 'documento');
check('por las dos cosas',
    duplicateMatchKind({ email: 'yaneth@example.com', documentNumber: '52111222' }, yo) === 'correo y documento');
check('sin coincidencia no hay marca',
    duplicateMatchKind({ email: 'x@y.com', documentNumber: '1' }, yo) === null);
{
    const flags = buildDuplicateFlags({
        online: [{ id: 'a', registrationCode: 'RPF13-AAAAA', firstName: 'Yaneth', lastName: 'Solano', email: 'yaneth@example.com', documentNumber: '52111222', status: 'paid' }],
        completed: [{ id: 'b', registrationCode: 'CR4281-2027-BBBBB', firstName: 'Otra', email: 'x@y.com', documentNumber: '3', status: 'submitted' }],
    }, yo);
    check('el resumen marca el duplicado real y descarta el que no coincide',
        flags.hasDuplicates && flags.duplicates.length === 1
        && flags.duplicates[0].source === ONLINE_SOURCE && flags.duplicates[0].code === 'RPF13-AAAAA');
}
check('sin filas no hay alerta', buildDuplicateFlags({}, yo).hasDuplicates === false);

// ── 10. Los archivos dicen lo que las reglas prometen ────────────────
// ── La notificación de confirmación (v4.945) ─────────────────────────
grupo('El correo de confirmación: plantilla del evento, pura y sin sorpresas');
{
    const EVENTO = {
        title: 'XIII Conferencia Rotaria del Distrito 4281 – Villavicencio 2027',
        startDate: '2027-05-28', endDate: '2027-05-30',
        location: 'Villavicencio, Meta, Colombia',
    };
    check('las fechas salen en español, con partes UTC (rango del mismo mes)',
        formatEventDates('2027-05-28', '2027-05-30') === 'del 28 al 30 de mayo de 2027');
    check('un solo día se dice como un día',
        formatEventDates('2027-05-28', '2027-05-28') === 'el 28 de mayo de 2027'
        && formatEventDates('2027-05-28', null) === 'el 28 de mayo de 2027');
    check('un rango que cruza de mes lo dice entero',
        formatEventDates('2027-05-28', '2027-06-02') === 'del 28 de mayo al 2 de junio de 2027');
    check('sin fecha no se inventa ninguna', formatEventDates(null, null) === '');
    check('la ciudad es el primer tramo de la ubicación',
        eventPlaceOf('Villavicencio, Meta, Colombia') === 'Villavicencio');

    check('el asunto predeterminado se DERIVA del evento, no está escrito para uno',
        defaultNotifySubject(EVENTO) === `¡Tu inscripción está completa! | ${EVENTO.title}`
        && defaultNotifySubject({ title: 'Otra Asamblea 2028' }).includes('Otra Asamblea 2028'));
    check('una variable desconocida queda LITERAL, no un hueco vacío',
        resolveEmailVariables('Hola {{nombre_participante}} {{invento}}', { nombre_participante: 'Ana' })
        === 'Hola Ana {{invento}}');

    const CONFIG = normalizeCompletedConfig({ enabled: true, slug: 'x', headerImageUrl: 'https://cdn/cab.jpg' });
    const REG = { firstName: 'Ana <b>', lastName: 'Rojas', registrationCode: 'CR4281-2027-AB12C', email: 'a@b.co' };
    const correo = buildCompletedEmail({
        config: CONFIG, event: EVENTO, registration: REG,
        branding: { name: 'Distrito 4281', logoUrl: 'https://cdn/logo.png' },
    });
    check('la plantilla lleva cabecera configurada, nombre ESCAPADO, código y pie con la marca',
        correo.html.includes('https://cdn/cab.jpg')
        && correo.html.includes('Ana &lt;b&gt; Rojas') && !correo.html.includes('Ana <b> Rojas')
        && correo.html.includes('CR4281-2027-AB12C')
        && correo.html.includes('https://cdn/logo.png'));
    check('el CÓDIGO va en su propio bloque aunque el cuerpo editado no lo nombre',
        buildCompletedEmail({
            config: { ...CONFIG, notifyBody: 'Gracias por escribirnos.' },
            event: EVENTO, registration: REG, branding: null,
        }).html.includes('CR4281-2027-AB12C'));
    check('sin marca cargada no se dibuja ningún emblema: el pie queda en texto',
        !buildCompletedEmail({ config: CONFIG, event: EVENTO, registration: REG, branding: null })
            .html.includes('<img src="https://cdn/logo.png"'));
    // El texto plano NO escapa (no es HTML): se comprueba que no arrastre las
    // ETIQUETAS de la plantilla, no que no haya ningún «<» — el nombre del
    // participante puede traerlo y en texto va tal cual.
    check('la versión en texto plano existe y lleva el código, sin etiquetas de la plantilla',
        correo.text.includes('CR4281-2027-AB12C')
        && !correo.text.includes('<div') && !correo.text.includes('<p ') && !correo.text.includes('<img'));
    check('no afirma la validación del pago: confirma el REGISTRO del formulario',
        !/pago (validado|confirmado)/i.test(correo.html));
    // v4.947, del reporte con el correo real delante: la cabecera pegada a la
    // tarjeta se leía como un logo montado sobre el área del texto.
    check('la cabecera va SEPARADA de la tarjeta, con el mismo aire arriba y abajo',
        !correo.html.includes('16px 16px 0 0')
        && correo.html.includes('padding:0 0 26px')
        && correo.html.includes('padding:26px 12px'));
    check('sin cabecera no queda el hueco: la tarjeta abre el correo',
        !buildCompletedEmail({ config: { ...CONFIG, headerImageUrl: '' }, event: EVENTO, registration: REG, branding: null })
            .html.includes('padding:0 0 26px'));

    check('la notificación nace ENCENDIDA y una config guardada antes no la apaga',
        normalizeCompletedConfig({}).notifyEnabled === true
        && normalizeCompletedConfig({ notifyEnabled: false }).notifyEnabled === false);
}


// ── El motor de importación de inscripciones históricas (v4.950) ─────
grupo('Importación histórica: parseo, mapeo, normalización y duplicados');
{
    const FIELDS = importSpec.importFieldsFor({});
    check('los destinos del mapeo se DERIVAN del esquema del formulario (una sola lista)',
        FIELDS.some(f => f.key === 'eps') && FIELDS.some(f => f.key === 'emergencyPhone')
        && FIELDS.some(f => f.key === 'receiptUrl'));

    // Parseo: tab de Excel, CSV con ; y comillas, filas vacías fuera.
    const tsv = importSpec.parseImportText('NOMBRE\tCORREO\nAna\tana@x.co\n\nLuis\tluis@x.co', FIELDS);
    check('el pegado de Excel se parte por tabulación y descarta filas vacías',
        tsv.delimiter === '\t' && tsv.rows.length === 2 && tsv.emptyDropped === 1);
    const csv = importSpec.parseImportText('NOMBRE;CLUB\n"Pérez; Ana";"Club ""X"" ok"', FIELDS);
    check('el CSV con punto y coma respeta comillas y comillas dobladas',
        csv.delimiter === ';' && csv.rows[0][0] === 'Pérez; Ana' && csv.rows[0][1] === 'Club "X" ok');
    const sinCabecera = importSpec.parseImportText('Ana\tana@x.co\nLuis\tluis@x.co', FIELDS);
    check('sin encabezados reconocibles, la primera fila es un DATO y no se pierde',
        sinCabecera.headerDetected === false && sinCabecera.rows.length === 2
        && sinCabecera.headers[0] === 'Columna 1');

    // El mapeo automático por sinónimos — una sugerencia, nunca una imposición.
    const mapa = importSpec.autoMapColumns(
        ['CORREO ELECTRONICO', 'CELULAR', 'CLUB ROTARIO', 'FORMA_PAGO', 'CEDULA', 'ALGO RARO'], FIELDS);
    check('los sinónimos mapean: correo, celular, club, forma de pago y cédula',
        mapa[0] === 'email' && mapa[1] === 'phone' && mapa[2] === 'clubName'
        && mapa[3] === 'paymentMethod' && mapa[4] === 'documentNumber');
    check('una columna irreconocible queda SIN mapear (decide el administrador)', mapa[5] === null);

    // ── v4.959: la marca temporal del sistema anterior ───────────────
    const AHORA = new Date('2026-08-31T06:00:00Z');
    const fecha = (v) => importSpec.parseImportDate(v, { timeZone: 'America/Bogota', now: AHORA });
    check('«Marca temporal» es un destino del mapeo y se reconoce sola',
        importSpec.importFieldsFor({}).some(f => f.key === 'submittedAt')
        && importSpec.autoMapColumns(['Marca temporal'], importSpec.importFieldsFor({}))[0] === 'submittedAt');
    check('el orden es DÍA/MES, como el formulario de referencia',
        fecha('4/06/26 14:47')?.legible === '4 de junio de 2026, 14:47'
        && fecha('25/12/2025 09:05')?.legible === '25 de diciembre de 2025, 09:05');
    // ⚠️ La hora del archivo es hora de PARED: guardarla como UTC la correría
    // cinco horas y la ficha mostraría las 9:47.
    check('la hora se interpreta en la zona del evento, no en la del servidor',
        fecha('4/06/26 14:47')?.iso === '2026-06-04T19:47:00.000Z');
    check('una lectura ambigua se DECLARA ambigua (día y mes ≤ 12)',
        fecha('4/06/26 14:47')?.ambiguous === true && fecha('25/12/2025')?.ambiguous === false);
    check('el año de cuatro cifras no se parte en dos (la alternancia probaba $2 primero)',
        fecha('25/12/2025 09:05')?.year === 2025);
    check('ISO y 12 horas también se leen',
        fecha('2026-06-04 14:47')?.iso === '2026-06-04T19:47:00.000Z'
        && fecha('4/06/2026 2:47:00 p. m.')?.iso === '2026-06-04T19:47:00.000Z');
    check('una fecha imposible, futura o ilegible NO se inventa: devuelve null',
        fecha('31/02/26') === null && fecha('13/13/26') === null
        && fecha('4/06/40 10:00') === null && fecha('ayer') === null && fecha('') === null);
    const conFecha = importSpec.assembleRow(['Marca temporal'], ['4/06/26 14:47'],
        { 0: 'submittedAt' }, importSpec.importFieldsFor({}),
        { timeZone: 'America/Bogota', now: AHORA });
    check('la fila lleva su fecha y ANOTA cómo se leyó',
        conFecha.submittedAt === '2026-06-04T19:47:00.000Z'
        && conFecha.notes.some(n => n.includes('4 de junio de 2026') && n.includes('día/mes')));
    const sinFecha = importSpec.assembleRow(['Marca temporal'], ['ayer'],
        { 0: 'submittedAt' }, importSpec.importFieldsFor({}), {});
    check('una marca temporal ilegible no bloquea ni se inventa: queda como dato adicional',
        sinFecha.submittedAt === null && sinFecha.extra['Marca temporal'] === 'ayer'
        && sinFecha.notes.some(n => n.includes('fecha de la importación')));

    // v4.958 — el tipo de invitado ya es catálogo cerrado, y eso NO puede
    // costarle la importación a nadie: el rótulo del sistema anterior se casa
    // con su clave, y lo que no case se conserva como dato adicional.
    const FIELDS958 = importSpec.importFieldsFor(CONFIG);
    const filaInv = importSpec.assembleRow(
        ['VINCULO', 'INVITADO'], ['Soy invitado', 'Soy cónyuge de socio activo'],
        { 0: 'membershipType', 1: 'guestType' }, FIELDS958, {});
    check('el rótulo histórico del tipo de invitado se casa con su clave y SE ANOTA',
        filaInv.answers.guestType === 'conyuge_socio_activo'
        && filaInv.notes.some(n => n.includes('Soy cónyuge de socio activo')),
        JSON.stringify(filaInv.answers));
    const filaRara = importSpec.assembleRow(
        ['VINCULO', 'INVITADO'], ['Soy invitado', 'Vengo con la delegación'],
        { 0: 'membershipType', 1: 'guestType' }, FIELDS958, {});
    check('un tipo de invitado sin equivalente NO bloquea la fila: queda como dato adicional',
        !filaRara.answers.guestType
        && filaRara.extra['Tipo de invitado (sin equivalente)'] === 'Vengo con la delegación'
        && filaRara.notes.some(n => n.includes('sin equivalente')));
    const filaSocio = importSpec.assembleRow(
        ['VINCULO', 'INVITADO'], ['Soy socio activo del Club', 'Soy cónyuge de socio activo'],
        { 0: 'membershipType', 1: 'guestType' }, FIELDS958, {});
    check('un tipo de invitado en una fila que NO es invitado se conserva aparte, no se guarda',
        filaSocio.answers.membershipType === 'socio_activo' && !filaSocio.answers.guestType
        && Boolean(filaSocio.extra['Tipo de invitado (el vínculo no es «invitado»)']));

    // v4.951 — el destino que faltaba. Como los destinos se DERIVAN del
    // esquema, agregar la pregunta al formulario lo hizo aparecer solo: esta
    // prueba fija esa cadena entera con el encabezado EXACTO del reporte.
    check('el tipo de invitado es un destino del mapeo (derivado del esquema, no una segunda lista)',
        FIELDS.some(f => f.key === 'guestType'));
    check('la columna «Sí es invitado, seleccione una opción:» se mapea sola',
        importSpec.autoMapColumns(['Sí es invitado, seleccione una opción:'], FIELDS)[0] === 'guestType');

    // Normalizaciones anotadas, nunca silenciosas.
    check('«Distrito 4281», «D4281» y «4281» → 4281',
        ['Distrito 4281', 'D4281', '4281'].every(v => importSpec.normalizeDistrictValue(v) === '4281'));
    check('«Consignación» → transferencia y «COLROTARIOS» → pasarela',
        importSpec.normalizePaymentMethod('Consignación Bancolombia') === 'transferencia'
        && importSpec.normalizePaymentMethod('Pasarela COLROTARIOS') === 'pasarela_colrotarios');
    const headers = ['CARGO', 'PAGO', 'COMPROBANTE'];
    const fila = importSpec.assembleRow(headers, ['Tesorero', '', 'no-es-url'],
        { 0: 'clubRole', 1: 'paymentMethod', 2: 'receiptUrl' }, FIELDS,
        { defaultPaymentMethod: 'transferencia' });
    check('un cargo sin equivalente NO se descarta: cae a «Otro cargo» con el texto original',
        fila.answers.clubRole === 'otro_cargo' && fila.answers.clubRoleOther === 'Tesorero'
        && fila.notes.some(n => n.includes('Tesorero')));
    check('el método de pago del lote rellena el vacío y SE ANOTA',
        fila.answers.paymentMethod === 'transferencia' && fila.notes.some(n => n.includes('lote')));
    check('un comprobante que no es URL no se inventa: queda como dato adicional',
        !fila.receiptUrl && fila.extra.COMPROBANTE === 'no-es-url');

    // Duplicados: documento/correo confirman; teléfono/nombre sugieren; el
    // propio archivo también cuenta.
    const existentes = [
        { id: 'e1', firstName: 'Ana', lastName: 'Rojas', email: 'ana@x.co', documentNumber: '111', phone: '3001112233', source: 'online_registration' },
    ];
    check('mismo documento = duplicado CONFIRMADO',
        importSpec.classifyDuplicate({ documentNumber: '111', email: 'otra@x.co' }, existentes).kind === 'confirmado');
    check('mismo teléfono = POSIBLE, no confirmado',
        importSpec.classifyDuplicate({ email: 'z@x.co', phone: '300 111 2233' }, existentes).kind === 'posible');
    check('mismo nombre y apellido = POSIBLE',
        importSpec.classifyDuplicate({ firstName: 'ana', lastName: 'ROJAS', email: 'q@x.co' }, existentes).kind === 'posible');
    const seen = importSpec.newSeen();
    importSpec.rememberRow(seen, { documentNumber: '222', email: 'b@x.co', firstName: 'B', lastName: 'B' }, 1);
    check('un documento repetido DENTRO del archivo también confirma, nombrando la fila',
        importSpec.classifyDuplicate({ documentNumber: '222' }, [], seen).matches.some(m => /fila 1/.test(m.reason)));

    // Decisiones legales y estado inicial acotado.
    // ⚠️ v4.962 — Un duplicado se puede importar, omitir o usar para completar
    // al existente; las TRES son elegibles, también para uno confirmado. Sin
    // «nuevo» en la lista del confirmado, la decisión por defecto de la política
    // del evento no estaría entre sus opciones.
    check('un duplicado admite las tres decisiones, confirmado o posible',
        ['nuevo', 'omitir', 'completar'].every(d =>
            importSpec.legalDecisionsFor({ errors: {}, duplicate: { kind: 'confirmado' } }).includes(d)
            && importSpec.legalDecisionsFor({ errors: {}, duplicate: { kind: 'posible' } }).includes(d)));
    check('la política por defecto del evento es IMPORTAR el duplicado (marcado)',
        importSpec.DEFAULT_DUPLICATE_POLICY === 'importar'
        && importSpec.defaultDecisionFor({ errors: {}, duplicate: { kind: 'posible' } }) === 'nuevo'
        && importSpec.defaultDecisionFor({ errors: {}, duplicate: { kind: 'confirmado' } }) === 'nuevo');
    check('…y la política de omitir sigue disponible y manda cuando se pide',
        importSpec.defaultDecisionFor({ errors: {}, duplicate: { kind: 'confirmado' } }, { duplicatePolicy: 'omitir' }) === 'omitir'
        && importSpec.defaultDecisionFor({ errors: {}, duplicate: { kind: 'posible' } }, { duplicatePolicy: 'omitir' }) === 'omitir');
    check('una política desconocida cae en la del evento, no en cualquier cosa',
        importSpec.defaultDecisionFor({ errors: {}, duplicate: { kind: 'posible' } }, { duplicatePolicy: 'lo-que-sea' }) === 'nuevo'
        && !importSpec.isDuplicatePolicy('lo-que-sea') && importSpec.isDuplicatePolicy('omitir'));
    check('la fila sin persona NO se importa, política de duplicados aparte',
        importSpec.defaultDecisionFor({ errors: { __identidad: 'x' }, duplicate: { kind: 'posible' } }) === 'omitir'
        && importSpec.defaultDecisionFor({ errors: { __identidad: 'x' }, duplicate: { kind: 'nuevo' } }, { duplicatePolicy: 'omitir' }) === 'omitir');
    check('una fila nueva se importa con cualquiera de las dos políticas',
        importSpec.defaultDecisionFor({ errors: {}, duplicate: { kind: 'nuevo' } }) === 'importar'
        && importSpec.defaultDecisionFor({ errors: {}, duplicate: { kind: 'nuevo' } }, { duplicatePolicy: 'omitir' }) === 'importar');
    check('el estado inicial del lote está ACOTADO: pago confirmado y rechazado no entran',
        importSpec.isAllowedInitialStatus('submitted') && importSpec.isAllowedInitialStatus('validated')
        && !importSpec.isAllowedInitialStatus('payment_confirmed') && !importSpec.isAllowedInitialStatus('rejected'));
    check('el resumen del lote cuenta cada clase una sola vez',
        JSON.stringify(importSpec.buildImportSummary([
            { errors: {}, duplicate: { kind: 'nuevo' } },
            { errors: { __identidad: 'x' }, duplicate: { kind: 'nuevo' } },
            { errors: {}, duplicate: { kind: 'posible' }, clubSuggestion: 'Bogotá' },
        ])) === JSON.stringify({
            total: 3, listas: 1, conErrores: 1, posiblesDuplicados: 1,
            duplicadosConfirmados: 0, revisionClub: 1, conAvisos: 0, importables: 2,
        }));
    // `importables` responde «¿cuántos se van a crear?», así que sigue a la
    // política; las demás cifras son la CLASIFICACIÓN y no se mueven con ella.
    check('con la política de omitir, el duplicado deja de contar como importable',
        importSpec.buildImportSummary([
            { errors: {}, duplicate: { kind: 'nuevo' } },
            { errors: {}, duplicate: { kind: 'posible' } },
        ], { duplicatePolicy: 'omitir' }).importables === 1
        && importSpec.buildImportSummary([
            { errors: {}, duplicate: { kind: 'nuevo' } },
            { errors: {}, duplicate: { kind: 'posible' } },
        ]).importables === 2);
}

grupo('v4.960 — La importación no exige campos, sólo que la fila sea de alguien');
{
    // ── El parser: un salto de línea DENTRO de una celda NO fabrica filas ──
    const campos = [
        { key: 'firstName', label: 'Nombre' },
        { key: 'lastName', label: 'Apellido' },
        { key: 'email', label: 'Correo' },
    ];
    const conSalto = 'Nombre,Apellido,Correo,Observación\n'
        + 'Ana,Pérez,a@b.com,"primer renglón\nsegundo renglón"\n'
        + 'Luis,Gómez,l@g.com,ok\n';
    const p1 = importSpec.parseImportText(conSalto, campos);
    check('un salto de línea dentro de una celda entrecomillada NO inventa una fila',
        p1.rows.length === 2 && p1.headerDetected);
    check('el salto se conserva DENTRO de la celda, no parte el registro',
        p1.rows[0][3] === 'primer renglón\nsegundo renglón');
    check('la fila siguiente al salto conserva su alineación de columnas',
        p1.rows[1][0] === 'Luis' && p1.rows[1][2] === 'l@g.com');

    // Una comilla suelta en un texto libre NO puede fundir el archivo entero.
    const comillaSuelta = 'Nombre,Apellido\nAna,"Pérez\nLuis,Gómez\n';
    const p2 = importSpec.parseImportText(comillaSuelta, campos);
    check('con una comilla sin cerrar se vuelve al parseo por líneas y se DICE',
        p2.unterminatedQuote === true && p2.rows.length === 2);

    check('sin comillas el resultado es el de siempre',
        JSON.stringify(importSpec.parseImportText('Nombre,Apellido\nAna,Pérez\n', campos).rows)
        === JSON.stringify([['Ana', 'Pérez']]));

    // ── El piso: la fila tiene que identificar a una persona ──
    check('un nombre alcanza para identificar a la persona',
        importSpec.identifiesPerson({ firstName: 'Ana' }));
    check('un documento alcanza, aunque no venga el nombre',
        importSpec.identifiesPerson({ documentNumber: '123' }));
    check('un correo alcanza',
        importSpec.identifiesPerson({ email: 'a@b.com' }));
    check('un distrito y un club NO identifican a nadie',
        !importSpec.identifiesPerson({ district: '4281', clubName: 'Bogotá' }));
    check('una fila vacía no identifica a nadie',
        !importSpec.identifiesPerson({}));

    // ── El reparto: lo que falta AVISA, no bloquea ──
    const conNombre = importSpec.splitImportFindings(
        { email: 'Correo es obligatorio.', clubRole: 'Cargo es obligatorio.' },
        { firstName: 'Ana', lastName: 'Pérez' },
    );
    check('faltarle campos a una fila con nombre NO impide importarla',
        Object.keys(conNombre.errores).length === 0);
    check('lo que falta viaja como aviso, con su texto',
        conNombre.avisos.email === 'Correo es obligatorio.'
        && Object.keys(conNombre.avisos).length === 2);
    const sinNadie = importSpec.splitImportFindings({ firstName: 'x' }, { district: '4281' });
    check('una fila que no identifica a nadie SÍ bloquea, y dice por qué',
        Boolean(sinNadie.errores.__identidad));

    check('una fila con avisos se puede IMPORTAR y además editar',
        JSON.stringify(importSpec.legalDecisionsFor({ errors: {}, avisos: { email: 'x' }, duplicate: { kind: 'nuevo' } }))
        === JSON.stringify(['importar', 'omitir', 'editar']));
    check('y su decisión por defecto es importar, no omitir',
        importSpec.defaultDecisionFor({ errors: {}, avisos: { email: 'x' }, duplicate: { kind: 'nuevo' } }) === 'importar');
    check('la fila sin persona sigue omitiéndose por defecto',
        importSpec.defaultDecisionFor({ errors: { __identidad: 'x' }, duplicate: { kind: 'nuevo' } }) === 'omitir');
    // v4.962 — el duplicado ya no se omite por defecto (decisión del evento),
    // pero la fila sin persona sigue bloqueando pase lo que pase con ellos.
    check('la puerta de la identidad no se movió con la de los duplicados',
        importSpec.defaultDecisionFor({ errors: { __identidad: 'x' }, avisos: {}, duplicate: { kind: 'confirmado' } }) === 'omitir'
        && JSON.stringify(importSpec.legalDecisionsFor({ errors: { __identidad: 'x' }, duplicate: { kind: 'nuevo' } }))
           === JSON.stringify(['omitir', 'editar']));

    const resumen = importSpec.buildImportSummary([
        { errors: {}, avisos: {}, duplicate: { kind: 'nuevo' } },
        { errors: {}, avisos: { email: 'x' }, duplicate: { kind: 'nuevo' } },
        { errors: { __identidad: 'x' }, avisos: {}, duplicate: { kind: 'nuevo' } },
    ]);
    check('el resumen separa «con avisos» de «con errores»',
        resumen.conAvisos === 1 && resumen.conErrores === 1 && resumen.listas === 2);
    check('y dice cuántas se van a importar de verdad',
        resumen.importables === 2);

    // ── Un catálogo cerrado no le cuesta la fila a nadie ──
    const campos2 = [
        { key: 'membershipType', label: 'Vínculo', type: 'select', options: [{ value: 'socio_activo', label: 'Socio activo del club' }] },
        { key: 'firstName', label: 'Nombre' },
    ];
    const armada = importSpec.assembleRow(
        ['Nombre', 'Vínculo'], ['Ana', 'Amigo de Rotary'],
        { 0: 'firstName', 1: 'membershipType' }, campos2, {},
    );
    // ⚠️ El formulario PÚBLICO no se aflojó: la distinción es de momento, no
    // de rigor. Ahí sí hay alguien que puede llenar los campos.
    const vacio = validateCompletedAnswers(CONFIG, {}, {});
    check('el formulario público SIGUE exigiendo sus campos (v4.960 no lo tocó)',
        vacio.ok === false && Object.keys(vacio.errors).length >= 5);
    check('y el aviso de la importación sale del MISMO veredicto, no de otro criterio',
        JSON.stringify(importSpec.splitImportFindings(vacio.errors, { firstName: 'Ana' }).avisos)
        === JSON.stringify(vacio.errors));

    check('un vínculo sin equivalente NO se guarda crudo en su columna',
        armada.answers.membershipType === undefined);
    check('se conserva como dato adicional y se anota',
        Object.values(armada.extra).includes('Amigo de Rotary')
        && armada.notes.some(n => n.includes('sin equivalente')));
}
grupo('Comprobaciones sobre los archivos (lo que ninguna otra prueba ve)');
const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
{
    const ensure = leer('server/lib/ensureEventRegistrationSchema.js');
    check('la tabla está en OWNED_TABLES del ensure (sin esto el DDL no corre en producción)',
        /OWNED_TABLES\s*=\s*\[[^\]]*'EventCompletedRegistration'/s.test(ensure));
    check('el ensure crea la tabla y su índice único del código',
        ensure.includes('CREATE TABLE IF NOT EXISTS "EventCompletedRegistration"')
        && ensure.includes('EventCompletedRegistration_code_uniq'));
}
{
    const adminCtrl = leer('server/controllers/eventRegistrationAdminController.js');
    check('saveEdition parte de lo GUARDADO: guardar la edición no borra completedForm',
        /\.\.\.current\.settings/.test(adminCtrl));
    check('clonar una edición NO clona el slug (la URL es única en la plataforma)',
        /completedForm.*slug:\s*''/s.test(adminCtrl));
    check('la búsqueda de acreditación trae los completados en una clave ADITIVA',
        adminCtrl.includes('completed: completedResults'));
}
{
    const store = leer('server/lib/completedRegistrationStore.js');
    check('el envío SIEMPRE nace en submitted: el insert no acepta otro estado',
        /'submitted',\s*COMPLETED_SOURCE/.test(store));
    check('la clave de S3 del comprobante NO viaja al navegador',
        !/receiptKey:\s*row\.receiptKey/.test(store) && store.includes('hasReceipt: Boolean(row.receiptKey)'));
}
{
    const app = leer('src/App.tsx');
    check('la URL pedida está registrada EXACTA en App.tsx',
        app.includes('path="/inscripcion-conferencia-distrital-villavicencio-2027"'));
}
{
    const tab = leer('src/components/admin/events/EventRegistrationTab.tsx');
    const orden = ['inscripciones', 'completadas', 'acreditacion']
        .map(k => tab.indexOf(`key: '${k}'`));
    check('la pestaña va ENTRE «Inscripciones» y «Acreditación»',
        orden[0] > -1 && orden[0] < orden[1] && orden[1] < orden[2]);
    check('el rótulo es «Inscripciones completadas»', tab.includes(`label: 'Inscripciones completadas'`));
}
{
    const publicCtrl = leer('server/controllers/completedRegistrationController.js');
    check('la respuesta pública NO expone los duplicados: son trabajo del panel',
        !/res\.status\(201\)\.json\(\{[^}]*duplicates/s.test(publicCtrl)
        && !/res\.status\(201\)\.json\(\{[^}]*flags/s.test(publicCtrl));

    // v4.944 — el 500 del estreno («No se pudo cargar el formulario», con
    // captura). La LECTURA no puede depender de la comprobación del esquema, y
    // un fallo real dice su causa. El comportamiento lo prueba el grupo 0 de
    // `test:completed:path`; esto fija que la defensa no se quite por descuido.
    check('el ensure de requireForm está envuelto en try: un tropiezo no tumba la lectura',
        /try\s*\{\s*await ensureEventRegistrationSchema\(\);\s*\}/.test(publicCtrl));
    check('los tres 500 públicos llevan el motivo textual en `detail`',
        (publicCtrl.match(/res\.status\(500\)\.json\(\{[^}]*detail:\s*error\?\.message/g) || []).length === 3);

    const store = leer('server/lib/completedRegistrationStore.js');
    check('el ensure de la resolución por slug también está envuelto en try',
        /try\s*\{\s*await ensureEventRegistrationSchema\(\);\s*\}/.test(store));
    check('la semilla AVISA también con cero candidatos (el título que no coincide se ve en el log)',
        /candidato\(s\)/.test(store));
    // v4.947: el pie del correo lleva el logotipo del ENCABEZADO del sitio,
    // con footerLogo de respaldo — no al revés.
    check('el pie del correo prefiere el logo del encabezado del sitio (logo || footerLogo)',
        /logoUrl:\s*club\.logo \|\| club\.footerLogo/.test(store));
}
{
    const pagina = leer('src/pages/CompletarInscripcion.tsx');
    check('el GET del formulario reintenta UNA vez ante un 5xx o un fallo de red',
        /intento === 0/.test(pagina) && /cargar\(1\)/.test(pagina));
    check('la pantalla muestra el `detail` del servidor cuando llega',
        /data\?\.detail/.test(pagina));

    // v4.946 — del reporte «Unexpected token '<', "<!DOCTYPE"» al subir el
    // comprobante: NINGÚN fetch del formulario asume que la respuesta es JSON.
    // La única llamada directa a .json() que queda es la del GET de la
    // configuración, y va DENTRO de su try; el resto pasa por leerJson.
    check('ningún fetch del formulario llama .json() a ciegas',
        (pagina.match(/await \w+\.json\(\)/g) || []).length === 1
        && /try \{ data = await r\.json\(\); \} catch/.test(pagina));
    check('la prefirma del comprobante reintenta UNA vez ante HTML o 5xx',
        /prefirmar\(\)/.test(pagina) && /res\.status >= 500/.test(pagina));
    check('una respuesta que no es JSON se DICE con HTTP, tipo y fragmento',
        /describirNoJson/.test(pagina) && /en vez de JSON/.test(pagina));
    check('el fallo del PUT a S3 dice el estado HTTP del almacenamiento',
        /HTTP \$\{put\.status\}/.test(pagina));
}
{
    // v4.945 — la notificación. Lo que ninguna prueba de comportamiento ve:
    const ensure = leer('server/lib/ensureEventRegistrationSchema.js');
    check('providerId tiene su ADD COLUMN y está ENUMERADO en el atajo (la trampa de v4.908)',
        /ADD COLUMN IF NOT EXISTS "providerId"/.test(ensure.replace(/addColumn\('EventRegistrationMessage', 'providerId'/, 'ADD COLUMN IF NOT EXISTS "providerId"'))
        && /OWNED_MESSAGE_COLUMNS = \['providerId'\]/.test(ensure)
        && /OWNED_MESSAGE_COLUMNS\]/.test(ensure));

    const publicCtrl = leer('server/controllers/completedRegistrationController.js');
    check('el envío comprueba el éxito REAL del proveedor (sendPlatformEmail nunca lanza)',
        (publicCtrl.match(/salida\.success === false/g) || []).length >= 2);
    check('el envío automático pasa por el candado de idempotencia',
        /hasSentMessage\(registration\.id, 'completed_confirmation'\)/.test(publicCtrl)
        && /\{ auto: true \}/.test(publicCtrl));

    const rutas = leer('server/routes/event-registrations.js');
    check('las rutas de vista previa y prueba van ANTES de /admin/completed/:id',
        rutas.indexOf('notification-preview') > -1
        && rutas.indexOf('notification-preview') < rutas.indexOf("'/admin/completed/:id'"));

    const stub = leer('scripts/fixtures/email-completed-stub.mjs');
    check('el doble del correo devuelve LA MISMA FORMA que el servicio real (v4.901)',
        /success: true, messageId/.test(stub) && /success: false, error/.test(stub));

    // v4.950 — el motor de importación.
    check('las columnas del motor están ENUMERADAS en el atajo del ensure (trampa v4.908)',
        /OWNED_COMPLETED_COLUMNS = \['importBatchId', 'importMeta', 'guestType'\]/.test(ensure)
        && /OWNED_COMPLETED_COLUMNS\]/.test(ensure)
        && /'EventImportBatch',/.test(ensure)
        && /addColumn\('EventCompletedRegistration', 'importBatchId'/.test(ensure));
    const importStore = leer('server/lib/completedImportStore.js');
    check('el registro importado declara su origen y viaja con su lote',
        /IMPORT_SOURCE/.test(importStore) && /"importBatchId", "importMeta"/.test(importStore));
    check('«completar» sólo escribe sobre VACÍO: el WHERE lo exige, no la pantalla',
        /IS NULL OR "\$\{col\}" = ''\)/.test(importStore));
    // v4.951 — la columna nueva la conocen los TRES caminos de escritura.
    check('guestType viaja en su columna: insert público, insert importado y «completar»',
        /"guestType"/.test(leer('server/lib/completedRegistrationStore.js'))
        && /"guestType"/.test(importStore)
        && /'clubRoleOther', 'guestType', 'eps'/.test(importStore));
    check('el formulario público sigue fijando su estado: el insert de siempre no cambió',
        /'submitted', COMPLETED_SOURCE,/.test(leer('server/lib/completedRegistrationStore.js')));
    const rutasImport = leer('server/routes/event-registrations.js');
    check('las rutas del motor van ANTES de /admin/completed/:id y con su json de 10 MB',
        rutasImport.indexOf("'/admin/completed/import/inspect'") > -1
        && rutasImport.indexOf("'/admin/completed/import/inspect'") < rutasImport.indexOf("'/admin/completed/:id'")
        && /jsonBig = express\.json\(\{ limit: '10mb' \}\)/.test(rutasImport));
    const wizard = leer('src/components/admin/events/EventImportWizard.tsx');
    check('el CSV de errores sale con BOM y punto y coma (regla v4.850)',
        /Fila;Campo;Valor;Problema/.test(wizard) && wizard.includes('\uFEFF'));
    check('la confirmación DICE qué va a pasar y que no sale ningún correo',
        /No se envía ningún correo/.test(wizard));
    const tabRegImport = leer('src/components/admin/events/EventRegistrationTab.tsx');
    check('«Importar inscripciones» vive en Registro, junto a Acreditación',
        /key: 'importar', label: 'Importar inscripciones'/.test(tabRegImport)
        && /contenido === 'importar'/.test(tabRegImport));

    // v4.959 — el filtro de fechas mira la MISMA fecha que pinta la columna.
    const adminCtrl959 = leer('server/controllers/completedRegistrationAdminController.js');
    check('«Desde/Hasta» filtra por la fecha que se MUESTRA, no por la de la importación',
        (adminCtrl959.match(/COALESCE\("submittedAt", "createdAt"\)/g) || []).length === 2);
    check('la zona horaria de la marca temporal sale de la EDICIÓN, no de una constante',
        /timeZone: clean\(edition\?\.timezone, 60\) \|\| 'America\/Bogota'/.test(adminCtrl959));
    const importStore959 = leer('server/lib/completedImportStore.js');
    check('el INSERT usa la fecha del archivo y cae a la de la importación cuando no hay',
        /COALESCE\(\$26::timestamptz, NOW\(\)\)/.test(importStore959));

    // v4.958 — la rama en la pantalla y en el panel.
    const formPub = leer('src/pages/CompletarInscripcion.tsx');
    check('el formulario público recorre los pasos VISIBLES, no todos',
        /\.filter\(step => isCompletedFieldVisible\(step, answers\)\)/.test(formPub));
    const adminCtrl958 = leer('server/controllers/completedRegistrationAdminController.js');
    check('el panel recibe el catálogo del invitado y los rótulos retirados',
        /guestTypes: GUEST_TYPE_OPTIONS/.test(adminCtrl958)
        && /retiredMembership: RETIRED_MEMBERSHIP_LABELS/.test(adminCtrl958));
    check('la exportación escribe el RÓTULO del tipo de invitado, no su clave',
        /guestTypeLabel\(r\.guestType\)/.test(adminCtrl958));
    const wizard958 = leer('src/components/admin/events/EventImportWizard.tsx');
    // ⚠️ v4.963 — La política de duplicados es GLOBAL y se aplica AL CAMBIARLA:
    // escribirla en el estado y esperar a que alguien pulse «Revalidar» era
    // prometer en un comentario algo que el código no hacía, y además las
    // decisiones anteriores la habrían anulado.
    check('cambiar la política de duplicados revalida y reinicia las decisiones',
        /cambiarPoliticaDeDuplicados/.test(wizard)
        && /cambiarPoliticaDeDuplicados\(e\.target\.value/.test(wizard)
        && /reiniciarDecisiones: true, policy: valor/.test(wizard));
    check('una revalidación normal CONSERVA lo que el usuario eligió fila por fila',
        /opciones\.reiniciarDecisiones \? r\.defaultDecision : \(decisiones\[r\.n\] \|\| r\.defaultDecision\)/.test(wizard));
    check('el KPI dice cuántos se van a CREAR, no la clasificación sin duplicados',
        /'Se van a crear', pre\.summary\.importables/.test(wizard)
        && !/'Listas para importar', pre\.summary\.listas/.test(wizard));

    check('corregir una fila con catálogo cerrado se hace ELIGIENDO, no tecleando la clave',
        /f\.options && f\.options\.length \? \(/.test(wizard958));

    // v4.952 — las acciones en bloque. Lo que ninguna prueba de camino ve:
    check('las tres rutas del bloque van ANTES de /admin/completed/:id',
        ['bulk-status', 'bulk-edit', 'bulk-delete'].every(p =>
            rutasImport.indexOf(`'/admin/completed/${p}'`) > -1
            && rutasImport.indexOf(`'/admin/completed/${p}'`) < rutasImport.indexOf("'/admin/completed/:id'")));
    const managerTsx = leer('src/components/admin/events/EventCompletedRegistrationsManager.tsx');
    check('cada casilla lleva el NOMBRE en su etiqueta accesible (lección v4.740)',
        managerTsx.includes('aria-label={`Seleccionar: ${rowName(r)}`}'));
    check('la selección guarda las filas ENTERAS: sobrevive a filtros y páginas (v4.886)',
        /useState<Map<string, CompletedRow>>/.test(managerTsx));
    check('la confirmación del borrado DICE la consecuencia y la excepción del acreditado',
        /no se puede deshacer/.test(managerTsx) && /acreditado/.test(managerTsx));
}
{
    // v4.949 — La navegación del evento: «Inscripciones» e «Inscripciones
    // COLROTARIOS» son pestañas PRINCIPALES, el evento abre en la primera, y
    // Registro se queda con la configuración. Nada de esto lo ve otra prueba.
    const eventos = leer('src/pages/admin/Events.tsx');
    const barra = eventos.match(/\[(?:'[a-z]+', )+'registro'\] as const/)?.[0] || '';
    check('la barra del evento va: inscripciones, completadas, info, …, registro',
        barra.startsWith("['inscripciones', 'completadas', 'info',"));
    check('el evento ABRE en Inscripciones, no en Información',
        /activeTab\[id\] \|\| 'inscripciones'/.test(eventos));
    check('el rótulo visible es «Inscripciones COLROTARIOS» (la clave interna no cambia)',
        eventos.includes('Inscripciones COLROTARIOS')
        && /completadas: '[^']*Inscripciones COLROTARIOS'/.test(eventos));
    check('la barra desplaza en horizontal dentro de sí misma (overflow-x-auto + shrink-0)',
        /flex overflow-x-auto border-b/.test(eventos) && /shrink-0 whitespace-nowrap px-5/.test(eventos));
    check('las pestañas nuevas montan el MISMO contenedor con `view`, sin duplicar componentes',
        /view="inscripciones"/.test(eventos) && /view="completadas"/.test(eventos)
        && !eventos.includes('EventCompletedRegistrationsManager')
        && !eventos.includes('EventRegistrationsManager'));

    const tabReg = leer('src/components/admin/events/EventRegistrationTab.tsx');
    check('la sub-navegación de Registro ya NO ofrece las dos promovidas',
        /REGISTRO_PANES = PANES\.filter\(p => p\.key !== 'inscripciones' && p\.key !== 'completadas'\)/.test(tabReg)
        && /\{REGISTRO_PANES\.map\(/.test(tabReg));
    check('la vista dedicada fija su contenido y esconde las sub-pestañas',
        /contenido: Pane = view === 'registro' \? pane : view/.test(tabReg)
        && /view === 'registro' && \(/.test(tabReg));
}

// ── 11. Paridad con el espejo del navegador ──────────────────────────
grupo('El espejo del navegador dice lo mismo (pide esbuild; se salta si falta)');
let esbuild = null;
try { esbuild = await import('esbuild'); } catch { /* sin esbuild */ }
if (!esbuild) {
    console.log('  … esbuild no está: bloque saltado (npm i --no-save esbuild)');
} else {
    const { outputFiles } = await esbuild.build({
        entryPoints: [new URL('../src/lib/completedRegistrationSpec.ts', import.meta.url).pathname],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
    });
    const mod = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);

    check('los estados del espejo son los del servidor',
        JSON.stringify(Object.keys(mod.COMPLETED_STATUS_META).sort()) === JSON.stringify([...COMPLETED_STATUS_KEYS].sort()));
    check('acreditables iguales en los dos lados',
        COMPLETED_STATUS_KEYS.every(k =>
            mod.completedStatusMeta(k).accreditable === completedStatusMeta(k).accreditable));
    check('las etiquetas de los estados coinciden',
        COMPLETED_STATUS_KEYS.every(k => mod.completedStatusMeta(k).label === completedStatusMeta(k).label));

    // Las opciones y la obligatoriedad, comparadas por SALIDAS sobre los
    // mismos casos.
    const casos = [
        [campoDistrito, {}], [campoClub, {}], [campoClub, { district: '4281' }],
        [campoClub, { district: 'District 6960' }],
        [schema.steps[3].fields[0], {}],
    ];
    check('completedOptionsFor devuelve lo mismo en los dos espejos',
        casos.every(([f, a]) =>
            JSON.stringify(mod.completedOptionsFor(f, a, CATALOGOS)) === JSON.stringify(completedOptionsFor(f, a, CATALOGOS))));
    check('la obligatoriedad condicional coincide',
        ['socio_activo', 'invitado', 'sin_club'].every(m =>
            mod.isCompletedFieldRequired(campoDistrito, { membershipType: m })
            === isCompletedFieldRequired(distrito, { membershipType: m })));

    // La validación por paso del navegador contra la del servidor, campo por
    // campo del paso 1 con el mismo juego de respuestas.
    const respuestasMalas = { ...RESPUESTAS_VALIDAS, email: 'malo', phone: '12' };
    const cliente = mod.validateCompletedStep(schema.steps[0].fields, respuestasMalas);
    const servidor = validateCompletedAnswers(CONFIG, respuestasMalas, CATALOGOS).errors;
    check('los mensajes de correo y teléfono son los MISMOS textos',
        cliente.email === servidor.email && cliente.phone === servidor.phone);
}

// ── Resultado ────────────────────────────────────────────────────────
console.log(`\n${pasadas} comprobaciones pasaron${fallos.length ? `, ${fallos.length} FALLARON:` : '.'}`);
for (const f of fallos) console.log(`  ✗ ${f}`);
process.exit(fallos.length ? 1 : 0);
