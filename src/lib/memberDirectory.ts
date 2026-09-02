/**
 * El directorio de socios del panel — el CRITERIO (v4.985)
 * ========================================================
 *
 * Qué socio coincide con lo que se escribió en el buscador y qué se le dice a
 * quien mira la lista. **Puro**: sin React, sin red, sin DOM — por eso se
 * puede probar (`npm run test:members`).
 *
 * Nace de un reporte con la pantalla delante: «sólo veo a los que tienen un
 * cargo; se supone que deberían aparecer los 45». La pantalla PINTABA los 45
 * —está medido en un navegador— pero no había forma de saberlo: el buscador
 * no encontraba «Perez» escribiendo sin tilde a un «Pérez», nada decía cuántos
 * socios se estaban mostrando, y las tarjetas con categoría —agregadas
 * después, «al inicio de la lista»— ocupaban las primeras pantallas de un
 * directorio de once mil píxeles con la barra de desplazamiento oculta. Un
 * socio que no se encuentra y una lista que no dice cuántos tiene se leen
 * como «no están».
 */

export type DirectoryFilter = 'all' | 'active' | 'board' | 'honorary' | 'governor' | 'author';

export interface DirectoryMember {
  name?: string | null;
  description?: string | null;
  boardRole?: string | null;
  isActive?: boolean;
  isBoard?: boolean;
  isHonorary?: boolean;
  isGovernor?: boolean;
  isAuthor?: boolean;
}

/**
 * Texto comparable: sin tildes, sin mayúsculas, sin espacios de más.
 * «Pérez», «PEREZ» y « perez » son la misma búsqueda. Un directorio de socios
 * colombianos está lleno de tildes y nadie las escribe igual dos veces.
 */
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Los campos donde se busca. El cargo de junta cuenta: «tesorero» tiene que encontrar al tesorero. */
export function memberSearchText(m: DirectoryMember): string {
  return normalizeText([m?.name, m?.description, m?.boardRole].filter(Boolean).join(' '));
}

/**
 * ¿Coincide con lo escrito? Cada palabra de la consulta tiene que estar en el
 * socio, en cualquier orden: «perez jose» encuentra a «José Pérez».
 */
export function memberMatchesQuery(m: DirectoryMember, query: unknown): boolean {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const hay = memberSearchText(m);
  return words.every(w => hay.includes(w));
}

/** ¿Pertenece a la pestaña elegida? `all` es TODOS: nadie queda fuera. */
export function memberMatchesFilter(m: DirectoryMember, filter: DirectoryFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'active': return !!m?.isActive;
    case 'board': return !!m?.isBoard;
    case 'honorary': return !!m?.isHonorary;
    case 'governor': return !!m?.isGovernor;
    case 'author': return !!m?.isAuthor;
    default: return true;
  }
}

export interface DirectoryView<T extends DirectoryMember> {
  visible: T[];
  total: number;
  hidden: number;
}

/** Lo que se pinta y cuántos quedaron fuera — el número que la pantalla tiene que DECIR. */
export function filterDirectory<T extends DirectoryMember>(
  members: T[],
  opts: { filter?: DirectoryFilter; query?: unknown },
): DirectoryView<T> {
  const filter = opts.filter || 'all';
  const visible = (members || []).filter(m => memberMatchesFilter(m, filter) && memberMatchesQuery(m, opts.query));
  return { visible, total: (members || []).length, hidden: (members || []).length - visible.length };
}

export const FILTER_LABELS: Record<DirectoryFilter, string> = {
  all: 'todos',
  active: 'socios activos',
  board: 'junta directiva',
  honorary: 'honorarios',
  governor: 'gobernadores',
  author: 'autores',
};

/**
 * La frase de arriba de la lista. Siempre dice el total: «Mostrando 45 de 45»
 * es lo que contesta «¿están los 45?» sin tener que recorrerlos.
 */
export function describeDirectoryView(view: { visible: number; total: number }, filter: DirectoryFilter, query: unknown): string {
  const q = normalizeText(query);
  const total = view.total;
  const socios = total === 1 ? 'socio' : 'socios';
  if (total === 0) return 'El directorio todavía no tiene socios.';
  if (filter === 'all' && !q) return `Mostrando los ${total} ${socios} del directorio.`;
  const partes: string[] = [];
  if (filter !== 'all') partes.push(FILTER_LABELS[filter]);
  if (q) partes.push(`«${String(query).trim()}»`);
  return `Mostrando ${view.visible} de ${total} ${socios} · filtro: ${partes.join(' + ')}.`;
}

/** Cuántos hay en cada pestaña — para que la pestaña lo diga antes de pulsarla. */
export function countByFilter<T extends DirectoryMember>(members: T[]): Record<DirectoryFilter, number> {
  const out = { all: 0, active: 0, board: 0, honorary: 0, governor: 0, author: 0 } as Record<DirectoryFilter, number>;
  for (const m of members || []) {
    (Object.keys(out) as DirectoryFilter[]).forEach(f => { if (memberMatchesFilter(m, f)) out[f]++; });
  }
  return out;
}
