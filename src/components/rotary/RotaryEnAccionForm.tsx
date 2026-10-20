import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Upload, X, Image as ImageIcon, Film, Loader2, CheckCircle2,
  AlertTriangle, MapPin, Users, Plus, ArrowLeft, ArrowRight, Sparkles, Save, Link2, Pencil, ChevronDown,
  RotateCcw, Award, Globe, Calendar, Search, Building2, Layers, DollarSign, Target, Check
} from 'lucide-react';
import { useSEO } from '../../hooks/useSEO';
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, flagEmoji } from '../../lib/countryPhones';
import { toast } from 'sonner';
import Navbar from '../../sections/Navbar';
import Footer from '../../sections/Footer';
import { PublicPageHeader } from '../common/PublicInstitutionalComponents';
import { ACCEPT_ATTR, MIN_PHOTOS, MAX_PHOTOS, MAX_VIDEOS, checkFileMeta, overweightMessage, DUPLICATE_MESSAGE, duplicateKey, partialFileHash, countValidPhotos } from '../../lib/contentSubmissionSpec';
import {
  fieldsForTipo, IMPACT_META, EXTRA_LABELS, photoAdvice,
  DEFAULT_TIPOS, DEFAULT_AREAS, DEFAULT_PROGRAMAS, DEFAULT_TEMAS,
} from '../../lib/rotaryEnAccionSpec';
import { useLang } from '../../contexts/LanguageContext';
import {
  ROTARY_AREAS_INTEREST,
  PROJECT_GOAL_OPTIONS,
  FAIR_EDITIONS,
  PROJECT_STAGES,
  type ProjectEvolution,
  goalLabel,
  goalBadgeClass,
  getRotaryAreaName,
  getRotaryAreaDescription,
  getProjectGoalLabel,
  getProjectGoalDescription,
  getProjectStageLabel,
} from '../../lib/rotaryFeriaSpec';

// ════════════════════════════════════════════════════════════════════
// Rotary en Acción — puerta universal de entrada (v4.1120).
//
// 4 pasos públicos, metadata interna rica:
//   1 · Qué quieres compartir → 2 · Cuéntanos → 3 · Evidencias y contacto
//   → 4 · Revisar y enviar.
//
// Canal Especializado Feria de Proyectos Colombia:
//   - 8 tarjetas de Área de Interés (7 oficiales de Rotary + Otros complementaria)
//   - Propósito del reporte (Nuevo, Avances, Resultados, Nueva etapa, Financiación, Historia de éxito)
//   - Identificación y trazabilidad histórica vinculable a ediciones anteriores
//   - Evolución e impacto dinámico (comprobados vs estimaciones vs metas)
// ════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const CAMPO = 'w-full p-3.5 rounded-xl border-2 border-gray-100 text-base bg-gray-50/60 outline-none focus:border-rotary-blue transition-colors';
const ROTULO = 'block text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2';
const TARJETA = 'bg-white rounded-3xl p-6 sm:p-8 md:p-10 shadow-sm border border-gray-100';
const nuevoId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const PASOS = ['Qué quieres compartir', 'Cuéntanos', 'Evidencias y contacto', 'Revisar y enviar'];
const PASOS_EN = ['What you want to share', 'Tell us your story', 'Evidence and contact', 'Review and submit'];

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
  titulo: 'Nombre corto que identifique la actividad o proyecto.',
  historia: 'Resume qué hizo el club, por qué lo hizo, quiénes participaron y qué resultado tuvo. No necesitas escribir como periodista.',
  fecha: 'Cuándo se realizó la actividad o inició el proyecto.',
  ciudad: 'Municipio o región beneficiaria.',
  beneficiarios: 'Cantidad aproximada de personas o familias beneficiadas.',
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

const TIPS_EN: Record<string, string> = {
  titulo: 'A short title identifying the activity or project.',
  historia: 'Summarize what your club did, why, who participated, and the results achieved.',
  fecha: 'When the activity took place or the project started.',
  ciudad: 'Beneficiary municipality, town, or region.',
  beneficiarios: 'Approximate number of people or families benefited.',
  voluntarios: 'Rotarians, family members, or friends who assisted.',
  horas: 'Approximate total service hours dedicated.',
  recursos: 'Funds or resources mobilized, if applicable.',
  impacto: 'Beneficiaries, volunteers, service hours, and funds mobilized. All optional.',
  fondosRecaudados: 'Total funds raised during the activity.',
  capacitados: 'Approximate number of people trained.',
  tipoEmergencia: 'E.g.: flood, earthquake, fire, landslide.',
  zonaAfectada: 'Affected neighborhoods, rural areas, or municipalities.',
  ayudaEntregada: 'What the club delivered: food packages, clean water, blankets, kits…',
  necesidades: 'What is still needed in the affected area.',
  area: 'The Rotary area of focus closest to your story.',
  programa: 'The program or community that led the initiative, if applicable.',
  tema: 'The specific theme, if applicable.',
  tags: 'Keywords to help find and categorize your story.',
  fotos: '1 photo is enough to submit. 5 or more enables automated AI Reel creation.',
  distrito: 'District to which the organizing club belongs.',
  club: 'The club leading the story. If multiple participated, add them below.',
  clubes: 'Other participating clubs in addition to the main one.',
  aliados: 'Organizations, companies, or entities that supported the activity.',
  nombre: 'Contact person if more details are needed.',
  cargo: 'Your role in the club, if any.',
  email: 'We will notify you here when your story is published.',
  telefono: 'Optional, for quicker coordination via WhatsApp.',
  enlaces: 'Videos, news articles, or posts where the activity was already featured.',
};

const InfoTip: React.FC<{ tipKey: string }> = ({ tipKey }) => {
  const { lang } = useLang();
  const isEn = lang === 'en';
  const [abierto, setAbierto] = useState(false);
  const tipsMap = isEn ? TIPS_EN : TIPS;
  const texto = tipsMap[tipKey] || (isEn ? 'Only if applicable to your story. You may leave it empty.' : 'Solo si aplica a tu historia. Puedes dejarlo vacío.');
  const id = `tip-${tipKey}`;
  return (
    <span className="relative inline-flex ml-1.5 align-middle">
      <button
        type="button" aria-label={isEn ? 'More information' : 'Más información'} aria-describedby={id} aria-expanded={abierto}
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

const Cabecera: React.FC<{ siteName?: string; isFeria?: boolean }> = ({ siteName, isFeria }) => {
  const { lang } = useLang();
  const isEn = lang === 'en';

  const feriaSubtitle = isEn
    ? "Share the projects, progress, and results of your Rotary club. Let's make its impact visible, strengthen international partnerships, and show how together we transform communities."
    : 'Comparte los proyectos, avances y resultados de tu club rotario. Hagamos visible su impacto, fortalezcamos las alianzas internacionales y mostremos cómo juntos transformamos comunidades.';

  const defaultSubtitle = isEn
    ? `Share the activities, projects, works, and events of your club and help us showcase the impact of Rotary through ${siteName || 'District 4281'} channels.`
    : siteName
    ? `Comparte las actividades, proyectos, obras y eventos de tu club y ayúdanos a mostrar el impacto de Rotary a través de los canales de ${siteName}.`
    : 'Comparte las actividades, proyectos, obras y eventos de tu club y ayúdanos a mostrar el impacto de Rotary a través de los canales del Distrito 4281.';

  return (
    <PublicPageHeader
      title={isFeria ? 'Rotary en Acción · Feria de Proyectos' : (isEn ? 'Rotary in Action' : 'Rotary en Acción')}
      subtitle={isFeria ? feriaSubtitle : defaultSubtitle}
    />
  );
};

const Bloque: React.FC<{
  titulo: string;
  paso: number;
  onEdit: (paso: number) => void;
  editLabel?: string;
  children: React.ReactNode;
}> = ({ titulo, paso, onEdit, editLabel = 'Editar', children }) => (
  <div className="border-b border-gray-100 last:border-0 py-4 first:pt-0 last:pb-0">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-400">{titulo}</h3>
      <button type="button" onClick={() => onEdit(paso)} className="flex items-center gap-1 text-xs font-bold text-rotary-blue">
        <Pencil className="w-3.5 h-3.5" /> {editLabel}
      </button>
    </div>
    {children}
  </div>
);

export default function RotaryEnAccionForm({ campaignRef }: { campaignRef?: string }) {
  const { lang } = useLang();
  const isEn = lang === 'en';
  const pasos = isEn ? PASOS_EN : PASOS;

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

  // Detección de canal Feria de Proyectos Colombia
  const isFeriaMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname.toLowerCase();
    const searchParams = new URLSearchParams(window.location.search);
    const canal = (searchParams.get('canal') || searchParams.get('channel') || searchParams.get('mode') || '').toLowerCase();
    return host.includes('rotaryprojectfair') || ['feria', 'project_fair', 'feria_proyectos'].includes(canal) || Boolean(cfg?.isProjectFair);
  }, [cfg]);

  // Paso 1 Feria: Área de Interés & Enfoque
  const [areaPrincipal, setAreaPrincipal] = useState<string>('paz');
  const [areasSecundarias, setAreasSecundarias] = useState<string[]>([]);
  const [otrosEspecificacion, setOtrosEspecificacion] = useState<string>('');
  const [projectGoalType, setProjectGoalType] = useState<string>('nuevo');

  // Paso 2 Feria: Identificación, Vinculación y Evolución
  const [projectCountry, setProjectCountry] = useState<string>('Colombia');
  const [projectStartYear, setProjectStartYear] = useState<string>(String(new Date().getFullYear()));
  const [projectStage, setProjectStage] = useState<string>('ejecucion');
  const [projectObjectives, setProjectObjectives] = useState<string>('');
  const [projectTargetCommunity, setProjectTargetCommunity] = useState<string>('');
  const [wasInPreviousFair, setWasInPreviousFair] = useState<boolean>(false);
  const [projectFairEdition, setProjectFairEdition] = useState<string>(FAIR_EDITIONS[0]);
  const [linkedProject, setLinkedProject] = useState<{
    id: string;
    type: 'project' | 'fair_submission';
    title: string;
    club?: string;
    edition?: string;
  } | null>(null);

  // Búsqueda interactiva de proyectos previos de la Feria
  const [fairSearchQuery, setFairSearchQuery] = useState('');
  const [fairSearchResults, setFairSearchResults] = useState<any[]>([]);
  const [fairSearchLoading, setFairSearchLoading] = useState(false);

  // Evolución e impacto del proyecto
  const [verifiedResults, setVerifiedResults] = useState('');
  const [estimatedResults, setEstimatedResults] = useState('');
  const [futureTargets, setFutureTargets] = useState('');
  const [beneficiariesDirect, setBeneficiariesDirect] = useState('');
  const [beneficiariesIndirect, setBeneficiariesIndirect] = useState('');
  const [fundsCurrency, setFundsCurrency] = useState<'COP' | 'USD' | 'EUR'>('USD');
  const [fundsManaged, setFundsManaged] = useState('');
  const [fundsReceived, setFundsReceived] = useState('');
  const [participatingOrgs, setParticipatingOrgs] = useState('');
  const [partnerClubs, setPartnerClubs] = useState('');
  const [internationalParticipation, setInternationalParticipation] = useState('');
  const [completedStages, setCompletedStages] = useState('');
  const [executedActivities, setExecutedActivities] = useState('');
  const [currentNeeds, setCurrentNeeds] = useState('');
  const [successStory, setSuccessStory] = useState('');

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

  useSEO({
    title: isFeriaMode
      ? (isEn ? 'Rotary in Action — Rotary Project Fair Colombia' : 'Rotary en Acción — Feria de Proyectos Colombia')
      : (isEn ? 'Rotary in Action — Share what your club does' : 'Rotary en Acción — Comparte lo que hace tu club'),
    description: isFeriaMode
      ? (isEn
        ? "Share your club's projects, works, progress, and results and help us showcase Rotary's impact through Rotary Project Fair Colombia channels."
        : 'Comparte los proyectos, obras, avances y resultados de tu club y ayúdanos a mostrar el impacto de Rotary a través de los canales de Rotary Project Fair Colombia.')
      : (isEn
        ? 'Your club does extraordinary things. Tell us what you are doing and we will help you communicate it.'
        : 'Tu club hace cosas extraordinarias. Cuéntanos qué está haciendo y nosotros te ayudamos a comunicarlo.'),
  });

  // Búsqueda en vivo con debounce de proyectos de la Feria
  useEffect(() => {
    if (!isFeriaMode || !wasInPreviousFair || !fairSearchQuery.trim() || fairSearchQuery.trim().length < 2) {
      setFairSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setFairSearchLoading(true);
      try {
        const res = await fetch(`${API}/rotary-en-accion/fair-projects/search?q=${encodeURIComponent(fairSearchQuery.trim())}`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.results)) {
          setFairSearchResults(data.results);
        }
      } catch {
        // Silencioso en red
      } finally {
        setFairSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [isFeriaMode, wasInPreviousFair, fairSearchQuery]);

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
          if (pl.areaPrincipal) setAreaPrincipal(pl.areaPrincipal);
          if (Array.isArray(pl.areasSecundarias)) setAreasSecundarias(pl.areasSecundarias);
          if (pl.otrosEspecificacion) setOtrosEspecificacion(pl.otrosEspecificacion);
          if (pl.projectGoalType) setProjectGoalType(pl.projectGoalType);
          if (pl.projectCountry) setProjectCountry(pl.projectCountry);
          if (pl.projectStartYear) setProjectStartYear(pl.projectStartYear);
          if (pl.projectStage) setProjectStage(pl.projectStage);
          if (pl.projectObjectives) setProjectObjectives(pl.projectObjectives);
          if (pl.projectTargetCommunity) setProjectTargetCommunity(pl.projectTargetCommunity);
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
          areaPrincipal, areasSecundarias, otrosEspecificacion, projectGoalType, projectCountry,
          projectStartYear, projectStage, projectObjectives, projectTargetCommunity, wasInPreviousFair,
          projectFairEdition, verifiedResults, estimatedResults, futureTargets, beneficiariesDirect,
          beneficiariesIndirect, fundsCurrency, fundsManaged, fundsReceived, participatingOrgs,
          partnerClubs, internationalParticipation, completedStages, executedActivities, currentNeeds,
          successStory, linkedProject
        }));
      } catch { /* noop */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [
    tipo, title, story, area, programa, tema, tagsText, city, location, activityDate, district,
    club, clubes, senderName, senderEmail, role, extraFields, impact, quiereResultados, cargando,
    enviado, areaPrincipal, areasSecundarias, otrosEspecificacion, projectGoalType, projectCountry,
    projectStartYear, projectStage, projectObjectives, projectTargetCommunity, wasInPreviousFair,
    projectFairEdition, verifiedResults, estimatedResults, futureTargets, beneficiariesDirect,
    beneficiariesIndirect, fundsCurrency, fundsManaged, fundsReceived, participatingOrgs, partnerClubs,
    internationalParticipation, completedStages, executedActivities, currentNeeds, successStory, linkedProject
  ]);

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
          if (d.areaPrincipal) setAreaPrincipal(d.areaPrincipal);
          if (Array.isArray(d.areasSecundarias)) setAreasSecundarias(d.areasSecundarias);
          if (d.otrosEspecificacion) setOtrosEspecificacion(d.otrosEspecificacion);
          if (d.projectGoalType) setProjectGoalType(d.projectGoalType);
          if (d.projectCountry) setProjectCountry(d.projectCountry);
          if (d.projectStartYear) setProjectStartYear(d.projectStartYear);
          if (d.projectStage) setProjectStage(d.projectStage);
          if (d.projectObjectives) setProjectObjectives(d.projectObjectives);
          if (d.projectTargetCommunity) setProjectTargetCommunity(d.projectTargetCommunity);
          if (d.wasInPreviousFair != null) setWasInPreviousFair(d.wasInPreviousFair);
          if (d.projectFairEdition) setProjectFairEdition(d.projectFairEdition);
          if (d.verifiedResults) setVerifiedResults(d.verifiedResults);
          if (d.estimatedResults) setEstimatedResults(d.estimatedResults);
          if (d.futureTargets) setFutureTargets(d.futureTargets);
          if (d.beneficiariesDirect) setBeneficiariesDirect(d.beneficiariesDirect);
          if (d.beneficiariesIndirect) setBeneficiariesIndirect(d.beneficiariesIndirect);
          if (d.fundsCurrency) setFundsCurrency(d.fundsCurrency);
          if (d.fundsManaged) setFundsManaged(d.fundsManaged);
          if (d.fundsReceived) setFundsReceived(d.fundsReceived);
          if (d.participatingOrgs) setParticipatingOrgs(d.participatingOrgs);
          if (d.partnerClubs) setPartnerClubs(d.partnerClubs);
          if (d.internationalParticipation) setInternationalParticipation(d.internationalParticipation);
          if (d.completedStages) setCompletedStages(d.completedStages);
          if (d.executedActivities) setExecutedActivities(d.executedActivities);
          if (d.currentNeeds) setCurrentNeeds(d.currentNeeds);
          if (d.successStory) setSuccessStory(d.successStory);
          if (d.linkedProject) setLinkedProject(d.linkedProject);
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
    if (s === 0) {
      if (isFeriaMode) {
        if (!areaPrincipal) return 'Selecciona el área de interés principal de tu proyecto.';
        if (areaPrincipal === 'otros' && !otrosEspecificacion.trim()) return 'Por favor especifica el tipo de proyecto o iniciativa complementaria.';
        if (!projectGoalType) return 'Selecciona qué deseas compartir sobre tu proyecto.';
      } else if (!tipo) {
        return 'Elegí qué quieres compartir para continuar.';
      }
    }
    if (s === 1 && isFeriaMode) {
      if (!title.trim()) return 'Escribe el nombre o título del proyecto.';
      if (!club.trim()) return 'Indica el club rotario responsable del proyecto.';
    }
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

      const evolutionPayload: ProjectEvolution = {
        resultadosComprobados: verifiedResults.trim() || undefined,
        estimacionesActuales: estimatedResults.trim() || undefined,
        objetivosFuturos: futureTargets.trim() || undefined,
        beneficiariosDirectos: beneficiariesDirect.trim() ? (Number(beneficiariesDirect) || beneficiariesDirect) : undefined,
        beneficiariosIndirectos: beneficiariesIndirect.trim() ? (Number(beneficiariesIndirect) || beneficiariesIndirect) : undefined,
        recursosGestionadosMoneda: fundsCurrency,
        recursosGestionadosMonto: fundsManaged.trim() ? (Number(fundsManaged) || fundsManaged) : undefined,
        financiacionRecibidaDetalle: fundsReceived.trim() || undefined,
        organizacionesParticipantes: participatingOrgs.trim() || undefined,
        clubesAliadosNacionales: partnerClubs.trim() || undefined,
        clubesAliadosInternacionales: partnerClubs.trim() || undefined,
        participacionInternacionalPaises: internationalParticipation.trim() || undefined,
        etapasCompletadas: completedStages.trim() || undefined,
        actividadesEjecutadas: executedActivities.trim() || undefined,
        nuevosObjetivos: futureTargets.trim() || undefined,
        necesidadesActuales: currentNeeds.trim() || undefined,
        clasificacionOtrosDetalle: areaPrincipal === 'otros' ? otrosEspecificacion.trim() : undefined,
      };

      const feriaSubmissionData = isFeriaMode ? {
        submissionType: 'project_fair',
        projectGoalType,
        projectStage,
        projectStartYear: projectStartYear ? (Number(projectStartYear) || null) : null,
        projectTargetCommunity: projectTargetCommunity.trim() || null,
        projectFairEdition: wasInPreviousFair ? projectFairEdition : null,
        projectFairSubmissionId: linkedProject?.type === 'fair_submission' ? linkedProject.id : null,
        projectId: linkedProject?.type === 'project' ? linkedProject.id : null,
        country: projectCountry || 'Colombia',
        secondaryAreas: areasSecundarias,
        projectEvolution: evolutionPayload,
      } : {};

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
          contentType: isFeriaMode ? 'project_fair' : tipo,
          areaFocus: isFeriaMode ? (areaPrincipal === 'otros' ? (otrosEspecificacion || 'otros') : areaPrincipal) : area,
          program: programa, topic: tema,
          tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
          impact: impactNums, mainClub: club,
          clubs: [...clubes, ...(club && !clubes.includes(club) ? [club] : [])].map((name) => ({ name, source: 'manual' as const })),
          hasPosts: enlacesValidos.length > 0,
          posts: enlacesValidos.map((url) => ({ platform: 'otra', platformOther: 'Enlace relacionado', url })),
          files: subidos,
          ...feriaSubmissionData,
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
  if (errorCarga || !cfg) return (<Marco><div className="flex items-center justify-center px-4 py-20"><div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-sm border border-gray-100"><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" /><h1 className="text-lg font-bold text-gray-800 mt-4">{isEn ? 'Could not open Rotary in Action' : 'No se pudo abrir Rotary en Acción'}</h1><p className="text-sm text-gray-500 mt-2">{errorCarga}</p><button onClick={cargar} className="mt-5 px-5 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold">{isEn ? 'Retry' : 'Reintentar'}</button></div></div></Marco>);

  const tipos: any[] = (cfg.taxonomies?.tipo && cfg.taxonomies.tipo.length > 0) ? cfg.taxonomies.tipo : DEFAULT_TIPOS;
  const areas: any[] = (cfg.taxonomies?.area && cfg.taxonomies.area.length > 0) ? cfg.taxonomies.area : DEFAULT_AREAS;
  const programas: any[] = (cfg.taxonomies?.programa && cfg.taxonomies.programa.length > 0) ? cfg.taxonomies.programa : DEFAULT_PROGRAMAS;
  const temas: any[] = (cfg.taxonomies?.tema && cfg.taxonomies.tema.length > 0) ? cfg.taxonomies.tema : DEFAULT_TEMAS;
  const impactoCargado = Object.entries(impact).filter(([, v]) => String(v).trim());

  return (
    <Marco>
      <Cabecera siteName={cfg?.site?.name} isFeria={isFeriaMode} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-12 pb-20 space-y-4">
        {!enviado && (
          <nav aria-label={isEn ? 'Progress' : 'Progreso'} className="bg-white rounded-2xl border border-gray-100 px-4 sm:px-6 py-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-2 overflow-x-auto">
              {pasos.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => irA(i)}
                  disabled={i > step}
                  aria-current={i === step ? 'step' : undefined}
                  className={`flex items-center gap-2 text-xs font-bold whitespace-nowrap px-3 py-1.5 rounded-full transition-all ${
                    i === step
                      ? 'bg-rotary-blue text-white shadow-sm'
                      : i < step
                      ? 'text-rotary-blue hover:bg-blue-50 cursor-pointer'
                      : 'text-gray-400 disabled:opacity-60 cursor-default'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      i === step
                        ? 'bg-white/25 text-white'
                        : i < step
                        ? 'bg-rotary-blue text-white'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <p className="sm:hidden text-[11px] font-bold text-gray-400 mt-2">
              {isEn ? `Step ${step + 1} of 4: ${pasos[step]}` : `Paso ${step + 1} de 4: ${pasos[step]}`}
            </p>
          </nav>
        )}

        {/* PASO 1 */}
        {step === 0 && !enviado && (
          <div className={TARJETA}>
            {isFeriaMode ? (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                    <Award className="w-5 h-5" />
                  </span>
                  <h2 className="text-xl font-black text-gray-800">
                    {isEn ? 'Rotary Area of Focus' : 'Área de Interés de Rotary'}
                  </h2>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {isEn
                    ? 'The form is focused on Rotary projects and organized according to the seven areas of focus of Rotary International.'
                    : 'El formulario está enfocado en proyectos rotarios y organizado según las siete áreas de interés de Rotary International.'}
                </p>

                {/* Grid de 3 columnas con 8 tarjetas (7 oficiales + Otros) */}
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-6"
                  role="radiogroup"
                  aria-label={isEn ? 'Rotary Area of Focus' : 'Área de interés de Rotary'}
                >
                  {ROTARY_AREAS_INTEREST.map((a) => {
                    const isSelected = areaPrincipal === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          setAreaPrincipal(a.id);
                          if (areasSecundarias.includes(a.id)) {
                            setAreasSecundarias(areasSecundarias.filter((x) => x !== a.id));
                          }
                        }}
                        className={`rounded-2xl border-2 p-4 text-left transition-all min-h-[115px] flex flex-col justify-between ${
                          isSelected
                            ? 'border-rotary-blue bg-blue-50/80 shadow-sm'
                            : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-2xl sm:text-3xl" aria-hidden>{a.icon}</span>
                          {a.isOfficialArea ? (
                            <span className="text-[10px] font-bold text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                              {isEn ? 'Official Area' : 'Área Oficial'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              {isEn ? 'Complementary' : 'Complementaria'}
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          <div className="text-xs sm:text-sm font-bold text-gray-800 leading-snug">{getRotaryAreaName(a.id, lang)}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{getRotaryAreaDescription(a.id, lang)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Especificación de Otros proyectos e iniciativas */}
                {areaPrincipal === 'otros' && (
                  <div className="mt-4 p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                    <label htmlFor="rea-otros-esp" className="block text-xs font-bold text-amber-900">
                      {isEn ? 'Specify the type of complementary project or initiative *' : 'Especifica el tipo de proyecto o iniciativa complementaria *'}
                    </label>
                    <input
                      id="rea-otros-esp"
                      className={CAMPO}
                      placeholder={isEn ? 'E.g.: Humanitarian disaster relief, community robotics, cultural heritage…' : 'Ej: Ayuda humanitaria en desastres, robótica educativa comunitaria, patrimonio cultural…'}
                      value={otrosEspecificacion}
                      onChange={(e) => setOtrosEspecificacion(e.target.value)}
                    />
                    <p className="text-[11px] text-amber-800">
                      {isEn
                        ? 'This complementary option classifies special initiatives without altering the official taxonomy of Rotary International’s seven areas of focus.'
                        : 'Esta opción complementaria clasifica iniciativas especiales sin modificar la taxonomía oficial de las siete áreas de Rotary International.'}
                    </p>
                  </div>
                )}

                {/* Áreas secundarias */}
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <span className={ROTULO}>{isEn ? 'Secondary areas of impact (optional)' : 'Áreas secundarias de impacto (opcional)'}</span>
                  <p className="text-xs text-gray-500 mb-2.5">
                    {isEn
                      ? 'If the project impacts more than one of the seven official areas, select complementary areas:'
                      : 'Si el proyecto impacta más de una de las siete áreas oficiales, selecciona las áreas complementarias:'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ROTARY_AREAS_INTEREST.filter((a) => a.isOfficialArea && a.id !== areaPrincipal).map((a) => {
                      const isSec = areasSecundarias.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            if (isSec) {
                              setAreasSecundarias(areasSecundarias.filter((x) => x !== a.id));
                            } else {
                              setAreasSecundarias([...areasSecundarias, a.id]);
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                            isSec
                              ? 'bg-rotary-blue text-white border-rotary-blue shadow-xs'
                              : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          <span>{a.icon}</span>
                          <span>{getRotaryAreaName(a.id, lang)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Propósito del proyecto */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <h3 className="text-lg font-black text-gray-800">
                    {isEn ? 'What do you want to share about your project?' : '¿Qué deseas compartir sobre tu proyecto?'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {isEn
                      ? 'Select the purpose of your report to customize the fields in subsequent steps:'
                      : 'Selecciona el propósito de tu reporte para adaptar los campos en los siguientes pasos:'}
                  </p>
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-4"
                    role="radiogroup"
                    aria-label={isEn ? 'Report purpose' : 'Propósito del reporte'}
                  >
                    {PROJECT_GOAL_OPTIONS.map((g) => {
                      const isGoalSelected = projectGoalType === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          role="radio"
                          aria-checked={isGoalSelected}
                          onClick={() => setProjectGoalType(g.id)}
                          className={`rounded-2xl border-2 p-4 text-left transition-all min-h-[96px] flex flex-col justify-between ${
                            isGoalSelected
                              ? 'border-rotary-blue bg-blue-50/80 shadow-sm'
                              : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="text-2xl sm:text-3xl" aria-hidden>{g.icon}</div>
                          <div className="mt-2">
                            <div className="text-xs sm:text-sm font-bold text-gray-800 leading-snug">{getProjectGoalLabel(g.id, lang)}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{getProjectGoalDescription(g.id, lang)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-black text-gray-800">{isEn ? 'What do you want to share with Rotary?' : '¿Qué quieres compartir con Rotary?'}</h2>
                <p className="text-sm text-gray-500 mt-1">{isEn ? 'Choose an option. The form adapts to your choice.' : 'Elegí una opción. El formulario se adapta a lo que elijas.'}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mt-6" role="radiogroup" aria-label={isEn ? 'Content type' : 'Tipo de contenido'}>
                  {tipos.map((t: any) => (
                    <button
                      key={t.slug}
                      role="radio"
                      aria-checked={tipo === t.slug}
                      onClick={() => setTipo(t.slug)}
                      className={`rounded-2xl border-2 p-4 text-left transition-all min-h-[96px] sm:min-h-[104px] flex flex-col justify-between ${
                        tipo === t.slug
                          ? 'border-rotary-blue bg-blue-50/80 shadow-sm'
                          : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="text-2xl sm:text-3xl" aria-hidden>{t.icon || '✨'}</div>
                      <div className="text-xs sm:text-sm font-bold text-gray-700 mt-2 leading-snug">{t.name}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* PASO 2 */}
        {step === 1 && !enviado && (
          <div className={TARJETA + ' space-y-6'}>
            {isFeriaMode ? (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="p-1.5 rounded-lg bg-blue-50 text-rotary-blue border border-blue-200">
                      <Target className="w-5 h-5" />
                    </span>
                    <h2 className="text-lg font-black text-gray-800">
                      {isEn ? 'Project Identification and Evolution' : 'Identificación y Evolución del Proyecto'}
                    </h2>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {isEn
                      ? 'Document the trajectory, objectives, and achieved results to build the historical memory of your initiative at Rotary Project Fair Colombia.'
                      : 'Documenta la trayectoria, objetivos y resultados alcanzados para construir la memoria histórica de tu iniciativa en la Feria de Proyectos Colombia.'}
                  </p>
                </div>

                {/* 1. Vinculación con Ediciones Anteriores */}
                <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="block text-xs font-black text-gray-800 uppercase tracking-wide">
                        {isEn ? 'Did it participate in a previous edition of Rotary Project Fair Colombia?' : '¿Participó en una edición anterior de la Feria de Proyectos Colombia?'}
                      </span>
                      <span className="block text-[11px] text-gray-500 mt-0.5">
                        {isEn ? 'If it was previously submitted, you can link it to its history without creating duplicates.' : 'Si ya fue postulado previamente, puedes vincularlo a su historial sin crear duplicados.'}
                      </span>
                    </div>
                    <div className="inline-flex rounded-xl bg-gray-200/70 p-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setWasInPreviousFair(false);
                          setLinkedProject(null);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          !wasInPreviousFair ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        {isEn ? 'No' : 'No'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setWasInPreviousFair(true)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          wasInPreviousFair ? 'bg-rotary-blue text-white shadow-xs' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        {isEn ? 'Yes' : 'Sí'}
                      </button>
                    </div>
                  </div>

                  {wasInPreviousFair && (
                    <div className="pt-3 border-t border-slate-200 space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className={ROTULO}>{isEn ? 'Fair Edition' : 'Edición de la Feria'}</label>
                          <select
                            className={CAMPO}
                            value={projectFairEdition}
                            onChange={(e) => setProjectFairEdition(e.target.value)}
                          >
                            {FAIR_EDITIONS.map((ed) => (
                              <option key={ed} value={ed}>{ed}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={ROTULO}>{isEn ? 'Search Previous Project to Link' : 'Buscar Proyecto Previo para Vincular'}</label>
                          <div className="relative">
                            <input
                              className={CAMPO}
                              placeholder={isEn ? 'Type the project name or club...' : 'Escribe el nombre del proyecto o club...'}
                              value={fairSearchQuery}
                              onChange={(e) => setFairSearchQuery(e.target.value)}
                            />
                            {fairSearchLoading && (
                              <Loader2 className="absolute right-3.5 top-3.5 w-4 h-4 animate-spin text-rotary-blue" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lista de sugerencias encontradas */}
                      {fairSearchResults.length > 0 && !linkedProject && (
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-md p-2 space-y-1 max-h-48 overflow-y-auto">
                          <p className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider">
                            {isEn ? 'Select to link:' : 'Selecciona para vincular:'}
                          </p>
                          {fairSearchResults.map((res: any) => (
                            <button
                              key={res.id}
                              type="button"
                              onClick={() => {
                                setLinkedProject(res);
                                if (!title) setTitle(res.title || '');
                                if (!club && res.club) setClub(res.club);
                                setFairSearchResults([]);
                                setFairSearchQuery('');
                                toast.success(isEn ? `Project linked: ${res.title}` : `Proyecto vinculado: ${res.title}`);
                              }}
                              className="w-full text-left p-2 rounded-xl hover:bg-blue-50/70 transition flex items-center justify-between text-xs"
                            >
                              <div>
                                <div className="font-bold text-gray-900">{res.title}</div>
                                <div className="text-[11px] text-gray-500">{res.club} {res.edition ? `· ${res.edition}` : ''}</div>
                              </div>
                              <span className="text-[10px] font-bold text-rotary-blue bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                                {isEn ? 'Link' : 'Vincular'}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Proyecto Vinculado Activo */}
                      {linkedProject && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <div>
                              <span className="font-bold">{isEn ? 'Linked to official project: ' : 'Vinculado a proyecto oficial: '}</span>
                              <span>{linkedProject.title} ({linkedProject.club || (isEn ? 'Registered Club' : 'Club Registrado')})</span>
                              {linkedProject.edition && (
                                <span className="ml-1 text-[11px] text-emerald-700 font-semibold">· {linkedProject.edition}</span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setLinkedProject(null)}
                            className="text-emerald-700 hover:text-emerald-900 font-bold underline ml-2"
                          >
                            {isEn ? 'Unlink' : 'Desvincular'}
                          </button>
                        </div>
                      )}

                      <p className="text-[11px] text-slate-500">
                        {isEn
                          ? 'Linking preserves history and evolutionary memory without altering the official data of the original submission.'
                          : 'La vinculación conserva el historial y la memoria evolutiva sin modificar los datos oficiales de la postulación original.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Identificación Fundamental */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em]">
                    {isEn ? 'Fundamental Project Identification' : 'Identificación Fundamental del Proyecto'}
                  </h3>

                  <div>
                    <Etiqueta htmlFor="rea-titulo" tip="titulo">{isEn ? 'Official project name *' : 'Nombre oficial del proyecto *'}</Etiqueta>
                    <input
                      id="rea-titulo"
                      className={CAMPO}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={isEn ? 'E.g.: Seed Bank and Community Gardens in the Valley' : 'Ej: Banco de Semillas y Huertas Comunitarias en el Valle'}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Etiqueta htmlFor="rea-club" tip="club">{isEn ? 'Responsible Rotary Club *' : 'Club Rotario Responsable *'}</Etiqueta>
                      <input
                        id="rea-club"
                        className={CAMPO}
                        list="clubes-distrito"
                        value={club}
                        onChange={(e) => setClub(e.target.value)}
                        placeholder={isEn ? 'Rotary club name' : 'Nombre del club rotario'}
                      />
                      <datalist id="clubes-distrito">{clubesDistrito.map((c) => <option key={c} value={c} />)}</datalist>
                    </div>
                    <div>
                      <Etiqueta tip="distrito">{isEn ? 'Rotary District' : 'Distrito Rotario'}</Etiqueta>
                      <select
                        className={CAMPO}
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                      >
                        <option value="">{isEn ? 'Select District…' : 'Seleccionar Distrito…'}</option>
                        {distritos.map((d: any) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className={ROTULO}>{isEn ? 'Project Country' : 'País del Proyecto'}</label>
                      <input
                        className={CAMPO}
                        value={projectCountry}
                        onChange={(e) => setProjectCountry(e.target.value)}
                        placeholder={isEn ? 'Colombia, Mexico, USA, etc.' : 'Colombia, México, etc.'}
                      />
                    </div>
                    <div>
                      <Etiqueta tip="ciudad">{isEn ? 'Beneficiary City or Region' : 'Ciudad o Región Beneficiaria'}</Etiqueta>
                      <input
                        className={CAMPO}
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder={isEn ? 'Municipality, town, or department' : 'Municipio, vereda o departamento'}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className={ROTULO}>{isEn ? 'Start Year' : 'Año de Inicio'}</label>
                      <input
                        type="number"
                        min="1980"
                        max="2035"
                        className={CAMPO}
                        value={projectStartYear}
                        onChange={(e) => setProjectStartYear(e.target.value)}
                        placeholder="Ej: 2024"
                      />
                    </div>
                    <div>
                      <label className={ROTULO}>{isEn ? 'Current Project Stage' : 'Estado Actual del Proyecto'}</label>
                      <select
                        className={CAMPO}
                        value={projectStage}
                        onChange={(e) => setProjectStage(e.target.value)}
                      >
                        {PROJECT_STAGES.map((s) => (
                          <option key={s.id} value={s.id}>{getProjectStageLabel(s.id, lang)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Etiqueta htmlFor="rea-historia" tip="historia">{isEn ? 'General project description *' : 'Descripción general del proyecto *'}</Etiqueta>
                    <textarea
                      id="rea-historia"
                      className={`${CAMPO} min-h-[120px]`}
                      value={story}
                      onChange={(e) => setStory(e.target.value)}
                      placeholder={isEn ? 'Summarize what the project does, what issue it addresses, background, and community context…' : 'Resume qué hace el proyecto, qué problemática atiende, antecedentes y contexto comunitario…'}
                    />
                  </div>

                  <div>
                    <label className={ROTULO}>{isEn ? 'Project Objectives' : 'Objetivos del Proyecto'}</label>
                    <textarea
                      className={`${CAMPO} min-h-[90px]`}
                      value={projectObjectives}
                      onChange={(e) => setProjectObjectives(e.target.value)}
                      placeholder={isEn ? 'Describe the general and specific objectives pursued by the initiative…' : 'Describe los objetivos generales y específicos que persigue la iniciativa…'}
                    />
                  </div>

                  <div>
                    <label className={ROTULO}>{isEn ? 'Beneficiary Community or Population' : 'Comunidad o Población Beneficiaria'}</label>
                    <input
                      className={CAMPO}
                      value={projectTargetCommunity}
                      onChange={(e) => setProjectTargetCommunity(e.target.value)}
                      placeholder={isEn ? 'E.g.: Rural farming families in the upper basin, rural student community, children…' : 'Ej: Familias campesinas de la cuenca alta, comunidad estudiantil rural, niños y niñas…'}
                    />
                  </div>
                </div>

                {/* 3. Evolución e Impacto */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.15em]">
                      {isEn ? 'Evolution, Results and Impact' : 'Evolución, Resultados e Impacto'}
                    </h3>
                    <button
                      type="button"
                      onClick={pedirAyudaIA}
                      disabled={assistLoading}
                      className="flex items-center gap-1.5 text-xs font-bold text-rotary-blue border border-blue-100 rounded-xl px-2.5 py-1.5 hover:bg-blue-50"
                    >
                      {assistLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>{isEn ? 'AI Assistant' : 'Asistente IA'}</span>
                    </button>
                  </div>

                  {assistQs.length > 0 && (
                    <ul className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1.5 text-sm text-amber-900">
                      {assistQs.map((q, i) => <li key={i}>· {q}</li>)}
                    </ul>
                  )}

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className={ROTULO}>{isEn ? 'Verified Results (Evidence & Facts)' : 'Resultados Comprobados (Evidencias y Hechos)'}</label>
                      <textarea
                        className={`${CAMPO} min-h-[100px]`}
                        value={verifiedResults}
                        onChange={(e) => setVerifiedResults(e.target.value)}
                        placeholder={isEn ? 'Verified achievements with real or certified measurements…' : 'Logros comprobados con mediciones reales o certificadas…'}
                      />
                    </div>
                    <div>
                      <label className={ROTULO}>{isEn ? 'Current Estimates or Projections' : 'Estimaciones o Proyecciones Actuales'}</label>
                      <textarea
                        className={`${CAMPO} min-h-[100px]`}
                        value={estimatedResults}
                        onChange={(e) => setEstimatedResults(e.target.value)}
                        placeholder={isEn ? 'Projected impact or current estimate in progress…' : 'Impacto proyectado o estimación actual en desarrollo…'}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className={ROTULO}>{isEn ? 'Direct Beneficiaries (Approx.)' : 'Beneficiarios Directos (Aprox.)'}</label>
                      <input
                        type="number"
                        className={CAMPO}
                        value={beneficiariesDirect}
                        onChange={(e) => setBeneficiariesDirect(e.target.value)}
                        placeholder={isEn ? 'E.g.: 450' : 'Ej: 450'}
                      />
                    </div>
                    <div>
                      <label className={ROTULO}>{isEn ? 'Indirect Beneficiaries (Approx.)' : 'Beneficiarios Indirectos (Aprox.)'}</label>
                      <input
                        type="number"
                        className={CAMPO}
                        value={beneficiariesIndirect}
                        onChange={(e) => setBeneficiariesIndirect(e.target.value)}
                        placeholder={isEn ? 'E.g.: 1800' : 'Ej: 1800'}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className={ROTULO}>{isEn ? 'Currency' : 'Moneda'}</label>
                      <select
                        className={CAMPO}
                        value={fundsCurrency}
                        onChange={(e) => setFundsCurrency(e.target.value as any)}
                      >
                        <option value="USD">{isEn ? 'USD (US Dollars)' : 'USD (Dólares)'}</option>
                        <option value="COP">{isEn ? 'COP (Col. Pesos)' : 'COP (Pesos Col)'}</option>
                        <option value="EUR">{isEn ? 'EUR (Euros)' : 'EUR (Euros)'}</option>
                      </select>
                    </div>
                    <div>
                      <label className={ROTULO}>{isEn ? 'Managed Resources' : 'Recursos Gestionados'}</label>
                      <input
                        type="number"
                        className={CAMPO}
                        value={fundsManaged}
                        onChange={(e) => setFundsManaged(e.target.value)}
                        placeholder={isEn ? 'Total mobilized amount' : 'Monto total movilizado'}
                      />
                    </div>
                    <div>
                      <label className={ROTULO}>{isEn ? 'Funding Received' : 'Financiación Recibida'}</label>
                      <input
                        className={CAMPO}
                        value={fundsReceived}
                        onChange={(e) => setFundsReceived(e.target.value)}
                        placeholder={isEn ? 'Grants, donations…' : 'Subvenciones, donaciones…'}
                      />
                    </div>
                  </div>

                  {/* Necesidades de financiación si aplica */}
                  {(projectGoalType === 'buscar_aliados_financiacion' || projectStage === 'busqueda_fondos') && (
                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                      <label className="block text-xs font-bold text-amber-900">
                        {isEn ? 'Current Funding or Cooperation Needs *' : 'Necesidades Actuales de Financiación o Cooperación *'}
                      </label>
                      <textarea
                        className={`${CAMPO} min-h-[90px]`}
                        value={currentNeeds}
                        onChange={(e) => setCurrentNeeds(e.target.value)}
                        placeholder={isEn
                          ? 'Detail what funds, equipment, or international counterpart the project needs to be executed or completed…'
                          : 'Detalla qué fondos, equipamiento o contrapartidas internacionales necesita el proyecto para ejecutarse o completarse…'}
                      />
                    </div>
                  )}

                  {/* Alianzas y Cooperación */}
                  <div className="space-y-3 pt-3 border-t border-gray-100">
                    <span className={ROTULO}>{isEn ? 'Partnership Network and International Participation' : 'Red de Alianzas y Participación Internacional'}</span>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className={ROTULO}>{isEn ? 'Participating Organizations' : 'Organizaciones Participantes'}</label>
                        <input
                          className={CAMPO}
                          value={participatingOrgs}
                          onChange={(e) => setParticipatingOrgs(e.target.value)}
                          placeholder={isEn ? 'NGOs, companies, universities, local agencies' : 'ONGs, empresas, universidades, entes locales'}
                        />
                      </div>
                      <div>
                        <label className={ROTULO}>{isEn ? 'Partner Rotary Clubs' : 'Clubes Rotarios Aliados'}</label>
                        <input
                          className={CAMPO}
                          value={partnerClubs}
                          onChange={(e) => setPartnerClubs(e.target.value)}
                          placeholder={isEn ? 'Other collaborating clubs' : 'Otros clubes del país colaboradores'}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={ROTULO}>{isEn ? 'International Participation' : 'Participación Internacional'}</label>
                      <input
                        className={CAMPO}
                        value={internationalParticipation}
                        onChange={(e) => setInternationalParticipation(e.target.value)}
                        placeholder={isEn ? 'Foreign partner clubs, international districts, contributing countries (e.g. Austin Rotary Club, D5870 USA)' : 'Clubes extranjeros aliados, distritos internacionales, países colaboradores (Ej: Club Rotario de Austin, D5870 EE.UU.)'}
                      />
                    </div>
                  </div>

                  {/* Etapas completadas y actividades ejecutadas */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className={ROTULO}>{isEn ? 'Completed Stages' : 'Etapas Completadas'}</label>
                      <textarea
                        className={`${CAMPO} min-h-[80px]`}
                        value={completedStages}
                        onChange={(e) => setCompletedStages(e.target.value)}
                        placeholder={isEn ? 'Phases already completed successfully…' : 'Fases ya ejecutadas satisfactoriamente…'}
                      />
                    </div>
                    <div>
                      <label className={ROTULO}>{isEn ? 'Executed Activities' : 'Actividades Ejecutadas'}</label>
                      <textarea
                        className={`${CAMPO} min-h-[80px]`}
                        value={executedActivities}
                        onChange={(e) => setExecutedActivities(e.target.value)}
                        placeholder={isEn ? 'Field days, trainings, deliveries, workshops…' : 'Jornadas, capacitaciones, entregas, talleres…'}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={ROTULO}>{isEn ? 'New Goals / Next Milestones' : 'Nuevos Objetivos / Próximos Hitos'}</label>
                    <input
                      className={CAMPO}
                      value={futureTargets}
                      onChange={(e) => setFutureTargets(e.target.value)}
                      placeholder={isEn ? 'Next planned goal or expansion phase' : 'Próxima meta o fase de expansión planeada'}
                    />
                  </div>

                  {/* Historia de éxito / testimonios */}
                  {(projectGoalType === 'historia_exito' || projectStage === 'completado') && (
                    <div>
                      <label className={ROTULO}>{isEn ? 'Success Story and Featured Testimonial' : 'Historia de Éxito y Testimonio Destacado'}</label>
                      <textarea
                        className={`${CAMPO} min-h-[100px]`}
                        value={successStory}
                        onChange={(e) => setSuccessStory(e.target.value)}
                        placeholder={isEn
                          ? 'Share the inspiring story of a beneficiary, life testimonial, or human impact demonstrating the value of Rotary…'
                          : 'Comparte el relato inspirador de un beneficiario, testimonio de vida o impacto humano que demuestre el valor de Rotary…'}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Bloque estándar de Rotary en Acción */
              <>
                <div>
                  <h2 className="text-lg font-black text-gray-800">{isEn ? 'Tell us the story' : 'Cuéntanos la historia'}</h2>
                  <p className="text-sm text-gray-500 mt-1">{isEn ? 'Your club does extraordinary things. Tell us what you are doing and we will help you communicate it.' : 'Tu club hace cosas extraordinarias. Cuéntanos qué está haciendo y nosotros te ayudamos a comunicarlo.'}</p>
                </div>
                <div><Etiqueta htmlFor="rea-titulo" tip="titulo">{isEn ? 'Initiative title or name' : 'Título o nombre de la iniciativa'}</Etiqueta>
                  <input id="rea-titulo" className={CAMPO} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isEn ? 'Tree planting day in…' : 'Jornada de reforestación en…'} aria-describedby="tip-titulo" /></div>
                <div><Etiqueta htmlFor="rea-historia" tip="historia">{isEn ? 'Tell us what your club did' : 'Cuéntanos qué hizo tu club'}</Etiqueta>
                  <textarea id="rea-historia" className={`${CAMPO} min-h-[140px]`} value={story} onChange={(e) => setStory(e.target.value)} placeholder={isEn ? 'Tell it in your own words…' : 'Cuéntalo con tus palabras…'} aria-describedby="tip-historia" /></div>
                <button onClick={pedirAyudaIA} disabled={assistLoading} className="flex items-center gap-2 text-xs font-bold text-rotary-blue border border-blue-100 rounded-xl px-3 py-2.5">
                  {assistLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {isEn ? 'Help me tell it better' : 'Ayúdame a contarlo mejor'}
                </button>
                {assistQs.length > 0 && (
                  <ul className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1.5 text-sm text-amber-900">
                    {assistQs.map((q, i) => <li key={i}>· {q}</li>)}
                  </ul>
                )}
                {/* Bloque de emergencia: solo cuando el tipo lo justifica */}
                {tipo === 'emergencia' && (
                  <div className="bg-red-50/60 border border-red-100 rounded-2xl p-4">
                    <span className={ROTULO}>{isEn ? 'Emergency details (optional)' : 'Información de la emergencia (opcional)'}</span>
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
                  <div><Etiqueta tip="fecha">{isEn ? 'Activity date' : 'Fecha de la actividad'}</Etiqueta><input type="date" className={CAMPO} value={activityDate} onChange={(e) => setActivityDate(e.target.value)} aria-describedby="tip-fecha" /></div>
                  <div><Etiqueta tip="ciudad">{isEn ? 'City / municipality' : 'Ciudad / municipio'}</Etiqueta><input className={CAMPO} value={city} onChange={(e) => setCity(e.target.value)} aria-describedby="tip-ciudad" /></div>
                </div>
                {cond.impacto.length > 0 && (
                  <div>
                    <span className={ROTULO}>{isEn ? 'Results or impact (optional)' : 'Resultados o impacto (opcional)'}<InfoTip tipKey="impacto" /></span>
                    <div className="grid grid-cols-2 gap-3">
                      {cond.impacto.map((k) => (
                        <div key={k}><label className="sr-only" htmlFor={`rea-imp-${k}`}>{IMPACT_META[k]?.label || k}</label>
                          <input id={`rea-imp-${k}`} className={CAMPO} inputMode={IMPACT_META[k]?.kind === 'text' ? 'text' : 'numeric'} value={impact[k] || ''} onChange={(e) => setImpact({ ...impact, [k]: e.target.value })} placeholder={IMPACT_META[k]?.label || k} aria-label={IMPACT_META[k]?.label || k} /></div>
                      ))}
                    </div>
                  </div>
                )}
                <details className="bg-gray-50 rounded-2xl px-4 py-3">
                  <summary className="text-xs font-bold text-gray-500 cursor-pointer">{isEn ? 'Relationship with programs and topics (optional)' : 'Relación con programas y temas (opcional)'}</summary>
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    <div><Etiqueta tip="area">{isEn ? 'Area of focus' : 'Área de interés'}</Etiqueta>
                      <select className={CAMPO} value={area} onChange={(e) => setArea(e.target.value)} aria-describedby="tip-area"><option value="">{isEn ? 'No specific area' : 'Sin área específica'}</option>{areas.map((a: any) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
                    <div><Etiqueta tip="programa">{isEn ? 'Program' : 'Programa'}</Etiqueta>
                      <select className={CAMPO} value={programa} onChange={(e) => setPrograma(e.target.value)} aria-describedby="tip-programa"><option value="">{isEn ? 'No specific program' : 'Sin programa específico'}</option>{programas.map((a: any) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
                    <div><Etiqueta tip="tema">{isEn ? 'Topic' : 'Temática'}</Etiqueta>
                      <select className={CAMPO} value={tema} onChange={(e) => setTema(e.target.value)} aria-describedby="tip-tema"><option value="">{isEn ? 'No specific topic' : 'Sin temática específica'}</option>{temas.map((a: any) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
                    <div><Etiqueta tip="tags">{isEn ? 'Tags (comma separated)' : 'Etiquetas (comas)'}</Etiqueta>
                      <input className={CAMPO} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder={isEn ? 'youth, christmas' : 'juventud, navidad'} aria-describedby="tip-tags" /></div>
                    <div className="sm:col-span-2"><Etiqueta tip="aliados">{isEn ? 'Partners (optional)' : 'Aliados (opcional)'}</Etiqueta>
                      <input className={CAMPO} value={extraFields.aliados || ''} onChange={(e) => setExtraFields({ ...extraFields, aliados: e.target.value })} placeholder={isEn ? 'Supporting organizations or companies' : 'Organizaciones o empresas que apoyaron'} aria-describedby="tip-aliados" /></div>
                  </div>
                </details>
              </>
            )}
          </div>
        )}

        {/* PASO 3 */}
        {step === 2 && !enviado && (
          <div className={TARJETA + ' space-y-5'}>
            <div>
              <h2 className="text-lg font-black text-gray-800">{isEn ? 'Evidence and Contact' : 'Evidencias y contacto'}</h2>
              <p className="text-sm text-gray-500 mt-1">{isEn ? `${selectedImages.length} of ${MIN_PHOTOS} minimum · ${advice.text}` : `${selectedImages.length} de ${MIN_PHOTOS} mínima(s) · ${advice.text}`}</p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-6 sm:p-8 text-center hover:border-rotary-blue hover:bg-blue-50/20 transition-all cursor-pointer"
            >
              <Upload className="w-8 h-8 mx-auto text-gray-400" />
              <div className="text-sm font-bold text-gray-700 mt-2">{isEn ? 'Tap here to choose, or drag photos or video' : 'Tocá acá para elegir, o arrastrá las fotos o video'}</div>
              <div className="text-xs text-gray-400 mt-1">{isEn ? 'From your phone, the camera or gallery will open (Min 5 photos, max 10 photos and 1 video · max 5 MB per photo, 300 MB video).' : 'Desde el teléfono se abre la cámara o la galería (Mínimo 5 fotos, máx 10 fotos y 1 video · máx 5 MB por foto, 300 MB el video).'}</div>
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
                            <CheckCircle2 className="w-3 h-3" /> {isEn ? 'Upload complete' : 'Carga completada'}
                          </span>
                        )}
                        {a.estado === 'uploading' && (
                          <span className="inline-flex items-center gap-1 text-blue-300 font-bold">
                            <Loader2 className="w-3 h-3 animate-spin" /> {isEn ? `Uploading ${a.progreso}%` : `Subiendo ${a.progreso}%`}
                          </span>
                        )}
                        {a.estado === 'pending' && (
                          <span className="text-amber-300 font-bold">{isEn ? 'Pending' : 'Pendiente'}</span>
                        )}
                        {a.estado === 'error' && (
                          <span className="text-red-400 font-bold">{isEn ? 'Error' : 'Error'}</span>
                        )}
                        {a.estado === 'too-heavy' && (
                          <span className="text-orange-300 font-bold">{isEn ? 'File too heavy' : 'Archivo demasiado pesado'}</span>
                        )}
                        {a.estado === 'duplicate' && (
                          <span className="text-violet-300 font-bold">{isEn ? 'Duplicate file' : 'Archivo duplicado'}</span>
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
                          <RotateCcw className="w-3 h-3" /> {isEn ? 'Retry' : 'Reintentar'}
                        </button>
                      )}
                    </div>

                    {/* Aviso de baja resolución */}
                    {a.width != null && a.width < 800 && (
                      <div className="absolute top-2 left-2 bg-amber-500/90 backdrop-blur-sm text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                        {isEn ? 'Low resolution' : 'Baja resolución'}
                      </div>
                    )}

                    {/* Botón para quitar evidencia */}
                    <button
                      type="button"
                      onClick={() => quitarArchivo(a.id)}
                      aria-label={isEn ? `Remove ${a.file.name}` : `Quitar ${a.file.name}`}
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
                  <span className="font-black text-amber-900">{isEn ? `Missing ${faltanFotos} photo(s): ` : `Faltan ${faltanFotos} fotografía(s): `}</span>
                  <span>
                    {isEn
                      ? `You have uploaded ${fotosValidas} of the ${MIN_PHOTOS} required (only successfully uploaded ones count). Please select at least ${MIN_PHOTOS} photos to proceed to the submit step.`
                      : `Has cargado ${fotosValidas} de las ${MIN_PHOTOS} requeridas (cuentan solo las cargadas con éxito). Por favor selecciona al menos ${MIN_PHOTOS} fotografías para poder continuar al paso de envío.`}
                  </span>
                </div>
              </div>
            )}

            {/* Aviso azul si se están subiendo evidencias */}
            {faltanFotos === 0 && haySubiendo && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center gap-2.5 text-blue-900 text-xs font-bold">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                <span>{isEn ? `Uploading evidence to secure server (${uploadedImages.length + uploadedVideos.length} of ${enCupo.length} completed)...` : `Subiendo evidencias al servidor seguro (${uploadedImages.length + uploadedVideos.length} de ${enCupo.length} completadas)...`}</span>
              </div>
            )}

            {/* Aviso rojo si algún archivo falló al subir */}
            {hayErrores && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center justify-between gap-2 text-red-900 text-xs font-bold">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{isEn ? 'One or more files could not be uploaded. Tap "Retry" on the card or remove them to continue.' : 'Uno o más archivos no se pudieron cargar. Tocá "Reintentar" en la tarjeta o elimínalos para continuar.'}</span>
                </div>
              </div>
            )}

            {/* Aviso gris si hay archivos rechazados (peso o duplicados): no se
                reintentan, se quitan */}
            {hayRechazados && (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 flex items-center gap-2 text-gray-700 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-gray-500 shrink-0" />
                <span>{isEn ? 'There are files that cannot be sent (too heavy or duplicates). Remove them with the × on the card to continue.' : 'Hay archivos que no se pueden enviar (demasiado pesados o duplicados). Eliminalos con la × de la tarjeta para continuar.'}</span>
              </div>
            )}

            {/* Banner verde cuando se cumple todo y están cargadas */}
            {faltanFotos === 0 && !haySubiendo && !hayErrores && !hayRechazados && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center gap-2 text-emerald-900 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{isEn ? `${fotosValidas} photos ${uploadedVideos.length > 0 ? `+ ${uploadedVideos.length} video ` : ''}uploaded successfully. You can continue to the submit step.` : `${fotosValidas} fotografías ${uploadedVideos.length > 0 ? `+ ${uploadedVideos.length} video ` : ''}cargadas con éxito. Puedes continuar al paso de envío.`}</span>
              </div>
            )}
            <div>
              <Etiqueta htmlFor="rea-enlaces" tip="enlaces">{isEn ? 'Related documents or links (optional)' : 'Documentos o enlaces relacionados (opcional)'}</Etiqueta>
              <div className="flex flex-wrap gap-1.5 mb-2">{enlaces.map((u) => <span key={u} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1 max-w-full"><span className="truncate max-w-[220px]">{u}</span><button onClick={() => setEnlaces(enlaces.filter((x) => x !== u))} aria-label={isEn ? 'Remove link' : 'Quitar enlace'}><X className="w-3 h-3" /></button></span>)}</div>
              <div className="flex gap-2"><input id="rea-enlaces" className={CAMPO} value={nuevoEnlace} onChange={(e) => setNuevoEnlace(e.target.value)} placeholder="https://…" inputMode="url" aria-describedby="tip-enlaces" />
                <button onClick={() => { const u = nuevoEnlace.trim(); if (u && enlaces.length < 5) setEnlaces([...enlaces, u]); setNuevoEnlace(''); }} className="px-4 rounded-xl bg-gray-100 font-bold" aria-label={isEn ? 'Add link' : 'Agregar enlace'}><Plus className="w-4 h-4" /></button></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Etiqueta tip="distrito">{isEn ? 'District' : 'Distrito'}</Etiqueta>
                <select className={CAMPO} value={district} onChange={(e) => { setDistrict(e.target.value); setClub(''); setClubes([]); }} aria-describedby="tip-distrito">
                  <option value="">{isEn ? 'Select…' : 'Seleccionar…'}</option>{distritos.map((d: any) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select></div>
              <div><Etiqueta htmlFor="rea-club" tip="club">{isEn ? 'Rotary Club' : 'Club Rotario'}</Etiqueta>
                <input id="rea-club" className={CAMPO} list="clubes-distrito" value={club} onChange={(e) => setClub(e.target.value)} placeholder={isEn ? 'Club name' : 'Nombre del club'} aria-describedby="tip-club" />
                <datalist id="clubes-distrito">{clubesDistrito.map((c) => <option key={c} value={c} />)}</datalist></div>
            </div>
            <div>
              <Etiqueta tip="clubes">{isEn ? 'Other participating clubs (optional)' : 'Otros clubes participantes (opcional)'}</Etiqueta>
              <div className="flex flex-wrap gap-1.5 mb-2">{clubes.map((c) => <span key={c} className="bg-blue-50 text-blue-800 text-xs font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1">{c}<button onClick={() => setClubes(clubes.filter((x) => x !== c))} aria-label={isEn ? 'Remove club' : 'Quitar club'}><X className="w-3 h-3" /></button></span>)}</div>
              <div className="flex gap-2"><input className={CAMPO} list="clubes-distrito" value={nuevoClub} onChange={(e) => setNuevoClub(e.target.value)} placeholder={isEn ? 'Add club…' : 'Agregar club…'} />
                <button onClick={() => { if (nuevoClub.trim() && !clubes.includes(nuevoClub.trim())) setClubes([...clubes, nuevoClub.trim()]); setNuevoClub(''); }} className="px-4 rounded-xl bg-gray-100 font-bold" aria-label={isEn ? 'Add club' : 'Agregar club'}><Plus className="w-4 h-4" /></button></div>
            </div>
            {conPrefill && <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">{isEn ? 'We prefilled some data with ecosystem information. Please review before submitting.' : 'Completamos algunos datos con información del ecosistema. Verifícalos antes de enviar.'}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Etiqueta htmlFor="rea-nombre" tip="nombre">{isEn ? 'Sender name' : 'Nombre de quien envía'}</Etiqueta><input id="rea-nombre" className={CAMPO} value={senderName} onChange={(e) => setSenderName(e.target.value)} autoComplete="name" aria-describedby="tip-nombre" /></div>
              <div><Etiqueta htmlFor="rea-cargo" tip="cargo">{isEn ? 'Role or relationship with the club' : 'Cargo o relación con el club'}</Etiqueta><input id="rea-cargo" className={CAMPO} value={role} onChange={(e) => setRole(e.target.value)} placeholder={isEn ? 'President, member…' : 'Presidente, socio…'} aria-describedby="tip-cargo" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Etiqueta htmlFor="rea-email" tip="email">{isEn ? 'Email address' : 'Correo electrónico'}</Etiqueta><input id="rea-email" type="email" className={CAMPO} value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} autoComplete="email" aria-describedby="tip-email" /></div>
              <div><Etiqueta htmlFor="rea-tel" tip="telefono">{isEn ? 'Phone / WhatsApp' : 'Teléfono / WhatsApp'}</Etiqueta>
                <div className="flex gap-2 items-stretch">
                  <CountryPicker value={phoneCountry} onChange={setPhoneCountry} />
                  <input id="rea-tel" className={`${CAMPO} flex-1 min-w-0`} value={phoneNational} onChange={(e) => setPhoneNational(e.target.value)} inputMode="tel" autoComplete="tel-national" aria-describedby="tip-telefono" placeholder="300 123 4567" />
                </div></div>
            </div>
            <div className="space-y-3">
              <label className="flex gap-3 items-start bg-gray-50 rounded-2xl p-4 cursor-pointer">
                <input type="checkbox" checked={quiereResultados} onChange={(e) => setQuiereResultados(e.target.checked)} className="mt-1 w-5 h-5 shrink-0 accent-[#0c3c7c]" />
                <span className="text-sm text-gray-700"><b>{isEn ? 'I want to receive the results of this story' : 'Quiero recibir los resultados de esta historia'}</b>
                  <span className="block text-gray-500 text-[13px] mt-0.5">{isEn ? 'I want to receive email reports or updates on the reach, visibility, and impact metrics generated by this story on District 4281 digital channels.' : 'Deseo recibir por correo electrónico reportes o actualizaciones sobre el alcance, difusión y métricas de impacto que genere esta historia en los canales digitales del Distrito 4281.'}</span></span>
              </label>
              <label className="flex gap-3 items-start bg-gray-50 rounded-2xl p-4 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 w-5 h-5 shrink-0 accent-[#0c3c7c]" />
                <span className="text-sm text-gray-700"><b>{isEn ? 'I authorize the use of the content' : 'Autorizo el uso del contenido'}</b>
                  <span className="block text-gray-500 text-[13px] mt-0.5">{isEn ? <>I authorize the processing and use of the content, photographs, videos, and information submitted through Rotary in Action for institutional communication and dissemination purposes, in accordance with the applicable <a href="https://my.rotary.org/terms-of-use" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline font-bold">Terms of Use</a> and <a href="https://my.rotary.org/privacy-policy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline font-bold">Privacy Policy</a>.</> : <>Autorizo el tratamiento y uso del contenido, fotografías, videos e información que envío a través de Rotary en Acción para fines de comunicación y difusión institucional, de acuerdo con los <a href="https://my.rotary.org/terms-of-use" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline font-bold">Términos de Servicio</a> y la <a href="https://my.rotary.org/privacy-policy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline font-bold">Política de Privacidad</a> aplicables.</>}</span>
                  <span className="block text-gray-400 text-xs mt-1">{isEn ? 'Required to publish your story.' : 'La necesitamos para poder publicar tu historia.'}</span></span>
              </label>
            </div>
            <button onClick={guardarBorrador} disabled={draftSaving} className="flex items-center gap-2 text-xs font-bold text-gray-500">
              {draftSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {isEn ? 'Save and continue later' : 'Guardar y continuar después'}
            </button>
            {draftToken && <div className="text-xs text-gray-500 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> {isEn ? 'Your link to continue: ' : 'Tu enlace para continuar: '}<code className="bg-gray-100 px-1.5 py-0.5 rounded">?draft={draftToken}</code></div>}
          </div>
        )}

        {/* PASO 4 */}
        {step === 3 && !enviado && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">
              {isFeriaMode
                ? (isEn ? 'Review and submit your project to the Fair' : 'Revisá y enviá tu proyecto a la Feria')
                : (isEn ? 'Review and submit' : 'Revisá y enviá')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isFeriaMode
                ? (isEn
                    ? 'Verify details and impact before submitting to Rotary Project Fair Colombia.'
                    : 'Verifica los datos e impacto antes de enviar a la Feria de Proyectos Colombia.')
                : (isEn
                    ? 'Everything in order before submitting to Rotary in Action.'
                    : 'Todo en orden antes de enviar a Rotary en Acción.')}
            </p>
            <div className="mt-2">
              {isFeriaMode ? (
                <>
                  <Bloque titulo={isEn ? 'Area of Focus and Purpose' : 'Área de Interés y Propósito'} paso={0} onEdit={irA} editLabel={isEn ? 'Edit' : 'Editar'}>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-gray-800">
                        {getRotaryAreaName(areaPrincipal, lang) || areaPrincipal}
                        {areaPrincipal === 'otros' && otrosEspecificacion && (
                          <span className="text-xs text-amber-700 font-semibold ml-1">
                            ({otrosEspecificacion})
                          </span>
                        )}
                      </p>
                      {areasSecundarias.length > 0 && (
                        <p className="text-xs text-gray-500">
                          {isEn ? 'Secondary areas: ' : 'Áreas secundarias: '}
                          {areasSecundarias.map((s) => getRotaryAreaName(s, lang) || s).join(', ')}
                        </p>
                      )}
                      <p className="text-xs text-rotary-blue font-bold">
                        {isEn ? 'Purpose: ' : 'Propósito: '}
                        {getProjectGoalLabel(projectGoalType, lang) || projectGoalType}
                      </p>
                    </div>
                  </Bloque>

                  <Bloque titulo={isEn ? 'Identification and Evolution' : 'Identificación y Evolución'} paso={1} onEdit={irA} editLabel={isEn ? 'Edit' : 'Editar'}>
                    <div className="space-y-1.5">
                      <p className="text-sm font-bold text-gray-800">{title || (isEn ? 'Untitled project' : 'Sin nombre')}</p>
                      <p className="text-xs text-gray-600">
                        {[club, district, projectCountry, city].filter(Boolean).join(' · ')}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-rotary-blue border border-blue-100">
                          {getProjectStageLabel(projectStage, lang) || projectStage}
                        </span>
                        {projectStartYear && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {isEn ? 'Start: ' : 'Inicio: '}{projectStartYear}
                          </span>
                        )}
                        {linkedProject ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {isEn ? 'Linked: ' : 'Vinculado: '}{linkedProject.title} {linkedProject.edition ? `(${linkedProject.edition})` : ''}
                          </span>
                        ) : wasInPreviousFair ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {isEn ? 'Previous edition: ' : 'Edición anterior: '}{projectFairEdition}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {isEn ? 'New project at the Fair' : 'Proyecto nuevo en Feria'}
                          </span>
                        )}
                      </div>

                      {story && (
                        <p className="text-xs text-gray-600 line-clamp-3 pt-1">{story}</p>
                      )}

                      <div className="pt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] border-t border-gray-100">
                        {(beneficiariesDirect || beneficiariesIndirect) && (
                          <div>
                            <span className="text-gray-400 block">{isEn ? 'Beneficiaries' : 'Beneficiarios'}</span>
                            <span className="font-bold text-gray-700">
                              {beneficiariesDirect ? `${beneficiariesDirect} ${isEn ? 'direct' : 'directos'}` : ''}
                              {beneficiariesDirect && beneficiariesIndirect ? ' / ' : ''}
                              {beneficiariesIndirect ? `${beneficiariesIndirect} ${isEn ? 'indirect' : 'indirectos'}` : ''}
                            </span>
                          </div>
                        )}
                        {fundsManaged && (
                          <div>
                            <span className="text-gray-400 block">{isEn ? 'Managed' : 'Gestionados'}</span>
                            <span className="font-bold text-emerald-700">
                              {fundsCurrency} {Number(fundsManaged).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {fundsReceived && (
                          <div>
                            <span className="text-gray-400 block">{isEn ? 'Received' : 'Recibidos'}</span>
                            <span className="font-bold text-blue-700">
                              {fundsCurrency} {Number(fundsReceived).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {verifiedResults && (
                        <p className="text-xs text-gray-600 pt-1">
                          <strong className="text-gray-700">{isEn ? 'Verified results: ' : 'Resultados comprobados: '}</strong>{verifiedResults}
                        </p>
                      )}
                      {currentNeeds && (
                        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2 mt-1">
                          <strong>{isEn ? 'Funding needs: ' : 'Necesidades de financiación: '}</strong>{currentNeeds}
                        </p>
                      )}
                      {internationalParticipation && (
                        <p className="text-xs text-slate-700 pt-0.5">
                          <strong>{isEn ? 'International alliance: ' : 'Alianza internacional: '}</strong>{internationalParticipation}
                        </p>
                      )}
                    </div>
                  </Bloque>

                  <Bloque titulo={isEn ? 'Evidence and Contact' : 'Evidencias y Contacto'} paso={2} onEdit={irA} editLabel={isEn ? 'Edit' : 'Editar'}>
                    <div className="space-y-2">
                      <p className="text-sm">
                        <strong>{isEn ? `${selectedImages.length} photo(s)` : `${selectedImages.length} fotografía(s)`}</strong>
                        {videos.length > 0 && (isEn ? ` · ${videos.length} video(s)` : ` · ${videos.length} video(s)`)}
                        {enlaces.length > 0 && (isEn ? ` · ${enlaces.length} link(s)` : ` · ${enlaces.length} enlace(s)`)} · {club || (isEn ? 'No club specified' : 'Sin club')} · {senderName} ({senderEmail})
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
                      {phoneNational && (
                        <p className="text-xs text-gray-500">
                          {isEn ? 'Contact: ' : 'Contacto: '}{phoneCountry} {phoneNational} {role ? `(${role})` : ''}
                        </p>
                      )}
                      {quiereResultados && (
                        <p className="text-xs text-gray-500">{isEn ? 'Wants to receive dissemination updates and results.' : 'Quiere recibir actualizaciones y resultados de difusión.'}</p>
                      )}
                    </div>
                  </Bloque>
                </>
              ) : (
                <>
                  <Bloque titulo={isEn ? 'Content type' : 'Tipo de contenido'} paso={0} onEdit={irA} editLabel={isEn ? 'Edit' : 'Editar'}><p className="text-sm font-bold">{tipoNombre || '—'}</p></Bloque>
                  <Bloque titulo={isEn ? 'Story' : 'Historia'} paso={1} onEdit={irA} editLabel={isEn ? 'Edit' : 'Editar'}>
                    <p className="text-sm font-bold">{title || (isEn ? 'Untitled' : 'Sin título')}</p>
                    {story && <p className="text-sm text-gray-600 mt-1 line-clamp-4">{story}</p>}
                    {(activityDate || city || location) && <p className="text-xs text-gray-400 mt-1">{[activityDate, city, location].filter(Boolean).join(' · ')}</p>}
                    {impactoCargado.length > 0 && <p className="text-xs text-gray-500 mt-1">{impactoCargado.map(([k, v]) => `${IMPACT_META[k]?.label || k}: ${v}`).join(' · ')}</p>}
                  </Bloque>
                  <Bloque titulo={isEn ? 'Evidence and contact' : 'Evidencias y contacto'} paso={2} onEdit={irA} editLabel={isEn ? 'Edit' : 'Editar'}>
                    <div className="space-y-2">
                      <p className="text-sm">
                        <strong>{isEn ? `${selectedImages.length} photo(s)` : `${selectedImages.length} fotografía(s)`}</strong>{videos.length > 0 && (isEn ? ` · ${videos.length} video(s)` : ` · ${videos.length} video(s)`)} · {club || (isEn ? 'No club specified' : 'Sin club')} · {senderName} ({senderEmail})
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
                      {quiereResultados && <p className="text-xs text-gray-500 mt-1">{isEn ? 'Wants to receive dissemination results.' : 'Quiere recibir los resultados de la historia.'}</p>}
                    </div>
                  </Bloque>
                </>
              )}
            </div>

            <button
              onClick={enviar}
              disabled={enviando}
              className={`mt-4 w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-white text-base font-black min-h-[56px] disabled:opacity-60 transition-all ${
                isFeriaMode
                  ? 'bg-gradient-to-r from-rotary-blue to-blue-900 hover:from-blue-900 hover:to-rotary-blue shadow-md'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {enviando ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isFeriaMode ? (
                <Award className="w-5 h-5 text-amber-400" />
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
              {isFeriaMode
                ? (isEn ? 'Submit to Rotary Project Fair Colombia' : 'Enviar a la Feria de Proyectos Colombia')
                : (isEn ? 'Submit to Rotary in Action' : 'Enviar a Rotary en Acción')}
            </button>
            <p className="text-xs text-gray-400 mt-3 text-center">
              {isFeriaMode
                ? (isEn
                    ? 'Your project enters the Rotary Project Fair Colombia inbox. The committee reviews the information and coordinates national and international outreach.'
                    : 'Tu proyecto entra en la bandeja de la Feria de Proyectos Colombia. El comité revisa la información y coordina su difusión nacional e internacional.')
                : (isEn
                    ? 'Your submission enters “Received”. Nothing is published automatically: the team reviews it and notifies you when published.'
                    : 'Tu solicitud entra en “Recibido”. Nada se publica solo: el equipo la revisa y te avisa al publicarla.')}
            </p>
          </div>
        )}

        {/* Confirmación */}
        {enviado && (
          <div className={TARJETA + ' text-center'}>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-black text-gray-800 mt-3">
              {isFeriaMode
                ? (isEn
                    ? 'Thank you for sharing your project with Rotary Project Fair Colombia!'
                    : '¡Gracias por compartir tu iniciativa con la Feria de Proyectos Colombia!')
                : (isEn
                    ? 'Thank you for sharing what your club does'
                    : 'Gracias por compartir lo que hace tu club')}
            </h2>
            <dl className="text-sm mt-4 space-y-1.5 text-left max-w-sm mx-auto">
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32">{isEn ? 'Submission No.' : 'N.º de solicitud'}</dt>
                <dd className="font-mono font-bold">{String(enviado.id).slice(0, 8)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32">{isFeriaMode ? (isEn ? 'Channel' : 'Canal') : (isEn ? 'Type' : 'Tipo')}</dt>
                <dd className="font-bold">{isFeriaMode ? (isEn ? 'Rotary Project Fair Colombia' : 'Feria de Proyectos Colombia') : (tipoNombre || '—')}</dd>
              </div>
              {isFeriaMode && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-32">{isEn ? 'Area of Focus' : 'Área de Interés'}</dt>
                  <dd className="font-semibold text-rotary-blue">
                    {getRotaryAreaName(areaPrincipal, lang) || '—'}
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32">{isFeriaMode ? (isEn ? 'Project' : 'Proyecto') : (isEn ? 'Activity' : 'Actividad')}</dt>
                <dd className="font-bold">{title || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32">{isEn ? 'Club' : 'Club'}</dt>
                <dd>{club || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32">{isEn ? 'Material' : 'Material'}</dt>
                <dd>
                  {isEn
                    ? `${selectedImages.length} photo(s)${videos.length > 0 ? ` + ${videos.length} video` : ''}`
                    : `${selectedImages.length} fotografía(s)${videos.length > 0 ? ` + ${videos.length} video` : ''}`}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 w-32">{isEn ? 'Initial status' : 'Estado inicial'}</dt>
                <dd className="text-emerald-700 font-bold">{isEn ? 'Received' : 'Recibido'}</dd>
              </div>
            </dl>
            <p className="text-xs text-gray-500 mt-4">
              {isFeriaMode
                ? (isEn
                    ? 'What is next: The Rotary Project Fair Colombia committee reviews information and evidence, documents historical evolution, and coordinates national and international outreach.'
                    : 'Qué sigue: El comité de la Feria de Proyectos Colombia revisa la información y evidencias, documenta la evolución histórica y coordina su difusión nacional e internacional.')
                : (isEn
                    ? 'What is next: The team reviews your story, turns it into content, and sends you the link when published.'
                    : 'Qué sigue: el equipo revisa tu historia, la convierte en contenido y te envía el enlace cuando se publique.')}
            </p>
            {enviado.warnings?.length > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mt-4 text-left">
                {enviado.warnings.slice(0, 3).map((w: string, i: number) => <div key={i}>· {w}</div>)}
              </div>
            )}
          </div>
        )}

        {errores.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 space-y-1" role="alert">{errores.map((e, i) => <div key={i}>· {e}</div>)}</div>
        )}

        {/* Navegación */}
        {!enviado && (
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => irA(Math.max(0, step - 1))}
              disabled={step === 0}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl border text-sm font-bold text-gray-500 disabled:opacity-40 min-h-[52px] bg-white hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" /> {isEn ? 'Back' : 'Atrás'}
            </button>
            {step < 3 ? (
              <button
                onClick={() => irA(step + 1)}
                className="flex items-center gap-1.5 px-6 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold min-h-[52px] hover:bg-blue-900 transition-colors"
              >
                {isEn ? 'Next' : 'Siguiente'} <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={enviar}
                disabled={enviando}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-bold min-h-[52px] disabled:opacity-60 transition-colors ${
                  isFeriaMode ? 'bg-rotary-blue hover:bg-blue-900' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : isFeriaMode ? <Award className="w-4 h-4 text-amber-400" /> : null}
                {isFeriaMode
                  ? (isEn ? 'Submit to Project Fair' : 'Enviar a la Feria de Proyectos')
                  : (isEn ? 'Submit to Rotary in Action' : 'Enviar a Rotary en Acción')}
              </button>
            )}
          </div>
        )}
        <p className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1">
          <Users className="w-3 h-3" />
          {isFeriaMode
            ? (isEn ? 'Rotary Project Fair Colombia · Rotary International' : 'Feria de Proyectos Colombia · Rotary International')
            : `Rotary en Acción · ${cfg?.site?.name || (isEn ? 'District 4281' : 'Distrito 4281')}`}{' '}
          <MapPin className="w-3 h-3" />
        </p>
      </div>
    </Marco>
  );
}
