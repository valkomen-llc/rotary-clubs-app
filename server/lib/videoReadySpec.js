/**
 * Video Listo para Publicar — Especificación y Reglas de Negocio
 * ==============================================================
 *
 * Funciones puras para validación, construcción de prompts, limpieza
 * de copys según Regla 10 (sin muletillas repetitivas de Distrito 4281)
 * y filtros de audio para ducking inteligente en FFmpeg.
 */

/**
 * Limpia y normaliza el copy generado por IA para asegurar cumplimiento estricto
 * de la Regla 10 de comunicación del Distrito 4281:
 * - Elimina encabezados mecánicos como "Rotary Distrito 4281.", "Rotary Distrito 4281:", etc.
 * - Elimina coletillas finales redundantes.
 * - Conserva el mensaje de impacto, servicio y llamado a la acción.
 */
export function cleanVideoReadyCopy(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();

    // Eliminar prefijos repetitivos al inicio
    cleaned = cleaned.replace(/^(Rotary\s+Distrito\s+4281[\s.:\-–—]*)/i, '').trim();

    // Eliminar coletillas repetitivas al final
    cleaned = cleaned.replace(/([\s.:\-–—]*Rotary\s+Distrito\s+4281[.]?)$/i, '').trim();

    // Asegurar mayúscula inicial tras limpiar el prefijo
    if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned;
}

/**
 * Construye el prompt para la IA que genera el copy de la publicación,
 * incorporando la Regla 10 y restricciones de no-alucinación.
 */
export function buildVideoReadyCopyPrompt({
    analysis = {},
    additionalContext = '',
    action = 'generate',
    previousCopy = '',
    institutionalVoice = ''
} = {}) {
    let modifierInstruction = '';
    if (action === 'shorter') {
        modifierInstruction = 'Tono más breve: haz el texto significativamente más corto y conciso (1-2 oraciones directas).';
    } else if (action === 'emotional') {
        modifierInstruction = 'Tono más emotivo: destaca el calor humano, la empatía y la solidaridad transformadora.';
    } else if (action === 'institutional') {
        modifierInstruction = 'Tono más institucional: formal, protocolario y enfocado en liderazgo cívico.';
    }

    const systemPrompt = `${institutionalVoice || 'Voz Oficial Rotary Distrito 4281'}

REGLA FUNDAMENTAL DE COMUNICACIÓN (REGLA 10):
Como las publicaciones se realizan desde las cuentas oficiales del Distrito en redes sociales, NO repitas mecánicamente frases como "Rotary Distrito 4281..." ni al inicio ni al final de cada copy.
Prioriza siempre mensajes orientados a:
- servicio,
- impacto,
- comunidad,
- solidaridad,
- liderazgo,
- acción,
- voluntariado,
- transformación social.

Solo menciona el Distrito cuando sea estrictamente indispensable como dato contextual.
PROHIBIDO inventar nombres de personas, lugares, fechas, cifras o clubes que no provengan del video o del contexto suministrado.

Devuelve SIEMPRE un JSON válido con esta estructura:
{
  "copy": "Texto redactado para la publicación con 1-3 emojis pertinentes y llamado a la acción",
  "hashtags": ["#GenteDeAccion", "#ServicioComunitario", "#ImpactoRotario"],
  "notes": ["Breve justificación de las decisiones editoriales tomadas"]
}`;

    const userPrompt = `Redacta el texto de publicación para este video:
- Resumen del contenido: "${analysis.summary || 'Acción de servicio comunitario'}"
- Temática detectada: "${analysis.topic || 'Servicio'}"
${analysis.transcript ? `- Frases o diálogos presentes en el video: "${analysis.transcript}"` : ''}
${additionalContext ? `- Contexto suministrado por el organizador: "${additionalContext}"` : ''}
${previousCopy ? `- Texto anterior que se desea mejorar: "${previousCopy}"` : ''}
${modifierInstruction ? `- Instrucción de ajuste: ${modifierInstruction}` : ''}`;

    return `${systemPrompt}\n\n---\n\n${userPrompt}`;
}

/**
 * Genera la cadena de filtros de FFmpeg para mezclar audio principal con música
 * aplicando atenuación automática (ducking) cuando hay diálogo o voz presente.
 */
export function buildAudioDuckingFiltergraph({ hasSpeech = true } = {}) {
    if (!hasSpeech) {
        // Sin voz: mezcla balanceada simple
        return '[0:a]volume=1.0[a0];[2:a]volume=0.25[a2];[a0][a2]amix=inputs=2:duration=first:dropout_transition=2[aout]';
    }

    // Con voz: sidechaincompress para ducking automático
    // La música (input 2) se comprime cuando el audio del video (input 0) supera el umbral
    return '[0:a]asplit=2[voice_main][voice_side];' +
           '[2:a]volume=0.35[music_base];' +
           '[music_base][voice_side]sidechaincompress=threshold=0.08:ratio=6:attack=20:release=300:makeup=1[ducked_music];' +
           '[voice_main][ducked_music]amix=inputs=2:duration=first:dropout_transition=2[aout]';
}
