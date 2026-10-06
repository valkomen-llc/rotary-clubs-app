// Proyección Flujo → Calendario — espejo navegador (v4.1169).
// Misma matemática que `server/lib/contentActivationSchedule.js`: el servidor
// DECIDE (calendario API, tick, envíos); aquí solo se PINTA y se verifica
// paridad en tests (comparando SALIDAS, no código).
export interface SchedStep {
  key: string;
  dayOffset: number;
  channel: 'email' | 'whatsapp';
  condition?: string;
  templateId?: string | null;
  templateVersion?: number | null;
  name?: string;
  [k: string]: unknown;
}

export interface Occurrence {
  cycleIndex: number;
  periodo: string;
  stepKey: string;
  stepName: string;
  stepOrder: number;
  dayOffset: number;
  channel: string;
  condition: string;
  scheduledAt: string;
  fecha: string;
  hora: string;
  timezone: string;
  templateId: string | null;
  templateVersion: number | null;
  estadoBase: string;
  reprogramado: boolean;
  [k: string]: unknown;
}

export const MAX_CYCLES = 120;

const dtfCache: Record<string, Intl.DateTimeFormat> = {};
const dtf = (tz: string) =>
  (dtfCache[tz] ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }));

export interface Wall { y: number; mo: number; d: number; h: number; mi: number }

export const wallParts = (ms: number, tz: string): Wall => {
  const parts = Object.fromEntries(dtf(tz).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day),
    h: Number(parts.hour) % 24, mi: Number(parts.minute),
  };
};

const offsetMs = (tz: string, utcMs: number): number => {
  const w = wallParts(utcMs, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - utcMs;
};

export const utcFromWall = (p: Wall, tz: string): string => {
  const guess = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  const o1 = offsetMs(tz, guess);
  const o2 = offsetMs(tz, guess - o1);
  return new Date(guess - o2).toISOString();
};

const daysInMonth = (y: number, mo: number): number => new Date(Date.UTC(y, mo, 0)).getUTCDate();

export const addPeriodWall = (p: Wall, frecuencia: string, customDays?: number | null): Wall => {
  if (frecuencia === 'semanal' || frecuencia === 'quincenal' || frecuencia === 'personalizada') {
    const n = frecuencia === 'semanal' ? 7 : frecuencia === 'quincenal' ? 15 : Math.max(1, Number(customDays) || 30);
    const d = new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) + n * 86400000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: p.h, mi: p.mi };
  }
  const months = frecuencia === 'trimestral' ? 3 : 1;
  const total = p.mo - 1 + months;
  const y = p.y + Math.floor(total / 12);
  const mo = (total % 12) + 1;
  return { y, mo, d: Math.min(p.d, daysInMonth(y, mo)), h: p.h, mi: p.mi };
};

export const addDaysWall = (p: Wall, n: number): Wall => {
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) + Number(n) * 86400000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: p.h, mi: p.mi };
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const periodoLabel = (frecuencia: string, startAt: string, index = 0, tz?: string): string => {
  const ms = new Date(startAt).getTime();
  if (!Number.isFinite(ms)) return `Período ${index + 1}`;
  if (frecuencia === 'semanal') {
    const y = tz ? wallParts(ms, tz).y : new Date(ms).getFullYear();
    return `Semana ${index + 1} · ${y}`;
  }
  const w = tz ? wallParts(ms, tz) : null;
  return `${MESES[w ? w.mo - 1 : new Date(ms).getMonth()]} ${w ? w.y : new Date(ms).getFullYear()}`;
};

export interface CycleInput {
  startAt: string;
  frecuencia?: string;
  customDays?: number | null;
  timezone?: string;
  endAt?: string | null;
  maxCycles?: number;
}

export const cycleStarts = ({ startAt, frecuencia = 'mensual', customDays = null, timezone = 'America/Bogota', endAt = null, maxCycles = MAX_CYCLES }: CycleInput): string[] => {
  const t0 = new Date(startAt).getTime();
  if (!Number.isFinite(t0)) return [];
  const tz = String(timezone || 'America/Bogota');
  const fin = endAt ? new Date(endAt).getTime() : null;
  if (frecuencia === 'unica') return [new Date(t0).toISOString()];
  // Desde el ancla ORIGINAL (no iterativo): 31 ene → 28 feb → 31 mar.
  const startWall = wallParts(t0, tz);
  const anchorWall = (i: number): Wall => {
    if (frecuencia === 'semanal' || frecuencia === 'quincenal' || frecuencia === 'personalizada') {
      const n = frecuencia === 'semanal' ? 7 : frecuencia === 'quincenal' ? 15 : Math.max(1, Number(customDays) || 30);
      return addDaysWall(startWall, n * i);
    }
    const months = frecuencia === 'trimestral' ? 3 * i : i;
    const total = startWall.mo - 1 + months;
    const y = startWall.y + Math.floor(total / 12);
    const mo = (total % 12) + 1;
    return { y, mo, d: Math.min(startWall.d, daysInMonth(y, mo)), h: startWall.h, mi: startWall.mi };
  };
  const out: string[] = [];
  for (let i = 0; i < Math.min(maxCycles, 500); i++) {
    const iso = i === 0 ? new Date(t0).toISOString() : utcFromWall(anchorWall(i), tz);
    if (fin && new Date(iso).getTime() > fin) break;
    out.push(iso);
  }
  return out;
};

const STEP_NAMES: Record<string, string> = {
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

export const stepDisplayName = (step: SchedStep): string => {
  if (step?.name) return String(step.name);
  return STEP_NAMES[step?.key] || String(step?.key || 'Mensaje');
};

const normSteps = (flowDef: unknown): SchedStep[] =>
  (Array.isArray(flowDef) ? flowDef : []).slice(0, 20).map((n: any) => ({
    key: String(n?.key || 'paso'),
    dayOffset: Math.max(0, parseInt(n?.dayOffset, 10) || 0),
    channel: n?.channel === 'email' ? 'email' : 'whatsapp',
    condition: String(n?.condition || 'siempre'),
    templateId: n?.templateId ? String(n.templateId) : null,
    templateVersion: Number.isFinite(Number(n?.templateVersion)) ? Number(n.templateVersion) : null,
  }));

export const occurrencesForCampaign = (
  campaign: { startAt?: string; endAt?: string | null; timezone?: string; frecuencia?: string; customDays?: number | null; flowDef?: unknown },
  opts: { overrides?: Array<{ cycleIndex: number; stepKey: string; action: string; newDate?: string }> } = {}
): Occurrence[] => {
  const tz = String(campaign?.timezone || 'America/Bogota');
  const steps = normSteps(campaign.flowDef);
  const anchors = cycleStarts({
    startAt: campaign.startAt || '', frecuencia: campaign.frecuencia,
    customDays: campaign.customDays, timezone: tz, endAt: campaign.endAt,
  });
  const fin = campaign.endAt ? new Date(campaign.endAt).getTime() : null;
  const ov = new Map((opts.overrides || []).map((o) => [`${o.cycleIndex}:${o.stepKey}`, o]));
  const out: Occurrence[] = [];
  anchors.forEach((anchorIso, cycleIndex) => {
    const base = wallParts(new Date(anchorIso).getTime(), tz);
    steps.forEach((s, stepOrder) => {
      const wall = addDaysWall(base, s.dayOffset || 0);
      let scheduledAt = utcFromWall(wall, tz);
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
        periodo: periodoLabel(campaign.frecuencia || 'mensual', anchorIso, cycleIndex, tz),
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
};
