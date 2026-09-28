// Espejo navegador del criterio Rotary en Acción (pintar/acotar, no decide).
export const CONDITIONAL_FIELDS: Record<string, { extra: string[]; impacto: string[] }> = {
  evento: { extra: ['fechaFin', 'lugar', 'asistentes', 'agenda'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'clubes', 'aliados'] },
  proyecto: { extra: ['objetivo', 'beneficiarios', 'resultados', 'aliados', 'ubicacion', 'estadoProyecto'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'fondosInvertidos', 'recursos', 'aliados', 'clubes', 'ubicaciones', 'actividades'] },
  'proyecto-internacional': { extra: ['objetivo', 'paisSocio', 'clubSocio', 'beneficiarios', 'resultados', 'aliados'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'fondosInvertidos', 'aliados', 'clubes'] },
  emergencia: { extra: ['zonaAfectada', 'tipoEmergencia', 'ayudaEntregada', 'beneficiarios', 'necesidades'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'recursos', 'fondosInvertidos', 'aliados', 'ubicaciones'] },
  recaudacion: { extra: ['proposito', 'beneficiarios', 'montoMeta'], impacto: ['fondosRecaudados', 'fondosInvertidos', 'beneficiarios', 'aliados', 'clubes'] },
  capacitacion: { extra: ['tematica', 'asistentes', 'resultados'], impacto: ['capacitados', 'horas', 'voluntarios', 'clubes'] },
  campana: { extra: ['objetivo', 'resultados', 'aliados'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'fondosRecaudados', 'clubes', 'actividades'] },
  alianza: { extra: ['organizacion', 'objetivo', 'resultados'], impacto: ['aliados', 'organizaciones', 'beneficiarios', 'clubes'] },
  juventud: { extra: ['programaJuvenil', 'asistentes', 'resultados'], impacto: ['capacitados', 'voluntarios', 'horas', 'clubes'] },
  actividad: { extra: ['objetivo', 'resultados'], impacto: ['beneficiarios', 'voluntarios', 'horas', 'clubes'] },
  'historia-servicio': { extra: ['protagonista', 'resultados'], impacto: ['beneficiarios', 'voluntarios', 'horas'] },
  reconocimiento: { extra: ['reconocido', 'motivo'], impacto: [] },
  testimonio: { extra: ['protagonista'], impacto: [] },
  convocatoria: { extra: ['fechaCierre', 'lugar', 'requisitos'], impacto: [] },
  otra: { extra: [], impacto: ['beneficiarios', 'voluntarios', 'horas'] },
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
  { id: 'tipo', label: '¿Qué quieres compartir?' },
  { id: 'relacion', label: '¿Con qué está relacionado?' },
  { id: 'historia', label: 'Cuéntanos qué ocurrió' },
  { id: 'impacto', label: 'Resultados e impacto' },
  { id: 'fotos', label: 'Fotografías y videos' },
  { id: 'datos', label: 'Datos de la actividad' },
  { id: 'remitente', label: 'Club y persona que envía' },
  { id: 'revision', label: 'Revisión' },
  { id: 'envio', label: 'Envío y confirmación' },
];
