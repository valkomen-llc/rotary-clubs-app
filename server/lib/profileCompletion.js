// ════════════════════════════════════════════════════════════════════════════
// Completitud institucional del Directorio de Clubes — fuente única de verdad
//
// El porcentaje NO se recalcula en el CRM: se lee de
// `DistrictClubProfile.completionPercentage`, que a su vez sale de esta misma
// función. El CRM sólo describe qué categorías faltan con las mismas reglas,
// para no mostrar un 20% y una lista de pendientes que no cuadre con él.
//
// Se extrajo de `ensureDistrictClubDirectorySchema.js` sin cambiar ni un punto:
// los pesos son los que ya usa el formulario de registro de clubes.
// ════════════════════════════════════════════════════════════════════════════

const hasText = (v, min = 1) => typeof v === 'string' && v.trim().length >= min;
const hasItems = (v) => Array.isArray(v) && v.length > 0;
const hasKeys = (v) => v && typeof v === 'object' && Object.keys(v).length > 0;

export const PROFILE_COMPLETION_CATEGORIES = [
  {
    key: 'identity',
    label: 'Identidad básica',
    max: 25,
    items: [
      { key: 'officialName', label: 'Nombre oficial del club', points: 5, done: (d) => hasText(d.officialName) || hasText(d.clubName) },
      { key: 'description', label: 'Descripción institucional', points: 5, done: (d) => hasText(d.description, 20) },
      { key: 'history', label: 'Historia del club', points: 5, done: (d) => hasText(d.history, 20) },
      { key: 'logoUrl', label: 'Logotipo oficial', points: 5, done: (d) => !!d.logoUrl },
      { key: 'coverImageUrl', label: 'Imagen de portada', points: 5, done: (d) => !!d.coverImageUrl },
    ],
  },
  {
    key: 'location',
    label: 'Ubicación y sede',
    max: 20,
    items: [
      { key: 'city', label: 'Ciudad del club', points: 5, done: (d) => !!d.city },
      { key: 'foundationYear', label: 'Año de fundación', points: 5, done: (d) => !!(d.foundationYear || d.foundationDate) },
      { key: 'meetingAddress', label: 'Dirección de reunión', points: 5, done: (d) => !!d.meetingAddress },
      { key: 'meetingSchedule', label: 'Horario de reunión', points: 5, done: (d) => !!d.meetingSchedule },
    ],
  },
  {
    key: 'leadership',
    label: 'Liderazgo y membresía',
    max: 20,
    items: [
      { key: 'currentPresident', label: 'Presidente del período', points: 10, done: (d) => !!d.currentPresident },
      { key: 'rotaryPeriod', label: 'Período rotario', points: 5, done: (d) => !!d.rotaryPeriod },
      { key: 'boardMembers', label: 'Junta directiva', points: 5, done: (d) => hasItems(d.boardMembers) },
    ],
  },
  {
    key: 'projects',
    label: 'Proyectos e impacto',
    max: 15,
    items: [
      { key: 'featuredProjects', label: 'Proyectos destacados', points: 10, done: (d) => hasItems(d.featuredProjects) },
      { key: 'serviceAreas', label: 'Áreas de servicio', points: 5, done: (d) => hasItems(d.serviceAreas) },
    ],
  },
  {
    key: 'gallery',
    label: 'Galería multimedia',
    max: 10,
    items: [
      { key: 'gallery', label: 'Galería de imágenes', points: 10, done: (d) => hasItems(d.gallery) },
    ],
  },
  {
    key: 'contact',
    label: 'Contacto y canales',
    max: 10,
    items: [
      { key: 'contactChannel', label: 'Correo o teléfono de contacto', points: 5, done: (d) => !!(d.contactEmail || d.contactPhone) },
      { key: 'webChannel', label: 'Sitio web o redes sociales', points: 5, done: (d) => !!(d.websiteUrl || hasKeys(d.socialMedia)) },
    ],
  },
];

/** Mismo cálculo que usaba el Directorio. Devuelve 0–100. */
export function calculateProfileCompletion(data = {}) {
  let score = 0;
  for (const category of PROFILE_COMPLETION_CATEGORIES) {
    for (const item of category.items) {
      try {
        if (item.done(data)) score += item.points;
      } catch {
        // Un campo con forma inesperada no debe tumbar el guardado del club.
      }
    }
  }
  return Math.min(100, Math.max(0, score));
}

/**
 * Describe el porcentaje REAL guardado y qué falta, con los mismos ítems.
 * `percentage` se toma del perfil si existe (fuente de verdad persistida);
 * `calculated` queda como contraste para detectar datos viejos.
 */
export function describeProfileCompletion(data = {}, storedPercentage = null) {
  let calculated = 0;
  const categories = PROFILE_COMPLETION_CATEGORIES.map((category) => {
    let points = 0;
    const pending = [];
    const completed = [];
    for (const item of category.items) {
      let done = false;
      try { done = !!item.done(data); } catch { done = false; }
      if (done) {
        points += item.points;
        completed.push({ key: item.key, label: item.label, points: item.points });
      } else {
        pending.push({ key: item.key, label: item.label, points: item.points });
      }
    }
    calculated += points;
    return {
      key: category.key,
      label: category.label,
      max: category.max,
      points,
      percentage: Math.round((points / category.max) * 100),
      completed,
      pending,
    };
  });

  const stored = Number.isFinite(Number(storedPercentage)) ? Number(storedPercentage) : null;
  const percentage = stored == null ? calculated : Math.min(100, Math.max(0, stored));

  return {
    percentage,
    calculated,
    // Si el número guardado no coincide con los campos actuales, se informa
    // sin corregirlo solo: el CRM no reescribe indicadores del Directorio.
    drift: stored == null ? null : calculated - stored,
    categories,
    pending: categories.flatMap((c) => c.pending.map((p) => ({ ...p, category: c.label, categoryKey: c.key }))),
    completed: categories.flatMap((c) => c.completed.map((p) => ({ ...p, category: c.label, categoryKey: c.key }))),
  };
}

export default { PROFILE_COMPLETION_CATEGORIES, calculateProfileCompletion, describeProfileCompletion };
