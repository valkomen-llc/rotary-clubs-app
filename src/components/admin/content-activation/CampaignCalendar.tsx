// Calendario editorial de la campaña (v4.1169).
//
// Misma fuente que el scheduler: `GET /content-activation/:id/calendar`
// (proyección ciclo×paso con estados reales). Flujo = reglas, Calendario =
// ejecuciones proyectadas de esas reglas. Vistas Mes | Semana | Lista,
// navegación, modal por evento con vista previa y acciones (omitir,
// reprogramar, editar plantilla).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface Occ {
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
}

const ESTADO_CLS: Record<string, string> = {
  programado: 'bg-sky-100 text-sky-800 border-sky-200',
  pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
  proyectado: 'bg-gray-100 text-gray-600 border-gray-200',
  enviado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  fallido: 'bg-rose-100 text-rose-800 border-rose-200',
  pausado: 'bg-slate-200 text-slate-700 border-slate-300',
  cancelado: 'bg-gray-100 text-gray-400 border-gray-200 line-through',
  omitido: 'bg-gray-100 text-gray-400 border-gray-200 line-through',
};

const ESTADO_LABEL: Record<string, string> = {
  programado: 'Programado', pendiente: 'Pendiente', proyectado: 'Proyectado',
  enviado: 'Enviado', fallido: 'Fallido', pausado: 'Pausado',
  cancelado: 'Cancelado', omitido: 'Omitido',
};

const CHAN_LABEL: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp' };
const CHAN_CLS: Record<string, string> = {
  email: 'bg-sky-600', whatsapp: 'bg-green-600',
};

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`;

const CampaignCalendar: React.FC<{ campaignId: string; headers: Record<string, string> }> = ({ campaignId, headers: H }) => {
  const navigate = useNavigate();
  const [occs, setOccs] = useState<Occ[]>([]);
  const [camp, setCamp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'mes' | 'semana' | 'lista'>('mes');
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate() }; });
  const [chanFilter, setChanFilter] = useState<'todos' | 'email' | 'whatsapp'>('todos');
  const [sel, setSel] = useState<Occ | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [newDate, setNewDate] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/content-activation/${campaignId}/calendar`, { headers: H });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar el calendario');
      setOccs(d.occurrences || []);
      setCamp(d.campaign);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => occs.filter((o) => chanFilter === 'todos' || o.channel === chanFilter),
    [occs, chanFilter]
  );
  const byDay = useMemo(() => {
    const m = new Map<string, Occ[]>();
    for (const o of filtered) {
      // Día pared en la zona de la campaña (el servidor ya la calcula).
      const [dd, mm, yy] = o.fecha.split('/').map(Number);
      const k = keyOf(yy, mm, dd);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    for (const v of m.values()) v.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return m;
  }, [filtered]);

  // Mes visible: 6×7 celdas desde el lunes anterior/a del día 1.
  const monthCells = useMemo(() => {
    const first = new Date(cursor.y, cursor.mo - 1, 1);
    const dowMon0 = (first.getDay() + 6) % 7; // 0=lunes
    const cells: { y: number; mo: number; d: number; other: boolean }[] = [];
    const start = new Date(cursor.y, cursor.mo - 1, 1 - dowMon0);
    for (let i = 0; i < 42; i++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      cells.push({ y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate(), other: dt.getMonth() + 1 !== cursor.mo });
    }
    return cells;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const cur = new Date(cursor.y, cursor.mo - 1, cursor.d);
    const dowMon0 = (cur.getDay() + 6) % 7;
    const mon = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - dowMon0);
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      return { y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate() };
    });
  }, [cursor]);

  const step = (dir: 1 | -1) => {
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
  const goToday = () => { const n = new Date(); setCursor({ y: n.getFullYear(), mo: n.getMonth() + 1, d: n.getDate() }); };

  const openEvent = (o: Occ) => {
    setSel(o);
    setPreview(null);
    setNewDate('');
    setDevice('desktop');
  };

  const loadPreview = async (o: Occ) => {
    setPreviewLoading(true);
    try {
      const r = await fetch(
        `${API}/content-activation/${campaignId}/step-preview?cycleIndex=${o.cycleIndex}&stepKey=${encodeURIComponent(o.stepKey)}`,
        { headers: H }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo previsualizar');
      setPreview(d);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const doOverride = async (action: 'omitir' | 'reprogramar' | 'limpiar', o: Occ) => {
    if (action === 'omitir' && !window.confirm(`¿Omitir "${o.stepName}" del ${o.fecha} (${o.periodo})? La regla del flujo se conserva; solo se salta esta ejecución.`)) return;
    setActing(true);
    try {
      const r = await fetch(`${API}/content-activation/${campaignId}/schedule-override`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleIndex: o.cycleIndex, stepKey: o.stepKey, action, ...(action === 'reprogramar' ? { newDate } : {}) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo aplicar');
      toast.success(action === 'omitir' ? 'Ejecución omitida.' : action === 'reprogramar' ? 'Ejecución reprogramada.' : 'Override revertido.');
      await load();
      setSel(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActing(false);
    }
  };

  const chip = (o: Occ) => (
    <button
      key={`${o.cycleIndex}:${o.stepKey}`}
      onClick={() => openEvent(o)}
      title={`${o.stepName} · ${o.fecha} ${o.hora} · ${ESTADO_LABEL[o.estado] || o.estado}`}
      className={`w-full text-left text-[11px] rounded-lg border px-1.5 py-1 mb-1 truncate ${ESTADO_CLS[o.estado] || ESTADO_CLS.proyectado}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${CHAN_CLS[o.channel] || 'bg-gray-400'}`} />
      {o.hora} · {o.stepName}{o.reprogramado ? ' ⟳' : ''}
    </button>
  );

  const monthLabel = new Date(cursor.y, cursor.mo - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <div className="flex gap-1">
          <button onClick={() => step(-1)} className="px-2.5 py-1.5 rounded-xl border font-bold">←</button>
          <button onClick={goToday} className="px-2.5 py-1.5 rounded-xl border font-bold">Hoy</button>
          <button onClick={() => step(1)} className="px-2.5 py-1.5 rounded-xl border font-bold">→</button>
        </div>
        <div className="font-bold text-sm capitalize">{view === 'semana' ? `Semana del ${weekDays[0].d}/${weekDays[0].mo}` : monthLabel}</div>
        <div className="flex gap-1 ml-2">
          {(['mes', 'semana', 'lista'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1.5 rounded-xl border font-bold capitalize ${view === v ? 'bg-gray-900 text-white' : ''}`}>{v}</button>
          ))}
        </div>
        <div className="flex gap-1 ml-2">
          {(['todos', 'email', 'whatsapp'] as const).map((c) => (
            <button key={c} onClick={() => setChanFilter(c)} className={`px-2.5 py-1.5 rounded-xl border font-bold capitalize ${chanFilter === c ? 'bg-gray-900 text-white' : ''}`}>
              {c === 'todos' ? 'Todos' : CHAN_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="ml-auto text-gray-400">{occs.length} ejecuciones proyectadas · {camp?.timezone || ''}</div>
      </div>

      {loading && <div className="text-xs text-gray-400">Calculando proyección (misma fuente que el scheduler)…</div>}
      {!loading && occs.length === 0 && <div className="text-xs text-gray-400 border rounded-xl p-4">Sin ejecuciones proyectadas en el período de la campaña.</div>}

      {!loading && view !== 'lista' && (
        <div>
          <div className="grid grid-cols-7 gap-1 text-[11px] font-bold text-gray-400 mb-1">
            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => <div key={d} className="px-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {(view === 'mes' ? monthCells : weekDays.map((w) => ({ ...w, other: false }))).map((c, i) => {
              const evts = byDay.get(keyOf(c.y, c.mo, c.d)) || [];
              return (
                <div key={i} className={`border rounded-xl p-1 min-h-[86px] ${c.other ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
                  <div className="text-[11px] font-bold text-gray-500 px-1">{c.d}</div>
                  <div className="max-h-[120px] overflow-auto">{evts.map(chip)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && view === 'lista' && (
        <div className="space-y-1 max-h-[60vh] overflow-auto">
          {filtered.slice().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).map((o) => (
            <button key={`${o.cycleIndex}:${o.stepKey}`} onClick={() => openEvent(o)} className="w-full text-left border rounded-xl px-3 py-2 text-xs flex flex-wrap items-center gap-2 hover:bg-gray-50">
              <span className="font-bold w-24">{o.fecha} · {o.hora}</span>
              <span className={`px-1.5 py-0.5 rounded-full border font-bold ${ESTADO_CLS[o.estado] || ''}`}>{ESTADO_LABEL[o.estado] || o.estado}</span>
              <span><span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${CHAN_CLS[o.channel] || ''}`} />{CHAN_LABEL[o.channel] || o.channel}</span>
              <span className="font-bold">{o.stepName}</span>
              <span className="text-gray-400">{o.periodo} · Día {o.dayOffset}{o.templateId ? ` · plantilla v${o.templateVersion ?? 'últ'}` : ''}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-gray-500">
        <span><span className="inline-block w-2 h-2 rounded-full bg-sky-600 mr-1" />Email</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-600 mr-1" />WhatsApp</span>
        {Object.entries(ESTADO_LABEL).map(([k, v]) => (
          <span key={k} className={`px-1.5 py-0.5 rounded-full border ${ESTADO_CLS[k]}`}>{v}</span>
        ))}
      </div>

      {sel && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold">{sel.stepName}</div>
              <button onClick={() => { setSel(null); setPreview(null); }} className="border rounded-xl px-3 py-1.5 text-xs font-bold">Cerrar</button>
            </div>
            <div className="grid md:grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs">
              <div><span className="text-gray-400">Campaña:</span> <b>{camp?.name || ''}</b></div>
              <div><span className="text-gray-400">Ciclo:</span> {sel.periodo} (ciclo {sel.cycleIndex + 1})</div>
              <div><span className="text-gray-400">Fecha:</span> <b>{sel.fecha}</b> · <span className="text-gray-400">Hora:</span> <b>{sel.hora}</b></div>
              <div><span className="text-gray-400">Zona horaria:</span> {sel.timezone}</div>
              <div><span className="text-gray-400">Canal:</span> {CHAN_LABEL[sel.channel] || sel.channel}</div>
              <div><span className="text-gray-400">Condición:</span> {sel.condition} · Día {sel.dayOffset}</div>
              <div><span className="text-gray-400">Estado:</span> <span className={`px-1.5 py-0.5 rounded-full border font-bold ${ESTADO_CLS[sel.estado] || ''}`}>{ESTADO_LABEL[sel.estado] || sel.estado}</span>{sel.reprogramado && ' ⟳ reprogramado'}</div>
              <div><span className="text-gray-400">Plantilla:</span> {sel.templateId ? `vinculada · v${sel.templateVersion ?? 'última'}` : 'sin vínculo (contenido del paso)'} {preview?.template?.name ? `· ${preview.template.name}` : ''}</div>
              <div><span className="text-gray-400">Asunto:</span> {preview ? (preview.subject || '—') : 'abrir vista previa'}</div>
              <div><span className="text-gray-400">CTA / URL:</span> {preview ? (preview.formUrl || preview.ctaUrl || '—') : '—'}</div>
              <div><span className="text-gray-400">Próxima en serie:</span> {sel.proximaEnSerie ? new Date(sel.proximaEnSerie).toLocaleString('es-CO') : '—'}</div>
              <div><span className="text-gray-400">Audiencia:</span> {camp?.audienceMode === 'fixed' ? 'fija' : 'dinámica'} · canales {(camp?.canales || []).join('+') || '—'}</div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
              <button onClick={() => loadPreview(sel)} disabled={previewLoading} className="px-3 py-1.5 rounded-xl bg-gray-900 text-white font-bold disabled:opacity-50">
                {previewLoading ? 'Cargando…' : 'Vista previa'}
              </button>
              {sel.templateId && (
                <button onClick={() => navigate(`/admin/email-marketing?plantilla=${sel.templateId}`)} className="px-3 py-1.5 rounded-xl border font-bold">Editar plantilla</button>
              )}
              {(sel.estado === 'omitido' || sel.reprogramado) ? (
                <button onClick={() => doOverride('limpiar', sel)} disabled={acting} className="px-3 py-1.5 rounded-xl border font-bold disabled:opacity-50">Revertir a plan</button>
              ) : (
                <>
                  <button onClick={() => doOverride('omitir', sel)} disabled={acting} className="px-3 py-1.5 rounded-xl border font-bold disabled:opacity-50">Omitir este envío</button>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="datetime-local" className="border rounded-xl px-2 py-1.5" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                    <button onClick={() => newDate ? doOverride('reprogramar', sel) : toast.error('Elegí la nueva fecha')} disabled={acting} className="px-3 py-1.5 rounded-xl border font-bold disabled:opacity-50">Cambiar fecha</button>
                  </label>
                </>
              )}
            </div>
            {preview && (
              <div className="mt-3 border-t pt-3">
                {preview.channel === 'email' ? (
                  <>
                    <div className="flex items-center gap-2 text-xs mb-2">
                      <span className="text-gray-400">Asunto: <b>{preview.subject || '—'}</b></span>
                      <span className="ml-auto flex gap-1">
                        <button onClick={() => setDevice('desktop')} className={`px-2 py-1 rounded-lg border font-bold ${device === 'desktop' ? 'bg-gray-900 text-white' : ''}`}>Desktop</button>
                        <button onClick={() => setDevice('mobile')} className={`px-2 py-1 rounded-lg border font-bold ${device === 'mobile' ? 'bg-gray-900 text-white' : ''}`}>Mobile</button>
                      </span>
                    </div>
                    <div className={`mx-auto border rounded-xl overflow-hidden ${device === 'mobile' ? 'max-w-[375px]' : 'w-full'}`}>
                      <iframe title="Vista previa del paso" srcDoc={preview.html} className="w-full bg-white" style={{ height: 420 }} />
                    </div>
                    {preview.missing?.length > 0 && <div className="text-[11px] text-amber-600 mt-1">Variables sin valor: {preview.missing.join(', ')}</div>}
                  </>
                ) : (
                  <div className="border rounded-xl p-3 bg-[#e7ffdb] text-xs whitespace-pre-wrap max-h-80 overflow-auto max-w-md">
                    {preview.headerText ? `${preview.headerText}\n\n` : ''}{preview.body}{preview.footer ? `\n\n${preview.footer}` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignCalendar;
