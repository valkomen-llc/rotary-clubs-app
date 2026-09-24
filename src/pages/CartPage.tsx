import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useClub } from '../contexts/ClubContext';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { Trash2, ArrowRight, ShoppingBag, ShieldCheck, Tag, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function CartPage() {
    const { items, updateQty, removeFromCart, clearCart, subtotal } = useCart();
    const { club } = useClub();
    const navigate = useNavigate();

    const [couponCode, setCouponCode] = useState('');
    const [couponDiscount, setCouponDiscount] = useState<number>(0);
    const [couponApplied, setCouponApplied] = useState<string | null>(null);
    const [validatingCoupon, setValidatingCoupon] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL || '/api';

    const handleApplyCoupon = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!couponCode.trim()) return;

        setValidatingCoupon(true);
        try {
            const res = await fetch(`${API_URL}/orders/validate-coupon`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId: club?.id,
                    code: couponCode.trim(),
                    subtotal
                })
            });
            const data = await res.json();
            if (res.ok && data.valid) {
                setCouponDiscount(data.discountAmount);
                setCouponApplied(data.code);
                toast.success(`Cupón "${data.code}" aplicado: -$${data.discountAmount.toLocaleString()}`);
            } else {
                toast.error(data.error || 'Cupón inválido');
                setCouponDiscount(0);
                setCouponApplied(null);
            }
        } catch {
            toast.error('Error al validar el cupón');
        } finally {
            setValidatingCoupon(false);
        }
    };

    const finalTotal = Math.max(0, subtotal - couponDiscount);

    if (items.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
                <Navbar />
                <main className="flex-1 flex flex-col items-center justify-center p-6 text-center pt-32 pb-24">
                    <div className="w-24 h-24 bg-white rounded-3xl shadow-sm border border-gray-100 flex items-center justify-center mb-6">
                        <ShoppingBag className="w-10 h-10 text-gray-300" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 mb-2">Tu carrito está vacío</h1>
                    <p className="text-gray-500 mb-8 max-w-sm">Explora los artículos oficiales y proyectos de nuestro club en la tienda.</p>
                    <Link
                        to="/tienda"
                        className="px-8 py-4 bg-rotary-blue text-white rounded-2xl font-black hover:bg-sky-800 transition-all shadow-lg shadow-rotary-blue/20"
                    >
                        Explorar la Tienda
                    </Link>
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />

            <main className="flex-1 max-w-7xl w-full mx-auto px-6 pt-32 pb-24">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link to="/tienda" className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-rotary-blue transition-colors mb-2">
                            <ArrowLeft className="w-4 h-4" /> Seguir comprando
                        </Link>
                        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">Tu Carrito de Compras</h1>
                    </div>
                    <button
                        onClick={clearCart}
                        className="text-sm font-bold text-gray-400 hover:text-red-500 transition-colors"
                    >
                        Vaciar Carrito
                    </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-10">
                    {/* Items List */}
                    <div className="flex-1 space-y-4">
                        {items.map(item => (
                            <div
                                key={item.id}
                                className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-20 h-20 bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 flex-shrink-0 flex items-center justify-center">
                                        {item.image ? (
                                            <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <ShoppingBag className="w-8 h-8 text-gray-300" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg leading-tight mb-1">{item.title}</h3>
                                        <p className="text-sm text-gray-500">
                                            Precio unitario: <span className="font-bold text-gray-900">${item.unitPrice.toLocaleString()}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-6 pt-4 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                                    <div className="flex items-center border-2 border-gray-100 rounded-xl bg-gray-50 overflow-hidden">
                                        <button
                                            onClick={() => updateQty(item.id, item.qty - 1)}
                                            className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 transition-colors font-bold text-sm"
                                        >
                                            -
                                        </button>
                                        <span className="w-10 text-center font-bold text-sm text-gray-900">{item.qty}</span>
                                        <button
                                            onClick={() => updateQty(item.id, item.qty + 1)}
                                            className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 transition-colors font-bold text-sm"
                                        >
                                            +
                                        </button>
                                    </div>

                                    <div className="text-right min-w-[100px]">
                                        <div className="text-lg font-black text-gray-900">
                                            ${(item.unitPrice * item.qty).toLocaleString()}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="p-2 text-gray-300 hover:text-red-500 transition-colors rounded-lg"
                                        title="Eliminar ítem"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Cupones */}
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm mt-6">
                            <form onSubmit={handleApplyCoupon} className="flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="¿Tienes un cupón de descuento?"
                                        value={couponCode}
                                        onChange={e => setCouponCode(e.target.value)}
                                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium text-gray-800 uppercase"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={validatingCoupon || !couponCode.trim()}
                                    className="px-6 py-3 bg-gray-900 hover:bg-black text-white font-bold rounded-2xl transition-all disabled:opacity-50"
                                >
                                    {validatingCoupon ? 'Validando...' : 'Aplicar'}
                                </button>
                            </form>
                            {couponApplied && (
                                <p className="text-xs text-emerald-600 font-bold mt-2">
                                    ✓ Cupón {couponApplied} activo (-${couponDiscount.toLocaleString()})
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div className="w-full lg:w-[380px]">
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm sticky top-32">
                            <h3 className="text-xl font-black text-gray-900 mb-6">Resumen de Orden</h3>

                            <div className="space-y-4 mb-6">
                                <div className="flex justify-between text-gray-600">
                                    <span>Subtotal</span>
                                    <span className="font-bold text-gray-900">${subtotal.toLocaleString()}</span>
                                </div>

                                {couponDiscount > 0 && (
                                    <div className="flex justify-between text-emerald-600 font-bold">
                                        <span>Descuento ({couponApplied})</span>
                                        <span>-${couponDiscount.toLocaleString()}</span>
                                    </div>
                                )}

                                <div className="flex justify-between text-gray-600">
                                    <span>Envío estimado</span>
                                    <span className="text-xs font-bold text-gray-400">Calculado en checkout</span>
                                </div>
                            </div>

                            <div className="h-px bg-gray-100 my-6"></div>

                            <div className="flex justify-between items-end mb-8">
                                <div>
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total estimado</span>
                                    <span className="text-3xl font-black text-rotary-blue">${finalTotal.toLocaleString()}</span>
                                </div>
                                <span className="text-xs font-bold text-gray-400">COP</span>
                            </div>

                            <button
                                onClick={() => navigate('/checkout', { state: { couponCode: couponApplied, discountAmount: couponDiscount } })}
                                className="w-full py-4 bg-rotary-blue text-white rounded-2xl font-black text-lg hover:bg-sky-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-rotary-blue/20"
                            >
                                Proceder al Pago
                                <ArrowRight className="w-5 h-5" />
                            </button>

                            <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold text-gray-400">
                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                <span>Compra segura protegida por Club Platform</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
