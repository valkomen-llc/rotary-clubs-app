// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — el panel administrativo
// v4.895.0
//
// Configuración, referencias, panel de pruebas, versiones y publicación.
//
// ── ES DEL OPERADOR DE LA PLATAFORMA, Y SE COMPRUEBA DOS VECES ──────
//
// En la ruta y OTRA VEZ en cada método. Se protegen por separado a propósito:
// una ruta que se reordene o se copie a otro archivo perdería la guardia sin
// que nada avise. Es la regla del panel de Notificaciones (v4.856).
//
// Lo que gobierna esta configuración son las instrucciones con las que se
// generan piezas que salen firmadas por clubes de todo el ecosistema; no es
// contenido de un sitio.
// ════════════════════════════════════════════════════════════════════
import {
    readDraftConfig, readPublishedConfig, saveDraftConfig, publishConfig, unpublishConfig,
    listVersions, readVersion, listPieces, createPiece, readPiece, updatePiece,
    claimPieceForDispatch, ensureConfigRow,
} from '../lib/anniversaryStore.js';
import {
    validateConfig, normalizeConfig, fingerprintOf, GENERATOR_KIND, GENERATOR_LABEL,
    FORMATS, RESOLUTIONS, BRANDING_FIELDS, STAGES, TEXT_ZONES, LIMITS, MAX_REFERENCES,
    DEFAULT_DESIGN_INSTRUCTION, DEFAULT_MESSAGE_INSTRUCTION, DEFAULT_RESTRICTIONS,
    normalizeYears, printableClubName, textZoneFor, canvasSize,
} from '../lib/anniversarySpec.js';
import {
    ingestPhoto, analyzePhoto, writeCopy, startComposition, syncComposition,
    verifyComposition, resolveBranding, retryClause, COMPOSE_MODEL,
} from '../lib/anniversaryEngine.js';
import { clubDisplayName, findPublicClub, searchPublicClubs } from '../lib/publicClubs.js';

/** El operador de la plataforma. Se comprueba acá además de en la ruta. */
const esOperador = (req) => req.user?.role === 'administrator' || req.user?.role === 'superadmin';
const negar = (res) => res.status(403).json({ error: 'Esta configuración es del operador de la plataforma.' });

// La configuración vive en la fila de la plataforma. `clubId` en null: la
// columna existe para el día que un sitio tenga la suya, pero hoy no se
// escribe ninguna fila con sitio — y decirlo evita que alguien la dé por
// implementada.
const SCOPE = null;

// ── GET /catalog ──────────────────────────────────────────────────────
// Todo lo que la pantalla necesita para pintarse sin adivinar nada.
export const getCatalog = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        res.json({
            kind: GENERATOR_KIND,
            label: GENERATOR_LABEL,
            formats: Object.values(FORMATS),
            resolutions: RESOLUTIONS,
            brandingFields: Object.values(BRANDING_FIELDS),
            stages: STAGES,
            textZones: Object.values(TEXT_ZONES),
            limits: LIMITS,
            maxReferences: MAX_REFERENCES,
            defaults: {
                designInstruction: DEFAULT_DESIGN_INSTRUCTION,
                messageInstruction: DEFAULT_MESSAGE_INSTRUCTION,
                restrictions: DEFAULT_RESTRICTIONS,
            },
            // Que el modelo esté configurado NO es un detalle interno: sin la
            // credencial este módulo no genera nada, y el panel tiene que
            // decirlo antes de que alguien publique y descubra el hueco.
            engine: {
                model: COMPOSE_MODEL(),
                configured: !!process.env.KIE_API_KEY,
                envKey: 'KIE_API_KEY',
            },
        });
    } catch (e) {
        console.error('[anniversary/catalog]', e);
        res.status(500).json({ error: e.message });
    }
};

// ── GET /config ───────────────────────────────────────────────────────
export const getConfig = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const { row, config } = await readDraftConfig(SCOPE);
        const check = validateConfig(config);
        res.json({
            config,
            published: row.published ? normalizeConfig(row.published) : null,
            publishedAt: row.publishedAt,
            publishedVersionId: row.publishedVersionId,
            // Si el borrador difiere de lo publicado, la pantalla lo dice: es
            // lo que contesta «¿por qué el formulario público sigue haciendo
            // lo de antes?» sin tener que adivinar.
            dirty: !row.published || fingerprintOf(row.published) !== fingerprintOf(config),
            fingerprint: fingerprintOf(config),
            errors: check.errors,
            warnings: check.warnings,
        });
    } catch (e) {
        console.error('[anniversary/getConfig]', e);
        res.status(500).json({ error: e.message });
    }
};

// ── PUT /config ───────────────────────────────────────────────────────
export const putConfig = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const { config, row, changed } = await saveDraftConfig(SCOPE, req.body?.config ?? req.body);
        const check = validateConfig(config);
        res.json({
            config, changed,
            dirty: !row.published || fingerprintOf(row.published) !== fingerprintOf(config),
            fingerprint: fingerprintOf(config),
            // Guardar NO valida en el sentido de impedir: se guarda un borrador
            // a medias y se dice qué falta. Bloquear el guardado obligaría a
            // dejar la pantalla abierta hasta terminar.
            errors: check.errors,
            warnings: check.warnings,
        });
    } catch (e) {
        console.error('[anniversary/putConfig]', e);
        res.status(500).json({ error: e.message });
    }
};

// ── POST /publish ─────────────────────────────────────────────────────
//
// PUBLICAR EXIGE QUE LA CONFIGURACIÓN SEA VÁLIDA; retirarla no. Es la
// asimetría correcta: poner al aire un generador roto es caro, y retirarlo
// nunca puede quedar bloqueado por una validación.
export const postPublish = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const { config } = await readDraftConfig(SCOPE);
        const check = validateConfig(config);
        if (!check.ok) return res.status(422).json({ error: 'La configuración todavía no se puede publicar.', errors: check.errors });

        const r = await publishConfig(SCOPE, {
            userId: req.user?.id || null,
            userEmail: req.user?.email || null,
            label: req.body?.label || null,
        });
        res.json({
            ok: true,
            version: { id: r.version.id, version: r.version.version, label: r.version.label },
            // Publicar sin haber cambiado nada REUTILIZA la versión vigente, y
            // se dice: dos versiones idénticas con números distintos rompen la
            // pregunta que el versionado existe para responder.
            reused: r.reused,
            warnings: check.warnings,
            publishedAt: r.row.publishedAt,
        });
    } catch (e) {
        console.error('[anniversary/publish]', e);
        res.status(500).json({ error: e.message });
    }
};

// ── POST /unpublish ───────────────────────────────────────────────────
export const postUnpublish = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const row = await unpublishConfig(SCOPE);
        res.json({ ok: true, publishedAt: row.publishedAt });
    } catch (e) {
        console.error('[anniversary/unpublish]', e);
        res.status(500).json({ error: e.message });
    }
};

// ── GET /versions ─────────────────────────────────────────────────────
export const getVersions = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        res.json({ versions: await listVersions(SCOPE, req.query?.limit) });
    } catch (e) {
        console.error('[anniversary/versions]', e);
        res.status(500).json({ error: e.message });
    }
};

// ── POST /versions/:id/restore ────────────────────────────────────────
//
// RESTAURAR NO PUBLICA: devuelve el texto al borrador y quien publica decide.
// Restaurar y publicar de un golpe cambiaría lo que está generando la gente
// con una sola pulsación y sin poder mirarlo antes.
export const postRestoreVersion = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const v = await readVersion(SCOPE, req.params.id);
        if (!v) return res.status(404).json({ error: 'Esa versión no existe.' });
        const { config } = await saveDraftConfig(SCOPE, v.config);
        res.json({ ok: true, config, restoredFrom: v.version });
    } catch (e) {
        console.error('[anniversary/restore]', e);
        res.status(500).json({ error: e.message });
    }
};

// ── GET /clubs ────────────────────────────────────────────────────────
//
// El buscador del panel de pruebas. Sale del MISMO catálogo curado que el
// formulario público (`publicClubs`), no del directorio de sitios: probar con
// una lista distinta de la que va a usar la gente no prueba nada.
export const getClubs = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        res.json({ clubs: searchPublicClubs(req.query?.q || '', req.query?.limit) });
    } catch (e) {
        console.error('[anniversary/clubs]', e);
        res.status(500).json({ error: e.message });
    }
};

// ── GET /pieces ───────────────────────────────────────────────────────
export const getPieces = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        res.json({ pieces: await listPieces(SCOPE, { mode: req.query?.mode || null, limit: req.query?.limit }) });
    } catch (e) {
        console.error('[anniversary/pieces]', e);
        res.status(500).json({ error: e.message });
    }
};

// ════════════════════════════════════════════════════════════════════
// EL PANEL DE PRUEBAS
//
// Corre EXACTAMENTE la misma cadena que el formulario público. Lo único que
// cambia son dos cosas, y las dos importan:
//
//   1. Prueba con el BORRADOR, no con lo publicado. Es lo que permite editar
//      una instrucción y ver en el acto cómo cambia el resultado, que es el
//      requisito 15 del pedido.
//   2. Las piezas quedan marcadas `mode='test'`, así que no se mezclan con las
//      que generó la gente.
//
// Que sea la misma cadena está probado contando llamadas: si el panel de
// pruebas tuviera su propio pipeline, probar dejaría de demostrar algo.
// ════════════════════════════════════════════════════════════════════

export const postTestPhoto = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const { config } = await readDraftConfig(SCOPE);
        const row = await ensureConfigRow(SCOPE);
        const clubName = String(req.body?.clubName || '').trim();
        if (!clubName) return res.status(400).json({ error: 'Elegí un club para la prueba.' });
        const years = normalizeYears(req.body?.years);
        if (!years) return res.status(400).json({ error: `Los años tienen que ser un número entre ${LIMITS.years.min} y ${LIMITS.years.max}.` });

        const foto = await ingestPhoto(req.body?.photo, { prefix: 'anniversaries/test' });
        const catalogo = findPublicClub(clubName);
        const piece = await createPiece({
            configId: row.id, versionId: null, versionNumber: null, mode: 'test',
            clubId: null, subjectClubId: req.body?.subjectClubId || null,
            clubName: printableClubName(clubName, {
                useFullClubName: config.useFullClubName,
                displayName: catalogo?.display || clubDisplayName(clubName),
            }),
            years, photoUrl: foto.url, photoWidth: foto.width, photoHeight: foto.height,
        });
        res.json({ pieceId: piece.id, photoUrl: foto.url, width: foto.width, height: foto.height, warnings: foto.warnings });
    } catch (e) {
        console.error('[anniversary/test/photo]', e);
        res.status(400).json({ error: e.message });
    }
};

export const postTestAnalyze = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    return runAnalyze(req, res, { draft: true });
};
export const postTestCopy = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    return runCopy(req, res, { draft: true });
};
export const postTestCompose = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    return runCompose(req, res, { draft: true });
};
export const getTestPiece = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    return runSync(req, res, { draft: true });
};

// ════════════════════════════════════════════════════════════════════
// LAS CUATRO ETAPAS, COMPARTIDAS
//
// El panel de pruebas y el formulario público llaman a ESTAS funciones. Con
// dos implementaciones, probar una instrucción no diría nada sobre lo que hace
// la gente — y las dos se separarían en silencio.
//
// `draft:true` es lo único que las distingue: con qué configuración corren.
// ════════════════════════════════════════════════════════════════════

const configFor = async (draft) => {
    if (draft) {
        const { config, row } = await readDraftConfig(SCOPE);
        return { config, configId: row.id, versionId: null, versionNumber: null, published: null };
    }
    const pub = await readPublishedConfig(SCOPE);
    return pub
        ? { config: pub.config, configId: pub.configId, versionId: pub.versionId, versionNumber: null, published: pub }
        : null;
};

export const runAnalyze = async (req, res, { draft = false } = {}) => {
    try {
        const ctx = await configFor(draft);
        if (!ctx) return res.status(404).json({ error: 'El generador de aniversarios todavía no está publicado.' });
        const piece = await readPiece(req.body?.pieceId || req.params?.id);
        if (!piece) return res.status(404).json({ error: 'Esa generación no existe.' });

        const analysis = await analyzePhoto({
            photoUrl: piece.photoUrl, width: piece.photoWidth, height: piece.photoHeight,
        });
        const zoneId = textZoneFor(analysis);
        await updatePiece(piece.id, { analysis, zoneId, status: 'analyzed' });
        res.json({
            analysis, zoneId,
            // «No se pudo mirar» se DICE. Presentarlo como un análisis normal
            // haría creer que la composición se adaptó a la fotografía cuando
            // en realidad cayó al criterio por defecto.
            analyzed: analysis.read,
        });
    } catch (e) {
        console.error('[anniversary/analyze]', e);
        res.status(500).json({ error: e.message });
    }
};

export const runCopy = async (req, res, { draft = false } = {}) => {
    try {
        const ctx = await configFor(draft);
        if (!ctx) return res.status(404).json({ error: 'El generador de aniversarios todavía no está publicado.' });
        const piece = await readPiece(req.body?.pieceId || req.params?.id);
        if (!piece) return res.status(404).json({ error: 'Esa generación no existe.' });

        const r = await writeCopy({
            config: ctx.config, clubName: piece.clubName, years: piece.years, analysis: piece.analysis,
        });
        await updatePiece(piece.id, { copy: { ...r.copy, warnings: r.warnings, repaired: r.repaired }, status: 'written' });
        res.json({ copy: r.copy, warnings: r.warnings, repaired: r.repaired });
    } catch (e) {
        console.error('[anniversary/copy]', e);
        res.status(502).json({ error: e.message });
    }
};

export const runCompose = async (req, res, { draft = false } = {}) => {
    try {
        const ctx = await configFor(draft);
        if (!ctx) return res.status(404).json({ error: 'El generador de aniversarios todavía no está publicado.' });
        const piece = await readPiece(req.body?.pieceId || req.params?.id);
        if (!piece) return res.status(404).json({ error: 'Esa generación no existe.' });

        // El reclamo va sobre `attempts`, que es un entero exacto. Sin él, dos
        // pulsaciones seguidas de «regenerar» crean DOS tareas para la misma
        // pieza: dos cobros al proveedor.
        const reclamada = await claimPieceForDispatch(piece.id, piece.attempts);
        if (!reclamada) return res.status(409).json({ error: 'Esta pieza ya se está generando.' });

        try {
            const r = await startComposition({
                config: ctx.config, photoUrl: piece.photoUrl, years: piece.years,
                analysis: piece.analysis,
                // El reintento le dice al modelo el problema CONCRETO, no
                // «hacelo mejor». Sale de la validación anterior.
                extraClause: retryClause(piece.validation?.critical || []),
            });
            await updatePiece(piece.id, {
                taskId: r.taskId, zoneId: r.zoneId,
                versionId: ctx.versionId || null,
            });
            res.json({ taskId: r.taskId, zoneId: r.zoneId, model: r.model, usedReference: r.usedReference, attempt: reclamada.attempts });
        } catch (e) {
            // El error del proveedor se propaga TEXTUAL y la pieza queda en
            // `failed` CON su motivo: un «pendiente» eterno sólo se puede
            // mirar; un error visible se arregla.
            await updatePiece(piece.id, { status: 'failed', statusDetail: e.message });
            throw e;
        }
    } catch (e) {
        console.error('[anniversary/compose]', e);
        res.status(502).json({ error: e.message });
    }
};

export const runSync = async (req, res, { draft = false } = {}) => {
    try {
        const ctx = await configFor(draft);
        if (!ctx) return res.status(404).json({ error: 'El generador de aniversarios todavía no está publicado.' });
        const piece = await readPiece(req.params?.id);
        if (!piece) return res.status(404).json({ error: 'Esa generación no existe.' });

        if (piece.status === 'ready') return res.json(await pieceView(piece, ctx.config));
        if (piece.status === 'failed') return res.json({ ...await pieceView(piece, ctx.config), status: 'failed' });
        if (!piece.taskId) return res.json({ status: piece.status, ready: false });

        const r = await syncComposition(piece.taskId);
        if (r.status === 'pending') return res.json({ status: 'composing', ready: false });
        if (r.status === 'failed') {
            const actualizada = await updatePiece(piece.id, { status: 'failed', statusDetail: r.error });
            return res.json({ ...await pieceView(actualizada, ctx.config), status: 'failed' });
        }

        // ── La verificación ─────────────────────────────────────────
        //
        // Se hace acá y no en un paso aparte porque el buffer de la
        // composición ya está en memoria: pedirlo otra vez sería un viaje de
        // red para volver a tener lo mismo.
        let photoBuffer = null;
        try {
            photoBuffer = Buffer.from(await (await fetch(piece.photoUrl)).arrayBuffer());
        } catch { /* sin la original sólo se pierde el control de personas */ }

        const veredicto = await verifyComposition({
            photoBuffer, composedBuffer: r.buffer, zoneId: piece.zoneId, format: ctx.config.format,
        });

        // ── LA CORRECCIÓN AUTOMÁTICA ────────────────────────────────
        //
        // Requisito 12: «si falla una regla crítica, intentar corregir
        // automáticamente antes de entregar la pieza». Se reintenta UNA vez —
        // no en bucle: cada vuelta cuesta créditos y un modelo que falló dos
        // veces por lo mismo no va a acertar a la tercera.
        const MAX_INTENTOS = 2;
        if (!veredicto.ok && piece.attempts < MAX_INTENTOS) {
            await updatePiece(piece.id, { validation: veredicto, backdropUrl: r.url, status: 'composing' });
            const reintentar = await claimPieceForDispatch(piece.id, piece.attempts);
            if (reintentar) {
                try {
                    const otra = await startComposition({
                        config: ctx.config, photoUrl: piece.photoUrl, years: piece.years,
                        analysis: piece.analysis, extraClause: retryClause(veredicto.critical),
                    });
                    await updatePiece(piece.id, { taskId: otra.taskId, zoneId: otra.zoneId });
                    return res.json({ status: 'composing', ready: false, retrying: true, reason: veredicto.critical[0]?.reason || null });
                } catch (e) {
                    // Que el reintento no se pueda lanzar no puede dejar la
                    // pieza sin entregar: se sigue al desenlace de abajo.
                    console.warn('[anniversary] no se pudo reintentar:', e.message);
                }
            }
        }

        // ── EL DESENLACE ────────────────────────────────────────────
        //
        // Agotados los intentos, la pieza SE ENTREGA IGUAL — pero el modo dice
        // la verdad:
        //
        //   `ai`    → la composición se usa.
        //   `plain` → la composición NO se usa y la pieza se compone con la
        //             fotografía intacta sobre fondo blanco.
        //
        // `plain` NO es un segundo sistema de diseño: es el MISMO compositor
        // con la capa 1 vacía. Y NO se retoca la imagen del modelo para
        // corregirla: pegarle la fotografía original encima es el composite
        // que el equipo rechazó dos veces con las palabras «se ve overlay /
        // montaje». Este control mide y decide; no retoca el archivo.
        const usable = veredicto.ok;
        const actualizada = await updatePiece(piece.id, {
            backdropUrl: r.url,
            renderMode: usable ? 'ai' : 'plain',
            status: 'ready',
            statusDetail: usable ? null : (veredicto.critical[0]?.reason || null),
            validation: veredicto,
        });
        res.json(await pieceView(actualizada, ctx.config));
    } catch (e) {
        console.error('[anniversary/sync]', e);
        res.status(500).json({ error: e.message });
    }
};

/**
 * Todo lo que el compositor del navegador necesita para dibujar la pieza. Es
 * un DOCUMENTO, no una imagen: la vista previa y la descarga se componen con
 * él, y son la misma cosa porque hay un solo compositor.
 */
export const pieceView = async (piece, config) => {
    const branding = piece.branding || await resolveBranding({
        config, subjectClubId: piece.subjectClubId, clubName: piece.clubName,
    });
    if (!piece.branding) await updatePiece(piece.id, { branding });

    const size = canvasSize(config.format, config.resolution);
    return {
        status: piece.status,
        ready: piece.status === 'ready',
        pieceId: piece.id,
        document: {
            format: config.format,
            width: size.width, height: size.height,
            renderMode: piece.renderMode || 'plain',
            backdropUrl: piece.renderMode === 'ai' ? piece.backdropUrl : null,
            photoUrl: piece.photoUrl,
            zoneId: piece.zoneId || 'bottom',
            clubName: piece.clubName,
            years: piece.years,
            title: piece.copy?.title || '',
            message: piece.copy?.message || '',
            branding,
        },
        validation: piece.validation || null,
        statusDetail: piece.statusDetail || null,
        copyWarnings: piece.copy?.warnings || [],
        copyRepaired: piece.copy?.repaired || [],
        attempts: piece.attempts,
    };
};

export default {
    getCatalog, getConfig, putConfig, postPublish, postUnpublish,
    getVersions, postRestoreVersion, getClubs, getPieces,
    postTestPhoto, postTestAnalyze, postTestCopy, postTestCompose, getTestPiece,
    runAnalyze, runCopy, runCompose, runSync, pieceView,
};
