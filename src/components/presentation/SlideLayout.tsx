/**
 * Presentación comercial — las piezas comunes de un slide (v4.1356.0)
 * Marco, encabezado institucional, frase de cierre e íconos por nombre.
 */
import type { ReactNode } from 'react';
import { Cloud, Coins, Globe, Landmark, Mail, Monitor, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { enter } from './motion';
import { PRESENTATION, SLIDE_COUNT } from '../../config/clubPlatformPresentation';

const ICONS: Record<string, LucideIcon> = { globe: Globe, coins: Coins, sparkles: Sparkles, landmark: Landmark, monitor: Monitor, shield: ShieldCheck, mail: Mail, cloud: Cloud };

export const DeckIcon = ({ name }: { name: string }) => {
    const Icon = ICONS[name] || Sparkles;
    return <Icon aria-hidden />;
};


const two = (n: number) => String(n).padStart(2, '0');

const hideBroken = (e: { target: EventTarget }) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; };

/** El logotipo de Club Platform. Sólo se fija la ALTURA: conserva sus proporciones. */
export const BrandLogo = ({ height, className = '' }: { height: number; className?: string }) => (
    <img className={`cpd-logo ${className}`} src={PRESENTATION.brand.logo} alt={PRESENTATION.brand.name} style={{ ['--cpd-logo-h' as string]: `${height}px` }} onError={hideBroken} />
);

interface FrameProps { index: number; active: boolean; stage: boolean; label: string; id: string; children: ReactNode; /** La portada lleva el logotipo grande arriba: no repite la marca de esquina. */ noMark?: boolean }

export const SlideFrame = ({ index, active, stage, label, id, children, noMark }: FrameProps) => {
    const hidden = stage && !active;
    const { corner, height } = PRESENTATION.brand.mark;
    return (
        <section
            id={`slide-${id}`}
            className={`cpd-slide${active || !stage ? ' is-active' : ''}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} de ${SLIDE_COUNT}: ${label}`}
            aria-hidden={hidden || undefined}
            inert={hidden || undefined}
        >
            {children}
            <div className={`cpd-slide__foot cpd-slide__foot--${corner}`}>
                {noMark ? <span /> : <BrandLogo height={height} className="cpd-slide__mark" />}
                <span className="cpd-slide__n"><b>{two(index + 1)}</b> / {two(SLIDE_COUNT)}</span>
            </div>
        </section>
    );
};

interface HeaderProps { eyebrow: string; title: string; description?: string; size?: 'xl' | 'sm'; level?: 1 | 2 }

export const SlideHeader = ({ eyebrow, title, description, size, level = 2 }: HeaderProps) => {
    const Tag = level === 1 ? 'h1' : 'h2';
    return (
        <header>
            <p className="cpd-eyebrow cpd-in" style={enter(0)}>{eyebrow}</p>
            <Tag className={`cpd-title cpd-in${size ? ` cpd-title--${size}` : ''}`} style={enter(1)}>{title}</Tag>
            {description ? <p className="cpd-lead cpd-in" style={enter(2)}>{description}</p> : null}
        </header>
    );
};

export const Closing = ({ children, light, delay = 6 }: { children: ReactNode; light?: boolean; delay?: number }) => (
    <p className={`cpd-closing cpd-in${light ? ' cpd-closing--light' : ''}`} style={enter(delay)}>{children}</p>
);
