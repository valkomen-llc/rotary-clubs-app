import db from '../lib/db.js';
import prisma from '../lib/prisma.js'; // CLIENTE CENTRALIZADO (ESTABILIDAD TOTAL)
import { ingestMemorySafe } from '../services/brainService.js';

// Normaliza el contenido para que el texto fluya y corte entre palabras (no a
// mitad de palabra). La causa principal del texto "mocho" es que los espacios
// entre palabras vienen como `&nbsp;` (espacio de no-quiebre, U+00A0) al pegar
// desde Word/PDF/Google Docs: al no haber espacios normales donde cortar, el
// navegador parte las palabras. Convertimos esos espacios a espacios normales y,
// además, eliminamos caracteres invisibles (literales y entidades) y <wbr>.
const NO_BREAK_SPACES = new RegExp('[\\u00A0\\u202F]', 'g');
const NO_BREAK_SPACE_ENTITIES = /&nbsp;|&#x0*a0;|&#0*160;|&#x0*202f;|&#0*8239;/gi;
const INVISIBLE_BREAK_CHARS = new RegExp('[\\u00AD\\u200B\\u2060\\uFEFF]', 'g');
const INVISIBLE_BREAK_ENTITIES =
    /&#x0*(?:ad|200b|2060|feff);|&#0*(?:173|8203|8288|65279);|&(?:shy|ZeroWidthSpace|NoBreak);/gi;
const stripInvisibleBreaks = (html) =>
    typeof html === 'string'
        ? html
            .replace(/<wbr\s*\/?>(?:<\/wbr>)?/gi, '')
            .replace(NO_BREAK_SPACE_ENTITIES, ' ')
            .replace(INVISIBLE_BREAK_ENTITIES, '')
            .replace(NO_BREAK_SPACES, ' ')
            .replace(INVISIBLE_BREAK_CHARS, '')
        : html;

// Garantiza que exista la columna de targeting de publicaciones centralizadas.
// Aditivo e idempotente (ADD COLUMN IF NOT EXISTS) — nunca borra ni resetea datos.
// Protege contra un orden de deploy en el que el código nuevo corre antes de que
// `prisma db push` haya aplicado el schema.
let _targetColumnEnsured = false;
const ensureTargetClubIdsColumn = async () => {
    if (_targetColumnEnsured) return;
    try {
        await db.query(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "targetClubIds" TEXT[] DEFAULT '{}'::text[];`);
        _targetColumnEnsured = true;
    } catch (e) {
        console.error('ensureTargetClubIdsColumn error:', e.message);
    }
};

// Filtro público de visibilidad de un post para un club dado.
//   - clubId = $1                         → post por-club (legacy)
//   - clubId IS NULL AND target vacío     → global legacy (se ve en todos)
//   - $1 = ANY(targetClubIds)             → publicación centralizada dirigida
// Nota: los posts existentes tienen targetClubIds = '{}' (vacío) → comportamiento
// idéntico al anterior, sin cambios.
const CLUB_VISIBILITY_CLAUSE = `(
    "clubId" = $CLUB
    OR ("clubId" IS NULL AND cardinality(COALESCE("targetClubIds", '{}'::text[])) = 0)
    OR $CLUB = ANY(COALESCE("targetClubIds", '{}'::text[]))
)`;

// Public: Get posts for a specific club
export const getPublicPosts = async (req, res) => {
    const { clubId } = req.params;
    const { limit } = req.query;
    const runQuery = () => {
        const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';
        return db.query(
            `SELECT * FROM "Post" WHERE ${CLUB_VISIBILITY_CLAUSE.replace(/\$CLUB/g, '$1')} AND published = true
             ORDER BY "createdAt" DESC ${limitClause}`,
            [clubId]
        );
    };
    try {
        const result = await runQuery();
        res.json(result.rows);
    } catch (error) {
        if (error.message && error.message.includes('targetClubIds')) {
            await ensureTargetClubIdsColumn();
            try {
                const retry = await runQuery();
                return res.json(retry.rows);
            } catch (e) { /* fallthrough */ }
        }
        res.status(500).json({ error: 'Error fetching posts' });
    }
};

// Public: Get a single post by ID
export const getPublicPostById = async (req, res) => {
    const { clubId, postId } = req.params;
    const runQuery = () => db.query(
        `SELECT * FROM "Post" WHERE (id = $1 OR slug = $1) AND ${CLUB_VISIBILITY_CLAUSE.replace(/\$CLUB/g, '$2')} AND published = true`,
        [postId, clubId]
    );
    try {
        const result = await runQuery();
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Noticia no encontrada' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        if (error.message && error.message.includes('targetClubIds')) {
            await ensureTargetClubIdsColumn();
            try {
                const retry = await runQuery();
                if (retry.rows.length === 0) return res.status(404).json({ error: 'Noticia no encontrada' });
                return res.json(retry.rows[0]);
            } catch (e) { /* fallthrough */ }
        }
        console.error('Error fetching post:', error);
        res.status(500).json({ error: 'Error fetching post' });
    }
};

// Public: Get projects for a specific club
export const getPublicProjects = async (req, res) => {
    const { clubId } = req.params;
    const { limit } = req.query;
    try {
        const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';
        const result = await db.query(
            `SELECT * FROM "Project" WHERE "clubId" = $1 AND ("deletedAt" IS NULL)
             ORDER BY "createdAt" DESC ${limitClause}`,
            [clubId]
        );
        res.set('Cache-Control', 'no-store');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching projects' });
    }
};

// Public: Get a single project by ID or slug (v4.420 — soporte URL amigable)
export const getPublicProjectById = async (req, res) => {
    const { clubId, projectId } = req.params;
    try {
        const result = await db.query(
            `SELECT p.*,
                    COALESCE(SUM(d.amount), 0) as "realRecaudado",
                    COUNT(DISTINCT d.id) as "realDonantes"
             FROM "Project" p
             LEFT JOIN "Donation" d ON d."projectId" = p.id AND d.status IN ('completed', 'success')
             WHERE (p.id = $1 OR p.slug = $1) AND p."clubId" = $2 AND p."deletedAt" IS NULL
             GROUP BY p.id
             LIMIT 1`,
            [projectId, clubId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Proyecto no encontrado' });
        }
        res.set('Cache-Control', 'no-store');
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Error fetching project' });
    }
};

// Admin: Get posts
export const getClubPosts = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId is required' });
        
        // Solo incluimos noticias globales (NULL) si eres super admin, 
        // o si eres editor (permitido para Rotary Latir) para que puedan administrarlas y verlas.
        const query = (req.user.role === 'administrator' || req.user.role === 'editor')
            ? `SELECT * FROM "Post" WHERE "clubId" = $1 OR "clubId" IS NULL ORDER BY "createdAt" DESC`
            : `SELECT * FROM "Post" WHERE "clubId" = $1 ORDER BY "createdAt" DESC`;

        const result = await db.query(query, [clubId]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching club posts' });
    }
};

export const createPost = async (req, res) => {
    const {
        title, slug, content, image, published, clubId, category, tags,
        keywords, seoTitle, seoDescription, seoImage, socialCopy, ctaCopy, videoUrl, images, videoGallery, isAI, createdAt,
        targetClubIds
    } = req.body;

    // Difusión multi-club (solo super-admin): si se seleccionan clubes destino,
    // la noticia se guarda como publicación centralizada (clubId NULL + targetClubIds)
    // y se muestra en el blog de cada club destino con su propia identidad.
    const targets = (req.user.role === 'administrator' && Array.isArray(targetClubIds))
        ? [...new Set(targetClubIds.filter((id) => typeof id === 'string' && id.trim()))]
        : [];

    // Fecha de publicación editable: si el editor manda una fecha válida la respetamos,
    // de lo contrario Prisma usa @default(now()).
    const parsedCreatedAt = createdAt ? new Date(createdAt) : null;
    const validCreatedAt = parsedCreatedAt && !isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : null;

    const runCreate = async () => {
        let targetClubId = req.user.role === 'administrator' ? (clubId || req.user.clubId) : req.user.clubId;
        if (clubId === 'global' && req.user.role === 'administrator') targetClubId = null;
        if (targets.length > 0) targetClubId = null; // Centralizada: se dirige por targetClubIds.

        return await prisma.post.create({
            data: {
                title: title || '',
                slug: slug || undefined,
                content: stripInvisibleBreaks(content) || '',
                image: image || null,
                published: published || false,
                clubId: targetClubId,
                targetClubIds: targets,
                category: category || '',
                tags: Array.isArray(tags) ? tags : [],
                keywords: keywords || '',
                seoTitle: seoTitle || '',
                seoDescription: seoDescription || '',
                seoImage: seoImage || null,
                socialCopy: socialCopy || '',
                ctaCopy: ctaCopy || '',
                videoUrl: videoUrl || '',
                images: Array.isArray(images) ? images : [],
                videoGallery: Array.isArray(videoGallery) ? videoGallery : [],
                isAI: isAI || false,
                ...(validCreatedAt ? { createdAt: validCreatedAt } : {})
            }
        });
    };

    const ingestForPost = (post) => {
        const clubIds = targets.length > 0 ? targets : (post?.clubId ? [post.clubId] : []);
        for (const cid of clubIds) {
            ingestMemorySafe({
                clubId: cid,
                kind: 'POST',
                sourceType: 'Post',
                sourceId: post.id,
                title: post.title,
                content: post.content,
                metadata: { category: post.category, published: post.published, isAI: post.isAI, centralized: targets.length > 0 },
            });
        }
    };

    try {
        const post = await runCreate();
        ingestForPost(post);
        res.status(201).json(post);
    } catch (error) {
        // Auto-heal: If columns are missing, add them and retry
        const missingCols = ['seoImage', 'socialCopy', 'ctaCopy', 'videoGallery'];
        if (missingCols.some(col => error.message.includes(col))) {
            try {
                console.log('Auto-migration (Create): Patching Post table schema for multimedia...');
                for (const col of missingCols) {
                    const type = col === 'videoGallery' ? 'TEXT[]' : 'TEXT';
                    await db.query(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "${col}" ${type};`);
                }
                const retryPost = await runCreate();
                if (retryPost) ingestForPost(retryPost);
                return res.status(201).json(retryPost);
            } catch (migrationError) {
                console.error('Migration failed:', migrationError);
            }
        }
        console.error('Create Post Error:', error);
        res.status(500).json({ error: 'Error creating post', details: error.message });
    }
};

export const updatePost = async (req, res) => {
    const { id } = req.params;
    const {
        title, slug, content, image, published, category, tags,
        keywords, seoTitle, seoDescription, seoImage, socialCopy, ctaCopy, videoUrl, images, videoGallery, createdAt,
        targetClubIds
    } = req.body;

    // Difusión multi-club (solo super-admin): reasignación de clubes destino.
    // undefined = no tocar; array = fijar destinos (vacío ⇒ deja de ser centralizada).
    const targets = (req.user.role === 'administrator' && targetClubIds !== undefined && Array.isArray(targetClubIds))
        ? [...new Set(targetClubIds.filter((cid) => typeof cid === 'string' && cid.trim()))]
        : undefined;

    // Fecha de publicación editable: solo se sobreescribe si llega una fecha válida.
    const parsedCreatedAt = createdAt ? new Date(createdAt) : null;
    const validCreatedAt = parsedCreatedAt && !isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : null;

    const runUpdate = async () => {
        const existing = await prisma.post.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: 'Post not found' });
            return null;
        }

        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            res.status(403).json({ error: 'Access denied' });
            return null;
        }

        return await prisma.post.update({
            where: { id },
            data: {
                title: title || existing.title,
                slug: slug || existing.slug,
                content: content ? stripInvisibleBreaks(content) : existing.content,
                image: image || existing.image,
                published: published !== undefined ? published : existing.published,
                category: category || existing.category,
                tags: Array.isArray(tags) ? tags : existing.tags,
                keywords: keywords || existing.keywords,
                seoTitle: seoTitle || existing.seoTitle,
                seoDescription: seoDescription || existing.seoDescription,
                seoImage: seoImage || existing.seoImage,
                socialCopy: socialCopy || existing.socialCopy,
                ctaCopy: ctaCopy || existing.ctaCopy,
                videoUrl: videoUrl || existing.videoUrl,
                images: Array.isArray(images) ? images : existing.images,
                videoGallery: Array.isArray(videoGallery) ? videoGallery : existing.videoGallery,
                // Si se manda targetClubIds: fijamos destinos. Con destinos ⇒ centralizada (clubId NULL).
                ...(targets !== undefined
                    ? { targetClubIds: targets, clubId: targets.length > 0 ? null : existing.clubId }
                    : {}),
                ...(validCreatedAt ? { createdAt: validCreatedAt } : {}),
                updatedAt: new Date()
            }
        });
    };

    try {
        const post = await runUpdate();
        if (post) {
            // Ingesta al cerebro: por club destino si es centralizada, o al club propio.
            const ingestClubIds = (post.targetClubIds && post.targetClubIds.length > 0)
                ? post.targetClubIds
                : (post.clubId ? [post.clubId] : []);
            for (const cid of ingestClubIds) {
                ingestMemorySafe({
                    clubId: cid,
                    kind: 'POST',
                    sourceType: 'Post',
                    sourceId: post.id,
                    title: post.title,
                    content: post.content,
                    metadata: { category: post.category, published: post.published, centralized: (post.targetClubIds || []).length > 0 },
                });
            }
            res.json(post);
        }
    } catch (error) {
        // Auto-heal: If columns are missing, add them and retry
        const missingCols = ['seoImage', 'socialCopy', 'ctaCopy', 'videoGallery'];
        if (missingCols.some(col => error.message.includes(col))) {
            try {
                console.log('Auto-migration (Update): Patching Post table schema for multimedia...');
                for (const col of missingCols) {
                    const type = col === 'videoGallery' ? 'TEXT[]' : 'TEXT';
                    await db.query(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "${col}" ${type};`);
                }
                const retryPost = await runUpdate();
                if (retryPost) return res.json(retryPost);
            } catch (migrationError) {
                console.error('Migration failed:', migrationError);
            }
        }
        console.error('Update Post Error:', error);
        res.status(500).json({ error: 'Error updating post', details: error.message });
    }
};

export const deletePost = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await db.query('SELECT * FROM "Post" WHERE id = $1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Post not found' });
        if (req.user.role !== 'administrator' && existing.rows[0].clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await db.query('DELETE FROM "Post" WHERE id = $1', [id]);
        res.json({ message: 'Post deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting post' });
    }
};

// Bulk delete posts
export const bulkDeletePosts = async (req, res) => {
    const { ids } = req.body;
    try {
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids[] required' });

        await prisma.post.deleteMany({
            where: {
                id: { in: ids },
                ...(req.user.role !== 'administrator' ? { clubId: req.user.clubId } : {})
            }
        });

        res.json({ message: `${ids.length} posts deleted` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error bulk deleting posts' });
    }
};

// ============================================================================
// PUBLICACIONES CENTRALIZADAS (Difusión) — v4.548
// Una publicación creada desde el admin de plataforma se replica a un subconjunto
// de clubes seleccionados. Se guarda como UNA sola fila en "Post" con clubId NULL
// y targetClubIds = [clubes destino]. El blog público de cada club destino la
// recoge vía getPublicPosts, mostrándola dentro de su propia identidad. Fuente
// única: se edita/despublica desde un único lugar y se refleja en todos.
// Solo super-admin (roleMiddleware ['administrator']).
// ============================================================================
console.log('📢 Publicaciones/Difusión centralizada v4.550.1 — filtro por distrito agrupa clubes por número de distrito');

const sanitizeTargetClubIds = (value) =>
    Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string' && id.trim()))] : [];

// Admin: listar publicaciones centralizadas (las que tienen clubes destino).
export const getPublications = async (req, res) => {
    const runQuery = () => db.query(
        `SELECT * FROM "Post" WHERE cardinality(COALESCE("targetClubIds", '{}'::text[])) > 0
         ORDER BY "createdAt" DESC`
    );
    try {
        const result = await runQuery();
        res.json(result.rows);
    } catch (error) {
        if (error.message && error.message.includes('targetClubIds')) {
            await ensureTargetClubIdsColumn();
            try {
                const retry = await runQuery();
                return res.json(retry.rows);
            } catch (e) { /* fallthrough */ }
        }
        console.error('getPublications error:', error);
        res.status(500).json({ error: 'Error fetching publications' });
    }
};

// Admin: crear publicación centralizada dirigida a clubes seleccionados.
export const createPublication = async (req, res) => {
    await ensureTargetClubIdsColumn();
    const {
        title, slug, content, image, published, category, tags,
        keywords, seoTitle, seoDescription, seoImage, socialCopy, ctaCopy,
        videoUrl, images, videoGallery, isAI, createdAt, targetClubIds
    } = req.body;

    const targets = sanitizeTargetClubIds(targetClubIds);
    if (targets.length === 0) {
        return res.status(400).json({ error: 'Debes seleccionar al menos un club destino.' });
    }

    const parsedCreatedAt = createdAt ? new Date(createdAt) : null;
    const validCreatedAt = parsedCreatedAt && !isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : null;

    try {
        const post = await prisma.post.create({
            data: {
                title: title || '',
                slug: slug || undefined,
                content: stripInvisibleBreaks(content) || '',
                image: image || null,
                published: published || false,
                clubId: null, // Publicación centralizada: no pertenece a un club, se dirige por targetClubIds.
                targetClubIds: targets,
                category: category || '',
                tags: Array.isArray(tags) ? tags : [],
                keywords: keywords || '',
                seoTitle: seoTitle || '',
                seoDescription: seoDescription || '',
                seoImage: seoImage || null,
                socialCopy: socialCopy || '',
                ctaCopy: ctaCopy || '',
                videoUrl: videoUrl || '',
                images: Array.isArray(images) ? images : [],
                videoGallery: Array.isArray(videoGallery) ? videoGallery : [],
                isAI: isAI || false,
                ...(validCreatedAt ? { createdAt: validCreatedAt } : {})
            }
        });

        // Ingesta al cerebro de cada club destino (best-effort, no bloquea la respuesta).
        for (const clubId of targets) {
            ingestMemorySafe({
                clubId,
                kind: 'POST',
                sourceType: 'Post',
                sourceId: post.id,
                title: post.title,
                content: post.content,
                metadata: { category: post.category, published: post.published, centralized: true },
            });
        }

        res.status(201).json(post);
    } catch (error) {
        console.error('Create Publication Error:', error);
        res.status(500).json({ error: 'Error creating publication', details: error.message });
    }
};

// Admin: actualizar publicación centralizada (incluye reasignar clubes destino).
export const updatePublication = async (req, res) => {
    await ensureTargetClubIdsColumn();
    const { id } = req.params;
    const {
        title, slug, content, image, published, category, tags,
        keywords, seoTitle, seoDescription, seoImage, socialCopy, ctaCopy,
        videoUrl, images, videoGallery, createdAt, targetClubIds
    } = req.body;

    const parsedCreatedAt = createdAt ? new Date(createdAt) : null;
    const validCreatedAt = parsedCreatedAt && !isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : null;

    try {
        const existing = await prisma.post.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Publicación no encontrada' });

        const targets = targetClubIds !== undefined
            ? sanitizeTargetClubIds(targetClubIds)
            : (existing.targetClubIds || []);
        if (targets.length === 0) {
            return res.status(400).json({ error: 'Debes seleccionar al menos un club destino.' });
        }

        const post = await prisma.post.update({
            where: { id },
            data: {
                title: title || existing.title,
                slug: slug || existing.slug,
                content: content ? stripInvisibleBreaks(content) : existing.content,
                image: image !== undefined ? image : existing.image,
                published: published !== undefined ? published : existing.published,
                clubId: null,
                targetClubIds: targets,
                category: category !== undefined ? category : existing.category,
                tags: Array.isArray(tags) ? tags : existing.tags,
                keywords: keywords !== undefined ? keywords : existing.keywords,
                seoTitle: seoTitle !== undefined ? seoTitle : existing.seoTitle,
                seoDescription: seoDescription !== undefined ? seoDescription : existing.seoDescription,
                seoImage: seoImage !== undefined ? seoImage : existing.seoImage,
                socialCopy: socialCopy !== undefined ? socialCopy : existing.socialCopy,
                ctaCopy: ctaCopy !== undefined ? ctaCopy : existing.ctaCopy,
                videoUrl: videoUrl !== undefined ? videoUrl : existing.videoUrl,
                images: Array.isArray(images) ? images : existing.images,
                videoGallery: Array.isArray(videoGallery) ? videoGallery : existing.videoGallery,
                ...(validCreatedAt ? { createdAt: validCreatedAt } : {}),
                updatedAt: new Date()
            }
        });

        for (const clubId of targets) {
            ingestMemorySafe({
                clubId,
                kind: 'POST',
                sourceType: 'Post',
                sourceId: post.id,
                title: post.title,
                content: post.content,
                metadata: { category: post.category, published: post.published, centralized: true },
            });
        }

        res.json(post);
    } catch (error) {
        console.error('Update Publication Error:', error);
        res.status(500).json({ error: 'Error updating publication', details: error.message });
    }
};

// Admin: eliminar publicación centralizada.
export const deletePublication = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.post.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Publicación no encontrada' });
        await prisma.post.delete({ where: { id } });
        res.json({ message: 'Publicación eliminada' });
    } catch (error) {
        console.error('Delete Publication Error:', error);
        res.status(500).json({ error: 'Error deleting publication' });
    }
};

export const getClubProjects = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator'
            ? (req.query.clubId || null)
            : req.user.clubId;

        // Super admin sin clubId específico: retorna todos los proyectos
        const whereClause = clubId
            ? { clubId, deletedAt: null }
            : { deletedAt: null };

        const projects = await prisma.project.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: { club: { select: { id: true, name: true, subdomain: true } } }
        });
        res.set('Cache-Control', 'no-store');
        res.json(projects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching club projects' });
    }
};

// Papelera: proyectos con soft-delete
export const getTrashedProjects = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId is required' });

        const projects = await prisma.project.findMany({
            where: { clubId, deletedAt: { not: null } },
            orderBy: { deletedAt: 'desc' }
        });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching trashed projects' });
    }
};

// v4.417 — Normalizador de slug (mismo patrón que usa News). Si el slug
// llega vacío pero hay título, generamos uno desde el título.
const normalizeSlug = (raw, fallback = '') => {
    const source = String(raw || fallback || '').trim();
    if (!source) return null;
    return source
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || null;
};

export const createProject = async (req, res) => {
    const {
        title, description, image, status, clubId, category, meta, recaudado,
        donantes, beneficiarios, ubicacion, fechaEstimada, videoUrl, images,
        impacto, actualizaciones,
        // v4.417 — SEO
        seoTitle, seoDescription, seoKeywords, seoImage, slug, socialCopy, indexable
    } = req.body;
    try {
        const targetClubId = req.user.role === 'administrator' ? (clubId || req.user.clubId) : req.user.clubId;

        const project = await prisma.project.create({
            data: {
                title,
                description,
                image,
                status: status || 'planned',
                clubId: targetClubId,
                category,
                meta: meta ? parseFloat(meta) : 0,
                recaudado: recaudado ? parseFloat(recaudado) : 0,
                donantes: donantes ? parseInt(donantes) : 0,
                beneficiarios: beneficiarios ? parseInt(beneficiarios) : 0,
                ubicacion,
                fechaEstimada: fechaEstimada ? new Date(fechaEstimada) : null,
                videoUrl,
                images: images || [],
                impacto,
                actualizaciones,
                seoTitle: seoTitle || null,
                seoDescription: seoDescription || null,
                seoKeywords: seoKeywords || null,
                seoImage: seoImage || null,
                slug: normalizeSlug(slug, title),
                socialCopy: socialCopy || null,
                indexable: indexable === false ? false : true
            }
        });
        if (project?.clubId) {
            ingestMemorySafe({
                clubId: project.clubId,
                kind: 'PROJECT',
                sourceType: 'Project',
                sourceId: project.id,
                title: project.title,
                content: [project.description, project.impacto].filter(Boolean).join('\n\n'),
                metadata: { category: project.category, status: project.status, ubicacion: project.ubicacion, beneficiarios: project.beneficiarios },
            });
        }
        res.set('Cache-Control', 'no-store');
        res.status(201).json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating project' });
    }
};

export const updateProject = async (req, res) => {
    const { id } = req.params;
    const {
        title, description, image, status, category, meta, recaudado,
        donantes, beneficiarios, ubicacion, fechaEstimada, videoUrl, images,
        impacto, actualizaciones,
        // v4.417 — SEO
        seoTitle, seoDescription, seoKeywords, seoImage, slug, socialCopy, indexable
    } = req.body;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });

        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const project = await prisma.project.update({
            where: { id },
            data: {
                title,
                description,
                image,
                status,
                category,
                meta: meta ? parseFloat(meta) : 0,
                recaudado: recaudado ? parseFloat(recaudado) : 0,
                donantes: donantes ? parseInt(donantes) : 0,
                beneficiarios: beneficiarios ? parseInt(beneficiarios) : 0,
                ubicacion,
                fechaEstimada: fechaEstimada ? new Date(fechaEstimada) : null,
                videoUrl,
                images: images || [],
                impacto,
                actualizaciones,
                // v4.417 — SEO (sólo se actualizan si vienen en el body, undefined = no tocar)
                ...(seoTitle !== undefined && { seoTitle: seoTitle || null }),
                ...(seoDescription !== undefined && { seoDescription: seoDescription || null }),
                ...(seoKeywords !== undefined && { seoKeywords: seoKeywords || null }),
                ...(seoImage !== undefined && { seoImage: seoImage || null }),
                ...(slug !== undefined && { slug: normalizeSlug(slug, title || existing.title) }),
                ...(socialCopy !== undefined && { socialCopy: socialCopy || null }),
                ...(indexable !== undefined && { indexable: indexable === false ? false : true })
            }
        });
        if (project?.clubId) {
            ingestMemorySafe({
                clubId: project.clubId,
                kind: 'PROJECT',
                sourceType: 'Project',
                sourceId: project.id,
                title: project.title,
                content: [project.description, project.impacto].filter(Boolean).join('\n\n'),
                metadata: { category: project.category, status: project.status, ubicacion: project.ubicacion, beneficiarios: project.beneficiarios },
            });
        }
        res.json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error updating project' });
    }
};

// Soft delete (mover a papelera)
export const deleteProject = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });
        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
        res.json({ message: 'Project moved to trash' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error deleting project' });
    }
};

// Bulk soft-delete
export const bulkDeleteProjects = async (req, res) => {
    const { ids } = req.body; // array of UUIDs
    try {
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids[] required' });
        await prisma.project.updateMany({
            where: {
                id: { in: ids },
                ...(req.user.role !== 'administrator' ? { clubId: req.user.clubId } : {})
            },
            data: { deletedAt: new Date() }
        });
        res.json({ message: `${ids.length} projects moved to trash` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error bulk deleting projects' });
    }
};

// Restaurar desde papelera
export const restoreProject = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });
        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await prisma.project.update({ where: { id }, data: { deletedAt: null } });
        res.json({ message: 'Project restored' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error restoring project' });
    }
};

// Borrado permanente (desde papelera)
export const permanentDeleteProject = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Project not found' });
        if (req.user.role !== 'administrator' && existing.clubId !== req.user.clubId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        await prisma.project.delete({ where: { id } });
        res.json({ message: 'Project permanently deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error permanently deleting project' });
    }
};

export const getClubAgentContext = async (req, res) => {
    const { clubId } = req.params;
    try {
        const club = await db.query('SELECT * FROM "Club" WHERE id = $1', [clubId]);
        if (!club.rows[0]) return res.status(404).json({ error: 'Club not found' });
        const projects = await db.query(
            'SELECT title, description, category, status, ubicacion, impacto FROM "Project" WHERE "clubId" = $1',
            [clubId]
        );
        const posts = await db.query(
            'SELECT title, category FROM "Post" WHERE "clubId" = $1 ORDER BY "createdAt" DESC LIMIT 5',
            [clubId]
        );
        const c = club.rows[0];
        res.json({
            clubName: c.name,
            location: `${c.city || ''}, ${c.country || ''}`,
            district: c.district,
            description: c.description,
            recentProjects: projects.rows,
            lastPostTitles: posts.rows.map(p => p.title)
        });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching AI context' });
    }
};

// ─── TESTIMONIOS ───────────────────────────────────────────────────────────

export const getTestimonials = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator'
            ? (req.query.clubId || null)
            : req.user.clubId;
        const where = clubId
            ? { clubId, deletedAt: null }
            : { deletedAt: null };
        const testimonials = await prisma.testimonial.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { club: { select: { id: true, name: true } } }
        });
        res.json(testimonials);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error fetching testimonials' });
    }
};

export const getPublicTestimonials = async (req, res) => {
    try {
        const { clubId } = req.params;
        const testimonials = await prisma.testimonial.findMany({
            where: { clubId, deletedAt: null },
            orderBy: { createdAt: 'asc' }
        });
        res.json(testimonials);
    } catch (e) {
        res.status(500).json({ error: 'Error fetching testimonials' });
    }
};

export const createTestimonial = async (req, res) => {
    try {
        const { name, role, text, image, clubId: bodyClubId } = req.body;
        const clubId = req.user.role === 'administrator'
            ? (bodyClubId || req.user.clubId)
            : req.user.clubId;
        if (!clubId || !name || !text) return res.status(400).json({ error: 'Faltan campos: clubId, name, text' });
        const t = await prisma.testimonial.create({
            data: { clubId, name, role: role || '', text, image: image || null }
        });
        res.status(201).json(t);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error creating testimonial' });
    }
};

export const updateTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, text, image } = req.body;
        const t = await prisma.testimonial.update({
            where: { id },
            data: { name, role, text, image: image || null, updatedAt: new Date() }
        });
        res.json(t);
    } catch (e) {
        res.status(500).json({ error: 'Error updating testimonial' });
    }
};

export const deleteTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.testimonial.update({ where: { id }, data: { deletedAt: new Date() } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Error deleting testimonial' });
    }
};

export const permanentDeleteTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.testimonial.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Error permanent deleting testimonial' });
    }
};

// Public: Get comments for a post
export const getPostComments = async (req, res) => {
    const { postId } = req.params;
    try {
        const comments = await prisma.comment.findMany({
            where: { postId, approved: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(comments);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching comments' });
    }
};

// Public: Create a comment
export const createPostComment = async (req, res) => {
    const { postId } = req.params;
    const { firstName, lastName, email, phone, country, rating, text } = req.body;
    try {
        const comment = await prisma.comment.create({
            data: {
                postId,
                firstName,
                lastName,
                email,
                phone,
                country,
                rating: parseInt(rating) || 5,
                text,
                approved: true // Auto-approve for now
            }
        });
        res.status(201).json(comment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating comment' });
    }
};

export default {
    getPublicPosts, getPublicPostById, getPublicProjects, getPublicProjectById, getClubPosts, createPost, updatePost, deletePost, bulkDeletePosts,
    getClubProjects, getTrashedProjects, createProject, updateProject,
    deleteProject, bulkDeleteProjects, restoreProject, permanentDeleteProject,
    getTestimonials, getPublicTestimonials, createTestimonial, updateTestimonial,
    deleteTestimonial, permanentDeleteTestimonial,
    getClubAgentContext, getPostComments, createPostComment
};
