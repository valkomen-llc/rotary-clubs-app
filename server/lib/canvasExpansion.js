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
    // Cuánto puede crecer el lienzo. Una foto muy apaisada llevada a 9:16
    // necesita generar más del triple de su altura, y ahí ningún modelo
    // sostiene la coherencia: se avisa y se deja de expandir.
    maxGrowth: numberEnv('EXPANSION_MAX_GROWTH', 3.2, 1.1, 8),
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
            failed: false
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

    parts.push(
        `Regenerate this photograph in higher quality and convert it to ${targetLabel} aspect ratio, ` +
        (plan.grows === 'vertical'
            ? 'extending the scene upward and downward to fill the taller frame.'
            : 'extending the scene to the left and right to fill the wider frame.')
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

    parts.push('Output a single coherent natural photograph.');

    return parts.join(' ');
};

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

    const taskId = await createKieImageTask({
        model: spec.model,
        prompt,
        imageUrl,
        aspectRatio: aspectLabelFor(targetWidth, targetHeight),
        // PNG sin pérdida: la imagen va a alimentar a un modelo de video y
        // entrar con artefactos de JPEG es entrar con ruido que el motor
        // amplifica.
        outputFormat: 'png'
    });

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
    } catch (e) {
        report.warnings.push(`No se pudo verificar la expansión: ${e.message}`);
    }

    return report;
};

// Veredicto final: junta la medición con el umbral configurado.
export const judgeExpansion = (verification, settings = EXPANSION_SETTINGS()) => {
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
