// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — el formulario público
// v4.895.0
//
// Sin sesión. Cuatro campos y un botón: club, años, fotografía, generar.
//
// ── LO QUE ESTE ENDPOINT PUEDE Y NO PUEDE HACER ─────────────────────
//
// Sólo acepta lo que el formulario ofrece: el nombre de un club, un entero de
// años y una fotografía. **La configuración NO viaja en la petición**: se lee
// de lo PUBLICADO, en el servidor. Con la configuración en el cuerpo,
// cualquiera con el endpoint podría mandar sus propias instrucciones al modelo
// y gastar créditos generando lo que quisiera. Es la misma frontera estructural
// que el portal de Plantillas IA: lo que no se puede expresar en la petición no
// se puede pedir.
//
// ── EL ALCANCE LO RESUELVE EL SERVIDOR ──────────────────────────────
//
// `scopeReaches` decide si este generador está habilitado para el sitio desde
// el que se pide. En la pantalla sería una casilla que se saltea quien conozca
// la dirección.
// ════════════════════════════════════════════════════════════════════
import { readPublishedConfig, createPiece, readPiece, updatePiece } from '../lib/anniversaryStore.js';
import {
    scopeReaches, normalizeYears, printableClubName, LIMITS, STAGES, GENERATOR_LABEL,
    ANNIVERSARY_DISTRICT, DEFAULT_GOVERNOR, EMAIL_MAX_RECIPIENTS, EMAIL_MESSAGE_MAX,
    rotaryPeriodFor, composeGreeting, greetingEmailSubject, GREETING_SYSTEM,
    buildGreetingUser, readGreeting, validateGreeting, greetingRetryClause,
    fallbackGreeting, parseRecipients, buildGreetingEmail,
} from '../lib/anniversarySpec.js';
import { ingestPhoto, storeBuffer, decodeDataUrl } from '../lib/anniversaryEngine.js';
import { generateCopy } from '../services/copywritingService.js';
import EmailService from '../services/EmailService.js';
import { resolveSenderPlan } from '../lib/notificationSpec.js';
import { verifiedDomains } from '../lib/senderDomains.js';
import { searchPublicClubs, findPublicClub, clubDisplayName } from '../lib/publicClubs.js';
import { DISTRICT_SITE_SQL, districtSiteParams, pickDistrictSite } from '../lib/districtSite.js';
import { runAnalyze, runCopy, runCompose, runSync } from './anniversaryController.js';
import db from '../lib/db.js';

/**
 * El sitio desde el que se está pidiendo. Sale del anfitrión, nunca del cuerpo:
 * si lo mandara el navegador, acotar el alcance a unos sitios no serviría de
 * nada.
 *
 * DEGRADA a `null` ante cualquier fallo — sin sitio identificado, el alcance
 * `all` sigue funcionando, que es el caso normal.
 */
const siteFromRequest = async (req) => {
    try {
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
            .split(':')[0].replace(/^www\./i, '').toLowerCase();
        if (!host) return null;
        const { rows } = await db.query(`SELECT id FROM "Club" WHERE lower(domain) = $1 LIMIT 1`, [host]);
        return rows[0]?.id || null;
    } catch { return null; }
};

/** El club, si además existe como sitio en la plataforma. Es lo único que
 *  permite imprimir su logotipo REAL — y si no existe, no se imprime ninguno.
 *  Nunca se dibuja un emblema. */
const subjectClubFor = async (nombre) => {
    try {
        const q = String(nombre || '').trim();
        if (!q) return null;
        const { rows } = await db.query(
            `SELECT id FROM "Club"
              WHERE lower(name) = lower($1) OR lower(name) = lower($2)
              ORDER BY (lower(name) = lower($1)) DESC
              LIMIT 1`,
            [q, clubDisplayName(q)]
        );
        return rows[0]?.id || null;
    } catch { return null; }
};

const disponible = async (req) => {
    const pub = await readPublishedConfig(null);
    if (!pub || !pub.enabled) return null;
    const clubId = await siteFromRequest(req);
    if (!scopeReaches(pub.config, clubId)) return null;
    return { ...pub, clubId };
};

// ── GET /public/config ────────────────────────────────────────────────
//
// Lo que la página necesita para pintarse. NO devuelve las instrucciones: son
// la propiedad intelectual de la configuración y no le sirven a quien genera.
export const getPublicConfig = async (req, res) => {
    try {
        const ctx = await disponible(req);
        if (!ctx) {
            // No es un error: es que todavía no está publicado o no alcanza a
            // este sitio. Se dice así, no con un 404 mudo.
            return res.json({ available: false, label: GENERATOR_LABEL, reason: 'El generador de aniversarios todavía no está disponible en este sitio.' });
        }
        res.json({
            available: true,
            label: ctx.config.name || GENERATOR_LABEL,
            stages: STAGES,
            limits: { years: LIMITS.years },
            format: ctx.config.format,
        });
    } catch (e) {
        console.error('[anniversary/public/config]', e);
        // La página pública NUNCA recibe un 500 de acá: se degrada a «no
        // disponible», que es lo que el visitante puede entender.
        res.json({ available: false, label: GENERATOR_LABEL, reason: 'El generador de aniversarios no está disponible en este momento.' });
    }
};

// ── GET /public/clubs ─────────────────────────────────────────────────
//
// El buscador. Sale del catálogo curado (`publicClubs`), NO del directorio de
// sitios: aquél incluye organizaciones que no son clubes y sitios a medio
// configurar, y abrirlo entero a una página sin autenticación expone más de lo
// que esta función necesita. Y es la MISMA lista que el rotario ya vio al
// postular su proyecto o al inscribirse al evento.
//
// ACOTADO AL DISTRITO 4281 (v4.927, pedido expreso): el filtro va en el
// DATASET —el servidor nunca manda un club de otro distrito—, no en la
// pantalla. El campo sigue aceptando texto libre (v4.706).
export const getPublicClubs = async (req, res) => {
    try {
        if (!await disponible(req)) return res.json({ clubs: [] });
        res.json({ clubs: searchPublicClubs(req.query?.q || '', req.query?.limit, ANNIVERSARY_DISTRICT) });
    } catch (e) {
        console.error('[anniversary/public/clubs]', e);
        res.json({ clubs: [] });
    }
};

// ── GET /public/library ───────────────────────────────────────────────
//
// La Biblioteca Multimedia del club elegido (v4.928): si el club del catálogo
// 4281 ya tiene su sitio en la plataforma, se le ofrecen SUS fotografías en
// vez de obligarlo a descargarlas y volverlas a subir. Sin club —o con un club
// sin sitio— se cae a la biblioteca del sitio del DISTRITO 4281.
//
// LA RESOLUCIÓN ES DEL SERVIDOR Y REUTILIZA LAS RELACIONES QUE YA EXISTEN:
//   · club escrito → sitio: la MISMA consulta por nombre que `subjectClubFor`
//     usa desde v4.895 para el logotipo real (Club.name contra el nombre corto
//     y contra `clubDisplayName`) — no se construye ningún dominio a mano;
//   · distrito → sitio: `DISTRICT_SITE_SQL` + `pickDistrictSite` (v4.744), el
//     mismo criterio con el que `by-domain` sirve rotary4281.org.
//
// EL AISLAMIENTO ES ESTRUCTURAL, no una casilla: el navegador manda sólo el
// NOMBRE del club —el mismo texto libre que ya viaja a `createPiece`— y el
// universo alcanzable queda acotado por `findPublicClub(…, ANNIVERSARY_DISTRICT)`:
// un nombre que no esté en el catálogo del 4281 no resuelve ningún sitio y cae
// al distrito. No hay `siteId` ni `tenantId` en la petición que se pueda
// manipular. Un sitio dado de baja (`status = 'inactive'`) tampoco resuelve.
//
// Se listan SÓLO imágenes (`Media.type = 'image'`) del `clubId` resuelto, sin
// HEIC —ningún navegador salvo Safari los dibuja (v4.739)—. Son archivos con
// URL pública que ese sitio ya sirve en sus páginas; lo que este endpoint
// agrega es la LISTA, no una clase de acceso nueva. Y DEGRADA siempre: corre
// en una página pública y una biblioteca caída no puede tumbar el formulario.
const librarySiteFor = async (escrito) => {
    const nombre = String(escrito || '').trim();
    if (nombre && findPublicClub(nombre, ANNIVERSARY_DISTRICT)) {
        const { rows } = await db.query(
            `SELECT id, name, status FROM "Club"
              WHERE lower(name) = lower($1) OR lower(name) = lower($2)
              ORDER BY (lower(name) = lower($1)) DESC
              LIMIT 1`,
            [nombre, clubDisplayName(nombre)]
        );
        const sitio = rows[0];
        if (sitio && String(sitio.status || 'active').toLowerCase() !== 'inactive') {
            return { id: sitio.id, label: clubDisplayName(nombre), scope: 'club' };
        }
    }
    // Sin club, club sin sitio o sitio de baja: la biblioteca del Distrito.
    const d = await db.query(
        `SELECT id, number, subdomain FROM "District" WHERE number = $1 LIMIT 1`,
        [Number(ANNIVERSARY_DISTRICT)]
    );
    if (!d.rows[0]) return null;
    const cand = await db.query(DISTRICT_SITE_SQL, districtSiteParams(d.rows[0]));
    const sitio = pickDistrictSite(d.rows[0], cand.rows);
    return sitio ? { id: sitio.id, label: `Distrito ${ANNIVERSARY_DISTRICT}`, scope: 'district' } : null;
};

export const getPublicLibrary = async (req, res) => {
    try {
        if (!await disponible(req)) return res.json({ scope: 'none', label: '', images: [] });
        const sitio = await librarySiteFor(req.query?.club);
        if (!sitio) return res.json({ scope: 'none', label: '', images: [] });
        const { rows } = await db.query(
            `SELECT id, filename, url, "thumbUrl" FROM "Media"
              WHERE "clubId" = $1 AND type = 'image'
              ORDER BY "createdAt" DESC
              LIMIT 60`,
            [sitio.id]
        );
        const images = rows
            .filter(m => !/\.hei[cf]($|\?)/i.test(String(m.url || '')))
            .map(m => ({ id: m.id, name: m.filename || '', url: m.url, thumbUrl: m.thumbUrl || null }));
        res.json({ scope: sitio.scope, label: sitio.label, images });
    } catch (e) {
        console.error('[anniversary/public/library]', e);
        res.json({ scope: 'none', label: '', images: [] });
    }
};

// ── POST /public/photo ────────────────────────────────────────────────
//
// Etapa 1. Crea la fila ANTES de llamar a ningún proveedor: si la petición
// muere a mitad, queda el rastro con su motivo en vez de no quedar nada. Es la
// regla del Creador de Reels (v4.669).
export const postPublicPhoto = async (req, res) => {
    try {
        const ctx = await disponible(req);
        if (!ctx) return res.status(404).json({ error: 'El generador de aniversarios no está disponible en este sitio.' });

        const escrito = String(req.body?.clubName || '').trim();
        if (!escrito) return res.status(400).json({ error: 'Elegí tu club.' });
        const years = normalizeYears(req.body?.years);
        if (!years) return res.status(400).json({ error: `¿Cuántos años cumple el club? Tiene que ser un número entre ${LIMITS.years.min} y ${LIMITS.years.max}.` });
        if (!String(req.body?.photo || '').startsWith('data:image/')) {
            return res.status(400).json({ error: 'Subí una fotografía del club (JPG, PNG o WebP).' });
        }

        const foto = await ingestPhoto(req.body.photo, { prefix: 'anniversaries/public' });
        const catalogo = findPublicClub(escrito, ANNIVERSARY_DISTRICT);
        const clubName = printableClubName(escrito, {
            useFullClubName: ctx.config.useFullClubName,
            displayName: catalogo?.display || clubDisplayName(escrito),
        });

        const piece = await createPiece({
            configId: ctx.configId, versionId: ctx.versionId, versionNumber: null, mode: 'public',
            clubId: ctx.clubId, subjectClubId: await subjectClubFor(escrito),
            clubName, years,
            photoUrl: foto.url, photoWidth: foto.width, photoHeight: foto.height,
        });

        res.json({
            pieceId: piece.id, clubName, years,
            width: foto.width, height: foto.height,
            warnings: foto.warnings,
        });
    } catch (e) {
        console.error('[anniversary/public/photo]', e);
        res.status(400).json({ error: e.message || 'No se pudo procesar la fotografía. Probá con otra.' });
    }
};

/** Que la pieza pertenezca a una generación PÚBLICA. Sin esta comprobación, el
 *  endpoint abierto podría hacer avanzar una pieza del panel de pruebas. */
const publicPiece = async (id) => {
    const p = await readPiece(id);
    return p && p.mode === 'public' ? p : null;
};

// ════════════════════════════════════════════════════════════════════
// EL MENSAJE PARA COMPARTIR Y EL ENVÍO POR CORREO (v4.929)
// ════════════════════════════════════════════════════════════════════

/** El Gobernador y el dominio salen de la fila REAL de `District` (número
 *  4281); la constante del spec es sólo el respaldo. DEGRADA siempre. */
const districtIdentity = async () => {
    try {
        const { rows } = await db.query(
            `SELECT id, number, subdomain, governor, domain FROM "District" WHERE number = $1 LIMIT 1`,
            [Number(ANNIVERSARY_DISTRICT)]
        );
        return {
            governor: String(rows[0]?.governor || '').trim() || DEFAULT_GOVERNOR,
            domain: String(rows[0]?.domain || '').trim(),
        };
    } catch { return { governor: DEFAULT_GOVERNOR, domain: '' }; }
};

/**
 * EL MODELO ESCRIBE EL CUERPO, EL CÓDIGO DECIDE (`validateGreeting`) y
 * reintenta UNA vez con la regla concreta. Agotado el reintento —o sin
 * modelo— sale el mensaje de PLANTILLA y se dice (`source`): la pieza nunca
 * se queda sin mensaje por un fallo del redactor.
 */
const redactGreeting = async ({ clubName, years }) => {
    let user = buildGreetingUser({ clubName, years });
    for (let intento = 0; intento < 2; intento++) {
        try {
            const raw = await generateCopy({ system: GREETING_SYSTEM, userText: user, temperature: 0.8 });
            const body = readGreeting(raw?.content);
            const v = validateGreeting(body, { clubName, years });
            if (v.ok) return { body, source: 'ai' };
            user = `${buildGreetingUser({ clubName, years })}\n${greetingRetryClause(v.errors)}`;
        } catch { break; }
    }
    return { body: fallbackGreeting({ clubName, years }), source: 'plantilla' };
};

// ── POST /public/greeting ─────────────────────────────────────────────
//
// Se pide DESPUÉS de que la pieza está lista y es independiente de la
// generación: si el redactor falla, la imagen no se pierde — y al revés. El
// mensaje queda guardado en la pieza (`copy.greeting`): pedirlo de nuevo
// devuelve el mismo, y regenerar el diseño crea OTRA pieza con otro mensaje.
export const postPublicGreeting = async (req, res) => {
    try {
        if (!await disponible(req)) return res.status(404).json({ error: 'El generador de aniversarios no está disponible en este sitio.' });
        const piece = await readPiece(String(req.body?.pieceId || ''));
        if (!piece || piece.mode !== 'public') return res.status(404).json({ error: 'Esa generación no existe.' });
        if (piece.status !== 'ready') return res.status(409).json({ error: 'La pieza todavía no está lista.' });

        const subject = greetingEmailSubject(piece.clubName);
        if (piece.copy?.greeting) {
            return res.json({ greeting: piece.copy.greeting, subject, source: piece.copy.greetingSource || 'ai' });
        }

        const { governor } = await districtIdentity();
        const period = rotaryPeriodFor(new Date());
        const { body, source } = await redactGreeting({ clubName: piece.clubName, years: piece.years });
        const greeting = composeGreeting(body, { governor, period });
        await updatePiece(piece.id, { copy: { ...(piece.copy || {}), greeting, greetingSource: source } }).catch(() => {});
        res.json({
            greeting, subject, source,
            ...(source === 'plantilla' ? { note: 'El redactor no respondió: se usó el mensaje institucional estándar.' } : {}),
        });
    } catch (e) {
        console.error('[anniversary/public/greeting]', e);
        res.status(500).json({ error: 'No se pudo redactar el mensaje. La pieza no se pierde: probá de nuevo.' });
    }
};

// ── POST /email (AUTENTICADO) ─────────────────────────────────────────
//
// El envío institucional exige SESIÓN de administrador (la ruta lleva
// authMiddleware y acá se comprueba OTRA VEZ — una ruta que se reordene
// perdería la guardia sin que nada avise). Un formulario anónimo que manda
// correos firmados por el Gobernador sería un cañón de spam institucional.
//
// La pieza FINAL la compone el navegador (la vista previa ES el archivo):
// llega como data URL, se sube a NUESTRO bucket y el correo la muestra y la
// adjunta. El remitente lo resuelve `resolveSenderPlan` con el dominio del
// Distrito — NUNCA se envía desde un dominio sin verificar (regla de
// v4.857); si no está verificado, cae al central o al respaldo y se DICE.
export const postEmailPiece = async (req, res) => {
    try {
        if (!req.user?.id) return res.status(401).json({ error: 'Iniciá sesión para enviar correos institucionales.' });
        const piece = await readPiece(String(req.body?.pieceId || ''));
        if (!piece || piece.status !== 'ready') return res.status(404).json({ error: 'La pieza no existe o todavía no está lista.' });

        const parsed = parseRecipients(req.body?.to);
        if (parsed.bad.length) return res.status(400).json({ error: `Direcciones inválidas: ${parsed.bad.join(', ')}` });
        if (!parsed.ok.length) return res.status(400).json({ error: 'Agregá al menos un destinatario.' });
        if (parsed.ok.length > EMAIL_MAX_RECIPIENTS) {
            return res.status(400).json({ error: `Máximo ${EMAIL_MAX_RECIPIENTS} destinatarios por envío.` });
        }

        const message = String(req.body?.message || '').trim().slice(0, EMAIL_MESSAGE_MAX);
        if (!message) return res.status(400).json({ error: 'El mensaje del correo no puede estar vacío.' });

        const img = decodeDataUrl(req.body?.image);
        if (!img) return res.status(400).json({ error: 'Falta la pieza final: volvé a la pantalla y reintentá.' });
        const imageUrl = await storeBuffer(img.buffer, { prefix: 'anniversaries/mail', ext: img.ext, mime: img.mime });

        const { domain } = await districtIdentity();
        const dominios = await verifiedDomains().catch(() => []);
        const plan = resolveSenderPlan({
            siteDomain: domain,
            verifiedDomains: Array.isArray(dominios) ? dominios : [],
            displayName: `Distrito ${ANNIVERSARY_DISTRICT} de Rotary International`,
        });

        const salida = buildGreetingEmail({
            clubName: piece.clubName, message, imageUrl, subject: req.body?.subject,
        });
        const archivo = `aniversario-${String(piece.clubName || 'club').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'club'}.${img.ext}`;

        // Un correo por destinatario, cada uno con su resultado: «enviado» sólo
        // cuando el proveedor lo confirmó — nunca antes (regla del pedido).
        const resultados = [];
        for (const destino of parsed.ok) {
            const r = await EmailService.sendPlatformEmail({
                to: destino, subject: salida.subject, html: salida.html, text: salida.text,
                from: plan.from, replyTo: plan.replyTo || undefined,
                attachments: [{ filename: archivo, path: imageUrl }],
            });
            resultados.push(r?.success
                ? { to: destino, ok: true }
                : { to: destino, ok: false, error: String(r?.error || 'el proveedor no confirmó el envío').slice(0, 300) });
        }
        const enviados = resultados.filter(r => r.ok);
        res.json({
            ok: enviados.length === resultados.length,
            sent: enviados.length,
            failed: resultados.filter(r => !r.ok),
            sender: { address: plan.address, level: plan.level, reason: plan.reason },
        });
    } catch (e) {
        console.error('[anniversary/email]', e);
        res.status(500).json({ error: 'No se pudo enviar el correo. La pieza y el mensaje siguen acá: probá de nuevo.' });
    }
};

const guard = (handler) => async (req, res) => {
    const ctx = await disponible(req);
    if (!ctx) return res.status(404).json({ error: 'El generador de aniversarios no está disponible en este sitio.' });
    const id = req.body?.pieceId || req.params?.id;
    if (!await publicPiece(id)) return res.status(404).json({ error: 'Esa generación no existe.' });
    return handler(req, res, { draft: false });
};

// Etapas 2, 3, 4 y el sondeo. Son las MISMAS funciones que usa el panel de
// pruebas: con dos implementaciones, probar una instrucción no diría nada
// sobre lo que hace la gente.
export const postPublicAnalyze = guard(runAnalyze);
export const postPublicCopy = guard(runCopy);
export const postPublicCompose = guard(runCompose);
export const getPublicPiece = guard(runSync);

export default {
    getPublicConfig, getPublicClubs, getPublicLibrary, postPublicPhoto,
    postPublicAnalyze, postPublicCopy, postPublicCompose, getPublicPiece,
    postPublicGreeting, postEmailPiece,
};
