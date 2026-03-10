import { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Receipt, Search, Download, ExternalLink, Activity } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

export default function OrdersManagement() {
    const { token } = useAuth();
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const response = await axios.get(`${API_URL}/orders`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setOrders(response.data.orders || []);
            } catch (error) {
                console.error("Error fetching orders:", error);
            } finally {
                setIsLoading(false);
            }
        };

        if (token) fetchOrders();
    }, [token, API_URL]);

    // Calcular KPIs
    const totalVolume = orders.reduce((acc, current) => acc + current.total, 0);
    const paidOrders = orders.filter(o => o.status === 'paid').length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">Órdenes y Pagos</h1>
                    <p className="text-sm text-gray-500 mt-1">Historial de aportes, compras y transacciones procesadas.</p>
                </div>
                <button className="bg-white border border-gray-200 text-rotary-blue px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-50 transition-colors shadow-sm">
                    <Download className="w-4 h-4" />
                    Exportar Reporte
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                        <Receipt className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Volumen Total</p>
                        <p className="text-2xl font-black text-gray-900">${totalVolume.toLocaleString()}</p>
                    </div>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-sky-50 text-rotary-blue rounded-xl flex items-center justify-center">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Órdenes Pagadas</p>
                        <p className="text-2xl font-black text-gray-900">{paidOrders}</p>
                    </div>
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center">
                        <ExternalLink className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Pagos Pendientes</p>
                        <p className="text-2xl font-black text-gray-900">{pendingOrders}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                <div className="flex gap-4 mb-6">
                    <div className="flex-1 relative">
                        <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente, email o número de orden..."
                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none font-medium transition-all"
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center py-12 text-gray-500 font-medium">Cargando órdenes...</div>
                ) : orders.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">ID Orden</th>
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Cliente</th>
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Fecha</th>
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Estado</th>
                                <th className="py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((order: any) => (
                                <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 font-mono text-xs text-gray-500">{order.id.slice(0, 8)}</td>
                                    <td className="py-4">
                                        <div className="font-bold text-gray-900">{order.customerName}</div>
                                        <div className="text-xs text-gray-500">{order.customerEmail}</div>
                                    </td>
                                    <td className="py-4 text-sm text-gray-600">
                                        {new Date(order.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="py-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${order.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                                            order.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                                                'bg-red-50 text-red-600'
                                            }`}>
                                            {order.status === 'paid' ? 'Pagado' : order.status === 'pending' ? 'Pendiente' : 'Abonado/Fallido'}
                                        </span>
                                    </td>
                                    <td className="py-4 text-right font-black text-gray-900">
                                        ${order.total.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="text-center py-16 px-4">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                            <Receipt className="w-8 h-8 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">No hay órdenes aún</h3>
                        <p className="text-gray-500 max-w-sm mx-auto">Las ventas, membresías y aportes aparecerán aquí una vez procesados.</p>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
