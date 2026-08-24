/**
 * A QUIÉN se le avisa de un desembolso: correos y números de WhatsApp.
 *
 * v4.888 — Es UN componente COMPARTIDO por los dos modales —el de un aporte y
 * el del bloque— y no una copia en cada uno. Escrito dos veces, el día que se
 * agregue un canal o cambie un aviso, uno de los dos se queda atrás y el panel
 * se comporta distinto según por dónde se entre: es el defecto que este
 * proyecto ya pagó con la casilla de distritos (v4.748) y con el selector de
 * pools (v4.877).
 *
 * ═════════════════════════════════════════════════════════════════════
 * ⚠️ WHATSAPP NO ES «CORREO CON OTRO ICONO».
 * ═════════════════════════════════════════════════════════════════════
 *
 * Fuera de la ventana de 24 horas desde el último mensaje entrante, Meta SÓLO
 * entrega plantillas previamente aprobadas — y un beneficiario al que le vamos
 * a avisar de un giro casi nunca nos escribió antes. Por eso:
 *
 *   · El texto de WhatsApp está ESTANDARIZADO para toda la plataforma y no se
 *     redacta acá. Lo que cambia son los datos.
 *   · Si la plantilla no está aprobada, el canal NO se ofrece encendido y se
 *     dice POR QUÉ y qué falta. Ofrecer una casilla que no va a mandar nada es
 *     peor que no ofrecerla (v4.650).
 *
 * El validado de verdad lo hace el SERVIDOR (`disbursementNotice.js`): acá se
 * avisa mientras se escribe, pero quien decide qué entra es el servidor —y por
 * eso devuelve los descartados con su motivo.
 */
import { useMemo } from 'react';
import { AlertTriangle, Mail, MessageCircle, Info } from 'lucide-react';

export interface EstadoWhatsapp {
    configurado: boolean;
    listo: boolean;
    motivo: string | null;
    plantilla: { status: string } | null;
}

/** Cuenta cuántas entradas hay en un campo pegado, sin validarlas: el aviso en
 *  vivo es orientativo y quien decide es el servidor. */
const cuantos = (raw: string) =>
    raw.split(/[,;\n\r]+/).map(s => s.trim()).filter(Boolean).length;

export default function NoticeRecipients({
    notificar, onNotificar,
    correos, onCorreos,
    telefonos, onTelefonos,
    estadoWa, maxPorCanal = 10,
    cuantosAvisos = 1,
}: {
    notificar: boolean;
    onNotificar: (v: boolean) => void;
    correos: string;
    onCorreos: (v: string) => void;
    telefonos: string;
    onTelefonos: (v: string) => void;
    /** El estado de la plantilla de WhatsApp. `null` mientras se consulta. */
    estadoWa: EstadoWhatsapp | null;
    maxPorCanal?: number;
    /** Cuántos desembolsos se van a registrar. Con más de uno, cada
     *  destinatario recibe un aviso POR APORTE y hay que decirlo antes. */
    cuantosAvisos?: number;
}) {
    const nCorreos = useMemo(() => cuantos(correos), [correos]);
    const nTelefonos = useMemo(() => cuantos(telefonos), [telefonos]);
    const total = nCorreos + nTelefonos;

    const waListo = !!estadoWa?.listo;

    return (
        <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                    type="checkbox" checked={notificar}
                    onChange={e => onNotificar(e.target.checked)}
                    className="mt-0.5"
                />
                <span>Notificar al beneficiario</span>
            </label>

            {notificar && (
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                    {/* ── CORREO ────────────────────────────────────── */}
                    <label className="block">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                            <Mail className="w-3 h-3" /> Correo electrónico
                        </span>
                        <textarea
                            value={correos}
                            onChange={e => onCorreos(e.target.value)}
                            rows={2}
                            placeholder={'tesoreria@fundacion.org\ndirector@fundacion.org'}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                            Uno por línea, o separados por comas. Máximo {maxPorCanal}.
                            {nCorreos > 0 && (
                                <span className="text-gray-700 font-semibold" data-no-translate> · {nCorreos}</span>
                            )}
                        </p>
                    </label>

                    {/* ── WHATSAPP ──────────────────────────────────── */}
                    <label className="block">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                            <MessageCircle className="w-3 h-3" /> WhatsApp
                        </span>
                        <textarea
                            value={telefonos}
                            onChange={e => onTelefonos(e.target.value)}
                            rows={2}
                            disabled={!waListo}
                            placeholder={waListo ? '3001234567\n+1 305 555 0100' : 'No disponible todavía'}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                        />
                        {waListo ? (
                            <p className="text-[11px] text-gray-500 mt-1">
                                Un número por línea. Los colombianos pueden ir de 10 dígitos; los de otros
                                países necesitan el <span data-no-translate>+</span> y su código.
                                {nTelefonos > 0 && (
                                    <span className="text-gray-700 font-semibold" data-no-translate> · {nTelefonos}</span>
                                )}
                            </p>
                        ) : (
                            /* ⚠️ SE DICE POR QUÉ Y QUÉ FALTA. «No disponible» a
                               secas obliga a adivinar si falta la configuración,
                               la plantilla o su aprobación — que se corrigen en
                               tres sitios distintos. */
                            <p className="text-[11px] text-amber-700 mt-1 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span>{estadoWa?.motivo || 'Comprobando la disponibilidad de WhatsApp…'}</span>
                            </p>
                        )}
                    </label>

                    {/* El texto de WhatsApp NO se redacta acá, y hay que decirlo:
                        sin esta línea, quien escribe un número espera poder
                        escribir también el mensaje. */}
                    {waListo && (
                        <p className="text-[11px] text-gray-500 flex items-start gap-1">
                            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>
                                El mensaje de WhatsApp usa la plantilla aprobada por Meta, igual para toda la
                                plataforma: cambian el beneficiario, el monto, la fecha, el medio, la referencia
                                y el nombre del sitio. El correo sí se puede personalizar por sitio.
                            </span>
                        </p>
                    )}

                    {/* Con varios aportes, cada destinatario recibe un aviso POR
                        APORTE. Cinco correos seguidos a la misma dirección es
                        algo que hay que saber ANTES, no después. */}
                    {cuantosAvisos > 1 && total > 0 && (
                        <p className="text-[11px] text-amber-700">
                            Se enviará un aviso por cada aporte:{' '}
                            <span data-no-translate>{cuantosAvisos * total}</span> mensaje(s) en total
                            {' '}(<span data-no-translate>{cuantosAvisos}</span> ×{' '}
                            <span data-no-translate>{total}</span> destinatario(s)).
                        </p>
                    )}

                    {total === 0 && (
                        <p className="text-[11px] text-red-600">
                            Marcaste notificar pero no hay ningún destinatario.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
