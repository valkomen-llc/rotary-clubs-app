import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ClubContext } from '../contexts/ClubContext';
import { Loader2, Eye, ExternalLink } from 'lucide-react';

// Public site sections
import Navbar from '../sections/Navbar';
import HeroSection from '../sections/HeroSection';
import ActionSection from '../sections/ActionSection';
import StatsSection from '../sections/StatsSection';
import JoinSection from '../sections/JoinSection';
import FoundationSection from '../sections/FoundationSection';
import CausesHexSection from '../sections/CausesHexSection';
import NewsSection from '../sections/NewsSection';
import Footer from '../sections/Footer';
import ServiciosSection from '../sections/ServiciosSection';
import DistritosSection from '../sections/DistritosSection';
import SubvencionesSection from '../sections/SubvencionesSection';

const API = import.meta.env.VITE_API_URL || '/api';

// Error boundary to catch section render errors
class SectionErrorBoundary extends React.Component<
    { name: string; children: React.ReactNode },
    { hasError: boolean }
> {
    state = { hasError: false };
    static getDerivedStateFromError() { return { hasError: true }; }
    componentDidCatch(err: any) { console.error(`Section [${this.props.name}] crashed:`, err); }
    render() {
        if (this.state.hasError) return null; // silently skip broken sections
        return this.props.children;
    }
}

/**
 * ClubPreview – renders the public site of a club resolved by subdomain param.
 * URL: app.clubplatform.org/#/preview/:subdomain
 * 
 * It creates its own ClubContext.Provider that overrides the parent context
 * so every child section (Navbar, Hero, etc.) reads the preview club.
 */
const ClubPreview: React.FC = () => {
    const { subdomain } = useParams<{ subdomain: string }>();
    const [club, setClub] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!subdomain) return;
        setLoading(true);
        setError('');
        fetch(`${API}/clubs/by-domain?domain=${subdomain}&preview=true`)
            .then(r => {
                if (!r.ok) throw new Error('Club no encontrado');
                return r.json();
            })
            .then(data => {
                setClub(data);
                document.title = `Vista previa — ${data.name}`;
            })
            .catch(() => setError('No se encontró un club con ese identificador.'))
            .finally(() => setLoading(false));
    }, [subdomain]);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                <p className="text-sm text-gray-400 font-bold">Cargando vista previa...</p>
            </div>
        );
    }

    if (error || !club) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
                <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center mb-6">
                    <Eye className="w-10 h-10 text-red-400" />
                </div>
                <h1 className="text-2xl font-black text-gray-900 mb-2">Club no encontrado</h1>
                <p className="text-sm text-gray-500 max-w-md">
                    {error || 'No pudimos cargar la vista previa de este club. Verifica que el identificador sea correcto.'}
                </p>
                <p className="text-xs text-gray-400 mt-4">
                    Identificador solicitado: <strong>{subdomain}</strong>
                </p>
            </div>
        );
    }

    // Override the parent ClubContext with the preview club data
    const contextValue = {
        club,
        isLoading: false,
        isMainPlatform: false,
        isAppPortal: false,
        isDraft: false,
    };

    return (
        <ClubContext.Provider value={contextValue}>
            {/* Preview Banner */}
            <div className="sticky top-0 z-[9999] bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm shadow-lg">
                <Eye className="w-4 h-4 flex-shrink-0" />
                <span className="font-bold">Vista previa</span>
                <span className="hidden sm:inline text-white/70">— {club.name}</span>
                {club.domain && (
                    <a
                        href={`https://${club.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                    >
                        Sitio público <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>

            {/* Public site */}
            <div className="min-h-screen bg-white">
                <SectionErrorBoundary name="Navbar"><Navbar /></SectionErrorBoundary>
                <main>
                    <SectionErrorBoundary name="Hero"><HeroSection /></SectionErrorBoundary>
                    {club.type === 'foundation' ? (
                        <>
                            <SectionErrorBoundary name="Stats"><StatsSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="Servicios"><ServiciosSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="Distritos"><DistritosSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="Subvenciones"><SubvencionesSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="News"><NewsSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="Join"><JoinSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="Causes"><CausesHexSection /></SectionErrorBoundary>
                        </>
                    ) : (
                        <>
                            <SectionErrorBoundary name="Action"><ActionSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="Stats"><StatsSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="Join"><JoinSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="Foundation"><FoundationSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="Causes"><CausesHexSection /></SectionErrorBoundary>
                            <SectionErrorBoundary name="News"><NewsSection /></SectionErrorBoundary>
                        </>
                    )}
                </main>
                <SectionErrorBoundary name="Footer"><Footer /></SectionErrorBoundary>
            </div>
        </ClubContext.Provider>
    );
};

export default ClubPreview;
