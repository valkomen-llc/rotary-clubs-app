// ════════════════════════════════════════════════════════════════════
// Plantillas IA — redacción y asistente creativo
// v4.720.0
//
// El modelo ESCRIBE; el CÓDIGO decide si sirve. Es la misma regla que
// `templateComposer.js` con las plantillas de Meta y `seoAI.js` con los
// metadatos, y está acá por el mismo motivo: los límites de una pieza gráfica
// son aritméticos —un mensaje de 900 caracteres no entra en un recuadro que da
// para 220— y un modelo de lenguaje los incumple con naturalidad aunque se le
// pidan. `validateMessage` comprueba y REINTENTA devolviéndole la regla
// concreta que rompió. Pedirle «hacelo más corto» sin decirle cuánto no corrige
// nada.
//
// La voz sale de `institutionalVoice.js`, la misma del Generador de
// Publicaciones y del Creador de Reels. Escribir una voz propia acá bifurcaría
// en silencio cómo habla la plataforma.
//
// ── LO QUE ESTE MÓDULO NO HACE ──────────────────────────────────────
//
// El pedido enumera «historia, actividad, proyectos, eventos recientes,
// noticias» como insumo del motor. Lo que existe en la plataforma se usa: la
// ciudad, el distrito, los proyectos y las publicaciones del club salen de la
// base y entran al prompt (`designBranding.js`). **Noticias externas no**: no
// hay proveedor de noticias conectado y un modelo al que se le pide «contame
// las novedades del club» las inventa. Es exactamente la regla 3 de la voz
// institucional —prohibido inventar datos—, y un aniversario firmado por el
// Gobernador es la peor pieza posible para estrenar un dato falso.
// ════════════════════════════════════════════════════════════════════

import { generateCopy } from '../services/copywritingService.js';
import { INSTITUTIONAL_VOICE, identityClause, dateClause } from './institutionalVoice.js';
import { LIMITS } from './designSpec.js';

// ─── Tonos del asistente ───────────────────────────────────────────────
//
// Catálogo CERRADO, como el de intenciones del CRM: un tono inventado no lo
// sabe aplicar nadie y no se puede reportar. Cada uno declara qué le pide al
// modelo y, cuando corresponde, cuánto puede ocupar — «más corto» sin un número
// devuelve un texto apenas más corto.
export const TONES = {
    emotivo: { label: 'Más emotivo', instruction: 'Subí la carga emocional: hablá del vínculo humano, la amistad y la huella en la comunidad. Sin cursilería ni signos de exclamación de más.' },
    formal: { label: 'Más formal', instruction: 'Registro formal y sobrio. Tratamiento de usted, sin coloquialismos.' },
    institucional: { label: 'Más institucional', instruction: 'Voz de la institución, no de una persona. Primera persona plural. Nombrá el compromiso, el servicio y la trayectoria.' },
    corto: { label: 'Más corto', instruction: 'Reducilo a un máximo de 240 caracteres conservando la idea central.', maxChars: 240 },
    elegante: { label: 'Más elegante', instruction: 'Prosa cuidada, ritmo pausado, vocabulario preciso. Evitá frases hechas.' },
    inspirador: { label: 'Más inspirador', instruction: 'Mirá hacia adelante: lo que viene, lo que se puede construir. Cerrá con impulso, sin consignas publicitarias.' },
    juvenil: { label: 'Más juvenil', instruction: 'Cercano y fresco, apto para Rotaract e Interact. Frases cortas. Sin jerga forzada ni emojis.' },
    protocolario: { label: 'Más protocolario', instruction: 'Fórmula de salutación institucional, como la que firma un Gobernador de Distrito. Estructura de saludo, reconocimiento y deseo.' },
    internacional: { label: 'Más internacional', instruction: 'Español neutro, sin regionalismos colombianos ni rioplatenses. Comprensible para un rotario de cualquier país.' },
    bilingue: { label: 'Bilingüe (ES/EN)', instruction: 'Devolvé el mensaje en español y, separado por un salto de línea, su versión en inglés. Ambas versiones deben caber en el límite de caracteres SUMADAS.', bilingual: true },
};

export const TONE_IDS = Object.keys(TONES);

// ─── Validación ────────────────────────────────────────────────────────
//
// Lo que se comprueba es lo que ROMPE la pieza: que quepa, que no venga con
// adornos de red social —un mensaje impreso dentro de un diseño con hashtags o
// «link en la bio» se lee como un error— y que no haya quedado un `{{marcador}}`
// sin resolver.
export const validateMessage = (text, { maxChars = LIMITS.message } = {}) => {
    const errors = [];
    const t = String(text || '').trim();
    if (!t) errors.push('El mensaje llegó vacío.');
    if (t.length > maxChars) errors.push(`El mensaje tiene ${t.length} caracteres y el máximo es ${maxChars}. Recortalo.`);
    if (/#\w/.test(t)) errors.push('El mensaje NO puede llevar hashtags: van aparte, en el copy de la publicación.');
    if (/\{\{|\}\}/.test(t)) errors.push('Quedó un marcador {{…}} sin resolver. Escribí el texto final.');
    if (/https?:\/\//i.test(t)) errors.push('El mensaje NO puede llevar enlaces.');
    if (/link en la bio|link in bio/i.test(t)) errors.push('Quitá «link en la bio»: esto es una pieza gráfica, no un pie de publicación.');
    return { ok: errors.length === 0, errors, text: t };
};

// Recorte por código, cuando el modelo no llega tras los reintentos: se corta en
// el último final de oración que quepa y, si no hay ninguno, en la última
// palabra entera. Un texto partido a mitad de palabra se lee como una falla del
// sistema. Mismo criterio que `reelCopy.js`.
export const trimToLimit = (text, maxChars) => {
    const t = String(text || '').trim();
    if (t.length <= maxChars) return t;
    const cut = t.slice(0, maxChars);
    const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('… '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (sentence > maxChars * 0.55) return cut.slice(0, sentence + 1).trim();
    const word = cut.lastIndexOf(' ');
    return (word > 0 ? cut.slice(0, word) : cut).trim() + '…';
};

// ─── La frase de cierre ────────────────────────────────────────────────
//
// La línea dorada e itálica que remata la pieza («¡Gracias por marcar la
// diferencia!»). Desde v4.773 la escribe el modelo junto con el mensaje —el
// pedido es que VARÍE entre piezas— y este pool es el respaldo: si el modelo
// no la devuelve o no responde, se elige una al azar de acá. La pieza NUNCA
// sale sin cierre; lo que no está garantizado sin modelo es la variedad.
export const CIERRE_MAX_CHARS = 70;
export const CIERRE_FALLBACKS = [
    '¡Gracias por marcar la diferencia!',
    '¡Que vengan muchos años más de servicio!',
    '¡Celebramos su historia y su gente!',
    '¡Gracias por servir para cambiar vidas!',
    '¡Un orgullo para toda la familia rotaria!',
];
const randomCierre = () => CIERRE_FALLBACKS[Math.floor(Math.random() * CIERRE_FALLBACKS.length)];

// ─── El ángulo de cada pieza ───────────────────────────────────────────
//
// Es el mecanismo concreto de la variedad. Con el mismo prompt, un modelo
// tiende a la misma felicitación; la temperatura sola no alcanza y pedirle
// «sé variado» no es una instrucción. Lo que sí funciona es darle un ENFOQUE
// distinto cada vez —el mismo recurso que los nueve `MUSIC_STYLES` del
// Creador de Reels: la variedad no viene del proveedor, viene de qué se le
// pide—. Se elige al azar en el servidor, por generación.
export const MESSAGE_ANGLES = [
    'la trayectoria: los años de trabajo sostenido y lo que dejaron',
    'las personas: los socios que hacen posible el club, su entrega',
    'el impacto: lo que la comunidad recibió gracias al club',
    'la amistad rotaria: el compañerismo que sostiene el servicio',
    'lo que viene: el futuro, los proyectos por delante',
    'la gratitud: lo que la comunidad y el Distrito le deben al club',
];

// ─── Contexto real del club ────────────────────────────────────────────
//
// Sólo entra lo que la plataforma SABE. Cada dato ausente se omite en vez de
// rellenarse: un prompt con «ciudad: desconocida» invita al modelo a resolver
// el hueco por su cuenta.
const contextBlock = (ctx = {}) => {
    const l = [];
    if (ctx.clubName) l.push(`Entidad: ${ctx.clubName}`);
    if (ctx.entityKind) l.push(`Tipo de entidad: ${ctx.entityKind}`);
    if (ctx.city) l.push(`Ciudad: ${ctx.city}`);
    if (ctx.country) l.push(`País: ${ctx.country}`);
    if (ctx.district) l.push(`Distrito: ${ctx.district}`);
    if (ctx.years) l.push(`Años que cumple: ${ctx.years}`);
    if (ctx.foundedYear) l.push(`Año de fundación: ${ctx.foundedYear}`);
    if (ctx.president) l.push(`Presidente del club: ${ctx.president}`);
    if (ctx.governor) l.push(`Gobernador del distrito: ${ctx.governor}`);
    if (ctx.period) l.push(`Periodo rotario: ${ctx.period}`);
    if (ctx.projects?.length) l.push(`Proyectos reales del club (usalos sólo si suman, sin exagerarlos): ${ctx.projects.slice(0, 5).join('; ')}`);
    if (ctx.focusAreas?.length) l.push(`Áreas de enfoque en las que trabaja: ${ctx.focusAreas.slice(0, 4).join(', ')}`);
    return l.join('\n');
};

const SYSTEM = `${INSTITUTIONAL_VOICE}

Contexto adicional para este módulo: estás escribiendo el texto que va IMPRESO DENTRO de una pieza gráfica institucional, no un pie de publicación. Por lo tanto:

· Nada de hashtags, emojis, enlaces ni llamados del tipo "link en la bio". Eso va aparte.
· El texto se lee de un vistazo sobre una imagen. Frases completas, cortas, sin subordinadas encadenadas.
· No repitas el nombre del club si el diseño ya lo muestra en el título; el mensaje lo acompaña, no lo duplica.
· Respetás el límite de caracteres que se te indica. Es un recuadro de tamaño fijo: lo que sobra no se ve.`;

// ─── Generación del mensaje ────────────────────────────────────────────
//
// Devuelve el mensaje de la pieza Y el material del pie de publicación
// (título, hashtags, CTA, descripción, texto alternativo). Van en la MISMA
// llamada porque el modelo ya tiene el contexto cargado: pedirlos aparte sería
// pagar dos veces por el mismo razonamiento. Y son cosas distintas a propósito
// —el mensaje se IMPRIME y el copy se PUBLICA—, igual que el guion de la voz y
// el copy en el Creador de Reels.
export const generateDesignCopy = async ({
    purpose = 'aniversario',
    context = {},
    maxChars = 320,
    tone = null,
    provider = null,
    language = 'es',
    // ── EL TEXTO DE REFERENCIA DE LA PLANTILLA ──────────────────────
    //
    // Lo escribe el administrador una vez y dice QUÉ hay que comunicar en las
    // piezas de esta plantilla —«reconocer la trayectoria, felicitar a los
    // socios»—. No es el mensaje: es su intención.
    //
    // Va acá y no al modelo de imagen a propósito. Es la separación que sostiene
    // el reparto del módulo: el modelo de imagen hace el arte y no escribe, y el
    // modelo de lenguaje escribe con este contexto. Meterlo en el prompt visual
    // sería pedirle al motor generativo que redacte, que es exactamente lo que
    // acá no se le pide.
    //
    // Y NO se imprime literal: si se imprimiera, sobraría el generador de copy y
    // todas las piezas dirían lo mismo, con el marcador del club sin resolver.
    referenceText = '',
    // Lo que decía la pieza anterior de esta misma sesión. Regenerar tiene que
    // dar OTRA pieza: sin esto, el modelo repite su propia fórmula.
    avoidText = '',
} = {}) => {
    const toneSpec = tone && TONES[tone] ? TONES[tone] : null;
    const limit = Math.min(LIMITS.message, toneSpec?.maxChars || maxChars);

    const purposeLine = {
        aniversario: 'Se celebra el ANIVERSARIO del club: cumple un año más desde su fundación. El tono es de reconocimiento por la trayectoria y de deseo hacia lo que viene.',
    }[purpose] || `Motivo de la pieza: ${purpose}.`;

    const referencia = String(referenceText || '').trim();
    const referenceLine = referencia
        ? `\nLa plantilla declara esta intención, escrita por quien la configuró. Es el SENTIDO que tiene que tener el mensaje, no un texto para copiar: reescribilo para ESTE club, con sus datos reales, sin repetirlo palabra por palabra y sin dejar ningún marcador entre llaves.\n«${referencia}»\n`
        : '';

    // El ángulo elegido para ESTA generación y, si la hay, la pieza anterior
    // que no se puede repetir. Son las dos mitades de la variedad pedida.
    const angle = MESSAGE_ANGLES[Math.floor(Math.random() * MESSAGE_ANGLES.length)];
    const avoid = String(avoidText || '').trim().slice(0, 400);
    const varietyLine = `\nEnfocá el mensaje en ${angle}. Cada pieza debe sonar distinta: evitá la felicitación genérica y las fórmulas obvias.`
        + (avoid ? `\nLa pieza anterior decía: «${avoid}». Escribí un mensaje DISTINTO — otra estructura, otras palabras, mismo sentido institucional.` : '');

    const userText = `${purposeLine}
${referenceLine}${varietyLine}
${contextBlock(context)}

${identityClause(Boolean(context.clubName))}
${dateClause(context.dateHuman || null)}
${toneSpec ? `\nTono pedido: ${toneSpec.instruction}` : ''}
${language !== 'es' ? `\nEscribí TODO en ${language}.` : ''}

Devolvé EXACTAMENTE este JSON, sin texto alrededor:
{
  "mensaje": "el texto que va impreso en la pieza, máximo ${limit} caracteres",
  "cierre": "una frase corta de remate, cálida y celebratoria, que se imprime en dorado bajo el mensaje — máximo ${CIERRE_MAX_CHARS} caracteres, sin emojis, distinta de la fórmula «Gracias por marcar la diferencia»",
  "titulo": "título breve para la pieza, máximo 60 caracteres",
  "subtitulo": "una línea de apoyo, máximo 70 caracteres",
  "descripcion": "el copy para publicar en la red, 2 a 4 frases, sin hashtags",
  "cta": "un llamado a la acción breve y no comercial, máximo 60 caracteres",
  "hashtags": ["hasta 6 hashtags en CamelCase, con #"],
  "altText": "descripción de la imagen para lectores de pantalla y SEO, máximo 125 caracteres"
}`;

    // Hasta tres pasadas: la primera limpia, y las siguientes devolviéndole al
    // modelo la REGLA CONCRETA que rompió. Es lo único que corrige de verdad.
    let lastErrors = [];
    for (let attempt = 0; attempt < 3; attempt++) {
        const retry = lastErrors.length
            ? `\n\nTu respuesta anterior no sirvió por esto:\n- ${lastErrors.join('\n- ')}\nCorregí SÓLO eso y devolvé el JSON completo otra vez.`
            : '';
        let parsed;
        try {
            const res = await generateCopy({
                ...(provider ? { provider } : {}),
                system: SYSTEM,
                userText: userText + retry,
                jsonMode: true,
                temperature: attempt === 0 ? 0.65 : 0.4,
                maxTokens: 900,
            });
            parsed = JSON.parse(res.content);
        } catch (e) {
            lastErrors = [`La respuesta no fue JSON válido (${e.message}).`];
            continue;
        }

        const check = validateMessage(parsed?.mensaje, { maxChars: limit });
        if (check.ok) return shape(parsed, check.text, limit);
        lastErrors = check.errors;
    }

    // Agotados los reintentos se repara por código en vez de tirar el trabajo:
    // el texto está bien escrito, sólo es largo. Mismo criterio que `seoAI.js`.
    const salvage = await lastResort({ purpose, context, limit, provider, language });
    return salvage;
};

const shape = (parsed, mensaje, limit) => ({
    mensaje,
    // El cierre con respaldo: sin él, la línea dorada de la pieza quedaría en
    // blanco cuando el modelo omite el campo.
    cierre: clip(parsed?.cierre, CIERRE_MAX_CHARS) || randomCierre(),
    titulo: clip(parsed?.titulo, LIMITS.title),
    subtitulo: clip(parsed?.subtitulo, 90),
    descripcion: clip(parsed?.descripcion, 900),
    cta: clip(parsed?.cta, 70),
    hashtags: Array.isArray(parsed?.hashtags)
        ? parsed.hashtags.filter(h => typeof h === 'string').map(h => (h.startsWith('#') ? h : `#${h}`).replace(/\s+/g, '')).slice(0, 6)
        : [],
    altText: clip(parsed?.altText, 125),
    limit,
});

const clip = (v, max) => (typeof v === 'string' ? trimToLimit(v.trim(), max) : '');

// Último recurso: un mensaje construido con los datos reales, sin modelo. El
// módulo tiene que entregar una pieza aunque el proveedor esté caído —misma
// regla que `fallbackDirection` en el Creador de Reels: el análisis fallido
// degrada, no bloquea.
const lastResort = async ({ context, limit }) => {
    const nombre = context.clubName || 'este club';
    const ciudad = context.city ? ` en ${context.city}` : '';
    const base = `Celebramos la trayectoria de ${nombre} y el compromiso de sus socios con el servicio${ciudad}. `
        + 'Que este nuevo año rotario traiga más proyectos, más amistad y más impacto en la comunidad.';
    return {
        mensaje: trimToLimit(base, limit),
        cierre: randomCierre(),
        titulo: '', subtitulo: '', descripcion: base, cta: '', hashtags: [], altText: '',
        limit,
        degraded: true,
        note: 'Redactado sin modelo de lenguaje: ningún proveedor respondió. El texto es editable.',
    };
};

// ─── ✨ Mejorar con IA ──────────────────────────────────────────────────
//
// Reescribe un texto que YA existe. Es distinto de generar: acá el usuario
// escribió o corrigió algo y lo que pide es un ajuste de registro, no una idea
// nueva. Por eso el prompt le prohíbe explícitamente cambiar los hechos: el
// defecto clásico de un «mejorá esto» es que el modelo agrega un dato que
// suena bien y no es cierto.
export const improveMessage = async ({ text, tone = 'institucional', context = {}, maxChars = 320, provider = null } = {}) => {
    const spec = TONES[tone];
    if (!spec) throw new Error(`Tono desconocido: ${tone}. Válidos: ${TONE_IDS.join(', ')}`);
    const limit = Math.min(LIMITS.message, spec.maxChars || maxChars);
    const original = String(text || '').trim();
    if (!original) throw new Error('No hay texto que mejorar.');

    const userText = `Reescribí este texto institucional.

TEXTO ACTUAL:
"""
${original}
"""

${contextBlock(context)}

Ajuste pedido: ${spec.instruction}
Límite: ${limit} caracteres.

Reglas: no agregues NINGÚN hecho, fecha, cifra ni nombre que no esté en el texto actual o en el contexto de arriba. No quites el sentido. No pongas hashtags, emojis ni enlaces.

Devolvé EXACTAMENTE: {"mensaje": "..."}`;

    let lastErrors = [];
    for (let attempt = 0; attempt < 3; attempt++) {
        const retry = lastErrors.length ? `\n\nTu respuesta anterior falló por:\n- ${lastErrors.join('\n- ')}\nCorregí eso.` : '';
        try {
            const res = await generateCopy({
                ...(provider ? { provider } : {}),
                system: SYSTEM,
                userText: userText + retry,
                jsonMode: true,
                temperature: 0.5,
                maxTokens: 700,
            });
            const parsed = JSON.parse(res.content);
            const check = validateMessage(parsed?.mensaje, { maxChars: limit });
            if (check.ok) return { mensaje: check.text, tone, limit, provider: res.provider };
            lastErrors = check.errors;
        } catch (e) {
            lastErrors = [`La respuesta no fue JSON válido (${e.message}).`];
        }
    }
    // El texto original sigue siendo válido: se devuelve tal cual con el motivo.
    // Perder lo que el usuario escribió porque el modelo no colaboró sería el
    // peor resultado posible de un botón que dice «mejorar».
    return { mensaje: trimToLimit(original, limit), tone, limit, degraded: true, note: 'No se pudo mejorar el texto; se conserva el original.' };
};

export default { TONES, TONE_IDS, generateDesignCopy, improveMessage, validateMessage, trimToLimit };
