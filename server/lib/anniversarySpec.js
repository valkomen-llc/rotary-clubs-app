// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — EL CRITERIO
// v4.895.0
//
// PURO: sin base, sin red, sin IA, sin DOM. Todo lo que decide algo en este
// módulo vive acá y se prueba con `npm run test:anniversary`. La orquestación
// —hablar con KIE, con el modelo de visión, con S3 y con la base— vive en
// `anniversaryEngine.js` y no toma decisiones.
//
// ── QUÉ ES ESTE MÓDULO Y QUÉ NO ES ──────────────────────────────────
//
// NO es Plantillas IA. Aquél es un EDITOR: grafo de escena, capas,
// coordenadas, propiedades gráficas, y un administrador que compone. Sigue
// existiendo, no se toca y resuelve su propósito.
//
// Esto es un GENERADOR por instrucciones y resuelve otro: el administrador
// escribe en lenguaje natural cómo tiene que verse una pieza de aniversario;
// quien la necesita elige su club, dice cuántos años cumple, sube una foto y
// pulsa un botón. No hay nada que posicionar en ninguna de las dos puntas.
//
// De Plantillas IA no se importa NADA: ni `designSpec`, ni `designCompose`, ni
// `designTemplates`, ni el compilador de plantillas. Lo comprueba una prueba
// que lee este archivo — la independencia declarada en prosa no protege nada.
//
// ── LAS TRES CAPAS, Y POR QUÉ SON TRES ──────────────────────────────
//
//   Capa 1 — DISEÑO GENERADO. Fondo, decoración y la fotografía integrada.
//            La hace el modelo de imagen. Es lo único que la IA dibuja.
//   Capa 2 — CONTENIDO CONTROLADO. Nombre del club, años y mensaje. Los
//            escribimos NOSOTROS sobre la capa 1.
//   Capa 3 — BRANDING INSTITUCIONAL. Logotipos y pie, desde archivos REALES.
//
// El motivo de la capa 2 está medido en este repositorio y escrito en
// `designCompose.js`: **los modelos generativos no escriben texto de forma
// fiable**, y cuando sale mal no hay salida limpia —corregirlo encima es el
// composite que el equipo rechazó dos veces con las palabras «se ve overlay /
// montaje»—. Un aniversario lleva el nombre propio de un club y una cifra: son
// exactamente los dos textos que no pueden salir mal.
//
// El motivo de la capa 3 es más simple: el emblema de Rotary es marca
// registrada, con proporciones, colores y zona de resguardo propias. No se
// dibuja: se reproduce desde el archivo del Brand Center. Misma regla que
// `designElements.js`, que a propósito no tiene ninguna rueda.
//
// ── LA CONSECUENCIA QUE HAY QUE ENTENDER ANTES DE TOCAR EL PROMPT ───
//
// Como el texto lo imprimimos encima, el modelo TIENE QUE dejarle sitio. Si
// compone a ciegas, deja las caras justo donde va el título y la pieza sale
// inservible aunque la imagen sea preciosa. Por eso `textZoneFor` decide la
// franja limpia a partir del análisis de la fotografía, esa decisión entra al
// prompt en palabras (`clearZoneClause`) y el compositor del navegador lee
// **la misma** entrada de `TEXT_ZONES`. Son dos lados de un solo acuerdo: al
// mover una zona, se mueven los dos.
// ════════════════════════════════════════════════════════════════════

// ─── Qué genera este módulo ────────────────────────────────────────────
//
// `kind` existe para que replicar el enfoque —cumpleaños, nuevos socios,
// reconocimientos— sea una fila más y no una bifurcación del código. HOY hay
// uno solo y a propósito: el pedido dice que Aniversarios funcione
// excepcionalmente bien antes de abrir otro. Lo que se evita es hardcodear
// «aniversario» en la base, en las rutas y en el store, que es lo que
// obligaría a reescribirlos después.
export const GENERATOR_KIND = 'aniversario';

/** La versión del PROMPT. Sube cuando cambian las cláusulas que viajan al
 *  modelo —no cuando cambia una instrucción del administrador, que ya queda
 *  trazada por la versión de configuración—. Es la mitad del sello de
 *  auditoría de cada pieza (`engineStampFor`): sin ella, «¿por qué esta pieza
 *  de marzo salió así?» no distingue un cambio de modelo de un cambio nuestro
 *  de prompt. */
export const PROMPT_VERSION = '2';
export const GENERATOR_LABEL = 'Aniversarios IA';

/** El distrito cuyo catálogo ofrece el buscador de clubes (v4.927, pedido
 *  expreso: «solo aparezcan los clubes del Distrito 4281»). No es una lista
 *  nueva: acota el catálogo curado de `rotaryClubs.js` —la MISMA fuente
 *  Distrito → Clubes de los formularios de la Feria— vía el parámetro
 *  `district` de `searchPublicClubs`/`findPublicClub`. El campo sigue siendo
 *  texto libre (la lista ayuda a escribir, no cierra los valores, v4.706):
 *  lo que se acota es lo que se OFRECE y lo que se reconoce del catálogo. */
export const ANNIVERSARY_DISTRICT = '4281';

// ─── Formato de salida ─────────────────────────────────────────────────
//
// Catálogo CERRADO. Un formato arbitrario obligaría a rehacer la geometría de
// las zonas de texto, que está medida para el cuadrado. Los otros se declaran
// con `available:false` —como los motores del Generador de Publicaciones— para
// que la pantalla los muestre como «Próximamente» en vez de esconderlos y
// hacer creer que el sistema es sólo 1:1.
export const FORMATS = {
    square_1080: { id: 'square_1080', label: 'Cuadrado 1:1', aspect: '1:1', ratio: 1, available: true },
    portrait_4_5: { id: 'portrait_4_5', label: 'Vertical 4:5', aspect: '4:5', ratio: 0.8, available: false },
    story_9_16: { id: 'story_9_16', label: 'Historia 9:16', aspect: '9:16', ratio: 9 / 16, available: false },
};
export const FORMAT_IDS = Object.keys(FORMATS);
export const DEFAULT_FORMAT = 'square_1080';

/** El lado mayor de la exportación. No es el formato: es cuántos píxeles se
 *  descargan. 1080 es lo que piden las redes; 2160 sirve para imprimir. */
export const RESOLUTIONS = [1080, 1440, 2160];
export const DEFAULT_RESOLUTION = 1080;

export const formatById = (id) => FORMATS[id] || FORMATS[DEFAULT_FORMAT];

/** Medidas reales de la pieza, en píxeles, para una resolución dada. */
export const canvasSize = (formatId = DEFAULT_FORMAT, resolution = DEFAULT_RESOLUTION) => {
    const f = formatById(formatId);
    const res = RESOLUTIONS.includes(Number(resolution)) ? Number(resolution) : DEFAULT_RESOLUTION;
    // El lado mayor manda: en 1:1 los dos son iguales; en 4:5 y 9:16 el alto.
    if (f.ratio >= 1) return { width: res, height: Math.round(res / f.ratio) };
    return { width: Math.round(res * f.ratio), height: res };
};

// ─── Dónde cae el texto ────────────────────────────────────────────────
//
// ESTA TABLA LA LEEN DOS LADOS: el prompt, para pedirle al modelo que deje esa
// franja tranquila, y el compositor del navegador, para escribir ahí. Con dos
// tablas, el modelo despeja un lado y el texto se imprime en el otro — y eso
// no da ningún error: da una pieza con el título encima de una cara.
//
// Las medidas son FRACCIONES del lienzo (0-1), no píxeles, porque la pieza se
// compone a la resolución que se descargue.
export const TEXT_ZONES = {
    left: { id: 'left', x: 0.070, y: 0.180, w: 0.400, h: 0.560, align: 'left', words: 'la mitad izquierda' },
    right: { id: 'right', x: 0.530, y: 0.180, w: 0.400, h: 0.560, align: 'left', words: 'la mitad derecha' },
    bottom: { id: 'bottom', x: 0.090, y: 0.500, w: 0.820, h: 0.320, align: 'center', words: 'el tercio inferior' },
};
export const TEXT_ZONE_IDS = Object.keys(TEXT_ZONES);
export const DEFAULT_TEXT_ZONE = 'bottom';

/** La banda del pie institucional: el 16 % inferior, dentro del 15–20 % que
 *  pide la especificación del cliente (v4.898). Va SIEMPRE en el mismo sitio y
 *  por eso las zonas de texto terminan por encima: el branding no compite con
 *  el mensaje. El MODELO también la conoce (`FOOTER_CLAUSE`): es la reserva
 *  donde Club Platform superpone después la capa institucional. */
export const FOOTER_BAND = { y: 0.840, h: 0.160 };

export const zoneById = (id) => TEXT_ZONES[id] || TEXT_ZONES[DEFAULT_TEXT_ZONE];

// ─── El PROMPT MAESTRO y sus variables (v4.898) ────────────────────────
//
// El Prompt Maestro es la dirección de arte PERMANENTE del generador: vive en
// la base (borrador → publicar, con versiones), se edita sin desplegar y
// admite variables que el ensamblador sustituye antes de cada generación.
//
// ⚠️ QUÉ GOBIERNA Y QUÉ NO. Gobierna el DISEÑO: fondo, paleta, integración de
// la fotografía, celebración, variación entre generaciones. NO gobierna el
// texto impreso —título, nombre del club, años, mensaje—, porque ese texto lo
// imprime la plataforma en la capa 2 y así es exacto POR CONSTRUCCIÓN: los
// modelos generativos no escriben texto de forma fiable (la decisión
// fundacional del módulo, medida en este repositorio). Pedirle al modelo que
// escriba «Club Rotario Cali» sería renunciar a la única garantía que ninguna
// validación puede reemplazar.
//
// Y las TRES cláusulas que sostienen la arquitectura —sin texto ni logos,
// personas conservadas, franja del texto y pie reservados— las agrega SIEMPRE
// el ensamblador, fuera del campo editable: una dirección de arte no puede
// desactivar lo que hace publicable la pieza.

export const MASTER_VARIABLES = ['{NOMBRE_CLUB}', '{ANOS_CLUB}', '{FOTO_CLUB}', '{VARIACION}', '{FRASE}'];

/**
 * Sustituye las variables del Prompt Maestro. `{FOTO_CLUB}` no es texto: es la
 * fotografía que viaja como imagen de entrada, así que en el prompt se
 * convierte en el puntero que el modelo entiende. Una variable desconocida se
 * deja tal cual —y `validateConfig` la AVISA—: borrarla en silencio haría que
 * el administrador edite un token que desaparece sin explicación.
 */
export const applyMasterVariables = (text, { clubName = '', years = null, variation = '', phrase = '' } = {}) =>
    String(text || '')
        .replaceAll('{NOMBRE_CLUB}', clean(clubName) || 'el club')
        .replaceAll('{ANOS_CLUB}', years ? String(years) : 'sus')
        .replaceAll('{FOTO_CLUB}', 'la fotografía suministrada')
        // {VARIACION} y {FRASE} las llena la PLATAFORMA por pieza, de forma
        // determinista (v4.909/v4.919). {VARIACION} sin semilla queda vacía —
        // un marcador colgando viajaría literal—; {FRASE} SIEMPRE resuelve:
        // una cláusula que exige copiar «» letra por letra rompería la pieza.
        .replaceAll('{VARIACION}', String(variation || '').trim())
        .replaceAll('{FRASE}', String(phrase || '').trim() || ANNIVERSARY_PHRASES[0]);

/**
 * ── La VARIACIÓN por pieza (v4.909) ─────────────────────────────────
 *
 * «Variá la decoración» escrito en un prompt estático no varía nada: el
 * prompt idéntico converge (lección medida en v4.905), y estos motores no
 * exponen semilla. La variación de verdad exige que el PROMPT cambie por
 * pieza, y en el flujo simple la única vía legítima es una VARIABLE del
 * prompt base — visible, editable y borrable por el administrador. La
 * plataforma la llena de forma DETERMINISTA por el id de la pieza (como la
 * asignación A/B del CRM): el reintento conserva su variación, dos piezas
 * distintas varían, y «¿por qué esta pieza tiene serpentinas?» tiene
 * respuesta en «Ver solicitud enviada al modelo».
 */
export const VARIATION_THEMES = [
    'globos dorados y blancos con serpentinas finas cayendo',
    'globos champán y confeti dorado disperso',
    'cintas y lazos dorados con destellos suaves',
    'serpentinas doradas en espiral con estrellas pequeñas',
    'confeti dorado y blanco con estrellas diminutas',
    'globos metálicos dorados con hilos de serpentina',
    'flores doradas estilizadas con destellos discretos',
    'copas de brindis estilizadas con burbujas doradas',
];

export const variationForSeed = (seed) => {
    const s = String(seed || '');
    if (!s) return '';
    // FNV-1a, el mismo hash estable de la asignación A/B del CRM.
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    const tema = VARIATION_THEMES[h % VARIATION_THEMES.length];
    return `Decoración de esta pieza: ${tema}.`;
};

/**
 * ── La FRASE conmemorativa por pieza (v4.919) ───────────────────────
 *
 * La frase era el ÚNICO texto libre que el modelo inventaba —el título, el
 * nombre y los años ya van letra por letra— y por eso era el único que salía
 * mal escrito («Sirvingo con dedicación, construuido legado», reporte con
 * captura). La elige la PLATAFORMA de un catálogo CERRADO de frases correctas
 * —de 8 a 12 palabras, sin cifras, sobre servicio, legado, comunidad e
 * impacto— y el modelo sólo la COPIA letra por letra, como el nombre del
 * club. Determinista por el id de la pieza, con sal propia para no quedar
 * atada al motivo decorativo: el reintento conserva su frase y dos piezas
 * distintas varían.
 */
export const ANNIVERSARY_PHRASES = [
    'Una historia de servicio que sigue transformando comunidades.',
    'Celebramos un legado de servicio, amistad e impacto.',
    'Servicio y compromiso que siguen dejando huella en la comunidad.',
    'Un legado construido con propósito, amistad y servicio.',
    'Celebramos una historia de servicio que sigue generando impacto.',
    'Gracias por tanto servicio y amor por la comunidad.',
    'Una trayectoria de servicio que inspira a nuestra comunidad.',
    'Seguimos sirviendo, transformando vidas y construyendo una mejor comunidad.',
];

export const phraseForSeed = (seed) => {
    // Sin semilla, la PRIMERA del catálogo — el mismo respaldo que aplica
    // `applyMasterVariables` con la frase vacía, para que las dos vías
    // resuelvan lo mismo.
    if (!String(seed || '')) return ANNIVERSARY_PHRASES[0];
    const s = 'frase:' + String(seed || '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ANNIVERSARY_PHRASES[h % ANNIVERSARY_PHRASES.length];
};

/**
 * La INSTRUCCIÓN BASE predeterminada (v4.907). Es el prompt del cliente, el
 * mismo gesto de su ejemplo de ChatGPT: referencia + fotografía + instrucción
 * corta. Viaja al modelo VERBATIM con las variables sustituidas — el flujo no
 * le agrega ni le quita nada. En español a propósito: es lo que el
 * administrador va a leer y corregir, y los motores actuales lo entienden.
 */
export const DEFAULT_MASTER_PROMPT = `Pieza gráfica institucional de aniversario, cuadrada 1:1: {NOMBRE_CLUB} celebra {ANOS_CLUB} años.

La PRIMERA imagen es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros y contexto sin alterar.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN: guía de jerarquía y decoración. No la copies ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo — predominantemente blanco, con texturas y ondas suaves hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO elegante — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA — GEOMETRÍA ESTÁNDAR, de arriba abajo: el bloque (título, nombre, foto, cifra y cinta) llena el lienzo con EQUILIBRIO, del 14 % al 76 % del alto; la cinta de años CIERRA la composición cerca del 76 % — nunca flotando arriba con un vacío abajo:
1. Globos protagonistas arriba y en los laterales — DORADO METÁLICO, champagne muy claro, blancos y perlados; ante la duda, dorado metálico o blanco perla — con serpentinas y confeti dorados; no cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, MAYÚSCULAS, azul institucional, sans-serif Bold, en el TERCIO SUPERIOR: «¡FELIZ ANIVERSARIO!», letra por letra, en DOS líneas — «¡FELIZ» y debajo «ANIVERSARIO!»; nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado: «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas, con ortografía perfecta.
4. Debajo, la fotografía PROTAGONISTA en su marco ESTÁNDAR FIJO 16:9 — ancho cercano al 60 % del lienzo; llega YA recortada así, proporción EXACTA, nunca más alta ni en círculo u óvalo — con borde dorado fino, margen blanco y sombra suave.
5. El número «{ANOS_CLUB}» GRANDE — su alto ronda el 9 % del lienzo — en dorado metálico, y debajo una cinta banderín dorada con «AÑOS»: componente FIJO entre piezas, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto y con aire claro antes del pie. Nunca a un costado ni arriba.
6. ZONA INFERIOR RESERVADA (20 % inferior): ZONA SIN GENERACIÓN — sin logos, emblemas, ondas, lemas, textos, fotos ni globos; si la referencia trae un pie, NO lo reproduzcas: la plataforma superpone el real después. El MISMO fondo continúa hasta el borde, nunca un bloque aparte.`;

/** Los defaults ANTERIORES, para el upgrade perezoso de `normalizeConfig`:
 *  una configuración cuyo prompt es EXACTAMENTE un default viejo —el
 *  administrador nunca lo tocó— se lee con el default vigente. Un prompt
 *  editado no se toca jamás: la preferencia explícita manda. */
export const LEGACY_MASTER_PROMPTS = [
    `Genera una pieza gráfica institucional de aniversario en formato cuadrado 1:1 para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es la REFERENCIA VISUAL. La SEGUNDA imagen adjunta es {FOTO_CLUB}.

LA REFERENCIA VISUAL MANDA. Mantén muy cerca de la referencia: composición, distribución, proporciones, fondo, paleta, elementos de celebración, jerarquía tipográfica, integración de la fotografía, espacio negativo y estructura general. No generes una pieza distinta a la referencia. Prioriza similitud visual sobre creatividad.

Usa la segunda imagen como fotografía principal del club: preserva a las personas exactamente — no inventes personas, no elimines personas, no deformes rostros.

Incluye un título de felicitación de aniversario, el nombre {NOMBRE_CLUB} bien destacado y la cifra {ANOS_CLUB} años claramente visible, con la misma tipografía y jerarquía de la referencia. Incluye un mensaje corto, institucional y conmemorativo sobre servicio, comunidad e impacto. Todos los textos en español, escritos con ortografía perfecta.

En la parte inferior deja aproximadamente el 15 % del lienzo completamente libre y limpio: ahí la plataforma añade después un pie de página institucional. No generes logos ni pie de página.`,
    `Genera una pieza gráfica institucional de aniversario en formato cuadrado 1:1 para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: es la ÚNICA fotografía que aparece en la pieza, colocada en un marco protagonista. Preserva a sus personas exactamente — no inventes personas, no elimines personas, no deformes rostros.

La SEGUNDA imagen adjunta es la REFERENCIA DE ESTILO. Es un EJEMPLO de cómo debe verse la pieza, no la pieza: imita su lenguaje visual —paleta, tipo de composición, jerarquía tipográfica, elegancia, la curva del pie— pero NO la copies. No reproduzcas la fotografía que aparece dentro de la referencia, no copies sus textos ni sus frases, y no entregues la referencia editada: crea una pieza NUEVA con ese mismo estilo. {VARIACION}

Escribe los textos NUEVOS para esta pieza: un título de felicitación de aniversario, el nombre del club escrito EXACTAMENTE así, letra por letra: «{NOMBRE_CLUB}», la cifra {ANOS_CLUB} años claramente visible, y un mensaje corto, institucional y conmemorativo sobre servicio, comunidad e impacto, coherente con {ANOS_CLUB} años de trayectoria. Todos los textos en español, con ortografía perfecta.

En la parte inferior deja aproximadamente el 15 % del lienzo completamente libre y limpio: ahí la plataforma añade después un pie de página institucional. No generes logos ni pie de página.`,
    `Genera una pieza gráfica institucional de aniversario en formato cuadrado 1:1 para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: es la ÚNICA fotografía que aparece en la pieza, colocada en un marco protagonista. Preserva a sus personas exactamente — no inventes personas, no elimines personas, no deformes rostros.

La SEGUNDA imagen adjunta es la REFERENCIA DE ESTILO (ANNIVERSARY_STYLE_REFERENCE). Es un EJEMPLO del lenguaje visual, no la pieza: NO la copies, no reproduzcas la fotografía que aparezca dentro de la referencia, no copies sus textos ni sus frases, y no entregues la referencia editada: crea una pieza NUEVA con ese mismo lenguaje visual.

IDENTIDAD VISUAL OBLIGATORIA — Follow the supplied anniversary style reference as the visual language for the entire composition. Use a predominantly white premium institutional background with subtle white-on-white gradients, soft waves, elegant curves and refined satin texture. Celebration elements must use only gold, white, champagne and institutional Rotary blue tones, with very discreet silver as a complement. Use elegant balloons, confetti, ribbons, streamers, small stars or refined anniversary details, always as accompaniment — never covering faces or important text. Never generate brown, beige, gray, black or dark colored backgrounds. Do not use random colorful party decorations, childish or cartoonish aesthetics, wood, kraft paper, concrete, dark marble or photographic backgrounds. Maintain a premium, sober, modern, commemorative institutional celebration aesthetic. Allow creative variation in composition, quantity and placement of elements, but preserve this visual identity. {VARIACION}

Escribe los textos NUEVOS para esta pieza: un título de felicitación de aniversario, el nombre del club escrito EXACTAMENTE así, letra por letra: «{NOMBRE_CLUB}», la cifra {ANOS_CLUB} años claramente visible, y un mensaje corto, institucional y conmemorativo sobre servicio, comunidad e impacto, coherente con {ANOS_CLUB} años de trayectoria. Todos los textos en español, con ortografía perfecta.

En la parte inferior deja aproximadamente el 15 % del lienzo completamente libre y limpio: ahí la plataforma añade después un pie de página institucional. No generes logos ni pie de página.`,
    `Genera una pieza gráfica institucional de aniversario en formato cuadrado 1:1 para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala: no alteres rostros, no reconstruyas ni reemplaces personas, no cambies su contexto, sin recortes agresivos.

La SEGUNDA imagen adjunta es la REFERENCIA DE COMPOSICIÓN (ANNIVERSARY_STYLE_REFERENCE): guía de jerarquía, proporciones, ubicación de elementos y espacios en blanco. No la copies literalmente ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: fondo SIEMPRE predominantemente blanco, con texturas blancas sutiles, degradados suaves, ondas o curvas delicadas. Paleta: blanco, azul institucional Rotary y dorado metálico; champagne, perlado y plateado sólo como complementos. Never brown, beige, gray, black, saturated or dark backgrounds. Estética institucional, elegante y conmemorativa — nunca de fiesta infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo:
1. Globos protagonistas en la zona superior — dorados metálicos, blancos, champagne o transparentes con detalles dorados — en ambas esquinas, o en una equilibrada con serpentinas, confeti y estrellas en la otra. No cubren el título. {VARIACION}
2. Título grande y centrado, en azul institucional, sans-serif tipo Open Sans: «¡FELIZ ANIVERSARIO!».
3. Debajo, en segunda jerarquía y bien legible, el nombre EXACTO letra por letra: «{NOMBRE_CLUB}».
4. Debajo, la fotografía RECTANGULAR HORIZONTAL, amplia y protagonista — NUNCA en círculo ni óvalo — con borde dorado fino o marco blanco sutil y sombra ligera.
5. El número «{ANOS_CLUB}» grande y dorado, con «AÑOS» debajo o en una cinta dorada, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto entre la foto y el blanco de abajo. Nunca a un costado.
6. Un mensaje conmemorativo NUEVO de una a tres líneas sobre servicio, comunidad e impacto, coherente con {ANOS_CLUB} años. Textos en español con ortografía perfecta.
7. ZONA INFERIOR VACÍA (obligatoria): el 20 % inferior queda completamente limpio — sin texto, fotos, globos, confeti ni iconos; sólo el fondo blanco continúa. La plataforma superpone ahí un pie institucional transparente. No generes logos ni pies de página.`,
    `Genera una pieza gráfica institucional de aniversario, cuadrada 1:1, para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros, personas y contexto sin alterar, sin recortes agresivos.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN (ANNIVERSARY_STYLE_REFERENCE): guía principal de jerarquía, tamaños, decoración y espacios en blanco. No la copies literalmente ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo de arriba abajo — predominantemente blanco, con texturas sutiles, degradados suaves y ondas delicadas hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico; champagne y plateado como complementos. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO, elegante e institucional — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo:
1. Globos protagonistas arriba y en los laterales — dorados metálicos, blancos, champagne y transparentes con confeti dorado — con serpentinas finas, confeti, estrellas y destellos. Nada de guirnaldas de luces ni motivos navideños. No cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, centrado, en MAYÚSCULAS, azul institucional, sans-serif Bold: «¡FELIZ ANIVERSARIO!». Nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado (Light): «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas.
4. Debajo, la fotografía RECTANGULAR HORIZONTAL, amplia y protagonista — NUNCA en círculo ni óvalo — con borde dorado fino.
5. El número «{ANOS_CLUB}» grande y dorado, con «AÑOS» en una cinta dorada debajo, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto. Regla fija: nunca a un costado ni arriba.
6. Un mensaje conmemorativo NUEVO de una a tres líneas cortas sobre servicio, comunidad e impacto, SIN repetir la cantidad de años — ya está en la cinta. Tono: «Una historia de servicio que sigue transformando comunidades.» Español con ortografía perfecta.
7. ZONA INFERIOR RESERVADA (20 % inferior): sin texto, fotos, globos, confeti ni iconos — el MISMO fondo y sus texturas continúan hasta el borde, nunca un bloque aparte. La plataforma superpone ahí un pie transparente. No generes logos ni pies de página.`,
    `Genera una pieza gráfica institucional de aniversario, cuadrada 1:1, para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros, personas y contexto sin alterar, sin recortes agresivos.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN (ANNIVERSARY_STYLE_REFERENCE): guía principal de jerarquía, tamaños, decoración y espacios en blanco. No la copies literalmente ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo de arriba abajo — predominantemente blanco, con texturas, degradados y ondas suaves hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico; champagne y plateado como complementos. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO, elegante e institucional — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo:
1. Globos protagonistas arriba y en los laterales — dorados metálicos, blancos, champagne y transparentes con confeti dorado — más serpentinas, confeti y destellos. Nada de guirnaldas de luces ni motivos navideños. No cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, centrado, en MAYÚSCULAS, azul institucional, sans-serif Bold: «¡FELIZ ANIVERSARIO!». Nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado (Light): «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas.
4. Debajo, la fotografía RECTANGULAR HORIZONTAL, amplia y protagonista — NUNCA en círculo ni óvalo — en su marco ESTÁNDAR: borde dorado fino, margen blanco y sombra suave.
5. El número «{ANOS_CLUB}» grande en dorado metálico y, debajo, una cinta banderín dorada con «AÑOS»: componente FIJO e idéntico entre piezas, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto. Regla fija: nunca a un costado ni arriba.
6. Un mensaje conmemorativo NUEVO de una a tres líneas cortas sobre servicio, comunidad e impacto, SIN repetir la cantidad de años — ya está en la cinta. Español con ortografía perfecta.
7. ZONA INFERIOR RESERVADA (20 % inferior): sin texto, fotos, globos, confeti ni iconos — el MISMO fondo y sus texturas continúan hasta el borde, nunca un bloque aparte. La plataforma superpone ahí un pie transparente. No generes logos ni pies de página.`,
    `Pieza gráfica institucional de aniversario, cuadrada 1:1, para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros, personas y contexto sin alterar.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN (ANNIVERSARY_STYLE_REFERENCE): guía de jerarquía, tamaños y decoración. No la copies literalmente ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo de arriba abajo — predominantemente blanco, con texturas, degradados y ondas suaves hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO elegante — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo:
1. Globos protagonistas arriba y en los laterales — dorados, blancos, champagne y transparentes — más serpentinas, confeti y destellos. No cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, MAYÚSCULAS, azul institucional, sans-serif Bold, centrado y ALTO en el lienzo: «¡FELIZ ANIVERSARIO!», letra por letra, en DOS líneas — «¡FELIZ» y debajo «ANIVERSARIO!». Nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado: «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas.
4. Debajo, la fotografía RECTANGULAR HORIZONTAL, más ancha que alta — su alto ronda un tercio del lienzo; NUNCA en círculo ni óvalo — en su marco ESTÁNDAR: borde dorado fino, margen blanco y sombra suave.
5. El número «{ANOS_CLUB}» grande en dorado metálico y, debajo, una cinta banderín dorada con «AÑOS»: componente FIJO e idéntico entre piezas, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto. Regla fija: nunca a un costado ni arriba.
6. Debajo, SIEMPRE una única frase corta de 8 a 12 palabras, en UNA línea, sobre servicio, legado, comunidad o impacto, SIN repetir la cantidad de años. Español con ortografía perfecta.
7. ZONA INFERIOR RESERVADA (20 % inferior): ZONA SIN GENERACIÓN — nada de logos, emblemas, ondas, lemas, textos, fotos ni globos ahí; si la referencia trae un pie abajo, NO lo reproduzcas: la plataforma superpone después su pie real. El MISMO fondo y sus texturas continúan hasta el borde, nunca un bloque aparte.`,
    `Pieza gráfica institucional de aniversario, cuadrada 1:1, para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros, personas y contexto sin alterar.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN (ANNIVERSARY_STYLE_REFERENCE): guía de jerarquía, tamaños y decoración. No la copies literalmente ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo de arriba abajo — predominantemente blanco, con texturas, degradados y ondas suaves hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO elegante — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo:
1. Globos protagonistas arriba y en los laterales — dorados, blancos, champagne y transparentes — más serpentinas, confeti y destellos. No cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, MAYÚSCULAS, azul institucional, sans-serif Bold, centrado y ALTO en el lienzo: «¡FELIZ ANIVERSARIO!», letra por letra, en DOS líneas — «¡FELIZ» y debajo «ANIVERSARIO!». Nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado: «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas.
4. Debajo, la fotografía RECTANGULAR HORIZONTAL, más ancha que alta — su alto ronda un tercio del lienzo; NUNCA en círculo ni óvalo — en su marco ESTÁNDAR: borde dorado fino, margen blanco y sombra suave.
5. El número «{ANOS_CLUB}» grande en dorado metálico y, debajo, una cinta banderín dorada con «AÑOS»: componente FIJO e idéntico entre piezas, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto. Regla fija: nunca a un costado ni arriba.
6. Debajo, en UNA línea, la frase EXACTA letra por letra: «{FRASE}», del mismo tamaño y azul institucional que el nombre del club. Ortografía perfecta.
7. ZONA INFERIOR RESERVADA (20 % inferior): ZONA SIN GENERACIÓN — nada de logos, emblemas, ondas, lemas, textos, fotos ni globos ahí; si la referencia trae un pie abajo, NO lo reproduzcas: la plataforma superpone después su pie real. El MISMO fondo y sus texturas continúan hasta el borde, nunca un bloque aparte.`,
    `Pieza gráfica institucional de aniversario, cuadrada 1:1, para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros, personas y contexto sin alterar.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN (ANNIVERSARY_STYLE_REFERENCE): guía de jerarquía, tamaños y decoración. No la copies literalmente ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo de arriba abajo — predominantemente blanco, con texturas, degradados y ondas suaves hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO elegante — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo:
1. Globos protagonistas arriba y en los laterales — dorados, blancos, champagne y transparentes — más serpentinas, confeti y destellos. No cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, MAYÚSCULAS, azul institucional, sans-serif Bold, centrado y ALTO en el lienzo: «¡FELIZ ANIVERSARIO!», letra por letra, en DOS líneas — «¡FELIZ» y debajo «ANIVERSARIO!». Nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado: «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas. Ortografía perfecta.
4. Debajo, la fotografía RECTANGULAR HORIZONTAL, más ancha que alta — su alto ronda un tercio del lienzo; NUNCA en círculo ni óvalo — en su marco ESTÁNDAR: borde dorado fino, margen blanco y sombra suave.
5. El número «{ANOS_CLUB}» grande en dorado metálico y, debajo, una cinta banderín dorada con «AÑOS»: componente FIJO e idéntico entre piezas, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto. Regla fija: nunca a un costado ni arriba.
6. Debajo de la cinta, una franja horizontal LIMPIA de una línea de alto, sin texto ni adornos: la plataforma imprime ahí después la frase conmemorativa. No escribas ninguna frase en esa franja.
7. ZONA INFERIOR RESERVADA (20 % inferior): ZONA SIN GENERACIÓN — nada de logos, emblemas, ondas, lemas, textos, fotos ni globos ahí; si la referencia trae un pie abajo, NO lo reproduzcas: la plataforma superpone después su pie real. El MISMO fondo y sus texturas continúan hasta el borde, nunca un bloque aparte.`,
    `Pieza gráfica institucional de aniversario, cuadrada 1:1, para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros, personas y contexto sin alterar.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN: guía de jerarquía, tamaños y decoración. No la copies ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo de arriba abajo — predominantemente blanco, con texturas y ondas suaves hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO elegante — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo — TODO el contenido (título, nombre, foto, cifra y cinta) queda en el 72 % superior; debajo sólo fondo:
1. Globos protagonistas arriba y en los laterales — dorados, blancos, champagne y transparentes — más serpentinas, confeti y destellos. No cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, MAYÚSCULAS, azul institucional, sans-serif Bold, centrado, en el TERCIO SUPERIOR: «¡FELIZ ANIVERSARIO!», letra por letra, en DOS líneas — «¡FELIZ» y debajo «ANIVERSARIO!». Nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado: «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas. Ortografía perfecta.
4. Debajo, la fotografía RECTANGULAR HORIZONTAL, más ancha que alta — su alto ronda UN CUARTO del lienzo; NUNCA en círculo ni óvalo — en su marco ESTÁNDAR: borde dorado fino, margen blanco y sombra suave.
5. El número «{ANOS_CLUB}» grande en dorado metálico y, debajo, una cinta banderín dorada con «AÑOS»: componente FIJO e idéntico entre piezas, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto. Regla fija: nunca a un costado ni arriba.
6. Debajo de la cinta, y SEPARADA de ella, una franja horizontal LIMPIA, sin texto ni adornos: la plataforma imprime ahí después la frase conmemorativa. No escribas nada en esa franja.
7. ZONA INFERIOR RESERVADA (25 % inferior): ZONA SIN GENERACIÓN — sin logos, emblemas, ondas, lemas, textos, fotos ni globos; si la referencia trae un pie abajo, NO lo reproduzcas: la plataforma superpone su pie real después. El MISMO fondo continúa hasta el borde, nunca un bloque aparte.`,
    `Pieza gráfica institucional de aniversario, cuadrada 1:1, para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros, personas y contexto sin alterar.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN: guía de jerarquía, tamaños y decoración. No la copies ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo de arriba abajo — predominantemente blanco, con texturas y ondas suaves hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO elegante — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo — TODO el contenido (título, nombre, foto, cifra y cinta) queda en el 72 % superior; debajo sólo fondo:
1. Globos protagonistas arriba y en los laterales — dorados, blancos, champagne y transparentes — con serpentinas y confeti. No cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, MAYÚSCULAS, azul institucional, sans-serif Bold, centrado, en el TERCIO SUPERIOR: «¡FELIZ ANIVERSARIO!», letra por letra, en DOS líneas — «¡FELIZ» y debajo «ANIVERSARIO!». Nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado: «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas. Ortografía perfecta.
4. Debajo, la fotografía en su marco ESTÁNDAR FIJO 16:9, HORIZONTAL — llega YA recortada así; proporción EXACTA, nunca un marco más alto ni en círculo u óvalo — con borde dorado fino, margen blanco y sombra suave.
5. El número «{ANOS_CLUB}» grande en dorado metálico y, debajo, una cinta banderín dorada con «AÑOS»: componente FIJO e idéntico entre piezas, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto. Regla fija: nunca a un costado ni arriba.
6. Debajo de la cinta, y SEPARADA de ella, una franja horizontal LIMPIA, sin texto ni adornos: la plataforma imprime ahí después la frase conmemorativa. No escribas nada en esa franja.
7. ZONA INFERIOR RESERVADA (25 % inferior): ZONA SIN GENERACIÓN — sin logos, emblemas, ondas, lemas, textos, fotos ni globos; si la referencia trae un pie abajo, NO lo reproduzcas: la plataforma superpone su pie real después. El MISMO fondo continúa hasta el borde, nunca un bloque aparte.`,
    `Pieza gráfica institucional de aniversario, cuadrada 1:1, para {NOMBRE_CLUB}, que celebra {ANOS_CLUB} años.

La PRIMERA imagen adjunta es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros, personas y contexto sin alterar.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN: guía de jerarquía, tamaños y decoración. No la copies ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo de arriba abajo — predominantemente blanco, con texturas y ondas suaves hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO elegante — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA, de arriba hacia abajo — TODO el contenido (título, nombre, foto, cifra y cinta) queda en el 72 % superior; debajo sólo fondo:
1. Globos protagonistas arriba y en los laterales — DORADO METÁLICO, champagne muy claro, blancos y perlados; ante la duda, dorado metálico o blanco perla — con serpentinas y confeti dorados. No cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, MAYÚSCULAS, azul institucional, sans-serif Bold, centrado, en el TERCIO SUPERIOR: «¡FELIZ ANIVERSARIO!», letra por letra, en DOS líneas — «¡FELIZ» y debajo «ANIVERSARIO!». Nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado: «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas. Ortografía perfecta.
4. Debajo, la fotografía en su marco ESTÁNDAR FIJO 16:9, HORIZONTAL — llega YA recortada así; proporción EXACTA, nunca un marco más alto ni en círculo u óvalo — con borde dorado fino, margen blanco y sombra suave.
5. El número «{ANOS_CLUB}» en dorado metálico, de tamaño MODERADO, y debajo una cinta banderín dorada con «AÑOS»: componente FIJO e idéntico entre piezas, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto y con aire claro antes de la zona inferior. Regla fija: nunca a un costado ni arriba.
6. ZONA INFERIOR RESERVADA (25 % inferior): ZONA SIN GENERACIÓN — sin logos, emblemas, ondas, lemas, textos, fotos ni globos; si la referencia trae un pie abajo, NO lo reproduzcas: la plataforma superpone su pie real después. El MISMO fondo continúa hasta el borde, nunca un bloque aparte.`,
    `Pieza gráfica institucional de aniversario, cuadrada 1:1: {NOMBRE_CLUB} celebra {ANOS_CLUB} años.

La PRIMERA imagen es {FOTO_CLUB}: la única fotografía de la pieza. Presérvala intacta: rostros y contexto sin alterar.

La SEGUNDA imagen es la REFERENCIA DE COMPOSICIÓN: guía de jerarquía y decoración. No la copies ni reproduzcas su contenido.

IDENTIDAD OBLIGATORIA: UN SOLO fondo continuo — predominantemente blanco, con texturas y ondas suaves hasta el borde inferior, sin cortes, franjas ni rectángulos blancos añadidos. Paleta: blanco, azul Rotary y dorado metálico. Never brown, beige, gray, black, saturated or dark backgrounds. Estética de ANIVERSARIO elegante — nunca navideña ni infantil.

ESTRUCTURA OBLIGATORIA — GEOMETRÍA ESTÁNDAR, de arriba abajo: el bloque (título, nombre, foto, cifra y cinta) llena el lienzo con EQUILIBRIO, del 14 % al 76 % del alto; la cinta de años CIERRA la composición cerca del 76 % — nunca flotando arriba con un vacío abajo:
1. Globos protagonistas arriba y en los laterales — DORADO METÁLICO, champagne muy claro, blancos y perlados; ante la duda, dorado metálico o blanco perla — con serpentinas y confeti dorados; no cubren el título. {VARIACION}
2. Título MUY GRANDE y dominante, MAYÚSCULAS, azul institucional, sans-serif Bold, en el TERCIO SUPERIOR: «¡FELIZ ANIVERSARIO!», letra por letra, en DOS líneas — «¡FELIZ» y debajo «ANIVERSARIO!»; nunca un subtítulo.
3. Debajo, el nombre EXACTO letra por letra, en MAYÚSCULAS y peso delgado: «{NOMBRE_CLUB}», centrado entre dos líneas finas doradas, con ortografía perfecta.
4. Debajo, la fotografía PROTAGONISTA en su marco ESTÁNDAR FIJO 16:9 — ancho cercano al 60 % del lienzo; llega YA recortada así, proporción EXACTA, nunca más alta ni en círculo u óvalo — con borde dorado fino, margen blanco y sombra suave.
5. El número «{ANOS_CLUB}» GRANDE — su alto ronda un décimo del lienzo — en dorado metálico, y debajo una cinta banderín dorada con «AÑOS»: componente FIJO entre piezas, CENTRADO sobre el borde inferior de la fotografía, medio superpuesto y con aire claro antes del pie. Nunca a un costado ni arriba.
6. ZONA INFERIOR RESERVADA (20 % inferior): ZONA SIN GENERACIÓN — sin logos, emblemas, ondas, lemas, textos, fotos ni globos; si la referencia trae un pie, NO lo reproduzcas: la plataforma superpone el real después. El MISMO fondo continúa hasta el borde, nunca un bloque aparte.`,
];

const upgradeLegacyDefault = (texto, legados, vigente) =>
    (texto && legados.some(l => l.trim() === texto)) ? vigente : texto;

export const DEFAULT_MESSAGE_INSTRUCTION =
    'Genera un mensaje corto, institucional, humano e inspirador. Máximo dos frases. '
    + 'Habla de servicio, trayectoria, amistad, comunidad e impacto.';

export const DEFAULT_RESTRICTIONS =
    'Fondo café, marrón, beige oscuro, gris oscuro, negro, rojo, naranja intenso, verde, morado o multicolor. '
    + 'Texturas de madera, papel kraft, concreto, mármol oscuro o fondos fotográficos. '
    + 'Franja o rectángulo blanco separado en la parte inferior; fondo cortado antes del borde del lienzo. '
    + 'Pie de página generado: logos, emblemas, ruedas dentadas, ondas azules o lemas institucionales en la zona inferior. '
    + 'Fotografía, cifra o cinta de años invadiendo el 20 % inferior del lienzo. '
    + 'Reproducir el pie de página de la imagen de referencia. '
    + 'Guirnaldas de luces, decoración navideña o de Año Nuevo. '
    + 'Globos o decoración rose gold, rosados, salmón, cobre, naranja, marrón o bronce rojizo. '
    + 'Decoración de fiesta infantil, globos de colores vivos aleatorios, estética caricaturesca. '
    + 'Copiar la fotografía o los textos de la imagen de referencia; entregar la referencia editada. '
    + 'Generar logos. Inventar personas. Deformar rostros. Textos sobre caras. Bloques grandes de texto. '
    + 'Marco circular u ovalado para la fotografía.';

const LEGACY_RESTRICTIONS = [
        'Fondo café, marrón, beige oscuro, gris oscuro, negro, rojo, naranja intenso, verde, morado o multicolor. '
    + 'Texturas de madera, papel kraft, concreto, mármol oscuro o fondos fotográficos. '
    + 'Franja o rectángulo blanco separado en la parte inferior; fondo cortado antes del borde del lienzo. '
    + 'Pie de página generado: logos, emblemas, ruedas dentadas, ondas azules o lemas institucionales en la zona inferior. '
    + 'Fotografía, cifra o cinta de años en el cuarto inferior del lienzo. '
    + 'Reproducir el pie de página de la imagen de referencia. '
    + 'Guirnaldas de luces, decoración navideña o de Año Nuevo. '
    + 'Globos o decoración rose gold, rosados, salmón, cobre, naranja, marrón o bronce rojizo. '
    + 'Decoración de fiesta infantil, globos de colores vivos aleatorios, estética caricaturesca. '
    + 'Copiar la fotografía o los textos de la imagen de referencia; entregar la referencia editada. '
    + 'Generar logos. Inventar personas. Deformar rostros. Textos sobre caras. Bloques grandes de texto. '
    + 'Marco circular u ovalado para la fotografía.',
        'Fondo café, marrón, beige oscuro, gris oscuro, negro, rojo, naranja intenso, verde, morado o multicolor. '
    + 'Texturas de madera, papel kraft, concreto, mármol oscuro o fondos fotográficos. '
    + 'Franja o rectángulo blanco separado en la parte inferior; fondo cortado antes del borde del lienzo. '
    + 'Pie de página generado: logos, emblemas, ruedas dentadas, ondas azules o lemas institucionales en la zona inferior. '
    + 'Fotografía, cifra o cinta de años en el cuarto inferior del lienzo. '
    + 'Reproducir el pie de página de la imagen de referencia. '
    + 'Guirnaldas de luces, decoración navideña o de Año Nuevo. '
    + 'Decoración de fiesta infantil, globos de colores vivos aleatorios, estética caricaturesca. '
    + 'Repetir la cantidad de años dentro del mensaje conmemorativo. '
    + 'Copiar la fotografía o los textos de la imagen de referencia; entregar la referencia editada. '
    + 'Generar logos. Inventar personas. Deformar rostros. Textos sobre caras. Bloques grandes de texto. '
    + 'Marco circular u ovalado para la fotografía.',
        'Fondo café, marrón, beige oscuro, gris oscuro, negro, rojo, naranja intenso, verde, morado o multicolor. '
    + 'Texturas de madera, papel kraft, concreto, mármol oscuro o fondos fotográficos. '
    + 'Franja o rectángulo blanco separado en la parte inferior; fondo cortado antes del borde del lienzo. '
    + 'Pie de página generado: logos, emblemas, ruedas dentadas, ondas azules o lemas institucionales en la zona inferior. '
    + 'Reproducir el pie de página de la imagen de referencia. '
    + 'Guirnaldas de luces, decoración navideña o de Año Nuevo. '
    + 'Decoración de fiesta infantil, globos de colores vivos aleatorios, estética caricaturesca. '
    + 'Repetir la cantidad de años dentro del mensaje conmemorativo. '
    + 'Copiar la fotografía o los textos de la imagen de referencia; entregar la referencia editada. '
    + 'Generar logos. Inventar personas. Deformar rostros. Textos sobre caras. Bloques grandes de texto. '
    + 'Marco circular u ovalado para la fotografía.',
    'Fondo café, marrón, beige oscuro, gris oscuro, negro, rojo, naranja intenso, verde, morado o multicolor. '
    + 'Texturas de madera, papel kraft, concreto, mármol oscuro o fondos fotográficos. '
    + 'Franja o rectángulo blanco separado en la parte inferior; fondo cortado antes del borde del lienzo. '
    + 'Guirnaldas de luces, decoración navideña o de Año Nuevo. '
    + 'Decoración de fiesta infantil, globos de colores vivos aleatorios, estética caricaturesca. '
    + 'Repetir la cantidad de años dentro del mensaje conmemorativo. '
    + 'Copiar la fotografía o los textos de la imagen de referencia; entregar la referencia editada. '
    + 'Generar logos. Inventar personas. Deformar rostros. Textos sobre caras. Bloques grandes de texto. '
    + 'Marco circular u ovalado para la fotografía.',
    'Fondo café, marrón, beige oscuro, gris oscuro, negro, rojo, naranja intenso, verde, morado o multicolor. '
    + 'Texturas de madera, papel kraft, concreto, mármol oscuro o fondos fotográficos. '
    + 'Decoración de fiesta infantil, globos de colores vivos aleatorios, estética caricaturesca. '
    + 'Copiar la fotografía o los textos de la imagen de referencia; entregar la referencia editada. '
    + 'Generar logos. Inventar personas. Deformar rostros. Textos sobre caras. Bloques grandes de texto. '
    + 'Marco circular u ovalado para la fotografía.',
    'Fondo café, marrón, beige oscuro, gris oscuro, negro, rojo, naranja intenso, verde, morado o multicolor. '
    + 'Texturas de madera, papel kraft, concreto, mármol oscuro o fondos fotográficos. '
    + 'Decoración de fiesta infantil, globos de colores vivos aleatorios, estética caricaturesca. '
    + 'Copiar la fotografía o los textos de la imagen de referencia; entregar la referencia editada. '
    + 'Generar logos. Inventar personas. Deformar rostros. Textos sobre caras. Bloques grandes de texto.',
    'No copiar la fotografía que aparece dentro de la imagen de referencia. No copiar los textos de la referencia. '
    + 'No entregar la referencia editada. No generar logos. No inventar personas. No deformar rostros. '
    + 'No colocar textos sobre caras. No generar bloques grandes de texto. No saturar con elementos decorativos.',
    'No generar logos. No inventar personas. No deformar rostros. No colocar textos sobre caras. '
    + 'No generar bloques grandes de texto. No saturar con elementos decorativos.',
];

// ─── Límites del texto que imprimimos ──────────────────────────────────
//
// El pedido pide explícitamente que el mensaje sea CORTO —«no generar textos
// extensos como los que actualmente aparecen en algunas plantillas»—. Estos
// números son ese pedido hecho aritmética, y son lo que el código comprueba
// después de que el modelo escribe: el modelo redacta, el código decide.
export const LIMITS = {
    title: { min: 8, max: 60 },
    message: { min: 30, max: 190 },
    // Dos o tres frases breves. Cuatro ya es un párrafo.
    messageSentences: { max: 3 },
    clubName: { max: 60 },
    years: { min: 1, max: 130 },
};

// ─── Configuración ─────────────────────────────────────────────────────

export const MAX_REFERENCES = 6;

/** Qué puede llevar la capa 3. Catálogo CERRADO: sin él, el pie aceptaría
 *  cualquier cosa y nadie sabría de dónde salió lo que se imprimió. */
export const BRANDING_FIELDS = {
    clubLogo: { id: 'clubLogo', label: 'Logotipo del club', help: 'Sale del sitio del club en la plataforma. Si el club no tiene logotipo cargado, no se dibuja nada.' },
    districtLine: { id: 'districtLine', label: 'Distrito y periodo', help: 'Distrito, gobernador y periodo rotario, tomados del registro del distrito.' },
    footerImage: { id: 'footerImage', label: 'Pie institucional', help: 'Una imagen que subas vos y se imprime abajo. Es el sitio de los emblemas oficiales.' },
    watermark: { id: 'watermark', label: 'Marca de agua', help: 'Una imagen tenue en una esquina.' },
};
export const BRANDING_IDS = Object.keys(BRANDING_FIELDS);

export const DEFAULT_CONFIG = Object.freeze({
    name: 'Aniversarios IA',
    enabled: false,
    format: DEFAULT_FORMAT,
    resolution: DEFAULT_RESOLUTION,
    // Alcance. `all` es lo razonable para un generador institucional; `clubs`
    // permite acotarlo mientras se prueba.
    scope: { mode: 'all', clubIds: [] },
    references: [],
    masterPrompt: DEFAULT_MASTER_PROMPT,
    // Dónde se imprime el texto. `left` calza con el Prompt Maestro por
    // defecto y con la referencia (fotografía a la derecha → editorial a la
    // izquierda); `auto` vuelve a decidirlo por foto (`textZoneFor`).
    textZone: 'left',
    // Las instrucciones OPCIONALES del ensamblador, con su interruptor: el
    // ambiente por foto (la frase que adapta el prompt a ESA fotografía) y el
    // uso de la referencia visual. Lo que NO es opcional no tiene interruptor.
    promptOptions: { ambient: true, useReference: true, varyDecor: true },
    messageInstruction: DEFAULT_MESSAGE_INSTRUCTION,
    restrictions: DEFAULT_RESTRICTIONS,
    // El patrón visual OBLIGATORIO (v4.910, directiva expresa del cliente):
    // una pieza con fondo oscuro/marrón se regenera UNA vez con la
    // instrucción reforzada, y si insiste se entrega CON su aviso.
    styleGuard: true,
    branding: {
        clubLogo: true,
        districtLine: true,
        footerImage: null,   // URL de un archivo real, o null
        watermark: null,
    },
    // El nombre del club se escribe en la pieza. `Club Rotario X` es la forma
    // completa y la ofrece `publicClubs.clubDisplayName`; acá sólo se declara
    // si se usa esa forma o el nombre tal cual lo escribió la persona.
    useFullClubName: true,
});

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const bool = (v, fallback = false) => (typeof v === 'boolean' ? v : fallback);
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Una URL que se puede dibujar en una pieza. Se admite `https` y el data URL
 *  de una imagen; nada más. Estas direcciones terminan en un `<img>` de una
 *  página pública, así que aceptar cualquier esquema convertiría un campo del
 *  panel en un hueco por donde meter cualquier cosa — misma cautela que
 *  `normalizeMapUrl` con el mapa de una sede (v4.717). */
export const isDrawableImage = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return false;
    if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)) return true;
    return /^https:\/\/[^\s"'<>]+$/i.test(s);
};

export const normalizeReference = (raw) => {
    const url = typeof raw === 'string' ? raw : str(raw?.url);
    if (!isDrawableImage(url)) return null;
    // ⚠️ Este normalizador RECONSTRUYE la referencia: lo que no se enumere acá
    // se pierde al guardar (la lección de `normalizeNode` en Plantillas IA).
    // `analysis` es el análisis de estilo hecho por el modelo de visión al
    // guardarla — pasa por su propio lector acotado, nunca se guarda crudo.
    const analysis = typeof raw === 'object' && raw !== null && raw.analysis
        ? readReferenceAnalysis(raw.analysis) : null;
    return {
        url,
        note: clean(typeof raw === 'string' ? '' : raw?.note).slice(0, 160),
        primary: typeof raw === 'object' && raw !== null ? bool(raw.primary) : false,
        ...(analysis ? { analysis } : {}),
    };
};

export const normalizeConfig = (raw) => {
    const c = raw && typeof raw === 'object' ? raw : {};
    const format = FORMAT_IDS.includes(c.format) && FORMATS[c.format].available ? c.format : DEFAULT_FORMAT;
    const scopeMode = c?.scope?.mode === 'clubs' ? 'clubs' : 'all';

    const references = (Array.isArray(c.references) ? c.references : [])
        .map(normalizeReference).filter(Boolean).slice(0, MAX_REFERENCES);
    // Una sola referencia PRINCIPAL: es la que viaja al modelo como imagen de
    // dirección creativa. Con dos, «la primera imagen» del prompt deja de
    // significar algo. Si nadie la marcó, manda la primera.
    let vistaPrincipal = false;
    for (const r of references) {
        if (r.primary && !vistaPrincipal) { vistaPrincipal = true; continue; }
        r.primary = false;
    }
    if (!vistaPrincipal && references.length) references[0].primary = true;

    const b = c.branding && typeof c.branding === 'object' ? c.branding : {};
    return {
        name: clean(c.name) || DEFAULT_CONFIG.name,
        enabled: bool(c.enabled, DEFAULT_CONFIG.enabled),
        format,
        resolution: RESOLUTIONS.includes(Number(c.resolution)) ? Number(c.resolution) : DEFAULT_RESOLUTION,
        scope: {
            mode: scopeMode,
            clubIds: scopeMode === 'clubs'
                ? [...new Set((Array.isArray(c.scope?.clubIds) ? c.scope.clubIds : []).map(v => String(v || '').trim()).filter(Boolean))]
                : [],
        },
        references,
        // El maestro, con RESPALDO de lectura: una configuración guardada antes
        // de v4.898 trae `designInstruction` y no puede quedarse sin dirección
        // de arte por un renombre (regla aditiva del sitio). El campo viejo no
        // se reescribe: se lee.
        // v4.909: un default VIEJO sin editar se lee con el vigente — es lo que
        // hace que una mejora del prompt predeterminado llegue a una
        // configuración guardada. Un prompt editado no se toca jamás.
        masterPrompt: (upgradeLegacyDefault(str(c.masterPrompt).trim(), LEGACY_MASTER_PROMPTS, DEFAULT_MASTER_PROMPT)
            || str(c.designInstruction).trim() || DEFAULT_MASTER_PROMPT).slice(0, 4000),
        // ⚠️ LA ZONA DEL TEXTO TIENE QUE CALZAR CON EL LAYOUT DEL MAESTRO
        // (v4.901). El Prompt Maestro por defecto FIJA la fotografía a la
        // derecha, y la zona automática se decidía POR FOTO: con un grupo
        // centrado elegía «abajo» y el modelo no podía cumplir las dos cosas
        // — la franja quedaba ocupada y la composición se descartaba. Quien
        // fija el layout en el maestro fija la zona acá; `auto` queda para
        // una dirección de arte sin layout declarado.
        textZone: ['auto', 'left', 'right', 'bottom'].includes(c.textZone) ? c.textZone : 'left',
        promptOptions: {
            ambient: bool(c.promptOptions?.ambient, true),
            useReference: bool(c.promptOptions?.useReference, true),
            varyDecor: bool(c.promptOptions?.varyDecor, true),
        },
        messageInstruction: str(c.messageInstruction, DEFAULT_MESSAGE_INSTRUCTION).trim().slice(0, 1200),
        restrictions: (upgradeLegacyDefault(str(c.restrictions, DEFAULT_RESTRICTIONS).trim(), LEGACY_RESTRICTIONS, DEFAULT_RESTRICTIONS)).slice(0, 1200),
        styleGuard: bool(c.styleGuard, true),
        branding: {
            clubLogo: bool(b.clubLogo, true),
            districtLine: bool(b.districtLine, true),
            footerImage: isDrawableImage(b.footerImage) ? String(b.footerImage).trim() : null,
            watermark: isDrawableImage(b.watermark) ? String(b.watermark).trim() : null,
        },
        useFullClubName: bool(c.useFullClubName, true),
    };
};

/** ¿A qué sitios alcanza? El alcance lo resuelve el SERVIDOR, nunca la
 *  pantalla: con la comprobación en el navegador, quien conozca el endpoint
 *  genera igual. */
export const scopeReaches = (config, clubId) => {
    const c = normalizeConfig(config);
    if (c.scope.mode === 'all') return true;
    return !!clubId && c.scope.clubIds.includes(String(clubId));
};

// ─── Validación de la configuración ────────────────────────────────────
//
// `errors` impide PUBLICAR; `warnings` se publica y se dice. Tratarlos igual
// convierte cualquier observación en un bloqueo y se dejan de leer — la regla
// del panel de tarifas (v4.854).
export const validateConfig = (raw) => {
    const c = normalizeConfig(raw);
    const errors = [];
    const warnings = [];

    if (!c.masterPrompt || c.masterPrompt.length < 40) {
        errors.push('El Prompt Maestro está vacío o es demasiado corto: es lo único que le dice al modelo cómo tiene que verse la pieza.');
    }
    // Un token con forma de variable que el ensamblador no conoce viaja
    // LITERAL al modelo. No bloquea —puede ser una llave escrita a propósito—
    // pero se dice: un {NOMBRE_CLUV} mal tipeado es invisible de otra forma.
    const desconocidas = [...String(c.masterPrompt || '').matchAll(/\{[A-Z_]{3,}\}/g)]
        .map(m => m[0]).filter(t => !MASTER_VARIABLES.includes(t));
    if (desconocidas.length) {
        warnings.push(`El Prompt Maestro usa variables que el sistema no conoce y viajarían tal cual al modelo: ${[...new Set(desconocidas)].join(', ')}. Las disponibles son ${MASTER_VARIABLES.join(', ')}.`);
    }
    if (!c.references.length) {
        warnings.push('No hay ninguna referencia visual. La pieza se va a generar igual, pero sin una imagen de estilo el resultado se parece menos entre una generación y la siguiente.');
    }
    if (!c.restrictions) {
        warnings.push('No hay restricciones escritas. En el flujo simple nada se agrega solo: el modelo recibe únicamente el prompt base y lo que escribas acá como prompt negativo.');
    }
    if (c.scope.mode === 'clubs' && !c.scope.clubIds.length) {
        errors.push('Elegiste habilitarlo sólo en algunos sitios y no seleccionaste ninguno: así no estaría disponible en ninguna parte.');
    }
    if (c.branding.clubLogo && c.branding.footerImage === null && !c.branding.districtLine) {
        warnings.push('El pie institucional va a quedar sólo con el logotipo del club, y los clubes que no lo tengan cargado no van a mostrar ninguna marca.');
    }
    return { ok: errors.length === 0, errors, warnings, config: c };
};

// ─── Huella y versionado ───────────────────────────────────────────────
//
// El pedido pide trazabilidad, no un control de versiones. La huella cubre
// SÓLO lo que cambia el resultado: las tres instrucciones, las referencias, el
// formato y el branding. El nombre interno o el interruptor de activo no
// entran — renombrar la configuración no es una versión nueva de la pieza.
export const fingerprintOf = (raw) => {
    const c = normalizeConfig(raw);
    const material = JSON.stringify([
        c.format, c.resolution,
        c.masterPrompt, [c.promptOptions.ambient, c.promptOptions.useReference, c.promptOptions.varyDecor], c.textZone,
        c.messageInstruction, c.restrictions, c.styleGuard,
        c.references.map(r => [r.url, r.primary]),
        [c.branding.clubLogo, c.branding.districtLine, c.branding.footerImage, c.branding.watermark],
        c.useFullClubName,
    ]);
    // FNV-1a de 32 bits en hexadecimal. No es criptografía: es una etiqueta
    // estable para saber si dos configuraciones son la misma. Determinista a
    // propósito — con `Math.random` la misma configuración daría dos versiones.
    let h = 0x811c9dc5;
    for (let i = 0; i < material.length; i++) {
        h ^= material.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
};

/** ¿El cambio merece una versión nueva? Sólo si cambia lo que se imprime. */
export const isSignificantChange = (before, after) => fingerprintOf(before) !== fingerprintOf(after);

// ─── El análisis de la fotografía ──────────────────────────────────────
//
// Lo hace un modelo de VISIÓN, y lo que devuelve pasa por acá antes de decidir
// nada. Es la regla del sitio: el modelo describe, el código decide. Una
// respuesta que no se entiende no bloquea —`fallbackAnalysis` arma la pieza con
// criterio propio— porque una foto sin analizar sigue siendo generable.

export const ANALYSIS_SYSTEM = `Sos un director de arte que prepara una fotografía para una pieza gráfica de aniversario. Mirás UNA fotografía y devolvés SIEMPRE un JSON válido, sin texto alrededor y sin explicaciones.

Devolvés exactamente esta forma:
{
  "people": <entero: cuántas personas se ven; 0 si no hay ninguna>,
  "faces": <entero: cuántos rostros se distinguen>,
  "group": <true si es una foto de grupo (3 o más personas), false si no>,
  "orientation": "horizontal" | "vertical" | "cuadrada",
  "subjectSide": "izquierda" | "derecha" | "centro",
  "freeSide": "izquierda" | "derecha" | "abajo" | "arriba" | "ninguno",
  "scene": "<una frase corta, en español, de qué se ve; sin inventar nombres, lugares ni fechas>",
  "dominantLight": "clara" | "media" | "oscura",
  "hasText": <true si en la fotografía hay carteles, pendones o textos legibles>,
  "quality": "alta" | "media" | "baja"
}

Reglas:
- "subjectSide" es dónde se concentran las personas o el motivo principal.
- "freeSide" es el lado con MENOS contenido importante, donde se podría escribir sin tapar a nadie. Si no hay ninguno claro, respondé "ninguno".
- No inventes datos que no se vean. Si dudás de una cifra, dá la más baja.
- No describas ropa, etnia ni rasgos de las personas.`;

export const ANALYSIS_USER = 'Analizá esta fotografía y devolvé únicamente el JSON.';

const SIDES = ['izquierda', 'derecha', 'centro'];
const FREE = ['izquierda', 'derecha', 'abajo', 'arriba', 'ninguno'];

const intOr = (v, fallback, min, max) => {
    const n = Number.parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
};

/** Convierte lo que contestó el modelo en un análisis utilizable. Nunca lanza:
 *  devuelve el respaldo si no hay nada legible. */
export const readAnalysis = (raw) => {
    let obj = raw;
    if (typeof raw === 'string') {
        const m = raw.match(/\{[\s\S]*\}/);
        try { obj = JSON.parse(m ? m[0] : raw); } catch { obj = null; }
    }
    if (!obj || typeof obj !== 'object') return { ...fallbackAnalysis(), read: false };

    const people = intOr(obj.people, 0, 0, 400);
    return {
        read: true,
        people,
        faces: intOr(obj.faces, Math.min(people, 8), 0, 400),
        group: typeof obj.group === 'boolean' ? obj.group : people >= 3,
        orientation: ['horizontal', 'vertical', 'cuadrada'].includes(obj.orientation) ? obj.orientation : 'horizontal',
        subjectSide: SIDES.includes(obj.subjectSide) ? obj.subjectSide : 'centro',
        freeSide: FREE.includes(obj.freeSide) ? obj.freeSide : 'ninguno',
        scene: clean(obj.scene).slice(0, 180),
        dominantLight: ['clara', 'media', 'oscura'].includes(obj.dominantLight) ? obj.dominantLight : 'media',
        hasText: typeof obj.hasText === 'boolean' ? obj.hasText : false,
        quality: ['alta', 'media', 'baja'].includes(obj.quality) ? obj.quality : 'media',
    };
};

/** Cuando el modelo de visión no contesta. No adivina nada sobre las personas
 *  —`read:false` viaja hasta la pantalla— y manda el texto al tercio inferior,
 *  que es la zona que nunca compite con un rostro en una foto de grupo. */
export const fallbackAnalysis = (dimensions = null) => {
    const w = Number(dimensions?.width) || 0;
    const h = Number(dimensions?.height) || 0;
    const orientation = !w || !h ? 'horizontal' : (w > h * 1.08 ? 'horizontal' : (h > w * 1.08 ? 'vertical' : 'cuadrada'));
    return {
        read: false, people: 0, faces: 0, group: false,
        orientation, subjectSide: 'centro', freeSide: 'ninguno',
        scene: '', dominantLight: 'media', hasText: false, quality: 'media',
    };
};

// ─── Dónde va el texto ─────────────────────────────────────────────────
//
// La regla del pedido, literal: «si las personas se concentran a la derecha,
// utilizar preferentemente el área izquierda para textos; si se concentran a la
// izquierda, invertir la composición».
//
// El lado LIBRE que declaró el modelo manda sobre el lado del sujeto, porque
// responde la pregunta directamente. `centro` cae abajo: en una foto de grupo
// centrada no hay costado libre, y escribir sobre el centro es escribir sobre
// las caras.
export const textZoneFor = (analysis) => {
    const a = analysis && typeof analysis === 'object' ? analysis : {};
    if (a.freeSide === 'izquierda') return 'left';
    if (a.freeSide === 'derecha') return 'right';
    if (a.freeSide === 'abajo') return 'bottom';
    if (a.subjectSide === 'derecha') return 'left';
    if (a.subjectSide === 'izquierda') return 'right';
    return DEFAULT_TEXT_ZONE;
};

/** La zona que de verdad se usa: la FIJADA por la configuración, o la que
 *  decide la foto cuando la configuración dice `auto`. Es UN solo punto de
 *  decisión — con dos, el prompt reservaría una franja y el compositor
 *  escribiría en otra. */
export const zoneForConfig = (config, analysis) => {
    const c = normalizeConfig(config);
    return c.textZone !== 'auto' ? c.textZone : textZoneFor(analysis);
};

// ─── El análisis de la REFERENCIA VISUAL ───────────────────────────────
//
// La referencia ya viaja al modelo de imagen COMO IMAGEN; esto agrega la otra
// mitad: describirla EN PALABRAS dentro del prompt, que es la palanca más
// fuerte con estos proveedores (ninguno expone «fuerza de estilo» por
// parámetro). El modelo de visión DESCRIBE una sola vez —al guardar la
// referencia, cacheado en ella— y el código acota y ensambla: misma regla que
// el análisis de la fotografía y que el Design DNA del Director Creativo.

export const REFERENCE_SYSTEM = `Sos director de arte. Mirás UNA pieza gráfica de referencia y devolvés SIEMPRE un JSON válido, sin texto alrededor, que describa su ESTILO VISUAL para reproducirlo en piezas nuevas.

Forma exacta:
{
  "background": "<en inglés: el fondo (color, degradados, textura)>",
  "palette": ["<en inglés: 2 a 5 colores dominantes, con nombre descriptivo>"],
  "layout": "<en inglés: dónde vive cada cosa (foto, área editorial, decoración)>",
  "decoration": ["<en inglés: 2 a 4 elementos decorativos concretos>"],
  "mood": "<en inglés: el aire de la pieza en pocas palabras>"
}

Reglas:
- Describís el DISEÑO, no el contenido: no transcribas textos ni nombres.
- En inglés, porque va a un prompt de un motor de imagen.
- Concreto y corto: cada campo es una frase, no un párrafo.`;

export const REFERENCE_USER = 'Analizá esta pieza de referencia y devolvé únicamente el JSON.';

/** Lee lo que contestó el modelo sobre la referencia. Acotado campo por
 *  campo; nunca lanza — sin nada legible devuelve null y la generación sigue
 *  sin la cláusula (degrada, no bloquea). */
export const readReferenceAnalysis = (raw) => {
    let obj = raw;
    if (typeof raw === 'string') {
        const m = raw.match(/\{[\s\S]*\}/);
        try { obj = JSON.parse(m ? m[0] : raw); } catch { obj = null; }
    }
    if (!obj || typeof obj !== 'object') return null;
    const lista = (v, n, max) => (Array.isArray(v) ? v : []).map(x => clean(x).slice(0, max)).filter(Boolean).slice(0, n);
    const out = {
        background: clean(obj.background).slice(0, 140),
        palette: lista(obj.palette, 5, 40),
        layout: clean(obj.layout).slice(0, 180),
        decoration: lista(obj.decoration, 4, 60),
        mood: clean(obj.mood).slice(0, 80),
    };
    if (!out.background && !out.palette.length && !out.layout && !out.decoration.length) return null;
    return out;
};

/** La cláusula que lleva ese análisis al prompt. La escribe el CÓDIGO desde
 *  los campos acotados —no el modelo—, así es reproducible y cabe en el
 *  presupuesto (≤ ~420 caracteres). */
export const referenceClauseFor = (analysis) => {
    const a = readReferenceAnalysis(analysis);
    if (!a) return '';
    const partes = [];
    if (a.background) partes.push(`background: ${a.background}`);
    if (a.palette.length) partes.push(`palette: ${a.palette.join(', ')}`);
    if (a.layout) partes.push(`layout: ${a.layout}`);
    if (a.decoration.length) partes.push(`decorative elements: ${a.decoration.join(', ')}`);
    if (a.mood) partes.push(`mood: ${a.mood}`);
    if (!partes.length) return '';
    return `Match the visual language of the style reference — ${partes.join('; ')}.`.slice(0, 480);
};

// ─── ¿El modelo dibujó texto? (v4.905) ─────────────────────────────────
//
// El reporte con capturas: un «¡FELIZ ANIVERSARIO!» fantasma DENTRO del fondo
// generado, debajo del nuestro — el modelo imitó el rotulado de la referencia.
// Las mediciones de la franja no lo distinguen de decoración fina (por eso
// pasó), así que se PREGUNTA con el modelo de visión, la misma técnica del
// control de texto de Reels: «el texto lo lee el modelo de visión, no un OCR
// dedicado». Esto supersede la limitación declarada de v4.895 («no se
// comprueba que la imagen no traiga texto») — no agrega Tesseract ni un solo
// MB: es una llamada de visión, contra una generación de imagen desperdiciada.
//
// El veredicto respeta la lección de v4.795 sobre el ruido de una lectura
// única: acá no hay fotogramas que corroboren, así que la corroboración es la
// CONFIANZA declarada — sólo `found && confident` descalifica; `found` a secas
// se ENTREGA con nota, para que un titubeo del modelo no mande una pieza buena
// al modo plano.
export const DRAWN_TEXT_SYSTEM = [
    'Sos un verificador de piezas gráficas. Vas a mirar UN lienzo generado por un modelo de imagen: una FOTOGRAFÍA real',
    'integrada en un fondo decorativo. El FONDO debería estar libre de texto — el texto de la pieza final se imprime',
    'DESPUÉS, por software, encima de este lienzo.',
    '⚠️ LA FOTOGRAFÍA PUEDE TRAER TEXTO PROPIO — rótulos de cajas, carteles, camisetas, pendones, marcas de productos —',
    'y ese texto es LEGÍTIMO: forma parte de la escena fotografiada y NO cuenta. Lo único que cuenta es texto dibujado',
    'FUERA de la fotografía: sobre el fondo, la decoración, las franjas o los bordes de la pieza.',
    'Contestá SOLO un JSON: {"hasText": boolean, "insidePhoto": boolean, "confident": boolean, "where": "…"}.',
    '· hasText: true únicamente si ves CARACTERES dibujados de verdad FUERA de la fotografía — palabras, letras o números',
    '  legibles o casi legibles, del tipo de un titular, un rótulo o una firma. Si todo el texto que ves está DENTRO de la',
    '  fotografía, la respuesta es false.',
    '  Formas decorativas que apenas recuerdan letras, texturas, o el marco de una fotografía NO cuentan.',
    '· insidePhoto: true si TODO el texto que ves está dentro de la fotografía (y entonces hasText va en false).',
    '· confident: true sólo si es inequívoco.',
    '· where: dónde está, en pocas palabras y en español (o cadena vacía).',
].join('\n');
export const DRAWN_TEXT_USER = '¿Este lienzo contiene texto dibujado FUERA de la fotografía? Contestá el JSON.';

/** El lector ACOTADO de esa respuesta, como todos los de este módulo: el
 *  modelo contesta y el código decide qué campos existen y de qué tipo. */
export const readDrawnTextAnswer = (raw) => {
    let obj = raw;
    if (typeof raw === 'string') {
        try { obj = JSON.parse(raw.replace(/^[^{]*/, '').replace(/[^}]*$/, '')); } catch { return null; }
    }
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.hasText !== 'boolean') return null;
    return {
        found: obj.hasText,
        // El cinturón del falso positivo de v4.905: el texto que la fotografía
        // trae consigo (cajas, carteles, camisetas) es LEGÍTIMO. Si el propio
        // verificador lo ubica dentro de la foto, el CÓDIGO no descalifica —
        // aunque haya contestado hasText con descuido.
        insidePhoto: obj.insidePhoto === true,
        confident: obj.confident === true,
        where: clean(obj.where).slice(0, 160),
    };
};

// ─── El prompt de la imagen: EL FLUJO SIMPLE (v4.907) ─────────────────
//
// ⚠️ SUPERSEDE al ensamblador de cláusulas de v4.898-v4.906, por decisión
// EXPRESA del cliente con su ejemplo de ChatGPT delante: «le doy una
// referencia, una fotografía y una instrucción sencilla, y el resultado se
// aproxima claramente a lo solicitado». Lo que viaja al modelo es la
// INSTRUCCIÓN BASE con las variables sustituidas — VERBATIM. Ninguna cláusula
// automática, ningún análisis intermedio, ningún motivo decorativo, ninguna
// reserva de zona: «no agregues al prompt final instrucciones que no estén
// configuradas». La referencia viaja como PRIMERA imagen y la fotografía como
// SEGUNDA, y la instrucción base dice cuál es cuál.
//
// El tope es POR MODELO (GPT Image admite decenas de miles; la pasarela KIE
// declara 2.500). Si la instrucción del administrador no entra, se recorta
// por el final SIN partir palabras y se AVISA — un recorte silencioso
// convierte «se lo pedimos» en una afirmación falsa.
export const buildSimpleRequest = ({ config, clubName = '', years = null, maxChars = null, seed = null } = {}) => {
    const c = normalizeConfig(config);
    let prompt = applyMasterVariables(c.masterPrompt, { clubName, years, variation: variationForSeed(seed), phrase: phraseForSeed(seed) });
    const tope = Number(maxChars) || null;
    let trimmed = false;
    if (tope && prompt.length > tope) {
        prompt = trimWords(prompt, tope);
        trimmed = true;
    }
    return { prompt, trimmed };
};

export const buildNegativePrompt = (config) => {
    const c = normalizeConfig(config);
    // SOLO lo que el administrador configuró (v4.907): «no agregues al prompt
    // final instrucciones que no estén configuradas». Sin restricciones
    // escritas, no viaja ningún negativo.
    return c.restrictions ? String(c.restrictions).slice(0, 2000) : '';
};

// ─── El texto de la pieza ──────────────────────────────────────────────
//
// Dos campos y nada más: TÍTULO y MENSAJE. El modelo los escribe; el código
// comprueba que sirvan y, si no, le devuelve LA REGLA CONCRETA que rompió —
// pedirle «revisá el formato» no corrige nada (regla de `templateComposer.js`
// y de `seoAI.js`).

export const buildCopySystem = (config) => {
    const c = normalizeConfig(config);
    return `Sos redactor institucional de Rotary. Escribís en español neutro, con voz humana, sin clichés y sin signos de exclamación de más. Devolvés SIEMPRE un JSON válido, sin texto alrededor.

Forma exacta:
{ "title": "<línea de cierre>", "message": "<mensaje>" }

La pieza YA imprime arriba el saludo fijo («¡Feliz aniversario!»), el nombre del club y los años como bloques propios. Lo tuyo son DOS textos: el "message" es la CITA central (cálida, institucional) y el "title" es la LÍNEA DE CIERRE — breve y exclamativa, del tipo «¡Gracias por tanto! Sigamos generando un impacto duradero.» — que NO repite el nombre del club ni la cifra de años, porque ya están impresos.

Instrucción del cliente para el mensaje (respetala): «${c.messageInstruction}»

Reglas que no se negocian:
- El titular tiene entre ${LIMITS.title.min} y ${LIMITS.title.max} caracteres. Es un titular, no una frase larga.
- El mensaje tiene entre ${LIMITS.message.min} y ${LIMITS.message.max} caracteres y como máximo ${LIMITS.messageSentences.max} frases.
- Escribís el nombre del club EXACTAMENTE como se te da. No lo abrevies, no lo traduzcas y no lo cambies.
- Si mencionás los años, usá EXACTAMENTE el número que se te da.
- PROHIBIDO inventar fechas, días de la semana, horarios, lugares, cifras de personas, montos y nombres propios que no estén en el contexto.
- Sin hashtags, sin emojis, sin enlaces, sin «link en la bio»: esto se imprime dentro de una imagen, no se publica como pie de foto.
- Sin marcadores del tipo {{algo}}.`;
};

export const buildCopyUser = ({ clubName, years, analysis = null } = {}) => {
    const a = analysis || {};
    const lineas = [
        `Club: ${clubName}`,
        years ? `Años que cumple: ${years}` : 'No se conoce cuántos años cumple: no menciones ninguna cifra de años.',
    ];
    if (a.scene) lineas.push(`Lo que se ve en la fotografía: ${a.scene}`);
    if (a.people > 0) lineas.push(`Hay personas en la fotografía (${a.people}).`);
    else if (a.read) lineas.push('La fotografía no muestra personas.');
    lineas.push('Devolvé únicamente el JSON con el titular y el mensaje.');
    return lineas.join('\n');
};

const countSentences = (text) => String(text || '').split(/[.!?…]+/).map(s => s.trim()).filter(Boolean).length;

/** Lee la respuesta del modelo. Nunca lanza. */
export const readCopy = (raw) => {
    let obj = raw;
    if (typeof raw === 'string') {
        const m = raw.match(/\{[\s\S]*\}/);
        try { obj = JSON.parse(m ? m[0] : raw); } catch { obj = null; }
    }
    if (!obj || typeof obj !== 'object') return null;
    const title = clean(obj.title ?? obj.titulo);
    const message = clean(obj.message ?? obj.mensaje);
    if (!title && !message) return null;
    return { title, message };
};

/**
 * El CÓDIGO decide si el texto sirve. Devuelve las reglas rotas con su número,
 * que es lo que se le devuelve al modelo en el reintento.
 */
export const validateCopy = (copy, { clubName = '', years = null } = {}) => {
    const c = copy || { title: '', message: '' };
    const errors = [];
    const warnings = [];
    const t = clean(c.title);
    const m = clean(c.message);

    if (!t) errors.push('Falta el titular.');
    else if (t.length > LIMITS.title.max) errors.push(`El titular tiene ${t.length} caracteres y el máximo es ${LIMITS.title.max}.`);
    else if (t.length < LIMITS.title.min) errors.push(`El titular tiene ${t.length} caracteres y el mínimo es ${LIMITS.title.min}.`);

    if (!m) errors.push('Falta el mensaje.');
    else {
        if (m.length > LIMITS.message.max) errors.push(`El mensaje tiene ${m.length} caracteres y el máximo es ${LIMITS.message.max}.`);
        if (m.length < LIMITS.message.min) errors.push(`El mensaje tiene ${m.length} caracteres y el mínimo es ${LIMITS.message.min}.`);
        const frases = countSentences(m);
        if (frases > LIMITS.messageSentences.max) errors.push(`El mensaje tiene ${frases} frases y el máximo es ${LIMITS.messageSentences.max}.`);
    }

    const todo = `${t} ${m}`;
    if (/\{\{[^}]*\}\}/.test(todo)) errors.push('Quedó un marcador sin resolver del tipo {{algo}}.');
    if (/#\w/.test(todo)) errors.push('No se admiten hashtags: esto se imprime dentro de la imagen.');
    if (/https?:\/\//i.test(todo)) errors.push('No se admiten enlaces.');
    // Los emojis se comprueban por rango, no por lista: una lista se queda
    // corta con el primer emoji que no está en ella.
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(todo)) errors.push('No se admiten emojis.');

    // Los años se IMPRIMEN aparte; que el mensaje diga otro número es una
    // contradicción visible en la misma pieza.
    if (years) {
        const otros = [...todo.matchAll(/\b(\d{1,3})\s*(?:años|aniversario)/gi)].map(x => Number(x[1]));
        if (otros.some(n => n !== Number(years))) {
            errors.push(`El texto menciona una cantidad de años distinta de ${years}.`);
        }
    }
    if (clubName && t && m && !todo.toLowerCase().includes(String(clubName).toLowerCase().slice(0, 12))) {
        warnings.push('El texto no nombra al club. Se imprime igual, porque el nombre va en su propia línea de la pieza.');
    }
    return { ok: errors.length === 0, errors, warnings };
};

/** Recorta sin partir palabras. Un texto cortado a mitad de palabra se lee como
 *  un error del sistema. */
export const trimWords = (text, max) => {
    const s = clean(text);
    if (s.length <= max) return s;
    const corte = s.slice(0, max);
    const espacio = corte.lastIndexOf(' ');
    return (espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[,;:.\s]+$/, '');
};

/**
 * Agotados los reintentos, el trabajo NO se tira: se ajusta lo ajustable por
 * código y se entrega CON SUS AVISOS. Un titular dos caracteres largo es mejor
 * que ninguna pieza, y quien la mira lo ve. Mismo criterio que `composeMeta`
 * en el SEO y que el asistente de redacción de Noticias (v4.891).
 *
 * REPARAR NO INVENTA CONTENIDO: un mensaje corto sigue siendo corto y la
 * validación lo sigue diciendo. Alargarlo para pasar el umbral sería
 * exactamente lo que la regla de veracidad prohíbe.
 */
export const repairCopy = (copy, { clubName = '', years = null } = {}) => {
    const c = copy || {};
    const repaired = [];
    let title = clean(c.title);
    let message = clean(c.message);

    if (title.length > LIMITS.title.max) { title = trimWords(title, LIMITS.title.max); repaired.push('Se recortó el titular.'); }
    if (message.length > LIMITS.message.max) { message = trimWords(message, LIMITS.message.max); repaired.push('Se recortó el mensaje.'); }

    // Desde v4.902 el titular de la IA es la LÍNEA DE CIERRE de la pieza —la
    // jerarquía (saludo, club, años) es fija y sale siempre—. Un cierre
    // ausente NO se inventa: la pieza sale sin él, y se dice.
    if (!title) {
        repaired.push('El redactor no dio línea de cierre; la pieza sale sin ella (el saludo, el club y los años se imprimen igual).');
    }
    const check = validateCopy({ title, message }, { clubName, years });
    return { copy: { title, message }, repaired, ...check };
};

// ─── Cómo se llama el club en la pieza ─────────────────────────────────
//
// La forma completa la construye `publicClubs.clubDisplayName`, que ya la usa
// el portal de Plantillas IA y los formularios de la Feria. Acá sólo se decide
// SI se usa. Duplicar esa función daría dos formas de nombrar al mismo club.
export const printableClubName = (raw, { useFullClubName = true, displayName = null } = {}) => {
    const escrito = clean(raw);
    if (!escrito) return '';
    const nombre = useFullClubName && displayName ? clean(displayName) : escrito;
    return nombre.slice(0, LIMITS.clubName.max);
};

export const normalizeYears = (raw) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    if (n < LIMITS.years.min || n > LIMITS.years.max) return null;
    return n;
};

// ─── La validación de la pieza ─────────────────────────────────────────
//
// ⚠️ ACÁ SE DICE EXACTAMENTE QUÉ SE MIDE Y QUÉ NO, y la distinción importa más
// que la lista: un control que afirma comprobar algo que no comprueba manda a
// confiar donde no hay que confiar. Es la lección de v4.705 y de v4.790.
//
// SE GARANTIZA POR CONSTRUCCIÓN (no hace falta medirlo — lo escribimos
// nosotros en la capa 2 y la capa 3):
//   · el nombre del club, · los años, · el mensaje corto, · el branding,
//   · que ningún texto crítico caiga fuera de su zona.
//
// SE MIDE:
//   · el formato del archivo entregado (ancho y alto),
//   · cuánto blanco tiene el fondo (media de luminancia + proporción de
//     píxeles casi blancos, con sharp),
//   · si la franja del texto está tranquila (luminancia y desviación típica de
//     ESA región, no de la imagen entera — la lección de v4.715: sobre la
//     escena completa la señal se diluye 23 veces),
//   · si la fotografía se conservó: personas inventadas, personas que
//     desaparecen y consistencia de rostros (`designGuard.checkPreservation`,
//     reutilizado — copiar una medición es la forma segura de que las dos
//     mitades se separen en silencio).
//
// NO SE MIDE, y por eso no se afirma en ninguna pantalla:
//   · «estética de aniversario». No hay forma de medir si una pieza se ve
//     festiva. Se PIDE en el prompt y se MUESTRA al usuario, que decide.
//   · que la imagen no traiga texto dibujado. Detectarlo exige OCR, que son
//     decenas de MB en una función que ya empaqueta FFmpeg dentro del tope de
//     250 MB, y sería poco fiable. Se pide por `negative_prompt` y la decisión
//     queda a la vista: el usuario ve la pieza antes de descargarla.

export const PIECE_CHECKS = {
    // ⚠️ EL UMBRAL DEL FONDO ESTÁ CALIBRADO CONTRA LA REFERENCIA APROBADA, no
    // contra «una página blanca». La pieza de referencia lleva la fotografía
    // ocupando cerca de un tercio del lienzo —y una foto de grupo en interior
    // es OSCURA—, más globos dorados y curvas azules: medida entera da una
    // luminancia media de ~185-195. El umbral original (205) rechazaba
    // exactamente el estilo que el Prompt Maestro pide, gastaba los dos
    // intentos pagos y entregaba la foto sobre blanco — el reporte de v4.899,
    // y la lección repetida del sitio (v4.787/v4.790/v4.792): un control
    // demasiado estricto no falla ruidosamente, entrega otra cosa.
    //
    // Por eso hay DOS niveles: por debajo de `whiteMinLuma` la pieza es
    // realmente oscura y se DESCARTA (la restricción expresa del cliente es
    // «sin fondos oscuros»); entre ese piso y `whiteIdealLuma` la pieza se
    // ENTREGA con una nota — la estética no se mide, se muestra, y quien
    // genera la ve antes de descargarla.
    whiteMinLuma: 165,
    whiteIdealLuma: 205,
    // Qué proporción de la imagen tiene que ser casi blanca. La fotografía y
    // la decoración legítimas ya ocupan ~la mitad del lienzo.
    whiteMinShare: 0.30,
    // La franja del texto: cuanto más baja la desviación típica, más lisa.
    // Medido sobre composiciones reales, una franja utilizable queda por
    // debajo de 58; una foto a página completa pasa de 70.
    // La franja de dos niveles (v4.901, la misma forma que el fondo): por
    // encima de `zoneHardStdDev` la franja es una fotografía y se DESCARTA;
    // entre el ideal y ese techo se ENTREGA con nota — un degradado suave con
    // confeti fino mide 60-75 y el texto azul se lee perfecto encima. El caso
    // real del reporte midió 72 y el descarte entregaba la foto plana.
    zoneMaxStdDev: 58,
    zoneHardStdDev: 78,
    zoneMinLuma: 175,
    // Cuánto puede desviarse la proporción entregada de la pedida.
    aspectTolerance: 0.04,
    // ⚠️ LA ZONA INFERIOR RESERVADA SE MIDE (v4.922). El prompt pide que TODO
    // el contenido termine en el 72 % superior y que el cuarto inferior sea
    // sólo fondo — es donde la plataforma imprime la frase y superpone el pie.
    // La banda arranca en 0.74 (no en 0.80) a propósito: el defecto reportado
    // fue la cinta de años bajando hasta ~0.78 y chocando con la frase
    // impresa. Se mide sobre la salida CRUDA del modelo (la frase y el pie
    // nuestros todavía no están). Dos señales: tinta oscura (una cinta, una
    // foto o un pie generado traen píxeles bajos) y detalle (desviación
    // típica) — un fondo legítimo con ondas suaves es claro y liso. Umbrales
    // generosos a sabiendas: cada falso positivo es una regeneración pagada
    // (la pregunta obligatoria de las cuatro puertas de Reels).
    // ⚠️ RECALIBRADA en v4.925 con la pieza APROBADA delante: el layout que
    // el cliente eligió como referencia cierra la cinta de años cerca del
    // 76 % del alto, y la banda arrancando en 0.74 lo marcaba — la puerta
    // peleaba contra el estándar (el aviso «tinta 6,2 %» bajo una pieza
    // buena). La banda arranca ahora en 0.78: protege la franja real del pie
    // y deja pasar la cinta que cierra donde el estándar manda.
    footerZoneY: 0.78,
    footerZoneH: 0.18,
    footerZoneDarkLuma: 175,
    footerZoneMaxDark: 0.02,
    footerZoneMaxDetail: 36,
};

/**
 * Junta las mediciones y decide. `critical` es lo que impide entregar la
 * composición —y dispara la corrección automática—; `notes` se entrega y se
 * dice. Es PURA: recibe las mediciones ya hechas.
 */
export const judgePiece = ({
    width = 0, height = 0, format = DEFAULT_FORMAT,
    meanLuma = null, whiteShare = null,
    zoneLuma = null, zoneStdDev = null,
    preservation = null,
    drawnText = null,
} = {}) => {
    const esperado = formatById(format).ratio;
    const critical = [];
    const notes = [];
    const measured = [];

    if (width && height) {
        measured.push('formato');
        const real = width / height;
        if (Math.abs(real - esperado) / esperado > PIECE_CHECKS.aspectTolerance) {
            // No se recorta para corregirlo: se dice. Recortar la salida de un
            // modelo es exactamente lo que la regla #1 del sitio prohíbe.
            notes.push(`La imagen volvió en ${width}×${height}, que no es la proporción ${formatById(format).aspect} pedida. Se encuadra al componer.`);
        }
    }

    if (meanLuma !== null && whiteShare !== null) {
        measured.push('fondo blanco');
        if (meanLuma < PIECE_CHECKS.whiteMinLuma || whiteShare < PIECE_CHECKS.whiteMinShare) {
            critical.push({
                id: 'fondo_no_blanco',
                reason: `La pieza quedó oscura (luminancia media ${Math.round(meanLuma)} y ${Math.round(whiteShare * 100)} % de píxeles claros).`,
                consequence: 'Sobre un fondo oscuro el texto que imprimimos encima se vuelve difícil de leer.',
            });
        } else if (meanLuma < PIECE_CHECKS.whiteIdealLuma) {
            // La zona media NO descarta: la fotografía y la decoración
            // legítimas bajan la media aunque el fondo sea blanco. Se entrega
            // y se dice — quien genera la mira antes de descargarla.
            notes.push(`La pieza quedó algo menos clara que el ideal (luminancia media ${Math.round(meanLuma)}). Miralo: puede ser la fotografía y la decoración, no el fondo.`);
        }
    }

    if (zoneLuma !== null && zoneStdDev !== null) {
        measured.push('franja del texto');
        if (zoneStdDev > PIECE_CHECKS.zoneHardStdDev || zoneLuma < PIECE_CHECKS.zoneMinLuma) {
            critical.push({
                id: 'franja_ocupada',
                reason: `La franja donde va el texto quedó ocupada (luminancia ${Math.round(zoneLuma)}, variación ${Math.round(zoneStdDev)}).`,
                consequence: 'El titular y el mensaje caerían encima del contenido de la fotografía.',
            });
        } else if (zoneStdDev > PIECE_CHECKS.zoneMaxStdDev) {
            // Zona media: decoración fina sobre fondo claro. Se entrega y se
            // dice — descartarla gastaba las generaciones para entregar la
            // foto plana (misma lección que el fondo, v4.899).
            notes.push(`La franja del texto quedó con algo de decoración (variación ${Math.round(zoneStdDev)}). Miralo: el texto se imprime encima.`);
        }
    }

    if (drawnText) {
        measured.push('texto dibujado');
        if (drawnText.found && drawnText.confident && !drawnText.insidePhoto) {
            // El lienzo llega acá ANTES de nuestra capa de texto: cualquier
            // letra que se vea la dibujó el modelo, y nuestra capa caería
            // ENCIMA — el título doblado del reporte.
            critical.push({
                id: 'texto_dibujado',
                reason: `El modelo dibujó texto dentro de la imagen${drawnText.where ? ` (${drawnText.where})` : ''}.`,
                consequence: 'El texto real se imprime encima y quedaría doblado, como un fantasma detrás del título.',
            });
        } else if (drawnText.found && !drawnText.insidePhoto) {
            notes.push(`El verificador cree ver texto dibujado en la imagen${drawnText.where ? ` (${drawnText.where})` : ''}, sin certeza. Miralo antes de publicarla.`);
        }
    }

    if (preservation && preservation.state) {
        if (preservation.state === 'unavailable') {
            // «No se pudo comprobar» NO es un tipo de «bien» y se dice distinto.
            // Misma regla que `unknown` en el diagnóstico del CRM.
            notes.push('No se pudo comprobar si la fotografía se conservó. La pieza se generó igual; conviene mirarla antes de publicarla.');
        } else {
            measured.push('fotografía conservada');
            if (!preservation.use) {
                critical.push({
                    id: 'fotografia_alterada',
                    reason: preservation.reason || 'La composición alteró a las personas de la fotografía.',
                    consequence: preservation.consequence || 'Una pieza institucional no puede mostrar a alguien que no estuvo ahí.',
                });
            } else if (preservation.cropped) {
                notes.push('El encuadre se llevó a alguien de los bordes de la fotografía.');
            }
        }
    }

    return { ok: critical.length === 0, critical, notes, measured };
};

/** Qué se le pide de más al modelo cuando hay que reintentar. Se le dice el
 *  problema CONCRETO, no «hacelo mejor»: es la misma regla que el reintento
 *  del copy. */
export const retryClauseFor = (critical) => {
    const ids = new Set((critical || []).map(c => c.id));
    const frases = [];
    if (ids.has('fondo_no_blanco')) frases.push('The background must be a bright, almost pure white page; keep colour only in the decorative accents.');
    if (ids.has('franja_ocupada')) frases.push('The area reserved for the headline must be left as plain white surface, with nothing on it at all.');
    if (ids.has('fotografia_alterada')) frases.push('Keep the supplied photograph untouched: same people, same faces, same count. Change only what surrounds it.');
    if (ids.has('texto_dibujado')) frases.push('The previous attempt drew lettering on the canvas. This canvas must contain absolutely NO characters — no words, letters or numbers anywhere, not even the ones shown in the style reference: every text is printed later by the platform.');
    return frases.join(' ');
};

// ─── El patrón visual OBLIGATORIO (v4.910) ─────────────────────────────
//
// Directiva expresa del cliente: «no mostrar automáticamente un resultado
// claramente contrario al patrón» — fondo café, marrón, gris oscuro o negro.
// Es la ÚNICA puerta del flujo simple, y vuelve con la calibración de
// v4.899 aprendida: el umbral duro (165) atrapa sólo lo realmente oscuro;
// una pieza clara-con-decoración pasa con nota. Una pieza no conforme se
// regenera UNA vez con la instrucción reforzada; si insiste, SE ENTREGA con
// su aviso — descartarla gastó dos generaciones para entregar nada en
// v4.899, y ese error no se repite.
export const judgeStylePattern = ({ meanLuma = null, whiteShare = null } = {}) => {
    if (meanLuma === null || whiteShare === null) return { conforming: true, hard: false, note: null };
    if (meanLuma < PIECE_CHECKS.whiteMinLuma || whiteShare < PIECE_CHECKS.whiteMinShare) {
        return {
            conforming: false, hard: true,
            note: `La pieza no respeta el patrón de fondo blanco (luminancia ${Math.round(meanLuma)}, superficie clara ${Math.round(whiteShare * 100)} %).`,
        };
    }
    if (meanLuma < PIECE_CHECKS.whiteIdealLuma) {
        return { conforming: true, hard: false, note: `Fondo algo menos claro que el patrón (luminancia ${Math.round(meanLuma)}); dentro de lo aceptable.` };
    }
    return { conforming: true, hard: false, note: null };
};

/** La OTRA mitad de la puerta (v4.922): la zona inferior reservada. El
 *  reporte con capturas mostró la cinta de años bajando al cuarto inferior y
 *  la frase impresa chocándola. Misma forma que el patrón: determinista, UNA
 *  regeneración con la instrucción concreta y, si insiste, SE ENTREGA con su
 *  aviso — nunca se descarta en silencio. Es PURA: recibe las mediciones. */
export const judgeFooterZone = ({ darkShare = null, stdDev = null } = {}) => {
    if (darkShare === null) return { conforming: true, hard: false, note: null };
    if (darkShare > PIECE_CHECKS.footerZoneMaxDark || (stdDev !== null && stdDev > PIECE_CHECKS.footerZoneMaxDetail)) {
        return {
            conforming: false, hard: true,
            note: `El diseño baja contenido a la franja reservada del pie (tinta ${(darkShare * 100).toFixed(1)} %, detalle ${Math.round(stdDev ?? 0)}): el quinto inferior es sólo fondo.`,
        };
    }
    return { conforming: true, hard: false, note: null };
};

export const FOOTER_RETRY_CLAUSE =
    'IMPORTANT: the previous attempt placed content too low. The photograph, the number and its '
    + 'ribbon must all end above the bottom fifth of the canvas; the bottom 20% must contain ONLY '
    + 'the plain background — no photo, ribbon, text, balloons, logos or footer. Raise the whole composition.';

/** La instrucción reforzada del reintento del patrón. En inglés, como el
 *  bloque de identidad del prompt: es la lengua en que estos motores obedecen
 *  mejor una restricción de color. */
export const STYLE_RETRY_CLAUSE =
    'IMPORTANT: the previous attempt used a dark or brown background, which is forbidden. '
    + 'The background MUST be predominantly white with subtle white-on-white gradients, '
    + 'following the supplied anniversary style reference. Never brown, beige, gray or black.';

// ─── Las etapas que ve quien genera ────────────────────────────────────
//
// Están acá y no en la pantalla porque son el CONTRATO del pipeline: cada una
// corresponde a una llamada real que ocurre. Una barra de progreso inventada
// hace esperar por nada — la regla del portal de Plantillas IA (v4.756).
// ════════════════════════════════════════════════════════════════════
// EL MENSAJE INSTITUCIONAL PARA COMPARTIR (v4.929)
//
// La pieza sale acompañada de un copy de felicitación listo para redes,
// WhatsApp o correo. Tres reglas lo gobiernan:
//
//   · EL MODELO ESCRIBE EL CUERPO; LA FIRMA LA PONE EL CÓDIGO. El nombre del
//     Gobernador, el distrito y el período son exactos POR CONSTRUCCIÓN
//     (`composeGreeting`), nunca por medición — el principio del módulo.
//   · EL MODELO ESCRIBE, EL CÓDIGO DECIDE (`validateGreeting`): la única cifra
//     permitida son los años de la pieza, sin enlaces, sin hashtags, sin
//     inventar proyectos ni logros. El reintento devuelve LA REGLA CONCRETA.
//   · SI EL MODELO NO RESPONDE, HAY UN MENSAJE DE PLANTILLA (`fallbackGreeting`)
//     y se DICE que se usó: la pieza generada nunca se queda sin mensaje por
//     un fallo del redactor — son independientes a propósito.
// ════════════════════════════════════════════════════════════════════

/** El Gobernador sale de la fila de `District` (dato real de la plataforma);
 *  esta constante es sólo el respaldo cuando esa fila no lo tiene cargado. */
export const DEFAULT_GOVERNOR = 'Fabio Enrique Véjar Montañez';

export const GREETING_LIMITS = { min: 220, max: 1100 };
export const EMAIL_MAX_RECIPIENTS = 10;
export const EMAIL_MESSAGE_MAX = 4000;

/** El período rotario: arranca el 1 de julio. Recibe `today` como PARÁMETRO
 *  (pureza, la regla de `yearsSince`). */
export const rotaryPeriodFor = (today) => {
    const d = today instanceof Date ? today : new Date(today);
    const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return `${y}-${y + 1}`;
};

export const greetingSignature = ({ governor = '', period = '' } = {}) => [
    String(governor || '').trim() || DEFAULT_GOVERNOR,
    `Gobernador Distrito ${ANNIVERSARY_DISTRICT}`,
    `Rotary International | ${period}`,
].join('\n');

export const composeGreeting = (body, firma) =>
    `${String(body || '').trim()}\n\n${greetingSignature(firma)}`;

export const greetingEmailSubject = (clubName) =>
    `¡Feliz aniversario, ${String(clubName || '').trim()}!`;

// Marcador que las pruebas y el doble del proveedor usan para reconocer esta
// llamada; también es la instrucción real.
export const GREETING_SYSTEM = [
    'Sos el equipo de comunicaciones del Distrito ' + ANNIVERSARY_DISTRICT + ' de Rotary International y escribís el MENSAJE INSTITUCIONAL DE ANIVERSARIO de un club.',
    'Devolvé SOLO el cuerpo del mensaje, en español, en 2 o 3 párrafos breves: felicitación por el aniversario y reconocimiento a la trayectoria, el servicio, el liderazgo y el impacto del club en su comunidad.',
    'Tono institucional, cercano y emotivo — rotario. Variá la redacción entre pedidos; no repitas fórmulas fijas.',
    'Podés nombrar al Distrito ' + ANNIVERSARY_DISTRICT + ', pero NO escribas la firma, el nombre del Gobernador ni el período: la plataforma los agrega después.',
    'NO inventes hechos, proyectos, cifras, fechas ni nombres propios. La ÚNICA cifra permitida es la cantidad de años que se te da.',
    'Sin hashtags, sin enlaces, sin emojis, sin markdown, sin comillas envolventes.',
].join(' ');

export const buildGreetingUser = ({ clubName, years }) =>
    `Club: ${String(clubName || '').trim()}. Cumple ${Number(years)} años. Escribí el mensaje.`;

/** Limpia lo que devuelve el modelo: JSON `{message}` o texto plano, sin
 *  vallas de código ni comillas envolventes, con los saltos normalizados. */
export const readGreeting = (raw) => {
    let t = String(raw ?? '').trim();
    t = t.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    try {
        const j = JSON.parse(t);
        if (j && typeof j.message === 'string') t = j.message.trim();
    } catch { /* texto plano */ }
    t = t.replace(/^["«"]+|["»"]+$/g, '').trim();
    return t.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n');
};

const normText = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** El cuerpo tiene que hablar DE ESTE club y DE ESTOS años, y de nada que no
 *  se le haya dado. Cada error nombra su regla: es lo que hace útil el
 *  reintento (la regla de `templateComposer.js`). */
export const validateGreeting = (body, { clubName, years } = {}) => {
    const errors = [];
    const t = String(body || '').trim();
    if (t.length < GREETING_LIMITS.min) errors.push(`el mensaje tiene ${t.length} caracteres y el mínimo es ${GREETING_LIMITS.min}`);
    if (t.length > GREETING_LIMITS.max) errors.push(`el mensaje tiene ${t.length} caracteres y el máximo es ${GREETING_LIMITS.max}`);
    // La parte distintiva del nombre (sin el «Club Rotario» genérico).
    const distintivo = normText(String(clubName || '').replace(/^club\s+rotario\s+/i, '').replace(/^rotary\s+/i, ''));
    if (distintivo && !normText(t).includes(distintivo)) errors.push('el mensaje no nombra al club');
    const n = Number(years);
    if (Number.isInteger(n)) {
        // El número del distrito es legítimo dentro del cuerpo (el propio
        // ejemplo del cliente lo lleva); no cuenta como cifra ajena.
        const sinDistrito = t.replace(new RegExp(`Distrito\\s*${ANNIVERSARY_DISTRICT}`, 'gi'), 'Distrito');
        const cifras = [...sinDistrito.matchAll(/\d{1,4}/g)].map(m => Number(m[0]));
        if (!cifras.includes(n)) errors.push(`el mensaje no menciona los ${n} años`);
        if (cifras.some(c => c !== n)) errors.push(`la única cifra permitida es ${n} (los años); quitá las demás`);
    }
    if (/https?:\/\/|www\./i.test(t)) errors.push('sin enlaces');
    if (/#\w/.test(t)) errors.push('sin hashtags');
    if (/[*_`]/.test(t)) errors.push('sin markdown');
    if (/\{\{?\w+\}?\}/.test(t)) errors.push('quedó un marcador sin resolver');
    if (/\bgobernador\b/i.test(t)) errors.push('no escribas la firma ni al Gobernador: los agrega la plataforma');
    return { ok: errors.length === 0, errors };
};

export const greetingRetryClause = (errors) =>
    `IMPORTANTE: el intento anterior rompió estas reglas: ${errors.join('; ')}. Corregilas y devolvé SOLO el cuerpo del mensaje.`;

/** El mensaje de PLANTILLA: determinista, sin ningún hecho inventado. Se usa
 *  cuando el redactor no responde, y se dice. */
export const fallbackGreeting = ({ clubName, years }) => {
    const club = String(clubName || '').trim();
    const n = Number(years);
    return [
        `Celebramos junto al ${club} sus ${n} años de servicio, liderazgo y compromiso con la comunidad. Una historia construida generando impacto y transformando vidas.`,
        `En nombre del Distrito ${ANNIVERSARY_DISTRICT} de Rotary International, felicitamos a todos sus socios y reconocemos el legado que continúan construyendo.`,
        '¡Feliz aniversario!',
    ].join('\n\n');
};

// ─── Los destinatarios y el correo ─────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normaliza a minúsculas, valida el formato, deduplica y separa lo
 *  inservible CON SU VALOR: un descarte silencioso deja a quien pegó cinco
 *  direcciones sin saber cuál no entró (regla de v4.888). */
export const parseRecipients = (list) => {
    const ok = []; const bad = []; const vistos = new Set();
    for (const raw of Array.isArray(list) ? list : []) {
        const e = String(raw || '').trim().toLowerCase();
        if (!e) continue;
        if (!EMAIL_RE.test(e)) { bad.push(String(raw).trim()); continue; }
        if (vistos.has(e)) continue;
        vistos.add(e); ok.push(e);
    }
    return { ok, bad };
};

const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * El correo institucional del aniversario. HTML nuestro con TODO lo
 * interpolado escapado y con su versión en TEXTO PLANO (sin ella algunos
 * filtros puntúan el correo como sospechoso — regla de v4.856). La imagen es
 * la pieza FINAL ya subida a nuestro bucket: sólo se acepta https.
 */
export const buildGreetingEmail = ({ clubName, message, imageUrl, subject } = {}) => {
    const asunto = String(subject || '').trim().slice(0, 150) || greetingEmailSubject(clubName);
    const cuerpo = String(message || '').trim().slice(0, EMAIL_MESSAGE_MAX);
    const img = /^https:\/\//.test(String(imageUrl || '')) ? String(imageUrl) : null;
    const parrafos = cuerpo.split(/\n{2,}/).map(pz =>
        `<p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.6;">${escapeHtml(pz).replace(/\n/g, '<br>')}</p>`
    ).join('');
    const html = [
        '<div style="background:#f4f6f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">',
        '<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">',
        `<div style="background:#17458f;color:#ffffff;padding:18px 24px;font-size:16px;font-weight:bold;">Distrito ${escapeHtml(ANNIVERSARY_DISTRICT)} de Rotary International</div>`,
        '<div style="padding:24px;">',
        `<h1 style="margin:0 0 16px;color:#17458f;font-size:20px;">${escapeHtml(asunto)}</h1>`,
        parrafos,
        img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(`Pieza de aniversario — ${clubName || ''}`)}" width="552" style="display:block;width:100%;max-width:552px;border-radius:8px;margin:8px 0 4px;" />` : '',
        '</div>',
        '<div style="padding:14px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">Enviado desde Club Platform for Rotary</div>',
        '</div></div>',
    ].join('');
    const text = `${cuerpo}${img ? `\n\nLa pieza: ${img}` : ''}`;
    return { subject: asunto, html, text };
};

export const STAGES = [
    { id: 'prepare', label: 'Preparando los datos', icon: '✨' },
    { id: 'compose', label: 'Diseñando la pieza', icon: '🎨' },
    { id: 'done', label: 'Aniversario listo', icon: '✓' },
];
export const STAGE_IDS = STAGES.map(s => s.id);

// ─── Estados de una pieza ──────────────────────────────────────────────
export const PIECE_STATES = ['draft', 'analyzed', 'written', 'composing', 'ready', 'failed'];

/** Cómo se compone la pieza. `ai` es el camino normal; `plain` es la salida
 *  honesta cuando la composición no se pudo usar: la fotografía intacta sobre
 *  fondo blanco. NO es un segundo sistema de diseño — es el MISMO compositor
 *  con la capa 1 vacía— y se DICE en la pantalla. */
export const RENDER_MODES = ['ai', 'plain'];

export default {
    GENERATOR_KIND, GENERATOR_LABEL,
    FORMATS, FORMAT_IDS, DEFAULT_FORMAT, RESOLUTIONS, DEFAULT_RESOLUTION, formatById, canvasSize,
    TEXT_ZONES, TEXT_ZONE_IDS, DEFAULT_TEXT_ZONE, FOOTER_BAND, zoneById,
    DEFAULT_MESSAGE_INSTRUCTION, DEFAULT_RESTRICTIONS,
    MASTER_VARIABLES, DEFAULT_MASTER_PROMPT, applyMasterVariables,
    VARIATION_THEMES, variationForSeed, ANNIVERSARY_PHRASES, phraseForSeed,
    LIMITS, MAX_REFERENCES, BRANDING_FIELDS, BRANDING_IDS, DEFAULT_CONFIG,
    isDrawableImage, normalizeReference, normalizeConfig, scopeReaches, validateConfig,
    fingerprintOf, isSignificantChange,
    ANALYSIS_SYSTEM, ANALYSIS_USER, readAnalysis, fallbackAnalysis, textZoneFor, zoneForConfig,
    buildSimpleRequest, buildNegativePrompt,
    REFERENCE_SYSTEM, REFERENCE_USER, readReferenceAnalysis, referenceClauseFor,
    DRAWN_TEXT_SYSTEM, DRAWN_TEXT_USER, readDrawnTextAnswer,
    buildCopySystem, buildCopyUser, readCopy, validateCopy, trimWords, repairCopy,
    printableClubName, normalizeYears,
    PIECE_CHECKS, judgePiece, retryClauseFor, judgeStylePattern, STYLE_RETRY_CLAUSE,
    judgeFooterZone, FOOTER_RETRY_CLAUSE,
    STAGES, STAGE_IDS, PIECE_STATES, RENDER_MODES,
    ANNIVERSARY_DISTRICT,
    DEFAULT_GOVERNOR, GREETING_LIMITS, EMAIL_MAX_RECIPIENTS, EMAIL_MESSAGE_MAX,
    rotaryPeriodFor, greetingSignature, composeGreeting, greetingEmailSubject,
    GREETING_SYSTEM, buildGreetingUser, readGreeting, validateGreeting,
    greetingRetryClause, fallbackGreeting, parseRecipients, buildGreetingEmail,
};
