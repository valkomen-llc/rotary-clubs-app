import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Upload, X, Image as ImageIcon, Film, Loader2, CheckCircle2,
  AlertTriangle, MapPin, Users, Plus, ArrowLeft, ArrowRight, Sparkles, Save, Link2,
} from 'lucide-react';
import { useSEO } from '../../hooks/useSEO';
import Navbar from '../../sections/Navbar';
import Footer from '../../sections/Footer';
import { PAGE_HEADER_BACKGROUND } from '../../lib/pageHeader';
import { ACCEPT_ATTR, MAX_FILES, checkFileMeta } from '../../lib/contentSubmissionSpec';
import { COUNTRIES, DEFAULT_COUNTRY, findCountry } from '../../lib/countryPhones';
import { fieldsForTipo, IMPACT_META, EXTRA_LABELS, photoAdvice, STEPS } from '../../lib/rotaryEnAccionSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const CAMPO = 'w-full p-3.5 rounded-xl border-2 border-gray-100 text-base bg-gray-50/60 outline-none focus:border-rotary-blue transition-colors';
const ROTULO = 'block text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2';
const TARJETA = 'bg-white rounded-3xl p-6 shadow-sm border border-gray-100';
const nuevoId = () => Math.random().toString(36).slice(2);

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

const Marco: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-rotary-concrete flex flex-col">
    <Navbar />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
);

const Cabecera: React.FC<{ campaignName?: string | null; mode: string }> = ({ campaignName, mode }) => (
  <div className="relative overflow-hidden" style={{ background: PAGE_HEADER_BACKGROUND }}>
    <div className="max-w-2xl mx-auto px-4 pt-12 pb-24 text-center">
      <div className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">Rotary en Acción</div>
      <h1 className="text-2xl md:text-3xl font-black text-white mt-2 leading-tight">
        {mode === 'campaign' && campaignName ? `Comparte lo que tu club está haciendo por ${campaignName}` : 'Cuéntanos qué hizo tu club'}
      </h1>
      <p className="text-white/80 text-sm mt-3">Nosotros te ayudamos a convertirlo en una historia.</p>
    </div>
  </div>
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

  const [tipo, setTipo] = useState('');
  const [area, setArea] = useState('');
  const [programa, setPrograma] = useState('');
  const [tema, setTema] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});
  const [impact, setImpact] = useState<Record<string, string>>({});
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [activityDate, setActivityDate] = useState('');
  const [city, setCity] = useState('');
  const [location, setLocation] = useState('');
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
  const inputRef = useRef<HTMLInputElement>(null);

  useSEO({ title: 'Rotary en Acción — Comparte lo que hace tu club', description: 'Canal permanente para compartir actividades, proyectos, eventos e impacto de los clubes.' });

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
          if (pl.city) setCity(pl.city); if (pl.location) setLocation(pl.location);
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

  // Guardado automático local: una interrupción no pierde el relato.
  useEffect(() => {
    if (cargando || enviado) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem('rotary-draft', JSON.stringify({ tipo, title, story, area, programa, tema, city, location, district, club, senderName, senderEmail, extraFields, impact }));
      } catch { /* noop */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [tipo, title, story, area, programa, tema, city, location, district, club, senderName, senderEmail, extraFields, impact, cargando, enviado]);

  useEffect(() => {
    if (!cargando && !tipo && !title && !story) {
      try {
        const raw = localStorage.getItem('rotary-draft');
        if (raw) {
          const d = JSON.parse(raw);
          if (d.tipo) setTipo(d.tipo); if (d.title) setTitle(d.title); if (d.story) setStory(d.story);
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
      xhr.onerror = () => reject(new Error('Se cortó la conexión. Reintentá.'));
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
          payload: { tipo, title, story, area, programa, tema, city, location, district, club, senderName, senderEmail, extraFields, impact },
        }),
      });
      const d = await leerJson(r);
      if (r.ok) setDraftToken(d.token);
    } catch { /* noop */ }
    finally { setDraftSaving(false); }
  };

  const puedeSeguir = (): string | null => {
    if (step === 0 && !tipo) return 'Elegí qué quieres compartir para continuar.';
    if (step === 4 && listos.length < (rules.minToSubmit ?? 1)) return `Agregá al menos ${rules.minToSubmit ?? 1} fotografía(s).`;
    if (step === 6) {
      if (!senderName.trim()) return 'Escribí tu nombre.';
      if (!senderEmail.trim()) return 'Escribí tu correo electrónico.';
      if (!consent) return 'Aceptá el uso institucional del material para continuar.';
    }
    return null;
  };

  const enviar = async () => {
    setErrores([]);
    const pendientes = adjuntos.filter((a) => a.estado !== 'listo');
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
        impactNums[k] = Number.isFinite(n) && String(v).trim() !== '' && !isNaN(n) ? n : String(v).trim();
      }
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
          hasPosts: false, posts: [], files: subidos,
        }),
      });
      const data = await leerJson(r);
      if (!r.ok) throw new Error(data?.error || 'No se pudo enviar.');
      setEnviado(data);
      try { localStorage.removeItem('rotary-draft'); } catch { /* noop */ }
      if (draftToken) fetch(`${API}/rotary-en-accion/drafts/${draftToken}`, { method: 'DELETE' }).catch(() => {});
      setStep(8);
    } catch (err: any) { setErrores([err?.message || 'No se pudo enviar el material.']); }
    finally { setEnviando(false); }
  };

  if (cargando) return (<Marco><div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div></Marco>);
  if (errorCarga || !cfg) return (<Marco><div className="flex items-center justify-center px-4 py-20"><div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-sm border border-gray-100"><AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" /><h1 className="text-lg font-bold text-gray-800 mt-4">No se pudo abrir Rotary en Acción</h1><p className="text-sm text-gray-500 mt-2">{errorCarga}</p><button onClick={cargar} className="mt-5 px-5 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold">Reintentar</button></div></div></Marco>);

  const tipos: any[] = cfg.taxonomies?.tipo || [];
  const areas: any[] = cfg.taxonomies?.area || [];
  const programas: any[] = cfg.taxonomies?.programa || [];
  const temas: any[] = cfg.taxonomies?.tema || [];

  return (
    <Marco>
      <Cabecera campaignName={cfg.campaign?.name} mode={cfg.mode} />
      <div className="max-w-2xl mx-auto px-4 -mt-16 pb-20 space-y-4">
        {/* Progreso */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-2 overflow-x-auto">
          {STEPS.slice(0, 8).map((s, i) => (
            <button key={s.id} onClick={() => i < step && setStep(i)} className={`flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap px-2 py-1 rounded-full ${i === step ? 'bg-rotary-blue text-white' : i < step ? 'text-rotary-blue' : 'text-gray-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i === step ? 'bg-white/25' : i < step ? 'bg-rotary-blue text-white' : 'bg-gray-100'}`}>{i + 1}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        {cfg.prefill?.club && step === 6 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-xs text-blue-800">Reconocimos tu club por el enlace de la campaña. Verifícalo o corrígelo antes de enviar.</div>
        )}

        {/* PASO 1: tipo */}
        {step === 0 && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">¿Qué quieres compartir con Rotary?</h2>
            <p className="text-sm text-gray-500 mt-1">Elegí una opción. El formulario se adapta a lo que elijas.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
              {tipos.map((t: any) => (
                <button key={t.slug} onClick={() => setTipo(t.slug)} aria-pressed={tipo === t.slug}
                  className={`rounded-2xl border-2 p-3 text-left transition-colors min-h-[88px] ${tipo === t.slug ? 'border-rotary-blue bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                  <div className="text-2xl">{t.icon || '✨'}</div>
                  <div className="text-xs font-bold text-gray-700 mt-1">{t.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 2: relación */}
        {step === 1 && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">¿Con qué está relacionado?</h2>
            <p className="text-sm text-gray-500 mt-1">Todo es opcional y ayuda a clasificar tu historia.</p>
            <div className="space-y-4 mt-4">
              <div><label className={ROTULO}>Área de interés</label>
                <select className={CAMPO} value={area} onChange={(e) => setArea(e.target.value)}><option value="">Sin área específica</option>{areas.map((a: any) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
              <div><label className={ROTULO}>Programa o comunidad</label>
                <select className={CAMPO} value={programa} onChange={(e) => setPrograma(e.target.value)}><option value="">Sin programa específico</option>{programas.map((a: any) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
              <div><label className={ROTULO}>Temática</label>
                <select className={CAMPO} value={tema} onChange={(e) => setTema(e.target.value)}><option value="">Sin temática específica</option>{temas.map((a: any) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select></div>
              <div><label className={ROTULO}>Etiquetas (separadas por comas)</label>
                <input className={CAMPO} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="reforestación, juventud, navidad" /></div>
            </div>
          </div>
        )}

        {/* PASO 3: historia */}
        {step === 2 && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">Cuéntanos qué ocurrió</h2>
            <p className="text-sm text-gray-500 mt-1">Sin contexto, el material se archiva pero no se puede comunicar bien.</p>
            <div className="space-y-4 mt-4">
              <div><label className={ROTULO}>Título de la actividad</label>
                <input className={CAMPO} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Jornada de reforestación en…" /></div>
              <div><label className={ROTULO}>¿Qué ocurrió y qué te gustaría que Rotary comunique?</label>
                <textarea className={`${CAMPO} min-h-[140px]`} value={story} onChange={(e) => setStory(e.target.value)} placeholder="Cuéntalo con tus palabras…" /></div>
              <button onClick={pedirAyudaIA} disabled={assistLoading} className="flex items-center gap-2 text-xs font-bold text-rotary-blue border border-blue-100 rounded-xl px-3 py-2.5">
                {assistLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Ayúdame a contarlo mejor
              </button>
              {assistQs.length > 0 && (
                <ul className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1.5 text-sm text-amber-900">
                  {assistQs.map((q, i) => <li key={i}>· {q}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* PASO 4: impacto + condicionales */}
        {step === 3 && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">Muéstranos el impacto</h2>
            <p className="text-sm text-gray-500 mt-1">Solo lo que corresponda. Nada de esto es obligatorio.</p>
            {cond.extra.length > 0 && (
              <div className="space-y-4 mt-4">
                {cond.extra.map((k) => (
                  <div key={k}><label className={ROTULO}>{EXTRA_LABELS[k] || k}</label>
                    <input className={CAMPO} value={extraFields[k] || ''} onChange={(e) => setExtraFields({ ...extraFields, [k]: e.target.value })} /></div>
                ))}
              </div>
            )}
            {cond.impacto.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 mt-4">
                {cond.impacto.map((k) => (
                  <div key={k}><label className={ROTULO}>{IMPACT_META[k]?.label || k}</label>
                    <input className={CAMPO} inputMode={IMPACT_META[k]?.kind === 'text' ? 'text' : 'numeric'} value={impact[k] || ''} onChange={(e) => setImpact({ ...impact, [k]: e.target.value })} placeholder="—" /></div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-400 mt-4">Para este tipo no se piden métricas.</p>}
          </div>
        )}

        {/* PASO 5: fotos */}
        {step === 4 && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">Agrega las mejores fotografías</h2>
            <p className="text-sm text-gray-500 mt-1">{listos.length} de {rules.minToSubmit} mínima(s) · {advice.text}</p>
            <button onClick={() => inputRef.current?.click()} className="mt-4 w-full border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-rotary-blue transition-colors">
              <Upload className="w-8 h-8 mx-auto text-gray-300" />
              <div className="text-sm font-bold text-gray-700 mt-2">Tocá acá para elegir, o arrastrá las fotos</div>
              <div className="text-xs text-gray-400 mt-1">Desde el teléfono se abre la cámara o la galería.</div>
            </button>
            <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { if (e.target.files) agregarArchivos(e.target.files); e.target.value = ''; }} />
            <div className="grid grid-cols-3 gap-2 mt-3">
              {adjuntos.map((a) => (
                <div key={a.id} className="relative rounded-xl overflow-hidden bg-gray-100 aspect-square">
                  {a.file.type.startsWith('image/') ? <img src={URL.createObjectURL(a.file)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-gray-400" /></div>}
                  {a.estado !== 'listo' && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[11px] font-bold px-2 text-center">
                      {a.estado === 'error' ? (a.error || 'Error. Reintentá.') : `${a.progreso}%`}
                    </div>
                  )}
                  {a.width != null && a.width < 800 && <div className="absolute bottom-1 left-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Baja resolución</div>}
                  <button onClick={() => setAdjuntos((p) => p.filter((x) => x.id !== a.id))} aria-label="Quitar" className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PASO 6: datos */}
        {step === 5 && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">Datos de la actividad</h2>
            <div className="space-y-4 mt-4">
              <div><label className={ROTULO}>Fecha de la actividad</label><input type="date" className={CAMPO} value={activityDate} onChange={(e) => setActivityDate(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={ROTULO}>Ciudad / municipio</label><input className={CAMPO} value={city} onChange={(e) => setCity(e.target.value)} /></div>
                <div><label className={ROTULO}>Lugar</label><input className={CAMPO} value={location} onChange={(e) => setLocation(e.target.value)} /></div>
              </div>
              <div><label className={ROTULO}>Distrito</label>
                <select className={CAMPO} value={district} onChange={(e) => { setDistrict(e.target.value); setClub(''); setClubes([]); }}>
                  <option value="">Seleccionar…</option>{distritos.map((d: any) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select></div>
              <div><label className={ROTULO}>Club principal</label>
                <input className={CAMPO} list="clubes-distrito" value={club} onChange={(e) => setClub(e.target.value)} placeholder="Nombre del club" />
                <datalist id="clubes-distrito">{clubesDistrito.map((c) => <option key={c} value={c} />)}</datalist></div>
              <div><label className={ROTULO}>Clubes participantes (además del principal)</label>
                <div className="flex flex-wrap gap-1.5 mb-2">{clubes.map((c) => <span key={c} className="bg-blue-50 text-blue-800 text-xs font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1">{c}<button onClick={() => setClubes(clubes.filter((x) => x !== c))} aria-label="Quitar"><X className="w-3 h-3" /></button></span>)}</div>
                <div className="flex gap-2"><input className={CAMPO} list="clubes-distrito" value={nuevoClub} onChange={(e) => setNuevoClub(e.target.value)} placeholder="Agregar club…" />
                  <button onClick={() => { if (nuevoClub.trim() && !clubes.includes(nuevoClub.trim())) setClubes([...clubes, nuevoClub.trim()]); setNuevoClub(''); }} className="px-4 rounded-xl bg-gray-100 font-bold" aria-label="Agregar club"><Plus className="w-4 h-4" /></button></div></div>
            </div>
          </div>
        )}

        {/* PASO 7: remitente */}
        {step === 6 && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">¿Quién lo envía?</h2>
            <div className="space-y-4 mt-4">
              <div><label className={ROTULO}>Tu nombre</label><input className={CAMPO} value={senderName} onChange={(e) => setSenderName(e.target.value)} autoComplete="name" /></div>
              <div><label className={ROTULO}>Tu correo</label><input type="email" className={CAMPO} value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} autoComplete="email" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className={ROTULO}>País</label><select className={CAMPO} value={phoneCountry} onChange={(e) => setPhoneCountry(e.target.value)}>{COUNTRIES.map((c: any) => <option key={c.iso} value={c.iso}>{c.iso} +{c.dial}</option>)}</select></div>
                <div className="col-span-2"><label className={ROTULO}>Teléfono (opcional)</label><input className={CAMPO} value={phoneNational} onChange={(e) => setPhoneNational(e.target.value)} inputMode="tel" /></div>
              </div>
              <div><label className={ROTULO}>Tu rol (opcional)</label><input className={CAMPO} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Presidente, secretario, socio…" /></div>
              <label className="flex gap-3 items-start bg-gray-50 rounded-2xl p-4 text-sm text-gray-600">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 w-5 h-5" />
                <span>{cfg.campaign?.consentText || 'Autorizo el uso institucional de este material en los canales de Rotary.'}{cfg.campaign?.consentIsProvisional ? ' (texto en revisión por la organización)' : ''}</span>
              </label>
              <button onClick={guardarBorrador} disabled={draftSaving} className="flex items-center gap-2 text-xs font-bold text-gray-500">
                {draftSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar y continuar después
              </button>
              {draftToken && <div className="text-xs text-gray-500 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Tu enlace para continuar: <code className="bg-gray-100 px-1.5 py-0.5 rounded">?draft={draftToken}</code></div>}
            </div>
          </div>
        )}

        {/* PASO 8: revisión */}
        {step === 7 && (
          <div className={TARJETA}>
            <h2 className="text-lg font-black text-gray-800">Revisá antes de enviar</h2>
            <dl className="text-sm mt-3 space-y-2">
              <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Tipo</dt><dd className="font-bold">{tipos.find((t: any) => t.slug === tipo)?.name || tipo || '—'}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Título</dt><dd className="font-bold">{title || '—'}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Club</dt><dd>{club || '—'}{clubes.length > 0 && ` (+${clubes.length})`}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Fotos/videos</dt><dd>{adjuntos.length} archivo(s) · {advice.text}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-28 shrink-0">Remitente</dt><dd>{senderName} · {senderEmail}</dd></div>
            </dl>
            <p className="text-xs text-gray-400 mt-4">Tu solicitud entra en “Recibido”. Nada se publica solo: el equipo la revisa y, si se aprueba, te avisaremos al publicarla.</p>
          </div>
        )}

        {/* PASO 9: confirmación */}
        {step === 8 && enviado && (
          <div className={TARJETA + ' text-center'}>
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-black text-gray-800 mt-3">Gracias por compartir lo que hace tu club</h2>
            <dl className="text-sm mt-4 space-y-1.5 text-left max-w-sm mx-auto">
              <div className="flex gap-2"><dt className="text-gray-400 w-32">N.º de solicitud</dt><dd className="font-mono font-bold">{String(enviado.id).slice(0, 8)}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Actividad</dt><dd className="font-bold">{title || '—'}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Club</dt><dd>{club || '—'}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Material</dt><dd>{adjuntos.length} archivo(s)</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-32">Estado inicial</dt><dd>Recibido</dd></div>
            </dl>
            {enviado.warnings?.length > 0 && <div className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3 mt-4 text-left">{enviado.warnings.slice(0, 3).map((w: string, i: number) => <div key={i}>· {w}</div>)}</div>}
          </div>
        )}

        {errores.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 space-y-1">{errores.map((e, i) => <div key={i}>· {e}</div>)}</div>
        )}

        {/* Navegación */}
        {!(step === 8 && enviado) && (
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="flex items-center gap-1.5 px-4 py-3 rounded-xl border text-sm font-bold text-gray-500 disabled:opacity-40 min-h-[52px]"><ArrowLeft className="w-4 h-4" /> Atrás</button>
            {step < 7 ? (
              <button onClick={() => { const m = puedeSeguir(); if (m) { setErrores([m]); window.scrollTo({ top: 0, behavior: 'smooth' }); return; } setErrores([]); setStep(step + 1); window.scrollTo({ top: 0 }); }} className="flex items-center gap-1.5 px-6 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold min-h-[52px]">Siguiente <ArrowRight className="w-4 h-4" /></button>
            ) : (
              <button onClick={enviar} disabled={enviando} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold min-h-[52px] disabled:opacity-60">
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />} Enviar historia
              </button>
            )}
          </div>
        )}
        <p className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1"><Users className="w-3 h-3" /> Rotary en Acción · Distrito 4281 · <MapPin className="w-3 h-3" /> {cfg.campaign ? cfg.campaign.name : 'canal permanente'}</p>
      </div>
    </Marco>
  );
}
