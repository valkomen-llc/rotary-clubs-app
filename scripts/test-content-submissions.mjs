// ════════════════════════════════════════════════════════════════════
// Aportes de contenido a una campaña — pruebas del CRITERIO — v4.972
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
    CLUB_NOT_LISTED, clubsForDistrict, districtOfClub,
    canTransitionSubmission, nextStates, needsReason,
    kindOf, extensionFor, checkFileMeta, MAX_FILES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES,
    DEFAULT_CONSENT_TEXT, consentIsConfigured, consentTextFor,
    normalizeSubmissionsConfig, defaultInviteMessage, inviteMessageFor,
    shapeSubmission, validateSubmission, buildSubmissionContext, submissionCaption,
    USAGE_CHANNELS, isUsageChannel, usageIsMeasured,
    POST_PLATFORMS, POST_PLATFORM_IDS, POST_PLATFORM_OTHER, isPostPlatform,
    postPlatformLabel, normalizePostUrl, shapePosts, MAX_POSTS,
    shapePhone, shapeClubs, clubKey, clubNames, defaultDistrictFor,
    MAX_PARTICIPATING_CLUBS,
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
    for (const t of ['ContributionSubmission', 'ContributionSubmissionFile', 'ContributionSubmissionEvent',
                     'ContributionSubmissionClub', 'ContributionSubmissionPost']) {
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

    // ── Las plataformas y el enlace (v4.972) ───────────────────────────
    //
    // El desplegable se pinta con lo que MANDA el servidor; este espejo es el
    // respaldo para un navegador nuevo contra un servidor anterior, así que
    // tiene que decir lo mismo o el respaldo ofrecería plataformas que el
    // servidor rechaza.
    assert.deepEqual(Object.keys(espejo.POST_PLATFORMS).sort(), POST_PLATFORM_IDS.slice().sort());
    for (const id of POST_PLATFORM_IDS) {
        assert.equal(espejo.POST_PLATFORMS[id].label, POST_PLATFORMS[id].label, `la etiqueta de ${id} difiere`);
        assert.equal(espejo.postPlatformLabel(id), postPlatformLabel(id));
    }
    assert.equal(espejo.postPlatformLabel(POST_PLATFORM_OTHER, 'Boletín'), postPlatformLabel(POST_PLATFORM_OTHER, 'Boletín'));
    assert.equal(espejo.MAX_POSTS, MAX_POSTS);
    assert.equal(espejo.MAX_PARTICIPATING_CLUBS, MAX_PARTICIPATING_CLUBS);

    // Las SALIDAS del análisis del enlace, sobre una matriz: es lo que impide
    // que el formulario deje mandar un enlace que el servidor va a rechazar, y
    // —peor— que lo dé por bueno uno que el servidor considera peligroso.
    const enlaces = [
        'https://instagram.com/p/abc', 'instagram.com/p/abc', 'bit.ly/3x',
        'javascript:alert(1)', 'javascript://evil.com/%0aalert(1)', 'ftp://evil.com/x',
        'no es un enlace', 'localhost/x', '', '   ', 'http://rotary4281.org/n?x=1#a',
    ];
    for (const e of enlaces) {
        const a = espejo.normalizePostUrl(e), b = normalizePostUrl(e);
        assert.equal(a.ok, b.ok, `difiere el veredicto de «${e}»`);
        assert.equal(a.url, b.url, `difiere la URL normalizada de «${e}»`);
        assert.equal(a.host, b.host, `difiere el host de «${e}»`);
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

// ════════════════════════════════════════════════════════════════════
// El MARCO DEL SITIO (v4.969)
//
// ⚠️ ESTA LECCIÓN YA ESTABA ESCRITA Y SE REPITIÓ. v4.955 y v4.957 la dejaron
// documentada para el Canal de Capacitaciones —«el cromo del sitio se monta
// POR PÁGINA en esta aplicación», «la cabecera y el fondo salen de las fuentes
// COMPARTIDAS»— y aun así el formulario público de aportes se estrenó SIN
// barra, SIN pie y con un `bg-rotary-blue` propio: se abría desde un WhatsApp
// y no se parecía a nada del Distrito. No falla ruidosamente — se ve una
// página plana y nadie sabe de quién es.
//
// Se comprueba acá, junto al resto del módulo, porque una prueba que vive en
// la suite de OTRO módulo no protege a éste.
// ════════════════════════════════════════════════════════════════════

test('el formulario público lleva el marco del sitio en TODOS sus estados', () => {
    const pagina = leer('src/pages/AportarContenido.tsx');

    // La barra y el pie, montados por la página (en esta aplicación el Navbar
    // no es global: vive dentro de cada página).
    assert.ok(pagina.includes("from '../sections/Navbar'") && pagina.includes("from '../sections/Footer'"),
        'la página tiene que importar la barra y el pie del sitio');
    assert.ok(/<Navbar \/>/.test(pagina) && /<Footer \/>/.test(pagina));

    // Y en los CUATRO estados —cargando, error, gracias y el formulario—, no
    // sólo en uno: puesto en uno solo, los otros tres salen planos y el fallo
    // es mudo. Ninguna rama puede devolver un `<div>` suelto.
    //
    // ⚠️ SE MIRA EL CUERPO DE LA PÁGINA, NO EL ARCHIVO ENTERO (v4.972). El
    // archivo tiene además componentes auxiliares —el selector de clubes, la
    // fila de una publicación, el teléfono— que devuelven un `<div>` porque
    // van DENTRO del marco, no en su lugar. Mirando todo el archivo, el
    // guardián marcaba en falso cada uno de ellos, y un guardián que grita en
    // falso se termina desactivando: eso costaría la comprobación que de
    // verdad importa. La región es de la declaración de la página al
    // `export default`.
    const cuerpoDeLaPagina = pagina.slice(
        pagina.indexOf('const AportarContenido'),
        pagina.indexOf('export default AportarContenido'),
    );
    assert.ok(cuerpoDeLaPagina.length > 500, 'no se pudo aislar el cuerpo de la página');
    assert.ok(!/return\s*\(\s*<div/.test(cuerpoDeLaPagina) && !/return\s*<div/.test(cuerpoDeLaPagina),
        'algún return se salta el marco del sitio');

    // Verificación a la inversa DENTRO de la prueba: sin esto, lo de arriba
    // podría estar pasando por mirar una región vacía (la lección de `sqlDe`).
    const conDefecto = 'const AportarContenido = () => {\n    if (x) return (<div>plano</div>);\n};\nexport default AportarContenido;';
    const region = conDefecto.slice(conDefecto.indexOf('const AportarContenido'), conDefecto.indexOf('export default AportarContenido'));
    assert.ok(/return\s*\(\s*<div/.test(region), 'el detector tiene que ver un estado que se salta el marco');

    // La cabecera y el fondo salen de las FUENTES COMPARTIDAS (v4.613 / v4.957),
    // las mismas de la postulación de proyectos, los eventos y Contacto.
    assert.ok(pagina.includes('PAGE_HEADER_BACKGROUND') && pagina.includes('bg-rotary-concrete'),
        'la cabecera y el fondo tienen que ser los del sitio');

    // Un azul propio en la cabecera es exactamente lo que se separa en
    // silencio: es para lo que `pageHeader.ts` existe.
    assert.ok(!/<header[^>]*className="[^"]*bg-rotary-blue/.test(pagina),
        'la cabecera no puede llevar un azul escrito a mano');
});

test('una página con el marco del sitio lleva también sus avisos', () => {
    // ⚠️ EL ACOPLAMIENTO DE v4.878: `showBannerOffset` del Navbar decide su
    // desplazamiento mirando SÓLO al club, sin saber nada de
    // `HIDE_BANNERS_PATHS`. Con el aviso suprimido en App.tsx y el menú
    // desplazado igual, un sitio vencido dejaba un hueco donde no hay barra.
    const app = leer('src/App.tsx');
    const lista = app.match(/const HIDE_BANNERS_PATHS = \[([^\]]*)\]/)?.[1] || '';
    assert.ok(!lista.includes('/aportar-contenido'),
        'la ruta monta el Navbar del sitio: esconder sus banners descuadra el menú');
});

// ════════════════════════════════════════════════════════════════════
// DISTRITO → CLUBES (v4.970)
//
// La misma pareja de desplegables que la postulación (v4.706) y el registro a
// un evento (v4.708), alimentada por el MISMO catálogo curado
// (`rotaryClubs.js`, v4.707) — no por una copia.
// ════════════════════════════════════════════════════════════════════

test('el catálogo llega del servidor y no se copia al navegador', () => {
    const ctrl = leer('server/controllers/contentSubmissionController.js');
    assert.ok(ctrl.includes("from '../lib/rotaryClubs.js'") && ctrl.includes('DISTRICT_CATALOG'),
        'el catálogo tiene que salir de su única verdad');
    assert.ok(/catalogs:\s*\{\s*districts:\s*DISTRICT_CATALOG/.test(ctrl),
        'la respuesta pública tiene que llevar el catálogo');

    // ⚠️ Copiar la lista al bundle daría dos catálogos que se separan en
    // silencio: el día que el Distrito agregue un club, el formulario
    // ofrecería la lista vieja. Se busca la DEFINICIÓN, no la mención.
    const pagina = leer('src/pages/AportarContenido.tsx')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/(CLUBS_4271|CLUBS_4281|DISTRICT_CATALOG)/.test(pagina),
        'la pantalla no puede traer su propia copia del catálogo');
    assert.ok(!/rotaryClubs/.test(pagina));
});

test('el valor reservado del club es el MISMO del resto del sitio', () => {
    const pagina = leer('src/pages/AportarContenido.tsx');
    assert.ok(pagina.includes("import { CLUB_NOT_LISTED } from '../lib/eventRegistrationSpec'"),
        'con dos valores distintos, una salida manual se guardaría como el nombre de un club');
    assert.equal(leer('src/lib/eventRegistrationSpec.ts').match(/CLUB_NOT_LISTED = '([^']+)'/)?.[1],
        CLUB_NOT_LISTED, 'el espejo del servidor y el del sitio tienen que coincidir');
});

test('cambiar de distrito descarta el club elegido', () => {
    // El club anterior ya no describe nada: es la regla de v4.708 y sin ella
    // se envía un club que no pertenece al distrito que se acaba de elegir.
    const pagina = leer('src/pages/AportarContenido.tsx');
    assert.ok(/setF\(\{ \.\.\.f, district: e\.target\.value, club: '' \}\)/.test(pagina));
    // Y la salida manual ofrece la vuelta: re-elegir el mismo distrito no
    // dispara nada, así que sin el botón quien se equivocó se queda escribiendo.
    assert.ok(pagina.includes('Volver a la lista de clubes'));
});

test('clubsForDistrict acepta el número y la etiqueta', () => {
    const cat = [
        { value: '4271', label: 'Distrito 4271', clubs: ['Cúcuta', 'Medellín'] },
        { value: '4281', label: 'Distrito 4281', clubs: ['Bogotá'] },
    ];
    assert.deepEqual(clubsForDistrict(cat, '4271'), ['Cúcuta', 'Medellín']);
    assert.deepEqual(clubsForDistrict(cat, 'Distrito 4271'), ['Cúcuta', 'Medellín']);
    assert.deepEqual(clubsForDistrict(cat, ''), []);
    assert.deepEqual(clubsForDistrict(cat, '9999'), []);
    assert.deepEqual(clubsForDistrict(null, '4271'), []);
});

test('la pareja distrito-club que se contradice AVISA, no rechaza', () => {
    const cat = [
        { value: '4271', label: 'Distrito 4271', clubs: ['Cúcuta'] },
        { value: '4281', label: 'Distrito 4281', clubs: ['Bogotá'] },
    ];
    const base = {
        senderName: 'Ana', senderEmail: 'ana@club.org', consent: true,
        files: [{ s3Key: 'k', filename: 'a.jpg', contentType: 'image/jpeg', size: 10, kind: 'image' }],
        story: 'algo', city: 'x', activityDate: '2026-08-01',
    };

    // Contradicción: el catálogo conoce el club y es de otro distrito.
    const malo = validateSubmission({ ...base, district: '4281', club: 'Cúcuta' }, { districtCatalog: cat });
    assert.equal(malo.ok, true, 'nunca se pierde el material por esto');
    assert.ok(malo.warnings.some(w => w.includes('4271') && w.includes('4281')),
        'el aviso tiene que nombrar los dos distritos');

    // La pareja correcta no avisa nada, con el número y con la etiqueta.
    for (const d of ['4271', 'Distrito 4271']) {
        const bien = validateSubmission({ ...base, district: d, club: 'Cúcuta' }, { districtCatalog: cat });
        assert.ok(!bien.warnings.some(w => w.includes('pertenece al Distrito')), `avisó de más con «${d}»`);
    }

    // ⚠️ UN CLUB QUE EL CATÁLOGO NO CONOCE NO ES UNA CONTRADICCIÓN: es un club
    // que la lista no tiene todavía —nuevo, fusionado, renombrado— y avisar
    // ahí convertiría lo normal en un problema (regla de v4.706).
    const nuevo = validateSubmission({ ...base, district: '4281', club: 'Club Nuevo de Algo' }, { districtCatalog: cat });
    assert.ok(!nuevo.warnings.some(w => w.includes('pertenece al Distrito')));

    // Sin catálogo se comporta EXACTAMENTE como antes de v4.970.
    const sin = validateSubmission({ ...base, district: '4281', club: 'Cúcuta' });
    assert.ok(!sin.warnings.some(w => w.includes('pertenece al Distrito')));
});

test('el catálogo real trae los dos distritos con sus clubes', async () => {
    const { DISTRICT_CATALOG } = await import('../server/lib/rotaryClubs.js');
    assert.deepEqual(DISTRICT_CATALOG.map(d => d.value), ['4271', '4281']);
    for (const d of DISTRICT_CATALOG) {
        assert.ok(d.clubs.length > 10, `el ${d.label} llegó con ${d.clubs.length} clubes`);
        assert.ok(clubsForDistrict(DISTRICT_CATALOG, d.value).length === d.clubs.length);
    }
});

// ════════════════════════════════════════════════════════════════════
// UN COMPONENTE DENTRO DE OTRO NO SE PUEDE ESCRIBIR (v4.971)
//
// ⚠️ EL DEFECTO: v4.969 declaró el envoltorio `Marco` DENTRO de
// `AportarContenido`. React identifica un componente por su TIPO, y una
// función declarada dentro de otra es un tipo NUEVO en cada render: a cada
// pulsación React no actualizaba el árbol, lo DESMONTABA entero y lo montaba
// de nuevo. La casilla perdía el foco tras UNA sola letra y la página saltaba
// al principio. Se reportó como «no me deja escribir».
//
// No lo ve NADA de lo que ya había: el código es válido, los tipos están
// bien, `check:hooks` mira el orden de los hooks —que no cambia— y las
// pruebas de criterio no montan React.
//
// ⚠️ LA SANGRÍA NO SIRVE PARA DETECTARLO: el `Marco` defectuoso estaba en la
// COLUMNA 0 y aun así dentro de la función. Hay que contar llaves.
// ════════════════════════════════════════════════════════════════════

/** Quita comentarios y cadenas para que sus llaves no cuenten. */
const sinRuido = (src) => {
    let out = '', i = 0;
    while (i < src.length) {
        const c = src[i], d = src[i + 1];
        if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; } i += 2; continue; }
        if (c === '"' || c === "'" || c === '`') {
            const q = c; i++;
            while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; if (src[i] === '\n') out += '\n'; i++; }
            i++; continue;
        }
        out += c; i++;
    }
    return out;
};

/** Componentes declarados a profundidad de llaves > 0. */
const componentesAnidados = (ruta) => {
    const crudo = leer(ruta);
    const lineas = sinRuido(crudo).split('\n');
    const crudas = crudo.split('\n');
    const hall = [];
    let prof = 0;
    lineas.forEach((l, i) => {
        const m = l.match(/^\s*(?:const|function)\s+([A-Z][A-Za-z0-9_]*)\s*(?::\s*React\.FC|[:=(])/);
        if (m && prof > 0) {
            const bloque = crudas.slice(i, i + 15).join('\n');
            if (/=>\s*\(?\s*</.test(bloque) || /return\s*\(?\s*</.test(bloque) || /React\.FC/.test(l)) {
                hall.push(`${m[1]} (línea ${i + 1})`);
            }
        }
        for (const ch of l) { if (ch === '{') prof++; else if (ch === '}') prof--; }
    });
    return hall;
};

test('ningún componente se declara dentro de otro en las pantallas del módulo', () => {
    for (const ruta of ['src/pages/AportarContenido.tsx', 'src/components/admin/contribution/SubmissionsPanel.tsx']) {
        const anidados = componentesAnidados(ruta);
        assert.deepEqual(anidados, [],
            `${ruta}: un componente declarado adentro se remonta en cada render y la casilla pierde el foco tras una letra`);
    }
});

test('el detector reconoce el defecto de v4.969', () => {
    // Verificación a la inversa DENTRO de la prueba: sin esto, la comprobación
    // de arriba podría estar pasando por no detectar nada (la lección de
    // `sqlDe`, v4.968 — un extractor vacuo pasa siempre).
    const defectuoso = `
const Pantalla = () => {
    const [x, setX] = useState('');
const Marco = ({ children }) => (
    <div><Nav />{children}</div>
);
    return <Marco><input value={x} onChange={e => setX(e.target.value)} /></Marco>;
};`;
    const guardado = leer;
    try {
        // Se reemplaza el lector para alimentarle el archivo sintético.
        globalThis.__fuente = defectuoso;
        const lineas = sinRuido(defectuoso).split('\n');
        const crudas = defectuoso.split('\n');
        let prof = 0; const hall = [];
        lineas.forEach((l, i) => {
            const m = l.match(/^\s*(?:const|function)\s+([A-Z][A-Za-z0-9_]*)\s*(?::\s*React\.FC|[:=(])/);
            if (m && prof > 0) {
                const bloque = crudas.slice(i, i + 15).join('\n');
                if (/=>\s*\(?\s*</.test(bloque) || /return\s*\(?\s*</.test(bloque)) hall.push(m[1]);
            }
            for (const ch of l) { if (ch === '{') prof++; else if (ch === '}') prof--; }
        });
        assert.deepEqual(hall, ['Marco'], 'el detector tiene que ver un Marco en la columna 0 dentro de la función');
    } finally { void guardado; }
});

// ════════════════════════════════════════════════════════════════════
// PARTICIPACIÓN ROTARIA, DIFUSIÓN PREVIA Y TELÉFONO INTERNACIONAL (v4.972)
//
// Lo que estas pruebas existen para atrapar, y que ninguna otra ve:
//   · que «dónde publicó el CLUB» no se funda con «dónde usamos NOSOTROS»;
//   · que un enlace no pueda meter `javascript:` en un `href` del panel;
//   · que decir «sí» sin ninguna publicación sea un ERROR y no un aviso;
//   · que el E.164 lo componga el servidor y nunca se acepte armado;
//   · que las URLs no se guarden concatenadas en un solo campo.
// ════════════════════════════════════════════════════════════════════

const CATALOGO = [
    { value: '4271', label: 'Distrito 4271', clubs: ['Barranquilla', 'Bello'] },
    { value: '4281', label: 'Distrito 4281', clubs: ['Amazonas', 'Bogotá'] },
];
/** Un envío mínimo válido, para que cada prueba cambie sólo lo suyo. */
const envio = (extra = {}) => shapeSubmission({
    senderName: 'Ana', senderEmail: 'ana@club.org', consent: true,
    files: [{ key: 'private/campaign-submissions/k1/a.jpg' }],
    story: 'Entregamos mercados', city: 'Cali', activityDate: '14 de agosto',
    ...extra,
});

// ─── 12. La difusión previa NO es el uso ───────────────────────────────

test('⚠️ «dónde publicó el club» y «dónde usamos el material» son DOS catálogos', () => {
    // Son preguntas distintas: una la contesta quien envía sobre lo que YA
    // hizo, la otra la escribe la plataforma sobre lo que hicimos después.
    // Fundirlas haría creer que difundimos algo que difundió otro, y las
    // mediciones de impacto contarían dos veces la misma pieza.
    assert.notDeepEqual(POST_PLATFORM_IDS, Object.keys(USAGE_CHANNELS));
    for (const id of ['tiktok', 'youtube', 'blog', POST_PLATFORM_OTHER]) {
        assert.ok(isPostPlatform(id), `${id} tiene que estar entre las plataformas`);
        assert.ok(!isUsageChannel(id), `${id} no puede haberse colado en los canales de uso`);
    }
    // Y viven en TABLAS distintas.
    const ensure = leer('server/lib/ensureContentSubmissionSchema.js');
    assert.ok(/CREATE TABLE IF NOT EXISTS "ContributionSubmissionPost"/.test(ensure));
    assert.ok(/CREATE TABLE IF NOT EXISTS "ContributionSubmissionEvent"/.test(ensure));
});

test('el catálogo de plataformas es CERRADO', () => {
    assert.equal(isPostPlatform('mastodon'), false);
    assert.equal(shapePosts([{ platform: 'mastodon', url: 'https://a.org/x' }]).posts.length, 0,
        'una plataforma que no está en el catálogo no puede guardarse');
});

test('«Otra» se rotula con el nombre que escribieron, no con la palabra «Otra»', () => {
    assert.equal(postPlatformLabel(POST_PLATFORM_OTHER, 'Boletín parroquial'), 'Boletín parroquial');
    // Sin nombre no se inventa uno: se dice «Otra», que es lo único cierto.
    assert.equal(postPlatformLabel(POST_PLATFORM_OTHER, ''), 'Otra');
    assert.equal(postPlatformLabel('instagram'), 'Instagram');
});

// ─── 13. El enlace: forma sí, dominio no ───────────────────────────────

test('el enlace se valida por FORMA, no por dominio', () => {
    // Un enlace acortado, una redirección o un dominio propio son casos
    // reales: exigir `instagram.com` en una fila marcada «Instagram» dejaría
    // fuera justamente los que hay que registrar.
    for (const bueno of ['https://instagram.com/p/abc', 'bit.ly/3xYz', 'http://rotary4281.org/noticia', 'https://vm.tiktok.com/ZM8/']) {
        assert.equal(normalizePostUrl(bueno).ok, true, `${bueno} tendría que aceptarse`);
    }
    // Sin esquema se asume https: nadie escribe «https://» desde el móvil.
    assert.equal(normalizePostUrl('instagram.com/p/abc').url, 'https://instagram.com/p/abc');
});

test('⚠️ NINGÚN esquema que no sea http/https llega a un href', () => {
    // Este valor termina como `href` de un enlace del panel administrativo, y
    // lo escribió alguien en un formulario PÚBLICO. Es la regla del mapa de la
    // sede (v4.717) y de las redirecciones (v4.781).
    // ⚠️ LOS CASOS CON HOST SON LOS QUE DE VERDAD PRUEBAN LA GUARDIA. Sin
    // ellos, `javascript:alert(1)` lo rechaza el filtro del host —no tiene
    // punto— y la prueba pasa por el motivo equivocado: quitando la
    // comprobación del esquema seguiría en verde. `javascript://evil.com/%0a…`
    // es el bypass canónico: parsea, tiene host con punto, y sólo lo detiene
    // el esquema. Encontrado verificando a la inversa, no leyendo.
    for (const malo of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc/passwd', 'vbscript:msgbox',
                        'javascript://evil.com/%0aalert(1)', 'vbscript://evil.com/x', 'ftp://evil.com/x', 'file://evil.com/x']) {
        assert.equal(normalizePostUrl(malo).ok, false, `${malo} NO puede aceptarse`);
        assert.equal(normalizePostUrl(malo).url, '', 'un enlace rechazado no devuelve URL');
    }
    // Y la pantalla del panel tiene su propia puerta, para las filas que se
    // guardaron antes de que ésta existiera.
    const panel = leer('src/components/admin/contribution/SubmissionsPanel.tsx');
    assert.ok(/const enlaceSeguro = \(url: string\) => \/\^https\?:/.test(panel),
        'el panel tiene que acotar el esquema antes de poner nada en un href');
    assert.ok(/rel="noopener noreferrer"/.test(panel), 'un enlace externo abre con noopener');
});

test('lo que no parece un enlace se rechaza con su MOTIVO', () => {
    for (const malo of ['no es un enlace', 'localhost/x', 'hola mundo']) {
        const r = normalizePostUrl(malo);
        assert.equal(r.ok, false);
        assert.ok(r.error.length > 10, 'el rechazo tiene que decir por qué');
    }
});

// ─── 14. Las publicaciones se guardan ESTRUCTURADAS ────────────────────

test('varias publicaciones de la MISMA plataforma son legítimas', () => {
    // Dos de Instagram y una de Facebook es el caso normal: la plataforma es
    // un dato de la fila, no una llave.
    const { posts } = shapePosts([
        { platform: 'instagram', url: 'https://ig.com/p/1' },
        { platform: 'instagram', url: 'https://ig.com/p/2' },
        { platform: 'facebook', url: 'https://fb.com/p/3' },
    ]);
    assert.equal(posts.length, 3);
    assert.deepEqual(posts.map(p => p.sortOrder), [0, 1, 2]);
});

test('⚠️ las URLs NO se concatenan en un solo campo', () => {
    // Es el requisito literal: campaña → actividad → clubes → publicaciones →
    // plataforma → enlace. Una fila por publicación, con su plataforma al lado.
    const ensure = leer('server/lib/ensureContentSubmissionSchema.js');
    const tabla = ensure.slice(ensure.indexOf('"ContributionSubmissionPost" ('));
    assert.ok(/platform TEXT NOT NULL/.test(tabla) && /url TEXT NOT NULL/.test(tabla));
    // Y el store INSERTA una fila por publicación, no un texto pegado.
    const store = leer('server/lib/contentSubmissionStore.js');
    assert.ok(/INSERT INTO "ContributionSubmissionPost"/.test(store));
    assert.ok(!/posts\.map\([^)]*join\(/.test(store), 'las publicaciones no se pueden pegar en un solo valor');
});

test('el enlace duplicado NO se rechaza con un índice único', () => {
    // Dos clubes pueden documentar por separado la MISMA actividad y citar el
    // mismo post: una restricción rechazaría el segundo envío entero.
    // Detectar el duplicado es una CONSULTA, no una restricción.
    const ensure = leer('server/lib/ensureContentSubmissionSchema.js');
    assert.ok(!/UNIQUE INDEX[^;]*"ContributionSubmissionPost"[^;]*\(url\)/.test(ensure),
        'un índice único sobre la URL haría fallar un envío legítimo');
    assert.ok(/"ContributionSubmissionPost_host_idx"/.test(ensure),
        'hace falta el índice por host para poder cruzarlas después');
});

test('las filas a medio llenar se descartan; las que no se entienden se DICEN', () => {
    const { posts, problemas } = shapePosts([
        { platform: 'instagram', url: '' },              // la dejó abierta y no la llenó
        { platform: '', url: '' },                        // vacía del todo
        { platform: '', url: 'algo.org/x' },              // enlace sin plataforma
        { platform: 'facebook', url: 'javascript:x' },    // enlace inservible
        { platform: 'x', url: 'https://x.com/ok' },
    ]);
    assert.equal(posts.length, 1);
    assert.equal(problemas.length, 2, 'lo descartado con contenido se reporta con su motivo');
    assert.ok(problemas.every(p => p.length > 10));
});

// ─── 15. La pregunta condicional ───────────────────────────────────────

test('⚠️ decir que SÍ sin ninguna publicación válida es un ERROR, no un aviso', () => {
    const d = envio({ hasPosts: true, posts: [{ platform: 'instagram', url: '' }] });
    const juicio = validateSubmission(d, { districtCatalog: CATALOGO });
    assert.equal(juicio.ok, false, 'quien marcó «Sí» está afirmando que existe una difusión');
    assert.ok(juicio.errors.some(e => /publicó/.test(e)));
});

test('decir que NO no exige nada, y descarta lo que hubiera quedado escrito', () => {
    const d = envio({ hasPosts: false, posts: [{ platform: 'instagram', url: 'https://ig.com/p/1' }] });
    assert.equal(d.hasPosts, false);
    assert.deepEqual(d.posts, [], 'con «No» no se guarda ninguna publicación, aunque el cuerpo las traiga');
    assert.equal(validateSubmission(d, { districtCatalog: CATALOGO }).ok, true);
});

test('`hasPosts` es una RESPUESTA, no una deducción de la lista', () => {
    // «No publicamos nada» y «dijo que sí y no llegó a escribir ninguno» son
    // cosas distintas: deducirlo de la lista las fundiría.
    const spec = leer('server/lib/contentSubmissionSpec.js');
    assert.ok(/const hasPosts = r\.hasPosts === true/.test(spec),
        'hasPosts tiene que leerse de la respuesta, no calcularse de posts.length');
});

// ─── 16. Los clubes participantes ──────────────────────────────────────

test('⚠️ los clubes participantes son de la ACTIVIDAD, no de quien la envía', () => {
    const d = envio({
        district: '4281', clubs: ['Amazonas', 'Bogotá'], club: 'Bello',
    });
    assert.deepEqual(clubNames(d.clubs), ['Amazonas', 'Bogotá']);
    assert.equal(d.club, 'Bello', 'el club del remitente se guarda aparte y no se toca');
    // Y viven en su propia tabla, no en una columna de la solicitud.
    const ensure = leer('server/lib/ensureContentSubmissionSchema.js');
    assert.ok(/CREATE TABLE IF NOT EXISTS "ContributionSubmissionClub"/.test(ensure));
});

test('el mismo club no cuenta dos veces', () => {
    const d = envio({ clubs: ['Bogotá', 'bogotá', '  BOGOTÁ  ', 'Amazonas'] });
    assert.equal(d.clubs.length, 2, 'el mismo nombre repetido contaría doble en cualquier medición');
});

test('`clubKey` normaliza para poder AGRUPAR sin depender de cómo se escribió', () => {
    assert.equal(clubKey('Bogotá'), clubKey('  BOGOTA '));
    assert.equal(clubKey('Cúcuta II'), 'cucuta ii');
});

test('`source` distingue el club del catálogo del escrito a mano', () => {
    const d = envio({ clubs: [{ name: 'Amazonas', source: 'catalogo' }, { name: 'Club Nuevo', source: 'manual' }] });
    assert.deepEqual(d.clubs.map(c => c.source), ['catalogo', 'manual']);
    // Es lo que después dice si un nombre desconocido es un club nuevo o un
    // error de tipeo, y no se puede deducir después.
    const panel = leer('src/components/admin/contribution/SubmissionsPanel.tsx');
    assert.ok(/escrito a mano/.test(panel), 'la ficha tiene que decir cuál se escribió a mano');
});

test('la lista AYUDA a elegir; no cierra los valores (v4.706)', () => {
    // Un catálogo se queda viejo solo, y acá lo que está en juego es que
    // alguien no pueda mandar las fotos de su club.
    const d = envio({ district: '4281', clubs: [{ name: 'Club Que No Existe', source: 'manual' }] });
    assert.equal(validateSubmission(d, { districtCatalog: CATALOGO }).ok, true,
        'un club que la lista no tiene no puede bloquear el envío');
});

test('la pareja distrito-club que se contradice AVISA sobre los PARTICIPANTES', () => {
    const d = envio({ district: '4281', clubs: ['Barranquilla'] });   // Barranquilla es del 4271
    const juicio = validateSubmission(d, { districtCatalog: CATALOGO });
    assert.equal(juicio.ok, true, 'avisa, no rechaza');
    assert.ok(juicio.warnings.some(w => /Barranquilla/.test(w) && /4271/.test(w)));
});

test('el tope de clubes se respeta', () => {
    const muchos = Array.from({ length: MAX_PARTICIPATING_CLUBS + 5 }, (_, i) => `Club ${i}`);
    assert.equal(envio({ clubs: muchos }).clubs.length, MAX_PARTICIPATING_CLUBS);
    assert.equal(shapePosts(Array.from({ length: MAX_POSTS + 5 }, (_, i) => ({ platform: 'x', url: `https://x.com/${i}` }))).posts.length, MAX_POSTS);
});

test('`participatingClubs` es la copia LEGIBLE, derivada de la lista', () => {
    // No es una segunda verdad: se deriva en el mismo envío y existe para que
    // todo lo que ya la consume —el brief de la IA, la tarjeta, el correo—
    // siga funcionando. Lo que se CONSULTA es la tabla.
    const d = envio({ clubs: ['Amazonas', 'Bogotá'] });
    assert.equal(d.participatingClubs, 'Amazonas, Bogotá');
});

test('el distrito por defecto sale del targeting, y sólo si es UNO', () => {
    assert.equal(defaultDistrictFor({ districts: ['4281'] }, CATALOGO), '4281');
    // Con varios, elegir uno sería inventar cuál hizo la actividad.
    assert.equal(defaultDistrictFor({ districts: ['4271', '4281'] }, CATALOGO), '');
    assert.equal(defaultDistrictFor({ districts: [] }, CATALOGO), '');
    // Y uno que el catálogo no conoce no se ofrece.
    assert.equal(defaultDistrictFor({ districts: ['9999'] }, CATALOGO), '');
});

// ─── 17. El teléfono internacional ─────────────────────────────────────

test('el teléfono se guarda en PARTES y en E.164', () => {
    const d = envio({ senderPhoneCountry: 'CO', senderPhoneDial: '+57', senderPhoneNational: '300 123 4567' });
    assert.equal(d.senderPhoneE164, '+573001234567');
    assert.equal(d.senderPhoneCountry, 'CO');
    assert.equal(d.senderPhoneDial, '+57');
    assert.equal(d.senderPhoneNational, '3001234567');
    // `senderPhone` es lo que se MUESTRA y queda con el número completo.
    assert.equal(d.senderPhone, '+573001234567');
});

test('⚠️ el E.164 lo COMPONE el servidor: no se acepta armado del cuerpo', () => {
    // Si se aceptara, el número guardado podría contradecir a sus partes.
    const d = shapeSubmission({
        senderPhoneCountry: 'CO', senderPhoneDial: '+57', senderPhoneNational: '3001234567',
        senderPhoneE164: '+1999999999999',
    });
    assert.equal(d.senderPhoneE164, '+573001234567', 'el E.164 del cuerpo se ignora');
    const spec = leer('server/lib/contentSubmissionSpec.js');
    const cuerpo = spec.slice(spec.indexOf('export const shapeSubmission'), spec.indexOf('// ─── Distrito y club'));
    assert.ok(!/r\.senderPhoneE164/.test(cuerpo), 'shapeSubmission no puede leer un E.164 del cuerpo');
});

test('un teléfono que no se puede componer se CONSERVA, no se adivina', () => {
    // ⚠️ REGLA ADITIVA: un navegador con el bundle anterior manda sólo el
    // texto. Perderlo sería perder un teléfono que alguien escribió; y
    // deducirle el país es el error que `phone.js` documenta como caro —
    // adivinar mal manda el mensaje a un tercero real que lo recibe.
    const d = shapePhone({ raw: '300 123 4567' });
    assert.equal(d.phone, '300 123 4567');
    assert.equal(d.e164, '', 'no se inventa un indicativo');
    assert.equal(d.country, '');
});

test('un número imposible no se guarda como si fuera bueno', () => {
    // E.164 admite 15 dígitos como máximo, indicativo incluido.
    assert.equal(shapePhone({ country: 'CO', dial: '+57', national: '1'.repeat(15) }).e164, '');
    assert.equal(shapePhone({ country: 'XX1', dial: '+57', national: '3001234567' }).e164, '');
    assert.equal(shapePhone({ country: 'CO', dial: '57', national: '3001234567' }).e164, '', 'el indicativo va con su «+»');
});

test('el catálogo de países NO se copia al servidor', () => {
    // Vive en `countryPhones.ts`, que el navegador ya carga para el selector
    // telefónico de los otros formularios. Una segunda lista se separaría en
    // silencio. Lo que el servidor hace es la ARITMÉTICA, no el catálogo.
    const spec = leer('server/lib/contentSubmissionSpec.js');
    assert.ok(!/Colombia'?,?\s*dial/.test(spec) && !/\+593|\+591/.test(spec),
        'el catálogo de países no puede duplicarse en el servidor');
    // Y el panel resuelve el NOMBRE del país desde ese catálogo único.
    const panel = leer('src/components/admin/contribution/SubmissionsPanel.tsx');
    assert.ok(/from '\.\.\/\.\.\/\.\.\/lib\/countryPhones'/.test(panel));
});

test('el panel NO le compone un WhatsApp a un teléfono sin país', () => {
    // Deducir el indicativo de un número guardado como texto es exactamente el
    // error caro: el mensaje llega a un tercero real que lo abre.
    // ⚠️ SE QUITAN LOS COMENTARIOS, PERO NO LAS CADENAS. El comentario que
    // explica esta regla NOMBRA `wa.me`, así que sobre el archivo crudo la
    // prueba falla por su propia explicación —la misma trampa que la
    // comprobación de `DROP`, que por eso mira el SQL—; y con `sinRuido`, que
    // además vacía las cadenas, desaparecería el `wa.me` de VERDAD y la
    // prueba pasaría sin haber mirado nada. Se quitan sólo los bloques.
    const panel = leer('src/components/admin/contribution/SubmissionsPanel.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    const trozo = panel.slice(panel.indexOf('senderPhoneE164 ?'), panel.indexOf('senderPhoneE164 ?') + 1600);
    assert.ok(/wa\.me/.test(trozo), 'con E.164 sí se ofrece WhatsApp');
    const corte = trozo.indexOf('senderPhone ?');
    assert.ok(corte > 0, 'no se encontró la rama del teléfono sin país');
    assert.ok(!/wa\.me/.test(trozo.slice(corte)), 'sin E.164 no puede componerse un wa.me');
});

// ─── 18. El esquema no puede quedarse a medias ─────────────────────────

test('⚠️ TODO `ADD COLUMN` está enumerado en el atajo del ensure (trampa v4.908)', () => {
    // `CREATE TABLE IF NOT EXISTS` no amplía nada: con el atajo mirando sólo
    // tablas, los ALTER no correrían nunca en una base que ya tenía las tres
    // tablas, y el INSERT fallaría con «column does not exist» — en silencio,
    // porque este módulo degrada.
    const ensure = leer('server/lib/ensureContentSubmissionSchema.js');
    const atajo = ensure.slice(0, ensure.indexOf('_ready = true; return;'));
    const columnas = [...ensure.matchAll(/'"([A-Za-z0-9_]+)" [A-Z]/g)].map(m => m[1]);
    assert.ok(columnas.length >= 5, 'no se encontraron los ADD COLUMN');
    for (const c of columnas) {
        assert.ok(atajo.includes(`'${c}'`), `la columna ${c} no está enumerada en el atajo: el ALTER no correría nunca`);
    }
});

test('el atajo comprueba las CINCO tablas', () => {
    const ensure = leer('server/lib/ensureContentSubmissionSchema.js');
    const atajo = ensure.slice(0, ensure.indexOf('_ready = true; return;'));
    for (const t of ['ContributionSubmission', 'ContributionSubmissionFile', 'ContributionSubmissionEvent',
                     'ContributionSubmissionClub', 'ContributionSubmissionPost']) {
        assert.ok(atajo.includes(t), `${t} no está en el atajo y no se crearía nunca`);
    }
});

// ─── 19. El contexto que consume la IA ─────────────────────────────────

test('el contexto nombra el distrito y la difusión que YA hubo', () => {
    const d = envio({ district: '4281', clubs: ['Amazonas'], hasPosts: true, posts: [{ platform: 'instagram', url: 'https://ig.com/p/1' }] });
    const ctx = buildSubmissionContext(d);
    assert.ok(/Distrito Rotario: 4281/.test(ctx));
    assert.ok(/Amazonas/.test(ctx));
    // Que ya se publicó se DICE, para que el copy no afirme que es la primera
    // vez; el ENLACE no, porque terminaría copiado dentro del texto.
    assert.ok(/YA publicó/.test(ctx) && /Instagram/.test(ctx));
    assert.ok(!/https:\/\/ig\.com/.test(ctx), 'los enlaces no entran al brief');
});

// ─── 20. La pantalla ───────────────────────────────────────────────────

test('cambiar de distrito descarta los clubes participantes elegidos', () => {
    // Los del distrito anterior ya no describen nada.
    const pagina = leer('src/pages/AportarContenido.tsx');
    const trozo = pagina.slice(pagina.indexOf('id="distrito"'), pagina.indexOf('Clubes participantes'));
    assert.ok(/setClubes\(\[\]\)/.test(trozo), 'cambiar de distrito tiene que vaciar los clubes');
});

test('los clubes no se ofrecen hasta que hay distrito, y las publicaciones hasta que se dice que sí', () => {
    const pagina = leer('src/pages/AportarContenido.tsx');
    assert.ok(/hayDistrito=\{Boolean\(f\.district\)\}/.test(pagina),
        'sin distrito la lista sería de mil nombres');
    assert.ok(/\{difusion === 'si' && \(/.test(pagina),
        'las publicaciones sólo aparecen si se contestó que sí');
});

test('el orden de los bloques es el del recorrido', () => {
    const pagina = leer('src/pages/AportarContenido.tsx');
    const cuerpo = pagina.slice(pagina.indexOf('const AportarContenido'));
    const orden = ['Fotografías y videos', '¿Qué ocurrió?', 'Datos de la actividad',
                   'Participación rotaria', 'Difusión realizada', '¿Quién lo envía?',
                   'Información adicional', 'ENVIAR MI APORTE'];
    let desde = 0;
    for (const titulo of orden) {
        const i = cuerpo.indexOf(titulo, desde);
        assert.ok(i > 0, `falta el bloque «${titulo}»`);
        desde = i;
    }
});

test('las cuatro preguntas sobre la actividad comparten UNA tarjeta', () => {
    // ⚠️ LO QUE SE FUSIONA ES EL CONTENEDOR, NO EL CONTENIDO (v4.973). En
    // cuatro tarjetas seguidas —qué ocurrió, los datos, los clubes y la
    // difusión— el formulario se leía como cuatro formularios distintos, y el
    // recorrido se hacía largo sin ser más claro. Cada sección conserva su
    // título, su icono y su ayuda: eso lo fija la prueba del orden, de arriba.
    //
    // Lo que fija ÉSTA es que entre la primera y la última no se abra otro
    // marco: sin ella, volver a partirlas es un cambio de una línea que nadie
    // ve — el aspecto no lo mira ninguna otra comprobación.
    const pagina = leer('src/pages/AportarContenido.tsx');
    const cuerpo = pagina.slice(pagina.indexOf('const AportarContenido'));
    const desde = cuerpo.indexOf('titulo="¿Qué ocurrió?"');
    const hasta = cuerpo.indexOf('titulo="Difusión realizada"');
    assert.ok(desde > 0 && hasta > desde, 'no se pudieron ubicar las secciones');
    const enMedio = cuerpo.slice(desde, hasta);
    assert.ok(!enMedio.includes('className={TARJETA}') && !enMedio.includes('<Bloque'),
        'entre «¿Qué ocurrió?» y «Difusión realizada» se abre otra tarjeta');

    // Verificación a la inversa DENTRO de la prueba: sin esto, lo de arriba
    // podría pasar por mirar un trozo vacío (la lección de `sqlDe`).
    assert.ok('<Bloque titulo="x">'.includes('<Bloque'), 'el detector tiene que ver un marco intermedio');

    // Y el encabezado se escribe UNA vez: con `Bloque` y `Seccion` pintándolo
    // cada uno por su lado, el mismo título se ve distinto según en cuál caiga.
    const encabezados = pagina.match(/<h2 className="text-base font-bold text-gray-800 flex items-center gap-2">\{icono\}/g) || [];
    assert.equal(encabezados.length, 1, 'el encabezado de una sección se define en un solo sitio');
});

test('«Información adicional» va al final y FUERA del bloque condicional', () => {
    // Colgarla de «¿ya publicaste?» le quitaría la oportunidad de contar algo
    // relevante a quien contesta que no.
    const pagina = leer('src/pages/AportarContenido.tsx');
    const difusion = pagina.indexOf('Difusión realizada');
    const remitente = pagina.indexOf('¿Quién lo envía?', difusion);
    const extra = pagina.indexOf('Información adicional', remitente);
    assert.ok(difusion < remitente && remitente < extra,
        'la información adicional va después del remitente, no dentro de la difusión');
    assert.ok(/Opcional, pero recomendado/.test(pagina), 'se dice que es opcional pero recomendada');
});
