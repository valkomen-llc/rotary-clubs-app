import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
// Contextos de usuario y configuración
import { ChevronLeft, CreditCard, ShieldCheck, Mail, MapPin, CheckCircle2 } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

type CheckoutStep = 'details' | 'shipping' | 'payment';

export default function Checkout() {
    const { items, subtotal, clearCart } = useCart();
    const { club } = useClub();
    const navigate = useNavigate();

    const [step, setStep] = useState<CheckoutStep>('details');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [customer, setCustomer] = useState({ firstName: '', lastName: '', email: '', phone: '' });
    const [shipping, setShipping] = useState({ address: '', city: '', postalCode: '', country: '' });
    const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal'>('stripe');

    // If cart is empty, user shouldn't be here
    if (items.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
                <Navbar />
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                        <ShieldCheck className="w-10 h-10 text-gray-400" />
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 mb-2">Tu carrito está vacío</h1>
                    <p className="text-gray-500 mb-8 max-w-sm">No puedes acceder al proceso de pago sin agregar productos o aportes primero.</p>
                    <button onClick={() => navigate('/aportes')} className="bg-rotary-blue text-white px-8 py-3 rounded-xl font-bold hover:bg-sky-800 transition-all">
                        Hacer una donación
                    </button>
                </div>
                <Footer />
            </div>
        );
    }

    const hasPhysicalProducts = items.some(item => item.type === 'product');

    const handleNextStep = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (step === 'details') {
            setStep(hasPhysicalProducts ? 'shipping' : 'payment');
        } else if (step === 'shipping') {
            setStep('payment');
        }
    };

    const handleCheckout = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const API = import.meta.env.VITE_API_URL || '/api';
            const res = await fetch(`${API}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items,
                    customer,
                    shipping,
                    clubId: club.id,
                    total: subtotal
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error al procesar el pedido');
            }

            const { order } = await res.json();

            // Success
            clearCart();
            navigate('/order/success', { state: { orderId: order.id, customerEmail: customer.email } });
        } catch (err: any) {
            console.error('Error during checkout:', err);
            setError(err.message || 'Error inesperado al procesar el pago. Por favor intente de nuevo.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <Navbar />

            <main className="max-w-6xl mx-auto px-6 py-12 md:py-20 flex flex-col lg:flex-row gap-12">

                {/* Left Column: Flow */}
                <div className="flex-1">
                    <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-rotary-blue text-sm font-bold mb-8 transition-colors">
                        <ChevronLeft className="w-4 h-4" /> Volver
                    </button>

                    <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-10">Finalizar compra</h1>

                    {/* Stepper Header */}
                    <div className="flex items-center gap-4 mb-10">
                        <div className={`flex items-center gap-2 ${step === 'details' ? 'text-rotary-blue' : 'text-gray-400'}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${step === 'details' ? 'bg-rotary-blue text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
                            <span className="font-bold text-sm hidden sm:block">Datos</span>
                        </div>
                        <div className="h-0.5 w-8 bg-gray-200 rounded-full" />

                        {hasPhysicalProducts && (
                            <>
                                <div className={`flex items-center gap-2 ${step === 'shipping' ? 'text-rotary-blue' : 'text-gray-400'}`}>
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${step === 'shipping' ? 'bg-rotary-blue text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
                                    <span className="font-bold text-sm hidden sm:block">Envío</span>
                                </div>
                                <div className="h-0.5 w-8 bg-gray-200 rounded-full" />
                            </>
                        )}

                        <div className={`flex items-center gap-2 ${step === 'payment' ? 'text-rotary-blue' : 'text-gray-400'}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${step === 'payment' ? 'bg-rotary-blue text-white' : 'bg-gray-200 text-gray-500'}`}>
                                {hasPhysicalProducts ? '3' : '2'}
                            </div>
                            <span className="font-bold text-sm hidden sm:block">Pago</span>
                        </div>
                    </div>

                    {/* Step Content */}
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">

                        {step === 'details' && (
                            <form onSubmit={handleNextStep}>
                                <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
                                    <Mail className="w-5 h-5 text-rotary-blue" />
                                    Tus datos
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre *</label>
                                        <input type="text" required value={customer.firstName} onChange={e => setCustomer({ ...customer, firstName: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Apellidos *</label>
                                        <input type="text" required value={customer.lastName} onChange={e => setCustomer({ ...customer, lastName: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium" />
                                    </div>
                                </div>
                                <div className="mb-6">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Correo Electrónico *</label>
                                    <input type="email" required value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium" />
                                    <p className="text-xs text-gray-400 mt-2">Te enviaremos el recibo y comprobante de contribución a este correo.</p>
                                </div>
                                <div className="mb-8">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono (opcional)</label>
                                    <input type="tel" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium" />
                                </div>

                                <button type="submit" className="w-full py-4 bg-rotary-blue text-white rounded-xl font-bold hover:bg-sky-800 transition-all flex items-center justify-center gap-2 group">
                                    Continuar a {hasPhysicalProducts ? 'Envío' : 'Pago'}
                                </button>
                            </form>
                        )}

                        {step === 'shipping' && (
                            <form onSubmit={handleNextStep}>
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                        <MapPin className="w-5 h-5 text-rotary-blue" />
                                        Dirección de Envío
                                    </h2>
                                    <button type="button" onClick={() => setStep('details')} className="text-sm font-bold text-rotary-blue hover:underline">Editar Datos</button>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Dirección Completa *</label>
                                    <input type="text" required value={shipping.address} onChange={e => setShipping({ ...shipping, address: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium" />
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ciudad *</label>
                                        <input type="text" required value={shipping.city} onChange={e => setShipping({ ...shipping, city: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Código Postal *</label>
                                        <input type="text" required value={shipping.postalCode} onChange={e => setShipping({ ...shipping, postalCode: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium" />
                                    </div>
                                </div>
                                <div className="mb-8">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">País *</label>
                                    <input type="text" required value={shipping.country} onChange={e => setShipping({ ...shipping, country: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium" />
                                </div>

                                <button type="submit" className="w-full py-4 bg-rotary-blue text-white rounded-xl font-bold hover:bg-sky-800 transition-all">
                                    Continuar a Pago
                                </button>
                            </form>
                        )}

                        {step === 'payment' && (
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                        <CreditCard className="w-5 h-5 text-rotary-blue" />
                                        Selecciona tu pago
                                    </h2>
                                    <button type="button" onClick={() => setStep(hasPhysicalProducts ? 'shipping' : 'details')} className="text-sm font-bold text-rotary-blue hover:underline">Atrás</button>
                                </div>

                                {/* Payment Methods */}
                                <div className="space-y-3 mb-8">
                                    <label
                                        onClick={() => setPaymentMethod('stripe')}
                                        className={`block px-4 py-4 rounded-xl border-2 cursor-pointer transition-all ${paymentMethod === 'stripe' ? 'border-rotary-blue bg-sky-50' : 'border-gray-100 hover:border-gray-200'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'stripe' ? 'border-rotary-blue' : 'border-gray-300'}`}>
                                                {paymentMethod === 'stripe' && <div className="w-2.5 h-2.5 bg-rotary-blue rounded-full" />}
                                            </div>
                                            <span className="font-bold text-gray-900">Tarjeta de Crédito / Débito (Stripe)</span>
                                        </div>
                                    </label>

                                    <label
                                        onClick={() => setPaymentMethod('paypal')}
                                        className={`block px-4 py-4 rounded-xl border-2 cursor-pointer transition-all ${paymentMethod === 'paypal' ? 'border-rotary-blue bg-sky-50' : 'border-gray-100 hover:border-gray-200'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'paypal' ? 'border-rotary-blue' : 'border-gray-300'}`}>
                                                {paymentMethod === 'paypal' && <div className="w-2.5 h-2.5 bg-rotary-blue rounded-full" />}
                                            </div>
                                            <span className="font-bold text-gray-900">PayPal</span>
                                        </div>
                                    </label>
                                </div>

                                <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 mb-8 text-center text-sm text-gray-500 flex flex-col items-center">
                                    <ShieldCheck className="w-8 h-8 text-gray-400 mb-2" />
                                    <p>Tu información de pago será procesada de manera segura por <strong>{paymentMethod === 'stripe' ? 'Stripe' : 'PayPal'}</strong>.</p>
                                    <p className="text-xs mt-1">Rotary Platform no almacena los datos de tu tarjeta.</p>
                                </div>

                                <button
                                    onClick={handleCheckout}
                                    disabled={isLoading}
                                    className="w-full py-4 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                                >
                                    {isLoading ? 'Procesando seguro...' : `Pagar $${subtotal.toLocaleString()}`}
                                </button>
                            </div>
                        )}

                    </div>
                </div>

                {/* Right Column: Order Summary */}
                <div className="w-full lg:w-[400px]">
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-[0_10px_40px_rgba(0,0,0,0.03)] sticky top-24">
                        <h3 className="text-lg font-black text-gray-900 mb-6">Resumen del pedido</h3>

                        <div className="space-y-4 mb-6">
                            {items.map(item => (
                                <div key={item.id} className="flex justify-between text-sm">
                                    <div>
                                        <p className="font-bold text-gray-900">{item.title}</p>
                                        <p className="text-gray-500">Volumen: {item.qty}</p>
                                    </div>
                                    <span className="font-black text-gray-900">${(item.unitPrice * item.qty).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-gray-100 pt-6 space-y-3 mb-6">
                            <div className="flex justify-between text-sm text-gray-500">
                                <span>Subtotal</span>
                                <span>${subtotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-500">
                                <span>Impuestos</span>
                                <span>--</span>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-6 flex justify-between items-center">
                            <span className="font-bold text-gray-900">Total a Pagar</span>
                            <span className="text-2xl font-black text-rotary-blue">${subtotal.toLocaleString()}</span>
                        </div>

                        <div className="mt-8 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100 justify-center">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="font-bold">Aportes 100% seguros y respaldados.</span>
                        </div>
                    </div>
                </div>

            </main>
            <Footer />
        </div>
    );
}
