// ════════════════════════════════════════════════════════════════════
// Plantilla — Solicitud de Aportes del FDD 2026-2027
// v4.642.0
//
// Segundo formulario del proyecto, hermano de la Formulación (ver
// `projectFairMasterForm.js`). No está codificado en pantalla: se define aquí
// como datos (secciones → campos) y el panel del club lo renderiza con los
// mismos componentes que la Formulación, de modo que agregar, quitar o
// reordenar campos no obliga a tocar la interfaz.
//
// Reproduce el formato oficial del Distrito 4271 (Subvenciones Globales —
// Solicitud de Aportes del FDD 2026-2027) con el mismo contenido, pero
// organizado en secciones lógicas en vez de una tabla de documento:
//
//   Requisitos del club  →  sección "Declaraciones y firmas"
//   Datos del club y presidentes → tres secciones
//   Objetivo, proyecto, necesidades, Subvención Global, contactos
//   Presupuesto, aportes esperados, solicitud del FDD
//   Firma del GD y del presidente del Comité de LFRI → sección `adminOnly`
//
// La sección marcada con `adminOnly: true` NO se le muestra editable al
// Gestor de Proyectos: la escribe el panel administrativo y el servidor
// descarta cualquier intento de escribirla desde el panel del club.
// ════════════════════════════════════════════════════════════════════

// Caracteres por línea del formato impreso, para traducir los topes de
// extensión del documento original a un máximo de caracteres.
const CHARS_PER_LINE = 120;
const lines = (n) => n * CHARS_PER_LINE;

/**
 * Versión de la plantilla base. Igual que en la Formulación: una copia
 * guardada en la configuración sin `version` viene de antes de que existiera
 * el editor, y se reemplaza al leerla. A partir de aquí manda lo guardado.
 */
export const FDD_FORM_VERSION = 1;

export const FDD_FORM_KEY = 'fdd_2026_2027';

export const DEFAULT_FDD_FORM = {
    version: FDD_FORM_VERSION,
    enabled: true,
    key: FDD_FORM_KEY,
    title: 'Solicitud de Aportes del FDD 2026-2027',
    shortTitle: 'Aportes del FDD',
    subtitle: 'Subvenciones Globales · Distrito 4271',
    icon: 'wallet',
    intro: 'Solicitud de aportes del Fondo Distrital Designado (FDD) para el periodo 2026-2027. Puedes guardar y volver cuantas veces necesites: el avance queda registrado. Cuando esté completo, envíalo para la revisión del Distrito.',
    // Requisitos del encabezado del formato oficial. Se muestran como aviso
    // arriba del formulario y se confirman uno por uno en "Declaraciones".
    requirements: [
        'El club debe estar certificado.',
        'No tener informes vencidos de Subvenciones Distritales (SD) ni Globales (SG).',
        'Estar 100% registrado en MyRotary.org.',
        'Estar al día con las obligaciones del Distrito.',
    ],
    // Precarga desde la inscripción del proyecto (ver `seedAnswers`).
    // Datos disponibles: projectName · clubName · district · city · country ·
    // focusArea · focusAreaLabel · contactName · contactEmail · contactPhone ·
    // budgetUsd
    prefill: {
        clubName: 'club.clubName',
        district: 'club.district',
        city: 'solicitud.city',
        projectName: 'proyecto.projectName',
        focusAreaLabel: 'proyecto.focusArea',
        contactName: 'contactos.localContactName',
        contactEmail: 'contactos.localContactEmail',
        contactPhone: 'contactos.localContactPhone',
        budgetUsd: 'presupuesto.budgetUsd',
    },
    // Precarga desde OTRO formulario del mismo proyecto: la clave es
    // 'formKey.seccion.campo' del formulario origen y el valor, el campo de
    // esta plantilla donde se copia. Sólo se usa para inicializar el borrador;
    // después el club manda sobre su propia copia.
    prefillFrom: {
        'master.objetivos.generalObjective': 'objetivo.mainObjective',
        'master.necesidades.beneficiaries': 'objetivo.beneficiaries',
        'master.necesidades.needs': 'necesidades.needsAssessmentSummary',
        'master.identificacion.city': 'proyecto.location',
    },
    sections: [
        {
            key: 'solicitud',
            title: 'Información general de la solicitud',
            description: 'Dónde y cuándo se firma esta solicitud.',
            fields: [
                { key: 'city', label: 'Ciudad', type: 'text', required: true, width: 'half',
                  help: 'Ciudad desde la que el club presenta la solicitud.' },
                { key: 'requestDate', label: 'Fecha de la solicitud', type: 'date', required: true, width: 'half' },
                { key: 'period', label: 'Periodo del FDD', type: 'text', required: false, width: 'half',
                  default: '2026-2027',
                  help: 'Periodo al que corresponde la solicitud. Por defecto, 2026-2027.' },
            ],
        },
        {
            key: 'club',
            title: 'Información del Club Rotario',
            description: 'Club que presenta la solicitud.',
            fields: [
                { key: 'clubName', label: 'Nombre del Club Rotario', type: 'text', required: true, width: 'half' },
                { key: 'district', label: 'Distrito', type: 'text', required: true, width: 'half',
                  help: 'Distrito al que pertenece el club (por ejemplo, Rotary Distrito 4271).' },
                { key: 'clubId', label: 'Número de identificación del club en Rotary', type: 'text', required: false, width: 'half',
                  help: 'Opcional. El identificador con el que figura el club en MyRotary.org.' },
            ],
        },
        {
            key: 'presidente',
            title: 'Presidente 2026-2027',
            description: 'Quien presidirá el club durante el periodo de la solicitud.',
            fields: [
                { key: 'presidentName', label: 'Nombre completo', type: 'text', required: true, width: 'full' },
                { key: 'presidentPhone', label: 'Celular', type: 'phone', required: true, width: 'half' },
                { key: 'presidentEmail', label: 'E-mail', type: 'email', required: true, width: 'half' },
            ],
        },
        {
            key: 'lfri',
            title: 'Presidente del Comité de LFRI en el club',
            description: 'Responsable del comité de La Fundación Rotaria dentro del club.',
            fields: [
                { key: 'lfriName', label: 'Nombre completo', type: 'text', required: true, width: 'full' },
                { key: 'lfriPhone', label: 'Celular', type: 'phone', required: true, width: 'half' },
                { key: 'lfriEmail', label: 'E-mail', type: 'email', required: true, width: 'half' },
            ],
        },
        {
            key: 'objetivo',
            title: 'Objetivo principal y beneficiarios',
            fields: [
                { key: 'mainObjective', label: 'Objetivo principal', type: 'textarea', required: true,
                  rows: 5, maxLength: lines(8), width: 'full',
                  help: 'Qué busca lograr el proyecto. Máximo 8 líneas.' },
                { key: 'beneficiaries', label: 'Beneficiarios', type: 'textarea', required: true,
                  rows: 4, maxLength: lines(6), width: 'full',
                  help: 'A quién beneficia el proyecto. Máximo 6 líneas.' },
                { key: 'beneficiariesCount', label: 'Número estimado de beneficiarios', type: 'number', required: true, width: 'half',
                  help: 'Cantidad aproximada de personas beneficiadas.' },
            ],
        },
        {
            key: 'proyecto',
            title: 'Información del proyecto',
            fields: [
                { key: 'projectName', label: 'Nombre del proyecto', type: 'text', required: true, width: 'full' },
                { key: 'focusArea', label: 'Área de interés', type: 'select', required: true, width: 'full',
                  optionsFrom: 'focusAreas',
                  help: 'Área de enfoque de Rotary International con la que se alinea el proyecto.' },
                { key: 'location', label: 'Lugar de realización', type: 'text', required: true, width: 'half' },
                { key: 'scheduledDate', label: 'Fecha programada', type: 'date', required: true, width: 'half',
                  help: 'Fecha prevista de ejecución. Si es un rango, indica la de inicio y detállalo abajo.' },
                { key: 'scheduleNotes', label: 'Detalle del cronograma', type: 'textarea', required: false,
                  rows: 3, maxLength: lines(4), width: 'full',
                  help: 'Opcional. Fases, duración o fechas adicionales. Máximo 4 líneas.' },
            ],
        },
        {
            key: 'necesidades',
            title: 'Evaluación de necesidades',
            description: 'Rotary exige que el proyecto nazca de una evaluación de las necesidades de la comunidad.',
            fields: [
                { key: 'needsAssessmentDone', label: '¿Se realizó la evaluación de las necesidades de la comunidad?',
                  type: 'select', required: true, width: 'half', options: ['Sí', 'No', 'En proceso'] },
                { key: 'needsAssessmentDate', label: 'Fecha de la evaluación', type: 'date', required: false, width: 'half',
                  help: 'Si ya se realizó, indica cuándo.' },
                { key: 'needsAssessmentSummary', label: 'Resultado de la evaluación', type: 'textarea', required: true,
                  rows: 4, maxLength: lines(6), width: 'full',
                  help: 'Qué necesidades se identificaron y con qué metodología. Máximo 6 líneas.' },
            ],
        },
        {
            key: 'subvencion',
            title: 'Información sobre la Subvención Global',
            fields: [
                { key: 'alreadyRequested', label: '¿Ya solicitó la subvención a LFRI?', type: 'select', required: true,
                  width: 'half', options: ['Sí', 'No'] },
                { key: 'ggNumber', label: 'Número de la Subvención Global (GG #)', type: 'text', required: false, width: 'half',
                  help: 'Sólo si ya se solicitó. Es el número que asigna La Fundación Rotaria (por ejemplo, GG2412345).' },
                { key: 'ggStatus', label: 'Estado de la solicitud en LFRI', type: 'select', required: false, width: 'half',
                  options: ['Borrador', 'Enviada', 'En revisión', 'Aprobada', 'No aplica'] },
            ],
        },
        {
            key: 'contactos',
            title: 'Contactos del proyecto',
            description: 'Primer contacto local del proyecto, para las comunicaciones del Distrito.',
            fields: [
                { key: 'localContactName', label: 'Primer contacto local del proyecto', type: 'text', required: true, width: 'full' },
                { key: 'localContactPhone', label: 'Celular', type: 'phone', required: true, width: 'half' },
                { key: 'localContactEmail', label: 'E-mail', type: 'email', required: true, width: 'half' },
            ],
        },
        {
            key: 'presupuesto',
            title: 'Información financiera y presupuesto',
            description: 'Todos los valores de esta sección y las siguientes van en dólares (US$).',
            fields: [
                { key: 'budgetUsd', label: 'Presupuesto total del proyecto (US$)', type: 'currency', required: true, width: 'half',
                  help: 'Costo total del proyecto, sumando todas las fuentes de financiación.' },
                { key: 'budgetBreakdown', label: 'Desglose del presupuesto', type: 'repeater', required: false, width: 'full',
                  help: 'Opcional. Detalla los rubros principales del presupuesto.',
                  columns: [
                      { key: 'concept', label: 'Concepto', type: 'text' },
                      { key: 'amountUsd', label: 'Valor (US$)', type: 'currency' },
                  ] },
            ],
        },
        {
            key: 'aportes',
            title: 'Aportes esperados y fuentes de financiación',
            description: 'Aportes con los que el proyecto cuenta además del FDD.',
            fields: [
                { key: 'clubsDistrictUsd', label: 'Aportes del Club y otros clubes del Distrito (US$)', type: 'currency', required: true, width: 'half' },
                { key: 'foreignClubsUsd', label: 'Aportes esperados de clubes del exterior (US$)', type: 'currency', required: true, width: 'half' },
                { key: 'foreignDistrictsUsd', label: 'Aportes esperados de distritos del exterior (US$)', type: 'currency', required: true, width: 'half' },
                { key: 'expectedTotalUsd', label: 'Total de aportes esperados (US$)', type: 'computed', width: 'half',
                  compute: { op: 'sum', sources: ['aportes.clubsDistrictUsd', 'aportes.foreignClubsUsd', 'aportes.foreignDistrictsUsd'] },
                  help: 'Se calcula solo con los tres valores anteriores.' },
                { key: 'fapContributionUsd', label: 'Aportes del Club al FAP 2023-2024 (US$)', type: 'currency', required: true, width: 'half',
                  help: 'Lo aportado por el club al Fondo Anual Programas en el periodo 2023-2024.' },
                { key: 'fapMinimumUsd', label: '25% mín. del aporte al FAP 2023-2024 (US$)', type: 'computed', width: 'half',
                  compute: { op: 'percent', source: 'aportes.fapContributionUsd', factor: 0.25 },
                  help: 'Mínimo exigido por el reglamento del Distrito. Se calcula solo.' },
            ],
        },
        {
            key: 'fdd',
            title: 'Solicitud del FDD',
            description: 'Lo que el club solicita al Distrito con cargo al Fondo Distrital Designado.',
            fields: [
                { key: 'requestedUsd', label: 'Cantidad solicitada al Distrito del FDD 2026-2027 (US$)', type: 'currency', required: true, width: 'half' },
                { key: 'fapGoalUsd', label: 'Meta de aportes al FAP 2026-2027 (US$)', type: 'currency', required: true, width: 'half',
                  help: 'Meta de aportes del club al Fondo Anual Programas para el periodo 2026-2027.' },
                { key: 'justification', label: 'Justificación de la solicitud', type: 'textarea', required: false,
                  rows: 4, maxLength: lines(6), width: 'full',
                  help: 'Opcional. Por qué el proyecto necesita este aporte. Máximo 6 líneas.' },
            ],
        },
        {
            key: 'declaraciones',
            title: 'Declaraciones y firmas',
            description: 'Confirma que el club cumple los requisitos y firma la solicitud.',
            fields: [
                { key: 'reqCertified', label: 'El club está certificado', type: 'checkbox', required: true, width: 'full',
                  help: 'Confirmo que el club está certificado.' },
                { key: 'reqNoOverdueReports', label: 'Sin informes vencidos', type: 'checkbox', required: true, width: 'full',
                  help: 'Confirmo que el club no tiene informes vencidos de Subvenciones Distritales ni Globales.' },
                { key: 'reqMyRotary', label: 'Registro en MyRotary.org', type: 'checkbox', required: true, width: 'full',
                  help: 'Confirmo que el club está 100% registrado en MyRotary.org.' },
                { key: 'reqDistrictObligations', label: 'Obligaciones del Distrito al día', type: 'checkbox', required: true, width: 'full',
                  help: 'Confirmo que el club está al día con las obligaciones del Distrito.' },
                { key: 'presidentSignature', label: 'Firma del presidente del Club 2026-2027', type: 'text', required: true, width: 'half',
                  help: 'Escribe el nombre completo de quien firma. Equivale a la firma del formato impreso.' },
                { key: 'presidentSignatureDate', label: 'Fecha de la firma', type: 'date', required: true, width: 'half' },
                { key: 'presidentElectSignature', label: 'Firma del presidente Electo 2027-2028', type: 'text', required: true, width: 'half',
                  help: 'Escribe el nombre completo de quien firma.' },
                { key: 'presidentElectSignatureDate', label: 'Fecha de la firma', type: 'date', required: true, width: 'half' },
            ],
        },
        {
            // Espacio del formato oficial reservado al Gobernador de Distrito y
            // al presidente del Comité de LFRI. El Gestor de Proyectos la ve en
            // solo lectura; sólo el panel administrativo la escribe.
            key: 'aprobacion',
            title: 'Aprobación institucional',
            description: 'Espacio para ser llenado por el Gobernador de Distrito y el presidente del Comité de LFRI. El club no lo diligencia.',
            adminOnly: true,
            fields: [
                { key: 'approvedAmountUsd', label: 'Aporte aprobado (US$)', type: 'currency', required: false, width: 'half' },
                { key: 'decisionDate', label: 'Fecha de la decisión', type: 'date', required: false, width: 'half' },
                { key: 'gdSignature', label: 'Firma del Gobernador de Distrito', type: 'text', required: false, width: 'half' },
                { key: 'lfriChairSignature', label: 'Firma del presidente del Comité de LFRI', type: 'text', required: false, width: 'half' },
                { key: 'notes', label: 'Observaciones del Distrito', type: 'textarea', required: false,
                  rows: 3, maxLength: lines(6), width: 'full' },
            ],
        },
    ],
};
