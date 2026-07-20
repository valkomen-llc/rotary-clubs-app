/**
 * Social Publishing — controller (Phase 1 + Phase 2).
 *
 * Endpoints exposed:
 *
 *   GET    /api/social/connect/meta            → returns the OAuth URL
 *   GET    /api/social/callback/meta           → OAuth callback (public, comes from Facebook)
 *   GET    /api/social/accounts                → list connected accounts for the user's club
 *   POST   /api/social/accounts/:id/verify     → ping token, update status
 *   DELETE /api/social/accounts/:id            → disconnect / forget the account
 *   POST   /api/social/publish                 → publish a post to one or more accounts (Phase 2)
 *
 * Phase 1 captures LONG-LIVED Page access tokens during OAuth. Phase 2 uses
 * those tokens (decrypted on demand) to call /{page-id}/photos for Facebook
 * and the 2-step container/publish flow for Instagram. Each publish creates a
 * SocialPublication row with per-account outcomes for audit and history.
 *
 * Multi-account OAuth behaviour: a single handshake registers EVERY Page the
 * user manages as a separate SocialAccount row, and for each Page that has an
 * Instagram Business account linked, a second row is created with
 * platform="instagram" and the IG-side token (same as the Page token, per
 * Meta's API). This matches how Buffer/Hootsuite handle it.
 */

import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { encryptToken, decryptToken } from '../lib/tokenCrypto.js';
import {
    buildAuthUrl,
    exchangeCodeForUserToken,
    exchangeForLongLivedUserToken,
    getMetaUserProfile,
    getUserPages,
    getInstagramBusinessForPage,
    verifyToken,
    META_SCOPES
} from '../services/metaService.js';
import {
    buildIgAuthUrl,
    exchangeCodeForIgToken,
    exchangeForLongLivedIgToken,
    getIgUserProfile,
    hasIgLoginCredentials,
    IG_LOGIN_SCOPES
} from '../services/instagramLoginService.js';
import { publishToAccount } from '../services/socialPublishService.js';
import { auditSocial, clientIp } from '../lib/socialAudit.js';

// Boot log — Hub Social v4.554.0 (Fundación Integración con Meta:
// webhooks + insights + bandeja + auditoría + módulo unificado).
console.log('[social] Hub Social controller cargado — v4.554.0');

const TOKEN_VERSION_CURRENT = 1;

// state param protects the OAuth round-trip and carries the club id we want to
// attribute the connection to. We sign it with a HMAC keyed on the Meta App
// secret so a returning callback can't be replayed for a different club.
const getHmacKey = () => process.env.META_APP_SECRET || process.env.FB_APP_SECRET || 'fallback';

const signState = ({ clubId, userId }) => {
    const payload = `${clubId}|${userId}|${Date.now()}|${crypto.randomBytes(8).toString('hex')}`;
    const sig = crypto
        .createHmac('sha256', getHmacKey())
        .update(payload)
        .digest('hex')
        .slice(0, 16);
    return Buffer.from(`${payload}|${sig}`).toString('base64url');
};

const verifyState = (state) => {
    try {
        const decoded = Buffer.from(state, 'base64url').toString('utf8');
        const parts = decoded.split('|');
        if (parts.length !== 5) return null;
        const [clubId, userId, timestamp, nonce, sig] = parts;
        const payload = `${clubId}|${userId}|${timestamp}|${nonce}`;
        const expected = crypto
            .createHmac('sha256', getHmacKey())
            .update(payload)
            .digest('hex')
            .slice(0, 16);
        if (sig !== expected) return null;
        // 30-minute window — plenty for an OAuth round-trip.
        if (Date.now() - Number(timestamp) > 30 * 60 * 1000) return null;
        return { clubId, userId };
    } catch {
        return null;
    }
};

const getBaseUrl = (req) => process.env.APP_URL
    || (process.env.NODE_ENV === 'production'
        ? 'https://app.clubplatform.org'
        : `${req.protocol}://${req.get('host')}`);

const getRedirectUri = (req) => `${getBaseUrl(req)}/api/social/callback/meta`;
const getIgRedirectUri = (req) => `${getBaseUrl(req)}/api/social/callback/instagram`;

const getCallerClubId = (req) => {
    if (!req.user) return null;
    return req.user.role === 'administrator'
        ? (req.query.clubId || req.body?.clubId || req.user.clubId)
        : req.user.clubId;
};

// Sanitise an account row for the frontend: never return the token.
const serialiseAccount = (acc) => ({
    id: acc.id,
    clubId: acc.clubId,
    club: acc.club ? { id: acc.club.id, name: acc.club.name } : null,
    platform: acc.platform,
    platformId: acc.platformId,
    pageId: acc.pageId,
    accountName: acc.accountName,
    avatar: acc.avatar,
    status: acc.status,
    permissions: acc.permissions || [],
    metadata: acc.metadata || {},
    lastVerifiedAt: acc.lastVerifiedAt,
    expiresAt: acc.expiresAt,
    needsReconnect: acc.tokenVersion === 0 || acc.status !== 'active',
    createdAt: acc.createdAt,
    updatedAt: acc.updatedAt
});

// ============================================================================
// GET /api/social/connect/meta
// ============================================================================
export const getMetaAuthUrl = async (req, res) => {
    try {
        const clubId = getCallerClubId(req);
        if (!clubId) {
            return res.status(400).json({
                error: req.user?.role === 'administrator'
                    ? 'Seleccioná a qué club asignar las cuentas conectadas (clubId requerido)'
                    : 'No tenés un club asociado a tu cuenta'
            });
        }
        // META_APP_ID has a hardcoded fallback (it's a public client id); only
        // the app secret must be set in Vercel. Accept either META_APP_SECRET
        // (current naming in this project) or FB_APP_SECRET (legacy name).
        if (!process.env.META_APP_SECRET && !process.env.FB_APP_SECRET) {
            return res.status(500).json({
                error: 'META_APP_SECRET no está configurada en Vercel. Settings → Environment Variables → agregar META_APP_SECRET (el "App Secret" de la Meta Developer App).'
            });
        }
        const state = signState({ clubId, userId: req.user.id });
        const url = buildAuthUrl({ state, redirectUri: getRedirectUri(req) });
        res.json({ url, scopes: META_SCOPES });
    } catch (e) {
        console.error('[social] getMetaAuthUrl error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// GET /api/social/callback/meta
// Public endpoint hit by Facebook after the user grants permissions.
// ============================================================================
export const handleMetaCallback = async (req, res) => {
    console.log('[social] callback hit', {
        host: req.hostname,
        path: req.path,
        hasCode: !!req.query.code,
        hasState: !!req.query.state,
        oauthError: req.query.error || null
    });
    const { code, state, error: oauthError, error_description } = req.query;
    const redirectBase = '/admin/content-studio?tab=accounts';

    if (oauthError) {
        console.warn('[social] OAuth provider returned error:', oauthError, error_description);
        return res.redirect(`${redirectBase}&social=error&message=${encodeURIComponent(error_description || oauthError)}`);
    }
    if (!code || !state) {
        console.warn('[social] callback missing code or state');
        return res.redirect(`${redirectBase}&social=error&message=missing_code_or_state`);
    }

    const verified = verifyState(state);
    if (!verified) {
        console.warn('[social] state verification failed');
        return res.redirect(`${redirectBase}&social=error&message=invalid_state`);
    }
    const { clubId } = verified;
    console.log('[social] state verified, clubId:', clubId);

    try {
        const redirectUri = getRedirectUri(req);

        // 1) Code → short-lived user token → long-lived user token.
        const { token: shortToken } = await exchangeCodeForUserToken({ code, redirectUri });
        const { token: longToken, expiresAt: userTokenExpiresAt } = await exchangeForLongLivedUserToken(shortToken);

        // 2) Identify the user (for audit / metadata only — we don't store the user token).
        const profile = await getMetaUserProfile(longToken);

        // 3) Enumerate Pages. Each Page has its OWN long-lived access token —
        //    this is what we persist and decrypt to publish.
        const pages = await getUserPages(longToken);
        if (!pages.length) {
            return res.redirect(`${redirectBase}&social=error&message=${encodeURIComponent('No se encontraron Páginas administradas por este usuario')}`);
        }

        let connectedFb = 0;
        let connectedIg = 0;

        for (const page of pages) {
            // 4a) Persist the FB Page.
            await prisma.socialAccount.upsert({
                where: {
                    clubId_platform_platformId: {
                        clubId,
                        platform: 'facebook',
                        platformId: page.id
                    }
                },
                update: {
                    pageId: page.id,
                    accountName: page.name,
                    accessToken: encryptToken(page.accessToken),
                    avatar: page.avatar,
                    status: 'active',
                    permissions: META_SCOPES,
                    metadata: {
                        category: page.category,
                        tasks: page.tasks,
                        connectedBy: { id: profile.id, name: profile.name }
                    },
                    lastVerifiedAt: new Date(),
                    tokenVersion: TOKEN_VERSION_CURRENT,
                    expiresAt: userTokenExpiresAt,
                    updatedAt: new Date()
                },
                create: {
                    clubId,
                    platform: 'facebook',
                    platformId: page.id,
                    pageId: page.id,
                    accountName: page.name,
                    accessToken: encryptToken(page.accessToken),
                    avatar: page.avatar,
                    status: 'active',
                    permissions: META_SCOPES,
                    metadata: {
                        category: page.category,
                        tasks: page.tasks,
                        connectedBy: { id: profile.id, name: profile.name }
                    },
                    lastVerifiedAt: new Date(),
                    tokenVersion: TOKEN_VERSION_CURRENT,
                    expiresAt: userTokenExpiresAt
                }
            });
            connectedFb += 1;

            // 4b) Check for a linked Instagram Business account.
            const ig = await getInstagramBusinessForPage({
                pageId: page.id,
                pageAccessToken: page.accessToken
            });
            if (ig) {
                await prisma.socialAccount.upsert({
                    where: {
                        clubId_platform_platformId: {
                            clubId,
                            platform: 'instagram',
                            platformId: ig.id
                        }
                    },
                    update: {
                        pageId: page.id,
                        accountName: ig.username,
                        accessToken: encryptToken(page.accessToken),
                        avatar: ig.avatar,
                        status: 'active',
                        permissions: META_SCOPES,
                        metadata: {
                            igName: ig.name,
                            igUsername: ig.username,
                            followersCount: ig.followersCount,
                            linkedPageId: page.id,
                            linkedPageName: page.name,
                            connectedBy: { id: profile.id, name: profile.name }
                        },
                        lastVerifiedAt: new Date(),
                        tokenVersion: TOKEN_VERSION_CURRENT,
                        expiresAt: userTokenExpiresAt,
                        updatedAt: new Date()
                    },
                    create: {
                        clubId,
                        platform: 'instagram',
                        platformId: ig.id,
                        pageId: page.id,
                        accountName: ig.username,
                        accessToken: encryptToken(page.accessToken),
                        avatar: ig.avatar,
                        status: 'active',
                        permissions: META_SCOPES,
                        metadata: {
                            igName: ig.name,
                            igUsername: ig.username,
                            followersCount: ig.followersCount,
                            linkedPageId: page.id,
                            linkedPageName: page.name,
                            connectedBy: { id: profile.id, name: profile.name }
                        },
                        lastVerifiedAt: new Date(),
                        tokenVersion: TOKEN_VERSION_CURRENT,
                        expiresAt: userTokenExpiresAt
                    }
                });
                connectedIg += 1;
            }
        }

        console.log(`[social] OAuth completed: fb=${connectedFb} ig=${connectedIg}`);
        await auditSocial({
            action: 'connect', clubId, userId: verified.userId,
            detail: { provider: 'meta', fb: connectedFb, ig: connectedIg, connectedBy: profile.name }
        });
        return res.redirect(`${redirectBase}&social=connected&fb=${connectedFb}&ig=${connectedIg}`);
    } catch (e) {
        console.error('[social] handleMetaCallback error:', e.message, e.stack);
        return res.redirect(`${redirectBase}&social=error&message=${encodeURIComponent(e.message.slice(0, 200))}`);
    }
};

// ============================================================================
// GET /api/social/connect/instagram
// Alternative connection flow for IG Business/Creator accounts that are NOT
// linked to a Facebook Page. Uses the Instagram Login API (api.instagram.com)
// instead of the FB OAuth dialog. Returns a URL the frontend redirects to.
// ============================================================================
export const getInstagramAuthUrl = async (req, res) => {
    try {
        const clubId = getCallerClubId(req);
        if (!clubId) {
            return res.status(400).json({
                error: req.user?.role === 'administrator'
                    ? 'Seleccioná a qué club asignar la cuenta de Instagram (clubId requerido)'
                    : 'No tenés un club asociado a tu cuenta'
            });
        }
        if (!hasIgLoginCredentials()) {
            return res.status(500).json({
                error: 'INSTAGRAM_APP_ID o INSTAGRAM_APP_SECRET no están configuradas en Vercel. Settings → Environment Variables → agregalas desde la Meta Developer App, producto "Instagram".'
            });
        }
        const state = signState({ clubId, userId: req.user.id });
        const url = buildIgAuthUrl({ state, redirectUri: getIgRedirectUri(req) });
        res.json({ url, scopes: IG_LOGIN_SCOPES });
    } catch (e) {
        console.error('[social] getInstagramAuthUrl error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// GET /api/social/callback/instagram
// Public endpoint hit by Instagram after the user grants permissions.
// Mirrors handleMetaCallback but persists a single IG account directly,
// without enumerating FB Pages.
// ============================================================================
export const handleInstagramCallback = async (req, res) => {
    console.log('[social] IG-direct callback hit', {
        host: req.hostname,
        path: req.path,
        hasCode: !!req.query.code,
        codeLen: req.query.code ? String(req.query.code).length : 0,
        hasState: !!req.query.state,
        hasError: !!req.query.error,
        query: Object.keys(req.query)
    });
    const { code, state, error: igError, error_description } = req.query;
    const redirectBase = `${getBaseUrl(req)}/admin/content-studio?tab=accounts`;

    if (igError) {
        console.warn('[social] IG-direct returned error:', igError, error_description);
        return res.redirect(`${redirectBase}&social=error&message=${encodeURIComponent(error_description || igError)}`);
    }
    if (!code || !state) {
        console.warn('[social] IG-direct missing params');
        return res.redirect(`${redirectBase}&social=error&message=missing_params`);
    }
    const verified = verifyState(state);
    if (!verified) {
        console.warn('[social] IG-direct invalid state');
        return res.redirect(`${redirectBase}&social=error&message=invalid_state`);
    }
    const { clubId } = verified;
    console.log('[social] IG-direct state verified, clubId:', clubId);

    try {
        const redirectUri = getIgRedirectUri(req);
        // 1) Code → short-lived IG user token. Esto SIEMPRE devuelve user_id en
        // la respuesta — lo usamos como fallback si /me también falla.
        const { token: shortToken, userId: tokenUserId } = await exchangeCodeForIgToken({ code, redirectUri });
        // 2) Short-lived → long-lived (~60d, renewable). v4.398: paso OPCIONAL —
        // si Meta rechaza el endpoint, seguimos con short-lived (~1h).
        let activeToken = shortToken;
        let expiresAt = new Date(Date.now() + 60 * 60 * 1000); // default 1h
        try {
            const longResult = await exchangeForLongLivedIgToken(shortToken);
            activeToken = longResult.token;
            expiresAt = longResult.expiresAt || expiresAt;
            console.log('[social] IG-direct long-lived token obtenido (expira:', expiresAt.toISOString(), ')');
        } catch (longErr) {
            console.warn('[social] IG-direct long-lived exchange falló, usamos short-lived:', longErr.message);
        }
        // 3) Identify the IG account. v4.399: este paso TAMBIÉN es opcional. Si
        // graph.instagram.com/me rechaza todos los métodos, usamos el user_id
        // que recibimos en el paso 1 con un nombre placeholder. El usuario
        // puede editar el nombre después.
        let profile = { id: null, username: null, accountType: null, avatar: null };
        try {
            profile = await getIgUserProfile(activeToken);
            console.log('[social] IG-direct /me OK:', profile.username, '/', profile.accountType);
        } catch (meErr) {
            console.warn('[social] IG-direct /me falló, usamos user_id del exchange:', meErr.message);
            if (tokenUserId) {
                profile.id = tokenUserId;
                profile.username = `instagram_${tokenUserId.slice(-6)}`;
            }
        }
        if (!profile.id) {
            return res.redirect(`${redirectBase}&social=error&message=${encodeURIComponent('No se pudo identificar la cuenta de Instagram (sin user_id en exchange ni en /me)')}`);
        }

        // 4) Persist as a SocialAccount with platform='instagram' and a
        //    metadata.directConnect flag so we can distinguish from the
        //    FB-Page-linked flow when needed (e.g. for verify/disconnect logic).
        await prisma.socialAccount.upsert({
            where: {
                clubId_platform_platformId: {
                    clubId,
                    platform: 'instagram',
                    platformId: profile.id
                }
            },
            update: {
                pageId: null,
                accountName: profile.username || profile.id,
                accessToken: encryptToken(activeToken),
                avatar: profile.avatar,
                status: 'active',
                permissions: IG_LOGIN_SCOPES,
                metadata: {
                    directConnect: true,
                    igUsername: profile.username,
                    accountType: profile.accountType,
                    connectedBy: { id: req.user?.id || null }
                },
                lastVerifiedAt: new Date(),
                tokenVersion: TOKEN_VERSION_CURRENT,
                expiresAt,
                updatedAt: new Date()
            },
            create: {
                clubId,
                platform: 'instagram',
                platformId: profile.id,
                pageId: null,
                accountName: profile.username || profile.id,
                accessToken: encryptToken(activeToken),
                avatar: profile.avatar,
                status: 'active',
                permissions: IG_LOGIN_SCOPES,
                metadata: {
                    directConnect: true,
                    igUsername: profile.username,
                    accountType: profile.accountType,
                    connectedBy: { id: req.user?.id || null }
                },
                lastVerifiedAt: new Date(),
                tokenVersion: TOKEN_VERSION_CURRENT,
                expiresAt
            }
        });

        console.log(`[social] IG-direct OAuth completed: @${profile.username} (${profile.accountType || 'unknown'})`);
        return res.redirect(`${redirectBase}&social=connected&ig=1&direct=1`);
    } catch (e) {
        console.error('[social] handleInstagramCallback error:', e.message, e.stack);
        return res.redirect(`${redirectBase}&social=error&message=${encodeURIComponent(e.message.slice(0, 200))}`);
    }
};

// ============================================================================
// GET /api/social/accounts
// System admin without ?clubId sees every club's accounts (with club info).
// Otherwise filtered by clubId.
// ============================================================================
export const listAccounts = async (req, res) => {
    try {
        const isAdmin = req.user.role === 'administrator';
        const where = {};
        if (isAdmin) {
            // Admin may optionally filter by club; without it, return all.
            if (req.query.clubId) where.clubId = req.query.clubId;
        } else {
            if (!req.user.clubId) return res.json([]);
            where.clubId = req.user.clubId;
        }
        const accounts = await prisma.socialAccount.findMany({
            where,
            orderBy: [{ platform: 'asc' }, { createdAt: 'desc' }],
            include: { club: { select: { id: true, name: true } } }
        });
        res.json(accounts.map(serialiseAccount));
    } catch (e) {
        console.error('[social] listAccounts error:', e);
        res.status(500).json({ error: e.message });
    }
};

// Find an account by id with role-aware authorisation: admins can touch any
// account; club users only their own club's accounts.
const findAccountForCaller = async (req) => {
    const where = { id: req.params.id };
    if (req.user.role !== 'administrator') {
        if (!req.user.clubId) return null;
        where.clubId = req.user.clubId;
    }
    return prisma.socialAccount.findFirst({ where });
};

// ============================================================================
// POST /api/social/accounts/:id/verify
// ============================================================================
export const verifyAccount = async (req, res) => {
    try {
        const acc = await findAccountForCaller(req);
        if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
        if (acc.tokenVersion === 0) {
            return res.json({ ok: false, status: 'needs_reconnect', reason: 'legacy_token' });
        }
        const token = decryptToken(acc.accessToken);
        const ok = await verifyToken(token);
        const newStatus = ok ? 'active' : 'expired';
        await prisma.socialAccount.update({
            where: { id: acc.id },
            data: { status: newStatus, lastVerifiedAt: new Date() }
        });
        res.json({ ok, status: newStatus });
    } catch (e) {
        console.error('[social] verifyAccount error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// DELETE /api/social/accounts/:id
// ============================================================================
export const disconnectAccount = async (req, res) => {
    try {
        const acc = await findAccountForCaller(req);
        if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
        await prisma.socialAccount.delete({ where: { id: acc.id } });
        await auditSocial({
            action: 'disconnect', clubId: acc.clubId, userId: req.user.id,
            accountId: acc.id, target: acc.id, ip: clientIp(req),
            detail: { platform: acc.platform, accountName: acc.accountName }
        });
        res.json({ ok: true });
    } catch (e) {
        console.error('[social] disconnectAccount error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// POST /api/social/publish
//
// Body:
//   {
//     accountIds: string[],          // SocialAccount ids to publish to
//     imageUrl: string,              // The S3 URL of the generated/uploaded image
//     copies: {                      // Per-platform copy blocks from gpt-4o
//       facebook:  { copy, hashtags, cta },
//       instagram: { copy, hashtags, cta },
//       ...
//     },
//     publicationId?: string,        // If present, update that draft instead of creating new
//     scheduledFor?: ISO date string,// If present, save as scheduled (no immediate publish)
//     timezone?: string,             // IANA tz (audit/UI)
//     sourceImageId?: string,        // Media-library id if reused (lineage)
//     generatedBy?: string,          // e.g. "ai-kie", "ai-openai", "manual"
//   }
//
// Authorisation: caller must own (or be admin of) every account id passed.
// Behaviour: if scheduledFor is provided, the publication is saved with
// status='scheduled' and will be picked up by the cron worker
// (cron.js → publishScheduledPublications). Otherwise published immediately.
// ============================================================================
export const publishPost = async (req, res) => {
    try {
        const {
            accountIds,
            imageUrl,
            // imagesByPlatform es un mapa opcional { facebook, instagram, x, linkedin }
            // donde cada valor es la URL de la imagen optimizada para esa plataforma.
            // Si está presente, cada cuenta recibe la imagen del platform correspondiente.
            // Si no, cae a imageUrl para todas las cuentas (compat hacia atrás).
            imagesByPlatform = {},
            copies = {},
            publicationId,
            scheduledFor,
            timezone,
            sourceImageId,
            generatedBy
        } = req.body || {};
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            return res.status(400).json({ error: 'accountIds requerido (al menos uno)' });
        }
        if (!imageUrl && !Object.values(imagesByPlatform || {}).some(Boolean)) {
            return res.status(400).json({ error: 'imageUrl o imagesByPlatform requerido' });
        }
        // Resolver la imagen a usar para cada cuenta — IG va con su 2:3, FB con
        // 4:5, etc. Fallback a imageUrl si no hay variante específica.
        const resolveImageForPlatform = (platform) =>
            imagesByPlatform?.[platform] || imageUrl || null;

        const isAdmin = req.user.role === 'administrator';
        const accountWhere = { id: { in: accountIds } };
        if (!isAdmin) {
            if (!req.user.clubId) return res.status(403).json({ error: 'No tenés club asociado' });
            accountWhere.clubId = req.user.clubId;
        }
        const accounts = await prisma.socialAccount.findMany({ where: accountWhere });
        if (accounts.length === 0) {
            return res.status(404).json({ error: 'Ninguna de las cuentas indicadas existe o tenés permiso para usarla' });
        }

        // All accounts must belong to a single club (a publication is tied to one club).
        const clubIds = [...new Set(accounts.map(a => a.clubId).filter(Boolean))];
        if (clubIds.length !== 1) {
            return res.status(400).json({ error: 'Las cuentas seleccionadas pertenecen a clubs distintos' });
        }
        const clubId = clubIds[0];

        // ─── Schedule branch: save and return, no immediate publish ──────────
        if (scheduledFor) {
            const scheduledAt = new Date(scheduledFor);
            if (Number.isNaN(scheduledAt.getTime())) {
                return res.status(400).json({ error: 'scheduledFor inválido (ISO date string esperado)' });
            }
            if (scheduledAt.getTime() <= Date.now() + 60_000) {
                return res.status(400).json({ error: 'La fecha programada debe estar al menos a 1 minuto del presente' });
            }
            const pendingOutcomes = accounts.map(a => ({
                accountId: a.id,
                platform: a.platform,
                accountName: a.accountName,
                ok: false,
                externalId: null,
                error: null,
                publishedAt: null,
                pending: true
            }));
            const buildScheduledData = (includeInstagram) => ({
                clubId,
                userId: req.user.id || null,
                imageUrl: imagesByPlatform?.facebook || imageUrl,
                ...(includeInstagram && imagesByPlatform?.instagram ? { imageUrlInstagram: imagesByPlatform.instagram } : {}),
                ...(imagesByPlatform?.x ? { imageUrlLandscape: imagesByPlatform.x } : {}),
                platformCopies: copies,
                targetAccounts: pendingOutcomes,
                status: 'scheduled',
                scheduledFor: scheduledAt,
                timezone: timezone || null,
                sourceImageId: sourceImageId || null,
                generatedBy: generatedBy || null,
                accounts: { set: accounts.map(a => ({ id: a.id })) }
            });
            let pub;
            try {
                pub = publicationId
                    ? await prisma.socialPublication.update({ where: { id: publicationId }, data: buildScheduledData(true) })
                    : await prisma.socialPublication.create({ data: buildScheduledData(true) });
            } catch (scheduledErr) {
                if (/imageUrlInstagram|column .* does not exist|Unknown arg/i.test(scheduledErr.message)) {
                    console.warn('[social] Reintentando schedule SIN imageUrlInstagram — migración SQL v4.381 pendiente.');
                    // v4.391: select explícito para evitar RETURNING * que tropieza con la columna faltante.
                    const safeSelect = { id: true, clubId: true, status: true, scheduledFor: true, timezone: true };
                    pub = publicationId
                        ? await prisma.socialPublication.update({ where: { id: publicationId }, data: buildScheduledData(false), select: safeSelect })
                        : await prisma.socialPublication.create({ data: buildScheduledData(false), select: safeSelect });
                } else {
                    throw scheduledErr;
                }
            }
            return res.json({
                ok: true,
                status: 'scheduled',
                publicationId: pub.id,
                scheduledFor: pub.scheduledFor,
                timezone: pub.timezone,
                outcomes: pendingOutcomes
            });
        }

        // ─── Immediate publish branch ────────────────────────────────────────
        // Run all account publishes in parallel. Each returns { ok, externalId?, error? }.
        const outcomes = await Promise.all(accounts.map(async (acc) => {
            if (acc.tokenVersion === 0) {
                return { accountId: acc.id, platform: acc.platform, ok: false, error: 'Token legacy — reconectar Meta para usar esta cuenta' };
            }
            if (acc.status !== 'active') {
                return { accountId: acc.id, platform: acc.platform, ok: false, error: `Cuenta en estado '${acc.status}' — reconectar` };
            }
            try {
                const token = decryptToken(acc.accessToken);
                const platformImageUrl = resolveImageForPlatform(acc.platform);
                if (!platformImageUrl) {
                    return { accountId: acc.id, platform: acc.platform, ok: false, error: `Sin imagen para plataforma ${acc.platform}` };
                }
                const result = await publishToAccount({ account: acc, decryptedToken: token, imageUrl: platformImageUrl, copies });
                if (!result.ok) {
                    console.error(`[social] publish to ${acc.id} (${acc.platform}, @${acc.accountName || 'unknown'}) FAILED:`, result.error);
                } else {
                    console.log(`[social] publish to ${acc.id} (${acc.platform}, @${acc.accountName || 'unknown'}) OK, externalId=${result.externalId}`);
                }
                return {
                    accountId: acc.id,
                    platform: acc.platform,
                    accountName: acc.accountName,
                    ok: result.ok,
                    externalId: result.externalId || null,
                    externalUrl: result.externalUrl || null,
                    error: result.error || null,
                    publishedAt: result.ok ? new Date().toISOString() : null
                };
            } catch (e) {
                console.error(`[social] publish to ${acc.id} (${acc.platform}) threw:`, e.message);
                return { accountId: acc.id, platform: acc.platform, ok: false, error: e.message };
            }
        }));

        const someOk = outcomes.some(o => o.ok);
        const allOk = outcomes.every(o => o.ok);
        const status = allOk ? 'published' : someOk ? 'partial' : 'error';

        // Persist the publication record (update the draft if we got publicationId,
        // create new otherwise). Guardamos las tres variantes de imagen si las
        // recibimos en imagesByPlatform, así la biblioteca histórica preserva
        // la versión correcta por plataforma.
        // Helper defensivo: si la columna imageUrlInstagram todavía no existe
        // en la DB (migración v4.381 pendiente), reintentamos sin ese campo
        // para no bloquear el publish. Aplicar SQL en Neon resuelve definitivo:
        //   ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "imageUrlInstagram" TEXT;
        const buildPersistData = (includeInstagram) => ({
            clubId,
            userId: req.user.id || null,
            imageUrl: imagesByPlatform?.facebook || imageUrl,
            ...(includeInstagram && imagesByPlatform?.instagram ? { imageUrlInstagram: imagesByPlatform.instagram } : {}),
            ...(imagesByPlatform?.x ? { imageUrlLandscape: imagesByPlatform.x } : {}),
            platformCopies: copies,
            targetAccounts: outcomes,
            status,
            publishedAt: someOk ? new Date() : null,
            sourceImageId: sourceImageId || null,
            generatedBy: generatedBy || null,
            accounts: { set: accounts.map(a => ({ id: a.id })) }
        });
        let publication;
        try {
            publication = publicationId
                ? await prisma.socialPublication.update({ where: { id: publicationId }, data: buildPersistData(true) })
                : await prisma.socialPublication.create({ data: buildPersistData(true) });
        } catch (persistErr) {
            if (/imageUrlInstagram|column .* does not exist|Unknown arg/i.test(persistErr.message)) {
                console.warn('[social] Reintentando persist SIN imageUrlInstagram — migración SQL v4.381 pendiente.');
                // v4.391: select explícito evita RETURNING * con la columna faltante.
                const safeSelect = { id: true, clubId: true, status: true, publishedAt: true };
                publication = publicationId
                    ? await prisma.socialPublication.update({ where: { id: publicationId }, data: buildPersistData(false), select: safeSelect })
                    : await prisma.socialPublication.create({ data: buildPersistData(false), select: safeSelect });
            } else {
                throw persistErr;
            }
        }

        // Update each account's lastVerifiedAt opportunistically — a successful
        // publish proves the token works right now.
        const okAccountIds = outcomes.filter(o => o.ok).map(o => o.accountId);
        if (okAccountIds.length) {
            await prisma.socialAccount.updateMany({
                where: { id: { in: okAccountIds } },
                data: { lastVerifiedAt: new Date(), status: 'active' }
            });
        }

        await auditSocial({
            action: 'publish', clubId, userId: req.user.id,
            target: publication.id, status: allOk ? 'ok' : 'error', ip: clientIp(req),
            detail: { status, accounts: accounts.length, ok: outcomes.filter(o => o.ok).length }
        });
        return res.json({
            ok: someOk,
            status,
            publicationId: publication.id,
            outcomes
        });
    } catch (e) {
        console.error('[social] publishPost error:', e);
        return res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// GET /api/social/publications
//
// Lista las SocialPublications visibles para el caller. Filtros via query:
//   ?status=draft|scheduled|published|partial|error  (puede ser CSV)
//   ?clubId=<id>  (admin only)
//   ?search=<keyword>  (filtra por caption / hashtag)
//   ?limit=50  (default 50, max 200)
//
// Devuelve más reciente primero. Power para el tab "Biblioteca de
// Publicaciones" del Content Studio.
// ============================================================================
export const listPublications = async (req, res) => {
    try {
        const isAdmin = req.user.role === 'administrator';
        const where = {};
        if (isAdmin && req.query.clubId) {
            where.clubId = req.query.clubId;
        } else if (!isAdmin) {
            if (!req.user.clubId) return res.json([]);
            where.clubId = req.user.clubId;
        }
        if (req.query.status) {
            const statuses = String(req.query.status).split(',').map(s => s.trim()).filter(Boolean);
            if (statuses.length) where.status = { in: statuses };
        }
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

        // findMany hace SELECT de TODOS los campos del schema. Si la columna
        // imageUrlInstagram (v4.381) todavía no existe en la DB, Prisma tira
        // "column does not exist" para todo el listado. Defensa: reintentar
        // con select explícito sin ese campo. Para fixearlo definitivo:
        //   ALTER TABLE "SocialPublication"
        //     ADD COLUMN IF NOT EXISTS "imageUrlInstagram" TEXT;
        const queryOpts = {
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                club: { select: { id: true, name: true } },
                accounts: { select: { id: true, platform: true, accountName: true, avatar: true } }
            }
        };
        const SAFE_SELECT = {
            id: true, clubId: true, userId: true, caption: true, platformCopies: true,
            imageUrl: true, imageUrlLandscape: true, mediaType: true, videoProjectId: true,
            targetAccounts: true, status: true, scheduledFor: true, publishedAt: true,
            timezone: true, sourceImageId: true, generatedBy: true,
            aiModelImage: true, aiModelCopy: true,
            createdAt: true, updatedAt: true,
            club: { select: { id: true, name: true } },
            accounts: { select: { id: true, platform: true, accountName: true, avatar: true } }
        };
        let publications;
        try {
            publications = await prisma.socialPublication.findMany(queryOpts);
        } catch (readErr) {
            if (/imageUrlInstagram|column .* does not exist|Unknown field/i.test(readErr.message)) {
                console.warn('[social] Reintentando listPublications SIN imageUrlInstagram — migración SQL v4.381 pendiente en DB.');
                publications = await prisma.socialPublication.findMany({
                    where: queryOpts.where,
                    orderBy: queryOpts.orderBy,
                    take: queryOpts.take,
                    select: SAFE_SELECT
                });
                // Inyectamos campo null para que el frontend no rompa
                publications = publications.map(p => ({ ...p, imageUrlInstagram: null }));
            } else {
                throw readErr;
            }
        }

        // Defensive: filter by search on the server (cheap; we already capped at 200)
        let result = publications;
        if (req.query.search) {
            const q = String(req.query.search).toLowerCase().trim();
            result = result.filter(p => {
                const blob = JSON.stringify(p.platformCopies || {}).toLowerCase();
                return blob.includes(q) || (p.caption || '').toLowerCase().includes(q);
            });
        }

        res.json(result.map(p => ({
            id: p.id,
            clubId: p.clubId,
            club: p.club,
            imageUrl: p.imageUrl,
            imageUrlInstagram: p.imageUrlInstagram,
            imageUrlLandscape: p.imageUrlLandscape,
            platformCopies: p.platformCopies,
            targetAccounts: p.targetAccounts,
            accounts: p.accounts,
            status: p.status,
            scheduledFor: p.scheduledFor,
            publishedAt: p.publishedAt,
            timezone: p.timezone,
            aiModelImage: p.aiModelImage,
            aiModelCopy: p.aiModelCopy,
            generatedBy: p.generatedBy,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
        })));
    } catch (e) {
        console.error('[social] listPublications error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// DELETE /api/social/publications/:id
// Eliminar una publicación de la biblioteca. Solo permitido para:
//   - Drafts (no se ha publicado nada)
//   - Scheduled (cancelar antes de la hora programada)
//   - Error (limpieza)
// Para publicadas, no permitimos delete (queda registro histórico). Si el user
// quiere "ocultarlas" en el futuro, agregamos un soft-delete con visibility.
// ============================================================================
export const deletePublication = async (req, res) => {
    try {
        const isAdmin = req.user.role === 'administrator';
        const where = { id: req.params.id };
        if (!isAdmin) {
            if (!req.user.clubId) return res.status(403).json({ error: 'No tenés club asociado' });
            where.clubId = req.user.clubId;
        }
        // Defensive read: si la columna imageUrlInstagram no existe en DB,
        // la lectura completa rompe. Usamos select explícito con campos seguros.
        let pub;
        try {
            pub = await prisma.socialPublication.findFirst({ where });
        } catch (readErr) {
            if (/imageUrlInstagram|column .* does not exist/i.test(readErr.message)) {
                pub = await prisma.socialPublication.findFirst({
                    where,
                    select: { id: true, status: true, clubId: true }
                });
            } else { throw readErr; }
        }
        if (!pub) return res.status(404).json({ error: 'Publicación no encontrada' });
        if (pub.status === 'published' || pub.status === 'partial') {
            return res.status(400).json({ error: 'No se puede eliminar una publicación que ya fue posteada. Para ocultarla en futuras vistas, contactá soporte.' });
        }
        await prisma.socialPublication.delete({ where: { id: pub.id } });
        res.json({ ok: true });
    } catch (e) {
        console.error('[social] deletePublication error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// Internal: run any SocialPublication whose scheduledFor is now-or-past.
// Called by the cron worker (server/routes/cron.js → /publish-scheduled).
// Returns a summary suitable for the cron response body.
// ============================================================================
export const runScheduledPublicationsDue = async ({ now = new Date() } = {}) => {
    // Pick up scheduled ones whose time has come. Defensive read si la
    // columna imageUrlInstagram todavía no existe en DB.
    let due;
    const queryOpts = {
        where: { status: 'scheduled', scheduledFor: { lte: now } },
        take: 20,  // batch cap per cron run to stay inside function timeouts
        include: { accounts: true }
    };
    try {
        due = await prisma.socialPublication.findMany(queryOpts);
    } catch (e) {
        if (/imageUrlInstagram|column .* does not exist/i.test(e.message)) {
            console.warn('[social/cron] Reintentando sin imageUrlInstagram — migración SQL pendiente.');
            due = await prisma.socialPublication.findMany({
                where: queryOpts.where,
                take: queryOpts.take,
                select: {
                    id: true, status: true, scheduledFor: true,
                    imageUrl: true, imageUrlLandscape: true,
                    platformCopies: true,
                    accounts: true
                }
            });
            due = due.map(p => ({ ...p, imageUrlInstagram: null }));
        } else { throw e; }
    }
    if (due.length === 0) return { processed: 0, results: [] };

    const results = [];
    for (const pub of due) {
        // Lock the row optimistically so a second concurrent cron tick can't
        // double-publish. updateMany with the current status as guard.
        const locked = await prisma.socialPublication.updateMany({
            where: { id: pub.id, status: 'scheduled' },
            data: { status: 'publishing' }
        });
        if (locked.count !== 1) {
            results.push({ id: pub.id, skipped: 'already-locked' });
            continue;
        }

        const accounts = pub.accounts || [];
        const outcomes = await Promise.all(accounts.map(async (acc) => {
            if (acc.tokenVersion === 0) {
                return { accountId: acc.id, platform: acc.platform, ok: false, error: 'Token legacy' };
            }
            if (acc.status !== 'active') {
                return { accountId: acc.id, platform: acc.platform, ok: false, error: `Cuenta en estado '${acc.status}'` };
            }
            try {
                const token = decryptToken(acc.accessToken);
                // Resolve por plataforma: IG → 2:3, X → 3:2, resto (FB/LI) → 4:5.
                // Fallback a pub.imageUrl si la variante específica no existe.
                const platformImageUrl =
                    (acc.platform === 'instagram' && pub.imageUrlInstagram) ||
                    (acc.platform === 'x' && pub.imageUrlLandscape) ||
                    pub.imageUrl;
                if (!platformImageUrl) {
                    return { accountId: acc.id, platform: acc.platform, ok: false, error: `Sin imagen ${acc.platform} en la publicación` };
                }
                const r = await publishToAccount({ account: acc, decryptedToken: token, imageUrl: platformImageUrl, copies: pub.platformCopies || {} });
                return {
                    accountId: acc.id,
                    platform: acc.platform,
                    accountName: acc.accountName,
                    ok: r.ok,
                    externalId: r.externalId || null,
                    externalUrl: r.externalUrl || null,
                    error: r.error || null,
                    publishedAt: r.ok ? new Date().toISOString() : null
                };
            } catch (e) {
                return { accountId: acc.id, platform: acc.platform, ok: false, error: e.message };
            }
        }));

        const someOk = outcomes.some(o => o.ok);
        const status = outcomes.every(o => o.ok) ? 'published' : someOk ? 'partial' : 'error';
        await prisma.socialPublication.update({
            where: { id: pub.id },
            data: {
                status,
                publishedAt: someOk ? new Date() : null,
                targetAccounts: outcomes
            }
        });
        results.push({ id: pub.id, status, outcomes });
    }
    return { processed: due.length, results };
};
