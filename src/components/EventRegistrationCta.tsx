// ════════════════════════════════════════════════════════════════════
// Botones de inscripción de la ficha del evento — v4.650.0
//
// Dos botones, no un formulario con tres opciones:
//
//   · El **principal** cambia según quien mire: "Registro Nacional" para quien
//     entra desde Colombia o con el sitio en español de Colombia, y "Registro
//     Internacional" para el resto.
//   · Debajo, **Registro CADRES**, visible siempre para ambos.
//
// Cada botón abre el formulario de SU categoría, ya elegida y bloqueada
// (`/registro?categoria=…`). El servidor, al recibir esa clave, devuelve
// únicamente esa categoría: quien entra por el registro internacional no
// recibe ni ve precios, campos ni mensajes del nacional, y al revés.
//
// La detección la hace el servidor (país por cabecera de red, y si no se puede,
// idioma). Es sólo una sugerencia: los dos caminos siguen a un clic de
// distancia desde esta misma ficha.
//
// Qué botones existen, con qué texto, en qué orden y a qué categoría apuntan lo
// decide el administrador en la pestaña Registro del evento.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../lib/eventRegistrationSpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

export interface CtaButton {
    key: string;
    label: string;
    role: 'primary' | 'secondary';
    categoryKey: string;
    categoryName: string;
    currency: string;
    price: number;
    available: boolean;
    unavailableReason: string | null;
    unavailableMessage: string;
    hidden: boolean;
    href: string;
}

export interface EventCta {
    enabled: boolean;
    audience?: string;
    primary: CtaButton | null;
    secondary: CtaButton[];
}

/**
 * Trae los botones del evento. Devuelve `null` mientras carga o si el evento
 * no tiene inscripciones abiertas, para que la ficha siga mostrando lo que
 * tenía configurado el administrador.
 */
export const useEventCta = (clubId?: string, eventRef?: string) => {
    const [cta, setCta] = useState<EventCta | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!clubId || !eventRef) return;
        let cancelled = false;
        const query = new URLSearchParams();
        // El idioma del visitante: el servidor lo usa cuando no puede
        // determinar el país desde la red.
        if (typeof navigator !== 'undefined' && navigator.language) query.set('lang', navigator.language);

        fetch(`${API}/event-registrations/config/${clubId}/${encodeURIComponent(eventRef)}?${query}`)
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                // Un botón que no aparece no deja rastro en ningún sitio, y eso
                // convierte cualquier problema de configuración en media hora de
                // adivinanzas. Se deja dicho el motivo en la consola.
                const descartar = (motivo: string) => {
                    console.warn(`[inscripciones] La ficha no muestra botones: ${motivo}.`);
                    setCta(null);
                };
                if (data?.error) return descartar(data.error);
                if (!data.enabled) return descartar('el registro de la edición está cerrado o no hay categorías activas');
                if (data.closed) return descartar('la edición está fuera de su ventana de fechas');
                if (!data.cta?.enabled) return descartar('los botones están desactivados en el panel');
                setCta(data.cta);
            })
            .catch(err => {
                console.warn('[inscripciones] No se pudo consultar la configuración:', err?.message);
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [clubId, eventRef]);

    return { cta, loading };
};

/** ¿Hay algo que pintar? Un CTA sin botón principal visible no aporta nada. */
export const hasVisibleCta = (cta: EventCta | null): boolean => {
    if (!cta?.enabled) return false;
    const primaryVisible = Boolean(cta.primary && !cta.primary.hidden);
    const secondaryVisible = cta.secondary.some(b => !b.hidden);
    return primaryVisible || secondaryVisible;
};

const Button = ({ button, eventRef, variant }: {
    button: CtaButton;
    eventRef: string;
    variant: 'primary' | 'secondary';
}) => {
    const base = 'w-full block text-center rounded-full font-bold transition-colors';
    const style = variant === 'primary'
        ? `${base} bg-[#D57D2C] hover:bg-[#c46f23] text-white text-[15px] py-3`
        : `${base} border-2 border-[#1B2B4D] text-[#1B2B4D] hover:bg-[#1B2B4D] hover:text-white text-[14px] py-2.5`;

    // Categoría cerrada o agotada, pero con mensaje del administrador: se
    // muestra apagada y explicada, nunca como un botón que no lleva a ningún
    // sitio. Sin mensaje, el servidor ya la marcó como oculta.
    if (!button.available) {
        return (
            <div className="w-full">
                <span className={`${style} cursor-not-allowed opacity-45`} aria-disabled="true">
                    {button.label}
                </span>
                {button.unavailableMessage && (
                    <p className="mt-1.5 text-center text-[12px] leading-snug text-[#475569]">
                        {button.unavailableMessage}
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="w-full">
            <Link to={`/eventos/${eventRef}${button.href}`} className={style}>
                {button.label}
            </Link>
            {button.price > 0 && (
                <p className="mt-1.5 text-center text-[13px] font-semibold text-[#1B2B4D]">
                    {money(button.price, button.currency)}
                </p>
            )}
        </div>
    );
};

const EventRegistrationCta = ({ cta, eventRef }: { cta: EventCta; eventRef: string }) => {
    const primary = cta.primary && !cta.primary.hidden ? cta.primary : null;
    const secondary = cta.secondary.filter(b => !b.hidden);
    if (!primary && !secondary.length) return null;

    return (
        <div className="w-full space-y-3">
            {primary && <Button button={primary} eventRef={eventRef} variant="primary" />}
            {secondary.map(button => (
                <Button key={button.key} button={button} eventRef={eventRef} variant="secondary" />
            ))}
        </div>
    );
};

export default EventRegistrationCta;
