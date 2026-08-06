// ════════════════════════════════════════════════════════════════════
// Plantillas IA — API del módulo
// v4.720.0
//
// Orquesta lo que deciden `designSpec.js` (criterio), `designTemplates.js`
// (catálogo), `designBranding.js` (identidad) y `designAI.js` (redacción). Acá
// no hay criterio propio: si aparece una regla nueva, va en el archivo puro,
// que es el que tiene pruebas.
//
// ── EL ARCHIVO NO SE COMPONE EN EL SERVIDOR ─────────────────────────
//
// La exportación se hace en el NAVEGADOR, con el mismo grafo de escena que ya
// está pintando. No es comodidad: componer acá exigiría un canvas de servidor
// (`node-canvas` son ~40 MB de binarios nativos, y la función ya empaqueta
// FFmpeg dentro del tope de 250 MB de Vercel) y, sobre todo, tendría que
// reimplementar el mismo dibujo por segunda vez — que es exactamente la
// duplicación que este módulo existe para no repetir. El servidor guarda la
// FICHA; el archivo se sube por `/api/media/upload`, que es el camino que ya
// registra en la Biblioteca Multimedia.
// ════════════════════════════════════════════════════════════════════

import db from '../lib/db.js';
import { ensureDesignSchema } from '../lib/ensureDesignSchema.js';
import {
    FORMATS, availableFormats, TEMPLATE_CATEGORIES, VARIABLES, PALETTE, FONTS,
    compileTemplate, normalizeDocument, LIMITS,
} from '../lib/designSpec.js';
import { catalog, templateById, availableTemplates } from '../lib/designTemplates.js';
import { elementsByCategory } from '../lib/designElements.js';
import { searchClubs, brandingForClub, saveFoundationDate, yearsSince, rotaryPeriod } from '../lib/designBranding.js';
import { generateDesignCopy, improveMessage, TONES } from '../lib/designAI.js';

console.log('[designStudioController] v4.720.0 cargado — Plantillas IA. Grafo de escena compartido entre editor y exportación; el archivo se compone en el navegador.');

// El club sobre el que trabaja quien pide. Un administrador de plataforma puede
// apuntar a cualquier sitio; el resto, sólo al suyo. Mismo criterio que
// `getAdminTemplate` en el Generador de Pendones.
const scopeClubId = (req) =>
    req.user?.role === 'administrator' ? (req.query.clubId || req.body?.clubId || req.user?.clubId || null) : (req.user?.clubId || null);

const fail = (res, error, code = 500, msg = 'Error interno') => {
    console.error('[designStudio]', error);
    res.status(code).json({ error: msg, details: error?.message });
};

// ── GET /api/design-studio/catalog ────────────────────────────────────
// Todo lo que la pantalla necesita para pintarse: formatos, categorías,
// plantillas, elementos, tonos, paleta y variables. Una sola llamada porque
// son datos estáticos que se piden juntos siempre.
export const getCatalog = async (_req, res) => {
    try {
        res.json({
            formats: Object.values(FORMATS),
            availableFormats: availableFormats().map(f => f.id),
            categories: TEMPLATE_CATEGORIES,
            catalog: catalog(),
            templates: availableTemplates().map(t => ({
                id: t.id, name: t.name, category: t.category, format: t.format,
                requires: t.requires || [], summary: t.summary || '',
            })),
            elements: elementsByCategory(),
            tones: Object.entries(TONES).map(([id, t]) => ({ id, label: t.label })),
            palette: PALETTE,
            fonts: FONTS,
            variables: VARIABLES,
            limits: LIMITS,
        });
    } catch (e) { fail(res, e); }
};

// ── GET /api/design-studio/clubs?q= ───────────────────────────────────
export const findClubs = async (req, res) => {
    try {
        res.json(await searchClubs({ term: req.query.q || '', limit: req.query.limit, districtId: req.query.districtId || null }));
    } catch (e) { fail(res, e, 500, 'No se pudieron buscar los clubes'); }
};

// ── GET /api/design-studio/clubs/:id/branding ─────────────────────────
export const getBranding = async (req, res) => {
    try {
        const b = await brandingForClub(req.params.id);
        if (!b) return res.status(404).json({ error: 'Club no encontrado' });
        res.json(b);
    } catch (e) { fail(res, e, 500, 'No se pudo cargar la identidad del club'); }
};

// ── PUT /api/design-studio/clubs/:id/foundation ───────────────────────
// La fecha de fundación no está en el modelo `Club` y no se deduce de
// `createdAt` — ver la nota de `designBranding.js`. Cuando el usuario la
// escribe, se guarda para que el próximo aniversario ya la tenga.
export const putFoundation = async (req, res) => {
    try {
        res.json(await saveFoundationDate(req.params.id, req.body?.value));
    } catch (e) { fail(res, e, 400, e.message); }
};

// ── POST /api/design-studio/compose ───────────────────────────────────
// Plantilla + club → documento listo para editar, con el mensaje ya escrito.
//
// Devuelve TAMBIÉN `missing`: las variables que no se pudieron resolver. La
// pantalla las pide en vez de dejar la pieza con huecos, que es lo que pasaría
// si el compilador se limitara a borrar el marcador y callar.
export const compose = async (req, res) => {
    try {
        await ensureDesignSchema();
        const { templateId, subjectClubId, overrides = {}, skipAI = false, tone = null, provider = null } = req.body || {};

        const template = templateById(templateId);
        if (!template) return res.status(400).json({ error: `Plantilla desconocida: ${templateId}` });
        if (!template.available) return res.status(400).json({ error: `La plantilla «${template.name}» todavía no está disponible.` });

        const branding = subjectClubId ? await brandingForClub(subjectClubId) : null;
        if (subjectClubId && !branding) return res.status(404).json({ error: 'Club no encontrado' });

        // Los años: primero lo que escribió el usuario, después lo calculado
        // desde la fundación guardada. Nunca de `Club.createdAt`.
        const years = overrides.anios
            ?? (overrides.foundedYear ? yearsSince(overrides.foundedYear) : null)
            ?? branding?.years
            ?? null;

        let copy = { mensaje: overrides.mensaje || '' };
        if (!skipAI && !overrides.mensaje) {
            copy = await generateDesignCopy({
                purpose: template.category,
                tone,
                provider,
                context: {
                    clubName: branding?.clubName, entityKind: branding?.entityKind,
                    city: branding?.city, country: branding?.country, district: branding?.district,
                    years, foundedYear: branding?.foundedYear,
                    president: branding?.president, governor: branding?.governor,
                    period: branding?.period || rotaryPeriod(),
                    projects: branding?.projects,
                },
                maxChars: template.id === 'aniversario_clasico' ? 340 : 300,
            });
        }

        const variables = {
            anios: years != null ? String(years) : '',
            mensaje: copy.mensaje || '',
            fecha: overrides.fecha || '',
            titulo: overrides.titulo || '',
            ...Object.fromEntries(Object.entries(overrides).filter(([k, v]) => k in VARIABLES && v !== undefined && v !== null && v !== '')),
        };

        const compiled = compileTemplate({ template, variables, branding: branding || {} });

        res.json({
            templateId: template.id,
            document: { format: compiled.format, background: compiled.background, nodes: compiled.nodes },
            variables: { ...variables },
            branding: branding || {},
            copy,
            // `missing` sin `imagen` cuando la plantilla no la exige: pedir una
            // foto para el clásico sería pedir un dato que no usa.
            missing: compiled.missing.filter(m => (template.requires || []).includes(m) || ['club', 'anios'].includes(m)),
        });
    } catch (e) { fail(res, e, 500, 'No se pudo componer el diseño'); }
};

// ── POST /api/design-studio/improve ───────────────────────────────────
export const improve = async (req, res) => {
    try {
        const { text, tone, context = {}, maxChars, provider = null } = req.body || {};
        res.json(await improveMessage({ text, tone, context, maxChars, provider }));
    } catch (e) { fail(res, e, 400, e.message); }
};

// ── Proyectos guardados ───────────────────────────────────────────────

const rowToProject = (r) => ({
    id: r.id, title: r.title, templateId: r.templateId, category: r.category, format: r.format,
    document: r.document, variables: r.variables, branding: r.branding, copy: r.copy,
    imageUrl: r.imageUrl, thumbUrl: r.thumbUrl, mediaId: r.mediaId,
    subjectClubId: r.subjectClubId, status: r.status,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
});

// ── GET /api/design-studio/projects ───────────────────────────────────
export const listProjects = async (req, res) => {
    try {
        await ensureDesignSchema();
        const clubId = scopeClubId(req);
        const { rows } = await db.query(
            `SELECT * FROM "DesignProject"
              WHERE "clubId" IS NOT DISTINCT FROM $1
              ORDER BY "updatedAt" DESC LIMIT 60`, [clubId]
        );
        res.json(rows.map(rowToProject));
    } catch (e) { fail(res, e, 500, 'No se pudieron cargar los diseños'); }
};

// ── POST /api/design-studio/projects ──────────────────────────────────
export const saveProject = async (req, res) => {
    try {
        await ensureDesignSchema();
        const clubId = scopeClubId(req);
        const { title, templateId, category, document, variables = {}, branding = {}, copy = {}, subjectClubId = null, imageUrl = null, mediaId = null } = req.body || {};

        // Todo lo que llega del navegador pasa por el normalizador. Es la única
        // puerta: un nodo con `w: "mucho"` no puede llegar al renderizador.
        const doc = normalizeDocument(document);

        const { rows } = await db.query(
            `INSERT INTO "DesignProject"
                (title, "clubId", "subjectClubId", "userId", "userEmail", "templateId", category, format,
                 document, variables, branding, copy, "imageUrl", "mediaId", status, "updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
             RETURNING *`,
            [
                String(title || 'Diseño sin título').slice(0, 160), clubId, subjectClubId || null,
                req.user?.id || null, req.user?.email || null,
                String(templateId || 'aniversario_foto'), String(category || 'aniversario'), doc.format,
                JSON.stringify(doc), JSON.stringify(variables), JSON.stringify(branding), JSON.stringify(copy),
                imageUrl, mediaId, imageUrl ? 'exported' : 'draft',
            ]
        );
        res.status(201).json(rowToProject(rows[0]));
    } catch (e) { fail(res, e, 500, 'No se pudo guardar el diseño'); }
};

// ── PUT /api/design-studio/projects/:id ───────────────────────────────
export const updateProject = async (req, res) => {
    try {
        await ensureDesignSchema();
        const clubId = scopeClubId(req);
        const { title, document, variables, copy, imageUrl, mediaId } = req.body || {};
        const doc = document ? normalizeDocument(document) : null;

        // El aislamiento va en el WHERE, no en una comprobación posterior:
        // ningún endpoint recibe un id y decide después si pertenece.
        const { rows } = await db.query(
            `UPDATE "DesignProject" SET
                title = COALESCE($3, title),
                document = COALESCE($4::jsonb, document),
                variables = COALESCE($5::jsonb, variables),
                copy = COALESCE($6::jsonb, copy),
                "imageUrl" = COALESCE($7, "imageUrl"),
                "mediaId" = COALESCE($8, "mediaId"),
                status = CASE WHEN $7 IS NOT NULL THEN 'exported' ELSE status END,
                "updatedAt" = NOW()
              WHERE id = $1 AND "clubId" IS NOT DISTINCT FROM $2
              RETURNING *`,
            [
                req.params.id, clubId,
                title ? String(title).slice(0, 160) : null,
                doc ? JSON.stringify(doc) : null,
                variables ? JSON.stringify(variables) : null,
                copy ? JSON.stringify(copy) : null,
                imageUrl || null, mediaId || null,
            ]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Diseño no encontrado' });
        res.json(rowToProject(rows[0]));
    } catch (e) { fail(res, e, 500, 'No se pudo actualizar el diseño'); }
};

// ── DELETE /api/design-studio/projects/:id ────────────────────────────
export const deleteProject = async (req, res) => {
    try {
        await ensureDesignSchema();
        const clubId = scopeClubId(req);
        const { rowCount } = await db.query(
            `DELETE FROM "DesignProject" WHERE id = $1 AND "clubId" IS NOT DISTINCT FROM $2`,
            [req.params.id, clubId]
        );
        if (!rowCount) return res.status(404).json({ error: 'Diseño no encontrado' });
        res.json({ ok: true });
    } catch (e) { fail(res, e, 500, 'No se pudo eliminar el diseño'); }
};

export default {
    getCatalog, findClubs, getBranding, putFoundation, compose, improve,
    listProjects, saveProject, updateProject, deleteProject,
};
