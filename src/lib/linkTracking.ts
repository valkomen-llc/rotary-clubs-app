// Espejo MÍNIMO de `server/lib/linkTracking.js`.
//
// Acá vive SÓLO lo que hace falta para PINTAR: los rótulos y la frase que
// explica cómo se atribuye el tráfico. La clasificación de bots, la lectura de
// UTM, el identificador del visitante y la decisión del código HTTP se quedan
// en el servidor a propósito — copiarlos daría dos criterios sobre el mismo
// clic, y el que decide es el que corre cuando alguien pulsa el enlace.
//
// Los rótulos SÍ están acá porque la pantalla los necesita y no cuesta un viaje
// de red; la prueba comprueba que las claves coincidan con las del servidor.

/** Cómo se llama cada fuente en la pantalla. Las claves son `sourceKind`. */
export const SOURCE_LABELS: Record<string, string> = {
    directo: 'Directo o desconocido',
    campana: 'Campaña (UTM)',
    whatsapp: 'WhatsApp',
    facebook: 'Facebook',
    instagram: 'Instagram',
    x: 'X (Twitter)',
    linkedin: 'LinkedIn',
    telegram: 'Telegram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    google: 'Google',
    bing: 'Bing',
    email: 'Correo',
    referencia: 'Otra referencia',
};

export const DEVICE_LABELS: Record<string, string> = {
    movil: 'Móvil',
    desktop: 'Computador',
    tablet: 'Tablet',
    desconocido: 'Sin identificar',
};

export const PERIOD_LABELS: Record<string, string> = {
    hoy: 'Hoy',
    d7: 'Últimos 7 días',
    d30: 'Últimos 30 días',
    d90: 'Últimos 90 días',
    todo: 'Todo el historial',
};

/**
 * Por qué «Directo o desconocido» no es lo mismo que «nadie llegó por lo que
 * compartimos».
 *
 * Va en la pantalla porque sin esta frase el desglose se lee al revés: WhatsApp
 * en el móvil NO manda `Referer`, así que su tráfico legítimo cae en «directo»
 * y alguien concluiría que compartir por ahí no sirvió. La alternativa
 * —atribuirlo a WhatsApp «porque suele ser»— es inventar el dato.
 */
export function describeSourceEvidence(): string {
    return 'La fuente se toma de los parámetros UTM o de lo que declara el navegador. '
        + 'Cuando no hay ninguna de las dos, la visita queda como «Directo o desconocido» y no se le '
        + 'atribuye ninguna plataforma: WhatsApp y varias apps no informan de dónde viene el clic. '
        + 'Para medirlo con certeza, compartí el enlace con ?utm_source=.';
}

export default { SOURCE_LABELS, DEVICE_LABELS, PERIOD_LABELS, describeSourceEvidence };
