// ════════════════════════════════════════════════════════════════════════════
// Especificación Oficial: Canal Especializado de Feria de Proyectos Colombia
// Integración con Rotary en Acción — Club Platform v4.1218.0
// ════════════════════════════════════════════════════════════════════════════

export interface RotaryAreaOption {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  description: string;
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
    icon: '🕊️',
    color: '#013388',
    description: 'Prevención y resolución de conflictos, mediación y fortalecimiento de la convivencia.',
    isOfficialArea: true,
  },
  {
    id: 'enfermedades',
    slug: 'prevencion-tratamiento-enfermedades',
    name: 'Prevención y tratamiento de enfermedades',
    icon: '❤️',
    color: '#D91B5C',
    description: 'Salud comunitaria, jornadas médicas, vacunación, salud mental y equipamiento hospitalario.',
    isOfficialArea: true,
  },
  {
    id: 'agua',
    slug: 'agua-saneamiento-higiene',
    name: 'Agua, saneamiento e higiene',
    icon: '💧',
    color: '#009FC3',
    description: 'Acceso a agua potable, pozos, acueductos comunitarios y educación en higiene.',
    isOfficialArea: true,
  },
  {
    id: 'materno_infantil',
    slug: 'salud-materno-infantil',
    name: 'Salud materno-infantil',
    icon: '🤱',
    color: '#9B26B6',
    description: 'Nutrición infantil, atención prenatal y posnatal, reducción de mortalidad y cuidado materno.',
    isOfficialArea: true,
  },
  {
    id: 'educacion',
    slug: 'alfabetizacion-educacion-basica',
    name: 'Alfabetización y educación básica',
    icon: '📚',
    color: '#FB8200',
    description: 'Dotación escolar, tecnología educativa, becas, bibliotecas y alfabetización de adultos.',
    isOfficialArea: true,
  },
  {
    id: 'desarrollo_economico',
    slug: 'desarrollo-economico-comunidad',
    name: 'Desarrollo económico de la comunidad',
    icon: '🏗️',
    color: '#00845B',
    description: 'Microcréditos, cooperativas campesinas, formación para el empleo y emprendimiento sostenible.',
    isOfficialArea: true,
  },
  {
    id: 'medio_ambiente',
    slug: 'proteccion-medioambiente',
    name: 'Protección del medioambiente',
    icon: '🌱',
    color: '#2E7D32',
    description: 'Reforestación, energías limpias, conservación de cuencas, reciclaje y biodiversidad.',
    isOfficialArea: true,
  },
  {
    id: 'otros',
    slug: 'otros-proyectos-iniciativas',
    name: 'Otros proyectos e iniciativas',
    icon: '✨',
    color: '#5C6BC0',
    description: 'Iniciativas intersectoriales, respuesta ante desastres y proyectos especiales de servicio.',
    isOfficialArea: false,
  },
];

export interface ProjectGoalOption {
  id: string;
  label: string;
  icon: string;
  description: string;
  badgeTone: string;
}

export const PROJECT_GOAL_OPTIONS: ProjectGoalOption[] = [
  {
    id: 'nuevo',
    label: 'Presentar un nuevo proyecto',
    icon: '🚀',
    description: 'Dar a conocer una iniciativa en formulación o que inicia su trayectoria.',
    badgeTone: 'sky',
  },
  {
    id: 'avances',
    label: 'Compartir avances de un proyecto existente',
    icon: '📈',
    description: 'Actualizar logros, actividades ejecutadas y etapas completadas.',
    badgeTone: 'emerald',
  },
  {
    id: 'resultados',
    label: 'Mostrar resultados e impacto',
    icon: '🏆',
    description: 'Presentar beneficiarios reales alcanzados, evidencias y métricas verificadas.',
    badgeTone: 'purple',
  },
  {
    id: 'nueva_etapa',
    label: 'Informar sobre una nueva etapa',
    icon: '🔄',
    description: 'Ampliación territorial, nueva fase de desarrollo o escalamiento del proyecto.',
    badgeTone: 'indigo',
  },
  {
    id: 'buscar_aliados_financiacion',
    label: 'Buscar aliados o financiación',
    icon: '🤝',
    description: 'Conectar con clubes internacionales, patrocinios o subvenciones globales.',
    badgeTone: 'amber',
  },
  {
    id: 'historia_exito',
    label: 'Compartir una historia de éxito',
    icon: '⭐',
    description: 'Documentar testimonios de transformación y lecciones aprendidas.',
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

export const PROJECT_STAGES = [
  { id: 'formulacion', label: 'En formulación y diseño' },
  { id: 'busqueda_fondos', label: 'En búsqueda de financiación / aliados' },
  { id: 'aprobado_fondos', label: 'Con financiación asegurada / subvención' },
  { id: 'ejecucion', label: 'En ejecución activa' },
  { id: 'completado', label: 'Completado / ejecutado exitosamente' },
  { id: 'expansion', label: 'En fase de ampliación / réplica' },
];

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
