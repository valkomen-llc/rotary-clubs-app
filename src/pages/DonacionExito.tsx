import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Heart, ArrowLeft, Mail } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface SessionStatus {
    status: string;
    paymentStatus: string;
    amount: number | null;
    currency: string;
    customerEmail?: string;
    customerName?: string;
    donationRecorded: boolean;
}

const DonacionExito = () => {
    const { club } = useClub();
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');
    const [data, setData] = useState<SessionStatus | null>(null);
    const [loading, setLoading] = useState<boolean>(!!sessionId);
    const [error, setError] = useState<string | null>(
        sessionId ? null : 'Falta el identificador de la transacción.'
    );

    useEffect(() => {
        if (!sessionId) return;
        fetch(`${API_BASE}/financial/donate/session/${sessionId}`)
            .then(r => r.json())
            .then((d) => {
                if (d?.error) throw new Error(d.error);
                setData(d);
            })
            .catch((e) => setError(e?.message || 'No pudimos verificar tu donación.'))
            .finally(() => setLoading(false));
    }, [sessionId]);

    const isPaid = data?.paymentStatus === 'paid';

    return (
        <div className="min-h-screen bg-gradient-to-b from-rotary-concrete to-white flex flex-col">
            <Navbar />
            <main className="flex-1 flex items-center justify-center px-4 py-20">
                <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-10 text-center border border-gray-100">
                    {loading && (
                        <>
                            <Loader2 className="w-12 h-12 text-[#9D2235] animate-spin mx-auto mb-4" />
                            <h1 className="text-2xl font-bold text-gray-800 mb-2">Verificando tu donación…</h1>
                            <p className="text-gray-500 text-sm">Estamos confirmando con Stripe.</p>
                        </>
                    )}

                    {!loading && error && (
                        <>
                            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Heart className="w-8 h-8 text-red-400" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-800 mb-3">No pudimos verificar tu donación</h1>
                            <p className="text-gray-600 mb-6">{error}</p>
                            <Link
                                to="/maneras-de-contribuir"
                                className="inline-flex items-center gap-2 text-[#9D2235] hover:underline font-semibold"
                            >
                                <ArrowLeft className="w-4 h-4" /> Volver a Maneras de Contribuir
                            </Link>
                        </>
                    )}

                    {!loading && !error && isPaid && (
                        <>
                            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
                                <CheckCircle2 className="w-12 h-12 text-green-500" />
                            </div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">¡Gracias por tu donación!</h1>
                            <p className="text-gray-600 mb-6">
                                {data?.customerName ? `${data.customerName}, t` : 'T'}u aporte a <strong>{club.name}</strong> fue procesado con éxito.
                            </p>

                            <div className="bg-gradient-to-br from-[#9D2235]/5 to-[#9D2235]/10 rounded-xl p-6 mb-6">
                                <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">Monto donado</div>
                                <div className="text-4xl font-bold text-[#9D2235]">
                                    ${data?.amount?.toFixed(2)} <span className="text-lg font-semibold">{data?.currency}</span>
                                </div>
                            </div>

                            {data?.customerEmail && (
                                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-6">
                                    <Mail className="w-4 h-4" />
                                    Enviamos el recibo a <strong className="text-gray-700 ml-1">{data.customerEmail}</strong>
                                </div>
                            )}

                            <Link
                                to="/"
                                className="inline-flex items-center justify-center gap-2 bg-[#9D2235] hover:bg-[#8B1E2F] text-white font-bold py-3 px-8 rounded-lg transition-colors"
                            >
                                Volver al inicio
                            </Link>
                        </>
                    )}

                    {!loading && !error && !isPaid && (
                        <>
                            <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
                            <h1 className="text-2xl font-bold text-gray-800 mb-2">Procesando tu pago…</h1>
                            <p className="text-gray-500 text-sm mb-6">
                                Stripe todavía está confirmando la transacción. Recibirás el recibo por correo en cuanto se acredite.
                            </p>
                            <Link
                                to="/maneras-de-contribuir"
                                className="inline-flex items-center gap-2 text-[#9D2235] hover:underline font-semibold"
                            >
                                <ArrowLeft className="w-4 h-4" /> Volver
                            </Link>
                        </>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default DonacionExito;
