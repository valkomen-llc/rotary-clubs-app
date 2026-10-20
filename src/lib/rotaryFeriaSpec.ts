// ════════════════════════════════════════════════════════════════════════════
// Especificación Oficial: Canal Especializado de Feria de Proyectos Colombia
// Integración con Rotary en Acción — Club Platform v4.1218.0
// ════════════════════════════════════════════════════════════════════════════

export interface RotaryAreaOption {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  description: string;
  descriptionEn: string;
  isOfficialArea: boolean;
}

/**
 * Las siete áreas de interés oficiales de Rotary International + opción complementaria "Otros".
 * La categoría "Otros" funciona como clasificación complementaria, no como un área oficial de Rotary.
 */
export const ROTARY_AREAS_INTEREST: RotaryAreaOption[] = [
  {
    id: 'paz',
    slug: 'promocion-paz',
    name: 'Promoción de la paz',
    nameEn: 'Peacebuilding and conflict prevention',
    icon: '🕊️',
    color: '#013388',
    description: 'Prevención y resolución de conflictos, mediación y fortalecimiento de la convivencia.',
    descriptionEn: 'Conflict prevention, mediation, resolution, and community peacebuilding.',
    isOfficialArea: true,
  },
  {
    id: 'enfermedades',
    slug: 'prevencion-tratamiento-enfermedades',
    name: 'Prevención y tratamiento de enfermedades',
    nameEn: 'Disease prevention and treatment',
    icon: '❤️',
    color: '#D91B5C',
    description: 'Salud comunitaria, jornadas médicas, vacunación, salud mental y equipamiento hospitalario.',
    descriptionEn: 'Community health, medical missions, immunization, mental health, and hospital equipment.',
    isOfficialArea: true,
  },
  {
    id: 'agua',
    slug: 'agua-saneamiento-higiene',
    name: 'Agua, saneamiento e higiene',
    nameEn: 'Water, sanitation, and hygiene',
    icon: '💧',
    color: '#009FC3',
    description: 'Acceso a agua potable, pozos, acueductos comunitarios y educación en higiene.',
    descriptionEn: 'Clean water access, wells, community water supply systems, and hygiene education.',
    isOfficialArea: true,
  },
  {
    id: 'materno_infantil',
    slug: 'salud-materno-infantil',
    name: 'Salud materno-infantil',
    nameEn: 'Maternal and child health',
    icon: '🤱',
    color: '#9B26B6',
    description: 'Nutrición infantil, atención prenatal y posnatal, reducción de mortalidad y cuidado materno.',
    descriptionEn: 'Child nutrition, prenatal and postnatal care, mortality reduction, and maternal health.',
    isOfficialArea: true,
  },
  {
    id: 'educacion',
    slug: 'alfabetizacion-educacion-basica',
    name: 'Alfabetización y educación básica',
    nameEn: 'Basic education and literacy',
    icon: '📚',
    color: '#FB8200',
    description: 'Dotación escolar, tecnología educativa, becas, bibliotecas y alfabetización de adultos.',
    descriptionEn: 'School supplies, educational technology, scholarships, libraries, and adult literacy.',
    isOfficialArea: true,
  },
  {
    id: 'desarrollo_economico',
    slug: 'desarrollo-economico-comunidad',
    name: 'Desarrollo económico de la comunidad',
    nameEn: 'Community economic development',
    icon: '🏗️',
    color: '#00845B',
    description: 'Microcréditos, cooperativas campesinas, formación para el empleo y emprendimiento sostenible.',
    descriptionEn: 'Microloans, agricultural cooperatives, job training, and sustainable entrepreneurship.',
    isOfficialArea: true,
  },
  {
    id: 'medio_ambiente',
    slug: 'proteccion-medioambiente',
    name: 'Protección del medioambiente',
    nameEn: 'Supporting the environment',
    icon: '🌱',
    color: '#2E7D32',
    description: 'Reforestación, energías limpias, conservación de cuencas, reciclaje y biodiversidad.',
    descriptionEn: 'Reforestation, renewable energy, watershed conservation, recycling, and biodiversity.',
    isOfficialArea: true,
  },
  {
    id: 'otros',
    slug: 'otros-proyectos-iniciativas',
    name: 'Otros proyectos e iniciativas',
    nameEn: 'Other projects and initiatives',
    icon: '✨',
    color: '#5C6BC0',
    description: 'Iniciativas intersectoriales, respuesta ante desastres y proyectos especiales de servicio.',
    descriptionEn: 'Cross-sector initiatives, disaster relief, and special community service projects.',
    isOfficialArea: false,
  },
];

export interface ProjectGoalOption {
  id: string;
  label: string;
  labelEn: string;
  icon: string;
  description: string;
  descriptionEn: string;
  badgeTone: string;
}

export const PROJECT_GOAL_OPTIONS: ProjectGoalOption[] = [
  {
    id: 'nuevo',
    label: 'Presentar un nuevo proyecto',
    labelEn: 'Submit a new project',
    icon: '🚀',
    description: 'Dar a conocer una iniciativa en formulación o que inicia su trayectoria.',
    descriptionEn: 'Showcase an initiative under formulation or starting its journey.',
    badgeTone: 'sky',
  },
  {
    id: 'avances',
    label: 'Compartir avances de un proyecto existente',
    labelEn: 'Share progress on an existing project',
    icon: '📈',
    description: 'Actualizar logros, actividades ejecutadas y etapas completadas.',
    descriptionEn: 'Update achievements, executed activities, and completed milestones.',
    badgeTone: 'emerald',
  },
  {
    id: 'resultados',
    label: 'Mostrar resultados e impacto',
    labelEn: 'Showcase results and impact',
    icon: '🏆',
    description: 'Presentar beneficiarios reales alcanzados, evidencias y métricas verificadas.',
    descriptionEn: 'Present actual beneficiaries reached, evidence, and verified metrics.',
    badgeTone: 'purple',
  },
  {
    id: 'nueva_etapa',
    label: 'Informar sobre una nueva etapa',
    labelEn: 'Report a new project phase',
    icon: '🔄',
    description: 'Ampliación territorial, nueva fase de desarrollo o escalamiento del proyecto.',
    descriptionEn: 'Territorial expansion, new development phase, or project scaling.',
    badgeTone: 'indigo',
  },
  {
    id: 'buscar_aliados_financiacion',
    label: 'Buscar aliados o financiación',
    labelEn: 'Seek partners or funding',
    icon: '🤝',
    description: 'Conectar con clubes internacionales, patrocinios o subvenciones globales.',
    descriptionEn: 'Connect with international clubs, sponsorships, or global grants.',
    badgeTone: 'amber',
  },
  {
    id: 'historia_exito',
    label: 'Compartir una historia de éxito',
    labelEn: 'Share a success story',
    icon: '⭐',
    description: 'Documentar testimonios de transformación y lecciones aprendidas.',
    descriptionEn: 'Document life transformation testimonials and lessons learned.',
    badgeTone: 'rose',
  },
];

export const FAIR_EDITIONS = [
  'XII Edición Valledupar 2027',
  'XI Edición Bucaramanga 2026',
  'X Edición Cartagena 2025',
  'IX Edición Pereira 2024',
  'VIII Edición Medellín 2023',
  'VII Edición Cali 2022',
  'Edición Anterior (Histórico)',
];

export interface ProjectStageOption {
  id: string;
  label: string;
  labelEn: string;
}

export const PROJECT_STAGES: ProjectStageOption[] = [
  { id: 'formulacion', label: 'En formulación y diseño', labelEn: 'Under design & formulation' },
  { id: 'busqueda_fondos', label: 'En búsqueda de financiación / aliados', labelEn: 'Seeking funding / partners' },
  { id: 'aprobado_fondos', label: 'Con financiación asegurada / subvención', labelEn: 'With secured funding / grant' },
  { id: 'ejecucion', label: 'En ejecución activa', labelEn: 'Actively in progress' },
  { id: 'completado', label: 'Completado / ejecutado exitosamente', labelEn: 'Completed / successfully executed' },
  { id: 'expansion', label: 'En fase de ampliación / réplica', labelEn: 'Expanding / replication phase' },
];

export function getRotaryAreaName(area?: RotaryAreaOption | null, lang?: string): string {
  if (!area) return '';
  return (lang === 'en' && area.nameEn) ? area.nameEn : area.name;
}

export function getRotaryAreaDescription(area?: RotaryAreaOption | null, lang?: string): string {
  if (!area) return '';
  return (lang === 'en' && area.descriptionEn) ? area.descriptionEn : area.description;
}

export function getProjectGoalLabel(goal?: ProjectGoalOption | null, lang?: string): string {
  if (!goal) return '';
  return (lang === 'en' && goal.labelEn) ? goal.labelEn : goal.label;
}

export function getProjectGoalDescription(goal?: ProjectGoalOption | null, lang?: string): string {
  if (!goal) return '';
  return (lang === 'en' && goal.descriptionEn) ? goal.descriptionEn : goal.description;
}

export function getProjectStageLabel(stage?: ProjectStageOption | null, lang?: string): string {
  if (!stage) return '';
  return (lang === 'en' && stage.labelEn) ? stage.labelEn : stage.label;
}

export interface ProjectTimelineEvent {
  yearOrDate: string;
  title: string;
  description: string;
  results?: string;
}

export interface ProjectEvolution {
  // Resultados comprobados vs estimaciones
  resultadosComprobados?: string;
  estimacionesActuales?: string;
  objetivosFuturos?: string;

  // Impacto cuantitativo
  beneficiariosDirectos?: number | string;
  beneficiariosIndirectos?: number | string;
  familiasBeneficiadas?: number | string;

  // Recursos y Financiación
  recursosGestionadosMoneda?: 'COP' | 'USD' | 'EUR';
  recursosGestionadosMonto?: number | string;
  financiacionRecibidaDetalle?: string;
  subvencionesGlobales?: string;

  // Red de Alianzas y Cooperación
  organizacionesParticipantes?: string; // ONGs, empresas, entes locales
  clubesAliadosNacionales?: string;
  clubesAliadosInternacionales?: string;
  participacionInternacionalPaises?: string; // Ej: Estados Unidos, Alemania, México

  // Ejecución
  etapasCompletadas?: string;
  actividadesEjecutadas?: string;
  nuevosObjetivos?: string;
  necesidadesActuales?: string; // Necesidades de fondos, equipamiento, mentores

  // Clasificación complementaria si eligió "Otros"
  clasificacionOtrosDetalle?: string;

  // Línea de tiempo
  lineaDeTiempo?: ProjectTimelineEvent[];
}

export const goalLabel = (id?: string | null): string => {
  const g = PROJECT_GOAL_OPTIONS.find((o) => o.id === id);
  return g ? `${g.icon} ${g.label}` : 'Proyecto Rotario';
};

export const goalBadgeClass = (id?: string | null): string => {
  switch (id) {
    case 'nuevo':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'avances':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'resultados':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'nueva_etapa':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'buscar_aliados_financiacion':
      return 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
    case 'historia_exito':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};
