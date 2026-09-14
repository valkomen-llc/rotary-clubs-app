import { useEffect, useState } from 'react';

// ════════════════════════════════════════════════════════════════════
// ¿SE PUEDE COBRAR CON TARJETA EN ESTE SITIO? — v4.1056
//
// UN solo punto de consulta, compartido por las pantallas que ofrecen un
// aporte con tarjeta fuera del modal de donación: el bloque de Aportes
// (membresía) y la ficha de un proyecto. Escrito a mano en cada una, la
// tercera se olvida y el fallo es MUDO —el botón sigue a la vista y el
// endpoint contesta 503—, que es exactamente el defecto que esto corrige.
//
// Lo DECIDE el servidor: las credenciales no viajan al navegador y el
// interruptor vive en la base. Acá sólo se pinta.
//
// ⚠️ ANTE LA DUDA SE OFRECE. Mientras la respuesta no llega —o si no llega
// nunca— se devuelve `true`: no poder aportar por un fallo de red transitorio
// sería peor que ofrecer un botón que el servidor rechaza con su motivo. Lo
// que lo hace seguro es que el cobro está guardado en el SERVIDOR: esto
// decide qué se PINTA, nunca qué se puede cobrar.
//
// Reutiliza `/financial/currency` en vez de un endpoint propio: esa ruta ya
// resuelve la disponibilidad de la tarjeta y es la dueña del dato. Un segundo
// endpoint daría dos verdades sobre el mismo botón.
// ════════════════════════════════════════════════════════════════════

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface CardPayment {
    /** Si se pinta el botón. `true` mientras no se sepa. */
    available: boolean;
    /** Por qué no, cuando el servidor lo dijo. No se le muestra al visitante. */
    reason: string | null;
    /** Si la respuesta ya llegó. Sirve para no afirmar nada mientras se pregunta. */
    resolved: boolean;
}

export const useCardPayment = (clubId?: string | null): CardPayment => {
    const [estado, setEstado] = useState<CardPayment>({ available: true, reason: null, resolved: false });

    useEffect(() => {
        if (!clubId) return;
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/financial/currency?clubId=${encodeURIComponent(clubId)}`);
                const d = await r.json();
                if (!vivo) return;
                // `card` ausente es «no se supo», no «apagada»: el servidor lo
                // manda siempre, incluso cuando degrada.
                if (!r.ok || !d?.card) { setEstado({ available: true, reason: null, resolved: false }); return; }
                setEstado({ available: d.card.available !== false, reason: d.card.reason ?? null, resolved: true });
            } catch {
                if (vivo) setEstado({ available: true, reason: null, resolved: false });
            }
        })();
        return () => { vivo = false; };
    }, [clubId]);

    return estado;
};

export default useCardPayment;
