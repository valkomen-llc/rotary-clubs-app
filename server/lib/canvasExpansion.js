// ════════════════════════════════════════════════════════════════════
// AI Canvas Expansion — adaptación de una fotografía a otro formato
// v4.665.0
//
// Convierte una fotografía horizontal o cuadrada al formato del Reel (9:16 por
// defecto) generando lo que falta arriba y abajo, en vez de recortar los lados.
//
// POR QUÉ HACE FALTA
//
// Los motores image-to-video HEREDAN la proporción de la imagen de entrada. Una
// foto apaisada produce un clip apaisado, y el montaje tenía que encuadrarlo con
// `crop` para meterlo en el vertical: se perdían los bordes, que es justo donde
// suelen estar las personas de los extremos. Expandir el lienzo ANTES de animar
// es lo único que evita esa pérdida.
//
// CÓMO, Y POR QUÉ ASÍ
//
// Misma filosofía que el Generador de Publicaciones (`buildSimplePrompt` en
// `contentStudioController.js`), que ya hace esto en producción: se le pide al
// modelo la fotografía REGENERADA en la nueva proporción, extendiendo el fondo,
// y se le enumera lo que debe conservar. SIN máscara y SIN composite.
//
// Las dos alternativas están descartadas por experiencia propia, anotada en
// CLAUDE.md — no reintroducirlas sin una razón muy fuerte:
//
//   · Outpainting CON MÁSCARA grande (v4.317-v4.320): `gpt-image-1` duplicaba
//     el contenido de forma intermitente, con efecto mosaico. El defecto no era
//     el prompt: era el tamaño de la banda enmascarada.
//   · COMPOSITE del original sobre el resultado (v4.323-v4.324, y de nuevo en
//     v4.324 como espejo sembrado): el equipo del cliente lo rechazó dos veces
//     con las mismas palabras — «se ve overlay / montaje».
//
// EL COSTE HONESTO DE ESTA DECISIÓN
//
// Sin composite no se puede GARANTIZAR que el píxel original quede idéntico:
// una regeneración semántica siempre deriva un poco. Lo que sí se puede es
// MEDIRLO. Por eso este módulo no promete preservación: la comprueba sobre la
// región donde vive la foto original y regenera cuando no llega al umbral
// (`verifyExpansion`). Un número comprobable vale más que una promesa.
// ════════════════════════════════════════════════════════════════════

import { createKieImageTask, getKieImageTask, fetchKieImageBuffer } from '../services/kieService.js';
import { generateCopy } from '../services/copywritingService.js';

// ─── Proveedores ───────────────────────────────────────────────────────────
//
// Registro desacoplado, mismo criterio que los motores de video y el de copy:
// agregar uno es una entrada acá más su `model`. El id del modelo es
// configurable por entorno porque las pasarelas los renombran.
//
// `preservation` es la nota de conservación del contenido de entrada, de 1 a 5.
// Es lo que decide el default: para una pieza institucional con logotipos
// importa más no redibujar la marca que tener el fondo más vistoso.
export const EXPANSION_PROVIDERS = {
    nano_banana: {
        id: 'nano_banana',
        label: 'Nano Banana (Gemini 2.5 Flash Image)',
        gateway: 'kie',
        model: process.env.EXPANSION_MODEL_NANO_BANANA || 'google/nano-banana-edit',
        preservation: 5,
        available: true,
        isDefault: true,
        note: 'El mismo motor que usa el Generador de Publicaciones. Conserva identidad y marca mejor que ningún otro.'
    },
    flux_fill: {
        id: 'flux_fill',
        label: 'Flux Fill (Black Forest Labs)',
        gateway: 'kie',
        model: process.env.EXPANSION_MODEL_FLUX_FILL || 'black-forest-labs/flux-kontext-max',
        preservation: 4,
        available: true,
        note: 'Buena continuidad de fondo y perspectiva. Algo más creativo en las zonas nuevas.'
    },
    seedream: {
        id: 'seedream',
        label: 'Seedream 4 Edit (ByteDance)',
        gateway: 'kie',
        model: process.env.EXPANSION_MODEL_SEEDREAM || 'bytedance/seedream-v4-edit',
        preservation: 4,
        available: process.env.EXPANSION_ENGINE_SEEDREAM_ENABLED === 'true',
        note: 'Cambio de relación de aspecto nativo. Verificar el id del modelo antes de habilitarlo.'
    },
    ideogram: {
        id: 'ideogram',
        label: 'Ideogram Fill',
        gateway: 'kie',
        model: process.env.EXPANSION_MODEL_IDEOGRAM || 'ideogram/edit',
        preservation: 4,
        available: process.env.EXPANSION_ENGINE_IDEOGRAM_ENABLED === 'true',
        note: 'Fuerte en tipografía. Verificar el id del modelo antes de habilitarlo.'
    },
    openai: {
        id: 'openai',
        label: 'OpenAI gpt-image-1',
        gateway: 'openai',
        model: 'gpt-image-1',
        preservation: 3,
        // Deshabilitado a propósito: con bandas grandes duplica en mosaico
        // (v4.317-v4.320). Queda declarado para que no se «redescubra» como
        // idea nueva sin leer por qué se descartó.
        available: false,
        note: 'Descartado: con máscaras grandes duplica el contenido en mosaico. Ver CLAUDE.md.'
    }
};

export const DEFAULT_EXPANSION_PROVIDER =
    (process.env.EXPANSION_PROVIDER && EXPANSION_PROVIDERS[process.env.EXPANSION_PROVIDER]?.available)
        ? process.env.EXPANSION_PROVIDER
        : (Object.values(EXPANSION_PROVIDERS).find(p => p.isDefault && p.available)?.id || 'nano_banana');

export const isExpansionProviderAvailable = (id) => {
    const p = EXPANSION_PROVIDERS[id];
    if (!p || !p.available) return false;
    if (p.gateway === 'kie') return Boolean(process.env.KIE_API_KEY);
    if (p.gateway === 'openai') return Boolean(process.env.OPENAI_API_KEY);
    return false;
};

// ─── Ajustes ───────────────────────────────────────────────────────────────
//
// Todo configurable por entorno. `creativity` y `preservation` son los dos ejes
// que de verdad cambian el resultado; el resto acota cuándo actuar.
export const EXPANSION_SETTINGS = () => ({
    provider: DEFAULT_EXPANSION_PROVIDER,
    // 0 = sólo continuar lo que ya se ve; 1 = permitir inventar ambiente.
    // Bajo a propósito: una pieza institucional no quiere fondo inventado.
    creativity: numberEnv('EXPANSION_CREATIVITY', 0.25, 0, 1),
    // Nota mínima de conservación del original (0-1) para dar por buena la
    // expansión. Por debajo, se regenera.
    minPreservation: numberEnv('EXPANSION_MIN_PRESERVATION', 0.82, 0, 1),
    // Cuánto puede crecer el lienzo.
    //
    // Estuvo en 3,2 hasta v4.713 y ese número dejaba fuera justo el caso más
    // común del cliente. Medido con las tres fotos que se reportaron —2,2:1 a
    // 2,3:1, apaisadas de móvil— hacía falta crecer 3,95× / 4,04× / 4,09×: las
    // tres por encima del techo, las tres rechazadas, las tres recortadas al
    // centro por el montaje. Un 16:9 exacto daba 3,16 y pasaba por los pelos,
    // así que en la práctica cualquier foto más ancha que 16:9 se recortaba.
    //
    // A 4,5 entra todo hasta ~2,53:1, que cubre la foto apaisada de móvil y de
    // cámara. Por encima ya es una panorámica de verdad y se sigue rechazando:
    // el criterio de que a partir de cierto punto el modelo no sostiene la
    // coherencia no cambia, cambia dónde está el punto.
    //
    // EL COSTE, DICHO: a 2,3:1 el original ocupa el 24 % del alto final y el
    // 76 % restante es contenido generado. No es un detalle — es la mayor parte
    // del cuadro. Por eso `generatedFraction` se calcula y se muestra: la
    // decisión entre «perder a las personas de los bordes» y «generar tres
    // cuartos del cuadro» es del usuario, y no se puede tomar sin ver el número.
    maxGrowth: numberEnv('EXPANSION_MAX_GROWTH', 4.5, 1.1, 8),
    // Diferencia de proporción por debajo de la cual NO se toca la imagen.
    // 3 % absorbe redondeos de exportación sin dejar pasar una apaisada.
    tolerance: numberEnv('EXPANSION_TOLERANCE', 0.03, 0.005, 0.2),
    // Reintentos automáticos cuando la comprobación no llega al umbral.
    maxRetries: Math.round(numberEnv('EXPANSION_MAX_RETRIES', 2, 0, 4)),
    // Resolución objetivo del lienzo expandido. Se pide alta porque después la
    // anima un modelo de video: entrar blando es entrar mal.
    targetHeight: Math.round(numberEnv('EXPANSION_TARGET_HEIGHT', 1920, 1080, 3840)),
    autoRegenerate: process.env.EXPANSION_AUTO_REGENERATE !== 'false'
});

function numberEnv(key, dflt, min, max) {
    const raw = Number(process.env[key]);
    return Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : dflt;
}

// ─── Orientación ───────────────────────────────────────────────────────────

// Decide QUÉ hay que hacer con esta imagen. Es la puerta del módulo: una foto
// que ya está en el formato pedido no se toca, y eso es lo más importante que
// hace esta función — no gastar créditos ni arriesgar deriva sin motivo.
export const planExpansion = ({ width, height, targetWidth, targetHeight, settings = EXPANSION_SETTINGS() }) => {
    if (!width || !height) {
        return { action: 'skip', reason: 'No se pudo leer el tamaño de la imagen.', ok: false };
    }

    const sourceRatio = width / height;
    const targetRatio = targetWidth / targetHeight;
    const drift = Math.abs(sourceRatio - targetRatio) / targetRatio;

    if (drift <= settings.tolerance) {
        return {
            action: 'skip',
            reason: 'La imagen ya está en el formato del Reel.',
            ok: true, sourceRatio, targetRatio,
            orientation: 'ya-vertical'
        };
    }

    // Hacia dónde hay que crecer. Con la proporción de destino más estrecha que
    // la de origen (el caso apaisado → vertical), falta ALTURA.
    const grows = sourceRatio > targetRatio ? 'vertical' : 'horizontal';

    // Cuánto lienzo nuevo hace falta, en proporción al original.
    const growth = grows === 'vertical'
        ? (width / targetRatio) / height   // altura final / altura original
        : (height * targetRatio) / width;  // ancho final / ancho original

    const orientation = sourceRatio > 1.15 ? 'horizontal' : (drift <= 0.15 ? 'casi-cuadrada' : 'cuadrada');

    if (growth > settings.maxGrowth) {
        return {
            action: 'skip',
            ok: false,
            orientation, sourceRatio, targetRatio, growth: round(growth), grows,
            reason: `La imagen es demasiado apaisada (${width}×${height}): llegar a ${targetWidth}×${targetHeight} exigiría generar ${round(growth)}× su altura, y a partir de ${settings.maxGrowth}× ningún modelo sostiene la coherencia. Conviene una foto más cuadrada o ya vertical.`
        };
    }

    return {
        action: 'expand',
        ok: true,
        orientation,
        grows,
        sourceRatio: round(sourceRatio),
        targetRatio: round(targetRatio),
        growth: round(growth),
        // Fracción del lienzo final que va a ser contenido NUEVO. Es el número
        // que de verdad predice el riesgo, y el que se muestra.
        generatedFraction: round(1 - 1 / growth)
    };
};

const round = (n) => Number(n.toFixed(3));

// ─── Análisis de la fotografía ─────────────────────────────────────────────
//
// Antes de expandir se mira QUÉ es la foto, porque la continuación correcta
// depende del contexto: un cielo se continúa con cielo, una cocina con muebles
// y pared, una carretera con pavimento. Sin esto el modelo rellena con lo que
// le parece y se nota.
//
// También se identifican los elementos que NO puede tocar. No se le manda una
// máscara —eso duplicaba en mosaico— sino que se le NOMBRAN en el prompt, que
// es lo que este stack ya hace funcionar en el Generador de Publicaciones.
export const PHOTO_TYPES = {
    lifestyle:    { label: 'Lifestyle',    continues: 'the surrounding room or outdoor setting, with the same natural light' },
    producto:     { label: 'Producto',     continues: 'the surface the product rests on and the clean backdrop behind it' },
    food:         { label: 'Gastronomía',  continues: 'the table surface, linen and softly blurred kitchen or dining background' },
    corporativo:  { label: 'Corporativo',  continues: 'the office walls, ceiling and floor, with the same interior lighting' },
    evento:       { label: 'Evento',       continues: 'the venue: ceiling or sky above, floor and further guests below, same ambience' },
    deportivo:    { label: 'Deportivo',    continues: 'the field, court or track, with the same crowd and sky' },
    moda:         { label: 'Moda',         continues: 'the backdrop and floor, keeping the same studio or street setting' },
    retrato:      { label: 'Retrato',      continues: 'the background at the same depth of field, and the subject\'s surroundings' },
    arquitectura: { label: 'Arquitectura', continues: 'the building upward and the ground downward, keeping straight verticals' },
    paisaje:      { label: 'Paisaje',      continues: 'the sky above and the terrain below, with the same horizon and weather' },
    mascotas:     { label: 'Mascotas',     continues: 'the floor or grass and the surrounding home or park setting' },
    industrial:   { label: 'Industrial',   continues: 'the plant floor, machinery and ceiling structure' },
    marketplace:  { label: 'Marketplace',  continues: 'the plain studio backdrop and the surface below, evenly lit' },
    generico:     { label: 'General',      continues: 'the existing scene naturally in every direction' }
};

const ANALYSIS_SYSTEM = `Eres un director de fotografía. Miras UNA fotografía que hay que ampliar de lienzo (se va a generar el espacio que falta arriba y abajo, o a los lados) para llevarla a formato vertical, sin recortar nada de lo que ya se ve.

Respondes SIEMPRE con un único objeto JSON válido, sin texto alrededor y sin bloques de código:

{
  "photoType": "lifestyle|producto|food|corporativo|evento|deportivo|moda|retrato|arquitectura|paisaje|mascotas|industrial|marketplace|generico",
  "sceneAbove": "EN INGLÉS, qué habría de forma natural por encima del encuadre actual",
  "sceneBelow": "EN INGLÉS, qué habría de forma natural por debajo del encuadre actual",
  "sceneSides": "EN INGLÉS, qué habría a los lados; cadena vacía si no aplica",
  "lighting": "EN INGLÉS, dirección y calidad de la luz",
  "perspective": "EN INGLÉS, altura de cámara y punto de fuga",
  "depthOfField": "EN INGLÉS, si el fondo está enfocado o desenfocado y cuánto",
  "protect": ["EN INGLÉS, lista de los elementos concretos que no pueden cambiar: personas, rostros, logotipos, textos, productos, vehículos"],
  "hasBrand": boolean,
  "hasText": boolean,
  "hasPeople": boolean,
  "warnings": ["en español, qué es delicado al ampliar esta foto"]
}

Reglas:
- "sceneAbove" y "sceneBelow" son lo que MÁS importa: describí la continuación real y plausible de esa escena, no una idea genérica. Si hay cielo, decí qué cielo. Si hay césped, decí qué césped. Si es un salón, decí techo o pared.
- "protect" tiene que nombrar lo que se ve, no categorías: "the Rotary International wheel logo on the banner", "the woman in the red vest", "the text on the tablecloth".
- "warnings" en español: por ejemplo que el sujeto esté cortado por el borde, o que haya texto muy cerca del margen.`;

const parseJsonObject = (result) => {
    const text = result == null ? '' : (typeof result === 'string' ? result : (result.content || ''));
    if (!text) return null;
    const cleaned = text.replace(/```json\s*|```/g, '').trim();
    try { return JSON.parse(cleaned); } catch { /* sigue */ }
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s === -1 || e <= s) return null;
    try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { return null; }
};

const str = (v, max = 220) => typeof v === 'string' ? v.slice(0, max) : '';

export const analyzeForExpansion = async (imageUrl) => {
    try {
        const result = await generateCopy({
            system: ANALYSIS_SYSTEM,
            userText: 'Analiza esta fotografía y devuelve únicamente el JSON.',
            imageUrl,
            temperature: 0.2,
            maxTokens: 800,
            jsonMode: true
        });
        const raw = parseJsonObject(result);
        if (!raw) return fallbackAnalysis('la respuesta no vino en JSON');

        return {
            photoType: PHOTO_TYPES[raw.photoType] ? raw.photoType : 'generico',
            sceneAbove: str(raw.sceneAbove),
            sceneBelow: str(raw.sceneBelow),
            sceneSides: str(raw.sceneSides),
            lighting: str(raw.lighting, 160),
            perspective: str(raw.perspective, 160),
            depthOfField: str(raw.depthOfField, 160),
            protect: Array.isArray(raw.protect)
                ? raw.protect.filter(p => typeof p === 'string').slice(0, 8).map(p => p.slice(0, 160))
                : [],
            hasBrand: raw.hasBrand === true,
            hasText: raw.hasText === true,
            hasPeople: raw.hasPeople === true,
            warnings: Array.isArray(raw.warnings)
                ? raw.warnings.filter(w => typeof w === 'string').slice(0, 4).map(w => w.slice(0, 200))
                : [],
            failed: false,
            // Lo que gastó esta llamada, para el registro de consumo. Va acá
            // porque es el único punto que ve la respuesta cruda del proveedor:
            // más arriba ya está descartada.
            usage: { provider: result.provider, model: result.model, raw: result.raw }
        };
    } catch (e) {
        console.error('[EXPANSION] análisis falló:', e.message);
        return fallbackAnalysis(e.message);
    }
};

// Sin análisis se expande igual, con una descripción genérica. Degrada la
// calidad de la continuación; no impide adaptar la imagen.
const fallbackAnalysis = (reason) => ({
    photoType: 'generico',
    sceneAbove: 'the natural continuation of the scene above the current frame',
    sceneBelow: 'the natural continuation of the surface below the current frame',
    sceneSides: '',
    lighting: 'the same light as the original',
    perspective: 'the same camera height and vanishing point',
    depthOfField: 'the same depth of field',
    protect: [],
    hasBrand: false, hasText: false, hasPeople: false,
    warnings: reason ? [`No se pudo analizar la fotografía antes de ampliarla: ${reason}`] : [],
    failed: true
});

// ─── Prompt ────────────────────────────────────────────────────────────────
//
// Corto y en positivo, igual que en el resto del sitio: se describe lo que se
// conserva y lo que se añade, nunca una lista de prohibiciones. Es literalmente
// la forma de `buildSimplePrompt` del Generador de Publicaciones, que es la que
// ya funciona en producción, más el contexto que aporta el análisis.
export const buildExpansionPrompt = ({ analysis, plan, targetLabel }) => {
    const type = PHOTO_TYPES[analysis.photoType] || PHOTO_TYPES.generico;
    const parts = [];

    // «Extend the canvas», no «Regenerate this photograph» (v4.785). La
    // palabra inicial es la instrucción que más pesa, y «regenerate» invita a
    // REHACER la foto — que es lo contrario del encargo. Con bandas grandes
    // (~25 % de lienzo nuevo) el modelo resolvía «regenerar» duplicando la
    // fotografía entera en el área añadida: el mosaico de v4.317-v4.320,
    // reaparecido por la otra puerta y reportado con captura (la foto del
    // comedor comunitario repetida dos veces en vertical).
    parts.push(
        `Extend the canvas of this photograph to ${targetLabel} aspect ratio, ` +
        (plan.grows === 'vertical'
            ? 'adding new scenery above and below the original image only.'
            : 'adding new scenery to the left and right of the original image only.') +
        ' The photograph itself appears exactly once, untouched, in the middle of the new canvas.'
    );

    // Lo que se conserva. Va segundo porque en un prompt corto lo primero y lo
    // segundo son lo que más pesa.
    parts.push(
        'Everything already visible stays exactly as it is: the same people, the same faces and expressions, the same clothing, the same posture, the same products, packaging, labels, logos, wordmarks, signage and text, the same colours and the same framing of the existing content. Nothing that is already in the photograph moves, changes size, or is redrawn.'
    );

    if (analysis.protect.length) {
        parts.push(`Keep these exactly as they appear: ${analysis.protect.join('; ')}.`);
    }

    // Lo que se añade, con el contexto real de la escena.
    const added = [];
    if (plan.grows === 'vertical') {
        if (analysis.sceneAbove) added.push(`Above, continue with ${analysis.sceneAbove}`);
        if (analysis.sceneBelow) added.push(`Below, continue with ${analysis.sceneBelow}`);
    } else if (analysis.sceneSides) {
        added.push(`On both sides, continue with ${analysis.sceneSides}`);
    }
    if (!added.length) added.push(`Continue ${type.continues}`);
    parts.push(`${added.join('. ')}.`);

    // Continuidad física: es lo que hace que no se vea dónde termina la foto.
    parts.push(
        `The new area is the same scene captured by the same camera with a wider frame: ${analysis.lighting}; ${analysis.perspective}; ${analysis.depthOfField}. ` +
        'Light, shadows, reflections, grain, colour temperature and focus fall-off run continuously across the whole image, with no visible seam or border.'
    );

    // El área nueva es PAISAJE, no protagonistas. Las reglas de expansión del
    // pedido (v4.785): se extiende cielo, suelo, paredes, vegetación y
    // texturas; no se pueblan las bandas con gente, vehículos ni edificios
    // protagonistas que la foto no muestra. Se dice en positivo — qué ES el
    // área nueva — y la lista de exclusiones va al campo negativo.
    parts.push(
        'The added area contains only the continuation of the ground, sky, walls, vegetation and ambient surroundings: it stays quieter and less detailed than the photograph, so the original remains the subject.'
    );
    parts.push('Output a single coherent natural photograph, one continuous scene.');

    return parts.join(' ');
};

// ─── El prompt negativo de la expansión (v4.785) ───────────────────────────
//
// `createKieImageTask` acepta `negativePrompt` desde v4.734 —lo estrenó el
// Motor de Composición de Plantillas IA— y la expansión NUNCA lo usó: cero
// defensa contra el tiling y contra poblar las bandas. Es el mismo criterio
// del sitio: lo prohibido va en su campo, no dentro de la descripción, porque
// inline el modelo se obsesiona con ello y además consume el presupuesto del
// positivo.
//
// La lista ataca los DOS defectos medidos:
//   · el mosaico — la foto repetida dentro de su propio lienzo (la captura
//     del comedor comunitario, y v4.317-v4.320 antes);
//   · las bandas pobladas — gente, caras o vehículos inventados en el área
//     nueva, que después el motor de video anima como si fueran reales.
export const EXPANSION_NEGATIVE_TERMS = [
    'duplicated photo', 'repeated image', 'image tiling', 'mirrored copy',
    'picture-in-picture', 'photo collage', 'split screen', 'stacked copies',
    'second copy of the scene', 'visible seam', 'frame within frame',
    'new people', 'new person', 'human silhouette', 'crowd',
    'new vehicles', 'new buildings', 'invented signage', 'invented text', 'new logos'
];
export const EXPANSION_NEGATIVE_PROMPT = EXPANSION_NEGATIVE_TERMS.join(', ');

// Etiqueta de proporción tal como la entienden las pasarelas.
export const aspectLabelFor = (width, height) => {
    const r = width / height;
    const known = [
        { label: '9:16', v: 9 / 16 }, { label: '3:4', v: 3 / 4 }, { label: '4:5', v: 4 / 5 },
        { label: '1:1', v: 1 }, { label: '4:3', v: 4 / 3 }, { label: '3:2', v: 3 / 2 },
        { label: '16:9', v: 16 / 9 }
    ];
    return known.reduce((best, k) => Math.abs(k.v - r) < Math.abs(best.v - r) ? k : best, known[0]).label;
};

// ─── Ejecución ─────────────────────────────────────────────────────────────

// Lanza la expansión. Devuelve el id de la tarea: la espera la hace quien
// llama, igual que con el video y la música. Un job de imagen tarda 30-60 s y
// la función corta a los 120 s.
export const startExpansion = async ({ imageUrl, prompt, targetWidth, targetHeight, provider = null }) => {
    const chosen = provider && isExpansionProviderAvailable(provider) ? provider : DEFAULT_EXPANSION_PROVIDER;
    if (!isExpansionProviderAvailable(chosen)) {
        const err = new Error('No hay proveedor de expansión disponible. Revisar KIE_API_KEY.');
        err.code = 'NO_EXPANSION_PROVIDER';
        throw err;
    }
    const spec = EXPANSION_PROVIDERS[chosen];

    // El negativo de la expansión (v4.785): anti-tiling y bandas sin
    // protagonistas. Va en su campo, no pegado al positivo — regla del sitio.
    //
    // El REINTENTO SIN el campo vive acá y no en `createKieImageTask` porque el
    // modelo de expansión es configurable por entorno (`EXPANSION_MODEL_*`):
    // con el default (`nano-banana-edit`) el campo está probado en producción
    // desde v4.734 por el Motor de Composición, pero un modelo alternativo
    // puede no declararlo, y KIE rechaza el input entero con «This field is
    // required» sin decir cuál (v4.646). Perder la expansión por el negativo
    // sería perder lo principal por lo accesorio.
    const baseTask = {
        model: spec.model,
        prompt,
        imageUrl,
        aspectRatio: aspectLabelFor(targetWidth, targetHeight),
        // PNG sin pérdida: la imagen va a alimentar a un modelo de video y
        // entrar con artefactos de JPEG es entrar con ruido que el motor
        // amplifica.
        outputFormat: 'png'
    };
    let taskId;
    try {
        taskId = await createKieImageTask({ ...baseTask, negativePrompt: EXPANSION_NEGATIVE_PROMPT });
    } catch (e) {
        console.warn(`[EXPANSION] el modelo ${spec.model} rechazó la tarea con negative_prompt (${e.message}); se reintenta sin él.`);
        taskId = await createKieImageTask(baseTask);
    }

    return { provider: chosen, model: spec.model, taskId };
};

export const pollExpansion = async (taskId) => getKieImageTask(taskId);

export const fetchExpandedImage = async (url) => fetchKieImageBuffer(url);

// ─── Verificación ──────────────────────────────────────────────────────────
//
// La parte que hace honesto al módulo. No se promete preservación: se mide.
//
// CÓMO SE MIDE: la foto original ocupa una región conocida del lienzo nuevo
// (centrada, ocupando todo el ancho si se creció en vertical). Se recorta esa
// región del resultado y se compara contra el original con la misma señal
// determinista que usa el control de fidelidad del Reel: huella perceptual más
// distancia de color. Comparar las imágenes ENTERAS daría una nota baja siempre
// —el lienzo nuevo es contenido nuevo, y debe serlo—, así que la comparación
// tiene que ser sobre la región del original y sólo sobre ella.
export const verifyExpansion = async (originalBuffer, expandedBuffer, plan) => {
    const report = {
        preservation: null, structure: null, colour: null,
        width: null, height: null,
        ok: false, warnings: [], method: 'estructural sobre la región original'
    };

    try {
        const sharp = (await import('sharp')).default;
        const [orig, exp] = await Promise.all([
            sharp(originalBuffer, { failOn: 'none' }).metadata(),
            sharp(expandedBuffer, { failOn: 'none' }).metadata()
        ]);
        report.width = exp.width || null;
        report.height = exp.height || null;

        if (!orig.width || !exp.width) {
            report.warnings.push('No se pudo leer el tamaño de una de las imágenes.');
            return report;
        }

        // Dónde quedó la foto original dentro del lienzo nuevo. El modelo la
        // centra: es lo que se le pide y lo que hacen todos estos motores.
        let region;
        if (plan.grows === 'vertical') {
            const h = Math.round(exp.width * (orig.height / orig.width));
            region = { left: 0, top: Math.max(0, Math.round((exp.height - h) / 2)), width: exp.width, height: Math.min(h, exp.height) };
        } else {
            const w = Math.round(exp.height * (orig.width / orig.height));
            region = { left: Math.max(0, Math.round((exp.width - w) / 2)), top: 0, width: Math.min(w, exp.width), height: exp.height };
        }

        const cropped = await sharp(expandedBuffer, { failOn: 'none' }).extract(region).toBuffer();

        const { structuralCompare } = await import('./reelQuality.js');
        const cmp = await structuralCompare(originalBuffer, cropped);

        report.structure = cmp.structure;
        report.colour = cmp.colour;
        report.preservation = cmp.score;
        report.region = region;
        report.ok = cmp.score != null;

        if (cmp.score == null) report.warnings.push('No se pudo comparar la región original con el resultado.');

        // ── Detección de MOSAICO en el área nueva (v4.785) ──
        //
        // La comprobación de arriba mira SÓLO la región central y responde «¿se
        // conservó la foto?». Con el defecto reportado —la fotografía duplicada
        // en la banda inferior— esa pregunta daba 91 % y el mosaico pasaba
        // invisible: la medición era correcta, la pregunta era incompleta.
        //
        // Acá se mira lo contrario: cada banda AÑADIDA se compara contra la
        // fotografía original. Una banda que se parece mucho al original no es
        // paisaje que continúa — es la foto repetida, y eso es exactamente lo
        // que hay que rehacer. El umbral es alto (0,75 de estructura) porque
        // una banda legítima COMPARTE paleta y grano con la foto: parecerse un
        // poco es continuidad; parecerse tanto es una copia.
        try {
            const bands = [];
            if (plan.grows === 'vertical') {
                if (region.top > 24) {
                    bands.push({ name: 'superior', left: 0, top: 0, width: exp.width, height: region.top });
                }
                const bottomTop = region.top + region.height;
                if (exp.height - bottomTop > 24) {
                    bands.push({ name: 'inferior', left: 0, top: bottomTop, width: exp.width, height: exp.height - bottomTop });
                }
            } else {
                if (region.left > 24) {
                    bands.push({ name: 'izquierda', left: 0, top: 0, width: region.left, height: exp.height });
                }
                const rightLeft = region.left + region.width;
                if (exp.width - rightLeft > 24) {
                    bands.push({ name: 'derecha', left: rightLeft, top: 0, width: exp.width - rightLeft, height: exp.height });
                }
            }

            report.tiling = { checked: bands.length > 0, bands: [], detected: false, empty: false };
            for (const band of bands) {
                const cut = await sharp(expandedBuffer, { failOn: 'none' })
                    .extract({ left: band.left, top: band.top, width: band.width, height: band.height })
                    .toBuffer();
                const sim = await structuralCompare(originalBuffer, cut);
                const duplicated = sim.structure != null && sim.structure >= TILING_STRUCTURE_THRESHOLD;

                // ── ¿La banda tiene CONTENIDO? (v4.793) ──
                //
                // La comprobación de arriba pregunta «¿esta banda repite la
                // foto?». Le faltaba la pregunta opuesta y igual de importante:
                // «¿esta banda tiene algo?». Una franja NEGRA —el modelo
                // rellenando en vez de extender— se parece poquísimo al
                // original, así que pasaba la prueba del mosaico con nota
                // perfecta y la conservación del centro también, porque el
                // centro estaba intacto. Las dos mediciones eran correctas y
                // entre las dos dejaban pasar exactamente el defecto
                // reportado: el clip con bordes negros arriba y abajo.
                //
                // Se mide la desviación típica de la banda. Un relleno plano da
                // prácticamente cero; hasta un cielo despejado o una pared
                // lisa tienen grano y gradiente muy por encima del umbral.
                let detail = null;
                try {
                    const stats = await sharp(cut, { failOn: 'none' }).stats();
                    const canales = (stats.channels || []).slice(0, 3);
                    detail = canales.length
                        ? Number((canales.reduce((a, c) => a + (c.stdev || 0), 0) / canales.length).toFixed(2))
                        : null;
                } catch { /* sin medida no se acusa: `flat` queda en false */ }
                const flat = detail != null && detail < BAND_MIN_DETAIL;

                report.tiling.bands.push({
                    name: band.name,
                    structure: sim.structure,
                    duplicated,
                    detail,
                    flat
                });
                if (duplicated) report.tiling.detected = true;
                if (flat) report.tiling.empty = true;
            }
        } catch (e) {
            // Sin la comprobación de mosaico la verificación principal sigue
            // valiendo; se anota para que «no se comprobó» no se lea como «no
            // hay mosaico».
            report.tiling = { checked: false, bands: [], detected: false, empty: false };
            report.warnings.push(`No se pudo comprobar el área añadida: ${e.message}`);
        }
    } catch (e) {
        report.warnings.push(`No se pudo verificar la expansión: ${e.message}`);
    }

    return report;
};

// Por encima de esta similitud estructural, una banda añadida no es paisaje
// que continúa: es la fotografía repetida. Medido con la huella perceptual
// 16×16 de `reelQuality.js`: dos fotos distintas de la misma escena rondan
// 0,55-0,65; una copia reencuadrada de la misma imagen supera 0,8. El 0,75
// parte esa brecha dejando margen hacia el lado seguro — un falso «mosaico»
// cuesta una regeneración; un mosaico sin detectar cuesta la pieza publicada.
export const TILING_STRUCTURE_THRESHOLD = Number(process.env.EXPANSION_TILING_THRESHOLD) || 0.75;

// Por debajo de esta desviación típica, una banda añadida no es paisaje: es
// relleno plano —una franja negra, el borde que el modelo no extendió—.
//
// Medido sobre bandas sintéticas: un negro puro da **0,00**, un gris plano
// también; el degradado más pobre que se puede llamar cielo da 4,0 y un
// recorte de fotografía real, 10 o más. El umbral va en 2 —en medio de esa
// brecha— y no en 4: pegado al primer contenido real, un cielo despejado o una
// pared lisa se leerían como banda vacía y costarían una regeneración por
// nada. El relleno da cero exacto, así que hacia ese lado sobra margen.
export const BAND_MIN_DETAIL = Number(process.env.EXPANSION_MIN_BAND_DETAIL) || 2;

// Veredicto final: junta la medición con el umbral configurado.
export const judgeExpansion = (verification, settings = EXPANSION_SETTINGS()) => {
    // El mosaico se juzga PRIMERO y reprueba por sí solo (v4.785). Es el orden
    // que importa: una expansión con la foto duplicada en la banda añadida
    // conserva la región central intacta —91 % medido en el caso reportado—,
    // así que el umbral de preservación la daba por BUENA. Preguntar primero
    // por la conservación taparía justamente el defecto que esta comprobación
    // existe para atrapar.
    // La banda VACÍA se juzga junto al mosaico y antes que la conservación, por
    // el mismo motivo: con el centro intacto, la conservación da nota alta y
    // tapa el defecto. Son los dos modos de fallar de una expansión —repetir la
    // foto o no poner nada— y ninguno se ve mirando la región central.
    if (verification.tiling?.empty) {
        const vacias = (verification.tiling.bands || []).filter(b => b.flat).map(b => b.name).join(' y ');
        return {
            verdict: 'failed',
            // Con su CONSECUENCIA, no sólo con el motivo: «banda plana» no le
            // explica a nadie que el Reel va a salir con franjas negras.
            reason: `El área añadida (banda ${vacias}) quedó vacía: el modelo rellenó en vez de extender la fotografía. La escena saldría con franjas negras arriba y abajo en vez de ocupar el formato vertical. Se rehace la adaptación.`
        };
    }
    if (verification.tiling?.detected) {
        const dup = verification.tiling.bands.filter(b => b.duplicated).map(b => b.name).join(' y ');
        return {
            verdict: 'failed',
            reason: `El área añadida (banda ${dup}) repite la fotografía en vez de continuar el paisaje: la pieza se vería con la imagen duplicada. Se rehace la adaptación.`
        };
    }
    if (!verification.ok || verification.preservation == null) {
        return {
            verdict: 'unverified',
            reason: 'La adaptación se hizo pero no se pudo comprobar cuánto se conservó del original.'
        };
    }
    if (verification.preservation < settings.minPreservation) {
        return {
            verdict: 'failed',
            reason: `La adaptación conservó ${Math.round(verification.preservation * 100)} % del original, por debajo del ${Math.round(settings.minPreservation * 100)} % exigido.`
        };
    }
    return {
        verdict: 'ok',
        reason: `Conservación del original: ${Math.round(verification.preservation * 100)} %.`
    };
};
