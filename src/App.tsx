import React, { useEffect, Suspense } from 'react';
import { lazyWithRetry } from './lib/lazyWithRetry';
import ChunkErrorBoundary from './components/ChunkErrorBoundary';
import { publicAccessAllowed } from './lib/sitePublication';
import { useSiteSessions } from './lib/siteSession';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';

// Componente para manejar redirecciones de enlaces antiguos con hash (/#/blog...)
const HashRedirector = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    useEffect(() => {
        const hash = window.location.hash;
        if (hash) {
            // Si hay un hash, limpiarlo y navegar a la ruta real
            const cleanPath = hash.replace(/^#/, '') || '/';
            navigate(cleanPath, { replace: true });
        }
    }, [navigate, location]);

    return null;
};

import Navbar from './sections/Navbar';
import HeroSection from './sections/HeroSection';
import ActionSection from './sections/ActionSection';
import StatsSection from './sections/StatsSection';
import HomeBannerSection from './sections/HomeBannerSection';
import SpotlightSection from './sections/SpotlightSection';
import JoinSection from './sections/JoinSection';
import FoundationSection from './sections/FoundationSection';
import CausesHexSection from './sections/CausesHexSection';
import NewsSection from './sections/NewsSection';
import Footer from './sections/Footer';
import LatirSpecialSection from './sections/LatirSpecialSection';
import ServiciosSection from './sections/ServiciosSection';
import DistritosSection from './sections/DistritosSection';
import SubvencionesSection from './sections/SubvencionesSection';































import { AuthProvider, useAuth } from './hooks/useAuth';
import { ClubProvider, useClub } from './contexts/ClubContext';
import { CartProvider } from './contexts/CartContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { Toaster } from './components/ui/sonner';
import { PROJECT_FAIR_FORM_PATH } from './lib/ctaLinks';
import { isPlatformSuperAdmin } from './lib/platformAdmin';

// ═══════════════════════════════════════════════════════════════
// LAZY-LOADED ADMIN ROUTES — Web Performance Optimization Agent
// Only downloaded when the user navigates to /admin/*
// ═══════════════════════════════════════════════════════════════

// ── Páginas públicas, cargadas al entrar (v4.659) ───────────────────
// Antes las 36 se importaban de golpe, así que el archivo inicial pesaba
// 823 kB: quien sólo miraba la portada descargaba también el catálogo de la
// tienda, el checkout y la galería del distrito. Van dentro del <Suspense>
// que ya envuelve a <Routes>, igual que las del panel.
const QuienesSomos = lazyWithRetry(() => import('./pages/QuienesSomos'), 'QuienesSomos');
const NuestraHistoria = lazyWithRetry(() => import('./pages/NuestraHistoria'), 'NuestraHistoria');
const NuestrosSocios = lazyWithRetry(() => import('./pages/NuestrosSocios'), 'NuestrosSocios');
const NuestraJuntaDirectiva = lazyWithRetry(() => import('./pages/NuestraJuntaDirectiva'), 'NuestraJuntaDirectiva');
const CategoryDirectory = lazyWithRetry(() => import('./pages/CategoryDirectory'), 'CategoryDirectory');
const IntercambioJovenes = lazyWithRetry(() => import('./pages/IntercambioJovenes'), 'IntercambioJovenes');
const Blog = lazyWithRetry(() => import('./pages/Blog'), 'Blog');
const BlogPost = lazyWithRetry(() => import('./pages/BlogPost'), 'BlogPost');
const Proyectos = lazyWithRetry(() => import('./pages/Proyectos'), 'Proyectos');
const ProyectoDetalle = lazyWithRetry(() => import('./pages/ProyectoDetalle'), 'ProyectoDetalle');
const Contacto = lazyWithRetry(() => import('./pages/Contacto'), 'Contacto');
const EstadosFinancieros = lazyWithRetry(() => import('./pages/EstadosFinancieros'), 'EstadosFinancieros');
const Descargas = lazyWithRetry(() => import('./pages/Descargas'), 'Descargas');
const NuestrasCausas = lazyWithRetry(() => import('./pages/NuestrasCausas'), 'NuestrasCausas');
const ManerasDeContribuir = lazyWithRetry(() => import('./pages/ManerasDeContribuir'), 'ManerasDeContribuir');
const DonacionExito = lazyWithRetry(() => import('./pages/DonacionExito'), 'DonacionExito');
const DonacionCancelada = lazyWithRetry(() => import('./pages/DonacionCancelada'), 'DonacionCancelada');
const DonacionPaypal = lazyWithRetry(() => import('./pages/DonacionPaypal'));
const Rotaract = lazyWithRetry(() => import('./pages/Rotaract'), 'Rotaract');
const Interact = lazyWithRetry(() => import('./pages/Interact'), 'Interact');
const Rotex = lazyWithRetry(() => import('./pages/Rotex'), 'Rotex');
const FundacionRotaria = lazyWithRetry(() => import('./pages/FundacionRotaria'), 'FundacionRotaria');
const Involucrate = lazyWithRetry(() => import('./pages/Involucrate'), 'Involucrate');
const Eventos = lazyWithRetry(() => import('./pages/Eventos'), 'Eventos');
const EventoDetalle = lazyWithRetry(() => import('./pages/EventoDetalle'), 'EventoDetalle');
const Aportes = lazyWithRetry(() => import('./pages/Aportes'), 'Aportes');
const Checkout = lazyWithRetry(() => import('./pages/Checkout'), 'Checkout');
const OrderSuccess = lazyWithRetry(() => import('./pages/OrderSuccess'), 'OrderSuccess');
const Shop = lazyWithRetry(() => import('./pages/Shop'), 'Shop');
const ProductDetail = lazyWithRetry(() => import('./pages/ProductDetail'), 'ProductDetail');
const DistrictMultimediaGallery = lazyWithRetry(() => import('./pages/DistrictMultimediaGallery'), 'DistrictMultimediaGallery');
const ClubPreview = lazyWithRetry(() => import('./pages/ClubPreview'), 'ClubPreview');
const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'), 'LandingPage');
const RegistroPage = lazyWithRetry(() => import('./pages/RegistroPage'), 'RegistroPage');
const VerifyEmail = lazyWithRetry(() => import('./pages/VerifyEmail'), 'VerifyEmail');
const AppLogin = lazyWithRetry(() => import('./pages/AppLogin'), 'AppLogin');

const GeneradorPendones = lazyWithRetry(() => import('./pages/GeneradorPendones'), 'GeneradorPendones');
// v4.721 — Portal público de Plantillas IA. Perezosa como el resto de las
// páginas públicas (regla de rendimiento de v4.659).
const PlantillaPublica = lazyWithRetry(() => import('./pages/PlantillaPublica'), 'PlantillaPublica');
// Aniversarios IA (v4.895) — módulo INDEPENDIENTE del editor de Plantillas IA.
// Otra ruta, otro controlador, otras tablas y otro flujo: acá no hay lienzo, ni
// capas, ni coordenadas. Ver la sección de CLAUDE.md.
const AniversarioIA = lazyWithRetry(() => import('./pages/AniversarioIA'), 'AniversarioIA');
const FeriaProyectos = lazyWithRetry(() => import('./pages/FeriaProyectos'), 'FeriaProyectos');
const MiProyecto = lazyWithRetry(() => import('./pages/MiProyecto'), 'MiProyecto');
const MiInscripcion = lazyWithRetry(() => import('./pages/MiInscripcion'), 'MiInscripcion');
const RegistroFeria = lazyWithRetry(() => import('./pages/RegistroFeria'), 'RegistroFeria');
const RegistroEvento = lazyWithRetry(() => import('./pages/RegistroEvento'), 'RegistroEvento');
const CompletarInscripcion = lazyWithRetry(() => import('./pages/CompletarInscripcion'), 'CompletarInscripcion');
const Dashboard = lazyWithRetry(() => import('./pages/admin/Dashboard'), 'Dashboard');
const ClubsManagement = lazyWithRetry(() => import('./pages/admin/Clubs'), 'Clubs');
const AsociacionesManagement = lazyWithRetry(() => import('./pages/admin/Asociaciones'), 'Asociaciones');
const ZonasManagement = lazyWithRetry(() => import('./pages/admin/Zonas'), 'Zonas');
const EventosManagement = lazyWithRetry(() => import('./pages/admin/Eventos'), 'Eventos');
const FeriasManagement = lazyWithRetry(() => import('./pages/admin/Ferias'), 'Ferias');
const PostulacionesPagos = lazyWithRetry(() => import('./pages/admin/PostulacionesPagos'), 'PostulacionesPagos');
const ProgramasManagement = lazyWithRetry(() => import('./pages/admin/Programas'), 'Programas');
const DistrictsManagement = lazyWithRetry(() => import('./pages/admin/Districts'), 'Districts');
const ClubSettings = lazyWithRetry(() => import('./pages/admin/ClubSettings'), 'ClubSettings');
const NewsManagement = lazyWithRetry(() => import('./pages/admin/News'), 'News');
const Publicaciones = lazyWithRetry(() => import('./pages/admin/Publicaciones'), 'Publicaciones');
const ProjectsManagement = lazyWithRetry(() => import('./pages/admin/Projects'), 'Projects');
const UsersManagement = lazyWithRetry(() => import('./pages/admin/Users'), 'Users');
const StoreManagement = lazyWithRetry(() => import('./pages/admin/StoreManagement'), 'StoreManagement');
const PaymentBlocksManager = lazyWithRetry(() => import('./pages/admin/PaymentBlocksManager'), 'PaymentBlocksManager');
const ManerasContribuirEditor = lazyWithRetry(() => import('./pages/admin/ManerasContribuirEditor'), 'ManerasContribuirEditor');
const ContributionCampaigns = lazyWithRetry(() => import('./pages/admin/ContributionCampaigns'), 'ContributionCampaigns');
const SpotlightSlides = lazyWithRetry(() => import('./pages/admin/SpotlightSlides'), 'SpotlightSlides');
const ContributionNotifications = lazyWithRetry(() => import('./pages/admin/ContributionNotifications'), 'ContributionNotifications');
const OrdersManagement = lazyWithRetry(() => import('./pages/admin/OrdersManagement'), 'OrdersManagement');
const WalletManagement = lazyWithRetry(() => import('./pages/admin/WalletManagement'), 'WalletManagement');
const NotificationSettings = lazyWithRetry(() => import('./pages/admin/NotificationSettings'), 'NotificationSettings');
const CRMManagement = lazyWithRetry(() => import('./pages/admin/CRM'), 'CRM');
const AIAssistant = lazyWithRetry(() => import('./pages/admin/AIAssistant'), 'AIAssistant');
const MediaLibrary = lazyWithRetry(() => import('./pages/admin/MediaLibrary'), 'MediaLibrary');
const ContentCalendar = lazyWithRetry(() => import('./pages/admin/ContentCalendar'), 'ContentCalendar');
const KnowledgeBase = lazyWithRetry(() => import('./pages/admin/KnowledgeBase'), 'KnowledgeBase');
const Integrations = lazyWithRetry(() => import('./pages/admin/Integrations'), 'Integrations');
const Translations = lazyWithRetry(() => import('./pages/admin/Translations'), 'Translations');
const SeoIntelligence = lazyWithRetry(() => import('./pages/admin/SeoIntelligence'), 'SeoIntelligence');
const AnalyticsPage = lazyWithRetry(() => import('./pages/admin/Analytics'), 'Analytics');
const LeadsManagement = lazyWithRetry(() => import('./pages/admin/Leads'), 'Leads');
const EmailManagement = lazyWithRetry(() => import('./pages/admin/EmailManagement'), 'EmailManagement');
// Mi perfil (v4.932): lo abre CUALQUIER sesión de plataforma, no sólo la
// institucional — un administrador también quiere cambiar su contraseña.
const Perfil = lazyWithRetry(() => import('./pages/admin/Perfil'), 'Perfil');
// Restablecer contraseña: PÚBLICA a propósito. Se llega desde el enlace del
// correo, o sea justamente sin sesión.
const RestablecerPassword = lazyWithRetry(() => import('./pages/RestablecerPassword'), 'RestablecerPassword');
const EmailMarketing = lazyWithRetry(() => import('./pages/admin/EmailMarketing'), 'EmailMarketing');
const FAQManagement = lazyWithRetry(() => import('./pages/admin/FAQs'), 'FAQs');
const AgentsManagement = lazyWithRetry(() => import('./pages/admin/Agents'), 'Agents');
const MissionControlVIP = lazyWithRetry(() => import('./pages/admin/MissionControlVIP'), 'MissionControlVIP');
const SystemUpdates = lazyWithRetry(() => import('./pages/SystemUpdates'), 'SystemUpdates');
const SiteUnderConstruction = lazyWithRetry(() => import('./pages/SiteUnderConstruction'), 'SiteUnderConstruction');
const ImageDistribution = lazyWithRetry(() => import('./pages/admin/ImageDistribution'), 'ImageDistribution');
const OnboardingFlow = lazyWithRetry(() => import('./pages/admin/OnboardingFlow'), 'OnboardingFlow');
const MembersPage = lazyWithRetry(() => import('./pages/admin/MembersPage'), 'MembersPage');
// ⚠️ `lazyWithRetry`, nunca `React.lazy` a secas: un archivo del despliegue
// anterior que ya no existe deja la pantalla en blanco PARA SIEMPRE, porque
// React cachea la promesa rechazada (v4.791). Lo comprueba `npm run test:spa`.
const UsersAndRoles = lazyWithRetry(() => import('./pages/admin/UsersAndRoles'), 'UsersAndRoles');
const RotaractPage = lazyWithRetry(() => import('./pages/admin/RotaractPage'), 'RotaractPage');
const InteractPage = lazyWithRetry(() => import('./pages/admin/InteractPage'), 'InteractPage');
const FinancialPage = lazyWithRetry(() => import('./pages/admin/FinancialPage'), 'FinancialPage');
const DownloadsManagement = lazyWithRetry(() => import('./pages/admin/DownloadsPage'), 'DownloadsPage');
const YouthExchangePage = lazyWithRetry(() => import('./pages/admin/YouthExchangePage'), 'YouthExchangePage');
const NGSEPage = lazyWithRetry(() => import('./pages/admin/NGSEPage'), 'NGSEPage');
const RotexPage = lazyWithRetry(() => import('./pages/admin/RotexPage'), 'RotexPage');
const EventsManagement = lazyWithRetry(() => import('./pages/admin/Events'), 'Events');
const WhatsAppQR = lazyWithRetry(() => import('./pages/admin/WhatsAppQR'), 'WhatsAppQR');
const SuperAssistantChat = lazyWithRetry(() => import('./pages/admin/SuperAssistantChat'), 'SuperAssistantChat');
const ContentStudio = lazyWithRetry(() => import('./pages/admin/ContentStudio'), 'ContentStudio');
const AnniversaryStudio = lazyWithRetry(() => import('./pages/admin/AnniversaryStudio'), 'AnniversaryStudio');
const FooterSystem = lazyWithRetry(() => import('./pages/admin/FooterSystem'), 'FooterSystem');
const SocialHub = lazyWithRetry(() => import('./pages/admin/SocialHub'), 'SocialHub');
const TechnicalRequests = lazyWithRetry(() => import('./pages/admin/TechnicalRequests'), 'TechnicalRequests');
const DistrictIQ = lazyWithRetry(() => import('./pages/admin/DistrictIQ'), 'DistrictIQ');
const CrowdfundWallet = lazyWithRetry(() => import('./pages/admin/CrowdfundWallet'), 'CrowdfundWallet');
const AICore = lazyWithRetry(() => import('./pages/admin/AICore'), 'AICore');
const ClubPlatformInsights = lazyWithRetry(() => import('./pages/admin/ClubPlatformInsights'), 'ClubPlatformInsights');
const AgendaSoporte = lazyWithRetry(() => import('./pages/admin/AgendaSoporte'), 'AgendaSoporte');
const CapacitacionesAdmin = lazyWithRetry(() => import('./pages/admin/CapacitacionesAdmin'), 'CapacitacionesAdmin');
const AgendarCapacitacion = lazyWithRetry(() => import('./pages/AgendarCapacitacion'), 'AgendarCapacitacion');
const MiCapacitacion = lazyWithRetry(() => import('./pages/MiCapacitacion'), 'MiCapacitacion');
const SharedReport = lazyWithRetry(() => import('./pages/SharedReport'), 'SharedReport');

import ChatBot from './components/ChatBot';


import ExpirationBanner from './components/ExpirationBanner';
import DevelopmentBanner from './components/DevelopmentBanner';





const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Inject GA4 script dynamically with the real Measurement ID
function injectGA4Tag(gaId: string) {
  if (!gaId || !gaId.startsWith('G-')) return;
  // Don't double-inject
  if (document.getElementById('ga4-tag-script')) return;

  const s1 = document.createElement('script');
  s1.id = 'ga4-tag-script';
  s1.async = true;
  s1.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(s1);

  const s2 = document.createElement('script');
  s2.id = 'ga4-tag-config';
  s2.innerHTML = [
    'window.dataLayer = window.dataLayer || [];',
    'function gtag(){dataLayer.push(arguments);}',
    "gtag('js', new Date());",
    `gtag('config', '${gaId}', { anonymize_ip: true });`,
  ].join('\n');
  document.head.appendChild(s2);
}

// Roles de la plataforma que pueden entrar al panel administrativo. Es una
// lista EXPLÍCITA a propósito: hasta v4.625 el guardián sólo comprobaba que
// hubiera sesión iniciada, así que cualquier identidad de la tabla `User`
// alcanzaba las 114 pantallas de /admin. Un rol nuevo debe agregarse aquí
// deliberadamente, no heredar el acceso por descuido.
//
// El Gestor de Proyectos NO está —ni puede estar— en esta lista: su identidad
// vive en otra tabla (`ProjectFairAccount`) y su token usa otra audiencia, así
// que nunca llega hasta aquí. Su lugar es /mi-proyecto.
const ADMIN_ROLES = [
  'administrator', 'superadmin', 'district_admin', 'club_admin',
  'editor', 'member', 'crowdfunder',
  // Agente del WhatsApp CRM (v4.696). Pinta el panel para llegar a su bandeja;
  // qué responde el servidor lo decide `ADMIN_ROLES` de server/middleware/auth.js,
  // que es la otra mitad de esta lista y hay que cambiar junto con ésta.
  'crm_agent',
  // Usuario institucional (v4.932): el dueño de una cuenta de correo del sitio.
  // Pinta el panel para llegar a sus herramientas; QUÉ ve dentro lo decide
  // `can()` de `src/lib/institutionalAccess.ts`, y qué responde el servidor lo
  // decide `requirePermission`. Está acá y NO en los roles administrativos.
  'institutional_user',
];

/**
 * Sólo el super administrador de la plataforma. Se usa para lo que es interno
 * del producto y no del sitio de cada club —hoy, el historial de lanzamientos—.
 *
 * NOTA HONESTA: esto impide llegar por la interfaz y evita que el navegador
 * descargue esa pantalla, pero el historial se compila dentro del paquete del
 * sitio. Para que sea inaccesible de verdad habría que servirlo desde el
 * servidor detrás de una sesión, no empaquetarlo con la aplicación.
 */
const PlatformOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!isPlatformSuperAdmin(user as any)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  const { club } = useClub();
  if (!isAuthenticated) return <Navigate to="/" />;
  if (!ADMIN_ROLES.includes(String((user as any)?.role || ''))) {
    return <Navigate to="/" replace />;
  }
  // Gate: club admins must complete onboarding first
  // Check both context and localStorage to avoid race conditions after reload
  const lsClub = (() => { try { return JSON.parse(localStorage.getItem('rotary_club') || '{}'); } catch { return {}; } })();
  const onboardingDone = (club as any)?.onboardingCompleted || lsClub?.onboardingCompleted;
  // Skip onboarding if the club already has a published custom domain
  const hasPublishedDomain = (club as any)?.domain && !(club as any).domain.includes('clubplatform.org');
  if (user?.role !== 'administrator' && !onboardingDone && !hasPublishedDomain) {
    return <Navigate to="/admin/onboarding" />;
  }
  return <>{children}</>;
};

const OnboardingGate = () => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" />;
  return <OnboardingFlow />;
};

// Smart Home: shows LandingPage on www.clubplatform.org,
// AppLogin en app.clubplatform.org, y el sitio del club en cualquier otro caso.
// El corte por «en construcción» ya no vive acá: lo hace `ConstructionGate`.
/**
 * La puerta del sitio en construcción — v4.883.
 *
 * ⚠️ VA EN UN SOLO SITIO, envolviendo a `<Routes>`. El sitio tiene más de cien
 * rutas: protegerlas de a una significa que la ruta ciento uno se olvida, y el
 * fallo es MUDO —esa página quedaría pública sin que nada avise—. Acá dentro,
 * una ruta nueva nace protegida sola.
 *
 * Deja pasar tres casos, y `publicAccessAllowed` es quien lo decide:
 *   · el sitio no está en construcción (lo normal, y por eso es lo primero);
 *   · la ruta es de las que se sirven siempre — el inicio de sesión y el panel,
 *     porque si no, la puerta se cierra con la llave adentro;
 *   · hay una sesión abierta: el equipo navega el sitio COMPLETO y lo ve como
 *     va a quedar, no en una vista previa.
 *
 * ⚠️ ESTO RESTRINGE LO QUE SE PINTA, NO LO QUE SE SIRVE. La API sigue
 * respondiendo a quien la llame directamente: es una puerta de PUBLICACIÓN
 * —«este sitio todavía no se anuncia»— y no un control de acceso a los datos.
 * Decirlo importa: creer que protege más de lo que protege es peor que saber
 * exactamente qué hace.
 */
const ConstructionGate = ({ children }: { children: React.ReactNode }) => {
  const { club, isLoading } = useClub();
  const { pathname } = useLocation();
  // Las TRES identidades del sitio, no sólo la del panel: el pedido dice
  // «usuarios autenticados y administradores», y quién sabe leerlas es
  // `siteSession` desde v4.693.
  const sessions = useSiteSessions();

  // Mientras no se sabe qué sitio es, no se decide: dar por «en construcción»
  // un sitio cuyo estado todavía no llegó lo taparía por un instante en cada
  // visita, y eso se ve como un parpadeo raro en un sitio que está publicado.
  if (isLoading) return <>{children}</>;

  const { allowed } = publicAccessAllowed({
    status: club?.status,
    path: pathname,
    hasSession: sessions.length > 0,
  });

  return allowed ? <>{children}</> : <SiteUnderConstruction />;
};

function SmartHome() {
  const { isMainPlatform, isAppPortal, isDraft, club } = useClub();
  const { isAuthenticated, user } = useAuth();
  
  // If the URL has a club override parameter, we want to preview the club site, NOT enter the admin dashboard.
  const isPreviewingSite = window.location.search.includes('club=') || 
                           window.location.search.includes('asociacion=') || 
                           window.location.search.includes('distrito=');

  if (isAppPortal && !isPreviewingSite) {
    if (isAuthenticated) {
      // If club admin hasn't completed onboarding, send to wizard
      const lsClub = (() => { try { return JSON.parse(localStorage.getItem('rotary_club') || '{}'); } catch { return {}; } })();
      const onboardingDone = (club as any)?.onboardingCompleted || lsClub?.onboardingCompleted;
      // Skip onboarding if the club already has a published custom domain
      const hasPublishedDomain = (club as any)?.domain && !(club as any).domain.includes('clubplatform.org');
      if (user?.role !== 'administrator' && !onboardingDone && !hasPublishedDomain) {
        return <Navigate to="/admin/onboarding" />;
      }
      
      const isProduction = !isDraft && (
        club?.status === 'active' || 
        club?.status === 'published' || 
        !!(club as any)?.production || 
        !!(club as any)?.isPublished || 
        !!(club as any)?.domainConnected ||
        (!!club?.domain && !club.domain.includes('clubplatform.org'))
      );

      if (user?.role === 'editor') return <Navigate to="/admin/analytics" />;
      return <Navigate to={isProduction ? "/admin/analytics" : "/admin/dashboard"} />;
    }
    return <AppLogin />;
  }
  if (isMainPlatform) return <LandingPage />;
  // El corte por «en construcción» ya NO vive acá: lo hace `ConstructionGate`,
  // que envuelve a todas las rutas. Dejarlo también en la portada tendría dos
  // criterios para lo mismo —y sólo cubría `/`, así que entrar directo a
  // `/proyectos` se saltaba la restricción entera (v4.883).

  // Un DISTRITO no tiene portada propia: cae en el sitio estándar de más abajo y se
  // arma con su configuración, como cualquier otro (v4.737).
  //
  // Hasta v4.736 acá se devolvía `<DistrictMultimediaGallery />` —el formulario de la
  // Conferencia Bidistrital Medellín 2026—. La condición se escribió para 4271, pero la
  // primera de sus tres alternativas miraba el TIPO de sitio, no el número, así que
  // atrapaba a 4281 y a cualquier distrito que se creara después: se quedaban sin
  // portada y sin ningún ajuste del panel que lo apagara. La galería sigue viva, ahora
  // en `/galeria-multimedia`, y se enlaza desde el menú del sitio que la necesite.

  // Foundation site (COLROTARIOS) — reuses shell, different middle content
  if ((club as any)?.type === 'foundation') {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main>
          <HeroSection />
          <StatsSection />
          {club?.subdomain !== 'latir' && <ServiciosSection />}
          <DistritosSection />
          {club?.subdomain !== 'latir' && <SubvencionesSection />}
          <JoinSection />
          <CausesHexSection />
          <NewsSection />
          {/* Bloque Destacado. Va en TODAS las portadas, no sólo en la del
              sitio de club: un llamado global marcado «todos los sitios» se
              resuelve en el servidor y se manda igual, así que la rama que no
              lo monte lo pierde EN SILENCIO — el panel diría que alcanza a N
              sitios y algunos de esos N no lo pintarían. No pinta nada si no
              hay contenido, así que montarlo acá no cambia ningún sitio que no
              lo use (v4.881). */
          }
          <SpotlightSection />
        </main>
        <Footer />
      </div>
    );
  }

  // Association / Network site (LATIR, EMAR, Colrotarios, RYE)
  if ((club as any)?.type === 'association' || (club as any)?.type === 'Programa de Intercambio' || club?.subdomain?.startsWith('rye')) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main>
          <HeroSection />
          {/* As suggested in the plan: Custom stats, maps/programs, and family CTA instead of traditional Club join section */}
          <StatsSection />
          <JoinSection />
          {(club?.subdomain?.toLowerCase().includes('latir') || 
            club?.name?.toLowerCase().includes('latir') || 
            club?.subdomain?.toLowerCase().includes('rye4281')) ? (
            <LatirSpecialSection />
          ) : (
            <SubvencionesSection />
          )}
          {/* For associations we show their involved districts/capabilities instead of a local club action section */}
          <CausesHexSection />
          <NewsSection />
          {/* Bloque Destacado. Va en TODAS las portadas, no sólo en la del
              sitio de club: un llamado global marcado «todos los sitios» se
              resuelve en el servidor y se manda igual, así que la rama que no
              lo monte lo pierde EN SILENCIO — el panel diría que alcanza a N
              sitios y algunos de esos N no lo pintarían. No pinta nada si no
              hay contenido, así que montarlo acá no cambia ningún sitio que no
              lo use (v4.881). */
          }
          <SpotlightSection />
        </main>
        <Footer />
      </div>
    );
  }

  // Default: Club site
  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main>
        <HeroSection />
        <ActionSection />
        {/* Noticias va TERCERO, justo debajo de «Somos gente de acción»
            (v4.745.5, pedido del Distrito). Antes cerraba la portada, donde
            casi nadie llegaba: lo más nuevo del sitio quedaba al final.
            Evento/Convención puede desactivar el contenedor desde su
            configuración, y esa condición se mueve con la sección. */}
        {((club as any)?.eventSections?.news !== false) && <NewsSection />}
        {/* Banda configurable por sitio. No pinta nada si nadie la llenó, así
            que los sitios que no la usan se ven igual que antes. */}
        <HomeBannerSection />
        <JoinSection />
        {/* Las cifras van DEBAJO de «Únete a Rotary» (v4.745.8, pedido del
            Distrito): la invitación a sumarse va primero y los números la
            respaldan, no al revés. */}
        <StatsSection />
        <FoundationSection />
        <CausesHexSection />
        {/* Bloque Destacado. Va en TODAS las portadas, no sólo en la del
            sitio de club: un llamado global marcado «todos los sitios» se
            resuelve en el servidor y se manda igual, así que la rama que no
            lo monte lo pierde EN SILENCIO — el panel diría que alcanza a N
            sitios y algunos de esos N no lo pintarían. No pinta nada si no
            hay contenido, así que montarlo acá no cambia ningún sitio que no
            lo use (v4.881). */
        }
        <SpotlightSection />
      </main>
      <Footer />
    </div>
  );
}

// Lleva la vista al inicio (contenedor principal) en cada cambio de ruta.
// Respeta los anclas (#) para no romper el scroll a secciones específicas.
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);
  return null;
};

// Slugs antiguos del formulario de postulación → ruta canónica, conservando
// query string y hash para no perder los parámetros de retorno de Stripe.
const ProjectFormRedirect = () => {
  const { search, hash } = useLocation();
  return <Navigate to={`${PROJECT_FAIR_FORM_PATH}${search}${hash}`} replace />;
};

// Banners globales (desarrollo / expiración). Se ocultan en secciones públicas
// "tool" que no son sitios de club, como el generador de pendones (gratis).
// El portal público no lleva los avisos del sitio: es una herramienta que se
// abre desde un enlace compartido, no una página del sitio del club.
const HIDE_BANNERS_PATHS = ['/generador-pendones', '/agendar-capacitacion', '/mi-capacitacion', '/plantillas', '/aniversarios'];
const GlobalBanners = () => {
  const { pathname } = useLocation();
  if (HIDE_BANNERS_PATHS.some(p => pathname.startsWith(p))) return null;
  return (<><ExpirationBanner /><DevelopmentBanner /></>);
};

// Analytics Wrapper to track route changes
const AnalyticsTracker = () => {
  const location = useLocation();
  const { club } = useClub();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: location.pathname + location.hash + location.search,
        club_id: club?.id,
        club_name: club?.name,
        club_subdomain: club?.subdomain
      });
    }
  }, [location, club]);

  return null;
};

// SEO Tracker to inject Schema, Meta Tags, and Canonical URLs dynamically
const SEOTracker = () => {
  const location = useLocation();
  const { club } = useClub();

  useEffect(() => {
    if (club) {
        let baseTitle = club.name || 'Rotary ClubPlatform';
        let pageName = 'Inicio';
        
        if (location.pathname.includes('/quienes-somos')) pageName = 'Quiénes Somos';
        else if (location.pathname.includes('/nuestras-causas')) pageName = 'Nuestras Causas';
        else if (location.pathname.includes('/proyectos')) pageName = 'Proyectos de Impacto';
        else if (location.pathname.includes('/blog')) pageName = 'Noticias';
        else if (location.pathname.includes('/eventos')) pageName = 'Eventos';
        else if (location.pathname.includes('/contacto')) pageName = 'Contacto';
        else if (location.pathname.includes('/admin')) pageName = 'DSO Admin';

        if (location.pathname === '/') document.title = `${baseTitle} | Sitio Oficial`;
        else document.title = `${pageName} - ${baseTitle}`;
        
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && club.description) metaDesc.setAttribute("content", club.description);
        
        let linkCanonical = document.querySelector('link[rel="canonical"]');
        if (!linkCanonical) {
            linkCanonical = document.createElement('link');
            linkCanonical.setAttribute('rel', 'canonical');
            document.head.appendChild(linkCanonical);
        }
        const domainUrl = club.domain || (club.subdomain ? `${club.subdomain}.clubplatform.org` : 'rotaryplatform.com');
        linkCanonical.setAttribute('href', `https://${domainUrl}${location.pathname}`);
    }
  }, [location, club]);

  return null;
};

// Main App Router component
function App() {
  // Auto-load real GA4 Measurement ID on startup (applies to all club domains)
  useEffect(() => {
    fetch(`${API_BASE}/translate/analytics`)
      .then(r => r.json())
      .then(d => { if (d?.gaId) injectGA4Tag(d.gaId); })
      .catch(() => { /* GA4 not configured yet - no-op */ });
  }, []);

  return (
    <ClubProvider>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <Router>
              <GlobalBanners />
              <HashRedirector />
              <ScrollToTop />
              <AnalyticsTracker />
              <SEOTracker />
              {/*
                Espera entre páginas. Desde v4.659 también la ven las páginas
                PÚBLICAS, no sólo el panel: el fondo oscuro a pantalla completa
                daba un fogonazo negro en un sitio claro cada vez que alguien
                cambiaba de página. Se deja claro y sin texto —a esta altura la
                espera es de milisegundos, y un rótulo que aparece y desaparece
                molesta más que el propio retraso—. Aparece con un retardo, así
                que en una conexión normal no llega a verse.
              */}
              <ChunkErrorBoundary>
              <ConstructionGate>
              <Suspense fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', background: '#fff' }}>
                  <div style={{ width: 34, height: 34, border: '3px solid #e2e8f0', borderTopColor: '#17458F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', opacity: 0, animationName: 'spin, fadeInLoader', animationDuration: '0.8s, 0.2s', animationDelay: '0s, 0.25s', animationFillMode: 'none, forwards' }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeInLoader { to { opacity: 1; } }`}</style>
                </div>
              }>
              <Routes>
                <Route path="/conferencia" element={<Navigate to="/eventos/2038324a-0e04-497c-9328-fbaeb9ce2992" replace />} />
                <Route path="/" element={<SmartHome />} />
                <Route path="/login" element={<AppLogin />} />
                {/* Se llega desde el enlace del correo, sin sesión. Va con las
                    públicas a propósito. */}
                <Route path="/restablecer" element={<RestablecerPassword />} />
                <Route path="/registro" element={<RegistroPage />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/quienes-somos" element={<QuienesSomos />} />
                <Route path="/nuestras-causas" element={<NuestrasCausas />} />
                <Route path="/maneras-de-contribuir" element={<ManerasDeContribuir />} />
                <Route path="/donacion/exito" element={<DonacionExito />} />
                <Route path="/donacion/cancelada" element={<DonacionCancelada />} />
                {/* v4.866 — El retorno de PayPal, donde se COBRA. */}
                <Route path="/donacion/paypal" element={<DonacionPaypal />} />
                <Route path="/nuestra-historia" element={<NuestraHistoria />} />
                <Route path="/nuestros-socios" element={<NuestrosSocios />} />
                <Route path="/nuestra-junta-directiva" element={<NuestraJuntaDirectiva />} />
                <Route path="/socios-honorarios" element={<CategoryDirectory category="honorary" />} />
                <Route path="/nuestros-gobernadores" element={<CategoryDirectory category="governor" />} />
                <Route path="/nuestros-autores" element={<CategoryDirectory category="author" />} />
                <Route path="/intercambio-jovenes" element={<IntercambioJovenes />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:id" element={<BlogPost />} />
                <Route path="/proyectos" element={<Proyectos />} />
                <Route path="/proyectos/:id" element={<ProyectoDetalle />} />
                <Route path="/contacto" element={<Contacto />} />
                <Route path="/estados-financieros" element={<EstadosFinancieros />} />
                <Route path="/descargas" element={<Descargas />} />
                {/* La galería de la Conferencia Bidistrital. Era la portada forzada de
                    todo sitio de distrito; ahora es una página más, que se enlaza desde
                    el menú configurable del sitio que la necesite. */}
                <Route path="/galeria-multimedia" element={<DistrictMultimediaGallery />} />
                <Route path="/rotaract" element={<Rotaract />} />
                <Route path="/interact" element={<Interact />} />
                <Route path="/rotex" element={<Rotex />} />
                <Route path="/la-fundacion-rotaria" element={<FundacionRotaria />} />
                <Route path="/involucrate" element={<Involucrate />} />
                <Route path="/eventos" element={<Eventos />} />
                <Route path="/eventos/:id" element={<EventoDetalle />} />
                {/* Registro de asistentes al evento (v4.606). El parámetro
                    acepta el id o la dirección amigable del evento. */}
                <Route path="/eventos/:eventRef/registro" element={<RegistroEvento />} />
                {/* Inscripciones completadas (v4.943): el formulario público de
                    completar una inscripción pagada por fuera de la página. La
                    RUTA es la dirección exacta que se publica; el componente
                    deriva el slug de su propia ruta y el SERVIDOR resuelve a
                    qué evento pertenece (settings.completedForm.slug de la
                    edición). Otro evento futuro = configurar su slug en la
                    pestaña «Inscripciones completadas» y declarar acá su
                    <Route> con este MISMO componente. */}
                <Route path="/inscripcion-conferencia-distrital-villavicencio-2027" element={<CompletarInscripcion />} />
                <Route path="/aportes" element={<Aportes />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/order/success" element={<OrderSuccess />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/product/:slug" element={<ProductDetail />} />
                {/* El historial de lanzamientos es interno de la plataforma.
                    Estaba FUERA de `PrivateRoute`, así que cualquiera podía
                    abrirlo escribiendo la dirección: ocultar el enlace no lo
                    protegía. Ahora sólo entra el super administrador de la
                    plataforma. */}
                <Route path="/system-updates" element={<PlatformOnlyRoute><SystemUpdates /></PlatformOnlyRoute>} />

                {/* Generador público de pendones (mesa de trabajo 80×180 cm) */}
                <Route path="/generador-pendones" element={<GeneradorPendones />} />
                <Route path="/plantillas/:slug" element={<PlantillaPublica />} />
                {/* Sin slug la ruta no casaba con nada y, como la aplicación no
                    tiene ruta comodín, la página quedaba EN BLANCO. Se declara
                    para poder explicar que falta el enlace completo. */}
                <Route path="/plantillas" element={<PlantillaPublica />} />
                {/* Generador público de aniversarios (v4.895). Sin sesión, como el
                    generador de pendones: cuatro campos y un botón. La disponibilidad
                    la decide el SERVIDOR mirando lo publicado y el dominio desde el
                    que se pide, no esta ruta. */}
                <Route path="/aniversarios" element={<AniversarioIA />} />
                {/* Herramienta pública de capacitaciones (sin login), como el generador de pendones */}
                <Route path="/agendar-capacitacion" element={<AgendarCapacitacion />} />
                <Route path="/mi-capacitacion/:token" element={<MiCapacitacion />} />

                {/* Postulación de proyectos — Feria de Proyectos Rotary Colombia.
                    Ruta canónica /postular-proyecto; los slugs anteriores redirigen
                    conservando los parámetros (los enlaces de retorno de Stripe ya
                    emitidos apuntan a /feria-proyectos?submission=…&session_id=…). */}
                <Route path="/postular-proyecto" element={<FeriaProyectos />} />
                {/* v4.608 — Panel del club: formulación del proyecto tras el pago. */}
                <Route path="/mi-proyecto" element={<MiProyecto />} />
                {/* Panel del Asistente al Evento (v4.655): consulta su propia
                    inscripción. Identidad y permisos propios, ver
                    server/controllers/eventAttendeeController.js */}
                <Route path="/mi-inscripcion" element={<MiInscripcion />} />
                <Route path="/feria-proyectos" element={<ProjectFormRedirect />} />
                <Route path="/inscribir-proyecto" element={<ProjectFormRedirect />} />

                {/* Registro de la Feria — destino del botón de registro de la
                    cabecera. Publica el panel de inscripción (cuenta regresiva,
                    botón, precios) copiado del de la Conferencia LATIR. */}
                <Route path="/registro-feria" element={<RegistroFeria />} />

                {/* Club preview (provisional URL) */}
                <Route path="/preview/:subdomain" element={<ClubPreview />} />

                {/* Onboarding (full-screen, no AdminLayout) */}
                <Route
                  path="/admin/onboarding"
                  element={<OnboardingGate />}
                />

                {/* Admin Routes */}
                <Route
                  path="/admin/dashboard"
                  element={
                    <PrivateRoute>
                      <Dashboard />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/configuracion-sitio"
                  element={
                    <PrivateRoute>
                      <ClubSettings />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/traducciones"
                  element={
                    <PrivateRoute>
                      <Translations />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/seo"
                  element={
                    <PrivateRoute>
                      <SeoIntelligence />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/analytics"
                  element={
                    <PrivateRoute>
                      <AnalyticsPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/content-studio"
                  element={
                    <PrivateRoute>
                      <ContentStudio />
                    </PrivateRoute>
                  }
                />
                {/* Aniversarios IA. `PlatformOnlyRoute` y no `PrivateRoute`: la
                    configuración gobierna piezas que salen firmadas por clubes de
                    todo el ecosistema, así que es del operador de la plataforma. El
                    servidor lo comprueba igual — esconder una ruta no protege un
                    endpoint de quien lo conoce. */}
                <Route
                  path="/admin/aniversarios-ia"
                  element={
                    <PlatformOnlyRoute>
                      <AnniversaryStudio />
                    </PlatformOnlyRoute>
                  }
                />
                <Route
                  path="/admin/distritos"
                  element={
                    <PrivateRoute>
                      <DistrictsManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/clubes"
                  element={
                    <PrivateRoute>
                      <ClubsManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/asociaciones"
                  element={
                    <PrivateRoute>
                      <AsociacionesManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/zonas"
                  element={
                    <PrivateRoute>
                      <ZonasManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/eventos-convenciones"
                  element={
                    <PrivateRoute>
                      <EventosManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/ferias-proyectos"
                  element={
                    <PrivateRoute>
                      <FeriasManagement />
                    </PrivateRoute>
                  }
                />
                {/* v4.601 — La configuración de la convocatoria es ahora una pestaña
                    del módulo unificado; la ruta anterior sigue viva y lleva ahí. */}
                <Route
                  path="/admin/feria-proyectos"
                  element={<Navigate to="/admin/postulaciones-pagos?tab=config" replace />}
                />
                <Route
                  path="/admin/postulaciones-pagos"
                  element={
                    <PrivateRoute>
                      <PostulacionesPagos />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/programas-intercambio"
                  element={
                    <PrivateRoute>
                      <ProgramasManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/email-marketing"
                  element={
                    <PrivateRoute>
                      <EmailMarketing />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/configuracion"
                  element={
                    <PrivateRoute>
                      <ClubSettings />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/noticias"
                  element={
                    <PrivateRoute>
                      <NewsManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/publicaciones"
                  element={
                    <PrivateRoute>
                      <Publicaciones />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/proyectos"
                  element={
                    <PrivateRoute>
                      <ProjectsManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/usuarios"
                  element={
                    <PrivateRoute>
                      <UsersManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/tienda"
                  element={
                    <PrivateRoute>
                      <StoreManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/ordenes"
                  element={
                    <PrivateRoute>
                      <OrdersManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/bloques-pago"
                  element={
                    <PrivateRoute>
                      <PaymentBlocksManager />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/maneras-de-contribuir"
                  element={
                    <PrivateRoute>
                      <ManerasContribuirEditor />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/campanas-contribucion"
                  element={
                    <PrivateRoute>
                      <ContributionCampaigns />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/slider-global"
                  element={
                    <PrivateRoute>
                      <SpotlightSlides />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/notificaciones-aportes"
                  element={
                    <PrivateRoute>
                      <ContributionNotifications />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/boveda"
                  element={
                    <PrivateRoute>
                      <WalletManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/mi-club"
                  element={
                    <PrivateRoute>
                      <ClubSettings />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/notificaciones"
                  element={
                    <PrivateRoute>
                      <NotificationSettings />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/crm"
                  element={
                    <PrivateRoute>
                      <CRMManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/media"
                  element={
                    <PrivateRoute>
                      <MediaLibrary />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/miembros"
                  element={
                    <PrivateRoute>
                      <MembersPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/usuarios-permisos"
                  element={
                    <PrivateRoute>
                      <UsersAndRoles />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/rotaract"
                  element={
                    <PrivateRoute>
                      <RotaractPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/interact"
                  element={
                    <PrivateRoute>
                      <InteractPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/estados-financieros"
                  element={
                    <PrivateRoute>
                      <FinancialPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/descargas"
                  element={
                    <PrivateRoute>
                      <DownloadsManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/intercambios-jovenes"
                  element={
                    <PrivateRoute>
                      <YouthExchangePage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/ngse"
                  element={
                    <PrivateRoute>
                      <NGSEPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/rotex"
                  element={
                    <PrivateRoute>
                      <RotexPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/calendario"
                  element={
                    <PrivateRoute>
                      <ContentCalendar />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/eventos"
                  element={
                    <PrivateRoute>
                      <EventsManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/agenda-soporte"
                  element={
                    <PrivateRoute>
                      <AgendaSoporte />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/capacitaciones"
                  element={
                    <PrivateRoute>
                      <CapacitacionesAdmin />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/conocimiento"
                  element={
                    <PrivateRoute>
                      <KnowledgeBase />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/asistente-ia"
                  element={
                    <PrivateRoute>
                      <AIAssistant />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/inteligencia"
                  element={
                    <PrivateRoute>
                      <AICore />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/asistencia"
                  element={
                    <PrivateRoute>
                      <SuperAssistantChat />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/integraciones"
                  element={
                    <PrivateRoute>
                      <Integrations />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/leads"
                  element={
                    <PrivateRoute>
                      <LeadsManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/email"
                  element={
                    <PrivateRoute>
                      <EmailManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/perfil"
                  element={
                    <PrivateRoute>
                      <Perfil />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/faqs"
                  element={
                    <PrivateRoute>
                      <FAQManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/agentes"
                  element={
                    <PrivateRoute>
                      <AgentsManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/mission-control-vip"
                  element={
                    <PrivateRoute>
                      <MissionControlVIP />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/whatsapp-qr"
                  element={
                    <PrivateRoute>
                      <WhatsAppQR />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/system-updates"
                  element={<Navigate to="/system-updates" replace />}
                />
                <Route
                  path="/admin/imagenes-sitio"
                  element={
                    <PrivateRoute>
                      <ImageDistribution />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/sistema-footer"
                  element={
                    <PrivateRoute>
                      <FooterSystem />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/social-hub"
                  element={
                    <PrivateRoute>
                      <SocialHub />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/technical-requests"
                  element={
                    <PrivateRoute>
                      <TechnicalRequests />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/district-iq"
                  element={
                    <PrivateRoute>
                      <DistrictIQ />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/inversion"
                  element={
                    <PrivateRoute>
                      <CrowdfundWallet />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/informes-ejecutivos"
                  element={
                    <PrivateRoute>
                      <ClubPlatformInsights />
                    </PrivateRoute>
                  }
                />
                <Route path="/informe/:token" element={<SharedReport />} />
              </Routes>
              </Suspense>
              </ConstructionGate>
              </ChunkErrorBoundary>
            </Router>
            <ChatBot />
            <Toaster position="top-right" richColors />
            <div dangerouslySetInnerHTML={{__html: '<style>#sonner-toaster { z-index: 999999 !important; }</style>'}} />
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </ClubProvider>
  );
}

export default App;
