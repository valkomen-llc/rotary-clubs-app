/**
 * Sitio web de Club Platform — las demás pestañas del módulo (v4.1348.0):
 * vista previa responsive, diseño, SEO, dominio, versiones, solicitudes,
 * accesos y actividad. Todas fuera del componente principal.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Globe, Loader2, Monitor, RefreshCw, RotateCcw, Smartphone, Tablet, Trash2, Undo2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, fecha, setPath, type Payload } from './api';
import { ButtonEditor } from './EditorTab';
import { Tarjeta, Campo, campo, btnPrimario, btnSecundario, btnPeligro, Toggle, ImageField, Cargando } from '../programas/ui';
import { ACCENTS, PREVIEW_BASE, ROLE_LABELS, type Site } from '../../../lib/platformSiteSpec';

const area = `${campo} min-h-[80px]`;
const uid = (p: string) => `${p}-${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

// ── Vista previa responsive ───────────────────────────────────────────

const WIDTHS = [{ id: 'desktop', label: 'Escritorio', w: 1280, icon: Monitor }, { id: 'tablet', label: 'Tableta', w: 820, icon: Tablet }, { id: 'mobile', label: 'Móvil', w: 390, icon: Smartphone }];

export const PreviewTab = ({ site, dirty, draftVersion }: { site: Site; dirty: boolean; draftVersion: number }) => {
    const [token, setToken] = useState('');
    const [device, setDevice] = useState('desktop');
    const [slug, setSlug] = useState('');
    useEffect(() => { api<{ token: string }>('/admin/preview-token', { method: 'POST' }).then(r => setToken(r.token)).catch(e => toast.error(e?.message || 'No se pudo abrir la vista previa.')); }, [draftVersion]);
    const w = WIDTHS.find(x => x.id === device) || WIDTHS[0];
    const url = token ? `${PREVIEW_BASE}${slug ? `/${slug}` : ''}?t=${encodeURIComponent(token)}` : '';
    return (
        <Tarjeta title="Vista previa" actions={url ? <a className={btnSecundario} href={url} target="_blank" rel="noopener"><ExternalLink className="w-4 h-4" /> Abrir en otra pestaña</a> : null}>
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="inline-flex rounded-xl border border-gray-200 p-1" role="group" aria-label="Tamaño de pantalla">
                    {WIDTHS.map(x => <button key={x.id} type="button" aria-pressed={device === x.id} onClick={() => setDevice(x.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${device === x.id ? 'bg-rotary-blue text-white' : 'text-gray-600 hover:bg-gray-50'}`}><x.icon className="w-4 h-4" /> {x.label}</button>)}
                </div>
                <select className={`${campo} !w-auto`} value={slug} onChange={e => setSlug(e.target.value)} aria-label="Página">{site.pages.map((p, i) => <option key={p.id} value={i === 0 ? '' : p.slug}>{p.title}</option>)}</select>
                <span className="text-xs text-gray-500">Privada: enlace firmado de una hora, sin indexar.</span>
            </div>
            {dirty ? <p className="rounded-xl bg-amber-50 border border-amber-100 text-amber-900 text-sm px-3 py-2 mb-3">La vista previa muestra el borrador GUARDADO. Guarda para ver tus últimos cambios.</p> : null}
            <div className="rounded-2xl bg-gray-100 p-3 overflow-x-auto">
                {url ? <iframe key={`${url}-${draftVersion}`} title={`Vista previa (${w.label})`} src={url} className="bg-white rounded-xl shadow mx-auto block border-0" style={{ width: device === 'desktop' ? '100%' : w.w, minWidth: device === 'desktop' ? 960 : undefined, height: 760 }} /> : <Cargando />}
            </div>
        </Tarjeta>
    );
};

// ── Diseño y personalización ──────────────────────────────────────────

const LinkList = ({ items, onChange, site, ro, addLabel }: { items: any[]; onChange: (v: any[]) => void; site: Site; ro: boolean; addLabel: string }) => (
    <div className="space-y-3">
        {items.map((l, i) => (
            <div key={l.id || i} className="flex items-start gap-2">
                <div className="flex-1"><ButtonEditor label={`Enlace ${i + 1}`} value={{ label: l.label, icon: '', variant: 'primary', action: l.action }} onChange={b => onChange(items.map((x, j) => (j === i ? { ...x, label: b.label, action: b.action } : x)))} page={null} pages={site.pages} disabled={ro} /></div>
                {!ro ? <button type="button" className="p-2 text-gray-400 hover:text-rose-600 mt-3" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Quitar enlace"><Trash2 className="w-4 h-4" /></button> : null}
            </div>
        ))}
        {!ro && items.length < 8 ? <button type="button" className={btnSecundario} onClick={() => onChange([...items, { id: uid('nav'), label: 'Nuevo enlace', action: { type: 'section', target: '' } }])}>{addLabel}</button> : null}
    </div>
);

export const DesignTab = ({ site, update, ro }: { site: Site; update: (fn: (s: Site) => Site) => void; ro: boolean }) => {
    const s = site.settings;
    const set = (path: string, v: any) => update(x => ({ ...x, settings: setPath(x.settings, path, v) }));
    return (
        <div className="grid xl:grid-cols-2 gap-5 items-start">
            <Tarjeta title="Identidad">
                <div className="space-y-4">
                    <Campo label="Nombre del sitio"><input className={campo} value={s.name} disabled={ro} onChange={e => set('name', e.target.value)} /></Campo>
                    <Campo label="Lema"><input className={campo} value={s.tagline} disabled={ro} onChange={e => set('tagline', e.target.value)} /></Campo>
                    <ImageField label="Logotipo (opcional)" value={s.logoUrl} onChange={v => set('logoUrl', v)} hint="Sin logotipo se muestra el nombre «Club Platform for Rotary» en texto." />
                    <div className="grid sm:grid-cols-3 gap-3">
                        <Campo label="Color de acento"><select className={campo} value={s.accent} disabled={ro} onChange={e => set('accent', e.target.value)}>{ACCENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Campo>
                        <Campo label="Cabecera"><select className={campo} value={s.header} disabled={ro} onChange={e => set('header', e.target.value)}><option value="dark">Oscura (azul marino)</option><option value="light">Clara (blanca)</option></select></Campo>
                        <Campo label="Idioma inicial"><select className={campo} value={s.language} disabled={ro} onChange={e => set('language', e.target.value)}><option value="es">Español</option><option value="en">Inglés</option><option value="pt">Portugués</option></select></Campo>
                    </div>
                    <p className="text-[11px] text-gray-500">La paleta, las tipografías y los fondos son los de la plantilla institucional de los sitios del ecosistema; aquí se elige el acento propio de Club Platform.</p>
                    <Campo label="Correo de contacto" hint="A este correo llega el aviso de cada solicitud del formulario. No se muestra en el sitio."><input type="email" className={campo} value={s.contact.email} disabled={ro} onChange={e => set('contact.email', e.target.value)} placeholder="contacto@…" /></Campo>
                </div>
            </Tarjeta>
            <div className="space-y-5">
                <Tarjeta title="Menú">
                    <p className="text-[11px] text-gray-500 mb-3">Enlaces a contenedores de la portada. Las páginas con «Mostrar en el menú» se agregan solas.</p>
                    <LinkList items={s.nav.links} onChange={v => set('nav.links', v)} site={site} ro={ro} addLabel="Agregar enlace al menú" />
                    <div className="mt-4"><ButtonEditor label="Botón destacado del menú" value={s.nav.cta} onChange={b => set('nav.cta', b)} page={null} pages={site.pages} disabled={ro} /></div>
                    <div className="mt-4"><Toggle checked={s.nav.showLogin} onChange={v => set('nav.showLogin', v)} label="Mostrar «Ingresar» (lleva a app.clubplatform.org)" /></div>
                </Tarjeta>
                <Tarjeta title="Pie de página">
                    <div className="space-y-4">
                        <Campo label="Texto"><textarea className={area} value={s.footer.text} disabled={ro} onChange={e => set('footer.text', e.target.value)} /></Campo>
                        <Campo label="Nota legal"><input className={campo} value={s.footer.note} disabled={ro} onChange={e => set('footer.note', e.target.value)} /></Campo>
                        <LinkList items={s.footer.links} onChange={v => set('footer.links', v)} site={site} ro={ro} addLabel="Agregar enlace al pie" />
                    </div>
                </Tarjeta>
            </div>
        </div>
    );
};

// ── SEO y metadatos ───────────────────────────────────────────────────

const Largo = ({ n, max }: { n: number; max: number }) => <span className={`text-[11px] ${n > max ? 'text-rose-600' : 'text-gray-400'}`}>{n}/{max}</span>;

export const SeoTab = ({ site, update, ro, host }: { site: Site; update: (fn: (s: Site) => Site) => void; ro: boolean; host: string }) => {
    const s = site.settings.seo;
    const set = (k: string, v: any) => update(x => ({ ...x, settings: setPath(x.settings, `seo.${k}`, v) }));
    const setPageSeo = (id: string, k: string, v: any) => update(x => ({ ...x, pages: x.pages.map(p => (p.id === id ? { ...p, seo: { ...p.seo, [k]: v } } : p)) }));
    return (
        <div className="space-y-5">
            <Tarjeta title="SEO del sitio">
                <div className="grid lg:grid-cols-2 gap-5">
                    <div className="space-y-4">
                        <Campo label={<>Metatítulo <Largo n={s.title.length} max={60} /></>}><input className={campo} value={s.title} disabled={ro} onChange={e => set('title', e.target.value)} maxLength={70} /></Campo>
                        <Campo label={<>Metadescripción <Largo n={s.description.length} max={160} /></>}><textarea className={area} value={s.description} disabled={ro} onChange={e => set('description', e.target.value)} maxLength={170} /></Campo>
                        <Toggle checked={s.organization} onChange={v => set('organization', v)} label="Datos estructurados de la organización (schema.org)" hint="Nombre, dirección web y logotipo. Sin valoraciones ni cifras." />
                    </div>
                    <div className="space-y-4">
                        <ImageField label="Imagen para compartir (Open Graph)" value={s.image} onChange={v => set('image', v)} hint="Recomendado 1200 × 630 px. Es la que muestran WhatsApp, Facebook y LinkedIn." />
                        <div className="rounded-xl border border-gray-100 p-3" aria-label="Así se vería en un buscador">
                            <p className="text-[11px] text-gray-400 mb-1">Así se vería en un buscador</p>
                            <p className="text-xs text-emerald-700">https://{host}/</p>
                            <p className="text-blue-700 text-base leading-snug">{s.title || site.settings.name}</p>
                            <p className="text-xs text-gray-600 mt-0.5">{s.description || 'Sin metadescripción.'}</p>
                        </div>
                    </div>
                </div>
                <ul className="text-xs text-gray-600 mt-5 pt-4 border-t border-gray-100 grid sm:grid-cols-2 gap-x-6 gap-y-1">
                    <li>· Etiqueta canónica y Open Graph resueltos en el servidor (los rastreadores no ejecutan JavaScript).</li>
                    <li>· <code>sitemap.xml</code> con las páginas activas e indexables.</li>
                    <li>· <code>robots.txt</code>: cerrado mientras el sitio no esté en vivo; nunca <code>/admin</code> ni <code>/api</code>.</li>
                    <li>· La vista previa privada va siempre con <code>noindex</code>.</li>
                </ul>
            </Tarjeta>
            <Tarjeta title="SEO por página">
                <div className="space-y-4">
                    {site.pages.map((p, i) => (
                        <div key={p.id} className="rounded-xl border border-gray-100 p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-2">{p.title} <span className="font-normal text-gray-400">· /{i === 0 ? '' : p.slug}</span></p>
                            <div className="grid lg:grid-cols-2 gap-3">
                                <input className={campo} placeholder={i === 0 ? 'Metatítulo (vacío = el del sitio)' : `Metatítulo (vacío = «${p.title} | ${site.settings.name}»)`} value={p.seo.title} disabled={ro} maxLength={70} onChange={e => setPageSeo(p.id, 'title', e.target.value)} aria-label={`Metatítulo de ${p.title}`} />
                                <input className={campo} placeholder="Metadescripción (vacía = la del sitio)" value={p.seo.description} disabled={ro} maxLength={170} onChange={e => setPageSeo(p.id, 'description', e.target.value)} aria-label={`Metadescripción de ${p.title}`} />
                            </div>
                            <div className="mt-2"><Toggle checked={p.seo.noindex} onChange={v => setPageSeo(p.id, 'noindex', v)} label="No indexar esta página" /></div>
                        </div>
                    ))}
                </div>
            </Tarjeta>
        </div>
    );
};

// ── Dominio ───────────────────────────────────────────────────────────

const Linea = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) => (
    <li className="flex items-start gap-2 text-sm">{ok === null ? <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /> : ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />}<span>{children}</span></li>
);

export const DomainTab = ({ p, onPayload }: { p: Payload; onPayload: (p: Payload) => void }) => {
    const can = p.abilities.includes('domain');
    const [host, setHost] = useState(p.domain.publicHost);
    const [confirm, setConfirm] = useState('');
    const [st, setSt] = useState<any>(null);
    const [busy, setBusy] = useState(false);
    const check = useCallback(async () => { setSt(null); try { setSt(await api('/admin/domain-status')); } catch (e: any) { setSt({ error: e?.message }); } }, []);
    useEffect(() => { if (can) check(); }, [can, check, p.domain.publicHost]);
    const save = async (body: any, ok: string) => {
        setBusy(true);
        try { onPayload(await api<Payload>('/admin/config', { method: 'PUT', body: JSON.stringify(body) })); toast.success(ok); setConfirm(''); }
        catch (e: any) { toast.error(e?.message || 'No se pudo guardar.', { duration: 8000 }); }
        finally { setBusy(false); }
    };
    if (!can) return <Tarjeta title="Dominio"><p className="text-sm text-gray-600">Dominio público previsto: <strong>{p.domain.publicHost}</strong> · {p.domain.publicLive ? 'en vivo' : 'sin activar'}. Sólo un administrador central puede cambiar esta configuración.</p></Tarjeta>;
    return (
        <div className="grid xl:grid-cols-2 gap-5 items-start">
            <Tarjeta title="Separación de entornos">
                <dl className="text-sm space-y-3">
                    <div><dt className="text-xs font-semibold text-gray-500">Aplicación y administración</dt><dd className="font-mono text-gray-900">{p.adminHost}</dd><dd className="text-xs text-gray-500">No cambia. El panel, el inicio de sesión y la API siguen ahí.</dd></div>
                    <div><dt className="text-xs font-semibold text-gray-500">Sitio institucional público</dt><dd className="font-mono text-gray-900">{p.domain.publicHost}</dd><dd className="text-xs text-gray-500">{p.domain.publicLive ? `En vivo desde ${fecha(p.domain.liveAt)} (${p.domain.liveByName || '—'}).` : 'Sin activar: el dominio sigue llevando al panel.'}</dd></div>
                </dl>
                <div className="mt-5 pt-4 border-t border-gray-100">
                    <Campo label="Dominio público" hint="Sólo el nombre, sin https:// ni www."><div className="flex gap-2"><input className={campo} value={host} onChange={e => setHost(e.target.value)} /><button type="button" className={btnSecundario} disabled={busy || host === p.domain.publicHost} onClick={() => save({ publicHost: host }, 'Dominio guardado.')}>Guardar</button></div></Campo>
                </div>
                <div className="mt-5 pt-4 border-t border-gray-100">
                    <Toggle checked={p.review.required} onChange={v => save({ requireReview: v }, v ? 'La revisión previa vuelve a ser obligatoria.' : 'La revisión previa ya no es obligatoria.')} label="Exigir revisión antes de publicar" hint="Con esto activo, sólo se publica un borrador que un revisor (o un administrador central) aprobó tal como está." />
                </div>
            </Tarjeta>
            <div className="space-y-5">
                <Tarjeta title="Estado de conexión del dominio" actions={<button type="button" className={btnSecundario} onClick={check}><RefreshCw className="w-4 h-4" /> Comprobar</button>}>
                    {!st ? <Cargando /> : st.error ? <p className="text-sm text-rose-700">{st.error}</p> : (
                        <ul className="space-y-2">
                            <Linea ok={st.dns.ok}>DNS: {st.dns.ok ? `resuelve (${st.dns.records.join(', ')})` : `no resuelve${st.dns.error ? ` (${st.dns.error})` : ''}`}</Linea>
                            <Linea ok={st.https}>HTTPS / certificado: {st.https ? 'responde por HTTPS' : `sin respuesta${st.httpsError ? ` (${st.httpsError})` : ''}`}</Linea>
                            <Linea ok={st.reachesThisApp}>{st.reachesThisApp ? 'El dominio llega a esta aplicación: el sitio puede mostrarse ahí.' : st.redirectsTo ? <>El dominio hoy <strong>redirige</strong> a <span className="font-mono">{st.redirectsTo}</span>: lo atiende otro despliegue, no esta aplicación.</> : 'El dominio todavía no llega a esta aplicación.'}</Linea>
                        </ul>
                    )}
                    <p className="text-[11px] text-gray-500 mt-3">Comprobación de sólo lectura. Este módulo no modifica DNS ni la configuración del proveedor de alojamiento: conectar el dominio a esta aplicación es un paso manual y autorizado (ver «Pendientes para publicación» en la documentación).</p>
                </Tarjeta>
                <Tarjeta title="Activación del sitio público">
                    {p.domain.publicLive ? (<>
                        <p className="text-sm text-gray-700">El sitio está <strong className="text-emerald-700">en vivo</strong>: {p.domain.publicHost} muestra la versión publicada {p.publishedVersion}.</p>
                        <button type="button" className={`${btnPeligro} mt-4`} disabled={busy} onClick={() => { if (window.confirm('¿Desactivar el sitio público? El dominio volverá a llevar al panel. No se borra nada.')) save({ publicLive: false }, 'Sitio público desactivado.'); }}><Undo2 className="w-4 h-4" /> Desactivar el sitio público</button>
                    </>) : (<>
                        <p className="text-sm text-gray-700">Al activarlo, <strong>{p.domain.publicHost}</strong> dejará de redirigir al panel y mostrará la versión publicada. Los demás sitios y <span className="font-mono">{p.adminHost}</span> no cambian. Se puede desactivar en cualquier momento.</p>
                        {!p.hasPublished ? <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2 mt-3">Todavía no hay ninguna versión publicada.</p> : null}
                        {st && !st.error && !st.reachesThisApp ? <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2 mt-3">El dominio aún no llega a esta aplicación: activarlo no tendrá efecto visible hasta conectarlo.</p> : null}
                        <Campo label={`Para confirmar, escribe ${p.domain.publicHost}`} className="mt-4"><input className={campo} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" /></Campo>
                        <button type="button" className={`${btnPrimario} mt-3`} disabled={busy || !p.hasPublished || confirm.trim().toLowerCase() !== p.domain.publicHost} onClick={() => save({ publicLive: true, confirmHost: confirm }, 'Sitio público activado.')}><Globe className="w-4 h-4" /> Activar el sitio público</button>
                    </>)}
                </Tarjeta>
            </div>
        </div>
    );
};

// ── Historial de versiones ────────────────────────────────────────────

export const VersionsTab = ({ p, onPayload, dirty }: { p: Payload; onPayload: (p: Payload) => void; dirty: boolean }) => {
    const [versions, setVersions] = useState<any[] | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const load = useCallback(() => { api<{ versions: any[] }>('/admin/versions').then(r => setVersions(r.versions)).catch(e => { toast.error(e?.message); setVersions([]); }); api<{ events: any[] }>('/admin/events').then(r => setEvents(r.events)).catch(() => {}); }, []);
    useEffect(() => { load(); }, [load, p.publishedVersion, p.draftVersion]);
    const canEdit = p.abilities.includes('edit'); const canPublish = p.abilities.includes('publish');
    const restore = async (version: number) => {
        if (dirty) { toast.error('Guarda o descarta tus cambios antes de restaurar.'); return; }
        if (!window.confirm(`¿Traer la versión ${version} al BORRADOR? No cambia lo publicado.`)) return;
        try { onPayload(await api<Payload>('/admin/versions/restore', { method: 'POST', body: JSON.stringify({ version }) })); toast.success(`Versión ${version} restaurada al borrador.`); } catch (e: any) { toast.error(e?.message || 'No se pudo restaurar.'); }
    };
    const rollback = async (version: number) => {
        const note = window.prompt(`REVERSIÓN: el público volverá a ver la versión ${version} de inmediato.\nIndica el motivo:`);
        if (!note?.trim()) return;
        try { onPayload(await api<Payload>('/admin/rollback', { method: 'POST', body: JSON.stringify({ version, note }) })); toast.success(`Se volvió a publicar la versión ${version}.`); } catch (e: any) { toast.error(e?.message || 'No se pudo revertir.', { duration: 8000 }); }
    };
    const LABEL: Record<string, string> = { site_created: 'Sitio creado', draft_saved: 'Borrador guardado', published: 'Publicación', rolled_back: 'Reversión', version_restored_to_draft: 'Versión restaurada al borrador', review_in_review: 'Enviado a revisión', review_approved: 'Aprobado', review_changes_requested: 'Cambios solicitados', config_updated: 'Configuración del dominio', member_granted: 'Acceso concedido', member_removed: 'Acceso retirado', lead_updated: 'Solicitud gestionada', ai_suggested: 'Propuesta del asistente' };
    return (
        <div className="grid xl:grid-cols-[3fr_2fr] gap-5 items-start">
            <Tarjeta title="Versiones publicadas">
                {!versions ? <Cargando /> : !versions.length ? <p className="text-sm text-gray-500">Todavía no se publicó ninguna versión.</p> : (
                    <ol className="space-y-3">
                        {versions.map(v => (
                            <li key={v.id} className={`rounded-xl border p-4 ${v.version === p.publishedVersion ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100'}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold text-gray-900">Versión {v.version}{v.version === p.publishedVersion ? <span className="ml-2 text-[11px] font-semibold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">Publicada</span> : null}{v.restoredFrom ? <span className="ml-2 text-[11px] text-gray-500">reversión a la {v.restoredFrom}</span> : null}</p>
                                    <span className="flex gap-2">
                                        {canEdit ? <button type="button" className={btnSecundario} onClick={() => restore(v.version)}><RotateCcw className="w-4 h-4" /> Al borrador</button> : null}
                                        {canPublish && v.version !== p.publishedVersion ? <button type="button" className={btnPeligro} onClick={() => rollback(v.version)}><Undo2 className="w-4 h-4" /> Revertir a ésta</button> : null}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{v.publishedByName || '—'} · {fecha(v.publishedAt)}{v.note ? ` · «${v.note}»` : ''}</p>
                                <ul className="text-xs text-gray-700 mt-2 list-disc pl-5 space-y-0.5">{(v.summary || []).slice(0, 8).map((s: string, i: number) => <li key={i}>{s}</li>)}{(v.summary || []).length > 8 ? <li>… y {(v.summary || []).length - 8} cambio(s) más.</li> : null}</ul>
                            </li>
                        ))}
                    </ol>
                )}
            </Tarjeta>
            <Tarjeta title="Actividad">
                <ul className="divide-y divide-gray-100 max-h-[560px] overflow-y-auto">
                    {events.map(e => <li key={e.id} className="py-2 text-sm"><span className="font-medium text-gray-900">{LABEL[e.action] || e.action}</span>{e.detail?.version ? ` · v${e.detail.version}` : ''}{e.detail?.note ? ` · «${e.detail.note}»` : ''}<span className="block text-[11px] text-gray-500">{e.actorName || '—'} · {fecha(e.createdAt)}</span></li>)}
                    {!events.length ? <li className="py-2 text-sm text-gray-500">Sin actividad todavía.</li> : null}
                </ul>
            </Tarjeta>
        </div>
    );
};

// ── Solicitudes ───────────────────────────────────────────────────────

const LEAD_LABEL: Record<string, string> = { nueva: 'Nueva', en_gestion: 'En gestión', respondida: 'Respondida', descartada: 'Descartada' };

export const LeadsTab = () => {
    const [status, setStatus] = useState('');
    const [data, setData] = useState<{ leads: any[]; counts: Record<string, number> } | null>(null);
    const load = useCallback(() => { api<any>(`/admin/leads?status=${status}`).then(setData).catch(e => { toast.error(e?.message || 'No se pudieron cargar.'); setData({ leads: [], counts: {} }); }); }, [status]);
    useEffect(() => { load(); }, [load]);
    const mover = async (id: string, s: string) => { try { await api(`/admin/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) }); load(); } catch (e: any) { toast.error(e?.message || 'No se pudo actualizar.'); } };
    return (
        <Tarjeta title="Solicitudes de información" actions={<select className={`${campo} !w-auto`} value={status} onChange={e => setStatus(e.target.value)} aria-label="Filtrar por estado"><option value="">Todas</option>{Object.entries(LEAD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}{data?.counts[k] ? ` (${data.counts[k]})` : ''}</option>)}</select>}>
            <p className="text-[11px] text-gray-500 -mt-2 mb-3">Lo que llega por el formulario del sitio institucional. Datos personales: privados, sólo para responder la solicitud.</p>
            {!data ? <Cargando /> : !data.leads.length ? <p className="text-sm text-gray-500">No hay solicitudes{status ? ' en este estado' : ' todavía'}.</p> : (
                <ul className="space-y-3">
                    {data.leads.map(l => (
                        <li key={l.id} className="rounded-xl border border-gray-100 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0"><p className="font-semibold text-gray-900">{l.name}</p><p className="text-sm text-gray-600 break-all"><a className="text-rotary-blue hover:underline" href={`mailto:${l.email}`}>{l.email}</a>{l.phone ? ` · ${l.phone}` : ''}</p><p className="text-xs text-gray-500">{[l.organization, l.roleTitle, l.country].filter(Boolean).join(' · ') || '—'} · {fecha(l.createdAt)}</p></div>
                                <select className={`${campo} !w-auto`} value={l.status} onChange={e => mover(l.id, e.target.value)} aria-label={`Estado de la solicitud de ${l.name}`}>{Object.entries(LEAD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                            </div>
                            {l.message ? <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{l.message}</p> : null}
                        </li>
                    ))}
                </ul>
            )}
        </Tarjeta>
    );
};

// ── Accesos ───────────────────────────────────────────────────────────

export const MembersTab = ({ canManage }: { canManage: boolean }) => {
    const [members, setMembers] = useState<any[] | null>(null);
    const [email, setEmail] = useState(''); const [role, setRole] = useState('editor');
    useEffect(() => { if (canManage) api<{ members: any[] }>('/admin/members').then(r => setMembers(r.members)).catch(e => { toast.error(e?.message); setMembers([]); }); }, [canManage]);
    const add = async () => { try { const r = await api<{ members: any[] }>('/admin/members', { method: 'POST', body: JSON.stringify({ email, role }) }); setMembers(r.members); setEmail(''); toast.success('Acceso concedido.'); } catch (e: any) { toast.error(e?.message || 'No se pudo conceder.', { duration: 8000 }); } };
    const remove = async (id: string) => { if (!window.confirm('¿Retirar este acceso?')) return; try { setMembers((await api<{ members: any[] }>(`/admin/members/${id}`, { method: 'DELETE' })).members); } catch (e: any) { toast.error(e?.message); } };
    return (
        <Tarjeta title="Accesos al sitio institucional">
            <ul className="text-sm text-gray-700 space-y-1 mb-4">
                <li><strong>{ROLE_LABELS.admin}:</strong> todo, incluido publicar, revertir, el dominio y los accesos. Es el rol de administrador de la plataforma; no se asigna aquí.</li>
                <li><strong>{ROLE_LABELS.editor}:</strong> edita el borrador, lo envía a revisión y gestiona solicitudes. No publica.</li>
                <li><strong>{ROLE_LABELS.reviewer}:</strong> ve el borrador y lo aprueba o pide cambios. No edita ni publica.</li>
                <li><strong>Sin acceso:</strong> cualquier otra cuenta. El servidor responde 403.</li>
            </ul>
            {!canManage ? <p className="text-sm text-gray-500">Sólo un administrador central gestiona los accesos.</p> : (<>
                <div className="flex flex-wrap gap-2 items-end">
                    <Campo label="Correo de una cuenta existente" className="flex-1 min-w-[220px]"><input type="email" className={campo} value={email} onChange={e => setEmail(e.target.value)} /></Campo>
                    <Campo label="Rol"><select className={campo} value={role} onChange={e => setRole(e.target.value)}><option value="editor">{ROLE_LABELS.editor}</option><option value="reviewer">{ROLE_LABELS.reviewer}</option></select></Campo>
                    <button type="button" className={btnPrimario} disabled={!email.trim()} onClick={add}>Conceder acceso</button>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">Quien recibe acceso entra directamente a <span className="font-mono">/admin/sitio-institucional</span>. Este módulo no crea cuentas ni contraseñas.</p>
                <ul className="divide-y divide-gray-100 mt-4">
                    {!members ? <li className="py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></li> : !members.length ? <li className="py-3 text-sm text-gray-500">Nadie más tiene acceso.</li> : members.map(m => (
                        <li key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-sm"><span><span className="font-medium text-gray-900">{m.email}</span><span className="block text-[11px] text-gray-500">{ROLE_LABELS[m.role] || m.role} · lo concedió {m.grantedByName || '—'} · {fecha(m.createdAt)}</span></span><button type="button" className="p-1.5 text-gray-400 hover:text-rose-600" onClick={() => remove(m.id)} aria-label={`Retirar acceso a ${m.email}`}><Trash2 className="w-4 h-4" /></button></li>
                    ))}
                </ul>
            </>)}
        </Tarjeta>
    );
};
