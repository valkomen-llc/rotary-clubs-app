// ════════════════════════════════════════════════════════════════════
// El español como contenido Unicode de primera clase — v4.1063
//
// PURO: sin base, sin red, sin DOM, sin importaciones. Lo consumen el
// Generador de Aniversarios y —cuando haga falta— el resto del Estudio de
// Contenido: un segundo criterio sobre los mismos caracteres se separaría en
// silencio, y lo que se separaría es cómo se escribe el nombre de un club en
// una pieza que publica una institución.
//
// ── QUÉ RESUELVE, Y QUÉ NO ──────────────────────────────────────────
//
// ⚠️ NO ADIVINA DÓNDE VAN LAS TILDES. No hay corrector ortográfico acá y no
// puede haberlo: «Peña» y «Pena» son dos apellidos distintos, y un módulo que
// «corrija» nombres propios inventaría datos sobre personas y organizaciones
// reales. La FUENTE DE VERDAD es siempre el string oficial almacenado.
//
// Lo que sí hace es DISTINGUIR dos operaciones que suelen confundirse:
//
//   · `nfc`        — para lo que se MUESTRA. Compone «a + ́ » en «á», así que
//                    un recorte por longitud no puede partir una letra de su
//                    tilde y el medidor tipográfico cuenta un glifo, no dos.
//   · `foldForCompare` — para lo que se COMPARA. Quita los diacríticos y baja
//                    a minúsculas, y su salida NUNCA se muestra ni se guarda:
//                    sirve para buscar, para casar y para detectar que un
//                    texto perdió sus tildes. Escribir su resultado en una
//                    pieza es exactamente el defecto que este módulo existe
//                    para impedir.
//
// La regla del sitio, escrita una vez: `slugify`, `norm` y compañía valen para
// slugs, identificadores, búsquedas y URLs; JAMÁS sobre texto visible.
// ════════════════════════════════════════════════════════════════════

/** La forma canónica de todo texto VISIBLE. Idempotente y segura sobre `null`. */
export const nfc = (s) => String(s ?? '').normalize('NFC');

/** NFC + espacios colapsados: lo que se guarda y lo que se imprime. */
export const cleanVisible = (s) => nfc(s).replace(/\s+/g, ' ').trim();

/** ⚠️ SÓLO PARA COMPARAR. Su salida no se muestra, no se guarda y no viaja a
 *  ningún modelo: es una llave de comparación, no un texto. */
export const foldForCompare = (s) => nfc(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

/** ¿Este texto lleva algún carácter propio del español que se pueda perder?
 *  La eñe entra: su tilde es una marca combinante igual que la de «á». */
export const hasDiacritics = (s) => {
    const t = nfc(s);
    return t !== t.normalize('NFD').replace(/[̀-ͯ]/g, '');
};

/** Las palabras del texto que llevan diacríticos, en su forma visible. Es lo
 *  que permite decirle a un modelo QUÉ palabras no puede simplificar, sin
 *  tener que enumerar ciudades ni apellidos en el código. */
export const diacriticWords = (s) => {
    const vistas = new Set();
    return cleanVisible(s).split(/[\s.,;:()«»"'¡!¿?/–—-]+/)
        .filter(w => w && hasDiacritics(w))
        .filter(w => { const k = w.toLowerCase(); if (vistas.has(k)) return false; vistas.add(k); return true; });
};

/** Una palabra deletreada carácter por carácter: «Bogotá» → «B-o-g-o-t-á».
 *  Es la forma más inequívoca de decirle a un modelo generativo cómo se
 *  escribe algo — «respetá las tildes» es una instrucción que se puede
 *  interpretar; un deletreo, no. Se deletrea sobre NFC para que la letra y su
 *  tilde sean UN carácter y no dos. */
export const spellOut = (w) => [...nfc(w)].join('-');

/**
 * ¿Dos textos son el MISMO salvo por sus diacríticos?
 *
 * Es la única pregunta que autoriza a este módulo a decir «acá se perdió una
 * tilde», y por eso es tan estrecha: si los textos difieren en algo más que
 * las marcas diacríticas, la respuesta es `false` y nadie descalifica nada.
 * Con una comparación laxa, cualquier lectura imperfecta se leería como un
 * error ortográfico y se regeneraría una pieza correcta (la lección de v4.906,
 * donde el texto legítimo de una fotografía descalificó una pieza buena).
 */
export const sameButForDiacritics = (a, b) => {
    const A = cleanVisible(a), B = cleanVisible(b);
    if (!A || !B) return false;
    if (A.toLowerCase() === B.toLowerCase()) return false;   // idénticos: no hay nada que señalar
    return foldForCompare(A) === foldForCompare(B);
};

/** Qué palabras perdieron (o ganaron) su diacrítico entre el texto oficial y
 *  el que se leyó de vuelta. Se emparejan POR POSICIÓN porque ya sabemos que
 *  los dos textos son el mismo salvo por las marcas. */
export const diacriticDiff = (official, rendered) => {
    if (!sameButForDiacritics(official, rendered)) return [];
    const o = cleanVisible(official).split(' ');
    const r = cleanVisible(rendered).split(' ');
    const out = [];
    for (let i = 0; i < o.length; i += 1) {
        const esperada = o[i], leida = r[i] || '';
        if (esperada.toLowerCase() !== leida.toLowerCase()) out.push({ expected: esperada, got: leida });
    }
    return out;
};

export default {
    nfc, cleanVisible, foldForCompare, hasDiacritics,
    diacriticWords, spellOut, sameButForDiacritics, diacriticDiff,
};
