/**
 * whatsappCRMController.js
 * Controlador completo del CRM WhatsApp — Meta Cloud API
 * NOTA: Club.id es TEXT en esta BD (no UUID puro), todas las FKs son TEXT
 */

import db from '../lib/db.js';
import crypto from 'crypto';
import { s3 } from '../lib/storage.js';
import pkg from '@aws-sdk/client-s3';
const { PutObjectCommand } = pkg;

const WA_API_BASE = `https://graph.facebook.com/${process.env.WA_API_VERSION || 'v21.0'}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────────────

async function syncMetaMediaToS3(mediaId, token, clubId, fileExtension = 'jpg', folder = 'wa-media-in', customMime = 'image/jpeg') {
    try {
        const metaRes = await fetch(`${WA_API_BASE}/${mediaId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const metaData = await metaRes.json();
        if (!metaData.url) return null;
        
        const binRes = await fetch(metaData.url, { headers: { 'Authorization': `Bearer ${token}` } });
        const buffer = await binRes.arrayBuffer();
        
        const fileName = `${Date.now()}-${crypto.randomUUID().substring(0,8)}.${fileExtension}`;
        const key = `clubs/${clubId}/${folder}/${fileName}`;
        const bucket = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
        const contentType = binRes.headers.get('content-type') || customMime;
        
        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: Buffer.from(buffer),
            ContentType: contentType,
            ACL: 'public-read'
        }));
        
        return `https://${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
    } catch(e) {
        console.error('Error in syncMetaMediaToS3:', e);
        return null;
    }
}

/** Resolve clubId — super admins may not have clubId in JWT, fallback to first club with config */
async function resolveClubId(req, fromBody = false) {
    const src = fromBody ? req.body : req.query;
    const isAdmin = req.user?.role === 'administrator' || req.user?.role === 'superadmin';

    if (isAdmin && (src?.clubId || req.headers['x-club-id'])) {
        return src?.clubId || req.headers['x-club-id'];
    }
    
    if (req.user?.clubId) return req.user.clubId;
    
    // Super admin without explicit clubId → use first club that HAS a config
    const r = await db.query(`
        SELECT c.id FROM "Club" c 
        JOIN "WhatsAppConfig" wc ON wc."clubId" = c.id 
        ORDER BY wc."lastVerifiedAt" DESC NULLS LAST 
        LIMIT 1
    `);
    
    if (r.rows.length) return r.rows[0].id;

    // Last resort: first club in system
    const first = await db.query(`SELECT id FROM "Club" LIMIT 1`);
    return first.rows[0]?.id || null;
}

async function getClubConfig(clubId) {
    const r = await db.query(`SELECT * FROM "WhatsAppConfig" WHERE "clubId"=$1`, [clubId]);
    return r.rows[0] || null;
}

async function metaApiCall({ method = 'GET', path, body, token }) {
    const url = `${WA_API_BASE}${path}`;
    const opts = {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (data.error) throw new Error(`Meta API Error: ${data.error.message}`);
    return data;
}

/**
 * Upload media to Meta via the Media API using native FormData.
 * Downloads the file from the URL, then uploads to Meta.
 * Returns the media_id.
 */
async function uploadMediaToMeta({ url, type, phoneNumberId, token }) {
    console.log(`[WA] Downloading media from: ${url.substring(0, 80)}...`);
    const fileRes = await fetch(url);
    if (!fileRes.ok) throw new Error(`Failed to download media: ${fileRes.status}`);
    
    const arrayBuf = await fileRes.arrayBuffer();
    const blob = new Blob([arrayBuf], { 
        type: fileRes.headers.get('content-type') || (
            type === 'image' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : 'application/pdf'
        )
    });
    
    const filename = url.split('/').pop()?.split('?')[0] || `media.${type === 'image' ? 'jpg' : type === 'video' ? 'mp4' : 'pdf'}`;
    console.log(`[WA] Uploading ${filename} (${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)}MB) to Meta...`);

    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', blob.type);
    formData.append('file', blob, filename);

    const uploadRes = await fetch(`${WA_API_BASE}/${phoneNumberId}/media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
    });
    const uploadData = await uploadRes.json();
    if (uploadData.error) throw new Error(`Media upload: ${uploadData.error.message}`);
    console.log(`[WA] Media uploaded successfully -> ID: ${uploadData.id}`);
    return uploadData.id;
}

/**
 * Build the header component for a media template.
 * Strategy: use the public URL directly via 'link' to avoid Vercel timeouts from downloading/uploading.
 * Priority: user mediaUrl > saved headerContent > Meta API lookup
 */
async function buildMediaHeader({ template, mediaUrl, config }) {
    const mediaType = template.headerType === 'IMAGE' ? 'image'
        : template.headerType === 'VIDEO' ? 'video' : 'document';

    // Collect candidate URLs (prioritized)
    const candidates = [];
    if (mediaUrl && mediaUrl.startsWith('http')) candidates.push({ src: 'user', url: mediaUrl });
    if (template.headerContent && template.headerContent.startsWith('http')) {
        candidates.push({ src: 'saved', url: template.headerContent });
    }

    // Return the first valid URL as a link parameter
    for (const { src, url } of candidates) {
        console.log(`[WA] Using ${src} media link: ${url.substring(0, 70)}...`);
        return [{ type: 'header', parameters: [{ type: mediaType, [mediaType]: { link: url } }] }];
    }

    // Fallback: fetch header_url from Meta template API
    try {
        const metaTmpl = await metaApiCall({
            path: `/${config.wabaId}/message_templates?name=${template.name}&fields=components`,
            token: config.accessToken,
        });
        const metaTemplate = metaTmpl?.data?.[0];
        if (metaTemplate) {
            const headerComp = metaTemplate.components?.find(c => c.type === 'HEADER');
            const headerUrl = headerComp?.example?.header_url?.[0];
            if (headerUrl && headerUrl.startsWith('http')) {
                console.log('[WA] Using Meta API header_url link:', headerUrl.substring(0, 60));
                return [{ type: 'header', parameters: [{ type: mediaType, [mediaType]: { link: headerUrl } }] }];
            }
        }
    } catch (err) {
        console.error('[WA] Fetch template header failed:', err.message);
    }

    console.error('[WA] Could not build header component — no media link available');
    throw new Error(`Se requiere una URL pública para el encabezado de este template (${mediaType}). Por favor incluye un enlace a tu archivo multimedia antes de enviar.`);
}

function buildTemplateComponents(vars = {}) {
    const params = Object.values(vars).map(v => ({ type: 'text', text: String(v) }));
    if (!params.length) return [];
    return [{ type: 'body', parameters: params }];
}

// ── CONFIG ───────────────────────────────────────────────────────────────────

export const getConfig = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club' });
        const config = await getClubConfig(clubId);
        if (!config) return res.json({ configured: false });
        res.json({
            configured: true,
            id: config.id,
            phoneNumberId: config.phoneNumberId,
            wabaId: config.wabaId,
            appId: config.appId,
            enabled: config.enabled,
            lastVerifiedAt: config.lastVerifiedAt,
            accessTokenPreview: config.accessToken
                ? `${config.accessToken.slice(0, 8)}...${config.accessToken.slice(-4)}` : null,
        });
    } catch (err) {
        console.error('WA getConfig:', err);
        res.status(500).json({ error: err.message });
    }
};

export const upsertConfig = async (req, res) => {
    try {
        const clubId = await resolveClubId(req, true);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club' });
        const { phoneNumberId, wabaId, accessToken, verifyToken, appId, enabled } = req.body;
        const existing = await getClubConfig(clubId);
        if (!phoneNumberId || !wabaId || !accessToken)
            return res.status(400).json({ error: 'phoneNumberId, wabaId y accessToken son requeridos' });
        if (!existing && !verifyToken)
            return res.status(400).json({ error: 'verifyToken es requerido para la configuración inicial' });

        const newAccessToken = (existing && accessToken.includes('...')) ? existing.accessToken : accessToken;
        const newVerifyToken = verifyToken || (existing?.verifyToken || '');
        const isEnabled = enabled !== undefined ? enabled : true;

        let config;
        if (existing) {
            const r = await db.query(
                `UPDATE "WhatsAppConfig"
                 SET "phoneNumberId"=$1,"wabaId"=$2,"accessToken"=$3,"verifyToken"=$4,"appId"=$5,enabled=$6,"updatedAt"=NOW()
                 WHERE "clubId"=$7 RETURNING id,"phoneNumberId","wabaId",enabled,"lastVerifiedAt"`,
                [phoneNumberId, wabaId, newAccessToken, newVerifyToken, appId || null, isEnabled, clubId]
            );
            config = r.rows[0];
        } else {
            const configId = crypto.randomUUID();
            const r = await db.query(
                `INSERT INTO "WhatsAppConfig" (id,"clubId","phoneNumberId","wabaId","accessToken","verifyToken","appId",enabled,"createdAt","updatedAt")
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
                 RETURNING id,"phoneNumberId","wabaId",enabled,"lastVerifiedAt"`,
                [configId, clubId, phoneNumberId, wabaId, newAccessToken, newVerifyToken, appId || null, isEnabled]
            );
            config = r.rows[0];
        }
        res.json({ success: true, config });
    } catch (err) {
        console.error('WA upsertConfig:', err);
        res.status(500).json({ error: err.message });
    }
};

export const verifyConfig = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club' });
        const config = await getClubConfig(clubId);
        if (!config) return res.status(404).json({ error: 'No hay configuración guardada' });

        const data = await metaApiCall({
            path: `/${config.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`,
            token: config.accessToken,
        });
        await db.query(`UPDATE "WhatsAppConfig" SET "lastVerifiedAt"=NOW() WHERE "clubId"=$1`, [clubId]);
        res.json({ success: true, account: { verifiedName: data.verified_name, phoneNumber: data.display_phone_number, qualityRating: data.quality_rating } });
    } catch (err) {
        console.error('WA verifyConfig:', err);
        res.status(500).json({ error: `Error al verificar con Meta: ${err.message}` });
    }
};

// ── CONTACTOS ────────────────────────────────────────────────────────────────

export const getContacts = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const { search, status, listId, filter, limit = 200, offset = 0 } = req.query;

        let where = [`c."clubId"=$1`], params = [clubId], idx = 2;
        if (status && status !== 'all') { where.push(`c.status=$${idx++}`); params.push(status); }
        if (search) {
            where.push(`(c.name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.email ILIKE $${idx})`);
            params.push(`%${search}%`); idx++;
        }
        // Chat filters
        if (filter === 'archived') {
            where.push(`c."archivedAt" IS NOT NULL`);
        } else if (filter === 'unread') {
            where.push(`c."archivedAt" IS NULL`);
            where.push(`EXISTS (SELECT 1 FROM "WhatsAppMessageLog" ml WHERE ml."contactId"=c.id AND ml.direction='incoming' AND ml."readAt" IS NULL)`);
        } else if (filter !== 'all') {
            // Default: non-archived
            where.push(`(c."archivedAt" IS NULL)`);
        }

        let joinClause = '';
        if (listId) { joinClause = `JOIN "ContactListMember" m ON m."contactId"=c.id AND m."listId"=$${idx++}`; params.push(listId); }

        const countR = await db.query(
            `SELECT COUNT(*) FROM "WhatsAppContact" c ${joinClause} WHERE ${where.join(' AND ')}`, params
        );
        const result = await db.query(
            `SELECT c.*,
                COALESCE((SELECT json_agg(json_build_object('id',l.id,'name',l.name,'color',l.color))
                          FROM "ContactListMember" m2 JOIN "WhatsAppContactList" l ON l.id=m2."listId"
                          WHERE m2."contactId"=c.id),'[]') as lists,
                (SELECT json_build_object(
                    'bodyText', lm."bodyText",
                    'templateName', lm."templateName",
                    'direction', lm.direction,
                    'status', lm.status,
                    'createdAt', lm."createdAt"
                ) FROM "WhatsAppMessageLog" lm 
                WHERE lm."contactId"=c.id 
                ORDER BY lm."createdAt" DESC LIMIT 1) as "lastMessage",
                (SELECT COUNT(*)::int FROM "WhatsAppMessageLog" ml 
                WHERE ml."contactId"=c.id AND ml.direction='incoming' AND ml."readAt" IS NULL) as "unreadCount"
             FROM "WhatsAppContact" c ${joinClause}
             WHERE ${where.join(' AND ')}
             ORDER BY 
                COALESCE((SELECT MAX(lm2."createdAt") FROM "WhatsAppMessageLog" lm2 WHERE lm2."contactId"=c.id), c."createdAt") DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...params, parseInt(limit), parseInt(offset)]
        );
        res.json({ contacts: result.rows, total: parseInt(countR.rows[0].count) });
    } catch (err) {
        console.error('WA getContacts:', err);
        res.status(500).json({ error: err.message });
    }
};

export const createContact = async (req, res) => {
    try {
        const clubId = await resolveClubId(req, true);
        const { name, phone, email, tags = [], source = 'manual', metadata = {} } = req.body;
        if (!name || !phone) return res.status(400).json({ error: 'name y phone son requeridos' });
        const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
        const contactId = crypto.randomUUID();
        const r = await db.query(
            `INSERT INTO "WhatsAppContact" (id,"clubId",name,phone,email,tags,source,metadata,"createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING *`,
            [contactId, clubId, name, normalizedPhone, email || null, tags, source, JSON.stringify(metadata)]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Este número ya existe en el CRM de tu club' });
        console.error('WA createContact:', err);
        res.status(500).json({ error: err.message });
    }
};

export const updateContact = async (req, res) => {
    try {
        const { id } = req.params;
        const clubId = await resolveClubId(req);
        const { name, phone, email, tags, status, metadata } = req.body;
        const fields = [], params = []; let idx = 1;
        if (name !== undefined) { fields.push(`name=$${idx++}`); params.push(name); }
        if (phone !== undefined) { fields.push(`phone=$${idx++}`); params.push(phone); }
        if (email !== undefined) { fields.push(`email=$${idx++}`); params.push(email); }
        if (tags !== undefined) { fields.push(`tags=$${idx++}`); params.push(tags); }
        if (status !== undefined) {
            fields.push(`status=$${idx++}`); params.push(status);
            if (status === 'opted_out') fields.push(`"optedOutAt"=NOW()`);
        }
        if (metadata !== undefined) { fields.push(`metadata=$${idx++}`); params.push(JSON.stringify(metadata)); }
        fields.push(`"updatedAt"=NOW()`);
        params.push(id, clubId);
        const r = await db.query(
            `UPDATE "WhatsAppContact" SET ${fields.join(',')} WHERE id=$${idx++} AND "clubId"=$${idx++} RETURNING *`,
            params
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Contacto no encontrado' });
        res.json(r.rows[0]);
    } catch (err) {
        console.error('WA updateContact:', err);
        res.status(500).json({ error: err.message });
    }
};

export const archiveContact = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const { id } = req.params;
        const { archived } = req.body;
        const archivedAt = archived ? 'NOW()' : 'NULL';
        const r = await db.query(
            `UPDATE "WhatsAppContact" SET "archivedAt"=${archivedAt},"updatedAt"=NOW() WHERE id=$1 AND "clubId"=$2 RETURNING *`,
            [id, clubId]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Contacto no encontrado' });
        res.json(r.rows[0]);
    } catch (err) {
        console.error('WA archiveContact:', err);
        res.status(500).json({ error: err.message });
    }
};

export const markMessagesRead = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const { id } = req.params;
        await db.query(
            `UPDATE "WhatsAppMessageLog" SET "readAt"=NOW() WHERE "contactId"=$1 AND "clubId"=$2 AND direction='incoming' AND "readAt" IS NULL`,
            [id, clubId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('WA markMessagesRead:', err);
        res.status(500).json({ error: err.message });
    }
};

export const deleteContact = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        await db.query(`DELETE FROM "WhatsAppContact" WHERE id=$1 AND "clubId"=$2`, [req.params.id, clubId]);
        res.json({ success: true });
    } catch (err) {
        console.error('WA deleteContact:', err);
        res.status(500).json({ error: err.message });
    }
};

export const getContactMessages = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const contactId = req.params.id;
        // Get the contact phone
        const contactR = await db.query(`SELECT phone FROM "WhatsAppContact" WHERE id=$1 AND "clubId"=$2`, [contactId, clubId]);
        if (!contactR.rows.length) return res.status(404).json({ error: 'Contacto no encontrado' });
        const phone = contactR.rows[0].phone;
        // Try to get messages from WhatsAppMessageLog
        try {
            const r = await db.query(
                `SELECT id, "templateName", "bodyText", status, direction, "sentAt", "deliveredAt", "readAt", "failedAt", "createdAt"
                 FROM "WhatsAppMessageLog"
                 WHERE "clubId"=$1 AND phone=$2
                 ORDER BY "createdAt" ASC
                 LIMIT 200`,
                [clubId, phone]
            );
            res.json({ messages: r.rows.map(m => ({ ...m, direction: m.direction || 'outgoing' })) });
        } catch {
            // Table might not exist
            res.json({ messages: [] });
        }
    } catch (err) {
        console.error('WA getContactMessages:', err);
        res.status(500).json({ error: err.message });
    }
};

export const sendMessageToContact = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const contactId = req.params.id;
        const { templateId, text, mediaUrl, mediaType, fileName, vars = {} } = req.body;

        if (!templateId && !text && !mediaUrl) {
            return res.status(400).json({ error: 'Se requiere templateId, texto o contenido multimedia' });
        }

        // Get contact
        const contactR = await db.query(`SELECT * FROM "WhatsAppContact" WHERE id=$1 AND "clubId"=$2`, [contactId, clubId]);
        if (!contactR.rows.length) return res.status(404).json({ error: 'Contacto no encontrado' });
        const contact = contactR.rows[0];

        // Get config
        const config = await getClubConfig(clubId);
        if (!config || !config.enabled) return res.status(400).json({ error: 'WhatsApp no está configurado o habilitado' });

        let apiBody = {};
        let logTemplateName = null;
        let logBodyText = '';

        if (templateId) {
            // Send Template
            const tmplR = await db.query(`SELECT * FROM "WhatsAppTemplate" WHERE id=$1 AND "clubId"=$2`, [templateId, clubId]);
            if (!tmplR.rows.length) return res.status(404).json({ error: 'Template no encontrado' });
            const template = tmplR.rows[0];
            if (template.status !== 'approved') {
                return res.status(400).json({ error: 'Solo se pueden enviar templates aprobados por Meta' });
            }

            const components = [];
            if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)) {
                const headerComps = await buildMediaHeader({ template, mediaUrl: vars.mediaUrl, config });
                components.push(...headerComps);
            }
            const bodyVars = { ...vars };
            delete bodyVars.mediaUrl;
            const bodyComponents = buildTemplateComponents(bodyVars);
            if (bodyComponents.length > 0) components.push(...bodyComponents);

            const templatePayload = { name: template.name, language: { code: template.language } };
            if (components.length > 0) templatePayload.components = components;

            apiBody = {
                messaging_product: 'whatsapp',
                to: contact.phone,
                type: 'template',
                template: templatePayload,
            };
            logTemplateName = template.name;
            logBodyText = template.bodyText || `[Template: ${template.name}]`;
        } else if (mediaUrl && mediaType) {
            // Send Media (Image, Video, Document, Audio)
            const allowedMedia = ['image', 'video', 'document', 'audio'];
            const type = allowedMedia.includes(mediaType) ? mediaType : 'document';
            
            apiBody = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: contact.phone,
                type: type,
                [type]: { link: mediaUrl }
            };
            
            // Add captions and filename where appropriate
            if (text && type !== 'audio') {
                apiBody[type].caption = text;
            }
            if (fileName && type === 'document') {
                apiBody[type].filename = fileName;
            }
            
            // Encode the media URL in the body text so the UI knows how to render it
            logBodyText = `[MEDIA|${type}|${mediaUrl}] ${text || ''}`.trim();
        } else if (text) {
            // Send Free Text
            apiBody = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: contact.phone,
                type: 'text',
                text: { preview_url: false, body: text }
            };
            logBodyText = text;
        }

        const apiRes = await metaApiCall({
            method: 'POST',
            path: `/${config.phoneNumberId}/messages`,
            body: apiBody,
            token: config.accessToken,
        });

        const messageId = apiRes.messages?.[0]?.id;
        const msgLogId = crypto.randomUUID();

        // Log the message
        await db.query(
            `INSERT INTO "WhatsAppMessageLog" (id, "clubId","contactId",phone,"messageId","templateName","bodyText",status,direction,"sentAt","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,'sent','outgoing',NOW(),NOW(),NOW())`,
            [msgLogId, clubId, contact.id, contact.phone, messageId || null, logTemplateName, logBodyText]
        );
        await db.query(`UPDATE "WhatsAppContact" SET "totalSent"="totalSent"+1,"updatedAt"=NOW() WHERE id=$1`, [contact.id]);

        res.json({
            success: true,
            message: {
                id: msgLogId,
                templateName: logTemplateName,
                bodyText: logBodyText,
                status: 'sent',
                sentAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                direction: 'outgoing',
            },
        });
    } catch (err) {
        console.error('WA sendMessageToContact:', err);
        const errorMsg = err.message || 'Error desconocido';
        // Log failed attempt
        try {
            const clubId = await resolveClubId(req);
            const contactR = await db.query(`SELECT phone FROM "WhatsAppContact" WHERE id=$1`, [req.params.id]);
            if (contactR.rows.length) {
                const cfLogId = crypto.randomUUID();
                await db.query(
                    `INSERT INTO "WhatsAppMessageLog" (id, "clubId","contactId",phone,"templateName",status,direction,"errorMessage","failedAt","createdAt","updatedAt")
                     VALUES ($1,$2,$3,$4,$5,'failed','outgoing',$6,NOW(),NOW(),NOW())`,
                    [cfLogId, clubId, req.params.id, contactR.rows[0].phone, req.body.templateId || 'unknown', errorMsg]
                );
            }
        } catch { /* ignore logging error */ }
        res.status(500).json({ error: `Error al enviar: ${errorMsg}` });
    }
};

export const importContacts = async (req, res) => {
    try {
        const clubId = await resolveClubId(req, true);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club' });
        const { contacts, source = 'csv_import', countryCode = '+57' } = req.body;
        if (!Array.isArray(contacts) || !contacts.length)
            return res.status(400).json({ error: 'Se requiere un array de contactos' });

        // Phone normalization helper
        const normalizePhone = (raw) => {
            // Strip spaces, dashes, parentheses, dots
            let p = raw.replace(/[\s\-().]/g, '');
            // If already has +, keep it
            if (p.startsWith('+')) return p;
            // If starts with 00, replace with +
            if (p.startsWith('00')) return '+' + p.slice(2);
            // If starts with country code digits (e.g. 57), add +
            const cc = countryCode.replace('+', '');
            if (p.startsWith(cc) && p.length > cc.length + 7) return '+' + p;
            // Otherwise prepend full country code
            return countryCode + p;
        };

        let imported = 0, skipped = 0;
        for (const c of contacts) {
            if (!c.name || !c.phone) { skipped++; continue; }
            const phone = normalizePhone(c.phone.trim());
            const metadata = c.metadata || {};
            const contactId = crypto.randomUUID();
            await db.query(
                `INSERT INTO "WhatsAppContact" (id,"clubId",name,phone,email,tags,source,metadata,"createdAt","updatedAt")
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) ON CONFLICT (phone,"clubId") DO UPDATE SET
                 metadata = "WhatsAppContact".metadata || $8, "updatedAt" = NOW()`,
                [contactId, clubId, c.name, phone, c.email || null, Array.isArray(c.tags) ? c.tags : [], source, JSON.stringify(metadata)]
            ).then(r => r.rowCount ? imported++ : skipped++).catch(() => skipped++);
        }
        res.json({ success: true, imported, skipped });
    } catch (err) {
        console.error('WA importContacts:', err);
        res.status(500).json({ error: err.message });
    }
};

// Fix phone numbers that were imported without country code
export const fixPhoneNumbers = async (req, res) => {
    try {
        const clubId = await resolveClubId(req, true);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club' });
        const { countryCode = '+57' } = req.body;
        const cc = countryCode.replace('+', '');

        // Find contacts whose phone doesn't start with the full country code
        // Colombian mobile numbers start with 3, landlines with other digits
        // Pattern: +3XXXXXXXXX (10 digits after +) should be +573XXXXXXXXX
        const r = await db.query(
            `UPDATE "WhatsAppContact" 
             SET phone = $2 || SUBSTRING(phone FROM 2)
             WHERE "clubId" = $1
             AND phone LIKE '+%'
             AND phone NOT LIKE $3
             AND LENGTH(phone) BETWEEN 8 AND 13
             RETURNING id, phone`,
            [clubId, countryCode, `${countryCode}%`]
        );
        res.json({ success: true, fixed: r.rowCount, sample: r.rows.slice(0, 5) });
    } catch (err) {
        console.error('WA fixPhoneNumbers:', err);
        res.status(500).json({ error: err.message });
    }
};

export const importFromLeads = async (req, res) => {
    try {
        const clubId = await resolveClubId(req, true);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club' });
        const { leadIds } = req.body;
        let q, p = [clubId];
        if (leadIds === 'all') {
            q = `SELECT id,name,email,phone FROM "Lead" WHERE "clubId"=$1 AND phone IS NOT NULL`;
        } else if (Array.isArray(leadIds) && leadIds.length) {
            q = `SELECT id,name,email,phone FROM "Lead" WHERE "clubId"=$1 AND id=ANY($2::text[]) AND phone IS NOT NULL`;
            p.push(leadIds);
        } else return res.status(400).json({ error: 'Provee leadIds (array o "all")' });
        const leads = await db.query(q, p);
        let imported = 0, skipped = 0;
        for (const lead of leads.rows) {
            const phone = lead.phone.startsWith('+') ? lead.phone : `+${lead.phone}`;
            const contactId = crypto.randomUUID();
            await db.query(
                `INSERT INTO "WhatsAppContact" (id,"clubId",name,phone,email,source,"leadId","createdAt","updatedAt")
                 VALUES ($1,$2,$3,$4,$5,'lead_sync',$6,NOW(),NOW()) ON CONFLICT (phone,"clubId") DO NOTHING`,
                [contactId, clubId, lead.name, phone, lead.email || null, lead.id]
            ).then(r => r.rowCount ? imported++ : skipped++);
        }
        res.json({ success: true, imported, skipped, total: leads.rows.length });
    } catch (err) {
        console.error('WA importFromLeads:', err);
        res.status(500).json({ error: err.message });
    }
};

// ── LISTAS ───────────────────────────────────────────────────────────────────

export const getLists = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        let r;
        try {
            r = await db.query(
                `SELECT l.*, COUNT(m."contactId")::int as "memberCount"
                 FROM "WhatsAppContactList" l
                 LEFT JOIN "ContactListMember" m ON m."listId"=l.id
                 WHERE l."clubId"=$1 GROUP BY l.id ORDER BY l."createdAt" DESC`,
                [clubId]
            );
        } catch (joinErr) {
            // Fallback: ContactListMember table may not exist yet
            console.warn('getLists JOIN fallback:', joinErr.message);
            r = await db.query(
                `SELECT *, 0 as "memberCount" FROM "WhatsAppContactList" WHERE "clubId"=$1 ORDER BY "createdAt" DESC`,
                [clubId]
            );
        }
        res.json({ lists: r.rows });
    } catch (err) {
        console.error('WA getLists:', err);
        res.status(500).json({ error: err.message });
    }
};

export const createList = async (req, res) => {
    try {
        const { name, description, color = '#3B82F6' } = req.body;
        if (!name) return res.status(400).json({ error: 'name es requerido' });
        const clubId = await resolveClubId(req, true);
        const listId = crypto.randomUUID();
        const r = await db.query(
            `INSERT INTO "WhatsAppContactList" (id,"clubId",name,description,color,"createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING *`,
            [listId, clubId, name, description || null, color]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error('WA createList:', err);
        res.status(500).json({ error: err.message });
    }
};

export const updateList = async (req, res) => {
    try {
        const { name, description, color } = req.body;
        const r = await db.query(
            `UPDATE "WhatsAppContactList"
             SET name=COALESCE($1,name),description=COALESCE($2,description),color=COALESCE($3,color),"updatedAt"=NOW()
             WHERE id=$4 AND "clubId"=$5 RETURNING *`,
            [name, description, color, req.params.id, await resolveClubId(req)]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Lista no encontrada' });
        res.json(r.rows[0]);
    } catch (err) {
        console.error('WA updateList:', err);
        res.status(500).json({ error: err.message });
    }
};

export const deleteList = async (req, res) => {
    try {
        await db.query(`DELETE FROM "WhatsAppContactList" WHERE id=$1 AND "clubId"=$2`, [req.params.id, await resolveClubId(req)]);
        res.json({ success: true });
    } catch (err) {
        console.error('WA deleteList:', err);
        res.status(500).json({ error: err.message });
    }
};

export const addListMembers = async (req, res) => {
    try {
        const { contactIds } = req.body;
        if (!Array.isArray(contactIds) || !contactIds.length)
            return res.status(400).json({ error: 'contactIds debe ser un array no vacío' });
        let added = 0;
        for (const contactId of contactIds) {
            const memberId = crypto.randomUUID();
            const r = await db.query(
                `INSERT INTO "ContactListMember" (id,"listId","contactId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
                [memberId, req.params.id, contactId]
            );
            if (r.rowCount) added++;
        }
        res.json({ success: true, added });
    } catch (err) {
        console.error('WA addListMembers:', err);
        res.status(500).json({ error: err.message });
    }
};

export const removeListMembers = async (req, res) => {
    try {
        const { contactIds } = req.body;
        if (!Array.isArray(contactIds) || !contactIds.length)
            return res.status(400).json({ error: 'contactIds debe ser un array no vacío' });
        await db.query(
            `DELETE FROM "ContactListMember" WHERE "listId"=$1 AND "contactId"=ANY($2::text[])`,
            [req.params.id, contactIds]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('WA removeListMembers:', err);
        res.status(500).json({ error: err.message });
    }
};

// ── TEMPLATES ────────────────────────────────────────────────────────────────

export const getTemplates = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const r = await db.query(
            `SELECT * FROM "WhatsAppTemplate" WHERE "clubId"=$1 ORDER BY "createdAt" DESC`, [clubId]
        );
        res.json(r.rows);
    } catch (err) {
        console.error('WA getTemplates:', err);
        res.status(500).json({ error: err.message });
    }
};

export const createTemplate = async (req, res) => {
    try {
        const clubId = await resolveClubId(req, true);
        const { name, displayName, category = 'MARKETING', language = 'es',
            headerType, headerContent, bodyText, footerText, buttons = [] } = req.body;
        if (!name || !displayName || !bodyText)
            return res.status(400).json({ error: 'name, displayName y bodyText son requeridos' });
        const templateId = crypto.randomUUID();
        const r = await db.query(
            `INSERT INTO "WhatsAppTemplate" (id,"clubId",name,"displayName",category,language,"headerType","headerContent","bodyText","footerText",buttons,status,"createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',NOW(),NOW()) RETURNING *`,
            [templateId, clubId, name, displayName, category, language, headerType || null, headerContent || null, bodyText, footerText || null, JSON.stringify(buttons)]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error('WA createTemplate:', err);
        res.status(500).json({ error: err.message });
    }
};

export const updateTemplate = async (req, res) => {
    try {
        const { displayName, category, language, headerType, headerContent, bodyText, footerText, buttons, status } = req.body;
        const r = await db.query(
            `UPDATE "WhatsAppTemplate"
             SET "displayName"=COALESCE($1,"displayName"),category=COALESCE($2,category),
                 language=COALESCE($3,language),"headerType"=COALESCE($4,"headerType"),
                 "headerContent"=COALESCE($5,"headerContent"),"bodyText"=COALESCE($6,"bodyText"),
                 "footerText"=COALESCE($7,"footerText"),buttons=COALESCE($8,buttons),
                 status=COALESCE($9,status),"updatedAt"=NOW()
             WHERE id=$10 AND "clubId"=$11 RETURNING *`,
            [displayName, category, language, headerType, headerContent, bodyText, footerText,
                buttons ? JSON.stringify(buttons) : null, status, req.params.id, await resolveClubId(req)]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Template no encontrado' });
        res.json(r.rows[0]);
    } catch (err) {
        console.error('WA updateTemplate:', err);
        res.status(500).json({ error: err.message });
    }
};

export const deleteTemplate = async (req, res) => {
    try {
        await db.query(`DELETE FROM "WhatsAppTemplate" WHERE id=$1 AND "clubId"=$2`, [req.params.id, await resolveClubId(req)]);
        res.json({ success: true });
    } catch (err) {
        console.error('WA deleteTemplate:', err);
        res.status(500).json({ error: err.message });
    }
};

export const syncTemplatesFromMeta = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club' });
        const config = await getClubConfig(clubId);
        if (!config) return res.status(400).json({ error: 'WhatsApp no está configurado. Guarda tus credenciales de API primero.' });
        if (!config.accessToken || !config.wabaId) return res.status(400).json({ error: 'Faltan accessToken o wabaId en la configuración' });

        const data = await metaApiCall({
            path: `/${config.wabaId}/message_templates?fields=id,name,category,language,status,components`,
            token: config.accessToken,
        });

        if (!data?.data) return res.status(400).json({ error: 'No se obtuvieron templates de Meta. Verifica tus credenciales.' });

        let synced = 0;
        for (const t of data.data) {
            const bodyComp = t.components?.find(c => c.type === 'BODY');
            const headerComp = t.components?.find(c => c.type === 'HEADER');
            const footerComp = t.components?.find(c => c.type === 'FOOTER');
            const buttonComp = t.components?.find(c => c.type === 'BUTTONS');
            const displayName = t.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            // Save media URL from header example (header_url or header_handle)
            let headerContent = headerComp?.text || null;
            if (headerComp?.format && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
                const hUrl = headerComp.example?.header_url?.[0];
                const hHandle = headerComp.example?.header_handle?.[0];
                // Save the URL or handle for later use when sending
                headerContent = hUrl || hHandle || null;
                console.log(`[WA Sync] Template ${t.name}: header ${headerComp.format} -> ${(headerContent || 'none').substring(0, 60)}`);
            }

            try {
                // Check if template already exists by metaTemplateId
                const existing = await db.query(
                    `SELECT id FROM "WhatsAppTemplate" WHERE "metaTemplateId"=$1 AND "clubId"=$2 LIMIT 1`,
                    [t.id, clubId]
                );
                if (existing.rows.length) {
                    // Update existing
                    await db.query(
                        `UPDATE "WhatsAppTemplate" SET status=$1,"bodyText"=$2,"headerType"=$3,"headerContent"=$4,
                         "footerText"=$5,buttons=$6,category=$7,language=$8,"displayName"=$9,"updatedAt"=NOW()
                         WHERE "metaTemplateId"=$10 AND "clubId"=$11`,
                        [t.status?.toLowerCase() || 'pending', bodyComp?.text || '', headerComp?.format || null,
                         headerContent, footerComp?.text || null, JSON.stringify(buttonComp?.buttons || []),
                         t.category, t.language, displayName, t.id, clubId]
                    );
                } else {
                    // Insert new
                    const templateId = crypto.randomUUID();
                    await db.query(
                        `INSERT INTO "WhatsAppTemplate" (id,"clubId",name,"displayName",category,language,status,"headerType","headerContent","bodyText","footerText",buttons,"metaTemplateId","createdAt","updatedAt")
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())`,
                        [templateId, clubId, t.name, displayName, t.category, t.language, t.status?.toLowerCase() || 'pending',
                         headerComp?.format || null, headerContent, bodyComp?.text || '',
                         footerComp?.text || null, JSON.stringify(buttonComp?.buttons || []), t.id]
                    );
                }
                synced++;
            } catch (insertErr) {
                console.error(`WA syncTemplate error for ${t.name}:`, insertErr.message);
            }
        }
        res.json({ success: true, synced, total: data.data.length });
    } catch (err) {
        console.error('WA syncTemplates:', err);
        res.status(500).json({ error: err.message });
    }
};

// ── CAMPAÑAS ─────────────────────────────────────────────────────────────────

export const getCampaigns = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const r = await db.query(
            `SELECT c.*,l.name as "listName",t.name as "templateName",t."displayName" as "templateDisplayName"
             FROM "WhatsAppCampaign" c
             LEFT JOIN "WhatsAppContactList" l ON l.id=c."listId"
             LEFT JOIN "WhatsAppTemplate" t ON t.id=c."templateId"
             WHERE c."clubId"=$1 ORDER BY c."createdAt" DESC`,
            [clubId]
        );
        res.json(r.rows);
    } catch (err) {
        console.error('WA getCampaigns:', err);
        res.status(500).json({ error: err.message });
    }
};

export const createCampaign = async (req, res) => {
    try {
        const { name, description, listId, templateId, templateVars = {}, scheduledAt } = req.body;
        if (!name) return res.status(400).json({ error: 'name es requerido' });
        const clubId = await resolveClubId(req, true);
        const campId = crypto.randomUUID();
        const r = await db.query(
            `INSERT INTO "WhatsAppCampaign" (id,"clubId",name,description,"listId","templateId","templateVars","scheduledAt","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING *`,
            [campId, clubId, name, description || null, listId || null, templateId || null, JSON.stringify(templateVars), scheduledAt || null]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error('WA createCampaign:', err);
        res.status(500).json({ error: err.message });
    }
};

export const updateCampaign = async (req, res) => {
    try {
        const { name, description, listId, templateId, templateVars, scheduledAt, status } = req.body;
        const r = await db.query(
            `UPDATE "WhatsAppCampaign"
             SET name=COALESCE($1,name),description=COALESCE($2,description),"listId"=COALESCE($3,"listId"),
                 "templateId"=COALESCE($4,"templateId"),"templateVars"=COALESCE($5,"templateVars"),
                 "scheduledAt"=COALESCE($6,"scheduledAt"),status=COALESCE($7,status),"updatedAt"=NOW()
             WHERE id=$8 AND "clubId"=$9 RETURNING *`,
            [name, description, listId, templateId, templateVars ? JSON.stringify(templateVars) : null,
                scheduledAt, status, req.params.id, await resolveClubId(req)]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Campaña no encontrada' });
        // If resetting to draft, clean up failed logs so campaign can be re-sent
        if (status === 'draft') {
            await db.query(`DELETE FROM "WhatsAppMessageLog" WHERE "campaignId"=$1 AND status='failed'`, [req.params.id]).catch(() => {});
            await db.query(`UPDATE "WhatsAppCampaign" SET sent=0,failed=0,"totalContacts"=0,"sentAt"=NULL,"updatedAt"=NOW() WHERE id=$1`, [req.params.id]).catch(() => {});
        }
        res.json(r.rows[0]);
    } catch (err) {
        console.error('WA updateCampaign:', err);
        res.status(500).json({ error: err.message });
    }
};

export const deleteCampaign = async (req, res) => {
    try {
        await db.query(`DELETE FROM "WhatsAppCampaign" WHERE id=$1 AND "clubId"=$2`, [req.params.id, await resolveClubId(req)]);
        res.json({ success: true });
    } catch (err) {
        console.error('WA deleteCampaign:', err);
        res.status(500).json({ error: err.message });
    }
};

export const sendCampaign = async (req, res) => {
    const { id } = req.params;
    const clubId = await resolveClubId(req);
    try {
        const campR = await db.query(`SELECT * FROM "WhatsAppCampaign" WHERE id=$1 AND "clubId"=$2`, [id, clubId]);
        if (!campR.rows.length) return res.status(404).json({ error: 'Campaña no encontrada' });
        const campaign = campR.rows[0];

        if (!['draft', 'paused', 'failed'].includes(campaign.status))
            return res.status(400).json({ error: `No se puede enviar una campaña en estado "${campaign.status}"` });
        if (!campaign.listId) return res.status(400).json({ error: 'La campaña debe tener una lista asignada' });
        if (!campaign.templateId) return res.status(400).json({ error: 'La campaña debe tener un template asignado' });

        const config = await getClubConfig(clubId);
        if (!config || !config.enabled) return res.status(400).json({ error: 'WhatsApp no está configurado o habilitado' });

        const tmplR = await db.query(`SELECT * FROM "WhatsAppTemplate" WHERE id=$1 AND "clubId"=$2`, [campaign.templateId, clubId]);
        if (!tmplR.rows.length) return res.status(404).json({ error: 'Template no encontrado' });
        const template = tmplR.rows[0];
        if (template.status !== 'approved')
            return res.status(400).json({ error: 'Solo se pueden enviar templates aprobados por Meta' });

        const contactsR = await db.query(
            `SELECT c.* FROM "WhatsAppContact" c JOIN "ContactListMember" m ON m."contactId"=c.id
             WHERE m."listId"=$1 AND c.status='active'`,
            [campaign.listId]
        );
        const contacts = contactsR.rows;
        if (!contacts.length) return res.status(400).json({ error: 'La lista no tiene contactos activos' });

        await db.query(
            `UPDATE "WhatsAppCampaign" SET status='sending',"totalContacts"=$1,"sentAt"=NOW(),"updatedAt"=NOW() WHERE id=$2`,
            [contacts.length, id]
        );

        // Process ALL sends BEFORE responding (Vercel freezes after res.json)
        const vars = (() => { try { return JSON.parse(campaign.templateVars || '{}'); } catch { return {}; } })();
        let sent = 0, failed = 0;

        // Build header component (upload once, reuse for all contacts)
        const headerComponents = [];
        if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType)) {
            const hc = await buildMediaHeader({ template, mediaUrl: vars.mediaUrl, config });
            headerComponents.push(...hc);
        }
        const bodyVars = { ...vars };
        delete bodyVars.mediaUrl;
        const bodyComponents = buildTemplateComponents(bodyVars);
        const allComponents = [...headerComponents, ...bodyComponents];
        const templatePayload = { name: template.name, language: { code: template.language } };
        if (allComponents.length > 0) templatePayload.components = allComponents;

        // Check which contacts were already sent (in case of retry after timeout)
        const alreadySentR = await db.query(
            `SELECT "contactId" FROM "WhatsAppMessageLog" WHERE "campaignId"=$1 AND status IN ('sent','delivered','read')`,
            [id]
        );
        const alreadySentIds = new Set(alreadySentR.rows.map(r => r.contactId));
        const pendingContacts = contacts.filter(c => !alreadySentIds.has(c.id));

        // Send in parallel batches (10 concurrent) to fit within Vercel timeout
        const BATCH_SIZE = 10;
        const sendOne = async (contact) => {
            try {
                const apiRes = await metaApiCall({
                    method: 'POST',
                    path: `/${config.phoneNumberId}/messages`,
                    body: {
                        messaging_product: 'whatsapp',
                        to: contact.phone,
                        type: 'template',
                        template: templatePayload,
                    },
                    token: config.accessToken,
                });
                const messageId = apiRes.messages?.[0]?.id;
                const cMsgId = crypto.randomUUID();
                await db.query(
                    `INSERT INTO "WhatsAppMessageLog" (id,"clubId","campaignId","contactId",phone,"messageId","templateName",status,direction,"sentAt","createdAt","updatedAt")
                     VALUES ($1,$2,$3,$4,$5,$6,$7,'sent','outgoing',NOW(),NOW(),NOW())`,
                    [cMsgId, clubId, id, contact.id, contact.phone, messageId || null, template.name]
                );
                await db.query(`UPDATE "WhatsAppContact" SET "totalSent"="totalSent"+1,"updatedAt"=NOW() WHERE id=$1`, [contact.id]);
                return { ok: true };
            } catch (err) {
                const cfLogId = crypto.randomUUID();
                await db.query(
                    `INSERT INTO "WhatsAppMessageLog" (id,"clubId","campaignId","contactId",phone,"templateName",status,direction,"errorMessage","failedAt","createdAt","updatedAt")
                     VALUES ($1,$2,$3,$4,$5,$6,'failed','outgoing',$7,NOW(),NOW(),NOW())`,
                    [cfLogId, clubId, id, contact.id, contact.phone, template.name, err.message]
                ).catch(() => {});
                await db.query(`UPDATE "WhatsAppContact" SET "totalFailed"="totalFailed"+1,"updatedAt"=NOW() WHERE id=$1`, [contact.id]).catch(() => {});
                return { ok: false };
            }
        };

        for (let i = 0; i < pendingContacts.length; i += BATCH_SIZE) {
            const batch = pendingContacts.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(batch.map(c => sendOne(c)));
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value.ok) sent++;
                else failed++;
            }
        }

        // Include previously sent contacts in totals
        sent += alreadySentIds.size;

        // Update campaign with final stats
        const finalStatus = failed === contacts.length ? 'failed' : 'sent';
        await db.query(
            `UPDATE "WhatsAppCampaign" SET status=$1,sent=$2,failed=$3,"updatedAt"=NOW() WHERE id=$4`,
            [finalStatus, sent, failed, id]
        );

        res.json({
            success: true,
            message: `Campaña enviada: ${sent} enviados, ${failed} fallidos de ${contacts.length} contactos`,
            campaignId: id, sent, failed, total: contacts.length,
        });
    } catch (err) {
        console.error('WA sendCampaign:', err);
        await db.query(`UPDATE "WhatsAppCampaign" SET status='failed',"updatedAt"=NOW() WHERE id=$1`, [id]).catch(() => {});
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
};

export const getCampaignLogs = async (req, res) => {
    try {
        const r = await db.query(
            `SELECT l.*,c.name as "contactName"
             FROM "WhatsAppMessageLog" l
             LEFT JOIN "WhatsAppContact" c ON c.id=l."contactId"
             WHERE l."campaignId"=$1 ORDER BY l."createdAt" DESC LIMIT 500`,
            [req.params.id]
        );
        res.json(r.rows);
    } catch (err) {
        console.error('WA getCampaignLogs:', err);
        res.status(500).json({ error: err.message });
    }
};

// ── ANALYTICS ────────────────────────────────────────────────────────────────

export const getAnalytics = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const [contacts, campaigns, messages] = await Promise.all([
            db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='opted_out') as "optedOut" FROM "WhatsAppContact" WHERE "clubId"=$1`, [clubId]),
            db.query(`SELECT COUNT(*) as total, SUM(sent)::int as sent, SUM(delivered)::int as delivered, SUM(read)::int as "readCount", SUM(failed)::int as failed FROM "WhatsAppCampaign" WHERE "clubId"=$1 AND status='sent'`, [clubId]),
            db.query(`SELECT COUNT(*) FILTER (WHERE status='sent') as sent, COUNT(*) FILTER (WHERE status='delivered') as delivered, COUNT(*) FILTER (WHERE status='read') as "readCount", COUNT(*) FILTER (WHERE status='failed') as failed FROM "WhatsAppMessageLog" WHERE "clubId"=$1`, [clubId]),
        ]);
        res.json({ contacts: contacts.rows[0], campaigns: campaigns.rows[0], messages: messages.rows[0] });
    } catch (err) {
        console.error('WA getAnalytics:', err);
        res.status(500).json({ error: err.message });
    }
};

// ── WEBHOOK ──────────────────────────────────────────────────────────────────

export const verifyWebhook = async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode !== 'subscribe' || !token) return res.sendStatus(403);

    // 1. Check env var
    if (process.env.WA_VERIFY_TOKEN && token === process.env.WA_VERIFY_TOKEN)
        return res.status(200).send(challenge);

    // 2. Check stored configs in DB
    try {
        const r = await db.query(`SELECT id FROM "WhatsAppConfig" WHERE "verifyToken"=$1 LIMIT 1`, [token]);
        if (r.rows.length) return res.status(200).send(challenge);
    } catch (err) {
        // Table may not exist yet — try fallback
        console.error('Webhook verify DB check:', err.message);
    }

    // 3. Fallback: accept any non-empty token if no config exists yet (first setup)
    try {
        const r = await db.query(`SELECT COUNT(*) as cnt FROM "WhatsAppConfig"`);
        if (parseInt(r.rows[0]?.cnt || '0') === 0) {
            // No configs yet — accept the token so Meta can verify during initial setup
            console.log('[WA-CRM] No configs yet, accepting webhook verify token for initial setup');
            return res.status(200).send(challenge);
        }
    } catch (err) {
        // Table doesn't exist — also accept for initial setup
        console.log('[WA-CRM] WhatsAppConfig table not ready, accepting webhook verify');
        return res.status(200).send(challenge);
    }

    res.sendStatus(403);
};

export const handleWebhook = async (req, res) => {
    res.sendStatus(200); // Respond immediately to Meta
    try {
        const body = req.body;
        if (body.object !== 'whatsapp_business_account') return;
        const changes = body.entry?.[0]?.changes?.[0]?.value;
        if (!changes) return;

        // Resolve clubId from phoneNumberId in the webhook metadata
        const phoneNumberId = changes.metadata?.phone_number_id;
        let clubId = null;
        let clubToken = null;
        if (phoneNumberId) {
            const configR = await db.query(`SELECT "clubId", "accessToken" FROM "WhatsAppConfig" WHERE "phoneNumberId"=$1 ORDER BY "lastVerifiedAt" DESC LIMIT 1`, [phoneNumberId]);
            if (configR.rows.length) {
                clubId = configR.rows[0].clubId;
                clubToken = configR.rows[0].accessToken;
            }
        }

        // Handle incoming messages
        if (changes.messages && clubId) {
            for (const msg of changes.messages) {
                const from = msg.from; // sender phone number
                const normalizedPhone = from.startsWith('+') ? from : `+${from}`;
                const messageId = msg.id;
                const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

                // Extract message text based on type
                let bodyText = '';
                const msgType = msg.type || 'text';
                
                if (msgType === 'text') {
                    bodyText = msg.text?.body || '';
                } else if (['image', 'video', 'audio', 'document'].includes(msgType)) {
                    let mediaObj = msg[msgType];
                    let mediaUrl = null;
                    if (mediaObj && mediaObj.id && clubToken) {
                        let ext = msgType === 'image' ? 'jpg' : msgType === 'video' ? 'mp4' : msgType === 'audio' ? 'ogg' : 'pdf';
                        let mime = mediaObj.mime_type || (msgType === 'image' ? 'image/jpeg' : msgType === 'video' ? 'video/mp4' : 'application/pdf');
                        if (msgType === 'document' && mediaObj.filename) {
                            const parsedExt = mediaObj.filename.split('.').pop();
                            if (parsedExt) ext = parsedExt;
                        }
                        mediaUrl = await syncMetaMediaToS3(mediaObj.id, clubToken, clubId, ext, 'wa-media-in', mime);
                    }
                    const caption = mediaObj?.caption || (msgType === 'document' ? mediaObj?.filename : '');
                    if (mediaUrl) {
                        bodyText = `[MEDIA|${msgType}|${mediaUrl}] ${caption}`.trim();
                    } else {
                        bodyText = caption ? `[${msgType.toUpperCase()}] ${caption}` : `[${msgType.toUpperCase()} adjunto]`;
                    }
                } else if (msgType === 'sticker') {
                    bodyText = '[Sticker]';
                } else if (msg.type === 'location') {
                    bodyText = `[Ubicación: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
                } else if (msg.type === 'contacts') {
                    bodyText = '[Contacto compartido]';
                } else if (msg.type === 'reaction') {
                    bodyText = `[Reacción: ${msg.reaction?.emoji || ''}]`;
                } else if (msg.type === 'button') {
                    bodyText = msg.button?.text || '[Botón]';
                } else if (msg.type === 'interactive') {
                    bodyText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Interactivo]';
                } else {
                    bodyText = `[${msgType}]`;
                }

                // Find or create contact
                let contactId = null;
                const contactR = await db.query(
                    `SELECT id FROM "WhatsAppContact" WHERE "clubId"=$1 AND phone=$2 LIMIT 1`,
                    [clubId, normalizedPhone]
                );
                if (contactR.rows.length) {
                    contactId = contactR.rows[0].id;
                } else {
                    // Auto-create contact from incoming message
                    const contactName = changes.contacts?.[0]?.profile?.name || normalizedPhone;
                    try {
                        const newContactId = crypto.randomUUID();
                        const newContact = await db.query(
                            `INSERT INTO "WhatsAppContact" (id,"clubId",name,phone,source,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,'whatsapp',NOW(),NOW()) RETURNING id`,
                            [newContactId, clubId, contactName, normalizedPhone]
                        );
                        contactId = newContact.rows[0]?.id || null;
                    } catch { /* contact might already exist due to race condition */ }
                }

                // Save incoming message
                const incLogId = crypto.randomUUID();
                await db.query(
                    `INSERT INTO "WhatsAppMessageLog" (id, "clubId","contactId",phone,"messageId","bodyText",direction,status,"sentAt","createdAt","updatedAt")
                     VALUES ($1,$2,$3,$4,$5,$6,'incoming','received',$7,$7,NOW())
                     ON CONFLICT DO NOTHING`,
                    [incLogId, clubId, contactId, normalizedPhone, messageId, bodyText, timestamp]
                );
            }
        }

        // Handle status updates
        if (changes.statuses) {
            for (const s of changes.statuses) {
                const ts = s.timestamp ? new Date(parseInt(s.timestamp) * 1000) : new Date();
                const status = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }[s.status] || s.status;
                const logR = await db.query(`SELECT id,"campaignId","contactId" FROM "WhatsAppMessageLog" WHERE "messageId"=$1 LIMIT 1`, [s.id]);
                if (!logR.rows.length) continue;
                const log = logR.rows[0];
                const tsField = `"${status}At"`;

                // Capture error details if failed
                const errorCode = s.errors?.[0]?.code || null;
                const errorMsg = s.errors?.[0]?.title || s.errors?.[0]?.message || null;
                if (status === 'failed' && (errorCode || errorMsg)) {
                    await db.query(
                        `UPDATE "WhatsAppMessageLog" SET status='failed',"failedAt"=$1,"errorCode"=$2,"errorMessage"=$3,"updatedAt"=NOW() WHERE "messageId"=$4`,
                        [ts, String(errorCode), errorMsg, s.id]
                    );
                    console.error(`[WA Webhook] Message failed: ${s.id} - Code: ${errorCode} - ${errorMsg}`);
                } else {
                    await db.query(`UPDATE "WhatsAppMessageLog" SET status=$1,${tsField}=$2,"updatedAt"=NOW() WHERE "messageId"=$3`, [status, ts, s.id]);
                }

                if (log.campaignId && ['delivered', 'read', 'failed'].includes(status)) {
                    const cf = status === 'read' ? '"read"' : status;
                    await db.query(`UPDATE "WhatsAppCampaign" SET ${cf}=${cf}+1,"updatedAt"=NOW() WHERE id=$1`, [log.campaignId]).catch(() => {});
                }
                if (log.contactId && ['delivered', 'read', 'failed'].includes(status)) {
                    const fm = { delivered: '"totalDelivered"', read: '"totalRead"', failed: '"totalFailed"' };
                    await db.query(`UPDATE "WhatsAppContact" SET ${fm[status]}=${fm[status]}+1,"updatedAt"=NOW() WHERE id=$1`, [log.contactId]).catch(() => {});
                }
            }
        }
    } catch (err) {
        console.error('WA webhook error:', err);
    }
};

// ── AUTO-INIT — crea TODAS las tablas si no existen ──────────────────────────

export const ensureWATables = async () => {
    try {
        const r = await db.query(`SELECT to_regclass('"WhatsAppConfig"') as exists`);
        if (r.rows[0].exists) {
            console.log('[WA-CRM] Tables already exist');
            // Ensure indexes and new columns exist (idempotent migrations)
            await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_template_meta_id ON "WhatsAppTemplate" ("metaTemplateId") WHERE "metaTemplateId" IS NOT NULL`).catch(() => {});
            await db.query(`ALTER TABLE "WhatsAppMessageLog" ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'outgoing'`).catch(() => {});
            await db.query(`ALTER TABLE "WhatsAppContact" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ DEFAULT NULL`).catch(() => {});
            return;
        }

        console.log('[WA-CRM] Creating tables...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS "WhatsAppConfig" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL UNIQUE REFERENCES "Club"(id) ON DELETE CASCADE,
                "phoneNumberId" VARCHAR(100) NOT NULL DEFAULT '',
                "wabaId" VARCHAR(100) NOT NULL DEFAULT '',
                "accessToken" TEXT NOT NULL DEFAULT '',
                "verifyToken" VARCHAR(255) NOT NULL DEFAULT '',
                "appId" VARCHAR(100), enabled BOOLEAN NOT NULL DEFAULT TRUE,
                "lastVerifiedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS "WhatsAppContact" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL, phone VARCHAR(30) NOT NULL,
                email VARCHAR(255), tags TEXT[] DEFAULT '{}',
                source VARCHAR(50) NOT NULL DEFAULT 'manual',
                status VARCHAR(30) NOT NULL DEFAULT 'active',
                metadata JSONB DEFAULT '{}',
                "totalSent" INT NOT NULL DEFAULT 0, "totalDelivered" INT NOT NULL DEFAULT 0,
                "totalRead" INT NOT NULL DEFAULT 0, "totalFailed" INT NOT NULL DEFAULT 0,
                "optedOutAt" TIMESTAMPTZ, "leadId" TEXT,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(phone,"clubId")
            );
            CREATE TABLE IF NOT EXISTS "WhatsAppContactList" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL, description TEXT,
                color VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS "ContactListMember" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "listId" TEXT NOT NULL REFERENCES "WhatsAppContactList"(id) ON DELETE CASCADE,
                "contactId" TEXT NOT NULL REFERENCES "WhatsAppContact"(id) ON DELETE CASCADE,
                "addedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE("listId","contactId")
            );
            CREATE TABLE IF NOT EXISTS "WhatsAppTemplate" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL, "displayName" VARCHAR(255) NOT NULL,
                category VARCHAR(50) NOT NULL DEFAULT 'MARKETING',
                language VARCHAR(10) NOT NULL DEFAULT 'es',
                status VARCHAR(30) NOT NULL DEFAULT 'pending',
                "headerType" VARCHAR(20), "headerContent" TEXT,
                "bodyText" TEXT NOT NULL, "footerText" VARCHAR(255),
                buttons JSONB DEFAULT '[]', "metaTemplateId" VARCHAR(100),
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS "WhatsAppCampaign" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL, description TEXT,
                "listId" TEXT REFERENCES "WhatsAppContactList"(id),
                "templateId" TEXT REFERENCES "WhatsAppTemplate"(id),
                "templateVars" JSONB DEFAULT '{}',
                status VARCHAR(30) NOT NULL DEFAULT 'draft',
                "scheduledAt" TIMESTAMPTZ, "sentAt" TIMESTAMPTZ,
                "totalContacts" INT NOT NULL DEFAULT 0,
                sent INT NOT NULL DEFAULT 0, delivered INT NOT NULL DEFAULT 0,
                "read" INT NOT NULL DEFAULT 0, failed INT NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS "WhatsAppMessageLog" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL,
                "campaignId" TEXT REFERENCES "WhatsAppCampaign"(id) ON DELETE SET NULL,
                "contactId" TEXT REFERENCES "WhatsAppContact"(id) ON DELETE SET NULL,
                phone VARCHAR(30) NOT NULL, "messageId" VARCHAR(255),
                "templateName" VARCHAR(255), "bodyText" TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                "errorCode" VARCHAR(50), "errorMessage" TEXT,
                "sentAt" TIMESTAMPTZ, "deliveredAt" TIMESTAMPTZ,
                "readAt" TIMESTAMPTZ, "failedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_wa_msglog_messageid ON "WhatsAppMessageLog" ("messageId");
            CREATE INDEX IF NOT EXISTS idx_wa_msglog_campaign ON "WhatsAppMessageLog" ("campaignId", status);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_template_meta_id ON "WhatsAppTemplate" ("metaTemplateId") WHERE "metaTemplateId" IS NOT NULL;
        `);
        // Add direction column if it doesn't exist (for existing installations)
        await db.query(`ALTER TABLE "WhatsAppMessageLog" ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'outgoing'`).catch(() => {});
        console.log('[WA-CRM] All tables created');
    } catch (err) {
        console.error('[WA-CRM] Table init error:', err.message);
    }
    // Custom Fields table — separate query to ensure it gets created even if main batch had issues
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS "WhatsAppCustomField" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
                label VARCHAR(100) NOT NULL,
                key VARCHAR(100) NOT NULL,
                type VARCHAR(30) NOT NULL DEFAULT 'text',
                required BOOLEAN NOT NULL DEFAULT FALSE,
                "sortOrder" INT NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE("clubId", key)
            );
        `);
        console.log('[WA-CRM] CustomField table ensured');
    } catch (err) {
        console.error('[WA-CRM] CustomField table error:', err.message);
    }
};

ensureWATables();

// ── Custom Fields CRUD ──────────────────────────────────────────────────────

let _cfTableReady = false;
async function ensureCustomFieldTable() {
    if (_cfTableReady) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS "WhatsAppCustomField" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL REFERENCES "Club"(id) ON DELETE CASCADE,
                label VARCHAR(100) NOT NULL,
                key VARCHAR(100) NOT NULL,
                type VARCHAR(30) NOT NULL DEFAULT 'text',
                required BOOLEAN NOT NULL DEFAULT FALSE,
                "sortOrder" INT NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE("clubId", key)
            );
        `);
        _cfTableReady = true;
    } catch (e) {
        console.error('ensureCustomFieldTable:', e.message);
    }
}

export const getCustomFields = async (req, res) => {
    try {
        await ensureCustomFieldTable();
        const clubId = await resolveClubId(req);
        const r = await db.query(
            `SELECT * FROM "WhatsAppCustomField" WHERE "clubId"=$1 ORDER BY "sortOrder" ASC, "createdAt" ASC`,
            [clubId]
        );
        res.json({ fields: r.rows });
    } catch (err) {
        console.error('WA getCustomFields:', err);
        res.status(500).json({ error: err.message });
    }
};

export const createCustomField = async (req, res) => {
    try {
        await ensureCustomFieldTable();
        const clubId = await resolveClubId(req, true);
        const { label, type = 'text', required = false } = req.body;
        if (!label) return res.status(400).json({ error: 'label es requerido' });
        // Generate key from label
        const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        if (!key) return res.status(400).json({ error: 'El nombre del campo no es válido' });
        // Get max sortOrder
        const maxR = await db.query(`SELECT COALESCE(MAX("sortOrder"),0)+1 as next FROM "WhatsAppCustomField" WHERE "clubId"=$1`, [clubId]);
        const fieldId = crypto.randomUUID();
        const r = await db.query(
            `INSERT INTO "WhatsAppCustomField" (id,"clubId", label, key, type, required, "sortOrder","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING *`,
            [fieldId, clubId, label, key, type, required, maxR.rows[0].next]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un campo con ese nombre' });
        console.error('WA createCustomField:', err);
        res.status(500).json({ error: err.message });
    }
};

export const deleteCustomField = async (req, res) => {
    try {
        await ensureCustomFieldTable();
        const clubId = await resolveClubId(req);
        await db.query(`DELETE FROM "WhatsAppCustomField" WHERE id=$1 AND "clubId"=$2`, [req.params.id, clubId]);
        res.json({ success: true });
    } catch (err) {
        console.error('WA deleteCustomField:', err);
        res.status(500).json({ error: err.message });
    }
};
