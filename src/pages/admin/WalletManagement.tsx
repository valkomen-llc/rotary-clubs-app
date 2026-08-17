import { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Wallet, ArrowUpRight, Clock, CheckCircle2, XCircle, Building2, AlertCircle, Heart, Mail, MessageSquare, RefreshCw, Plane, Hourglass, Send, Ban } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { useLang } from '../../contexts/LanguageContext';
import { formatMoney } from '../../lib/locale';
import { toast } from 'sonner';

// v4.841 — Un saldo por MONEDA. Hasta v4.840 la pantalla recibía un escalar
// que el servidor había armado sumando dólares con pesos, y lo pintaba con un
// «$» escrito a mano delante.
interface CurrencyBalance {
    currency: string;
    decimals: number;
    availableBalance: number;
    totalCollected: number;
    totalGross: number;
    totalRequested: number;
}

interface BalanceData {
    byCurrency?: CurrencyBalance[];
    unreconciled?: { currency: string; amount: number }[];
    // Campos sueltos que el servidor conserva sobre la moneda principal. La
    // pantalla nueva no los usa; están para un navegador con el bundle
    // anterior en caché.
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

// v4.421 — Wallet sincronizada con Stripe
interface WalletItem {
    id: string;
    providerRef: string | null;
    amount: number;        // net final para el club
    grossAmount: number;   // monto pagado por el donante
    stripeFee?: number;    // v4.422 — fee Stripe explícito
    netStripe?: number;    // v4.422 — net después de Stripe
    applicationFee: number; // fee Valkomen (5%)
    fee: number;           // total fees (stripe + valkomen)
    currency: string;
    status: string;
    stripeStatus: string | null;
    availableOn: string | null;
    clubAvailableOn: string | null;
    paymentMethod: string | null;
    stripeBalanceTxId: string | null;
    createdAt: string;
}
interface WalletBucket { total: number; count: number; items: WalletItem[]; }
interface WalletBuckets {
    processing: WalletBucket;
    in_transit: WalletBucket;
    available_soon: WalletBucket;
    available: WalletBucket;
    refunded: WalletBucket;
    failed: WalletBucket;
}
interface WalletSummary {
    grossTotal: number;
    netTotal: number;
    feesTotal: number;
    inTransit: number;
    availableSoon: number;
    availableForWithdrawal: number;
    transferred: number;
    requested: number;
    refunded: number;
}
/** La bóveda de UNA moneda. Ninguna cifra de acá cruza con la de al lado. */
interface CurrencyWallet {
    currency: string;
    decimals: number;
    buckets: WalletBuckets;
    summary: WalletSummary;
}
interface WalletData {
    wallets?: CurrencyWallet[];
    currencies?: string[];
    currency: string;
    buckets: WalletBuckets;
    summary: WalletSummary;
    platformHoldingDays: number;
}

/**
 * El importe con SU moneda, siempre.
 *
 * v4.841 — Reemplaza a `fmtUSD`, que imprimía cualquier importe con formato
 * anglosajón y un «$» escrito a mano delante: los 50.000 pesos salían como
 * «$50,000.00», con separador de miles inglés y dos decimales que el peso
 * colombiano no usa. `formatMoney` es el formateador del sitio y ya sabe qué
 * monedas se escriben sin céntimos.
 *
 * No lleva `lang`: lo toma del idioma activo. Por eso el componente que la
 * use tiene que suscribirse con `useLang()`, o se queda con el formato
 * anterior hasta el siguiente repintado.
 */
const money = (n: number | null | undefined, currency: string) =>
    formatMoney(Number(n ?? 0), currency || 'USD');

const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function WalletManagement() {
    const { token } = useAuth();
    const { club } = useClub();
    // El formateo de importes depende del idioma activo. Sin esta suscripción,
    // cambiar de idioma dejaría las cifras con el formato anterior hasta que
    // algo más repintara la pantalla.
    useLang();
    const API_URL = import.meta.env.VITE_API_URL || '/api';

    const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
    const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
    const [donations, setDonations] = useState<DonationRecord[]>([]);
    const [donationTotals, setDonationTotals] = useState<{ currency: string; totalAmount: number; totalCount: number }[]>([]);
    const [wallet, setWallet] = useState<WalletData | null>(null); // v4.421 — Stripe sync
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false); // v4.422 — sync retroactivo

    // Form states
    const [amount, setAmount] = useState<number | ''>('');
    // v4.841 — El retiro es EN UNA MONEDA y hay que decir cuál. Sin este campo
    // el servidor guardaba toda solicitud como USD por el valor por omisión de
    // la columna, dijera lo que dijera el cobro que la originó.
    const [payoutCurrency, setPayoutCurrency] = useState('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState('');

    useEffect(() => {
        if (token && club?.id) {
            fetchWalletData();
        }
    }, [token, club?.id]);

    // La moneda del retiro arranca en la primera que tenga saldo. Se elige sola
    // una vez y no vuelve a pisar lo que el usuario haya cambiado después.
    useEffect(() => {
        if (payoutCurrency) return;
        const first = (balanceData?.byCurrency || []).find(b => b.availableBalance > 0)
            || (balanceData?.byCurrency || [])[0];
        if (first) setPayoutCurrency(first.currency);
    }, [balanceData, payoutCurrency]);

    const fetchWalletData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        setIsRefreshing(true);
        setLoadError(null);
        const headers = { 'Authorization': `Bearer ${token}` };

        // Defensive: each endpoint resuelve independiente. Si /donations falla
        // (router no montado en algún env), balance + payouts siguen mostrándose.
        const [balanceRes, payoutsRes, donationsRes, walletRes] = await Promise.allSettled([
            axios.get(`${API_URL}/payouts/balance?clubId=${club?.id}`, { headers }),
            axios.get(`${API_URL}/payouts/history?clubId=${club?.id}`, { headers }),
            axios.get(`${API_URL}/financial/donations?clubId=${club?.id}`, { headers }),
            axios.get(`${API_URL}/financial/wallet?clubId=${club?.id}`, { headers }), // v4.421 — buckets Stripe
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
            setDonationTotals(donationsRes.value.data.byCurrency || []);
        } else {
            setDonations([]);
            setDonationTotals([]);
            console.error('[Wallet] donations fetch failed:', donationsRes);
        }

        if (walletRes.status === 'fulfilled' && walletRes.value.data?.summary) {
            setWallet(walletRes.value.data);
        } else {
            setWallet(null);
            console.error('[Wallet] wallet sync fetch failed:', walletRes);
        }

        setIsLoading(false);
        setIsRefreshing(false);
    };

    // v4.422 — Sincroniza Payments antiguos con Stripe (fee real, availableOn, etc.)
    const handleSyncStripe = async (force = false) => {
        if (!token || !club?.id) return;
        setIsSyncing(true);
        try {
            const res = await axios.post(`${API_URL}/financial/wallet/sync-stripe`,
                { clubId: club.id, force },
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const { synced, failed, skipped, total } = res.data;
            if (total === 0) {
                toast.info('Todos los aportes ya están sincronizados con Stripe');
            } else {
                toast.success(`Sincronizados ${synced}/${total} aportes${failed ? ` · ${failed} fallaron` : ''}${skipped ? ` · ${skipped} sin balance tx aún` : ''}`);
            }
            await fetchWalletData(true);
        } catch (err) {
            const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
                || 'Error sincronizando con Stripe';
            toast.error(message);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleRequestPayout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!payoutCurrency) {
            toast.error('Elegí la moneda del retiro');
            return;
        }
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
                // La moneda viaja siempre. El servidor la valida contra el
                // saldo de ESA moneda; no hay valor por omisión.
                currency: payoutCurrency,
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

    // v4.841 — Las monedas en las que este club tiene algo. Si el servidor
    // todavía no manda `byCurrency` —un despliegue a medias— se arma una sola
    // entrada con los campos sueltos, que ya vienen de UNA moneda.
    const balances: CurrencyBalance[] = balanceData?.byCurrency?.length
        ? balanceData.byCurrency
        : balanceData
            ? [{
                currency: balanceData.currency || 'USD',
                decimals: 2,
                availableBalance: balanceData.availableBalance || 0,
                totalCollected: balanceData.totalCollected || 0,
                totalGross: balanceData.totalCollected || 0,
                totalRequested: balanceData.totalRequested || 0,
            }]
            : [];

    const wallets: CurrencyWallet[] = wallet?.wallets?.length
        ? wallet.wallets
        : wallet
            ? [{ currency: wallet.currency, decimals: 2, buckets: wallet.buckets, summary: wallet.summary }]
            : [];

    const donationsOf = (code: string) => donations.filter(d => (d.currency || 'USD') === code);
    const selected = balances.find(b => b.currency === payoutCurrency) || null;

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-8">

                {loadError && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{loadError}</span>
                    </div>
                )}

                {/* v4.841 — Una tarjeta por moneda. Antes había UN número aquí y
                    era la suma de las dos: «$47.507,75» eran 8,91 dólares más
                    47.498,84 pesos. */}
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Bóveda de Fondos</h2>
                    <button
                        onClick={() => fetchWalletData(true)}
                        disabled={isRefreshing}
                        className="text-gray-400 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-all disabled:opacity-50"
                        title="Actualizar"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {balances.length === 0 ? (
                    <div className="bg-rotary-blue rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-rotary-blue/20">
                        <div className="absolute top-0 right-0 p-12 opacity-10">
                            <Wallet className="w-64 h-64 rotate-12" />
                        </div>
                        <div className="relative z-10">
                            <h3 className="text-xl font-medium text-blue-100 mb-2">Fondo Disponible para Retiro</h3>
                            <div className="text-5xl md:text-7xl font-black">—</div>
                            <p className="text-blue-100 text-sm mt-4">
                                Todavía no hay aportes registrados en ninguna moneda.
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className={`grid gap-6 ${balances.length === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                            {balances.map(b => {
                                const w = wallets.find(x => x.currency === b.currency);
                                const dons = donationsOf(b.currency);
                                return (
                                    <div key={b.currency} className="bg-rotary-blue rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-rotary-blue/20">
                                        <div className="absolute top-0 right-0 p-12 opacity-10">
                                            <Wallet className="w-56 h-56 rotate-12" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="flex items-baseline gap-2 mb-1">
                                                <span
                                                    className="text-xs font-black tracking-[0.15em] bg-white/15 rounded-md px-2 py-1"
                                                    data-no-translate
                                                >
                                                    {b.currency}
                                                </span>
                                                <h3 className="text-lg font-medium text-blue-100">Disponible para Retiro</h3>
                                            </div>
                                            <div className="text-4xl md:text-5xl font-black mb-6 mt-2" data-no-translate>
                                                {money(b.availableBalance, b.currency)}
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div className="bg-white/10 rounded-xl py-3 px-4 backdrop-blur-sm border border-white/10">
                                                    <span className="text-blue-200 block mb-1 text-xs">Recibido bruto</span>
                                                    <span className="font-bold" data-no-translate>{money(b.totalGross, b.currency)}</span>
                                                </div>
                                                <div className="bg-white/10 rounded-xl py-3 px-4 backdrop-blur-sm border border-white/10">
                                                    <span className="text-blue-200 block mb-1 text-xs">Neto acreditado</span>
                                                    <span className="font-bold" data-no-translate>{money(b.totalCollected, b.currency)}</span>
                                                </div>
                                                <div className="bg-white/10 rounded-xl py-3 px-4 backdrop-blur-sm border border-white/10">
                                                    <span className="text-blue-200 block mb-1 text-xs">Retiros solicitados</span>
                                                    <span className="font-bold" data-no-translate>{money(b.totalRequested, b.currency)}</span>
                                                </div>
                                                <div className="bg-white/10 rounded-xl py-3 px-4 backdrop-blur-sm border border-white/10">
                                                    <span className="text-blue-200 block mb-1 text-xs">Aportes recibidos</span>
                                                    <span className="font-bold" data-no-translate>
                                                        {dons.length} · {money(
                                                            donationTotals.find(t => t.currency === b.currency)?.totalAmount ?? 0,
                                                            b.currency,
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            {w && w.summary.inTransit > 0 && b.availableBalance === 0 && (
                                                <p className="text-blue-100 text-xs mt-4 flex items-start gap-1.5">
                                                    <Hourglass className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                                    <span>
                                                        Hay <b data-no-translate>{money(w.summary.inTransit, b.currency)}</b> en tránsito.
                                                        Stripe todavía no los liberó.
                                                    </span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {balances.length > 1 && (
                            <p className="text-xs text-gray-500 flex items-start gap-1.5 -mt-4">
                                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                                <span>
                                    Son saldos <b>independientes</b> y no se suman entre sí. Cada retiro
                                    se solicita en su propia moneda.
                                </span>
                            </p>
                        )}

                        {/* Un retiro en una moneda en la que el club nunca recibió
                            nada no se puede conciliar: se DICE, no se descarta. */}
                        {(balanceData?.unreconciled?.length ?? 0) > 0 && (
                            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <span>
                                    Hay retiros registrados en{' '}
                                    <b data-no-translate>
                                        {balanceData?.unreconciled?.map(u => `${money(u.amount, u.currency)}`).join(' · ')}
                                    </b>
                                    , una moneda en la que este sitio no ha recibido aportes. No se
                                    descuentan de ningún saldo hasta resolver a qué cobro corresponden.
                                </span>
                            </div>
                        )}
                    </>
                )}

                {/* v4.421 — Estado financiero sincronizado con Stripe.
                    v4.841 — Un juego de cubetas POR MONEDA. */}
                {wallets.length > 0 && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Estado del dinero</h3>
                            {/* v4.422 — Botón sync para enriquecer Payments viejos con datos reales de Stripe */}
                            <button
                                onClick={() => handleSyncStripe(false)}
                                disabled={isSyncing}
                                title="Consulta Stripe para actualizar fees reales y fechas de disponibilidad de los aportes existentes"
                                className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-lg border border-purple-100 transition-all disabled:opacity-50 disabled:cursor-wait"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                                {isSyncing ? 'Sincronizando…' : 'Sincronizar con Stripe'}
                            </button>
                        </div>

                        {wallets.map(w => {
                            const inProcess = [
                                ...w.buckets.processing.items.map(it => ({ ...it, bucket: 'processing' as const })),
                                ...w.buckets.in_transit.items.map(it => ({ ...it, bucket: 'in_transit' as const })),
                                ...w.buckets.available_soon.items.map(it => ({ ...it, bucket: 'available_soon' as const })),
                                ...w.buckets.refunded.items.map(it => ({ ...it, bucket: 'refunded' as const })),
                                ...w.buckets.failed.items.map(it => ({ ...it, bucket: 'failed' as const })),
                            ];
                            return (
                                <div key={w.currency} className="space-y-3">
                                    {wallets.length > 1 && (
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="text-[10px] font-black tracking-[0.15em] bg-gray-900 text-white rounded px-2 py-1"
                                                data-no-translate
                                            >
                                                {w.currency}
                                            </span>
                                            <div className="h-px flex-1 bg-gray-200" />
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <WalletBucketCard
                                            color="amber"
                                            icon={<Hourglass className="w-5 h-5" />}
                                            label="En Tránsito"
                                            total={w.summary.inTransit}
                                            currency={w.currency}
                                            count={w.buckets.in_transit.count + w.buckets.processing.count}
                                            hint="Stripe procesando el pago"
                                        />
                                        <WalletBucketCard
                                            color="sky"
                                            icon={<Plane className="w-5 h-5" />}
                                            label="Disponible Próximamente"
                                            total={w.summary.availableSoon}
                                            currency={w.currency}
                                            count={w.buckets.available_soon.count}
                                            hint={`Liberación en ~${wallet?.platformHoldingDays ?? 6} días`}
                                        />
                                        <WalletBucketCard
                                            color="emerald"
                                            icon={<CheckCircle2 className="w-5 h-5" />}
                                            label="Disponible para Retiro"
                                            total={w.summary.availableForWithdrawal}
                                            currency={w.currency}
                                            count={w.buckets.available.count}
                                            hint="Lista para solicitar payout"
                                        />
                                        <WalletBucketCard
                                            color="indigo"
                                            icon={<Send className="w-5 h-5" />}
                                            label="Transferido"
                                            total={w.summary.transferred}
                                            currency={w.currency}
                                            count={payouts.filter(p => p.status === 'completed' && (p.currency || 'USD') === w.currency).length}
                                            hint="Payouts completados al banco"
                                        />
                                    </div>

                                    {inProcess.length > 0 && (
                                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                                            <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-gray-400" />
                                                Movimientos en proceso
                                                <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full ml-1">
                                                    Sincronizado con Stripe
                                                </span>
                                            </h3>
                                            <div className="space-y-2">
                                                {inProcess.map(item => (
                                                    <WalletTxRow key={item.id} item={item} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Aportes Recibidos (v4.412) */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <Heart className="w-5 h-5 text-[#9D2235]" />
                            Aportes Recibidos
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 justify-end">
                            {/* Un total por moneda. Nunca uno solo: «2 · $50.010,00»
                                era 10 dólares más 50.000 pesos. */}
                            {donationTotals.map(t => (
                                <span
                                    key={t.currency}
                                    className="text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full"
                                    data-no-translate
                                >
                                    {t.totalCount} · {money(t.totalAmount, t.currency)}
                                </span>
                            ))}
                            {donationTotals.length === 0 && (
                                <span className="text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                                    {donations.length} {donations.length === 1 ? 'donación' : 'donaciones'}
                                </span>
                            )}
                        </div>
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
                                            <div className="font-black text-xl text-[#9D2235]" data-no-translate>
                                                {money(donation.amount, donation.currency || 'USD')}
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
                                {/* v4.841 — La moneda primero: es la que decide contra
                                    qué saldo se valida el monto. */}
                                <div>
                                    <label htmlFor="payout-currency" className="block text-sm font-bold text-gray-700 mb-2">
                                        Moneda del retiro
                                    </label>
                                    <select
                                        id="payout-currency"
                                        value={payoutCurrency}
                                        onChange={(e) => { setPayoutCurrency(e.target.value); setAmount(''); }}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rotary-blue focus:ring-2 focus:ring-rotary-blue/20 transition-all font-bold text-gray-900 bg-white"
                                        required
                                    >
                                        {balances.length === 0 && <option value="">Sin aportes recibidos</option>}
                                        {balances.map(b => (
                                            <option key={b.currency} value={b.currency}>
                                                {b.currency} — {money(b.availableBalance, b.currency)} disponible
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label htmlFor="payout-amount" className="block text-sm font-bold text-gray-700 mb-2">
                                        Monto a retirar {payoutCurrency && <span data-no-translate>({payoutCurrency})</span>}
                                    </label>
                                    <input
                                        id="payout-amount"
                                        type="number"
                                        min={selected?.decimals === 0 ? '1' : '0.01'}
                                        max={selected?.availableBalance || undefined}
                                        // Una moneda sin céntimos no admite decimales, y el
                                        // servidor rechaza el importe que los traiga.
                                        step={selected?.decimals === 0 ? '1' : '0.01'}
                                        value={amount}
                                        onChange={(e) => setAmount(Number(e.target.value))}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-rotary-blue focus:ring-2 focus:ring-rotary-blue/20 transition-all font-bold text-lg text-gray-900"
                                        placeholder={selected?.decimals === 0 ? 'Ej: 50000' : 'Ej: 50.00'}
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        <span>
                                            Máximo disponible:{' '}
                                            <b data-no-translate>{money(selected?.availableBalance, selected?.currency || payoutCurrency)}</b>
                                        </span>
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
                                    disabled={isRequesting || (selected?.availableBalance || 0) <= 0}
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
                                                <div className="font-bold text-xl text-gray-900 tracking-tight" data-no-translate>
                                                    {money(payout.amount, payout.currency)}
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

// v4.421 — Tarjeta de bucket en el header de la Bóveda.
type BucketColor = 'amber' | 'sky' | 'emerald' | 'indigo' | 'red';
function WalletBucketCard({ color, icon, label, total, currency, count, hint }: {
    color: BucketColor;
    icon: React.ReactNode;
    label: string;
    total: number;
    currency: string;
    count: number;
    hint: string;
}) {
    const palette: Record<BucketColor, { bg: string; text: string; accent: string }> = {
        amber:   { bg: 'bg-amber-50',   text: 'text-amber-900',   accent: 'text-amber-600' },
        sky:     { bg: 'bg-sky-50',     text: 'text-sky-900',     accent: 'text-sky-600' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-900', accent: 'text-emerald-600' },
        indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-900',  accent: 'text-indigo-600' },
        red:     { bg: 'bg-red-50',     text: 'text-red-900',     accent: 'text-red-600' },
    };
    const p = palette[color];
    return (
        <div className={`${p.bg} rounded-2xl p-5 border border-gray-100`}>
            <div className={`flex items-center gap-2 ${p.accent} mb-3`}>
                {icon}
                <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
            </div>
            <div className={`text-3xl font-black ${p.text} leading-none mb-1`} data-no-translate>
                {money(total, currency)}
            </div>
            <div className="text-xs text-gray-500 font-medium mt-2">
                {count} {count === 1 ? 'movimiento' : 'movimientos'} · {hint}
            </div>
        </div>
    );
}

// v4.421 — Una fila por transacción con badge de estado + fechas estimadas
// v4.422 — Desglose completo de fees: Bruto → Stripe fee → Net Stripe → Valkomen 5% → Net Club
function WalletTxRow({ item }: { item: WalletItem & { bucket: 'processing' | 'in_transit' | 'available_soon' | 'refunded' | 'failed' } }) {
    const BADGES: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
        processing:     { label: 'En procesamiento',      bg: 'bg-gray-100',    text: 'text-gray-700',    icon: <Hourglass className="w-3 h-3" /> },
        in_transit:     { label: 'En tránsito',           bg: 'bg-amber-100',   text: 'text-amber-800',   icon: <Plane className="w-3 h-3" /> },
        available_soon: { label: 'Disponible próximamente', bg: 'bg-sky-100',   text: 'text-sky-800',     icon: <Clock className="w-3 h-3" /> },
        refunded:       { label: 'Reembolsado',           bg: 'bg-red-50',      text: 'text-red-700',     icon: <Ban className="w-3 h-3" /> },
        failed:         { label: 'Fallido',               bg: 'bg-red-100',     text: 'text-red-800',     icon: <XCircle className="w-3 h-3" /> },
    };
    const badge = BADGES[item.bucket];
    const ref = item.id.slice(-8).toUpperCase();
    const dateLabel = item.bucket === 'available_soon' && item.clubAvailableOn
        ? `Liberación: ${fmtDate(item.clubAvailableOn)}`
        : item.bucket === 'in_transit' && item.availableOn
            ? `Stripe libera: ${fmtDate(item.availableOn)}`
            : null;

    const stripeFee = item.stripeFee ?? Math.max(0, item.grossAmount - item.amount - item.applicationFee);
    // El porcentaje real de ESTE movimiento, no la constante de la plataforma:
    // la tasa puede cambiar por moneda, país o método de pago, y escribir «5%»
    // a mano afirmaba un número que el propio dato podía desmentir.
    const feePct = item.grossAmount > 0
        ? Math.round((item.applicationFee / item.grossAmount) * 1000) / 10
        : null;
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left"
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${badge.bg} ${badge.text} flex-shrink-0`}>
                        {badge.icon}
                        {badge.label}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-500 font-medium truncate">
                            {fmtDate(item.createdAt)}
                            {dateLabel && <span className="ml-2 text-gray-400">· {dateLabel}</span>}
                            <span className="ml-2 text-gray-300 font-mono">#{ref}</span>
                        </div>
                    </div>
                </div>
                <div className="text-right flex-shrink-0">
                    <div className="font-bold text-sm text-gray-900" data-no-translate>
                        {money(item.amount, item.currency)}
                    </div>
                    <div className="text-[10px] text-gray-400">
                        bruto <span data-no-translate>{money(item.grossAmount, item.currency)}</span>
                        {' − comisiones '}
                        <span data-no-translate>{money(item.grossAmount - item.amount, item.currency)}</span>
                    </div>
                </div>
            </button>

            {/* v4.422 — desglose detallado expandible */}
            {expanded && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                    <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                        <div className="flex justify-between text-gray-700">
                            <span>Monto pagado por el donante</span>
                            <span className="font-mono font-semibold text-gray-900" data-no-translate>{money(item.grossAmount, item.currency)}</span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                            <span>− Tarifa de procesamiento de Stripe</span>
                            <span className="font-mono" data-no-translate>−{money(stripeFee, item.currency)}</span>
                        </div>
                        <div className="flex justify-between text-gray-500">
                            {/* v4.841 — El porcentaje se CALCULA sobre este movimiento;
                                estaba escrito «(5%)» a mano. Y el rótulo dice lo que
                                el cobro es: la comisión de la plataforma por recaudar.
                                NO es una tasa de cambio ni una comisión interbancaria
                                —se cobra igual sobre un aporte en dólares, donde no
                                hay conversión ninguna—. El costo real de conversión
                                existe, hoy no se mide, y separarlo es la Fase 4. */}
                            <span>− Comisión de la plataforma{feePct !== null && <span data-no-translate> ({feePct}%)</span>}</span>
                            <span className="font-mono" data-no-translate>−{money(item.applicationFee, item.currency)}</span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-gray-200 font-bold text-gray-900">
                            <span>Neto para el club</span>
                            <span className="font-mono" data-no-translate>{money(item.amount, item.currency)}</span>
                        </div>
                        <div className="pt-2 flex flex-wrap gap-3 text-[10px] text-gray-400">
                            {item.paymentMethod && <span>Método: {item.paymentMethod}</span>}
                            {item.stripeBalanceTxId && <span className="font-mono">tx: {item.stripeBalanceTxId.slice(-12)}</span>}
                            {item.stripeStatus && <span>Stripe status: {item.stripeStatus}</span>}
                            {item.availableOn && <span>Available on: {fmtDate(item.availableOn)}</span>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
