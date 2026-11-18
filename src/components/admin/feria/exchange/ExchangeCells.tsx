// ════════════════════════════════════════════════════════════════════
// EXCHANGE — la columna compacta de «Proyectos postulados» (v4.1335)
//
// Un indicador con texto (nunca sólo color), el clip cuando hay comprobante
// (abre el visor) y, para quien mueve pagos, «Registrar» cuando falta el
// traslado. Nada de datos bancarios en la tabla: viven en el visor.
//
// ⚠️ Componentes de NIVEL SUPERIOR (regla del proyecto).
// ════════════════════════════════════════════════════════════════════
import React from 'react';
import { Paperclip, Banknote, Eye } from 'lucide-react';
import { EXCHANGE_TONE_CLS, fmtMoney, type ExchangeCompact } from '../../../../lib/exchange';

export const ExchangePill: React.FC<{ x: ExchangeCompact }> = ({ x }) => (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${EXCHANGE_TONE_CLS[x.tone] || EXCHANGE_TONE_CLS.slate}`}>
        {x.label}
    </span>
);

const tooltipOf = (x: ExchangeCompact) => {
    const partes = [x.help];
    if (x.currency && x.expected) partes.push(`Valor a trasladar: ${fmtMoney(x.expected, x.currency)}`);
    if (x.allocated) partes.push(`Trasladado: ${fmtMoney(x.allocated, x.currency)}`);
    if (x.confirmedAmount) partes.push(`Conciliado: ${fmtMoney(x.confirmedAmount, x.currency)}`);
    if (x.via?.publicRef) partes.push(`El dinero de este proyecto está en el pago de ${x.via.publicRef}.`);
    if (x.needsMovement) partes.push('El cobro todavía no tiene su movimiento en la Bóveda: usa «Buscar cobros sin registrar» en la Bóveda de Fondos.');
    return partes.join('\n');
};

interface CellProps {
    x: ExchangeCompact | null | undefined;
    project: string;
    canRegister: boolean;
    onOpen: () => void;
    onRegister: () => void;
}

/** El contenido (sin `<td>`), para la tabla y para las tarjetas móviles. */
export const ExchangeSummaryInline: React.FC<CellProps> = ({ x, project, canRegister, onOpen, onRegister }) => {
    if (!x) return <span className="text-xs text-slate-400">—</span>;
    const puedeRegistrar = canRegister && x.anchor && x.state === 'sin_traslado' && !x.needsMovement;
    const conDetalle = x.operations > 0 || x.via;
    return (
        <div className="flex flex-col items-start gap-1" title={tooltipOf(x)}>
            <div className="flex items-center gap-1.5">
                {x.state === 'no_aplica' ? <span className="text-xs text-slate-400" aria-label="No aplica">—</span> : <ExchangePill x={x} />}
                {x.hasReceipt && (
                    <button type="button" onClick={onOpen}
                        aria-label={`Ver el comprobante de traslado de ${project}`}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-300">
                        <Paperclip size={12} /> Ver
                    </button>
                )}
                {!x.hasReceipt && conDetalle && (
                    <button type="button" onClick={onOpen} aria-label={`Ver el detalle de Exchange de ${project}`}
                        className="rounded-full p-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-300">
                        <Eye size={13} />
                    </button>
                )}
            </div>
            {(x.state === 'parcial' || x.state === 'con_diferencia') && x.currency && (
                <span className="text-[11px] text-slate-500" data-no-translate>{fmtMoney(x.allocated, x.currency)} de {fmtMoney(x.expected, x.currency)}</span>
            )}
            {x.via?.publicRef && <span className="text-[11px] text-slate-500">Vía <span data-no-translate>{x.via.publicRef}</span></span>}
            {puedeRegistrar && (
                <button type="button" onClick={onRegister} aria-label={`Registrar el traslado de ${project}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline">
                    <Banknote size={12} /> Registrar traslado
                </button>
            )}
        </div>
    );
};

export const ExchangeCell: React.FC<CellProps> = (props) => (
    <td className="px-3 py-3 align-top">
        <ExchangeSummaryInline {...props} />
    </td>
);

export default ExchangeCell;
