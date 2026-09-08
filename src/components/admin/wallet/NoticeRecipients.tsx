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
import type React from 'react';
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
    soloCorreo = false,
    sugerencias = [],
    etiqueta,
    ayuda,
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
    /** v4.996 — Cuántos LOTES va a producir la selección (lo dice el servidor).
     *  Cada lote manda UNA notificación consolidada; antes contaba desembolsos
     *  y avisaba «un correo por aporte», que era exactamente el defecto. */
    cuantosAvisos?: number;
    /**
     * v4.1014 — SÓLO CORREO, sin el interruptor y sin WhatsApp.
     *
     * Lo usa el reenvío de una conciliación. NO es una preferencia de estilo:
     * la conciliación lleva un documento adjunto y la única plantilla aprobada
     * de WhatsApp es la del AVISO DE GIRO — mandarla acá le diría al club que
     * le giraron otra vez, que es exactamente lo que ese correo existe para no
     * decir. Y no hay interruptor porque en un reenvío notificar no es una
     * opción: es la operación entera.
     *
     * Se agrega como modo y no como un segundo componente porque el campo, el
     * conteo, el tope y el aviso de «uno por línea» son los mismos: con dos
     * selectores, el día que cambie el tope uno se queda atrás (la lección de
     * `SubmissionDetail`, v4.999).
     */
    soloCorreo?: boolean;
    /** Direcciones que ya recibieron algo de este traslado, para agregarlas con
     *  un clic. Se OFRECEN, no se marcan: quién debe recibir la conciliación lo
     *  decide quien la manda. */
    sugerencias?: { target: string; at?: string | null }[];
    /** Rótulo del bloque cuando `soloCorreo`. */
    etiqueta?: string;
    ayuda?: React.ReactNode;
}) {
    const nCorreos = useMemo(() => cuantos(correos), [correos]);
    const nTelefonos = useMemo(() => cuantos(telefonos), [telefonos]);
    const total = nCorreos + nTelefonos;

    const waListo = !!estadoWa?.listo;

    // Las que ya están escritas no se vuelven a ofrecer: un chip que no hace
    // nada al pulsarlo se lee como que el botón está roto.
    const yaEscritos = useMemo(
        () => new Set(correos.split(/[,;\n\r]+/).map(s => s.trim().toLowerCase()).filter(Boolean)),
        [correos]
    );
    const pendientes = (sugerencias || []).filter(s => !yaEscritos.has(String(s.target || '').toLowerCase()));
    const agregar = (correo: string) => {
        const limpio = correos.trim();
        onCorreos(limpio ? `${limpio}\n${correo}` : correo);
    };

    // ── SÓLO CORREO (v4.1014) ────────────────────────────────────────
    if (soloCorreo) {
        return (
            <div className="space-y-2">
                <label className="block">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                        <Mail className="w-3 h-3" /> {etiqueta || 'Enviar a'}
                    </span>
                    <textarea
                        value={correos}
                        onChange={e => onCorreos(e.target.value)}
                        rows={3}
                        placeholder={'presidencia@club.org\ntesoreria@club.org'}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                        Uno por línea, o separados por comas. Máximo {maxPorCanal}.
                        {nCorreos > 0 && (
                            <span className="text-gray-700 font-semibold" data-no-translate> · {nCorreos}</span>
                        )}
                    </p>
                </label>

                {/* Los que ya recibieron algo de este traslado. Se ofrecen para
                    no tener que copiarlos a mano, y NO vienen marcados: el
                    reenvío existe justamente para mandárselo a alguien que no
                    estaba en la lista original. */}
                {pendientes.length > 0 && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                            Ya recibieron notificaciones de este traslado
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {pendientes.map(s => (
                                <button
                                    key={s.target}
                                    type="button"
                                    onClick={() => agregar(s.target)}
                                    className="px-2 py-1 rounded-md bg-white border border-gray-200 text-[11px] text-gray-700 hover:border-rotary-blue hover:text-rotary-blue"
                                    title="Agregar a los destinatarios"
                                >
                                    + <span data-no-translate>{s.target}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {ayuda}

                {nCorreos === 0 && (
                    <p className="text-[11px] text-red-600">
                        Escribí al menos un destinatario: la conciliación se manda a alguien, y ese
                        alguien no se deduce.
                    </p>
                )}
            </div>
        );
    }

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

                    {/* v4.996 — Un giro que cubre varios aportes manda UNA
                        notificación consolidada por LOTE (sitio + moneda +
                        campaña + beneficiario), con todos los aportes adentro.
                        Hasta v4.995 acá se avisaba «un aviso por cada aporte»,
                        y era cierto: ocho aportes eran ocho correos. Lo que se
                        dice ahora es cuántos lotes decidió el servidor. */}
                    {cuantosAvisos > 1 && total > 0 && (
                        <p className="text-[11px] text-amber-700">
                            La selección se parte en <span data-no-translate>{cuantosAvisos}</span> lotes
                            (por moneda, campaña o beneficiario): cada destinatario recibirá{' '}
                            <span data-no-translate>{cuantosAvisos}</span> notificación(es) consolidada(s),
                            una por lote, no una por aporte.
                        </p>
                    )}
                    {cuantosAvisos === 1 && total > 0 && (
                        <p className="text-[11px] text-emerald-700">
                            Se enviará <strong>1 notificación consolidada</strong> por destinatario, con el
                            detalle de todos los aportes del lote.
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
