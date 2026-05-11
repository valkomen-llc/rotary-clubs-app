/**
 * Social Publish Service
 * Module: Content Studio AI
 *
 * Publica videos cortos (Reels) a Meta (Instagram Business + Facebook Page).
 * Cada función devuelve `{ success, platformPostId, error }`.
 *
 * Referencia oficial:
 *  - Instagram Reels: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 *  - Facebook Page Video / Reels: https://developers.facebook.com/docs/video-api/guides/publishing
 */

const META_API = 'https://graph.facebook.com/v19.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollContainerStatus(containerId, accessToken, { maxAttempts = 20, intervalMs = 3000 } = {}) {
    for (let i = 0; i < maxAttempts; i++) {
        const url = `${META_API}/${containerId}?fields=status_code,status&access_token=${accessToken}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Error consultando container Meta');

        if (data.status_code === 'FINISHED') return data;
        if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
            throw new Error(`Meta container falló: ${data.status || data.status_code}`);
        }
        await sleep(intervalMs);
    }
    throw new Error('Timeout esperando que Meta termine de procesar el video');
}

export async function publishToInstagram(account, { videoUrl, caption }) {
    try {
        if (!account?.platformId) throw new Error('Cuenta Instagram sin platformId (IG Business ID)');
        if (!videoUrl) throw new Error('videoUrl requerido');

        const createUrl = `${META_API}/${account.platformId}/media`;
        const createRes = await fetch(createUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media_type: 'REELS',
                video_url: videoUrl,
                caption: caption || '',
                share_to_feed: true,
                access_token: account.accessToken,
            }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData?.error?.message || 'Error creando container IG');

        await pollContainerStatus(createData.id, account.accessToken);

        const publishUrl = `${META_API}/${account.platformId}/media_publish`;
        const publishRes = await fetch(publishUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: createData.id,
                access_token: account.accessToken,
            }),
        });
        const publishData = await publishRes.json();
        if (!publishRes.ok) throw new Error(publishData?.error?.message || 'Error publicando IG Reel');

        return { success: true, platformPostId: publishData.id };
    } catch (error) {
        console.error('[publishToInstagram] error:', error.message);
        return { success: false, error: error.message };
    }
}

export async function publishToFacebook(account, { videoUrl, caption }) {
    try {
        if (!account?.platformId) throw new Error('Cuenta Facebook sin platformId (Page ID)');
        if (!videoUrl) throw new Error('videoUrl requerido');

        const url = `${META_API}/${account.platformId}/videos`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_url: videoUrl,
                description: caption || '',
                access_token: account.accessToken,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Error publicando video en Facebook');

        return { success: true, platformPostId: data.id || data.post_id };
    } catch (error) {
        console.error('[publishToFacebook] error:', error.message);
        return { success: false, error: error.message };
    }
}

export async function publishPost(account, payload) {
    switch (account.platform) {
        case 'instagram':
            return publishToInstagram(account, payload);
        case 'facebook':
            return publishToFacebook(account, payload);
        default:
            return { success: false, error: `Plataforma "${account.platform}" todavía no soportada para publicación` };
    }
}
