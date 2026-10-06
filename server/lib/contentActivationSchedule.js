// Proyección única Flujo → Calendario → Scheduler (v4.1169).
//
// UNA sola fuente de verdad para las fechas: el calendario editorial, el
// endpoint de calendario, el tick (`tickActivation`) y las automatizaciones
// calculan con estas funciones puras (sin BD, sin reloj propio; `now` se
// inyecta). Reglas explícitas:
//
// · Los ciclos se anclan en la FECHA PARED de `startAt` en `timezone`
//   (America/Bogota no tiene DST; el código es genérico vía Intl).
// · mensual/trimestral: mismo día del mes con CLAMP al último día del mes
//   (31 ene → 28 feb), misma hora pared. semanal/quincenal/personalizada:
//   suma de días calendario en la zona.
// · Ocurrencia = ancla del ciclo + `dayOffset` días, misma hora pared.
// · NADA se ejecuta/proyecta después de `campaign.endAt` (corte explícito):
//   ni anclas ni ocurrencias posteriores a endAt existen.
// · `periodoLabel` y `nextPeriodStart` viven aquí; el motor los reutiliza,
//   así que etiqueta y recurrencia no pueden divergir del calendario.
//
// Límites: `unica` = un solo ciclo; `maxCycles` (120) acota proyecciones
// patológicas. Todo lo temporal recibe `now` como parámetro.
import { normalizeFlowSteps } from './contentActivationSpec.js';

export const MAX_CYCLES = 120;

// ─── Reloj de pared por zona ─────────────────────────────────────────────
const dtfCache = {};
const dtf = (tz) => (dtfCache[tz] ??= new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}));

export function wallParts(ms, tz) {
  const parts = Object.fromEntries(
    dtf(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value])
  );
  return {
    y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day),
    h: Number(parts.hour) % 24, mi: Number(parts.minute),
  };
}

const offsetMs = (tz, utcMs) => {
  const w = wallParts(utcMs, tz);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
  return asUtc - utcMs;
};

/** Convierte fecha pared {y,mo,d,h,mi} en `tz` a instante UTC (doble pasada). */
export function utcFromWall(p, tz) {
  const guess = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  const o1 = offsetMs(tz, guess);
  const o2 = offsetMs(tz, guess - o1);
  return new Date(guess - o2).toISOString();
}

const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/** Suma un período a una fecha pared. Mensual/trimestral con clamp. */
export function addPeriodWall(p, frecuencia, customDays) {
  if (frecuencia === 'semanal') {
    const ms = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) + 7 * 86400000;
    const d = new Date(ms);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: p.h, mi: p.mi };
  }
  if (frecuencia === 'quincenal') {
    const ms = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) + 15 * 86400000;
    const d = new Date(ms);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: p.h, mi: p.mi };
  }
  if (frecuencia === 'personalizada') {
    const ms = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) + Math.max(1, Number(customDays) || 30) * 86400000;
    const d = new Date(ms);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: p.h, mi: p.mi };
  }
  const months = frecuencia === 'trimestral' ? 3 : 1; // mensual por defecto
  const total = (p.mo - 1) + months;
  const y = p.y + Math.floor(total / 12);
  const mo = (total % 12) + 1;
  return { y, mo, d: Math.min(p.d, daysInMonth(y, mo)), h: p.h, mi: p.mi };
}

export function addDaysWall(p, n) {
  const ms = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) + Number(n) * 86400000;
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: p.h, mi: p.mi };
}

// ─── Etiqueta y recurrencia (el motor las reutiliza) ─────────────────────
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function periodoLabel(frecuencia, startAt, index = 0, tz = undefined) {
  const ms = new Date(startAt).getTime();
  if (!Number.isFinite(ms)) return `Período ${index + 1}`;
  if (frecuencia === 'semanal') {
    const y = tz ? wallParts(ms, tz).y : new Date(ms).getFullYear();
    return `Semana ${index + 1} · ${y}`;
  }
  const w = tz ? wallParts(ms, tz) : null;
  const mo = w ? w.mo - 1 : new Date(ms).getMonth();
  const y = w ? w.y : new Date(ms).getFullYear();
  return `${MESES[mo]} ${y}`;
}

/** Próximo inicio de período desde un instante (misma hora pared en `tz`). */
export function nextPeriodStart(frecuencia, from, customDays, tz = undefined) {
  if (frecuencia === 'unica') return null;
  if (!['semanal', 'quincenal', 'mensual', 'trimestral', 'personalizada'].includes(frecuencia)) return null;
  const ms = new Date(from).getTime();
  if (!Number.isFinite(ms)) return null;
  if (!tz) {
    // Compatibilidad exacta con el motor histórico (aritmética local).
    const d = new Date(ms);
    if (frecuencia === 'semanal') d.setDate(d.getDate() + 7);
    else if (frecuencia === 'quincenal') d.setDate(d.getDate() + 15);
    else if (frecuencia === 'mensual') d.setMonth(d.getMonth() + 1);
    else if (frecuencia === 'trimestral') d.setMonth(d.getMonth() + 3);
    else d.setDate(d.getDate() + (Number(customDays) || 30));
    return d;
  }
  return new Date(utcFromWall(addPeriodWall(wallParts(ms, tz), frecuencia, customDays), tz));
}

// ─── Ciclos y ocurrencias ────────────────────────────────────────────────
const campTz = (c) => String(c?.timezone || 'America/Bogota');

/** Anclas de ciclo (instantes ISO) hasta endAt o maxCycles. La primera es startAt. */
export function cycleStarts({ startAt, frecuencia = 'mensual', customDays = null, timezone = 'America/Bogota', endAt = null, maxCycles = MAX_CYCLES } = {}) {
  const t0 = new Date(startAt).getTime();
  if (!Number.isFinite(t0)) return [];
  const tz = String(timezone || 'America/Bogota');
  const fin = endAt ? new Date(endAt).getTime() : null;
  if (frecuencia === 'unica') return [new Date(t0).toISOString()];
  // Desde el ancla ORIGINAL (no iterativo): 31 ene → 28 feb → 31 mar, sin
  // deriva. Días fijos: inicio + 7/15/N·i días.
  const startWall = wallParts(t0, tz);
  const anchorWall = (i) => {
    if (frecuencia === 'semanal' || frecuencia === 'quincenal' || frecuencia === 'personalizada') {
      const n = frecuencia === 'semanal' ? 7 : frecuencia === 'quincenal' ? 15 : Math.max(1, Number(customDays) || 30);
      return addDaysWall(startWall, n * i);
    }
    const months = frecuencia === 'trimestral' ? 3 * i : i;
    const total = (startWall.mo - 1) + months;
    const y = startWall.y + Math.floor(total / 12);
    const mo = (total % 12) + 1;
    return { y, mo, d: Math.min(startWall.d, daysInMonth(y, mo)), h: startWall.h, mi: startWall.mi };
  };
  const out = [];
  for (let i = 0; i < Math.min(maxCycles, 500); i++) {
    const iso = i === 0 ? new Date(t0).toISOString() : utcFromWall(anchorWall(i), tz);
    if (fin && new Date(iso).getTime() > fin) break;
    out.push(iso);
  }
  return out;
}

/** Índice del ciclo que contiene `date` (anclas ≤ date). -1 si date < startAt. */
export function cycleIndexOf({ startAt, frecuencia = 'mensual', customDays = null, timezone = 'America/Bogota' } = {}, date) {
  const anchors = cycleStarts({ startAt, frecuencia, customDays, timezone });
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return -1;
  let idx = -1;
  for (let i = 0; i < anchors.length; i++) {
    if (new Date(anchors[i]).getTime() <= t) idx = i;
    else break;
  }
  return idx;
}

const STEP_NAMES = {
  invitacion: 'Invitación',
  recordatorio: 'Recordatorio',
  recordatorio_1: 'Recordatorio',
  recordatorio_2: 'Segundo recordatorio',
  segundo_recordatorio: 'Segundo recordatorio',
  ultimo_llamado: 'Último llamado',
  seguimiento_final: 'Último llamado',
  ideas: 'Ideas de contenido',
  cierre: 'Cierre de ciclo',
};

export const stepDisplayName = (step) => {
  if (step?.name) return String(step.name);
  return STEP_NAMES[step?.key] || String(step?.key || 'Mensaje');
};

/**
 * Proyecta TODAS las ocurrencias (ciclo × paso) hasta endAt.
 * overrides: [{cycleIndex, stepKey, action:'omitir'|'reprogramar', newDate}]
 * Cada ocurrencia: ciclo, paso, canal, fecha UTC + fecha/hora pared, plantilla.
 */
export function occurrencesForCampaign(campaign = {}, { overrides = [] } = {}) {
  const tz = campTz(campaign);
  const steps = normalizeFlowSteps(campaign.flowDef);
  const anchors = cycleStarts({
    startAt: campaign.startAt, frecuencia: campaign.frecuencia,
    customDays: campaign.customDays, timezone: tz, endAt: campaign.endAt,
  });
  const fin = campaign.endAt ? new Date(campaign.endAt).getTime() : null;
  const ov = new Map(
    (Array.isArray(overrides) ? overrides : []).map((o) => [`${o.cycleIndex}:${o.stepKey}`, o])
  );
  const out = [];
  anchors.forEach((anchorIso, cycleIndex) => {
    const base = wallParts(new Date(anchorIso).getTime(), tz);
    steps.forEach((s, stepOrder) => {
      const wall = addDaysWall(base, s.dayOffset || 0);
      let scheduledAt = utcFromWall(wall, tz);
      // Corte explícito: nada después de endAt.
      if (fin && new Date(scheduledAt).getTime() > fin) return;
      const o = ov.get(`${cycleIndex}:${s.key}`);
      let reprogramado = false;
      let estadoBase = 'proyectado';
      if (o?.action === 'omitir') estadoBase = 'omitido';
      if (o?.action === 'reprogramar' && o?.newDate) {
        scheduledAt = new Date(o.newDate).toISOString();
        reprogramado = true;
      }
      const w2 = wallParts(new Date(scheduledAt).getTime(), tz);
      out.push({
        cycleIndex,
        periodo: periodoLabel(campaign.frecuencia, anchorIso, cycleIndex, tz),
        stepKey: s.key,
        stepName: stepDisplayName(s),
        stepOrder,
        dayOffset: s.dayOffset || 0,
        channel: s.channel,
        condition: s.condition,
        scheduledAt,
        fecha: `${String(w2.d).padStart(2, '0')}/${String(w2.mo).padStart(2, '0')}/${w2.y}`,
        hora: `${String(w2.h).padStart(2, '0')}:${String(w2.mi).padStart(2, '0')}`,
        timezone: tz,
        templateId: s.templateId || null,
        templateVersion: s.templateVersion ?? null,
        estadoBase,
        reprogramado,
      });
    });
  });
  return out;
}

export default {
  MAX_CYCLES, wallParts, utcFromWall, addPeriodWall, addDaysWall,
  periodoLabel, nextPeriodStart, cycleStarts, cycleIndexOf,
  stepDisplayName, occurrencesForCampaign,
};
