import React, { useEffect } from 'react';
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
import NuestrasCausas from './pages/NuestrasCausas';
import ManerasDeContribuir from './pages/ManerasDeContribuir';
import Rotaract from './pages/Rotaract';
import Interact from './pages/Interact';
import FundacionRotaria from './pages/FundacionRotaria';
import Eventos from './pages/Eventos';
import Aportes from './pages/Aportes';
import Checkout from './pages/Checkout';
import OrderSuccess from './pages/OrderSuccess';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';

import { AuthProvider, useAuth } from './hooks/useAuth';
import { ClubProvider, useClub } from './contexts/ClubContext';
import { CartProvider } from './contexts/CartContext';
import { LanguageProvider } from './contexts/LanguageContext';

import Dashboard from './pages/admin/Dashboard';
import ClubsManagement from './pages/admin/Clubs';
import ClubSettings from './pages/admin/ClubSettings';
import NewsManagement from './pages/admin/News';
import ProjectsManagement from './pages/admin/Projects';
import UsersManagement from './pages/admin/Users';
import StoreManagement from './pages/admin/StoreManagement';
import OrdersManagement from './pages/admin/OrdersManagement';
import WalletManagement from './pages/admin/WalletManagement';
import NotificationSettings from './pages/admin/NotificationSettings';
import CRMManagement from './pages/admin/CRM';
import ClubProfile from './pages/admin/ClubProfile';
import AIAssistant from './pages/admin/AIAssistant';
import MediaLibrary from './pages/admin/MediaLibrary';
import ContentCalendar from './pages/admin/ContentCalendar';
import KnowledgeBase from './pages/admin/KnowledgeBase';
import Integrations from './pages/admin/Integrations';
import AnalyticsPage from './pages/admin/Analytics';
import ChatBot from './components/ChatBot';
import LandingPage from './pages/LandingPage';
import RegistroPage from './pages/RegistroPage';
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
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/" />;
};

// Smart Home: shows LandingPage on www.clubplatform.org,
// AppLogin on app.clubplatform.org, ComingSoon for draft clubs, club site otherwise
function SmartHome() {
  const { isMainPlatform, isAppPortal, isDraft, club } = useClub();
  const { isAuthenticated } = useAuth();

  if (isAppPortal) {
    // Already authenticated → go straight to dashboard
    if (isAuthenticated) return <Navigate to="/admin/dashboard" />;
    return <AppLogin />;
  }
  if (isMainPlatform) return <LandingPage />;
  if (isDraft) return <ComingSoon clubName={club?.name} logo={club?.logo} primaryColor={club?.colors?.primary} />;

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
              <Routes>
                <Route path="/" element={<SmartHome />} />
                <Route path="/login" element={<AppLogin />} />
                <Route path="/registro" element={<RegistroPage />} />
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
                <Route path="/rotaract" element={<Rotaract />} />
                <Route path="/interact" element={<Interact />} />
                <Route path="/la-fundacion-rotaria" element={<FundacionRotaria />} />
                <Route path="/eventos" element={<Eventos />} />
                <Route path="/aportes" element={<Aportes />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/order/success" element={<OrderSuccess />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/shop/product/:slug" element={<ProductDetail />} />

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
                  path="/admin/analytics"
                  element={
                    <PrivateRoute>
                      <AnalyticsPage />
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
                  path="/admin/integraciones"
                  element={
                    <PrivateRoute>
                      <Integrations />
                    </PrivateRoute>
                  }
                />
              </Routes>
            </Router>
            <ChatBot />
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </ClubProvider>
  );
}

export default App;
