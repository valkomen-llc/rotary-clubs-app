/**
 * Programas — `/programas/:slug`: la landing por contenedores (v4.1281.0)
 *
 * Cabecera y pie del sitio del distrito (Navbar/Footer), la landing resuelta
 * en el servidor en el medio, y los formularios del programa en un diálogo
 * accesible. `?t=` abre la vista previa firmada con el BORRADOR; sin token el
 * visitante ve sólo la última versión publicada.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, X } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useSEO } from '../hooks/useSEO';
import { leerJson } from '../lib/leerJson';
import { dateLabel } from '../lib/programSpec';
import type { ResolvedLanding } from '../lib/programLandingSpec';
import ProgramaLanding from '../components/programas/ProgramaLanding';
import ProgramaFormularios from '../components/programas/ProgramaFormularios';

const API = import.meta.env.VITE_API_URL || '/api';

const Shell = ({ children }: { children: ReactNode }) => (
    <div className="min-h-screen bg-white flex flex-col font-sans text-gray-800">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
    </div>
);

const Dialogo = ({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prev = document.activeElement as HTMLElement | null;
        ref.current?.querySelector<HTMLElement>('button, input, select, textarea, a')?.focus();
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo" onClick={onClose}>
            <div ref={ref} className={`bg-white rounded-t-3xl sm:rounded-3xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto p-5 sm:p-6 shadow-2xl`} onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-3">
                    <h2 id="dialogo-titulo" className="text-lg font-bold text-gray-900">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-full hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold"><X className="w-5 h-5" /></button>
                </div>
                {children}
            </div>
        </div>
    );
};

const ProgramaLandingPage = () => {
    const { slug = '' } = useParams();
    const [params] = useSearchParams();
    const { club } = useClub();
    const [data, setData] = useState<any>(null);
    const [estado, setEstado] = useState<'cargando' | 'ok' | 'no'>('cargando');
    const [form, setForm] = useState<string | null>(params.get('f'));
    const [donar, setDonar] = useState<any>(null);
    const p = data?.program;
    const landing: ResolvedLanding | null = data?.landing || null;

    useSEO({ title: p?.seo?.title || p?.name || 'Programa', description: p?.seo?.description || p?.summary || '', path: `/programas/${slug}`, image: p?.seo?.image || p?.heroImageUrl || p?.logoUrl || undefined, noindex: Boolean(data?.preview) });

    useEffect(() => {
        let vivo = true;
        setEstado('cargando');
        (async () => {
            try {
                const qs = new URLSearchParams();
                if (club?.id) qs.set('clubId', club.id);
                if (params.get('t')) qs.set('t', params.get('t') || '');
                const r = await fetch(`${API}/programas/public/${encodeURIComponent(slug)}?${qs}`);
                const { data: d } = await leerJson<any>(r);
                if (!vivo) return;
                if (!r.ok || !d) { setEstado('no'); return; }
                setData(d); setEstado('ok');
            } catch { if (vivo) setEstado('no'); }
        })();
        return () => { vivo = false; };
    }, [slug, club?.id, params]);

    const medir = useCallback((metric: string) => {
        if (data?.preview) return;
        fetch(`${API}/programas/public/${encodeURIComponent(slug)}/metric`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metric, clubId: club?.id }), keepalive: true }).catch(() => {});
    }, [slug, club?.id, data?.preview]);
    const cerrarForm = useCallback(() => setForm(null), []);
    const cerrarDonar = useCallback(() => setDonar(null), []);

    if (estado === 'cargando') return <Shell><div className="flex items-center gap-2 text-gray-500 py-24 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div></Shell>;
    if (estado === 'no' || !data || !p || !landing) {
        return (
            <Shell>
                <div className="max-w-3xl mx-auto px-4 py-24 text-center">
                    <h1 className="text-2xl font-bold text-gray-900">Este programa no está disponible en este sitio</h1>
                    <p className="text-gray-600 mt-2">Puede que todavía no esté publicado o que este sitio no lo haya activado.</p>
                    <Link to="/programas" className="inline-flex items-center gap-2 mt-6 text-rotary-blue font-semibold hover:underline"><ArrowLeft className="w-4 h-4" /> Volver a Programas</Link>
                </div>
            </Shell>
        );
    }
    const back = landing.settings?.backLink || { label: 'Volver al menú', href: '/' };

    return (
        <Shell>
            {data.preview ? <div className="bg-amber-100 text-amber-900 text-sm text-center py-2 px-4 font-medium" role="status">Vista previa del BORRADOR: así se vería la página publicada. Sólo quien tiene el enlace la ve.</div> : null}
            <ProgramaLanding landing={landing} handlers={{ onForm: f => setForm(f), onDonation: d => setDonar(d), onMetric: medir }} />
            <div className="bg-white border-t border-gray-100">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <Link to={back.href} className="inline-flex items-center gap-2 font-semibold text-rotary-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold rounded"><ArrowLeft className="w-4 h-4" /> {back.label}</Link>
                    <Link to={`/programas/${encodeURIComponent(slug)}/detalle`} className="text-gray-500 hover:text-rotary-blue">Ver toda la información del programa</Link>
                </div>
            </div>

            {form ? (
                <Dialogo title={form === 'club' ? 'Mi club quiere participar' : form === 'apoyo' ? 'Quiero apoyar' : form === 'novedades' ? 'Quiero recibir novedades' : 'Necesito orientación'} onClose={cerrarForm} wide>
                    <ProgramaFormularios slug={slug} clubId={club?.id} formsEnabled={p.formsEnabled || {}} newsletterEnabled={p.newsletterEnabled !== false} districtNumber={data.link?.districtNumber} initialTab={form} />
                </Dialogo>
            ) : null}
            {donar ? (
                <Dialogo title="Antes de continuar" onClose={cerrarDonar}>
                    <p className="text-sm text-gray-700">Tu aporte lo recibe y administra <strong>{donar.receiver}</strong>{donar.purpose ? `, con destino: ${donar.purpose}` : ''}.</p>
                    {donar.disclaimer ? <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-xl p-3">{donar.disclaimer}</p> : null}
                    <p className="text-xs text-gray-500 mt-2">Saldrás a un sitio externo. {club?.name || 'Este sitio'} no procesa el pago.{donar.verifiedAt ? ` Enlace verificado el ${dateLabel(donar.verifiedAt)}.` : ''}</p>
                    <div className="flex gap-3 mt-5">
                        <button type="button" onClick={cerrarDonar} className="flex-1 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 min-h-[44px]">Cancelar</button>
                        <a href={donar.url} target="_blank" rel="noopener noreferrer" onClick={() => { medir('donation_click'); setDonar(null); }} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-rotary-gold text-gray-900 px-4 py-2.5 text-sm font-semibold min-h-[44px]">Continuar <ExternalLink className="w-4 h-4" /></a>
                    </div>
                </Dialogo>
            ) : null}
        </Shell>
    );
};

export default ProgramaLandingPage;
