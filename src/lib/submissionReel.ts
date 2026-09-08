// ════════════════════════════════════════════════════════════════════
// Solicitud → Reel IA: el espejo MÍNIMO del navegador (v4.1010)
//
// Sólo lo que hace falta para PINTAR: si se ofrece la acción, con qué motivo
// no, y qué fotografías se le proponen al Creador. Quien DECIDE sigue siendo el
// servidor —`createReel` valida los topes y la atribución contra el alcance—;
// esto evita un viaje de red para saber si se dibuja un botón.
//
// ⚠️ Los números están escritos DOS veces a propósito y por eso la prueba
// compara las SALIDAS de los dos módulos sobre los mismos casos: el servidor no
// puede importarse desde el bundle y el bundle no puede cargar `reelPresets.js`.
// Al tocar `server/lib/submissionReel.js`, tocar éste.
// ════════════════════════════════════════════════════════════════════

/** Espejo de `MIN_SCENE_COUNT` / `MAX_SCENE_COUNT` de `reelPresets.js`. */
export const REEL_MIN_IMAGES = 3;
export const REEL_MAX_IMAGES = 5;

export interface ArchivoReel {
    id: string; kind: string; url?: string;
    mediaId?: string | null; inLibrary?: boolean;
}

export interface ReelReadiness {
    ready: boolean;
    usable: number;
    images: number;
    reason: 'sin_imagenes' | 'sin_aprobar' | null;
    message: string | null;
    consequence: string | null;
}

/** Un VIDEO no es material de escena: el motor anima una FOTOGRAFÍA. Y sólo
 *  entra lo que ya está en la Biblioteca — el material de una solicitud es
 *  privado hasta que se aprueba, y el proveedor tiene que poder descargarlo. */
export const reelableFiles = (files: ArchivoReel[] = []): ArchivoReel[] =>
    (Array.isArray(files) ? files : [])
        .filter(f => f && f.kind === 'image' && Boolean(f.mediaId || f.inLibrary) && String(f.url || '').trim());

export const reelReadiness = (files: ArchivoReel[] = []): ReelReadiness => {
    const todas = Array.isArray(files) ? files : [];
    const imagenes = todas.filter(f => f && f.kind === 'image');
    const usables = reelableFiles(todas);

    if (!imagenes.length) {
        return {
            ready: false, usable: 0, images: 0, reason: 'sin_imagenes',
            message: 'Esta solicitud no trae fotografías.',
            consequence: 'Un Reel se arma con fotografías: sin ellas no hay escenas que animar.',
        };
    }
    if (usables.length < REEL_MIN_IMAGES) {
        const faltan = REEL_MIN_IMAGES - usables.length;
        return {
            ready: false, usable: usables.length, images: imagenes.length, reason: 'sin_aprobar',
            message: usables.length === 0
                ? `Ninguna de las ${imagenes.length} fotografías está todavía en la Biblioteca.`
                : `Sólo ${usables.length} de ${imagenes.length} fotografías están en la Biblioteca; faltan ${faltan}.`,
            consequence: 'El motor de video necesita una dirección pública para descargar cada foto, y el material de una solicitud es privado hasta que se aprueba. Enviá el material a la Biblioteca y la acción aparece.',
        };
    }
    return { ready: true, usable: usables.length, images: imagenes.length, reason: null, message: null, consequence: null };
};

/** Las que se proponen de partida, en el orden de la solicitud y acotadas al
 *  tope del motor: mandar más abriría el Creador en un estado que `createReel`
 *  rechaza. Lo que sobra no se pierde — ahí se quita, se reordena y se suma. */
export const reelImagesFor = (files: ArchivoReel[] = []) =>
    reelableFiles(files).slice(0, REEL_MAX_IMAGES)
        .map(f => ({ id: f.mediaId || f.id, url: String(f.url), mediaId: f.mediaId || null }));

export default { REEL_MIN_IMAGES, REEL_MAX_IMAGES, reelableFiles, reelReadiness, reelImagesFor };
