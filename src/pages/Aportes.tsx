import React, { useState } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { Heart, Globe2, Users, DollarSign, ArrowRight, ShieldCheck } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useClub } from '../contexts/ClubContext';

const PRESET_AMOUNTS = [10, 25, 50, 100];

export default function Aportes() {
    const { club } = useClub();
    const { addToCart } = useCart();

    // States for "End Polio Now"
    const [polioAmount, setPolioAmount] = useState<number | ''>(50);
    const [polioCustom, setPolioCustom] = useState<number | ''>('');
    const [polioMemo, setPolioMemo] = useState('');
    const [polioAnon, setPolioAnon] = useState(false);

    // States for "Aporte Voluntario"
    const [clubAmount, setClubAmount] = useState<number | ''>('');
    const [clubMemo, setClubMemo] = useState('');
    const [clubAnon, setClubAnon] = useState(false);

    // States for "Membresía"
    const [membershipAmount, setMembershipAmount] = useState<number | ''>(150);
    const [membershipMemo, setMembershipMemo] = useState('');

    const handlePolioDonate = (e: React.FormEvent) => {
        e.preventDefault();
        const finalAmount = polioCustom ? Number(polioCustom) : Number(polioAmount);
        if (finalAmount < 1) return;

        addToCart({
            type: 'donation',
            title: 'Donación: End Polio Now',
            qty: 1,
            unitPrice: finalAmount,
            metadata: {
                campaign: 'End Polio Now',
                message: polioMemo,
                isAnonymous: polioAnon
            }
        });

        // Reset
        setPolioAmount(50);
        setPolioCustom('');
        setPolioMemo('');
        setPolioAnon(false);
    };

    const handleClubDonate = (e: React.FormEvent) => {
        e.preventDefault();
        const finalAmount = Number(clubAmount);
        if (finalAmount < 1) return;

        addToCart({
            type: 'donation',
            title: `Aporte voluntario: ${club.name}`,
            qty: 1,
            unitPrice: finalAmount,
            metadata: {
                campaign: 'Club General',
                message: clubMemo,
                isAnonymous: clubAnon
            }
        });

        setClubAmount('');
        setClubMemo('');
        setClubAnon(false);
    };

    const handleMembershipPay = (e: React.FormEvent) => {
        e.preventDefault();
        const finalAmount = Number(membershipAmount);
        if (finalAmount < 1) return;

        addToCart({
            type: 'membership',
            title: 'Pago de Cuota / Membresía',
            qty: 1,
            unitPrice: finalAmount,
            metadata: {
                period: 'Mensual',
                notes: membershipMemo
            }
        });

        setMembershipAmount(150);
        setMembershipMemo('');
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <Navbar />

            <main className="pt-32 pb-24">
                <div className="max-w-6xl mx-auto px-6">

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

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* 1. End Polio Now */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all flex flex-col">
                            <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mb-6">
                                <Globe2 className="w-7 h-7" />
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">End Polio Now</h2>
                            <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                                Únete a la campaña histórica de Rotary International para erradicar la polio en todo el mundo.
                            </p>

                            <form onSubmit={handlePolioDonate} className="flex-1 flex flex-col">
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    {PRESET_AMOUNTS.map(amt => (
                                        <button
                                            key={amt}
                                            type="button"
                                            onClick={() => { setPolioAmount(amt); setPolioCustom(''); }}
                                            className={`py-3 rounded-xl border-2 font-black transition-all ${polioAmount === amt && !polioCustom ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue' : 'border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'}`}
                                        >
                                            ${amt}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative mb-6">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <DollarSign className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="Otro monto"
                                        value={polioCustom}
                                        onChange={(e) => {
                                            setPolioCustom(e.target.value ? Number(e.target.value) : '');
                                            setPolioAmount('');
                                        }}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-bold text-gray-900"
                                    />
                                </div>

                                <input
                                    type="text"
                                    placeholder="Mensaje o dedicatoria (opcional)"
                                    value={polioMemo}
                                    onChange={e => setPolioMemo(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none text-sm mb-4"
                                />

                                <label className="flex items-center gap-3 mb-8 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${polioAnon ? 'bg-rotary-blue border-rotary-blue' : 'border-gray-300 group-hover:border-rotary-blue'}`}>
                                        {polioAnon && <ShieldCheck className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className="text-sm font-bold text-gray-500 group-hover:text-gray-900 transition-colors">Aportar como anónimo</span>
                                    <input type="checkbox" className="hidden" checked={polioAnon} onChange={e => setPolioAnon(e.target.checked)} />
                                </label>

                                <button
                                    type="submit"
                                    disabled={!polioAmount && !polioCustom}
                                    className="mt-auto w-full py-4 bg-rotary-blue text-white rounded-xl font-bold hover:bg-sky-800 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Agregar al carrito
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </form>
                        </div>

                        {/* 2. Aporte Voluntario al Club */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all flex flex-col">
                            <div className="w-14 h-14 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-500 mb-6">
                                <Heart className="w-7 h-7 fill-current" />
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Aporte al Club</h2>
                            <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                                Apoya directamente los proyectos locales y las iniciativas de servicio de {club.name}.
                            </p>

                            <form onSubmit={handleClubDonate} className="flex-1 flex flex-col">
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <button type="button" onClick={() => setClubAmount(20)} className={`py-3 rounded-xl border-2 font-black transition-all ${clubAmount === 20 ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>$20</button>
                                    <button type="button" onClick={() => setClubAmount(50)} className={`py-3 rounded-xl border-2 font-black transition-all ${clubAmount === 50 ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>$50</button>
                                </div>
                                <div className="relative mb-6">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <DollarSign className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="Monto a donar"
                                        value={clubAmount}
                                        onChange={(e) => setClubAmount(e.target.value ? Number(e.target.value) : '')}
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-bold text-gray-900"
                                    />
                                </div>

                                <input
                                    type="text"
                                    placeholder="Mensaje o dedicatoria (opcional)"
                                    value={clubMemo}
                                    onChange={e => setClubMemo(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none text-sm mb-4"
                                />

                                <label className="flex items-center gap-3 mb-8 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${clubAnon ? 'bg-rotary-blue border-rotary-blue' : 'border-gray-300 group-hover:border-rotary-blue'}`}>
                                        {clubAnon && <ShieldCheck className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className="text-sm font-bold text-gray-500 group-hover:text-gray-900 transition-colors">Aportar como anónimo</span>
                                    <input type="checkbox" className="hidden" checked={clubAnon} onChange={e => setClubAnon(e.target.checked)} />
                                </label>

                                <button
                                    type="submit"
                                    disabled={!clubAmount}
                                    className="mt-auto w-full py-4 bg-rotary-blue text-white rounded-xl font-bold hover:bg-sky-800 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Agregar al carrito
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </form>
                        </div>

                        {/* 3. Membresía del Club */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-xl transition-all flex flex-col">
                            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 mb-6">
                                <Users className="w-7 h-7" />
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Cuota de Socios</h2>
                            <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                                Portal de pago rápido para cuotas y membresías de los socios actuales del club.
                            </p>

                            <form onSubmit={handleMembershipPay} className="flex-1 flex flex-col">
                                <div className="relative mb-6">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <DollarSign className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="Monto a pagar"
                                        value={membershipAmount}
                                        onChange={(e) => setMembershipAmount(e.target.value ? Number(e.target.value) : '')}
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-bold text-gray-900"
                                    />
                                </div>

                                <textarea
                                    placeholder="Periodo que cancela u observaciones"
                                    rows={3}
                                    value={membershipMemo}
                                    onChange={e => setMembershipMemo(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none text-sm mb-8 resize-none"
                                />

                                <button
                                    type="submit"
                                    disabled={!membershipAmount}
                                    className="mt-auto w-full py-4 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
                                >
                                    Pagar Cuota
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </form>
                        </div>

                    </div>

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
