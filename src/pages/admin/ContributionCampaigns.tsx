import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import MediaPicker from '../../components/admin/content-studio/MediaPicker';
import { toast } from 'sonner';
import {
    Megaphone, Plus, Save, ArrowLeft, Eye, Trash2, Clock, History,
    AlertTriangle, Image as ImageIcon, Upload, ChevronUp, ChevronDown, X,
} from 'lucide-react';
import {
    CAMPAIGN_TYPES, campaignTypeCatalog, DEFAULT_CAMPAIGN_TYPE,
    STATUS_LABELS, canTransition, effectiveStatus, TARGETING_LABELS,
    validateStats, normalizeCenters, type CampaignStatus, type TargetingMode,
    type ContributionCenter,
} from '../../lib/contributionSpec';
import { uploadMediaFiles, IMAGE_ACCEPT } from '../../lib/mediaUpload';

const API = import.meta.env.VITE_API_URL || '/api';

// ─── Tipos de la pantalla ────────────────────────────────────────────────────
interface Cta { label: string; url: string; action: 'donate' | 'centers' | 'link' | 'share'; }
interface WayItem { id: string; icon: string; title: string; description: string; cta: Cta; active: boolean; }
interface ReqItem { id: string; icon: string; title: string; description: string; active: boolean; }
interface InfoBlock { id: string; title: string; text: string; active: boolean; }
interface Partner { id: string; name: string; logo: string; url: string; active: boolean; }
interface Stat { id: string; label: string; value: string; source: string; updatedAt: string; active: boolean; }

interface CampaignRow {
    id: string; slug: string; name: string; campaignType: string;
    status: string; effectiveStatus?: string;
    startAt: string | null; endAt: string | null; priority: number;
    content: any; stats: Stat[]; targeting: any;
    recipientClubId: string | null; publishedAt: string | null; updatedAt: string;
}

interface ClubOption { id: string; name: string; type?: string; district?: string; }

const emptyCta = (): Cta => ({ label: '', url: '', action: 'link' });

const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

// datetime-local ↔ ISO. El input trabaja en hora local; se guarda ISO.
const toLocalInput = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string): string | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// ─── Piezas visuales (a nivel de módulo: nada de hooks en .map) ─────────────
const field = 'mt-1.5 w-full px-4 py-3 bg-gray-50 border-2 border-transparent rounded-xl focus:border-rotary-blue/30 focus:bg-white outline-none transition-all font-medium text-sm';
const lbl = 'text-xs font-bold text-gray-400 uppercase tracking-wider';

const Card: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
    <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-1">{title}</h3>
        {hint && <p className="text-xs text-gray-400 mb-5">{hint}</p>}
        {!hint && <div className="mb-5" />}
        {children}
    </div>
);

const STATUS_CHIP: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    scheduled: 'bg-sky-50 text-sky-700',
    active: 'bg-emerald-50 text-emerald-700',
    paused: 'bg-amber-50 text-amber-700',
    finished: 'bg-slate-100 text-slate-500',
    archived: 'bg-gray-100 text-gray-400',
};

const StatusChip: React.FC<{ status: string }> = ({ status }) => (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${STATUS_CHIP[status] || STATUS_CHIP.draft}`}>
        {STATUS_LABELS[status as CampaignStatus] || status}
    </span>
);

const CtaEditor: React.FC<{ value: Cta; onChange: (c: Cta) => void; label: string }> = ({ value, onChange, label }) => (
    <div className="border border-gray-100 rounded-2xl p-4">
        <p className={lbl}>{label}</p>
        <div className="grid sm:grid-cols-3 gap-3 mt-1">
            <input className={field} placeholder="Texto del botón" value={value.label}
                onChange={e => onChange({ ...value, label: e.target.value })} />
            <select className={field} value={value.action}
                onChange={e => onChange({ ...value, action: e.target.value as Cta['action'] })}>
                <option value="donate">Abrir formulario de aporte</option>
                <option value="centers">Ir a centros de acopio</option>
                <option value="share">Compartir la campaña</option>
                <option value="link">Enlace</option>
            </select>
            {value.action === 'link' && (
                <input className={field} placeholder="https://… o /ruta" value={value.url}
                    onChange={e => onChange({ ...value, url: e.target.value })} />
            )}
        </div>
    </div>
);

// Controles de una fila de lista: subir / bajar / quitar.
const RowTools: React.FC<{ onUp: () => void; onDown: () => void; onRemove: () => void }> = ({ onUp, onDown, onRemove }) => (
    <div className="flex items-center gap-1">
        <button type="button" onClick={onUp} aria-label="Subir" className="p-1.5 rounded-lg text-gray-400 hover:text-rotary-blue hover:bg-gray-50"><ChevronUp className="w-4 h-4" /></button>
        <button type="button" onClick={onDown} aria-label="Bajar" className="p-1.5 rounded-lg text-gray-400 hover:text-rotary-blue hover:bg-gray-50"><ChevronDown className="w-4 h-4" /></button>
        <button type="button" onClick={onRemove} aria-label="Quitar" className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"><X className="w-4 h-4" /></button>
    </div>
);

// ─── La pantalla ─────────────────────────────────────────────────────────────
const ContributionCampaigns: React.FC = () => {
    // Listado
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [clubs, setClubs] = useState<ClubOption[]>([]);

    // Alta
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState(DEFAULT_CAMPAIGN_TYPE);
    const [creating, setCreating] = useState(false);

    // Editor
    const [c, setC] = useState<CampaignRow | null>(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishErrors, setPublishErrors] = useState<string[]>([]);
    const [history, setHistory] = useState<{ action: string; actor: string | null; createdAt: string }[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    // Centros de acopio (F3): tabla propia, guardado aparte del documento de
    // la campaña — el editor trabaja sobre la lista entera, como los bloques
    // de pago. Sólo edita los CENTRALES; los locales de cada club son de F4.
    const [centers, setCenters] = useState<Partial<ContributionCenter>[]>([]);
    const [centersDirty, setCentersDirty] = useState(false);
    const [savingCenters, setSavingCenters] = useState(false);

    // Imágenes: UN MediaPicker por pantalla, con pickerField diciendo a dónde
    // va lo elegido (regla v4.700). La subida comparte el mismo destino.
    const [pickerField, setPickerField] = useState<string | null>(null);
    const uploadFieldRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const now = new Date();

    useEffect(() => {
        (async () => {
            try {
                const [rc, rClubs] = await Promise.all([
                    fetch(`${API}/contribution-campaigns`, { headers: authHeaders() }),
                    fetch(`${API}/admin/clubs`, { headers: authHeaders() }),
                ]);
                const dc = rc.ok ? await rc.json() : { campaigns: [] };
                setCampaigns(Array.isArray(dc?.campaigns) ? dc.campaigns : []);
                const dClubs = rClubs.ok ? await rClubs.json() : [];
                setClubs((Array.isArray(dClubs) ? dClubs : []).map((x: any) => ({
                    id: x.id, name: x.name, type: x.type, district: x.district,
                })));
            } catch {
                toast.error('No se pudieron cargar las campañas');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const openCampaign = async (id: string) => {
        try {
            const r = await fetch(`${API}/contribution-campaigns/${id}`, { headers: authHeaders() });
            if (!r.ok) throw new Error();
            const d = await r.json();
            setC(d.campaign);
            setPublishErrors(Array.isArray(d.publishErrors) ? d.publishErrors : []);
            setHistory(Array.isArray(d.history) ? d.history : []);
            setDirty(false);
            // Los centros viven en su tabla: se cargan aparte y un fallo acá
            // no impide editar el resto de la campaña.
            setCenters([]); setCentersDirty(false);
            try {
                const rc = await fetch(`${API}/contribution-campaigns/${id}/centers`, { headers: authHeaders() });
                const dc = rc.ok ? await rc.json() : null;
                if (Array.isArray(dc?.centers)) setCenters(dc.centers);
            } catch { /* la card avisa vacía; guardar sigue funcionando */ }
        } catch {
            toast.error('No se pudo abrir la campaña');
        }
    };

    const saveCenters = async () => {
        if (!c) return;
        setSavingCenters(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}/centers`, {
                method: 'PUT', headers: authHeaders(), body: JSON.stringify({ centers }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setCenters(Array.isArray(d.centers) ? d.centers : []);
            setCentersDirty(false);
            if (Array.isArray(d.skipped) && d.skipped.length > 0) {
                toast.warning(`Centros guardados; ${d.skipped.length} descartado(s) por datos incompletos`);
            } else {
                toast.success('Centros de acopio guardados');
            }
        } catch (e: any) {
            toast.error(e?.message || 'No se pudieron guardar los centros');
        } finally {
            setSavingCenters(false);
        }
    };

    const patch = (updates: Partial<CampaignRow>) => {
        setC(prev => (prev ? { ...prev, ...updates } : prev));
        setDirty(true);
    };
    const patchContent = (updates: any) => {
        setC(prev => (prev ? { ...prev, content: { ...prev.content, ...updates } } : prev));
        setDirty(true);
    };

    const create = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ name: newName.trim(), campaignType: newType }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setShowCreate(false); setNewName('');
            setCampaigns(prev => [{ ...d.campaign, effectiveStatus: 'draft' }, ...prev]);
            await openCampaign(d.campaign.id);
            toast.success('Campaña creada como borrador');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo crear la campaña');
        } finally {
            setCreating(false);
        }
    };

    const save = async () => {
        if (!c) return;
        setSaving(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({
                    name: c.name, campaignType: c.campaignType,
                    startAt: c.startAt, endAt: c.endAt, priority: c.priority,
                    content: c.content, stats: c.stats, targeting: c.targeting,
                    recipientClubId: c.recipientClubId,
                }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setC(prev => (prev ? { ...prev, ...d.campaign } : prev));
            setPublishErrors(Array.isArray(d.publishErrors) ? d.publishErrors : []);
            setCampaigns(prev => prev.map(x => (x.id === d.campaign.id ? { ...x, ...d.campaign } : x)));
            setDirty(false);
            toast.success('Campaña guardada');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    const transition = async (to: string) => {
        if (!c) return;
        if (dirty) { toast.error('Guardá los cambios antes de cambiar el estado'); return; }
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}/status`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ status: to }),
            });
            const d = await r.json();
            if (r.status === 422 && Array.isArray(d?.errors)) {
                setPublishErrors(d.errors);
                toast.error('La campaña no está lista para publicarse — mirá los motivos');
                return;
            }
            if (!r.ok) throw new Error(d?.error);
            setC(prev => (prev ? { ...prev, ...d.campaign } : prev));
            setCampaigns(prev => prev.map(x => (x.id === d.campaign.id ? { ...x, ...d.campaign } : x)));
            toast.success(`Estado: ${STATUS_LABELS[to as CampaignStatus] || to}`);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo cambiar el estado');
        }
    };

    // «Ver página sin obligar a publicar»: token firmado de una hora que abre
    // la página pública en modo vista previa, con el borrador tal como está
    // GUARDADO — por eso avisa si hay cambios sin guardar.
    const openPreview = async () => {
        if (!c) return;
        if (dirty) { toast.error('Guardá los cambios: la vista previa muestra lo guardado'); return; }
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}/preview-token`, {
                method: 'POST', headers: authHeaders(),
            });
            const d = await r.json();
            if (!r.ok || !d?.token) throw new Error(d?.error);
            window.open(`/maneras-de-contribuir?campaignPreview=${encodeURIComponent(c.id)}&t=${encodeURIComponent(d.token)}`, '_blank', 'noopener');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo abrir la vista previa');
        }
    };

    const removeDraft = async () => {
        if (!c) return;
        if (!window.confirm('¿Eliminar este borrador? Sólo se puede porque nunca se publicó.')) return;
        try {
            const r = await fetch(`${API}/contribution-campaigns/${c.id}`, { method: 'DELETE', headers: authHeaders() });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error);
            setCampaigns(prev => prev.filter(x => x.id !== c.id));
            setC(null);
            toast.success('Borrador eliminado');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo eliminar');
        }
    };

    // ── Imágenes: destino compartido de la Biblioteca y la subida ──
    const setImage = (target: string, url: string) => {
        if (!c) return;
        if (target === 'hero') patchContent({ hero: { ...c.content?.hero, image: url } });
        else if (target === 'og') patchContent({ seo: { ...c.content?.seo, ogImage: url } });
        else if (target.startsWith('partner:')) {
            const idx = Number(target.split(':')[1]);
            const partners = [...(c.content?.partners || [])];
            if (partners[idx]) { partners[idx] = { ...partners[idx], logo: url }; patchContent({ partners }); }
        }
    };

    const onPicked = (items: { url: string }[]) => {
        if (pickerField && items[0]?.url) setImage(pickerField, items[0].url);
        setPickerField(null);
    };

    const startUpload = (target: string) => {
        uploadFieldRef.current = target;
        fileInputRef.current?.click();
    };

    const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Limpiar el input: volver a elegir el MISMO archivo debe disparar change.
        e.target.value = '';
        const target = uploadFieldRef.current;
        if (!file || !target) return;
        setUploading(true);
        try {
            const { uploaded, failed } = await uploadMediaFiles([file]);
            if (failed.length > 0) throw new Error(`${failed[0].name}: ${failed[0].reason}`);
            if (uploaded[0]?.url) { setImage(target, uploaded[0].url); toast.success('Imagen subida'); }
        } catch (err: any) {
            toast.error(err?.message || 'No se pudo subir la imagen');
        } finally {
            setUploading(false);
        }
    };

    // Avisos en vivo de los indicadores (mismo criterio que el servidor).
    const statWarnings = useMemo(() => validateStats(c?.stats), [c?.stats]);
    // Aviso en vivo de los centros: qué filas NO se van a guardar y por qué.
    const centerSkipped = useMemo(() => normalizeCenters(centers).skipped, [centers]);

    const content = c?.content || {};
    const hero = content.hero || {};
    const donateCard = content.donateCard || {};
    const finalCta = content.finalCta || {};
    const seo = content.seo || {};
    const targeting = c?.targeting || { mode: 'clubs', districts: [], clubIds: [] };

    const moveIn = <T,>(list: T[], i: number, dir: -1 | 1): T[] => {
        const j = i + dir;
        if (j < 0 || j >= list.length) return list;
        const out = [...list];
        [out[i], out[j]] = [out[j], out[i]];
        return out;
    };

    if (loading) {
        return <AdminLayout><div className="p-12 text-center text-gray-400 italic">Cargando…</div></AdminLayout>;
    }

    // ═══ LISTADO ═══
    if (!c) {
        return (
            <AdminLayout>
                <div className="max-w-5xl space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center">
                                <Megaphone className="w-6 h-6 text-rose-500" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Campañas de Contribución</h1>
                                <p className="text-sm text-gray-500 mt-1">Configura una campaña y publícala en los sitios que corresponda. Sin campaña activa, cada sitio muestra su página de aportes de siempre.</p>
                            </div>
                        </div>
                        <button onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-rotary-blue text-white hover:bg-sky-800 transition-all shadow-lg active:scale-95">
                            <Plus className="w-4 h-4" /> Nueva campaña
                        </button>
                    </div>

                    {showCreate && (
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                            <div className="grid md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <label className={lbl}>Nombre de la campaña</label>
                                    <input className={field} autoFocus value={newName} placeholder="Ej: Emergencia terremoto Colombia 2026"
                                        onChange={e => setNewName(e.target.value)} />
                                </div>
                                <div>
                                    <label className={lbl}>Tipo</label>
                                    <select className={field} value={newType} onChange={e => setNewType(e.target.value)}>
                                        <optgroup label="Emergencias">
                                            {campaignTypeCatalog().filter(t => t.emergency).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </optgroup>
                                        <optgroup label="Institucionales">
                                            {campaignTypeCatalog().filter(t => !t.emergency).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </optgroup>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-4">
                                <button onClick={create} disabled={creating || !newName.trim()}
                                    className="px-5 py-2.5 rounded-xl font-bold text-sm bg-rotary-blue text-white hover:bg-sky-800 disabled:opacity-50">
                                    {creating ? 'Creando…' : 'Crear borrador'}
                                </button>
                                <button onClick={() => setShowCreate(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
                            </div>
                        </div>
                    )}

                    {campaigns.length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 border border-gray-100 text-center text-gray-400">
                            Todavía no hay campañas. La primera será la del terremoto — crea el borrador y configúrala sección por sección.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {campaigns.map(row => (
                                <button key={row.id} onClick={() => openCampaign(row.id)}
                                    className="w-full text-left bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:border-rotary-blue/30 transition-all flex flex-wrap items-center gap-3">
                                    <div className="flex-1 min-w-[220px]">
                                        <p className="font-bold text-gray-900">{row.name}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {CAMPAIGN_TYPES[row.campaignType]?.label || row.campaignType}
                                            {' · '}{TARGETING_LABELS[(row.targeting?.mode || 'clubs') as TargetingMode]}
                                            {row.startAt && ` · desde ${new Date(row.startAt).toLocaleDateString('es-CO')}`}
                                            {row.endAt && ` hasta ${new Date(row.endAt).toLocaleDateString('es-CO')}`}
                                        </p>
                                    </div>
                                    <StatusChip status={row.status} />
                                    {row.effectiveStatus && row.effectiveStatus !== row.status && (
                                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> hoy: {STATUS_LABELS[row.effectiveStatus as CampaignStatus] || row.effectiveStatus}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </AdminLayout>
        );
    }

    // ═══ EDITOR ═══
    const eff = effectiveStatus(c, now);
    const ways: WayItem[] = content.waysToHelp || [];
    const reqItems: ReqItem[] = content.requiredItems || [];
    const infoBlocks: InfoBlock[] = content.infoBlocks || [];
    const partners: Partner[] = content.partners || [];
    const stats: Stat[] = c.stats || [];

    return (
        <AdminLayout>
            <input ref={fileInputRef} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={onFileChosen} />
            <MediaPicker isOpen={pickerField !== null} onClose={() => setPickerField(null)} onSelect={onPicked} maxSelection={1} />

            <div className="max-w-4xl space-y-6">
                {/* Cabecera */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <button onClick={() => setC(null)} aria-label="Volver al listado"
                            className="p-2.5 rounded-xl text-gray-400 hover:text-rotary-blue hover:bg-gray-50 transition">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-xl font-semibold text-gray-900 tracking-tight truncate">{c.name}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <StatusChip status={c.status} />
                                {eff !== c.status && (
                                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> hoy se sirve como: {STATUS_LABELS[eff as CampaignStatus] || eff}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={openPreview}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-rotary-blue hover:bg-gray-50 transition">
                            <Eye className="w-4 h-4" /> Ver página
                        </button>
                        <button onClick={() => setShowHistory(v => !v)}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-rotary-blue hover:bg-gray-50 transition">
                            <History className="w-4 h-4" /> Historial
                        </button>
                        <button onClick={save} disabled={saving || !dirty}
                            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 ${dirty ? 'bg-rotary-blue text-white hover:bg-sky-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}`}>
                            <Save className="w-4 h-4" /> {saving ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </div>

                {dirty && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2 font-medium">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Tienes cambios sin guardar.
                    </div>
                )}

                {/* Estados */}
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`${lbl} mr-2`}>Estado</span>
                        {([
                            ['active', 'Publicar ahora'],
                            ['scheduled', 'Programar por fechas'],
                            ['paused', 'Pausar'],
                            ['finished', 'Finalizar'],
                            ['archived', 'Archivar'],
                            ['draft', 'Volver a borrador'],
                        ] as [string, string][]).filter(([to]) => canTransition(c.status, to)).map(([to, label]) => (
                            <button key={to} onClick={() => transition(to)}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition ${to === 'active' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                                {label}
                            </button>
                        ))}
                        {c.status === 'draft' && !c.publishedAt && (
                            <button onClick={removeDraft}
                                className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-red-400 hover:text-red-600 hover:bg-red-50 transition">
                                <Trash2 className="w-4 h-4" /> Eliminar borrador
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-gray-400 mt-3">
                        «Programar» respeta las fechas de inicio y fin; «Publicar ahora» también las respeta si están puestas.
                        Al publicar, la página «Maneras de Contribuir» de los sitios alcanzados pasa a mostrar la campaña; al despublicar, vuelven a su página de siempre.
                    </p>
                    {publishErrors.length > 0 && (
                        <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4">
                            <p className="text-sm font-bold text-red-700 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" /> Para poder publicarse falta:</p>
                            <ul className="text-sm text-red-600 space-y-1 list-disc pl-5">
                                {publishErrors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}
                </div>

                {showHistory && (
                    <Card title="Historial" hint="Quién hizo qué y cuándo. Cada cambio de estado queda registrado.">
                        {history.length === 0 ? <p className="text-sm text-gray-400 italic">Sin movimientos todavía.</p> : (
                            <ul className="space-y-2">
                                {history.map((h, i) => (
                                    <li key={i} className="text-sm text-gray-600 flex items-center gap-3">
                                        <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{new Date(h.createdAt).toLocaleString('es-CO')}</span>
                                        <span className="font-bold">{h.action}</span>
                                        {h.actor && <span className="text-gray-400">— {h.actor}</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                )}

                {/* Identidad */}
                <Card title="Identidad y vigencia">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className={lbl}>Nombre</label>
                            <input className={field} value={c.name} onChange={e => patch({ name: e.target.value })} />
                        </div>
                        <div>
                            <label className={lbl}>Tipo de campaña</label>
                            <select className={field} value={c.campaignType} onChange={e => patch({ campaignType: e.target.value })}>
                                <optgroup label="Emergencias">
                                    {campaignTypeCatalog().filter(t => t.emergency).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </optgroup>
                                <optgroup label="Institucionales">
                                    {campaignTypeCatalog().filter(t => !t.emergency).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </optgroup>
                            </select>
                        </div>
                        <div>
                            <label className={lbl}>Prioridad (si dos campañas alcanzan un sitio, gana la mayor)</label>
                            <input type="number" className={field} value={c.priority}
                                onChange={e => patch({ priority: Math.trunc(Number(e.target.value) || 0) })} />
                        </div>
                        <div>
                            <label className={lbl}>Inicio (opcional)</label>
                            <input type="datetime-local" className={field} value={toLocalInput(c.startAt)}
                                onChange={e => patch({ startAt: fromLocalInput(e.target.value) })} />
                        </div>
                        <div>
                            <label className={lbl}>Fin (opcional)</label>
                            <input type="datetime-local" className={field} value={toLocalInput(c.endAt)}
                                onChange={e => patch({ endAt: fromLocalInput(e.target.value) })} />
                        </div>
                    </div>
                </Card>

                {/* Alcance */}
                <Card title="Alcance (targeting)" hint="En qué sitios se muestra la campaña. Los sitios no alcanzados siguen con su página de siempre.">
                    <div className="space-y-4">
                        <div className="flex gap-2 flex-wrap">
                            {(['all', 'districts', 'clubs'] as TargetingMode[]).map(m => (
                                <button key={m} type="button"
                                    onClick={() => patch({ targeting: { ...targeting, mode: m } })}
                                    className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition ${targeting.mode === m ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                                    {TARGETING_LABELS[m]}
                                </button>
                            ))}
                        </div>
                        {targeting.mode === 'districts' && (
                            <div>
                                <label className={lbl}>Números de distrito (separados por coma)</label>
                                <input className={field} placeholder="4281, 4271"
                                    value={(targeting.districts || []).join(', ')}
                                    onChange={e => patch({
                                        targeting: {
                                            ...targeting,
                                            districts: e.target.value.split(/[^0-9]+/).filter(Boolean),
                                        },
                                    })} />
                                <p className="text-xs text-gray-400 mt-1.5">Alcanza a los sitios vinculados a esos distritos, por su vínculo o por su número — «4271, 4281» cuenta para los dos.</p>
                            </div>
                        )}
                        {targeting.mode === 'clubs' && (
                            <div>
                                <label className={lbl}>Sitios ({(targeting.clubIds || []).length} seleccionados)</label>
                                <div className="mt-1.5 max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                                    {clubs.map(cl => {
                                        const checked = (targeting.clubIds || []).includes(cl.id);
                                        return (
                                            <label key={cl.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                                                <input type="checkbox" checked={checked}
                                                    onChange={() => patch({
                                                        targeting: {
                                                            ...targeting,
                                                            clubIds: checked
                                                                ? (targeting.clubIds || []).filter((x: string) => x !== cl.id)
                                                                : [...(targeting.clubIds || []), cl.id],
                                                        },
                                                    })} className="w-4 h-4 accent-rotary-blue" />
                                                <span className="text-sm font-medium text-gray-700">{cl.name}</span>
                                                {cl.district && <span className="text-xs text-gray-400">D. {cl.district}</span>}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Hero */}
                <Card title="Hero" hint="La apertura de la campaña: título, mensaje y los dos botones.">
                    <div className="space-y-4">
                        <div><label className={lbl}>Título</label>
                            <input className={field} placeholder="COLOMBIA NOS NECESITA" value={hero.title || ''}
                                onChange={e => patchContent({ hero: { ...hero, title: e.target.value } })} /></div>
                        <div><label className={lbl}>Subtítulo</label>
                            <input className={field} value={hero.subtitle || ''}
                                onChange={e => patchContent({ hero: { ...hero, subtitle: e.target.value } })} /></div>
                        <div><label className={lbl}>Texto</label>
                            <textarea rows={3} className={`${field} resize-none`} value={hero.text || ''}
                                onChange={e => patchContent({ hero: { ...hero, text: e.target.value } })} /></div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div><label className={lbl}>Mensaje destacado</label>
                                <input className={field} placeholder="Tu ayuda hace la diferencia." value={hero.highlight || ''}
                                    onChange={e => patchContent({ hero: { ...hero, highlight: e.target.value } })} /></div>
                            <div><label className={lbl}>Etiqueta de emergencia</label>
                                <input className={field} placeholder="EMERGENCIA · TERREMOTO COLOMBIA" value={hero.badge || ''}
                                    onChange={e => patchContent({ hero: { ...hero, badge: e.target.value } })} /></div>
                        </div>
                        <div>
                            <label className={lbl}>Imagen del hero</label>
                            <div className="flex items-center gap-2 mt-1.5">
                                <input className={`${field} mt-0 flex-1`} placeholder="URL de la imagen" value={hero.image || ''}
                                    onChange={e => patchContent({ hero: { ...hero, image: e.target.value } })} />
                                <button type="button" onClick={() => startUpload('hero')} disabled={uploading}
                                    className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                                    <Upload className="w-4 h-4" /> Subir
                                </button>
                                <button type="button" onClick={() => setPickerField('hero')}
                                    className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                    <ImageIcon className="w-4 h-4" /> Biblioteca
                                </button>
                            </div>
                            {hero.image && <img src={hero.image} alt={hero.imageAlt || 'Imagen del hero'} className="mt-3 h-32 rounded-xl object-cover border border-gray-100" />}
                        </div>
                        <div><label className={lbl}>Texto alternativo de la imagen (accesibilidad)</label>
                            <input className={field} value={hero.imageAlt || ''}
                                onChange={e => patchContent({ hero: { ...hero, imageAlt: e.target.value } })} /></div>
                        <CtaEditor label="CTA primario" value={hero.ctaPrimary || { ...emptyCta(), action: 'donate' }}
                            onChange={v => patchContent({ hero: { ...hero, ctaPrimary: v } })} />
                        <CtaEditor label="CTA secundario" value={hero.ctaSecondary || { ...emptyCta(), action: 'centers' }}
                            onChange={v => patchContent({ hero: { ...hero, ctaSecondary: v } })} />
                    </div>
                </Card>

                {/* Tarjeta de aporte */}
                <Card title="Tarjeta de aporte" hint="La tarjeta que abre el formulario de pago. Usa la pasarela de siempre: nada nuevo que configurar.">
                    <div className="space-y-4">
                        <div><label className={lbl}>Título</label>
                            <input className={field} placeholder="Aporte para la emergencia" value={donateCard.title || ''}
                                onChange={e => patchContent({ donateCard: { ...donateCard, title: e.target.value } })} /></div>
                        <div><label className={lbl}>Descripción</label>
                            <textarea rows={2} className={`${field} resize-none`} value={donateCard.description || ''}
                                onChange={e => patchContent({ donateCard: { ...donateCard, description: e.target.value } })} /></div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div><label className={lbl}>Etiqueta</label>
                                <input className={field} placeholder="EMERGENCIA · TERREMOTO COLOMBIA" value={donateCard.badge || ''}
                                    onChange={e => patchContent({ donateCard: { ...donateCard, badge: e.target.value } })} /></div>
                            <div><label className={lbl}>Texto del botón</label>
                                <input className={field} placeholder="APORTAR AHORA" value={donateCard.buttonText || ''}
                                    onChange={e => patchContent({ donateCard: { ...donateCard, buttonText: e.target.value } })} /></div>
                        </div>
                    </div>
                </Card>

                {/* Cómo ayudar */}
                <Card title="¿Cómo puedes ayudar?" hint="Hasta ocho opciones con su icono, texto y botón.">
                    <div className="space-y-3">
                        {ways.map((w, i) => (
                            <div key={w.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={w.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Visible
                                    </label>
                                    <RowTools
                                        onUp={() => patchContent({ waysToHelp: moveIn(ways, i, -1) })}
                                        onDown={() => patchContent({ waysToHelp: moveIn(ways, i, 1) })}
                                        onRemove={() => patchContent({ waysToHelp: ways.filter((_, j) => j !== i) })} />
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <input className={field} placeholder="Título" value={w.title}
                                        onChange={e => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                                    <input className={field} placeholder="Icono (ej: heart, globe, gift)" value={w.icon}
                                        onChange={e => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, icon: e.target.value } : x) })} />
                                </div>
                                <textarea rows={2} className={`${field} resize-none`} placeholder="Descripción" value={w.description}
                                    onChange={e => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })} />
                                <CtaEditor label="Botón" value={w.cta || emptyCta()}
                                    onChange={v => patchContent({ waysToHelp: ways.map((x, j) => j === i ? { ...x, cta: v } : x) })} />
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patchContent({ waysToHelp: [...ways, { id: `way-${Date.now()}`, icon: 'heart', title: '', description: '', cta: emptyCta(), active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar opción
                        </button>
                    </div>
                </Card>

                {/* Elementos requeridos */}
                <Card title="Elementos que se requieren" hint="La lista de suministros prioritarios.">
                    <div className="space-y-3">
                        {reqItems.map((it, i) => (
                            <div key={it.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={it.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patchContent({ requiredItems: reqItems.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Visible
                                    </label>
                                    <RowTools
                                        onUp={() => patchContent({ requiredItems: moveIn(reqItems, i, -1) })}
                                        onDown={() => patchContent({ requiredItems: moveIn(reqItems, i, 1) })}
                                        onRemove={() => patchContent({ requiredItems: reqItems.filter((_, j) => j !== i) })} />
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <input className={field} placeholder="Título (ej: Alimentos no perecederos)" value={it.title}
                                        onChange={e => patchContent({ requiredItems: reqItems.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                                    <input className={field} placeholder="Icono" value={it.icon}
                                        onChange={e => patchContent({ requiredItems: reqItems.map((x, j) => j === i ? { ...x, icon: e.target.value } : x) })} />
                                </div>
                                <input className={field} placeholder="Descripción (opcional)" value={it.description}
                                    onChange={e => patchContent({ requiredItems: reqItems.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })} />
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patchContent({ requiredItems: [...reqItems, { id: `item-${Date.now()}`, icon: 'gift', title: '', description: '', active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar elemento
                        </button>
                    </div>
                </Card>

                {/* Centros de acopio (F3) */}
                <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between gap-3 mb-1">
                        <h3 className="text-lg font-bold text-gray-800">Centros de acopio</h3>
                        <button onClick={saveCenters} disabled={savingCenters || !centersDirty}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${centersDirty ? 'bg-rotary-blue text-white hover:bg-sky-800 shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                            <Save className="w-4 h-4" /> {savingCenters ? 'Guardando…' : 'Guardar centros'}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mb-5">
                        Estructurados por ciudad y sector — se guardan con su propio botón, aparte del resto de la campaña.
                        Ciudad y dirección son obligatorias: una fila sin ellas no se publica y se avisa. El orden de la lista es el orden en la página.
                    </p>
                    <div className="space-y-3">
                        {centers.map((ct, i) => (
                            <div key={ct.id || i} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={ct.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, active: e.target.checked } : x)); setCentersDirty(true); }} />
                                        Activo
                                    </label>
                                    <RowTools
                                        onUp={() => { setCenters(moveIn(centers, i, -1)); setCentersDirty(true); }}
                                        onDown={() => { setCenters(moveIn(centers, i, 1)); setCentersDirty(true); }}
                                        onRemove={() => { setCenters(centers.filter((_, j) => j !== i)); setCentersDirty(true); }} />
                                </div>
                                <div className="grid md:grid-cols-3 gap-3">
                                    <input className={field} placeholder="Ciudad *" value={ct.city || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, city: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Sector (ej: Norte, Centro, Sur)" value={ct.groupLabel || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, groupLabel: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Nombre del punto (opcional)" value={ct.name || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); setCentersDirty(true); }} />
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <input className={field} placeholder="Dirección *" value={ct.address || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, address: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Complemento (torre, apto, referencia)" value={ct.complement || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, complement: e.target.value } : x)); setCentersDirty(true); }} />
                                </div>
                                <div className="grid md:grid-cols-3 gap-3">
                                    <input className={field} placeholder="Horario (ej: 9 am a 3 pm)" value={ct.schedule || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, schedule: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Recibe (persona de contacto)" value={ct.contactName || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, contactName: e.target.value } : x)); setCentersDirty(true); }} />
                                    <input className={field} placeholder="Teléfono" value={ct.phone || ''}
                                        onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, phone: e.target.value } : x)); setCentersDirty(true); }} />
                                </div>
                                <input className={field} placeholder="Notas (opcional)" value={ct.notes || ''}
                                    onChange={e => { setCenters(centers.map((x, j) => j === i ? { ...x, notes: e.target.value } : x)); setCentersDirty(true); }} />
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => { setCenters([...centers, { id: `center-${Date.now()}`, city: '', groupLabel: '', name: '', address: '', complement: '', schedule: '', contactName: '', phone: '', notes: '', active: true }]); setCentersDirty(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar centro
                        </button>
                        {centerSkipped.length > 0 && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                                {centerSkipped.length} centro(s) no se guardarán: {centerSkipped.map(s => `fila ${s.index + 1} ${s.reason}`).join(', ')}.
                            </div>
                        )}
                        <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-gray-50">
                            <div>
                                <label className={lbl}>Nota bajo el título (se guarda con la campaña)</label>
                                <input className={field} placeholder="Se habilitarán más puntos en otras ciudades de acuerdo con las necesidades."
                                    value={content.centersNote || ''}
                                    onChange={e => patchContent({ centersNote: e.target.value })} />
                            </div>
                            <div>
                                <label className={lbl}>Alianza (al pie de los centros)</label>
                                <input className={field} placeholder="En alianza con el Banco de Alimentos — ABACO"
                                    value={content.centersAlliance || ''}
                                    onChange={e => patchContent({ centersAlliance: e.target.value })} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Indicadores */}
                <Card title="Panorama de la emergencia" hint="Cada cifra necesita su fuente y su fecha: un indicador sin fuente no se publica — lo bloquea el servidor, no esta pantalla.">
                    <div className="space-y-3">
                        {stats.map((s, i) => (
                            <div key={s.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={s.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Publicado
                                    </label>
                                    <RowTools
                                        onUp={() => patch({ stats: moveIn(stats, i, -1) })}
                                        onDown={() => patch({ stats: moveIn(stats, i, 1) })}
                                        onRemove={() => patch({ stats: stats.filter((_, j) => j !== i) })} />
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <input className={field} placeholder="Etiqueta (ej: Fallecidos)" value={s.label}
                                        onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                                    <input className={field} placeholder="Valor (ej: 54)" value={s.value}
                                        onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} />
                                    <input className={field} placeholder="Fuente (ej: UNGRD, corte 14/08/2026)" value={s.source}
                                        onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, source: e.target.value } : x) })} />
                                    <input type="date" className={field} value={(s.updatedAt || '').slice(0, 10)}
                                        onChange={e => patch({ stats: stats.map((x, j) => j === i ? { ...x, updatedAt: e.target.value } : x) })} />
                                </div>
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patch({ stats: [...stats, { id: `stat-${Date.now()}`, label: '', value: '', source: '', updatedAt: '', active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar indicador
                        </button>
                        {statWarnings.length > 0 && (
                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                                <ul className="text-sm text-amber-700 space-y-1 list-disc pl-5">
                                    {statWarnings.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Bloques informativos */}
                <Card title="Bloques informativos" hint="Las tarjetas de contexto: por qué ayudar, cómo estamos actuando, cómo contribuir.">
                    <div className="space-y-3">
                        {infoBlocks.map((b, i) => (
                            <div key={b.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={b.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patchContent({ infoBlocks: infoBlocks.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Visible
                                    </label>
                                    <RowTools
                                        onUp={() => patchContent({ infoBlocks: moveIn(infoBlocks, i, -1) })}
                                        onDown={() => patchContent({ infoBlocks: moveIn(infoBlocks, i, 1) })}
                                        onRemove={() => patchContent({ infoBlocks: infoBlocks.filter((_, j) => j !== i) })} />
                                </div>
                                <input className={field} placeholder="Título" value={b.title}
                                    onChange={e => patchContent({ infoBlocks: infoBlocks.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                                <textarea rows={3} className={`${field} resize-none`} placeholder="Texto" value={b.text}
                                    onChange={e => patchContent({ infoBlocks: infoBlocks.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patchContent({ infoBlocks: [...infoBlocks, { id: `info-${Date.now()}`, title: '', text: '', active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar bloque
                        </button>
                    </div>
                </Card>

                {/* Cierre final */}
                <Card title="Cierre final" hint="El llamado de alto impacto al pie de la campaña.">
                    <div className="space-y-4">
                        <div><label className={lbl}>Título</label>
                            <input className={field} placeholder="HOY, MÁS QUE NUNCA, UNIDOS PODEMOS LLEVAR ESPERANZA" value={finalCta.title || ''}
                                onChange={e => patchContent({ finalCta: { ...finalCta, title: e.target.value } })} /></div>
                        <div><label className={lbl}>Texto</label>
                            <textarea rows={2} className={`${field} resize-none`} value={finalCta.text || ''}
                                onChange={e => patchContent({ finalCta: { ...finalCta, text: e.target.value } })} /></div>
                        <div><label className={lbl}>Frase</label>
                            <input className={field} placeholder="Servir es estar presentes cuando más nos necesitan." value={finalCta.quote || ''}
                                onChange={e => patchContent({ finalCta: { ...finalCta, quote: e.target.value } })} /></div>
                        <CtaEditor label="CTA primario" value={finalCta.ctaPrimary || { ...emptyCta(), action: 'donate' }}
                            onChange={v => patchContent({ finalCta: { ...finalCta, ctaPrimary: v } })} />
                        <CtaEditor label="CTA secundario" value={finalCta.ctaSecondary || { ...emptyCta(), action: 'centers' }}
                            onChange={v => patchContent({ finalCta: { ...finalCta, ctaSecondary: v } })} />
                    </div>
                </Card>

                {/* Aliados */}
                <Card title="Aliados y logos" hint="Rotary, Colrotarios, ABACO y los que se sumen. Nada va escrito en el código.">
                    <div className="space-y-3">
                        {partners.map((p, i) => (
                            <div key={p.id} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                                        <input type="checkbox" checked={p.active !== false} className="w-4 h-4 accent-rotary-blue"
                                            onChange={e => patchContent({ partners: partners.map((x, j) => j === i ? { ...x, active: e.target.checked } : x) })} />
                                        Visible
                                    </label>
                                    <RowTools
                                        onUp={() => patchContent({ partners: moveIn(partners, i, -1) })}
                                        onDown={() => patchContent({ partners: moveIn(partners, i, 1) })}
                                        onRemove={() => patchContent({ partners: partners.filter((_, j) => j !== i) })} />
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <input className={field} placeholder="Nombre" value={p.name}
                                        onChange={e => patchContent({ partners: partners.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
                                    <input className={field} placeholder="URL (opcional)" value={p.url}
                                        onChange={e => patchContent({ partners: partners.map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input className={`${field} mt-0 flex-1`} placeholder="Logo (URL)" value={p.logo}
                                        onChange={e => patchContent({ partners: partners.map((x, j) => j === i ? { ...x, logo: e.target.value } : x) })} />
                                    <button type="button" onClick={() => startUpload(`partner:${i}`)} disabled={uploading}
                                        className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                                        <Upload className="w-4 h-4" /> Subir
                                    </button>
                                    <button type="button" onClick={() => setPickerField(`partner:${i}`)}
                                        className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                        <ImageIcon className="w-4 h-4" /> Biblioteca
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => patchContent({ partners: [...partners, { id: `partner-${Date.now()}`, name: '', logo: '', url: '', active: true }] })}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10 transition">
                            <Plus className="w-4 h-4" /> Agregar aliado
                        </button>
                    </div>
                </Card>

                {/* SEO */}
                <Card title="SEO y tarjeta social" hint="Cómo se ve la campaña al compartirla por WhatsApp o redes. Se aplica en la Fase 2, cuando la página pública tome la campaña.">
                    <div className="space-y-4">
                        <div><label className={lbl}>Meta título</label>
                            <input className={field} value={seo.title || ''}
                                onChange={e => patchContent({ seo: { ...seo, title: e.target.value } })} /></div>
                        <div><label className={lbl}>Meta descripción</label>
                            <textarea rows={2} className={`${field} resize-none`} value={seo.description || ''}
                                onChange={e => patchContent({ seo: { ...seo, description: e.target.value } })} /></div>
                        <div>
                            <label className={lbl}>Imagen OG (la de la tarjeta al compartir)</label>
                            <div className="flex items-center gap-2 mt-1.5">
                                <input className={`${field} mt-0 flex-1`} placeholder="URL de la imagen" value={seo.ogImage || ''}
                                    onChange={e => patchContent({ seo: { ...seo, ogImage: e.target.value } })} />
                                <button type="button" onClick={() => startUpload('og')} disabled={uploading}
                                    className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 disabled:opacity-50">
                                    <Upload className="w-4 h-4" /> Subir
                                </button>
                                <button type="button" onClick={() => setPickerField('og')}
                                    className="flex items-center gap-1.5 px-3 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100">
                                    <ImageIcon className="w-4 h-4" /> Biblioteca
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="bg-sky-50/60 rounded-3xl p-6 border border-sky-100 text-sm text-gray-600">
                    <p className="font-bold text-gray-700 mb-1 flex items-center gap-2"><Eye className="w-4 h-4" /> Qué pinta ya la página pública</p>
                    <p>Con la campaña publicada, los sitios alcanzados muestran el <b>hero</b>, la <b>tarjeta de aporte</b> (pasarela de siempre, en la moneda del club), <b>¿cómo puedes ayudar?</b>, los <b>elementos requeridos</b>, los <b>centros de acopio</b> por ciudad y los <b>aliados</b>. Los <b>indicadores, bloques informativos y cierre</b> llegan en la Fase 4 — ya se pueden configurar y quedan guardados. Un botón que apunte a los centros sólo se pinta si hay centros publicados.</p>
                </div>
            </div>
        </AdminLayout>
    );
};

export default ContributionCampaigns;
