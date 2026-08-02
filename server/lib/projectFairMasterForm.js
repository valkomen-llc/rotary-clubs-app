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
//   text · textarea · number · currency · percent · date · select · multiselect
//   checkbox · url · email · phone · repeater (filas que agrega el club)
//   matrix (tabla de filas fijas × columnas) · file · computed (derivado)
//
// v4.642 — El motor que recorre la plantilla (avance, validación, campos
// derivados) vive ahora en `projectFormEngine.js`, compartido con los demás
// formularios del proyecto. Aquí queda sólo la plantilla. Se reexporta para
// no romper a quien ya importaba estas funciones desde este archivo.
// ════════════════════════════════════════════════════════════════════
export {
    FIELD_TYPES, flattenFields, applicantFields, completionOf, missingRequired,
    hasValue, computeValue, withComputed, validateAnswers, stripProtected,
} from './projectFormEngine.js';

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
        // v4.677 — La ciudad ya se pide en la postulación: se precarga en vez
        // de volver a preguntarla. (No hay campo de país en esta plantilla.)
        city: 'identificacion.city',
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

// El motor (avance, validación, campos derivados) se reexporta arriba desde
// `projectFormEngine.js`: esta plantilla ya no lo implementa.
