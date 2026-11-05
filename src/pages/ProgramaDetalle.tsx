/**
 * Programas — la página pública de un programa (v4.1280.0)
 *
 * `/programas/:slug/detalle` (v4.1281: la landing por contenedores vive en
 * `/programas/:slug`). Secciones ordenables y activables desde el panel; una
 * sección sin contenido NO se pinta (el servidor ya la filtró en `sections`).
 * El contenido es el central más lo distrital de esta vinculación más lo local
 * de este club: nunca el local de otro club.
 *
 * «Donar» abre un aviso que dice quién recibe y administra el aporte ANTES de
 * salir al enlace externo; el clic cuenta como interacción, no como donación.
 */
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, ExternalLink, MapPin, Phone, Mail, Globe, Search, Calendar, FileText, Headphones, Video, Link2,
    HeartHandshake, Users, BarChart3, Newspaper, Handshake, Loader2, X, ChevronRight,
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { PAGE_HEADER_BACKGROUND } from '../lib/pageHeader';
import { useClub } from '../contexts/ClubContext';
import { useSEO } from '../hooks/useSEO';
import { leerJson } from '../lib/leerJson';
import { dateLabel, type Embed } from '../lib/programSpec';
import ProgramEmbed from '../components/programas/ProgramEmbed';
import ProgramaFormularios from '../components/programas/ProgramaFormularios';

const API = import.meta.env.VITE_API_URL || '/api';

interface Clinic { id: string; name: string; institution?: string; region?: string; city?: string; address?: string; phone?: string; email?: string; url?: string; referenceContact?: string; careConditions?: string; schedule?: string; verifiedAt?: string; clubName?: string | null }
interface Team { id: string; name: string; role?: string; institution?: string; bio?: string; photoUrl?: string; photoAlt?: string; clubName?: string | null }
interface Story { id: string; title: string; summary?: string; body?: string; location?: string; date?: string; author?: string; media: { url?: string; kind: string; embed?: Embed | null; alt?: string; caption?: string; author?: string }[]; clubName?: string | null }
interface Resource { id: string; title: string; description?: string; type: string; url?: string; embed?: Embed | null; audience?: string; source?: string; reviewedAt?: string; medicalApprovedAt?: string; clinical?: boolean }
interface News { id: string; type: string; title: string; summary?: string; body?: string; date?: string; endDate?: string; location?: string; url?: string; imageUrl?: string; imageAlt?: string; clubName?: string | null }
interface Indicator { id: string; name: string; definition?: string; value: string; unit?: string; mode: string; period?: string; source?: string; updatedOn?: string }
interface Donation { id: string; buttonLabel: string; url: string; receiver: string; purpose?: string; disclaimer?: string; verifiedAt?: string }
interface Payload {
    program: any; link: any; activation: any; site: any; preview: boolean;
    sections: { key: string; label: string }[];
    content: { clinic: Clinic[]; team: Team[]; story: Story[]; resource: Resource[]; news: News[]; indicator: Indicator[]; donation: Donation[] };
    clinicFacets: { region: string; cities: string[] }[];
}

const Shell = ({ children }: { children: ReactNode }) => (
    <div className="min-h-screen bg-rotary-concrete flex flex-col font-sans text-gray-800">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
    </div>
);

const Parrafos = ({ texto, className = '' }: { texto?: string; className?: string }) => {
    if (!texto) return null;
    return <div className={`space-y-3 ${className}`}>{texto.split(/\n{2,}/).map((p, i) => <p key={i} className="text-gray-700 leading-relaxed whitespace-pre-line">{p}</p>)}</div>;
};

const Seccion = ({ id, title, icon, children, tone = 'white' }: { id: string; title: string; icon?: ReactNode; children: ReactNode; tone?: 'white' | 'soft' }) => (
    <section id={id} className={`scroll-mt-28 py-12 md:py-16 ${tone === 'soft' ? 'bg-white' : ''}`} aria-labelledby={`${id}-titulo`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <h2 id={`${id}-titulo`} className="flex items-center gap-3 text-2xl md:text-3xl font-bold text-gray-900 mb-6">{icon ? <span className="w-10 h-10 rounded-2xl bg-rotary-blue/10 text-rotary-blue flex items-center justify-center">{icon}</span> : null}{title}</h2>
            {children}
        </div>
    </section>
);

const RESOURCE_ICON: Record<string, ReactNode> = { documento: <FileText className="w-4 h-4" />, video: <Video className="w-4 h-4" />, audio: <Headphones className="w-4 h-4" />, podcast: <Headphones className="w-4 h-4" />, enlace: <Link2 className="w-4 h-4" /> };

const ProgramaDetalle = () => {
    const { slug = '' } = useParams();
    const [params] = useSearchParams();
    const { club } = useClub();
    const [data, setData] = useState<Payload | null>(null);
    const [estado, setEstado] = useState<'cargando' | 'ok' | 'no'>('cargando');
    const [region, setRegion] = useState('');
    const [ciudad, setCiudad] = useState('');
    const [q, setQ] = useState('');
    const [donar, setDonar] = useState<Donation | null>(null);
    const [historia, setHistoria] = useState<Story | null>(null);
    const p = data?.program;

    useSEO({
        title: p?.seo?.title || p?.name || 'Programa',
        description: p?.seo?.description || p?.summary || '',
        path: `/programas/${slug}/detalle`,
        image: p?.seo?.image || p?.heroImageUrl || p?.logoUrl || undefined,
        noindex: Boolean(data?.preview),
    });

    useEffect(() => {
        let vivo = true;
        setEstado('cargando');
        (async () => {
            try {
                const qs = new URLSearchParams();
                if (club?.id) qs.set('clubId', club.id);
                if (params.get('t')) qs.set('t', params.get('t') || '');
                const r = await fetch(`${API}/programas/public/${encodeURIComponent(slug)}?${qs}`);
                const { data: d } = await leerJson<Payload>(r);
                if (!vivo) return;
                if (!r.ok || !d) { setEstado('no'); return; }
                setData(d); setEstado('ok');
            } catch { if (vivo) setEstado('no'); }
        })();
        return () => { vivo = false; };
    }, [slug, club?.id, params]);

    const medir = (metric: string) => {
        if (data?.preview) return;
        fetch(`${API}/programas/public/${encodeURIComponent(slug)}/metric`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metric, clubId: club?.id }), keepalive: true }).catch(() => {});
    };

    const clinicas = useMemo(() => {
        const all = data?.content.clinic || [];
        const t = q.trim().toLowerCase();
        return all.filter(c => (!region || (c.region || 'Sin región') === region) && (!ciudad || c.city === ciudad) && (!t || [c.name, c.institution, c.city, c.region, c.address].some(v => String(v || '').toLowerCase().includes(t))));
    }, [data, region, ciudad, q]);
    const ciudades = useMemo(() => (data?.clinicFacets || []).find(f => f.region === region)?.cities || [], [data, region]);

    if (estado === 'cargando') return <Shell><div className="flex items-center gap-2 text-gray-500 py-24 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div></Shell>;
    if (estado === 'no' || !data || !p) {
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

    const ctaHref = (c: any) => {
        if (c.target === 'enlace') return c.href;
        if (c.target === 'clinicas') return '#clinicas';
        if (c.target === 'donar') return '#ayudar';
        return `#contacto?f=${c.target}`;
    };
    const ctaClick = (c: any) => (e: MouseEvent<HTMLAnchorElement>) => {
        if (['orientacion', 'apoyo', 'club', 'novedades'].includes(c.target)) {
            e.preventDefault();
            const url = new URL(window.location.href); url.searchParams.set('f', c.target); window.history.replaceState(null, '', url.toString());
            document.getElementById('contacto')?.scrollIntoView({ behavior: 'smooth' });
        }
    };
    const formInicial = params.get('f');
    const contacto = p.contact || {};

    return (
        <Shell>
            {data.preview ? <div className="bg-amber-100 text-amber-900 text-sm text-center py-2 px-4 font-medium" role="status">Vista previa: así se vería el programa publicado en este sitio. Sólo quien tiene el enlace la ve.</div> : null}

            {/* Inicio */}
            <section id="inicio" className="relative overflow-hidden text-white" style={PAGE_HEADER_BACKGROUND} aria-labelledby="programa-titulo">
                {p.heroImageUrl ? <img src={p.heroImageUrl} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-25" /> : null}
                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20">
                    <Link to={`/programas/${encodeURIComponent(slug)}`} className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white mb-6"><ArrowLeft className="w-4 h-4" /> Volver a la página del programa</Link>
                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                        {p.logoUrl ? <img src={p.logoUrl} alt={`Logo de ${p.name}`} className="w-24 h-24 md:w-28 md:h-28 object-contain bg-white rounded-2xl p-2 shadow-lg shrink-0" /> : null}
                        <div className="flex-1">
                            {p.categoryLabel ? <span className="inline-block text-[11px] font-semibold uppercase tracking-wider bg-white/15 rounded-full px-3 py-1">{p.categoryLabel}</span> : null}
                            <h1 id="programa-titulo" className="text-3xl md:text-5xl font-bold mt-3">{p.name}</h1>
                            {p.summary ? <p className="text-base md:text-lg text-white/90 mt-3 max-w-3xl">{p.summary}</p> : null}
                            {data.link ? <p className="text-sm text-white/75 mt-3">{data.link.relationLabel} · Distrito {data.link.districtNumber}{data.activation?.clubName ? ` · Activado por ${data.activation.clubName}` : ''}</p> : null}
                        </div>
                    </div>
                    {(p.ctas || []).length ? (
                        <div className="flex flex-wrap gap-3 mt-8">
                            {p.ctas.map((c: any, i: number) => c.target === 'enlace'
                                ? <a key={i} href={c.href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold ${i === 0 ? 'bg-white text-rotary-blue' : 'bg-white/15 text-white border border-white/30'}`}>{c.label} <ExternalLink className="w-4 h-4" /></a>
                                : <a key={i} href={ctaHref(c)} onClick={ctaClick(c)} className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold ${i === 0 ? 'bg-white text-rotary-blue' : 'bg-white/15 text-white border border-white/30'}`}>{c.label} <ChevronRight className="w-4 h-4" /></a>)}
                        </div>
                    ) : null}
                </div>
            </section>

            {/* Navegación interna */}
            {data.sections.length > 2 ? (
                <nav aria-label="Secciones del programa" className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto py-2 text-sm">
                        {data.sections.filter(s => s.key !== 'inicio').map(s => <a key={s.key} href={`#${s.key}`} className="whitespace-nowrap px-3 py-1.5 rounded-full text-gray-600 hover:bg-rotary-blue/10 hover:text-rotary-blue">{s.label}</a>)}
                    </div>
                </nav>
            ) : null}

            {data.sections.filter(s => s.key !== 'inicio').map((s, idx) => {
                const tone = idx % 2 === 0 ? 'soft' : 'white';
                if (s.key === 'programa') return (
                    <Seccion key={s.key} id="programa" title={s.label} tone={tone}>
                        <div className="grid lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2"><Parrafos texto={p.description} /></div>
                            <aside className="space-y-4">
                                {data.link?.presentation ? <div className="rounded-2xl bg-sky-50 border border-sky-100 p-5"><h3 className="font-semibold text-gray-900 mb-2">Desde el Distrito {data.link.districtNumber}</h3><Parrafos texto={data.link.presentation} className="text-sm" /></div> : null}
                                {data.link?.disclaimer ? <p className="text-xs text-gray-500">{data.link.disclaimer}</p> : null}
                                {data.activation?.localNote ? <div className="rounded-2xl bg-amber-50 border border-amber-100 p-5"><h3 className="font-semibold text-gray-900 mb-2">{data.activation.clubName}</h3><Parrafos texto={data.activation.localNote} className="text-sm" /></div> : null}
                                {(p.website || Object.keys(p.social || {}).length) ? <div className="rounded-2xl bg-white border border-gray-100 p-5 text-sm space-y-2">
                                    {p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-rotary-blue hover:underline"><Globe className="w-4 h-4" /> Sitio web oficial</a> : null}
                                    {Object.entries(p.social || {}).map(([k, v]) => <a key={k} href={String(v)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-700 hover:text-rotary-blue capitalize"><ExternalLink className="w-4 h-4" /> {k}</a>)}
                                </div> : null}
                                {contacto.lastVerifiedAt ? <p className="text-xs text-gray-500">Información verificada el {dateLabel(contacto.lastVerifiedAt)}.</p> : null}
                            </aside>
                        </div>
                    </Seccion>
                );
                if (s.key === 'clinicas') return (
                    <Seccion key={s.key} id="clinicas" title={s.label} icon={<MapPin className="w-5 h-5" />} tone={tone}>
                        <div className="grid sm:grid-cols-3 gap-3 mb-6">
                            <label className="relative"><span className="sr-only">Buscar</span><Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, institución o ciudad" className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm" /></label>
                            <label><span className="sr-only">Departamento o región</span><select value={region} onChange={e => { setRegion(e.target.value); setCiudad(''); }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"><option value="">Todas las regiones</option>{data.clinicFacets.map(f => <option key={f.region} value={f.region}>{f.region}</option>)}</select></label>
                            <label><span className="sr-only">Ciudad</span><select value={ciudad} onChange={e => setCiudad(e.target.value)} disabled={!region} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60"><option value="">Todas las ciudades</option>{ciudades.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
                        </div>
                        {clinicas.length === 0 ? <p className="text-gray-500">No hay centros que coincidan con el filtro.</p> : (
                            <ul className="grid md:grid-cols-2 gap-4">
                                {clinicas.map(c => (
                                    <li key={c.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                                        <h3 className="font-bold text-gray-900">{c.name}</h3>
                                        {c.institution ? <p className="text-sm text-gray-600">{c.institution}</p> : null}
                                        <p className="text-sm text-gray-700 mt-2 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-rotary-blue shrink-0" /><span>{[c.address, c.city, c.region].filter(Boolean).join(', ')}</span></p>
                                        {c.schedule ? <p className="text-sm text-gray-700 mt-1 flex items-start gap-2"><Calendar className="w-4 h-4 mt-0.5 text-rotary-blue shrink-0" />{c.schedule}</p> : null}
                                        {c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} onClick={() => medir('clinic_click')} className="text-sm text-rotary-blue mt-1 flex items-center gap-2 hover:underline"><Phone className="w-4 h-4" />{c.phone}</a> : null}
                                        {c.email ? <a href={`mailto:${c.email}`} onClick={() => medir('clinic_click')} className="text-sm text-rotary-blue mt-1 flex items-center gap-2 hover:underline"><Mail className="w-4 h-4" />{c.email}</a> : null}
                                        {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => medir('clinic_click')} className="text-sm text-rotary-blue mt-1 flex items-center gap-2 hover:underline"><ExternalLink className="w-4 h-4" />Enlace oficial</a> : null}
                                        {c.referenceContact ? <p className="text-sm text-gray-700 mt-2">Contacto de referencia: {c.referenceContact}</p> : null}
                                        {c.careConditions ? <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-xl p-3">{c.careConditions}</p> : null}
                                        {c.verifiedAt ? <p className="text-[11px] text-gray-400 mt-2">Verificado el {dateLabel(c.verifiedAt)}</p> : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Seccion>
                );
                if (s.key === 'familias') return (
                    <Seccion key={s.key} id="familias" title={s.label} icon={<FileText className="w-5 h-5" />} tone={tone}>
                        {(p.care?.audience || p.care?.guidancePath || p.care?.accessConditions || p.care?.officialChannels || p.care?.costsText || p.care?.coverage) ? (
                            <div className="grid md:grid-cols-2 gap-6 mb-8">
                                {p.care.audience ? <div className="rounded-2xl bg-white border border-gray-100 p-5"><h3 className="font-semibold text-gray-900 mb-2">¿A quién se dirige?</h3><Parrafos texto={p.care.audience} className="text-sm" /></div> : null}
                                {p.care.coverage ? <div className="rounded-2xl bg-white border border-gray-100 p-5"><h3 className="font-semibold text-gray-900 mb-2">Cobertura territorial</h3><Parrafos texto={p.care.coverage} className="text-sm" /></div> : null}
                                {p.care.guidancePath ? <div className="rounded-2xl bg-white border border-gray-100 p-5"><h3 className="font-semibold text-gray-900 mb-2">Ruta de orientación</h3><Parrafos texto={p.care.guidancePath} className="text-sm" /></div> : null}
                                {p.care.accessConditions ? <div className="rounded-2xl bg-white border border-gray-100 p-5"><h3 className="font-semibold text-gray-900 mb-2">Condiciones de acceso</h3><Parrafos texto={p.care.accessConditions} className="text-sm" /></div> : null}
                                {p.care.officialChannels ? <div className="rounded-2xl bg-white border border-gray-100 p-5"><h3 className="font-semibold text-gray-900 mb-2">Canales oficiales</h3><Parrafos texto={p.care.officialChannels} className="text-sm" /></div> : null}
                                {p.care.costsText ? <div className="rounded-2xl bg-white border border-gray-100 p-5"><h3 className="font-semibold text-gray-900 mb-2">Costos y aseguramiento</h3><Parrafos texto={p.care.costsText} className="text-sm" /></div> : null}
                            </div>
                        ) : null}
                        {data.content.resource.length ? (
                            <ul className="grid md:grid-cols-2 gap-4">
                                {data.content.resource.map(r => (
                                    <li key={r.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-rotary-blue/80">{RESOURCE_ICON[r.type]} {r.type}{r.audience ? ` · ${r.audience}` : ''}</div>
                                        <h3 className="font-bold text-gray-900 mt-1">{r.title}</h3>
                                        {r.description ? <p className="text-sm text-gray-600 mt-1">{r.description}</p> : null}
                                        {r.embed ? <div className="mt-3"><ProgramEmbed embed={r.embed} title={r.title} /></div> : null}
                                        {r.url && !r.embed ? <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={() => medir('resource_click')} className="inline-flex items-center gap-2 text-sm text-rotary-blue mt-3 hover:underline"><ExternalLink className="w-4 h-4" /> Abrir recurso</a> : null}
                                        <p className="text-[11px] text-gray-400 mt-3">{[r.source ? `Fuente: ${r.source}` : '', r.reviewedAt ? `Revisado el ${dateLabel(r.reviewedAt)}` : '', r.clinical && r.medicalApprovedAt ? `Aprobación médica ${dateLabel(r.medicalApprovedAt)}` : ''].filter(Boolean).join(' · ')}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </Seccion>
                );
                if (s.key === 'historias') return (
                    <Seccion key={s.key} id="historias" title={s.label} icon={<HeartHandshake className="w-5 h-5" />} tone={tone}>
                        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {data.content.story.map(h => {
                                const portada = h.media.find(m => m.kind === 'image');
                                return (
                                    <li key={h.id} className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                                        {portada?.url ? <img src={portada.url} alt={portada.alt || ''} className="w-full aspect-[4/3] object-cover" loading="lazy" /> : null}
                                        <div className="p-5 flex flex-col flex-1">
                                            <h3 className="font-bold text-gray-900">{h.title}</h3>
                                            <p className="text-xs text-gray-500 mt-1">{[h.location, dateLabel(h.date), h.clubName].filter(Boolean).join(' · ')}</p>
                                            <p className="text-sm text-gray-600 mt-2 flex-1">{h.summary}</p>
                                            {(h.body || h.media.length > 1) ? <button type="button" onClick={() => setHistoria(h)} className="text-sm font-semibold text-rotary-blue mt-3 text-left hover:underline">Leer la historia</button> : null}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </Seccion>
                );
                if (s.key === 'equipo') return (
                    <Seccion key={s.key} id="equipo" title={s.label} icon={<Users className="w-5 h-5" />} tone={tone}>
                        <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                            {data.content.team.map(t => (
                                <li key={t.id} className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5 text-center">
                                    {t.photoUrl ? <img src={t.photoUrl} alt={t.photoAlt || t.name} className="w-24 h-24 rounded-full object-cover mx-auto" loading="lazy" /> : <div className="w-24 h-24 rounded-full bg-rotary-blue/10 text-rotary-blue mx-auto flex items-center justify-center text-2xl font-bold" aria-hidden="true">{t.name.slice(0, 1)}</div>}
                                    <h3 className="font-bold text-gray-900 mt-3">{t.name}</h3>
                                    <p className="text-sm text-rotary-blue">{t.role}</p>
                                    {t.institution ? <p className="text-xs text-gray-500">{t.institution}</p> : null}
                                    {t.clubName ? <p className="text-[11px] text-gray-400 mt-1">{t.clubName}</p> : null}
                                    {t.bio ? <p className="text-sm text-gray-600 mt-3">{t.bio}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </Seccion>
                );
                if (s.key === 'impacto') return (
                    <Seccion key={s.key} id="impacto" title={s.label} icon={<BarChart3 className="w-5 h-5" />} tone={tone}>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {data.content.indicator.map(i => (
                                <div key={i.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
                                    <p className="text-3xl font-bold text-rotary-blue">{i.value}<span className="text-base font-medium text-gray-500 ml-1">{i.unit}</span></p>
                                    <h3 className="font-semibold text-gray-900 mt-1">{i.name}</h3>
                                    <p className="text-xs text-gray-500 mt-1">{i.mode === 'acumulado' ? 'Acumulado' : 'Período'}{i.period ? ` · ${i.period}` : ''}</p>
                                    {i.definition ? <p className="text-xs text-gray-600 mt-2">{i.definition}</p> : null}
                                    <p className="text-[11px] text-gray-400 mt-2">{[i.source ? `Fuente: ${i.source}` : '', i.updatedOn ? `Actualizado ${dateLabel(i.updatedOn)}` : ''].filter(Boolean).join(' · ')}</p>
                                </div>
                            ))}
                        </div>
                    </Seccion>
                );
                if (s.key === 'ayudar') return (
                    <Seccion key={s.key} id="ayudar" title={s.label} icon={<Handshake className="w-5 h-5" />} tone={tone}>
                        <div className="grid lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-5">
                                {p.participation?.waysToSupport ? <div><h3 className="font-semibold text-gray-900 mb-1">Formas de apoyar</h3><Parrafos texto={p.participation.waysToSupport} className="text-sm" /></div> : null}
                                {p.participation?.clubParticipation ? <div><h3 className="font-semibold text-gray-900 mb-1">Participación de clubes</h3><Parrafos texto={p.participation.clubParticipation} className="text-sm" /></div> : null}
                                {p.participation?.volunteering ? <div><h3 className="font-semibold text-gray-900 mb-1">Voluntariado</h3><Parrafos texto={p.participation.volunteering} className="text-sm" /></div> : null}
                                {p.participation?.corporateAlliances ? <div><h3 className="font-semibold text-gray-900 mb-1">Alianzas empresariales</h3><Parrafos texto={p.participation.corporateAlliances} className="text-sm" /></div> : null}
                            </div>
                            {p.participation?.donationsEnabled && data.content.donation.length ? (
                                <aside className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6 space-y-4">
                                    <h3 className="font-bold text-gray-900">Donaciones</h3>
                                    {p.participation.donationsIntro ? <p className="text-sm text-gray-600">{p.participation.donationsIntro}</p> : null}
                                    {data.content.donation.map(d => (
                                        <div key={d.id} className="border-t border-gray-100 pt-4">
                                            <p className="text-xs text-gray-500">Recibe y administra: <strong className="text-gray-800">{d.receiver}</strong></p>
                                            {d.purpose ? <p className="text-xs text-gray-500 mt-1">{d.purpose}</p> : null}
                                            <button type="button" onClick={() => setDonar(d)} className="mt-3 inline-flex items-center gap-2 rounded-full bg-rotary-gold text-gray-900 px-5 py-2.5 text-sm font-semibold hover:brightness-95">{d.buttonLabel} <ExternalLink className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </aside>
                            ) : null}
                        </div>
                    </Seccion>
                );
                if (s.key === 'noticias') return (
                    <Seccion key={s.key} id="noticias" title={s.label} icon={<Newspaper className="w-5 h-5" />} tone={tone}>
                        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {data.content.news.map(n => (
                                <li key={n.id} className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                                    {n.imageUrl ? <img src={n.imageUrl} alt={n.imageAlt || ''} className="w-full aspect-[16/9] object-cover" loading="lazy" /> : null}
                                    <div className="p-5 flex flex-col flex-1">
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-rotary-blue/80">{n.type === 'evento' ? 'Evento' : 'Noticia'}{n.date ? ` · ${dateLabel(n.date)}${n.endDate ? ` – ${dateLabel(n.endDate)}` : ''}` : ''}</span>
                                        <h3 className="font-bold text-gray-900 mt-1">{n.title}</h3>
                                        {n.location ? <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{n.location}</p> : null}
                                        {n.summary ? <p className="text-sm text-gray-600 mt-2 flex-1">{n.summary}</p> : null}
                                        {n.body ? <Parrafos texto={n.body} className="text-sm mt-2" /> : null}
                                        {n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-rotary-blue mt-3 hover:underline"><ExternalLink className="w-4 h-4" /> Más información</a> : null}
                                        {n.clubName ? <p className="text-[11px] text-gray-400 mt-2">{n.clubName}</p> : null}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Seccion>
                );
                if (s.key === 'aliados') return (
                    <Seccion key={s.key} id="aliados" title={s.label} tone={tone}>
                        <ul className="flex flex-wrap gap-4">
                            {p.partners.map((a: any, i: number) => (
                                <li key={i} className="rounded-2xl bg-white border border-gray-100 p-4 flex items-center gap-3 min-w-[200px]">
                                    {a.logoUrl ? <img src={a.logoUrl} alt={`Logo de ${a.name}`} className="h-10 w-auto max-w-[120px] object-contain" loading="lazy" /> : null}
                                    {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-gray-800 hover:text-rotary-blue">{a.name}</a> : <span className="text-sm font-semibold text-gray-800">{a.name}</span>}
                                </li>
                            ))}
                        </ul>
                    </Seccion>
                );
                if (s.key === 'contacto') return (
                    <Seccion key={s.key} id="contacto" title={s.label} icon={<Mail className="w-5 h-5" />} tone={tone}>
                        <div className="grid lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2">
                                <ProgramaFormularios slug={slug} clubId={club?.id} formsEnabled={p.formsEnabled || {}} newsletterEnabled={p.newsletterEnabled !== false} districtNumber={data.link?.districtNumber} initialTab={formInicial} />
                            </div>
                            <aside className="space-y-4">
                                {(contacto.email || contacto.phone || contacto.coordinatorName) ? <div className="rounded-2xl bg-white border border-gray-100 p-5 text-sm space-y-2">
                                    <h3 className="font-semibold text-gray-900">Contacto institucional</h3>
                                    {contacto.coordinatorName ? <p className="text-gray-700">{contacto.coordinatorName}</p> : null}
                                    {contacto.email ? <a href={`mailto:${contacto.email}`} className="flex items-center gap-2 text-rotary-blue hover:underline"><Mail className="w-4 h-4" />{contacto.email}</a> : null}
                                    {contacto.phone ? <a href={`tel:${contacto.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 text-rotary-blue hover:underline"><Phone className="w-4 h-4" />{contacto.phone}</a> : null}
                                </div> : null}
                                {data.link?.contact ? <div className="rounded-2xl bg-white border border-gray-100 p-5 text-sm space-y-1">
                                    <h3 className="font-semibold text-gray-900">Contacto en el Distrito {data.link.districtNumber}</h3>
                                    <p className="text-gray-700">{data.link.contact.name}{data.link.contact.role ? ` · ${data.link.contact.role}` : ''}</p>
                                    {data.link.contact.email ? <a href={`mailto:${data.link.contact.email}`} className="flex items-center gap-2 text-rotary-blue hover:underline"><Mail className="w-4 h-4" />{data.link.contact.email}</a> : null}
                                    {data.link.contact.phone ? <p className="flex items-center gap-2 text-gray-700"><Phone className="w-4 h-4" />{data.link.contact.phone}</p> : null}
                                </div> : null}
                                {data.activation?.localContact ? <div className="rounded-2xl bg-white border border-gray-100 p-5 text-sm space-y-1">
                                    <h3 className="font-semibold text-gray-900">Contacto en {data.activation.clubName}</h3>
                                    <p className="text-gray-700">{data.activation.localContact.name}{data.activation.localContact.role ? ` · ${data.activation.localContact.role}` : ''}</p>
                                    {data.activation.localContact.email ? <a href={`mailto:${data.activation.localContact.email}`} className="flex items-center gap-2 text-rotary-blue hover:underline"><Mail className="w-4 h-4" />{data.activation.localContact.email}</a> : null}
                                    {data.activation.localContact.phone ? <p className="flex items-center gap-2 text-gray-700"><Phone className="w-4 h-4" />{data.activation.localContact.phone}</p> : null}
                                </div> : null}
                            </aside>
                        </div>
                    </Seccion>
                );
                return null;
            })}

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
                <Link to={`/programas/${encodeURIComponent(slug)}`} className="inline-flex items-center gap-2 text-sm font-semibold text-rotary-blue hover:underline"><ArrowLeft className="w-4 h-4" /> Volver a la página del programa</Link>
            </div>

            {/* Aviso antes de salir a donar */}
            {donar ? (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="donar-titulo" onClick={() => setDonar(null)}>
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3">
                            <h3 id="donar-titulo" className="text-lg font-bold text-gray-900">Antes de continuar</h3>
                            <button type="button" onClick={() => setDonar(null)} aria-label="Cerrar" className="p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-sm text-gray-700 mt-3">Tu aporte lo recibe y administra <strong>{donar.receiver}</strong>{donar.purpose ? `, con destino: ${donar.purpose}` : ''}.</p>
                        {donar.disclaimer ? <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-xl p-3">{donar.disclaimer}</p> : null}
                        <p className="text-xs text-gray-500 mt-2">Saldrás a un sitio externo. {club?.name || 'Este sitio'} no procesa el pago.{donar.verifiedAt ? ` Enlace verificado el ${dateLabel(donar.verifiedAt)}.` : ''}</p>
                        <div className="flex gap-3 mt-5">
                            <button type="button" onClick={() => setDonar(null)} className="flex-1 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700">Cancelar</button>
                            <a href={donar.url} target="_blank" rel="noopener noreferrer" onClick={() => { medir('donation_click'); setDonar(null); }} className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-rotary-gold text-gray-900 px-4 py-2.5 text-sm font-semibold">Continuar <ExternalLink className="w-4 h-4" /></a>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Una historia completa */}
            {historia ? (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="historia-titulo" onClick={() => setHistoria(null)}>
                    <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3">
                            <h3 id="historia-titulo" className="text-xl font-bold text-gray-900">{historia.title}</h3>
                            <button type="button" onClick={() => setHistoria(null)} aria-label="Cerrar" className="p-1 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{[historia.location, dateLabel(historia.date), historia.author, historia.clubName].filter(Boolean).join(' · ')}</p>
                        <Parrafos texto={historia.body || historia.summary} className="mt-4" />
                        <div className="mt-4 space-y-4">
                            {historia.media.map((m, i) => m.kind === 'embed' && m.embed ? <ProgramEmbed key={i} embed={m.embed} title={m.caption || historia.title} /> : m.url ? <figure key={i}><img src={m.url} alt={m.alt || ''} className="w-full rounded-2xl" loading="lazy" />{m.caption ? <figcaption className="text-xs text-gray-500 mt-1">{m.caption}{m.author ? ` · ${m.author}` : ''}</figcaption> : null}</figure> : null)}
                        </div>
                    </div>
                </div>
            ) : null}
        </Shell>
    );
};

export default ProgramaDetalle;
