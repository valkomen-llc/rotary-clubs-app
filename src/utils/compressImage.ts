// Optimización de imágenes en el navegador antes de subirlas.
//
// Redimensiona la imagen para que su lado más largo no supere `maxDimension`
// (manteniendo la proporción) y la recodifica como JPEG de alta calidad. Esto
// reduce drásticamente el peso de fotos de cámara (5–25 MB → ~0.3–1.5 MB) sin
// pérdida perceptible en pantalla, y evita el límite de ~4.5 MB de Vercel.
//
// Los PNG se mantienen sin pérdida (lossless) para conservar transparencias y
// capturas; SVG/GIF y archivos no-imagen (ej. video) se devuelven intactos.

export interface CompressImageOptions {
    /** Tope para el lado más largo de la imagen, en píxeles. */
    maxDimension?: number;
    /** Calidad de recodificación JPEG/WebP (0–1). Ignorada para PNG. */
    quality?: number;
}

export const compressImage = async (
    file: File,
    { maxDimension = 2560, quality = 0.85 }: CompressImageOptions = {}
): Promise<File> => {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
            return resolve(file);
        }
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            if (width > height && width > maxDimension) {
                height = Math.round(height * (maxDimension / width));
                width = maxDimension;
            } else if (height > maxDimension) {
                width = Math.round(width * (maxDimension / height));
                height = maxDimension;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(file);
            ctx.drawImage(img, 0, 0, width, height);

            const isPng = file.type === 'image/png';
            const outputType = isPng ? 'image/png' : 'image/jpeg';
            const outQuality = isPng ? 1.0 : quality;

            canvas.toBlob((blob) => {
                if (!blob) return resolve(file);
                const newName = isPng ? file.name : file.name.replace(/\.(jpe?g|png|webp)$/i, '.jpg');
                const compressed = new File([blob], newName, { type: outputType });
                // Solo usamos el resultado si realmente redujo el tamaño o si hubo
                // que redimensionar (evita "engordar" imágenes ya optimizadas).
                const isResizeNeeded = img.width > maxDimension || img.height > maxDimension;
                resolve((compressed.size < file.size || isResizeNeeded) ? compressed : file);
            }, outputType, outQuality);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
    });
};
