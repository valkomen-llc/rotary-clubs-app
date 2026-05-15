/**
 * Social Publishing — Phase 1 controller.
 *
 * Endpoints exposed:
 *
 *   GET    /api/social/connect/meta            → returns the OAuth URL
 *   GET    /api/social/callback/meta           → OAuth callback (public, comes from Facebook)
 *   GET    /api/social/accounts                → list connected accounts for the user's club
 *   POST   /api/social/accounts/:id/verify     → ping token, update status
 *   DELETE /api/social/accounts/:id            → disconnect / forget the account
 *
 * Goal of Phase 1: capture LONG-LIVED Page access tokens (not user tokens) so
 * Phase 2 can actually publish. The previous implementation stored only the
 * user-level token, which the Graph API rejects on /{page}/feed.
 *
 * Multi-account behaviour: a single OAuth handshake registers EVERY Page the
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

const TOKEN_VERSION_CURRENT = 1;

// state param protects the OAuth round-trip and carries the club id we want to
// attribute the connection to. We sign it with a HMAC keyed on FB_APP_SECRET so
// a returning callback can't be replayed for a different club.
const signState = ({ clubId, userId }) => {
    const payload = `${clubId}|${userId}|${Date.now()}|${crypto.randomBytes(8).toString('hex')}`;
    const sig = crypto
        .createHmac('sha256', process.env.FB_APP_SECRET || 'fallback')
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
            .createHmac('sha256', process.env.FB_APP_SECRET || 'fallback')
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
        if (!clubId) return res.status(400).json({ error: 'Falta clubId' });
        if (!process.env.FB_APP_ID || !process.env.FB_APP_SECRET) {
            return res.status(500).json({ error: 'FB_APP_ID / FB_APP_SECRET no configuradas en el servidor' });
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
    const { code, state, error: oauthError, error_description } = req.query;
    const redirectBase = '/admin/content-studio?tab=accounts';

    if (oauthError) {
        return res.redirect(`${redirectBase}&social=error&message=${encodeURIComponent(error_description || oauthError)}`);
    }
    if (!code || !state) {
        return res.redirect(`${redirectBase}&social=error&message=missing_code_or_state`);
    }

    const verified = verifyState(state);
    if (!verified) {
        return res.redirect(`${redirectBase}&social=error&message=invalid_state`);
    }
    const { clubId } = verified;

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

        return res.redirect(`${redirectBase}&social=connected&fb=${connectedFb}&ig=${connectedIg}`);
    } catch (e) {
        console.error('[social] handleMetaCallback error:', e);
        return res.redirect(`${redirectBase}&social=error&message=${encodeURIComponent(e.message.slice(0, 200))}`);
    }
};

// ============================================================================
// GET /api/social/accounts
// ============================================================================
export const listAccounts = async (req, res) => {
    try {
        const clubId = getCallerClubId(req);
        if (!clubId) return res.status(400).json({ error: 'Falta clubId' });
        const accounts = await prisma.socialAccount.findMany({
            where: { clubId },
            orderBy: [{ platform: 'asc' }, { createdAt: 'desc' }]
        });
        res.json(accounts.map(serialiseAccount));
    } catch (e) {
        console.error('[social] listAccounts error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ============================================================================
// POST /api/social/accounts/:id/verify
// ============================================================================
export const verifyAccount = async (req, res) => {
    try {
        const clubId = getCallerClubId(req);
        const acc = await prisma.socialAccount.findFirst({ where: { id: req.params.id, clubId } });
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
        const clubId = getCallerClubId(req);
        const acc = await prisma.socialAccount.findFirst({ where: { id: req.params.id, clubId } });
        if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
        await prisma.socialAccount.delete({ where: { id: acc.id } });
        res.json({ ok: true });
    } catch (e) {
        console.error('[social] disconnectAccount error:', e);
        res.status(500).json({ error: e.message });
    }
};
