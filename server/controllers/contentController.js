import db from '../lib/db.js';
import {
    POST_VISIBILITY_SQL, visibilitySql, adminScopeFor, decoratePost,
    originOf, canEditPost, canDeletePost, canRetireFromSite, removalIntent, retirePlan,
    isVisibleTo, isOperator as isPlatformOperator,
} from '../lib/postScope.js';
import prisma from '../lib/prisma.js'; // CLIENTE CENTRALIZADO (ESTABILIDAD TOTAL)
import { ingestMemorySafe } from '../services/brainService.js';
import { cloneOf } from '../lib/ecosystemClones.js';
// v4.873 — La dirección del artículo. El criterio (slugify, palabras
// reservadas, liberación por sufijo) vive aparte y es PURO: el choque de
// unicidad decide a qué dirección responde una publicación, y dentro del
// controlador no se podría probar.
import { normalizeSlug, checkSlug, freeSlug, MOTIVOS_SLUG } from '../lib/postSlug.js';

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
// ⚠️ LA CLÁUSULA DE VISIBILIDAD VIVE EN `postScope.js` Y SE IMPORTA.
//
// Estaba escrita acá y sólo la usaba el camino PÚBLICO; el administrativo tenía
// la suya, que no miraba `targetClubIds`. Dos criterios sobre la misma pregunta
// —«¿esta publicación es de este sitio?»— y por eso una centralizada se veía en
// la página del sitio y no aparecía en su `/admin/noticias`: la publicación
// fantasma. Con una sola no se pueden separar.
const CLUB_VISIBILITY_CLAUSE = POST_VISIBILITY_SQL;

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

        // v4.749 — ¿Es una copia traída del ecosistema del distrito? La ficha
        // pública lo necesita para DOS cosas: acreditar al club que lo dirige y
        // —lo importante— NO ofrecer el formulario de aporte. `Donation` cuelga
        // de `projectId` y la pasarela cobra al `clubId` de la página, así que
        // un aporte hecho sobre la copia entraría a la cuenta del distrito.
        //
        // Va en una consulta aparte y tolerante a propósito: si la tabla aún no
        // existe, lo que corresponde es que la ficha se comporte como contenido
        // propio, no que la página devuelva 500.
        const project = result.rows[0];
        const trace = await cloneOf('project', project.id);

        res.set('Cache-Control', 'no-store');
        res.json({
            ...project,
            ecosystemSource: trace
                ? {
                    clubName: trace.sourceName || '',
                    url: trace.sourceUrl || '',
                    clubId: trace.sourceClubId || '',
                }
                : null,
        });
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Error fetching project' });
    }
};

/**
 * Admin: el listado de `/admin/noticias`.
 *
 * ⚠️ ACÁ ESTABA LA PUBLICACIÓN FANTASMA, y eran dos defectos en la misma
 * función. Hasta v4.937 decía:
 *
 *     const clubId = req.user.role === 'administrator' ? req.query.clubId : req.user.clubId;
 *     if (!clubId) return res.status(400).json({ error: 'clubId is required' });
 *     WHERE "clubId" = $1 [OR "clubId" IS NULL]
 *
 *   1. **El `WHERE` no miraba `targetClubIds`.** Una publicación centralizada
 *      tiene `clubId = NULL` y sus destinos en ese array: el blog del sitio
 *      destino la recogía —su cláusula sí lo miraba— y este listado no la
 *      encontraba jamás. Publicada y visible en la página, ausente del panel.
 *
 *   2. **Para el operador tomaba `req.query.clubId`, y `News.tsx` no lo manda.**
 *      → `400 clubId is required` → y la pantalla hace
 *      `if (response.ok) … else setPosts(staticMapped)`, así que el 400 se
 *      pinta como «0 noticias registradas». El fallo era completamente MUDO:
 *      es lo que se ve en Club Platform con artículos ya distribuidos.
 *
 * Ahora el alcance lo decide `adminScopeFor` y la pertenencia, la MISMA
 * cláusula que usa el público. Sin sitio y sin ser operador se devuelve una
 * lista vacía CON su motivo, no un 400 que la pantalla convierte en silencio.
 *
 * ⚠️ Y se cerró la fuga inversa: `OR "clubId" IS NULL` le daba a cualquier
 * `editor` TODAS las centralizadas del ecosistema —incluidas las dirigidas a
 * otros sitios— con sus botones de editar y eliminar al lado. El aislamiento va
 * en el `WHERE`, no en la pantalla (v4.932).
 */
export const getClubPosts = async (req, res) => {
    const scope = adminScopeFor(req.user, { requestedSiteId: req.query.clubId || req.query.siteId });

    if (scope.mode === 'none') {
        // Lista vacía y el motivo escrito. Un 400 acá se convertía en «0
        // noticias registradas» sin que nadie pudiera saber por qué.
        return res.json({ posts: [], scope, notice: scope.reason });
    }

    const runQuery = async () => {
        if (scope.mode === 'all') {
            return db.query('SELECT * FROM "Post" ORDER BY "createdAt" DESC');
        }
        return db.query(
            `SELECT * FROM "Post" WHERE ${visibilitySql(1)} ORDER BY "createdAt" DESC`,
            [scope.siteId]
        );
    };

    try {
        const result = await runQuery();

        // Los sitios vivos, para poder distinguir un destino real de uno
        // huérfano y para nombrarlos. DEGRADA: sin este dato no se inventa un
        // diagnóstico —`syncStateOf` contesta lo observable— y el listado sale
        // igual. Una consulta agregada, no una por fila.
        let knownSiteIds = null;
        let siteNames = null;
        try {
            const sitios = await db.query('SELECT id, name FROM "Club"');
            knownSiteIds = sitios.rows.map(r => r.id);
            siteNames = Object.fromEntries(sitios.rows.map(r => [r.id, r.name]));
        } catch (e) {
            console.warn('[NOTICIAS] no se pudieron leer los sitios:', e?.message);
        }

        const posts = result.rows.map(row => decoratePost(row, {
            siteId: scope.siteId,
            knownSiteIds,
            siteNames,
            user: req.user,
        }));

        // ⚠️ RESPUESTA ADITIVA. `News.tsx` con el bundle anterior hace
        // `setPosts([...dbPosts, ...])` sobre un ARRAY: devolver un objeto a
        // secas dejaría la pantalla en blanco hasta que el navegador recargue
        // el bundle. Se manda el array, con los campos nuevos dentro de cada
        // fila, y el alcance en una cabecera para quien sepa leerlo.
        res.set('X-Posts-Scope', scope.mode);
        res.json(posts);
    } catch (error) {
        if (error.message && error.message.includes('targetClubIds')) {
            await ensureTargetClubIdsColumn();
            try {
                const retry = await runQuery();
                return res.json(retry.rows.map(row => decoratePost(row, { siteId: scope.siteId, user: req.user })));
            } catch (e) { /* fallthrough */ }
        }
        console.error('[NOTICIAS] getClubPosts:', error?.message);
        res.status(500).json({ error: 'Error fetching club posts' });
    }
};

/**
 * ⚠️ LA RECONCILIACIÓN — y lo primero que dice es que NO MIGRA NADA.
 *
 * El pedido pide recuperar las publicaciones fantasma antes de tocar datos. La
 * respuesta honesta, después de leer el flujo entero, es que **no había nada
 * que recuperar**: las filas estaban escritas y eran correctas —`clubId` NULL y
 * `targetClubIds` con sus destinos—, y lo que estaba roto era la CONSULTA del
 * panel. Corregido el `WHERE`, las publicaciones aparecen solas, sin migrar una
 * sola fila y sin duplicar ninguna. Escribir una migración para arreglar un
 * `WHERE` habría sido el peor intercambio posible.
 *
 * Lo que este endpoint hace es DEMOSTRARLO, que es distinto de afirmarlo: por
 * cada sitio compara cuántas publicaciones le son alcanzables en público contra
 * cuántas le lista el panel. **La diferencia tiene que ser cero.** Si algún día
 * vuelve a no serlo, esa cifra lo dice antes de que alguien lo reporte.
 *
 * Y encuentra lo que sí es un defecto REAL de datos, que existe
 * independientemente de este fallo:
 *
 *   · destinos que apuntan a un sitio que ya no existe (`orphanTargets`);
 *   · centralizadas sin ningún destino, que la cláusula de visibilidad lee como
 *     GLOBALES y por tanto se muestran en TODOS los sitios del ecosistema;
 *   · publicaciones sin `slug`, que se abren por su id.
 *
 * Es de SÓLO LECTURA. Un diagnóstico que cambia cosas al mirarlas no sirve para
 * diagnosticar (regla del panel del CRM, v4.702).
 */
export const reconcilePosts = async (req, res) => {
    if (!isPlatformOperator(req.user)) {
        return res.status(403).json({ error: 'Este diagnóstico es del operador de la plataforma.' });
    }
    try {
        const [posts, sitios] = await Promise.all([
            db.query('SELECT id, title, slug, "clubId", "targetClubIds", published, "createdAt" FROM "Post"'),
            db.query('SELECT id, name FROM "Club"'),
        ]);

        const filas = posts.rows;
        const knownSiteIds = sitios.rows.map(r => r.id);
        const siteNames = Object.fromEntries(sitios.rows.map(r => [r.id, r.name]));
        const vivos = new Set(knownSiteIds);

        const huerfanas = [];
        const sinDestino = [];
        const sinSlug = [];

        for (const post of filas) {
            const targets = Array.isArray(post.targetClubIds) ? post.targetClubIds.filter(Boolean) : [];
            const rotos = targets.filter(t => !vivos.has(t));
            if (rotos.length) {
                huerfanas.push({ id: post.id, title: post.title, orphanTargets: rotos, liveTargets: targets.length - rotos.length });
            }
            if (!post.clubId && targets.length === 0 && post.published) {
                sinDestino.push({ id: post.id, title: post.title });
            }
            if (!post.slug) sinSlug.push({ id: post.id, title: post.title });
        }

        // ⚠️ La comprobación que importa: por sitio, lo público contra lo del
        // panel. Se cuenta con el MISMO criterio (`isVisibleTo`, que es la
        // cláusula SQL en JavaScript), así que si las dos cifras difirieran
        // sería porque el criterio se partió otra vez en dos.
        const porSitio = sitios.rows.map(sitio => {
            const visibles = filas.filter(p => isVisibleTo(p, sitio.id));
            const publicas = visibles.filter(p => p.published);
            return {
                siteId: sitio.id,
                siteName: sitio.name,
                enElPanel: visibles.length,
                publicas: publicas.length,
                propias: visibles.filter(p => originOf(p, sitio.id) === 'own').length,
                replicadas: visibles.filter(p => originOf(p, sitio.id) === 'replicated').length,
                globales: visibles.filter(p => originOf(p, sitio.id) === 'global').length,
                // Una publicación pública que el panel no lista. Con un solo
                // criterio esto es cero POR CONSTRUCCIÓN; se cuenta igual,
                // porque es la única forma de notar que dejó de serlo.
                fantasmas: publicas.filter(p => !visibles.includes(p)).length,
            };
        }).filter(s => s.enElPanel > 0);

        const fantasmas = porSitio.reduce((n, s) => n + s.fantasmas, 0);

        res.json({
            ok: fantasmas === 0,
            resumen: {
                publicaciones: filas.length,
                centralizadas: filas.filter(p => (p.targetClubIds || []).length > 0).length,
                globalesHeredadas: filas.filter(p => !p.clubId && (p.targetClubIds || []).length === 0).length,
                deSitio: filas.filter(p => p.clubId).length,
                sitios: sitios.rows.length,
            },
            fantasmas,
            // Nada de esto se corrige solo: se REPORTA, con su sitio y su
            // motivo, para que alguien decida. Corregirlo al mirarlo sería un
            // diagnóstico que cambia cosas.
            hallazgos: {
                destinosHuerfanos: huerfanas,
                centralizadasSinDestino: sinDestino,
                sinDireccionAmigable: sinSlug.length,
            },
            porSitio,
            siteNames,
            nota: 'Este diagnóstico es de sólo lectura y no migra ni duplica nada. Las publicaciones centralizadas son UNA fila con sus sitios destino; lo que estaba roto era la consulta del panel, no los datos.',
        });
    } catch (error) {
        console.error('[NOTICIAS] reconcilePosts:', error?.message);
        res.status(500).json({ error: 'No pudimos ejecutar el diagnóstico.', details: error?.message });
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

    // ⚠️ EL OTRO CAMINO QUE ESCRIBE `Post.slug`, y es único en TODA la
    // plataforma: una noticia de club puede chocar con una publicación
    // centralizada. Sin resolverlo, el choque sale como un error del driver.
    let slugResuelto = { slug: null, aviso: null };

    const runCreate = async () => {
        let targetClubId = req.user.role === 'administrator' ? (clubId || req.user.clubId) : req.user.clubId;
        if (clubId === 'global' && req.user.role === 'administrator') targetClubId = null;
        if (targets.length > 0) targetClubId = null; // Centralizada: se dirige por targetClubIds.

        slugResuelto = await resolvePostSlug({ slug, title });

        return await prisma.post.create({
            data: {
                title: title || '',
                slug: slugResuelto.slug || undefined,
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

    // ⚠️ UNA RÉPLICA NO SE EDITA DESDE EL SITIO DESTINO (punto H del pedido).
    //
    // El contenido maestro y la publicación de cada sitio son cosas distintas.
    // Dejar editarla desde el sitio A cambiaría lo que ven B y C sin que nadie
    // de B ni de C lo hubiera pedido — peor que no poder editarla. Y se dice
    // DÓNDE se edita, o el bloqueo se lee como una avería.
    //
    // Va acá y no sólo en la pantalla: esconder un botón no protege un endpoint
    // de quien lo conoce (v4.868).
    try {
        const actual = await db.query('SELECT id, "clubId", "targetClubIds", published FROM "Post" WHERE id = $1', [id]);
        const fila = actual.rows[0];
        if (!fila) return res.status(404).json({ error: 'Noticia no encontrada' });
        if (!canEditPost(req.user, fila, req.user?.clubId)) {
            const origen = originOf(fila, req.user?.clubId);
            return res.status(403).json({
                error: origen === 'replicated'
                    ? 'Esta publicación se creó en Club Platform y se dirigió a este sitio: su contenido se edita allá, para que el cambio llegue a todos los sitios donde está publicada. Desde acá puedes retirarla de este sitio.'
                    : origen === 'global'
                        ? 'Es una publicación global del ecosistema: se administra desde Club Platform.'
                        : 'No tienes permiso sobre esta publicación.',
                origin: origen,
            });
        }
    } catch (e) {
        // DEGRADA: si no se pudo comprobar, decide el guardia de siempre más
        // abajo. Un fallo de consulta no puede impedir editar lo propio.
        console.warn('[NOTICIAS] updatePost: no se pudo comprobar el origen:', e?.message);
    }

    // Difusión multi-club (solo super-admin): reasignación de clubes destino.
    // undefined = no tocar; array = fijar destinos (vacío ⇒ deja de ser centralizada).
    const targets = (req.user.role === 'administrator' && targetClubIds !== undefined && Array.isArray(targetClubIds))
        ? [...new Set(targetClubIds.filter((cid) => typeof cid === 'string' && cid.trim()))]
        : undefined;

    // Fecha de publicación editable: solo se sobreescribe si llega una fecha válida.
    const parsedCreatedAt = createdAt ? new Date(createdAt) : null;
    const validCreatedAt = parsedCreatedAt && !isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : null;

    // La dirección resuelta. Se declara acá porque `runUpdate` puede correr dos
    // veces (el reintento tras crear la columna) y el aviso tiene que
    // sobrevivir a la respuesta.
    let slugResuelto = { slug: null, aviso: null };

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

        slugResuelto = slug !== undefined
            ? await resolvePostSlug({ slug, title: title || existing.title, excludeId: id })
            : { slug: existing.slug, aviso: null };

        return await prisma.post.update({
            where: { id },
            data: {
                title: title || existing.title,
                slug: slugResuelto.slug || existing.slug,
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

/**
 * ⚠️ RETIRAR DE UN SITIO NO ES ELIMINAR EL MAESTRO. Es el punto H del pedido y
 * es la integridad que hace segura la corrección de `getClubPosts`.
 *
 * Al hacer visibles las réplicas en el panel del sitio destino, aparece un
 * riesgo que antes no existía: la primera reacción ante «esto no lo escribí yo»
 * es eliminarlo, y borrar la fila desde el sitio A se llevaría la publicación
 * también de B y de C — el borrado en cascada accidental que el pedido manda
 * evitar. Así que el mismo botón hace DOS cosas distintas según de quién sea la
 * fila, y `removalIntent` es el único punto que lo decide.
 *
 * La respuesta DICE cuál de las dos ocurrió: «se eliminó» y «se retiró de este
 * sitio» no son lo mismo y confundirlas es lo que hace que alguien crea que
 * borró algo que sigue publicado en otros dos sitios.
 */
export const deletePost = async (req, res) => {
    const { id } = req.params;
    try {
        const existing = await db.query('SELECT * FROM "Post" WHERE id = $1', [id]);
        const post = existing.rows[0];
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const intent = removalIntent(req.user, post, req.user?.clubId);

        if (intent.action === 'none') {
            return res.status(403).json({ error: intent.help, origin: originOf(post, req.user?.clubId) });
        }

        if (intent.action === 'retire') {
            const plan = retirePlan(post, req.user?.clubId);
            if (!plan.ok) return res.status(409).json({ error: plan.reason });
            // ⚠️ El UPDATE lleva el sitio en el WHERE del array: dos retiros
            // simultáneos desde sitios distintos no se pisan, porque cada uno
            // escribe el resultado de quitar EL SUYO.
            await db.query(
                `UPDATE "Post"
                    SET "targetClubIds" = $1::text[],
                        published = CASE WHEN $2::boolean THEN false ELSE published END,
                        "updatedAt" = NOW()
                  WHERE id = $3`,
                [plan.targets, plan.unpublish, id]
            );
            return res.json({
                action: 'retired',
                message: 'La publicación dejó de mostrarse en este sitio.',
                notice: plan.notice,
                remainingTargets: plan.targets.length,
            });
        }

        await db.query('DELETE FROM "Post" WHERE id = $1', [id]);
        res.json({ action: 'deleted', message: 'Post deleted' });
    } catch (error) {
        console.error('[NOTICIAS] deletePost:', error?.message);
        res.status(500).json({ error: 'Error deleting post' });
    }
};

// Bulk delete posts
/**
 * El borrado en bloque, con la MISMA regla que el de a uno.
 *
 * ⚠️ Hasta v4.937 era `deleteMany({ id: { in: ids }, clubId })`: sobre una
 * réplica —`clubId` NULL— no casaba y la fila se salteaba **en silencio**, así
 * que el usuario marcaba cinco, veía «5 eliminadas» y una seguía ahí. Ahora
 * cada fila pasa por `removalIntent` y el resultado DICE qué se eliminó, qué se
 * retiró y qué no se pudo tocar y por qué: un recuento que miente es peor que
 * un error (regla de `skipped` en los centros de acopio).
 *
 * No es atómico y se dice: cada fila es una decisión distinta, y envolverlas en
 * una transacción tiraría abajo retiros que sí correspondían.
 */
export const bulkDeletePosts = async (req, res) => {
    const { ids } = req.body;
    try {
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids[] required' });

        const { rows } = await db.query('SELECT * FROM "Post" WHERE id = ANY($1::text[])', [ids]);
        const eliminados = [];
        const retirados = [];
        const omitidos = [];

        for (const post of rows) {
            const intent = removalIntent(req.user, post, req.user?.clubId);
            if (intent.action === 'delete') {
                await db.query('DELETE FROM "Post" WHERE id = $1', [post.id]);
                eliminados.push(post.id);
            } else if (intent.action === 'retire') {
                const plan = retirePlan(post, req.user?.clubId);
                if (!plan.ok) { omitidos.push({ id: post.id, title: post.title, motivo: plan.reason }); continue; }
                await db.query(
                    `UPDATE "Post" SET "targetClubIds" = $1::text[],
                            published = CASE WHEN $2::boolean THEN false ELSE published END,
                            "updatedAt" = NOW()
                      WHERE id = $3`,
                    [plan.targets, plan.unpublish, post.id]
                );
                retirados.push(post.id);
            } else {
                omitidos.push({ id: post.id, title: post.title, motivo: intent.help });
            }
        }

        // Lo que NO estaba en la base tampoco se calla.
        const encontrados = new Set(rows.map(r => r.id));
        for (const id of ids) {
            if (!encontrados.has(id) && !String(id).startsWith('static-')) {
                omitidos.push({ id, title: null, motivo: 'No se encontró esa publicación.' });
            }
        }

        res.json({
            message: `${eliminados.length} eliminada(s), ${retirados.length} retirada(s) de este sitio`,
            deleted: eliminados.length,
            retired: retirados.length,
            skipped: omitidos,
        });
    } catch (error) {
        console.error('[NOTICIAS] bulkDeletePosts:', error?.message);
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
/**
 * A qué dirección va a responder esta publicación.
 *
 * ⚠️ `Post.slug` es ÚNICO EN TODA LA PLATAFORMA —no por sitio, como el de
 * `CalendarEvent`—, así que dos publicaciones no pueden compartirlo aunque se
 * muestren en sitios distintos. Sin liberar el choque antes de escribir, el
 * error sale como un fallo del driver que no explica nada.
 *
 * NUNCA lanza y NUNCA deja la publicación sin guardar: si el slug no sirve, se
 * devuelve `null` y el artículo se sigue abriendo por su id, que es como
 * funcionaba antes. Lo que sí hace es DECIR qué pasó — un slug que cambia en
 * silencio manda a buscar el artículo a una dirección que no es.
 */
const resolvePostSlug = async ({ slug, title, excludeId = null }) => {
    // Lo que el usuario escribió manda; el título es el respaldo.
    const pedido = String(slug || '').trim() || String(title || '');
    const revision = checkSlug(pedido);

    // Un slug inservible (reservado, sólo números, vacío) NO se sustituye por
    // otro a la callada: se intenta con el título y, si tampoco, se avisa.
    let base = revision.ok ? revision.slug : '';
    let aviso = revision.ok ? null : (MOTIVOS_SLUG[revision.reason] || null);
    if (!base && slug) {
        const delTitulo = checkSlug(title);
        if (delTitulo.ok) base = delTitulo.slug;
    }
    if (!base) return { slug: null, aviso };

    try {
        // Una sola consulta: los que empiezan igual. Traer de más es barato;
        // preguntar uno por uno dentro de un bucle, no.
        const parecidos = await prisma.post.findMany({
            where: { slug: { startsWith: base }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
            select: { slug: true },
        });
        const tomados = new Set(parecidos.map(p => p.slug).filter(Boolean));
        const libre = freeSlug(base, tomados);
        if (!libre) return { slug: null, aviso: 'No se pudo liberar una dirección para este título.' };
        if (libre !== normalizeSlug(pedido)) {
            aviso = tomados.has(base)
                ? `La dirección «${base}» ya estaba usada por otra publicación; se guardó como «${libre}».`
                : aviso;
        }
        return { slug: libre, aviso };
    } catch (e) {
        // Sin poder comprobar la unicidad NO se arriesga el choque: se guarda
        // sin slug y se dice. Perder el artículo por una dirección sería peor.
        console.warn('[POST-SLUG] no se pudo comprobar la unicidad:', e?.message);
        return { slug: null, aviso: 'No se pudo comprobar si la dirección estaba libre; se guardó sin dirección amigable.' };
    }
};

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
        const resuelto = await resolvePostSlug({ slug, title });
        const post = await prisma.post.create({
            data: {
                title: title || '',
                slug: resuelto.slug || undefined,
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

        // El aviso viaja con la respuesta: la pantalla enseña la dirección
        // final, que puede no ser la que se escribió.
        res.status(201).json({ ...post, slugNotice: resuelto.aviso || null });
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

        // La dirección se vuelve a resolver sólo si llegó en la petición: un
        // guardado que no toca el slug no puede moverle la dirección a un
        // artículo que ya está circulando.
        const resuelto = slug !== undefined
            ? await resolvePostSlug({ slug, title: title || existing.title, excludeId: id })
            : { slug: existing.slug, aviso: null };

        const post = await prisma.post.update({
            where: { id },
            data: {
                title: title || existing.title,
                slug: resuelto.slug || existing.slug,
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

        res.json({ ...post, slugNotice: resuelto.aviso || null });
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

// v4.417 — Normalizador de slug de PROYECTOS. Si el slug llega vacío pero hay
// título, se genera desde el título.
//
// ⚠️ Se renombró en v4.873 porque colisionaba con el `normalizeSlug` del
// criterio compartido (`postSlug.js`), y son DOS cosas distintas hoy: éste
// corta en 80 y aquél en 75 —el ancho que declara `seoSpec.LIMITS`—. No se
// unificaron acá a propósito: cambiar el corte movería la dirección de
// proyectos ya publicados, que es otra decisión y otra prueba. Al tocar los
// slugs de proyecto, converger con `postSlug.js`.
const normalizeProjectSlug = (raw, fallback = '') => {
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
                slug: normalizeProjectSlug(slug, title),
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
                ...(slug !== undefined && { slug: normalizeProjectSlug(slug, title || existing.title) }),
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
