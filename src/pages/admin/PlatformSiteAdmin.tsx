/**
 * Sitio web de Club Platform — el módulo del panel central (v4.1348.0)
 *
 * `/admin/sitio-institucional`. Aquí se crea, edita, previsualiza, revisa,
 * publica y revierte el sitio institucional de la PLATAFORMA. No es el sitio
 * de un club: no tiene tenant, y su acceso lo decide el servidor (administrador
 * central, o editor / revisor concedido por persona).
 *
 * Flujo: Borrador → Vista previa → Revisión → Publicación. Publicar deja la
 * versión lista; que el dominio público la muestre es OTRA decisión, en la
 * pestaña «Dominio».
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, AppWindow, BarChart3, CheckCircle2, Eye, FileStack, Globe, History, Inbox, Palette, PencilLine, Save, Search, Send, ShieldCheck, Sparkles, Undo2, Users } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../../components/admin/AdminLayout';
import { api, ApiError, fecha, type Payload } from '../../components/admin/platform-site/api';
import EditorTab from '../../components/admin/platform-site/EditorTab';
import { DesignTab, DomainTab, LeadsTab, MembersTab, PreviewTab, SeoTab, VersionsTab } from '../../components/admin/platform-site/Tabs';
import { Tarjeta, btnPrimario, btnSecundario, Cargando } from '../../components/admin/programas/ui';
import { REVIEW_LABELS, validateSiteLight, type Site } from '../../lib/platformSiteSpec';

type Tab = 'resumen' | 'contenido' | 'preview' | 'diseno' | 'seo' | 'dominio' | 'versiones' | 'solicitudes' | 'accesos';
const TABS: { id: Tab; label: string; icon: typeof Eye; need?: string }[] = [
    { id: 'resumen', label: 'Resumen', icon: AppWindow },
    { id: 'contenido', label: 'Páginas y contenido', icon: PencilLine },
    { id: 'preview', label: 'Vista previa', icon: Eye },
    { id: 'diseno', label: 'Diseño', icon: Palette },
    { id: 'seo', label: 'SEO', icon: Search },
    { id: 'dominio', label: 'Dominio', icon: Globe },
    { id: 'versiones', label: 'Versiones', icon: History },
    { id: 'solicitudes', label: 'Solicitudes', icon: Inbox, need: 'leads' },
    { id: 'accesos', label: 'Accesos', icon: Users },
];

const STATUS: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Borrador · sin publicar', cls: 'bg-gray-100 text-gray-700' },
    published_private: { label: 'Publicado · dominio sin activar', cls: 'bg-sky-100 text-sky-800' },
    live: { label: 'En vivo', cls: 'bg-emerald-100 text-emerald-800' },
};

const Dato = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt><dd className="text-sm text-gray-900 mt-0.5">{children}</dd></div>
);
const Check = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{children}</span>
);

const Stats = () => {
    const [s, setS] = useState<any>(null);
    useEffect(() => { api('/admin/stats?days=30').then(setS).catch(() => setS({ totals: { views: 0, visitors: 0 }, pages: [] })); }, []);
    return (
        <Tarjeta title="Analíticas del sitio institucional" actions={<Link to="/admin/analytics" className={btnSecundario}><BarChart3 className="w-4 h-4" /> Abrir Analíticas</Link>}>
            {!s ? <Cargando /> : (
                <div className="grid sm:grid-cols-3 gap-4">
                    <div><p className="text-2xl font-bold text-gray-900">{s.totals.views}</p><p className="text-xs text-gray-500">páginas vistas · 30 días</p></div>
                    <div><p className="text-2xl font-bold text-gray-900">{s.totals.visitors}</p><p className="text-xs text-gray-500">visitantes por día (suma) · 30 días</p></div>
                    <div className="text-xs text-gray-600">{s.pages.slice(0, 4).map((p: any) => <p key={p.path} className="flex justify-between gap-2"><span className="font-mono truncate">{p.path}</span><span>{p.views}</span></p>)}{!s.pages.length ? 'Sin visitas registradas: el sitio aún no está en vivo.' : null}</div>
                </div>
            )}
            <p className="text-[11px] text-gray-500 mt-3">Conteo propio, sin IP ni datos personales, sólo del sitio en vivo y sin el tráfico de sesiones del panel. En «Analíticas», el filtro de sitios incluye <strong>Club Platform — Institucional</strong>: mide únicamente el dominio público (coincidencia exacta) y excluye <span className="font-mono">/admin</span>, separado del consolidado del ecosistema.</p>
        </Tarjeta>
    );
};

const PlatformSiteAdmin = () => {
    const [p, setP] = useState<Payload | null>(null);
    const [site, setSite] = useState<Site | null>(null);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [denied, setDenied] = useState('');
    const [tab, setTab] = useState<Tab>('resumen');

    const apply = useCallback((r: Payload) => { setP(r); if (r.exists) setSite(r.draft); setDirty(false); }, []);
    /** Un cambio de configuración (dominio, revisión) no debe llevarse por delante lo que se está editando. */
    const applyMeta = useCallback((r: Payload) => { setP(r); if (!dirty && r.exists) setSite(r.draft); }, [dirty]);
    const load = useCallback(async () => {
        try { apply(await api<Payload>('/admin')); }
        catch (e: any) { if (e instanceof ApiError && e.status === 403) setDenied(e.message); else toast.error(e?.message || 'No se pudo cargar el sitio institucional.'); }
    }, [apply]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!dirty) return;
        const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
    }, [dirty]);

    const can = (a: string) => Boolean(p?.abilities.includes(a));
    const update = useCallback((fn: (s: Site) => Site) => { setSite(s => (s ? fn(s) : s)); setDirty(true); }, []);
    const run = async (fn: () => Promise<Payload>, ok: string) => {
        setBusy(true);
        try { apply(await fn()); toast.success(ok); }
        catch (e: any) { toast.error(e?.message || 'No se pudo completar.', { duration: e instanceof ApiError && e.status === 409 ? 12000 : 8000 }); }
        finally { setBusy(false); }
    };
    const crear = () => run(() => api<Payload>('/admin/create', { method: 'POST' }), 'Sitio institucional creado en borrador.');
    const guardar = () => {
        if (!site || !p) return;
        const errs = validateSiteLight(site);
        if (errs.length) { toast.error(errs[0].message); setTab('contenido'); return; }
        run(() => api<Payload>('/admin/draft', { method: 'PUT', body: JSON.stringify({ site, baseVersion: p.draftVersion }) }), 'Borrador guardado. El sitio público no cambia hasta publicar.');
    };
    const enviarRevision = () => { if (p) run(() => api<Payload>('/admin/review/submit', { method: 'POST', body: JSON.stringify({ baseVersion: p.draftVersion }) }), 'Borrador enviado a revisión.'); };
    const decidir = (decision: 'approved' | 'changes_requested') => {
        if (!p) return;
        const note = decision === 'changes_requested' ? window.prompt('¿Qué cambios hacen falta?') : (window.prompt('Nota de aprobación (opcional)') ?? '');
        if (decision === 'changes_requested' && !note?.trim()) return;
        run(() => api<Payload>('/admin/review/decide', { method: 'POST', body: JSON.stringify({ decision, note, baseVersion: p.draftVersion }) }), decision === 'approved' ? 'Borrador aprobado para publicar.' : 'Cambios solicitados.');
    };
    const publicar = () => {
        if (!p) return;
        const avisos = p.publish.checklist.warnings;
        const note = window.prompt(`Vas a publicar el borrador ${p.draftVersion} como versión ${(p.publishedVersion || 0) + 1}.${p.domain.publicLive ? `\nEl sitio está EN VIVO: ${p.domain.publicHost} cambiará de inmediato.` : '\nEl dominio público no está activado: nadie lo verá todavía.'}${avisos.length ? `\n\nAvisos:\n- ${avisos.join('\n- ')}` : ''}\n\nDescribe brevemente los cambios:`);
        if (note === null) return;
        run(() => api<Payload>('/admin/publish', { method: 'POST', body: JSON.stringify({ baseVersion: p.draftVersion, note }) }), 'Versión publicada.');
    };
    const descartar = () => { if (window.confirm('¿Descartar los cambios sin guardar?')) load(); };

    if (denied) return <AdminLayout><Tarjeta title="Sitio web de Club Platform"><p className="text-sm text-gray-700 inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gray-400" /> {denied}</p></Tarjeta></AdminLayout>;
    if (!p) return <AdminLayout><Cargando /></AdminLayout>;

    if (!p.exists || !site) {
        return (
            <AdminLayout>
                <div className="rounded-3xl border border-gray-100 bg-white shadow-sm p-8 md:p-12 text-center">
                    <span className="inline-flex w-14 h-14 rounded-2xl bg-sky-100 text-rotary-blue items-center justify-center mb-5"><AppWindow className="w-7 h-7" /></span>
                    <h1 className="text-2xl font-bold text-gray-900">Sitio web de Club Platform</h1>
                    <p className="text-gray-600 mt-2 max-w-2xl mx-auto">Club Platform todavía no tiene su sitio institucional. Se crea con el mismo motor que administra los sitios del ecosistema, sobre la plantilla institucional, y nace en <strong>borrador</strong>: nada se publica hasta que alguien autorizado lo decida.</p>
                    <dl className="grid sm:grid-cols-4 gap-4 text-left max-w-3xl mx-auto mt-8">
                        <Dato label="Nombre">Club Platform for Rotary</Dato><Dato label="Tipo">{p.siteTypeLabel}</Dato><Dato label="Estado inicial">Borrador</Dato><Dato label="Dominio previsto">clubplatform.org</Dato>
                    </dl>
                    {can('publish') ? <button type="button" className={`${btnPrimario} mt-8 !px-6 !py-3`} disabled={busy} onClick={crear}><Sparkles className="w-4 h-4" /> Crear sitio institucional</button> : <p className="text-sm text-gray-500 mt-8">Sólo un administrador central puede crearlo.</p>}
                </div>
            </AdminLayout>
        );
    }

    const ro = !can('edit');
    const st = STATUS[p.status];
    const rev = p.review;
    const visibles = TABS.filter(t => !t.need || can(t.need));

    return (
        <AdminLayout>
            <div className="space-y-5">
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 sticky top-0 z-20">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="text-xl font-bold text-gray-900 flex flex-wrap items-center gap-2">Sitio web de Club Platform <span className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${st.cls}`}>{st.label}</span></h1>
                            <p className="text-xs text-gray-500 mt-1">{p.siteTypeLabel} · tu rol: {p.roleLabel} · borrador {p.draftVersion}{p.publishedVersion ? ` · publicada la versión ${p.publishedVersion}` : ''} · revisión: {REVIEW_LABELS[rev.status] || rev.status}{dirty ? <span className="text-amber-700 font-semibold"> · cambios sin guardar</span> : p.unpublishedChanges ? <span className="text-amber-700 font-semibold"> · borrador con cambios sin publicar</span> : null}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {dirty ? <button type="button" className={btnSecundario} onClick={descartar}><Undo2 className="w-4 h-4" /> Descartar</button> : null}
                            {can('edit') ? <button type="button" className={btnPrimario} disabled={busy || !dirty} onClick={guardar}><Save className="w-4 h-4" /> Guardar borrador</button> : null}
                            <button type="button" className={btnSecundario} onClick={() => setTab('preview')}><Eye className="w-4 h-4" /> Vista previa</button>
                            {can('edit') && rev.required && !['in_review'].includes(rev.status) && !(rev.status === 'approved' && rev.current) && p.unpublishedChanges ? <button type="button" className={btnSecundario} disabled={busy || dirty} onClick={enviarRevision}><Send className="w-4 h-4" /> Enviar a revisión</button> : null}
                            {can('review') && p.unpublishedChanges && !(rev.status === 'approved' && rev.current) ? (<>
                                <button type="button" className={btnSecundario} disabled={busy || dirty} onClick={() => decidir('changes_requested')}>Pedir cambios</button>
                                <button type="button" className={btnSecundario} disabled={busy || dirty} onClick={() => decidir('approved')}><ShieldCheck className="w-4 h-4" /> Aprobar</button>
                            </>) : null}
                            {can('publish') ? <button type="button" className={btnPrimario} disabled={busy || dirty || !p.publish.allowed || !p.unpublishedChanges} title={!p.publish.allowed ? p.publish.reason : !p.unpublishedChanges ? 'No hay cambios por publicar.' : ''} onClick={publicar}><Send className="w-4 h-4" /> Publicar cambios</button> : null}
                        </div>
                    </div>
                    {can('publish') && !p.publish.allowed && p.unpublishedChanges && !dirty ? <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-1.5 mt-3">{p.publish.reason}</p> : null}
                    {rev.status === 'changes_requested' && rev.note ? <p className="text-xs text-rose-800 bg-rose-50 rounded-lg px-3 py-1.5 mt-3">Cambios solicitados por {rev.reviewedByName || 'revisión'}: «{rev.note}»</p> : null}
                    <div className="flex flex-wrap gap-1 mt-4 -mb-1" role="tablist" aria-label="Secciones del módulo">
                        {visibles.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t.id ? 'bg-rotary-blue text-white' : 'text-gray-600 hover:bg-gray-50'}`}><t.icon className="w-4 h-4" /> {t.label}</button>)}
                    </div>
                </div>

                {tab === 'resumen' ? (<>
                    <Tarjeta title="Vista general">
                        <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
                            <Dato label="Nombre del sitio">{site.settings.name}</Dato>
                            <Dato label="Tipo">Institucional / Plataforma</Dato>
                            <Dato label="Estado de publicación"><span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${st.cls}`}>{st.label}</span></Dato>
                            <Dato label="Dominio configurado"><span className="font-mono">{p.domain.publicHost}</span></Dato>
                            <Dato label="Última actualización">{fecha(p.updatedAt)}</Dato>
                            <Dato label="Responsable de la última modificación">{p.updatedByName || '—'}</Dato>
                            <Dato label="Versión publicada">{p.publishedVersion ? `Versión ${p.publishedVersion} · ${fecha(p.publishedAt)} · ${p.publishedByName || '—'}` : 'Ninguna'}</Dato>
                            <Dato label="Versión en borrador">Borrador {p.draftVersion} · {REVIEW_LABELS[rev.status] || rev.status}</Dato>
                            <Dato label="Estado de SEO"><span className="flex flex-col gap-0.5"><Check ok={p.seo.title}>Metatítulo</Check><Check ok={p.seo.description}>Metadescripción</Check><Check ok={p.seo.image}>Imagen para compartir</Check></span></Dato>
                            <Dato label="Estado de conexión del dominio"><Check ok={p.domain.publicLive}>{p.domain.publicLive ? 'Sitio público activado' : 'Sitio público sin activar'}</Check><button type="button" className="block text-xs text-rotary-blue hover:underline mt-1" onClick={() => setTab('dominio')}>Comprobar conexión</button></Dato>
                            <Dato label="Propietario">Administración central de Club Platform</Dato>
                            <Dato label="Panel de administración"><span className="font-mono">{p.adminHost}</span></Dato>
                        </dl>
                    </Tarjeta>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {([['contenido', PencilLine, 'Editar sitio', 'Textos, imágenes, botones y secciones.'], ['preview', Eye, 'Vista previa', 'Escritorio, tableta y móvil.'], ['contenido', FileStack, 'Gestionar páginas', `${site.pages.length} página(s).`], ['diseno', Palette, 'Diseño y personalización', 'Identidad, menú y pie.'], ['seo', Search, 'SEO y metadatos', 'Títulos, descripciones y Open Graph.'], ['dominio', Globe, 'Configuración del dominio', p.domain.publicHost], ['versiones', History, 'Historial de versiones', 'Publicaciones y reversión.'], ['accesos', Users, 'Accesos', 'Editores y revisores.']] as [Tab, typeof Eye, string, string][]).map(([id, Icon, title, text]) => (
                            <button key={title} type="button" onClick={() => setTab(id)} className="text-left rounded-2xl border border-gray-100 bg-white shadow-sm p-4 hover:border-rotary-blue hover:shadow transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-blue">
                                <Icon className="w-5 h-5 text-rotary-blue" /><p className="font-semibold text-gray-900 mt-2">{title}</p><p className="text-xs text-gray-500 mt-0.5 truncate">{text}</p>
                            </button>
                        ))}
                    </div>
                    <Tarjeta title="Antes de publicar">
                        {p.publish.checklist.blocking.length === 0 && p.publish.checklist.warnings.length === 0 ? <p className="text-sm text-emerald-700 inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Sin pendientes de contenido.</p> : (
                            <ul className="space-y-1.5 text-sm">
                                {p.publish.checklist.blocking.map((m, i) => <li key={`b${i}`} className="flex items-start gap-2 text-rose-700"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {m} <span className="text-[11px] font-semibold">(impide publicar)</span></li>)}
                                {p.publish.checklist.warnings.map((m, i) => <li key={`w${i}`} className="flex items-start gap-2 text-amber-800"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {m}</li>)}
                            </ul>
                        )}
                        <p className="text-[11px] text-gray-500 mt-3">Flujo editorial: Borrador → Vista previa → Revisión → Publicación. {rev.required ? 'La revisión es obligatoria: sólo se publica un borrador aprobado tal como está.' : 'La revisión previa no es obligatoria.'} Los avisos se calculan sobre el borrador guardado.</p>
                    </Tarjeta>
                    <Stats />
                </>) : null}

                {tab === 'contenido' ? <EditorTab p={p} site={site} update={update} ro={ro} /> : null}
                {tab === 'preview' ? <PreviewTab site={site} dirty={dirty} draftVersion={p.draftVersion} /> : null}
                {tab === 'diseno' ? <DesignTab site={site} update={update} ro={ro} /> : null}
                {tab === 'seo' ? <SeoTab site={site} update={update} ro={ro} host={p.domain.publicHost} /> : null}
                {tab === 'dominio' ? <DomainTab p={p} onPayload={applyMeta} /> : null}
                {tab === 'versiones' ? <VersionsTab p={p} onPayload={apply} dirty={dirty} /> : null}
                {tab === 'solicitudes' ? <LeadsTab /> : null}
                {tab === 'accesos' ? <MembersTab canManage={can('members')} /> : null}
            </div>
        </AdminLayout>
    );
};

export default PlatformSiteAdmin;
