/**
 * Programas — pestaña «Página pública» (v4.1281.0): el editor de contenedores.
 *
 * Lista de contenedores en el orden de la landing (activar, reordenar con
 * controles accesibles, agregar, quitar) y, a la derecha, el editor del
 * contenedor elegido: textos, imagen de la Biblioteca con texto alternativo
 * y punto de enfoque, íconos de lista cerrada, botones con acción controlada,
 * fondo y distribución acotados. Guardar escribe el BORRADOR (con bloqueo
 * optimista); «Vista previa» lo muestra con token firmado; «Publicar» lo
 * copia a la versión pública y guarda la versión.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, Eye, Send, ArrowUp, ArrowDown, Plus, Trash2, AlertTriangle, CheckCircle2, RotateCcw, History, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { api, ApiError } from './api';
import { Tarjeta, Campo, campo, btnPrimario, btnSecundario, Toggle, ImageField, Cargando } from './ui';
import { BLOCK_TYPES, BLOCK_TYPE_IDS, BACKGROUNDS, ICONS, BUTTON_ACTIONS, DETAIL_ANCHORS, FORM_TARGETS, SOURCE_TABS, validateLandingLight, type Landing, type LandingBlock, type LandingButton } from '../../../lib/programLandingSpec';
import { dateTimeLabel } from '../../../lib/programSpec';
import ProgramIcon from '../../programas/ProgramIcon';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

interface Payload {
    draft: Landing; published: Landing | null; exists: boolean; draftVersion: number; publishedVersion: number | null; unpublishedChanges: boolean;
    updatedByName?: string | null; updatedAt?: string | null; publishedByName?: string | null; publishedAt?: string | null;
    notes: Record<string, { ready: boolean; notes: string[] }>;
    sources: { clinics: number; stories: { id: string; title: string; date?: string }[]; resources: number; resourcesByType: Record<string, number>; indicators: { id: string; name: string; value: string; unit: string; period: string }[]; donation: { receiver: string; verifiedAt?: string; url: string } | null; formsEnabled: Record<string, boolean> };
    slug: string; canEdit: boolean; canPublish: boolean;
}

const setPath = (o: any, path: string, v: any) => { const n = structuredClone(o); const ks = path.split('.'); let c = n; for (let i = 0; i < ks.length - 1; i++) { c[ks[i]] = c[ks[i]] ?? {}; c = c[ks[i]]; } c[ks[ks.length - 1]] = v; return n; };

const IconSelect = ({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) => (
    <div className="flex items-center gap-2">
        <span className="text-rotary-blue"><ProgramIcon id={value} className="w-6 h-6" gold /></span>
        <select className={campo} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} aria-label="Ícono">{ICONS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}</select>
    </div>
);

const ButtonEditor = ({ value, onChange, blocks, label = 'Botón', fixedAction, disabled }: { value: LandingButton; onChange: (b: LandingButton) => void; blocks: LandingBlock[]; label?: string; fixedAction?: string; disabled?: boolean }) => {
    const set = (k: string, v: any) => onChange(setPath(value, k, v));
    const t = value.action?.type || 'none';
    return (
        <div className="rounded-xl border border-gray-100 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">{label}</p>
            <div className="grid sm:grid-cols-2 gap-2">
                <input className={campo} placeholder="Texto del botón (vacío = oculto)" value={value.label || ''} disabled={disabled} onChange={e => set('label', e.target.value)} />
                <IconSelect value={value.icon || 'star'} onChange={v => set('icon', v)} disabled={disabled} />
                <select className={campo} value={value.variant || 'primary'} disabled={disabled} onChange={e => set('variant', e.target.value)}><option value="primary">Estilo: principal (azul)</option><option value="secondary">Estilo: claro (azul muy claro)</option><option value="gold">Estilo: dorado</option></select>
                {fixedAction ? <p className="text-xs text-gray-500 self-center">Acción fija: {BUTTON_ACTIONS.find(a => a.id === fixedAction)?.label}</p> : (
                    <select className={campo} value={t} disabled={disabled} onChange={e => onChange({ ...value, action: { type: e.target.value, target: '' } })}>{BUTTON_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
                )}
            </div>
            {!fixedAction && t === 'section' ? <select className={campo} value={value.action.target} disabled={disabled} onChange={e => set('action.target', e.target.value)}><option value="">Elige el contenedor…</option>{blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select> : null}
            {!fixedAction && t === 'detail' ? <select className={campo} value={value.action.target || 'programa'} disabled={disabled} onChange={e => set('action.target', e.target.value)}>{DETAIL_ANCHORS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select> : null}
            {!fixedAction && t === 'form' ? <select className={campo} value={value.action.target || 'orientacion'} disabled={disabled} onChange={e => set('action.target', e.target.value)}>{FORM_TARGETS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select> : null}
            {!fixedAction && t === 'internal' ? <input className={campo} placeholder="/ruta-del-sitio" value={value.action.target} disabled={disabled} onChange={e => set('action.target', e.target.value)} /> : null}
            {!fixedAction && t === 'external' ? <input className={campo} placeholder="https://…" value={value.action.target} disabled={disabled} onChange={e => set('action.target', e.target.value)} /> : null}
            {!fixedAction && t === 'donation' ? <p className="text-[11px] text-gray-500">Usa el enlace de donación publicado y verificado del programa (fuente única). Sin él, el botón no se muestra en público.</p> : null}
        </div>
    );
};

const ImageEditor = ({ value, onChange, clubId, label = 'Imagen', disabled }: { value: any; onChange: (v: any) => void; clubId: string | null; label?: string; disabled?: boolean }) => (
    <div className="space-y-2">
        <ImageField label={label} value={value?.url || ''} onChange={v => onChange({ ...value, url: v })} alt={value?.alt || ''} onAlt={v => onChange({ ...value, alt: v })} clubId={clubId} hint="Sólo fotografías reales autorizadas. Sin imagen, la vista previa muestra el marcador «Fotografía real autorizada» y en público la columna se omite." />
        {value?.url ? <div className="grid grid-cols-3 gap-3 text-xs text-gray-600"><label>Enfoque horizontal ({value.focalX ?? 50}%)<input type="range" min={0} max={100} value={value.focalX ?? 50} disabled={disabled} onChange={e => onChange({ ...value, focalX: Number(e.target.value) })} className="w-full" /></label><label>Enfoque vertical ({value.focalY ?? 50}%)<input type="range" min={0} max={100} value={value.focalY ?? 50} disabled={disabled} onChange={e => onChange({ ...value, focalY: Number(e.target.value) })} className="w-full" /></label><label>Acercamiento ({value.zoom ?? 100}%)<input type="range" min={100} max={200} value={value.zoom ?? 100} disabled={disabled} onChange={e => onChange({ ...value, zoom: Number(e.target.value) })} className="w-full" /></label></div> : null}
    </div>
);

const Lista = ({ items, render, onAdd, onRemove, onMove, addLabel, disabled }: { items: any[]; render: (it: any, i: number) => React.ReactNode; onAdd: () => void; onRemove: (i: number) => void; onMove: (i: number, d: -1 | 1) => void; addLabel: string; disabled?: boolean }) => (
    <div className="space-y-3">
        {items.map((it, i) => (
            <div key={it.id || i} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-end gap-1 mb-2">
                    <button type="button" className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={disabled || i === 0} onClick={() => onMove(i, -1)} aria-label="Subir"><ArrowUp className="w-4 h-4" /></button>
                    <button type="button" className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={disabled || i === items.length - 1} onClick={() => onMove(i, 1)} aria-label="Bajar"><ArrowDown className="w-4 h-4" /></button>
                    <button type="button" className="p-1 text-gray-400 hover:text-rose-600 disabled:opacity-30" disabled={disabled} onClick={() => onRemove(i)} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
                </div>
                {render(it, i)}
            </div>
        ))}
        <button type="button" className={btnSecundario} disabled={disabled} onClick={onAdd}><Plus className="w-4 h-4" /> {addLabel}</button>
    </div>
);

const ProgramaPaginaTab = ({ data }: { data: Detalle }) => {
    const [p, setP] = useState<Payload | null>(null);
    const [landing, setLanding] = useState<Landing | null>(null);
    const [sel, setSel] = useState<string>('');
    const [dirty, setDirty] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [versiones, setVersiones] = useState<any[] | null>(null);
    const [nuevoTipo, setNuevoTipo] = useState('cards');

    const cargar = useCallback(async () => {
        try { const r = await api<Payload>(`/admin/${data.program.id}/landing`); setP(r); setLanding(r.draft); setDirty(false); setSel(s => s || r.draft.blocks[0]?.id || ''); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cargar la página.'); }
    }, [data.program.id]);
    useEffect(() => { cargar(); }, [cargar]);
    useEffect(() => {
        if (!dirty) return;
        const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
    }, [dirty]);

    const ro = !p?.canEdit;
    const block = useMemo(() => landing?.blocks.find(b => b.id === sel) || null, [landing, sel]);
    const update = (fn: (l: Landing) => Landing) => { setLanding(l => (l ? fn(l) : l)); setDirty(true); };
    const setBlock = (path: string, v: any) => update(l => ({ ...l, blocks: l.blocks.map(b => (b.id === sel ? setPath(b, path, v) : b)) }));
    const moveBlock = (id: string, d: -1 | 1) => update(l => { const i = l.blocks.findIndex(b => b.id === id); const j = i + d; if (i < 0 || j < 0 || j >= l.blocks.length) return l; const arr = [...l.blocks]; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...l, blocks: arr }; });
    const removeBlock = (id: string) => { if (!window.confirm('¿Quitar este contenedor de la página? Podrás volver a agregarlo.')) return; update(l => ({ ...l, blocks: l.blocks.filter(b => b.id !== id) })); if (sel === id) setSel(''); };
    const addBlock = async () => {
        try { const r = await api<{ block: LandingBlock }>(`/admin/landing/new-block?type=${nuevoTipo}`); update(l => ({ ...l, blocks: [...l.blocks, r.block] })); setSel(r.block.id); }
        catch (e: any) { toast.error(e?.message || 'No se pudo agregar.'); }
    };

    const guardar = async () => {
        if (!landing || !p) return;
        const errs = validateLandingLight(landing);
        if (errs.length) { toast.error(errs[0].message); if (errs[0].blockId) setSel(errs[0].blockId); return; }
        setGuardando(true);
        try {
            const r = await api<Payload>(`/admin/${data.program.id}/landing`, { method: 'PUT', body: JSON.stringify({ landing, baseVersion: p.draftVersion }) });
            setP(r); setLanding(r.draft); setDirty(false); toast.success('Borrador guardado. La página pública no cambia hasta publicar.');
        } catch (e: any) {
            if (e instanceof ApiError && e.code === 'LANDING_CONFLICT') toast.error(e.message, { duration: 10000 }); else toast.error(e?.message || 'No se pudo guardar.');
        } finally { setGuardando(false); }
    };
    const publicar = async () => {
        if (!p) return;
        if (dirty) { toast.error('Guarda el borrador antes de publicar.'); return; }
        if (!window.confirm('¿Publicar esta versión de la página? El público verá exactamente el borrador guardado; los contenedores sin datos publicables seguirán ocultos.')) return;
        setGuardando(true);
        try { const r = await api<Payload>(`/admin/${data.program.id}/landing/publish`, { method: 'POST', body: JSON.stringify({ baseVersion: p.draftVersion }) }); setP(r); setLanding(r.draft); toast.success(`Página publicada (versión ${r.publishedVersion}).`); }
        catch (e: any) { toast.error(e?.message || 'No se pudo publicar.', { duration: 8000 }); }
        finally { setGuardando(false); }
    };
    const vistaPrevia = async () => {
        if (dirty) { toast.error('Guarda el borrador: la vista previa muestra lo guardado.'); return; }
        try { const r = await api<{ token: string; slug: string }>(`/admin/${data.program.id}/preview-token`, { method: 'POST' }); window.open(`/programas/${encodeURIComponent(r.slug)}?t=${encodeURIComponent(r.token)}`, '_blank', 'noopener'); }
        catch (e: any) { toast.error(e?.message || 'No se pudo abrir la vista previa.'); }
    };
    const restaurar = async (version?: number) => {
        if (!window.confirm(version ? `¿Restaurar la versión publicada ${version} al borrador?` : '¿Volver el borrador al diseño inicial de la referencia? Se pierden los cambios no publicados.')) return;
        try { const r = await api<Payload>(`/admin/${data.program.id}/landing/${version ? 'restore' : 'reset'}`, { method: 'POST', body: JSON.stringify({ version }) }); setP(r); setLanding(r.draft); setDirty(false); toast.success('Borrador actualizado.'); }
        catch (e: any) { toast.error(e?.message || 'No se pudo restaurar.'); }
    };
    const verVersiones = async () => { try { setVersiones((await api<{ versions: any[] }>(`/admin/${data.program.id}/landing/versions`)).versions); } catch (e: any) { toast.error(e?.message || 'No se pudo cargar.'); } };

    if (!p || !landing) return <Cargando />;
    const c: any = block?.content || {};
    const notes = block ? p.notes[block.id] : null;
    const srcTab = block && BLOCK_TYPES[block.type]?.source ? SOURCE_TABS[BLOCK_TYPES[block.type].source as string] : null;
    const singlesPresent = new Set(landing.blocks.filter(b => BLOCK_TYPES[b.type]?.single).map(b => b.type));

    return (
        <div className="space-y-5">
            <Tarjeta title="Página pública" actions={<div className="flex flex-wrap gap-2">
                {p.canEdit ? <button type="button" className={btnSecundario} onClick={() => restaurar()}><RotateCcw className="w-4 h-4" /> Diseño inicial</button> : null}
                <button type="button" className={btnSecundario} onClick={verVersiones}><History className="w-4 h-4" /> Versiones</button>
                <button type="button" className={btnSecundario} onClick={vistaPrevia}><Eye className="w-4 h-4" /> Vista previa</button>
                {p.canEdit ? <button type="button" className={btnPrimario} disabled={guardando || !dirty} onClick={guardar}><Save className="w-4 h-4" /> Guardar borrador</button> : null}
                {p.canPublish ? <button type="button" className={btnPrimario} disabled={guardando || dirty || !p.exists} onClick={publicar}><Send className="w-4 h-4" /> Publicar</button> : null}
            </div>}>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                    <span>Borrador: versión {p.draftVersion}{p.updatedByName ? ` · ${p.updatedByName} ${dateTimeLabel(p.updatedAt)}` : p.exists ? '' : ' · diseño inicial (sin guardar)'}</span>
                    <span>{p.publishedVersion ? `Publicada: versión ${p.publishedVersion} · ${p.publishedByName || ''} ${dateTimeLabel(p.publishedAt)}` : 'Sin versión publicada: el público ve el diseño inicial con los contenedores que tengan datos.'}</span>
                    {dirty ? <span className="text-amber-700 font-semibold">Cambios sin guardar</span> : p.unpublishedChanges ? <span className="text-amber-700 font-semibold">Borrador con cambios sin publicar</span> : p.exists ? <span className="text-emerald-700 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Publicado al día</span> : null}
                </div>
                <p className="text-[11px] text-gray-500 mt-2">Página pública: <Link to={`/programas/${p.slug}`} target="_blank" className="text-rotary-blue hover:underline">/programas/{p.slug}</Link> · detalle: /programas/{p.slug}/detalle. Un contenedor sin datos publicables (indicadores, clínicas, historias, recursos, donación) se muestra en la vista previa con marcadores y se oculta en público.</p>
                {versiones ? <div className="mt-3 rounded-xl border border-gray-100 p-3 text-sm"><p className="text-xs font-semibold text-gray-700 mb-1">Versiones publicadas</p>{versiones.length === 0 ? <p className="text-xs text-gray-500">Todavía no se publicó ninguna versión.</p> : <ul className="divide-y divide-gray-100">{versiones.map(v => <li key={v.id} className="py-1.5 flex items-center gap-3"><span className="font-semibold">v{v.version}</span><span className="text-xs text-gray-500 flex-1">{v.publishedByName || ''} · {dateTimeLabel(v.publishedAt)}{v.note ? ` · ${v.note}` : ''}</span>{p.canEdit ? <button type="button" className="text-xs text-rotary-blue hover:underline" onClick={() => restaurar(v.version)}>Restaurar al borrador</button> : null}</li>)}</ul>}</div> : null}
            </Tarjeta>

            <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
                <Tarjeta title="Contenedores" className="lg:sticky lg:top-4">
                    <ol className="space-y-1.5">
                        {landing.blocks.map((b, i) => {
                            const n = p.notes[b.id];
                            return (
                                <li key={b.id} className={`rounded-xl border px-2.5 py-2 flex items-center gap-2 ${sel === b.id ? 'border-rotary-blue bg-sky-50' : 'border-gray-100'} ${b.enabled ? '' : 'opacity-60'}`}>
                                    <button type="button" className="flex-1 text-left min-w-0" onClick={() => setSel(b.id)}>
                                        <span className="block text-sm font-semibold text-gray-900 truncate">{i + 1}. {b.name}</span>
                                        <span className="block text-[11px] text-gray-500">{BLOCK_TYPES[b.type]?.label}{!b.enabled ? ' · desactivado' : n && !n.ready ? ' · oculto en público' : ''}</span>
                                    </button>
                                    {n && !n.ready && b.enabled ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-label="Faltan datos" /> : null}
                                    <div className="flex flex-col">
                                        <button type="button" className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={ro || i === 0} onClick={() => moveBlock(b.id, -1)} aria-label={`Subir ${b.name}`}><ArrowUp className="w-3.5 h-3.5" /></button>
                                        <button type="button" className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={ro || i === landing.blocks.length - 1} onClick={() => moveBlock(b.id, 1)} aria-label={`Bajar ${b.name}`}><ArrowDown className="w-3.5 h-3.5" /></button>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                    {p.canEdit ? (
                        <div className="flex gap-2 mt-4">
                            <select className={campo} value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)}>{BLOCK_TYPE_IDS.filter(t => !(BLOCK_TYPES[t].single && singlesPresent.has(t))).map(t => <option key={t} value={t}>{BLOCK_TYPES[t].label}</option>)}</select>
                            <button type="button" className={btnSecundario} onClick={addBlock}><Plus className="w-4 h-4" /></button>
                        </div>
                    ) : null}
                </Tarjeta>

                {!block ? <Tarjeta><p className="text-sm text-gray-500">Elige un contenedor para editarlo.</p></Tarjeta> : (
                    <Tarjeta title={<span>{block.name} <span className="text-xs font-normal text-gray-500">· {BLOCK_TYPES[block.type]?.label}</span></span>} actions={p.canEdit ? <button type="button" className="text-gray-400 hover:text-rose-600" onClick={() => removeBlock(block.id)} aria-label="Quitar contenedor"><Trash2 className="w-4 h-4" /></button> : null}>
                        <p className="text-[11px] text-gray-500 mb-3">{BLOCK_TYPES[block.type]?.help}</p>
                        {notes && notes.notes.length ? <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 mb-3"><p className="font-semibold mb-1">{notes.ready ? 'Avisos' : 'No se muestra en público todavía'}</p><ul className="list-disc ml-4 space-y-0.5">{notes.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>{srcTab ? <p className="mt-2">Fuente: <Link to={`/admin/programas/${data.program.id}?tab=${srcTab.tab}`} className="font-semibold underline">{srcTab.label}</Link></p> : null}</div> : srcTab ? <p className="text-[11px] text-gray-500 mb-3">Fuente de datos: <Link to={`/admin/programas/${data.program.id}?tab=${srcTab.tab}`} className="text-rotary-blue underline">{srcTab.label}</Link>.</p> : null}

                        <div className="grid md:grid-cols-3 gap-3 mb-4">
                            <Campo label="Nombre administrativo"><input className={campo} value={block.name} disabled={ro} onChange={e => setBlock('name', e.target.value)} /></Campo>
                            <Campo label="Fondo"><select className={campo} value={block.style.background} disabled={ro} onChange={e => setBlock('style.background', e.target.value)}>{BACKGROUNDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Campo>
                            <div className="flex flex-col gap-2 justify-end">
                                <Toggle checked={block.enabled} onChange={v => setBlock('enabled', v)} label="Contenedor activo" />
                                {['hero', 'intro'].includes(block.type) ? <select className={campo} value={block.style.align} disabled={ro} onChange={e => setBlock('style.align', e.target.value)}><option value="left">Alineación: izquierda</option><option value="center">Alineación: centrada</option></select> : null}
                                {['hero', 'feature', 'donation', 'clubs'].includes(block.type) ? <select className={campo} value={block.style.imageSide} disabled={ro} onChange={e => setBlock('style.imageSide', e.target.value)}><option value="right">Imagen a la derecha</option><option value="left">Imagen a la izquierda</option></select> : null}
                            </div>
                        </div>
                        {block.type === 'hero' ? (<div className="grid md:grid-cols-2 gap-3 mb-4">
                            <Campo label="Imagen de la portada" hint="«De fondo» usa la altura, el encuadre, el acercamiento y la superposición del hero del inicio del sitio."><select className={campo} value={block.style.imageMode || 'side'} disabled={ro} onChange={e => setBlock('style.imageMode', e.target.value)}><option value="side">Al lado del texto (como la referencia)</option><option value="background">De fondo, a todo el ancho (como la portada del inicio)</option></select></Campo>
                            <Campo label={`Superposición oscura adicional (${block.style.overlay}%)`}><input type="range" min={0} max={60} value={block.style.overlay} disabled={ro} onChange={e => setBlock('style.overlay', Number(e.target.value))} className="w-full" /></Campo>
                        </div>) : null}

                        {/* Campos por tipo */}
                        {block.type === 'hero' ? (<div className="space-y-3">
                            <div className="grid md:grid-cols-2 gap-3">
                                <Campo label="Antetítulo"><input className={campo} value={c.eyebrow} disabled={ro} onChange={e => setBlock('content.eyebrow', e.target.value)} /></Campo>
                                <Campo label="Nombre del programa"><input className={campo} value={c.title} disabled={ro} onChange={e => setBlock('content.title', e.target.value)} /></Campo>
                                <Campo label="Frase principal"><input className={campo} value={c.tagline} disabled={ro} onChange={e => setBlock('content.tagline', e.target.value)} /></Campo>
                                <Campo label="Descripción"><textarea className={campo} rows={2} value={c.description} disabled={ro} onChange={e => setBlock('content.description', e.target.value)} /></Campo>
                            </div>
                            <ImageEditor value={c.image} onChange={v => setBlock('content.image', v)} clubId={data.scope.siteId} label="Imagen principal" disabled={ro} />
                            {[0, 1].map(i => <ButtonEditor key={i} label={i === 0 ? 'Botón principal' : 'Botón secundario'} value={c.buttons[i] || { label: '', icon: 'star', variant: i === 0 ? 'primary' : 'secondary', action: { type: 'none', target: '' } }} onChange={b => { const arr = [...c.buttons]; arr[i] = b; setBlock('content.buttons', arr); }} blocks={landing.blocks} disabled={ro} />)}
                        </div>) : null}

                        {(block.type === 'intro' || block.type === 'contact') ? (<div className="space-y-3">
                            <Campo label="Título"><input className={campo} value={c.title} disabled={ro} onChange={e => setBlock('content.title', e.target.value)} /></Campo>
                            <Campo label="Descripción"><textarea className={campo} rows={3} value={c.description} disabled={ro} onChange={e => setBlock('content.description', e.target.value)} /></Campo>
                            <ButtonEditor value={c.button} onChange={b => setBlock('content.button', b)} blocks={landing.blocks} disabled={ro} />
                        </div>) : null}

                        {block.type === 'cards' ? (<div className="space-y-3">
                            <Campo label="Título"><input className={campo} value={c.title} disabled={ro} onChange={e => setBlock('content.title', e.target.value)} /></Campo>
                            <Campo label="Descripción (opcional)"><textarea className={campo} rows={2} value={c.description} disabled={ro} onChange={e => setBlock('content.description', e.target.value)} /></Campo>
                            <Lista items={c.cards} addLabel="Tarjeta" disabled={ro} onAdd={() => setBlock('content.cards', [...c.cards, { id: `card-${Date.now().toString(36)}`, icon: 'book', title: '', description: '', link: { label: 'Más información', icon: 'arrow', variant: 'secondary', action: { type: 'detail', target: 'programa' } } }])}
                                onRemove={i => setBlock('content.cards', c.cards.filter((_: any, k: number) => k !== i))} onMove={(i, d) => { const a = [...c.cards]; [a[i], a[i + d]] = [a[i + d], a[i]]; setBlock('content.cards', a); }}
                                render={(card, i) => (<div className="space-y-2"><div className="grid md:grid-cols-2 gap-2"><IconSelect value={card.icon} onChange={v => setBlock(`content.cards.${i}.icon`, v)} disabled={ro} /><input className={campo} placeholder="Título" value={card.title} disabled={ro} onChange={e => setBlock(`content.cards.${i}.title`, e.target.value)} /></div><textarea className={campo} rows={2} placeholder="Descripción" value={card.description} disabled={ro} onChange={e => setBlock(`content.cards.${i}.description`, e.target.value)} /><ButtonEditor label="Enlace" value={card.link} onChange={b => setBlock(`content.cards.${i}.link`, b)} blocks={landing.blocks} disabled={ro} /></div>)} />
                        </div>) : null}

                        {(block.type === 'feature' || block.type === 'clubs') ? (<div className="space-y-3">
                            <Campo label="Título"><input className={campo} value={c.title} disabled={ro} onChange={e => setBlock('content.title', e.target.value)} /></Campo>
                            <Campo label="Descripción"><textarea className={campo} rows={4} value={c.description} disabled={ro} onChange={e => setBlock('content.description', e.target.value)} /></Campo>
                            {block.type === 'clubs' ? <Campo label="Ilustración" hint="Si subes una imagen, reemplaza la ilustración."><select className={campo} value={c.illustration} disabled={ro} onChange={e => setBlock('content.illustration', e.target.value)}><option value="hands">Manos unidas (ilustración del sitio)</option><option value="none">Ninguna</option></select></Campo> : null}
                            <ImageEditor value={c.image} onChange={v => setBlock('content.image', v)} clubId={data.scope.siteId} disabled={ro} />
                            <ButtonEditor value={c.button} onChange={b => setBlock('content.button', b)} blocks={landing.blocks} disabled={ro} />
                        </div>) : null}

                        {block.type === 'impact' ? (<div className="space-y-3">
                            <Campo label="Título (opcional)"><input className={campo} value={c.title} disabled={ro} onChange={e => setBlock('content.title', e.target.value)} /></Campo>
                            <p className="text-[11px] text-gray-500">Cada tarjeta se vincula a un indicador PUBLICADO del programa; el valor, la unidad y el período salen de ahí. Sin vínculo, la vista previa dice «Indicadores por validar» y en público la tarjeta se omite. No se inventan cifras.</p>
                            <Lista items={c.items} addLabel="Indicador" disabled={ro} onAdd={() => setBlock('content.items', [...c.items, { id: `ind-${Date.now().toString(36)}`, icon: 'star', label: '', indicatorId: null }])}
                                onRemove={i => setBlock('content.items', c.items.filter((_: any, k: number) => k !== i))} onMove={(i, d) => { const a = [...c.items]; [a[i], a[i + d]] = [a[i + d], a[i]]; setBlock('content.items', a); }}
                                render={(it, i) => (<div className="grid md:grid-cols-3 gap-2"><IconSelect value={it.icon} onChange={v => setBlock(`content.items.${i}.icon`, v)} disabled={ro} /><input className={campo} placeholder="Rótulo (p. ej. Familias acompañadas)" value={it.label} disabled={ro} onChange={e => setBlock(`content.items.${i}.label`, e.target.value)} /><select className={campo} value={it.indicatorId || ''} disabled={ro} onChange={e => setBlock(`content.items.${i}.indicatorId`, e.target.value || null)}><option value="">Indicador por validar…</option>{p.sources.indicators.map(ind => <option key={ind.id} value={ind.id}>{ind.name}: {ind.value} {ind.unit} ({ind.period})</option>)}</select></div>)} />
                        </div>) : null}

                        {block.type === 'directory' ? (<div className="space-y-3">
                            <p className="text-[11px] text-gray-500">Clínicas publicadas en el programa: <strong>{p.sources.clinics}</strong>. Los registros vienen del directorio real; aquí sólo se decide cómo se muestran.</p>
                            <div className="grid md:grid-cols-2 gap-3">
                                <Campo label="Título"><input className={campo} value={c.title} disabled={ro} onChange={e => setBlock('content.title', e.target.value)} /></Campo>
                                <Campo label="Descripción"><input className={campo} value={c.description} disabled={ro} onChange={e => setBlock('content.description', e.target.value)} /></Campo>
                                <Campo label="Resultados iniciales"><input type="number" min={1} max={12} className={campo} value={c.initialCount} disabled={ro} onChange={e => setBlock('content.initialCount', Number(e.target.value))} /></Campo>
                                <Campo label="Texto del botón Buscar"><input className={campo} value={c.searchLabel} disabled={ro} onChange={e => setBlock('content.searchLabel', e.target.value)} /></Campo>
                                <Campo label="Texto del enlace de cada tarjeta"><input className={campo} value={c.contactLabel} disabled={ro} onChange={e => setBlock('content.contactLabel', e.target.value)} /></Campo>
                            </div>
                            <div className="grid md:grid-cols-2 gap-2">
                                <Toggle checked={c.filters.region} onChange={v => setBlock('content.filters.region', v)} label="Filtro por departamento" /><Toggle checked={c.filters.city} onChange={v => setBlock('content.filters.city', v)} label="Filtro por ciudad" />
                                <Toggle checked={c.fields.institution} onChange={v => setBlock('content.fields.institution', v)} label="Mostrar institución" /><Toggle checked={c.fields.schedule} onChange={v => setBlock('content.fields.schedule', v)} label="Mostrar horario" /><Toggle checked={c.fields.careConditions} onChange={v => setBlock('content.fields.careConditions', v)} label="Mostrar condiciones de atención aprobadas" />
                            </div>
                            <ButtonEditor label="Botón inferior (directorio completo)" value={c.allButton} onChange={b => setBlock('content.allButton', b)} blocks={landing.blocks} disabled={ro} />
                        </div>) : null}

                        {block.type === 'donation' ? (<div className="space-y-3">
                            <p className="text-[11px] text-gray-500">Canal de donación del programa: {p.sources.donation ? <>{p.sources.donation.receiver} · {p.sources.donation.verifiedAt ? 'verificado' : <span className="text-amber-700">sin verificar (el botón no se publica)</span>}</> : <span className="text-amber-700">ninguno publicado: entidad receptora y enlace por confirmar</span>}. Se gestiona en «Gestión de contenidos → Enlace de donación».</p>
                            <Campo label="Título"><input className={campo} value={c.title} disabled={ro} onChange={e => setBlock('content.title', e.target.value)} /></Campo>
                            <Campo label="Descripción"><textarea className={campo} rows={2} value={c.description} disabled={ro} onChange={e => setBlock('content.description', e.target.value)} /></Campo>
                            <ImageEditor value={c.image} onChange={v => setBlock('content.image', v)} clubId={data.scope.siteId} disabled={ro} />
                            <ButtonEditor value={c.button} onChange={b => setBlock('content.button', b)} blocks={landing.blocks} fixedAction="donation" disabled={ro} />
                        </div>) : null}

                        {block.type === 'stories' ? (<div className="space-y-3">
                            <p className="text-[11px] text-gray-500">Historias aprobadas y publicadas: <strong>{p.sources.stories.length}</strong>. No se publican testimonios ficticios: sin historias el contenedor se oculta en público.</p>
                            <div className="grid md:grid-cols-2 gap-3">
                                <Campo label="Título"><input className={campo} value={c.title} disabled={ro} onChange={e => setBlock('content.title', e.target.value)} /></Campo>
                                <Campo label="Descripción"><input className={campo} value={c.description} disabled={ro} onChange={e => setBlock('content.description', e.target.value)} /></Campo>
                                <Campo label="Selección"><select className={campo} value={c.mode} disabled={ro} onChange={e => setBlock('content.mode', e.target.value)}><option value="latest">Últimas publicadas</option><option value="manual">Elegir manualmente</option></select></Campo>
                                <Campo label="Cantidad"><input type="number" min={1} max={6} className={campo} value={c.count} disabled={ro} onChange={e => setBlock('content.count', Number(e.target.value))} /></Campo>
                                <Campo label="Texto del enlace"><input className={campo} value={c.linkLabel} disabled={ro} onChange={e => setBlock('content.linkLabel', e.target.value)} /></Campo>
                                <div className="flex flex-col gap-2 justify-end"><Toggle checked={c.showSummary} onChange={v => setBlock('content.showSummary', v)} label="Mostrar resumen" /><Toggle checked={c.showDate} onChange={v => setBlock('content.showDate', v)} label="Mostrar fecha" /></div>
                            </div>
                            {c.mode === 'manual' ? <div className="rounded-xl border border-gray-100 p-3 space-y-1">{p.sources.stories.length === 0 ? <p className="text-xs text-gray-500">No hay historias publicadas.</p> : p.sources.stories.map(s => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={ro} checked={c.storyIds.includes(s.id)} onChange={e => setBlock('content.storyIds', e.target.checked ? [...c.storyIds, s.id] : c.storyIds.filter((x: string) => x !== s.id))} />{s.title}</label>)}</div> : null}
                        </div>) : null}

                        {block.type === 'resources' ? (<div className="space-y-3">
                            <p className="text-[11px] text-gray-500">Recursos publicados: <strong>{p.sources.resources}</strong> ({Object.entries(p.sources.resourcesByType).map(([k, v]) => `${k}: ${v}`).join(', ') || 'ninguno'}). Cada acceso filtra por tipo; sin recursos de ese tipo se oculta en público.</p>
                            <Campo label="Título"><input className={campo} value={c.title} disabled={ro} onChange={e => setBlock('content.title', e.target.value)} /></Campo>
                            <Campo label="Descripción (opcional)"><input className={campo} value={c.description} disabled={ro} onChange={e => setBlock('content.description', e.target.value)} /></Campo>
                            <Lista items={c.items} addLabel="Acceso" disabled={ro} onAdd={() => setBlock('content.items', [...c.items, { id: `res-${Date.now().toString(36)}`, icon: 'file', label: '', resourceType: '', action: { type: 'detail', target: 'familias' } }])}
                                onRemove={i => setBlock('content.items', c.items.filter((_: any, k: number) => k !== i))} onMove={(i, d) => { const a = [...c.items]; [a[i], a[i + d]] = [a[i + d], a[i]]; setBlock('content.items', a); }}
                                render={(it, i) => (<div className="grid md:grid-cols-3 gap-2"><IconSelect value={it.icon} onChange={v => setBlock(`content.items.${i}.icon`, v)} disabled={ro} /><input className={campo} placeholder="Etiqueta" value={it.label} disabled={ro} onChange={e => setBlock(`content.items.${i}.label`, e.target.value)} /><select className={campo} value={it.resourceType} disabled={ro} onChange={e => setBlock(`content.items.${i}.resourceType`, e.target.value)}><option value="">Todos los recursos</option><option value="video">Videos</option><option value="podcast">Podcast</option><option value="audio">Audio</option><option value="documento">Documentos</option><option value="enlace">Enlaces</option></select></div>)} />
                            <ButtonEditor label="Botón inferior" value={c.button} onChange={b => setBlock('content.button', b)} blocks={landing.blocks} disabled={ro} />
                        </div>) : null}

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
                            <a href={`/programas/${p.slug}#${block.id}`} target="_blank" rel="noopener" className="text-xs text-gray-500 inline-flex items-center gap-1 hover:text-rotary-blue"><ExternalLink className="w-3 h-3" /> Ancla pública: #{block.id}</a>
                            {p.canEdit ? <button type="button" className={btnPrimario} disabled={guardando || !dirty} onClick={guardar}><Save className="w-4 h-4" /> Guardar borrador</button> : null}
                        </div>
                    </Tarjeta>
                )}
            </div>
        </div>
    );
};

export default ProgramaPaginaTab;
