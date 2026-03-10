import React from 'react';
import { X, Trash2, ShieldCheck, ArrowRight, Heart, Gift, Users } from 'lucide-react';
import { useCart, type CartItem } from '../../contexts/CartContext';
import { useNavigate } from 'react-router-dom';

const CartDrawer: React.FC = () => {
    const { items, isCartOpen, setCartOpen, removeFromCart, updateQty, subtotal, itemCount } = useCart();
    const navigate = useNavigate();

    if (!isCartOpen) return null;

    const getIcon = (type: string) => {
        switch (type) {
            case 'donation': return <Heart className="w-5 h-5 text-rose-500" />;
            case 'membership': return <Users className="w-5 h-5 text-emerald-500" />;
            default: return <Gift className="w-5 h-5 text-rotary-blue" />;
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'donation': return 'bg-rose-50 text-rose-600';
            case 'membership': return 'bg-emerald-50 text-emerald-600';
            default: return 'bg-rotary-blue/10 text-rotary-blue';
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'donation': return 'Aporte';
            case 'membership': return 'Membresía';
            default: return 'Producto';
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={() => setCartOpen(false)}
            />

            {/* Drawer */}
            <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 tracking-tight">Tu Carrito</h2>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
                        </p>
                    </div>
                    <button
                        onClick={() => setCartOpen(false)}
                        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-gray-500"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Items */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                    {items.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center px-4 opacity-70">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                <Heart className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Tu carrito está vacío</h3>
                            <p className="text-sm text-gray-500 max-w-[250px]">
                                Aún no has agregado ningún aporte o producto a tu carrito.
                            </p>
                            <button
                                onClick={() => { setCartOpen(false); navigate('/aportes'); }}
                                className="mt-8 text-rotary-blue font-bold text-sm hover:underline"
                            >
                                Explorar opciones de aporte
                            </button>
                        </div>
                    ) : (
                        items.map((item: CartItem) => (
                            <div key={item.id} className="flex gap-4 group">
                                <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                                    {getIcon(item.type)}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="text-sm font-bold text-gray-900 pr-4 leading-tight">
                                            {item.title}
                                        </h4>
                                        <p className="text-sm font-black text-gray-900">
                                            ${(item.unitPrice * item.qty).toLocaleString()}
                                        </p>
                                    </div>
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mb-2 ${getTypeColor(item.type)}`}>
                                        {getTypeName(item.type)}
                                    </span>

                                    <div className="flex items-center justify-between">
                                        {item.type === 'product' ? (
                                            <div className="flex items-center border border-gray-200 rounded-lg bg-gray-50">
                                                <button
                                                    onClick={() => updateQty(item.id, item.qty - 1)}
                                                    className="w-8 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
                                                >-</button>
                                                <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                                                <button
                                                    onClick={() => updateQty(item.id, item.qty + 1)}
                                                    className="w-8 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
                                                >+</button>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-gray-500 font-medium">
                                                {item.type === 'donation' && item.metadata?.isAnonymous && (
                                                    <span className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Anónimo</span>
                                                )}
                                                {item.type === 'membership' && item.metadata?.period && (
                                                    <span>{item.metadata.period}</span>
                                                )}
                                            </div>
                                        )}

                                        <button
                                            onClick={() => removeFromCart(item.id)}
                                            className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                {items.length > 0 && (
                    <div className="p-6 bg-white border-t border-gray-100 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-10">
                        <div className="flex items-center justify-between mb-6">
                            <span className="text-gray-500 font-medium">Total a pagar</span>
                            <span className="text-2xl font-black text-gray-900">
                                ${subtotal.toLocaleString()}
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                setCartOpen(false);
                                navigate('/checkout');
                            }}
                            className="w-full py-4 bg-rotary-blue text-white rounded-xl font-bold hover:bg-sky-800 transition-all flex items-center justify-center gap-2 group shadow-lg shadow-rotary-blue/20"
                        >
                            Finalizar compra
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CartDrawer;
