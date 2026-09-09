import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { Wallet, ArrowUpRight, Clock, CheckCircle2, XCircle, Building2, AlertCircle, Heart, Mail, MessageSquare, RefreshCw, Plane, Hourglass, Send, Ban, Calendar, Tag, Info, FileSpreadsheet, FileText, Loader2, ChevronLeft, Landmark, CheckSquare, Square } from 'lucide-react';
// v4.885 — El ciclo de vida del aporte: calendario de liberación, línea de
// tiempo y desembolsos. Vive aparte porque este archivo ya son 1.700 líneas
// y porque sus hooks no pueden quedar detrás de un return de `DonorCard`.
import DisbursementSection from '../../components/admin/wallet/DisbursementSection';
// v4.886 — Marcar varios aportes como desembolsados de una vez.
import BulkDisbursementBar, { type Elegible } from '../../components/admin/wallet/BulkDisbursementBar';
// v4.1014 — La conciliación de un traslado ya efectuado: la barra de acciones
// sobre aportes trasladados y el criterio de qué clase es cada aporte.
import BulkReconciliationBar from '../../components/admin/wallet/BulkReconciliationBar';
import ResendNoticeModal from '../../components/admin/wallet/ResendNoticeModal';
import { selectionClassOf, type ClaseSeleccion } from '../../lib/reconciliationSpec';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { useLang } from '../../contexts/LanguageContext';
import { formatMoney, formatNumber } from '../../lib/locale';
import { RANGOS, RANGO_DEFAULT, DESTINO_TODOS, isRango, hayFiltro, AVISO_SALDO, ESTADO_TODOS, ESTADO_LABEL, AVISO_ESTADO,
} from '../../lib/walletFilters';
import { buildInforme } from '../../lib/walletReport';
import CentralVault from '../../components/admin/CentralVault';
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

/**
 * El MOVIMIENTO de un aporte: qué se le descontó, de dónde vino y cómo se pagó.
 *
 * v4.844 — Antes esto vivía en una pestaña aparte y no había forma de saber
 * qué movimiento correspondía a qué aportante: son dos tablas que se escriben
 * seguidas en el mismo webhook y nada las ataba.
 */
/** Un envío registrado. `sent` NO es `delivered`: el primero dice que el
 *  proveedor lo aceptó y el segundo que llegó, y esa distinción es justo la que
 *  hace falta cuando alguien dice que no recibió nada. */
interface Delivery {
    id: string; recipient: string; recipientKind: string; state: string;
    subject: string | null; fromAddress: string | null;
    errorMessage: string | null; sentAt: string | null; createdAt: string;
}

/** v4.885 — El informe de la reconciliación histórica.
 *
 * `noCorregidos` y `hallazgos` se agrupan POR MOTIVO con ejemplos, no como una
 * lista plana: un listado de doscientas filas no lo lee nadie, y lo que hace
 * falta saber es qué CLASE de problema hay y cuántos aportes alcanza. */
/** v4.886 — Lo mínimo de un desembolso que la LISTA necesita: cuánto y si
 *  sigue contando. La ficha completa la pide su propio endpoint. */
interface DesembolsoResumen {
    id: string;
    amount: number;
    currency: string;
    status: string;
    /** v4.1014 — El traslado agrupado que lo cubrió. El servidor ya los mandaba
     *  desde v4.887; lo que faltaba era declararlos acá para poder usarlos. */
    batchId?: string | null;
    batchRef?: string | null;
    batchSize?: number | null;
    /** v4.1017 — Si esa marca de agrupación tiene FICHA de traslado. `false`
     *  es un giro en bloque anterior a v4.996: agrupa sus movimientos y no hay
     *  fila que abrir. Ausente en una respuesta del servidor anterior. */
    batchTracked?: boolean | null;
}

interface ReconcileReport {
    modo: 'ensayo' | 'aplicado';
    revisados: number;
    consultadosAStripe: number;
    corregidos: number;
    anotados: number;
    sinCambio: number;
    pendientes: number;
    elapsedMs: number;
    nota?: string;
    hallazgos: Record<string, { cuantos: number; ejemplos: string[] }>;
    noCorregidos: Record<string, { cuantos: number; ejemplos: string[] }>;
    detalle: Array<{ id?: string; accion?: string; antes?: string; despues?: string; error?: string; motivo?: string }>;
}

/**
 * v4.1025 — El informe de la reconstrucción de cobros.
 *
 * `porMoneda` va como mapa y NUNCA como un total: sumar COP con USD es el
 * defecto que abrió el rediseño financiero (v4.841) y acá se multiplicaría por
 * la cantidad de cobros.
 */
interface RebuildReport {
    modo: 'ensayo' | 'aplicado';
    source: string;
    mirados: number;
    reconstruidos: number;
    pendientes: number;
    porMoneda: Record<string, number>;
    ejemplos: Array<{
        ref: string; clubName: string | null; amount: number; netAmount: number;
        currency: string; basis: string | null; signal: string | null; clubId: string | null;
    }>;
    noReconstruidos: Record<string, { total: number; ejemplos: string[] }>;
    avisos: Record<string, { total: number; ejemplos: string[] }>;
    error?: string;
}

interface Movement {
    id: string;
    providerRef: string | null;
    currency: string;
    decimals: number;
    grossAmount: number;
    stripeFee: number;
    applicationFee: number;
    amount: number;
    status: string;
    stripeStatus: string | null;
    bucket: 'processing' | 'in_transit' | 'available_soon' | 'available' | 'refunded' | 'failed';
    availableOn: string | null;
    clubAvailableOn: string | null;
    createdAt: string;
    stripeBalanceTxId: string | null;
    origin: { kind: string; label: string; id: string | null } | null;
    method: { label: string; brand: string; last4: string; wallet: string } | null;
    /** v4.885 — El calendario del aporte, DERIVADO en el servidor de sus
     *  fechas: cuándo lo libera el proveedor, cuándo lo puede usar el club y
     *  cuántos días faltan. Opcional porque un navegador con el bundle nuevo
     *  puede hablar con una API todavía sin desplegar — y entonces la fila se
     *  pinta como antes en vez de reventar. */
    lifecycle?: {
        recibidoEl: string | null; stripeLiberaEl: string | null;
        disponibleEl: string | null; estimado: boolean; fuente: string | null;
        diasRestantes: number | null; liberadoEl: string | null;
        estado: string; estadoLabel: string; holdingDays: number;
    } | null;
    receiptUrl: string | null;
    receiptNumber: string | null;
    /** El importe ORIGINAL de la comisión de Stripe y la tasa con que se
     *  convirtió. Un cobro en pesos liquidado en dólares trae la comisión en
     *  dólares: lo que se resta del bruto es una conversión, y hay que poder
     *  ver de dónde salió. */
    stripeFeeOriginal?: { amount: number; currency: string } | null;
    /** Cuántas unidades de la moneda del cobro vale una de la de la comisión.
     *  Se publica siempre en esa dirección —también cuando viene de Stripe, que
     *  la da al revés— o la ficha mostraría «0,000244» al lado de «4.100» y
     *  nadie sabría que son la misma cosa. */
    stripeFeeRate?: number | null;
    stripeFeeRateSource?: string | null;
    stripeFeeRateDate?: string | null;
    stripeFeeRateOfficial?: boolean;
    stripeFeeConverted?: boolean;
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
    movement?: Movement | null;
    /** Cómo se ató el aporte con su movimiento. `heuristic` es una deducción
     *  —los aportes anteriores a v4.844 no tienen vínculo— y se DICE en la
     *  ficha: una coincidencia deducida no puede presentarse como un hecho. */
    movementMatch?: 'exact' | 'heuristic' | null;
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
    /** v4.886 — Lo trasladado al BENEFICIARIO final, por moneda. No es lo

     *  mismo que `transferred`, que son los payouts al banco del club: uno

     *  sale de la plataforma hacia el club y el otro del club hacia quien

     *  recibe la ayuda. Fundirlos contaría dos veces el mismo dinero. */

    disbursed?: number;

    disbursedCount?: number;

    disbursedLast?: string | null;
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

/** El importe con el CÓDIGO de la moneda en vez del símbolo.
 *
 *  Se usa donde el punto es justamente cuál moneda: el importe original de una
 *  comisión convertida. En es-CO el dólar se escribe «US$ 1,16» y el peso
 *  «$ 4.754» — los dos empiezan por «$» y, en una línea que explica de dónde
 *  salió una conversión, eso es exactamente lo que no puede quedar ambiguo. */
const moneyCode = (n: number | null | undefined, currency: string) =>
    formatMoney(Number(n ?? 0), currency || 'USD', undefined, { currencyDisplay: 'code' });

const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};

// v4.849 — Lo que el servidor devuelve del período y del catálogo de destinos.
interface DestinoOpcion {
    key: string;
    kind: string;
    label: string;
    cuantos: number;
    porMoneda: Record<string, number>;
}

interface PeriodoResumen {
    id: string;
    label: string;
    desde: string | null;
    hasta: string | null;
    destino: string;
    excluidos: number;
    totales: {
        bruto: Record<string, number>;
        procesador: Record<string, number>;
        plataforma: Record<string, number>;
        neto: Record<string, number>;
        aportes: number;
        sinMovimiento: number;
    };
}

export default function WalletManagement() {
    const { token, user } = useAuth();
    const { club } = useClub();

    // v4.853 — DOS MODOS, y el scope de datos es lo que los separa.
    //
    //   CENTRAL  el operador de la plataforma: todos los sitios, sólo lectura.
    //   LOCAL    el sitio: sólo sus fondos, con sus retiros y su traza.
    //
    // Se distingue por ROL, no por si hay sitio activo: `app.clubplatform.org`
    // resuelve al sitio «Origen», así que el operador SÍ tiene club y una
    // comprobación por `club` lo mandaría a la Bóveda de Origen creyendo estar
    // viendo la plataforma entera.
    //
    // El operador puede bajar a un sitio concreto —`sitioElegido`— y ahí ve
    // exactamente la Bóveda local de ese sitio, que es la que ya funciona.
    const esOperador = user?.role === 'administrator';
    const [sitioElegido, setSitioElegido] = useState<string | null>(null);
    const modoCentral = esOperador && !sitioElegido;
    // El sitio del que se están mirando los fondos. Para un administrador de
    // sitio es SIEMPRE el suyo —`sitioElegido` no se puede fijar sin ser
    // operador—, así que esto no abre ninguna puerta entre organizaciones: el
    // servidor sólo acepta `?clubId=` de un operador y lo comprueba él.
    const clubIdActivo = sitioElegido || club?.id;
    // El formateo de importes depende del idioma activo. Sin esta suscripción,
    // cambiar de idioma dejaría las cifras con el formato anterior hasta que
    // algo más repintara la pantalla.
    useLang();
    const API_URL = import.meta.env.VITE_API_URL || '/api';

    const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
    const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
    const [donations, setDonations] = useState<DonationRecord[]>([]);
    // v4.858 — Las notificaciones de cada aporte, por id. Vienen en el MISMO
    // viaje que los aportes: con una consulta por aporte serían decenas por
    // pantalla.
    const [notificaciones, setNotificaciones] = useState<Record<string, Delivery[]>>({});
    // v4.886 — Los desembolsos de cada aporte, indexados por el id del PAGO
    // (no del aporte): el desembolso cuelga del movimiento, que es donde vive
    // el dinero. Llegan en el mismo viaje que los aportes.
    const [desembolsos, setDesembolsos] = useState<Record<string, DesembolsoResumen[]>>({});
    const [donationTotals, setDonationTotals] = useState<{ currency: string; totalAmount: number; totalCount: number }[]>([]);
    const [wallet, setWallet] = useState<WalletData | null>(null); // v4.421 — Stripe sync
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    // v4.885 — La reconciliación histórica y su informe. Van aquí arriba,
    // con el resto de los hooks y antes de cualquier return: React
    // identifica cada hook por su ORDEN de llamada (v4.689).
    // v4.886 — Los aportes elegidos para desembolsar en bloque. Se guardan
    // ENTEROS y no por id: la lista se filtra por período y por destino, y un
    // aporte elegido antes de filtrar tiene que sobrevivir a que la vista
    // cambie — es la regla del panel de grupos (v4.876).
    const [elegidos, setElegidos] = useState<Record<string, Elegible>>({});
    const [isReconciling, setIsReconciling] = useState(false);
    const [informeReconcile, setInformeReconcile] = useState<ReconcileReport | null>(null);

    // v4.842 — La moneda que se está mirando. Es el contexto de TODA la
    // pantalla: las tarjetas de estado, los movimientos, los aportes, el
    // historial de retiros y el formulario. Hasta v4.841 se apilaban las dos
    // monedas una debajo de la otra y con unas pocas decenas de transferencias
    // la página no terminaba nunca.
    //
    // Es también la moneda del retiro: hasta v4.841 había un selector propio
    // dentro del formulario, y dos controles para la misma decisión se
    // contradicen en cuanto alguien cambia uno solo.
    // v4.990 — Los filtros pueden llegar EN LA DIRECCIÓN. Es lo que hace que el
    // tablero de campañas pueda enlazar a «lo recaudado por esta campaña» en vez
    // de mandar a alguien a repetir el filtro a mano. Es ADITIVO: sin
    // parámetros la pantalla se comporta exactamente como antes, y un `rango`
    // que no exista se ignora en vez de dejar la Bóveda en un estado inválido.
    const [searchParams] = useSearchParams();
    const [activeCurrency, setActiveCurrency] = useState(
        () => (searchParams.get('moneda') || '').trim().toUpperCase()
    );
    // v4.849 — Los filtros del PERÍODO. Sólo mueven los movimientos: el saldo
    // de la caja azul es un saldo, no un flujo, y no se filtra nunca.
    const [rango, setRango] = useState<string>(() => {
        const pedido = (searchParams.get('rango') || '').trim();
        return isRango(pedido) ? pedido : RANGO_DEFAULT;
    });
    const [desde, setDesde] = useState(() => searchParams.get('desde') || '');
    const [hasta, setHasta] = useState(() => searchParams.get('hasta') || '');
    const [destino, setDestino] = useState<string>(() => (searchParams.get('destino') || '').trim() || DESTINO_TODOS);
    const [destinos, setDestinos] = useState<DestinoOpcion[]>([]);
    // v4.1014 — El TERCER eje: el estado del dinero. Es lo que hace clickeable
    // la tarjeta «Desembolsado» y lo que permite llegar a «los aportes ya
    // trasladados» desde un enlace. Aditivo: sin él la pantalla se comporta
    // como antes.
    const [estado, setEstado] = useState<string>(() => (searchParams.get('estado') || '').trim() || ESTADO_TODOS);
    const [estadosDisponibles, setEstadosDisponibles] = useState<{ id: string; label: string; cuantos: number }[]>([]);
    // v4.1014 — El traslado que se está mirando desde la ficha de un aporte.
    /** El APORTE desde cuya ficha se abrió la conciliación de su traslado. */
    const [trasladoAbierto, setTrasladoAbierto] = useState<string | null>(null);
    const [periodo, setPeriodo] = useState<PeriodoResumen | null>(null);
    const [exportando, setExportando] = useState<'xlsx' | 'csv' | 'pdf' | null>(null);
    const [tab, setTab] = useState<'aportes' | 'retiros'>('aportes');
    const [orphanMovements, setOrphanMovements] = useState<Movement[]>([]);
    /** v4.1025 — La reconstrucción de los cobros que nunca dejaron movimiento. */
    const [isRebuilding, setIsRebuilding] = useState(false);
    const [informeRebuild, setInformeRebuild] = useState<RebuildReport | null>(null);

    // Form states
    const [amount, setAmount] = useState<number | ''>('');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState('');

    useEffect(() => {
        if (token && clubIdActivo) {
            fetchWalletData();
        }
    }, [token, clubIdActivo]);

    // v4.849 — Al cambiar un filtro se recarga en SILENCIO: con el esqueleto de
    // carga completo, cada cambio de rango haría parpadear la pantalla entera
    // —incluida la caja del saldo, que ni siquiera se filtra—. Un rango
    // personalizado no dispara nada hasta tener sus dos fechas: pedir con una
    // sola daría un resultado que el servidor degrada y confunde más que ayuda.
    useEffect(() => {
        if (!token || !clubIdActivo) return;
        if (rango === 'personalizado' && (!desde || !hasta)) return;
        fetchWalletData(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rango, desde, hasta, destino]);

    // La moneda activa arranca en la primera que tenga saldo disponible; si
    // ninguna lo tiene, en la primera que el servidor ordenó —que es la del
    // sitio—. Se elige sola UNA vez: después manda el usuario, y un efecto que
    // volviera a pisarla le cambiaría la pestaña bajo los pies al refrescar.
    // v4.990 — Y se CORRIGE la que no existe. Con la moneda llegando en la
    // dirección, una que este sitio no cobra dejaría la pestaña seleccionada
    // sobre una caja vacía y sin forma de saber por qué. La elección del
    // usuario se respeta igual que siempre: sólo se pisa la que no está en la
    // lista.
    useEffect(() => {
        const rows = balanceData?.byCurrency || [];
        if (!rows.length) return;
        if (activeCurrency && rows.some(b => b.currency === activeCurrency)) return;
        const first = rows.find(b => b.availableBalance > 0) || rows[0];
        if (first) setActiveCurrency(first.currency);
    }, [balanceData, activeCurrency]);

    // La query de los filtros, en UN solo sitio. El rango personalizado sólo
    // viaja con sus dos fechas: mandarlo a medias haría que el servidor lo
    // degradara a «todo» y el selector diría una cosa y la lista otra.
    const filtroQuery = useCallback(() => {
        const q = new URLSearchParams();
        q.set('rango', rango);
        if (rango === 'personalizado') {
            if (desde) q.set('desde', desde);
            if (hasta) q.set('hasta', hasta);
        }
        if (destino !== DESTINO_TODOS) q.set('destino', destino);
        if (estado !== ESTADO_TODOS) q.set('estado', estado);
        return q.toString();
        // ⚠️ `estado` va en las dependencias. Sin él, cambiar el filtro no
        // llegaría NUNCA a la petición y el control se leería como roto —es la
        // lección de `conQr` (v4.836) y `profileId` (v4.838), que el typecheck
        // no ve—.
    }, [rango, desde, hasta, destino, estado]);

    // v4.850 — La exportación. El informe se arma UNA vez y lo consumen los tres
    // formatos: escribir cada uno por su cuenta daría tres verdades sobre el
    // mismo período. Las librerías se cargan de forma perezosa —`xlsx` y
    // `jspdf` pesan— así que quien entra a mirar su saldo no las descarga.
    const exportar = async (formato: 'xlsx' | 'csv' | 'pdf') => {
        setExportando(formato);
        try {
            const mod = await import('../../lib/walletExport');
            const informe = buildInforme({
                club: club?.name || 'Sitio',
                // La moneda es la que se está mirando, y es OBLIGATORIA: un
                // informe «de todas las monedas» exigiría un total que las
                // sume, que es justo lo que este módulo no hace. Para dos
                // monedas se emiten dos informes.
                moneda: code,
                donations: activeDonations,
                periodo: {
                    label: periodo?.label || 'Todo el histórico',
                    desde: periodo?.desde || null,
                    hasta: periodo?.hasta || null,
                    excluidos: periodo?.excluidos || 0,
                },
                destinoLabel: destino === DESTINO_TODOS
                    ? 'Todos los destinos'
                    : (destinos.find(d => d.key === destino)?.label || destino),
                // El saldo ACTUAL, no el del período. Va rotulado como tal
                // dentro del archivo.
                saldoActual: selected?.availableBalance || 0,
            });
            if (formato === 'csv') mod.descargarCSV(informe);
            else if (formato === 'xlsx') await mod.descargarExcel(informe);
            else await mod.descargarPDF(informe);
        } catch (e: any) {
            // Un fallo al exportar no puede dejar la pantalla en un estado raro:
            // se dice y se sigue.
            console.error('[Wallet] exportación falló:', e);
            toast.error('No pudimos generar el archivo. Intentá de nuevo.');
        } finally {
            setExportando(null);
        }
    };

    const fetchWalletData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        setIsRefreshing(true);
        setLoadError(null);
        const headers = { 'Authorization': `Bearer ${token}` };

        // Defensive: each endpoint resuelve independiente. Si /donations falla
        // (router no montado en algún env), balance + payouts siguen mostrándose.
        const [balanceRes, payoutsRes, donationsRes, walletRes] = await Promise.allSettled([
            axios.get(`${API_URL}/payouts/balance?clubId=${clubIdActivo}`, { headers }),
            axios.get(`${API_URL}/payouts/history?clubId=${clubIdActivo}`, { headers }),
            axios.get(`${API_URL}/financial/donations?clubId=${clubIdActivo}&${filtroQuery()}`, { headers }),
            axios.get(`${API_URL}/financial/wallet?clubId=${clubIdActivo}`, { headers }), // v4.421 — buckets Stripe
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
            setNotificaciones(donationsRes.value.data.notifications || {});
            setDesembolsos(donationsRes.value.data.disbursements || {});
            setDonationTotals(donationsRes.value.data.byCurrency || []);
            setOrphanMovements(donationsRes.value.data.orphanMovements || []);
            // El catálogo de destinos y el período RESUELTO los manda el
            // servidor: la pantalla no recalcula qué días entran, o el rótulo
            // del selector y las filas de la lista podrían discrepar.
            setDestinos(donationsRes.value.data.destinos || []);
            // v4.1014 — El catálogo de estados sale de TODOS los aportes del
            // sitio, no de los filtrados: si saliera de lo filtrado, elegir un
            // estado haría desaparecer a los demás y no habría forma de volver.
            setEstadosDisponibles(donationsRes.value.data.estados || []);
            setPeriodo(donationsRes.value.data.periodo || null);
        } else {
            setDonations([]);
            setNotificaciones({});
            setDesembolsos({});
            setDonationTotals([]);
            setOrphanMovements([]);
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
        if (!token || !clubIdActivo) return;
        setIsSyncing(true);
        try {
            const res = await axios.post(`${API_URL}/financial/wallet/sync-stripe`,
                { clubId: clubIdActivo, force },
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

    /**
     * v4.886 — Elegir o desmarcar un aporte para el desembolso en bloque.
     *
     * Se guarda el objeto ENTERO y no el id: la lista se filtra por período y
     * por destino, así que un aporte elegido antes de cambiar el filtro tiene
     * que sobrevivir a que la vista cambie. Es la regla del panel de grupos
     * (v4.876), y acá el precio de perderlo sería registrar de menos.
     */
    /**
     * v4.1014 — Pulsar una tarjeta de «Estado del dinero» filtra la lista y
     * lleva hasta ella.
     *
     * Volver a pulsar la misma la limpia: sin eso, el único modo de deshacer
     * sería buscar el desplegable, y un filtro que se pone con un clic y se
     * quita con tres se lee como una trampa.
     *
     * ⚠️ Se desplaza a la lista porque en una pantalla de este alto el efecto
     * del clic ocurre fuera de la vista: sin el desplazamiento parece que no
     * pasó nada. Y también hay que ir a la pestaña de aportes — con la de
     * retiros abierta, filtrar no se vería en ninguna parte.
     */
    const filtrarPorEstado = useCallback((id: string) => {
        setEstado(prev => (prev === id ? ESTADO_TODOS : id));
        setTab('aportes');
        // El desplazamiento va DESPUÉS del repintado: la lista todavía no
        // existe en el DOM cuando se cambia de pestaña.
        requestAnimationFrame(() => {
            document.getElementById('lista-de-aportes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, []);

    /**
     * v4.1014 — Qué hay dentro de la selección.
     *
     * Espejo de `classifySelection` del servidor. Va en un `useMemo` con el
     * resto de los hooks y ANTES de cualquier return: React identifica cada
     * hook por su ORDEN de llamada (v4.689).
     */
    const seleccion = useMemo(() => {
        const lista = Object.values(elegidos);
        const trasladados = lista.filter(e => e.clase === 'trasladado');
        // Ausente = `disponible`: es lo que eran todos hasta v4.1013.
        const disponibles = lista.filter(e => e.clase !== 'trasladado');
        return { disponibles, trasladados, mezclada: disponibles.length > 0 && trasladados.length > 0 };
    }, [elegidos]);

    const cambiarEleccion = useCallback((e: Elegible, marcado: boolean) => {
        setElegidos(prev => {
            const siguiente = { ...prev };
            if (marcado) siguiente[e.paymentId] = e;
            else delete siguiente[e.paymentId];
            return siguiente;
        });
    }, []);

    /**
     * v4.885 — RECONCILIAR los aportes históricos.
     *
     * De ENSAYO primero, siempre: la primera pulsación mira y no escribe nada,
     * y sólo se aplica cuando quien lo pidió vio el informe. Es el patrón de la
     * carga hacia atrás del libro mayor (v4.848) y lo valioso es lo mismo —
     * mirar antes de tocar dinero.
     *
     * ⚠️ NO es lo mismo que «Sincronizar con Stripe»: aquél enriquece los datos
     * de un aporte, éste corrige su ESTADO y deja constancia de cada corrección.
     */
    /**
     * v4.1025 — RECONSTRUIR LOS COBROS QUE NUNCA LLEGARON A LA BÓVEDA.
     *
     * ⚠️ NO es «Revisar estados». Aquél corrige en qué cubeta está un
     * movimiento que YA existe; éste CREA el de un cobro que se acreditó
     * cuando su fuente todavía no estaba atada a ningún sitio, y por eso no
     * dejó ninguno. Hoy la única fuente con resolutor es la Feria de Proyectos.
     *
     * De ENSAYO primero, siempre: la primera pulsación mira y no escribe nada.
     * Es el patrón de la carga hacia atrás del libro mayor (v4.848) y lo
     * valioso es lo mismo — mirar antes de tocar dinero.
     */
    const handleRebuild = async (aplicar: boolean) => {
        if (!token || !clubIdActivo) return;
        setIsRebuilding(true);
        try {
            const res = await axios.post(`${API_URL}/financial/wallet/rebuild-collections`,
                { clubId: clubIdActivo, apply: aplicar },
                { headers: { Authorization: `Bearer ${token}` } });
            setInformeRebuild({ ...res.data, modo: aplicar ? 'aplicado' : 'ensayo' });
            if (aplicar) await fetchWalletData(true);
        } catch (e) {
            const err = e as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'No se pudieron revisar los cobros');
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
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            setInformeReconcile(res.data);
            if (!aplicar) {
                const porHacer = (res.data?.detalle || []).filter((d: { accion?: string }) => d.accion).length;
                toast.success(porHacer
                    ? `Ensayo: ${porHacer} aporte(s) se corregirían. Revisá el informe y aplicá.`
                    : 'Ensayo: no hay nada que corregir. Todos los aportes están al día.');
            } else {
                toast.success(`Reconciliados: ${res.data?.corregidos || 0} corregidos contra Stripe, ${res.data?.anotados || 0} estados anotados.`);
                await fetchWalletData(true);
            }
        } catch (err) {
            const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
                || 'No se pudo reconciliar';
            toast.error(message, { duration: 10000 });
        } finally {
            setIsReconciling(false);
        }
    };

    const handleRequestPayout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeCurrency) {
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
                currency: activeCurrency,
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

    // v4.853 — MODO CENTRAL. Va antes que el esqueleto de carga porque no
    // depende de nada de lo que la Bóveda local está cargando: son dos scopes
    // de datos distintos y esperar al del sitio sería esperar por nada.
    if (modoCentral) {
        return (
            <AdminLayout>
                <div className="space-y-6">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">
                            Bóveda de Fondos
                        </p>
                        <h1 className="text-2xl font-black text-gray-900 mt-1">Todos los sitios</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Lo que ha recaudado cada organización alojada en Club Platform. Cada sitio
                            conserva su dinero por separado.
                        </p>
                    </div>
                    {/* Pulsar un sitio abre SU Bóveda —la local, la que ya
                        funciona— en vez de reimplementar el detalle acá. */}
                    <CentralVault onAbrirSitio={setSitioElegido} />
                </div>
            </AdminLayout>
        );
    }

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

    // ⚠️ v4.852 — ACÁ ESTABA EL FALLO QUE DEJABA LA BÓVEDA EN BLANCO.
    //
    // Cuando el sitio no tiene NINGÚN aporte, `/financial/wallet` responde
    // `wallets: []` con `buckets: {}` y `summary: {}` —objetos vacíos, para que
    // un bundle anterior encontrara las claves que espera—. Pero `{}` es
    // TRUTHY: la condición `wallet ?` daba verdadero, el respaldo armaba una
    // entrada con `buckets: {}`, y al pintar las cubetas
    // `activeWallet.buckets.in_transit.count` reventaba con
    // «Cannot read properties of undefined (reading 'count')».
    //
    // El error subía al límite de error, que desmonta TODO el subárbol —por eso
    // la pantalla salía sin barra lateral—.
    //
    // NO le pasaba sólo al administrador central: le pasa a CUALQUIER sitio sin
    // aportes, incluido un club recién creado. El central lo veía siempre
    // porque consulta sin `clubId` y ahí nunca hay pagos.
    //
    // La comprobación es por CONTENIDO, no por existencia: el respaldo sólo
    // vale si el payload trae de verdad las cubetas que se van a leer.
    const respaldoUtil = !!wallet?.buckets && 'in_transit' in wallet.buckets;
    const wallets: CurrencyWallet[] = wallet?.wallets?.length
        ? wallet.wallets
        : respaldoUtil
            ? [{ currency: wallet!.currency, decimals: 2, buckets: wallet!.buckets, summary: wallet!.summary }]
            : [];

    // v4.842 — TODO lo que se pinta de acá para abajo pertenece a la moneda
    // activa. Nada mezcla, y nada obliga a desplazarse por la moneda que no se
    // está mirando.
    const code = activeCurrency || balances[0]?.currency || '';
    const selected = balances.find(b => b.currency === code) || null;
    const activeWallet = wallets.find(w => w.currency === code) || null;
    const activeDonations = donations.filter(d => (d.currency || 'USD') === code);
    const activePayouts = payouts.filter(p => (p.currency || 'USD') === code);
    const activeDonationTotal = donationTotals.find(t => t.currency === code);

    // v4.844 — Un cobro real que NO nació de una donación: una compra de la
    // tienda, una membresía, una inscripción. Al unificar la lista dentro de
    // los aportes, estos se quedaban sin sitio donde verse — y son dinero del
    // club. Van al final de la misma lista, marcados como lo que son.
    const huerfanos = orphanMovements.filter(m => m.currency === code);

    // v4.849 — El resumen del período, en la moneda que se está mirando. Se
    // saca por moneda y NUNCA se suma entre ellas: es la regla del módulo desde
    // v4.841. Si esta moneda no tuvo nada en el período, no se pinta el bloque
    // —cuatro ceros no informan de nada—.
    const resumenPeriodo = (() => {
        const t = periodo?.totales;
        if (!t) return null;
        const fila = {
            bruto: t.bruto?.[code] || 0,
            procesador: t.procesador?.[code] || 0,
            plataforma: t.plataforma?.[code] || 0,
            neto: t.neto?.[code] || 0,
        };
        return fila.bruto === 0 && fila.neto === 0 ? null : fila;
    })();

    const TABS = [
        {
            id: 'aportes' as const, label: 'Aportes recibidos', icon: <Heart className="w-4 h-4" />,
            count: activeDonations.length + huerfanos.length,
        },
        { id: 'retiros' as const, label: 'Retiros', icon: <ArrowUpRight className="w-4 h-4" />, count: activePayouts.length },
    ];

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto space-y-8">

                {loadError && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{loadError}</span>
                    </div>
                )}

                {/* ── La moneda que se está mirando ──────────────────────
                    v4.842 — Una sola a la vista. Hasta v4.841 se apilaban COP
                    y después USD, cada una con sus cuatro tarjetas y su lista
                    de movimientos: con unas pocas decenas de transferencias la
                    página no terminaba nunca y había que desplazarse por la
                    moneda que no se estaba buscando. */}
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
                        {/* v4.853 — El operador que bajó a un sitio tiene que poder
                            volver. Sin esto queda atrapado en la Bóveda de ese
                            sitio y la única salida es recargar. */}
                        {sitioElegido && (
                            <button
                                type="button"
                                onClick={() => setSitioElegido(null)}
                                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
                            >
                                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                                Todos los sitios
                            </button>
                        )}

                        {/* ── UNA sola línea: monedas a la izquierda, filtros y
                            descargas a la derecha ─────────────────────────
                            v4.851 — Pedido expreso del equipo. La v4.850 los
                            tenía en dos líneas por miedo a que cuatro controles
                            no cupieran en un portátil; el `flex-wrap` con
                            `ml-auto` resuelve las dos cosas — en pantalla ancha
                            va todo en una línea, y al estrecharse el grupo de
                            la derecha baja solo, que es exactamente la
                            disposición anterior. */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        {/* El selector sólo aparece con más de una moneda: con una
                            sola sería un control que no controla nada. */}
                        {balances.length > 1 && (
                            <div role="tablist" aria-label="Moneda" className="flex flex-wrap gap-2">
                                {balances.map(b => {
                                    const on = b.currency === code;
                                    return (
                                        <button
                                            key={b.currency}
                                            role="tab"
                                            aria-selected={on}
                                            onClick={() => setActiveCurrency(b.currency)}
                                            className={`flex items-baseline gap-2.5 px-4 py-2.5 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue/40 ${on
                                                ? 'bg-rotary-blue border-rotary-blue text-white shadow-md shadow-rotary-blue/20'
                                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                                }`}
                                        >
                                            <span className="text-xs font-black tracking-[0.12em]" data-no-translate>
                                                {b.currency}
                                            </span>
                                            <span className={`text-sm font-bold ${on ? 'text-white' : 'text-gray-900'}`} data-no-translate>
                                                {money(b.availableBalance, b.currency)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── Filtros del PERÍODO ─────────────────────────
                            v4.849 — Van en su propia línea, DEBAJO del selector
                            de moneda y no a la derecha del título: con cuatro
                            controles en una sola fila se rompe en un portátil.

                            ⚠️ Estos filtros NO tocan el saldo de abajo. Un
                            saldo existe a una fecha, no dentro de un rango, y
                            filtrarlo daría «US$ 0,00» a quien mira justo el
                            número con el que decide si pide un retiro. */}
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                            <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm">
                                <Calendar className="w-4 h-4 text-gray-400" aria-hidden="true" />
                                <span className="sr-only">Período</span>
                                <select
                                    aria-label="Período"
                                    value={rango}
                                    onChange={e => setRango(e.target.value)}
                                    className="bg-transparent text-gray-800 font-medium focus:outline-none"
                                >
                                    {RANGOS.map(r => (
                                        <option key={r.id} value={r.id}>{r.label}</option>
                                    ))}
                                </select>
                            </label>

                            {rango === 'personalizado' && (
                                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm">
                                    <input
                                        type="date" aria-label="Desde" value={desde}
                                        onChange={e => setDesde(e.target.value)}
                                        className="bg-transparent text-gray-800 focus:outline-none"
                                    />
                                    <span className="text-gray-400">→</span>
                                    <input
                                        type="date" aria-label="Hasta" value={hasta}
                                        onChange={e => setHasta(e.target.value)}
                                        className="bg-transparent text-gray-800 focus:outline-none"
                                    />
                                </div>
                            )}

                            {/* ⚠️ Se muestra con UNA sola campaña, y es un cambio
                                deliberado respecto de v4.849 —donde la regla del
                                sitio, «un control que no controla nada», lo
                                escondía hasta tener dos—.
                                El equipo lo pidió expresamente y tiene razón por
                                un motivo que aquella regla no contemplaba: acá el
                                desplegable no sólo filtra, NOMBRA de qué campaña
                                vino el dinero. Con una sola, «Todos» y esa
                                campaña dan lo mismo; lo que aporta es que el
                                administrador vea a qué se atribuye lo recibido
                                sin abrir ninguna ficha. */}
                            {destinos.length > 0 && (
                                <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm">
                                    <Tag className="w-4 h-4 text-gray-400" aria-hidden="true" />
                                    <span className="sr-only">Destino del aporte</span>
                                    <select
                                        aria-label="Destino del aporte"
                                        value={destino}
                                        onChange={e => setDestino(e.target.value)}
                                        className="bg-transparent text-gray-800 font-medium focus:outline-none max-w-[16rem]"
                                    >
                                        <option value={DESTINO_TODOS}>Todos los destinos</option>
                                        {destinos.map(d => (
                                            <option key={d.key} value={d.key}>
                                                {d.label} ({d.cuantos})
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}

                            {/* v4.1014 — ESTADO DEL DINERO. Es el desplegable al
                                que lleva la tarjeta de arriba al pulsarla, y la
                                vía para conciliaciones históricas: «mostrame los
                                aportes ya trasladados».

                                Sólo se ofrecen los estados que este sitio TIENE:
                                uno sin un solo aporte es un control que no
                                controla nada (v4.650). */}
                            {estadosDisponibles.length > 0 && (
                                <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm">
                                    <Landmark className="w-4 h-4 text-gray-400" aria-hidden="true" />
                                    <span className="sr-only">Estado del dinero</span>
                                    <select
                                        aria-label="Estado del dinero"
                                        value={estado}
                                        onChange={e => setEstado(e.target.value)}
                                        className="bg-transparent text-gray-800 font-medium focus:outline-none max-w-[16rem]"
                                    >
                                        <option value={ESTADO_TODOS}>Todos los estados</option>
                                        {estadosDisponibles.map(e => (
                                            <option key={e.id} value={e.id}>
                                                {ESTADO_LABEL[e.id] || e.label} ({e.cuantos})
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}

                            {hayFiltro({ rango, destino, estado }) && (
                                <button
                                    onClick={() => { setRango(RANGO_DEFAULT); setDesde(''); setHasta(''); setDestino(DESTINO_TODOS); setEstado(ESTADO_TODOS); }}
                                    className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-4 px-1"
                                >
                                    Limpiar
                                </button>
                            )}

                            {/* ── Exportar ────────────────────────────────
                                v4.850 — Se exporta LO QUE SE VE: el período, el
                                destino y la moneda que están puestos. Y el
                                archivo lo dice adentro, porque un Excel de hace
                                un mes tiene que poder interpretarse solo.

                                Van al final de la línea y sólo si hay algo que
                                exportar: un botón que descarga un archivo vacío
                                es peor que no tenerlo. */}
                            {activeDonations.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => exportar('xlsx')}
                                        disabled={!!exportando}
                                        title={`Descargar Excel de ${code}`}
                                        aria-label={`Descargar Excel de ${code}`}
                                        className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-2xl px-3 py-2 text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {exportando === 'xlsx'
                                            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                            : <FileSpreadsheet className="w-4 h-4 text-emerald-600" aria-hidden="true" />}
                                        Excel
                                    </button>
                                    <button
                                        onClick={() => exportar('csv')}
                                        disabled={!!exportando}
                                        title={`Descargar CSV de ${code}`}
                                        aria-label={`Descargar CSV de ${code}`}
                                        className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-2xl px-3 py-2 text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {exportando === 'csv'
                                            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                            : <FileText className="w-4 h-4 text-gray-500" aria-hidden="true" />}
                                        CSV
                                    </button>
                                    <button
                                        onClick={() => exportar('pdf')}
                                        disabled={!!exportando}
                                        title={`Descargar PDF de ${code}`}
                                        aria-label={`Descargar PDF de ${code}`}
                                        className="flex items-center gap-1.5 text-sm bg-white border border-gray-200 rounded-2xl px-3 py-2 text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {exportando === 'pdf'
                                            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                            : <FileText className="w-4 h-4 text-[#9D2235]" aria-hidden="true" />}
                                        PDF
                                    </button>
                                </div>
                            )}
                        </div>

                        </div>

                        {/* El aviso vive junto a los filtros y sólo con alguno
                            puesto: con todo por omisión sería ruido. Sin él,
                            que el saldo no cambie al filtrar se lee como que el
                            filtro no funciona. */}
                        {hayFiltro({ rango, destino }) && (
                            <div className="flex items-start gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
                                <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
                                <p>{AVISO_SALDO}</p>
                            </div>
                        )}

                        {/* El saldo de la moneda activa */}
                        {selected && (
                            <div className="bg-rotary-blue rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-rotary-blue/20">
                                <div className="absolute top-0 right-0 p-12 opacity-10">
                                    <Wallet className="w-56 h-56 rotate-12" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <span
                                            className="text-xs font-black tracking-[0.15em] bg-white/15 rounded-md px-2 py-1"
                                            data-no-translate
                                        >
                                            {selected.currency}
                                        </span>
                                        <h3 className="text-lg font-medium text-blue-100">Disponible para Retiro</h3>
                                    </div>
                                    <div className="text-4xl md:text-6xl font-black mb-6 mt-2" data-no-translate>
                                        {money(selected.availableBalance, selected.currency)}
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                                        <div className="bg-white/10 rounded-xl py-3 px-4 backdrop-blur-sm border border-white/10">
                                            <span className="text-blue-200 block mb-1 text-xs">Recibido bruto</span>
                                            <span className="font-bold" data-no-translate>{money(selected.totalGross, selected.currency)}</span>
                                        </div>
                                        <div className="bg-white/10 rounded-xl py-3 px-4 backdrop-blur-sm border border-white/10">
                                            <span className="text-blue-200 block mb-1 text-xs">Neto acreditado</span>
                                            <span className="font-bold" data-no-translate>{money(selected.totalCollected, selected.currency)}</span>
                                        </div>
                                        <div className="bg-white/10 rounded-xl py-3 px-4 backdrop-blur-sm border border-white/10">
                                            <span className="text-blue-200 block mb-1 text-xs">Retiros solicitados</span>
                                            <span className="font-bold" data-no-translate>{money(selected.totalRequested, selected.currency)}</span>
                                        </div>
                                        <div className="bg-white/10 rounded-xl py-3 px-4 backdrop-blur-sm border border-white/10">
                                            <span className="text-blue-200 block mb-1 text-xs">Aportes recibidos</span>
                                            <span className="font-bold" data-no-translate>
                                                {activeDonations.length} · {money(activeDonationTotal?.totalAmount ?? 0, selected.currency)}
                                            </span>
                                        </div>
                                    </div>

                                    {(activeWallet?.summary?.inTransit ?? 0) > 0 && selected.availableBalance === 0 && (
                                        <p className="text-blue-100 text-xs mt-4 flex items-start gap-1.5">
                                            <Hourglass className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                            <span>
                                                Hay <b data-no-translate>{money(activeWallet?.summary?.inTransit, selected.currency)}</b> en tránsito.
                                                Stripe todavía no los liberó.
                                            </span>
                                        </p>
                                    )}

                                    {balances.length > 1 && (
                                        <p className="text-blue-200 text-xs mt-4">
                                            Estás viendo <b data-no-translate>{selected.currency}</b>. Los saldos de cada
                                            moneda son independientes y no se suman entre sí.
                                        </p>
                                    )}
                                </div>
                            </div>
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

                        {/* Estado del dinero — de la moneda activa y de ninguna otra */}
                        {/* Se exige que las cubetas EXISTAN, no sólo que haya
                            wallet: es la segunda barrera del fallo de v4.852.
                            Un payload a medias no puede volver a tumbar la
                            pantalla entera. */}
                        {activeWallet?.buckets?.in_transit && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Estado del dinero</h3>
                                    <button
                                        onClick={() => handleSyncStripe(false)}
                                        disabled={isSyncing}
                                        title="Consulta Stripe para actualizar fees reales y fechas de disponibilidad de los aportes existentes"
                                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-lg border border-purple-100 transition-all disabled:opacity-50 disabled:cursor-wait"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                                        {isSyncing ? 'Sincronizando…' : 'Sincronizar con Stripe'}
                                    </button>
                                    {/* ── RECONCILIAR (v4.885) ────────────────
                                        Corrige el ESTADO de los aportes
                                        históricos contra Stripe. NO es lo mismo
                                        que sincronizar: aquél enriquece datos,
                                        éste arregla en qué cubeta está el
                                        dinero y deja constancia de cada cambio.

                                        De ENSAYO primero, siempre. */}
                                    <button
                                        onClick={() => handleReconcile(false)}
                                        disabled={isReconciling}
                                        title="Revisa los aportes históricos y dice cuáles tienen el estado desactualizado. No escribe nada."
                                        className="flex items-center gap-2 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold rounded-lg border border-sky-100 transition-all disabled:opacity-50 disabled:cursor-wait"
                                    >
                                        <Info className={`w-3.5 h-3.5 ${isReconciling ? 'animate-pulse' : ''}`} />
                                        {isReconciling ? 'Revisando…' : 'Revisar estados'}
                                    </button>
                                    {/* ── RECONSTRUIR COBROS (v4.1025) ────────
                                        Los cobros que se acreditaron cuando su
                                        fuente todavía no estaba atada a ningún
                                        sitio y por eso NO dejaron movimiento —
                                        hoy, las inscripciones a la Feria de
                                        Proyectos. No corrige ningún estado:
                                        crea el movimiento que falta.

                                        De ENSAYO primero, siempre. */}
                                    <button
                                        onClick={() => handleRebuild(false)}
                                        disabled={isRebuilding}
                                        title="Busca cobros de otras fuentes (inscripciones a la Feria de Proyectos) que se acreditaron sin dejar movimiento en la Bóveda. No escribe nada."
                                        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-100 transition-all disabled:opacity-50 disabled:cursor-wait"
                                    >
                                        <Wallet className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-pulse' : ''}`} />
                                        {isRebuilding ? 'Buscando…' : 'Buscar cobros sin registrar'}
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                                    <WalletBucketCard
                                        color="amber"
                                        icon={<Hourglass className="w-5 h-5" />}
                                        label="En Tránsito"
                                        total={activeWallet.summary.inTransit}
                                        currency={activeWallet.currency}
                                        count={activeWallet.buckets.in_transit.count + activeWallet.buckets.processing.count}
                                        hint="Stripe procesando el pago"
                                        onFiltrar={() => filtrarPorEstado('in_transit')}
                                        activo={estado === 'in_transit'}
                                    />
                                    <WalletBucketCard
                                        color="sky"
                                        icon={<Plane className="w-5 h-5" />}
                                        label="Disponible Próximamente"
                                        total={activeWallet.summary.availableSoon}
                                        currency={activeWallet.currency}
                                        count={activeWallet.buckets.available_soon.count}
                                        hint={`Liberación en ~${wallet?.platformHoldingDays ?? 6} días`}
                                        onFiltrar={() => filtrarPorEstado('available_soon')}
                                        activo={estado === 'available_soon'}
                                    />
                                    <WalletBucketCard
                                        color="emerald"
                                        icon={<CheckCircle2 className="w-5 h-5" />}
                                        label="Disponible para Retiro"
                                        total={activeWallet.summary.availableForWithdrawal}
                                        currency={activeWallet.currency}
                                        count={activeWallet.buckets.available.count}
                                        hint="Lista para solicitar payout"
                                        onFiltrar={() => filtrarPorEstado('available')}
                                        activo={estado === 'available'}
                                    />
                                    <WalletBucketCard
                                        color="indigo"
                                        icon={<Send className="w-5 h-5" />}
                                        label="Transferido"
                                        total={activeWallet.summary.transferred}
                                        currency={activeWallet.currency}
                                        count={activePayouts.filter(p => p.status === 'completed').length}
                                        hint="Payouts completados al banco"
                                        /* ⚠️ ÉSTA NO FILTRA, y su ausencia es deliberada: cuenta
                                           PAYOUTS al banco del club, no aportes. Un filtro acá
                                           tendría que buscar aportes por un estado que ellos no
                                           tienen, y devolvería una lista vacía que se leería como
                                           un error. Los payouts se miran en su pestaña. */
                                    />
                                    {/* ── DESEMBOLSADO (v4.886) ───────────────
                                        ⚠️ NO es lo mismo que «Transferido».
                                        Aquél son los payouts al banco del club
                                        —dinero que sale de la plataforma hacia
                                        el club—; éste es el traslado al
                                        BENEFICIARIO final, que el club registra
                                        y puede ocurrir por fuera de un payout.
                                        Fundirlos contaría dos veces el mismo
                                        dinero en unos sitios y ninguna en otros.

                                        Se pinta SIEMPRE, aunque esté en cero: es
                                        la cifra que se lleva a un informe, y una
                                        tarjeta que aparece y desaparece según si
                                        hubo movimiento hace pensar que el módulo
                                        se rompió. */}
                                    <WalletBucketCard
                                        color="violet"
                                        icon={<Landmark className="w-5 h-5" />}
                                        label="Desembolsado"
                                        total={activeWallet.summary.disbursed ?? 0}
                                        currency={activeWallet.currency}
                                        count={activeWallet.summary.disbursedCount ?? 0}
                                        hint="Trasladado al beneficiario"
                                        /* v4.1014 — LA TARJETA QUE ORIGINÓ EL PEDIDO. Pulsarla deja
                                           en la lista únicamente los aportes ya trasladados, que es
                                           desde donde se eligen para reenviar su conciliación. */
                                        onFiltrar={() => filtrarPorEstado('trasladado')}
                                        activo={estado === 'trasladado'}
                                    />
                                </div>

                                {/* ⚠️ QUE EL FILTRO NO MUEVE ESTAS CIFRAS HAY QUE
                                    DECIRLO. Son saldos y se calculan sobre todo; sin
                                    esta línea, que la tarjeta siga en el mismo número
                                    después de filtrar se lee como que el filtro no
                                    funcionó — y moverlas sería peor. */}
                                {estado !== ESTADO_TODOS && (
                                    <p className="flex items-start gap-1.5 text-xs text-gray-500">
                                        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                        <span>{AVISO_ESTADO}</span>
                                    </p>
                                )}

                                {/* ── EL INFORME DE LA RECONCILIACIÓN ─────────
                                    Se pinta donde se pulsó el botón, no en otra
                                    pantalla: al hacer visible un diagnóstico,
                                    ponerlo donde se mira primero (v4.790).

                                    Lo que NO se pudo corregir y POR QUÉ es la
                                    mitad del informe: sin eso, «no pasó nada» es
                                    indistinguible de «no se pudo». */}
                                {informeReconcile && (
                                    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-sm">
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                            <h4 className="font-bold text-sky-900">
                                                {informeReconcile.modo === 'ensayo' ? 'Ensayo de reconciliación' : 'Reconciliación aplicada'}
                                            </h4>
                                            <button
                                                onClick={() => setInformeReconcile(null)}
                                                className="text-xs text-sky-700 underline underline-offset-4"
                                            >
                                                Cerrar
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-700">
                                            <span data-no-translate>{informeReconcile.revisados}</span> aporte(s) revisados
                                            {informeReconcile.modo === 'aplicado' && (
                                                <> · <span data-no-translate>{informeReconcile.corregidos}</span> corregidos contra Stripe
                                                    {' · '}<span data-no-translate>{informeReconcile.anotados}</span> estados anotados</>
                                            )}
                                            {informeReconcile.pendientes > 0 && (
                                                <> · <span data-no-translate>{informeReconcile.pendientes}</span> quedaron para la próxima vuelta</>
                                            )}
                                        </p>

                                        {Object.keys(informeReconcile.hallazgos || {}).length > 0 && (
                                            <div className="mt-3">
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 mb-1">Qué se encontró</div>
                                                <ul className="text-xs text-gray-700 space-y-0.5">
                                                    {Object.entries(informeReconcile.hallazgos).map(([clase, d]) => (
                                                        <li key={clase}>
                                                            <span className="font-semibold">{HALLAZGO_LABEL[clase] || clase}</span>
                                                            {': '}<span data-no-translate>{d.cuantos}</span> aporte(s)
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {Object.keys(informeReconcile.noCorregidos || {}).length > 0 && (
                                            <div className="mt-3">
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Lo que NO se pudo corregir</div>
                                                <ul className="text-xs text-amber-800 space-y-0.5">
                                                    {Object.entries(informeReconcile.noCorregidos).map(([motivo, d]) => (
                                                        <li key={motivo}>
                                                            <span data-no-translate>{d.cuantos}</span>
                                                            {': '}
                                                            {NO_CORREGIDO_LABEL[motivo]
                                                                ? NO_CORREGIDO_LABEL[motivo]
                                                                /* Un motivo que llega del proveedor —o una clave
                                                                   que nadie rotuló— se pinta tal cual y como DATO:
                                                                   el error de Stripe se propaga textual, y
                                                                   traducirlo lo volvería irreconocible. */
                                                                : <span data-no-translate>{motivo}</span>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {informeReconcile.modo === 'ensayo' && (
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                <button
                                                    onClick={() => handleReconcile(true)}
                                                    disabled={isReconciling}
                                                    className="px-3 py-1.5 rounded-lg bg-sky-700 text-white text-[11px] font-black uppercase tracking-wider hover:bg-sky-800 disabled:opacity-50"
                                                >
                                                    Aplicar las correcciones
                                                </button>
                                                <span className="text-[11px] text-gray-500">
                                                    No se modifican saldos ni se inventan movimientos: se consulta a Stripe y se
                                                    escribe lo que Stripe conteste.
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── El informe de la reconstrucción ─────────
                                    ⚠️ LO QUE NO SE PUDO RECONSTRUIR ES LA MITAD
                                    DEL RESULTADO. Sin esa parte, «no pasó nada»
                                    es indistinguible de «no se pudo», y acá lo
                                    que está en juego es dinero que no aparece.
                                */}
                                {informeRebuild && (
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-black uppercase tracking-wider text-emerald-800">
                                                {informeRebuild.modo === 'ensayo' ? 'Ensayo · cobros sin registrar' : 'Cobros reconstruidos'}
                                            </p>
                                            <button
                                                onClick={() => setInformeRebuild(null)}
                                                className="text-[11px] text-gray-500 hover:text-gray-800 underline underline-offset-4"
                                            >
                                                Cerrar
                                            </button>
                                        </div>

                                        {informeRebuild.error ? (
                                            <p className="mt-2 text-xs text-red-700" data-no-translate>{informeRebuild.error}</p>
                                        ) : (
                                            <>
                                                <p className="mt-2 text-xs text-gray-700">
                                                    <span data-no-translate>{informeRebuild.mirados}</span> cobro(s) mirados ·{' '}
                                                    <span data-no-translate>{informeRebuild.reconstruidos}</span>
                                                    {informeRebuild.modo === 'ensayo' ? ' se reconstruirían' : ' reconstruidos'}
                                                    {informeRebuild.pendientes > 0 && (
                                                        <> · <span data-no-translate>{informeRebuild.pendientes}</span> quedaron para la próxima vuelta</>
                                                    )}
                                                </p>

                                                {/* Por moneda y NUNCA sumado entre ellas. */}
                                                {Object.keys(informeRebuild.porMoneda || {}).length > 0 && (
                                                    <p className="mt-1 text-xs text-gray-700">
                                                        Neto que entraría a la Bóveda:{' '}
                                                        {Object.entries(informeRebuild.porMoneda).map(([m, v], i) => (
                                                            <span key={m} data-no-translate>{i > 0 ? ' · ' : ''}{money(v, m)}</span>
                                                        ))}
                                                    </p>
                                                )}

                                                {informeRebuild.ejemplos?.length > 0 && (
                                                    <ul className="mt-3 text-xs text-gray-700 space-y-0.5">
                                                        {informeRebuild.ejemplos.map(e => (
                                                            <li key={e.ref}>
                                                                <span className="font-semibold" data-no-translate>{e.ref}</span>
                                                                {e.clubName && <span data-no-translate> · {e.clubName}</span>}
                                                                {': '}
                                                                <span data-no-translate>{money(e.netAmount, e.currency)}</span>
                                                                {/* De qué salió la cifra y de qué señal el sitio: sin
                                                                    eso, «¿por qué este cobro entró acá?» no se puede
                                                                    contestar dentro de seis meses. */}
                                                                {e.basis === 'derivado' && (
                                                                    <span className="text-amber-700"> · neto derivado del precio publicado</span>
                                                                )}
                                                                {e.signal && <span className="text-gray-400"> · sitio por «{e.signal}»</span>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}

                                                {Object.keys(informeRebuild.avisos || {}).length > 0 && (
                                                    <div className="mt-3">
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Avisos</div>
                                                        <ul className="text-xs text-amber-800 space-y-0.5">
                                                            {Object.entries(informeRebuild.avisos).map(([aviso, d]) => (
                                                                <li key={aviso}>
                                                                    <span data-no-translate>{d.total}</span>{': '}{aviso}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {Object.keys(informeRebuild.noReconstruidos || {}).length > 0 && (
                                                    <div className="mt-3">
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Lo que NO se pudo reconstruir</div>
                                                        <ul className="text-xs text-amber-800 space-y-0.5">
                                                            {Object.entries(informeRebuild.noReconstruidos).map(([motivo, d]) => (
                                                                <li key={motivo}>
                                                                    <span data-no-translate>{d.total}</span>{': '}
                                                                    {REBUILD_LABEL[motivo] || <span data-no-translate>{motivo}</span>}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {informeRebuild.modo === 'ensayo' && informeRebuild.reconstruidos > 0 && (
                                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                                        <button
                                                            onClick={() => handleRebuild(true)}
                                                            disabled={isRebuilding}
                                                            className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider hover:bg-emerald-800 disabled:opacity-50"
                                                        >
                                                            Registrar estos {informeRebuild.reconstruidos} cobro(s)
                                                        </button>
                                                        <span className="text-[11px] text-gray-500">
                                                            Se crea el movimiento de cada cobro con su importe real. No se inventa
                                                            ninguna fecha de liberación: la completa el barrido preguntándole a Stripe.
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Pestañas ──────────────────────────────────────
                            El contenido deja de apilarse: se elige qué mirar.
                            El formulario de retiro vive DENTRO de «Retiros»,
                            junto a su historial — separarlos obligaría a
                            cambiar de pestaña para comprobar si la solicitud
                            que se acaba de enviar quedó registrada. */}
                        <div className="border-b border-gray-200 flex gap-1 overflow-x-auto" role="tablist" aria-label="Secciones de la bóveda">
                            {TABS.map(t => {
                                const on = tab === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        role="tab"
                                        aria-selected={on}
                                        onClick={() => setTab(t.id)}
                                        className={`flex items-center gap-2 px-4 py-3 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue/40 rounded-t-lg ${on
                                            ? 'border-rotary-blue text-rotary-blue'
                                            : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                                            }`}
                                    >
                                        {t.icon}
                                        {t.label}
                                        <span className={`text-[10px] font-black rounded-full px-1.5 py-0.5 ${on ? 'bg-rotary-blue/10 text-rotary-blue' : 'bg-gray-100 text-gray-500'
                                            }`} data-no-translate>
                                            {t.count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Aportes recibidos, con su trazabilidad dentro ──
                            v4.844 — Antes había DOS pestañas —«Movimientos» y
                            «Aportes recibidos»— que mostraban el mismo dinero
                            visto desde dos tablas, sin forma de saber cuál era
                            de quién. Ahora el movimiento vive DENTRO de la caja
                            de su aportante: se pulsa y se despliega. */}
                        {tab === 'aportes' && (
                            <div id="lista-de-aportes" role="tabpanel" aria-label="Aportes recibidos" className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm scroll-mt-24">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                        <Heart className="w-5 h-5 text-[#9D2235]" />
                                        Aportes Recibidos
                                    </h3>
                                    {activeDonationTotal && (
                                        <span
                                            className="text-xs font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full"
                                            data-no-translate
                                        >
                                            {activeDonationTotal.totalCount} · {money(activeDonationTotal.totalAmount, activeDonationTotal.currency)}
                                        </span>
                                    )}
                                </div>

                                {/* ── Lo que el club recibió EN EL PERÍODO ────────
                                    v4.849 — Son FLUJOS —bruto, lo que retuvo
                                    cada uno y el neto—, así que sí existen
                                    dentro de un rango. Es lo que el filtro
                                    mueve, al revés que el saldo. */}
                                {periodo && resumenPeriodo && (
                                    <div className="mb-6 rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                                                Recibido en el período · <span data-no-translate>{periodo.label}</span>
                                            </p>
                                            <p className="text-[11px] text-gray-400" data-no-translate>
                                                {periodo.totales.aportes} aporte{periodo.totales.aportes === 1 ? '' : 's'}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                                            <Dato termino="Bruto" valor={money(resumenPeriodo.bruto, code)} dato />
                                            <Dato termino="Tarifa de procesamiento" valor={`− ${money(resumenPeriodo.procesador, code)}`} dato />
                                            <Dato termino="Retención de la plataforma" valor={`− ${money(resumenPeriodo.plataforma, code)}`} dato />
                                            <Dato termino="Neto del período" valor={money(resumenPeriodo.neto, code)} dato />
                                        </div>
                                        {/* Aportes de los que no se pudo leer la retención.
                                            Callarlos haría que el neto pareciera completo
                                            cuando le falta gente. */}
                                        {periodo.totales.sinMovimiento > 0 && (
                                            <p className="mt-3 text-xs text-amber-700">
                                                {periodo.totales.sinMovimiento} aporte(s) sin movimiento asociado: su bruto está
                                                contado, sus retenciones no.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {activeDonations.length === 0 && huerfanos.length === 0 ? (
                                    <div className="text-center text-gray-400 py-10">
                                        <Heart className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        {/* Con un filtro puesto, «no hay aportes» a secas
                                            hace pensar que el club no recibió nada nunca. Lo
                                            que no hay es aportes EN ESTE PERÍODO, y se dice
                                            con la salida a mano. */}
                                        {hayFiltro({ rango, destino, estado }) ? (
                                            <>
                                                <p className="text-sm">
                                                    No hay aportes en <span data-no-translate>{code}</span> para el filtro elegido.
                                                </p>
                                                <button
                                                    onClick={() => { setRango(RANGO_DEFAULT); setDesde(''); setHasta(''); setDestino(DESTINO_TODOS); setEstado(ESTADO_TODOS); }}
                                                    className="text-xs mt-2 text-rotary-blue underline underline-offset-4"
                                                >
                                                    Ver todo el histórico
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-sm">Todavía no hay aportes en <span data-no-translate>{code}</span>.</p>
                                                <p className="text-xs mt-1">Cuando un donante complete el pago vía Stripe, aparecerá acá automáticamente.</p>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {activeDonations.map(donation => (
                                            <DonorCard key={donation.id} donation={donation} holdingDays={wallet?.platformHoldingDays ?? 6}
                                                deliveries={notificaciones[donation.id] || []}
                                                onResent={(d) => setNotificaciones(prev => ({ ...prev, [donation.id]: d }))}
                                                clubId={clubIdActivo}
                                                elegido={!!elegidos[donation.movement?.id || '']}
                                                onElegir={cambiarEleccion}
                                                desembolsos={desembolsos[donation.movement?.id || ''] || []}
                                                onVerTraslado={setTrasladoAbierto} />
                                        ))}

                                        {/* Cobros que no nacieron de una donación —una compra
                                            de la tienda, una membresía, una inscripción a la
                                            Feria de Proyectos—. Son dinero del club: al unificar
                                            la lista no pueden quedarse sin ningún sitio donde
                                            verse.

                                            ⚠️ v4.1025 — Y SE PUEDEN TRASLADAR COMO CUALQUIER
                                            OTRO. Hasta v4.1024 esta tarjeta iba SIN `onElegir`,
                                            así que no se le pintaba casilla: una inscripción
                                            pagada se veía en la Bóveda y no había forma de
                                            girarle ese dinero a los organizadores ni de mandarles
                                            su comprobante. El motor de abajo siempre lo soportó
                                            —`registerDisbursement` acepta un desembolso sin
                                            donación—; lo que faltaba era la casilla. Un cobro sin
                                            aportante no es un cobro de segunda: es el mismo
                                            dinero con otra procedencia. */}
                                        {huerfanos.length > 0 && (
                                            <div className="pt-4 mt-2 border-t border-gray-100">
                                                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                                                    Otros movimientos · sin aportante asociado
                                                </p>
                                                <div className="space-y-3">
                                                    {huerfanos.map(m => (
                                                        <DonorCard key={m.id} movementOnly={m}
                                                            holdingDays={wallet?.platformHoldingDays ?? 6}
                                                            clubId={clubIdActivo}
                                                            elegido={!!elegidos[m.id]}
                                                            onElegir={cambiarEleccion}
                                                            desembolsos={desembolsos[m.id] || []}
                                                            onVerTraslado={setTrasladoAbierto} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* v4.886 — La barra de acción en bloque. Va PEGADA
                                            ABAJO: con una lista larga, un botón al final obliga
                                            a desplazarse hasta el fondo para actuar sobre algo
                                            que se eligió arriba. */}
                                        {/* ⚠️ v4.1014 — UNA SELECCIÓN MEZCLADA NO EJECUTA NADA.
                                            Sobre lo `disponible` se REGISTRA un giro —mueve
                                            dinero— y sobre lo `trasladado` se REENVÍA un
                                            documento —no mueve nada—: un botón que actuara sobre
                                            las dos clases haría una de ellas mal, y una es
                                            dinero. Se dice y se ofrece quedarse con una. */}
                                        {seleccion.mezclada && (
                                            <div className="sticky bottom-4 z-20 mt-3 rounded-2xl border border-amber-200 bg-amber-50/95 backdrop-blur px-4 py-3 shadow-lg">
                                                <p className="text-sm font-bold text-amber-900">
                                                    Elegiste aportes de dos clases distintas
                                                </p>
                                                <p className="text-[11px] text-amber-800 mt-0.5">
                                                    <span data-no-translate>{seleccion.disponibles.length}</span> disponible(s) para
                                                    girar y <span data-no-translate>{seleccion.trasladados.length}</span> ya
                                                    trasladado(s). Sobre unos se registra un giro y sobre otros se reenvía la
                                                    conciliación: son dos acciones distintas y no se pueden hacer juntas.
                                                </p>
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setElegidos(prev => Object.fromEntries(
                                                            Object.entries(prev).filter(([, v]) => v.clase !== 'trasladado')))}
                                                        className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-bold text-amber-900"
                                                    >
                                                        Quedarme con los disponibles
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setElegidos(prev => Object.fromEntries(
                                                            Object.entries(prev).filter(([, v]) => v.clase === 'trasladado')))}
                                                        className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-bold text-amber-900"
                                                    >
                                                        Quedarme con los trasladados
                                                    </button>
                                                    <button
                                                        type="button" onClick={() => setElegidos({})}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-800 hover:bg-amber-100"
                                                    >
                                                        Quitar la selección
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {!seleccion.mezclada && (
                                            <BulkDisbursementBar
                                                elegidos={seleccion.disponibles}
                                                clubId={clubIdActivo}
                                                onLimpiar={() => setElegidos({})}
                                                onHecho={() => { setElegidos({}); fetchWalletData(true); }}
                                                onRecargar={() => fetchWalletData(true)}
                                            />
                                        )}

                                        {/* Desde la ficha de un aporte: su traslado completo.
                                            ⚠️ v4.1017 — Va el APORTE, no el lote. El modal pasó a
                                            recibir `paymentIds` en v4.1015 y este montaje se quedó
                                            con el prop viejo (`batchIds`), así que abría sin ningún
                                            aporte: un renombrado a medias que el typecheck sí veía
                                            y que se perdió entre los errores heredados. Con un solo
                                            aporte alcanza: el servidor resuelve su traslado y la
                                            conciliación sale COMPLETA. */}
                                        {trasladoAbierto && (
                                            <ResendNoticeModal
                                                paymentIds={[trasladoAbierto]}
                                                clubId={clubIdActivo}
                                                onCerrar={() => setTrasladoAbierto(null)}
                                                onEnviado={() => fetchWalletData(true)}
                                            />
                                        )}

                                        {/* v4.1014 — Reenviar la conciliación de un traslado ya
                                            efectuado. No registra nada: compone el documento y
                                            manda el correo. */}
                                        {!seleccion.mezclada && (
                                            <BulkReconciliationBar
                                                elegidos={seleccion.trasladados}
                                                clubId={clubIdActivo}
                                                onLimpiar={() => setElegidos({})}
                                                onRecargar={() => fetchWalletData(true)}
                                            />
                                        )}

                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Retiros: pedir y ver el historial ───────────── */}
                        {tab === 'retiros' && (
                            <div role="tabpanel" aria-label="Retiros" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-1">
                                    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm sticky top-8">
                                        <h3 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                                            <ArrowUpRight className="w-5 h-5 text-rotary-blue" />
                                            Solicitar Retiro
                                        </h3>
                                        {/* La moneda NO se elige acá: es la del selector de
                                            arriba. Dos controles para la misma decisión se
                                            contradicen en cuanto alguien cambia uno solo. */}
                                        <p className="text-xs text-gray-500 mb-6">
                                            En <b data-no-translate>{code}</b>, la moneda que estás viendo.
                                            {balances.length > 1 && ' Para retirar en otra, cambiala arriba.'}
                                        </p>

                                        <form onSubmit={handleRequestPayout} className="space-y-5">
                                            <div>
                                                <label htmlFor="payout-amount" className="block text-sm font-bold text-gray-700 mb-2">
                                                    Monto a retirar <span data-no-translate>({code})</span>
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
                                                        <b data-no-translate>{money(selected?.availableBalance, code)}</b>
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

                                <div className="lg:col-span-2">
                                    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm h-full max-h-[700px] flex flex-col">
                                        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                            <Clock className="w-5 h-5 text-gray-400" />
                                            Historial de Solicitudes
                                        </h3>

                                        {activePayouts.length === 0 ? (
                                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-12">
                                                <Wallet className="w-12 h-12 mb-4 opacity-20" />
                                                <p>No hay solicitudes de retiro en <span data-no-translate>{code}</span>.</p>
                                            </div>
                                        ) : (
                                            <div className="overflow-y-auto pr-2 space-y-4">
                                                {activePayouts.map(payout => (
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
                        )}
                    </>
                )}

            </div>
        </AdminLayout>
    );
}

// El estado del dinero de un movimiento, con el mismo nombre y el mismo color
// que las cuatro tarjetas de arriba: es el mismo hecho visto de cerca.
const ESTADOS: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    processing: { label: 'En procesamiento', bg: 'bg-gray-100', text: 'text-gray-700', icon: <Hourglass className="w-3 h-3" /> },
    in_transit: { label: 'En tránsito', bg: 'bg-amber-100', text: 'text-amber-800', icon: <Plane className="w-3 h-3" /> },
    available_soon: { label: 'Disponible próximamente', bg: 'bg-sky-100', text: 'text-sky-800', icon: <Clock className="w-3 h-3" /> },
    available: { label: 'Disponible para retiro', bg: 'bg-emerald-100', text: 'text-emerald-800', icon: <CheckCircle2 className="w-3 h-3" /> },
    // v4.890 — Los dos estados del giro. Estaban declarados en el servidor
    // desde v4.885 y no tenían rótulo acá, así que un aporte desembolsado se
    // quedaba SIN insignia o —peor— con la verde de «disponible».
    disbursing: { label: 'Desembolso parcial', bg: 'bg-violet-50', text: 'text-violet-700', icon: <Landmark className="w-3 h-3" /> },
    disbursed: { label: 'Desembolsado', bg: 'bg-violet-100', text: 'text-violet-800', icon: <Landmark className="w-3 h-3" /> },
    refunded: { label: 'Reembolsado', bg: 'bg-red-50', text: 'text-red-700', icon: <Ban className="w-3 h-3" /> },
    failed: { label: 'Fallido', bg: 'bg-red-100', text: 'text-red-800', icon: <XCircle className="w-3 h-3" /> },
};

const ORIGEN_LABEL: Record<string, string> = {
    campana: 'Campaña',
    proyecto: 'Proyecto',
    destino: 'Destino',
};

/**
 * La caja de un aportante — y, desplegada, TODA su trazabilidad.
 *
 * v4.844 — El movimiento vivía en otra pestaña y no había forma de saber cuál
 * correspondía a quién. Ahora se pulsa la caja y aparece debajo: de dónde vino
 * el aporte, qué se le descontó, con qué se pagó y dónde está su recibo.
 *
 * Sirve para las dos cosas que hay en la lista: un aporte con su movimiento
 * (`donation`) y un cobro sin aportante asociado (`movementOnly`) — una compra
 * de la tienda, una membresía. Se escribe una vez porque son la misma pieza
 * con distinta cabecera; dos componentes se separarían en silencio.
 */
/** `API_URL` vive DENTRO del componente principal y `DonorCard` es otra
 *  función: sin esta constante de módulo, el reenvío no tendría a dónde
 *  llamar. No se toca la de arriba — funciona y la usan veinte llamadas. */
const API_BASE = import.meta.env.VITE_API_URL || '/api';


/** Cómo se pinta cada estado de entrega. `sent` va en gris y no en verde a
 *  propósito: el proveedor lo aceptó, que NO es que haya llegado. */
/** v4.885 — Los hallazgos de la reconciliación, en español. La clave cruda
 *  («columna_desactualizada») es del servidor y no le dice nada a quien lee el
 *  informe: es el mismo motivo por el que `RETIRED_LABELS` existe en el registro
 *  de eventos. Al agregar un hallazgo en `walletReconcile.js`, agregarlo acá. */
const HALLAZGO_LABEL: Record<string, string> = {
    sin_fecha_de_stripe: 'Sin fecha de liberación del proveedor',
    columna_desactualizada: 'La fecha ya venció y el estado seguía en «pendiente»',
    estado_local_atrasado: 'El estado registrado se quedó atrás del calendario',
    sin_traza: 'Sin historial: anterior al seguimiento del ciclo de vida',
    fechas_incoherentes: '⚠️ Fechas incoherentes: revisar a mano',
};

/** v4.886 — Y los motivos de lo que NO se pudo corregir, que se estaban
 *  pintando en CRUDO. En la captura del reporte se leía «5:
 *  no_provider_reference»: una clave interna, en inglés porque el traductor del
 *  sitio la trató como una frase, delante de alguien que sólo quiere saber qué
 *  le pasa a su dinero. Lo que no esté en esta tabla se pinta tal cual y
 *  marcado como dato, para que al menos no se traduzca. */
const NO_CORREGIDO_LABEL: Record<string, string> = {
    sin_referencia_del_proveedor: 'Sin referencia del proveedor: no hay a quién consultarle',
    sin_balance_transaction: 'El proveedor todavía no generó su transacción de balance',
    sesion_sin_payment_intent: 'La sesión de pago no tiene un cobro asociado',
    sin_cambio: 'Se consultó al proveedor y no había nada que corregir',
};

/** v4.1025 — Y los motivos por los que un cobro no se pudo reconstruir. Misma
 *  regla que arriba: una clave interna delante de alguien que sólo quiere saber
 *  qué le pasa a su dinero no dice nada. Al agregar un motivo en
 *  `collectionSources.js`, agregarlo acá; lo que no esté se pinta tal cual y
 *  marcado como dato, para que al menos no se traduzca. */
const REBUILD_LABEL: Record<string, string> = {
    sin_importe: 'El cobro no registró ningún importe.',
    sin_neto_determinable: 'No se pudo determinar cuánto le corresponde al sitio: el cobro no guardó el desglose de su recargo y su precio publicado está en otra moneda.',
    sin_referencia: 'Sin referencia del proveedor: no hay con qué identificarlo ni evitar contarlo dos veces.',
    sin_sitio: 'No se pudo resolver a qué sitio pertenece. Se resuelve creando la edición como evento del sitio que recibe el dinero, o escribiendo su id en la Convocatoria.',
    sin_moneda: 'El cobro no registró en qué moneda entró.',
    ya_registrado: 'Ya tenía su movimiento registrado.',
};

const ENTREGA: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-600' },
    sent: { label: 'Enviado', cls: 'bg-sky-100 text-sky-700' },
    delivered: { label: 'Entregado', cls: 'bg-green-100 text-green-700' },
    opened: { label: 'Abierto', cls: 'bg-green-100 text-green-800' },
    bounced: { label: 'Rebotado', cls: 'bg-red-100 text-red-700' },
    failed: { label: 'Fallido', cls: 'bg-red-100 text-red-700' },
    blocked: { label: 'Bloqueado', cls: 'bg-amber-100 text-amber-800' },
};

function DonorCard({ donation, movementOnly, holdingDays, deliveries = [], onResent, clubId,
    elegido, onElegir, desembolsos = [], onVerTraslado }: {
    donation?: DonationRecord;
    movementOnly?: Movement;
    holdingDays: number;
    /** Los envíos registrados de este aporte. Vacío no es «no le llegó»: es que
     *  no se registró nada — son cosas distintas y la tarjeta lo dice así. */
    deliveries?: Delivery[];
    onResent?: (d: Delivery[]) => void;
    clubId?: string;
    /** v4.886 — La selección para el desembolso en bloque. `onElegir` ausente
     *  significa que esta tarjeta no participa —los cobros sin aportante— y
     *  entonces no se pinta ninguna casilla: un control que no controla nada es
     *  peor que no tenerlo (v4.650). */
    elegido?: boolean;
    onElegir?: (e: Elegible, marcado: boolean) => void;
    desembolsos?: DesembolsoResumen[];
    /** v4.1014 — Abrir la conciliación del traslado que cubrió este aporte.
     *  v4.1017 — Recibe el APORTE: el ámbito lo resuelve el servidor, y así
     *  este camino y el de la selección múltiple entran por la misma puerta. */
    onVerTraslado?: (paymentId: string) => void;
}) {
    const [abierta, setAbierta] = useState(false);
    const [reenviando, setReenviando] = useState(false);
    const [otroCorreo, setOtroCorreo] = useState('');
    const mov = donation?.movement || movementOnly || null;
    const currency = donation?.currency || mov?.currency || 'USD';
    const importe = donation?.amount ?? mov?.amount ?? 0;
    const fecha = donation?.date || mov?.createdAt || null;
    const estado = mov ? ESTADOS[mov.bucket] : null;
    const ref = (donation?.id || mov?.id || '').slice(-8).toUpperCase();

    // v4.886 — Cuánto le falta por desembolsar y si se puede elegir.
    //
    // ⚠️ Los REVERSADOS no descuentan: un desembolso corregido no trasladó
    // nada. Es el mismo criterio que `disbursementBalance` en el servidor —el
    // que manda—; acá se repite sólo para decidir qué se PINTA, y por eso el
    // servidor vuelve a comprobarlo y puede saltarse un aporte con su motivo.
    const yaDesembolsado = desembolsos
        .filter(d => d.status !== 'reversado')
        .reduce((a, d) => a + (Number(d.amount) || 0), 0);
    const restante = Math.max(0, (mov?.amount ?? 0) - yaDesembolsado);
    // «En tránsito» con fecha futura es lo único que de verdad bloquea: ahí el
    // proveedor todavía retiene el dinero. Sin fecha no sabemos, y el servidor
    // lo deja registrar con un aviso — ver `canDisburse`.
    //
    // ⚠️ v4.1014 — LA DECISIÓN SE MUDÓ A `selectionClassOf`, y no es un
    // refactor: ahora hay DOS clases de aporte elegible —el que se puede girar
    // y el que YA se giró y admite reenviar su conciliación—. Con la condición
    // escrita acá y otra vez en la barra, la tarjeta ofrecería una casilla que
    // la barra no sabe qué hacer con ella.
    const clase: ClaseSeleccion = selectionClassOf(
        mov ? { id: mov.id, status: mov.status, bucket: mov.bucket, availableOn: mov.availableOn } : null,
        restante,
    );
    const elegible = !!(mov && onElegir && clase !== 'ninguna');
    const trasladado = clase === 'trasladado';
    // El traslado que cubrió este aporte, si el giro se registró agrupado Y
    // tiene ficha que abrir. No se ofrece un botón que no lleva a ninguna
    // parte (v4.650).
    //
    // ⚠️ TENER `batchId` NO ES TENER FICHA — v4.1017. El comentario anterior
    // daba por hecho que «anterior a v4.996» significaba «sin batchId», y es al
    // revés: un giro EN BLOQUE de v4.887 a v4.995 agrupa sus movimientos con esa
    // marca y no tiene fila en `DisbursementBatch`. El botón se pintaba y daba
    // 404. `!== false` y no `=== true` a propósito: un servidor anterior no
    // manda el campo y ahí se comporta como siempre.
    const movAgrupado = desembolsos.find(d => d.status !== 'reversado' && d.batchId) || null;
    const loteDelAporte = movAgrupado && movAgrupado.batchTracked !== false ? movAgrupado.batchId! : null;
    // Un giro conjunto SIN ficha: se dice, con su tamaño, y se dice dónde está
    // su conciliación. Callarlo dejaría el hueco donde antes había un botón.
    const giroSinFicha = movAgrupado && movAgrupado.batchTracked === false ? movAgrupado : null;

    const titulo = donation
        ? (donation.isAnonymous
            ? <span className="text-gray-500 italic">Donante Anónimo</span>
            : (donation.donorName || donation.donorEmail || 'Donante'))
        : (mov?.origin?.label || 'Cobro sin aportante asociado');

    return (
        <div className="rounded-2xl border border-gray-100 bg-gradient-to-r from-gray-50 to-white hover:shadow-sm transition-all overflow-hidden">
            {/* La casilla va FUERA del botón que despliega: anidar un control
                dentro de otro hace que marcar el aporte abra también la ficha, y
                elegir veinte aportes dejaría veinte fichas abiertas. */}
            <div className="flex items-start">
            {elegible && (
                <button
                    type="button"
                    onClick={() => onElegir!({
                        paymentId: mov!.id,
                        restante,
                        currency: mov!.currency,
                        titulo: titulo as string,
                        clase,
                    }, !elegido)}
                    aria-pressed={!!elegido}
                    /* La etiqueta dice QUÉ se va a poder hacer con lo elegido.
                       «Elegir el aporte» a secas se repite en cada fila y no
                       distingue las dos acciones (la lección de v4.740). */
                    aria-label={trasladado
                        ? `Elegir el aporte #${ref} para reenviar su conciliación`
                        : `Elegir el aporte #${ref} para desembolsar`}
                    className={`pl-4 pt-5 flex-shrink-0 ${trasladado ? 'text-gray-400 hover:text-violet-600' : 'text-gray-400 hover:text-emerald-600'}`}
                >
                    {elegido
                        ? <CheckSquare className={`w-5 h-5 ${trasladado ? 'text-violet-600' : 'text-emerald-600'}`} />
                        : <Square className="w-5 h-5" />}
                </button>
            )}
            <button
                type="button"
                onClick={() => setAbierta(v => !v)}
                aria-expanded={abierta}
                className="w-full text-left flex items-start gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue/40"
            >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${donation ? 'bg-[#9D2235]/10' : 'bg-gray-200/60'}`}>
                    {donation
                        ? <Heart className="w-5 h-5 text-[#9D2235]" />
                        : <Send className="w-5 h-5 text-gray-500" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="font-bold text-gray-900">{titulo}</div>
                        <div className={`font-black text-xl ${donation ? 'text-[#9D2235]' : 'text-gray-700'}`} data-no-translate>
                            {money(importe, currency)}
                        </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {fecha && (
                            <span>{new Date(fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        )}
                        {donation && !donation.isAnonymous && donation.donorEmail && (
                            <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {donation.donorEmail}</span>
                        )}
                        {/* El ORIGEN se ve sin desplegar: es lo primero que se
                            pregunta de un aporte y lo que la ficha no decía. */}
                        {mov?.origin && (
                            <span className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-0.5 font-semibold text-gray-600">
                                {ORIGEN_LABEL[mov.origin.kind] || 'Origen'}: {mov.origin.label}
                            </span>
                        )}
                        {estado && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${estado.bg} ${estado.text}`}>
                                {estado.icon}{estado.label}
                            </span>
                        )}
                        {/* v4.885 — LOS DÍAS QUE FALTAN, sin tener que desplegar
                            la ficha ni contarlos a mano. Es lo que se pidió
                            eliminar: hasta ahora la única forma de saber cuándo
                            se liberaba un aporte era abrir la tarjeta, mirar
                            «Stripe libera» y sumarle seis días de cabeza.

                            Sólo cuando faltan: un «0 días» al lado de un estado
                            que ya dice «Disponible» es ruido. */}
                        {/* ⚠️ v4.890 — ACÁ NO VA UNA SEGUNDA INSIGNIA.
                            v4.886 pintaba «Desembolsado» en violeta AL LADO de
                            la cabecera verde «Disponible para retiro», y las dos
                            hablaban del mismo aporte diciendo cosas distintas.
                            Es la contradicción que este sitio ya se prohibió dos
                            veces (v4.787 y v4.799). Hay UN veredicto y lo da el
                            servidor: desde v4.890 `bucket` conoce el giro, así
                            que la insignia de arriba ya dice «Desembolsado».
                            Lo que queda acá es cuánto falta cuando el giro fue
                            parcial, en texto llano y sin competir con ella. */}
                        {yaDesembolsado > 0 && restante > 0.005 && (
                            <span className="text-[10px] font-semibold text-violet-700" data-no-translate>
                                {money(yaDesembolsado, mov?.currency || 'USD')} girado · falta {money(restante, mov?.currency || 'USD')}
                            </span>
                        )}
                        {mov?.lifecycle?.diasRestantes ? (
                            <span className="inline-flex items-center gap-1 text-sky-700 font-semibold">
                                <Clock className="w-3 h-3" />
                                <span data-no-translate>
                                    {mov.lifecycle.diasRestantes} día{mov.lifecycle.diasRestantes === 1 ? '' : 's'}
                                </span>
                                {mov.lifecycle.estimado && <span className="text-amber-600" title="Stripe todavía no dio su fecha: es una estimación.">≈</span>}
                            </span>
                        ) : null}
                        <span className="text-gray-300 font-mono">#{ref}</span>
                    </div>
                    {donation?.message && (
                        <div className="mt-2 flex items-start gap-2 bg-amber-50 border-l-2 border-amber-300 rounded-r-lg px-3 py-2 text-sm text-gray-700">
                            <MessageSquare className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span className="italic">"{donation.message}"</span>
                        </div>
                    )}
                </div>
            </button>
            </div>

            {abierta && (
                <div className="px-4 pb-4 border-t border-gray-100 bg-white/60">
                    {/* ── EL TRASLADO DE ESTE APORTE (v4.1014) ────────────
                        Un aporte ya girado lleva a SU traslado: ahí están los
                        otros aportes que salieron en la misma transferencia, el
                        comprobante consolidado, el historial de a quién se le
                        avisó y el reenvío de la conciliación.

                        Es una sola entrada y no un menú de cinco: las cinco
                        acciones que se pidieron viven adentro, y un menú cuyos
                        ítems abren todos lo mismo es ruido. */}
                    {trasladado && loteDelAporte && (
                        <div className="pt-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Traslado al beneficiario</div>
                            <button
                                type="button"
                                onClick={() => mov?.id && onVerTraslado?.(mov.id)}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-200 bg-violet-50 text-xs font-bold text-violet-800 hover:border-violet-400"
                            >
                                <Landmark className="w-3.5 h-3.5" />
                                Ver traslado y conciliación
                                <span className="font-normal text-violet-600" data-no-translate>
                                    {desembolsos.find(d => d.batchId === loteDelAporte)?.batchRef || ''}
                                </span>
                            </button>
                            <p className="text-[11px] text-gray-500 mt-1.5">
                                Los aportes que salieron en la misma transferencia, el comprobante consolidado,
                                a quién se le notificó y el reenvío de la conciliación.
                            </p>
                        </div>
                    )}

                    {/* ⚠️ UN GIRO CONJUNTO ANTERIOR A v4.996 NO TIENE FICHA QUE
                        ABRIR, y eso se DICE con su salida. Estos aportes
                        salieron de verdad en una misma transferencia —la marca
                        de agrupación está en sus desembolsos— pero el traslado
                        no se registró como una operación con su fila, así que
                        no hay comprobante consolidado ni historial que mostrar.
                        Su conciliación se genera marcando los aportes: dejar el
                        hueco sin explicación se lee como que falta algo
                        (v4.938), y un botón que da 404 es peor (v4.650). */}
                    {trasladado && giroSinFicha && (
                        <div className="pt-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Traslado al beneficiario</div>
                            <p className="text-[11px] text-gray-600">
                                Salió en un giro conjunto
                                {(giroSinFicha.batchSize ?? 0) > 1 && <> de <span data-no-translate>{giroSinFicha.batchSize}</span> aportes</>}
                                {' '}<span className="font-mono text-gray-500" data-no-translate>{giroSinFicha.batchRef || ''}</span>,
                                registrado antes de que la plataforma guardara la ficha del traslado.
                            </p>
                            <p className="text-[11px] text-gray-500 mt-1">
                                Para su conciliación —el comprobante y el reenvío por correo— marcá los aportes
                                con la casilla y usá «Reenviar notificación».
                            </p>
                        </div>
                    )}

                    {/* ── LAS NOTIFICACIONES DE ESTE APORTE (v4.858) ──────
                        «Le llegó» son `delivered` y `opened`: `sent` significa
                        que el proveedor lo aceptó, que es otra cosa y es justo
                        la distinción que hace falta cuando alguien dice que no
                        recibió nada. Y una lista vacía NO es «no le llegó»: es
                        que no se registró nada. */}
                    {donation && (
                        <div className="pt-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Confirmación por correo</div>
                            {deliveries.length === 0 ? (
                                <p className="text-xs text-gray-500">
                                    No hay ningún envío registrado para este aporte. Puede ser anterior a que
                                    se empezara a registrar, o que el sitio no tuviera notificaciones configuradas.
                                </p>
                            ) : (
                                <ul className="space-y-1.5 mb-2">
                                    {deliveries.map(d => (
                                        <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${ENTREGA[d.state]?.cls || 'bg-gray-100 text-gray-600'}`}>
                                                {ENTREGA[d.state]?.label || d.state}
                                            </span>
                                            <span className="text-gray-700" data-no-translate>{d.recipient}</span>
                                            {d.fromAddress && <span className="text-gray-400" data-no-translate>desde {d.fromAddress}</span>}
                                            {d.sentAt && (
                                                <span className="text-gray-400">
                                                    {new Date(d.sentAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                                                </span>
                                            )}
                                            {/* El motivo del proveedor, TEXTUAL: convertirlo en
                                                «no se pudo enviar» deja a quien corrige sin saber
                                                si el problema es el dominio o la dirección. */}
                                            {d.errorMessage && (
                                                <span className="w-full text-red-600 mt-0.5">{d.errorMessage}</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="flex flex-wrap gap-2 items-center">
                                <input
                                    type="email"
                                    value={otroCorreo}
                                    onChange={e => setOtroCorreo(e.target.value)}
                                    placeholder={donation.donorEmail || 'correo@destino.com'}
                                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs w-56"
                                />
                                <button
                                    type="button"
                                    disabled={reenviando}
                                    onClick={async () => {
                                        setReenviando(true);
                                        try {
                                            const r = await axios.post(
                                                `${API_BASE}/financial/donations/${donation.id}/resend`,
                                                { to: otroCorreo || undefined, clubId },
                                                { headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` } }
                                            );
                                            if (r.data?.deliveries && onResent) onResent(r.data.deliveries);
                                            toast.success(r.data?.note || 'Confirmación reenviada.');
                                        } catch (e: any) {
                                            toast.error(e?.response?.data?.error || 'No se pudo reenviar', { duration: 10000 });
                                        } finally { setReenviando(false); }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-black disabled:opacity-40"
                                >
                                    <Send className="w-3 h-3" /> {reenviando ? 'Reenviando…' : 'Reenviar confirmación'}
                                </button>
                            </div>
                            {/* La llave de idempotencia es contribución + evento +
                                destinatario: reenviar al MISMO correo no vuelve a
                                salir, y eso es a propósito. */}
                            <p className="text-[11px] text-gray-400 mt-1">
                                Al mismo destinatario no se repite. Para volver a mandarlo, escribí otra dirección.
                            </p>
                        </div>
                    )}
                    {!mov ? (
                        // No se inventa un movimiento que no se encontró: un
                        // aporte sin pago asociado es un dato que hay que ver,
                        // no un hueco que rellenar.
                        <p className="text-xs text-gray-500 pt-3">
                            No se encontró el movimiento de este aporte. Puede que el cobro se haya
                            registrado por otra vía. Probá «Sincronizar con Stripe».
                        </p>
                    ) : (
                        <div className="pt-3 space-y-3">
                            {/* EL CONCEPTO va primero: es lo que contesta «¿de
                                dónde salió este aporte?», que es la pregunta que
                                la ficha no respondía. */}
                            <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 mb-0.5">
                                    {mov.origin ? (ORIGEN_LABEL[mov.origin.kind] || 'Concepto') : 'Concepto'}
                                </div>
                                <div className="text-sm font-bold text-gray-900" data-no-translate>
                                    {mov.origin?.label || 'Aporte al club'}
                                </div>
                                {!mov.origin && (
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        Este cobro se registró antes de que se guardara su origen.
                                        Pulsá «Sincronizar con Stripe» para recuperarlo.
                                    </p>
                                )}
                            </div>

                            <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                                <div className="flex justify-between text-gray-700">
                                    <span>Monto pagado por el donante</span>
                                    <span className="font-mono font-semibold text-gray-900" data-no-translate>{money(mov.grossAmount, mov.currency)}</span>
                                </div>
                                {/* La comisión de Stripe: el importe que cobró EN SU
                                    MONEDA y, al lado, su equivalente en la del cobro.
                                    Stripe la denomina en la moneda de liquidación de
                                    la cuenta —dólares—, así que sobre un aporte en
                                    pesos lo que se resta es una CONVERSIÓN: sin ver el
                                    original y la tasa, «−$ 4.754» es un número que
                                    nadie puede explicar. */}
                                <div className="flex justify-between text-gray-500">
                                    <span>
                                        − Tarifa de procesamiento de Stripe
                                        {mov.stripeFeeConverted && mov.stripeFeeOriginal && (
                                            <span className="block text-[10px] text-gray-400" data-no-translate>
                                                {moneyCode(mov.stripeFeeOriginal.amount, mov.stripeFeeOriginal.currency)}
                                                {mov.stripeFeeRate ? ` × ${formatNumber(mov.stripeFeeRate)}` : ''}
                                                {mov.stripeFeeRateSource ? ` · ${mov.stripeFeeRateSource}` : ''}
                                                {mov.stripeFeeRateDate ? ` (${mov.stripeFeeRateDate})` : ''}
                                            </span>
                                        )}
                                    </span>
                                    <span className="font-mono text-right" data-no-translate>
                                        {mov.stripeFeeConverted && mov.stripeFeeOriginal && (
                                            <span className="block text-[10px] text-gray-400">
                                                −{moneyCode(mov.stripeFeeOriginal.amount, mov.stripeFeeOriginal.currency)}
                                            </span>
                                        )}
                                        −{money(mov.stripeFee, mov.currency)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-gray-500">
                                    {/* REGLA EXPRESA DEL CLIENTE (v4.842) — este rótulo
                                        lo fijó el equipo y no se cambia por criterio
                                        propio. Ver la nota completa en el commit de
                                        v4.842: técnicamente es la comisión de la
                                        plataforma por recaudar. */}
                                    <span>
                                        − Tarifa de procesamiento de traslado desde interbancos
                                        {mov.grossAmount > 0 && (
                                            <span data-no-translate> ({Math.round((mov.applicationFee / mov.grossAmount) * 1000) / 10}%)</span>
                                        )}
                                    </span>
                                    <span className="font-mono" data-no-translate>−{money(mov.applicationFee, mov.currency)}</span>
                                </div>
                                <div className="flex justify-between pt-1.5 border-t border-gray-200 font-bold text-gray-900">
                                    <span>Neto para el club</span>
                                    <span className="font-mono" data-no-translate>{money(mov.amount, mov.currency)}</span>
                                </div>
                            </div>

                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                                {mov.method?.label && <Dato termino="Método de pago" valor={mov.method.label} dato />}
                                <Dato termino="Fecha del cobro" valor={fmtDate(mov.createdAt)} dato />
                                {mov.availableOn && <Dato termino="Stripe libera" valor={fmtDate(mov.availableOn)} dato />}
                                {mov.clubAvailableOn && (
                                    <Dato termino={`Disponible para retiro (+${holdingDays} días)`} valor={fmtDate(mov.clubAvailableOn)} dato />
                                )}
                                {mov.receiptNumber && <Dato termino="Recibo" valor={`#${mov.receiptNumber}`} dato />}
                                {mov.stripeBalanceTxId && <Dato termino="Transacción Stripe" valor={mov.stripeBalanceTxId} dato mono />}
                                {mov.providerRef && <Dato termino="Referencia del pago" valor={mov.providerRef} dato mono />}
                                {/* «Estado en Stripe» se retiró en v4.845: decía
                                    `pending` en crudo, en inglés y sin contexto,
                                    justo debajo del estado del dinero que ya lo
                                    explica en la insignia de arriba. Dos veces el
                                    mismo hecho, una de ellas peor contada. */}
                            </dl>

                            {mov.receiptUrl && (
                                <div className="pt-1">
                                    <a
                                        href={mov.receiptUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rotary-blue hover:underline"
                                    >
                                        Ver el recibo de Stripe
                                    </a>
                                </div>
                            )}

                            {/* ── EL CICLO DE VIDA (v4.885) ───────────────────
                                Cuándo se libera, qué le pasó y a dónde se
                                trasladó. Se monta sólo con la ficha abierta:
                                pide su propio viaje al servidor y hacerlo por
                                cada aporte de la lista sería una consulta por
                                tarjeta. Los eventos vienen de la BASE, nunca se
                                componen acá. */}
                            <div className="border-t border-gray-100">
                                <DisbursementSection
                                    paymentId={mov.id}
                                    clubId={clubId}
                                    netAmount={mov.amount}
                                    currency={mov.currency}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** Un par término/valor de la traza. Lo que es DATO —una referencia, una
 *  tarjeta, una fecha— no se traduce (v4.662). */
function Dato({ termino, valor, dato, mono }: { termino: string; valor: string; dato?: boolean; mono?: boolean }) {
    return (
        <div className="flex justify-between gap-3">
            <dt className="text-gray-500">{termino}</dt>
            <dd
                className={`text-gray-900 font-semibold text-right truncate ${mono ? 'font-mono text-[10px]' : ''}`}
                {...(dato ? { 'data-no-translate': true } : {})}
            >
                {valor}
            </dd>
        </div>
    );
}

// v4.421 — Tarjeta de bucket en el header de la Bóveda.
type BucketColor = 'amber' | 'sky' | 'emerald' | 'indigo' | 'red' | 'violet';
function WalletBucketCard({ color, icon, label, total, currency, count, hint, onFiltrar, activo }: {
    color: BucketColor;
    icon: React.ReactNode;
    label: string;
    total: number;
    currency: string;
    count: number;
    hint: string;
    /**
     * v4.1014 — Pulsar la tarjeta FILTRA LA LISTA por ese estado.
     *
     * ⚠️ NO cambia la cifra de la tarjeta y no puede: es un SALDO y un saldo no
     * se filtra (v4.849). Si al elegir «Desembolsado» las demás se pusieran en
     * cero, alguien concluiría que no tiene dinero — justo en el número con el
     * que decide si pide un retiro.
     *
     * Sin `onFiltrar` la tarjeta se pinta como siempre: un `div`, no un botón
     * apagado. Un control que recibe el foco y no hace nada anuncia algo que no
     * va a pasar (v4.650).
     */
    onFiltrar?: () => void;
    activo?: boolean;
}) {
    const palette: Record<BucketColor, { bg: string; text: string; accent: string }> = {
        amber:   { bg: 'bg-amber-50',   text: 'text-amber-900',   accent: 'text-amber-600' },
        sky:     { bg: 'bg-sky-50',     text: 'text-sky-900',     accent: 'text-sky-600' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-900', accent: 'text-emerald-600' },
        indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-900',  accent: 'text-indigo-600' },
        red:     { bg: 'bg-red-50',     text: 'text-red-900',     accent: 'text-red-600' },
        // v4.886 — El desembolso. Violeta y no verde a propósito: el verde ya es
        // «Disponible para retiro», y dos tarjetas verdes seguidas se leen como
        // la misma cosa contada dos veces — que es justo la confusión que este
        // indicador existe para deshacer.
        violet:  { bg: 'bg-violet-50',  text: 'text-violet-900',  accent: 'text-violet-600' },
    };
    const p = palette[color];
    const cuerpo = (
        <>
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
            {onFiltrar && (
                <div className={`text-[11px] font-bold mt-2 ${activo ? p.accent : 'text-gray-400'}`}>
                    {activo ? 'Filtrando la lista por este estado' : 'Ver estos aportes →'}
                </div>
            )}
        </>
    );

    const marco = `${p.bg} rounded-2xl p-5 border transition-all text-left w-full`;
    if (!onFiltrar) return <div className={`${marco} border-gray-100`}>{cuerpo}</div>;
    return (
        <button
            type="button"
            onClick={onFiltrar}
            aria-pressed={!!activo}
            className={`${marco} ${activo ? 'border-current ring-2 ring-offset-1 ring-current ' + p.accent : 'border-gray-100 hover:border-gray-300'}`}
        >
            {cuerpo}
        </button>
    );
}
