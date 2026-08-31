// ════════════════════════════════════════════════════════════════════
// Aportes de contenido a una campaña — pruebas del CRITERIO — v4.968
//
// SIN base, SIN credenciales y SIN red. El bloque del espejo pide `esbuild` y
// se salta solo si no está.
//
// Lo que estas pruebas existen para atrapar, y que ninguna otra ve:
//   · que enviar NO apruebe nada;
//   · que «aprobado» y «publicado» sigan siendo dos cosas;
//   · que el consentimiento se copie con la solicitud, no se referencie;
//   · que el texto legal por defecto siga declarándose provisional;
//   · que lo que no se sabe se DECLARE en el contexto que consume la IA.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    SUBMISSION_STATES, SUBMISSION_STATE_IDS, INITIAL_STATE, stateLabel,
    canTransitionSubmission, nextStates, needsReason,
    kindOf, extensionFor, checkFileMeta, MAX_FILES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES,
    DEFAULT_CONSENT_TEXT, consentIsConfigured, consentTextFor,
    normalizeSubmissionsConfig, defaultInviteMessage, inviteMessageFor,
    shapeSubmission, validateSubmission, buildSubmissionContext, submissionCaption,
    USAGE_CHANNELS, isUsageChannel, usageIsMeasured,
} from '../server/lib/contentSubmissionSpec.js';
import { normalizeContent } from '../server/lib/contributionSpec.js';

const leer = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/**
 * El CONTENIDO de cada `db.query(\`…\`)`, sin sus delimitadores.
 *
 * ⚠️ NO SE PUEDE HACER CON UN `match` NO CODICIOSO. Un `db.query(\`SQL\`, [params])`
 * cierra con «\`,» y no con «\`)», así que un patrón que busque «\`)» sigue
 * corriendo hasta el bloque siguiente y arrastra el JavaScript de en medio —
 * que sí tiene backticks: falso positivo en todos. Se recorre desde cada
 * apertura hasta el PRIMER backtick, y se comprueba que ése sea de verdad el
 * cierre (lo que sigue es «,» o «)»). Si hubiera un backtick suelto dentro del
 * SQL, lo que siga NO será ninguno de los dos y la prueba lo dice.
 */
const sqlDe = (src) => {
    const salida = [];
    // ⚠️ EL BACKTICK NO SIEMPRE VA PEGADO A `db.query(`. Casi todas las
    // consultas con parámetros se escriben en varias líneas, así que buscar el
    // literal «db.query(`» no ve NINGUNA de ellas: el chequeo pasaba en verde
    // sin haber mirado nada. Se salta el espacio en blanco.
    const re = /db\.query\(\s*`/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const desde = m.index + m[0].length;
        const cierre = src.indexOf('`', desde);
        if (cierre === -1) { salida.push('BACKTICK SIN CERRAR `'); break; }
        // Un cierre legítimo va seguido de «,» (hay parámetros) o de «)». Si
        // hubiera un backtick suelto dentro del SQL, lo que siga no será
        // ninguno de los dos.
        const siguiente = src.slice(cierre + 1).trimStart()[0];
        salida.push(siguiente === ',' || siguiente === ')' ? src.slice(desde, cierre) : '`');
        re.lastIndex = cierre + 1;
    }
    return salida;
};

// ─── 1. Los estados ────────────────────────────────────────────────────

test('el estado inicial es «Recibido» y enviar no aprueba nada', () => {
    assert.equal(INITIAL_STATE, 'recibido');
    const store = leer('server/lib/contentSubmissionStore.js');
    // El INSERT público fija el estado por código, no lo recibe.
    assert.ok(/campaignId, INITIAL_STATE,/.test(store),
        'el insert tiene que fijar el estado inicial; recibirlo dejaría aprobar desde el formulario');
    const spec = leer('server/lib/contentSubmissionSpec.js');
    assert.ok(!/status:/.test(spec.slice(spec.indexOf('export const shapeSubmission'), spec.indexOf('const EMAIL_RE'))),
        'shapeSubmission no puede aceptar `status` del cuerpo de la petición');
});

test('«Aprobado» y «Publicado» son dos estados distintos', () => {
    assert.ok(SUBMISSION_STATES.aprobado && SUBMISSION_STATES.publicado);
    assert.ok(SUBMISSION_STATES.aprobado.order < SUBMISSION_STATES.publicado.order);
    assert.equal(canTransitionSubmission('aprobado', 'publicado'), false,
        'entre aprobar y publicar está llevarlo a la Biblioteca: el salto directo borraría esa distinción');
    assert.equal(canTransitionSubmission('aprobado', 'listo_difusion'), true);
    assert.equal(canTransitionSubmission('listo_difusion', 'publicado'), true);
});

test('los siete estados del pedido están declarados', () => {
    for (const id of ['recibido', 'en_revision', 'aprobado', 'listo_difusion', 'publicado', 'requiere_info', 'descartado']) {
        assert.ok(SUBMISSION_STATES[id], `falta ${id}`);
    }
    assert.equal(SUBMISSION_STATE_IDS.length, 7);
});

test('una transición inventada se rechaza', () => {
    assert.equal(canTransitionSubmission('recibido', 'publicado'), false);
    assert.equal(canTransitionSubmission('inventado', 'aprobado'), false);
    assert.equal(canTransitionSubmission('aprobado', 'inventado'), false);
});

test('descartar NO es terminal: una solicitud se puede recuperar', () => {
    assert.ok(nextStates('descartado').length > 0);
});

test('descartar y pedir información EXIGEN motivo', () => {
    assert.equal(needsReason('descartado'), true);
    assert.equal(needsReason('requiere_info'), true);
    assert.equal(needsReason('aprobado'), false,
        'exigir motivo para aprobar convertiría el trámite normal en fricción');
});

// ─── 2. Los archivos ───────────────────────────────────────────────────

test('se aceptan fotos y videos, y nada más', () => {
    assert.equal(kindOf('image/jpeg', 'a.jpg'), 'image');
    assert.equal(kindOf('video/mp4', 'a.mp4'), 'video');
    assert.equal(kindOf('application/pdf', 'a.pdf'), null);
    assert.equal(checkFileMeta({ contentType: 'application/pdf', filename: 'a.pdf', size: 100 }).ok, false);
});

test('⚠️ el MIME vacío del móvil no descarta la foto', () => {
    // Varios navegadores mandan el tipo vacío o genérico al elegir del carrete:
    // fiarse sólo del MIME dejaría fuera justo el caso para el que se hizo esto.
    assert.equal(kindOf('', 'IMG_0001.HEIC'), 'image');
    assert.equal(kindOf('application/octet-stream', 'video.mov'), 'video');
    assert.equal(checkFileMeta({ contentType: '', filename: 'IMG_0001.HEIC', size: 1000 }).ok, true);
});

test('los topes son distintos para foto y para video', () => {
    assert.ok(VIDEO_MAX_BYTES > IMAGE_MAX_BYTES,
        'un clip de teléfono pesa decenas de MB: el tope de una foto lo dejaría fuera');
    assert.equal(checkFileMeta({ contentType: 'image/jpeg', filename: 'a.jpg', size: IMAGE_MAX_BYTES + 1 }).ok, false);
    assert.equal(checkFileMeta({ contentType: 'video/mp4', filename: 'a.mp4', size: IMAGE_MAX_BYTES + 1 }).ok, true);
    assert.equal(checkFileMeta({ contentType: 'video/mp4', filename: 'a.mp4', size: VIDEO_MAX_BYTES + 1 }).ok, false);
});

test('un archivo vacío se rechaza con su motivo', () => {
    const r = checkFileMeta({ contentType: 'image/jpeg', filename: 'a.jpg', size: 0 });
    assert.equal(r.ok, false);
    assert.ok(r.errores.join(' ').includes('vac'));
});

test('la extensión sale del tipo, con la del nombre de respaldo', () => {
    assert.equal(extensionFor('image/jpeg', 'x'), 'jpg');
    assert.equal(extensionFor('video/quicktime', 'x'), 'mov');
    assert.equal(extensionFor('', 'foto.png'), 'png');
    assert.equal(extensionFor('', 'raro'), 'bin');
});

// ─── 3. El envío ───────────────────────────────────────────────────────

const ENVIO_MINIMO = {
    senderName: 'Ana Restrepo', senderEmail: 'ANA@Club.org ', consent: true,
    files: [{ key: 'private/campaign-submissions/c1/a.jpg', filename: 'a.jpg', contentType: 'image/jpeg' }],
};

test('se exige poco: quién envía, cómo contestarle, el consentimiento y un archivo', () => {
    const r = validateSubmission(shapeSubmission(ENVIO_MINIMO));
    assert.equal(r.ok, true, r.errors.join(' '));
});

test('sin consentimiento no se envía', () => {
    const r = validateSubmission(shapeSubmission({ ...ENVIO_MINIMO, consent: false }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.join(' ').toLowerCase().includes('condiciones'));
});

test('sin archivos no se envía: es el motivo del formulario', () => {
    const r = validateSubmission(shapeSubmission({ ...ENVIO_MINIMO, files: [] }));
    assert.equal(r.ok, false);
});

test('un correo mal escrito se rechaza', () => {
    assert.equal(validateSubmission(shapeSubmission({ ...ENVIO_MINIMO, senderEmail: 'no-es-correo' })).ok, false);
});

test('el correo se normaliza a minúsculas y sin espacios', () => {
    assert.equal(shapeSubmission(ENVIO_MINIMO).senderEmail, 'ana@club.org');
});

test('lo que falta AVISA, no bloquea', () => {
    const r = validateSubmission(shapeSubmission(ENVIO_MINIMO));
    assert.equal(r.ok, true);
    assert.ok(r.warnings.length > 0, 'sin contexto ni club ni lugar tiene que avisar');
    assert.ok(r.warnings.some(w => /contexto|ocurrió/i.test(w)));
});

test('con la historia contada, el aviso del contexto desaparece', () => {
    const r = validateSubmission(shapeSubmission({ ...ENVIO_MINIMO, story: 'Entregamos mercados con el club.' }));
    assert.ok(!r.warnings.some(w => /No contaste qué ocurrió/.test(w)));
});

test('⚠️ el envío no puede traer estado ni campaña', () => {
    const s = shapeSubmission({ ...ENVIO_MINIMO, status: 'aprobado', campaignId: 'otra', id: 'x' });
    assert.equal(s.status, undefined);
    assert.equal(s.campaignId, undefined);
    assert.equal(s.id, undefined);
});

test('los archivos se acotan al tope y los que no tienen clave se descartan', () => {
    const muchos = Array.from({ length: 25 }, (_, i) => ({ key: `private/campaign-submissions/c1/${i}.jpg` }));
    assert.equal(shapeSubmission({ ...ENVIO_MINIMO, files: muchos }).files.length, MAX_FILES);
    assert.equal(shapeSubmission({ ...ENVIO_MINIMO, files: [{ filename: 'sin-clave.jpg' }] }).files.length, 0);
});

test('la historia conserva los saltos de línea y el nombre no', () => {
    const s = shapeSubmission({ ...ENVIO_MINIMO, story: 'Uno\n\nDos', senderName: 'Ana   Restrepo' });
    assert.ok(s.story.includes('\n'));
    assert.equal(s.senderName, 'Ana Restrepo');
});

// ─── 4. El consentimiento ──────────────────────────────────────────────

test('⚠️ el texto por defecto se declara PROVISIONAL, no es un texto legal', () => {
    assert.ok(/provisional/i.test(DEFAULT_CONSENT_TEXT),
        'el default tiene que decir que hace falta configurarlo: redactar términos legales por nuestra cuenta sería peor que no tenerlos');
    assert.equal(consentIsConfigured(''), false);
    assert.equal(consentIsConfigured(DEFAULT_CONSENT_TEXT), false);
    assert.equal(consentIsConfigured('Nuestra política de uso de imagen…'), true);
});

test('sin texto configurado se usa el provisional, no un hueco', () => {
    assert.equal(consentTextFor({}), DEFAULT_CONSENT_TEXT);
    assert.equal(consentTextFor({ consentText: 'Propio' }), 'Propio');
});

test('⚠️ el consentimiento se COPIA con la solicitud, no se referencia', () => {
    const store = leer('server/lib/contentSubmissionStore.js');
    assert.ok(/"consentText"/.test(store),
        'con una referencia, cambiar el texto de la campaña reescribiría retroactivamente lo que alguien aceptó');
    const ctrl = leer('server/controllers/contentSubmissionController.js');
    assert.ok(/consentText: consentTextFor\(config\)/.test(ctrl));
});

// ─── 5. La configuración ───────────────────────────────────────────────

test('el formulario NACE APAGADO', () => {
    assert.equal(normalizeSubmissionsConfig({}).enabled, false);
    assert.equal(normalizeSubmissionsConfig({ enabled: 'sí' }).enabled, false,
        'sólo `true` enciende: ante la duda no se abre un formulario que recibe fotos de personas');
    assert.equal(normalizeSubmissionsConfig({ enabled: true }).enabled, true);
});

test('los correos de aviso se normalizan y se acotan', () => {
    const c = normalizeSubmissionsConfig({ notifyEmails: [' A@B.org ', '', 'c@d.org'] });
    assert.deepEqual(c.notifyEmails, ['a@b.org', 'c@d.org']);
});

test('⚠️ la configuración sobrevive a guardar la campaña', () => {
    // `normalizeContent` RECONSTRUYE el contenido: una clave que no enumere se
    // pierde al guardar, en silencio (la lección de `normalizeNode`).
    const guardado = normalizeContent({ submissions: { enabled: true, headline: 'Hola' } });
    assert.equal(guardado.submissions.enabled, true);
    assert.equal(guardado.submissions.headline, 'Hola');
    // Y una campaña anterior sigue funcionando, apagada.
    assert.equal(normalizeContent({}).submissions.enabled, false);
});

// ─── 6. El mensaje de invitación ───────────────────────────────────────

test('el mensaje toma el nombre de la campaña, sin hardcodearla', () => {
    const m = defaultInviteMessage('Emergencia Terremoto Colombia 2026');
    assert.ok(m.includes('Emergencia Terremoto Colombia 2026'));
    assert.ok(!/terremoto colombia 2026/i.test(defaultInviteMessage('Inundaciones del Cauca')),
        'el nombre no puede quedar escrito en el código');
    assert.ok(defaultInviteMessage('Inundaciones del Cauca').includes('Inundaciones del Cauca'));
});

test('sin nombre de campaña no se inventa uno', () => {
    assert.ok(defaultInviteMessage('').includes('esta campaña'));
});

test('el mensaje propio pisa el default y el enlace se agrega una sola vez', () => {
    const url = 'https://x.org/aportar-contenido/c';
    assert.ok(inviteMessageFor({ name: 'X' }, { inviteMessage: 'Mandanos tus fotos' }, url).includes(url));
    const yaLoTiene = inviteMessageFor({ name: 'X' }, { inviteMessage: `Mirá ${url}` }, url);
    assert.equal(yaLoTiene.split(url).length - 1, 1, 'el enlace no se repite');
});

// ─── 7. El contexto que consume la IA ──────────────────────────────────

test('lo que se sabe se nombra y lo que NO se sabe se DECLARA', () => {
    const completo = buildSubmissionContext({
        title: 'Entrega de mercados', story: 'Fuimos con el club a Quibdó.',
        city: 'Quibdó', activityDate: '14 de agosto', club: 'RC Cali',
    });
    assert.ok(completo.includes('Entrega de mercados'));
    assert.ok(completo.includes('Quibdó'));
    assert.ok(completo.includes('RC Cali'));

    const vacio = buildSubmissionContext({ story: 'Algo hicimos.' });
    assert.ok(/NO se indicó dónde/.test(vacio));
    assert.ok(/NO se indicó la fecha/.test(vacio));
    assert.ok(/NO se indicó qué club/.test(vacio),
        'un hueco en silencio es una invitación a completarlo, y un modelo completa huecos por diseño');
});

test('el contexto prohíbe deducir hechos de la fotografía', () => {
    const c = buildSubmissionContext({ story: 'x' });
    assert.ok(/no deduzcas de la fotografía/i.test(c));
    assert.ok(/información suministrada/i.test(c));
});

test('el pie de la foto sale del título y del lugar', () => {
    assert.ok(submissionCaption({ title: 'Entrega', city: 'Cali', activityDate: '14 ago' }).includes('Entrega'));
    assert.equal(submissionCaption({}), '');
});

// ─── 8. El uso ─────────────────────────────────────────────────────────

test('el catálogo de canales es CERRADO', () => {
    assert.equal(isUsageChannel('instagram'), true);
    assert.equal(isUsageChannel('inventado'), false,
        'sin esta puerta, el seguimiento aceptaría cualquier etiqueta y dejaría de ser comparable');
});

test('se distingue lo MEDIDO de lo DECLARADO', () => {
    assert.equal(usageIsMeasured('instagram'), true);
    assert.equal(usageIsMeasured('whatsapp'), false,
        'ese módulo no registra qué archivo usó: presentarlo como medido sería afirmar algo que no se midió');
    assert.equal(usageIsMeasured('email'), false);
    assert.ok(Object.keys(USAGE_CHANNELS).length >= 6);
});

test('⚠️ generar NO es publicar: el uso se anota en el publish, no al generar', () => {
    const gen = leer('server/controllers/contentStudioController.js');
    assert.ok(!/markSubmissionUsageForPublication/.test(gen),
        'marcar el uso al generar contaría como publicado material que quizá nunca salga');
    const pub = leer('server/controllers/socialPublishingController.js');
    assert.ok(/markSubmissionUsageForPublication/.test(pub),
        'el único disparador automático es un publish con resultado OK');
});

// ─── 9. Lo estructural ─────────────────────────────────────────────────

test('⚠️ los archivos públicos van a un prefijo SIN lectura pública', () => {
    const files = leer('server/lib/submissionFiles.js');
    assert.ok(/STAGING_PREFIX = 'private\//.test(files),
        'que nada se publique solo es estructural: el objeto no puede tener URL pública hasta que se apruebe');
    assert.ok(/getSignedUrl/.test(files), 'el panel lo mira con un enlace firmado que caduca');
});

test('promover NO re-sube el archivo ni lo pasa por la función', () => {
    const files = leer('server/lib/submissionFiles.js');
    assert.ok(/CopyObjectCommand/.test(files),
        'un video de 200 MB no puede pasar por el /tmp de 512 MB ni por el cuerpo de la petición');
    assert.ok(/MetadataDirective: 'REPLACE'/.test(files),
        'con COPY, S3 ignora las cabeceras nuevas y el objeto llegaría a la Biblioteca con el no-store del staging');
});

test('el objeto de staging se borra DESPUÉS de que existe la fila de Media', () => {
    const store = leer('server/lib/contentSubmissionStore.js');
    const bloque = store.slice(store.indexOf('export async function promoteToLibrary'));
    assert.ok(bloque.indexOf('INSERT INTO "Media"') < bloque.indexOf('deleteStagingObject'),
        'al revés, un fallo al insertar perdería el archivo');
});

test('promover es idempotente por archivo', () => {
    const store = leer('server/lib/contentSubmissionStore.js');
    assert.ok(/if \(f\.mediaId\) \{ resultados\.push/.test(store),
        'reintentar tras un fallo a medias no puede duplicar lo que ya se promovió');
});

test('el material aprobado entra a las fotos de la campaña del generador', () => {
    const ways = leer('server/controllers/waysToContributeController.js');
    assert.ok(/approvedCampaignMedia/.test(ways),
        'sin esto el circuito se corta: el club manda la foto, se aprueba y el generador no la encuentra');
    // Y su historia llega al brief.
    const spec = leer('server/lib/waysToContribute.js');
    assert.ok(/submissionContext/.test(spec));
});

test('sólo el material APROBADO llega al generador', () => {
    const store = leer('server/lib/contentSubmissionStore.js');
    const bloque = store.slice(store.indexOf('export async function approvedCampaignMedia'));
    assert.ok(/s\.status IN \('aprobado','listo_difusion','publicado'\)/.test(bloque),
        'material sin revisar no puede aparecer entre las fotos que el generador ofrece');
    assert.ok(/f\."mediaId" IS NOT NULL/.test(bloque));
});

test('las tablas viven fuera de Prisma', () => {
    const schema = leer('server/prisma/schema.prisma');
    for (const t of ['ContributionSubmission', 'ContributionSubmissionFile', 'ContributionSubmissionEvent']) {
        assert.ok(!new RegExp(`model ${t}\\b`).test(schema),
            `${t} entró a Prisma: una tabla declarada y todavía inexistente deja en 500 a todo consumidor Prisma`);
    }
    const ensure = leer('server/lib/ensureContentSubmissionSchema.js');
    assert.ok(/CREATE TABLE IF NOT EXISTS/.test(ensure));
    // Se busca en el SQL, NO en el archivo: el comentario que explica la regla
    // tiene que poder nombrar «DROP» sin hacer fallar la prueba (la lección de
    // la comprobación de `ctaStyles`).
    for (const sql of sqlDe(ensure)) {
        assert.ok(!/DROP TABLE|TRUNCATE/i.test(sql), 'hay un DROP o un TRUNCATE en el SQL');
    }
});

test('⚠️ ninguna comilla invertida dentro de un SQL en template literal', () => {
    // Cierra el literal a mitad y el módulo entero deja de parsear (v4.721.1).
    for (const archivo of ['server/lib/ensureContentSubmissionSchema.js', 'server/lib/contentSubmissionStore.js']) {
        for (const sql of sqlDe(leer(archivo))) {
            assert.equal(sql.includes('`'), false, `hay una comilla invertida dentro de un SQL en ${archivo}`);
        }
    }
});

test('el aviso al equipo nunca revierte la solicitud', () => {
    const ctrl = leer('server/controllers/contentSubmissionController.js');
    assert.ok(/avisarAlEquipo\(\{[^}]*\}\)\.catch\(/.test(ctrl),
        'una solicitud ya guardada no se puede perder porque no salió un correo');
    assert.ok(/if \(!r\?\.success\)/.test(ctrl),
        'sendPlatformEmail NUNCA lanza: esperar una excepción registraría como enviado un correo rechazado (v4.945)');
});

// ─── 10. La pantalla ───────────────────────────────────────────────────

test('la bandeja vive DENTRO del editor de la campaña', () => {
    const pagina = leer('src/pages/admin/ContributionCampaigns.tsx');
    assert.ok(/SubmissionsPanel/.test(pagina));
    assert.ok(/'solicitudes'/.test(pagina.slice(pagina.indexOf('const CARD_IDS'), pagina.indexOf('const STATUS_CHIP'))),
        'sin entrar a CARD_IDS la sección queda fuera de «Expandir todo»');
});

test('«Promocionar» manda al generador existente, no crea uno nuevo', () => {
    const panel = leer('src/components/admin/contribution/SubmissionsPanel.tsx');
    assert.ok(/admin\/content-studio\?/.test(panel));
    assert.ok(!/generate-post/.test(panel), 'un segundo generador sería el módulo duplicado que el pedido prohíbe');
});

test('el formulario público dice que nada se publica solo', () => {
    const form = leer('src/pages/AportarContenido.tsx');
    assert.ok(/se publica autom[aá]ticamente/i.test(form),
        'quien manda la foto de su club tiene derecho a saber qué va a pasar con ella');
});

test('el formulario público no lee ninguna respuesta con .json() a ciegas', () => {
    const form = leer('src/pages/AportarContenido.tsx');
    assert.ok(/leerJson/.test(form));
    assert.ok(!/await r\.json\(\)/.test(form),
        'una respuesta HTML rompe el parseo con un mensaje que no nombra ninguna capa (v4.946)');
});

test('la dirección pública no se indexa', () => {
    assert.ok(/'\/aportar-contenido'/.test(leer('server/lib/seoSpec.js')),
        'abierto y no indexado son cosas distintas');
});

// ─── 11. El espejo ─────────────────────────────────────────────────────

test('el espejo del navegador coincide con el servidor', async (t) => {
    let build;
    try { ({ build } = await import('esbuild')); }
    catch { return t.skip('esbuild no está instalado'); }

    const out = await build({
        entryPoints: [new URL('../src/lib/contentSubmissionSpec.ts', import.meta.url).pathname],
        bundle: true, write: false, format: 'esm', platform: 'neutral',
    });
    const espejo = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

    assert.deepEqual(Object.keys(espejo.SUBMISSION_STATES).sort(), SUBMISSION_STATE_IDS.slice().sort());
    for (const id of SUBMISSION_STATE_IDS) {
        assert.equal(espejo.stateLabel(id), stateLabel(id), `la etiqueta de ${id} difiere`);
        assert.equal(espejo.SUBMISSION_STATES[id].order, SUBMISSION_STATES[id].order);
    }
    assert.equal(espejo.MAX_FILES, MAX_FILES);
    assert.equal(espejo.IMAGE_MAX_BYTES, IMAGE_MAX_BYTES);
    assert.equal(espejo.VIDEO_MAX_BYTES, VIDEO_MAX_BYTES);

    // Se comparan las SALIDAS sobre una matriz, no sólo las constantes: es lo
    // único que impide que el formulario acepte un archivo que el servidor
    // rechaza después de subirlo.
    const casos = [
        { contentType: 'image/jpeg', filename: 'a.jpg', size: 1000 },
        { contentType: '', filename: 'IMG.HEIC', size: 1000 },
        { contentType: 'application/pdf', filename: 'a.pdf', size: 1000 },
        { contentType: 'video/mp4', filename: 'a.mp4', size: VIDEO_MAX_BYTES + 1 },
        { contentType: 'image/png', filename: 'a.png', size: IMAGE_MAX_BYTES + 1 },
        { contentType: 'image/png', filename: 'a.png', size: 0 },
    ];
    for (const c of casos) {
        assert.equal(espejo.checkFileMeta(c).ok, checkFileMeta(c).ok, `difiere en ${c.filename} (${c.size})`);
        assert.equal(espejo.kindOf(c.contentType, c.filename), kindOf(c.contentType, c.filename));
    }
    for (const canal of Object.keys(USAGE_CHANNELS)) {
        assert.equal(espejo.usageIsMeasured(canal), usageIsMeasured(canal), `difiere el canal ${canal}`);
    }
});

test('el espejo NO decide: la validación del envío vive sólo en el servidor', async (t) => {
    let build;
    try { ({ build } = await import('esbuild')); }
    catch { return t.skip('esbuild no está instalado'); }
    // Se busca la DEFINICIÓN, no la mención: el comentario de cabecera tiene
    // que poder explicar que esas funciones viven en el servidor.
    const src = leer('src/lib/contentSubmissionSpec.ts')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/(export const|function)\s+(validateSubmission|canTransitionSubmission|shapeSubmission)/.test(src),
        'un espejo que decidiera daría dos veredictos sobre el mismo envío');
});
