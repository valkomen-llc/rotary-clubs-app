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
    DEFAULT_MESSAGE_INSTRUCTION, DEFAULT_RESTRICTIONS,
    DEFAULT_MASTER_PROMPT, MASTER_VARIABLES, FOOTER_BAND,
    normalizeYears, printableClubName, textZoneFor, zoneForConfig, canvasSize,
} from '../lib/anniversarySpec.js';
import {
    ingestPhoto, analyzePhoto, startComposition, syncComposition,
    verifyComposition, resolveBranding, COMPOSE_MODEL,
} from '../lib/anniversaryEngine.js';
import {
    catalogFor, modelById, eligibility, resolveProduction, shouldFallback, PROVIDERS, providerOf,
    engineStampFor, DEFAULT_WEIGHTS, CRITERIA, normalizeWeights, autoScoresFor,
    applyVote, totalScore, recommendModel, BENCH_PHOTO_HINTS,
    MAX_BENCH_PHOTOS, MAX_BENCH_MODELS, VOTE_SCORE, ENGINE_PROVIDER,
} from '../lib/anniversaryEngineSpec.js';
import {
    readEngineConfig, saveEngineConfig,
    createBenchmark, readBenchmark, listBenchmarks, finishBenchmark,
    createBenchResult, listBenchResults, closeBenchResult, updateBenchResult,
} from '../lib/anniversaryModels.js';
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
                masterPrompt: DEFAULT_MASTER_PROMPT,
                messageInstruction: DEFAULT_MESSAGE_INSTRUCTION,
                restrictions: DEFAULT_RESTRICTIONS,
            },
            // Lo que el Prompt Maestro puede nombrar y lo que el ensamblador
            // reserva: la pantalla lo DICE en vez de que se descubra probando.
            masterVariables: MASTER_VARIABLES,
            footerReserve: FOOTER_BAND,
            // Que el modelo esté configurado NO es un detalle interno: sin la
            // credencial este módulo no genera nada, y el panel tiene que
            // decirlo antes de que alguien publique y descubra el hueco. La
            // credencial es LA DEL PROVEEDOR DEL MODELO ACTIVO (v4.900): con
            // GPT Image activado, avisar por KIE_API_KEY mandaría a cargar la
            // credencial equivocada.
            engine: await (async () => {
                const { engine } = await readEngineConfig(SCOPE).catch(() => ({ engine: {} }));
                const prod = resolveProduction(engine || {});
                const proveedor = providerOf(modelById(prod.primary, engine || {}));
                return {
                    model: prod.primary,
                    configured: !!process.env[proveedor.envKey],
                    envKey: proveedor.envKey,
                };
            })(),
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
        const entrante = req.body?.config ?? req.body ?? {};
        // FLUJO SIMPLE (v4.907): la referencia ya NO se analiza a palabras —
        // viaja al modelo COMO IMAGEN, que es como el cliente la usa en su
        // ejemplo de ChatGPT. Convertirla a una descripción intermedia era una
        // de las capas que alejaban el resultado de la referencia.
        const { config, row, changed } = await saveDraftConfig(SCOPE, entrante);
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

        // FLUJO SIMPLE (v4.907): ya no hay análisis de visión — la instrucción
        // base viaja verbatim y el modelo mira las imágenes él mismo. El
        // endpoint se CONSERVA como paso barato porque un navegador con el
        // bundle anterior todavía lo llama (regla aditiva).
        const zoneId = zoneForConfig(ctx.config, null);
        await updatePiece(piece.id, { zoneId, status: 'analyzed' });
        res.json({ zoneId, analyzed: false });
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

        // FLUJO SIMPLE (v4.907): el texto lo dibuja el MODELO dentro de la
        // pieza, como en el ejemplo de ChatGPT del cliente — no hay redactor
        // aparte. El endpoint se conserva como paso barato para el bundle
        // anterior (regla aditiva).
        await updatePiece(piece.id, { status: 'written' });
        res.json({ copy: null, warnings: [], repaired: [] });
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

        // El modelo lo decide la configuración del MOTOR (catálogo →
        // activación → default), no un literal: es lo que permite cambiarlo
        // desde el panel sin tocar este flujo (req. 25).
        const { engine } = await readEngineConfig(SCOPE);
        const prod = resolveProduction(engine);

        const despachar = async (modelo, fallbackUsed) => {
            const r = await startComposition({
                config: ctx.config, photoUrl: piece.photoUrl,
                clubName: piece.clubName, years: piece.years,
                // {VARIACION} determinista por pieza (v4.909): el reintento
                // conserva su variación; dos piezas distintas varían.
                seed: piece.id,
                model: modelo, engineConfig: engine,
            });
            await updatePiece(piece.id, {
                taskId: r.taskId, zoneId: r.zoneId,
                versionId: ctx.versionId || null,
                // «Ver solicitud enviada al modelo» (v4.907): EXACTAMENTE lo
                // que viajó — el prompt final, las dos imágenes, el modelo, el
                // proveedor, el endpoint y el tamaño. Es lo que permite
                // comprobar que le mandamos al modelo lo que creemos.
                request: {
                    prompt: r.prompt, model: r.model, provider: r.provider,
                    endpoint: r.endpoint, size: r.size,
                    referenceUrl: r.referenceUrl, photoUrl: piece.photoUrl,
                },
                // El sello de auditoría (req. 21): con qué se generó ESTA
                // pieza. `dispatchedAt` es de donde sale la latencia medida.
                engine: { ...engineStampFor({ model: modelo, engineConfig: engine, fallbackUsed }), dispatchedAt: new Date().toISOString() },
            });
            return r;
        };

        try {
            const r = await despachar(prod.primary, false);
            res.json({ taskId: r.taskId, zoneId: r.zoneId, model: r.model, usedReference: r.usedReference, attempt: reclamada.attempts });
        } catch (e) {
            // ── EL FALLBACK, Y CUÁNDO NO ────────────────────────────
            //
            // Sólo un fallo de INFRAESTRUCTURA (timeout, 5xx, límite, modelo
            // retirado) prueba el respaldo. Un fallo de otra clase no mejora
            // cambiando de modelo y gastaría créditos dobles. Lo estético ni
            // llega acá: eso es la validación de calidad, más abajo.
            if (prod.fallback && shouldFallback(e.message)) {
                try {
                    const r = await despachar(prod.fallback, true);
                    console.warn(`[anniversary] el primario (${prod.primary}) falló y respondió el fallback (${prod.fallback}): ${e.message}`);
                    return res.json({ taskId: r.taskId, zoneId: r.zoneId, model: r.model, usedReference: r.usedReference, attempt: reclamada.attempts, fallbackUsed: true });
                } catch (e2) {
                    // Agotada la cadena, se propaga el motivo de CADA modelo:
                    // con un mensaje único no se distingue cuál murió de qué
                    // (regla de v4.892).
                    const ambos = `El modelo principal (${prod.primary}) falló: ${e.message}. El de respaldo (${prod.fallback}) también: ${e2.message}`;
                    await updatePiece(piece.id, { status: 'failed', statusDetail: ambos });
                    return res.status(502).json({ error: ambos });
                }
            }
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
            // ── Fallo DEL PROVEEDOR a mitad de generación ───────────
            //
            // Si es de infraestructura y hay respaldo sin usar, se redespacha
            // UNA vez con él (req. 8: «fallo de generación» también dispara
            // el fallback). `fallbackUsed` en el sello es lo que impide el
            // bucle; y un fallo de otra clase no cambia de modelo.
            const stamp = piece.engine || {};
            if (shouldFallback(r.error) && !stamp.fallbackUsed) {
                const { engine } = await readEngineConfig(SCOPE);
                const prod = resolveProduction(engine);
                if (prod.fallback && prod.fallback !== stamp.model) {
                    const reclamo = await claimPieceForDispatch(piece.id, piece.attempts);
                    if (reclamo) {
                        try {
                            const otra = await startComposition({
                                config: ctx.config, photoUrl: piece.photoUrl,
                                clubName: piece.clubName, years: piece.years,
                                seed: piece.id,
                                model: prod.fallback, engineConfig: engine,
                            });
                            await updatePiece(piece.id, {
                                taskId: otra.taskId, zoneId: otra.zoneId,
                                request: {
                                    prompt: otra.prompt, model: otra.model, provider: otra.provider,
                                    endpoint: otra.endpoint, size: otra.size,
                                    referenceUrl: otra.referenceUrl, photoUrl: piece.photoUrl,
                                },
                                engine: { ...engineStampFor({ model: prod.fallback, engineConfig: engine, fallbackUsed: true }), dispatchedAt: new Date().toISOString() },
                            });
                            return res.json({ status: 'composing', ready: false, retrying: true, fallbackUsed: true, reason: `El modelo principal falló (${r.error}); se está generando con el de respaldo.` });
                        } catch (e2) {
                            console.warn('[anniversary] el fallback tampoco pudo despachar:', e2.message);
                        }
                    }
                }
            }
            const actualizada = await updatePiece(piece.id, { status: 'failed', statusDetail: r.error });
            return res.json({ ...await pieceView(actualizada, ctx.config), status: 'failed' });
        }

        // La latencia MEDIDA de esta generación, para el registro de costo y
        // uso (req. 17): desde el despacho hasta que la imagen estuvo.
        if (piece.engine?.dispatchedAt) {
            const latencyMs = Date.now() - Date.parse(piece.engine.dispatchedAt);
            if (Number.isFinite(latencyMs) && latencyMs >= 0) {
                piece.engine.latencyMs = latencyMs;
                await updatePiece(piece.id, { engine: piece.engine });
            }
        }

        // ── EL DESENLACE (v4.907): SIN PUERTAS, SIN REINTENTO ───────
        //
        // Flujo simple, por decisión expresa del cliente: lo que el modelo
        // devuelve SE ENTREGA y quien genera lo mira — el mismo contrato que
        // su ejemplo de ChatGPT. Las puertas automáticas de v4.899-v4.906
        // (fondo, franja, texto dibujado, preservación) descartaban piezas
        // legítimas y gastaban generaciones dobles; el juicio ahora es del
        // ojo de quien genera, y la salida es «Volver a probar». La imagen
        // del modelo no se retoca jamás (regla #1 del sitio).
        const actualizada = await updatePiece(piece.id, {
            backdropUrl: r.url,
            renderMode: 'ai',
            status: 'ready',
            statusDetail: null,
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
            // FLUJO SIMPLE (v4.907): en modo `ai` la pieza ES la imagen del
            // modelo — el texto viene dibujado dentro, como en el ejemplo de
            // ChatGPT del cliente — y la plataforma sólo imprime el pie
            // institucional. El compositor lee `simple` y NO imprime la capa
            // de texto encima; `plain` (el respaldo sin composición) conserva
            // la estructura de texto propia, porque ahí no hay imagen que la
            // traiga.
            simple: piece.renderMode === 'ai',
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
        // «Ver solicitud enviada al modelo» (v4.907): exactamente lo que viajó.
        request: piece.request || null,
    };
};


// ════════════════════════════════════════════════════════════════════
// EL MOTOR DE IMAGEN Y SU BENCHMARK (v4.897)
//
// La cadena completa: catálogo declarado → elegibilidad → benchmark con
// evidencia → recomendado → ACTIVACIÓN EXPLÍCITA → producción → fallback.
// Nada de esto llega al formulario público: el visitante sigue viendo club,
// años, fotografía y un botón (req. 24).
// ════════════════════════════════════════════════════════════════════

/** Todo lo que la tarjeta «Motor de imagen» necesita para pintarse. */
export const getEngine = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const { engine } = await readEngineConfig(SCOPE);
        const prod = resolveProduction(engine);
        const catalogo = catalogFor(engine).map(m => ({
            ...m,
            eligibility: eligibility(m),
        }));
        const runs = await listBenchmarks(null, 5).catch(() => []);
        res.json({
            provider: ENGINE_PROVIDER,
            providers: Object.values(PROVIDERS).map(pv => ({
                ...pv, configured: !!process.env[pv.envKey],
            })),
            engine,
            production: prod,
            catalog: catalogo,
            criteria: CRITERIA,
            defaultWeights: DEFAULT_WEIGHTS,
            photoHints: BENCH_PHOTO_HINTS,
            limits: { maxPhotos: MAX_BENCH_PHOTOS, maxModels: MAX_BENCH_MODELS },
            benchmarks: runs,
            // El entorno forzando el modelo se DICE: sin esto, el panel
            // cambiaría el activo y nada se movería, en silencio.
            envOverride: process.env.ANNIVERSARY_MODEL || null,
        });
    } catch (e) {
        console.error('[anniversary/engine]', e);
        res.status(500).json({ error: e.message });
    }
};

/** Guarda la configuración técnica. Un modelo manual NO elegible se rechaza
 *  con sus motivos: activar un motor que no puede respetar la fotografía es
 *  exactamente lo que la elegibilidad existe para impedir. */
export const putEngine = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const body = req.body?.engine ?? req.body ?? {};
        if (body.active) {
            const m = modelById(body.active, body);
            const eleg = m ? eligibility(m) : { eligible: false, errors: ['El modelo no está en el catálogo ni entre los candidatos.'] };
            if (!eleg.eligible) return res.status(422).json({ error: 'Ese modelo no es elegible para Aniversarios IA.', errors: eleg.errors });
        }
        const { engine } = await saveEngineConfig(SCOPE, body);
        res.json({ engine, production: resolveProduction(engine) });
    } catch (e) {
        console.error('[anniversary/engine:put]', e);
        res.status(500).json({ error: e.message });
    }
};

/** La ACTIVACIÓN: el único camino por el que un modelo entra a producción
 *  desde un benchmark. Un benchmark recomienda; una persona activa. Nunca es
 *  automático (req. 20). */
export const postEngineActivate = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const model = String(req.body?.model || '');
        const { engine } = await readEngineConfig(SCOPE);
        const m = modelById(model, engine);
        const eleg = m ? eligibility(m) : { eligible: false, errors: ['El modelo no está en el catálogo ni entre los candidatos.'] };
        if (!eleg.eligible) return res.status(422).json({ error: 'Ese modelo no es elegible.', errors: eleg.errors });

        const fallback = req.body?.fallback && String(req.body.fallback) !== model ? String(req.body.fallback) : engine.fallback;
        const { engine: guardado } = await saveEngineConfig(SCOPE, {
            ...engine, active: model, fallback,
            activatedFrom: {
                benchmarkId: req.body?.benchmarkId || null,
                at: new Date().toISOString(),
                by: req.user?.email || req.user?.id || null,
            },
        });
        res.json({ engine: guardado, production: resolveProduction(guardado), warnings: eleg.warnings });
    } catch (e) {
        console.error('[anniversary/engine:activate]', e);
        res.status(500).json({ error: e.message });
    }
};

// ── El benchmark ──────────────────────────────────────────────────────
//
// Corre por la MISMA cadena que producción: mismo `startComposition`, mismo
// prompt (el del BORRADOR: es una herramienta de prueba), mismas mediciones
// de la validación. Un benchmark con su propio pipeline no compararía nada.

export const postBenchmarkRun = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const { config } = await readDraftConfig(SCOPE);
        const row = await ensureConfigRow(SCOPE);
        const { engine } = await readEngineConfig(SCOPE);

        // Los candidatos: elegibles y sin repetir, acotados.
        const pedidos = [...new Set((Array.isArray(req.body?.models) ? req.body.models : []).map(String))].slice(0, MAX_BENCH_MODELS);
        const modelos = pedidos.filter(id => {
            const m = modelById(id, engine);
            return m && eligibility(m).eligible;
        });
        if (modelos.length < 2) return res.status(400).json({ error: 'Elegí al menos dos modelos elegibles: un benchmark de uno solo no compara nada.' });

        const fotosRaw = (Array.isArray(req.body?.photos) ? req.body.photos : []).slice(0, MAX_BENCH_PHOTOS);
        if (!fotosRaw.length) return res.status(400).json({ error: 'Subí al menos una fotografía de prueba. Lo representativo son varias: grupo, vertical, oscura…' });

        // Cada fotografía se ingiere UNA vez y se analiza UNA vez: el análisis
        // compartido es lo que hace que todos los modelos reciban exactamente
        // el mismo prompt (req. 5, «el mismo prompt y configuración»).
        const photos = [];
        for (const [i, dataUrl] of fotosRaw.entries()) {
            const foto = await ingestPhoto(dataUrl, { prefix: 'anniversaries/bench' });
            const analysis = await analyzePhoto({ photoUrl: foto.url, width: foto.width, height: foto.height });
            photos.push({ url: foto.url, width: foto.width, height: foto.height, label: String(req.body?.labels?.[i] || '').slice(0, 60), analysis });
        }

        const run = await createBenchmark({
            configId: row.id, models: modelos, photos,
            weights: req.body?.weights || null,
            createdBy: req.user?.email || null,
        });

        // Una tarea por celda (modelo × fotografía). Un fallo al CREAR la
        // tarea es un dato del benchmark —estabilidad—, no un motivo para
        // tirar la corrida entera.
        let despachadas = 0;
        for (const model of modelos) {
            for (const [photoIndex, photo] of photos.entries()) {
                try {
                    const r = await startComposition({
                        // Un nombre FIJO para todos los modelos: lo que se
                        // compara es el motor, no el dato, y con nombres
                        // distintos los prompts dejarían de ser comparables.
                        config, photoUrl: photo.url, clubName: 'Club Rotario Cali', years: 40,
                        analysis: photo.analysis, model, engineConfig: engine,
                        // La semilla es POR FOTOGRAFÍA, no por celda: cada
                        // modelo tiene que recibir el mismo juego de prompts
                        // (regla del benchmark) — el motivo decorativo incluido.
                        seed: `bench:${run.id}:${photoIndex}`,
                    });
                    await createBenchResult({ benchmarkId: run.id, model, photoIndex, taskId: r.taskId });
                    despachadas++;
                } catch (e) {
                    await createBenchResult({ benchmarkId: run.id, model, photoIndex, status: 'failed', error: e.message });
                }
            }
        }
        if (!despachadas) await finishBenchmark(run.id, 'failed');
        res.json({ benchmarkId: run.id, models: modelos, photos: photos.length, dispatched: despachadas });
    } catch (e) {
        console.error('[anniversary/benchmark:run]', e);
        res.status(502).json({ error: e.message });
    }
};

/** El sondeo del benchmark: avanza lo pendiente CON PRESUPUESTO —la función
 *  corta a los 120 s y una corrida de 4×8 celdas no entra en una pasada; lo
 *  que no entra espera al siguiente sondeo, no se pierde— y devuelve la foto
 *  completa: resultados, notas y recomendado DERIVADO (no guardado: una
 *  segunda verdad sobre los mismos resultados se contradiría al votar). */
export const getBenchmarkRun = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const run = await readBenchmark(req.params.id);
        if (!run) return res.status(404).json({ error: 'Ese benchmark no existe.' });
        const { engine } = await readEngineConfig(SCOPE);
        // La zona fijada sale de la MISMA configuración con la que corre el
        // benchmark (el borrador): con otra, las celdas se medirían sobre una
        // franja que el prompt no reservó.
        const { config } = await readDraftConfig(SCOPE);

        let results = await listBenchResults(run.id);
        const pendientes = results.filter(r => r.status === 'pending' && r.taskId);
        const PRESUPUESTO = 4;
        const minCredits = Math.min(...(run.models || []).map(id => modelById(id, engine)?.creditsEstimated ?? 5));

        for (const r of pendientes.slice(0, PRESUPUESTO)) {
            try {
                const estado = await syncComposition(r.taskId);
                if (estado.status === 'pending') continue;
                if (estado.status === 'failed') {
                    await closeBenchResult(r.id, { status: 'failed', error: estado.error });
                    continue;
                }
                // Listo: se mide con LA MISMA validación de producción.
                const photo = (run.photos || [])[r.photoIndex] || {};
                let photoBuffer = null;
                try { photoBuffer = Buffer.from(await (await fetch(photo.url)).arrayBuffer()); } catch { /* sin original se pierde sólo el control de personas */ }
                const veredicto = await verifyComposition({
                    photoBuffer, composedBuffer: estado.buffer,
                    zoneId: zoneForConfig(config, photo.analysis), format: 'square_1080',
                    composedUrl: estado.url || null,
                });
                const latencyMs = r.dispatchedAt ? Math.max(0, Date.now() - new Date(r.dispatchedAt).getTime()) : null;
                const scores = autoScoresFor({
                    measurements: veredicto.measurements,
                    preservation: veredicto.preservation,
                    latencyMs,
                    credits: modelById(r.model, engine)?.creditsEstimated ?? null,
                    minCredits,
                });
                await closeBenchResult(r.id, {
                    status: 'ready', imageUrl: estado.url, latencyMs,
                    auto: { scores, measurements: veredicto.measurements, preservation: veredicto.preservation, critical: veredicto.critical },
                });
            } catch (e) {
                console.warn('[anniversary/benchmark] sondeo de una celda:', e.message);
            }
        }

        results = await listBenchResults(run.id);
        const terminado = results.length > 0 && results.every(r => r.status !== 'pending');
        if (terminado && run.status === 'running') await finishBenchmark(run.id, 'done');

        const weights = normalizeWeights(run.weights);
        const vista = results.map(r => ({
            id: r.id, model: r.model, photoIndex: r.photoIndex, status: r.status,
            imageUrl: r.imageUrl, latencyMs: r.latencyMs, error: r.error, vote: r.vote,
            scores: r.auto?.scores || null,
            total: r.auto?.scores ? totalScore(applyVote(r.auto.scores, r.vote), weights) : null,
        }));
        res.json({
            id: run.id,
            status: terminado ? 'done' : run.status,
            models: run.models, photos: (run.photos || []).map(p => ({ url: p.url, label: p.label })),
            weights,
            results: vista,
            recommendation: recommendModel(vista.map(v => ({ model: v.model, status: v.status, scores: v.scores, vote: v.vote, latencyMs: v.latencyMs })), weights, engine),
            pending: results.filter(r => r.status === 'pending').length,
        });
    } catch (e) {
        console.error('[anniversary/benchmark:get]', e);
        res.status(500).json({ error: e.message });
    }
};

/** El voto humano: 👍 👎 ⭐. Complementa el score automático — cubre lo que la
 *  máquina no puede mirar (integración, composición). */
export const postBenchmarkVote = async (req, res) => {
    if (!esOperador(req)) return negar(res);
    try {
        const vote = String(req.body?.vote || '');
        if (!(vote in VOTE_SCORE) && vote !== '') return res.status(400).json({ error: 'El voto es up, down, star o vacío para retirarlo.' });
        const r = await updateBenchResult(String(req.body?.resultId || ''), { vote: vote || null });
        if (!r) return res.status(404).json({ error: 'Ese resultado no existe.' });
        res.json({ ok: true, vote: r.vote });
    } catch (e) {
        console.error('[anniversary/benchmark:vote]', e);
        res.status(500).json({ error: e.message });
    }
};

export default {
    getCatalog, getConfig, putConfig, postPublish, postUnpublish,
    getVersions, postRestoreVersion, getClubs, getPieces,
    postTestPhoto, postTestAnalyze, postTestCopy, postTestCompose, getTestPiece,
    runAnalyze, runCopy, runCompose, runSync, pieceView,
    getEngine, putEngine, postEngineActivate,
    postBenchmarkRun, getBenchmarkRun, postBenchmarkVote,
};
