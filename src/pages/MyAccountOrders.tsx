import { useState, useEffect } from 'react';
import { useClub } from '../contexts/ClubContext';
import { useAuth } from '../hooks/useAuth';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { Package, Search, Clock, CheckCircle2, AlertCircle, Truck, FileText, ChevronRight, X } from 'lucide-react';
import axios from 'axios';

interface OrderItem {
    id: string;
    title: string;
    qty: number;
    unitPrice: number;
    total: number;
    metadata?: string;
}

interface Order {
    id: string;
    orderNumber?: string;
    total: number;
    subtotal: number;
    shipping: number;
    discount: number;
    currency: string;
    status: string;
    shippingStatus: string;
    shippingMethod?: string;
    trackingNumber?: string;
    paymentMethod: string;
    customerName: string;
    customerEmail: string;
    createdAt: string;
    items: OrderItem[];
}

export default function MyAccountOrders() {
    const { user } = useAuth();
    const { club } = useClub();
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchEmail, setSearchEmail] = useState(user?.email || '');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    const API_URL = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        if (user?.email) {
            setSearchEmail(user.email);
            fetchOrders(user.email);
        }
    }, [user]);

    const fetchOrders = async (emailToFetch: string) => {
        if (!emailToFetch) return;
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_URL}/orders/my-orders`, {
                params: { email: emailToFetch.trim() }
            });
            setOrders(res.data.orders || []);
        } catch (error) {
            console.error('Error fetching customer orders:', error);
            setOrders([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchOrders(searchEmail);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'paid':
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> Pagado</span>;
            case 'payment_pending':
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3.5 h-3.5" /> Pendiente de Pago</span>;
            case 'processing':
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200"><Package className="w-3.5 h-3.5" /> En Preparación</span>;
            case 'shipped':
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"><Truck className="w-3.5 h-3.5" /> Enviado</span>;
            case 'delivered':
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800"><CheckCircle2 className="w-3.5 h-3.5" /> Entregado</span>;
            case 'cancelled':
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200"><AlertCircle className="w-3.5 h-3.5" /> Cancelado</span>;
            default:
                return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">{status}</span>;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />

            <main className="flex-1 max-w-6xl w-full mx-auto px-6 pt-32 pb-24">
                <div className="mb-10 text-center md:text-left">
                    <span className="text-xs font-bold tracking-widest text-rotary-blue uppercase bg-rotary-blue/10 px-3 py-1 rounded-full inline-block mb-3">
                        Portal de Comprador
                    </span>
                    <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">Mis Pedidos y Compras</h1>
                    <p className="text-gray-500 mt-2">Consulta el estado de tus compras, historial de pagos y números de guía de envío.</p>
                </div>

                {/* Email Lookup if not logged in or wanting to check another email */}
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm mb-10">
                    <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="email"
                                required
                                placeholder="Ingresa tu correo para buscar tus pedidos..."
                                value={searchEmail}
                                onChange={e => setSearchEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-transparent rounded-2xl focus:border-rotary-blue/30 focus:bg-white transition-all outline-none font-medium text-gray-900"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full sm:w-auto px-8 py-3.5 bg-rotary-blue hover:bg-sky-800 text-white font-bold rounded-2xl transition-all shadow-md shadow-rotary-blue/10"
                        >
                            {isLoading ? 'Buscando...' : 'Consultar'}
                        </button>
                    </form>
                </div>

                {/* Orders List */}
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-10 h-10 border-4 border-rotary-blue/20 border-t-rotary-blue rounded-full animate-spin mb-4" />
                        <p className="text-gray-500 font-medium">Buscando historial de compras...</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Package className="w-10 h-10 text-gray-300" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No se encontraron pedidos</h3>
                        <p className="text-gray-500 max-w-sm mx-auto mb-6">
                            No encontramos compras asociadas a este correo electrónico. Si realizaste una compra recientemente, verifica la dirección ingresada.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {orders.map(order => (
                            <div
                                key={order.id}
                                onClick={() => setSelectedOrder(order)}
                                className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-6"
                            >
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-sm font-black text-gray-900">
                                            #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                                        </span>
                                        {getStatusBadge(order.status)}
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        Fecha: {new Date(order.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    <p className="text-sm font-medium text-gray-600">
                                        {order.items?.length || 0} producto(s):{' '}
                                        <span className="font-bold text-gray-900">
                                            {order.items?.map(i => i.title).join(', ').slice(0, 50)}...
                                        </span>
                                    </p>
                                </div>

                                <div className="flex items-center justify-between md:justify-end gap-6 pt-4 md:pt-0 border-t md:border-t-0 border-gray-50">
                                    <div className="text-right">
                                        <span className="text-xs text-gray-400 block">Total pagado</span>
                                        <span className="text-xl font-black text-rotary-blue">
                                            ${order.total.toLocaleString()} {order.currency}
                                        </span>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-400" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Order Detail Modal */}
                {selectedOrder && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative">
                            <button
                                onClick={() => setSelectedOrder(null)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="mb-6">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Detalle del Pedido</span>
                                <h2 className="text-2xl font-black text-gray-900 font-mono">
                                    #{selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()}
                                </h2>
                                <div className="mt-3 flex items-center gap-3">
                                    {getStatusBadge(selectedOrder.status)}
                                    <span className="text-xs text-gray-400">
                                        {new Date(selectedOrder.createdAt).toLocaleString('es-CO')}
                                    </span>
                                </div>
                            </div>

                            {/* Tracking if available */}
                            {selectedOrder.trackingNumber && (
                                <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 mb-6 flex items-center gap-3 text-sky-900">
                                    <Truck className="w-6 h-6 text-rotary-blue flex-shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-sky-600 uppercase">Guía de Transporte / Envío</p>
                                        <p className="font-mono font-bold text-sm">{selectedOrder.trackingNumber}</p>
                                    </div>
                                </div>
                            )}

                            {/* Items List */}
                            <div className="divide-y divide-gray-100 mb-6">
                                {selectedOrder.items?.map(item => (
                                    <div key={item.id} className="py-4 flex justify-between items-center text-sm">
                                        <div>
                                            <p className="font-bold text-gray-900">{item.title}</p>
                                            <p className="text-xs text-gray-500">Cantidad: {item.qty} × ${item.unitPrice.toLocaleString()}</p>
                                        </div>
                                        <span className="font-black text-gray-900">${item.total.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Summary */}
                            <div className="bg-gray-50 rounded-2xl p-6 space-y-2 text-sm text-gray-600 mb-8">
                                <div className="flex justify-between">
                                    <span>Subtotal:</span>
                                    <span className="font-bold text-gray-900">${selectedOrder.subtotal.toLocaleString()}</span>
                                </div>
                                {selectedOrder.discount > 0 && (
                                    <div className="flex justify-between text-emerald-600 font-bold">
                                        <span>Descuento:</span>
                                        <span>-${selectedOrder.discount.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span>Envío ({selectedOrder.shippingMethod || 'Estándar'}):</span>
                                    <span className="font-bold text-gray-900">${selectedOrder.shipping.toLocaleString()}</span>
                                </div>
                                <div className="h-px bg-gray-200 my-2" />
                                <div className="flex justify-between text-base font-black text-gray-900">
                                    <span>Total:</span>
                                    <span className="text-rotary-blue text-xl">${selectedOrder.total.toLocaleString()} {selectedOrder.currency}</span>
                                </div>
                            </div>

                            {/* Bank transfer alert if payment_pending */}
                            {selectedOrder.status === 'payment_pending' && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900 text-sm">
                                    <h4 className="font-bold mb-2 flex items-center gap-2">
                                        <AlertCircle className="w-5 h-5 text-amber-600" />
                                        Instrucciones de Pago por Transferencia
                                    </h4>
                                    <p className="leading-relaxed">
                                        Por favor realiza la transferencia a la cuenta oficial del club y envía el soporte de pago
                                        indicando tu número de pedido <strong>#{selectedOrder.orderNumber}</strong>.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
}
