/**
 * Programas — el renderizador de la página pública por contenedores (v4.1281.0)
 *
 * Pinta lo que `resolveLanding` resolvió en el servidor: cada contenedor con
 * su fondo (blanco, azul claro, azul institucional, azul marino, gris), su
 * contenido y sus botones ya resueltos. En vista previa pinta los marcadores
 * («Fotografía real autorizada», «Indicadores por validar»); en público
 * esos contenedores no llegan.
 *
 * Todos los componentes van FUERA del principal (regla del repositorio).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Image as ImageIcon, MapPin, Search } from 'lucide-react';
import ProgramIcon from './ProgramIcon';
import { BACKGROUND_CLASS, isDarkBackground, type ResolvedBlock, type ResolvedButton, type ResolvedImage, type ResolvedLanding } from '../../lib/programLandingSpec';
import { dateLabel } from '../../lib/programSpec';

export interface LandingHandlers {
    onForm: (form: string) => void;
    onDonation: (donation: any) => void;
    onMetric?: (metric: string) => void;
}

const CONTAINER = 'max-w-6xl mx-auto px-4 sm:px-6';

/** El botón redondeado de la referencia: fondo azul muy claro con ícono. */
export const LandingButton = ({ b, dark, handlers, className = '' }: { b: ResolvedButton | null; dark: boolean; handlers: LandingHandlers; className?: string }) => {
    if (!b) return null;
    const base = 'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold min-h-[44px]';
    const skin = b.variant === 'primary' && !dark ? 'bg-rotary-blue text-white hover:bg-rotary-navy' : b.variant === 'gold' ? 'bg-rotary-gold text-gray-900 hover:brightness-95' : 'bg-sky-100 text-rotary-blue hover:bg-sky-200';
    const inner = <><ProgramIcon id={b.icon || (b.kind === 'external' ? 'arrow' : 'star')} className="w-4 h-4" gold /> <span>{b.label}</span>{b.kind === 'external' ? <ExternalLink className="w-3.5 h-3.5 opacity-70" /> : null}</>;
    const cls = `${base} ${skin} ${className}`;
    if (b.kind === 'form') return <button type="button" className={cls} onClick={() => handlers.onForm(b.form || 'orientacion')}>{inner}</button>;
    if (b.kind === 'donation') return <button type="button" className={cls} onClick={() => handlers.onDonation(b.donation)}>{inner}</button>;
    if (b.kind === 'external') return <a className={cls} href={b.href} target="_blank" rel="noopener noreferrer">{inner}</a>;
    if (b.kind === 'anchor') return <a className={cls} href={b.href} onClick={e => { e.preventDefault(); document.getElementById(String(b.href).slice(1))?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }}>{inner}</a>;
    return <Link className={cls} to={b.href || '/'}>{inner}</Link>;
};

/** Imagen real o el marcador de la referencia (sólo en vista previa). */
export const LandingImage = ({ img, className = '', rounded = 'rounded-3xl' }: { img: ResolvedImage | null; className?: string; rounded?: string }) => {
    if (!img) return null;
    if (img.placeholder) {
        return (
            <div className={`${rounded} bg-sky-200/70 border border-sky-200 flex flex-col items-center justify-center text-slate-600 ${className}`} role="img" aria-label="Espacio para una fotografía real autorizada">
                <ImageIcon className="w-14 h-14 text-slate-500/70" aria-hidden />
                <span className="text-sm mt-3">{img.placeholderLabel || 'Fotografía real autorizada'}</span>
            </div>
        );
    }
    return <img src={img.url} alt={img.alt} className={`${rounded} object-cover w-full h-full ${className}`} style={{ objectPosition: `${img.focalX}% ${img.focalY}%` }} loading="lazy" />;
};

const Section = ({ block, children, className = '' }: { block: ResolvedBlock; children: ReactNode; className?: string }) => {
    const bg = BACKGROUND_CLASS[block.style.background] || BACKGROUND_CLASS.white;
    return (
        <section id={block.id} data-block={block.type} className={`${bg.section} ${bg.text} scroll-mt-24 ${className}`} aria-labelledby={`${block.id}-titulo`}>
            {!block.ready ? <div className="bg-amber-100 text-amber-900 text-xs text-center py-1.5 px-4">Vista previa: este contenedor no se muestra en público hasta completar sus datos ({block.notes[0] || 'faltan datos'}).</div> : null}
            {children}
        </section>
    );
};

const Titulo = ({ id, text, dark, align = 'center', className = '' }: { id: string; text: string; dark: boolean; align?: 'left' | 'center'; className?: string }) => (
    text ? <h2 id={`${id}-titulo`} className={`text-2xl md:text-3xl font-bold ${dark ? 'text-white' : 'text-gray-900'} ${align === 'center' ? 'text-center' : ''} ${className}`}>{text}</h2> : <h2 id={`${id}-titulo`} className="sr-only">Sección</h2>
);

const Parrafo = ({ text, dark, align = 'center', className = '' }: { text?: string; dark: boolean; align?: 'left' | 'center'; className?: string }) => (
    text ? <p className={`${dark ? 'text-sky-100' : 'text-gray-600'} ${align === 'center' ? 'text-center mx-auto' : ''} leading-relaxed whitespace-pre-line ${className}`}>{text}</p> : null
);

// ── Contenedores ──────────────────────────────────────────────────────

const HeroBlock = ({ block, handlers }: { block: ResolvedBlock; handlers: LandingHandlers }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const textFirst = block.style.imageSide === 'right';
    return (
        <Section block={block} className="relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                <div className="absolute -right-24 -top-24 w-[520px] h-[520px] rounded-full bg-white/40 blur-3xl" />
                <div className="absolute left-1/3 -bottom-40 w-[480px] h-[480px] rounded-full bg-sky-300/30 blur-3xl" />
            </div>
            {block.style.overlay ? <div className="absolute inset-0 bg-rotary-navy pointer-events-none" style={{ opacity: block.style.overlay / 100 }} aria-hidden="true" /> : null}
            <div className={`${CONTAINER} relative py-12 md:py-16 grid md:grid-cols-5 gap-8 items-center ${block.style.align === 'center' ? 'text-center' : ''}`}>
                <div className={`md:col-span-3 ${textFirst ? '' : 'md:order-2'}`}>
                    {d.eyebrow ? <p className={`text-sm font-medium ${dark ? 'text-sky-100' : 'text-slate-600'}`}>{d.eyebrow}</p> : null}
                    <h1 id={`${block.id}-titulo`} className={`text-4xl md:text-5xl font-bold mt-2 ${dark ? 'text-white' : 'text-rotary-blue'}`}>{d.title}</h1>
                    {d.tagline ? <p className={`text-2xl md:text-3xl font-medium mt-1 ${dark ? 'text-sky-100' : 'text-rotary-blue'}`}>{d.tagline}</p> : null}
                    {d.description ? <p className={`mt-4 text-base md:text-lg max-w-xl ${block.style.align === 'center' ? 'mx-auto' : ''} ${dark ? 'text-sky-100' : 'text-slate-700'}`}>{d.description}</p> : null}
                    {d.buttons.length ? <div className={`flex flex-wrap gap-3 mt-6 ${block.style.align === 'center' ? 'justify-center' : ''}`}>{d.buttons.map((b: ResolvedButton, i: number) => <LandingButton key={i} b={b} dark={dark} handlers={handlers} className={i === 0 ? '' : ''} />)}</div> : null}
                </div>
                {d.image ? <div className={`md:col-span-2 ${textFirst ? '' : 'md:order-1'}`}><div className="aspect-[4/3] md:aspect-square max-h-72 mx-auto w-full"><LandingImage img={d.image} className="h-full" rounded="rounded-3xl" /></div></div> : null}
            </div>
        </Section>
    );
};

const IntroBlock = ({ block, handlers }: { block: ResolvedBlock; handlers: LandingHandlers }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-12 md:py-14 ${block.style.align === 'center' ? 'text-center' : ''}`}>
                <Titulo id={block.id} text={d.title} dark={dark} align={block.style.align} />
                <Parrafo text={d.description} dark={dark} align={block.style.align} className="mt-3 max-w-3xl" />
                {d.button ? <div className={`mt-6 ${block.style.align === 'center' ? 'flex justify-center' : ''}`}><LandingButton b={d.button} dark={dark} handlers={handlers} /></div> : null}
            </div>
        </Section>
    );
};

const CardsBlock = ({ block, handlers }: { block: ResolvedBlock; handlers: LandingHandlers }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background); const bg = BACKGROUND_CLASS[block.style.background] || BACKGROUND_CLASS.white;
    const cols = d.cards.length >= 3 ? 'lg:grid-cols-3' : d.cards.length === 2 ? 'md:grid-cols-2' : '';
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-12 md:py-14`}>
                <Titulo id={block.id} text={d.title} dark={dark} />
                <Parrafo text={d.description} dark={dark} className="mt-2 max-w-2xl" />
                <ul className={`grid sm:grid-cols-2 ${cols} gap-5 mt-8`}>
                    {d.cards.map((c: any) => (
                        <li key={c.id} className={`${bg.card} rounded-3xl p-6 text-center flex flex-col items-center`}>
                            <span className="text-rotary-blue"><ProgramIcon id={c.icon} className="w-12 h-12" gold /></span>
                            <h3 className="font-bold text-gray-900 text-lg mt-4">{c.title}</h3>
                            {c.description ? <p className="text-sm text-gray-600 mt-2 flex-1">{c.description}</p> : null}
                            {c.link ? <div className="mt-4"><LandingButton b={{ ...c.link, variant: 'secondary' }} dark={false} handlers={handlers} className="!bg-transparent !px-0 hover:underline" /></div> : null}
                        </li>
                    ))}
                </ul>
            </div>
        </Section>
    );
};

const FeatureBlock = ({ block, handlers }: { block: ResolvedBlock; handlers: LandingHandlers }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const textFirst = block.style.imageSide === 'right';
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-12 md:py-16 grid md:grid-cols-2 gap-8 items-center`}>
                <div className={textFirst ? '' : 'md:order-2'}>
                    <Titulo id={block.id} text={d.title} dark={dark} align="left" />
                    <Parrafo text={d.description} dark={dark} align="left" className="mt-4" />
                    {d.button ? <div className="mt-6"><LandingButton b={d.button} dark={dark} handlers={handlers} /></div> : null}
                </div>
                {d.image ? <div className={`${textFirst ? '' : 'md:order-1'} aspect-[4/3]`}><LandingImage img={d.image} className="h-full" /></div> : null}
            </div>
        </Section>
    );
};

const ImpactBlock = ({ block }: { block: ResolvedBlock }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-10 md:py-12`}>
                <Titulo id={block.id} text={d.title} dark={dark} className="mb-6" />
                <Parrafo text={d.description} dark={dark} className="mb-6 max-w-2xl" />
                <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {d.items.map((it: any) => (
                        <li key={it.id} className="rounded-3xl bg-white border border-gray-100 p-6 text-center">
                            <span className="text-rotary-blue inline-flex"><ProgramIcon id={it.icon} className="w-12 h-12" gold /></span>
                            {it.indicator ? <p className="text-3xl font-bold text-rotary-blue mt-3">{it.indicator.value}<span className="text-base font-medium text-gray-500 ml-1">{it.indicator.unit}</span></p> : null}
                            <h3 className="font-bold text-gray-900 mt-2">{it.label || it.indicator?.name}</h3>
                            {it.indicator ? <p className="text-[11px] text-gray-500 mt-1">{[it.indicator.mode === 'periodo' ? `Período ${it.indicator.period || ''}` : 'Acumulado', it.indicator.updatedOn ? `actualizado ${dateLabel(it.indicator.updatedOn)}` : ''].filter(Boolean).join(' · ')}</p> : <p className="text-sm italic text-gray-500 mt-1">Indicadores por validar</p>}
                        </li>
                    ))}
                </ul>
            </div>
        </Section>
    );
};

const DirectoryBlock = ({ block, handlers }: { block: ResolvedBlock; handlers: LandingHandlers }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const [region, setRegion] = useState('');
    const [city, setCity] = useState('');
    const [applied, setApplied] = useState({ region: '', city: '' });
    const [showAll, setShowAll] = useState(false);
    const cities = useMemo(() => (d.facets || []).find((f: any) => f.region === region)?.cities || [], [d.facets, region]);
    const list = useMemo(() => (d.clinics || []).filter((c: any) => (!applied.region || (c.region || 'Sin región') === applied.region) && (!applied.city || c.city === applied.city)), [d.clinics, applied]);
    const visibles = showAll ? list : list.slice(0, d.initialCount || 2);
    const placeholders = d.clinics?.length ? [] : [1, 2];
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-12 md:py-14`}>
                <Titulo id={block.id} text={d.title} dark={dark} />
                <Parrafo text={d.description} dark={dark} className="mt-2 max-w-2xl" />
                {(d.filters.region || d.filters.city) ? (
                    <form className="mt-7 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end max-w-3xl mx-auto" onSubmit={e => { e.preventDefault(); setApplied({ region, city }); setShowAll(false); }}>
                        {d.filters.region ? <label className="text-sm"><span className="block text-xs font-semibold text-gray-700 mb-1">Departamento</span><select value={region} onChange={e => { setRegion(e.target.value); setCity(''); }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800"><option value="">Selecciona un departamento</option>{(d.facets || []).map((f: any) => <option key={f.region} value={f.region}>{f.region}</option>)}</select></label> : null}
                        {d.filters.city ? <label className="text-sm"><span className="block text-xs font-semibold text-gray-700 mb-1">Ciudad</span><select value={city} onChange={e => setCity(e.target.value)} disabled={!region} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 disabled:opacity-60"><option value="">Selecciona una ciudad</option>{cities.map((c: string) => <option key={c} value={c}>{c}</option>)}</select></label> : null}
                        <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-rotary-blue text-white px-6 py-2.5 text-sm font-semibold hover:bg-rotary-navy min-h-[44px]"><Search className="w-4 h-4" /> {d.searchLabel}</button>
                    </form>
                ) : null}
                <ul className="grid md:grid-cols-2 gap-5 mt-7 max-w-4xl mx-auto" aria-live="polite">
                    {visibles.map((c: any) => (
                        <li key={c.id} className="rounded-3xl bg-white border border-sky-100 p-5 flex gap-4 shadow-sm">
                            <span className="text-rotary-blue shrink-0"><MapPin className="w-7 h-7" aria-hidden /></span>
                            <div className="min-w-0 flex-1">
                                <h3 className="font-bold text-gray-900">{c.name}</h3>
                                {d.fields.institution && c.institution ? <p className="text-xs text-gray-500">{c.institution}</p> : null}
                                <p className="text-sm text-gray-700 mt-1">{[c.city, c.region].filter(Boolean).join(' · ')}</p>
                                {d.fields.schedule && c.schedule ? <p className="text-xs text-gray-600 mt-1">{c.schedule}</p> : null}
                                {d.fields.careConditions && c.careConditions ? <p className="text-xs text-gray-500 italic mt-1">{c.careConditions}</p> : null}
                                <Link to={`/programas/${encodeURIComponent(d.slug || '')}/detalle#clinicas`} onClick={() => handlers.onMetric?.('clinic_click')} className="inline-flex items-center gap-1 text-sm font-semibold text-rotary-blue mt-2 hover:underline">{d.contactLabel} <ArrowRight className="w-4 h-4" /></Link>
                            </div>
                        </li>
                    ))}
                    {placeholders.map(i => (
                        <li key={`ph-${i}`} className="rounded-3xl bg-white border border-dashed border-sky-200 p-5 flex gap-4">
                            <span className="text-rotary-blue shrink-0"><MapPin className="w-7 h-7" aria-hidden /></span>
                            <div><p className="font-bold text-gray-900">Nombre de la clínica</p><p className="text-sm text-gray-700">Ciudad · Departamento</p><p className="text-xs italic text-gray-500 mt-1">Información por confirmar</p><span className="inline-flex items-center gap-1 text-sm font-semibold text-rotary-blue/60 mt-2">{d.contactLabel} <ArrowRight className="w-4 h-4" /></span></div>
                        </li>
                    ))}
                </ul>
                {list.length > visibles.length ? <div className="text-center mt-4"><button type="button" className="text-sm font-semibold text-rotary-blue hover:underline" onClick={() => setShowAll(true)}>Mostrar {list.length - visibles.length} más</button></div> : null}
                {d.allButton ? <div className="flex justify-center mt-6"><LandingButton b={d.allButton} dark={dark} handlers={handlers} /></div> : null}
            </div>
        </Section>
    );
};

const DonationBlock = ({ block, handlers }: { block: ResolvedBlock; handlers: LandingHandlers }) => {
    const d = block.data;
    const imageFirst = block.style.imageSide === 'left';
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-12 md:py-14 grid md:grid-cols-2 gap-8 items-stretch`}>
                {d.image ? <div className={`${imageFirst ? '' : 'md:order-2'} min-h-[220px] aspect-[4/3] md:aspect-auto`}><LandingImage img={d.image} className="h-full" /></div> : null}
                <div className={`${imageFirst ? '' : 'md:order-1'} rounded-3xl bg-white/95 text-gray-900 p-7 md:p-9 flex flex-col justify-center shadow-sm`}>
                    <h2 id={`${block.id}-titulo`} className="text-2xl md:text-3xl font-bold text-gray-900">{d.title}</h2>
                    {d.description ? <p className="text-gray-600 mt-3">{d.description}</p> : null}
                    {d.button ? <div className="mt-5"><LandingButton b={d.button} dark={false} handlers={handlers} /></div> : null}
                    <p className="text-xs italic text-gray-500 mt-3">{d.receiver ? `Recibe y administra: ${d.receiver}${d.verifiedAt ? ` · enlace verificado el ${dateLabel(d.verifiedAt)}` : ''}` : 'Entidad receptora y enlace por confirmar.'}</p>
                </div>
            </div>
        </Section>
    );
};

const StoriesBlock = ({ block }: { block: ResolvedBlock }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const placeholders = d.stories.length ? [] : [1, 2, 3].slice(0, d.count || 3);
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-12 md:py-14`}>
                <Titulo id={block.id} text={d.title} dark={dark} />
                <Parrafo text={d.description} dark={dark} className="mt-2 max-w-2xl" />
                <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
                    {d.stories.map((s: any) => (
                        <li key={s.id} className="rounded-3xl bg-sky-50/70 border border-sky-100 p-4 flex flex-col">
                            <div className="aspect-[16/10]">{s.image ? <img src={s.image.url} alt={s.image.alt || ''} className="w-full h-full object-cover rounded-2xl" loading="lazy" /> : <LandingImage img={{ url: '', alt: '', focalX: 50, focalY: 50, placeholder: true }} className="h-full" rounded="rounded-2xl" />}</div>
                            <h3 className="font-bold text-gray-900 mt-4">{s.title}</h3>
                            {d.showDate && s.date ? <p className="text-xs text-gray-500 mt-0.5">{dateLabel(s.date)}</p> : null}
                            {d.showSummary && s.summary ? <p className="text-sm text-gray-600 mt-1 flex-1">{s.summary}</p> : null}
                            <Link to={`/programas/${encodeURIComponent(d.slug || '')}/detalle#historias`} className="inline-flex items-center gap-1 text-sm font-semibold text-rotary-blue mt-3 hover:underline">{d.linkLabel} <ArrowRight className="w-4 h-4" /></Link>
                        </li>
                    ))}
                    {placeholders.map(i => (
                        <li key={`ph-${i}`} className="rounded-3xl bg-sky-50/70 border border-dashed border-sky-200 p-4">
                            <div className="aspect-[16/10]"><LandingImage img={{ url: '', alt: '', focalX: 50, focalY: 50, placeholder: true }} className="h-full" rounded="rounded-2xl" /></div>
                            <p className="font-bold text-gray-900 mt-4">Una historia por compartir</p>
                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-rotary-blue/60 mt-2">{d.linkLabel} <ArrowRight className="w-4 h-4" /></span>
                        </li>
                    ))}
                </ul>
            </div>
        </Section>
    );
};

const ResourcesBlock = ({ block, handlers }: { block: ResolvedBlock; handlers: LandingHandlers }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-12 md:py-14 text-center`}>
                <Titulo id={block.id} text={d.title} dark={dark} />
                <Parrafo text={d.description} dark={dark} className="mt-2 max-w-2xl" />
                <ul className="flex flex-wrap justify-center gap-8 md:gap-14 mt-8">
                    {d.items.map((it: any) => {
                        const inner = <><span className="w-20 h-20 rounded-full bg-sky-100 text-rotary-blue flex items-center justify-center shadow-sm group-hover:bg-sky-200 transition-colors"><ProgramIcon id={it.icon} className="w-9 h-9" gold /></span><span className={`block text-sm font-semibold mt-3 ${dark ? 'text-white' : 'text-gray-900'}`}>{it.label}</span>{it.count === 0 ? <span className="block text-[11px] italic text-amber-200 mt-0.5">Sin recursos publicados</span> : null}</>;
                        return <li key={it.id} className="w-36">{it.link?.href ? <Link to={it.link.href} onClick={() => handlers.onMetric?.('resource_click')} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-rotary-gold rounded-2xl">{inner}</Link> : <div>{inner}</div>}</li>;
                    })}
                </ul>
                {d.button ? <div className="flex justify-center mt-8"><LandingButton b={d.button} dark={dark} handlers={handlers} /></div> : null}
            </div>
        </Section>
    );
};

/** La ilustración de manos unidas de la referencia (SVG propio, sin terceros): cuatro manos que se encuentran sobre un óvalo azul claro. */
const HandsIllustration = () => (
    <svg viewBox="0 0 320 240" className="w-full max-w-sm mx-auto" aria-hidden="true">
        <ellipse cx="160" cy="128" rx="138" ry="92" fill="#dbeafe" />
        <g fill="none" stroke="#17458f" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
            {/* mano desde arriba a la izquierda */}
            <path d="M40 60 C 80 70, 110 90, 138 118" /><path d="M118 96 l 22 22 l -30 6" />
            {/* mano desde arriba a la derecha */}
            <path d="M280 60 C 240 70, 210 90, 182 118" /><path d="M202 96 l -22 22 l 30 6" />
            {/* mano desde abajo a la izquierda */}
            <path d="M40 200 C 80 190, 110 170, 138 142" /><path d="M118 164 l 22 -22 l -30 -6" />
            {/* mano desde abajo a la derecha */}
            <path d="M280 200 C 240 190, 210 170, 182 142" /><path d="M202 164 l -22 -22 l 30 -6" />
        </g>
        <circle cx="160" cy="130" r="14" fill="#F5A623" stroke="#17458f" strokeWidth="4" />
    </svg>
);

const ClubsBlock = ({ block, handlers }: { block: ResolvedBlock; handlers: LandingHandlers }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    const textFirst = block.style.imageSide === 'right';
    const visual = d.image && !d.image.placeholder ? <div className="aspect-[4/3]"><LandingImage img={d.image} className="h-full" /></div> : d.illustration === 'hands' ? <HandsIllustration /> : (d.image ? <div className="aspect-[4/3]"><LandingImage img={d.image} className="h-full" /></div> : null);
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-12 md:py-14 grid md:grid-cols-2 gap-8 items-center`}>
                <div className={textFirst ? '' : 'md:order-2'}>
                    <Titulo id={block.id} text={d.title} dark={dark} align="left" />
                    <Parrafo text={d.description} dark={dark} align="left" className="mt-3" />
                    {d.button ? <div className="mt-6"><LandingButton b={d.button} dark={dark} handlers={handlers} /></div> : null}
                </div>
                {visual ? <div className={textFirst ? '' : 'md:order-1'}>{visual}</div> : null}
            </div>
        </Section>
    );
};

const ContactBlock = ({ block, handlers }: { block: ResolvedBlock; handlers: LandingHandlers }) => {
    const d = block.data; const dark = isDarkBackground(block.style.background);
    return (
        <Section block={block}>
            <div className={`${CONTAINER} py-12 md:py-14 text-center`}>
                <Titulo id={block.id} text={d.title} dark={dark} />
                <Parrafo text={d.description} dark={dark} className="mt-2 max-w-2xl" />
                {d.button ? <div className="flex justify-center mt-6"><LandingButton b={d.button} dark={dark} handlers={handlers} /></div> : null}
            </div>
        </Section>
    );
};

const ProgramaLanding = ({ landing, handlers }: { landing: ResolvedLanding; handlers: LandingHandlers }) => (
    <div className="font-sans">
        {landing.blocks.map(block => {
            switch (block.type) {
                case 'hero': return <HeroBlock key={block.id} block={block} handlers={handlers} />;
                case 'intro': return <IntroBlock key={block.id} block={block} handlers={handlers} />;
                case 'cards': return <CardsBlock key={block.id} block={block} handlers={handlers} />;
                case 'feature': return <FeatureBlock key={block.id} block={block} handlers={handlers} />;
                case 'impact': return <ImpactBlock key={block.id} block={block} />;
                case 'directory': return <DirectoryBlock key={block.id} block={block} handlers={handlers} />;
                case 'donation': return <DonationBlock key={block.id} block={block} handlers={handlers} />;
                case 'stories': return <StoriesBlock key={block.id} block={block} />;
                case 'resources': return <ResourcesBlock key={block.id} block={block} handlers={handlers} />;
                case 'clubs': return <ClubsBlock key={block.id} block={block} handlers={handlers} />;
                case 'contact': return <ContactBlock key={block.id} block={block} handlers={handlers} />;
                default: return null;
            }
        })}
    </div>
);

export default ProgramaLanding;
