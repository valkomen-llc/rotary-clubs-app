import { useState } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { Heart, X, Check } from 'lucide-react';

const ManerasDeContribuir = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [amount, setAmount] = useState('50');
    const [frequency, setFrequency] = useState('one-time');

    const amounts = ['10', '25', '50', '100'];

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Top Centered Title & Description */}
            <section className="py-32 bg-rotary-concrete">
                <div className="max-w-4xl mx-auto px-4 text-center">
                    <h1 className="text-4xl md:text-6xl font-light text-rotary-blue mb-8">Maneras de contribuir</h1>
                    <p className="text-gray-600 text-lg md:text-xl leading-relaxed max-w-3xl mx-auto">
                        Una contribución a Rotary significa agua potable y saneamiento, salud y esperanza en zonas asoladas por enfermedades como la polio, así como desarrollo económico y nuevas oportunidades. Gracias a tu generosidad podemos hacer esto y mucho más.
                    </p>
                </div>
            </section>

            {/* Hero Section with Donation Card */}
            <section className="relative w-full h-[500px] md:h-[600px] overflow-hidden flex items-center">
                <div className="absolute inset-0">
                    <img
                        src="https://www.rotary.org/sites/default/files/styles/w_2800/public/Donate-hero-w2800x975-1.jpg?itok=PDJdtKJ9"
                        alt="Maneras de contribuir"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-white/10" />
                </div>

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex justify-center lg:justify-end">
                    {/* Donation Card */}
                    <div className="bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-10 max-w-md w-full border border-gray-50/50 mr-0 lg:mr-8 transform hover:-translate-y-1 transition-transform duration-300">
                        <h2 className="text-[26px] font-bold text-gray-800 text-center mb-6 leading-tight">Aporte voluntario al Club</h2>
                        <p className="text-gray-600 text-[15px] text-center mb-10 leading-relaxed px-2">
                            Tu contribución fortalece el impacto de nuestro club,
                            apoya nuestras actividades institucionales y
                            sostiene iniciativas de servicio que transforman
                            vidas en nuestra comunidad.
                        </p>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="w-full bg-[#9D2235] hover:bg-[#8B1E2F] text-white font-bold py-[18px] rounded-lg flex items-center justify-center gap-3 transition-colors uppercase tracking-widest text-[13px]"
                        >
                            <Heart className="w-5 h-5 fill-current" />
                            APORTAR
                        </button>
                    </div>
                </div>
            </section>

            {/* Donation Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300 relative">
                        {/* Close Button */}
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
                        >
                            <X className="w-6 h-6" />
                        </button>

                        <div className="p-8">
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-[#9D2235]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Heart className="w-8 h-8 text-[#9D2235]" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900">Haz tu Donación</h2>
                                <p className="text-gray-500 mt-2">Apoya nuestras causas y proyectos en curso</p>
                            </div>

                            <div className="space-y-6">
                                {/* Frequency Selector */}
                                <div className="flex p-1 bg-gray-100 rounded-lg">
                                    <button
                                        onClick={() => setFrequency('one-time')}
                                        className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${frequency === 'one-time' ? 'bg-white text-rotary-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        Donación Única
                                    </button>
                                    <button
                                        onClick={() => setFrequency('monthly')}
                                        className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all ${frequency === 'monthly' ? 'bg-white text-rotary-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        Donación Mensual
                                    </button>
                                </div>

                                {/* Amount Selector */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-3">Selecciona el monto (USD)</label>
                                    <div className="grid grid-cols-4 gap-3 mb-4">
                                        {amounts.map((amt) => (
                                            <button
                                                key={amt}
                                                onClick={() => setAmount(amt)}
                                                className={`py-3 rounded-lg font-bold transition-all border-2 ${amount === amt ? 'border-[#9D2235] bg-[#9D2235]/5 text-[#9D2235]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                                            >
                                                ${amt}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                        <input
                                            type="number"
                                            placeholder="Otro monto"
                                            value={amounts.includes(amount) ? '' : amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#9D2235] outline-none transition-all font-semibold"
                                        />
                                    </div>
                                </div>

                                {/* Info Fields */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nombre</label>
                                        <input type="text" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#9D2235]/20 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
                                        <input type="email" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#9D2235]/20 outline-none" />
                                    </div>
                                </div>

                                <button
                                    className="w-full bg-[#9D2235] hover:bg-[#8B1E2F] text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 mt-4"
                                    onClick={() => {
                                        alert('Simulando redirección a pasarela de pago...');
                                        setIsModalOpen(false);
                                    }}
                                >
                                    Donar Ahora
                                    <Check className="w-5 h-5" />
                                </button>

                                <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                                    Al donar, aceptas nuestras políticas de privacidad. Tus datos están protegidos con encriptación SSL de grado bancario.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
};

export default ManerasDeContribuir;
