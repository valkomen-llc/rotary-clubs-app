/**
 * Meta (Facebook + Instagram) Graph API service.
 *
 * Phase 1: OAuth + account discovery. The publishing flow lives in a separate
 * module that will arrive in Phase 2.
 *
 * Key concepts:
 *
 *   - **User Access Token**: belongs to the logged-in human. Short-lived by
 *     default (~1-2 hours); we exchange it for a long-lived one (~60 days).
 *     This token CANNOT be used to publish to a Page — only to enumerate the
 *     Pages the user manages.
 *
 *   - **Page Access Token**: belongs to a Page. Returned by /me/accounts and is
 *     LONG-LIVED (never expires as long as the underlying user token doesn't
 *     expire and the user keeps their admin role on the Page). This is the
 *     token we use to publish.
 *
 *   - **Instagram Business Account**: discoverable via the Page it's linked to.
 *     IG content publishing uses the parent Page's access token; the IG user id
 *     is a separate identifier from the Page id.
 *
 * Required env: FB_APP_ID, FB_APP_SECRET. The redirect URI is computed from
 * APP_URL or NODE_ENV.
 */

const GRAPH_VERSION = 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// META_APP_ID is the public client id of the Meta Developer App. It's not a secret,
// so a default keeps the historical setup working when no env var is set.
// META_APP_SECRET must always come from env — never hardcode it.
//
// Accept both `META_APP_*` (preferred, matches what the team already has in Vercel)
// and `FB_APP_*` (historical name used in the old code) for backward compat.
const DEFAULT_APP_ID = '2190338908168499';
const getAppId = () => process.env.META_APP_ID || process.env.FB_APP_ID || DEFAULT_APP_ID;
const getAppSecret = () => process.env.META_APP_SECRET || process.env.FB_APP_SECRET || '';

const REQUIRED_SCOPES = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_metadata',
    'instagram_basic',
    'instagram_content_publish',
    'business_management'
];

export const buildAuthUrl = ({ state, redirectUri, forceReselect = true }) => {
    const params = new URLSearchParams({
        client_id: getAppId(),
        redirect_uri: redirectUri,
        scope: REQUIRED_SCOPES.join(','),
        response_type: 'code',
        state
        // Intentionally no `display: 'popup'` — we do a full-page redirect via
        // window.location.href, not an actual popup window. With display=popup
        // Facebook tries to post-message back to a non-existent opener and the
        // page ends up at "/" with a "#_=_" hash artifact (diagnosed v4.331).
    });
    // ⚠️ SIN ESTO, QUIEN YA CONECTÓ NO PUEDE AGREGAR UNA PÁGINA. A la segunda
    // vuelta Facebook no muestra la lista de activos: muestra una pantalla de
    // confirmación —«X se conectó a Club Platform» con un botón «De acuerdo»—
    // y REUTILIZA la selección anterior. El usuario cree que autorizó la
    // Página nueva, Facebook le dice que sí, y el token vuelve con las mismas
    // de antes. `rerequest` fuerza la pantalla de selección completa.
    if (forceReselect) params.set('auth_type', 'rerequest');
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
};

export const META_SCOPES = REQUIRED_SCOPES;

// Step 1: exchange the OAuth code for a short-lived user access token.
export const exchangeCodeForUserToken = async ({ code, redirectUri }) => {
    const params = new URLSearchParams({
        client_id: getAppId(),
        client_secret: getAppSecret(),
        redirect_uri: redirectUri,
        code
    });
    const url = `${GRAPH_BASE}/oauth/access_token?${params.toString()}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
        throw new Error(`Meta code→token falló: ${data.error?.message || JSON.stringify(data)}`);
    }
    return { token: data.access_token, expiresIn: data.expires_in };
};

// Step 2: upgrade the short-lived user token to a long-lived one (~60 days).
export const exchangeForLongLivedUserToken = async (shortToken) => {
    const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: getAppId(),
        client_secret: getAppSecret(),
        fb_exchange_token: shortToken
    });
    const url = `${GRAPH_BASE}/oauth/access_token?${params.toString()}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
        throw new Error(`Meta long-lived token falló: ${data.error?.message || JSON.stringify(data)}`);
    }
    const expiresAt = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null;
    return { token: data.access_token, expiresAt };
};

// Step 3: identify the human behind the user token.
export const getMetaUserProfile = async (userToken) => {
    const url = `${GRAPH_BASE}/me?fields=id,name,picture.type(large)&access_token=${encodeURIComponent(userToken)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Meta /me falló: ${data.error?.message || resp.status}`);
    return {
        id: data.id,
        name: data.name,
        avatar: data.picture?.data?.url || null
    };
};

// ── Cuánto se espera a Meta ──────────────────────────────────────────────────
// ⚠️ NINGUNA CONSULTA A UN TERCERO SIN TOPE DE TIEMPO (regla del sitio). El
// descubrimiento corre DENTRO del callback de OAuth y ahora hace varias
// llamadas: una respuesta que nunca llega deja al navegador esperando y
// termina, otra vez, en la pantalla en blanco que este módulo existe para no
// producir.
const GRAPH_TIMEOUT_MS = Number(process.env.META_GRAPH_TIMEOUT_MS || 12000);

const graphJson = async (url) => {
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
        const data = await resp.json().catch(() => ({}));
        return { ok: resp.ok, status: resp.status, data };
    } catch (e) {
        const agotado = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        const message = agotado
            ? `Meta no respondió en ${Math.round(GRAPH_TIMEOUT_MS / 1000)} s`
            : (e?.message || 'error de red');
        return { ok: false, status: 0, data: { error: { message } } };
    }
};

const PAGE_FIELDS = 'id,name,category,access_token,picture.type(large),tasks';
const MAX_VUELTAS = 10;   // páginas de resultados por arista
const MAX_NEGOCIOS = 10;  // portafolios de negocio que se recorren
const MAX_ACTIVOS = 50;   // activos autorizados que se resuelven de a uno

/** Recorre una arista PAGINADA de la Graph API y devuelve todas sus filas.
 *
 *  ⚠️ `/me/accounts` devuelve 25 por defecto. Sin seguir `paging.next`, un
 *  usuario con muchas Páginas pierde el resto EN SILENCIO: la lista sale
 *  corta y no hay ningún error que mirar. */
const recorrer = async (primeraUrl) => {
    const filas = [];
    let url = primeraUrl;
    for (let vuelta = 0; url && vuelta < MAX_VUELTAS; vuelta += 1) {
        const { ok, status, data } = await graphJson(url);
        if (!ok) throw new Error(data?.error?.message || `HTTP ${status}`);
        filas.push(...(data.data || []));
        url = data.paging?.next || null;
    }
    return filas;
};

const comoPagina = (p) => ({
    id: String(p.id),
    name: p.name,
    category: p.category || null,
    accessToken: p.access_token || null,
    avatar: p.picture?.data?.url || null,
    tasks: p.tasks || [],
});

/**
 * TODAS las Páginas que este token alcanza, por las tres vías que Meta ofrece.
 *
 * ⚠️ `/me/accounts` NO ES LA LISTA COMPLETA, y de ahí salía el defecto
 * reportado: devuelve las Páginas en las que la persona tiene un rol DIRECTO.
 * Una Página administrada a través de un PORTAFOLIO DE NEGOCIO —que es como
 * está organizada una institución— puede aparecer en la pantalla de
 * autorización de Facebook y no aparecer nunca en esa arista. El resultado es
 * el peor posible: el usuario la marca, Facebook confirma, y la Página no
 * llega. Por eso se recorren además `/{negocio}/owned_pages` y
 * `/{negocio}/client_pages`, y se junta todo por id de Página.
 *
 * Devuelve además de dónde salió cada cosa (`sources`) y qué no se pudo leer
 * (`notes`): sin eso, «la Página que necesito no está» no se puede
 * diagnosticar sin acceso a la cuenta de Meta de otra persona.
 */
/**
 * Los identificadores que la autorización ACABA de conceder.
 *
 * ⚠️ ES LA ÚNICA FUENTE QUE HABLA DE ESTA AUTORIZACIÓN, y por eso se agrega.
 * `/me/accounts` responde «qué Páginas administra esta persona» y las aristas
 * de un portafolio, «qué Páginas hay dentro de este negocio»: las dos son
 * preguntas sobre la CUENTA, no sobre el permiso que se acaba de dar. Con
 * Facebook Login for Business la concesión se hace por ACTIVO —se marca una
 * Página en una lista— y esa elección viaja en `granular_scopes`, con el id
 * exacto de cada activo en `target_ids`. Un caso medido: la pantalla de
 * Facebook dice «Se seleccionó 1 Página», el usuario pulsa Guardar, y
 * `/me/accounts` devuelve CERO mientras el portafolio que sí se lee —otro—
 * devuelve dos Páginas que no son ésa.
 *
 * Devuelve los ids SIN interpretar a qué espacio pertenecen. Meta ha
 * cambiado, entre versiones y entre permisos, si `instagram_basic` enumera
 * ids de Página o de cuenta de Instagram: deducirlo del nombre del permiso
 * sería adivinar. Quien llama prueba cada id contra la Graph API y se queda
 * con lo que de verdad resulte ser una Página.
 */
export const readGranularScopes = async (userToken) => {
    // ⚠️ `granular_scopes` NO ES UN CAMPO DE `/me`, Y PEDIRLO AHÍ NO FALLA
    // COMO UNA CONSULTA VACÍA: Meta contesta «(#100) Tried accessing
    // nonexisting field (granular_scopes)». Medido en producción el
    // 13/09/2026. Vive en la respuesta de `/debug_token`, que es lo que
    // inspecciona un token y devuelve, además de sus permisos, los ids de los
    // activos que cada permiso alcanza.
    const secreto = getAppSecret();
    if (!secreto) {
        // Sin el secreto de la aplicación no se puede inspeccionar el token.
        // Se dice con esas palabras en vez de devolver una lista vacía, que
        // se leería como «esta autorización no concedió nada».
        throw new Error('falta META_APP_SECRET: sin él no se puede inspeccionar qué activos concedió la autorización');
    }
    const appToken = `${getAppId()}|${secreto}`;
    // ⚠️ ESTA DIRECCIÓN LLEVA EL TOKEN DE USUARIO Y EL SECRETO DE LA
    // APLICACIÓN. No se registra, ni entera ni recortada, ni siquiera al
    // fallar: lo único que se propaga es el mensaje que devuelve Meta.
    const { ok, status, data } = await graphJson(
        `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(userToken)}`
        + `&access_token=${encodeURIComponent(appToken)}`
    );
    if (!ok) throw new Error(data?.error?.message || `HTTP ${status}`);
    const filas = Array.isArray(data?.data?.granular_scopes) ? data.data.granular_scopes : [];
    const porId = new Map();
    for (const fila of filas) {
        const permiso = String(fila?.scope || '').trim();
        for (const raw of (Array.isArray(fila?.target_ids) ? fila.target_ids : [])) {
            const id = String(raw || '').trim();
            if (!id) continue;
            const previa = porId.get(id) || { id, scopes: [] };
            if (permiso && !previa.scopes.includes(permiso)) previa.scopes.push(permiso);
            porId.set(id, previa);
        }
    }
    return [...porId.values()];
};

export const discoverUserPages = async (userToken) => {
    const tok = encodeURIComponent(userToken);
    const porId = new Map();
    const fuentes = [];
    const avisos = [];

    const sumar = (fila, fuente) => {
        const p = comoPagina(fila);
        if (!p.id) return;
        const previa = porId.get(p.id);
        if (!previa) {
            porId.set(p.id, { ...p, sources: [fuente] });
            return;
        }
        // Se conserva lo primero que llegó y se RELLENA lo que falte: una
        // arista puede traer la Página sin su token y otra con él.
        previa.accessToken = previa.accessToken || p.accessToken;
        previa.name = previa.name || p.name;
        previa.category = previa.category || p.category;
        previa.avatar = previa.avatar || p.avatar;
        if (!previa.tasks?.length && p.tasks?.length) previa.tasks = p.tasks;
        if (!previa.sources.includes(fuente)) previa.sources.push(fuente);
    };

    // 1) Rol directo sobre la Página. Es la fuente principal: si falla, se
    //    propaga — no hay nada que sincronizar.
    const filasDirectas = await recorrer(
        `${GRAPH_BASE}/me/accounts?fields=${PAGE_FIELDS}&limit=100&access_token=${tok}`
    ).catch((e) => { throw new Error(`Meta /me/accounts falló: ${e.message}`); });
    filasDirectas.forEach((p) => sumar(p, 'rol directo'));
    fuentes.push({ source: 'me/accounts', count: filasDirectas.length });

    // 2) Portafolios de negocio. Que esto falle NO puede costar la
    //    sincronización: lo de la vía directa ya sirve. Se anota y se sigue.
    let negocios = [];
    try {
        negocios = await recorrer(`${GRAPH_BASE}/me/businesses?fields=id,name&limit=50&access_token=${tok}`);
        fuentes.push({ source: 'me/businesses', count: negocios.length });
    } catch (e) {
        avisos.push({
            code: 'businesses_unreachable',
            title: 'Portafolios de negocio',
            reason: `No se pudieron leer los portafolios de negocio: ${e.message}`,
            fix: 'Si la Página que falta pertenece a un portafolio de Meta Business, volvé a conectar y concedé también el permiso «business_management».',
        });
    }

    if (negocios.length > MAX_NEGOCIOS) {
        avisos.push({
            code: 'businesses_truncated',
            title: 'Portafolios de negocio',
            reason: `Esta cuenta tiene ${negocios.length} portafolios y se recorrieron los primeros ${MAX_NEGOCIOS}.`,
            fix: 'Si la Página que falta está en otro portafolio, conectá desde una cuenta con rol directo sobre esa Página.',
        });
        negocios = negocios.slice(0, MAX_NEGOCIOS);
    }

    for (const negocio of negocios) {
        for (const arista of ['owned_pages', 'client_pages']) {
            try {
                const filas = await recorrer(
                    `${GRAPH_BASE}/${negocio.id}/${arista}?fields=${PAGE_FIELDS}&limit=100&access_token=${tok}`
                );
                const etiqueta = `${negocio.name || negocio.id} · ${arista === 'owned_pages' ? 'propias' : 'de cliente'}`;
                filas.forEach((p) => sumar(p, etiqueta));
                if (filas.length) fuentes.push({ source: `${negocio.id}/${arista}`, count: filas.length });
            } catch (e) {
                avisos.push({
                    code: 'business_pages_unreachable',
                    title: negocio.name || negocio.id,
                    reason: `No se pudieron leer las Páginas de este portafolio (${arista}): ${e.message}`,
                    fix: 'Suele significar que la autorización no incluyó este portafolio. Volvé a pulsar «Conectar Meta» y elegilo en la pantalla de Facebook.',
                });
            }
        }
    }

    // 3) ⚠️ LO QUE ESTA AUTORIZACIÓN CONCEDIÓ, id por id. Va DESPUÉS de las
    //    otras dos para no pedir por su cuenta lo que ya llegó en lote, y es
    //    la que resuelve el caso reportado: Facebook enseña la lista, se marca
    //    la Página, y ni `/me/accounts` ni el portafolio la devuelven.
    //
    //    Cada id se prueba contra la Graph API y se queda el que responda
    //    como Página. Un id de Instagram —o cualquier otro activo— no casa y
    //    se anota: sirve para contar qué se autorizó, no para inventar una
    //    Página que no existe.
    let concedidos = [];
    try {
        concedidos = await readGranularScopes(userToken);
        if (concedidos.length) fuentes.push({ source: 'me/granular_scopes', count: concedidos.length });
    } catch (e) {
        avisos.push({
            code: 'granular_scopes_unreachable',
            title: 'Activos autorizados',
            reason: `No se pudo leer qué activos concedió esta autorización: ${e.message}`,
            fix: 'Volvé a pulsar «Conectar Meta». Si se repite, el permiso de la aplicación en Meta no está devolviendo la selección por activo.',
        });
    }

    const sinResolver = [];
    for (const activo of concedidos.slice(0, MAX_ACTIVOS)) {
        if (porId.has(activo.id)) {
            const previa = porId.get(activo.id);
            if (!previa.sources.includes('autorizado')) previa.sources.push('autorizado');
            continue;
        }
        let ficha = await graphJson(
            `${GRAPH_BASE}/${activo.id}?fields=${PAGE_FIELDS}&access_token=${tok}`
        );
        // ⚠️ SI EL SONDEO COMPLETO FALLA SE VUELVE A PEDIR LO MÍNIMO. Pedir
        // `access_token` puede hacer fallar la consulta ENTERA cuando ese
        // campo no está concedido, y entonces una Página autorizada se
        // clasificaría como «no es una Página» y desaparecería sin motivo.
        // Sin token no se puede publicar —eso lo dice el paso siguiente— pero
        // la Página tiene que llegar para poder decirlo.
        if (!ficha.ok) {
            ficha = await graphJson(`${GRAPH_BASE}/${activo.id}?fields=id,name&access_token=${tok}`);
        }
        // Una Página se reconoce porque la Graph API la devuelve con nombre.
        // Sin él no se afirma nada: puede ser una cuenta de Instagram, un
        // catálogo o un activo de otra clase.
        if (ficha.ok && ficha.data?.id && ficha.data?.name) sumar(ficha.data, 'autorizado');
        else sinResolver.push(activo);
    }
    if (sinResolver.length) {
        fuentes.push({ source: 'granular_scopes sin resolver', count: sinResolver.length });
    }

    // 4) Una Página sin token de Página NO SE PUEDE PUBLICAR. Se pide por su
    //    cuenta antes de darla por perdida, y si no llega se DICE: dejarla
    //    fuera en silencio es exactamente el reporte que originó esto.
    for (const p of porId.values()) {
        if (p.accessToken) continue;
        const { ok, data } = await graphJson(
            `${GRAPH_BASE}/${p.id}?fields=access_token&access_token=${tok}`
        );
        if (ok && data?.access_token) p.accessToken = data.access_token;
        if (!p.accessToken) {
            // ⚠️ UNA PÁGINA QUE NADIE MARCÓ NO ES UN PROBLEMA QUE REPORTAR.
            // Un portafolio devuelve TODAS sus Páginas, y de ésas sólo llega
            // con token la que se autorizó: anotar las demás llena la
            // pantalla de avisos que apuntan al sitio equivocado —«marcá esta
            // Página» sobre una que nadie quiso— y esconde el que importa.
            // Sólo se puede distinguir cuando se sabe qué se concedió; sin
            // esa lista se anotan todas, que es el lado seguro.
            if (concedidos.length && !concedidos.some((a) => a.id === p.id)) continue;
            avisos.push({
                code: 'page_without_token',
                title: p.name || p.id,
                pageId: p.id,
                pageName: p.name,
                reason: 'Meta mostró esta Página pero no entregó su token de publicación.',
                fix: 'La autorización tiene que incluir esta Página con permiso para crear publicaciones. Volvé a pulsar «Conectar Meta» y marcala en la pantalla de Facebook.',
            });
        }
    }

    const pages = [...porId.values()].filter((p) => p.accessToken);

    // ⚠️ CERO PÁGINAS NO ES UN RESULTADO NEUTRO: SE DICE. Sin este aviso, la
    // pantalla queda en «SIN CONEXIÓN» y eso no distingue «nunca se conectó»
    // de «se conectó y Meta no devolvió nada», que es el reporte que originó
    // esta versión.
    if (!pages.length) {
        avisos.push({
            code: 'sin_paginas',
            title: 'Meta no devolvió ninguna Página',
            reason: concedidos.length
                ? `La autorización concedió ${concedidos.length} activo(s) y ninguno resultó ser una Página que esta aplicación pueda publicar.`
                : 'Ni las Páginas de la cuenta, ni las de sus portafolios, ni los activos de esta autorización devolvieron una Página.',
            fix: 'Volvé a pulsar «Conectar Meta» y marcá la Página en la pantalla de Facebook. Si ya la marcaste, el rol sobre esa Página tiene que incluir permiso para crear publicaciones.',
        });
    }

    return {
        pages,
        sources: fuentes,
        notes: avisos,
        // Qué activos concedió ESTA autorización, sin tokens. Es lo que
        // permite contestar «lo marqué en Facebook» con un número.
        granted: concedidos.map((a) => ({ id: a.id, scopes: a.scopes })),
        unresolved: sinResolver.map((a) => ({ id: a.id, scopes: a.scopes })),
    };
};

// Step 4: enumerate every Page the user manages, each with its own long-lived
// Page Access Token. This is what we'll persist for publishing.
export const getUserPages = async (userToken) => (await discoverUserPages(userToken)).pages;

// Step 5: for a given Page, check if it has an Instagram Business account
// linked. Returns null if not linked.
export const getInstagramBusinessForPage = async ({ pageId, pageAccessToken }) => {
    const url = `${GRAPH_BASE}/${pageId}?fields=instagram_business_account{id,username,name,profile_picture_url,followers_count}&access_token=${encodeURIComponent(pageAccessToken)}`;
    // Con tope de tiempo: esto corre una vez POR PÁGINA dentro del callback.
    const { ok, status, data } = await graphJson(url);
    if (!ok) {
        console.warn(`[meta] IG lookup falló para page ${pageId}:`, data?.error?.message || status);
        return null;
    }
    const ig = data.instagram_business_account;
    if (!ig) return null;
    return {
        id: ig.id,
        username: ig.username,
        name: ig.name || ig.username,
        avatar: ig.profile_picture_url || null,
        followersCount: ig.followers_count || 0
    };
};

// Lightweight liveness check used by the verifyAccount endpoint. Returns true
// if the token can still hit /me (page tokens identify the Page itself).
export const verifyToken = async (token) => {
    try {
        const resp = await fetch(`${GRAPH_BASE}/me?access_token=${encodeURIComponent(token)}`);
        if (!resp.ok) return false;
        const data = await resp.json();
        return !!data.id;
    } catch {
        return false;
    }
};
