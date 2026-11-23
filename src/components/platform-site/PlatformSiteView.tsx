/**
 * Sitio web de Club Platform — el renderizador público (v4.1348.0)
 *
 * Pinta lo que `resolvePage` resolvió en el servidor con los MISMOS patrones
 * de la plantilla institucional de los sitios del ecosistema (los que ya usa
 * la landing de Programas, v4.1282), no con medidas propias:
 *   · contenedor `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` y `py-16 md:py-20`;
 *   · fondos del tema: `bg-rotary-blue`, `bg-rotary-navy`, `bg-rotary-concrete`
 *     y la textura `SITE_ACTION_BG` de «Somos gente de acción»;
 *   · botones `px-8 py-3.5 rounded-full shadow-lg` con `ctaSkin(CTA_SOLID)`;
 *   · títulos `text-3xl md:text-4xl font-light`; tarjetas de ícono con el
 *     círculo `bg-sky-100`; el pie con `SITE_FOOTER_BG`.
 *
 * La cabecera y la barra superior son las de un sitio institucional (v4.1349).
 * Lo propio de este sitio es su marca, su pie y la composición esquemática
 * del producto. Esa
 * composición NO es una captura ni muestra cifras: representa el panel.
 *
 * ⚠️ Las clases `bg-rotary-*` NO admiten modificador de opacidad (v4.719):
 * `bg-rotary-navy/95` no existe y la cabecera quedaba transparente, con el
 * menú blanco sobre blanco. Lo fija `test:platform-site`.
 *
 * Todos los componentes van FUERA del principal (regla del repositorio).
 */
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronDown, ExternalLink, Image as ImageIcon, Loader2, LogIn, Menu, X } from 'lucide-react';
import PlatformIcon from './PlatformIcon';
import PublicTopBar from '../PublicTopBar';
import { SITE_ACTION_BG, SITE_FOOTER_BG } from '../../lib/siteChrome';
import { CTA_SOLID, ctaSkin } from '../../lib/ctaStyles';
import { leerJson } from '../../lib/leerJson';
import { ACCENTS, BACKGROUND_CLASS, isDarkBackground, type ResolvedBlock, type ResolvedButton, type ResolvedChrome, type ResolvedImage, type ResolvedPage } from '../../lib/platformSiteSpec';

const API = import.meta.env.VITE_API_URL || '/api';

const CONTAINER = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
const PAD: Record<string, string> = { compact: 'py-10 md:py-12', normal: 'py-16 md:py-20', wide: 'py-20 md:py-28' };
const BTN_SHAPE = 'inline-flex items-center justify-center gap-2 font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rotary-gold min-h-[44px]';
const H2_LIGHT = 'text-3xl md:text-4xl font-light text-gray-800';
const H2_DARK = 'text-3xl md:text-4xl font-light text-white';
const P_LIGHT = 'text-gray-600 text-base md:text-lg leading-relaxed';
const P_DARK = 'text-white/90 text-base md:text-lg leading-relaxed';

interface Ctx { accent: string; preview: boolean; previewToken?: string }

const accentHex = (id: string) => ACCENTS.find(a => a.id === id)?.hex || '#E29C00';
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Un enlace resuelto: ancla con desplazamiento suave, ruta interna o enlace externo. */
const SmartLink = ({ b, className, style, children, onNavigate }: { b: ResolvedButton; className?: string; style?: CSSProperties; children: ReactNode; onNavigate?: () => void }) => {
    if (b.kind === 'external') return <a className={className} style={style} href={b.href} {...(b.sameTab ? {} : { target: '_blank', rel: 'noopener noreferrer' })} onClick={onNavigate}>{children}</a>;
    if (b.kind === 'anchor') {
        return (
            <a className={className} style={style} href={b.href} onClick={e => {
                const el = document.getElementById(String(b.href).slice(1));
                if (el) { e.preventDefault(); el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' }); window.history.replaceState(null, '', b.href); }
                onNavigate?.();
            }}>{children}</a>
        );
    }
    return <Link className={className} style={style} to={b.href || '/'} onClick={onNavigate} aria-current={b.current ? 'page' : undefined}>{children}</Link>;
};

const SiteButton = ({ b, dark, ctx, className = '' }: { b: ResolvedButton | null; dark: boolean; ctx: Ctx; className?: string }) => {
    if (!b) return null;
    const gold = b.variant === 'gold';
    const solid = b.variant === 'primary' && !dark;
    const skin = gold ? 'text-gray-900 hover:brightness-95' : solid ? ctaSkin(CTA_SOLID) : dark ? (b.variant === 'primary' ? 'bg-white text-rotary-blue hover:bg-sky-50' : 'bg-white/10 text-white border border-white/30 hover:bg-white/20 shadow-none') : 'bg-sky-100 text-rotary-blue hover:bg-sky-200';
    return (
        <SmartLink b={b} className={`${BTN_SHAPE} ${skin} ${className}`} style={gold ? { backgroundColor: accentHex(ctx.accent) } : undefined}>
            {b.icon ? <PlatformIcon id={b.icon} className="w-5 h-5" /> : null}<span>{b.label}</span>{b.kind === 'external' && !b.sameTab ? <ExternalLink className="w-4 h-4 opacity-70" aria-hidden /> : null}
        </SmartLink>
    );
};

const SiteImage = ({ img, className = '', rounded = 'rounded-3xl' }: { img: ResolvedImage | null; className?: string; rounded?: string }) => {
    if (!img) return null;
    if (img.placeholder) {
        return (
            <div className={`${rounded} bg-sky-200/70 border border-sky-200 flex flex-col items-center justify-center text-slate-600 aspect-[4/3] ${className}`} role="img" aria-label="Espacio para una imagen real">
                <ImageIcon className="w-14 h-14 text-slate-500/70" aria-hidden /><span className="text-sm mt-3">Captura o imagen real</span>
            </div>
        );
    }
    return <img src={img.url} alt={img.alt} className={`${rounded} w-full h-auto ${className}`} style={{ objectPosition: `${img.focalX}% ${img.focalY}%` }} loading="lazy" decoding="async" />;
};

/** Aparición al entrar en pantalla. Con «Reducir movimiento», nada se mueve. */
const Reveal = ({ mode, children }: { mode: string; children: ReactNode }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(mode === 'none' || reducedMotion() || typeof IntersectionObserver === 'undefined');
    useEffect(() => {
        if (shown || !ref.current) return;
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.08 });
        io.observe(ref.current);
        return () => io.disconnect();
    }, [shown]);
    return <div ref={ref} className={`transition-all duration-700 ease-out ${shown ? 'opacity-100 translate-y-0' : `opacity-0 ${mode === 'rise' ? 'translate-y-6' : ''}`}`}>{children}</div>;
};

const Section = ({ block, children, className = '' }: { block: ResolvedBlock; children: ReactNode; className?: string }) => {
    const bg = block.style.background;
    const geo = bg === 'geo';
    return (
        <section id={block.id} data-block={block.type} className={`relative overflow-hidden scroll-mt-20 ${geo ? '' : BACKGROUND_CLASS[bg]?.section || 'bg-white'} ${isDarkBackground(bg) ? 'text-white' : 'text-gray-900'} ${className}`} style={geo ? (SITE_ACTION_BG as CSSProperties) : undefined} aria-labelledby={`${block.id}-titulo`}>
            {!block.ready ? <div className="relative z-10 bg-amber-100 text-amber-900 text-xs text-center py-1.5 px-4">Vista previa: este contenedor no se muestra en público ({block.notes[0] || 'faltan datos'}).</div> : block.notes.length ? <div className="relative z-10 bg-amber-50 text-amber-900 text-xs text-center py-1.5 px-4">Vista previa: {block.notes[0]}</div> : null}
            <div className={`relative z-10 ${CONTAINER} ${PAD[block.style.spacing] || PAD.normal}`}><Reveal mode={block.style.animation}>{children}</Reveal></div>
        </section>
    );
};

const Heading = ({ block, title, description, align }: { block: ResolvedBlock; title: string; description?: string; align?: 'left' | 'center' }) => {
    const dark = isDarkBackground(block.style.background); const a = align || block.style.align;
    return (
        <div className={`${a === 'center' ? 'text-center mx-auto' : ''} max-w-3xl mb-12`}>
            {title ? <h2 id={`${block.id}-titulo`} className={`${dark ? H2_DARK : H2_LIGHT} leading-tight`}>{title}</h2> : <h2 id={`${block.id}-titulo`} className="sr-only">{block.name}</h2>}
            {description ? <p className={`${dark ? P_DARK : P_LIGHT} mt-4 whitespace-pre-line`}>{description}</p> : null}
        </div>
    );
};

// ── La composición del producto ───────────────────────────────────────

/**
 * Representación ESQUEMÁTICA del panel: barra lateral de módulos, tres
 * tarjetas y una curva. Sin cifras, sin nombres de clubes, sin datos: no es
 * una captura. Para mostrar una pantalla real, la portada admite una imagen.
 */
const ProductVisual = ({ accent }: { accent: string }) => (
    <div className="relative" role="img" aria-label="Representación esquemática del panel de Club Platform: módulos de sitios web, contenidos y analítica">
        <div className="rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden" aria-hidden="true">
            <div className="flex items-center gap-1.5 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300" /><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /><span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                <span className="ml-3 h-5 flex-1 max-w-[220px] rounded-md bg-white border border-gray-200 text-[10px] text-gray-400 flex items-center px-2">app.clubplatform.org</span>
            </div>
            <div className="flex">
                <div className="w-12 shrink-0 border-r border-gray-100 py-4 flex flex-col items-center gap-4 text-gray-300">
                    {['layout', 'globe', 'file', 'chart', 'megaphone', 'shield'].map((i, n) => <span key={i} className={n === 3 ? 'text-rotary-blue' : ''}><PlatformIcon id={i} className="w-5 h-5" /></span>)}
                </div>
                <div className="flex-1 p-4 sm:p-5 space-y-4 text-left">
                    <div className="grid grid-cols-3 gap-3">
                        {[['globe', 'Sitios web'], ['file', 'Contenidos'], ['chart', 'Analítica']].map(([i, l]) => (
                            <div key={l} className="rounded-xl border border-gray-100 p-3">
                                <span className="w-8 h-8 rounded-lg bg-sky-100 text-rotary-blue flex items-center justify-center"><PlatformIcon id={i} className="w-4 h-4" /></span>
                                <p className="text-[11px] font-semibold text-gray-700 mt-2">{l}</p>
                                <span className="block h-1.5 w-2/3 rounded-full bg-gray-100 mt-2" />
                            </div>
                        ))}
                    </div>
                    <div className="rounded-xl border border-gray-100 p-3">
                        <div className="flex items-center justify-between"><span className="h-2 w-28 rounded-full bg-gray-200" /><span className="h-2 w-12 rounded-full bg-gray-100" /></div>
                        <svg viewBox="0 0 320 90" className="w-full mt-3" preserveAspectRatio="none">
                            <path d="M0 70 C 40 66, 50 34, 80 40 S 130 74, 160 52 S 210 14, 240 34 S 290 58, 320 30 L 320 90 L 0 90 Z" fill="#0c3c7c" opacity="0.08" />
                            <path d="M0 70 C 40 66, 50 34, 80 40 S 130 74, 160 52 S 210 14, 240 34 S 290 58, 320 30" fill="none" stroke="#0c3c7c" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
        <span className="absolute -bottom-3 -left-3 h-16 w-16 rounded-2xl -z-10" style={{ backgroundColor: accentHex(accent) }} aria-hidden="true" />
    </div>
);

// ── Contenedores ──────────────────────────────────────────────────────

const HeroBlock = ({ block, ctx }: { block: ResolvedBlock; ctx: Ctx }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const visual = d.visual === 'product' ? <ProductVisual accent={ctx.accent} /> : d.image ? <SiteImage img={d.image} className="shadow-2xl" rounded="rounded-2xl" /> : null;
    const textFirst = block.style.imageSide === 'right';
    const centered = !visual || block.style.align === 'center';
    const bg = block.style.background; const geo = bg === 'geo';
    return (
        <section id={block.id} data-block="hero" className={`relative overflow-hidden ${geo ? '' : BACKGROUND_CLASS[bg]?.section || 'bg-rotary-navy'} ${dark ? 'text-white' : 'text-gray-900'}`} style={geo ? (SITE_ACTION_BG as CSSProperties) : undefined} aria-labelledby={`${block.id}-titulo`}>
            <div className={`${CONTAINER} py-16 md:py-24 ${visual && !centered ? 'grid lg:grid-cols-2 gap-12 lg:gap-16 items-center' : ''}`}>
                <div className={`${centered ? 'text-center max-w-4xl mx-auto' : ''} ${textFirst ? '' : 'lg:order-2'}`}>
                    {d.eyebrow ? <p className={`text-[11px] sm:text-xs font-bold tracking-[0.18em] uppercase mb-5 ${dark ? 'text-sky-200' : 'text-rotary-blue'}`}>{d.eyebrow}</p> : null}
                    <h1 id={`${block.id}-titulo`} className={`text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight tracking-tight ${dark ? 'text-white' : 'text-rotary-blue'}`}>{d.title}</h1>
                    {d.description ? <p className={`mt-6 text-base md:text-lg leading-relaxed ${centered ? 'mx-auto' : ''} max-w-2xl ${dark ? 'text-white/85' : 'text-gray-600'}`}>{d.description}</p> : null}
                    {d.buttons.length ? <div className={`flex flex-col sm:flex-row flex-wrap gap-3 mt-9 ${centered ? 'justify-center' : ''}`}>{d.buttons.map((b: ResolvedButton, i: number) => <SiteButton key={i} b={b} dark={dark} ctx={ctx} />)}</div> : null}
                </div>
                {visual ? <div className={`${centered ? 'max-w-3xl mx-auto mt-14' : ''} ${textFirst ? '' : 'lg:order-1'}`}>{visual}</div> : null}
            </div>
        </section>
    );
};

const AboutBlock = ({ block, ctx }: { block: ResolvedBlock; ctx: Ctx }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block}>
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div className={block.style.imageSide === 'right' ? '' : 'lg:order-2'}>
                    <h2 id={`${block.id}-titulo`} className={`${dark ? H2_DARK : H2_LIGHT} leading-tight mb-6`}>{d.title}</h2>
                    {d.description ? <p className={`${dark ? P_DARK : P_LIGHT} whitespace-pre-line`}>{d.description}</p> : null}
                    {d.button ? <div className="mt-8"><SiteButton b={d.button} dark={dark} ctx={ctx} /></div> : null}
                </div>
                <div className={block.style.imageSide === 'right' ? '' : 'lg:order-1'}>
                    {d.image ? <SiteImage img={d.image} rounded="rounded-[40px]" /> : (
                        <ol className="space-y-3" aria-label="Cómo se organiza el ecosistema">
                            {d.flow.map((f: any, i: number) => (
                                <li key={f.id}>
                                    <div className={`flex items-start gap-4 rounded-2xl p-5 ${dark ? 'bg-white/10 border border-white/15' : 'bg-gray-50 border border-gray-100'}`}>
                                        <span className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${dark ? 'bg-white text-rotary-blue' : 'bg-sky-100 text-rotary-blue'}`}><PlatformIcon id={f.icon} className="w-6 h-6" /></span>
                                        <div><h3 className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{f.label}</h3>{f.description ? <p className={`text-sm leading-relaxed mt-1 ${dark ? 'text-white/80' : 'text-gray-600'}`}>{f.description}</p> : null}</div>
                                    </div>
                                    {i < d.flow.length - 1 ? <div className="flex justify-center py-1" aria-hidden="true"><ChevronDown className={`w-5 h-5 ${dark ? 'text-white/50' : 'text-gray-300'}`} /></div> : null}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </Section>
    );
};

const SolutionsBlock = ({ block, ctx }: { block: ResolvedBlock; ctx: Ctx }) => {
    const d = block.data;
    return (
        <Section block={block}>
            <Heading block={block} title={d.title} description={d.description} />
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {d.items.map((it: any) => (
                    <li key={it.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow flex flex-col text-left">
                        {it.image ? <img src={it.image.url} alt={it.image.alt} className="w-full h-36 object-cover" loading="lazy" decoding="async" /> : null}
                        <div className="p-6 flex flex-col flex-1">
                            <span className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mb-4 text-rotary-blue"><PlatformIcon id={it.icon} className="w-6 h-6" /></span>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">{it.title}</h3>
                            {it.description ? <p className="text-gray-600 text-sm leading-relaxed flex-1">{it.description}</p> : null}
                            {ctx.preview && !it.verified ? <p className="mt-3 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2.5 py-1 self-start">Sin verificar: no se publica</p> : null}
                            {it.link ? <SmartLink b={it.link} className="inline-flex items-center gap-1 text-rotary-blue hover:text-sky-700 font-bold text-sm mt-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold rounded">{it.link.label} <ArrowRight className="w-4 h-4" aria-hidden /></SmartLink> : null}
                        </div>
                    </li>
                ))}
            </ul>
        </Section>
    );
};

const StepsBlock = ({ block, ctx }: { block: ResolvedBlock; ctx: Ctx }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const cols = d.steps.length >= 4 ? 'lg:grid-cols-4' : d.steps.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';
    return (
        <Section block={block}>
            <Heading block={block} title={d.title} description={d.description} />
            <ol className={`grid grid-cols-1 sm:grid-cols-2 ${cols} gap-6`}>
                {d.steps.map((s: any, i: number) => (
                    <li key={s.id} className={`relative rounded-2xl p-7 text-left ${dark ? 'bg-white/10 border border-white/15' : 'bg-gray-50 border border-gray-100'}`}>
                        <span className="text-4xl font-light tabular-nums" style={{ color: dark ? accentHex(ctx.accent) : '#0c3c7c' }} aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                        <h3 className={`text-lg font-bold mt-3 mb-2 ${dark ? 'text-white' : 'text-gray-900'}`}><span className="sr-only">Paso {i + 1}: </span>{s.title}</h3>
                        {s.description ? <p className={`text-sm leading-relaxed ${dark ? 'text-white/80' : 'text-gray-600'}`}>{s.description}</p> : null}
                    </li>
                ))}
            </ol>
        </Section>
    );
};

/** El sistema central en el medio y sus servicios alrededor. En móvil, una lista. */
const ArchitectureBlock = ({ block, ctx }: { block: ResolvedBlock; ctx: Ctx }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const half = Math.ceil(d.nodes.length / 2);
    const node = (n: any) => (
        <li key={n.id} className={`flex items-start gap-3 rounded-2xl p-4 text-left ${dark ? 'bg-white/10 border border-white/15' : 'bg-white border border-gray-100 shadow-sm'}`}>
            <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${dark ? 'bg-white text-rotary-blue' : 'bg-sky-100 text-rotary-blue'}`}><PlatformIcon id={n.icon} className="w-5 h-5" /></span>
            <div><h3 className={`font-bold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>{n.label}</h3>{n.description ? <p className={`text-xs leading-relaxed mt-0.5 ${dark ? 'text-white/75' : 'text-gray-600'}`}>{n.description}</p> : null}</div>
        </li>
    );
    return (
        <Section block={block}>
            <Heading block={block} title={d.title} description={d.description} />
            <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-6 lg:gap-10 items-center">
                <ul className="space-y-4 order-2 lg:order-1">{d.nodes.slice(0, half).map(node)}</ul>
                <div className="order-1 lg:order-2 flex justify-center">
                    <div className="relative w-44 h-44 md:w-52 md:h-52 rounded-full flex flex-col items-center justify-center text-center p-4 bg-white shadow-2xl" style={{ boxShadow: `0 0 0 10px ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(12,60,124,0.08)'}` }}>
                        <span className="w-12 h-12 rounded-full flex items-center justify-center text-gray-900 mb-2" style={{ backgroundColor: accentHex(ctx.accent) }}><PlatformIcon id="layers" className="w-6 h-6" /></span>
                        <p className="font-bold text-rotary-blue leading-tight" data-no-translate>{d.hub.label}</p>
                        {d.hub.caption ? <p className="text-xs text-gray-500 mt-0.5">{d.hub.caption}</p> : null}
                    </div>
                </div>
                <ul className="space-y-4 order-3">{d.nodes.slice(half).map(node)}</ul>
            </div>
        </Section>
    );
};

const BenefitsBlock = ({ block }: { block: ResolvedBlock }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block}>
            <Heading block={block} title={d.title} description={d.description} />
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {d.items.map((it: any) => (
                    <li key={it.id} className="flex items-start gap-4 text-left">
                        <span className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${dark ? 'bg-white text-rotary-blue' : 'bg-sky-100 text-rotary-blue'}`}><PlatformIcon id={it.icon} className="w-6 h-6" /></span>
                        <div><h3 className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{it.title}</h3>{it.description ? <p className={`text-sm leading-relaxed mt-1 ${dark ? 'text-white/80' : 'text-gray-600'}`}>{it.description}</p> : null}</div>
                    </li>
                ))}
            </ul>
        </Section>
    );
};

const SitesBlock = ({ block }: { block: ResolvedBlock }) => {
    const d = block.data;
    return (
        <Section block={block}>
            <Heading block={block} title={d.title} description={d.description} />
            <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {d.sites.map((s: any) => {
                    const inner = (
                        <>
                            <span className="h-16 flex items-center justify-center">{s.logo ? <img src={s.logo} alt="" className="max-h-16 max-w-full object-contain" loading="lazy" decoding="async" /> : <PlatformIcon id="globe" className="w-8 h-8 text-rotary-blue" />}</span>
                            <span className="block font-bold text-gray-900 text-sm mt-3 leading-snug" data-no-translate>{s.name}</span>
                            {s.kind ? <span className="block text-xs text-gray-500 mt-0.5">{s.kind}</span> : null}
                            {s.url ? <span className="inline-flex items-center gap-1 text-rotary-blue text-xs font-semibold mt-2">Visitar sitio <ExternalLink className="w-3 h-3" aria-hidden /></span> : null}
                        </>
                    );
                    return <li key={s.id}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="block h-full bg-white rounded-2xl border border-gray-100 p-5 text-center hover:shadow-lg transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold">{inner}</a> : <div className="h-full bg-white rounded-2xl border border-gray-100 p-5 text-center">{inner}</div>}</li>;
                })}
            </ul>
            {!d.sites.length ? <p className="text-center text-sm text-gray-500 italic">Elige en el editor los sitios publicados que quieres mostrar.</p> : null}
        </Section>
    );
};

const FeatureBlock = ({ block, ctx }: { block: ResolvedBlock; ctx: Ctx }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background); const textFirst = block.style.imageSide === 'right';
    return (
        <Section block={block}>
            <div className={`grid grid-cols-1 ${d.image ? 'lg:grid-cols-2' : ''} gap-10 lg:gap-16 items-center`}>
                <div className={textFirst ? '' : 'lg:order-2'}>
                    <h2 id={`${block.id}-titulo`} className={`${dark ? H2_DARK : H2_LIGHT} leading-tight mb-6`}>{d.title}</h2>
                    {d.description ? <p className={`${dark ? P_DARK : P_LIGHT} whitespace-pre-line`}>{d.description}</p> : null}
                    {d.button ? <div className="mt-8"><SiteButton b={d.button} dark={dark} ctx={ctx} /></div> : null}
                </div>
                {d.image ? <div className={textFirst ? '' : 'lg:order-1'}><SiteImage img={d.image} rounded="rounded-[40px]" /></div> : null}
            </div>
        </Section>
    );
};

const TextBlock = ({ block }: { block: ResolvedBlock }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block}>
            <div className={`max-w-3xl ${block.style.align === 'center' ? 'mx-auto text-center' : ''}`}>
                {d.title ? <h2 id={`${block.id}-titulo`} className={`${dark ? H2_DARK : H2_LIGHT} leading-tight mb-6`}>{d.title}</h2> : <h2 id={`${block.id}-titulo`} className="sr-only">{block.name}</h2>}
                {String(d.body || '').split(/\n{2,}/).filter(Boolean).map((p: string, i: number) => <p key={i} className={`${dark ? P_DARK : P_LIGHT} whitespace-pre-line mb-5`}>{p}</p>)}
            </div>
        </Section>
    );
};

const FaqBlock = ({ block }: { block: ResolvedBlock }) => {
    const d = block.data;
    return (
        <Section block={block}>
            <Heading block={block} title={d.title} description={d.description} />
            <div className="max-w-3xl mx-auto space-y-3">
                {d.items.map((it: any) => (
                    <details key={it.id} className="group bg-white rounded-2xl border border-gray-100 open:shadow-md transition-shadow">
                        <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-6 py-4 font-semibold text-gray-900 text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold [&::-webkit-details-marker]:hidden">
                            <span>{it.question}</span><ChevronDown className="w-5 h-5 shrink-0 text-rotary-blue transition-transform group-open:rotate-180" aria-hidden />
                        </summary>
                        <p className="px-6 pb-5 text-gray-600 leading-relaxed whitespace-pre-line text-left">{it.answer}</p>
                    </details>
                ))}
            </div>
        </Section>
    );
};

const FIELD = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue';

const ContactForm = ({ data, ctx }: { data: any; ctx: Ctx }) => {
    const [f, setF] = useState({ name: '', email: '', organization: '', roleTitle: '', country: '', message: '', consent: false, website: '' });
    const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok'>('idle');
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
    const enviar = async (e: FormEvent) => {
        e.preventDefault(); setError(''); setEstado('enviando');
        try {
            const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20000);
            const r = await fetch(`${API}/platform-site/public/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, pagePath: window.location.pathname, t: ctx.previewToken }), signal: ctrl.signal });
            clearTimeout(timer);
            const { data: j } = await leerJson<any>(r);
            if (!r.ok) { setError(j?.error || 'No se pudo enviar. Inténtalo de nuevo.'); setEstado('idle'); return; }
            setOkMsg(j?.preview ? `Vista previa: el formulario funciona, pero no se guardó ni se envió nada. ${j?.message || ''}` : (j?.message || data.successMessage)); setEstado('ok');
        } catch { setError('No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.'); setEstado('idle'); }
    };
    if (estado === 'ok') return <div className="bg-white rounded-3xl p-8 text-center text-gray-800 shadow-2xl" role="status"><CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" aria-hidden /><p className="font-semibold">{okMsg}</p></div>;
    return (
        <form onSubmit={enviar} className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl text-left text-gray-900 space-y-4" noValidate>
            <h3 className="text-xl font-bold text-gray-900">{data.formTitle}</h3>
            <div className="grid sm:grid-cols-2 gap-4">
                <label className="block text-sm font-semibold text-gray-700">Nombre<input className={`${FIELD} mt-1 font-normal`} value={f.name} onChange={e => set('name', e.target.value)} autoComplete="name" required maxLength={120} /></label>
                <label className="block text-sm font-semibold text-gray-700">Correo electrónico<input type="email" className={`${FIELD} mt-1 font-normal`} value={f.email} onChange={e => set('email', e.target.value)} autoComplete="email" required maxLength={160} /></label>
                <label className="block text-sm font-semibold text-gray-700">Club u organización<input className={`${FIELD} mt-1 font-normal`} value={f.organization} onChange={e => set('organization', e.target.value)} autoComplete="organization" maxLength={160} /></label>
                <label className="block text-sm font-semibold text-gray-700">Cargo<input className={`${FIELD} mt-1 font-normal`} value={f.roleTitle} onChange={e => set('roleTitle', e.target.value)} autoComplete="organization-title" maxLength={120} /></label>
            </div>
            <label className="block text-sm font-semibold text-gray-700">País<input className={`${FIELD} mt-1 font-normal`} value={f.country} onChange={e => set('country', e.target.value)} autoComplete="country-name" maxLength={80} /></label>
            <label className="block text-sm font-semibold text-gray-700">Mensaje<textarea className={`${FIELD} mt-1 font-normal min-h-[110px]`} value={f.message} onChange={e => set('message', e.target.value)} maxLength={2000} /></label>
            {/* Trampa para robots: fuera de la vista y del orden de tabulación. */}
            <div className="hidden" aria-hidden="true"><label>Sitio web<input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} /></label></div>
            <label className="flex items-start gap-3 text-sm text-gray-600"><input type="checkbox" className="mt-1 w-4 h-4 rounded border-gray-300" checked={f.consent} onChange={e => set('consent', e.target.checked)} required /><span>{data.consentText}</span></label>
            {error ? <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-4 py-2.5" role="alert">{error}</p> : null}
            <button type="submit" disabled={estado === 'enviando'} className={`${BTN_SHAPE} ${ctaSkin(CTA_SOLID)} w-full disabled:opacity-60`}>{estado === 'enviando' ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : null}{data.submitLabel}</button>
        </form>
    );
};

const ContactBlock = ({ block, ctx }: { block: ResolvedBlock; ctx: Ctx }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block}>
            <div className={`grid grid-cols-1 ${d.formEnabled ? 'lg:grid-cols-2' : ''} gap-10 lg:gap-16 items-center`}>
                <div className={d.formEnabled ? '' : 'text-center max-w-3xl mx-auto'}>
                    <h2 id={`${block.id}-titulo`} className={`${dark ? H2_DARK : H2_LIGHT} leading-tight mb-6`}>{d.title}</h2>
                    {d.description ? <p className={`${dark ? P_DARK : P_LIGHT} whitespace-pre-line`}>{d.description}</p> : null}
                    {d.button ? <div className="mt-8"><SiteButton b={d.button} dark={dark} ctx={ctx} /></div> : null}
                </div>
                {d.formEnabled ? <ContactForm data={d} ctx={ctx} /> : null}
            </div>
        </Section>
    );
};

// ── Cabecera y pie ────────────────────────────────────────────────────

/**
 * La cabecera es la de un sitio institucional del ecosistema, NO una propia
 * (v4.1349): la barra superior `bg-rotary-topbar` con Endpolio.org · My Rotary ·
 * idioma (`PublicTopBar`, la misma del `Navbar`), y debajo la barra blanca
 * `bg-white shadow-sm sticky` con los enlaces `text-rotary-blue font-medium
 * text-sm hover:text-rotary-gold`, el botón en píldora `CTA_SOLID` y «Iniciar
 * sesión» con contorno `ring-inset`. Las clases son las de `Navbar.tsx`: al
 * cambiar allá, cambiar acá. Lo fija `test:platform-site`.
 */
const NAV_LINK = 'text-rotary-blue font-medium text-sm hover:text-rotary-gold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold rounded';
const HEADER_CTA_SHAPE = 'items-center justify-center gap-2 font-bold text-sm px-5 py-2.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rotary-gold';
const LOGIN_SKIN = 'bg-white text-rotary-blue ring-1 ring-inset ring-rotary-blue/25 hover:bg-rotary-blue hover:text-white hover:ring-rotary-blue';

const Brand = ({ chrome }: { chrome: ResolvedChrome }) => (
    <Link to={chrome.home} className="flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold rounded" aria-label={`${chrome.name} — inicio`} data-no-translate>
        {chrome.logoUrl ? <img src={chrome.logoUrl} alt={chrome.name} className="w-auto h-auto max-h-[60px] max-w-[200px] object-contain object-left" /> : (
            <span className="flex flex-col leading-tight font-bold text-xl">
                <span className="text-rotary-blue">Club Platform</span>
                <span><span style={{ color: accentHex(chrome.accent === 'white' ? 'gold' : chrome.accent) }}>for</span> <span className="text-rotary-blue">Rotary</span></span>
            </span>
        )}
    </Link>
);

const SiteHeader = ({ chrome }: { chrome: ResolvedChrome }) => {
    const [open, setOpen] = useState(false);
    useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, [open]);
    const close = () => setOpen(false);
    return (
        <>
            <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-rotary-blue focus:px-4 focus:py-2 focus:rounded-lg focus:z-[80]">Saltar al contenido</a>
            <PublicTopBar rotaryLinks />
            <header className="bg-white shadow-sm sticky top-0 z-50 transition-all duration-300">
                <div className={CONTAINER}>
                    <div className="flex items-center justify-between min-h-[4rem] py-2 gap-4">
                        <Brand chrome={chrome} />
                        <nav className="hidden md:flex items-center space-x-6" aria-label="Principal">{chrome.nav.map(l => <SmartLink key={l.id} b={l} className={NAV_LINK}>{l.label}</SmartLink>)}</nav>
                        <div className="flex items-center gap-3">
                            {chrome.cta ? <SmartLink b={chrome.cta} className={`hidden lg:inline-flex ${HEADER_CTA_SHAPE} ${ctaSkin(CTA_SOLID)}`}>{chrome.cta.label}</SmartLink> : null}
                            {chrome.showLogin ? <a href={chrome.loginHref} className={`hidden sm:inline-flex ${HEADER_CTA_SHAPE} ${LOGIN_SKIN}`}><LogIn className="w-4 h-4" aria-hidden /> Iniciar sesión</a> : null}
                            <button type="button" className="md:hidden text-gray-600 p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold" aria-expanded={open} aria-controls="menu-movil" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen(o => !o)}>{open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}</button>
                        </div>
                    </div>
                    {open ? (
                        <nav id="menu-movil" className="md:hidden py-4 border-t" aria-label="Principal (móvil)">
                            <div className="flex flex-col space-y-3 font-medium">
                                {chrome.nav.map(l => <SmartLink key={l.id} b={l} className="text-rotary-blue" onNavigate={close}>{l.label}</SmartLink>)}
                                {chrome.cta ? <SmartLink b={chrome.cta} className={`inline-flex ${HEADER_CTA_SHAPE} ${ctaSkin(CTA_SOLID)}`} onNavigate={close}>{chrome.cta.label}</SmartLink> : null}
                                {chrome.showLogin ? <a href={chrome.loginHref} className={`inline-flex ${HEADER_CTA_SHAPE} ${LOGIN_SKIN}`}><LogIn className="w-4 h-4" aria-hidden /> Iniciar sesión</a> : null}
                            </div>
                        </nav>
                    ) : null}
                </div>
            </header>
        </>
    );
};

const SiteFooter = ({ chrome }: { chrome: ResolvedChrome }) => (
    <footer className="text-white/80" style={{ backgroundColor: SITE_FOOTER_BG }}>
        <div className={`${CONTAINER} py-12 grid md:grid-cols-[2fr_1fr] gap-8`}>
            <div>
                <p className="text-lg font-bold text-white" data-no-translate>Club Platform <span style={{ color: accentHex(chrome.accent === 'white' ? 'gold' : chrome.accent) }}>for Rotary</span></p>
                {chrome.footer.text ? <p className="text-sm leading-relaxed mt-3 max-w-xl whitespace-pre-line">{chrome.footer.text}</p> : null}
            </div>
            <nav aria-label="Pie de página" className="flex flex-col gap-2 text-sm md:items-end">
                {chrome.footer.links.map(l => <SmartLink key={l.id} b={l} className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold rounded">{l.label}</SmartLink>)}
                {chrome.showLogin ? <a href={chrome.loginHref} className="hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold rounded">Ingresar al panel</a> : null}
            </nav>
        </div>
        <div className="bg-rotary-topbar">
            <div className={`${CONTAINER} py-4 text-xs text-white/70 flex flex-wrap items-center justify-between gap-2`}>
                <span>© {new Date().getFullYear()} <span data-no-translate>{chrome.name}</span></span>
                {chrome.footer.note ? <span>{chrome.footer.note}</span> : null}
            </div>
        </div>
    </footer>
);

const BlockSwitch = ({ block, ctx }: { block: ResolvedBlock; ctx: Ctx }) => {
    switch (block.type) {
        case 'hero': return <HeroBlock block={block} ctx={ctx} />;
        case 'about': return <AboutBlock block={block} ctx={ctx} />;
        case 'solutions': return <SolutionsBlock block={block} ctx={ctx} />;
        case 'steps': return <StepsBlock block={block} ctx={ctx} />;
        case 'architecture': return <ArchitectureBlock block={block} ctx={ctx} />;
        case 'benefits': return <BenefitsBlock block={block} />;
        case 'sites': return <SitesBlock block={block} />;
        case 'feature': return <FeatureBlock block={block} ctx={ctx} />;
        case 'text': return <TextBlock block={block} />;
        case 'faq': return <FaqBlock block={block} />;
        case 'contact': return <ContactBlock block={block} ctx={ctx} />;
        default: return null;
    }
};

const PlatformSiteView = ({ page, preview = false, previewToken }: { page: ResolvedPage; preview?: boolean; previewToken?: string }) => {
    const ctx: Ctx = { accent: page.chrome.accent, preview, previewToken };
    return (
        <div className="min-h-screen bg-white flex flex-col font-sans text-gray-800" lang={page.chrome.language}>
            <SiteHeader chrome={page.chrome} />
            <main id="contenido" className="flex-1">
                {page.blocks.map(b => <BlockSwitch key={b.id} block={b} ctx={ctx} />)}
                {!page.blocks.length ? <div className={`${CONTAINER} py-32 text-center text-gray-500`}>Esta página todavía no tiene contenido publicado.</div> : null}
            </main>
            <SiteFooter chrome={page.chrome} />
        </div>
    );
};

export default PlatformSiteView;
