/**
 * Presentación comercial — barra superior y navegación (v4.1356.0)
 * Acceso directo a cada slide, pantalla completa, impresión, anterior /
 * siguiente, progreso, numeración y volver al inicio.
 */
import { ArrowLeft, ArrowRight, Maximize, Minimize, Printer, RotateCcw } from 'lucide-react';
import { PRESENTATION, SLIDE_COUNT } from '../../config/clubPlatformPresentation';

const two = (n: number) => String(n).padStart(2, '0');

interface BarProps { index: number; present: boolean; go: (i: number) => void; togglePresent: () => void }

export const DeckBar = ({ index, present, go, togglePresent }: BarProps) => {
    const { ui, brand, slides } = PRESENTATION;
    return (
        <div className="cpd-bar">
            <img className="cpd-bar__logo" src={brand.logo} alt={brand.name} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <nav className="cpd-tabs" aria-label={ui.goTo}>
                {slides.map((s, i) => (
                    <button key={s.id} type="button" className="cpd-tab" aria-current={i === index ? 'true' : undefined} onClick={() => go(i)}>
                        <span className="cpd-tab__n">{two(i + 1)}</span>{s.nav}
                    </button>
                ))}
            </nav>
            <div className="cpd-tools">
                <button type="button" className="cpd-iconbtn" onClick={() => window.print()} aria-label={ui.print} title={ui.print}><Printer aria-hidden size={18} /></button>
                <button type="button" className="cpd-iconbtn cpd-iconbtn--solid" onClick={togglePresent} aria-label={present ? ui.exitFullscreen : ui.fullscreen} title={present ? ui.exitFullscreen : ui.fullscreen}>
                    {present ? <Minimize aria-hidden size={18} /> : <Maximize aria-hidden size={18} />}<span className="cpd-iconbtn__text">{ui.fullscreen}</span>
                </button>
            </div>
        </div>
    );
};

interface NavProps { index: number; present: boolean; prev: () => void; next: () => void; go: (i: number) => void; togglePresent: () => void }

export const DeckNav = ({ index, present, prev, next, go, togglePresent }: NavProps) => {
    const { ui } = PRESENTATION;
    const last = index === SLIDE_COUNT - 1;
    return (
        <div className="cpd-nav">
            <button type="button" className="cpd-iconbtn" onClick={prev} disabled={index === 0} aria-label={ui.prev} title={ui.prev}><ArrowLeft aria-hidden size={18} /></button>
            <div className="cpd-progress" role="progressbar" aria-label={ui.progress} aria-valuemin={1} aria-valuemax={SLIDE_COUNT} aria-valuenow={index + 1}>
                <div className="cpd-progress__fill" style={{ width: `${((index + 1) / SLIDE_COUNT) * 100}%` }} />
            </div>
            <span className="cpd-count" aria-live="polite">{two(index + 1)} <span>/ {two(SLIDE_COUNT)}</span></span>
            <button type="button" className="cpd-iconbtn" onClick={() => go(0)} disabled={index === 0} aria-label={ui.restart} title={ui.restart}><RotateCcw aria-hidden size={17} /></button>
            {present ? <button type="button" className="cpd-iconbtn" onClick={togglePresent} aria-label={ui.exitFullscreen} title={ui.exitFullscreen}><Minimize aria-hidden size={17} /></button> : null}
            <button type="button" className={`cpd-iconbtn${last ? '' : ' cpd-iconbtn--solid'}`} onClick={next} disabled={last} aria-label={ui.next} title={ui.next}><ArrowRight aria-hidden size={18} /></button>
        </div>
    );
};
