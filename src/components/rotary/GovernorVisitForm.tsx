// ════════════════════════════════════════════════════════════════════════════
// Visitas del Gobernador — formulario público (v4.1260.0 · tres pasos: v4.1262.0)
//
// Tres pasos (v4.1262: Club y visita · Memoria y galería · Responsable y envío) con la misma arquitectura visual de Rotary en Acción (Navbar,
// cabecera institucional, tarjetas, barra de pasos, navegación Atrás /
// Siguiente) y la misma subida: URL prefirmada → PUT directo a S3 con
// progreso. El club sale del catálogo oficial del Directorio Distrital.
//
// Protección de datos: el texto se guarda solo en este navegador mientras se
// escribe (los archivos no se pueden guardar así y se avisa), y salir de la
// página con cambios sin enviar pide confirmación.
//
// `?corregir=<token>` abre la visita devuelta con «Solicitar correcciones».
// ════════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Building2, CalendarDays, CheckCircle2, FileText,
  Film, Image as ImageIcon, Link2, Loader2, MapPin, RotateCcw, ShieldCheck, Trash2, Upload, UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '../../sections/Navbar';
import Footer from '../../sections/Footer';
import { PublicPageHeader } from '../common/PublicInstitutionalComponents';
import PhoneInputWithCountry from '../common/PhoneInputWithCountry';
import { useSEO } from '../../hooks/useSEO';
import { leerJson } from '../../lib/leerJson';
import ClubSelector from '../clubs/ClubSelector';
import type { CatalogClub } from '../../lib/clubCatalog';
import { ACCEPT_ATTR, checkFileMeta, kindOf, LIMITS_LABEL, DUPLICATE_MESSAGE, duplicateKey, partialFileHash } from '../../lib/contentSubmissionSpec';
import {
  EMPTY_VISIT, VISIT_CAPTION_MAX, VISIT_MAX_LINKS, VISIT_MAX_PHOTOS, VISIT_MAX_VIDEOS, VISIT_STEPS,
  normalizeVisitLink, todayLocal, validateVisitStep, visitDateLabel, type VisitDraft,
} from '../../lib/governorVisitSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const BASE = `${API}/rotary-en-accion/visitas-gobernador`;
const DRAFT_KEY = 'governor-visit-draft';

const CAMPO = 'w-full p-3.5 rounded-xl border-2 border-gray-100 text-base bg-gray-50/60 outline-none focus:border-rotary-blue transition-colors';
const ROTULO = 'block text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2';
const TARJETA = 'bg-white rounded-3xl p-6 sm:p-8 md:p-10 shadow-sm border border-gray-100';

interface Club { id: string; name: string; shortName: string; city: string; state: string; slug: string; siteId: string | null }
interface Config {
  clubs: Club[]; district?: number; governors: string[]; consentText: string;
  limits: { maxPhotos: number; maxVideos: number; maxLinks: number; captionMax: number };
}
type Estado = 'pending' | 'uploading' | 'uploaded' | 'error';
interface Archivo {
  id: string; file?: File; name: string; type: string; size: number; kind: 'image' | 'video';
  estado: Estado; progreso: number; key?: string; preview?: string; error?: string; caption: string; dupKey?: string; hash?: string;
}

const nuevoId = () => Math.random().toString(36).slice(2, 10);

// ── Piezas de presentación (fuera del componente: ver CLAUDE.md) ─────────
const Marco: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-rotary-concrete flex flex-col">
    <Navbar />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
);

const Campo: React.FC<{ label: string; htmlFor?: string; error?: string; hint?: string; children: React.ReactNode }> = ({ label, htmlFor, error, hint, children }) => (
  <div>
    <label className={ROTULO} htmlFor={htmlFor}>{label}</label>
    {children}
    {hint && !error && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    {error && <p className="text-xs text-red-600 font-semibold mt-1" role="alert">{error}</p>}
  </div>
);

const TituloPaso: React.FC<{ icon: React.ReactNode; titulo: string; texto: string }> = ({ icon, titulo, texto }) => (
  <div className="flex items-start gap-3 mb-6">
    <div className="w-11 h-11 rounded-2xl bg-rotary-blue/10 text-rotary-blue flex items-center justify-center shrink-0">{icon}</div>
    <div>
      <h2 className="text-lg sm:text-xl font-black text-gray-900">{titulo}</h2>
      <p className="text-sm text-gray-500 mt-0.5">{texto}</p>
    </div>
  </div>
);

const Resumen: React.FC<{ etiqueta: string; valor?: string | null }> = ({ etiqueta, valor }) => (
  <div className="flex gap-2 text-sm">
    <dt className="text-gray-400 w-36 shrink-0">{etiqueta}</dt>
    <dd className="font-semibold text-gray-800 min-w-0 break-words">{valor || '—'}</dd>
  </div>
);

const MiniaturaArchivo: React.FC<{
  a: Archivo; onCaption: (id: string, v: string) => void; onRemove: (id: string) => void; onRetry: (id: string) => void;
}> = ({ a, onCaption, onRemove, onRetry }) => (
  <div className={`rounded-2xl border-2 p-2.5 flex gap-3 ${a.estado === 'error' ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-white'}`}>
    <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
      {a.preview && a.kind === 'image' ? (
        <img src={a.preview} alt={a.name} className="w-full h-full object-cover" />
      ) : a.preview && a.kind === 'video' ? (
        <video src={a.preview} className="w-full h-full object-cover" muted playsInline preload="metadata" />
      ) : a.kind === 'video' ? <Film className="w-7 h-7 text-gray-400" /> : <ImageIcon className="w-7 h-7 text-gray-400" />}
    </div>
    <div className="flex-1 min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-700 truncate" title={a.name}>{a.name}</p>
        <button type="button" onClick={() => onRemove(a.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Quitar ${a.name}`}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {a.estado === 'uploading' || a.estado === 'pending' ? (
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-label={`Cargando ${a.progreso}%`}>
          <div className="h-full bg-rotary-blue transition-all" style={{ width: `${a.progreso}%` }} />
        </div>
      ) : a.estado === 'error' ? (
        <div className="flex items-center gap-2 text-[11px] text-red-600 font-semibold">
          <span className="flex-1">{a.error}</span>
          {a.file && (
            <button type="button" onClick={() => onRetry(a.id)} className="flex items-center gap-1 text-rotary-blue font-bold shrink-0">
              <RotateCcw className="w-3.5 h-3.5" /> Reintentar
            </button>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Cargado</p>
      )}
      <input
        value={a.caption}
        onChange={(e) => onCaption(a.id, e.target.value.slice(0, VISIT_CAPTION_MAX))}
        placeholder="Descripción (opcional)"
        aria-label={`Descripción de ${a.name}`}
        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-rotary-blue"
      />
    </div>
  </div>
);

export default function GovernorVisitForm() {
  useSEO({ title: 'Visitas del Gobernador · Rotary en Acción', description: 'Reporte oficial de las visitas del Gobernador a los clubes rotarios del Distrito 4281.' });
  const [search] = useSearchParams();
  const correctionToken = search.get('corregir') || '';

  const [cfg, setCfg] = useState<Config | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [motivoCorreccion, setMotivoCorreccion] = useState('');
  const [step, setStep] = useState(1);
  const [v, setV] = useState<VisitDraft>(EMPTY_VISIT);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const archivosRef = useRef<Archivo[]>([]);
  archivosRef.current = archivos;
  const xhrs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const [nuevoEnlace, setNuevoEnlace] = useState('');
  const [errorEnlace, setErrorEnlace] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ publicRef: string; status: string; correccion: boolean } | null>(null);
  const [borradorRestaurado, setBorradorRestaurado] = useState(false);
  const [sucio, setSucio] = useState(false);

  // ── Carga: catálogo + (si aplica) la visita a corregir ──────────────────
  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga('');
    try {
      const r = await fetch(`${BASE}/config`);
      const { data } = await leerJson<Config & { error?: string }>(r);
      if (!r.ok || !data) throw new Error(data?.error || `No se pudo cargar el formulario (${r.status}).`);
      setCfg(data);
      if (correctionToken) {
        const rc = await fetch(`${BASE}/correccion/${encodeURIComponent(correctionToken)}`);
        const { data: dc } = await leerJson<any>(rc);
        if (!rc.ok || !dc?.visit) throw new Error(dc?.error || 'El enlace de corrección no es válido o ya venció.');
        const x = dc.visit;
        setMotivoCorreccion(x.statusReason || '');
        setV({
          ...EMPTY_VISIT,
          clubProfileId: x.clubProfileId || '', visitDate: x.visitDate || '', governorName: x.governorName || '',
          venue: x.venue || '', title: x.title || '', reason: x.reason || '', description: x.description || '',
          activities: x.activities || '', topics: x.topics || '', recognitions: x.recognitions || '',
          agreements: x.agreements || '', commitments: x.commitments || '', highlights: x.highlights || '',
          links: (x.links || []).map((l: any) => ({ url: l.url, caption: l.caption || '' })),
          responsibleName: x.responsibleName || '', responsibleRole: x.responsibleRole || '',
          responsibleEmail: x.responsibleEmail || '', responsiblePhone: x.responsiblePhone || '',
        });
        setArchivos((x.media || []).map((m: any) => ({
          id: nuevoId(), name: m.filename || 'archivo', type: m.contentType || '', size: Number(m.bytes) || 0,
          kind: m.kind === 'video' ? 'video' : 'image', estado: 'uploaded' as Estado, progreso: 100,
          key: m.key, preview: m.url || undefined, caption: m.caption || '',
        })));
      } else {
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) {
            const d = JSON.parse(raw);
            if (d && typeof d === 'object') {
              setV({ ...EMPTY_VISIT, ...d, truthConfirmed: false, publicationConsent: false });
              setBorradorRestaurado(true);
            }
          }
        } catch { /* sin borrador */ }
      }
    } catch (e: any) {
      setErrorCarga(e?.message || 'No se pudo cargar el formulario.');
    } finally {
      setCargando(false);
    }
  }, [correctionToken]);

  useEffect(() => { cargar(); }, [cargar]);

  // Guardado local del texto (no de los archivos). Nunca en una corrección:
  // esa visita ya existe en el servidor.
  useEffect(() => {
    if (cargando || enviado || correctionToken) return;
    const t = setTimeout(() => {
      try {
        const { truthConfirmed, publicationConsent, ...resto } = v;
        void truthConfirmed; void publicationConsent;
        localStorage.setItem(DRAFT_KEY, JSON.stringify(resto));
      } catch { /* sin almacenamiento */ }
    }, 800);
    return () => clearTimeout(t);
  }, [v, cargando, enviado, correctionToken]);

  // Salir con cambios sin enviar pide confirmación.
  useEffect(() => {
    if (!sucio || enviado) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sucio, enviado]);

  // Al desmontar: cortar cargas en vuelo y liberar previsualizaciones.
  useEffect(() => () => {
    xhrs.current.forEach((x) => { try { x.abort(); } catch { /* noop */ } });
    archivosRef.current.forEach((a) => { if (a.file && a.preview) { try { URL.revokeObjectURL(a.preview); } catch { /* noop */ } } });
  }, []);

  const clubSel = useMemo(() => cfg?.clubs.find((c) => c.id === v.clubProfileId) || null, [cfg, v.clubProfileId]);
  // Los clubes de la configuración de la visita, en la forma del Catálogo Maestro.
  const catalogoClubes = useMemo<CatalogClub[]>(() => (cfg?.clubs || []).map((c) => ({
    id: c.id, name: c.name, shortName: c.shortName, city: c.city, state: c.state,
    country: 'Colombia', districtNumber: cfg?.district || 4281, organizationType: 'rotary', clubType: '',
  })), [cfg]);
  const conteo = useMemo(() => ({
    photos: archivos.filter((a) => a.kind === 'image' && a.estado === 'uploaded').length,
    videos: archivos.filter((a) => a.kind === 'video' && a.estado === 'uploaded').length,
    pending: archivos.filter((a) => a.estado === 'pending' || a.estado === 'uploading').length,
    failed: archivos.filter((a) => a.estado === 'error').length,
  }), [archivos]);

  const set = useCallback(<K extends keyof VisitDraft>(k: K, val: VisitDraft[K]) => {
    setV((prev) => ({ ...prev, [k]: val }));
    setSucio(true);
    setErrores((prev) => { if (!prev[k as string]) return prev; const n = { ...prev }; delete n[k as string]; return n; });
  }, []);

  const parchar = useCallback((id: string, patch: Partial<Archivo>) => {
    archivosRef.current = archivosRef.current.map((a) => (a.id === id ? { ...a, ...patch } : a));
    setArchivos((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  // ── Subida: prefirmar → PUT directo a S3 ────────────────────────────────
  const subir = useCallback(async (a: Archivo) => {
    if (!a.file) return;
    parchar(a.id, { estado: 'uploading', progreso: 0, error: undefined });
    let pre: any = null;
    try {
      const r = await fetch(`${BASE}/presign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: a.type, filename: a.name, size: a.size }),
      });
      pre = (await leerJson<any>(r)).data;
      if (!r.ok || !pre?.uploadUrl) { parchar(a.id, { estado: 'error', error: pre?.error || `No se autorizó la carga (${r.status}).` }); return; }
    } catch {
      parchar(a.id, { estado: 'error', error: 'Sin conexión con el servidor. Reintenta.' });
      return;
    }
    const xhr = new XMLHttpRequest();
    xhrs.current.set(a.id, xhr);
    xhr.timeout = Math.max(120000, Math.ceil(a.size / (128 * 1024)) * 1000);
    xhr.open('PUT', pre.uploadUrl);
    xhr.setRequestHeader('Content-Type', pre.contentType || a.type || 'application/octet-stream');
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) parchar(a.id, { progreso: Math.min(99, Math.round((ev.loaded / ev.total) * 100)) }); };
    xhr.onload = () => {
      xhrs.current.delete(a.id);
      if (xhr.status >= 200 && xhr.status < 300) parchar(a.id, { estado: 'uploaded', progreso: 100, key: pre.key });
      else parchar(a.id, { estado: 'error', error: `La transferencia falló (${xhr.status}). Reintenta.` });
    };
    xhr.onerror = () => { xhrs.current.delete(a.id); parchar(a.id, { estado: 'error', error: 'Se cortó la conexión. Reintenta.' }); };
    xhr.ontimeout = () => { xhrs.current.delete(a.id); parchar(a.id, { estado: 'error', error: 'La carga tardó demasiado. Reintenta.' }); };
    xhr.send(a.file);
  }, [parchar]);

  // Dos capas contra el duplicado, como en Rotary en Acción: la identidad
  // del archivo (nombre, tamaño, tipo, fecha) y la huella de sus primeros
  // 256 KB, que reconoce el mismo contenido aunque cambie el nombre o la fecha.
  const agregarArchivos = useCallback(async (lista: FileList | null) => {
    if (!lista?.length) return;
    const entrantes = Array.from(lista);
    const huellas = await Promise.all(entrantes.map((f) => partialFileHash(f).catch(() => '')));
    const actuales = archivosRef.current;
    let fotos = actuales.filter((a) => a.kind === 'image').length;
    let videos = actuales.filter((a) => a.kind === 'video').length;
    const vistos = new Set(actuales.flatMap((a) => [a.dupKey, a.hash]).filter(Boolean));
    const nuevos: Archivo[] = [];
    entrantes.forEach((file, i) => {
      const juicio = checkFileMeta({ contentType: file.type, filename: file.name, size: file.size });
      const kind = kindOf(file.type, file.name);
      if (!juicio.ok || !kind) { toast.error(juicio.errores?.[0] || `${file.name}: formato no admitido.`); return; }
      const dk = duplicateKey(file);
      const hash = huellas[i];
      if (vistos.has(dk) || (hash && vistos.has(hash))) { toast.error(`${file.name}: ${DUPLICATE_MESSAGE}`); return; }
      if (kind === 'image' && fotos >= VISIT_MAX_PHOTOS) { toast.error(`Máximo ${VISIT_MAX_PHOTOS} fotografías por visita.`); return; }
      if (kind === 'video' && videos >= VISIT_MAX_VIDEOS) { toast.error(`Máximo ${VISIT_MAX_VIDEOS} videos por visita.`); return; }
      if (kind === 'image') fotos++; else videos++;
      vistos.add(dk);
      if (hash) vistos.add(hash);
      const heic = /hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
      nuevos.push({
        id: nuevoId(), file, name: file.name, type: file.type || '', size: file.size, kind,
        estado: 'pending', progreso: 0, caption: '', dupKey: dk, hash: hash || undefined,
        preview: heic ? undefined : URL.createObjectURL(file),
      });
    });
    if (!nuevos.length) return;
    archivosRef.current = [...archivosRef.current, ...nuevos];
    setArchivos((prev) => [...prev, ...nuevos]);
    setSucio(true);
    setErrores((prev) => { const n = { ...prev }; delete n.media; return n; });
    nuevos.forEach((a) => { subir(a); });
  }, [subir]);

  const quitarArchivo = useCallback((id: string) => {
    const a = archivosRef.current.find((x) => x.id === id);
    const xhr = xhrs.current.get(id);
    if (xhr) { try { xhr.abort(); } catch { /* noop */ } xhrs.current.delete(id); }
    if (a?.file && a.preview) { try { URL.revokeObjectURL(a.preview); } catch { /* noop */ } }
    archivosRef.current = archivosRef.current.filter((x) => x.id !== id);
    setArchivos((prev) => prev.filter((x) => x.id !== id));
  }, []);
  const reintentar = useCallback((id: string) => {
    const a = archivosRef.current.find((x) => x.id === id);
    if (a) subir(a);
  }, [subir]);
  const ponerCaption = useCallback((id: string, val: string) => parchar(id, { caption: val }), [parchar]);

  const agregarEnlace = () => {
    const url = normalizeVisitLink(nuevoEnlace);
    if (!url) { setErrorEnlace('Escribe un enlace válido (https://…).'); return; }
    if (v.links.length >= VISIT_MAX_LINKS) { setErrorEnlace(`Máximo ${VISIT_MAX_LINKS} enlaces.`); return; }
    if (v.links.some((l) => l.url === url)) { setErrorEnlace('Ese enlace ya está en la lista.'); return; }
    set('links', [...v.links, { url, caption: '' }]);
    setNuevoEnlace('');
    setErrorEnlace('');
  };

  // ── Navegación ──────────────────────────────────────────────────────────
  const validar = (paso: number) => {
    const e = validateVisitStep(paso, v, conteo);
    setErrores(e);
    return Object.keys(e).length === 0;
  };
  // Cada paso tiene dos bloques: ante un error se lleva la vista al PRIMER
  // aviso, que puede estar en el segundo bloque, no al inicio de la página.
  const alPrimerError = () => setTimeout(() => {
    const el = document.querySelector('[data-gv-step] [role="alert"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 60);
  const irA = (paso: number) => {
    if (paso > step) {
      for (let p = step; p < paso; p++) { if (!validar(p)) { setStep(p); alPrimerError(); return; } }
    } else setErrores({});
    setStep(paso);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const enviar = async () => {
    for (let p = 1; p <= VISIT_STEPS.length; p++) {
      if (!validar(p)) { setStep(p); alPrimerError(); toast.error('Revisa los campos marcados.'); return; }
    }
    setEnviando(true);
    try {
      const body = {
        ...v,
        media: archivos.filter((a) => a.estado === 'uploaded' && a.key).map((a) => ({ key: a.key, filename: a.name, contentType: a.type, caption: a.caption })),
      };
      const url = correctionToken ? `${BASE}/correccion/${encodeURIComponent(correctionToken)}` : `${BASE}/submit`;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const { data } = await leerJson<any>(r);
      if (!r.ok || !data?.ok) {
        const lista: { step: number; field: string; message: string }[] = data?.errors || [];
        if (lista.length) {
          setStep(lista[0].step);
          setErrores(Object.fromEntries(lista.filter((x) => x.step === lista[0].step).map((x) => [x.field, x.message])));
          alPrimerError();
        }
        toast.error(data?.error || `No se pudo enviar (${r.status}).`);
        return;
      }
      setEnviado({ publicRef: data.publicRef, status: data.visit?.statusLabel || 'Recibida', correccion: !!correctionToken });
      setSucio(false);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast.error('Sin conexión con el servidor. Tus datos siguen aquí: intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const descartarBorrador = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    setV(EMPTY_VISIT);
    setBorradorRestaurado(false);
  };

  if (cargando) return <Marco><div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div></Marco>;
  if (errorCarga || !cfg) return (
    <Marco>
      <div className="flex items-center justify-center px-4 py-20">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-sm border border-gray-100">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-bold text-gray-800 mt-4">No se pudo abrir el formulario</h1>
          <p className="text-sm text-gray-500 mt-2">{errorCarga}</p>
          <button onClick={cargar} className="mt-5 px-5 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold">Reintentar</button>
        </div>
      </div>
    </Marco>
  );

  const pct = enviado ? 100 : Math.round(((step - 1) / VISIT_STEPS.length) * 100);

  return (
    <Marco>
      <PublicPageHeader
        title="Visitas del Gobernador"
        subtitle="Documenta la visita oficial del Gobernador a tu club: fecha, memoria institucional, resultados y evidencias. Rotary en Acción · Distrito 4281."
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-12 pb-20 space-y-4">
        {!enviado && (
          <nav aria-label="Progreso" className="bg-white rounded-2xl border border-gray-100 px-4 sm:px-6 py-3.5 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              {VISIT_STEPS.map((label, i) => {
                const n = i + 1;
                return (
                  <button
                    key={label} type="button" onClick={() => irA(n)} disabled={n > step} title={label}
                    aria-current={n === step ? 'step' : undefined}
                    className={`flex items-center gap-2 text-xs font-bold whitespace-nowrap px-3 py-1.5 rounded-full transition-all ${
                      n === step ? 'bg-rotary-blue text-white shadow-sm' : n < step ? 'text-rotary-blue hover:bg-blue-50' : 'text-gray-400 disabled:opacity-60 cursor-default'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${n === step ? 'bg-white/25 text-white' : n < step ? 'bg-rotary-blue text-white' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-rotary-blue transition-all duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
            </div>
            <p className="sm:hidden text-[11px] font-bold text-gray-400">Paso {step} de {VISIT_STEPS.length}: {VISIT_STEPS[step - 1]}</p>
          </nav>
        )}

        {!enviado && correctionToken && motivoCorreccion && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-sm text-orange-800" role="status">
            <p className="font-black">El equipo distrital pidió correcciones</p>
            <p className="mt-1 whitespace-pre-line">{motivoCorreccion}</p>
          </div>
        )}
        {!enviado && borradorRestaurado && (
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-sm text-sky-800 flex flex-wrap items-center gap-3 justify-between">
            <span>Recuperamos el texto que habías escrito en este dispositivo. Los archivos hay que adjuntarlos de nuevo.</span>
            <button type="button" onClick={descartarBorrador} className="text-xs font-bold underline">Empezar de cero</button>
          </div>
        )}

        {/* PASO 1 — Club y visita */}
        {step === 1 && !enviado && (
          <div className={TARJETA} data-gv-step="1">
            <TituloPaso icon={<Building2 className="w-5 h-5" />} titulo="Identificación del club" texto="Selecciona el club visitado del catálogo oficial del Directorio Distrital." />
            {/* v4.1269 — El selector único del Catálogo Maestro: guarda el ID del club. */}
            <ClubSelector
              label=""
              value={v.clubProfileId}
              onChange={(c) => set('clubProfileId', c?.id || '')}
              options={catalogoClubes}
              error={errores.clubProfileId}
            />
            {clubSel && (
              <dl className="mt-5 rounded-2xl bg-gray-50 border border-gray-100 p-4 grid sm:grid-cols-2 gap-x-4 gap-y-2">
                <Resumen etiqueta="Club" valor={clubSel.name} />
                <Resumen etiqueta="Ciudad" valor={clubSel.city} />
                <Resumen etiqueta="Departamento" valor={clubSel.state || 'No registrado en el Directorio'} />
                <Resumen etiqueta="ID Directorio" valor={clubSel.id.slice(0, 8).toUpperCase()} />
              </dl>
            )}
            <div className="mt-8 pt-8 border-t border-gray-100">
            <TituloPaso icon={<CalendarDays className="w-5 h-5" />} titulo="Información de la visita" texto="Los datos de la visita oficial tal como ocurrió." />
            <div className="grid sm:grid-cols-2 gap-5">
              <Campo label="Fecha real de la visita" htmlFor="gv-fecha" error={errores.visitDate}>
                <input id="gv-fecha" type="date" max={todayLocal()} value={v.visitDate} onChange={(e) => set('visitDate', e.target.value)} className={CAMPO} />
              </Campo>
              <Campo label="Gobernador visitante" htmlFor="gv-gob" error={errores.governorName}>
                <input id="gv-gob" list="gv-gobernadores" value={v.governorName} onChange={(e) => set('governorName', e.target.value)} className={CAMPO} placeholder="Nombre completo" autoComplete="off" />
                <datalist id="gv-gobernadores">{cfg.governors.map((g) => <option key={g} value={g} />)}</datalist>
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Lugar" htmlFor="gv-lugar" error={errores.venue}>
                  <input id="gv-lugar" value={v.venue} onChange={(e) => set('venue', e.target.value)} className={CAMPO} placeholder="Sede, dirección o espacio del encuentro" />
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <Campo label="Título" htmlFor="gv-titulo" error={errores.title}>
                  <input id="gv-titulo" value={v.title} maxLength={160} onChange={(e) => set('title', e.target.value)} className={CAMPO} placeholder="Ej. Visita oficial del Gobernador al Club Rotario …" />
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <Campo label="Motivo del encuentro" htmlFor="gv-motivo" error={errores.reason}>
                  <textarea id="gv-motivo" rows={3} maxLength={1500} value={v.reason} onChange={(e) => set('reason', e.target.value)} className={CAMPO} placeholder="Visita oficial del período, seguimiento de proyectos, entrega de reconocimientos…" />
                </Campo>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* PASO 2 — Memoria y galería */}
        {step === 2 && !enviado && (
          <div className={TARJETA} data-gv-step="2">
            <TituloPaso icon={<FileText className="w-5 h-5" />} titulo="Memoria institucional" texto="Lo que quedó de la visita. Solo la descripción es obligatoria; completa lo que aplique." />
            <div className="space-y-5">
              <Campo label="Descripción de la visita" htmlFor="gv-desc" error={errores.description} hint={`${v.description.trim().length} caracteres · mínimo 80`}>
                <textarea id="gv-desc" rows={6} maxLength={6000} value={v.description} onChange={(e) => set('description', e.target.value)} className={CAMPO} placeholder="Cómo se desarrolló la visita, quiénes participaron y qué se vivió." />
              </Campo>
              <div className="grid sm:grid-cols-2 gap-5">
                {([
                  ['activities', 'Actividades desarrolladas', 'Reunión con la junta, visita a proyectos…'],
                  ['topics', 'Temas abordados', 'Membresía, Fundación Rotaria, imagen pública…'],
                  ['recognitions', 'Reconocimientos', 'Distinciones entregadas o recibidas'],
                  ['agreements', 'Acuerdos', 'Lo que se acordó en la visita'],
                  ['commitments', 'Compromisos', 'Compromisos del club y del distrito'],
                  ['highlights', 'Resultados destacados', 'Logros, cifras o hitos de la visita'],
                ] as const).map(([k, label, ph]) => (
                  <Campo key={k} label={label} htmlFor={`gv-${k}`}>
                    <textarea id={`gv-${k}`} rows={3} maxLength={3000} value={v[k]} onChange={(e) => set(k, e.target.value)} className={CAMPO} placeholder={ph} />
                  </Campo>
                ))}
              </div>
            </div>
            <div className="mt-8 pt-8 border-t border-gray-100">
            <TituloPaso icon={<ImageIcon className="w-5 h-5" />} titulo="Galería multimedia" texto={`Hasta ${VISIT_MAX_PHOTOS} fotografías y ${VISIT_MAX_VIDEOS} videos (${LIMITS_LABEL}), y hasta ${VISIT_MAX_LINKS} enlaces audiovisuales.`} />
            <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ''; }} />
            <button
              type="button" onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); agregarArchivos(e.dataTransfer.files); }}
              className="w-full border-2 border-dashed border-gray-200 hover:border-rotary-blue rounded-2xl p-8 text-center transition-colors bg-gray-50/50"
            >
              <Upload className="w-8 h-8 text-rotary-blue mx-auto" />
              <p className="font-bold text-gray-700 mt-2">Agregar fotografías o videos</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP, HEIC · MP4, MOV, WEBM</p>
            </button>
            <p className="text-xs text-gray-500 mt-3 font-semibold">
              {conteo.photos}/{VISIT_MAX_PHOTOS} fotografías · {conteo.videos}/{VISIT_MAX_VIDEOS} videos · {v.links.length}/{VISIT_MAX_LINKS} enlaces
              {conteo.pending > 0 && <span className="text-rotary-blue"> · cargando {conteo.pending}…</span>}
            </p>
            {archivos.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                {archivos.map((a) => <MiniaturaArchivo key={a.id} a={a} onCaption={ponerCaption} onRemove={quitarArchivo} onRetry={reintentar} />)}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-gray-100">
              <label className={ROTULO} htmlFor="gv-enlace">Enlaces audiovisuales (YouTube, Facebook, Drive…)</label>
              <div className="flex gap-2">
                <input
                  id="gv-enlace" value={nuevoEnlace} onChange={(e) => { setNuevoEnlace(e.target.value); setErrorEnlace(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarEnlace(); } }}
                  className={CAMPO} placeholder="https://…"
                />
                <button type="button" onClick={agregarEnlace} className="px-4 rounded-xl bg-rotary-blue text-white text-sm font-bold shrink-0 flex items-center gap-1.5">
                  <Link2 className="w-4 h-4" /> Agregar
                </button>
              </div>
              {errorEnlace && <p className="text-xs text-red-600 font-semibold mt-1">{errorEnlace}</p>}
              {v.links.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {v.links.map((l, i) => (
                    <li key={l.url} className="rounded-xl border border-gray-100 p-2.5 flex flex-col sm:flex-row gap-2 sm:items-center">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-rotary-blue truncate sm:w-1/2">{l.url}</a>
                      <input
                        value={l.caption} maxLength={VISIT_CAPTION_MAX} placeholder="Descripción (opcional)"
                        onChange={(e) => set('links', v.links.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-rotary-blue"
                      />
                      <button type="button" onClick={() => set('links', v.links.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-600 self-end sm:self-auto" aria-label="Quitar enlace">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {errores.media && <p className="text-sm text-red-600 font-semibold mt-4" role="alert">{errores.media}</p>}
            </div>
          </div>
        )}

        {/* PASO 3 — Responsable y envío */}
        {step === 3 && !enviado && (
          <div className={TARJETA} data-gv-step="3">
            <TituloPaso icon={<UserCheck className="w-5 h-5" />} titulo="Responsable y envío" texto="Quién reporta la visita. Tus datos de contacto no se publican." />
            <div className="grid sm:grid-cols-2 gap-5">
              <Campo label="Nombre completo" htmlFor="gv-nombre" error={errores.responsibleName}>
                <input id="gv-nombre" value={v.responsibleName} onChange={(e) => set('responsibleName', e.target.value)} className={CAMPO} autoComplete="name" />
              </Campo>
              <Campo label="Cargo" htmlFor="gv-cargo" error={errores.responsibleRole}>
                <input id="gv-cargo" value={v.responsibleRole} onChange={(e) => set('responsibleRole', e.target.value)} className={CAMPO} placeholder="Secretario/a del club" />
              </Campo>
              <Campo label="Correo electrónico" htmlFor="gv-correo" error={errores.responsibleEmail}>
                <input id="gv-correo" type="email" value={v.responsibleEmail} onChange={(e) => set('responsibleEmail', e.target.value)} className={CAMPO} autoComplete="email" />
              </Campo>
              <Campo label="WhatsApp" error={errores.responsiblePhone}>
                <PhoneInputWithCountry value={v.responsiblePhone} onChange={(phone) => set('responsiblePhone', phone)} />
              </Campo>
            </div>

            <div className="mt-6 rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-400 mb-3">Resumen</p>
              <dl className="space-y-1.5">
                <Resumen etiqueta="Club" valor={clubSel?.name} />
                <Resumen etiqueta="Fecha" valor={visitDateLabel(v.visitDate)} />
                <Resumen etiqueta="Gobernador" valor={v.governorName} />
                <Resumen etiqueta="Título" valor={v.title} />
                <Resumen etiqueta="Material" valor={`${conteo.photos} foto(s) · ${conteo.videos} video(s) · ${v.links.length} enlace(s)`} />
              </dl>
            </div>

            <div className="mt-5 space-y-3">
              <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={v.truthConfirmed} onChange={(e) => set('truthConfirmed', e.target.checked)} className="mt-1 w-4 h-4 accent-rotary-blue" />
                <span>Confirmo que la información reportada es veraz y corresponde a la visita realizada.</span>
              </label>
              {errores.truthConfirmed && <p className="text-xs text-red-600 font-semibold" role="alert">{errores.truthConfirmed}</p>}
              <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={v.publicationConsent} onChange={(e) => set('publicationConsent', e.target.checked)} className="mt-1 w-4 h-4 accent-rotary-blue" />
                <span className="text-xs leading-relaxed text-gray-600">{cfg.consentText}</span>
              </label>
              {errores.publicationConsent && <p className="text-xs text-red-600 font-semibold" role="alert">{errores.publicationConsent}</p>}
              <p className="text-[11px] text-gray-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Nada se publica sin la aprobación del equipo distrital.</p>
            </div>
          </div>
        )}

        {/* Confirmación */}
        {enviado && (
          <div className={TARJETA + ' text-center'}>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-black text-gray-800 mt-3">{enviado.correccion ? 'Recibimos tus correcciones' : 'Recibimos el reporte de la visita'}</h2>
            <p className="text-sm text-gray-500 mt-2">Guarda este identificador para cualquier consulta:</p>
            <p className="text-2xl font-black font-mono text-rotary-blue mt-2 tracking-wider">{enviado.publicRef}</p>
            <dl className="text-sm mt-5 space-y-1.5 text-left max-w-sm mx-auto">
              <Resumen etiqueta="Club" valor={clubSel?.name} />
              <Resumen etiqueta="Fecha de la visita" valor={visitDateLabel(v.visitDate)} />
              <Resumen etiqueta="Estado" valor={enviado.status} />
            </dl>
            <p className="text-xs text-gray-500 mt-5">Qué sigue: el equipo distrital revisa el reporte. Si falta algo te escribirá con un enlace para corregirlo; una vez aprobado, podrá publicarse en Rotary en Acción.</p>
          </div>
        )}

        {/* Navegación */}
        {!enviado && (
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => irA(Math.max(1, step - 1))} disabled={step === 1} className="flex items-center gap-1.5 px-4 py-3 rounded-xl border text-sm font-bold text-gray-500 disabled:opacity-40 min-h-[52px] bg-white hover:bg-gray-50">
              <ArrowLeft className="w-4 h-4" /> Anterior
            </button>
            {step < VISIT_STEPS.length ? (
              <button onClick={() => irA(step + 1)} className="flex items-center gap-1.5 px-6 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold min-h-[52px] hover:bg-blue-900 transition-colors">
                Siguiente <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={enviar} disabled={enviando || conteo.pending > 0} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold min-h-[52px] disabled:opacity-60 transition-colors">
                {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                {correctionToken ? 'Enviar correcciones' : 'Enviar reporte'}
              </button>
            )}
          </div>
        )}
        <p className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3" /> Rotary en Acción · Visitas del Gobernador · Distrito 4281
        </p>
      </div>
    </Marco>
  );
}
