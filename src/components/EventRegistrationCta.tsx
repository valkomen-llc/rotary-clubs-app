// ════════════════════════════════════════════════════════════════════
// Botones de inscripción de la ficha del evento — v4.652.0
//
// Dos botones, no un formulario con tres opciones:
//
//   · El **principal** lo decide el IDIOMA ACTIVO del sitio: con el sitio en
//     Español (Colombia) es "Registro Nacional", en pesos; en cualquier otro
//     idioma es "Registro Internacional", en dólares. Nunca los dos.
//   · Debajo, **Registro CADRES**, visible siempre en ambos casos.
//
// El botón que no corresponde **no llega al navegador**: el servidor resuelve
// cuál toca y devuelve sólo ese. No se oculta con CSS ni queda en el DOM.
//
// Cada botón abre el formulario de SU categoría, ya elegida y bloqueada
// (`/registro?categoria=…`). El servidor, al recibir esa clave, devuelve
// únicamente esa categoría: quien entra por el registro internacional no
// recibe ni ve precios, campos ni mensajes del nacional, y al revés.
//
// La geolocalización ya NO decide (v4.652). Manda el idioma que el visitante
// tiene puesto: si está en Colombia y cambia a inglés, ve el internacional; si
// está fuera y cambia a español, ve el nacional. El cambio es inmediato, sin
// recargar.
//
// Qué botones existen, con qué texto, en qué orden y a qué categoría apuntan lo
// decide el administrador en la pestaña Registro del evento.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../lib/eventRegistrationSpec';
import { CTA_SOFT, CTA_SOLID, ctaSkin } from '../lib/ctaStyles';

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
 * Idioma activo del sitio, en forma de locale completo.
 *
 * El selector del sitio ofrece un solo español, y es el de Colombia (su bandera
 * lo dice), así que `es` se manda como `es-CO`. Los demás van tal cual.
 */
export const localeOf = (lang: string): string => (lang === 'es' ? 'es-CO' : lang || 'es-CO');

/**
 * Trae los botones del evento. Devuelve `null` mientras carga o si el evento
 * no tiene inscripciones abiertas, para que la ficha siga mostrando lo que
 * tenía configurado el administrador.
 *
 * **Se vuelve a consultar cada vez que cambia el idioma activo.** Es lo que
 * hace que los botones, sus textos, sus precios y sus enlaces se actualicen al
 * vuelo al cambiar de idioma, sin recargar la página: `lang` está en las
 * dependencias del efecto.
 */
export const useEventCta = (clubId?: string, eventRef?: string, lang?: string) => {
    const [cta, setCta] = useState<EventCta | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!clubId || !eventRef) return;
        let cancelled = false;
        // Al cambiar de idioma se descarta lo anterior antes de pedir lo nuevo:
        // así no queda ni un fotograma con el botón del idioma que se acaba de
        // abandonar.
        setCta(null);
        setLoading(true);
        const query = new URLSearchParams();
        // El idioma ACTIVO del sitio decide qué registro se ofrece. No se manda
        // el del navegador: lo que vale es lo que el visitante tiene puesto en
        // el selector, aunque su navegador o su país digan otra cosa.
        query.set('locale', localeOf(String(lang || '')));

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
    }, [clubId, eventRef, lang]);

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
    // La GEOMETRÍA es de la ficha —el botón ocupa el ancho de la columna—, pero
    // los COLORES salen de `ctaStyles.ts`, que es de donde los toma «Postular
    // Proyecto» en el encabezado (v4.719). Es la misma acción vista desde otro
    // sitio y tiene que verse igual; hasta v4.718 el secundario era un contorno
    // azul marino escrito a mano aquí.
    //
    // v4.752 — El PRINCIPAL también. Iba en un naranja (#D57D2C) escrito a mano
    // que no pertenecía a ninguna paleta del sitio y no se repetía en ninguna
    // otra parte; ahora es `CTA_SOLID`, que es la pareja declarada de
    // `CTA_SOFT`: uno sólido que pesa y uno suave a su lado. Así el color sigue
    // distinguiendo cuál es el registro principal —que es lo único que los
    // distingue— pero con la paleta del sitio.
    //
    // Los DOS botones tienen el mismo alto y la misma letra (v4.719.1). El
    // secundario venía más bajo y con letra más chica, y esa diferencia no dice
    // nada: los dos llevan a un formulario de inscripción y ninguno es un
    // trámite menor que el otro —el CADRE es el registro de un rol del propio
    // evento—. Lo que distingue al principal es el COLOR, que ya basta.
    const base = 'w-full block text-center rounded-full font-bold transition-colors text-[15px] py-3';
    const skinOf = (interactive: boolean) =>
        ctaSkin(variant === 'primary' ? CTA_SOLID : CTA_SOFT, interactive);
    const style = (interactive: boolean) => `${base} ${skinOf(interactive)}`;

    // Categoría cerrada o agotada, pero con mensaje del administrador: se
    // muestra apagada y explicada, nunca como un botón que no lleva a ningún
    // sitio. Sin mensaje, el servidor ya la marcó como oculta.
    if (!button.available) {
        return (
            <div className="w-full">
                <span className={`${style(false)} cursor-not-allowed opacity-45`} aria-disabled="true">
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
            <Link to={`/eventos/${eventRef}${button.href}`} className={style(true)}>
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
