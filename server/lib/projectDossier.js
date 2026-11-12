// ════════════════════════════════════════════════════════════════════════════
// Expediente integral del proyecto — el CRITERIO (v4.1324.0)
//
// Pedido de la gobernadora Ximena para la XII Feria (Valledupar 2027): abrir
// cada proyecto postulado, LEER toda la postulación, corregirla cuando haga
// falta, TRADUCIRLA al inglés y sacar fichas PDF (español, inglés y bilingüe)
// y libretas de presentación desde el mismo expediente.
//
// Este archivo es PURO: no toca la base, la red ni el reloj (el reloj entra por
// parámetro). Decide:
//
//   · QUÉ CAMPOS TIENE UN PROYECTO. No hay formulario nuevo ni campos
//     inventados: el expediente se arma recorriendo la fila de la postulación
//     (`ProjectFairSubmission`) y las PLANTILLAS VIGENTES de los formularios del
//     proyecto (Formulación y Solicitud del FDD, `projectFormsRegistry.js`). Un
//     campo que el comité agregue mañana a una plantilla aparece solo.
//   · QUÉ SE PUEDE EDITAR y con qué tipo. Los pagos, valores cobrados, estados,
//     identificadores, la relación con el club y los archivos NO pasan por aquí:
//     no están en la lista de lo editable, así que ninguna petición los alcanza.
//   · QUÉ SE TRADUCE. Sólo texto narrativo (descripciones, objetivos,
//     beneficiarios…). Nombres de personas, correos, teléfonos, firmas, códigos,
//     cifras, fechas y lugares NO viajan al proveedor de IA: se conservan.
//   · EL ESTADO DE LA TRADUCCIÓN, que se DERIVA (no se guarda): un campo cuyo
//     original cambió después de traducirse está «desactualizado» porque su
//     huella ya no coincide — no hace falta que nadie escriba esa marca.
//
// El estado de traducción es INDEPENDIENTE del de la postulación y del pago:
// nada de lo que se decide aquí lee ni escribe `status`, `workflowStatus`,
// `amount*` ni `paidAt`.
// ════════════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';

export const BASE_LANG = 'es';
// Idiomas de destino. La estructura (una fila por proyecto, idioma y campo)
// admite otros; hoy el pedido es inglés.
export const TARGET_LANGS = ['en'];
export const isTargetLang = (lang) => TARGET_LANGS.includes(String(lang || ''));

// ── Estados de una traducción ──────────────────────────────────────────────
export const TRANSLATION_STATES = {
    not_started: { label: 'No iniciada', color: 'slate' },
    generating: { label: 'En generación', color: 'sky' },
    draft: { label: 'Borrador', color: 'amber' },
    pending_review: { label: 'Pendiente de revisión', color: 'orange' },
    reviewed: { label: 'Revisada', color: 'indigo' },
    approved: { label: 'Aprobada', color: 'emerald' },
    outdated: { label: 'Desactualizada', color: 'red' },
    error: { label: 'Error', color: 'red' },
};
export const FIELD_STATES = {
    missing: { label: 'Sin traducir', color: 'slate' },
    draft: { label: 'Borrador', color: 'amber' },
    reviewed: { label: 'Revisado', color: 'emerald' },
    outdated: { label: 'Desactualizado', color: 'red' },
};

// Una generación que lleva más que esto «en curso» se dio por caída (la
// función de Vercel tiene 120 s). Sin esto, un corte dejaría el proyecto
// bloqueado para siempre en «En generación».
export const GENERATION_STALE_MS = 6 * 60 * 1000;

// ── Utilidades ─────────────────────────────────────────────────────────────
const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === null || v === undefined ? '' : String(v));
export const hashOf = (text) => crypto.createHash('sha256').update(str(text), 'utf8').digest('hex').slice(0, 24);

const fold = (s) => str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[.;:]+$/g, '').replace(/\s+/g, ' ').trim();

/** ¿Tiene contenido? Mismo criterio para todos los tipos. */
export const isFilled = (value, type) => {
    if (value === null || value === undefined) return false;
    if (type === 'checkbox') return value === true;
    if (Array.isArray(value)) return value.some(v => (isPlainObject(v) ? Object.values(v).some(x => str(x).trim() !== '') : str(v).trim() !== ''));
    if (isPlainObject(value)) return Object.values(value).some(v => isFilled(v));
    return str(value).trim() !== '';
};

// ── Los datos del REGISTRO INICIAL (columnas de la postulación) ────────────
//
// `editable: false` lleva su motivo: la pantalla lo muestra en vez de un
// candado mudo. Las columnas de pago, estado, referencias, edición e
// inscripción NO están en esta lista, y por eso ninguna edición las alcanza.
export const SUBMISSION_GROUPS = [
    {
        key: 'responsable', title: 'Responsable de la postulación', titleEn: 'Applicant contact',
        fields: [
            { key: 'firstName', column: '"firstName"', label: 'Nombres', labelEn: 'First name', type: 'text', maxLength: 120, editable: true, personal: true },
            { key: 'lastName', column: '"lastName"', label: 'Apellidos', labelEn: 'Last name', type: 'text', maxLength: 120, editable: true, personal: true },
            { key: 'email', label: 'Correo electrónico', labelEn: 'Email', type: 'email', editable: false, personal: true,
              lockReason: 'Es el acceso del club a «Mi proyecto»: no se cambia desde el expediente.' },
            { key: 'phone', column: 'phone', label: 'WhatsApp', labelEn: 'WhatsApp', type: 'phone', maxLength: 60, editable: true, personal: true },
            { key: 'clubRole', label: 'Rol en el club', labelEn: 'Role in the club', type: 'text', editable: false,
              read: (row) => row.clubRoleOther || row.clubRoleLabel || row.clubRole || null,
              lockReason: 'Se elige de la lista del formulario de postulación.' },
            { key: 'document', label: 'Documento de identidad', labelEn: 'ID document', type: 'text', editable: false, personal: true,
              read: (row) => [row.idTypeLabel || row.idType, row.idNumber].filter(Boolean).join(' ') || null,
              lockReason: 'Dato de identificación: no se edita desde el expediente.' },
            { key: 'country', column: 'country', label: 'País', labelEn: 'Country', type: 'text', maxLength: 120, editable: true },
            { key: 'department', column: 'department', label: 'Departamento', labelEn: 'State / Department', type: 'text', maxLength: 120, editable: true },
            { key: 'city', column: 'city', label: 'Ciudad', labelEn: 'City', type: 'text', maxLength: 120, editable: true },
        ],
    },
    {
        key: 'club', title: 'Club postulante', titleEn: 'Applicant club',
        fields: [
            { key: 'clubName', label: 'Club Rotario', labelEn: 'Rotary Club', type: 'text', editable: false,
              lockReason: 'Relación con el club: no se edita desde el expediente.' },
            { key: 'district', label: 'Distrito', labelEn: 'District', type: 'text', editable: false,
              lockReason: 'Relación con el club: no se edita desde el expediente.' },
        ],
    },
    {
        key: 'proyecto', title: 'Proyecto (registro inicial)', titleEn: 'Project (initial registration)',
        fields: [
            { key: 'projectName', column: '"projectName"', label: 'Nombre del proyecto', labelEn: 'Project name', type: 'text', maxLength: 250, editable: true, translatable: true },
            { key: 'focusArea', label: 'Área de enfoque', labelEn: 'Area of Focus', type: 'select', editable: false, glossary: true,
              read: (row) => row.focusAreaLabel || row.focusArea || null,
              lockReason: 'Clasificación del proyecto: alimenta indicadores y filtros.' },
            { key: 'projectDescription', column: '"projectDescription"', label: 'Descripción del proyecto', labelEn: 'Project description', type: 'textarea', maxLength: 8000, editable: true, translatable: true },
            { key: 'budgetUsd', column: '"budgetUsd"', label: 'Presupuesto del proyecto (US$)', labelEn: 'Project budget (US$)', type: 'currency', editable: true, sensitive: true },
            { key: 'notes', column: 'notes', label: 'Observaciones del postulante', labelEn: 'Applicant notes', type: 'textarea', maxLength: 2000, editable: true, translatable: true },
        ],
    },
];

// ── Rótulos en inglés de las plantillas OFICIALES ──────────────────────────
//
// Los rótulos de las plantillas son configuración en español. Para las que
// trae la plataforma, el inglés es fijo y revisado (no se le pide a una IA que
// invente cómo se llama «Solicitud del FDD»). Un campo que el comité agregue
// después cae en `labelEn` = su rótulo en español y la ficha lo dice.
export const LABELS_EN = {
    'master': 'Project Formulation',
    'master.identificacion': 'Project identification',
    'master.identificacion.clubName': 'Rotary Club',
    'master.identificacion.district': 'Rotary District',
    'master.identificacion.city': 'City',
    'master.identificacion.projectName': 'Project name',
    'master.identificacion.focusAreas': 'Areas of Focus',
    'master.objetivos': 'Project objectives',
    'master.objetivos.generalObjective': 'General objective',
    'master.objetivos.projectDescription': 'Project description',
    'master.necesidades': 'Needs and beneficiaries',
    'master.necesidades.needs': 'Needs',
    'master.necesidades.needsResponse': 'How the needs will be addressed',
    'master.necesidades.beneficiaries': 'Project beneficiaries',
    'master.necesidades.beneficiariesCount': 'Number of beneficiaries',
    'master.sostenibilidad': 'Sustainability and community participation',
    'master.sostenibilidad.sustainability': 'Sustainability',
    'master.sostenibilidad.communityRole': 'Is the community involved?',
    'master.presupuesto': 'Budget',
    'master.presupuesto.budgetTable': 'Project budget',
    'master.presupuesto.budgetTable#pesos': 'Amount (COP)',
    'master.presupuesto.budgetTable#usd': 'Amount (US$)',
    'master.presupuesto.budgetTable@projectCost': 'Project cost',
    'master.presupuesto.budgetTable@localClub': 'Local club contribution',
    'master.presupuesto.budgetTable@colombianDistrict': 'Colombian district',
    'master.presupuesto.budgetTable@internationalClubs': 'International clubs contribution (retired from the form)',
    'master.presupuesto.budgetTable@internationalDistrict': 'International district (retired from the form)',
    'master.presupuesto.budgetTable@rotaryFoundation': 'The Rotary Foundation (retired from the form)',
    'master.contacto': 'Contact information',
    'master.contacto.contactName': 'Name',
    'master.contacto.contactEmail': 'Email',
    'master.contacto.contactPhone': 'Phone',

    'fdd_2026_2027': 'District Designated Fund (DDF) Request 2026-2027',
    'fdd_2026_2027.solicitud': 'General request information',
    'fdd_2026_2027.solicitud.city': 'City',
    'fdd_2026_2027.solicitud.requestDate': 'Request date',
    'fdd_2026_2027.solicitud.period': 'DDF period',
    'fdd_2026_2027.club': 'Rotary Club information',
    'fdd_2026_2027.club.clubName': 'Rotary Club name',
    'fdd_2026_2027.club.district': 'District',
    'fdd_2026_2027.club.clubId': 'Rotary club ID number',
    'fdd_2026_2027.presidente': 'Club President 2026-2027',
    'fdd_2026_2027.presidente.presidentName': 'Full name',
    'fdd_2026_2027.presidente.presidentPhone': 'Mobile phone',
    'fdd_2026_2027.presidente.presidentEmail': 'Email',
    'fdd_2026_2027.lfri': 'Club Rotary Foundation Committee chair',
    'fdd_2026_2027.lfri.lfriName': 'Full name',
    'fdd_2026_2027.lfri.lfriPhone': 'Mobile phone',
    'fdd_2026_2027.lfri.lfriEmail': 'Email',
    'fdd_2026_2027.objetivo': 'Main objective and beneficiaries',
    'fdd_2026_2027.objetivo.mainObjective': 'Main objective',
    'fdd_2026_2027.objetivo.beneficiaries': 'Beneficiaries',
    'fdd_2026_2027.objetivo.beneficiariesCount': 'Estimated number of beneficiaries',
    'fdd_2026_2027.proyecto': 'Project information',
    'fdd_2026_2027.proyecto.projectName': 'Project name',
    'fdd_2026_2027.proyecto.focusArea': 'Area of Focus',
    'fdd_2026_2027.proyecto.location': 'Project location',
    'fdd_2026_2027.proyecto.scheduledDate': 'Scheduled date',
    'fdd_2026_2027.proyecto.scheduleNotes': 'Schedule details',
    'fdd_2026_2027.necesidades': 'Needs assessment',
    'fdd_2026_2027.necesidades.needsAssessmentDone': 'Was a community needs assessment carried out?',
    'fdd_2026_2027.necesidades.needsAssessmentDate': 'Assessment date',
    'fdd_2026_2027.necesidades.needsAssessmentSummary': 'Assessment results',
    'fdd_2026_2027.subvencion': 'Global Grant information',
    'fdd_2026_2027.subvencion.alreadyRequested': 'Has the grant already been requested from The Rotary Foundation?',
    'fdd_2026_2027.subvencion.ggNumber': 'Global Grant number (GG #)',
    'fdd_2026_2027.subvencion.ggStatus': 'Application status at The Rotary Foundation',
    'fdd_2026_2027.contactos': 'Project contacts',
    'fdd_2026_2027.contactos.localContactName': 'Primary local project contact',
    'fdd_2026_2027.contactos.localContactPhone': 'Mobile phone',
    'fdd_2026_2027.contactos.localContactEmail': 'Email',
    'fdd_2026_2027.presupuesto': 'Financial information and budget',
    'fdd_2026_2027.presupuesto.budgetUsd': 'Total project budget (US$)',
    'fdd_2026_2027.presupuesto.budgetBreakdown': 'Budget breakdown',
    'fdd_2026_2027.presupuesto.budgetBreakdown#concept': 'Item',
    'fdd_2026_2027.presupuesto.budgetBreakdown#amountUsd': 'Amount (US$)',
    'fdd_2026_2027.aportes': 'Expected contributions and funding sources',
    'fdd_2026_2027.aportes.clubsDistrictUsd': 'Contributions from the club and other clubs in the district (US$)',
    'fdd_2026_2027.aportes.foreignClubsUsd': 'Expected contributions from clubs abroad (US$)',
    'fdd_2026_2027.aportes.expectedTotalUsd': 'Total expected contributions (US$)',
    'fdd_2026_2027.aportes.fapContributionUsd': 'Club contributions to the Annual Fund 2023-2024 (US$)',
    'fdd_2026_2027.aportes.fapMinimumUsd': '25% minimum of the 2023-2024 Annual Fund contribution (US$)',
    'fdd_2026_2027.fdd': 'DDF request',
    'fdd_2026_2027.fdd.requestedUsd': 'Amount requested from the 2026-2027 DDF (US$)',
    'fdd_2026_2027.fdd.fapGoalUsd': 'Annual Fund giving goal 2026-2027 (US$)',
    'fdd_2026_2027.declaraciones': 'Declarations and signatures',
    'fdd_2026_2027.declaraciones.reqCertified': 'The club is certified',
    'fdd_2026_2027.declaraciones.reqNoOverdueReports': 'No overdue reports',
    'fdd_2026_2027.declaraciones.reqMyRotary': 'Registered on MyRotary.org',
    'fdd_2026_2027.declaraciones.reqDistrictObligations': 'District obligations up to date',
    'fdd_2026_2027.declaraciones.presidentSignature': 'Signature of the Club President 2026-2027',
    'fdd_2026_2027.declaraciones.presidentSignatureDate': 'Signature date',
    'fdd_2026_2027.declaraciones.presidentElectSignature': 'Signature of the President-elect 2027-2028',
    'fdd_2026_2027.declaraciones.presidentElectSignatureDate': 'Signature date',
    'fdd_2026_2027.aprobacion': 'Institutional approval',
    'fdd_2026_2027.aprobacion.approvedAmountUsd': 'Approved contribution (US$)',
    'fdd_2026_2027.aprobacion.decisionDate': 'Decision date',
    'fdd_2026_2027.aprobacion.gdSignature': 'Signature of the District Governor',
    'fdd_2026_2027.aprobacion.lfriChairSignature': 'Signature of the District Rotary Foundation Committee chair',
    'fdd_2026_2027.aprobacion.notes': 'District remarks',
};

// ── Terminología aprobada (glosario por defecto) ───────────────────────────
//
// Dos usos: (1) va en la instrucción del traductor como equivalencias
// obligatorias; (2) traduce SIN IA los valores de catálogo (área de enfoque,
// «Sí/No», estados de la subvención), que no son lenguaje sino opciones: una
// IA podría parafrasear «Water, Sanitation, and Hygiene» y la ficha dejaría de
// usar el nombre oficial. Lo que el comité guarde en el glosario manda sobre
// esta lista.
export const DEFAULT_GLOSSARY = [
    // Las siete Áreas de Enfoque, con los nombres oficiales de Rotary.
    { source: 'Promoción de la Paz', target: 'Peacebuilding and Conflict Prevention', kind: 'area' },
    { source: 'Construcción de la paz y prevención de conflictos', target: 'Peacebuilding and Conflict Prevention', kind: 'area' },
    { source: 'Prevención y Tratamiento de Enfermedades', target: 'Disease Prevention and Treatment', kind: 'area' },
    { source: 'Agua, Saneamiento e Higiene', target: 'Water, Sanitation, and Hygiene', kind: 'area' },
    { source: 'Salud Materno Infantil', target: 'Maternal and Child Health', kind: 'area' },
    { source: 'Salud materno-infantil', target: 'Maternal and Child Health', kind: 'area' },
    { source: 'Educación Básica y Alfabetización', target: 'Basic Education and Literacy', kind: 'area' },
    { source: 'Desarrollo Económico Comunitario', target: 'Community Economic Development', kind: 'area' },
    { source: 'Desarrollo económico de la comunidad', target: 'Community Economic Development', kind: 'area' },
    { source: 'Medio Ambiente', target: 'Protecting the Environment', kind: 'area' },
    { source: 'Protección del medio ambiente', target: 'Protecting the Environment', kind: 'area' },
    // Institucional.
    { source: 'Club Rotario', target: 'Rotary Club', kind: 'term' },
    { source: 'Distrito Rotario', target: 'Rotary District', kind: 'term' },
    { source: 'Área de enfoque', target: 'Area of Focus', kind: 'term' },
    { source: 'Áreas de enfoque', target: 'Areas of Focus', kind: 'term' },
    { source: 'Gobernador de Distrito', target: 'District Governor', kind: 'term' },
    { source: 'La Fundación Rotaria', target: 'The Rotary Foundation', kind: 'term' },
    { source: 'LFRI', target: 'The Rotary Foundation', kind: 'term' },
    { source: 'Subvención Global', target: 'Global Grant', kind: 'term' },
    { source: 'Subvención Distrital', target: 'District Grant', kind: 'term' },
    { source: 'Fondo Distrital Designado', target: 'District Designated Fund (DDF)', kind: 'term' },
    { source: 'FDD', target: 'DDF', kind: 'term' },
    { source: 'Fondo Anual para Programas', target: 'Annual Fund', kind: 'term' },
    { source: 'FAP', target: 'Annual Fund', kind: 'term' },
    { source: 'Feria de Proyectos', target: 'Project Fair', kind: 'term' },
    { source: 'Rotaract', target: 'Rotaract', kind: 'term' },
    { source: 'Interact', target: 'Interact', kind: 'term' },
    // Opciones de las plantillas oficiales.
    { source: 'Sí', target: 'Yes', kind: 'option' },
    { source: 'No', target: 'No', kind: 'option' },
    { source: 'En proceso', target: 'In progress', kind: 'option' },
    { source: 'Borrador', target: 'Draft', kind: 'option' },
    { source: 'Enviada', target: 'Submitted', kind: 'option' },
    { source: 'En revisión', target: 'Under review', kind: 'option' },
    { source: 'Aprobada', target: 'Approved', kind: 'option' },
    { source: 'No aplica', target: 'Not applicable', kind: 'option' },
];

/** Glosario efectivo: el de la base manda sobre el de fábrica, término a término. */
export const mergeGlossary = (saved = []) => {
    const out = new Map();
    for (const g of DEFAULT_GLOSSARY) out.set(fold(g.source), { ...g, builtIn: true });
    for (const g of saved || []) {
        if (!g || !str(g.source).trim() || !str(g.target).trim() || g.active === false) continue;
        out.set(fold(g.source), { source: str(g.source).trim(), target: str(g.target).trim(), kind: g.kind || 'term', id: g.id || null, note: g.note || null, builtIn: false });
    }
    return [...out.values()];
};

/** Traducción EXACTA de un valor de catálogo, o null si no hay equivalencia aprobada. */
export const glossaryLookup = (glossary, value) => {
    const key = fold(value);
    if (!key) return null;
    return (glossary || []).find(g => fold(g.source) === key)?.target || null;
};

// ── Qué se traduce ─────────────────────────────────────────────────────────
// Un campo de texto CORTO se conserva salvo que sea un título o un concepto:
// en las plantillas los `text` son nombres, firmas, ciudades, códigos y
// periodos. Un `textarea` es narrativa y se traduce.
const TRANSLATABLE_TEXT_KEYS = new Set(['projectName', 'title', 'concept', 'activity', 'description', 'objective']);
const PERSONAL_KEY = /(name|nombre|email|correo|phone|celular|telefono|signature|firma|club|district|distrito|city|ciudad|location|lugar|number|numero|clubid|ggnumber|period)$/i;

export const isTranslatableField = (field) => {
    if (!field) return false;
    if (field.translatable === false) return false;
    if (field.type === 'textarea') return true;
    if (field.type === 'text') {
        if (TRANSLATABLE_TEXT_KEYS.has(field.key)) return true;
        return field.translatable === true && !PERSONAL_KEY.test(field.key);
    }
    return false;
};

const translatableColumns = (field) => (field.columns || []).filter(c =>
    c.type === 'textarea' || (c.type === 'text' && TRANSLATABLE_TEXT_KEYS.has(c.key)));

// ── Recorrer el expediente ─────────────────────────────────────────────────
const SECTION_LOCK = {
    computed: 'Se calcula solo a partir de otros campos.',
    district: 'Espacio institucional: se diligencia en la aprobación del Distrito.',
    noRecord: 'El club todavía no ha iniciado este formulario.',
    file: 'Es un enlace a un archivo: se gestiona en Documentos.',
};

/**
 * Arma el expediente: grupos → campos con su valor, si se edita, si se
 * traduce y por qué no cuando no.
 *
 * @param submission  fila de `ProjectFairSubmission`
 * @param forms       [{ key, template, record }] — plantilla vigente y su fila
 * @param computed    { [formKey]: answers con los derivados resueltos }
 * @param focusAreas  catálogo de la convocatoria (para las opciones)
 */
export const buildDossier = ({ submission, forms = [], computed = {}, focusAreas = [] }) => {
    const groups = [];
    const row = submission || {};

    groups.push({
        key: 'submission', source: 'submission', title: 'Registro inicial de la postulación', titleEn: 'Initial registration',
        sections: SUBMISSION_GROUPS.map(g => ({
            key: g.key, title: g.title, titleEn: g.titleEn,
            fields: g.fields.map(f => {
                const value = typeof f.read === 'function' ? f.read(row) : (row[f.key] ?? null);
                return {
                    path: `submission.${f.key}`, key: f.key, label: f.label, labelEn: f.labelEn, type: f.type,
                    value: f.type === 'currency' && value !== null && value !== '' ? Number(value) : value,
                    maxLength: f.maxLength || null,
                    editable: !!f.editable, lockReason: f.editable ? null : (f.lockReason || null),
                    sensitive: !!f.sensitive, personal: !!f.personal,
                    translatable: !!f.translatable, glossary: !!f.glossary,
                    options: f.key === 'focusArea' ? (focusAreas || []).map(a => a.label) : null,
                    filled: isFilled(value, f.type),
                };
            }),
        })),
    });

    for (const form of forms) {
        const template = form.template;
        if (!template) continue;
        const record = form.record || null;
        const answers = computed[form.key] || record?.answers || {};
        const approval = record?.approval || {};
        groups.push({
            key: form.key, source: 'form', formKey: form.key,
            title: template.title || form.key, titleEn: LABELS_EN[form.key] || template.title || form.key,
            started: !!record,
            completionPct: record ? Number(record.completionPct || 0) : 0,
            formStatus: record?.status || null,
            submittedAt: record?.submittedAt || null,
            sections: (template.sections || []).map(section => {
                const district = section.districtSpace === true || section.adminOnly === true;
                return {
                    key: section.key, title: section.title,
                    titleEn: LABELS_EN[`${form.key}.${section.key}`] || section.title,
                    district,
                    fields: (section.fields || []).map(field => {
                        const value = section.adminOnly ? approval?.[section.key]?.[field.key] : answers?.[section.key]?.[field.key];
                        const path = `${form.key}.${section.key}.${field.key}`;
                        let lockReason = null;
                        if (field.type === 'computed') lockReason = SECTION_LOCK.computed;
                        else if (district) lockReason = SECTION_LOCK.district;
                        else if (field.type === 'file') lockReason = SECTION_LOCK.file;
                        else if (!record) lockReason = SECTION_LOCK.noRecord;
                        const numericLike = ['currency', 'number', 'percent'].includes(field.type)
                            || (field.type === 'matrix') || (field.type === 'repeater' && (field.columns || []).some(c => ['currency', 'number', 'percent'].includes(c.type)));
                        return {
                            path, key: field.key, formKey: form.key, sectionKey: section.key,
                            label: field.label, labelEn: LABELS_EN[path] || null,
                            type: field.type, value: value === undefined ? null : value,
                            options: field.optionsFrom === 'focusAreas' ? (focusAreas || []).map(a => a.label) : (field.options || null),
                            columns: field.columns || null,
                            columnsEn: (field.columns || []).map(c => LABELS_EN[`${path}#${c.key}`] || null),
                            rows: Array.isArray(field.rows) ? field.rows : null,
                            rowsEn: Array.isArray(field.rows) ? field.rows.map(r => LABELS_EN[`${path}@${r.key}`] || null) : null,
                            retiredRows: field.retiredRows || null,
                            maxLength: field.maxLength || null,
                            help: field.help || null,
                            editable: !lockReason, lockReason,
                            sensitive: numericLike,
                            translatable: field.type === 'repeater' ? translatableColumns(field).length > 0 : isTranslatableField(field),
                            glossary: ['select', 'multiselect'].includes(field.type),
                            filled: isFilled(value, field.type),
                        };
                    }),
                };
            }),
        });
    }
    return { groups };
};

/** Índice plano de campos por ruta. */
export const fieldIndex = (dossier) => {
    const out = new Map();
    for (const g of dossier?.groups || []) for (const s of g.sections || []) for (const f of s.fields || []) out.set(f.path, f);
    return out;
};

/**
 * Los textos que se TRADUCEN, uno por ruta. Un repetidor aporta una entrada
 * por fila y columna traducible (`…budgetBreakdown[2].concept`). Vacíos,
 * cifras sueltas y datos (`isMeaningfulText`) no se mandan.
 */
export const translatableItems = (dossier) => {
    const items = [];
    for (const g of dossier?.groups || []) {
        for (const s of g.sections || []) {
            for (const f of s.fields || []) {
                if (!f.translatable) continue;
                if (f.type === 'repeater') {
                    const cols = (f.columns || []).filter(c => c.type === 'textarea' || (c.type === 'text' && TRANSLATABLE_TEXT_KEYS.has(c.key)));
                    (Array.isArray(f.value) ? f.value : []).forEach((rowValue, i) => {
                        for (const c of cols) {
                            const text = str(rowValue?.[c.key]).trim();
                            if (isMeaningfulText(text)) items.push({ path: `${f.path}[${i}].${c.key}`, fieldPath: f.path, label: `${f.label} · fila ${i + 1} · ${c.label}`, labelEn: null, text, hash: hashOf(text), groupKey: g.key, sectionTitle: s.title });
                        }
                    });
                    continue;
                }
                const text = str(f.value).trim();
                if (!isMeaningfulText(text)) continue;
                items.push({ path: f.path, fieldPath: f.path, label: f.label, labelEn: f.labelEn, text, hash: hashOf(text), groupKey: g.key, sectionTitle: s.title });
            }
        }
    }
    return items;
};

// Un texto sin letras (sólo cifras, fechas, signos) o que es un dato (correo,
// enlace) no es lenguaje: se conserva tal cual y no se gasta una llamada.
export const isMeaningfulText = (text) => {
    const t = str(text).trim();
    if (t.length < 2) return false;
    if (!/\p{L}/u.test(t)) return false;
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) return false;
    if (/^https?:\/\/\S+$/i.test(t)) return false;
    return true;
};

// ── Estado de la traducción (derivado) ─────────────────────────────────────
/** Huella del conjunto traducido: cambia si cambia un original o una traducción. */
export const fingerprintOf = (fieldRows = []) => hashOf(
    [...fieldRows].sort((a, b) => str(a.path).localeCompare(str(b.path)))
        .map(r => `${r.path}|${r.sourceHash}|${hashOf(r.text)}`).join('\n'));

/**
 * Estado de cada campo y de la traducción completa.
 *
 * @param items        translatableItems(dossier) — los originales de HOY
 * @param fieldRows    filas de ProjectDossierTranslationField del idioma
 * @param header       fila de ProjectDossierTranslation (o null)
 * @param now          ms del reloj (entra por parámetro: la función es pura)
 */
export const translationStatus = ({ items = [], fieldRows = [], header = null, now = Date.now() }) => {
    const byPath = new Map((fieldRows || []).map(r => [r.path, r]));
    const fields = items.map(item => {
        const row = byPath.get(item.path) || null;
        let state = 'missing';
        if (row && str(row.text).trim()) {
            if (row.sourceHash !== item.hash) state = 'outdated';
            else state = row.reviewed ? 'reviewed' : 'draft';
        }
        return {
            path: item.path, fieldPath: item.fieldPath, label: item.label, labelEn: item.labelEn,
            sectionTitle: item.sectionTitle, groupKey: item.groupKey,
            source: item.text, sourceHash: item.hash,
            text: row?.text ?? null, previousSource: row && row.sourceHash !== item.hash ? (row.sourceText ?? null) : null,
            origin: row?.origin || null, reviewed: !!row?.reviewed, reviewedBy: row?.reviewedBy || null, reviewedAt: row?.reviewedAt || null,
            warnings: Array.isArray(row?.warnings) ? row.warnings : [],
            updatedAt: row?.updatedAt || null, updatedBy: row?.updatedBy || null,
            state,
        };
    });
    // Filas de rutas que ya no existen (el club borró una fila del desglose):
    // no cuentan para el estado, pero tampoco se borran — siguen en la base y
    // en las versiones aprobadas.
    const counts = { missing: 0, draft: 0, reviewed: 0, outdated: 0 };
    fields.forEach(f => { counts[f.state] += 1; });
    const total = fields.length;
    const present = fieldRows.filter(r => items.some(i => i.path === r.path));
    const generating = header?.status === 'generating' && header.startedAt && (now - new Date(header.startedAt).getTime()) < GENERATION_STALE_MS;

    let state;
    if (generating) state = 'generating';
    else if (!present.length) state = header?.status === 'error' ? 'error' : 'not_started';
    else if (counts.outdated > 0) state = 'outdated';
    else if (header?.approvedAt && header.approvedFingerprint && header.approvedFingerprint === fingerprintOf(present) && counts.missing === 0) state = 'approved';
    else if (counts.missing === 0 && counts.draft === 0) state = 'reviewed';
    else if (counts.missing === 0) state = 'pending_review';
    else state = 'draft';

    const warnings = fields.filter(f => f.warnings.length && f.state !== 'missing').length;
    return {
        state, label: TRANSLATION_STATES[state].label, color: TRANSLATION_STATES[state].color,
        total, counts, warnings,
        approvedAt: header?.approvedAt || null, approvedBy: header?.approvedBy || null,
        approvedVersionId: header?.approvedVersionId || null,
        lastError: header?.status === 'error' ? (header.lastError || null) : null,
        provider: header?.provider || null, model: header?.model || null,
        fields,
    };
};

/** ¿Se puede aprobar? Devuelve el motivo exacto cuando no. */
export const approvalCheck = (status, { acknowledgeWarnings = false } = {}) => {
    if (!status || !status.total) return { ok: false, error: 'Este proyecto no tiene textos para traducir todavía.' };
    if (status.state === 'generating') return { ok: false, error: 'Hay una traducción en curso: espera a que termine.' };
    if (status.counts.missing) return { ok: false, error: `Faltan ${status.counts.missing} campo(s) por traducir.` };
    if (status.counts.outdated) return { ok: false, error: `${status.counts.outdated} campo(s) cambiaron en español después de traducirse: revísalos antes de aprobar.` };
    if (status.counts.draft) return { ok: false, error: `Faltan ${status.counts.draft} campo(s) por marcar como revisados.` };
    if (status.warnings && !acknowledgeWarnings) {
        return { ok: false, needsAcknowledge: true, error: `${status.warnings} campo(s) tienen avisos (cifras, correos o enlaces que no coinciden con el original). Confirma que los revisaste.` };
    }
    return { ok: true };
};

// ── Verificación de una traducción ─────────────────────────────────────────
//
// La IA no puede cambiar cifras, correos ni enlaces. No se «arregla» su texto
// (sería otra forma de inventar): se marca el campo para que una persona lo
// mire, y aprobar con avisos exige confirmarlo.
const digitsOf = (text) => (str(text).match(/\d[\d.,]*\d|\d/g) || []).map(s => s.replace(/\D/g, '')).filter(Boolean);
const emailsOf = (text) => (str(text).match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).map(s => s.toLowerCase());
const urlsOf = (text) => str(text).match(/https?:\/\/[^\s)\]]+/gi) || [];

export const auditTranslation = (source, translated) => {
    const warnings = [];
    const out = str(translated);
    const outDigits = new Set(digitsOf(out));
    const missingNumbers = [...new Set(digitsOf(source))].filter(d => !outDigits.has(d));
    if (missingNumbers.length) warnings.push({ code: 'numbers', message: `Cifras del original que no aparecen en la traducción: ${missingNumbers.slice(0, 6).join(', ')}` });
    const outLower = out.toLowerCase();
    const missingEmails = emailsOf(source).filter(e => !outLower.includes(e));
    if (missingEmails.length) warnings.push({ code: 'emails', message: `Correos que cambiaron: ${missingEmails.join(', ')}` });
    const missingUrls = urlsOf(source).filter(u => !out.includes(u));
    if (missingUrls.length) warnings.push({ code: 'urls', message: `Enlaces que cambiaron: ${missingUrls.join(', ')}` });
    const ratio = str(source).length ? out.length / str(source).length : 1;
    if (str(source).length > 80 && (ratio < 0.45 || ratio > 2.4)) {
        warnings.push({ code: 'length', message: 'La traducción tiene un largo muy distinto del original: puede faltar o sobrar información.' });
    }
    return warnings;
};

// ── Lotes y la instrucción al modelo ───────────────────────────────────────
export const BATCH_MAX_CHARS = 9000;
export const BATCH_MAX_ITEMS = 18;

/** Agrupa textos ÚNICOS (un mismo original en tres campos se traduce una vez). */
export const planBatches = (items, { maxChars = BATCH_MAX_CHARS, maxItems = BATCH_MAX_ITEMS } = {}) => {
    const unique = new Map();
    for (const it of items) if (!unique.has(it.hash)) unique.set(it.hash, { id: it.hash, text: it.text });
    const batches = [];
    let current = [];
    let size = 0;
    for (const u of unique.values()) {
        if (current.length && (size + u.text.length > maxChars || current.length >= maxItems)) {
            batches.push(current); current = []; size = 0;
        }
        current.push(u); size += u.text.length;
    }
    if (current.length) batches.push(current);
    return batches;
};

export const translationSystemPrompt = (glossary = [], targetLang = 'en') => {
    const terms = (glossary || []).filter(g => g.kind !== 'option')
        .map(g => `"${g.source}" → "${g.target}"`).join('; ');
    return [
        `You are a professional translator of Rotary International humanitarian project documentation. Translate Spanish (Colombia) into ${targetLang === 'en' ? 'English (United States)' : targetLang}.`,
        'Write natural, professional English suited to international cooperation and Rotary audiences, not a word-by-word rendering.',
        'Keep the exact meaning, scope, objectives, beneficiaries and commitments of each text; translate everything that is written and nothing more.',
        'Copy every figure, amount, percentage, date, code, email address and web address exactly as written. Keep the names of people, places, clubs and institutions in their official form.',
        terms ? `Use this approved terminology: ${terms}.` : '',
        'Keep paragraph breaks and list markers.',
        'Answer only with JSON of the form {"translations":[{"id":"<same id>","text":"<translation>"}]}, one entry for every id received, in any order.',
    ].filter(Boolean).join(' ');
};

export const translationUserPrompt = (batch) => JSON.stringify({ items: batch.map(b => ({ id: b.id, text: b.text })) });

/**
 * Lee la respuesta del modelo. Lanza si no es interpretable o si faltan ids:
 * es preferible un error visible a guardar la traducción de un campo en otro.
 */
export const parseTranslationResponse = (raw, batch) => {
    const text = str(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let data = null;
    try { data = JSON.parse(text); } catch {
        const a = text.indexOf('{'); const b = text.lastIndexOf('}');
        if (a !== -1 && b > a) { try { data = JSON.parse(text.slice(a, b + 1)); } catch { /* abajo */ } }
    }
    const list = Array.isArray(data) ? data : (Array.isArray(data?.translations) ? data.translations : null);
    if (!list) throw new Error('El modelo no devolvió JSON interpretable.');
    const out = new Map();
    for (const entry of list) {
        if (!entry || typeof entry.id !== 'string' || typeof entry.text !== 'string') continue;
        if (!entry.text.trim()) continue;
        out.set(entry.id, entry.text.trim());
    }
    const missing = batch.filter(b => !out.has(b.id));
    if (missing.length) throw new Error(`El modelo omitió ${missing.length} de ${batch.length} textos.`);
    return out;
};

// ── Edición administrativa ─────────────────────────────────────────────────
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_PHONE = /^[+()\d][\d\s()+-]{6,19}$/;
const RE_URL = /^https?:\/\/\S+$/i;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const numberText = (v) => {
    const t = str(v).trim();
    if (t === '') return { ok: true, value: '' };
    const n = Number(t);
    if (!Number.isFinite(n)) return { ok: false };
    return { ok: true, value: t, n };
};

/**
 * Valida y normaliza el valor nuevo de UN campo, respetando su tipo. Devuelve
 * { ok, value } o { ok: false, error }. Los números se guardan con la misma
 * forma que guarda el formulario del club (el texto del campo numérico); en
 * las columnas de la postulación, como número.
 */
export const coerceValue = (field, raw) => {
    const t = field.type;
    if (raw === null || raw === undefined) raw = '';
    const fail = (error) => ({ ok: false, error: `${field.label}: ${error}` });
    switch (t) {
        case 'text': case 'textarea': {
            if (typeof raw !== 'string' && typeof raw !== 'number') return fail('debe ser texto.');
            const v = str(raw).replace(/\r\n/g, '\n');
            const trimmed = t === 'text' ? v.trim() : v.replace(/\s+$/, '');
            if (field.maxLength && trimmed.length > field.maxLength) return fail(`supera el máximo de ${field.maxLength} caracteres.`);
            return { ok: true, value: trimmed };
        }
        case 'email': {
            const v = str(raw).trim();
            if (v && !RE_EMAIL.test(v)) return fail('escribe un correo válido.');
            return { ok: true, value: v };
        }
        case 'phone': {
            const v = str(raw).trim();
            if (v && !RE_PHONE.test(v)) return fail('escribe un teléfono válido.');
            return { ok: true, value: v };
        }
        case 'url': {
            const v = str(raw).trim();
            if (v && !RE_URL.test(v)) return fail('el enlace debe empezar por http:// o https://.');
            return { ok: true, value: v };
        }
        case 'date': {
            const v = str(raw).trim();
            if (v && (!RE_DATE.test(v) || Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()))) return fail('escribe una fecha válida (AAAA-MM-DD).');
            return { ok: true, value: v };
        }
        case 'number': case 'currency': case 'percent': {
            const r = numberText(raw);
            if (!r.ok) return fail('escribe un número.');
            if (r.value !== '' && r.n < 0) return fail('no puede ser negativo.');
            if (t === 'percent' && r.value !== '' && r.n > 100) return fail('debe estar entre 0 y 100.');
            return { ok: true, value: r.value };
        }
        case 'select': {
            const v = str(raw).trim();
            if (v && Array.isArray(field.options) && field.options.length && !field.options.includes(v)) return fail('selecciona una de las opciones disponibles.');
            return { ok: true, value: v };
        }
        case 'multiselect': {
            if (!Array.isArray(raw)) return fail('debe ser una lista.');
            const list = [...new Set(raw.map(x => str(x).trim()).filter(Boolean))];
            if (Array.isArray(field.options) && field.options.length) {
                const bad = list.filter(x => !field.options.includes(x));
                if (bad.length) return fail(`opción no válida: ${bad.join(', ')}.`);
            }
            return { ok: true, value: list };
        }
        case 'checkbox':
            if (typeof raw !== 'boolean') return fail('debe ser sí o no.');
            return { ok: true, value: raw };
        case 'matrix': {
            if (!isPlainObject(raw)) return fail('formato de tabla no válido.');
            const rowKeys = new Set([...(field.rows || []).map(r => r.key), ...(field.retiredRows || []).map(r => r.key)]);
            const colKeys = (field.columns || []).map(c => c.key);
            const out = {};
            for (const [rk, rv] of Object.entries(raw)) {
                if (!rowKeys.has(rk)) return fail(`fila desconocida «${rk}».`);
                if (!isPlainObject(rv)) return fail('formato de fila no válido.');
                out[rk] = {};
                for (const [ck, cv] of Object.entries(rv)) {
                    if (!colKeys.includes(ck)) return fail(`columna desconocida «${ck}».`);
                    const r = numberText(cv);
                    if (!r.ok || (r.value !== '' && r.n < 0)) return fail('cada celda debe ser un número no negativo.');
                    out[rk][ck] = r.value;
                }
            }
            return { ok: true, value: out };
        }
        case 'repeater': {
            if (!Array.isArray(raw)) return fail('formato de lista no válido.');
            if (raw.length > 200) return fail('demasiadas filas.');
            const cols = field.columns || [];
            const out = [];
            for (const r of raw) {
                if (!isPlainObject(r)) return fail('formato de fila no válido.');
                const row = {};
                for (const c of cols) {
                    const sub = coerceValue({ ...c, label: `${field.label} · ${c.label}` }, r[c.key] ?? '');
                    if (!sub.ok) return sub;
                    row[c.key] = sub.value;
                }
                out.push(row);
            }
            return { ok: true, value: out };
        }
        default:
            return fail('este tipo de campo no se edita desde el expediente.');
    }
};

/**
 * El PLAN de una edición: qué cambia, en qué tabla, y si se puede.
 *
 * Reglas:
 *   · Sólo rutas del expediente marcadas `editable`. Todo lo demás —pagos,
 *     estados, referencias, club, archivos— no existe para este camino.
 *   · Cada edición trae el valor que la persona VIO (`before`): si cambió
 *     mientras editaba, se rechaza (409) en vez de pisar el trabajo de otro.
 *   · Un campo con cifras (`sensitive`) exige motivo.
 *   · Sin cambios reales no hay nada que guardar.
 */
export const planEdit = (dossier, { edits = [], reason = '' } = {}) => {
    if (!Array.isArray(edits) || !edits.length) return { ok: false, status: 400, error: 'No hay cambios que guardar.' };
    if (edits.length > 200) return { ok: false, status: 400, error: 'Demasiados cambios en una sola operación.' };
    const index = fieldIndex(dossier);
    const changes = [];
    const conflicts = [];
    const seen = new Set();
    for (const e of edits) {
        const path = str(e?.path);
        if (seen.has(path)) return { ok: false, status: 400, error: `El campo ${path} viene dos veces.` };
        seen.add(path);
        const field = index.get(path);
        if (!field) return { ok: false, status: 400, error: `El campo ${path} no existe en el expediente.` };
        if (!field.editable) return { ok: false, status: 403, error: `«${field.label}» no se edita desde el expediente. ${field.lockReason || ''}`.trim() };
        const coerced = coerceValue(field, e.value);
        if (!coerced.ok) return { ok: false, status: 400, error: coerced.error };
        const current = normalizeForCompare(field, field.value);
        if ('before' in (e || {}) && !sameValue(normalizeForCompare(field, e.before), current)) {
            conflicts.push({ path, label: field.label });
            continue;
        }
        if (sameValue(normalizeForCompare(field, coerced.value), current)) continue;
        changes.push({
            path, label: field.label, type: field.type, sensitive: !!field.sensitive,
            target: path.startsWith('submission.') ? 'submission' : 'form',
            formKey: field.formKey || null, sectionKey: field.sectionKey || null, key: field.key,
            before: field.value ?? null, after: coerced.value,
        });
    }
    if (conflicts.length) {
        return { ok: false, status: 409, conflicts, error: `Otra persona cambió ${conflicts.map(c => `«${c.label}»`).join(', ')} mientras editabas. Recarga el expediente para ver el valor actual.` };
    }
    if (!changes.length) return { ok: false, status: 400, error: 'Los valores son iguales a los guardados: no hay cambios.' };
    const cleanReason = str(reason).trim().slice(0, 1000);
    if (changes.some(c => c.sensitive) && cleanReason.length < 5) {
        return { ok: false, status: 400, needsReason: true, error: 'Estás cambiando cifras del proyecto: escribe el motivo del cambio.' };
    }
    return { ok: true, changes, reason: cleanReason || null };
};

// Para comparar, '' y null son lo mismo, y un número 4500 es igual a '4500'.
const normalizeForCompare = (field, v) => {
    if (v === undefined || v === null) return field.type === 'checkbox' ? false : (field.type === 'multiselect' || field.type === 'repeater' ? [] : '');
    if (['number', 'currency', 'percent'].includes(field.type)) {
        const t = str(v).trim();
        if (t === '') return '';
        const n = Number(t);
        return Number.isFinite(n) ? n : t;
    }
    if (field.type === 'text' || field.type === 'textarea' || field.type === 'email' || field.type === 'phone') return str(v).trim();
    return v;
};

/** Aplica los cambios de UN formulario sobre sus respuestas, campo a campo. */
export const applyFormChanges = (answers, changes) => {
    const next = isPlainObject(answers) ? JSON.parse(JSON.stringify(answers)) : {};
    for (const c of changes) {
        if (!isPlainObject(next[c.sectionKey])) next[c.sectionKey] = {};
        next[c.sectionKey][c.key] = c.after;
    }
    return next;
};

/** Valor de una columna de la postulación tal como se escribe en SQL. */
export const submissionColumnValue = (change) => {
    if (change.type === 'currency') return change.after === '' ? null : Number(change.after);
    return change.after === '' ? null : change.after;
};

export const submissionColumnOf = (key) => {
    for (const g of SUBMISSION_GROUPS) for (const f of g.fields) if (f.key === key && f.editable) return f.column;
    return null;
};

// ── Valores en inglés de lo que NO es narrativa ────────────────────────────
/**
 * El valor que se muestra en la versión inglesa de un campo no traducible:
 * opciones por glosario, sí/no, y lo demás tal cual (nombres, cifras,
 * correos). Devuelve { value, note } — `note` cuando no hubo equivalencia.
 */
export const englishValueOf = (field, glossary) => {
    const v = field.value;
    if (field.type === 'checkbox') return { value: v === true ? 'Yes' : (v === false ? 'No' : v) };
    if (field.type === 'select' && field.glossary && str(v).trim()) {
        const t = glossaryLookup(glossary, v);
        return t ? { value: t } : { value: v, note: 'sin equivalencia aprobada' };
    }
    if (field.type === 'multiselect' && Array.isArray(v)) {
        const out = v.map(x => glossaryLookup(glossary, x) || x);
        return { value: out, note: out.some((x, i) => x === v[i] && !glossaryLookup(glossary, v[i])) ? 'sin equivalencia aprobada' : undefined };
    }
    return { value: v };
};

/**
 * El expediente con su versión inglesa campo a campo (`valueEn`). Lo narrativo
 * sale de las traducciones (`translations`: ruta → texto); lo demás, de
 * `englishValueOf`. Un texto narrativo SIN traducción queda `valueEn = null`
 * y `untranslated = true`: la ficha inglesa lo dice en vez de colar el
 * español como si fuera inglés.
 */
export const englishView = (dossier, translations = new Map(), glossary = []) => ({
    groups: (dossier?.groups || []).map(g => ({
        ...g,
        sections: (g.sections || []).map(s => ({
            ...s,
            fields: (s.fields || []).map(f => {
                if (f.translatable && f.type === 'repeater') {
                    const cols = (f.columns || []).filter(c => c.type === 'textarea' || (c.type === 'text' && TRANSLATABLE_TEXT_KEYS.has(c.key)));
                    let untranslated = false;
                    const rows = (Array.isArray(f.value) ? f.value : []).map((r, i) => {
                        const out = { ...r };
                        for (const c of cols) {
                            const t = translations.get(`${f.path}[${i}].${c.key}`);
                            if (t) out[c.key] = t; else if (isMeaningfulText(r?.[c.key])) untranslated = true;
                        }
                        return out;
                    });
                    return { ...f, valueEn: rows, untranslated };
                }
                if (f.translatable) {
                    const t = translations.get(f.path);
                    const needs = isMeaningfulText(f.value);
                    return { ...f, valueEn: t ?? (needs ? null : f.value), untranslated: needs && !t };
                }
                const e = englishValueOf(f, glossary);
                return { ...f, valueEn: e.value, noteEn: e.note || null };
            }),
        })),
    })),
});

/**
 * Lo que va en una FICHA (PDF): el expediente sin el documento de identidad
 * nunca, y sin correo ni teléfono del responsable salvo que se pidan. Los
 * datos de pago no están en el expediente, así que no pueden colarse.
 */
const CONTACT_PATHS = new Set(['submission.email', 'submission.phone']);
export const forDocument = (dossier, { includeContact = false } = {}) => ({
    groups: (dossier?.groups || []).map(g => ({
        ...g,
        sections: (g.sections || []).map(s => ({
            ...s,
            fields: (s.fields || []).filter(f => f.path !== 'submission.document' && (includeContact || !CONTACT_PATHS.has(f.path))),
        })),
    })),
});

// ── Libreta de presentación ────────────────────────────────────────────────
//
// La libreta es un RESUMEN EDITORIAL del expediente para quien presenta el
// proyecto. Se prepara COPIANDO lo que el club escribió (no se redacta nada
// nuevo): cada bloque dice de qué campo salió. El comité la edita y la aprueba
// antes de usarla. El «mensaje breve» nace vacío a propósito: es lo único que
// se escribe a mano.
export const BOOKLET_BLOCKS = [
    { key: 'projectName', label: 'Nombre del proyecto', labelEn: 'Project name', sources: ['master.identificacion.projectName', 'fdd_2026_2027.proyecto.projectName', 'submission.projectName'] },
    { key: 'club', label: 'Club postulante', labelEn: 'Applicant club', sources: ['submission.clubName'], composite: (idx) => [val(idx, 'submission.clubName'), val(idx, 'submission.district')].filter(Boolean).join(' · ') },
    { key: 'location', label: 'Ubicación', labelEn: 'Location', sources: ['fdd_2026_2027.proyecto.location', 'master.identificacion.city', 'submission.city'] },
    { key: 'problem', label: 'Problema que busca resolver', labelEn: 'Problem addressed', sources: ['master.necesidades.needs', 'fdd_2026_2027.necesidades.needsAssessmentSummary'] },
    { key: 'objective', label: 'Objetivo principal', labelEn: 'Main objective', sources: ['master.objetivos.generalObjective', 'fdd_2026_2027.objetivo.mainObjective'] },
    { key: 'beneficiaries', label: 'Beneficiarios', labelEn: 'Beneficiaries', sources: ['master.necesidades.beneficiaries', 'fdd_2026_2027.objetivo.beneficiaries'] },
    { key: 'impact', label: 'Impacto esperado', labelEn: 'Expected impact', sources: ['master.necesidades.needsResponse', 'master.sostenibilidad.sustainability'] },
    { key: 'budget', label: 'Presupuesto', labelEn: 'Budget', sources: ['fdd_2026_2027.presupuesto.budgetUsd', 'submission.budgetUsd'], money: true },
    { key: 'message', label: 'Mensaje breve para la presentación', labelEn: 'Short presentation message', sources: [], manual: true },
];

const val = (idx, path) => {
    const f = idx.get(path);
    if (!f) return '';
    if (Array.isArray(f.value)) return f.value.join(', ');
    return str(f.value).trim();
};

/**
 * Propuesta de libreta a partir del expediente. Para el inglés se usan las
 * traducciones (las aprobadas si existen; si no, el borrador, y la libreta lo
 * marca) y los rótulos fijos.
 */
export const prepareBooklet = (dossier, { lang = 'es', translations = null } = {}) => {
    const idx = fieldIndex(dossier);
    const tr = translations instanceof Map ? translations : new Map();
    const blocks = BOOKLET_BLOCKS.map(b => {
        if (b.manual) return { key: b.key, label: lang === 'en' ? b.labelEn : b.label, text: '', source: null, manual: true };
        if (b.composite) {
            const text = b.composite(idx);
            return { key: b.key, label: lang === 'en' ? b.labelEn : b.label, text: lang === 'en' ? text.replace(/Distrito/g, 'District') : text, source: b.sources[0] };
        }
        for (const path of b.sources) {
            const raw = val(idx, path);
            if (!raw) continue;
            let text = raw;
            if (b.money) {
                const n = Number(raw);
                text = Number.isFinite(n) ? `US$ ${n.toLocaleString(lang === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 })}` : raw;
            } else if (lang === 'en' && tr.has(path)) {
                text = tr.get(path);
            }
            return { key: b.key, label: lang === 'en' ? b.labelEn : b.label, text, source: path, untranslated: lang === 'en' && !b.money && !tr.has(path) && isMeaningfulText(raw) };
        }
        return { key: b.key, label: lang === 'en' ? b.labelEn : b.label, text: '', source: null };
    });
    return { lang, blocks };
};

/** Normaliza una libreta recibida del panel: bloques conocidos, texto acotado. */
export const normalizeBooklet = (content) => {
    const known = new Map(BOOKLET_BLOCKS.map(b => [b.key, b]));
    const blocks = (Array.isArray(content?.blocks) ? content.blocks : [])
        .filter(b => b && known.has(b.key))
        .map(b => ({ key: b.key, label: str(b.label).slice(0, 120) || known.get(b.key).label, text: str(b.text).slice(0, 6000), source: b.source ? str(b.source).slice(0, 200) : null }));
    if (!blocks.length) return { ok: false, error: 'La libreta no tiene bloques.' };
    return { ok: true, content: { blocks } };
};

/**
 * Cifras de la libreta que NO aparecen en el expediente. El mensaje breve es
 * texto libre: si alguien escribe «beneficia a 5.000 familias» y el expediente
 * no lo dice, se avisa antes de aprobar.
 */
export const auditBooklet = (content, dossier) => {
    const all = [];
    for (const g of dossier?.groups || []) for (const s of g.sections || []) for (const f of s.fields || []) all.push(JSON.stringify(f.value ?? ''));
    const haystack = new Set(digitsOf(all.join(' ')));
    const out = [];
    for (const b of content?.blocks || []) {
        const extra = [...new Set(digitsOf(b.text))].filter(d => d.length >= 2 && !haystack.has(d));
        if (extra.length) out.push({ key: b.key, label: b.label, numbers: extra.slice(0, 6) });
    }
    return out;
};

export default {
    BASE_LANG, TARGET_LANGS, TRANSLATION_STATES, FIELD_STATES, SUBMISSION_GROUPS, LABELS_EN, DEFAULT_GLOSSARY,
    isTargetLang, hashOf, isFilled, mergeGlossary, glossaryLookup, isTranslatableField, buildDossier, fieldIndex,
    translatableItems, isMeaningfulText, fingerprintOf, translationStatus, approvalCheck, auditTranslation,
    planBatches, translationSystemPrompt, translationUserPrompt, parseTranslationResponse, coerceValue, planEdit,
    applyFormChanges, submissionColumnValue, submissionColumnOf, englishValueOf, englishView, forDocument, prepareBooklet, normalizeBooklet, auditBooklet,
};
