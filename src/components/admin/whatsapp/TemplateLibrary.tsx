import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FolderOpen, Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Clock,
    Send, Save, Copy, Trash2, X, Wand2, Eye, Plus, FileText, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

type Folder = { key: string; label: string; emoji: string; hint: string; metaCategory: string; n?: number };
type Button = { type: string; text: string; url?: string; phoneNumber?: string };
type Validation = { errors: string[]; warnings: string[]; ok: boolean };
type Template = {
    id?: string; name: string; displayName: string; category: string; folder: string | null;
    language: string; status?: string; headerType: string; headerContent: string | null;
    bodyText: string; footerText: string | null; buttons: Button[];
    variableTokens: string[]; variableSamples: string[];
    metaTemplateId?: string | null; rejectionReason?: string | null; submittedAt?: string | null;
    validation?: Validation; preview?: string; rationale?: string | null;
};
type Catalog = {
    folders: Folder[];
    metaCategories: { key: string; label: string; description: string }[];
    buttonTypes: { key: string; label: string; description: string }[];
    headerTypes: string[];
    limits: Record<string, number>;
    variables: { token: string; label: string }[];
};

const STATUS_STYLE: Record<string, string> = {
    approved: 'bg-green-100 text-green-800 border-green-200',
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
    draft: 'bg-gray-100 text-gray-600 border-gray-200',
};
const STATUS_LABEL: Record<string, string> = {
    approved: 'Aprobada por Meta', pending: 'En revisión', rejected: 'Rechazada', draft: 'Borrador',
};

const EMPTY: Template = {
    name: '', displayName: '', category: 'UTILITY', folder: null, language: 'es',
    headerType: 'NONE', headerContent: null, bodyText: '', footerText: null,
    buttons: [], variableTokens: [], variableSamples: [],
};

export default function TemplateLibrary() {
    const { token } = useAuth();

    // Hooks arriba de todo, antes de cualquier return.
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [unfiled, setUnfiled] = useState(0);
    const [activeFolder, setActiveFolder] = useState<string>('');
    const [editing, setEditing] = useState<Template | null>(null);
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Redactor
    const [composerOpen, setComposerOpen] = useState(false);
    const [composing, setComposing] = useState(false);
    const [goal, setGoal] = useState('');
    const [composeFolder, setComposeFolder] = useState('');
    const [tone, setTone] = useState('');
    const [extraContext, setExtraContext] = useState('');

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    }), [token]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = activeFolder ? `?folder=${encodeURIComponent(activeFolder)}` : '';
            const [rc, rl] = await Promise.all([
                fetch(`${API}/crm/template-library/catalog`, { headers }),
                fetch(`${API}/crm/template-library${qs}`, { headers }),
            ]);
            if (!rl.ok) throw new Error((await rl.json().catch(() => ({}))).error || 'No se pudo abrir la biblioteca');
            setCatalog(await rc.json());
            const data = await rl.json();
            setTemplates(data.templates || []);
            setFolders(data.folders || []);
            setUnfiled(data.unfiled || 0);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [headers, activeFolder]);

    useEffect(() => { load(); }, [load]);

    const compose = async () => {
        if (!goal.trim()) { toast.error('Contanos qué tiene que lograr el mensaje.'); return; }
        setComposing(true);
        try {
            const res = await fetch(`${API}/crm/template-library/compose`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    goal, folder: composeFolder || null, tone: tone || null,
                    extraContext: extraContext || null, language: 'es',
                    audience: 'Dirigentes de un club Rotario (presidente, secretario, tesorero o comunicaciones)',
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo redactar');
            setEditing({ ...body.template, validation: body.validation, preview: body.preview });
            setComposerOpen(false);
            if (body.validation?.ok) toast.success(`Borrador listo (${body.attempts} intento${body.attempts > 1 ? 's' : ''})`);
            else toast.warning('El borrador quedó con observaciones. Revisalas antes de enviarlo a Meta.');
        } catch (e: any) { toast.error(e.message); }
        finally { setComposing(false); }
    };

    const refreshPreview = useCallback(async (t: Template) => {
        try {
            const res = await fetch(`${API}/crm/template-library/preview`, {
                method: 'POST', headers, body: JSON.stringify(t),
            });
            if (!res.ok) return;
            const body = await res.json();
            setEditing(cur => (cur ? { ...cur, preview: body.preview, validation: body.validation } : cur));
        } catch { /* la vista previa es una ayuda, no puede romper el editor */ }
    }, [headers]);

    const save = async () => {
        if (!editing) return;
        setSaving(true);
        try {
            const url = editing.id
                ? `${API}/crm/template-library/${editing.id}`
                : `${API}/crm/template-library`;
            const res = await fetch(url, { method: editing.id ? 'PUT' : 'POST', headers, body: JSON.stringify(editing) });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo guardar');
            setEditing(body);
            toast.success('Plantilla guardada');
            load();
        } catch (e: any) { toast.error(e.message); }
        finally { setSaving(false); }
    };

    const submit = async (t: Template) => {
        if (!t.id) { toast.error('Guardá la plantilla antes de enviarla.'); return; }
        if (!window.confirm(
            'Se va a enviar a Meta para aprobación.\n\n' +
            'Una vez enviada, su texto no se puede editar — sólo duplicarla. ' +
            'Un rechazo afecta la calificación de calidad de la cuenta, así que conviene releerla.'
        )) return;
        setSubmitting(true);
        try {
            const res = await fetch(`${API}/crm/template-library/${t.id}/submit`, { method: 'POST', headers });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo enviar');
            toast.success(body.message || 'Enviada a Meta');
            setEditing(null);
            load();
        } catch (e: any) { toast.error(e.message); }
        finally { setSubmitting(false); }
    };

    const duplicate = async (t: Template) => {
        try {
            const res = await fetch(`${API}/crm/template-library/${t.id}/duplicate`, { method: 'POST', headers });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo duplicar');
            toast.success('Copia creada, ya editable');
            setEditing(body);
            load();
        } catch (e: any) { toast.error(e.message); }
    };

    const remove = async (t: Template) => {
        if (!window.confirm(`¿Borrar "${t.displayName}"?`)) return;
        try {
            const res = await fetch(`${API}/crm/template-library/${t.id}`, { method: 'DELETE', headers });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'No se pudo borrar');
            toast.success('Plantilla borrada');
            if (editing?.id === t.id) setEditing(null);
            load();
        } catch (e: any) { toast.error(e.message); }
    };

    const syncFromMeta = async () => {
        try {
            const res = await fetch(`${API}/crm/templates/sync`, { method: 'POST', headers });
            const body = await res.json();
            if (!body.success) throw new Error(body.error || 'No se pudo sincronizar');
            toast.success(`${body.synced} plantilla(s) sincronizada(s) desde Meta`);
            load();
        } catch (e: any) { toast.error(e.message); }
    };

    const patchEditing = (patch: Partial<Template>) => {
        setEditing(cur => {
            if (!cur) return cur;
            const next = { ...cur, ...patch };
            refreshPreview(next);
            return next;
        });
    };

    if (loading) return <div className="p-12 text-center text-gray-500">Cargando la biblioteca…</div>;

    if (error) {
        return (
            <div className="p-8 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> {error}</p>
                <button onClick={load} className="mt-3 text-sm px-3 py-1.5 bg-white border rounded-lg">Reintentar</button>
            </div>
        );
    }
    if (!catalog) return null;

    const locked = !!editing?.metaTemplateId;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-green-600" /> Biblioteca de plantillas
                    </h2>
                    <p className="text-sm text-gray-500">
                        Redactalas con IA, organizalas por carpeta y enviálas a Meta para aprobación.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={syncFromMeta} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50">
                        <RefreshCw className="w-4 h-4" /> Sincronizar con Meta
                    </button>
                    <button
                        onClick={() => { setEditing({ ...EMPTY, folder: activeFolder || null }); }}
                        className="px-3 py-2 border rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50"
                    ><Plus className="w-4 h-4" /> En blanco</button>
                    <button
                        onClick={() => setComposerOpen(true)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                    ><Sparkles className="w-4 h-4" /> Redactar con IA</button>
                </div>
            </div>

            <div className="grid lg:grid-cols-4 gap-4">
                {/* Carpetas */}
                <div className="lg:col-span-1 space-y-1">
                    <button
                        onClick={() => setActiveFolder('')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                            !activeFolder ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
                        }`}
                    >
                        <span>Todas</span>
                        <span className="text-xs opacity-70">{folders.reduce((a, f) => a + (f.n || 0), 0) + unfiled}</span>
                    </button>
                    {folders.map(f => (
                        <button
                            key={f.key}
                            onClick={() => setActiveFolder(f.key)}
                            title={f.hint}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                                activeFolder === f.key ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'
                            }`}
                        >
                            <span className="truncate">{f.emoji} {f.label}</span>
                            <span className={`text-xs ${activeFolder === f.key ? 'opacity-70' : 'text-gray-400'}`}>{f.n || 0}</span>
                        </button>
                    ))}
                    {unfiled > 0 && (
                        <button
                            onClick={() => setActiveFolder('none')}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                                activeFolder === 'none' ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-500'
                            }`}
                        >
                            <span>Sin carpeta</span>
                            <span className="text-xs opacity-70">{unfiled}</span>
                        </button>
                    )}
                </div>

                {/* Listado o editor */}
                <div className="lg:col-span-3">
                    {editing ? (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <button onClick={() => setEditing(null)} className="text-sm text-gray-500 hover:text-gray-900">
                                    ← Volver a la biblioteca
                                </button>
                                <div className="flex items-center gap-2">
                                    {!locked && (
                                        <button onClick={save} disabled={saving}
                                            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
                                            <Save className="w-4 h-4" /> {saving ? 'Guardando…' : 'Guardar'}
                                        </button>
                                    )}
                                    {editing.id && !editing.metaTemplateId && (
                                        <button onClick={() => submit(editing)} disabled={submitting || !editing.validation?.ok}
                                            title={editing.validation?.ok ? '' : 'Corregí los errores antes de enviarla'}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
                                            <Send className="w-4 h-4" /> {submitting ? 'Enviando…' : 'Enviar a Meta'}
                                        </button>
                                    )}
                                    {editing.id && (
                                        <button onClick={() => duplicate(editing)} className="p-2 border rounded-lg hover:bg-gray-50" title="Duplicar">
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {locked && (
                                <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-3 text-sm flex items-start gap-2">
                                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>
                                        Esta plantilla ya está en Meta y su texto es inmutable. Lo único editable es la carpeta.
                                        Para cambiar el mensaje, duplicala y trabajá sobre la copia.
                                    </span>
                                </div>
                            )}

                            {editing.rejectionReason && (
                                <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-sm">
                                    <p className="font-semibold">Meta la rechazó</p>
                                    <p className="mt-0.5">{editing.rejectionReason}</p>
                                </div>
                            )}

                            {editing.validation && (editing.validation.errors.length > 0 || editing.validation.warnings.length > 0) && (
                                <div className="space-y-2">
                                    {editing.validation.errors.length > 0 && (
                                        <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-sm">
                                            <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Meta la rechazaría</p>
                                            <ul className="list-disc ml-5 mt-1 space-y-0.5">
                                                {editing.validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {editing.validation.warnings.length > 0 && (
                                        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-sm">
                                            <p className="font-semibold">Para tener en cuenta</p>
                                            <ul className="list-disc ml-5 mt-1 space-y-0.5">
                                                {editing.validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {editing.rationale && (
                                <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg px-3 py-2">
                                    <strong>Por qué está escrita así:</strong> {editing.rationale}
                                </p>
                            )}

                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="bg-white border rounded-xl p-4 space-y-3">
                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <label className="text-sm">
                                            <span className="text-gray-500">Nombre legible</span>
                                            <input value={editing.displayName} disabled={locked}
                                                onChange={e => patchEditing({ displayName: e.target.value })}
                                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50" />
                                        </label>
                                        <label className="text-sm">
                                            <span className="text-gray-500">Carpeta</span>
                                            <select value={editing.folder || ''}
                                                onChange={e => patchEditing({ folder: e.target.value || null })}
                                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm">
                                                <option value="">Sin carpeta</option>
                                                {catalog.folders.map(f => <option key={f.key} value={f.key}>{f.emoji} {f.label}</option>)}
                                            </select>
                                        </label>
                                    </div>

                                    <label className="text-sm block">
                                        <span className="text-gray-500">Categoría de Meta</span>
                                        <select value={editing.category} disabled={locked}
                                            onChange={e => patchEditing({ category: e.target.value })}
                                            className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50">
                                            {catalog.metaCategories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                        </select>
                                        <span className="text-[11px] text-gray-400 block mt-0.5">
                                            {catalog.metaCategories.find(c => c.key === editing.category)?.description}
                                        </span>
                                    </label>

                                    <label className="text-sm block">
                                        <span className="text-gray-500">
                                            Encabezado <span className="text-gray-400">(máx. {catalog.limits.header})</span>
                                        </span>
                                        <div className="flex gap-2 mt-1">
                                            <select value={editing.headerType} disabled={locked}
                                                onChange={e => patchEditing({ headerType: e.target.value })}
                                                className="border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50">
                                                {catalog.headerTypes.map(h => <option key={h} value={h}>{h === 'NONE' ? 'Sin encabezado' : h}</option>)}
                                            </select>
                                            {editing.headerType === 'TEXT' && (
                                                <input value={editing.headerContent || ''} disabled={locked}
                                                    maxLength={catalog.limits.header}
                                                    onChange={e => patchEditing({ headerContent: e.target.value })}
                                                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50" />
                                            )}
                                        </div>
                                    </label>

                                    <label className="text-sm block">
                                        <span className="text-gray-500 flex items-center justify-between">
                                            <span>Cuerpo</span>
                                            <span className={`text-[11px] ${editing.bodyText.length > catalog.limits.body ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                                                {editing.bodyText.length} / {catalog.limits.body}
                                            </span>
                                        </span>
                                        <textarea value={editing.bodyText} disabled={locked} rows={7}
                                            onChange={e => patchEditing({ bodyText: e.target.value })}
                                            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono disabled:bg-gray-50" />
                                    </label>

                                    <label className="text-sm block">
                                        <span className="text-gray-500">Pie <span className="text-gray-400">(sin variables)</span></span>
                                        <input value={editing.footerText || ''} disabled={locked}
                                            maxLength={catalog.limits.footer}
                                            onChange={e => patchEditing({ footerText: e.target.value || null })}
                                            className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50" />
                                    </label>

                                    {/* Variables */}
                                    <div>
                                        <p className="text-sm text-gray-500 mb-1">
                                            De dónde sale cada variable
                                        </p>
                                        {editing.variableTokens.length === 0 && (
                                            <p className="text-xs text-gray-400">El cuerpo no usa variables.</p>
                                        )}
                                        {editing.variableTokens.map((tok, i) => (
                                            <div key={i} className="flex items-center gap-2 mb-1.5">
                                                <span className="font-mono text-xs bg-green-50 border border-green-200 text-green-800 px-1.5 py-1 rounded">
                                                    {`{{${i + 1}}}`}
                                                </span>
                                                <select value={tok} disabled={locked}
                                                    onChange={e => {
                                                        const next = [...editing.variableTokens];
                                                        next[i] = e.target.value;
                                                        patchEditing({ variableTokens: next });
                                                    }}
                                                    className="border rounded px-2 py-1 text-xs flex-1 disabled:bg-gray-50">
                                                    {catalog.variables.map(v => <option key={v.token} value={v.token}>{v.label}</option>)}
                                                </select>
                                                <input value={editing.variableSamples[i] || ''} disabled={locked}
                                                    placeholder="ejemplo"
                                                    onChange={e => {
                                                        const next = [...editing.variableSamples];
                                                        next[i] = e.target.value;
                                                        patchEditing({ variableSamples: next });
                                                    }}
                                                    className="border rounded px-2 py-1 text-xs w-28 disabled:bg-gray-50" />
                                            </div>
                                        ))}
                                        {editing.variableTokens.length > 0 && (
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Los ejemplos son obligatorios: Meta los usa para revisar la plantilla.
                                            </p>
                                        )}
                                    </div>

                                    {/* Botones */}
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-gray-500">Botones</p>
                                            {!locked && (
                                                <button
                                                    onClick={() => patchEditing({ buttons: [...editing.buttons, { type: 'QUICK_REPLY', text: '' }] })}
                                                    className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-50">+ Botón</button>
                                            )}
                                        </div>
                                        {editing.buttons.map((b, i) => (
                                            <div key={i} className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                                <select value={b.type} disabled={locked}
                                                    onChange={e => {
                                                        const next = [...editing.buttons];
                                                        next[i] = { ...next[i], type: e.target.value };
                                                        patchEditing({ buttons: next });
                                                    }}
                                                    className="border rounded px-2 py-1 text-xs disabled:bg-gray-50">
                                                    {catalog.buttonTypes.map(bt => <option key={bt.key} value={bt.key}>{bt.label}</option>)}
                                                </select>
                                                <input value={b.text} disabled={locked} placeholder="texto"
                                                    maxLength={catalog.limits.buttonText}
                                                    onChange={e => {
                                                        const next = [...editing.buttons];
                                                        next[i] = { ...next[i], text: e.target.value };
                                                        patchEditing({ buttons: next });
                                                    }}
                                                    className="border rounded px-2 py-1 text-xs w-28 disabled:bg-gray-50" />
                                                {b.type === 'URL' && (
                                                    <input value={b.url || ''} disabled={locked} placeholder="https://…"
                                                        onChange={e => {
                                                            const next = [...editing.buttons];
                                                            next[i] = { ...next[i], url: e.target.value };
                                                            patchEditing({ buttons: next });
                                                        }}
                                                        className="border rounded px-2 py-1 text-xs flex-1 min-w-[120px] disabled:bg-gray-50" />
                                                )}
                                                {!locked && (
                                                    <button onClick={() => patchEditing({ buttons: editing.buttons.filter((_, x) => x !== i) })}
                                                        className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5" /></button>
                                                )}
                                            </div>
                                        ))}
                                        <p className="text-[11px] text-gray-400 mt-1.5">
                                            El clic en un botón de enlace Meta no lo reporta. Sólo la respuesta rápida se puede medir.
                                        </p>
                                    </div>
                                </div>

                                {/* Vista previa */}
                                <div className="space-y-3">
                                    <div className="bg-[#0b141a] rounded-xl p-4">
                                        <p className="text-[11px] text-gray-400 mb-2 flex items-center gap-1">
                                            <Eye className="w-3 h-3" /> Así se ve en el teléfono
                                        </p>
                                        <div className="bg-[#005c4b] text-white rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%] ml-auto">
                                            <p className="text-sm whitespace-pre-wrap break-words">{editing.preview || editing.bodyText}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white border rounded-xl p-3 text-xs text-gray-500 space-y-1">
                                        <p><strong className="text-gray-700">Nombre técnico:</strong> <code>{editing.name || '—'}</code></p>
                                        <p><strong className="text-gray-700">Estado:</strong> {STATUS_LABEL[editing.status || 'draft']}</p>
                                        {editing.submittedAt && (
                                            <p><strong className="text-gray-700">Enviada:</strong> {new Date(editing.submittedAt).toLocaleString('es-CO')}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-2 gap-3">
                            {templates.map(t => (
                                <div key={t.id} className="bg-white border rounded-xl p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm text-gray-900 truncate">{t.displayName}</p>
                                            <code className="text-[10px] text-gray-400">{t.name}</code>
                                        </div>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${STATUS_STYLE[t.status || 'draft']}`}>
                                            {STATUS_LABEL[t.status || 'draft']}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 line-clamp-3 whitespace-pre-wrap">{t.preview || t.bodyText}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-gray-400">
                                            {t.folder ? `${catalog.folders.find(f => f.key === t.folder)?.emoji || ''} ${catalog.folders.find(f => f.key === t.folder)?.label || t.folder}` : 'Sin carpeta'}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {t.validation && !t.validation.ok && (
                                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                            )}
                                            {t.status === 'approved' && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                                            {t.status === 'pending' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                                            <button onClick={() => setEditing(t)} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Abrir</button>
                                            <button onClick={() => remove(t)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {!templates.length && (
                                <div className="sm:col-span-2 text-center py-12 text-gray-400">
                                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">No hay plantillas en esta carpeta.</p>
                                    <button onClick={() => setComposerOpen(true)} className="mt-3 text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg">
                                        Redactar la primera con IA
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Redactor */}
            {composerOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setComposerOpen(false)}>
                    <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Wand2 className="w-5 h-5 text-green-600" /> Redactar con IA
                            </h3>
                            <button onClick={() => setComposerOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>

                        <label className="text-sm block">
                            <span className="text-gray-500">¿Qué tiene que lograr el mensaje?</span>
                            <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={3}
                                placeholder="Ej: avisarle al club que su suscripción vence en 30 días y que puede renovar desde el panel."
                                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-sm">
                                <span className="text-gray-500">Carpeta</span>
                                <select value={composeFolder} onChange={e => setComposeFolder(e.target.value)}
                                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm">
                                    <option value="">Elegir…</option>
                                    {catalog.folders.map(f => <option key={f.key} value={f.key}>{f.emoji} {f.label}</option>)}
                                </select>
                            </label>
                            <label className="text-sm">
                                <span className="text-gray-500">Tono</span>
                                <select value={tone} onChange={e => setTone(e.target.value)}
                                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm">
                                    <option value="">Institucional (por defecto)</option>
                                    <option value="cercano y cálido">Cercano y cálido</option>
                                    <option value="directo y breve">Directo y breve</option>
                                    <option value="formal">Formal</option>
                                    <option value="urgente pero respetuoso">Urgente pero respetuoso</option>
                                </select>
                            </label>
                        </div>

                        {composeFolder && (
                            <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg px-2 py-1.5">
                                {catalog.folders.find(f => f.key === composeFolder)?.hint}
                                {' '}Se declarará a Meta como <strong>{catalog.folders.find(f => f.key === composeFolder)?.metaCategory}</strong>.
                            </p>
                        )}

                        <label className="text-sm block">
                            <span className="text-gray-500">Contexto adicional (opcional)</span>
                            <input value={extraContext} onChange={e => setExtraContext(e.target.value)}
                                placeholder="Ej: mencionar que este año se agregó el Creador de Reels."
                                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" />
                        </label>

                        <p className="text-[11px] text-gray-400">
                            El borrador se revisa contra las reglas de Meta antes de mostrártelo; si algo no cumple, se reintenta solo.
                            Nada se envía a Meta hasta que vos lo pidas.
                        </p>

                        <button onClick={compose} disabled={composing}
                            className="w-full py-2.5 bg-green-600 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                            <Sparkles className="w-4 h-4" /> {composing ? 'Redactando…' : 'Redactar'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
