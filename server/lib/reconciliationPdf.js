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
    RECONCILIATION_COLUMNS, RECONCILIATION_NOTE, processorFeeOf,
    reconciliationTotals, toWinAnsi,
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
    const ref = String(batchRef(batch.id) || 'traslado').replace(/[^A-Za-z0-9._-]/g, '');
    return `conciliacion-${ref}.pdf`;
};

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
export const buildReconciliationCsv = ({ batch = {}, items = [], campaign = null } = {}) => {
    const currency = String(batch.currency || 'USD').toUpperCase();
    const t = reconciliationTotals(items);
    const decimales = currency === 'COP' ? 0 : 2;
    const cita = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [];

    lineas.push(cita('Conciliación de aportes trasladados'));
    lineas.push([cita('Traslado'), cita(batchRef(batch.id))].join(';'));
    lineas.push([cita('Beneficiario'), cita(batch.beneficiary || '')].join(';'));
    if (campaign?.name || batch.campaignName) lineas.push([cita('Campaña'), cita(campaign?.name || batch.campaignName)].join(';'));
    lineas.push([cita('Moneda'), cita(currency)].join(';'));
    lineas.push([cita('Fecha del traslado'), cita(shortDate(batch.disbursedAt))].join(';'));
    if (batch.reference) lineas.push([cita('Referencia bancaria'), cita(batch.reference)].join(';'));
    lineas.push([cita('Aportes'), cita(t.count)].join(';'));
    lineas.push('');

    lineas.push([...RECONCILIATION_COLUMNS.map(c => cita(c.label)), cita('Correo')].join(';'));
    for (const f of reconciliationRows(items, currency)) {
        lineas.push([
            cita(f.donante), cita(f.fecha), cita(f.referencia),
            cita(f.bruto), cita(f.comision), cita(f.retencion), cita(f.neto), cita(f.estado),
            cita(f.correo),
        ].join(';'));
    }
    lineas.push('');
    lineas.push([cita('TOTAL'), '', '', cita(cifra(t.bruto, decimales)), cita(cifra(t.comision, decimales)),
        cita(cifra(t.retencion, decimales)), cita(cifra(t.neto, decimales)), ''].join(';'));

    // El BOM va delante de todo.
    return `﻿${lineas.join('\r\n')}\r\n`;
};

/**
 * El PDF. Devuelve `{ ok, buffer, filename, bytes }` o `{ ok:false, error }`.
 */
export const buildReconciliationPdf = async ({ batch = {}, items = [], site = {}, campaign = null } = {}) => {
    try {
        const mod = await import('jspdf');
        const JsPDF = mod.jsPDF || mod.default;
        if (!JsPDF) return { ok: false, error: 'jspdf no expuso el constructor' };

        const currency = String(batch.currency || 'USD').toUpperCase();
        const decimales = currency === 'COP' ? 0 : 2;
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
        T('Conciliación de aportes trasladados', M); y += 20;
        doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...GRIS);
        T(site?.name || '', M); y += 22;

        // ── La ficha del traslado ────────────────────────────────────
        doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...AZUL);
        T('Traslado', M); y += 15;
        doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...TINTA);
        const ficha = [
            ['Referencia del traslado', batchRef(batch.id)],
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
        const fijos = [70, 70, 78, 78, 78, 88, 74];   // fecha, ref, bruto, comisión, retención, neto, estado
        const anchoDonante = util - fijos.reduce((a, b) => a + b, 0);
        const cols = [anchoDonante, ...fijos];
        const xs = cols.reduce((acc, w, i) => { acc.push(i === 0 ? M : acc[i - 1] + cols[i - 1]); return acc; }, []);
        const derecha = new Set([3, 4, 5, 6]); // las cuatro columnas de dinero

        function pintarCabeceraTabla() {
            doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...GRIS);
            RECONCILIATION_COLUMNS.forEach((c, i) => {
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
            const valores = [f.donante, f.fecha, f.referencia, f.bruto, f.comision, f.retencion, f.neto, f.estado];
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
        const totales = ['TOTAL GENERAL', '', '', cifra(t.bruto, decimales), cifra(t.comision, decimales),
            cifra(t.retencion, decimales), cifra(t.neto, decimales), ''];
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
