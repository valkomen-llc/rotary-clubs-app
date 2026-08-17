// Sacar el informe de la Bóveda a un archivo: Excel, CSV y PDF.
//
// v4.850 — Bloque B. Los tres leen el MISMO informe (`walletReport.ts`), que es
// puro. Escribir cada formato por su cuenta daría tres verdades sobre el mismo
// período: es la razón por la que `buildPiece` es único en las Infografías de
// Campaña y por la que Plantillas IA tiene un solo grafo de escena.
//
// ═════════════════════════════════════════════════════════════════════
// SE COMPONE EN EL NAVEGADOR, Y NO ES UNA PREFERENCIA
// ═════════════════════════════════════════════════════════════════════
//
// Vercel NO tiene ninguna fuente instalada: componer texto en el servidor
// rasteriza un SVG y cada glifo sale como un cuadrito. Está medido en v4.794 y
// costó los rótulos de la Campaña de Emergencia. `jspdf` y `xlsx` ya son
// dependencias del proyecto y corren acá, igual que `designRender.ts` y
// `qrcode.ts`. **No mover esto al servidor.**
//
// Las tres librerías se importan de forma PEREZOSA: `xlsx` y `jspdf` pesan, y
// quien abre la Bóveda a mirar su saldo no tiene por qué descargarlas.

import {
    type Informe, CABECERAS, filaComoArray, contextoDe, nombreArchivo,
} from './walletReport';

/** Descarga un blob. Un `<a download>` es lo que ya usa el resto del panel. */
const descargar = (blob: Blob, nombre: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Sin esto el blob se queda en memoria toda la sesión.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Una celda de CSV. Se citan SIEMPRE los textos: un nombre con coma —«Díaz,
 *  Rodrigo»— partiría la fila en dos columnas y correría todo lo demás. */
const celda = (v: string | number): string => {
    if (typeof v === 'number') return String(v);
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV.
 *
 * ⚠️ Lleva BOM (`﻿`) y separador PUNTO Y COMA. Los dos hacen falta para
 * Excel en español: sin BOM abre los acentos como «RodrÃ­go», y con coma mete
 * toda la fila en una sola columna porque en configuración regional española el
 * separador de lista es el punto y coma. Un CSV que Excel abre mal es un CSV
 * que nadie usa.
 */
export const aCSV = (informe: Informe): string => {
    const lineas: string[] = [];
    for (const [k, v] of contextoDe(informe)) lineas.push(`${celda(k)};${celda(v)}`);
    for (const aviso of informe.avisos) lineas.push(`${celda('Aviso')};${celda(aviso)}`);
    lineas.push('');
    lineas.push(CABECERAS.map(celda).join(';'));
    for (const f of informe.filas) lineas.push(filaComoArray(f).map(celda).join(';'));
    return `﻿${lineas.join('\r\n')}`;
};

export const descargarCSV = (informe: Informe) => {
    descargar(new Blob([aCSV(informe)], { type: 'text/csv;charset=utf-8' }), nombreArchivo(informe, 'csv'));
};

/**
 * Excel de verdad (.xlsx), con `xlsx`, que ya es dependencia.
 *
 * Los importes van como NÚMERO, no como texto con su símbolo: un Excel en el
 * que no se puede sumar una columna no sirve para lo que se pide un Excel. El
 * contexto va arriba, en la misma hoja, porque una hoja aparte se pierde al
 * copiar la tabla a otro sitio.
 */
export const descargarExcel = async (informe: Informe) => {
    const XLSX = await import('xlsx');
    const filas: (string | number)[][] = [];
    for (const [k, v] of contextoDe(informe)) filas.push([k, v]);
    for (const aviso of informe.avisos) filas.push(['Aviso', aviso]);
    filas.push([]);
    filas.push([...CABECERAS]);
    for (const f of informe.filas) filas.push(filaComoArray(f));

    const hoja = XLSX.utils.aoa_to_sheet(filas);
    hoja['!cols'] = [
        { wch: 12 }, { wch: 24 }, { wch: 28 }, { wch: 30 }, { wch: 22 },
        { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 14 },
        { wch: 22 }, { wch: 18 }, { wch: 18 },
    ];
    const libro = XLSX.utils.book_new();
    // La hoja se llama con la MONEDA: es lo primero que hay que saber al abrir
    // el archivo, y deja sitio a que un día convivan dos hojas.
    XLSX.utils.book_append_sheet(libro, hoja, informe.moneda);
    const buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'array' });
    descargar(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        nombreArchivo(informe, 'xlsx')
    );
};

/**
 * PDF, con `jspdf`, siguiendo el patrón que ya usa el panel
 * (`EventRegistrationsManager`).
 *
 * Va en HORIZONTAL: la tabla tiene doce columnas y en vertical no entra sin
 * achicar la letra hasta hacerla ilegible en un teléfono, que es donde se mira.
 *
 * @param analisis Texto del bloque C, cuando lo haya. Va DEBAJO de las cifras,
 *                 nunca encima: lo que manda es el dato.
 */
export const descargarPDF = async (informe: Informe, analisis?: string) => {
    const { default: JsPDF } = await import('jspdf');
    const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    let y = 48;

    const salto = (necesario = 16) => {
        if (y + necesario > alto - 40) { doc.addPage(); y = 48; }
    };

    doc.setFontSize(16).setFont('helvetica', 'bold');
    doc.text('Bóveda de Fondos — informe del período', 40, y);
    y += 20;
    doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(110);
    doc.text(informe.club, 40, y); y += 24;
    doc.setTextColor(0);

    // El contexto. Sin él, un PDF de hace un mes no se puede interpretar.
    doc.setFontSize(11).setFont('helvetica', 'bold');
    doc.text('Resumen', 40, y); y += 16;
    doc.setFont('helvetica', 'normal').setFontSize(10);
    for (const [k, v] of contextoDe(informe)) {
        salto();
        doc.text(k, 48, y);
        doc.text(String(v), ancho - 60, y, { align: 'right' });
        y += 15;
    }

    // Los avisos, en ámbar y dentro del archivo. Quien lo abra dentro de seis
    // meses no tiene la pantalla delante.
    if (informe.avisos.length) {
        y += 10; salto(20);
        doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(180, 83, 9);
        doc.text('Advertencias', 40, y); y += 14;
        doc.setFont('helvetica', 'normal').setFontSize(9);
        for (const aviso of informe.avisos) {
            for (const linea of doc.splitTextToSize(`• ${aviso}`, ancho - 90)) {
                salto(); doc.text(linea, 48, y); y += 12;
            }
        }
        doc.setTextColor(0);
    }

    // El análisis del bloque C, si vino. DEBAJO de las cifras a propósito.
    if (analisis) {
        y += 12; salto(24);
        doc.setFont('helvetica', 'bold').setFontSize(11);
        doc.text('Análisis', 40, y); y += 15;
        doc.setFont('helvetica', 'normal').setFontSize(10);
        for (const linea of doc.splitTextToSize(analisis, ancho - 90)) {
            salto(); doc.text(linea, 48, y); y += 13;
        }
    }

    // La tabla.
    y += 18; salto(30);
    doc.setFont('helvetica', 'bold').setFontSize(11);
    doc.text('Aportes del período', 40, y); y += 16;

    // Anchos en proporción del ancho útil: en A4 horizontal la tabla cabe
    // entera y no hace falta partirla.
    const util = ancho - 80;
    const pesos = [0.07, 0.13, 0.16, 0.15, 0.10, 0.07, 0.09, 0.09, 0.07, 0.07];
    const cols = pesos.map(p => p * util);
    const xs = cols.reduce<number[]>((acc, _, i) => [...acc, (acc[i] ?? 40) + (i === 0 ? 0 : cols[i - 1])], [40]);
    // Se pintan diez columnas: `Base` y `Referencia` quedan fuera del PDF —van
    // en el Excel, que es donde se audita— porque en papel empujan el resto a
    // un tamaño que no se lee.
    const cabeceras = CABECERAS.slice(0, 10);

    doc.setFontSize(8).setFont('helvetica', 'bold').setTextColor(90);
    cabeceras.forEach((h, i) => doc.text(String(h), xs[i], y, { maxWidth: cols[i] - 4 }));
    y += 6;
    doc.setDrawColor(220).line(40, y, ancho - 40, y); y += 12;
    doc.setFont('helvetica', 'normal').setTextColor(0);

    const num = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
    for (const f of informe.filas) {
        salto(18);
        const celdas = [
            f.fecha, f.aportante, f.correo, f.destino, f.metodo,
            num(f.bruto), num(f.procesador), num(f.plataforma), num(f.neto), f.estado,
        ];
        celdas.forEach((c, i) => {
            // Se recorta al ancho de su columna: sin esto un correo largo se
            // monta encima de la columna siguiente y la fila deja de leerse.
            const texto = doc.splitTextToSize(String(c), cols[i] - 4)[0] || '';
            doc.text(texto, xs[i], y, { maxWidth: cols[i] - 4 });
        });
        y += 14;
    }

    // El total, separado por una línea. Y sólo de ESTA moneda.
    salto(24);
    doc.setDrawColor(180).line(40, y, ancho - 40, y); y += 14;
    doc.setFont('helvetica', 'bold').setFontSize(9);
    doc.text(`Total ${informe.moneda}`, xs[0], y);
    doc.text(num(informe.totales.bruto), xs[5], y);
    doc.text(num(informe.totales.procesador), xs[6], y);
    doc.text(num(informe.totales.plataforma), xs[7], y);
    doc.text(num(informe.totales.neto), xs[8], y);

    // Pie con la paginación en todas las hojas.
    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(140);
        doc.text(
            `${informe.club} · ${informe.moneda} · ${informe.periodo.label} · ${informe.emitido.toLocaleDateString('es-CO')}`,
            40, alto - 24
        );
        doc.text(`${i} / ${paginas}`, ancho - 40, alto - 24, { align: 'right' });
    }

    doc.save(nombreArchivo(informe, 'pdf'));
};

export default { aCSV, descargarCSV, descargarExcel, descargarPDF };
