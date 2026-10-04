import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Upload, X, Image as ImageIcon, Film, Loader2, CheckCircle2,
  AlertTriangle, MapPin, Users, Plus, ArrowLeft, ArrowRight, Sparkles, Save, Link2, Pencil, ChevronDown,
} from 'lucide-react';
import { useSEO } from '../../hooks/useSEO';
import Navbar from '../../sections/Navbar';
import Footer from '../../sections/Footer';
import { ACCEPT_ATTR, MAX_FILES, checkFileMeta } from '../../lib/contentSubmissionSpec';
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, flagEmoji } from '../../lib/countryPhones';
import { fieldsForTipo, IMPACT_META, EXTRA_LABELS, photoAdvice } from '../../lib/rotaryEnAccionSpec';

// ════════════════════════════════════════════════════════════════════
// Rotary en Acción — puerta universal de entrada (v4.1120).
//
// 4 pasos públicos, metadata interna rica:
//   1 · Qué quieres compartir → 2 · Cuéntanos → 3 · Evidencias y contacto
//   → 4 · Revisar y enviar.
//
// La campaña es metadata silenciosa (campaignSlug/ca_token/UTM viajan al
// servidor para trazabilidad) y nunca condiciona visualmente el flujo: ni
// franja de «campaña seleccionada» ni preselección visible de categorías.
// ════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const CAMPO = 'w-full p-3.5 rounded-xl border-2 border-gray-100 text-base bg-gray-50/60 outline-none focus:border-rotary-blue transition-colors';
const ROTULO = 'block text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2';
const TARJETA = 'bg-white rounded-3xl p-6 shadow-sm border border-gray-100';
const nuevoId = () => Math.random().toString(36).slice(2);
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const PASOS = ['Qué quieres compartir', 'Cuéntanos', 'Evidencias y contacto', 'Revisar y enviar'];

const leerJson = async (r: Response) => {
  const texto = await r.text();
  try { return JSON.parse(texto); } catch {
    throw new Error(`El servidor respondió ${r.status} en vez de JSON.`);
  }
};

type Adjunto = {
  id: string; file: File; previewUrl: string; kind: 'image' | 'video'; key?: string; estado: 'pendiente' | 'subiendo' | 'listo' | 'error';
  progreso: number; error?: string; width?: number; height?: number;
};

// Ayuda contextual ⓘ: hover en escritorio, tap en móvil, foco por teclado.
// Corta, no técnica, disponible cuando se necesita en vez de texto permanente.
const TIPS: Record<string, string> = {
  titulo: 'Nombre corto que identifique la actividad. Ej.: Jornada de reforestación en Palmira.',
  historia: 'Resume qué hizo el club, por qué lo hizo, quiénes participaron y qué resultado tuvo. No necesitas escribir como periodista.',
  fecha: 'Cuándo se realizó la actividad. Si duró varios días, indícalo en la descripción.',
  ciudad: 'Municipio donde ocurrió la actividad.',
  beneficiarios: 'Cantidad aproximada de personas o familias beneficiadas. Si no la sabes, déjalo vacío.',
  voluntarios: 'Rotarios, familiares o amigos que ayudaron en la actividad.',
  horas: 'Suma aproximada de horas de servicio dedicadas.',
  recursos: 'Dinero o recursos movilizados, si aplica. Puedes escribir una cifra.',
  impacto: 'Beneficiarios: personas aproximadas. Voluntarios: quienes ayudaron. Horas: suma aproximada. Recursos: dinero o recursos si aplica. Todo opcional.',
  fondosRecaudados: 'Monto total recaudado en la actividad.',
  capacitados: 'Cantidad aproximada de personas que se capacitaron.',
  tipoEmergencia: 'Ej.: inundación, terremoto, incendio, deslizamiento.',
  zonaAfectada: 'Barrios, veredas o municipios afectados.',
  ayudaEntregada: 'Qué entregó el club: mercados, agua, frazadas, kits…',
  necesidades: 'Qué sigue faltando en la zona afectada.',
  area: 'El área de interés de Rotary más cercana a tu historia.',
  programa: 'La comunidad o programa que la protagonizó, si aplica.',
  tema: 'La temática específica, si aplica.',
  tags: 'Palabras sueltas que ayuden a encontrar tu historia.',
  fotos: 'Agrega al menos 5 fotografías para enviar tu historia. Los videos son bienvenidos como evidencia adicional.',
  distrito: 'Distrito al que pertenece el club que realizó la actividad.',
  club: 'El club que protagonizó la historia. Si participaron varios, agrégalos abajo.',
  clubes: 'Otros clubes que participaron, además del principal.',
  aliados: 'Organizaciones, empresas o entidades que apoyaron la actividad.',
  nombre: 'Persona a la que contactaremos si falta algún dato.',
  cargo: 'Tu rol en el club, si tienes uno.',
  email: 'Te avisaremos ahí cuando tu historia se publique.',
  telefono: 'Opcional, para coordinar más rápido por WhatsApp.',
  enlaces: 'Videos, notas o publicaciones donde ya se mostró la actividad.',
};

const InfoTip: React.FC<{ tipKey: string }> = ({ tipKey }) => {  const [abierto, setAbierto] = useState(false);
  const texto = TIPS[tipKey] || 'Solo si aplica a tu historia. Puedes dejarlo vacío.';
  const id = `tip-${tipKey}`;
  return (
    <span className="relative inline-flex ml-1.5 align-middle">
      <button
        type="button" aria-label="Más información" aria-describedby={id} aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        onMouseEnter={() => setAbierto(true)} onMouseLeave={() => setAbierto(false)}
        onFocus={() => setAbierto(true)} onBlur={() => setAbierto(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false); }}
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-black inline-flex items-center justify-center hover:bg-rotary-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-rotary-blue"
      >i</button>
      {abierto && (
        <span role="tooltip" id={id} className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 rounded-xl bg-gray-900 text-white text-[11px] font-normal leading-snug shadow-lg z-30 normal-case tracking-normal">
          {texto}
        </span>
      )}
    </span>
  );
};

const Etiqueta: React.FC<{ htmlFor?: string; tip?: string; children: React.ReactNode }> = ({ htmlFor, tip, children }) => (
  <label className={ROTULO} htmlFor={htmlFor}>{children}{tip && <InfoTip tipKey={tip} />}</label>
);

// Selector de prefijo con bandera: 🇨🇴 +57 visible, lista con nombre.
// Botones nativos (teclado + lector + tap); sin ISO a la vista.
const CountryPicker: React.FC<{ value: string; onChange: (iso: string) => void }> = ({ value, onChange }) => {
  const [abierto, setAbierto] = useState(false);
  const actual = findCountry(value);
  return (
    <div className="relative shrink-0" onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false); }}>
      <button
        type="button" onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox" aria-expanded={abierto}
        aria-label={`Prefijo telefónico: ${actual.name} ${actual.dial}`}
        className="h-full min-h-[52px] px-3 rounded-xl border-2 border-gray-100 bg-gray-50/60 flex items-center gap-1.5 hover:border-gray-200 focus:outline-none focus:border-rotary-blue"
      >
        <span aria-hidden className="text-lg leading-none">{flagEmoji(actual.iso)}</span>
        <span className="font-bold text-sm text-gray-700">{actual.dial}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" aria-hidden />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-30 cursor-default" onClick={() => setAbierto(false)} aria-hidden />
          <ul role="listbox" aria-label="País del teléfono" className="absolute left-0 bottom-full mb-2 z-40 w-64 max-h-64 overflow-auto bg-white border border-gray-100 rounded-2xl shadow-xl py-1">
            {COUNTRIES.map((c) => (
              <li key={c.iso} role="option" aria-selected={c.iso === value}>
                <button
                  type="button" onClick={() => { onChange(c.iso); setAbierto(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-blue-50 ${c.iso === value ? 'bg-blue-50/60 font-bold' : ''}`}
                >
                  <span aria-hidden className="text-lg leading-none">{flagEmoji(c.iso)}</span>
                  <span className="flex-1 text-gray-700">{c.name}</span>
                  <span className="text-gray-400 font-bold">{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

// Claves de emergencia: solo se muestran dentro de su bloque dedicado cuando
// el tipo es «emergencia». Campos anchos: ocupan el 100% a propósito.
const EMERGENCIA_KEYS = new Set(['tipoEmergencia', 'zonaAfectada', 'ayudaEntregada', 'necesidades']);
const ANCHO_COMPLETO = new Set(['objetivo']);

// Agrupa claves en pares 50/50; si sobra una, ocupa todo el ancho.
// Nunca deja una celda vacía para conservar el grid.
const enPares = (keys: string[]): string[][] => {
  const pares: string[][] = [];
  for (let i = 0; i < keys.length; i += 2) pares.push(keys.slice(i, i + 2));
  return pares;
};

const Marco: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-rotary-concrete flex flex-col">
    <Navbar />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
);

const Cabecera: React.FC = () => (
  <section
    className="relative overflow-hidden"
    style={{
      backgroundColor: '#0c3c7c',
      backgroundImage: "url('/geo-darkblue.png')",
      backgroundPosition: '50% 0',
      backgroundRepeat: 'repeat',
      backgroundSize: '71px 85px',
    }}
  >
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
      <div className="text-center max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-5xl text-white mb-6">Rotary en Acción</h1>
        <p className="text-white/80 text-lg md:text-xl">
          Comparte las actividades, proyectos, obras y eventos de tu club y ayúdanos a mostrar el impacto de Rotary a través de los canales del Distrito 4281.
        </p>
      </div>
    </div>
  </section>
);

export default function RotaryEnAccionForm({ campaignRef }: { campaignRef?: string }) {
  const params = useParams<{ ref: string }>();
  const [search] = useSearchParams();
  const ref = campaignRef || params.ref || '';
  const qCampaign = search.get('campaign') || '';
  const qTopic = search.get('topic') || '';
  const qProgram = search.get('program') || '';
  const qArea = search.get('area') || '';
  const qToken = search.get('ca_token') || '';
  const qDraft = search.get('draft') || '';

  const [cfg, setCfg] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  // Paso 1
  const [tipo, setTipo] = useState('');
  // Paso 2
  const [area, setArea] = useState('');
  const [programa, setPrograma] = useState('');
  const [tema, setTema] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [impact, setImpact] = useState<Record<string, string>>({});
  const [activityDate, setActivityDate] = useState('');
  const [city, setCity] = useState('');
  const [location, setLocation] = useState('');
  // Paso 3
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [enlaces, setEnlaces] = useState<string[]>([]);
  const [nuevoEnlace, setNuevoEnlace] = useState('');
  const [district, setDistrict] = useState('');
  const [club, setClub] = useState('');
  const [clubes, setClubes] = useState<string[]>([]);
  const [nuevoClub, setNuevoClub] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY);
  const [phoneNational, setPhoneNational] = useState('');
  const [role, setRole] = useState('');
  const [consent, setConsent] = useState(false);
  // Preferencia independiente de la autorización (v4.1123): recibir reportes
  // de impacto. Opcional, sin premarcar, nunca bloquea el envío.
  const [quiereResultados, setQuiereResultados] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<any>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [assistQs, setAssistQs] = useState<string[]>([]);
  const [assistLoading, setAssistLoading] = useState(false);
  const [draftToken, setDraftToken] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [conPrefill, setConPrefill] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useSEO({ title: 'Rotary en Acción — Comparte lo que hace tu club', description: 'Tu club hace cosas extraordinarias. Cuéntanos qué está haciendo y nosotros te ayudamos a comunicarlo.' });

  const cargar = useCallback(async () => {
    setCargando(true); setErrorCarga(null);
    try {
      const qs = new URLSearchParams();
      if (ref || qCampaign) qs.set('campaign', ref || qCampaign);
      if (qTopic) qs.set('topic', qTopic);
      if (qProgram) qs.set('program', qProgram);
      if (qArea) qs.set('area', qArea);
      if (qToken) qs.set('ca_token', qToken);
      const r = await fetch(`${API}/rotary-en-accion/config?${qs.toString()}`);
      const data = await leerJson(r);
      if (!r.ok) throw new Error(data?.error || `El servidor respondió ${r.status}.`);
      setCfg(data);
      if (data.contextTax?.tema) setTema(data.contextTax.tema.slug);
      if (data.contextTax?.programa) setPrograma(data.contextTax.programa.slug);
      if (data.contextTax?.area) setArea(data.contextTax.area.slug);
      const p = data.prefill || {};
      if (p.senderName || p.senderEmail || p.district || p.club) setConPrefill(true);
      if (p.senderName) setSenderName(p.senderName);
      if (p.senderEmail) setSenderEmail(p.senderEmail);
      if (p.district) setDistrict(p.district);
      if (p.club) setClub(p.club);
      if (qDraft) {
        const rd = await fetch(`${API}/rotary-en-accion/drafts/${encodeURIComponent(qDraft)}`);
        if (rd.ok) {
          const jd = await leerJson(rd);
          const pl = jd.draft?.payload || {};
          if (pl.tipo) setTipo(pl.tipo); if (pl.title) setTitle(pl.title); if (pl.story) setStory(pl.story);
          if (pl.area) setArea(pl.area); if (pl.programa) setPrograma(pl.programa); if (pl.tema) setTema(pl.tema);
          if (pl.city) setCity(pl.city); if (pl.location) setLocation(pl.location); if (pl.activityDate) setActivityDate(pl.activityDate);
          if (pl.district) setDistrict(pl.district); if (pl.club) setClub(pl.club);
          if (pl.senderName) setSenderName(pl.senderName); if (pl.senderEmail) setSenderEmail(pl.senderEmail);
          if (pl.extraFields) setExtraFields(pl.extraFields); if (pl.impact) setImpact(pl.impact);
          if (pl.quiereResultados) setQuiereResultados(true);
          setDraftToken(qDraft);
        }
      }
    } catch (e: any) { setErrorCarga(e?.message || 'No se pudo cargar.'); }
    finally { setCargando(false); }
  }, [ref, qCampaign, qTopic, qProgram, qArea, qToken, qDraft]);

  useEffect(() => { cargar(); }, [cargar]);

  // Guardado progresivo local: avanzar, retroceder o una interrupción no
  // pierde el relato. El servidor guarda el borrador compartible aparte.
  useEffect(() => {
    if (cargando || enviado) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem('rotary-draft', JSON.stringify({
          tipo, title, story, area, programa, tema, tagsText, city, location, activityDate,
          district, club, clubes, senderName, senderEmail, role, extraFields, impact, quiereResultados,
        }));
      } catch { /* noop */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [tipo, title, story, area, programa, tema, tagsText, city, location, activityDate, district, club, clubes, senderName, senderEmail, role, extraFields, impact, quiereResultados, cargando, enviado]);

  useEffect(() => {
    if (!cargando && !tipo && !title && !story) {
      try {
        const raw = localStorage.getItem('rotary-draft');
        if (raw) {
          const d = JSON.parse(raw);
          if (d.tipo) setTipo(d.tipo); if (d.title) setTitle(d.title); if (d.story) setStory(d.story);
          if (d.area) setArea(d.area); if (d.programa) setPrograma(d.programa); if (d.tema) setTema(d.tema);
          if (d.tagsText) setTagsText(d.tagsText); if (d.city) setCity(d.city); if (d.location) setLocation(d.location);
          if (d.activityDate) setActivityDate(d.activityDate); if (d.district) setDistrict(d.district);
          if (d.club) setClub(d.club); if (Array.isArray(d.clubes)) setClubes(d.clubes);
          if (d.senderName) setSenderName(d.senderName); if (d.senderEmail) setSenderEmail(d.senderEmail);
          if (d.role) setRole(d.role); if (d.extraFields) setExtraFields(d.extraFields); if (d.impact) setImpact(d.impact);
          if (d.quiereResultados) setQuiereResultados(true);
        }
      } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando]);

  const MIN_FOTOS = 5;
  const rules = {
    minToSubmit: 5,
    recommended: 5,
    reelMin: 5,
    maxFiles: cfg?.photoRules?.maxFiles || MAX_FILES || 10,
  };
  const listos = adjuntos.filter((a) => a.estado === 'listo');
  const totalPhotos = adjuntos.filter((a) => a.estado !== 'error' && a.kind === 'image').length;
  const totalVideos = adjuntos.filter((a) => a.estado !== 'error' && a.kind === 'video').length;
  const advice = photoAdvice(totalPhotos, rules);
  const cond = fieldsForTipo(tipo);
  const distritos: any[] = cfg?.catalogs?.districts || [];
  const clubesDistrito: string[] = useMemo(() => {
    const d = distritos.find((x: any) => x.value === district || x.label === district);
    return Array.isArray(d?.clubs) ? d.clubs : [];
  }, [distritos, district]);
  const tipoNombre = (cfg?.taxonomies?.tipo || []).find((t: any) => t.slug === tipo)?.name || tipo;

  const agregarArchivos = (files: FileList | File[]) => {
    const arr = Array.from(files);
    setErrores([]);
    setAdjuntos((prev) => {
      const room = (rules.maxFiles || MAX_FILES) - prev.length;
      if (room <= 0) {
        setErrores([`Se pueden adjuntar hasta ${rules.maxFiles || MAX_FILES} archivos en total.`]);
        return prev;
      }
      const out = [...prev];
      const nuevosErrores: string[] = [];

      for (const f of arr.slice(0, Math.max(0, room))) {
        console.log('[EVIDENCE_SELECTED]', {
          fileName: f.name,
          fileType: f.type,
          fileSize: f.size,
        });

        const meta = checkFileMeta({ filename: f.name, contentType: f.type, size: f.size });
        if (!meta.ok) {
          const errText = meta.error || meta.errores?.[0] || 'Archivo no compatible';
          nuevosErrores.push(`${f.name}: ${errText}`);
          console.warn('[EVIDENCE_REJECTED]', { fileName: f.name, error: errText });
          continue;
        }

        if (out.some((a) => a.file.name === f.name && a.file.size === f.size)) {
          continue;
        }

        const isImg = meta.kind === 'image';
        const previewUrl = URL.createObjectURL(f);
        const item: Adjunto = {
          id: nuevoId(),
          file: f,
          previewUrl,
          kind: isImg ? 'image' : 'video',
          estado: 'pendiente',
          progreso: 0,
        };
        out.push(item);

        if (isImg) {
          const img = new Image();
          img.onload = () => {
            setAdjuntos((cur) => cur.map((a) => (a.id === item.id ? { ...a, width: img.width, height: img.height } : a)));
          };
          img.src = previewUrl;
        }
      }

      if (nuevosErrores.length > 0) {
        setErrores((e) => [...e, ...nuevosErrores]);
      }

      const totalImages = out.filter((x) => x.kind === 'image').length;
      const totalVids = out.filter((x) => x.kind === 'video').length;
      console.log('[EVIDENCE_STATE]', {
        totalFiles: out.length,
        totalImages,
        totalVideos: totalVids,
      });

      return out;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      agregarArchivos(e.dataTransfer.files);
    }
  };

  const eliminarAdjunto = (id: string) => {
    setAdjuntos((prev) => {
      const item = prev.find((x) => x.id === id);
      if (item?.previewUrl) {
        try { URL.revokeObjectURL(item.previewUrl); } catch { /* noop */ }
      }
      const next = prev.filter((x) => x.id !== id);
      const totalImages = next.filter((x) => x.kind === 'image').length;
      const totalVids = next.filter((x) => x.kind === 'video').length;
      console.log('[EVIDENCE_STATE]', {
        totalFiles: next.length,
        totalImages,
        totalVideos: totalVids,
      });
      return next;
    });
  };

  const subirUno = async (a: Adjunto): Promise<string> => {
    console.log('[UPLOAD_START]', { fileName: a.file.name });
    const mime = a.file.type || (a.kind === 'image' ? 'image/jpeg' : 'video/mp4');
    const r = await fetch(`${API}/rotary-en-accion/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: cfg?.campaign?.id || undefined,
        contentType: mime,
        filename: a.file.name,
        size: a.file.size,
      }),
    });
    const data = await leerJson(r);
    if (!r.ok || !data.ok) {
      const errMsg = data?.error || data?.errores?.[0] || 'No se pudo preparar la carga.';
      console.error('[UPLOAD_ERROR]', { fileName: a.file.name, status: r.status, error: errMsg });
      throw new Error(errMsg);
    }
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      xhr.setRequestHeader('Content-Type', mime);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setAdjuntos((prev) => prev.map((x) => (x.id === a.id ? { ...x, estado: 'subiendo', progreso: pct } : x)));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('[UPLOAD_SUCCESS]', { fileName: a.file.name, storagePath: data.key });
          resolve();
        } else {
          console.error('[UPLOAD_ERROR]', { fileName: a.file.name, status: xhr.status, error: xhr.statusText });
          reject(new Error(`Carga fallida (${xhr.status}).`));
        }
      };
      xhr.onerror = () => {
        console.error('[UPLOAD_ERROR]', { fileName: a.file.name, status: 'network_error', error: 'Conexión interrumpida' });
        reject(new Error('Se cortó la conexión. Tus archivos pendientes se reintentan al enviar.'));
      };
      xhr.send(a.file);
    });
    return data.key;
  };

  const pedirAyudaIA = async () => {
    setAssistLoading(true);
    try {
      const r = await fetch(`${API}/rotary-en-accion/assist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, fields: { lugar: city || location } }),
      });
      const d = await leerJson(r);
      if (r.ok) setAssistQs(d.preguntas || []);
    } catch { /* la ayuda es opcional */ }
    finally { setAssistLoading(false); }
  };

  const guardarBorrador = async () => {
    setDraftSaving(true);
    try {
      const r = await fetch(`${API}/rotary-en-accion/drafts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: draftToken || undefined, campaignId: cfg?.campaign?.id || undefined, contactEmail: senderEmail || undefined,
          payload: { tipo, title, story, area, programa, tema, city, location, activityDate, district, club, senderName, senderEmail, extraFields, impact, quiereResultados },
        }),
      });
      const d = await leerJson(r);
      if (r.ok) setDraftToken(d.token);
    } catch { /* noop */ }
    finally { setDraftSaving(false); }
  };

  const validar = (s: number): string | null => {
    if (s === 0 && !tipo) return 'Elegí qué quieres compartir para continuar.';
    if (s === 2) {
      if (totalPhotos < MIN_FOTOS) {
        return `Agrega al menos 5 fotografías para continuar (has seleccionado ${totalPhotos}).`;
      }
      if (!senderName.trim()) return 'Escribí tu nombre.';
      if (!senderEmail.trim()) return 'Escribí tu correo electrónico.';
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(senderEmail.trim())) return 'El correo electrónico no parece válido.';
      if (!consent) return 'Autorizá el uso del contenido para poder enviar: la necesitamos para publicar tu historia.';
    }
    if (cfg?.requireStory && (s === 1 || s === 3) && story.trim().length < 60) return 'Contanos un poco más: con dos o tres frases el equipo puede redactar tu historia.';
    return null;
  };

  const irA = (s: number) => {
    if (s > step) {
      const m = validar(step);
      if (m) { setErrores([m]); return; }
    }
    setErrores([]);
    setStep(s);
    window.scrollTo({ top: 0 });
  };

  const enviar = async () => {
    setErrores([]);
    const m = validar(2);
    if (m) { setErrores([m]); setStep(2); return; }
    const pendientes = adjuntos.filter((a) => a.estado !== 'listo' && a.estado !== 'error');
    try {
      setEnviando(true);
      const subidos: Array<{ key: string; filename: string; contentType: string }> = listos.map((a) => ({ key: a.key!, filename: a.file.name, contentType: a.file.type }));
      for (const a of pendientes) {
        setAdjuntos((prev) => prev.map((x) => (x.id === a.id ? { ...x, estado: 'subiendo' as const, progreso: 0 } : x)));
        try {
          const key = await subirUno(a);
          setAdjuntos((prev) => prev.map((x) => (x.id === a.id ? { ...x, estado: 'listo' as const, progreso: 100, key } : x)));
          subidos.push({ key, filename: a.file.name, contentType: a.file.type });
        } catch (err: any) {
          setAdjuntos((prev) => prev.map((x) => (x.id === a.id ? { ...x, estado: 'error' as const, error: err?.message } : x)));
          throw new Error(`${a.file.name}: ${err?.message || 'no se pudo subir'}`);
        }
      }
      const extrasTexto = Object.entries(extraFields).filter(([, v]) => String(v).trim()).map(([k, v]) => `${EXTRA_LABELS[k] || k}: ${v}`).join('\n');
      const impactNums: Record<string, any> = {};
      for (const [k, v] of Object.entries(impact)) {
        if (!String(v).trim()) continue;
        const n = Number(v);
        impactNums[k] = String(v).trim() !== '' && !isNaN(n) ? n : String(v).trim();
      }
      const enlacesValidos = enlaces.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 5);
      const r = await fetch(`${API}/rotary-en-accion/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignSlug: cfg?.campaign?.slug || undefined,
          ca_token: qToken || undefined,
          utm_source: new URLSearchParams(window.location.search).get('utm_source') || undefined,
          utm_medium: new URLSearchParams(window.location.search).get('utm_medium') || undefined,
          utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign') || undefined,
          senderName, senderEmail, senderPhoneCountry: phoneCountry,
          senderPhoneNational: phoneNational.trim() ? phoneNational.trim() : '',
          senderPhoneDial: phoneNational.trim() ? (findCountry(phoneCountry)?.dial || '') : '',
          district, club, role, title,
          description: title, location, city, activityDate, story,
          extra: extrasTexto, consent, notifyUpdates: quiereResultados,
          contentType: tipo, areaFocus: area, program: programa, topic: tema,
          tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
          impact: impactNums, mainClub: club,
          clubs: [...clubes, ...(club && !clubes.includes(club) ? [club] : [])].map((name) => ({ name, source: 'manual' as const })),
          hasPosts: enlacesValidos.length > 0,
          posts: enlacesValidos.map((url) => ({ platform: 'otra', platformOther: 'Enlace relacionado', url })),
          files: subidos,
        }),
      });
      const data = await leerJson(r);
      if (!r.ok) throw new Error(data?.error || 'No se pudo enviar.');
      setEnviado(data);
      try { localStorage.removeItem('rotary-draft'); } catch { /* noop */ }
      if (draftToken) fetch(`${API}/rotary-en-accion/drafts/${draftToken}`, { method: 'DELETE' }).catch(() => {});
      window.scrollTo({ top: 0 });
    } catch (err: any) { setErrores([err?.message || 'No se pudo enviar el material. Revisá tu conexión e intentá de nuevo.']); }
    finally { setEnviando(false); }
  };

  if (cargando) return (<Marco><div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div></Marco>);
  if (errorCarga || !cfg) return (<Marco><div className="flex items-center justify-center px-4 py-20"><div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-sm border border-gray-100"><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" /><h1 className="text-lg font-bold text-gray-800 mt-4">No se pudo abrir Rotary en Acción</h1><p className="text-sm text-gray-500 mt-2">{errorCarga}</p><button onClick={cargar} className="mt-5 px-5 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold">Reintentar</button></div></div></Marco>);

  const tipos: any[] = cfg.taxonomies?.tipo || [];
  const areas: any[] = cfg.taxonomies?.area || [];
  const programas: any[] = cfg.taxonomies?.programa || [];
  const temas: any[] = cfg.taxonomies?.tema || [];
  const impactoCargado = Object.entries(impact).filter(([, v]) => String(v).trim());

  const Bloque: React.FC<{ titulo: string; paso: number; children: React.ReactNode }> = ({ titulo, paso, children }) => (
    <div className="border-b border-gray-100 last:border-0 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-400">{titulo}</h3>
        <button onClick={() => irA(paso)} className="flex items-center gap-1 text-xs font-bold text-rotary-blue"><Pencil className="w-3.5 h-3.5" /> Editar</button>
      </div>
      {children}
    </div>
  );

  return (
    <Marco>
      <Cabecera />
      <div className="max-w-2xl mx-auto px-4 py-10 md:py-12 pb-20 space-y-4">
        {!enviado && (
          <nav aria-label="Progreso" className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {PASOS.map((label, i) => (
                <button key={label} onClick={() => irA(i)} disabled={i > step} aria-current={i === step ? 'step' : undefined}
                  className={`flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap px-2 py-1 rounded-full ${i === step ? 'bg-rotary-blue text-white' : i < step ? 'text-rotary-blue' : 'text-gray-400 disabled:opacity-60'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i === step ? 'bg-white/25' : i < step ? 'bg-rotary-blue text-white' : 'bg-gray-100'}`}>{i + 1}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <p className="sm:hidden text-[11px] font-bold text-gray-400 mt-1.5">Paso {step + 1} de 4</p>
          </nav>
        )}

        {/* PASO 1 */}
        {step === 0 && !enviado && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">¿Qué quieres compartir con Rotary?</h2>
            <p className="text-sm text-gray-500 mt-1">Elegí una opción. El formulario se adapta a lo que elijas.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4" role="radiogroup" aria-label="Tipo de contenido">
              {tipos.map((t: any) => (
                <button key={t.slug} role="radio" aria-checked={tipo === t.slug} onClick={() => setTipo(t.slug)}
                  className={`rounded-2xl border-2 p-3 text-left transition-colors min-h-[88px] ${tipo === t.slug ? 'border-rotary-blue bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className="text-2xl" aria-hidden>{t.icon || '✨'}</div>
                  <div className="text-xs font-bold text-gray-700 mt-1">{t.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 2 */}
        {step === 1 && !enviado && (
          <div className={TARJETA + ' space-y-5'}>
            <div>
              <h2 className="text-lg font-black text-gray-800">Cuéntanos la historia</h2>
              <p className="text-sm text-gray-500 mt-1">Tu club hace cosas extraordinarias. Cuéntanos qué está haciendo y nosotros te ayudamos a comunicarlo.</p>
            </div>
            <div><Etiqueta htmlFor="rea-titulo" tip="titulo">Título o nombre de la iniciativa</Etiqueta>
              <input id="rea-titulo" className={CAMPO} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Jornada de reforestación en…" aria-describedby="tip-titulo" /></div>
            <div><Etiqueta htmlFor="rea-historia" tip="historia">Cuéntanos qué hizo tu club</Etiqueta>
              <textarea id="rea-historia" className={`${CAMPO} min-h-[140px]`} value={story} onChange={(e) => setStory(e.target.value)} placeholder="Cuéntalo con tus palabras…" aria-describedby="tip-historia" /></div>
            <button onClick={pedirAyudaIA} disabled={assistLoading} className="flex items-center gap-2 text-xs font-bold text-rotary-blue border border-blue-100 rounded-xl px-3 py-2.5">
              {assistLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Ayúdame a contarlo mejor
            </button>
            {assistQs.length > 0 && (
              <ul className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1.5 text-sm text-amber-900">
                {assistQs.map((q, i) => <li key={i}>· {q}</li>)}
              </ul>
            )}
            {/* Bloque de emergencia: solo cuando el tipo lo justifica */}
            {tipo === 'emergencia' && (
              <div className="bg-red-50/60 border border-red-100 rounded-2xl p-4">
                <span className={ROTULO}>Información de la emergencia (opcional)</span>
                <div className="grid sm:grid-cols-2 gap-3">
                  {['tipoEmergencia', 'zonaAfectada', 'ayudaEntregada', 'necesidades'].map((k) => (
                    <div key={k}><Etiqueta tip={k}>{EXTRA_LABELS[k] || k}</Etiqueta>
                      <input className={CAMPO} value={extraFields[k] || ''} onChange={(e) => setExtraFields({ ...extraFields, [k]: e.target.value })} aria-describedby={`tip-${k}`} /></div>
                  ))}
                </div>
              </div>
            )}
            {(() => {
              // «Aliados» vive en el bloque de relación; acá no se repite.
              const generales = cond.extra.filter((k) => k !== 'aliados' && !(tipo === 'emergencia' && EMERGENCIA_KEYS.has(k)));
              const anchas = generales.filter((k) => ANCHO_COMPLETO.has(k));
              const pares = enPares(generales.filter((k) => !ANCHO_COMPLETO.has(k)));
              if (!generales.length) return null;
              return (
                <>
                  {anchas.map((k) => (
                    <div key={k}><Etiqueta tip={k}>{EXTRA_LABELS[k] || k}</Etiqueta>
                      <input className={CAMPO} value={extraFields[k] || ''} onChange={(e) => setExtraFields({ ...extraFields, [k]: e.target.value })} aria-describedby={`tip-${k}`} /></div>
                  ))}
                  {pares.map((par, i) => (
                    <div key={i} className={par.length === 2 ? 'grid sm:grid-cols-2 gap-3' : ''}>
                      {par.map((k) => (
                        <div key={k}><Etiqueta tip={k}>{EXTRA_LABELS[k] || k}</Etiqueta>
                          <input className={CAMPO} value={extraFields[k] || ''} onChange={(e) => setExtraFields({ ...extraFields, [k]: e.target.value })} aria-describedby={`tip-${k}`} /></div>
                      ))}
                    </div>
                  ))}
                </>
              );
            })()}
            <div className="grid grid-cols-2 gap-3">
              <div><Etiqueta tip="fecha">Fecha de la actividad</Etiqueta><input type="date" className={CAMPO} value={activityDate} onChange={(e) => setActivityDate(e.target.value)} aria-describedby="tip-fecha" /></div>
              <div><Etiqueta tip="ciudad">Ciudad / municipio</Etiqueta><input className={CAMPO} value={city} onChange={(e) => setCity(e.target.value)} aria-describedby="tip-ciudad" /></div>
            </div>
            {cond.impacto.length > 0 && (
              <div>
                <span className={ROTULO}>Resultados o impacto (opcional)<InfoTip tipKey="impacto" /></span>
                <div className="grid grid-cols-2 gap-3">
                  {cond.impacto.map((k) => (
                    <div key={k}><label className="sr-only" htmlFor={`rea-imp-${k}`}>{IMPACT_META[k]?.label || k}</label>
                      <input id={`rea-imp-${k}`} className={CAMPO} inputMode={IMPACT_META[k]?.kind === 'text' ? 'text' : 'numeric'} value={impact[k] || ''} onChange={(e) => setImpact({ ...impact, [k]: e.target.value })} placeholder={IMPACT_META[k]?.label || k} aria-label={IMPACT_META[k]?.label || k} /></div>
                  ))}
                </div>
              </div>
            )}
            <details className="bg-gray-50 rounded-2xl px-4 py-3">
              <summary className="text-xs font-bold text-gray-500 cursor-pointer">Relación con programas y temas (opcional)</summary>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <div><Etiqueta tip="area">Área de interés</Etiqueta>
                  <select className={CAMPO} value={area} onChange={(e) => setArea(e.target.value)} aria-describedby="tip-area"><option value="">Sin área específica</option>{areas.map((a: any) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
                <div><Etiqueta tip="programa">Programa</Etiqueta>
                  <select className={CAMPO} value={programa} onChange={(e) => setPrograma(e.target.value)} aria-describedby="tip-programa"><option value="">Sin programa específico</option>{programas.map((a: any) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
                <div><Etiqueta tip="tema">Temática</Etiqueta>
                  <select className={CAMPO} value={tema} onChange={(e) => setTema(e.target.value)} aria-describedby="tip-tema"><option value="">Sin temática específica</option>{temas.map((a: any) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
                <div><Etiqueta tip="tags">Etiquetas (comas)</Etiqueta>
                  <input className={CAMPO} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="juventud, navidad" aria-describedby="tip-tags" /></div>
                <div className="sm:col-span-2"><Etiqueta tip="aliados">Aliados (opcional)</Etiqueta>
                  <input className={CAMPO} value={extraFields.aliados || ''} onChange={(e) => setExtraFields({ ...extraFields, aliados: e.target.value })} placeholder="Organizaciones o empresas que apoyaron" aria-describedby="tip-aliados" /></div>
              </div>
            </details>
          </div>
        )}

        {/* PASO 3 */}
        {step === 2 && !enviado && (
          <div className={TARJETA + ' space-y-5'}>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black text-gray-800">Evidencias y contacto</h2>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  totalPhotos >= MIN_FOTOS
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {totalPhotos >= MIN_FOTOS
                    ? `✓ ${totalPhotos} fotos seleccionadas (mínimo cumplido)`
                    : `${totalPhotos} de ${MIN_FOTOS} fotografías mínimas`}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Requerimos un mínimo de <strong>5 fotografías</strong> para publicar la actividad. Puedes adjuntar videos como complemento (los videos no reemplazan las fotos mínimas).
              </p>
            </div>

            {/* Dropzone interactivo */}
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-rotary-blue bg-blue-50/70 scale-[1.01]'
                  : 'border-gray-200 hover:border-rotary-blue hover:bg-gray-50/50'
              }`}
            >
              <Upload className={`w-9 h-9 mx-auto transition-colors ${dragActive ? 'text-rotary-blue animate-bounce' : 'text-gray-400'}`} />
              <div className="text-sm font-bold text-gray-800 mt-2">
                {dragActive ? 'Soltá las fotos o videos acá' : 'Tocá acá para elegir, o arrastrá las fotos y videos'}
              </div>
              <div className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                Formatos: JPG, PNG, WEBP, MP4, MOV. Mínimo 5 fotos obligatorias. En celular abre la cámara o la galería.
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  agregarArchivos(e.target.files);
                }
                e.target.value = '';
              }}
            />

            {/* Galería de evidencias seleccionadas */}
            {adjuntos.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                  <span>Evidencias cargadas ({adjuntos.length} de máx. {rules.maxFiles})</span>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex items-center gap-1 text-rotary-blue hover:underline font-bold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar más evidencias
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {adjuntos.map((a) => (
                    <div
                      key={a.id}
                      className="group relative rounded-2xl overflow-hidden bg-gray-900/5 border border-gray-200 aspect-square flex flex-col justify-between p-2 shadow-xs"
                    >
                      {/* Media preview */}
                      <div className="absolute inset-0 z-0">
                        {a.kind === 'image' ? (
                          <img
                            src={a.previewUrl}
                            alt={a.file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-white relative">
                            <video
                              src={a.previewUrl}
                              className="w-full h-full object-cover opacity-60"
                              muted
                              playsInline
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="bg-black/60 rounded-full p-2 backdrop-blur-xs">
                                <Film className="w-6 h-6 text-white" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Header de la tarjeta: Badge de tipo y botón eliminar */}
                      <div className="relative z-10 flex items-center justify-between w-full">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shadow-xs ${
                          a.kind === 'image'
                            ? 'bg-blue-600/90 text-white'
                            : 'bg-purple-600/90 text-white'
                        }`}>
                          {a.kind === 'image' ? 'Foto' : 'Video'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            eliminarAdjunto(a.id);
                          }}
                          aria-label={`Eliminar ${a.file.name}`}
                          className="bg-black/70 hover:bg-red-600 text-white rounded-full p-1.5 transition-colors shadow-sm cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Overlays de estado de carga */}
                      {a.estado === 'subiendo' && (
                        <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white px-3 text-center">
                          <Loader2 className="w-5 h-5 animate-spin text-rotary-blue mb-1" />
                          <span className="text-xs font-bold">{a.progreso}%</span>
                          <div className="w-full bg-white/20 rounded-full h-1.5 mt-2 overflow-hidden">
                            <div className="bg-rotary-blue h-full transition-all" style={{ width: `${a.progreso}%` }} />
                          </div>
                        </div>
                      )}

                      {a.estado === 'error' && (
                        <div className="absolute inset-0 z-20 bg-red-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-white p-2 text-center">
                          <AlertTriangle className="w-5 h-5 text-amber-300 mb-1" />
                          <span className="text-[11px] font-bold text-amber-200 line-clamp-2 leading-tight">
                            {a.error || 'Error. Se reintenta al enviar.'}
                          </span>
                        </div>
                      )}

                      {/* Footer de la tarjeta: Nombre y tamaño */}
                      <div className="relative z-10 w-full bg-black/75 backdrop-blur-xs text-white rounded-lg px-2 py-1">
                        <p className="text-[11px] font-medium truncate" title={a.file.name}>
                          {a.file.name}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-gray-300">
                          <span>{formatBytes(a.file.size)}</span>
                          {a.estado === 'listo' && <span className="text-emerald-400 font-bold">✓ Listo</span>}
                          {a.estado === 'pendiente' && <span className="text-gray-300">Pendiente</span>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Tile adicional "Agregar más" en la cuadrícula si hay espacio */}
                  {adjuntos.length < (rules.maxFiles || MAX_FILES) && (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="rounded-2xl border-2 border-dashed border-gray-300 hover:border-rotary-blue hover:bg-blue-50/30 flex flex-col items-center justify-center p-4 aspect-square transition-all cursor-pointer group"
                    >
                      <Plus className="w-6 h-6 text-gray-400 group-hover:text-rotary-blue transition-colors" />
                      <span className="text-xs font-bold text-gray-600 group-hover:text-rotary-blue mt-1">Agregar más</span>
                    </button>
                  )}
                </div>

                {/* Aviso si faltan fotos para llegar a las 5 */}
                {totalPhotos < MIN_FOTOS && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Faltan {MIN_FOTOS - totalPhotos} fotografía(s):</strong> Has seleccionado {totalPhotos} de las 5 requeridas. Por favor selecciona al menos 5 fotografías para poder continuar al paso de envío.
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <Etiqueta htmlFor="rea-enlaces" tip="enlaces">Documentos o enlaces relacionados (opcional)</Etiqueta>
              <div className="flex flex-wrap gap-1.5 mb-2">{enlaces.map((u) => <span key={u} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1 max-w-full"><span className="truncate max-w-[220px]">{u}</span><button onClick={() => setEnlaces(enlaces.filter((x) => x !== u))} aria-label="Quitar enlace"><X className="w-3 h-3" /></button></span>)}</div>
              <div className="flex gap-2"><input id="rea-enlaces" className={CAMPO} value={nuevoEnlace} onChange={(e) => setNuevoEnlace(e.target.value)} placeholder="https://…" inputMode="url" aria-describedby="tip-enlaces" />
                <button onClick={() => { const u = nuevoEnlace.trim(); if (u && enlaces.length < 5) setEnlaces([...enlaces, u]); setNuevoEnlace(''); }} className="px-4 rounded-xl bg-gray-100 font-bold" aria-label="Agregar enlace"><Plus className="w-4 h-4" /></button></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Etiqueta tip="distrito">Distrito</Etiqueta>
                <select className={CAMPO} value={district} onChange={(e) => { setDistrict(e.target.value); setClub(''); setClubes([]); }} aria-describedby="tip-distrito">
                  <option value="">Seleccionar…</option>{distritos.map((d: any) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select></div>
              <div><Etiqueta htmlFor="rea-club" tip="club">Club Rotario</Etiqueta>
                <input id="rea-club" className={CAMPO} list="clubes-distrito" value={club} onChange={(e) => setClub(e.target.value)} placeholder="Nombre del club" aria-describedby="tip-club" />
                <datalist id="clubes-distrito">{clubesDistrito.map((c) => <option key={c} value={c} />)}</datalist></div>
            </div>
            <div>
              <Etiqueta tip="clubes">Otros clubes participantes (opcional)</Etiqueta>
              <div className="flex flex-wrap gap-1.5 mb-2">{clubes.map((c) => <span key={c} className="bg-blue-50 text-blue-800 text-xs font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1">{c}<button onClick={() => setClubes(clubes.filter((x) => x !== c))} aria-label="Quitar club"><X className="w-3 h-3" /></button></span>)}</div>
              <div className="flex gap-2"><input className={CAMPO} list="clubes-distrito" value={nuevoClub} onChange={(e) => setNuevoClub(e.target.value)} placeholder="Agregar club…" />
                <button onClick={() => { if (nuevoClub.trim() && !clubes.includes(nuevoClub.trim())) setClubes([...clubes, nuevoClub.trim()]); setNuevoClub(''); }} className="px-4 rounded-xl bg-gray-100 font-bold" aria-label="Agregar club"><Plus className="w-4 h-4" /></button></div>
            </div>
            {conPrefill && <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">Completamos algunos datos con información del ecosistema. Verifícalos antes de enviar.</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Etiqueta htmlFor="rea-nombre" tip="nombre">Nombre de quien envía</Etiqueta><input id="rea-nombre" className={CAMPO} value={senderName} onChange={(e) => setSenderName(e.target.value)} autoComplete="name" aria-describedby="tip-nombre" /></div>
              <div><Etiqueta htmlFor="rea-cargo" tip="cargo">Cargo o relación con el club</Etiqueta><input id="rea-cargo" className={CAMPO} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Presidente, socio…" aria-describedby="tip-cargo" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Etiqueta htmlFor="rea-email" tip="email">Correo electrónico</Etiqueta><input id="rea-email" type="email" className={CAMPO} value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} autoComplete="email" aria-describedby="tip-email" /></div>
              <div><Etiqueta htmlFor="rea-tel" tip="telefono">Teléfono / WhatsApp</Etiqueta>
                <div className="flex gap-2 items-stretch">
                  <CountryPicker value={phoneCountry} onChange={setPhoneCountry} />
                  <input id="rea-tel" className={`${CAMPO} flex-1 min-w-0`} value={phoneNational} onChange={(e) => setPhoneNational(e.target.value)} inputMode="tel" autoComplete="tel-national" aria-describedby="tip-telefono" placeholder="300 123 4567" />
                </div></div>
            </div>
            <div className="space-y-3">
              <label className="flex gap-3 items-start bg-gray-50 rounded-2xl p-4 cursor-pointer">
                <input type="checkbox" checked={quiereResultados} onChange={(e) => setQuiereResultados(e.target.checked)} className="mt-1 w-5 h-5 shrink-0 accent-[#0c3c7c]" />
                <span className="text-sm text-gray-700"><b>Quiero recibir los resultados de esta historia</b>
                  <span className="block text-gray-500 text-[13px] mt-0.5">Deseo recibir por correo electrónico reportes o actualizaciones sobre el alcance, difusión y métricas de impacto que genere esta historia en los canales digitales del Distrito 4281.</span></span>
              </label>
              <label className="flex gap-3 items-start bg-gray-50 rounded-2xl p-4 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 w-5 h-5 shrink-0 accent-[#0c3c7c]" />
                <span className="text-sm text-gray-700"><b>Autorizo el uso del contenido</b>
                  <span className="block text-gray-500 text-[13px] mt-0.5">Autorizo el tratamiento y uso del contenido, fotografías, videos e información que envío a través de Rotary en Acción para fines de comunicación y difusión institucional, de acuerdo con los <a href="https://my.rotary.org/terms-of-use" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline font-bold">Términos de Servicio</a> y la <a href="https://my.rotary.org/privacy-policy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline font-bold">Política de Privacidad</a> aplicables.</span>
                  <span className="block text-gray-400 text-xs mt-1">La necesitamos para poder publicar tu historia.</span></span>
              </label>
            </div>
            <button onClick={guardarBorrador} disabled={draftSaving} className="flex items-center gap-2 text-xs font-bold text-gray-500">
              {draftSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar y continuar después
            </button>
            {draftToken && <div className="text-xs text-gray-500 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Tu enlace para continuar: <code className="bg-gray-100 px-1.5 py-0.5 rounded">?draft={draftToken}</code></div>}
          </div>
        )}

        {/* PASO 4 */}
        {step === 3 && !enviado && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">Revisá y enviá</h2>
            <p className="text-sm text-gray-500 mt-1">Todo en orden antes de enviar a Rotary en Acción.</p>
            <div className="mt-2">
              <Bloque titulo="Tipo de contenido" paso={0}><p className="text-sm font-bold">{tipoNombre || '—'}</p></Bloque>
              <Bloque titulo="Historia" paso={1}>
                <p className="text-sm font-bold">{title || 'Sin título'}</p>
                {story && <p className="text-sm text-gray-600 mt-1 line-clamp-4">{story}</p>}
                {(activityDate || city || location) && <p className="text-xs text-gray-400 mt-1">{[activityDate, city, location].filter(Boolean).join(' · ')}</p>}
                {impactoCargado.length > 0 && <p className="text-xs text-gray-500 mt-1">{impactoCargado.map(([k, v]) => `${IMPACT_META[k]?.label || k}: ${v}`).join(' · ')}</p>}
              </Bloque>
              <Bloque titulo="Evidencias y contacto" paso={2}>
                <div className="space-y-2">
                  <p className="text-sm">
                    <strong>{totalPhotos} fotografía(s)</strong> {totalVideos > 0 && `· ${totalVideos} video(s)`} · {club || 'Sin club'} · {senderName} ({senderEmail})
                  </p>
                  {adjuntos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {adjuntos.slice(0, 10).map((a) => (
                        <div key={a.id} className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 relative shadow-xs">
                          {a.kind === 'image' ? (
                            <img src={a.previewUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-slate-800 flex items-center justify-center text-white">
                              <Film className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      ))}
                      {adjuntos.length > 10 && (
                        <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                          +{adjuntos.length - 10}
                        </div>
                      )}
                    </div>
                  )}
                  {quiereResultados && <p className="text-xs text-gray-500 mt-1">Quiere recibir los resultados de la historia.</p>}
                </div>
              </Bloque>
            </div>
            <button onClick={enviar} disabled={enviando} className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-emerald-600 text-white text-base font-black min-h-[56px] disabled:opacity-60">
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />} Enviar a Rotary en Acción
            </button>
            <p className="text-xs text-gray-400 mt-3 text-center">Tu solicitud entra en “Recibido”. Nada se publica solo: el equipo la revisa y te avisa al publicarla.</p>
          </div>
        )}

        {/* Confirmación */}
        {enviado && (
          <div className={TARJETA + ' text-center'}>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-black text-gray-800 mt-3">Gracias por compartir lo que hace tu club</h2>
            <dl className="text-sm mt-4 space-y-1.5 text-left max-w-sm mx-auto">
              <div className="flex gap-2"><dt className="text-gray-400 w-32">N.º de solicitud</dt><dd className="font-mono font-bold">{String(enviado.id).slice(0, 8)}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Tipo</dt><dd className="font-bold">{tipoNombre || '—'}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Actividad</dt><dd className="font-bold">{title || '—'}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Club</dt><dd>{club || '—'}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Material</dt><dd>{adjuntos.length} archivo(s)</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Estado inicial</dt><dd>Recibido</dd></div>
            </dl>
            <p className="text-xs text-gray-500 mt-4">Qué sigue: el equipo revisa tu historia, la convierte en contenido y te envía el enlace cuando se publique.</p>
            {enviado.warnings?.length > 0 && <div className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mt-4 text-left">{enviado.warnings.slice(0, 3).map((w: string, i: number) => <div key={i}>· {w}</div>)}</div>}
          </div>
        )}

        {errores.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 space-y-1" role="alert">{errores.map((e, i) => <div key={i}>· {e}</div>)}</div>
        )}

        {/* Navegación */}
        {!enviado && (
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => irA(Math.max(0, step - 1))} disabled={step === 0} className="flex items-center gap-1.5 px-4 py-3 rounded-xl border text-sm font-bold text-gray-500 disabled:opacity-40 min-h-[52px] bg-white"><ArrowLeft className="w-4 h-4" /> Atrás</button>
            {step < 3 ? (
              <button onClick={() => irA(step + 1)} className="flex items-center gap-1.5 px-6 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold min-h-[52px]">Siguiente <ArrowRight className="w-4 h-4" /></button>
            ) : (
              <button onClick={enviar} disabled={enviando} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold min-h-[52px] disabled:opacity-60">
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Enviar a Rotary en Acción
              </button>
            )}
          </div>
        )}
        <p className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1"><Users className="w-3 h-3" /> Rotary en Acción · Distrito 4281 <MapPin className="w-3 h-3" /></p>
      </div>
    </Marco>
  );
}
