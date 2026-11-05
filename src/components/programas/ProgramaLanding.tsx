/**
 * Programas — el renderizador de la página pública por contenedores (v4.1282.0)
 *
 * Pinta lo que `resolveLanding` resolvió en el servidor con los MISMOS patrones
 * del sitio del distrito, no con medidas propias:
 *   · contenedor `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` y `py-16 md:py-20`
 *     (Action, Stats, News del inicio);
 *   · portada: alturas `h-[440px] md:h-[540px]` del `HeroSection`, imagen
 *     `object-cover` con `objectPosition` y `scale(zoom)` del encuadre, Ken
 *     Burns `animate-hero-zoom` del tema (sólo con `motion-safe`) y la
 *     superposición `from-black/40` del inicio cuando la imagen va de fondo;
 *   · banda bajo la portada: `SITE_ACTION_BG` (la textura geométrica del
 *     «Somos gente de acción») con el `actionBg` configurable de un sitio
 *     Evento, como `ActionSection`;
 *   · botones: la forma del inicio (`px-8 py-3.5 rounded-full shadow-lg`) con
 *     `useCtaButton` (celeste estándar o `.cta-btn` del sitio Evento),
 *     `ctaSkin(CTA_SOLID)` para el principal y `CtaStarIcon` como ícono por
 *     omisión;
 *   · tarjetas de Stats (`bg-gray-50 rounded-3xl border p-8`), de ícono de
 *     Proyectos (círculo `bg-sky-100 w-16 h-16`), de Causas (`rounded-xl
 *     shadow-sm`), dos columnas de Join (`lg:grid-cols-2 gap-16`, imagen
 *     `rounded-[40px]` sin recorte) y la caja flotante de Fundación.
 *
 * En vista previa pinta los marcadores («Fotografía real autorizada»,
 * «Indicadores por validar»); en público esos contenedores no llegan.
 * Todos los componentes van FUERA del principal (regla del repositorio).
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Image as ImageIcon, MapPin, Search } from 'lucide-react';
import ProgramIcon from './ProgramIcon';
import { useClub } from '../../contexts/ClubContext';
import { useCtaButton } from '../../hooks/useCtaButton';
import { hasCustomTheme } from '../../lib/entityTypes';
import { SITE_ACTION_BG } from '../../lib/siteChrome';
import { CTA_SOLID, ctaSkin } from '../../lib/ctaStyles';
import { CtaStarIcon } from '../../lib/ctaIcons';
import { BACKGROUND_CLASS, isDarkBackground, type ResolvedBlock, type ResolvedButton, type ResolvedImage, type ResolvedLanding } from '../../lib/programLandingSpec';
import { dateLabel } from '../../lib/programSpec';

export interface LandingHandlers {
    onForm: (form: string) => void;
    onDonation: (donation: any) => void;
    onMetric?: (metric: string) => void;
}
interface Chrome { cta: { className: string; style?: CSSProperties }; actionBg?: string | null; isEventSite: boolean }

/** El contenedor y los ritmos verticales del inicio del sitio. */
const CONTAINER = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
const SECTION_PAD = 'py-16 md:py-20';
/** La forma de los botones de la portada del sitio (Action, Join, Fundación, Noticias, Spotlight). */
const BTN_SHAPE = 'inline-flex items-center gap-2 font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold';
/** Títulos de sección: `font-light` como las bandas del inicio. */
const H2_LIGHT = 'text-3xl md:text-4xl font-light text-gray-800';
const H2_DARK = 'text-3xl md:text-4xl font-light text-white';
const P_LIGHT = 'text-gray-600 text-base md:text-lg leading-relaxed';
const P_DARK = 'text-white/90 text-base md:text-lg leading-relaxed';

export const LandingButton = ({ b, dark, handlers, chrome, className = '' }: { b: ResolvedButton | null; dark: boolean; handlers: LandingHandlers; chrome: Chrome; className?: string }) => {
    if (!b) return null;
    // Principal sobre fondo claro: el azul sólido (`ctaSkin(CTA_SOLID)`); el resto, el
    // celeste del sitio (o el `.cta-btn` configurable de un sitio Evento).
    const solid = b.variant === 'primary' && !dark;
    const gold = b.variant === 'gold';
    const skin = solid ? ctaSkin(CTA_SOLID) : gold ? 'bg-rotary-gold text-gray-900 hover:brightness-95' : chrome.cta.className;
    const style = !solid && !gold ? chrome.cta.style : undefined;
    const icon = b.icon ? <ProgramIcon id={b.icon} className="w-5 h-5" gold /> : <CtaStarIcon />;
    const inner = <>{icon}<span>{b.label}</span>{b.kind === 'external' ? <ExternalLink className="w-4 h-4 opacity-70" aria-hidden /> : null}</>;
    const cls = `${BTN_SHAPE} ${skin} ${className}`;
    if (b.kind === 'form') return <button type="button" className={cls} style={style} onClick={() => handlers.onForm(b.form || 'orientacion')}>{inner}</button>;
    if (b.kind === 'donation') return <button type="button" className={cls} style={style} onClick={() => handlers.onDonation(b.donation)}>{inner}</button>;
    if (b.kind === 'external') return <a className={cls} style={style} href={b.href} target="_blank" rel="noopener noreferrer">{inner}</a>;
    if (b.kind === 'anchor') return <a className={cls} style={style} href={b.href} onClick={e => { e.preventDefault(); document.getElementById(String(b.href).slice(1))?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }}>{inner}</a>;
    return <Link className={cls} style={style} to={b.href || '/'}>{inner}</Link>;
};

/** Enlace de texto de las tarjetas (el de las causas: `text-rotary-blue hover:text-sky-700 font-bold text-sm`). */
const CardLink = ({ b, handlers }: { b: ResolvedButton | null; handlers: LandingHandlers }) => {
    if (!b) return null;
    const cls = 'inline-flex items-center gap-1 text-rotary-blue hover:text-sky-700 font-bold text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold rounded';
    const inner = <>{b.label} <ArrowRight className="w-4 h-4" aria-hidden /></>;
    if (b.kind === 'form') return <button type="button" className={cls} onClick={() => handlers.onForm(b.form || 'orientacion')}>{inner}</button>;
    if (b.kind === 'donation') return <button type="button" className={cls} onClick={() => handlers.onDonation(b.donation)}>{inner}</button>;
    if (b.kind === 'external') return <a className={cls} href={b.href} target="_blank" rel="noopener noreferrer">{inner}</a>;
    if (b.kind === 'anchor') return <a className={cls} href={b.href}>{inner}</a>;
    return <Link className={cls} to={b.href || '/'}>{inner}</Link>;
};

/** Imagen real (encuadre del hero del inicio: `objectPosition` + `scale(zoom)`) o el marcador de la referencia. */
export const LandingImage = ({ img, className = '', rounded = 'rounded-3xl', cover = true }: { img: ResolvedImage | null; className?: string; rounded?: string; cover?: boolean }) => {
    if (!img) return null;
    if (img.placeholder) {
        return (
            <div className={`${rounded} bg-sky-200/70 border border-sky-200 flex flex-col items-center justify-center text-slate-600 ${className}`} role="img" aria-label="Espacio para una fotografía real autorizada">
                <ImageIcon className="w-14 h-14 text-slate-500/70" aria-hidden />
                <span className="text-sm mt-3">{img.placeholderLabel || 'Fotografía real autorizada'}</span>
            </div>
        );
    }
    const zoom = (img.zoom || 100) / 100;
    if (!cover) return <img src={img.url} alt={img.alt} className={`${rounded} w-full h-auto ${className}`} loading="lazy" decoding="async" />;
    return <div className={`${rounded} overflow-hidden ${className}`}><img src={img.url} alt={img.alt} className="w-full h-full object-cover" style={{ objectPosition: `${img.focalX}% ${img.focalY}%`, transform: zoom > 1 ? `scale(${zoom})` : undefined }} loading="lazy" decoding="async" /></div>;
};

/** El fondo de un contenedor: clase del tema, o la textura institucional en línea (tres propiedades, como `ActionSection`). */
const sectionBackground = (bg: string, chrome: Chrome): { className: string; style?: CSSProperties; texture?: boolean } => {
    const spec = BACKGROUND_CLASS[bg] || BACKGROUND_CLASS.white;
    if (bg === 'geo') {
        // Un sitio Evento/Convención trae su `colors.actionBg` configurable y la textura por encima (ActionSection).
        if (chrome.isEventSite && chrome.actionBg) return { className: 'relative overflow-hidden', style: { backgroundColor: chrome.actionBg }, texture: true };
        return { className: 'relative overflow-hidden', style: SITE_ACTION_BG as CSSProperties };
    }
    return { className: spec.section };
};

const Section = ({ block, chrome, children, className = '' }: { block: ResolvedBlock; chrome: Chrome; children: ReactNode; className?: string }) => {
    const bg = sectionBackground(block.style.background, chrome);
    return (
        <section id={block.id} data-block={block.type} className={`relative overflow-hidden ${bg.className} ${isDarkBackground(block.style.background) ? 'text-white' : 'text-gray-900'} scroll-mt-24 ${className}`} style={bg.style} aria-labelledby={`${block.id}-titulo`}>
            {bg.texture ? <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: SITE_ACTION_BG.backgroundImage, backgroundPosition: SITE_ACTION_BG.backgroundPosition, backgroundRepeat: SITE_ACTION_BG.backgroundRepeat, backgroundSize: SITE_ACTION_BG.backgroundSize, mixBlendMode: 'overlay', opacity: 0.85 }} /> : null}
            {!block.ready ? <div className="relative z-10 bg-amber-100 text-amber-900 text-xs text-center py-1.5 px-4">Vista previa: este contenedor no se muestra en público hasta completar sus datos ({block.notes[0] || 'faltan datos'}).</div> : null}
            <div className="relative z-10">{children}</div>
        </section>
    );
};

const Titulo = ({ id, text, dark, align = 'center', className = '' }: { id: string; text: string; dark: boolean; align?: 'left' | 'center'; className?: string }) => (
    text ? <h2 id={`${id}-titulo`} className={`${dark ? H2_DARK : H2_LIGHT} leading-tight ${align === 'center' ? 'text-center' : ''} ${className}`}>{text}</h2> : <h2 id={`${id}-titulo`} className="sr-only">Sección</h2>
);
const Parrafo = ({ text, dark, align = 'center', className = '' }: { text?: string; dark: boolean; align?: 'left' | 'center'; className?: string }) => (
    text ? <p className={`${dark ? P_DARK : P_LIGHT} ${align === 'center' ? 'text-center mx-auto' : ''} whitespace-pre-line ${className}`}>{text}</p> : null
);

// ── Contenedores ──────────────────────────────────────────────────────

/** La portada: alturas y comportamiento del `HeroSection` del inicio; imagen al lado (referencia) o de fondo. */
const HeroBlock = ({ block, handlers, chrome }: { block: ResolvedBlock; handlers: LandingHandlers; chrome: Chrome }) => {
    const d = block.data; const bgMode = block.style.imageMode === 'background' && d.image && !d.image.placeholder;
    const dark = bgMode || isDarkBackground(block.style.background);
    const textFirst = block.style.imageSide === 'right';
    const centered = block.style.align === 'center';
    const zoom = d.image ? (d.image.zoom || 100) / 100 : 1;
    return (
        <Section block={block} chrome={chrome} className="min-h-[440px] md:min-h-[540px] flex flex-col justify-center">
            {bgMode ? (
                <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
                    <img src={d.image.url} alt="" className="w-full h-full object-cover motion-safe:animate-hero-zoom" style={{ objectPosition: `${d.image.focalX}% ${d.image.focalY}%`, transform: zoom > 1 ? `scale(${zoom})` : undefined }} />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />
                    {block.style.overlay ? <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: block.style.overlay / 100 }} /> : null}
                </div>
            ) : block.style.overlay ? <div className="absolute inset-0 bg-rotary-navy pointer-events-none" style={{ opacity: block.style.overlay / 100 }} aria-hidden="true" /> : null}
            <div className={`${CONTAINER} relative py-16 md:py-24 w-full ${bgMode ? '' : 'grid lg:grid-cols-5 gap-10 items-center'} ${centered ? 'text-center' : ''}`}>
                <div className={`${bgMode ? 'max-w-xl' : 'lg:col-span-3'} ${textFirst ? '' : 'lg:order-2'} ${centered ? 'mx-auto' : ''}`}>
                    {d.eyebrow ? <p className={`inline-block text-[11px] font-black tracking-[0.18em] uppercase px-3 py-1 rounded-full mb-4 ${dark ? 'bg-white/15 text-white/90 border border-white/20' : 'bg-white/70 text-rotary-blue border border-sky-200'}`}>{d.eyebrow}</p> : null}
                    <h1 id={`${block.id}-titulo`} className={`text-3xl sm:text-4xl md:text-5xl tracking-tight leading-tight font-normal ${dark ? 'text-white' : 'text-rotary-blue'}`}>{d.title}</h1>
                    {d.tagline ? <p className={`text-xl md:text-2xl font-light mt-2 ${dark ? 'text-white/90' : 'text-rotary-blue'}`}>{d.tagline}</p> : null}
                    {d.description ? <p className={`mt-5 text-base md:text-lg leading-relaxed max-w-xl ${centered ? 'mx-auto' : ''} ${dark ? 'text-white/80' : 'text-gray-600'}`}>{d.description}</p> : null}
                    {d.buttons.length ? <div className={`flex flex-col sm:flex-row flex-wrap gap-3 mt-8 ${centered ? 'justify-center' : ''}`}>{d.buttons.map((b: ResolvedButton, i: number) => <LandingButton key={i} b={b} dark={dark} handlers={handlers} chrome={chrome} />)}</div> : null}
                </div>
                {!bgMode && d.image ? <div className={`lg:col-span-2 ${textFirst ? '' : 'lg:order-1'}`}><LandingImage img={d.image} className="aspect-[4/3] w-full max-w-md mx-auto" rounded="rounded-3xl" /></div> : null}
            </div>
        </Section>
    );
};

/** La banda bajo la portada: la composición de `ActionSection` (centrada, `max-w-5xl`, botón del inicio). */
const IntroBlock = ({ block, handlers, chrome }: { block: ResolvedBlock; handlers: LandingHandlers; chrome: Chrome }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background); const centered = block.style.align === 'center';
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} ${SECTION_PAD} ${centered ? 'text-center' : ''}`}>
                <Titulo id={block.id} text={d.title} dark={dark} align={block.style.align} className="mb-6" />
                <Parrafo text={d.description} dark={dark} align={block.style.align} className="mb-8 max-w-5xl" />
                {d.button ? <div className={centered ? 'flex justify-center' : ''}><LandingButton b={d.button} dark={dark} handlers={handlers} chrome={chrome} /></div> : null}
            </div>
        </Section>
    );
};

/** Tarjetas con ícono: el patrón de Proyectos (`bg-gray-50 rounded-2xl p-8`, círculo `bg-sky-100 w-16 h-16`). */
const CardsBlock = ({ block, handlers, chrome }: { block: ResolvedBlock; handlers: LandingHandlers; chrome: Chrome }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const cols = d.cards.length >= 3 ? 'lg:grid-cols-3' : d.cards.length === 2 ? 'md:grid-cols-2' : '';
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} ${SECTION_PAD}`}>
                <Titulo id={block.id} text={d.title} dark={dark} className={d.description ? 'mb-4' : 'mb-12'} />
                <Parrafo text={d.description} dark={dark} className="mb-12 max-w-3xl" />
                <ul className={`grid grid-cols-1 md:grid-cols-2 ${cols} gap-8`}>
                    {d.cards.map((c: any) => (
                        <li key={c.id} className={`${dark ? 'bg-white' : 'bg-gray-50'} rounded-2xl p-8 text-center hover:shadow-lg transition-shadow flex flex-col items-center`}>
                            <span className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mb-6 text-rotary-blue"><ProgramIcon id={c.icon} className="w-8 h-8" gold /></span>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">{c.title}</h3>
                            {c.description ? <p className="text-gray-600 text-sm leading-relaxed mb-4 flex-1">{c.description}</p> : null}
                            <CardLink b={c.link} handlers={handlers} />
                        </li>
                    ))}
                </ul>
            </div>
        </Section>
    );
};

/** Texto e imagen: la composición de `JoinSection` (`lg:grid-cols-2 gap-16`, imagen `rounded-[40px]` sin recorte). */
const FeatureBlock = ({ block, handlers, chrome }: { block: ResolvedBlock; handlers: LandingHandlers; chrome: Chrome }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const textFirst = block.style.imageSide === 'right';
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center`}>
                <div className={textFirst ? '' : 'lg:order-2'}>
                    <Titulo id={block.id} text={d.title} dark={dark} align="left" className="mb-6" />
                    <Parrafo text={d.description} dark={dark} align="left" className="mb-8" />
                    {d.button ? <LandingButton b={d.button} dark={dark} handlers={handlers} chrome={chrome} /> : null}
                </div>
                {d.image ? <div className={textFirst ? '' : 'lg:order-1'}>{d.image.placeholder ? <LandingImage img={d.image} className="aspect-[4/3]" rounded="rounded-[40px]" /> : <LandingImage img={d.image} rounded="rounded-[40px]" cover={false} />}</div> : null}
            </div>
        </Section>
    );
};

/** Impacto: la tarjeta de `StatsSection` (`bg-gray-50 rounded-3xl border p-8`, ícono `w-10 h-10`, cifra `text-4xl font-bold`). */
const ImpactBlock = ({ block, chrome }: { block: ResolvedBlock; chrome: Chrome }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} ${SECTION_PAD}`}>
                <Titulo id={block.id} text={d.title} dark={dark} className="mb-12" />
                <Parrafo text={d.description} dark={dark} className="mb-12 max-w-3xl" />
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {d.items.map((it: any) => (
                        <li key={it.id} className="bg-gray-50 rounded-3xl border border-gray-100 p-8 text-center hover:bg-white hover:shadow-xl hover:border-[#0c3c7c]/10 transition-all duration-300">
                            <span className="text-rotary-blue inline-flex mb-4"><ProgramIcon id={it.icon} className="w-10 h-10" gold /></span>
                            {it.indicator ? <p className="text-4xl font-bold text-rotary-blue mb-2">{it.indicator.value}<span className="text-base font-medium text-gray-500 ml-1">{it.indicator.unit}</span></p> : null}
                            <h3 className="text-gray-800 font-bold">{it.label || it.indicator?.name}</h3>
                            {it.indicator ? <p className="text-gray-600 text-sm leading-relaxed mt-1">{[it.indicator.mode === 'periodo' ? `Período ${it.indicator.period || ''}` : 'Acumulado', it.indicator.updatedOn ? `actualizado ${dateLabel(it.indicator.updatedOn)}` : ''].filter(Boolean).join(' · ')}</p> : <p className="text-gray-500 text-sm italic mt-1">Indicadores por validar</p>}
                        </li>
                    ))}
                </ul>
            </div>
        </Section>
    );
};

/** Directorio: tarjetas de proyecto (`bg-white rounded-2xl border border-gray-200`) y el filtro con el botón sólido. */
const DirectoryBlock = ({ block, handlers, chrome }: { block: ResolvedBlock; handlers: LandingHandlers; chrome: Chrome }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const [region, setRegion] = useState('');
    const [city, setCity] = useState('');
    const [applied, setApplied] = useState({ region: '', city: '' });
    const [showAll, setShowAll] = useState(false);
    const cities = useMemo(() => (d.facets || []).find((f: any) => f.region === region)?.cities || [], [d.facets, region]);
    const list = useMemo(() => (d.clinics || []).filter((c: any) => (!applied.region || (c.region || 'Sin región') === applied.region) && (!applied.city || c.city === applied.city)), [d.clinics, applied]);
    const visibles = showAll ? list : list.slice(0, d.initialCount || 2);
    const placeholders = d.clinics?.length ? [] : [1, 2];
    const select = 'w-full rounded-full border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold disabled:opacity-60';
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} ${SECTION_PAD}`}>
                <Titulo id={block.id} text={d.title} dark={dark} className={d.description ? 'mb-4' : 'mb-10'} />
                <Parrafo text={d.description} dark={dark} className="mb-10 max-w-3xl" />
                {(d.filters.region || d.filters.city) ? (
                    <form className="grid sm:grid-cols-[1fr_1fr_auto] gap-4 items-end max-w-4xl mx-auto mb-10" onSubmit={e => { e.preventDefault(); setApplied({ region, city }); setShowAll(false); }}>
                        {d.filters.region ? <label className="text-sm"><span className="block text-sm font-bold text-gray-700 mb-2">Departamento</span><select value={region} onChange={e => { setRegion(e.target.value); setCity(''); }} className={select}><option value="">Selecciona un departamento</option>{(d.facets || []).map((f: any) => <option key={f.region} value={f.region}>{f.region}</option>)}</select></label> : null}
                        {d.filters.city ? <label className="text-sm"><span className="block text-sm font-bold text-gray-700 mb-2">Ciudad</span><select value={city} onChange={e => setCity(e.target.value)} disabled={!region} className={select}><option value="">Selecciona una ciudad</option>{cities.map((c: string) => <option key={c} value={c}>{c}</option>)}</select></label> : null}
                        <button type="submit" className={`${BTN_SHAPE} ${ctaSkin(CTA_SOLID)} justify-center`}><Search className="w-5 h-5" aria-hidden /> {d.searchLabel}</button>
                    </form>
                ) : null}
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto" aria-live="polite">
                    {visibles.map((c: any) => (
                        <li key={c.id} className="bg-white rounded-2xl border border-gray-200 p-6 flex gap-4 hover:shadow-md transition-shadow">
                            <span className="w-12 h-12 shrink-0 bg-sky-100 rounded-full flex items-center justify-center text-rotary-blue"><MapPin className="w-6 h-6" aria-hidden /></span>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-xl font-bold text-gray-900">{c.name}</h3>
                                {d.fields.institution && c.institution ? <p className="text-gray-500 text-sm">{c.institution}</p> : null}
                                <p className="text-gray-600 text-sm leading-relaxed mt-1">{[c.city, c.region].filter(Boolean).join(' · ')}</p>
                                {d.fields.schedule && c.schedule ? <p className="text-gray-600 text-sm mt-1">{c.schedule}</p> : null}
                                {d.fields.careConditions && c.careConditions ? <p className="text-gray-500 text-sm italic mt-1">{c.careConditions}</p> : null}
                                <Link to={`/programas/${encodeURIComponent(d.slug || '')}/detalle#clinicas`} onClick={() => handlers.onMetric?.('clinic_click')} className="inline-flex items-center gap-1 text-rotary-blue hover:text-sky-700 font-bold text-sm mt-3">{d.contactLabel} <ArrowRight className="w-4 h-4" aria-hidden /></Link>
                            </div>
                        </li>
                    ))}
                    {placeholders.map(i => (
                        <li key={`ph-${i}`} className="bg-white rounded-2xl border border-dashed border-gray-300 p-6 flex gap-4">
                            <span className="w-12 h-12 shrink-0 bg-sky-100 rounded-full flex items-center justify-center text-rotary-blue"><MapPin className="w-6 h-6" aria-hidden /></span>
                            <div><p className="text-xl font-bold text-gray-900">Nombre de la clínica</p><p className="text-gray-600 text-sm mt-1">Ciudad · Departamento</p><p className="text-gray-500 text-sm italic mt-1">Información por confirmar</p><span className="inline-flex items-center gap-1 text-rotary-blue/60 font-bold text-sm mt-3">{d.contactLabel} <ArrowRight className="w-4 h-4" aria-hidden /></span></div>
                        </li>
                    ))}
                </ul>
                {list.length > visibles.length ? <div className="text-center mt-6"><button type="button" className="text-rotary-blue hover:text-sky-700 font-bold text-sm" onClick={() => setShowAll(true)}>Mostrar {list.length - visibles.length} más</button></div> : null}
                {d.allButton ? <div className="flex justify-center mt-10"><LandingButton b={d.allButton} dark={dark} handlers={handlers} chrome={chrome} /></div> : null}
            </div>
        </Section>
    );
};

/** Donaciones: la caja flotante de `FoundationSection` (`bg-white rounded-2xl md:rounded-3xl shadow-2xl px-8 md:px-12 py-10 md:py-12`). */
const DonationBlock = ({ block, handlers, chrome }: { block: ResolvedBlock; handlers: LandingHandlers; chrome: Chrome }) => {
    const d = block.data;
    const imageFirst = block.style.imageSide === 'left';
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} ${SECTION_PAD} grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center`}>
                {d.image ? <div className={imageFirst ? '' : 'lg:order-2'}>{d.image.placeholder ? <LandingImage img={d.image} className="aspect-[4/3]" rounded="rounded-[40px]" /> : <LandingImage img={d.image} rounded="rounded-[40px]" cover={false} />}</div> : null}
                <div className={`${imageFirst ? '' : 'lg:order-1'} bg-white rounded-2xl md:rounded-3xl shadow-2xl px-8 md:px-12 py-10 md:py-12 max-w-lg w-full ${imageFirst ? 'lg:ml-auto' : ''}`}>
                    <h2 id={`${block.id}-titulo`} className="text-2xl md:text-3xl font-light text-gray-900 mb-6">{d.title}</h2>
                    {d.description ? <p className="text-gray-600 leading-relaxed mb-8">{d.description}</p> : null}
                    {d.button ? <LandingButton b={d.button} dark={false} handlers={handlers} chrome={chrome} /> : null}
                    <p className="text-xs italic text-gray-500 mt-4">{d.receiver ? `Recibe y administra: ${d.receiver}${d.verifiedAt ? ` · enlace verificado el ${dateLabel(d.verifiedAt)}` : ''}` : 'Entidad receptora y enlace por confirmar.'}</p>
                </div>
            </div>
        </Section>
    );
};

/** Historias: la tarjeta de Nuestras Causas (`bg-white rounded-xl shadow-sm border`, imagen `h-48`, cuerpo `p-6`). */
const StoriesBlock = ({ block, chrome }: { block: ResolvedBlock; chrome: Chrome }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const placeholders = d.stories.length ? [] : [1, 2, 3].slice(0, d.count || 3);
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} ${SECTION_PAD}`}>
                <Titulo id={block.id} text={d.title} dark={dark} className={d.description ? 'mb-4' : 'mb-12'} />
                <Parrafo text={d.description} dark={dark} className="mb-12 max-w-3xl" />
                <ul className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                    {d.stories.map((s: any) => (
                        <li key={s.id} className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="h-48">{s.image ? <img src={s.image.url} alt={s.image.alt || ''} className="w-full h-full object-cover" loading="lazy" decoding="async" /> : <LandingImage img={{ url: '', alt: '', focalX: 50, focalY: 50, placeholder: true }} className="h-full" rounded="rounded-none" />}</div>
                            <div className="p-6 flex flex-col flex-1">
                                <h3 className="text-xl font-bold text-gray-900 mb-3">{s.title}</h3>
                                {d.showDate && s.date ? <p className="text-xs text-gray-500 mb-2">{dateLabel(s.date)}</p> : null}
                                {d.showSummary && s.summary ? <p className="text-gray-600 text-sm leading-relaxed mb-4 flex-1">{s.summary}</p> : null}
                                <Link to={`/programas/${encodeURIComponent(d.slug || '')}/detalle#historias`} className="inline-flex items-center gap-1 text-rotary-blue hover:text-sky-700 font-bold text-sm mt-auto">{d.linkLabel} <ArrowRight className="w-4 h-4" aria-hidden /></Link>
                            </div>
                        </li>
                    ))}
                    {placeholders.map(i => (
                        <li key={`ph-${i}`} className="flex flex-col bg-white rounded-xl overflow-hidden shadow-sm border border-dashed border-gray-300">
                            <div className="h-48"><LandingImage img={{ url: '', alt: '', focalX: 50, focalY: 50, placeholder: true }} className="h-full" rounded="rounded-none" /></div>
                            <div className="p-6"><p className="text-xl font-bold text-gray-900 mb-3">Una historia por compartir</p><span className="inline-flex items-center gap-1 text-rotary-blue/60 font-bold text-sm">{d.linkLabel} <ArrowRight className="w-4 h-4" aria-hidden /></span></div>
                        </li>
                    ))}
                </ul>
            </div>
        </Section>
    );
};

/** Recursos: accesos con el círculo de ícono de Proyectos y el botón del inicio. */
const ResourcesBlock = ({ block, handlers, chrome }: { block: ResolvedBlock; handlers: LandingHandlers; chrome: Chrome }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} ${SECTION_PAD} text-center`}>
                <Titulo id={block.id} text={d.title} dark={dark} className={d.description ? 'mb-4' : 'mb-12'} />
                <Parrafo text={d.description} dark={dark} className="mb-12 max-w-3xl" />
                <ul className="flex flex-wrap justify-center gap-10 md:gap-16">
                    {d.items.map((it: any) => {
                        const inner = <><span className="w-16 h-16 md:w-20 md:h-20 bg-sky-100 rounded-full flex items-center justify-center mx-auto text-rotary-blue group-hover:bg-sky-200 transition-colors shadow-lg"><ProgramIcon id={it.icon} className="w-8 h-8 md:w-9 md:h-9" gold /></span><span className={`block font-medium mt-4 ${dark ? 'text-white' : 'text-gray-900'}`}>{it.label}</span>{it.count === 0 ? <span className={`block text-xs italic mt-1 ${dark ? 'text-white/70' : 'text-gray-500'}`}>Sin recursos publicados</span> : null}</>;
                        return <li key={it.id} className="w-40">{it.link?.href ? <Link to={it.link.href} onClick={() => handlers.onMetric?.('resource_click')} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold rounded-2xl p-2">{inner}</Link> : <div className="p-2">{inner}</div>}</li>;
                    })}
                </ul>
                {d.button ? <div className="flex justify-center mt-12"><LandingButton b={d.button} dark={dark} handlers={handlers} chrome={chrome} /></div> : null}
            </div>
        </Section>
    );
};

/** La ilustración de manos unidas (SVG propio, sin terceros). */
const HandsIllustration = () => (
    <svg viewBox="0 0 320 240" className="w-full max-w-sm mx-auto" aria-hidden="true">
        <ellipse cx="160" cy="128" rx="138" ry="92" fill="#dbeafe" />
        <g fill="none" stroke="#17458f" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M40 60 C 80 70, 110 90, 138 118" /><path d="M118 96 l 22 22 l -30 6" />
            <path d="M280 60 C 240 70, 210 90, 182 118" /><path d="M202 96 l -22 22 l 30 6" />
            <path d="M40 200 C 80 190, 110 170, 138 142" /><path d="M118 164 l 22 -22 l -30 -6" />
            <path d="M280 200 C 240 190, 210 170, 182 142" /><path d="M202 164 l -22 -22 l 30 -6" />
        </g>
        <circle cx="160" cy="130" r="14" fill="#F5A623" stroke="#17458f" strokeWidth="4" />
    </svg>
);

/** Vinculación de clubes: la composición de dos columnas de `JoinSection`. */
const ClubsBlock = ({ block, handlers, chrome }: { block: ResolvedBlock; handlers: LandingHandlers; chrome: Chrome }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const textFirst = block.style.imageSide === 'right';
    const visual = d.image && !d.image.placeholder ? <LandingImage img={d.image} rounded="rounded-[40px]" cover={false} /> : d.illustration === 'hands' ? <HandsIllustration /> : (d.image ? <LandingImage img={d.image} className="aspect-[4/3]" rounded="rounded-[40px]" /> : null);
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center`}>
                <div className={textFirst ? '' : 'lg:order-2'}>
                    <Titulo id={block.id} text={d.title} dark={dark} align="left" className="mb-6" />
                    <Parrafo text={d.description} dark={dark} align="left" className="mb-8" />
                    {d.button ? <LandingButton b={d.button} dark={dark} handlers={handlers} chrome={chrome} /> : null}
                </div>
                {visual ? <div className={textFirst ? '' : 'lg:order-1'}>{visual}</div> : null}
            </div>
        </Section>
    );
};

/** Orientación: la banda de cierre de Quiénes Somos / Nuestras Causas (`py-12 md:py-16`, `max-w-4xl`, centrada). */
const ContactBlock = ({ block, handlers, chrome }: { block: ResolvedBlock; handlers: LandingHandlers; chrome: Chrome }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block} chrome={chrome}>
            <div className={`${CONTAINER} py-12 md:py-16`}>
                <div className="max-w-4xl mx-auto text-center">
                    <h2 id={`${block.id}-titulo`} className={`text-2xl md:text-3xl font-light mb-6 ${dark ? 'text-white' : 'text-[#39424a]'}`}>{d.title}</h2>
                    <Parrafo text={d.description} dark={dark} className="mb-8" />
                    {d.button ? <div className="flex justify-center"><LandingButton b={d.button} dark={dark} handlers={handlers} chrome={chrome} /></div> : null}
                </div>
            </div>
        </Section>
    );
};

const ProgramaLanding = ({ landing, handlers }: { landing: ResolvedLanding; handlers: LandingHandlers }) => {
    // El estilo del sitio: botones celestes de siempre o los configurables de un sitio Evento,
    // y su `actionBg` para la banda con textura. Es lo mismo que leen Action/Join/Spotlight.
    const { club } = useClub();
    const cta = useCtaButton();
    const chrome: Chrome = { cta, actionBg: (club as any)?.colors?.actionBg || null, isEventSite: hasCustomTheme((club as any)?.type) };
    return (
        <div className="font-sans">
            {landing.blocks.map(block => {
                switch (block.type) {
                    case 'hero': return <HeroBlock key={block.id} block={block} handlers={handlers} chrome={chrome} />;
                    case 'intro': return <IntroBlock key={block.id} block={block} handlers={handlers} chrome={chrome} />;
                    case 'cards': return <CardsBlock key={block.id} block={block} handlers={handlers} chrome={chrome} />;
                    case 'feature': return <FeatureBlock key={block.id} block={block} handlers={handlers} chrome={chrome} />;
                    case 'impact': return <ImpactBlock key={block.id} block={block} chrome={chrome} />;
                    case 'directory': return <DirectoryBlock key={block.id} block={block} handlers={handlers} chrome={chrome} />;
                    case 'donation': return <DonationBlock key={block.id} block={block} handlers={handlers} chrome={chrome} />;
                    case 'stories': return <StoriesBlock key={block.id} block={block} chrome={chrome} />;
                    case 'resources': return <ResourcesBlock key={block.id} block={block} handlers={handlers} chrome={chrome} />;
                    case 'clubs': return <ClubsBlock key={block.id} block={block} handlers={handlers} chrome={chrome} />;
                    case 'contact': return <ContactBlock key={block.id} block={block} handlers={handlers} chrome={chrome} />;
                    default: return null;
                }
            })}
        </div>
    );
};

export default ProgramaLanding;
