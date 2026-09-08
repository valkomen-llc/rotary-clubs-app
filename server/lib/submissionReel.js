// ════════════════════════════════════════════════════════════════════
// Solicitud de contenido → Reel IA — EL CRITERIO (v4.1010)
//
// PURO: sin base, sin red, sin IA. Decide UNA cosa —si a esta solicitud se le
// puede ofrecer «Generar Reel IA», y cuando no, POR QUÉ— y arma el contexto
// que viaja al Creador de Reels.
//
// ⚠️ NO HAY UN SEGUNDO MOTOR DE REELS, Y ESO ES TODO EL DISEÑO. El Creador de
// Reels (`reelController.js` + `reelSpec.js` + `canvasExpansion.js` + …) ya
// resuelve la adaptación del lienzo a 9:16 sin recortar, el image-to-video
// real, la voz, la música con ducking, el montaje, los estados, el reintento
// por escena y el candado contra el doble render. Lo que faltaba era el PUNTO
// DE ENTRADA: la ficha de una solicitud no tenía una sola línea sobre reels.
// Este archivo es esa costura, y nada más — no genera, no monta, no anima.
//
// ⚠️ SÓLO ENTRA MATERIAL YA APROBADO, Y ES ESTRUCTURAL, NO UNA PREFERENCIA.
// Un archivo de una solicitud nace en el prefijo PRIVADO
// (`private/campaign-submissions/`, v4.968) y la bandeja lo mira con un enlace
// FIRMADO de 15 minutos. El motor de video le manda al proveedor una URL que
// TIENE que poder descargar: una firma que vence a los 15 minutos no sirve
// para una tarea que tarda 1-3 minutos en despacharse y puede reintentarse
// horas después, y el prefijo privado no se abre —eso es lo que impide que lo
// que llega por el formulario público se publique solo—. Así que la fotografía
// tiene que estar PROMOVIDA a la Biblioteca, que es exactamente la misma
// puerta que ya exige «Promocionar → Redes sociales».
// ════════════════════════════════════════════════════════════════════
import { MIN_SCENE_COUNT, MAX_SCENE_COUNT } from './reelPresets.js';

/** Los topes son los del MOTOR, importados — no un segundo par de números.
 *  Con dos, el botón ofrecería un Reel de 4 fotos que `createReel` rechaza. */
export const REEL_MIN_IMAGES = MIN_SCENE_COUNT;
export const REEL_MAX_IMAGES = MAX_SCENE_COUNT;

/**
 * Qué archivos de una solicitud pueden ser una escena.
 *
 * Un VIDEO no entra: el motor anima una FOTOGRAFÍA (image-to-video), así que
 * un mp4 no es material de escena. Se deja fuera en silencio porque no es un
 * defecto de ese archivo — sigue en la Biblioteca y sirve para otras cosas.
 */
export const reelableFiles = (files = []) =>
    (Array.isArray(files) ? files : [])
        .filter(f => f && f.kind === 'image' && Boolean(f.mediaId || f.inLibrary) && String(f.url || '').trim());

/**
 * ¿Se ofrece «Generar Reel IA»? Y si no, con qué MOTIVO y qué CONSECUENCIA.
 *
 * Nunca se pinta un botón que no puede llevar a ninguna parte (regla del sitio
 * desde v4.650), pero tampoco se esconde sin decir por qué: una acción que
 * desaparece se lee como que el módulo está roto, y acá la salida —aprobar el
 * material— es un gesto que quien mira la ficha puede dar ahí mismo.
 */
export const reelReadiness = (files = []) => {
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
            // La consecuencia, no sólo el motivo (regla de v4.785): «faltan 2»
            // no le explica a nadie que el paso que falta es aprobar.
            consequence: 'El motor de video necesita una dirección pública para descargar cada foto, y el material de una solicitud es privado hasta que se aprueba. Enviá el material a la Biblioteca y la acción aparece.',
        };
    }
    return {
        ready: true, usable: usables.length, images: imagenes.length, reason: null,
        message: null, consequence: null,
    };
};

/**
 * Las fotografías que se le proponen al Creador, ya recortadas al tope del
 * motor y EN EL ORDEN de la solicitud.
 *
 * Se propone el máximo que el motor admite, no todas: `createReel` rechaza más
 * de `MAX_SCENE_COUNT`, así que mandar ocho abriría el creador en un estado que
 * no se puede generar. Lo que sobra NO se pierde — el creador deja quitar,
 * reordenar y sumar de la Biblioteca; esto es la propuesta de partida.
 */
export const reelImagesFor = (files = []) =>
    reelableFiles(files)
        .slice(0, REEL_MAX_IMAGES)
        .map(f => ({ id: f.mediaId || f.id, url: f.url, mediaId: f.mediaId || null }));

/**
 * El contexto de la solicitud que viaja al Creador.
 *
 * ⚠️ NO SE VUELVE A PEDIR LO QUE YA ESTÁ ESCRITO. Es el requisito del pedido y
 * es además lo que hace que el Reel hable de ESTA actividad y no en genérico:
 * el título, el relato, los clubes que participaron y la fecha ya los escribió
 * quien mandó el material.
 *
 * Lo que NO se inventa: si la solicitud no trae relato, no se rellena con nada
 * —un hueco en silencio es una invitación a que el modelo lo complete, que es
 * la lección de la Campaña de Emergencia (v4.783)—.
 */
export const reelContextOf = (submission = {}, files = [], clubs = []) => {
    const s = submission || {};
    const texto = (v) => { const t = String(v ?? '').trim(); return t || null; };

    // Los clubes participantes son de la ACTIVIDAD, no de quien la envía
    // (v4.972): la tabla manda, y el texto derivado es el respaldo.
    const nombres = (Array.isArray(clubs) ? clubs : [])
        .map(c => texto(c?.clubName)).filter(Boolean);
    const participantes = nombres.length ? nombres : (texto(s.participatingClubs) ? [texto(s.participatingClubs)] : []);

    return {
        submissionId: texto(s.id),
        title: texto(s.title),
        story: texto(s.story) || texto(s.description),
        activityDate: texto(s.activityDate),
        location: texto(s.location),
        district: texto(s.district),
        // La organización que firma. El club del remitente es el respaldo del
        // primer club participante: quien manda suele pertenecer a uno de ellos.
        organizationName: participantes[0] || texto(s.club),
        participatingClubs: participantes,
        images: reelImagesFor(files),
    };
};

export default { REEL_MIN_IMAGES, REEL_MAX_IMAGES, reelableFiles, reelReadiness, reelImagesFor, reelContextOf };
