import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { Heart, Eye } from 'lucide-react';
import { useCMSContent } from '../hooks/useCMSContent';
import { useSiteImages } from '../hooks/useSiteImages';
import { useClub } from '../contexts/ClubContext';
import FoundationImpactSection from '../sections/FoundationImpactSection';
import PaymentBlocksCarousel from '../components/PaymentBlocksCarousel';
import { resolvePaymentBlocks } from '../lib/paymentBlocks';
import DonationModal from '../components/DonationModal';
import CampaignLanding, { type CampaignData } from '../components/campaign/CampaignLanding';

// ════════════════════════════════════════════════════════════════════
// Maneras de Contribuir — v4.804
//
// La página tiene DOS modos y el fallback es el rollout:
// - CON campaña activa (Campañas de Contribución, targeting del Administrador
//   Central): se pinta la landing de campaña.
// - SIN campaña — que es el estado de casi todos los sitios casi siempre —:
//   la página genérica de siempre, idéntica a como era antes del módulo.
//
// La consulta de la campaña DEGRADA: cualquier fallo pinta la página
// genérica. Y el modal de donación es ahora el componente compartido
// DonationModal, que rotula la MONEDA REAL del club (hasta v4.803 decía
// «USD» mientras el servidor cobraba COP en clubes colombianos).
//
// La vista previa del operador llega por ?campaignPreview=<id>&t=<token>
// (token HMAC de una hora): renderiza el BORRADOR con una franja que lo dice,
// sin publicar nada.
// ════════════════════════════════════════════════════════════════════

const API_BASE = import.meta.env.VITE_API_URL || '/api';

type CampaignState =
    | { kind: 'loading' }
    | { kind: 'none' }
    | { kind: 'campaign'; campaign: CampaignData; preview: boolean };

const ManerasDeContribuir = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('contribucion', club.id);
    const siteImages = useSiteImages();
    const [searchParams] = useSearchParams();

    const [campaignState, setCampaignState] = useState<CampaignState>({ kind: 'loading' });
    const [isModalOpen, setIsModalOpen] = useState(false);

    const previewId = searchParams.get('campaignPreview');
    const previewToken = searchParams.get('t');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const url = previewId && previewToken
                    ? `${API_BASE}/contribution-campaigns/${encodeURIComponent(previewId)}/preview?t=${encodeURIComponent(previewToken)}`
                    : `${API_BASE}/contribution-campaigns/active?clubId=${encodeURIComponent(club.id || '')}`;
                const res = await fetch(url);
                const data = res.ok ? await res.json() : null;
                if (cancelled) return;
                if (data?.campaign) {
                    setCampaignState({ kind: 'campaign', campaign: data.campaign, preview: !!data.preview });
                } else {
                    setCampaignState({ kind: 'none' });
                }
            } catch {
                // Un fallo consultando la campaña no puede dejar la página en
                // blanco: se pinta la genérica, que es el estado seguro.
                if (!cancelled) setCampaignState({ kind: 'none' });
            }
        })();
        return () => { cancelled = true; };
    }, [club.id, previewId, previewToken]);

    // ── Página genérica (el fallback: idéntica a la de siempre) ──
    const blocks = resolvePaymentBlocks((club as any)?.paymentBlocks).filter(b => b.enabled);
    const blocksBg = sections['style']?.blocksBg || '#212C3F';

    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    };

    // ── Modo campaña ──
    if (campaignState.kind === 'campaign') {
        const camp = campaignState.campaign;
        const card = camp.content?.donateCard || {};
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                {campaignState.preview && (
                    <div className="bg-amber-500 text-white text-center text-sm font-bold py-2 px-4 flex items-center justify-center gap-2">
                        <Eye className="w-4 h-4" /> Vista previa de la campaña — así se verá publicada. Nada de esto está publicado todavía.
                    </div>
                )}
                <CampaignLanding campaign={camp} onDonate={() => setIsModalOpen(true)}
                    clubId={club.id} preview={campaignState.preview} />
                <DonationModal
                    open={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    clubId={club.id}
                    clubName={club.name}
                    currency={(club as any)?.currency}
                    campaignId={campaignState.preview ? null : camp.id}
                    title={card.title || undefined}
                    subtitle={card.description || undefined}
                    accentColor={camp.content?.theme?.cta || camp.content?.theme?.primary || undefined}
                />
                <Footer />
            </div>
        );
    }

    // ── Mientras se resuelve: el esqueleto mínimo, sin adelantar un modo ──
    if (campaignState.kind === 'loading') {
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                <section className="py-32 bg-rotary-concrete">
                    <div className="max-w-4xl mx-auto px-4">
                        <div className="h-12 bg-gray-200/60 rounded-xl max-w-lg mx-auto animate-pulse" />
                        <div className="h-4 bg-gray-200/60 rounded-lg max-w-2xl mx-auto mt-6 animate-pulse" />
                    </div>
                </section>
                <Footer />
            </div>
        );
    }

    // ── Página genérica ──
    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Top Section */}
            <section className="py-32 bg-rotary-concrete">
                <div className="max-w-4xl mx-auto px-4 text-center">
                    <h1 className="text-4xl md:text-6xl font-light text-gray-800 mb-8">
                        {getC('header', 'title', "Maneras de contribuir")}
                    </h1>
                    <p className="text-gray-600 text-lg md:text-xl leading-relaxed max-w-3xl mx-auto">
                        {getC('header', 'description', "Una contribución a Rotary significa agua potable y saneamiento, salud y esperanza en zonas asoladas por enfermedades.")}
                    </p>
                </div>
            </section>

            {/* Hero Section with Donation Card */}
            <section className="relative w-full h-[500px] md:h-[600px] overflow-hidden flex items-center">
                <div className="absolute inset-0">
                    <img
                        src={siteImages.donateHero?.url || getC('hero', 'image', "/defaults/hero/1-teamwork.png")}
                        alt={siteImages.donateHero?.alt || "Maneras de contribuir"}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-white/10" />
                </div>

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex justify-center lg:justify-end">
                    <div className="bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-10 max-w-md w-full border border-gray-50/50 mr-0 lg:mr-8 transform hover:-translate-y-1 transition-transform duration-300">
                        <h2 className="text-[26px] font-normal text-gray-800 text-center mb-6 leading-tight">
                            {getC('card', 'title', "Aporte voluntario al Club")}
                        </h2>
                        <p className="text-gray-600 text-[15px] text-center mb-10 leading-relaxed px-2">
                            {getC('card', 'description', `Tu contribución fortalece el impacto del club ${club.name} y sostiene iniciativas de servicio que transforman vidas.`)}
                        </p>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="w-full bg-[#9D2235] hover:bg-[#8B1E2F] text-white font-bold py-[18px] rounded-lg flex items-center justify-center gap-3 transition-colors uppercase tracking-widest text-[13px]"
                        >
                            <Heart className="w-5 h-5 fill-current" />
                            {getC('card', 'buttonText', "APORTAR")}
                        </button>
                    </div>
                </div>
            </section>

            {/* Formas de aportar — carrusel de bloques (Donación / Aporte / Membresía) */}
            {blocks.length > 0 && (
                <section className="py-20 md:py-24 overflow-x-clip" style={{ backgroundColor: blocksBg }}>
                    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
                        <PaymentBlocksCarousel blocks={blocks} />
                    </div>
                </section>
            )}

            <DonationModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                clubId={club.id}
                clubName={club.name}
                currency={(club as any)?.currency}
            />

            {/* Foundation Impact Metrics Section */}
            <FoundationImpactSection />

            <Footer />
        </div>
    );
};

export default ManerasDeContribuir;
