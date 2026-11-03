// Descargar un código QR en PNG, SVG o PDF (v4.1278).
//
// La imagen se genera en el navegador sobre la dirección de seguimiento REAL
// del código (`https://dominio/slug?qr=código`): lo que se descarga es lo que
// va a escanearse, y descargarlo mil veces da mil veces la misma imagen.
import toast from 'react-hot-toast';
import { normalizeDesign, trackingUrl } from '../../../lib/linkQr';
import {
    renderSvg, drawCanvas, canvasToBlob, downloadBlob, fileSlug, loadImage, imageToDataUrl, renderPdf,
} from '../../../lib/qrRender';
import type { QrDto, Redirect } from './api';

export type Formato = 'png' | 'svg' | 'pdf';

export function urlDelQr(qr: Pick<QrDto, 'code'>, link: Pick<Redirect, 'slug'>, dominio: string) {
    return trackingUrl({ host: dominio, slug: link.slug, code: qr.code });
}

/**
 * Descarga el QR. Si el logotipo no se puede cargar —un servidor que no
 * permite CORS, un enlace roto— se avisa y se descarga SIN logo, que sigue
 * siendo un código funcional: la pieza no se queda sin imagen.
 */
export async function descargarQr(formato: Formato, qr: QrDto, link: Redirect, dominio: string) {
    const texto = urlDelQr(qr, link, dominio);
    if (!texto) { toast.error('No se pudo armar la dirección del código.'); return; }
    const { design } = normalizeDesign(qr.design || {});
    const base = `qr-${fileSlug(link.name || link.slug)}-${fileSlug(qr.name)}`;

    let logo: HTMLImageElement | null = null;
    let logoHref = '';
    if (design.logoUrl) {
        try {
            if (formato === 'svg') logoHref = await imageToDataUrl(design.logoUrl);
            else logo = await loadImage(design.logoUrl);
        } catch {
            toast('El logotipo no se pudo incluir (el servidor donde está no lo permite). Se descarga el código sin logo.', { icon: 'ℹ️' });
        }
    }

    try {
        if (formato === 'svg') {
            const svg = renderSvg(texto, design, { logoHref: logoHref || undefined });
            downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${base}.svg`);
        } else if (formato === 'png') {
            const canvas = drawCanvas(texto, design, logo);
            downloadBlob(await canvasToBlob(canvas), `${base}.png`);
        } else {
            const blob = await renderPdf(texto, design, {
                title: qr.name,
                subtitle: link.name ? `${link.name} · ${dominio}${link.slug}` : `${dominio}${link.slug}`,
                logo,
            });
            downloadBlob(blob, `${base}.pdf`);
        }
        toast.success(`QR descargado en ${formato.toUpperCase()}.`);
    } catch (e: any) {
        toast.error(e?.message || 'No se pudo generar la imagen.');
    }
}

/** La vista previa: un SVG como data URI, barato de pintar en una lista. */
export function previewDataUri(texto: string, designInput: Partial<QrDto['design']> | undefined, logoHref?: string) {
    const { design } = normalizeDesign(designInput || {});
    try {
        const svg = renderSvg(texto, { ...design, size: 320 }, { logoHref });
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
        return '';
    }
}
