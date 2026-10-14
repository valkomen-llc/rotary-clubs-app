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
  HelpCircle, Star, Compass, Info, Lock, Cloud, GraduationCap,
  Rocket, TrendingUp, History, X, ArrowDown, ChevronRight
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { PublicPageHeader } from '../components/common/PublicInstitutionalComponents';
import { useSEO } from '../hooks/useSEO';
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, flagEmoji } from '../lib/countryPhones';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

export interface PillarDetail {
  id: string;
  title: string;
  shortDesc: string;
  iconName: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  badge: string;
  extendedPoints: string[];
  membershipImpact: string;
}

export const SIX_PILLARS: PillarDetail[] = [
  {
    id: 'presencia_institucional',
    title: 'Presencia institucional',
    shortDesc: 'Tu club con identidad propia, presencia profesional y mayor visibilidad en internet.',
    iconName: 'Globe',
    accentBg: 'bg-blue-50',
    accentText: 'text-blue-700',
    accentBorder: 'border-blue-100',
    badge: 'Identidad Propia',
    extendedPoints: [
      'Sitio web institucional personalizado para el club con dominio oficial y correos corporativos.',
      'Directorio digital de socios, cuadro social y junta directiva actualizada.',
      'Historia, misión, visión, proyectos emblemáticos y memoria rotaria del club.',
      'Legado digital y continuidad institucional: transición ordenada entre juntas directivas.',
      'Información institucional, estatutos, actas y gestión administrativa por período rotario.',
      'Programas de nuevas generaciones: Rotaract, Interact, ROTEX e intercambios.',
      'Publicación de documentos, manuales e informes periódicos.',
      'Mayor visibilidad para atraer personas interesadas en conocer y vincularse al club.',
      'Fortalecimiento de la membresía: haz visible tu club para atraer nuevos socios y líderes.'
    ],
    membershipImpact: '«Haz visible tu club, conecta con tu comunidad y abre nuevas oportunidades para atraer socios, voluntarios y aliados». Una presencia institucional profesional facilita la llegada de nuevos líderes y asegura la continuidad del legado rotario entre juntas directivas.'
  },
  {
    id: 'marketing_inteligente',
    title: 'Marketing inteligente',
    shortDesc: 'Comunica tus actividades, fortalece tu imagen pública y conecta con nuevas audiencias.',
    iconName: 'Megaphone',
    accentBg: 'bg-amber-50',
    accentText: 'text-amber-700',
    accentBorder: 'border-amber-100',
    badge: 'Impacto & Difusión',
    extendedPoints: [
      'Creación asistida de contenidos con inteligencia artificial y copys listos para redes.',
      'Integración con canales digitales, WhatsApp y boletines institucionales.',
      'Módulo de noticias y blog para destacar el impacto de las obras del club.',
      'Calendario centralizado de actividades, reuniones y eventos distritales.',
      'Campañas de comunicación y boletines institucionales automatizados.',
      'Posicionamiento orgánico en motores de búsqueda (SEO local) para encontrar al club.',
      'Estadísticas claras de alcance y métricas de crecimiento.',
      'Promoción activa de proyectos y actividades de servicio comunitario.',
      'Fortalecimiento del cuadro social: estrategias probadas para atraer nuevos socios, voluntarios y aliados.',
      'Comunicación 100% alineada con las directrices de imagen pública de Rotary International.'
    ],
    membershipImpact: '«Haz visible tu club, conecta con tu comunidad y abre nuevas oportunidades para atraer socios, voluntarios y aliados». La comunicación activa y profesional despierta el interés comunitario y facilita la incorporación de líderes con vocación de servicio.'
  },
  {
    id: 'proyectos_recursos',
    title: 'Proyectos y recursos',
    shortDesc: 'Impulsa tus proyectos, recibe donaciones y crea nuevas oportunidades de financiación.',
    iconName: 'CreditCard',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-700',
    accentBorder: 'border-emerald-100',
    badge: 'Sostenibilidad',
    extendedPoints: [
      'Fichas públicas de gestión y promoción de proyectos humanitarios.',
      'Campañas de crowdfunding y financiamiento participativo.',
      'Bóveda de donaciones en línea seguras con tarjeta, PSE o PayPal.',
      'Estrategias de recaudación de fondos institucionales (Fundraising).',
      'Módulo de recaudación y control de cuotas de membresía.',
      'Tienda virtual del club para productos y actividades benéficas.',
      'Venta de recuerdos, artículos institucionales y pines rotarios.',
      'Inscripciones, acreditación y boletería digital para eventos.',
      'Campañas especiales de recaudación de fondos y ayuda en emergencias.',
      'Mayor visibilidad de proyectos para conseguir patrocinadores y aliados.'
    ],
    membershipImpact: 'Proyectos transparentes con captación en línea aumentan la confianza de donantes, aliados estratégicos y nuevos miembros comprometidos con el servicio.'
  },
  {
    id: 'gestion_nube',
    title: 'Gestión en la nube',
    shortDesc: 'Centraliza la información de tu club con infraestructura tecnológica segura y organizada.',
    iconName: 'Cloud',
    accentBg: 'bg-indigo-50',
    accentText: 'text-indigo-700',
    accentBorder: 'border-indigo-100',
    badge: 'Memoria Institucional',
    extendedPoints: [
      'Alojamiento web en la nube de alta velocidad, disponibilidad y certificados SSL.',
      'Infraestructura tecnológica en la nube moderna y escalable.',
      'Gestión técnica de dominios y certificados SSL seguros.',
      'Cuentas de correo institucionales bajo el dominio del club.',
      'Biblioteca multimedia institucional para fotos, videos y evidencias de proyectos.',
      'Almacenamiento organizado de archivos, evidencias y resoluciones.',
      'Legado digital y archivo histórico: clasificación de contenidos por período rotario.',
      'Continuidad institucional: transición ordenada entre juntas directivas entrantes y salientes.',
      'Panel administrativo intuitivo para la junta directiva.',
      'Estadísticas de visitas y comportamiento del portal.',
      'Copias de seguridad periódicas y protección contra pérdida de datos.',
      'Gestión centralizada de la información del club.'
    ],
    membershipImpact: '«Tu club evoluciona. Su legado permanece». Conserva la historia, los proyectos, las actividades y el conocimiento de tu club en un solo lugar, facilitando una transición impecable y sin traumatismos entre juntas directivas y períodos rotarios.'
  },
  {
    id: 'acompanamiento_continuo',
    title: 'Acompañamiento continuo',
    shortDesc: 'Tu club cuenta con orientación y formación para aprovechar su ecosistema digital.',
    iconName: 'GraduationCap',
    accentBg: 'bg-purple-50',
    accentText: 'text-purple-700',
    accentBorder: 'border-purple-100',
    badge: 'Capacitación & Guía',
    extendedPoints: [
      'Capacitación inicial y continua en el uso de Club Platform.',
      'Sesiones de inducción para administradores y secretarios.',
      'Formación práctica en herramientas digitales y redes.',
      'Acompañamiento en estrategia de comunicación institucional.',
      'Asistencia personalizada para la carga inicial de contenidos.',
      'Guías y manuales de buenas prácticas digitales para clubes.',
      'Repositorio de recursos de aprendizaje y videos explicativos.',
      'Canal de soporte y orientación activa durante todo el período rotario.'
    ],
    membershipImpact: 'Acompañamos a tu equipo paso a paso, asegurando que cualquier socio del club pueda gestionar el ecosistema sin requerir conocimientos técnicos avanzados.'
  },
  {
    id: 'evolucion_continua',
    title: 'Evolución continua',
    shortDesc: 'Un ecosistema que evoluciona constantemente con nuevas herramientas, mejoras e innovación.',
    iconName: 'Rocket',
    accentBg: 'bg-rose-50',
    accentText: 'text-rose-700',
    accentBorder: 'border-rose-100',
    badge: 'Innovación Activa',
    extendedPoints: [
      'Desarrollo e ingeniería constante de Club Platform.',
      'Despliegue periódico de nuevas funcionalidades y mejoras.',
      'Incorporación progresiva de herramientas según las necesidades de los clubes.',
      'Innovación y automatización con modelos de inteligencia artificial.',
      'Optimización permanente de velocidad y rendimiento web.',
      'Actualizaciones de seguridad y refinamiento de la experiencia de usuario.',
      'Nuevas integraciones con herramientas digitales de Rotary y pasarelas.',
      'Evolución de herramientas administrativas y analítica institucional.',
      'Actualizaciones orientadas a las necesidades reales de los clubes.',
      'Desarrollo de soluciones para nuevos desafíos institucionales.'
    ],
    membershipImpact: 'Tu club accede a una tecnología de vanguardia que no se vuelve obsoleta, manteniendo a tu membresía a la vanguardia de la innovación social.'
  }
];

export const getPillarIcon = (iconName: string, className = "w-6 h-6") => {
  switch (iconName) {
    case 'Globe': return <Globe className={className} />;
    case 'Megaphone': return <Megaphone className={className} />;
    case 'CreditCard': return <CreditCard className={className} />;
    case 'Cloud': return <Cloud className={className} />;
    case 'GraduationCap': return <GraduationCap className={className} />;
    case 'Rocket': return <Rocket className={className} />;
    case 'Users': return <Users className={className} />;
    default: return <Sparkles className={className} />;
  }
};

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

  // Pilares seleccionados en el enfoque (por defecto todos seleccionados: Ecosistema Integral)
  const [selectedPillars, setSelectedPillars] = useState<string[]>(SIX_PILLARS.map(p => p.id));
  const [activeModalPillar, setActiveModalPillar] = useState<PillarDetail | null>(null);

  // Estados de interfaz y envío
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [hasStartedForm, setHasStartedForm] = useState(false);
  const visitorIdRef = useRef<string>(getVisitorId());

  // ¿Está seleccionado el ecosistema integral completo (los 6 pilares)?
  const isEcosistemaIntegral = useMemo(() => {
    return SIX_PILLARS.length > 0 && SIX_PILLARS.every(p => selectedPillars.includes(p.id));
  }, [selectedPillars]);

  const toggleEcosistemaIntegral = useCallback(() => {
    setSelectedPillars(prev => {
      const allSelected = SIX_PILLARS.length > 0 && SIX_PILLARS.every(p => prev.includes(p.id));
      return allSelected ? [] : SIX_PILLARS.map(p => p.id);
    });
  }, []);

  const togglePillar = useCallback((id: string) => {
    setSelectedPillars(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);

  const scrollToForm = useCallback(() => {
    const el = document.getElementById('formulario-activacion');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Manejo de tecla Escape y bloqueo de scroll para el modal de pilar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveModalPillar(null);
    };
    if (activeModalPillar) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [activeModalPillar]);

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
    if (selectedPillars.length === 0) {
      toast.error('Por favor selecciona al menos un pilar o área de interés.');
      setStep(3);
      return;
    }
    if (!dataConsent) {
      toast.error('Debes aceptar la autorización de tratamiento de datos personales.');
      return;
    }

    setSubmitting(true);
    const country = findCountry(phoneIso);
    const fullPhone = `${country.dial} ${phoneNumber.trim()}`;

    const finalInterest = isEcosistemaIntegral
      ? 'ecosistema_integral'
      : (selectedPillars[0] || 'ecosistema_integral');

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
          mainInterest: finalInterest,
          selectedPillars,
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
    <div className="min-h-screen bg-rotary-concrete flex flex-col font-sans text-gray-800">
      <Navbar />

      <main className="flex-1">
        {/* ── SECCIÓN 1: CABECERA INSTITUCIONAL COMPARTIDA ────────────────── */}
        <PublicPageHeader
          title="¡Activa el ecosistema digital de tu club!"
          titleClassName="text-2xl sm:text-3xl md:text-4xl lg:text-[36px] xl:text-[40px] leading-tight font-normal whitespace-normal lg:whitespace-nowrap"
          subtitle="Conecta, comunica y potencia el impacto de tu club con tecnología inteligente, herramientas integradas y acompañamiento durante todo el período rotario."
        />

        {/* ── SECCIÓN 2: SEIS PILARES DEL ECOSISTEMA ──────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-3 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            {SIX_PILLARS.map((pillar) => (
              <div
                key={pillar.id}
                onClick={() => setActiveModalPillar(pillar)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setActiveModalPillar(pillar); } }}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-100 shadow-xs hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col justify-between h-full group text-left cursor-pointer"
              >
                <div>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mb-3 transition-transform duration-200 group-hover:scale-105", pillar.accentBg, pillar.accentText, pillar.accentBorder)}>
                    {getPillarIcon(pillar.iconName, "w-5 h-5")}
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-gray-900 group-hover:text-rotary-blue transition-colors">
                    {pillar.title}
                  </h3>

                  <p className="text-xs text-gray-500 leading-relaxed mt-1 line-clamp-2">
                    {pillar.shortDesc}
                  </p>
                </div>

                <div className="pt-2.5 mt-2.5 border-t border-gray-50 flex items-center text-xs font-bold text-rotary-blue group-hover:text-[#002868] transition-colors">
                  <span className="inline-flex items-center gap-1">
                    <span>Ver beneficios</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECCIÓN 3: FORMULARIO DE ACTIVACIÓN ─────────────────────────── */}
        <div id="formulario-activacion" className="max-w-4xl mx-auto px-4 sm:px-6 pt-2 pb-16 space-y-4 relative z-10 scroll-mt-4">
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
                <div className="flex justify-between border-b border-gray-200/60 pb-2">
                  <span className="text-gray-500">WhatsApp:</span>
                  <span className="font-semibold text-gray-800">{findCountry(phoneIso).dial} {phoneNumber}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-gray-500">Enfoque:</span>
                  <span className="font-bold text-rotary-blue text-right">
                    {isEcosistemaIntegral ? 'Ecosistema Integral (6 Pilares)' : `${selectedPillars.length} pilares seleccionados`}
                  </span>
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
            <>
              {/* Pasos / Wizard Header */}
              <nav aria-label="Progreso de activación" className="bg-white rounded-2xl border border-gray-100 px-4 sm:px-6 py-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2 overflow-x-auto">
                  {[
                    { num: 1, label: 'Tu Club' },
                    { num: 2, label: 'Responsable' },
                    { num: 3, label: 'Enfoque' },
                    { num: 4, label: 'Confirmación' },
                  ].map((s) => {
                    const isActive = step === s.num;
                    const isCompleted = step > s.num;
                    return (
                      <button
                        key={s.num}
                        type="button"
                        onClick={() => { if (isCompleted) setStep(s.num); }}
                        disabled={!isCompleted && !isActive}
                        aria-current={isActive ? 'step' : undefined}
                        className={`flex items-center gap-2 text-xs font-bold whitespace-nowrap px-3 py-1.5 rounded-full transition-all ${
                          isActive
                            ? 'bg-rotary-blue text-white shadow-sm'
                            : isCompleted
                            ? 'text-rotary-blue hover:bg-blue-50 cursor-pointer'
                            : 'text-gray-400 disabled:opacity-60 cursor-default'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                            isActive
                              ? 'bg-white/25 text-white'
                              : isCompleted
                              ? 'bg-rotary-blue text-white'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {s.num}
                        </span>
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="sm:hidden text-[11px] font-bold text-gray-400 mt-2">
                  Paso {step} de 4
                </p>
              </nav>

              {/* TARJETA DEL FORMULARIO */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 md:p-10 shadow-sm border border-gray-100">

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

                {/* ── PASO 3: ENFOQUE Y SELECCIÓN DE PILARES ─────────────── */}
                {step === 3 && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-gray-900 mb-1">
                        ¿Qué pilares le interesan a tu club?
                      </h2>
                      <p className="text-sm text-gray-500">
                        Puedes seleccionar el ecosistema integral con todos los beneficios incluidos, o indicar qué áreas le urgen a tu junta directiva.
                      </p>
                    </div>

                    {/* Opción Destacada: Ecosistema Integral */}
                    <div
                      onClick={toggleEcosistemaIntegral}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleEcosistemaIntegral(); } }}
                      className={cn(
                        "p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-4",
                        isEcosistemaIntegral
                          ? "bg-gradient-to-r from-blue-50 to-amber-50/60 border-rotary-blue shadow-sm ring-1 ring-rotary-blue"
                          : "bg-gray-50/70 border-gray-200 hover:border-gray-300 hover:bg-white"
                      )}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border",
                          isEcosistemaIntegral ? "bg-[#f7a81b] text-[#0c2340] border-[#e69b15]" : "bg-white text-gray-400 border-gray-200"
                        )}>
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm sm:text-base text-gray-900">
                              Me interesa el ecosistema integral
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                              Recomendado
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Habilita los 6 pilares estratégicos de Club Platform para tu club (sitio web, marketing, recursos, nube, acompañamiento e innovación).
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <div className={cn(
                          "w-6 h-6 rounded-lg border flex items-center justify-center transition-colors",
                          isEcosistemaIntegral
                            ? "bg-rotary-blue border-rotary-blue text-white shadow-xs"
                            : "border-gray-300 bg-white"
                        )}>
                          {isEcosistemaIntegral && <Check className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Indicador de selección */}
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                      <span className="font-bold text-gray-700">Seleccionar pilares individuales:</span>
                      <span className="text-gray-500 font-medium">{selectedPillars.length} de {SIX_PILLARS.length} seleccionados</span>
                    </div>

                    {/* Cuadrícula de 6 Pilares Seleccionables */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {SIX_PILLARS.map((p) => {
                        const isChecked = selectedPillars.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => togglePillar(p.id)}
                            role="checkbox"
                            aria-checked={isChecked}
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePillar(p.id); } }}
                            className={cn(
                              "text-left p-4 rounded-2xl border-2 transition-all flex items-start justify-between gap-3 cursor-pointer select-none",
                              isChecked
                                ? "bg-blue-50/50 border-rotary-blue shadow-2xs ring-1 ring-rotary-blue/70"
                                : "bg-gray-50/40 border-gray-100 hover:bg-white hover:border-gray-200"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn("p-2 rounded-xl bg-white shadow-2xs shrink-0 border", p.accentBorder, p.accentText)}>
                                {getPillarIcon(p.iconName, "w-4 h-4")}
                              </div>
                              <div>
                                <div className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                                  <span>{p.title}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                  {p.shortDesc}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 mt-0.5">
                              <div className={cn(
                                "w-5 h-5 rounded-md border flex items-center justify-center transition-colors",
                                isChecked
                                  ? "bg-rotary-blue border-rotary-blue text-white"
                                  : "border-gray-300 bg-white"
                              )}>
                                {isChecked && <Check className="w-3.5 h-3.5" />}
                              </div>
                            </div>
                          </div>
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
                        disabled={selectedPillars.length === 0}
                        onClick={() => setStep(4)}
                        className="inline-flex items-center gap-2 bg-rotary-blue hover:bg-[#002868] text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all disabled:opacity-50 text-sm"
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
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 pt-1">
                        <span className="text-gray-500 shrink-0">Pilares Solicitados:</span>
                        <div className="flex flex-wrap gap-1.5 sm:justify-end">
                          {isEcosistemaIntegral ? (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-100 text-[#013388] border border-blue-200 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                              Ecosistema Integral (6 Pilares)
                            </span>
                          ) : (
                            selectedPillars.map(pId => {
                              const pil = SIX_PILLARS.find(p => p.id === pId);
                              return (
                                <span key={pId} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200/60">
                                  {pil?.title || pId}
                                </span>
                              );
                            })
                          )}
                        </div>
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
                        className="inline-flex items-center gap-2 bg-[#f7a81b] hover:bg-[#e69b15] text-[#0c2340] font-black px-8 py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 text-sm tracking-wide uppercase cursor-pointer"
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
            </>
          )}
        </div>

        {/* ── MODAL LIGERO DE CARACTERÍSTICAS DEL PILAR ─────────────────── */}
        {activeModalPillar && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
            onClick={() => setActiveModalPillar(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-pillar-title"
          >
            <div
              className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cabecera del Modal */}
              <div className="p-6 sm:p-7 border-b border-gray-100 flex items-start justify-between gap-4 bg-gray-50/50">
                <div className="flex items-start gap-4">
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border", activeModalPillar.accentBg, activeModalPillar.accentText, activeModalPillar.accentBorder)}>
                    {getPillarIcon(activeModalPillar.iconName, "w-6 h-6")}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-rotary-blue bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/60 inline-block mb-1.5">
                      {activeModalPillar.badge}
                    </span>
                    <h3 id="modal-pillar-title" className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
                      {activeModalPillar.title}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {activeModalPillar.shortDesc}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveModalPillar(null)}
                  aria-label="Cerrar detalles del pilar"
                  className="w-9 h-9 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center shrink-0 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Contenido / Bullets */}
              <div className="p-6 sm:p-7 overflow-y-auto space-y-6 flex-1 text-left">
                <div>
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
                    Herramientas y Capacidades Incluidas
                  </h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeModalPillar.extendedPoints.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-700 bg-gray-50/60 p-2.5 rounded-xl border border-gray-100">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="leading-snug">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Impacto en Membresía / Legado */}
                <div className="bg-blue-50/60 border border-blue-200/70 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-rotary-blue flex items-center justify-center shrink-0 mt-0.5">
                    {activeModalPillar.id === 'gestion_nube' ? (
                      <History className="w-4 h-4" />
                    ) : (
                      <TrendingUp className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-rotary-blue uppercase tracking-wider mb-1">
                      {activeModalPillar.id === 'gestion_nube'
                        ? 'Legado Digital y Continuidad Institucional'
                        : activeModalPillar.id === 'presencia_institucional' || activeModalPillar.id === 'marketing_inteligente'
                        ? 'Fortalecimiento de la Membresía y Cuadro Social'
                        : 'Impacto Estratégico y Sostenibilidad'}
                    </h5>
                    <p className="text-xs sm:text-sm text-blue-950 leading-relaxed font-medium">
                      {activeModalPillar.membershipImpact}
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer del Modal */}
              <div className="p-4 sm:p-6 border-t border-gray-100 bg-gray-50/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModalPillar(null)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-100 transition-colors"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedPillars.includes(activeModalPillar.id)) {
                      setSelectedPillars(prev => [...prev, activeModalPillar.id]);
                    }
                    setActiveModalPillar(null);
                    scrollToForm();
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-rotary-blue hover:bg-[#002868] text-white font-bold px-6 py-2.5 rounded-xl shadow-sm text-sm transition-all cursor-pointer"
                >
                  <span>Activar para mi club con este pilar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default ActivarMiClub;
