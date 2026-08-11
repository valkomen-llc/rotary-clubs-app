// ════════════════════════════════════════════════════════════════════
// Plantillas IA — el catálogo
// v4.723.0
//
// Una plantilla es DATO, no código: una lista de nodos en coordenadas
// normalizadas con `{{variables}}` dentro de los textos. Agregar una plantilla
// —o cien— es agregar entradas acá; no se toca el compilador, ni el editor, ni
// el exportador, ni el modelo de datos. Eso es lo que quiere decir "escalable a
// cientos de plantillas sin modificar el núcleo".
//
// ── LA FASE 1 SON DOS PLANTILLAS, NO UNA ────────────────────────────
//
// El pedido es el aniversario de un club, en 1:1. Van dos variantes porque el
// caso real tiene dos formas y una sola no las cubre:
//
//   · `aniversario_foto` — con la fotografía del club. Es la pieza de la
//     referencia: la foto manda y el texto la acompaña.
//   · `aniversario_clasico` — sin fotografía, la tarjeta de siempre del
//     Distrito.
//
// No es una alternativa estética: un nodo de imagen con `dropIfEmpty` deja un
// HUECO en la composición cuando no hay foto, porque el resto de los nodos no
// se mueven solos. Dos plantillas resuelven eso sin inventar un motor de
// maquetación reactiva que nadie pidió. Y de paso demuestran que el catálogo
// admite layouts distintos, que es lo que había que demostrar.
//
// El orden del array ES el orden de las capas: el índice 0 va al fondo.
// ════════════════════════════════════════════════════════════════════

import { PALETTE, GOLD_GRADIENT, TEMPLATE_CATEGORIES } from './designSpec.js';

const goldFill = { type: 'linear', angle: 12, stops: GOLD_GRADIENT.map((color, i, a) => ({ at: i / (a.length - 1), color })) };

// Bloque del pie: la curva dorada, la curva azul encima y los dos textos. Se
// comparte entre las dos plantillas de aniversario para que la papelería no se
// separe en silencio — mismo motivo que `ctaStyles.ts` con los botones.
const footerBlock = ({ top = 0.845 } = {}) => ([
    { id: 'pie_oro', type: 'shape', name: 'Curva dorada', shape: 'wave', fill: goldFill, x: -0.02, y: top, w: 1.04, h: 1.02 - top, role: 'decoracion', locked: true },
    { id: 'pie_azul', type: 'shape', name: 'Curva azul', shape: 'wave', fill: PALETTE.navy, x: -0.02, y: top + 0.018, w: 1.04, h: 1.0 - top, role: 'decoracion', locked: true },
    {
        id: 'firma', type: 'text', name: 'Firma', role: 'firma', dropIfEmpty: true,
        text: '{{gobernador}}\nGobernador Distrito {{distrito}} · Periodo {{periodo}}',
        x: 0.07, y: top + 0.062, w: 0.55, h: 0.075,
        fontSize: 0.0215, fontWeight: 700, color: PALETTE.white, align: 'left', lineHeight: 1.35, minFontSize: 0.015,
    },
    {
        // Medido: con `w: 0.30` y `letterSpacing: 0.01` el lema caía en TRES
        // líneas apretadas contra el borde. A 0.34 de ancho y con el espaciado
        // en 0.004 entra en dos, que es como está en la papelería.
        id: 'lema', type: 'text', name: 'Lema', role: 'lema',
        text: 'GENERA UN IMPACTO DURADERO',
        x: 0.59, y: top + 0.068, w: 0.34, h: 0.065,
        fontSize: 0.0195, fontWeight: 800, color: PALETTE.white, align: 'right', lineHeight: 1.25, letterSpacing: 0.004, minFontSize: 0.013,
    },
]);

export const TEMPLATES = [
    // ── Aniversario con fotografía ─────────────────────────────────
    {
        id: 'aniversario_foto',
        name: 'Aniversario · con fotografía',
        category: 'aniversario',
        format: 'post_1_1',
        available: true,
        background: PALETTE.white,
        // Lo que el motor de IA tiene que llenar y lo que la pieza necesita
        // para verse completa. `requires` lo usa la pantalla para avisar ANTES
        // de generar, no después.
        requires: ['club', 'anios', 'imagen'],
        summary: 'La lámina del Distrito: textos a la izquierda y la fotografía del club abajo, bajo la banda azul y dorada.',
        // Composición con IA (v4.722). Viene APAGADA: encenderla gasta créditos
        // por pieza y manda la fotografía a un proveedor externo, así que es una
        // decisión del operador, no un valor por defecto. El administrador
        // carga su imagen base y su prompt maestro desde el panel.
        composition: {
            enabled: false,
            baseImageUrl: null,
            // La dirección de arte sale de la lámina de PowerPoint que el
            // Distrito ya usa para los aniversarios: superficie nacarada muy
            // clara con la textura de olas suaves, y el azul y el dorado
            // reservados a la banda de abajo. Es lo que hace que la pieza se
            // reconozca como suya — y lo que faltaba cuando el fondo salía con
            // un gris apagado encima.
            // Absorbe el prompt maestro que trajo el equipo (11/8): lo que el
            // CÓDIGO ya impone —textos impresos por la plataforma, firma fija,
            // preservación medida, franja limpia— no se repite acá. Lo que sí
            // es dirección de arte va en estas tres frases, y la clave es la
            // PRIMERA: la fotografía entra RECORTADA de su fondo —sólo las
            // personas— fundida sobre el lienzo, como la pieza de referencia
            // hecha en ChatGPT. No es un óvalo con la foto adentro: es la
            // silueta del grupo sobre la lámina.
            masterPrompt: 'The canvas is a bright pearl-white surface with soft flowing wave texture; royal blue and gold appear only in the sweeping band along the bottom. Everything above the people stays light, airy and uncluttered, in the visual language of Rotary stationery.',
            // El encuadre se DECLARA: es dirección de arte, no una puntuación.
            // Sin esto, `plansFor` elegía el óvalo del medio —puntuaba mejor
            // contra la franja del texto— y la pieza salía con una miniatura
            // flotando. La forma grande mordida por la curva es la papelería
            // del Distrito, la referencia que trajo el equipo.
            // `foto_fondo`: la fotografía ocupa el lienzo entero — es el plan
            // que corresponde cuando el prompt maestro pide la silueta del
            // grupo sobre la lámina, no una forma que la contenga.
            photo: { strategy: 'compose', plan: 'silueta_inferior', edgeCrop: 'allow', width: 'medio' },
            // Cada club recibe su propia lámina de la misma familia (pedido 11/8).
            baseVariation: 'variar',
            // Es una pieza de ANIVERSARIO y tiene que notarse, sin volverse una
            // tarjeta de cumpleaños: el acento va acotado —pocos, pequeños, en
            // los huecos, nunca sobre la gente ni sobre donde va el texto—
            // porque un motivo sin acotar se come la pieza.
            motifs: 'An elegant cluster of gold and pearl-white balloons with thin gold ribbons rising along the right edge, and a light scatter of fine gold confetti, never over the people and never over the calm area.',
            variants: 4,
            publicVariants: 1,
            style: 'institucional',
        },
        nodes: [
            // ── LA MAQUETA ES LA LÁMINA DEL DISTRITO (v4.768) ──────────
            //
            // Textos a la IZQUIERDA, sin número de años —la lámina no lo dice y
            // el pliego lo prohíbe: no afirmar un aniversario que no se
            // verificó—, y la FOTOGRAFÍA abajo, entrando por debajo de la banda
            // azul y dorada del pie. El orden del array es el orden de capas:
            // la foto va primera (al fondo) y el pie la cubre.
            {
                id: 'foto', type: 'image', name: 'Fotografía del club', role: 'foto', src: '{{imagen}}', fit: 'cover',
                x: 0, y: 0.40, w: 1, h: 0.60,
                // Campo vinculado: qué le sale al público y cómo se adapta lo
                // que suba. Una fotografía SÍ se recorta al encuadre y sale en
                // JPEG.
                field: { kind: 'foto', label: 'Fotografía del club' },
            },
            // El corte blanco suaviza el borde superior de la fotografía, como
            // la ola de la lámina. Va DESPUÉS de la foto para taparle el filo.
            { id: 'corte_blanco', type: 'shape', name: 'Corte', shape: 'wave', fill: PALETTE.white, x: -0.02, y: 0.345, w: 1.04, h: 0.115, role: 'decoracion', locked: true },

            // La placa existe SÓLO para dar contraste al logotipo sobre un
            // fondo con textura: sin logotipo es un rectángulo vacío.
            { id: 'placa_logo', type: 'shape', name: 'Placa del logo', shape: 'rect', fill: PALETTE.white, radius: 0.02, x: 0.05, y: 0.042, w: 0.315, h: 0.122, role: 'decoracion', requiresVar: 'logo' },
            {
                id: 'logo', type: 'image', name: 'Logotipo', role: 'logo', src: '{{logo}}', fit: 'contain',
                dropIfEmpty: true, x: 0.068, y: 0.055, w: 0.28, h: 0.096,
                // Apagado por defecto: la lámina de referencia no lleva el
                // escudo del club — firma el logo institucional del pie. Otra
                // plantilla lo enciende desde Propiedades (v4.767).
                field: { kind: 'logo', label: 'Logotipo del club', required: false, visible: false },
            },

            {
                // El título de la lámina: dos líneas, a la izquierda, CON los
                // años (pedido del 11/8: el título toma el número y el nombre
                // del club). El número no se inventa: es un campo obligatorio
                // que llega calculado al elegir el club de la lista y queda
                // editable — quien genera la pieza lo afirma. El nombre ya
                // viene con su tratamiento («Club Rotario X»), así que el
                // saludo no lo repite. SIN el emoji 🎉 de la lámina, y es
                // medido, no gusto: sus métricas difieren entre el DOM y el
                // canvas y corrían la pieza 1 px — la vista previa dejaba de ser
                // el archivo, que es la promesa del módulo. La celebración la
                // ponen los motivos de la composición.
                // La redacción es la pedida textual: «feliz aniversario
                // número, club rotario y el nombre del club».
                id: 'titulo', type: 'text', name: 'Título', text: '¡Feliz aniversario número {{anios}},\n{{club}}!',
                x: 0.06, y: 0.115, w: 0.64, h: 0.135,
                fontSize: 0.049, fontWeight: 800, color: PALETTE.royal, align: 'left', lineHeight: 1.22, minFontSize: 0.028,
            },
            {
                id: 'mensaje', type: 'text', name: 'Mensaje', role: 'mensaje', text: '{{mensaje}}',
                field: { kind: 'texto_largo', label: 'Mensaje' },
                x: 0.06, y: 0.262, w: 0.58, h: 0.085,
                fontSize: 0.030, fontWeight: 400, color: PALETTE.ink, align: 'left', lineHeight: 1.35, minFontSize: 0.018,
            },
            {
                // El cierre dorado de la lámina, itálica dorada. Desde v4.773
                // es una VARIABLE: el pedido del 11/8 es que la frase cambie en
                // cada pieza, así que la escribe el modelo junto con el mensaje.
                // El `defaultValue` es lo que garantiza que la línea nunca
                // falte: si el modelo no responde, sale la fórmula clásica.
                id: 'cierre', type: 'text', name: 'Cierre', role: 'cierre',
                text: '{{cierre}}',
                field: { kind: 'texto', label: 'Frase de cierre', defaultValue: '¡Gracias por marcar la diferencia!' },
                x: 0.06, y: 0.352, w: 0.58, h: 0.04,
                fontSize: 0.030, fontWeight: 700, italic: true, color: PALETTE.gold, align: 'left', lineHeight: 1.2, minFontSize: 0.017,
            },
            ...footerBlock({ top: 0.848 }),
        ],
    },

    // ── Aniversario clásico (sin fotografía) ───────────────────────
    {
        id: 'aniversario_clasico',
        name: 'Aniversario · clásico',
        category: 'aniversario',
        format: 'post_1_1',
        available: true,
        background: PALETTE.white,
        requires: ['club', 'anios'],
        summary: 'La tarjeta de siempre del Distrito, sin fotografía. Sirve aunque no haya una foto publicable.',
        nodes: [
            { id: 'fondo', type: 'shape', name: 'Fondo', shape: 'rect', fill: PALETTE.cloud, x: 0, y: 0, w: 1, h: 1, role: 'decoracion', locked: true },
            // Un filo dorado arriba en vez del arco que llevaba hasta la primera
            // prueba de render: el arco dejaba una cuña blanca en la esquina
            // izquierda y el confeti quedaba encima de la banda, todo revuelto.
            // La tarjeta del Distrito tampoco lleva curva arriba, sólo abajo.
            { id: 'filo_superior', type: 'shape', name: 'Filo superior', shape: 'rect', fill: goldFill, x: 0, y: 0, w: 1, h: 0.014, role: 'decoracion', locked: true },

            {
                id: 'logo', type: 'image', name: 'Logotipo', role: 'logo', src: '{{logo}}', fit: 'contain',
                dropIfEmpty: true, x: 0.07, y: 0.06, w: 0.28, h: 0.10,
                // Mismo campo vinculado que en la plantilla con fotografía: las
                // reglas del logotipo son del DATO, no del diseño.
                field: { kind: 'logo', label: 'Logotipo del club', required: false },
            },
            // Termina en 0,245 y el saludo empieza en 0,285: no se tocan. Antes
            // ocupaba hasta 0,32 y se le montaba encima al nombre del club.
            { id: 'confeti', type: 'icon', name: 'Confeti', shape: 'rect', fill: PALETTE.gold, x: 0.735, y: 0.055, w: 0.19, h: 0.19, opacity: 0.55, role: 'decoracion', path: null },

            {
                id: 'saludo', type: 'text', name: 'Saludo', text: 'Al {{club}}',
                x: 0.08, y: 0.285, w: 0.84, h: 0.135,
                fontSize: 0.054, fontWeight: 800, color: PALETTE.royal, align: 'center', valign: 'middle', lineHeight: 1.14, minFontSize: 0.03,
            },
            {
                id: 'titulo', type: 'text', name: 'Título', text: '¡Felices {{anios}} años!',
                x: 0.08, y: 0.445, w: 0.84, h: 0.085,
                fontSize: 0.062, fontWeight: 800, color: PALETTE.royal, align: 'center', valign: 'middle', lineHeight: 1.1, minFontSize: 0.032,
            },
            { id: 'filete', type: 'shape', name: 'Filete', shape: 'rect', fill: goldFill, radius: 0.004, x: 0.41, y: 0.556, w: 0.18, h: 0.006, role: 'decoracion' },
            {
                id: 'mensaje', type: 'text', name: 'Mensaje', role: 'mensaje', text: '{{mensaje}}',
                field: { kind: 'texto_largo', label: 'Mensaje' },
                x: 0.115, y: 0.595, w: 0.77, h: 0.155,
                fontSize: 0.0295, fontWeight: 400, color: PALETTE.ink, align: 'center', valign: 'middle', lineHeight: 1.42, minFontSize: 0.018,
            },
            {
                id: 'reconocimiento', type: 'text', name: 'Cierre', text: 'Con sincero reconocimiento,',
                x: 0.115, y: 0.762, w: 0.77, h: 0.042,
                fontSize: 0.0235, fontWeight: 400, color: PALETTE.slate, align: 'center', lineHeight: 1.2, italic: true, minFontSize: 0.016,
            },
            ...footerBlock({ top: 0.838 }),
        ],
    },
];

// El confeti del clásico se resuelve contra la biblioteca en tiempo de lectura,
// para no duplicar el trazo acá. Un elemento que desaparezca de la biblioteca
// deja la plantilla sin ese adorno, no rota.
import { elementById } from './designElements.js';
for (const tpl of TEMPLATES) {
    for (const node of tpl.nodes) {
        if (node.type === 'icon' && node.path === null) {
            const el = elementById(node.id) || elementById('confeti');
            node.path = el?.path || null;
            if (!node.path) node.type = 'shape';
        }
    }
}

export const templateById = (id) => TEMPLATES.find(t => t.id === id) || null;

export const availableTemplates = (format = null) =>
    TEMPLATES.filter(t => t.available && (!format || t.format === format));

// El catálogo para la pantalla: TODAS las categorías, aunque estén vacías. Una
// categoría sin plantillas se muestra como "Próximamente" a propósito — es el
// mapa de hacia dónde crece el módulo, y esconderla haría creer que el sistema
// es sólo el aniversario. Mismo criterio que los motores declarados con
// `available:false` en el Generador de Publicaciones.
export const catalog = () => TEMPLATE_CATEGORIES.map(cat => ({
    ...cat,
    templates: TEMPLATES.filter(t => t.category === cat.id).map(t => ({
        id: t.id, name: t.name, format: t.format, available: t.available,
        requires: t.requires || [], summary: t.summary || '',
    })),
}));

export default { TEMPLATES, templateById, availableTemplates, catalog };
