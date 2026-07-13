// Categorías de socio para los directorios públicos y el admin.
//
// Un socio puede pertenecer a VARIAS categorías a la vez (selección múltiple):
// puede ser "Socio activo" (aparece en "Nuestros Socios") y además Honorario,
// Gobernador y/o Autor (aparece también en esas secciones), o ser solo de una
// categoría especial sin ser socio activo. La Junta Directiva es otra marca
// independiente. Cada categoría se guarda como un booleano propio.

export type SpecialCategoryKey = 'honorary' | 'governor' | 'author';

export interface SpecialCategoryDef {
  key: SpecialCategoryKey;
  flag: 'isHonorary' | 'isGovernor' | 'isAuthor'; // campo booleano en el socio
  label: string;        // Título del directorio + enlace del menú
  addLabel: string;     // Texto del botón "Agregar…" en el admin
  chipLabel: string;    // Texto del interruptor en la tarjeta / filtro
  href: string;         // Ruta del directorio público
  cmsPage: string;      // page de ContentSection para textos editables
  visibleField: 'honoraryMembersVisible' | 'governorsVisible' | 'authorsVisible';
  description: string;  // Descripción por defecto del hero
  emptyText: string;    // Mensaje cuando no hay miembros
}

export const SPECIAL_CATEGORIES: SpecialCategoryDef[] = [
  {
    key: 'honorary',
    flag: 'isHonorary',
    label: 'Socios Honorarios',
    addLabel: 'Socio Honorario',
    chipLabel: 'Honorario',
    href: '/socios-honorarios',
    cmsPage: 'socios-honorarios',
    visibleField: 'honoraryMembersVisible',
    description: 'Reconocemos a quienes, con su trayectoria y entrega, han dejado una huella imborrable en nuestro club y en la comunidad.',
    emptyText: 'Aún no hay socios honorarios para mostrar.',
  },
  {
    key: 'governor',
    flag: 'isGovernor',
    label: 'Nuestros Gobernadores',
    addLabel: 'Gobernador',
    chipLabel: 'Gobernador',
    href: '/nuestros-gobernadores',
    cmsPage: 'nuestros-gobernadores',
    visibleField: 'governorsVisible',
    description: 'Honramos a quienes han servido como gobernadores de distrito, guiando a Rotary con liderazgo, compromiso y visión.',
    emptyText: 'Aún no hay gobernadores para mostrar.',
  },
  {
    key: 'author',
    flag: 'isAuthor',
    label: 'Nuestros Autores',
    addLabel: 'Autor',
    chipLabel: 'Autor',
    href: '/nuestros-autores',
    cmsPage: 'nuestros-autores',
    visibleField: 'authorsVisible',
    description: 'Celebramos a los socios que han compartido su conocimiento y experiencia a través de libros y publicaciones.',
    emptyText: 'Aún no hay autores para mostrar.',
  },
];

// ¿El socio pertenece a esta categoría especial? Con retrocompatibilidad: filas
// creadas con el modelo de categoría única solo tienen category / isHonorary.
export function memberHasCategory(m: any, key: SpecialCategoryKey): boolean {
  const def = SPECIAL_CATEGORIES.find(c => c.key === key)!;
  if (m && m[def.flag]) return true;
  if (key === 'honorary' && m?.isHonorary) return true;
  if (m?.category === key) return true;
  return false;
}

// ¿Aparece en "Nuestros Socios" (socio activo)?  Por defecto sí, salvo que sea
// una fila antigua marcada solo como categoría especial (category !== 'active').
export function memberIsActive(m: any): boolean {
  if (m && (m.isActive === true || m.isActive === false)) return m.isActive;
  const cat = m?.category;
  if (cat && cat !== 'active') return false;
  if (m?.isHonorary) return false;
  return true;
}
