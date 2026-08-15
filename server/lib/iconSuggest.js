// ════════════════════════════════════════════════════════════════════
// Sugerencia de icono — el CRITERIO
// v4.811.0
//
// «Varita mágica»: a partir de lo que dice una caja («Alimentos no
// perecederos de canasta básica»), proponer el icono del catálogo que le
// corresponde.
//
// VA DE LO EXACTO A LO INSEGURO, igual que la detección de intención del CRM
// (`crmIntents.js`): primero PALABRAS CLAVE —determinista, instantáneo,
// gratis y reproducible— y sólo si ninguna resuelve, el MODELO. Empezar por
// el modelo costaría una llamada por pulsación para resolver lo que una
// palabra clave resuelve, y haría la sugerencia no reproducible («¿por qué me
// puso ese icono?»).
//
// EL CATÁLOGO ES CERRADO. Si el modelo contesta algo que no está en él, se
// descarta y no se sugiere nada: un icono inventado no existe en la rejilla y
// dejaría al usuario con una caja sin icono. Misma regla que las intenciones
// del CRM y que `validateMeta` en el SEO: el modelo PROPONE, el código
// DECIDE.
//
// Este archivo es PURO en su parte determinista —sin base, sin red, sin
// reloj—, así que se prueba entero con `npm run test:contribution`. La parte
// del modelo vive aparte y degrada: sin credencial, la varita sigue sirviendo
// con las palabras clave.
// ════════════════════════════════════════════════════════════════════

// Las claves son las de BLOCK_ICONS (src/lib/paymentBlocks.ts), que es el
// registro que pinta la página pública. La prueba compara las dos listas: un
// icono que exista acá y no allá se sugeriría y no se podría dibujar.
//
// Las palabras clave se escriben SIN tildes y en minúscula; `norm` normaliza
// el texto de entrada igual, así que «Botiquín» encuentra «botiquin».
export const ICON_HINTS = {
    // ── Suministros ──
    food: ['alimento', 'aliment', 'comida', 'comestible', 'mercado', 'no perecedero', 'perecedero', 'nutricion', 'hambre', 'racion', 'olla', 'cocina'],
    basket: ['canasta', 'canasta basica', 'mercado basico', 'despensa', 'bolsa de mercado', 'kit alimentario'],
    water: ['agua', 'agua potable', 'hidratacion', 'botellon', 'bebida', 'sed'],
    hygiene: ['higiene', 'aseo personal', 'jabon', 'shampoo', 'cepillo', 'toalla', 'papel higienico', 'sanitario'],
    cleaning: ['limpieza', 'aseo', 'desinfectante', 'detergente', 'cloro', 'escoba', 'trapeador'],
    baby: ['bebe', 'pañal', 'panal', 'niño', 'nino', 'infantil', 'lactancia', 'formula', 'maternidad', 'niñez', 'ninez'],
    clothing: ['ropa', 'vestuario', 'prenda', 'abrigo', 'zapato', 'calzado', 'chaqueta', 'camiseta'],
    bedding: ['colchoneta', 'colchon', 'cobija', 'manta', 'almohada', 'sabana', 'dormir', 'descanso', 'frazada'],

    // ── Salud ──
    firstaid: ['botiquin', 'primeros auxilios', 'curacion', 'venda', 'gasa', 'emergencia medica'],
    health: ['salud', 'medico', 'medica', 'enfermera', 'consulta', 'atencion en salud', 'brigada de salud'],
    medicine: ['medicamento', 'medicina', 'farmaco', 'pastilla', 'droga', 'farmacia', 'antibiotico'],
    vitals: ['signos vitales', 'atencion medica', 'urgencia', 'paciente', 'hospital', 'clinica'],

    // ── Emergencia y logística ──
    emergency: ['emergencia', 'alerta', 'desastre', 'catastrofe', 'sismo', 'terremoto', 'inundacion', 'incendio', 'huracan', 'crisis'],
    rescue: ['rescate', 'socorro', 'salvamento', 'evacuacion', 'damnificado', 'busqueda'],
    shelter: ['albergue', 'refugio', 'carpa', 'campamento', 'alojamiento', 'techo temporal'],
    home: ['vivienda', 'casa', 'hogar', 'reconstruccion', 'techo', 'domicilio'],
    transport: ['transporte', 'camion', 'envio', 'logistica', 'traslado', 'flete', 'vehiculo', 'entrega'],
    // OJO: nada de palabras GENÉRICAS de envase acá («artículo», «elemento»,
    // «caja», «paquete»). Aparecen en casi todo título —«Artículos de higiene
    // personal»— y, por ser largas, le ganaban a la palabra específica en la
    // regla de coincidencia más larga: la caja de higiene salía con el icono
    // de suministros. Sólo van términos que de verdad SIGNIFICAN suministro.
    supplies: ['suministro', 'insumo', 'kit de ayuda', 'kit humanitario'],
    warehouse: ['acopio', 'centro de acopio', 'bodega', 'almacen', 'punto de recepcion', 'recepcion'],
    tools: ['herramienta', 'reparacion', 'construccion', 'obra', 'escombro', 'remocion'],
    energy: ['energia', 'luz', 'electricidad', 'planta electrica', 'generador', 'bateria', 'combustible'],

    // ── Aporte y difusión ──
    dollar: ['dinero', 'aporte economico', 'donacion economica', 'efectivo', 'monetario', 'recaudo', 'recaudacion', 'fondo', 'transferencia', 'economico'],
    megaphone: ['difusion', 'difundir', 'campaña', 'campana', 'convocatoria', 'anuncio', 'voz', 'comunicar'],
    share: ['compartir', 'comparte', 'redes sociales', 'viralizar', 'replicar', 'pasar la voz', 'amplificar'],
    location: ['ubicacion', 'punto', 'direccion', 'mapa', 'sede', 'lugar', 'donde'],
    phone: ['telefono', 'contacto', 'llamar', 'whatsapp', 'comunicate', 'linea'],

    // ── Comunidad e institución ──
    users: ['voluntario', 'voluntariado', 'equipo', 'personas', 'comunidad', 'familia', 'gente', 'socio'],
    handheart: ['ayuda', 'ayudar', 'solidaridad', 'apoyo', 'mano amiga', 'servir', 'servicio'],
    handshake: ['alianza', 'aliado', 'convenio', 'cooperacion', 'acuerdo', 'socio estrategico'],
    heart: ['esperanza', 'amor', 'corazon', 'carino', 'afecto'],
    globe: ['internacional', 'mundo', 'global', 'exterior', 'mundial', 'paises'],
    education: ['educacion', 'escuela', 'colegio', 'estudiante', 'beca', 'formacion', 'capacitacion'],
    book: ['libro', 'utiles', 'cuaderno', 'lectura', 'material escolar'],
    shield: ['proteccion', 'seguridad', 'resguardo', 'prevencion'],
    landmark: ['institucion', 'gobierno', 'entidad', 'fundacion', 'banco'],
    gift: ['regalo', 'obsequio', 'donar', 'donacion', 'presente'],
    hearthandshake: ['acompañamiento', 'acompanamiento', 'cuidado', 'apadrinar'],
};

export const SUGGESTABLE_ICONS = Object.keys(ICON_HINTS);

/** Minúsculas, sin tildes y sin puntuación: «Botiquín» → «botiquin». */
export function norm(text) {
    return String(text ?? '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9ñ\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Sugerencia DETERMINISTA por palabras clave.
 *
 * Gana la coincidencia MÁS LARGA, no la primera: «canasta basica» tiene que
 * ganarle a «canasta» suelta, y «primeros auxilios» a «auxilio». Es la misma
 * regla que la detección de intención del CRM, y por el mismo motivo — sin
 * ella, el orden del objeto decidiría el resultado.
 *
 * Devuelve { icon, method: 'keyword', matched } o null.
 */
export function suggestIconDeterministic(text) {
    const t = norm(text);
    if (!t) return null;

    let best = null;
    for (const [icon, hints] of Object.entries(ICON_HINTS)) {
        for (const hint of hints) {
            const h = norm(hint);
            if (!h || !t.includes(h)) continue;
            if (!best || h.length > best.matched.length) best = { icon, method: 'keyword', matched: h };
        }
    }
    return best;
}

/**
 * El prompt del modelo, armado con el catálogo REAL: lo que se le ofrece es
 * exactamente lo que la rejilla puede dibujar.
 *
 * Se construye desde ICON_HINTS y NO desde una segunda tabla de rótulos. Dos
 * motivos: no hay una lista de nombres que se pueda quedar atrás cuando se
 * agregue un icono, y las palabras clave describen mejor cada icono que un
 * rótulo de una palabra —«firstaid: botiquín, primeros auxilios, venda» le
 * dice bastante más al modelo que «Botiquín»—.
 */
export function buildIconPrompt() {
    const opciones = Object.entries(ICON_HINTS)
        .map(([key, hints]) => `- ${key}: ${hints.slice(0, 6).join(', ')}`)
        .join('\n');
    return `Eliges el ícono que mejor representa el contenido de una caja de una campaña humanitaria de Rotary.

Íconos disponibles (clave: a qué se refiere):
${opciones}

Respondés ÚNICAMENTE con la clave exacta de UN ícono de la lista (por ejemplo: firstaid).
Si ninguno encaja razonablemente, respondés: ninguno`;
}

/**
 * Valida lo que contestó el modelo contra el catálogo CERRADO.
 * Una clave que no esté se descarta: un icono inventado no existe en la
 * rejilla y dejaría la caja sin nada.
 */
export function parseIconAnswer(raw, allowed) {
    const answer = norm(raw).split(' ')[0];
    if (!answer || answer === 'ninguno') return null;
    const permitidas = new Set((allowed || SUGGESTABLE_ICONS).map(k => norm(k)));
    if (!permitidas.has(answer)) return null;
    // Se devuelve la clave ORIGINAL (con su capitalización real del catálogo),
    // no la normalizada: es la que consume la rejilla.
    return (allowed || SUGGESTABLE_ICONS).find(k => norm(k) === answer) || null;
}

export default {
    ICON_HINTS, SUGGESTABLE_ICONS, norm,
    suggestIconDeterministic, buildIconPrompt, parseIconAnswer,
};
