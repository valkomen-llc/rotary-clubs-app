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

const GRAPH_VERSION = 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
// v4.403: para cuentas IG conectadas por Instagram Login directo, probamos
// graph.facebook.com/v23.0 primero (el host clásico para IG Business publishing,
// que acepta IG User Tokens con el scope correcto). graph.instagram.com/v23.0
// (v4.401) rechazaba el endpoint con "Unsupported request - method type: post"
// — Meta no expone publishing en ese host bajo esa versión.
const IG_GRAPH_BASE = 'https://graph.facebook.com/v23.0';

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
    if (!resp.ok || data.error) {
        return { ok: false, error: data.error?.message || `HTTP ${resp.status}` };
    }
    return {
        ok: true,
        externalId: data.id || data.post_id || null,
        externalUrl: data.id ? `https://www.facebook.com/${data.id}` : null,
        raw: data
    };
};

// Instagram: 2-step container creation then publish, with a short polling loop
// in between because the container may need a moment for Meta to fetch the URL.
// v4.401: `useInstagramGraph` selecciona el host:
//   - true  → graph.instagram.com/v23.0 (para cuentas conectadas por IG Login directo,
//             donde el accessToken es un IG User Token).
//   - false → graph.facebook.com/v18.0  (para cuentas IG vinculadas a una FB Page,
//             donde el accessToken es un Page Access Token).
const publishToInstagramBusiness = async ({ igUserId, pageAccessToken, imageUrl, caption, useInstagramGraph = false }) => {
    const base = useInstagramGraph ? IG_GRAPH_BASE : GRAPH_BASE;
    console.log(`[publish] IG → base=${base}, igUserId=${igUserId} (directConnect=${useInstagramGraph})`);
    // Step 1: create the container.
    const createParams = new URLSearchParams({
        image_url: imageUrl,
        caption: caption || '',
        access_token: pageAccessToken
    });
    const createResp = await fetch(`${base}/${igUserId}/media`, {
        method: 'POST',
        body: createParams
    });
    const createData = await createResp.json();
    if (!createResp.ok || createData.error || !createData.id) {
        return { ok: false, error: createData.error?.message || `Container falló: HTTP ${createResp.status}` };
    }
    const creationId = createData.id;

    // Step 2: poll for FINISHED state. Most single-image containers settle in
    // 1-5s; cap at 25s to keep within Vercel's function limits.
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
        const statusResp = await fetch(`${base}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(pageAccessToken)}`);
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
    const publishResp = await fetch(`${base}/${igUserId}/media_publish`, {
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
