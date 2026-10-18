import React from 'react';
import { History, RotateCcw, CheckCircle, ArrowRight, ShieldCheck, Clock, User } from 'lucide-react';

interface HistoryTabProps {
    historyItems: any[];
    loading: boolean;
    onRollback: (historyId: string) => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
    historyItems,
    loading,
    onRollback,
}) => {
    if (loading) {
        return (
            <div className="py-16 text-center text-gray-400">
                <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">Cargando historial de auditoría...</p>
            </div>
        );
    }

    if (!historyItems.length) {
        return (
            <div className="py-16 text-center bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-gray-800">No hay eventos en el historial</h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                    Cada vez que un administrador apruebe o modifique imágenes mediante el motor de curaduría, quedará registrado el evento, el autor y la imagen previa para permitir reversiones seguras.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 flex items-center justify-between text-xs text-sky-900">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-sky-600 flex-shrink-0" />
                    <span>
                        Trazabilidad completa: Todas las imágenes reemplazadas se preservan en la biblioteca. Puedes restaurar una versión anterior en cualquier momento con un solo clic.
                    </span>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                                <th className="py-3.5 px-4">Fecha y Hora</th>
                                <th className="py-3.5 px-4">Contenedor</th>
                                <th className="py-3.5 px-4">Imagen Publicada</th>
                                <th className="py-3.5 px-4">Imagen Reemplazada</th>
                                <th className="py-3.5 px-4">Club / Origen</th>
                                <th className="py-3.5 px-4">Autor</th>
                                <th className="py-3.5 px-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {historyItems.map((item) => {
                                const dateFormatted = new Date(item.createdAt).toLocaleString('es-CO', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                });
                                const containerLabel = item.containerKey === 'hero'
                                    ? `Hero · Slide ${(item.slotIndex || 0) + 1}`
                                    : item.containerKey === 'foundation'
                                    ? 'Fundación Rotaria'
                                    : item.containerKey === 'join'
                                    ? 'Sección Únete'
                                    : item.containerKey;

                                return (
                                    <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                                        <td className="py-3.5 px-4 text-gray-500 font-mono text-[11px] whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                {dateFormatted}
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4 font-bold text-gray-900">
                                            {containerLabel}
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <div className="flex items-center gap-2">
                                                <img
                                                    src={item.newUrl}
                                                    alt="Nueva"
                                                    className="w-12 h-8 rounded-lg object-cover border border-gray-200"
                                                />
                                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                                    Activa
                                                </span>
                                                {item.isException && (
                                                    <span
                                                        className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200"
                                                        title={`Excepción autorizada: ${item.exceptionReason || 'Sin detalle registrado'}`}
                                                    >
                                                        Excepción
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            {item.previousUrl ? (
                                                <div className="flex items-center gap-2">
                                                    <img
                                                        src={item.previousUrl}
                                                        alt="Anterior"
                                                        className="w-12 h-8 rounded-lg object-cover border border-gray-200 opacity-60"
                                                    />
                                                    <span className="text-[10px] text-gray-400">Reemplazada</span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-[11px]">Ninguna (Primera carga)</span>
                                            )}
                                        </td>
                                        <td className="py-3.5 px-4 text-gray-700 font-medium">
                                            {item.clubName || 'Distrito 4281'}
                                        </td>
                                        <td className="py-3.5 px-4 text-gray-600">
                                            <div className="flex items-center gap-1">
                                                <User className="w-3.5 h-3.5 text-gray-400" />
                                                <span>{item.actorName || 'Administrador'}</span>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4 text-right">
                                            {item.previousUrl && (
                                                <button
                                                    onClick={() => onRollback(item.id)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-sky-300 hover:bg-sky-50 text-gray-700 hover:text-sky-700 font-bold text-xs transition-all shadow-sm active:scale-95"
                                                    title="Revertir este cambio y restaurar la imagen anterior"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5 text-sky-600" />
                                                    <span>Restaurar anterior</span>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
