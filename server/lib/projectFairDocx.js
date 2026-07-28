// ════════════════════════════════════════════════════════════════════
// Exportación del formulario maestro a Word (.docx) y a texto plano
// v4.608.0
//
// Recorre la MISMA plantilla que usa el panel del club, así que cualquier
// campo que el administrador agregue o quite aparece —o desaparece— del
// documento sin tocar este archivo.
// ════════════════════════════════════════════════════════════════════
import {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';

const BLUE = '17458F';
const GOLD = 'F7A81B';

const fmtValue = (value, field) => {
    if (value === null || value === undefined || value === '') return '—';
    if (field?.type === 'multiselect') return Array.isArray(value) ? value.join(', ') || '—' : String(value);
    if (field?.type === 'checkbox') return value ? 'Sí' : 'No';
    if (field?.type === 'currency') {
        const n = Number(value);
        return Number.isNaN(n) ? String(value) : `USD $${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (field?.type === 'number') {
        const n = Number(value);
        return Number.isNaN(n) ? String(value) : n.toLocaleString('es-CO');
    }
    return String(value);
};

const cell = (text, { bold = false, bg = null, width = null } = {}) => new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: bg ? { fill: bg } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), bold, size: 18 })] })],
});

// Las filas vacías de un repetidor no se imprimen: el documento refleja lo
// que el club realmente escribió.
const repeaterTable = (field, rows) => {
    const columns = field.columns || [];
    const filled = (Array.isArray(rows) ? rows : []).filter(r =>
        r && Object.values(r).some(v => String(v ?? '').trim() !== '')
    );
    if (!filled.length) return [new Paragraph({ children: [new TextRun({ text: '—', size: 20, color: '888888' })] })];

    return [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
        },
        rows: [
            new TableRow({ children: columns.map(c => cell(c.label, { bold: true, bg: 'F1F5F9' })) }),
            ...filled.map(row => new TableRow({
                children: columns.map(c => cell(fmtValue(row[c.key], c))),
            })),
        ],
    })];
};

/**
 * Documento Word de una postulación.
 * @param {object} submission  Datos de la inscripción (referencia, club, pago).
 * @param {object} template    Plantilla del formulario maestro.
 * @param {object} answers     Respuestas { seccion: { campo: valor } }.
 * @param {object} meta        { edition, includePayments }
 */
export const buildProjectDocx = async (submission, template, answers = {}, meta = {}) => {
    const children = [];
    const edition = meta.edition || {};

    children.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: edition.name || 'Feria de Proyectos Rotary Colombia', bold: true, size: 30, color: BLUE })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({
                text: [edition.city, edition.country].filter(Boolean).join(', ') || '',
                size: 20, color: '666666',
            })],
        }),
        new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: submission.projectName || 'Proyecto', bold: true, size: 26 })],
        }),
    );

    // Ficha de identificación
    const ident = [
        ['Referencia', submission.publicRef],
        ['Club Rotario', submission.clubName],
        ['Distrito', submission.district],
        ['Responsable', `${submission.firstName || ''} ${submission.lastName || ''}`.trim()],
        ['Correo', submission.email],
        ['Contacto', submission.phone],
        ['Fecha de inscripción', submission.createdAt ? new Date(submission.createdAt).toLocaleDateString('es-CO') : ''],
    ];
    if (meta.includePayments) {
        ident.push(['Estado del pago', submission.status === 'paid' ? 'Pago confirmado' : submission.status]);
        if (submission.stripePaymentIntentId) ident.push(['Referencia de pago', submission.stripePaymentIntentId]);
    }
    children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
            insideVertical: { style: BorderStyle.NONE },
        },
        rows: ident.filter(([, v]) => v).map(([k, v]) => new TableRow({
            children: [cell(k, { bold: true, width: 30 }), cell(v, { width: 70 })],
        })),
    }));
    children.push(new Paragraph({ text: '', spacing: { after: 240 } }));

    for (const section of template?.sections || []) {
        children.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 320, after: 40 },
            children: [new TextRun({ text: section.title, bold: true, size: 24, color: BLUE })],
        }));
        if (section.description) {
            children.push(new Paragraph({
                spacing: { after: 140 },
                children: [new TextRun({ text: section.description, italics: true, size: 18, color: '777777' })],
            }));
        }

        for (const field of section.fields || []) {
            const value = answers?.[section.key]?.[field.key];
            children.push(new Paragraph({
                spacing: { before: 160, after: 40 },
                children: [new TextRun({ text: field.label, bold: true, size: 20, color: '333333' })],
            }));
            if (field.type === 'repeater') {
                children.push(...repeaterTable(field, value));
            } else {
                const text = fmtValue(value, field);
                // Los párrafos largos conservan sus saltos de línea.
                String(text).split('\n').forEach(line => {
                    children.push(new Paragraph({
                        spacing: { after: 40 },
                        children: [new TextRun({ text: line || ' ', size: 20 })],
                    }));
                });
            }
        }
    }

    children.push(
        new Paragraph({ text: '', spacing: { before: 400 } }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
                text: `Documento generado el ${new Date().toLocaleString('es-CO')} · ${edition.name || 'Feria de Proyectos Rotary Colombia'}`,
                size: 16, color: '999999',
            })],
        }),
    );

    const doc = new Document({
        creator: edition.name || 'Feria de Proyectos Rotary Colombia',
        title: `${submission.projectName || 'Proyecto'} — ${submission.publicRef || ''}`,
        styles: {
            default: { document: { run: { font: 'Calibri' } } },
        },
        sections: [{
            properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
            children,
        }],
    });
    return Packer.toBuffer(doc);
};

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export { GOLD };
