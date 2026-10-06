// Vistas compartidas del calendario editorial (v4.1171, FASE 2).
// Las usan el Calendario POR CAMPAÑA y el CALENDARIO GLOBAL de marketing:
// misma parrilla, mismos estados, mismos colores. Los datos siempre vienen
// del servidor (única fuente); aquí solo se pinta.
import React, { useState } from 'react';

export interface CalOcc {
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
  estado: string;
  proximaEnSerie: string | null;
  campaignId?: string;
  campaignName?: string;
  campaignStatus?: string;
}

export const ESTADO_CLS: Record<string, string> = {
  programado: 'bg-sky-100 text-sky-800 border-sky-200',
  pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
  proyectado: 'bg-gray-100 text-gray-600 border-gray-200',
  enviado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  fallido: 'bg-rose-100 text-rose-800 border-rose-200',
  pausado: 'bg-slate-200 text-slate-700 border-slate-300',
  cancelado: 'bg-gray-100 text-gray-400 border-gray-200 line-through',
  omitido: 'bg-gray-100 text-gray-400 border-gray-200 line-through',
};

export const ESTADO_LABEL: Record<string, string> = {
  programado: 'Programado', pendiente: 'Pendiente', proyectado: 'Proyectado',
  enviado: 'Enviado', fallido: 'Fallido', pausado: 'Pausado',
  cancelado: 'Cancelado', omitido: 'Omitido',
};

export const CHAN_LABEL: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp' };
export const CHAN_CLS: Record<string, string> = { email: 'bg-sky-600', whatsapp: 'bg-green-600' };

export interface Cursor { y: number; mo: number; d: number }

export const useCalCursor = (initial?: Cursor) => {
  const now = new Date();
  const [cursor, setCursor] = useState<Cursor>(initial || { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() });
  const step = (view: 'mes' | 'semana' | 'lista', dir: 1 | -1) => {
    if (view === 'semana') {
      const dt = new Date(new Date(cursor.y, cursor.mo - 1, cursor.d).getTime() + dir * 7 * 86400000);
      setCursor({ y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate() });
    } else {
      let { y, mo } = cursor;
      mo += dir;
      if (mo < 1) { mo = 12; y--; }
      if (mo > 12) { mo = 1; y++; }
      setCursor({ y, mo, d: 1 });
    }
  };
  const goToday = () => {
    const n = new Date();
    setCursor({ y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate() });
  };
  return { cursor, setCursor, step, goToday };
};

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`;

/** 42 celdas Lun–Dom cubriendo el mes (con días vecinos atenuados). */
export const monthCells = (y: number, mo: number) => {
  const first = new Date(y, mo - 1, 1);
  const dowMon0 = (first.getDay() + 6) % 7;
  const start = new Date(y, mo - 1, 1 - dowMon0);
  return Array.from({ length: 42 }, (_, i) => {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate(), other: dt.getMonth() + 1 !== mo };
  });
};

/** Los 7 días (Lun–Dom) de la semana del cursor. */
export const weekDays = (c: Cursor) => {
  const cur = new Date(c.y, c.mo - 1, c.d);
  const mon = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - ((cur.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    return { y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate(), other: false };
  });
};

/** Agrupa ocurrencias por día pared (el servidor ya calcula fecha/hora). */
export const groupByDay = (occs: CalOcc[]): Map<string, CalOcc[]> => {
  const m = new Map<string, CalOcc[]>();
  for (const o of occs) {
    const [dd, mm, yy] = String(o.fecha || '').split('/').map(Number);
    if (!yy) continue;
    const k = dayKey(yy, mm, dd);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(o);
  }
  for (const v of m.values()) v.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  return m;
};

export const eventChipCls = (estado: string) =>
  `w-full text-left text-[11px] rounded-lg border px-1.5 py-1 mb-1 truncate ${ESTADO_CLS[estado] || ESTADO_CLS.proyectado}`;

export const Legend: React.FC = () => (
  <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-gray-500">
    <span><span className="inline-block w-2 h-2 rounded-full bg-sky-600 mr-1" />Email</span>
    <span><span className="inline-block w-2 h-2 rounded-full bg-green-600 mr-1" />WhatsApp</span>
    {Object.entries(ESTADO_LABEL).map(([k, v]) => (
      <span key={k} className={`px-1.5 py-0.5 rounded-full border ${ESTADO_CLS[k]}`}>{v}</span>
    ))}
  </div>
);

interface GridProps {
  days: { y: number; mo: number; d: number; other: boolean }[];
  byDay: Map<string, CalOcc[]>;
  chip: (o: CalOcc) => React.ReactNode;
}

const DayNames: React.FC = () => (
  <div className="grid grid-cols-7 gap-1 text-[11px] font-bold text-gray-400 mb-1">
    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => <div key={d} className="px-1">{d}</div>)}
  </div>
);

export const MonthGrid: React.FC<GridProps> = ({ days, byDay, chip }) => (
  <div>
    <DayNames />
    <div className="grid grid-cols-7 gap-1">
      {days.map((c, i) => {
        const evts = byDay.get(dayKey(c.y, c.mo, c.d)) || [];
        return (
          <div key={i} className={`border rounded-xl p-1 min-h-[86px] ${c.other ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
            <div className="text-[11px] font-bold text-gray-500 px-1">{c.d}</div>
            <div className="max-h-[120px] overflow-auto">{evts.map(chip)}</div>
          </div>
        );
      })}
    </div>
  </div>
);

export const WeekGrid: React.FC<GridProps> = ({ days, byDay, chip }) => (
  <div>
    <DayNames />
    <div className="grid grid-cols-7 gap-1">
      {days.map((c, i) => {
        const evts = byDay.get(dayKey(c.y, c.mo, c.d)) || [];
        return (
          <div key={i} className="border rounded-xl p-1 min-h-[200px] bg-white">
            <div className="text-[11px] font-bold text-gray-500 px-1">{c.d}/{c.mo}</div>
            <div className="max-h-[320px] overflow-auto">{evts.map(chip)}</div>
          </div>
        );
      })}
    </div>
  </div>
);

export const ListView: React.FC<{ occs: CalOcc[]; row: (o: CalOcc) => React.ReactNode }> = ({ occs, row }) => (
  <div className="space-y-1 max-h-[60vh] overflow-auto">
    {occs.slice().sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt))).map(row)}
  </div>
);

export const ViewTabs: React.FC<{ view: string; onView: (v: 'mes' | 'semana' | 'lista') => void }> = ({ view, onView }) => (
  <div className="flex gap-1">
    {(['mes', 'semana', 'lista'] as const).map((v) => (
      <button key={v} onClick={() => onView(v)} className={`px-2.5 py-1.5 rounded-xl border font-bold capitalize ${view === v ? 'bg-gray-900 text-white' : ''}`}>{v}</button>
    ))}
  </div>
);

export const NavButtons: React.FC<{ onStep: (dir: 1 | -1) => void; onToday: () => void }> = ({ onStep, onToday }) => (
  <div className="flex gap-1">
    <button onClick={() => onStep(-1)} className="px-2.5 py-1.5 rounded-xl border font-bold">←</button>
    <button onClick={onToday} className="px-2.5 py-1.5 rounded-xl border font-bold">Hoy</button>
    <button onClick={() => onStep(1)} className="px-2.5 py-1.5 rounded-xl border font-bold">→</button>
  </div>
);
