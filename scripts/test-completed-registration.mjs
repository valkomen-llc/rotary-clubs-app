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
    PAYMENT_METHODS, MEMBERSHIP_OPTIONS, clubRoleOptions, clubRoleLabel,
    RECEIPT_MAX_BYTES, receiptExtensionFor, checkReceiptMeta,
    RESERVED_SLUGS, normalizeCompletedSlug, normalizeCompletedConfig,
    completedCodePrefixFor, buildCompletedCode,
    buildCompletedSchema, flattenCompletedFields, isCompletedFieldRequired,
    completedOptionsFor, validateCompletedAnswers,
    duplicateMatchKind, buildDuplicateFlags,
    COMPLETED_FORM_SEEDS, seedForSlug, matchSeedEvent,
} from '../server/lib/completedRegistrationSpec.js';
import { rotaryCatalogFor } from '../server/lib/eventRegistrationSpec.js';
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

// ── 2. El formulario de cuatro pasos ─────────────────────────────────
grupo('El formulario de cuatro pasos (el contrato del pedido)');
const schema = buildCompletedSchema(CONFIG);
check('son exactamente cuatro pasos, en el orden pedido',
    JSON.stringify(schema.steps.map(s => s.key)) === JSON.stringify(['participante', 'cargo', 'evento', 'pago']),
    schema.steps.map(s => s.key).join(', '));

const paso1 = schema.steps[0].fields.map(f => f.key);
check('paso 1: nombre y apellido SEPARADOS, documento, email, teléfono, distrito, club y vínculo',
    JSON.stringify(paso1) === JSON.stringify([
        'firstName', 'lastName', 'documentNumber', 'email', 'phone',
        'district', 'clubName', 'membershipType']),
    paso1.join(', '));
check('el teléfono es tel (selector de país) y el correo es email',
    schema.steps[0].fields.find(f => f.key === 'phone').type === 'tel'
    && schema.steps[0].fields.find(f => f.key === 'email').type === 'email');
check('el vínculo trae las tres opciones del pedido',
    JSON.stringify(MEMBERSHIP_OPTIONS.map(o => o.value)) === JSON.stringify(['socio_activo', 'invitado', 'sin_club']));

const paso2 = schema.steps[1];
check('paso 2: el rótulo lleva el período rotario',
    paso2.label.includes('2026-2027') && paso2.fields[0].label.includes('2026-2027'));
check('paso 2: cuatro cargos y «otro» despliega el campo condicional',
    paso2.fields[0].options.length === 4
    && JSON.stringify(paso2.fields[1].showIf) === JSON.stringify({ key: 'clubRole', in: ['otro_cargo'] }));
check('el período es de la EDICIÓN: otro período reescribe los rótulos',
    buildCompletedSchema({ rolePeriod: '2027-2028' }).steps[1].fields[0].options
        .some(o => o.label.includes('2027-2028')));
check('clubRoleLabel resuelve el rótulo con su período',
    clubRoleLabel('presidente_electo', '2026-2027') === 'Presidente electo año Rotario 2026-2027');

const paso3 = schema.steps[2].fields.map(f => f.key);
check('paso 3: EPS, alergia y el contacto de emergencia con su teléfono',
    JSON.stringify(paso3) === JSON.stringify(['eps', 'foodAllergy', 'emergencyName', 'emergencyPhone'])
    && schema.steps[2].fields[3].type === 'tel');

const paso4 = schema.steps[3];
check('paso 4: método de pago, comprobante y comentarios opcionales',
    JSON.stringify(paso4.fields.map(f => f.key)) === JSON.stringify(['paymentMethod', 'receipt', 'comments'])
    && paso4.fields[2].required === false);
check('los tres métodos de pago del pedido',
    JSON.stringify(PAYMENT_METHODS.map(m => m.value)) === JSON.stringify(['pasarela_colrotarios', 'transferencia', 'otro']));
check('el comprobante es un campo de ARCHIVO y no entra a la validación de respuestas',
    paso4.fields[1].type === 'file'
    && !flattenCompletedFields(CONFIG).some(f => f.key === 'receipt'));

// ── 3. Obligatoriedad condicional ────────────────────────────────────
grupo('Distrito y club: obligatorios sólo con club');
const distrito = schema.steps[0].fields.find(f => f.key === 'district');
check('con socio activo, el distrito es obligatorio',
    isCompletedFieldRequired(distrito, { membershipType: 'socio_activo' }) === true);
check('con invitado también', isCompletedFieldRequired(distrito, { membershipType: 'invitado' }) === true);
check('sin club, NO se le exige un club que no tiene',
    isCompletedFieldRequired(distrito, { membershipType: 'sin_club' }) === false);

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
check('sin club: distrito y club vacíos pasan',
    validateCompletedAnswers(CONFIG, {
        ...RESPUESTAS_VALIDAS, membershipType: 'sin_club', district: '', clubName: '',
    }, CATALOGOS).ok);
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
}
{
    const pagina = leer('src/pages/CompletarInscripcion.tsx');
    check('el GET del formulario reintenta UNA vez ante un 5xx o un fallo de red',
        /intento === 0/.test(pagina) && /cargar\(1\)/.test(pagina));
    check('la pantalla muestra el `detail` del servidor cuando llega',
        /data\?\.detail/.test(pagina));
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
