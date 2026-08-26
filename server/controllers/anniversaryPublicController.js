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
import { readPublishedConfig, createPiece, readPiece } from '../lib/anniversaryStore.js';
import {
    scopeReaches, normalizeYears, printableClubName, LIMITS, STAGES, GENERATOR_LABEL,
    ANNIVERSARY_DISTRICT,
} from '../lib/anniversarySpec.js';
import { ingestPhoto } from '../lib/anniversaryEngine.js';
import { searchPublicClubs, findPublicClub, clubDisplayName } from '../lib/publicClubs.js';
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
    getPublicConfig, getPublicClubs, postPublicPhoto,
    postPublicAnalyze, postPublicCopy, postPublicCompose, getPublicPiece,
};
