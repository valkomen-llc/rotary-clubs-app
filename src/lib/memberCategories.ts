// Categorías de socio para los directorios públicos y el admin.
// Un socio pertenece a UNA categoría: 'active' (aparece en "Nuestros Socios",
// puede ser Junta Directiva) o una categoría especial (Honorarios / Gobernadores
// / Autores) que tiene su propio directorio y NO aparece en el listado normal
// ni en la junta.

export type MemberCategory = 'active' | 'honorary' | 'governor' | 'author';

export type SpecialCategoryKey = Exclude<MemberCategory, 'active'>;

export interface SpecialCategoryDef {
  key: SpecialCategoryKey;
  label: string;        // Título del directorio + enlace del menú
  addLabel: string;     // Texto del botón "Agregar…" en el admin
  href: string;         // Ruta del directorio público
  cmsPage: string;      // page de ContentSection para textos editables
  visibleField: 'honoraryMembersVisible' | 'governorsVisible' | 'authorsVisible';
  description: string;  // Descripción por defecto del hero
  emptyText: string;    // Mensaje cuando no hay miembros
}

export const SPECIAL_CATEGORIES: SpecialCategoryDef[] = [
  {
    key: 'honorary',
    label: 'Socios Honorarios',
    addLabel: 'Socio Honorario',
    href: '/socios-honorarios',
    cmsPage: 'socios-honorarios',
    visibleField: 'honoraryMembersVisible',
    description: 'Reconocemos a quienes, con su trayectoria y entrega, han dejado una huella imborrable en nuestro club y en la comunidad.',
    emptyText: 'Aún no hay socios honorarios para mostrar.',
  },
  {
    key: 'governor',
    label: 'Nuestros Gobernadores',
    addLabel: 'Gobernador',
    href: '/nuestros-gobernadores',
    cmsPage: 'nuestros-gobernadores',
    visibleField: 'governorsVisible',
    description: 'Honramos a quienes han servido como gobernadores de distrito, guiando a Rotary con liderazgo, compromiso y visión.',
    emptyText: 'Aún no hay gobernadores para mostrar.',
  },
  {
    key: 'author',
    label: 'Nuestros Autores',
    addLabel: 'Autor',
    href: '/nuestros-autores',
    cmsPage: 'nuestros-autores',
    visibleField: 'authorsVisible',
    description: 'Celebramos a los socios que han compartido su conocimiento y experiencia a través de libros y publicaciones.',
    emptyText: 'Aún no hay autores para mostrar.',
  },
];

export const CATEGORY_LABELS: Record<MemberCategory, string> = {
  active: 'Socio activo',
  honorary: 'Honorario',
  governor: 'Gobernador',
  author: 'Autor',
};

// Categoría efectiva de un socio, con retrocompatibilidad: filas creadas antes
// del sistema de categorías solo tienen el booleano isHonorary.
export function memberCategory(m: any): MemberCategory {
  const c = m?.category;
  if (c === 'honorary' || c === 'governor' || c === 'author') return c;
  if (m?.isHonorary) return 'honorary';
  return 'active';
}
