import axios from 'axios';
import db from '../lib/db.js';

// ── Evolution API client (single SuperAdmin instance for Club Platform) ────────
//
// We talk to a self-hosted Evolution API (https://github.com/EvolutionAPI/evolution-api).
// It exposes WhatsApp via REST, so the Vercel serverless function only proxies HTTP
// calls — no Puppeteer, no persistent process, no global state in this Node runtime.
//
// Required env vars:
//   EVOLUTION_API_URL          e.g. https://evo.clubplatform.org
//   EVOLUTION_API_KEY          global API key configured in Evolution
//   EVOLUTION_INSTANCE_NAME    instance to use (default: 'clubplatform-admin')

const EVO_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'clubplatform-admin';
// Instance name can include spaces or accents (Evolution allows it via the manager UI),
// so encode it for every URL segment.
const EVO_INSTANCE_PATH = encodeURIComponent(EVO_INSTANCE);

const evo = axios.create({
    baseURL: EVO_URL,
    headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
    timeout: 20000,
    validateStatus: (s) => s < 500 // surface 4xx as data instead of throw
});

const requireConfig = (res) => {
    if (!EVO_URL || !EVO_KEY) {
        res.status(500).json({ error: 'Evolution API no está configurada. Falta EVOLUTION_API_URL / EVOLUTION_API_KEY.' });
        return false;
    }
    return true;
};

// Evolution returns connection state as 'open' | 'close' | 'connecting'.
// Map it to the four states the frontend expects.
const mapState = (state, hasQr) => {
    if (state === 'open') return 'CONNECTED';
    if (state === 'connecting' && hasQr) return 'QR_READY';
    if (state === 'connecting') return 'INITIALIZING';
    return 'DISCONNECTED';
};

// Accept either a raw phone number (with or without "+", spaces, dashes) or a
// full JID, and normalize to the JID form Evolution expects on send.
const normalizeJid = (input) => {
    if (!input) return '';
    const s = String(input).trim();
    if (s.includes('@')) return s;
    const digits = s.replace(/[^0-9]/g, '');
    if (!digits) return s;
    return `${digits}@s.whatsapp.net`;
};

// Smart phone number normalizer for importing B2B contacts.
// Specially tailored for Colombian mobile numbers (starts with 3, 10 digits) if code is 57.
const normalizePhoneToJid = (phoneStr, defaultCountryCode = '57') => {
    if (!phoneStr) return null;
    let digits = String(phoneStr).replace(/[^0-9]/g, '');
    if (!digits) return null;

    if (digits.startsWith('00')) {
        digits = digits.substring(2);
    }

    if (digits.length === 10 && digits.startsWith('3') && defaultCountryCode === '57') {
        digits = '57' + digits;
    } else if (digits.length < 10 && defaultCountryCode) {
        digits = defaultCountryCode + digits;
    }

    return `${digits}@s.whatsapp.net`;
};

const ensureInstance = async () => {
    // Try to find the instance first; create it if missing.
    const list = await evo.get('/instance/fetchInstances', { params: { instanceName: EVO_INSTANCE } });
    const found = Array.isArray(list.data)
        ? list.data.find(i => (i?.instance?.instanceName || i?.name) === EVO_INSTANCE)
        : null;
    if (found) return found;

    const create = await evo.post('/instance/create', {
        instanceName: EVO_INSTANCE,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS'
    });
    if (create.status >= 400) {
        const msg = create.data?.message || create.data?.error || 'No se pudo crear la instancia';
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return create.data;
};

const fetchConnectionState = async () => {
    const r = await evo.get(`/instance/connectionState/${EVO_INSTANCE_PATH}`);
    if (r.status === 404) return { state: 'close' };
    return r.data?.instance || r.data || { state: 'close' };
};

/** Resolve clubId — super admins may not have clubId in JWT, fallback to first club with config */
async function resolveClubId(req, fromBody = false) {
    const src = fromBody ? req.body : req.query;
    const isAdmin = req.user?.role === 'administrator' || req.user?.role === 'superadmin';

    if (isAdmin && (src?.clubId || req.headers['x-club-id'])) {
        return src?.clubId || req.headers['x-club-id'];
    }
    
    if (req.user?.clubId) return req.user.clubId;
    
    // Super admin without explicit clubId → Prioritize Platform Club (Origen)
    const platformClubId = '3c648ce7-3c47-41e2-9461-6e40a8615ae6';
    const hasPlatformConfig = await db.query(`SELECT 1 FROM "WhatsAppConfig" WHERE "clubId"=$1`, [platformClubId]);
    if (hasPlatformConfig.rows.length) return platformClubId;

    // Fallback: use most recent club that HAS a config
    const r = await db.query(`
        SELECT "clubId" FROM "WhatsAppConfig" 
        ORDER BY "lastVerifiedAt" DESC NULLS LAST 
        LIMIT 1
    `);
    
    if (r.rows.length) return r.rows[0].clubId;

    // Last resort: first club in system
    const first = await db.query(`SELECT id FROM "Club" LIMIT 1`);
    return first.rows[0]?.id || null;
}

/** 
 * Resolve and cache WhatsApp profiles / group names in DB 
 * Capped background fetches to avoid serverless function timeout.
 */
const resolveAndCacheContacts = async (clubId, jids, chatsData) => {
    if (!jids || jids.length === 0) return new Map();

    const jidDigits = [];
    for (const jid of jids) {
        if (jid.endsWith('@g.us')) continue;
        const local = jid.split('@')[0];
        jidDigits.push(local);
        if (local.startsWith('57') && local.length === 12) jidDigits.push(local.substring(2));
        if (local.startsWith('52') && local.length === 12) jidDigits.push(local.substring(2));
        if (local.length > 10) {
            jidDigits.push(local.substring(local.length - 10));
        }
    }

    // Query Postgres using both exact JID OR cleaned digits comparison
    const dbRes = await db.query(
        `SELECT id, phone, name, "profilePictureUrl", metadata, source 
         FROM "WhatsAppContact" 
         WHERE "clubId" = $1 
           AND (
             phone = ANY($2) 
             OR (
               NOT phone LIKE '%@%'
               AND regexp_replace(phone, '[^0-9]', '', 'g') = ANY($3)
             )
           )`,
        [clubId, jids, jidDigits]
    );

    const matchesJid = (dbPhone, jid) => {
        if (dbPhone === jid) return true;
        if (jid.endsWith('@g.us')) return false;

        const dbCleaned = dbPhone.replace(/[^0-9]/g, '');
        const jidCleaned = jid.split('@')[0];

        if (!dbCleaned || !jidCleaned) return false;
        if (dbCleaned === jidCleaned) return true;

        if (dbCleaned.length >= 10 && jidCleaned.length >= 10) {
            const dbSuffix = dbCleaned.substring(dbCleaned.length - 10);
            const jidSuffix = jidCleaned.substring(jidCleaned.length - 10);
            if (dbSuffix === jidSuffix) return true;
        }

        return false;
    };

    const contactMap = new Map();
    
    // Map existing records to their JID key
    for (const jid of jids) {
        const matches = dbRes.rows.filter(r => matchesJid(r.phone, jid));
        if (matches.length > 0) {
            // Sort matches: manual/csv_import first
            matches.sort((a, b) => {
                const priority = (s) => (s === 'manual' || s === 'csv_import') ? 2 : 1;
                return priority(b.source) - priority(a.source);
            });

            const primary = matches[0];
            let profilePictureUrl = primary.profilePictureUrl;
            let metadata = primary.metadata;

            if (!profilePictureUrl || !metadata) {
                for (const m of matches) {
                    if (!profilePictureUrl && m.profilePictureUrl) {
                        profilePictureUrl = m.profilePictureUrl;
                    }
                    if (!metadata && m.metadata) {
                        metadata = m.metadata;
                    }
                }
            }

            contactMap.set(jid, {
                id: primary.id,
                phone: jid, // Set the JID as the phone key for the frontend lookup
                name: primary.name,
                profilePictureUrl,
                metadata,
                source: primary.source
            });
        }
    }

    const missingJids = jids.filter(jid => !contactMap.has(jid));
    
    // Lazy resolve up to 3 missing per request to protect performance
    const toResolve = missingJids.slice(0, 3);
    if (toResolve.length > 0) {
        await Promise.all(toResolve.map(async (jid) => {
            const isGroup = jid.endsWith('@g.us');
            const source = isGroup ? 'whatsapp-qr-group' : 'whatsapp-qr';
            
            const chatRaw = chatsData.find(c => (c.remoteJid || c.id) === jid) || {};
            let resolvedName = isGroup ? chatRaw.subject : (chatRaw.pushName || chatRaw.name || chatRaw.notify);
            let resolvedPic = null;

            if (!resolvedName) {
                const endpoints = isGroup
                    ? [`/group/findGroupInfos/${EVO_INSTANCE_PATH}`]
                    : [`/chat/fetchProfile/${EVO_INSTANCE_PATH}`, `/chat/whatsappProfile/${EVO_INSTANCE_PATH}`];

                for (const ep of endpoints) {
                    try {
                        const r = isGroup
                            ? await evo.get(ep, { params: { groupJid: jid }, timeout: 1500 })
                            : await evo.post(ep, { number: jid }, { timeout: 1500 });
                        const data = r.data || {};
                        const candidate = data.subject || data.pushName || data.name || data.verifiedName || data.notify;
                        if (candidate && r.status < 400) {
                            resolvedName = candidate;
                            resolvedPic = data.profilePictureUrl || data.avatar || null;
                            break;
                        }
                    } catch (_) { /* continue */ }
                }
            }

            const fallback = jid.split('@')[0];
            const name = resolvedName || fallback;

            const metadataObj = {
                pushName: chatRaw.pushName || null,
                notify: chatRaw.notify || null,
                profilePictureUrl: resolvedPic
            };

            try {
                const insertRes = await db.query(`
                    INSERT INTO "WhatsAppContact" (id, "clubId", name, phone, source, "profilePictureUrl", metadata, "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
                    ON CONFLICT (phone, "clubId")
                    DO UPDATE SET 
                        name = CASE WHEN "WhatsAppContact".source = 'manual' THEN "WhatsAppContact".name ELSE $2 END,
                        "profilePictureUrl" = COALESCE($5, "WhatsAppContact"."profilePictureUrl"),
                        metadata = "WhatsAppContact".metadata || $6,
                        "updatedAt" = NOW()
                    RETURNING id, phone, name, "profilePictureUrl", metadata
                `, [clubId, name, jid, source, resolvedPic, JSON.stringify(metadataObj)]);

                if (insertRes.rows.length) {
                    contactMap.set(jid, insertRes.rows[0]);
                }
            } catch (e) {
                console.error('[WA-QR] Error lazy-caching contact JID:', jid, e.message);
            }
        }));
    }

    return contactMap;
};

// ── Public endpoints ──────────────────────────────────────────────────────────

export const getStatus = async (req, res) => {
    if (!requireConfig(res)) return;
    try {
        const conn = await fetchConnectionState();
        const state = conn.state || conn.status || 'close';

        let qr = null;
        if (state !== 'open') {
            // When pairing, Evolution caches the latest QR on the instance/connect endpoint.
            const qrRes = await evo.get(`/instance/connect/${EVO_INSTANCE_PATH}`);
            if (qrRes.status < 400) {
                qr = qrRes.data?.base64 || qrRes.data?.qrcode?.base64 || null;
                if (qr && !qr.startsWith('data:image')) qr = `data:image/png;base64,${qr}`;
            }
        }

        res.json({ status: mapState(state, !!qr), qr });
    } catch (e) {
        console.error('[WA-QR] getStatus error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

export const startClient = async (req, res) => {
    if (!requireConfig(res)) return;
    try {
        await ensureInstance();
        const r = await evo.get(`/instance/connect/${EVO_INSTANCE_PATH}`);
        let qr = r.data?.base64 || r.data?.qrcode?.base64 || null;
        if (qr && !qr.startsWith('data:image')) qr = `data:image/png;base64,${qr}`;

        const conn = await fetchConnectionState();
        const state = conn.state || conn.status || 'connecting';
        res.json({ success: true, status: mapState(state, !!qr), qr });
    } catch (e) {
        console.error('[WA-QR] startClient error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

export const disconnectClient = async (req, res) => {
    if (!requireConfig(res)) return;
    try {
        // Logout is enough for a normal disconnect; the instance stays so we can re-pair fast.
        await evo.delete(`/instance/logout/${EVO_INSTANCE_PATH}`).catch(() => {});
        res.json({ success: true });
    } catch (e) {
        console.error('[WA-QR] disconnectClient error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

// ── CRM Endpoints ─────────────────────────────────────────────────────────────

export const markChatRead = async (req, res) => {
    if (!requireConfig(res)) return;
    const { chatId } = req.params;
    const messageIds = Array.isArray(req.body?.messageIds) ? req.body.messageIds : [];
    if (!chatId || messageIds.length === 0) {
        return res.json({ success: true, skipped: true });
    }
    try {
        const r = await evo.post(`/chat/markMessageAsRead/${EVO_INSTANCE_PATH}`, {
            readMessages: messageIds.map(id => ({ remoteJid: chatId, fromMe: false, id }))
        });
        res.json({ success: r.status < 400, count: messageIds.length });
    } catch (e) {
        // Don't fail the UI flow if marking-as-read fails — it's best-effort.
        console.warn('[WA-QR] markChatRead non-fatal:', e.response?.data || e.message);
        res.json({ success: false });
    }
};

export const getChats = async (req, res) => {
    if (!requireConfig(res)) return;
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo resolver el clubId.' });

        const chatsRes = await evo.post(`/chat/findChats/${EVO_INSTANCE_PATH}`, {});
        if (chatsRes.status >= 400) return res.status(400).json({ error: chatsRes.data?.message || 'WhatsApp no está conectado.' });

        const rows = Array.isArray(chatsRes.data) ? chatsRes.data : [];
        if (rows.length === 0) {
            return res.json({ success: true, chats: [] });
        }

        const jids = rows
            .map(c => c.remoteJid || c.id || c.chatId)
            .filter(Boolean);

        // Batch resolve and cache profiles using local DB
        const cachedContacts = await resolveAndCacheContacts(clubId, jids, rows);

        const enriched = rows
            .map(c => {
                const id = c.remoteJid || c.id || c.chatId;
                if (!id) return null;
                const isGroup = id.endsWith('@g.us');
                const timestampMs = Number(c.updatedAt ? new Date(c.updatedAt).getTime() : (c.messageTimestamp || c.lastMessageTimestamp || 0) * 1000) || 0;
                
                const fallback = id.split('@')[0];
                const dbContact = cachedContacts.get(id);

                // Resolution hierarchy:
                // 1. Saved name in local DB (dbContact.name) if it's not raw fallback
                // 2. pushName from Baileys
                // 3. subject from Group
                // 4. name / notify from Baileys
                // 5. Fallback phone
                let name = fallback;
                if (dbContact && dbContact.name && dbContact.name !== fallback) {
                    name = dbContact.name;
                } else if (c.pushName) {
                    name = c.pushName;
                } else if (c.subject) {
                    name = c.subject;
                } else if (c.name) {
                    name = c.name;
                } else if (dbContact && dbContact.name) {
                    name = dbContact.name;
                }

                return {
                    id,
                    name,
                    isGroup,
                    unreadCount: Number(c.unreadCount || c.unreadMessages || 0),
                    timestamp: Math.floor(timestampMs / 1000)
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50);

        res.json({ success: true, chats: enriched });
    } catch (e) {
        console.error('[WA-QR] getChats error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

export const getChatImage = async (req, res) => {
    if (!requireConfig(res)) return;
    const { chatId } = req.params;
    try {
        const clubId = await resolveClubId(req);
        let url = null;

        // Check local DB cache first
        if (clubId) {
            const cached = await db.query(
                `SELECT "profilePictureUrl" FROM "WhatsAppContact" WHERE "clubId" = $1 AND phone = $2 LIMIT 1`,
                [clubId, chatId]
            );
            if (cached.rows.length && cached.rows[0].profilePictureUrl) {
                url = cached.rows[0].profilePictureUrl;
            }
        }

        if (!url) {
            const r = await evo.post(`/chat/fetchProfilePictureUrl/${EVO_INSTANCE_PATH}`, { number: chatId });
            url = r.data?.profilePictureUrl || r.data?.url || null;
            
            // Background cache the image URL
            if (url && clubId) {
                await db.query(
                    `UPDATE "WhatsAppContact" SET "profilePictureUrl" = $1, "updatedAt" = NOW() WHERE "clubId" = $2 AND phone = $3`,
                    [url, clubId, chatId]
                ).catch(() => {});
            }
        }

        if (!url) return res.status(404).send('No profile picture');

        // Proxy the WhatsApp CDN through our server to dodge CORS and short-lived URLs in the browser.
        const imgRes = await fetch(url);
        if (!imgRes.ok) throw new Error('WhatsApp CDN error');

        const buffer = Buffer.from(await imgRes.arrayBuffer());
        res.setHeader('Content-Type', imgRes.headers.get('Content-Type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(buffer);
    } catch (e) {
        console.error('[WA-QR] getChatImage error:', e.response?.data || e.message);
        res.status(404).send('Error');
    }
};

export const getMessages = async (req, res) => {
    if (!requireConfig(res)) return;
    const { chatId } = req.params;
    try {
        const r = await evo.post(`/chat/findMessages/${EVO_INSTANCE_PATH}`, {
            where: { key: { remoteJid: chatId } },
            limit: 40
        });
        if (r.status >= 400) return res.status(400).json({ error: r.data?.message || 'No se pudieron obtener mensajes.' });

        const rows = Array.isArray(r.data) ? r.data : (r.data?.messages?.records || r.data?.records || []);
        const mapped = rows
            .map(m => {
                const key = m.key || {};
                const msg = m.message || {};
                const type = m.messageType || Object.keys(msg)[0] || 'unknown';
                const body =
                    msg.conversation ||
                    msg.extendedTextMessage?.text ||
                    msg.imageMessage?.caption ||
                    msg.videoMessage?.caption ||
                    msg.documentMessage?.caption ||
                    '';
                const mediaNode = msg.documentMessage || msg.imageMessage || msg.videoMessage || msg.audioMessage || msg.stickerMessage;
                const hasMedia = !!mediaNode;
                const filename = mediaNode?.fileName || mediaNode?.title || '';
                const mimetype = mediaNode?.mimetype || '';
                const ts = Number(m.messageTimestamp || m.timestamp || 0);
                return {
                    id: key.id || m.id || '',
                    fromMe: !!key.fromMe,
                    body,
                    timestamp: ts > 1e12 ? Math.floor(ts / 1000) : ts,
                    hasMedia,
                    type,
                    filename,
                    mimetype
                };
            })
            .filter(m => m.id)
            .sort((a, b) => b.timestamp - a.timestamp);

        res.json({ success: true, messages: mapped });
    } catch (e) {
        console.error('[WA-QR] getMessages error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

export const getMessageMedia = async (req, res) => {
    if (!requireConfig(res)) return;
    const { chatId, messageId } = req.params;
    try {
        const r = await evo.post(`/chat/getBase64FromMediaMessage/${EVO_INSTANCE_PATH}`, {
            message: { key: { id: messageId, remoteJid: chatId } },
            convertToMp4: false
        });
        if (r.status >= 400 || !r.data?.base64) {
            return res.status(404).json({ error: r.data?.message || 'Media expired or unavailable' });
        }
        const buffer = Buffer.from(r.data.base64, 'base64');
        res.setHeader('Content-Type', r.data.mimetype || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${r.data.fileName || 'media'}"`);
        res.send(buffer);
    } catch (e) {
        console.error('[WA-QR] getMessageMedia error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

export const sendMessage = async (req, res) => {
    if (!requireConfig(res)) return;
    const { chatId, message } = req.body;
    if (!chatId || !message) return res.status(400).json({ error: 'chatId and message are required' });
    try {
        const r = await evo.post(`/message/sendText/${EVO_INSTANCE_PATH}`, {
            number: normalizeJid(chatId),
            text: message
        });
        if (r.status >= 400) return res.status(400).json({ error: r.data?.message || 'No se pudo enviar el mensaje.' });

        const key = r.data?.key || {};
        const ts = Number(r.data?.messageTimestamp || Date.now() / 1000);
        res.json({
            success: true,
            message: {
                id: key.id || `local-${Date.now()}`,
                fromMe: true,
                body: message,
                timestamp: ts > 1e12 ? Math.floor(ts / 1000) : ts,
                hasMedia: false,
                type: 'conversation'
            }
        });
    } catch (e) {
        console.error('[WA-QR] sendMessage error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

export const sendMedia = async (req, res) => {
    if (!requireConfig(res)) return;
    const { chatId, caption, mediaData, filename, mimetype } = req.body;
    if (!chatId || !mediaData || !mimetype) {
        return res.status(400).json({ error: 'chatId, mediaData and mimetype are required' });
    }
    try {
        let mediatype = 'document';
        if (mimetype.startsWith('image/')) mediatype = 'image';
        else if (mimetype.startsWith('video/')) mediatype = 'video';
        else if (mimetype.startsWith('audio/')) mediatype = 'audio';

        const r = await evo.post(`/message/sendMedia/${EVO_INSTANCE_PATH}`, {
            number: normalizeJid(chatId),
            mediatype,
            mimetype,
            media: mediaData, // base64 (no data: prefix)
            fileName: filename || 'media',
            caption: caption || ''
        });
        if (r.status >= 400) return res.status(400).json({ error: r.data?.message || 'No se pudo enviar el archivo.' });

        const key = r.data?.key || {};
        const ts = Number(r.data?.messageTimestamp || Date.now() / 1000);
        res.json({
            success: true,
            message: {
                id: key.id || `local-${Date.now()}`,
                fromMe: true,
                body: caption || '[Multimedia]',
                timestamp: ts > 1e12 ? Math.floor(ts / 1000) : ts,
                hasMedia: true,
                type: mediatype
            }
        });
    } catch (e) {
        console.error('[WA-QR] sendMedia error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

// ── Webhook Handler ───────────────────────────────────────────────────────────

export const handleQrWebhook = async (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !payload.event) {
            return res.status(400).json({ error: 'Payload inválido' });
        }

        // Secure checking: only process events for our District instance
        if (payload.instance !== EVO_INSTANCE) {
            return res.json({ success: true, message: 'Instancia ignorada' });
        }

        const event = payload.event;
        const data = payload.data;

        // Resolve global district club ID
        const clubId = await resolveClubId(req);
        if (!clubId) {
            return res.json({ success: false, error: 'No club configured to assign contacts' });
        }

        if (event === 'contacts.upsert' || event === 'contacts.update') {
            const list = Array.isArray(data) ? data : [data];
            for (const item of list) {
                const jid = item.id || item.remoteJid;
                if (!jid) continue;

                const isGroup = jid.endsWith('@g.us');
                const source = isGroup ? 'whatsapp-qr-group' : 'whatsapp-qr';
                const name = item.name || item.pushName || item.verifiedName || item.notify || jid.split('@')[0];
                const picUrl = item.profilePictureUrl || item.avatar || null;

                const metadataObj = {
                    pushName: item.pushName || null,
                    verifiedName: item.verifiedName || null,
                    notify: item.notify || null,
                    profilePictureUrl: picUrl
                };

                await db.query(`
                    INSERT INTO "WhatsAppContact" (id, "clubId", name, phone, source, "profilePictureUrl", metadata, "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
                    ON CONFLICT (phone, "clubId")
                    DO UPDATE SET 
                        name = CASE WHEN "WhatsAppContact".source = 'manual' THEN "WhatsAppContact".name ELSE $2 END,
                        "profilePictureUrl" = COALESCE($5, "WhatsAppContact"."profilePictureUrl"),
                        metadata = "WhatsAppContact".metadata || $6,
                        "updatedAt" = NOW()
                `, [clubId, name, jid, source, picUrl, JSON.stringify(metadataObj)]).catch(e => {
                    console.error('[WA-QR] Webhook contact upsert DB error:', e.message);
                });
            }
        } else if (event === 'messages.upsert') {
            const list = Array.isArray(data) ? data : [data];
            for (const item of list) {
                const message = item.message || item;
                const key = message.key || {};
                const jid = key.remoteJid;
                const pushName = item.pushName || message.pushName;
                
                if (jid && pushName && !key.fromMe) {
                    const isGroup = jid.endsWith('@g.us');
                    const source = isGroup ? 'whatsapp-qr-group' : 'whatsapp-qr';
                    const name = pushName;
                    
                    const metadataObj = { pushName };

                    await db.query(`
                        INSERT INTO "WhatsAppContact" (id, "clubId", name, phone, source, metadata, "createdAt", "updatedAt")
                        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
                        ON CONFLICT (phone, "clubId")
                        DO UPDATE SET 
                            name = CASE 
                                WHEN "WhatsAppContact".source = 'manual' THEN "WhatsAppContact".name 
                                WHEN "WhatsAppContact".name = "WhatsAppContact".phone 
                                     OR "WhatsAppContact".name = split_part("WhatsAppContact".phone, '@', 1) 
                                     OR "WhatsAppContact".name ~ '^[0-9]+$' THEN $2
                                ELSE "WhatsAppContact".name 
                            END,
                            metadata = "WhatsAppContact".metadata || $5,
                            "updatedAt" = NOW()
                    `, [clubId, name, jid, source, JSON.stringify(metadataObj)]).catch(e => {
                        console.error('[WA-QR] Webhook message pushName DB error:', e.message);
                    });
                }
            }
        }

        res.json({ success: true });
    } catch (e) {
        console.error('[WA-QR] Webhook handler error:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ── Group Action Endpoints ───────────────────────────────────────────────────

export const createGroup = async (req, res) => {
    if (!requireConfig(res)) return;
    const { groupName, participants, description } = req.body;
    if (!groupName || !Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ error: 'groupName y participants (array) son requeridos.' });
    }
    try {
        const clubId = await resolveClubId(req, true);
        if (!clubId) return res.status(400).json({ error: 'No se pudo resolver el clubId.' });

        const jids = participants.map(p => normalizeJid(p));

        const r = await evo.post(`/group/create/${EVO_INSTANCE_PATH}`, {
            groupName,
            participants: jids,
            description: description || ''
        });

        if (r.status >= 400) {
            return res.status(r.status).json({ error: r.data?.message || 'No se pudo crear el grupo en WhatsApp.' });
        }

        const groupData = r.data || {};
        const groupJid = groupData.id || groupData.remoteJid || groupData.gid;
        if (!groupJid) {
            throw new Error('Evolution API no retornó el JID del nuevo grupo.');
        }

        // Cache the newly created group in local database
        const metadataObj = {
            description: description || '',
            participantsCount: jids.length,
            creator: req.user?.id || null
        };

        await db.query(`
            INSERT INTO "WhatsAppContact" (id, "clubId", name, phone, source, metadata, "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (phone, "clubId")
            DO UPDATE SET name = $2, metadata = "WhatsAppContact".metadata || $5, "updatedAt" = NOW()
        `, [clubId, groupName, groupJid, 'whatsapp-qr-group', JSON.stringify(metadataObj)]).catch(e => {
            console.error('[WA-QR] Group cache DB error:', e.message);
        });

        res.json({ success: true, group: { id: groupJid, name: groupName, participants: jids } });
    } catch (e) {
        console.error('[WA-QR] createGroup error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

export const updateGroupParticipants = async (req, res) => {
    if (!requireConfig(res)) return;
    const { groupJid } = req.params;
    const { action, participants } = req.body; // action: 'add' | 'remove'
    if (!groupJid || !action || !Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ error: 'groupJid, action (add/remove) y participants (array) son requeridos.' });
    }
    try {
        const jids = participants.map(p => normalizeJid(p));
        const r = await evo.post(`/group/updateParticipants/${EVO_INSTANCE_PATH}`, {
            groupJid,
            action,
            participants: jids
        });

        if (r.status >= 400) {
            return res.status(r.status).json({ error: r.data?.message || 'No se pudo actualizar los participantes del grupo.' });
        }

        res.json({ success: true, data: r.data });
    } catch (e) {
        console.error('[WA-QR] updateGroupParticipants error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

export const updateGroupMetadata = async (req, res) => {
    if (!requireConfig(res)) return;
    const { groupJid } = req.params;
    const { subject, description } = req.body;
    if (!groupJid) {
        return res.status(400).json({ error: 'groupJid es requerido.' });
    }
    try {
        const clubId = await resolveClubId(req, true);

        if (subject) {
            const rSubject = await evo.post(`/group/updateSubject/${EVO_INSTANCE_PATH}`, {
                groupJid,
                subject
            });
            if (rSubject.status >= 400) {
                return res.status(rSubject.status).json({ error: rSubject.data?.message || 'No se pudo actualizar el asunto del grupo.' });
            }
            // Update name in local DB
            if (clubId) {
                await db.query(
                    `UPDATE "WhatsAppContact" SET name = $1, "updatedAt" = NOW() WHERE phone = $2 AND "clubId" = $3`,
                    [subject, groupJid, clubId]
                ).catch(() => {});
            }
        }

        if (description !== undefined) {
            const rDesc = await evo.post(`/group/updateDescription/${EVO_INSTANCE_PATH}`, {
                groupJid,
                description: description || ''
            });
            if (rDesc.status >= 400) {
                return res.status(rDesc.status).json({ error: rDesc.data?.message || 'No se pudo actualizar la descripción del grupo.' });
            }
            // Update metadata in local DB
            if (clubId) {
                const metadataObj = { description: description || '' };
                await db.query(
                    `UPDATE "WhatsAppContact" SET metadata = metadata || $1, "updatedAt" = NOW() WHERE phone = $2 AND "clubId" = $3`,
                    [JSON.stringify(metadataObj), groupJid, clubId]
                ).catch(() => {});
            }
        }

        res.json({ success: true });
    } catch (e) {
        console.error('[WA-QR] updateGroupMetadata error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

// ── Contact Import Endpoint ──────────────────────────────────────────────────

export const importQrContacts = async (req, res) => {
    const { contacts, defaultCountryCode, listId, tags } = req.body;
    if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'contacts (array) es requerido y no puede estar vacío.' });
    }
    try {
        const clubId = await resolveClubId(req, true);
        if (!clubId) return res.status(400).json({ error: 'No se pudo resolver el clubId.' });

        const countryCode = defaultCountryCode || '57';
        const imported = [];
        const errors = [];
        const tagsArray = Array.isArray(tags) ? tags : [];

        for (const item of contacts) {
            const { name, phone, email } = item;
            if (!name) {
                errors.push({ item, error: 'Falta el nombre.' });
                continue;
            }
            const jid = normalizePhoneToJid(phone, countryCode);
            if (!jid) {
                errors.push({ item, error: 'Formato de teléfono inválido.' });
                continue;
            }

            try {
                // Upsert contact in DB
                const contactRes = await db.query(`
                    INSERT INTO "WhatsAppContact" (id, "clubId", name, phone, email, tags, source, "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
                    ON CONFLICT (phone, "clubId")
                    DO UPDATE SET 
                        name = COALESCE($2, "WhatsAppContact".name),
                        email = COALESCE($4, "WhatsAppContact".email),
                        tags = ARRAY(SELECT DISTINCT unnest(array_cat("WhatsAppContact".tags, $5))),
                        "updatedAt" = NOW()
                    RETURNING id, phone, name
                `, [clubId, name, jid, email || null, tagsArray, 'whatsapp-qr']);

                const contact = contactRes.rows[0];

                // If listId is provided, add contact to WhatsAppContactList membership
                if (listId && contact) {
                    await db.query(`
                        INSERT INTO "ContactListMember" (id, "listId", "contactId", "addedAt")
                        VALUES (gen_random_uuid(), $1, $2, NOW())
                        ON CONFLICT ("listId", "contactId") DO NOTHING
                    `, [listId, contact.id]).catch(e => {
                        console.error('[WA-QR] Error adding contact to list membership:', e.message);
                    });
                }

                imported.push(contact);
            } catch (e) {
                errors.push({ item, error: e.message });
            }
        }

        res.json({
            success: true,
            totalProcessed: contacts.length,
            importedCount: imported.length,
            errorCount: errors.length,
            imported,
            errors
        });
    } catch (e) {
        console.error('[WA-QR] importQrContacts error:', e.message);
        res.status(500).json({ error: e.message });
    }
};
