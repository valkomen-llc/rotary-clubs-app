// ════════════════════════════════════════════════════════════════════
// Panel público de inscripción a un evento
// v4.602.0 — Copia reutilizable del panel de la Conferencia LATIR.
//
// El panel nació dentro de la ficha del evento de la Conferencia LATIR
// (barra lateral: logo, cuenta regresiva, botón de inscripción, precios y
// fecha de cierre). Aquí vive como componente independiente para poder
// publicarlo igual en otros sitios — el primero, la Feria de Proyectos.
//
// El componente NO trae valores de negocio ni textos de un evento concreto:
// cada sitio pasa los suyos. Así la ficha de LATIR conserva exactamente lo
// que ya está publicado (mismos textos, mismos colores) y la Feria usa los
// propios sin heredar nada de LATIR.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
// Un enlace al propio sitio abre en la misma pestaña, aunque venga escrito con
// la dirección completa. El criterio es único para todo el sitio.
import { ctaTarget } from '../lib/ctaLinks';
import { CTA_SOFT, CTA_SOLID, ctaSkin } from '../lib/ctaStyles';

/** Clases de color del panel. Por defecto, las de la Conferencia LATIR. */
export interface RegistrationPanelTheme {
    /** Color del título. */
    title: string;
    /** Color del subtítulo. */
    subtitle: string;
    /** Fondo y texto de las cajas de la cuenta regresiva. */
    counter: string;
    /** Fondo, hover y texto del botón de inscripción. */
    button: string;
    /** Color del bloque de precios y fecha de cierre. */
    tickets: string;
}

// v4.751 — La cuenta regresiva y el botón de inscripción dejaron un naranja
// escrito a mano que no pertenecía a ninguna paleta del sitio y no se repetía
// en ninguna otra parte. Los colores se toman de `ctaStyles.ts` en vez de
// escribirlos otra vez, que es la regla de ese archivo: la piel de esta familia
// de botones es UNA, y repetirla a mano es lo que hizo que la misma acción se
// viera de dos maneras hasta v4.718.
//
// Las CAJAS van en la piel suave y SIN hover, porque no se pulsan: reaccionar
// al cursor es la promesa de que algo va a pasar al hacerlo.
//
// El BOTÓN va en la piel sólida (v4.752). El mismo «Inscripciones» se pinta por
// dos caminos —éste cuando el evento no tiene categorías, y `EventRegistrationCta`
// cuando sí—, y con pieles distintas se vería de dos maneras según una
// configuración que el visitante no conoce. Es exactamente el defecto que este
// módulo existe para no tener.
//
// La Feria conserva su tema propio (`FAIR_THEME` en `RegistroFeria.tsx`): lo
// que se unifica es el valor POR DEFECTO, no toda personalización.
const DEFAULT_THEME: RegistrationPanelTheme = {
    title: 'text-[#1B2B4D]',
    subtitle: 'text-[#475569]',
    counter: ctaSkin(CTA_SOFT, false),
    button: ctaSkin(CTA_SOLID),
    tickets: 'text-[#1B2B4D]',
};

export interface RegistrationPanelProps {
    /** Logo que se muestra sobre el título. */
    headerLogo?: string;
    /** Título del panel. Los saltos de línea se respetan. */
    title?: string;
    /** Subtítulo bajo el título. Los saltos de línea se respetan. */
    subtitle?: string;
    /** Fecha/hora hacia la que corre la cuenta regresiva (ISO). Sin fecha válida no se pinta. */
    startDate?: string;
    /** Texto del botón de inscripción. */
    buttonLabel?: string;
    /** Destino del botón. Si va vacío, el botón no se muestra. */
    buttonLink?: string;
    /**
     * Botonera propia, en lugar del botón único. La usa el módulo de
     * inscripciones por categoría (v4.650) para poner el botón principal —
     * nacional o internacional según quien mire— y el de CADRES debajo.
     * Cuando viene, reemplaza a `buttonLink`.
     */
    actions?: ReactNode;
    /**
     * v4.948 — Botón SECUNDARIO debajo del principal, para la vía alterna de
     * inscripción (ej.: quien ya pagó por COLROTARIOS y viene a completar su
     * información). Sin enlace no se muestra: nunca un botón que no lleva a
     * ninguna parte (v4.650). Es la pareja declarada de la ficha (v4.752):
     * misma geometría que el principal y piel suave — el COLOR es lo que
     * distingue cuál es el registro principal.
     */
    secondaryLabel?: string;
    /** Destino del botón secundario. Si va vacío, el botón no se muestra. */
    secondaryLink?: string;
    ticketGeneralLabel?: string;
    ticketGeneral?: string;
    /** Línea en cursiva bajo el ticket general (ej. precio a partir de una fecha). */
    ticketNote?: string;
    ticketRotexLabel?: string;
    ticketRotex?: string;
    closeLabel?: string;
    closeDateText?: string;
    /** Imagen que cierra el panel, a sangre y pegada al borde inferior. */
    footerImage?: string;
    theme?: Partial<RegistrationPanelTheme>;
}

interface TimeLeft { days: number; hours: number; minutes: number; seconds: number }

const ZERO: TimeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };

function calculateTimeLeft(targetDate?: string): TimeLeft {
    if (!targetDate) return ZERO;
    const difference = new Date(targetDate).getTime() - new Date().getTime();
    if (!Number.isFinite(difference) || difference <= 0) return ZERO;
    return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
    };
}


const RegistrationPanel = ({
    headerLogo,
    title,
    subtitle,
    startDate,
    buttonLabel = 'Inscripciones',
    buttonLink,
    actions,
    secondaryLabel,
    secondaryLink,
    ticketGeneralLabel = 'Ticket general:',
    ticketGeneral,
    ticketNote,
    ticketRotexLabel = 'Ticket ROTEX:',
    ticketRotex,
    closeLabel = 'Cierre de inscripciones:',
    closeDateText,
    footerImage,
    theme,
}: RegistrationPanelProps) => {
    const t = { ...DEFAULT_THEME, ...theme };
    const hasCountdown = !!startDate && Number.isFinite(new Date(startDate).getTime());
    const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(startDate));

    useEffect(() => {
        if (!hasCountdown) return;
        const timer = setInterval(() => setTimeLeft(calculateTimeLeft(startDate)), 1000);
        return () => clearInterval(timer);
    }, [startDate, hasCountdown]);

    const formatNum = (num: number) => num.toString().padStart(2, '0');

    const link = String(buttonLink || '').trim();
    const buttonClasses = `w-full max-w-[220px] block text-center ${t.button} text-[15px] font-bold py-2.5 rounded-full transition-colors mb-5`;
    // v4.948 — La pareja de la ficha (v4.719.1/v4.752): misma geometría que el
    // principal y la piel SUAVE de `ctaStyles.ts` — el color distingue cuál es
    // el principal, no el tamaño. Va pegado al de arriba con menos aire que el
    // `mb-5` del principal, para que se lean como una pareja.
    const secLink = String(secondaryLink || '').trim();
    const secondaryClasses = `w-full max-w-[220px] block text-center ${ctaSkin(CTA_SOFT)} text-[15px] font-bold py-2.5 rounded-full transition-colors mb-5 ${(link || actions) ? '-mt-2.5' : ''}`;
    const secLabel = secondaryLabel || 'Completar inscripción';
    const hasTickets = !!(ticketGeneral || ticketNote || ticketRotex || closeDateText);

    return (
        <div className="bg-white rounded-2xl p-6 mb-4 flex flex-col items-center border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
            <div className="w-full text-left">
                {headerLogo && (
                    <img src={headerLogo} alt="Logo del Evento" className="w-full max-w-[320px] h-auto max-h-[140px] mb-6 object-contain object-left" />
                )}
                {title && (
                    <h2 className={`text-[2.2rem] leading-[1.1] font-normal ${t.title}`} style={{ whiteSpace: 'pre-line' }}>
                        {title}
                    </h2>
                )}
                {subtitle && (
                    <p className={`${t.subtitle} text-[1.15rem] mt-3 leading-snug`} style={{ whiteSpace: 'pre-line' }}>
                        {subtitle}
                    </p>
                )}
            </div>

            {/* Countdown */}
            {hasCountdown && (
                <div className="flex gap-1 mt-8 mb-6 justify-center w-full">
                    {[
                        { label: 'Días', val: timeLeft.days },
                        { label: 'Horas', val: timeLeft.hours },
                        { label: 'Minutos', val: timeLeft.minutes },
                        { label: 'Segundos', val: timeLeft.seconds },
                    ].map(item => (
                        <div key={item.label} className={`${t.counter} flex flex-col items-center justify-center py-2.5 px-0.5 w-[4.5rem] rounded-md shadow-sm`}>
                            <span className="text-[2.25rem] font-bold leading-none tracking-tight" style={{ fontFamily: '"Open Sans", sans-serif' }}>{formatNum(item.val)}</span>
                            <span className="text-[11px] font-bold mt-1.5 capitalize">{item.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Button */}
            {actions ? (
                <div className="w-full mb-5">{actions}</div>
            ) : link && (
                ctaTarget(link).external ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" className={buttonClasses}>
                        {buttonLabel}
                    </a>
                ) : (
                    <Link to={ctaTarget(link).to} className={buttonClasses}>
                        {buttonLabel}
                    </Link>
                )
            )}

            {/* Botón secundario (v4.948): la vía alterna de inscripción. */}
            {secLink && (
                ctaTarget(secLink).external ? (
                    <a href={secLink} target="_blank" rel="noopener noreferrer" className={secondaryClasses}>
                        {secLabel}
                    </a>
                ) : (
                    <Link to={ctaTarget(secLink).to} className={secondaryClasses}>
                        {secLabel}
                    </Link>
                )
            )}

            {/* Pricing details */}
            {hasTickets && (
                <div className={`text-center text-[14px] ${t.tickets} space-y-1.5 w-full pb-2`}>
                    {ticketGeneral && <p><strong className="font-extrabold">{ticketGeneralLabel}</strong> {ticketGeneral}</p>}
                    {ticketNote && <p className={`italic font-medium ${t.tickets}`}>{ticketNote}</p>}
                    {ticketRotex && <p><strong className="font-extrabold">{ticketRotexLabel}</strong> {ticketRotex}</p>}
                    {closeDateText && <p className={`mt-3 ${t.tickets}`}>{closeLabel} {closeDateText}</p>}
                </div>
            )}

            {/* Extra image at the bottom of the box */}
            {footerImage && (
                <div className="mt-5 w-[calc(100%+3rem)] -mx-6 -mb-6 border-t border-gray-100 overflow-hidden rounded-b-2xl">
                    <img src={footerImage} alt="Conf Info" className="w-full h-auto object-cover" />
                </div>
            )}
        </div>
    );
};

export default RegistrationPanel;
