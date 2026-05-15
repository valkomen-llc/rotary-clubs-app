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

const REQUIRED_SCOPES = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_metadata',
    'instagram_basic',
    'instagram_content_publish',
    'business_management'
];

export const buildAuthUrl = ({ state, redirectUri }) => {
    const appId = process.env.FB_APP_ID;
    if (!appId) throw new Error('FB_APP_ID no configurada');
    const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        scope: REQUIRED_SCOPES.join(','),
        response_type: 'code',
        state,
        display: 'popup'
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
};

export const META_SCOPES = REQUIRED_SCOPES;

// Step 1: exchange the OAuth code for a short-lived user access token.
export const exchangeCodeForUserToken = async ({ code, redirectUri }) => {
    const params = new URLSearchParams({
        client_id: process.env.FB_APP_ID || '',
        client_secret: process.env.FB_APP_SECRET || '',
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
        client_id: process.env.FB_APP_ID || '',
        client_secret: process.env.FB_APP_SECRET || '',
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

// Step 4: enumerate every Page the user manages, each with its own long-lived
// Page Access Token. This is what we'll persist for publishing.
export const getUserPages = async (userToken) => {
    const url = `${GRAPH_BASE}/me/accounts?fields=id,name,category,access_token,picture.type(large),tasks&access_token=${encodeURIComponent(userToken)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Meta /me/accounts falló: ${data.error?.message || resp.status}`);
    return (data.data || []).map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        accessToken: p.access_token,
        avatar: p.picture?.data?.url || null,
        tasks: p.tasks || []
    }));
};

// Step 5: for a given Page, check if it has an Instagram Business account
// linked. Returns null if not linked.
export const getInstagramBusinessForPage = async ({ pageId, pageAccessToken }) => {
    const url = `${GRAPH_BASE}/${pageId}?fields=instagram_business_account{id,username,name,profile_picture_url,followers_count}&access_token=${encodeURIComponent(pageAccessToken)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok) {
        console.warn(`[meta] IG lookup falló para page ${pageId}:`, data.error?.message || resp.status);
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
