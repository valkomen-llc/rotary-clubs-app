// Piezas visuales compartidas por las estadísticas de un enlace y las de un
// código QR (v4.1278). Antes vivían dentro de `LinkRedirectsPanel.tsx`; se
// sacan para que las dos pantallas pinten igual sin duplicar nada.
//
// Son componentes de MÓDULO, nunca declarados dentro de otro: un componente
// declarado adentro es un tipo nuevo en cada render y pierde el foco.
import type { ReactNode } from 'react';

export const numero = (n: number) => Number(n || 0).toLocaleString('es-CO');

export const fechaCorta = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const fechaHora = (v?: string | null) =>
    v ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

/** «hace 3 min». Un instante exacto no dice si el enlace está vivo; esto sí. */
export function haceCuanto(v?: string | null, vacio = 'sin clics todavía') {
    if (!v) return vacio;
    const ms = Date.now() - new Date(v).getTime();
    if (Number.isNaN(ms)) return '—';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'hace segundos';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `hace ${d} d`;
    return fechaCorta(v);
}

export function Kpi({ label, value, destacado, pequeno, nota }: {
    label: string; value: string; destacado?: boolean; pequeno?: boolean; nota?: string;
}) {
    return (
        <div className={`rounded-2xl p-4 ${destacado ? 'bg-rotary-blue text-white' : 'bg-gray-50'}`}>
            <p className={`text-[10px] uppercase tracking-wide font-semibold ${destacado ? 'text-white/70' : 'text-gray-400'}`}>{label}</p>
            <p className={`${pequeno ? 'text-sm' : 'text-2xl'} font-bold mt-1 ${destacado ? 'text-white' : 'text-gray-800'} tabular-nums`}>{value}</p>
            {nota && <p className={`text-[10px] mt-1 ${destacado ? 'text-white/60' : 'text-gray-400'}`}>{nota}</p>}
        </div>
    );
}

export function Seccion({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
    return (
        <div className="mb-8">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h5 className="text-xs font-bold uppercase tracking-wide text-gray-400">{titulo}</h5>
                {accion}
            </div>
            {children}
        </div>
    );
}

export function Barras({ filas, color = 'bg-rotary-blue/70' }: { filas: Array<{ label: string; value: number; nota?: string }>; color?: string }) {
    if (!filas.length) return <p className="text-xs text-gray-400 italic">Sin datos en este período.</p>;
    const max = Math.max(1, ...filas.map(f => f.value));
    return (
        <ul className="space-y-2">
            {filas.map((f, i) => (
                <li key={i}>
                    <div className="flex items-baseline justify-between text-xs mb-1">
                        <span className="text-gray-600 truncate pr-2">
                            {f.label}
                            {f.nota && <span className="text-gray-400 ml-1">· {f.nota}</span>}
                        </span>
                        <span className="text-gray-400 tabular-nums flex-shrink-0">{numero(f.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${(f.value / max) * 100}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}

export interface SerieDia {
    day: string;
    clicks: number;
    qrScans?: number;
    blocked?: number;
}

/**
 * La evolución por día, APILADA: lo que entró por QR (dorado) sobre lo que
 * entró por el enlace compartido (azul). Un día sin clics se dibuja vacío: el
 * rango ya viene relleno del servidor, así que no se une nada con rectas.
 */
export function SerieBarras({ series, modo = 'split' }: { series: SerieDia[]; modo?: 'split' | 'simple' | 'qr' }) {
    if (!series.length) return <p className="text-xs text-gray-400 italic">Sin accesos en este período.</p>;
    const total = (d: SerieDia) => d.clicks + (modo === 'qr' ? (d.blocked || 0) : 0);
    const max = Math.max(1, ...series.map(total));
    return (
        <div>
            <div className="flex items-end gap-[3px] h-32">
                {series.map(d => {
                    const qr = modo === 'split' ? Math.min(d.clicks, d.qrScans || 0) : 0;
                    const directo = modo === 'split' ? d.clicks - qr : d.clicks;
                    const bloqueado = modo === 'qr' ? (d.blocked || 0) : 0;
                    const h = (n: number) => `${(n / max) * 100}%`;
                    const titulo = modo === 'split'
                        ? `${d.day}: ${numero(d.clicks)} en total · ${numero(qr)} por QR · ${numero(directo)} directos`
                        : modo === 'qr'
                            ? `${d.day}: ${numero(d.clicks)} escaneos · ${numero(bloqueado)} sin saltar`
                            : `${d.day}: ${numero(d.clicks)} clic${d.clicks === 1 ? '' : 's'}`;
                    return (
                        <div key={d.day} className="flex-1 min-w-[3px] group relative flex flex-col justify-end h-full">
                            {bloqueado > 0 && <div className="w-full bg-gray-300 rounded-t" style={{ height: h(bloqueado) }} />}
                            {qr > 0 && <div className={`w-full bg-amber-400 ${bloqueado ? '' : 'rounded-t'}`} style={{ height: h(qr) }} />}
                            {directo > 0 && <div className={`w-full bg-rotary-blue/80 group-hover:bg-rotary-blue ${qr || bloqueado ? '' : 'rounded-t'}`} style={{ height: h(directo) }} />}
                            {d.clicks === 0 && bloqueado === 0 && <div className="w-full" style={{ height: 0 }} />}
                            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-[10px] text-white z-10">
                                {titulo}
                            </span>
                        </div>
                    );
                })}
            </div>
            {modo === 'split' && (
                <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
                    <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-rotary-blue/80 inline-block" /> Enlace compartido</span>
                    <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Por código QR</span>
                </div>
            )}
            {modo === 'qr' && (
                <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
                    <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-rotary-blue/80 inline-block" /> Escaneos que saltaron</span>
                    <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-gray-300 inline-block" /> Escaneos sin saltar (vencido o pausado)</span>
                </div>
            )}
        </div>
    );
}

export function EstadoPill({ state, texto }: { state: string; texto: string }) {
    const estilo: Record<string, string> = {
        active: 'bg-emerald-50 text-emerald-700',
        paused: 'bg-gray-100 text-gray-500',
        expired: 'bg-amber-50 text-amber-700',
        disabled: 'bg-red-50 text-red-600',
        deleted: 'bg-red-50 text-red-600',
    };
    const punto: Record<string, string> = {
        active: 'bg-emerald-500', paused: 'bg-gray-400', expired: 'bg-amber-500', disabled: 'bg-red-400', deleted: 'bg-red-400',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${estilo[state] || estilo.paused}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${punto[state] || punto.paused}`} />
            {texto}
        </span>
    );
}

export function IconBtn({ children, onClick, title, peligro, disabled }: {
    children: ReactNode; onClick: () => void; title: string; peligro?: boolean; disabled?: boolean;
}) {
    return (
        <button
            type="button" onClick={onClick} title={title} aria-label={title} disabled={disabled}
            className={`p-2 rounded-lg text-gray-300 transition-colors disabled:opacity-40 ${
                peligro ? 'hover:text-red-500 hover:bg-red-50' : 'hover:text-rotary-blue hover:bg-sky-50'
            }`}
        >
            {children}
        </button>
    );
}
