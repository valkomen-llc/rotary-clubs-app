/**
 * La página pública de una colección de cursos (v4.1302.0)
 * `/cursos/colecciones/:slug`. Sólo lista cursos publicados; los privados
 * aparecen únicamente con el enlace de invitación de la colección.
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { publicApi } from '../lib/learningClient';
import { Shell, TarjetaCurso, type PublicCard } from './CursosBiblioteca';

interface View { collection: { slug: string; name: string; description: string; coverUrl: string; projectRef: string; ownerClubName: string; areaLabel: string; audience: string[]; accessMode: string }; courses: PublicCard[] }

const ColeccionPublica = () => {
    const { slug = '' } = useParams();
    const [params] = useSearchParams();
    const invite = params.get('invite') || '';
    const [data, setData] = useState<View | null>(null);
    const [error, setError] = useState('');
    useSEO({ title: data?.collection?.name || 'Colección de cursos', description: data?.collection?.description || 'Colección de cursos.', path: `/cursos/colecciones/${slug}`, image: data?.collection?.coverUrl || undefined });

    useEffect(() => {
        let vivo = true;
        publicApi<View>(`/colecciones/${encodeURIComponent(slug)}${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`).then(d => { if (vivo) setData(d); }).catch(e => { if (vivo) setError(e?.message || 'No se pudo abrir la colección.'); });
        return () => { vivo = false; };
    }, [slug, invite]);

    const c = data?.collection;
    return (
        <Shell>
            {c ? (
                <section className="relative bg-rotary-navy text-white">
                    {c.coverUrl ? <img src={c.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" /> : null}
                    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20">
                        <Link to="/cursos" className="inline-flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white mb-6"><ArrowLeft className="w-4 h-4" /> Cursos y capacitaciones</Link>
                        {c.projectRef ? <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Proyecto {c.projectRef}{c.areaLabel ? ` · ${c.areaLabel}` : ''}</p> : null}
                        <h1 className="text-3xl md:text-4xl font-black mt-2">{c.name}</h1>
                        {c.description ? <p className="text-white/85 mt-4 max-w-3xl leading-relaxed">{c.description}</p> : null}
                        <p className="text-sm text-white/70 mt-4">{c.ownerClubName ? `Un programa de ${c.ownerClubName}` : ''}{c.ownerClubName && data ? ' · ' : ''}{data ? `${data.courses.length} curso(s) disponibles` : ''}</p>
                    </div>
                </section>
            ) : null}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
                {!data && !error ? <div className="flex items-center gap-2 text-gray-500 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div> : null}
                {error ? <div className="text-center py-16"><BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p role="alert" className="text-gray-700 font-medium">{error}</p><Link to="/cursos" className="inline-flex items-center gap-2 text-sm text-rotary-blue mt-4 hover:underline"><ArrowLeft className="w-4 h-4" /> Ir a la biblioteca</Link></div> : null}
                {data ? (
                    <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" aria-label="Cursos de la colección">
                        {data.courses.map((k, i) => (
                            <li key={k.id} className="relative">
                                <span className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-rotary-blue text-white text-xs font-black flex items-center justify-center shadow">{i + 1}</span>
                                <ul className="contents"><TarjetaCurso k={k} invite={invite || undefined} /></ul>
                            </li>
                        ))}
                    </ol>
                ) : null}
            </div>
        </Shell>
    );
};

export default ColeccionPublica;
