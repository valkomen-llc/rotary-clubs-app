// ════════════════════════════════════════════════════════════════════
// Programas — el formulario institucional: el criterio — v4.1286.0
//
// Puro: sin base, sin S3, sin red. Lo usan el controlador, el almacén y las
// pruebas. El navegador NO lleva un espejo de este archivo: recibe el
// esquema ya resuelto para el programa (`resolveIntakeForm`), así que un
// solo lugar decide qué se pregunta, con qué etiqueta y qué es obligatorio.
//
// UN SOLO FORMULARIO PARA TODOS LOS PROGRAMAS. Las secciones y los campos son
// datos (`INTAKE_SECTIONS`); cada programa los adapta desde el administrador
// (`intakeConfig`: secciones aplicables, campos obligatorios u ocultos,
// ayudas propias, vocabulario de salud o general). Nada de un formulario por
// iniciativa.
//
// LO QUE LLEGA ES UNA PROPUESTA. Un envío (`ProgramIntake`) nunca toca el
// programa: se revisa por ítem (cada bloque de campos y cada registro de una
// lista), y lo aprobado se APLICA convirtiéndolo en solicitudes de cambio del
// flujo editorial de siempre (`ProgramChangeRequest`), que conservan la
// revisión médica, la aprobación y la publicación. Un campo vacío no es una
// orden de borrar: sólo viaja lo que tiene valor.
//
// Ver `docs/claude/formulario-institucional-de-programas.md`.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const multi = (v, max) => String(v ?? '').trim().replace(/\r\n/g, '\n').slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─── Envíos ───────────────────────────────────────────────────────────

export const SUBMISSION_TYPES = [
    { id: 'carga_inicial', label: 'Carga inicial', help: 'Primera vez que se entrega la información del programa. Puedes completarla en varias sesiones.' },
    { id: 'actualizacion', label: 'Actualización de información', help: 'Cambiar o completar secciones puntuales. Lo que no envíes conserva su valor actual.' },
    { id: 'aporte', label: 'Aporte de contenido', help: 'Fotografías, historias, testimonios, recursos o indicadores nuevos.' },
];
export const SUBMISSION_TYPE_IDS = SUBMISSION_TYPES.map(t => t.id);

export const INTAKE_STATES = {
    borrador: { id: 'borrador', label: 'Borrador', tone: 'gray' },
    enviado: { id: 'enviado', label: 'Enviado', tone: 'sky' },
    en_revision: { id: 'en_revision', label: 'En revisión', tone: 'amber' },
    ajustes: { id: 'ajustes', label: 'Ajustes solicitados', tone: 'orange' },
    aplicado: { id: 'aplicado', label: 'Aplicado', tone: 'emerald' },
    archivado: { id: 'archivado', label: 'Archivado', tone: 'gray' },
};
export const INTAKE_STATE_IDS = Object.keys(INTAKE_STATES);
/** Sólo en estos estados quien envía puede seguir editando con su enlace. */
export const INTAKE_EDITABLE = ['borrador', 'ajustes'];
const INTAKE_FLOW = {
    borrador: ['enviado', 'archivado'],
    enviado: ['en_revision', 'ajustes', 'archivado'],
    en_revision: ['ajustes', 'aplicado', 'archivado', 'enviado'],
    ajustes: ['enviado', 'archivado'],
    aplicado: ['en_revision', 'archivado'],
    archivado: ['en_revision'],
};
export const canTransitionIntake = (from, to) => Array.isArray(INTAKE_FLOW[from]) && INTAKE_FLOW[from].includes(to);

/** La decisión sobre UN ítem del envío. «aplicado» sólo lo escribe la acción de aplicar. */
export const ITEM_DECISIONS = {
    pendiente: { id: 'pendiente', label: 'Sin revisar', tone: 'gray' },
    aprobado: { id: 'aprobado', label: 'Aprobado', tone: 'emerald' },
    ajustes: { id: 'ajustes', label: 'Requiere ajustes', tone: 'orange' },
    descartado: { id: 'descartado', label: 'Descartado', tone: 'gray' },
    aplicado: { id: 'aplicado', label: 'Aplicado', tone: 'blue' },
};
export const REVIEWABLE_DECISIONS = ['pendiente', 'aprobado', 'ajustes', 'descartado'];

// ─── Archivos: categorías, formatos reales y límites configurables ──────

/** Firmas de los primeros bytes. `at` = desplazamiento; `ftyp` = familia ISO. */
const FORMATS = {
    jpg: { mime: 'image/jpeg', kind: 'image', magic: [[0xff, 0xd8, 0xff]] },
    jpeg: { mime: 'image/jpeg', kind: 'image', magic: [[0xff, 0xd8, 0xff]] },
    png: { mime: 'image/png', kind: 'image', magic: [[0x89, 0x50, 0x4e, 0x47]] },
    webp: { mime: 'image/webp', kind: 'image', riff: 'WEBP' },
    heic: { mime: 'image/heic', kind: 'image', ftyp: ['heic', 'heix', 'mif1', 'msf1', 'hevc', 'heim', 'heis'] },
    heif: { mime: 'image/heif', kind: 'image', ftyp: ['heic', 'heix', 'mif1', 'msf1', 'hevc', 'heim', 'heis'] },
    tif: { mime: 'image/tiff', kind: 'image', magic: [[0x49, 0x49, 0x2a, 0x00], [0x4d, 0x4d, 0x00, 0x2a]] },
    tiff: { mime: 'image/tiff', kind: 'image', magic: [[0x49, 0x49, 0x2a, 0x00], [0x4d, 0x4d, 0x00, 0x2a]] },
    mp4: { mime: 'video/mp4', kind: 'video', ftyp: '*' },
    m4v: { mime: 'video/mp4', kind: 'video', ftyp: '*' },
    mov: { mime: 'video/quicktime', kind: 'video', ftyp: '*', qt: true },
    webm: { mime: 'video/webm', kind: 'video', magic: [[0x1a, 0x45, 0xdf, 0xa3]] },
    mp3: { mime: 'audio/mpeg', kind: 'audio', magic: [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]] },
    m4a: { mime: 'audio/mp4', kind: 'audio', ftyp: '*' },
    wav: { mime: 'audio/wav', kind: 'audio', riff: 'WAVE' },
    ogg: { mime: 'audio/ogg', kind: 'audio', magic: [[0x4f, 0x67, 0x67, 0x53]] },
    pdf: { mime: 'application/pdf', kind: 'document', magic: [[0x25, 0x50, 0x44, 0x46]] },
    docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document', magic: [[0x50, 0x4b, 0x03, 0x04]] },
    xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'document', magic: [[0x50, 0x4b, 0x03, 0x04]] },
    pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document', magic: [[0x50, 0x4b, 0x03, 0x04]] },
    doc: { mime: 'application/msword', kind: 'document', magic: [[0xd0, 0xcf, 0x11, 0xe0]] },
    svg: { mime: 'image/svg+xml', kind: 'design', svg: true },
    ai: { mime: 'application/postscript', kind: 'design', magic: [[0x25, 0x50, 0x44, 0x46], [0x25, 0x21, 0x50, 0x53]] },
    eps: { mime: 'application/postscript', kind: 'design', magic: [[0x25, 0x21, 0x50, 0x53], [0xc5, 0xd0, 0xd3, 0xc6]] },
    psd: { mime: 'image/vnd.adobe.photoshop', kind: 'design', magic: [[0x38, 0x42, 0x50, 0x53]] },
    zip: { mime: 'application/zip', kind: 'design', magic: [[0x50, 0x4b, 0x03, 0x04]] },
};
export const INTAKE_FORMATS = FORMATS;

/** Qué formatos admite cada uso de archivo dentro del formulario. */
export const FILE_PURPOSES = {
    logo: { label: 'Logo o variante', exts: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai', 'eps', 'psd', 'zip', 'tif', 'tiff'] },
    brand: { label: 'Manual o archivo original de identidad', exts: ['pdf', 'zip', 'ai', 'eps', 'psd', 'svg', 'png', 'jpg', 'jpeg', 'docx', 'pptx'] },
    photo: { label: 'Fotografía', exts: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff'] },
    media: { label: 'Material multimedia', exts: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'tif', 'tiff', 'mp4', 'm4v', 'mov', 'webm', 'mp3', 'm4a', 'wav', 'ogg', 'pdf', 'docx', 'pptx'] },
    document: { label: 'Documento', exts: ['pdf', 'docx', 'doc', 'xlsx', 'pptx', 'jpg', 'jpeg', 'png'] },
    authorization: { label: 'Soporte de autorización', exts: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'heic', 'heif'] },
    support: { label: 'Soporte o instrucciones', exts: ['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png'] },
};
export const FILE_PURPOSE_IDS = Object.keys(FILE_PURPOSES);
/** Lo que es PRIVADO por naturaleza: nunca se promueve a la Biblioteca pública. */
export const PRIVATE_PURPOSES = ['document', 'authorization', 'support', 'brand'];

const mb = (envName, fallback) => {
    const n = Number.parseInt(process.env[envName] || '', 10);
    return (Number.isFinite(n) && n > 0 ? n : fallback) * 1024 * 1024;
};
/**
 * Los topes por tipo de archivo, CONFIGURABLES por entorno y explicados
 * antes de cargar. Los valores por omisión salen de la infraestructura real:
 * el navegador sube directo a S3 (Vercel nunca ve los bytes), un PUT único
 * llega a 5 GB y una carga multiparte, por partes de 16 MB, mucho más. Se
 * eligen topes por debajo para que un móvil termine la carga, no por gusto.
 */
export const intakeLimits = () => ({
    image: mb('PROGRAM_INTAKE_IMAGE_MB', 80),
    video: mb('PROGRAM_INTAKE_VIDEO_MB', 4096),
    audio: mb('PROGRAM_INTAKE_AUDIO_MB', 500),
    document: mb('PROGRAM_INTAKE_DOCUMENT_MB', 100),
    design: mb('PROGRAM_INTAKE_DESIGN_MB', 1024),
    filesPerIntake: Number.parseInt(process.env.PROGRAM_INTAKE_MAX_FILES || '', 10) || 400,
    multipartThreshold: 64 * 1024 * 1024,
    partSize: 16 * 1024 * 1024,
});

export const fileExtension = (filename) => {
    const m = /\.([a-z0-9]+)$/i.exec(String(filename || ''));
    return m ? m[1].toLowerCase() : '';
};
export const fmtSize = (bytes) => {
    const n = Number(bytes) || 0;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(n % 1024 ** 3 ? 1 : 0)} GB`;
    return `${Math.round(n / 1024 ** 2)} MB`;
};

/** Lo declarado ANTES de subir (nombre, peso, uso). El contenido real se mira después. */
export const checkIntakeFile = ({ filename, size, purpose }, limits = intakeLimits()) => {
    const errores = [];
    const ext = fileExtension(filename);
    const p = FILE_PURPOSES[purpose];
    const fmt = FORMATS[ext];
    if (!p) errores.push('Indica para qué es el archivo.');
    else if (!fmt || !p.exts.includes(ext)) errores.push(`Formato no admitido para «${p.label}». Se acepta: ${p.exts.map(e => e.toUpperCase()).join(', ')}.`);
    const bytes = Number(size) || 0;
    if (bytes <= 0) errores.push('El archivo llegó vacío.');
    const max = fmt ? limits[fmt.kind] : 0;
    if (fmt && bytes > max) {
        errores.push(fmt.kind === 'video' || fmt.kind === 'audio'
            ? `El archivo supera ${fmtSize(max)}. Para materiales más grandes comparte un enlace (YouTube, Vimeo, Drive o similar).`
            : `El archivo supera ${fmtSize(max)}.`);
    }
    return { ok: errores.length === 0, errores, ext: fmt ? ext : null, kind: fmt?.kind || null, mime: fmt?.mime || null, multipart: bytes > limits.multipartThreshold };
};

/** El tipo REAL por los primeros bytes (hasta 512). `null` si no coincide con la extensión. */
export const sniffIntakeFile = (head, ext) => {
    const f = FORMATS[ext];
    if (!f || !head || head.length < 4) return null;
    const at = (i, bytes) => bytes.every((b, j) => head[i + j] === b);
    const ascii = (i, n) => String.fromCharCode(...head.slice(i, i + n));
    if (f.magic && f.magic.some(sig => at(0, sig))) return ext;
    if (f.riff && ascii(0, 4) === 'RIFF' && ascii(8, 4) === f.riff) return ext;
    if (f.ftyp && ascii(4, 4) === 'ftyp') {
        const brand = ascii(8, 4).trim();
        if (f.ftyp === '*' || f.ftyp.includes(brand)) return ext;
    }
    if (f.qt && ['moov', 'mdat', 'wide', 'free'].includes(ascii(4, 4))) return ext;
    if (f.svg) {
        const text = Buffer.from(head).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
        if ((text.startsWith('<?xml') || text.startsWith('<svg') || text.startsWith('<!--')) && text.includes('<svg')) return ext;
    }
    return null;
};

// ─── Catálogos del formulario ─────────────────────────────────────────

export const SENDER_RELATIONS = [
    { id: 'coordinacion', label: 'Coordinación del programa' },
    { id: 'equipo_medico', label: 'Equipo médico o profesional' },
    { id: 'comunicaciones', label: 'Comunicaciones' },
    { id: 'voluntariado', label: 'Voluntariado' },
    { id: 'aliado', label: 'Organización aliada o patrocinadora' },
    { id: 'rotario', label: 'Rotario o rotaria que acompaña el programa' },
    { id: 'directivo', label: 'Directivo de la entidad que opera el programa' },
    { id: 'otro', label: 'Otra relación' },
];
export const CLUB_MODES = [
    { id: 'club', label: 'Pertenezco a un club rotario' },
    { id: 'sin_club', label: 'No pertenezco a un club rotario' },
    { id: 'otra_organizacion', label: 'Represento a otra organización' },
];
/** Distingue QUÉ hace cada entidad: nadie es financiador u operador por omisión. */
export const PARTNER_RELATIONS = [
    { id: 'respaldo_institucional', label: 'Respaldo institucional' },
    { id: 'alianza_cientifica', label: 'Alianza científica o académica' },
    { id: 'patrocinio', label: 'Patrocinio' },
    { id: 'operacion', label: 'Operación del programa' },
    { id: 'aliado_estrategico', label: 'Aliado estratégico' },
    { id: 'difusion', label: 'Apoyo en difusión' },
    { id: 'otra', label: 'Otra participación (descrita)' },
];
export const PARTNER_RELATION_IDS = PARTNER_RELATIONS.map(r => r.id);
export const IDENTITY_MODES = [
    { id: 'nombre_completo', label: 'Nombre completo' },
    { id: 'solo_nombre', label: 'Solo el nombre' },
    { id: 'seudonimo', label: 'Seudónimo' },
    { id: 'anonima', label: 'Historia anónima' },
];
export const TESTIMONY_DISPLAYS = [
    { id: 'nombre_completo', label: 'Nombre y apellido' },
    { id: 'solo_nombre', label: 'Solo el nombre' },
    { id: 'iniciales', label: 'Iniciales' },
    { id: 'anonimo', label: 'Anónimo (solo su relación con el programa)' },
];
export const TESTIMONY_MODES = [
    { id: 'beneficiario', label: 'Beneficiario o participante' },
    { id: 'familiar', label: 'Familiar' },
    { id: 'profesional', label: 'Profesional' },
    { id: 'voluntario', label: 'Voluntario' },
    { id: 'aliado', label: 'Aliado' },
    { id: 'donante', label: 'Donante' },
];
export const PUBLICATION_CHANNELS = [
    { id: 'programa', label: 'Página del programa' },
    { id: 'distrito', label: 'Sitio del distrito' },
    { id: 'clubes', label: 'Sitios de los clubes participantes' },
    { id: 'redes', label: 'Redes sociales del programa' },
];
export const LANDING_USES = [
    { id: 'portada', label: 'Portada' },
    { id: 'presentacion', label: 'Presentación' },
    { id: 'equipo', label: 'Equipo' },
    { id: 'impacto', label: 'Impacto' },
    { id: 'donaciones', label: 'Donaciones' },
    { id: 'historias', label: 'Historias' },
    { id: 'recursos', label: 'Recursos' },
    { id: 'galeria', label: 'Galería' },
];
export const MEDIA_PERMISSIONS = [
    { id: 'pendiente', label: 'Autorización pendiente' },
    { id: 'interno', label: 'Solo uso interno' },
    { id: 'autorizado', label: 'Autorizado para publicación' },
];
export const DOC_TYPES = [
    { id: 'constitucion', label: 'Documento de constitución' },
    { id: 'certificado', label: 'Certificado (existencia, representación, etc.)' },
    { id: 'convenio', label: 'Convenio' },
    { id: 'carta_respaldo', label: 'Carta de respaldo' },
    { id: 'informe', label: 'Informe' },
    { id: 'politica', label: 'Política (datos, protección, etc.)' },
    { id: 'otro', label: 'Otro soporte' },
];
export const DOC_ACCESS = [
    { id: 'privado', label: 'Privado (solo el equipo revisor)' },
    { id: 'propuesto_publico', label: 'Propongo que sea público (lo decide una persona autorizada)' },
];
export const LEGAL_STATUS = [
    { id: 'personeria_propia', label: 'Tiene personería jurídica propia' },
    { id: 'entidad_anfitriona', label: 'Lo opera otra entidad (fundación, hospital, universidad…)' },
    { id: 'sin_personeria', label: 'No tiene personería jurídica' },
    { id: 'otro', label: 'Otra situación (descrita)' },
];
export const RESOURCE_KINDS = [
    { id: 'guia', label: 'Guía', target: 'resource', type: 'documento' },
    { id: 'faq', label: 'Preguntas frecuentes', target: 'resource', type: 'documento' },
    { id: 'video', label: 'Video educativo', target: 'resource', type: 'video' },
    { id: 'podcast', label: 'Podcast', target: 'resource', type: 'podcast' },
    { id: 'publicacion', label: 'Publicación', target: 'resource', type: 'documento' },
    { id: 'enlace', label: 'Enlace de interés', target: 'resource', type: 'enlace' },
    { id: 'noticia', label: 'Noticia', target: 'news', type: 'noticia' },
    { id: 'jornada', label: 'Jornada', target: 'news', type: 'evento' },
    { id: 'evento', label: 'Evento', target: 'news', type: 'evento' },
];
export const PREFERRED_CHANNELS = [
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'telefono', label: 'Teléfono' },
    { id: 'correo', label: 'Correo electrónico' },
    { id: 'formulario', label: 'Formulario de la página' },
];
export const SOCIAL_KEYS = ['facebook', 'instagram', 'youtube', 'spotify', 'linkedin', 'tiktok', 'x', 'whatsapp'];
const opts = (xs) => xs.map(x => ({ id: x.id, label: x.label }));

// ─── El esquema ───────────────────────────────────────────────────────
//
// Campo: { k, t, l, lg?, h?, hg?, max?, opt?, health?, clinical?, pub?, full?, rows?, purpose? , fileMeta? }
//   t: text · textarea · email · phone · url · year · date · select · checkbox · multi · na · files · club · district
//   lg / hg: etiqueta y ayuda para programas NO de salud (beneficiarios, participantes, servicios)
//   health: sólo en programas de salud · clinical: lo revisa el equipo médico
//   pub: 'publico' | 'interno' — se muestra en el formulario para que nadie confunda los dos
//   na: admite «No aplica» y «Pendiente de suministrar» en lugar de inventar un texto
// Lista: { k, t:'list', l, item, add, fields, need: [claves mínimas], target, refKind?, actions? }

const T = (k, l, extra = {}) => ({ k, t: 'text', l, max: 200, ...extra });
const TA = (k, l, extra = {}) => ({ k, t: 'textarea', l, max: 4000, rows: 4, full: true, ...extra });
const NA = (k, l, extra = {}) => ({ k, t: 'na', l, max: 3000, full: true, ...extra });

const PERSON_FIELDS = (prefix) => [
    T(`${prefix}Name`, 'Nombre completo', { pub: 'interno' }),
    T(`${prefix}Role`, 'Cargo'),
    T(`${prefix}Institution`, 'Institución'),
    { k: `${prefix}Email`, t: 'email', l: 'Correo (interno)', pub: 'interno' },
    { k: `${prefix}Phone`, t: 'phone', l: 'Teléfono (interno)', pub: 'interno' },
];

const PARTNER_FIELDS = (relations) => [
    T('name', 'Nombre de la organización'),
    { k: 'relationType', t: 'select', l: 'Tipo de relación', opt: opts(PARTNER_RELATIONS.filter(r => relations.includes(r.id))), h: 'Qué hace realmente: respaldar no es financiar ni operar.' },
    TA('participation', 'Descripción de su participación', { max: 1500, rows: 3 }),
    { k: 'logo', t: 'files', l: 'Logo', purpose: 'logo', max: 1, fileMeta: ['description'] },
    { k: 'website', t: 'url', l: 'Sitio web' },
    { k: 'validFrom', t: 'date', l: 'Vigente desde' },
    { k: 'validUntil', t: 'date', l: 'Vigente hasta', h: 'Déjalo vacío si no tiene fecha de terminación.' },
    { k: 'identityAuthorized', t: 'checkbox', l: 'La organización autorizó usar su nombre y su logo', full: true },
    { k: 'authorizationFile', t: 'files', l: 'Soporte de la autorización (privado)', purpose: 'authorization', max: 3, pub: 'interno' },
];

export const INTAKE_SECTIONS = [
    {
        k: 'remitente', title: 'Quién suministra la información', icon: 'user', always: true,
        desc: 'Tus datos sirven para revisar el envío y contactarte. No se publican salvo lo que autorices abajo.',
        target: 'Registro interno del envío (no se publica)', landing: null,
        fields: [
            T('firstName', 'Nombres', { pub: 'interno' }), T('lastName', 'Apellidos', { pub: 'interno' }),
            { k: 'email', t: 'email', l: 'Correo electrónico', pub: 'interno', h: 'A este correo enviamos el enlace para continuar el formulario.' },
            { k: 'phone', t: 'phone', l: 'Teléfono (con indicativo)', pub: 'interno' },
            T('role', 'Cargo o función dentro del programa'),
            T('organization', 'Organización a la que perteneces'),
            { k: 'relation', t: 'select', l: 'Relación con el programa', opt: opts(SENDER_RELATIONS) },
            T('relationOther', 'Describe tu relación', { showIf: ['relation', 'otro'] }),
            { k: 'districtNumber', t: 'district', l: 'Distrito rotario' },
            { k: 'clubMode', t: 'select', l: '¿Perteneces a un club rotario?', opt: opts(CLUB_MODES), h: 'Si eres médico, aliado o líder externo no necesitas elegir un club.' },
            { k: 'clubProfileId', t: 'club', l: 'Club rotario', showIf: ['clubMode', 'club'], full: true },
            T('otherOrganization', 'Nombre de la organización que representas', { showIf: ['clubMode', 'otra_organizacion'] }),
            { k: 'publicCredit', t: 'checkbox', l: 'Autorizo que mi nombre y cargo aparezcan como fuente de la información publicada', full: true },
            T('publicName', 'Nombre como debe aparecer públicamente', { showIf: ['publicCredit', true], pub: 'publico' }),
            T('publicRole', 'Cargo como debe aparecer públicamente', { showIf: ['publicCredit', true], pub: 'publico' }),
        ],
        need: ['firstName', 'lastName', 'email', 'role', 'relation'],
        blocks: [
            { t: 'Tus datos', f: ['firstName', 'lastName', 'role', 'organization', 'relation', 'relationOther'], open: true },
            { t: 'Distrito y club rotario', f: ['districtNumber', 'clubMode', 'clubProfileId', 'otherOrganization'], open: true },
            { t: 'Contacto (interno, no se publica)', f: ['email', 'phone'], open: true },
            { t: 'Crédito público (opcional)', f: ['publicCredit', 'publicName', 'publicRole'] },
        ],
    },
    {
        k: 'identidad', title: 'Identidad y presentación del programa', icon: 'book',
        desc: 'Cómo se llama el programa, qué hace y de dónde viene. La dirección pública la define la administración.',
        target: 'Información del programa (ficha) y página de detalle', landing: 'Portada · Presentación',
        fields: [
            T('name', 'Nombre oficial', { h: 'Si propones un cambio de nombre, la dirección pública (/programas/…) no cambia: la define la administración.' }),
            T('shortName', 'Nombre corto', { max: 60, h: 'Como lo dice la gente: «Ponseti», «Pequeño Corazón».' }),
            { k: 'category', t: 'select', l: 'Categoría', opt: [] /* se llena con PROGRAM_CATEGORIES */ },
            T('tagline', 'Frase principal', { max: 140, h: 'Una sola frase que resuma el programa (aparece en la portada).' }),
            TA('summary', 'Resumen', { max: 400, rows: 3, h: 'Dos o tres frases para el catálogo y redes (mínimo 40 caracteres para publicar).' }),
            TA('description', 'Descripción', { max: 12000, rows: 7, h: 'Qué es el programa, cómo funciona y a quién acompaña.' }),
            TA('whoWeAre', 'Quiénes somos', { max: 3000, h: 'Quiénes están detrás del programa y qué hacen. Un solo texto: no hace falta repetirlo en otro campo.' }),
            // v4.1287 — «Propósito» y «Sobre nosotros» decían lo mismo que «Quiénes
            // somos» y la misión: ya no se piden. Un borrador que los traía los
            // conserva y los sigue mostrando (`legacy`: sólo con valor).
            TA('purpose', 'Propósito (registrado antes)', { max: 2000, rows: 3, legacy: true }),
            TA('about', 'Sobre nosotros (registrado antes)', { max: 4000, legacy: true }),
            TA('history', 'Reseña histórica', { max: 6000, rows: 5 }),
            { k: 'startYear', t: 'year', l: 'Año de inicio' },
            NA('mission', 'Misión', { h: 'Si el programa no tiene misión formal, marca «No aplica»; no hace falta inventarla.' }),
            NA('vision', 'Visión'), NA('values', 'Valores'), NA('objectives', 'Objetivos'),
            {
                k: 'milestones', t: 'list', l: 'Hitos', item: 'Hito', add: 'Agregar hito', need: ['title'], target: 'profile',
                fields: [{ k: 'year', t: 'year', l: 'Año' }, T('title', 'Hito'), TA('description', 'Descripción', { max: 800, rows: 2 })],
            },
        ],
        blocks: [
            { t: 'Lo esencial', f: ['name', 'shortName', 'category', 'tagline', 'summary', 'description'], open: true },
            { t: 'Quiénes somos', f: ['whoWeAre', 'purpose', 'about'] },
            { t: 'Reseña histórica e hitos', f: ['history', 'startYear', 'milestones'] },
            { t: 'Misión, visión, valores y objetivos', f: ['mission', 'vision', 'values', 'objectives'], d: 'Cada uno admite «No aplica» o «Pendiente de suministrar».' },
        ],
    },
    {
        k: 'visual', title: 'Identidad visual, aliados y patrocinadores', icon: 'palette',
        desc: 'Logos y archivos originales, y las organizaciones que participan. Indica qué hace cada una: no todas financian ni prestan el servicio.',
        target: 'Logo del programa, Biblioteca (originales privados) y aliados del programa', landing: 'Portada · Aliados',
        fields: [
            { k: 'officialLogo', t: 'files', l: 'Logo oficial', purpose: 'logo', max: 1, fileMeta: ['description', 'usage'], full: true },
            { k: 'heroImage', t: 'files', l: 'Imagen principal del programa', purpose: 'photo', max: 1, fileMeta: ['alt', 'description'], full: true, h: 'Una fotografía real y autorizada. Queda también en el banco multimedia, sin volver a cargarla.' },
            { k: 'logoVariants', t: 'files', l: 'Variantes del logo (horizontal, vertical, monocromo…)', purpose: 'logo', max: 12, fileMeta: ['description', 'usage'], full: true },
            { k: 'brandManual', t: 'files', l: 'Manual de identidad', purpose: 'brand', max: 3, fileMeta: ['description', 'usage'], full: true },
            { k: 'originals', t: 'files', l: 'Archivos originales disponibles (AI, EPS, SVG, PSD…)', purpose: 'brand', max: 20, fileMeta: ['description', 'usage'], full: true },
            { k: 'allies', t: 'list', l: 'Organizaciones aliadas', item: 'Organización aliada', add: 'Agregar aliado', need: ['name', 'relationType'], target: 'partners', fields: PARTNER_FIELDS(['aliado_estrategico', 'alianza_cientifica', 'operacion', 'difusion', 'otra']) },
            { k: 'sponsors', t: 'list', l: 'Patrocinadores', item: 'Patrocinador', add: 'Agregar patrocinador', need: ['name', 'relationType'], target: 'partners', fields: PARTNER_FIELDS(['patrocinio', 'otra']) },
            { k: 'backers', t: 'list', l: 'Entidades de respaldo', item: 'Entidad de respaldo', add: 'Agregar entidad de respaldo', need: ['name', 'relationType'], target: 'partners', fields: PARTNER_FIELDS(['respaldo_institucional', 'alianza_cientifica', 'otra']) },
        ],
        blocks: [
            { t: 'Logo e imagen principal', f: ['officialLogo', 'heroImage', 'logoVariants'], open: true },
            { t: 'Manual de identidad y archivos originales', f: ['brandManual', 'originals'] },
            { t: 'Organizaciones aliadas', f: ['allies'] },
            { t: 'Patrocinadores', f: ['sponsors'] },
            { t: 'Entidades de respaldo', f: ['backers'] },
        ],
    },
    {
        k: 'equipo', title: 'Responsables y equipo', icon: 'users',
        desc: 'Quién coordina y quiénes pueden aparecer públicamente. Registrar un nombre aquí no da permisos: la aprobación de contenidos la hacen usuarios autorizados en la plataforma.',
        target: 'Gobernanza del programa (interna) y colección «Equipo»', landing: 'Equipo',
        fields: [
            ...PERSON_FIELDS('coordinator'), ...PERSON_FIELDS('communications'), ...PERSON_FIELDS('requests'),
            ...PERSON_FIELDS('medical').map(f => ({ ...f, health: true })),
            {
                k: 'members', t: 'list', l: 'Integrantes que pueden aparecer públicamente', item: 'Integrante', add: 'Agregar integrante', need: ['name', 'role'], target: 'team', refKind: 'team', actions: ['crear', 'actualizar', 'retirar'],
                fields: [
                    T('name', 'Nombre'), T('role', 'Cargo o papel en el programa'), T('specialty', 'Especialidad', { h: 'Cuando aplique (p. ej. ortopedia pediátrica).' }),
                    T('institution', 'Institución'), TA('bio', 'Reseña', { max: 2000, rows: 3 }),
                    { k: 'photo', t: 'files', l: 'Fotografía', purpose: 'photo', max: 1, fileMeta: ['alt'] },
                    { k: 'publishAuthorized', t: 'checkbox', l: 'La persona autorizó publicar su nombre, cargo y fotografía', full: true },
                    { k: 'authorizationFile', t: 'files', l: 'Soporte de la autorización (privado)', purpose: 'authorization', max: 3, pub: 'interno' },
                ],
            },
        ],
        blocks: [
            { t: 'Coordinación del programa', f: ['coordinatorName', 'coordinatorRole', 'coordinatorInstitution', 'coordinatorEmail', 'coordinatorPhone'], d: 'Datos internos: no se publican.' },
            { t: 'Responsable de comunicaciones', f: ['communicationsName', 'communicationsRole', 'communicationsInstitution', 'communicationsEmail', 'communicationsPhone'], d: 'Datos internos: no se publican.' },
            { t: 'Responsable de solicitudes', f: ['requestsName', 'requestsRole', 'requestsInstitution', 'requestsEmail', 'requestsPhone'], d: 'Datos internos: no se publican.' },
            { t: 'Revisor médico', f: ['medicalName', 'medicalRole', 'medicalInstitution', 'medicalEmail', 'medicalPhone'], d: 'Datos internos. La aprobación médica la hacen usuarios autorizados en la plataforma.' },
            { t: 'Integrantes que pueden aparecer públicamente', f: ['members'], open: true },
        ],
    },
    {
        k: 'atencion', title: 'Atención, cobertura y acceso', titleGeneral: 'Participación, cobertura y acceso', icon: 'compass',
        desc: 'A quién atiende el programa y cómo se accede. Los textos sobre atención, requisitos, gratuidad o aseguramiento pasan por la revisión correspondiente antes de publicarse.',
        descGeneral: 'A quién se dirige el programa y cómo se participa. Los textos sobre requisitos o costos pasan por revisión antes de publicarse.',
        target: 'Información del programa: atención y acceso', landing: 'Información para familias · Contacto',
        fields: [
            TA('audience', 'Público al que se dirige', { lg: 'Beneficiarios o participantes', max: 1500, rows: 3 }),
            TA('coverage', 'Cobertura territorial', { max: 1500, rows: 3 }),
            TA('guidancePath', 'Ruta de orientación', { lg: 'Cómo vincularse', clinical: true, h: 'Los pasos que sigue una familia para recibir orientación. Lo revisa el equipo médico.', hg: 'Los pasos para vincularse al programa.' }),
            TA('accessConditions', 'Condiciones de acceso', { lg: 'Condiciones de participación', clinical: true }),
            TA('officialChannels', 'Canales oficiales', { max: 1500, rows: 3 }),
            TA('costsText', 'Costos, gratuidad o aseguramiento', { lg: 'Costos o gratuidad', clinical: true, max: 2000, h: 'Propón el texto y adjunta el soporte: lo aprueba quien corresponde, no quien lo envía.' }),
            { k: 'costsSupport', t: 'files', l: 'Soporte del texto de costos (privado)', purpose: 'support', max: 5, pub: 'interno', full: true },
            T('contactHours', 'Horarios de contacto', { max: 300 }),
            { k: 'services', t: 'list', l: 'Servicios o actividades del programa', lg: 'Servicios o actividades', item: 'Servicio', add: 'Agregar servicio', need: ['name'], target: 'care', fields: [T('name', 'Nombre'), TA('description', 'Descripción', { max: 800, rows: 2 })] },
            { k: 'steps', t: 'list', l: 'Pasos para una persona interesada', item: 'Paso', add: 'Agregar paso', need: ['title'], target: 'care', fields: [T('title', 'Paso'), TA('description', 'Detalle', { max: 800, rows: 2 })] },
            { k: 'faqs', t: 'list', l: 'Preguntas frecuentes', item: 'Pregunta', add: 'Agregar pregunta', need: ['question', 'answer'], target: 'care', fields: [T('question', 'Pregunta', { max: 300 }), TA('answer', 'Respuesta', { max: 2000, rows: 3 }), { k: 'clinical', t: 'checkbox', l: 'La respuesta contiene información clínica', health: true, full: true }] },
        ],
        blocks: [
            { t: 'Público y cobertura', f: ['audience', 'coverage'], open: true },
            { t: 'Servicios', f: ['services'] },
            { t: 'Ruta de orientación y acceso', f: ['guidancePath', 'accessConditions', 'steps', 'officialChannels', 'contactHours'] },
            { t: 'Costos, gratuidad o aseguramiento', f: ['costsText', 'costsSupport'] },
            { t: 'Preguntas frecuentes', f: ['faqs'] },
        ],
    },
    {
        k: 'sedes', title: 'Directorio de clínicas, sedes o centros', titleGeneral: 'Sedes o puntos de atención', icon: 'map',
        desc: 'Cada registro alimenta el directorio de la página. Si actualizas una sede existente, elígela para no duplicarla.',
        target: 'Colección «Clínicas o centros» (directorio)', landing: 'Directorio',
        fields: [
            {
                k: 'clinics', t: 'list', l: 'Clínicas, sedes o centros', lg: 'Sedes', item: 'Sede', add: 'Agregar sede', need: ['name', 'city'], target: 'clinic', refKind: 'clinic', actions: ['crear', 'actualizar', 'retirar'],
                fields: [
                    T('name', 'Nombre de la clínica, sede o centro', { lg: 'Nombre de la sede' }), T('institution', 'Institución'),
                    T('region', 'Departamento'), T('city', 'Ciudad'), T('address', 'Dirección', { max: 300, pub: 'publico' }),
                    { k: 'phone', t: 'phone', l: 'Teléfono público', pub: 'publico' }, { k: 'email', t: 'email', l: 'Correo público', pub: 'publico' },
                    { k: 'url', t: 'url', l: 'Enlace oficial', pub: 'publico' },
                    TA('services', 'Servicios', { max: 1500, rows: 2 }),
                    TA('careConditions', 'Condiciones de atención', { lg: 'Condiciones de participación', clinical: true, max: 2000, rows: 3 }),
                    T('schedule', 'Horario', { max: 300 }),
                    T('referenceContact', 'Profesional de referencia', { pub: 'publico' }),
                    { k: 'verifiedAt', t: 'date', l: 'Fecha de verificación de los datos' },
                    { k: 'h_int', t: 'heading', l: 'Contacto interno para confirmar los datos (no se publica)' },
                    T('internalName', 'Nombre', { pub: 'interno' }), { k: 'internalPhone', t: 'phone', l: 'Teléfono', pub: 'interno' },
                    { k: 'internalEmail', t: 'email', l: 'Correo', pub: 'interno' }, TA('internalNotes', 'Notas internas', { max: 1000, rows: 2, pub: 'interno' }),
                ],
            },
        ],
    },
    {
        k: 'participacion', title: 'Participación y sostenibilidad', icon: 'heart',
        desc: 'Cómo pueden ayudar personas, clubes y empresas. Las donaciones se enlazan a la entidad que las recibe: la plataforma no cobra ni procesa pagos.',
        target: 'Información del programa: participación · Colección «Enlaces de donación»', landing: 'Clubes · Donaciones',
        fields: [
            TA('waysToSupport', 'Formas de apoyar'), TA('clubParticipation', 'Participación de clubes', { h: 'Cómo puede vincularse un club.' }),
            TA('clubActions', 'Acciones concretas que puede realizar un club', { max: 3000 }),
            TA('volunteering', 'Voluntariado', { max: 3000 }), TA('corporateAlliances', 'Alianzas empresariales', { max: 3000 }),
            TA('currentNeeds', 'Necesidades actuales', { max: 3000 }), TA('inKindSupport', 'Aportes en especie', { max: 3000 }),
            TA('fundraising', 'Actividades de recaudación', { max: 3000 }),
            {
                k: 'donations', t: 'list', l: 'Canales de donación', item: 'Canal de donación', add: 'Agregar canal de donación', need: ['receiver', 'url'], target: 'donation', refKind: 'donation', actions: ['crear', 'actualizar', 'retirar'],
                fields: [
                    T('receiver', 'Entidad receptora', { h: 'Quién recibe y administra el aporte.' }), { k: 'url', t: 'url', l: 'Enlace oficial de donación' },
                    T('buttonLabel', 'Texto del botón', { max: 60 }), TA('purpose', 'Finalidad del aporte', { max: 600, rows: 2 }),
                    TA('disclaimer', 'Texto aclaratorio', { max: 1500, rows: 3 }),
                    { k: 'taxClaim', t: 'checkbox', l: 'El texto menciona beneficios tributarios o certificados de donación (quedará pendiente de verificación)', full: true },
                    T('contactName', 'Contacto responsable', { pub: 'interno' }), { k: 'contactEmail', t: 'email', l: 'Correo del contacto', pub: 'interno' },
                    { k: 'supportFiles', t: 'files', l: 'Instrucciones o soportes (privado)', purpose: 'support', max: 5, pub: 'interno' },
                ],
            },
        ],
        blocks: [
            { t: 'Formas de apoyar', f: ['waysToSupport', 'currentNeeds', 'volunteering', 'corporateAlliances', 'inKindSupport', 'fundraising'], open: true },
            { t: 'Participación de clubes', f: ['clubParticipation', 'clubActions'] },
            { t: 'Donaciones', f: ['donations'], d: 'Entidad receptora, enlace oficial y texto aclaratorio. La plataforma no cobra ni procesa pagos.' },
        ],
    },
    {
        k: 'documentos', title: 'Información institucional y documentos', icon: 'file', collapsible: true,
        desc: 'Quién opera el programa y sus soportes. Los documentos son privados por defecto: publicarlos requiere la decisión explícita de una persona autorizada.',
        target: 'Archivos privados del programa · Información del programa (entidad que lo opera)', landing: null,
        fields: [
            T('publicName', 'Nombre público del programa', { h: 'Como se conoce públicamente.' }),
            T('operatorName', 'Entidad que opera el programa'),
            { k: 'legalStatus', t: 'select', l: 'Situación jurídica', opt: opts(LEGAL_STATUS), h: 'No todos los programas tienen personería jurídica propia.' },
            TA('legalNote', 'Aclaración', { max: 1000, rows: 2 }),
            {
                k: 'docs', t: 'list', l: 'Documentos y soportes', item: 'Documento', add: 'Agregar documento', need: ['title', 'docType'], target: 'document',
                fields: [
                    T('title', 'Título'), { k: 'docType', t: 'select', l: 'Tipo', opt: opts(DOC_TYPES) }, T('issuer', 'Entidad emisora'),
                    { k: 'issuedOn', t: 'date', l: 'Fecha' }, { k: 'validUntil', t: 'date', l: 'Vigencia (si aplica)' },
                    { k: 'access', t: 'select', l: 'Clasificación de acceso', opt: opts(DOC_ACCESS) },
                    { k: 'file', t: 'files', l: 'Archivo', purpose: 'document', max: 1, full: true },
                ],
            },
        ],
        blocks: [
            { t: 'Entidad que opera el programa', f: ['publicName', 'operatorName', 'legalStatus', 'legalNote'], open: true },
            { t: 'Documentos institucionales, legales y soportes', f: ['docs'], open: true },
        ],
    },
    {
        k: 'multimedia', title: 'Banco multimedia', icon: 'image',
        desc: 'Fotografías, videos, audios, documentos y enlaces. Conservamos el original y la versión web se genera sin reemplazarlo. Adjuntar material no autoriza publicarlo: indícalo en cada pieza.',
        target: 'Biblioteca de medios del sitio (carpeta del programa) · originales privados', landing: 'Cualquier contenedor, por referencia',
        fields: [
            {
                k: 'items', t: 'list', l: 'Piezas', item: 'Pieza', add: 'Agregar pieza', need: ['title'], target: 'media', bulk: 'file',
                fields: [
                    { k: 'file', t: 'files', l: 'Archivo', purpose: 'media', max: 1, full: true },
                    { k: 'externalUrl', t: 'url', l: 'O enlace externo (videos o materiales muy grandes)', full: true },
                    T('title', 'Título'), TA('description', 'Descripción', { max: 1000, rows: 2 }),
                    T('credit', 'Autor o crédito'), { k: 'date', t: 'date', l: 'Fecha' }, T('place', 'Lugar'),
                    T('alt', 'Texto alternativo', { max: 200, h: 'Describe la imagen para quien no la ve.' }),
                    T('tags', 'Etiquetas (separadas por coma)', { max: 300 }),
                    { k: 'orientation', t: 'select', l: 'Orientación', opt: [{ id: 'horizontal', label: 'Horizontal' }, { id: 'vertical', label: 'Vertical' }, { id: 'cuadrada', label: 'Cuadrada' }] },
                    { k: 'uses', t: 'multi', l: 'Uso sugerido en la página', opt: opts(LANDING_USES), full: true, h: 'Es una sugerencia: la ubicación la decide quien edita la página.' },
                    { k: 'permission', t: 'select', l: 'Permisos de publicación', opt: opts(MEDIA_PERMISSIONS) },
                    { k: 'focus', t: 'focus', l: 'Punto de enfoque', full: true, h: 'Toca la parte más importante de la foto: los recortes la conservan sin deformar la imagen.' },
                ],
            },
        ],
    },
    {
        k: 'historias', title: 'Historias de vida y casos del programa', icon: 'story',
        desc: 'Relatos editoriales para divulgación. No es una historia clínica: no adjuntes expedientes ni diagnósticos completos.',
        target: 'Colección «Historias»', landing: 'Historias',
        fields: [
            {
                k: 'stories', t: 'list', l: 'Historias', item: 'Historia', add: 'Agregar historia', need: ['title', 'summary'], target: 'story', refKind: 'story', actions: ['crear', 'actualizar', 'retirar'],
                fields: [
                    T('title', 'Título'), TA('summary', 'Resumen', { max: 500, rows: 2 }), TA('body', 'Relato completo', { max: 12000, rows: 7 }),
                    TA('context', 'Contexto inicial', { max: 3000, rows: 3 }), TA('accompaniment', 'Acompañamiento recibido', { max: 3000, rows: 3 }),
                    TA('stages', 'Etapas del proceso', { max: 3000, rows: 3 }), TA('changes', 'Cambios observados', { max: 3000, rows: 3 }),
                    TA('quotes', 'Citas autorizadas', { max: 2000, rows: 2 }),
                    TA('careProcess', 'Proceso asistencial preparado para divulgación', { health: true, clinical: true, max: 3000, rows: 3, h: 'Lenguaje de divulgación, sin datos clínicos identificables. Lo revisa el equipo médico.' }),
                    { k: 'photos', t: 'files', l: 'Fotografías y galería', purpose: 'photo', max: 20, fileMeta: ['caption', 'alt'], full: true },
                    { k: 'videos', t: 'files', l: 'Videos', purpose: 'media', max: 5, fileMeta: ['caption'], full: true },
                    { k: 'videoUrl', t: 'url', l: 'Enlace de video (YouTube o Vimeo)', full: true },
                    { k: 'h_id', t: 'heading', l: 'Identidad pública' },
                    T('internalRef', 'Identificación interna (opcional)', { pub: 'interno', h: 'Una referencia para el equipo; nunca se publica.' }),
                    T('personName', 'Nombre real de la persona', { pub: 'interno' }),
                    { k: 'identityMode', t: 'select', l: 'Cómo aparecerá públicamente', opt: opts(IDENTITY_MODES), h: 'Se aplica al título, el relato y los pies de foto.' },
                    T('publicName', 'Nombre público o seudónimo', { pub: 'publico', showIf: ['identityMode', ['solo_nombre', 'seudonimo']] }),
                    { k: 'isMinor', t: 'checkbox', l: 'La persona es menor de edad', full: true },
                    T('guardianName', 'Representante legal', { pub: 'interno', showIf: ['isMinor', true] }),
                    { k: 'h_auth', t: 'heading', l: 'Autorizaciones (cada una por separado)' },
                    { k: 'authStory', t: 'checkbox', l: 'Autoriza publicar el relato' }, { k: 'authName', t: 'checkbox', l: 'Autoriza publicar el nombre' },
                    { k: 'authImage', t: 'checkbox', l: 'Autoriza publicar su imagen' }, { k: 'authVideo', t: 'checkbox', l: 'Autoriza publicar videos' },
                    { k: 'authGuardian', t: 'checkbox', l: 'El representante legal firmó la autorización', showIf: ['isMinor', true] },
                    { k: 'channels', t: 'multi', l: 'Canales autorizados', opt: opts(PUBLICATION_CHANNELS), full: true },
                    { k: 'authorizationFiles', t: 'files', l: 'Soportes de las autorizaciones (privados)', purpose: 'authorization', max: 5, pub: 'interno', full: true },
                    T('authVerifiedBy', 'Verificó las autorizaciones', { pub: 'interno' }), { k: 'authVerifiedAt', t: 'date', l: 'Fecha de verificación', pub: 'interno' },
                    TA('withdrawalReason', 'Motivo del retiro', { showIf: ['_action', 'retirar'], max: 1000, rows: 2 }),
                ],
            },
        ],
    },
    {
        k: 'testimonios', title: 'Testimonios', icon: 'quote',
        desc: 'Testimonios breves, independientes o vinculados a una historia. Puedes registrar el nombre para gestión interna y decidir cómo aparece.',
        target: 'Colección «Historias» (formato testimonio)', landing: 'Historias',
        fields: [
            {
                k: 'testimonies', t: 'list', l: 'Testimonios', item: 'Testimonio', add: 'Agregar testimonio', need: ['text', 'mode'], target: 'testimony', refKind: 'story', actions: ['crear', 'actualizar', 'retirar'],
                fields: [
                    T('firstName', 'Nombres', { pub: 'interno' }), T('lastName', 'Apellidos', { pub: 'interno' }),
                    { k: 'mode', t: 'select', l: 'Modalidad', opt: opts(TESTIMONY_MODES) }, T('relation', 'Relación con el programa'),
                    TA('text', 'Testimonio', { max: 2000, rows: 4 }),
                    { k: 'display', t: 'select', l: 'Cómo aparecerá públicamente', opt: opts(TESTIMONY_DISPLAYS), h: 'No es obligatorio publicar apellidos ni fotografía.' },
                    { k: 'photo', t: 'files', l: 'Fotografía (opcional)', purpose: 'photo', max: 1, fileMeta: ['alt'] },
                    { k: 'media', t: 'files', l: 'Audio o video (opcional)', purpose: 'media', max: 1 },
                    { k: 'linkedStory', t: 'storylink', l: 'Vincular a una historia (opcional)' },
                    { k: 'publishAuthorized', t: 'checkbox', l: 'Autoriza publicar el testimonio', full: true },
                    { k: 'imageAuthorized', t: 'checkbox', l: 'Autoriza publicar su fotografía, audio o video', full: true },
                    { k: 'authorizationFile', t: 'files', l: 'Soporte de la autorización (privado)', purpose: 'authorization', max: 3, pub: 'interno' },
                ],
            },
        ],
    },
    {
        k: 'impacto', title: 'Impacto y trayectoria', icon: 'chart',
        desc: 'Indicadores según la naturaleza del programa. Nada se suma ni se deduce automáticamente: cada cifra pasa por revisión antes de alimentar los contadores públicos.',
        target: 'Colección «Indicadores de impacto»', landing: 'Impacto',
        fields: [
            {
                k: 'indicators', t: 'list', l: 'Indicadores', item: 'Indicador', add: 'Agregar indicador', need: ['name', 'value'], target: 'indicator', refKind: 'indicator', actions: ['crear', 'actualizar', 'retirar'],
                fields: [
                    T('name', 'Indicador', { h: 'P. ej. «Personas acompañadas», «Tratamientos completados», «Clubes participantes».' }),
                    TA('definition', 'Definición: qué mide y cómo', { max: 1000, rows: 2 }),
                    T('value', 'Valor', { max: 40 }), T('unit', 'Unidad', { max: 40 }),
                    { k: 'mode', t: 'select', l: 'Tipo de cifra', opt: [{ id: 'acumulado', label: 'Acumulada (desde el inicio)' }, { id: 'periodo', label: 'De un período' }] },
                    T('period', 'Período', { max: 80 }), T('scope', 'Alcance geográfico', { max: 160 }), T('source', 'Fuente'),
                    { k: 'supportFile', t: 'files', l: 'Soporte (privado)', purpose: 'support', max: 3, pub: 'interno' },
                    T('validatedBy', 'Responsable de validación'), { k: 'updatedOn', t: 'date', l: 'Fecha del dato' },
                ],
            },
            {
                // v4.1287 — Noticias, jornadas y eventos salen de «Recursos» (paso 7)
                // y quedan con el impacto: es actualidad, no material educativo.
                k: 'news', t: 'list', l: 'Noticias y actividades', item: 'Noticia o actividad', add: 'Agregar noticia o actividad', need: ['title', 'category'], target: 'news', actions: ['crear'],
                fields: [
                    { k: 'category', t: 'select', l: 'Tipo', opt: RESOURCE_KINDS.filter(r => r.target === 'news').map(r => ({ id: r.id, label: r.label })) },
                    T('title', 'Título'), TA('description', 'Descripción', { max: 2000, rows: 3 }),
                    { k: 'date', t: 'date', l: 'Fecha' }, T('location', 'Lugar'), { k: 'url', t: 'url', l: 'Enlace (opcional)' },
                    { k: 'file', t: 'files', l: 'Imagen o archivo (opcional)', purpose: 'media', max: 1, fileMeta: ['alt'] },
                ],
            },
        ],
        blocks: [
            { t: 'Indicadores de impacto', f: ['indicators'], open: true },
            { t: 'Noticias y actividades', f: ['news'], open: true },
        ],
    },
    {
        k: 'recursos', title: 'Recursos educativos', icon: 'library',
        desc: 'Guías, preguntas frecuentes, videos educativos, podcast y publicaciones. No son los documentos legales del paso de participación. Lo aprobado se muestra en la página sin volver a cargarlo.',
        target: 'Colección «Recursos educativos»', landing: 'Recursos',
        fields: [
            {
                k: 'resources', t: 'list', l: 'Recursos', item: 'Recurso', add: 'Agregar recurso', need: ['title', 'category'], target: 'resource', actions: ['crear'],
                fields: [
                    { k: 'category', t: 'select', l: 'Categoría', opt: RESOURCE_KINDS.filter(r => r.target === 'resource').map(r => ({ id: r.id, label: r.label })) },
                    T('title', 'Título'), TA('description', 'Descripción', { max: 2000, rows: 3 }),
                    { k: 'file', t: 'files', l: 'Archivo', purpose: 'media', max: 1 }, { k: 'url', t: 'url', l: 'O enlace' },
                    T('audience', 'Público objetivo'), T('source', 'Fuente'), { k: 'date', t: 'date', l: 'Fecha' },
                    { k: 'clinical', t: 'checkbox', l: 'Contiene información clínica (la revisa el equipo médico)', health: true, full: true },
                ],
            },
        ],
    },
    {
        k: 'contacto', title: 'Redes y contacto público', icon: 'phone',
        desc: 'Los canales que aparecerán en la página. Son distintos de tus datos de contacto como remitente.',
        target: 'Información del programa: redes y contacto institucional', landing: 'Contacto · Pie de la página',
        fields: [
            { k: 'website', t: 'url', l: 'Sitio web oficial', pub: 'publico' },
            ...SOCIAL_KEYS.map(k => ({ k, t: 'url', l: { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', spotify: 'Spotify', linkedin: 'LinkedIn', tiktok: 'TikTok', x: 'X (Twitter)', whatsapp: 'WhatsApp (enlace wa.me)' }[k], pub: 'publico' })),
            { k: 'publicEmail', t: 'email', l: 'Correo público', pub: 'publico' }, { k: 'publicPhone', t: 'phone', l: 'Teléfono público', pub: 'publico' },
            T('publicHours', 'Horarios de atención', { max: 300, pub: 'publico' }),
            { k: 'preferredChannel', t: 'select', l: 'Canal preferido para orientación', opt: opts(PREFERRED_CHANNELS) },
        ],
        blocks: [
            { t: 'Sitio web y redes sociales', f: ['website', ...SOCIAL_KEYS], open: true },
            { t: 'Contacto público', f: ['publicEmail', 'publicPhone', 'publicHours', 'preferredChannel'], open: true },
        ],
    },
];
export const INTAKE_SECTION_KEYS = INTAKE_SECTIONS.map(s => s.k);
export const CONTENT_SECTION_KEYS = ['multimedia', 'historias', 'testimonios', 'recursos', 'impacto'];

/**
 * v4.1287 — Los DIEZ pasos del formulario. Agrupan las secciones (que siguen
 * siendo la unidad de guardado, validación, revisión y aplicación: sus
 * claves no cambiaron, así que un borrador anterior abre igual). El paso 10
 * es el resumen. Un bloque interno nunca es un paso.
 */
export const INTAKE_STEPS = [
    { k: 'programa', short: 'Programa', title: 'Programa y datos del responsable', desc: 'Elige el programa y el tipo de envío, y cuéntanos quién suministra la información.', sections: ['remitente'] },
    { k: 'identidad', short: 'Identidad', title: 'Identidad e historia del programa', desc: 'Cómo se llama el programa, qué hace y de dónde viene. Lo complementario es opcional o admite «No aplica».', sections: ['identidad'] },
    { k: 'imagen', short: 'Imagen', title: 'Imagen institucional, aliados y patrocinadores', desc: 'Logo, imagen principal y las organizaciones que participan. Indica qué hace cada una: no todas financian ni prestan el servicio.', sections: ['visual'] },
    { k: 'equipo', short: 'Equipo', title: 'Equipo, contacto y canales oficiales', desc: 'Responsables (datos internos), integrantes que aparecen públicamente y los canales que se publicarán.', sections: ['equipo', 'contacto'] },
    { k: 'atencion', short: 'Atención', title: 'Atención, cobertura y directorio', titleGeneral: 'Participantes, cobertura y sedes', desc: 'Primero la información general del programa; después el directorio, sede por sede.', sections: ['atencion', 'sedes'] },
    { k: 'participacion', short: 'Participación', title: 'Participación, donaciones y documentación', desc: 'Cómo apoyar y cómo donar. La documentación institucional va aparte, en un bloque complementario.', sections: ['participacion', 'documentos'] },
    { k: 'multimedia', short: 'Multimedia', title: 'Banco multimedia y recursos', desc: 'Fotografías, videos, audios y enlaces, y los recursos educativos. Un archivo ya cargado se reutiliza sin volver a subirlo.', sections: ['multimedia', 'recursos'] },
    { k: 'historias', short: 'Historias', title: 'Historias de vida y testimonios', desc: 'Relatos editoriales y testimonios, cada uno con su identidad pública y sus autorizaciones.', sections: ['historias', 'testimonios'] },
    { k: 'impacto', short: 'Impacto', title: 'Impacto y actualidad', desc: 'Indicadores con su fuente y quién los valida, y las noticias, jornadas y eventos. La reseña histórica está en el paso 2.', sections: ['impacto'] },
    { k: 'resumen', short: 'Resumen', title: 'Resumen y envío', desc: 'Revisa lo que incluye tu envío, completa las declaraciones y envíalo a revisión.', sections: [] },
];
export const stepOfSection = (sectionKey) => INTAKE_STEPS.findIndex(st => st.sections.includes(sectionKey)) + 1;

/**
 * v4.1287 — Lleva un borrador anterior a la forma actual SIN perder nada:
 * el sitio web pasa de «Identidad» a «Contacto» (si allí no había uno) y las
 * noticias, jornadas y eventos que estaban en «Recursos» pasan a «Noticias y
 * actividades» (mismo id de registro; la decisión de revisión, si la había,
 * viaja con su clave nueva). Puro: `{ data, review, changed }`.
 */
export const migrateIntakeData = (rawData = {}, rawReview = {}) => {
    const data = JSON.parse(JSON.stringify(obj(rawData)));
    const review = { ...obj(rawReview) };
    let changed = false;
    const ident = obj(data.identidad);
    if (ident.website) {
        data.contacto = obj(data.contacto);
        if (!data.contacto.website) data.contacto.website = ident.website;
        delete ident.website; data.identidad = ident; changed = true;
    }
    const rec = obj(data.recursos);
    const newsIds = RESOURCE_KINDS.filter(r => r.target === 'news').map(r => r.id);
    const moving = arr(rec.resources).filter(r => newsIds.includes(r?.category));
    if (moving.length) {
        data.impacto = obj(data.impacto);
        const news = arr(data.impacto.news);
        for (const r of moving) {
            const { audience, source, clinical, ...rest } = r; void audience; void source; void clinical;
            if (!news.some(n => n._id === r._id)) news.push(rest);
            const oldKey = `recursos:resources:${r._id}`;
            if (review[oldKey]) { review[`impacto:news:${r._id}`] = review[oldKey]; delete review[oldKey]; }
        }
        data.impacto.news = news;
        rec.resources = arr(rec.resources).filter(r => !newsIds.includes(r?.category));
        if (!rec.resources.length) delete rec.resources;
        data.recursos = rec;
        changed = true;
    }
    return { data, review, changed };
};

export const sectionSpec = (k) => INTAKE_SECTIONS.find(s => s.k === k) || null;
const fieldsOf = (section) => arr(section?.fields);
const scalarFields = (section) => fieldsOf(section).filter(f => f.t !== 'list' && f.t !== 'heading');
const listFields = (section) => fieldsOf(section).filter(f => f.t === 'list');

// ─── Configuración por programa ───────────────────────────────────────

/** `intakeConfig` tal como se guarda en `Program`. Lo desconocido se descarta. */
export const shapeIntakeConfig = (raw = {}) => {
    const r = obj(raw);
    const sections = {};
    for (const s of INTAKE_SECTIONS) {
        const x = obj(obj(r.sections)[s.k]);
        sections[s.k] = { enabled: s.always ? true : x.enabled !== false, help: multi(x.help, 600) };
    }
    const fields = {};
    for (const s of INTAKE_SECTIONS) {
        const all = [...scalarFields(s).map(f => [f.k, f]), ...listFields(s).flatMap(l => [[l.k, l], ...l.fields.filter(f => f.t !== 'heading').map(f => [`${l.k}.${f.k}`, f])])];
        for (const [path, f] of all) {
            const x = obj(obj(r.fields)[`${s.k}.${path}`]);
            if (!Object.keys(x).length) continue;
            const isNeed = (s.need || []).includes(path) || (f.t === 'list' ? false : false);
            fields[`${s.k}.${path}`] = { required: x.required === true || isNeed, hidden: isNeed ? false : x.hidden === true, help: multi(x.help, 400) };
        }
    }
    const vocab = str(r.vocabulary, 10);
    return {
        enabled: r.enabled !== false,
        vocabulary: ['auto', 'salud', 'general'].includes(vocab) ? vocab : 'auto',
        intro: multi(r.intro, 1200),
        sections, fields,
    };
};

export const isHealthProgram = (program = {}, config = {}) => {
    const v = obj(config).vocabulary || 'auto';
    if (v === 'salud') return true;
    if (v === 'general') return false;
    return program.category === 'salud';
};

/**
 * El formulario TAL COMO LO VE quien lo llena para ESTE programa: secciones
 * aplicables, etiquetas adaptadas (salud o general), campos de salud sólo en
 * salud, ayudas propias y obligatorios configurados. Lo calcula el servidor.
 */
export const resolveIntakeForm = (program = {}, rawConfig = {}, { categories = [] } = {}) => {
    const config = shapeIntakeConfig(rawConfig);
    const health = isHealthProgram(program, config);
    const adapt = (sk, f, path) => {
        if (f.health && !health) return null;
        const c = config.fields[`${sk}.${path}`] || {};
        if (c.hidden) return null;
        const out = { ...f, l: !health && f.lg ? f.lg : f.l, h: c.help || (!health && f.hg ? f.hg : f.h) || '', required: Boolean(c.required) };
        delete out.lg; delete out.hg; delete out.health;
        if (f.k === 'category' && sk === 'identidad') out.opt = categories;
        if (f.t === 'list') {
            out.fields = f.fields.map(x => adapt(sk, x, `${f.k}.${x.k}`)).filter(Boolean);
            out.need = f.need || [];
        }
        return out;
    };
    const sections = INTAKE_SECTIONS
        .filter(s => s.always || config.sections[s.k]?.enabled !== false)
        .map(s => ({
            k: s.k, icon: s.icon, always: Boolean(s.always),
            title: !health && s.titleGeneral ? s.titleGeneral : s.title,
            desc: config.sections[s.k]?.help || (!health && s.descGeneral ? s.descGeneral : s.desc),
            target: s.target, landing: s.landing, need: s.need || [], collapsible: Boolean(s.collapsible),
            fields: s.fields.map(f => adapt(s.k, f, f.k)).filter(Boolean),
            blocks: arr(s.blocks).map(b => ({ t: b.t, d: b.d || '', open: Boolean(b.open), f: b.f })),
        }))
        .map(s => ({ ...s, blocks: s.blocks.map(b => ({ ...b, f: b.f.filter(k => s.fields.some(f => f.k === k)) })).filter(b => b.f.length) }));
    // v4.1287 — Siempre DIEZ pasos; un paso sin secciones aplicables queda como «no aplica».
    const steps = INTAKE_STEPS.map((st, i) => ({
        k: st.k, n: i + 1, short: st.short, title: !health && st.titleGeneral ? st.titleGeneral : st.title, desc: st.desc,
        sections: st.sections.filter(k => sections.some(s => s.k === k)),
    }));
    return { health, intro: config.intro, sections, steps, contentSections: CONTENT_SECTION_KEYS.filter(k => sections.some(s => s.k === k)) };
};

// ─── Forma de los valores ─────────────────────────────────────────────

const isoDate = (v) => {
    const s = str(v, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? '' : s;
};
export const normalizeUrl = (raw) => {
    const value = str(raw, 800);
    if (!value) return '';
    let url;
    try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
    return url.toString();
};
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** El valor de UN campo, saneado por su tipo. `undefined` = sin valor (no viaja). */
export const shapeFieldValue = (f, raw) => {
    if (raw === undefined || raw === null) return undefined;
    switch (f.t) {
        case 'checkbox': return raw === true ? true : (raw === false ? false : undefined);
        case 'multi': { const ids = (f.opt || []).map(o => o.id); const v = arr(raw).map(x => str(x, 40)).filter(x => ids.includes(x)); return v.length ? Array.from(new Set(v)) : undefined; }
        case 'select': { const v = str(raw, 60); return v && (!f.opt?.length || f.opt.some(o => o.id === v)) ? v : undefined; }
        case 'year': { const n = Number.parseInt(raw, 10); return Number.isFinite(n) ? n : undefined; }
        case 'date': { const v = isoDate(raw); return v || (str(raw, 20) ? 'invalid' : undefined); }
        case 'url': { const v = normalizeUrl(raw); return v === '' ? undefined : (v === null ? 'invalid:' + str(raw, 200) : v); }
        case 'email': { const v = str(raw, 200).toLowerCase(); return v || undefined; }
        case 'phone': { const v = str(raw, 40).replace(/[^\d+\s()-]/g, ''); return v.replace(/\D/g, '') ? v : undefined; }
        case 'district': { const n = Number.parseInt(raw, 10); return n > 0 && n < 100000 ? n : undefined; }
        case 'club': case 'storylink': { const v = str(raw, 80); return ID_RE.test(v) ? v : undefined; }
        case 'focus': {
            const o = obj(raw); const x = Number(o.x); const y = Number(o.y);
            return Number.isFinite(x) && Number.isFinite(y) ? { x: Math.min(100, Math.max(0, Math.round(x))), y: Math.min(100, Math.max(0, Math.round(y))) } : undefined;
        }
        case 'na': {
            const o = obj(raw); const status = ['texto', 'no_aplica', 'pendiente'].includes(o.status) ? o.status : 'texto';
            const text = multi(o.text, f.max || 3000);
            if (status === 'texto' && !text) return undefined;
            return { status, text: status === 'texto' ? text : '' };
        }
        case 'files': {
            const v = arr(raw).slice(0, f.max || 10).map(x => {
                const o = typeof x === 'string' ? { id: x } : obj(x);
                if (!ID_RE.test(str(o.id, 64))) return null;
                const out = { id: str(o.id, 64) };
                for (const m of f.fileMeta || []) if (o[m]) out[m] = str(o[m], 300);
                return out;
            }).filter(Boolean);
            return v.length ? v : undefined;
        }
        case 'textarea': { const v = multi(raw, f.max || 4000); return v || undefined; }
        default: { const v = str(raw, f.max || 200); return v || undefined; }
    }
};

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const ACTIONS = ['crear', 'actualizar', 'retirar'];

/** Una sección: sólo sus campos y sus listas; cada registro con id propio. */
export const shapeIntakeSection = (key, raw = {}) => {
    const s = sectionSpec(key);
    if (!s) return null;
    const r = obj(raw);
    const out = {};
    for (const f of scalarFields(s)) {
        const v = shapeFieldValue(f, r[f.k]);
        if (!isEmpty(v)) out[f.k] = v;
    }
    for (const l of listFields(s)) {
        const items = arr(r[l.k]).slice(0, 200).map(it => {
            const x = obj(it);
            const id = str(x._id, 40);
            if (!ID_RE.test(id)) return null;
            const row = { _id: id };
            const action = str(x._action, 20);
            row._action = (l.actions || ['crear']).includes(action) ? action : 'crear';
            if (row._action !== 'crear') { const ref = str(x._ref, 80); if (ID_RE.test(ref)) row._ref = ref; }
            for (const f of l.fields.filter(ff => ff.t !== 'heading')) {
                const v = shapeFieldValue(f, x[f.k]);
                if (!isEmpty(v)) row[f.k] = v;
            }
            return row;
        }).filter(Boolean);
        if (items.length) out[l.k] = items;
    }
    return out;
};

const fieldPathsWithValues = (section, data) => {
    const d = obj(data);
    return scalarFields(section).filter(f => !isEmpty(d[f.k])).length + listFields(section).reduce((a, l) => a + arr(d[l.k]).length, 0);
};
export const sectionHasData = (key, data) => {
    const s = sectionSpec(key);
    return s ? fieldPathsWithValues(s, data) > 0 : false;
};

/** Cuánto lleva una sección (para el progreso): campos con valor / campos visibles. */
export const sectionProgress = (form, key, data) => {
    const s = arr(form?.sections).find(x => x.k === key);
    if (!s) return { filled: 0, total: 0 };
    const d = obj(data);
    const visibles = s.fields.filter(f => f.t !== 'heading');
    const filled = visibles.filter(f => (f.t === 'list' ? arr(d[f.k]).length > 0 : !isEmpty(d[f.k]))).length;
    return { filled, total: visibles.length };
};

const PHONE_OK = (p) => { const n = String(p || '').replace(/\D/g, ''); return n.length >= 7 && n.length <= 15; };
const showIfMatches = (f, row) => {
    if (!f.showIf) return true;
    const [k, want] = f.showIf;
    const have = row[k];
    return Array.isArray(want) ? want.includes(have) : have === want;
};

/**
 * Validación de UNA sección con el formulario resuelto del programa. Sólo pide
 * lo indispensable: lo obligatorio configurado (si la sección trae datos o fue
 * elegida) y lo mínimo de cada registro para poder revisarlo. Los formatos se
 * revisan siempre; un campo de OTRA sección nunca bloquea esta.
 */
export const validateIntakeSection = (form, key, data, { required = false } = {}) => {
    const errors = [];
    const s = arr(form?.sections).find(x => x.k === key);
    if (!s) return errors;
    const d = obj(data);
    const push = (field, message) => errors.push({ section: key, field, message });
    const has = fieldPathsWithValues(sectionSpec(key), d) > 0;
    const enforce = s.always || has || required;
    const check = (f, v, path, row) => {
        if (!showIfMatches(f, row)) return;
        if (isEmpty(v)) {
            const need = (s.need || []).includes(f.k) && path === f.k;
            if (enforce && !f.legacy && (f.required || need)) push(path, `Completa «${f.l}».`);
            return;
        }
        if (f.t === 'email' && !EMAIL_RE.test(v)) push(path, `Revisa el correo de «${f.l}».`);
        if (f.t === 'phone' && !PHONE_OK(v)) push(path, `Revisa el teléfono de «${f.l}» (con indicativo).`);
        if (f.t === 'url' && String(v).startsWith('invalid')) push(path, `«${f.l}»: escribe un enlace válido (https://…).`);
        if (f.t === 'date' && v === 'invalid') push(path, `«${f.l}»: fecha no válida.`);
        if (f.t === 'year' && (v < 1900 || v > new Date().getFullYear() + 1)) push(path, `«${f.l}»: año no válido.`);
    };
    for (const f of s.fields.filter(x => x.t !== 'list' && x.t !== 'heading')) check(f, d[f.k], f.k, d);
    if (enforce && s.k === 'remitente' && d.clubMode === 'club' && !d.clubProfileId) push('clubProfileId', 'Elige tu club o indica que no perteneces a uno.');
    for (const l of s.fields.filter(x => x.t === 'list')) {
        if (l.required && enforce && !arr(d[l.k]).length) push(l.k, `Agrega al menos un registro en «${l.l}».`);
        arr(d[l.k]).forEach((row, i) => {
            const label = `${l.item} ${i + 1}`;
            const p = (fk) => `${l.k}.${row._id}.${fk}`;
            if (row._action !== 'crear' && !row._ref) { push(p('_ref'), `${label}: elige el registro existente que quieres ${row._action === 'retirar' ? 'retirar' : 'actualizar'}.`); return; }
            if (row._action === 'retirar') return;
            for (const f of l.fields.filter(x => x.t !== 'heading')) {
                if (!showIfMatches(f, row)) continue;
                const v = row[f.k];
                if (isEmpty(v)) { if ((l.need || []).includes(f.k) || f.required) push(p(f.k), `${label}: completa «${f.l}».`); continue; }
                check(f, v, p(f.k), row);
            }
            if (l.k === 'items' && key === 'multimedia' && !arr(row.file).length && !row.externalUrl) push(p('file'), `${label}: adjunta el archivo o escribe un enlace.`);
            if (key === 'historias') errors.push(...storyIdentityErrors(row).map(m => ({ section: key, field: p('identityMode'), message: `${label}: ${m}` })));
        });
    }
    return errors;
};

/** Una historia anónima o con seudónimo NO puede nombrar a la persona en lo que se publica. */
export const storyIdentityErrors = (row = {}) => {
    const out = [];
    const mode = row.identityMode || '';
    const real = String(row.personName || '').trim();
    if ((mode === 'seudonimo' || mode === 'solo_nombre') && !String(row.publicName || '').trim()) out.push(mode === 'seudonimo' ? 'escribe el seudónimo.' : 'escribe el nombre como aparecerá.');
    if (['anonima', 'seudonimo', 'solo_nombre'].includes(mode) && real) {
        const words = mode === 'solo_nombre'
            ? real.split(/\s+/).slice(1).filter(w => w.length > 2)      // con «solo el nombre» no pueden aparecer los apellidos
            : real.split(/\s+/).filter(w => w.length > 2);
        const publishable = [row.title, row.summary, row.body, row.context, row.accompaniment, row.stages, row.changes, row.quotes, row.careProcess,
            ...arr(row.photos).map(p => `${p.caption || ''} ${p.alt || ''}`), ...arr(row.videos).map(v => v.caption || '')].join(' ').toLowerCase();
        const hits = words.filter(w => new RegExp(`\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(publishable));
        if (hits.length) out.push(`el texto o los pies de foto mencionan «${hits.join(' ')}», que no debe publicarse con la identidad elegida.`);
    }
    if (row.isMinor && (row.authStory || row.authImage || row.authVideo || row.authName) && !row.authGuardian) out.push('una persona menor de edad necesita la autorización de su representante legal.');
    return out;
};

/** Datos del remitente y consentimientos (los tres van por separado). */
export const shapeConsents = (raw = {}) => {
    const r = obj(raw);
    return { data: r.data === true, rights: r.rights === true, newsletter: r.newsletter === true };
};

export const INTAKE_DATA_CONSENT = 'Autorizo el tratamiento de mis datos personales para gestionar este envío y contactarme sobre él, de acuerdo con la política de tratamiento de datos del programa. No se publican sin mi autorización.';
export const INTAKE_RIGHTS_CONSENT = 'Declaro que tengo derecho a compartir los textos y materiales que adjunto y autorizo su uso por el programa en los términos que indico en cada pieza. Adjuntar no equivale a autorizar la publicación: las piezas pendientes de autorización no se publican.';
export const INTAKE_NEWSLETTER_CONSENT = 'Quiero recibir novedades del programa por correo electrónico (opcional, puedo retirarme cuando quiera).';

/**
 * ¿Se puede ENVIAR? Remitente completo, dato y derechos (si adjunta), y cada
 * sección elegida o con datos en regla. `selected` vacío en una carga
 * inicial = todas las habilitadas.
 */
export const validateIntakeSubmit = (form, intake) => {
    const errors = [];
    const data = obj(intake.data);
    const sel = new Set(arr(intake.sections));
    errors.push(...validateIntakeSection(form, 'remitente', obj(intake.sender), { required: true }));
    let algo = false;
    const parcial = intake.submissionType !== 'carga_inicial';
    for (const s of arr(form?.sections)) {
        if (s.always) continue;
        const has = sectionHasData(s.k, data[s.k]);
        if (has) algo = true;
        // Lo obligatorio configurado sólo se exige a la sección que trae datos:
        // una actualización parcial nunca pide completar otra sección.
        if (has) errors.push(...validateIntakeSection(form, s.k, data[s.k], { required: sel.has(s.k) }));
    }
    // v4.1287 — En una actualización se eligen PASOS: un paso elegido sin
    // ningún dato en ninguna de sus secciones se avisa (no cada sección).
    if (parcial) {
        for (const st of arr(form?.steps)) {
            const secs = st.sections.filter(k => !sectionSpec(k)?.always);
            if (!secs.length || !secs.some(k => sel.has(k))) continue;
            if (!secs.some(k => sectionHasData(k, data[k]))) errors.push({ section: secs[0], field: '', message: `«${st.title}»: agrega al menos un dato o quita ese paso de tu envío.` });
        }
    }
    if (!algo) errors.push({ section: 'resumen', field: '', message: 'El envío no tiene información todavía: completa al menos una sección.' });
    const c = shapeConsents(intake.consents);
    if (!c.data) errors.push({ section: 'resumen', field: 'consents.data', message: 'Autoriza el tratamiento de tus datos para poder enviar.' });
    if (hasAttachments(data) && !c.rights) errors.push({ section: 'resumen', field: 'consents.rights', message: 'Confirma los derechos de uso de los materiales adjuntos.' });
    return errors;
};

export const fileIdsIn = (value) => {
    const out = [];
    const walk = (v) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') {
            for (const [k, x] of Object.entries(v)) {
                if (Array.isArray(x) && x.every(y => y && typeof y === 'object' && typeof y.id === 'string' && Object.keys(y).every(kk => ['id', 'description', 'usage', 'alt', 'caption'].includes(kk)))) x.forEach(y => out.push(y.id));
                else walk(x);
                void k;
            }
        }
    };
    walk(value);
    return Array.from(new Set(out));
};
export const hasAttachments = (data) => fileIdsIn(data).length > 0 || Object.values(obj(data)).some(sec => arr(obj(sec).items).some(i => i.externalUrl));

// ─── Revisión: los ítems de un envío ──────────────────────────────────

/**
 * El envío partido en ÍTEMS revisables: por sección, un ítem con sus campos
 * sueltos y uno por cada registro de cada lista. La clave es estable
 * (sección + lista + id del registro), así que reabrir o completar un envío
 * no cambia la decisión ya tomada sobre lo que no cambió.
 */
export const intakeItems = (intake = {}) => {
    const data = obj(intake.data);
    const items = [];
    for (const s of INTAKE_SECTIONS) {
        if (s.always) continue;
        const d = obj(data[s.k]);
        const scalars = {};
        for (const f of scalarFields(s)) if (!isEmpty(d[f.k])) scalars[f.k] = d[f.k];
        if (Object.keys(scalars).length) items.push({ key: `${s.k}`, section: s.k, list: null, kind: 'fields', target: sectionTarget(s.k), data: scalars, label: s.title });
        for (const l of listFields(s)) {
            arr(d[l.k]).forEach((row, i) => {
                items.push({
                    key: `${s.k}:${l.k}:${row._id}`, section: s.k, list: l.k, kind: 'record', target: l.target, action: row._action || 'crear', ref: row._ref || null,
                    data: row, label: `${l.item}: ${recordTitle(l.target, row) || `#${i + 1}`}`,
                });
            });
        }
    }
    return items;
};
// `identidad.website` de un borrador anterior sigue aplicándose (lo mueve `migrateIntakeData`).
const sectionTarget = (k) => ({ identidad: 'info', visual: 'brand', equipo: 'governance', atencion: 'care', participacion: 'participation', documentos: 'operator', contacto: 'contact' }[k] || 'info');
export const recordTitle = (target, row = {}) => {
    if (target === 'testimony') return [row.firstName, row.mode].filter(Boolean).join(' · ') || String(row.text || '').slice(0, 40);
    if (target === 'donation') return row.receiver || row.buttonLabel || '';
    if (target === 'indicator' || target === 'clinic' || target === 'team' || target === 'partners') return row.name || '';
    if (target === 'care') return row.name || row.title || row.question || '';
    return row.title || row.name || '';
};

// ─── Aplicar: de un ítem aprobado a una solicitud del flujo editorial ───

const nonEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => !isEmpty(v) && !(typeof v === 'object' && !Array.isArray(v) && v && !Object.keys(v).length)));
const naValue = (v) => (v && typeof v === 'object' ? { status: v.status || 'texto', text: v.text || '' } : undefined);
const fileUrls = (files, urlOf) => arr(files).map(f => ({ ...f, url: urlOf(f.id) })).filter(f => f.url);

/**
 * El PLAN de un ítem aprobado: qué solicitud(es) de cambio se crean, con qué
 * payload. Puro. `urlOf(fileId)` da la URL pública de un archivo ya
 * promovido a la Biblioteca (o '' si no se promueve). `current` son los
 * valores vigentes del programa (para fusionar personas sin pisar lo demás).
 * Devuelve `{ requests: [{kind, operation, contentId, title, payload, authorizations, targetSection}], notes: [] }`.
 */
export const planForItem = (item, { program = {}, health = true, urlOf = () => '', fileIdOf = () => null, reviewerFlags = {} } = {}) => {
    const d = obj(item.data);
    const notes = [];
    const req = (r) => ({ operation: 'crear', contentId: null, targetSection: '', authorizations: {}, ...r });
    const base = { imageRights: false, dataConsent: true, sourceVerified: reviewerFlags.sourceVerified === true };

    if (item.kind === 'fields') {
        if (item.section === 'identidad') {
            const profile = nonEmpty({
                shortName: d.shortName, tagline: d.tagline, purpose: d.purpose, whoWeAre: d.whoWeAre, about: d.about, history: d.history, startYear: d.startYear,
                mission: naValue(d.mission), vision: naValue(d.vision), values: naValue(d.values), objectives: naValue(d.objectives),
            });
            const identity = nonEmpty({ name: d.name, summary: d.summary, description: d.description, category: d.category, website: d.website, profile });
            if (d.name && d.name !== program.name) notes.push('Propone un cambio de nombre: la dirección pública (slug) NO cambia.');
            return { requests: Object.keys(identity).length ? [req({ kind: 'info', title: 'Identidad y presentación', payload: { identity } })] : [], notes };
        }
        if (item.section === 'visual') {
            const logo = arr(d.officialLogo)[0];
            const brand = nonEmpty({
                logo: logo ? { url: urlOf(logo.id), description: logo.description || '', usage: logo.usage || '' } : undefined,
                variants: fileUrls(d.logoVariants, urlOf).map(f => ({ url: f.url, description: f.description || '', usage: f.usage || '' })),
                privateFiles: [...arr(d.brandManual), ...arr(d.originals)].map(f => ({ fileId: fileIdOf(f.id), description: f.description || '', usage: f.usage || '' })).filter(f => f.fileId),
            });
            const hero = arr(d.heroImage)[0];
            const identity = nonEmpty({
                logoUrl: logo ? urlOf(logo.id) : undefined, profile: Object.keys(brand).length ? { brand } : undefined,
                heroImageUrl: hero ? urlOf(hero.id) : undefined, heroImageAlt: hero && urlOf(hero.id) ? (hero.alt || hero.description || `Imagen del programa ${program.name || ''}`.trim()) : undefined,
            });
            if (logo && !urlOf(logo.id)) notes.push('El logo oficial no tiene versión web (formato de diseño): se conserva el original privado y el logo de la ficha no cambia.');
            return { requests: Object.keys(identity).length ? [req({ kind: 'info', title: 'Identidad visual', payload: { identity } })] : [], notes };
        }
        if (item.section === 'equipo') {
            const person = (p) => nonEmpty({ name: d[`${p}Name`], role: d[`${p}Role`], institution: d[`${p}Institution`], email: d[`${p}Email`], phone: d[`${p}Phone`] });
            const governance = nonEmpty({
                coordinator: person('coordinator'), communications: person('communications'), requestsManager: person('requests'),
                medicalReviewer: health ? person('medical') : undefined,
            });
            notes.push('Los nombres de responsables son informativos: los permisos se otorgan en «Responsables y distritos» a usuarios de la plataforma.');
            return { requests: Object.keys(governance).length ? [req({ kind: 'info', title: 'Responsables del programa', payload: { governance } })] : [], notes };
        }
        if (item.section === 'atencion') {
            const care = nonEmpty({
                audience: d.audience, coverage: d.coverage, guidancePath: d.guidancePath, accessConditions: d.accessConditions,
                officialChannels: d.officialChannels, costsText: d.costsText, contactHours: d.contactHours,
            });
            const costsSupport = arr(d.costsSupport).map(f => fileIdOf(f.id)).filter(Boolean);
            if (d.costsText) notes.push('El texto de costos queda SIN aprobar: lo aprueba quien corresponde en la ficha o en la revisión médica.');
            return { requests: Object.keys(care).length ? [req({ kind: 'info', title: 'Atención, cobertura y acceso', payload: { care }, attachments: costsSupport.map(fileId => ({ fileId, label: 'Soporte del texto de costos' })) })] : [], notes };
        }
        if (item.section === 'participacion') {
            const participation = nonEmpty({
                waysToSupport: d.waysToSupport, clubParticipation: d.clubParticipation, clubActions: d.clubActions, volunteering: d.volunteering,
                corporateAlliances: d.corporateAlliances, currentNeeds: d.currentNeeds, inKindSupport: d.inKindSupport, fundraising: d.fundraising,
            });
            return { requests: Object.keys(participation).length ? [req({ kind: 'info', title: 'Participación y sostenibilidad', payload: { participation } })] : [], notes };
        }
        if (item.section === 'documentos') {
            const operatingEntity = nonEmpty({ publicName: d.publicName, operatorName: d.operatorName, legalStatus: d.legalStatus, legalNote: d.legalNote });
            return { requests: Object.keys(operatingEntity).length ? [req({ kind: 'info', title: 'Entidad que opera el programa', payload: { identity: { profile: { operatingEntity } } } })] : [], notes };
        }
        if (item.section === 'contacto') {
            const social = nonEmpty(Object.fromEntries(SOCIAL_KEYS.map(k => [k, d[k]])));
            const governance = nonEmpty({
                institutionalEmail: d.publicEmail, institutionalEmailPublic: d.publicEmail ? true : undefined,
                institutionalPhone: d.publicPhone, institutionalPhonePublic: d.publicPhone ? true : undefined,
            });
            const publicContact = nonEmpty({ hours: d.publicHours, preferredChannel: d.preferredChannel });
            const identity = nonEmpty({ website: d.website, social: Object.keys(social).length ? social : undefined, profile: Object.keys(publicContact).length ? { publicContact } : undefined });
            const payload = nonEmpty({ identity: Object.keys(identity).length ? identity : undefined, governance: Object.keys(governance).length ? governance : undefined });
            return { requests: Object.keys(payload).length ? [req({ kind: 'info', title: 'Redes y contacto público', payload })] : [], notes };
        }
        return { requests: [], notes: ['Sección sin destino.'] };
    }

    // Registros de listas.
    const op = item.action || 'crear';
    const contentId = op === 'crear' ? null : item.ref;
    const retiro = (kind, title) => req({ kind, operation: 'retirar', contentId, title: `Retiro: ${title}`, payload: { reason: d.withdrawalReason || 'Retiro solicitado desde el formulario institucional.' } });
    const t = item.target;
    if (t === 'profile') return { requests: [req({ kind: 'info', title: `Hito: ${d.title}`, payload: { identity: { profile: { milestonesUpsert: [nonEmpty({ id: d._id, year: d.year, title: d.title, description: d.description })] } } } })], notes };
    if (t === 'care') {
        const key = item.list; // services · steps · faqs
        const entry = nonEmpty({ id: d._id, name: d.name, title: d.title, description: d.description, question: d.question, answer: d.answer, clinical: d.clinical === true ? true : undefined });
        return { requests: [req({ kind: 'info', title: `${{ services: 'Servicio', steps: 'Paso', faqs: 'Pregunta frecuente' }[key]}: ${recordTitle('care', d)}`, payload: { care: { [`${key}Upsert`]: [entry] }, clinical: d.clinical === true } })], notes };
    }
    if (t === 'partners') {
        const logo = arr(d.logo)[0];
        const partner = nonEmpty({
            id: d._id, name: d.name, relationType: d.relationType, participation: d.participation, url: d.website, validFrom: d.validFrom, validUntil: d.validUntil,
            logoUrl: logo ? urlOf(logo.id) : undefined, logoAuthorized: d.identityAuthorized === true, identityAuthorized: d.identityAuthorized === true,
            authorizationFileId: fileIdOf(arr(d.authorizationFile)[0]?.id) || undefined,
        });
        if (logo && !d.identityAuthorized) notes.push('El logo del aliado llega sin autorización de uso: no se mostrará hasta registrarla.');
        return { requests: [req({ kind: 'info', title: `Aliado: ${d.name}`, payload: { identity: { partnersUpsert: [partner] } } })], notes };
    }
    if (t === 'team') {
        if (op === 'retirar') return { requests: [retiro('team', d.name || 'integrante')], notes };
        const photo = arr(d.photo)[0];
        const payload = nonEmpty({
            name: d.name, role: d.role, specialty: d.specialty, institution: d.institution, bio: d.bio,
            photoUrl: photo ? urlOf(photo.id) : undefined, photoAlt: photo?.alt || (photo ? `Fotografía de ${d.name}` : undefined),
            publishAuthorized: d.publishAuthorized === true, authorizationFileId: fileIdOf(arr(d.authorizationFile)[0]?.id) || undefined,
        });
        return { requests: [req({ kind: 'team', operation: op, contentId, title: d.name, payload, authorizations: { ...base, imageRights: d.publishAuthorized === true } })], notes };
    }
    if (t === 'clinic') {
        if (op === 'retirar') return { requests: [retiro('clinic', d.name || 'sede')], notes };
        const payload = nonEmpty({
            name: d.name, institution: d.institution, region: d.region, city: d.city, address: d.address, phone: d.phone, email: d.email, url: d.url,
            services: d.services, careConditions: d.careConditions, schedule: d.schedule, referenceContact: d.referenceContact, verifiedAt: d.verifiedAt,
            verifiedBy: d.verifiedAt ? 'Formulario institucional' : undefined,
            internal: nonEmpty({ contactName: d.internalName, phone: d.internalPhone, email: d.internalEmail, notes: d.internalNotes }),
        });
        return { requests: [req({ kind: 'clinic', operation: op, contentId, title: d.name, payload, authorizations: base })], notes };
    }
    if (t === 'donation') {
        if (op === 'retirar') return { requests: [retiro('donation', d.receiver || 'canal de donación')], notes };
        const payload = nonEmpty({
            buttonLabel: d.buttonLabel || 'Donar', url: d.url, receiver: d.receiver, purpose: d.purpose, disclaimer: d.disclaimer,
            internal: nonEmpty({ contactName: d.contactName, email: d.contactEmail }), taxClaimPending: d.taxClaim === true ? true : undefined,
        });
        if (d.taxClaim) notes.push('Menciona beneficios tributarios: queda pendiente de verificación y no se publica sin texto aprobado.');
        const att = arr(d.supportFiles).map(f => fileIdOf(f.id)).filter(Boolean).map(fileId => ({ fileId, label: 'Soporte de donación' }));
        return { requests: [req({ kind: 'donation', operation: op, contentId, title: d.receiver, payload, authorizations: base, attachments: att })], notes };
    }
    if (t === 'indicator') {
        if (op === 'retirar') return { requests: [retiro('indicator', d.name || 'indicador')], notes };
        const payload = nonEmpty({
            name: d.name, definition: d.definition, value: d.value, unit: d.unit, mode: d.mode || 'acumulado', period: d.period, geoScope: d.scope,
            source: d.source, validatedBy: d.validatedBy, updatedOn: d.updatedOn, supportFileId: fileIdOf(arr(d.supportFile)[0]?.id) || undefined,
        });
        return { requests: [req({ kind: 'indicator', operation: op, contentId, title: d.name, payload, authorizations: base })], notes };
    }
    if (t === 'story' || t === 'testimony') {
        if (op === 'retirar') return { requests: [retiro('story', d.title || recordTitle(t, d) || 'historia')], notes };
        const payload = t === 'story' ? storyPayload(d, { urlOf, fileIdOf }) : testimonyPayload(d, { urlOf, fileIdOf });
        const imageRights = t === 'story' ? (d.authImage === true || d.authVideo === true || !(arr(d.photos).length || arr(d.videos).length)) : (d.imageAuthorized === true || !(arr(d.photo).length || arr(d.media).length));
        return { requests: [req({ kind: 'story', operation: op, contentId, title: payload.title, payload, authorizations: { ...base, imageRights, dataConsent: true } })], notes };
    }
    if (t === 'news') {
        const file = arr(d.file)[0];
        const rk = RESOURCE_KINDS.find(r => r.id === d.category && r.target === 'news') || RESOURCE_KINDS.find(r => r.id === 'noticia');
        const imageUrl = file ? urlOf(file.id) : '';
        return { requests: [req({ kind: 'news', title: d.title, payload: nonEmpty({ type: rk.type, title: d.title, summary: String(d.description || '').slice(0, 500), body: d.description, date: d.date, location: d.location, url: d.url, imageUrl, imageAlt: imageUrl ? (file.alt || d.title) : undefined }) })], notes };
    }
    if (t === 'resource') {
        const rk = RESOURCE_KINDS.find(r => r.id === d.category) || RESOURCE_KINDS[0];
        const file = arr(d.file)[0];
        const url = d.url || (file ? urlOf(file.id) : '');
        if (rk.target === 'news') {
            return { requests: [req({ kind: 'news', title: d.title, payload: nonEmpty({ type: rk.type, title: d.title, summary: String(d.description || '').slice(0, 500), body: d.description, date: d.date, location: d.location, url }) })], notes };
        }
        const payload = nonEmpty({
            title: d.title, description: d.description, type: rk.type === 'video' && url && !/youtu|vimeo/.test(url) ? 'enlace' : rk.type, url, fileId: !url && file ? fileIdOf(file.id) : undefined,
            audience: d.audience, source: d.source || 'Formulario institucional', category: rk.id, publishedOn: d.date, clinical: d.clinical === true,
        });
        return { requests: [req({ kind: 'resource', title: d.title, payload })], notes };
    }
    if (t === 'document' || t === 'media') return { requests: [], notes }; // archivos: los resuelve el almacén
    return { requests: [], notes: ['Sin destino.'] };
};

const storyPayload = (d, { urlOf, fileIdOf }) => {
    const media = [
        ...arr(d.photos).map(p => ({ url: urlOf(p.id), kind: 'image', alt: p.alt || '', caption: p.caption || '', permissionGranted: d.authImage === true, permissionScope: scopeFromChannels(d.channels) })),
        ...arr(d.videos).map(v => ({ url: urlOf(v.id), kind: 'video', caption: v.caption || '', permissionGranted: d.authVideo === true, permissionScope: scopeFromChannels(d.channels) })),
        ...(d.videoUrl ? [{ embedUrl: d.videoUrl, kind: 'embed', permissionGranted: d.authVideo === true, permissionScope: scopeFromChannels(d.channels) }] : []),
    ].filter(m => m.url || m.embedUrl);
    return nonEmpty({
        format: 'historia', title: d.title, summary: d.summary, body: d.body, context: d.context, accompaniment: d.accompaniment, stages: d.stages, changes: d.changes,
        quotes: d.quotes, careProcess: d.careProcess, media, identityMode: d.identityMode || 'nombre_completo', publicName: d.publicName,
        usagePermission: d.authStory === true, namePermission: d.authName === true, imagePermission: d.authImage === true, videoPermission: d.authVideo === true,
        usagePermissionScope: scopeFromChannels(d.channels), channels: arr(d.channels), minorsInvolved: d.isMinor === true, guardianAuthorized: d.authGuardian === true,
        authorizationFileId: fileIdOf(arr(d.authorizationFiles)[0]?.id) || undefined,
        authorizationFileIds: arr(d.authorizationFiles).map(f => fileIdOf(f.id)).filter(Boolean),
        verifiedBy: d.authVerifiedBy, verifiedAt: d.authVerifiedAt,
        internal: nonEmpty({ personName: d.personName, internalRef: d.internalRef, guardianName: d.guardianName }),
    });
};
const testimonyPayload = (d, { urlOf, fileIdOf }) => {
    const photo = arr(d.photo)[0]; const media = arr(d.media)[0];
    const title = `Testimonio · ${TESTIMONY_MODES.find(m => m.id === d.mode)?.label || 'Programa'}`;
    return nonEmpty({
        format: 'testimonio', title, summary: String(d.text || '').slice(0, 500), body: d.text, testimonyMode: d.mode, relation: d.relation,
        display: d.display || 'solo_nombre', linkedStoryId: d.linkedStory,
        media: [
            ...(photo ? [{ url: urlOf(photo.id), kind: 'image', alt: photo.alt || 'Fotografía de quien da el testimonio', permissionGranted: d.imageAuthorized === true }] : []),
            ...(media ? [{ url: urlOf(media.id), kind: 'video', permissionGranted: d.imageAuthorized === true }] : []),
        ].filter(m => m.url),
        usagePermission: d.publishAuthorized === true, imagePermission: d.imageAuthorized === true, namePermission: ['nombre_completo', 'solo_nombre', 'iniciales'].includes(d.display || 'solo_nombre'),
        authorizationFileId: fileIdOf(arr(d.authorizationFile)[0]?.id) || undefined,
        internal: nonEmpty({ firstName: d.firstName, lastName: d.lastName }),
        identityMode: 'testimonio',
    });
};
export const scopeFromChannels = (channels) => {
    const c = arr(channels);
    if (c.includes('clubes')) return 'clubes';
    if (c.includes('distrito')) return 'distrito';
    return 'programa';
};

/** El nombre visible de un testimonio según lo que autorizó. */
export const testimonyDisplayName = (d = {}) => {
    const i = obj(d.internal);
    const first = String(i.firstName || '').trim(); const last = String(i.lastName || '').trim();
    const rel = d.relation || TESTIMONY_MODES.find(m => m.id === d.testimonyMode)?.label || '';
    if (d.display === 'nombre_completo' && first) return [first, last].filter(Boolean).join(' ');
    if (d.display === 'solo_nombre' && first) return first;
    if (d.display === 'iniciales' && first) return `${first[0]}.${last ? ` ${last[0]}.` : ''}`;
    return rel || 'Testimonio';
};

// ─── Comparar con lo vigente ──────────────────────────────────────────

/** Para la revisión: valor actual de cada campo de un ítem de campos. Puro. */
export const currentValuesFor = (item, program = {}) => {
    const p = obj(program); const prof = obj(p.profile); const care = obj(p.care); const part = obj(p.participation); const g = obj(p.governance);
    const naText = (v) => (v && typeof v === 'object' ? (v.status === 'texto' ? v.text : v.status === 'no_aplica' ? 'No aplica' : 'Pendiente de suministrar') : '');
    const map = {
        identidad: { name: p.name, shortName: prof.shortName, category: p.category, tagline: prof.tagline, summary: p.summary, description: p.description, website: p.website, purpose: prof.purpose, whoWeAre: prof.whoWeAre, about: prof.about, history: prof.history, startYear: prof.startYear, mission: naText(prof.mission), vision: naText(prof.vision), values: naText(prof.values), objectives: naText(prof.objectives) },
        atencion: { audience: care.audience, coverage: care.coverage, guidancePath: care.guidancePath, accessConditions: care.accessConditions, officialChannels: care.officialChannels, costsText: care.costsText, contactHours: care.contactHours },
        participacion: { ...part },
        contacto: { website: p.website, ...obj(p.social), publicEmail: g.institutionalEmail, publicPhone: g.institutionalPhone, publicHours: obj(prof.publicContact).hours, preferredChannel: obj(prof.publicContact).preferredChannel },
        documentos: { ...obj(prof.operatingEntity) },
        equipo: Object.fromEntries(['coordinator', 'communications', 'requests', 'medical'].flatMap(k => {
            const src = obj(g[{ coordinator: 'coordinator', communications: 'communications', requests: 'requestsManager', medical: 'medicalReviewer' }[k]]);
            return [[`${k}Name`, src.name], [`${k}Role`, src.role], [`${k}Institution`, src.institution], [`${k}Email`, src.email], [`${k}Phone`, src.phone]];
        })),
        visual: { officialLogo: p.logoUrl, heroImage: p.heroImageUrl },
    }[item.section] || {};
    return Object.fromEntries(Object.keys(obj(item.data)).map(k => [k, map[k] ?? '']));
};

// ─── El enlace para continuar ─────────────────────────────────────────

/** Un secreto de 32 bytes: no predecible, no enumerable. Sólo se guarda su hash. */
export const newIntakeToken = () => crypto.randomBytes(32).toString('base64url');
export const hashIntakeToken = (token) => crypto.createHash('sha256').update(`program-intake|${String(token || '')}`).digest('hex');
export const isTokenShape = (t) => /^[A-Za-z0-9_-]{40,60}$/.test(String(t || ''));

export default {
    SUBMISSION_TYPES, INTAKE_STATES, ITEM_DECISIONS, INTAKE_SECTIONS, FILE_PURPOSES, intakeLimits, checkIntakeFile, sniffIntakeFile,
    shapeIntakeConfig, resolveIntakeForm, shapeIntakeSection, validateIntakeSection, validateIntakeSubmit, intakeItems, planForItem,
    currentValuesFor, newIntakeToken, hashIntakeToken, storyIdentityErrors, testimonyDisplayName, INTAKE_STEPS, migrateIntakeData,
};
