// ════════════════════════════════════════════════════════════════════════════
// Espejo MÍNIMO de la extensión de artículos — v4.1059
//
// Sólo lo que hace falta para PINTAR el contador del editor sin pagar un viaje
// de red por cada tecla: contar los caracteres del cuerpo y decir cómo queda
// frente al objetivo.
//
// ⚠️ NO TRAE `validateArticleLength`, `profileForTarget`, `resolveArticleProfile`
// ni `planBulkRegeneration`, y su ausencia es deliberada: qué se guarda, qué
// perfil se le pide al modelo y qué artículos entran en un lote lo decide el
// SERVIDOR y viaja resuelto. Con dos criterios, la pantalla prometería una
// regeneración que la API rechaza. Una prueba comprueba que no vuelvan.
//
// ⚠️ Y NO CORTA NADA. Acá se MIDE y se avisa; el objetivo gobierna lo que
// escribe la IA, nunca lo que escribe una persona (requisito 11 del encargo).
// ════════════════════════════════════════════════════════════════════════════

/** El MISMO `stripHtml` del servidor (`seoSpec.js`). Con dos formas de extraer
 *  el texto, el contador del editor diría un número y el validador mediría otro
 *  sobre el mismo cuerpo. La paridad se comprueba por SALIDAS en las pruebas. */
export function stripHtml(html: string | null | undefined): string {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Caracteres del texto VISIBLE de un cuerpo HTML. */
export const bodyChars = (html: string | null | undefined): number => stripHtml(html).length;

/** Palabras del texto visible, con el mismo criterio del servidor. */
export const bodyWords = (html: string | null | undefined): number => {
    const t = stripHtml(html);
    return t ? t.split(/\s+/).filter(Boolean).length : 0;
};

// La banda de tolerancia: el objetivo NO es un corte en el carácter N.
export const TOLERANCE_RATIO = 0.18;
export const MIN_TOLERANCE_CHARS = 300;

export const toleranceFor = (targetChars: number | null | undefined) => {
    const t = Math.round(Number(targetChars) || 0);
    const band = Math.max(MIN_TOLERANCE_CHARS, Math.round(t * TOLERANCE_RATIO));
    return { band, min: Math.max(0, t - band), max: t + band };
};

export type LengthState = 'sin_objetivo' | 'under' | 'ok' | 'over';

export interface LengthVerdict {
    state: LengthState;
    chars: number;
    target: number | null;
    min?: number;
    max?: number;
    label: string;
    note?: string;
}

/**
 * El veredicto del contador. `over` se PINTA y se explica; nunca impide
 * guardar: un administrador que escribe un artículo largo a mano está tomando
 * una decisión, no cometiendo un error.
 */
export function lengthVerdict(chars: number, targetChars: number | null | undefined): LengthVerdict {
    const c = Math.max(0, Math.round(Number(chars) || 0));
    const t = Math.round(Number(targetChars) || 0);
    if (!t) return { state: 'sin_objetivo', chars: c, target: null, label: `${c.toLocaleString('es-CO')} caracteres` };

    const { min, max } = toleranceFor(t);
    const state: LengthState = c < min ? 'under' : c > max ? 'over' : 'ok';
    const label = `${c.toLocaleString('es-CO')} / ${t.toLocaleString('es-CO')} caracteres objetivo`;
    const note = state === 'over'
        ? `Supera el objetivo en ${(c - t).toLocaleString('es-CO')} caracteres. Podés dejarlo así: el objetivo gobierna lo que escribe la IA, no lo que escribís vos.`
        : state === 'under'
            ? `Queda ${(t - c).toLocaleString('es-CO')} caracteres por debajo del objetivo.`
            : '';
    return { state, chars: c, target: t, min, max, label, note };
}

/** El color del contador. Sin objetivo es informativo, nunca una alarma. */
export const verdictTone = (state: LengthState): string =>
    state === 'over' ? 'text-amber-600'
        : state === 'under' ? 'text-slate-500'
            : state === 'ok' ? 'text-emerald-600'
                : 'text-slate-400';
