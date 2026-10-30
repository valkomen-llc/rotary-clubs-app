// Sacar la vista «Control y Justificación de Aportes» a Excel, CSV y PDF.
//
// v4.1265 — Los tres formatos leen el MISMO informe (`contributionControl.ts`,
// puro), igual que la exportación de la Bóveda (v4.850). Se compone en el
// NAVEGADOR: Vercel no tiene fuentes instaladas (medido en v4.794) y `xlsx` y
// `jspdf` se importan de forma perezosa — quien sólo mira no las descarga.

import {
    type InformeControl, CABECERAS_CONTROL, filaComoArrayControl, contextoControl,
    aCSVControl, nombreArchivoControl,
} from './contributionControl';

const descargar = (blob: Blob, nombre: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const descargarCSVControl = (inf: InformeControl) => {
    descargar(new Blob([aCSVControl(inf)], { type: 'text/csv;charset=utf-8' }), nombreArchivoControl(inf, 'csv'));
};

/** Los importes van como NÚMERO: una hoja donde no se puede sumar una columna no sirve. */
export const descargarExcelControl = async (inf: InformeControl) => {
    const XLSX = await import('xlsx');
    const filas: (string | number)[][] = [];
    for (const [k, v] of contextoControl(inf)) filas.push([k, v]);
    filas.push([]);
    filas.push([...CABECERAS_CONTROL]);
    for (const r of inf.filas) filas.push(filaComoArrayControl(r));
    const hoja = XLSX.utils.aoa_to_sheet(filas);
    hoja['!cols'] = [
        { wch: 12 }, { wch: 30 }, { wch: 30 }, { wch: 32 }, { wch: 14 }, { wch: 8 }, { wch: 14 },
        { wch: 18 }, { wch: 30 }, { wch: 30 }, { wch: 22 },
        { wch: 22 }, { wch: 14 }, { wch: 30 }, { wch: 14 },
        { wch: 24 }, { wch: 22 },
    ];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Control de aportes');
    const buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });
    descargar(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        nombreArchivoControl(inf, 'xlsx')
    );
};

/**
 * PDF horizontal con las columnas que se leen en papel. La referencia de la
 * transacción, el neto y la referencia del traslado van en el Excel, que es
 * donde se audita (mismo criterio que el PDF de la Bóveda, v4.850).
 */
export const descargarPDFControl = async (inf: InformeControl) => {
    const { loadJsPdf } = await import('./executiveReportPdf');
    const JsPDF = await loadJsPdf();
    const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    let y = 48;
    const salto = (n = 16) => { if (y + n > alto - 40) { doc.addPage(); y = 48; } };

    doc.setFontSize(16).setFont('helvetica', 'bold');
    doc.text('Control y Justificación de Aportes', 40, y); y += 20;
    doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(110);
    doc.text(inf.sitio, 40, y); y += 22;
    doc.setTextColor(0);

    doc.setFontSize(10);
    for (const [k, v] of contextoControl(inf)) {
        for (const [i, linea] of doc.splitTextToSize(String(v), ancho - 300).entries()) {
            salto();
            if (i === 0) doc.setFont('helvetica', 'bold').text(k, 48, y);
            doc.setFont('helvetica', 'normal').text(linea, 230, y);
            y += 14;
        }
    }

    y += 14; salto(30);
    const util = ancho - 80;
    const pesos = [0.07, 0.15, 0.15, 0.13, 0.08, 0.05, 0.11, 0.10, 0.10, 0.06];
    const cols = pesos.map(p => p * util);
    const xs = cols.reduce<number[]>((acc, _, i) => [...acc, (acc[i] ?? 40) + (i === 0 ? 0 : cols[i - 1])], [40]);
    const cab = ['Fecha', 'Aportante', 'Destino', 'Beneficiario', 'Valor', 'Moneda', 'Pago', 'Traslado', 'Comprobante', 'F. traslado'];
    doc.setFontSize(8).setFont('helvetica', 'bold').setTextColor(90);
    cab.forEach((h, i) => doc.text(h, xs[i], y, { maxWidth: cols[i] - 4 }));
    y += 6;
    doc.setDrawColor(220).line(40, y, ancho - 40, y); y += 12;
    doc.setFont('helvetica', 'normal').setTextColor(0);

    const num = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
    for (const r of inf.filas) {
        salto(18);
        const a = filaComoArrayControl(r);
        const celdas = [a[0], a[1], a[3], a[13], num(r.valor), r.moneda, r.estadoPagoLabel, r.estadoTrasladoLabel, r.estadoComprobanteLabel, a[14]];
        celdas.forEach((c, i) => {
            const texto = doc.splitTextToSize(String(c ?? ''), cols[i] - 4)[0] || '';
            // El comprobante pendiente se ve en ámbar: es lo que hay que ir a buscar.
            if (i === 8 && r.estadoComprobante === 'pendiente') doc.setTextColor(180, 83, 9);
            doc.text(texto, xs[i], y, { maxWidth: cols[i] - 4 });
            doc.setTextColor(0);
        });
        y += 14;
    }

    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(140);
        doc.text(`${inf.sitio} · ${inf.periodo} · ${inf.emitido.toLocaleDateString('es-CO')}`, 40, alto - 24);
        doc.text(`${i} / ${paginas}`, ancho - 40, alto - 24, { align: 'right' });
    }
    doc.save(nombreArchivoControl(inf, 'pdf'));
};

export default { descargarCSVControl, descargarExcelControl, descargarPDFControl };
