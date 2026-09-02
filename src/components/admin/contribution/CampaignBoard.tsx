// Tablero de campañas — v4.990
//
// La cabecera de «Campañas de Contribución»: los indicadores arriba y las
// campañas debajo, como el tablero de inscripciones de un evento. NO es una
// pantalla nueva — un segundo sitio donde mirar lo mismo se separa del primero
// en silencio (regla de v4.987).
//
// Lo que decide qué se puede afirmar vive en `server/lib/campaignBoard.js`.
// Acá sólo se pinta lo que el servidor midió.
//
// ⚠️ LAS MONEDAS NO SE SUMAN. Cada una tiene su propia cifra y no hay ningún
// total que las junte: es la regla del módulo financiero desde v4.841. Un
// número que sume pesos con dólares es falso en las dos direcciones.
//
// ⚠️ Y LA CIFRA LLEVA A LA BÓVEDA YA FILTRADA. La clave del filtro la arma
// `destinoKeyOf` —el MISMO criterio con el que la Bóveda agrupa un aporte por
// destino—, no una cadena escrita a mano: con la forma `campana:<id>`
// repetida en dos sitios, el día que el criterio cambie el enlace llevaría a
// un filtro que no existe y la Bóveda saldría vacía sin decir por qué.

import React from 'react';
import { Link } from 'react-router-dom';
import { Coins, Users, Inbox, Megaphone, ArrowUpRight } from 'lucide-react';
import { formatMoney, formatNumber } from '../../../lib/locale';
import { destinoKeyOf } from '../../../lib/walletFilters';

export interface BoardMoney { currency: string; amount: number; aportes: number }
export interface BoardRow {
    id: string;
    aportes: number;
    personas: number;
    recaudado: BoardMoney[];
    solicitudes: { total: number; porEstado: Record<string, number>; pendientes: number };
}
export interface BoardData {
    scope?: string;
    siteScoped?: boolean;
    filas: BoardRow[];
    totales: {
        campanas: number;
        aportes: number;
        recaudado: BoardMoney[];
        solicitudes: number;
        pendientes: number;
    } | null;
    medido: { aportes: boolean; solicitudes: boolean };
    error?: string;
}

/** El enlace a la Bóveda con el destino y la moneda ya puestos. `rango=todo`
 *  a propósito: la cifra del tablero es del histórico, así que mandar a un
 *  período recortado enseñaría un número distinto del que se acaba de pulsar. */
export const walletLink = (campaignId: string, campaignName: string, currency?: string) => {
    const q = new URLSearchParams({ rango: 'todo' });
    q.set('destino', destinoKeyOf({ kind: 'campana', id: campaignId, label: campaignName }));
    if (currency) q.set('moneda', currency);
    return `/admin/boveda?${q.toString()}`;
};

/** Una cifra del tablero. `hint` va debajo y sólo cuando aporta algo: un
 *  renglón de ayuda que repite el número de arriba es ruido. */
const Cifra: React.FC<{
    label: string; value: React.ReactNode; icon: React.ElementType;
    hint?: string; tone?: string;
}> = ({ label, value, icon: Icon, hint, tone = 'text-gray-400' }) => (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gray-500">
            <Icon className={`w-3.5 h-3.5 ${tone}`} /> {label}
        </p>
        <p className="text-2xl font-bold text-gray-900 mt-1.5 leading-tight">{value}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
);

/** El bloque de arriba: lo que suman TODAS las campañas del alcance. */
export const CampaignBoard: React.FC<{ board: BoardData | null; cargando?: boolean }> = ({ board, cargando }) => {
    if (cargando && !board) {
        return (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 h-[92px] animate-pulse" />
                ))}
            </div>
        );
    }
    if (!board || !board.totales) return null;
    const t = board.totales;
    const sinMedir = !board.medido.aportes || !board.medido.solicitudes;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Cifra label="Campañas" value={formatNumber(t.campanas)} icon={Megaphone} tone="text-rose-400"
                    hint="propias y las que llegan del Distrito" />
                <Cifra label="Aportes" value={board.medido.aportes ? formatNumber(t.aportes) : '—'} icon={Users}
                    tone="text-emerald-500"
                    hint={board.medido.aportes ? undefined : 'no se pudieron leer'} />
                <Cifra label="Solicitudes de contenido"
                    value={board.medido.solicitudes ? formatNumber(t.solicitudes) : '—'} icon={Inbox}
                    tone="text-sky-500"
                    hint={board.medido.solicitudes
                        ? (t.pendientes > 0 ? `${formatNumber(t.pendientes)} sin revisar` : 'ninguna sin revisar')
                        : 'no se pudieron leer'} />
                <Cifra label="Monedas recaudadas"
                    value={board.medido.aportes ? (t.recaudado.length || '—') : '—'} icon={Coins}
                    tone="text-amber-500"
                    hint={t.recaudado.map(r => r.currency).join(' · ') || undefined} />
            </div>

            {/* Recaudo por moneda. Una tarjeta por moneda y ningún total: un peso
                no es un dólar. Si no hubo nada, no se pinta — cuatro ceros
                informan menos que un bloque ausente. */}
            {board.medido.aportes && t.recaudado.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                    <p className="mb-3 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gray-500">
                        <Coins className="w-3.5 h-3.5 text-amber-500" /> Recaudado por moneda
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {t.recaudado.map(r => (
                            <Link key={r.currency} to={`/admin/boveda?rango=todo&moneda=${r.currency}`}
                                className="group rounded-xl bg-gray-50 px-4 py-3 hover:bg-sky-50 transition-colors">
                                <p className="text-xs text-gray-500">{formatNumber(r.aportes)} aporte(s) · {r.currency}</p>
                                <p className="text-xl font-bold text-gray-900 flex items-center gap-1.5">
                                    {formatMoney(r.amount, r.currency)}
                                    <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-sky-500" />
                                </p>
                                <p className="text-[11px] text-gray-400 mt-0.5">Ver en la Bóveda de Fondos</p>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <p className="text-[11px] text-gray-400 leading-relaxed">
                {board.siteScoped
                    ? 'Los aportes son los que entraron por la página de tu sitio, que es lo que muestra tu Bóveda de Fondos. Una campaña compartida puede haber recaudado más en los demás sitios que la publican.'
                    : 'Los aportes son los de la campaña completa, en todos los sitios que la publican.'}
                {' '}Un aporte reembolsado deja de contar.
                {sinMedir && ' Lo que no se pudo leer se muestra con un guion, no en cero.'}
            </p>
        </div>
    );
};

/** La tira de indicadores de UNA campaña, dentro de su fila del listado. */
export const CampaignIndicators: React.FC<{
    fila?: BoardRow; nombre: string; medido: BoardData['medido'];
}> = ({ fila, nombre, medido }) => {
    if (!fila) return null;
    const sinNada = fila.aportes === 0 && fila.solicitudes.total === 0;
    if (sinNada && medido.aportes && medido.solicitudes) {
        return <span className="text-[11px] text-gray-300">Sin aportes ni solicitudes todavía</span>;
    }
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {medido.aportes && fila.aportes > 0 && (
                <span className="text-xs text-gray-500">
                    <b className="text-gray-900">{formatNumber(fila.aportes)}</b> aporte(s)
                    {fila.personas > 0 && fila.personas < fila.aportes && (
                        <span className="text-gray-400"> · {formatNumber(fila.personas)} con correo</span>
                    )}
                </span>
            )}
            {medido.aportes && fila.recaudado.map(r => (
                <Link key={r.currency} to={walletLink(fila.id, nombre, r.currency)}
                    onClick={e => e.stopPropagation()}
                    className="text-xs font-bold text-sky-700 hover:text-sky-900 hover:underline inline-flex items-center gap-1"
                    title={`Ver en la Bóveda de Fondos los aportes de esta campaña en ${r.currency}`}>
                    {formatMoney(r.amount, r.currency)}
                    <ArrowUpRight className="w-3 h-3" />
                </Link>
            ))}
            {medido.solicitudes && fila.solicitudes.total > 0 && (
                <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                    <Inbox className="w-3 h-3 text-sky-400" />
                    <b className="text-gray-900">{formatNumber(fila.solicitudes.total)}</b> solicitud(es)
                    {fila.solicitudes.pendientes > 0 && (
                        <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-600">
                            {formatNumber(fila.solicitudes.pendientes)} sin revisar
                        </span>
                    )}
                </span>
            )}
        </div>
    );
};

export default CampaignBoard;
