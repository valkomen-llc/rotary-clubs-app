// ════════════════════════════════════════════════════════════════════
// Campaña de Emergencia — catálogos, contexto y comprobación de datos
// v4.783.0
//
// El CRITERIO del preset de emergencia: qué desastres se ofrecen, qué se le
// pregunta al usuario, cómo se convierte eso en instrucciones para el modelo
// que escribe el guion, y —lo más importante— qué se rechaza de lo que el
// modelo devuelve.
//
// ─── EL PRINCIPIO QUE ORDENA TODO ESTE ARCHIVO ─────────────────────────────
//
// NO SE INVENTA NADA SOBRE UNA EMERGENCIA REAL. Ni fallecidos, ni heridos, ni
// damnificados, ni magnitud, ni ciudades afectadas, ni daños económicos, ni
// necesidades, ni cifras oficiales. Si el usuario no lo suministró, el copy
// habla en general: «comunidades de la región están enfrentando las
// consecuencias de un fuerte sismo», nunca «más de 10.000 damnificados».
//
// Y ESO SE HACE EN TRES CAPAS, PORQUE EL PROMPT SOLO NO ALCANZA:
//
//   1. ENTRADA — sólo entra al prompt lo que el usuario escribió. Un campo
//      vacío no se rellena ni se insinúa. `buildEmergencyBrief` es explícito
//      sobre qué NO se sabe, que es lo que impide que el modelo complete el
//      hueco por su cuenta.
//   2. INSTRUCCIÓN — `EMERGENCY_FACT_CLAUSE`, encima de la regla 3 de
//      `institutionalVoice.js`, que ya prohíbe inventar fechas, montos y
//      cantidades de personas (nació de un incidente real, v4.387).
//   3. VALIDACIÓN POR CÓDIGO — `validateEmergencyCopy`. El modelo ESCRIBE, el
//      código DECIDE. Se rechaza toda cifra que no esté en los datos
//      suministrados y se reintenta devolviéndole la regla concreta que rompió.
//      Es el patrón de `templateComposer.js` y `seoAI.js`: pedirle «revisá el
//      formato» no corrige nada; hay que decirle qué regla incumplió.
//
// La capa 3 es la que hace la promesa VERDADERA. Sin ella, «le pedimos que no
// invente» es una afirmación que no se puede sostener, y en una campaña que
// pide dinero a nombre de una institución eso no es aceptable.
//
// Este archivo es PURO: sin base, sin red, sin IA, sin reloj. Por eso se puede
// probar entero con `npm run test:reels:emergency`.
// ════════════════════════════════════════════════════════════════════

// ─── Tipos de desastre ─────────────────────────────────────────────────────
//
// `label` es lo que ve el usuario. `noun` es cómo se nombra el hecho dentro del
// guion —«un fuerte sismo», no «Terremoto»— porque un rótulo de formulario
// pegado en una frase suena a formulario. `magnitudeHint` es qué escala tiene
// sentido pedir para ESE desastre: la magnitud de un sismo y las hectáreas de
// un incendio no son el mismo dato, y un campo genérico «magnitud» invita a
// escribir cualquier cosa.
//
// El catálogo es CERRADO salvo `otro`, que existe justamente para no tener que
// preverlo todo: una emergencia humanitaria que no esté acá se escribe a mano.
// Es la misma regla que «Mi club no está en la lista» en la postulación
// (v4.706) y en el registro al evento (v4.708) — la lista ayuda a escribir, no
// cierra lo que se acepta.
export const DISASTER_TYPES = {
    terremoto: {
        id: 'terremoto',
        label: 'Terremoto',
        noun: 'un fuerte sismo',
        magnitudeHint: 'Magnitud en escala de Richter, si se conoce oficialmente'
    },
    tsunami: {
        id: 'tsunami',
        label: 'Tsunami o maremoto',
        noun: 'un tsunami',
        magnitudeHint: 'Altura de las olas o nivel de alerta, si se conoce'
    },
    inundacion: {
        id: 'inundacion',
        label: 'Inundación',
        noun: 'una inundación',
        magnitudeHint: 'Nivel del agua o número de barrios anegados, si se conoce'
    },
    huracan: {
        id: 'huracan',
        label: 'Huracán o ciclón',
        noun: 'un huracán',
        magnitudeHint: 'Categoría en escala Saffir-Simpson, si se conoce'
    },
    tornado: {
        id: 'tornado',
        label: 'Tornado',
        noun: 'un tornado',
        magnitudeHint: 'Escala Fujita mejorada (EF), si se conoce'
    },
    incendio: {
        id: 'incendio',
        label: 'Incendio forestal',
        noun: 'un incendio forestal',
        magnitudeHint: 'Hectáreas afectadas, si hay cifra oficial'
    },
    deslizamiento: {
        id: 'deslizamiento',
        label: 'Deslizamiento de tierra',
        noun: 'un deslizamiento de tierra',
        magnitudeHint: 'Extensión o número de viviendas afectadas, si se conoce'
    },
    erupcion: {
        id: 'erupcion',
        label: 'Erupción volcánica',
        noun: 'una erupción volcánica',
        magnitudeHint: 'Nivel de alerta volcánica o radio de evacuación, si se conoce'
    },
    sequia: {
        id: 'sequia',
        label: 'Sequía',
        noun: 'una sequía prolongada',
        magnitudeHint: 'Meses sin lluvia o nivel de desabastecimiento, si se conoce'
    },
    avalancha: {
        id: 'avalancha',
        label: 'Avalancha',
        noun: 'una avalancha',
        magnitudeHint: 'Extensión afectada, si se conoce'
    },
    tormenta: {
        id: 'tormenta',
        label: 'Tormenta severa o granizada',
        noun: 'una tormenta severa',
        magnitudeHint: 'Intensidad o duración, si se conoce'
    },
    otro: {
        id: 'otro',
        label: 'Otro desastre o emergencia humanitaria',
        // Sin `noun`: lo escribe el usuario. Poner uno genérico —«una
        // emergencia»— haría que el guion de una crisis concreta sonara vago
        // justamente en la escena que tiene que ubicar a quien mira.
        noun: null,
        magnitudeHint: 'Cualquier medida oficial de la magnitud, si se conoce',
        freeText: true
    }
};

export const DEFAULT_DISASTER = 'terremoto';

// ─── Necesidades ───────────────────────────────────────────────────────────
//
// Lo que hace falta. Es un catálogo para que se pueda elegir rápido —en una
// emergencia nadie quiere redactar— y admite texto libre por lo mismo que el
// tipo de desastre.
//
// OJO: una necesidad NO SE DEDUCE del tipo de desastre. Sería cómodo («un
// terremoto necesita alojamiento») y sería inventar: es exactamente la clase de
// dato que el punto 4 del pedido prohíbe suponer. Si el usuario no marcó
// ninguna, el guion no nombra ninguna.
export const NEED_TYPES = {
    alimentos: { id: 'alimentos', label: 'Alimentos', phrase: 'alimentos' },
    agua: { id: 'agua', label: 'Agua potable', phrase: 'agua potable' },
    alojamiento: { id: 'alojamiento', label: 'Alojamiento temporal', phrase: 'alojamiento temporal' },
    medicamentos: { id: 'medicamentos', label: 'Medicamentos', phrase: 'medicamentos' },
    ropa: { id: 'ropa', label: 'Ropa y abrigo', phrase: 'ropa y abrigo' },
    higiene: { id: 'higiene', label: 'Kits de higiene', phrase: 'kits de higiene' },
    reconstruccion: { id: 'reconstruccion', label: 'Reconstrucción', phrase: 'apoyo para la reconstrucción' },
    economico: { id: 'economico', label: 'Apoyo económico', phrase: 'apoyo económico' },
    voluntariado: { id: 'voluntariado', label: 'Voluntariado', phrase: 'manos voluntarias' },
    psicosocial: { id: 'psicosocial', label: 'Apoyo psicosocial', phrase: 'acompañamiento psicosocial' },
    educacion: { id: 'educacion', label: 'Continuidad educativa', phrase: 'continuidad educativa para niñas y niños' }
};

// ─── Llamados a la acción ──────────────────────────────────────────────────
//
// `imperative` es la frase que puede terminar en pantalla y en la voz. Están
// escritas en plural inclusivo —«sumemos», «aportemos»— porque es la voz
// institucional rotaria: quien habla es parte de quien actúa, no alguien que
// da órdenes desde afuera.
export const CTA_TYPES = {
    donar: { id: 'donar', label: 'Donar', imperative: 'Doná ahora', phrase: 'aportar una donación' },
    contribuir: { id: 'contribuir', label: 'Contribuir', imperative: 'Sumá tu aporte', phrase: 'contribuir con la campaña' },
    voluntario: { id: 'voluntario', label: 'Ser voluntario', imperative: 'Sumate como voluntario', phrase: 'sumarse como voluntario' },
    compartir: { id: 'compartir', label: 'Compartir', imperative: 'Compartí esta campaña', phrase: 'compartir esta campaña' },
    contactar: { id: 'contactar', label: 'Contactar al club', imperative: 'Escribinos', phrase: 'ponerse en contacto con el club' },
    apoyar: { id: 'apoyar', label: 'Apoyar una campaña', imperative: 'Apoyá la campaña', phrase: 'apoyar la campaña en marcha' },
    recaudar: { id: 'recaudar', label: 'Recaudar fondos', imperative: 'Sumate a la recaudación', phrase: 'sumarse a la recaudación de fondos' }
};

export const DEFAULT_CTA = 'donar';

// ─── Catálogos para el navegador ───────────────────────────────────────────

export const disasterCatalog = () => Object.values(DISASTER_TYPES).map(d => ({
    id: d.id,
    label: d.label,
    magnitudeHint: d.magnitudeHint,
    freeText: Boolean(d.freeText),
    isDefault: d.id === DEFAULT_DISASTER
}));

export const needCatalog = () => Object.values(NEED_TYPES).map(n => ({ id: n.id, label: n.label }));

export const ctaCatalog = () => Object.values(CTA_TYPES).map(c => ({
    id: c.id,
    label: c.label,
    isDefault: c.id === DEFAULT_CTA
}));

// ─── Normalización del contexto ────────────────────────────────────────────

const text = (v, max = 400) => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
};

const list = (v, catalog, max = 12) => {
    if (!Array.isArray(v)) return [];
    const seen = new Set();
    const out = [];
    for (const item of v) {
        const id = typeof item === 'string' ? item.trim() : null;
        if (!id || !catalog[id] || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        if (out.length >= max) break;
    }
    return out;
};

/**
 * Normaliza lo que llega del navegador contra los catálogos.
 *
 * Nunca se confía en el cliente: un tipo de desastre inventado cae al default,
 * una necesidad desconocida se descarta. Lo que SÍ se conserva tal cual es el
 * texto libre —descripción, comunidades, magnitud, el nombre del desastre en
 * «Otro»—, porque es el dato del usuario y es justamente lo único que
 * autoriza a decir algo concreto.
 *
 * `hasFacts` enumera qué se sabe. Es lo que consumen el brief y el validador,
 * y por eso es un objeto explícito y no una inferencia repetida en dos sitios.
 */
export const normalizeEmergencyContext = (raw = {}) => {
    const typeId = DISASTER_TYPES[raw?.disasterType] ? raw.disasterType : DEFAULT_DISASTER;
    const type = DISASTER_TYPES[typeId];

    const customType = text(raw?.customDisaster, 80);
    // Con «Otro» y sin texto, el guion se queda sin cómo nombrar el hecho. Se
    // resuelve con una fórmula general y NO con un desastre concreto elegido
    // por nosotros: nombrar «un sismo» porque sí sería inventar el hecho
    // central de la pieza.
    const noun = typeId === 'otro'
        ? (customType ? `una emergencia por ${customType.toLowerCase()}` : 'una situación de emergencia')
        : type.noun;

    const country = text(raw?.country, 80);
    const region = text(raw?.region, 120);
    const eventDate = text(raw?.eventDate, 40);
    const magnitude = text(raw?.magnitude, 120);
    const description = text(raw?.description, 600);
    const communities = text(raw?.communities, 300);

    const needs = list(raw?.needs, NEED_TYPES);
    const customNeed = text(raw?.customNeed, 120);
    const ctas = list(raw?.ctas, CTA_TYPES);
    const contactUrl = text(raw?.contactUrl, 300);

    // Ubicación legible, sin coma huérfana cuando falta una de las dos partes.
    const location = [region, country].filter(Boolean).join(', ') || null;

    return {
        disasterType: typeId,
        disasterLabel: type.label,
        customDisaster: customType,
        noun,
        country,
        region,
        location,
        eventDate,
        magnitude,
        description,
        communities,
        needs,
        customNeed,
        ctas: ctas.length ? ctas : [DEFAULT_CTA],
        contactUrl,
        // Qué se sabe de verdad. Lo consumen el brief y el validador.
        hasFacts: {
            location: Boolean(location),
            date: Boolean(eventDate),
            magnitude: Boolean(magnitude),
            description: Boolean(description),
            communities: Boolean(communities),
            needs: needs.length > 0 || Boolean(customNeed)
        }
    };
};

// ─── La cláusula de datos ──────────────────────────────────────────────────
//
// Va ENCIMA de `INSTITUTIONAL_VOICE`, no en su lugar: la regla 3 de la voz
// institucional ya prohíbe inventar fechas, montos, cantidades de personas y
// lugares. Esto agrega lo específico de una emergencia, que es donde inventar
// deja de ser un problema de estilo y pasa a ser uno de credibilidad
// institucional.
//
// Está escrita en POSITIVO donde se puede —«hablá en general», «decilo así»—
// pero enumera lo prohibido a propósito: es la misma excepción acotada que
// `PEOPLE_NEGATIVE_TERMS` en `reelSpec.js`. Acá el riesgo de una omisión es
// mayor que el de la fijación, porque no hay una segunda oportunidad cuando una
// cifra falsa ya salió publicada a nombre del Distrito.
export const EMERGENCY_FACT_CLAUSE = `CONTEXTO DE EMERGENCIA REAL — REGLAS ABSOLUTAS SOBRE LOS DATOS:

Estás escribiendo sobre un desastre que ocurrió de verdad y afecta a personas reales. La credibilidad de la campaña depende de que no aparezca ni un solo dato que no te hayamos dado.

PROHIBIDO ESCRIBIR, bajo cualquier forma (número, palabra o aproximación):
- cantidad de fallecidos, heridos, desaparecidos o damnificados;
- magnitud, categoría, escala o intensidad del fenómeno;
- número de viviendas, escuelas, hospitales o hectáreas afectadas;
- daños económicos o montos de cualquier tipo;
- nombres de ciudades, barrios o comunidades que no estén en los datos;
- fechas, días de la semana u horarios que no estén en los datos;
- necesidades concretas que no estén en los datos;
- cifras presentadas como oficiales, y frases como "según reportes" o "las autoridades informan".

Tampoco valen las aproximaciones vagas con forma de dato: "miles de familias", "cientos de viviendas", "gran parte de la región", "la mayoría de los habitantes". Son cifras disfrazadas.

QUÉ HACER EN SU LUGAR: hablá en general y en plural, sin cuantificar.
- Correcto: "Comunidades de la región están enfrentando las consecuencias de un fuerte sismo."
- Correcto: "Familias enteras necesitan apoyo para salir adelante."
- INCORRECTO: "Más de 10.000 personas quedaron damnificadas."
- INCORRECTO: "El sismo de magnitud 7.2 destruyó la ciudad."

TONO: humano, empático, sobrio y esperanzador. Movilizás, no alarmás.
PROHIBIDO el sensacionalismo: nada de "TRAGEDIA TOTAL", "DEVASTACIÓN", "EL PEOR DESASTRE", "APOCALÍPTICO", ni mayúsculas sostenidas, ni signos de exclamación múltiples.
La dignidad de las personas afectadas está por encima del impacto del mensaje: no se las describe como víctimas pasivas ni se explota su sufrimiento para pedir.`;

/**
 * El brief con los datos REALES, para el modelo que escribe el guion.
 *
 * Enumera explícitamente lo que NO se sabe. Es deliberado y es la capa 1 de la
 * defensa: un hueco en silencio es una invitación a completarlo, y un modelo de
 * lenguaje completa huecos por diseño. Decir «no se conoce la magnitud: no la
 * menciones» funciona mucho mejor que no mencionar la magnitud.
 */
export const buildEmergencyBrief = (ctx) => {
    const lines = [];

    lines.push(`Tipo de emergencia: ${ctx.disasterLabel}${ctx.customDisaster ? ` (${ctx.customDisaster})` : ''}.`);
    lines.push(`Cómo nombrarla en el guion: "${ctx.noun}".`);

    if (ctx.location) lines.push(`Lugar afectado: ${ctx.location}. Podés nombrarlo.`);
    else lines.push('NO se indicó el lugar. No nombres ningún país, región ni ciudad.');

    if (ctx.eventDate) lines.push(`Fecha del evento: ${ctx.eventDate}. Podés mencionarla.`);
    else lines.push('NO se indicó la fecha. No menciones fechas, días de la semana ni horarios.');

    if (ctx.magnitude) lines.push(`Magnitud o intensidad (dato suministrado): ${ctx.magnitude}. Podés mencionarla tal cual.`);
    else lines.push('NO se indicó la magnitud. No menciones magnitudes, categorías, escalas ni intensidades.');

    if (ctx.description) lines.push(`Descripción de la situación, escrita por el club: ${ctx.description}`);
    else lines.push('NO hay descripción de la situación. Hablá en términos generales de las consecuencias.');

    if (ctx.communities) lines.push(`Comunidades afectadas (dato suministrado): ${ctx.communities}. Podés nombrarlas.`);
    else lines.push('NO se indicaron comunidades concretas. Hablá de "comunidades" o "familias" en general.');

    const needPhrases = [
        ...ctx.needs.map(id => NEED_TYPES[id]?.phrase).filter(Boolean),
        ctx.customNeed
    ].filter(Boolean);
    if (needPhrases.length) lines.push(`Necesidades principales (dato suministrado): ${needPhrases.join(', ')}. Son las únicas que podés nombrar.`);
    else lines.push('NO se indicaron necesidades. No nombres necesidades concretas: hablá de "apoyo" en general.');

    const ctaPhrases = ctx.ctas.map(id => CTA_TYPES[id]?.phrase).filter(Boolean);
    lines.push(`Llamado a la acción pedido: ${ctaPhrases.join(' / ')}.`);
    if (ctx.contactUrl) lines.push(`Enlace o contacto de la campaña: ${ctx.contactUrl}`);

    return lines.join('\n');
};

// ─── Validación por código ─────────────────────────────────────────────────

// Los números que SÍ pueden aparecer sin estar en los datos, porque no son
// afirmaciones sobre la emergencia: un año de fundación del club, «Distrito
// 4281», «Rotary», «24/7». Se comprueban contra el texto suministrado antes de
// reprobar, así que esta lista sólo evita falsos positivos obvios.
const HARMLESS_NUMBERS = new Set(['1905', '4281', '4271', '24', '7', '100']);

// Cuantificadores vagos con forma de dato. Son cifras disfrazadas y por eso se
// tratan igual que un número: «miles de familias» afirma una magnitud sin
// escribir un número, y es exactamente la salida que un modelo produce cuando
// se le prohíben los números pero se le pide impacto.
const VAGUE_QUANTIFIERS = [
    'miles de', 'millones de', 'cientos de', 'decenas de', 'centenares de',
    'la mayoría de', 'gran parte de', 'incontables', 'innumerables',
    'la totalidad de', 'todos los habitantes', 'toda la población'
];

// Sensacionalismo. La lista es corta a propósito: son las palabras que el
// equipo excluyó explícitamente, no una lista de sinónimos que terminaría
// reprobando textos correctos.
const SENSATIONAL_TERMS = [
    'tragedia total', 'devastación total', 'devastador', 'devastadora',
    'el peor desastre', 'apocalíptico', 'apocalipsis', 'catástrofe sin precedentes',
    'aniquilado', 'arrasado por completo', 'infierno'
];

// El rango se escribe con escapes explícitos, no con los caracteres
// combinantes literales: pegados en el archivo son invisibles en cualquier
// editor y un guardado con otra normalización Unicode los altera sin que se
// vea. `̀-ͯ` es el bloque de diacríticos combinantes.
const stripAccents = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalize = (s) => stripAccents(String(s || '').toLowerCase());

/**
 * Todos los números que aparecen en un texto, como cadenas normalizadas.
 * Se descartan los separadores de miles para que «10.000» y «10000» sean el
 * mismo dato: si no, un número suministrado con puntos se leería como inventado.
 */
const numbersIn = (s) => {
    const found = String(s || '').match(/\d[\d.,]*/g) || [];
    return found.map(n => n.replace(/[.,](?=\d{3}\b)/g, '').replace(/[.,]$/, ''));
};

/**
 * Comprueba un texto generado contra los datos suministrados.
 *
 * Devuelve `{ ok, issues }`, donde cada `issue` es la REGLA CONCRETA que se
 * rompió, redactada para devolvérsela al modelo. Es la diferencia entre
 * reintentar con «revisá el formato» —que no corrige nada— y reintentar con
 * «escribiste "magnitud 7.2" y no te dimos ninguna magnitud».
 *
 * Nunca lanza: un validador que revienta con una entrada rara dejaría la
 * campaña sin generar, y el módulo tiene que degradar, no bloquear.
 */
export const validateEmergencyCopy = (copy, ctx, { field = 'texto' } = {}) => {
    const issues = [];
    const raw = String(copy || '');
    if (!raw.trim()) return { ok: false, issues: [`El ${field} llegó vacío.`] };

    const lower = normalize(raw);

    // 1. Cifras que no fueron suministradas.
    //
    // El universo de lo permitido es TODO lo que el usuario escribió, junto: si
    // un número aparece en cualquier campo del formulario, mencionarlo no es
    // inventar. Se compara contra el conjunto y no campo por campo porque el
    // usuario puede haber puesto la magnitud dentro de la descripción.
    const supplied = new Set([
        ...numbersIn(ctx.magnitude), ...numbersIn(ctx.description),
        ...numbersIn(ctx.communities), ...numbersIn(ctx.eventDate),
        ...numbersIn(ctx.location), ...numbersIn(ctx.customDisaster),
        ...numbersIn(ctx.customNeed), ...numbersIn(ctx.contactUrl)
    ]);
    for (const n of numbersIn(raw)) {
        if (supplied.has(n) || HARMLESS_NUMBERS.has(n)) continue;
        issues.push(
            `Escribiste el número "${n}" y ese dato no fue suministrado. Quitalo y decilo en general, sin cuantificar.`
        );
    }

    // 2. Cuantificadores vagos.
    for (const q of VAGUE_QUANTIFIERS) {
        if (lower.includes(normalize(q))) {
            issues.push(
                `Usaste "${q}", que es una cifra disfrazada. Hablá en plural sin cuantificar: "familias", "comunidades".`
            );
        }
    }

    // 3. Sensacionalismo.
    for (const t of SENSATIONAL_TERMS) {
        if (lower.includes(normalize(t))) {
            issues.push(`Usaste "${t}". El tono es sobrio y empático: movilizás, no alarmás.`);
        }
    }

    // 4. Mayúsculas sostenidas y exclamaciones múltiples.
    //
    // Se miran palabras de cinco letras o más para no reprobar siglas legítimas
    // —RIDE, ONU, ONG— ni el nombre de un distrito.
    const shouty = raw.match(/\b[A-ZÁÉÍÓÚÑ]{5,}\b/g) || [];
    const allowedShout = new Set(['ROTARY', 'ROTARIOS', 'ROTARIAS']);
    const offenders = shouty.filter(w => !allowedShout.has(w));
    if (offenders.length) {
        issues.push(`Escribiste en mayúsculas sostenidas ("${offenders[0]}"). Escribí en tono normal.`);
    }
    if (/[!¡]{2,}|!\s*!/.test(raw)) {
        issues.push('Usaste signos de exclamación repetidos. Una campaña institucional no grita.');
    }

    // 5. Atribución a fuentes que no tenemos.
    //
    // Va SIEMPRE, tenga o no ubicación. Es la corrección de un error de
    // criterio: esta comprobación estaba dentro del `if (!hasFacts.location)`
    // por haberla escrito junto a la de topónimos, y así una campaña con la
    // ubicación completa —el caso normal— dejaba pasar «según reportes».
    //
    // Son dos cosas distintas: nombrar una ciudad que no se dio depende de qué
    // se dio; atribuir a «las autoridades» es inventar una fuente siempre, y en
    // una pieza institucional es de lo más caro que puede colarse.
    const attributions = [
        'segun reportes', 'segun informes', 'segun las autoridades', 'segun fuentes',
        'las autoridades informan', 'las autoridades reportan',
        'fuentes oficiales', 'cifras oficiales', 'datos oficiales',
        'se estima que', 'se calcula que', 'trascendio que'
    ];
    for (const a of attributions) {
        if (lower.includes(normalize(a))) {
            issues.push(`Escribiste "${a}", que atribuye el dato a una fuente que no tenemos. Quitalo y contá sólo lo que sabemos.`);
        }
    }

    // 6. Topónimos no suministrados. Esta SÍ depende de la ubicación: con una
    // ubicación dada, distinguir «nombró otra ciudad» de «nombró la que le
    // dimos» exigiría un catálogo de topónimos que no tenemos, y una
    // comprobación que no se puede hacer bien da falsos positivos sobre texto
    // correcto — que es peor que no hacerla. Queda declarado el hueco.

    return { ok: issues.length === 0, issues };
};

/**
 * El mensaje de reintento para el modelo. Junta las reglas rotas en una
 * instrucción concreta, que es lo único que corrige de verdad.
 */
export const buildRetryInstruction = (issues) =>
    `El texto anterior incumplió estas reglas y hay que reescribirlo:\n${
        issues.map((i, n) => `${n + 1}. ${i}`).join('\n')
    }\nReescribilo respetando todo lo demás del pedido original.`;

/**
 * Título de campaña por defecto, para cuando el usuario no escribe uno.
 *
 * Se arma con datos suministrados y nada más. Sin ubicación, no se inventa
 * ninguna: queda el tipo de emergencia a secas, que es cierto.
 */
export const defaultCampaignTitle = (ctx, organizationName = null) => {
    const org = String(organizationName || '').trim();
    const where = ctx.location ? ` · ${ctx.location}` : '';
    const what = ctx.customDisaster || ctx.disasterLabel;
    return `${org ? `${org} · ` : ''}Campaña de Emergencia — ${what}${where}`;
};
