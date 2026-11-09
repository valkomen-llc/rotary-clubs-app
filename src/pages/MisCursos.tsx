/**
 * Mis cursos y capacitaciones — el espacio del club (v4.1302.0)
 *
 *   /mis-cursos                      Vista 1: mis colecciones (tarjetas) y cursos sueltos
 *   /mis-cursos/colecciones/:id      Vista 2: el contenido de una colección
 *   /mis-cursos/cursos/:id           Vista 3: el editor de un curso (CourseEditor)
 *
 * Exige la sesión del panel (cuenta de club o distrito). El servidor decide
 * el alcance; aquí sólo se pinta lo que devuelve.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowDown, ArrowUp, BookOpen, Copy, FolderPlus, GraduationCap, Link2, Loader2, LogIn, Plus, RefreshCw, Archive, RotateCcw, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { PublicPageHeader } from '../components/common/PublicInstitutionalComponents';
import { useAuth } from '../hooks/useAuth';
import { useSEO } from '../hooks/useSEO';
import { misApi, uploadCollectionCover, Autosaver, fmtMinutes, fmtDate, type Catalogs, type Collection, type CourseSummary, type SaveState, LearningError } from '../lib/learningClient';
import { TARJETA, campo, btnPrimario, btnSecundario, Campo, StatusChip, SaveIndicator, Cargando, Vacio, Dialogo, Progreso } from '../components/learning/learningUi';
import CourseEditor from '../components/learning/CourseEditor';

const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-rotary-concrete flex flex-col font-sans text-gray-800">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
    </div>
);

const SinSesion = () => {
    const loc = useLocation();
    return (
        <Shell>
            <PublicPageHeader title="Mis cursos y capacitaciones" subtitle="Crea colecciones de cursos de tu club, organiza módulos y lecciones, sube videos y documentos, y envíalos a revisión para publicarlos en la biblioteca del Distrito." />
            <div className="max-w-xl mx-auto px-4 py-14">
                <div className={`${TARJETA} text-center`}>
                    <GraduationCap className="w-10 h-10 mx-auto text-rotary-blue" />
                    <h2 className="text-lg font-black text-gray-800 mt-3">Inicia sesión con la cuenta de tu club</h2>
                    <p className="text-sm text-gray-500 mt-2">El gestor de cursos usa la misma cuenta del panel administrativo de tu club o distrito. Tu avance se guarda automáticamente y lo encuentras al volver.</p>
                    <Link to={`/login?redirect=${encodeURIComponent(loc.pathname)}`} className={`${btnPrimario} mt-5`}><LogIn className="w-4 h-4" /> Iniciar sesión</Link>
                    <p className="text-xs text-gray-400 mt-4">¿Quieres compartir una capacitación presencial o una jornada? Hazlo desde <Link to="/rotary-en-accion" className="text-rotary-blue underline">Rotary en Acción</Link>.</p>
                </div>
            </div>
        </Shell>
    );
};

// ─── Vista 1: Mis colecciones ─────────────────────────────────────────
interface Overview { site: { id: string; name: string; type: string; district: string | null } | null; collections: Collection[]; standalone: CourseSummary[]; config: any; catalogs: Catalogs }

const TarjetaColeccion = ({ c }: { c: Collection }) => (
    <li className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <Link to={`/mis-cursos/colecciones/${c.id}`} className="block">
            {c.coverUrl ? <img src={c.coverUrl} alt="" className="w-full aspect-[16/9] object-cover" loading="lazy" /> : <div className="w-full aspect-[16/9] bg-gradient-to-br from-rotary-blue/90 to-sky-700 flex items-center justify-center"><BookOpen className="w-10 h-10 text-white/80" /></div>}
        </Link>
        <div className="p-5 flex flex-col flex-1">
            <div className="flex items-start justify-between gap-2">
                <h3 className="font-black text-gray-800 leading-snug"><Link to={`/mis-cursos/colecciones/${c.id}`}>{c.name}</Link></h3>
                {c.status === 'archived' ? <span className="text-[11px] rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 font-semibold">Archivada</span> : null}
            </div>
            {c.projectRef ? <p className="text-[11px] text-rotary-blue font-semibold mt-1">Proyecto {c.projectRef}</p> : null}
            <p className="text-xs text-gray-500 mt-2 line-clamp-2 flex-1">{c.description || 'Sin descripción todavía.'}</p>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-gray-50 py-2"><dt className="text-[10px] uppercase tracking-wide text-gray-400">Cursos</dt><dd className="text-base font-black text-gray-800">{c.courseCount ?? 0}</dd></div>
                <div className="rounded-xl bg-gray-50 py-2"><dt className="text-[10px] uppercase tracking-wide text-gray-400">Publicados</dt><dd className="text-base font-black text-emerald-700">{c.publishedCount ?? 0}</dd></div>
                <div className="rounded-xl bg-gray-50 py-2"><dt className="text-[10px] uppercase tracking-wide text-gray-400">En revisión</dt><dd className="text-base font-black text-blue-700">{c.inReviewCount ?? 0}</dd></div>
            </dl>
            <Link to={`/mis-cursos/colecciones/${c.id}`} className={`${btnSecundario} mt-4 justify-center`}>Abrir colección</Link>
        </div>
    </li>
);

const FilaCurso = ({ k, catalogs, onUp, onDown, onDuplicate, onArchive, first, last }: { k: CourseSummary; catalogs: Catalogs | null; onUp?: () => void; onDown?: () => void; onDuplicate?: () => void; onArchive?: () => void; first?: boolean; last?: boolean }) => (
    <li className="rounded-2xl border border-gray-100 bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="course-row" data-status={k.displayStatus}>
        <div className="w-full sm:w-28 aspect-[16/9] sm:aspect-auto sm:h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
            {k.coverUrl ? <img src={k.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><BookOpen className="w-6 h-6" /></div>}
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
                <Link to={`/mis-cursos/cursos/${k.id}`} className="font-bold text-gray-800 hover:text-rotary-blue">{k.title || 'Curso sin título'}</Link>
                <StatusChip id={k.displayStatus} catalogs={catalogs} />
            </div>
            <p className="text-xs text-gray-500 mt-1">
                {k.lessonCount} lección(es){k.moduleCount ? ` · ${k.moduleCount} módulo(s)` : ''}{k.durationMinutes ? ` · ${fmtMinutes(k.durationMinutes)}` : ''}{k.uploadingCount ? ` · ${k.uploadingCount} archivo(s) en carga` : ''} · {catalogs?.accessModes?.[k.accessMode]?.label || k.accessMode}
            </p>
            {k.status === 'draft' || k.status === 'changes_requested' ? <div className="mt-2 max-w-md"><Progreso done={k.readiness.done} total={k.readiness.total} /></div> : null}
            {k.reviewNote && k.status === 'changes_requested' ? <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-2">Comité: {k.reviewNote}</p> : null}
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
            {onUp ? <button type="button" onClick={onUp} disabled={first} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30" aria-label="Subir"><ArrowUp className="w-4 h-4" /></button> : null}
            {onDown ? <button type="button" onClick={onDown} disabled={last} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30" aria-label="Bajar"><ArrowDown className="w-4 h-4" /></button> : null}
            {onDuplicate ? <button type="button" onClick={onDuplicate} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50" aria-label="Duplicar estructura" title="Duplicar estructura"><Copy className="w-4 h-4" /></button> : null}
            {onArchive && (k.status === 'draft' || k.status === 'changes_requested') ? <button type="button" onClick={onArchive} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50" aria-label="Archivar" title="Archivar"><Archive className="w-4 h-4" /></button> : null}
            <Link to={`/mis-cursos/cursos/${k.id}`} className={btnSecundario}>{k.status === 'draft' || k.status === 'changes_requested' ? 'Continuar' : 'Ver'}</Link>
        </div>
    </li>
);

const VistaColecciones = () => {
    const [data, setData] = useState<Overview | null>(null);
    const [error, setError] = useState('');
    const [nueva, setNueva] = useState(false);
    const [nuevoSuelto, setNuevoSuelto] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', projectRef: '', accessMode: 'public', audience: [] as string[], areaFocus: '' });
    const [titulo, setTitulo] = useState('');
    const [guardando, setGuardando] = useState(false);
    const navigate = useNavigate();
    useSEO({ title: 'Mis cursos y capacitaciones', description: 'Gestor de cursos del club.', path: '/mis-cursos', noindex: true });

    const cargar = useCallback(async () => {
        try { setError(''); setData(await misApi<Overview>('/resumen')); }
        catch (e: any) { setError(e?.message || 'No se pudo cargar.'); }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);

    const crear = async () => {
        if (!form.name.trim()) { toast.error('Escribe el nombre de la colección.'); return; }
        setGuardando(true);
        try {
            const r = await misApi<{ collection: Collection }>('/colecciones', { method: 'POST', body: { ...form, areaFocus: form.areaFocus || null } });
            toast.success('Colección creada. Ahora agrega el primer curso.');
            navigate(`/mis-cursos/colecciones/${r.collection.id}`);
        } catch (e: any) { toast.error(e?.message || 'No se pudo crear.'); }
        finally { setGuardando(false); }
    };
    const crearSuelto = async () => {
        setGuardando(true);
        try {
            const r = await misApi<{ course: { id: string } }>('/cursos', { method: 'POST', body: { title: titulo } });
            navigate(`/mis-cursos/cursos/${r.course.id}`);
        } catch (e: any) { toast.error(e?.message || 'No se pudo crear.'); }
        finally { setGuardando(false); }
    };

    const cat = data?.catalogs || null;
    const activas = (data?.collections || []).filter(c => c.status !== 'archived');
    const archivadas = (data?.collections || []).filter(c => c.status === 'archived');

    return (
        <Shell>
            <PublicPageHeader title="Mis cursos y capacitaciones" subtitle={data?.site ? `${data.site.name}: crea colecciones de cursos vinculadas a tus proyectos, súbelas poco a poco y envíalas a revisión cuando estén listas.` : 'Cursos y materiales educativos de tu club para la comunidad.'} />
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                    <Link to="/rotary-en-accion" className="inline-flex items-center gap-2 text-sm font-medium text-rotary-blue hover:underline"><ArrowLeft className="w-4 h-4" /> Rotary en Acción</Link>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={cargar} className={btnSecundario}><RefreshCw className="w-4 h-4" /> Actualizar</button>
                        <button type="button" onClick={() => setNuevoSuelto(true)} className={btnSecundario} disabled={data?.config?.enabled === false}><Plus className="w-4 h-4" /> Crear curso individual</button>
                        <button type="button" onClick={() => setNueva(true)} className={btnPrimario} disabled={data?.config?.enabled === false}><FolderPlus className="w-4 h-4" /> Crear colección de cursos</button>
                    </div>
                </div>
                {data?.config?.enabled === false ? <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 mb-6">El Distrito tiene desactivada temporalmente la creación de cursos.</p> : null}
                {error ? <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</p> : null}
                {!data && !error ? <Cargando /> : null}
                {data ? (
                    <>
                        <section aria-labelledby="colecciones">
                            <h2 id="colecciones" className="text-lg font-black text-gray-800 mb-3">Mis colecciones</h2>
                            {activas.length ? <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{activas.map(c => <TarjetaColeccion key={c.id} c={c} />)}</ul> : (
                                <div className={TARJETA}><Vacio texto="Todavía no tienes colecciones. Una colección agrupa los cursos de un proyecto o programa, por ejemplo «Programa de seguridad alimentaria — GG2349313».">
                                    <button type="button" onClick={() => setNueva(true)} className={btnPrimario}><FolderPlus className="w-4 h-4" /> Crear mi primera colección</button>
                                </Vacio></div>
                            )}
                        </section>
                        {data.standalone.length ? (
                            <section className="mt-10" aria-labelledby="sueltos">
                                <h2 id="sueltos" className="text-lg font-black text-gray-800 mb-3">Cursos individuales</h2>
                                <ul className="space-y-3">{data.standalone.map(k => <FilaCurso key={k.id} k={k} catalogs={cat} />)}</ul>
                            </section>
                        ) : null}
                        {archivadas.length ? (
                            <section className="mt-10" aria-labelledby="archivadas">
                                <h2 id="archivadas" className="text-sm font-bold text-gray-500 mb-3">Colecciones archivadas</h2>
                                <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 opacity-75">{archivadas.map(c => <TarjetaColeccion key={c.id} c={c} />)}</ul>
                            </section>
                        ) : null}
                    </>
                ) : null}
            </div>
            {nueva ? (
                <Dialogo title="Nueva colección de cursos" onClose={() => setNueva(false)} footer={<><button type="button" className={btnSecundario} onClick={() => setNueva(false)}>Cancelar</button><button type="button" className={btnPrimario} onClick={crear} disabled={guardando}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />} Guardar colección</button></>}>
                    <div className="space-y-4">
                        <Campo label="Nombre de la colección *"><input className={campo} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Programa de formación en seguridad alimentaria" maxLength={160} /></Campo>
                        <Campo label="Descripción general" hint="Explica el propósito educativo de la colección."><textarea className={campo} rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Campo>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <Campo label="Proyecto relacionado" hint="Código o referencia, por ejemplo GG2349313."><input className={campo} value={form.projectRef} onChange={e => setForm({ ...form, projectRef: e.target.value })} maxLength={80} /></Campo>
                            <Campo label="Área de interés de Rotary"><select className={campo} value={form.areaFocus} onChange={e => setForm({ ...form, areaFocus: e.target.value })}><option value="">Sin definir</option>{Object.entries(cat?.areas || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                        </div>
                        <Campo label="Modalidad de acceso deseada" hint="La definitiva la confirma el comité al publicar cada curso.">
                            <select className={campo} value={form.accessMode} onChange={e => setForm({ ...form, accessMode: e.target.value })}>{Object.entries(cat?.accessModes || {}).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                        </Campo>
                        <fieldset><legend className={rotuloLegend}>Público objetivo</legend>
                            <div className="flex flex-wrap gap-2">{Object.entries(cat?.audiences || {}).map(([k, v]) => (
                                <label key={k} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${form.audience.includes(k) ? 'border-rotary-blue bg-blue-50 text-rotary-blue' : 'border-gray-200 text-gray-600'}`}>
                                    <input type="checkbox" className="sr-only" checked={form.audience.includes(k)} onChange={() => setForm({ ...form, audience: form.audience.includes(k) ? form.audience.filter(x => x !== k) : [...form.audience, k] })} />{v}
                                </label>))}</div>
                        </fieldset>
                        {data?.site ? <p className="text-xs text-gray-500">Club responsable: <strong>{data.site.name}</strong>{data.site.district ? ` · Distrito ${data.site.district}` : ''}.</p> : null}
                    </div>
                </Dialogo>
            ) : null}
            {nuevoSuelto ? (
                <Dialogo title="Nuevo curso individual" onClose={() => setNuevoSuelto(false)} footer={<><button type="button" className={btnSecundario} onClick={() => setNuevoSuelto(false)}>Cancelar</button><button type="button" className={btnPrimario} onClick={crearSuelto} disabled={guardando}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear y abrir el editor</button></>}>
                    <Campo label="Título del curso" hint="Podrás cambiarlo después. Un curso individual no pertenece a ninguna colección."><input className={campo} value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={160} /></Campo>
                </Dialogo>
            ) : null}
        </Shell>
    );
};
const rotuloLegend = 'block text-xs font-semibold text-gray-600 mb-2';

// ─── Vista 2: una colección ───────────────────────────────────────────
interface CollectionView { collection: Collection; courses: CourseSummary[]; events: any[]; config: { maxCoursesPerCollection: number }; catalogs: Catalogs }

const VistaColeccion = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<CollectionView | null>(null);
    const [error, setError] = useState('');
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const saver = useRef<Autosaver | null>(null);
    const [subiendo, setSubiendo] = useState(0);
    const [creando, setCreando] = useState(false);
    const [tituloNuevo, setTituloNuevo] = useState('');
    const [dialogoCurso, setDialogoCurso] = useState(false);
    useSEO({ title: data?.collection?.name || 'Colección', description: 'Colección de cursos.', path: `/mis-cursos/colecciones/${id}`, noindex: true });

    useEffect(() => { const a = new Autosaver(); a.onChange = setSaveState; saver.current = a; return () => a.destroy(); }, []);
    useEffect(() => {
        const h = (e: BeforeUnloadEvent) => { if (saver.current?.hasPending) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
    }, []);

    const cargar = useCallback(async () => {
        try { setError(''); setData(await misApi<CollectionView>(`/colecciones/${id}`)); }
        catch (e: any) { setError(e?.message || 'No se pudo cargar.'); }
    }, [id]);
    useEffect(() => { cargar(); }, [cargar]);

    const c = data?.collection;
    const cat = data?.catalogs || null;
    const archivada = c?.status === 'archived';

    const patch = (values: Partial<Collection>) => {
        if (!c) return;
        setData(d => d ? { ...d, collection: { ...d.collection, ...values } as Collection } : d);
        saver.current?.queue(`col:${c.id}`, values, (p) => misApi(`/colecciones/${c.id}`, { method: 'PATCH', body: p }));
    };

    const crearCurso = async () => {
        if (!c) return;
        setCreando(true);
        try {
            await saver.current?.flush();
            const r = await misApi<{ course: { id: string } }>('/cursos', { method: 'POST', body: { collectionId: c.id, title: tituloNuevo } });
            navigate(`/mis-cursos/cursos/${r.course.id}`);
        } catch (e: any) { toast.error(e?.message || 'No se pudo crear el curso.'); }
        finally { setCreando(false); }
    };
    const mover = async (idx: number, dir: -1 | 1) => {
        if (!data || !c) return;
        const list = [...data.courses];
        const j = idx + dir; if (j < 0 || j >= list.length) return;
        [list[idx], list[j]] = [list[j], list[idx]];
        setData({ ...data, courses: list });
        try { await misApi(`/colecciones/${c.id}/orden`, { method: 'POST', body: { ids: list.map(k => k.id) } }); }
        catch (e: any) { toast.error(e?.message || 'No se pudo reordenar.'); cargar(); }
    };
    const duplicar = async (k: CourseSummary) => {
        try { await misApi(`/cursos/${k.id}/duplicar`, { method: 'POST' }); toast.success('Estructura duplicada como borrador.'); cargar(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo duplicar.'); }
    };
    const archivarCurso = async (k: CourseSummary) => {
        if (!window.confirm(`¿Archivar «${k.title || 'Curso sin título'}»? Podrás restaurarlo después.`)) return;
        try { await misApi(`/cursos/${k.id}/estado`, { method: 'POST', body: { to: 'archived' } }); cargar(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo archivar.'); }
    };
    const estadoColeccion = async (status: 'archived' | 'active') => {
        if (!c) return;
        if (status === 'archived' && !window.confirm('¿Archivar la colección? Sus cursos publicados dejan de listarse en la colección pública hasta restaurarla.')) return;
        try { const r = await misApi<{ collection: Collection }>(`/colecciones/${c.id}/estado`, { method: 'POST', body: { status } }); setData(d => d ? { ...d, collection: r.collection } : d); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cambiar.'); }
    };
    const subirPortada = async (file: File | undefined) => {
        if (!file || !c) return;
        setSubiendo(1);
        try { const url = await uploadCollectionCover(c.id, file, setSubiendo); setData(d => d ? { ...d, collection: { ...d.collection, coverUrl: url } } : d); toast.success('Portada guardada.'); }
        catch (e: any) { toast.error(e?.message || 'No se pudo subir la portada.'); }
        finally { setSubiendo(0); }
    };
    const copiarInvitacion = async () => {
        if (!c?.inviteToken) return;
        const url = `${window.location.origin}/cursos/colecciones/${c.slug}?invite=${c.inviteToken}`;
        try { await navigator.clipboard.writeText(url); toast.success('Enlace de invitación copiado.'); } catch { window.prompt('Copia el enlace:', url); }
    };

    const maxReached = Boolean(data && data.config.maxCoursesPerCollection > 0 && data.courses.filter(k => k.status !== 'archived').length >= data.config.maxCoursesPerCollection);
    const visibles = useMemo(() => (data?.courses || []).filter(k => k.status !== 'archived'), [data]);
    const archivados = useMemo(() => (data?.courses || []).filter(k => k.status === 'archived'), [data]);

    return (
        <Shell>
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <Link to="/mis-cursos" className="inline-flex items-center gap-2 text-sm font-medium text-rotary-blue hover:underline"><ArrowLeft className="w-4 h-4" /> Mis colecciones</Link>
                    <SaveIndicator state={saveState} lastSavedAt={saver.current?.lastSavedAt} error={saver.current?.lastError} />
                </div>
                {error ? <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</p> : null}
                {!data && !error ? <Cargando /> : null}
                {data && c ? (
                    <div className="grid lg:grid-cols-[320px_1fr] gap-6">
                        <aside className="space-y-4">
                            <div className={TARJETA}>
                                <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[16/9] mb-4">
                                    {c.coverUrl ? <img src={c.coverUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon className="w-8 h-8" /></div>}
                                    {subiendo ? <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs font-semibold text-gray-700">Subiendo portada… {subiendo}%</div> : null}
                                </div>
                                <label className={`${btnSecundario} w-full justify-center cursor-pointer ${archivada ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <ImageIcon className="w-4 h-4" /> {c.coverUrl ? 'Cambiar portada' : 'Subir portada'}
                                    <input type="file" className="sr-only" accept=".jpg,.jpeg,.png,.webp" onChange={e => subirPortada(e.target.files?.[0])} disabled={archivada} />
                                </label>
                                <div className="mt-4 space-y-3">
                                    <Campo label="Nombre de la colección"><input className={campo} value={c.name} onChange={e => patch({ name: e.target.value })} disabled={archivada} maxLength={160} /></Campo>
                                    <Campo label="Descripción general"><textarea className={campo} rows={4} value={c.description || ''} onChange={e => patch({ description: e.target.value })} disabled={archivada} /></Campo>
                                    <Campo label="Proyecto relacionado"><input className={campo} value={c.projectRef || ''} onChange={e => patch({ projectRef: e.target.value })} disabled={archivada} maxLength={80} placeholder="GG2349313" /></Campo>
                                    <Campo label="Área de interés"><select className={campo} value={c.areaFocus || ''} onChange={e => patch({ areaFocus: (e.target.value || null) as any })} disabled={archivada}><option value="">Sin definir</option>{Object.entries(cat?.areas || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
                                    <Campo label="Modalidad de acceso deseada" hint={cat?.accessModes?.[c.accessMode]?.help}><select className={campo} value={c.accessMode} onChange={e => patch({ accessMode: e.target.value })} disabled={archivada}>{Object.entries(cat?.accessModes || {}).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Campo>
                                    <fieldset><legend className={rotuloLegend}>Público objetivo</legend>
                                        <div className="flex flex-wrap gap-2">{Object.entries(cat?.audiences || {}).map(([k, v]) => (
                                            <label key={k} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${c.audience?.includes(k) ? 'border-rotary-blue bg-blue-50 text-rotary-blue' : 'border-gray-200 text-gray-600'} ${archivada ? 'opacity-50' : ''}`}>
                                                <input type="checkbox" className="sr-only" disabled={archivada} checked={c.audience?.includes(k)} onChange={() => patch({ audience: c.audience.includes(k) ? c.audience.filter(x => x !== k) : [...c.audience, k] })} />{v}
                                            </label>))}</div>
                                    </fieldset>
                                </div>
                                <dl className="mt-4 text-xs text-gray-500 space-y-1">
                                    <div className="flex justify-between"><dt>Club responsable</dt><dd className="font-semibold text-gray-700 text-right">{c.ownerClubName || '—'}</dd></div>
                                    <div className="flex justify-between"><dt>Distrito</dt><dd className="font-semibold text-gray-700">{c.districtNumber || '—'}</dd></div>
                                    <div className="flex justify-between"><dt>Última edición</dt><dd className="font-semibold text-gray-700">{fmtDate(c.updatedAt)}</dd></div>
                                </dl>
                            </div>
                            <div className={TARJETA}>
                                <h3 className="text-sm font-black text-gray-800">Compartir</h3>
                                <p className="text-xs text-gray-500 mt-1">Página pública de la colección (muestra sólo los cursos publicados):</p>
                                <code className="block text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 mt-2 break-all">/cursos/colecciones/{c.slug}</code>
                                {c.accessMode === 'private' ? <button type="button" onClick={copiarInvitacion} className={`${btnSecundario} w-full justify-center mt-3`}><Link2 className="w-4 h-4" /> Copiar enlace de invitación</button> : null}
                                <div className="mt-3 flex gap-2">
                                    {archivada ? <button type="button" onClick={() => estadoColeccion('active')} className={`${btnSecundario} flex-1 justify-center`}><RotateCcw className="w-4 h-4" /> Restaurar</button>
                                        : <button type="button" onClick={() => estadoColeccion('archived')} className={`${btnSecundario} flex-1 justify-center`}><Archive className="w-4 h-4" /> Archivar colección</button>}
                                </div>
                            </div>
                        </aside>
                        <section>
                            <div className={TARJETA}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h1 className="text-xl font-black text-gray-800">{c.name}</h1>
                                        <p className="text-xs text-gray-500 mt-1">{visibles.length} curso(s) · {visibles.filter(k => k.status === 'published').length} publicado(s) · {visibles.filter(k => k.status === 'in_review').length} en revisión · {visibles.filter(k => k.status === 'draft' || k.status === 'changes_requested').length} en edición</p>
                                    </div>
                                    <button type="button" onClick={() => { setTituloNuevo(''); setDialogoCurso(true); }} className={btnPrimario} disabled={archivada || maxReached}><Plus className="w-4 h-4" /> Agregar otro curso</button>
                                </div>
                                {maxReached ? <p className="text-xs text-amber-700 mt-2">La colección llegó al máximo de {data.config.maxCoursesPerCollection} cursos configurado por el Distrito.</p> : null}
                                <ul className="mt-5 space-y-3">
                                    {visibles.map((k, i) => <FilaCurso key={k.id} k={k} catalogs={cat} first={i === 0} last={i === visibles.length - 1} onUp={() => mover(data.courses.indexOf(k), -1)} onDown={() => mover(data.courses.indexOf(k), 1)} onDuplicate={() => duplicar(k)} onArchive={() => archivarCurso(k)} />)}
                                </ul>
                                {!visibles.length ? <Vacio texto="Esta colección todavía no tiene cursos. Agrega el primero: puedes empezar con un título y completarlo en varias sesiones; todo se guarda automáticamente." /> : null}
                                {archivados.length ? (
                                    <details className="mt-6"><summary className="text-xs font-semibold text-gray-500 cursor-pointer">Cursos archivados ({archivados.length})</summary>
                                        <ul className="mt-3 space-y-3 opacity-75">{archivados.map(k => <FilaCurso key={k.id} k={k} catalogs={cat} />)}</ul>
                                    </details>
                                ) : null}
                            </div>
                        </section>
                    </div>
                ) : null}
            </div>
            {dialogoCurso ? (
                <Dialogo title="Agregar un curso a la colección" onClose={() => setDialogoCurso(false)} footer={<><button type="button" className={btnSecundario} onClick={() => setDialogoCurso(false)}>Cancelar</button><button type="button" className={btnPrimario} onClick={crearCurso} disabled={creando}>{creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear y abrir el editor</button></>}>
                    <Campo label="Título del curso" hint="Se puede cambiar después. El curso nace como borrador dentro de esta colección."><input className={campo} value={tituloNuevo} onChange={e => setTituloNuevo(e.target.value)} maxLength={160} placeholder="Introducción a la seguridad alimentaria" autoFocus /></Campo>
                </Dialogo>
            ) : null}
        </Shell>
    );
};

// ─── Vista 3: el editor ───────────────────────────────────────────────
const VistaCurso = () => {
    const { id = '' } = useParams();
    return <Shell><CourseEditor courseId={id} /></Shell>;
};

const MisCursos = ({ view }: { view: 'overview' | 'collection' | 'course' }) => {
    const { user } = useAuth();
    if (!user) return <SinSesion />;
    if (view === 'collection') return <VistaColeccion />;
    if (view === 'course') return <VistaCurso />;
    return <VistaColecciones />;
};

export const esErrorSesion = (e: unknown) => e instanceof LearningError && e.status === 401;
export default MisCursos;
