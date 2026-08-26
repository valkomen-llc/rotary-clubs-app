// ════════════════════════════════════════════════════════════════════
// Qué publicaciones ve cada quién — EL CRITERIO
// v4.938.0
//
// ⚠️ LA CAUSA RAÍZ DE LAS «PUBLICACIONES FANTASMA» FUE TENER DOS CRITERIOS DE
// VISIBILIDAD: uno público que conocía `targetClubIds` y uno administrativo que
// no. Una publicación centralizada se guarda con `clubId = NULL` y
// `targetClubIds = [A, B, C]`; el blog de A la recogía —su cláusula miraba el
// array— y `/admin/noticias` de A **nunca miró ese campo**, así que filtraba
// por `"clubId" = A` y no la encontraba jamás. El artículo existía, se
// publicaba, se veía en la página pública y no tenía representación
// administrativa en ninguna parte. Eso es exactamente un fantasma.
//
// Este archivo es el ÚNICO criterio, y lo consumen las DOS puntas. Es PURO
// —sin base, sin red, sin DOM— por el mismo motivo que `rbacSpec.js`,
// `seoRules.js` y `ledgerSpec.js`: un criterio de visibilidad que sólo se
// ejercita contra Postgres termina sin pruebas, y entonces nadie se entera de
// que una de las dos mitades cambió de signo — que es literalmente lo que pasó.
//
// ═════════════════════════════════════════════════════════════════════
// ⚠️ LA RELACIÓN MAESTRO ↔ RÉPLICA YA EXISTE. NO SE CREA UNA TABLA NUEVA.
// ═════════════════════════════════════════════════════════════════════
//
// `MasterArticle` + `SitePublication` es la forma que uno dibujaría en una
// pizarra, y acá sería un ERROR con precio conocido:
//
//   · Una publicación centralizada es **UNA fila** de `Post` que cada sitio
//     resuelve al leer (`targetClubIds`). Es la misma decisión que Campañas de
//     Contribución (v4.807) —«la campaña es una REFERENCIA, no un clon»— y la
//     contraria a la del ecosistema del Distrito (v4.749), donde el clon sí se
//     justifica porque el contenido pasa a ser del club de destino.
//
//   · Con N filas, corregir una cifra o despublicar serían N escrituras, y la
//     que fallara quedaría desincronizada **en silencio**. Con una fila eso no
//     se puede ni expresar.
//
//   · Y las filas YA ESTÁN ESCRITAS y son correctas. Lo que estaba roto era la
//     CONSULTA. Migrar a un modelo nuevo sería reescribir datos de producción
//     para arreglar un `WHERE` — el peor intercambio posible.
//
// La consecuencia que hay que DECIR y no esconder: con una sola fila **un
// destino no puede fallar a medias**. Publicar en tres sitios es un solo UPDATE
// de un array: entra entero o no entra. Así que «error de publicación en el
// sitio B» describe un fallo que esta arquitectura no puede tener, y fabricar
// una tabla de estado por destino para reportarlo sería inventar estado. Lo que
// sí es real, comprobable y se reporta es `desincronizado`: un destino que
// apunta a un sitio que ya no existe, o una centralizada que se quedó sin
// destinos.
// ════════════════════════════════════════════════════════════════════

/**
 * ⚠️ LA CLÁUSULA. Una sola, y la usan el público y el admin.
 *
 * `$CLUB` se sustituye por el número de parámetro que corresponda en cada
 * consulta. Las tres ramas son las tres formas legítimas de que una fila
 * pertenezca a un sitio, y están en el mismo orden que `ORIGINS`:
 *
 *   1. es del sitio (`clubId`);
 *   2. es global heredada (`clubId` NULL y SIN destinos) — se ve en todos;
 *   3. es centralizada y este sitio está entre sus destinos.
 *
 * La tercera es la que faltaba en el lado administrativo.
 */
export const POST_VISIBILITY_SQL = `(
    "clubId" = $CLUB
    OR ("clubId" IS NULL AND cardinality(COALESCE("targetClubIds", '{}'::text[])) = 0)
    OR $CLUB = ANY(COALESCE("targetClubIds", '{}'::text[]))
)`;

/** La cláusula con su parámetro puesto. Se usa así en los dos lados. */
export const visibilitySql = (paramIndex = 1) =>
    POST_VISIBILITY_SQL.replace(/\$CLUB/g, `$${paramIndex}`);

/**
 * DE DÓNDE VIENE CADA FILA.
 *
 * ⚠️ No es decoración: es lo que hace que un administrador de sitio entienda
 * por qué puede editar una y no otra, y lo que impide que borre el maestro
 * creyendo que borra su copia. Sin decirlo, una publicación replicada se ve
 * idéntica a una propia y la primera reacción ante «esto no es mío» es
 * eliminarla — y eso la borraría de los otros dos sitios.
 */
export const ORIGINS = {
    own: { key: 'own', label: 'Propia', help: 'Creada en este sitio.' },
    replicated: { key: 'replicated', label: 'Replicada', help: 'Creada en Club Platform y dirigida a este sitio. Se edita desde allá.' },
    global: { key: 'global', label: 'Global', help: 'Publicación heredada sin destinos declarados: se muestra en todos los sitios.' },
    central: { key: 'central', label: 'Central', help: 'Publicación centralizada, vista desde Club Platform.' },
    foreign: { key: 'foreign', label: 'De otro sitio', help: 'No pertenece a este sitio ni le fue dirigida.' },
};

export const ORIGIN_KEYS = Object.keys(ORIGINS);

const targetsOf = (post) =>
    Array.isArray(post?.targetClubIds) ? post.targetClubIds.filter(Boolean).map(String) : [];

const str = (v) => (v === null || v === undefined ? '' : String(v));

/**
 * ¿Qué es esta fila PARA ESTE SITIO?
 *
 * Sin `siteId` —el operador mirando el ecosistema entero— se clasifica por lo
 * que la fila ES, no por su relación con un sitio: `central` si tiene destinos,
 * `global` si no tiene ninguno y no es de nadie, `own` si es de un sitio.
 */
export const originOf = (post, siteId = null) => {
    const targets = targetsOf(post);
    const club = str(post?.clubId);
    const site = str(siteId);

    if (!site) {
        if (targets.length > 0) return ORIGINS.central.key;
        if (!club) return ORIGINS.global.key;
        return ORIGINS.own.key;
    }
    if (club && club === site) return ORIGINS.own.key;
    if (!club && targets.length === 0) return ORIGINS.global.key;
    if (targets.includes(site)) return ORIGINS.replicated.key;
    return ORIGINS.foreign.key;
};

/** ¿Se le muestra esta fila a este sitio? Es la cláusula SQL, en JavaScript. */
export const isVisibleTo = (post, siteId) => originOf(post, siteId) !== ORIGINS.foreign.key;

// ── Estados ──────────────────────────────────────────────────────────

/**
 * LOS ESTADOS, y son un catálogo CERRADO.
 *
 * ⚠️ `desincronizado` es el único que NO sale del campo `published`: se DERIVA
 * comparando los destinos con los sitios que de verdad existen. Guardarlo como
 * columna daría dos verdades sobre lo mismo que se contradirían en cuanto
 * alguien borrara un sitio — es la lección de `hasBackdrop` (v4.840) y de
 * `publicKeyOf` en Plantillas IA.
 */
export const POST_STATES = [
    { key: 'draft', label: 'Borrador', help: 'Guardada y sin publicar. No se ve en ninguna página pública.' },
    { key: 'published', label: 'Publicado', help: 'Visible en las páginas públicas que le corresponden.' },
    { key: 'orphaned', label: 'Desincronizado', help: 'Publicada, pero alguno de sus sitios destino ya no existe.' },
    { key: 'stranded', label: 'Sin destino', help: 'Centralizada y sin ningún sitio destino: no se ve en ninguna parte.' },
];

export const POST_STATE_KEYS = POST_STATES.map(s => s.key);

/**
 * El estado real de una publicación.
 *
 * `knownSiteIds` son los sitios que existen. Si no se suministran NO se inventa
 * un diagnóstico: sin ese dato no se puede saber si un destino está huérfano, y
 * afirmarlo sería inventar. Ante la ausencia se contesta lo observable
 * (`published` / `draft`), que es lo que se sabía antes.
 */
export const syncStateOf = (post, { knownSiteIds = null } = {}) => {
    const targets = targetsOf(post);
    const club = str(post?.clubId);

    if (!post?.published) return 'draft';

    // ⚠️ Centralizada que se quedó sin destinos. Es el caso que produce
    // `retireFromSite` al quitar el último sitio, y es peligroso por partida
    // doble: con `clubId` NULL y el array vacío, la cláusula de visibilidad la
    // trata como GLOBAL y pasa a verse en TODOS los sitios del ecosistema.
    // Por eso `retireFromSite` la despublica en vez de dejarla así, y por eso
    // este estado existe: para poder encontrar las que ya quedaron.
    if (!club && targets.length === 0 && post?.wasCentralized) return 'stranded';

    if (targets.length > 0 && Array.isArray(knownSiteIds)) {
        const vivos = new Set(knownSiteIds.map(String));
        if (targets.some(t => !vivos.has(t))) return 'orphaned';
    }
    return 'published';
};

/** Los destinos que apuntan a un sitio que ya no existe. */
export const orphanTargets = (post, knownSiteIds) => {
    if (!Array.isArray(knownSiteIds)) return [];
    const vivos = new Set(knownSiteIds.map(String));
    return targetsOf(post).filter(t => !vivos.has(t));
};

// ── Quién puede qué ──────────────────────────────────────────────────

const OPERATOR_ROLES = ['administrator', 'superadmin'];

export const isOperator = (user) => OPERATOR_ROLES.includes(str(user?.role));

/**
 * ¿Puede EDITAR el contenido de esta publicación?
 *
 * ⚠️ Una réplica NO se edita desde el sitio destino, y es el punto H del
 * pedido: el contenido maestro y la publicación de cada sitio son cosas
 * distintas. Dejar editar la réplica desde A cambiaría lo que ven B y C sin que
 * nadie de B ni de C lo hubiera pedido — que es peor que no poder editarla.
 * Una global heredada tampoco: se ve en todos los sitios.
 */
export const canEditPost = (user, post, siteId = null) => {
    if (isOperator(user)) return true;
    return originOf(post, siteId || user?.clubId) === ORIGINS.own.key;
};

/**
 * ¿Puede RETIRAR esta publicación de SU sitio?
 *
 * Retirar no es eliminar: quita el sitio de la lista de destinos y deja el
 * maestro intacto para los demás. Es la operación que le corresponde a un
 * administrador de sitio sobre algo que no es suyo.
 */
export const canRetireFromSite = (user, post, siteId = null) => {
    const site = str(siteId || user?.clubId);
    if (!site) return false;
    return originOf(post, site) === ORIGINS.replicated.key;
};

/**
 * ¿Puede ELIMINAR la fila maestra?
 *
 * ⚠️ Sólo lo propio, y el operador. Una réplica borrada desde el sitio A
 * desaparecería también de B y de C: es el borrado en cascada accidental que el
 * punto H manda evitar. Una global heredada tampoco la borra un sitio.
 */
export const canDeletePost = (user, post, siteId = null) => {
    if (isOperator(user)) return true;
    return originOf(post, siteId || user?.clubId) === ORIGINS.own.key;
};

/**
 * QUÉ OPERACIÓN LE TOCA A ESTA FILA CUANDO ALGUIEN PULSA «ELIMINAR».
 *
 * Es un solo punto de decisión a propósito: escrito a mano en la pantalla y
 * otra vez en el endpoint, uno de los dos se equivoca y el fallo es caro —
 * borrar el maestro desde un sitio destino se lleva la publicación de los
 * otros dos—.
 */
export const removalIntent = (user, post, siteId = null) => {
    const site = str(siteId || user?.clubId);
    const origen = originOf(post, site);
    if (canDeletePost(user, post, site) && (isOperator(user) || origen === ORIGINS.own.key)) {
        return { action: 'delete', label: 'Eliminar', help: 'Borra la publicación definitivamente.' };
    }
    if (canRetireFromSite(user, post, site)) {
        return {
            action: 'retire',
            label: 'Retirar de este sitio',
            help: 'Deja de mostrarse en este sitio. La publicación sigue existiendo en Club Platform y en los demás sitios donde fue publicada.',
        };
    }
    return {
        action: 'none',
        label: null,
        help: origen === ORIGINS.global.key
            ? 'Es una publicación global del ecosistema: se administra desde Club Platform.'
            : 'No tienes permiso sobre esta publicación.',
    };
};

/**
 * ⚠️ QUITAR EL ÚLTIMO DESTINO NO PUEDE DEJARLA GLOBAL.
 *
 * Con `clubId` NULL y `targetClubIds` vacío, la cláusula de visibilidad la lee
 * como una GLOBAL HEREDADA: retirar la publicación del último sitio la haría
 * aparecer en TODOS los sitios del ecosistema, que es exactamente lo contrario
 * de lo que pidió quien la retiró. Se despublica, se dice, y el maestro se
 * conserva para poder volver a dirigirla.
 */
export const retirePlan = (post, siteId) => {
    const site = str(siteId);
    const targets = targetsOf(post);
    if (!targets.includes(site)) {
        return { ok: false, reason: 'Esta publicación no está dirigida a este sitio.' };
    }
    const quedan = targets.filter(t => t !== site);
    if (quedan.length === 0) {
        return {
            ok: true,
            targets: [],
            unpublish: true,
            notice: 'Era el último sitio donde estaba publicada, así que la publicación quedó despublicada en Club Platform en vez de pasar a verse en todos los sitios. Su contenido se conserva.',
        };
    }
    return { ok: true, targets: quedan, unpublish: false, notice: null };
};

// ── El alcance del listado administrativo ────────────────────────────

/**
 * ⚠️ QUÉ FILAS DEVUELVE EL LISTADO DE `/admin/noticias`.
 *
 * Tres alcances y ninguno es «todo por si acaso»:
 *
 *   · `all`  — el operador de la plataforma SIN sitio elegido. Es el centro de
 *              control del punto A: ve el ecosistema entero.
 *   · `site` — un sitio concreto. Devuelve lo suyo, lo que le fue dirigido y lo
 *              global heredado. **Esta rama es la corrección**: hasta v4.937
 *              no miraba `targetClubIds`.
 *   · `none` — sin sitio y sin ser operador. No se devuelve nada, en vez de
 *              devolver un 400 que la pantalla pinta como «0 noticias».
 *
 * ⚠️ Y SE CIERRA LA FUGA INVERSA. El listado anterior añadía `OR "clubId" IS
 * NULL` para los roles `administrator` y `editor`: eso le daba a CUALQUIER
 * editor todas las publicaciones centralizadas del ecosistema, incluidas las
 * dirigidas a otros sitios, con sus botones de editar y eliminar al lado. El
 * aislamiento va en el `WHERE`, no en la pantalla (v4.932).
 */
export const adminScopeFor = (user, { requestedSiteId = null } = {}) => {
    if (isOperator(user)) {
        const site = str(requestedSiteId);
        return site
            ? { mode: 'site', siteId: site, reason: 'El operador pidió este sitio.' }
            : { mode: 'all', siteId: null, reason: 'Operador de la plataforma: el ecosistema entero.' };
    }
    const site = str(user?.clubId);
    if (!site) {
        return {
            mode: 'none',
            siteId: null,
            reason: 'Esta sesión no está asociada a ningún sitio, así que no hay publicaciones que listar.',
        };
    }
    return { mode: 'site', siteId: site, reason: 'Las publicaciones de este sitio y las que le fueron dirigidas.' };
};

/**
 * La fila tal como la ve la pantalla: con su origen, sus destinos y su estado.
 *
 * Se DERIVA de la fila, no se guarda: guardar el origen daría dos verdades que
 * se contradirían en cuanto alguien reasignara los destinos.
 */
export const decoratePost = (post, { siteId = null, knownSiteIds = null, siteNames = null, user = null } = {}) => {
    const origin = originOf(post, siteId);
    const targets = targetsOf(post);
    return {
        ...post,
        origin,
        originLabel: ORIGINS[origin]?.label || origin,
        targetClubIds: targets,
        targetCount: targets.length,
        targetNames: siteNames ? targets.map(t => siteNames[t] || t) : undefined,
        orphanTargets: knownSiteIds ? orphanTargets(post, knownSiteIds) : [],
        state: syncStateOf(post, { knownSiteIds }),
        // Lo que ESTA sesión puede hacer con ESTA fila. Va resuelto desde el
        // servidor: con la decisión también en la pantalla, el botón y lo que
        // responde el endpoint podrían discrepar.
        canEdit: user ? canEditPost(user, post, siteId) : undefined,
        removal: user ? removalIntent(user, post, siteId) : undefined,
    };
};

export default {
    POST_VISIBILITY_SQL, visibilitySql,
    ORIGINS, ORIGIN_KEYS, originOf, isVisibleTo,
    POST_STATES, POST_STATE_KEYS, syncStateOf, orphanTargets,
    isOperator, canEditPost, canRetireFromSite, canDeletePost, removalIntent, retirePlan,
    adminScopeFor, decoratePost,
};
