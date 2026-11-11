import { useEffect, useState } from 'react';
import { X, Save, Send, Rocket, Archive, RotateCcw, ExternalLink } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta, Template, TemplateDraft } from './agentCenterApi';
import { AgentAvatar, ErrorNote, OriginBadge, StatePill, TemplateStatusPill, fmtDate } from './agentCenterUi';

interface FormState {
    draft: TemplateDraft;
    team: string;
    level: string;
    allowedSiteTypes: string[];
}

interface SkillRow { id: string; key: string; name: string; description: string | null }

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';
const labelCls = 'block text-xs font-bold text-gray-600 mb-1';

function toForm(t: Template): FormState {
    return { draft: { ...t.draft }, team: t.team, level: t.level, allowedSiteTypes: [...(t.allowedSiteTypes || [])] };
}

export default function TemplateEditor({ id, meta, onClose, onChanged }: { id: string; meta: Meta; onClose: () => void; onChanged: () => void }) {
    const [tpl, setTpl] = useState<Template | null>(null);
    const [form, setForm] = useState<FormState | null>(null);
    const [skills, setSkills] = useState<SkillRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [changelog, setChangelog] = useState('');
    const [openVersion, setOpenVersion] = useState<string | null>(null);

    useEffect(() => {
        acApi<Template>(`/templates/${id}`).then(t => { setTpl(t); setForm(toForm(t)); }).catch(e => setError(e.message));
        acApi<{ skills: SkillRow[] }>('/skills').then(d => setSkills(d.skills)).catch(() => setSkills([]));
    }, [id]);

    const setDraft = (patch: Partial<TemplateDraft>) => setForm(f => (f ? { ...f, draft: { ...f.draft, ...patch } } : f));

    const run = async (fn: () => Promise<Template | void>, ok: string) => {
        setBusy(true); setError(null); setNotice(null);
        try {
            const r = await fn();
            if (r && (r as Template).id) { setTpl(r as Template); setForm(toForm(r as Template)); }
            setNotice(ok);
            onChanged();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    const saveDraft = () => run(async () => {
        if (!form) return;
        await acApi(`/templates/${id}/draft`, { method: 'PATCH', body: { draft: form.draft, team: form.team, level: form.level, allowedSiteTypes: form.allowedSiteTypes } });
        return acApi<Template>(`/templates/${id}`);
    }, 'Borrador guardado.');
    const setStatus = (status: string) => run(() => acApi<Template>(`/templates/${id}/status`, { method: 'POST', body: { status } }), status === 'review' ? 'Enviada a revisión.' : status === 'retired' ? 'Plantilla retirada: sus instalaciones quedan deshabilitadas.' : 'Estado cambiado.');
    const publish = () => run(async () => {
        if (!form) return;
        await acApi(`/templates/${id}/draft`, { method: 'PATCH', body: { draft: form.draft, team: form.team, level: form.level, allowedSiteTypes: form.allowedSiteTypes } });
        const r = await acApi<Template>(`/templates/${id}/publish`, { method: 'POST', body: { changelog } });
        setChangelog('');
        return r;
    }, 'Versión publicada. Las instalaciones no fijadas ya la usan.');
    const installPlatform = () => run(async () => {
        await acApi('/installations', { method: 'POST', body: { templateId: id, scopeType: 'platform', enabled: true } });
        return acApi<Template>(`/templates/${id}`);
    }, 'Instalado en la administración central.');

    const toggleSkill = (key: string) => setDraft({ skills: (form?.draft.skills || []).includes(key) ? (form?.draft.skills || []).filter(k => k !== key) : [...(form?.draft.skills || []), key] });
    const toggleSiteType = (type: string) => setForm(f => (f ? { ...f, allowedSiteTypes: f.allowedSiteTypes.includes(type) ? f.allowedSiteTypes.filter(t => t !== type) : [...f.allowedSiteTypes, type] } : f));

    const src = tpl?.sourceRef || {};
    const hasPlatform = (tpl?.installations || []).some(i => i.scopeType === 'platform');

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Editar plantilla de agente">
            <div className="w-full max-w-3xl h-full bg-gray-50 overflow-y-auto shadow-2xl">
                <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
                    {tpl && <AgentAvatar seed={tpl.avatarSeed || tpl.draft.name} color={tpl.avatarColor} size={40} />}
                    <div className="min-w-0 flex-1">
                        <p className="font-black text-gray-800 truncate">{form?.draft.name || 'Plantilla'}</p>
                        {tpl && <div className="flex flex-wrap gap-1.5 items-center mt-0.5"><TemplateStatusPill status={tpl.status} /><OriginBadge origin={tpl.origin} /><span className="text-[11px] text-gray-400">{tpl.currentVersion ? `v${tpl.currentVersion} publicada` : 'sin versión publicada'}</span></div>}
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100" aria-label="Cerrar"><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                {!form || !tpl ? <div className="p-6 text-sm text-gray-400">{error || 'Cargando…'}</div> : (
                    <div className="p-5 space-y-5">
                        <ErrorNote message={error} />
                        {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-2.5">{notice}</div>}
                        {form.draft.needsAdaptation && (
                            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-2.5">
                                Importado de The Agency: está en inglés y pensado para empresas. Adáptalo al español y al contexto rotario antes de publicarlo.
                            </div>
                        )}

                        <section className="bg-white rounded-2xl border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div><label htmlFor="te-name" className={labelCls}>Nombre</label><input id="te-name" className={inputCls} value={form.draft.name || ''} onChange={e => setDraft({ name: e.target.value })} /></div>
                            <div><label htmlFor="te-role" className={labelCls}>Rol</label><input id="te-role" className={inputCls} value={form.draft.role || ''} onChange={e => setDraft({ role: e.target.value })} /></div>
                            <div><label htmlFor="te-team" className={labelCls}>Equipo</label>
                                <select id="te-team" className={inputCls} value={form.team} onChange={e => setForm({ ...form, team: e.target.value })}>
                                    {meta.teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                                </select></div>
                            <div><label htmlFor="te-level" className={labelCls}>Dónde se instala</label>
                                <select id="te-level" className={inputCls} value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>
                                    {Object.entries(meta.levels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select></div>
                            <div className="md:col-span-2"><label htmlFor="te-desc" className={labelCls}>Descripción</label><textarea id="te-desc" rows={2} className={inputCls} value={form.draft.description || ''} onChange={e => setDraft({ description: e.target.value })} /></div>
                            <div className="md:col-span-2">
                                <p className={labelCls}>Tipos de sitio para los que está pensado <span className="font-normal text-gray-400">(ninguno marcado = todos los integrados)</span></p>
                                <div className="flex flex-wrap gap-1.5">
                                    {meta.siteTypes.map(s => (
                                        <button key={s.type} type="button" onClick={() => toggleSiteType(s.type)}
                                            className={`text-xs px-2.5 py-1 rounded-full border ${form.allowedSiteTypes.includes(s.type) ? 'bg-blue-50 border-blue-200 text-rotary-blue font-bold' : 'bg-white border-gray-200 text-gray-500'}`}>{s.label}</button>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                            <div><label htmlFor="te-prompt" className={labelCls}>Instrucciones (prompt de sistema)</label>
                                <textarea id="te-prompt" rows={12} className={`${inputCls} font-mono text-[13px]`} value={form.draft.systemPrompt || ''} onChange={e => setDraft({ systemPrompt: e.target.value })} />
                                <p className="text-[11px] text-gray-400 mt-1">{(form.draft.systemPrompt || '').length.toLocaleString('es-CO')} caracteres. Escribe en positivo y en corto: lo que el agente hace, para quién y qué nunca decide solo.</p></div>
                            <div><label htmlFor="te-greet" className={labelCls}>Saludo</label><input id="te-greet" className={inputCls} value={form.draft.greeting || ''} onChange={e => setDraft({ greeting: e.target.value })} /></div>
                            <div><label htmlFor="te-caps" className={labelCls}>Capacidades heredadas <span className="font-normal text-gray-400">(separadas por coma; las herramientas reales se conceden por instalación)</span></label>
                                <input id="te-caps" className={inputCls} value={(form.draft.capabilities || []).join(', ')} onChange={e => setDraft({ capabilities: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></div>
                            <div><label htmlFor="te-model" className={labelCls}>Modelo preferido <span className="font-normal text-gray-400">(vacío = el modelo por defecto de la plataforma)</span></label>
                                <input id="te-model" className={inputCls} placeholder="gemini-2.5-flash" value={form.draft.modelPolicy?.preferred || ''} onChange={e => setDraft({ modelPolicy: { preferred: e.target.value || null, allowFallback: true } })} /></div>
                        </section>

                        <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                            <p className={labelCls}>Habilidades ({(form.draft.skills || []).length} de {skills.length})</p>
                            <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {skills.map(s => (
                                    <label key={s.key} className="flex items-start gap-2 text-xs p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input type="checkbox" className="mt-0.5" checked={(form.draft.skills || []).includes(s.key)} onChange={() => toggleSkill(s.key)} />
                                        <span><b className="text-gray-700">{s.name}</b><span className="block text-gray-400 line-clamp-1">{s.description}</span></span>
                                    </label>
                                ))}
                            </div>
                        </section>

                        <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={busy} onClick={saveDraft} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Save className="w-4 h-4" /> Guardar borrador</button>
                                {tpl.status === 'draft' && <button type="button" disabled={busy} onClick={() => setStatus('review')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-bold text-amber-800 disabled:opacity-50"><Send className="w-4 h-4" /> Enviar a revisión</button>}
                                {tpl.status === 'published' && <button type="button" disabled={busy} onClick={() => setStatus('retired')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-700 disabled:opacity-50"><Archive className="w-4 h-4" /> Retirar</button>}
                                {tpl.status === 'retired' && <button type="button" disabled={busy} onClick={() => setStatus('draft')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 disabled:opacity-50"><RotateCcw className="w-4 h-4" /> Volver a borrador</button>}
                            </div>
                            <div className="flex flex-wrap gap-2 items-end">
                                <div className="flex-1 min-w-[220px]"><label htmlFor="te-changelog" className={labelCls}>Qué cambia en esta versión</label><input id="te-changelog" className={inputCls} value={changelog} onChange={e => setChangelog(e.target.value)} placeholder="Ej.: instrucciones adaptadas al español" /></div>
                                <button type="button" disabled={busy || tpl.status === 'retired'} onClick={publish} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"><Rocket className="w-4 h-4" /> Publicar versión {(tpl.currentVersion || 0) + 1}</button>
                            </div>
                            {tpl.readiness && !tpl.readiness.ready && <p className="text-xs text-amber-700">Falta para publicar: {tpl.readiness.missing.join(', ')}.</p>}
                        </section>

                        <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                            <div className="flex flex-wrap justify-between gap-2 items-center">
                                <p className="text-sm font-black text-gray-800">Instalaciones ({tpl.installations?.length || 0})</p>
                                {tpl.status === 'published' && tpl.level !== 'site' && !hasPlatform && <button type="button" disabled={busy} onClick={installPlatform} className="text-xs font-bold text-rotary-blue hover:underline">Instalar en la administración central</button>}
                            </div>
                            {(tpl.installations || []).length === 0 ? <p className="text-xs text-gray-400">Sin instalaciones. Se instala en sitios desde «Instalaciones».</p> : (
                                <ul className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                                    {(tpl.installations || []).map(i => (
                                        <li key={i.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                                            <span className="text-gray-700 truncate">{i.scopeType === 'platform' ? 'Administración central' : `${i.siteName || i.siteId}`}<span className="text-gray-400 text-xs"> {i.versionNumber ? `· v${i.versionNumber}` : ''}{i.overrides?.pinned ? ' · fijada' : ''}</span></span>
                                            <StatePill state={i.state} title={i.stateReason} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                            <p className="text-sm font-black text-gray-800">Versiones</p>
                            {(tpl.versions || []).length === 0 ? <p className="text-xs text-gray-400">Todavía no hay versiones publicadas.</p> : (tpl.versions || []).map(v => (
                                <div key={v.id} className="border border-gray-100 rounded-xl">
                                    <button type="button" onClick={() => setOpenVersion(openVersion === v.id ? null : v.id)} className="w-full text-left px-3 py-2 flex flex-wrap justify-between gap-2 text-sm">
                                        <span><b>v{v.version}</b> <span className="text-gray-500">{v.changelog || 'Sin nota'}</span></span>
                                        <span className="text-xs text-gray-400">{fmtDate(v.createdAt)}</span>
                                    </button>
                                    {openVersion === v.id && <pre className="mx-3 mb-3 p-3 bg-gray-50 rounded-lg text-[12px] whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{v.snapshot?.systemPrompt || ''}</pre>}
                                </div>
                            ))}
                        </section>

                        <section className="bg-white rounded-2xl border border-gray-100 p-4 text-xs text-gray-500 space-y-1">
                            <p className="text-sm font-black text-gray-800">Origen</p>
                            <p>{meta.origins[tpl.origin] || tpl.origin} · clave <code>{tpl.key}</code></p>
                            {src.kind === 'agency' && (
                                <p>Fuente: <a className="text-rotary-blue inline-flex items-center gap-1 hover:underline" href={`https://github.com/${src.owner}/${src.repo}/blob/${src.ref}/${src.path}`} target="_blank" rel="noopener noreferrer">{src.owner}/{src.repo} · {src.path} <ExternalLink className="w-3 h-3" /></a> — licencia {src.license}. Encaja con: {src.fits || '—'}.</p>
                            )}
                            {tpl.legacyAgentId && <p>Agente heredado: al publicar, la tabla de agentes de siempre recibe lo publicado (los clubes conservan lo que personalizaron).</p>}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}
