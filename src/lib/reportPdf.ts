// Exportación del informe ejecutivo a PDF de alta calidad.
//
// Estrategia: rasterizar el nodo del informe con html2canvas a alta escala y
// paginarlo en A4 vertical con jsPDF. Si html2canvas no está disponible o
// falla (p.ej. algún color/gradiente no soportado), se cae a window.print()
// con la hoja de estilos de impresión. Ambas librerías se cargan de forma
// perezosa para no engordar el bundle principal.

const A4_W_MM = 210;
const A4_H_MM = 297;

export const sanitizeFilename = (name: string): string =>
    (name || 'informe')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 80);

export interface PdfResult { blob: Blob; filename: string; }

/**
 * Genera un PDF (Blob) del nodo dado. Devuelve null si debe usarse el fallback
 * de impresión nativa.
 */
export const renderNodeToPdfBlob = async (node: HTMLElement, filename: string): Promise<PdfResult | null> => {
    try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ]);

        const canvas = await html2canvas(node, {
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: node.scrollWidth,
        });

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const imgW = A4_W_MM;
        const pxPerMm = canvas.width / imgW;
        const pageHpx = A4_H_MM * pxPerMm;
        const totalPages = Math.max(1, Math.ceil(canvas.height / pageHpx));

        for (let p = 0; p < totalPages; p++) {
            if (p > 0) pdf.addPage();
            // Recorta una franja de la altura de una página A4 y la pinta.
            const sliceH = Math.min(pageHpx, canvas.height - p * pageHpx);
            const slice = document.createElement('canvas');
            slice.width = canvas.width;
            slice.height = sliceH;
            const ctx = slice.getContext('2d');
            if (!ctx) throw new Error('sin contexto 2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, slice.width, slice.height);
            ctx.drawImage(canvas, 0, p * pageHpx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
            const dataUrl = slice.toDataURL('image/jpeg', 0.92);
            const hMm = sliceH / pxPerMm;
            pdf.addImage(dataUrl, 'JPEG', 0, 0, imgW, hMm, undefined, 'FAST');
        }

        const blob = pdf.output('blob');
        return { blob, filename: `${sanitizeFilename(filename)}.pdf` };
    } catch (e) {
        console.warn('[reportPdf] html2canvas/jsPDF falló, usando impresión nativa:', e);
        return null;
    }
};

export const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

/** Exporta a PDF y lo descarga. Devuelve el base64 (para adjuntar en correo) o null si usó impresión. */
export const exportReportPdf = async (node: HTMLElement, filename: string): Promise<string | null> => {
    const result = await renderNodeToPdfBlob(node, filename);
    if (!result) {
        window.print();
        return null;
    }
    downloadBlob(result.blob, result.filename);
    return blobToBase64(result.blob);
};
