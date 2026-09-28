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
  const min = rules.minToSubmit ?? 1;
  const rec = rules.recommended ?? 3;
  const reel = rules.reelMin ?? 5;
  if (!count) return { level: 'faltante', text: 'Agrega al menos una fotografía para poder enviar tu historia.' };
  if (count < min) return { level: 'faltante', text: `Te faltan ${min - count} para poder enviar.` };
  if (count < rec) return { level: 'ok', text: 'Tu historia puede enviarse. Con 3 o más fotografías habilitas más formatos.' };
  if (count < reel) return { level: 'ok', text: `Tu historia puede enviarse, pero con ${reel - count} más generamos automáticamente un Reel.` };
  return { level: 'optimo', text: 'Material óptimo: habilita artículo, formatos y Reel automático.' };
}

export const STEPS = [
  { id: 'tipo', label: 'Qué quieres compartir' },
  { id: 'historia', label: 'Cuéntanos' },
  { id: 'evidencias', label: 'Evidencias y contacto' },
  { id: 'revision', label: 'Revisar y enviar' },
];
