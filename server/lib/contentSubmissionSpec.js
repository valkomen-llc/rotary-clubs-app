// ════════════════════════════════════════════════════════════════════
// Aportes de contenido a una campaña — el CRITERIO
// v4.972.0
//
// Un club documenta desde el teléfono lo que hizo por una campaña; el equipo
// lo revisa, lo aprueba, y desde ese momento el material vive en la Biblioteca
// con su historia pegada y puede convertirse en publicaciones.
//
// Este archivo es PURO: sin base, sin red, sin IA, sin reloj propio —toda
// función que dependa del tiempo recibe `now` como parámetro—. Por eso se
// prueba entero con `npm run test:submissions` y por eso la orquestación no
// contiene criterio.
//
// ─── Decisiones que viven acá y conviene no mover ────────────────────
//
// - APROBADO NO ES PUBLICADO, y son dos estados distintos a propósito. Un
//   material puede estar aprobado y no haberse usado todavía en ninguna
//   comunicación; fundirlos haría imposible contestar «¿qué nos falta por
//   difundir?», que es justamente para lo que sirve una bandeja.
//
// - EL CONSENTIMIENTO SE GUARDA CON LA SOLICITUD, NO SE REFERENCIA. Se copia
//   el TEXTO aceptado dentro de la fila. Si mañana alguien cambia el texto de
//   la campaña, hay que poder decir qué aceptó esa persona ese día: con una
//   referencia, el cambio reescribiría retroactivamente lo que se aceptó, que
//   es exactamente lo que un consentimiento no puede hacer.
//
// - EL TEXTO LEGAL NO SE INVENTA. La plataforma no tiene hoy ninguna política
//   de uso de imagen (no hay `/politica`, `/privacidad` ni equivalente: se
//   buscó). `DEFAULT_CONSENT_TEXT` es un MARCADOR que dice que hace falta
//   configurarlo, y `consentIsConfigured` lo distingue de un texto real para
//   que la pantalla lo avise. Redactar términos legales por nuestra cuenta
//   sería peor que no tenerlos.
//
// - LO QUE ESCRIBE QUIEN ENVÍA ES DATO, NO ADORNO. La historia, el club, la
//   ubicación y la fecha son lo único que después impide que un modelo invente
//   quién aparece en una fotografía. Es la misma regla del tipo «Maneras de
//   Contribuir» (v4.967): sin contexto registrado, lo que no se sabe se declara
//   como desconocido en vez de completarse.
// ════════════════════════════════════════════════════════════════════

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const multi = (v, max) => String(v ?? '').trim().slice(0, max);   // conserva saltos de línea
const arr = (v) => (Array.isArray(v) ? v : []);

// ─── Los estados ───────────────────────────────────────────────────────
//
// El camino principal avanza; `requiere_info` y `descartado` son salidas
// laterales. `order` es lo que hace que la bandeja se pueda ordenar por avance
// sin escribir la comparación en la pantalla.
export const SUBMISSION_STATES = {
    recibido: { id: 'recibido', label: 'Recibido', order: 10, tone: 'sky', help: 'Llegó por el formulario y nadie la miró todavía.' },
    en_revision: { id: 'en_revision', label: 'En revisión', order: 20, tone: 'amber', help: 'Alguien la está mirando.' },
    requiere_info: { id: 'requiere_info', label: 'Requiere información', order: 25, tone: 'amber', help: 'Falta algo y hay que pedírselo a quien la envió.' },
    aprobado: { id: 'aprobado', label: 'Aprobado', order: 30, tone: 'emerald', help: 'El material sirve. Todavía no se usó en ninguna comunicación.' },
    listo_difusion: { id: 'listo_difusion', label: 'Listo para difusión', order: 40, tone: 'emerald', help: 'Está en la Biblioteca y se puede convertir en publicaciones.' },
    publicado: { id: 'publicado', label: 'Publicado', order: 50, tone: 'blue', help: 'Se usó en al menos una comunicación.' },
    descartado: { id: 'descartado', label: 'Descartado', order: 90, tone: 'gray', help: 'No se va a usar. Se conserva con su motivo.' },
};

export const SUBMISSION_STATE_IDS = Object.keys(SUBMISSION_STATES);
export const INITIAL_STATE = 'recibido';

/**
 * ⚠️ EL INSERT PÚBLICO NO ACEPTA OTRO ESTADO QUE `recibido`.
 *
 * Enviar no aprueba nada: es el requisito 13 y es estructural, no una regla de
 * pantalla. Lo fija una prueba.
 */
export const stateLabel = (id) => SUBMISSION_STATES[id]?.label || id;

const FLOW = {
    recibido: ['en_revision', 'requiere_info', 'aprobado', 'descartado'],
    en_revision: ['aprobado', 'requiere_info', 'descartado', 'recibido'],
    requiere_info: ['en_revision', 'aprobado', 'descartado', 'recibido'],
    // «Aprobado» no salta a «Publicado» por su cuenta: entre los dos está
    // llevarlo a la Biblioteca, que es un acto con su propia acción.
    aprobado: ['listo_difusion', 'requiere_info', 'descartado', 'en_revision'],
    listo_difusion: ['publicado', 'aprobado', 'descartado'],
    publicado: ['listo_difusion', 'descartado'],
    // Descartar no es terminal: alguien puede recuperar una solicitud.
    descartado: ['recibido', 'en_revision'],
};

export const canTransitionSubmission = (from, to) =>
    Array.isArray(FLOW[from]) && FLOW[from].includes(to);

/** Los estados a los que se puede ir desde uno dado, con su etiqueta. */
export const nextStates = (from) => (FLOW[from] || []).map(id => ({ id, label: stateLabel(id) }));

/** Los que EXIGEN un motivo escrito: sin él, nadie sabe qué pedir ni por qué. */
export const REASON_REQUIRED = ['requiere_info', 'descartado'];
export const needsReason = (to) => REASON_REQUIRED.includes(to);

// ─── Los archivos ──────────────────────────────────────────────────────

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

export const MAX_FILES = 10;
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;   // una foto de móvil pesa 2-8 MB
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;  // un clip de teléfono, decenas

const EXTENSIONS = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

export const kindOf = (contentType, filename = '') => {
    const t = String(contentType || '').toLowerCase();
    if (IMAGE_TYPES.includes(t)) return 'image';
    if (VIDEO_TYPES.includes(t)) return 'video';
    // El MIME llega vacío o genérico desde varios navegadores al elegir un
    // archivo, así que la extensión es el respaldo — es la misma cautela que
    // `isHeicFile` con las fotos de iPhone (v4.739).
    const ext = String(filename || '').toLowerCase().split('.').pop();
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
    return null;
};

export const extensionFor = (contentType, filename = '') => {
    const known = EXTENSIONS[String(contentType || '').toLowerCase()];
    if (known) return known;
    // ⚠️ `split('.').pop()` sobre un nombre SIN punto devuelve el nombre
    // entero, así que «mi-video» se guardaría como `.mi-video`. Se exige que
    // haya un punto de verdad antes de fiarse de lo que sigue.
    const nombre = String(filename || '').toLowerCase();
    const punto = nombre.lastIndexOf('.');
    const ext = punto > 0 ? nombre.slice(punto + 1) : '';
    return /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'bin';
};

/**
 * ¿Se puede subir este archivo? Se comprueba al prefirmar Y otra vez contra el
 * objeto REAL al enviar: lo que el navegador declara no obliga a nada.
 */
export const checkFileMeta = ({ contentType, filename, size } = {}) => {
    const errores = [];
    const kind = kindOf(contentType, filename);
    if (!kind) {
        errores.push('Sólo se pueden enviar fotografías (JPG, PNG, WEBP, HEIC) y videos (MP4, MOV, WEBM).');
        return { ok: false, errores, kind: null };
    }
    const bytes = Number(size) || 0;
    const max = kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (bytes <= 0) errores.push('El archivo llegó vacío.');
    else if (bytes > max) {
        errores.push(`${kind === 'video' ? 'El video' : 'La fotografía'} pesa ${(bytes / 1048576).toFixed(1)} MB y el máximo es ${max / 1048576} MB.`);
    }
    return { ok: errores.length === 0, errores, kind };
};

// ─── El consentimiento ─────────────────────────────────────────────────

/**
 * ⚠️ NO ES UN TEXTO LEGAL: ES UN MARCADOR DE QUE FALTA UNO.
 *
 * La plataforma no tiene hoy ninguna política de uso de imagen que reutilizar,
 * y redactar términos por nuestra cuenta sería peor que no tenerlos. Esto dice
 * lo mínimo cierto y `consentIsConfigured` lo distingue de un texto real, para
 * que el panel avise que hay que configurarlo.
 */
export const DEFAULT_CONSENT_TEXT =
    'Autorizo a Rotary y a esta campaña a conservar y utilizar el material que envío para comunicar esta iniciativa, y declaro que cuento con el permiso de las personas que aparecen en él. (Texto provisional: la organización debe configurar aquí su política definitiva.)';

export const consentIsConfigured = (text) => {
    const t = str(text, 4000);
    return Boolean(t) && t !== DEFAULT_CONSENT_TEXT;
};

export const consentTextFor = (config = {}) => str(config?.consentText, 4000) || DEFAULT_CONSENT_TEXT;

// ─── La configuración del formulario, dentro de la campaña ─────────────
//
// Vive en `content.submissions` y la normaliza `contributionSpec.normalizeContent`
// como todo lo demás — una clave que ese normalizador no enumere se pierde al
// guardar, en silencio (la lección de `normalizeNode`).
export const normalizeSubmissionsConfig = (raw = {}) => {
    const c = raw && typeof raw === 'object' ? raw : {};
    return {
        // NACE APAGADO: abrir un formulario público que recibe fotografías de
        // personas es una decisión, no un valor por omisión.
        enabled: c.enabled === true,
        headline: str(c.headline, 160),
        intro: multi(c.intro, 1200),
        consentText: multi(c.consentText, 4000),
        inviteMessage: multi(c.inviteMessage, 600),
        // A quién se le avisa cuando llega una solicitud. Vacío = a nadie, y
        // la pantalla lo dice: un formulario que recibe y no avisa se llena
        // sin que nadie lo mire.
        notifyEmails: arr(c.notifyEmails).map(e => str(e, 200).toLowerCase()).filter(Boolean).slice(0, 10),
        thanksMessage: multi(c.thanksMessage, 600),
    };
};

// ─── El mensaje de invitación ──────────────────────────────────────────

/**
 * El texto para compartir el enlace, con el nombre de la campaña puesto
 * (requisito 12). Es un DEFAULT: `content.submissions.inviteMessage` lo pisa.
 */
export const defaultInviteMessage = (campaignName, url = '') => {
    const nombre = str(campaignName, 160) || 'esta campaña';
    const base = `¿Tu club está desarrollando una iniciativa en apoyo a ${nombre}? Comparte aquí fotografías, videos y la historia de la actividad para ayudarnos a amplificar su impacto.`;
    return url ? `${base}\n\n${url}` : base;
};

export const inviteMessageFor = (campaign, config = {}, url = '') => {
    const propio = multi(config?.inviteMessage, 600);
    if (!propio) return defaultInviteMessage(campaign?.name, url);
    return url && !propio.includes(url) ? `${propio}\n\n${url}` : propio;
};

// ─── El teléfono del remitente ─────────────────────────────────────────
//
// ⚠️ SE GUARDAN LAS PARTES, NO SÓLO EL NÚMERO PEGADO. Este contacto va a
// terminar en WhatsApp y en el CRM, y allá lo que hace falta es el número en
// E.164 (`+573001234567`) SIN tener que deducir el país a partir de los
// dígitos — que es justamente lo que `phone.js` documenta como el error caro:
// adivinar mal manda el mensaje a un tercero real que lo recibe y lo abre.
//
// ⚠️ EL CATÁLOGO DE PAÍSES NO SE COPIA ACÁ, y es deliberado. Vive en
// `src/lib/countryPhones.ts`, que el navegador YA carga para el selector
// telefónico de los otros formularios del sitio: mandarlo desde el servidor
// sería duplicar en la respuesta lo que el bundle lleva de todos modos (es el
// mismo reparto que los países y departamentos de v4.708, donde el catálogo de
// distritos SÍ viaja del servidor porque su única verdad está allá).
//
// Lo que el servidor no delega es la ARITMÉTICA: el E.164 lo COMPONE acá a
// partir del indicativo y del número nacional, y nunca acepta uno ya armado
// del cuerpo de la petición. Así el número guardado no puede contradecir a sus
// partes. El código ISO viaja como lo DECLARÓ el navegador —es una etiqueta,
// no un dato del que dependa el envío— y el nombre del país se resuelve al
// leer, desde ese mismo catálogo único: guardarlo sería una segunda verdad
// sobre lo que ya dice el ISO.

/** Un indicativo internacional: «+» y de uno a cuatro dígitos. */
const DIAL_RE = /^\+\d{1,4}$/;
/** Un código ISO-3166 alpha-2. */
const ISO_RE = /^[A-Za-z]{2}$/;

/** E.164 admite 15 dígitos como máximo, indicativo incluido. */
export const E164_MAX_DIGITS = 15;

/**
 * Compone el teléfono a partir de sus partes.
 *
 * Devuelve SIEMPRE la forma completa —país, indicativo, número nacional y
 * E.164— o todo vacío. Un número que no se puede componer con confianza no se
 * inventa: se conserva lo que la persona escribió (`raw`) y las partes quedan
 * nulas, que es lo que después distingue «no lo sabemos» de «lo dedujimos».
 */
export const shapePhone = ({ country, dial, national, raw } = {}) => {
    const iso = String(country ?? '').trim().toUpperCase();
    const ind = String(dial ?? '').trim();
    const nac = String(national ?? '').replace(/\D/g, '').slice(0, 15);
    const escrito = str(raw, 40);

    const partesValidas = ISO_RE.test(iso) && DIAL_RE.test(ind) && nac.length > 0;
    if (!partesValidas) {
        // ⚠️ REGLA ADITIVA: un navegador con el bundle anterior manda sólo
        // `senderPhone` como texto. Se conserva TAL CUAL en vez de perderse —
        // es un teléfono que alguien escribió— y las partes quedan vacías.
        return { country: '', dial: '', national: '', e164: '', phone: escrito };
    }

    const digitos = `${ind.slice(1)}${nac}`;
    if (digitos.length > E164_MAX_DIGITS) {
        return { country: '', dial: '', national: '', e164: '', phone: escrito || `${ind} ${nac}` };
    }
    const e164 = `+${digitos}`;
    return { country: iso, dial: ind, national: nac, e164, phone: e164 };
};

// ─── Participación rotaria: distrito y clubes ──────────────────────────
//
// ⚠️ ESTO NO ES «QUIÉN LO ENVÍA», Y CONFUNDIRLOS PIERDE EL DATO. Una actividad
// la pueden haber hecho tres clubes y la manda una sola persona, que quizá no
// pertenece a ninguno de los otros dos. Por eso los clubes participantes viven
// en su propia tabla y el club del remitente sigue siendo `club`, aparte.
//
// LA LISTA AYUDA A ELEGIR; NO CIERRA LOS VALORES (v4.706). Un catálogo se queda
// viejo solo —clubes nuevos, fusiones, cambios de nombre— y lo que está en
// juego acá es que alguien no pueda mandar las fotos de su club.

export const MAX_PARTICIPATING_CLUBS = 20;

/**
 * La llave con la que se AGRUPA un club, para poder contar participación sin
 * depender de cómo se escribió el nombre. Es DERIVADA: minúsculas, sin tildes
 * y con los espacios colapsados. No sustituye al nombre —que es lo que se
 * muestra—, lo indexa.
 */
export const clubKey = (name) => String(name ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * Da forma a los clubes participantes.
 *
 * `source` dice de dónde salió cada uno: `catalogo` si el desplegable lo
 * ofreció, `manual` si alguien lo escribió. Es lo que después permite saber si
 * un nombre desconocido es un club nuevo o un error de tipeo, y no se deduce —
 * se declara al elegir.
 */
export const shapeClubs = (raw, districtId = '') => {
    const vistos = new Set();
    const salida = [];
    for (const item of arr(raw)) {
        const name = typeof item === 'string' ? str(item, 160) : str(item?.name, 160);
        if (!name) continue;
        const key = clubKey(name);
        if (!key || vistos.has(key)) continue;      // el mismo club dos veces es ruido
        vistos.add(key);
        salida.push({
            name,
            key,
            source: (typeof item === 'object' && item?.source === 'manual') ? 'manual' : 'catalogo',
            district: str(typeof item === 'object' ? (item?.district ?? districtId) : districtId, 80),
        });
        if (salida.length >= MAX_PARTICIPATING_CLUBS) break;
    }
    return salida;
};

/** Los nombres, para el texto legible que consumen la ficha y el brief. */
export const clubNames = (clubs) => arr(clubs).map(c => c?.name).filter(Boolean);

/**
 * El distrito que le corresponde a una campaña, cuando se sabe SIN ambigüedad.
 *
 * Sale del targeting que la campaña ya declara. Con varios distritos NO se
 * elige uno: sería inventar cuál de ellos hizo la actividad, y el formulario
 * abriría con una respuesta puesta que nadie dio. Es un DEFAULT del
 * desplegable, no un valor guardado: quien lo llena puede cambiarlo.
 */
export const defaultDistrictFor = (targeting, catalog = []) => {
    const lista = Array.isArray(catalog) ? catalog : [];
    const ds = Array.isArray(targeting?.districts) ? targeting.districts.map(String) : [];
    if (ds.length !== 1) return '';
    return lista.some(d => d.value === ds[0]) ? ds[0] : '';
};

// ─── Difusión previa: lo que el club YA publicó ────────────────────────
//
// ⚠️ NO ES `USAGE_CHANNELS`, Y FUNDIRLOS BORRARÍA LA PREGUNTA. Aquél responde
// «¿dónde usamos NOSOTROS este material después de aprobarlo?» y lo escribe la
// plataforma; esto responde «¿dónde lo publicó el CLUB antes de mandárnoslo?»
// y lo declara quien envía. Un mismo material puede tener las dos cosas, o una
// sola, y contarlas juntas haría creer que difundimos algo que difundió otro.
// Por eso son dos catálogos y dos tablas.

export const POST_PLATFORM_OTHER = 'otra';

export const POST_PLATFORMS = {
    instagram: { id: 'instagram', label: 'Instagram' },
    facebook: { id: 'facebook', label: 'Facebook' },
    tiktok: { id: 'tiktok', label: 'TikTok' },
    youtube: { id: 'youtube', label: 'YouTube' },
    linkedin: { id: 'linkedin', label: 'LinkedIn' },
    x: { id: 'x', label: 'X' },
    web: { id: 'web', label: 'Página web' },
    blog: { id: 'blog', label: 'Blog' },
    [POST_PLATFORM_OTHER]: { id: POST_PLATFORM_OTHER, label: 'Otra' },
};
export const POST_PLATFORM_IDS = Object.keys(POST_PLATFORMS);
export const isPostPlatform = (id) => POST_PLATFORM_IDS.includes(id);
export const postPlatformLabel = (id, other = '') =>
    (id === POST_PLATFORM_OTHER ? str(other, 80) : '') || POST_PLATFORMS[id]?.label || id;

export const MAX_POSTS = 20;
export const POST_URL_MAX = 600;

/**
 * ¿Esto tiene forma de enlace?
 *
 * SE VALIDA LA FORMA, NO EL DOMINIO (requisito 3): una publicación puede venir
 * como enlace acortado, como redirección o desde un dominio propio, y exigir
 * `instagram.com` en una fila marcada «Instagram» dejaría fuera justamente los
 * casos reales.
 *
 * ⚠️ EL ESQUEMA SÍ SE CIERRA A `http`/`https`, y no es rigidez: este valor
 * termina como `href` de un enlace en el panel administrativo, así que aceptar
 * `javascript:` o `data:` convertiría una casilla de un formulario PÚBLICO en
 * un hueco por donde meter cualquier cosa. Es la misma regla que el mapa de la
 * sede (v4.717) y las redirecciones (v4.781).
 *
 * Sin esquema se asume `https://`: nadie pega «https://» a mano desde el móvil.
 */
export const normalizePostUrl = (raw) => {
    const texto = String(raw ?? '').trim().slice(0, POST_URL_MAX);
    if (!texto) return { ok: false, url: '', host: '', error: 'Falta el enlace de la publicación.' };
    if (/\s/.test(texto)) return { ok: false, url: '', host: '', error: 'El enlace no puede tener espacios.' };

    const conEsquema = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(texto) ? texto : `https://${texto}`;
    let u;
    try { u = new URL(conEsquema); }
    catch { return { ok: false, url: '', host: '', error: `«${texto}» no parece un enlace.` }; }

    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, url: '', host: '', error: 'El enlace tiene que empezar por http:// o https://.' };
    }
    // Un host sin punto no es un sitio de internet: es `localhost` o un error
    // de tipeo. No se exige más que eso.
    if (!u.hostname.includes('.') || u.hostname.endsWith('.')) {
        return { ok: false, url: '', host: '', error: `«${texto}» no parece un enlace de internet.` };
    }
    return { ok: true, url: u.toString().slice(0, POST_URL_MAX), host: u.hostname.replace(/^www\./, ''), error: '' };
};

/**
 * Da forma a las publicaciones ya realizadas.
 *
 * Las filas incompletas —una plataforma elegida y el enlace todavía vacío— se
 * DESCARTAN sin ruido: son las que deja abiertas quien pulsó «Agregar» y no
 * llegó a llenarlas. Las que tienen enlace y no se pueden interpretar se
 * devuelven con su MOTIVO, porque ahí sí hay algo que corregir: un descarte
 * silencioso deja a quien pegó cinco enlaces sin saber cuál no entró.
 */
export const shapePosts = (raw) => {
    const posts = [];
    const problemas = [];
    let orden = 0;
    for (const item of arr(raw)) {
        if (posts.length >= MAX_POSTS) break;
        const platform = isPostPlatform(item?.platform) ? item.platform : '';
        const crudo = String(item?.url ?? '').trim();
        const otra = str(item?.platformOther, 80);
        if (!platform && !crudo) continue;                       // fila vacía
        if (!crudo) continue;                                    // sin enlace no hay publicación
        if (!platform) { problemas.push(`«${crudo.slice(0, 60)}»: falta elegir la plataforma.`); continue; }

        const link = normalizePostUrl(crudo);
        if (!link.ok) { problemas.push(link.error); continue; }
        posts.push({
            platform,
            platformOther: platform === POST_PLATFORM_OTHER ? otra : '',
            url: link.url,
            host: link.host,
            sortOrder: orden++,
        });
    }
    return { posts, problemas };
};

// ─── El envío ──────────────────────────────────────────────────────────

/**
 * Da forma a lo que llega del formulario público.
 *
 * ⚠️ NO ACEPTA `status`, `campaignId` NI NADA DEL CIRCUITO INTERNO. Es la
 * frontera ESTRUCTURAL del portal de Plantillas IA: lo que no se puede
 * expresar en la petición no se puede pedir. La campaña la resuelve el
 * servidor por el enlace, y el estado inicial lo fija el código.
 */
export const shapeSubmission = (raw = {}) => {
    const r = raw && typeof raw === 'object' ? raw : {};
    // El distrito de la ACTIVIDAD. Hasta v4.971 se preguntaba dentro de
    // «¿Quién lo envía?» y significaba lo mismo —quien enviaba declaraba el
    // suyo—, así que la columna se conserva y no se parte en dos: dos columnas
    // de distrito serían dos verdades sobre el mismo hecho.
    const district = str(r.district, 80);
    const clubs = shapeClubs(r.clubs, district);
    // ⚠️ `hasPosts` ES UNA RESPUESTA, NO UNA DEDUCCIÓN. «No publicamos nada»
    // y «dijo que sí y no llegó a escribir ninguno» son cosas distintas, y
    // deducirlo de la lista las fundiría: la segunda hay que poder señalarla.
    const hasPosts = r.hasPosts === true || r.hasPosts === 'si' || r.hasPosts === 'yes';
    const { posts, problemas } = hasPosts ? shapePosts(r.posts) : { posts: [], problemas: [] };
    const phone = shapePhone({
        country: r.senderPhoneCountry, dial: r.senderPhoneDial,
        national: r.senderPhoneNational, raw: r.senderPhone,
    });

    return {
        senderName: str(r.senderName, 160),
        senderEmail: str(r.senderEmail, 200).toLowerCase(),
        senderPhone: phone.phone,
        senderPhoneCountry: phone.country,
        senderPhoneDial: phone.dial,
        senderPhoneNational: phone.national,
        senderPhoneE164: phone.e164,
        district,
        club: str(r.club, 160),
        role: str(r.role, 120),
        title: str(r.title, 160),
        description: multi(r.description, 3000),
        location: str(r.location, 200),
        city: str(r.city, 120),
        activityDate: str(r.activityDate, 40),
        // La copia LEGIBLE de los clubes participantes. No es una segunda
        // verdad: se DERIVA de `clubs` en el mismo envío y nunca se edita
        // aparte. Existe para que todo lo que ya la consume —el brief de la
        // IA, la tarjeta de la bandeja, el aviso por correo— siga funcionando
        // sin cambiar una línea. Lo que se CONSULTA es la tabla.
        participatingClubs: str(clubNames(clubs).join(', '), 400),
        clubs,
        hasPosts,
        posts,
        postIssues: problemas,
        // El campo del requisito 3: qué pasó y qué querrías que Rotary cuente.
        story: multi(r.story, 4000),
        extra: multi(r.extra, 2000),
        consent: r.consent === true,
        files: arr(r.files).slice(0, MAX_FILES).map(f => ({
            key: str(f?.key, 400),
            filename: str(f?.filename, 240),
            contentType: str(f?.contentType, 120),
        })).filter(f => f.key),
    };
};

// ─── Distrito y club ───────────────────────────────────────────────────
//
// ⚠️ EL CATÁLOGO NO SE COPIA ACÁ: LLEGA DE `rotaryClubs.js`, que es su única
// verdad (v4.707). Estas funciones sólo LO LEEN, así que siguen siendo puras y
// el día que el Distrito agregue un club no hay una segunda lista que
// actualizar — que es exactamente lo que la regla de v4.708 evita.
//
// LA LISTA AYUDA A ESCRIBIR; NO CIERRA LOS VALORES (v4.706). Un catálogo se
// queda viejo solo —clubes nuevos, fusiones, cambios de nombre— y acá lo que
// está en juego es que alguien no pueda mandar las fotos de su club. Por eso
// el desplegable termina en «Mi club no está en la lista» y el servidor sigue
// aceptando cualquier texto.

/** El valor reservado del desplegable de clubes. El MISMO de los otros
 *  formularios del sitio (`eventRegistrationSpec.ts`): con dos valores
 *  distintos, una salida manual se guardaría como si fuera el nombre de un
 *  club. */
export const CLUB_NOT_LISTED = '__otro__';

/** Los clubes del distrito elegido, o `[]`. Acepta el número («4281») y la
 *  etiqueta («Distrito 4281»), porque el desplegable manda el primero y un
 *  envío viejo pudo guardar el segundo. */
export const clubsForDistrict = (catalog, district) => {
    const lista = Array.isArray(catalog) ? catalog : [];
    const buscado = String(district || '').trim();
    if (!buscado) return [];
    const d = lista.find(x => x.value === buscado || x.label === buscado);
    return Array.isArray(d?.clubs) ? d.clubs : [];
};

/**
 * ¿El club declarado pertenece, según el catálogo, a OTRO distrito?
 *
 * No es «un club que falta»: es una pareja que se contradice, y por eso se
 * puede señalar sin falso positivo — un club que figure en los dos distritos
 * pasa por la primera condición. Es la misma comprobación que la postulación
 * (v4.706) y el registro a un evento (v4.708).
 *
 * ⚠️ ACÁ AVISA, NO RECHAZA, y la diferencia es deliberada. Allá es una
 * inscripción que se PAGA y el dato gobierna la logística; acá alguien está
 * regalando el material de su club desde el teléfono, y perderlo por una
 * pareja mal elegida sería el control demasiado estricto que este archivo
 * documenta una y otra vez: no falla ruidosamente, entrega otra cosa. El
 * equipo lo ve en la ficha y lo corrige.
 */
export const districtOfClub = (catalog, club) => {
    const lista = Array.isArray(catalog) ? catalog : [];
    const buscado = String(club || '').trim().toLowerCase();
    if (!buscado) return null;
    const d = lista.find(x => (x.clubs || []).some(c => String(c).trim().toLowerCase() === buscado));
    return d ? d.value : null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Qué se exige y qué no.
 *
 * SE EXIGE POCO A PROPÓSITO (requisito 2): quién envía, cómo contestarle, el
 * consentimiento y al menos un archivo — que es el motivo del formulario. Todo
 * lo demás enriquece y se pide, pero no bloquea: un club que documenta desde el
 * teléfono en la calle no puede quedarse fuera por no saber el nombre exacto de
 * la vereda.
 *
 * Lo que falta se DEVUELVE como aviso, no se descarta en silencio: es lo que
 * después le permite al panel pedirlo con «Requiere información».
 */
export const validateSubmission = (data, { consentRequired = true, districtCatalog = [] } = {}) => {
    const errors = [];
    const warnings = [];

    if (!data.senderName) errors.push('Escribí tu nombre.');
    if (!data.senderEmail) errors.push('Escribí tu correo electrónico.');
    else if (!EMAIL_RE.test(data.senderEmail)) errors.push('El correo electrónico no parece válido.');
    if (consentRequired && !data.consent) errors.push('Hay que aceptar las condiciones para poder enviar el material.');
    if (!data.files.length) errors.push('Adjuntá al menos una fotografía o un video.');
    if (data.files.length > MAX_FILES) errors.push(`Se pueden enviar hasta ${MAX_FILES} archivos por envío.`);

    // ⚠️ DECIR QUE SÍ SIN NINGUNA PUBLICACIÓN VÁLIDA ES UN ERROR, NO UN AVISO
    // (requisito 3): quien marcó «Sí» está afirmando que existe una difusión y
    // dejarlo pasar guardaría una afirmación que nada respalda. Marcar «No» no
    // exige nada — no se obliga a registrar publicaciones que no hubo.
    if (data.hasPosts && !arr(data.posts).length) {
        errors.push('Indicaste que la actividad ya se publicó: agregá al menos una plataforma con su enlace.');
    }
    // Lo que se descartó por no poder interpretarse se DICE con su motivo. Un
    // descarte silencioso deja a quien pegó cinco enlaces sin saber cuál no
    // entró (la regla de `skipped` en los centros de acopio).
    for (const p of arr(data.postIssues).slice(0, 5)) warnings.push(p);

    if (!data.story && !data.description) {
        warnings.push('No contaste qué ocurrió. Sin ese contexto, el material se puede archivar pero no se puede comunicar bien.');
    }

    // ── Participación rotaria ──────────────────────────────────────────
    const participantes = arr(data.clubs);
    if (!participantes.length && !data.club) warnings.push('No indicaste qué club participó en la actividad.');

    // La pareja que se contradice. Sólo cuando el catálogo RECONOCE el club:
    // si no lo conoce, no es una contradicción — es un club que la lista no
    // tiene todavía, que es legítimo y frecuente.
    //
    // ⚠️ AVISA, NO RECHAZA, y la diferencia es deliberada. En una inscripción
    // que se PAGA el dato gobierna la logística y se rechaza (v4.706/v4.708);
    // acá alguien está regalando el material de su club desde el teléfono, y
    // perderlo por una pareja mal elegida sería el control demasiado estricto
    // que este archivo documenta una y otra vez: no falla ruidosamente,
    // entrega otra cosa.
    const declarado = String(data.district || '').trim();
    if (declarado) {
        const ajenos = [];
        for (const nombre of [...clubNames(participantes), data.club].filter(Boolean)) {
            const suyo = districtOfClub(districtCatalog, nombre);
            const mismo = suyo && (suyo === declarado || `Distrito ${suyo}` === declarado);
            if (suyo && !mismo && !ajenos.some(a => a.club === nombre)) ajenos.push({ club: nombre, suyo });
        }
        for (const a of ajenos.slice(0, 3)) {
            warnings.push(`Según el catálogo, «${a.club}» pertenece al Distrito ${a.suyo} y se declaró el ${declarado}.`);
        }
    }

    if (!data.city && !data.location) warnings.push('No indicaste dónde fue la actividad.');
    if (!data.activityDate) warnings.push('No indicaste la fecha de la actividad.');

    return { ok: errors.length === 0, errors, warnings };
};

// ─── El contexto que viaja hacia la difusión ───────────────────────────

/**
 * Lo que quien envió contó, en la forma en que lo consume el Generador de
 * Publicaciones (requisito 8).
 *
 * ⚠️ NO INTERPRETA NI COMPLETA. Enumera lo que hay y **declara lo que no se
 * sabe**, porque un hueco en silencio es una invitación a completarlo y un
 * modelo de lenguaje completa huecos por diseño — la lección de la Campaña de
 * Emergencia (v4.783) y la del tipo «Maneras de Contribuir» (v4.967).
 */
export const buildSubmissionContext = (s = {}) => {
    const L = [];
    if (s.title) L.push(`Actividad: «${s.title}».`);
    if (s.story) L.push(`Lo que contó quien la envió: «${s.story}»`);
    if (s.description && s.description !== s.story) L.push(`Descripción: «${s.description}»`);

    const donde = [s.location, s.city].filter(Boolean).join(', ');
    if (donde) L.push(`Dónde ocurrió: ${donde}. Podés nombrarlo.`);
    else L.push('NO se indicó dónde ocurrió: no nombres ninguna ciudad ni lugar.');

    if (s.activityDate) L.push(`Cuándo ocurrió: ${s.activityDate}. Podés nombrarlo.`);
    else L.push('NO se indicó la fecha de la actividad: no la menciones ni la calcules.');

    // Los clubes salen de la lista ESTRUCTURADA cuando la hay, y del texto
    // legible cuando la solicitud es anterior a v4.972: las dos dicen lo
    // mismo, pero la primera es la que no depende de cómo se escribió.
    const participantes = clubNames(s.clubs).join('; ') || String(s.participatingClubs || '');
    const clubes = [s.club, participantes].filter(Boolean).join('; ');
    if (s.district) L.push(`Distrito Rotario: ${s.district}. Podés nombrarlo.`);
    if (clubes) L.push(`Clubes o entidades participantes: ${clubes}. No nombres ningún otro.`);
    else L.push('NO se indicó qué club participó: no nombres ninguno.');

    // La difusión previa se NOMBRA sin sus enlaces: sirve para no escribir
    // «por primera vez» sobre algo que el club ya publicó, y un enlace dentro
    // del brief terminaría copiado en el copy.
    const plataformas = [...new Set(arr(s.posts).map(p => postPlatformLabel(p?.platform, p?.platformOther)).filter(Boolean))];
    if (plataformas.length) L.push(`El club YA publicó esta actividad en: ${plataformas.join(', ')}. No digas que es la primera vez que se comunica.`);

    if (s.extra) L.push(`Información adicional: «${s.extra}»`);
    L.push('Todo esto lo escribió quien envió el material y es información suministrada: podés usarla y nombrarla. Lo que no esté acá, no existe — no deduzcas de la fotografía cuántas personas hay, qué se entregó ni dónde fue tomada.');
    return L.join('\n');
};

/** Una línea corta para la tarjeta de la foto en el selector. */
export const submissionCaption = (s = {}) => {
    const partes = [s.title, [s.city, s.activityDate].filter(Boolean).join(' · ')].filter(Boolean);
    return str(partes.join(' — '), 200);
};

// ─── El uso: dónde terminó cada solicitud ──────────────────────────────
//
// Catálogo CERRADO. Sin esta puerta, el seguimiento aceptaría cualquier
// etiqueta y la pregunta «¿dónde se usó esto?» dejaría de tener respuesta
// comparable entre solicitudes.
export const USAGE_CHANNELS = {
    instagram: { id: 'instagram', label: 'Instagram', auto: true },
    facebook: { id: 'facebook', label: 'Facebook', auto: true },
    x: { id: 'x', label: 'X', auto: true },
    linkedin: { id: 'linkedin', label: 'LinkedIn', auto: true },
    email: { id: 'email', label: 'Correo', auto: false },
    whatsapp: { id: 'whatsapp', label: 'WhatsApp', auto: false },
    web: { id: 'web', label: 'Sitio web', auto: false },
};
export const USAGE_CHANNEL_IDS = Object.keys(USAGE_CHANNELS);
export const isUsageChannel = (id) => USAGE_CHANNEL_IDS.includes(id);

/**
 * `auto` distingue lo MEDIDO de lo DECLARADO, y la pantalla lo dice.
 *
 * Las cuatro redes se derivan de las publicaciones que de verdad usaron ese
 * archivo (`SocialPublicationOrigin`, v4.967); correo y WhatsApp los marca una
 * persona, porque esos módulos no registran hoy qué archivo usaron. Presentar
 * las dos cosas igual haría creer que se midió algo que se declaró.
 */
export const usageIsMeasured = (channel) => USAGE_CHANNELS[channel]?.auto === true;

export default {
    SUBMISSION_STATES, SUBMISSION_STATE_IDS, INITIAL_STATE, stateLabel,
    canTransitionSubmission, nextStates, needsReason, REASON_REQUIRED,
    IMAGE_TYPES, VIDEO_TYPES, MAX_FILES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES,
    kindOf, extensionFor, checkFileMeta,
    DEFAULT_CONSENT_TEXT, consentIsConfigured, consentTextFor,
    normalizeSubmissionsConfig, defaultInviteMessage, inviteMessageFor,
    shapeSubmission, validateSubmission, buildSubmissionContext, submissionCaption,
    shapePhone, E164_MAX_DIGITS,
    clubKey, shapeClubs, clubNames, defaultDistrictFor, MAX_PARTICIPATING_CLUBS,
    POST_PLATFORMS, POST_PLATFORM_IDS, POST_PLATFORM_OTHER, isPostPlatform,
    postPlatformLabel, normalizePostUrl, shapePosts, MAX_POSTS,
    USAGE_CHANNELS, USAGE_CHANNEL_IDS, isUsageChannel, usageIsMeasured,
};
