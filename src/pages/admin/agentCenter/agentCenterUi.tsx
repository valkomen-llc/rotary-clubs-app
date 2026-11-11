// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — piezas visuales compartidas.
// Cada componente vive a nivel de módulo (nunca dentro de otro): declarado
// adentro sería un tipo nuevo en cada render y los formularios perderían el
// foco tras cada letra.
// ════════════════════════════════════════════════════════════════════
import React from 'react';

export const avatarUrl = (seed?: string | null) =>
    `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed || 'agente')}&backgroundColor=transparent`;

export const STATE_STYLES: Record<string, { dot: string; chip: string }> = {
    available: { dot: 'bg-gray-400', chip: 'bg-gray-50 text-gray-600 border-gray-200' },
    installed: { dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
    configured: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
    profile_only: { dot: 'bg-slate-300', chip: 'bg-slate-50 text-slate-600 border-slate-200 border-dashed' },
    active: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    running: { dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 border-violet-200' },
    error: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200' },
    disabled: { dot: 'bg-gray-300', chip: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const STATE_LABELS: Record<string, string> = {
    available: 'Disponible', installed: 'Instalado', configured: 'Configurado', profile_only: 'Solo perfil',
    active: 'Activo', running: 'Ejecutando', error: 'Con error', disabled: 'Deshabilitado',
};

export function StatePill({ state, title }: { state: string; title?: string }) {
    const s = STATE_STYLES[state] || STATE_STYLES.available;
    return (
        <span title={title} className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${s.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{STATE_LABELS[state] || state}
        </span>
    );
}

const TEMPLATE_STATUS_STYLES: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    review: 'bg-amber-50 text-amber-700',
    published: 'bg-emerald-50 text-emerald-700',
    retired: 'bg-red-50 text-red-600',
};
const TEMPLATE_STATUS_LABELS: Record<string, string> = { draft: 'Borrador', review: 'En revisión', published: 'Publicada', retired: 'Retirada' };

export function TemplateStatusPill({ status }: { status: string }) {
    return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${TEMPLATE_STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}`}>{TEMPLATE_STATUS_LABELS[status] || status}</span>;
}

const ORIGIN_LABELS: Record<string, string> = { legacy: 'Heredado', agency: 'The Agency', skill: 'Habilidad', institutional: 'Institucional', custom: 'Personalizado' };
export function OriginBadge({ origin }: { origin: string }) {
    return <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">{ORIGIN_LABELS[origin] || origin}</span>;
}

export function AgentAvatar({ seed, color, size = 40 }: { seed?: string | null; color?: string | null; size?: number }) {
    return (
        <div className="rounded-2xl overflow-hidden border-2 bg-gray-50 shrink-0" style={{ width: size, height: size, borderColor: color || '#e5e7eb' }}>
            <img src={avatarUrl(seed)} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
    );
}

export function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">{label}</p>
            <p className="text-2xl font-black text-gray-800 tabular-nums mt-1">{value}</p>
            {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
        </div>
    );
}

export function ErrorNote({ message }: { message: string | null }) {
    if (!message) return null;
    return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">{message}</div>;
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
    return <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-500">{children}</div>;
}

export function SectionHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-lg font-black text-gray-800">{title}</h2>
                {subtitle && <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}

export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
