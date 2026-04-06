import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode';

// Global state for the SuperAdmin WhatsApp Web connection
let waClient = null;
let qrCodeData = null;
let clientStatus = 'DISCONNECTED'; // DISCONNECTED, INITIALIZING, QR_READY, CONNECTED

export const getStatus = async (req, res) => {
    res.json({
        status: clientStatus,
        qr: clientStatus === 'QR_READY' ? qrCodeData : null
    });
};

export const startClient = async (req, res) => {
    // If it's already initializing or connected, just return current state
    if (clientStatus !== 'DISCONNECTED') {
        return res.json({ success: true, status: clientStatus, qr: qrCodeData });
    }

    clientStatus = 'INITIALIZING';
    qrCodeData = null;

    try {
        console.log('[WA-QR] Starting WhatsApp Web Client...');
        waClient = new Client({
            authStrategy: new LocalAuth({ clientId: 'superadmin-wa-session' }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote']
            }
        });

        waClient.on('qr', async (qr) => {
            console.log('[WA-QR] QR Code received');
            clientStatus = 'QR_READY';
            qrCodeData = await qrcode.toDataURL(qr);
        });

        waClient.on('ready', () => {
            console.log('[WA-QR] WhatsApp Web Client is ready and connected!');
            clientStatus = 'CONNECTED';
            qrCodeData = null;
        });

        waClient.on('authenticated', () => {
            console.log('[WA-QR] Authenticated successfully');
        });

        waClient.on('auth_failure', msg => {
            console.error('[WA-QR] Authentication failure', msg);
            clientStatus = 'DISCONNECTED';
            qrCodeData = null;
            if (waClient) {
                waClient.destroy().catch(console.error);
                waClient = null;
            }
        });

        waClient.on('disconnected', (reason) => {
            console.log('[WA-QR] Client was disconnected:', reason);
            clientStatus = 'DISCONNECTED';
            qrCodeData = null;
            if (waClient) {
                waClient.destroy().catch(console.error);
                waClient = null;
            }
        });

        // Event listener mapping out future integration with Agentes
        waClient.on('message', async (msg) => {
            // Optional: Forward incoming messages to the CRM or AI Agent logic 
            // Only listen if it's the connected super admin session
            if(msg.from === 'status@broadcast') return;
            // console.log(`[WA-QR] Incoming message from ${msg.from}: ${msg.body}`);
        });

        waClient.initialize();
        
        res.json({ success: true, status: clientStatus });
    } catch (e) {
        console.error('[WA-QR] Error starting client:', e);
        clientStatus = 'DISCONNECTED';
        res.status(500).json({ error: e.message });
    }
};

export const disconnectClient = async (req, res) => {
    console.log('[WA-QR] Disconnecting client...');
    try {
        if (waClient) {
            try { await waClient.logout(); } catch(e) {}
            try { await waClient.destroy(); } catch(e) {}
            waClient = null;
        }
        clientStatus = 'DISCONNECTED';
        qrCodeData = null;
        res.json({ success: true });
    } catch (e) {
        console.error('[WA-QR] Error disconnecting:', e);
        // Force reset
        clientStatus = 'DISCONNECTED';
        waClient = null;
        res.status(500).json({ error: e.message });
    }
};

// ── CRM Endpoints ───────────────────────────────────────────────────────────

export const getChats = async (req, res) => {
    if (clientStatus !== 'CONNECTED' || !waClient) {
        return res.status(400).json({ error: 'WhatsApp Web no está conectado.' });
    }
    try {
        const chats = await waClient.getChats();
        // Fetch top 50 recent to prioritize
        const recentChats = chats.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);

        const mappedChats = recentChats.map(c => ({
            id: c.id._serialized,
            name: c.name || c.id.user,
            isGroup: c.isGroup,
            unreadCount: c.unreadCount,
            timestamp: c.timestamp
        }));
        
        res.json({ success: true, chats: mappedChats });
    } catch (e) {
        console.error('[WA-QR] Error getting chats:', e);
        res.status(500).json({ error: e.message });
    }
};

export const getChatImage = async (req, res) => {
    if (clientStatus !== 'CONNECTED' || !waClient) {
        return res.status(400).json({ error: 'WhatsApp Web no está conectado.' });
    }
    const { chatId } = req.params;
    try {
        const profilePicUrl = await waClient.getProfilePicUrl(chatId);
        if (!profilePicUrl) {
            return res.status(404).send('No profile picture');
        }

        // Acting as a full proxy to avoid CORS and browser blocks
        const imgRes = await fetch(profilePicUrl);
        if (!imgRes.ok) throw new Error('WhatsApp CDN error');
        
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        res.setHeader('Content-Type', imgRes.headers.get('Content-Type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.send(buffer);
    } catch (e) {
        console.error('[WA-QR] Error getting chat image:', e);
        // Silently return 404 for frontend fallback
        res.status(404).send('Error');
    }
};

export const getMessages = async (req, res) => {
    if (clientStatus !== 'CONNECTED' || !waClient) {
        return res.status(400).json({ error: 'WhatsApp Web no está conectado.' });
    }
    const { chatId } = req.params;
    try {
        const chat = await waClient.getChatById(chatId);
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
        
        const messages = await chat.fetchMessages({ limit: 40 });
        
        const mappedMsgs = messages.map(m => ({
            id: m.id._serialized,
            fromMe: m.fromMe,
            body: m.body,
            timestamp: m.timestamp,
            hasMedia: m.hasMedia,
            type: m.type
        }));
        
        res.json({ success: true, messages: mappedMsgs });
    } catch (e) {
        console.error('[WA-QR] Error getting messages:', e);
        res.status(500).json({ error: e.message });
    }
};

export const getMessageMedia = async (req, res) => {
    if (clientStatus !== 'CONNECTED' || !waClient) {
        return res.status(400).json({ error: 'WhatsApp Web no está conectado.' });
    }
    const { chatId, messageId } = req.params;
    try {
        const chat = await waClient.getChatById(chatId);
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
        
        const messages = await chat.fetchMessages({ limit: 40 });
        const msg = messages.find(m => m.id._serialized === messageId || m.id.id === messageId);
        
        if (!msg) return res.status(404).json({ error: 'Message not found in recent history' });
        if (!msg.hasMedia) return res.status(400).json({ error: 'Message does not contain media' });
        
        const media = await msg.downloadMedia();
        if (!media) return res.status(404).json({ error: 'Media expired or unavailable' });
        
        const buffer = Buffer.from(media.data, 'base64');
        res.setHeader('Content-Type', media.mimetype);
        res.setHeader('Content-Disposition', `inline; filename="${media.filename || 'media'}"`);
        res.send(buffer);
    } catch (e) {
        console.error('[WA-QR] Error getting media for message:', e);
        res.status(500).json({ error: e.message });
    }
};

export const sendMessage = async (req, res) => {
    if (clientStatus !== 'CONNECTED' || !waClient) {
        return res.status(400).json({ error: 'WhatsApp Web no está conectado.' });
    }
    const { chatId, message } = req.body;
    if (!chatId || !message) {
         return res.status(400).json({ error: 'chatId and message are required' });
    }
    try {
        const response = await waClient.sendMessage(chatId, message);
        res.json({ 
            success: true, 
            message: {
                id: response.id._serialized,
                fromMe: response.fromMe,
                body: response.body,
                timestamp: response.timestamp,
                hasMedia: false,
                type: response.type
            }
        });
    } catch (e) {
        console.error('[WA-QR] Error sending message:', e);
        res.status(500).json({ error: e.message });
    }
};

export const sendMedia = async (req, res) => {
    if (clientStatus !== 'CONNECTED' || !waClient) {
        return res.status(400).json({ error: 'WhatsApp Web no está conectado.' });
    }
    const { chatId, caption, mediaData, filename, mimetype } = req.body;
    if (!chatId || !mediaData || !mimetype) {
         return res.status(400).json({ error: 'chatId, mediaData and mimetype are required' });
    }
    try {
        const media = new MessageMedia(mimetype, mediaData, filename);
        const response = await waClient.sendMessage(chatId, media, { caption });
        res.json({ 
            success: true, 
            message: {
                id: response.id._serialized,
                fromMe: response.fromMe,
                body: response.body || caption || '[Multimedia]',
                timestamp: response.timestamp,
                hasMedia: true,
                type: response.type
            }
        });
    } catch (e) {
        console.error('[WA-QR] Error sending media:', e);
        res.status(500).json({ error: e.message });
    }
};
