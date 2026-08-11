// ════════════════════════════════════════════════════════════════════
// Plantillas IA — Motor de Composición (el CRITERIO)
// v4.755.0
//
// PURO: sin base, sin red, sin IA, sin DOM. Decide qué se le pide al modelo de
// imagen, con qué variantes y qué se acepta de vuelta. La orquestación —hablar
// con KIE, sondear, subir a S3— vive en `designBackdrop.js`.
//
// ── EL REPARTO: LA IA HACE LA IMAGEN, NOSOTROS HACEMOS EL TEXTO ─────
//
// Ésta es la decisión de fondo del módulo y conviene entender por qué es así,
// porque el pedido original planteaba que el modelo compusiera la pieza ENTERA,
// texto incluido.
//
// Los modelos generativos de imagen no escriben texto de forma fiable. Un
// párrafo de felicitación en español, el nombre propio de un club y el nombre
// del Gobernador salen deformados o mal escritos con frecuencia alta. Y una vez
// que salen mal **no hay salida limpia**: corregirlos encima es exactamente el
// composite que el equipo rechazó dos veces («se ve overlay / montaje»,
// v4.323-v4.324) y el enmascarado grande que producía mosaico (v4.317-v4.320).
// Quedaría entre publicar una pieza con el club mal escrito o volver a un
// camino ya descartado.
//
// Así que el reparto es por CAPACIDAD, no por gusto:
//
//   · KIE hace lo que un modelo generativo hace bien: construir una imagen
//     —fondo institucional, textura, curvas— e INTEGRAR la fotografía del club
//     dentro de esa imagen, armonizando luz, color y bordes. Eso es lo que hoy
//     no se puede lograr con una composición declarada, y es exactamente el
//     «que no se vea pegada» del pedido.
//   · Nuestro motor hace lo que sabe hacer exacto: el nombre del club, el
//     mensaje, el logotipo y la firma del Gobernador, nítidos y sin errores.
//
// No es un composite de los prohibidos: el modelo no devuelve una fotografía
// que retoquemos, devuelve el LIENZO sobre el que se compone. Dibujar
// tipografía sobre un fondo es diseño gráfico normal, y es lo que este módulo
// ya hacía — sólo que ahora el fondo también puede venir del modelo.
//
// ── LO QUE NO SE LE PIDE AL MODELO ──────────────────────────────────
//
// Nada de texto. Va en `negative_prompt`, en su propio campo y no pegado al
// positivo: la regla del sitio es escribir en positivo porque el modelo se
// obsesiona con lo prohibido cuando la prohibición está DENTRO de la
// descripción de la escena; en un campo aparte la lee como lo que es (misma
// solución que el Creador de Reels en v4.705).
// ════════════════════════════════════════════════════════════════════

import { formatOf } from './designSpec.js';

// ─── Modelo ────────────────────────────────────────────────────────────
//
// Configurable por entorno, como todos los modelos de KIE: renombran los ids y
// no se puede depender de que el default siga existiendo (regla del Generador
// de Outros).
export const COMPOSE_MODEL = () => process.env.DESIGN_COMPOSE_MODEL || 'google/nano-banana-edit';
export const MAX_VARIANTS = 4;
export const DEFAULT_VARIANTS = 1;

/** El texto de referencia va al generador de COPY, no al de imagen, así que su
 *  tope es el de un contexto de texto y no el presupuesto de `nano-banana`. */
export const REFERENCE_MAX_CHARS = 1200;

// ─── Planes de variante ────────────────────────────────────────────────
//
// Cada variante es una DISTRIBUCIÓN distinta, no una semilla distinta: pedirle
// cuatro veces lo mismo al modelo da cuatro versiones parecidas y no ayuda a
// elegir. Lo que cambia es dónde manda la fotografía y qué zona queda limpia
// para el texto — que es lo que de verdad cambia el aspecto de la pieza.
//
// `clear` describe, en positivo, la región que tiene que quedar tranquila
// porque ahí va a ir la tipografía. El modelo no sabe qué va a escribir nadie:
// lo único que se le puede pedir es superficie legible.
export const VARIANT_PLANS = [
    {
        id: 'foto_superior',
        label: 'Fotografía arriba',
        summary: 'La foto ocupa la mitad superior y el texto respira abajo.',
        photo: 'the photograph fills the upper half of the square, edge to edge',
        clear: 'the lower half is a calm, even surface with plenty of room to read',
        textZone: { y: 0.5, h: 0.5 },
    },
    {
        id: 'foto_lateral',
        label: 'Fotografía a un lado',
        summary: 'La foto toma el lado derecho; el texto queda en columna a la izquierda.',
        photo: 'the photograph fills the right side of the square, softly rounded on its inner edge',
        clear: 'the left third is a calm, even surface with plenty of room to read',
        textZone: { y: 0.15, h: 0.7 },
    },
    {
        id: 'foto_circular',
        label: 'Fotografía en círculo',
        summary: 'La foto entra en un óvalo generoso, centrada arriba.',
        photo: 'the photograph sits inside a generous soft-edged oval in the upper area, blending into the background',
        clear: 'everything below the oval is a calm, even surface with plenty of room to read',
        textZone: { y: 0.55, h: 0.4 },
    },
    {
        // El recorte curvo de la papelería del Distrito: la fotografía entra en
        // una forma grande de bordes redondeados arriba a la derecha y la curva
        // del lienzo la muerde por abajo. Es la referencia que trajo el equipo,
        // y la que mejor se lleva con un texto en columna a la izquierda.
        id: 'foto_recorte_curvo',
        label: 'Recorte curvo',
        summary: 'La foto entra en una forma redondeada arriba a la derecha, mordida por la curva del lienzo.',
        photo: 'the photograph fills one large rounded shape in the upper right, taking up a substantial part of the layout, its lower edge cut by the sweeping curve of the canvas',
        clear: 'the left column and the lower area stay a calm, even surface with plenty of room to read',
        textZone: { y: 0.45, h: 0.5 },
    },
    {
        // La forma de la papelería del Distrito: un óvalo alto arriba a la
        // derecha, con el borde levantado por un resplandor blanco suave. Es la
        // referencia que trajo el equipo (la pieza de «La verdadera inclusión»)
        // y la que mejor se lleva con el texto en columna a la izquierda.
        id: 'foto_ovalo_brillo',
        label: 'Óvalo con brillo',
        summary: 'La foto entra en un óvalo alto arriba a la derecha, con un halo blanco suave que la levanta del fondo.',
        photo: 'the photograph fills one large tall soft-edged oval in the upper right, taking up a substantial part of the layout, its curved edge lifted off the canvas by a gentle white glow',
        clear: 'the left column and the lower area stay a calm, even surface with plenty of room to read',
        textZone: { y: 0.4, h: 0.5 },
    },
    {
        // La referencia final del equipo (la pieza hecha en ChatGPT): las
        // personas RECORTADAS de su propio fondo, paradas a lo ancho de la
        // mitad inferior, con el borde de abajo metido tras la banda del pie.
        // La instrucción del recorte vive ACÁ y no en el prompt maestro: el
        // encuadre es quien dice dónde va la foto, y tenerla en dos lados era
        // la contradicción que hacía que el modelo pegara la foto arriba.
        id: 'silueta_inferior',
        label: 'Silueta en la mitad inferior',
        summary: 'Las personas recortadas de su fondo, a lo ancho de la mitad de abajo, tras la banda del pie.',
        photo: 'the people from the photograph are cut out of their own background and stand together across the lower half of the canvas, large and centred, their lower edge tucked behind the bottom band, softly lit so they belong to the piece',
        clear: 'the upper left column stays a calm, even surface with plenty of room to read',
        textZone: { y: 0.08, h: 0.34 },
    },
    {
        id: 'foto_fondo',
        label: 'Fotografía de fondo',
        summary: 'La foto es el fondo entero, atenuada hacia abajo para que el texto se lea.',
        photo: 'the photograph fills the whole square as the background, its lower area easing into a soft, light field',
        clear: 'the lower two thirds read as a light, even field where dark text is comfortable',
        textZone: { y: 0.42, h: 0.5 },
    },
];

export const planById = (id) => VARIANT_PLANS.find(p => p.id === id) || VARIANT_PLANS[0];

// ─── DÓNDE VA A CAER NUESTRO TEXTO ─────────────────────────────────────
//
// El modelo compone a ciegas: no sabe que encima de esa imagen vamos a imprimir
// el nombre del club, el mensaje y la firma del Gobernador. Por eso una
// composición podía salir preciosa y quedar inservible —la fotografía justo
// debajo del título, con las caras tapadas por el texto—.
//
// `textBandOf` mira el documento REAL y devuelve la franja vertical que ocupa
// lo que se va a imprimir. Es la diferencia entre «integrá la foto» y «armá una
// pieza»: en una pieza, el hueco para el texto es parte del diseño.
//
// Es una FRANJA vertical y no una caja: el modelo entiende «la mitad de abajo»
// mucho mejor que unas coordenadas, y una caja obligaría a describir formas que
// después no se pueden comprobar.
export const textBandOf = (document) => {
    const nodes = (document?.nodes || []).filter(n =>
        !n.hidden && (n.type === 'text' || (n.type === 'image' && (n.srcVar === 'logo' || n.role === 'logo')))
    );
    if (!nodes.length) return null;

    let top = 1, bottom = 0;
    for (const n of nodes) {
        const y = Number(n.y) || 0;
        const h = Number(n.h) || 0;
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + h);
    }
    top = Math.max(0, Math.min(1, top));
    bottom = Math.max(0, Math.min(1, bottom));
    return bottom > top ? { y: top, h: bottom - top } : null;
};

/** Cuánto se solapan dos franjas verticales, de 0 a 1 sobre la más chica. Es lo
 *  que permite ordenar los planes por lo bien que le sientan a ESTE diseño. */
const overlap = (a, b) => {
    if (!a || !b) return 0;
    const ini = Math.max(a.y, b.y);
    const fin = Math.min(a.y + a.h, b.y + b.h);
    const cruce = Math.max(0, fin - ini);
    const menor = Math.min(a.h, b.h);
    return menor > 0 ? cruce / menor : 0;
};

/** Los planes que se van a usar en esta generación.
 *
 *  Con `document`, se ORDENAN por lo bien que su zona limpia coincide con la
 *  franja donde de verdad va el texto: con una sola variante sale la que le
 *  sirve a esta pieza, no la primera de la lista. Sin documento se conserva el
 *  orden declarado.
 *
 *  El orden sigue siendo determinista en los dos casos, que es lo que importa:
 *  quien regenera espera una alternativa, no un sorteo. */
export const plansFor = (count, document = null, planId = 'auto') => {
    const n = Math.max(1, Math.min(MAX_VARIANTS, count || DEFAULT_VARIANTS));

    // El encuadre DECLARADO por la plantilla va primero, y con una sola
    // variante es el único. Es dirección de arte: puntuar contra la franja del
    // texto es un buen respaldo, pero no sabe que esta pieza quiere la forma
    // grande mordida por la curva y no el óvalo del medio.
    const declarado = planId && planId !== 'auto' ? VARIANT_PLANS.find(p => p.id === planId) : null;
    const resto = VARIANT_PLANS.filter(p => p !== declarado);

    const banda = textBandOf(document);
    const ordenado = !banda ? resto : resto
        .map((p, i) => ({ p, i, score: overlap(p.textZone, banda) }))
        // A igual puntaje manda el orden declarado: sin este desempate, dos
        // planes empatados podrían salir en cualquier orden según el motor.
        .sort((a, b) => (b.score - a.score) || (a.i - b.i))
        .map(x => x.p);

    return (declarado ? [declarado, ...ordenado] : ordenado).slice(0, n);
};

/** La franja libre, dicha como la entiende un modelo de imagen. Nada de
 *  coordenadas: «la mitad de abajo» se cumple, «y entre 0,5 y 1,0» no. */
export const clearClauseFor = (banda) => {
    if (!banda) return null;
    const centro = banda.y + banda.h / 2;
    const dónde = banda.h > 0.7 ? 'the middle of the square'
        : centro < 0.34 ? 'the upper third of the square'
        : centro > 0.66 ? 'the lower third of the square'
        : 'the middle band of the square';
    return `${cap(dónde)} stays calm and even, with nothing busy in it: that is where the club's name and message are printed afterwards.`;
};

// ─── Configuración de composición de una plantilla ─────────────────────
//
// Es lo que el administrador define una vez: la imagen base institucional, el
// prompt maestro y cuántas variantes se generan. Vive con la plantilla y con la
// publicación, no en el código, para que una plantilla nueva sea sólo datos.
export const COMPOSITION_DEFAULTS = {
    enabled: false,
    baseImageUrl: null,
    // ── TRES TEXTOS, TRES COSAS DISTINTAS ───────────────────────────
    //
    // Se guardan por separado a propósito, porque responden preguntas
    // distintas y los consume maquinaria distinta. Mezclarlos es el error que
    // este módulo ya cometió teniendo sólo dos:
    //
    //   · `referenceText` — QUÉ hay que comunicar. Es contexto SEMÁNTICO y lo
    //     lee el generador de copy, no el modelo de imagen. No se imprime
    //     literal: describe la intención («reconocer la trayectoria, felicitar
    //     a los socios») para que el mensaje de cada club salga con ese sentido.
    //   · `masterPrompt` — CÓMO tiene que verse la pieza. Es dirección de arte
    //     y lo lee el modelo de imagen.
    //   · El copy final —el texto impreso de ESA generación— no vive acá: se
    //     produce por club y queda en el documento.
    //
    // Meter la intención dentro del prompt de imagen sería pedirle al modelo
    // generativo que escriba, que es justo lo que este módulo no le pide.
    referenceText: '',
    masterPrompt: '',
    // ── CÓMO SE USA LA FOTOGRAFÍA, DECLARADO POR LA PLANTILLA ───────
    //
    // Hasta v4.762 el encuadre lo elegía `plansFor` sola, puntuando cada plan
    // contra la franja del texto. Es un buen respaldo y no es una decisión de
    // dirección de arte: con una sola variante salía el que mejor puntuara, y
    // en la plantilla de aniversario eso daba el óvalo pequeño en el medio
    // cuando lo que la pieza quiere es la forma grande mordida por la curva.
    // Ahora la plantilla lo puede DECLARAR y `auto` conserva el respaldo.
    photo: {
        // `compose` manda la fotografía al modelo; `slot` la deja en su
        // recuadro sin gastar créditos. Es el interruptor por plantilla del
        // que habla el diagnóstico, no un modo escondido.
        strategy: 'compose',
        // Un id de `VARIANT_PLANS`, o `auto` para que lo decida el documento.
        plan: 'auto',
        // Qué hacer cuando el encuadre se lleva a alguien del borde (v4.762).
        edgeCrop: 'allow',
        // Cuánto ANCHO del lienzo ocupa el grupo (v4.771). Se dice en palabras
        // —lo que un modelo entiende—, no en porcentajes.
        width: 'medio',
    },
    // Si la imagen base se reproduce FIEL o se deja VARIAR entre piezas
    // (v4.771): misma familia de papelería, distinta lámina. Lo que nunca varía
    // lo dice la cláusula: la estructura, la banda y dónde viven los globos.
    baseVariation: 'fiel',
    // ── LOS MOTIVOS DE LA OCASIÓN ──────────────────────────────────
    //
    // Una pieza de aniversario no se ve igual que una de condolencias, y eso no
    // se resuelve con el estilo genérico. Va aparte del prompt maestro porque
    // responde otra pregunta —QUÉ ocasión es, no cómo se ve la marca— y porque
    // se recorta antes que la dirección de arte del administrador.
    //
    // Se escribe EN POSITIVO y acotado, como todo prompt del sitio: «unos pocos
    // confetis finos en las esquinas vacías», no «que haya fiesta». Un motivo
    // sin acotar se come la pieza.
    motifs: '',
    variants: DEFAULT_VARIANTS,
    // Cuántas variantes ve el público. Por defecto una: el portal es anónimo y
    // cada variante es una llamada al modelo que alguien paga.
    publicVariants: DEFAULT_VARIANTS,
    style: 'institucional',
};

export const normalizeComposition = (raw) => {
    const c = raw && typeof raw === 'object' ? raw : {};
    const clampVariants = (v, fb) => {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? Math.max(1, Math.min(MAX_VARIANTS, n)) : fb;
    };
    const ph = c.photo && typeof c.photo === 'object' ? c.photo : {};
    return {
        enabled: !!c.enabled,
        baseImageUrl: typeof c.baseImageUrl === 'string' && c.baseImageUrl.trim() ? c.baseImageUrl.trim() : null,
        referenceText: String(c.referenceText || '').slice(0, REFERENCE_MAX_CHARS).trim(),
        masterPrompt: String(c.masterPrompt || '').slice(0, 1200).trim(),
        photo: {
            strategy: ph.strategy === 'slot' ? 'slot' : 'compose',
            // Un plan que no existe cae en `auto`, no en el primero de la
            // lista: el respaldo es el criterio del documento, no un encuadre
            // elegido por descarte. Un id viejo se degrada solo.
            plan: VARIANT_PLANS.some(p => p.id === ph.plan) ? ph.plan : 'auto',
            edgeCrop: ph.edgeCrop === 'strict' ? 'strict' : 'allow',
            width: ['compacto', 'medio', 'amplio'].includes(ph.width) ? ph.width : 'medio',
        },
        baseVariation: c.baseVariation === 'variar' ? 'variar' : 'fiel',
        motifs: String(c.motifs || '').slice(0, MOTIF_MAX_CHARS).trim(),
        variants: clampVariants(c.variants, DEFAULT_VARIANTS),
        publicVariants: clampVariants(c.publicVariants, DEFAULT_VARIANTS),
        style: String(c.style || 'institucional').slice(0, 40),
    };
};

// ─── El prompt ─────────────────────────────────────────────────────────
//
// Corto y en positivo, como todo prompt del sitio. Describe la pieza que se
// quiere, no la lista de lo que no. Se arma en capas para que se pueda leer:
//
//   1. Qué es (una lámina institucional cuadrada).
//   2. Qué hacer con las dos imágenes que se mandan.
//   3. Dónde va la fotografía y qué zona queda limpia (el plan de variante).
//   4. Lo que el administrador quiera agregar (prompt maestro).
//
// El presupuesto es real: `nano-banana` recorta prompts largos y lo primero que
// se pierde es el final. Por eso el plan va ANTES del prompt maestro y el
// maestro se acota.
// El presupuesto es NUESTRO, no un límite declarado por el modelo: `nano-banana`
// acepta bastante más y lo que pasa con un prompt larguísimo es que se diluye,
// no que se rechace. Estaba en 1400 y con la dirección de arte del Distrito
// escrita —la lámina clara con la banda azul y dorada— se caían justo los
// motivos de la ocasión, que es lo que el cliente había pedido. Se sube y queda
// configurable, como el prompt de escena del Creador de Reels: si algún día un
// motor recorta antes, se ajusta sin desplegar.
export const PROMPT_MAX_CHARS = Number(process.env.DESIGN_PROMPT_MAX_CHARS) || 2000;
// Los motivos de la ocasión son un ACENTO, no un párrafo: acotados para que no
// desplacen lo que sostiene la composición y para que el modelo no los tome por
// el tema de la pieza.
export const MOTIF_MAX_CHARS = 240;

// Lo único que NO puede aparecer, y va en su propio campo.
export const NEGATIVE_PROMPT =
    'text, letters, words, typography, captions, watermark, signature, logo, emblem, numbers, '
    + 'distorted faces, extra people, duplicated people, warped hands, harsh shadows, heavy vignette, cluttered collage, '
    // Lo que salió de verdad al estrenar la composición: una miniatura con
    // marco flotando en el medio, en vez de la forma grande integrada.
    + 'framed inset, thumbnail, photo border, sticker, drop shadow box, polaroid, '
    // El fondo salía oscurecido y con un gris sucio encima del lienzo claro.
    + 'grey wash, darkened background, muddy tones, desaturated, heavy gradient';

const STYLE_CLAUSES = {
    institucional: 'The mood is calm and institutional: soft light, generous white space, understated elegance.',
    calido: 'The mood is warm and human: soft daylight, gentle warmth in the tones, welcoming.',
    festivo: 'The mood is celebratory but restrained: light and airy, a subtle sense of occasion.',
    sobrio: 'The mood is sober and formal: restrained palette, quiet surfaces, nothing decorative.',
};

export const buildBackdropPrompt = ({ composition, plan, palette = {}, photo = null, hasBase = false, document = null }) => {
    const c = normalizeComposition(composition);
    const p = plan || VARIANT_PLANS[0];

    const partes = [];

    // 1. Qué es.
    partes.push('A square 1:1 institutional layout background for a Rotary club piece.');

    // 2. Las dos imágenes. El orden importa: el modelo entiende «la primera» y
    //    «la segunda» mejor que nombres inventados.
    if (hasBase && photo) {
        // EL LIENZO VUELVE INTACTO, y hay que decirlo con esas palabras.
        //
        // «Conservá su textura, sus curvas y sus colores» sonaba suficiente y no
        // lo era: el modelo devolvía la pieza con el fondo aclarado y la curva
        // redibujada — se reportó como «cambia el color del fondo de base». Un
        // modelo de edición entiende «reproducilo sin cambios, lo único que se
        // añade es la fotografía» mucho mejor que una lista de cualidades a
        // respetar, porque lo segundo lo lee como una descripción de estilo.
        if (c.baseVariation === 'variar') {
            // Variar NO es rediseñar: la estructura, la banda y la posición de
            // los globos se afirman fijas; lo que se suelta es la textura y el
            // tamaño y tipo de los globos. Así cada pieza es de la misma
            // familia sin ser la misma lámina.
            partes.push('The first image is the brand canvas: keep its structure — the bright pearl surface, the sweeping band along the bottom in the same place and colours, and the balloons living along the right edge — but feel free to vary the texture curves and the size, number and style of the balloons, as a fresh piece from the same stationery family. The surface stays bright and light throughout.');
        } else {
            partes.push('The first image is the finished brand canvas: reproduce it unchanged — same colours, same sweeping curve in the same place, same empty areas. Its surface stays bright and light throughout. Do not restyle it and do not redraw it. The only thing added is the photograph.');
        }
        // Cómo se INTEGRA, no sólo que se integre. Es lo que separa una foto
        // pegada de una pieza de papelería: la fotografía va DENTRO de una
        // forma que pertenece al lienzo —un recorte de bordes curvos, con su
        // margen limpio alrededor— y la luz de las dos se encuentra.
        //
        // Y el TAMAÑO se dice: sin él salía una miniatura con marco flotando en
        // el medio. «Grande» y «una parte sustancial de la lámina» es lo que
        // entiende un modelo de imagen; un porcentaje no.
        partes.push('The second image is a real photograph of the club members. Set it into the canvas as printed stationery does: a clean margin of canvas breathing around it, its edge easing into the surface instead of sitting in a frame, and its light and colour matched so the two read as a single designed piece.');
    } else if (photo) {
        partes.push('The image is a real photograph of the club members. Build a clean institutional canvas around it — soft light surfaces, gentle flowing curves — so the photograph belongs inside a designed layout.');
    } else if (hasBase) {
        partes.push('The image is the brand canvas: keep its texture, its curves and its colours, and extend it into a complete square layout.');
    }

    // 3. Dónde va y qué queda limpio.
    //
    // La franja limpia sale del documento REAL cuando se conoce: el modelo
    // compone a ciegas y no sabe que encima vamos a imprimir el nombre del club
    // y el mensaje. Sin esto, una composición podía salir preciosa y quedar
    // inservible, con las caras justo debajo del título. El plan sigue
    // decidiendo DÓNDE va la fotografía; lo que se afina es qué se respeta.
    const banda = clearClauseFor(textBandOf(document));
    partes.push(`${cap(p.photo)}, and ${p.clear}.`);
    // El ANCHO del grupo, en palabras. Sin esto la silueta salía de borde a
    // borde y no había forma de acotarla sin tocar código.
    const ancho = {
        compacto: 'The group stays gathered and compact, taking up about half the width of the canvas, centred.',
        medio: 'The group takes up about two thirds of the width of the canvas, centred, with air on both sides.',
        amplio: null,
    }[c.photo.width];
    if (photo && ancho) partes.push(ancho);
    if (banda) partes.push(banda);

    // La gente de la foto es el motivo por el que existe la pieza.
    if (photo) {
        partes.push('Everyone in the photograph stays in the frame, whole and recognisable, with their faces and their clothing exactly as they are.');
    }

    // 4. LA DIRECCIÓN DE ARTE DEL ADMINISTRADOR.
    //
    // Va ANTES de la paleta y el estilo genérico, y ése es un cambio deliberado
    // respecto de v4.734: el prompt maestro era lo ÚLTIMO y por tanto lo
    // primero que se recortaba, así que un administrador que se tomara el
    // trabajo de escribir su dirección creativa podía quedarse sin ella
    // mientras sobrevivía una cláusula de estilo escrita por nosotros. Entre
    // las dos, manda la suya.
    //
    // Lo que NO se puede desplazar es la preservación de las personas ni la
    // franja del texto: van antes, y no se recortan nunca. Un prompt maestro no
    // puede aflojar por lo bajo una garantía que la pieza promete.
    // 4-5. La COLA, en orden de importancia. Se recorta desde el final, así que
    // este array ES el orden de sacrificio y conviene leerlo como tal:
    //
    //   · prompt maestro   — la dirección de arte del administrador. Se cae el
    //                        último: entre su criterio y una cláusula escrita
    //                        por nosotros, manda el suyo (v4.755).
    //   · motivos          — la ocasión. Importan, y menos que su dirección.
    //   · paleta y estilo  — la guinda cuando ya hay lienzo y dirección.
    //
    // Lo que NO está acá —la preservación del lienzo, la de las personas y la
    // franja del texto— va antes y no se recorta nunca. Un recorte no puede
    // aflojar por lo bajo una garantía que la pieza promete.
    const cols = [palette.primary, palette.accent].filter(Boolean);
    const cola = [
        c.masterPrompt ? { label: 'prompt maestro', text: c.masterPrompt } : null,
        c.motifs ? { label: 'motivos de la ocasión', text: c.motifs } : null,
        cols.length ? { label: 'paleta', text: `The palette leans on ${cols.join(' and ')} with plenty of white.` } : null,
        { label: 'estilo', text: STYLE_CLAUSES[c.style] || STYLE_CLAUSES.institucional },
    ].filter(Boolean);

    const armar = (n) => [...partes, ...cola.slice(0, n).map(x => x.text)].join(' ');

    const full = armar(cola.length);
    if (full.length <= PROMPT_MAX_CHARS) return { prompt: full, dropped: [] };

    // Se DICE lo que se dejó fuera: un recorte silencioso convierte «lo
    // pedimos» en una afirmación falsa (misma regla que el prompt de escena del
    // Creador de Reels).
    const dropped = [];
    let n = cola.length;
    let out = full;
    while (n > 0 && out.length > PROMPT_MAX_CHARS) {
        n -= 1;
        dropped.push(cola[n].label);
        out = armar(n);
    }
    if (out.length > PROMPT_MAX_CHARS) {
        out = out.slice(0, PROMPT_MAX_CHARS).replace(/\s+\S*$/, '');
        dropped.push('cola del prompt');
    }
    return { prompt: out, dropped };
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ─── El nodo que devuelve la composición ───────────────────────────────
//
// El fondo generado entra como un nodo de imagen AL FONDO de la pila, bloqueado
// y con `role: 'backdrop'`. Todo lo demás —el texto, el logotipo, la firma— se
// sigue dibujando encima con nuestro motor, nítido.
//
// Se marca con `role` y no por posición: el usuario puede reordenar capas, y
// una regeneración tiene que encontrar el fondo anterior para reemplazarlo, no
// para acumular fondos.
export const BACKDROP_ROLE = 'backdrop';

// ─── EL LIENZO INSTITUCIONAL ES UN NODO, NO UN AJUSTE ──────────────────
//
// La imagen base se elegía en el panel de Composición y **no se veía en
// ninguna parte**: era sólo un dato que viajaba al modelo. El administrador
// diseñaba sobre blanco, así que colocaba el texto y el logotipo a ciegas
// respecto del fondo sobre el que iban a quedar, y la pieza que descargaba —o
// que publicaba con la composición apagada— salía sin ese fondo.
//
// Ahora es un nodo del documento, al pie de la pila y bloqueado. Con eso se
// dibuja en la mesa de trabajo, se exporta y se publica, sin ninguna maquinaria
// nueva: es el mismo grafo de escena de siempre.
//
// Es un ROL DISTINTO del fondo generado, y la diferencia importa:
//
//   · `lienzo` es la papelería del Distrito. No tapa nada: la fotografía del
//     club se sigue dibujando encima, en su recuadro.
//   · `backdrop` es lo que devuelve el modelo, y ahí la fotografía YA está
//     dentro de la imagen, así que su nodo se apaga.
//
// Confundirlos apagaría el hueco de la fotografía apenas se elige una imagen
// base, y entonces quien abre el enlace público subiría su foto y no la vería.
export const BASE_ROLE = 'lienzo';

export const baseNode = (url, { id = 'lienzo_base' } = {}) => ({
    id,
    type: 'image',
    name: 'Lienzo institucional',
    role: BASE_ROLE,
    src: url,
    srcVar: null,
    fit: 'cover',
    x: 0, y: 0, w: 1, h: 1,
    rotation: 0, opacity: 1,
    radius: 0,
    locked: true,
});

/** Pone —o cambia, o quita— el lienzo institucional al pie de la pila. Con
 *  `url` vacía se retira: quitar la imagen base tiene que devolver la pieza a
 *  como estaba, igual que quitar el fondo generado. */
export const withBase = (document, url) => {
    const resto = (document?.nodes || []).filter(n => n.role !== BASE_ROLE);
    return { ...document, nodes: url ? [baseNode(url), ...resto] : resto };
};

export const hasBase = (document) => (document?.nodes || []).some(n => n.role === BASE_ROLE);

export const backdropNode = (url, { id = 'fondo_ia' } = {}) => ({
    id,
    type: 'image',
    name: 'Fondo generado',
    role: BACKDROP_ROLE,
    src: url,
    srcVar: null,
    fit: 'cover',
    x: 0, y: 0, w: 1, h: 1,
    rotation: 0, opacity: 1,
    radius: 0,
    locked: true,
});

/** Mete el fondo al pie de la pila, reemplazando el anterior si lo había.
 *  También apaga el nodo de la fotografía original: la foto YA está dentro del
 *  fondo generado, y dejarla encima la mostraría dos veces. */
export const withBackdrop = (document, url) => {
    const resto = (document?.nodes || [])
        .filter(n => n.role !== BACKDROP_ROLE)
        .map(n => (n.type === 'image' && (n.srcVar === 'imagen' || n.role === 'foto') ? { ...n, hidden: true } : n));
    // ENCIMA del lienzo institucional, no debajo. La imagen compuesta ya
    // contiene ese lienzo con la fotografía integrada; ponerla al fondo del
    // todo la dejaría tapada por el propio lienzo y la composición no se vería.
    const i = resto.findIndex(n => n.role !== BASE_ROLE);
    const at = i === -1 ? resto.length : i;
    return { ...document, nodes: [...resto.slice(0, at), backdropNode(url), ...resto.slice(at)] };
};

/** Quitar el fondo generado devuelve la pieza a la composición declarada, con
 *  su fotografía visible otra vez. Es la vuelta atrás, y tiene que existir: una
 *  generación que no gusta no puede dejar la pieza peor que antes. */
export const withoutBackdrop = (document) => ({
    ...document,
    nodes: (document?.nodes || [])
        .filter(n => n.role !== BACKDROP_ROLE)
        .map(n => (n.type === 'image' && (n.srcVar === 'imagen' || n.role === 'foto') ? { ...n, hidden: false } : n)),
});

export const hasBackdrop = (document) => (document?.nodes || []).some(n => n.role === BACKDROP_ROLE);

// ─── La fotografía cuando se FUNDE con el lienzo ───────────────────────
//
// Con la Composición encendida, la fotografía del club NO ocupa un recuadro:
// la IA la integra dentro de la imagen de base y lo que entra en la pieza es el
// resultado. El nodo de la fotografía sigue existiendo —es lo que DECLARA el
// campo del formulario público, y sin él nadie puede subir nada—, pero pintarlo
// como un hueco es enseñar algo que no va a pasar: en el editor se veía un
// tablero gris ocupando media pieza, y en el portal, un recuadro punteado
// prometiendo que la foto va justo ahí. Ninguna de las dos cosas es cierta.
//
// Es una decisión de PINTADO, no del documento. Marcar el nodo `hidden` lo
// dejaría apagado también al apagar la composición, y entonces la fotografía no
// volvería nunca a su sitio. Por eso se resuelve al dibujar, como `slots`.

/** El nodo que declara la fotografía del club, o null. Misma condición que usan
 *  `withBackdrop` y el estudio: la clave o el rol, porque una plantilla puede
 *  llamar `portada` a su fotografía. */
export const photoNodeOf = (document) =>
    (document?.nodes || []).find(n => n.type === 'image' && (n.srcVar === 'imagen' || n.role === 'foto')) || null;

/**
 * El id de la fotografía que la composición va a ABSORBER, o null.
 *
 * Con un fondo ya generado devuelve null a propósito: ahí la foto ya está
 * dentro del fondo y `withBackdrop` la apagó en el documento — dos mecanismos
 * para lo mismo se contradirían en cuanto uno cambiara.
 */
export const fusedPhotoId = (document, composition) => {
    if (!composition?.enabled) return null;
    if (hasBackdrop(document)) return null;
    const n = photoNodeOf(document);
    // Sólo el hueco VACÍO. Con una fotografía puesta y todavía sin fondo
    // generado, esa fotografía dentro de su recuadro es el RESPALDO declarado
    // del módulo —«se usó tu fotografía tal como la subiste, dentro del
    // diseño»—: es lo que se entrega si componer falla o si el control de
    // preservación descarta la composición. Ocultarla ahí dejaría la pieza sin
    // la foto y sin nada que lo explicara.
    if (!n || n.src) return null;
    return n.id;
};

// ─── Qué se acepta de vuelta ───────────────────────────────────────────
//
// El modelo puede devolver algo de otra proporción o directamente fallar. Se
// comprueba lo que se puede comprobar sin decodificar de más: que sea una
// imagen, que tenga la proporción del formato y que no sea diminuta.
//
// **No se comprueba que no tenga texto.** Detectarlo exigiría OCR —decenas de
// MB en una función que ya empaqueta FFmpeg— y aun así sería poco fiable. Lo
// que se hace es pedirlo por `negative_prompt` y dejar la decisión a la vista:
// el usuario ve la variante antes de usarla. No afirmar en la interfaz que se
// verifica algo que no se verifica.
export const ASPECT_TOLERANCE = 0.04;
export const MIN_SIDE = 512;

export const validateBackdrop = ({ width, height, format }) => {
    const fmt = formatOf(format);
    const problemas = [];
    if (!width || !height) return { ok: false, problemas: ['No se pudieron leer las medidas de la imagen generada.'] };
    if (Math.min(width, height) < MIN_SIDE) problemas.push(`La imagen generada mide ${width}×${height}: es chica para el formato.`);
    const objetivo = fmt.width / fmt.height;
    const real = width / height;
    if (Math.abs(real - objetivo) / objetivo > ASPECT_TOLERANCE) {
        problemas.push(`El modelo devolvió una proporción ${real.toFixed(2)} en vez de ${objetivo.toFixed(2)}; se va a encuadrar al formato.`);
    }
    return { ok: problemas.length === 0, problemas, width, height };
};

/** La proporción que se le pide a KIE, derivada del formato. */
export const aspectFor = (format) => {
    const fmt = formatOf(format);
    const g = (a, b) => (b ? g(b, a % b) : a);
    const d = g(fmt.width, fmt.height) || 1;
    return `${fmt.width / d}:${fmt.height / d}`;
};

export default {
    COMPOSE_MODEL, MAX_VARIANTS, DEFAULT_VARIANTS,
    VARIANT_PLANS, planById, plansFor,
    COMPOSITION_DEFAULTS, normalizeComposition,
    buildBackdropPrompt, NEGATIVE_PROMPT, PROMPT_MAX_CHARS, MOTIF_MAX_CHARS,
    textBandOf, clearClauseFor,
    BACKDROP_ROLE, backdropNode, withBackdrop, withoutBackdrop, hasBackdrop,
    BASE_ROLE, baseNode, withBase, hasBase,
    photoNodeOf, fusedPhotoId,
    validateBackdrop, aspectFor,
};
