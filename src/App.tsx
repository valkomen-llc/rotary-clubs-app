import { HashRouter as Router, Routes, Route } from 'react-router-dom';
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

function Home() {
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

import { AuthProvider, useAuth } from './hooks/useAuth';

import Dashboard from './pages/admin/Dashboard';
import { Navigate } from 'react-router-dom';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/" />;
};

import { ClubProvider } from './contexts/ClubContext';

function App() {
  return (
    <ClubProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
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

            {/* Admin Routes */}
            <Route
              path="/admin/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
          </Routes>
        </Router>
      </AuthProvider>
    </ClubProvider>
  );
}

export default App;
