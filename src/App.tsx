import React, { useEffect, Suspense } from 'react';
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
const QuienesSomos = React.lazy(() => import('./pages/QuienesSomos'));
const NuestraHistoria = React.lazy(() => import('./pages/NuestraHistoria'));
const NuestrosSocios = React.lazy(() => import('./pages/NuestrosSocios'));
const NuestraJuntaDirectiva = React.lazy(() => import('./pages/NuestraJuntaDirectiva'));
const CategoryDirectory = React.lazy(() => import('./pages/CategoryDirectory'));
const IntercambioJovenes = React.lazy(() => import('./pages/IntercambioJovenes'));
const Blog = React.lazy(() => import('./pages/Blog'));
const BlogPost = React.lazy(() => import('./pages/BlogPost'));
const Proyectos = React.lazy(() => import('./pages/Proyectos'));
const ProyectoDetalle = React.lazy(() => import('./pages/ProyectoDetalle'));
const Contacto = React.lazy(() => import('./pages/Contacto'));
const EstadosFinancieros = React.lazy(() => import('./pages/EstadosFinancieros'));
const Descargas = React.lazy(() => import('./pages/Descargas'));
const NuestrasCausas = React.lazy(() => import('./pages/NuestrasCausas'));
const ManerasDeContribuir = React.lazy(() => import('./pages/ManerasDeContribuir'));
const DonacionExito = React.lazy(() => import('./pages/DonacionExito'));
const DonacionCancelada = React.lazy(() => import('./pages/DonacionCancelada'));
const Rotaract = React.lazy(() => import('./pages/Rotaract'));
const Interact = React.lazy(() => import('./pages/Interact'));
const Rotex = React.lazy(() => import('./pages/Rotex'));
const FundacionRotaria = React.lazy(() => import('./pages/FundacionRotaria'));
const Involucrate = React.lazy(() => import('./pages/Involucrate'));
const Eventos = React.lazy(() => import('./pages/Eventos'));
const EventoDetalle = React.lazy(() => import('./pages/EventoDetalle'));
const Aportes = React.lazy(() => import('./pages/Aportes'));
const Checkout = React.lazy(() => import('./pages/Checkout'));
const OrderSuccess = React.lazy(() => import('./pages/OrderSuccess'));
const Shop = React.lazy(() => import('./pages/Shop'));
const ProductDetail = React.lazy(() => import('./pages/ProductDetail'));
const DistrictMultimediaGallery = React.lazy(() => import('./pages/DistrictMultimediaGallery'));
const ClubPreview = React.lazy(() => import('./pages/ClubPreview'));
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const RegistroPage = React.lazy(() => import('./pages/RegistroPage'));
const VerifyEmail = React.lazy(() => import('./pages/VerifyEmail'));
const AppLogin = React.lazy(() => import('./pages/AppLogin'));
const ComingSoon = React.lazy(() => import('./pages/ComingSoon'));

const GeneradorPendones = React.lazy(() => import('./pages/GeneradorPendones'));
// v4.721 — Portal público de Plantillas IA. Perezosa como el resto de las
// páginas públicas (regla de rendimiento de v4.659).
const PlantillaPublica = React.lazy(() => import('./pages/PlantillaPublica'));
const FeriaProyectos = React.lazy(() => import('./pages/FeriaProyectos'));
const MiProyecto = React.lazy(() => import('./pages/MiProyecto'));
const MiInscripcion = React.lazy(() => import('./pages/MiInscripcion'));
const RegistroFeria = React.lazy(() => import('./pages/RegistroFeria'));
const RegistroEvento = React.lazy(() => import('./pages/RegistroEvento'));
const Dashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const ClubsManagement = React.lazy(() => import('./pages/admin/Clubs'));
const AsociacionesManagement = React.lazy(() => import('./pages/admin/Asociaciones'));
const ZonasManagement = React.lazy(() => import('./pages/admin/Zonas'));
const EventosManagement = React.lazy(() => import('./pages/admin/Eventos'));
const FeriasManagement = React.lazy(() => import('./pages/admin/Ferias'));
const PostulacionesPagos = React.lazy(() => import('./pages/admin/PostulacionesPagos'));
const ProgramasManagement = React.lazy(() => import('./pages/admin/Programas'));
const DistrictsManagement = React.lazy(() => import('./pages/admin/Districts'));
const ClubSettings = React.lazy(() => import('./pages/admin/ClubSettings'));
const NewsManagement = React.lazy(() => import('./pages/admin/News'));
const Publicaciones = React.lazy(() => import('./pages/admin/Publicaciones'));
const ProjectsManagement = React.lazy(() => import('./pages/admin/Projects'));
const UsersManagement = React.lazy(() => import('./pages/admin/Users'));
const StoreManagement = React.lazy(() => import('./pages/admin/StoreManagement'));
const PaymentBlocksManager = React.lazy(() => import('./pages/admin/PaymentBlocksManager'));
const ManerasContribuirEditor = React.lazy(() => import('./pages/admin/ManerasContribuirEditor'));
const OrdersManagement = React.lazy(() => import('./pages/admin/OrdersManagement'));
const WalletManagement = React.lazy(() => import('./pages/admin/WalletManagement'));
const NotificationSettings = React.lazy(() => import('./pages/admin/NotificationSettings'));
const CRMManagement = React.lazy(() => import('./pages/admin/CRM'));
const AIAssistant = React.lazy(() => import('./pages/admin/AIAssistant'));
const MediaLibrary = React.lazy(() => import('./pages/admin/MediaLibrary'));
const ContentCalendar = React.lazy(() => import('./pages/admin/ContentCalendar'));
const KnowledgeBase = React.lazy(() => import('./pages/admin/KnowledgeBase'));
const Integrations = React.lazy(() => import('./pages/admin/Integrations'));
const Translations = React.lazy(() => import('./pages/admin/Translations'));
const SeoIntelligence = React.lazy(() => import('./pages/admin/SeoIntelligence'));
const AnalyticsPage = React.lazy(() => import('./pages/admin/Analytics'));
const LeadsManagement = React.lazy(() => import('./pages/admin/Leads'));
const EmailManagement = React.lazy(() => import('./pages/admin/EmailManagement'));
const EmailMarketing = React.lazy(() => import('./pages/admin/EmailMarketing'));
const FAQManagement = React.lazy(() => import('./pages/admin/FAQs'));
const AgentsManagement = React.lazy(() => import('./pages/admin/Agents'));
const MissionControlVIP = React.lazy(() => import('./pages/admin/MissionControlVIP'));
const SystemUpdates = React.lazy(() => import('./pages/SystemUpdates'));
const ImageDistribution = React.lazy(() => import('./pages/admin/ImageDistribution'));
const OnboardingFlow = React.lazy(() => import('./pages/admin/OnboardingFlow'));
const MembersPage = React.lazy(() => import('./pages/admin/MembersPage'));
const RotaractPage = React.lazy(() => import('./pages/admin/RotaractPage'));
const InteractPage = React.lazy(() => import('./pages/admin/InteractPage'));
const FinancialPage = React.lazy(() => import('./pages/admin/FinancialPage'));
const DownloadsManagement = React.lazy(() => import('./pages/admin/DownloadsPage'));
const YouthExchangePage = React.lazy(() => import('./pages/admin/YouthExchangePage'));
const NGSEPage = React.lazy(() => import('./pages/admin/NGSEPage'));
const RotexPage = React.lazy(() => import('./pages/admin/RotexPage'));
const EventsManagement = React.lazy(() => import('./pages/admin/Events'));
const WhatsAppQR = React.lazy(() => import('./pages/admin/WhatsAppQR'));
const SuperAssistantChat = React.lazy(() => import('./pages/admin/SuperAssistantChat'));
const ContentStudio = React.lazy(() => import('./pages/admin/ContentStudio'));
const FooterSystem = React.lazy(() => import('./pages/admin/FooterSystem'));
const SocialHub = React.lazy(() => import('./pages/admin/SocialHub'));
const TechnicalRequests = React.lazy(() => import('./pages/admin/TechnicalRequests'));
const DistrictIQ = React.lazy(() => import('./pages/admin/DistrictIQ'));
const CrowdfundWallet = React.lazy(() => import('./pages/admin/CrowdfundWallet'));
const AICore = React.lazy(() => import('./pages/admin/AICore'));
const ClubPlatformInsights = React.lazy(() => import('./pages/admin/ClubPlatformInsights'));
const AgendaSoporte = React.lazy(() => import('./pages/admin/AgendaSoporte'));
const CapacitacionesAdmin = React.lazy(() => import('./pages/admin/CapacitacionesAdmin'));
const AgendarCapacitacion = React.lazy(() => import('./pages/AgendarCapacitacion'));
const MiCapacitacion = React.lazy(() => import('./pages/MiCapacitacion'));
const SharedReport = React.lazy(() => import('./pages/SharedReport'));

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
// AppLogin on app.clubplatform.org, ComingSoon for draft clubs, club site otherwise
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
  if (isDraft) return <ComingSoon clubName={club?.name} logo={club?.logo} primaryColor={club?.colors?.primary} />;

  // District Site (e.g. 4271.org) — specialized multimedia gallery
  const currentHostname = window.location.hostname;
  const currentParams = window.location.search;
  if (((club as any)?.type === 'district' && !club?.subdomain?.startsWith('rye')) || currentHostname.includes('4271') || currentParams.includes('4271')) {
    return <DistrictMultimediaGallery />;
  }

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
        <StatsSection />
        <JoinSection />
        <FoundationSection />
        <CausesHexSection />
        {/* Evento/Convención: el contenedor de noticias se puede desactivar desde la configuración. */}
        {((club as any)?.eventSections?.news !== false) && <NewsSection />}
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
const HIDE_BANNERS_PATHS = ['/generador-pendones', '/agendar-capacitacion', '/mi-capacitacion', '/plantillas'];
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
                <Route path="/registro" element={<RegistroPage />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/quienes-somos" element={<QuienesSomos />} />
                <Route path="/nuestras-causas" element={<NuestrasCausas />} />
                <Route path="/maneras-de-contribuir" element={<ManerasDeContribuir />} />
                <Route path="/donacion/exito" element={<DonacionExito />} />
                <Route path="/donacion/cancelada" element={<DonacionCancelada />} />
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
