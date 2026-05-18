/**
 * Instagram Login API for Business — alternative connection flow.
 *
 * This is a separate OAuth flow from the Facebook one. It targets IG
 * Business / Creator accounts that are NOT linked to a Facebook Page,
 * which is common when a club has only IG without an FB presence on
 * the same Business Manager.
 *
 * Key differences vs the FB-Page-linked flow (metaService.js):
 *
 *   - Authorization host is `api.instagram.com`, not `facebook.com`.
 *   - Client id/secret are app-specific to the Instagram product
 *     configured in the Meta Developer App (separate from the FB app
 *     credentials, although they may live in the same app shell).
 *   - The token returned is an **Instagram User Access Token** —
 *     short-lived (~1 hour) but exchangeable to a long-lived one (60d,
 *     renewable). It identifies the IG user directly; there is no Page
 *     in the middle.
 *   - The publish flow remains identical: `/{ig-user-id}/media` →
 *     `/{ig-user-id}/media_publish`. The same token authorizes both.
 *
 * Required env vars:
 *   - INSTAGRAM_APP_ID
 *   - INSTAGRAM_APP_SECRET
 *
 * Setup in Meta Developer Dashboard:
 *   1. App → Products → "Instagram" → Set up (use case: Instagram API
 *      with Instagram Login)
 *   2. Add OAuth redirect URI:
 *        https://app.clubplatform.org/api/social/callback/instagram
 *   3. Scopes used here: instagram_business_basic +
 *      instagram_business_content_publish
 *   4. The connected IG account must be Business or Creator (not
 *      Personal). The user grants the permission inside Instagram, not
 *      inside Business Manager.
 */

const GRAPH_VERSION = 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
// v4.395: el host de authorize es www.instagram.com (UI de Meta lo confirma).
// El intercambio de código y los endpoints graph siguen estando en api.instagram.com
// y graph.instagram.com respectivamente.
const IG_AUTHORIZE_HOST = 'https://www.instagram.com';
const IG_TOKEN_HOST = 'https://api.instagram.com';
const IG_GRAPH_HOST = 'https://graph.instagram.com';

const getIgAppId = () => process.env.INSTAGRAM_APP_ID || '';
const getIgAppSecret = () => process.env.INSTAGRAM_APP_SECRET || '';

const REQUIRED_IG_SCOPES = [
    'instagram_business_basic',
    'instagram_business_content_publish'
];

export const IG_LOGIN_SCOPES = REQUIRED_IG_SCOPES;

export const hasIgLoginCredentials = () => !!getIgAppId() && !!getIgAppSecret();

export const buildIgAuthUrl = ({ state, redirectUri }) => {
    const params = new URLSearchParams({
        client_id: getIgAppId(),
        redirect_uri: redirectUri,
        scope: REQUIRED_IG_SCOPES.join(','),
        response_type: 'code',
        state,
        // v4.396: force_reauth=true asegura que IG pida consent fresh cada vez,
        // sin usar autorizaciones almacenadas previas (que podrían apuntar a
        // un redirect URI viejo).
        force_reauth: 'true'
    });
    return `${IG_AUTHORIZE_HOST}/oauth/authorize?${params.toString()}`;
};

// Step 1: exchange the OAuth code for a short-lived IG user access token.
// Note: this hits `api.instagram.com/oauth/access_token`, NOT the Graph API.
// v4.396: stripeamos el sufijo "#_" que Meta adjunta al code en la redirect.
export const exchangeCodeForIgToken = async ({ code, redirectUri }) => {
    const cleanCode = String(code || '').replace(/#_$/, '');
    const form = new URLSearchParams({
        client_id: getIgAppId(),
        client_secret: getIgAppSecret(),
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: cleanCode
    });
    const resp = await fetch(`${IG_TOKEN_HOST}/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form
    });
    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
        throw new Error(`Instagram code→token falló: ${data.error_message || data.error?.message || JSON.stringify(data)}`);
    }
    return {
        token: data.access_token,
        userId: data.user_id ? String(data.user_id) : null,
        permissions: data.permissions || REQUIRED_IG_SCOPES
    };
};

// Step 2: exchange the short-lived token for a long-lived one (~60 days).
// This call goes to `graph.instagram.com`, not the FB Graph.
export const exchangeForLongLivedIgToken = async (shortToken) => {
    const params = new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: getIgAppSecret(),
        access_token: shortToken
    });
    const resp = await fetch(`${IG_GRAPH_HOST}/access_token?${params.toString()}`);
    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
        throw new Error(`Instagram long-lived token falló: ${data.error?.message || JSON.stringify(data)}`);
    }
    const expiresAt = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null;
    return { token: data.access_token, expiresAt };
};

// Step 3: fetch the IG account profile to populate UI metadata.
// The endpoint /me returns: id, user_id, username, account_type, profile_picture_url.
// We use `graph.instagram.com` (IG Graph) because the token is an IG user token.
export const getIgUserProfile = async (igToken) => {
    const fields = 'id,user_id,username,account_type,profile_picture_url';
    const resp = await fetch(`${IG_GRAPH_HOST}/me?fields=${fields}&access_token=${encodeURIComponent(igToken)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Instagram /me falló: ${data.error?.message || resp.status}`);
    return {
        id: data.id || data.user_id ? String(data.id || data.user_id) : null,
        username: data.username || null,
        accountType: data.account_type || null,
        avatar: data.profile_picture_url || null
    };
};

// Convenience verify hook used by the verifyAccount endpoint for IG-direct accounts.
export const verifyIgToken = async (token) => {
    try {
        const resp = await fetch(`${IG_GRAPH_HOST}/me?fields=id&access_token=${encodeURIComponent(token)}`);
        if (!resp.ok) return false;
        const data = await resp.json();
        return !!(data.id || data.user_id);
    } catch {
        return false;
    }
};

// The publish endpoints (/{ig-user-id}/media, /{ig-user-id}/media_publish) live
// under graph.facebook.com but accept the IG user token directly. The existing
// publishToInstagramBusiness in socialPublishService.js works as-is.
export { GRAPH_BASE };
