// Calendario GLOBAL de marketing (v4.1171, FASE 2).
//
// Agrega las comunicaciones de todas las campañas visibles y en curso.
// Misma parrilla y estados que el calendario por campaña (CalendarViews);
// los datos vienen de `GET /content-activation/calendar-global` (única
// fuente). Solo lectura: las acciones viven en cada campaña.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  MonthGrid, WeekGrid, ListView, Legend, ViewTabs, NavButtons,
  useCalCursor, monthCells, weekDays, groupByDay,
  eventChipCls, ESTADO_CLS, ESTADO_LABEL, CHAN_LABEL, CHAN_CLS,
  type CalOcc,
} from '../content-activation/CalendarViews';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

const toISO = (y: number, mo: number, d: number, end = false) =>
  `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${end ? '23:59:59' : '00:00:00'}.000Z`;

const GlobalCalendar: React.FC = () => {
  const navigate = useNavigate();
  const [occs, setOccs] = useState<CalOcc[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'mes' | 'semana' | 'lista'>('mes');
  const { cursor, step, goToday } = useCalCursor();
  const [chanFilter, setChanFilter] = useState<'todos' | 'email' | 'whatsapp'>('todos');
  const [sel, setSel] = useState<CalOcc | null>(null);

  const range = useMemo(() => {
    if (view === 'lista') return '';
    const days = view === 'semana' ? weekDays(cursor) : monthCells(cursor.y, cursor.mo);
    const first = days[0];
    const last = days[days.length - 1];
    return `?from=${encodeURIComponent(toISO(first.y, first.mo, first.d))}&to=${encodeURIComponent(toISO(last.y, last.mo, last.d, true))}`;
  }, [view, cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/content-activation/calendar-global${range}`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar el calendario global');
      setOccs(d.occurrences || []);
      setTruncated(!!d.truncated);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => occs.filter((o) => chanFilter === 'todos' || o.channel === chanFilter),
    [occs, chanFilter]
  );
  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const days = useMemo(
    () => (view === 'semana' ? weekDays(cursor) : monthCells(cursor.y, cursor.mo)),
    [view, cursor]
  );
  const campaigns = useMemo(() => [...new Set(filtered.map((o) => o.campaignName).filter(Boolean))], [filtered]);
  const monthLabel = new Date(cursor.y, cursor.mo - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  const chip = (o: CalOcc) => (
    <button
      key={`${o.campaignId}:${o.cycleIndex}:${o.stepKey}`}
      onClick={() => setSel(o)}
      title={`${o.campaignName} · ${o.stepName} · ${o.fecha} ${o.hora}`}
      className={eventChipCls(o.estado)}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${CHAN_CLS[o.channel] || 'bg-gray-400'}`} />
      {o.hora} · <b>{o.campaignName}</b> · {o.stepName}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <NavButtons onStep={(dir) => step(view, dir)} onToday={goToday} />
        <div className="font-bold text-sm capitalize">{view === 'semana' ? `Semana del ${weekDays(cursor)[0].d}/${weekDays(cursor)[0].mo}` : monthLabel}</div>
        <div className="ml-2"><ViewTabs view={view} onView={setView} /></div>
        <div className="flex gap-1 ml-2">
          {(['todos', 'email', 'whatsapp'] as const).map((c) => (
            <button key={c} onClick={() => setChanFilter(c)} className={`px-2.5 py-1.5 rounded-xl border font-bold capitalize ${chanFilter === c ? 'bg-gray-900 text-white' : ''}`}>
              {c === 'todos' ? 'Todos' : CHAN_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="ml-auto text-gray-400">
          {occs.length} comunicaciones · {campaigns.length} campaña(s){truncated ? ' · vista parcial (tope)' : ''}
        </div>
      </div>

      {loading && <div className="text-xs text-gray-400">Agregando campañas en curso…</div>}
      {!loading && view !== 'lista' && (
        view === 'mes'
          ? <MonthGrid days={days} byDay={byDay} chip={chip} />
          : <WeekGrid days={days} byDay={byDay} chip={chip} />
      )}
      {!loading && view === 'lista' && (
        <ListView
          occs={filtered}
          row={(o) => (
            <button key={`${o.campaignId}:${o.cycleIndex}:${o.stepKey}`} onClick={() => setSel(o)} className="w-full text-left border rounded-xl px-3 py-2 text-xs flex flex-wrap items-center gap-2 hover:bg-gray-50">
              <span className="font-bold w-24">{o.fecha} · {o.hora}</span>
              <span className="font-bold">{o.campaignName}</span>
              <span className={`px-1.5 py-0.5 rounded-full border font-bold ${ESTADO_CLS[o.estado] || ''}`}>{ESTADO_LABEL[o.estado] || o.estado}</span>
              <span><span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${CHAN_CLS[o.channel] || ''}`} />{CHAN_LABEL[o.channel] || o.channel}</span>
              <span>{o.stepName} · {o.periodo}</span>
            </button>
          )}
        />
      )}
      <Legend />

      {sel && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold">{sel.campaignName} · {sel.stepName}</div>
              <button onClick={() => setSel(null)} className="border rounded-xl px-3 py-1.5 text-xs font-bold">Cerrar</button>
            </div>
            <div className="grid gap-x-4 gap-y-1 mt-3 text-xs">
              <div><span className="text-gray-400">Comunicación:</span> <b>{sel.stepName}</b> (Día {sel.dayOffset}, ciclo {sel.cycleIndex + 1} · {sel.periodo})</div>
              <div><span className="text-gray-400">Fecha:</span> <b>{sel.fecha} {sel.hora}</b> · {sel.timezone}</div>
              <div><span className="text-gray-400">Canal:</span> {CHAN_LABEL[sel.channel] || sel.channel} · <span className="text-gray-400">Estado:</span> <span className={`px-1.5 py-0.5 rounded-full border font-bold ${ESTADO_CLS[sel.estado] || ''}`}>{ESTADO_LABEL[sel.estado] || sel.estado}</span></div>
              <div><span className="text-gray-400">Plantilla:</span> {sel.templateId ? `vinculada · v${sel.templateVersion ?? 'última'}` : 'contenido del paso'}</div>
              <div><span className="text-gray-400">Audiencia:</span> la de la campaña (ver detalle)</div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">Solo lectura: vista previa, omisiones y reprogramaciones se gestionan en el Calendario de cada campaña.</p>
            <button onClick={() => navigate('/admin/activacion-contenido')} className="mt-3 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">Abrir Campañas de Contenido</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalCalendar;
