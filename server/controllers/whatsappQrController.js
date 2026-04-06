import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
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
