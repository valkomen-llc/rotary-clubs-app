// ─────────────────────────────────────────────────────────────────────────────
// 📄 DOCUMENT PROCESSOR v4.353 — Carga documental para el Cerebro
//
// Toma un BrainDocument recién creado, extrae el texto del binario (PDF/DOCX/
// TXT/MD), lo trocea en chunks semánticos y dispara ingestMemory por cada
// chunk para que se embedee y se persista como BrainMemory.
//
// El procesamiento es resiliente: si un chunk individual falla por timeout o
// quota de Gemini, se sigue con los demás y se reporta en errorMessage. El
// status del documento queda 'completed' si al menos un chunk se ingestó;
// 'failed' solo si no hubo extracción de texto o ningún chunk pasó.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js';
import { ingestMemory } from './brainService.js';
import { analyzeDocument, regenerateDossierSafe } from './brainSynthesis.js';

console.log('📄 DOCUMENT PROCESSOR v4.494 — carga documental + comprensión (ficha + dossier) para cerebros online 📚🧬');

const MAX_CHUNK_CHARS = 1500; // ~375 tokens, dentro del límite de Gemini embed
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS_PER_DOC = 200; // safety guard: docs muy grandes se truncan

// ─── Extracción de texto ─────────────────────────────────────────────────────

export async function extractText({ buffer, mimeType, filename }) {
    const ext = (filename || '').toLowerCase().split('.').pop();
    const mime = (mimeType || '').toLowerCase();

    // PDF
    if (mime.includes('pdf') || ext === 'pdf') {
        try {
            // pdf-parse v2 expone default export.
            const pdfParseModule = await import('pdf-parse');
            const pdfParse = pdfParseModule.default || pdfParseModule;
            const result = await pdfParse(buffer);
            return result?.text || '';
        } catch (err) {
            throw new Error(`PDF extraction failed: ${err.message}`);
        }
    }

    // DOCX
    if (mime.includes('openxmlformats-officedocument.wordprocessingml') || ext === 'docx') {
        try {
            const mammothModule = await import('mammoth');
            const mammoth = mammothModule.default || mammothModule;
            const result = await mammoth.extractRawText({ buffer });
            return result?.value || '';
        } catch (err) {
            throw new Error(`DOCX extraction failed: ${err.message}`);
        }
    }

    // Word legacy .doc — no soportado por mammoth de forma robusta.
    if (mime === 'application/msword' || ext === 'doc') {
        throw new Error('Formato .doc legacy no soportado. Convertí el archivo a .docx o PDF.');
    }

    // TXT / MD / cualquier text/*
    if (mime.startsWith('text/') || ['txt', 'md', 'markdown', 'rtf'].includes(ext)) {
        return buffer.toString('utf-8');
    }

    throw new Error(`Tipo de archivo no soportado: mime=${mime} ext=${ext}`);
}

// ─── Chunking semántico ──────────────────────────────────────────────────────
// Estrategia: dividir por párrafos (\n\n), acumular hasta MAX_CHUNK_CHARS. Si
// un párrafo individual excede el límite, se trocea por oraciones. Overlap de
// CHUNK_OVERLAP entre chunks consecutivos para preservar contexto.

export function chunkText(rawText, { maxChars = MAX_CHUNK_CHARS, overlap = CHUNK_OVERLAP } = {}) {
    if (!rawText || typeof rawText !== 'string') return [];

    // Normalizar whitespace + colapsar múltiples newlines
    const text = rawText
        .replace(/\r\n/g, '\n')
        .replace(/ /g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (text.length === 0) return [];
    if (text.length <= maxChars) return [text];

    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    const chunks = [];
    let current = '';

    const flush = () => {
        if (current.trim().length > 0) {
            chunks.push(current.trim());
        }
        current = '';
    };

    for (const para of paragraphs) {
        // Caso 1: el párrafo solo es más grande que maxChars → trocear por oraciones
        if (para.length > maxChars) {
            flush();
            const sentences = para.split(/(?<=[.!?])\s+/);
            let buf = '';
            for (const s of sentences) {
                if ((buf + ' ' + s).length > maxChars && buf.length > 0) {
                    chunks.push(buf.trim());
                    buf = s;
                } else {
                    buf = buf ? `${buf} ${s}` : s;
                }
            }
            if (buf.trim()) chunks.push(buf.trim());
            continue;
        }

        // Caso 2: agregar el párrafo al chunk actual si entra
        if ((current + '\n\n' + para).length > maxChars && current.length > 0) {
            flush();
            current = para;
        } else {
            current = current ? `${current}\n\n${para}` : para;
        }
    }
    flush();

    // Aplicar overlap: cada chunk empieza con las últimas N chars del anterior
    if (overlap > 0 && chunks.length > 1) {
        const withOverlap = [chunks[0]];
        for (let i = 1; i < chunks.length; i++) {
            const prevTail = chunks[i - 1].slice(-overlap);
            withOverlap.push(`${prevTail}\n\n${chunks[i]}`);
        }
        return withOverlap.slice(0, MAX_CHUNKS_PER_DOC);
    }

    return chunks.slice(0, MAX_CHUNKS_PER_DOC);
}

// ─── Procesamiento end-to-end ────────────────────────────────────────────────

export async function processDocument({ documentId, buffer }) {
    const doc = await prisma.brainDocument.findUnique({
        where: { id: documentId },
        include: { brain: true },
    });
    if (!doc) {
        console.warn(`[documentProcessor] doc ${documentId} not found`);
        return { ok: false, error: 'document not found' };
    }

    await prisma.brainDocument.update({
        where: { id: documentId },
        data: { status: 'processing', errorMessage: null },
    });

    try {
        // 1. Extraer texto
        const rawText = await extractText({
            buffer,
            mimeType: doc.mimeType,
            filename: doc.filename,
        });

        if (!rawText || rawText.trim().length === 0) {
            await prisma.brainDocument.update({
                where: { id: documentId },
                data: {
                    status: 'failed',
                    errorMessage: 'No se pudo extraer texto del documento. Puede ser un PDF escaneado sin OCR.',
                    processedAt: new Date(),
                },
            });
            return { ok: false, error: 'empty text' };
        }

        // 2. Chunkear
        const chunks = chunkText(rawText);
        const charCount = rawText.length;

        if (chunks.length === 0) {
            await prisma.brainDocument.update({
                where: { id: documentId },
                data: {
                    status: 'failed',
                    errorMessage: 'No se generaron chunks procesables.',
                    processedAt: new Date(),
                },
            });
            return { ok: false, error: 'no chunks' };
        }

        // 3. Ingestar cada chunk como BrainMemory
        let successCount = 0;
        let firstError = null;
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkTitle = `${doc.filename} · parte ${i + 1}/${chunks.length}`;
            try {
                await ingestMemory({
                    clubId: doc.brain.clubId || undefined,
                    districtId: doc.brain.districtId || undefined,
                    kind: 'DOCUMENT',
                    sourceType: 'BrainDocument',
                    sourceId: `${doc.id}:c${i}`,
                    title: chunkTitle,
                    content: chunk,
                    metadata: {
                        documentId: doc.id,
                        filename: doc.filename,
                        category: doc.category,
                        chunkIndex: i,
                        chunkTotal: chunks.length,
                        uploadedAt: doc.createdAt,
                    },
                });
                successCount++;
            } catch (err) {
                if (!firstError) firstError = err.message;
                console.warn(`[documentProcessor] chunk ${i} fail:`, err.message);
            }
        }

        // 4. Comprensión del documento (Capa A): mientras el status sigue en
        // 'processing', generamos la ficha (summary + análisis estructurado) a
        // partir del texto ya extraído. Best-effort: si falla, el documento
        // igual queda 'completed' con sus chunks indexados.
        if (successCount > 0) {
            try {
                await analyzeDocument({ documentId, fullText: rawText });
            } catch (err) {
                console.warn(`[documentProcessor] análisis ${documentId} fail:`, err.message);
            }
        }

        // 5. Marcar como completed (o failed si nada se ingestó)
        const finalStatus = successCount > 0 ? 'completed' : 'failed';
        await prisma.brainDocument.update({
            where: { id: documentId },
            data: {
                status: finalStatus,
                errorMessage: successCount === 0 ? (firstError || 'Sin ingestas exitosas') :
                              successCount < chunks.length ? `${chunks.length - successCount} chunks fallaron (parcial)` : null,
                chunkCount: successCount,
                charCount,
                processedAt: new Date(),
            },
        });

        // 6. Re-sintetizar el Dossier del sitio (Capa B) con la nueva ficha
        // incorporada. Fire-and-forget para no demorar el cierre del proceso.
        if (successCount > 0 && doc.brainId) {
            regenerateDossierSafe(doc.brainId, { reason: `document:${documentId}` });
        }

        return { ok: true, status: finalStatus, chunks: successCount, charCount };
    } catch (err) {
        console.error(`[documentProcessor] ${documentId} fatal:`, err);
        await prisma.brainDocument.update({
            where: { id: documentId },
            data: {
                status: 'failed',
                errorMessage: err.message?.slice(0, 500) || 'Error desconocido',
                processedAt: new Date(),
            },
        });
        return { ok: false, error: err.message };
    }
}

// Helper non-blocking — el endpoint upload lo invoca y retorna 202 al cliente.
export function processDocumentSafe(args) {
    return processDocument(args).catch(err =>
        console.warn('[documentProcessor] processDocumentSafe:', err.message)
    );
}

// Borra todas las memorias chunked de un documento + el row del documento.
export async function deleteDocument(documentId) {
    const doc = await prisma.brainDocument.findUnique({ where: { id: documentId } });
    if (!doc) return { ok: false, error: 'not found' };

    // Borrar memorias asociadas (sourceType='BrainDocument', sourceId LIKE 'docId:%')
    const deleted = await prisma.brainMemory.deleteMany({
        where: {
            sourceType: 'BrainDocument',
            sourceId: { startsWith: `${documentId}:` },
        },
    });

    // Recalcular memoryCount del brain afectado
    const newCount = await prisma.brainMemory.count({ where: { brainId: doc.brainId } });
    await prisma.brain.update({ where: { id: doc.brainId }, data: { memoryCount: newCount } });

    await prisma.brainDocument.delete({ where: { id: documentId } });

    // El dossier ya no debe referenciar el documento eliminado — re-sintetizar.
    regenerateDossierSafe(doc.brainId, { reason: `document-deleted:${documentId}` });

    return { ok: true, memoriesDeleted: deleted.count };
}
