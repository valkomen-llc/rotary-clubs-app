/**
 * Cursos y capacitaciones — la biblioteca educativa pública (v4.1302.0)
 *
 * `/cursos`. Muestra ÚNICAMENTE cursos publicados visibles para este sitio
 * (los suyos; un distrito, también los de sus clubes). Los cursos privados
 * por invitación no se listan. Filtros: texto, tema (etiqueta), club,
 * proyecto, área de interés y modalidad de acceso.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Clock, GraduationCap, Loader2, Search, Lock, Users, Globe } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { PublicPageHeader } from '../components/common/PublicInstitutionalComponents';
import { useClub } from '../contexts/ClubContext';
import { useSEO } from '../hooks/useSEO';
import { publicApi, fmtMinutes } from '../lib/learningClient';

export const Shell = ({ children }: { children: ReactNode }) => (
    <div className="min-h-screen bg-rotary-concrete flex flex-col font-sans text-gray-800">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
    </div>
);

export interface PublicCard { id: string; slug: string; title: string; subtitle: string; shortDescription: string; coverUrl: string; thumbnailUrl: string; level: string; levelLabel: string; areaFocus: string; areaLabel: string; accessMode: string; accessLabel: string; audience: string[]; tags: string[]; instructorName: string; durationMinutes: number; lessonCount: number; ownerClubName: string; projectRef: string; collectionSlug: string | null; collectionName: string | null; publishedAt: string | null }
interface Catalog { site: { id: string; name: string; type: string; district: string | null } | null; intro: string; courses: PublicCard[]; collections: { id: string; slug: string; name: string; description: string; coverUrl: string; projectRef: string; ownerClubName: string; publishedCount: number; areaLabel: string }[]; facets: { areas: { id: string; label: string }[]; clubs: string[]; tags: string[]; accessModes: { id: string; label: string }[]; projects: string[] } }

export const AccessIcon = ({ mode, className = 'w-3.5 h-3.5' }: { mode: string; className?: string }) => mode === 'public' ? <Globe className={className} /> : mode === 'private' ? <Lock className={className} /> : <Users className={className} />;

export const TarjetaCurso = ({ k, invite }: { k: PublicCard; invite?: string }) => (
    <li className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col" data-testid="public-course">
        <Link to={`/cursos/${k.slug}${invite ? `?invite=${invite}` : ''}`} className="block">
            {k.thumbnailUrl || k.coverUrl ? <img src={k.thumbnailUrl || k.coverUrl} alt="" className="w-full aspect-[16/9] object-cover" loading="lazy" /> : <div className="w-full aspect-[16/9] bg-gradient-to-br from-rotary-blue/90 to-sky-700 flex items-center justify-center"><GraduationCap className="w-10 h-10 text-white/80" /></div>}
        </Link>
        <div className="p-5 flex flex-col flex-1">
            <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-rotary-blue/80">{k.levelLabel ? <span>{k.levelLabel}</span> : null}{k.areaLabel ? <span>· {k.areaLabel}</span> : null}</div>
            <h3 className="font-black text-gray-800 mt-1 leading-snug"><Link to={`/cursos/${k.slug}${invite ? `?invite=${invite}` : ''}`}>{k.title}</Link></h3>
            {k.subtitle ? <p className="text-xs text-gray-500">{k.subtitle}</p> : null}
            <p className="text-xs text-gray-600 mt-2 line-clamp-3 flex-1">{k.shortDescription}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                {k.ownerClubName ? <span>{k.ownerClubName}</span> : null}
                {k.durationMinutes ? <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{fmtMinutes(k.durationMinutes)}</span> : null}
                <span>{k.lessonCount} lección(es)</span>
                <span className="inline-flex items-center gap-1"><AccessIcon mode={k.accessMode} />{k.accessLabel}</span>
            </div>
            <Link to={`/cursos/${k.slug}${invite ? `?invite=${invite}` : ''}`} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-rotary-blue text-white px-4 py-2 text-sm font-semibold hover:bg-rotary-navy">Ver curso</Link>
        </div>
    </li>
);

const campo = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue';

const CursosBiblioteca = () => {
    const { club } = useClub();
    const [params, setParams] = useSearchParams();
    const [data, setData] = useState<Catalog | null>(null);
    const [error, setError] = useState('');
    const [q, setQ] = useState(params.get('q') || '');
    useSEO({ title: 'Cursos y capacitaciones', description: `Cursos y materiales educativos de ${club?.name || 'este sitio'} para la comunidad.`, path: '/cursos' });

    const filtros = useMemo(() => ({ q: params.get('q') || '', area: params.get('area') || '', access: params.get('access') || '', club: params.get('club') || '', tag: params.get('tag') || '', project: params.get('proyecto') || '' }), [params]);
    const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

    useEffect(() => {
        if (!club?.id) return;
        let vivo = true;
        const qs = new URLSearchParams({ clubId: club.id, ...(filtros.q ? { q: filtros.q } : {}), ...(filtros.area ? { area: filtros.area } : {}), ...(filtros.access ? { access: filtros.access } : {}), ...(filtros.club ? { club: filtros.club } : {}), ...(filtros.tag ? { tag: filtros.tag } : {}) });
        publicApi<Catalog>(`/catalogo?${qs}`).then(d => { if (vivo) { setData(d); setError(''); } }).catch(e => { if (vivo) { setError(e?.message || 'No se pudo cargar la biblioteca.'); setData({ site: null, intro: '', courses: [], collections: [], facets: { areas: [], clubs: [], tags: [], accessModes: [], projects: [] } }); } });
        return () => { vivo = false; };
    }, [club?.id, filtros]);

    const cursos = (data?.courses || []).filter(k => !filtros.project || k.projectRef === filtros.project);
    const hayFiltros = Boolean(filtros.q || filtros.area || filtros.access || filtros.club || filtros.tag || filtros.project);

    return (
        <Shell>
            <PublicPageHeader title="Cursos y capacitaciones" subtitle={data?.intro || `Cursos y materiales educativos que ${club?.name || 'nuestra organización'} y sus clubes ponen al servicio de la comunidad.`} />
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
                <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-rotary-blue hover:underline mb-6"><ArrowLeft className="w-4 h-4" /> Volver al inicio</Link>

                {/* Buscador y filtros */}
                <form className="rounded-3xl bg-white border border-gray-100 shadow-sm p-4 sm:p-5 mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={e => { e.preventDefault(); set('q', q.trim()); }} role="search" aria-label="Buscar cursos">
                    <label className="lg:col-span-2 relative"><span className="sr-only">Buscar</span><Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" /><input className={`${campo} pl-9`} placeholder="Buscar cursos, temas, proyectos…" value={q} onChange={e => setQ(e.target.value)} /></label>
                    <select className={campo} value={filtros.area} onChange={e => set('area', e.target.value)} aria-label="Área de interés"><option value="">Área de interés</option>{data?.facets.areas.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
                    <select className={campo} value={filtros.club} onChange={e => set('club', e.target.value)} aria-label="Club"><option value="">Club</option>{data?.facets.clubs.map(c => <option key={c} value={c}>{c}</option>)}</select>
                    <select className={campo} value={filtros.project} onChange={e => set('proyecto', e.target.value)} aria-label="Proyecto"><option value="">Proyecto</option>{data?.facets.projects.map(c => <option key={c} value={c}>{c}</option>)}</select>
                    <select className={campo} value={filtros.access} onChange={e => set('access', e.target.value)} aria-label="Modalidad de acceso"><option value="">Acceso</option>{data?.facets.accessModes.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
                    {data?.facets.tags.length ? <div className="sm:col-span-2 lg:col-span-6 flex flex-wrap gap-1.5">{data.facets.tags.map(t => <button type="button" key={t} onClick={() => set('tag', filtros.tag === t ? '' : t)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filtros.tag === t ? 'border-rotary-blue bg-blue-50 text-rotary-blue' : 'border-gray-200 text-gray-600 hover:border-blue-200'}`}>{t}</button>)}{hayFiltros ? <button type="button" onClick={() => setParams({}, { replace: true })} className="text-xs text-gray-500 underline ml-2">Limpiar filtros</button> : null}</div> : null}
                </form>

                {!data && !error ? <div className="flex items-center gap-2 text-gray-500 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div> : null}
                {error ? <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</p> : null}

                {data && data.collections.length && !hayFiltros ? (
                    <section className="mb-10" aria-labelledby="colecciones">
                        <h2 id="colecciones" className="text-lg font-black text-gray-800 mb-3">Colecciones</h2>
                        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {data.collections.map(c => (
                                <li key={c.id} className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col" data-testid="public-collection">
                                    <Link to={`/cursos/colecciones/${c.slug}`} className="block">{c.coverUrl ? <img src={c.coverUrl} alt="" className="w-full aspect-[16/9] object-cover" loading="lazy" /> : <div className="w-full aspect-[16/9] bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center"><BookOpen className="w-10 h-10 text-white/80" /></div>}</Link>
                                    <div className="p-5 flex flex-col flex-1">
                                        {c.projectRef ? <span className="text-[10px] font-semibold uppercase tracking-wide text-rotary-blue/80">Proyecto {c.projectRef}</span> : null}
                                        <h3 className="font-black text-gray-800 mt-1"><Link to={`/cursos/colecciones/${c.slug}`}>{c.name}</Link></h3>
                                        <p className="text-xs text-gray-600 mt-2 line-clamp-3 flex-1">{c.description}</p>
                                        <p className="text-[11px] text-gray-500 mt-3">{c.ownerClubName}{c.ownerClubName ? ' · ' : ''}{c.publishedCount} curso(s)</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {data ? (
                    <section aria-labelledby="cursos">
                        <h2 id="cursos" className="text-lg font-black text-gray-800 mb-3">{hayFiltros ? `Resultados (${cursos.length})` : 'Todos los cursos'}</h2>
                        {cursos.length ? <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{cursos.map(k => <TarjetaCurso key={k.id} k={k} />)}</ul> : (
                            <div className="text-center py-16 text-gray-500"><GraduationCap className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="font-medium text-gray-700">{hayFiltros ? 'Ningún curso coincide con los filtros.' : 'Todavía no hay cursos publicados en este sitio.'}</p></div>
                        )}
                    </section>
                ) : null}
            </div>
        </Shell>
    );
};

export default CursosBiblioteca;
