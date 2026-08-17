import React, { useEffect, useState } from 'react';

// ════════════════════════════════════════════════════════════════════
// Quiénes ya aportaron — v4.862
//
// UNA sola línea debajo del botón de aportar: cuántos aportes lleva la
// campaña y, al lado, el nombre de quien aportó, pasando solo de uno al
// siguiente.
//
// Reglas de la casa que este archivo cumple:
//
// - EL CRITERIO NO ESTÁ ACÁ. Quién puede aparecer lo decide el servidor
//   (`contributorRoll.js`) y por eso no hay espejo en el navegador: un aporte
//   anónimo no viaja en la respuesta ni con el nombre escondido. Esconderlo
//   con CSS o con un `if` acá lo dejaría a un clic de distancia en la consola
//   del navegador —es la misma decisión que la exportación de la Bóveda tomó
//   con el correo de un aportante anónimo (v4.850)—.
//
// - LOS NOMBRES SON DATOS, NO LENGUAJE: llevan `data-no-translate` (v4.662).
//   El traductor del sitio trabaja sobre el DOM y convertiría el apellido de
//   alguien en otra palabra al mirar la página en inglés.
//
// - CON UN SOLO NOMBRE NO HAY INTERVALO. Un temporizador que siempre vuelve
//   al mismo índice es trabajo invisible, y es además la regla del sitio: un
//   control —o una rotación— que no cambia nada no se enciende.
//
// - LA ROTACIÓN SE DETIENE CON EL CURSOR ENCIMA, Y SE SUELTA SOLA. Un freno
//   sin salida no se lee como un freno, se lee como que la función dejó de
//   funcionar (v4.832): acá la salida es `mouseleave`, que no puede quedarse
//   pegado.
//
// - SIN APORTES NO SE PINTA NADA. «0 aportes» debajo del botón no es un dato
//   neutro: es un cartel que desanima justo donde se pide ayuda. Y un hueco
//   dice la verdad —todavía no hay— sin afirmarla en la cara de quien llega.
// ════════════════════════════════════════════════════════════════════

/** Cada cuánto pasa al nombre siguiente. Un nombre se lee en un instante,
 *  pero cambiarlo demasiado rápido lo vuelve ilegible: 3,2 s deja leerlo dos
 *  veces sin que la línea parezca inquieta. */
const NOMBRE_ROTA_MS = 3200;

/** El cruce entre un nombre y el siguiente. Corto a propósito: esto es una
 *  línea de texto, no una galería. */
const NOMBRE_FUNDE_MS = 320;

export interface ContributorRollData {
    total: number;
    names: string[];
}

/** «1 aporte» / «2 aportes». El singular no es un detalle: «1 aportes» se lee
 *  como un texto armado por una máquina, justo en la línea que existe para
 *  que la campaña se sienta acompañada. */
export const rollCount = (total: number) => `${total} ${total === 1 ? 'aporte' : 'aportes'}`;

const ContributorRoll: React.FC<{ roll: ContributorRollData | null; accent: string }> = ({ roll, accent }) => {
    const names = roll?.names || [];
    const total = Number(roll?.total) || 0;

    // Los dos hooks van ARRIBA, antes de cualquier `return`: React identifica
    // cada hook por su ORDEN de llamada, y uno escrito debajo de un return
    // temprano se salta en el primer render y se ejecuta en el segundo —
    // `check:hooks`, y el defecto que dejó un panel en blanco en v4.689.
    const [idx, setIdx] = useState(0);
    const [quieto, setQuieto] = useState(false);

    useEffect(() => {
        if (names.length < 2 || quieto) return;
        const t = setInterval(() => setIdx(i => (i + 1) % names.length), NOMBRE_ROTA_MS);
        return () => clearInterval(t);
    }, [names.length, quieto]);

    // Si se quitan nombres —un reembolso, una campaña que se corrigió— el
    // índice guardado puede quedar fuera de rango. Se acota AL LEER, no con
    // otro efecto: así no hay un fotograma con la línea vacía.
    const nombre = names.length ? names[Math.min(idx, names.length - 1)] : '';

    if (!total) return null;

    return (
        <div
            className="mt-4 flex items-center justify-center gap-2 text-[13px] text-gray-500"
            onMouseEnter={() => setQuieto(true)}
            onMouseLeave={() => setQuieto(false)}
        >
            <span className="font-bold whitespace-nowrap" style={{ color: accent }}>
                {rollCount(total)}
            </span>
            {/* Sin ningún nombre publicable —todos anónimos— queda sólo el
                total, que es la verdad completa de lo que se puede decir. */}
            {nombre && (
                <>
                    <span aria-hidden="true" className="text-gray-300">·</span>
                    {/* La `key` es el NOMBRE, no el índice: cambiarla remonta
                        el nodo y con eso la animación vuelve a correr. El
                        fundido sale de `tailwindcss-animate` (`animate-in
                        fade-in`), que es un plugin del proyecto y por tanto
                        genera su CSS — una clase inventada a mano no llegaría
                        al CSS compilado y no existiría, en silencio (v4.719). */}
                    <span
                        key={nombre}
                        data-no-translate
                        title={nombre}
                        className="truncate animate-in fade-in"
                        style={{ animationDuration: `${NOMBRE_FUNDE_MS}ms` }}
                    >
                        {nombre}
                    </span>
                </>
            )}
        </div>
    );
};

export default ContributorRoll;
