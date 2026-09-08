// ════════════════════════════════════════════════════════════════════
// EL COMPROBANTE CONSOLIDADO DE UN TRASLADO — v4.1014
//
// Un PDF con el desglose completo del giro: beneficiario, campaña, período,
// moneda, fecha, referencia bancaria, la lista de aportes con su bruto, su
// comisión, su retención y su neto, y el total general.
//
// ⚠️ SE COMPONE EN EL SERVIDOR, Y ESO NO CONTRADICE LA REGLA DE LAS FUENTES.
//
// La regla del sitio (v4.794) dice que componer texto en el servidor saca
// cuadritos: es cierta y es sobre **sharp rasterizando un SVG**, que necesita
// una fuente instalada y en Vercel no hay ninguna. Un PDF es otra cosa: las
// catorce fuentes base de PostScript —Helvetica entre ellas— las trae el
// visor, no el servidor, así que se referencian y no se incrustan. Medido en
// este proyecto: `jsPDF` en Node escribe «Ñandú áéíóú ÁÉ» correcto.
//
// Tenía que ser el servidor porque el documento viaja ADJUNTO al correo, y el
// correo lo manda el servidor. Con el PDF compuesto en el navegador, un
// reenvío sólo podría salir si alguien tiene la pantalla abierta.
//
// ⚠️ `jspdf` SE IMPORTA PEREZOSAMENTE. Es la lección de rendimiento de v4.659:
// una dependencia cargada en el arranque en frío la paga la primera visita de
// TODO el sitio, y esto hace falta en una ruta que se usa unas pocas veces al
// mes.
//
// ⚠️ NUNCA LANZA. Un fallo componiendo el documento no puede costar el envío:
// el correo lleva la tabla completa en su cuerpo desde v4.996, así que sin
// adjunto la conciliación sigue siendo legible. Se devuelve el motivo y quien
// envía decide.
// ════════════════════════════════════════════════════════════════════

import {
    RECONCILIATION_NOTE, processorFeeOf,
    reconciliationTotals, toWinAnsi, columnsForScope,
} from './reconciliationSpec.js';
import { batchRef, moneyWithCode, shortDate, paymentRef, donorLine } from './disbursementBatch.js';

const AZUL = [23, 69, 143];
const TINTA = [15, 23, 42];
const GRIS = [100, 116, 139];

/** El importe sin el símbolo, para que la columna se pueda leer en línea. El
 *  código de la moneda va en la cabecera del documento, una sola vez. */
const cifra = (n, decimales = 2) => {
    const v = Number(n) || 0;
    try {
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: decimales, maximumFractionDigits: decimales,
        }).format(v);
    } catch {
        return v.toFixed(decimales);
    }
};

/** El nombre del archivo. Lleva la referencia del traslado, que es lo que se
 *  busca cuando hay veinte en una carpeta. */
export const reconciliationFilename = (batch = {}) => {
    // ⚠️ LA REFERENCIA DECLARADA MANDA. Una conciliación consolidada trae la
    // suya (`CONC-…`) y NO tiene id de lote: componerla con `batchRef(null)`
    // daría `conciliacion-traslado.pdf` para todas.
    const ref = String(batch.ref || batchRef(batch.id) || 'traslado').replace(/[^A-Za-z0-9._-]/g, '');
    return `conciliacion-${ref}.pdf`;
};

/** De qué MOVIMIENTO salió una fila. En una consolidada es la columna que hace
 *  auditable el documento; en la de un lote no se pinta, porque el traslado ya
 *  está en la cabecera y repetirlo ocho veces es ruido. */
const movimientoDe = (it = {}) => (
    it.batchId
        ? batchRef(it.batchId)
        : (it.disbursementId ? `MOV-${String(it.disbursementId).replace(/-/g, '').slice(-8).toUpperCase()}` : '')
);

/**
 * Las filas del documento, ya formateadas. Se exporta porque las consumen el
 * PDF y el CSV: con dos armados, los dos documentos del mismo traslado
 * dirían cifras distintas.
 */
export const reconciliationRows = (items = [], currency = 'USD') => {
    const decimales = String(currency).toUpperCase() === 'COP' ? 0 : 2;
    return (Array.isArray(items) ? items : [])
        .filter(i => i?.status !== 'reversado')
        .map(it => {
            const d = donorLine(it);
            return {
                donante: d.name,
                correo: d.email,
                fecha: shortDate(it.date || it.createdAt),
                referencia: paymentRef(it.paymentId),
                traslado: movimientoDe(it),
                trasladoFecha: shortDate(it.disbursedAt),
                bruto: cifra(it.gross, decimales),
                comision: cifra(processorFeeOf(it), decimales),
                retencion: cifra(it.platformFee, decimales),
                neto: cifra(it.amount, decimales),
                estado: 'Trasladado',
            };
        });
};

/**
 * El CSV de la conciliación.
 *
 * ⚠️ CON BOM Y PUNTO Y COMA, la regla de v4.850: sin BOM, Excel abre los
 * acentos como «RodrÃ­go»; con coma, en configuración regional española mete
 * toda la fila en una sola columna. Un CSV que Excel abre mal es un CSV que
 * nadie usa.
 */
export const buildReconciliationCsv = ({ batch = {}, items = [], campaign = null, scope = 'traslado' } = {}) => {
    const currency = String(batch.currency || 'USD').toUpperCase();
    const t = reconciliationTotals(items);
    const decimales = currency === 'COP' ? 0 : 2;
    const consolidada = scope === 'seleccion';
    const cols = columnsForScope(scope);
    const cita = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [];

    lineas.push(cita(consolidada ? 'Conciliación consolidada de aportes trasladados' : 'Conciliación de aportes trasladados'));
    lineas.push([cita(consolidada ? 'Referencia de la conciliación' : 'Traslado'), cita(batch.ref || batchRef(batch.id))].join(';'));
    lineas.push([cita('Beneficiario'), cita(batch.beneficiary || '')].join(';'));
    if (campaign?.name || batch.campaignName) lineas.push([cita('Campaña'), cita(campaign?.name || batch.campaignName)].join(';'));
    lineas.push([cita('Moneda'), cita(currency)].join(';'));
    lineas.push([
        cita(consolidada ? 'Fechas de los traslados' : 'Fecha del traslado'),
        cita(consolidada ? (batch.dateLabel || '') : shortDate(batch.disbursedAt)),
    ].join(';'));
    if (batch.reference) lineas.push([cita('Referencia bancaria'), cita(batch.reference)].join(';'));
    lineas.push([cita('Aportes'), cita(t.count)].join(';'));

    // ⚠️ LOS MOVIMIENTOS DE ORIGEN, UNO POR UNO. Es la exigencia del pedido:
    // el documento conserva la referencia de cada operación original.
    if (consolidada && (batch.sources || []).length) {
        lineas.push('');
        lineas.push(cita('Movimientos de origen'));
        lineas.push([cita('Referencia'), cita('Tipo'), cita('Fecha'), cita('Medio'), cita('Referencia bancaria'), cita('Aportes incluidos')].join(';'));
        for (const f of batch.sources) {
            lineas.push([
                cita(f.ref), cita(f.kind === 'lote' ? 'Traslado agrupado' : 'Giro suelto'),
                cita(shortDate(f.date)), cita(f.method || ''), cita(f.bankRef || ''),
                cita(f.total > 1 ? `${f.count} de ${f.total}` : String(f.count)),
            ].join(';'));
        }
    }
    lineas.push('');

    lineas.push([...cols.map(c => cita(c.label)), cita('Correo')].join(';'));
    for (const f of reconciliationRows(items, currency)) {
        const base = [cita(f.donante), cita(f.fecha), cita(f.referencia)];
        if (consolidada) base.push(cita(f.traslado));
        lineas.push([
            ...base,
            cita(f.bruto), cita(f.comision), cita(f.retencion), cita(f.neto), cita(f.estado),
            cita(f.correo),
        ].join(';'));
    }
    lineas.push('');
    lineas.push([cita('TOTAL'), '', '', ...(consolidada ? [''] : []),
        cita(cifra(t.bruto, decimales)), cita(cifra(t.comision, decimales)),
        cita(cifra(t.retencion, decimales)), cita(cifra(t.neto, decimales)), ''].join(';'));

    // El BOM va delante de todo.
    return `﻿${lineas.join('\r\n')}\r\n`;
};

/**
 * El PDF. Devuelve `{ ok, buffer, filename, bytes }` o `{ ok:false, error }`.
 */
export const buildReconciliationPdf = async ({ batch = {}, items = [], site = {}, campaign = null, scope = 'traslado' } = {}) => {
    try {
        const mod = await import('jspdf');
        const JsPDF = mod.jsPDF || mod.default;
        if (!JsPDF) return { ok: false, error: 'jspdf no expuso el constructor' };

        const currency = String(batch.currency || 'USD').toUpperCase();
        const decimales = currency === 'COP' ? 0 : 2;
        const consolidada = scope === 'seleccion';
        const t = reconciliationTotals(items);
        const filas = reconciliationRows(items, currency);

        // Horizontal: son ocho columnas y en vertical obligarían a una letra
        // que no se lee (la lección del PDF de la Bóveda, v4.850).
        const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
        const ancho = doc.internal.pageSize.getWidth();
        const alto = doc.internal.pageSize.getHeight();
        const M = 40;
        let y = 48;

        // ⚠️ TODO texto pasa por `toWinAnsi`. Un guion largo desaparece en
        // silencio de una fuente base-14 y esto es un documento financiero.
        const T = (texto, x, opciones) => doc.text(toWinAnsi(texto), x, y, opciones);
        // ⚠️ EL SALTO DE PÁGINA NO PUEDE LLAMAR A `pintarCabeceraTabla`
        // DIRECTAMENTE. Esa función lee `cols` y `xs`, que son `const`
        // declaradas MÁS ABAJO: un salto de página en la ficha del traslado
        // —antes de la tabla— caería en la zona muerta y reventaría con un
        // ReferenceError que el typecheck no ve (la lección de los
        // `useCallback` de v4.729). Se cuelga cuando la tabla ya existe.
        let alPasarPagina = null;
        const salto = (necesario = 16) => {
            if (y + necesario > alto - 48) { doc.addPage(); y = 48; alPasarPagina?.(); }
        };

        // ── Cabecera ─────────────────────────────────────────────────
        doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...TINTA);
        T(consolidada ? 'Conciliación consolidada de aportes trasladados' : 'Conciliación de aportes trasladados', M); y += 20;
        doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GRIS);
        T(site?.name || '', M); y += 22;

        // ── La ficha del traslado ────────────────────────────────────
        doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...AZUL);
        T(consolidada ? 'Documento' : 'Traslado', M); y += 15;
        doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...TINTA);
        const fuentes = Array.isArray(batch.sources) ? batch.sources : [];
        const ficha = consolidada
            ? [
                // ⚠️ «Referencia de la conciliación», NO «del traslado». Este
                // documento abarca varios movimientos y no corresponde a
                // ninguna transferencia sola: darle un `LOTE-` afirmaría una
                // que el banco nunca vio.
                ['Referencia de la conciliación', batch.ref || ''],
                ['Beneficiario', batch.beneficiary || '—'],
                ...(campaign?.name || batch.campaignName ? [['Campaña', campaign?.name || batch.campaignName]] : []),
                ['Moneda', currency],
                ['Fechas de los traslados', batch.dateLabel || ''],
                ['Movimientos de origen', String(fuentes.length)],
                ['Aportes conciliados', String(t.count)],
            ]
            : [
                ['Referencia del traslado', batch.ref || batchRef(batch.id)],
                ['Beneficiario', batch.beneficiary || '—'],
                ...(campaign?.name || batch.campaignName ? [['Campaña', campaign?.name || batch.campaignName]] : []),
                ['Moneda', currency],
                ['Fecha del traslado', shortDate(batch.disbursedAt)],
                ['Medio', batch.methodLabel || batch.method || ''],
                ...(batch.reference ? [['Referencia bancaria', batch.reference]] : []),
                ['Aportes conciliados', String(t.count)],
            ];
        for (const [k, v] of ficha) {
            salto();
            doc.setTextColor(...GRIS); T(k, M + 8);
            doc.setTextColor(...TINTA); T(String(v), M + 200);
            y += 14;
        }
        y += 10;

        // ── LOS MOVIMIENTOS DE ORIGEN ────────────────────────────────
        // ⚠️ ES LO QUE HACE AUDITABLE UNA CONSOLIDADA. Sin esta lista, ocho
        // filas que salieron de tres transferencias distintas no se pueden
        // cruzar contra ningún extracto — y el pedido lo exige textual: «el
        // documento debe conservar la referencia de cada movimiento».
        if (consolidada && fuentes.length) {
            doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...AZUL);
            T('Movimientos de origen', M); y += 15;
            doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TINTA);
            for (const f of fuentes) {
                salto(14);
                const tipo = f.kind === 'lote' ? 'Traslado agrupado' : 'Giro suelto';
                const cobertura = f.total > 1 && f.count < f.total
                    ? ` · ${f.count} de sus ${f.total} aportes`
                    : '';
                doc.setTextColor(...TINTA); T(String(f.ref || ''), M + 8);
                doc.setTextColor(...GRIS);
                T(`${tipo} · ${shortDate(f.date)}${f.method ? ` · ${f.method}` : ''}${f.bankRef ? ` · ref. ${f.bankRef}` : ''}${cobertura}`, M + 130);
                y += 13;
            }
            y += 12;
        }

        // ── El aviso que lo distingue de un traslado nuevo ───────────
        doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...GRIS);
        for (const linea of doc.splitTextToSize(toWinAnsi(RECONCILIATION_NOTE), ancho - M * 2)) {
            salto(12); doc.text(linea, M, y); y += 12;
        }
        y += 14;

        // ── La tabla ─────────────────────────────────────────────────
        // Anchos declarados: el aportante se lleva lo que sobra y las cifras
        // van a la derecha, que es como se lee una columna de dinero.
        const util = ancho - M * 2;
        // La consolidada suma «Traslado de origen» y las cifras se aprietan un
        // poco: el ancho es el mismo y la columna tiene que caber sin recortar
        // ninguna referencia.
        const fijos = consolidada
            ? [62, 66, 80, 70, 70, 70, 80, 62]  // fecha, ref, TRASLADO, bruto, comisión, retención, neto, estado
            : [70, 70, 78, 78, 78, 88, 74];     // fecha, ref, bruto, comisión, retención, neto, estado
        const anchoDonante = util - fijos.reduce((a, b) => a + b, 0);
        const cols = [anchoDonante, ...fijos];
        const xs = cols.reduce((acc, w, i) => { acc.push(i === 0 ? M : acc[i - 1] + cols[i - 1]); return acc; }, []);
        // Las cuatro columnas de dinero, corridas una posición en la
        // consolidada. Se DERIVAN de dónde empiezan: escritas a mano dos
        // veces, agregar una columna dejaría los importes alineados a la
        // izquierda sin que nada avisara.
        const primeraCifra = consolidada ? 4 : 3;
        const derecha = new Set([primeraCifra, primeraCifra + 1, primeraCifra + 2, primeraCifra + 3]);
        const COLUMNAS = columnsForScope(scope);

        function pintarCabeceraTabla() {
            doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...GRIS);
            COLUMNAS.forEach((c, i) => {
                const x = derecha.has(i) ? xs[i] + cols[i] - 4 : xs[i];
                doc.text(toWinAnsi(c.label), x, y, { align: derecha.has(i) ? 'right' : 'left', maxWidth: cols[i] - 4 });
            });
            y += 6;
            doc.setDrawColor(200).setLineWidth(0.6).line(M, y, ancho - M, y);
            y += 12;
        }

        doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...AZUL);
        T(`Aportes (${t.count})`, M); y += 16;
        alPasarPagina = pintarCabeceraTabla;
        pintarCabeceraTabla();

        doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...TINTA);
        for (const f of filas) {
            salto(20);
            const valores = consolidada
                ? [f.donante, f.fecha, f.referencia, f.traslado, f.bruto, f.comision, f.retencion, f.neto, f.estado]
                : [f.donante, f.fecha, f.referencia, f.bruto, f.comision, f.retencion, f.neto, f.estado];
            valores.forEach((v, i) => {
                const x = derecha.has(i) ? xs[i] + cols[i] - 4 : xs[i];
                doc.text(toWinAnsi(String(v)), x, y, { align: derecha.has(i) ? 'right' : 'left', maxWidth: cols[i] - 4 });
            });
            // El correo del aportante va debajo, en gris y pequeño: la fila
            // tiene que caber sin partir el nombre.
            if (f.correo) {
                y += 10;
                doc.setFontSize(7.5).setTextColor(...GRIS);
                doc.text(toWinAnsi(f.correo), xs[0], y, { maxWidth: cols[0] - 4 });
                doc.setFontSize(8.5).setTextColor(...TINTA);
            }
            y += 6;
            doc.setDrawColor(232).setLineWidth(0.4).line(M, y, ancho - M, y);
            y += 12;
        }

        // ── El total ─────────────────────────────────────────────────
        salto(30);
        y += 4;
        doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...TINTA);
        const totales = [
            'TOTAL GENERAL', '', '', ...(consolidada ? [''] : []),
            cifra(t.bruto, decimales), cifra(t.comision, decimales),
            cifra(t.retencion, decimales), cifra(t.neto, decimales), '',
        ];
        totales.forEach((v, i) => {
            if (!v) return;
            const x = derecha.has(i) ? xs[i] + cols[i] - 4 : xs[i];
            doc.text(toWinAnsi(String(v)), x, y, { align: derecha.has(i) ? 'right' : 'left', maxWidth: cols[i] - 4 });
        });
        y += 18;
        doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...AZUL);
        T(`Neto trasladado: ${moneyWithCode(t.neto, currency)}`, M); y += 22;

        // ── El pie ───────────────────────────────────────────────────
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS);
        const emitido = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
        doc.text(toWinAnsi(`Documento generado automáticamente el ${emitido}. Cifras en ${currency}.`), M, alto - 30);

        const buffer = Buffer.from(doc.output('arraybuffer'));
        return {
            ok: true,
            buffer,
            filename: reconciliationFilename(batch),
            bytes: buffer.length,
            mime: 'application/pdf',
        };
    } catch (e) {
        console.error('[CONCILIACIÓN] no pude componer el PDF:', e?.message);
        return { ok: false, error: e?.message || 'no se pudo componer el documento' };
    }
};

export default { buildReconciliationPdf, buildReconciliationCsv, reconciliationRows, reconciliationFilename };
