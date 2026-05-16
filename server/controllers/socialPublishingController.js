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
import { publishToAccount } from '../services/socialPublishService.js';

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

const getRedirectUri = (req) => {
    const baseUrl = process.env.APP_URL
        || (process.env.NODE_ENV === 'production'
            ? 'https://app.clubplatform.org'
            : `${req.protocol}://${req.get('host')}`);
    return `${baseUrl}/api/social/callback/meta`;
};

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
        return res.redirect(`${redirectBase}&social=connected&fb=${connectedFb}&ig=${connectedIg}`);
    } catch (e) {
        console.error('[social] handleMetaCallback error:', e.message, e.stack);
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
//     sourceImageId?: string,        // Media-library id if reused (lineage)
//     generatedBy?: string,          // e.g. "ai-kie", "ai-openai", "manual"
//   }
//
// Authorisation: caller must own (or be admin of) every account id passed.
// Returns the SocialPublication record with per-account outcomes.
// ============================================================================
export const publishPost = async (req, res) => {
    try {
        const { accountIds, imageUrl, copies = {}, sourceImageId, generatedBy } = req.body || {};
        if (!Array.isArray(accountIds) || accountIds.length === 0) {
            return res.status(400).json({ error: 'accountIds requerido (al menos uno)' });
        }
        if (!imageUrl) return res.status(400).json({ error: 'imageUrl requerido' });

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
                const result = await publishToAccount({ account: acc, decryptedToken: token, imageUrl, copies });
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

        // Persist the publication record for history / audit / future re-publish.
        const publication = await prisma.socialPublication.create({
            data: {
                clubId,
                userId: req.user.id || null,
                imageUrl,
                platformCopies: copies,
                targetAccounts: outcomes,
                status,
                publishedAt: someOk ? new Date() : null,
                sourceImageId: sourceImageId || null,
                generatedBy: generatedBy || null,
                accounts: { connect: accounts.map(a => ({ id: a.id })) }
            }
        });

        // Update each account's lastVerifiedAt opportunistically — a successful
        // publish proves the token works right now.
        const okAccountIds = outcomes.filter(o => o.ok).map(o => o.accountId);
        if (okAccountIds.length) {
            await prisma.socialAccount.updateMany({
                where: { id: { in: okAccountIds } },
                data: { lastVerifiedAt: new Date(), status: 'active' }
            });
        }

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
