// ════════════════════════════════════════════════════════════════════
// EL ESTADO DE LA SUSCRIPCIÓN, A LA VISTA DEL ADMINISTRADOR — v4.1204
//
// Una sola tarjeta, compartida por las seis pantallas de sitios (Clubes,
// Zonas, Ferias, Programas, Eventos y Asociaciones). Dice lo mismo que la
// portada va a pintar, porque sale del MISMO criterio (`subscriptionHealth`):
// con la condición escrita en cada pantalla, el panel diría «al día» mientras
// la portada pinta rojo — que es exactamente lo que se reportó con el Club
// Rotario Bogotá Occidente.
//
// Se calcula sobre lo que hay EN PANTALLA (lo que se va a guardar), así que es
// también una vista previa: cambiar la fecha o el estado mueve el veredicto.
// ════════════════════════════════════════════════════════════════════

import React from 'react';
import {
    subscriptionHealth, RENEWAL_WINDOW_DAYS, GRACE_DAYS,
    type ExpirationSource,
} from '../../lib/siteExpiration';

const SITE_STATUS: Record<string, string> = {
    active: 'Activo (publicado)',
    inactive: 'Inactivo',
    suspended: 'Suspendido',
    draft: 'En construcción',
};

const PAYMENT_STATUS: Record<string, string> = {
    active: 'Pagado / Activo',
    expired: 'Expirado / Vencido',
    pending: 'Pago pendiente',
    inactive: 'Prospecto (sin contrato)',
};

const BANNER_LABEL: Record<string, string> = {
    preventivo: 'Aviso preventivo (ámbar)',
    vencimiento: 'Barra de vencimiento (roja)',
    suspension: 'Barra de suspensión (roja)',
    pendiente: 'Aviso de pago pendiente (ámbar)',
    manual: 'Barra manual (casilla «Activar Banner»)',
};

const TONE: Record<string, string> = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    aviso: 'bg-amber-50 border-amber-200 text-amber-800',
    alerta: 'bg-rose-50 border-rose-200 text-rose-800',
    neutro: 'bg-gray-50 border-gray-200 text-gray-700',
};

const fechaLegible = (iso: string | null): string => {
    if (!iso) return 'Sin registrar';
    const [y, m, d] = iso.split('-').map(Number);
    // Se arma con las partes: `new Date('2027-09-04')` es medianoche UTC y en
    // Bogotá se leería el día anterior.
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
};

const fechaHora = (v?: string | Date | null): string | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};

const diasTexto = (n: number | null): string => {
    if (n === null) return '—';
    if (n === 0) return 'Vence hoy';
    if (n > 0) return `${n} día${n === 1 ? '' : 's'}`;
    return `Venció hace ${-n} día${n === -1 ? '' : 's'}`;
};

interface Props {
    site: ExpirationSource;
    /** Última vez que se guardó el sitio (columna `updatedAt`), si se conoce. */
    updatedAt?: string | Date | null;
}

const Fila: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
    <div className="flex flex-col">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
        <dd className="text-[12px] font-semibold text-gray-800">{v}</dd>
    </div>
);

export const SubscriptionHealthPanel: React.FC<Props> = ({ site, updatedAt }) => {
    const h = subscriptionHealth(site);
    const sitio = SITE_STATUS[(site.status || '').toLowerCase()] || site.status || '—';
    const pago = PAYMENT_STATUS[(site.subscriptionStatus || '').toLowerCase()] || site.subscriptionStatus || '—';
    const sync = fechaHora(updatedAt);

    return (
        <div className={`border rounded-xl p-4 ${TONE[h.tone]}`} data-subscription-phase={h.phase}>
            <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[13px] font-black">Estado de la suscripción: {h.label}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Vista previa de lo que se guardará</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 bg-white/70 rounded-lg p-3">
                <Fila k="Estado del sitio" v={sitio} />
                <Fila k="Estado de pago" v={pago} />
                <Fila k="Fecha de expiración" v={fechaLegible(h.expiresOn)} />
                <Fila k="Días restantes" v={diasTexto(h.daysLeft)} />
                <Fila k="Período de renovación" v={`Aviso desde ${RENEWAL_WINDOW_DAYS} días antes · gracia de ${GRACE_DAYS} días`} />
                <Fila
                    k="Barra en el sitio público"
                    v={h.banner ? BANNER_LABEL[h.banner] : 'No se muestra'}
                />
                <Fila k="Última actualización" v={sync || 'Sin dato'} />
            </dl>
            {h.message && (
                <p className="text-[11px] mt-3">
                    <span className="font-bold">Texto de la barra: </span>{h.message}
                </p>
            )}
            {h.warnings.length > 0 && (
                <ul className="mt-3 space-y-1">
                    {h.warnings.map(w => (
                        <li key={w} className="text-[11px] font-semibold">⚠️ {w}</li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SubscriptionHealthPanel;
