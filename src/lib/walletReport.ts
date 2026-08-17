// El INFORME de la Bóveda. Puro: sin red, sin DOM, sin librerías.
//
// v4.850 — Bloque B. Arma la estructura que consumen los TRES formatos —Excel,
// CSV y PDF— desde un solo sitio. Escribir cada uno por su cuenta daría tres
// informes que se separan en silencio: es la razón por la que `buildPiece` es
// único en las Infografías de Campaña y por la que el Generador de Diseños
// tiene un solo grafo de escena.
//
// ═════════════════════════════════════════════════════════════════════
// LO QUE SE EXPORTA ES LO QUE SE VE, Y EL ARCHIVO LO DICE
// ═════════════════════════════════════════════════════════════════════
//
// Un Excel descargado hace un mes tiene que poder interpretarse solo: por eso
// el filtro aplicado, la moneda y la fecha de emisión van IMPRESOS dentro del
// archivo y no sólo en su nombre.
//
// Y una fila por moneda, nunca una columna «total» que las mezcle. Es la regla
// del módulo desde v4.841 y en un archivo pesa más que en pantalla: la pantalla
// se corrige, un archivo que alguien archivó, no.

import { formatMoney } from './locale';

export interface FilaInforme {
    fecha: string;
    aportante: string;
    correo: string;
    destino: string;
    metodo: string;
    bruto: number;
    procesador: number;
    plataforma: number;
    neto: number;
    estado: string;
    /** 'medida' cuando la comisión la devolvió el proveedor con su tasa
     *  declarada; 'estimada' cuando se dedujo o se calculó con la tarifa
     *  publicada. Presentarlas igual es lo que hace que un informe deje de
     *  servir para cuadrar. */
    base: 'medida' | 'estimada';
    referencia: string;
}

export interface Informe {
    club: string;
    moneda: string;
    emitido: Date;
    periodo: { label: string; desde: string | null; hasta: string | null };
    destino: string;
    filas: FilaInforme[];
    totales: { bruto: number; procesador: number; plataforma: number; neto: number };
    /** El saldo ACTUAL, que no es del período. Va aparte y rotulado, o se leería
     *  como si el filtro lo hubiera calculado. */
    saldoActual: number;
    avisos: string[];
}

const ESTADOS: Record<string, string> = {
    in_transit: 'En tránsito',
    available_soon: 'Disponible próximamente',
    available: 'Disponible para retiro',
    processing: 'Procesando',
    refunded: 'Reembolsado',
    failed: 'Fallido',
};

/** La fecha, corta y legible. En un archivo no se pone la hora salvo que
 *  importe: una columna de fechas se lee de un vistazo y la hora la ensucia. */
const fecha = (v: unknown): string => {
    const d = new Date(String(v || ''));
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('es-CO') : '';
};

/**
 * Una fila del informe a partir de un aporte de la pantalla.
 *
 * ⚠️ UN APORTE ANÓNIMO NO LLEVA CORREO. El donante pidió no figurar, y aunque
 * la pantalla ya muestra «Anónimo» en el nombre, el correo sigue guardado y se
 * habría colado en un archivo que va a una junta o a un correo. Un dato que en
 * pantalla es de quien administra el sitio deja de serlo en cuanto se
 * descarga.
 */
export const filaDe = (d: any): FilaInforme => {
    const m = d?.movement || null;
    const anonimo = !!d?.isAnonymous;
    return {
        fecha: fecha(d?.date),
        aportante: anonimo ? 'Anónimo' : (d?.donorName || 'Sin nombre'),
        correo: anonimo ? '' : (d?.donorEmail || ''),
        destino: m?.origin?.label || 'Sin destino declarado',
        metodo: m?.method?.label || '',
        bruto: Number(d?.amount) || 0,
        // ⚠️ LOS NOMBRES DE `movementOf` NO SON LOS DE LA COLUMNA DE LA BASE.
        // La retención de la plataforma viaja como `applicationFee` y el neto
        // como `amount`; en la tabla se llaman `applicationFee` y `netAmount`.
        // Leerlos con el nombre de la columna no da error: da `undefined`, que
        // cae a cero — y una columna entera del informe sale en cero pareciendo
        // un dato. Van tres veces con este mismo tropiezo (el resumen del
        // período, la base de la comisión y esta línea).
        procesador: Number(m?.stripeFee) || 0,
        plataforma: Number(m?.applicationFee) || 0,
        neto: Number(m?.amount) || 0,
        estado: m?.bucket ? (ESTADOS[m.bucket] || m.bucket) : 'Sin movimiento asociado',
        // Sólo es MEDIDA si el proveedor la devolvió —`stripeBalanceTxId` es la
        // prueba de que se leyó el balance transaction— y, cuando hubo
        // conversión, con una tasa declarada. Todo lo demás es una cuenta
        // nuestra.
        //
        // ⚠️ Los nombres son los de `movementOf`: `stripeFeeRate` y
        // `stripeFeeConverted`, no `feeRate` ni `feeConverted`. Leerlos mal no
        // da error —da `undefined`— y TODA fila habría salido «Estimada»,
        // incluidas las que sí se midieron. Es el mismo tropiezo que el
        // `applicationFee` del resumen del período.
        base: m?.stripeBalanceTxId && (!m.stripeFeeConverted || m.stripeFeeRate != null)
            ? 'medida' : 'estimada',
        referencia: m?.receiptNumber || m?.providerRef || '',
    };
};

/**
 * El informe completo, para UNA moneda.
 *
 * La moneda es obligatoria y no tiene valor por omisión: un informe «de todas
 * las monedas» exigiría una columna total que las sume, que es exactamente lo
 * que este módulo no hace. Para dos monedas se emiten dos informes.
 */
export const buildInforme = ({
    club, moneda, donations, periodo, destinoLabel, saldoActual, ahora = new Date(),
}: {
    club: string;
    moneda: string;
    donations: any[];
    periodo: { label: string; desde: string | null; hasta: string | null; excluidos?: number };
    destinoLabel: string;
    saldoActual: number;
    ahora?: Date;
}): Informe => {
    const filas = (donations || [])
        .filter(d => String(d?.currency || '').toUpperCase() === String(moneda).toUpperCase())
        .map(filaDe);

    const totales = filas.reduce(
        (acc, f) => ({
            bruto: acc.bruto + f.bruto,
            procesador: acc.procesador + f.procesador,
            plataforma: acc.plataforma + f.plataforma,
            neto: acc.neto + f.neto,
        }),
        { bruto: 0, procesador: 0, plataforma: 0, neto: 0 }
    );

    // Los avisos van DENTRO del archivo, no en la pantalla que lo generó. Quien
    // lo abra dentro de seis meses no tiene la pantalla delante.
    const avisos: string[] = [];
    const estimadas = filas.filter(f => f.base === 'estimada').length;
    if (estimadas > 0) {
        avisos.push(
            `${estimadas} de ${filas.length} aporte(s) llevan la tarifa de procesamiento ESTIMADA: ` +
            `no se pudo leer del proveedor con una tasa declarada. Su neto es aproximado.`
        );
    }
    const sinMovimiento = filas.filter(f => f.estado === 'Sin movimiento asociado').length;
    if (sinMovimiento > 0) {
        avisos.push(
            `${sinMovimiento} aporte(s) no tienen movimiento asociado: su bruto está contado y sus ` +
            `retenciones no, así que el neto del período les queda de más.`
        );
    }
    if (periodo?.excluidos) {
        avisos.push(`${periodo.excluidos} aporte(s) quedaron fuera del filtro aplicado.`);
    }
    // ⚠️ Sin esta línea, el saldo impreso arriba se leería como si fuera el del
    // período. Es la misma regla que el aviso de la pantalla.
    avisos.push('El saldo disponible es el actual a la fecha de emisión, no el del período.');

    return {
        club, moneda: String(moneda).toUpperCase(), emitido: ahora,
        periodo: { label: periodo?.label || '', desde: periodo?.desde || null, hasta: periodo?.hasta || null },
        destino: destinoLabel,
        filas, totales, saldoActual, avisos,
    };
};

/** El nombre del archivo. Lleva el sitio, la moneda y la fecha: tres informes
 *  descargados el mismo día no pueden llamarse igual. */
export const nombreArchivo = (informe: Informe, ext: string): string => {
    const limpio = (s: string) => String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    const dia = informe.emitido.toISOString().slice(0, 10);
    return `boveda-${limpio(informe.club) || 'sitio'}-${informe.moneda.toLowerCase()}-${dia}.${ext}`;
};

/** Las cabeceras del informe, en el orden en que se leen. */
export const CABECERAS = [
    'Fecha', 'Aportante', 'Correo', 'Destino', 'Método de pago',
    'Bruto', 'Tarifa de procesamiento', 'Retención de la plataforma', 'Neto',
    'Estado del dinero', 'Base de la comisión', 'Referencia',
] as const;

/** La fila como array, en el orden de `CABECERAS`. Lo consumen los tres
 *  formatos: un orden por formato los dejaría separarse. */
export const filaComoArray = (f: FilaInforme): (string | number)[] => [
    f.fecha, f.aportante, f.correo, f.destino, f.metodo,
    f.bruto, f.procesador, f.plataforma, f.neto,
    f.estado, f.base === 'medida' ? 'Medida' : 'Estimada', f.referencia,
];

/** Las líneas de contexto que van arriba de la tabla en TODOS los formatos.
 *  Sin ellas, un archivo de hace un mes no se puede interpretar. */
export const contextoDe = (informe: Informe): [string, string][] => {
    const rango = informe.periodo.desde || informe.periodo.hasta
        ? `${informe.periodo.desde ? new Date(informe.periodo.desde).toLocaleDateString('es-CO') : '…'}` +
          ` a ${informe.periodo.hasta ? new Date(informe.periodo.hasta).toLocaleDateString('es-CO') : '…'}`
        : 'sin límite de fechas';
    return [
        ['Sitio', informe.club],
        ['Moneda', informe.moneda],
        ['Período', `${informe.periodo.label} (${rango})`],
        ['Destino', informe.destino],
        ['Emitido', informe.emitido.toLocaleString('es-CO')],
        ['Aportes en el período', String(informe.filas.length)],
        ['Bruto del período', formatMoney(informe.totales.bruto, informe.moneda)],
        ['Tarifa de procesamiento', formatMoney(informe.totales.procesador, informe.moneda)],
        ['Retención de la plataforma', formatMoney(informe.totales.plataforma, informe.moneda)],
        ['Neto del período', formatMoney(informe.totales.neto, informe.moneda)],
        ['Saldo disponible (actual)', formatMoney(informe.saldoActual, informe.moneda)],
    ];
};

export default { filaDe, buildInforme, nombreArchivo, CABECERAS, filaComoArray, contextoDe };
