// ════════════════════════════════════════════════════════════════════
// Director Creativo IA — el CRITERIO del Design DNA
// v4.838.0
//
// Este archivo es PURO: sin base, sin red, sin IA, sin sharp, sin DOM. Define
// qué es un Design DNA, cómo se consolidan varias referencias en uno, cómo se
// traduce a ajustes que el compositor entiende y cómo se puntúa una pieza.
// Todo lo demás del módulo orquesta lo que aquí se decide — mismo motivo por el
// que `seoRules.js` vive aparte de `seoAudit.js`.
//
// ── LA DECISIÓN DE FONDO: EL CÓDIGO MIDE, EL MODELO DESCRIBE ────────
//
// El pedido era «que analice las referencias y reproduzca su lenguaje visual».
// La forma ingenua es mandarle las imágenes a un modelo y pedirle el
// hexadecimal exacto, los márgenes en píxeles y las proporciones. Un modelo de
// visión CONTESTA eso —con total naturalidad— y se lo inventa: no puede leer un
// color con precisión de un JPEG recomprimido ni medir un margen en píxeles.
//
// Por eso el DNA tiene tres partes y la frontera entre ellas es el punto:
//
//   · `medido`   — lo saca `sharp`, contando píxeles. Paleta por cuantización,
//                  cobertura de tinta, cobertura de fotografía, contraste.
//                  Determinista y reproducible: la misma imagen da el mismo
//                  número siempre.
//   · `descrito` — lo saca el modelo de visión, y SÓLO estructura: en qué banda
//                  vive cada cosa, en qué orden pesa, qué carácter tiene la
//                  letra. Preguntas que un modelo contesta bien porque no
//                  exigen precisión numérica.
//   · `derivado` — lo produce ESTE archivo, traduciendo lo anterior con tablas
//                  CERRADAS. Es lo único que el compositor consume.
//
// Es la misma regla que ya rige `emergencyFeed.js` («el modelo EXTRAE, el
// código DECIDE»), `templateComposer.js`, `seoAI.js` y `validateEmergencyCopy`.
//
// ── Y EL DERIVADO NO DIBUJA: MODULA ─────────────────────────────────
//
// `applyProfile` devuelve OTRA PLANTILLA —datos—, que después compila el mismo
// `compileTemplate` de siempre. No hay una segunda vía de maquetación: eso
// reintroduciría la duplicación que Plantillas IA existe para evitar, y la
// diferencia se vería como «la vista previa no es lo que descargué».
//
// La superficie que puede modular está ACOTADA a propósito, y todo lo que hay
// en ella es seguro por construcción:
//
//   · la paleta            — un color no mueve nada de sitio;
//   · las dos familias     — `autoFit` vuelve a medir;
//   · la escala del titular— `autoFit` la acota al recuadro, así que no puede
//                            desbordar por más que el perfil pida más;
//   · la máscara de la foto— cambia por dónde se recorta, no la imagen;
//   · la forma del pie     — una forma del catálogo cerrado.
//
// Lo que NO puede tocar es dónde está cada recuadro. Mover cajas desde un
// perfil deducido de una fotografía es exactamente cómo se llega a dos textos
// encimados sin que nadie lo vea venir.
// ════════════════════════════════════════════════════════════════════

export const DNA_VERSION = 3;

// ─── Catálogos CERRADOS ────────────────────────────────────────────────
//
// El modelo propone; lo que no esté acá se descarta y se dice. Una zona
// inventada no la sabe dibujar nadie, y una que se cuele en silencio produce un
// perfil que parece bueno y no cambia nada.

/** Qué COSA vive en una zona. Son los roles que las plantillas ya declaran. */
export const ZONE_ROLES = ['foto', 'titular', 'cifras', 'cuerpo', 'marca', 'llamado', 'pie'];

/** DÓNDE vive. En bandas, no en píxeles: un modelo acierta la banda y se
 *  inventa el píxel. */
export const ZONE_BANDS = ['superior', 'medio', 'inferior'];
export const ZONE_SIDES = ['izquierda', 'centro', 'derecha', 'completo'];

/** Con qué borde. `recta` es el caso por omisión —una banda de toda la vida—;
 *  las curvas son el rasgo de la papelería del Distrito. */
export const ZONE_EDGES = ['recta', 'curva', 'circular'];

/** El CARÁCTER de la letra de los titulares. Es la pregunta que decide la
 *  familia, y un modelo la contesta bien porque es cualitativa. */
export const TYPE_CHARACTERS = ['condensada-pesada', 'grotesca-normal', 'serif-institucional'];

/** Cuánto separa al titular del cuerpo. `extremo` es lo que hace que una pieza
 *  se lea de lejos; `plano` es lo que la vuelve un documento. */
export const TYPE_JUMPS = ['plano', 'moderado', 'extremo'];

/** Cómo cierra la pieza. */
export const FOOT_STYLES = ['curvo', 'recto', 'sin'];

/** Con qué se recorta la fotografía. Espejo del catálogo de `designSpec`, más
 *  la opción de no recortar: acá `ninguna` es una respuesta legítima y allá no
 *  tendría sentido. */
export const PHOTO_MASKS = ['ninguna', 'sweep', 'sweepLeft', 'dome', 'arc', 'wave', 'ribbon', 'ellipse'];

/** Las familias que el compositor sabe usar para cada papel. NO es la lista
 *  entera de `designSpec.FONTS`: son las dos empaquetadas, que son las que
 *  reproducen el carácter de las referencias. Una familia del sistema acá
 *  devolvería el módulo al punto de partida. */
const FAMILY_BY_CHARACTER = {
    'condensada-pesada': { titular: 'condensed', texto: 'brand' },
    'grotesca-normal': { titular: 'brand', texto: 'brand' },
    'serif-institucional': { titular: 'serif', texto: 'brand' },
};

/** Cuánto crece el titular según el salto declarado. Son multiplicadores sobre
 *  lo que la plantilla ya declara, no tamaños absolutos: la plantilla sigue
 *  decidiendo la proporción entre sus piezas. */
const TITLE_SCALE_BY_JUMP = { plano: 0.86, moderado: 1.0, extremo: 1.18 };

/** Los topes de la escala. Sin ellos, un perfil raro podría pedir un titular
 *  que `autoFit` encoge hasta el mínimo y la pieza sale con un titular
 *  minúsculo dentro de un recuadro enorme — que se ve peor que no aplicar
 *  nada. */
export const TITLE_SCALE_RANGE = { min: 0.75, max: 1.35 };

// ─── Ayudas ────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;

const clamp = (n, lo, hi, fb = lo) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return fb;
    return Math.min(hi, Math.max(lo, v));
};

const oneOf = (v, lista, fb = null) => (lista.includes(v) ? v : fb);

const hex = (v) => {
    const s = String(v || '').trim();
    if (HEX.test(s)) return s.toUpperCase();
    // `#abc` es una forma legítima y frecuente; se expande en vez de tirarla.
    const corto = /^#([0-9a-fA-F]{3})$/.exec(s);
    if (corto) return `#${corto[1].split('').map(c => c + c).join('')}`.toUpperCase();
    return null;
};

/** Luminancia relativa (WCAG). Se usa para ordenar la paleta y para el
 *  contraste; no es una preferencia estética, es la fórmula del estándar. */
export const luminance = (h) => {
    const c = hex(h);
    if (!c) return 0;
    const canal = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};

/** Contraste WCAG entre dos colores. 4,5 es el mínimo para texto normal; 3
 *  para texto grande. Se DECLARA la escala para que el indicador no sea un
 *  número inventado. */
export const contrastRatio = (a, b) => {
    const la = luminance(a), lb = luminance(b);
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
};

// ─── Lo MEDIDO ─────────────────────────────────────────────────────────
//
// Lo produce `creativeAnalysis.js` con sharp. Acá sólo se le da forma y se
// acota: un valor fuera de rango es un error de medición, no un dato.

export const normalizeMeasured = (raw = {}) => {
    const paleta = (Array.isArray(raw.paleta) ? raw.paleta : [])
        .map(c => ({ hex: hex(c?.hex), cobertura: clamp(c?.cobertura, 0, 1, 0) }))
        .filter(c => c.hex)
        // Por cobertura descendente: el primero es el fondo de la pieza, que es
        // lo que la hace reconocible de lejos.
        .sort((a, b) => b.cobertura - a.cobertura)
        .slice(0, 6);
    return {
        paleta,
        tintaCobertura: clamp(raw.tintaCobertura, 0, 1, 0),
        fotoCobertura: clamp(raw.fotoCobertura, 0, 1, 0),
        contrasteMin: clamp(raw.contrasteMin, 1, 21, 1),
        proporcion: String(raw.proporcion || '').slice(0, 12) || null,
    };
};

// ─── Lo DESCRITO ───────────────────────────────────────────────────────
//
// Lo produce el modelo de visión. Todo pasa por los catálogos cerrados: una
// zona con un rol inventado se DESCARTA y se reporta. Un descarte silencioso
// daría un perfil que parece completo y no describe la referencia.

export const normalizeDescribed = (raw = {}) => {
    const descartes = [];
    const zonas = [];
    for (const z of (Array.isArray(raw.zonas) ? raw.zonas : []).slice(0, 12)) {
        const rol = oneOf(z?.rol, ZONE_ROLES);
        if (!rol) { descartes.push(`zona «${String(z?.rol || '').slice(0, 24)}»: rol desconocido`); continue; }
        if (zonas.some(x => x.rol === rol)) continue;  // una zona por rol: la primera manda
        zonas.push({
            rol,
            banda: oneOf(z?.banda, ZONE_BANDS, 'medio'),
            lado: oneOf(z?.lado, ZONE_SIDES, 'completo'),
            borde: oneOf(z?.borde, ZONE_EDGES, 'recta'),
        });
    }
    const jerarquia = (Array.isArray(raw.jerarquia) ? raw.jerarquia : [])
        .map(r => oneOf(r, ZONE_ROLES))
        .filter((r, i, a) => r && a.indexOf(r) === i)
        .slice(0, ZONE_ROLES.length);
    return {
        zonas,
        jerarquia,
        caracter: oneOf(raw.caracter, TYPE_CHARACTERS, 'grotesca-normal'),
        saltoTipografico: oneOf(raw.saltoTipografico, TYPE_JUMPS, 'moderado'),
        pie: oneOf(raw.pie, FOOT_STYLES, 'recto'),
        // ── EL CONTEXTO NARRADO ──────────────────────────────────
        //
        // Prosa: dos o tres frases que dicen a qué se parece la pieza. Es la
        // única parte del análisis que NO pasa por un catálogo cerrado, y se
        // puede permitir porque no decide nada: no modula la composición, se
        // LEE. Un modelo de lenguaje describe bien y mide mal, así que se le
        // pide justo lo que hace bien.
        //
        // Se acota en largo porque después viaja dentro del prompt de estilo,
        // que tiene presupuesto.
        contexto: String(raw.contexto || '').replace(/\s+/g, ' ').trim().slice(0, 600),
        descartes,
    };
};

// ─── CONSOLIDAR varias referencias en UN perfil ────────────────────────
//
// Un perfil se hace con varias piezas de la misma campaña, no con una. Y la
// consolidación la hace el CÓDIGO, no un modelo al que se le pidan «las
// características comunes»: promediar coberturas y votar categorías es
// aritmética, y hacerlo con un modelo lo volvería irreproducible —dos análisis
// de las mismas tres piezas darían perfiles distintos— y no auditable.
//
// El criterio para lo categórico es la MODA (lo que más se repite), con
// desempate por el orden en que llegaron: dos referencias contra una deciden.
// Para lo numérico, la MEDIANA y no la media: una referencia atípica —una
// pieza con una fotografía a toda página— no puede arrastrar el perfil entero.

const moda = (valores, fb) => {
    const cuenta = new Map();
    for (const v of valores) if (v) cuenta.set(v, (cuenta.get(v) || 0) + 1);
    let mejor = fb, mejorN = 0;
    for (const [v, n] of cuenta) if (n > mejorN) { mejor = v; mejorN = n; }
    return mejor;
};

const mediana = (nums) => {
    const xs = nums.filter(Number.isFinite).sort((a, b) => a - b);
    if (!xs.length) return 0;
    const m = xs.length >> 1;
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
};

/** Junta los colores de todas las referencias sumando coberturas por tono.
 *  Se agrupan por CERCANÍA, no por igualdad exacta: dos piezas de la misma
 *  campaña usan «el mismo azul» y el JPEG lo devuelve con dos o tres unidades
 *  de diferencia. Sin agrupar, la paleta saldría con seis azules casi iguales
 *  y ningún acento. */
const COLOR_MERGE_DIST = 40;

const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export const mergePalettes = (paletas) => {
    const grupos = [];
    for (const p of paletas) {
        for (const c of p) {
            const [r, g, b] = rgbOf(c.hex);
            const cerca = grupos.find(x => {
                const [xr, xg, xb] = rgbOf(x.hex);
                return Math.abs(xr - r) + Math.abs(xg - g) + Math.abs(xb - b) <= COLOR_MERGE_DIST;
            });
            // El tono del grupo es el de MAYOR cobertura, no el promedio: el
            // promedio de dos azules da un azul que no está en ninguna pieza.
            if (cerca) {
                cerca.cobertura += c.cobertura;
                if (c.cobertura > cerca.pico) { cerca.pico = c.cobertura; cerca.hex = c.hex; }
            } else {
                grupos.push({ hex: c.hex, cobertura: c.cobertura, pico: c.cobertura });
            }
        }
    }
    const total = grupos.reduce((s, g) => s + g.cobertura, 0) || 1;
    return grupos
        .map(g => ({ hex: g.hex, cobertura: g.cobertura / total }))
        .sort((a, b) => b.cobertura - a.cobertura)
        .slice(0, 6);
};

export const consolidate = (analisis = []) => {
    const buenos = analisis.filter(a => a && a.measured);
    if (!buenos.length) return null;
    const medidos = buenos.map(a => normalizeMeasured(a.measured));
    const descritos = buenos.filter(a => a.described).map(a => normalizeDescribed(a.described));

    const measured = {
        paleta: mergePalettes(medidos.map(m => m.paleta)),
        tintaCobertura: mediana(medidos.map(m => m.tintaCobertura)),
        fotoCobertura: mediana(medidos.map(m => m.fotoCobertura)),
        contrasteMin: mediana(medidos.map(m => m.contrasteMin)),
        proporcion: moda(medidos.map(m => m.proporcion), null),
    };

    // Sin ninguna descripción el perfil vale igual: la paleta y las coberturas
    // son la mitad del parecido y son las que NO dependen de un proveedor.
    const described = descritos.length ? {
        zonas: ZONE_ROLES
            .map(rol => {
                const vistas = descritos.flatMap(d => d.zonas.filter(z => z.rol === rol));
                if (vistas.length * 2 < descritos.length) return null;   // vista en menos de la mitad: no es un rasgo
                return {
                    rol,
                    banda: moda(vistas.map(z => z.banda), 'medio'),
                    lado: moda(vistas.map(z => z.lado), 'completo'),
                    borde: moda(vistas.map(z => z.borde), 'recta'),
                };
            })
            .filter(Boolean),
        jerarquia: descritos[0].jerarquia,
        // El contexto NO se promedia ni se concatena: se toma el MÁS LARGO de
        // los que hay. Concatenar tres descripciones de la misma familia de
        // piezas produce un texto redundante que además revienta el presupuesto
        // del prompt, y promediar prosa no significa nada.
        contexto: descritos.map(d => d.contexto).filter(Boolean).sort((a, b) => b.length - a.length)[0] || '',
        caracter: moda(descritos.map(d => d.caracter), 'grotesca-normal'),
        saltoTipografico: moda(descritos.map(d => d.saltoTipografico), 'moderado'),
        pie: moda(descritos.map(d => d.pie), 'recto'),
        descartes: descritos.flatMap(d => d.descartes),
    } : null;

    const derived = deriveStyle({ measured, described });
    const dna = { version: DNA_VERSION, measured, described, derived };
    // El CONTEXTO y el PROMPT viven en el DNA, no se calculan al pedirlos: así
    // quedan guardados con la versión del perfil y una pieza generada hace un
    // mes se puede explicar con el mismo texto que la generó.
    derived.contexto = buildStyleContext(dna);
    derived.stylePrompt = buildStylePrompt(dna);
    derived.negativePrompt = STYLE_NEGATIVE_PROMPT;
    return dna;
};

// ─── DERIVAR: la única parte que el compositor consume ─────────────────

/** El color de MARCA sale de la paleta medida, por papel:
 *
 *   · `primary` — el de MAYOR cobertura. Es el fondo de la pieza.
 *   · `accent`  — el de mayor cobertura que CONTRASTE con el fondo. No «el
 *     segundo»: el segundo suele ser una variante del fondo —un azul más claro
 *     del degradado— y usarlo de acento daría un botón invisible, que es
 *     exactamente el defecto que la banda del pie tuvo en v4.837.
 *   · `ink`     — blanco o tinta, el que se lea sobre el fondo. No se elige de
 *     la paleta: es una decisión de legibilidad, no de estilo.
 */
/**
 * Un acento tiene que DISTINGUIRSE del fondo, y eso no es lo mismo que
 * contrastar en luminancia. Medido sobre las piezas de referencia del Distrito:
 * el rojo `#C8102E` sobre el azul marino `#0C2A5E` da un contraste WCAG de
 * **2,37** —por debajo del 3 que el estándar pide hasta para texto grande— y
 * sin embargo el botón rojo se ve perfectamente, porque lo que los separa es el
 * TONO. Exigir contraste dejaba fuera el acento real de las referencias y
 * elegía el dorado, que ahí es un filete.
 *
 * Se mide como distancia RGB: es la separación que el ojo percibe cuando dos
 * colores tienen luminancia parecida y tono distinto.
 */
export const ACCENT_MIN_DISTANCE = 90;

/**
 * Cuán SATURADO es un color, de 0 a 1. Es la otra mitad de la condición del
 * acento y hace falta: con sólo contraste, una referencia compuesta en un solo
 * color acaba eligiendo un tinte desvaído del propio fondo —un malva sobre
 * bordó— y las cifras y el botón salen casi invisibles. Comprobado sobre una
 * referencia sintética de un solo tono: elegía `#8F5F5C`, saturación 0,20.
 *
 * Un acento institucional es un color con carácter: el rojo de Rotary da 0,72 y
 * el dorado 0,86. El piso va en 0,35, muy por debajo de esos dos y muy por
 * encima de un tinte.
 */
export const ACCENT_MIN_CHROMA = 0.35;

/**
 * Cuánta saturación hace falta para que un color sea DE MARCA y no papel.
 *
 * Muy por debajo del piso del acento a propósito: el azul marino del Distrito
 * (`#0C2A5E`) tiene 0,32 y el bordó de una pieza sobria, 0,26 — son colores de
 * identidad y tienen poca saturación. Lo que este piso deja fuera es el papel:
 * el blanco `#F2F1F1` da 0,004 y un negro de texto `#141518`, 0,02.
 */
export const BRAND_MIN_CHROMA = 0.15;

/** Por debajo de este contraste, el fondo elegido no puede llevar el texto
 *  blanco que las composiciones declaran, y aplicar la paleta dejaría la pieza
 *  ilegible. Es 3, el mínimo del estándar para texto grande. */
export const GROUND_MIN_CONTRAST = 3;

/** Distancia euclídea en RGB. No es perceptualmente uniforme —para eso haría
 *  falta CIELAB— y para lo que se usa alcanza de sobra: separar un acento de un
 *  tinte del propio fondo. Traer un espacio de color entero por esto sería
 *  precisión que la decisión no necesita. */
export const rgbDistance = (a, b) => {
    const ca = hex(a), cb = hex(b);
    if (!ca || !cb) return 0;
    const v = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const [r1, g1, b1] = v(ca), [r2, g2, b2] = v(cb);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
};

export const chroma = (h) => {
    const c = hex(h);
    if (!c) return 0;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
};

/**
 * ── EL FONDO ES EL COLOR DE MARCA, NO EL PAPEL ──────────────────────
 *
 * Lo destapó la primera prueba con las referencias reales del Distrito: son
 * volantes BLANCOS con cabecera y pie azules, así que el color de mayor
 * cobertura es `#F2F1F1` con el **80 %**. Tomado como fondo, las composiciones
 * de este preset —que declaran su texto en BLANCO— salían con el título blanco
 * sobre un fondo casi blanco. Ilegible, y sin que nada avisara.
 *
 * El color de mayor cobertura de una pieza clara es su PAPEL, no su identidad.
 * El fondo se toma del color de marca dominante; la cobertura sigue guardada en
 * `measured.paleta`, que es lo que describe la referencia de verdad.
 *
 * ⚠️ Consecuencia que hay que decir en la pantalla: un referente de fondo CLARO
 * no se puede trasladar tal cual, porque estas composiciones son de fondo
 * oscuro. Honrar su claridad exigiría rediseñarlas —texto oscuro, velos, otra
 * jerarquía—, que es bastante más que modular.
 */
export const deriveBrand = (paleta = []) => {
    if (!paleta.length) return null;
    const notes = [];

    const deMarca = paleta.filter(c => chroma(c.hex) >= BRAND_MIN_CHROMA);
    const primary = (deMarca[0] || paleta[0]).hex;
    if (deMarca[0] && deMarca[0].hex !== paleta[0].hex) {
        notes.push(`La referencia es de fondo claro (${paleta[0].hex} ocupa el ${Math.round(paleta[0].cobertura * 100)} %). `
            + `Estas composiciones son de fondo oscuro, así que se toma su color de marca ${primary} como fondo.`);
    }

    // `null` cuando ninguno califica, y eso NO es un fallo: significa que la
    // referencia no tiene un color de acento, y entonces manda el que ya
    // declara la campaña o la plantilla. Inventar uno sería peor que no tener.
    const accent = paleta.filter(c => c.hex !== primary).find(c =>
        rgbDistance(c.hex, primary) >= ACCENT_MIN_DISTANCE && chroma(c.hex) >= ACCENT_MIN_CHROMA
    )?.hex || null;

    const ink = contrastRatio('#FFFFFF', primary) >= contrastRatio('#0F1E3D', primary) ? '#FFFFFF' : '#0F1E3D';

    // La RED DE SEGURIDAD. Con un color de marca claro —un amarillo, un beige—
    // el texto blanco de las composiciones seguiría sin leerse. Antes que
    // entregar una pieza ilegible, no se aplica la paleta y se DICE.
    const legible = contrastRatio('#FFFFFF', primary) >= GROUND_MIN_CONTRAST;
    if (!legible) {
        notes.push(`El color dominante de la referencia (${primary}) es demasiado claro para el texto blanco `
            + 'de estas composiciones, así que se conserva el color de la campaña. El resto del estilo sí se aplica.');
        return { primary: null, accent, ink, notes };
    }
    return { primary, accent, ink, notes };
};

/** La máscara de la fotografía sale del BORDE que se describió para su zona.
 *  `curva` no dice cuál de las curvas: se elige por el LADO, que es el otro
 *  dato que el modelo sí acierta. */
const maskFor = (zonaFoto) => {
    if (!zonaFoto || zonaFoto.borde === 'recta') return 'ninguna';
    if (zonaFoto.borde === 'circular') return 'ellipse';
    if (zonaFoto.banda === 'inferior') return 'dome';
    return zonaFoto.lado === 'izquierda' ? 'sweepLeft' : 'sweep';
};

export const deriveStyle = ({ measured = null, described = null } = {}) => {
    const brand = deriveBrand(measured?.paleta || []);
    const caracter = described?.caracter || 'grotesca-normal';
    const familias = FAMILY_BY_CHARACTER[caracter] || FAMILY_BY_CHARACTER['grotesca-normal'];
    const salto = described?.saltoTipografico || 'moderado';
    return {
        brand,
        fontTitular: familias.titular,
        fontTexto: familias.texto,
        escalaTitular: clamp(TITLE_SCALE_BY_JUMP[salto], TITLE_SCALE_RANGE.min, TITLE_SCALE_RANGE.max, 1),
        mascaraFoto: maskFor((described?.zonas || []).find(z => z.rol === 'foto')),
        pie: described?.pie || 'recto',
        // Lo medido viaja al derivado para que los indicadores tengan contra
        // qué comparar sin volver a mirar `measured`: el que puntúa una pieza no
        // tiene por qué conocer la forma entera del DNA.
        tintaObjetivo: measured?.tintaCobertura ?? null,
        fotoObjetivo: measured?.fotoCobertura ?? null,
        // Lo que la referencia dijo de sí misma, para que el prompt y el
        // resumen no tengan que volver a `described`.
        notes: brand?.notes || [],
    };
};

// ─── EL PROMPT DE ESTILO ───────────────────────────────────────────────
//
// Lo que el pedido llama «un prompt para que se pueda aplicar estos patrones en
// la generación de imágenes». Sale del DNA y sirve para dos cosas: se copia a
// cualquier generador, y alimenta el `masterPrompt` del Motor de Composición de
// Plantillas IA, que es el campo que ya existe para la dirección de arte.
//
// ── LO ESCRIBE EL CÓDIGO, NO EL MODELO, Y NO ES CAPRICHO ────────────
//
// Un prompt que redacta un modelo cambia entre dos análisis de las mismas
// referencias, y este tiene que ser REPRODUCIBLE: es lo que va a componer todas
// las piezas de una campaña. Además carga las reglas que no se negocian —sin
// texto dentro de la imagen, sin logotipos dibujados, sin personas inventadas—
// y ésas no pueden depender de que un modelo se acuerde de incluirlas.
//
// Lo que sí aporta el modelo es el CONTEXTO narrado, que se cita como la parte
// descriptiva. Es el mismo reparto de todo el módulo: el modelo describe, el
// código decide.
//
// ── POR QUÉ EN INGLÉS ──────────────────────────────────────────────
//
// Los motores de imagen están entrenados mayoritariamente en inglés y responden
// mejor. El CONTEXTO va en español porque lo lee una persona; el prompt, no.

const CHARACTER_EN = {
    'condensada-pesada': 'bold condensed sans-serif headlines in uppercase',
    'grotesca-normal': 'clean grotesque sans-serif headlines',
    'serif-institucional': 'institutional serif headlines',
};
const EDGE_EN = { recta: 'straight edges', curva: 'a broad organic curved edge', circular: 'a circular crop' };
const BAND_EN = { superior: 'the upper band', medio: 'the middle band', inferior: 'the lower band' };
const SIDE_EN = { izquierda: 'the left', centro: 'the centre', derecha: 'the right', completo: 'the full width' };

/** Lo que NO se negocia, pase lo que pase con las referencias. Va aparte del
 *  positivo por la regla del sitio: dentro de la descripción de la escena, el
 *  modelo se obsesiona con lo prohibido; en su campo lo lee como lo que es. */
export const STYLE_NEGATIVE_PROMPT = [
    'text', 'lettering', 'words', 'numbers', 'captions', 'watermark',
    'logo', 'emblem', 'wheel', 'badge', 'brand mark',
    'extra people', 'invented faces', 'distorted hands',
    'collage', 'frame', 'border', 'mockup', 'ui elements',
].join(', ');

export const STYLE_PROMPT_MAX_CHARS = 1200;

/**
 * El prompt de estilo a partir de un DNA.
 *
 * Se recorta con ORDEN si hace falta: primero el contexto narrado, después el
 * mapa de zonas. Lo que NUNCA se recorta es la paleta y la cláusula de lo que no
 * se dibuja — la paleta es lo que hace reconocible el estilo, y la cláusula es
 * lo que impide que el motor escriba texto o dibuje un emblema.
 */
export const buildStylePrompt = (dna, { maxChars = STYLE_PROMPT_MAX_CHARS } = {}) => {
    const d = dna?.derived, m = dna?.measured, x = dna?.described;
    if (!d && !m) return '';

    const paleta = (m?.paleta || []).slice(0, 4).map(c => c.hex).join(', ');
    const nucleo = [
        'Institutional graphic background for a non-profit social media piece.',
        paleta ? `Strict colour palette: ${paleta}. Use no other hues.` : '',
        // Va en el núcleo: es la regla del sitio y la razón por la que una pieza
        // generada se puede publicar. El texto lo dibuja el compositor encima.
        'The image carries NO text and NO logos of any kind: those are composed on top afterwards.',
    ].filter(Boolean);

    const opcional = [];
    if (x?.contexto) opcional.push(`Art direction, from the reference pieces: ${x.contexto}`);
    if (d?.fontTitular) {
        const car = d.fontTitular === 'condensed' ? 'condensada-pesada'
            : d.fontTitular === 'serif' ? 'serif-institucional' : 'grotesca-normal';
        opcional.push(`The layout is built for ${CHARACTER_EN[car]}, so leave generous flat areas for them.`);
    }
    const foto = (x?.zonas || []).find(z => z.rol === 'foto');
    if (foto) {
        opcional.push(`Photography sits in ${BAND_EN[foto.banda] || 'the upper band'} on ${SIDE_EN[foto.lado] || 'the full width'}, with ${EDGE_EN[foto.borde] || 'straight edges'}.`);
    }
    if (Number.isFinite(m?.fotoCobertura)) {
        opcional.push(`Roughly ${Math.round(m.fotoCobertura * 100)} % of the surface is photographic; the rest is flat colour.`);
    }
    if (d?.pie) opcional.push(d.pie === 'curvo' ? 'The piece closes with a curved band at the bottom.' : 'The piece closes with a straight band at the bottom.');

    let out = nucleo.join(' ');
    for (const frase of opcional) {
        if (out.length + frase.length + 1 > maxChars) break;
        out += ` ${frase}`;
    }
    return out.trim();
};

/**
 * El CONTEXTO para una persona. Es el resumen legible del estilo: lo que el
 * modelo describió, más lo que se midió. Se arma acá y no en la pantalla porque
 * lo consumen las dos puntas —el panel lo muestra y viaja en la respuesta de la
 * API—, y dos redacciones del mismo resumen se separarían en silencio.
 */
export const buildStyleContext = (dna) => {
    const d = dna?.derived, m = dna?.measured, x = dna?.described;
    if (!d && !m) return '';
    const partes = [];
    if (x?.contexto) partes.push(x.contexto);

    const car = d?.fontTitular === 'condensed' ? 'una sans condensada y pesada'
        : d?.fontTitular === 'serif' ? 'una serif institucional' : 'una grotesca normal';
    partes.push(`Los titulares van en ${car}${d?.escalaTitular > 1 ? ', bastante mayores que el texto' : d?.escalaTitular < 1 ? ', sin mucha diferencia con el texto' : ''}.`);

    if (m?.paleta?.length) {
        partes.push(`La paleta se apoya en ${m.paleta.slice(0, 3).map(c => c.hex).join(', ')}`
            + `${d?.brand?.primary ? `, con ${d.brand.primary} como color de marca` : ''}.`);
    }
    if (Number.isFinite(m?.fotoCobertura) && Number.isFinite(m?.tintaCobertura)) {
        partes.push(`Alrededor del ${Math.round(m.fotoCobertura * 100)} % de la pieza es fotografía `
            + `y el ${Math.round(m.tintaCobertura * 100)} % es texto.`);
    }
    if (d?.mascaraFoto && d.mascaraFoto !== 'ninguna') partes.push('La fotografía se recorta con una curva, no con un borde recto.');
    if (d?.pie) partes.push(d.pie === 'curvo' ? 'El pie cierra con una curva.' : 'El pie cierra con una banda recta.');
    return partes.join(' ');
};

// ─── APLICAR el perfil a una plantilla ─────────────────────────────────
//
// Devuelve OTRA PLANTILLA. Nada dibuja acá.

/**
 * Qué texto es TITULAR y qué texto es cuerpo.
 *
 * El `role` NO alcanza, y confundirlo pone la letra de titular en las
 * etiquetas: el valor de un indicador y su etiqueta declaran los DOS
 * `role: 'cifra'` —son la misma pieza de la composición—, pero uno se lee de
 * lejos y el otro se lee de cerca. Lo mismo con un elemento y su detalle, una
 * ciudad y su cantidad de puntos, un centro y su dirección.
 *
 * Lo que sí los separa es el id: la plantilla nombra `cifra1` al valor y
 * `cifra1_label` a su etiqueta. El sufijo con guion bajo ES la marca de que ese
 * nodo acompaña a otro. No es una convención inventada acá — es la que
 * `campaignTemplates.js` ya usa en las seis piezas compartidas, y el reparto
 * que sale de esta regla reproduce exactamente el que esas plantillas declaran
 * a mano.
 */
const TITLE_ROLES = new Set(['titulo', 'cifra', 'insignia', 'cta', 'elemento', 'ciudad', 'centro']);

export const isHeadlineNode = (n) => TITLE_ROLES.has(n?.role) && !String(n?.id || '').includes('_');

export const applyProfile = (template, dna) => {
    const d = dna?.derived || dna?.derivado || null;
    if (!template || !d) return template;

    const nodes = template.nodes.map(n => {
        // ── TEXTO: familia y, sólo al título, escala ──────────────
        if (n.type === 'text') {
            const familia = isHeadlineNode(n) ? d.fontTitular : d.fontTexto;
            const out = { ...n, fontFamily: familia || n.fontFamily };
            if (n.id === 'titulo' && d.escalaTitular && d.escalaTitular !== 1) {
                // `autoFit` acota esto al recuadro, así que subir la escala no
                // puede desbordar: como mucho el título entra en menos líneas.
                // Es lo que hace que este mando sea seguro.
                out.fontSize = n.fontSize * d.escalaTitular;
            }
            return out;
        }
        // ── FOTOGRAFÍA: por dónde se recorta ──────────────────────
        if (n.type === 'image' && n.role === 'foto') {
            const m = d.mascaraFoto;
            // Sólo se toca si la fotografía es una BANDA, no si ocupa el lienzo
            // entero: recortar en curva un fondo a toda página deja el color de
            // la campaña asomando por una esquina, que se lee como un error.
            if (n.h >= 0.95) return n;
            return { ...n, mask: m && m !== 'ninguna' ? m : null };
        }
        // ── EL VELO sigue a la fotografía ─────────────────────────
        //
        // Con la foto en curva y el velo recto queda un escalón justo donde se
        // buscaba una curva (v4.837). Van juntos siempre.
        if (n.type === 'shape' && n.id === 'velo') {
            const foto = template.nodes.find(x => x.id === 'foto');
            if (!foto || foto.h >= 0.95) return n;
            const m = d.mascaraFoto;
            return { ...n, shape: m && m !== 'ninguna' ? m : 'rect' };
        }
        // ── EL PIE: su forma, nunca su presencia ──────────────────
        //
        // `sin` cambia la CURVA por una banda recta; no quita la franja. Los
        // escudos de la familia Rotary no son un rasgo de estilo que una
        // referencia pueda desactivar: son la firma institucional de la pieza.
        if (n.type === 'shape' && n.id === 'pie_banda') {
            return { ...n, shape: d.pie === 'curvo' ? 'dome' : 'rect' };
        }
        return n;
    });

    return { ...template, nodes };
};

/** El `branding` que le toca a una pieza. El perfil RELLENA lo que la campaña
 *  no eligió; nunca lo pisa. La campaña es la decisión explícita de quien la
 *  configuró y el perfil es una deducción a partir de unas fotografías: entre
 *  las dos, manda la explícita. Misma regla que `putAuto` con las traducciones
 *  y que lo manual en el SEO. */
export const mergeBranding = (campaignBranding = {}, dna = null) => {
    const d = dna?.derived?.brand || null;
    if (!d) return { ...campaignBranding };
    return {
        primary: campaignBranding.primary || d.primary || undefined,
        accent: campaignBranding.accent || d.accent || undefined,
        ink: campaignBranding.ink || d.ink || undefined,
    };
};

// ─── LOS CUATRO INDICADORES ────────────────────────────────────────────
//
// Los cuatro son DETERMINISTAS y se calculan sobre el documento ya compilado.
// Ninguno pide una opinión a un modelo, y eso no es una limitación: un número
// que sale de un juicio estético no se puede explicar ni reproducir, y en una
// pantalla se lee como una autoridad que no tiene.
//
// Cada uno devuelve `{ score, checks }` — la LISTA de lo que se comprobó, no
// sólo la nota. Un 6/10 sin desglose no le dice a nadie qué corregir.

const pct = (n, d) => (d > 0 ? n / d : 1);
const nota10 = (f) => Math.round(clamp(f, 0, 1, 0) * 10);

/** Dos recuadros se pisan. Lo mismo que comprueba la prueba de geometría, acá
 *  en tiempo de ejecución: la prueba cubre las plantillas del catálogo y esto
 *  cubre la pieza REAL, con el texto que se generó y el perfil aplicado. */
const solapan = (a, b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * LEGIBILIDAD. Es el único de los cuatro que ya se podía calcular antes de este
 * módulo y no se calculaba: `layoutText` viene devolviendo `overflow` desde
 * v4.720 y nadie lo miraba fuera del editor.
 *
 * `overflows` es opcional porque medir el texto exige un medidor, y este
 * archivo es puro. Sin él se puntúa lo que sí se puede: solapes y área segura.
 */
export const legibilityScore = (doc, { overflows = [], safeArea = 0.06 } = {}) => {
    const nodes = (doc?.nodes || []).filter(n => !n.hidden);
    const textos = nodes.filter(n => n.type === 'text' && String(n.text || '').trim());
    const checks = [];

    const pisados = new Set();
    for (let i = 0; i < textos.length; i++)
        for (let j = i + 1; j < textos.length; j++)
            if (solapan(textos[i], textos[j])) { pisados.add(textos[i].id); pisados.add(textos[j].id); }
    checks.push({ id: 'solape', ok: pisados.size === 0, detalle: pisados.size ? `${pisados.size} textos encimados` : 'ningún texto encimado' });

    const desbordados = new Set(overflows);
    checks.push({ id: 'desborde', ok: desbordados.size === 0, detalle: desbordados.size ? `${desbordados.size} textos desbordan su recuadro` : 'ningún texto desborda' });

    const fuera = textos.filter(n => n.x < -0.001 || n.y < -0.001 || n.x + n.w > 1.001 || n.y + n.h > 1.001);
    checks.push({ id: 'lienzo', ok: fuera.length === 0, detalle: fuera.length ? `${fuera.length} textos salen del lienzo` : 'todo el texto entra en la pieza' });

    // El área segura es un AVISO, no un fallo: en una historia la interfaz tapa
    // los bordes, pero en un post cuadrado un texto a 5 % del borde se ve bien.
    const alBorde = textos.filter(n => n.y < safeArea * 0.5 || n.y + n.h > 1 - safeArea * 0.5);
    checks.push({ id: 'margen', ok: alBorde.length === 0, aviso: true, detalle: alBorde.length ? `${alBorde.length} textos muy pegados al borde` : 'los márgenes se respetan' });

    const duros = checks.filter(c => !c.aviso);
    const base = pct(duros.filter(c => c.ok).length, duros.length);
    const penal = checks.some(c => c.aviso && !c.ok) ? 0.1 : 0;
    return { score: nota10(base - penal), checks };
};

/**
 * DENSIDAD. Cuánto de la pieza es tinta y cuánto es fotografía, contra lo que
 * miden las referencias. Es una ESTIMACIÓN por área de los recuadros, no un
 * conteo de píxeles —eso exigiría rasterizar— y por eso la tolerancia es ancha:
 * un número apretado sobre una estimación es una precisión fingida.
 */
export const DENSITY_TOLERANCE = 0.18;

export const densityScore = (doc, dna) => {
    const d = dna?.derived || null;
    const nodes = (doc?.nodes || []).filter(n => !n.hidden);
    const area = (ns) => ns.reduce((s, n) => s + n.w * n.h, 0);
    const tinta = area(nodes.filter(n => n.type === 'text' && String(n.text || '').trim()));
    const foto = area(nodes.filter(n => n.type === 'image' && n.role === 'foto' && n.src));
    const checks = [];

    const compara = (id, valor, objetivo, etiqueta) => {
        if (objetivo === null || objetivo === undefined) {
            checks.push({ id, ok: true, sinReferencia: true, detalle: `${etiqueta}: ${(valor * 100).toFixed(0)} % (la referencia no lo declara)` });
            return;
        }
        const dif = Math.abs(valor - objetivo);
        checks.push({
            id, ok: dif <= DENSITY_TOLERANCE,
            detalle: `${etiqueta}: ${(valor * 100).toFixed(0)} % contra ${(objetivo * 100).toFixed(0)} % de la referencia`,
        });
    };
    compara('tinta', Math.min(1, tinta), d?.tintaObjetivo ?? null, 'texto');
    compara('foto', Math.min(1, foto), d?.fotoObjetivo ?? null, 'fotografía');

    const medibles = checks.filter(c => !c.sinReferencia);
    if (!medibles.length) return { score: null, checks, sinReferencia: true };
    return { score: nota10(pct(medibles.filter(c => c.ok).length, medibles.length)), checks };
};

/**
 * CUMPLIMIENTO DE MARCA. Lista CERRADA de comprobaciones, no un juicio. Cada
 * una responde algo que se puede señalar con el dedo en la pieza.
 */
export const brandComplianceScore = (doc, dna, { allowedFonts = [] } = {}) => {
    const nodes = (doc?.nodes || []).filter(n => !n.hidden);
    const textos = nodes.filter(n => n.type === 'text' && String(n.text || '').trim());
    const checks = [];

    const logo = nodes.find(n => n.type === 'image' && n.role === 'logo' && n.src);
    checks.push({ id: 'logo', ok: !!logo, detalle: logo ? 'la pieza lleva el logotipo del sitio' : 'sin logotipo: el sitio no lo tiene cargado' });

    const familia = nodes.find(n => n.type === 'image' && n.role === 'familia' && n.src);
    checks.push({ id: 'familia', ok: !!familia, detalle: familia ? 'el pie lleva los escudos de la familia Rotary' : 'el pie sale sin escudos: no están cargados en el sitio' });

    if (allowedFonts.length) {
        const raras = [...new Set(textos.map(n => n.fontFamily).filter(f => f && !allowedFonts.includes(f)))];
        checks.push({ id: 'tipografia', ok: raras.length === 0, detalle: raras.length ? `tipografías fuera del sistema: ${raras.join(', ')}` : 'toda la letra es institucional' });
    }

    // El contraste se mide contra el FONDO DECLARADO de la pieza, que es lo
    // único que este archivo puede saber sin rasterizar. Un texto sobre la
    // fotografía no se juzga acá: no se sabe de qué color es esa fotografía, y
    // afirmar un contraste que no se midió sería peor que no medirlo.
    const fondo = doc?.background || null;
    const sobreFoto = new Set(nodes.filter(n => n.type === 'image' && n.role === 'foto' && n.src).map(n => n.id));
    if (fondo && !sobreFoto.size) {
        const flojos = textos.filter(n => n.color && contrastRatio(n.color, fondo) < 3);
        checks.push({ id: 'contraste', ok: flojos.length === 0, detalle: flojos.length ? `${flojos.length} textos con poco contraste sobre el fondo` : 'el texto contrasta con el fondo' });
    }

    if (dna?.derived?.brand?.primary) {
        const p = dna.derived.brand.primary;
        const cerca = fondo ? contrastRatio(fondo, p) <= 1.6 : false;
        checks.push({ id: 'paleta', ok: cerca, aviso: true, detalle: cerca ? 'el fondo sigue la paleta de la referencia' : 'el fondo se aparta de la paleta de la referencia' });
    }

    const duros = checks.filter(c => !c.aviso);
    const penal = checks.some(c => c.aviso && !c.ok) ? 0.1 : 0;
    return { score: nota10(pct(duros.filter(c => c.ok).length, duros.length) - penal), checks };
};

/**
 * CONSISTENCIA DE ESTILO.
 *
 * ⚠️ NO es una huella perceptual contra la referencia, y ésa es la decisión que
 * más importa de las cuatro. Comparar la pieza con la referencia daría nota
 * baja POR CONSTRUCCIÓN: tienen otro contenido, otra fotografía y otras cifras,
 * y DEBEN tenerlos. Es literalmente la lección de v4.664 —medir contra la
 * imagen equivocada— y la de v4.675, que costó dos rondas de créditos.
 *
 * Lo que se puntúa es una lista de propiedades MEDIBLES del perfil que la pieza
 * cumple o no. Se puede explicar, se puede desglosar y se puede corregir.
 */
export const styleConsistencyScore = (doc, dna) => {
    const d = dna?.derived || null;
    if (!d) return { score: null, checks: [], sinPerfil: true };
    const nodes = (doc?.nodes || []).filter(n => !n.hidden);
    const textos = nodes.filter(n => n.type === 'text' && String(n.text || '').trim());
    const checks = [];

    const titular = textos.find(n => n.id === 'titulo');
    if (titular) checks.push({
        id: 'familia_titular', ok: titular.fontFamily === d.fontTitular,
        detalle: `el titular va en «${titular.fontFamily}» y la referencia pide «${d.fontTitular}»`,
    });

    const cuerpo = textos.filter(n => !isHeadlineNode(n));
    if (cuerpo.length) checks.push({
        id: 'familia_texto', ok: cuerpo.every(n => n.fontFamily === d.fontTexto),
        detalle: `el texto va en «${d.fontTexto}»`,
    });

    const foto = nodes.find(n => n.type === 'image' && n.role === 'foto' && n.src);
    if (foto && foto.h < 0.95) {
        const esperado = d.mascaraFoto === 'ninguna' ? null : d.mascaraFoto;
        checks.push({
            id: 'borde_foto', ok: (foto.mask || null) === esperado,
            detalle: esperado ? `la fotografía se recorta con «${esperado}»` : 'la fotografía va con borde recto',
        });
    }

    const banda = nodes.find(n => n.id === 'pie_banda');
    if (banda) checks.push({
        id: 'pie', ok: banda.shape === (d.pie === 'curvo' ? 'dome' : 'rect'),
        detalle: `el pie es «${d.pie}»`,
    });

    if (!checks.length) return { score: null, checks, sinPerfil: false };
    return { score: nota10(pct(checks.filter(c => c.ok).length, checks.length)), checks };
};

/** Los cuatro juntos, para la pantalla. `null` significa «no se pudo medir» y
 *  NO es un tipo de «bien»: se pinta distinto, igual que `unknown` en el CRM. */
export const scorePiece = (doc, dna, opts = {}) => ({
    legibilidad: legibilityScore(doc, opts),
    densidad: densityScore(doc, dna),
    marca: brandComplianceScore(doc, dna, opts),
    estilo: styleConsistencyScore(doc, dna),
});

export default {
    DNA_VERSION, ZONE_ROLES, ZONE_BANDS, ZONE_SIDES, ZONE_EDGES,
    TYPE_CHARACTERS, TYPE_JUMPS, FOOT_STYLES, PHOTO_MASKS, TITLE_SCALE_RANGE,
    luminance, contrastRatio, chroma, rgbDistance, normalizeMeasured, normalizeDescribed,
    mergePalettes, consolidate, deriveBrand, deriveStyle,
    applyProfile, mergeBranding, scorePiece, isHeadlineNode,
    buildStylePrompt, buildStyleContext, STYLE_NEGATIVE_PROMPT,
    legibilityScore, densityScore, brandComplianceScore, styleConsistencyScore,
};
