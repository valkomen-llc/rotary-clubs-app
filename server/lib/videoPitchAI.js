// ════════════════════════════════════════════════════════════════════
// Rotary Video Pitch AI — guiones audiovisuales a partir de hechos (v4.1293.0)
//
// Transforma la información REAL de un proyecto (la solicitud, la postulación
// y la Formulación) en un guion de cinco escenas. Usa la IA que ya tiene la
// plataforma (`generateCopy`: Gemini, OpenAI o Anthropic, con respaldo entre
// ellos). No instala ningún proveedor nuevo.
//
// ⚠️ EL AGENTE NO INVENTA. El prompt le entrega un EXPEDIENTE con lo que el club
// escribió y le prohíbe afirmar beneficiarios, presupuesto, donantes,
// resultados, aprobaciones, financiación, testimonios o datos de la comunidad
// que no estén ahí. Lo que falte lo tiene que decir en `missingInfo`, y lo que
// se espera lograr lo tiene que escribir como ESPERADO, no como logrado.
//
// La verificación es de dos capas: el prompt (lo pide) y `auditScript` (lo
// comprueba): cada número del guion tiene que aparecer en el expediente.
// ════════════════════════════════════════════════════════════════════
import { generateCopy } from '../services/copywritingService.js';
import {
    SCENE_PLAN, sceneDurations, clampTargetSeconds, normalizeScript, GUIDED_QUESTIONS, languageLabel, objectiveLabel,
    TONES, LANGUAGES,
} from './videoPitchSpec.js';

const clean = (v, max = 4000) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * El EXPEDIENTE: todo lo que el agente puede afirmar, en texto plano y con su
 * fuente. Es lo único que entra al prompt como hechos.
 */
export const buildDossier = ({ request, submission, masterAnswers = null, files = [], edition = null }) => {
    const a = request?.answers || {};
    const id = a.identification || {};
    const st = a.story || {};
    const pr = a.preferences || {};
    const m = masterAnswers || {};
    const get = (s, f) => clean(m?.[s]?.[f]);
    const lines = [];
    const push = (label, value, source) => { const v = clean(value); if (v) lines.push(`- ${label} [${source}]: ${v}`); };

    push('Proyecto', submission?.projectName, 'postulación');
    push('Club rotario', submission?.clubName, 'postulación');
    push('Distrito', submission?.district, 'postulación');
    push('Área de interés de Rotary', submission?.focusAreaLabel, 'postulación');
    push('Descripción en la postulación', submission?.projectDescription, 'postulación');
    if (submission?.budgetUsd) push('Presupuesto declarado (USD)', Number(submission.budgetUsd).toLocaleString('en-US'), 'postulación');
    push('Edición de la Feria', edition?.name, 'edición');

    push('Lo que el club cuenta del proyecto', st.description, 'solicitud');
    for (const q of GUIDED_QUESTIONS) push(q.label, st[q.key], 'solicitud');
    push('Objetivo principal del video', objectiveLabel(pr.objective) + (pr.objective === 'other' && pr.objectiveOther ? ` (${pr.objectiveOther})` : ''), 'solicitud');
    push('Observaciones para producción', pr.notes, 'solicitud');
    push('Contacto', [id.responsibleName, id.email, id.whatsapp].filter(Boolean).join(' · '), 'solicitud');

    push('Objetivo general', get('objetivos', 'generalObjective'), 'Formulación');
    push('Descripción del proyecto', get('objetivos', 'projectDescription'), 'Formulación');
    push('Necesidades', get('necesidades', 'needs'), 'Formulación');
    push('Atención de necesidades', get('necesidades', 'needsResponse'), 'Formulación');
    push('Beneficiarios', get('necesidades', 'beneficiaries'), 'Formulación');
    push('Número de beneficiarios', get('necesidades', 'beneficiariesCount'), 'Formulación');
    push('Sostenibilidad', get('sostenibilidad', 'sustainability'), 'Formulación');
    push('Participación de la comunidad', get('sostenibilidad', 'communityRole'), 'Formulación');
    push('Ciudad', get('identificacion', 'city'), 'Formulación');
    const budget = m?.presupuesto?.budgetTable;
    const cost = budget && typeof budget === 'object' ? (budget.projectCost || budget.rows?.projectCost) : null;
    if (cost && typeof cost === 'object') push('Costo del proyecto', [cost.pesos ? `${cost.pesos} COP` : '', cost.usd ? `${cost.usd} USD` : ''].filter(Boolean).join(' / '), 'Formulación');

    const materials = (files || []).filter(f => f.role === 'material' && !f.deletedAt).map(f => ({
        id: f.id, kind: f.kind, fileName: f.fileName, caption: clean(f.caption, 200),
        width: f.width || null, height: f.height || null, durationSec: f.durationSec ? Number(f.durationSec) : null,
    }));

    return { lines, text: lines.join('\n'), materials };
};

const SYSTEM_PROMPT = `Eres Rotary Video Pitch AI, guionista de videos de presentación de proyectos comunitarios de clubes rotarios de Colombia. Tu trabajo: convertir el EXPEDIENTE de un proyecto en un guion audiovisual de cinco escenas para movilizar apoyo de donantes internacionales, clubes patrocinadores, distritos, fundaciones y aliados.

REGLAS INQUEBRANTABLES
1. Sólo puedes afirmar lo que está en el EXPEDIENTE. No inventes número de beneficiarios, presupuesto, donantes, resultados obtenidos, aprobaciones de Rotary, financiación concedida, testimonios ni datos de la comunidad.
2. Distingue siempre entre lo ESPERADO («se espera», «busca», «permitirá») y lo ya LOGRADO. Si el expediente no dice que algo se logró, es esperado.
3. Si falta información importante para una escena (por ejemplo, cuántas personas se beneficiarán o cuánto se necesita), NO la rellenes: escribe la narración sin ese dato y anótalo en "missingInfo".
4. Usa únicamente los materiales listados en MATERIALES (por su id). No describas imágenes que no existen como si estuvieran disponibles; si falta material para una escena, dilo en "visual" como recomendación de grabación.
5. Tono: inspirador, profesional, humano y verificable. Sin dramatismo excesivo ni promesas imposibles de garantizar. No sugieras que Rotary International respalda o aprobó el proyecto.
6. La narración de cada escena debe caber en su duración a unas 140 palabras por minuto.
7. Escribe en el idioma pedido. Si el pedido incluye subtítulos, escribe la narración en el idioma hablado.

FORMATO: responde SOLO con JSON válido, sin texto alrededor, con esta forma exacta:
{"title":"string","summary":"string","scenes":[{"number":1,"title":"string","durationSec":number,"narration":"string","visual":"string","materials":["id"],"onScreenText":"string","notes":"string"}],"missingInfo":["string"]}`;

const narrationLanguage = (language) => (language === 'en' || language === 'en_sub_es' ? 'inglés' : 'español');

export const buildUserPrompt = ({ dossier, language, tone, targetSeconds, instructions, previousScript = null, onlyScene = null }) => {
    const durations = sceneDurations(targetSeconds);
    const plan = SCENE_PLAN.map((s, i) => `Escena ${s.number} — ${s.title} (${durations[i]} s): ${s.goal}`).join('\n');
    const mats = dossier.materials.length
        ? dossier.materials.map(f => `- id ${f.id}: ${f.kind === 'video' ? 'VIDEO' : f.kind === 'image' ? 'FOTO' : 'DOCUMENTO'} «${f.fileName}»${f.width && f.height ? ` ${f.width}×${f.height}` : ''}${f.durationSec ? ` ${Math.round(f.durationSec)} s` : ''}${f.caption ? ` — ${f.caption}` : ''}`).join('\n')
        : '(El club todavía no adjuntó materiales: recomienda qué grabar o fotografiar en "visual".)';
    const toneLabel = TONES.find(t => t.key === tone)?.label || TONES[0].label;
    const langLabel = languageLabel(language) || LANGUAGES[0].label;
    const parts = [
        `EXPEDIENTE DEL PROYECTO\n${dossier.text || '(vacío)'}`,
        `MATERIALES DISPONIBLES\n${mats}`,
        `PARÁMETROS\n- Idioma del video: ${langLabel} (narración en ${narrationLanguage(language)})\n- Duración objetivo: ${clampTargetSeconds(targetSeconds)} segundos (máximo 180)\n- Tono: ${toneLabel}`,
        `ESTRUCTURA\n${plan}`,
    ];
    if (instructions) parts.push(`INSTRUCCIONES DEL COMITÉ\n${clean(instructions, 2000)}`);
    if (previousScript && onlyScene) {
        parts.push(`GUION ACTUAL (JSON)\n${JSON.stringify(previousScript)}`);
        parts.push(`TAREA: Vuelve a escribir ÚNICAMENTE la escena ${onlyScene}. Devuelve el JSON completo con las otras escenas EXACTAMENTE como están y la escena ${onlyScene} nueva.`);
    } else if (previousScript) {
        parts.push(`GUION ANTERIOR (JSON), para mejorarlo sin repetirlo\n${JSON.stringify(previousScript)}`);
    }
    return parts.join('\n\n');
};

/** Extrae el JSON aunque el modelo lo haya envuelto en texto o en un bloque. */
export const parseModelJson = (text) => {
    const raw = String(text || '').trim();
    try { return JSON.parse(raw); } catch { /* sigue */ }
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* sigue */ } }
    const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* sigue */ } }
    return null;
};

/**
 * La segunda capa: cada NÚMERO que aparece en el guion tiene que existir en el
 * expediente. Los números de escena, duraciones y años plausibles del video
 * no cuentan. Devuelve las cifras sospechosas; no bloquea, señala.
 */
export const auditScript = (script, dossier) => {
    const corpus = String(dossier?.text || '').replace(/[.,]/g, '');
    const corpusNums = new Set((corpus.match(/\d+/g) || []).map(n => n.replace(/^0+/, '') || '0'));
    const suspicious = [];
    for (const s of script?.scenes || []) {
        const text = `${s.narration} ${s.onScreenText}`.replace(/[.,](?=\d{3})/g, '');
        for (const n of text.match(/\d+/g) || []) {
            const norm = n.replace(/^0+/, '') || '0';
            if (Number(norm) <= 12) continue;                 // escenas, horas, meses
            if (/^(19|20)\d{2}$/.test(norm)) continue;         // años
            if (corpusNums.has(norm)) continue;
            suspicious.push({ scene: s.number, value: n });
        }
    }
    return { ok: suspicious.length === 0, suspicious };
};

/**
 * Genera (o regenera una escena de) un guion. Devuelve el guion normalizado,
 * el proveedor y el modelo que respondieron, y la auditoría de cifras.
 */
export const generateVideoPitchScript = async ({
    dossier, language = 'es', tone = 'inspiring', targetSeconds = 150, instructions = '',
    previousScript = null, onlyScene = null, provider = undefined,
}) => {
    const userText = buildUserPrompt({ dossier, language, tone, targetSeconds, instructions, previousScript, onlyScene });
    const fileIds = dossier.materials.map(f => f.id);
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        const result = await generateCopy({
            provider: provider || undefined,
            system: SYSTEM_PROMPT,
            userText: attempt === 0 ? userText : `${userText}\n\nLA RESPUESTA ANTERIOR NO FUE JSON VÁLIDO O FALTABAN ESCENAS. Responde SOLO con el JSON pedido, con las cinco escenas.`,
            jsonMode: true,
            temperature: 0.55,
            maxTokens: 3200,
        });
        const parsed = parseModelJson(result?.content || result?.text);
        if (!parsed) { lastError = 'El modelo no devolvió un JSON legible.'; continue; }
        const merged = previousScript && onlyScene
            ? { ...previousScript, scenes: (previousScript.scenes || []).map(s => (Number(s.number) === Number(onlyScene) ? (parsed.scenes || []).find(x => Number(x.number) === Number(onlyScene)) || s : s)), missingInfo: parsed.missingInfo || previousScript.missingInfo }
            : parsed;
        const norm = normalizeScript(merged, { targetSeconds, fileIds });
        if (!norm.ok) { lastError = norm.problems.join(' '); continue; }
        return {
            script: norm.script,
            provider: result?.provider || null,
            model: result?.model || null,
            audit: auditScript(norm.script, dossier),
        };
    }
    throw new Error(lastError || 'No fue posible generar el guion.');
};

export default { buildDossier, buildUserPrompt, parseModelJson, auditScript, generateVideoPitchScript, SYSTEM_PROMPT };
