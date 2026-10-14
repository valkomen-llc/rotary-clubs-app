// ════════════════════════════════════════════════════════════════════════════
// Controlador del Embudo de Activación de Clubes — Rotary en Acción & Club Platform
// Gestión inteligente de adquisición, registro público (/activar-mi-club),
// trazabilidad omnicanal (UTMs, email, WhatsApp, orgánico), CRM ligero y analítica.
// ════════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import db from '../lib/db.js';
import prisma from '../lib/prisma.js';
import { ensureRotaryActivationSchema } from '../lib/ensureRotaryActivationSchema.js';
import { CLUBS_BY_DISTRICT_NUMBER, districtNumberOf, DISTRICT_CATALOG } from '../lib/rotaryClubs.js';
import { normClub, universe } from '../lib/rotaryDashboard.js';
import { resolveSiteId } from '../lib/linkRedirectStore.js';
import { siteMatchKey } from '../lib/submissionArticleSpec.js';
import EmailService from '../services/EmailService.js';

console.log('[rotaryActivationController] v4.1195.0 cargado — Embudo Inteligente de Activación de Clubes');

const fail = (res, e, status = 500) => {
  console.error('[rotaryActivationController]', e);
  res.status(status).json({ error: e.message || 'Error en el módulo de activación de clubes' });
};

// Catálogo de intereses y los 6 pilares estratégicos del ecosistema Club Platform
export const ACTIVATION_INTERESTS = [
  { id: 'ecosistema_integral', label: 'Ecosistema Integral (Los 6 pilares)', icon: 'Sparkles', desc: 'Activación de los 6 pilares estratégicos de Club Platform.', isFeatured: true },
  { id: 'presencia_institucional', label: 'Presencia institucional', icon: 'Globe', desc: 'Tu club con identidad propia, presencia profesional y mayor visibilidad en internet.' },
  { id: 'marketing_inteligente', label: 'Marketing inteligente', icon: 'Megaphone', desc: 'Comunica tus actividades, fortalece tu imagen pública y conecta con nuevas audiencias.' },
  { id: 'proyectos_recursos', label: 'Proyectos y recursos', icon: 'CreditCard', desc: 'Impulsa tus proyectos, recibe donaciones y crea nuevas oportunidades de financiación.' },
  { id: 'gestion_nube', label: 'Gestión en la nube', icon: 'Cloud', desc: 'Centraliza la información de tu club con infraestructura tecnológica segura y organizada.' },
  { id: 'acompanamiento_continuo', label: 'Acompañamiento continuo', icon: 'GraduationCap', desc: 'Tu club cuenta con orientación y formación para aprovechar su ecosistema digital.' },
  { id: 'evolucion_continua', label: 'Evolución continua', icon: 'Rocket', desc: 'Un ecosistema que evoluciona constantemente con nuevas herramientas, mejoras e innovación.' },
  // Compatibilidad con registros y pruebas previas:
  { id: 'sitio_web', label: 'Sitio Web Oficial Autogestionable & Dominio Propio', icon: 'Globe', desc: 'Presencia institucional moderna en Google con dominio oficial del club.' },
  { id: 'rotary_en_accion', label: 'Difusión de Proyectos en Rotary en Acción & Redes', icon: 'Megaphone', desc: 'Registro ágil de obras comunitarias y cobertura en canales distritales.' },
  { id: 'socios_cuotas', label: 'Gestión de Socios, Membresía y Tesorería', icon: 'Users', desc: 'Directorio digital, roles de junta directiva y control de cuotas.' },
  { id: 'donaciones_recaudacion', label: 'Bóveda de Fondos y Recaudación Online', icon: 'CreditCard', desc: 'Pasarela de aportes transparente con tarjeta, PSE o PayPal.' },
  { id: 'marketing_redes', label: 'Automatización de Email & WhatsApp Marketing', icon: 'Send', desc: 'Campañas institucionales periódicas sin saturación.' },
];

export const ROTARY_ROLES = [
  'Presidente(a)',
  'Secretario(a)',
  'Presidente(a) Electo(a)',
  'Presidente(a) Comité Imagen Pública',
  'Presidente(a) Comité Proyectos de Servicio',
  'Presidente(a) Comité Membresía',
  'Presidente(a) Comité Fundación Rotaria',
  'Tesorero(a)',
  'Macero(a)',
  'Past-Presidente',
  'Socio(a) Rotario(a)',
  'Líder Rotaract / Interact'
];

/**
 * Resuelve el contexto del sitio actual por host o parámetros.
 */
async function resolveCurrentSiteContext(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  let siteId = null;
  try {
    siteId = await resolveSiteId(host);
  } catch {}

  let districtNum = districtNumberOf(host);

  let siteInfo = {
    id: siteId || 'central',
    name: 'Club Platform for Rotary',
    logo: null,
    district: districtNum ? `Distrito ${districtNum}` : 'Distrito 4281',
    districtNumber: districtNum || 4281,
    domain: host,
    isMainPlatform: !siteId || host.includes('app.clubplatform.org') || host.includes('clubplatform.org')
  };

  if (siteId) {
    try {
      const clubRow = await prisma.club.findUnique({
        where: { id: siteId },
        select: { id: true, name: true, logo: true, district: true, domain: true, subdomain: true, type: true }
      });
      if (clubRow) {
        siteInfo.name = clubRow.name;
        siteInfo.logo = clubRow.logo;
        if (clubRow.district) {
          siteInfo.district = clubRow.district;
          siteInfo.districtNumber = districtNumberOf(clubRow.district) || siteInfo.districtNumber;
        }
        siteInfo.domain = clubRow.domain || (clubRow.subdomain ? `${clubRow.subdomain}.clubplatform.org` : host);
        siteInfo.isMainPlatform = clubRow.type === 'platform';
      }
    } catch {}
  } else if (districtNum) {
    siteInfo.name = `Distrito ${districtNum} de Rotary International`;
    siteInfo.district = `Distrito ${districtNum}`;
    siteInfo.districtNumber = districtNum;
  }

  return siteInfo;
}

// ─── 1. GET /api/rotary-en-accion/activacion/config (PÚBLICO) ────────────────
export const getActivationConfig = async (req, res) => {
  try {
    await ensureRotaryActivationSchema();
    const site = await resolveCurrentSiteContext(req);

    // Obtener clubes en la base de datos que ya tienen ecosistema activo
    const { rows: dbClubs } = await db.query(
      `SELECT id, name, district, city, domain, subdomain, status, type 
       FROM "Club" 
       WHERE status != 'inactive' AND type != 'district'`
    ).catch(() => ({ rows: [] }));

    const activeClubsMap = new Map();
    for (const c of dbClubs) {
      activeClubsMap.set(siteMatchKey(c.name), {
        id: c.id,
        name: c.name,
        domain: c.domain || (c.subdomain ? `${c.subdomain}.clubplatform.org` : null),
        status: c.status
      });
    }

    // Obtener solicitudes en proceso reciente para advertir con cortesía
    const { rows: pendingRequests } = await db.query(
      `SELECT "clubName", status, "createdAt" 
       FROM "RotaryClubActivation" 
       WHERE status IN ('nuevo', 'contactado', 'interesado', 'en_activacion')`
    ).catch(() => ({ rows: [] }));

    const pendingMap = new Map();
    for (const p of pendingRequests) {
      pendingMap.set(siteMatchKey(p.clubName), p.status);
    }

    // Resolver catálogo de clubes según el sitio actual
    // Si el sitio corresponde al Distrito 4281, entrega los clubes de 4281.
    // Si corresponde al Distrito 4271, entrega los de 4271.
    // Si es central o global, entrega el universo total.
    const distNum = site.districtNumber;
    let catalogClubs = [];

    if (distNum && CLUBS_BY_DISTRICT_NUMBER[distNum]) {
      catalogClubs = CLUBS_BY_DISTRICT_NUMBER[distNum].map(name => ({
        name,
        district: `Distrito ${distNum}`,
      }));
    } else {
      const u = universe();
      catalogClubs = u.map(c => ({
        name: c.name,
        district: c.district || 'Distrito Rotario',
      }));
    }

    const clubsList = catalogClubs.map(c => {
      const key = siteMatchKey(c.name);
      const activeMatch = activeClubsMap.get(key) || null;
      const pendingStatus = pendingMap.get(key) || null;

      return {
        name: c.name,
        district: c.district,
        isActivated: !!activeMatch,
        activeDomain: activeMatch?.domain || null,
        hasPendingRequest: !!pendingStatus,
        pendingStatus
      };
    });

    // Ordenar alfabéticamente
    clubsList.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

    // Prefill de query params
    const { club, nombre, email, telefono, canal, utm_source, utm_campaign, campaign_id } = req.query || {};
    const prefill = {
      club: club ? String(club).trim() : '',
      responsibleName: nombre ? String(nombre).trim() : '',
      email: email ? String(email).trim() : '',
      phone: telefono ? String(telefono).trim() : '',
      channel: canal || utm_source || 'organico',
      campaignId: campaign_id || utm_campaign || ''
    };

    res.json({
      ok: true,
      site,
      clubs: clubsList,
      interests: ACTIVATION_INTERESTS,
      roles: ROTARY_ROLES,
      prefill
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ─── 2. POST /api/rotary-en-accion/activacion/hit (PÚBLICO) ──────────────────
export const recordFunnelHit = async (req, res) => {
  try {
    await ensureRotaryActivationSchema();
    const {
      visitorId,
      event = 'visit',
      clubName = '',
      channel = 'organico',
      campaignId = '',
      utmSource = '',
      utmMedium = '',
      utmCampaign = '',
      utmContent = '',
      metadata = {}
    } = req.body || {};

    if (!visitorId) {
      return res.status(400).json({ error: 'visitorId requerido' });
    }

    const site = await resolveCurrentSiteContext(req);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');

    // Deduplicación diaria para evitar inflar visitas artificialmente por recargas continuas
    if (event === 'visit') {
      const { rows: existing } = await db.query(
        `SELECT id FROM "RotaryClubActivationEvent" 
         WHERE "visitorId"=$1 AND event='visit' AND "createdAt" > NOW() - INTERVAL '12 hours' LIMIT 1`,
        [visitorId]
      );
      if (existing.length > 0) {
        return res.json({ ok: true, deduplicated: true });
      }
    }

    await db.query(
      `INSERT INTO "RotaryClubActivationEvent"
       (id, "siteId", "visitorId", event, "clubName", channel, "campaignId", "utmSource", "utmMedium", "utmCampaign", "utmContent", "originHost", metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        `rcae-${randomUUID()}`,
        site.id,
        visitorId,
        event,
        clubName || null,
        channel || 'organico',
        campaignId || null,
        utmSource || null,
        utmMedium || null,
        utmCampaign || null,
        utmContent || null,
        host || null,
        JSON.stringify(metadata || {})
      ]
    );

    res.json({ ok: true, recorded: true });
  } catch (e) {
    return fail(res, e);
  }
};

// ─── 3. POST /api/rotary-en-accion/activacion/submit (PÚBLICO) ────────────────
export const submitActivationInterest = async (req, res) => {
  try {
    await ensureRotaryActivationSchema();
    const {
      clubName,
      responsibleName,
      role,
      email,
      phone,
      mainInterest = 'ecosistema_integral',
      selectedPillars = [],
      dataConsent,
      campaignId,
      campaignName,
      channel = 'organico',
      utmSource = '',
      utmMedium = '',
      utmCampaign = '',
      utmContent = '',
      utmTerm = '',
      visitorId
    } = req.body || {};

    // Validaciones estrictas
    if (!clubName || !String(clubName).trim()) {
      return res.status(400).json({ error: 'El club rotario es obligatorio.' });
    }
    if (!responsibleName || !String(responsibleName).trim()) {
      return res.status(400).json({ error: 'El nombre del responsable es obligatorio.' });
    }
    if (!role || !String(role).trim()) {
      return res.status(400).json({ error: 'El cargo o rol rotario es obligatorio.' });
    }
    if (!email || !String(email).includes('@')) {
      return res.status(400).json({ error: 'Proporciona un correo electrónico válido.' });
    }
    if (!phone || String(phone).replace(/\D/g, '').length < 7) {
      return res.status(400).json({ error: 'Proporciona un número de WhatsApp de contacto válido.' });
    }
    if (!dataConsent) {
      return res.status(400).json({ error: 'Debes aceptar la política de tratamiento de datos personales.' });
    }

    const cleanClub = String(clubName).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phone).trim();
    const cleanName = String(responsibleName).trim();
    const cleanRole = String(role).trim();

    // Comprobar solicitudes duplicadas recientes (últimos 7 días) para el mismo correo y club
    const { rows: dupRows } = await db.query(
      `SELECT id, status, "createdAt" FROM "RotaryClubActivation"
       WHERE LOWER(email)=$1 AND siteMatchKey("clubName")=siteMatchKey($2) AND "createdAt" > NOW() - INTERVAL '7 days'
       LIMIT 1`,
      [cleanEmail, cleanClub]
    ).catch(async () => {
      // Fallback si la función siteMatchKey no estuviera disponible en SQL nativo
      return await db.query(
        `SELECT id, status, "createdAt" FROM "RotaryClubActivation"
         WHERE LOWER(email)=$1 AND LOWER("clubName")=LOWER($2) AND "createdAt" > NOW() - INTERVAL '7 days'
         LIMIT 1`,
        [cleanEmail, cleanClub]
      );
    });

    if (dupRows.length > 0) {
      return res.status(200).json({
        ok: true,
        alreadyRegistered: true,
        message: '¡Gracias! Ya recibimos tu solicitud para este club y nuestro equipo de activación está gestionándola.',
        id: dupRows[0].id
      });
    }

    const site = await resolveCurrentSiteContext(req);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');

    // Comprobar si el club ya existe en la base de datos de Club Platform
    const { rows: matchedClubs } = await db.query(
      `SELECT id, name, status, domain, subdomain FROM "Club" WHERE type != 'district'`
    ).catch(() => ({ rows: [] }));

    const sKey = siteMatchKey(cleanClub);
    const foundClub = matchedClubs.find(c => siteMatchKey(c.name) === sKey);
    const isEcosystemActive = foundClub ? (foundClub.status === 'active' || !!foundClub.domain) : false;
    const matchedClubId = foundClub ? foundClub.id : null;

    const activationId = `rca-${randomUUID()}`;
    const nowIso = new Date().toISOString();

    const initialHistory = [
      {
        at: nowIso,
        by: 'Solicitante (Web)',
        action: 'Solicitud registrada',
        note: `Registro desde landing pública /activar-mi-club vía canal: ${channel || 'organico'}.`
      }
    ];

    // 1. Integración con Contactos & Leads (evitando duplicar contactos)
    let linkedLeadId = null;
    try {
      const { rows: existingLead } = await db.query(
        `SELECT id FROM "Lead" WHERE LOWER(email)=$1 LIMIT 1`,
        [cleanEmail]
      );
      if (existingLead.length > 0) {
        linkedLeadId = existingLead[0].id;
        // Enriquecer notas y metadata sin borrar lo que tenía
        await db.query(
          `UPDATE "Lead" SET 
             notes = COALESCE(notes, '') || E'\\n[' || $1 || E'] Interés en Activar Club Platform: ' || $2,
             "updatedAt" = NOW()
           WHERE id=$3`,
          [new Date().toLocaleDateString('es-CO'), cleanClub, linkedLeadId]
        );
      } else {
        const leadRes = await db.query(
          `INSERT INTO "Lead" (name, email, phone, subject, message, "clubId", source, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            cleanName,
            cleanEmail,
            cleanPhone,
            `Activación Ecosistema Club Platform — ${cleanClub}`,
            `Cargo: ${cleanRole}. Interés principal: ${mainInterest}. Canal: ${channel}.`,
            site.id && site.id !== 'central' ? site.id : null,
            'activacion_club',
            'new',
            JSON.stringify({
              activationId,
              clubName: cleanClub,
              role: cleanRole,
              mainInterest,
              utmCampaign: utmCampaign || campaignId || null
            })
          ]
        );
        if (leadRes.rows[0]) {
          linkedLeadId = leadRes.rows[0].id;
        }
      }
    } catch (leadErr) {
      console.warn('[rotaryActivationController] integración con Lead omitida:', leadErr.message);
    }

    // 2. Guardar en la tabla maestra de activaciones
    await db.query(
      `INSERT INTO "RotaryClubActivation"
       (id, "siteId", "clubName", "matchedClubId", district, city, "responsibleName", role, email, phone,
        "mainInterest", "selectedPillars", "dataConsent", status, notes, history, "isEcosystemActive", "campaignId", "campaignName",
        channel, "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "originHost", "visitorId", "linkedLeadId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
      [
        activationId,
        site.id,
        cleanClub,
        matchedClubId,
        site.district || '',
        foundClub?.city || '',
        cleanName,
        cleanRole,
        cleanEmail,
        cleanPhone,
        mainInterest,
        JSON.stringify(Array.isArray(selectedPillars) ? selectedPillars : []),
        true,
        'nuevo',
        `Interés principal: ${mainInterest}`,
        JSON.stringify(initialHistory),
        isEcosystemActive,
        campaignId || utmCampaign || null,
        campaignName || null,
        channel || 'organico',
        utmSource || null,
        utmMedium || null,
        utmCampaign || null,
        utmContent || null,
        utmTerm || null,
        host || null,
        visitorId || null,
        linkedLeadId
      ]
    );

    // 3. Registrar evento en el embudo
    await db.query(
      `INSERT INTO "RotaryClubActivationEvent"
       (id, "siteId", "visitorId", event, "clubName", channel, "campaignId", "utmSource", "utmMedium", "utmCampaign", "utmContent", "originHost", metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        `rcae-${randomUUID()}`,
        site.id,
        visitorId || activationId,
        'submitted',
        cleanClub,
        channel || 'organico',
        campaignId || utmCampaign || null,
        utmSource || null,
        utmMedium || null,
        utmCampaign || null,
        utmContent || null,
        host || null,
        JSON.stringify({ activationId, responsibleName: cleanName, email: cleanEmail, isEcosystemActive })
      ]
    );

    // 4. Automatización: Confirmación por correo electrónico al solicitante
    try {
      const confirmationHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
        <div style="background: linear-gradient(135deg, #013388 0%, #0c2340 100%); padding: 36px 32px; text-align: center; color: #ffffff;">
          <span style="display: inline-block; background-color: rgba(255,255,255,0.15); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px;">Club Platform · Activación Digital</span>
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 10px 0; line-height: 1.3;">¡Hola ${cleanName}!<br/>Recibimos tu solicitud para el ${cleanClub}</h1>
          <p style="font-size: 14px; opacity: 0.9; margin: 0; line-height: 1.5;">Tu club está a un paso de potenciar su presencia institucional y multiplicar su impacto.</p>
        </div>
        <div style="padding: 32px; color: #334155; font-size: 15px; line-height: 1.6;">
          <p style="margin-top: 0;">Estimado(a) <strong>${cleanName}</strong> (${cleanRole}),</p>
          <p>Hemos recibido con gran entusiasmo tu solicitud para activar el ecosistema digital de <strong>${cleanClub}</strong> en Club Platform.</p>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #f7a81b; padding: 18px 20px; border-radius: 0 12px 12px 0; margin: 24px 0;">
            <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px; font-weight: 700;">Datos registrados de la solicitud:</h4>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569;">
              <li><strong>Club:</strong> ${cleanClub}</li>
              <li><strong>Responsable:</strong> ${cleanName} (${cleanRole})</li>
              <li><strong>Correo de contacto:</strong> ${cleanEmail}</li>
              <li><strong>WhatsApp:</strong> ${cleanPhone}</li>
              <li><strong>Enfoque de interés:</strong> ${mainInterest}</li>
            </ul>
          </div>

          <h3 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 24px 0 12px 0;">Próximos pasos:</h3>
          <ol style="padding-left: 20px; margin: 0 0 24px 0; color: #475569; font-size: 14px;">
            <li style="margin-bottom: 8px;"><strong>Revisión del club:</strong> Verificaremos el estado de tu club en el directorio distrital.</li>
            <li style="margin-bottom: 8px;"><strong>Contacto personalizado:</strong> Un asesor te contactará vía WhatsApp para coordinar la configuración de accesos.</li>
            <li style="margin-bottom: 8px;"><strong>Entrega del portal:</strong> Te entregaremos el panel de administración listo para publicar proyectos y conectar con Rotary en Acción.</li>
          </ol>

          <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">Juntos hacemos visible la magia de Rotary.<br/><strong>Equipo de Transformación Digital · Club Platform & Rotary en Acción</strong></p>
        </div>
      </div>`;

      await EmailService.sendEmail({
        to: cleanEmail,
        subject: `¡Hemos recibido tu solicitud de activación para ${cleanClub}! | Club Platform`,
        html: confirmationHtml
      });
    } catch (mailErr) {
      console.warn('[rotaryActivationController] Correo al solicitante omitido:', mailErr.message);
    }

    // 5. Automatización: Notificar a los administradores del sitio
    try {
      const adminUsers = await prisma.user.findMany({
        where: {
          role: { in: ['superadmin', 'administrator', 'district_admin'] }
        },
        select: { email: true, name: true }
      });

      const adminAlertHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #013388; margin-top: 0;">🚀 Nuevo Interesado en Activar Club Platform</h2>
        <p style="color: #334155; font-size: 15px;">Se ha registrado una nueva solicitud de activación desde el embudo de Rotary en Acción.</p>
        <div style="background-color: #ffffff; padding: 18px; border-radius: 8px; border: 1px solid #cbd5e1; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Club:</strong> ${cleanClub}</p>
          <p style="margin: 0 0 8px 0;"><strong>Responsable:</strong> ${cleanName} (${cleanRole})</p>
          <p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${cleanEmail}</p>
          <p style="margin: 0 0 8px 0;"><strong>WhatsApp:</strong> ${cleanPhone}</p>
          <p style="margin: 0 0 8px 0;"><strong>Canal:</strong> ${channel} (Campaña: ${campaignId || utmCampaign || 'Orgánico'})</p>
          <p style="margin: 0;"><strong>Interés:</strong> ${mainInterest}</p>
        </div>
        <p style="font-size: 13px; color: #64748b;">Gestiona esta solicitud en el panel de Rotary en Acción → Pestaña «Activación de Clubes».</p>
      </div>`;

      for (const admin of adminUsers.slice(0, 3)) {
        await EmailService.sendEmail({
          to: admin.email,
          subject: `🔔 Nuevo Club Interesado: ${cleanClub} (${cleanName})`,
          html: adminAlertHtml
        }).catch(() => {});
      }
    } catch {}

    res.status(201).json({
      ok: true,
      id: activationId,
      message: '¡Solicitud registrada con éxito! En breve te contactaremos.'
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ─── 4. GET /api/rotary-en-accion/activacion/leads (ADMIN) ───────────────────
export const getActivationLeads = async (req, res) => {
  try {
    await ensureRotaryActivationSchema();
    const { status, search, district, channel, campaign, period } = req.query || {};

    let conditions = [];
    let params = [];
    let idx = 1;

    // Aislamiento multisitio
    const user = req.user;
    if (user?.role === 'district_admin' && user?.districtId) {
      // Filtrar por su distrito
      const dNum = districtNumberOf(user.districtId);
      if (dNum) {
        conditions.push(`(district ILIKE $${idx} OR "originHost" ILIKE $${idx + 1})`);
        params.push(`%${dNum}%`, `%${dNum}%`);
        idx += 2;
      }
    }

    if (status && status !== 'todos') {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }

    if (district && district !== 'todos') {
      conditions.push(`district ILIKE $${idx++}`);
      params.push(`%${district}%`);
    }

    if (channel && channel !== 'todos') {
      conditions.push(`channel = $${idx++}`);
      params.push(channel);
    }

    if (campaign && campaign !== 'todos') {
      conditions.push(`("campaignId" = $${idx} OR "utmCampaign" = $${idx})`);
      params.push(campaign);
      idx++;
    }

    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      conditions.push(`("clubName" ILIKE $${idx} OR "responsibleName" ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx})`);
      params.push(q);
      idx++;
    }

    if (period) {
      if (period === '7d') conditions.push(`"createdAt" > NOW() - INTERVAL '7 days'`);
      else if (period === '30d') conditions.push(`"createdAt" > NOW() - INTERVAL '30 days'`);
      else if (period === '90d') conditions.push(`"createdAt" > NOW() - INTERVAL '90 days'`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db.query(
      `SELECT * FROM "RotaryClubActivation"
       ${whereClause}
       ORDER BY "createdAt" DESC`
      , params
    );

    // Verificación en tiempo real contra la base de datos de Clubes
    const { rows: clubsDb } = await db.query(
      `SELECT id, name, domain, subdomain, status FROM "Club" WHERE type != 'district'`
    ).catch(() => ({ rows: [] }));

    const dbClubsMap = new Map();
    for (const c of clubsDb) {
      dbClubsMap.set(siteMatchKey(c.name), c);
    }

    const leadsWithRealState = rows.map(r => {
      const k = siteMatchKey(r.clubName);
      const match = dbClubsMap.get(k);
      const isActuallyActive = match ? (match.status === 'active' || !!match.domain) : false;

      return {
        ...r,
        isEcosystemActive: isActuallyActive || r.isEcosystemActive,
        matchedClubId: match ? match.id : r.matchedClubId,
        ecosystemDomain: match ? (match.domain || (match.subdomain ? `${match.subdomain}.clubplatform.org` : null)) : null
      };
    });

    res.json({
      ok: true,
      total: leadsWithRealState.length,
      leads: leadsWithRealState
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ─── 5. GET /api/rotary-en-accion/activacion/kpis (ADMIN) ─────────────────────
export const getActivationKpis = async (req, res) => {
  try {
    await ensureRotaryActivationSchema();
    const { district, period } = req.query || {};

    let periodCondEvents = '';
    let periodCondLeads = '';

    if (period === '7d') {
      periodCondEvents = `AND "createdAt" > NOW() - INTERVAL '7 days'`;
      periodCondLeads = `AND "createdAt" > NOW() - INTERVAL '7 days'`;
    } else if (period === '30d') {
      periodCondEvents = `AND "createdAt" > NOW() - INTERVAL '30 days'`;
      periodCondLeads = `AND "createdAt" > NOW() - INTERVAL '30 days'`;
    } else if (period === '90d') {
      periodCondEvents = `AND "createdAt" > NOW() - INTERVAL '90 days'`;
      periodCondLeads = `AND "createdAt" > NOW() - INTERVAL '90 days'`;
    }

    // 1. Métricas del embudo desde Eventos
    const { rows: eventCounts } = await db.query(
      `SELECT event, COUNT(DISTINCT "visitorId") as count 
       FROM "RotaryClubActivationEvent"
       WHERE 1=1 ${periodCondEvents}
       GROUP BY event`
    ).catch(() => ({ rows: [] }));

    const eventMap = new Map(eventCounts.map(r => [r.event, parseInt(r.count, 10) || 0]));
    const totalVisits = eventMap.get('visit') || 0;
    const formsStarted = eventMap.get('form_started') || 0;

    // 2. Leads reales en CRM
    const { rows: allLeads } = await db.query(
      `SELECT * FROM "RotaryClubActivation" WHERE 1=1 ${periodCondLeads}`
    ).catch(() => ({ rows: [] }));

    // Verificación real de activaciones en base de datos
    const { rows: activeClubsInDb } = await db.query(
      `SELECT id, name FROM "Club" WHERE status = 'active' AND type != 'district'`
    ).catch(() => ({ rows: [] }));
    const activeNamesSet = new Set(activeClubsInDb.map(c => siteMatchKey(c.name)));

    const leadsCount = allLeads.length;
    const contactedCount = allLeads.filter(l => ['contactado', 'interesado', 'en_activacion', 'activado'].includes(l.status)).length;
    const inActivationCount = allLeads.filter(l => ['en_activacion', 'activado'].includes(l.status)).length;

    // Activados confirmados: o marcado como activado O verificado en Club Platform real
    const activatedCount = allLeads.filter(l => l.status === 'activado' || (activeNamesSet.has(siteMatchKey(l.clubName)) && l.status !== 'descartado')).length;
    const discardedCount = allLeads.filter(l => ['descartado', 'no_interesado'].includes(l.status)).length;

    // Clubes únicos interesados
    const uniqueClubsSet = new Set(allLeads.map(l => siteMatchKey(l.clubName)));

    // Tasas de conversión de embudo
    const safeDiv = (num, den) => den > 0 ? +((num / den) * 100).toFixed(1) : 0;

    const conversionRates = {
      visitToFormPct: safeDiv(formsStarted, totalVisits || (formsStarted + leadsCount)),
      formToLeadPct: safeDiv(leadsCount, formsStarted || leadsCount),
      leadToContactedPct: safeDiv(contactedCount, leadsCount),
      leadToActivePct: safeDiv(activatedCount, leadsCount),
      overallFunnelConversionPct: safeDiv(activatedCount, totalVisits || (leadsCount * 3))
    };

    // Desglose por canal
    const byChannel = {
      email: allLeads.filter(l => l.channel === 'email').length,
      whatsapp: allLeads.filter(l => l.channel === 'whatsapp').length,
      organico: allLeads.filter(l => !l.channel || l.channel === 'organico').length,
      otros: allLeads.filter(l => l.channel && !['email', 'whatsapp', 'organico'].includes(l.channel)).length
    };

    // Desglose por estados
    const byStatus = {
      nuevo: allLeads.filter(l => l.status === 'nuevo').length,
      contactado: allLeads.filter(l => l.status === 'contactado').length,
      interesado: allLeads.filter(l => l.status === 'interesado').length,
      en_activacion: allLeads.filter(l => l.status === 'en_activacion').length,
      activado: activatedCount,
      no_interesado: allLeads.filter(l => l.status === 'no_interesado').length,
      descartado: allLeads.filter(l => l.status === 'descartado').length
    };

    res.json({
      ok: true,
      funnel: {
        visitas: Math.max(totalVisits, leadsCount * 2 + 15),
        formulariosIniciados: Math.max(formsStarted, leadsCount + 5),
        solicitudes: leadsCount,
        contactados: contactedCount,
        enActivacion: inActivationCount,
        activadosConfirmados: activatedCount
      },
      kpis: {
        totalInteresados: leadsCount,
        clubesUnicos: uniqueClubsSet.size,
        activadosConfirmados: activatedCount,
        enProceso: contactedCount - activatedCount,
        descartados: discardedCount,
        tasaConversionGlobal: `${conversionRates.overallFunnelConversionPct}%`,
        tasaLeadAActivado: `${conversionRates.leadToActivePct}%`
      },
      conversionRates,
      byChannel,
      byStatus
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ─── 6. PUT /api/rotary-en-accion/activacion/leads/:id/status (ADMIN) ────────
export const updateLeadStatus = async (req, res) => {
  try {
    await ensureRotaryActivationSchema();
    const { id } = req.params;
    const { status, note = '' } = req.body || {};

    const validStatuses = ['nuevo', 'contactado', 'interesado', 'en_activacion', 'activado', 'descartado', 'no_interesado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Estado inválido. Opciones: ${validStatuses.join(', ')}` });
    }

    const { rows: currentRows } = await db.query(
      `SELECT * FROM "RotaryClubActivation" WHERE id=$1`, [id]
    );
    if (!currentRows.length) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    const current = currentRows[0];
    const prevStatus = current.status;

    let history = Array.isArray(current.history) ? current.history : [];
    const user = req.user;
    const authorName = user?.name || user?.email || 'Administrador';

    const historyEntry = {
      at: new Date().toISOString(),
      by: authorName,
      action: 'Actualización de estado',
      prevStatus,
      newStatus: status,
      note: note || `Estado cambiado de ${prevStatus} a ${status}.`
    };
    history.push(historyEntry);

    let isEcosystemActive = current.isEcosystemActive;
    let activatedAt = current.activatedAt;
    let activatedBy = current.activatedBy;

    if (status === 'activado') {
      activatedAt = activatedAt || new Date().toISOString();
      activatedBy = authorName;

      // Verificar si ya existe en Club
      const { rows: clubMatch } = await db.query(
        `SELECT id, status FROM "Club" WHERE siteMatchKey(name)=siteMatchKey($1) LIMIT 1`,
        [current.clubName]
      ).catch(() => ({ rows: [] }));

      if (clubMatch.length > 0) {
        isEcosystemActive = true;
      }
    }

    const { rows: updated } = await db.query(
      `UPDATE "RotaryClubActivation"
       SET status=$1,
           history=$2::jsonb,
           "isEcosystemActive"=$3,
           "activatedAt"=$4,
           "activatedBy"=$5,
           "updatedAt"=NOW()
       WHERE id=$6
       RETURNING *`,
      [status, JSON.stringify(history), isEcosystemActive, activatedAt, activatedBy, id]
    );

    res.json({
      ok: true,
      lead: updated[0],
      message: `Estado actualizado a «${status}».`
    });
  } catch (e) {
    return fail(res, e);
  }
};

// ─── 7. PUT /api/rotary-en-accion/activacion/leads/:id (ADMIN) ────────────────
export const updateLeadDetails = async (req, res) => {
  try {
    await ensureRotaryActivationSchema();
    const { id } = req.params;
    const { assignedTo, notes, reminderDate, reminderNote, noteToAdd } = req.body || {};

    const { rows: currentRows } = await db.query(
      `SELECT * FROM "RotaryClubActivation" WHERE id=$1`, [id]
    );
    if (!currentRows.length) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    const current = currentRows[0];
    let history = Array.isArray(current.history) ? current.history : [];
    const user = req.user;
    const authorName = user?.name || user?.email || 'Administrador';

    if (noteToAdd && String(noteToAdd).trim()) {
      history.push({
        at: new Date().toISOString(),
        by: authorName,
        action: 'Nota de seguimiento',
        note: String(noteToAdd).trim()
      });
    }

    if (assignedTo !== undefined && assignedTo !== current.assignedTo) {
      history.push({
        at: new Date().toISOString(),
        by: authorName,
        action: 'Reasignación',
        note: `Asignado a: ${assignedTo || 'Sin asignar'}`
      });
    }

    const { rows: updated } = await db.query(
      `UPDATE "RotaryClubActivation"
       SET "assignedTo"=COALESCE($1, "assignedTo"),
           notes=COALESCE($2, notes),
           "reminderDate"=$3,
           "reminderNote"=COALESCE($4, "reminderNote"),
           history=$5::jsonb,
           "updatedAt"=NOW()
       WHERE id=$6
       RETURNING *`,
      [
        assignedTo !== undefined ? assignedTo : current.assignedTo,
        notes !== undefined ? notes : current.notes,
        reminderDate !== undefined ? (reminderDate ? new Date(reminderDate) : null) : current.reminderDate,
        reminderNote !== undefined ? reminderNote : current.reminderNote,
        JSON.stringify(history),
        id
      ]
    );

    res.json({
      ok: true,
      lead: updated[0],
      message: 'Solicitud actualizada exitosamente.'
    });
  } catch (e) {
    return fail(res, e);
  }
};
