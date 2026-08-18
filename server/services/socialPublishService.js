/**
 * Social Publishing — Phase 2 service.
 *
 * Helpers that post an image + caption to a connected social account via the
 * platform's official API. Each helper returns
 *   { ok: true, externalId, externalUrl?, raw }   on success, or
 *   { ok: false, error }                          on failure.
 *
 * Currently supported:
 *   - Facebook Page (single photo)         → POST /{page-id}/photos
 *   - Instagram Business (single image)    → 2-step container + publish
 *
 * Both Meta surfaces share the same Graph API host and use the same Page
 * Access Token (Instagram inherits the linked Page's token).
 */

import crypto from 'crypto';

const GRAPH_VERSION = 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
// v4.405: chain de endpoints (cada uno con o sin /me en vez de user-id) a
// intentar para IG-direct publishing. Meta cambió cosas y los docs no son
// definitivos. Cada intento incluye appsecret_proof.
//
//   useMePath=true → endpoint /me/media (autenticado por token, sin user-id)
//   useMePath=false → endpoint /{user-id}/media (clásico)
const IG_PUBLISH_ATTEMPTS_DIRECT = [
    { base: 'https://graph.instagram.com/v23.0', useMePath: false },
    { base: 'https://graph.instagram.com/v23.0', useMePath: true },
    { base: 'https://graph.instagram.com',       useMePath: false }, // sin versión
    { base: 'https://graph.facebook.com/v23.0',  useMePath: false },
    { base: 'https://graph.facebook.com/v18.0',  useMePath: false }
];

// HMAC-SHA256 del access_token con el app_secret. Algunos endpoints Meta
// lo requieren para autenticar la app además del usuario. Sin este param,
// puede devolver "Invalid OAuth access token - Cannot parse access token"
// como error genérico.
const buildAppsecretProof = (accessToken, appSecret) => {
    if (!accessToken || !appSecret) return null;
    return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
};

// v4.864 — El error de Meta se lee ENTERO, no sólo su mensaje. `code` y
// `error_subcode` son lo que permite distinguir un límite de un permiso y de un
// bloqueo por política, y de esa distinción depende si la cola reintenta, pausa
// la campaña o se detiene. Convertirlo en "no se pudo publicar" deja a quien
// corrige sin saber cuál de las tres cosas pasó — la regla que el CRM ya
// aprendió con metaCode / metaDetails.
const readMetaError = (resp, data) => ({
    ok: false,
    error: data?.error?.message || `HTTP ${resp?.status ?? '???'}`,
    code: data?.error?.code ?? null,
    subcode: data?.error?.error_subcode ?? null,
    httpStatus: resp?.status ?? null,
    fbtrace: data?.error?.fbtrace_id || null,
    raw: data,
});

// Compose the final caption from the AI-generated breakdown. Same shape we get
// from gpt-4o: { copy, hashtags, cta }. Empty pieces are skipped so we don't
// emit stray blank lines.
const composeCaption = (block) => {
    if (!block) return '';
    return [block.copy, block.hashtags, block.cta]
        .map(s => (s || '').trim())
        .filter(Boolean)
        .join('\n\n');
};

// Facebook: single-photo post to a Page. Caption goes in the `caption` field.
const publishToFacebookPage = async ({ pageId, pageAccessToken, imageUrl, caption }) => {
    const url = `${GRAPH_BASE}/${pageId}/photos`;
    const params = new URLSearchParams({
        url: imageUrl,
        caption: caption || '',
        access_token: pageAccessToken
    });
    const resp = await fetch(url, { method: 'POST', body: params });
    const data = await resp.json();
    if (!resp.ok || data.error) return readMetaError(resp, data);
    return {
        ok: true,
        externalId: data.id || data.post_id || null,
        externalUrl: data.id ? `https://www.facebook.com/${data.id}` : null,
        raw: data
    };
};

// Helper: intenta crear el container con una config específica. Devuelve
// { ok, creationId, error, base, useMePath }.
const tryCreateIgContainer = async ({ base, useMePath, igUserId, accessToken, imageUrl, caption, appsecretProof }) => {
    const params = new URLSearchParams({
        image_url: imageUrl,
        caption: caption || '',
        access_token: accessToken
    });
    if (appsecretProof) params.set('appsecret_proof', appsecretProof);
    const pathId = useMePath ? 'me' : igUserId;
    const resp = await fetch(`${base}/${pathId}/media`, {
        method: 'POST',
        body: params
    });
    const data = await resp.json();
    if (!resp.ok || data.error || !data.id) {
        return { ok: false, error: data.error?.message || `HTTP ${resp.status}`, base, useMePath };
    }
    return { ok: true, creationId: data.id, base, useMePath };
};

// Instagram: 2-step container creation then publish, with a short polling loop
// in between because the container may need a moment for Meta to fetch the URL.
// v4.404: chain de endpoints + appsecret_proof. Para IG-direct probamos varios
// hosts/versiones porque Meta cambió cosas y los docs están desactualizados.
const publishToInstagramBusiness = async ({ igUserId, pageAccessToken, imageUrl, caption, useInstagramGraph = false }) => {
    const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || process.env.FB_APP_SECRET;
    const proof = useInstagramGraph ? buildAppsecretProof(pageAccessToken, appSecret) : null;
    if (useInstagramGraph && !proof) {
        console.warn('[publish] IG → no se generó appsecret_proof (faltan env vars de app secret)');
    }

    // Step 1: create container. Para IG-direct, probamos múltiples configs en orden.
    const attemptsToTry = useInstagramGraph
        ? IG_PUBLISH_ATTEMPTS_DIRECT
        : [{ base: GRAPH_BASE, useMePath: false }];
    let lastError = null;
    let successResult = null;
    for (const attempt of attemptsToTry) {
        const pathId = attempt.useMePath ? 'me' : igUserId;
        console.log(`[publish] IG → intento ${attempt.base}/${pathId}/media (proof=${!!proof})`);
        const r = await tryCreateIgContainer({ ...attempt, igUserId, accessToken: pageAccessToken, imageUrl, caption, appsecretProof: proof });
        if (r.ok) {
            console.log(`[publish] IG → container creado OK @ ${r.base}/${r.useMePath ? 'me' : igUserId}, creationId=${r.creationId}`);
            successResult = r;
            break;
        }
        console.warn(`[publish] IG → falló @ ${attempt.base}/${pathId}: ${r.error}`);
        lastError = r.error;
    }
    if (!successResult) {
        return { ok: false, error: `Container falló en todos los hosts (${attemptsToTry.length} intentos). Último: ${lastError}` };
    }
    const { base, creationId, useMePath: successUseMePath } = successResult;
    const successPathId = successUseMePath ? 'me' : igUserId;

    // Step 2: poll for FINISHED state. Most single-image containers settle in
    // 1-5s; cap at 25s to keep within Vercel's function limits.
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
        const statusUrl = `${base}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(pageAccessToken)}` +
            (proof ? `&appsecret_proof=${proof}` : '');
        const statusResp = await fetch(statusUrl);
        const statusData = await statusResp.json();
        const code = statusData.status_code;
        if (code === 'FINISHED') break;
        if (code === 'ERROR' || code === 'EXPIRED') {
            return { ok: false, error: `Container status ${code}: ${statusData.status || ''}` };
        }
        // IN_PROGRESS / PUBLISHED — keep waiting
        await new Promise(r => setTimeout(r, 2000));
    }

    // Step 3: publish.
    const publishParams = new URLSearchParams({
        creation_id: creationId,
        access_token: pageAccessToken
    });
    if (proof) publishParams.set('appsecret_proof', proof);
    const publishResp = await fetch(`${base}/${successPathId}/media_publish`, {
        method: 'POST',
        body: publishParams
    });
    const publishData = await publishResp.json();
    if (!publishResp.ok || publishData.error || !publishData.id) {
        return { ok: false, error: publishData.error?.message || `Publish falló: HTTP ${publishResp.status}` };
    }
    return {
        ok: true,
        externalId: publishData.id,
        externalUrl: null, // IG doesn't expose a canonical URL via API; permalink requires extra call
        raw: publishData
    };
};

// Dispatcher: route to the right helper based on account platform. Returns the
// uniform shape so the controller can record the outcome regardless of provider.
export const publishToAccount = async ({ account, decryptedToken, imageUrl, copies }) => {
    const block = copies?.[account.platform] || {};
    const caption = composeCaption(block);

    if (account.platform === 'facebook') {
        return publishToFacebookPage({
            pageId: account.platformId,
            pageAccessToken: decryptedToken,
            imageUrl,
            caption
        });
    }
    if (account.platform === 'instagram') {
        // v4.401: para cuentas IG conectadas por Instagram Login directo (sin
        // Fanpage vinculada), el endpoint de publish está en graph.instagram.com
        // y acepta el IG user token. Para IG vinculado a FB Page, el endpoint
        // sigue siendo graph.facebook.com con el Page Access Token. Se decide
        // mirando account.metadata.directConnect (true = flujo IG directo).
        const isDirectConnect = !!(account.metadata && account.metadata.directConnect);
        return publishToInstagramBusiness({
            igUserId: account.platformId,
            pageAccessToken: decryptedToken,
            imageUrl,
            caption,
            useInstagramGraph: isDirectConnect
        });
    }
    return { ok: false, error: `Plataforma '${account.platform}' aún no soportada por el publisher` };
};

// ═══════════════════════════════════════════════════════════════════════════
// v4.864 — Distribución multi-destino: texto, enlace y video.
//
// Hasta v4.863 este servicio publicaba UNA sola cosa: una foto con pie. Alcanza
// para el Generador de Publicaciones y no para distribuir, donde el contenido
// puede ser un enlace a la publicación original (carril «compartir»), un texto
// suelto o un Reel ya montado.
//
// ⚠️ NO HAY NADA PARA GRUPOS ACÁ, y no es un pendiente. Meta retiró la Groups
// API el 22 de abril de 2024 de todas las versiones: no existe endpoint al que
// llamar. Un destino de tipo grupo nunca llega a este módulo — lo frena
// `publishesViaApi` en distributionSpec.js.
// ═══════════════════════════════════════════════════════════════════════════

const postToGraph = async (url, params) => {
    const resp = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.error) return readMetaError(resp, data);
    return { ok: true, data };
};

/** Texto suelto o texto + enlace en una Página. Los dos van por /feed. */
const publishFeedToPage = async ({ pageId, pageAccessToken, message, link }) => {
    const params = { access_token: pageAccessToken };
    if (message) params.message = message;
    if (link) params.link = link;
    // Meta rechaza un /feed sin nada que publicar, y el mensaje que devuelve no
    // lo explica. Se dice acá, que es donde se puede corregir.
    if (!params.message && !params.link) {
        return { ok: false, error: 'Una publicación de solo texto necesita texto.', code: null, subcode: null, httpStatus: null };
    }
    const r = await postToGraph(`${GRAPH_BASE}/${pageId}/feed`, params);
    if (!r.ok) return r;
    const id = r.data.id || null;
    return {
        ok: true,
        externalId: id,
        externalUrl: id ? `https://www.facebook.com/${id}` : null,
        raw: r.data,
    };
};

/**
 * Video en una Página, por URL.
 *
 * Se manda `file_url` y lo descarga Meta: el archivo ya vive en S3 —todo el
 * sitio sube por `uploadMediaFiles`— y subirlo por partes desde una función que
 * corta a los 300 s sería pagar dos veces el mismo tránsito. La contrapartida
 * es que la URL tiene que ser pública, que es la misma condición que ya cumple
 * Instagram.
 */
const publishVideoToPage = async ({ pageId, pageAccessToken, videoUrl, message }) => {
    const r = await postToGraph(`${GRAPH_BASE}/${pageId}/videos`, {
        file_url: videoUrl,
        description: message || '',
        access_token: pageAccessToken,
    });
    if (!r.ok) return r;
    const id = r.data.id || null;
    return {
        ok: true,
        externalId: id,
        // Un video devuelve el id del VIDEO, no el del post. El permalink real
        // exige otra llamada; no se inventa una URL que puede no resolver.
        externalUrl: id ? `https://www.facebook.com/${pageId}/videos/${id}` : null,
        raw: r.data,
    };
};

/** Video en Instagram: contenedor REELS y publicación, con la misma espera. */
const publishVideoToInstagram = async ({ igUserId, pageAccessToken, videoUrl, caption }) => {
    const create = await postToGraph(`${GRAPH_BASE}/${igUserId}/media`, {
        media_type: 'REELS',
        video_url: videoUrl,
        caption: caption || '',
        access_token: pageAccessToken,
    });
    if (!create.ok) return create;
    const creationId = create.data.id;
    if (!creationId) return { ok: false, error: 'Instagram no devolvió el contenedor del video.' };

    // Un video tarda bastante más que una foto en quedar listo. El tope lo fija
    // el presupuesto de la función, no el optimismo: agotado, se dice que sigue
    // procesando en vez de afirmar que falló.
    const deadline = Date.now() + 90_000;
    let last = 'IN_PROGRESS';
    while (Date.now() < deadline) {
        const st = await fetch(`${GRAPH_BASE}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(pageAccessToken)}`);
        const sd = await st.json().catch(() => ({}));
        last = sd.status_code || last;
        if (last === 'FINISHED') break;
        if (last === 'ERROR' || last === 'EXPIRED') {
            return { ok: false, error: `Instagram no pudo preparar el video (${last}): ${sd.status || ''}` };
        }
        await new Promise(r => setTimeout(r, 3000));
    }
    if (last !== 'FINISHED') {
        return { ok: false, error: 'Instagram sigue procesando el video. Se reintenta más tarde.', retryHint: true };
    }

    const pub = await postToGraph(`${GRAPH_BASE}/${igUserId}/media_publish`, {
        creation_id: creationId,
        access_token: pageAccessToken,
    });
    if (!pub.ok) return pub;
    return { ok: true, externalId: pub.data.id || null, externalUrl: null, raw: pub.data };
};

/**
 * El despacho de la Distribución.
 *
 * `content` = { kind, message, link, mediaUrl }. Devuelve la misma forma
 * uniforme que `publishToAccount` para que la cola registre el resultado sin
 * saber por qué proveedor pasó.
 */
export const publishContentToTarget = async ({ account, decryptedToken, content = {} }) => {
    const kind = content.kind;
    const message = (content.message || '').trim();

    if (account?.platform === 'facebook') {
        const pageId = account.platformId;
        if (kind === 'image') {
            return publishToFacebookPage({ pageId, pageAccessToken: decryptedToken, imageUrl: content.mediaUrl, caption: message });
        }
        if (kind === 'video') {
            return publishVideoToPage({ pageId, pageAccessToken: decryptedToken, videoUrl: content.mediaUrl, message });
        }
        // texto y enlace comparten endpoint
        return publishFeedToPage({ pageId, pageAccessToken: decryptedToken, message, link: kind === 'link' ? content.link : null });
    }

    if (account?.platform === 'instagram') {
        // Instagram no admite enlaces en el pie, así que un contenido de tipo
        // enlace nunca debería llegar acá: `targetSupports` lo deja fuera al
        // armar la campaña. Si llega, se dice el motivo en vez de publicar un
        // pie con una URL que nadie va a poder pulsar.
        if (kind === 'link' || kind === 'text') {
            return { ok: false, error: 'Instagram necesita una imagen o un video: no publica texto ni enlaces sueltos.' };
        }
        if (!content.mediaUrl) return { ok: false, error: 'Falta el archivo para Instagram.' };
        const isDirectConnect = !!(account.metadata && account.metadata.directConnect);
        if (kind === 'video') {
            return publishVideoToInstagram({ igUserId: account.platformId, pageAccessToken: decryptedToken, videoUrl: content.mediaUrl, caption: message });
        }
        return publishToInstagramBusiness({
            igUserId: account.platformId,
            pageAccessToken: decryptedToken,
            imageUrl: content.mediaUrl,
            caption: message,
            useInstagramGraph: isDirectConnect,
        });
    }

    return { ok: false, error: `Plataforma '${account?.platform}' no soportada por la distribución` };
};

/**
 * Publicaciones recientes de una Página — el carril «compartir».
 *
 * Meta no expone un share de API: la vía soportada es crear una publicación
 * nueva con el enlace al original, que es lo que hace la cola con el permalink
 * que devuelve esta consulta.
 */
export const listPagePosts = async ({ pageId, pageAccessToken, limit = 15 }) => {
    const url = `${GRAPH_BASE}/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture,status_type&limit=${encodeURIComponent(limit)}&access_token=${encodeURIComponent(pageAccessToken)}`;
    const resp = await fetch(url);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.error) return readMetaError(resp, data);
    return {
        ok: true,
        posts: (data.data || []).map(p => ({
            id: p.id,
            message: p.message || '',
            createdTime: p.created_time || null,
            permalink: p.permalink_url || null,
            picture: p.full_picture || null,
            statusType: p.status_type || null,
        })),
    };
};
