// Espejo navegador del criterio Rotary en Acción (pintar/acotar, no decide).
export const CONDITIONAL_FIELDS: Record<string, { extra: string[]; impacto: string[] }> = {
  evento: { extra: ['fechaFin', 'lugar', 'asistentes', 'agenda'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
  proyecto: { extra: ['objetivo', 'resultados', 'aliados', 'ubicacion', 'estadoProyecto'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
  'proyecto-internacional': { extra: ['objetivo', 'paisSocio', 'clubSocio', 'resultados', 'aliados'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
  emergencia: { extra: ['tipoEmergencia', 'zonaAfectada', 'ayudaEntregada', 'necesidades'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
  recaudacion: { extra: ['proposito', 'montoMeta'], impacto: ['fondosRecaudados', 'beneficiarios', 'voluntarios', 'horas'] },
  capacitacion: { extra: ['tematica', 'asistentes', 'resultados'], impacto: ['capacitados', 'beneficiarios', 'voluntarios', 'horas'] },
  campana: { extra: ['objetivo', 'resultados', 'aliados'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
  alianza: { extra: ['organizacion', 'objetivo', 'resultados'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
  juventud: { extra: ['programaJuvenil', 'asistentes', 'resultados'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
  actividad: { extra: ['objetivo', 'resultados'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
  'historia-servicio': { extra: ['protagonista', 'resultados'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
  reconocimiento: { extra: ['reconocido', 'motivo'], impacto: [] },
  testimonio: { extra: ['protagonista'], impacto: [] },
  convocatoria: { extra: ['fechaCierre', 'lugar', 'requisitos'], impacto: [] },
  otra: { extra: [], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos'] },
};
export const fieldsForTipo = (slug: string) =>
  CONDITIONAL_FIELDS[slug] || { extra: [], impacto: ['beneficiarios', 'voluntarios', 'horas'] };

export const IMPACT_META: Record<string, { label: string; kind: 'int' | 'money' | 'text' }> = {
  beneficiarios: { label: 'Beneficiarios', kind: 'int' },
  voluntarios: { label: 'Voluntarios', kind: 'int' },
  horas: { label: 'Horas de servicio', kind: 'int' },
  fondosRecaudados: { label: 'Fondos recaudados', kind: 'money' },
  fondosInvertidos: { label: 'Fondos invertidos', kind: 'money' },
  recursos: { label: 'Recursos movilizados', kind: 'text' },
  capacitados: { label: 'Personas capacitadas', kind: 'int' },
  aliados: { label: 'Aliados', kind: 'text' },
  organizaciones: { label: 'Organizaciones participantes', kind: 'text' },
  clubes: { label: 'Clubes participantes (n.º)', kind: 'int' },
  ubicaciones: { label: 'Ubicaciones', kind: 'text' },
  actividades: { label: 'Actividades realizadas (n.º)', kind: 'int' },
  resultados: { label: 'Resultados alcanzados', kind: 'text' },
};

export const EXTRA_LABELS: Record<string, string> = {
  objetivo: 'Objetivo', beneficiarios: 'Beneficiarios', resultados: 'Resultados', aliados: 'Aliados',
  ubicacion: 'Ubicación', estadoProyecto: 'Estado del proyecto', fechaFin: 'Fecha de cierre', lugar: 'Lugar',
  asistentes: 'N.º de asistentes', agenda: 'Agenda', paisSocio: 'País socio', clubSocio: 'Club socio',
  zonaAfectada: 'Zona afectada', tipoEmergencia: 'Tipo de emergencia', ayudaEntregada: 'Ayuda entregada',
  necesidades: 'Necesidades pendientes', proposito: 'Propósito', montoMeta: 'Meta (monto)',
  tematica: 'Temática', organizacion: 'Organización aliada', programaJuvenil: 'Programa juvenil',
  protagonista: 'Protagonista', reconocido: 'Reconocido', motivo: 'Motivo', fechaCierre: 'Fecha de cierre',
  requisitos: 'Requisitos',
};

export function photoAdvice(count: number, rules: any = {}) {
  const min = rules.minToSubmit ?? 5;
  const rec = rules.recommended ?? 5;
  const reel = rules.reelMin ?? 5;
  if (!count) return { level: 'faltante', text: 'Agrega al menos 5 fotografías para poder enviar tu historia.' };
  if (count < min) return { level: 'faltante', text: `Te faltan ${min - count} fotografía(s) para cumplir el mínimo de 5.` };
  if (count < reel) return { level: 'ok', text: `Tu historia puede enviarse. Con ${reel - count} más generamos automáticamente un Reel.` };
  return { level: 'optimo', text: 'Material óptimo: habilita artículo, formatos y Reel automático.' };
}

export const STEPS = [
  { id: 'tipo', label: 'Qué quieres compartir' },
  { id: 'historia', label: 'Cuéntanos' },
  { id: 'evidencias', label: 'Evidencias y contacto' },
  { id: 'revision', label: 'Revisar y enviar' },
];

export const DEFAULT_TIPOS = [
  { slug: 'proyecto', name: 'Proyecto u obra', icon: '🏗️', color: '#1d4ed8' },
  { slug: 'actividad', name: 'Actividad o jornada', icon: '🤝', color: '#059669' },
  { slug: 'evento', name: 'Evento', icon: '📅', color: '#7c3aed' },
  { slug: 'historia-servicio', name: 'Historia de servicio', icon: '💙', color: '#0284c7' },
  { slug: 'emergencia', name: 'Emergencia o respuesta humanitaria', icon: '🚨', color: '#dc2626' },
  { slug: 'campana', name: 'Campaña', icon: '📣', color: '#ea580c' },
  { slug: 'reconocimiento', name: 'Reconocimiento o logro', icon: '🏆', color: '#ca8a04' },
  { slug: 'alianza', name: 'Alianza', icon: '🤜🤛', color: '#4d7c0f' },
  { slug: 'juventud', name: 'Actividad juvenil', icon: '🌱', color: '#16a34a' },
  { slug: 'capacitacion', name: 'Capacitación', icon: '🎓', color: '#0d9488' },
  { slug: 'recaudacion', name: 'Recaudación de fondos', icon: '💰', color: '#b45309' },
  { slug: 'testimonio', name: 'Historia personal o testimonio', icon: '💬', color: '#9333ea' },
  { slug: 'convocatoria', name: 'Convocatoria', icon: '📢', color: '#0891b2' },
  { slug: 'proyecto-internacional', name: 'Proyecto internacional', icon: '🌍', color: '#1e40af' },
  { slug: 'otra', name: 'Otra acción', icon: '✨', color: '#64748b' },
];

export const DEFAULT_AREAS = [
  { slug: 'paz', name: 'Paz y prevención de conflictos' },
  { slug: 'enfermedades', name: 'Prevención y tratamiento de enfermedades' },
  { slug: 'agua', name: 'Agua, saneamiento e higiene' },
  { slug: 'salud-materna', name: 'Salud materno-infantil' },
  { slug: 'educacion', name: 'Alfabetización y educación básica' },
  { slug: 'desarrollo-economico', name: 'Desarrollo económico e integral' },
  { slug: 'medio-ambiente', name: 'Medio ambiente' },
];

export const DEFAULT_PROGRAMAS = [
  { slug: 'rotary', name: 'Rotary' },
  { slug: 'rotaract', name: 'Rotaract' },
  { slug: 'interact', name: 'Interact' },
  { slug: 'rye', name: 'Intercambio de Jóvenes (RYE)' },
  { slug: 'ryla', name: 'RYLA' },
  { slug: 'polio', name: 'End Polio Now' },
  { slug: 'fundacion', name: 'La Fundación Rotaria' },
  { slug: 'subvenciones', name: 'Subvenciones' },
];

export const DEFAULT_TEMAS = [
  { slug: 'reforestacion', name: 'Reforestación' },
  { slug: 'jornada-salud', name: 'Jornada de salud' },
  { slug: 'banco-alimentos', name: 'Banco de alimentos' },
  { slug: 'educacion-digital', name: 'Educación digital' },
  { slug: 'agua-potable', name: 'Agua potable' },
  { slug: 'respuesta-emergencia', name: 'Respuesta a emergencias' },
];

