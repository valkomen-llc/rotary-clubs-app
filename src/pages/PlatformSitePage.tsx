/**
 * Sitio web de Club Platform — la página pública y su vista previa (v4.1348.0)
 *
 * Dos usos, un componente:
 *   · PÚBLICO: en el dominio del sitio institucional (clubplatform.org), sólo
 *     la versión PUBLICADA y sólo si el sitio está «en vivo». Si no lo está,
 *     el dominio hace lo de siempre: lleva al panel.
 *   · VISTA PREVIA: `/vista-previa/sitio-institucional[/pagina]?t=…` en el
 *     panel, con el BORRADOR y un token firmado de una hora. Nunca se indexa.
 */
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PlatformSiteView from '../components/platform-site/PlatformSiteView';
import { leerJson } from '../lib/leerJson';
import { ADMIN_HOST, PREVIEW_BASE, type ResolvedPage } from '../lib/platformSiteSpec';

const API = import.meta.env.VITE_API_URL || '/api';

const setMeta = (attr: 'name' | 'property', key: string, value: string) => {
    let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
    if (!value) { el?.remove(); return; }
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.content = value;
};

/** El `<head>` durante la navegación interna; para rastreadores lo resuelve el servidor (`platformSiteServe.js`). */
const applyHead = (page: ResolvedPage, host: string, preview: boolean, jsonLd: unknown) => {
    const { seo } = page; const url = `https://${host}${seo.path}`;
    document.title = seo.title;
    setMeta('name', 'description', seo.description);
    setMeta('name', 'robots', preview || seo.noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('property', 'og:title', seo.title); setMeta('property', 'og:description', seo.description);
    setMeta('property', 'og:url', url); setMeta('property', 'og:type', 'website'); setMeta('property', 'og:site_name', seo.siteName); setMeta('property', 'og:image', seo.image);
    setMeta('name', 'twitter:card', seo.image ? 'summary_large_image' : 'summary'); setMeta('name', 'twitter:title', seo.title); setMeta('name', 'twitter:description', seo.description); setMeta('name', 'twitter:image', seo.image);
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = url;
    document.getElementById('seo-jsonld')?.remove();
    if (jsonLd && !preview) { const s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'seo-jsonld'; s.text = JSON.stringify(jsonLd); document.head.appendChild(s); }
};

/** Una visita: sin IP ni identificadores; el «visitante del día» lo marca el propio navegador. */
const countVisit = (path: string) => {
    try {
        // Quien tiene sesión del panel no es una visita.
        if (localStorage.getItem('rotary_token')) return;
        const today = new Date().toISOString().slice(0, 10);
        const first = localStorage.getItem('cp_site_day') !== today;
        if (first) localStorage.setItem('cp_site_day', today);
        fetch(`${API}/platform-site/public/visit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, first }), keepalive: true }).catch(() => {});
    } catch { /* sin almacenamiento: no se cuenta */ }
};

const Aviso = ({ title, text }: { title: string; text: string }) => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-rotary-navy text-white px-6 text-center">
        <p className="text-lg font-bold" data-no-translate>Club Platform <span className="text-rotary-gold">for Rotary</span></p>
        <h1 className="text-2xl font-semibold mt-6">{title}</h1>
        <p className="text-white/80 mt-2 max-w-md">{text}</p>
        <a href={`https://${ADMIN_HOST}/`} className="mt-8 inline-flex items-center rounded-full bg-white text-rotary-blue font-semibold px-6 py-3">Ir al panel</a>
    </div>
);

const PlatformSitePage = ({ mode }: { mode: 'public' | 'preview' }) => {
    const location = useLocation();
    const [params] = useSearchParams();
    const token = mode === 'preview' ? (params.get('t') || '') : '';
    const sitePath = mode === 'preview' ? (location.pathname.slice(PREVIEW_BASE.length) || '/') : location.pathname;
    const [data, setData] = useState<{ page: ResolvedPage; host: string; preview: boolean; jsonLd: unknown } | null>(null);
    const [estado, setEstado] = useState<'cargando' | 'ok' | 'no-existe' | 'no-pagina' | 'vencido' | 'error'>('cargando');

    useEffect(() => {
        let vivo = true;
        const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
        (async () => {
            try {
                const qs = new URLSearchParams({ path: sitePath }); if (token) qs.set('t', token);
                const r = await fetch(`${API}/platform-site/public?${qs}`, { signal: ctrl.signal });
                const { data: j } = await leerJson<any>(r);
                if (!vivo) return;
                if (r.ok && j?.page) {
                    if (mode === 'preview' && !j.preview) { setEstado('vencido'); return; }
                    setData(j); setEstado('ok'); return;
                }
                if (mode === 'preview') { setEstado(j?.exists === false ? 'no-existe' : 'vencido'); return; }
                // Público: sin sitio en vivo, el dominio hace lo de siempre.
                if (j?.notFound) { setEstado('no-pagina'); return; }
                window.location.replace(`https://${ADMIN_HOST}/`);
            } catch { if (vivo) { if (mode === 'public') window.location.replace(`https://${ADMIN_HOST}/`); else setEstado('error'); } }
            finally { clearTimeout(timer); }
        })();
        return () => { vivo = false; ctrl.abort(); clearTimeout(timer); };
    }, [sitePath, token, mode]);

    useEffect(() => {
        if (estado !== 'ok' || !data) return;
        applyHead(data.page, data.host, data.preview, data.jsonLd);
        if (!data.preview) countVisit(data.page.seo.path);
        // Un ancla en la dirección (`/#soluciones`) se resuelve cuando el contenido ya está pintado.
        if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
        else window.scrollTo(0, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estado, data]);

    if (estado === 'cargando') return <div className="min-h-screen flex items-center justify-center bg-rotary-navy text-white/80 gap-2"><Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Cargando…</div>;
    if (estado === 'vencido') return <Aviso title="La vista previa venció" text="El enlace de vista previa dura una hora. Genera uno nuevo desde «Sitio web de Club Platform»." />;
    if (estado === 'no-existe') return <Aviso title="El sitio todavía no existe" text="Crea el sitio institucional desde el panel central." />;
    if (estado === 'no-pagina') return <Aviso title="Página no encontrada" text="Esta dirección no corresponde a ninguna página del sitio." />;
    if (estado === 'error' || !data) return <Aviso title="No pudimos cargar la página" text="Inténtalo de nuevo en unos segundos." />;

    return (
        <>
            {data.preview ? <div className="bg-amber-100 text-amber-900 text-sm text-center py-2 px-4 font-medium" role="status">Vista previa del BORRADOR · no es la versión pública · sólo quien tiene este enlace la ve</div> : null}
            <PlatformSiteView page={data.page} preview={data.preview} previewToken={token || undefined} />
        </>
    );
};

export default PlatformSitePage;
