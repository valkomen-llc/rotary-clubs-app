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

                    <h1 className="text-4xl font-black text-gray-900 tracking-tight mb-4">
                        {location.state?.paymentMethod === 'manual' ? '¡Pedido Registrado con Éxito!' : '¡Gracias por tu compra y apoyo!'}
                    </h1>

                    <p className="text-lg text-gray-500 mb-6 max-w-lg mx-auto leading-relaxed">
                        {location.state?.paymentMethod === 'manual'
                            ? 'Hemos reservado tus productos. Por favor realiza la transferencia a la cuenta oficial del club para que podamos despachar tu pedido.'
                            : 'Tu pago se ha procesado con éxito. Hemos enviado un recibo y los detalles de tu compra a '}
                        <span className="font-bold text-gray-900">{email || 'tu correo electrónico'}</span>.
                    </p>

                    {location.state?.instructions && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900 text-sm mb-8 text-left">
                            <h4 className="font-bold text-base mb-2">Instrucciones de Pago por Transferencia:</h4>
                            <p className="whitespace-pre-line leading-relaxed">{location.state.instructions}</p>
                            <p className="text-xs text-amber-700 mt-3 font-bold">
                                Recuerda incluir tu referencia #{location.state.orderNumber || location.state.orderId?.slice(-6).toUpperCase()} en el comprobante.
                            </p>
                        </div>
                    )}

                    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex flex-col sm:flex-row gap-4 justify-center items-center mb-10">
                        <Link
                            to="/mi-cuenta/pedidos"
                            className="flex items-center gap-2 text-rotary-blue font-bold text-sm bg-white px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-sky-50 hover:border-rotary-blue transition-all shadow-sm"
                        >
                            Ver en Mis Pedidos
                        </Link>
                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-2 text-gray-700 font-bold text-sm bg-white px-5 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all shadow-sm"
                        >
                            <Download className="w-4 h-4" />
                            Imprimir Comprobante
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            to="/tienda"
                            className="w-full sm:w-auto px-8 py-4 bg-rotary-blue text-white rounded-xl font-bold hover:bg-sky-800 transition-all flex items-center justify-center gap-2 group"
                        >
                            Seguir en la Tienda
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
                        Número de Pedido:{' '}
                        <span className="text-gray-900 font-mono font-bold tracking-wider ml-2">
                            #{location.state?.orderNumber || location.state?.orderId?.slice(-6).toUpperCase() || 'REF-ROTARY'}
                        </span>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
