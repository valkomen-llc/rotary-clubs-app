import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { CheckCircle2, Download, Share2, ArrowRight } from 'lucide-react';
// import { useClub } from '../contexts/ClubContext';
import confetti from 'canvas-confetti';

export default function OrderSuccess() {
    // const { club } = useClub();
    const location = useLocation();
    // const navigate = useNavigate();
    const [email, setEmail] = useState('');

    useEffect(() => {
        // Trigger confetti
        var duration = 3 * 1000;
        var end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#0c3c7c', '#F5A623', '#ffffff']
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#0c3c7c', '#F5A623', '#ffffff']
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());

        if (location.state?.customerEmail) {
            setEmail(location.state.customerEmail);
        }
    }, [location]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />
            <main className="flex-1 flex items-center justify-center p-6">
                <div className="bg-white rounded-3xl p-10 md:p-14 shadow-2xl shadow-rotary-blue/5 border border-gray-100 max-w-2xl w-full text-center relative overflow-hidden">
                    {/* Decorative Header */}
                    <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-rotary-blue via-sky-500 to-rotary-gold" />

                    <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-8 border-4 border-white shadow-xl">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                    </div>

                    <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-4">¡Gracias por tu apoyo!</h1>

                    <p className="text-lg text-gray-500 mb-8 max-w-lg mx-auto leading-relaxed">
                        Tu pago y/o donación se ha realizado con éxito. Hemos enviado un recibo y los detalles
                        de tu contribución a <span className="font-bold text-gray-900">{email || 'tu correo electrónico'}</span>.
                    </p>

                    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex flex-col sm:flex-row gap-4 justify-center items-center mb-10">
                        <button className="flex items-center gap-2 text-rotary-blue font-bold text-sm bg-white px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-sky-50 hover:border-rotary-blue transition-all shadow-sm">
                            <Download className="w-4 h-4" />
                            Descargar Recibo
                        </button>
                        <button className="flex items-center gap-2 text-rotary-blue font-bold text-sm bg-white px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-sky-50 hover:border-rotary-blue transition-all shadow-sm">
                            <Share2 className="w-4 h-4" />
                            Compartir Impacto
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            to="/proyectos"
                            className="w-full sm:w-auto px-8 py-4 bg-rotary-blue text-white rounded-xl font-bold hover:bg-sky-800 transition-all flex items-center justify-center gap-2 group"
                        >
                            Ver Próximos Proyectos
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <Link
                            to="/"
                            className="w-full sm:w-auto px-8 py-4 bg-white text-gray-700 border border-gray-200 rounded-xl font-bold hover:bg-gray-50 transition-all"
                        >
                            Volver al Inicio
                        </Link>
                    </div>

                    <div className="mt-12 pt-8 border-t border-gray-100 text-sm text-gray-400 font-medium">
                        Identificador de Transacción:{' '}
                        <span className="text-gray-900 font-mono tracking-wider ml-2">
                            {Math.random().toString(36).substring(2, 10).toUpperCase()}
                        </span>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
