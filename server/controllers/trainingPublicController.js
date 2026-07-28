// Área PÚBLICA del Calendario de Capacitaciones — sin login.
// Se monta bajo /api/public/training/* (router público, sin authMiddleware),
// igual que el Generador de Pendones. El usuario busca su sitio, valida
// suscripción, reserva y gestiona su cita con un enlace mágico (publicToken).
import crypto from 'crypto';
import Stripe from 'stripe';
import prisma from '../lib/prisma.js';
import { resolveSiteEntity, evaluateSiteStatus } from '../lib/siteStatus.js';
import {
  getTrainingConfig,
  getAvailableSlots,
  isSlotBookable,
  publicConfig,
} from '../services/trainingAvailabilityService.js';
import { createMeeting } from '../services/meetingService.js';
import { buildICS, googleCalendarUrl, outlookCalendarUrl } from '../lib/ics.js';
import { sendConfirmation, sendCancellation } from '../services/trainingNotificationService.js';

console.log('[trainingPublicController] Agenda pública de Capacitaciones v4.628.0 cargada');

const ACTIVATION_PRICE = { club: 29900, district: 89900 };

function originOf(req) {
  return req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : 'https://clubplatform.org');
}
function manageUrlFor(req, token) {
  return `${originOf(req)}/mi-capacitacion/${token}`;
}
function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
async function resolveByType(siteId, siteType) {
  return siteType === 'district'
    ? resolveSiteEntity({ districtId: siteId })
    : resolveSiteEntity({ clubId: siteId });
}

// Vista pública saneada de una cita (sin notas internas ni payload de la reunión).
function publicView(appt) {
  return {
    id: appt.id,
    token: appt.publicToken,
    status: appt.status,
    startAt: appt.startAt,
    endAt: appt.endAt,
    timezone: appt.timezone,
    modality: appt.modality,
    organizationName: appt.organizationName,
    requesterName: appt.requesterName,
    requesterEmail: appt.requesterEmail,
    reason: appt.reason,
    meetingUrl: appt.meetingUrl,
    appointmentType: appt.appointmentType
      ? { name: appt.appointmentType.name, durationMin: appt.appointmentType.durationMin, color: appt.appointmentType.color }
      : null,
    responsible: appt.responsible ? { name: appt.responsible.name } : null,
    materials: (appt.materials || []).map((m) => ({ label: m.label, url: m.url, kind: m.kind })),
  };
}

// ── Buscar sitio (autocomplete público) ─────────────────────────────────────
export async function searchSites(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ sites: [] });

    const [clubs, districts] = await Promise.all([
      prisma.club.findMany({
        where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { subdomain: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, name: true, type: true, status: true, subscriptionStatus: true, expirationDate: true },
        take: 12,
        orderBy: { name: 'asc' },
      }),
      prisma.district.findMany({
        where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { subdomain: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, name: true, number: true, status: true, subscriptionStatus: true, expirationDate: true },
        take: 8,
        orderBy: { name: 'asc' },
      }),
    ]);

    const sites = [
      ...clubs.map((c) => ({ id: c.id, name: c.name, type: 'club', subtype: c.type, active: evaluateSiteStatus(c).active })),
      ...districts.map((d) => ({ id: d.id, name: d.name || `Distrito ${d.number || ''}`.trim(), type: 'district', active: evaluateSiteStatus(d).active })),
    ];
    res.json({ sites });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Config + tipos de cita activos ──────────────────────────────────────────
export async function publicConfigAndTypes(req, res) {
  try {
    const cfg = await getTrainingConfig();
    const types = await prisma.trainingAppointmentType.findMany({
      where: { active: true },
      include: { responsible: { select: { name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ config: publicConfig(cfg), types });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Estado del sitio (sin exponer datos de facturación) ─────────────────────
export async function publicSiteStatus(req, res) {
  try {
    const { siteId, siteType } = req.query;
    if (!siteId) return res.status(400).json({ error: 'Sitio no especificado' });
    const { entity, type } = await resolveByType(siteId, siteType);
    if (!entity) return res.status(404).json({ error: 'Sitio no encontrado' });
    const status = evaluateSiteStatus(entity);
    res.json({
      active: status.active,
      reason: status.reason,
      site: { id: entity.id, name: entity.name || `Distrito ${entity.number || ''}`.trim(), type },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Slots disponibles ───────────────────────────────────────────────────────
export async function publicSlots(req, res) {
  try {
    let durationMin = req.query.durationMin ? Number(req.query.durationMin) : undefined;
    if (req.query.typeId) {
      const t = await prisma.trainingAppointmentType.findUnique({ where: { id: req.query.typeId } });
      if (t) durationMin = t.durationMin;
    }
    const result = await getAvailableSlots({ durationMin, days: req.query.days ? Number(req.query.days) : undefined });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Crear reserva pública ───────────────────────────────────────────────────
export async function createPublicAppointment(req, res) {
  try {
    const { siteId, siteType, typeId, startAt, participants, reason, requesterName, requesterEmail, requesterPhone } = req.body;

    if (!siteId) return res.status(400).json({ error: 'Selecciona tu sitio.' });
    if (!requesterName || !isEmail(requesterEmail)) {
      return res.status(400).json({ error: 'Nombre y un correo válido son obligatorios.' });
    }
    if (!startAt) return res.status(400).json({ error: 'Fecha/hora requerida.' });

    const { entity, type } = await resolveByType(siteId, siteType);
    if (!entity) return res.status(404).json({ error: 'Sitio no encontrado.' });

    // Validación de sitio activo — sitio inactivo NO reserva gratis.
    const status = evaluateSiteStatus(entity);
    if (!status.active) {
      return res.status(402).json({
        error: 'inactive_site',
        reason: status.reason,
        message: 'La capacitación está disponible únicamente para sitios activos. Activa o renueva tu servicio para continuar.',
      });
    }

    const apptType = typeId ? await prisma.trainingAppointmentType.findUnique({ where: { id: typeId } }) : null;
    if (typeId && !apptType) return res.status(400).json({ error: 'Tipo de cita inválido.' });

    const check = await isSlotBookable({ startAt, durationMin: apptType?.durationMin });
    if (!check.ok) {
      const msg = {
        conflict: 'Ese horario acaba de ocuparse. Elige otro.',
        day_full: 'No quedan cupos para ese día.',
        too_soon: 'Debes reservar con más anticipación.',
        too_far: 'Esa fecha está fuera del rango disponible.',
        invalid_date: 'Fecha inválida.',
      }[check.reason] || 'Horario no disponible';
      return res.status(409).json({ error: check.reason, message: msg });
    }

    const cfg = check.config;
    const responsible = apptType?.responsibleId
      ? await prisma.trainingResponsible.findUnique({ where: { id: apptType.responsibleId } })
      : null;
    const token = crypto.randomUUID();

    let appt = await prisma.trainingAppointment.create({
      data: {
        clubId: type === 'club' ? entity.id : null,
        districtId: type === 'district' ? entity.id : null,
        appointmentTypeId: apptType?.id || null,
        responsibleId: responsible?.id || null,
        startAt: new Date(startAt),
        endAt: check.endAt,
        timezone: cfg.timezone,
        status: 'confirmed',
        modality: apptType?.modality || 'videollamada',
        requesterName: String(requesterName).slice(0, 150),
        requesterEmail: String(requesterEmail).slice(0, 180),
        requesterPhone: requesterPhone ? String(requesterPhone).slice(0, 40) : null,
        organizationName: entity.name || null,
        participants: Array.isArray(participants) ? participants : [],
        reason: reason ? String(reason).slice(0, 1000) : null,
        meetingProvider: cfg.meetingProvider,
        source: 'public',
        publicToken: token,
      },
      include: { appointmentType: true, responsible: true, materials: true },
    });

    // Enlace de videoconferencia (best-effort).
    if (cfg.meetingProvider && cfg.meetingProvider !== 'manual') {
      const meeting = await createMeeting({
        provider: cfg.meetingProvider,
        topic: `Capacitación: ${apptType?.name || 'Soporte'} — ${entity.name || ''}`,
        startAt,
        durationMin: apptType?.durationMin || cfg.slotDurationMin,
        timezone: cfg.timezone,
      });
      if (meeting.url) {
        appt = await prisma.trainingAppointment.update({
          where: { id: appt.id },
          data: { meetingUrl: meeting.url, meetingId: meeting.id, meetingProvider: meeting.provider, meetingPayload: meeting.payload || {} },
          include: { appointmentType: true, responsible: true, materials: true },
        });
      }
    }

    await sendConfirmation(appt, { origin: originOf(req), manageUrl: manageUrlFor(req, token) });
    await prisma.trainingAppointment.update({ where: { id: appt.id }, data: { confirmationSentAt: new Date() } });

    res.json({ appointment: publicView(appt), manageUrl: manageUrlFor(req, token) });
  } catch (e) {
    console.error('[trainingPublic] create:', e);
    res.status(500).json({ error: e.message });
  }
}

// ── Checkout de activación (sitio inactivo) ─────────────────────────────────
export async function publicActivationCheckout(req, res) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe no está configurado.' });
    const { siteId, siteType } = req.body;
    const { entity, type } = await resolveByType(siteId, siteType);
    if (!entity) return res.status(404).json({ error: 'Sitio no encontrado.' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = originOf(req);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      client_reference_id: entity.id, // el webhook reactiva por este id
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Ecosistema Digital — ${type === 'club' ? 'Club' : 'Distrito'} ${entity.name || entity.number || ''}`.trim(),
            description: 'Activación/renovación anual del ecosistema Club Platform. Incluye acceso a capacitaciones y soporte.',
          },
          unit_amount: ACTIVATION_PRICE[type] || ACTIVATION_PRICE.club,
        },
        quantity: 1,
      }],
      metadata: { type: 'training_activation', entityId: entity.id, entityType: type, source: 'public' },
      success_url: `${origin}/agendar-capacitacion?activated=1&site=${entity.id}`,
      cancel_url: `${origin}/agendar-capacitacion?activation=cancelled`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[trainingPublic] activationCheckout:', e);
    res.status(500).json({ error: e.message });
  }
}

// ── Gestión por enlace mágico (token) ───────────────────────────────────────
async function findByToken(token) {
  if (!token) return null;
  return prisma.trainingAppointment.findUnique({
    where: { publicToken: token },
    include: { appointmentType: true, responsible: true, materials: true },
  });
}

export async function getPublicAppointment(req, res) {
  try {
    const appt = await findByToken(req.params.token);
    if (!appt) return res.status(404).json({ error: 'Cita no encontrada.' });
    const cfg = await getTrainingConfig();
    res.json({ appointment: publicView(appt), cancelWindowHours: cfg.cancelWindowHours });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function cancelPublicAppointment(req, res) {
  try {
    const appt = await findByToken(req.params.token);
    if (!appt) return res.status(404).json({ error: 'Cita no encontrada.' });
    if (['cancelled', 'completed'].includes(appt.status)) return res.status(422).json({ error: 'La cita ya no se puede cancelar.' });

    const cfg = await getTrainingConfig();
    const hoursToStart = (new Date(appt.startAt).getTime() - Date.now()) / 3600000;
    if (hoursToStart < cfg.cancelWindowHours) {
      return res.status(422).json({ error: 'window_closed', message: `Solo puedes cancelar con ${cfg.cancelWindowHours}h de anticipación.` });
    }

    const updated = await prisma.trainingAppointment.update({
      where: { id: appt.id },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: req.body?.reason || 'Cancelada por el usuario' },
      include: { appointmentType: true, responsible: true, materials: true },
    });
    await sendCancellation(updated, {});
    res.json({ appointment: publicView(updated) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function reschedulePublicAppointment(req, res) {
  try {
    const appt = await findByToken(req.params.token);
    if (!appt) return res.status(404).json({ error: 'Cita no encontrada.' });
    if (['cancelled', 'completed'].includes(appt.status)) return res.status(422).json({ error: 'La cita ya no se puede reprogramar.' });

    const { startAt } = req.body;
    if (!startAt) return res.status(400).json({ error: 'Nueva fecha/hora requerida.' });

    const cfg = await getTrainingConfig();
    const hoursToStart = (new Date(appt.startAt).getTime() - Date.now()) / 3600000;
    if (hoursToStart < cfg.cancelWindowHours) {
      return res.status(422).json({ error: 'window_closed', message: `Solo puedes reprogramar con ${cfg.cancelWindowHours}h de anticipación.` });
    }

    const check = await isSlotBookable({ startAt, durationMin: appt.appointmentType?.durationMin });
    if (!check.ok) return res.status(409).json({ error: check.reason, message: 'El nuevo horario no está disponible.' });

    const updated = await prisma.trainingAppointment.update({
      where: { id: appt.id },
      data: { startAt: new Date(startAt), endAt: check.endAt, status: 'rescheduled', reminder24SentAt: null, reminder1SentAt: null },
      include: { appointmentType: true, responsible: true, materials: true },
    });
    await sendConfirmation(updated, { origin: originOf(req), manageUrl: manageUrlFor(req, updated.publicToken) });
    res.json({ appointment: publicView(updated) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function publicIcs(req, res) {
  try {
    const appt = await findByToken(req.params.token);
    if (!appt) return res.status(404).json({ error: 'Cita no encontrada.' });
    const ics = buildICS({
      id: appt.id,
      startAt: appt.startAt,
      endAt: appt.endAt,
      title: `Capacitación: ${appt.appointmentType?.name || 'Soporte'}`,
      description: appt.meetingUrl ? `Enlace: ${appt.meetingUrl}` : 'Videollamada Club Platform',
      location: appt.meetingUrl || 'Videollamada',
      organizerEmail: 'soporte@clubplatform.org',
      attendeeEmail: appt.requesterEmail,
      attendeeName: appt.requesterName,
    });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="capacitacion.ics"');
    res.send(ics);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function publicCalendarLinks(req, res) {
  try {
    const appt = await findByToken(req.params.token);
    if (!appt) return res.status(404).json({ error: 'Cita no encontrada.' });
    const payload = {
      startAt: appt.startAt,
      endAt: appt.endAt,
      title: `Capacitación: ${appt.appointmentType?.name || 'Soporte'}`,
      description: appt.meetingUrl || 'Videollamada Club Platform',
      location: appt.meetingUrl || 'Videollamada',
    };
    res.json({ google: googleCalendarUrl(payload), outlook: outlookCalendarUrl(payload) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
