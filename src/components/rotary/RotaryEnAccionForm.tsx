import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Upload, X, Image as ImageIcon, Film, Loader2, CheckCircle2,
  AlertTriangle, MapPin, Users, Plus, ArrowLeft, ArrowRight, Sparkles, Save, Link2, Pencil,
} from 'lucide-react';
import { useSEO } from '../../hooks/useSEO';
import Navbar from '../../sections/Navbar';
import Footer from '../../sections/Footer';
import { ACCEPT_ATTR, MAX_FILES, checkFileMeta } from '../../lib/contentSubmissionSpec';
import { COUNTRIES, DEFAULT_COUNTRY, findCountry } from '../../lib/countryPhones';
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

const PASOS = ['Qué quieres compartir', 'Cuéntanos', 'Evidencias y contacto', 'Revisar y enviar'];

const leerJson = async (r: Response) => {
  const texto = await r.text();
  try { return JSON.parse(texto); } catch {
    throw new Error(`El servidor respondió ${r.status} en vez de JSON.`);
  }
};

type Adjunto = {
  id: string; file: File; key?: string; estado: 'pendiente' | 'subiendo' | 'listo' | 'error';
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

  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<any>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [assistQs, setAssistQs] = useState<string[]>([]);
  const [assistLoading, setAssistLoading] = useState(false);
  const [draftToken, setDraftToken] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [conPrefill, setConPrefill] = useState(false);
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
          district, club, clubes, senderName, senderEmail, role, extraFields, impact,
        }));
      } catch { /* noop */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [tipo, title, story, area, programa, tema, tagsText, city, location, activityDate, district, club, clubes, senderName, senderEmail, role, extraFields, impact, cargando, enviado]);

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
        }
      } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando]);

  const rules = cfg?.photoRules || { minToSubmit: 1, recommended: 3, reelMin: 5, maxFiles: 10 };
  const listos = adjuntos.filter((a) => a.estado === 'listo');
  const advice = photoAdvice(listos.length, rules);
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
      const out = [...prev];
      for (const f of arr.slice(0, Math.max(0, room))) {
        const meta = checkFileMeta({ name: f.name, type: f.type, size: f.size });
        if (!meta.ok) { setErrores((e) => [...e, `${f.name}: ${meta.error}`]); continue; }
        if (out.some((a) => a.file.name === f.name && a.file.size === f.size)) continue;
        const item: Adjunto = { id: nuevoId(), file: f, estado: 'pendiente', progreso: 0 };
        out.push(item);
        if (f.type.startsWith('image/')) {
          const url = URL.createObjectURL(f);
          const img = new Image();
          img.onload = () => {
            setAdjuntos((cur) => cur.map((a) => (a.id === item.id ? { ...a, width: img.width, height: img.height } : a)));
            URL.revokeObjectURL(url);
          };
          img.src = url;
        }
      }
      return out;
    });
  };

  const subirUno = async (a: Adjunto): Promise<string> => {
    const r = await fetch(`${API}/rotary-en-accion/presign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: cfg?.campaign?.id || undefined, contentType: a.file.type, filename: a.file.name, size: a.file.size }),
    });
    const data = await leerJson(r);
    if (!r.ok) throw new Error(data?.error || 'No se pudo preparar la carga.');
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      xhr.setRequestHeader('Content-Type', a.file.type);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setAdjuntos((prev) => prev.map((x) => (x.id === a.id ? { ...x, estado: 'subiendo', progreso: Math.round((ev.loaded / ev.total) * 100) } : x)));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Carga fallida (${xhr.status}).`)));
      xhr.onerror = () => reject(new Error('Se cortó la conexión. Tus archivos pendientes se reintentan al enviar.'));
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
          payload: { tipo, title, story, area, programa, tema, city, location, activityDate, district, club, senderName, senderEmail, extraFields, impact },
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
      // Los pendientes se suben al enviar: cuentan igual que los listos.
      const validFiles = adjuntos.filter((a) => a.estado !== 'error').length;
      if (validFiles < (rules.minToSubmit ?? 1)) return `Agregá al menos ${rules.minToSubmit ?? 1} fotografía(s).`;
      if (!senderName.trim()) return 'Escribí tu nombre.';
      if (!senderEmail.trim()) return 'Escribí tu correo electrónico.';
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(senderEmail.trim())) return 'El correo electrónico no parece válido.';
      if (!consent) return 'Aceptá el uso institucional del material para continuar.';
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
          extra: extrasTexto, consent,
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
              <h2 className="text-lg font-black text-gray-800">Evidencias y contacto</h2>
              <p className="text-sm text-gray-500 mt-1">{listos.length} de {rules.minToSubmit} mínima(s) · {advice.text}</p>
            </div>
            <button onClick={() => inputRef.current?.click()} className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-rotary-blue transition-colors">
              <Upload className="w-8 h-8 mx-auto text-gray-300" />
              <div className="text-sm font-bold text-gray-700 mt-2">Tocá acá para elegir, o arrastrá las fotos</div>
              <div className="text-xs text-gray-400 mt-1">Desde el teléfono se abre la cámara o la galería.</div>
            </button>
            <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { if (e.target.files) agregarArchivos(e.target.files); e.target.value = ''; }} />
            {adjuntos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {adjuntos.map((a) => (
                  <div key={a.id} className="relative rounded-xl overflow-hidden bg-gray-100 aspect-square">
                    {a.file.type.startsWith('image/') ? <img src={URL.createObjectURL(a.file)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-gray-400" /></div>}
                    {a.estado !== 'listo' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[11px] font-bold px-2 text-center">
                        {a.estado === 'error' ? (a.error || 'Error. Se reintenta al enviar.') : `${a.progreso}%`}
                      </div>
                    )}
                    {a.width != null && a.width < 800 && <div className="absolute bottom-1 left-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Baja resolución</div>}
                    <button onClick={() => setAdjuntos((p) => p.filter((x) => x.id !== a.id))} aria-label="Quitar archivo" className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <Etiqueta htmlFor="rea-enlaces" tip="enlaces">Documentos o enlaces relacionados (opcional)</Etiqueta>
              <div className="flex flex-wrap gap-1.5 mb-2">{enlaces.map((u) => <span key={u} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1 max-w-full"><span className="truncate max-w-[220px]">{u}</span><button onClick={() => setEnlaces(enlaces.filter((x) => x !== u))} aria-label="Quitar enlace"><X className="w-3 h-3" /></button></span>)}</div>
              <div className="flex gap-2"><input id="rea-enlaces" className={CAMPO} value={nuevoEnlace} onChange={(e) => setNuevoEnlace(e.target.value)} placeholder="https://…" inputMode="url" aria-describedby="tip-enlaces" />
                <button onClick={() => { const u = nuevoEnlace.trim(); if (u && enlaces.length < 5) setEnlaces([...enlaces, u]); setNuevoEnlace(''); }} className="px-4 rounded-xl bg-gray-100 font-bold" aria-label="Agregar enlace"><Plus className="w-4 h-4" /></button></div>
            </div>
            <div><Etiqueta tip="distrito">Distrito</Etiqueta>
              <select className={CAMPO} value={district} onChange={(e) => { setDistrict(e.target.value); setClub(''); setClubes([]); }} aria-describedby="tip-distrito">
                <option value="">Seleccionar…</option>{distritos.map((d: any) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select></div>
            <div><Etiqueta htmlFor="rea-club" tip="club">Club Rotario</Etiqueta>
              <input id="rea-club" className={CAMPO} list="clubes-distrito" value={club} onChange={(e) => setClub(e.target.value)} placeholder="Nombre del club" aria-describedby="tip-club" />
              <datalist id="clubes-distrito">{clubesDistrito.map((c) => <option key={c} value={c} />)}</datalist></div>
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
              <div className="grid grid-cols-3 gap-2">
                <div><label className={ROTULO}>País</label><select className={CAMPO} value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)}>{COUNTRIES.map((c: any) => <option key={c.iso} value={c.iso}>{c.iso} +{c.dial}</option>)}</select></div>
                <div className="col-span-2"><Etiqueta htmlFor="rea-tel" tip="telefono">Teléfono / WhatsApp</Etiqueta><input id="rea-tel" className={CAMPO} value={phoneNational} onChange={(e) => setPhoneNational(e.target.value)} inputMode="tel" aria-describedby="tip-telefono" /></div>
              </div>
            </div>
            <label className="flex gap-3 items-start bg-gray-50 rounded-2xl p-4 text-sm text-gray-600">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 w-5 h-5" />
              <span>{cfg.campaign?.consentText || 'Autorizo el uso institucional de este material en los canales de Rotary.'}{cfg.campaign?.consentIsProvisional ? ' (texto en revisión por la organización)' : ''}</span>
            </label>
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
                <p className="text-sm">{adjuntos.length} archivo(s) · {club || 'Sin club'} · {senderName} ({senderEmail})</p>
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
