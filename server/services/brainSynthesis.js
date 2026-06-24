// ─────────────────────────────────────────────────────────────────────────────
// 🧬 BRAIN SYNTHESIS v4.494 — Comprensión documental + Dossier vivo del sitio
//
// Dos capas sobre el cerebro existente (chunks + embeddings para RAG):
//
//   Capa A — analyzeDocument(): cuando un documento termina de procesarse,
//   un LLM genera una FICHA DE COMPRENSIÓN (resumen + análisis estructurado:
//   tipo, temas, entidades, datos clave, acciones, relación con el sitio).
//   Se guarda en BrainDocument.summary / .analysis. Es la prueba visible de
//   que el cerebro "leyó" el adjunto.
//
//   Capa B — regenerateDossier(): fusiona todas las fichas + las secciones del
//   sitio (noticias, proyectos, eventos, conocimiento, notas) en un DOSSIER
//   DEL SITIO: un resumen detallado y vivo que se re-sintetiza cada vez que
//   entra información nueva. Se guarda en Brain.dossier / .dossierMeta.
//
// Genérico para TODOS los sitios — no hay nada hardcodeado por club. Si falta
// GEMINI_API_KEY, ambas capas hacen no-op silencioso (el resto del cerebro
// sigue funcionando igual que antes).
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js';
import { generateText } from './brainAgent.js';

console.log('🧬 BRAIN SYNTHESIS v4.494 — comprensión documental + dossier vivo del sitio 📑');

const DOC_TEXT_BUDGET = 12000;   // chars del documento que mandamos al LLM
const DOSSIER_DOC_LIMIT = 40;    // máx fichas de documento a fusionar
const DOSSIER_MEM_SAMPLE = 8;    // títulos de muestra por tipo de memoria

const hasLLM = () => Boolean(process.env.GEMINI_API_KEY);

// Extrae un objeto JSON del texto del LLM, tolerando ```json fences o prosa
// alrededor. Devuelve null si no hay JSON parseable.
function parseJsonLoose(text) {
    if (!text || typeof text !== 'string') return null;
    let s = text.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    // Recortar al primer { … último }
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    s = s.slice(first, last + 1);
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

const clampStr = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const asArray = (v) => (Array.isArray(v) ? v.filter(x => x != null) : []);

// ─── Capa A — Análisis por archivo ───────────────────────────────────────────

const DOC_ANALYSIS_SYSTEM = [
    'Sos un analista documental institucional. Recibís el texto de un documento',
    'cargado a un sitio web de una organización (club, distrito, fundación, etc.).',
    'Tu trabajo es COMPRENDER el documento y devolver un análisis estructurado en',
    'español, fiel al contenido. No inventes datos: si algo no está, omitilo.',
    '',
    'Respondé EXCLUSIVAMENTE con un objeto JSON válido, sin texto alrededor, con',
    'esta forma exacta:',
    '{',
    '  "summary": "2 a 4 oraciones que resuman de qué trata el documento",',
    '  "docType": "tipo real del documento (reglamento, acta, plan, informe, presentación, etc.)",',
    '  "topics": ["temas principales, 3 a 7"],',
    '  "entities": {',
    '    "people": ["personas mencionadas"],',
    '    "orgs": ["organizaciones / clubes / entidades"],',
    '    "dates": ["fechas o periodos relevantes"],',
    '    "amounts": ["montos, cifras o métricas"],',
    '    "places": ["lugares relevantes"]',
    '  },',
    '  "keyFacts": ["hechos o datos concretos que el sitio debería recordar, 3 a 8"],',
    '  "actionItems": ["compromisos, tareas o próximos pasos si los hay"],',
    '  "relationToSite": "1 a 2 oraciones: cómo este documento aporta al sitio"',
    '}',
].join('\n');

// Analiza un documento ya procesado y persiste summary + analysis.
// `fullText` es el texto ya extraído (evita re-descargar/re-extraer).
export async function analyzeDocument({ documentId, fullText }) {
    if (!hasLLM()) return { ok: false, skipped: 'no-llm' };

    const doc = await prisma.brainDocument.findUnique({ where: { id: documentId } });
    if (!doc) return { ok: false, error: 'document not found' };

    const text = (fullText || '').trim();
    if (!text) return { ok: false, error: 'empty text' };

    const userMessage = [
        `Documento: "${doc.filename}"`,
        doc.category ? `Categoría declarada: ${doc.category}` : null,
        doc.description ? `Descripción del autor: ${doc.description}` : null,
        '',
        '── Texto del documento ──',
        text.slice(0, DOC_TEXT_BUDGET),
    ].filter(Boolean).join('\n');

    let raw = '';
    try {
        raw = await generateText({
            systemPrompt: DOC_ANALYSIS_SYSTEM,
            userMessage,
            temperature: 0.3,
            maxOutputTokens: 1536,
        });
    } catch (err) {
        console.warn('[brainSynthesis] analyzeDocument LLM error:', err.message);
        return { ok: false, error: err.message };
    }

    const parsed = parseJsonLoose(raw);
    if (!parsed) {
        console.warn('[brainSynthesis] analyzeDocument: JSON no parseable para', documentId);
        return { ok: false, error: 'unparseable analysis' };
    }

    const ent = parsed.entities && typeof parsed.entities === 'object' ? parsed.entities : {};
    const analysis = {
        docType: clampStr(parsed.docType, 120),
        topics: asArray(parsed.topics).map(t => clampStr(String(t), 160)).slice(0, 12),
        entities: {
            people: asArray(ent.people).map(x => clampStr(String(x), 120)).slice(0, 30),
            orgs: asArray(ent.orgs).map(x => clampStr(String(x), 120)).slice(0, 30),
            dates: asArray(ent.dates).map(x => clampStr(String(x), 80)).slice(0, 30),
            amounts: asArray(ent.amounts).map(x => clampStr(String(x), 80)).slice(0, 30),
            places: asArray(ent.places).map(x => clampStr(String(x), 120)).slice(0, 30),
        },
        keyFacts: asArray(parsed.keyFacts).map(x => clampStr(String(x), 400)).slice(0, 12),
        actionItems: asArray(parsed.actionItems).map(x => clampStr(String(x), 400)).slice(0, 12),
        relationToSite: clampStr(parsed.relationToSite, 600),
        model: 'gemini',
        generatedAt: new Date().toISOString(),
    };
    const summary = clampStr(parsed.summary, 1200);

    await prisma.brainDocument.update({
        where: { id: documentId },
        data: { summary, analysis, analyzedAt: new Date() },
    }).catch(err => console.warn('[brainSynthesis] persist analysis:', err.message));

    return { ok: true, summary, analysis };
}

// ─── Capa B — Dossier vivo del sitio ─────────────────────────────────────────

const DOSSIER_SYSTEM = [
    'Sos el redactor del DOSSIER INSTITUCIONAL de un sitio web de una organización.',
    'Recibís: la identidad del sitio, las fichas de comprensión de sus documentos',
    'cargados, y una muestra de las secciones que el sitio ya publicó (noticias,',
    'proyectos, eventos, conocimiento, notas). Tu trabajo es FUSIONAR todo en un',
    'único dossier detallado, coherente y vivo, en español.',
    '',
    'El dossier debe demostrar que el cerebro entiende a la organización: qué es,',
    'qué hace, sus líneas de acción, su gente, sus cifras, sus próximas actividades',
    'y qué información institucional aún falta cargar.',
    '',
    'Respondé EXCLUSIVAMENTE con un objeto JSON válido con esta forma:',
    '{',
    '  "dossier": "documento en Markdown con secciones (## Identidad, ## Qué hace,',
    '              ## Documentos analizados, ## Líneas de acción, ## Datos clave,',
    '              ## Próximas actividades). Detallado pero sin inventar.",',
    '  "highlights": ["3 a 6 puntos clave que definen a la organización"],',
    '  "gaps": ["información institucional que falta cargar para completar el cerebro"],',
    '  "completeness": 0',
    '}',
    'completeness es un entero 0-100: qué tan completo está el perfil institucional',
    'según la información disponible. No inventes hechos que no estén en el material.',
].join('\n');

// Construye el bloque de contexto (fichas de documentos + muestra de memorias).
async function buildDossierContext(brain) {
    const docs = await prisma.brainDocument.findMany({
        where: { brainId: brain.id, summary: { not: null } },
        orderBy: { processedAt: 'desc' },
        take: DOSSIER_DOC_LIMIT,
        select: { filename: true, category: true, summary: true, analysis: true },
    }).catch(() => []);

    const docBlocks = docs.map((d, i) => {
        const a = d.analysis && typeof d.analysis === 'object' ? d.analysis : {};
        const facts = asArray(a.keyFacts).slice(0, 5);
        return [
            `Documento ${i + 1}: "${d.filename}"${d.category ? ` (${d.category})` : ''}`,
            `  Resumen: ${d.summary}`,
            facts.length ? `  Datos clave: ${facts.join(' · ')}` : null,
            a.relationToSite ? `  Aporte: ${a.relationToSite}` : null,
        ].filter(Boolean).join('\n');
    });

    // Muestra de memorias por tipo (secciones del sitio). Excluimos DOCUMENT
    // (ya cubierto por las fichas) y el propio DOSSIER.
    const memories = await prisma.brainMemory.findMany({
        where: { brainId: brain.id, kind: { notIn: ['DOCUMENT', 'DOSSIER'] } },
        orderBy: { createdAt: 'desc' },
        take: 400,
        select: { kind: true, title: true },
    }).catch(() => []);

    const byKind = {};
    for (const m of memories) {
        (byKind[m.kind] = byKind[m.kind] || []).push(m.title);
    }
    const memBlocks = Object.entries(byKind).map(([kind, titles]) => {
        const sample = titles.slice(0, DOSSIER_MEM_SAMPLE).map(t => `  · ${t}`).join('\n');
        return `${kind} (${titles.length}):\n${sample}`;
    });

    return {
        docCount: docs.length,
        memCount: memories.length,
        text: [
            `Identidad declarada: ${brain.identityPrompt || `Cerebro de "${brain.name}".`}`,
            '',
            docBlocks.length ? `── Fichas de documentos analizados (${docs.length}) ──\n${docBlocks.join('\n\n')}` : '── Sin documentos analizados todavía ──',
            '',
            memBlocks.length ? `── Secciones publicadas del sitio ──\n${memBlocks.join('\n')}` : '── Sin contenido publicado todavía ──',
        ].join('\n'),
    };
}

// Lock en memoria por brain para evitar regeneraciones concurrentes (varios
// documentos terminando casi a la vez). El último gana: si llega un pedido
// mientras corre, se marca pendiente y se re-corre una vez al terminar.
const _dossierRunning = new Set();
const _dossierPending = new Set();

export async function regenerateDossier(brainId, { reason = 'update' } = {}) {
    if (!hasLLM()) return { ok: false, skipped: 'no-llm' };
    if (_dossierRunning.has(brainId)) {
        _dossierPending.add(brainId);
        return { ok: false, queued: true };
    }
    _dossierRunning.add(brainId);
    try {
        const brain = await prisma.brain.findUnique({ where: { id: brainId } });
        if (!brain) return { ok: false, error: 'brain not found' };

        const ctx = await buildDossierContext(brain);
        if (ctx.docCount === 0 && ctx.memCount === 0) {
            return { ok: false, skipped: 'empty-brain' };
        }

        let raw = '';
        try {
            raw = await generateText({
                systemPrompt: DOSSIER_SYSTEM,
                userMessage: `Organización: "${brain.name}"\n\n${ctx.text}`,
                temperature: 0.4,
                maxOutputTokens: 2560,
            });
        } catch (err) {
            console.warn('[brainSynthesis] dossier LLM error:', err.message);
            return { ok: false, error: err.message };
        }

        const parsed = parseJsonLoose(raw);
        if (!parsed || !parsed.dossier) {
            console.warn('[brainSynthesis] dossier: JSON no parseable para', brainId);
            return { ok: false, error: 'unparseable dossier' };
        }

        const dossier = clampStr(parsed.dossier, 12000);
        const dossierMeta = {
            highlights: asArray(parsed.highlights).map(x => clampStr(String(x), 300)).slice(0, 8),
            gaps: asArray(parsed.gaps).map(x => clampStr(String(x), 300)).slice(0, 10),
            completeness: Math.max(0, Math.min(100, Math.round(Number(parsed.completeness) || 0))),
            docCount: ctx.docCount,
            sectionCount: ctx.memCount,
            reason,
            model: 'gemini',
        };

        await prisma.brain.update({
            where: { id: brainId },
            data: { dossier, dossierMeta, dossierUpdatedAt: new Date() },
        });

        // Log de actividad (best effort) — visible en el feed "Actividad".
        await prisma.brainActivity.create({
            data: {
                brainId,
                kind: 'dossier_generated',
                title: 'Dossier del sitio actualizado',
                detail: `${ctx.docCount} documentos · ${ctx.memCount} secciones · ${dossierMeta.completeness}% completitud`,
                metadata: { reason, completeness: dossierMeta.completeness },
            },
        }).catch(() => {});

        return { ok: true, dossier, dossierMeta };
    } catch (err) {
        console.error('[brainSynthesis] regenerateDossier fatal:', err.message);
        return { ok: false, error: err.message };
    } finally {
        _dossierRunning.delete(brainId);
        if (_dossierPending.has(brainId)) {
            _dossierPending.delete(brainId);
            // Re-correr una vez para incorporar lo que llegó mientras corría.
            regenerateDossier(brainId, { reason: 'coalesced' }).catch(() => {});
        }
    }
}

// Fire-and-forget: lo llaman los flujos de ingesta sin bloquear la respuesta.
export function regenerateDossierSafe(brainId, opts) {
    return regenerateDossier(brainId, opts).catch(err =>
        console.warn('[brainSynthesis] regenerateDossierSafe:', err.message)
    );
}
