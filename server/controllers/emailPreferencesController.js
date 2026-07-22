import prisma from '../lib/prisma.js';
import EmailService from '../services/EmailService.js';

// v4.570 — Centro público de preferencias + doble opt-in (sin auth).
// Páginas HTML server-rendered branded por club: gestionar suscripción, datos y
// categorías (listas); confirmar suscripción (doble opt-in). Respeta optedOutAt.
console.log('[emailPreferencesController] v4.570 — centro de preferencias + doble opt-in');

const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Color primario del club desde su JSON de colores, con fallback a azul Rotary.
const primaryColor = (club) => {
    try {
        const c = typeof club?.colors === 'string' ? JSON.parse(club.colors) : club?.colors;
        return c?.primary || c?.brand || c?.main || '#0c3c7c';
    } catch { return '#0c3c7c'; }
};

const shell = (club, title, bodyHtml) => {
    const color = primaryColor(club);
    const logo = club?.logo || club?.avatarUrl;
    const header = logo
        ? `<img src="${esc(logo)}" alt="${esc(club?.name || '')}" style="max-height:56px;max-width:220px;margin:0 auto 8px;display:block">`
        : `<div style="font-size:20px;font-weight:800;color:${color}">${esc(club?.name || 'Club Platform')}</div>`;
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
    <body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f3f4f6;margin:0;padding:40px 16px;color:#374151">
        <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:32px 28px;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
            <div style="text-align:center;margin-bottom:20px">${header}</div>
            ${bodyHtml}
        </div>
        <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:20px">${esc(club?.name || '')}</p>
    </body></html>`;
};

const errorPage = (msg) => shell(null, 'Enlace inválido', `<h1 style="font-size:20px;color:#111827;text-align:center">Enlace inválido</h1><p style="text-align:center;color:#6b7280">${esc(msg)}</p>`);

// GET /api/public/preferences?cid=... — página de preferencias branded.
export const getPreferencesPage = async (req, res) => {
    const { cid } = req.query;
    try {
        if (!cid) return res.status(400).send(errorPage('No pudimos identificar tu suscripción.'));
        const contact = await prisma.crmContact.findUnique({ where: { id: String(cid) }, include: { club: true, listMemberships: true } });
        if (!contact) return res.status(404).send(errorPage('No encontramos tu suscripción.'));
        const club = contact.club;
        const color = primaryColor(club);
        const lists = await prisma.crmList.findMany({ where: { clubId: club.id }, orderBy: { name: 'asc' } });
        const memberSet = new Set(contact.listMemberships.map((m) => m.listId));
        const subscribed = !contact.optedOutAt;

        const listRows = lists.map((l) => `
            <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:8px;cursor:pointer">
                <input type="checkbox" class="lst" value="${esc(l.id)}" ${memberSet.has(l.id) ? 'checked' : ''} style="width:18px;height:18px;accent-color:${color}">
                <span style="font-weight:600;color:#374151">${esc(l.name)}</span>
                ${l.description ? `<span style="font-size:12px;color:#9ca3af">— ${esc(l.description)}</span>` : ''}
            </label>`).join('');

        const body = `
            <h1 style="font-size:20px;color:#111827;text-align:center;margin:0 0 4px">Tus preferencias de correo</h1>
            <p style="text-align:center;color:#6b7280;font-size:14px;margin:0 0 20px">${esc(contact.email || '')}</p>

            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#f9fafb;border-radius:12px;margin-bottom:18px">
                <div><div style="font-weight:700;color:#111827">Recibir correos</div><div style="font-size:12px;color:#9ca3af">Activa o pausa todos los envíos</div></div>
                <label style="position:relative;display:inline-block;width:48px;height:26px">
                    <input type="checkbox" id="subscribed" ${subscribed ? 'checked' : ''} style="opacity:0;width:0;height:0">
                    <span id="slider" style="position:absolute;inset:0;background:${subscribed ? color : '#d1d5db'};border-radius:26px;transition:.2s"></span>
                    <span id="knob" style="position:absolute;top:3px;left:${subscribed ? '25px' : '3px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:.2s"></span>
                </label>
            </div>

            <div style="margin-bottom:16px">
                <label style="display:block;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Nombre</label>
                <input id="name" type="text" value="${esc(contact.name || '')}" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px">
            </div>
            <div style="margin-bottom:16px">
                <label style="display:block;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Ciudad</label>
                <input id="city" type="text" value="${esc(contact.city || '')}" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px">
            </div>

            ${lists.length ? `<div style="margin-bottom:8px"><div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px">Categorías de contenido</div>${listRows}</div>` : ''}

            <button id="save" style="width:100%;margin-top:12px;padding:13px;background:${color};color:#fff;border:0;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">Guardar preferencias</button>
            <p id="msg" style="text-align:center;font-size:13px;color:#10b981;height:18px;margin:10px 0 0"></p>

            <script>
                var cid = ${JSON.stringify(String(cid))};
                var color = ${JSON.stringify(color)};
                var sub = document.getElementById('subscribed');
                sub.addEventListener('change', function(){
                    document.getElementById('slider').style.background = sub.checked ? color : '#d1d5db';
                    document.getElementById('knob').style.left = sub.checked ? '25px' : '3px';
                });
                document.getElementById('save').addEventListener('click', function(){
                    var btn = this; btn.disabled = true; btn.textContent = 'Guardando…';
                    var listIds = Array.prototype.slice.call(document.querySelectorAll('.lst:checked')).map(function(c){return c.value;});
                    fetch('/api/public/preferences', {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ cid: cid, name: document.getElementById('name').value, city: document.getElementById('city').value, optedOut: !sub.checked, listIds: listIds })
                    }).then(function(r){return r.json();}).then(function(d){
                        document.getElementById('msg').textContent = d.ok ? 'Preferencias guardadas ✓' : (d.error || 'No se pudo guardar');
                        document.getElementById('msg').style.color = d.ok ? '#10b981' : '#ef4444';
                    }).catch(function(){ document.getElementById('msg').textContent='Error de red'; document.getElementById('msg').style.color='#ef4444'; })
                    .then(function(){ btn.disabled=false; btn.textContent='Guardar preferencias'; });
                });
            </script>`;
        res.send(shell(club, 'Preferencias de correo', body));
    } catch (error) {
        console.error('[emailPreferences] getPreferencesPage:', error);
        res.status(500).send(errorPage('Ocurrió un error. Intenta más tarde.'));
    }
};

// POST /api/public/preferences — guarda datos, estado de suscripción y categorías (listas).
export const updatePreferences = async (req, res) => {
    try {
        const { cid, name, city, optedOut, listIds } = req.body || {};
        if (!cid) return res.status(400).json({ error: 'Falta cid' });
        const contact = await prisma.crmContact.findUnique({ where: { id: String(cid) } });
        if (!contact) return res.status(404).json({ error: 'No encontrado' });

        await prisma.crmContact.update({
            where: { id: contact.id },
            data: {
                ...(name !== undefined && { name: (name && String(name).trim()) || contact.name }),
                ...(city !== undefined && { city: city ? String(city).trim() : null }),
                optedOutAt: optedOut ? (contact.optedOutAt || new Date()) : null,
            },
        });

        if (Array.isArray(listIds)) {
            const clubLists = await prisma.crmList.findMany({ where: { clubId: contact.clubId }, select: { id: true } });
            const valid = new Set(clubLists.map((l) => l.id));
            const target = listIds.filter((id) => valid.has(id));
            const current = await prisma.contactListMember.findMany({ where: { contactId: contact.id } });
            const currentIds = new Set(current.map((m) => m.listId));
            const toRemove = [...currentIds].filter((id) => valid.has(id) && !target.includes(id));
            const toAdd = target.filter((id) => !currentIds.has(id));
            if (toRemove.length) await prisma.contactListMember.deleteMany({ where: { contactId: contact.id, listId: { in: toRemove } } });
            for (const listId of toAdd) {
                try { await prisma.contactListMember.create({ data: { contactId: contact.id, listId } }); } catch { /* duplicado */ }
            }
        }
        res.json({ ok: true });
    } catch (error) {
        console.error('[emailPreferences] updatePreferences:', error);
        res.status(500).json({ error: 'No se pudo guardar' });
    }
};

// Correo de confirmación (doble opt-in).
const confirmationEmailHtml = (club, confirmUrl) => {
    const color = primaryColor(club);
    return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#111827">Confirma tu suscripción</h2>
        <p style="color:#4b5563;line-height:1.6">Recibimos una solicitud para suscribirte a los correos de <strong>${esc(club?.name || '')}</strong>. Para completar tu suscripción, confirma que eres tú:</p>
        <p style="text-align:center;margin:28px 0"><a href="${esc(confirmUrl)}" style="background:${color};color:#fff;text-decoration:none;padding:13px 32px;border-radius:10px;font-weight:700;display:inline-block">Confirmar suscripción</a></p>
        <p style="color:#9ca3af;font-size:12px">Si no solicitaste esto, ignora este correo y no recibirás más mensajes.</p>
    </div>`;
};

// POST /api/public/subscribe — inicio del doble opt-in (crea/actualiza contacto 'pending' y envía confirmación).
export const subscribe = async (req, res) => {
    try {
        const { clubId, email, name, listIds } = req.body || {};
        if (!clubId || !isValidEmail(email)) return res.status(400).json({ error: 'Correo o sitio inválido' });
        const club = await prisma.club.findUnique({ where: { id: String(clubId) } });
        if (!club) return res.status(404).json({ error: 'Sitio no encontrado' });

        const cleanEmail = String(email).trim();
        let contact = await prisma.crmContact.findFirst({ where: { clubId: club.id, email: { equals: cleanEmail, mode: 'insensitive' } } });
        if (!contact) {
            contact = await prisma.crmContact.create({
                data: {
                    clubId: club.id, email: cleanEmail, phone: null,
                    name: (name && String(name).trim()) || cleanEmail.split('@')[0],
                    status: 'pending', source: 'suscripcion_web',
                },
            });
        } else if (contact.status !== 'active') {
            await prisma.crmContact.update({ where: { id: contact.id }, data: { status: 'pending', name: (name && String(name).trim()) || contact.name, optedOutAt: null } });
        }

        if (Array.isArray(listIds) && listIds.length) {
            const clubLists = await prisma.crmList.findMany({ where: { clubId: club.id }, select: { id: true } });
            const valid = new Set(clubLists.map((l) => l.id));
            for (const listId of listIds.filter((id) => valid.has(id))) {
                try { await prisma.contactListMember.create({ data: { contactId: contact.id, listId } }); } catch { /* dup */ }
            }
        }

        // Si ya está confirmado/activo, no reenviamos doble opt-in.
        if (contact.status === 'active') return res.json({ ok: true, alreadySubscribed: true });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const confirmUrl = `${baseUrl}/api/public/confirm?cid=${contact.id}`;
        await EmailService.sendEmail({
            clubId: club.id, to: cleanEmail,
            subject: `Confirma tu suscripción · ${club.name}`,
            html: confirmationEmailHtml(club, confirmUrl),
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('[emailPreferences] subscribe:', error);
        res.status(500).json({ error: 'No se pudo procesar la suscripción' });
    }
};

// GET /api/public/confirm?cid=... — confirma el doble opt-in.
export const confirmSubscription = async (req, res) => {
    const { cid } = req.query;
    try {
        if (!cid) return res.status(400).send(errorPage('Enlace inválido.'));
        const contact = await prisma.crmContact.findUnique({ where: { id: String(cid) }, include: { club: true } });
        if (!contact) return res.status(404).send(errorPage('No encontramos tu suscripción.'));
        await prisma.crmContact.update({ where: { id: contact.id }, data: { status: 'active', confirmedAt: new Date(), optedOutAt: null } });
        const color = primaryColor(contact.club);
        const body = `
            <h1 style="font-size:22px;color:#111827;text-align:center">¡Suscripción confirmada! 🎉</h1>
            <p style="text-align:center;color:#6b7280">Gracias por confirmar. A partir de ahora recibirás nuestros correos.</p>
            <p style="text-align:center;margin-top:20px"><a href="/api/public/preferences?cid=${esc(String(cid))}" style="color:${color};font-weight:700;text-decoration:none">Gestionar mis preferencias →</a></p>`;
        res.send(shell(contact.club, 'Suscripción confirmada', body));
    } catch (error) {
        console.error('[emailPreferences] confirmSubscription:', error);
        res.status(500).send(errorPage('Ocurrió un error. Intenta más tarde.'));
    }
};
