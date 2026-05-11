import axios from 'axios';

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
        const chatsRes = await evo.post(`/chat/findChats/${EVO_INSTANCE_PATH}`, {});
        if (chatsRes.status >= 400) return res.status(400).json({ error: chatsRes.data?.message || 'WhatsApp no está conectado.' });

        // Evolution's findChats often returns pushName=null for individual chats,
        // so cross-reference findContacts (which tracks pushName from incoming
        // messages and the device's address book) to fill in real display names.
        const contactNames = new Map();
        try {
            const contactsRes = await evo.post(`/chat/findContacts/${EVO_INSTANCE_PATH}`, {});
            const contactsRows = Array.isArray(contactsRes.data) ? contactsRes.data : [];
            for (const ct of contactsRows) {
                const jid = ct.remoteJid || ct.id;
                const name = ct.pushName || ct.name || ct.notify;
                if (jid && name) contactNames.set(jid, name);
            }
        } catch (e) {
            console.warn('[WA-QR] findContacts non-fatal:', e.response?.data || e.message);
        }

        // Group chats from findChats rarely include `subject`; fetch the group
        // metadata explicitly so they show their real name in the inbox.
        const groupSubjects = new Map();
        try {
            const groupsRes = await evo.get(`/group/fetchAllGroups/${EVO_INSTANCE_PATH}`, {
                params: { getParticipants: 'false' }
            });
            const groupsRows = Array.isArray(groupsRes.data) ? groupsRes.data : [];
            for (const g of groupsRows) {
                const jid = g.id || g.remoteJid;
                const subject = g.subject || g.name;
                if (jid && subject) groupSubjects.set(jid, subject);
            }
        } catch (e) {
            console.warn('[WA-QR] fetchAllGroups non-fatal:', e.response?.data || e.message);
        }

        const rows = Array.isArray(chatsRes.data) ? chatsRes.data : [];
        const enriched = rows
            .map(c => {
                const id = c.remoteJid || c.id || c.chatId;
                if (!id) return null;
                const isGroup = id.endsWith('@g.us');
                const timestampMs = Number(c.updatedAt ? new Date(c.updatedAt).getTime() : (c.messageTimestamp || c.lastMessageTimestamp || 0) * 1000) || 0;
                const fallback = id.split('@')[0];
                const name = isGroup
                    ? (groupSubjects.get(id) || c.subject || c.name || fallback)
                    : (c.pushName || contactNames.get(id) || c.name || fallback);
                return {
                    id,
                    name,
                    isGroup,
                    unreadCount: Number(c.unreadCount || c.unreadMessages || 0),
                    timestamp: Math.floor(timestampMs / 1000),
                    nameIsFallback: name === fallback
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50);

        // Last-resort: for the top chats that still don't have a real name,
        // hit Evolution's profile endpoint per JID. Capped to keep latency
        // bounded (max 10 lookups, 1s each, in parallel).
        const needsProfile = enriched.filter(c => c.nameIsFallback).slice(0, 10);
        if (needsProfile.length > 0) {
            await Promise.all(needsProfile.map(async (c) => {
                const endpoints = c.isGroup
                    ? [`/group/findGroupInfos/${EVO_INSTANCE_PATH}`]
                    : [`/chat/fetchProfile/${EVO_INSTANCE_PATH}`, `/chat/whatsappProfile/${EVO_INSTANCE_PATH}`];
                for (const ep of endpoints) {
                    try {
                        const r = c.isGroup
                            ? await evo.get(ep, { params: { groupJid: c.id }, timeout: 1500 })
                            : await evo.post(ep, { number: c.id }, { timeout: 1500 });
                        const data = r.data || {};
                        const candidate = data.subject || data.pushName || data.name || data.verifiedName || data.notify;
                        if (candidate && r.status < 400) {
                            c.name = candidate;
                            c.nameIsFallback = false;
                            break;
                        }
                    } catch (_) { /* try the next endpoint */ }
                }
            }));
        }

        const mapped = enriched.map(({ nameIsFallback, ...rest }) => rest);
        res.json({ success: true, chats: mapped });
    } catch (e) {
        console.error('[WA-QR] getChats error:', e.response?.data || e.message);
        res.status(500).json({ error: e.response?.data?.message || e.message });
    }
};

export const getChatImage = async (req, res) => {
    if (!requireConfig(res)) return;
    const { chatId } = req.params;
    try {
        const r = await evo.post(`/chat/fetchProfilePictureUrl/${EVO_INSTANCE_PATH}`, { number: chatId });
        const url = r.data?.profilePictureUrl || r.data?.url || null;
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
            number: chatId,
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
            number: chatId,
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
