/**
 * Sitio web de Club Platform — «Páginas y contenido» (v4.1348.0)
 *
 * El mismo editor por contenedores de la landing de Programas (v4.1281),
 * ampliado a un sitio: páginas con su dirección, lista de contenedores
 * (activar, reordenar, agregar, quitar) y el editor del contenedor elegido
 * con textos, imágenes de la Biblioteca con texto alternativo, íconos de
 * lista cerrada, botones de acción controlada, fondo, espaciado y animación.
 *
 * Todo lo que se toca aquí vive en el borrador EN MEMORIA: se guarda con
 * «Guardar borrador» (arriba) y no llega al público hasta publicar.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, AlertTriangle, Bot, Check, Eye, EyeOff, FilePlus2, Loader2, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, setPath, type Payload } from './api';
import { Tarjeta, Campo, campo, btnPrimario, btnSecundario, Toggle, ImageField } from '../programas/ui';
import PlatformIcon from '../../platform-site/PlatformIcon';
import { ANIMATIONS, BACKGROUNDS, BLOCK_TYPES, BLOCK_TYPE_IDS, BUTTON_ACTIONS, ICONS, SPACINGS, slugify, type Site, type SiteBlock, type SiteButton, type SitePage } from '../../../lib/platformSiteSpec';

const area = `${campo} min-h-[90px]`;
const move = <T,>(list: T[], i: number, d: -1 | 1): T[] => { const j = i + d; if (j < 0 || j >= list.length) return list; const a = [...list]; [a[i], a[j]] = [a[j], a[i]]; return a; };
const uid = (p: string) => `${p}-${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
const EMPTY_BTN: SiteButton = { label: '', icon: '', variant: 'primary', action: { type: 'none', target: '' } };
const EMPTY_IMG = { url: '', alt: '', focalX: 50, focalY: 50 };

const IconSelect = ({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) => (
    <div className="flex items-center gap-2">
        <span className="text-rotary-blue shrink-0"><PlatformIcon id={value} className="w-5 h-5" /></span>
        <select className={campo} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)} aria-label="Ícono"><option value="">Sin ícono</option>{ICONS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}</select>
    </div>
);

export const ButtonEditor = ({ value, onChange, page, pages, label = 'Botón', disabled }: { value: SiteButton; onChange: (b: SiteButton) => void; page: SitePage | null; pages: SitePage[]; label?: string; disabled?: boolean }) => {
    const v = value || EMPTY_BTN; const t = v.action?.type || 'none';
    const set = (k: string, x: any) => onChange(setPath(v, k, x));
    return (
        <fieldset className="rounded-xl border border-gray-100 p-3 space-y-2">
            <legend className="text-xs font-semibold text-gray-700 px-1">{label}</legend>
            <div className="grid sm:grid-cols-2 gap-2">
                <input className={campo} placeholder="Texto del botón (vacío = oculto)" value={v.label || ''} disabled={disabled} onChange={e => set('label', e.target.value)} aria-label={`${label}: texto`} />
                <IconSelect value={v.icon} onChange={x => set('icon', x)} disabled={disabled} />
                <select className={campo} value={v.variant || 'primary'} disabled={disabled} onChange={e => set('variant', e.target.value)} aria-label={`${label}: estilo`}><option value="primary">Estilo: principal</option><option value="secondary">Estilo: secundario</option><option value="gold">Estilo: acento</option></select>
                <select className={campo} value={t} disabled={disabled} onChange={e => onChange({ ...v, action: { type: e.target.value, target: '' } })} aria-label={`${label}: acción`}>{BUTTON_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
            </div>
            {t === 'section' ? <select className={campo} value={v.action.target} disabled={disabled} onChange={e => set('action.target', e.target.value)} aria-label="Contenedor de destino"><option value="">Elige el contenedor…</option>{(page || pages[0])?.blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}{page && page.id !== pages[0]?.id ? pages[0]?.blocks.map(b => <option key={`h-${b.id}`} value={b.id}>Portada · {b.name}</option>) : null}</select> : null}
            {t === 'page' ? <select className={campo} value={v.action.target} disabled={disabled} onChange={e => set('action.target', e.target.value)} aria-label="Página de destino">{pages.map((p, i) => <option key={p.id} value={i === 0 ? '' : p.slug}>{p.title}</option>)}</select> : null}
            {t === 'external' ? <input className={campo} placeholder="https://…" value={v.action.target} disabled={disabled} onChange={e => set('action.target', e.target.value)} aria-label="Enlace externo" /> : null}
        </fieldset>
    );
};

const ImageEditor = ({ value, onChange, label = 'Imagen', hint, disabled }: { value: any; onChange: (v: any) => void; label?: string; hint?: ReactNode; disabled?: boolean }) => {
    const v = value || EMPTY_IMG;
    return (
        <div className={disabled ? 'pointer-events-none opacity-70' : ''}>
            <ImageField label={label} value={v.url || ''} onChange={url => onChange({ ...v, url })} alt={v.alt || ''} onAlt={alt => onChange({ ...v, alt })} hint={hint || 'Sólo capturas e imágenes reales. El texto alternativo es obligatorio.'} />
        </div>
    );
};

const Lista = ({ items, render, onChange, make, addLabel, max, disabled }: { items: any[]; render: (it: any, set: (k: string, v: any) => void, i: number) => ReactNode; onChange: (items: any[]) => void; make: () => any; addLabel: string; max: number; disabled?: boolean }) => (
    <div className="space-y-3">
        {items.map((it, i) => (
            <div key={it.id || i} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-[11px] font-semibold text-gray-400">{i + 1}</span>
                    <span className="flex items-center gap-1">
                        <button type="button" className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={disabled || i === 0} onClick={() => onChange(move(items, i, -1))} aria-label="Subir"><ArrowUp className="w-4 h-4" /></button>
                        <button type="button" className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={disabled || i === items.length - 1} onClick={() => onChange(move(items, i, 1))} aria-label="Bajar"><ArrowDown className="w-4 h-4" /></button>
                        <button type="button" className="p-1 text-gray-400 hover:text-rose-600 disabled:opacity-30" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
                    </span>
                </div>
                {render(it, (k, v) => onChange(items.map((x, j) => (j === i ? setPath(x, k, v) : x))), i)}
            </div>
        ))}
        {items.length < max ? <button type="button" className={btnSecundario} disabled={disabled} onClick={() => onChange([...items, make()])}><Plus className="w-4 h-4" /> {addLabel}</button> : <p className="text-[11px] text-gray-500">Máximo {max}.</p>}
    </div>
);

/** Elegir sitios REALES y publicados del ecosistema. Sólo datos públicos. */
const SitesPicker = ({ value, onChange, disabled }: { value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) => {
    const [sites, setSites] = useState<{ id: string; name: string; logo: string; url: string; kind: string }[] | null>(null);
    const [q, setQ] = useState('');
    useEffect(() => { api<{ sites: any[] }>('/admin/sources/sites').then(r => setSites(r.sites)).catch(e => { toast.error(e?.message || 'No se pudieron cargar los sitios.'); setSites([]); }); }, []);
    if (!sites) return <p className="text-sm text-gray-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando sitios publicados…</p>;
    const visibles = sites.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()));
    return (
        <div>
            <input className={campo} placeholder="Buscar un sitio…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar sitio" />
            <p className="text-[11px] text-gray-500 mt-1">{value.length} elegido(s) de {sites.length} sitios publicados con dominio propio. Se muestra sólo el nombre, el logotipo y el enlace público. Confirma con cada club antes de mostrarlo.</p>
            <ul className="mt-2 max-h-64 overflow-y-auto divide-y divide-gray-100 rounded-xl border border-gray-100">
                {visibles.map(s => {
                    const on = value.includes(s.id);
                    return (
                        <li key={s.id}><label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                            <input type="checkbox" checked={on} disabled={disabled} onChange={() => onChange(on ? value.filter(x => x !== s.id) : [...value, s.id])} />
                            <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900 truncate">{s.name}</span><span className="block text-[11px] text-gray-500 truncate">{s.kind ? `${s.kind} · ` : ''}{s.url.replace('https://', '')}</span></span>
                        </label></li>
                    );
                })}
                {!visibles.length ? <li className="px-3 py-3 text-xs text-gray-500">Ningún sitio coincide.</li> : null}
            </ul>
        </div>
    );
};

const AI_GOALS = [['improve', 'Mejorar la redacción'], ['shorten', 'Acortar'], ['seo', 'Optimizar titulares (SEO)'], ['consistency', 'Unificar el tono'], ['accessibility', 'Lenguaje claro']];

/** Asistente de redacción: PROPONE; nada cambia hasta «Aplicar al borrador» y guardar. */
const Asistente = ({ block, onApply, disabled }: { block: SiteBlock; onApply: (b: SiteBlock) => void; disabled?: boolean }) => {
    const [goal, setGoal] = useState('improve');
    const [cargando, setCargando] = useState(false);
    const [propuesta, setPropuesta] = useState<SiteBlock | null>(null);
    useEffect(() => { setPropuesta(null); }, [block.id]);
    const pedir = async () => {
        setCargando(true); setPropuesta(null);
        try { const r = await api<{ proposal: SiteBlock }>('/admin/ai/suggest', { method: 'POST', body: JSON.stringify({ block, goal }) }, 70000); setPropuesta(r.proposal); }
        catch (e: any) { toast.error(e?.message || 'El asistente no respondió.', { duration: 8000 }); }
        finally { setCargando(false); }
    };
    const textos = (c: any): string[] => { const out: string[] = []; const walk = (v: any) => { if (typeof v === 'string') { if (v.trim() && !/^https?:\/\//.test(v)) out.push(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!['id', 'icon', 'image', 'link', 'button', 'buttons', 'visual', 'variant', 'siteIds'].includes(k)) walk(x); }); }; walk(c); return out; };
    return (
        <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-violet-900 inline-flex items-center gap-1.5"><Bot className="w-4 h-4" /> Asistente de redacción</span>
                <select className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs" value={goal} onChange={e => setGoal(e.target.value)} aria-label="Objetivo">{AI_GOALS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
                <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-violet-800 disabled:opacity-50" disabled={disabled || cargando} onClick={pedir}>{cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Proponer</button>
            </div>
            <p className="text-[11px] text-violet-900/70 mt-1.5">Trabaja sólo con los hechos validados de la plataforma: no inventa clientes, cifras ni funciones. Lo que propone queda en borrador hasta que lo apliques, guardes y se publique.</p>
            {propuesta ? (
                <div className="mt-3 rounded-lg bg-white border border-violet-100 p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Propuesta</p>
                    <ul className="space-y-1.5 text-sm text-gray-800 max-h-56 overflow-y-auto">{textos(propuesta.content).map((t, i) => <li key={i} className="border-l-2 border-violet-200 pl-2 whitespace-pre-line">{t}</li>)}</ul>
                    <div className="flex gap-2 mt-3">
                        <button type="button" className={btnPrimario} onClick={() => { onApply(propuesta); setPropuesta(null); toast.success('Propuesta aplicada al borrador. Revísala y guarda.'); }}><Check className="w-4 h-4" /> Aplicar al borrador</button>
                        <button type="button" className={btnSecundario} onClick={() => setPropuesta(null)}><X className="w-4 h-4" /> Descartar</button>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

/** Los campos de cada tipo de contenedor. */
const BlockFields = ({ block, set, page, pages, ro }: { block: SiteBlock; set: (path: string, v: any) => void; page: SitePage; pages: SitePage[]; ro: boolean }) => {
    const c: any = block.content; const t = block.type;
    const texto = (k: string, label: string, ph = '') => <Campo label={label}><input className={campo} value={c[k] || ''} placeholder={ph} disabled={ro} onChange={e => set(`content.${k}`, e.target.value)} /></Campo>;
    const largo = (k: string, label: string, hint?: string) => <Campo label={label} hint={hint}><textarea className={area} value={c[k] || ''} disabled={ro} onChange={e => set(`content.${k}`, e.target.value)} /></Campo>;
    const boton = (k: string, label: string) => <ButtonEditor label={label} value={c[k]} onChange={b => set(`content.${k}`, b)} page={page} pages={pages} disabled={ro} />;
    return (
        <div className="space-y-4">
            {t === 'hero' ? texto('eyebrow', 'Antetítulo') : null}
            {texto('title', 'Título')}
            {t === 'text' ? largo('body', 'Texto', 'Separa los párrafos con una línea en blanco.') : largo('description', 'Descripción')}

            {t === 'hero' ? (<>
                <Campo label="Composición visual" hint="«Representación del panel» es un esquema: no es una captura ni muestra cifras. Para enseñar una pantalla real, elige «Imagen real» y súbela.">
                    <select className={campo} value={c.visual} disabled={ro} onChange={e => set('content.visual', e.target.value)}><option value="product">Representación esquemática del panel</option><option value="image">Imagen real (captura del producto)</option><option value="none">Sólo texto</option></select>
                </Campo>
                {c.visual === 'image' ? <ImageEditor value={c.image} onChange={v => set('content.image', v)} label="Captura o imagen real" disabled={ro} /> : null}
                <ButtonEditor label="Botón principal" value={c.buttons?.[0]} onChange={b => set('content.buttons', [b, c.buttons?.[1] || EMPTY_BTN])} page={page} pages={pages} disabled={ro} />
                <ButtonEditor label="Botón secundario" value={c.buttons?.[1]} onChange={b => set('content.buttons', [c.buttons?.[0] || EMPTY_BTN, b])} page={page} pages={pages} disabled={ro} />
            </>) : null}

            {t === 'about' ? (<>
                <Campo label="Recorrido (plataforma → sitios → herramientas)">
                    <Lista items={c.flow || []} max={4} disabled={ro} addLabel="Agregar paso" make={() => ({ id: uid('flow'), icon: 'layers', label: '', description: '' })} onChange={v => set('content.flow', v)}
                        render={(it, s) => (<div className="grid sm:grid-cols-2 gap-2"><input className={campo} placeholder="Nombre" value={it.label} disabled={ro} onChange={e => s('label', e.target.value)} /><IconSelect value={it.icon} onChange={v => s('icon', v)} disabled={ro} /><textarea className={`${campo} sm:col-span-2`} placeholder="Descripción" value={it.description} disabled={ro} onChange={e => s('description', e.target.value)} /></div>)} />
                </Campo>
                <ImageEditor value={c.image} onChange={v => set('content.image', v)} label="Imagen (opcional: reemplaza al recorrido)" disabled={ro} />
                {boton('button', 'Botón')}
            </>) : null}

            {t === 'solutions' ? (
                <Campo label="Capacidades" hint="Sólo las VERIFICADAS se publican. Marca una capacidad cuando hayas comprobado que está disponible hoy para los clubes; lo que está en desarrollo puede quedar redactado sin anunciarse.">
                    <Lista items={c.items || []} max={12} disabled={ro} addLabel="Agregar capacidad" make={() => ({ id: uid('sol'), icon: 'layers', title: '', description: '', image: EMPTY_IMG, link: EMPTY_BTN, verified: false })} onChange={v => set('content.items', v)}
                        render={(it, s) => (<div className="space-y-2">
                            <div className="grid sm:grid-cols-2 gap-2"><input className={campo} placeholder="Título" value={it.title} disabled={ro} onChange={e => s('title', e.target.value)} /><IconSelect value={it.icon} onChange={v => s('icon', v)} disabled={ro} /></div>
                            <textarea className={campo} placeholder="Descripción" value={it.description} disabled={ro} onChange={e => s('description', e.target.value)} />
                            <label className={`flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2 ${it.verified ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><input type="checkbox" checked={Boolean(it.verified)} disabled={ro} onChange={e => s('verified', e.target.checked)} /><ShieldCheck className="w-4 h-4" /> {it.verified ? 'Capacidad verificada: se publica' : 'Sin verificar: no se publica'}</label>
                            <details className="text-sm"><summary className="cursor-pointer text-xs font-semibold text-gray-600">Recurso visual y enlace de ampliación</summary><div className="space-y-2 mt-2"><ImageEditor value={it.image} onChange={v => s('image', v)} label="Recurso visual (opcional)" disabled={ro} /><ButtonEditor label="Enlace de ampliación" value={it.link} onChange={b => s('link', b)} page={page} pages={pages} disabled={ro} /></div></details>
                        </div>)} />
                </Campo>
            ) : null}

            {t === 'steps' ? (
                <Campo label="Pasos" hint="La numeración (01, 02…) se pone sola según el orden.">
                    <Lista items={c.steps || []} max={8} disabled={ro} addLabel="Agregar paso" make={() => ({ id: uid('step'), title: '', description: '' })} onChange={v => set('content.steps', v)}
                        render={(it, s) => (<div className="space-y-2"><input className={campo} placeholder="Título" value={it.title} disabled={ro} onChange={e => s('title', e.target.value)} /><textarea className={campo} placeholder="Descripción" value={it.description} disabled={ro} onChange={e => s('description', e.target.value)} /></div>)} />
                </Campo>
            ) : null}

            {t === 'architecture' ? (<>
                <div className="grid sm:grid-cols-2 gap-3">
                    <Campo label="Centro del diagrama"><input className={campo} value={c.hub?.label || ''} disabled={ro} onChange={e => set('content.hub.label', e.target.value)} /></Campo>
                    <Campo label="Leyenda"><input className={campo} value={c.hub?.caption || ''} disabled={ro} onChange={e => set('content.hub.caption', e.target.value)} /></Campo>
                </div>
                <Campo label="Conexiones" hint="Deben corresponder a la arquitectura real de la plataforma.">
                    <Lista items={c.nodes || []} max={8} disabled={ro} addLabel="Agregar conexión" make={() => ({ id: uid('node'), icon: 'layers', label: '', description: '' })} onChange={v => set('content.nodes', v)}
                        render={(it, s) => (<div className="grid sm:grid-cols-2 gap-2"><input className={campo} placeholder="Nombre" value={it.label} disabled={ro} onChange={e => s('label', e.target.value)} /><IconSelect value={it.icon} onChange={v => s('icon', v)} disabled={ro} /><input className={`${campo} sm:col-span-2`} placeholder="Descripción breve" value={it.description} disabled={ro} onChange={e => s('description', e.target.value)} /></div>)} />
                </Campo>
            </>) : null}

            {t === 'benefits' ? (
                <Campo label="Beneficios" hint="Concretos y demostrables. Sin promesas absolutas.">
                    <Lista items={c.items || []} max={9} disabled={ro} addLabel="Agregar beneficio" make={() => ({ id: uid('ben'), icon: 'check', title: '', description: '' })} onChange={v => set('content.items', v)}
                        render={(it, s) => (<div className="grid sm:grid-cols-2 gap-2"><input className={campo} placeholder="Título" value={it.title} disabled={ro} onChange={e => s('title', e.target.value)} /><IconSelect value={it.icon} onChange={v => s('icon', v)} disabled={ro} /><textarea className={`${campo} sm:col-span-2`} placeholder="Descripción" value={it.description} disabled={ro} onChange={e => s('description', e.target.value)} /></div>)} />
                </Campo>
            ) : null}

            {t === 'sites' ? (<>
                <Campo label="Sitios que se muestran"><SitesPicker value={c.siteIds || []} onChange={v => set('content.siteIds', v)} disabled={ro} /></Campo>
                <div className="grid sm:grid-cols-2 gap-3"><Toggle checked={c.showLogo !== false} onChange={v => set('content.showLogo', v)} label="Mostrar logotipo" /><Toggle checked={c.showLink !== false} onChange={v => set('content.showLink', v)} label="Mostrar enlace público" /></div>
            </>) : null}

            {t === 'feature' ? (<><ImageEditor value={c.image} onChange={v => set('content.image', v)} disabled={ro} />{boton('button', 'Botón')}</>) : null}

            {t === 'faq' ? (
                <Campo label="Preguntas" hint="Una pregunta sin respuesta no se muestra.">
                    <Lista items={c.items || []} max={20} disabled={ro} addLabel="Agregar pregunta" make={() => ({ id: uid('faq'), question: '', answer: '' })} onChange={v => set('content.items', v)}
                        render={(it, s) => (<div className="space-y-2"><input className={campo} placeholder="Pregunta" value={it.question} disabled={ro} onChange={e => s('question', e.target.value)} /><textarea className={area} placeholder="Respuesta" value={it.answer} disabled={ro} onChange={e => s('answer', e.target.value)} /></div>)} />
                </Campo>
            ) : null}

            {t === 'contact' ? (<>
                <Toggle checked={c.formEnabled !== false} onChange={v => set('content.formEnabled', v)} label="Mostrar el formulario de solicitud" hint="Las solicitudes llegan a la pestaña «Solicitudes» y, si hay correo de contacto en «Diseño», también por correo." />
                {c.formEnabled !== false ? (<div className="grid sm:grid-cols-2 gap-3">{texto('formTitle', 'Título del formulario')}{texto('submitLabel', 'Texto del botón de envío')}<div className="sm:col-span-2">{largo('successMessage', 'Mensaje al enviar')}</div><div className="sm:col-span-2">{largo('consentText', 'Texto de autorización de datos')}</div></div>) : null}
                {boton('button', 'Botón adicional (opcional)')}
            </>) : null}
        </div>
    );
};

interface Props { p: Payload; site: Site; update: (fn: (s: Site) => Site) => void; ro: boolean }

const EditorTab = ({ p, site, update, ro }: Props) => {
    const [pageId, setPageId] = useState(site.pages[0]?.id || '');
    const [sel, setSel] = useState(site.pages[0]?.blocks[0]?.id || '');
    const [nuevoTipo, setNuevoTipo] = useState('feature');
    const page = site.pages.find(x => x.id === pageId) || site.pages[0];
    const isHome = page.id === site.pages[0].id;
    const block = page.blocks.find(b => b.id === sel) || null;
    const setPage = (fn: (pg: SitePage) => SitePage) => update(s => ({ ...s, pages: s.pages.map(x => (x.id === page.id ? fn(x) : x)) }));
    const setBlock = (path: string, v: any) => setPage(pg => ({ ...pg, blocks: pg.blocks.map(b => (b.id === sel ? setPath(b, path, v) : b)) }));
    const singles = new Set(page.blocks.filter(b => BLOCK_TYPES[b.type]?.single).map(b => b.type));
    const tipos = BLOCK_TYPE_IDS.filter(t => !(BLOCK_TYPES[t].single && singles.has(t)));

    const addBlock = async () => {
        try { const r = await api<{ block: SiteBlock }>(`/admin/new-block?type=${nuevoTipo}`); setPage(pg => ({ ...pg, blocks: [...pg.blocks, r.block] })); setSel(r.block.id); }
        catch (e: any) { toast.error(e?.message || 'No se pudo agregar.'); }
    };
    const addPage = async () => {
        const title = window.prompt('Nombre de la página nueva (por ejemplo: Condiciones del servicio)');
        if (!title?.trim()) return;
        try { const r = await api<{ page: SitePage }>(`/admin/new-page?title=${encodeURIComponent(title.trim())}`); update(s => ({ ...s, pages: [...s.pages, r.page] })); setPageId(r.page.id); setSel(r.page.blocks[0]?.id || ''); }
        catch (e: any) { toast.error(e?.message || 'No se pudo crear la página.'); }
    };
    const removePage = () => {
        if (isHome || !window.confirm(`¿Eliminar la página «${page.title}» del borrador? La versión publicada no cambia hasta publicar.`)) return;
        update(s => ({ ...s, pages: s.pages.filter(x => x.id !== page.id) })); setPageId(site.pages[0].id); setSel(site.pages[0].blocks[0]?.id || '');
    };
    const removeBlock = (id: string) => { if (!window.confirm('¿Quitar este contenedor de la página? Podrás volver a agregarlo.')) return; setPage(pg => ({ ...pg, blocks: pg.blocks.filter(b => b.id !== id) })); if (sel === id) setSel(''); };
    const nota = block ? p.notes[block.id] : null;

    return (
        <div className="space-y-5">
            <Tarjeta title="Páginas" actions={!ro ? <button type="button" className={btnSecundario} onClick={addPage}><FilePlus2 className="w-4 h-4" /> Nueva página</button> : null}>
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Páginas del sitio">
                    {site.pages.map((pg, i) => <button key={pg.id} type="button" role="tab" aria-selected={pg.id === page.id} onClick={() => { setPageId(pg.id); setSel(pg.blocks[0]?.id || ''); }} className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${pg.id === page.id ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'} ${pg.enabled ? '' : 'opacity-60'}`}>{pg.title}<span className="font-normal opacity-70"> · /{i === 0 ? '' : pg.slug}</span></button>)}
                </div>
                {!isHome ? (
                    <div className="grid md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
                        <Campo label="Título de la página"><input className={campo} value={page.title} disabled={ro} onChange={e => setPage(pg => ({ ...pg, title: e.target.value }))} /></Campo>
                        <Campo label="Dirección" hint={`clubplatform.org/${page.slug}`}><input className={campo} value={page.slug} disabled={ro} onChange={e => setPage(pg => ({ ...pg, slug: slugify(e.target.value) }))} /></Campo>
                        <Campo label="Nombre en el menú"><input className={campo} value={page.navLabel} disabled={ro} onChange={e => setPage(pg => ({ ...pg, navLabel: e.target.value }))} /></Campo>
                        <div className="space-y-2 self-end"><Toggle checked={page.showInNav} onChange={v => setPage(pg => ({ ...pg, showInNav: v }))} label="Mostrar en el menú" /><Toggle checked={page.enabled} onChange={v => setPage(pg => ({ ...pg, enabled: v }))} label="Página activa" /></div>
                        {!ro ? <button type="button" className="text-xs text-rose-600 hover:underline justify-self-start md:col-span-4" onClick={removePage}>Eliminar esta página</button> : null}
                    </div>
                ) : <p className="text-[11px] text-gray-500 mt-3">La portada es la dirección principal del sitio («/»). Su título y descripción para buscadores están en la pestaña «SEO».</p>}
            </Tarjeta>

            <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
                <Tarjeta title="Contenedores" className="lg:sticky lg:top-4">
                    <ol className="space-y-1.5">
                        {page.blocks.map((b, i) => {
                            const n = p.notes[b.id];
                            return (
                                <li key={b.id} className={`rounded-xl border px-2.5 py-2 flex items-center gap-1.5 ${sel === b.id ? 'border-rotary-blue bg-sky-50' : 'border-gray-100'} ${b.enabled ? '' : 'opacity-60'}`}>
                                    <button type="button" className="flex-1 text-left min-w-0" onClick={() => setSel(b.id)}>
                                        <span className="block text-sm font-semibold text-gray-900 truncate">{i + 1}. {b.name}</span>
                                        <span className="block text-[11px] text-gray-500 truncate">{BLOCK_TYPES[b.type]?.label}{!b.enabled ? ' · oculto' : n && !n.ready ? ' · no se publica aún' : ''}</span>
                                    </button>
                                    {n && b.enabled && (!n.ready || n.notes.length) ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-label="Tiene avisos" /> : null}
                                    <button type="button" className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={ro} onClick={() => setPage(pg => ({ ...pg, blocks: pg.blocks.map(x => (x.id === b.id ? { ...x, enabled: !x.enabled } : x)) }))} aria-label={b.enabled ? `Ocultar ${b.name}` : `Mostrar ${b.name}`}>{b.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
                                    <span className="flex flex-col">
                                        <button type="button" className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={ro || i === 0} onClick={() => setPage(pg => ({ ...pg, blocks: move(pg.blocks, i, -1) }))} aria-label={`Subir ${b.name}`}><ArrowUp className="w-3.5 h-3.5" /></button>
                                        <button type="button" className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled={ro || i === page.blocks.length - 1} onClick={() => setPage(pg => ({ ...pg, blocks: move(pg.blocks, i, 1) }))} aria-label={`Bajar ${b.name}`}><ArrowDown className="w-3.5 h-3.5" /></button>
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                    {!ro ? (
                        <div className="flex gap-2 mt-4">
                            <select className={campo} value={tipos.includes(nuevoTipo) ? nuevoTipo : tipos[0]} onChange={e => setNuevoTipo(e.target.value)} aria-label="Tipo de contenedor">{tipos.map(t => <option key={t} value={t}>{BLOCK_TYPES[t].label}</option>)}</select>
                            <button type="button" className={btnSecundario} onClick={addBlock} aria-label="Agregar contenedor"><Plus className="w-4 h-4" /></button>
                        </div>
                    ) : null}
                </Tarjeta>

                {!block ? <Tarjeta><p className="text-sm text-gray-500">Elige un contenedor de la lista para editarlo.</p></Tarjeta> : (
                    <Tarjeta title={block.name} actions={!ro ? <button type="button" className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1" onClick={() => removeBlock(block.id)}><Trash2 className="w-3.5 h-3.5" /> Quitar</button> : null}>
                        <p className="text-xs text-gray-500 -mt-2 mb-4">{BLOCK_TYPES[block.type]?.help}</p>
                        {nota && (!nota.ready || nota.notes.length) ? <div className="rounded-xl bg-amber-50 border border-amber-100 text-amber-900 text-xs px-3 py-2 mb-4">{nota.notes.join(' ') || 'Faltan datos: este contenedor no se mostrará en público.'}<span className="block text-amber-800/70 mt-0.5">Los avisos se actualizan al guardar.</span></div> : null}
                        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 mb-5 pb-5 border-b border-gray-100">
                            <Campo label="Nombre interno"><input className={campo} value={block.name} disabled={ro} onChange={e => setBlock('name', e.target.value)} /></Campo>
                            <Campo label="Fondo"><select className={campo} value={block.style.background} disabled={ro} onChange={e => setBlock('style.background', e.target.value)}>{BACKGROUNDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Campo>
                            <Campo label="Alineación"><select className={campo} value={block.style.align} disabled={ro} onChange={e => setBlock('style.align', e.target.value)}><option value="left">Izquierda</option><option value="center">Centrada</option></select></Campo>
                            <Campo label="Espaciado"><select className={campo} value={block.style.spacing} disabled={ro} onChange={e => setBlock('style.spacing', e.target.value)}>{SPACINGS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Campo>
                            <Campo label="Animación"><select className={campo} value={block.style.animation} disabled={ro} onChange={e => setBlock('style.animation', e.target.value)}>{ANIMATIONS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Campo>
                            {['hero', 'about', 'feature'].includes(block.type) ? <Campo label="Lado de la imagen"><select className={campo} value={block.style.imageSide} disabled={ro} onChange={e => setBlock('style.imageSide', e.target.value)}><option value="right">Derecha</option><option value="left">Izquierda</option></select></Campo> : null}
                        </div>
                        <BlockFields block={block} set={setBlock} page={page} pages={site.pages} ro={ro} />
                        {!ro ? <div className="mt-5"><Asistente block={block} disabled={ro} onApply={b => setPage(pg => ({ ...pg, blocks: pg.blocks.map(x => (x.id === block.id ? { ...x, content: b.content } : x)) }))} /></div> : null}
                        <p className="text-[11px] text-gray-400 mt-4">Ancla pública: #{block.id}</p>
                    </Tarjeta>
                )}
            </div>
        </div>
    );
};

export default EditorTab;
