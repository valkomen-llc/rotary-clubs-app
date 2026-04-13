import React, { useEffect, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
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
import QuienesSomos from './pages/QuienesSomos';
import NuestraHistoria from './pages/NuestraHistoria';
import NuestrosSocios from './pages/NuestrosSocios';
import NuestraJuntaDirectiva from './pages/NuestraJuntaDirectiva';
import IntercambioJovenes from './pages/IntercambioJovenes';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Proyectos from './pages/Proyectos';
import ProyectoDetalle from './pages/ProyectoDetalle';
import Contacto from './pages/Contacto';
import EstadosFinancieros from './pages/EstadosFinancieros';
import Descargas from './pages/Descargas';
import NuestrasCausas from './pages/NuestrasCausas';
import ManerasDeContribuir from './pages/ManerasDeContribuir';
import Rotaract from './pages/Rotaract';
import Interact from './pages/Interact';
import Rotex from './pages/Rotex';
import FundacionRotaria from './pages/FundacionRotaria';
import Involucrate from './pages/Involucrate';
import Eventos from './pages/Eventos';
import Aportes from './pages/Aportes';
import Checkout from './pages/Checkout';
import OrderSuccess from './pages/OrderSuccess';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import DistrictMultimediaGallery from './pages/DistrictMultimediaGallery';

import { AuthProvider, useAuth } from './hooks/useAuth';
import { ClubProvider, useClub } from './contexts/ClubContext';
import { CartProvider } from './contexts/CartContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { Toaster } from './components/ui/sonner';

// ═══════════════════════════════════════════════════════════════
// LAZY-LOADED ADMIN ROUTES — Web Performance Optimization Agent
// Only downloaded when the user navigates to /admin/*
// ═══════════════════════════════════════════════════════════════
const Dashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const ClubsManagement = React.lazy(() => import('./pages/admin/Clubs'));
const AsociacionesManagement = React.lazy(() => import('./pages/admin/Asociaciones'));
const DistrictsManagement = React.lazy(() => import('./pages/admin/Districts'));
const ClubSettings = React.lazy(() => import('./pages/admin/ClubSettings'));
const NewsManagement = React.lazy(() => import('./pages/admin/News'));
const ProjectsManagement = React.lazy(() => import('./pages/admin/Projects'));
const UsersManagement = React.lazy(() => import('./pages/admin/Users'));
const StoreManagement = React.lazy(() => import('./pages/admin/StoreManagement'));
const OrdersManagement = React.lazy(() => import('./pages/admin/OrdersManagement'));
const WalletManagement = React.lazy(() => import('./pages/admin/WalletManagement'));
const NotificationSettings = React.lazy(() => import('./pages/admin/NotificationSettings'));
const CRMManagement = React.lazy(() => import('./pages/admin/CRM'));
const ClubProfile = React.lazy(() => import('./pages/admin/ClubProfile'));
const AIAssistant = React.lazy(() => import('./pages/admin/AIAssistant'));
const MediaLibrary = React.lazy(() => import('./pages/admin/MediaLibrary'));
const ContentCalendar = React.lazy(() => import('./pages/admin/ContentCalendar'));
const KnowledgeBase = React.lazy(() => import('./pages/admin/KnowledgeBase'));
const Integrations = React.lazy(() => import('./pages/admin/Integrations'));
const AnalyticsPage = React.lazy(() => import('./pages/admin/Analytics'));
const SiteSetupPage = React.lazy(() => import('./pages/admin/SiteSetup'));
const LeadsManagement = React.lazy(() => import('./pages/admin/Leads'));
const FAQManagement = React.lazy(() => import('./pages/admin/FAQs'));
const AgentsManagement = React.lazy(() => import('./pages/admin/Agents'));
const MissionControlVIP = React.lazy(() => import('./pages/admin/MissionControlVIP'));
const SystemUpdates = React.lazy(() => import('./pages/admin/SystemUpdates'));
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
const WhatsAppQR = React.lazy(() => import('./pages/admin/WhatsAppQR'));
const SuperAssistantChat = React.lazy(() => import('./pages/admin/SuperAssistantChat'));
import ClubPreview from './pages/ClubPreview';
import ChatBot from './components/ChatBot';
import LandingPage from './pages/LandingPage';
import RegistroPage from './pages/RegistroPage';
import VerifyEmail from './pages/VerifyEmail';
import AppLogin from './pages/AppLogin';
import ComingSoon from './pages/ComingSoon';


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

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  const { club } = useClub();
  if (!isAuthenticated) return <Navigate to="/" />;
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
      return <Navigate to="/admin/dashboard" />;
    }
    return <AppLogin />;
  }
  if (isMainPlatform) return <LandingPage />;
  if (isDraft) return <ComingSoon clubName={club?.name} logo={club?.logo} primaryColor={club?.colors?.primary} />;

  // District Site (e.g. 4271.org) — specialized multimedia gallery
  const currentHostname = window.location.hostname;
  const currentParams = window.location.search;
  if ((club as any)?.type === 'district' || currentHostname.includes('4271') || currentParams.includes('4271')) {
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

  // Association / Network site (LATIR, EMAR, Colrotarios)
  if ((club as any)?.type === 'association') {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main>
          <HeroSection />
          {/* As suggested in the plan: Custom stats, maps/programs, and family CTA instead of traditional Club join section */}
          <StatsSection />
          <JoinSection />
          {(club?.subdomain?.toLowerCase().includes('latir') || club?.name?.toLowerCase().includes('latir')) && <LatirSpecialSection />}
          <SubvencionesSection />
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
        <NewsSection />
      </main>
      <Footer />
    </div>
  );
}

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
              <AnalyticsTracker />
              <SEOTracker />
              <Suspense fallback={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0B1120' }}>
                  <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ width: 40, height: 40, border: '3px solid #1e293b', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ fontSize: 14 }}>Cargando módulo...</p>
                  </div>
                </div>
              }>
              <Routes>
                <Route path="/" element={<SmartHome />} />
                <Route path="/login" element={<AppLogin />} />
                <Route path="/registro" element={<RegistroPage />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/quienes-somos" element={<QuienesSomos />} />
                <Route path="/nuestras-causas" element={<NuestrasCausas />} />
                <Route path="/maneras-de-contribuir" element={<ManerasDeContribuir />} />
                <Route path="/nuestra-historia" element={<NuestraHistoria />} />
                <Route path="/nuestros-socios" element={<NuestrosSocios />} />
                <Route path="/nuestra-junta-directiva" element={<NuestraJuntaDirectiva />} />
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
                <Route path="/aportes" element={<Aportes />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/order/success" element={<OrderSuccess />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/product/:slug" element={<ProductDetail />} />

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
                      <SiteSetupPage />
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
                      <ClubProfile />
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
                  element={
                    <PrivateRoute>
                      <SystemUpdates />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/admin/imagenes-sitio"
                  element={
                    <PrivateRoute>
                      <ImageDistribution />
                    </PrivateRoute>
                  }
                />
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
