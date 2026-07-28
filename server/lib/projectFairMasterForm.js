// ════════════════════════════════════════════════════════════════════
// Plantilla del formulario maestro de formulación de proyectos
// v4.617.0
//
// El formulario NO está codificado: se define aquí como datos (secciones →
// campos) y se guarda en la configuración de la convocatoria, de modo que el
// administrador puede reordenarlo, cambiar textos, agregar o quitar campos
// desde el panel sin tocar código. El panel del club lo renderiza, y las
// descargas en Word y PDF lo recorren para armar el documento.
//
// Esta plantilla reproduce el formulario oficial en Word de la Feria de
// Proyectos (Valledupar): mismas preguntas, mismo orden y mismos límites de
// extensión, para que lo que llena el club en línea y lo que se descarga en
// Word sean el mismo documento.
//
// Tipos de campo soportados:
//   text · textarea · number · currency · date · select · multiselect
//   checkbox · url · email · phone · repeater (filas que agrega el club)
//   matrix (tabla de filas fijas × columnas) · file
// ════════════════════════════════════════════════════════════════════

export const FIELD_TYPES = [
    'text', 'textarea', 'number', 'currency', 'date', 'select',
    'multiselect', 'checkbox', 'url', 'email', 'phone', 'repeater', 'matrix', 'file',
];

// Aproximación de caracteres por línea del formulario impreso, para traducir
// los "(N líneas máximo)" del documento original a un tope de caracteres.
const CHARS_PER_LINE = 120;
const lines = (n) => n * CHARS_PER_LINE;

// Versión de la plantilla base. Sirve para saber si la copia guardada en la
// convocatoria viene de una plantilla anterior a la actual: una fila sin
// `version` es de antes de la plantilla oficial en Word (v4.617) y se
// reemplaza al leerla. A partir de aquí, lo guardado manda siempre.
export const MASTER_FORM_VERSION = 2;

export const DEFAULT_MASTER_FORM = {
    version: MASTER_FORM_VERSION,
    enabled: true,
    title: 'Formulación del proyecto',
    intro: 'Completa la información de tu proyecto. Puedes guardar y volver cuantas veces necesites: el avance queda registrado. Cuando esté completo, envíalo para la revisión del comité.',
    // Campos que se precargan desde la postulación inicial para no pedirlos
    // dos veces. Cada clave es un dato de la inscripción y su valor, el campo
    // de la plantilla donde se copia ('sección.campo'). Si se reordena o
    // renombra la plantilla, basta actualizar este mapa.
    // Datos disponibles: projectName · clubName · district · city · country ·
    // focusArea · contactName · contactEmail · contactPhone · budgetUsd
    prefill: {
        projectName: 'identificacion.projectName',
        clubName: 'identificacion.clubName',
        district: 'identificacion.district',
        focusArea: 'identificacion.focusAreas',
        contactName: 'contacto.contactName',
        contactEmail: 'contacto.contactEmail',
        contactPhone: 'contacto.contactPhone',
    },
    // Elementos del documento en Word que no son campos del formulario:
    // encabezado, texto de cierre y recuadro con los datos de pago. Se editan
    // desde la configuración igual que el resto.
    document: {
        // Vacío = se arma con el nombre de la edición y la ciudad.
        title: '',
        // URLs de los logos del encabezado (opcional). Si no se pueden
        // descargar, el documento sale igual pero sin ellos.
        logos: [],
        closing: 'Gracias a su apoyo nuestro club ayudará a la comunidad solventando sus más importantes necesidades. Apreciamos el análisis de este proyecto. Para más información contactar a:',
        paymentBox: {
            title: 'EL PAGO SE DEBE REALIZAR A NOMBRE DE:',
            lines: [
                'Fundación colombiana de rotarios (COLROTARIOS)',
                'Banco de Occidente',
                'CUENTA DE AHORROS NO. 019-84839-9',
            ],
            url: 'www.feriadeproyectosrotarycolombia.org',
        },
    },
    sections: [
        {
            key: 'identificacion',
            title: 'Identificación del proyecto',
            description: 'Datos del club que postula y del proyecto.',
            fields: [
                { key: 'clubName', label: 'Club Rotario', type: 'text', required: true, width: 'half' },
                { key: 'district', label: 'Distrito Rotario', type: 'text', required: true, width: 'half' },
                { key: 'city', label: 'Ciudad', type: 'text', required: true, width: 'half' },
                { key: 'projectName', label: 'Nombre del proyecto', type: 'text', required: true, width: 'half' },
                { key: 'focusAreas', label: 'Áreas de interés', type: 'multiselect', required: true, width: 'full',
                  help: 'Puedes seleccionar más de una si el proyecto es integral.', optionsFrom: 'focusAreas' },
            ],
        },
        {
            key: 'objetivos',
            title: 'Objetivos del proyecto',
            fields: [
                { key: 'generalObjective', label: 'Objetivo general', type: 'textarea', required: true,
                  rows: 5, maxLength: lines(10), width: 'full', help: 'Máximo 10 líneas.' },
                { key: 'projectDescription', label: 'Descripción del proyecto', type: 'textarea', required: true,
                  rows: 7, maxLength: lines(15), width: 'full', help: 'Máximo 15 líneas.' },
            ],
        },
        {
            key: 'necesidades',
            title: 'Necesidades y beneficiarios',
            description: 'Describa qué necesidades identificó, cómo el proyecto atenderá esas necesidades, quién será beneficiario del proyecto y cite un número estimado de beneficiarios.',
            fields: [
                { key: 'needs', label: 'Necesidades', type: 'textarea', required: true,
                  rows: 4, maxLength: lines(5), width: 'full', help: 'Máximo 5 líneas.' },
                { key: 'needsResponse', label: 'Atención de necesidades', type: 'textarea', required: true,
                  rows: 4, maxLength: lines(5), width: 'full', help: 'Máximo 5 líneas.' },
                { key: 'beneficiaries', label: 'Beneficiarios de este proyecto', type: 'textarea', required: true,
                  rows: 4, maxLength: lines(5), width: 'full', help: 'Máximo 5 líneas.' },
                { key: 'beneficiariesCount', label: 'Número de beneficiarios', type: 'textarea', required: true,
                  rows: 4, maxLength: lines(5), width: 'full', help: 'Máximo 5 líneas.' },
            ],
        },
        {
            key: 'sostenibilidad',
            title: 'Sostenibilidad y participación de la comunidad',
            fields: [
                { key: 'sustainability', label: 'Sostenibilidad', type: 'textarea', required: true,
                  rows: 4, maxLength: lines(5), width: 'full',
                  help: 'Explique cómo seguirá funcionando el proyecto una vez se termine el aporte económico que reciba en este proyecto. Máximo 5 líneas.' },
                { key: 'communityRole', label: '¿Está involucrada la comunidad?', type: 'textarea', required: true,
                  rows: 4, maxLength: lines(5), width: 'full',
                  help: 'Describa el rol de la comunidad local en la implementación y continuidad del proyecto. Máximo 5 líneas.' },
            ],
        },
        {
            key: 'presupuesto',
            title: 'Presupuesto',
            description: 'Diligencie los valores que apliquen a su proyecto.',
            fields: [
                { key: 'budgetTable', label: 'Presupuesto del proyecto', type: 'matrix', required: true, width: 'full',
                  rowsLabel: 'Concepto',
                  columns: [
                      { key: 'pesos', label: 'Valor en pesos', type: 'currency' },
                      { key: 'usd', label: 'Valor en dólares', type: 'currency' },
                  ],
                  rows: [
                      { key: 'projectCost', label: 'Costo del Proyecto' },
                      { key: 'localClub', label: 'Aporte Club local' },
                      { key: 'internationalClubs', label: 'Aporte clubes internacionales' },
                      { key: 'colombianDistrict', label: 'Distrito Colombiano' },
                      { key: 'internationalDistrict', label: 'Distrito Internacional' },
                      { key: 'rotaryFoundation', label: 'Fundación Rotaria' },
                  ] },
            ],
        },
        {
            key: 'contacto',
            title: 'Datos de contacto',
            description: 'Para más información sobre el proyecto, contactar a:',
            fields: [
                { key: 'contactName', label: 'Nombre', type: 'text', required: true, width: 'full' },
                { key: 'contactEmail', label: 'Email', type: 'email', required: true, width: 'half' },
                { key: 'contactPhone', label: 'Teléfono', type: 'phone', required: true, width: 'half' },
            ],
        },
    ],
};

/** Todos los campos de la plantilla, aplanados, para validar y calcular avance. */
export const flattenFields = (template) =>
    (template?.sections || []).flatMap(section =>
        (section.fields || []).map(field => ({ ...field, sectionKey: section.key, sectionTitle: section.title }))
    );

/**
 * Porcentaje de avance: proporción de campos obligatorios con contenido.
 * Si la plantilla no tiene campos obligatorios, se mide sobre todos.
 */
export const completionOf = (template, answers = {}) => {
    const fields = flattenFields(template);
    const required = fields.filter(f => f.required);
    const target = required.length ? required : fields;
    if (!target.length) return 0;

    const filled = target.filter(f => hasValue(answers?.[f.sectionKey]?.[f.key], f.type)).length;
    return Math.round((filled / target.length) * 100);
};

/** Campos obligatorios sin responder (para avisar antes de enviar). */
export const missingRequired = (template, answers = {}) =>
    flattenFields(template)
        .filter(f => f.required && !hasValue(answers?.[f.sectionKey]?.[f.key], f.type))
        .map(f => ({ section: f.sectionTitle, sectionKey: f.sectionKey, key: f.key, label: f.label }));

const anyCellFilled = (obj) =>
    !!obj && typeof obj === 'object' && Object.values(obj).some(row =>
        row && typeof row === 'object'
            ? Object.values(row).some(v => String(v ?? '').trim() !== '')
            : String(row ?? '').trim() !== ''
    );

export const hasValue = (value, type) => {
    if (value === null || value === undefined) return false;
    if (type === 'repeater') {
        return Array.isArray(value) && value.some(row =>
            row && Object.values(row).some(v => String(v ?? '').trim() !== '')
        );
    }
    if (type === 'matrix') return anyCellFilled(value);
    if (type === 'multiselect') return Array.isArray(value) && value.length > 0;
    if (type === 'checkbox') return value === true;
    if (type === 'number' || type === 'currency') return String(value).trim() !== '' && !Number.isNaN(Number(value));
    return String(value).trim() !== '';
};
