// ════════════════════════════════════════════════════════════════════════════
// Fichas del proyecto en PDF: español, inglés, bilingüe y libreta (v4.1324.0)
//
// Los DATOS los arma el servidor (`/expediente/documento`): qué campos van,
// sin documento de identidad ni pagos, y qué traducción se usa. Aquí sólo se
// dibuja.
//
// Reglas de maquetación:
//   · Un bloque (rótulo + párrafo, o una tabla) que cabe en una página no se
//     corta: si no cabe en lo que queda, empieza en la siguiente. Sólo un texto
//     más largo que una página entera fluye entre páginas.
//   · La versión inglesa NO se presenta como oficial si la traducción no está
//     aprobada: cada página lleva la marca «BORRADOR / DRAFT».
//   · Un campo narrativo sin traducción dice «Translation pending»: no se cuela
//     el español como si fuera inglés.
// ════════════════════════════════════════════════════════════════════════════
import type { BookletBlock, DocumentPayload, Dossier, DossierField } from './projectDossier';
import { isEmptyValue, matrixRows, NOT_PROVIDED, plainValue } from './projectDossier';

type Lang = 'es' | 'en';
type RGB = [number, number, number];
const BLUE: RGB = [23, 69, 143];
const GOLD: RGB = [247, 168, 27];
const INK: RGB = [30, 41, 59];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];
const BAND: RGB = [239, 244, 250];
const PAGE_W = 595;
const PAGE_H = 842;
const M = 48;
const CW = PAGE_W - M * 2;
const TOP = 70;
const BOTTOM = PAGE_H - 54;

const T = {
    es: {
        sheet: 'Ficha del proyecto', ref: 'Referencia', club: 'Club', district: 'Distrito', generated: 'Generada el',
        page: (a: number, b: number) => `Página ${a} de ${b}`, pending: '', notProvided: NOT_PROVIDED.es,
        bilingualTitle: 'Ficha bilingüe del proyecto · Bilingual project profile',
        sectionEs: 'Sección 1 — Versión en español', sectionEn: 'Section 2 — English version',
        booklet: 'Libreta de presentación', row: 'Fila',
    },
    en: {
        sheet: 'Project Profile', ref: 'Reference', club: 'Club', district: 'District', generated: 'Generated on',
        page: (a: number, b: number) => `Page ${a} of ${b}`, pending: 'Translation pending', notProvided: NOT_PROVIDED.en,
        bilingualTitle: 'Bilingual project profile · Ficha bilingüe del proyecto',
        sectionEs: 'Sección 1 — Versión en español', sectionEn: 'Section 2 — English version',
        booklet: 'Presentation booklet', row: 'Row',
    },
};

async function newDoc(): Promise<any> {
    const { loadJsPdf } = await import('./executiveReportPdf');
    const JsPDF = await loadJsPdf();
    return new JsPDF({ unit: 'pt', format: 'a4' });
}

/** Un cursor de página que sabe cuándo saltar y repinta la cabecera corrida. */
class Writer {
    doc: any; y = TOP; header: string; draftMark: string | null;
    constructor(doc: any, header: string, draftMark: string | null) { this.doc = doc; this.header = header; this.draftMark = draftMark; }

    pageChrome() {
        const d = this.doc;
        d.setFillColor(...BLUE); d.rect(0, 0, PAGE_W, 34, 'F');
        d.setFillColor(...GOLD); d.rect(0, 34, PAGE_W, 3, 'F');
        d.setFont('helvetica', 'bold'); d.setFontSize(9); d.setTextColor(255, 255, 255);
        d.text(this.header.slice(0, 110), M, 22);
        if (this.draftMark) this.watermark(this.draftMark);
    }

    watermark(text: string) {
        const d = this.doc;
        d.saveGraphicsState?.();
        try { d.setGState?.(new d.GState({ opacity: 0.12 })); } catch { /* sin transparencia: sigue legible */ }
        d.setFont('helvetica', 'bold'); d.setFontSize(54); d.setTextColor(200, 40, 40);
        d.text(text, PAGE_W / 2, PAGE_H / 2 + 40, { align: 'center', angle: 32 });
        d.restoreGraphicsState?.();
        d.setFillColor(254, 242, 242); d.rect(0, 37, PAGE_W, 16, 'F');
        d.setFont('helvetica', 'bold'); d.setFontSize(7.5); d.setTextColor(185, 28, 28);
        d.text(text, PAGE_W / 2, 48, { align: 'center' });
    }

    newPage() { this.doc.addPage(); this.pageChrome(); this.y = TOP; }
    room() { return BOTTOM - this.y; }
    ensure(h: number) { if (h > this.room() && h <= BOTTOM - TOP) this.newPage(); }

    lines(text: string, size: number, width = CW, bold = false): string[] {
        this.doc.setFont('helvetica', bold ? 'bold' : 'normal'); this.doc.setFontSize(size);
        return this.doc.splitTextToSize(sanitize(text), width);
    }

    /** Escribe líneas ya partidas; si no caben, siguen en la página siguiente. */
    flow(lines: string[], size: number, color: RGB, x = M, bold = false, italic = false) {
        const lh = size * 1.38;
        this.doc.setFont('helvetica', bold ? 'bold' : (italic ? 'italic' : 'normal'));
        this.doc.setFontSize(size); this.doc.setTextColor(...color);
        for (const ln of lines) {
            if (this.y + lh > BOTTOM) { this.newPage(); this.doc.setFont('helvetica', bold ? 'bold' : (italic ? 'italic' : 'normal')); this.doc.setFontSize(size); this.doc.setTextColor(...color); }
            this.doc.text(ln, x, this.y); this.y += lh;
        }
    }
}

// jsPDF con las fuentes base sólo dibuja Latin-1: lo demás se reemplaza por su
// equivalente legible en vez de salir como símbolos raros.
const sanitize = (s: string) => String(s ?? '')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[•·]/g, '·').replace(/ /g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '');

// ── Bloques ─────────────────────────────────────────────────────────────────
function sectionTitle(w: Writer, text: string) {
    w.ensure(60);
    w.y += 6;
    w.doc.setFillColor(...BAND); w.doc.rect(M - 6, w.y - 12, CW + 12, 20, 'F');
    w.doc.setFillColor(...BLUE); w.doc.rect(M - 6, w.y - 12, 3, 20, 'F');
    w.flow(w.lines(text, 11, CW - 8, true), 11, BLUE, M + 2, true);
    w.y += 6;
}

function groupTitle(w: Writer, text: string, sub?: string) {
    w.ensure(90);
    w.y += 10;
    w.flow(w.lines(text, 14, CW, true), 14, INK, M, true);
    if (sub) w.flow(w.lines(sub, 8.5, CW), 8.5, MUTED);
    w.doc.setDrawColor(...GOLD); w.doc.setLineWidth(1.2); w.doc.line(M, w.y, M + 60, w.y);
    w.y += 12;
}

function fieldBlock(w: Writer, field: DossierField, lang: Lang) {
    const label = lang === 'en' ? (field.labelEn || field.label) : field.label;
    const value = lang === 'en' ? field.valueEn : field.value;
    const t = T[lang];

    if (field.type === 'matrix') return matrixBlock(w, field, label, lang);
    if (field.type === 'repeater') return repeaterBlock(w, field, label, lang);

    let text: string;
    let muted = false;
    let italic = false;
    if (lang === 'en' && field.untranslated) { text = t.pending; muted = true; italic = true; }
    else if (isEmptyValue(value)) { text = t.notProvided; muted = true; italic = true; }
    else text = plainValue(field, value, lang);
    if (lang === 'en' && field.noteEn && !isEmptyValue(value)) text += '  (no approved equivalent: original kept)';

    const labelLines = w.lines(label, 8, CW, true);
    const valueLines = w.lines(text, 10, CW);
    const h = labelLines.length * 11 + valueLines.length * 13.8 + 8;
    w.ensure(h);
    w.flow(labelLines, 8, MUTED, M, true);
    w.flow(valueLines, 10, muted ? MUTED : INK, M, false, italic);
    w.y += 6;
}

function matrixBlock(w: Writer, field: DossierField, label: string, lang: Lang) {
    const value = field.value && typeof field.value === 'object' ? field.value : {};
    const rows = matrixRows(field);
    const cols = field.columns || [];
    const colLabel = (i: number) => (lang === 'en' ? field.columnsEn?.[i] || cols[i].label : cols[i].label);
    const firstW = CW * 0.46;
    const colW = (CW - firstW) / Math.max(1, cols.length);
    const h = 14 + (rows.length + 1) * 18 + 10;
    w.ensure(h);
    w.flow(w.lines(label, 8, CW, true), 8, MUTED, M, true);
    const d = w.doc;
    d.setFillColor(...BAND); d.rect(M, w.y - 10, CW, 16, 'F');
    d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor(...MUTED);
    cols.forEach((_, i) => d.text(sanitize(colLabel(i)), M + firstW + colW * i + colW - 6, w.y, { align: 'right' }));
    w.y += 16;
    if (!rows.length) { w.flow([T[lang].notProvided], 9.5, MUTED, M, false, true); w.y += 4; return; }
    for (const r of rows) {
        d.setFont('helvetica', 'normal'); d.setFontSize(9.5); d.setTextColor(...INK);
        d.text(sanitize(lang === 'en' ? (r.labelEn || r.label) : r.label).slice(0, 60), M + 4, w.y);
        cols.forEach((c, i) => {
            const v = value?.[r.key]?.[c.key];
            const txt = isEmptyValue(v) ? '-' : (c.key === 'usd' || c.type === 'currency' ? Number(v).toLocaleString(lang === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 }) : String(v));
            d.text(sanitize(txt), M + firstW + colW * i + colW - 6, w.y, { align: 'right' });
        });
        d.setDrawColor(...LINE); d.setLineWidth(0.5); d.line(M, w.y + 5, M + CW, w.y + 5);
        w.y += 18;
    }
    w.y += 6;
}

function repeaterBlock(w: Writer, field: DossierField, label: string, lang: Lang) {
    const rows: any[] = Array.isArray(lang === 'en' ? field.valueEn : field.value) ? (lang === 'en' ? field.valueEn : field.value) : [];
    const cols = field.columns || [];
    const filled = rows.filter(r => r && Object.values(r).some(v => String(v ?? '').trim() !== ''));
    const lineFor = (r: any, i: number) => `${i + 1}. ` + cols.map((c, ci) => {
        const cl = lang === 'en' ? field.columnsEn?.[ci] || c.label : c.label;
        const v = r?.[c.key];
        const txt = isEmptyValue(v) ? '-' : (c.type === 'currency' ? plainValue({ type: 'currency' }, v, lang) : String(v));
        return `${cl}: ${txt}`;
    }).join('   ·   ');
    const all = filled.map((r, i) => w.lines(lineFor(r, i), 9.5, CW - 10));
    const h = 12 + all.reduce((n, l) => n + l.length * 13, 0) + 10;
    w.ensure(Math.min(h, BOTTOM - TOP));
    w.flow(w.lines(label, 8, CW, true), 8, MUTED, M, true);
    if (!filled.length) { w.flow([T[lang].notProvided], 9.5, MUTED, M, false, true); w.y += 4; return; }
    for (const l of all) { w.ensure(l.length * 13 + 2); w.flow(l, 9.5, INK, M + 8); }
    if (lang === 'en' && field.untranslated) w.flow([`(${T.en.pending})`], 8.5, MUTED, M + 8, false, true);
    w.y += 6;
}

function renderDossier(w: Writer, dossier: Dossier, lang: Lang) {
    for (const g of dossier.groups) {
        const anyField = g.sections.some(s => s.fields.length);
        if (!anyField) continue;
        if (g.source === 'form' && g.started === false) {
            groupTitle(w, lang === 'en' ? g.titleEn : g.title);
            w.flow([lang === 'en' ? 'The club has not started this form.' : 'El club todavía no ha iniciado este formulario.'], 9.5, MUTED, M, false, true);
            w.y += 6;
            continue;
        }
        groupTitle(w, lang === 'en' ? g.titleEn : g.title, g.source === 'form' && typeof g.completionPct === 'number' ? (lang === 'en' ? `Completion: ${g.completionPct}%` : `Avance: ${g.completionPct}%`) : undefined);
        for (const s of g.sections) {
            if (!s.fields.length) continue;
            sectionTitle(w, lang === 'en' ? s.titleEn : s.title);
            for (const f of s.fields) fieldBlock(w, f, lang);
        }
    }
}

function cover(w: Writer, p: DocumentPayload, title: string, lang: Lang, statusLine?: string | null) {
    const d = w.doc;
    w.y = TOP + 8;
    d.setFont('helvetica', 'normal'); d.setFontSize(9); d.setTextColor(...MUTED);
    d.text(sanitize(p.edition), M, w.y); w.y += 22;
    d.setFont('helvetica', 'bold'); d.setFontSize(10); d.setTextColor(...GOLD);
    d.text(sanitize(title.toUpperCase()), M, w.y); w.y += 22;
    w.flow(w.lines(p.projectName || '-', 20, CW, true), 20, BLUE, M, true);
    w.y += 4;
    w.flow(w.lines(`${p.clubName || ''}${p.district ? ` · ${p.district}` : ''}`, 11, CW), 11, INK);
    w.flow([`${T[lang].ref}: ${p.publicRef}`], 9, MUTED);
    if (statusLine) { w.y += 4; w.flow(w.lines(statusLine, 8.5, CW), 8.5, MUTED, M, false, true); }
    w.y += 8;
    d.setDrawColor(...LINE); d.setLineWidth(0.8); d.line(M, w.y, M + CW, w.y);
    w.y += 14;
}

const translationLine = (p: DocumentPayload): string | null => {
    const t = p.translation;
    if (!t) return null;
    if (t.mode === 'approved') {
        const when = t.approvedAt ? new Date(t.approvedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        return `Approved translation · version ${t.versionNumber}${when ? ` · ${when}` : ''}${t.outdatedSinceApproval ? ' · Note: the Spanish original changed after this approval.' : ''}`;
    }
    if (t.mode === 'draft') return `DRAFT translation (${t.label.toLowerCase()}): not approved, not for official use.`;
    return 'This project has not been translated yet.';
};

function finish(doc: any, p: { publicRef: string; generatedAt: string }, lang: Lang) {
    const total = doc.getNumberOfPages();
    const when = new Date(p.generatedAt).toLocaleString(lang === 'en' ? 'en-US' : 'es-CO', { dateStyle: 'medium', timeStyle: 'short' });
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, PAGE_H - 36, PAGE_W - M, PAGE_H - 36);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
        doc.text(sanitize(`${p.publicRef} · ${T[lang].generated} ${when}`), M, PAGE_H - 24);
        doc.text(T[lang].page(i, total), PAGE_W - M, PAGE_H - 24, { align: 'right' });
    }
}

/** Dibuja UN proyecto en un documento (nuevo o existente). */
async function drawProject(doc: any, p: DocumentPayload, first: boolean) {
    const kind = p.kind;
    const draft = (kind === 'en' || kind === 'bilingual') && p.translation?.mode !== 'approved';
    const mark = draft ? 'BORRADOR · DRAFT — NOT APPROVED' : null;
    if (kind === 'es') {
        const w = new Writer(doc, `${p.edition} · ${T.es.sheet}`, null);
        if (!first) doc.addPage();
        w.pageChrome();
        cover(w, p, T.es.sheet, 'es');
        renderDossier(w, p.es, 'es');
        return;
    }
    if (kind === 'en') {
        const w = new Writer(doc, `${p.edition} · ${T.en.sheet}`, mark);
        if (!first) doc.addPage();
        w.pageChrome();
        cover(w, p, T.en.sheet, 'en', translationLine(p));
        renderDossier(w, p.en || p.es, 'en');
        return;
    }
    // Bilingüe: portada común, la versión completa en español y después la
    // inglesa (mejor que dos columnas estrechas para textos largos).
    const w = new Writer(doc, `${p.edition} · ${T.es.bilingualTitle}`, null);
    if (!first) doc.addPage();
    w.pageChrome();
    cover(w, p, T.es.bilingualTitle, 'es', translationLine(p));
    w.flow([T.es.sectionEs, T.es.sectionEn], 10, INK);
    w.newPage();
    groupTitle(w, T.es.sectionEs);
    renderDossier(w, p.es, 'es');
    w.draftMark = mark;
    w.header = `${p.edition} · ${T.en.sheet}`;
    w.newPage();
    groupTitle(w, T.es.sectionEn, translationLine(p) || undefined);
    renderDossier(w, p.en || p.es, 'en');
}

/** El PDF de UN proyecto. */
export async function buildDossierPdf(p: DocumentPayload): Promise<any> {
    const doc = await newDoc();
    await drawProject(doc, p, true);
    finish(doc, p, p.kind === 'en' ? 'en' : 'es');
    return doc;
}

export const pdfFileName = (p: Pick<DocumentPayload, 'publicRef' | 'projectName' | 'kind'>) => {
    const slug = String(p.projectName || 'proyecto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    const suffix = p.kind === 'es' ? 'ficha-es' : p.kind === 'en' ? 'profile-en' : 'ficha-bilingue';
    return `${p.publicRef}-${slug}-${suffix}.pdf`;
};

/** Varios proyectos: un ZIP con un PDF por proyecto. */
export async function buildDossierZip(docs: DocumentPayload[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    let i = 0;
    for (const p of docs) {
        const doc = await buildDossierPdf(p);
        zip.file(pdfFileName(p), doc.output('arraybuffer'));
        i += 1; onProgress?.(i, docs.length);
        // Deja respirar a la pantalla entre proyecto y proyecto.
        await new Promise(r => setTimeout(r, 0));
    }
    return zip.generateAsync({ type: 'blob' });
}

// ── Libreta ─────────────────────────────────────────────────────────────────
export interface BookletDoc { lang: Lang; blocks: BookletBlock[]; status: 'draft' | 'approved'; versionNumber: number }

export async function buildBookletPdf(project: { publicRef: string; projectName: string; clubName: string; district: string; edition: string }, booklets: BookletDoc[]): Promise<any> {
    const doc = await newDoc();
    booklets.forEach((b, bi) => {
        const t = T[b.lang];
        const w = new Writer(doc, `${project.edition} · ${t.booklet}`, b.status === 'approved' ? null : (b.lang === 'en' ? 'DRAFT — NOT APPROVED' : 'BORRADOR — SIN APROBAR'));
        if (bi > 0) doc.addPage();
        w.pageChrome();
        const d = doc;
        w.y = TOP + 8;
        d.setFont('helvetica', 'bold'); d.setFontSize(10); d.setTextColor(...GOLD);
        d.text(t.booklet.toUpperCase(), M, w.y); w.y += 22;
        for (const block of b.blocks) {
            const lines = w.lines(block.text || t.notProvided, 13, CW);
            w.ensure(16 + lines.length * 18 + 14);
            w.flow(w.lines(block.label, 9, CW, true), 9, BLUE, M, true);
            w.flow(lines, 13, block.text ? INK : MUTED, M, false, !block.text);
            w.y += 12;
        }
        w.flow([`${t.ref}: ${project.publicRef} · v${b.versionNumber}${b.status === 'approved' ? '' : (b.lang === 'en' ? ' (draft)' : ' (borrador)')}`], 8, MUTED);
    });
    finish(doc, { publicRef: project.publicRef, generatedAt: new Date().toISOString() }, booklets[0]?.lang === 'en' && booklets.length === 1 ? 'en' : 'es');
    return doc;
}

export const downloadBlob = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
