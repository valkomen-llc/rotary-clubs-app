// ════════════════════════════════════════════════════════════════════
// Centro de Equipos de IA — las tarjetas del Resumen (v4.1331.0)
//
// Puntos de entrada a cada equipo. Los números salen de /teams (consultas
// AGREGADAS del alcance de la sesión): el Resumen no carga fichas de agentes.
// Distingue lo que el catálogo OFRECE (plantillas) de lo que está INSTALADO y
// de lo que está ACTIVO; un equipo sin agentes activos nunca se pinta
// «Operativo».
// Cada componente vive a nivel de módulo (nunca dentro de otro).
// ════════════════════════════════════════════════════════════════════
import React from 'react';
import { BarChart3, BookOpen, CalendarDays, ChevronRight, Compass, Cpu, EyeOff, Globe, Handshake, Megaphone, Shield, Target, Users, Wallet } from 'lucide-react';
import type { TeamCard, TeamStatus, TeamsSummary } from './agentCenterApi';
import { SectionHeader } from './agentCenterUi';

export const TEAM_ICON_MAP: Record<string, React.ElementType> = {
    compass: Compass, megaphone: Megaphone, handshake: Handshake, calendar: CalendarDays, users: Users, wallet: Wallet,
    cpu: Cpu, chart: BarChart3, target: Target, globe: Globe, book: BookOpen, shield: Shield,
};

export function TeamIcon({ icon, size = 'md' }: { icon: string; size?: 'md' | 'lg' }) {
    const Icon = TEAM_ICON_MAP[icon] || Compass;
    const box = size === 'lg' ? 'w-14 h-14 rounded-2xl' : 'w-10 h-10 rounded-xl';
    const ico = size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';
    return (
        <span className={`${box} bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0`} aria-hidden="true">
            <Icon className={`${ico} text-rotary-blue`} />
        </span>
    );
}

const TONES: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200 border-dashed',
    neutral: 'bg-gray-50 text-gray-600 border-gray-200',
    muted: 'bg-white text-gray-400 border-gray-200',
};
const DOTS: Record<string, string> = { green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-red-500', slate: 'bg-slate-300', neutral: 'bg-gray-400', muted: 'bg-gray-300' };

export function TeamStatusPill({ status }: { status: TeamStatus | null | undefined }) {
    if (!status) return null;
    return (
        <span title={status.help} className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${TONES[status.tone] || TONES.neutral}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${DOTS[status.tone] || DOTS.neutral}`} />{status.label}
        </span>
    );
}

function Metric({ value, label, hint }: { value: number; label: string; hint?: string }) {
    return (
        <div className="min-w-0" title={hint}>
            <p className="text-xl font-black text-gray-800 tabular-nums leading-none">{value}</p>
            <p className="text-[11px] font-semibold text-gray-500 mt-1 truncate">{label}</p>
        </div>
    );
}

function TeamCardView({ card, site, onOpen }: { card: TeamCard; site: boolean; onOpen: (key: string) => void }) {
    const notes: string[] = [];
    if (card.profileOnly) notes.push(`${card.profileOnly} solo perfil`);
    if (card.errors) notes.push(`${card.errors} con error`);
    if (card.pendingTasks) notes.push(`${card.pendingTasks} tareas pendientes`);
    if (!site && card.sites) notes.push(`${card.sites} ${card.sites === 1 ? 'sitio' : 'sitios'}`);
    return (
        <div className={`bg-white rounded-2xl border p-4 flex flex-col gap-3 min-w-0 ${card.visible ? 'border-gray-100' : 'border-dashed border-gray-200'}`}>
            <div className="flex items-start gap-3 min-w-0">
                <TeamIcon icon={card.icon} />
                <div className="min-w-0 flex-1">
                    <p className="font-black text-gray-800 leading-tight">{card.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{card.summary}</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <TeamStatusPill status={card.status} />
                {!card.visible && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400"><EyeOff className="w-3 h-3" />Oculto para los sitios</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-gray-50 pt-3">
                <Metric value={card.templates} label={site ? 'Disponibles' : 'Plantillas'} hint={site ? 'Agentes publicados que tu organización puede usar' : 'Agentes publicados en el catálogo y asignados al equipo'} />
                <Metric value={card.installed} label="Instalados" hint={site ? 'Agentes instalados en tu sitio' : 'Instalaciones en la plataforma y los sitios'} />
                <Metric value={card.active} label="Activos" hint="Encendidos, con herramientas y aceptando tareas" />
            </div>
            <p className="text-[11px] text-gray-400 min-h-[1rem]">{notes.join(' · ')}</p>
            <button type="button" onClick={() => onOpen(card.key)}
                className="mt-auto w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-sm font-bold text-gray-700 hover:border-blue-200 hover:text-rotary-blue hover:bg-blue-50/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                aria-label={`Explorar equipo ${card.label}`}>
                Explorar equipo <ChevronRight className="w-4 h-4" />
            </button>
        </div>
    );
}

export default function TeamCards({ data, onOpen }: { data: TeamsSummary | null; onOpen: (key: string) => void }) {
    const site = data?.scope === 'site';
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <SectionHeader title="Equipos de agentes"
                subtitle="Explora los equipos especializados de inteligencia artificial que apoyan la gestión de clubes, distritos, eventos, proyectos y programas de Rotary." />
            {!data ? <p className="text-sm text-gray-400">Calculando los equipos…</p>
                : data.teams.length === 0 ? <p className="text-sm text-gray-500">{data.policy && !data.policy.enabled ? 'La plataforma todavía no integró los agentes con este tipo de sitio.' : 'No hay equipos habilitados para esta organización.'}</p>
                    : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            {data.teams.map(c => <TeamCardView key={c.key} card={c} site={site} onOpen={onOpen} />)}
                        </div>
                    )}
            <p className="text-[11px] text-gray-400">
                <b>Plantillas</b>: agentes publicados del equipo. <b>Instalados</b>: desplegados {site ? 'en tu sitio' : 'en la plataforma o en sitios'}. <b>Activos</b>: encendidos, con herramientas y aceptando tareas. <b>Solo perfil</b>: conversan, no ejecutan. Un agente puede colaborar con varios equipos sin copiarse.
            </p>
        </div>
    );
}
