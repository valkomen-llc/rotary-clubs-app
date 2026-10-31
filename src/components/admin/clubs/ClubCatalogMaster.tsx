// ════════════════════════════════════════════════════════════════════
// Directorio de Clubes → Catálogo Maestro — v4.1269.0
//
// La administración de la fuente ÚNICA de clubes (`/api/club-catalog/admin`):
// consultar, crear, editar, cambiar estado (sin borrar nunca), historial,
// posibles duplicados con revisión humana, importación con vista previa y
// comparación contra una fuente oficial, y exportación a CSV y Excel.
//
// Lo que se guarda aquí lo ven en ≤ 60 s todos los formularios conectados:
// Visitas del Gobernador, inscripciones a eventos, postulación de proyectos,
// Rotary en Acción, Plantillas IA, Aniversarios y el portal de clubes.
// Ver `docs/claude/catalogo-maestro-de-clubes.md`.
//
// ⚠️ Ningún componente se declara dentro de otro (regla de CLAUDE.md): los
// modales son componentes de primer nivel de este archivo.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Plus, Search, Download, Upload, History, Edit2, X, Loader2, CheckCircle2, AlertTriangle,
  Copy, RotateCcw, ShieldCheck, Lock, FileSpreadsheet, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { leerJson } from '../../../lib/leerJson';
import { CATALOG_STATE_LABELS, CLUB_TYPE_LABELS, invalidateCatalogCache, normText } from '../../../lib/clubCatalog';

const API = import.meta.env.VITE_API_URL || '/api';
const tokenOf = () => localStorage.getItem('rotary_token') || localStorage.getItem('token') || '';

export interface MasterClub {
  id: string;
  districtNumber: number | null;
  organizationType: string;
  officialName: string;
  shortName: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  clubType?: string | null;
  rotaryInternationalId?: string | null;
  contactEmail?: string | null;
  websiteUrl?: string | null;
  catalogStatus: 'activo' | 'inactivo' | 'pendiente_verificacion';
  adminNotes?: string | null;
  aliases: string[];
  mergedIntoId?: string | null;
  catalogSource?: string | null;
  catalogUpdatedAt?: string | null;
  catalogUpdatedBy?: string | null;
  catalogVerifiedAt?: string | null;
  status?: string;
  updatedAt?: string;
  missing?: { field: string; label: string }[];
}

interface Summary { total: number; activos: number; inactivos: number; pendientes: number; incompletos: number; fusionados: number; lastUpdatedAt: string | null }
interface ChangeRow { id: string; action: string; changes: any; reason?: string | null; actorName?: string | null; createdAt: string; officialName?: string; districtNumber?: number }
interface DupPair { a: MasterClub; b: MasterClub; reason: string; confidence: 'alta' | 'media' | 'baja' }
interface ImportRow { row: number; status: string; data: any; errors?: { field: string; message: string }[]; match?: { id: string; officialName: string; by?: string; score?: number }; changes?: { field: string; to: any }[] }

const ORG_LABELS: Record<string, string> = { rotary: 'Rotary', rotaract: 'Rotaract', interact: 'Interact' };
const ACTION_LABELS: Record<string, string> = {
  create: 'Alta', update: 'Edición', status: 'Cambio de estado', merge: 'Marcado como duplicado', absorb: 'Absorbió un duplicado',
  unmerge: 'Fusión deshecha', not_duplicate: 'No es duplicado', import: 'Importación', seed_reconcile: 'Reconciliación inicial', verify: 'Verificado',
};
const FIELD_LABELS: Record<string, string> = {
  officialName: 'Nombre oficial', shortName: 'Nombre corto', organizationType: 'Organización', clubType: 'Tipo de club', districtNumber: 'Distrito',
  country: 'País', state: 'Departamento', city: 'Ciudad', rotaryInternationalId: 'ID Rotary International', contactEmail: 'Correo institucional',
  websiteUrl: 'Sitio web', catalogStatus: 'Estado', adminNotes: 'Observaciones', aliases: 'Nombres anteriores / alias', mergedIntoId: 'Duplicado de',
  catalogVerifiedAt: 'Verificado', notDuplicateOf: 'No es duplicado de', absorbed: 'Absorbió',
};
const IMPORT_STATUS: Record<string, { label: string; cls: string }> = {
  nuevo: { label: 'Nuevo', cls: 'bg-emerald-50 text-emerald-700' },
  actualiza: { label: 'Completa datos', cls: 'bg-blue-50 text-blue-700' },
  existente: { label: 'Ya existe', cls: 'bg-gray-100 text-gray-600' },
  posible_duplicado: { label: 'Posible duplicado', cls: 'bg-amber-50 text-amber-700' },
  fuera_de_alcance: { label: 'Fuera de tu distrito', cls: 'bg-rose-50 text-rose-700' },
  invalido: { label: 'Inválido', cls: 'bg-rose-50 text-rose-700' },
};

const fecha = (d?: string | null) => d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const valorTexto = (v: any) => v === null || v === undefined || v === '' ? '—' : Array.isArray(v) ? (v.join(', ') || '—') : String(v);

async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(`${API}/club-catalog${path}`, {
      ...opts, signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOf()}`, ...(opts.headers || {}) },
    });
    const { data } = await leerJson<any>(r);
    if (!r.ok) throw Object.assign(new Error(data?.error || `Error ${r.status}`), { data, status: r.status });
    return data as T;
  } finally { clearTimeout(timer); }
}

const StatusBadge: React.FC<{ s: string; merged?: boolean }> = ({ s, merged }) => {
  if (merged) return <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-gray-100 text-gray-500">Duplicado</span>;
  const cls = s === 'activo' ? 'bg-emerald-50 text-emerald-700' : s === 'inactivo' ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-700';
  return <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full whitespace-nowrap ${cls}`}>{CATALOG_STATE_LABELS[s] || s}</span>;
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: string }> = ({ label, value, hint, tone = 'text-rotary-blue' }) => (
  <div className="bg-white p-4 rounded-2xl border border-gray-100">
    <p className={`text-[10px] font-black uppercase tracking-wider ${tone}`}>{label}</p>
    <p className={`text-2xl font-black mt-0.5 ${tone}`}>{value}</p>
    {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
  </div>
);

// ─── Exportación ──────────────────────────────────────────────────────
const EXPORT_COLUMNS: [keyof MasterClub | 'aliasesTxt', string][] = [
  ['id', 'ID interno'], ['rotaryInternationalId', 'ID Rotary International'], ['officialName', 'Nombre oficial'], ['shortName', 'Nombre corto'],
  ['organizationType', 'Organización'], ['clubType', 'Tipo de club'], ['districtNumber', 'Distrito'], ['country', 'País'], ['state', 'Departamento'],
  ['city', 'Ciudad'], ['contactEmail', 'Correo institucional'], ['websiteUrl', 'Sitio web'], ['catalogStatus', 'Estado'], ['aliasesTxt', 'Nombres anteriores'],
  ['catalogUpdatedAt', 'Última actualización'], ['catalogUpdatedBy', 'Actualizado por'],
];
const exportRows = (clubs: MasterClub[]) => clubs.map(c => Object.fromEntries(EXPORT_COLUMNS.map(([k, label]) => [
  label,
  k === 'aliasesTxt' ? (c.aliases || []).join(' | ')
    : k === 'catalogStatus' ? (c.mergedIntoId ? 'Duplicado' : CATALOG_STATE_LABELS[c.catalogStatus])
      : k === 'clubType' ? (CLUB_TYPE_LABELS[c.clubType || ''] || '') : (c[k as keyof MasterClub] ?? ''),
])));

function descargar(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportCsv(clubs: MasterClub[]) {
  const rows = exportRows(clubs);
  const headers = EXPORT_COLUMNS.map(([, l]) => l);
  const esc = (v: any) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc((r as any)[h])).join(','))].join('\n');
  descargar(`catalogo-clubes-${new Date().toISOString().slice(0, 10)}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
}

async function exportXlsx(clubs: MasterClub[]) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(exportRows(clubs));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clubes');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  descargar(`catalogo-clubes-${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

// ─── Formulario de alta / edición ─────────────────────────────────────
const EMPTY_FORM = {
  officialName: '', shortName: '', organizationType: 'rotary', clubType: '', districtNumber: '4281', country: 'Colombia', state: '', city: '',
  rotaryInternationalId: '', contactEmail: '', websiteUrl: '', catalogStatus: 'activo', adminNotes: '', aliasesTxt: '', reason: '',
};
type FormState = typeof EMPTY_FORM;

const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue bg-white';

const ClubFormModal: React.FC<{
  club: MasterClub | null; defaultDistrict: number; onClose: () => void; onSaved: (c: MasterClub) => void;
}> = ({ club, defaultDistrict, onClose, onSaved }) => {
  const [f, setF] = useState<FormState>(() => club ? {
    officialName: club.officialName || '', shortName: club.shortName || '', organizationType: club.organizationType || 'rotary', clubType: club.clubType || '',
    districtNumber: String(club.districtNumber || ''), country: club.country || '', state: club.state || '', city: club.city || '',
    rotaryInternationalId: club.rotaryInternationalId || '', contactEmail: club.contactEmail || '', websiteUrl: club.websiteUrl || '',
    catalogStatus: club.catalogStatus || 'activo', adminNotes: club.adminNotes || '', aliasesTxt: (club.aliases || []).join('\n'), reason: '',
  } : { ...EMPTY_FORM, districtNumber: String(defaultDistrict) });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof FormState, v: string) => setF(p => ({ ...p, [k]: v }));
  const renombra = !!club && (f.officialName.trim() !== club.officialName || (f.shortName.trim() && f.shortName.trim() !== club.shortName));

  const guardar = async () => {
    setGuardando(true); setErrores({});
    const body = {
      ...f,
      districtNumber: Number(f.districtNumber) || null,
      aliases: f.aliasesTxt.split('\n').map(x => x.trim()).filter(Boolean),
    };
    try {
      const out = club
        ? await api<{ club: MasterClub }>(`/admin/clubs/${club.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await api<{ club: MasterClub }>('/admin/clubs', { method: 'POST', body: JSON.stringify(body) });
      toast.success(club ? 'Club actualizado. Los formularios ya lo reflejan.' : 'Club agregado al catálogo. Ya aparece en los formularios conectados.');
      invalidateCatalogCache();
      onSaved(out.club);
    } catch (e: any) {
      const errs: Record<string, string> = {};
      for (const x of e?.data?.errors || []) errs[x.field] = x.message;
      setErrores(errs);
      toast.error(e?.message || 'No se pudo guardar.');
    } finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="ccm-form-title">
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h3 id="ccm-form-title" className="font-black text-gray-900">{club ? 'Editar club' : 'Agregar club al catálogo'}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">Identificación</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2 block text-xs font-bold text-gray-700">Nombre oficial *
                <input className={CAMPO} value={f.officialName} onChange={e => set('officialName', e.target.value)} placeholder="Club Rotario …" />
                {errores.officialName && <span className="text-red-600 text-xs" role="alert">{errores.officialName}</span>}
              </label>
              <label className="block text-xs font-bold text-gray-700">Nombre corto / habitual
                <input className={CAMPO} value={f.shortName} onChange={e => set('shortName', e.target.value)} placeholder="Se deduce del oficial" />
              </label>
              <label className="block text-xs font-bold text-gray-700">ID Rotary International
                <input className={CAMPO} inputMode="numeric" value={f.rotaryInternationalId} onChange={e => set('rotaryInternationalId', e.target.value)} placeholder="Sólo si está verificado" />
                {errores.rotaryInternationalId && <span className="text-red-600 text-xs" role="alert">{errores.rotaryInternationalId}</span>}
              </label>
              <label className="block text-xs font-bold text-gray-700">Organización
                <select className={CAMPO} value={f.organizationType} onChange={e => set('organizationType', e.target.value)}>
                  {Object.entries(ORG_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-gray-700">Tipo de club
                <select className={CAMPO} value={f.clubType} onChange={e => set('clubType', e.target.value)}>
                  <option value="">Sin especificar</option>
                  {Object.entries(CLUB_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            </div>
            {renombra && (
              <p className="text-xs text-blue-800 bg-blue-50 rounded-xl p-3 flex gap-2"><Info className="w-4 h-4 shrink-0" />
                El nombre anterior se conservará como alias: las inscripciones, postulaciones y visitas que lo guardaron siguen vinculadas a este mismo club.</p>
            )}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">Ubicación</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-gray-700">Distrito *
                <input className={CAMPO} inputMode="numeric" maxLength={4} value={f.districtNumber} onChange={e => set('districtNumber', e.target.value.replace(/\D/g, ''))} />
                {errores.districtNumber && <span className="text-red-600 text-xs" role="alert">{errores.districtNumber}</span>}
              </label>
              <label className="block text-xs font-bold text-gray-700">País
                <input className={CAMPO} value={f.country} onChange={e => set('country', e.target.value)} />
              </label>
              <label className="block text-xs font-bold text-gray-700">Departamento o región
                <input className={CAMPO} value={f.state} onChange={e => set('state', e.target.value)} />
              </label>
              <label className="block text-xs font-bold text-gray-700">Ciudad o municipio
                <input className={CAMPO} value={f.city} onChange={e => set('city', e.target.value)} />
              </label>
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">Información institucional</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-gray-700">Correo institucional
                <input className={CAMPO} type="email" value={f.contactEmail} onChange={e => set('contactEmail', e.target.value)} />
                {errores.contactEmail && <span className="text-red-600 text-xs" role="alert">{errores.contactEmail}</span>}
              </label>
              <label className="block text-xs font-bold text-gray-700">Sitio web
                <input className={CAMPO} value={f.websiteUrl} onChange={e => set('websiteUrl', e.target.value)} />
                {errores.websiteUrl && <span className="text-red-600 text-xs" role="alert">{errores.websiteUrl}</span>}
              </label>
              <label className="block text-xs font-bold text-gray-700">Estado
                <select className={CAMPO} value={f.catalogStatus} onChange={e => set('catalogStatus', e.target.value)}>
                  {Object.entries(CATALOG_STATE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="sm:col-span-2 block text-xs font-bold text-gray-700">Otros nombres por los que se conoce (uno por línea)
                <textarea className={CAMPO} rows={2} value={f.aliasesTxt} onChange={e => set('aliasesTxt', e.target.value)} placeholder="Rotary Club …" />
              </label>
              <label className="sm:col-span-2 block text-xs font-bold text-gray-700">Observaciones administrativas (internas)
                <textarea className={CAMPO} rows={2} value={f.adminNotes} onChange={e => set('adminNotes', e.target.value)} />
              </label>
              <label className="sm:col-span-2 block text-xs font-bold text-gray-700">Motivo del cambio (queda en la bitácora)
                <input className={CAMPO} value={f.reason} onChange={e => set('reason', e.target.value)} placeholder="Ej. Confirmado con la secretaría distrital" />
              </label>
            </div>
          </fieldset>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-rotary-blue text-white disabled:opacity-60 flex items-center gap-2">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Historial ────────────────────────────────────────────────────────
const HistoryModal: React.FC<{ clubId: string; onClose: () => void }> = ({ clubId, onClose }) => {
  const [data, setData] = useState<{ club: MasterClub; history: ChangeRow[]; references: Record<string, number> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api(`/admin/clubs/${clubId}`).then(setData).catch(e => setErr(e.message));
  }, [clubId]);
  const refs = data?.references || {};
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="ccm-hist-title">
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h3 id="ccm-hist-title" className="font-black text-gray-900">Historial de cambios</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          {!data && !err && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {data && (
            <>
              <p className="font-bold text-gray-900">{data.club.officialName}</p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">ID interno {data.club.id}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                {[['Visitas del Gobernador', refs.governorVisits], ['Cuentas del portal', refs.clubAccounts], ['Solicitudes del Directorio', refs.directorySubmissions], ['Clubes patrocinados', refs.sponsoredClubs]].map(([l, n]) => (
                  <div key={String(l)} className="rounded-xl bg-gray-50 p-3"><p className="text-lg font-black text-rotary-blue">{n ?? 0}</p><p className="text-[10px] text-gray-500 font-bold">{l}</p></div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Registros vinculados por ID. Cambiar el nombre o el estado del club no los modifica.</p>
              <ol className="mt-5 space-y-3">
                {data.history.length === 0 && <li className="text-sm text-gray-400">Sin cambios registrados todavía.</li>}
                {data.history.map(h => (
                  <li key={h.id} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase text-rotary-blue">{ACTION_LABELS[h.action] || h.action}</span>
                      <span className="text-[11px] text-gray-400">{fecha(h.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">por {h.actorName || 'Sistema'}{h.reason ? ` · «${h.reason}»` : ''}</p>
                    {Array.isArray(h.changes) && h.changes.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {h.changes.map((c: any, i: number) => (
                          <li key={i} className="text-xs text-gray-700 break-words">
                            <span className="font-bold">{FIELD_LABELS[c.field] || c.field}:</span>{' '}
                            {h.action !== 'create' && <><span className="line-through text-gray-400">{valorTexto(c.from)}</span> → </>}
                            <span>{c.field === 'catalogStatus' ? (CATALOG_STATE_LABELS[c.to] || c.to) : valorTexto(c.to)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Importación ──────────────────────────────────────────────────────
const ImportModal: React.FC<{ defaultDistrict: number; onClose: () => void; onDone: () => void }> = ({ defaultDistrict, onClose, onDone }) => {
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [nombre, setNombre] = useState('');
  const [distrito, setDistrito] = useState(String(defaultDistrict));
  const [comparar, setComparar] = useState(false);
  const [preview, setPreview] = useState<{ rows: ImportRow[]; summary: Record<string, number>; missingFromSource: any[] } | null>(null);
  const [aprobadas, setAprobadas] = useState<Set<number>>(new Set());
  const [cargando, setCargando] = useState(false);

  const leerArchivo = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      if (!data.length) { toast.error('El archivo no trae filas.'); return; }
      setRows(data); setNombre(file.name); setPreview(null);
    } catch { toast.error('No se pudo leer el archivo. Usa CSV o Excel (.xlsx).'); }
  };

  const revisar = async () => {
    if (!rows) return;
    setCargando(true);
    try {
      const out = await api('/admin/import/preview', { method: 'POST', body: JSON.stringify({ rows, defaultDistrict: Number(distrito), compare: comparar }) });
      setPreview(out);
      setAprobadas(new Set(out.rows.filter((r: ImportRow) => r.status === 'nuevo' || r.status === 'actualiza').map((r: ImportRow) => r.row)));
    } catch (e: any) { toast.error(e.message); } finally { setCargando(false); }
  };

  const incorporar = async () => {
    if (!rows || !aprobadas.size) return;
    setCargando(true);
    try {
      const out = await api('/admin/import/commit', { method: 'POST', body: JSON.stringify({ rows, approved: [...aprobadas], defaultDistrict: Number(distrito), sourceLabel: nombre }) });
      toast.success(`${out.created.length} clubes incorporados (pendientes de verificación) y ${out.updated.length} completados.`);
      invalidateCatalogCache();
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setCargando(false); }
  };

  const toggle = (n: number) => setAprobadas(prev => { const s = new Set(prev); if (s.has(n)) s.delete(n); else s.add(n); return s; });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="ccm-imp-title">
      <div className="bg-white w-full sm:max-w-4xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <h3 id="ccm-imp-title" className="font-black text-gray-900">Importar o comparar con una fuente oficial</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3">
            Columnas reconocidas: <b>Nombre oficial</b>, Nombre corto, ID Rotary, Distrito, País, Departamento, Ciudad, Tipo, Correo, Sitio web, Estado.
            Nada se incorpora sin tu revisión: los clubes nuevos entran como <b>Pendiente de verificación</b> y las filas que ya existen sólo <b>completan</b> campos vacíos, nunca reemplazan uno lleno.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <label className="block text-xs font-bold text-gray-700 sm:col-span-1">Archivo (CSV o Excel)
              <input type="file" accept=".csv,.xlsx,.xls" className="block w-full text-sm mt-1" onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f); }} />
            </label>
            <label className="block text-xs font-bold text-gray-700">Distrito por defecto
              <input className={CAMPO} inputMode="numeric" maxLength={4} value={distrito} onChange={e => setDistrito(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
              <input type="checkbox" checked={comparar} onChange={e => setComparar(e.target.checked)} />
              Es la fuente oficial: listar los clubes activos que NO vienen en el archivo
            </label>
          </div>
          {rows && <p className="text-xs text-gray-500">{nombre}: {rows.length} filas.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={revisar} disabled={!rows || cargando} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white disabled:opacity-50 flex items-center gap-2">
              {cargando && <Loader2 className="w-4 h-4 animate-spin" />} Revisar antes de incorporar
            </button>
          </div>

          {preview && (
            <>
              <div className="flex flex-wrap gap-2">
                {Object.entries(preview.summary).map(([k, n]) => (
                  <span key={k} className={`text-xs font-bold px-2.5 py-1 rounded-full ${IMPORT_STATUS[k]?.cls || 'bg-gray-100'}`}>{IMPORT_STATUS[k]?.label || k}: {n}</span>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px]"><tr>
                    <th className="p-2 text-left">Incorporar</th><th className="p-2 text-left">Fila</th><th className="p-2 text-left">Club</th>
                    <th className="p-2 text-left">Distrito</th><th className="p-2 text-left">Resultado</th><th className="p-2 text-left">Detalle</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.rows.map(r => {
                      const seleccionable = r.status === 'nuevo' || r.status === 'actualiza';
                      return (
                        <tr key={r.row}>
                          <td className="p-2"><input type="checkbox" disabled={!seleccionable} checked={aprobadas.has(r.row)} onChange={() => toggle(r.row)} aria-label={`Incorporar fila ${r.row}`} /></td>
                          <td className="p-2 text-gray-400">{r.row}</td>
                          <td className="p-2 font-bold text-gray-800">{r.data?.officialName || '—'}<span className="block font-normal text-gray-400">{[r.data?.city, r.data?.state].filter(Boolean).join(', ')}</span></td>
                          <td className="p-2">{r.data?.districtNumber || '—'}</td>
                          <td className="p-2"><span className={`px-2 py-0.5 rounded-full font-bold ${IMPORT_STATUS[r.status]?.cls}`}>{IMPORT_STATUS[r.status]?.label || r.status}</span></td>
                          <td className="p-2 text-gray-600">
                            {r.errors?.map(e => e.message).join(' ')}
                            {r.match && <>Coincide con «{r.match.officialName}»{r.match.score ? ` (${r.match.score} %) — revisar a mano en «Posibles duplicados»` : ''}. </>}
                            {r.changes?.length ? `Completa: ${r.changes.map(c => FIELD_LABELS[c.field] || c.field).join(', ')}.` : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {preview.missingFromSource.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-800">{preview.missingFromSource.length} clubes activos del catálogo NO aparecen en la fuente oficial. Revísalos uno por uno (no se desactiva nada automáticamente):</p>
                  <p className="text-xs text-amber-900 mt-1">{preview.missingFromSource.map((m: any) => m.officialName).join(' · ')}</p>
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" onClick={incorporar} disabled={!aprobadas.size || cargando} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-rotary-blue text-white disabled:opacity-50 flex items-center gap-2">
                  {cargando && <Loader2 className="w-4 h-4 animate-spin" />} Incorporar {aprobadas.size} filas aprobadas
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Duplicados ───────────────────────────────────────────────────────
const DuplicatesPanel: React.FC<{ district: string; canWrite: boolean; clubs: MasterClub[]; onChanged: () => void }> = ({ district, canWrite, clubs, onChanged }) => {
  const [pairs, setPairs] = useState<DupPair[] | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const cargar = useCallback(() => {
    setPairs(null);
    api(`/admin/duplicates${district ? `?district=${district}` : ''}`).then(d => setPairs(d.pairs)).catch(e => { toast.error(e.message); setPairs([]); });
  }, [district]);
  useEffect(() => { cargar(); }, [cargar]);
  const fusionados = clubs.filter(c => c.mergedIntoId);
  const porId = useMemo(() => new Map(clubs.map(c => [c.id, c])), [clubs]);

  const marcar = async (dup: MasterClub, keep: MasterClub) => {
    const reason = window.prompt(`¿Por qué «${dup.officialName}» es el mismo club que «${keep.officialName}»? (queda en la bitácora)`);
    if (!reason?.trim()) return;
    setTrabajando(dup.id);
    try { await api('/admin/merge', { method: 'POST', body: JSON.stringify({ duplicateId: dup.id, keepId: keep.id, reason }) }); toast.success('Marcado como duplicado. Es reversible.'); invalidateCatalogCache(); onChanged(); cargar(); }
    catch (e: any) { toast.error(e.message); } finally { setTrabajando(null); }
  };
  const descartar = async (a: MasterClub, b: MasterClub) => {
    setTrabajando(a.id);
    try { await api('/admin/not-duplicate', { method: 'POST', body: JSON.stringify({ aId: a.id, bId: b.id }) }); toast.success('El par no volverá a señalarse.'); cargar(); }
    catch (e: any) { toast.error(e.message); } finally { setTrabajando(null); }
  };
  const deshacer = async (c: MasterClub) => {
    setTrabajando(c.id);
    try { await api(`/admin/clubs/${c.id}/unmerge`, { method: 'POST', body: JSON.stringify({ reason: 'Fusión deshecha desde el Catálogo Maestro' }) }); toast.success('Fusión deshecha.'); invalidateCatalogCache(); onChanged(); cargar(); }
    catch (e: any) { toast.error(e.message); } finally { setTrabajando(null); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        Estos pares se SEÑALAN por nombre, ID oficial o similitud; nunca se fusionan solos. Marcar un duplicado no reescribe ningún registro: las visitas, cuentas e inscripciones siguen apuntando al ID de siempre y se resuelven al club conservado. Se puede deshacer.</p>
      {!pairs && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Buscando posibles duplicados…</p>}
      {pairs && pairs.length === 0 && <p className="text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> No hay posibles duplicados pendientes de revisión.</p>}
      {pairs?.map(p => (
        <div key={`${p.a.id}-${p.b.id}`} className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${p.confidence === 'alta' ? 'bg-rose-50 text-rose-700' : p.confidence === 'media' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>Confianza {p.confidence}</span>
            <span className="text-xs text-gray-500">{p.reason}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            {[p.a, p.b].map((c, i) => {
              const otro = i === 0 ? p.b : p.a;
              return (
                <div key={c.id} className="rounded-xl bg-gray-50 p-3">
                  <p className="font-bold text-sm text-gray-900">{c.officialName}</p>
                  <p className="text-xs text-gray-500">Distrito {c.districtNumber} · {[c.city, c.state].filter(Boolean).join(', ') || 'sin ubicación'}</p>
                  <p className="text-xs text-gray-400">ID RI: {c.rotaryInternationalId || '—'} · {CATALOG_STATE_LABELS[c.catalogStatus]}{c.catalogSource ? ` · origen: ${c.catalogSource}` : ''}</p>
                  {canWrite && (
                    <button type="button" disabled={!!trabajando} onClick={() => marcar(c, otro)} className="mt-2 text-xs font-bold text-rose-700 underline disabled:opacity-50">
                      Marcar ESTE como duplicado del otro
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {canWrite && (
            <button type="button" disabled={!!trabajando} onClick={() => descartar(p.a, p.b)} className="mt-3 text-xs font-bold text-gray-600 underline disabled:opacity-50">
              No son el mismo club
            </button>
          )}
        </div>
      ))}
      {fusionados.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-black uppercase text-gray-500 mb-2">Marcados como duplicados ({fusionados.length})</p>
          <ul className="divide-y divide-gray-50">
            {fusionados.map(c => (
              <li key={c.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span><b>{c.officialName}</b> → {porId.get(c.mergedIntoId || '')?.officialName || c.mergedIntoId}</span>
                {canWrite && <button type="button" disabled={!!trabajando} onClick={() => deshacer(c)} className="text-xs font-bold text-rotary-blue underline flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Deshacer</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ─── Bitácora general ─────────────────────────────────────────────────
const ChangesPanel: React.FC<{ district: string }> = ({ district }) => {
  const [rows, setRows] = useState<ChangeRow[] | null>(null);
  useEffect(() => {
    api(`/admin/changes?limit=100${district ? `&district=${district}` : ''}`).then(d => setRows(d.changes)).catch(() => setRows([]));
  }, [district]);
  if (!rows) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando la bitácora…</p>;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
      {rows.length === 0 && <p className="p-4 text-sm text-gray-400">Sin cambios registrados.</p>}
      {rows.map(r => (
        <div key={r.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span><span className="text-xs font-black uppercase text-rotary-blue mr-2">{ACTION_LABELS[r.action] || r.action}</span>{r.officialName || r.reason || ''}</span>
          <span className="text-xs text-gray-400">{r.actorName || 'Sistema'} · {fecha(r.createdAt)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── La pantalla ──────────────────────────────────────────────────────
export const ClubCatalogMaster: React.FC<{ defaultDistrict?: number }> = ({ defaultDistrict = 4281 }) => {
  const [data, setData] = useState<{ clubs: MasterClub[]; summary: Summary; districts: number[]; permissions: { canWrite: boolean; scope: any } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<'clubes' | 'duplicados' | 'bitacora'>('clubes');
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState(String(defaultDistrict));
  const [estado, setEstado] = useState('todos');
  const [org, setOrg] = useState('rotary');
  const [soloIncompletos, setSoloIncompletos] = useState(false);
  const [editando, setEditando] = useState<MasterClub | null | 'nuevo'>(null);
  const [historial, setHistorial] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try { setData(await api(`/admin/clubs${district ? `?district=${district}` : ''}`)); }
    catch (e: any) { setError(e.message); }
  }, [district]);
  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const t = normText(q);
    return (data?.clubs || []).filter(c => {
      if (org !== 'todas' && (c.organizationType || 'rotary') !== org) return false;
      if (estado === 'duplicado' ? !c.mergedIntoId : (estado !== 'todos' && (c.mergedIntoId || c.catalogStatus !== estado))) return false;
      if (soloIncompletos && !(c.missing && c.missing.length)) return false;
      if (!t) return true;
      return [c.officialName, c.shortName, c.city, c.state, c.country, c.rotaryInternationalId, ...(c.aliases || [])].some(x => normText(String(x || '')).includes(t));
    });
  }, [data, q, estado, org, soloIncompletos]);

  const cambiarEstado = async (c: MasterClub, nuevo: string) => {
    let reason: string | null = '';
    if (nuevo !== 'activo') {
      reason = window.prompt(`Motivo para dejar «${c.officialName}» como ${CATALOG_STATE_LABELS[nuevo]}. No se borra ninguna inscripción, proyecto, visita ni cuenta.`);
      if (reason === null) return;
    }
    try {
      await api(`/admin/clubs/${c.id}/status`, { method: 'POST', body: JSON.stringify({ catalogStatus: nuevo, reason }) });
      toast.success('Estado actualizado.'); invalidateCatalogCache(); cargar();
    } catch (e: any) { toast.error(e.message); }
  };
  const verificar = async (c: MasterClub) => {
    try { await api(`/admin/clubs/${c.id}/verify`, { method: 'POST', body: JSON.stringify({ reason: 'Validación periódica' }) }); toast.success('Marcado como verificado.'); cargar(); }
    catch (e: any) { toast.error(e.message); }
  };

  const canWrite = !!data?.permissions?.canWrite;
  const s = data?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2"><Building2 className="w-5 h-5 text-rotary-blue" /> Catálogo Maestro de Clubes</h2>
          <p className="text-xs text-gray-500 max-w-2xl">La fuente única de clubes de la plataforma. Lo que se guarda aquí aparece en Visitas del Gobernador, inscripciones a eventos, postulación de proyectos, Rotary en Acción, Plantillas IA, Aniversarios y el portal de clubes, sin cargarlo en cada módulo.</p>
        </div>
        {!canWrite && data && (
          <span className="text-xs font-bold text-gray-600 bg-gray-100 rounded-full px-3 py-1.5 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Sólo consulta</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Clubes" value={s?.total ?? '—'} hint="En el filtro de distrito" />
        <Stat label="Activos" value={s?.activos ?? '—'} tone="text-emerald-600" hint="Se ofrecen en formularios" />
        <Stat label="Inactivos" value={s?.inactivos ?? '—'} tone="text-gray-600" hint="Conservan su historia" />
        <Stat label="Por verificar" value={s?.pendientes ?? '—'} tone="text-amber-600" hint="No se ofrecen aún" />
        <Stat label="Datos incompletos" value={s?.incompletos ?? '—'} tone="text-rose-600" />
        <Stat label="Última actualización" value={<span className="text-sm">{s?.lastUpdatedAt ? fecha(s.lastUpdatedAt) : '—'}</span>} />
      </div>

      <div className="flex border-b border-gray-200 overflow-x-auto" role="tablist">
        {([['clubes', 'Clubes'], ['duplicados', 'Posibles duplicados'], ['bitacora', 'Bitácora']] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
            className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 whitespace-nowrap ${vista === k ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label="Distrito" value={district} onChange={e => setDistrict(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
          <option value="">Todos los distritos</option>
          {[...new Set([defaultDistrict, ...(data?.districts || [])])].map(n => <option key={n} value={n}>Distrito {n}</option>)}
        </select>
        {vista === 'clubes' && (
          <>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="search" aria-label="Buscar club" value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, ciudad, departamento o ID" className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm" />
            </div>
            <select aria-label="Estado" value={estado} onChange={e => setEstado(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
              <option value="todos">Todos los estados</option>
              {Object.entries(CATALOG_STATE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              <option value="duplicado">Marcados como duplicado</option>
            </select>
            <select aria-label="Organización" value={org} onChange={e => setOrg(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
              <option value="todas">Rotary, Rotaract e Interact</option>
              {Object.entries(ORG_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label className="text-xs font-bold text-gray-600 flex items-center gap-1.5"><input type="checkbox" checked={soloIncompletos} onChange={e => setSoloIncompletos(e.target.checked)} /> Sólo incompletos</label>
          </>
        )}
        <div className="flex gap-2 ml-auto">
          {vista === 'clubes' && (
            <>
              <button type="button" onClick={() => exportCsv(filtrados)} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold flex items-center gap-1.5 bg-white"><Download className="w-4 h-4" /> CSV</button>
              <button type="button" onClick={() => exportXlsx(filtrados).catch(() => toast.error('No se pudo generar el Excel.'))} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold flex items-center gap-1.5 bg-white"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
            </>
          )}
          {canWrite && (
            <>
              <button type="button" onClick={() => setImportando(true)} className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold flex items-center gap-1.5 bg-white"><Upload className="w-4 h-4" /> Importar</button>
              <button type="button" onClick={() => setEditando('nuevo')} className="px-4 py-2 rounded-xl bg-rotary-blue text-white text-xs font-bold flex items-center gap-1.5"><Plus className="w-4 h-4" /> Agregar club</button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error} <button type="button" className="underline font-bold" onClick={cargar}>Reintentar</button></p>}
      {!data && !error && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando el catálogo…</p>}

      {data && vista === 'clubes' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="p-3 text-left">Nombre oficial</th><th className="p-3 text-left">Distrito</th><th className="p-3 text-left">Ciudad</th>
                <th className="p-3 text-left">Departamento</th><th className="p-3 text-left">País</th><th className="p-3 text-left">Tipo</th>
                <th className="p-3 text-left">Estado</th><th className="p-3 text-left">Actualizado</th><th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-gray-400">Ningún club coincide con el filtro.</td></tr>}
              {filtrados.map(c => (
                <tr key={c.id} className={c.mergedIntoId ? 'opacity-60' : ''}>
                  <td className="p-3">
                    <p className="font-bold text-gray-900">{c.officialName}</p>
                    <p className="text-[11px] text-gray-400">
                      {ORG_LABELS[c.organizationType] || c.organizationType}{c.rotaryInternationalId ? ` · RI ${c.rotaryInternationalId}` : ''}
                      {c.aliases?.length ? ` · también: ${c.aliases.slice(0, 2).join(', ')}${c.aliases.length > 2 ? '…' : ''}` : ''}
                    </p>
                    {c.missing && c.missing.length > 0 && <p className="text-[10px] text-rose-500 font-bold">Falta: {c.missing.map(m => m.label).join(', ')}</p>}
                  </td>
                  <td className="p-3">{c.districtNumber || '—'}</td>
                  <td className="p-3">{c.city || '—'}</td>
                  <td className="p-3">{c.state || '—'}</td>
                  <td className="p-3">{c.country || '—'}</td>
                  <td className="p-3 text-xs">{CLUB_TYPE_LABELS[c.clubType || ''] || '—'}</td>
                  <td className="p-3">
                    <StatusBadge s={c.catalogStatus} merged={!!c.mergedIntoId} />
                    {c.catalogVerifiedAt && !c.mergedIntoId && <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-0.5"><ShieldCheck className="w-3 h-3" /> {new Date(c.catalogVerifiedAt).toLocaleDateString('es-CO')}</p>}
                  </td>
                  <td className="p-3 text-[11px] text-gray-500">{fecha(c.catalogUpdatedAt || c.updatedAt)}{c.catalogUpdatedBy ? <span className="block text-gray-400">{c.catalogUpdatedBy}</span> : null}</td>
                  <td className="p-3">
                    <div className="flex justify-end items-center gap-1">
                      <button type="button" onClick={() => setHistorial(c.id)} title="Historial de cambios" aria-label={`Historial de ${c.officialName}`} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><History className="w-4 h-4" /></button>
                      {canWrite && !c.mergedIntoId && (
                        <>
                          <button type="button" onClick={() => setEditando(c)} title="Editar club" aria-label={`Editar ${c.officialName}`} className="p-2 rounded-lg hover:bg-gray-100 text-rotary-blue"><Edit2 className="w-4 h-4" /></button>
                          <button type="button" onClick={() => verificar(c)} title="Marcar como verificado contra la fuente oficial" aria-label={`Verificar ${c.officialName}`} className="p-2 rounded-lg hover:bg-gray-100 text-emerald-600"><ShieldCheck className="w-4 h-4" /></button>
                          <select aria-label={`Estado de ${c.officialName}`} value={c.catalogStatus} onChange={e => cambiarEstado(c, e.target.value)} className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white">
                            {Object.entries(CATALOG_STATE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                        </>
                      )}
                      {c.mergedIntoId && <span title="Marcado como duplicado" className="p-2 text-gray-400"><Copy className="w-4 h-4" /></span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-[11px] text-gray-400">{filtrados.length} de {data.clubs.length} registros. Los clubes nunca se eliminan: inactivarlos los quita de los formularios nuevos y conserva sus registros históricos.</p>
        </div>
      )}

      {data && vista === 'duplicados' && <DuplicatesPanel district={district} canWrite={canWrite} clubs={data.clubs} onChanged={cargar} />}
      {data && vista === 'bitacora' && <ChangesPanel district={district} />}

      {editando && (
        <ClubFormModal
          club={editando === 'nuevo' ? null : editando}
          defaultDistrict={Number(district) || defaultDistrict}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); cargar(); }}
        />
      )}
      {historial && <HistoryModal clubId={historial} onClose={() => setHistorial(null)} />}
      {importando && <ImportModal defaultDistrict={Number(district) || defaultDistrict} onClose={() => setImportando(false)} onDone={() => { setImportando(false); cargar(); }} />}
    </div>
  );
};

export default ClubCatalogMaster;
