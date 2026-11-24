/**
 * Presentación comercial — enlaces de WhatsApp (v4.1356.0). Puro.
 */

/** `https://wa.me/<sólo dígitos>?text=<mensaje>`; `null` si el número no sirve. */
export function whatsappLink(number: string | null | undefined, message: string): string | null {
    const digits = String(number ?? '').replace(/\D/g, '');
    if (digits.length < 8) return null;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Reemplaza `{club}` por « para el <nombre>», o lo quita si no hay destinatario. */
export function actionMessage(template: string, clubName: string | null | undefined): string {
    const club = clubName?.trim();
    return template.replace('{club}', club ? ` para el ${club}` : '');
}
