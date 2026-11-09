/**
 * La FICHA pública de un curso (v4.1302.0) — `/cursos/:slug`.
 * Portada, título, descripción, club, proyecto, instructor, duración,
 * temario, recursos y el botón «Comenzar», que decide el servidor según la
 * modalidad de acceso (público, registrados, rotarios, invitación).
 */
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, GraduationCap, Loader2, Play, FileText, LogIn, Lock, Layers, Users, Eye } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { publicApi, fmtMinutes } from '../lib/learningClient';
import { Shell, AccessIcon } from './CursosBiblioteca';

interface Ficha {
    course: { id: string; slug: string; title: string; subtitle: string; shortDescription: string; fullDescription: string; learningObjective: string; coverUrl: string; thumbnailUrl: string; levelLabel: string; areaLabel: string; accessMode: string; accessLabel: string; audienceLabels: string[]; tags: string[]; instructorName: string; instructorBio: string; instructorImageUrl: string; organization: string; durationMinutes: number; lessonCount: number; ownerClubName: string; projectRef: string; languageLabel: string; introEmbed: { embedUrl: string } | null; introVideoFileId: string | null; viewCount: number };
    syllabus: { id: string | null; title: string; description: string; lessons: { id: string; title: string; durationMinutes: number; hasVideo: boolean }[] }[];
    resources: { id: string; title: string; description: string; kind: string }[];
    access: { allowed: boolean; reason: string; message: string; accessMode: string; accessLabel: string };
    collection: { slug: string; name: string; projectRef: string } | null;
}

const CursoPublico = () => {
    const { slug = '' } = useParams();
    const [params] = useSearchParams();
    const loc = useLocation();
    const invite = params.get('invite') || '';
    const [data, setData] = useState<Ficha | null>(null);
    const [error, setError] = useState<{ message: string; reason?: string } | null>(null);
    const [introUrl, setIntroUrl] = useState('');
    useSEO({ title: data?.course?.title || 'Curso', description: data?.course?.shortDescription || 'Curso', path: `/cursos/${slug}`, image: data?.course?.coverUrl || undefined, noindex: data?.course?.accessMode === 'private' });

    useEffect(() => {
        let vivo = true; setData(null); setError(null);
        publicApi<Ficha>(`/cursos/${encodeURIComponent(slug)}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`).then(d => { if (vivo) setData(d); }).catch(e => { if (vivo) setError({ message: e?.message || 'No se pudo abrir el curso.', reason: e?.extra?.reason }); });
        return () => { vivo = false; };
    }, [slug, invite]);
    useEffect(() => {
        if (!data?.course.introVideoFileId || !data.access.allowed) return;
        let vivo = true;
        publicApi<{ url: string }>(`/cursos/${encodeURIComponent(slug)}/archivos/${data.course.introVideoFileId}/url${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`).then(r => { if (vivo) setIntroUrl(r.url); }).catch(() => {});
        return () => { vivo = false; };
    }, [data, slug, invite]);

    if (error) return (
        <Shell><div className="max-w-xl mx-auto px-4 py-20 text-center">
            <Lock className="w-10 h-10 mx-auto text-gray-300" />
            <h1 className="text-xl font-black text-gray-800 mt-4">{error.reason === 'invite' ? 'Curso privado' : 'No se pudo abrir el curso'}</h1>
            <p role="alert" className="text-sm text-gray-600 mt-2">{error.message}</p>
            <Link to="/cursos" className="inline-flex items-center gap-2 text-sm text-rotary-blue mt-6 hover:underline"><ArrowLeft className="w-4 h-4" /> Ir a la biblioteca</Link>
        </div></Shell>
    );
    if (!data) return <Shell><div className="flex items-center gap-2 text-gray-500 py-32 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div></Shell>;

    const { course: k, syllabus, resources, access, collection } = data;
    const aprender = `/cursos/${k.slug}/aprender${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`;
    const total = syllabus.reduce((a, m) => a + m.lessons.length, 0);

    return (
        <Shell>
            <section className="relative bg-rotary-navy text-white">
                {k.coverUrl ? <img src={k.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" /> : null}
                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-16 grid lg:grid-cols-[1fr_380px] gap-8 items-start">
                    <div>
                        <Link to={collection ? `/cursos/colecciones/${collection.slug}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}` : '/cursos'} className="inline-flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white mb-5"><ArrowLeft className="w-4 h-4" /> {collection ? collection.name : 'Cursos y capacitaciones'}</Link>
                        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/70">{k.levelLabel ? <span>{k.levelLabel}</span> : null}{k.areaLabel ? <span>· {k.areaLabel}</span> : null}{k.projectRef ? <span>· Proyecto {k.projectRef}</span> : null}</div>
                        <h1 className="text-3xl md:text-4xl font-black mt-2 leading-tight">{k.title}</h1>
                        {k.subtitle ? <p className="text-lg text-white/85 mt-2">{k.subtitle}</p> : null}
                        <p className="text-white/85 mt-4 max-w-3xl leading-relaxed">{k.shortDescription}</p>
                        <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
                            {k.ownerClubName ? <div><dt className="sr-only">Club</dt><dd className="inline-flex items-center gap-1.5"><Users className="w-4 h-4" />{k.ownerClubName}</dd></div> : null}
                            {k.instructorName ? <div><dt className="sr-only">Instructor</dt><dd className="inline-flex items-center gap-1.5"><GraduationCap className="w-4 h-4" />{k.instructorName}</dd></div> : null}
                            {k.durationMinutes ? <div><dt className="sr-only">Duración</dt><dd className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4" />{fmtMinutes(k.durationMinutes)}</dd></div> : null}
                            <div><dt className="sr-only">Lecciones</dt><dd className="inline-flex items-center gap-1.5"><Layers className="w-4 h-4" />{total} lección(es)</dd></div>
                            <div><dt className="sr-only">Acceso</dt><dd className="inline-flex items-center gap-1.5"><AccessIcon mode={k.accessMode} className="w-4 h-4" />{k.accessLabel}</dd></div>
                            {k.viewCount ? <div><dt className="sr-only">Vistas</dt><dd className="inline-flex items-center gap-1.5"><Eye className="w-4 h-4" />{k.viewCount}</dd></div> : null}
                        </dl>
                    </div>
                    <div className="rounded-3xl bg-white text-gray-800 shadow-xl overflow-hidden">
                        {k.introEmbed ? <iframe title="Video introductorio" src={k.introEmbed.embedUrl} className="w-full aspect-video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : introUrl ? <video src={introUrl} controls className="w-full aspect-video bg-black" poster={k.coverUrl || undefined} /> : (k.thumbnailUrl || k.coverUrl) ? <img src={k.thumbnailUrl || k.coverUrl} alt="" className="w-full aspect-video object-cover" /> : <div className="w-full aspect-video bg-gradient-to-br from-rotary-blue/90 to-sky-700 flex items-center justify-center"><GraduationCap className="w-12 h-12 text-white/80" /></div>}
                        <div className="p-5">
                            {access.allowed ? (
                                <Link to={aprender} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rotary-blue text-white px-4 py-3 text-sm font-bold hover:bg-rotary-navy" data-testid="start-course"><Play className="w-4 h-4" /> Comenzar el curso</Link>
                            ) : (
                                <div>
                                    <p className="text-sm text-gray-700">{access.message}</p>
                                    {access.reason === 'login' || access.reason === 'rotarian_login' ? <Link to={`/login?redirect=${encodeURIComponent(loc.pathname + loc.search)}`} className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rotary-blue text-white px-4 py-3 text-sm font-bold"><LogIn className="w-4 h-4" /> Iniciar sesión</Link> : null}
                                </div>
                            )}
                            <ul className="mt-4 text-xs text-gray-500 space-y-1">
                                {k.languageLabel ? <li>Idioma: {k.languageLabel}</li> : null}
                                {k.audienceLabels.length ? <li>Dirigido a: {k.audienceLabels.join(', ')}</li> : null}
                                {k.organization ? <li>Organización: {k.organization}</li> : null}
                                <li>Acceso: {k.accessLabel}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-[1fr_340px] gap-8">
                <div className="space-y-8">
                    {k.learningObjective ? <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6"><h2 className="text-lg font-black text-gray-800">Qué aprenderás</h2><p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{k.learningObjective}</p></section> : null}
                    {k.fullDescription ? <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6"><h2 className="text-lg font-black text-gray-800">Sobre este curso</h2><div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap leading-relaxed">{k.fullDescription}</div></section> : null}
                    <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6" aria-labelledby="temario">
                        <h2 id="temario" className="text-lg font-black text-gray-800">Temario</h2>
                        {syllabus.length ? (
                            <ol className="mt-4 space-y-4">
                                {syllabus.map((m, mi) => (
                                    <li key={m.id || `loose-${mi}`}>
                                        <h3 className="text-sm font-bold text-gray-800">{syllabus.length > 1 || m.id ? `${mi + 1}. ` : ''}{m.title}</h3>
                                        {m.description ? <p className="text-xs text-gray-500 mt-0.5">{m.description}</p> : null}
                                        <ul className="mt-2 divide-y divide-gray-100 rounded-2xl border border-gray-100">
                                            {m.lessons.map((l, li) => <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span className="inline-flex items-center gap-2 text-gray-700">{l.hasVideo ? <Play className="w-3.5 h-3.5 text-rotary-blue" /> : <FileText className="w-3.5 h-3.5 text-gray-400" />}{li + 1}. {l.title}</span>{l.durationMinutes ? <span className="text-xs text-gray-400">{l.durationMinutes} min</span> : null}</li>)}
                                        </ul>
                                    </li>
                                ))}
                            </ol>
                        ) : <p className="text-sm text-gray-500 mt-2">El temario se publicará próximamente.</p>}
                    </section>
                </div>
                <aside className="space-y-6">
                    {k.instructorName ? (
                        <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6">
                            <h2 className="text-sm font-black text-gray-800">Instructor</h2>
                            <div className="flex items-center gap-3 mt-3">{k.instructorImageUrl ? <img src={k.instructorImageUrl} alt="" className="w-14 h-14 rounded-full object-cover" /> : <div className="w-14 h-14 rounded-full bg-blue-50 text-rotary-blue flex items-center justify-center"><GraduationCap className="w-6 h-6" /></div>}<div><p className="font-semibold text-gray-800">{k.instructorName}</p>{k.organization ? <p className="text-xs text-gray-500">{k.organization}</p> : null}</div></div>
                            {k.instructorBio ? <p className="text-xs text-gray-600 mt-3 whitespace-pre-wrap">{k.instructorBio}</p> : null}
                        </section>
                    ) : null}
                    {resources.length ? (
                        <section className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6">
                            <h2 className="text-sm font-black text-gray-800">Recursos del curso</h2>
                            <ul className="mt-3 space-y-2">{resources.map(r => <li key={r.id} className="flex items-start gap-2 text-sm text-gray-700"><FileText className="w-4 h-4 text-rotary-blue mt-0.5 shrink-0" /><span>{r.title}{r.description ? <span className="block text-xs text-gray-500">{r.description}</span> : null}</span></li>)}</ul>
                            <p className="text-[11px] text-gray-400 mt-3">Se descargan desde el curso{access.allowed ? '' : ', una vez tengas acceso'}.</p>
                        </section>
                    ) : null}
                    {k.tags.length ? <div className="flex flex-wrap gap-1.5">{k.tags.map(t => <Link key={t} to={`/cursos?tag=${encodeURIComponent(t)}`} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:border-blue-200">{t}</Link>)}</div> : null}
                </aside>
            </div>
        </Shell>
    );
};

export default CursoPublico;
