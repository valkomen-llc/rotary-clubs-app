// ════════════════════════════════════════════════════════════════════
// Plantilla del formulario maestro de formulación de proyectos
// v4.608.0
//
// El formulario NO está codificado: se define aquí como datos (secciones →
// campos) y se guarda en la configuración de la convocatoria, de modo que el
// administrador puede reordenarlo, cambiar textos, agregar o quitar campos
// desde el panel sin tocar código. El panel del club lo renderiza, y las
// descargas en Word y PDF lo recorren para armar el documento.
//
// Esta plantilla base sigue la estructura de una subvención global de Rotary
// (comunidad y diagnóstico, objetivos, actividades, medición, presupuesto,
// sostenibilidad y alianzas). Es un punto de partida editable, no una copia
// del formulario oficial de Rotary International.
//
// Tipos de campo soportados:
//   text · textarea · number · currency · date · select · multiselect
//   checkbox · url · email · phone · repeater (tabla de filas) · file
// ════════════════════════════════════════════════════════════════════

export const FIELD_TYPES = [
    'text', 'textarea', 'number', 'currency', 'date', 'select',
    'multiselect', 'checkbox', 'url', 'email', 'phone', 'repeater', 'file',
];

export const DEFAULT_MASTER_FORM = {
    enabled: true,
    title: 'Formulación del proyecto',
    intro: 'Completa la información de tu proyecto. Puedes guardar y volver cuantas veces necesites: el avance queda registrado. Cuando esté completo, envíalo para la revisión del comité.',
    // Campos que se precargan desde la postulación inicial y el club ya no
    // vuelve a escribir (se muestran como referencia, no editables).
    prefill: {
        projectName: 'general.projectName',
        focusArea: 'general.focusAreas',
        budgetUsd: 'budget.totalUsd',
    },
    sections: [
        {
            key: 'general',
            title: 'Información general del proyecto',
            description: 'Datos de identificación de la iniciativa.',
            fields: [
                { key: 'projectName', label: 'Nombre del proyecto', type: 'text', required: true, width: 'full' },
                { key: 'focusAreas', label: 'Áreas de enfoque de Rotary', type: 'multiselect', required: true, width: 'full',
                  help: 'Puedes seleccionar más de una si el proyecto es integral.', optionsFrom: 'focusAreas' },
                { key: 'country', label: 'País', type: 'text', required: true, width: 'half' },
                { key: 'department', label: 'Departamento', type: 'text', required: true, width: 'half' },
                { key: 'city', label: 'Municipio o ciudad', type: 'text', required: true, width: 'half' },
                { key: 'community', label: 'Comunidad o barrio específico', type: 'text', required: false, width: 'half' },
                { key: 'startDate', label: 'Fecha estimada de inicio', type: 'date', required: true, width: 'half' },
                { key: 'endDate', label: 'Fecha estimada de finalización', type: 'date', required: true, width: 'half' },
                { key: 'stage', label: 'Estado actual del proyecto', type: 'select', required: true, width: 'half',
                  options: ['Idea estructurada', 'Listo para implementar', 'En ejecución', 'En ejecución con financiación parcial'] },
                { key: 'summary', label: 'Resumen ejecutivo', type: 'textarea', required: true, rows: 5, maxLength: 1500, width: 'full',
                  help: 'En pocas líneas: qué hace el proyecto, a quién beneficia y qué cambio produce. Es lo primero que leerá un posible aliado.' },
            ],
        },
        {
            key: 'sponsors',
            title: 'Club y socios del proyecto',
            description: 'Quién responde por el proyecto y con quién se ejecuta.',
            fields: [
                { key: 'clubName', label: 'Club Rotario patrocinador', type: 'text', required: true, width: 'half' },
                { key: 'district', label: 'Distrito', type: 'text', required: true, width: 'half' },
                { key: 'contactName', label: 'Responsable del proyecto', type: 'text', required: true, width: 'half' },
                { key: 'contactRole', label: 'Cargo en el club', type: 'text', required: false, width: 'half' },
                { key: 'contactEmail', label: 'Correo del responsable', type: 'email', required: true, width: 'half' },
                { key: 'contactPhone', label: 'Teléfono o WhatsApp', type: 'phone', required: true, width: 'half' },
                { key: 'internationalPartner', label: 'Club o distrito patrocinador internacional', type: 'text', required: false, width: 'full',
                  help: 'Si ya cuentas con un aliado internacional. Déjalo vacío si lo estás buscando en la feria.' },
                { key: 'partners', label: 'Organizaciones aliadas', type: 'repeater', required: false, width: 'full',
                  help: 'Entidades públicas, privadas o comunitarias que participan.',
                  columns: [
                      { key: 'name', label: 'Organización', type: 'text' },
                      { key: 'role', label: 'Rol en el proyecto', type: 'text' },
                      { key: 'contribution', label: 'Aporte (recursos, técnica, mano de obra)', type: 'text' },
                  ] },
            ],
        },
        {
            key: 'diagnosis',
            title: 'Comunidad y diagnóstico',
            description: 'La necesidad que atiende el proyecto y cómo se identificó.',
            fields: [
                { key: 'communityDescription', label: 'Descripción de la comunidad beneficiaria', type: 'textarea', required: true, rows: 4, width: 'full' },
                { key: 'problem', label: 'Problema o necesidad que se atiende', type: 'textarea', required: true, rows: 5, width: 'full' },
                { key: 'needsAssessment', label: '¿Cómo se identificó la necesidad?', type: 'textarea', required: true, rows: 4, width: 'full',
                  help: 'Describe la evaluación de necesidades: quién participó de la comunidad, cuándo y con qué método.' },
                { key: 'directBeneficiaries', label: 'Beneficiarios directos', type: 'number', required: true, width: 'half' },
                { key: 'indirectBeneficiaries', label: 'Beneficiarios indirectos', type: 'number', required: false, width: 'half' },
                { key: 'population', label: 'Población objetivo', type: 'multiselect', required: false, width: 'full',
                  options: ['Niñez', 'Adolescencia y juventud', 'Mujeres', 'Adultos mayores', 'Comunidades rurales',
                            'Comunidades indígenas', 'Comunidades afrodescendientes', 'Población migrante',
                            'Personas con discapacidad', 'Población en general'] },
            ],
        },
        {
            key: 'objectives',
            title: 'Objetivos y actividades',
            description: 'Qué se propone lograr y cómo.',
            fields: [
                { key: 'generalObjective', label: 'Objetivo general', type: 'textarea', required: true, rows: 3, width: 'full' },
                { key: 'specificObjectives', label: 'Objetivos específicos', type: 'repeater', required: true, width: 'full',
                  columns: [{ key: 'objective', label: 'Objetivo específico', type: 'text' }] },
                { key: 'activities', label: 'Actividades principales', type: 'repeater', required: true, width: 'full',
                  columns: [
                      { key: 'activity', label: 'Actividad', type: 'text' },
                      { key: 'responsible', label: 'Responsable', type: 'text' },
                      { key: 'timeline', label: 'Mes o periodo', type: 'text' },
                  ] },
                { key: 'expectedResults', label: 'Resultados esperados', type: 'textarea', required: true, rows: 4, width: 'full' },
            ],
        },
        {
            key: 'measurement',
            title: 'Medición del impacto',
            description: 'Cómo se sabrá que el proyecto funcionó.',
            fields: [
                { key: 'indicators', label: 'Indicadores', type: 'repeater', required: true, width: 'full',
                  columns: [
                      { key: 'indicator', label: 'Indicador', type: 'text' },
                      { key: 'baseline', label: 'Línea base', type: 'text' },
                      { key: 'target', label: 'Meta', type: 'text' },
                      { key: 'source', label: 'Medio de verificación', type: 'text' },
                  ] },
                { key: 'measurementResponsible', label: '¿Quién mide y con qué frecuencia?', type: 'textarea', required: true, rows: 3, width: 'full' },
            ],
        },
        {
            key: 'budget',
            title: 'Presupuesto',
            description: 'Todos los valores en dólares estadounidenses (USD).',
            fields: [
                { key: 'totalUsd', label: 'Presupuesto total del proyecto', type: 'currency', required: true, width: 'half' },
                { key: 'clubContribution', label: 'Aporte del club o distrito', type: 'currency', required: true, width: 'half' },
                { key: 'securedFunds', label: 'Recursos ya asegurados', type: 'currency', required: false, width: 'half' },
                { key: 'requestedAmount', label: 'Monto que se busca en la feria', type: 'currency', required: true, width: 'half' },
                { key: 'breakdown', label: 'Detalle del presupuesto', type: 'repeater', required: true, width: 'full',
                  columns: [
                      { key: 'concept', label: 'Concepto', type: 'text' },
                      { key: 'quantity', label: 'Cantidad', type: 'number' },
                      { key: 'unitCost', label: 'Valor unitario (USD)', type: 'currency' },
                      { key: 'total', label: 'Total (USD)', type: 'currency' },
                      { key: 'source', label: 'Fuente de financiación', type: 'text' },
                  ] },
                { key: 'quotes', label: '¿Cuenta con cotizaciones de respaldo?', type: 'select', required: false, width: 'half',
                  options: ['Sí, adjuntas', 'Sí, en trámite', 'Todavía no'] },
            ],
        },
        {
            key: 'sustainability',
            title: 'Sostenibilidad',
            description: 'Qué pasa con el proyecto cuando termine la financiación.',
            fields: [
                { key: 'sustainabilityPlan', label: '¿Cómo se sostiene el proyecto al finalizar?', type: 'textarea', required: true, rows: 5, width: 'full' },
                { key: 'operator', label: '¿Quién opera y mantiene lo entregado?', type: 'textarea', required: true, rows: 3, width: 'full' },
                { key: 'training', label: 'Capacitación prevista para la comunidad', type: 'textarea', required: false, rows: 3, width: 'full' },
                { key: 'maintenanceFunds', label: 'Recursos previstos para operación y mantenimiento', type: 'textarea', required: false, rows: 3, width: 'full' },
            ],
        },
        {
            key: 'fair',
            title: 'Presentación en la feria',
            description: 'Lo que verán los posibles aliados.',
            fields: [
                { key: 'seeking', label: '¿Qué busca en la feria?', type: 'multiselect', required: true, width: 'full',
                  options: ['Cofinanciación', 'Club patrocinador internacional', 'Asistencia técnica',
                            'Aliado corporativo', 'Voluntariado especializado', 'Visibilidad'] },
                { key: 'pitch', label: 'Mensaje breve para posibles aliados', type: 'textarea', required: true, rows: 4, maxLength: 800, width: 'full',
                  help: 'Recuerda que la presentación en la feria dura pocos minutos: este texto es tu carta de presentación.' },
                { key: 'videoUrl', label: 'Enlace a video del proyecto', type: 'url', required: false, width: 'half' },
                { key: 'presentationUrl', label: 'Enlace a la presentación', type: 'url', required: false, width: 'half' },
            ],
        },
        {
            key: 'documents',
            title: 'Documentos de respaldo',
            description: 'Adjunta los soportes del proyecto.',
            fields: [
                { key: 'communityNeedsForm', label: 'Formulario de Necesidades de la Comunidad', type: 'file', required: false, width: 'full',
                  help: 'Documento requerido por la convocatoria.' },
                { key: 'budgetFile', label: 'Presupuesto detallado y cotizaciones', type: 'file', required: false, width: 'full' },
                { key: 'supportLetters', label: 'Cartas de apoyo o convenios', type: 'file', required: false, width: 'full' },
                { key: 'photos', label: 'Fotografías del contexto', type: 'file', required: false, width: 'full' },
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

export const hasValue = (value, type) => {
    if (value === null || value === undefined) return false;
    if (type === 'repeater') {
        return Array.isArray(value) && value.some(row =>
            row && Object.values(row).some(v => String(v ?? '').trim() !== '')
        );
    }
    if (type === 'multiselect') return Array.isArray(value) && value.length > 0;
    if (type === 'checkbox') return value === true;
    if (type === 'number' || type === 'currency') return String(value).trim() !== '' && !Number.isNaN(Number(value));
    return String(value).trim() !== '';
};
