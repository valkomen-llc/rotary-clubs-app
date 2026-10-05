import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Upload, X, Image as ImageIcon, Film, Loader2, CheckCircle2,
  AlertTriangle, MapPin, Users, Plus, ArrowLeft, ArrowRight, Sparkles, Save, Link2, Pencil, ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { useSEO } from '../../hooks/useSEO';
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, flagEmoji } from '../../lib/countryPhones';
import { toast } from 'sonner';
import Navbar from '../../sections/Navbar';
import Footer from '../../sections/Footer';
import { ACCEPT_ATTR, MIN_PHOTOS, MAX_PHOTOS, MAX_VIDEOS, checkFileMeta, overweightMessage, DUPLICATE_MESSAGE, duplicateKey, partialFileHash, countValidPhotos } from '../../lib/contentSubmissionSpec';
import {
  fieldsForTipo, IMPACT_META, EXTRA_LABELS, photoAdvice,
  DEFAULT_TIPOS, DEFAULT_AREAS, DEFAULT_PROGRAMAS, DEFAULT_TEMAS,
} from '../../lib/rotaryEnAccionSpec';

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
const nuevoId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const PASOS = ['Qué quieres compartir', 'Cuéntanos', 'Evidencias y contacto', 'Revisar y enviar'];

const leerJson = async (r: Response) => {
  const texto = await r.text();
  try { return JSON.parse(texto); } catch {
    throw new Error(`El servidor respondió ${r.status} en vez de JSON.`);
  }
};

type Adjunto = {
  id: string;
  file: File;
  kind: 'image' | 'video';
  preview: string | null;
  key?: string;
  // pending: en cola · uploading: subiendo · uploaded: carga completada ·
  // error: falló y se puede reintentar · too-heavy: supera el tope (no se
  // sube ni se reintenta) · duplicate: ya agregado (no se sube ni se reintenta)
  estado: 'pending' | 'uploading' | 'uploaded' | 'error' | 'too-heavy' | 'duplicate';
  progreso: number;
  error?: string;
  width?: number;
  height?: number;
  hash?: string;
};

// Lo rechazado (demasiado pesado/duplicado) no ocupa cupo: nunca se sube.
const CUENTA_CUPO = ['pending', 'uploading', 'uploaded', 'error'] as const;
const ocupaCupo = (estado: string): boolean => (CUENTA_CUPO as readonly string[]).includes(estado);

const formatoTamano = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  fotos: 'Con 1 fotografía puedes enviar. Con 5 o más habilitas el Reel automático.',
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
  const adjuntosRef = useRef<Adjunto[]>([]);
  adjuntosRef.current = adjuntos;
  const xhrMapRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const hashesRef = useRef<Map<string, string>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  // Escribe el estado en la referencia Y en el estado de React, en el mismo
  // tick: la bomba de la cola lee la referencia para no arrancar dos veces
  // lo mismo, y `setAdjuntos` solo no alcanzaría (es asíncrono).
  const aplicarEstado = useCallback((id: string, patch: Partial<Adjunto>) => {
    adjuntosRef.current = adjuntosRef.current.map((x) => (x.id === id ? { ...x, ...patch } : x));
    setAdjuntos((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  // Limpieza al desmontar: abortar cargas en vuelo y revocar Object URLs
  useEffect(() => {
    return () => {
      xhrMapRef.current.forEach((xhr) => {
        try { xhr.abort(); } catch { /* noop */ }
      });
      xhrMapRef.current.clear();
      adjuntosRef.current.forEach((a) => {
        if (a.preview) {
          try { URL.revokeObjectURL(a.preview); } catch { /* noop */ }
        }
      });
    };
  }, []);

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

  const rules = cfg?.photoRules || { minToSubmit: 5, recommended: 5, reelMin: 5, maxFiles: 11 };
  const selectedImages = adjuntos.filter((a) => a.kind === 'image');
  const uploadedImages = adjuntos.filter((a) => a.kind === 'image' && a.estado === 'uploaded');
  const uploadedVideos = adjuntos.filter((a) => a.kind === 'video' && a.estado === 'uploaded');
  const enCupo = adjuntos.filter((a) => ocupaCupo(a.estado));
  const videos = adjuntos.filter((a) => a.kind === 'video');
  // El mínimo cuenta ÚNICAMENTE lo cargado con éxito: 5 elegidas con 1
  // fallida son 4 válidas y falta 1 (v4.1165).
  const fotosValidas = countValidPhotos(adjuntos);
  const advice = photoAdvice(selectedImages.length, rules);
  const cond = fieldsForTipo(tipo);
  const distritos: any[] = cfg?.catalogs?.districts || [];
  const clubesDistrito: string[] = useMemo(() => {
    const d = distritos.find((x: any) => x.value === district || x.label === district);
    return Array.isArray(d?.clubs) ? d.clubs : [];
  }, [distritos, district]);
  const tipoNombre = (cfg?.taxonomies?.tipo || []).find((t: any) => t.slug === tipo)?.name || tipo;

  const faltanFotos = Math.max(0, MIN_PHOTOS - fotosValidas);
  const haySubiendo = adjuntos.some((a) => a.estado === 'uploading' || a.estado === 'pending');
  const hayErrores = adjuntos.some((a) => a.estado === 'error');
  const hayRechazados = adjuntos.some((a) => a.estado === 'too-heavy' || a.estado === 'duplicate');

  // Trazabilidad de validación en tiempo real
  useEffect(() => {
    const minRequired = MIN_PHOTOS;
    const canContinue =
      selectedImages.length >= minRequired &&
      selectedImages.length <= MAX_PHOTOS &&
      videos.length <= MAX_VIDEOS &&
      adjuntos.length > 0 &&
      adjuntos.every((a) => a.estado === 'uploaded');

    console.log('[EVIDENCE_VALIDATION]', {
      selectedImages: selectedImages.length,
      uploadedImages: uploadedImages.length,
      videos: videos.length,
      minimumRequired: minRequired,
      canContinue,
    });
  }, [selectedImages.length, uploadedImages.length, videos.length, adjuntos]);

  const iniciarSubida = useCallback(async (item: Adjunto, campaignId?: string) => {
    console.log('[EVIDENCE_UPLOAD_START]', {
      id: item.id,
      name: item.file.name,
      size: item.file.size,
    });

    aplicarEstado(item.id, { estado: 'uploading', progreso: 0, error: undefined });

    let presignData: any = null;
    try {
      const r = await fetch(`${API}/rotary-en-accion/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          contentType: item.file.type,
          filename: item.file.name,
          size: item.file.size,
        }),
      });
      presignData = await leerJson(r);
      if (!r.ok || !presignData?.uploadUrl || !presignData?.key) {
        const errMsg = presignData?.error || presignData?.errores?.[0] || `El servidor no autorizó la carga (${r.status}). Reintentá.`;
        console.log('[EVIDENCE_UPLOAD_ERROR]', {
          id: item.id,
          name: item.file.name,
          etapa: 'presign',
          status: r.status,
          error: errMsg,
        });
        aplicarEstado(item.id, { estado: 'error', error: errMsg });
        return;
      }
    } catch (err: any) {
      const errMsg = 'No se pudo contactar al servidor para preparar la carga. Revisá tu conexión e intentá de nuevo.';
      console.log('[EVIDENCE_UPLOAD_ERROR]', {
        id: item.id,
        name: item.file.name,
        etapa: 'presign',
        status: 0,
        error: err?.message || errMsg,
      });
      aplicarEstado(item.id, { estado: 'error', error: errMsg });
      return;
    }

    const xhr = new XMLHttpRequest();
    xhrMapRef.current.set(item.id, xhr);
    // Timeout: 300s (5 min) para videos, 90s para fotos
    xhr.timeout = item.kind === 'video' ? 300000 : 90000;

    xhr.open('PUT', presignData.uploadUrl);
    xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        const pct = Math.min(99, Math.round((ev.loaded / ev.total) * 100));
        setAdjuntos((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, progreso: pct } : x))
        );
      }
    };

    xhr.onload = () => {
      xhrMapRef.current.delete(item.id);
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log('[EVIDENCE_UPLOAD_SUCCESS]', {
          id: item.id,
          name: item.file.name,
          storagePath: presignData.key,
        });
        aplicarEstado(item.id, { estado: 'uploaded', progreso: 100, key: presignData.key, error: undefined });
      } else {
        const errMsg = xhr.status === 403
          ? 'El almacenamiento rechazó la carga (403). Reintentá: se genera una autorización nueva.'
          : `La transferencia falló (${xhr.status}). Tocá Reintentar.`;
        console.log('[EVIDENCE_UPLOAD_ERROR]', {
          id: item.id,
          name: item.file.name,
          etapa: 'put',
          status: xhr.status,
          error: errMsg,
        });
        aplicarEstado(item.id, { estado: 'error', error: errMsg });
      }
    };

    xhr.onerror = () => {
      xhrMapRef.current.delete(item.id);
      const errMsg = 'Se cortó la conexión durante la transferencia. Reintentá.';
      console.log('[EVIDENCE_UPLOAD_ERROR]', {
        id: item.id,
        name: item.file.name,
        etapa: 'put',
        status: 0,
        error: errMsg,
      });
      aplicarEstado(item.id, { estado: 'error', error: errMsg });
    };

    xhr.ontimeout = () => {
      xhrMapRef.current.delete(item.id);
      const errMsg = 'La carga tardó demasiado y se detuvo. Reintentá con mejor conexión.';
      console.log('[EVIDENCE_UPLOAD_ERROR]', {
        id: item.id,
        name: item.file.name,
        etapa: 'put',
        status: 408,
        error: errMsg,
      });
      aplicarEstado(item.id, { estado: 'error', error: errMsg });
    };

    xhr.onabort = () => {
      xhrMapRef.current.delete(item.id);
    };

    xhr.send(item.file);
  }, [aplicarEstado]);

  const quitarArchivo = useCallback((id: string) => {
    const xhr = xhrMapRef.current.get(id);
    if (xhr) {
      xhr.abort();
      xhrMapRef.current.delete(id);
    }
    hashesRef.current.delete(id);
    setAdjuntos((prev) => {
      const item = prev.find((x) => x.id === id);
      if (item?.preview) {
        try { URL.revokeObjectURL(item.preview); } catch { /* noop */ }
      }
      return prev.filter((x) => x.id !== id);
    });
    adjuntosRef.current = adjuntosRef.current.filter((x) => {
      if (x.id === id && x.preview) {
        try { URL.revokeObjectURL(x.preview); } catch { /* noop */ }
      }
      return x.id !== id;
    });
  }, []);

  // Reintentar es solo para fallos RECUPERABLES (estado `error`): vuelve a la
  // cola y la bomba la arranca. Lo rechazado (too-heavy/duplicate) no tiene
  // botón de reintento porque no hay nada que reintentar.
  const reintentarSubida = useCallback((id: string) => {
    const item = adjuntosRef.current.find((x) => x.id === id);
    if (!item || item.estado !== 'error') return;
    const existingXhr = xhrMapRef.current.get(id);
    if (existingXhr) {
      existingXhr.abort();
      xhrMapRef.current.delete(id);
    }
    aplicarEstado(id, { estado: 'pending', progreso: 0, error: undefined });
  }, [aplicarEstado]);

  // Segunda capa anti-duplicados: huella de los primeros 256 KB. Atrapa copias
  // renombradas (mismo contenido, distinta metadata). Si choca con otro
  // archivo, el SEGUNDO se marca duplicado y se aborta su subida si arrancó.
  const verificarHuellas = useCallback(async (ids: string[]) => {
    try {
      for (const id of ids) {
        const item = adjuntosRef.current.find((x) => x.id === id);
        if (!item || item.estado !== 'pending') continue;
        let h: string | null = null;
        try { h = await partialFileHash(item.file); } catch { continue; }
        if (!h) continue;
        hashesRef.current.set(id, h);
        const otro = [...hashesRef.current.entries()].find(([oid, oh]) => oid !== id && oh === h)?.[0];
        if (!otro) continue;
        const primero = adjuntosRef.current.find((x) => x.id === otro);
        // Si el primero ya no está (lo quitaron), este queda como válido.
        if (!primero || !ocupaCupo(primero.estado)) continue;
        const xhr = xhrMapRef.current.get(id);
        if (xhr) { try { xhr.abort(); } catch { /* noop */ } xhrMapRef.current.delete(id); }
        aplicarEstado(id, { estado: 'duplicate', error: DUPLICATE_MESSAGE, progreso: 0 });
        toast.error(DUPLICATE_MESSAGE);
      }
    } catch { /* la primera capa (metadata) ya cubre lo esencial */ }
  }, [aplicarEstado]);

  // Bomba de la cola: máximo 3 subidas simultáneas. Evita saturar el enlace
  // (la causa típica de fallos masivos al elegir 8 fotos de 4 MB a la vez) y
  // las ráfagas contra el endpoint de presign. Corre con cada cambio de la
  // lista; lo pendiente arranca solo, sin tocar nada más.
  const MAX_SUBIDAS_SIMULTANEAS = 3;
  const bombearCola = useCallback(() => {
    const cur = adjuntosRef.current;
    const activos = cur.filter((a) => a.estado === 'uploading').length;
    const libres = MAX_SUBIDAS_SIMULTANEAS - activos;
    if (libres <= 0) return;
    const pendientes = cur.filter((a) => a.estado === 'pending').slice(0, libres);
    for (const p of pendientes) {
      void iniciarSubida(p, cfg?.campaign?.id);
    }
  }, [cfg?.campaign?.id, iniciarSubida]);

  useEffect(() => { bombearCola(); }, [adjuntos, bombearCola]);

  const agregarArchivos = useCallback(async (files: FileList | File[]) => {
    const rawList = Array.from(files);
    if (!rawList.length) return;

    for (const f of rawList) {
      console.log('[EVIDENCE_SELECTED]', {
        name: f.name,
        type: f.type,
        size: f.size,
        lastModified: f.lastModified,
      });
    }

    const prev = adjuntosRef.current;
    let fotosCupo = prev.filter((a) => a.kind === 'image' && ocupaCupo(a.estado)).length;
    let videosCupo = prev.filter((a) => a.kind === 'video' && ocupaCupo(a.estado)).length;

    const nuevosErrores: string[] = [];
    const itemsToAdd: Adjunto[] = [];
    const vistos = new Set(prev.map((a) => duplicateKey(a.file)));
    let avisosDuplicado = 0;

    const tarjetaRechazada = (f: File, kind: 'image' | 'video', estado: 'too-heavy' | 'duplicate', error: string): Adjunto => {
      let previewUrl: string | null = null;
      if (kind === 'image') {
        try { previewUrl = URL.createObjectURL(f); } catch { previewUrl = null; }
      }
      return { id: nuevoId(), file: f, kind, preview: previewUrl, estado, progreso: 0, error };
    };

    for (const f of rawList) {
      const meta = checkFileMeta({ contentType: f.type, filename: f.name, size: f.size });
      const kind = meta.kind as 'image' | 'video' | null;
      // Demasiado pesado: se muestra con su motivo, pero JAMÁS se sube ni se
      // reintenta. No ocupa cupo de fotos/videos.
      if (!meta.ok && kind && f.size > 0) {
        itemsToAdd.push(tarjetaRechazada(f, kind, 'too-heavy', overweightMessage({ filename: f.name, size: f.size, kind })));
        vistos.add(duplicateKey(f));
        continue;
      }
      if (!meta.ok) {
        nuevosErrores.push(`${f.name}: ${meta.errores?.[0] || meta.error || 'Archivo no permitido'}`);
        continue;
      }

      // Duplicado (capa 1, síncrona): nombre + tamaño + tipo + modificación.
      // Se avisa y se muestra, pero JAMÁS se vuelve a subir.
      const llave = duplicateKey(f);
      if (vistos.has(llave)) {
        avisosDuplicado++;
        itemsToAdd.push(tarjetaRechazada(f, kind as 'image' | 'video', 'duplicate', DUPLICATE_MESSAGE));
        continue;
      }
      vistos.add(llave);

      if (kind === 'video') {
        if (videosCupo >= MAX_VIDEOS) {
          nuevosErrores.push(`Solo se permite un máximo de ${MAX_VIDEOS} video. Se ignoró el video adicional: ${f.name}.`);
          continue;
        }
        videosCupo++;
      } else {
        if (fotosCupo >= MAX_PHOTOS) {
          nuevosErrores.push(`Solo se permite un máximo de ${MAX_PHOTOS} fotografías. Se ignoró la fotografía adicional: ${f.name}.`);
          continue;
        }
        fotosCupo++;
      }

      let previewUrl: string | null = null;
      if (kind === 'image') {
        try {
          previewUrl = URL.createObjectURL(f);
        } catch {
          previewUrl = null;
        }
      }

      const item: Adjunto = {
        id: nuevoId(),
        file: f,
        kind: kind as 'image' | 'video',
        preview: previewUrl,
        estado: 'pending',
        progreso: 0,
      };

      if (previewUrl) {
        const img = new Image();
        const itemId = item.id;
        img.onload = () => {
          setAdjuntos((cur) =>
            cur.map((a) =>
              a.id === itemId ? { ...a, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height } : a
            )
          );
        };
        img.src = previewUrl;
      }

      itemsToAdd.push(item);
    }

    if (avisosDuplicado > 0) toast.error(DUPLICATE_MESSAGE);

    if (itemsToAdd.length > 0) {
      const nextAdjuntos = [...adjuntosRef.current, ...itemsToAdd];
      adjuntosRef.current = nextAdjuntos;
      setAdjuntos(nextAdjuntos);

      console.log('[EVIDENCE_MERGED]', {
        previousCount: prev.length,
        newFilesCount: itemsToAdd.length,
        resultCount: nextAdjuntos.length,
        imagesCount: nextAdjuntos.filter((a) => a.kind === 'image').length,
        videosCount: nextAdjuntos.filter((a) => a.kind === 'video').length,
      });

      // La bomba de la cola (efecto sobre `adjuntos`) arranca las pendientes
      // de a 3; la segunda capa anti-duplicados corre antes en segundo plano.
      void verificarHuellas(itemsToAdd.filter((i) => i.estado === 'pending').map((i) => i.id));
    }

    if (nuevosErrores.length > 0) {
      setErrores((e) => [...e, ...nuevosErrores]);
    }
  }, [verificarHuellas]);

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
      const utiles = adjuntos.filter((a) => ocupaCupo(a.estado));
      const imgsUtiles = utiles.filter((a) => a.kind === 'image');
      const vidsUtiles = utiles.filter((a) => a.kind === 'video');
      const validImgs = utiles.filter((a) => a.kind === 'image' && a.estado === 'uploaded');
      const dupes = adjuntos.filter((a) => a.estado === 'duplicate');
      const heavy = adjuntos.filter((a) => a.estado === 'too-heavy');
      const failed = adjuntos.filter((a) => a.estado === 'error');
      const busy = adjuntos.filter((a) => a.estado === 'uploading' || a.estado === 'pending');
      if (dupes.length > 0) {
        return `Hay ${dupes.length} archivo(s) duplicado(s): ya están agregados. Eliminalos de la lista para poder continuar.`;
      }
      if (heavy.length > 0) {
        return `Hay ${heavy.length} archivo(s) que superan el peso máximo (5 MB por foto, 300 MB por video). Eliminalos o reemplazalos para poder continuar.`;
      }
      if (failed.length > 0) {
        return 'Uno o más archivos no se pudieron cargar. Tocá "Reintentar" en la tarjeta o elimínalos para poder continuar.';
      }
      if (busy.length > 0) {
        return 'Por favor espera a que todos los archivos terminen de cargarse para continuar.';
      }
      if (validImgs.length < MIN_PHOTOS) {
        return `Tenés ${validImgs.length} fotografía(s) válida(s) de las ${MIN_PHOTOS} requeridas. Faltan ${MIN_PHOTOS - validImgs.length}: agregá más fotografías y esperá a que se carguen.`;
      }
      if (imgsUtiles.length > MAX_PHOTOS) {
        return `Has superado el máximo de ${MAX_PHOTOS} fotografías permitidas.`;
      }
      if (vidsUtiles.length > MAX_VIDEOS) {
        return `Solo se permite un máximo de ${MAX_VIDEOS} video.`;
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
    try {
      setEnviando(true);
      const subidos = adjuntos.map((a) => {
        if (!a.key) throw new Error(`El archivo ${a.file.name} no se ha terminado de cargar.`);
        return { key: a.key, filename: a.file.name, contentType: a.file.type };
      });
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

  const tipos: any[] = (cfg.taxonomies?.tipo && cfg.taxonomies.tipo.length > 0) ? cfg.taxonomies.tipo : DEFAULT_TIPOS;
  const areas: any[] = (cfg.taxonomies?.area && cfg.taxonomies.area.length > 0) ? cfg.taxonomies.area : DEFAULT_AREAS;
  const programas: any[] = (cfg.taxonomies?.programa && cfg.taxonomies.programa.length > 0) ? cfg.taxonomies.programa : DEFAULT_PROGRAMAS;
  const temas: any[] = (cfg.taxonomies?.tema && cfg.taxonomies.tema.length > 0) ? cfg.taxonomies.tema : DEFAULT_TEMAS;
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
              <h2 className="text-lg font-black text-gray-800">Evidencias y contacto</h2>
              <p className="text-sm text-gray-500 mt-1">{selectedImages.length} de {MIN_PHOTOS} mínima(s) · {advice.text}</p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-6 sm:p-8 text-center hover:border-rotary-blue hover:bg-blue-50/20 transition-all cursor-pointer"
            >
              <Upload className="w-8 h-8 mx-auto text-gray-400" />
              <div className="text-sm font-bold text-gray-700 mt-2">Tocá acá para elegir, o arrastrá las fotos o video</div>
              <div className="text-xs text-gray-400 mt-1">Desde el teléfono se abre la cámara o la galería (Mínimo 5 fotos, máx 10 fotos y 1 video · máx 5 MB por foto, 300 MB el video).</div>
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const selected = Array.from(e.target.files);
                  e.target.value = '';
                  agregarArchivos(selected);
                } else {
                  e.target.value = '';
                }
              }}
            />

            {adjuntos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {adjuntos.map((a) => (
                  <div key={a.id} className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-square border border-gray-200 shadow-sm group">
                    {a.preview ? (
                      <img src={a.preview} alt={a.file.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1.5 p-2 bg-gradient-to-b from-gray-800 to-gray-950">
                        <Film className="w-8 h-8 text-blue-400" />
                        <span className="text-[10px] font-bold text-gray-300 truncate max-w-full px-1">{a.file.name}</span>
                      </div>
                    )}

                    {/* Overlay inferior con nombre, tamaño y estado */}
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col justify-end text-white">
                      <div className="text-[11px] font-bold truncate drop-shadow-sm leading-tight">{a.file.name}</div>
                      <div className="flex items-center justify-between text-[10px] mt-0.5">
                        <span className="text-gray-300 font-medium">{formatoTamano(a.file.size)}</span>
                        {a.estado === 'uploaded' && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Carga completada
                          </span>
                        )}
                        {a.estado === 'uploading' && (
                          <span className="inline-flex items-center gap-1 text-blue-300 font-bold">
                            <Loader2 className="w-3 h-3 animate-spin" /> Subiendo {a.progreso}%
                          </span>
                        )}
                        {a.estado === 'pending' && (
                          <span className="text-amber-300 font-bold">Pendiente</span>
                        )}
                        {a.estado === 'error' && (
                          <span className="text-red-400 font-bold">Error</span>
                        )}
                        {a.estado === 'too-heavy' && (
                          <span className="text-orange-300 font-bold">Archivo demasiado pesado</span>
                        )}
                        {a.estado === 'duplicate' && (
                          <span className="text-violet-300 font-bold">Archivo duplicado</span>
                        )}
                      </div>
                      {/* Motivo visible en la tarjeta: qué pasó y qué hacer */}
                      {a.error && a.estado !== 'uploading' && a.estado !== 'pending' && (
                        <div className="text-[10px] leading-tight mt-1 text-gray-200/90 line-clamp-3">{a.error}</div>
                      )}

                      {/* Barra de progreso al subir */}
                      {a.estado === 'uploading' && (
                        <div className="w-full bg-white/20 rounded-full h-1 mt-1.5 overflow-hidden">
                          <div className="bg-rotary-blue h-full transition-all duration-300 rounded-full" style={{ width: `${a.progreso}%` }} />
                        </div>
                      )}

                      {/* Botón de reintento en caso de error */}
                      {a.estado === 'error' && (
                        <button
                          type="button"
                          onClick={() => reintentarSubida(a.id)}
                          className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-[10px] font-black tracking-wide transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" /> Reintentar
                        </button>
                      )}
                    </div>

                    {/* Aviso de baja resolución */}
                    {a.width != null && a.width < 800 && (
                      <div className="absolute top-2 left-2 bg-amber-500/90 backdrop-blur-sm text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                        Baja resolución
                      </div>
                    )}

                    {/* Botón para quitar evidencia */}
                    <button
                      type="button"
                      onClick={() => quitarArchivo(a.id)}
                      aria-label={`Quitar ${a.file.name}`}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center shadow transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Aviso amarillo idéntico a la captura si faltan fotografías */}
            {faltanFotos > 0 && (
              <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 text-amber-900">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm leading-relaxed">
                  <span className="font-black text-amber-900">Faltan {faltanFotos} fotografía(s): </span>
                  <span>
                    Has cargado {fotosValidas} de las {MIN_PHOTOS} requeridas (cuentan solo las cargadas con éxito). Por favor selecciona al menos {MIN_PHOTOS} fotografías para poder continuar al paso de envío.
                  </span>
                </div>
              </div>
            )}

            {/* Aviso azul si se están subiendo evidencias */}
            {faltanFotos === 0 && haySubiendo && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center gap-2.5 text-blue-900 text-xs font-bold">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                <span>Subiendo evidencias al servidor seguro ({uploadedImages.length + uploadedVideos.length} de {enCupo.length} completadas)...</span>
              </div>
            )}

            {/* Aviso rojo si algún archivo falló al subir */}
            {hayErrores && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center justify-between gap-2 text-red-900 text-xs font-bold">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Uno o más archivos no se pudieron cargar. Tocá "Reintentar" en la tarjeta o elimínalos para continuar.</span>
                </div>
              </div>
            )}

            {/* Aviso gris si hay archivos rechazados (peso o duplicados): no se
                reintentan, se quitan */}
            {hayRechazados && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 flex items-center gap-2 text-gray-700 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-gray-500 shrink-0" />
                <span>Hay archivos que no se pueden enviar (demasiado pesados o duplicados). Eliminalos con la × de la tarjeta para continuar.</span>
              </div>
            )}

            {/* Banner verde cuando se cumple todo y están cargadas */}
            {faltanFotos === 0 && !haySubiendo && !hayErrores && !hayRechazados && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center gap-2 text-emerald-900 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{fotosValidas} fotografías {uploadedVideos.length > 0 ? `+ ${uploadedVideos.length} video ` : ''}cargadas con éxito. Puedes continuar al paso de envío.</span>
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
                    <strong>{selectedImages.length} fotografía(s)</strong>{videos.length > 0 && ` · ${videos.length} video(s)`} · {club || 'Sin club'} · {senderName} ({senderEmail})
                  </p>
                  {adjuntos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {adjuntos.slice(0, 10).map((a) => (
                        <div key={a.id} className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 relative shadow-xs">
                          {a.kind === 'image' && a.preview ? (
                            <img src={a.preview} alt="" className="w-full h-full object-cover" />
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
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Material</dt><dd>{selectedImages.length} fotografía(s){videos.length > 0 ? ` + ${videos.length} video` : ''}</dd></div>
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
