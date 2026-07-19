import React from 'react';
import type { ReportDataset, Kpi, MetricStatus } from '../../../lib/reportTypes';
import { Icon } from './icon';
import ReportChart from './ReportChart';
import MaturityGauge from './MaturityGauge';
import AgentTeamSection from './AgentTeamSection';

const STATUS_RING: Record<MetricStatus, string> = {
    good: 'text-emerald-600 bg-emerald-50',
    warn: 'text-amber-600 bg-amber-50',
    bad: 'text-rose-600 bg-rose-50',
    neutral: 'text-slate-600 bg-slate-100',
};

const MODULE_STATUS_STYLE: Record<string, { dot: string; text: string; bg: string; label: string }> = {
    active: { dot: '#10b981', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100', label: 'Activo' },
    configured: { dot: '#3b82f6', text: 'text-blue-700', bg: 'bg-blue-50 border-blue-100', label: 'Configurado' },
    pending: { dot: '#f59e0b', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-100', label: 'Pendiente' },
    disabled: { dot: '#cbd5e1', text: 'text-slate-400', bg: 'bg-slate-50 border-slate-100', label: 'No disp.' },
};

const TONE_COLOR: Record<string, string> = {
    blue: '#0c3c7c', green: '#10b981', purple: '#8b5cf6', teal: '#14b8a6', pink: '#ec4899', rose: '#f43f5e',
};

const fmtDate = (s?: string) => {
    if (!s) return '';
    try { return new Date(s).toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return ''; }
};

const KpiCard: React.FC<{ kpi: Kpi; accent?: string }> = ({ kpi, accent = '#0c3c7c' }) => {
    const status = (kpi.status || 'neutral') as MetricStatus;
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accent}12`, color: accent }}>
                    <Icon name={kpi.icon} size={17} />
                </div>
                {typeof kpi.delta === 'number' && kpi.delta !== 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${kpi.delta > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                        {kpi.delta > 0 ? '▲' : '▼'} {Math.abs(kpi.delta)}%
                    </span>
                )}
            </div>
            <div>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900 tracking-tight">{kpi.display ?? kpi.value}</span>
                    {kpi.unit && <span className="text-xs font-bold text-slate-400">{kpi.unit}</span>}
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 leading-tight">{kpi.label}</p>
            </div>
            {status !== 'neutral' && <span className={`self-start text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_RING[status]}`}>{status === 'good' ? 'Óptimo' : status === 'warn' ? 'A mejorar' : 'Atención'}</span>}
        </div>
    );
};

const SectionBlock: React.FC<{ section: ReportDataset['sections'][number] }> = ({ section }) => (
    <section className="rp-block bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 flex items-center gap-3 border-b border-slate-50" style={{ background: `linear-gradient(90deg, ${section.accent}0d, transparent)` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ backgroundColor: section.accent }}>
                <Icon name={section.icon} size={19} />
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">{section.title}</h3>
        </div>
        <div className="p-6 space-y-5">
            {section.note && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 flex items-start gap-2">
                    <Icon name="Info" size={14} className="mt-0.5 shrink-0" /> {section.note}
                </p>
            )}
            {section.kpis && section.kpis.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {section.kpis.map((k, i) => <KpiCard key={i} kpi={k} accent={section.accent} />)}
                </div>
            )}
            {section.charts && section.charts.map((c, i) => (
                <div key={i} className="bg-slate-50/60 rounded-2xl p-4 border border-slate-100">
                    <ReportChart block={c} />
                </div>
            ))}
        </div>
    </section>
);

const ExecutiveReportView: React.FC<{ dataset: ReportDataset; innerRef?: React.Ref<HTMLDivElement> }> = ({ dataset, innerRef }) => {
    const { meta, maturity, headlineKpis, ecosystem, engineering, sections, comparatives, timeline, achievements, narrative, agentTeam } = dataset;
    const primary = meta.site.colors?.primary || '#0c3c7c';
    const secondary = meta.site.colors?.secondary || '#E29C00';

    return (
        <div ref={innerRef} className="rp-root bg-slate-50" style={{ maxWidth: 900, margin: '0 auto' }}>
            {/* ── PORTADA ── */}
            <div className="rp-block relative overflow-hidden text-white p-10 md:p-14" style={{ background: `linear-gradient(135deg, ${primary} 0%, #013388 60%, #0c1f45 100%)` }}>
                <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full" style={{ background: `${secondary}22`, filter: 'blur(40px)' }} />
                <div className="absolute -left-16 bottom-0 w-64 h-64 rounded-full bg-white/5" style={{ filter: 'blur(30px)' }} />
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
                                <Icon name="Sparkles" size={20} />
                            </div>
                            <div>
                                <p className="text-sm font-black tracking-tight">{meta.platform.name}</p>
                                <p className="text-[10px] text-white/60 font-medium">{meta.platform.tagline}</p>
                            </div>
                        </div>
                        {meta.site.logo && <img src={meta.site.logo} alt={meta.site.name} className="h-12 max-w-[140px] object-contain" crossOrigin="anonymous" />}
                    </div>

                    <span className="inline-block text-[10px] font-black uppercase tracking-[0.25em] mb-4 px-3 py-1 rounded-full" style={{ backgroundColor: `${secondary}30`, color: secondary }}>
                        Informe Ejecutivo Inteligente
                    </span>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight mb-3">{meta.site.name}</h1>
                    <p className="text-white/70 font-medium mb-8">
                        {meta.site.categoryLabel}{meta.site.city ? ` · ${meta.site.city}` : ''}{meta.site.districtName ? ` · ${meta.site.districtName}` : ''}
                    </p>

                    <div className="flex flex-wrap gap-8 items-end">
                        <div>
                            <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Período analizado</p>
                            <p className="text-lg font-black">{meta.period.label}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Generado</p>
                            <p className="text-lg font-black">{fmtDate(meta.generatedAt)}</p>
                        </div>
                        <div className="ml-auto text-center px-6 py-4 rounded-2xl bg-white/10 backdrop-blur border border-white/15">
                            <p className="text-4xl font-black" style={{ color: secondary }}>{maturity.score}<span className="text-lg text-white/40">/100</span></p>
                            <p className="text-[11px] font-bold uppercase tracking-wide mt-1">{maturity.level}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 md:p-8 space-y-6">
                {/* ── RESUMEN EJECUTIVO (IA) ── */}
                {narrative && (
                    <section className="rp-block bg-white rounded-3xl border border-slate-100 shadow-sm p-7">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${primary}, #3b82f6)` }}>
                                <Icon name="Sparkles" size={19} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-900 tracking-tight">Resumen Ejecutivo</h2>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    {narrative.generatedBy === 'deterministic' ? 'Análisis automático' : `Generado con IA`}
                                </p>
                            </div>
                        </div>
                        {narrative.executiveSummary.split('\n').filter(Boolean).map((p, i) => (
                            <p key={i} className="text-sm text-slate-600 leading-relaxed mb-3">{p}</p>
                        ))}
                        {narrative.highlights?.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
                                {narrative.highlights.map((h, i) => (
                                    <div key={i} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                                        <Icon name="CheckCircle2" size={15} className="text-emerald-500 shrink-0" /> {h}
                                    </div>
                                ))}
                            </div>
                        )}
                        {narrative.conclusion && (
                            <div className="mt-4 rounded-2xl p-4 border-l-4" style={{ borderColor: secondary, backgroundColor: `${secondary}0d` }}>
                                <p className="text-sm text-slate-700 font-medium italic">{narrative.conclusion}</p>
                            </div>
                        )}
                    </section>
                )}

                {/* ── KPIs PRINCIPALES ── */}
                <section className="rp-block">
                    <h2 className="text-sm font-black text-slate-500 uppercase tracking-wider mb-3 px-1">Indicadores Principales</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {headlineKpis.map((k, i) => <KpiCard key={i} kpi={k} accent={i === 0 ? secondary : primary} />)}
                    </div>
                </section>

                {/* ── MADUREZ + ECOSISTEMA ── */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <section className="rp-block lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center">
                        <h2 className="text-lg font-black text-slate-900 tracking-tight mb-1 text-center">Índice de Madurez Digital</h2>
                        <p className="text-xs text-slate-400 font-medium mb-4 text-center">Nivel del Ecosistema Digital</p>
                        <MaturityGauge maturity={maturity} />
                        <div className="w-full mt-6 space-y-2">
                            {maturity.dimensions.map((d) => (
                                <div key={d.key} className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-slate-500 w-32 shrink-0 truncate">{d.label}</span>
                                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${d.score}%`, backgroundColor: primary }} />
                                    </div>
                                    <span className="text-[11px] font-black text-slate-700 w-8 text-right">{d.score}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rp-block lg:col-span-3 bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 tracking-tight">Ecosistema Digital</h2>
                                <p className="text-xs text-slate-400 font-medium">{ecosystem.activeCount} activos · {ecosystem.configuredCount} configurados · {ecosystem.totalCount} módulos</p>
                            </div>
                            <div className="text-center">
                                <p className="text-3xl font-black" style={{ color: primary }}>{ecosystem.digitalizationPct}%</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Digitalización</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {ecosystem.modules.map((m) => {
                                const st = MODULE_STATUS_STYLE[m.status];
                                return (
                                    <div key={m.key} className={`rounded-xl border px-3 py-2.5 ${st.bg}`}>
                                        <div className="flex items-center gap-2">
                                            <Icon name={m.icon} size={15} className={st.text} />
                                            <span className="text-[11px] font-bold text-slate-700 truncate">{m.label}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
                                            <span className={`text-[9px] font-bold uppercase tracking-wide ${st.text}`}>{st.label}</span>
                                            <span className="text-[9px] text-slate-400 ml-auto truncate">{m.metric}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>

                {/* ── INGENIERÍA DEL SITIO ── */}
                <section className="rp-block bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-white"><Icon name="Cpu" size={19} /></div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight">Ingeniería del Sitio</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {engineering.items.map((it, i) => (
                            <div key={i} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                                <Icon name={it.icon} size={16} className="text-slate-400 mb-1.5" />
                                <p className="text-sm font-black text-slate-800 leading-tight truncate">{it.value}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5 leading-tight">{it.label}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── EQUIPO DE MARKETING IA ── */}
                {agentTeam?.available && <AgentTeamSection team={agentTeam} />}

                {/* ── SECCIONES GENÉRICAS ── */}
                {sections.map((s) => <SectionBlock key={s.id} section={s} />)}

                {/* ── COMPARATIVOS ── */}
                {comparatives.map((c, i) => (
                    <section key={i} className="rp-block bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                        <h2 className="text-lg font-black text-slate-900 tracking-tight mb-4">{c.title}</h2>
                        <div style={{ height: 280 }}>
                            <ReportChart block={{ type: 'bar', title: '', data: c.data.map((d: any) => ({ name: d.name, value: d.revenue })), valueFormat: 'number', height: 280 }} />
                        </div>
                    </section>
                ))}

                {/* ── LÍNEA DE TIEMPO ── */}
                {timeline.length > 0 && (
                    <section className="rp-block bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white"><Icon name="GitCommitHorizontal" size={19} /></div>
                            <h2 className="text-lg font-black text-slate-900 tracking-tight">Línea de Tiempo</h2>
                        </div>
                        <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100">
                            {timeline.map((t, i) => (
                                <div key={i} className="relative">
                                    <span className="absolute -left-[18px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ backgroundColor: TONE_COLOR[t.tone] || '#0c3c7c' }} />
                                    <div className="flex items-center gap-2">
                                        <Icon name={t.icon} size={15} style={{ color: TONE_COLOR[t.tone] || '#0c3c7c' }} />
                                        <p className="text-sm font-black text-slate-800">{t.title}</p>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── LOGROS ── */}
                <section className="rp-block bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: secondary }}><Icon name="Award" size={19} /></div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight">Logros del Sitio</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {achievements.map((a) => (
                            <div key={a.key} className={`rounded-2xl border p-3 text-center transition ${a.earned ? 'bg-white border-slate-100 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-45'}`}>
                                <div className="w-11 h-11 mx-auto rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: a.earned ? `${secondary}1a` : '#f1f5f9', color: a.earned ? secondary : '#94a3b8' }}>
                                    <Icon name={a.icon} size={20} />
                                </div>
                                <p className="text-[11px] font-black text-slate-800 leading-tight">{a.label}</p>
                                <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">{a.description}</p>
                                {a.earned && <Icon name="BadgeCheck" size={13} className="text-emerald-500 mx-auto mt-1" />}
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── RECOMENDACIONES ── */}
                {narrative?.recommendations && narrative.recommendations.length > 0 && (
                    <section className="rp-block rounded-3xl p-7 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${primary}, #013388)` }}>
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><Icon name="Lightbulb" size={19} /></div>
                            <h2 className="text-xl font-black tracking-tight">Recomendaciones Inteligentes</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {narrative.recommendations.map((r, i) => (
                                <div key={i} className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/15">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15">{r.area}</span>
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${r.priority === 'alta' ? 'bg-rose-400/30 text-rose-100' : r.priority === 'media' ? 'bg-amber-400/30 text-amber-100' : 'bg-white/10 text-white/70'}`}>
                                            {r.priority}
                                        </span>
                                    </div>
                                    <p className="text-sm font-black mb-1">{r.title}</p>
                                    <p className="text-xs text-white/70 leading-relaxed">{r.detail}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── PIE ── */}
                <div className="text-center py-6 text-xs text-slate-400 font-medium">
                    <p className="font-black text-slate-500">{meta.platform.name} · Club Platform Insights</p>
                    <p className="mt-1">Informe generado el {fmtDate(meta.generatedAt)} · Datos de {meta.site.name}</p>
                    {meta.site.domain && <p className="mt-0.5">{meta.site.domain}</p>}
                </div>
            </div>
        </div>
    );
};

export default ExecutiveReportView;
