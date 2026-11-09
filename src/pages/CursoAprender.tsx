/**
 * La interfaz de aprendizaje (v4.1302.0) — `/cursos/:slug/aprender`.
 *
 * Panel principal: reproductor de video o contenido de la lección.
 * Panel lateral: módulos y lecciones. Área complementaria: descripción y
 * materiales descargables. Navegación anterior/siguiente.
 *
 * En Fase 1 el progreso se recuerda en ESTE navegador (localStorage), sin
 * cuenta. El progreso sincronizado por estudiante es Fase 2 y no se simula.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Download, ExternalLink, FileText, Loader2, Lock, LogIn, Menu, X } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { publicApi, fmtMinutes, fmtBytes } from '../lib/learningClient';

interface FileRef { id: string; filename: string; kind: string; contentType: string | null; bytes: number }
interface Res { id: string; title: string; description: string; kind: string; url: string; file: FileRef | null }
interface Lesson { id: string; moduleId: string | null; title: string; description: string; body: string; durationMinutes: number; videoUrl: string; embed: { embedUrl: string } | null; videoFile: FileRef | null; audioFile: FileRef | null; resources: Res[]; hasContent: boolean }
interface Learn { course: { id: string; slug: string; title: string; subtitle: string; coverUrl: string; instructorName: string; ownerClubName: string; durationMinutes: number }; modules: { id: string | null; title: string; description: string; lessons: Lesson[] }[]; resources: Res[]; collection: { slug: string; name: string } | null }

const doneKey = (slug: string) => `learning-done:${slug}`;
const readDone = (slug: string): string[] => { try { return JSON.parse(localStorage.getItem(doneKey(slug)) || '[]'); } catch { return []; } };

const CursoAprender = () => {
    const { slug = '' } = useParams();
    const [params, setParams] = useSearchParams();
    const loc = useLocation();
    const invite = params.get('invite') || '';
    const [data, setData] = useState<Learn | null>(null);
    const [error, setError] = useState<{ message: string; reason?: string } | null>(null);
    const [menu, setMenu] = useState(false);
    const [done, setDone] = useState<string[]>(() => readDone(slug));
    const [mediaUrl, setMediaUrl] = useState<{ id: string; url: string } | null>(null);
    useSEO({ title: data ? `${data.course.title} · Aprender` : 'Curso', description: data?.course.subtitle || 'Curso', path: `/cursos/${slug}/aprender`, noindex: true });

    const inv = invite ? `?invite=${encodeURIComponent(invite)}` : '';
    useEffect(() => {
        let vivo = true;
        publicApi<Learn>(`/cursos/${encodeURIComponent(slug)}/aprender${inv}`).then(d => { if (vivo) setData(d); }).catch(e => { if (vivo) setError({ message: e?.message || 'No se pudo abrir el curso.', reason: e?.extra?.reason }); });
        return () => { vivo = false; };
    }, [slug, inv]);

    const lessons = useMemo(() => (data?.modules || []).flatMap(m => m.lessons), [data]);
    const current = params.get('leccion') || lessons[0]?.id || '';
    const lesson = lessons.find(l => l.id === current) || lessons[0];
    const idx = lesson ? lessons.indexOf(lesson) : -1;
    const go = useCallback((id: string) => { const p = new URLSearchParams(params); p.set('leccion', id); setParams(p, { replace: false }); setMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [params, setParams]);

    useEffect(() => {
        const f = lesson?.videoFile || lesson?.audioFile;
        if (!lesson || !f) { setMediaUrl(null); return; }
        let vivo = true;
        publicApi<{ url: string }>(`/cursos/${encodeURIComponent(slug)}/archivos/${f.id}/url${inv}`).then(r => { if (vivo) setMediaUrl({ id: f.id, url: r.url }); }).catch(() => { if (vivo) setMediaUrl(null); });
        return () => { vivo = false; };
    }, [lesson?.id, lesson?.videoFile?.id, lesson?.audioFile?.id, slug, inv]); // eslint-disable-line react-hooks/exhaustive-deps

    const marcar = (id: string, v: boolean) => { const next = v ? Array.from(new Set([...done, id])) : done.filter(x => x !== id); setDone(next); try { localStorage.setItem(doneKey(slug), JSON.stringify(next)); } catch { /* sin almacenamiento */ } };
    const descargar = async (f: FileRef) => {
        try { const r = await publicApi<{ url: string }>(`/cursos/${encodeURIComponent(slug)}/archivos/${f.id}/url${inv}${inv ? '&' : '?'}download=1`); window.open(r.url, '_blank', 'noopener'); } catch { /* el enlace caducó o el acceso cambió */ }
    };

    if (error) return (
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
            <div className="max-w-md text-center">
                <Lock className="w-10 h-10 mx-auto text-white/40" />
                <h1 className="text-xl font-black mt-4">{error.reason === 'invite' ? 'Curso privado' : 'No se pudo abrir el curso'}</h1>
                <p role="alert" className="text-sm text-white/70 mt-2">{error.message}</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                    {error.reason === 'login' || error.reason === 'rotarian_login' ? <Link to={`/login?redirect=${encodeURIComponent(loc.pathname + loc.search)}`} className="inline-flex items-center gap-2 rounded-xl bg-white text-gray-900 px-4 py-2 text-sm font-bold"><LogIn className="w-4 h-4" /> Iniciar sesión</Link> : null}
                    <Link to={`/cursos/${slug}${inv}`} className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold"><ArrowLeft className="w-4 h-4" /> Ficha del curso</Link>
                </div>
            </div>
        </div>
    );
    if (!data) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div>;

    const completadas = lessons.filter(l => done.includes(l.id)).length;
    const Media = () => {
        if (!lesson) return <div className="text-white/60 text-sm p-8 text-center">Este curso todavía no tiene lecciones.</div>;
        if (lesson.embed) return <iframe key={lesson.id} title={lesson.title} src={lesson.embed.embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />;
        if (lesson.videoUrl && !lesson.embed) return <div className="p-8 text-center"><a href={lesson.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white text-gray-900 px-4 py-2 text-sm font-bold"><ExternalLink className="w-4 h-4" /> Abrir el video externo</a></div>;
        if (lesson.videoFile) return mediaUrl?.id === lesson.videoFile.id ? <video key={mediaUrl.url} src={mediaUrl.url} controls autoPlay={false} className="w-full h-full bg-black" controlsList="nodownload" onEnded={() => marcar(lesson.id, true)} /> : <div className="flex items-center justify-center h-full text-white/60 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Preparando el video…</div>;
        if (lesson.audioFile) return <div className="flex flex-col items-center justify-center h-full p-8 gap-4">{data.course.coverUrl ? <img src={data.course.coverUrl} alt="" className="w-32 h-32 rounded-2xl object-cover" /> : null}{mediaUrl?.id === lesson.audioFile.id ? <audio key={mediaUrl.url} src={mediaUrl.url} controls className="w-full max-w-md" onEnded={() => marcar(lesson.id, true)} /> : <span className="text-white/60 text-sm">Preparando el audio…</span>}</div>;
        return <div className="flex items-center justify-center h-full p-8 text-center"><div><FileText className="w-10 h-10 mx-auto text-white/40" /><p className="text-sm text-white/70 mt-3">Esta lección es de lectura: el contenido está debajo.</p></div></div>;
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col">
            <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-gray-900">
                <Link to={`/cursos/${slug}${inv}`} className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"><ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Ficha del curso</span></Link>
                <div className="flex-1 min-w-0"><h1 className="text-sm sm:text-base font-black truncate">{data.course.title}</h1><p className="text-[11px] text-white/60 truncate">{data.course.ownerClubName}{data.course.instructorName ? ` · ${data.course.instructorName}` : ''} · {completadas}/{lessons.length} lecciones vistas</p></div>
                <button type="button" onClick={() => setMenu(m => !m)} className="lg:hidden p-2 rounded-lg border border-white/20" aria-label="Contenido del curso" aria-expanded={menu}>{menu ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}</button>
            </header>
            <div className="flex-1 grid lg:grid-cols-[1fr_340px]">
                <main className="min-w-0">
                    <div className="bg-black aspect-video w-full"><Media /></div>
                    {lesson ? (
                        <div className="px-4 sm:px-8 py-6 max-w-4xl">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div><p className="text-[11px] uppercase tracking-wide text-white/50">Lección {idx + 1} de {lessons.length}{lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ''}</p><h2 className="text-xl sm:text-2xl font-black mt-1">{lesson.title}</h2>{lesson.description ? <p className="text-sm text-white/70 mt-1">{lesson.description}</p> : null}</div>
                                <button type="button" onClick={() => marcar(lesson.id, !done.includes(lesson.id))} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold border ${done.includes(lesson.id) ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200' : 'border-white/20 text-white/80 hover:bg-white/10'}`}>{done.includes(lesson.id) ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}{done.includes(lesson.id) ? 'Lección vista' : 'Marcar como vista'}</button>
                            </div>
                            {lesson.body ? <article className="mt-6 text-sm sm:text-base leading-relaxed text-white/85 whitespace-pre-wrap">{lesson.body}</article> : null}
                            {lesson.resources.length ? (
                                <section className="mt-8"><h3 className="text-xs font-bold uppercase tracking-wide text-white/50">Materiales de esta lección</h3>
                                    <ul className="mt-3 space-y-2">{lesson.resources.map(r => <RecursoItem key={r.id} r={r} onDownload={descargar} />)}</ul>
                                </section>
                            ) : null}
                            <nav className="mt-10 flex items-center justify-between gap-3" aria-label="Navegación entre lecciones">
                                <button type="button" disabled={idx <= 0} onClick={() => go(lessons[idx - 1].id)} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold disabled:opacity-30 hover:bg-white/10"><ArrowLeft className="w-4 h-4" /> Anterior</button>
                                <button type="button" disabled={idx >= lessons.length - 1} onClick={() => { marcar(lesson.id, true); go(lessons[idx + 1].id); }} className="inline-flex items-center gap-2 rounded-xl bg-white text-gray-900 px-4 py-2 text-sm font-bold disabled:opacity-30">Siguiente lección <ArrowRight className="w-4 h-4" /></button>
                            </nav>
                        </div>
                    ) : null}
                    {data.resources.length ? (
                        <section className="px-4 sm:px-8 pb-10 max-w-4xl"><h3 className="text-xs font-bold uppercase tracking-wide text-white/50">Recursos complementarios del curso</h3><ul className="mt-3 space-y-2">{data.resources.map(r => <RecursoItem key={r.id} r={r} onDownload={descargar} />)}</ul></section>
                    ) : null}
                    <p className="px-4 sm:px-8 pb-8 text-[11px] text-white/40 max-w-4xl">Las lecciones marcadas como vistas se recuerdan en este navegador. El progreso por estudiante con cuenta y los certificados llegarán en fases posteriores.</p>
                </main>
                <aside className={`${menu ? 'block' : 'hidden'} lg:block border-l border-white/10 bg-gray-900 lg:max-h-[calc(100vh-57px)] lg:overflow-y-auto lg:sticky lg:top-0`} aria-label="Contenido del curso">
                    <div className="p-4">
                        <div className="flex items-center justify-between text-xs text-white/60"><span>Contenido del curso</span><span>{fmtMinutes(data.course.durationMinutes)}</span></div>
                        <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${lessons.length ? Math.round((completadas / lessons.length) * 100) : 0}%` }} /></div>
                    </div>
                    {data.modules.map((m, mi) => (
                        <div key={m.id || `loose-${mi}`} className="border-t border-white/10">
                            <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-white/50">{data.modules.length > 1 ? `${mi + 1}. ` : ''}{m.title}</p>
                            <ul className="pb-2">
                                {m.lessons.map((l) => { const n = lessons.indexOf(l) + 1; const activa = l.id === lesson?.id; return (
                                    <li key={l.id}><button type="button" onClick={() => go(l.id)} aria-current={activa ? 'true' : undefined} className={`w-full text-left px-4 py-2.5 flex items-start gap-3 text-sm ${activa ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                                        <span className="mt-0.5 shrink-0">{done.includes(l.id) ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-white/30" />}</span>
                                        <span className="min-w-0"><span className={`block ${activa ? 'font-semibold' : 'text-white/85'}`}>{n}. {l.title}</span><span className="block text-[11px] text-white/50">{l.embed || l.videoUrl || l.videoFile ? 'Video' : l.audioFile ? 'Audio' : 'Lectura'}{l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}</span></span>
                                    </button></li>
                                ); })}
                            </ul>
                        </div>
                    ))}
                </aside>
            </div>
        </div>
    );
};

const RecursoItem = ({ r, onDownload }: { r: Res; onDownload: (f: FileRef) => void }) => (
    <li className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm">
        <FileText className="w-4 h-4 text-sky-300 shrink-0" />
        <span className="flex-1 min-w-0"><span className="block truncate">{r.title}</span>{r.description ? <span className="block text-[11px] text-white/50 truncate">{r.description}</span> : null}{r.file ? <span className="block text-[11px] text-white/40">{fmtBytes(r.file.bytes)}</span> : null}</span>
        {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-white shrink-0"><ExternalLink className="w-3.5 h-3.5" /> Abrir</a> : null}
        {r.file ? <button type="button" onClick={() => onDownload(r.file!)} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-white shrink-0"><Download className="w-3.5 h-3.5" /> Descargar</button> : null}
    </li>
);

export default CursoAprender;
