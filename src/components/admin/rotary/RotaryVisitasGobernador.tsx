// ════════════════════════════════════════════════════════════════════════════
// Rotary en Acción — Visitas del Gobernador (administración) — v4.1260.0
//
// Indicadores, listado con filtros, ficha completa con galería, acciones de
// revisión (revisar, editar, aprobar, pedir correcciones, rechazar, publicar),
// historial con responsable y la cobertura del año rotario para los informes
// de gestión. La publicación crea UNA solicitud de Rotary en Acción con el
// mismo texto y los mismos archivos: desde la ficha se abre en Solicitudes.
// ════════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, CalendarDays, Check, CheckCircle2, Copy, Edit2, ExternalLink, Film,
  History, Image as ImageIcon, Inbox, Link2, Loader2, Mail, MapPin, MessageSquare, RefreshCw, Search,
  Send, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { leerJson } from '../../../lib/leerJson';
import { stateLabel } from '../../../lib/contentSubmissionSpec';
import {
  VISIT_REASON_REQUIRED, VISIT_CAPTION_MAX, visitDateLabel, visitStateChip, visitStateLabel,
} from '../../../lib/governorVisitSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const BASE = `${API}/rotary-en-accion/visitas-gobernador`;
const getToken = () => localStorage.getItem('rotary_token') || '';
const PUBLIC_PATH = '/visitas-del-gobernador';

const campo = 'w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-rotary-blue outline-none text-sm bg-white min-w-0 transition-colors';
const rotulo = 'block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1';

interface Fila {
  id: string; publicRef: string; status: string; statusLabel: string; clubProfileId: string; clubName: string; clubCity?: string;
  visitDate: string; governorName: string; venue?: string; title: string; responsibleName: string; responsibleRole?: string;
  contributionSubmissionId?: string | null; photoCount: number; videoCount: number; linkCount: number; createdAt: string;
}
interface Kpis { recibidas?: number; pendientes?: number; aprobadas?: number; publicadas?: number; rechazadas?: number; correcciones?: number; clubesVisitados?: number }
interface Filtros { q: string; club: string; governor: string; status: string; from: string; to: string; sort: string; page: number }
const FILTROS0: Filtros = { q: '', club: '', governor: '', status: '', from: '', to: '', sort: 'recientes', page: 1 };

const TEXTOS: [string, string][] = [
  ['description', 'Descripción de la visita'], ['activities', 'Actividades desarrolladas'], ['topics', 'Temas abordados'],
  ['recognitions', 'Reconocimientos'], ['agreements', 'Acuerdos'], ['commitments', 'Compromisos'], ['highlights', 'Resultados destacados'],
];
const HIST_LABEL: Record<string, string> = {
  created: 'Reporte recibido', status: 'Cambio de estado', corrected: 'Correcciones enviadas por el club',
  edited: 'Edición administrativa', published: 'Publicada en Rotary en Acción', notes: 'Notas internas',
};

const fechaHora = (v?: string) => (v ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const soloDigitos = (s?: string) => String(s || '').replace(/\D/g, '');

// ── Piezas (fuera del componente) ─────────────────────────────────────────
const Kpi: React.FC<{ label: string; value?: number; tone: string; active?: boolean; onClick?: () => void }> = ({ label, value, tone, active, onClick }) => (
  <button type="button" onClick={onClick} className={`text-left rounded-2xl border p-4 bg-white transition-all ${active ? 'border-rotary-blue ring-2 ring-rotary-blue/20' : 'border-gray-100 hover:border-gray-200'}`}>
    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</p>
    <p className={`text-2xl font-black mt-1 ${tone}`}>{value ?? 0}</p>
  </button>
);

const Chip: React.FC<{ status: string }> = ({ status }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${visitStateChip(status)}`}>{visitStateLabel(status)}</span>
);

const Seccion: React.FC<{ titulo: string; children: React.ReactNode; accion?: React.ReactNode }> = ({ titulo, children, accion }) => (
  <section className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">{titulo}</h4>
      {accion}
    </div>
    {children}
  </section>
);

const Dato: React.FC<{ k: string; v?: React.ReactNode }> = ({ k, v }) => (
  <div className="text-sm"><dt className="text-[10px] font-black uppercase tracking-wider text-gray-400">{k}</dt><dd className="text-gray-800 font-medium break-words">{v || '—'}</dd></div>
);

interface PanelProps { id: string; canEdit: boolean; canManage: boolean; canPublish: boolean; onClose: () => void; onChanged: () => void }

const DetalleVisita: React.FC<PanelProps> = ({ id, canEdit, canManage, canPublish, onClose, onChanged }) => {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token || getToken()}`, 'Content-Type': 'application/json' }), [token]);
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [accion, setAccion] = useState<string>('');
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [enlaceCorreccion, setEnlaceCorreccion] = useState('');
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<any>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await fetch(`${BASE}/admin/${encodeURIComponent(id)}`, { headers });
      const { data: d } = await leerJson<any>(r);
      if (!r.ok || !d?.visit) throw new Error(d?.error || `No se pudo abrir la visita (${r.status}).`);
      setData(d);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }, [id, headers]);
  useEffect(() => { cargar(); }, [cargar]);

  const v = data?.visit;

  const transicion = async () => {
    if (!accion) return;
    if (VISIT_REASON_REQUIRED.includes(accion) && !motivo.trim()) { toast.error('Escribe el motivo: es lo que se le comunica al club.'); return; }
    setTrabajando(true);
    try {
      const r = await fetch(`${BASE}/admin/${v.id}/status`, { method: 'POST', headers, body: JSON.stringify({ to: accion, reason: motivo }) });
      const { data: d } = await leerJson<any>(r);
      if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
      toast.success(`Visita: ${d.statusLabel}`);
      if (d.correctionUrl) setEnlaceCorreccion(d.correctionUrl);
      setAccion(''); setMotivo('');
      await cargar(); onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setTrabajando(false); }
  };

  const publicar = async () => {
    if (!window.confirm('Se creará el contenido en Rotary en Acción con el texto y la galería de esta visita. ¿Continuar?')) return;
    setTrabajando(true);
    try {
      const r = await fetch(`${BASE}/admin/${v.id}/publish`, { method: 'POST', headers, body: '{}' });
      const { data: d } = await leerJson<any>(r);
      if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
      toast.success(d.already ? 'La visita ya estaba publicada.' : 'Publicada en Rotary en Acción.');
      (d.avisos || []).forEach((a: string) => toast.warning(a));
      await cargar(); onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setTrabajando(false); }
  };

  const empezarEdicion = () => {
    setForm({
      governorName: v.governorName, visitDate: v.visitDate, venue: v.venue || '', title: v.title, reason: v.reason || '',
      description: v.description || '', activities: v.activities || '', topics: v.topics || '', recognitions: v.recognitions || '',
      agreements: v.agreements || '', commitments: v.commitments || '', highlights: v.highlights || '',
      responsibleName: v.responsibleName, responsibleRole: v.responsibleRole || '', responsibleEmail: v.responsibleEmail, responsiblePhone: v.responsiblePhone || '',
      adminNotes: v.adminNotes || '',
      media: (v.media || []).map((m: any) => ({ key: m.key, caption: m.caption || '', filename: m.filename, kind: m.kind, url: m.url })),
      links: (v.links || []).map((l: any) => ({ url: l.url, caption: l.caption || '' })),
    });
    setEditando(true);
  };

  const guardar = async () => {
    setTrabajando(true);
    try {
      const body = v.status === 'publicada' ? { adminNotes: form.adminNotes } : { ...form, media: form.media.map((m: any) => ({ key: m.key, caption: m.caption })) };
      const r = await fetch(`${BASE}/admin/${v.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      const { data: d } = await leerJson<any>(r);
      if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
      toast.success(d.cambios?.length ? `Guardado: ${d.cambios.length} cambio(s).` : 'Guardado.');
      setEditando(false);
      await cargar(); onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setTrabajando(false); }
  };

  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success('Enlace copiado.'); } catch { toast.error('No se pudo copiar.'); }
  };

  const msgCorreccion = enlaceCorreccion && v
    ? `Hola ${v.responsibleName}: el equipo distrital revisó el reporte de la visita del Gobernador ${v.publicRef} (${v.clubName}) y pide estas correcciones: ${v.statusReason || ''}. Puedes corregirlo aquí: ${enlaceCorreccion}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-3xl h-full bg-gray-50 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {v && <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-xs font-black text-rotary-blue">{v.publicRef}</span><Chip status={v.status} /></div>}
            <h3 className="text-lg font-black text-gray-900 mt-1 truncate">{v?.title || 'Visita del Gobernador'}</h3>
            {v && <p className="text-xs text-gray-500">{v.clubName} · {visitDateLabel(v.visitDate)} · {v.governorName}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {cargando && <div className="py-16 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>}
          {error && <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">{error}</div>}
          {v && !cargando && (
            <>
              {/* Acciones */}
              <Seccion titulo="Acciones">
                <div className="flex flex-wrap gap-2">
                  {canManage && data.next.map((n: any) => (
                    <button key={n.id} onClick={() => { setAccion(n.id); setMotivo(''); }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition ${accion === n.id ? 'border-rotary-blue bg-blue-50 text-rotary-blue' : 'border-gray-100 bg-white text-gray-700 hover:border-gray-200'}`}>
                      {n.id === 'en_revision' ? 'Marcar en revisión' : n.id === 'aprobada' ? 'Aprobar' : n.id === 'correcciones' ? 'Solicitar correcciones' : n.id === 'rechazada' ? 'Rechazar' : n.id === 'recibida' ? 'Devolver a recibida' : n.label}
                    </button>
                  ))}
                  {canEdit && !editando && (
                    <button onClick={empezarEdicion} className="px-3 py-2 rounded-xl text-xs font-bold border-2 border-gray-100 bg-white text-gray-700 hover:border-gray-200 flex items-center gap-1.5">
                      <Edit2 className="w-3.5 h-3.5" /> {v.status === 'publicada' ? 'Notas internas' : 'Editar'}
                    </button>
                  )}
                  {canPublish && data.canPublish && (
                    <button onClick={publicar} disabled={trabajando} className="px-3 py-2 rounded-xl text-xs font-bold bg-rotary-blue text-white hover:bg-blue-900 flex items-center gap-1.5 disabled:opacity-60">
                      <Send className="w-3.5 h-3.5" /> Publicar en Rotary en Acción
                    </button>
                  )}
                </div>
                {!canManage && !canPublish && <p className="text-xs text-gray-400">Tu perfil puede consultar esta visita, pero no cambiar su estado.</p>}
                {accion && (
                  <div className="space-y-2 pt-1">
                    <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className={campo}
                      placeholder={VISIT_REASON_REQUIRED.includes(accion) ? 'Motivo (obligatorio): qué debe corregir o por qué se rechaza' : 'Comentario (opcional)'} />
                    <div className="flex gap-2">
                      <button onClick={transicion} disabled={trabajando} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:opacity-60 flex items-center gap-1.5">
                        {trabajando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar «{visitStateLabel(accion)}»
                      </button>
                      <button onClick={() => setAccion('')} className="px-4 py-2 rounded-xl border text-xs font-bold text-gray-500">Cancelar</button>
                    </div>
                  </div>
                )}
                {v.statusReason && ['correcciones', 'rechazada'].includes(v.status) && (
                  <p className="text-xs rounded-xl bg-orange-50 border border-orange-100 text-orange-800 p-3"><b>Motivo comunicado:</b> {v.statusReason}</p>
                )}
                {enlaceCorreccion && (
                  <div className="rounded-xl bg-sky-50 border border-sky-100 p-3 space-y-2 text-xs">
                    <p className="font-bold text-sky-900">Enlace de corrección para el club (válido 30 días, un solo uso):</p>
                    <p className="font-mono break-all text-sky-800">{enlaceCorreccion}</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => copiar(enlaceCorreccion)} className="px-3 py-1.5 rounded-lg bg-white border text-sky-800 font-bold flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copiar</button>
                      {soloDigitos(v.responsiblePhone) && (
                        <a href={`https://wa.me/${soloDigitos(v.responsiblePhone)}?text=${encodeURIComponent(msgCorreccion)}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</a>
                      )}
                      <a href={`mailto:${v.responsibleEmail}?subject=${encodeURIComponent(`Correcciones · Visita del Gobernador ${v.publicRef}`)}&body=${encodeURIComponent(msgCorreccion)}`} className="px-3 py-1.5 rounded-lg bg-rotary-blue text-white font-bold flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Correo</a>
                    </div>
                  </div>
                )}
                {v.status === 'correcciones' && !enlaceCorreccion && v.hasCorrectionLink && (
                  <p className="text-[11px] text-gray-500">El club tiene un enlace de corrección vigente. Para generar uno nuevo, vuelve a «Solicitar correcciones» desde «En revisión».</p>
                )}
              </Seccion>

              {/* Publicación y trazabilidad */}
              {data.publicacion && (
                <Seccion titulo="Publicación en Rotary en Acción">
                  <div className="text-sm space-y-1">
                    <p>Solicitud <span className="font-mono font-bold">{String(data.publicacion.id).slice(0, 8)}</span> · estado <b>{stateLabel(data.publicacion.status)}</b> · {fechaHora(v.publishedAt)} por {v.publishedBy || '—'}</p>
                    {data.publicacion.article && (
                      <p>Artículo: <b>{data.publicacion.article.status}</b>{data.publicacion.article.publicUrl && <> · <a href={data.publicacion.article.publicUrl} target="_blank" rel="noopener noreferrer" className="text-rotary-blue font-bold inline-flex items-center gap-1">ver publicación <ExternalLink className="w-3 h-3" /></a></>}</p>
                    )}
                  </div>
                  <Link to={`/admin/rotary-en-accion?tab=solicitudes&abrir=${encodeURIComponent(data.publicacion.id)}`} onClick={onClose}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-rotary-blue hover:underline">
                    Abrir en Solicitudes (Biblioteca, artículo, difusión) <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </Seccion>
              )}

              {editando && form ? (
                <Seccion titulo={v.status === 'publicada' ? 'Notas internas' : 'Editar visita'}>
                  {v.status !== 'publicada' && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {([['title', 'Título'], ['governorName', 'Gobernador'], ['visitDate', 'Fecha'], ['venue', 'Lugar'], ['responsibleName', 'Responsable'], ['responsibleRole', 'Cargo'], ['responsibleEmail', 'Correo'], ['responsiblePhone', 'WhatsApp']] as const).map(([k, l]) => (
                        <div key={k}>
                          <label className={rotulo}>{l}</label>
                          <input type={k === 'visitDate' ? 'date' : 'text'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={campo} />
                        </div>
                      ))}
                      {[['reason', 'Motivo del encuentro'] as [string, string], ...TEXTOS].map(([k, l]) => (
                        <div key={k} className="sm:col-span-2">
                          <label className={rotulo}>{l}</label>
                          <textarea rows={k === 'description' ? 5 : 2} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={campo} />
                        </div>
                      ))}
                      <div className="sm:col-span-2 space-y-2">
                        <label className={rotulo}>Galería (descripciones y quitar)</label>
                        {form.media.map((m: any, i: number) => (
                          <div key={m.key} className="flex items-center gap-2">
                            {m.kind === 'video' ? <Film className="w-4 h-4 text-gray-400 shrink-0" /> : <ImageIcon className="w-4 h-4 text-gray-400 shrink-0" />}
                            <span className="text-xs text-gray-500 w-32 truncate shrink-0">{m.filename}</span>
                            <input value={m.caption} maxLength={VISIT_CAPTION_MAX} onChange={(e) => setForm({ ...form, media: form.media.map((x: any, j: number) => (j === i ? { ...x, caption: e.target.value } : x)) })} className={campo} placeholder="Descripción" />
                            <button onClick={() => setForm({ ...form, media: form.media.filter((_: any, j: number) => j !== i) })} className="p-1.5 text-gray-400 hover:text-red-600" aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ))}
                        {form.links.map((l: any, i: number) => (
                          <div key={l.url} className="flex items-center gap-2">
                            <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="text-xs text-gray-500 w-32 truncate shrink-0">{l.url}</span>
                            <input value={l.caption} maxLength={VISIT_CAPTION_MAX} onChange={(e) => setForm({ ...form, links: form.links.map((x: any, j: number) => (j === i ? { ...x, caption: e.target.value } : x)) })} className={campo} placeholder="Descripción" />
                            <button onClick={() => setForm({ ...form, links: form.links.filter((_: any, j: number) => j !== i) })} className="p-1.5 text-gray-400 hover:text-red-600" aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className={rotulo}>Notas internas (no se publican)</label>
                    <textarea rows={3} value={form.adminNotes} onChange={(e) => setForm({ ...form, adminNotes: e.target.value })} className={campo} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={guardar} disabled={trabajando} className="px-4 py-2 rounded-xl bg-rotary-blue text-white text-xs font-bold disabled:opacity-60 flex items-center gap-1.5">{trabajando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar</button>
                    <button onClick={() => setEditando(false)} className="px-4 py-2 rounded-xl border text-xs font-bold text-gray-500">Cancelar</button>
                  </div>
                </Seccion>
              ) : (
                <>
                  <Seccion titulo="Club e información de la visita">
                    <dl className="grid sm:grid-cols-2 gap-3">
                      <Dato k="Club" v={v.clubName} />
                      <Dato k="Ciudad / departamento" v={[v.clubCity, v.clubState].filter(Boolean).join(' · ')} />
                      <Dato k="ID Directorio" v={<span className="font-mono">{String(v.clubProfileId).slice(0, 8).toUpperCase()}</span>} />
                      <Dato k="Fecha de la visita" v={visitDateLabel(v.visitDate)} />
                      <Dato k="Gobernador visitante" v={v.governorName} />
                      <Dato k="Lugar" v={v.venue} />
                      <div className="sm:col-span-2"><Dato k="Motivo del encuentro" v={<span className="whitespace-pre-line">{v.reason}</span>} /></div>
                    </dl>
                  </Seccion>
                  <Seccion titulo="Memoria institucional">
                    <div className="space-y-3">
                      {TEXTOS.filter(([k]) => String(v[k] || '').trim()).map(([k, l]) => (
                        <div key={k}><p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{l}</p><p className="text-sm text-gray-800 whitespace-pre-line">{v[k]}</p></div>
                      ))}
                    </div>
                  </Seccion>
                  <Seccion titulo={`Galería (${(v.media || []).length} archivo(s) · ${(v.links || []).length} enlace(s))`}>
                    {(v.media || []).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {v.media.map((m: any) => (
                          <figure key={m.key} className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                            {m.url ? (
                              m.kind === 'video'
                                ? <video src={m.url} controls preload="metadata" className="w-full aspect-video bg-black" />
                                : <a href={m.url} target="_blank" rel="noopener noreferrer"><img src={m.url} alt={m.caption || m.filename} className="w-full aspect-square object-cover" loading="lazy" /></a>
                            ) : <div className="aspect-square flex items-center justify-center text-gray-300"><ImageIcon className="w-8 h-8" /></div>}
                            <figcaption className="p-2 text-[11px] text-gray-600">{m.caption || <span className="text-gray-300">{m.filename}</span>}{m.inLibrary && <span className="block text-[10px] text-emerald-600 font-bold">En la Biblioteca</span>}</figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                    {(v.links || []).length > 0 && (
                      <ul className="space-y-1">
                        {v.links.map((l: any) => (
                          <li key={l.url} className="text-xs"><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-rotary-blue font-bold inline-flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> {l.host || l.url}</a>{l.caption && <span className="text-gray-500"> — {l.caption}</span>}</li>
                        ))}
                      </ul>
                    )}
                  </Seccion>
                  <Seccion titulo="Responsable del reporte">
                    <dl className="grid sm:grid-cols-2 gap-3">
                      <Dato k="Nombre" v={v.responsibleName} />
                      <Dato k="Cargo" v={v.responsibleRole} />
                      <Dato k="Correo" v={<a href={`mailto:${v.responsibleEmail}`} className="text-rotary-blue">{v.responsibleEmail}</a>} />
                      <Dato k="WhatsApp" v={v.responsiblePhone && <a href={`https://wa.me/${soloDigitos(v.responsiblePhone)}`} target="_blank" rel="noopener noreferrer" className="text-rotary-blue">{v.responsiblePhone}</a>} />
                      <Dato k="Veracidad y autorización" v={v.truthConfirmed && v.publicationConsent ? `Confirmadas · ${fechaHora(v.consentAt)}` : 'Pendientes'} />
                    </dl>
                    {v.adminNotes && <p className="text-xs rounded-xl bg-gray-50 border border-gray-100 p-3"><b>Notas internas:</b> {v.adminNotes}</p>}
                  </Seccion>
                </>
              )}

              <Seccion titulo="Historial de cambios">
                <ol className="space-y-2.5">
                  {[...(v.history || [])].reverse().map((h: any, i: number) => (
                    <li key={i} className="flex gap-3 text-xs">
                      <History className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-gray-800">
                          {HIST_LABEL[h.type] || h.type}
                          {h.from && h.to && <span className="font-medium text-gray-500"> · {visitStateLabel(h.from)} → {visitStateLabel(h.to)}</span>}
                        </p>
                        <p className="text-gray-500">{fechaHora(h.at)} · {h.actorName || 'Sistema'}</p>
                        {h.detail && <p className="text-gray-600 mt-0.5">{h.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </Seccion>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Cobertura: React.FC<{ stats: any }> = ({ stats }) => {
  if (!stats) return null;
  const { cobertura, porGobernador, porMes, desde } = stats;
  const pct = cobertura.clubes ? Math.round((cobertura.visitados / cobertura.clubes) * 100) : 0;
  const max = Math.max(1, ...porMes.map((m: any) => m.n));
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Cobertura del año rotario (desde {visitDateLabel(desde)})</p>
        <p className="text-2xl font-black text-gray-900 mt-1">{cobertura.visitados} <span className="text-sm text-gray-400">/ {cobertura.clubes} clubes</span></p>
        <div className="h-2 rounded-full bg-gray-100 mt-2 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
        <p className="text-xs text-gray-500 mt-1">{pct}% de los clubes rotarios del catálogo con visita reportada (sin contar rechazadas).</p>
        {cobertura.sinVisita.length > 0 && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-bold text-gray-600">{cobertura.sinVisita.length} clubes sin visita reportada</summary>
            <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5 text-gray-500">{cobertura.sinVisita.map((c: any) => <li key={c.id}>{c.name}{c.city ? ` · ${c.city}` : ''}</li>)}</ul>
          </details>
        )}
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Por gobernador</p>
        {porGobernador.length === 0 ? <p className="text-xs text-gray-400 mt-2">Sin visitas en el período.</p> : (
          <ul className="mt-2 space-y-1.5 text-sm">{porGobernador.map((g: any) => <li key={g.gobernador} className="flex justify-between gap-2"><span className="truncate">{g.gobernador}</span><span className="font-bold shrink-0">{g.visitas} visitas · {g.clubes} clubes</span></li>)}</ul>
        )}
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Visitas por mes</p>
        {porMes.length === 0 ? <p className="text-xs text-gray-400 mt-2">Sin visitas en el período.</p> : (
          <div className="mt-3 flex items-end gap-1.5 h-24" role="img" aria-label="Visitas por mes">
            {porMes.map((m: any) => (
              <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${m.mes}: ${m.n}`}>
                <span className="text-[10px] font-bold text-gray-600">{m.n}</span>
                <div className="w-full rounded-t bg-rotary-blue" style={{ height: `${Math.max(6, (m.n / max) * 64)}px` }} />
                <span className="text-[9px] text-gray-400">{m.mes.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const RotaryVisitasGobernador: React.FC<{ canEdit: boolean; canManage: boolean; canPublish: boolean }> = ({ canEdit, canManage, canPublish }) => {
  const { token } = useAuth();
  const [f, setF] = useState<Filtros>(FILTROS0);
  const [busqueda, setBusqueda] = useState('');
  const [data, setData] = useState<{ visits: Fila[]; total: number; perPage: number; kpis: Kpis; facets: { clubs: { id: string; name: string }[]; governors: string[] } } | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    const headers = { Authorization: `Bearer ${token || getToken()}` };
    try {
      const qs = new URLSearchParams(Object.entries(f).filter(([, val]) => val !== '' && val !== undefined).map(([k, val]) => [k, String(val)]));
      const [r, rs] = await Promise.all([fetch(`${BASE}/admin/list?${qs}`, { headers }), fetch(`${BASE}/admin/stats`, { headers })]);
      const { data: d } = await leerJson<any>(r);
      if (!r.ok || !d) throw new Error(d?.error || `No se pudo cargar el listado (${r.status}).`);
      setData(d);
      const { data: s } = await leerJson<any>(rs);
      if (rs.ok) setStats(s);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }, [f, token]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const t = setTimeout(() => setF((prev) => (prev.q === busqueda ? prev : { ...prev, q: busqueda, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  const filtrar = (patch: Partial<Filtros>) => setF((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));
  const k = data?.kpis || {};
  const paginas = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const hayFiltros = f.q || f.club || f.governor || f.status || f.from || f.to;
  const urlPublica = typeof window !== 'undefined' ? `${window.location.origin}${PUBLIC_PATH}` : PUBLIC_PATH;

  const copiarFormulario = async () => {
    try { await navigator.clipboard.writeText(urlPublica); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { toast.error('No se pudo copiar.'); }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-rotary-blue" /> Visitas del Gobernador</h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">Reportes de las secretarías de los clubes del Distrito 4281. Nada se publica sin aprobación; al publicar se crea el contenido en Rotary en Acción con el mismo texto y galería.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button onClick={cargar} disabled={cargando} className="px-3.5 py-2.5 rounded-xl border-2 border-gray-100 font-bold text-gray-600 flex items-center gap-1.5 bg-white hover:bg-gray-50">
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button onClick={copiarFormulario} className="px-3.5 py-2.5 rounded-xl border-2 border-gray-100 font-bold text-gray-600 flex items-center gap-1.5 bg-white hover:bg-gray-50">
            {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />} Copiar enlace del formulario
          </button>
          <a href={PUBLIC_PATH} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 rounded-xl bg-rotary-blue text-white font-bold flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" /> Abrir formulario
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Recibidas" value={k.recibidas} tone="text-gray-900" active={!f.status} onClick={() => filtrar({ status: '' })} />
        <Kpi label="Pendientes" value={k.pendientes} tone="text-amber-600" active={f.status === 'pendientes'} onClick={() => filtrar({ status: 'pendientes' })} />
        <Kpi label="Aprobadas" value={k.aprobadas} tone="text-emerald-600" active={f.status === 'aprobada'} onClick={() => filtrar({ status: 'aprobada' })} />
        <Kpi label="Publicadas" value={k.publicadas} tone="text-blue-700" active={f.status === 'publicada'} onClick={() => filtrar({ status: 'publicada' })} />
        <Kpi label="Rechazadas" value={k.rechazadas} tone="text-rose-600" active={f.status === 'rechazada'} onClick={() => filtrar({ status: 'rechazada' })} />
      </div>

      <Cobertura stats={stats} />

      <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className={rotulo}>Buscar</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className={`${campo} pl-9`} placeholder="Título, club, gobernador, referencia…" />
            </div>
          </div>
          <div>
            <label className={rotulo}>Club</label>
            <select value={f.club} onChange={(e) => filtrar({ club: e.target.value })} className={campo}>
              <option value="">Todos</option>
              {(data?.facets.clubs || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={rotulo}>Gobernador</label>
            <select value={f.governor} onChange={(e) => filtrar({ governor: e.target.value })} className={campo}>
              <option value="">Todos</option>
              {(data?.facets.governors || []).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className={rotulo}>Estado</label>
            <select value={f.status} onChange={(e) => filtrar({ status: e.target.value })} className={campo}>
              <option value="">Todos</option>
              <option value="pendientes">Pendientes</option>
              {['recibida', 'en_revision', 'correcciones', 'aprobada', 'rechazada', 'publicada'].map((s) => <option key={s} value={s}>{visitStateLabel(s)}</option>)}
            </select>
          </div>
          <div>
            <label className={rotulo}>Orden</label>
            <select value={f.sort} onChange={(e) => filtrar({ sort: e.target.value })} className={campo}>
              <option value="recientes">Recibidas recientes</option>
              <option value="visita">Fecha de visita</option>
              <option value="club">Club</option>
            </select>
          </div>
          <div>
            <label className={rotulo}>Visita desde</label>
            <input type="date" value={f.from} onChange={(e) => filtrar({ from: e.target.value })} className={campo} />
          </div>
          <div>
            <label className={rotulo}>Visita hasta</label>
            <input type="date" value={f.to} onChange={(e) => filtrar({ to: e.target.value })} className={campo} />
          </div>
          {hayFiltros && (
            <div className="flex items-end">
              <button onClick={() => { setBusqueda(''); setF(FILTROS0); }} className="px-3 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Limpiar filtros</button>
            </div>
          )}
        </div>

        {error && <div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>}

        {data && data.visits.length === 0 && !cargando && (
          <div className="text-center py-12 text-gray-400">
            <Inbox className="w-10 h-10 mx-auto text-gray-300" />
            <p className="text-sm mt-2">{hayFiltros ? 'Ninguna visita coincide con los filtros.' : 'Todavía no hay visitas reportadas. Comparte el enlace del formulario con las secretarías.'}</p>
          </div>
        )}

        {data && data.visits.length > 0 && (
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
            {data.visits.map((r) => (
              <button key={r.id} onClick={() => setAbierta(r.id)} className="w-full text-left p-4 hover:bg-gray-50/80 transition flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] font-black text-rotary-blue">{r.publicRef}</span>
                    <Chip status={r.status} />
                    {r.contributionSubmissionId && <span className="text-[10px] font-bold text-blue-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> En Rotary en Acción</span>}
                  </div>
                  <p className="font-bold text-gray-900 mt-1 truncate">{r.title}</p>
                  <p className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.clubName}</span>
                    <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {visitDateLabel(r.visitDate)}</span>
                    <span>Gob. {r.governorName}</span>
                  </p>
                </div>
                <div className="text-[11px] text-gray-500 sm:text-right shrink-0">
                  <p className="font-bold">{r.photoCount} fotos · {r.videoCount} videos · {r.linkCount} enlaces</p>
                  <p>Reporta: {r.responsibleName}</p>
                  <p>Recibida {fechaHora(r.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {data && paginas > 1 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">{data.total} visitas · página {f.page} de {paginas}</span>
            <div className="flex gap-2">
              <button disabled={f.page <= 1} onClick={() => filtrar({ page: f.page - 1 })} className="px-3 py-1.5 rounded-lg border font-bold disabled:opacity-40">Anterior</button>
              <button disabled={f.page >= paginas} onClick={() => filtrar({ page: f.page + 1 })} className="px-3 py-1.5 rounded-lg border font-bold disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        )}
        {cargando && !data && <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-rotary-blue mx-auto" /></div>}
        <p className="text-[11px] text-gray-400 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {k.clubesVisitados ?? 0} clubes con al menos una visita reportada (histórico, sin rechazadas).</p>
      </div>

      {abierta && (
        <DetalleVisita id={abierta} canEdit={canEdit} canManage={canManage} canPublish={canPublish} onClose={() => setAbierta(null)} onChanged={cargar} />
      )}
    </div>
  );
};

export default RotaryVisitasGobernador;
