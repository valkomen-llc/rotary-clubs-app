import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Wallet, ArrowUpRight, Clock, CheckCircle2, XCircle, Building2, AlertCircle,
    Mail, MessageSquare, RefreshCw, Send, Calendar, Tag, Info,
    FileSpreadsheet, FileText, Loader2, Landmark, CheckSquare, Square,
    Filter, Search, Download, ChevronRight, ChevronDown, User, ShieldCheck,
    Plus, ExternalLink, HelpCircle, ArrowRight, Layers, DollarSign, Eye, Phone, Share2
} from 'lucide-react';
import DisbursementSection from '../../components/admin/wallet/DisbursementSection';
import BulkDisbursementBar, { type Elegible } from '../../components/admin/wallet/BulkDisbursementBar';
import BulkReconciliationBar from '../../components/admin/wallet/BulkReconciliationBar';
import DisbursementBatchModal from '../../components/admin/wallet/DisbursementBatchModal';
import ResendNoticeModal from '../../components/admin/wallet/ResendNoticeModal';
import { selectionClassOf } from '../../lib/reconciliationSpec';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { useLang } from '../../contexts/LanguageContext';
import { useSiteAccess } from '../../hooks/useSiteAccess';
import { formatMoney } from '../../lib/locale';
import { toast } from 'sonner';

const PROJECT_FAIR_CLUB_ID = '322c2f88-ad33-484d-bb54-272de9262d72';

interface PaymentItem {
    id: string;
    providerRef: string | null;
    amount: number;        // net final para el club/evento
    grossAmount: number;   // monto pagado por el donante/participante
    stripeFee: number;
    applicationFee: number;
    fee: number;
    currency: string;
    decimals: number;
    status: string;
    stripeStatus: string | null;
    availableOn: string | null;
    clubAvailableOn: string | null;
    paymentMethod: string | null;
    stripeBalanceTxId: string | null;
    rawPayload: any;
    createdAt: string;
    bucket: 'processing' | 'in_transit' | 'available_soon' | 'available' | 'disbursing' | 'disbursed' | 'refunded' | 'failed';
    financialBucket: string;
    disbursedAmount: number;
    lifecycle?: any;
}

interface CurrencyWallet {
    currency: string;
    decimals: number;
    buckets: Record<string, { total: number; count: number; items: PaymentItem[] }>;
    summary: {
        grossTotal: number;
        netTotal: number;
        feesTotal: number;
        inTransit: number;
        availableSoon: number;
        availableForWithdrawal: number;
        disbursed: number;
        disbursedCount: number;
        disbursedLast: string | null;
        transferred: number;
        requested: number;
        refunded: number;
    };
}

interface WalletData {
    wallets?: CurrencyWallet[];
    currencies?: string[];
    currency: string;
    summary: CurrencyWallet['summary'];
    platformHoldingDays: number;
}

interface BatchItem {
    id: string;
    reference: string;
    beneficiary: string;
    currency: string;
    count: number;
    grossAmount: number;
    netAmount: number;
    fees: number;
    disbursedAt: string;
    status: string;
    receiptName: string | null;
    notifyState: string | null;
    notifyEmails: string[] | null;
    notifyPhones: string[] | null;
    createdByName: string | null;
}

interface NoticeItem {
    id: string;
    clubId: string;
    batchId: string | null;
    scope: string;
    beneficiary: string;
    currency: string;
    count: number;
    netAmount: number;
    emails: string[] | null;
    phones: string[] | null;
    results: any[] | null;
    sentAt: string;
    createdAt: string;
}

interface AuditEvent {
    id: string;
    paymentId: string;
    kind: string;
    fromState: string | null;
    toState: string | null;
    actorKind: string;
    actorLabel: string | null;
    reference: string | null;
    note: string | null;
    occurredAt: string;
    currency?: string;
    amount?: number;
    netAmount?: number;
    source?: string;
    description?: string;
}

interface Beneficiary {
    id: string;
    legalName: string;
    tradeName: string | null;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    contactName: string | null;
    notes: string | null;
    active: boolean;
}

const money = (n: number | null | undefined, c: string) =>
    formatMoney(Number(n ?? 0), c || 'USD');

const fmtFecha = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
};

const fmtFechaHora = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('es-CO', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return iso; }
};

export default function ConciliacionesDesembolsos() {
    const { token, user } = useAuth();
    const { club } = useClub();
    const acceso = useSiteAccess();
    const puedeGestionar = !acceso.restricted || acceso.can('finance.manage');
    useLang();

    const API_URL = import.meta.env.VITE_API_URL || '/api';
    const clubIdActivo = club?.id || user?.clubId || PROJECT_FAIR_CLUB_ID;

    const [searchParams, setSearchParams] = useSearchParams();
    const tabActiva = (searchParams.get('tab') || 'resumen') as
        | 'resumen' | 'movimientos' | 'conciliaciones' | 'desembolsos' | 'comprobantes' | 'auditoria' | 'configuracion';

    const setTab = (tab: string) => {
        setSearchParams(prev => {
            const p = new URLSearchParams(prev);
            p.set('tab', tab);
            return p;
        });
    };

    // Data States
    const [walletData, setWalletData] = useState<WalletData | null>(null);
    const [batches, setBatches] = useState<BatchItem[]>([]);
    const [notices, setNotices] = useState<NoticeItem[]>([]);
    const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
    const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isReconciling, setIsReconciling] = useState(false);
    const [isRebuilding, setIsRebuilding] = useState(false);
    const [reconcileReport, setReconcileReport] = useState<any>(null);
    const [rebuildReport, setRebuildReport] = useState<any>(null);

    // Filters for Tab 2 (Movimientos e Ingresos)
    const [filtroFuente, setFiltroFuente] = useState<'todos' | 'postulacion' | 'inscripcion'>('todos');
    const [filtroMoneda, setFiltroMoneda] = useState<string>('todas');
    const [filtroEstado, setFiltroEstado] = useState<string>('todos');
    const [filtroBusqueda, setFiltroBusqueda] = useState<string>('');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Selection for bulk actions
    const [elegidos, setElegidos] = useState<Record<string, Elegible>>({});

    // Modals
    const [batchAbierto, setBatchAbierto] = useState<string | null>(null);
    const [resendPaymentIds, setResendPaymentIds] = useState<string[] | null>(null);
    const [cierreModalOpen, setCierreModalOpen] = useState(false);
    const [cierreStatement, setCierreStatement] = useState<any>(null);
    const [nuevoBeneficiarioModal, setNuevoBeneficiarioModal] = useState(false);
    const [editingBeneficiary, setEditingBeneficiary] = useState<Beneficiary | null>(null);

    // Beneficiary form state
    const [benForm, setBenForm] = useState({
        legalName: '',
        tradeName: '',
        taxId: '',
        email: '',
        phone: '',
        contactName: '',
        notes: '',
        active: true
    });

    const fetchAllData = useCallback(async (silent = false) => {
        if (!token || !clubIdActivo) return;
        if (!silent) setIsLoading(true);
        setIsRefreshing(true);

        const headers = { Authorization: `Bearer ${token}` };

        try {
            const [walletRes, batchesRes, noticesRes, auditRes, benRes] = await Promise.allSettled([
                axios.get(`${API_URL}/financial/wallet?clubId=${clubIdActivo}`, { headers }),
                axios.get(`${API_URL}/financial/wallet/disbursement-batches?clubId=${clubIdActivo}`, { headers }),
                axios.get(`${API_URL}/financial/wallet/notices?clubId=${clubIdActivo}`, { headers }),
                axios.get(`${API_URL}/financial/wallet/audit-events?clubId=${clubIdActivo}`, { headers }),
                axios.get(`${API_URL}/financial/wallet/beneficiaries?clubId=${clubIdActivo}`, { headers }),
            ]);

            if (walletRes.status === 'fulfilled' && walletRes.value.data) {
                setWalletData(walletRes.value.data);
            }
            if (batchesRes.status === 'fulfilled' && Array.isArray(batchesRes.value.data?.batches)) {
                setBatches(batchesRes.value.data.batches);
            }
            if (noticesRes.status === 'fulfilled' && Array.isArray(noticesRes.value.data?.notices)) {
                setNotices(noticesRes.value.data.notices);
            }
            if (auditRes.status === 'fulfilled' && Array.isArray(auditRes.value.data?.events)) {
                setAuditEvents(auditRes.value.data.events);
            }
            if (benRes.status === 'fulfilled' && Array.isArray(benRes.value.data?.beneficiaries)) {
                setBeneficiaries(benRes.value.data.beneficiaries);
            }
        } catch (e: any) {
            console.error('[CONCILIACIONES] Error cargando datos:', e);
            toast.error('Error cargando información financiera');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [API_URL, clubIdActivo, token]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // Flatten all payments across currency wallets
    const allPayments = useMemo<PaymentItem[]>(() => {
        if (!walletData?.wallets) return [];
        const list: PaymentItem[] = [];
        for (const w of walletData.wallets) {
            for (const bucketKey of Object.keys(w.buckets)) {
                const b = w.buckets[bucketKey];
                if (b?.items?.length) {
                    for (const item of b.items) {
                        // Evitar duplicados si un pago aparece en múltiples agregaciones
                        if (!list.some(p => p.id === item.id)) {
                            list.push(item);
                        }
                    }
                }
            }
        }
        return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [walletData]);

    // Filtered payments for Tab 2
    const filteredPayments = useMemo(() => {
        return allPayments.filter(p => {
            const payload = p.rawPayload || {};
            const source = payload.source || '';

            // Filtro por fuente
            if (filtroFuente === 'postulacion' && source !== 'project_fair_submission') return false;
            if (filtroFuente === 'inscripcion' && source !== 'event_registration') return false;

            // Filtro por moneda
            if (filtroMoneda !== 'todas' && p.currency !== filtroMoneda) return false;

            // Filtro por estado
            if (filtroEstado !== 'todos') {
                if (filtroEstado === 'disponible' && p.bucket !== 'available') return false;
                if (filtroEstado === 'desembolsado' && p.bucket !== 'disbursed' && p.bucket !== 'disbursing') return false;
                if (filtroEstado === 'transito' && p.bucket !== 'in_transit' && p.bucket !== 'available_soon') return false;
            }

            // Búsqueda libre
            if (filtroBusqueda.trim()) {
                const q = filtroBusqueda.toLowerCase().trim();
                const terminos = [
                    p.id,
                    p.providerRef || '',
                    payload.projectTitle || '',
                    payload.participantName || '',
                    payload.clubName || '',
                    payload.district || '',
                    payload.registrationCode || '',
                    payload.category || '',
                    payload.customNotes || '',
                ].join(' ').toLowerCase();

                if (!terminos.includes(q)) return false;
            }

            return true;
        });
    }, [allPayments, filtroFuente, filtroMoneda, filtroEstado, filtroBusqueda]);

    // Currency wallets separated: COP and USD
    const copWallet = useMemo(() => walletData?.wallets?.find(w => w.currency === 'COP'), [walletData]);
    const usdWallet = useMemo(() => walletData?.wallets?.find(w => w.currency === 'USD'), [walletData]);

    // Selection classification for bulk bars
    const seleccion = useMemo(() => {
        const lista = Object.values(elegidos);
        const trasladados = lista.filter(e => e.clase === 'trasladado');
        const disponibles = lista.filter(e => e.clase !== 'trasladado');
        return {
            disponibles,
            trasladados,
            mezclada: disponibles.length > 0 && trasladados.length > 0
        };
    }, [elegidos]);

    const cambiarEleccion = useCallback((e: Elegible, marcado: boolean) => {
        setElegidos(prev => {
            const next = { ...prev };
            if (marcado) next[e.paymentId] = e;
            else delete next[e.paymentId];
            return next;
        });
    }, []);

    const toggleSelectAll = () => {
        if (Object.keys(elegidos).length === filteredPayments.length && filteredPayments.length > 0) {
            setElegidos({});
        } else {
            const next: Record<string, Elegible> = {};
            for (const p of filteredPayments) {
                const restante = Math.max(0, p.amount - (p.disbursedAmount || 0));
                const clase = selectionClassOf({
                    amount: p.amount,
                    currency: p.currency,
                    bucket: p.bucket,
                    disbursedAmount: p.disbursedAmount,
                });
                const payload = p.rawPayload || {};
                const titulo = payload.projectTitle || payload.participantName || `#${p.id.slice(-6)}`;
                next[p.id] = {
                    paymentId: p.id,
                    restante,
                    currency: p.currency,
                    titulo,
                    clase,
                };
            }
            setElegidos(next);
        }
    };

    // Actions
    const handleSyncStripe = async () => {
        if (!token || !clubIdActivo) return;
        setIsSyncing(true);
        try {
            const res = await axios.post(`${API_URL}/financial/wallet/sync-stripe`,
                { clubId: clubIdActivo, force: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const { synced, total } = res.data;
            toast.success(`Sincronización completada: ${synced}/${total} transacciones actualizadas con Stripe.`);
            await fetchAllData(true);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Error sincronizando con Stripe');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleRebuild = async (aplicar: boolean) => {
        if (!token || !clubIdActivo) return;
        setIsRebuilding(true);
        try {
            const res = await axios.post(`${API_URL}/financial/wallet/rebuild-collections`,
                { clubId: clubIdActivo, apply: aplicar },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setRebuildReport({ ...res.data, modo: aplicar ? 'aplicado' : 'ensayo' });
            if (aplicar) {
                toast.success(`Reconstrucción exitosa: ${res.data.reconstruidos} pagos integrados.`);
                await fetchAllData(true);
            } else {
                toast.info(`Ensayo completado: ${res.data.reconstruidos} cobros identificados.`);
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Error reconstruyendo cobros de la Feria');
        } finally {
            setIsRebuilding(false);
        }
    };

    const handleReconcile = async (aplicar: boolean) => {
        if (!token || !clubIdActivo) return;
        setIsReconciling(true);
        try {
            const res = await axios.post(`${API_URL}/financial/wallet/reconcile`,
                { clubId: clubIdActivo, apply: aplicar },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setReconcileReport(res.data);
            if (aplicar) {
                toast.success(`Conciliación ejecutada: ${res.data.corregidos || 0} estados actualizados.`);
                await fetchAllData(true);
            } else {
                toast.info(`Ensayo de conciliación completado. Revise el reporte antes de aplicar.`);
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Error ejecutando la conciliación');
        } finally {
            setIsReconciling(false);
        }
    };

    const handleLoadCierre = async () => {
        if (!token || !clubIdActivo) return;
        try {
            const res = await axios.get(`${API_URL}/financial/wallet/closing-statement?clubId=${clubIdActivo}&edition=valledupar2027`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setCierreStatement(res.data.statement);
            setCierreModalOpen(true);
        } catch (e: any) {
            toast.error('No se pudo generar el estado de cierre financiero.');
        }
    };

    const handleSaveBeneficiary = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!benForm.legalName.trim()) {
            toast.error('El nombre legal o institucional es obligatorio');
            return;
        }
        try {
            await axios.post(`${API_URL}/financial/wallet/beneficiaries`,
                {
                    id: editingBeneficiary?.id,
                    ...benForm,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(editingBeneficiary ? 'Beneficiario actualizado' : 'Beneficiario registrado');
            setNuevoBeneficiarioModal(false);
            setEditingBeneficiary(null);
            await fetchAllData(true);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Error guardando beneficiario');
        }
    };

    return (
        <AdminLayout
            title="Conciliaciones y Desembolsos"
            subtitle="XII Feria de Proyectos Rotarios Colombia — Valledupar 2027"
        >
            <div className="space-y-6">

                {/* ── CABECERA INSTITUCIONAL CON KPIs RÁPIDOS Y ACCIONES ──────────────── */}
                <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-sky-800/40">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                        <div>
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse" />
                                    Producción Oficial
                                </span>
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-200 border border-sky-500/30">
                                    <Landmark className="w-3.5 h-3.5 mr-1.5" />
                                    Edición: Valledupar 2027
                                </span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                                Centro de Conciliaciones y Desembolsos
                            </h1>
                            <p className="text-sm text-sky-200/80 mt-1 max-w-3xl">
                                Gestión financiera institucional de recaudos provenientes de <strong>Postulaciones de Proyectos</strong> e <strong>Inscripciones al Evento</strong>, conciliación con pasarela Stripe y registro auditable de traslados a beneficiarios autorizados.
                            </p>
                        </div>

                        {/* Botones de Acción Global */}
                        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                            <button
                                onClick={handleSyncStripe}
                                disabled={isSyncing || !puedeGestionar}
                                className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow transition-all disabled:opacity-50"
                                title="Sincroniza transacciones con balance de Stripe"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                                {isSyncing ? 'Sincronizando…' : 'Sincronizar Stripe'}
                            </button>

                            <button
                                onClick={() => handleRebuild(false)}
                                disabled={isRebuilding || !puedeGestionar}
                                className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-400/30 shadow transition-all disabled:opacity-50"
                                title="Audita o reconstruye pagos de la Feria"
                            >
                                <Layers className="w-3.5 h-3.5 mr-2" />
                                {isRebuilding ? 'Revisando…' : 'Revisar Cobros'}
                            </button>

                            <button
                                onClick={handleLoadCierre}
                                className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-all"
                            >
                                <FileSpreadsheet className="w-3.5 h-3.5 mr-2" />
                                Cierre Financiero
                            </button>

                            <button
                                onClick={() => fetchAllData(false)}
                                disabled={isRefreshing}
                                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-sky-200 border border-slate-700 transition-all"
                                title="Recargar datos"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Resumen Superior Rápido */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-sky-800/40 text-xs">
                        <div>
                            <span className="text-sky-300/70 block uppercase tracking-wider text-[10px]">Total Transacciones</span>
                            <span className="text-lg font-bold text-white mt-0.5 block">{allPayments.length} registradas</span>
                        </div>
                        <div>
                            <span className="text-sky-300/70 block uppercase tracking-wider text-[10px]">Recaudo Neto (COP)</span>
                            <span className="text-lg font-bold text-emerald-300 mt-0.5 block">
                                {money(copWallet?.summary.netTotal || 0, 'COP')}
                            </span>
                        </div>
                        <div>
                            <span className="text-sky-300/70 block uppercase tracking-wider text-[10px]">Recaudo Neto (USD)</span>
                            <span className="text-lg font-bold text-emerald-300 mt-0.5 block">
                                {money(usdWallet?.summary.netTotal || 0, 'USD')}
                            </span>
                        </div>
                        <div>
                            <span className="text-sky-300/70 block uppercase tracking-wider text-[10px]">Traslados Realizados</span>
                            <span className="text-lg font-bold text-amber-300 mt-0.5 block">{batches.length} giros</span>
                        </div>
                    </div>
                </div>

                {/* ── NAVEGACIÓN POR LAS 7 PESTAÑAS ──────────────────────────── */}
                <div className="border-b border-gray-200 bg-white rounded-xl shadow-sm px-4 pt-2">
                    <nav className="flex space-x-2 sm:space-x-6 overflow-x-auto scrollbar-none" aria-label="Tabs">
                        {[
                            { id: 'resumen', label: '1. Resumen Financiero', icon: Wallet },
                            { id: 'movimientos', label: `2. Movimientos e Ingresos (${filteredPayments.length})`, icon: ArrowUpRight },
                            { id: 'conciliaciones', label: '3. Conciliaciones', icon: CheckCircle2 },
                            { id: 'desembolsos', label: `4. Desembolsos (${batches.length})`, icon: Landmark },
                            { id: 'comprobantes', label: `5. Comprobantes (${notices.length})`, icon: FileText },
                            { id: 'auditoria', label: `6. Auditoría (${auditEvents.length})`, icon: Clock },
                            { id: 'configuracion', label: '7. Configuración', icon: Building2 },
                        ].map((t) => {
                            const Icon = t.icon;
                            const isActive = tabActiva === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => setTab(t.id)}
                                    className={`flex items-center gap-2 py-3.5 px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition-colors ${
                                        isActive
                                            ? 'border-sky-600 text-sky-700 font-semibold'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                                >
                                    <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-gray-400'}`} />
                                    {t.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* ══════════════════════════════════════════════════════════════
                    PESTAÑA 1: RESUMEN FINANCIERO (DISEÑO PROPUESTO IMAGEN 2)
                    ══════════════════════════════════════════════════════════════ */}
                {tabActiva === 'resumen' && (
                    <div className="space-y-6">

                        {/* Tarjeta Flujo Operativo (4 Pasos - Imagen 2) */}
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                            <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-sky-600" />
                                Flujo Operativo Institucional
                            </h2>
                            <p className="text-xs text-gray-500 mb-5">
                                Proceso estandarizado desde el recaudo hasta la entrega del comprobante al beneficiario.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                                    <span className="w-7 h-7 rounded-lg bg-sky-100 text-sky-800 font-bold flex items-center justify-center text-xs shrink-0">1</span>
                                    <div>
                                        <h3 className="font-semibold text-xs text-gray-900">Recaudo</h3>
                                        <p className="text-[11px] text-gray-500 mt-0.5">Eventos y postulaciones de proyectos.</p>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                                    <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-800 font-bold flex items-center justify-center text-xs shrink-0">2</span>
                                    <div>
                                        <h3 className="font-semibold text-xs text-gray-900">Conciliación</h3>
                                        <p className="text-[11px] text-gray-500 mt-0.5">Validación de pagos y liquidaciones.</p>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                                    <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs shrink-0">3</span>
                                    <div>
                                        <h3 className="font-semibold text-xs text-gray-900">Desembolso</h3>
                                        <p className="text-[11px] text-gray-500 mt-0.5">Registro de transferencias realizadas.</p>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3">
                                    <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0">4</span>
                                    <div>
                                        <h3 className="font-semibold text-xs text-gray-900">Notificación</h3>
                                        <p className="text-[11px] text-gray-500 mt-0.5">Comprobantes por correo y WhatsApp.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Columnas Financieras Multimoneda Estrictamente Separadas */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* Panel COP */}
                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-900">COP</span>
                                            <h3 className="text-base font-bold text-gray-900">Pesos Colombianos</h3>
                                        </div>
                                        <span className="text-xs text-gray-500 font-medium">11 cobros procesados</span>
                                    </div>

                                    <div className="space-y-3.5 text-xs">
                                        <div className="flex justify-between items-center py-1">
                                            <span className="text-gray-500">Recaudo Bruto Confirmado</span>
                                            <span className="text-gray-900 font-bold text-sm">
                                                {money(copWallet?.summary.grossTotal || 0, 'COP')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1 text-rose-600">
                                            <span className="text-gray-500">Comisiones Proveedor (Stripe / Plat.)</span>
                                            <span className="font-semibold">
                                                −{money(copWallet?.summary.feesTotal || 0, 'COP')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1 pt-2 border-t border-slate-100 font-bold">
                                            <span className="text-gray-700">Recaudo Neto Total</span>
                                            <span className="text-emerald-700 text-sm">
                                                {money(copWallet?.summary.netTotal || 0, 'COP')}
                                            </span>
                                        </div>

                                        <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-100 space-y-2 mt-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sky-900 font-semibold">Fondos Disponibles para Traslado</span>
                                                <span className="text-sky-800 font-extrabold text-sm">
                                                    {money(copWallet?.summary.availableForWithdrawal || 0, 'COP')}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-[11px] text-sky-700/80">
                                                <span>En proceso o retención temporal</span>
                                                <span>{money((copWallet?.summary.inTransit || 0) + (copWallet?.summary.availableSoon || 0), 'COP')}</span>
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center py-1">
                                            <span className="text-gray-500">Total Desembolsado a Beneficiarios</span>
                                            <span className="text-gray-900 font-bold">
                                                {money(copWallet?.summary.disbursed || 0, 'COP')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1 text-amber-700">
                                            <span>Saldo Pendiente de Desembolso</span>
                                            <span className="font-bold">
                                                {money(Math.max(0, (copWallet?.summary.netTotal || 0) - (copWallet?.summary.disbursed || 0)), 'COP')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => { setFiltroMoneda('COP'); setTab('movimientos'); }}
                                    className="mt-6 w-full py-2.5 px-4 rounded-xl border border-sky-200 text-sky-700 hover:bg-sky-50 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                                >
                                    Ver movimientos en COP
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Panel USD */}
                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-900">USD</span>
                                            <h3 className="text-base font-bold text-gray-900">Dólares Americanos</h3>
                                        </div>
                                        <span className="text-xs text-gray-500 font-medium">14 cobros procesados</span>
                                    </div>

                                    <div className="space-y-3.5 text-xs">
                                        <div className="flex justify-between items-center py-1">
                                            <span className="text-gray-500">Recaudo Bruto Confirmado</span>
                                            <span className="text-gray-900 font-bold text-sm">
                                                {money(usdWallet?.summary.grossTotal || 0, 'USD')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1 text-rose-600">
                                            <span className="text-gray-500">Comisiones Proveedor (Stripe / Plat.)</span>
                                            <span className="font-semibold">
                                                −{money(usdWallet?.summary.feesTotal || 0, 'USD')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1 pt-2 border-t border-slate-100 font-bold">
                                            <span className="text-gray-700">Recaudo Neto Total</span>
                                            <span className="text-emerald-700 text-sm">
                                                {money(usdWallet?.summary.netTotal || 0, 'USD')}
                                            </span>
                                        </div>

                                        <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-100 space-y-2 mt-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sky-900 font-semibold">Fondos Disponibles para Traslado</span>
                                                <span className="text-sky-800 font-extrabold text-sm">
                                                    {money(usdWallet?.summary.availableForWithdrawal || 0, 'USD')}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-[11px] text-sky-700/80">
                                                <span>En proceso o retención temporal</span>
                                                <span>{money((usdWallet?.summary.inTransit || 0) + (usdWallet?.summary.availableSoon || 0), 'USD')}</span>
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center py-1">
                                            <span className="text-gray-500">Total Desembolsado a Beneficiarios</span>
                                            <span className="text-gray-900 font-bold">
                                                {money(usdWallet?.summary.disbursed || 0, 'USD')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center py-1 text-amber-700">
                                            <span>Saldo Pendiente de Desembolso</span>
                                            <span className="font-bold">
                                                {money(Math.max(0, (usdWallet?.summary.netTotal || 0) - (usdWallet?.summary.disbursed || 0)), 'USD')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => { setFiltroMoneda('USD'); setTab('movimientos'); }}
                                    className="mt-6 w-full py-2.5 px-4 rounded-xl border border-sky-200 text-sky-700 hover:bg-sky-50 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                                >
                                    Ver movimientos en USD
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Banner Cierre Financiero (Recomendación Imagen 2) */}
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h3 className="font-bold text-sm text-amber-950 flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-amber-700" />
                                    Cierre Financiero Consolidado por Edición
                                </h3>
                                <p className="text-xs text-amber-800/90 mt-1 max-w-2xl leading-relaxed">
                                    Al culminar la XII Feria de Proyectos Rotarios — Valledupar 2027, genere el acta y reporte consolidado de ingresos por postulaciones, inscripciones, comisiones, transferencias efectuadas y saldos entregados al comité organizador.
                                </p>
                            </div>
                            <button
                                onClick={handleLoadCierre}
                                className="px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs shadow-sm whitespace-nowrap transition-colors"
                            >
                                Ver Estado de Cierre
                            </button>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    PESTAÑA 2: MOVIMIENTOS E INGRESOS (TABLA UNIFICADA)
                    ══════════════════════════════════════════════════════════════ */}
                {tabActiva === 'movimientos' && (
                    <div className="space-y-4">

                        {/* Barra de Filtros y Búsqueda */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre, club, ref…"
                                        value={filtroBusqueda}
                                        onChange={(e) => setFiltroBusqueda(e.target.value)}
                                        className="pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-sky-500 w-48 sm:w-64"
                                    />
                                </div>

                                <select
                                    value={filtroFuente}
                                    onChange={(e) => setFiltroFuente(e.target.value as any)}
                                    className="py-1.5 px-3 text-xs border border-gray-200 rounded-lg text-gray-700 focus:ring-1 focus:ring-sky-500"
                                >
                                    <option value="todos">Todas las Fuentes</option>
                                    <option value="postulacion">Postulaciones de Proyectos</option>
                                    <option value="inscripcion">Inscripciones al Evento</option>
                                </select>

                                <select
                                    value={filtroMoneda}
                                    onChange={(e) => setFiltroMoneda(e.target.value)}
                                    className="py-1.5 px-3 text-xs border border-gray-200 rounded-lg text-gray-700 focus:ring-1 focus:ring-sky-500"
                                >
                                    <option value="todas">Todas las Monedas</option>
                                    <option value="COP">Solo COP</option>
                                    <option value="USD">Solo USD</option>
                                </select>

                                <select
                                    value={filtroEstado}
                                    onChange={(e) => setFiltroEstado(e.target.value)}
                                    className="py-1.5 px-3 text-xs border border-gray-200 rounded-lg text-gray-700 focus:ring-1 focus:ring-sky-500"
                                >
                                    <option value="todos">Todos los Estados</option>
                                    <option value="disponible">Disponible para Retiro</option>
                                    <option value="desembolsado">Desembolsado</option>
                                    <option value="transito">En Tránsito / Liquidación</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2 self-end md:self-auto text-xs text-gray-500">
                                <span>Mostrando <strong>{filteredPayments.length}</strong> de {allPayments.length} pagos</span>
                            </div>
                        </div>

                        {/* Barras de Selección en Bloque */}
                        {seleccion.disponibles.length > 0 && (
                            <BulkDisbursementBar
                                elegidos={seleccion.disponibles}
                                clubId={clubIdActivo}
                                onLimpiar={() => setElegidos({})}
                                onHecho={() => { setElegidos({}); fetchAllData(true); }}
                                onRecargar={() => fetchAllData(true)}
                            />
                        )}

                        {seleccion.trasladados.length > 0 && (
                            <BulkReconciliationBar
                                elegidos={seleccion.trasladados}
                                clubId={clubIdActivo}
                                onLimpiar={() => setElegidos({})}
                                onHecho={() => { setElegidos({}); fetchAllData(true); }}
                            />
                        )}

                        {/* Tabla de Movimientos */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50 text-gray-600 font-semibold border-b border-slate-200">
                                        <tr>
                                            <th className="p-3 w-8">
                                                <button onClick={toggleSelectAll} className="text-gray-500 hover:text-gray-700">
                                                    {Object.keys(elegidos).length === filteredPayments.length && filteredPayments.length > 0
                                                        ? <CheckSquare className="w-4 h-4 text-sky-600" />
                                                        : <Square className="w-4 h-4 text-gray-400" />}
                                                </button>
                                            </th>
                                            <th className="p-3">Origen / Fuente</th>
                                            <th className="p-3">Responsable / Participante</th>
                                            <th className="p-3">Club y Distrito</th>
                                            <th className="p-3">Detalle / Proyecto</th>
                                            <th className="p-3 text-right">Bruto</th>
                                            <th className="p-3 text-right">Comisión</th>
                                            <th className="p-3 text-right">Neto Evento</th>
                                            <th className="p-3 text-center">Estado</th>
                                            <th className="p-3 text-right">Fecha</th>
                                            <th className="p-3 text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredPayments.length === 0 ? (
                                            <tr>
                                                <td colSpan={11} className="p-8 text-center text-gray-400">
                                                    No se encontraron movimientos financieros con los filtros seleccionados.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredPayments.map((p) => {
                                                const payload = p.rawPayload || {};
                                                const isPostulacion = payload.source === 'project_fair_submission';
                                                const isInscripcion = payload.source === 'event_registration';
                                                const isSelected = !!elegidos[p.id];
                                                const restante = Math.max(0, p.amount - (p.disbursedAmount || 0));
                                                const clase = selectionClassOf({
                                                    amount: p.amount,
                                                    currency: p.currency,
                                                    bucket: p.bucket,
                                                    disbursedAmount: p.disbursedAmount,
                                                });
                                                const titulo = payload.projectTitle || payload.participantName || `#${p.id.slice(-6)}`;

                                                return (
                                                    <tr
                                                        key={p.id}
                                                        className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-sky-50/40' : ''}`}
                                                    >
                                                        <td className="p-3">
                                                            <button
                                                                onClick={() => cambiarEleccion({
                                                                    paymentId: p.id,
                                                                    restante,
                                                                    currency: p.currency,
                                                                    titulo,
                                                                    clase,
                                                                }, !isSelected)}
                                                                className="text-gray-500 hover:text-gray-700"
                                                            >
                                                                {isSelected
                                                                    ? <CheckSquare className="w-4 h-4 text-sky-600" />
                                                                    : <Square className="w-4 h-4 text-gray-300" />}
                                                            </button>
                                                        </td>
                                                        <td className="p-3 whitespace-nowrap">
                                                            {isPostulacion && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                                    Postulación
                                                                </span>
                                                            )}
                                                            {isInscripcion && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                    Inscripción
                                                                </span>
                                                            )}
                                                            {!isPostulacion && !isInscripcion && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                                                                    General
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-3 font-medium text-gray-900">
                                                            <div>{payload.participantName || payload.contactName || 'Participante'}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">{payload.email || p.providerRef?.slice(0, 16) || p.id.slice(0, 8)}</div>
                                                        </td>
                                                        <td className="p-3 text-gray-600">
                                                            <div>{payload.clubName || '—'}</div>
                                                            <div className="text-[10px] text-gray-400">{payload.district ? `Distrito ${payload.district}` : '—'}</div>
                                                        </td>
                                                        <td className="p-3 text-gray-700 max-w-xs truncate" title={payload.projectTitle || payload.category || ''}>
                                                            {payload.projectTitle || payload.category || 'Registro general'}
                                                        </td>
                                                        <td className="p-3 text-right font-semibold text-gray-900">
                                                            {money(p.grossAmount, p.currency)}
                                                        </td>
                                                        <td className="p-3 text-right text-rose-600">
                                                            −{money(p.fee, p.currency)}
                                                        </td>
                                                        <td className="p-3 text-right font-bold text-emerald-700">
                                                            {money(p.amount, p.currency)}
                                                        </td>
                                                        <td className="p-3 text-center whitespace-nowrap">
                                                            {p.bucket === 'available' && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                                                    Disponible
                                                                </span>
                                                            )}
                                                            {(p.bucket === 'disbursed' || p.bucket === 'disbursing') && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                                                                    Desembolsado
                                                                </span>
                                                            )}
                                                            {(p.bucket === 'in_transit' || p.bucket === 'available_soon' || p.bucket === 'processing') && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                                                                    En Tránsito
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-right text-gray-500 whitespace-nowrap">
                                                            {fmtFecha(p.createdAt)}
                                                        </td>
                                                        <td className="p-3 text-center whitespace-nowrap">
                                                            <button
                                                                onClick={() => setExpandedRow(expandedRow === p.id ? null : p.id)}
                                                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] transition-colors"
                                                            >
                                                                {expandedRow === p.id ? 'Ocultar' : 'Detalles'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Drawer / Ficha Expandida de Ciclo de Vida y Desembolso */}
                        {expandedRow && (
                            <div className="bg-slate-50 border border-slate-300 rounded-2xl p-6 shadow-md transition-all">
                                <div className="flex justify-between items-center pb-4 border-b border-slate-200 mb-4">
                                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                        <Landmark className="w-4 h-4 text-sky-700" />
                                        Ficha Financiera y Ciclo de Vida: ID #{expandedRow.slice(-8)}
                                    </h3>
                                    <button
                                        onClick={() => setExpandedRow(null)}
                                        className="text-gray-400 hover:text-gray-600 text-xs font-semibold"
                                    >
                                        Cerrar Detalle ✕
                                    </button>
                                </div>

                                {(() => {
                                    const mov = allPayments.find(p => p.id === expandedRow);
                                    if (!mov) return null;
                                    return (
                                        <DisbursementSection
                                            paymentId={mov.id}
                                            clubId={clubIdActivo}
                                            netAmount={mov.amount}
                                            currency={mov.currency}
                                        />
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    PESTAÑA 3: CONCILIACIONES
                    ══════════════════════════════════════════════════════════════ */}
                {tabActiva === 'conciliaciones' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-slate-100">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">Conciliación con Liquidaciones de Stripe</h2>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Comparación automática entre los registros de recaudo de la Feria y las liquidaciones y balance transactions reportadas por el procesador de pagos.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleReconcile(false)}
                                        disabled={isReconciling || !puedeGestionar}
                                        className="px-4 py-2 rounded-xl border border-sky-300 text-sky-800 hover:bg-sky-50 font-semibold text-xs transition-colors disabled:opacity-50"
                                    >
                                        {isReconciling ? 'Analizando…' : '1. Ensayo de Conciliación'}
                                    </button>
                                    <button
                                        onClick={() => handleReconcile(true)}
                                        disabled={isReconciling || !puedeGestionar}
                                        className="px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                                    >
                                        {isReconciling ? 'Aplicando…' : '2. Aplicar Conciliación'}
                                    </button>
                                </div>
                            </div>

                            {/* Resumen del Reporte si existe */}
                            {reconcileReport && (
                                <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                                    <div className="flex items-center justify-between font-bold text-gray-800">
                                        <span>Modo: {reconcileReport.modo === 'aplicado' ? 'APLICADO EN BASE DE DATOS' : 'ENSAYO (Solo lectura)'}</span>
                                        <span>Tiempo: {reconcileReport.elapsedMs} ms</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                                        <div>Revisados: <strong>{reconcileReport.revisados}</strong></div>
                                        <div>Corregidos: <strong className="text-emerald-700">{reconcileReport.corregidos}</strong></div>
                                        <div>Anotados: <strong className="text-sky-700">{reconcileReport.anotados}</strong></div>
                                        <div>Sin cambio: <strong>{reconcileReport.sinCambio}</strong></div>
                                    </div>
                                </div>
                            )}

                            {/* Detalle de Movimientos para Conciliar */}
                            <div className="mt-6 space-y-3">
                                <h3 className="font-semibold text-xs text-gray-800 uppercase tracking-wider">
                                    Pagos pendientes de conciliación definitiva o en tránsito
                                </h3>
                                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                                    {allPayments.filter(p => p.bucket === 'in_transit' || p.bucket === 'available_soon').length === 0 ? (
                                        <div className="p-6 text-center text-xs text-emerald-700 bg-emerald-50/50">
                                            ✓ Todos los movimientos confirmados se encuentran al día con sus liquidaciones.
                                        </div>
                                    ) : (
                                        allPayments.filter(p => p.bucket === 'in_transit' || p.bucket === 'available_soon').map(p => (
                                            <div key={p.id} className="p-3.5 flex justify-between items-center text-xs hover:bg-slate-50">
                                                <div>
                                                    <span className="font-semibold text-gray-900">{p.rawPayload?.projectTitle || p.rawPayload?.participantName || p.id}</span>
                                                    <div className="text-[11px] text-gray-500">Ref Stripe: {p.providerRef || 'Pendiente balance tx'}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-gray-900">{money(p.amount, p.currency)}</div>
                                                    <div className="text-[10px] text-amber-700">Liberación estimada: {fmtFecha(p.availableOn)}</div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    PESTAÑA 4: DESEMBOLSOS (GIROS REALIZADOS)
                    ══════════════════════════════════════════════════════════════ */}
                {tabActiva === 'desembolsos' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-slate-100">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">Historial de Desembolsos y Traslados</h2>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Registro de transferencias bancarias efectivamente realizadas a los beneficiarios autorizados de la Feria.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setTab('movimientos')}
                                    className="px-4 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-semibold text-xs shadow-sm flex items-center gap-2 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Registrar Desembolso desde Movimientos
                                </button>
                            </div>

                            {/* Listado de Lotes de Desembolso */}
                            <div className="mt-6 divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                                {batches.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400">
                                        No hay desembolsos registrados aún para la XII Feria de Proyectos Rotarios.
                                    </div>
                                ) : (
                                    batches.map(b => (
                                        <div key={b.id} className="p-4 hover:bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sky-800">{b.reference || `#${b.id.slice(-8)}`}</span>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                                        {b.status || 'Confirmado'}
                                                    </span>
                                                </div>
                                                <div className="text-gray-900 font-semibold text-sm">
                                                    Beneficiario: {b.beneficiary}
                                                </div>
                                                <div className="text-gray-500 text-[11px] flex gap-4">
                                                    <span>Cubre: <strong>{b.count} aportes</strong></span>
                                                    <span>Fecha: {fmtFecha(b.disbursedAt)}</span>
                                                    {b.receiptName && <span className="text-sky-700">Soporte: {b.receiptName}</span>}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 self-end md:self-auto">
                                                <div className="text-right">
                                                    <div className="text-base font-extrabold text-gray-900">
                                                        {money(b.netAmount, b.currency)}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400">
                                                        {b.notifyState === 'enviado' ? 'Notificado' : 'Aviso pendiente'}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => setBatchAbierto(b.id)}
                                                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 transition-colors"
                                                >
                                                    Ver Ficha
                                                </button>

                                                <a
                                                    href={`${API_URL}/financial/wallet/disbursement-batches/${b.id}/reconciliation`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="p-1.5 rounded-lg text-sky-700 hover:bg-sky-50 border border-sky-200 transition-colors"
                                                    title="Descargar Comprobante PDF"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </a>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    PESTAÑA 5: COMPROBANTES Y NOTIFICACIONES
                    ══════════════════════════════════════════════════════════════ */}
                {tabActiva === 'comprobantes' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                            <div className="pb-5 border-b border-slate-100">
                                <h2 className="text-base font-bold text-gray-900">Comprobantes Institucionales y Trazabilidad</h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Comprobantes de traslado emitidos, enviados por correo electrónico y WhatsApp a los beneficiarios autorizados.
                                </p>
                            </div>

                            <div className="mt-6 divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                                {notices.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400">
                                        No se han emitido comprobantes ni notificaciones formales aún.
                                    </div>
                                ) : (
                                    notices.map(n => (
                                        <div key={n.id} className="p-4 hover:bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-gray-900">#{n.id.slice(-8)}</span>
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800">
                                                        {n.scope === 'traslado' ? 'Traslado Lote' : 'Consolidado'}
                                                    </span>
                                                </div>
                                                <div className="font-semibold text-gray-900 text-sm">
                                                    {n.beneficiary || 'Beneficiario Institucional'}
                                                </div>
                                                <div className="text-gray-500 text-[11px] flex flex-wrap gap-4">
                                                    <span>Monto: <strong>{money(n.netAmount, n.currency)}</strong></span>
                                                    <span>Aportes: {n.count}</span>
                                                    <span>Enviado: {fmtFechaHora(n.sentAt)}</span>
                                                    {n.emails?.length ? <span>Email: {n.emails.join(', ')}</span> : null}
                                                    {n.phones?.length ? <span>WhatsApp: {n.phones.join(', ')}</span> : null}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 self-end md:self-auto">
                                                <a
                                                    href={`${API_URL}/financial/wallet/notices/${n.id}/document`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold transition-colors flex items-center gap-1.5"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                    Ver Comprobante
                                                </a>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    PESTAÑA 6: HISTORIAL Y AUDITORÍA
                    ══════════════════════════════════════════════════════════════ */}
                {tabActiva === 'auditoria' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                            <div className="pb-5 border-b border-slate-100">
                                <h2 className="text-base font-bold text-gray-900">Registro Cronológico de Operaciones y Auditoría</h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Bitácora inmutable de cambios de estado, barridos automáticos, conciliaciones y registros de traslado (PaymentLifecycleEvent).
                                </p>
                            </div>

                            <div className="mt-6 divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                                {auditEvents.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400">
                                        No hay eventos de auditoría registrados.
                                    </div>
                                ) : (
                                    auditEvents.map(e => (
                                        <div key={e.id} className="p-3.5 hover:bg-slate-50 flex items-start justify-between gap-4 transition-colors">
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-900">
                                                        {e.description || e.note || e.kind}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700">
                                                        {e.fromState ? `${e.fromState} → ${e.toState}` : e.toState || e.kind}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-gray-500">
                                                    Responsable: <strong>{e.actorLabel || e.actorKind}</strong>
                                                    {e.reference ? ` · Ref: ${e.reference}` : ''}
                                                    {e.amount ? ` · ${money(e.amount, e.currency || 'USD')}` : ''}
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-gray-400 whitespace-nowrap self-center">
                                                {fmtFechaHora(e.occurredAt)}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    PESTAÑA 7: CONFIGURACIÓN (BENEFICIARIOS, CUENTAS Y PLANTILLAS)
                    ══════════════════════════════════════════════════════════════ */}
                {tabActiva === 'configuracion' && (
                    <div className="space-y-6">

                        {/* Beneficiarios Autorizados */}
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-slate-100">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">Beneficiarios Institucionales Autorizados</h2>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Entidades rotarias autorizadas para recibir desembolsos y traslados de la Feria de Proyectos.
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingBeneficiary(null);
                                        setBenForm({
                                            legalName: '', tradeName: '', taxId: '',
                                            email: '', phone: '', contactName: '', notes: '', active: true
                                        });
                                        setNuevoBeneficiarioModal(true);
                                    }}
                                    className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Nuevo Beneficiario
                                </button>
                            </div>

                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {beneficiaries.map(b => (
                                    <div key={b.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
                                        <div>
                                            <div className="flex justify-between items-start gap-2">
                                                <h3 className="font-bold text-gray-900 text-xs">{b.legalName}</h3>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${b.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                                                    {b.active ? 'Autorizado' : 'Inactivo'}
                                                </span>
                                            </div>
                                            {b.tradeName && <p className="text-[11px] text-gray-600 font-medium mt-0.5">{b.tradeName}</p>}
                                            {b.taxId && <p className="text-[10px] text-gray-400 mt-0.5">NIT: {b.taxId}</p>}

                                            <div className="mt-3 space-y-1 text-[11px] text-gray-600">
                                                {b.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-gray-400" /> {b.email}</p>}
                                                {b.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-gray-400" /> {b.phone}</p>}
                                                {b.contactName && <p className="flex items-center gap-1.5"><User className="w-3 h-3 text-gray-400" /> {b.contactName}</p>}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                setEditingBeneficiary(b);
                                                setBenForm({
                                                    legalName: b.legalName,
                                                    tradeName: b.tradeName || '',
                                                    taxId: b.taxId || '',
                                                    email: b.email || '',
                                                    phone: b.phone || '',
                                                    contactName: b.contactName || '',
                                                    notes: b.notes || '',
                                                    active: b.active
                                                });
                                                setNuevoBeneficiarioModal(true);
                                            }}
                                            className="w-full py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-[11px] transition-colors"
                                        >
                                            Editar Datos
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Plantillas Institucionales de Notificación */}
                        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                            <h2 className="text-base font-bold text-gray-900">Previsualización de Plantillas Oficiales</h2>
                            <p className="text-xs text-gray-500">
                                Formatos institucionales utilizados para enviar las comunicaciones de desembolso por Correo y WhatsApp.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                {/* Correo */}
                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-2">
                                    <div className="font-bold text-sky-900 flex items-center gap-2">
                                        <Mail className="w-4 h-4" />
                                        Plantilla Correo Electrónico
                                    </div>
                                    <p className="text-gray-500 text-[11px]">
                                        <strong>Asunto:</strong> Confirmación de traslado de recursos — XII Feria de Proyectos Rotarios Colombia
                                    </p>
                                    <div className="p-3 bg-white rounded border border-slate-200 font-mono text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">
{`Estimados representantes de {{beneficiary_name}}:

Desde la organización de la XII Feria de Proyectos Rotarios Colombia — Valledupar 2027, informamos que se ha registrado el traslado de recursos correspondiente al período indicado en el comprobante adjunto.

Detalle del traslado:
• Beneficiario: {{beneficiary_name}}
• Monto: {{amount}} {{currency}}
• Fecha: {{date}}
• Referencia: {{reference}}

Adjuntamos el soporte institucional para su conocimiento y control.

Comité Organizador
XII Feria de Proyectos Rotarios Colombia`}
                                    </div>
                                </div>

                                {/* WhatsApp */}
                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-2">
                                    <div className="font-bold text-emerald-900 flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" />
                                        Plantilla WhatsApp Oficial (WABA)
                                    </div>
                                    <div className="p-3 bg-white rounded border border-slate-200 font-mono text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">
{`Estimado equipo de {{beneficiary_name}}:

La organización de la XII Feria de Proyectos Rotarios Colombia ha registrado un traslado de recursos a su favor.

• Monto: {{amount}} {{currency}}
• Fecha: {{date}}
• Referencia: {{reference}}

Consulte el comprobante institucional seguro en:
{{secure_link}}

Agradecemos confirmar la recepción.`}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── MODAL FICHA DE LOTE ────────────────────────────────────── */}
                {batchAbierto && (
                    <DisbursementBatchModal
                        batchId={batchAbierto}
                        clubId={clubIdActivo}
                        onCerrar={() => setBatchAbierto(null)}
                        onReversado={() => { setBatchAbierto(null); fetchAllData(true); }}
                    />
                )}

                {/* ── MODAL REENVÍO DE CONCILIACIÓN ──────────────────────────── */}
                {resendPaymentIds && (
                    <ResendNoticeModal
                        paymentIds={resendPaymentIds}
                        clubId={clubIdActivo}
                        onCerrar={() => setResendPaymentIds(null)}
                        onEnviado={() => { setResendPaymentIds(null); fetchAllData(true); }}
                    />
                )}

                {/* ── MODAL ACTA DE CIERRE FINANCIERO ────────────────────────── */}
                {cierreModalOpen && cierreStatement && (
                    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                                <div>
                                    <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 uppercase">Acta Oficial</span>
                                    <h3 className="text-lg font-bold text-gray-900 mt-1">{cierreStatement.editionLabel}</h3>
                                    <p className="text-xs text-gray-500">Generado el: {fmtFechaHora(cierreStatement.generatedAt)}</p>
                                </div>
                                <button onClick={() => setCierreModalOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
                            </div>

                            <div className="space-y-4 text-xs">
                                <h4 className="font-bold text-gray-800 uppercase tracking-wider text-[11px]">Consolidado por Moneda</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {Object.keys(cierreStatement.byCurrency).map(cur => {
                                        const c = cierreStatement.byCurrency[cur];
                                        return (
                                            <div key={cur} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                                                <div className="font-bold text-sm text-gray-900">{cur}</div>
                                                <div className="flex justify-between"><span>Bruto Recaudado:</span> <strong>{money(c.gross, cur)}</strong></div>
                                                <div className="flex justify-between text-rose-600"><span>Comisiones Stripe/Plat:</span> <strong>−{money(c.fees, cur)}</strong></div>
                                                <div className="flex justify-between text-emerald-700 font-bold"><span>Neto Recibido:</span> <strong>{money(c.net, cur)}</strong></div>
                                                <div className="flex justify-between pt-1 border-t border-slate-200"><span>Total Desembolsado:</span> <strong>{money(c.disbursed, cur)}</strong></div>
                                                <div className="flex justify-between text-amber-700 font-bold"><span>Remanente por Transferir:</span> <strong>{money(c.pendingDisbursement, cur)}</strong></div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <h4 className="font-bold text-gray-800 uppercase tracking-wider text-[11px] pt-2">Desglose por Fuente de Ingreso</h4>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                                    <div className="flex justify-between">
                                        <span>Postulaciones de Proyectos:</span>
                                        <strong>{cierreStatement.bySource.project_fair_submission.count} registros ({money(cierreStatement.bySource.project_fair_submission.copNet, 'COP')} / {money(cierreStatement.bySource.project_fair_submission.usdNet, 'USD')})</strong>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Inscripciones al Evento:</span>
                                        <strong>{cierreStatement.bySource.event_registration.count} inscritos ({money(cierreStatement.bySource.event_registration.copNet, 'COP')} / {money(cierreStatement.bySource.event_registration.usdNet, 'USD')})</strong>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50"
                                >
                                    Imprimir Acta
                                </button>
                                <button
                                    onClick={() => setCierreModalOpen(false)}
                                    className="px-4 py-2 rounded-xl bg-sky-700 text-white font-semibold text-xs hover:bg-sky-800"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── MODAL AGREGAR/EDITAR BENEFICIARIO ──────────────────────── */}
                {nuevoBeneficiarioModal && (
                    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                                <h3 className="text-base font-bold text-gray-900">
                                    {editingBeneficiary ? 'Editar Beneficiario' : 'Registrar Beneficiario Autorizado'}
                                </h3>
                                <button onClick={() => setNuevoBeneficiarioModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
                            </div>

                            <form onSubmit={handleSaveBeneficiary} className="space-y-3.5 text-xs">
                                <div>
                                    <label className="block text-gray-700 font-semibold mb-1">Nombre Legal o Institucional *</label>
                                    <input
                                        type="text"
                                        required
                                        value={benForm.legalName}
                                        onChange={e => setBenForm({ ...benForm, legalName: e.target.value })}
                                        placeholder="Ej: Corporación Comité Organizador XII Feria"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-gray-700 font-semibold mb-1">Nombre Comercial / Corto</label>
                                        <input
                                            type="text"
                                            value={benForm.tradeName}
                                            onChange={e => setBenForm({ ...benForm, tradeName: e.target.value })}
                                            placeholder="Ej: Comité XII Feria"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-700 font-semibold mb-1">NIT / Tax ID</label>
                                        <input
                                            type="text"
                                            value={benForm.taxId}
                                            onChange={e => setBenForm({ ...benForm, taxId: e.target.value })}
                                            placeholder="Ej: 901.845.221-4"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-gray-700 font-semibold mb-1">Correo Electrónico</label>
                                        <input
                                            type="email"
                                            value={benForm.email}
                                            onChange={e => setBenForm({ ...benForm, email: e.target.value })}
                                            placeholder="tesoreria@rotary4281.org"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-700 font-semibold mb-1">Teléfono / WhatsApp</label>
                                        <input
                                            type="text"
                                            value={benForm.phone}
                                            onChange={e => setBenForm({ ...benForm, phone: e.target.value })}
                                            placeholder="+57 300 123 4567"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-gray-700 font-semibold mb-1">Responsable Financiero / Contacto</label>
                                    <input
                                        type="text"
                                        value={benForm.contactName}
                                        onChange={e => setBenForm({ ...benForm, contactName: e.target.value })}
                                        placeholder="Nombre del tesorero o presidente"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                                    />
                                </div>

                                <div>
                                    <label className="block text-gray-700 font-semibold mb-1">Observaciones / Cuentas Bancarias Autorizadas</label>
                                    <textarea
                                        rows={2}
                                        value={benForm.notes}
                                        onChange={e => setBenForm({ ...benForm, notes: e.target.value })}
                                        placeholder="Detalles institucionales de la cuenta bancaria de recepción..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => setNuevoBeneficiarioModal(false)}
                                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-semibold text-xs"
                                    >
                                        Guardar Beneficiario
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
