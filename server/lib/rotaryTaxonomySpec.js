// Rotary en Acción — CRITERIO PURO (v4.1118).
// Taxonomías, campos condicionales, impacto, reglas de fotografía y completitud.
// Sin base, sin red, sin IA, sin reloj propio.
export const TAXONOMY_KINDS = ['tipo', 'area', 'programa', 'tema'];

const T = (kind, slug, name, extra = {}) => ({ kind, slug, name, ...extra });

// ─── Tipos de actividad: ¿Qué quieres compartir? ─────────────────────
export const DEFAULT_TIPOS = [
  T('tipo', 'proyecto', 'Proyecto u obra', { icon: '🏗️', color: '#1d4ed8', order: 1 }),
  T('tipo', 'actividad', 'Actividad o jornada', { icon: '🤝', color: '#059669', order: 2 }),
  T('tipo', 'evento', 'Evento', { icon: '📅', color: '#7c3aed', order: 3 }),
  T('tipo', 'historia-servicio', 'Historia de servicio', { icon: '💙', color: '#0284c7', order: 4 }),
  T('tipo', 'emergencia', 'Emergencia o respuesta humanitaria', { icon: '🚨', color: '#dc2626', order: 5 }),
  T('tipo', 'campana', 'Campaña', { icon: '📣', color: '#ea580c', order: 6 }),
  T('tipo', 'reconocimiento', 'Reconocimiento o logro', { icon: '🏆', color: '#ca8a04', order: 7 }),
  T('tipo', 'alianza', 'Alianza', { icon: '🤜🤛', color: '#4d7c0f', order: 8 }),
  T('tipo', 'juventud', 'Actividad juvenil', { icon: '🌱', color: '#16a34a', order: 9 }),
  T('tipo', 'capacitacion', 'Capacitación', { icon: '🎓', color: '#0d9488', order: 10 }),
  T('tipo', 'recaudacion', 'Recaudación de fondos', { icon: '💰', color: '#b45309', order: 11 }),
  T('tipo', 'testimonio', 'Historia personal o testimonio', { icon: '💬', color: '#9333ea', order: 12 }),
  T('tipo', 'convocatoria', 'Convocatoria', { icon: '📢', color: '#0891b2', order: 13 }),
  T('tipo', 'proyecto-internacional', 'Proyecto internacional', { icon: '🌍', color: '#1e40af', order: 14 }),
  T('tipo', 'otra', 'Otra acción', { icon: '✨', color: '#64748b', order: 15 }),
];

// ─── Áreas de interés de Rotary ───────────────────────────────────────
export const DEFAULT_AREAS = [
  T('area', 'paz', 'Paz y prevención de conflictos', { order: 1 }),
  T('area', 'enfermedades', 'Prevención y tratamiento de enfermedades', { order: 2 }),
  T('area', 'agua', 'Agua, saneamiento e higiene', { order: 3 }),
  T('area', 'salud-materna', 'Salud materno-infantil', { order: 4 }),
  T('area', 'educacion', 'Alfabetización y educación básica', { order: 5 }),
  T('area', 'desarrollo-economico', 'Desarrollo económico e integral', { order: 6 }),
  T('area', 'medio-ambiente', 'Medio ambiente', { order: 7 }),
];

// ─── Programas / comunidades ──────────────────────────────────────────
export const DEFAULT_PROGRAMAS = [
  T('programa', 'rotary', 'Rotary', { order: 1 }),
  T('programa', 'rotaract', 'Rotaract', { order: 2 }),
  T('programa', 'interact', 'Interact', { order: 3 }),
  T('programa', 'rye', 'Intercambio de Jóvenes (RYE)', { order: 4 }),
  T('programa', 'ryla', 'RYLA', { order: 5 }),
  T('programa', 'polio', 'End Polio Now', { order: 6 }),
  T('programa', 'fundacion', 'La Fundación Rotaria', { order: 7 }),
  T('programa', 'subvenciones', 'Subvenciones', { order: 8 }),
];

// ─── Temas semilla (administrables; la IA puede sugerir más) ──────────
export const DEFAULT_TEMAS = [
  T('tema', 'reforestacion', 'Reforestación', { order: 1 }),
  T('tema', 'jornada-salud', 'Jornada de salud', { order: 2 }),
  T('tema', 'banco-alimentos', 'Banco de alimentos', { order: 3 }),
  T('tema', 'educacion-digital', 'Educación digital', { order: 4 }),
  T('tema', 'agua-potable', 'Agua potable', { order: 5 }),
  T('tema', 'respuesta-emergencia', 'Respuesta a emergencias', { order: 6 }),
];

// ─── Campos condicionales por tipo ────────────────────────────────────
// Cada entrada: campos extra que SÍ tienen sentido para ese tipo. Lo que no
// está acá no se pregunta. `impacto` lista las métricas de impacto con sentido.
export const CONDITIONAL_FIELDS = {
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

export const IMPACT_FIELDS = [
  { id: 'beneficiarios', label: 'Beneficiarios', kind: 'int' },
  { id: 'voluntarios', label: 'Voluntarios', kind: 'int' },
  { id: 'horas', label: 'Horas de servicio', kind: 'int' },
  { id: 'fondosRecaudados', label: 'Fondos recaudados', kind: 'money' },
  { id: 'fondosInvertidos', label: 'Fondos invertidos', kind: 'money' },
  { id: 'recursos', label: 'Recursos movilizados (texto)', kind: 'text' },
  { id: 'capacitados', label: 'Personas capacitadas', kind: 'int' },
  { id: 'aliados', label: 'Aliados (texto)', kind: 'text' },
  { id: 'organizaciones', label: 'Organizaciones participantes (texto)', kind: 'text' },
  { id: 'clubes', label: 'Clubes participantes (n.º además del principal)', kind: 'int' },
  { id: 'ubicaciones', label: 'Ubicaciones (texto)', kind: 'text' },
  { id: 'actividades', label: 'Actividades realizadas (n.º)', kind: 'int' },
  { id: 'resultados', label: 'Resultados alcanzados (texto)', kind: 'text' },
];

export const fieldsForTipo = (slug) =>
  CONDITIONAL_FIELDS[slug] || { extra: [], impacto: ['beneficiarios', 'voluntarios', 'horas'] };

// ─── Reglas de fotografía: enviar ≠ producir formatos ─────────────────
export const DEFAULT_PHOTO_RULES = { minToSubmit: 1, recommended: 3, reelMin: 5, maxFiles: 10 };

// ─── Completitud: pesos administrativos (no visibles al usuario) ──────
export const COMPLETENESS_WEIGHTS = { info: 25, fotos: 25, impacto: 20, ubicacion: 15, historia: 15 };

export function completenessScore({ hasInfo, photoCount, photoRules, hasImpact, hasLocation, hasStory }) {
  const w = COMPLETENESS_WEIGHTS;
  const fotoPts = !photoCount ? 0 : photoCount >= (photoRules?.reelMin ?? 5) ? w.fotos
    : photoCount >= (photoRules?.recommended ?? 3) ? Math.round(w.fotos * 0.7) : Math.round(w.fotos * 0.4);
  const parts = {
    info: hasInfo ? w.info : 0,
    fotos: fotoPts,
    impacto: hasImpact ? w.impacto : 0,
    ubicacion: hasLocation ? w.ubicacion : 0,
    historia: hasStory ? w.historia : 0,
  };
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  return { score, parts, editorialReady: score >= 70 && !!hasStory && (photoCount || 0) >= (photoRules?.minToSubmit ?? 1) };
}

// Consejo de material: informa, no bloquea.
export function photoAdvice(count, rules = DEFAULT_PHOTO_RULES) {
  const min = rules.minToSubmit ?? 1;
  const rec = rules.recommended ?? 3;
  const reel = rules.reelMin ?? 5;
  if (!count) return { level: 'faltante', text: 'Agrega al menos una fotografía para poder enviar tu historia.' };
  if (count < min) return { level: 'faltante', text: `Te falta ${min - count} fotografía(s) para poder enviar.` };
  if (count < rec) return { level: 'ok', text: 'Tu historia puede enviarse. Con 3 o más fotografías habilitas más formatos.' };
  if (count < reel) return { level: 'ok', text: `Tu historia puede enviarse, pero con ${reel - count} fotografía(s) más podremos generar automáticamente un Reel.` };
  return { level: 'optimo', text: 'Material óptimo: tu historia habilita artículo, formatos y Reel automático.' };
}

// Preguntas guía cuando la historia es corta. No inventan nada: piden.
export function assistantQuestions(ctx = {}) {
  const q = [];
  if (!ctx.logro) q.push('¿Qué logró la actividad?');
  if (!ctx.participantes) q.push('¿Cuántas personas participaron?');
  if (!ctx.beneficiarios) q.push('¿Quiénes fueron beneficiados?');
  if (!ctx.lugar) q.push('¿Dónde ocurrió?');
  if (!ctx.papelClub) q.push('¿Qué papel tuvo el club?');
  if (!ctx.resultado) q.push('¿Qué resultado consideras más importante?');
  return q;
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);
// ─── Sugerencia de contexto por campaña (v4.1119) ──────────────────────
// Una campaña PRESELECCIONA tipo/programa/área por palabras clave, sin
// hardcodear ninguna campaña: el usuario siempre puede cambiarlo. Devuelve
// slugs candidatos; el controlador solo conserva los que existen y activos.
export function suggestForCampaign(name = '', slug = '') {
  const hay = `${name} ${slug}`.toLowerCase();
  const out = {};
  if (/emergencia|terremoto|desastre|damnificad|ayuda humanitaria|inundaci|deslizamiento/i.test(hay)) out.tipo = 'emergencia';
  else if (/polio/i.test(hay)) { out.programa = 'polio'; out.area = 'enfermedades'; }
  else if (/evento|conferencia|encuentro|feria|foro|congreso/i.test(hay)) out.tipo = 'evento';
  else if (/rotaract/i.test(hay)) { out.tipo = 'juventud'; out.programa = 'rotaract'; }
  else if (/interact/i.test(hay)) { out.tipo = 'juventud'; out.programa = 'interact'; }
  else if (/rye|intercambio/i.test(hay)) { out.tipo = 'juventud'; out.programa = 'rye'; }
  else if (/ryla/i.test(hay)) { out.tipo = 'juventud'; out.programa = 'ryla'; }
  else if (/juven|juventud|jóvenes|jovenes/i.test(hay)) out.tipo = 'juventud';
  else if (/capacitaci|taller|curso|seminario|formaci/i.test(hay)) out.tipo = 'capacitacion';
  else if (/recaudaci|fondos|donaci|bingo|rifa|banquete|subasta/i.test(hay)) out.tipo = 'recaudacion';
  if (!out.area) {
    if (/medio ambiente|reforest|ambiente|arbol|árbol|limpieza/i.test(hay)) out.area = 'medio-ambiente';
    else if (/agua/i.test(hay)) out.area = 'agua';
    else if (/educaci|escuela|colegio|beca|lectura/i.test(hay)) out.area = 'educacion';
    else if (/salud|hospital|jornada m/i.test(hay)) out.area = 'enfermedades';
    else if (/paz|convivencia/i.test(hay)) out.area = 'paz';
  }
  return out;
}
export function shapeImpact(raw = {}) {
  const out = {};
  for (const f of IMPACT_FIELDS) {
    if (f.kind === 'int') {
      const n = Number(raw[f.id]);
      if (Number.isFinite(n) && n > 0) out[f.id] = Math.round(n);
    } else if (f.kind === 'money') {
      const n = Number(raw[f.id]);
      if (Number.isFinite(n) && n > 0) out[f.id] = Math.round(n * 100) / 100;
    } else {
      const t = str(raw[f.id], 500);
      if (t) out[f.id] = t;
    }
  }
  return out;
}

export const UNIVERSAL_CAMPAIGN_SLUG = 'rotary-en-accion';
