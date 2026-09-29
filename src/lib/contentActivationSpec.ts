// Espejo navegador del criterio de activación (sin lógica de servidor).
export const ACTIVATION_STATUS = ['borrador','programada','activa','pausada','finalizada','archivada'] as const;
export const STATUS_LABEL: Record<string,string> = {
  borrador: 'Borrador', programada: 'Programada', activa: 'Activa',
  pausada: 'Pausada', finalizada: 'Finalizada', archivada: 'Archivada',
};
export const FREQUENCIES = [
  { id: 'unica', label: 'Única' }, { id: 'semanal', label: 'Semanal' },
  { id: 'quincenal', label: 'Quincenal' }, { id: 'mensual', label: 'Mensual' },
  { id: 'trimestral', label: 'Trimestral' }, { id: 'personalizada', label: 'Personalizada' },
];
export const LEVEL_LABEL: Record<string,string> = {
  alta: 'Participación alta', recurrente: 'Participación recurrente',
  ocasional: 'Participación ocasional', en_riesgo: 'En riesgo de inactividad',
  sin_reciente: 'Sin participación reciente',
};
export const ENROLL_COLUMNS = [
  { id: 'programada', label: 'Programadas' }, { id: 'por_enviar', label: 'Por enviar' },
  { id: 'contactada', label: 'Contactadas' }, { id: 'esperando_contenido', label: 'Esperando contenido' },
  { id: 'contenido_recibido', label: 'Contenido recibido' }, { id: 'generacion_ia', label: 'Generación IA' },
  { id: 'por_aprobar', label: 'Por aprobar' }, { id: 'publicada', label: 'Publicadas' },
];
export const SCOPE_TYPES = [
  { id: 'global', label: 'Global / Club Platform' },
  { id: 'district', label: 'Distrito' },
  { id: 'club', label: 'Club' },
  { id: 'site', label: 'Sitio' },
  { id: 'event', label: 'Evento' },
  { id: 'project_fair', label: 'Feria de Proyectos' },
  { id: 'campaign_form', label: 'Campaña / Formulario' },
];
export const WIZARD_STEPS = [
  'Configuración', 'Ámbito y audiencia', 'Destinatarios',
  'Contenido y automatización', 'Revisión y activación',
];
