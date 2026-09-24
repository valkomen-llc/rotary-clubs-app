import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useClub } from '../contexts/ClubContext';
import { useAuth } from '../hooks/useAuth';
import { ChevronLeft, CreditCard, ShieldCheck, Mail, MapPin, CheckCircle2, Building2, Truck, Tag } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import axios from 'axios';
import { toast } from 'sonner';

type CheckoutStep = 'details' | 'shipping' | 'payment';

interface ShippingMethod {
    id: string;
    code: string;
    name: string;
    price: number;
    minOrderFree?: number;
}

export default function Checkout() {
    const { items, subtotal, clearCart } = useCart();
    const { club } = useClub();
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [step, setStep] = useState<CheckoutStep>('details');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [customer, setCustomer] = useState({
        firstName: user?.name ? user.name.split(' ')[0] : '',
        lastName: user?.name ? user.name.split(' ').slice(1).join(' ') : '',
        email: user?.email || '',
        phone: ''
    });

    const [shipping, setShipping] = useState({
        address: '',
        city: 'Bogotá',
        department: 'Cundinamarca',
        postalCode: '',
        country: 'Colombia',
        notes: ''
    });

    const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'manual'>('stripe');

    // Shipping methods from tenant
    const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
    const [selectedShippingMethod, setSelectedShippingMethod] = useState<ShippingMethod | null>(null);

    // Coupon discount
    const [couponCode, setCouponCode] = useState<string>(location.state?.couponCode || '');
    const [couponDiscount, setCouponDiscount] = useState<number>(location.state?.discountAmount || 0);

    const API_URL = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        if (club?.id) {
            fetchShippingMethods();
        }
    }, [club?.id]);

    const fetchShippingMethods = async () => {
        try {
            const res = await axios.get(`${API_URL}/orders/shipping-methods`, {
                params: { clubId: club?.id }
            });
            const methods = res.data.methods || [];
            setShippingMethods(methods);
            if (methods.length > 0) {
                setSelectedShippingMethod(methods[0]);
            }
        } catch (err) {
            console.warn('Error fetching shipping methods:', err);
        }
    };

    // Calculate shipping cost
    let shippingCost = 0;
    if (selectedShippingMethod) {
        if (selectedShippingMethod.minOrderFree && subtotal >= selectedShippingMethod.minOrderFree) {
            shippingCost = 0;
        } else {
            shippingCost = Number(selectedShippingMethod.price) || 0;
        }
    }

    const calculatedTotal = Math.max(0, subtotal - couponDiscount + shippingCost);

    const hasPhysicalProducts = items.some(item => item.type === 'product');

    if (items.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
                <Navbar />
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center pt-32 pb-24">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                        <ShieldCheck className="w-10 h-10 text-gray-400" />
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 mb-2">Tu carrito está vacío</h1>
                    <p className="text-gray-500 mb-8 max-w-sm">No puedes acceder al proceso de pago sin agregar productos o aportes primero.</p>
                    <button
                        onClick={() => navigate('/tienda')}
                        className="bg-rotary-blue text-white px-8 py-3.5 rounded-2xl font-black hover:bg-sky-800 transition-all shadow-lg shadow-rotary-blue/20"
                    >
                        Ir a la Tienda
                    </button>
                </div>
                <Footer />
            </div>
        );
    }

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
            const payload = {
                items,
                customer,
                shipping: hasPhysicalProducts ? shipping : null,
                clubId: club.id,
                shippingMethodId: selectedShippingMethod?.id,
                couponCode: couponCode || null,
                paymentMethod,
                notes: shipping.notes || null
            };

            const res = await axios.post(`${API_URL}/orders`, payload);
            const { order, paymentResult } = res.data;

            clearCart();

            navigate('/order/success', {
                state: {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    customerEmail: customer.email,
                    paymentMethod,
                    instructions: paymentResult?.instructions || null
                }
            });
        } catch (err: any) {
            console.error('Error during checkout:', err);
            const msg = err.response?.data?.error || err.message || 'Error inesperado al procesar el pedido';
            setError(msg);
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <Navbar />

            <main className="flex-1 max-w-6xl w-full mx-auto px-6 pt-32 pb-24 flex flex-col lg:flex-row gap-12">
                {/* Left Column: Checkout Stepper */}
                <div className="flex-1">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-gray-500 hover:text-rotary-blue text-sm font-bold mb-8 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" /> Volver al Carrito
                    </button>

                    <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-8">Finalizar compra</h1>

                    {/* Stepper Header */}
                    <div className="flex items-center gap-4 mb-8">
                        <div className={`flex items-center gap-2 ${step === 'details' ? 'text-rotary-blue font-bold' : 'text-gray-400'}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${step === 'details' ? 'bg-rotary-blue text-white' : 'bg-gray-200 text-gray-500'}`}>
                                1
                            </div>
                            <span className="text-sm hidden sm:block">Datos</span>
                        </div>
                        <div className="h-0.5 w-8 bg-gray-200 rounded-full" />

                        {hasPhysicalProducts && (
                            <>
                                <div className={`flex items-center gap-2 ${step === 'shipping' ? 'text-rotary-blue font-bold' : 'text-gray-400'}`}>
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${step === 'shipping' ? 'bg-rotary-blue text-white' : 'bg-gray-200 text-gray-500'}`}>
                                        2
                                    </div>
                                    <span className="text-sm hidden sm:block">Envío</span>
                                </div>
                                <div className="h-0.5 w-8 bg-gray-200 rounded-full" />
                            </>
                        )}

                        <div className={`flex items-center gap-2 ${step === 'payment' ? 'text-rotary-blue font-bold' : 'text-gray-400'}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${step === 'payment' ? 'bg-rotary-blue text-white' : 'bg-gray-200 text-gray-500'}`}>
                                {hasPhysicalProducts ? '3' : '2'}
                            </div>
                            <span className="text-sm hidden sm:block">Pago</span>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl mb-8 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    {/* Step 1: Datos Personales */}
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                        {step === 'details' && (
                            <form onSubmit={handleNextStep}>
                                <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
                                    <Mail className="w-5 h-5 text-rotary-blue" />
                                    Tus datos de contacto
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre *</label>
                                        <input
                                            type="text"
                                            required
                                            value={customer.firstName}
                                            onChange={e => setCustomer({ ...customer, firstName: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Apellidos *</label>
                                        <input
                                            type="text"
                                            required
                                            value={customer.lastName}
                                            onChange={e => setCustomer({ ...customer, lastName: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium"
                                        />
                                    </div>
                                </div>
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Correo Electrónico *</label>
                                    <input
                                        type="email"
                                        required
                                        value={customer.email}
                                        onChange={e => setCustomer({ ...customer, email: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium"
                                    />
                                    <p className="text-xs text-gray-400 mt-2">Te enviaremos el recibo, confirmación y guía de transporte a este correo.</p>
                                </div>
                                <div className="mb-8">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono móvil *</label>
                                    <input
                                        type="tel"
                                        required
                                        placeholder="Ej. +57 300 123 4567"
                                        value={customer.phone}
                                        onChange={e => setCustomer({ ...customer, phone: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="w-full py-4 bg-rotary-blue text-white rounded-2xl font-black text-lg hover:bg-sky-800 transition-all shadow-lg shadow-rotary-blue/20"
                                >
                                    Continuar a {hasPhysicalProducts ? 'Envío' : 'Pago'}
                                </button>
                            </form>
                        )}

                        {/* Step 2: Envío y Entrega */}
                        {step === 'shipping' && (
                            <form onSubmit={handleNextStep}>
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                        <MapPin className="w-5 h-5 text-rotary-blue" />
                                        Dirección y Método de Envío
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={() => setStep('details')}
                                        className="text-sm font-bold text-rotary-blue hover:underline"
                                    >
                                        Editar Datos
                                    </button>
                                </div>

                                {/* Selección de Método de Envío */}
                                <div className="mb-8">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                                        Selecciona una opción de entrega *
                                    </label>
                                    <div className="space-y-3">
                                        {shippingMethods.map(m => {
                                            const isFree = m.minOrderFree && subtotal >= m.minOrderFree;
                                            const cost = isFree ? 0 : m.price;
                                            const isSelected = selectedShippingMethod?.id === m.id;

                                            return (
                                                <div
                                                    key={m.id}
                                                    onClick={() => setSelectedShippingMethod(m)}
                                                    className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${isSelected ? 'border-rotary-blue bg-sky-50/50' : 'border-gray-100 hover:border-gray-200'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-rotary-blue' : 'border-gray-300'}`}>
                                                            {isSelected && <div className="w-2.5 h-2.5 bg-rotary-blue rounded-full" />}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900 text-sm">{m.name}</p>
                                                            {m.code === 'pickup' && (
                                                                <p className="text-xs text-gray-400">Recoger directamente en la sede o evento del Club</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className="font-black text-gray-900 text-sm">
                                                        {cost === 0 ? <span className="text-emerald-600 font-bold">GRATIS</span> : `$${cost.toLocaleString()}`}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Dirección de Entrega *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Calle / Carrera / Número, Apto o Casa"
                                        value={shipping.address}
                                        onChange={e => setShipping({ ...shipping, address: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ciudad *</label>
                                        <input
                                            type="text"
                                            required
                                            value={shipping.city}
                                            onChange={e => setShipping({ ...shipping, city: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Departamento *</label>
                                        <input
                                            type="text"
                                            required
                                            value={shipping.department}
                                            onChange={e => setShipping({ ...shipping, department: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="mb-8">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notas adicionales de entrega (opcional)</label>
                                    <input
                                        type="text"
                                        placeholder="Ej. Dejar en portería, timbre 201"
                                        value={shipping.notes}
                                        onChange={e => setShipping({ ...shipping, notes: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="w-full py-4 bg-rotary-blue text-white rounded-2xl font-black text-lg hover:bg-sky-800 transition-all shadow-lg shadow-rotary-blue/20"
                                >
                                    Continuar al Pago
                                </button>
                            </form>
                        )}

                        {/* Step 3: Pago */}
                        {step === 'payment' && (
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                        <CreditCard className="w-5 h-5 text-rotary-blue" />
                                        Método de Pago
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={() => setStep(hasPhysicalProducts ? 'shipping' : 'details')}
                                        className="text-sm font-bold text-rotary-blue hover:underline"
                                    >
                                        Atrás
                                    </button>
                                </div>

                                <div className="space-y-3 mb-8">
                                    <label
                                        onClick={() => setPaymentMethod('stripe')}
                                        className={`block p-5 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === 'stripe' ? 'border-rotary-blue bg-sky-50/50' : 'border-gray-100 hover:border-gray-200'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'stripe' ? 'border-rotary-blue' : 'border-gray-300'}`}>
                                                {paymentMethod === 'stripe' && <div className="w-2.5 h-2.5 bg-rotary-blue rounded-full" />}
                                            </div>
                                            <div>
                                                <span className="font-bold text-gray-900 block">Tarjeta de Crédito / Débito (Stripe)</span>
                                                <span className="text-xs text-gray-500">Procesamiento seguro instantáneo con confirmación inmediata</span>
                                            </div>
                                        </div>
                                    </label>

                                    <label
                                        onClick={() => setPaymentMethod('manual')}
                                        className={`block p-5 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === 'manual' ? 'border-rotary-blue bg-sky-50/50' : 'border-gray-100 hover:border-gray-200'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'manual' ? 'border-rotary-blue' : 'border-gray-300'}`}>
                                                {paymentMethod === 'manual' && <div className="w-2.5 h-2.5 bg-rotary-blue rounded-full" />}
                                            </div>
                                            <div>
                                                <span className="font-bold text-gray-900 block">Transferencia Bancaria Directa (Colombia)</span>
                                                <span className="text-xs text-gray-500">Consignación oficial a la cuenta bancaria del Club con soporte</span>
                                            </div>
                                        </div>
                                    </label>
                                </div>

                                {paymentMethod === 'manual' && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8 text-amber-900 text-sm">
                                        <div className="flex items-center gap-2 font-bold mb-2">
                                            <Building2 className="w-5 h-5 text-amber-700" />
                                            <span>Instrucciones de Transferencia</span>
                                        </div>
                                        <p className="leading-relaxed">
                                            Al pulsar "Completar Pedido", se registrará tu compra con estado <strong>Pendiente de Pago</strong> y recibirás en pantalla y por correo las cuentas autorizadas del club para realizar la transferencia.
                                        </p>
                                    </div>
                                )}

                                <button
                                    onClick={handleCheckout}
                                    disabled={isLoading}
                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-lg transition-all shadow-xl shadow-emerald-600/20 disabled:opacity-50"
                                >
                                    {isLoading ? 'Procesando de manera segura...' : `Confirmar y Pagar $${calculatedTotal.toLocaleString()}`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Order Summary */}
                <div className="w-full lg:w-[380px]">
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm sticky top-32">
                        <h3 className="text-xl font-black text-gray-900 mb-6">Tu Pedido</h3>

                        <div className="divide-y divide-gray-100 mb-6 max-h-72 overflow-y-auto pr-1">
                            {items.map(item => (
                                <div key={item.id} className="py-3 flex justify-between text-sm">
                                    <div>
                                        <p className="font-bold text-gray-900">{item.title}</p>
                                        <p className="text-xs text-gray-400">Cant: {item.qty} × ${item.unitPrice.toLocaleString()}</p>
                                    </div>
                                    <span className="font-black text-gray-900">${(item.unitPrice * item.qty).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-3 pt-4 border-t border-gray-100 text-sm text-gray-600 mb-6">
                            <div className="flex justify-between">
                                <span>Subtotal</span>
                                <span className="font-bold text-gray-900">${subtotal.toLocaleString()}</span>
                            </div>

                            {couponDiscount > 0 && (
                                <div className="flex justify-between text-emerald-600 font-bold">
                                    <span>Descuento ({couponCode})</span>
                                    <span>-${couponDiscount.toLocaleString()}</span>
                                </div>
                            )}

                            {hasPhysicalProducts && (
                                <div className="flex justify-between">
                                    <span>Envío ({selectedShippingMethod?.name || 'Por definir'})</span>
                                    <span className="font-bold text-gray-900">
                                        {shippingCost === 0 ? 'GRATIS' : `$${shippingCost.toLocaleString()}`}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-gray-100 flex justify-between items-end mb-6">
                            <span className="font-bold text-gray-900">Total a Pagar</span>
                            <span className="text-2xl font-black text-rotary-blue">${calculatedTotal.toLocaleString()} COP</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100 justify-center">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            <span className="font-bold">Pago 100% verificado y respaldado por Rotary.</span>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
