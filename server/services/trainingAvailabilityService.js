// Motor de disponibilidad del Calendario de Capacitaciones.
// Genera los espacios reservables respetando: bloques (recurrentes/específicos),
// fechas bloqueadas/vacaciones, citas ya reservadas (sin doble reserva),
// cupos máximos por día, antelación mínima y horizonte de reserva.
import prisma from '../lib/prisma.js';
import { zonedWallToUtc, utcToZonedParts } from '../lib/timezone.js';

const CONFIG_KEY = 'global';

// Config singleton del equipo de soporte (se crea con defaults la primera vez).
export async function getTrainingConfig() {
  let cfg = await prisma.trainingConfig.findUnique({ where: { key: CONFIG_KEY } });
  if (!cfg) {
    cfg = await prisma.trainingConfig.create({ data: { key: CONFIG_KEY } });
  }
  return cfg;
}

// ¿Una fecha (partes locales) cae dentro de alguna vacación / bloqueo?
function isBlackedOut(parts, blackouts, tz) {
  const dayStart = zonedWallToUtc(parts.year, parts.month, parts.day, 0, tz).getTime();
  return blackouts.some((b) => {
    const s = new Date(b.startDate).getTime();
    const e = new Date(b.endDate).getTime();
    // Comparamos por el inicio del día local contra el rango [start, end] inclusive.
    return dayStart >= startOfUtcDay(s) && dayStart <= startOfUtcDay(e);
  });
}

function startOfUtcDay(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0);
}

// ¿El espacio [start,end) choca con alguna cita existente?
function overlapsExisting(startMs, endMs, existing) {
  return existing.some((a) => {
    const s = new Date(a.startAt).getTime();
    const e = new Date(a.endAt).getTime();
    return startMs < e && s < endMs;
  });
}

/**
 * Devuelve los espacios disponibles agrupados por día local del equipo.
 * @param {Object} p
 * @param {number} p.durationMin   duración de la cita (min)
 * @param {number} [p.fromOffsetDays=0]
 * @param {number} [p.days]        horizonte (default cfg.leadDays)
 * @param {string} [p.responsibleId] filtra por responsable
 */
export async function getAvailableSlots({ durationMin, fromOffsetDays = 0, days, responsibleId } = {}) {
  const cfg = await getTrainingConfig();
  if (!cfg.active) return { timezone: cfg.timezone, config: publicConfig(cfg), days: [] };

  const tz = cfg.timezone;
  const duration = Number(durationMin) || cfg.slotDurationMin;
  const step = duration + cfg.bufferMin;
  const horizonDays = Number(days) || cfg.leadDays;

  const [blocks, blackouts] = await Promise.all([
    prisma.trainingAvailabilityBlock.findMany({ where: { active: true } }),
    prisma.trainingBlackout.findMany(),
  ]);

  const now = new Date();
  const minStart = now.getTime() + cfg.minNoticeHours * 3600 * 1000;
  const windowStart = new Date(now.getTime() + fromOffsetDays * 86400000);
  const windowEnd = new Date(now.getTime() + (fromOffsetDays + horizonDays) * 86400000 + 86400000);

  // Citas activas en la ventana (excluye canceladas / no-show).
  const existing = await prisma.trainingAppointment.findMany({
    where: {
      status: { notIn: ['cancelled', 'no_show'] },
      startAt: { gte: windowStart, lt: windowEnd },
    },
    select: { startAt: true, endAt: true },
  });

  const daysOut = [];
  const seen = new Set();

  for (let i = fromOffsetDays; i <= fromOffsetDays + horizonDays; i++) {
    const probe = new Date(now.getTime() + i * 86400000);
    const parts = utcToZonedParts(probe, tz);
    if (seen.has(parts.dateKey)) continue;
    seen.add(parts.dateKey);

    if (isBlackedOut(parts, blackouts, tz)) continue;

    // Bloques aplicables: recurrentes del día de semana + específicos de la fecha.
    const dayBlocks = blocks.filter((b) => {
      if (responsibleId && b.responsibleId && b.responsibleId !== responsibleId) return false;
      if (b.kind === 'recurring') return b.weekday === parts.weekday;
      if (b.kind === 'specific' && b.date) {
        const bp = utcToZonedParts(new Date(b.date), tz);
        return bp.dateKey === parts.dateKey;
      }
      return false;
    });
    if (dayBlocks.length === 0) continue;

    // Cupos ya usados ese día local.
    const bookedThatDay = existing.filter(
      (a) => utcToZonedParts(new Date(a.startAt), tz).dateKey === parts.dateKey
    ).length;
    let remaining = Math.max(0, cfg.maxPerDay - bookedThatDay);
    if (remaining === 0) continue;

    const slots = [];
    for (const block of dayBlocks) {
      for (let t = block.startMinute; t + duration <= block.endMinute; t += step) {
        if (remaining <= 0) break;
        const start = zonedWallToUtc(parts.year, parts.month, parts.day, t, tz);
        const startMs = start.getTime();
        const endMs = startMs + duration * 60000;
        if (startMs < minStart) continue;
        if (overlapsExisting(startMs, endMs, existing)) continue;
        // Evita duplicar el mismo inicio si dos bloques se solapan.
        if (slots.some((s) => s.startAt === start.toISOString())) continue;
        slots.push({
          startAt: start.toISOString(),
          endAt: new Date(endMs).toISOString(),
          responsibleId: block.responsibleId || null,
        });
        remaining--;
      }
    }
    if (slots.length) {
      slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
      daysOut.push({ dateKey: parts.dateKey, slots });
    }
  }

  return { timezone: tz, config: publicConfig(cfg), days: daysOut };
}

// Verifica que un instante propuesto siga siendo válido y libre (anti doble-reserva).
// Se llama en el POST de reserva justo antes de crear, dentro de la validación.
export async function isSlotBookable({ startAt, durationMin }) {
  const cfg = await getTrainingConfig();
  const start = new Date(startAt);
  if (isNaN(start.getTime())) return { ok: false, reason: 'invalid_date' };

  const duration = Number(durationMin) || cfg.slotDurationMin;
  const endMs = start.getTime() + duration * 60000;
  const now = Date.now();

  if (start.getTime() < now + cfg.minNoticeHours * 3600 * 1000) {
    return { ok: false, reason: 'too_soon' };
  }
  if (start.getTime() > now + cfg.leadDays * 86400000 + 86400000) {
    return { ok: false, reason: 'too_far' };
  }

  // Conflicto con cita existente.
  const clash = await prisma.trainingAppointment.findFirst({
    where: {
      status: { notIn: ['cancelled', 'no_show'] },
      startAt: { lt: new Date(endMs) },
      endAt: { gt: start },
    },
    select: { id: true },
  });
  if (clash) return { ok: false, reason: 'conflict' };

  // Cupo por día.
  const tz = cfg.timezone;
  const dayKey = utcToZonedParts(start, tz).dateKey;
  const sameDay = await prisma.trainingAppointment.findMany({
    where: { status: { notIn: ['cancelled', 'no_show'] } },
    select: { startAt: true },
  });
  const bookedThatDay = sameDay.filter(
    (a) => utcToZonedParts(new Date(a.startAt), tz).dateKey === dayKey
  ).length;
  if (bookedThatDay >= cfg.maxPerDay) return { ok: false, reason: 'day_full' };

  return { ok: true, endAt: new Date(endMs), config: cfg };
}

// Config expuesta al frontend (sin campos internos).
export function publicConfig(cfg) {
  return {
    timezone: cfg.timezone,
    slotDurationMin: cfg.slotDurationMin,
    cancelWindowHours: cfg.cancelWindowHours,
    minNoticeHours: cfg.minNoticeHours,
    leadDays: cfg.leadDays,
    meetingProvider: cfg.meetingProvider,
    active: cfg.active,
  };
}
