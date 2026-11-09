/**
 * Gestión educativa — el panel del comité (v4.1302.0) — `/admin/gestion-educativa`
 *
 * Subsecciones: Resumen · Cursos pendientes · Cursos · Colecciones ·
 * Publicados · Configuración. El comité revisa, pide correcciones, aprueba,
 * publica, despublica y archiva; cada decisión queda en el historial del
 * curso y avisa al club por correo. Nada se publica porque el club lo cargue.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, ExternalLink, FileText, GraduationCap, Inbox, Layers, Loader2, Play, RefreshCw, Search, Settings, Undo2, Archive, Eye, EyeOff, MessageSquare, RotateCcw, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminApi, fmtBytes, fmtDate, fmtMinutes, type Catalogs, type Collection, type CourseSummary, type Course, type Module, type Lesson, type Resource, type LFile, type LEvent } from '../../lib/learningClient';
import { campo, btnPrimario, btnSecundario, btnPeligro, Campo, StatusChip, Cargando, Vacio, Dialogo, KindIcon } from '../../components/learning/learningUi';

type Tab = 'resumen' | 'pendientes' | 'cursos' | 'colecciones' | 'publicados' | 'config';
const TABS: { id: Tab; label: string }[] = [
    { id: 'resumen', label: 'Resumen' }, { id: 'pendientes', label: 'Cursos pendientes' }, { id: 'cursos', label: 'Cursos' },
    { id: 'colecciones', label: 'Colecciones' }, { id: 'publicados', label: 'Contenidos publicados' }, { id: 'config', label: 'Configuración' },
];

interface Overview { summary: { inReview: number; approved: number; published: number; changesRequested: number; drafts: number; total: number; collections: number; sites: number }; config: any; collections: Collection[]; catalogs: Catalogs }
interface AdminCourseRow extends Partial<Course> { id: string; title: string; status: string; stateLabel: string; ownerClubName: string | null; collectionName: string | null; collectionSlug: string | null; lessonCount: number; submittedAt: string | null; updatedAt: string; accessMode: string; projectRef: string | null; coverUrl: string | null; slug: string }
interface AdminCourseView { course: Course; modules: Module[]; lessons: Lesson[]; resources: Resource[]; files: LFile[]; readiness: any; displayStatus: string; durationMinutes: number; transitions: string[]; collection: Collection | null; events: LEvent[]; catalogs: Catalogs }

const TRANSITION_LABEL: Record<string, { label: string; tone: string; icon: ReactNode; needsNote?: boolean; confirm?: string }> = {
    approved: { label: 'Aprobar', tone: btnPrimario, icon: <CheckCircle2 className="w-4 h-4" /> },
    changes_requested: { label: 'Solicitar correcciones', tone: btnSecundario, icon: <Undo2 className="w-4 h-4" />, needsNote: true },
    published: { label: 'Publicar', tone: btnPrimario, icon: <Eye className="w-4 h-4" />, confirm: 'El curso aparecerá en la biblioteca pública del Distrito según su modalidad de acceso. ¿Publicar?' },
    archived: { label: 'Archivar', tone: btnPeligro, icon: <Archive className="w-4 h-4" />, confirm: '¿Archivar este curso? Deja de verse y el club puede restaurarlo como borrador.' },
    draft: { label: 'Restaurar como borrador', tone: btnSecundario, icon: <RotateCcw className="w-4 h-4" /> },
};

const GestionEducativaAdmin = () => {
    const [params, setParams] = useSearchParams();
    const tab = (params.get('tab') as Tab) || 'resumen';
    const setTab = (t: Tab) => { const p = new URLSearchParams(params); p.set('tab', t); p.delete('curso'); setParams(p); };
    const cursoId = params.get('curso') || '';
    const abrirCurso = (id: string | null) => { const p = new URLSearchParams(params); if (id) p.set('curso', id); else p.delete('curso'); setParams(p); };

    const [ov, setOv] = useState<Overview | null>(null);
    const [error, setError] = useState('');
    const cargarResumen = useCallback(async () => { try { setOv(await adminApi<Overview>('/resumen')); setError(''); } catch (e: any) { setError(e?.message || 'No se pudo cargar.'); } }, []);
    useEffect(() => { cargarResumen(); }, [cargarResumen]);
    const cat = ov?.catalogs || null;

    if (error) return <AdminLayout><div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm" role="alert">{error}</div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="space-y-5">
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="p-2.5 rounded-xl bg-blue-50 text-rotary-blue"><GraduationCap className="w-6 h-6" /></span>
                        <div><h1 className="text-xl font-black text-gray-800">Gestión educativa</h1><p className="text-xs text-gray-500">Cursos y capacitaciones de los clubes: revisión, aprobación y publicación en la biblioteca del Distrito.</p></div>
                    </div>
                    <div className="flex gap-2">
                        <Link to="/cursos" target="_blank" className={btnSecundario}><ExternalLink className="w-4 h-4" /> Biblioteca pública</Link>
                        <button type="button" onClick={cargarResumen} className={btnSecundario}><RefreshCw className="w-4 h-4" /> Actualizar</button>
                    </div>
                </div>
                <div className="flex gap-1 overflow-x-auto bg-gray-100/70 rounded-2xl p-1" role="tablist">
                    {TABS.map(t => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 rounded-xl text-sm whitespace-nowrap ${tab === t.id ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900'}`}>{t.label}{t.id === 'pendientes' && ov?.summary.inReview ? <span className="ml-2 rounded-full bg-rotary-blue text-white text-[10px] px-1.5 py-0.5">{ov.summary.inReview}</span> : null}</button>)}
                </div>
                {!ov ? <Cargando /> : null}
                {ov && tab === 'resumen' ? <Resumen ov={ov} onTab={setTab} /> : null}
                {ov && tab === 'pendientes' ? <ListaCursos key="pend" status="in_review,approved" cat={cat} onOpen={abrirCurso} titulo="Cursos enviados por los clubes, pendientes de revisión o de publicación" /> : null}
                {ov && tab === 'cursos' ? <ListaCursos key="all" status="" cat={cat} onOpen={abrirCurso} titulo="Todos los cursos (cualquier estado)" conFiltroEstado /> : null}
                {ov && tab === 'publicados' ? <ListaCursos key="pub" status="published" cat={cat} onOpen={abrirCurso} titulo="Cursos publicados en la biblioteca" /> : null}
                {ov && tab === 'colecciones' ? <Colecciones collections={ov.collections} cat={cat} onRefresh={cargarResumen} onOpen={abrirCurso} /> : null}
                {ov && tab === 'config' ? <Configuracion initial={ov.config} cat={cat} onSaved={cargarResumen} /> : null}
                {cursoId ? <FichaCurso id={cursoId} onClose={() => abrirCurso(null)} onChanged={cargarResumen} /> : null}
            </div>
        </AdminLayout>
    );
};

const Indicador = ({ label, value, tone = 'text-gray-800', onClick }: { label: string; value: number; tone?: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick} className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 text-left hover:border-blue-200">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p><p className={`text-2xl font-black mt-1 ${tone}`}>{value}</p>
    </button>
);
const Resumen = ({ ov, onTab }: { ov: Overview; onTab: (t: Tab) => void }) => (
    <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Indicador label="En revisión" value={ov.summary.inReview} tone="text-blue-700" onClick={() => onTab('pendientes')} />
            <Indicador label="Aprobados sin publicar" value={ov.summary.approved} tone="text-emerald-700" onClick={() => onTab('pendientes')} />
            <Indicador label="Publicados" value={ov.summary.published} tone="text-green-700" onClick={() => onTab('publicados')} />
            <Indicador label="Con correcciones pedidas" value={ov.summary.changesRequested} tone="text-amber-700" onClick={() => onTab('cursos')} />
            <Indicador label="Borradores de los clubes" value={ov.summary.drafts} onClick={() => onTab('cursos')} />
            <Indicador label="Cursos en total" value={ov.summary.total} onClick={() => onTab('cursos')} />
            <Indicador label="Colecciones" value={ov.collections.length} onClick={() => onTab('colecciones')} />
            <Indicador label="Clubes con cursos" value={ov.summary.sites} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 text-sm text-gray-600">
            <h2 className="font-black text-gray-800">Cómo funciona</h2>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
                <li>El club crea una colección y sus cursos en «Mis cursos y capacitaciones» (<code className="text-xs">/mis-cursos</code>), con guardado automático.</li>
                <li>Cuando un curso cumple los requisitos, lo envía a revisión. Cada curso se revisa por separado: uno con correcciones no bloquea a los demás de su colección.</li>
                <li>El comité aprueba o pide correcciones (con motivo). Aprobar NO publica: publicar es una segunda decisión{ov.config?.autoPublishOnApprove ? ' (en esta configuración, aprobar publica automáticamente)' : ''}.</li>
                <li>Lo publicado aparece en la biblioteca pública según su modalidad de acceso; los cursos privados sólo con enlace de invitación.</li>
            </ol>
        </div>
    </div>
);

const ListaCursos = ({ status, cat, onOpen, titulo, conFiltroEstado = false }: { status: string; cat: Catalogs | null; onOpen: (id: string) => void; titulo: string; conFiltroEstado?: boolean }) => {
    const [rows, setRows] = useState<AdminCourseRow[] | null>(null);
    const [total, setTotal] = useState(0);
    const [q, setQ] = useState('');
    const [estado, setEstado] = useState(status);
    const [page, setPage] = useState(1);
    useEffect(() => {
        let vivo = true;
        const qs = new URLSearchParams({ page: String(page), ...(estado ? { status: estado } : {}), ...(q ? { q } : {}) });
        adminApi<{ courses: AdminCourseRow[]; total: number }>(`/cursos?${qs}`).then(r => { if (vivo) { setRows(r.courses); setTotal(r.total); } }).catch(e => { if (vivo) { toast.error(e?.message); setRows([]); } });
        return () => { vivo = false; };
    }, [estado, q, page]);
    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-black text-gray-800">{titulo}</h2>
                <div className="flex gap-2">
                    <label className="relative"><Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={`${campo} pl-9 w-56`} placeholder="Buscar título, club, proyecto" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></label>
                    {conFiltroEstado ? <select className={campo} value={estado} onChange={e => { setEstado(e.target.value); setPage(1); }}><option value="">Todos los estados</option>{Object.entries(cat?.states || {}).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select> : null}
                </div>
            </div>
            {rows === null ? <Cargando /> : rows.length === 0 ? <Vacio texto="No hay cursos con estos criterios." /> : (
                <ul className="mt-4 divide-y divide-gray-100" data-testid="admin-course-list">
                    {rows.map(k => (
                        <li key={k.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="w-full sm:w-24 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0">{k.coverUrl ? <img src={k.coverUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><BookOpen className="w-5 h-5" /></div>}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => onOpen(k.id)} className="font-bold text-gray-800 hover:text-rotary-blue text-left">{k.title || 'Sin título'}</button><StatusChip id={k.status} catalogs={cat} /></div>
                                <p className="text-xs text-gray-500 mt-0.5">{k.ownerClubName || 'Club'}{k.collectionName ? ` · ${k.collectionName}` : ' · curso individual'}{k.projectRef ? ` · ${k.projectRef}` : ''} · {k.lessonCount} lección(es) · {cat?.accessModes?.[k.accessMode]?.label}{k.submittedAt ? ` · enviado ${fmtDate(k.submittedAt)}` : ''}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                {k.status === 'published' ? <a href={`/cursos/${k.slug}`} target="_blank" rel="noreferrer" className={btnSecundario}><ExternalLink className="w-4 h-4" /> Ver</a> : null}
                                <button type="button" onClick={() => onOpen(k.id)} className={btnPrimario}>Revisar</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {total > 40 ? <div className="flex items-center justify-between mt-4 text-xs text-gray-500"><span>{total} cursos</span><div className="flex gap-2"><button type="button" className={btnSecundario} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><button type="button" className={btnSecundario} disabled={page * 40 >= total} onClick={() => setPage(p => p + 1)}>Siguiente</button></div></div> : null}
        </div>
    );
};

const Colecciones = ({ collections, cat, onRefresh, onOpen }: { collections: Collection[]; cat: Catalogs | null; onRefresh: () => void; onOpen: (id: string) => void }) => {
    const [abierta, setAbierta] = useState<{ collection: Collection; courses: CourseSummary[] } | null>(null);
    const abrir = async (c: Collection) => { try { setAbierta(await adminApi(`/colecciones/${c.id}`)); } catch (e: any) { toast.error(e?.message); } };
    const estado = async (c: Collection, status: 'archived' | 'active') => { try { await adminApi(`/colecciones/${c.id}/estado`, { method: 'POST', body: { status } }); toast.success(status === 'archived' ? 'Colección archivada.' : 'Colección restaurada.'); onRefresh(); setAbierta(null); } catch (e: any) { toast.error(e?.message); } };
    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
            <h2 className="text-sm font-black text-gray-800">Colecciones de los clubes</h2>
            {!collections.length ? <Vacio texto="Ningún club ha creado colecciones todavía." /> : (
                <ul className="mt-4 divide-y divide-gray-100">
                    {collections.map(c => (
                        <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1 min-w-0"><p className="font-bold text-gray-800">{c.name} {c.status === 'archived' ? <span className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 ml-1">Archivada</span> : null}</p><p className="text-xs text-gray-500">{c.ownerClubName}{c.districtNumber ? ` · D${c.districtNumber}` : ''}{c.projectRef ? ` · ${c.projectRef}` : ''} · {c.courseCount} curso(s) · {c.publishedCount} publicado(s) · {c.inReviewCount} en revisión · {cat?.accessModes?.[c.accessMode]?.label}</p></div>
                            <div className="flex gap-2"><a href={`/cursos/colecciones/${c.slug}`} target="_blank" rel="noreferrer" className={btnSecundario}><ExternalLink className="w-4 h-4" /> Pública</a><button type="button" onClick={() => abrir(c)} className={btnPrimario}>Abrir</button></div>
                        </li>
                    ))}
                </ul>
            )}
            {abierta ? (
                <Dialogo title={abierta.collection.name} onClose={() => setAbierta(null)} wide footer={<>{abierta.collection.status === 'archived' ? <button type="button" className={btnSecundario} onClick={() => estado(abierta.collection, 'active')}><RotateCcw className="w-4 h-4" /> Restaurar</button> : <button type="button" className={btnPeligro} onClick={() => { if (window.confirm('¿Archivar la colección? Sus cursos conservan su estado, pero la colección deja de listarse.')) estado(abierta.collection, 'archived'); }}><Archive className="w-4 h-4" /> Archivar colección</button>}</>}>
                    <p className="text-sm text-gray-600">{abierta.collection.description || 'Sin descripción.'}</p>
                    <p className="text-xs text-gray-500 mt-2">{abierta.collection.ownerClubName} · Proyecto {abierta.collection.projectRef || '—'} · Acceso deseado: {cat?.accessModes?.[abierta.collection.accessMode]?.label}</p>
                    <ul className="mt-4 divide-y divide-gray-100">
                        {abierta.courses.map(k => <li key={k.id} className="py-2 flex items-center gap-3"><span className="text-xs text-gray-400 w-6">{k.sortOrder}</span><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-800 truncate">{k.title || 'Sin título'}</p><p className="text-[11px] text-gray-500">{k.lessonCount} lección(es) · {k.readiness.done}/{k.readiness.total} requisitos</p></div><StatusChip id={k.displayStatus} catalogs={cat} /><button type="button" onClick={() => { setAbierta(null); onOpen(k.id); }} className={btnSecundario}>Revisar</button></li>)}
                        {!abierta.courses.length ? <li className="py-4 text-sm text-gray-400">Sin cursos.</li> : null}
                    </ul>
                </Dialogo>
            ) : null}
        </div>
    );
};

const Configuracion = ({ initial, cat, onSaved }: { initial: any; cat: Catalogs | null; onSaved: () => void }) => {
    const [cfg, setCfg] = useState<any>(initial);
    const [saving, setSaving] = useState(false);
    const guardar = async () => { setSaving(true); try { await adminApi('/config', { method: 'PUT', body: { config: cfg } }); toast.success('Configuración guardada.'); onSaved(); } catch (e: any) { toast.error(e?.message); } finally { setSaving(false); } };
    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 space-y-4 max-w-3xl">
            <h2 className="text-sm font-black text-gray-800 flex items-center gap-2"><Settings className="w-4 h-4" /> Configuración del módulo</h2>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled !== false} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} /> Módulo activo (los clubes pueden crear cursos)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.autoPublishOnApprove === true} onChange={e => setCfg({ ...cfg, autoPublishOnApprove: e.target.checked })} /> Publicar automáticamente al aprobar <span className="text-xs text-gray-400">(por omisión aprobar y publicar son dos decisiones)</span></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.allowExternalVideo !== false} onChange={e => setCfg({ ...cfg, allowExternalVideo: e.target.checked })} /> Admitir videos externos (YouTube / Vimeo) en las lecciones</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.requireRights !== false} onChange={e => setCfg({ ...cfg, requireRights: e.target.checked })} /> Exigir la declaración de derechos y autorizaciones antes de enviar</label>
            <Campo label="Texto de la declaración de derechos"><textarea className={campo} rows={4} value={cfg.rightsText || ''} onChange={e => setCfg({ ...cfg, rightsText: e.target.value })} /></Campo>
            <div className="grid sm:grid-cols-2 gap-4">
                <Campo label="Máximo de cursos por colección" hint="0 = sin tope."><input type="number" min={0} className={campo} value={cfg.maxCoursesPerCollection ?? 0} onChange={e => setCfg({ ...cfg, maxCoursesPerCollection: Number(e.target.value) || 0 })} /></Campo>
                <Campo label="Correos del comité para avisos" hint="Separados por coma. Además se avisa a los administradores del sitio distrital."><input className={campo} value={(cfg.notifyEmails || []).join(', ')} onChange={e => setCfg({ ...cfg, notifyEmails: e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) })} /></Campo>
            </div>
            <Campo label="Categorías sugeridas (etiquetas)" hint="Separadas por coma."><input className={campo} value={(cfg.categories || []).join(', ')} onChange={e => setCfg({ ...cfg, categories: e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) })} /></Campo>
            <Campo label="Introducción de la biblioteca pública"><textarea className={campo} rows={2} value={cfg.libraryIntro || ''} onChange={e => setCfg({ ...cfg, libraryIntro: e.target.value })} /></Campo>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500">
                Topes de archivo (por entorno): imagen {fmtBytes(cat?.limits.image || 0)} · video {fmtBytes(cat?.limits.video || 0)} · documento {fmtBytes(cat?.limits.document || 0)} · recurso {fmtBytes(cat?.limits.resource || 0)} · {cat?.limits.filesPerCourse} archivos por curso. Carga multiparte reanudable desde {fmtBytes(cat?.limits.multipartThreshold || 0)}.
            </div>
            <button type="button" onClick={guardar} disabled={saving} className={btnPrimario}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Guardar configuración</button>
        </div>
    );
};

const FichaCurso = ({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) => {
    const [v, setV] = useState<AdminCourseView | null>(null);
    const [nota, setNota] = useState('');
    const [comentario, setComentario] = useState('');
    const [pendiente, setPendiente] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [media, setMedia] = useState<{ id: string; url: string } | null>(null);
    const cargar = useCallback(async () => { try { setV(await adminApi<AdminCourseView>(`/cursos/${id}`)); } catch (e: any) { toast.error(e?.message); onClose(); } }, [id, onClose]);
    useEffect(() => { cargar(); }, [cargar]);
    const cat = v?.catalogs || null;
    const filesById = useMemo(() => Object.fromEntries((v?.files || []).map(f => [f.id, f])), [v?.files]);

    const transicion = async (to: string) => {
        if (!v) return;
        const spec = TRANSITION_LABEL[to];
        if (spec?.needsNote && !nota.trim()) { setPendiente(to); return; }
        if (spec?.confirm && !window.confirm(spec.confirm)) return;
        setBusy(true);
        try { await adminApi(`/cursos/${v.course.id}/estado`, { method: 'POST', body: { to, note: nota } }); toast.success(`Curso: ${cat?.states?.[to]?.label || to}.`); setNota(''); setPendiente(null); await cargar(); onChanged(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cambiar el estado.'); }
        finally { setBusy(false); }
    };
    const comentar = async (internal: boolean) => {
        if (!v || !comentario.trim()) return;
        try { await adminApi(`/cursos/${v.course.id}/comentarios`, { method: 'POST', body: { text: comentario, internal } }); setComentario(''); await cargar(); } catch (e: any) { toast.error(e?.message); }
    };
    const verArchivo = async (f: LFile) => {
        if (!v) return;
        try { const r = await adminApi<{ url: string }>(`/cursos/${v.course.id}/archivos/${f.id}/url`); if (f.kind === 'video' || f.kind === 'audio') setMedia({ id: f.id, url: r.url }); else window.open(r.url, '_blank', 'noopener'); } catch (e: any) { toast.error(e?.message); }
    };

    if (!v) return <Dialogo title="Curso" onClose={onClose} wide><Cargando /></Dialogo>;
    const k = v.course;
    return (
        <Dialogo title={<span className="flex items-center gap-2">{k.title || 'Sin título'} <StatusChip id={k.status} catalogs={cat} /></span>} onClose={onClose} wide
            footer={<>
                {v.transitions.map(t => { const s = TRANSITION_LABEL[t]; return s ? <button key={t} type="button" disabled={busy} onClick={() => transicion(t)} className={s.tone}>{s.icon} {s.label}</button> : null; })}
                {k.status === 'published' ? <a href={`/cursos/${k.slug}${k.accessMode === 'private' && k.inviteToken ? `?invite=${k.inviteToken}` : ''}`} target="_blank" rel="noreferrer" className={btnSecundario}><ExternalLink className="w-4 h-4" /> Ver publicado</a> : null}
            </>}>
            <div className="grid lg:grid-cols-[1fr_300px] gap-5">
                <div className="space-y-4">
                    {media ? <div className="rounded-2xl overflow-hidden bg-black">{filesById[media.id]?.kind === 'audio' ? <audio src={media.url} controls className="w-full" /> : <video src={media.url} controls className="w-full aspect-video" />}</div> : k.coverUrl ? <img src={k.coverUrl} alt="" className="w-full aspect-[16/9] object-cover rounded-2xl" /> : null}
                    <div className="text-sm text-gray-700 space-y-2">
                        {k.subtitle ? <p className="text-gray-500">{k.subtitle}</p> : null}
                        <p><strong>Club:</strong> {k.ownerClubName || '—'}{v.collection ? <> · <strong>Colección:</strong> {v.collection.name}</> : ' · curso individual'}{k.projectRef ? <> · <strong>Proyecto:</strong> {k.projectRef}</> : null}</p>
                        <p><strong>Acceso:</strong> {cat?.accessModes?.[k.accessMode]?.label} · <strong>Nivel:</strong> {cat?.levels?.[k.level || ''] || '—'} · <strong>Idioma:</strong> {cat?.languages?.[k.language] || k.language} · <strong>Duración:</strong> {fmtMinutes(v.durationMinutes) || '—'}</p>
                        {k.instructorName ? <p><strong>Instructor:</strong> {k.instructorName}{k.organization ? ` (${k.organization})` : ''}</p> : null}
                        <p><strong>Descripción breve:</strong> {k.shortDescription || '—'}</p>
                        {k.fullDescription ? <details><summary className="cursor-pointer text-xs font-semibold text-gray-500">Descripción completa</summary><p className="whitespace-pre-wrap mt-1">{k.fullDescription}</p></details> : null}
                        {k.learningObjective ? <p><strong>Objetivo:</strong> {k.learningObjective}</p> : null}
                        <p className="text-xs text-gray-500">Derechos: {k.rightsAccepted ? `declarados el ${fmtDate((k as any).rightsAt)}` : 'NO declarados'} · Funciones pedidas: {Object.entries(k.features || {}).filter(([, on]) => on).map(([f]) => cat?.features?.[f]?.label || f).join(', ') || 'ninguna'}</p>
                        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs"><strong>Requisitos:</strong> {v.readiness.done}/{v.readiness.total}{v.readiness.missing?.length ? ` · falta: ${v.readiness.missing.map((m: any) => m.label).join('; ')}` : ' · completos'}{v.readiness.warnings?.length ? <ul className="list-disc pl-5 mt-1 text-gray-500">{v.readiness.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul> : null}</div>
                    </div>
                    <section>
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500 flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> Contenido</h3>
                        <div className="mt-2 space-y-3">
                            {[...v.modules.map(m => ({ id: m.id, title: m.title, lessons: v.lessons.filter(l => l.moduleId === m.id) })), ...(v.lessons.some(l => !l.moduleId) ? [{ id: 'loose', title: v.modules.length ? 'Sin módulo' : 'Lecciones', lessons: v.lessons.filter(l => !l.moduleId) }] : [])].map(m => (
                                <div key={m.id} className="rounded-xl border border-gray-100">
                                    <p className="px-3 py-2 text-xs font-bold text-gray-700 bg-gray-50 rounded-t-xl">{m.title}</p>
                                    <ul className="divide-y divide-gray-100">{m.lessons.map(l => {
                                        const vf = l.videoFileId ? filesById[l.videoFileId] : null; const af = l.audioFileId ? filesById[l.audioFileId] : null; const rs = v.resources.filter(r => r.lessonId === l.id);
                                        return <li key={l.id} className="px-3 py-2 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-800">{l.title}</span><span className="text-xs text-gray-400">{l.durationMinutes ? `${l.durationMinutes} min` : ''}</span></div>
                                            <div className="flex flex-wrap gap-2 mt-1 text-xs">
                                                {vf ? <button type="button" onClick={() => verArchivo(vf)} className="inline-flex items-center gap-1 text-rotary-blue font-semibold"><Play className="w-3.5 h-3.5" /> {vf.filename} ({fmtBytes(vf.bytes)})</button> : null}
                                                {l.videoUrl ? <a href={l.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-rotary-blue font-semibold"><ExternalLink className="w-3.5 h-3.5" /> video externo</a> : null}
                                                {af ? <button type="button" onClick={() => verArchivo(af)} className="inline-flex items-center gap-1 text-rotary-blue font-semibold"><Play className="w-3.5 h-3.5" /> {af.filename}</button> : null}
                                                {l.body ? <span className="text-gray-500">texto ({l.body.length} caracteres)</span> : null}
                                                {rs.map(r => <span key={r.id} className="inline-flex items-center gap-1 text-gray-600">{r.fileId && filesById[r.fileId] ? <button type="button" onClick={() => verArchivo(filesById[r.fileId!])} className="inline-flex items-center gap-1 text-rotary-blue"><KindIcon kind={filesById[r.fileId].kind} className="w-3.5 h-3.5" />{r.title}</button> : <a href={r.url || '#'} target="_blank" rel="noreferrer" className="text-rotary-blue inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />{r.title}</a>}</span>)}
                                                {!vf && !af && !l.videoUrl && !l.body && !rs.length ? <span className="text-amber-700">sin contenido</span> : null}
                                            </div></li>;
                                    })}</ul>
                                </div>
                            ))}
                            {!v.lessons.length ? <p className="text-sm text-gray-400">Sin lecciones.</p> : null}
                        </div>
                    </section>
                    {v.resources.filter(r => !r.lessonId).length ? <section><h3 className="text-xs font-black uppercase tracking-wide text-gray-500 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Recursos del curso</h3><ul className="mt-2 space-y-1 text-sm">{v.resources.filter(r => !r.lessonId).map(r => <li key={r.id}>{r.fileId && filesById[r.fileId] ? <button type="button" onClick={() => verArchivo(filesById[r.fileId!])} className="text-rotary-blue inline-flex items-center gap-1"><KindIcon kind={filesById[r.fileId].kind} className="w-3.5 h-3.5" />{r.title} ({fmtBytes(filesById[r.fileId].bytes)})</button> : <a href={r.url || '#'} target="_blank" rel="noreferrer" className="text-rotary-blue inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />{r.title}</a>}</li>)}</ul></section> : null}
                </div>
                <aside className="space-y-4">
                    <div className="rounded-2xl border border-gray-100 p-4">
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500">Decisión</h3>
                        <Campo label="Motivo u observaciones" hint="Obligatorio para pedir correcciones; el club lo lee en su ficha y lo recibe por correo." className="mt-2"><textarea className={campo} rows={4} value={nota} onChange={e => setNota(e.target.value)} /></Campo>
                        {pendiente ? <p className="text-xs text-rose-600 mt-1">Escribe el motivo para «{TRANSITION_LABEL[pendiente]?.label}».</p> : null}
                        {k.reviewNote ? <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mt-3">Última observación: {k.reviewNote}</p> : null}
                        <div className="text-[11px] text-gray-400 mt-3 space-y-0.5">{k.submittedAt ? <p>Enviado: {fmtDate(k.submittedAt)}</p> : null}{k.publishedAt ? <p>Publicado: {fmtDate(k.publishedAt)}</p> : null}<p>Vistas: {k.viewCount}</p></div>
                    </div>
                    <div className="rounded-2xl border border-gray-100 p-4">
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500 flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Observación sin cambiar el estado</h3>
                        <textarea className={`${campo} mt-2`} rows={2} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Nota para el club o interna del comité" />
                        <div className="flex gap-2 mt-2"><button type="button" onClick={() => comentar(false)} className={btnSecundario} disabled={!comentario.trim()}>Enviar al club</button><button type="button" onClick={() => comentar(true)} className={btnSecundario} disabled={!comentario.trim()}><EyeOff className="w-4 h-4" /> Interna</button></div>
                    </div>
                    <div className="rounded-2xl border border-gray-100 p-4">
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Historial</h3>
                        <ul className="mt-2 space-y-1.5 text-xs text-gray-600 max-h-72 overflow-y-auto">{v.events.map(ev => <li key={ev.id}><span className="text-gray-400">{fmtDate(ev.createdAt)}</span> · {ev.actorName || 'Sistema'}: {ev.action.startsWith('status:') ? (cat?.states?.[ev.action.slice(7)]?.label || ev.action) : ev.action === 'comment' ? ev.detail?.text : ev.action.replace(/[:_]/g, ' ')}{ev.detail?.note ? ` — ${ev.detail.note}` : ''}{ev.visibility === 'internal' ? <span className="ml-1 text-[10px] rounded bg-gray-100 px-1">interno</span> : null}</li>)}</ul>
                    </div>
                    <div className="rounded-2xl border border-gray-100 p-4">
                        <h3 className="text-xs font-black uppercase tracking-wide text-gray-500 flex items-center gap-1"><Inbox className="w-3.5 h-3.5" /> Archivos ({v.files.length})</h3>
                        <ul className="mt-2 space-y-1 text-xs">{v.files.map(f => <li key={f.id} className="flex items-center gap-2"><KindIcon kind={f.kind} className="w-3.5 h-3.5 text-gray-400" /><button type="button" onClick={() => verArchivo(f)} className="truncate text-rotary-blue text-left flex-1">{f.filename}</button><span className="text-gray-400 shrink-0">{fmtBytes(f.bytes)}{f.status !== 'ready' ? ' · en carga' : ''}</span></li>)}</ul>
                    </div>
                </aside>
            </div>
        </Dialogo>
    );
};

export default GestionEducativaAdmin;
