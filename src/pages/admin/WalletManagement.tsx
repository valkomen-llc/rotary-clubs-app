import { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Wallet, ArrowUpRight, Clock, CheckCircle2, XCircle, Building2, AlertCircle, Heart, Mail, MessageSquare, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';

interface BalanceData {
    availableBalance: number;
    totalCollected: number;
    totalRequested: number;
    currency: string;
}

interface PayoutRequest {
    id: string;
    amount: number;
    currency: string;
    status: 'pending' | 'processing' | 'completed' | 'rejected';
    bankDetails: string;
    notes: string;
    createdAt: string;
}

interface DonationRecord {
    id: string;
    amount: number;
    currency: string;
    donorName: string | null;
    donorEmail: string | null;
    isAnonymous: boolean;
    message: string | null;
    date: string;
    status: string;
}

const fmtUSD = (n: number | null | undefined) =>
    Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WalletManagement() {
    const { token } = useAuth();
    const { club } = useClub();
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

    const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
    const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
    const [donations, setDonations] = useState<DonationRecord[]>([]);
    const [donationsTotal, setDonationsTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Form states
    const [amount, setAmount] = useState<number | ''>('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState('');

    useEffect(() => {
        if (token && club?.id) {
            fetchWalletData();
        }
    }, [token, club?.id]);

    const fetchWalletData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        setIsRefreshing(true);
        setLoadError(null);
        const headers = { 'Authorization': `Bearer ${token}` };

        // Defensive: each endpoint resuelve independiente. Si /donations falla
        // (router no montado en algún env), balance + payouts siguen mostrándose.
        const [balanceRes, payoutsRes, donationsRes] = await Promise.allSettled([
            axios.get(`${API_URL}/payouts/balance?clubId=${club?.id}`, { headers }),
            axios.get(`${API_URL}/payouts/history?clubId=${club?.id}`, { headers }),
            axios.get(`${API_URL}/financial/donations?clubId=${club?.id}`, { headers }),
        ]);

        if (balanceRes.status === 'fulfilled' && typeof balanceRes.value.data?.availableBalance === 'number') {
            setBalanceData(balanceRes.value.data);
        } else {
            setBalanceData({ availableBalance: 0, totalCollected: 0, totalRequested: 0, currency: 'USD' });
            const reason = balanceRes.status === 'rejected' ? balanceRes.reason?.message : 'respuesta inesperada';
            setLoadError(`No pudimos cargar el balance (${reason}). Mostrando ceros por defecto.`);
            console.error('[Wallet] balance fetch failed:', balanceRes);
        }

        if (payoutsRes.status === 'fulfilled' && Array.isArray(payoutsRes.value.data)) {
            setPayouts(payoutsRes.value.data);
        } else {
            setPayouts([]);
            console.error('[Wallet] payouts fetch failed:', payoutsRes);
        }

        if (donationsRes.status === 'fulfilled' && Array.isArray(donationsRes.value.data?.donations)) {
            setDonations(donationsRes.value.data.donations);
            setDonationsTotal(donationsRes.value.data.totalAmount || 0);
        } else {
            setDonations([]);
            setDonationsTotal(0);
            console.error('[Wallet] donations fetch failed:', donationsRes);
        }

        setIsLoading(false);
        setIsRefreshing(false);
    };

    const handleRequestPayout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || Number(amount) <= 0) {
            toast.error('Ingrese un monto válido');
            return;
        }
        if (!bankName || !accountNumber || !accountName) {
            toast.error('Complete los datos bancarios');
            return;
        }

        setIsRequesting(true);
        try {
            const bankDetails = { bankName, accountNumber, accountName };
            await axios.post(`${API_URL}/payouts/request`, {
                amount: Number(amount),
                bankDetails
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            toast.success('Solicitud de retiro enviada');
            setAmount('');
            fetchWalletData(true);
        } catch (error) {
            const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error al solicitar retiro';
            toast.error(msg);
        } finally {
            setIsRequesting(false);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-emerald-100 text-emerald-700 font-medium';
            case 'processing': return 'bg-amber-100 text-amber-700 font-medium';
            case 'rejected': return 'bg-red-100 text-red-700 font-medium';
            default: return 'bg-blue-100 text-blue-700 font-medium';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="w-4 h-4" />;
            case 'processing': return <Clock className="w-4 h-4 animate-pulse" />;
            case 'rejected': return <XCircle className="w-4 h-4" />;
            default: return <Clock className="w-4 h-4" />;
        }
    };

    if (isLoading) {
        return (
            <AdminLayout>
                <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-4 border-rotary-blue rounded-full border-t-transparent animate-spin"></div>
                </div>
            </AdminLayout>
        );
    }

    const currencyUpper = (balanceData?.currency || 'USD').toUpperCase();

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-8">

                {loadError && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{loadError}</span>
                    </div>
                )}

                {/* Header info */}
                <div className="bg-rotary-blue rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-rotary-blue/20">
                    <div className="absolute top-0 right-0 p-12 opacity-10">
                        <Wallet className="w-64 h-64 rotate-12" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-start justify-between mb-2">
                            <h2 className="text-xl font-medium text-blue-100">Fondo Disponible para Retiro</h2>
                            <button
                                onClick={() => fetchWalletData(true)}
                                disabled={isRefreshing}
                                className="text-blue-100 hover:text-white p-2 -mt-1 -mr-1 rounded-lg hover:bg-white/10 transition-all disabled:opacity-50"
                                title="Actualizar"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <div className="text-5xl md:text-7xl font-black mb-6">
                            ${fmtUSD(balanceData?.availableBalance)}
                            <span className="text-2xl font-bold text-blue-200 ml-2">{currencyUpper}</span>
                        </div>

                        <div className="flex flex-wrap gap-6 text-sm">
                            <div className="bg-white/10 rounded-xl py-3 px-5 backdrop-blur-sm border border-white/10">
                                <span className="text-blue-200 block mb-1">Total Recaudado Bruto</span>
                                <span className="font-bold text-lg">${fmtUSD(balanceData?.totalCollected)}</span>
                            </div>
                            <div className="bg-white/10 rounded-xl py-3 px-5 backdrop-blur-sm border border-white/10">
                                <span className="text-blue-200 block mb-1">En Tránsito / Entregado</span>
                                <span className="font-bold text-lg">${fmtUSD(balanceData?.totalRequested)}</span>
                            </div>
                            <div className="bg-white/10 rounded-xl py-3 px-5 backdrop-blur-sm border border-white/10">
                                <span className="text-blue-200 block mb-1">Aportes Recibidos</span>
                                <span className="font-bold text-lg">{donations.length} · ${fmtUSD(donationsTotal)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Aportes Recibidos (v4.412) */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <Heart className="w-5 h-5 text-[#9D2235]" />
                            Aportes Recibidos
                        </h3>
                        <span className="text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                            {donations.length} {donations.length === 1 ? 'donación' : 'donaciones'}
                        </span>
                    </div>

                    {donations.length === 0 ? (
                        <div className="text-center text-gray-400 py-10">
                            <Heart className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="text-sm">Todavía no hay aportes registrados.</p>
                            <p className="text-xs mt-1">Cuando un donante complete el pago vía Stripe, aparecerá acá automáticamente.</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                            {donations.map(donation => (
                                <div key={donation.id} className="flex items-start gap-4 p-4 rounded-2xl border border-gray-100 bg-gradient-to-r from-gray-50 to-white hover:from-white hover:shadow-sm transition-all">
                                    <div className="w-10 h-10 rounded-full bg-[#9D2235]/10 flex items-center justify-center flex-shrink-0">
                                        <Heart className="w-5 h-5 text-[#9D2235]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <div className="font-bold text-gray-900">
                                                {donation.isAnonymous
                                                    ? <span className="text-gray-500 italic">Donante Anónimo</span>
                                                    : (donation.donorName || donation.donorEmail || 'Donante')}
                                            </div>
                                            <div className="font-black text-xl text-[#9D2235]">
                                                ${fmtUSD(donation.amount)} <span className="text-xs font-bold text-gray-400">{donation.currency || 'USD'}</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-3">
                                            <span>
                                                {new Date(donation.date).toLocaleString('es-CO', {
                                                    dateStyle: 'medium',
                                                    timeStyle: 'short'
                                                })}
                                            </span>
                                            {!donation.isAnonymous && donation.donorEmail && (
                                                <span className="flex items-center gap-1">
                                                    <Mail className="w-3 h-3" /> {donation.donorEmail}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1 text-emerald-600">
                                                <CheckCircle2 className="w-3 h-3" /> Completado
                                            </span>
                                            <span className="text-gray-300 font-mono">#{donation.id.slice(-8).toUpperCase()}</span>
                                        </div>
                                        {donation.message && (
                                            <div className="mt-2 flex items-start gap-2 bg-amber-50 border-l-2 border-amber-300 rounded-r-lg px-3 py-2 text-sm text-gray-700">
                                                <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                                                <span className="italic">"{donation.message}"</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Request Form */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm sticky top-8">
                            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <ArrowUpRight className="w-5 h-5 text-rotary-blue" />
                                Solicitar Retiro
                            </h3>

                            <form onSubmit={handleRequestPayout} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Monto a retirar (USD)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={balanceData?.availableBalance}
                                        step="0.01"
                                        value={amount}
                                        onChange={(e) => setAmount(Number(e.target.value))}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rotary-blue focus:ring-2 focus:ring-rotary-blue/20 transition-all font-bold text-lg text-gray-900"
                                        placeholder="Ej: 50.00"
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> Máximo disponible: ${fmtUSD(balanceData?.availableBalance)}
                                    </p>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-rotary-gold" />
                                        Datos Bancarios de Destino
                                    </h4>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Nombre del Banco</label>
                                        <input
                                            type="text"
                                            value={bankName}
                                            onChange={(e) => setBankName(e.target.value)}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:border-rotary-blue transition-all"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Número de Cuenta / IBAN</label>
                                        <input
                                            type="text"
                                            value={accountNumber}
                                            onChange={(e) => setAccountNumber(e.target.value)}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:border-rotary-blue transition-all font-mono"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Titular de la Cuenta</label>
                                        <input
                                            type="text"
                                            value={accountName}
                                            onChange={(e) => setAccountName(e.target.value)}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:border-rotary-blue transition-all"
                                            required
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isRequesting || (balanceData?.availableBalance || 0) <= 0}
                                    className="w-full pt-4 h-12 bg-gray-900 hover:bg-black text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                                >
                                    {isRequesting ? (
                                        <div className="w-5 h-5 border-2 border-white rounded-full border-t-transparent animate-spin"></div>
                                    ) : (
                                        <>Subir Petición</>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* History List */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm h-full max-h-[700px] flex flex-col">
                            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-gray-400" />
                                Historial de Solicitudes
                            </h3>

                            {payouts.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-12">
                                    <Wallet className="w-12 h-12 mb-4 opacity-20" />
                                    <p>No has realizado solicitudes de retiro todavía.</p>
                                </div>
                            ) : (
                                <div className="overflow-y-auto pr-2 space-y-4">
                                    {payouts.map(payout => (
                                        <div key={payout.id} className="p-5 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-white transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">

                                            <div>
                                                <div className="font-bold text-xl text-gray-900 tracking-tight">
                                                    ${fmtUSD(payout.amount)} <span className="text-xs text-gray-500 uppercase">{payout.currency}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {new Date(payout.createdAt).toLocaleDateString('es-ES', {
                                                        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </div>
                                                {payout.notes && (
                                                    <div className="mt-2 text-sm text-gray-600 italic bg-gray-100 px-3 py-1.5 rounded-lg inline-block">
                                                        " {payout.notes} "
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-col items-end gap-2 text-right">
                                                <div className={`px-3 py-1 rounded-full text-xs flex items-center gap-1.5 ${getStatusStyle(payout.status)}`}>
                                                    {getStatusIcon(payout.status)}
                                                    <span className="uppercase tracking-wider">{
                                                        payout.status === 'pending' ? 'En Revisión' :
                                                            payout.status === 'processing' ? 'Procesando Depósito' :
                                                                payout.status === 'completed' ? 'Completado' : 'Rechazado'
                                                    }</span>
                                                </div>

                                                {payout.bankDetails && (
                                                    <div className="text-xs text-gray-400 flex items-center gap-1">
                                                        <Building2 className="w-3 h-3" />
                                                        {(() => {
                                                            try {
                                                                const b = JSON.parse(payout.bankDetails);
                                                                return `${b.bankName} - *${b.accountNumber.slice(-4)}`;
                                                            } catch {
                                                                return 'Detalles bancarios ocultos';
                                                            }
                                                        })()}
                                                    </div>
                                                )}
                                            </div>

                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </AdminLayout>
    );
}
