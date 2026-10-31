/**
 * Catálogo Maestro de Clubes — el lado del navegador (v4.1269.0).
 *
 * La fuente es `/api/club-catalog/…` (ver `server/lib/clubCatalog.js` y
 * `docs/claude/catalogo-maestro-de-clubes.md`). Aquí sólo hay tipos, etiquetas
 * y una caché corta por distrito para que varios selectores en la misma
 * pantalla no pidan lo mismo dos veces.
 */
import { leerJson } from './leerJson';

const API = import.meta.env.VITE_API_URL || '/api';

export interface CatalogClub {
  id: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  country: string;
  districtNumber: number | null;
  organizationType: string;
  clubType: string;
}

export const CATALOG_STATE_LABELS: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  pendiente_verificacion: 'Pendiente de verificación',
};

export const CLUB_TYPE_LABELS: Record<string, string> = {
  tradicional: 'Tradicional',
  e_club: 'E-Club (virtual)',
  satelite: 'Club satélite',
  pasaporte: 'Club pasaporte',
  causa: 'Club de causa',
  corporativo: 'Club corporativo',
  otro: 'Otro',
};

export const NOT_FOUND_MESSAGE = '¿No encuentras tu club? Contacta al equipo administrador para solicitar su actualización en el Directorio Distrital.';

/** Sin tildes ni mayúsculas, como el servidor. */
export const normText = (s: string) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/** Filtra en el navegador: nombre, nombre corto, ciudad o departamento; primero lo que EMPIEZA con el término. */
export function filterClubs(clubs: CatalogClub[], term: string): CatalogClub[] {
  const q = normText(term);
  if (!q) return clubs;
  const rankOf = (c: CatalogClub) => {
    const nombres = [normText(c.name), normText(c.shortName)];
    const lugar = [normText(c.city), normText(c.state)];
    if (nombres.some(n => n.startsWith(q) || n.replace(/^club rotario |^rotary /, '').startsWith(q))) return 0;
    if (lugar.some(l => l.startsWith(q))) return 1;
    if (nombres.some(n => n.includes(q))) return 2;
    if (lugar.some(l => l.includes(q))) return 3;
    return 9;
  };
  return clubs
    .map(c => ({ c, r: rankOf(c) }))
    .filter(x => x.r < 9)
    .sort((a, b) => (a.r - b.r) || a.c.name.localeCompare(b.c.name, 'es'))
    .map(x => x.c);
}

const TTL = 60_000;
const cache = new Map<string, { at: number; p: Promise<CatalogClub[]> }>();

/** Los clubes ACTIVOS de esos distritos. Sin distrito, todos. */
export function fetchCatalogClubs(districts: number[] = [], { fresh = false } = {}): Promise<CatalogClub[]> {
  const key = [...districts].sort().join(',');
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.p;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  const p = fetch(`${API}/club-catalog/public/clubs${key ? `?district=${key}` : ''}`, { signal: ctrl.signal })
    .then(async r => ({ ok: r.ok, ...(await leerJson<{ clubs?: CatalogClub[]; error?: string }>(r)) }))
    .then(({ ok, data }) => {
      if (!ok || !Array.isArray(data?.clubs)) throw new Error(data?.error || 'No se pudo cargar el catálogo de clubes.');
      return data.clubs;
    })
    .finally(() => clearTimeout(timer));
  p.catch(() => cache.delete(key));
  cache.set(key, { at: Date.now(), p });
  return p;
}

/** Tras guardar en el catálogo: que los selectores de esta pestaña vuelvan a pedir. */
export const invalidateCatalogCache = () => cache.clear();

export async function fetchCatalogDistricts(): Promise<{ number: number; label: string; active: number }[]> {
  const r = await fetch(`${API}/club-catalog/public/districts`);
  const { data } = await leerJson<{ districts?: { number: number; label: string; active: number }[] }>(r);
  return r.ok && Array.isArray(data?.districts) ? data.districts : [];
}
