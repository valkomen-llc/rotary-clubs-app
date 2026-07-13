import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { Heart, Globe2, ShieldCheck } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';
import PaymentBlocksCarousel from '../components/PaymentBlocksCarousel';
import { resolvePaymentBlocks } from '../lib/paymentBlocks';

export default function Aportes() {
    const { club } = useClub();
    const blocks = resolvePaymentBlocks((club as any)?.paymentBlocks).filter(b => b.enabled);

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <Navbar />

            <main className="pt-32 pb-24 overflow-x-clip">
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">

                    {/* Header */}
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rotary-blue/10 text-rotary-blue text-sm font-bold mb-6">
                            <Heart className="w-4 h-4" />
                            <span>Donaciones y Pagos</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-6">
                            Aportes
                        </h1>
                        <p className="text-lg md:text-xl text-gray-500 font-medium leading-relaxed">
                            Apoya nuestras causas y fortalece el impacto del club en la comunidad. Tu contribución hace la diferencia.
                        </p>
                    </div>

                    {blocks.length === 0 ? (
                        <div className="text-center text-gray-400 italic py-16">
                            Pronto habilitaremos las opciones de aporte.
                        </div>
                    ) : (
                        <PaymentBlocksCarousel blocks={blocks} />
                    )}

                    {/* Trust indicators */}
                    <div className="mt-20 pt-10 border-t border-gray-100 flex flex-col md:flex-row items-center justify-center gap-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="w-5 h-5" />
                            <span className="text-sm font-bold">Pagos 100% Seguros</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Globe2 className="w-5 h-5" />
                            <span className="text-sm font-bold">Respaldo Internacional</span>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
