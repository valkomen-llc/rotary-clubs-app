// Controller del módulo "Calendario de Capacitaciones y Soporte".
// Dos áreas: (1) config + gestión del superadmin, (2) flujo de reserva del sitio.
import Stripe from 'stripe';
import prisma from '../lib/prisma.js';
import { getSiteStatus, resolveSiteEntity } from '../lib/siteStatus.js';
import {
  getTrainingConfig,
  getAvailableSlots,
  isSlotBookable,
  publicConfig,
} from '../services/trainingAvailabilityService.js';
import { createMeeting, AVAILABLE_MEETING_PROVIDERS } from '../services/meetingService.js';
import { resolveMeetingUrl, isValidMeetingUrl } from '../lib/meetingLink.js';
import { buildICS, googleCalendarUrl, outlookCalendarUrl } from '../lib/ics.js';
import {
  sendConfirmation,
  sendCancellation,
} from '../services/trainingNotificationService.js';

console.log('[trainingController] Calendario de Capacitaciones y Soporte v4.563.0 cargado');

const isSuper = (req) => req.user?.role === 'administrator';

// Precio de activación del ecosistema (mismo criterio que admin.js).
const ACTIVATION_PRICE = { club: 29900, district: 89900 };

function originOf(req) {
  return req.headers.origin || (req.headers.host ? `https://${req.headers.host}` : 'https://clubplatform.org');
}

// Incluye relaciones usadas por notificaciones / vistas.
const APPT_INCLUDE = {
  appointmentType: true,
  responsible: true,
  materials: true,
  survey: true,
};

// ────────────────────────────────────────────────────────────────────────────
// SUPERADMIN — Configuración global
// ────────────────────────────────────────────────────────────────────────────
export async function getConfig(req, res) {
  try {
    const cfg = await getTrainingConfig();
    res.json({ config: cfg, providers: AVAILABLE_MEETING_PROVIDERS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateConfig(req, res) {
  try {
    const allowed = [
      'timezone', 'slotDurationMin', 'bufferMin', 'maxPerDay',
      'minNoticeHours', 'cancelWindowHours', 'leadDays', 'meetingProvider', 'active',
      'provisionalMeetingEnabled', 'provisionalMeetingUrl',
    ];
    if ('provisionalMeetingUrl' in req.body && !isValidMeetingUrl(req.body.provisionalMeetingUrl)) {
      return res.status(400).json({ error: 'El enlace debe iniciar con https://' });
    }
    const data = {};
    for (const k of allowed) if (k in req.body) data[k] = req.body[k];
    const cfg = await getTrainingConfig();
    const updated = await prisma.trainingConfig.update({ where: { id: cfg.id }, data });
    res.json({ config: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Bloques de disponibilidad ──
export async function listBlocks(req, res) {
  try {
    const blocks = await prisma.trainingAvailabilityBlock.findMany({
      include: { responsible: true },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    });
    res.json({ blocks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createBlock(req, res) {
  try {
    const { kind = 'recurring', weekday, date, startMinute, endMinute, responsibleId } = req.body;
    if (startMinute == null || endMinute == null || endMinute <= startMinute) {
      return res.status(400).json({ error: 'Rango horario inválido' });
    }
    const block = await prisma.trainingAvailabilityBlock.create({
      data: {
        kind,
        weekday: kind === 'recurring' ? Number(weekday) : null,
        date: kind === 'specific' && date ? new Date(date) : null,
        startMinute: Number(startMinute),
        endMinute: Number(endMinute),
        responsibleId: responsibleId || null,
      },
    });
    res.json({ block });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateBlock(req, res) {
  try {
    const { id } = req.params;
    const data = {};
    for (const k of ['kind', 'weekday', 'startMinute', 'endMinute', 'responsibleId', 'active']) {
      if (k in req.body) data[k] = req.body[k];
    }
    if ('date' in req.body) data.date = req.body.date ? new Date(req.body.date) : null;
    if ('weekday' in data && data.weekday != null) data.weekday = Number(data.weekday);
    const block = await prisma.trainingAvailabilityBlock.update({ where: { id }, data });
    res.json({ block });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteBlock(req, res) {
  try {
    await prisma.trainingAvailabilityBlock.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Fechas bloqueadas / vacaciones ──
export async function listBlackouts(req, res) {
  try {
    const blackouts = await prisma.trainingBlackout.findMany({ orderBy: { startDate: 'asc' } });
    res.json({ blackouts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createBlackout(req, res) {
  try {
    const { startDate, endDate, reason } = req.body;
    if (!startDate) return res.status(400).json({ error: 'Fecha requerida' });
    const blackout = await prisma.trainingBlackout.create({
      data: {
        startDate: new Date(startDate),
        endDate: new Date(endDate || startDate),
        reason: reason || null,
      },
    });
    res.json({ blackout });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteBlackout(req, res) {
  try {
    await prisma.trainingBlackout.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Responsables ──
export async function listResponsibles(req, res) {
  try {
    const responsibles = await prisma.trainingResponsible.findMany({ orderBy: { name: 'asc' } });
    res.json({ responsibles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createResponsible(req, res) {
  try {
    const { name, email, phone, userId, provisionalMeetingUrl } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    if (!isValidMeetingUrl(provisionalMeetingUrl)) return res.status(400).json({ error: 'El enlace debe iniciar con https://' });
    const responsible = await prisma.trainingResponsible.create({
      data: { name, email: email || null, phone: phone || null, userId: userId || null, provisionalMeetingUrl: provisionalMeetingUrl || null },
    });
    res.json({ responsible });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateResponsible(req, res) {
  try {
    const data = {};
    for (const k of ['name', 'email', 'phone', 'userId', 'active', 'provisionalMeetingUrl']) if (k in req.body) data[k] = req.body[k];
    if ('provisionalMeetingUrl' in req.body && !isValidMeetingUrl(req.body.provisionalMeetingUrl)) {
      return res.status(400).json({ error: 'El enlace debe iniciar con https://' });
    }
    const responsible = await prisma.trainingResponsible.update({ where: { id: req.params.id }, data });
    res.json({ responsible });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteResponsible(req, res) {
  try {
    await prisma.trainingResponsible.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Categorías del catálogo ──
export async function listCategories(req, res) {
  try {
    const where = isSuper(req) ? {} : { active: true };
    const categories = await prisma.trainingCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createCategory(req, res) {
  try {
    const { name, description, emoji, color, sortOrder, openToAll } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const count = await prisma.trainingCategory.count();
    const category = await prisma.trainingCategory.create({
      data: {
        name,
        description: description || null,
        emoji: emoji || null,
        color: color || '#4f46e5',
        openToAll: !!openToAll,
        sortOrder: sortOrder != null ? Number(sortOrder) : count,
      },
    });
    res.json({ category });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateCategory(req, res) {
  try {
    const data = {};
    for (const k of ['name', 'description', 'emoji', 'color', 'active']) if (k in req.body) data[k] = req.body[k];
    if ('openToAll' in req.body) data.openToAll = !!req.body.openToAll;
    if ('sortOrder' in req.body) data.sortOrder = Number(req.body.sortOrder) || 0;
    const category = await prisma.trainingCategory.update({ where: { id: req.params.id }, data });
    res.json({ category });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Eliminar categoría: los servicios NO se borran (se dejan sin categoría) para
// no afectar el historial de citas.
export async function deleteCategory(req, res) {
  try {
    await prisma.trainingAppointmentType.updateMany({ where: { categoryId: req.params.id }, data: { categoryId: null } });
    await prisma.trainingCategory.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Reordenar categorías: recibe [{id, sortOrder}].
export async function reorderCategories(req, res) {
  try {
    const items = Array.isArray(req.body?.order) ? req.body.order : [];
    await prisma.$transaction(
      items.map((it, i) => prisma.trainingCategory.update({ where: { id: it.id }, data: { sortOrder: it.sortOrder ?? i } }))
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Reordenar / mover servicios: recibe [{id, categoryId, sortOrder}].
export async function reorderTypes(req, res) {
  try {
    const items = Array.isArray(req.body?.order) ? req.body.order : [];
    await prisma.$transaction(
      items.map((it, i) => prisma.trainingAppointmentType.update({
        where: { id: it.id },
        data: { sortOrder: it.sortOrder ?? i, ...(it.categoryId !== undefined ? { categoryId: it.categoryId || null } : {}) },
      }))
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Catálogo sugerido (solo como PUNTO DE PARTIDA editable; se insertan como
// filas en BD y el superadmin puede cambiarlas/eliminarlas libremente).
const SUGGESTED_CATALOG = [
  { name: 'Onboarding e Implementación', emoji: '🚀', color: '#6366f1', description: 'Puesta en marcha del ecosistema y configuración inicial del sitio.', services: ['Bienvenida a Club Platform', 'Configuración Inicial del Sitio', 'Capacitación General del Ecosistema'] },
  { name: 'Sitio Web', emoji: '🌐', color: '#0ea5e9', description: 'Administración del sitio institucional y gestión de contenidos.', services: ['Administración del Sitio Web', 'Gestión de Noticias y Blog', 'SEO y Posicionamiento Digital'] },
  { name: 'Inteligencia Artificial', emoji: '🤖', color: '#8b5cf6', description: 'Configuración y uso de las herramientas de IA integradas.', services: ['Creación de Contenido con IA', 'Configuración del Cerebro Inteligente', 'Agentes Virtuales', 'Automatizaciones'] },
  { name: 'Marketing y Comunicaciones', emoji: '📱', color: '#ec4899', description: 'Imagen pública y comunicaciones digitales.', services: ['Redes Sociales', 'CRM', 'Email Marketing', 'WhatsApp Marketing', 'Imagen Pública', 'Content Studio'] },
  { name: 'Fundraising y Crowdfunding', emoji: '❤️', color: '#ef4444', description: 'Recaudación de fondos y campañas solidarias.', services: ['Crowdfunding', 'Fundraising', 'Donaciones', 'Stripe', 'Bóveda de Fondos'] },
  { name: 'Comercio Electrónico', emoji: '🛒', color: '#f59e0b', description: 'Venta de productos, souvenirs, inscripciones y servicios.', services: ['Tienda Virtual', 'Catálogo de Productos', 'Inventario', 'Pagos', 'Órdenes'] },
  { name: 'Eventos', emoji: '📅', color: '#10b981', description: 'Gestión de eventos, conferencias, seminarios y ferias.', services: ['Eventos', 'Inscripciones', 'Tickets', 'Check-in', 'Agenda'] },
  { name: 'Gestión Institucional', emoji: '👥', color: '#3b82f6', description: 'Administración interna del club.', services: ['Directorio de Socios', 'Junta Directiva', 'Comités', 'Gestión Documental', 'Biblioteca'] },
  { name: 'Analítica', emoji: '📊', color: '#14b8a6', description: 'Estadísticas y comportamiento del ecosistema.', services: ['Dashboard', 'Google Analytics', 'Reportes', 'SEO', 'Conversiones'] },
  { name: 'Programa de Intercambio', emoji: '🎓', color: '#a855f7', description: 'Programas de intercambio de jóvenes.', services: ['Gestión de Estudiantes', 'Familias Anfitrionas', 'YEO', 'Documentación', 'CRM del Programa'] },
  { name: 'Mesa de Ayuda', emoji: '🛠', color: '#64748b', description: 'Soporte técnico y acompañamiento especializado.', services: ['Help Desk', 'Incidentes', 'Configuración', 'Integraciones', 'Corrección de errores', 'Consultoría Técnica'] },
];

// Precarga el catálogo sugerido sin duplicar (idempotente por nombre).
export async function seedCatalog(req, res) {
  try {
    const existingCats = await prisma.trainingCategory.findMany();
    const byName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c]));
    let createdCats = 0, createdTypes = 0;

    for (let i = 0; i < SUGGESTED_CATALOG.length; i++) {
      const c = SUGGESTED_CATALOG[i];
      let cat = byName.get(c.name.toLowerCase());
      if (!cat) {
        cat = await prisma.trainingCategory.create({
          data: { name: c.name, emoji: c.emoji, color: c.color, description: c.description, sortOrder: existingCats.length + i },
        });
        createdCats++;
      }
      const existingTypes = await prisma.trainingAppointmentType.findMany({ where: { categoryId: cat.id }, select: { name: true } });
      const typeNames = new Set(existingTypes.map((t) => t.name.toLowerCase()));
      for (let j = 0; j < c.services.length; j++) {
        if (typeNames.has(c.services[j].toLowerCase())) continue;
        await prisma.trainingAppointmentType.create({
          data: { name: c.services[j], categoryId: cat.id, color: c.color, sortOrder: j, durationMin: 45, modality: 'videollamada' },
        });
        createdTypes++;
      }
    }
    res.json({ ok: true, createdCategories: createdCats, createdServices: createdTypes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Tipos de cita ──
export async function listTypes(req, res) {
  try {
    // Usuarios normales sólo ven tipos activos; el superadmin ve todos.
    const where = isSuper(req) ? {} : { active: true };
    const types = await prisma.trainingAppointmentType.findMany({
      where,
      include: { responsible: true, category: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ types });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createType(req, res) {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Nombre requerido' });
    const type = await prisma.trainingAppointmentType.create({
      data: {
        name: b.name,
        description: b.description || null,
        categoryId: b.categoryId || null,
        durationMin: Number(b.durationMin) || 45,
        modality: b.modality || 'videollamada',
        prerequisites: b.prerequisites || null,
        price: b.price != null && b.price !== '' ? Number(b.price) : null,
        currency: b.currency || 'USD',
        color: b.color || '#2563eb',
        icon: b.icon || null,
        provisionalMeetingUrl: b.provisionalMeetingUrl || null,
        responsibleId: b.responsibleId || null,
        sortOrder: Number(b.sortOrder) || 0,
      },
    });
    res.json({ type });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateType(req, res) {
  try {
    const data = {};
    for (const k of ['name', 'description', 'modality', 'prerequisites', 'currency', 'color', 'icon', 'responsibleId', 'active', 'provisionalMeetingUrl']) {
      if (k in req.body) data[k] = req.body[k];
    }
    if ('provisionalMeetingUrl' in req.body && !isValidMeetingUrl(req.body.provisionalMeetingUrl)) {
      return res.status(400).json({ error: 'El enlace debe iniciar con https://' });
    }
    if ('categoryId' in req.body) data.categoryId = req.body.categoryId || null;
    if ('durationMin' in req.body) data.durationMin = Number(req.body.durationMin) || 45;
    if ('sortOrder' in req.body) data.sortOrder = Number(req.body.sortOrder) || 0;
    if ('price' in req.body) data.price = req.body.price != null && req.body.price !== '' ? Number(req.body.price) : null;
    const type = await prisma.trainingAppointmentType.update({ where: { id: req.params.id }, data });
    res.json({ type });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteType(req, res) {
  try {
    await prisma.trainingAppointmentType.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// USUARIO / SITIO — Estado, slots y reserva
// ────────────────────────────────────────────────────────────────────────────

// Resuelve el sitio reservante respetando permisos.
function resolveTargetIds(req, body = {}) {
  if (isSuper(req)) {
    return { clubId: body.clubId || null, districtId: body.districtId || null };
  }
  // Sitio-admin: sólo su propio sitio (el token manda).
  const clubId = req.user?.clubId || body.clubId || null;
  const districtId = req.user?.districtId || null;
  // Si mandó un clubId distinto al suyo, se ignora (no puede reservar por otros).
  if (clubId && req.user?.clubId && clubId !== req.user.clubId) {
    return { clubId: req.user.clubId, districtId };
  }
  return { clubId, districtId };
}

export async function siteStatus(req, res) {
  try {
    const { clubId, districtId } = resolveTargetIds(req, req.query);
    if (!clubId && !districtId) return res.status(400).json({ error: 'Sitio no especificado' });
    const status = await getSiteStatus({ clubId, districtId });
    const cfg = await getTrainingConfig();
    res.json({
      active: status.active,
      reason: status.reason,
      site: status.entity
        ? {
            id: status.entity.id,
            name: status.entity.name || `Distrito ${status.entity.number || ''}`.trim(),
            type: status.type,
            expirationDate: status.entity.expirationDate,
            billingContactEmail: status.entity.billingContactEmail,
            billingContactPhone: status.entity.billingContactPhone,
          }
        : null,
      config: publicConfig(cfg),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function slots(req, res) {
  try {
    let durationMin = req.query.durationMin ? Number(req.query.durationMin) : undefined;
    if (req.query.typeId) {
      const t = await prisma.trainingAppointmentType.findUnique({ where: { id: req.query.typeId } });
      if (t) durationMin = t.durationMin;
    }
    const result = await getAvailableSlots({
      durationMin,
      responsibleId: req.query.responsibleId || undefined,
      days: req.query.days ? Number(req.query.days) : undefined,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function createAppointment(req, res) {
  try {
    const { typeId, startAt, participants, reason } = req.body;
    const { clubId, districtId } = resolveTargetIds(req, req.body);

    if (!clubId && !districtId) return res.status(400).json({ error: 'Sitio no especificado' });
    if (!startAt) return res.status(400).json({ error: 'Fecha/hora requerida' });

    // 1. Tipo de cita (con su categoría, para saber si es de acceso abierto).
    const type = typeId
      ? await prisma.trainingAppointmentType.findUnique({ where: { id: typeId }, include: { category: true } })
      : null;
    if (typeId && !type) return res.status(400).json({ error: 'Tipo de cita inválido' });
    const durationMin = type?.durationMin;

    // 2. Validar sitio activo. Sitio inactivo NO reserva gratis, SALVO que la
    // categoría esté marcada como abierta a todos (ej. Onboarding).
    const status = await getSiteStatus({ clubId, districtId });
    if (!status.active && !type?.category?.openToAll) {
      return res.status(402).json({
        error: 'inactive_site',
        reason: status.reason,
        message: 'La capacitación está disponible únicamente para sitios activos. Activa o renueva tu servicio para continuar.',
      });
    }

    // 3. Slot válido y libre (anti doble-reserva, idempotente por conflicto).
    const check = await isSlotBookable({ startAt, durationMin });
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

    // 4. Precargar datos de la organización y del solicitante.
    const user = req.user?.id ? await prisma.user.findUnique({ where: { id: req.user.id } }) : null;
    const entity = status.entity;
    const responsible = type?.responsibleId
      ? await prisma.trainingResponsible.findUnique({ where: { id: type.responsibleId } })
      : null;

    // 5. Crear la cita (confirmada: sitio activo).
    let appt = await prisma.trainingAppointment.create({
      data: {
        clubId: status.type === 'club' ? clubId : null,
        districtId: status.type === 'district' ? (districtId || entity?.id) : null,
        appointmentTypeId: type?.id || null,
        responsibleId: responsible?.id || null,
        startAt: new Date(startAt),
        endAt: check.endAt,
        timezone: cfg.timezone,
        status: 'confirmed',
        modality: type?.modality || 'videollamada',
        requesterName: user?.name || null,
        requesterEmail: user?.email || entity?.billingContactEmail || null,
        requesterPhone: user?.phone || entity?.billingContactPhone || null,
        organizationName: entity?.name || null,
        participants: Array.isArray(participants) ? participants : [],
        reason: reason || null,
        meetingProvider: cfg.meetingProvider,
        bookedById: req.user?.id || null,
      },
      include: APPT_INCLUDE,
    });

    // 6. Enlace de reunión: automático (Zoom/Meet) o provisional según prioridad.
    let autoMeeting = null;
    if (cfg.meetingProvider && cfg.meetingProvider !== 'manual') {
      autoMeeting = await createMeeting({
        provider: cfg.meetingProvider,
        topic: `Capacitación: ${type?.name || 'Soporte'} — ${entity?.name || ''}`,
        startAt, durationMin: durationMin || cfg.slotDurationMin, timezone: cfg.timezone,
      });
    }
    const link = resolveMeetingUrl({ config: cfg, type, responsible, autoUrl: autoMeeting?.url });

    // 7. Programación del recordatorio de 1h y regla de <1h de anticipación.
    const startMs = new Date(startAt).getTime();
    const lessThan1h = startMs - Date.now() < 60 * 60000;

    appt = await prisma.trainingAppointment.update({
      where: { id: appt.id },
      data: {
        meetingUrl: link.url || null,
        meetingProvider: link.provider || cfg.meetingProvider,
        meetingId: autoMeeting?.id || null,
        meetingPayload: autoMeeting?.payload || {},
        reminder1ScheduledFor: new Date(startMs - 60 * 60000),
        // <1h: se envía solo la confirmación; el recordatorio se marca resuelto.
        reminder1SentAt: lessThan1h ? new Date() : null,
      },
      include: APPT_INCLUDE,
    });

    // 8. Confirmación (email + WhatsApp) + auditoría del envío.
    const conf = await sendConfirmation(appt, { origin: originOf(req) });
    appt = await prisma.trainingAppointment.update({
      where: { id: appt.id },
      data: { confirmationSentAt: conf?.success ? new Date() : null, confirmationError: conf?.success ? null : (conf?.error || 'send_failed') },
      include: APPT_INCLUDE,
    });

    res.json({ appointment: appt });
  } catch (e) {
    console.error('[training] createAppointment:', e);
    res.status(500).json({ error: e.message });
  }
}

// Historial del sitio (reservas propias).
export async function myAppointments(req, res) {
  try {
    const { clubId, districtId } = resolveTargetIds(req, req.query);
    const where = isSuper(req) && !clubId && !districtId
      ? {}
      : { OR: [clubId ? { clubId } : null, districtId ? { districtId } : null].filter(Boolean) };
    const appointments = await prisma.trainingAppointment.findMany({
      where,
      include: APPT_INCLUDE,
      orderBy: { startAt: 'desc' },
    });
    res.json({ appointments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Descarga .ics de una cita.
export async function downloadIcs(req, res) {
  try {
    const appt = await prisma.trainingAppointment.findUnique({
      where: { id: req.params.id },
      include: APPT_INCLUDE,
    });
    if (!appt) return res.status(404).json({ error: 'No encontrada' });
    if (!canManageAppt(req, appt)) return res.status(403).json({ error: 'No autorizado' });
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

// Enlaces "Agregar a Google/Outlook".
export async function calendarLinks(req, res) {
  try {
    const appt = await prisma.trainingAppointment.findUnique({
      where: { id: req.params.id },
      include: APPT_INCLUDE,
    });
    if (!appt) return res.status(404).json({ error: 'No encontrada' });
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

function canManageAppt(req, appt) {
  if (isSuper(req)) return true;
  if (appt.clubId && appt.clubId === req.user?.clubId) return true;
  if (appt.districtId && appt.districtId === req.user?.districtId) return true;
  return false;
}

// Cancelar (dentro de la ventana configurable).
export async function cancelAppointment(req, res) {
  try {
    const appt = await prisma.trainingAppointment.findUnique({ where: { id: req.params.id }, include: APPT_INCLUDE });
    if (!appt) return res.status(404).json({ error: 'No encontrada' });
    if (!canManageAppt(req, appt)) return res.status(403).json({ error: 'No autorizado' });

    const cfg = await getTrainingConfig();
    const hoursToStart = (new Date(appt.startAt).getTime() - Date.now()) / 3600000;
    if (!isSuper(req) && hoursToStart < cfg.cancelWindowHours) {
      return res.status(422).json({ error: 'window_closed', message: `Solo puedes cancelar con ${cfg.cancelWindowHours}h de anticipación.` });
    }

    const updated = await prisma.trainingAppointment.update({
      where: { id: appt.id },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: req.body?.reason || null },
      include: APPT_INCLUDE,
    });
    await sendCancellation(updated, {});
    res.json({ appointment: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Reprogramar: cancela lógicamente el horario anterior y mueve al nuevo.
export async function rescheduleAppointment(req, res) {
  try {
    const appt = await prisma.trainingAppointment.findUnique({ where: { id: req.params.id }, include: APPT_INCLUDE });
    if (!appt) return res.status(404).json({ error: 'No encontrada' });
    if (!canManageAppt(req, appt)) return res.status(403).json({ error: 'No autorizado' });

    const { startAt } = req.body;
    if (!startAt) return res.status(400).json({ error: 'Nueva fecha/hora requerida' });

    const cfg = await getTrainingConfig();
    const hoursToStart = (new Date(appt.startAt).getTime() - Date.now()) / 3600000;
    if (!isSuper(req) && hoursToStart < cfg.cancelWindowHours) {
      return res.status(422).json({ error: 'window_closed', message: `Solo puedes reprogramar con ${cfg.cancelWindowHours}h de anticipación.` });
    }

    const durationMin = appt.appointmentType?.durationMin;
    const check = await isSlotBookable({ startAt, durationMin });
    if (!check.ok) return res.status(409).json({ error: check.reason, message: 'El nuevo horario no está disponible.' });

    // Reprogramar cancela el recordatorio anterior y programa uno nuevo; si la
    // nueva hora está a <1h, no se programa recordatorio separado.
    const startMs = new Date(startAt).getTime();
    const lessThan1h = startMs - Date.now() < 60 * 60000;
    const updated = await prisma.trainingAppointment.update({
      where: { id: appt.id },
      data: {
        startAt: new Date(startAt), endAt: check.endAt, status: 'rescheduled',
        reminder24SentAt: null, reminder1SentAt: lessThan1h ? new Date() : null,
        reminder1ScheduledFor: new Date(startMs - 60 * 60000), reminder1Error: null, reminder1Attempts: 0,
      },
      include: APPT_INCLUDE,
    });
    await sendConfirmation(updated, { origin: originOf(req) });
    res.json({ appointment: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Encuesta de satisfacción (post-sesión).
export async function submitSurvey(req, res) {
  try {
    const appt = await prisma.trainingAppointment.findUnique({ where: { id: req.params.id } });
    if (!appt) return res.status(404).json({ error: 'No encontrada' });
    if (!canManageAppt(req, appt)) return res.status(403).json({ error: 'No autorizado' });
    const { satisfaction, usefulness, clarity, attention, needsFollowUp, comments } = req.body;
    const survey = await prisma.trainingSurvey.upsert({
      where: { appointmentId: appt.id },
      create: {
        appointmentId: appt.id,
        satisfaction: satisfaction ?? null,
        usefulness: usefulness ?? null,
        clarity: clarity ?? null,
        attention: attention ?? null,
        needsFollowUp: !!needsFollowUp,
        comments: comments || null,
      },
      update: {
        satisfaction: satisfaction ?? null,
        usefulness: usefulness ?? null,
        clarity: clarity ?? null,
        attention: attention ?? null,
        needsFollowUp: !!needsFollowUp,
        comments: comments || null,
      },
    });
    if (needsFollowUp) {
      await prisma.trainingAppointment.update({ where: { id: appt.id }, data: { status: 'follow_up' } });
    }
    res.json({ survey });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Checkout de Stripe para activar/renovar un sitio inactivo (activación por webhook).
export async function activationCheckout(req, res) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe no está configurado en el servidor.' });
    }
    const { clubId, districtId } = resolveTargetIds(req, req.body);
    const { entity, type } = await resolveSiteEntity({ clubId, districtId });
    if (!entity) return res.status(404).json({ error: 'Sitio no encontrado' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = originOf(req);

    // Con customerId → portal; sin él → checkout de primer pago (activa por webhook).
    if (entity.stripeCustomerId) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: entity.stripeCustomerId,
        return_url: `${origin}/admin/agenda-soporte?activated=1`,
      });
      return res.json({ url: portal.url, mode: 'portal' });
    }

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
      metadata: { type: 'training_activation', entityId: entity.id, entityType: type },
      success_url: `${origin}/admin/agenda-soporte?activated=1`,
      cancel_url: `${origin}/admin/agenda-soporte?activation=cancelled`,
    });
    res.json({ url: session.url, mode: 'checkout' });
  } catch (e) {
    console.error('[training] activationCheckout:', e);
    res.status(500).json({ error: e.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SUPERADMIN — Gestión de citas, materiales, estadísticas
// ────────────────────────────────────────────────────────────────────────────
export async function adminListAppointments(req, res) {
  try {
    const { from, to, clubId, status, responsibleId, typeId, modality } = req.query;
    const where = {};
    if (clubId) where.clubId = clubId;
    if (status) where.status = status;
    if (responsibleId) where.responsibleId = responsibleId;
    if (typeId) where.appointmentTypeId = typeId;
    if (modality) where.modality = modality;
    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = new Date(from);
      if (to) where.startAt.lte = new Date(to);
    }
    const appointments = await prisma.trainingAppointment.findMany({
      where,
      include: { ...APPT_INCLUDE, club: { select: { id: true, name: true, type: true } } },
      orderBy: { startAt: 'asc' },
    });
    res.json({ appointments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function adminUpdateAppointment(req, res) {
  try {
    const data = {};
    for (const k of ['status', 'responsibleId', 'modality', 'meetingUrl', 'meetingProvider', 'internalNotes', 'agreements']) {
      if (k in req.body) data[k] = req.body[k];
    }
    if ('outcome' in req.body) data.outcome = req.body.outcome;
    if ('meetingUrl' in req.body && !isValidMeetingUrl(req.body.meetingUrl)) {
      return res.status(400).json({ error: 'El enlace debe iniciar con https://' });
    }
    const appt = await prisma.trainingAppointment.update({
      where: { id: req.params.id },
      data,
      include: APPT_INCLUDE,
    });
    res.json({ appointment: appt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// Reenvío manual del correo de confirmación (con auditoría).
export async function resendConfirmation(req, res) {
  try {
    const appt = await prisma.trainingAppointment.findUnique({ where: { id: req.params.id }, include: APPT_INCLUDE });
    if (!appt) return res.status(404).json({ error: 'No encontrada' });
    if (!appt.requesterEmail) return res.status(400).json({ error: 'La reserva no tiene un correo válido.' });
    const manageUrl = appt.publicToken ? `${originOf(req)}/mi-capacitacion/${appt.publicToken}` : undefined;
    const conf = await sendConfirmation(appt, { origin: originOf(req), manageUrl });
    const out = await prisma.trainingAppointment.update({
      where: { id: appt.id },
      data: { confirmationSentAt: conf?.success ? new Date() : appt.confirmationSentAt, confirmationError: conf?.success ? null : (conf?.error || 'send_failed') },
      include: APPT_INCLUDE,
    });
    if (!conf?.success) return res.status(502).json({ error: conf?.error || 'No se pudo enviar', appointment: out });
    res.json({ ok: true, appointment: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function addMaterial(req, res) {
  try {
    const { label, url, kind, s3Key } = req.body;
    if (!label || !url) return res.status(400).json({ error: 'Etiqueta y URL requeridas' });
    const material = await prisma.trainingMaterial.create({
      data: { appointmentId: req.params.id, label, url, kind: kind || 'document', s3Key: s3Key || null },
    });
    res.json({ material });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteMaterial(req, res) {
  try {
    await prisma.trainingMaterial.delete({ where: { id: req.params.materialId } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function adminStats(req, res) {
  try {
    const { from, to } = req.query;
    const where = {};
    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = new Date(from);
      if (to) where.startAt.lte = new Date(to);
    }
    const [appts, surveys] = await Promise.all([
      prisma.trainingAppointment.findMany({ where, include: { appointmentType: true } }),
      prisma.trainingSurvey.findMany(),
    ]);

    const byStatus = {};
    let totalMinutes = 0;
    const bySite = new Set();
    const byType = {};
    for (const a of appts) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      if (a.clubId) bySite.add(a.clubId);
      if (a.districtId) bySite.add(a.districtId);
      if (a.status === 'completed') {
        totalMinutes += (new Date(a.endAt) - new Date(a.startAt)) / 60000;
      }
      const tn = a.appointmentType?.name || 'Sin tipo';
      byType[tn] = (byType[tn] || 0) + 1;
    }

    const completed = byStatus.completed || 0;
    const noShow = byStatus.no_show || 0;
    const attended = completed + noShow;
    const surveyAvg = (field) => {
      const vals = surveys.map((s) => s[field]).filter((v) => v != null);
      return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
    };

    res.json({
      total: appts.length,
      byStatus,
      sitesAttended: bySite.size,
      hoursInvested: +(totalMinutes / 60).toFixed(1),
      topTypes: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
      attendanceRate: attended ? +((completed / attended) * 100).toFixed(1) : null,
      cancellations: byStatus.cancelled || 0,
      reschedules: byStatus.rescheduled || 0,
      pending: byStatus.pending || 0,
      followUps: byStatus.follow_up || 0,
      satisfaction: {
        satisfaction: surveyAvg('satisfaction'),
        usefulness: surveyAvg('usefulness'),
        clarity: surveyAvg('clarity'),
        attention: surveyAvg('attention'),
        responses: surveys.length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
