import React, { useState, useEffect } from 'react';
import { 
    Wallet, 
    TrendingUp, 
    Globe, 
    CheckCircle2, 
    Clock, 
    ArrowUpRight, 
    Info, 
    DollarSign,
    ShieldCheck,
    PieChart as PieChartIcon
} from 'lucide-react';

interface Activation {
    id: string;
    targetClubId: string;
    domainName: string;
    status: string;
    activationDate: string;
}

interface Pool {
    id: string;
    totalCapital: number;
    costPerUnit: number;
    totalUnits: number;
    activeUnits: number;
    availableUnits: number;
    earned: number;
    projectedAnnualProfit: number;
    currency: string;
    activations: Activation[];
}

const CrowdfundWallet: React.FC = () => {
    const [pools, setPools] = useState<Pool[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchWallet = async () => {
            try {
                const token = localStorage.getItem('rotary_token');
                const response = await fetch('/api/admin/crowdfund/wallet', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error('Error al cargar la billetera');
                const data = await response.json();
                setPools(data.pools);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchWallet();
    }, []);

    if (loading) return (
        <div className="p-8 flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rotary-blue"></div>
        </div>
    );

    if (error) return (
        <div className="p-8 text-center text-red-600 bg-red-50 rounded-2xl border border-red-100">
            <Info className="w-12 h-12 mx-auto mb-4" />
            <p className="font-bold">{error}</p>
        </div>
    );

    if (pools.length === 0) return (
        <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-100">
            <Wallet className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="font-bold uppercase tracking-widest text-xs">No se encontraron inversiones activas</p>
        </div>
    );

    const mainPool = pools[0]; // For this exercise, focus on the first pool

    return (
        <div className="p-4 lg:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
            {/* Header Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Wallet className="w-32 h-32 text-rotary-blue" />
                </div>
                
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-50 rounded-xl">
                            <ShieldCheck className="w-5 h-5 text-rotary-blue" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rotary-blue">Inversionista Certificado</span>
                    </div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight">Mi Billetera de Inversión</h1>
                    <p className="text-gray-500 font-medium mt-1">Gestión de activos y retornos por dominios crowdfunded.</p>
                </div>

                <div className="flex items-center gap-4 relative z-10">
                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Ganancia Acumulada</p>
                        <p className="text-3xl font-black text-emerald-600">
                            <span className="text-xl mr-1">$</span>{mainPool.earned.toLocaleString()}
                            <span className="text-sm ml-1 text-emerald-400 font-bold">{mainPool.currency}</span>
                        </p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-emerald-600" />
                    </div>
                </div>
            </div>

            {/* Main KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <DollarSign className="w-6 h-6 text-rotary-blue" />
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Capital Invertido</p>
                    <p className="text-2xl font-black text-gray-900">${mainPool.totalCapital.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400 mt-2 font-medium">Equivalente a {mainPool.totalUnits} unidades de dominio.</p>
                </div>

                <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Globe className="w-6 h-6 text-purple-600" />
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Dominios Activos</p>
                    <p className="text-2xl font-black text-gray-900">{mainPool.activeUnits} / {mainPool.totalUnits}</p>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                        <div 
                            className="h-full bg-purple-600 rounded-full transition-all duration-1000" 
                            style={{ width: `${(mainPool.activeUnits / mainPool.totalUnits) * 100}%` }}
                        />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Clock className="w-6 h-6 text-amber-600" />
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Dominios Disponibles</p>
                    <p className="text-2xl font-black text-gray-900">{mainPool.availableUnits}</p>
                    <p className="text-[10px] text-amber-600 mt-2 font-bold flex items-center gap-1">
                        <ArrowUpRight className="w-3 h-3" />
                        Pendientes por activar
                    </p>
                </div>

                <div className="bg-[#1B2B4D] p-6 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform text-white">
                        <PieChartIcon className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1">Proyección Anual</p>
                    <p className="text-2xl font-black text-white">${mainPool.projectedAnnualProfit.toLocaleString()}</p>
                    <p className="text-[10px] text-emerald-400 mt-2 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Retorno recurrente estimado
                    </p>
                </div>
            </div>

            {/* List of Activations */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-gray-900">Registros y Activaciones</h2>
                        <p className="text-xs font-medium text-gray-400 mt-1">Historial de dominios desplegados con su capital.</p>
                    </div>
                    <button className="px-4 py-2 bg-gray-50 text-gray-600 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-gray-100 transition-all">
                        Descargar Reporte
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Dominio / Club</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Fecha Activación</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Costo Adquisición</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Precio Oferta</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Margen (25%)</th>
                                <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.1em]">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {mainPool.activations.map((activation) => (
                                <tr key={activation.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-rotary-blue">
                                                <Globe className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{activation.domainName}</p>
                                                <p className="text-[10px] text-gray-400 font-medium">ID: {activation.targetClubId.split('-')[0]}...</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-sm text-gray-500 font-medium">
                                        {new Date(activation.activationDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-8 py-6 text-sm font-bold text-gray-900">${mainPool.costPerUnit}</td>
                                    <td className="px-8 py-6 text-sm font-bold text-gray-900">$32.50</td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-emerald-600">+$7.50</span>
                                            <div className="h-1.5 w-8 bg-emerald-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 w-full" />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                                            ACTIVO
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {mainPool.activations.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-8 py-20 text-center">
                                        <div className="max-w-xs mx-auto">
                                            <Globe className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                                            <p className="text-sm font-bold text-gray-900">Aún no hay dominios activados</p>
                                            <p className="text-xs text-gray-400 mt-1">Los dominios aparecerán aquí a medida que los clubes contraten sus planes.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-emerald-50/50 p-8 rounded-[2rem] border border-emerald-100/50">
                    <h3 className="text-lg font-black text-emerald-900 flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5" />
                        ¿Cómo funciona mi retorno?
                    </h3>
                    <ul className="space-y-4">
                        <li className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-[10px] text-emerald-700">1</div>
                            <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                                Por cada dominio activado en un plan de 299USD, recibes una comisión inmediata de <b>$7.50 USD</b> (Precio Oferta $32.50 - Costo $25.00).
                            </p>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-[10px] text-emerald-700">2</div>
                            <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                                Esta ganancia es <b>recurrente anual</b>. Al renovar el club su plan el siguiente año, recibes nuevamente tu comisión por la gestión del activo.
                            </p>
                        </li>
                    </ul>
                </div>

                <div className="bg-blue-50/50 p-8 rounded-[2rem] border border-blue-100/50">
                    <h3 className="text-lg font-black text-blue-900 flex items-center gap-2 mb-4">
                        <Globe className="w-5 h-5" />
                        Estado de la Inversión
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-blue-800">Recuperación de Capital</span>
                            <span className="text-xs font-black text-blue-900">{Math.round((mainPool.earned / mainPool.totalCapital) * 100)}%</span>
                        </div>
                        <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-blue-600 rounded-full transition-all duration-1000" 
                                style={{ width: `${(mainPool.earned / mainPool.totalCapital) * 100}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                            Faltan {(mainPool.totalCapital - mainPool.earned).toFixed(2)} USD para el punto de equilibrio (Breakeven).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CrowdfundWallet;
