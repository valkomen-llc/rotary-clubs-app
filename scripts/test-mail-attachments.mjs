#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// ADJUNTOS DEL COMPOSITOR DE CORREO.  npm run test:mail-attachments
// v4.953.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED: S3 y el presigner se sustituyen con
// un hook de resolución de módulos. El criterio es puro; el CAMINO del store
// se ejercita de punta a punta.
//
// Lo que protege, en orden de lo que costaría equivocarse:
//
//   1. QUE EL CASO REPORTADO (3 MB + 2 MB) SEA VÁLIDO Y NO VIAJE POR EL
//      CUERPO. El 413 salía del borde de Vercel (~4,5 MB) con los adjuntos en
//      base64 dentro del JSON; ahora suben directo a S3 y el envío lleva la
//      CLAVE. Si el compositor vuelve a mandar base64, esto falla.
//
//   2. QUE UNA CLAVE AJENA NO SE ADJUNTE. El envío lee objetos de S3: sin el
//      alcance por sitio, cualquier sesión adjuntaría archivos privados de
//      otro club conociendo su clave.
//
//   3. QUE LOS LÍMITES SE JUZGUEN SOBRE EL TAMAÑO REAL del objeto, no sobre
//      lo declarado al prefirmar — lo declarado no obliga a nada (v4.943).
//
//   4. QUE LOS DOS ESPEJOS DIGAN LO MISMO, número a número y frase a frase:
//      la UI avisa ANTES de enviar con el mismo criterio que rechaza el
//      servidor.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;

const S3STUB = `data:text/javascript,${encodeURIComponent(`
export class PutObjectCommand { constructor(input){ this.__type='Put'; this.input=input; } }
export class GetObjectCommand { constructor(input){ this.__type='Get'; this.input=input; } }
export class HeadObjectCommand { constructor(input){ this.__type='Head'; this.input=input; } }
export class DeleteObjectCommand { constructor(input){ this.__type='Delete'; this.input=input; } }
`)}`;
const STORAGE = `data:text/javascript,${encodeURIComponent(`
export const s3 = { send: async (cmd) => globalThis.__S3SEND(cmd) };
`)}`;
const PRESIGNER = `data:text/javascript,${encodeURIComponent(`
export const getSignedUrl = async (_c, cmd) => 'https://s3.example/' + encodeURIComponent(cmd.input.Key) + '?firmada&tipo=' + encodeURIComponent(cmd.input.ContentType || '');
`)}`;

// ⚠️ El hook va codificado ENTERO con encodeURIComponent: el cuerpo de una
// `data:` URL se percent-DECODIFICA al cargarse, así que los %20/%0A de las
// URLs de los stubs interpoladas arriba se volverían espacios y saltos de
// línea reales dentro de un string y el módulo no parsearía.
const HOOK = `export async function resolve(s,c,n){
    if(s==='@aws-sdk/client-s3') return {url:${JSON.stringify(S3STUB)},shortCircuit:true};
    if(s==='@aws-sdk/s3-request-presigner') return {url:${JSON.stringify(PRESIGNER)},shortCircuit:true};
    if(/(^|\\/)storage\\.js$/.test(s)) return {url:${JSON.stringify(STORAGE)},shortCircuit:true};
    return n(s,c);
}`;
register(`data:text/javascript,${encodeURIComponent(HOOK)}`, HERE);

const spec = await import('../server/lib/mailAttachments.js');
const store = await import('../server/lib/mailAttachmentStore.js');

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const leer = f => readFileSync(f, 'utf8');
const codigo = f => leer(f).replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const MB = 1024 * 1024;

// ════════════════════════════════════════════════════════════════════
grupo('1 · EL CRITERIO: los límites y sus frases');

check('10 MB por archivo, 15 MB en total, y el total supera al individual',
    spec.MAX_MAIL_FILE_BYTES === 10 * MB && spec.MAX_MAIL_TOTAL_BYTES === 15 * MB
    && spec.MAX_MAIL_TOTAL_BYTES > spec.MAX_MAIL_FILE_BYTES);

// ⚠️ EL CASO DEL REPORTE: 3,0 MB + 2,0 MB tiene que ser un envío VÁLIDO.
const reporte = spec.checkMailAttachments([
    { filename: 'Invitación Fundación Decathlon.pdf', size: 3.0 * MB },
    { filename: 'Camisetas Jaque Mate a la Polio.pdf', size: 2.0 * MB },
]);
check('el caso reportado (3 MB + 2 MB) pasa la validación', reporte.ok && reporte.totalBytes === 5 * MB);

const grande = spec.checkMailAttachments([{ filename: 'video.mp4', size: 11 * MB }]);
check('un archivo de 11 MB se rechaza NOMBRANDO el archivo y los números',
    !grande.ok && grande.errores[0].includes('«video.mp4»') && grande.errores[0].includes('11.0 MB') && grande.errores[0].includes('10.0 MB'));

const total = spec.checkMailAttachments([
    { filename: 'a.pdf', size: 6 * MB }, { filename: 'b.pdf', size: 6 * MB }, { filename: 'c.pdf', size: 5 * MB },
]);
check('17 MB entre tres archivos se rechaza por el TOTAL, con los números',
    !total.ok && total.errores[0].includes('17.0 MB') && total.errores[0].includes('15.0 MB'));

const varios = spec.checkMailAttachments([
    { filename: 'x.zip', size: 12 * MB }, { filename: '', size: 1 * MB }, { filename: 'vacio.txt', size: 0 },
]);
check('se devuelven TODOS los problemas, no sólo el primero', !varios.ok && varios.errores.length === 3);

check('lista vacía y nula pasan',
    spec.checkMailAttachments([]).ok && spec.checkMailAttachments(null).ok);

// ════════════════════════════════════════════════════════════════════
grupo('2 · ⚠️ UNA CLAVE AJENA NO EXISTE PARA ESTE SITIO');

const CLUB = 'club-123';
check('la clave del propio sitio pertenece',
    spec.mailAttachmentKeyBelongs(`private/mail-attachments/${CLUB}/abc-doc.pdf`, CLUB));
check('la clave de OTRO sitio no pertenece',
    !spec.mailAttachmentKeyBelongs('private/mail-attachments/club-999/abc-doc.pdf', CLUB));
check('un traversal no pertenece',
    !spec.mailAttachmentKeyBelongs(`private/mail-attachments/${CLUB}/../club-999/doc.pdf`, CLUB));
check('un prefijo ajeno del bucket no pertenece',
    !spec.mailAttachmentKeyBelongs(`clubs/${CLUB}/images/foto.jpg`, CLUB));
check('sin clubId nada pertenece',
    !spec.mailAttachmentKeyBelongs(`private/mail-attachments/${CLUB}/doc.pdf`, ''));

check('el nombre se sanea para la clave',
    spec.safeMailFilename('Invitación Decathlon (v2).pdf') === 'Invitaci_n_Decathlon__v2_.pdf'
    && spec.safeMailFilename('') === 'adjunto');

check('inlineSizeOf mide el base64 decodificado',
    spec.inlineSizeOf('QUJD') === 3 && spec.inlineSizeOf('QQ==') === 1 && spec.inlineSizeOf('') === 0);

const split = spec.splitSendAttachments([
    { filename: 'a.pdf', key: 'private/mail-attachments/x/a' },
    { filename: 'b.pdf', content: 'QUJD' },
    { filename: 'c.pdf' },
]);
check('splitSendAttachments separa clave / inline / inválido',
    split.keyed.length === 1 && split.inline.length === 1 && split.invalid.length === 1);

// ════════════════════════════════════════════════════════════════════
grupo('3 · EL CAMINO DEL STORE (S3 sustituido)');

const llamadas = [];
const objetos = new Map();
globalThis.__S3SEND = async (cmd) => {
    llamadas.push(cmd.__type);
    const key = cmd.input.Key;
    if (cmd.__type === 'Head') {
        const o = objetos.get(key);
        if (!o) { const e = new Error('NotFound'); e.name = 'NotFound'; throw e; }
        return { ContentLength: o.bytes.length, ContentType: o.contentType };
    }
    if (cmd.__type === 'Get') {
        const o = objetos.get(key);
        if (!o) { const e = new Error('NoSuchKey'); e.name = 'NoSuchKey'; throw e; }
        return { Body: { transformToByteArray: async () => o.bytes }, ContentType: o.contentType };
    }
    if (cmd.__type === 'Delete') { objetos.delete(key); return {}; }
    return {};
};

const pre = await store.presignMailAttachment({ clubId: CLUB, filename: 'doc.pdf', contentType: 'application/pdf', size: 3 * MB });
check('prefirmar devuelve una clave del prefijo del sitio y la URL firmada',
    pre.ok && pre.key.startsWith(`private/mail-attachments/${CLUB}/`) && pre.uploadUrl.includes('firmada'));

const preGrande = await store.presignMailAttachment({ clubId: CLUB, filename: 'video.mp4', contentType: 'video/mp4', size: 11 * MB });
check('prefirmar un archivo de 11 MB se rechaza con la frase del criterio',
    !preGrande.ok && preGrande.error.includes('11.0 MB'));

const preSinSitio = await store.presignMailAttachment({ clubId: '', filename: 'doc.pdf', size: 1 * MB });
check('prefirmar sin sitio se rechaza', !preSinSitio.ok);

// Resolver: clave ajena — el objeto "no existe" y S3 ni se consulta.
llamadas.length = 0;
const ajena = await store.resolveSendAttachments([{ filename: 'robo.pdf', key: 'private/mail-attachments/club-999/x.pdf' }], CLUB);
check('⚠️ una clave de OTRO sitio se rechaza SIN consultar S3',
    !ajena.ok && llamadas.length === 0 && ajena.error.includes('robo.pdf'));

// Resolver: el camino feliz, con el contenido de verdad.
const bytes = new TextEncoder().encode('PDFalso');
objetos.set(pre.key, { bytes, contentType: 'application/pdf' });
const feliz = await store.resolveSendAttachments([{ filename: 'doc.pdf', key: pre.key, contentType: 'application/pdf' }], CLUB);
check('una clave propia se resuelve a base64 con su tipo',
    feliz.ok && feliz.attachments.length === 1
    && Buffer.from(feliz.attachments[0].content, 'base64').toString() === 'PDFalso'
    && feliz.attachments[0].contentType === 'application/pdf'
    && feliz.keys.length === 1);

// ⚠️ El límite se juzga sobre el TAMAÑO REAL: un objeto inflado después de
// prefirmar no se descarga (HEAD corta antes del GET).
llamadas.length = 0;
objetos.set(`private/mail-attachments/${CLUB}/inflado.bin`, { bytes: new Uint8Array(11 * MB), contentType: 'application/octet-stream' });
const inflado = await store.resolveSendAttachments([{ filename: 'inflado.bin', key: `private/mail-attachments/${CLUB}/inflado.bin` }], CLUB);
check('⚠️ un objeto inflado a 11 MB se rechaza en el HEAD, sin descargarlo',
    !inflado.ok && inflado.error.includes('11.0 MB') && llamadas.includes('Head') && !llamadas.includes('Get'));

// El TOTAL real también se juzga: dos objetos de 8 MB reales suman 16.
objetos.set(`private/mail-attachments/${CLUB}/a8.bin`, { bytes: new Uint8Array(8 * MB), contentType: 'application/octet-stream' });
objetos.set(`private/mail-attachments/${CLUB}/b8.bin`, { bytes: new Uint8Array(8 * MB), contentType: 'application/octet-stream' });
const dieciseis = await store.resolveSendAttachments([
    { filename: 'a8.bin', key: `private/mail-attachments/${CLUB}/a8.bin` },
    { filename: 'b8.bin', key: `private/mail-attachments/${CLUB}/b8.bin` },
], CLUB);
check('16 MB REALES entre dos objetos se rechazan por el total', !dieciseis.ok && dieciseis.error.includes('16.0 MB'));

// Un borrador anterior a v4.953 trae el contenido inline y sigue enviándose.
const legado = await store.resolveSendAttachments([{ filename: 'viejo.txt', content: Buffer.from('hola').toString('base64'), contentType: 'text/plain' }], CLUB);
check('un adjunto inline de un borrador viejo pasa tal cual',
    legado.ok && legado.attachments[0].content === Buffer.from('hola').toString('base64') && legado.keys.length === 0);

const sinNada = await store.resolveSendAttachments([{ filename: 'x.pdf' }], CLUB);
check('un adjunto sin clave ni contenido se rechaza con salida', !sinNada.ok && sinNada.error.includes('vuelve a adjuntarlo'));

check('sin adjuntos, el envío sigue igual que siempre',
    (await store.resolveSendAttachments(undefined, CLUB)).ok
    && (await store.resolveSendAttachments(undefined, CLUB)).attachments === undefined);

// El borrado a mejor esfuerzo sólo toca el prefijo propio.
llamadas.length = 0;
await store.deleteMailAttachments([pre.key, 'clubs/otro/foto.jpg', 'private/mail-attachments/x/../y.pdf']);
check('el borrado sólo toca claves del prefijo propio (1 de 3)',
    llamadas.filter(t => t === 'Delete').length === 1 && !objetos.has(pre.key));

// ════════════════════════════════════════════════════════════════════
grupo('4 · EL CABLEADO: los archivos hacen lo que esta versión promete');

const ctrl = codigo('server/controllers/communicationController.js');
check('sendCommunication resuelve los adjuntos ANTES de EmailService',
    ctrl.includes('resolveSendAttachments') &&
    ctrl.indexOf('resolveSendAttachments') < ctrl.indexOf('EmailService.sendEmail({'));
check('un adjunto irresoluble responde 400 con su motivo, no 500',
    /status\(400\)\.json\(\{ error: adjuntos\.error \}\)/.test(ctrl));
check('los objetos ya enviados se borran ESPERANDO antes de responder',
    /await deleteMailAttachments\(adjuntos\.keys\)/.test(ctrl));

const ui = codigo('src/pages/admin/EmailManagement.tsx');
check('⚠️ el compositor ya no lee el archivo a base64 (readAsDataURL fuera)',
    !ui.includes('readAsDataURL'));
check('el compositor pide la URL prefirmada y sube con PUT',
    ui.includes('/api/email-accounts/attachments/presign') && ui.includes("method: 'PUT'"));
check('el compositor valida los límites ANTES de enviar',
    ui.includes('checkMailAttachments(attachments)'));
check('un fallo HTTP se traduce con describeMailSendError (413 incluido)',
    ui.includes('describeMailSendError(response.status'));
check('el tope viejo de 8 MB —mayor que lo que Vercel permitía— desapareció',
    !ui.includes('MAX_ATTACH_TOTAL'));

const rutas = codigo('server/routes/emailAccounts.js');
check('la ruta literal /attachments/presign está declarada',
    rutas.includes("router.post('/attachments/presign'"));

const st = codigo('server/lib/mailAttachmentStore.js');
check('el store mide con HEAD antes de bajar con GET',
    st.indexOf('HeadObjectCommand({') < st.indexOf('GetObjectCommand({'));
check('el store usa el cliente COMPARTIDO de storage.js — no un segundo camino a S3',
    /from '\.\/storage\.js'/.test(st) && !st.includes('new S3Client'));

// ════════════════════════════════════════════════════════════════════
grupo('5 · LOS DOS ESPEJOS DICEN LO MISMO (pide esbuild; se salta si falta)');

let esbuild = null;
try { esbuild = await import('esbuild'); } catch { /* sin esbuild */ }
if (!esbuild || !existsSync('src/lib/mailAttachments.ts')) {
    console.log('  (saltado: falta esbuild o el espejo)');
} else {
    const out = esbuild.transformSync(leer('src/lib/mailAttachments.ts'), { loader: 'ts', format: 'esm' });
    const mirror = await import(`data:text/javascript,${encodeURIComponent(out.code)}`);
    check('los límites coinciden número a número',
        mirror.MAX_MAIL_FILE_BYTES === spec.MAX_MAIL_FILE_BYTES
        && mirror.MAX_MAIL_TOTAL_BYTES === spec.MAX_MAIL_TOTAL_BYTES);
    const casos = [
        [],
        [{ filename: 'a.pdf', size: 3 * MB }, { filename: 'b.pdf', size: 2 * MB }],
        [{ filename: 'video.mp4', size: 11 * MB }],
        [{ filename: 'a.pdf', size: 6 * MB }, { filename: 'b.pdf', size: 6 * MB }, { filename: 'c.pdf', size: 5 * MB }],
        [{ filename: '', size: 1 * MB }, { filename: 'v.txt', size: 0 }],
    ];
    const iguales = casos.every(c => JSON.stringify(mirror.checkMailAttachments(c)) === JSON.stringify(spec.checkMailAttachments(c)));
    check('checkMailAttachments da LA MISMA salida en los dos espejos (5 casos)', iguales);
    check('el 413 sin cuerpo se traduce a un mensaje con salida',
        mirror.describeMailSendError(413).includes('tamaño máximo') && mirror.describeMailSendError(413).includes('adjuntos'));
    check('el texto del SERVIDOR manda cuando existe',
        mirror.describeMailSendError(413, 'motivo del servidor') === 'motivo del servidor');
    check('401 dice que la sesión venció; 500 dice reintentar',
        mirror.describeMailSendError(401).includes('sesión') && mirror.describeMailSendError(500).includes('Inténtalo'));
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${ok} comprobaciones en verde${malos.length ? `, ${malos.length} EN ROJO:` : '.'}`);
malos.forEach(m => console.log(`  ✗ ${m}`));
process.exit(malos.length ? 1 : 0);
