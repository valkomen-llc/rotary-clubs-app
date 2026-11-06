// ════════════════════════════════════════════════════════════════════════════
// Formulario institucional de programas — v4.1286.0 (DIEZ pasos: v4.1287.0)
//
// v4.1287 — Diez pasos fijos (`form.steps`, del servidor): 1 programa y
// responsable · 2 identidad · 3 imagen y aliados · 4 equipo y canales ·
// 5 atención y directorio · 6 participación y documentación · 7 multimedia y
// recursos · 8 historias y testimonios · 9 impacto y actualidad · 10 resumen.
// Cada paso agrupa SECCIONES (la unidad de guardado y revisión, con sus
// claves de siempre) y cada sección se organiza en bloques desplegables.
//
// `dominio.org/formulario-programas` (`?programa=<slug>` lo preselecciona;
// `?continuar=<secreto>` reabre un borrador). Un SOLO formulario para todos
// los programas que respalda el distrito (Clínicas Ponseti, Fundación Pequeño
// Corazón y los que se registren): las secciones, etiquetas, ayudas y
// obligatorios llegan del servidor, adaptados a cada programa.
//
// Misma línea visual que Visitas del Gobernador y Rotary en Acción: usa sus
// piezas reales (`InstitutionalFormKit`). Se guarda en el servidor mientras se
// escribe; se puede salir y volver con el enlace (o pedirlo por correo).
// Nada de lo que se envía se publica: entra como propuesta para revisión.
// ════════════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BarChart3, BookOpen, CheckCircle2, ClipboardList, Compass, Copy, Feather, FileText, HeartHandshake,
  Image as ImageIcon, Library, Loader2, Mail, MapPin, Palette, Phone, Quote, Save, ShieldCheck, UserCheck, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { PublicPageHeader } from '../../common/PublicInstitutionalComponents';
import { useSEO } from '../../../hooks/useSEO';
import { useAuth } from '../../../hooks/useAuth';
import {
  BTN_ANTERIOR, BTN_ENVIAR, BTN_SIGUIENTE, CAMPO, CONTENEDOR, Marco, PasosNumerados, Resumen, ROTULO, TARJETA, TituloPaso,
} from '../../common/InstitutionalFormKit';
import { AvisoPrivacidad, BloqueDesplegable, CamposDeSeccion, type FieldCtx } from './IntakeFields';
import {
  forgetDraft, intakeApi, IntakeError, isEmptyValue, localDrafts, rememberDraft, rememberStep, uploadIntakeFile,
  type ApiErr, type FormPayload, type IntakeFile, type IntakeView, type LocalDraft, type ProgramLite, type SectionDef, type StepDef, type UploadState,
} from '../../../lib/programIntakeClient';

/** Los diez pasos antes de elegir un programa (después manda `form.steps`, del servidor). */
const PASOS_BASE: StepDef[] = [
  ['programa', 'Programa', 'Programa y datos del responsable'], ['identidad', 'Identidad', 'Identidad e historia del programa'],
  ['imagen', 'Imagen', 'Imagen institucional, aliados y patrocinadores'], ['equipo', 'Equipo', 'Equipo, contacto y canales oficiales'],
  ['atencion', 'Atención', 'Atención, cobertura y directorio'], ['participacion', 'Participación', 'Participación, donaciones y documentación'],
  ['multimedia', 'Multimedia', 'Banco multimedia y recursos'], ['historias', 'Historias', 'Historias de vida y testimonios'],
  ['impacto', 'Impacto', 'Impacto y actualidad'], ['resumen', 'Resumen', 'Resumen y envío'],
].map(([k, short, title], i) => ({ k, n: i + 1, short, title, desc: '', sections: [] }));
const RESUMEN = 10;
const idsDeArchivos = (v: any): string[] => {
  const out: string[] = [];
  const walk = (x: any) => {
    if (Array.isArray(x)) { if (x.length && x.every(y => y && typeof y === 'object' && typeof y.id === 'string' && Object.keys(y).every(k => ['id', 'description', 'usage', 'alt', 'caption'].includes(k)))) x.forEach(y => out.push(y.id)); else x.forEach(walk); }
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(v);
  return Array.from(new Set(out));
};

const ICONOS: Record<string, React.ComponentType<{ className?: string }>> = {
  user: UserCheck, book: BookOpen, palette: Palette, users: Users, compass: Compass, map: MapPin, heart: HeartHandshake, file: FileText,
  image: ImageIcon, story: Feather, quote: Quote, chart: BarChart3, library: Library, phone: Phone,
};
const Icono: React.FC<{ name: string }> = ({ name }) => { const I = ICONOS[name] || ClipboardList; return <I className="w-5 h-5" />; };

const errorsMap = (list: ApiErr[]) => Object.fromEntries(list.map(e => [`${e.section || 'resumen'}:${e.field}`, e.message]));
const contar = (sec: SectionDef | undefined, d: Record<string, any> = {}) => {
  if (!sec) return { filled: 0, total: 0 };
  const vis = sec.fields.filter(f => f.t !== 'heading');
  return { filled: vis.filter(f => !isEmptyValue(d[f.k])).length, total: vis.length };
};
/** Quita las referencias a un archivo, donde estén. */
const sinArchivo = (value: any, id: string): any => {
  if (Array.isArray(value)) {
    const out = value.filter(x => !(x && typeof x === 'object' && x.id === id && Object.keys(x).every(k => ['id', 'description', 'usage', 'alt', 'caption'].includes(k)))).map(x => sinArchivo(x, id));
    return out;
  }
  if (value && typeof value === 'object') {
    const o: any = {};
    for (const [k, v] of Object.entries(value)) {
      const n = sinArchivo(v, id);
      if (!(Array.isArray(n) && !n.length && Array.isArray(v) && v.length)) o[k] = n;
    }
    return o;
  }
  return value;
};
const cambiarArchivo = (value: any, from: string, to: string) => JSON.parse(JSON.stringify(value).split(`"id":"${from}"`).join(`"id":"${to}"`));

const Aviso: React.FC<{ tono: 'sky' | 'orange' | 'amber' | 'emerald'; children: React.ReactNode }> = ({ tono, children }) => {
  const c = { sky: 'bg-sky-50 border-sky-200 text-sky-800', orange: 'bg-orange-50 border-orange-200 text-orange-800', amber: 'bg-amber-50 border-amber-200 text-amber-800', emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800' }[tono];
  return <div className={`${c} border rounded-2xl p-4 text-sm`} role="status">{children}</div>;
};

const TarjetaOpcion: React.FC<{ activa: boolean; onClick: () => void; titulo: string; texto?: string; logo?: string; disabled?: boolean }> = ({ activa, onClick, titulo, texto, logo, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-pressed={activa}
    className={`text-left rounded-2xl border-2 p-4 transition-all flex gap-3 items-start ${activa ? 'border-rotary-blue bg-blue-50/50 shadow-sm' : 'border-gray-100 bg-white hover:border-rotary-blue/40'} disabled:opacity-60`}>
    {logo !== undefined && <span className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">{logo ? <img src={logo} alt="" className="w-full h-full object-contain" /> : <HeartHandshake className="w-5 h-5 text-gray-300" />}</span>}
    <span className="min-w-0">
      <span className="block font-black text-gray-900 text-sm">{titulo}</span>
      {texto && <span className="block text-xs text-gray-500 mt-0.5">{texto}</span>}
    </span>
    {activa && <CheckCircle2 className="w-5 h-5 text-rotary-blue ml-auto shrink-0" />}
  </button>
);

export default function ProgramIntakeForm() {
  useSEO({ title: 'Información de los programas · Formulario institucional', description: 'Formulario para que los líderes de los programas que respalda el Distrito 4281 compartan textos, documentos y materiales para sus páginas.' });
  const [search, setSearch] = useSearchParams();
  const { user } = useAuth();

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [programas, setProgramas] = useState<ProgramLite[]>([]);
  const [tipos, setTipos] = useState<{ id: string; label: string; help: string }[]>([]);
  const [slug, setSlug] = useState(search.get('programa') || '');
  const [payload, setPayload] = useState<FormPayload | null>(null);
  const [tipo, setTipo] = useState('');
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [sender, setSender] = useState<Record<string, any>>({});
  const [precargado, setPrecargado] = useState(false);
  const [vigenciaOk, setVigenciaOk] = useState(false);
  const [data, setData] = useState<Record<string, any>>({});
  const [consents, setConsents] = useState<{ data?: boolean; rights?: boolean; newsletter?: boolean }>({});
  const [token, setToken] = useState('');
  const [intake, setIntake] = useState<IntakeView | null>(null);
  const [files, setFiles] = useState<Record<string, IntakeFile>>({});
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null);
  const [errorGuardado, setErrorGuardado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [correoEnlace, setCorreoEnlace] = useState<boolean | null>(null);
  const [recuperar, setRecuperar] = useState('');
  const [recuperando, setRecuperando] = useState(false);
  const [locales, setLocales] = useState<LocalDraft[]>([]);
  const [mios, setMios] = useState<{ publicRef: string; programName: string; statusLabel: string; lastSavedAt: string }[]>([]);
  const sucias = useRef<Set<string>>(new Set());
  const dataRef = useRef(data); dataRef.current = data;
  const tokenRef = useRef(token); tokenRef.current = token;
  const reelegir = useRef<HTMLInputElement>(null);
  const reelegirDe = useRef<{ id: string; purpose: string } | null>(null);
  const [desdeResumen, setDesdeResumen] = useState(false);
  const [revision, setRevision] = useState<{ errors: ApiErr[]; pending: { section: string; field: string; label: string }[]; unfinishedFiles: { id: string; filename: string }[] } | null>(null);

  const form = payload?.form || null;
  const pasos: StepDef[] = form?.steps?.length === RESUMEN ? form.steps : PASOS_BASE;
  const secDe = useCallback((k: string): SectionDef | undefined => form?.sections.find(s => s.k === k), [form]);
  /** ¿Este paso va en el envío? Carga inicial: todos los que aplican al programa; si no, los elegidos. */
  const incluido = useCallback((n: number) => {
    if (n === 1 || n === RESUMEN) return true;
    const secs = pasos[n - 1]?.sections || [];
    if (!secs.length) return false;
    return !tipo || tipo === 'carga_inicial' || secs.some(k => elegidas.includes(k));
  }, [pasos, tipo, elegidas]);
  const pasoDeSeccion = useCallback((k: string) => (k === 'remitente' || k === 'inicio' ? 1 : (pasos.findIndex(p => p.sections.includes(k)) + 1) || RESUMEN), [pasos]);
  const editable = !intake || intake.editable;

  // ── Carga ────────────────────────────────────────────────────────────
  const cargarFormulario = useCallback(async (s: string) => {
    const p = await intakeApi<FormPayload>(`/form/${encodeURIComponent(s)}`);
    setPayload(p);
    return p;
  }, []);

  const abrirBorrador = useCallback(async (t: string) => {
    const r = await intakeApi<{ intake: IntakeView; program: ProgramLite }>('/draft', { token: t });
    const p = await cargarFormulario(r.program.slug);
    tokenRef.current = t;
    setToken(t); setIntake(r.intake); setSlug(r.program.slug);
    setTipo(r.intake.submissionType); setElegidas(r.intake.sections || []); setSender(r.intake.sender || {});
    setData(r.intake.data || {}); setConsents(r.intake.consents || {});
    setFiles(Object.fromEntries(r.intake.files.map(f => [f.id, f])));
    setVigenciaOk(true);
    // v4.1287 — Se vuelve al paso en el que se dejó (por su CLAVE, que sobrevive a
    // la reorganización). Un borrador anterior, sin paso guardado, abre en el
    // primer paso de contenido; uno devuelto con ajustes, en el resumen.
    const previo = localDrafts().find(d => d.ref === r.intake.publicRef);
    rememberDraft({ ref: r.intake.publicRef, slug: r.program.slug, programName: r.program.name, token: t, savedAt: r.intake.lastSavedAt, step: previo?.step });
    if (!r.intake.editable) setEnviado(r.intake.status !== 'borrador');
    const guardado = (p.form.steps || []).findIndex(st => st.k === previo?.step) + 1;
    setStep(!r.intake.editable ? 1 : r.intake.status === 'ajustes' ? RESUMEN : guardado > 1 ? guardado : 2);
    return r;
  }, [cargarFormulario]);

  const cargar = useCallback(async () => {
    setCargando(true); setErrorCarga('');
    try {
      const lista = await intakeApi<{ programs: ProgramLite[]; submissionTypes: any[] }>('/programas?district=4281');
      setProgramas(lista.programs); setTipos(lista.submissionTypes);
      setLocales(localDrafts());
      const continuar = search.get('continuar');
      if (continuar) {
        // El secreto no se queda en la barra de direcciones (ni en el historial ni en un «Referer»).
        const next = new URLSearchParams(search); next.delete('continuar'); setSearch(next, { replace: true });
        try { await abrirBorrador(continuar); } catch (e: any) { toast.error(e?.message || 'El enlace no es válido.'); }
      } else if (slug) {
        await cargarFormulario(slug).catch(() => { setSlug(''); });
      }
      try { const m = await intakeApi<{ drafts: any[] }>('/mine'); setMios(m.drafts || []); } catch { /* sin sesión */ }
    } catch (e: any) {
      setErrorCarga(e?.message || 'No se pudo cargar el formulario.');
    } finally { setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // v4.1286 — Con sesión iniciada se precargan los datos y se pide confirmar que siguen vigentes.
  useEffect(() => {
    if (!user || token || precargado) return;
    const nombre = String(user.firstName || user.name || '').trim();
    setSender(s => ({
      ...s,
      firstName: s.firstName || user.firstName || (nombre ? nombre.split(' ')[0] : ''),
      lastName: s.lastName || user.lastName || (nombre.includes(' ') && !user.firstName ? nombre.split(' ').slice(1).join(' ') : ''),
      email: s.email || user.email || '', role: s.role || user.position || '',
    }));
    setPrecargado(true);
  }, [user, token, precargado]);

  // ── Guardado en el servidor (por sección, mientras se escribe) ───────
  const guardarSeccion = useCallback(async (k: string) => {
    const t = tokenRef.current;
    if (!t) return;
    sucias.current.delete(k);
    setGuardando(true); setErrorGuardado('');
    try {
      const r = await intakeApi<{ savedAt: string; warnings: ApiErr[] }>(`/draft/section/${k}`, { method: 'PUT', token: t, body: { data: dataRef.current[k] || {} } });
      setGuardadoEn(r.savedAt);
      setErrores(prev => {
        const n = Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${k}:`)));
        return { ...n, ...errorsMap((r.warnings || []).filter(w => /Revisa|válid|no válid|enlace|fecha|año|seudónimo|menciona|representante/i.test(w.message))) };
      });
    } catch (e: any) {
      sucias.current.add(k);
      setErrorGuardado(e instanceof IntakeError && e.status === 0 ? 'Sin conexión: guardaremos en cuanto vuelva.' : (e?.message || 'No se pudo guardar.'));
    } finally { setGuardando(false); }
  }, []);
  const vaciar = useCallback(async () => { for (const k of Array.from(sucias.current)) await guardarSeccion(k); }, [guardarSeccion]);

  useEffect(() => {
    if (!token || !sucias.current.size) return;
    const t = setTimeout(() => { vaciar(); }, 1200);
    return () => clearTimeout(t);
  }, [data, token, vaciar]);

  const guardarMeta = useCallback(async (extra: Partial<{ consents: any }> = {}) => {
    if (!tokenRef.current) return;
    try {
      const r = await intakeApi<{ savedAt: string }>('/draft/meta', { method: 'PUT', token: tokenRef.current, body: { submissionType: tipo, sections: elegidas, sender, consents: extra.consents || consents } });
      setGuardadoEn(r.savedAt);
    } catch (e: any) { setErrorGuardado(e?.message || 'No se pudo guardar.'); }
  }, [tipo, elegidas, sender, consents]);

  // Salir con cambios sin guardar pide confirmación; al volver la conexión, se guarda.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (sucias.current.size || Object.values(uploads).some(u => u.status === 'uploading')) { e.preventDefault(); e.returnValue = ''; } };
    const online = () => { vaciar(); };
    window.addEventListener('beforeunload', h); window.addEventListener('online', online);
    return () => { window.removeEventListener('beforeunload', h); window.removeEventListener('online', online); };
  }, [uploads, vaciar]);

  const setCampo = (sec: string, k: string, v: any) => {
    setData(d => {
      const s = { ...(d[sec] || {}) };
      if (v === undefined) delete s[k]; else s[k] = v;
      return { ...d, [sec]: s };
    });
    sucias.current.add(sec);
  };

  // ── Archivos ─────────────────────────────────────────────────────────
  const upload = useCallback((file: File, purpose: string): Promise<string | null> => new Promise((resolve) => {
    const t = tokenRef.current;
    if (!t) { toast.error('Completa primero tus datos para empezar el borrador.'); resolve(null); return; }
    const p = payload?.purposes[purpose];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (p && !p.exts.includes(ext)) { toast.error(`${file.name}: formato no admitido aquí. Se acepta ${p.exts.map(e => e.toUpperCase()).join(', ')}.`); resolve(null); return; }
    let id: string | null = null;
    const heic = /hei[cf]$/i.test(ext);
    const preview = file.type.startsWith('image/') && !heic ? URL.createObjectURL(file) : undefined;
    uploadIntakeFile(t, file, purpose, {
      onCreated: (fid) => { id = fid; setUploads(u => ({ ...u, [fid]: { progress: 0, status: 'uploading', file, preview } })); resolve(fid); },
      onProgress: (pct) => { if (id) { const fid = id; setUploads(u => ({ ...u, [fid]: { ...u[fid], progress: pct } })); } },
    }).then((ready) => {
      setFiles(f => ({ ...f, [ready.id]: ready }));
      setUploads(u => ({ ...u, [ready.id]: { ...u[ready.id], status: 'ready', progress: 100 } }));
    }).catch((e: any) => {
      if (!id) { toast.error(`${file.name}: ${e?.message || 'no se pudo cargar.'}`); resolve(null); return; }
      const fid = id;
      setUploads(u => ({ ...u, [fid]: { ...u[fid], status: 'error', error: `${e?.message || 'No se pudo cargar.'} Lo demás del formulario sigue guardado.` } }));
    });
  }), [payload]);

  const removeFile = useCallback(async (id: string) => {
    setData(d => sinArchivo(d, id));
    Object.keys(dataRef.current).forEach(k => sucias.current.add(k));
    setUploads(u => { const n = { ...u }; delete n[id]; return n; });
    setFiles(f => { const n = { ...f }; delete n[id]; return n; });
    try { await intakeApi(`/files/${id}`, { method: 'DELETE', token: tokenRef.current }); } catch { /* el servidor lo limpia al revisar */ }
  }, []);

  const reintentarCon = useCallback(async (oldId: string, file: File, purpose: string) => {
    const nuevo = await upload(file, purpose);
    if (nuevo && nuevo !== oldId) {
      setData(d => cambiarArchivo(d, oldId, nuevo));
      Object.keys(dataRef.current).forEach(k => sucias.current.add(k));
      setUploads(u => { const n = { ...u }; delete n[oldId]; return n; });
      setFiles(f => { const n = { ...f }; delete n[oldId]; return n; });
      intakeApi(`/files/${oldId}`, { method: 'DELETE', token: tokenRef.current }).catch(() => {});
    }
  }, [upload]);

  const retryFile = useCallback((id: string) => {
    const up = uploads[id];
    const purpose = files[id]?.purpose || 'media';
    if (up?.file) { reintentarCon(id, up.file, purpose); return; }
    reelegirDe.current = { id, purpose };
    reelegir.current?.click();
  }, [uploads, files, reintentarCon]);

  const openFile = useCallback(async (id: string) => {
    try { const r = await intakeApi<{ url: string }>(`/files/${id}/url`, { token: tokenRef.current }); window.open(r.url, '_blank', 'noopener'); }
    catch (e: any) { toast.error(e?.message || 'No se pudo abrir.'); }
  }, []);

  // Miniaturas de lo que se cargó en otra sesión: enlace firmado y corto, sólo para el titular.
  useEffect(() => {
    if (!token) return;
    const faltan = Object.values(files).filter(f => f.kind === 'image' && f.status === 'ready' && !uploads[f.id]?.preview && !previews[f.id]).slice(0, 24);
    if (!faltan.length) return;
    let vivo = true;
    (async () => {
      for (const f of faltan) {
        try { const r = await intakeApi<{ url: string }>(`/files/${f.id}/url`, { token }); if (vivo) setPreviews(p => ({ ...p, [f.id]: r.url })); } catch { /* sin miniatura */ }
      }
    })();
    return () => { vivo = false; };
  }, [files, token, uploads, previews]);

  // ── Navegación ───────────────────────────────────────────────────────
  const empezar = async (): Promise<boolean> => {
    const faltan: Record<string, string> = {};
    for (const [k, l] of [['firstName', 'Nombres'], ['lastName', 'Apellidos'], ['email', 'Correo electrónico'], ['role', 'Cargo o función'], ['relation', 'Relación con el programa']]) if (!String(sender[k] || '').trim()) faltan[`remitente:${k}`] = `Completa «${l}».`;
    if (sender.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(sender.email)) faltan['remitente:email'] = 'Revisa el correo.';
    if (sender.clubMode === 'club' && !sender.clubProfileId) faltan['remitente:clubProfileId'] = 'Elige tu club o indica que no perteneces a uno.';
    if (!slug || !payload) faltan['inicio:program'] = 'Elige el programa.';
    if (!tipo) faltan['inicio:submissionType'] = 'Elige el tipo de envío.';
    if (tipo && tipo !== 'carga_inicial' && !elegidas.length) faltan['inicio:sections'] = 'Elige al menos un paso para actualizar o aportar.';
    if (precargado && !vigenciaOk) faltan['remitente:vigencia'] = 'Confirma que tus datos están vigentes.';
    if (Object.keys(faltan).length) { setErrores(faltan); alPrimerError(); return false; }
    if (token) { await guardarMeta(); return true; }
    try {
      const r = await intakeApi<{ token: string; intake: IntakeView; emailSent: boolean }>('/start', { method: 'POST', body: { slug, submissionType: tipo, sections: elegidas, sender, consents } });
      tokenRef.current = r.token; // el paso siguiente lo necesita ANTES del próximo render
      setToken(r.token); setIntake(r.intake); setCorreoEnlace(r.emailSent);
      rememberDraft({ ref: r.intake.publicRef, slug, programName: payload?.program.name || slug, token: r.token, savedAt: r.intake.lastSavedAt });
      setErrores({});
      toast.success(`Borrador ${r.intake.publicRef} creado. Se guarda solo mientras escribes.`);
      return true;
    } catch (e: any) {
      if (e instanceof IntakeError && e.errors.length) setErrores(errorsMap(e.errors));
      toast.error(e?.message || 'No se pudo empezar el borrador.');
      return false;
    }
  };

  const alPrimerError = () => setTimeout(() => {
    const el = document.querySelector('[data-pi-step] [role="alert"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 60);

  const irA = async (n: number) => {
    if (n === step) return;
    if (step === 1 && n > 1) { if (!(await empezar())) return; }
    if (step > 1) await vaciar();
    if (n > 1 && !tokenRef.current) return;
    if (n === RESUMEN) setDesdeResumen(false);
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  /** Siguiente / Anterior saltan los pasos que no van en este envío. */
  const vecino = (dir: 1 | -1) => { let n = step + dir; while (n > 1 && n < RESUMEN && !incluido(n)) n += dir; return Math.min(RESUMEN, Math.max(1, n)); };
  const incluirPaso = (n: number) => { setElegidas(e => Array.from(new Set([...e, ...(pasos[n - 1]?.sections || [])]))); };
  const guardarAhora = async () => { await vaciar(); await guardarMeta(); toast.success('Borrador guardado. Puedes continuar cuando quieras con tu enlace.'); };

  // El paso actual queda recordado en este dispositivo (por su clave) y lo elegido se guarda.
  useEffect(() => { if (token && intake?.publicRef) rememberStep(intake.publicRef, pasos[step - 1]?.k || ''); }, [step, token, intake?.publicRef, pasos]);
  useEffect(() => { if (token && editable) guardarMeta(); }, [elegidas]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al llegar al resumen: lo que falta y lo que conviene revisar, sin enviar nada.
  useEffect(() => {
    if (step !== RESUMEN || !token || enviado) return;
    let vivo = true;
    (async () => {
      await vaciar();
      try { const r = await intakeApi<any>('/draft/check', { method: 'POST', token, body: { consents } }); if (vivo) setRevision(r); } catch { /* el envío lo vuelve a comprobar */ }
    })();
    return () => { vivo = false; };
  }, [step, token, enviado]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async () => {
    await vaciar();
    if (Object.values(uploads).some(u => u.status === 'uploading')) { toast.error('Espera a que terminen de cargar los archivos.'); return; }
    setEnviando(true);
    try {
      const r = await intakeApi<{ intake: IntakeView }>('/draft/submit', { method: 'POST', token, body: { consents } });
      setIntake(r.intake); setEnviado(true); setErrores({});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      if (e instanceof IntakeError && e.errors.length) {
        setErrores(errorsMap(e.errors));
        try { const r = await intakeApi<any>('/draft/check', { method: 'POST', token, body: { consents } }); setRevision(r); } catch { /* noop */ }
        alPrimerError();
      }
      toast.error(e?.message || 'No se pudo enviar.');
    } finally { setEnviando(false); }
  };

  const pedirEnlace = async () => {
    setRecuperando(true);
    try { const r = await intakeApi<{ message: string }>('/recover', { method: 'POST', body: { email: recuperar } }); toast.success(r.message); setRecuperar(''); }
    catch (e: any) { toast.error(e?.message || 'No se pudo pedir el enlace.'); }
    finally { setRecuperando(false); }
  };
  const abrirMio = async (ref: string) => {
    try { const r = await intakeApi<{ token: string }>(`/mine/${encodeURIComponent(ref)}/open`, { method: 'POST' }); await abrirBorrador(r.token); }
    catch (e: any) { toast.error(e?.message || 'No se pudo abrir.'); }
  };
  const elegirPrograma = async (s: string) => {
    if (token) return;
    setSlug(s); setErrores({});
    try { const p = await cargarFormulario(s); if (tipo === 'aporte') setElegidas(p.form.contentSections); }
    catch (e: any) { toast.error(e?.message || 'No se pudo abrir el programa.'); }
  };

  const enlaceContinuar = token ? `${window.location.origin}/formulario-programas?continuar=${token}` : '';

  // ── Contexto de los campos ───────────────────────────────────────────
  const ctxBase = useMemo(() => {
    const historias = (data.historias?.stories || []).filter((s: any) => s.title).map((s: any) => ({ id: `i-${s._id}`, label: `${s.title} (en este envío)` }));
    const publicadas = (payload?.records || []).filter(r => r.kind === 'story' && r.format !== 'testimonio').map(r => ({ id: r.id, label: r.title }));
    return {
      health: Boolean(form?.health), purposes: payload?.purposes || {}, limitsLabel: payload?.limits.label || '', files, uploads,
      upload, removeFile, retryFile, openFile, previewOf: (id: string) => uploads[id]?.preview || previews[id],
      records: payload?.records || [], districts: payload?.districts || [], clubDistrict: Number(sender.districtNumber) || 4281,
      storyOptions: [...publicadas, ...historias], errors: errores, readOnly: !editable,
    };
  }, [data.historias, payload, form, files, uploads, upload, removeFile, retryFile, openFile, previews, sender.districtNumber, errores, editable]);
  const ctxDe = (section: string): FieldCtx => ({ ...ctxBase, section });

  // ── Pantallas ────────────────────────────────────────────────────────
  if (cargando) return <Marco><div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div></Marco>;
  if (errorCarga) return (
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

  const pct = enviado ? 100 : Math.round(((step - 1) / (RESUMEN - 1)) * 100);
  const remitente = form?.sections.find(s => s.always);
  const datosDePaso = (n: number) => (pasos[n - 1]?.sections || []).reduce((a, k) => { const c = contar(secDe(k), data[k]); return { filled: a.filled + c.filled, total: a.total + c.total }; }, { filled: 0, total: 0 });
  const estadoPaso = (n: number): '' | 'hecho' | 'excluido' => (n === 1 ? (token ? 'hecho' : '') : n === RESUMEN ? '' : !incluido(n) ? 'excluido' : datosDePaso(n).filled > 0 ? 'hecho' : '');
  const avisosDePaso = (n: number) => Array.from(new Set([...Object.entries(errores).filter(([k]) => pasoDeSeccion(k.split(':')[0]) === n).map(([, m]) => m), ...(revision?.errors || []).filter(e => pasoDeSeccion(e.section || 'resumen') === n).map(e => e.message)]));
  const pasoActual = pasos[step - 1];

  return (
    <Marco>
      <PublicPageHeader
        title="Información de los programas"
        subtitle="Formulario institucional para que los líderes de los programas que respalda el Distrito 4281 compartan los textos, documentos y materiales de sus páginas. Todo llega como propuesta y se revisa antes de publicarse."
      />
      <input ref={reelegir} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; const t = reelegirDe.current; e.target.value = ''; if (f && t) reintentarCon(t.id, f, t.purpose); }} />
      <div className={CONTENEDOR}>
        {!enviado && <PasosNumerados pasos={pasos} paso={step} pct={pct} onIr={irA} alcanzable={(n) => n === 1 || Boolean(token)} estado={estadoPaso} />}

        {!enviado && token && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold px-1">
            <span className="text-gray-400">Envío {intake?.publicRef}</span>
            <span className={errorGuardado ? 'text-red-600' : 'text-gray-400'} aria-live="polite">
              {guardando ? 'Guardando…' : errorGuardado || (guardadoEn ? `Guardado ${new Date(guardadoEn).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : 'Se guarda mientras escribes')}
            </span>
          </div>
        )}
        {!enviado && intake?.status === 'ajustes' && (
          <Aviso tono="orange">
            <p className="font-black">El equipo del programa pidió ajustes</p>
            {intake.reviewNote && <p className="mt-1 whitespace-pre-line">{intake.reviewNote}</p>}
            {intake.adjustments.length > 0 && <ul className="mt-2 list-disc pl-5 space-y-0.5">{intake.adjustments.map(a => <li key={a.key}><b>{a.label}</b>{a.note ? `: ${a.note}` : ''}</li>)}</ul>}
          </Aviso>
        )}

        {/* PASO 1 — Programa y datos del responsable (antes: pasos 1 y 2) */}
        {step === 1 && !enviado && (
          <div className="space-y-4" data-pi-step="1">
          <div className={TARJETA}>
            {(locales.length > 0 || mios.length > 0) && !token && (
              <div className="mb-8 rounded-2xl bg-sky-50 border border-sky-100 p-4">
                <p className="text-sm font-black text-sky-900">Continuar un borrador</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {locales.map(d => (
                    <span key={d.ref} className="inline-flex items-center gap-1 bg-white border border-sky-200 rounded-xl pl-3 pr-1 py-1 text-xs">
                      <button type="button" className="font-bold text-sky-800" onClick={() => abrirBorrador(d.token).catch((e) => { toast.error(e?.message); forgetDraft(d.ref); setLocales(localDrafts()); })}>{d.programName} · {d.ref}</button>
                      <button type="button" className="text-gray-400 hover:text-red-600 px-1" aria-label="Olvidar en este dispositivo" onClick={() => { forgetDraft(d.ref); setLocales(localDrafts()); }}>×</button>
                    </span>
                  ))}
                  {mios.filter(m => !locales.some(l => l.ref === m.publicRef)).map(m => (
                    <button key={m.publicRef} type="button" onClick={() => abrirMio(m.publicRef)} className="bg-white border border-sky-200 rounded-xl px-3 py-1 text-xs font-bold text-sky-800">{m.programName} · {m.publicRef} ({m.statusLabel})</button>
                  ))}
                </div>
              </div>
            )}
            <TituloPaso icon={<HeartHandshake className="w-5 h-5" />} titulo="¿De qué programa es la información?" texto="Los programas que respalda el distrito. Elegir uno no da permisos administrativos." />
            {programas.length === 0 ? <p className="text-sm text-gray-500">Todavía no hay programas habilitados para este formulario.</p> : (
              <div className="grid sm:grid-cols-2 gap-3">
                {programas.map(p => <TarjetaOpcion key={p.slug} activa={slug === p.slug} onClick={() => elegirPrograma(p.slug)} titulo={p.name} texto={[p.shortName, p.categoryLabel].filter(Boolean).join(' · ')} logo={p.logoUrl} disabled={Boolean(token) && slug !== p.slug} />)}
              </div>
            )}
            {errores['inicio:program'] && <p className="text-xs text-red-600 font-semibold mt-2" role="alert">{errores['inicio:program']}</p>}
            {payload && (
              <div className="mt-8 pt-8 border-t border-gray-100">
                <TituloPaso icon={<ClipboardList className="w-5 h-5" />} titulo="Tipo de envío" texto={payload.form.intro || 'No hace falta completar todo en una sola sesión: guarda y vuelve cuando quieras.'} />
                <div className="grid sm:grid-cols-3 gap-3">
                  {tipos.map(t => <TarjetaOpcion key={t.id} activa={tipo === t.id} titulo={t.label} texto={t.help} onClick={() => { setTipo(t.id); if (t.id === 'aporte' && !elegidas.length) setElegidas(payload.form.contentSections); }} disabled={!editable} />)}
                </div>
                {errores['inicio:submissionType'] && <p className="text-xs text-red-600 font-semibold mt-2" role="alert">{errores['inicio:submissionType']}</p>}
                {tipo && tipo !== 'carga_inicial' && (
                  <div className="mt-6">
                    <p className={ROTULO}>{tipo === 'actualizacion' ? 'Pasos que quieres actualizar' : 'Qué vas a aportar'}</p>
                    <p className="text-xs text-gray-500 mb-3">Solo se revisan los pasos que elijas. Lo que no envíes conserva su valor actual: un campo vacío no borra nada.</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {pasos.slice(1, RESUMEN - 1).filter(p => p.sections.length).map(p => {
                        const on = p.sections.some(k => elegidas.includes(k));
                        return (
                          <label key={p.k} className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer text-sm ${on ? 'border-rotary-blue bg-blue-50/40' : 'border-gray-100'}`}>
                            <input type="checkbox" checked={on} disabled={!editable} onChange={() => setElegidas(e => (on ? e.filter(x => !p.sections.includes(x)) : Array.from(new Set([...e, ...p.sections]))))} className="w-4 h-4 accent-rotary-blue" />
                            <span className="w-6 h-6 rounded-full bg-rotary-blue/10 text-rotary-blue text-[11px] font-black flex items-center justify-center shrink-0">{p.n}</span>
                            <span className="font-semibold text-gray-800">{p.title}</span>
                          </label>
                        );
                      })}
                    </div>
                    {errores['inicio:sections'] && <p className="text-xs text-red-600 font-semibold mt-2" role="alert">{errores['inicio:sections']}</p>}
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-6">{payload.limits.label}</p>
              </div>
            )}
            {!token && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <p className={ROTULO}>¿Empezaste en otro dispositivo?</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="email" value={recuperar} onChange={(e) => setRecuperar(e.target.value)} placeholder="Tu correo electrónico" className={CAMPO} aria-label="Correo para recuperar el borrador" />
                  <button type="button" onClick={pedirEnlace} disabled={recuperando || !recuperar} className="px-4 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-60">
                    {recuperando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Enviarme el enlace
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Por seguridad, el enlace llega solo al correo con el que empezaste.</p>
              </div>
            )}
          </div>
          {remitente && (
          <div className={TARJETA}>
            <TituloPaso icon={<UserCheck className="w-5 h-5" />} titulo={remitente.title} texto={remitente.desc} />
            {precargado && !token && (
              <div className="mb-5 rounded-2xl bg-sky-50 border border-sky-100 p-4 text-sm text-sky-900">
                <p>Precargamos los datos de tu sesión. Revísalos y confirma que siguen vigentes.</p>
                <label className="mt-2 flex items-center gap-2 font-semibold"><input type="checkbox" checked={vigenciaOk} onChange={(e) => setVigenciaOk(e.target.checked)} className="w-4 h-4 accent-rotary-blue" /> Mis datos están vigentes</label>
                {errores['remitente:vigencia'] && <p className="text-xs text-red-600 font-semibold mt-1" role="alert">{errores['remitente:vigencia']}</p>}
              </div>
            )}
            <CamposDeSeccion fields={remitente.fields} blocks={remitente.blocks} data={sender} ctx={ctxDe('remitente')} onChange={(k, v) => setSender(s => { const n = { ...s }; if (v === undefined) delete n[k]; else n[k] = v; return n; })} />
            <div className="mt-6"><AvisoPrivacidad texto="Tu correo y tu teléfono son internos: sirven para revisar el envío y contactarte. Solo se muestra lo que autorices arriba." /></div>
          </div>
          )}
          </div>
        )}

        {/* PASOS 2 A 9 — cada uno agrupa sus secciones en bloques desplegables */}
        {step > 1 && step < RESUMEN && !enviado && pasoActual && (
          <div className={TARJETA} data-pi-step={step}>
            <TituloPaso icon={<Icono name={secDe(pasoActual.sections[0])?.icon || 'book'} />} titulo={`${step}. ${pasoActual.title}`} texto={pasoActual.desc} />
            {!pasoActual.sections.length ? (
              <p className="text-sm text-gray-500 rounded-2xl bg-gray-50 border border-gray-100 p-4">Este paso no aplica a este programa (lo definió la administración). Puedes continuar.</p>
            ) : !incluido(step) ? (
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-600 space-y-3">
                <p>Este paso no está incluido en tu envío. Lo que no envíes conserva su valor actual.</p>
                {editable && <button type="button" onClick={() => incluirPaso(step)} className="px-4 py-2.5 rounded-xl bg-rotary-blue text-white text-sm font-bold">Incluir este paso</button>}
              </div>
            ) : (
              <div className="space-y-8">
                {pasoActual.sections.map((k, i) => {
                  const sec = secDe(k);
                  if (!sec) return null;
                  const cuerpo = <CamposDeSeccion fields={sec.fields} blocks={sec.blocks} data={data[k] || {}} ctx={ctxDe(k)} onChange={(fk, v) => setCampo(k, fk, v)} />;
                  if (sec.collapsible) {
                    const c = contar(sec, data[k]);
                    return (
                      <div key={k} className={i ? 'pt-8 border-t border-gray-100' : ''}>
                        <BloqueDesplegable titulo={`${sec.title} (complementario)`} texto={sec.desc} abierto={c.filled > 0} llenos={c.filled} total={c.total} conError={Object.keys(errores).some(e => e.startsWith(`${k}:`))}>
                          {cuerpo}
                        </BloqueDesplegable>
                      </div>
                    );
                  }
                  return (
                    <section key={k} className={i ? 'pt-8 border-t border-gray-100' : ''} aria-labelledby={`sec-${k}`}>
                      {pasoActual.sections.length > 1 && (
                        <div className="mb-4">
                          <h3 id={`sec-${k}`} className="text-base font-black text-gray-900">{sec.title}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">{sec.desc}</p>
                        </div>
                      )}
                      {cuerpo}
                    </section>
                  );
                })}
                {pasoActual.sections.some(k => secDe(k)?.fields.some(f => f.t === 'files' || (f.fields || []).some(x => x.t === 'files'))) && <p className="text-[11px] text-gray-400">{payload?.limits.label}</p>}
              </div>
            )}
          </div>
        )}

        {/* PASO 10 — RESUMEN Y ENVÍO */}
        {step === RESUMEN && !enviado && (
          <div className={TARJETA} data-pi-step={step}>
            <TituloPaso icon={<ShieldCheck className="w-5 h-5" />} titulo="10. Resumen y envío" texto="Revisa lo que incluye tu envío. Puedes editar cualquier paso y volver aquí. Puedes enviar aunque falten pasos: cada uno se revisa por separado." />
            <dl className="rounded-2xl bg-gray-50 border border-gray-100 p-4 space-y-1.5">
              <Resumen etiqueta="Programa" valor={payload?.program.name} />
              <Resumen etiqueta="Tipo de envío" valor={tipos.find(t => t.id === tipo)?.label} />
              <Resumen etiqueta="Referencia" valor={intake?.publicRef} />
            </dl>
            <ol className="mt-5 space-y-3">
              {pasos.slice(0, RESUMEN - 1).map((p) => {
                const n = p.n;
                const inc = incluido(n);
                const c = n === 1 ? null : datosDePaso(n);
                const archivos = n === 1 ? [] : idsDeArchivos(p.sections.map(k => data[k])).map(id => files[id]).filter(Boolean);
                const pendientes = (revision?.pending || []).filter(x => pasoDeSeccion(x.section) === n);
                const avisos = avisosDePaso(n);
                const ajustes = (intake?.adjustments || []).filter(a => pasoDeSeccion(a.section) === n);
                return (
                  <li key={p.k} className={`rounded-2xl border-2 p-4 ${avisos.length || ajustes.length ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100 bg-white'}`}>
                    <div className="flex items-start gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${estadoPaso(n) === 'hecho' ? 'bg-rotary-blue text-white' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-gray-900">{p.title}</p>
                        <p className={`text-[11px] font-semibold mt-0.5 ${!inc ? 'text-gray-400' : n === 1 || (c && c.filled) ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {n === 1 ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') + (sender.role ? ` · ${sender.role}` : '')
                            : !inc ? 'No incluido en este envío' : c && c.filled ? `${c.filled} de ${c.total} apartados con información` : 'Sin información (no se enviará)'}
                        </p>
                        {archivos.length > 0 && <p className="text-[11px] text-gray-500 mt-1 break-words">Archivos: {archivos.map(f => f.filename).join(', ')}</p>}
                        {pendientes.length > 0 && <p className="text-[11px] text-sky-700 mt-1">Pendiente de suministrar: {pendientes.map(x => x.label).join(', ')}</p>}
                        {ajustes.map(a => <p key={a.key} className="text-[11px] text-orange-700 mt-1">Ajuste pedido · {a.label}{a.note ? `: ${a.note}` : ''}</p>)}
                        {avisos.slice(0, 4).map((m, i) => <p key={i} className="text-[11px] text-amber-800 mt-1" role="alert">⚠ {m}</p>)}
                        {avisos.length > 4 && <p className="text-[11px] text-amber-800 mt-1">…y {avisos.length - 4} aviso(s) más.</p>}
                      </div>
                      {editable && <button type="button" onClick={() => { setDesdeResumen(true); irA(n); }} aria-label={`Editar el paso ${n}: ${p.title}`} className="text-xs font-bold text-rotary-blue px-2.5 py-1.5 rounded-lg hover:bg-blue-50 shrink-0">Editar</button>}
                    </div>
                  </li>
                );
              })}
            </ol>
            {(revision?.unfinishedFiles || []).length > 0 && <p className="text-xs text-amber-800 mt-3" role="alert">Hay archivos que no terminaron de cargar: {(revision?.unfinishedFiles || []).map(f => f.filename).join(', ')}. Reintenta o quítalos antes de enviar.</p>}
            {Object.entries(errores).filter(([k]) => k.startsWith('resumen:') && !k.startsWith('resumen:consents.')).map(([k, m]) => <p key={k} className="text-xs text-red-600 font-semibold mt-3" role="alert">{m}</p>)}
            <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
              <p className={ROTULO}>Declaraciones finales</p>
              <p className="text-[11px] text-gray-500">Las autorizaciones de cada historia, testimonio, integrante y pieza multimedia siguen junto a ese contenido; estas declaraciones no las reemplazan.</p>
              {payload && ([['data', payload.consents.data, true], ['rights', payload.consents.rights, false], ['newsletter', payload.consents.newsletter, false]] as const).map(([k, texto, oblig]) => (
                <div key={k}>
                  <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={consents[k] === true} disabled={!editable} onChange={(e) => { const c = { ...consents, [k]: e.target.checked }; setConsents(c); guardarMeta({ consents: c }); }} className="mt-1 w-4 h-4 accent-rotary-blue" />
                    <span className="text-xs leading-relaxed text-gray-600">{texto}{oblig && <span className="text-red-500"> *</span>}{k === 'rights' && <span className="text-gray-400"> (obligatorio si adjuntas materiales)</span>}</span>
                  </label>
                  {errores[`resumen:consents.${k}`] && <p className="text-xs text-red-600 font-semibold ml-7" role="alert">{errores[`resumen:consents.${k}`]}</p>}
                </div>
              ))}
              <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3 text-xs text-sky-900 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0" /> Tu envío será revisado por el equipo del programa antes de publicarse. Nada reemplaza la información vigente ni aparece en la página sin esa aprobación. Los documentos y soportes son privados.</div>
            </div>
          </div>
        )}

        {/* El enlace para continuar */}
        {!enviado && token && (
          <div className="rounded-2xl border border-gray-100 bg-white px-4 sm:px-6 py-4 shadow-sm">
            <p className="text-sm font-black text-gray-800 flex items-center gap-2"><Save className="w-4 h-4 text-rotary-blue" /> Puedes salir y continuar después</p>
            <p className="text-xs text-gray-500 mt-1">{correoEnlace ? `Te enviamos el enlace a ${sender.email}.` : 'Guarda este enlace personal (no lo compartas: da acceso a tu borrador). También puedes pedirlo con tu correo.'}</p>
            <div className="mt-2 flex gap-2">
              <input readOnly value={enlaceContinuar} className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-500 bg-gray-50" aria-label="Enlace para continuar" onFocus={(e) => e.target.select()} />
              <button type="button" onClick={() => { navigator.clipboard?.writeText(enlaceContinuar).then(() => toast.success('Enlace copiado.')).catch(() => {}); }} className="px-3 rounded-lg bg-rotary-blue text-white text-xs font-bold flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copiar</button>
            </div>
          </div>
        )}

        {/* Confirmación */}
        {enviado && intake && (
          <div className={TARJETA + ' text-center'}>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-black text-gray-800 mt-3">{intake.status === 'enviado' ? 'Recibimos la información del programa' : `Envío ${intake.statusLabel.toLowerCase()}`}</h2>
            <p className="text-sm text-gray-500 mt-2">Guarda este identificador para cualquier consulta:</p>
            <p className="text-2xl font-black font-mono text-rotary-blue mt-2 tracking-wider">{intake.publicRef}</p>
            <dl className="text-sm mt-5 space-y-1.5 text-left max-w-sm mx-auto">
              <Resumen etiqueta="Programa" valor={payload?.program.name} />
              <Resumen etiqueta="Tipo de envío" valor={tipos.find(t => t.id === intake.submissionType)?.label} />
              <Resumen etiqueta="Estado" valor={intake.statusLabel} />
            </dl>
            <p className="text-xs text-gray-500 mt-5">Qué sigue: el equipo del programa revisa cada sección y registro. Si falta algo te escribirá con un enlace para ajustarlo. Lo aprobado entra al flujo editorial del programa; nada se publica ni reemplaza lo vigente sin esa aprobación.</p>
          </div>
        )}

        {/* Navegación */}
        {!enviado && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => irA(vecino(-1))} disabled={step === 1} className={BTN_ANTERIOR}><ArrowLeft className="w-4 h-4" /> Anterior</button>
            <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
              {token && editable && <button type="button" onClick={guardarAhora} className={BTN_ANTERIOR}><Save className="w-4 h-4" /> Guardar borrador</button>}
              {desdeResumen && step !== RESUMEN && <button type="button" onClick={() => irA(RESUMEN)} className={BTN_ANTERIOR}>Volver al resumen</button>}
              {step < RESUMEN ? (
                <button onClick={() => irA(vecino(1))} className={BTN_SIGUIENTE}>{step === 1 && !token ? 'Empezar borrador' : 'Siguiente'} <ArrowRight className="w-4 h-4" /></button>
              ) : (
                <button onClick={enviar} disabled={enviando || !editable || Object.values(uploads).some(u => u.status === 'uploading')} className={BTN_ENVIAR}>
                  {enviando && <Loader2 className="w-4 h-4 animate-spin" />} {intake?.status === 'ajustes' ? 'Enviar ajustes a revisión' : 'Enviar a revisión'}
                </button>
              )}
            </div>
          </div>
        )}
        <p className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3" /> Programas respaldados · Formulario institucional · Distrito 4281
        </p>
      </div>
    </Marco>
  );
}
