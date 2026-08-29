// ════════════════════════════════════════════════════════════════════════════
// Canal de Capacitaciones — la página del canal (v4.954)
//
// /capacitaciones — un solo enlace permanente por sitio. El contenido sale del
// canal que el administrador armó sobre su carpeta de la Biblioteca
// Multimedia; sin canal activo la página lo dice, sin romper nada.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Play, Search, Clock, Eye, Lock, GraduationCap } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useSEO } from '../hooks/useSEO';
import { fetchTraining, postTraining, fmtDuration, type TrainingCard } from '../lib/trainingChannel';
import { onLoginSuccess } from '../lib/loginModal';

// El sitio monta su cromo POR PÁGINA (el Navbar vive dentro de cada página,
// no por encima — ver loginModal.ts): sin este envoltorio, el canal salía
// «plano», sin barra superior, sin menú y sin pie. Envuelve TODOS los
// returns, incluidos los de carga y error.
const Shell = ({ children }: { children: ReactNode }) => (
    <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
    </div>
);

interface ChannelData {
    channel: { slug: string; name: string; description: string; bannerUrl: string | null } | null;
    videos: TrainingCard[];
    categories: string[];
    continueWatching: TrainingCard[];
    viewer?: { authenticated: boolean; roles: string[] };
}

const AccessChip = ({ mode }: { mode: string }) => {
    if (mode === 'publico') return null;
    if (mode === 'preview') {
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-rotary-blue">Vista previa</span>;
    }
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
            <Lock className="w-3 h-3" /> Con cuenta
        </span>
    );
};

const Card = ({ v }: { v: TrainingCard }) => (
    <Link
        to={`/capacitaciones/${v.slug}`}
        className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow flex flex-col"
    >
        <div className="relative aspect-video bg-gray-900">
            {v.thumbUrl ? (
                <img src={v.thumbUrl} alt={v.title} loading="lazy" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                    <GraduationCap className="w-10 h-10" />
                </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="w-12 h-12 rounded-full bg-black/50 group-hover:bg-rotary-blue flex items-center justify-center transition-colors">
                    <Play className="w-5 h-5 text-white ml-0.5" />
                </span>
            </div>
            {v.durationSec ? (
                <span className="absolute bottom-2 right-2 text-[11px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded" data-no-translate>
                    {fmtDuration(v.durationSec)}
                </span>
            ) : null}
            {typeof v.pctWatched === 'number' && v.pctWatched > 0 ? (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                    <div className="h-full bg-rotary-gold" style={{ width: `${Math.min(100, v.pctWatched)}%` }} />
                </div>
            ) : null}
        </div>
        <div className="p-4 flex-1 flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-gray-900 leading-snug line-clamp-2">{v.title}</h3>
                <AccessChip mode={v.accessMode} />
            </div>
            {v.description && <p className="text-sm text-gray-500 line-clamp-2">{v.description}</p>}
            <div className="mt-auto pt-2 flex items-center gap-3 text-[12px] text-gray-400">
                {v.instructor && <span className="truncate" data-no-translate>{v.instructor}</span>}
                {v.publishedAt && (
                    <span data-no-translate>{new Date(v.publishedAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                )}
                {v.views !== null && v.views !== undefined && (
                    <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /><span data-no-translate>{v.views}</span></span>
                )}
            </div>
        </div>
    </Link>
);

const Capacitaciones = () => {
    const { club } = useClub();
    const [data, setData] = useState<ChannelData | null>(null);
    const [failed, setFailed] = useState(false);
    const [term, setTerm] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const trackedView = useRef(false);

    const load = async (clubId: string) => {
        try {
            const res = await fetchTraining('public/channel', { clubId });
            setData(res);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    };

    useEffect(() => {
        if (!club?.id) return;
        load(club.id);
    }, [club?.id]);

    // Al entrar con sesión desde el candado de un video, «Continuar viendo»
    // tiene que aparecer sin recargar.
    useEffect(() => onLoginSuccess(() => { if (club?.id) load(club.id); }), [club?.id]);

    // Una vista del canal por CARGA, no por render (regla v4.807).
    useEffect(() => {
        if (!club?.id || !data?.channel || trackedView.current) return;
        trackedView.current = true;
        postTraining('public/track', { clubId: club.id, type: 'channel_view' }).catch(() => {});
    }, [club?.id, data?.channel]);

    useSEO({
        title: data?.channel?.name || 'Capacitaciones',
        description: data?.channel?.description || undefined,
        path: '/capacitaciones',
        image: data?.channel?.bannerUrl || undefined,
    });

    const filtered = useMemo(() => {
        if (!data?.videos) return [];
        const q = term.trim().toLowerCase();
        return data.videos.filter(v => {
            if (category && v.category !== category) return false;
            if (!q) return true;
            const hay = [v.title, v.description, v.instructor, v.category, ...(v.tags || [])]
                .filter(Boolean).join(' ').toLowerCase();
            return q.split(/\s+/).every(w => hay.includes(w));
        });
    }, [data?.videos, term, category]);

    if (!club) {
        return <Shell><div className="min-h-[50vh] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rotary-blue" /></div></Shell>;
    }

    if (failed) {
        return (
            <Shell>
                <div className="max-w-2xl mx-auto px-4 py-24 text-center">
                    <p className="text-gray-600">No se pudo cargar el canal de capacitaciones. Recarga la página para intentarlo de nuevo.</p>
                </div>
            </Shell>
        );
    }

    if (data && !data.channel) {
        return (
            <Shell>
                <div className="max-w-2xl mx-auto px-4 py-24 text-center">
                    <GraduationCap className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <h1 className="text-2xl font-light text-gray-800 mb-2">Capacitaciones</h1>
                    <p className="text-gray-500">Este sitio todavía no tiene un canal de capacitaciones publicado.</p>
                </div>
            </Shell>
        );
    }

    if (!data) {
        return <Shell><div className="min-h-[50vh] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rotary-blue" /></div></Shell>;
    }

    const { channel, categories, continueWatching } = data;

    return (
        <Shell>
            {/* Cabecera del canal */}
            <div className="relative bg-rotary-topbar text-white">
                {channel!.bannerUrl && (
                    <div className="absolute inset-0">
                        <img src={channel!.bannerUrl} alt="" className="w-full h-full object-cover opacity-30" />
                    </div>
                )}
                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
                    <p className="text-sm font-bold uppercase tracking-wider text-white/70 mb-2">Canal de formación</p>
                    <h1 className="text-3xl sm:text-4xl font-light">{channel!.name}</h1>
                    {channel!.description && <p className="mt-3 max-w-2xl text-white/80">{channel!.description}</p>}
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Búsqueda y categorías */}
                <div className="flex flex-wrap items-center gap-3 mb-8">
                    <div className="relative flex-1 min-w-[240px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={term}
                            onChange={e => setTerm(e.target.value)}
                            placeholder="Buscar por título, instructor o tema…"
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                        />
                    </div>
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setCategory(null)}
                                className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${!category ? 'bg-rotary-blue text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                            >
                                Todas
                            </button>
                            {categories.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setCategory(category === c ? null : c)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${category === c ? 'bg-rotary-blue text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Continuar viendo — sólo con sesión y con progreso real */}
                {continueWatching.length > 0 && (
                    <section className="mb-10">
                        <h2 className="text-xl font-light text-gray-800 mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-rotary-blue" /> Continuar viendo
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {continueWatching.map(v => <Card key={`cw-${v.slug}`} v={v} />)}
                        </div>
                    </section>
                )}

                {/* Todas las capacitaciones */}
                {filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        {data.videos.length === 0
                            ? 'Todavía no hay capacitaciones publicadas.'
                            : 'Ninguna capacitación coincide con la búsqueda.'}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {filtered.map(v => <Card key={v.slug} v={v} />)}
                    </div>
                )}
            </div>
        </Shell>
    );
};

export default Capacitaciones;
