// ════════════════════════════════════════════════════════════════════
// Selector de Club Rotario — v4.1269.0
//
// El componente ÚNICO para elegir un club del Catálogo Maestro. Guarda el
// ID del club (no el nombre): si el club cambia de nombre, lo elegido sigue
// apuntando al mismo registro. Busca por nombre, ciudad o departamento
// mientras se escribe, sin exigir el nombre exacto; se maneja con teclado
// (flechas, Enter, Escape) y funciona igual en el móvil (lista en línea, sin
// menú flotante que el teclado del teléfono tape).
//
// Nunca crea clubes: si el club no aparece, lo dice y manda al equipo
// administrador. Ver `docs/claude/catalogo-maestro-de-clubes.md`.
// ════════════════════════════════════════════════════════════════════
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, CheckCircle2, MapPin, X, Loader2, Info } from 'lucide-react';
import { fetchCatalogClubs, filterClubs, NOT_FOUND_MESSAGE } from '../../lib/clubCatalog';
import type { CatalogClub } from '../../lib/clubCatalog';

export interface ClubSelectorProps {
  /** El id del club elegido (del Catálogo Maestro). */
  value: string | null | undefined;
  onChange: (club: CatalogClub | null) => void;
  /** Distritos que se ofrecen al abrir. Por defecto, el 4281. */
  districts?: number[];
  /** Si trae más de uno, se muestra el filtro de distrito para ampliar o acotar. */
  allowedDistricts?: number[];
  /** Lista ya cargada (el formulario la trae de su propia configuración). */
  options?: CatalogClub[];
  label?: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  notFoundMessage?: string;
  /** Alto máximo de la lista (clase de Tailwind). */
  listClassName?: string;
}

export const ClubSelector: React.FC<ClubSelectorProps> = ({
  value, onChange, districts = [4281], allowedDistricts, options, label = 'Club rotario', error, disabled,
  placeholder = 'Nombre, ciudad o departamento', notFoundMessage = NOT_FOUND_MESSAGE,
  listClassName = 'max-h-72',
}) => {
  const uid = useId();
  const inputId = `${uid}-buscar`;
  const listId = `${uid}-lista`;
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const [cambiando, setCambiando] = useState(false);
  const [distritosSel, setDistritosSel] = useState<number[]>(districts);
  const [remoto, setRemoto] = useState<CatalogClub[] | null>(null);
  const [cargando, setCargando] = useState(!options);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const distKey = distritosSel.join(',');

  useEffect(() => {
    if (options) { setCargando(false); return; }
    let vivo = true;
    setCargando(true); setErrorCarga(null);
    fetchCatalogClubs(distritosSel, { fresh: intento > 0 })
      .then(cs => { if (vivo) setRemoto(cs); })
      .catch(e => { if (vivo) setErrorCarga(e?.message || 'No se pudo cargar el catálogo de clubes.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, distKey, intento]);

  const universo = useMemo(() => {
    const base = options || remoto || [];
    return options && distritosSel.length ? base.filter(c => !c.districtNumber || distritosSel.includes(c.districtNumber)) : base;
  }, [options, remoto, distKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const resultados = useMemo(() => filterClubs(universo, term), [universo, term]);
  const elegido = useMemo(() => (options || remoto || []).find(c => c.id === value) || null, [options, remoto, value]);
  const mostrarLista = !elegido || cambiando;

  useEffect(() => { setActive(0); }, [term, distKey]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const elegir = (c: CatalogClub) => {
    onChange(c);
    setCambiando(false);
    setTerm('');
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(resultados.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { if (resultados[active]) { e.preventDefault(); elegir(resultados[active]); } }
    else if (e.key === 'Escape') { if (term) { e.preventDefault(); setTerm(''); } else if (elegido) { setCambiando(false); } }
  };

  const toggleDistrito = (n: number) => {
    setDistritosSel(prev => {
      const next = prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n].sort();
      return next.length ? next : prev;
    });
  };

  return (
    <div className="w-full" data-club-selector>
      {label && <label htmlFor={inputId} className="block text-sm font-bold text-gray-800 mb-2">{label}</label>}

      {elegido && !cambiando && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border-2 border-rotary-blue/30 bg-blue-50/60 px-4 py-3">
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-sm sm:text-base break-words">{elegido.name}</p>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3 shrink-0" />
              {[elegido.city, elegido.state].filter(Boolean).join(', ') || 'Ubicación no registrada'}
              {elegido.districtNumber ? ` · Distrito ${elegido.districtNumber}` : ''}
            </p>
          </div>
          {!disabled && (
            <button type="button" onClick={() => setCambiando(true)}
              className="shrink-0 text-xs font-bold text-rotary-blue underline underline-offset-2 px-2 py-2 min-h-[40px]">
              Cambiar
            </button>
          )}
        </div>
      )}

      {mostrarLista && (
        <>
          {allowedDistricts && allowedDistricts.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Filtrar por distrito">
              {allowedDistricts.map(n => (
                <button key={n} type="button" onClick={() => toggleDistrito(n)} aria-pressed={distritosSel.includes(n)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors min-h-[32px] ${distritosSel.includes(n) ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-600 border-gray-200 hover:border-rotary-blue'}`}>
                  Distrito {n}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id={inputId}
              type="search"
              role="combobox"
              aria-expanded={true}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={resultados[active] ? `${listId}-${resultados[active].id}` : undefined}
              aria-invalid={!!error}
              autoComplete="off"
              enterKeyHint="search"
              disabled={disabled}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={onKey}
              placeholder={placeholder}
              className={`w-full pl-11 pr-10 py-3.5 rounded-2xl border bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue ${error ? 'border-red-300' : 'border-gray-200'}`}
            />
            {term && (
              <button type="button" onClick={() => setTerm('')} aria-label="Borrar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="sr-only" aria-live="polite">
            {cargando ? 'Cargando clubes' : `${resultados.length} ${resultados.length === 1 ? 'club encontrado' : 'clubes encontrados'}`}
          </p>

          <div ref={listRef} id={listId} role="listbox" aria-label={label || 'Clubes'}
            className={`mt-3 overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 divide-y divide-gray-50 bg-white ${listClassName}`}>
            {cargando && (
              <p className="p-4 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando el catálogo de clubes…</p>
            )}
            {!cargando && errorCarga && (
              <div className="p-4 text-sm text-red-700">
                {errorCarga}{' '}
                <button type="button" className="font-bold underline" onClick={() => setIntento(i => i + 1)}>Reintentar</button>
              </div>
            )}
            {!cargando && !errorCarga && resultados.length === 0 && (
              <div className="p-4 text-sm text-gray-600">
                <p className="font-semibold text-gray-800">{term ? `Ningún club coincide con «${term}».` : 'No hay clubes disponibles para este distrito.'}</p>
                <p className="mt-1 flex items-start gap-1.5 text-gray-500"><Info className="w-4 h-4 shrink-0 mt-0.5" />{notFoundMessage}</p>
              </div>
            )}
            {!cargando && resultados.map((c, i) => (
              <button
                key={c.id}
                id={`${listId}-${c.id}`}
                data-idx={i}
                type="button"
                role="option"
                aria-selected={c.id === value}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => elegir(c)}
                className={`w-full text-left px-4 py-3 min-h-[52px] flex items-center justify-between gap-3 text-sm transition-colors ${i === active ? 'bg-gray-50' : ''} ${c.id === value ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <span className="min-w-0">
                  <span className="block font-bold text-gray-900 break-words">{c.name}</span>
                  <span className="block text-xs text-gray-400">
                    {[c.city, c.state].filter(Boolean).join(' · ') || 'Ubicación no registrada'}
                    {allowedDistricts && allowedDistricts.length > 1 && c.districtNumber ? ` · D${c.districtNumber}` : ''}
                  </span>
                </span>
                {c.id === value && <CheckCircle2 className="w-5 h-5 text-rotary-blue shrink-0" />}
              </button>
            ))}
          </div>
          {!cargando && !errorCarga && resultados.length > 0 && (
            <p className="mt-2 text-xs text-gray-400">{notFoundMessage}</p>
          )}
          {elegido && cambiando && (
            <button type="button" onClick={() => { setCambiando(false); setTerm(''); }} className="mt-2 text-xs font-bold text-gray-500 underline">
              Conservar «{elegido.name}»
            </button>
          )}
        </>
      )}
      {error && <p className="text-xs text-red-600 font-semibold mt-2" role="alert">{error}</p>}
    </div>
  );
};

export default ClubSelector;
