import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Users, Send, Megaphone, FileText, List, TrendingUp, ArrowUpRight, ArrowDownRight, BarChart3, CheckCircle2, XCircle, Eye, Loader2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const WhatsAppDashboard: React.FC = () => {
    const { token } = useAuth();
    const [analytics, setAnalytics] = useState<any>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [analyticsRes, templatesRes, contactsRes, listsRes, campaignsRes] = await Promise.all([
                fetch(`${API}/whatsapp/analytics`, { headers }).then(r => r.json()).catch(() => null),
                fetch(`${API}/whatsapp/templates`, { headers }).then(r => r.json()).catch(() => ({ templates: [] })),
                fetch(`${API}/whatsapp/contacts?limit=1`, { headers }).then(r => r.json()).catch(() => ({ total: 0 })),
                fetch(`${API}/whatsapp/lists`, { headers }).then(r => r.json()).catch(() => ({ lists: [] })),
                fetch(`${API}/whatsapp/campaigns`, { headers }).then(r => r.json()).catch(() => ({ campaigns: [] })),
            ]);
            const tpls = Array.isArray(templatesRes) ? templatesRes : (templatesRes.templates || []);
            const lsts = Array.isArray(listsRes) ? listsRes : (listsRes.lists || []);
            const cmps = Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes.campaigns || []);
            setAnalytics({
                ...(analyticsRes || {}),
                totalContacts: contactsRes.total || analyticsRes?.contacts?.total || 0,
                totalTemplates: tpls.length,
                totalLists: lsts.length,
                totalCampaigns: cmps.length,
                templates: tpls,
                campaigns: cmps,
            });
            setTemplates(tpls);
        } catch { }
        finally { setLoading(false); }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-green-500" />
            </div>
        );
    }

    const kpis = [
        { label: 'Contactos', value: analytics?.totalContacts || 0, icon: Users, color: 'from-blue-500 to-blue-600', bgLight: 'bg-blue-50', textColor: 'text-blue-600' },
        { label: 'Enviados', value: analytics?.messages?.sent || 0, icon: Send, color: 'from-green-500 to-emerald-600', bgLight: 'bg-green-50', textColor: 'text-green-600' },
        { label: 'Entregados', value: analytics?.messages?.delivered || 0, icon: CheckCircle2, color: 'from-emerald-500 to-teal-600', bgLight: 'bg-emerald-50', textColor: 'text-emerald-600' },
        { label: 'Leídos', value: analytics?.messages?.readCount || 0, icon: Eye, color: 'from-purple-500 to-violet-600', bgLight: 'bg-purple-50', textColor: 'text-purple-600' },
        { label: 'Listas', value: analytics?.totalLists || 0, icon: List, color: 'from-amber-500 to-orange-600', bgLight: 'bg-amber-50', textColor: 'text-amber-600' },
        { label: 'Templates', value: analytics?.totalTemplates || 0, icon: FileText, color: 'from-cyan-500 to-sky-600', bgLight: 'bg-cyan-50', textColor: 'text-cyan-600' },
        { label: 'Campañas', value: analytics?.totalCampaigns || 0, icon: Megaphone, color: 'from-pink-500 to-rose-600', bgLight: 'bg-pink-50', textColor: 'text-pink-600' },
        { label: 'Fallidos', value: analytics?.messages?.failed || 0, icon: XCircle, color: 'from-red-500 to-rose-600', bgLight: 'bg-red-50', textColor: 'text-red-600' },
    ];

    const sentCount = analytics?.messages?.sent || 0;
    const deliveredCount = analytics?.messages?.delivered || 0;
    const readCount = analytics?.messages?.readCount || 0;
    const failedCount = analytics?.messages?.failed || 0;
    const deliveryRate = sentCount > 0 ? ((deliveredCount / sentCount) * 100).toFixed(1) : '0';
    const readRate = deliveredCount > 0 ? ((readCount / deliveredCount) * 100).toFixed(1) : '0';
    const failRate = sentCount > 0 ? ((failedCount / sentCount) * 100).toFixed(1) : '0';

    return (
        <div className="space-y-6">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
                <div className="absolute right-20 bottom-0 w-40 h-40 bg-white/5 rounded-full translate-y-1/2" />
                <div className="relative">
                    <p className="text-green-200 text-sm font-bold">WhatsApp CRM</p>
                    <h2 className="text-2xl font-black mt-1">Panel de métricas 📊</h2>
                    <p className="text-green-100 text-sm mt-2">Resumen de actividad de tu cuenta de WhatsApp Business</p>
                    <div className="flex items-center gap-2 mt-4">
                        <div className="px-3 py-1 rounded-full bg-green-500/30 border border-green-400/30 text-xs font-bold flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
                            Cuenta activa
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpis.map(kpi => {
                    const Icon = kpi.icon;
                    return (
                        <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow group">
                            <div className="flex items-start justify-between mb-3">
                                <div className={`w-10 h-10 rounded-xl ${kpi.bgLight} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                    <Icon className={`w-5 h-5 ${kpi.textColor}`} />
                                </div>
                            </div>
                            <p className="text-3xl font-black text-gray-900">{kpi.value.toLocaleString()}</p>
                            <p className="text-xs font-bold text-gray-400 uppercase mt-1">{kpi.label}</p>
                        </div>
                    );
                })}
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Delivery Rate */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm">Tasa de entrega</h3>
                            <p className="text-[10px] text-gray-400">Mensajes entregados / enviados</p>
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-black text-emerald-600">{deliveryRate}%</span>
                        {parseFloat(deliveryRate) > 90 && (
                            <span className="flex items-center text-xs font-bold text-emerald-500 mb-1.5"><ArrowUpRight className="w-3 h-3" /> Excelente</span>
                        )}
                    </div>
                    <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-emerald-500 to-green-400 h-full rounded-full transition-all" style={{ width: `${deliveryRate}%` }} />
                    </div>
                </div>

                {/* Read Rate */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                            <Eye className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm">Tasa de lectura</h3>
                            <p className="text-[10px] text-gray-400">Mensajes leídos / entregados</p>
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-black text-purple-600">{readRate}%</span>
                    </div>
                    <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-purple-500 to-violet-400 h-full rounded-full transition-all" style={{ width: `${readRate}%` }} />
                    </div>
                </div>

                {/* Failure Rate */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                            <XCircle className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm">Tasa de fallo</h3>
                            <p className="text-[10px] text-gray-400">Mensajes fallidos / enviados</p>
                        </div>
                    </div>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-black text-red-500">{failRate}%</span>
                        {parseFloat(failRate) < 5 && parseFloat(failRate) > 0 && (
                            <span className="flex items-center text-xs font-bold text-green-500 mb-1.5"><ArrowDownRight className="w-3 h-3" /> Bajo</span>
                        )}
                    </div>
                    <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-red-500 to-rose-400 h-full rounded-full transition-all" style={{ width: `${failRate}%` }} />
                    </div>
                </div>
            </div>

            {/* Campaign Statistics & Template Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Campaign Stats */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
                            <Megaphone className="w-5 h-5 text-pink-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900">Estadísticas de Campañas</h3>
                            <p className="text-[10px] text-gray-400">Resumen de rendimiento</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-pink-50 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Megaphone className="w-4 h-4 text-pink-500" />
                                <span className="text-xs font-bold text-pink-600">Total Campañas</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{analytics?.totalCampaigns || 0}</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Send className="w-4 h-4 text-blue-500" />
                                <span className="text-xs font-bold text-blue-600">Mensajes Enviados</span>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{analytics?.campaigns?.sent || 0}</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Entregados</span>
                            <span className="text-sm font-black text-emerald-600">{analytics?.campaigns?.delivered || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Leídos</span>
                            <span className="text-sm font-black text-purple-600">{analytics?.campaigns?.readCount || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Fallidos</span>
                            <span className="text-sm font-black text-red-500">{analytics?.campaigns?.failed || 0}</span>
                        </div>
                    </div>
                </div>

                {/* Template Insights */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-cyan-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Templates</h3>
                                <p className="text-[10px] text-gray-400">Estado y uso de plantillas</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                ✓ APROBADOS {templates.filter(t => t.status === 'APPROVED').length}
                            </span>
                            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                                ✗ RECHAZADOS {templates.filter(t => t.status === 'REJECTED').length}
                            </span>
                        </div>
                    </div>
                    {templates.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Sin templates</p>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-gray-100">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase">
                                        <th className="px-4 py-2.5">Template</th>
                                        <th className="px-4 py-2.5">Estado</th>
                                        <th className="px-4 py-2.5 text-right">Categoría</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {templates.slice(0, 6).map(t => (
                                        <tr key={t.id} className="hover:bg-gray-50/50">
                                            <td className="px-4 py-2.5">
                                                <p className="font-bold text-gray-900 text-xs">{t.displayName || t.name}</p>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700'
                                                    : t.status === 'REJECTED' ? 'bg-red-100 text-red-700'
                                                        : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {t.status || 'PENDING'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className="text-xs text-gray-500">{t.category || '—'}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Contact Stats Breakdown */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900">Resumen de Contactos</h3>
                        <p className="text-[10px] text-gray-400">Distribución de la base de contactos</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4 text-center">
                        <p className="text-3xl font-black text-blue-700">{analytics?.contacts?.total || analytics?.totalContacts || 0}</p>
                        <p className="text-xs font-bold text-blue-500 mt-1">Total</p>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4 text-center">
                        <p className="text-3xl font-black text-emerald-700">{analytics?.contacts?.active || 0}</p>
                        <p className="text-xs font-bold text-emerald-500 mt-1">Activos</p>
                    </div>
                    <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-xl p-4 text-center">
                        <p className="text-3xl font-black text-red-600">{analytics?.contacts?.optedOut || 0}</p>
                        <p className="text-xs font-bold text-red-400 mt-1">Opt-out</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-4 text-center">
                        <p className="text-3xl font-black text-amber-700">{analytics?.totalLists || 0}</p>
                        <p className="text-xs font-bold text-amber-500 mt-1">Listas</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhatsAppDashboard;
