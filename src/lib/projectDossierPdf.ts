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
import { totalRowIndexes } from './budgetRows';

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

// ── Tipografía: Open Sans, la de Club Platform (v4.1345) ─────────────────────
// Los TTF viven en /fonts/pdf (OFL 1.1, ver OFL-LICENSE.md): jsPDF no lee woff2. Se
// descargan una vez por sesión y sólo al generar un PDF. Si no cargan, la ficha
// sale igual en Helvetica: nunca se deja de entregar el documento por la letra.
const OPEN_SANS = [
    { file: 'OpenSans-Regular.ttf', style: 'normal' },
    { file: 'OpenSans-Bold.ttf', style: 'bold' },
    { file: 'OpenSans-Italic.ttf', style: 'italic' },
] as const;
let openSansCache: Promise<Record<string, string> | null> | null = null;
const toBase64 = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
};
const loadOpenSans = () => {
    if (!openSansCache) {
        openSansCache = (async () => {
            try {
                const out: Record<string, string> = {};
                for (const f of OPEN_SANS) {
                    const r = await fetch(`/fonts/pdf/${f.file}`, { signal: AbortSignal.timeout?.(15000) });
                    if (!r.ok) return null;
                    const buf = await r.arrayBuffer();
                    // ⚠️ Sólo un TTF de verdad (firma 00 01 00 00 o «true»): un
                    // servidor que responde la página (200) a un archivo que no
                    // está rompería el PDF entero al usarla como letra.
                    const sig = new Uint8Array(buf.slice(0, 4));
                    const isTtf = (sig[0] === 0 && sig[1] === 1 && sig[2] === 0 && sig[3] === 0) || String.fromCharCode(...sig) === 'true';
                    if (!isTtf || buf.byteLength < 10_000) return null;
                    out[f.file] = toBase64(buf);
                }
                return out;
            } catch { return null; }
        })();
        // Un fallo no queda guardado para siempre: el próximo PDF lo reintenta.
        openSansCache.then(v => { if (!v) openSansCache = null; });
    }
    return openSansCache;
};

/** La familia con la que se escribe este documento. */
const fam = (doc: any): string => doc?.__fam || 'helvetica';

async function newDoc(): Promise<any> {
    const { loadJsPdf } = await import('./executiveReportPdf');
    const JsPDF = await loadJsPdf();
    const doc = new JsPDF({ unit: 'pt', format: 'a4' });
    const fonts = await loadOpenSans();
    if (fonts) {
        try {
            for (const f of OPEN_SANS) {
                doc.addFileToVFS(f.file, fonts[f.file]);
                doc.addFont(f.file, 'OpenSans', f.style);
            }
            doc.__fam = 'OpenSans';
        } catch { doc.__fam = 'helvetica'; }
    }
    return doc;
}

/** Un cursor de página que sabe cuándo saltar y repinta la cabecera corrida. */
/** v4.1345 — La cabecera de marca de la ficha del club: logotipo y título. */
interface Brand { logo: { data: string; w: number; h: number } | null; title: string; edition: string }
const BRAND_TOP = 96;

class Writer {
    doc: any; y = TOP; header: string; draftMark: string | null; brand: Brand | null = null; top = TOP;
    /** v4.1347 — Los campos del expediente por ruta, para cruzar datos entre formularios. */
    index: Map<string, DossierField> = new Map();
    constructor(doc: any, header: string, draftMark: string | null, brand: Brand | null = null) {
        this.doc = doc; this.header = header; this.draftMark = draftMark;
        if (brand) { this.brand = brand; this.top = BRAND_TOP; this.y = BRAND_TOP; }
    }

    brandChrome() {
        const d = this.doc;
        const b = this.brand!;
        d.setFillColor(255, 255, 255); d.rect(0, 0, PAGE_W, 70, 'F');
        // El logotipo de la Feria (o su nombre, si no hay logotipo).
        if (b.logo) {
            const maxH = 40; const maxW = 230;
            const k = Math.min(maxH / b.logo.h, maxW / b.logo.w);
            try { d.addImage(b.logo.data, 'PNG', M, 16, b.logo.w * k, b.logo.h * k, 'fair-logo', 'FAST'); }
            catch { /* sin logotipo dibujable: queda el texto de la derecha */ }
        } else {
            d.setFont(fam(d), 'bold'); d.setFontSize(13); d.setTextColor(...BLUE);
            d.text('Feria de Proyectos', M, 36);
            d.setFont(fam(d), 'normal'); d.setFontSize(8.5); d.setTextColor(...MUTED);
            d.text('Rotary · Club Platform', M, 50);
        }
        d.setFont(fam(d), 'bold'); d.setFontSize(10); d.setTextColor(...BLUE);
        d.text(sanitize(b.title), PAGE_W - M, 32, { align: 'right' });
        d.setFont(fam(d), 'normal'); d.setFontSize(8); d.setTextColor(...MUTED);
        d.text(sanitize(b.edition).slice(0, 70), PAGE_W - M, 46, { align: 'right' });
        d.setFillColor(...BLUE); d.rect(0, 66, PAGE_W, 3, 'F');
        d.setFillColor(...GOLD); d.rect(0, 69, PAGE_W, 2, 'F');
    }

    pageChrome() {
        if (this.brand) { this.brandChrome(); return; }
        const d = this.doc;
        d.setFillColor(...BLUE); d.rect(0, 0, PAGE_W, 34, 'F');
        d.setFillColor(...GOLD); d.rect(0, 34, PAGE_W, 3, 'F');
        d.setFont(fam(d), 'bold'); d.setFontSize(9); d.setTextColor(255, 255, 255);
        d.text(this.header.slice(0, 110), M, 22);
        if (this.draftMark) this.watermark(this.draftMark);
    }

    watermark(text: string) {
        const d = this.doc;
        d.saveGraphicsState?.();
        try { d.setGState?.(new d.GState({ opacity: 0.12 })); } catch { /* sin transparencia: sigue legible */ }
        d.setFont(fam(d), 'bold'); d.setFontSize(54); d.setTextColor(200, 40, 40);
        d.text(text, PAGE_W / 2, PAGE_H / 2 + 40, { align: 'center', angle: 32 });
        d.restoreGraphicsState?.();
        d.setFillColor(254, 242, 242); d.rect(0, 37, PAGE_W, 16, 'F');
        d.setFont(fam(d), 'bold'); d.setFontSize(7.5); d.setTextColor(185, 28, 28);
        d.text(text, PAGE_W / 2, 48, { align: 'center' });
    }

    newPage() { this.doc.addPage(); this.pageChrome(); this.y = this.top; }
    room() { return BOTTOM - this.y; }
    ensure(h: number) { if (h > this.room() && h <= BOTTOM - this.top) this.newPage(); }

    lines(text: string, size: number, width = CW, bold = false): string[] {
        this.doc.setFont(fam(this.doc), bold ? 'bold' : 'normal'); this.doc.setFontSize(size);
        return this.doc.splitTextToSize(sanitize(text), width);
    }

    /** Escribe líneas ya partidas; si no caben, siguen en la página siguiente. */
    flow(lines: string[], size: number, color: RGB, x = M, bold = false, italic = false) {
        const lh = size * 1.38;
        this.doc.setFont(fam(this.doc), bold ? 'bold' : (italic ? 'italic' : 'normal'));
        this.doc.setFontSize(size); this.doc.setTextColor(...color);
        for (const ln of lines) {
            if (this.y + lh > BOTTOM) { this.newPage(); this.doc.setFont(fam(this.doc), bold ? 'bold' : (italic ? 'italic' : 'normal')); this.doc.setFontSize(size); this.doc.setTextColor(...color); }
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
    d.setFont(fam(d), 'bold'); d.setFontSize(8); d.setTextColor(...MUTED);
    cols.forEach((_, i) => d.text(sanitize(colLabel(i)), M + firstW + colW * i + colW - 6, w.y, { align: 'right' }));
    w.y += 16;
    if (!rows.length) { w.flow([T[lang].notProvided], 9.5, MUTED, M, false, true); w.y += 4; return; }
    for (const r of rows) {
        d.setFont(fam(d), 'normal'); d.setFontSize(9.5); d.setTextColor(...INK);
        d.text(sanitize(lang === 'en' ? (r.labelEn || r.label) : r.label).slice(0, 60), M + 4, w.y);
        cols.forEach((c, i) => {
            const v = value?.[r.key]?.[c.key];
            const txt = isEmptyValue(v) ? '-' : (c.key === 'usd' || c.type === 'currency' ? Number(v).toLocaleString(lang === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 }) : String(v));
            d.text(sanitize(txt), M + firstW + colW * i + colW - 6, w.y, { align: 'right' });
        });
        d.setDrawColor(...LINE); d.setLineWidth(0.5); d.line(M, w.y + 5, M + CW, w.y + 5);
        w.y += 18;
    }
    // v4.1347 — Caso Paula Cruz: «aquí no me coló la FDD». La tabla de la
    // Formulación no toma el valor del FDD: si «Distrito Colombiano» está vacío
    // en dólares, se dice lo que el club solicitó en la Solicitud de Aportes del
    // FDD —con su origen—, sin escribirlo en la tabla como si el club lo hubiera
    // puesto ahí.
    if (field.path === 'master.presupuesto.budgetTable') {
        const fddUsd = w.index.get('fdd_2026_2027.fdd.requestedUsd')?.value;
        if (isEmptyValue(value?.colombianDistrict?.usd) && !isEmptyValue(fddUsd)) {
            const txt = lang === 'en'
                ? `Requested from the District Designated Fund (DDF request form): ${plainValue({ type: 'currency' }, fddUsd, 'en')}`
                : `Solicitado al FDD en la Solicitud de Aportes del FDD: ${plainValue({ type: 'currency' }, fddUsd, 'es')}`;
            w.flow(w.lines(txt, 8.5, CW), 8.5, MUTED, M, false, true);
        }
    }
    w.y += 6;
}

const BREAKDOWN_TOTALS: Record<string, string> = {
    // El desglose del FDD se concilia con su «Presupuesto total del proyecto».
    'fdd_2026_2027.presupuesto.budgetBreakdown': 'fdd_2026_2027.presupuesto.budgetUsd',
};
export { TOTAL_ROW_RE } from './budgetRows';
const toNumber = (v: any): number | null => {
    if (isEmptyValue(v)) return null;
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
};

/**
 * v4.1347 — Un repetidor con columnas de dinero (el «Desglose del
 * presupuesto» del FDD) se dibuja como TABLA: cada rubro con su valor, la
 * fila de total y, si el formulario tiene el presupuesto total, la diferencia
 * sin detallar. Así un rubro sin valor salta a la vista (caso Paula Cruz:
 * «Operations» sin sus US$ 2.655).
 */
function moneyRepeaterTable(w: Writer, field: DossierField, label: string, lang: Lang, filled: any[]) {
    const d = w.doc;
    const cols = field.columns || [];
    const colLabel = (i: number) => (lang === 'en' ? field.columnsEn?.[i] || cols[i].label : cols[i].label);
    const isMoney = (c: { type: string }) => c.type === 'currency' || c.type === 'number';
    const moneyW = 112;
    const nMoney = cols.filter(isMoney).length;
    const textCols = cols.filter(c => !isMoney(c));
    const numW = 18;
    const textW = Math.max(80, (CW - numW - nMoney * moneyW) / Math.max(1, textCols.length));
    const xOf: number[] = [];
    let x = M + numW;
    cols.forEach(c => { xOf.push(x); x += isMoney(c) ? moneyW : textW; });
    const fmt = (c: { type: string }, v: any) => (isEmptyValue(v) ? (lang === 'en' ? 'Not provided' : 'Sin valor') : (isMoney(c) ? plainValue({ type: 'currency' }, v, lang) : String(v)));

    w.ensure(14 + 18 * Math.min(filled.length + 2, 8));
    w.flow(w.lines(label, 8, CW, true), 8, MUTED, M, true);
    d.setFillColor(...BAND); d.rect(M, w.y - 10, CW, 16, 'F');
    d.setFont(fam(d), 'bold'); d.setFontSize(8); d.setTextColor(...MUTED);
    d.text('#', M + 4, w.y);
    cols.forEach((c, i) => (isMoney(c)
        ? d.text(sanitize(colLabel(i)), xOf[i] + moneyW - 4, w.y, { align: 'right' })
        : d.text(sanitize(colLabel(i)), xOf[i] + 2, w.y)));
    w.y += 16;

    // v4.1353 — Una fila que el club tituló «Total» (caso Paula Cruz: «agregué
    // el ítem del total, por eso me sale el doble») NO es un rubro: no se
    // numera ni se suma; se muestra como «Total escrito por el club».
    // v4.1354 — También la fila SIN concepto cuyo monto es la suma de las demás
    // (Paula borró la palabra «total» y dejó el monto): `totalRowIndexes`.
    const totalIdx = totalRowIndexes(filled, textCols[0]?.key, cols.find(isMoney)?.key);
    const declared = filled.filter((_, i) => totalIdx.has(i));
    const items = filled.filter((_, i) => !totalIdx.has(i));

    const totals = cols.map(() => 0);
    items.forEach((r, ri) => {
        const cellLines = cols.map(c => (isMoney(c) ? [fmt(c, r?.[c.key])] : w.lines(fmt(c, r?.[c.key]), 9.5, textW - 8)));
        const h = Math.max(...cellLines.map(l => l.length)) * 13 + 5;
        w.ensure(h + 4);
        d.setFont(fam(d), 'normal'); d.setFontSize(9.5);
        d.setTextColor(...MUTED); d.text(String(ri + 1), M + 4, w.y);
        cols.forEach((c, i) => {
            const v = r?.[c.key];
            const empty = isEmptyValue(v);
            d.setFont(fam(d), empty ? 'italic' : 'normal');
            d.setTextColor(...(empty ? [185, 28, 28] as RGB : INK));
            if (isMoney(c)) {
                d.text(sanitize(cellLines[i][0]), xOf[i] + moneyW - 4, w.y, { align: 'right' });
                const n = toNumber(v); if (n !== null) totals[i] += n;
            } else {
                cellLines[i].forEach((ln, li) => d.text(ln, xOf[i] + 2, w.y + li * 13));
            }
        });
        d.setDrawColor(...LINE); d.setLineWidth(0.5); d.line(M, w.y + h - 9, M + CW, w.y + h - 9);
        w.y += h;
    });

    // Total
    w.ensure(20);
    d.setFont(fam(d), 'bold'); d.setFontSize(9.5); d.setTextColor(...BLUE);
    d.text(lang === 'en' ? 'Breakdown total' : 'Total del desglose', M + 4, w.y);
    cols.forEach((c, i) => { if (isMoney(c)) d.text(plainValue({ type: 'currency' }, Math.round(totals[i] * 100) / 100, lang), xOf[i] + moneyW - 4, w.y, { align: 'right' }); });
    w.y += 14;

    const money = (n: number) => plainValue({ type: 'currency' }, n, lang);
    const moneyIdx = cols.findIndex(isMoney);
    const itemsTotal = moneyIdx >= 0 ? Math.round(totals[moneyIdx] * 100) / 100 : 0;

    // La fila «Total» que escribió el club, aparte y comparada con la suma.
    for (const r of declared) {
        const n = moneyIdx >= 0 ? toNumber(r?.[cols[moneyIdx].key]) : null;
        if (n === null) continue;
        const same = Math.abs(n - itemsTotal) < 0.5;
        const txt = same
            ? (lang === 'en' ? `Total entered by the club: ${money(n)} (matches the sum of the items; not added again).` : `Total escrito por el club: ${money(n)} (coincide con la suma de los rubros; no se suma otra vez).`)
            : (lang === 'en' ? `Total entered by the club: ${money(n)} · Sum of the items: ${money(itemsTotal)}` : `Total escrito por el club: ${money(n)} · Suma de los rubros: ${money(itemsTotal)}`);
        w.flow(w.lines(txt, 8.5, CW), 8.5, same ? MUTED : [185, 28, 28], M, !same, same);
    }

    // Conciliación con el presupuesto total del formulario.
    const totalPath = BREAKDOWN_TOTALS[field.path];
    const budget = totalPath ? toNumber(w.index.get(totalPath)?.value) : null;
    if (budget !== null && moneyIdx >= 0) {
        const diff = Math.round((budget - itemsTotal) * 100) / 100;
        const txt = diff === 0
            ? (lang === 'en' ? `Matches the total project budget (${money(budget)}).` : `Coincide con el presupuesto total del proyecto (${money(budget)}).`)
            : diff > 0
                ? (lang === 'en'
                    ? `Total project budget: ${money(budget)} · Difference not itemized: ${money(diff)}`
                    : `Presupuesto total del proyecto: ${money(budget)} · Diferencia sin detallar: ${money(diff)}`)
                : (lang === 'en'
                    ? `Total project budget: ${money(budget)} · The breakdown exceeds it by ${money(-diff)}`
                    : `Presupuesto total del proyecto: ${money(budget)} · El desglose lo supera en ${money(-diff)}`);
        w.flow(w.lines(txt, 8.5, CW), 8.5, diff === 0 ? MUTED : [185, 28, 28], M, diff !== 0, diff === 0);
    }
    if (items.some(r => cols.some(c => isMoney(c) && isEmptyValue(r?.[c.key])))) {
        w.flow(w.lines(lang === 'en' ? 'Rows marked «Not provided» have no amount in the form.' : 'Los rubros marcados «Sin valor» no tienen monto en el formulario.', 8, CW), 8, MUTED, M, false, true);
    }
    w.y += 6;
}

function repeaterBlock(w: Writer, field: DossierField, label: string, lang: Lang) {
    const rows: any[] = Array.isArray(lang === 'en' ? field.valueEn : field.value) ? (lang === 'en' ? field.valueEn : field.value) : [];
    const cols = field.columns || [];
    const filled = rows.filter(r => r && Object.values(r).some(v => String(v ?? '').trim() !== ''));
    if (filled.length && cols.some(c => c.type === 'currency')) {
        moneyRepeaterTable(w, field, label, lang, filled);
        if (lang === 'en' && field.untranslated) w.flow([`(${T.en.pending})`], 8.5, MUTED, M + 8, false, true);
        return;
    }
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
    w.index = new Map();
    for (const g of dossier.groups) for (const s of g.sections || []) for (const f of s.fields || []) w.index.set(f.path, f);
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

/** El nombre de un club comparable: sin tildes, sin «Club Rotario», «C.R.», «Rotary Club». */
const CLUB_WORDS = new Set(['club', 'rotario', 'rotary', 'c', 'r', 'cr']);
export const clubKey = (s: string): string => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(t => t && !CLUB_WORDS.has(t)).join(' ');
/** Los campos de texto «Club Rotario» de los formularios (la Formulación y el FDD). */
const FORM_CLUB_NAME_PATHS = ['master.identificacion.clubName', 'fdd_2026_2027.club.clubName'];
/** El nombre del proyecto como lo escribió el club (el mismo orden que la libreta). */
const FORM_PROJECT_NAME_PATHS = ['master.identificacion.projectName', 'fdd_2026_2027.proyecto.projectName'];
const splitClubs = (v: string) => v.split(/\s*(?:,|;|\/|\n|\s+y\s+|\s+-\s+)\s*/i).map(x => x.trim()).filter(Boolean);

type CoverSource = Pick<DocumentPayload, 'es' | 'clubName' | 'projectName'>;
const fieldsOf = (p: Partial<CoverSource>) => {
    const fields = new Map<string, DossierField>();
    for (const g of p.es?.groups || []) for (const s of g.sections || []) for (const f of s.fields || []) fields.set(f.path, f);
    return fields;
};
const textAt = (fields: Map<string, DossierField>, path: string) => {
    const v = fields.get(path)?.value;
    return typeof v === 'string' ? v.trim() : '';
};

/**
 * v4.1354 — Qué dice la portada: el proyecto, el club principal y los demás
 * clubes, tal como los DILIGENCIÓ el club, no como quedaron al inscribirse.
 *
 * Caso Paula Cruz: cambió el título en la Formulación («Cuna de Vida:
 * Recuperando la atención neonatal en Pereira tras el terremoto») y la ficha
 * seguía con el del registro; y «el club principal es Pereira Perla del
 * Otún, no Pereira del Café» (el club con el que se inscribió la cuenta).
 *
 * - Proyecto: Formulación → FDD → registro.
 * - Club principal: el primero escrito en «Club Rotario» de la Formulación →
 *   el del FDD → el del registro.
 * - Clubes participantes (v4.1346, v4.1353): la lista del campo «Clubes
 *   participantes en el proyecto», el club del registro si no es el
 *   principal, y los demás escritos en «Club Rotario»; nunca el principal ni
 *   uno repetido (`clubKey`: sin tildes ni «Club Rotario» / «C.R.»).
 * El «Registro inicial de la postulación» sigue mostrando lo inscrito.
 */
export const coverIdentityOf = (p: Partial<CoverSource>) => {
    const fields = fieldsOf(p);
    const projectName = FORM_PROJECT_NAME_PATHS.map(x => textAt(fields, x)).find(Boolean) || String(p.projectName || '').trim();
    const written = FORM_CLUB_NAME_PATHS.map(x => splitClubs(textAt(fields, x)));
    const registered = String(p.clubName || '').trim();
    const firstWritten = written.map(l => l[0]).find(Boolean) || '';
    // El mismo club con otra escritura («Club Rotario Pereira del Café») se
    // muestra como quedó registrado.
    const clubName = firstWritten && clubKey(firstWritten) !== clubKey(registered) ? firstWritten : registered || firstWritten;

    const participating: string[] = [];
    const seen = new Set<string>([clubKey(clubName)].filter(Boolean));
    const push = (name: unknown) => {
        const n = String(name ?? '').trim();
        const k = clubKey(n);
        if (!n || !k || seen.has(k)) return;
        seen.add(k);
        participating.push(n);
    };
    const listed = fields.get('master.identificacion.participatingClubs')?.value;
    if (Array.isArray(listed)) (listed as unknown[]).forEach(push);
    push(p.clubName);
    written.flat().forEach(push);
    return { projectName, clubName, participating };
};

/** v4.1346 — Los clubes participantes de la portada (ver `coverIdentityOf`). */
export const participatingClubsOf = (p: Partial<CoverSource>): string[] => coverIdentityOf(p).participating;

function cover(w: Writer, p: DocumentPayload, title: string, lang: Lang, statusLine?: string | null) {
    const d = w.doc;
    w.y = TOP + 8;
    d.setFont(fam(d), 'normal'); d.setFontSize(9); d.setTextColor(...MUTED);
    d.text(sanitize(p.edition), M, w.y); w.y += 22;
    d.setFont(fam(d), 'bold'); d.setFontSize(10); d.setTextColor(...GOLD);
    d.text(sanitize(title.toUpperCase()), M, w.y); w.y += 22;
    const who = coverIdentityOf(p);
    w.flow(w.lines(who.projectName || '-', 20, CW, true), 20, BLUE, M, true);
    w.y += 4;
    w.flow(w.lines(`${who.clubName || ''}${p.district ? ` · ${p.district}` : ''}`, 11, CW), 11, INK);
    const otros = who.participating;
    if (otros.length) w.flow(w.lines(`${lang === 'en' ? 'Participating clubs' : 'Clubes participantes'}: ${otros.join(', ')}`, 9.5, CW), 9.5, INK);
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
        doc.setFont(fam(doc), 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
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

// ── v4.1345 — La ficha técnica que descarga el gestor desde «Mi Proyecto» ──
/** El logotipo (cualquier formato que el navegador lea) → PNG con su tamaño. */
async function prepareLogo(dataUrl: string | null | undefined): Promise<Brand['logo']> {
    if (!dataUrl || typeof Image === 'undefined') return null;
    try {
        const img = await new Promise<HTMLImageElement>((ok, fail) => {
            const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = dataUrl;
        });
        const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
        if (!w || !h) return null;
        // Se rasteriza a 3× la altura impresa para que se vea nítido.
        const scale = Math.min(1, 360 / h, 1400 / w) || 1;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
        const ctx = c.getContext('2d'); if (!ctx) return null;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        return { data: c.toDataURL('image/png'), w: c.width, h: c.height };
    } catch { return null; }
}

const CLUB_TITLE = 'Ficha técnica del proyecto';

function clubCover(w: Writer, p: DocumentPayload) {
    const d = w.doc;
    w.y = BRAND_TOP + 6;
    d.setFont(fam(d), 'bold'); d.setFontSize(9); d.setTextColor(...GOLD);
    d.text(CLUB_TITLE.toUpperCase(), M, w.y); w.y += 20;
    const who = coverIdentityOf(p);
    w.flow(w.lines(who.projectName || '-', 21, CW, true), 21, BLUE, M, true);
    w.y += 2;
    w.flow(w.lines(`${who.clubName || ''}${p.district ? ` · Distrito ${String(p.district).replace(/^(rotary\s*)?distrito\s*/i, '')}` : ''}`, 11, CW), 11, INK);
    const otros = who.participating;
    if (otros.length) w.flow(w.lines(`Clubes participantes: ${otros.join(', ')}`, 9.5, CW), 9.5, INK);
    w.flow([`${T.es.ref}: ${p.publicRef}`], 9, MUTED);
    w.y += 10;
    // Qué contiene: los formularios con su avance.
    const forms = p.es.groups.filter(g => g.source === 'form');
    if (forms.length) {
        const boxH = 22 + forms.length * 16;
        w.ensure(boxH + 10);
        d.setFillColor(...BAND); d.roundedRect?.(M, w.y - 4, CW, boxH, 6, 6, 'F') ?? d.rect(M, w.y - 4, CW, boxH, 'F');
        d.setFont(fam(d), 'bold'); d.setFontSize(8); d.setTextColor(...MUTED);
        d.text('CONTENIDO DE ESTA FICHA', M + 12, w.y + 10);
        let y = w.y + 27;
        for (const g of forms) {
            d.setFont(fam(d), 'normal'); d.setFontSize(9.5); d.setTextColor(...INK);
            d.text(sanitize(g.title), M + 12, y);
            const st = g.started === false ? 'Sin iniciar' : `${Math.round(Number(g.completionPct || 0))} % diligenciado`;
            d.setFont(fam(d), 'bold'); d.setTextColor(...(g.started === false ? MUTED : BLUE));
            d.text(st, M + CW - 12, y, { align: 'right' });
            y += 16;
        }
        w.y += boxH + 8;
    }
    d.setDrawColor(...LINE); d.setLineWidth(0.8); d.line(M, w.y, M + CW, w.y);
    w.y += 14;
}

function clubFinish(doc: any, p: DocumentPayload) {
    const total = doc.getNumberOfPages();
    const when = new Date(p.generatedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, PAGE_H - 40, PAGE_W - M, PAGE_H - 40);
        doc.setFont(fam(doc), 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
        doc.text(sanitize(`${p.publicRef} · Generada desde Mi Proyecto el ${when}`), M, PAGE_H - 28);
        doc.text(`Página ${i} de ${total}`, PAGE_W - M, PAGE_H - 28, { align: 'right' });
        doc.setFontSize(6.8);
        doc.text('Información diligenciada por el club. No incluye documento de identidad ni datos de pago.', M, PAGE_H - 18);
    }
}

/**
 * La ficha técnica del proyecto para el GESTOR: la misma información de la
 * ficha del comité (registro inicial, Formulación y Solicitud de Aportes del
 * FDD), con la cabecera de la Feria y Open Sans.
 */
export async function buildClubFichaPdf(p: DocumentPayload): Promise<any> {
    const doc = await newDoc();
    const brand: Brand = { logo: await prepareLogo(p.logo), title: CLUB_TITLE, edition: p.edition };
    const w = new Writer(doc, `${p.edition} · ${CLUB_TITLE}`, null, brand);
    w.pageChrome();
    clubCover(w, p);
    renderDossier(w, p.es, 'es');
    clubFinish(doc, p);
    return doc;
}

export const clubFichaFileName = (p: Pick<DocumentPayload, 'publicRef' | 'projectName'> & Partial<CoverSource>) => {
    const slug = String(coverIdentityOf(p).projectName || 'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    return `${p.publicRef}-${slug}-ficha-tecnica.pdf`;
};

/** El PDF de UN proyecto. */
export async function buildDossierPdf(p: DocumentPayload): Promise<any> {
    const doc = await newDoc();
    await drawProject(doc, p, true);
    finish(doc, p, p.kind === 'en' ? 'en' : 'es');
    return doc;
}

export const pdfFileName = (p: Pick<DocumentPayload, 'publicRef' | 'projectName' | 'kind'>) => {
    const slug = String(p.projectName || 'proyecto').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
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
        d.setFont(fam(d), 'bold'); d.setFontSize(10); d.setTextColor(...GOLD);
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
