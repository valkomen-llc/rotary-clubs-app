// ════════════════════════════════════════════════════════════════════
// Control y Justificación de Aportes — el CRITERIO, puro.
// v4.1265
//
// Pedido del Distrito 4281 para la Secretaría Digital 2026-2027: una vista
// dentro de la Bóveda que conteste, aporte por aporte, «¿quién aportó, cuándo,
// cuánto, a qué destino, lo confirmó Stripe, está disponible, se trasladó, y
// hay comprobante del traslado?».
//
// ⚠️ NO DUPLICA NINGUNA TRANSACCIÓN. Lee la MISMA respuesta de
// `GET /financial/donations` que pinta «Aportes recibidos» —aportes con su
// movimiento y los desembolsos de cada movimiento— y sólo la CLASIFICA. No hay
// tabla nueva, ni copia, ni segundo cálculo de saldos.
//
// ⚠️ TRES ESTADOS DISTINTOS QUE NO SE PUEDEN FUNDIR, y es la exigencia expresa
// del pedido («no presentar como transferidos recursos que solamente hayan sido
// cobrados o acreditados»):
//
//   · PAGO       lo que dice Stripe: procesando, confirmado, disponible…
//   · TRASLADO   si el dinero salió hacia un beneficiario, y cuánto.
//   · COMPROBANTE si ese traslado tiene su soporte.
//
// Un pago confirmado NO es un traslado, y un traslado registrado NO es un
// traslado justificado. Cada eje se decide con su propio dato.
//
// ⚠️ NUNCA SE SUMAN MONEDAS. Los indicadores de dinero son por moneda; los
// conteos (cuántos aportes) sí se pueden sumar porque no son dinero.
//
// Puro a propósito —sin React, sin red— para poder probarlo
// (`npm run test:contribution-control`).
// ════════════════════════════════════════════════════════════════════

/** El movimiento de un aporte, en lo que esta vista necesita leer. */
export interface MovimientoControl {
    id: string;
    providerRef?: string | null;
    currency?: string;
    /** El NETO para el sitio —así viaja en `movementOf` (v4.850)—. */
    amount?: number;
    grossAmount?: number;
    status?: string;
    stripeStatus?: string | null;
    bucket?: string | null;
    stripeBalanceTxId?: string | null;
    clubAvailableOn?: string | null;
    origin?: { kind?: string; label?: string; id?: string | null } | null;
    method?: { label?: string } | null;
    receiptNumber?: string | null;
}

export interface AporteControl {
    id: string;
    amount: number;
    currency: string;
    donorName?: string | null;
    donorEmail?: string | null;
    isAnonymous?: boolean;
    date?: string | null;
    movement?: MovimientoControl | null;
}

/** Un desembolso tal como lo publica `listDisbursementsFor` (sin la clave de S3). */
export interface DesembolsoControl {
    id: string;
    amount: number;
    currency?: string;
    status?: string;
    beneficiary?: string | null;
    disbursedAt?: string | null;
    reference?: string | null;
    hasReceipt?: boolean;
    batchRef?: string | null;
}

// ── Los catálogos ────────────────────────────────────────────────────

export const ESTADOS_PAGO = [
    { key: 'procesando', label: 'En procesamiento', help: 'Stripe todavía no confirma el cobro.' },
    { key: 'confirmado', label: 'Confirmado por Stripe', help: 'Cobrado; el proveedor aún retiene el dinero.' },
    { key: 'disponible', label: 'Disponible', help: 'Liberado: el sitio ya puede trasladarlo.' },
    { key: 'reembolsado', label: 'Reembolsado', help: 'Se le devolvió al aportante.' },
    { key: 'fallido', label: 'Fallido', help: 'El cobro no se completó.' },
    { key: 'sin_movimiento', label: 'Sin movimiento asociado', help: 'No se encontró el cobro en la Bóveda. No se inventa uno.' },
] as const;
export type EstadoPago = typeof ESTADOS_PAGO[number]['key'];

export const ESTADOS_TRASLADO = [
    { key: 'trasladado', label: 'Trasladado', help: 'Lo trasladado cubre el neto del aporte.' },
    { key: 'parcial', label: 'Traslado parcial', help: 'Hay traslados, pero no cubren todo el neto.' },
    { key: 'pendiente', label: 'Pendiente de traslado', help: 'El dinero está disponible y no se registró ningún traslado.' },
    { key: 'no_disponible', label: 'Aún no disponible', help: 'No se puede trasladar un dinero que el proveedor todavía retiene.' },
    { key: 'no_aplica', label: 'No aplica', help: 'Reembolsado, fallido o sin movimiento.' },
] as const;
export type EstadoTraslado = typeof ESTADOS_TRASLADO[number]['key'];

export const ESTADOS_COMPROBANTE = [
    { key: 'con_soporte', label: 'Con soporte', help: 'Todos sus traslados tienen comprobante.' },
    { key: 'pendiente', label: 'Comprobante pendiente', help: 'Hay al menos un traslado sin comprobante.' },
    { key: 'sin_traslado', label: 'Sin traslado', help: 'Todavía no hay traslado que justificar.' },
] as const;
export type EstadoComprobante = typeof ESTADOS_COMPROBANTE[number]['key'];

const labelDe = <T extends { key: string; label: string }>(lista: readonly T[], key: string) =>
    lista.find(e => e.key === key)?.label || key;

// ── Clasificar ───────────────────────────────────────────────────────

/** Qué dice Stripe del cobro. Se decide por la CUBETA de la Bóveda, que es el mismo criterio de sus tarjetas. */
export const estadoPagoDe = (mov?: MovimientoControl | null): EstadoPago => {
    if (!mov) return 'sin_movimiento';
    const b = String(mov.bucket || '');
    if (b === 'refunded') return 'reembolsado';
    if (b === 'failed') return 'fallido';
    if (b === 'available') return 'disponible';
    if (b === 'in_transit' || b === 'available_soon') return 'confirmado';
    if (b === 'processing') return 'procesando';
    // Sin cubeta —un servidor anterior—: se lee el estado del cobro. Ante la
    // duda NO se afirma que está confirmado.
    const st = String(mov.status || '').toLowerCase();
    if (st === 'refunded') return 'reembolsado';
    if (st === 'failed') return 'fallido';
    if (st === 'succeeded' || st === 'success' || st === 'paid') return 'confirmado';
    return 'procesando';
};

/** Los decimales de la moneda para comparar sin que un centavo de redondeo cambie el estado. */
const tolerancia = (moneda: string) => (String(moneda).toUpperCase() === 'COP' ? 0.5 : 0.005);

const activos = (ds: DesembolsoControl[] = []) => ds.filter(d => String(d?.status || '') !== 'reversado');

/**
 * Cuánto salió hacia beneficiarios y si cubre el neto.
 *
 * ⚠️ El objetivo es el NETO del movimiento (`amount`), no el bruto: lo que se
 * puede trasladar es lo que quedó después de las retenciones. Un reverso no
 * cuenta: el dinero volvió.
 */
export const estadoTrasladoDe = (mov: MovimientoControl | null | undefined, desembolsos: DesembolsoControl[] = []): EstadoTraslado => {
    const pago = estadoPagoDe(mov);
    if (pago === 'reembolsado' || pago === 'fallido' || pago === 'sin_movimiento') return 'no_aplica';
    const vivos = activos(desembolsos);
    if (!vivos.length) return pago === 'disponible' ? 'pendiente' : 'no_disponible';
    const moneda = mov?.currency || vivos[0]?.currency || 'USD';
    const cubierto = vivos.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const objetivo = Number(mov?.amount) || 0;
    return cubierto + tolerancia(moneda) >= objetivo ? 'trasladado' : 'parcial';
};

/** Si los traslados de este aporte tienen su soporte. Sin traslado no hay nada que justificar todavía. */
export const estadoComprobanteDe = (desembolsos: DesembolsoControl[] = []): EstadoComprobante => {
    const vivos = activos(desembolsos);
    if (!vivos.length) return 'sin_traslado';
    return vivos.every(d => !!d.hasReceipt) ? 'con_soporte' : 'pendiente';
};

export interface FilaControl {
    id: string;
    paymentId: string | null;
    fecha: string | null;
    aportante: string;
    anonimo: boolean;
    correo: string | null;
    destino: string;
    destinoKey: string;
    valor: number;
    neto: number | null;
    moneda: string;
    medioDePago: string | null;
    referenciaStripe: string | null;
    transaccionStripe: string | null;
    disponibleDesde: string | null;
    estadoPago: EstadoPago;
    estadoPagoLabel: string;
    estadoTraslado: EstadoTraslado;
    estadoTrasladoLabel: string;
    trasladado: number;
    beneficiarios: string[];
    ultimoTraslado: string | null;
    referenciasTraslado: string[];
    estadoComprobante: EstadoComprobante;
    estadoComprobanteLabel: string;
}

/**
 * Una fila por aporte. Lo que no está en el registro se deja VACÍO: no se
 * inventa un nombre, un correo ni un comprobante que no existen.
 */
export const filasDeControl = (
    aportes: AporteControl[] = [],
    desembolsosPorMovimiento: Record<string, DesembolsoControl[]> = {},
): FilaControl[] => aportes.map(a => {
    const mov = a.movement || null;
    const ds = mov ? (desembolsosPorMovimiento[mov.id] || []) : [];
    const vivos = activos(ds);
    const moneda = String(a.currency || mov?.currency || 'USD').toUpperCase();
    const pago = estadoPagoDe(mov);
    const traslado = estadoTrasladoDe(mov, ds);
    const comprobante = estadoComprobanteDe(ds);
    const anonimo = !!a.isAnonymous;
    const ultimo = vivos.map(d => d.disbursedAt).filter(Boolean).sort().pop() || null;
    return {
        id: a.id,
        paymentId: mov?.id || null,
        fecha: a.date || null,
        aportante: (a.donorName || '').trim() || (anonimo ? 'Anónimo' : 'Sin nombre registrado'),
        anonimo,
        correo: (a.donorEmail || '').trim() || null,
        destino: mov?.origin?.label || 'Sin destino declarado',
        destinoKey: mov?.origin?.label ? `${mov.origin.kind || 'otro'}:${mov.origin.id || mov.origin.label}` : 'sin_destino',
        valor: Number(a.amount) || 0,
        neto: mov && Number.isFinite(Number(mov.amount)) ? Number(mov.amount) : null,
        moneda,
        medioDePago: mov?.method?.label || null,
        referenciaStripe: mov?.providerRef || null,
        transaccionStripe: mov?.stripeBalanceTxId || null,
        disponibleDesde: mov?.clubAvailableOn || null,
        estadoPago: pago,
        estadoPagoLabel: labelDe(ESTADOS_PAGO, pago),
        estadoTraslado: traslado,
        estadoTrasladoLabel: labelDe(ESTADOS_TRASLADO, traslado),
        trasladado: vivos.reduce((s, d) => s + (Number(d.amount) || 0), 0),
        beneficiarios: [...new Set(vivos.map(d => String(d.beneficiary || '').trim()).filter(Boolean))],
        ultimoTraslado: ultimo,
        referenciasTraslado: [...new Set(vivos.map(d => String(d.reference || d.batchRef || '').trim()).filter(Boolean))],
        estadoComprobante: comprobante,
        estadoComprobanteLabel: labelDe(ESTADOS_COMPROBANTE, comprobante),
    };
});

// ── Indicadores ──────────────────────────────────────────────────────

export interface IndicadoresControl {
    total: number;
    /** ⚠️ Por moneda, nunca sumado entre ellas. */
    recaudadoPorMoneda: Record<string, number>;
    trasladadoPorMoneda: Record<string, number>;
    confirmados: number;
    pendientesDeProcesamiento: number;
    transferidos: number;
    pendientesDeComprobante: number;
    conSoporte: number;
    pendientesDeTraslado: number;
}

/** Los conteos son de APORTES y se suman; el dinero va por moneda. */
export const indicadoresDe = (filas: FilaControl[] = []): IndicadoresControl => {
    const recaudado: Record<string, number> = {};
    const trasladado: Record<string, number> = {};
    let confirmados = 0, procesando = 0, transferidos = 0, pendComp = 0, soporte = 0, pendTraslado = 0;
    for (const f of filas) {
        recaudado[f.moneda] = (recaudado[f.moneda] || 0) + f.valor;
        if (f.trasladado) trasladado[f.moneda] = (trasladado[f.moneda] || 0) + f.trasladado;
        if (f.estadoPago === 'confirmado' || f.estadoPago === 'disponible') confirmados++;
        if (f.estadoPago === 'procesando') procesando++;
        if (f.estadoTraslado === 'trasladado' || f.estadoTraslado === 'parcial') transferidos++;
        if (f.estadoTraslado === 'pendiente') pendTraslado++;
        if (f.estadoComprobante === 'pendiente') pendComp++;
        if (f.estadoComprobante === 'con_soporte') soporte++;
    }
    return {
        total: filas.length,
        recaudadoPorMoneda: recaudado,
        trasladadoPorMoneda: trasladado,
        confirmados,
        pendientesDeProcesamiento: procesando,
        transferidos,
        pendientesDeComprobante: pendComp,
        conSoporte: soporte,
        pendientesDeTraslado: pendTraslado,
    };
};

// ── Filtros ──────────────────────────────────────────────────────────

export const TODOS = 'todos';

/**
 * Los filtros PROPIOS de esta vista. El período y el destino NO están: son los
 * de la barra de la Bóveda, que ya llegan aplicados por el servidor —repetirlos
 * acá daría dos selectores de fechas que podrían decir cosas distintas
 * (regla del período, v4.849)—.
 */
export interface FiltrosControl {
    moneda?: string;
    estadoPago?: string;
    estadoTraslado?: string;
    comprobante?: string;
    aportante?: string;
}

const sinTildes = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const filtrarControl = (filas: FilaControl[] = [], f: FiltrosControl = {}): FilaControl[] => {
    const q = sinTildes(String(f.aportante || '').trim());
    return filas.filter(r => {
        if (f.moneda && f.moneda !== TODOS && r.moneda !== f.moneda) return false;
        if (f.estadoPago && f.estadoPago !== TODOS && r.estadoPago !== f.estadoPago) return false;
        if (f.estadoTraslado && f.estadoTraslado !== TODOS && r.estadoTraslado !== f.estadoTraslado) return false;
        if (f.comprobante && f.comprobante !== TODOS) {
            // «Sin comprobante» es lo que falta justificar: un traslado sin
            // soporte. Un aporte sin traslado no cuenta como «sin comprobante»
            // —no hay nada que respaldar todavía— y tiene su propio estado.
            if (f.comprobante === 'con' && r.estadoComprobante !== 'con_soporte') return false;
            if (f.comprobante === 'sin' && r.estadoComprobante !== 'pendiente') return false;
            if (f.comprobante === 'sin_traslado' && r.estadoComprobante !== 'sin_traslado') return false;
        }
        if (q) {
            const heno = sinTildes(`${r.aportante} ${r.correo || ''} ${r.referenciaStripe || ''}`);
            if (!heno.includes(q)) return false;
        }
        return true;
    });
};

/** Las monedas presentes, para el selector. Salen de los datos, no de una lista. */
export const monedasDe = (filas: FilaControl[] = []) => [...new Set(filas.map(f => f.moneda))].sort();

// ── El informe exportable ────────────────────────────────────────────

export const CABECERAS_CONTROL = [
    'Fecha', 'Aportante', 'Correo', 'Destino', 'Valor', 'Moneda', 'Neto',
    'Medio de pago', 'Referencia Stripe', 'Transacción Stripe', 'Estado del pago',
    'Estado del traslado', 'Trasladado', 'Beneficiario', 'Fecha del traslado',
    'Referencia del traslado', 'Comprobante',
] as const;

const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : '');

/**
 * Una fila del archivo.
 *
 * ⚠️ UN APORTE ANÓNIMO NO LLEVA NOMBRE NI CORREO AL ARCHIVO (regla de v4.850):
 * en pantalla los ve quien administra; un archivo va a una junta o por correo.
 */
export const filaComoArrayControl = (r: FilaControl): (string | number)[] => [
    fechaCorta(r.fecha),
    r.anonimo ? 'Anónimo' : r.aportante,
    r.anonimo ? '' : (r.correo || ''),
    r.destino,
    r.valor,
    r.moneda,
    r.neto ?? '',
    r.medioDePago || '',
    r.referenciaStripe || '',
    r.transaccionStripe || '',
    r.estadoPagoLabel,
    r.estadoTrasladoLabel,
    r.trasladado || 0,
    r.beneficiarios.join(', '),
    fechaCorta(r.ultimoTraslado),
    r.referenciasTraslado.join(', '),
    r.estadoComprobanteLabel,
];

export interface InformeControl {
    sitio: string;
    periodo: string;
    destino: string;
    filtros: string[];
    emitido: Date;
    emitidoPor: string | null;
    filas: FilaControl[];
    indicadores: IndicadoresControl;
}

export const informeControl = ({ sitio, periodo, destino, filtros = [], filas, emitidoPor = null, emitido = new Date() }: {
    sitio: string; periodo: string; destino: string; filtros?: string[]; filas: FilaControl[];
    emitidoPor?: string | null; emitido?: Date;
}): InformeControl => ({
    sitio, periodo, destino, filtros, emitido, emitidoPor, filas, indicadores: indicadoresDe(filas),
});

/** El contexto VA DENTRO del archivo (regla de v4.850): quien lo abra en seis meses no tiene la pantalla. */
export const contextoControl = (inf: InformeControl): [string, string][] => {
    const i = inf.indicadores;
    const filas: [string, string][] = [
        ['Informe', 'Control y Justificación de Aportes'],
        ['Sitio', inf.sitio],
        ['Período', inf.periodo],
        ['Destino', inf.destino],
        ['Filtros', inf.filtros.length ? inf.filtros.join(' · ') : 'Ninguno'],
        ['Emitido', inf.emitido.toLocaleString('es-CO', { timeZone: 'America/Bogota' })],
    ];
    if (inf.emitidoPor) filas.push(['Emitido por', inf.emitidoPor]);
    filas.push(['Aportes', String(i.total)]);
    // ⚠️ Una línea POR MONEDA. Nunca un total que las sume.
    for (const [m, v] of Object.entries(i.recaudadoPorMoneda).sort()) {
        filas.push([`Recaudado ${m}`, v.toLocaleString('es-CO', { maximumFractionDigits: 2 })]);
    }
    for (const [m, v] of Object.entries(i.trasladadoPorMoneda).sort()) {
        filas.push([`Trasladado ${m}`, v.toLocaleString('es-CO', { maximumFractionDigits: 2 })]);
    }
    filas.push(['Confirmados por Stripe', String(i.confirmados)]);
    filas.push(['Pendientes de procesamiento', String(i.pendientesDeProcesamiento)]);
    filas.push(['Con traslado registrado', String(i.transferidos)]);
    filas.push(['Pendientes de traslado', String(i.pendientesDeTraslado)]);
    filas.push(['Pendientes de comprobante', String(i.pendientesDeComprobante)]);
    filas.push(['Con soporte disponible', String(i.conSoporte)]);
    filas.push(['Nota', 'Un pago confirmado no es un traslado, y un traslado sin comprobante no está justificado. Los importes no se suman entre monedas.']);
    return filas;
};

const celda = (v: string | number): string => {
    if (typeof v === 'number') return String(v);
    const s = String(v ?? '');
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV con BOM y punto y coma, por los mismos motivos que el de la Bóveda (v4.850). */
export const aCSVControl = (inf: InformeControl): string => {
    const lineas: string[] = [];
    for (const [k, v] of contextoControl(inf)) lineas.push(`${celda(k)};${celda(v)}`);
    lineas.push('');
    lineas.push(CABECERAS_CONTROL.map(celda).join(';'));
    for (const r of inf.filas) lineas.push(filaComoArrayControl(r).map(celda).join(';'));
    return `﻿${lineas.join('\r\n')}`;
};

export const nombreArchivoControl = (inf: InformeControl, ext: string): string => {
    const limpio = (s: string) => String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    const d = inf.emitido;
    const dia = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `control-aportes-${limpio(inf.sitio) || 'sitio'}-${dia}.${ext}`;
};

export default {
    ESTADOS_PAGO, ESTADOS_TRASLADO, ESTADOS_COMPROBANTE, TODOS,
    estadoPagoDe, estadoTrasladoDe, estadoComprobanteDe, filasDeControl, indicadoresDe,
    filtrarControl, monedasDe, CABECERAS_CONTROL, filaComoArrayControl,
    informeControl, contextoControl, aCSVControl, nombreArchivoControl,
};
