// ════════════════════════════════════════════════════════════════════
// Exportación del formulario maestro a Word (.docx)
// v4.617.0
//
// Recorre la MISMA plantilla que usa el panel del club, así que cualquier
// campo que el administrador agregue o quite aparece —o desaparece— del
// documento sin tocar este archivo.
//
// El diseño replica el formulario oficial en Word de la feria: encabezado con
// los logos, título en azul centrado, etiquetas en azul mayúscula, las áreas
// de interés como tabla con casillas marcadas, el presupuesto como tabla de
// conceptos y el recuadro con los datos de la cuenta al pie.
// ════════════════════════════════════════════════════════════════════
import {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
} from 'docx';

const BLUE = '1F4E9B';          // azul de los títulos y etiquetas
const TABLE_FILL = 'CCCCFF';    // relleno lila de las tablas del formulario
const GOLD = 'F7A81B';

const CHECKED = '☒';
const UNCHECKED = '☐';

const txt = (text, opts = {}) => new TextRun({ text: String(text ?? ''), size: 20, ...opts });

const label = (text) => new Paragraph({
    spacing: { before: 200, after: 40 },
    children: [txt(String(text || '').toUpperCase() + ':', { bold: true, color: BLUE })],
});

// Un valor puede traer saltos de línea: se respetan tal cual los escribió el club.
const valueParagraphs = (text) =>
    String(text ?? '—').split('\n').map(line => new Paragraph({
        spacing: { after: 40 },
        children: [txt(line || ' ')],
    }));

const fmtValue = (value, field) => {
    if (value === null || value === undefined || value === '') return '—';
    if (field?.type === 'multiselect') return Array.isArray(value) ? value.join(', ') || '—' : String(value);
    if (field?.type === 'checkbox') return value ? 'Sí' : 'No';
    if (field?.type === 'currency') {
        const n = Number(value);
        return Number.isNaN(n) ? String(value) : n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (field?.type === 'number') {
        const n = Number(value);
        return Number.isNaN(n) ? String(value) : n.toLocaleString('es-CO');
    }
    return String(value);
};

const cell = (text, { bold = false, bg = null, width = null, align = undefined } = {}) => new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: bg ? { fill: bg } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ alignment: align, children: [txt(text, { bold, size: 18 })] })],
});

const tableBorders = (color = '9999CC') => ({
    top: { style: BorderStyle.SINGLE, size: 4, color },
    bottom: { style: BorderStyle.SINGLE, size: 4, color },
    left: { style: BorderStyle.SINGLE, size: 4, color },
    right: { style: BorderStyle.SINGLE, size: 4, color },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color },
});

/** Áreas de interés: tabla de dos columnas con la casilla marcada, como el original. */
const areasTable = (options, selected) => {
    const chosen = new Set((Array.isArray(selected) ? selected : []).map(s => String(s).trim().toLowerCase()));
    const mark = (opt) => `${chosen.has(String(opt).trim().toLowerCase()) ? CHECKED : UNCHECKED}  ${opt}`;
    const rows = [];
    for (let i = 0; i < options.length; i += 2) {
        rows.push(new TableRow({
            children: [
                cell(mark(options[i]), { bold: true, bg: TABLE_FILL, width: 50 }),
                cell(options[i + 1] ? mark(options[i + 1]) : '', { bold: true, bg: TABLE_FILL, width: 50 }),
            ],
        }));
    }
    if (!rows.length) return [new Paragraph({ children: [txt('—')] })];
    return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders(), rows })];
};

/** Tabla de filas fijas (presupuesto): concepto + una columna por valor. */
const matrixTable = (field, value) => {
    const columns = field.columns || [];
    const rows = field.rows || [];
    if (!rows.length || !columns.length) return [new Paragraph({ children: [txt('—')] })];

    const conceptWidth = 40;
    const valueWidth = Math.round((100 - conceptWidth) / columns.length);

    return [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorders(),
        rows: [
            new TableRow({
                children: [
                    cell(field.rowsLabel || 'Concepto', { bold: true, bg: TABLE_FILL, width: conceptWidth, align: AlignmentType.CENTER }),
                    ...columns.map(c => cell(String(c.label).toUpperCase(), { bold: true, bg: TABLE_FILL, width: valueWidth, align: AlignmentType.CENTER })),
                ],
            }),
            ...rows.map(row => new TableRow({
                children: [
                    cell(row.label, { bold: true, bg: TABLE_FILL, width: conceptWidth }),
                    ...columns.map(c => cell(
                        fmtValue(value?.[row.key]?.[c.key], c),
                        { width: valueWidth, align: AlignmentType.RIGHT },
                    )),
                ],
            })),
        ],
    })];
};

// Las filas vacías de un repetidor no se imprimen: el documento refleja lo
// que el club realmente escribió.
const repeaterTable = (field, rows) => {
    const columns = field.columns || [];
    const filled = (Array.isArray(rows) ? rows : []).filter(r =>
        r && Object.values(r).some(v => String(v ?? '').trim() !== '')
    );
    if (!filled.length) return [new Paragraph({ children: [txt('—', { color: '888888' })] })];

    return [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorders(),
        rows: [
            new TableRow({ children: columns.map(c => cell(c.label, { bold: true, bg: TABLE_FILL })) }),
            ...filled.map(row => new TableRow({ children: columns.map(c => cell(fmtValue(row[c.key], c))) })),
        ],
    })];
};

/**
 * Logos del encabezado. Son opcionales: si no hay URLs configuradas, o no se
 * pueden descargar, el documento sale igual pero sin ellos — nunca falla la
 * descarga por un logo.
 */
const headerLogos = async (urls) => {
    const list = (Array.isArray(urls) ? urls : []).filter(Boolean).slice(0, 3);
    if (!list.length) return [];

    const runs = [];
    for (const url of list) {
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const type = (res.headers.get('content-type') || '').toLowerCase();
            const ext = type.includes('png') ? 'png'
                : type.includes('gif') ? 'gif'
                : /jpe?g/.test(type) ? 'jpg'
                : /\.png($|\?)/i.test(url) ? 'png'
                : /\.gif($|\?)/i.test(url) ? 'gif'
                : /\.jpe?g($|\?)/i.test(url) ? 'jpg' : null;
            if (!ext) continue;
            const data = Buffer.from(await res.arrayBuffer());
            runs.push(new ImageRun({ data, type: ext, transformation: { width: 150, height: 46 } }));
        } catch (err) {
            console.warn('[project-fair-docx] No pude descargar un logo del encabezado:', err?.message);
        }
    }
    if (!runs.length) return [];
    return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: runs })];
};

/** Recuadro con los datos de la cuenta, al pie del documento. */
const paymentBox = (box) => {
    if (!box || (!box.title && !(box.lines || []).length)) return [];
    const children = [];
    if (box.title) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(box.title, { bold: true, size: 16 })] }));
    (box.lines || []).forEach(line => {
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(line, { size: 16 })] }));
    });
    if (box.url) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [txt(box.url, { size: 16, color: BLUE, bold: true })] }));

    return [new Table({
        width: { size: 70, type: WidthType.PERCENTAGE },
        alignment: AlignmentType.CENTER,
        borders: tableBorders('999999'),
        rows: [new TableRow({
            children: [new TableCell({ margins: { top: 120, bottom: 120, left: 160, right: 160 }, children })],
        })],
    })];
};

/**
 * Documento Word de una postulación.
 * @param {object} submission  Datos de la inscripción (referencia, club, pago).
 * @param {object} template    Plantilla del formulario maestro.
 * @param {object} answers     Respuestas { seccion: { campo: valor } }.
 * @param {object} meta        { edition, focusAreas, includePayments }
 */
export const buildProjectDocx = async (submission, template, answers = {}, meta = {}) => {
    const edition = meta.edition || {};
    const docCfg = template?.document || {};
    const children = [];

    children.push(...await headerLogos(docCfg.logos));

    const title = docCfg.title
        || [edition.name, edition.city, edition.year].filter(Boolean).join(' — ')
        || 'Feria de Proyectos Rotary Colombia';
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 280 },
        children: [txt(String(title).toUpperCase(), { bold: true, size: 26, color: BLUE })],
    }));

    // Referencia de la inscripción: no está en el formulario impreso, pero es
    // lo que permite cruzar el documento con el pago y el registro.
    if (submission.publicRef) {
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [txt(`Referencia de inscripción: ${submission.publicRef}`, { size: 18, color: '666666' })],
        }));
    }

    for (const section of template?.sections || []) {
        if (section.title) {
            children.push(new Paragraph({
                spacing: { before: 340, after: 60 },
                children: [txt(String(section.title).toUpperCase(), { bold: true, size: 22, color: BLUE })],
            }));
        }
        if (section.description) {
            children.push(new Paragraph({
                spacing: { after: 120 },
                children: [txt(section.description, { size: 18, color: '555555' })],
            }));
        }

        for (const field of section.fields || []) {
            const value = answers?.[section.key]?.[field.key];
            children.push(label(field.label));

            if (field.type === 'matrix') {
                children.push(...matrixTable(field, value));
            } else if (field.type === 'repeater') {
                children.push(...repeaterTable(field, value));
            } else if (field.type === 'multiselect') {
                const options = field.optionsFrom === 'focusAreas'
                    ? (meta.focusAreas || []).map(a => a.label || a)
                    : (field.options || []);
                children.push(...(options.length
                    ? areasTable(options, value)
                    : valueParagraphs(fmtValue(value, field))));
            } else {
                children.push(...valueParagraphs(fmtValue(value, field)));
            }
        }
    }

    if (docCfg.closing) {
        children.push(new Paragraph({
            spacing: { before: 360, after: 160 },
            children: [txt(docCfg.closing, { size: 19 })],
        }));
    }

    if (meta.includePayments) {
        children.push(new Paragraph({
            spacing: { before: 240, after: 60 },
            children: [txt('ESTADO DEL PAGO:', { bold: true, color: BLUE })],
        }));
        children.push(new Paragraph({
            children: [txt(submission.status === 'paid' ? 'Pago confirmado' : String(submission.status || '—'))],
        }));
    }

    const box = paymentBox(docCfg.paymentBox);
    if (box.length) {
        children.push(new Paragraph({ text: '', spacing: { before: 320 } }));
        children.push(...box);
    }

    const doc = new Document({
        creator: edition.name || 'Feria de Proyectos Rotary Colombia',
        title: `${submission.projectName || 'Proyecto'} — ${submission.publicRef || ''}`,
        styles: { default: { document: { run: { font: 'Calibri' } } } },
        sections: [{
            properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
            children,
        }],
    });
    return Packer.toBuffer(doc);
};

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export { GOLD };
