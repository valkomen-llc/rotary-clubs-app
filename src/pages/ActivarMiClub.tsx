// ════════════════════════════════════════════════════════════════════════════
// Landing Pública: /activar-mi-club — Rotary en Acción & Club Platform
// Captación, registro inteligente, selector de clubes en tiempo real y trazabilidad.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Sparkles, Globe, Users, CreditCard, Megaphone, CheckCircle2,
  AlertTriangle, ArrowRight, ArrowLeft, ShieldCheck, Send, Check,
  ChevronDown, ExternalLink, MessageSquare, Phone, Mail, Building,
  HelpCircle, Star, Compass, Info, Lock
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useSEO } from '../hooks/useSEO';
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, flagEmoji } from '../lib/countryPhones';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface ClubOption {
  name: string;
  district: string;
  isActivated: boolean;
  activeDomain: string | null;
  hasPendingRequest: boolean;
  pendingStatus: string | null;
}

interface InterestOption {
  id: string;
  label: string;
  icon: string;
  desc: string;
}

interface SiteInfo {
  id: string;
  name: string;
  logo: string | null;
  district: string;
  domain: string;
  isMainPlatform: boolean;
}

const getVisitorId = (): string => {
  if (typeof window === 'undefined') return 'vis_ssr';
  let vId = localStorage.getItem('cpa_visitor_id');
  if (!vId) {
    vId = 'vis_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('cpa_visitor_id', vId);
  }
  return vId;
};

// Selector de prefijo con bandera
const CountryPicker: React.FC<{ value: string; onChange: (iso: string) => void }> = ({ value, onChange }) => {
  const [abierto, setAbierto] = useState(false);
  const actual = findCountry(value);
  return (
    <div className="relative shrink-0" onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false); }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`Prefijo telefónico: ${actual.name} ${actual.dial}`}
        className="h-full min-h-[50px] px-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/70 flex items-center gap-1.5 hover:border-gray-200 focus:outline-none focus:border-rotary-blue transition-colors"
      >
        <span aria-hidden className="text-lg leading-none">{flagEmoji(actual.iso)}</span>
        <span className="font-bold text-sm text-gray-700">{actual.dial}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" aria-hidden />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-30 cursor-default" onClick={() => setAbierto(false)} aria-hidden />
          <ul
            role="listbox"
            aria-label="País del teléfono"
            className="absolute left-0 bottom-full mb-2 z-40 w-64 max-h-60 overflow-auto bg-white border border-gray-100 rounded-2xl shadow-xl py-1 text-left"
          >
            {COUNTRIES.map((c) => (
              <li key={c.iso} role="option" aria-selected={c.iso === value}>
                <button
                  type="button"
                  onClick={() => { onChange(c.iso); setAbierto(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50 ${c.iso === value ? 'bg-blue-50/70 font-bold' : ''}`}
                >
                  <span aria-hidden className="text-lg leading-none">{flagEmoji(c.iso)}</span>
                  <span className="flex-1 text-gray-700 truncate">{c.name}</span>
                  <span className="text-gray-400 font-bold text-xs">{c.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export const ActivarMiClub: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // Trazabilidad de UTMs y campaña
  const utmSource = params.get('utm_source') || '';
  const utmMedium = params.get('utm_medium') || '';
  const utmCampaign = params.get('utm_campaign') || '';
  const utmContent = params.get('utm_content') || '';
  const utmTerm = params.get('utm_term') || '';
  const campaignId = params.get('campaign_id') || params.get('ref') || utmCampaign || '';
  const urlChannel = params.get('canal') || params.get('channel') || (utmSource.includes('whatsapp') ? 'whatsapp' : utmSource.includes('email') ? 'email' : 'organico');
  const urlClubParam = params.get('club') || '';

  // Configuración del sitio y clubes
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [interests, setInterests] = useState<InterestOption[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  // Formulario inteligente
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedClub, setSelectedClub] = useState<string>(urlClubParam);
  const [searchClubText, setSearchClubText] = useState<string>('');
  const [responsibleName, setResponsibleName] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [customRole, setCustomRole] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phoneIso, setPhoneIso] = useState<string>(DEFAULT_COUNTRY.iso);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [mainInterest, setMainInterest] = useState<string>('ecosistema_integral');
  const [dataConsent, setDataConsent] = useState<boolean>(true);

  // Estados de interfaz y envío
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [hasStartedForm, setHasStartedForm] = useState(false);
  const visitorIdRef = useRef<string>(getVisitorId());

  useSEO({
    title: '¡Activa el ecosistema digital de tu club! · Club Platform & Rotary en Acción',
    description: 'Conecta, comunica y potencia el impacto de tu club rotario con Club Platform: sitio web oficial, socios, proyectos en Rotary en Acción y recaudación online.'
  });

  // 1. Cargar configuración multisitio y directorio de clubes
  useEffect(() => {
    let active = true;
    const loadConfig = async () => {
      try {
        const queryParams = new URLSearchParams(params);
        const res = await fetch(`${API}/rotary-en-accion/activacion/config?${queryParams.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!active) return;

        if (data.ok) {
          setSite(data.site);
          setClubs(data.clubs || []);
          setInterests(data.interests || []);
          setRoles(data.roles || []);

          if (data.prefill?.club && !selectedClub) {
            setSelectedClub(data.prefill.club);
          }
          if (data.prefill?.responsibleName && !responsibleName) {
            setResponsibleName(data.prefill.responsibleName);
          }
          if (data.prefill?.email && !email) {
            setEmail(data.prefill.email);
          }
        }
      } catch (e) {
        console.warn('Error loading activation config:', e);
      } finally {
        if (active) setLoadingConfig(false);
      }
    };
    loadConfig();
    return () => { active = false; };
  }, [params]);

  // 2. Registrar hit de visita para el embudo de conversión
  useEffect(() => {
    const recordVisit = async () => {
      try {
        await fetch(`${API}/rotary-en-accion/activacion/hit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visitorId: visitorIdRef.current,
            event: 'visit',
            clubName: urlClubParam,
            channel: urlChannel,
            campaignId,
            utmSource,
            utmMedium,
            utmCampaign,
            utmContent
          })
        });
      } catch {}
    };
    recordVisit();
  }, [urlClubParam, urlChannel, campaignId, utmSource, utmMedium, utmCampaign, utmContent]);

  // 3. Registrar inicio de interacción en el formulario
  const triggerFormStarted = useCallback(async () => {
    if (hasStartedForm) return;
    setHasStartedForm(true);
    try {
      await fetch(`${API}/rotary-en-accion/activacion/hit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId: visitorIdRef.current,
          event: 'form_started',
          clubName: selectedClub,
          channel: urlChannel,
          campaignId,
          utmSource,
          utmMedium,
          utmCampaign
        })
      });
    } catch {}
  }, [hasStartedForm, selectedClub, urlChannel, campaignId, utmSource, utmMedium, utmCampaign]);

  // Club seleccionado actualmente en el catálogo
  const clubObj = useMemo(() => {
    return clubs.find((c) => c.name.toLowerCase() === selectedClub.toLowerCase()) || null;
  }, [clubs, selectedClub]);

  // Lista filtrada de clubes para el selector
  const filteredClubs = useMemo(() => {
    if (!searchClubText.trim()) return clubs;
    const q = searchClubText.toLowerCase();
    return clubs.filter((c) => c.name.toLowerCase().includes(q));
  }, [clubs, searchClubText]);

  // Enviar formulario de activación
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClub) {
      toast.error('Por favor selecciona tu club rotario.');
      setStep(1);
      return;
    }
    if (!responsibleName.trim()) {
      toast.error('Por favor escribe tu nombre completo.');
      setStep(2);
      return;
    }
    const finalRole = role === 'Otro' ? customRole.trim() : role;
    if (!finalRole) {
      toast.error('Por favor selecciona o escribe tu cargo o rol rotario.');
      setStep(2);
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Por favor proporciona un correo electrónico válido.');
      setStep(2);
      return;
    }
    if (!phoneNumber.trim()) {
      toast.error('Por favor proporciona tu número de WhatsApp para contactarte.');
      setStep(2);
      return;
    }
    if (!dataConsent) {
      toast.error('Debes aceptar la autorización de tratamiento de datos personales.');
      return;
    }

    setSubmitting(true);
    const country = findCountry(phoneIso);
    const fullPhone = `${country.dial} ${phoneNumber.trim()}`;

    try {
      const res = await fetch(`${API}/rotary-en-accion/activacion/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubName: selectedClub,
          responsibleName: responsibleName.trim(),
          role: finalRole,
          email: email.trim().toLowerCase(),
          phone: fullPhone,
          mainInterest,
          dataConsent: true,
          channel: urlChannel,
          campaignId,
          campaignName: utmCampaign || 'Campaña Activación',
          utmSource,
          utmMedium,
          utmCampaign,
          utmContent,
          utmTerm,
          visitorId: visitorIdRef.current
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo procesar la solicitud.');
      }

      setSubmittedSuccess(true);
      toast.success('¡Solicitud recibida! Te contactaremos a la brevedad.');
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const getInterestIcon = (iconName: string) => {
    switch (iconName) {
      case 'Globe': return <Globe className="w-5 h-5 text-blue-600" />;
      case 'Users': return <Users className="w-5 h-5 text-indigo-600" />;
      case 'CreditCard': return <CreditCard className="w-5 h-5 text-emerald-600" />;
      case 'Megaphone': return <Megaphone className="w-5 h-5 text-amber-500" />;
      case 'Send': return <Send className="w-5 h-5 text-purple-600" />;
      default: return <Sparkles className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-800">
      <Navbar />

      <main className="flex-1">
        {/* ── HERO BANNER ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#01215b] via-[#013388] to-[#0c2340] text-white py-16 lg:py-24 px-4 sm:px-6">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

          <div className="max-w-4xl mx-auto text-center relative z-10">
            {site?.logo ? (
              <div className="inline-flex items-center justify-center p-3 bg-white/10 backdrop-blur-md rounded-2xl mb-6 shadow-inner border border-white/20">
                <img src={site.logo} alt={site.name} className="h-12 sm:h-14 w-auto object-contain" />
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-black uppercase tracking-wider text-amber-300 mb-6">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>{site?.name || 'Club Platform for Rotary'}</span>
              </div>
            )}

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight mb-4">
              ¡Activa el ecosistema digital de tu club!
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-blue-100 max-w-2xl mx-auto leading-relaxed">
              Conecta, comunica y potencia el impacto de tu club rotario con herramientas tecnológicas modernas, integradas oficialmente con <strong>Rotary en Acción</strong>.
            </p>

            {/* Badges de pilares */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mt-8 text-xs font-semibold text-white/90">
              <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                <Globe className="w-3.5 h-3.5 text-blue-300" /> Sitio Web Autogestionable
              </span>
              <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                <Users className="w-3.5 h-3.5 text-emerald-300" /> Directorio de Socios
              </span>
              <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                <Megaphone className="w-3.5 h-3.5 text-amber-300" /> Rotary en Acción
              </span>
              <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                <CreditCard className="w-3.5 h-3.5 text-purple-300" /> Donaciones Online
              </span>
            </div>
          </div>
        </section>

        {/* ── CUERPO PRINCIPAL / FORMULARIO INTELIGENTE ─────────────────────── */}
        <section className="py-12 px-4 sm:px-6 -mt-8 max-w-4xl mx-auto relative z-20">
          {submittedSuccess ? (
            /* PANTALLA DE ÉXITO */
            <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-xl border border-gray-100 text-center animate-in fade-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <span className="text-xs font-black text-emerald-700 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Solicitud Registrada
              </span>

              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 mt-4 mb-2">
                ¡Gracias por dar el paso, {responsibleName}!
              </h2>
              <p className="text-gray-600 text-base max-w-lg mx-auto mb-6">
                Hemos registrado con éxito el interés para activar el ecosistema digital de <strong>{selectedClub}</strong>.
              </p>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-left max-w-md mx-auto mb-8 text-sm space-y-2.5">
                <div className="flex justify-between border-b border-gray-200/60 pb-2">
                  <span className="text-gray-500">Club:</span>
                  <span className="font-bold text-gray-900">{selectedClub}</span>
                </div>
                <div className="flex justify-between border-b border-gray-200/60 pb-2">
                  <span className="text-gray-500">Responsable:</span>
                  <span className="font-bold text-gray-900">{responsibleName} ({role})</span>
                </div>
                <div className="flex justify-between border-b border-gray-200/60 pb-2">
                  <span className="text-gray-500">Correo:</span>
                  <span className="font-semibold text-gray-800">{email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">WhatsApp:</span>
                  <span className="font-semibold text-gray-800">{findCountry(phoneIso).dial} {phoneNumber}</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-8 max-w-md mx-auto">
                Te enviamos un correo de confirmación con los siguientes pasos. Nuestro equipo de soporte distrital se comunicará contigo vía WhatsApp para entregar tus accesos.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href={`https://wa.me/573000000000?text=${encodeURIComponent(`Hola, acabo de solicitar la activación de Club Platform para el ${selectedClub}. Mi nombre es ${responsibleName}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3.5 rounded-xl shadow-md transition-all text-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Coordinar por WhatsApp ahora</span>
                </a>

                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="inline-flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-6 py-3.5 rounded-xl transition-all text-sm"
                >
                  <span>Volver al inicio</span>
                </button>
              </div>
            </div>
          ) : (
            /* TARJETA DEL FORMULARIO */
            <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-gray-100">
              {/* Pasos / Wizard Header */}
              <div className="mb-8">
                <div className="flex items-center justify-between text-xs font-bold text-gray-400 mb-2">
                  <span className={step >= 1 ? 'text-rotary-blue font-black' : ''}>1. Tu Club</span>
                  <span className={step >= 2 ? 'text-rotary-blue font-black' : ''}>2. Responsable</span>
                  <span className={step >= 3 ? 'text-rotary-blue font-black' : ''}>3. Enfoque</span>
                  <span className={step >= 4 ? 'text-rotary-blue font-black' : ''}>4. Confirmación</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-rotary-blue to-amber-500 h-full transition-all duration-300"
                    style={{ width: `${(step / 4) * 100}%` }}
                  />
                </div>
              </div>

              <form onSubmit={handleSubmit} onFocus={triggerFormStarted}>
                {/* ── PASO 1: SELECCIÓN DEL CLUB ─────────────────────────── */}
                {step === 1 && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-1">
                        ¿A qué club rotario representas?
                      </h2>
                      <p className="text-sm text-gray-500">
                        Selecciona tu club en el directorio oficial de nuestro sitio para verificar su estado de activación.
                      </p>
                    </div>

                    {loadingConfig ? (
                      <div className="p-8 text-center text-gray-400 text-sm">
                        Cargando directorio de clubes...
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Buscar club rotario por nombre (ej. Bogotá, Medellín, Cali...)"
                            value={searchClubText}
                            onChange={(e) => setSearchClubText(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 text-sm focus:border-rotary-blue outline-none transition-colors"
                          />
                        </div>

                        <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-2xl divide-y divide-gray-50 bg-gray-50/40 p-1">
                          {filteredClubs.length === 0 ? (
                            <div className="p-6 text-center text-gray-400 text-sm">
                              No se encontraron clubes con ese nombre.
                            </div>
                          ) : (
                            filteredClubs.map((c) => {
                              const isSelected = selectedClub.toLowerCase() === c.name.toLowerCase();
                              return (
                                <button
                                  type="button"
                                  key={c.name}
                                  onClick={() => {
                                    setSelectedClub(c.name);
                                    triggerFormStarted();
                                  }}
                                  className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all ${
                                    isSelected
                                      ? 'bg-blue-50 border-2 border-rotary-blue shadow-sm'
                                      : 'hover:bg-white hover:shadow-xs'
                                  }`}
                                >
                                  <div>
                                    <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                      <span>Club Rotario {c.name}</span>
                                      {c.isActivated && (
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                          Ecosistema Activo
                                        </span>
                                      )}
                                      {c.hasPendingRequest && !c.isActivated && (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                          En Gestión
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-400 mt-0.5">
                                      {c.district}
                                    </div>
                                  </div>

                                  <div className="shrink-0 ml-3">
                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                      isSelected
                                        ? 'bg-rotary-blue border-rotary-blue text-white'
                                        : 'border-gray-300'
                                    }`}>
                                      {isSelected && <Check className="w-3.5 h-3.5" />}
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>

                        {/* Aviso si el club seleccionado ya está activado */}
                        {clubObj?.isActivated && (
                          <div className="bg-amber-50 border-2 border-amber-200/80 rounded-2xl p-4 flex items-start gap-3.5 text-amber-900 text-xs sm:text-sm animate-in fade-in">
                            <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-bold">
                                ¡El Club Rotario {clubObj.name} ya cuenta con su ecosistema Club Platform activo!
                              </p>
                              <p className="text-amber-800 mt-0.5">
                                Si necesitas soporte técnico, cambio de administración o vinculación con Rotary en Acción, continúa con el registro para que nuestro equipo te asista.
                              </p>
                              {clubObj.activeDomain && (
                                <a
                                  href={`https://${clubObj.activeDomain}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 font-bold text-amber-900 underline mt-2 hover:text-amber-950"
                                >
                                  <span>Ver portal actual del club</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-4 border-t border-gray-100">
                      <button
                        type="button"
                        disabled={!selectedClub}
                        onClick={() => setStep(2)}
                        className="inline-flex items-center gap-2 bg-rotary-blue hover:bg-[#002868] text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all disabled:opacity-50 text-sm"
                      >
                        <span>Continuar</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASO 2: DATOS DEL RESPONSABLE ───────────────────────── */}
                {step === 2 && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-1">
                        Datos del Líder o Responsable
                      </h2>
                      <p className="text-sm text-gray-500">
                        Te contactaremos para validar tu rol y coordinar la entrega de credenciales.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Nombre */}
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                          Nombre y Apellidos *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Ej. María Fernanda Gómez"
                          value={responsibleName}
                          onChange={(e) => setResponsibleName(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 text-sm focus:border-rotary-blue outline-none transition-colors"
                        />
                      </div>

                      {/* Cargo o Rol Rotario */}
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                          Cargo o Rol Rotario en el Club *
                        </label>
                        <select
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 text-sm focus:border-rotary-blue outline-none transition-colors bg-white"
                        >
                          <option value="">Selecciona tu rol...</option>
                          {roles.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                          <option value="Otro">Otro cargo...</option>
                        </select>
                        {role === 'Otro' && (
                          <input
                            type="text"
                            placeholder="Escribe tu cargo o rol..."
                            value={customRole}
                            onChange={(e) => setCustomRole(e.target.value)}
                            className="mt-2 w-full px-4 py-2.5 rounded-xl border-2 border-gray-100 text-sm focus:border-rotary-blue outline-none"
                          />
                        )}
                      </div>

                      {/* Correo Electrónico */}
                      <div>
                        <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                          Correo Electrónico *
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="maria.gomez@gmail.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-gray-100 text-sm focus:border-rotary-blue outline-none transition-colors"
                        />
                      </div>

                      {/* WhatsApp con Prefijo */}
                      <div>
                        <label className="block text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                          Número de WhatsApp *
                        </label>
                        <div className="flex gap-2">
                          <CountryPicker value={phoneIso} onChange={setPhoneIso} />
                          <input
                            type="tel"
                            required
                            placeholder="310 123 4567"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-100 text-sm focus:border-rotary-blue outline-none transition-colors"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between pt-4 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-800 font-bold px-4 py-2.5 text-sm"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Atrás</span>
                      </button>

                      <button
                        type="button"
                        disabled={!responsibleName.trim() || !role || !email.trim() || !phoneNumber.trim()}
                        onClick={() => setStep(3)}
                        className="inline-flex items-center gap-2 bg-rotary-blue hover:bg-[#002868] text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all disabled:opacity-50 text-sm"
                      >
                        <span>Siguiente</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASO 3: PRIORIDADES E INTERÉS ──────────────────────── */}
                {step === 3 && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-1">
                        ¿Cuál es la prioridad para tu club?
                      </h2>
                      <p className="text-sm text-gray-500">
                        Selecciona el módulo o beneficio que más le urge habilitar a tu junta directiva.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {interests.map((item) => {
                        const isSelected = mainInterest === item.id;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => setMainInterest(item.id)}
                            className={`text-left p-4 rounded-2xl border-2 transition-all flex items-start gap-3.5 ${
                              isSelected
                                ? 'bg-blue-50/60 border-rotary-blue shadow-sm ring-1 ring-rotary-blue'
                                : 'bg-gray-50/50 border-gray-100 hover:bg-white hover:border-gray-200'
                            }`}
                          >
                            <div className="p-2.5 rounded-xl bg-white shadow-xs shrink-0">
                              {getInterestIcon(item.icon)}
                            </div>
                            <div>
                              <div className="font-bold text-sm text-gray-900">
                                {item.label}
                              </div>
                              <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                                {item.desc}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex justify-between pt-4 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-800 font-bold px-4 py-2.5 text-sm"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Atrás</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStep(4)}
                        className="inline-flex items-center gap-2 bg-rotary-blue hover:bg-[#002868] text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all text-sm"
                      >
                        <span>Revisar y Enviar</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASO 4: REVISAR, CONSENTIMIENTO Y ENVIAR ────────────── */}
                {step === 4 && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-1">
                        Confirmación de Solicitud
                      </h2>
                      <p className="text-sm text-gray-500">
                        Verifica tus datos antes de enviar. Un asesor oficial de Rotary te acompañará en todo el proceso.
                      </p>
                    </div>

                    {/* Resumen */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3 text-sm">
                      <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                        <span className="text-gray-500">Club Rotario:</span>
                        <span className="font-bold text-gray-900">{selectedClub}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                        <span className="text-gray-500">Responsable:</span>
                        <span className="font-bold text-gray-900">{responsibleName} ({role === 'Otro' ? customRole : role})</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                        <span className="text-gray-500">Correo Electrónico:</span>
                        <span className="font-semibold text-gray-800">{email}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                        <span className="text-gray-500">WhatsApp:</span>
                        <span className="font-semibold text-gray-800">{findCountry(phoneIso).dial} {phoneNumber}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Interés Principal:</span>
                        <span className="font-bold text-rotary-blue">{interests.find(i => i.id === mainInterest)?.label || mainInterest}</span>
                      </div>
                    </div>

                    {/* Checkbox de Consentimiento */}
                    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="dataConsent"
                        checked={dataConsent}
                        onChange={(e) => setDataConsent(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue cursor-pointer"
                      />
                      <label htmlFor="dataConsent" className="text-xs text-gray-600 cursor-pointer select-none leading-relaxed">
                        Autorizo el tratamiento de mis datos de contacto para la activación del ecosistema Club Platform, coordinación distrital y recepción de novedades conforme a la política de privacidad rotaria.
                      </label>
                    </div>

                    <div className="flex justify-between pt-4 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-800 font-bold px-4 py-2.5 text-sm"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Atrás</span>
                      </button>

                      <button
                        type="submit"
                        disabled={submitting || !dataConsent}
                        className="inline-flex items-center gap-2 bg-[#f7a81b] hover:bg-[#e69b15] text-[#0c2340] font-black px-8 py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 text-sm tracking-wide uppercase"
                      >
                        {submitting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                            <span>Procesando...</span>
                          </>
                        ) : (
                          <>
                            <span>ACTIVAR MI CLUB</span>
                            <Sparkles className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          )}
        </section>

        {/* ── SECCIÓN DE BENEFICIOS DETALLADOS ────────────────────────────── */}
        <section className="py-16 px-4 sm:px-6 max-w-5xl mx-auto border-t border-gray-200/60 mt-12">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h3 className="text-xs font-black text-rotary-blue uppercase tracking-widest mb-2">
              Impacto y Escalabilidad
            </h3>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900">
              ¿Por qué activar Club Platform para tu club?
            </h2>
            <p className="text-gray-500 text-sm sm:text-base mt-2">
              Diseñado para resolver las necesidades reales de los clubes rotarios, integrando imagen pública, administración y tesorería en un solo lugar.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-blue-50 text-rotary-blue rounded-xl shrink-0">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-base mb-1">Sitio Web Oficial y Autogestionable</h4>
                <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                  Tu club contará con un portal público seguro bajo dominio oficial (.org), optimizado para computadores y teléfonos, sin depender de programadores externos.
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <Megaphone className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-base mb-1">Rotary en Acción Automatizado</h4>
                <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                  Reporta las actividades y proyectos comunitarios de tu club en 3 minutos. El sistema redacta borradores de artículos con IA y genera Reels listos para redes.
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-base mb-1">Directorio de Socios y Gobernanza</h4>
                <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                  Visualiza la junta directiva activa, comités, historial de membresía y comunicación institucional sin duplicar planillas de Excel.
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-base mb-1">Bóveda de Fondos y Recaudación Segura</h4>
                <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                  Recibe donaciones online con tarjetas de crédito, débito o transferencias locales para tus obras sociales, con trazabilidad contable inmediata.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ActivarMiClub;
