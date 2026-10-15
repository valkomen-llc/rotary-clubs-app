// ════════════════════════════════════════════════════════════════════
// CUÁNDO SE VE LA BARRA DE VENCIMIENTO — v4.878, rehecho en v4.1204
//
// El CRITERIO, y es PURO: sin red, sin base y sin DOM. `today` entra como
// parámetro, así que cada escenario se puede fijar en una prueba.
//
// ── EL DEFECTO QUE CORRIGE v4.1204 ──────────────────────────────────
//
// Se reportó con el Club Rotario Bogotá Occidente delante: en el panel figura
// Activo, «Pagado / Activo» y vence el 04/09/2027, y su portada mostraba la
// barra roja «VENCIMIENTO — Sitio en periodo de renovación».
//
// v4.878 decidía con una disyunción: `subscriptionStatus === 'expired'` O la
// casilla `expirationBannerActive`. La casilla se marca a mano, y NADA la
// desmarcaba al renovar desde el panel —sólo el webhook de Stripe lo hacía—,
// así que un sitio que se renovaba a mano quedaba con la barra encendida para
// siempre. El estado del pago y la fecha decían «al día»; una casilla vieja
// decía lo contrario y ganaba.
//
// ── LA SUSCRIPCIÓN VIGENTE MANDA SOBRE LA CASILLA ───────────────────
//
// Con el pago al día y la fecha de expiración más allá de la ventana de aviso,
// la barra NO se pinta, diga lo que diga la casilla. La casilla sigue
// sirviendo donde la plataforma no tiene con qué decidir (un sitio sin fecha
// registrada) y el panel dice, junto a ella, cuándo no tiene efecto.
//
// ── ⚠️ AHORA SÍ SE MIRA LA FECHA, y el motivo de v4.878 se revisó ────
//
// v4.878 evitó la fecha por miedo a pintar de rojo un sitio con una fecha
// vieja y el pago al día. Ese caso no puede sobrevivir en producción: el cron
// `process-expirations` SUSPENDE —`status: inactive`, `subscriptionStatus:
// expired`— todo sitio activo cuya fecha venció hace más de cinco días. La
// barra sólo anticipa lo que el cron ya va a hacer, y lo hace con la MISMA
// ventana (15 días) y el MISMO período de gracia (5 días).
//
// ── LAS FASES ───────────────────────────────────────────────────────
//
//   al_dia      pagado, vence más allá de 15 días     → sin barra
//   por_vencer  pagado, vence en 0..15 días           → aviso preventivo (ámbar)
//   gracia      pagado, venció hace 1..5 días         → vencimiento (rojo)
//   vencido     marcado vencido, o venció hace > 5    → vencimiento (rojo)
//   suspendido  vencido Y el sitio quedó inactivo     → suspensión (rojo)
//   pendiente   pago en proceso                       → aviso neutro (ámbar), sólo
//                                                        cerca del vencimiento; nunca
//                                                        dice «suspendido»
//   sin_contrato prospecto / estado desconocido      → sin barra (salvo la casilla)
//   sin_fecha   pagado, sin fecha registrada          → sin barra (salvo la casilla)
//
// El estado del SITIO (`status`) y el de la SUSCRIPCIÓN son independientes:
// el primero sólo distingue «vencido» de «suspendido».
// ════════════════════════════════════════════════════════════════════

/** Los estados de suscripción que significan «no se renovó». Cerrado a propósito. */
export const EXPIRED_SUBSCRIPTION_STATUSES = ['expired'] as const;

/** Días antes del vencimiento en que empieza el aviso preventivo. Igual que el cron. */
export const RENEWAL_WINDOW_DAYS = 15;

/** Días después del vencimiento antes de la suspensión automática. Igual que el cron. */
export const GRACE_DAYS = 5;

/** La zona en la que se cuentan los días: la de la plataforma, no la del servidor. */
export const EXPIRATION_TZ = 'America/Bogota';

export type SubscriptionPhase =
    | 'al_dia' | 'por_vencer' | 'gracia' | 'vencido' | 'suspendido'
    | 'pendiente' | 'sin_contrato' | 'sin_fecha' | 'sin_datos';

/** Qué barra se pinta. `null` = ninguna. */
export type BannerKind = 'preventivo' | 'vencimiento' | 'suspension' | 'pendiente' | 'manual' | null;

/** Por qué se está viendo la barra. `null` = no se ve. */
export type ExpirationBannerReason = 'suscripcion' | 'fecha' | 'pendiente' | 'manual' | null;

/** Lo que hace falta saber de un sitio para decidir. */
export interface ExpirationSource {
    subscriptionStatus?: string | null;
    expirationDate?: string | Date | null;
    expirationBannerActive?: boolean | null;
    expirationBannerMessage?: string | null;
    /** Estado de publicación del SITIO, no de la suscripción. */
    status?: string | null;
}

export interface SubscriptionHealth {
    phase: SubscriptionPhase;
    banner: BannerKind;
    reason: ExpirationBannerReason;
    tone: 'ok' | 'aviso' | 'alerta' | 'neutro';
    /** Días calendario hasta el vencimiento; negativo si ya pasó. `null` sin fecha. */
    daysLeft: number | null;
    /** Fecha de expiración legible (AAAA-MM-DD), o null. */
    expiresOn: string | null;
    /** Rótulo corto del estado, para el panel. */
    label: string;
    /** El texto de la barra pública, si hay barra. */
    message: string | null;
    /** La casilla está marcada y NO decide nada (el sitio está al día). */
    manualFlagIgnored: boolean;
    /** Contradicciones de los datos que conviene corregir en el panel. */
    warnings: string[];
}

const normalizar = (v: unknown): string =>
    typeof v === 'string' ? v.trim().toLowerCase() : '';

/** El sitio está vencido según su estado de suscripción. */
export const isExpiredSubscription = (status?: string | null): boolean =>
    (EXPIRED_SUBSCRIPTION_STATUSES as readonly string[]).includes(normalizar(status));

/**
 * El día calendario de la fecha de expiración, como AAAA-MM-DD.
 *
 * ⚠️ Se leen las partes UTC: el panel guarda `new Date('2027-09-04')`, que es
 * medianoche UTC. Leída en la zona de Bogotá daría el 3 de septiembre.
 */
export const expirationDay = (value?: string | Date | null): string | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

/** El día de HOY en la zona de la plataforma, como AAAA-MM-DD. */
export const todayIn = (today: Date = new Date(), timeZone: string = EXPIRATION_TZ): string => {
    try {
        const partes = new Intl.DateTimeFormat('en-CA', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(today);
        const v = (t: string) => partes.find(x => x.type === t)?.value || '';
        return `${v('year')}-${v('month')}-${v('day')}`;
    } catch {
        return expirationDay(today) || '';
    }
};

const diaNumero = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Días calendario entre hoy (Bogotá) y la fecha de expiración. */
export const daysUntilExpiration = (
    value?: string | Date | null, today: Date = new Date(),
): number | null => {
    const dia = expirationDay(value);
    if (!dia) return null;
    const hoy = todayIn(today);
    if (!hoy) return null;
    return Math.round(diaNumero(dia) - diaNumero(hoy));
};

const SITE_SUSPENDED = ['inactive', 'suspended'];

const dias = (n: number) => `${n} día${n === 1 ? '' : 's'}`;

/**
 * La salud de la suscripción de un sitio: fase, barra, mensaje y avisos.
 *
 * ⚠️ Es el ÚNICO punto de decisión. Lo consumen la barra pública, el
 * desplazamiento del menú y el panel de administración: con la condición
 * escrita en cada uno, el panel diría «al día» mientras la portada pinta rojo,
 * que es exactamente lo que se reportó.
 */
export const subscriptionHealth = (
    site?: ExpirationSource | null, today: Date = new Date(),
): SubscriptionHealth => {
    const base = (h: Partial<SubscriptionHealth> & Pick<SubscriptionHealth, 'phase' | 'label'>): SubscriptionHealth => ({
        banner: null, reason: null, tone: 'neutro', daysLeft: null, expiresOn: null,
        message: null, manualFlagIgnored: false, warnings: [], ...h,
    });
    if (!site) return base({ phase: 'sin_datos', label: 'Sin datos' });

    const sub = normalizar(site.subscriptionStatus);
    const daysLeft = daysUntilExpiration(site.expirationDate, today);
    const expiresOn = expirationDay(site.expirationDate);
    const manual = site.expirationBannerActive === true;
    const manualMsg = (site.expirationBannerMessage || '').trim();
    const sitioSuspendido = SITE_SUSPENDED.includes(normalizar(site.status));
    const warnings: string[] = [];
    const comun = { daysLeft, expiresOn };

    const manualBanner = (phase: SubscriptionPhase, label: string): SubscriptionHealth => base({
        ...comun, phase, label, banner: 'manual', reason: 'manual', tone: 'alerta',
        message: manualMsg || 'Sitio en periodo de renovación. Asegure la continuidad de sus servicios digitales.',
        warnings,
    });

    // ── Marcado vencido: la decisión de facturación manda ──────────
    if (isExpiredSubscription(sub)) {
        if (daysLeft !== null && daysLeft > 0) {
            warnings.push(`La suscripción está marcada como vencida pero la fecha de expiración (${expiresOn}) es futura. Si el club ya pagó, cambia el estado a «Pagado / Activo».`);
        }
        if (sitioSuspendido) {
            return base({
                ...comun, phase: 'suspendido', label: 'Suspendido por vencimiento',
                banner: 'suspension', reason: 'suscripcion', tone: 'alerta', warnings,
                message: 'Servicio suspendido por vencimiento de la suscripción. Renueve para restablecer la continuidad de los servicios digitales del sitio.',
            });
        }
        return base({
            ...comun, phase: 'vencido', label: 'Vencido sin renovar',
            banner: 'vencimiento', reason: 'suscripcion', tone: 'alerta', warnings,
            message: 'La suscripción del sitio está vencida. Renueve para asegurar la continuidad de sus servicios digitales antes de la suspensión automática.',
        });
    }

    // ── Pago en proceso: nunca se dice «suspendido» ────────────────
    if (sub === 'pending') {
        const cerca = daysLeft === null || daysLeft <= RENEWAL_WINDOW_DAYS;
        return base({
            ...comun, phase: 'pendiente', label: 'Pago pendiente de confirmación',
            banner: cerca ? 'pendiente' : null, reason: cerca ? 'pendiente' : null,
            tone: 'aviso', warnings,
            message: cerca
                ? 'Renovación en proceso: el pago de la suscripción está pendiente de confirmación. El sitio sigue en línea con normalidad.'
                : null,
        });
    }

    // ── Pagado / Activo: la fecha decide ───────────────────────────
    if (sub === 'active') {
        if (daysLeft === null) {
            if (manual) return manualBanner('sin_fecha', 'Al día (sin fecha registrada)');
            warnings.push('No hay fecha de expiración registrada: la plataforma no puede avisar a tiempo del próximo vencimiento.');
            return base({ ...comun, phase: 'sin_fecha', label: 'Al día (sin fecha registrada)', tone: 'ok', warnings });
        }
        if (daysLeft > RENEWAL_WINDOW_DAYS) {
            return base({
                ...comun, phase: 'al_dia', label: 'Al día', tone: 'ok',
                manualFlagIgnored: manual, warnings,
            });
        }
        if (daysLeft >= 0) {
            const cuando = daysLeft === 0 ? 'hoy' : `en ${dias(daysLeft)}`;
            return base({
                ...comun, phase: 'por_vencer', label: `Vence ${cuando}`,
                banner: 'preventivo', reason: 'fecha', tone: 'aviso', warnings,
                message: `La suscripción del sitio vence ${cuando}. Renueve a tiempo para asegurar la continuidad de sus servicios digitales.`,
            });
        }
        const vencidoHace = -daysLeft;
        if (vencidoHace <= GRACE_DAYS) {
            const resta = GRACE_DAYS - vencidoHace;
            return base({
                ...comun, phase: 'gracia', label: `Vencido hace ${dias(vencidoHace)} (período de gracia)`,
                banner: 'vencimiento', reason: 'fecha', tone: 'alerta', warnings,
                message: resta > 0
                    ? `Sitio en periodo de renovación: la suscripción venció hace ${dias(vencidoHace)}. Renueve antes de la suspensión automática (en ${dias(resta)}).`
                    : 'Sitio en periodo de renovación: hoy termina el período de gracia. Renueve para evitar la suspensión automática.',
            });
        }
        warnings.push('La fecha de expiración ya pasó el período de gracia y el estado sigue «Pagado / Activo». Si el club renovó, actualiza la fecha de expiración.');
        return base({
            ...comun, phase: 'vencido', label: `Vencido hace ${dias(vencidoHace)}`,
            banner: 'vencimiento', reason: 'fecha', tone: 'alerta', warnings,
            message: 'La suscripción del sitio está vencida. Renueve para asegurar la continuidad de sus servicios digitales antes de la suspensión automática.',
        });
    }

    // ── Prospecto o estado desconocido: no se deduce nada ──────────
    if (manual) return manualBanner('sin_contrato', 'Sin suscripción activa');
    return base({ ...comun, phase: 'sin_contrato', label: sub === 'inactive' ? 'Prospecto (sin contrato)' : 'Sin suscripción registrada', warnings });
};

/**
 * Por qué se ve la barra en este sitio. `null` = no se ve.
 *
 * El MOTIVO importa tanto como el booleano: es lo que permite que el panel
 * explique una casilla que no manda (v4.787: nunca pintar el indicador en
 * contra del veredicto).
 */
export const expirationBannerReason = (
    site?: ExpirationSource | null, today: Date = new Date(),
): ExpirationBannerReason => subscriptionHealth(site, today).reason;

/**
 * Si este sitio muestra la barra de vencimiento.
 *
 * ⚠️ Lo consumen la barra (`ExpirationBanner`) y el desplazamiento del menú
 * (`Navbar`). Tienen que dar la MISMA respuesta: la barra es `sticky`, así que
 * si una dice que sí y la otra que no, el menú se monta encima del aviso.
 */
export const showsExpirationBanner = (
    site?: ExpirationSource | null, today: Date = new Date(),
): boolean => subscriptionHealth(site, today).banner !== null;

/**
 * Lo que el panel le dice a quien mira la casilla «Activar Banner».
 *
 * Se devuelve el texto y no un booleano porque la casilla y el aviso son la
 * misma explicación: cuando la plataforma decide sola, la casilla no cambia
 * nada, y hay que decirlo junto a ella.
 */
export const bannerLockNotice = (
    site?: ExpirationSource | null, today: Date = new Date(),
): string | null => {
    const h = subscriptionHealth(site, today);
    if (h.manualFlagIgnored) {
        return `La suscripción está al día (vence el ${h.expiresOn}), así que la barra NO se muestra aunque la casilla esté marcada. Se desmarca sola al guardar.`;
    }
    if (h.reason === 'suscripcion') {
        return 'Este sitio está marcado como vencido, así que la barra ya se muestra en su portada. La casilla sólo decide en sitios sin fecha de expiración registrada.';
    }
    if (h.reason === 'fecha' || h.reason === 'pendiente') {
        return 'La plataforma ya muestra el aviso correspondiente por la fecha de expiración; la casilla no cambia nada en este momento.';
    }
    return null;
};
