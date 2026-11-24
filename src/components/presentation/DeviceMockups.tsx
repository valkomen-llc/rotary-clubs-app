/**
 * Presentación comercial — portátil y teléfono (v4.1356.0)
 *
 * Con una captura (`src`) la muestran tal cual, recortada desde arriba. Sin
 * ella pintan un sitio institucional ESQUEMÁTICO con los rasgos de la
 * plantilla (barra `rotary-topbar`, cabecera blanca, portada con el patrón
 * geométrico): no es una captura y el slide lo dice.
 * Proporciones: pantalla 16:10 y 9:19; las medidas interiores van en `cqw`.
 */
import { PRESENTATION } from '../../config/clubPlatformPresentation';

const SiteSchematic = ({ mobile }: { mobile?: boolean }) => (
    <div className={`cpd-site${mobile ? ' cpd-site--mobile' : ''}`} aria-hidden>
        <div className="cpd-site__top"><i /><i /><i /></div>
        <div className="cpd-site__nav">
            <span className="cpd-site__mark" />
            <span className="cpd-site__brand">{PRESENTATION.sampleDomain}</span>
            <span className="cpd-site__links"><i /><i /><i /><i /></span>
            <span className="cpd-site__btn" />
            {mobile ? <span className="cpd-site__burger" /> : null}
        </div>
        <div className="cpd-site__hero bg-rotary-geo">
            <span className="cpd-site__h">Somos gente de acción</span>
            <span className="cpd-site__p" />
            <span className="cpd-site__cta" />
        </div>
        <div className="cpd-site__cards">
            <div className="cpd-site__card"><b /><i /><i /><i /></div>
            <div className="cpd-site__card"><b /><i /><i /><i /></div>
            <div className="cpd-site__card"><b /><i /><i /><i /></div>
        </div>
    </div>
);

export const LaptopMockup = ({ src, alt, className = '' }: { src: string | null; alt: string; className?: string }) => (
    <div className={`cpd-laptop ${className}`} role="img" aria-label={alt}>
        <div className="cpd-laptop__lid">
            <div className="cpd-laptop__screen">{src ? <img className="cpd-shot" src={src} alt="" /> : <SiteSchematic />}</div>
        </div>
        <div className="cpd-laptop__base" />
    </div>
);

export const PhoneMockup = ({ src, alt, className = '' }: { src: string | null; alt: string; className?: string }) => (
    <div className={`cpd-phone ${className}`} role="img" aria-label={alt}>
        <div className={`cpd-phone__screen${src ? ' has-shot' : ''}`}>{src ? <img className="cpd-shot" src={src} alt="" /> : <SiteSchematic mobile />}</div>
    </div>
);

/** Conectividad: órbitas y nodos discretos detrás de los dispositivos. */
export const ConnectivityGraphic = () => (
    <svg className="cpd-orbit" viewBox="0 0 800 620" fill="none" aria-hidden>
        <circle cx="560" cy="300" r="250" stroke="hsl(43 90% 50%)" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="3 9" />
        <circle cx="560" cy="300" r="330" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5" />
        <circle cx="352" cy="160" r="6" fill="hsl(43 90% 50%)" />
        <circle cx="772" cy="430" r="5" fill="#fff" fillOpacity=".8" />
        <circle cx="640" cy="64" r="5" fill="#fff" fillOpacity=".8" />
        <path d="M352 160 640 64" stroke="#fff" strokeOpacity=".3" strokeWidth="1.2" />
    </svg>
);
