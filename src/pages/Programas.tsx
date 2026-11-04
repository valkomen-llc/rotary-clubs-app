/**
 * Programas — catálogo público del sitio (v4.1280.0)
 *
 * `/programas`. Muestra los programas que ESTE sitio respalda (distrito) o
 * activó (club). El sitio se resuelve en el servidor por host o por `clubId`.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, HeartHandshake, Loader2 } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { PublicPageHeader } from '../components/common/PublicInstitutionalComponents';
import { useClub } from '../contexts/ClubContext';
import { useSEO } from '../hooks/useSEO';
import { leerJson } from '../lib/leerJson';

const API = import.meta.env.VITE_API_URL || '/api';

interface Card { slug: string; name: string; summary: string; categoryLabel: string; logoUrl?: string; heroImageUrl?: string; heroImageAlt?: string; districtNumber?: number }

const Shell = ({ children }: { children: ReactNode }) => (
    <div className="min-h-screen bg-rotary-concrete flex flex-col font-sans text-gray-800">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
    </div>
);

const Programas = () => {
    const { club } = useClub();
    useSEO({ title: 'Programas', description: `Programas que ${club?.name || 'este sitio'} respalda y difunde.`, path: '/programas' });
    const [rows, setRows] = useState<Card[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!club?.id) return;
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${API}/programas/public/catalogo?clubId=${encodeURIComponent(club.id)}`);
                const { data } = await leerJson<any>(r);
                if (!vivo) return;
                if (!r.ok) { setError(data?.error || 'No se pudo cargar el catálogo.'); setRows([]); return; }
                setRows(Array.isArray(data?.programs) ? data.programs : []);
            } catch { if (vivo) { setError('No se pudo cargar el catálogo.'); setRows([]); } }
        })();
        return () => { vivo = false; };
    }, [club?.id]);

    return (
        <Shell>
            <PublicPageHeader title="Programas" subtitle={`Iniciativas que ${club?.name || 'nuestra organización'} respalda, difunde o apoya, con información verificada y canales oficiales de participación.`} />
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-14">
                <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-rotary-blue hover:underline mb-6"><ArrowLeft className="w-4 h-4" /> Volver al inicio</Link>
                {rows === null ? (
                    <div className="flex items-center gap-2 text-gray-500 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div>
                ) : error ? (
                    <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</p>
                ) : rows.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <HeartHandshake className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                        <p className="font-medium text-gray-700">Todavía no hay programas publicados en este sitio.</p>
                    </div>
                ) : (
                    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="Programas">
                        {rows.map(p => (
                            <li key={p.slug} className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                                {p.heroImageUrl ? <img src={p.heroImageUrl} alt={p.heroImageAlt || ''} className="w-full aspect-[16/9] object-cover" loading="lazy" /> : <div className="w-full aspect-[16/9] bg-gradient-to-br from-rotary-blue/90 to-sky-700 flex items-center justify-center">{p.logoUrl ? <img src={p.logoUrl} alt={`Logo de ${p.name}`} className="max-h-20 max-w-[60%] object-contain bg-white/90 rounded-xl p-2" /> : <HeartHandshake className="w-10 h-10 text-white/80" />}</div>}
                                <div className="p-5 flex flex-col flex-1">
                                    {p.categoryLabel ? <span className="text-[11px] font-semibold uppercase tracking-wide text-rotary-blue/80">{p.categoryLabel}</span> : null}
                                    <h2 className="text-lg font-bold text-gray-900 mt-1">{p.name}</h2>
                                    <p className="text-sm text-gray-600 mt-2 flex-1">{p.summary}</p>
                                    <Link to={`/programas/${p.slug}`} className="inline-flex items-center gap-2 text-sm font-semibold text-rotary-blue mt-4 hover:underline">Conocer el programa <ArrowRight className="w-4 h-4" /></Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Shell>
    );
};

export default Programas;
