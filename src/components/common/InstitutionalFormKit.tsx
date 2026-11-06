// ════════════════════════════════════════════════════════════════════════════
// Formularios institucionales — las piezas visuales compartidas (v4.1286.0)
//
// Salieron TAL CUAL de `GovernorVisitForm.tsx` (Visitas del Gobernador, que a
// su vez copió la arquitectura de Rotary en Acción): marco con Navbar y
// Footer sobre `bg-rotary-concrete`, tarjetas `rounded-3xl`, rótulos en
// mayúsculas, campos de borde doble, barra de pasos con progreso y los
// botones Anterior / Siguiente / Enviar. Las usan Visitas del Gobernador y
// el Formulario institucional de programas, así que cambian juntas.
//
// Regla del repo: todo componente declarado acá, nunca dentro de otro.
// ════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useRef } from 'react';
import Navbar from '../../sections/Navbar';
import Footer from '../../sections/Footer';

export const CAMPO = 'w-full p-3.5 rounded-xl border-2 border-gray-100 text-base bg-gray-50/60 outline-none focus:border-rotary-blue transition-colors';
export const ROTULO = 'block text-[11px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2';
export const TARJETA = 'bg-white rounded-3xl p-6 sm:p-8 md:p-10 shadow-sm border border-gray-100';
/** El campo con su estado de error visible (borde y fondo), no sólo el aviso. */
export const campoCon = (error?: string) => (error ? CAMPO.replace('border-gray-100', 'border-red-300').replace('bg-gray-50/60', 'bg-red-50/40') : CAMPO);

export const BTN_ANTERIOR = 'flex items-center gap-1.5 px-4 py-3 rounded-xl border text-sm font-bold text-gray-500 disabled:opacity-40 min-h-[52px] bg-white hover:bg-gray-50';
export const BTN_SIGUIENTE = 'flex items-center gap-1.5 px-6 py-3 rounded-xl bg-rotary-blue text-white text-sm font-bold min-h-[52px] hover:bg-blue-900 transition-colors';
export const BTN_ENVIAR = 'flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold min-h-[52px] disabled:opacity-60 transition-colors';
/** El contenedor del formulario: el mismo ancho que Visitas del Gobernador. */
export const CONTENEDOR = 'max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-12 pb-20 space-y-4';

export const Marco: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-rotary-concrete flex flex-col">
    <Navbar />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
);

export const Campo: React.FC<{ label: React.ReactNode; htmlFor?: string; error?: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ label, htmlFor, error, hint, children }) => (
  <div>
    <label className={ROTULO} htmlFor={htmlFor}>{label}</label>
    {children}
    {hint && !error && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    {error && <p className="text-xs text-red-600 font-semibold mt-1" role="alert">{error}</p>}
  </div>
);

export const TituloPaso: React.FC<{ icon: React.ReactNode; titulo: React.ReactNode; texto: React.ReactNode }> = ({ icon, titulo, texto }) => (
  <div className="flex items-start gap-3 mb-6">
    <div className="w-11 h-11 rounded-2xl bg-rotary-blue/10 text-rotary-blue flex items-center justify-center shrink-0">{icon}</div>
    <div>
      <h2 className="text-lg sm:text-xl font-black text-gray-900">{titulo}</h2>
      <p className="text-sm text-gray-500 mt-0.5">{texto}</p>
    </div>
  </div>
);

export const Resumen: React.FC<{ etiqueta: string; valor?: React.ReactNode | null }> = ({ etiqueta, valor }) => (
  <div className="flex gap-2 text-sm">
    <dt className="text-gray-400 w-36 shrink-0">{etiqueta}</dt>
    <dd className="font-semibold text-gray-800 min-w-0 break-words">{valor || '—'}</dd>
  </div>
);

/**
 * La barra de pasos con su progreso. `alcanzable(n)` dice a qué paso se puede
 * saltar (Visitas: sólo hacia atrás; Programas: a cualquier sección elegida,
 * porque no se exige completar en orden). `marcas` pinta el número de un
 * paso como completo.
 */
export const BarraDePasos: React.FC<{
  pasos: string[]; paso: number; pct: number; onIr: (n: number) => void;
  alcanzable?: (n: number) => boolean; marcas?: boolean[]; compacta?: boolean;
}> = ({ pasos, paso, pct, onIr, alcanzable, marcas, compacta }) => {
  // Con muchos pasos la fila se desplaza: el paso actual siempre queda a la vista.
  const fila = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!compacta || !fila.current) return;
    const el = fila.current.querySelector('[aria-current="step"]') as HTMLElement | null;
    if (el) fila.current.scrollTo({ left: el.offsetLeft - fila.current.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [paso, compacta]);
  return (
  <nav aria-label="Progreso" className="bg-white rounded-2xl border border-gray-100 px-4 sm:px-6 py-3.5 shadow-sm space-y-3">
    <div ref={fila} className={`flex items-center gap-2 ${compacta ? 'overflow-x-auto pb-1 -mx-1 px-1' : 'justify-between'}`}>
      {pasos.map((label, i) => {
        const n = i + 1;
        const puede = alcanzable ? alcanzable(n) : n <= paso;
        const hecho = marcas ? marcas[i] : n < paso;
        return (
          <button
            key={label + n} type="button" onClick={() => onIr(n)} disabled={!puede} title={label}
            aria-current={n === paso ? 'step' : undefined}
            className={`flex items-center gap-2 text-xs font-bold whitespace-nowrap px-3 py-1.5 rounded-full transition-all shrink-0 ${
              n === paso ? 'bg-rotary-blue text-white shadow-sm' : hecho || puede ? 'text-rotary-blue hover:bg-blue-50' : 'text-gray-400 disabled:opacity-60 cursor-default'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${n === paso ? 'bg-white/25 text-white' : hecho ? 'bg-rotary-blue text-white' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
            <span className={compacta ? 'hidden md:inline' : 'hidden sm:inline'}>{label}</span>
          </button>
        );
      })}
    </div>
    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-rotary-blue transition-all duration-500" style={{ width: `${Math.max(4, pct)}%` }} />
    </div>
    <p className={`${compacta ? 'md:hidden' : 'sm:hidden'} text-[11px] font-bold text-gray-400`}>Paso {paso} de {pasos.length}: {pasos[paso - 1]}</p>
  </nav>
  );
};
