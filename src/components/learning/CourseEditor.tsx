/**
 * El editor de un curso (v4.1302.0) — Vista 3 de «Mis cursos y capacitaciones».
 *
 * Pestañas: Información · Portada · Contenido · Recursos · Acceso y publicación · Vista previa.
 * Todo se guarda automáticamente (Autosaver): información, módulos, lecciones,
 * recursos, orden y preferencias. Los archivos se suben directo a S3 y sólo
 * cuentan cuando el servidor los confirma. «Enviar a revisión» exige lo que
 * `readiness.missing` enumera con su nombre.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowDown, ArrowUp, Plus, Trash2, Send, Undo2, Archive, RotateCcw, Link2, Eye, Film, FileText, Clock, Info, Image as ImageIcon, ListChecks, Lock, CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { misApi, Autosaver, fmtBytes, fmtMinutes, fmtDate, type CourseView, type Course, type Module, type Lesson, type Resource, type LFile, type SaveState } from '../../lib/learningClient';
import { TARJETA, campo, btnPrimario, btnSecundario, Campo, StatusChip, SaveIndicator, Cargando, Uploader, Dialogo, KindIcon, Progreso } from './learningUi';

type Tab = 'info' | 'portada' | 'contenido' | 'recursos' | 'acceso' | 'preview';
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'info', label: 'Información', icon: <Info className="w-4 h-4" /> },
    { id: 'portada', label: 'Portada', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'contenido', label: 'Contenido', icon: <ListChecks className="w-4 h-4" /> },
    { id: 'recursos', label: 'Recursos', icon: <FileText className="w-4 h-4" /> },
    { id: 'acceso', label: 'Acceso y publicación', icon: <Lock className="w-4 h-4" /> },
    { id: 'preview', label: 'Vista previa', icon: <Eye className="w-4 h-4" /> },
];

const CourseEditor = ({ courseId }: { courseId: string }) => {
    const [data, setData] = useState<CourseView | null>(null);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<Tab>('info');
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [enviando, setEnviando] = useState(false);
    const [confirmarEnvio, setConfirmarEnvio] = useState(false);
    const saver = useRef<Autosaver | null>(null);

    useEffect(() => { const a = new Autosaver(); a.onChange = setSaveState; saver.current = a; return () => a.destroy(); }, []);
    useEffect(() => {
        const h = (e: BeforeUnloadEvent) => { if (saver.current?.hasPending) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
    }, []);

    const cargar = useCallback(async () => {
        try { setError(''); setData(await misApi<CourseView>(`/cursos/${courseId}`)); }
        catch (e: any) { setError(e?.message || 'No se pudo cargar el curso.'); }
    }, [courseId]);
    useEffect(() => { cargar(); }, [cargar]);

    const k = data?.course;
    const cat = data?.catalogs || null;
    const editable = Boolean(data?.editable);

    // ── Guardado automático del curso y sus hijos ─────────────────────
    const applyServer = (r: any) => setData(d => d ? { ...d, ...(r.readiness ? { readiness: r.readiness } : {}), ...(r.displayStatus ? { displayStatus: r.displayStatus } : {}), ...(r.durationMinutes !== undefined ? { durationMinutes: r.durationMinutes } : {}) } : d);
    const patchCourse = (values: Partial<Course>) => {
        if (!k || !editable) return;
        setData(d => d ? { ...d, course: { ...d.course, ...values } as Course } : d);
        saver.current?.queue(`course`, values, async (p) => {
            try { const r = await misApi(`/cursos/${k.id}`, { method: 'PATCH', body: p }); setFieldErrors({}); applyServer(r); }
            catch (e: any) { if (e?.status === 400 && e.errors?.length) { setFieldErrors(Object.fromEntries(e.errors.map((x: any) => [x.field, x.message]))); return; } throw e; }
        });
    };
    const patchModule = (m: Module, values: Partial<Module>) => {
        if (!k) return;
        setData(d => d ? { ...d, modules: d.modules.map(x => x.id === m.id ? { ...x, ...values } : x) } : d);
        saver.current?.queue(`mod:${m.id}`, values, (p) => misApi(`/cursos/${k.id}/modulos/${m.id}`, { method: 'PATCH', body: p }));
    };
    const patchLesson = (l: Lesson, values: Partial<Lesson>) => {
        if (!k) return;
        setData(d => d ? { ...d, lessons: d.lessons.map(x => x.id === l.id ? { ...x, ...values } : x) } : d);
        saver.current?.queue(`les:${l.id}`, values, async (p) => { await misApi(`/cursos/${k.id}/lecciones/${l.id}`, { method: 'PATCH', body: p }); refreshReadiness(); });
    };
    const patchResource = (r: Resource, values: Partial<Resource>) => {
        if (!k) return;
        setData(d => d ? { ...d, resources: d.resources.map(x => x.id === r.id ? { ...x, ...values } : x) } : d);
        saver.current?.queue(`res:${r.id}`, values, (p) => misApi(`/cursos/${k.id}/recursos/${r.id}`, { method: 'PATCH', body: p }));
    };
    /** Tras cambiar contenido, pide al servidor la preparación real (sin pisar lo que se edita). */
    const refreshReadiness = async () => {
        if (!k) return;
        try { const r = await misApi<CourseView>(`/cursos/${k.id}`); setData(d => d ? { ...d, readiness: r.readiness, displayStatus: r.displayStatus, durationMinutes: r.durationMinutes, files: r.files } : d); } catch { /* se verá en la próxima carga */ }
    };

    // ── Hijos: crear / borrar / reordenar ─────────────────────────────
    const addModule = async () => { if (!k) return; try { const r = await misApi<{ module: Module }>(`/cursos/${k.id}/modulos`, { method: 'POST', body: { title: `Módulo ${(data?.modules.length || 0) + 1}` } }); setData(d => d ? { ...d, modules: [...d.modules, r.module] } : d); } catch (e: any) { toast.error(e.message); } };
    const delModule = async (m: Module) => { if (!k || !window.confirm(`¿Eliminar el módulo «${m.title}»? Sus lecciones quedan sin módulo, no se borran.`)) return; try { await misApi(`/cursos/${k.id}/modulos/${m.id}`, { method: 'DELETE' }); setData(d => d ? { ...d, modules: d.modules.filter(x => x.id !== m.id), lessons: d.lessons.map(l => l.moduleId === m.id ? { ...l, moduleId: null } : l) } : d); } catch (e: any) { toast.error(e.message); } };
    const addLesson = async (moduleId: string | null) => { if (!k) return; try { const n = (data?.lessons.filter(l => (l.moduleId || null) === moduleId).length || 0) + 1; const r = await misApi<{ lesson: Lesson }>(`/cursos/${k.id}/lecciones`, { method: 'POST', body: { moduleId, title: `Lección ${n}` } }); setData(d => d ? { ...d, lessons: [...d.lessons, r.lesson] } : d); setLeccionAbierta(r.lesson.id); } catch (e: any) { toast.error(e.message); } };
    const delLesson = async (l: Lesson) => { if (!k || !window.confirm(`¿Eliminar la lección «${l.title}»?`)) return; try { await misApi(`/cursos/${k.id}/lecciones/${l.id}`, { method: 'DELETE' }); setData(d => d ? { ...d, lessons: d.lessons.filter(x => x.id !== l.id), resources: d.resources.filter(r => r.lessonId !== l.id) } : d); refreshReadiness(); } catch (e: any) { toast.error(e.message); } };
    const addResource = async (body: Partial<Resource>) => { if (!k) return; try { const r = await misApi<{ resource: Resource }>(`/cursos/${k.id}/recursos`, { method: 'POST', body }); setData(d => d ? { ...d, resources: [...d.resources, r.resource] } : d); refreshReadiness(); } catch (e: any) { toast.error(e.message); } };
    const delResource = async (r: Resource) => { if (!k || !window.confirm(`¿Quitar el recurso «${r.title}»?`)) return; try { await misApi(`/cursos/${k.id}/recursos/${r.id}`, { method: 'DELETE' }); setData(d => d ? { ...d, resources: d.resources.filter(x => x.id !== r.id) } : d); refreshReadiness(); } catch (e: any) { toast.error(e.message); } };
    const delFile = async (f: LFile) => { if (!k || !window.confirm(`¿Eliminar el archivo «${f.filename}»? Se quita de las lecciones y recursos que lo usen.`)) return; try { await misApi(`/cursos/${k.id}/archivos/${f.id}`, { method: 'DELETE' }); await cargar(); } catch (e: any) { toast.error(e.message); } };
    const sendOrder = async (body: any) => { if (!k) return; try { await misApi(`/cursos/${k.id}/orden`, { method: 'POST', body }); } catch (e: any) { toast.error(e.message); cargar(); } };
    const moveModule = (m: Module, dir: -1 | 1) => { if (!data) return; const list = [...data.modules]; const i = list.indexOf(m); const j = i + dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; setData({ ...data, modules: list }); sendOrder({ modules: list.map(x => x.id) }); };
    const moveLesson = (l: Lesson, dir: -1 | 1) => {
        if (!data) return;
        const group = data.lessons.filter(x => (x.moduleId || null) === (l.moduleId || null)); const i = group.indexOf(l); const j = i + dir; if (j < 0 || j >= group.length) return;
        [group[i], group[j]] = [group[j], group[i]];
        const others = data.lessons.filter(x => (x.moduleId || null) !== (l.moduleId || null));
        setData({ ...data, lessons: [...others, ...group] });
        sendOrder({ lessons: [{ moduleId: l.moduleId || null, ids: group.map(x => x.id) }] });
    };
    const moveLessonToModule = (l: Lesson, moduleId: string | null) => { patchLesson(l, { moduleId }); };
    const moveResource = (r: Resource, dir: -1 | 1) => { if (!data) return; const list = [...data.resources]; const i = list.indexOf(r); const j = i + dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; setData({ ...data, resources: list }); sendOrder({ resources: list.map(x => x.id) }); };

    // ── Estado del curso ──────────────────────────────────────────────
    const enviar = async () => {
        if (!k) return;
        setEnviando(true);
        try {
            await saver.current?.flush();
            const r = await misApi<{ course: Course }>(`/cursos/${k.id}/enviar`, { method: 'POST' });
            toast.success('Curso enviado a revisión. Te avisaremos por correo cuando el comité decida.');
            setConfirmarEnvio(false);
            setData(d => d ? { ...d, course: r.course, displayStatus: 'in_review', editable: false, transitions: cat?.clubTransitions?.in_review || [] } : d);
            cargar();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo enviar.');
            if (e?.extra?.missing) setData(d => d ? { ...d, readiness: { ...d.readiness, missing: e.extra.missing, ready: false } } : d);
        } finally { setEnviando(false); }
    };
    const cambiarEstado = async (to: string, confirmText?: string) => {
        if (!k) return;
        if (confirmText && !window.confirm(confirmText)) return;
        try { await misApi(`/cursos/${k.id}/estado`, { method: 'POST', body: { to } }); await cargar(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cambiar el estado.'); }
    };
    const copiarEnlace = async (privado: boolean) => {
        if (!k) return;
        const url = `${window.location.origin}/cursos/${k.slug}${privado && k.inviteToken ? `?invite=${k.inviteToken}` : ''}`;
        try { await navigator.clipboard.writeText(url); toast.success('Enlace copiado.'); } catch { window.prompt('Copia el enlace:', url); }
    };

    const [leccionAbierta, setLeccionAbierta] = useState<string | null>(null);
    const filesById = useMemo(() => Object.fromEntries((data?.files || []).map(f => [f.id, f])), [data?.files]);
    const readyFiles = (kind?: string) => (data?.files || []).filter(f => f.status === 'ready' && (!kind || f.kind === kind));

    if (error) return <div className="max-w-3xl mx-auto px-4 py-16"><p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</p><Link to="/mis-cursos" className={`${btnSecundario} mt-4`}><ArrowLeft className="w-4 h-4" /> Volver</Link></div>;
    if (!data || !k) return <Cargando />;

    const faltan = data.readiness.missing;
    const volverA = data.collection ? `/mis-cursos/colecciones/${data.collection.id}` : '/mis-cursos';

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            {/* Cabecera */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <Link to={volverA} className="inline-flex items-center gap-2 text-sm font-medium text-rotary-blue hover:underline"><ArrowLeft className="w-4 h-4" /> {data.collection ? data.collection.name : 'Mis cursos'}</Link>
                <SaveIndicator state={saveState} lastSavedAt={saver.current?.lastSavedAt} error={saver.current?.lastError} />
            </div>
            <div className={`${TARJETA} mb-4`}>
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusChip id={data.displayStatus} catalogs={cat} />
                            {k.projectRef ? <span className="text-[11px] font-semibold text-rotary-blue">Proyecto {k.projectRef}</span> : null}
                            {k.ownerClubName ? <span className="text-[11px] text-gray-500">· {k.ownerClubName}</span> : null}
                        </div>
                        <input
                            className="mt-2 w-full text-2xl font-black text-gray-800 bg-transparent border-0 border-b border-transparent focus:border-gray-200 focus:outline-none placeholder:text-gray-300 disabled:text-gray-700"
                            value={k.title} onChange={e => patchCourse({ title: e.target.value })} placeholder="Título del curso" maxLength={160} disabled={!editable} aria-label="Título del curso"
                        />
                        <p className="text-xs text-gray-500 mt-1">{data.lessons.length} lección(es) · {data.modules.length} módulo(s) · {data.files.length} archivo(s){data.durationMinutes ? ` · ${fmtMinutes(data.durationMinutes)}` : ''} · Última edición {fmtDate(k.updatedAt)}</p>
                        {(k.status === 'draft' || k.status === 'changes_requested') ? <div className="mt-3 max-w-lg"><Progreso done={data.readiness.done} total={data.readiness.total} /></div> : null}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                        {editable ? <button type="button" onClick={() => setConfirmarEnvio(true)} className={btnPrimario}><Send className="w-4 h-4" /> Enviar a revisión</button> : null}
                        {k.status === 'in_review' ? <button type="button" onClick={() => cambiarEstado('draft', '¿Retirar el curso de la revisión para seguir editándolo?')} className={btnSecundario}><Undo2 className="w-4 h-4" /> Retirar de revisión</button> : null}
                        {k.status === 'published' ? <button type="button" onClick={() => copiarEnlace(k.accessMode === 'private')} className={btnSecundario}><Link2 className="w-4 h-4" /> Copiar enlace</button> : null}
                        {k.status === 'published' ? <a href={`/cursos/${k.slug}${k.accessMode === 'private' && k.inviteToken ? `?invite=${k.inviteToken}` : ''}`} target="_blank" rel="noreferrer" className={btnSecundario}><ExternalLink className="w-4 h-4" /> Ver publicado</a> : null}
                        {editable ? <button type="button" onClick={() => cambiarEstado('archived', '¿Archivar este curso? Podrás restaurarlo después.')} className={btnSecundario}><Archive className="w-4 h-4" /> Archivar</button> : null}
                        {k.status === 'archived' ? <button type="button" onClick={() => cambiarEstado('draft')} className={btnSecundario}><RotateCcw className="w-4 h-4" /> Restaurar</button> : null}
                    </div>
                </div>
                {k.status === 'changes_requested' && k.reviewNote ? (
                    <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900"><strong>El comité pide correcciones:</strong> {k.reviewNote}</div>
                ) : null}
                {k.status === 'in_review' ? <div className="mt-4 rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-900">El curso está en revisión del comité. No se puede editar mientras tanto: si necesitas cambiar algo, retíralo de la revisión.</div> : null}
                {(k.status === 'approved' || k.status === 'published') ? <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-900">{k.status === 'published' ? 'Publicado en la biblioteca del Distrito.' : 'Aprobado por el comité; pendiente de publicación.'} Para editarlo, pide al comité que lo despublique o devuelva a correcciones.</div> : null}
                {editable && faltan.length ? (
                    <div className="mt-4 rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">Para poder enviar falta:</span>
                        <ul className="mt-1 list-disc pl-5 space-y-0.5">{faltan.map(m => <li key={m.key}>{m.label}</li>)}</ul>
                    </div>
                ) : null}
            </div>

            {/* Pestañas */}
            <div className="flex gap-1 overflow-x-auto bg-gray-100/70 rounded-2xl p-1 mb-4" role="tablist">
                {TABS.map(t => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm whitespace-nowrap transition ${tab === t.id ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900'}`}>{t.icon}{t.label}</button>
                ))}
            </div>

            {tab === 'info' ? (
                <div className={`${TARJETA} space-y-4`}>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <Campo label="Subtítulo (opcional)"><input className={campo} value={k.subtitle || ''} onChange={e => patchCourse({ subtitle: e.target.value })} disabled={!editable} maxLength={200} /></Campo>
                        <Campo label="Instructor o facilitador"><input className={campo} value={k.instructorName || ''} onChange={e => patchCourse({ instructorName: e.target.value })} disabled={!editable} maxLength={160} /></Campo>
                    </div>
                    <Campo label="Descripción breve *" hint={`${(k.shortDescription || '').length}/400 · Aparece en las tarjetas de la biblioteca (mínimo 20 caracteres).`}><textarea className={campo} rows={2} value={k.shortDescription || ''} onChange={e => patchCourse({ shortDescription: e.target.value })} disabled={!editable} maxLength={400} /></Campo>
                    <Campo label="Descripción completa"><textarea className={campo} rows={6} value={k.fullDescription || ''} onChange={e => patchCourse({ fullDescription: e.target.value })} disabled={!editable} maxLength={12000} /></Campo>
                    <Campo label="Objetivo de aprendizaje" hint="¿Qué sabrá hacer la persona al terminar?"><textarea className={campo} rows={2} value={k.learningObjective || ''} onChange={e => patchCourse({ learningObjective: e.target.value })} disabled={!editable} maxLength={2000} /></Campo>
                    <div className="grid sm:grid-cols-3 gap-4">
                        <Campo label="Nivel"><select className={campo} value={k.level || ''} onChange={e => patchCourse({ level: (e.target.value || null) as any })} disabled={!editable}><option value="">Sin definir</option>{Object.entries(cat?.levels || {}).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Campo>
                        <Campo label="Idioma"><select className={campo} value={k.language || 'es'} onChange={e => patchCourse({ language: e.target.value })} disabled={!editable}>{Object.entries(cat?.languages || {}).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Campo>
                        <Campo label="Área de interés de Rotary"><select className={campo} value={k.areaFocus || ''} onChange={e => patchCourse({ areaFocus: (e.target.value || null) as any })} disabled={!editable}><option value="">Sin definir</option>{Object.entries(cat?.areas || {}).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Campo>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <Campo label="Duración estimada" hint={k.durationAuto !== false ? `Se calcula sumando las lecciones (${fmtMinutes(data.durationMinutes) || '0 min'}). Desmarca para fijarla a mano.` : 'Fijada a mano, en minutos.'}>
                            <div className="flex items-center gap-3">
                                <input type="number" min={0} className={`${campo} w-32`} value={k.durationAuto !== false ? data.durationMinutes : (k.durationMinutes ?? '')} onChange={e => patchCourse({ durationMinutes: Number(e.target.value) || 0 })} disabled={!editable || k.durationAuto !== false} />
                                <label className="inline-flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={k.durationAuto !== false} onChange={e => patchCourse({ durationAuto: e.target.checked })} disabled={!editable} /> Calcular automáticamente</label>
                            </div>
                        </Campo>
                        <Campo label="Organización responsable" hint="Si es distinta del club (aliado, fundación, universidad)."><input className={campo} value={k.organization || ''} onChange={e => patchCourse({ organization: e.target.value })} disabled={!editable} maxLength={200} /></Campo>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <Campo label="Proyecto relacionado" hint="Código o referencia (GG2349313)."><input className={campo} value={k.projectRef || ''} onChange={e => patchCourse({ projectRef: e.target.value })} disabled={!editable} maxLength={80} /></Campo>
                        <Campo label="Etiquetas o temas" hint={`Separadas por coma. Sugeridas: ${(data.config.categories || []).slice(0, 4).join(', ')}`}>
                            <input className={campo} defaultValue={(k.tags || []).join(', ')} onBlur={e => patchCourse({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean).slice(0, 20) })} disabled={!editable} />
                        </Campo>
                    </div>
                    <fieldset><legend className="block text-xs font-semibold text-gray-600 mb-2">Público al que está dirigido</legend>
                        <div className="flex flex-wrap gap-2">{Object.entries(cat?.audiences || {}).map(([a, b]) => (
                            <label key={a} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${k.audience?.includes(a) ? 'border-rotary-blue bg-blue-50 text-rotary-blue' : 'border-gray-200 text-gray-600'} ${!editable ? 'opacity-60' : ''}`}>
                                <input type="checkbox" className="sr-only" disabled={!editable} checked={k.audience?.includes(a)} onChange={() => patchCourse({ audience: k.audience.includes(a) ? k.audience.filter(x => x !== a) : [...k.audience, a] })} />{b}
                            </label>))}</div>
                    </fieldset>
                    <Campo label="Biografía del instructor (opcional)"><textarea className={campo} rows={3} value={k.instructorBio || ''} onChange={e => patchCourse({ instructorBio: e.target.value })} disabled={!editable} maxLength={2000} /></Campo>
                    {Object.keys(fieldErrors).length ? <p className="text-xs text-rose-600">{Object.values(fieldErrors).join(' · ')}</p> : null}
                </div>
            ) : null}

            {tab === 'portada' ? (
                <div className="grid lg:grid-cols-2 gap-4">
                    <div className={`${TARJETA} space-y-5`}>
                        <ImagenCampo label="Imagen de portada" hint="Recomendada horizontal 16:9, buena resolución. Otros formatos válidos también se aceptan." url={k.coverUrl} onClear={() => patchCourse({ coverUrl: null })} editable={editable}>
                            <Uploader courseId={k.id} purpose="cover" catalogs={cat} label={k.coverUrl ? 'Cambiar portada' : 'Subir portada'} onReady={(f) => { setData(d => d ? { ...d, files: [...d.files, f] } : d); patchCourse({ coverUrl: f.publicUrl || null }); }} disabled={!editable} compact />
                        </ImagenCampo>
                        <ImagenCampo label="Miniatura del curso (opcional)" hint="Si no la subes, se usa la portada." url={k.thumbnailUrl} onClear={() => patchCourse({ thumbnailUrl: null })} editable={editable}>
                            <Uploader courseId={k.id} purpose="thumbnail" catalogs={cat} label={k.thumbnailUrl ? 'Cambiar miniatura' : 'Subir miniatura'} onReady={(f) => { setData(d => d ? { ...d, files: [...d.files, f] } : d); patchCourse({ thumbnailUrl: f.publicUrl || null }); }} disabled={!editable} compact />
                        </ImagenCampo>
                        <ImagenCampo label="Imagen del instructor (opcional)" url={k.instructorImageUrl} onClear={() => patchCourse({ instructorImageUrl: null })} editable={editable} round>
                            <Uploader courseId={k.id} purpose="instructor" catalogs={cat} label={k.instructorImageUrl ? 'Cambiar imagen' : 'Subir imagen del instructor'} onReady={(f) => { setData(d => d ? { ...d, files: [...d.files, f] } : d); patchCourse({ instructorImageUrl: f.publicUrl || null }); }} disabled={!editable} compact />
                        </ImagenCampo>
                        <div>
                            <span className="block text-xs font-semibold text-gray-600 mb-1">Video introductorio (opcional)</span>
                            {k.introVideoFileId && filesById[k.introVideoFileId] ? <ArchivoChip f={filesById[k.introVideoFileId]} onRemove={editable ? () => patchCourse({ introVideoFileId: null }) : undefined} /> : null}
                            <Uploader courseId={k.id} purpose="intro_video" catalogs={cat} label={k.introVideoFileId ? 'Reemplazar video introductorio' : 'Subir video introductorio'} onReady={(f) => { setData(d => d ? { ...d, files: [...d.files, f] } : d); patchCourse({ introVideoFileId: f.id }); }} disabled={!editable} compact />
                            {data.config.allowExternalVideo ? <Campo label="o enlace externo (YouTube / Vimeo)" className="mt-2" error={fieldErrors.introVideoUrl}><input className={campo} value={k.introVideoUrl || ''} onChange={e => patchCourse({ introVideoUrl: e.target.value })} disabled={!editable} placeholder="https://youtu.be/…" /></Campo> : null}
                        </div>
                    </div>
                    <div className={TARJETA}>
                        <h3 className="text-sm font-black text-gray-800 mb-3">Así se verá en la biblioteca</h3>
                        <TarjetaPublica k={k} durationMinutes={data.durationMinutes} lessonCount={data.lessons.length} cat={cat} />
                    </div>
                </div>
            ) : null}

            {tab === 'contenido' ? (
                <div className="space-y-4">
                    <div className={`${TARJETA} flex flex-wrap items-center justify-between gap-3`}>
                        <div><h2 className="text-base font-black text-gray-800">Estructura educativa</h2><p className="text-xs text-gray-500 mt-1">Módulos → Lecciones → Recursos. Un curso sencillo con una sola lección y un video también es válido: no hace falta crear módulos.</p></div>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => addLesson(null)} className={btnSecundario} disabled={!editable}><Plus className="w-4 h-4" /> Lección sin módulo</button>
                            <button type="button" onClick={addModule} className={btnPrimario} disabled={!editable}><Plus className="w-4 h-4" /> Agregar módulo</button>
                        </div>
                    </div>
                    {data.modules.map((m, mi) => (
                        <section key={m.id} className={TARJETA} aria-label={m.title || `Módulo ${mi + 1}`}>
                            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-black uppercase tracking-wide text-rotary-blue">Módulo {mi + 1}</span>
                                    </div>
                                    <input className={`${campo} font-bold`} value={m.title} onChange={e => patchModule(m, { title: e.target.value })} placeholder="Nombre del módulo" disabled={!editable} maxLength={160} />
                                    <input className={campo} value={m.description || ''} onChange={e => patchModule(m, { description: e.target.value })} placeholder="Descripción breve del módulo (opcional)" disabled={!editable} maxLength={2000} />
                                </div>
                                {editable ? (
                                    <div className="flex gap-1 shrink-0">
                                        <button type="button" onClick={() => moveModule(m, -1)} disabled={mi === 0} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30" aria-label="Subir módulo"><ArrowUp className="w-4 h-4" /></button>
                                        <button type="button" onClick={() => moveModule(m, 1)} disabled={mi === data.modules.length - 1} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30" aria-label="Bajar módulo"><ArrowDown className="w-4 h-4" /></button>
                                        <button type="button" onClick={() => delModule(m)} className="p-2 rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50" aria-label="Eliminar módulo"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ) : null}
                            </div>
                            <ul className="mt-4 space-y-3">
                                {data.lessons.filter(l => l.moduleId === m.id).map((l, li, arr) => (
                                    <LeccionEditor key={l.id} l={l} index={li} total={arr.length} open={leccionAbierta === l.id} onToggle={() => setLeccionAbierta(leccionAbierta === l.id ? null : l.id)} editable={editable} cat={cat} courseId={k.id} filesById={filesById} resources={data.resources.filter(r => r.lessonId === l.id)} modules={data.modules}
                                        onPatch={(v) => patchLesson(l, v)} onMove={(d) => moveLesson(l, d)} onDelete={() => delLesson(l)} onMoveToModule={(id) => moveLessonToModule(l, id)}
                                        onFile={(f) => { setData(d => d ? { ...d, files: [...d.files, f] } : d); }} onAddResource={(body) => addResource({ ...body, lessonId: l.id })} onDelResource={delResource} onPatchResource={patchResource} allowExternalVideo={data.config.allowExternalVideo} readyFiles={readyFiles} />
                                ))}
                            </ul>
                            <button type="button" onClick={() => addLesson(m.id)} className={`${btnSecundario} mt-3`} disabled={!editable}><Plus className="w-4 h-4" /> Agregar lección a este módulo</button>
                        </section>
                    ))}
                    {data.lessons.some(l => !l.moduleId || !data.modules.some(m => m.id === l.moduleId)) ? (
                        <section className={TARJETA} aria-label="Lecciones sin módulo">
                            <h3 className="text-[11px] font-black uppercase tracking-wide text-gray-500">{data.modules.length ? 'Lecciones sin módulo' : 'Lecciones'}</h3>
                            <ul className="mt-3 space-y-3">
                                {data.lessons.filter(l => !l.moduleId || !data.modules.some(m => m.id === l.moduleId)).map((l, li, arr) => (
                                    <LeccionEditor key={l.id} l={l} index={li} total={arr.length} open={leccionAbierta === l.id} onToggle={() => setLeccionAbierta(leccionAbierta === l.id ? null : l.id)} editable={editable} cat={cat} courseId={k.id} filesById={filesById} resources={data.resources.filter(r => r.lessonId === l.id)} modules={data.modules}
                                        onPatch={(v) => patchLesson(l, v)} onMove={(d) => moveLesson(l, d)} onDelete={() => delLesson(l)} onMoveToModule={(id) => moveLessonToModule(l, id)}
                                        onFile={(f) => { setData(d => d ? { ...d, files: [...d.files, f] } : d); }} onAddResource={(body) => addResource({ ...body, lessonId: l.id })} onDelResource={delResource} onPatchResource={patchResource} allowExternalVideo={data.config.allowExternalVideo} readyFiles={readyFiles} />
                                ))}
                            </ul>
                        </section>
                    ) : null}
                    {!data.lessons.length && !data.modules.length ? <div className={TARJETA}><p className="text-sm text-gray-500 text-center py-6">Empieza con «Agregar módulo» o, si el curso es sencillo, con «Lección sin módulo».</p></div> : null}
                </div>
            ) : null}

            {tab === 'recursos' ? (
                <div className="grid lg:grid-cols-[1fr_360px] gap-4">
                    <div className={TARJETA}>
                        <h2 className="text-base font-black text-gray-800">Recursos complementarios del curso</h2>
                        <p className="text-xs text-gray-500 mt-1">Guías de estudio, manuales, presentaciones, enlaces de consulta, actividades prácticas. Los recursos de una lección concreta se agregan desde la lección.</p>
                        <ul className="mt-4 space-y-2">
                            {data.resources.filter(r => !r.lessonId).map((r, i, arr) => (
                                <RecursoFila key={r.id} r={r} f={r.fileId ? filesById[r.fileId] : undefined} editable={editable} first={i === 0} last={i === arr.length - 1} onMove={(d) => moveResource(r, d)} onDelete={() => delResource(r)} onPatch={(v) => patchResource(r, v)} />
                            ))}
                        </ul>
                        {!data.resources.filter(r => !r.lessonId).length ? <p className="text-sm text-gray-400 text-center py-6">Todavía no hay recursos del curso.</p> : null}
                        {editable ? (
                            <div className="mt-4 grid sm:grid-cols-2 gap-3">
                                <Uploader courseId={k.id} purpose="resource" catalogs={cat} multiple label="Subir archivos descargables" onReady={(f) => { setData(d => d ? { ...d, files: [...d.files, f] } : d); addResource({ fileId: f.id, title: f.filename }); }} />
                                <EnlaceNuevo onAdd={(url, title) => addResource({ url, title })} />
                            </div>
                        ) : null}
                    </div>
                    <aside className={TARJETA}>
                        <h3 className="text-sm font-black text-gray-800">Archivos de este curso</h3>
                        <p className="text-[11px] text-gray-500 mt-1">Todo lo cargado, aunque cierres la sesión. Los que no uses puedes eliminarlos.</p>
                        <ul className="mt-3 space-y-2">
                            {data.files.map(f => <li key={f.id}><ArchivoChip f={f} onRemove={editable ? () => delFile(f) : undefined} courseId={k.id} /></li>)}
                            {!data.files.length ? <li className="text-xs text-gray-400">Sin archivos todavía.</li> : null}
                        </ul>
                    </aside>
                </div>
            ) : null}

            {tab === 'acceso' ? (
                <div className="grid lg:grid-cols-2 gap-4">
                    <div className={`${TARJETA} space-y-4`}>
                        <h2 className="text-base font-black text-gray-800">Preferencias de publicación</h2>
                        <fieldset>
                            <legend className="block text-xs font-semibold text-gray-600 mb-2">Modalidad de acceso *</legend>
                            <div className="space-y-2">{Object.entries(cat?.accessModes || {}).map(([a, b]) => (
                                <label key={a} className={`flex items-start gap-3 rounded-2xl border p-3 cursor-pointer ${k.accessMode === a ? 'border-rotary-blue bg-blue-50/60' : 'border-gray-200'} ${!editable ? 'opacity-70' : ''}`}>
                                    <input type="radio" name="accessMode" className="mt-1" checked={k.accessMode === a} onChange={() => patchCourse({ accessMode: a })} disabled={!editable} />
                                    <span><span className="block text-sm font-semibold text-gray-800">{b.label}</span><span className="block text-xs text-gray-500">{b.help}</span></span>
                                </label>))}</div>
                            <p className="text-[11px] text-gray-400 mt-2">La modalidad definitiva respeta las políticas del Distrito: el comité puede pedir ajustes antes de publicar.</p>
                        </fieldset>
                        {k.accessMode === 'private' && k.inviteToken ? (
                            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600">
                                <span className="font-semibold text-gray-800">Enlace de invitación</span> (funciona cuando el curso esté publicado):
                                <code className="block mt-1 break-all bg-white rounded-lg px-2 py-1.5">/cursos/{k.slug}?invite={k.inviteToken}</code>
                                <button type="button" onClick={() => copiarEnlace(true)} className={`${btnSecundario} mt-2`}><Link2 className="w-4 h-4" /> Copiar</button>
                            </div>
                        ) : null}
                        <fieldset>
                            <legend className="block text-xs font-semibold text-gray-600 mb-2">Funciones del LMS que deseas</legend>
                            <div className="space-y-2">{Object.entries(cat?.features || {}).map(([a, b]) => (
                                <label key={a} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 p-3">
                                    <span className="flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" checked={Boolean(k.features?.[a])} onChange={e => patchCourse({ features: { ...(k.features || {}), [a]: e.target.checked } })} disabled={!editable} />{b.label}</span>
                                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${b.available ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{b.available ? 'Disponible' : `Fase ${b.phase} · se registra tu interés`}</span>
                                </label>))}</div>
                            <p className="text-[11px] text-gray-400 mt-2">Sólo se activan las funciones que el LMS ya tiene. Las demás quedan registradas como preferencia; no se promete lo que todavía no existe.</p>
                        </fieldset>
                    </div>
                    <div className={`${TARJETA} space-y-4`}>
                        <h2 className="text-base font-black text-gray-800">Derechos y autorizaciones *</h2>
                        <label className={`flex items-start gap-3 rounded-2xl border p-4 ${k.rightsAccepted ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'} ${!editable ? 'opacity-70' : 'cursor-pointer'}`}>
                            <input type="checkbox" className="mt-1" checked={Boolean(k.rightsAccepted)} onChange={e => patchCourse({ rightsAccepted: e.target.checked })} disabled={!editable} data-testid="rights-checkbox" />
                            <span className="text-sm text-gray-700 leading-relaxed">{data.config.rightsText}</span>
                        </label>
                        {k.rightsAccepted && k.rightsText && k.rightsText !== data.config.rightsText ? <p className="text-[11px] text-amber-700">Aceptaste una versión anterior del texto. Al volver a marcar se guarda la vigente.</p> : null}
                        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
                            <h3 className="text-sm font-black text-gray-800">Lista de verificación para enviar</h3>
                            <ul className="mt-2 space-y-1.5">
                                {(data.readiness.requirements || []).map(r => (
                                    <li key={r.key} className="flex items-center gap-2 text-sm">{r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}<span className={r.ok ? 'text-gray-700' : 'text-gray-900 font-medium'}>{r.label}</span></li>
                                ))}
                            </ul>
                            {data.readiness.warnings?.length ? <ul className="mt-3 text-[11px] text-gray-500 list-disc pl-5 space-y-0.5">{data.readiness.warnings.map(w => <li key={w}>{w}</li>)}</ul> : null}
                            {editable ? <button type="button" onClick={() => setConfirmarEnvio(true)} className={`${btnPrimario} mt-4 w-full justify-center`}><Send className="w-4 h-4" /> Enviar a revisión</button> : null}
                        </div>
                        {data.events.length ? (
                            <div>
                                <h3 className="text-sm font-black text-gray-800">Historial</h3>
                                <ul className="mt-2 space-y-1.5 text-xs text-gray-600">{data.events.slice(0, 15).map(ev => <li key={ev.id} className="flex justify-between gap-3"><span>{eventoTexto(ev, cat)}</span><span className="text-gray-400 whitespace-nowrap">{fmtDate(ev.createdAt)}</span></li>)}</ul>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {tab === 'preview' ? <VistaPrevia data={data} /> : null}

            {confirmarEnvio ? (
                <Dialogo title="Enviar el curso a revisión" onClose={() => setConfirmarEnvio(false)} footer={<><button type="button" className={btnSecundario} onClick={() => setConfirmarEnvio(false)}>Todavía no</button><button type="button" className={btnPrimario} onClick={enviar} disabled={enviando || !data.readiness.ready}>{enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar ahora</button></>}>
                    {data.readiness.ready ? (
                        <p className="text-sm text-gray-700">El comité del Distrito revisará «{k.title}». Mientras esté en revisión no podrás editarlo (podrás retirarlo). Recibirás un correo con la decisión; si piden correcciones, verás sus observaciones aquí.</p>
                    ) : (
                        <div className="text-sm text-gray-700"><p className="font-semibold">Antes de enviar falta:</p><ul className="list-disc pl-5 mt-2 space-y-1">{faltan.map(m => <li key={m.key}>{m.label}</li>)}</ul></div>
                    )}
                </Dialogo>
            ) : null}
        </div>
    );
};

// ─── Piezas internas ──────────────────────────────────────────────────
const eventoTexto = (ev: any, cat: any) => {
    const a = String(ev.action || '');
    if (a.startsWith('status:')) return `${ev.actorName || 'Sistema'}: ${cat?.states?.[a.slice(7)]?.label || a.slice(7)}${ev.detail?.note ? ` — ${ev.detail.note}` : ''}`;
    if (a === 'comment') return `${ev.actorName || 'Comité'}: ${ev.detail?.text || ''}`;
    if (a === 'course:created') return `Curso creado por ${ev.actorName || '—'}`;
    if (a === 'course:duplicated') return 'Estructura duplicada de otro curso';
    return a.replace(/[:_]/g, ' ');
};

const ImagenCampo = ({ label, hint, url, onClear, editable, children, round = false }: { label: string; hint?: string; url: string | null; onClear: () => void; editable: boolean; children: ReactNode; round?: boolean }) => (
    <div>
        <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
        {hint ? <p className="text-[11px] text-gray-400 mb-2">{hint}</p> : null}
        <div className="flex items-start gap-3">
            <div className={`${round ? 'w-20 h-20 rounded-full' : 'w-40 aspect-[16/9] rounded-xl'} overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center text-gray-300`}>{url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6" />}</div>
            <div className="flex-1 min-w-0">{children}{url && editable ? <button type="button" onClick={onClear} className="text-[11px] text-rose-600 mt-1">Quitar imagen</button> : null}</div>
        </div>
    </div>
);

const ArchivoChip = ({ f, onRemove, courseId }: { f: LFile; onRemove?: () => void; courseId?: string }) => {
    const abrir = async () => {
        if (!courseId) return;
        try { const r = await misApi<{ url: string }>(`/cursos/${courseId}/archivos/${f.id}/url`); window.open(r.url, '_blank', 'noopener'); } catch (e: any) { toast.error(e.message); }
    };
    return (
        <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs" data-testid="file-chip">
            <KindIcon kind={f.kind} className="w-4 h-4 text-rotary-blue shrink-0" />
            <span className="flex-1 min-w-0 truncate font-medium text-gray-700" title={f.filename}>{f.filename}</span>
            <span className="text-gray-400 shrink-0">{fmtBytes(f.bytes)}{f.durationSeconds ? ` · ${fmtMinutes(Math.round(f.durationSeconds / 60)) || `${f.durationSeconds}s`}` : ''}</span>
            {f.status === 'uploading' ? <span className="text-amber-600 shrink-0">en carga</span> : null}
            {courseId && f.status === 'ready' ? <button type="button" onClick={abrir} className="text-rotary-blue font-semibold shrink-0">Ver</button> : null}
            {onRemove ? <button type="button" onClick={onRemove} className="text-rose-600 shrink-0" aria-label="Quitar"><Trash2 className="w-3.5 h-3.5" /></button> : null}
        </div>
    );
};

const EnlaceNuevo = ({ onAdd }: { onAdd: (url: string, title: string) => void }) => {
    const [url, setUrl] = useState(''); const [title, setTitle] = useState('');
    return (
        <div className="rounded-2xl border border-gray-200 p-3 space-y-2">
            <span className="block text-xs font-semibold text-gray-700">Agregar enlace externo</span>
            <input className={campo} placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
            <input className={campo} placeholder="Título del recurso" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} />
            <button type="button" className={btnSecundario} disabled={!url.trim()} onClick={() => { onAdd(url.trim(), title.trim() || url.trim()); setUrl(''); setTitle(''); }}><Plus className="w-4 h-4" /> Agregar enlace</button>
        </div>
    );
};

const RecursoFila = ({ r, f, editable, first, last, onMove, onDelete, onPatch }: { r: Resource; f?: LFile; editable: boolean; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onDelete: () => void; onPatch: (v: Partial<Resource>) => void }) => (
    <li className="rounded-xl border border-gray-100 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <span className="shrink-0 text-rotary-blue">{r.kind === 'link' ? <ExternalLink className="w-4 h-4" /> : <KindIcon kind={f?.kind} />}</span>
        <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2">
            <input className={campo} value={r.title} onChange={e => onPatch({ title: e.target.value })} disabled={!editable} placeholder="Título" maxLength={160} />
            <input className={campo} value={r.description || ''} onChange={e => onPatch({ description: e.target.value })} disabled={!editable} placeholder="Descripción breve" maxLength={1000} />
            <span className="text-[11px] text-gray-400 truncate sm:col-span-2">{r.kind === 'link' ? r.url : f ? `${f.filename} · ${fmtBytes(f.bytes)}${f.status !== 'ready' ? ' · en carga' : ''}` : 'archivo eliminado'}</span>
        </div>
        {editable ? (
            <div className="flex gap-1 shrink-0">
                <button type="button" onClick={() => onMove(-1)} disabled={first} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30" aria-label="Subir"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => onMove(1)} disabled={last} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30" aria-label="Bajar"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" onClick={onDelete} className="p-2 rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50" aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
            </div>
        ) : null}
    </li>
);

interface LeccionProps {
    l: Lesson; index: number; total: number; open: boolean; onToggle: () => void; editable: boolean; cat: any; courseId: string; filesById: Record<string, LFile>; resources: Resource[]; modules: Module[];
    onPatch: (v: Partial<Lesson>) => void; onMove: (d: -1 | 1) => void; onDelete: () => void; onMoveToModule: (id: string | null) => void; onFile: (f: LFile) => void;
    onAddResource: (body: Partial<Resource>) => void; onDelResource: (r: Resource) => void; onPatchResource: (r: Resource, v: Partial<Resource>) => void; allowExternalVideo: boolean; readyFiles: (kind?: string) => LFile[];
}
const LeccionEditor = ({ l, index, total, open, onToggle, editable, cat, courseId, filesById, resources, modules, onPatch, onMove, onDelete, onMoveToModule, onFile, onAddResource, onDelResource, onPatchResource, allowExternalVideo, readyFiles }: LeccionProps) => {
    const video = l.videoFileId ? filesById[l.videoFileId] : undefined;
    const audio = l.audioFileId ? filesById[l.audioFileId] : undefined;
    const tiene = Boolean(l.videoUrl || (video && video.status === 'ready') || (audio && audio.status === 'ready') || (l.body || '').trim().length >= 40 || resources.some(r => r.url || (r.fileId && filesById[r.fileId]?.status === 'ready')));
    return (
        <li className={`rounded-2xl border ${open ? 'border-rotary-blue/40' : 'border-gray-100'} bg-white`} data-testid="lesson" data-has-content={tiene}>
            <div className="flex items-center gap-2 p-3">
                <button type="button" onClick={onToggle} className="flex-1 min-w-0 flex items-center gap-3 text-left" aria-expanded={open}>
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${tiene ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{index + 1}</span>
                    <span className="min-w-0"><span className="block text-sm font-semibold text-gray-800 truncate">{l.title || 'Lección sin título'}</span><span className="block text-[11px] text-gray-500">{l.videoUrl || video ? 'Video' : audio ? 'Audio' : (l.body || '').trim() ? 'Texto' : 'Sin contenido'}{l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}{resources.length ? ` · ${resources.length} recurso(s)` : ''}</span></span>
                </button>
                {editable ? (
                    <div className="flex gap-1 shrink-0">
                        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30" aria-label="Subir lección"><ArrowUp className="w-4 h-4" /></button>
                        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30" aria-label="Bajar lección"><ArrowDown className="w-4 h-4" /></button>
                        <button type="button" onClick={onDelete} className="p-2 rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50" aria-label="Eliminar lección"><Trash2 className="w-4 h-4" /></button>
                    </div>
                ) : null}
            </div>
            {open ? (
                <div className="px-3 pb-4 space-y-3 border-t border-gray-100 pt-3">
                    <div className="grid sm:grid-cols-[1fr_120px] gap-3">
                        <Campo label="Título de la lección"><input className={campo} value={l.title} onChange={e => onPatch({ title: e.target.value })} disabled={!editable} maxLength={160} /></Campo>
                        <Campo label="Duración (min)"><input type="number" min={0} className={campo} value={l.durationMinutes ?? ''} onChange={e => onPatch({ durationMinutes: e.target.value === '' ? null : Number(e.target.value) })} disabled={!editable} /></Campo>
                    </div>
                    <Campo label="Descripción"><input className={campo} value={l.description || ''} onChange={e => onPatch({ description: e.target.value })} disabled={!editable} maxLength={2000} /></Campo>
                    <div className="grid lg:grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <span className="block text-xs font-semibold text-gray-600">Video de la lección</span>
                            {video ? <ArchivoChip f={video} courseId={courseId} onRemove={editable ? () => onPatch({ videoFileId: null }) : undefined} /> : null}
                            <Uploader courseId={courseId} purpose="lesson_video" catalogs={cat} label={video ? 'Reemplazar video' : 'Subir video (MP4 recomendado)'} compact disabled={!editable} onReady={(f) => { onFile(f); onPatch({ videoFileId: f.id, ...(f.durationSeconds && !l.durationMinutes ? { durationMinutes: Math.max(1, Math.round(f.durationSeconds / 60)) } : {}) }); }} />
                            {readyFiles('video').filter(f => f.id !== l.videoFileId && f.purpose === 'lesson_video').length && editable ? (
                                <select className={campo} value="" onChange={e => { if (e.target.value) onPatch({ videoFileId: e.target.value }); }}>
                                    <option value="">…o usar un video ya subido</option>
                                    {readyFiles('video').filter(f => f.purpose === 'lesson_video').map(f => <option key={f.id} value={f.id}>{f.filename}</option>)}
                                </select>
                            ) : null}
                            {allowExternalVideo ? <Campo label="o enlace externo (YouTube / Vimeo)"><input className={campo} value={l.videoUrl || ''} onChange={e => onPatch({ videoUrl: e.target.value })} disabled={!editable} placeholder="https://youtu.be/…" /></Campo> : null}
                            <span className="block text-xs font-semibold text-gray-600 mt-2">Audio (opcional)</span>
                            {audio ? <ArchivoChip f={audio} courseId={courseId} onRemove={editable ? () => onPatch({ audioFileId: null }) : undefined} /> : null}
                            <Uploader courseId={courseId} purpose="lesson_audio" catalogs={cat} label={audio ? 'Reemplazar audio' : 'Subir audio'} compact disabled={!editable} onReady={(f) => { onFile(f); onPatch({ audioFileId: f.id }); }} />
                        </div>
                        <div className="space-y-2">
                            <Campo label="Texto educativo" hint="Explicación, instrucciones, lectura. Cuenta como contenido a partir de 40 caracteres."><textarea className={campo} rows={8} value={l.body || ''} onChange={e => onPatch({ body: e.target.value })} disabled={!editable} maxLength={30000} /></Campo>
                            {modules.length && editable ? <Campo label="Mover a módulo"><select className={campo} value={l.moduleId || ''} onChange={e => onMoveToModule(e.target.value || null)}><option value="">Sin módulo</option>{modules.map(m => <option key={m.id} value={m.id}>{m.title || 'Módulo'}</option>)}</select></Campo> : null}
                        </div>
                    </div>
                    <div>
                        <span className="block text-xs font-semibold text-gray-600 mb-2">Documentos y recursos de esta lección</span>
                        <ul className="space-y-2">{resources.map((r, i, arr) => <RecursoFila key={r.id} r={r} f={r.fileId ? filesById[r.fileId] : undefined} editable={editable} first={i === 0} last={i === arr.length - 1} onMove={() => {}} onDelete={() => onDelResource(r)} onPatch={(v) => onPatchResource(r, v)} />)}</ul>
                        {editable ? (
                            <div className="mt-2 grid sm:grid-cols-2 gap-3">
                                <Uploader courseId={courseId} purpose="document" catalogs={cat} multiple compact label="Subir documento (PDF, Word, PowerPoint)" onReady={(f) => { onFile(f); onAddResource({ fileId: f.id, title: f.filename }); }} />
                                <EnlaceNuevo onAdd={(url, title) => onAddResource({ url, title })} />
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </li>
    );
};

const TarjetaPublica = ({ k, durationMinutes, lessonCount, cat }: { k: Course; durationMinutes: number; lessonCount: number; cat: any }) => (
    <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden max-w-sm">
        {k.coverUrl || k.thumbnailUrl ? <img src={k.thumbnailUrl || k.coverUrl || ''} alt="" className="w-full aspect-[16/9] object-cover" /> : <div className="w-full aspect-[16/9] bg-gradient-to-br from-rotary-blue/90 to-sky-700 flex items-center justify-center"><Film className="w-10 h-10 text-white/80" /></div>}
        <div className="p-5">
            <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-rotary-blue/80">{k.level ? <span>{cat?.levels?.[k.level]}</span> : null}{k.areaFocus ? <span>· {cat?.areas?.[k.areaFocus]}</span> : null}</div>
            <h3 className="font-black text-gray-800 mt-1">{k.title || 'Título del curso'}</h3>
            {k.subtitle ? <p className="text-xs text-gray-500">{k.subtitle}</p> : null}
            <p className="text-xs text-gray-600 mt-2 line-clamp-3">{k.shortDescription || 'Descripción breve del curso.'}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">{k.instructorName ? <span>{k.instructorName}</span> : null}{durationMinutes ? <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{fmtMinutes(durationMinutes)}</span> : null}<span>{lessonCount} lección(es)</span><span>{cat?.accessModes?.[k.accessMode]?.label}</span></div>
            <span className={`${btnPrimario} mt-4 w-full justify-center pointer-events-none`}>Comenzar</span>
        </div>
    </div>
);

/** Cómo verá el estudiante el curso: estructura y la primera lección, con los datos locales. */
const VistaPrevia = ({ data }: { data: CourseView }) => {
    const { course: k, modules, lessons, resources, files } = data;
    const [sel, setSel] = useState<string | null>(lessons[0]?.id || null);
    const l = lessons.find(x => x.id === sel) || lessons[0];
    const filesById = Object.fromEntries(files.map(f => [f.id, f]));
    const [videoUrl, setVideoUrl] = useState('');
    useEffect(() => {
        let vivo = true; setVideoUrl('');
        if (l?.videoFileId && filesById[l.videoFileId]?.status === 'ready') misApi<{ url: string }>(`/cursos/${k.id}/archivos/${l.videoFileId}/url`).then(r => { if (vivo) setVideoUrl(r.url); }).catch(() => {});
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [l?.id, l?.videoFileId]);
    const groups = [...modules.map(m => ({ id: m.id, title: m.title, lessons: lessons.filter(x => x.moduleId === m.id) })), ...(lessons.some(x => !x.moduleId || !modules.some(m => m.id === x.moduleId)) ? [{ id: 'loose', title: modules.length ? 'Otras lecciones' : 'Lecciones', lessons: lessons.filter(x => !x.moduleId || !modules.some(m => m.id === x.moduleId)) }] : [])];
    const embed = l?.videoUrl ? embedUrl(l.videoUrl) : null;
    return (
        <div className="space-y-4">
            <p className="text-xs text-gray-500">Vista previa con los datos actuales del editor. Es lo que verá el estudiante cuando el curso esté publicado.</p>
            <div className="rounded-3xl overflow-hidden bg-gray-900 text-white">
                <div className="grid lg:grid-cols-[1fr_320px]">
                    <div className="bg-black aspect-video flex items-center justify-center">
                        {embed ? <iframe title={l?.title} src={embed} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : videoUrl ? <video src={videoUrl} controls className="w-full h-full" /> : <div className="text-center text-sm text-white/60 p-6">{l ? (l.videoFileId ? 'Cargando video…' : 'Esta lección no tiene video: el estudiante verá el texto y los recursos.') : 'Agrega una lección para previsualizar.'}</div>}
                    </div>
                    <aside className="bg-gray-800 p-4 max-h-[420px] overflow-y-auto">
                        <h3 className="text-sm font-black mb-3">{k.title || 'Curso'}</h3>
                        {groups.map(g => (
                            <div key={g.id} className="mb-3"><p className="text-[11px] uppercase tracking-wide text-white/50 mb-1">{g.title}</p>
                                <ul className="space-y-1">{g.lessons.map((x, i) => <li key={x.id}><button type="button" onClick={() => setSel(x.id)} className={`w-full text-left text-xs rounded-lg px-2 py-1.5 ${x.id === l?.id ? 'bg-white/15 font-semibold' : 'hover:bg-white/10'}`}>{i + 1}. {x.title || 'Lección'}{x.durationMinutes ? <span className="text-white/50"> · {x.durationMinutes} min</span> : null}</button></li>)}</ul>
                            </div>
                        ))}
                    </aside>
                </div>
            </div>
            {l ? (
                <div className={TARJETA}>
                    <h3 className="text-lg font-black text-gray-800">{l.title}</h3>
                    {l.description ? <p className="text-sm text-gray-600 mt-1">{l.description}</p> : null}
                    {l.body ? <div className="prose prose-sm max-w-none mt-4 whitespace-pre-wrap text-gray-700">{l.body}</div> : null}
                    {resources.filter(r => r.lessonId === l.id).length ? <div className="mt-4"><h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Materiales</h4><ul className="mt-2 space-y-1 text-sm">{resources.filter(r => r.lessonId === l.id).map(r => <li key={r.id} className="flex items-center gap-2"><FileText className="w-4 h-4 text-rotary-blue" />{r.title}</li>)}</ul></div> : null}
                </div>
            ) : null}
        </div>
    );
};
const embedUrl = (url: string) => {
    let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
    return null;
};

export default CourseEditor;
