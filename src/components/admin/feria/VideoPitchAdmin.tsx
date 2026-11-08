// ════════════════════════════════════════════════════════════════════
// Video Pitch — Postulación de Proyectos (v4.1293.0)
//
// Pestaña del módulo donde el comité gestiona las solicitudes de Video Pitch
// Profesional que los clubes envían desde «Mi proyecto»:
//
//   · BANDEJA: indicadores de la edición, búsqueda, filtros, ordenamiento,
//     paginación, selección múltiple para asignar responsable o avanzar estados
//     compatibles, y exportación CSV.
//   · FICHA (cajón lateral): el proyecto y lo que el club escribió, la galería
//     de materiales (lectura firmada), el EDITOR DE GUIONES —generar con IA
//     sobre el expediente real, elegir idioma, duración, tono e instrucciones,
//     regenerar una escena, editar a mano, versionar, comparar, enviar al club
//     y aprobar—, la PRODUCCIÓN (subir el video final y la miniatura, cambiar de
//     estado con lo que cada destino exige) y el HISTORIAL con notas internas
//     y mensajes al club.
//
// Los permisos llegan del servidor (`access`): sin `manage` la pantalla es de
// lectura. El servidor los vuelve a validar en cada petición.
//
// Todo componente de este archivo vive en el ámbito del MÓDULO (v4.971).
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Clapperboard, CreditCard, Download, ExternalLink, FileSpreadsheet, FileText,
    GitCompare, History, Image as ImageIcon, Loader2, MessageSquare, PlayCircle, Plus, RefreshCw, Save, Search, Send, Settings, ShieldCheck, Sparkles,
    Trash2, Upload, UserCheck, Video, Wand2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { leerJson } from '../../../lib/leerJson';
import {
    VP_API, vpFmtDateTime, vpFmtSeconds, vpPutWithProgress, vpReadMediaMeta, vpTone,
    type VpCatalog, type VpCommercial, type VpEvent, type VpFile, type VpOrder, type VpPlan, type VpRequest, type VpScene, type VpScript, type VpScriptContent, type VpStatus, type VpStatusMeta,
} from '../../../lib/videoPitch';

const BLUE = '#17458F';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });
const timeoutSignal = () => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(60_000) : undefined);

// ── Tipos ────────────────────────────────────────────────────────────
interface Row {
    id: string; number: string | null; status: VpStatus; statusLabel: string; statusTone: string; submissionId: string; publicRef: string;
    projectName: string; clubName: string; district: string; responsibleName: string; email: string; whatsapp: string;
    language: string; objective: string; materialCount: number; scriptCount: number; assigneeId: string | null; assigneeName: string | null;
    hasApprovedScript: boolean; hasDeliverable: boolean; completionPct: number; projectStateLabel: string;
    submittedAt: string | null; deliveredAt: string | null; createdAt: string; updatedAt: string;
    // v4.1296 — capa comercial
    commercialStatus: string; commercialLabel: string; commercialTone: string; planName: string | null; amount: number | null; currency: string | null; paidAt: string | null; paymentWaived: boolean;
}
interface Access { view: boolean; comment: boolean; manage: boolean; export: boolean; remove: boolean; config?: boolean }
interface ListResponse {
    rows: Row[]; total: number; page: number; pageSize: number;
    kpis: Record<string, number>;
    filters: { statuses: VpStatusMeta[]; districts: string[]; assignees: string[] };
    access: Access; catalog: VpCatalog; transitions: Record<string, VpStatus[]>;
}
interface Detail {
    request: VpRequest;
    commercial: VpCommercial; orders: VpOrder[];
    submission: { id: string; publicRef: string; projectName: string; clubName: string; district: string; responsible: string; email: string; phone: string | null; focusAreaLabel: string | null; budgetUsd: number | null; projectDescription: string; projectStateLabel: string; hasMasterForm: boolean };
    files: VpFile[]; scripts: VpScript[]; events: VpEvent[];
    notifications: { kind: string; recipient: string; status: string; error: string | null; createdAt: string }[];
    dossier: string[];
    allowedTransitions: { key: VpStatus; label: string; requirement: string | null }[];
    access: Access; catalog: VpCatalog;
}

const KPI_LABELS: [string, string][] = [
    ['total', 'Total'], ['new', 'Nuevas'], ['pending_payment', 'Pendientes de pago'], ['paid', 'Pagadas'], ['pending_info', 'Pendientes de información'], ['pending_script', 'Pendientes de guion'],
    ['in_production', 'En producción'], ['delivered', 'Entregadas'],
];
const fmtMoney = (n: number | null | undefined, cur?: string | null) => (n === null || n === undefined ? '—' : cur === 'COP' ? `$${Math.round(n).toLocaleString('es-CO')} COP` : `USD ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);

const api = async <T,>(path: string, init: RequestInit = {}): Promise<{ res: Response; data: T | null }> => {
    const res = await fetch(`${VP_API}${path}`, { ...init, headers: { ...(init.body ? jsonHeaders() : authHeaders()), ...(init.headers || {}) }, signal: timeoutSignal() });
    const { data } = await leerJson<T>(res);
    return { res, data };
};
const withEvento = (path: string, eventId: string) => `${path}${path.includes('?') ? '&' : '?'}evento=${encodeURIComponent(eventId || '')}`;

// ── Piezas ───────────────────────────────────────────────────────────
const Badge = ({ label, tone }: { label: string; tone?: string }) => {
    const t = vpTone(tone);
    return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${t.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} /> {label}</span>;
};
const Card = ({ title, icon: Icon, right, children }: { title: string; icon: any; right?: React.ReactNode; children: React.ReactNode }) => (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Icon size={16} style={{ color: BLUE }} /> {title}</h3>
            {right}
        </div>
        {children}
    </section>
);
const Btn = ({ children, onClick, disabled, kind = 'secondary', title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; kind?: 'primary' | 'secondary' | 'danger' | 'success'; title?: string }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            kind === 'primary' ? 'text-white hover:opacity-90' : kind === 'danger' ? 'border border-red-200 text-red-700 hover:bg-red-50' : kind === 'success' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
        style={kind === 'primary' ? { background: BLUE } : undefined}>
        {children}
    </button>
);
const FileIcon = ({ kind }: { kind: VpFile['kind'] }) => (kind === 'video' ? <Video size={16} /> : kind === 'image' ? <ImageIcon size={16} /> : <FileText size={16} />);

const useSignedOpen = (requestId: string, eventId: string) => useCallback(async (file: VpFile, download = false) => {
    const { res, data } = await api<{ url?: string; error?: string }>(withEvento(`/project-fair/admin/video-pitch/${requestId}/files/${file.id}/url${download ? '?download=1' : ''}`, eventId));
    if (!res.ok || !data?.url) { toast.error(data?.error || 'No se pudo abrir el archivo'); return null; }
    if (download) window.location.assign(data.url); else window.open(data.url, '_blank', 'noopener');
    return data.url;
}, [requestId, eventId]);

// ── Galería ──────────────────────────────────────────────────────────
const Gallery = ({ detail, eventId, onDelete }: { detail: Detail; eventId: string; onDelete: (f: VpFile) => void }) => {
    const open = useSignedOpen(detail.request.id, eventId);
    const materials = detail.files.filter(f => f.role === 'material' && !f.deletedAt);
    const removed = detail.files.filter(f => f.deletedAt);
    return (
        <Card title={`Materiales del club (${materials.length})`} icon={ImageIcon}>
            {!materials.length && <p className="text-sm text-slate-400">El club no adjuntó materiales.</p>}
            <ul className="grid gap-2 sm:grid-cols-2">
                {materials.map(f => (
                    <li key={f.id} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                        <button type="button" onClick={() => open(f)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg" style={{ background: `${BLUE}12`, color: BLUE }}><FileIcon kind={f.kind} /></button>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-800" title={f.fileName}>{f.fileName}</p>
                            <p className="text-[12px] text-slate-500">{f.kindLabel} · {f.sizeLabel}{f.width && f.height ? ` · ${f.width}×${f.height}` : ''}{f.durationSec ? ` · ${vpFmtSeconds(f.durationSec)}` : ''}</p>
                            {f.caption && <p className="text-[12px] italic text-slate-600">{f.caption}</p>}
                            {f.warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-[11px] text-amber-700"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {w}</p>)}
                            <div className="mt-1 flex gap-2">
                                <button type="button" onClick={() => open(f, true)} className="text-[11px] font-semibold hover:underline" style={{ color: BLUE }}>Descargar</button>
                                <span className="text-[11px] text-slate-300">·</span>
                                <code className="text-[10px] text-slate-400">{f.id.slice(0, 8)}</code>
                            </div>
                        </div>
                        {detail.access.manage && <button type="button" onClick={() => onDelete(f)} className="self-start rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Quitar"><Trash2 size={14} /></button>}
                    </li>
                ))}
            </ul>
            {removed.length > 0 && <p className="mt-3 text-[11px] text-slate-400">{removed.length} archivo(s) retirado(s) quedan en el historial.</p>}
        </Card>
    );
};

// ── Editor de guiones ────────────────────────────────────────────────
const SceneEditor = ({ scene, files, onChange, onRegenerate, busy, readOnly }: { scene: VpScene; files: VpFile[]; onChange: (s: VpScene) => void; onRegenerate: () => void; busy: boolean; readOnly: boolean }) => {
    const words = scene.narration.trim().split(/\s+/).filter(Boolean).length;
    const maxWords = Math.ceil((scene.durationSec / 60) * 140 * 1.15);
    const toggle = (id: string) => onChange({ ...scene, materials: scene.materials.includes(id) ? scene.materials.filter(x => x !== id) : [...scene.materials, id] });
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">Escena {scene.number} · {scene.title}</p>
                <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-500">Duración
                        <input type="number" min={5} max={120} value={scene.durationSec} disabled={readOnly} onChange={e => onChange({ ...scene, durationSec: Number(e.target.value) || 0 })} className="ml-1 w-14 rounded border border-slate-300 px-1.5 py-0.5 text-[12px]" /> s
                    </label>
                    {!readOnly && <Btn onClick={onRegenerate} disabled={busy} title="Volver a escribir sólo esta escena con IA">{busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Regenerar</Btn>}
                </div>
            </div>
            <label className="mt-3 block text-[11px] font-semibold text-slate-500">Narración <span className={words > maxWords ? 'text-red-600' : 'text-slate-400'}>({words} palabras · caben ~{maxWords})</span></label>
            <textarea value={scene.narration} disabled={readOnly} onChange={e => onChange({ ...scene, narration: e.target.value })} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-white" />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                    <label className="block text-[11px] font-semibold text-slate-500">Recomendación visual</label>
                    <textarea value={scene.visual} disabled={readOnly} onChange={e => onChange({ ...scene, visual: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] disabled:bg-white" />
                </div>
                <div>
                    <label className="block text-[11px] font-semibold text-slate-500">Texto sugerido en pantalla</label>
                    <input value={scene.onScreenText} disabled={readOnly} onChange={e => onChange({ ...scene, onScreenText: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] disabled:bg-white" />
                    <label className="mt-2 block text-[11px] font-semibold text-slate-500">Observaciones de producción</label>
                    <input value={scene.notes} disabled={readOnly} onChange={e => onChange({ ...scene, notes: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] disabled:bg-white" />
                </div>
            </div>
            <div className="mt-2">
                <p className="text-[11px] font-semibold text-slate-500">Materiales para esta escena</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    {files.filter(f => f.role === 'material' && !f.deletedAt).map(f => (
                        <button key={f.id} type="button" disabled={readOnly} onClick={() => toggle(f.id)} title={f.fileName}
                            className={`inline-flex max-w-[180px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${scene.materials.includes(f.id) ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-300 bg-white text-slate-600'}`}>
                            <FileIcon kind={f.kind} /> <span className="truncate">{f.fileName}</span>
                        </button>
                    ))}
                    {!files.some(f => f.role === 'material' && !f.deletedAt) && <span className="text-[11px] text-slate-400">Sin materiales adjuntos: la escena dice qué grabar.</span>}
                </div>
            </div>
        </div>
    );
};

const ScriptCompare = ({ a, b }: { a: VpScript; b: VpScript }) => (
    <div className="grid gap-3 sm:grid-cols-2">
        {[a, b].map(s => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-bold text-slate-700">Versión {s.versionNumber} · {s.source === 'ai' ? 'IA' : 'Manual'} · {vpFmtSeconds(s.totalSeconds)}</p>
                <ol className="mt-2 space-y-2">
                    {s.content.scenes.map(sc => (
                        <li key={sc.number} className="text-[12px]">
                            <p className="font-semibold text-slate-600">{sc.number}. {sc.title} ({sc.durationSec} s)</p>
                            <p className="whitespace-pre-wrap text-slate-800">{sc.narration}</p>
                        </li>
                    ))}
                </ol>
            </div>
        ))}
    </div>
);

const ScriptEditor = ({ detail, eventId, onUpdated }: { detail: Detail; eventId: string; onUpdated: (d: Detail) => void }) => {
    const { request, scripts, files, catalog, access } = detail;
    const answersLang = request.answers.preferences.language || 'es';
    const [language, setLanguage] = useState(answersLang);
    const [tone, setTone] = useState('inspiring');
    const [targetSeconds, setTargetSeconds] = useState(catalog.targetSecondsDefault);
    const [instructions, setInstructions] = useState('');
    const [provider, setProvider] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(request.currentScriptId || scripts[0]?.id || null);
    const [compareId, setCompareId] = useState<string | null>(null);
    const [draft, setDraft] = useState<VpScriptContent | null>(null);
    const [note, setNote] = useState('');
    const selected = scripts.find(s => s.id === selectedId) || null;
    const compare = scripts.find(s => s.id === compareId) || null;

    useEffect(() => { setSelectedId(request.currentScriptId || scripts[0]?.id || null); }, [request.currentScriptId, scripts.length]);
    useEffect(() => { setDraft(selected ? JSON.parse(JSON.stringify(selected.content)) : null); }, [selected?.id]);

    const dirty = useMemo(() => Boolean(selected && draft && JSON.stringify({ ...selected.content, audit: null, note: null }) !== JSON.stringify({ ...draft, audit: null, note: null })), [selected, draft]);
    const canGenerate = access.manage && !['draft', 'cancelled'].includes(request.status);
    const readOnly = !access.manage || selected?.status === 'approved';

    const post = async (path: string, body: any, label: string) => {
        setBusy(label);
        try {
            const { res, data } = await api<Detail & { error?: string }>(withEvento(`/project-fair/admin/video-pitch/${request.id}${path}`, eventId), { method: 'POST', body: JSON.stringify(body) });
            if (!res.ok || !data?.request) throw new Error((data as any)?.error || 'No se pudo completar la acción');
            onUpdated(data);
            return data;
        } catch (e: any) {
            toast.error(e?.message || 'Error');
            return null;
        } finally {
            setBusy(null);
        }
    };

    const generate = async () => {
        const d = await post('/scripts/generate', { language, tone, targetSeconds, instructions, provider: provider || undefined, basedOnId: selected?.id || undefined }, 'generate');
        if (d) { toast.success(`Guion generado (versión ${d.scripts[0]?.versionNumber})`); setSelectedId(d.request.currentScriptId); }
    };
    const regenerateScene = async (n: number) => {
        if (!selected) return;
        if (dirty && !window.confirm('Tienes cambios sin guardar en esta versión. ¿Regenerar la escena de todos modos?')) return;
        const d = await post('/scripts/generate', { language: selected.language || language, tone: selected.tone || tone, targetSeconds: selected.targetSeconds || targetSeconds, instructions, scene: n, basedOnId: selected.id }, `scene-${n}`);
        if (d) { toast.success(`Escena ${n} regenerada`); setSelectedId(d.request.currentScriptId); }
    };
    const saveManual = async () => {
        if (!draft || !selected) return;
        const d = await post('/scripts', { content: draft, basedOnId: selected.id, note }, 'save');
        if (d) { toast.success('Guardado como versión nueva'); setNote(''); setSelectedId(d.request.currentScriptId); }
    };
    const send = async () => {
        if (!selected) return;
        if (dirty) { toast.error('Guarda los cambios antes de enviar el guion al club.'); return; }
        if (!window.confirm(`¿Enviar la versión ${selected.versionNumber} al club para su aprobación? Recibirá un correo.`)) return;
        const d = await post(`/scripts/${selected.id}/send`, {}, 'send');
        if (d) toast.success('Guion enviado al club');
    };
    const approve = async () => {
        if (!selected) return;
        if (dirty) { toast.error('Guarda los cambios antes de aprobar.'); return; }
        if (!window.confirm(`¿Aprobar la versión ${selected.versionNumber} como guion definitivo?`)) return;
        const d = await post(`/scripts/${selected.id}/approve`, {}, 'approve');
        if (d) toast.success('Guion aprobado');
    };
    const makeCurrent = async () => {
        if (!selected) return;
        const d = await post(`/scripts/${selected.id}/current`, {}, 'current');
        if (d) toast.success(`Versión ${selected.versionNumber} vigente`);
    };

    return (
        <div className="space-y-4">
            {access.manage && (
                <Card title="Generar guion con IA" icon={Sparkles}>
                    {!canGenerate && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">La solicitud todavía no se envió o está cancelada.</p>}
                    <div className="grid gap-3 sm:grid-cols-4">
                        <label className="text-[11px] font-semibold text-slate-500">Idioma
                            <select value={language} onChange={e => setLanguage(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal">
                                {catalog.languages.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                            </select>
                        </label>
                        <label className="text-[11px] font-semibold text-slate-500">Tono
                            <select value={tone} onChange={e => setTone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal">
                                {catalog.tones.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                            </select>
                        </label>
                        <label className="text-[11px] font-semibold text-slate-500">Duración objetivo: {vpFmtSeconds(targetSeconds)}
                            <input type="range" min={60} max={catalog.targetSecondsMax} step={10} value={targetSeconds} onChange={e => setTargetSeconds(Number(e.target.value))} className="mt-2 w-full" />
                        </label>
                        <label className="text-[11px] font-semibold text-slate-500">Motor
                            <select value={provider} onChange={e => setProvider(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal">
                                <option value="">El de la plataforma</option>
                                <option value="gemini">Google Gemini</option>
                                <option value="openai">OpenAI</option>
                                <option value="anthropic">Anthropic</option>
                            </select>
                        </label>
                    </div>
                    <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2} placeholder="Instrucciones personalizadas (opcional): énfasis, lo que no debe decirse, aliados que mencionar…" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Btn kind="primary" onClick={generate} disabled={!canGenerate || busy !== null}>{busy === 'generate' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {scripts.length ? 'Regenerar guion completo' : 'Generar guion inicial'}</Btn>
                        <span className="text-[11px] text-slate-500">La IA trabaja sólo con el expediente del proyecto y los materiales adjuntos; lo que falte lo señala.</span>
                    </div>
                </Card>
            )}

            <Card title={`Versiones (${scripts.length})`} icon={History} right={scripts.length > 1 ? (
                <label className="flex items-center gap-1 text-[11px] text-slate-500"><GitCompare size={12} /> Comparar con
                    <select value={compareId || ''} onChange={e => setCompareId(e.target.value || null)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[12px]">
                        <option value="">—</option>
                        {scripts.filter(s => s.id !== selectedId).map(s => <option key={s.id} value={s.id}>v{s.versionNumber}</option>)}
                    </select>
                </label>
            ) : undefined}>
                {!scripts.length && <p className="text-sm text-slate-400">Todavía no hay guion. Genera el primero con IA.</p>}
                <div className="flex flex-wrap gap-2">
                    {scripts.map(s => (
                        <button key={s.id} type="button" onClick={() => { setSelectedId(s.id); setCompareId(null); }}
                            className={`rounded-lg border px-3 py-1.5 text-left text-[12px] ${s.id === selectedId ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                            <p className="font-bold text-slate-800">v{s.versionNumber} {s.approved ? '✓ aprobado' : s.current ? '· vigente' : ''}</p>
                            <p className="text-slate-500">{s.source === 'ai' ? `IA${s.model ? ` · ${s.model}` : ''}` : 'Manual'} · {vpFmtSeconds(s.totalSeconds)} · {vpFmtDateTime(s.createdAt)}</p>
                        </button>
                    ))}
                </div>
                {selected && compare && <div className="mt-4"><ScriptCompare a={selected} b={compare} /></div>}
            </Card>

            {selected && draft && !compare && (
                <Card title={`Guion · versión ${selected.versionNumber}${selected.approved ? ' (aprobado)' : selected.status === 'sent_to_participant' ? ' (en manos del club)' : ''}`} icon={FileText}
                    right={<span className="text-[11px] text-slate-500">Total {vpFmtSeconds(draft.scenes.reduce((a, s) => a + s.durationSec, 0))} · objetivo {vpFmtSeconds(draft.targetSeconds)}</span>}>
                    {selected.content.audit && !selected.content.audit.ok && (
                        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900"><AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            Cifras que no aparecen en el expediente: {selected.content.audit.suspicious.map(s => `«${s.value}» (escena ${s.scene})`).join(', ')}. Verifícalas con el club antes de aprobar.</p>
                    )}
                    {draft.missingInfo?.length > 0 && (
                        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                            <p className="font-bold">La IA señala información que falta:</p>
                            <ul className="mt-1 list-disc pl-5">{draft.missingInfo.map((m, i) => <li key={i}>{m}</li>)}</ul>
                        </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                        <input value={draft.title} disabled={readOnly} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Título del video" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:bg-white" />
                        <input value={draft.summary} disabled={readOnly} onChange={e => setDraft({ ...draft, summary: e.target.value })} placeholder="Resumen en una línea" className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-white" />
                    </div>
                    <div className="mt-3 space-y-3">
                        {draft.scenes.map(sc => (
                            <SceneEditor key={sc.number} scene={sc} files={files} readOnly={readOnly} busy={busy === `scene-${sc.number}`}
                                onChange={s => setDraft({ ...draft, scenes: draft.scenes.map(x => (x.number === s.number ? s : x)) })}
                                onRegenerate={() => regenerateScene(sc.number)} />
                        ))}
                    </div>
                    {access.manage && (
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                            {!readOnly && <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nota de la versión (opcional)" className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs" />}
                            {!readOnly && <Btn onClick={saveManual} disabled={!dirty || busy !== null}>{busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar como versión nueva</Btn>}
                            {!selected.current && <Btn onClick={makeCurrent} disabled={busy !== null}><RefreshCw size={13} /> Hacer vigente</Btn>}
                            {!selected.approved && <Btn onClick={send} disabled={busy !== null || dirty}>{busy === 'send' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar al club</Btn>}
                            {!selected.approved && <Btn kind="success" onClick={approve} disabled={busy !== null || dirty}>{busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Aprobar</Btn>}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

// ── Producción y entrega ─────────────────────────────────────────────
const Production = ({ detail, eventId, onUpdated }: { detail: Detail; eventId: string; onUpdated: (d: Detail) => void }) => {
    const { request, files, access, allowedTransitions, catalog } = detail;
    const open = useSignedOpen(request.id, eventId);
    const [pct, setPct] = useState<number | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [target, setTarget] = useState<VpStatus | ''>('');
    const deliverable = files.find(f => f.id === request.deliverableFileId) || null;
    const thumbnail = files.find(f => f.id === request.thumbnailFileId) || null;
    const previous = files.filter(f => f.role === 'deliverable' && f.id !== request.deliverableFileId && !f.deletedAt);

    const upload = async (file: File, role: 'deliverable' | 'thumbnail') => {
        setBusy(role); setPct(0);
        try {
            const pre = await api<{ uploadUrl?: string; storageKey?: string; contentType?: string; error?: string }>(withEvento(`/project-fair/admin/video-pitch/${request.id}/files/presign`, eventId), { method: 'POST', body: JSON.stringify({ filename: file.name, size: file.size, role }) });
            if (!pre.res.ok || !pre.data?.uploadUrl) throw new Error(pre.data?.error || 'No se pudo preparar la subida');
            await vpPutWithProgress(pre.data.uploadUrl, file, pre.data.contentType || file.type, setPct);
            const meta = await vpReadMediaMeta(file);
            const reg = await api<Detail & { error?: string }>(withEvento(`/project-fair/admin/video-pitch/${request.id}/files`, eventId), { method: 'POST', body: JSON.stringify({ storageKey: pre.data.storageKey, filename: file.name, role, ...meta }) });
            if (!reg.res.ok || !reg.data?.request) throw new Error((reg.data as any)?.error || 'El servidor no aceptó el archivo');
            onUpdated(reg.data);
            toast.success(role === 'deliverable' ? 'Video final cargado' : 'Miniatura cargada');
        } catch (e: any) {
            toast.error(e?.message || 'Error al subir');
        } finally {
            setBusy(null); setPct(null);
        }
    };

    const changeStatus = async () => {
        if (!target) return;
        const t = allowedTransitions.find(x => x.key === target);
        if (t?.requirement) { toast.error(t.requirement); return; }
        if (target === 'info_required' && !note.trim()) { toast.error('Indica qué información necesitas del club.'); return; }
        if (!window.confirm(`¿Cambiar el estado a «${t?.label}»?${['submitted', 'info_required', 'script_pending_approval', 'script_approved', 'in_production', 'finished', 'delivered'].includes(target) ? ' El club recibirá un correo.' : ''}`)) return;
        setBusy('status');
        try {
            const { res, data } = await api<Detail & { error?: string }>(withEvento(`/project-fair/admin/video-pitch/${request.id}/status`, eventId), { method: 'POST', body: JSON.stringify({ status: target, note }) });
            if (!res.ok || !data?.request) throw new Error((data as any)?.error || 'No se pudo cambiar el estado');
            onUpdated(data); setNote(''); setTarget('');
            toast.success(`Estado: ${data.request.statusLabel}`);
        } catch (e: any) {
            toast.error(e?.message);
        } finally {
            setBusy(null);
        }
    };

    const pickFile = (role: 'deliverable' | 'thumbnail', accept: string) => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = accept;
        input.onchange = () => { const f = input.files?.[0]; if (f) upload(f, role); };
        input.click();
    };

    return (
        <div className="space-y-4">
            <Card title="Estado de la solicitud" icon={Clapperboard} right={<Badge label={request.statusLabel} tone={request.statusTone} />}>
                {access.manage ? (
                    <>
                        <div className="flex flex-wrap gap-2">
                            {allowedTransitions.map(t => (
                                <button key={t.key} type="button" onClick={() => setTarget(t.key)} title={t.requirement || undefined}
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${target === t.key ? 'border-blue-400 bg-blue-50 text-blue-900' : t.requirement ? 'border-slate-200 text-slate-400' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                                    → {t.label}{t.requirement ? ' 🔒' : ''}
                                </button>
                            ))}
                            {!allowedTransitions.length && <span className="text-xs text-slate-400">Estado final.</span>}
                        </div>
                        {target && (
                            <div className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
                                {allowedTransitions.find(t => t.key === target)?.requirement && <p className="text-[12px] text-amber-700">{allowedTransitions.find(t => t.key === target)?.requirement}</p>}
                                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder={target === 'info_required' ? 'Qué información o materiales necesita el comité (lo verá el club)' : 'Nota para el historial (opcional; el club la ve si recibe aviso)'} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                <div className="flex gap-2">
                                    <Btn kind="primary" onClick={changeStatus} disabled={busy !== null || Boolean(allowedTransitions.find(t => t.key === target)?.requirement)}>{busy === 'status' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Aplicar</Btn>
                                    <Btn onClick={() => { setTarget(''); setNote(''); }}>Cancelar</Btn>
                                </div>
                            </div>
                        )}
                    </>
                ) : <p className="text-sm text-slate-500">Tu perfil puede consultar, no gestionar.</p>}
            </Card>

            <Card title="Video final" icon={PlayCircle} right={deliverable ? <span className="text-[11px] text-emerald-700">Cargado</span> : <span className="text-[11px] text-slate-400">Pendiente</span>}>
                <p className="mb-3 text-[12px] text-slate-500">La primera versión del módulo produce el video fuera de la plataforma (edición, voz, subtítulos, música autorizada e identidad gráfica). Aquí se carga el archivo terminado para revisarlo y entregarlo al club. MP4 o MOV, hasta {catalog.limits.video} MB.</p>
                {deliverable && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                        <Video size={18} className="text-emerald-700" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-800">{deliverable.fileName}</p>
                            <p className="text-[12px] text-slate-500">{deliverable.sizeLabel}{deliverable.width ? ` · ${deliverable.width}×${deliverable.height}` : ''}{deliverable.durationSec ? ` · ${vpFmtSeconds(deliverable.durationSec)}` : ''} · {deliverable.uploadedBy} · {vpFmtDateTime(deliverable.createdAt)}</p>
                        </div>
                        <Btn onClick={() => open(deliverable)}><PlayCircle size={13} /> Ver</Btn>
                        <Btn onClick={() => open(deliverable, true)}><Download size={13} /> Descargar</Btn>
                    </div>
                )}
                {access.manage && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Btn kind="primary" onClick={() => pickFile('deliverable', '.mp4,.mov')} disabled={busy !== null}>{busy === 'deliverable' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {deliverable ? 'Reemplazar video final' : 'Subir video final'}</Btn>
                        <Btn onClick={() => pickFile('thumbnail', '.jpg,.jpeg,.png')} disabled={busy !== null}>{busy === 'thumbnail' ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} {thumbnail ? 'Cambiar miniatura' : 'Miniatura'}</Btn>
                        {pct !== null && <span className="text-xs font-bold text-slate-600">{pct}%</span>}
                    </div>
                )}
                {pct !== null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: BLUE }} /></div>}
                {thumbnail && <p className="mt-2 text-[12px] text-slate-500">Miniatura: {thumbnail.fileName} <button type="button" onClick={() => open(thumbnail)} className="font-semibold hover:underline" style={{ color: BLUE }}>ver</button></p>}
                {previous.length > 0 && <p className="mt-2 text-[11px] text-slate-400">{previous.length} versión(es) anterior(es) del video se conservan: {previous.map(p => p.fileName).join(', ')}.</p>}
                {request.status === 'delivered' && <p className="mt-3 flex items-center gap-1.5 text-[12px] text-emerald-700"><CheckCircle2 size={13} /> Entregado el {vpFmtDateTime(request.deliveredAt)}: el club ya puede verlo y descargarlo.</p>}
            </Card>
        </div>
    );
};

// ── Plan y pago (v4.1296) ────────────────────────────────────────────
const CommercePanel = ({ detail, eventId, onUpdated }: { detail: Detail; eventId: string; onUpdated: () => void }) => {
    const { commercial, orders, access, request } = detail;
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState<null | 'waive' | 'sync'>(null);
    const post = async (path: string, body: any, label: 'waive' | 'sync') => {
        setBusy(label);
        try {
            const { res, data } = await api<{ error?: string; outcome?: string }>(withEvento(`/project-fair/admin/video-pitch/${request.id}${path}`, eventId), { method: 'POST', body: JSON.stringify(body) });
            if (!res.ok) throw new Error(data?.error || 'No se pudo completar');
            if (label === 'sync') toast.success(data?.outcome === 'paid' ? 'Pago confirmado por Stripe' : `Stripe: ${data?.outcome || 'sin cambios'}`);
            else toast.success('Producción autorizada sin pago');
            onUpdated();
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(null); }
    };
    const o = commercial.order;
    return (
        <div className="space-y-4">
            <Card title="Plan contratado y estado del pago" icon={CreditCard} right={<Badge label={commercial.label} tone={commercial.tone} />}>
                {o ? (
                    <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                        <div><dt className="font-semibold text-slate-500">Plan</dt><dd className="text-slate-800">{o.planName} <span className="text-slate-400">({o.planCode}{o.snapshot?.deliverables?.length ? ` · ${o.snapshot.deliverables.join(' + ')}` : ''})</span></dd></div>
                        <div><dt className="font-semibold text-slate-500">Precio contratado</dt><dd className="text-slate-800">{o.amountLabel} <span className="text-[11px] text-slate-400">fotografía al elegir el plan; cambiar el catálogo no la mueve</span></dd></div>
                        <div><dt className="font-semibold text-slate-500">Estado de la orden</dt><dd className="text-slate-800">{o.statusLabel}{o.paidAt ? ` · ${vpFmtDateTime(o.paidAt)}` : ''}</dd></div>
                        <div><dt className="font-semibold text-slate-500">Referencias de Stripe</dt><dd className="break-all font-mono text-[11px] text-slate-600">{o.stripePaymentIntentId || o.stripeSessionId || '—'}{o.stripeChargeId ? ` · ${o.stripeChargeId}` : ''}</dd></div>
                        {o.failureMessage && <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Último fallo</dt><dd className="text-red-700">{o.failureMessage}{o.failureCode ? ` (${o.failureCode})` : ''}</dd></div>}
                        {o.receiptUrl && <div className="sm:col-span-2"><a href={o.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold hover:underline" style={{ color: BLUE }}><ExternalLink size={13} /> Comprobante de Stripe</a></div>}
                        {o.snapshot?.features?.length > 0 && <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Características contratadas</dt><dd><ul className="mt-1 list-disc pl-5 text-slate-700">{o.snapshot.features.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></dd></div>}
                    </dl>
                ) : <p className="text-sm text-slate-500">El club todavía no eligió un plan.</p>}
                {commercial.paymentWaived && <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-[12px] text-violet-900"><ShieldCheck size={13} className="mt-0.5 shrink-0" /> Producción autorizada sin pago por {request.paymentWaivedBy || 'un administrador'}: {request.paymentWaivedNote}</p>}
                {access.manage && (
                    <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-slate-200 pt-4">
                        {o && ['pending_payment', 'processing', 'failed'].includes(o.status) && <Btn onClick={() => post('/payment/sync', {}, 'sync')} disabled={busy !== null}>{busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Consultar a Stripe</Btn>}
                        {!commercial.paymentWaived && commercial.status !== 'paid' && (
                            <div className="flex min-w-[260px] flex-1 flex-col gap-2 rounded-lg bg-slate-50 p-3">
                                <p className="text-[12px] font-semibold text-slate-700">Autorizar la producción sin pago confirmado</p>
                                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Motivo (obligatorio, queda en el historial)" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs" />
                                <div><Btn kind="danger" onClick={() => { if (note.trim() && window.confirm('¿Autorizar la producción sin pago? Queda registrado con tu nombre.')) post('/payment/waive', { note }, 'waive'); }} disabled={busy !== null || !note.trim()}>{busy === 'waive' ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Autorizar sin pago</Btn></div>
                            </div>
                        )}
                    </div>
                )}
            </Card>
            <Card title={`Historial de órdenes (${orders.length})`} icon={History}>
                {!orders.length && <p className="text-sm text-slate-400">Sin órdenes.</p>}
                <ul className="space-y-2 text-[12px]">
                    {orders.map(x => (
                        <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                            <span className="font-semibold text-slate-800">{x.planName}</span>
                            <span className="text-slate-600">{x.amountLabel}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${x.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : x.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : x.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{x.statusLabel}</span>
                            <span className="text-slate-400">{vpFmtDateTime(x.createdAt)}</span>
                            {x.cancelReason && <span className="text-slate-400">· {x.cancelReason}</span>}
                            {x.paidAt && <span className="text-emerald-700">· pagada {vpFmtDateTime(x.paidAt)}</span>}
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
};

// ── Configuración de planes (v4.1296) ────────────────────────────────
const EMPTY_PLAN: Partial<VpPlan> = { code: '', name: '', description: '', badge: '', priceAmount: 0, currency: 'USD', features: [], deliverables: ['16:9'], maxDurationSec: 180, revisionRounds: 3, sortOrder: 0, active: true, creditsIncluded: 0, creditsBreakdown: [] };

const PlanEditor = ({ plan, formats, currencies, creditStages, onSaved, onCancel }: { plan: Partial<VpPlan>; formats: { key: string; label: string }[]; currencies: string[]; creditStages: { key: string; label: string; hint: string }[]; onSaved: () => void; onCancel?: () => void }) => {
    const [draft, setDraft] = useState<Partial<VpPlan>>(plan);
    const [featuresText, setFeaturesText] = useState((plan.features || []).join('\n'));
    // v4.1297 — reparto de créditos por etapa (porcentajes; el servidor los normaliza a 100).
    const [shares, setShares] = useState<Record<string, number>>(() => Object.fromEntries(creditStages.map(s => [s.key, (plan.creditsBreakdown || []).find(b => b.key === s.key)?.share || 0])));
    const sharesTotal = Object.values(shares).reduce((a, b) => a + (Number(b) || 0), 0);
    const [busy, setBusy] = useState(false);
    const isNew = !plan.id;
    const save = async () => {
        setBusy(true);
        try {
            const body = { ...draft, features: featuresText.split('\n').map(f => f.trim()).filter(Boolean), creditsBreakdown: creditStages.map(s => ({ key: s.key, share: Number(shares[s.key]) || 0 })).filter(b => b.share > 0) };
            const { res, data } = await api<{ error?: string; newVersion?: boolean }>(isNew ? '/project-fair/admin/video-pitch/plans' : `/project-fair/admin/video-pitch/plans/${plan.id}`, { method: isNew ? 'POST' : 'PUT', body: JSON.stringify(body) });
            if (!res.ok) throw new Error(data?.error || 'No se pudo guardar');
            toast.success(isNew ? 'Plan creado' : data?.newVersion ? 'Plan guardado: versión nueva (las órdenes anteriores conservan su precio)' : 'Plan guardado');
            onSaved();
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
    };
    const field = (label: string, el: React.ReactNode, span = false) => <label className={`text-[11px] font-semibold text-slate-500 ${span ? 'sm:col-span-2' : ''}`}>{label}{el}</label>;
    const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal text-slate-900';
    return (
        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
                {field('Nombre del plan', <input value={draft.name || ''} onChange={e => setDraft({ ...draft, name: e.target.value })} className={input} />)}
                {field('Código interno', <input value={draft.code || ''} disabled={!isNew} onChange={e => setDraft({ ...draft, code: e.target.value })} className={`${input} disabled:bg-slate-100`} placeholder="essential" />)}
                {field('Descripción', <input value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} className={input} />, true)}
                {field('Precio', <input type="number" min={0} step="0.01" value={draft.priceAmount ?? 0} onChange={e => setDraft({ ...draft, priceAmount: Number(e.target.value) })} className={input} />)}
                {field('Moneda', <select value={draft.currency || 'USD'} onChange={e => setDraft({ ...draft, currency: e.target.value })} className={input}>{currencies.map(c => <option key={c} value={c}>{c}</option>)}</select>)}
                {field('Características incluidas (una por línea)', <textarea value={featuresText} onChange={e => setFeaturesText(e.target.value)} rows={6} className={input} />, true)}
                {field('Formatos de entrega', (
                    <div className="mt-1 flex flex-wrap gap-3">
                        {formats.map(f => (
                            <label key={f.key} className="flex items-center gap-1.5 text-sm font-normal text-slate-700">
                                <input type="checkbox" checked={(draft.deliverables || []).includes(f.key)} onChange={e => setDraft({ ...draft, deliverables: e.target.checked ? [...(draft.deliverables || []), f.key] : (draft.deliverables || []).filter(x => x !== f.key) })} /> {f.label}
                            </label>
                        ))}
                    </div>
                ), true)}
                {field('Duración máxima (segundos)', <input type="number" min={30} max={600} value={draft.maxDurationSec ?? 180} onChange={e => setDraft({ ...draft, maxDurationSec: Number(e.target.value) })} className={input} />)}
                {field('Rondas de ajustes', <input type="number" min={0} max={10} value={draft.revisionRounds ?? 3} onChange={e => setDraft({ ...draft, revisionRounds: Number(e.target.value) })} className={input} />)}
                {field('Orden de visualización', <input type="number" min={0} max={99} value={draft.sortOrder ?? 0} onChange={e => setDraft({ ...draft, sortOrder: Number(e.target.value) })} className={input} />)}
                {field('Etiqueta destacada (opcional)', <input value={draft.badge || ''} onChange={e => setDraft({ ...draft, badge: e.target.value })} className={input} placeholder="Recomendado" />)}
                {field('Créditos de producción IA incluidos', <input type="number" min={0} step={50} value={draft.creditsIncluded ?? 0} onChange={e => setDraft({ ...draft, creditsIncluded: Number(e.target.value) })} className={input} />)}
                {field(`Reparto por etapa (porcentajes · suma ${sharesTotal}%${sharesTotal && sharesTotal !== 100 ? ', se normaliza a 100' : ''})`, (
                    <div className="mt-1 grid gap-1.5">
                        {creditStages.map(s => (
                            <div key={s.key} className="flex items-center gap-2 text-sm font-normal text-slate-700" title={s.hint}>
                                <input type="number" min={0} max={100} value={shares[s.key] ?? 0} onChange={e => setShares({ ...shares, [s.key]: Number(e.target.value) })} className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                                <span className="text-[13px]">% {s.label}</span>
                            </div>
                        ))}
                    </div>
                ), true)}
                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2"><input type="checkbox" checked={draft.active !== false} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Plan activo (visible para los clubes)</label>
            </div>
            <div className="mt-3 flex gap-2">
                <Btn kind="primary" onClick={save} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {isNew ? 'Crear plan' : 'Guardar cambios'}</Btn>
                {onCancel && <Btn onClick={onCancel}>Cancelar</Btn>}
            </div>
            {!isNew && <p className="mt-2 text-[11px] text-slate-500">Cambiar el precio o las características crea una versión nueva del plan. Las órdenes ya creadas conservan el precio con el que se compraron.</p>}
        </div>
    );
};

const PlansConfig = () => {
    const [data, setData] = useState<{ plans: VpPlan[]; formats: { key: string; label: string }[]; currencies: string[]; creditStages?: { key: string; label: string; hint: string }[]; access: { config: boolean } } | null>(null);
    const [history, setHistory] = useState<{ id: string; type: string; title: string; actorName: string | null; createdAt: string }[]>([]);
    const [editing, setEditing] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [cleanBusy, setCleanBusy] = useState(false);
    const load = useCallback(async () => {
        const [{ res, data }, hist] = await Promise.all([api<any>('/project-fair/admin/video-pitch/plans'), api<any>('/project-fair/admin/video-pitch/plans/history')]);
        if (!res.ok || !data?.plans) { toast.error(data?.error || 'No se pudo cargar la configuración'); return; }
        setData(data); setHistory(hist.data?.history || []);
    }, []);
    useEffect(() => { load(); }, [load]);
    const cleanup = async () => {
        setCleanBusy(true);
        try {
            const plan = await api<{ candidates: number; hours: number; error?: string }>('/project-fair/admin/video-pitch/maintenance/cleanup', { method: 'POST', body: JSON.stringify({ confirm: false }) });
            if (!plan.res.ok) throw new Error(plan.data?.error || 'No se pudo planear');
            if (!plan.data?.candidates) { toast.success('No hay subidas huérfanas que limpiar'); return; }
            if (!window.confirm(`${plan.data.candidates} subida(s) sin registrar con más de ${plan.data.hours} horas. Sólo se borran objetos que ningún archivo registrado usa. ¿Continuar?`)) return;
            const { res, data } = await api<{ deleted: number; missing: number; error?: string }>('/project-fair/admin/video-pitch/maintenance/cleanup', { method: 'POST', body: JSON.stringify({ confirm: true }) });
            if (!res.ok) throw new Error(data?.error || 'No se pudo limpiar');
            toast.success(`${data?.deleted || 0} objeto(s) borrados · ${data?.missing || 0} ya no existían`);
            load();
        } catch (e: any) { toast.error(e?.message); } finally { setCleanBusy(false); }
    };
    if (!data) return <div className="flex items-center gap-2 py-10 text-slate-500"><Loader2 className="animate-spin" size={18} /> Cargando configuración…</div>;
    const canEdit = data.access.config;
    return (
        <div className="space-y-4">
            <Card title="Planes comerciales" icon={Settings} right={canEdit && !creating ? <Btn kind="primary" onClick={() => setCreating(true)}><Plus size={13} /> Nuevo plan</Btn> : undefined}>
                <p className="mb-4 text-[12px] text-slate-500">Los clubes eligen entre estos planes al solicitar el video. El precio que ven y el que se cobra en Stripe sale de aquí; nunca del navegador. {!canEdit && 'Tu perfil puede consultar, no editar.'}</p>
                {creating && <div className="mb-4"><PlanEditor plan={EMPTY_PLAN} formats={data.formats} currencies={data.currencies} creditStages={data.creditStages || []} onSaved={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} /></div>}
                <div className="grid gap-3 md:grid-cols-2">
                    {data.plans.map(p => (
                        <div key={p.id} className={`rounded-xl border p-4 ${p.active ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
                            {editing === p.id ? (
                                <PlanEditor plan={p} formats={data.formats} currencies={data.currencies} creditStages={data.creditStages || []} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
                            ) : (
                                <>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">{p.name} {p.badge && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: '#F7A81B' }}>{p.badge}</span>} {!p.active && <span className="rounded bg-slate-200 px-1.5 text-[10px] font-bold text-slate-600">Inactivo</span>}</p>
                                            <p className="text-[12px] text-slate-500">{p.code} · {p.description}</p>
                                        </div>
                                        <p className="text-xl font-bold text-slate-900">{p.priceLabel}</p>
                                    </div>
                                    <ul className="mt-3 space-y-1">{p.features.map((f, i) => <li key={i} className="flex items-start gap-1.5 text-[12px] text-slate-700"><CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" /> {f}</li>)}</ul>
                                    <p className="mt-3 text-[11px] text-slate-500">{p.deliverables.join(' + ')} · hasta {Math.round(p.maxDurationSec / 60)} min · {p.revisionRounds} rondas de ajustes · {p.creditsIncluded ? `${p.creditsIncluded.toLocaleString('es-CO')} créditos IA (${p.creditsBreakdown.map(b => `${b.share}% ${b.label.toLowerCase()}`).join(', ')})` : 'sin créditos definidos'} · {p.versions?.length || 0} versión(es) · {p.orders || 0} orden(es), {p.paidOrders || 0} pagada(s)</p>
                                    {canEdit && <div className="mt-3"><Btn onClick={() => setEditing(p.id)}>Editar</Btn></div>}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </Card>
            <Card title="Historial del catálogo" icon={History}>
                {!history.length && <p className="text-sm text-slate-400">Sin cambios registrados.</p>}
                <ul className="space-y-1 text-[12px]">{history.map(h => <li key={h.id} className="flex flex-wrap gap-2"><span className="font-semibold text-slate-700">{h.title}</span><span className="text-slate-400">{h.actorName || ''} · {vpFmtDateTime(h.createdAt)}</span></li>)}</ul>
            </Card>
            {canEdit && (
                <Card title="Mantenimiento" icon={Trash2}>
                    <p className="text-[12px] text-slate-500">Las subidas que el navegador inició pero nunca registró (cerró la pestaña a mitad) quedan en el almacenamiento privado. Esta limpieza sólo borra objetos de más de 48 horas que ningún archivo registrado use; nunca materiales ni videos vinculados a una solicitud.</p>
                    <div className="mt-3"><Btn onClick={cleanup} disabled={cleanBusy}>{cleanBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Limpiar subidas huérfanas</Btn></div>
                </Card>
            )}
        </div>
    );
};

// ── Historial ────────────────────────────────────────────────────────
const HistoryPanel = ({ detail, eventId, onUpdated }: { detail: Detail; eventId: string; onUpdated: () => void }) => {
    const [text, setText] = useState('');
    const [internal, setInternal] = useState(true);
    const [busy, setBusy] = useState(false);
    const send = async () => {
        if (!text.trim()) return;
        setBusy(true);
        try {
            const { res, data } = await api<{ error?: string }>(withEvento(`/project-fair/admin/video-pitch/${detail.request.id}/comments`, eventId), { method: 'POST', body: JSON.stringify({ text, internal }) });
            if (!res.ok) throw new Error(data?.error || 'No se pudo guardar');
            setText(''); onUpdated();
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
    };
    return (
        <div className="space-y-4">
            {detail.access.comment && (
                <Card title="Nota o mensaje" icon={MessageSquare}>
                    <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={internal ? 'Nota interna (sólo la ve el comité)' : 'Mensaje para el club (lo verá en su seguimiento)'} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> Nota interna</label>
                        <Btn kind="primary" onClick={send} disabled={busy || !text.trim()}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Guardar</Btn>
                    </div>
                </Card>
            )}
            <Card title={`Historial (${detail.events.length})`} icon={History}>
                <ol className="space-y-2">
                    {detail.events.map(e => (
                        <li key={e.id} className="flex gap-3 text-[13px]">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.visibility === 'internal' ? 'bg-slate-300' : 'bg-blue-400'}`} />
                            <div className="min-w-0">
                                <p className="font-semibold text-slate-800">{e.title || e.type} {e.visibility === 'internal' && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">interno</span>}</p>
                                {e.detail && <p className="whitespace-pre-wrap text-slate-600">{e.detail}</p>}
                                <p className="text-[11px] text-slate-400">{vpFmtDateTime(e.createdAt)}{e.actorName ? ` · ${e.actorName}${e.actorRole ? ` (${e.actorRole})` : ''}` : ''}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </Card>
            <Card title={`Correos enviados (${detail.notifications.length})`} icon={Send}>
                {!detail.notifications.length && <p className="text-sm text-slate-400">Todavía no salió ningún aviso.</p>}
                <ul className="space-y-1 text-[12px]">
                    {detail.notifications.map((n, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${n.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : n.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{n.status}</span>
                            <span className="font-semibold text-slate-700">{n.kind}</span>
                            <span className="text-slate-500">→ {n.recipient}</span>
                            <span className="text-slate-400">{vpFmtDateTime(n.createdAt)}</span>
                            {n.error && <span className="text-red-600">{n.error}</span>}
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
};

// ── Ficha ────────────────────────────────────────────────────────────
type DetailTab = 'summary' | 'commerce' | 'materials' | 'script' | 'production' | 'history';
const DetailDrawer = ({ id, eventId, assignees, onClose, onChanged }: { id: string; eventId: string; assignees: string[]; onClose: () => void; onChanged: () => void }) => {
    const [detail, setDetail] = useState<Detail | null>(null);
    const [tab, setTab] = useState<DetailTab>('summary');
    const [assignee, setAssignee] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const { res, data } = await api<Detail & { error?: string }>(withEvento(`/project-fair/admin/video-pitch/${id}`, eventId));
        if (!res.ok || !data?.request) { toast.error((data as any)?.error || 'No se pudo abrir la ficha'); onClose(); return; }
        setDetail(data); setAssignee(data.request.assigneeName || ''); setNotes(data.request.adminNotes || '');
    }, [id, eventId, onClose]);
    useEffect(() => { load(); }, [load]);

    const updated = (d: Detail) => { setDetail(d); onChanged(); };
    const saveMeta = async () => {
        if (!detail) return;
        setSaving(true);
        try {
            const { res, data } = await api<Detail & { error?: string }>(withEvento(`/project-fair/admin/video-pitch/${id}`, eventId), { method: 'PATCH', body: JSON.stringify({ assigneeName: assignee, adminNotes: notes }) });
            if (!res.ok || !data?.request) throw new Error((data as any)?.error || 'No se pudo guardar');
            updated(data); toast.success('Guardado');
        } catch (e: any) { toast.error(e?.message); } finally { setSaving(false); }
    };
    const deleteFile = async (f: VpFile) => {
        if (!detail || !window.confirm(`¿Quitar «${f.fileName}»? El club dejará de verlo.`)) return;
        const { res, data } = await api<Detail & { error?: string }>(withEvento(`/project-fair/admin/video-pitch/${id}/files/${f.id}`, eventId), { method: 'DELETE' });
        if (!res.ok || !data?.request) { toast.error((data as any)?.error || 'No se pudo quitar'); return; }
        updated(data);
    };

    const r = detail?.request;
    const a = r?.answers;
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
            <div className="h-full w-full max-w-4xl overflow-y-auto bg-slate-50 shadow-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                {!detail || !r || !a ? (
                    <div className="flex h-full items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" size={20} /> Cargando ficha…</div>
                ) : (
                    <>
                        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-sm font-bold text-slate-500">{r.number || 'Sin número'}</span>
                                        <Badge label={r.statusLabel} tone={r.statusTone} />
                                        <Badge label={detail.commercial.label} tone={detail.commercial.tone} />
                                        <span className="text-[11px] text-slate-400">Postulación {detail.submission.publicRef} · {detail.submission.projectStateLabel}</span>
                                    </div>
                                    <h2 className="mt-1 truncate text-xl font-bold text-slate-900">{detail.submission.projectName}</h2>
                                    <p className="text-sm text-slate-500">{detail.submission.clubName} · {detail.submission.district}</p>
                                </div>
                                <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                            </div>
                            <nav className="mt-3 flex gap-1 overflow-x-auto">
                                {([['summary', 'Resumen', FileText], ['commerce', 'Plan y pago', CreditCard], ['materials', `Materiales (${detail.files.filter(f => f.role === 'material' && !f.deletedAt).length})`, ImageIcon], ['script', `Guion (${detail.scripts.length})`, Sparkles], ['production', 'Producción', Clapperboard], ['history', 'Historial', History]] as const).map(([key, label, Icon]) => (
                                    <button key={key} onClick={() => setTab(key)} className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold ${tab === key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon size={13} /> {label}</button>
                                ))}
                            </nav>
                        </header>

                        <div className="space-y-4 p-6">
                            {tab === 'summary' && (
                                <>
                                    <Card title="Responsable y preferencias" icon={UserCheck}>
                                        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                                            <div><dt className="font-semibold text-slate-500">Responsable</dt><dd className="text-slate-800">{a.identification.responsibleName}</dd></div>
                                            <div><dt className="font-semibold text-slate-500">Contacto</dt><dd className="text-slate-800">{a.identification.email} · {a.identification.whatsapp}</dd></div>
                                            <div><dt className="font-semibold text-slate-500">Idioma</dt><dd className="text-slate-800">{detail.catalog.languages.find(l => l.key === a.preferences.language)?.label || '—'}</dd></div>
                                            <div><dt className="font-semibold text-slate-500">Objetivo</dt><dd className="text-slate-800">{detail.catalog.objectives.find(o => o.key === a.preferences.objective)?.label || '—'}{a.preferences.objectiveOther ? ` (${a.preferences.objectiveOther})` : ''}</dd></div>
                                            <div><dt className="font-semibold text-slate-500">Radicada</dt><dd className="text-slate-800">{vpFmtDateTime(r.submittedAt)}</dd></div>
                                            <div><dt className="font-semibold text-slate-500">Autorización de materiales</dt><dd className="text-slate-800">{a.consent.mediaAuthorization ? 'Confirmada por el club' : 'No confirmada'}</dd></div>
                                        </dl>
                                        {detail.access.manage && (
                                            <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
                                                <label className="text-[11px] font-semibold text-slate-500">Responsable de producción
                                                    <input list="vp-assignees" value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Correo o nombre" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal" />
                                                    <datalist id="vp-assignees">{assignees.map(x => <option key={x} value={x} />)}</datalist>
                                                </label>
                                                <label className="text-[11px] font-semibold text-slate-500">Notas internas
                                                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal" />
                                                </label>
                                                <div className="sm:col-span-2"><Btn kind="primary" onClick={saveMeta} disabled={saving}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar</Btn></div>
                                            </div>
                                        )}
                                    </Card>
                                    {r.infoRequest && r.status === 'info_required' && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-[13px] text-orange-950"><p className="font-bold">Se le pidió al club:</p><p className="mt-1 whitespace-pre-wrap">{r.infoRequest}</p></div>}
                                    <Card title="Información adicional del club para el video" icon={FileText}>
                                        {a.story.description
                                            ? <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800">{a.story.description}</p>
                                            : <p className="text-[13px] text-slate-400">El club no agregó información: el guion se basa en la postulación y la Formulación (abajo, en el expediente).</p>}
                                        <dl className="mt-4 grid gap-3 text-[13px]">
                                            {detail.catalog.guidedQuestions.filter(q => a.story[q.key]).map(q => <div key={q.key}><dt className="font-semibold text-slate-500">{q.label}</dt><dd className="whitespace-pre-wrap text-slate-800">{a.story[q.key]}</dd></div>)}
                                            {a.preferences.notes && <div><dt className="font-semibold text-slate-500">Observaciones para producción</dt><dd className="whitespace-pre-wrap text-slate-800">{a.preferences.notes}</dd></div>}
                                        </dl>
                                    </Card>
                                    <Card title="Expediente verificado (lo único que la IA puede afirmar)" icon={Sparkles}>
                                        <ul className="space-y-1 text-[12px] text-slate-700">{detail.dossier.map((l, i) => <li key={i} className="whitespace-pre-wrap">{l}</li>)}</ul>
                                        {!detail.submission.hasMasterForm && <p className="mt-2 text-[11px] text-slate-400">El club no ha iniciado la Formulación del proyecto: el expediente sólo tiene la postulación y esta solicitud.</p>}
                                    </Card>
                                </>
                            )}
                            {tab === 'materials' && <Gallery detail={detail} eventId={eventId} onDelete={deleteFile} />}
                            {tab === 'script' && <ScriptEditor detail={detail} eventId={eventId} onUpdated={updated} />}
                            {tab === 'production' && <Production detail={detail} eventId={eventId} onUpdated={updated} />}
                            {tab === 'commerce' && <CommercePanel detail={detail} eventId={eventId} onUpdated={() => { load(); onChanged(); }} />}
                            {tab === 'history' && <HistoryPanel detail={detail} eventId={eventId} onUpdated={() => { load(); onChanged(); }} />}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// ── Cabecera ordenable de la tabla (ámbito del módulo, v4.971) ───────
const SortableTh = ({ k, sort, onToggle, children }: { k: string; sort: string; onToggle: (k: string) => void; children: React.ReactNode }) => (
    <th className="cursor-pointer select-none px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800" onClick={() => onToggle(k)}>
        <span className="inline-flex items-center gap-1">{children} {sort === k && <ArrowUpDown size={11} />}</span>
    </th>
);

// ── Bandeja ──────────────────────────────────────────────────────────
const VideoPitchAdmin = ({ eventId }: { eventId: string }) => {
    const [mode, setMode] = useState<'requests' | 'config'>('requests');
    const [commercialFilter, setCommercialFilter] = useState('');
    const [data, setData] = useState<ListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [district, setDistrict] = useState('');
    const [assignee, setAssignee] = useState('');
    const [sort, setSort] = useState('updatedAt');
    const [dir, setDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [detailId, setDetailId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('vp') || null);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkAssignee, setBulkAssignee] = useState('');
    const debounced = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [qApplied, setQApplied] = useState('');

    useEffect(() => {
        if (debounced.current) clearTimeout(debounced.current);
        debounced.current = setTimeout(() => { setQApplied(q); setPage(1); }, 350);
        return () => { if (debounced.current) clearTimeout(debounced.current); };
    }, [q]);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const params = new URLSearchParams({ evento: eventId || '', q: qApplied, status, district, assignee, commercial: commercialFilter, sort, dir, page: String(page), pageSize: '20' });
            const { res, data } = await api<ListResponse & { error?: string }>(`/project-fair/admin/video-pitch?${params}`);
            if (!res.ok || !data?.rows) throw new Error((data as any)?.error || 'No se pudo cargar la bandeja');
            setData(data);
        } catch (e: any) {
            setError(e?.message || 'Error');
        } finally {
            setLoading(false);
        }
    }, [eventId, qApplied, status, district, assignee, commercialFilter, sort, dir, page]);
    useEffect(() => { load(); }, [load]);

    const openDetail = (id: string | null) => {
        setDetailId(id);
        const url = new URL(window.location.href);
        if (id) url.searchParams.set('vp', id); else url.searchParams.delete('vp');
        window.history.replaceState(null, '', url.toString());
    };
    const toggleSort = (key: string) => { if (sort === key) setDir(d => (d === 'asc' ? 'desc' : 'asc')); else { setSort(key); setDir('desc'); } };
    const allOnPage = data?.rows.map(r => r.id) || [];
    const allSelected = allOnPage.length > 0 && allOnPage.every(id => selected.has(id));

    const bulk = async (action: 'assign' | 'status', payload: any) => {
        const ids = Array.from(selected);
        if (!ids.length) return;
        setBulkBusy(true);
        try {
            if (action === 'status') {
                const plan = await api<{ done: number; skipped: { number: string; reason: string }[]; error?: string }>(`/project-fair/admin/video-pitch/bulk?evento=${encodeURIComponent(eventId || '')}`, { method: 'POST', body: JSON.stringify({ ids, action, ...payload, confirm: false }) });
                if (!plan.res.ok) throw new Error(plan.data?.error || 'No se pudo planear');
                const msg = `${plan.data?.done || 0} solicitud(es) cambiarán de estado.${plan.data?.skipped?.length ? ` ${plan.data.skipped.length} no: ${plan.data.skipped.map(s => `${s.number || ''} (${s.reason})`).join('; ')}` : ''} ¿Continuar?`;
                if (!window.confirm(msg)) return;
            }
            const { res, data } = await api<{ done: number; skipped: any[]; error?: string }>(`/project-fair/admin/video-pitch/bulk?evento=${encodeURIComponent(eventId || '')}`, { method: 'POST', body: JSON.stringify({ ids, action, ...payload, confirm: true }) });
            if (!res.ok) throw new Error(data?.error || 'No se pudo aplicar');
            toast.success(`${data?.done || 0} solicitud(es) actualizadas${data?.skipped?.length ? ` · ${data.skipped.length} omitidas` : ''}`);
            setSelected(new Set()); load();
        } catch (e: any) { toast.error(e?.message); } finally { setBulkBusy(false); }
    };

    const exportCsv = async () => {
        const params = new URLSearchParams({ evento: eventId || '', q: qApplied, status, district, assignee, commercial: commercialFilter, sort, dir });
        const res = await fetch(`${VP_API}/project-fair/admin/video-pitch/export.csv?${params}`, { headers: authHeaders() });
        if (!res.ok) { toast.error('No se pudo exportar'); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `video-pitch-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Clapperboard size={20} style={{ color: BLUE }} /> Video Pitch Profesional</h2>
                    <p className="text-sm text-slate-500">Solicitudes de video de presentación que los clubes envían desde «Mi proyecto»: revisión, guion con IA, aprobación, producción y entrega.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="flex rounded-lg border border-slate-300 p-0.5">
                        <button type="button" onClick={() => setMode('requests')} className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === 'requests' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>Solicitudes</button>
                        <button type="button" onClick={() => setMode('config')} className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold ${mode === 'config' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}><Settings size={12} /> Configuración</button>
                    </div>
                    {mode === 'requests' && <Btn onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar</Btn>}
                    {mode === 'requests' && data?.access.export && <Btn onClick={exportCsv}><FileSpreadsheet size={13} /> Exportar CSV</Btn>}
                </div>
            </div>

            {mode === 'config' && <PlansConfig />}
            {mode === 'requests' && <>

            {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error} <button onClick={load} className="ml-auto font-bold underline">Reintentar</button></div>}

            {data && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                    {KPI_LABELS.map(([k, label]) => (
                        <button key={k} type="button" onClick={() => {
                            setCommercialFilter(k === 'pending_payment' ? 'open' : k === 'paid' ? 'paid' : '');
                            setStatus(k === 'new' ? 'submitted' : k === 'pending_info' ? 'info_required' : k === 'delivered' ? 'delivered' : ''); setPage(1);
                        }} className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-300">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900">{data.kpis[k] ?? 0}</p>
                            {k === 'paid' && <p className="text-[11px] text-emerald-700">{fmtMoney(data.kpis.revenue, 'USD')}</p>}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="relative min-w-[220px] flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por número, proyecto, club, distrito, responsable o correo…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
                </div>
                <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                    <option value="">Todos los estados</option>
                    {data?.filters.statuses.filter(s => s.key !== 'draft').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <select value={district} onChange={e => { setDistrict(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                    <option value="">Todos los distritos</option>
                    {data?.filters.districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={commercialFilter} onChange={e => { setCommercialFilter(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                    <option value="">Cualquier pago</option>
                    <option value="open">Pendientes de pago</option>
                    <option value="paid">Pagadas</option>
                    <option value="failed">Pago fallido</option>
                    <option value="refunded">Reembolsadas</option>
                    <option value="no_plan">Sin plan</option>
                </select>
                <select value={assignee} onChange={e => { setAssignee(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                    <option value="">Cualquier responsable</option>
                    <option value="__none__">Sin responsable</option>
                    {data?.filters.assignees.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
            </div>

            {selected.size > 0 && data?.access.manage && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
                    <span className="font-bold text-blue-900">{selected.size} seleccionada(s)</span>
                    <input list="vp-assignees-bulk" value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value)} placeholder="Responsable de producción" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                    <datalist id="vp-assignees-bulk">{data.filters.assignees.map(a => <option key={a} value={a} />)}</datalist>
                    <Btn onClick={() => bulk('assign', { assigneeName: bulkAssignee })} disabled={bulkBusy}><UserCheck size={13} /> Asignar</Btn>
                    <span className="text-slate-300">|</span>
                    <Btn onClick={() => bulk('status', { status: 'in_review' })} disabled={bulkBusy}>→ En revisión</Btn>
                    <Btn onClick={() => bulk('status', { status: 'script_in_progress' })} disabled={bulkBusy}>→ Guion en preparación</Btn>
                    <Btn onClick={() => bulk('status', { status: 'delivered' })} disabled={bulkBusy}>→ Entregado</Btn>
                    <button onClick={() => setSelected(new Set())} className="ml-auto text-xs font-semibold text-slate-600 hover:underline">Limpiar</button>
                </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[960px] text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50">
                        <tr>
                            <th className="w-8 px-3 py-2"><input type="checkbox" checked={allSelected} onChange={e => setSelected(e.target.checked ? new Set([...selected, ...allOnPage]) : new Set([...selected].filter(id => !allOnPage.includes(id))))} /></th>
                            <SortableTh sort={sort} onToggle={toggleSort} k="submittedAt">Número</SortableTh>
                            <SortableTh sort={sort} onToggle={toggleSort} k="projectName">Proyecto</SortableTh>
                            <SortableTh sort={sort} onToggle={toggleSort} k="clubName">Club</SortableTh>
                            <SortableTh sort={sort} onToggle={toggleSort} k="district">Distrito</SortableTh>
                            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Responsable</th>
                            <SortableTh sort={sort} onToggle={toggleSort} k="updatedAt">Actualizada</SortableTh>
                            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Plan · Pago</th>
                            <SortableTh sort={sort} onToggle={toggleSort} k="status">Producción</SortableTh>
                            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Materiales</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Producción</th>
                            <th className="px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !data && <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-400"><Loader2 className="mr-2 inline animate-spin" size={16} /> Cargando…</td></tr>}
                        {data && !data.rows.length && <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-400">No hay solicitudes con estos filtros.</td></tr>}
                        {data?.rows.map(r => (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(r.id)} onChange={e => { const n = new Set(selected); if (e.target.checked) n.add(r.id); else n.delete(r.id); setSelected(n); }} /></td>
                                <td className="px-3 py-2"><button onClick={() => openDetail(r.id)} className="font-mono text-xs font-bold hover:underline" style={{ color: BLUE }}>{r.number || '—'}</button><p className="text-[11px] text-slate-400">{vpFmtDateTime(r.submittedAt)}</p></td>
                                <td className="max-w-[240px] px-3 py-2"><p className="truncate font-semibold text-slate-800" title={r.projectName}>{r.projectName}</p><p className="text-[11px] text-slate-400">{r.publicRef} · {r.projectStateLabel}</p></td>
                                <td className="max-w-[180px] truncate px-3 py-2 text-slate-700">{r.clubName}</td>
                                <td className="px-3 py-2 text-slate-700">{r.district}</td>
                                <td className="max-w-[180px] px-3 py-2"><p className="truncate text-slate-700">{r.responsibleName}</p><p className="truncate text-[11px] text-slate-400">{r.email}</p></td>
                                <td className="px-3 py-2 text-[12px] text-slate-500">{vpFmtDateTime(r.updatedAt)}</td>
                                <td className="px-3 py-2">
                                    <p className="text-[12px] font-semibold text-slate-800">{r.planName || <span className="font-normal text-slate-400">Sin plan</span>}{r.amount !== null ? <span className="font-normal text-slate-500"> · {fmtMoney(r.amount, r.currency)}</span> : null}</p>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-1"><Badge label={r.commercialLabel} tone={r.commercialTone} />{r.paymentWaived && <span title="Producción autorizada sin pago"><ShieldCheck size={13} className="text-violet-600" /></span>}</div>
                                    {r.paidAt && <p className="text-[11px] text-slate-400">{vpFmtDateTime(r.paidAt)}</p>}
                                </td>
                                <td className="px-3 py-2"><Badge label={r.statusLabel} tone={r.statusTone} /></td>
                                <td className="px-3 py-2 text-slate-700">{r.materialCount}</td>
                                <td className="px-3 py-2 text-[12px] text-slate-600">
                                    <p>{r.assigneeName || <span className="text-slate-400">Sin asignar</span>}</p>
                                    <p className="text-[11px] text-slate-400">{r.scriptCount} guion(es){r.hasApprovedScript ? ' · aprobado' : ''}{r.hasDeliverable ? ' · video' : ''}</p>
                                </td>
                                <td className="px-3 py-2 text-right"><button onClick={() => openDetail(r.id)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Abrir</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {data && data.total > data.pageSize && (
                <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>{data.total} solicitudes · página {data.page} de {totalPages}</span>
                    <div className="flex gap-1">
                        <Btn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={13} /> Anterior</Btn>
                        <Btn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente <ChevronRight size={13} /></Btn>
                    </div>
                </div>
            )}

            {detailId && <DetailDrawer id={detailId} eventId={eventId} assignees={data?.filters.assignees || []} onClose={() => openDetail(null)} onChanged={load} />}
            </>}
        </div>
    );
};

export default VideoPitchAdmin;
