// ════════════════════════════════════════════════════════════════════
// Director Creativo IA — perfiles y referencias
// v4.838.0
//
// Subir las piezas de referencia, analizarlas y guardar el Design DNA que sale
// de ahí. Es la pantalla que el pedido describe: «que podamos subir las
// imágenes de referencia para que realice las imágenes siguiendo los patrones
// principales».
//
// El CRITERIO —qué se mide, qué se describe, cómo se consolida y cómo se
// aplica— vive en `creativeDNA.js`, que es puro. Acá sólo hay orquestación:
// permisos, base de datos y el disparo del análisis.
//
// ── EL VERSIONADO NO ES OPCIONAL ────────────────────────────────────
//
// Volver a analizar NUNCA reescribe el perfil: inserta una versión nueva y baja
// la bandera de la anterior. Dos motivos y los dos son del pedido: cambiar las
// referencias no puede sobrescribir un estilo en silencio, y una campaña ya
// generada no puede cambiar de aspecto porque alguien tocó una foto de
// referencia. Mismo patrón que `ReelCopy`.
// ════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { ensureCreativeSchema } from '../lib/ensureCreativeSchema.js';
import { analyzeReferences } from '../lib/creativeAnalysis.js';
import { consolidate, DNA_VERSION } from '../lib/creativeDNA.js';

const isOperator = (req) => req.user?.role === 'administrator';
const str = (v, max) => String(v ?? '').trim().slice(0, max);

/** Cuántas referencias tiene sentido analizar. Por debajo de dos, la
 *  consolidación por moda no consolida nada —una sola referencia es su propia
 *  moda— y el perfil describe una pieza, no un estilo. Por encima de ocho, cada
 *  una cuesta una llamada de visión y la moda ya no se mueve. */
export const REFERENCE_RANGE = { min: 2, max: 8 };

/**
 * El alcance. Un administrador de sitio ve y edita LOS SUYOS y los de la
 * plataforma (`clubId IS NULL`), que son el estilo de la casa; el operador ve
 * todo. Va en el WHERE, no en la pantalla: es el mismo patrón que
 * `buildFilters` en Postulaciones y `ownedMedia` en la Librería.
 */
const scopeOf = (req) => (isOperator(req) ? null : req.user?.clubId || null);

const perfilesVisibles = async (req) => {
    const club = scopeOf(req);
    const { rows } = await db.query(
        club
            ? `SELECT * FROM "CreativeProfile" WHERE "isCurrent" AND ("clubId" = $1 OR "clubId" IS NULL) ORDER BY active DESC, "updatedAt" DESC`
            : `SELECT * FROM "CreativeProfile" WHERE "isCurrent" ORDER BY active DESC, "updatedAt" DESC`,
        club ? [club] : []
    );
    return rows;
};

/** Un perfil concreto, ya acotado. Devuelve `null` para uno ajeno: para quien
 *  pregunta no existe, que además no revela que exista. */
const perfilVisible = async (req, id) => {
    const todos = await perfilesVisibles(req);
    return todos.find(p => p.id === id) || null;
};

const conReferencias = async (perfil) => {
    if (!perfil) return null;
    const { rows } = await db.query(
        `SELECT id, url, "mediaId", label, measured, described, notes, "sortOrder"
           FROM "CreativeReference" WHERE "profileId" = $1 ORDER BY "sortOrder", "createdAt"`,
        [perfil.id]
    );
    return { ...perfil, references: rows };
};

// ─── Listar ────────────────────────────────────────────────────────────

export const listCreativeProfiles = async (req, res) => {
    try {
        await ensureCreativeSchema();
        const perfiles = await perfilesVisibles(req);
        // El listado NO trae las referencias: son varias filas por perfil con
        // sus mediciones dentro, y la pantalla sólo necesita el nombre y el
        // resumen para elegir.
        res.json({
            profiles: perfiles.map(p => ({
                id: p.id, name: p.name, version: p.version, active: p.active,
                clubId: p.clubId, dna: p.dna, notes: p.notes,
                analyzedAt: p.analyzedAt, updatedAt: p.updatedAt,
                shared: p.clubId === null,
            })),
            limits: REFERENCE_RANGE,
        });
    } catch (e) {
        console.error('[creative] listar:', e);
        res.status(500).json({ error: e.message });
    }
};

export const getCreativeProfile = async (req, res) => {
    try {
        await ensureCreativeSchema();
        const perfil = await conReferencias(await perfilVisible(req, req.params.id));
        if (!perfil) return res.status(404).json({ error: 'Ese estilo no existe o no es de este sitio.' });
        res.json({ profile: perfil });
    } catch (e) {
        console.error('[creative] ficha:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Crear y guardar referencias ───────────────────────────────────────

/**
 * Crea el perfil o reemplaza sus referencias.
 *
 * Las imágenes YA están subidas: llegan como direcciones de la Biblioteca
 * Multimedia. No se sube nada desde acá a propósito — `uploadMediaFiles` es el
 * único camino hacia S3 desde v4.784, y un segundo camino se separa en
 * silencio (es el problema que `sendCampaign` arrastra en el CRM).
 */
export const saveCreativeProfile = async (req, res) => {
    try {
        await ensureCreativeSchema();
        const club = scopeOf(req);
        const name = str(req.body?.name, 80) || 'Estilo sin nombre';
        const refs = (Array.isArray(req.body?.references) ? req.body.references : [])
            .map(r => ({ url: str(r?.url, 600), mediaId: str(r?.mediaId, 60) || null, label: str(r?.label, 80) || null }))
            // Sólo https: estas direcciones se descargan en el servidor y
            // terminan en un `<img>` del panel. Mismo criterio que
            // `isFetchableUrl` en la lectura del panorama.
            .filter(r => /^https:\/\//i.test(r.url))
            .slice(0, REFERENCE_RANGE.max);

        if (refs.length < REFERENCE_RANGE.min) {
            return res.status(422).json({
                error: `Hacen falta al menos ${REFERENCE_RANGE.min} piezas de referencia.`,
                // El motivo, no sólo el número: con una sola pieza el perfil
                // describiría ESA pieza, no un estilo.
                reason: 'Con una sola pieza no se puede distinguir lo que es del estilo de lo que es de esa pieza en particular.',
            });
        }

        const id = req.body?.id ? str(req.body.id, 60) : null;
        let base = null;
        if (id) {
            base = await perfilVisible(req, id);
            if (!base) return res.status(404).json({ error: 'Ese estilo no existe o no es de este sitio.' });
            // Un administrador de sitio no reescribe un perfil DE LA
            // PLATAFORMA: lo puede usar, no cambiarlo. Sin esta comprobación,
            // cualquier sitio editaría el estilo de la casa para todos.
            if (base.clubId === null && club !== null) {
                return res.status(403).json({ error: 'Ese estilo es de la plataforma: se puede usar, pero lo edita el operador.' });
            }
        }

        // ── El análisis ──────────────────────────────────────────
        const analisis = await analyzeReferences(refs.map(r => r.url));
        const dna = consolidate(analisis);
        const notas = analisis.flatMap((a, i) => a.notes.map(n => `Referencia ${i + 1}: ${n}`));
        if (!dna) {
            return res.status(422).json({
                error: 'No se pudo leer ninguna de las piezas de referencia.',
                notes: notas,
            });
        }
        if (!dna.described) {
            notas.push('No hubo modelo de visión: el estilo se armó con la paleta y las coberturas, que son la mitad que no depende de un proveedor externo. Sin él no hay contexto narrado ni prompt de estilo completo.');
        }
        // Lo que el propio criterio tuvo que decidir —un referente de fondo
        // claro, un color demasiado claro para llevar texto blanco— se dice con
        // el resto. Sin esto, el usuario ve un fondo que no es el de sus piezas
        // y no tiene dónde enterarse de por qué.
        notas.push(...(dna.derived?.notes || []));

        // ── La versión nueva ─────────────────────────────────────
        //
        // Se baja la bandera ANTES de insertar, porque el índice único parcial
        // (`WHERE "isCurrent"`) no admite dos vigentes con el mismo nombre.
        const version = base ? (base.version || 1) + 1 : 1;
        const dueño = base ? base.clubId : club;
        await db.query(
            `UPDATE "CreativeProfile" SET "isCurrent" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
              WHERE "isCurrent" AND "clubId" IS NOT DISTINCT FROM $1 AND name = $2`,
            [dueño, name]
        );
        const { rows: [creado] } = await db.query(
            `INSERT INTO "CreativeProfile"
                ("clubId", name, version, "isCurrent", dna, notes, active, "analyzedAt", "createdBy")
             VALUES ($1, $2, $3, TRUE, $4::jsonb, $5::jsonb, $6, CURRENT_TIMESTAMP, $7)
             RETURNING *`,
            [dueño, name, version, JSON.stringify(dna), JSON.stringify(notas),
             base ? base.active : false, req.user?.email || null]
        );

        // Las referencias cuelgan de la VERSIÓN, no del nombre: es lo que
        // permite mirar con qué piezas se hizo cada versión.
        for (let i = 0; i < refs.length; i++) {
            const a = analisis[i] || {};
            await db.query(
                `INSERT INTO "CreativeReference" ("profileId", url, "mediaId", label, measured, described, notes, "sortOrder")
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)`,
                [creado.id, refs[i].url, refs[i].mediaId, refs[i].label,
                 a.measured ? JSON.stringify(a.measured) : null,
                 a.described ? JSON.stringify(a.described) : null,
                 JSON.stringify(a.notes || []), i]
            );
        }

        res.json({ profile: await conReferencias(creado), notes: notas, dnaVersion: DNA_VERSION });
    } catch (e) {
        console.error('[creative] guardar:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Activar ───────────────────────────────────────────────────────────

/** Cuál se usa cuando no se elige ninguno. Uno por sitio: dos activos serían
 *  una contradicción y la pantalla tendría que resolverla adivinando. */
export const activateCreativeProfile = async (req, res) => {
    try {
        await ensureCreativeSchema();
        const perfil = await perfilVisible(req, req.params.id);
        if (!perfil) return res.status(404).json({ error: 'Ese estilo no existe o no es de este sitio.' });
        const club = scopeOf(req);
        // Se apaga dentro del ALCANCE de quien pide, no del dueño del perfil:
        // un sitio que activa el estilo de la plataforma apaga el suyo, no el
        // de los demás sitios.
        await db.query(
            club ? `UPDATE "CreativeProfile" SET active = FALSE WHERE "clubId" = $1` : `UPDATE "CreativeProfile" SET active = FALSE WHERE "clubId" IS NULL`,
            club ? [club] : []
        );
        await db.query(`UPDATE "CreativeProfile" SET active = TRUE, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`, [perfil.id]);
        res.json({ ok: true, id: perfil.id });
    } catch (e) {
        console.error('[creative] activar:', e);
        res.status(500).json({ error: e.message });
    }
};

/** Apagar el estilo: las piezas vuelven a componerse como las declara la
 *  plantilla. Es la vuelta atrás, y tiene que existir: un perfil que no gusta
 *  no puede dejar el módulo peor que antes de tenerlo. */
export const deactivateCreativeProfiles = async (req, res) => {
    try {
        await ensureCreativeSchema();
        const club = scopeOf(req);
        await db.query(
            club ? `UPDATE "CreativeProfile" SET active = FALSE WHERE "clubId" = $1` : `UPDATE "CreativeProfile" SET active = FALSE WHERE "clubId" IS NULL`,
            club ? [club] : []
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('[creative] apagar:', e);
        res.status(500).json({ error: e.message });
    }
};

// ─── Lo que consume el generador ───────────────────────────────────────

/**
 * El perfil que le toca a una pieza.
 *
 * Se resuelve en el SERVIDOR y no se acepta uno cualquiera del navegador: el
 * id llega, sí, pero se comprueba contra el alcance antes de usarlo. Sin eso,
 * un sitio podría componer con el estilo de otro.
 *
 * Devuelve `null` ante cualquier fallo —incluida una tabla que todavía no
 * existe—: sin perfil, las piezas se componen exactamente como hasta v4.837.
 * Un estilo es una mejora, no un requisito.
 */
export const resolveProfileFor = async (req, profileId = null) => {
    try {
        await ensureCreativeSchema();
        const todos = await perfilesVisibles(req);
        if (!todos.length) return null;
        if (profileId === 'none') return null;      // el usuario lo apagó a mano
        if (profileId) return todos.find(p => p.id === profileId) || null;
        return todos.find(p => p.active) || null;
    } catch {
        return null;
    }
};

export default {
    listCreativeProfiles, getCreativeProfile, saveCreativeProfile,
    activateCreativeProfile, deactivateCreativeProfiles, resolveProfileFor,
};
