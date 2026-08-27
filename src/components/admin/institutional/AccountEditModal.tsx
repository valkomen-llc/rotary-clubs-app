// ════════════════════════════════════════════════════════════════════
// Editar una cuenta del sitio — v4.940.0
//
// ⚠️ SON DOS CONTRASEÑAS DISTINTAS Y LA PANTALLA LO DICE. La del BUZÓN es la
// que se escribe en un cliente de correo; la de ACCESO es con la que su
// propietario entra al panel, y sólo existe si la cuenta tiene propietario.
// Presentarlas como una sola deja a alguien fuera del panel —o el correo sin
// entregar— creyendo que cambió la otra.
//
// ⚠️ NINGÚN CAMPO DE CONTRASEÑA SE PRECARGA, ni recortado: el servidor no
// devuelve la que hay (v4.932) y fingir que la sabemos sería peor. En blanco
// significa «no la cambies», y se dice.
//
// Cada bloque se guarda POR SEPARADO porque son dos endpoints y dos
// significados: un solo «Guardar» haría creer que tocar uno toca el otro.
// ════════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { X, AtSign, Key, ShieldCheck, Loader2, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';

export interface CuentaEditable {
    id: string;
    email: string;
    label?: string | null;
    isPrimary?: boolean;
}

export interface DuenoDeCuenta {
    userId: string;
    displayName?: string;
    role?: string;
    mustChangePassword?: boolean;
}

interface Props {
    account: CuentaEditable;
    owner?: DuenoDeCuenta | null;
    token: string | null;
    onClose: () => void;
    /** Se llama cuando algo cambió de verdad, para refrescar el listado. */
    onSaved: () => void;
}

const API = import.meta.env.VITE_API_URL || '/api';

const AccountEditModal: React.FC<Props> = ({ account, owner, token, onClose, onSaved }) => {
    const [rotulo, setRotulo] = useState(account.label || '');
    const [claveBuzon, setClaveBuzon] = useState('');
    const [claveBuzon2, setClaveBuzon2] = useState('');
    const [guardandoBuzon, setGuardandoBuzon] = useState(false);

    const [claveAcceso, setClaveAcceso] = useState('');
    const [claveAcceso2, setClaveAcceso2] = useState('');
    const [temporal, setTemporal] = useState(true);
    const [guardandoAcceso, setGuardandoAcceso] = useState(false);

    const cabeceras = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    /**
     * Un fallo se dice con su CAUSA. «No se pudo guardar» a secas obliga a
     * diagnosticar a ciegas: 401 se corrige volviendo a entrar, 403 pidiendo el
     * permiso, y el resto es del servidor (v4.859).
     */
    const explicar = async (r: Response, generico: string) => {
        if (r.status === 401) return 'Tu sesión venció. Vuelve a entrar; lo que escribiste sigue acá.';
        if (r.status === 403 || r.status === 400) {
            const d = await r.json().catch(() => ({}));
            return [d?.error, d?.way].filter(Boolean).join(' ') || generico;
        }
        const d = await r.json().catch(() => ({}));
        return d?.error || generico;
    };

    const guardarBuzon = async () => {
        const cuerpo: Record<string, unknown> = {};
        if ((rotulo || '') !== (account.label || '')) cuerpo.label = rotulo;
        if (claveBuzon) { cuerpo.password = claveBuzon; cuerpo.passwordConfirm = claveBuzon2; }
        if (!Object.keys(cuerpo).length) { toast.info('No cambiaste nada del buzón.'); return; }

        setGuardandoBuzon(true);
        try {
            const r = await fetch(`${API}/email-accounts/${account.id}`, {
                method: 'PATCH', headers: cabeceras, body: JSON.stringify(cuerpo),
            });
            if (!r.ok) { toast.error(await explicar(r, 'No pudimos actualizar la cuenta.')); return; }
            const d = await r.json();
            (d?.warnings || []).forEach((w: string) => toast.warning(w));
            toast.success(d?.message || 'La cuenta quedó actualizada.');
            setClaveBuzon(''); setClaveBuzon2('');
            onSaved();
        } catch {
            toast.error('No hubo respuesta del servidor. La petición no llegó a salir.');
        } finally {
            setGuardandoBuzon(false);
        }
    };

    const guardarAcceso = async () => {
        if (!owner) return;
        if (!claveAcceso) { toast.error('Escribe la contraseña nueva.'); return; }
        setGuardandoAcceso(true);
        try {
            const r = await fetch(`${API}/institutional/owners/${owner.userId}/password`, {
                method: 'POST', headers: cabeceras,
                body: JSON.stringify({ password: claveAcceso, passwordConfirm: claveAcceso2, temporary: temporal }),
            });
            if (!r.ok) { toast.error(await explicar(r, 'No pudimos cambiar la contraseña.')); return; }
            const d = await r.json();
            (d?.warnings || []).forEach((w: string) => toast.warning(w));
            toast.success(d?.message || 'Contraseña actualizada.');
            setClaveAcceso(''); setClaveAcceso2('');
            onSaved();
        } catch {
            toast.error('No hubo respuesta del servidor. La petición no llegó a salir.');
        } finally {
            setGuardandoAcceso(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                <div className="p-6 border-b border-gray-100 flex items-start justify-between">
                    <div className="min-w-0">
                        <h3 className="text-xl font-bold text-gray-900">Editar cuenta</h3>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 truncate">
                            <AtSign className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="font-bold text-rotary-blue truncate" data-no-translate>{account.email}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 rounded-2xl transition-all flex-shrink-0"><X className="w-5 h-5" /></button>
                </div>

                <div className="px-6 py-5 space-y-6 overflow-y-auto">
                    {/* ── El buzón ─────────────────────────────────────── */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Key className="w-4 h-4 text-gray-400" />
                            <h4 className="text-sm font-bold text-gray-900">El buzón</h4>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Rótulo</label>
                            <input
                                type="text" value={rotulo} onChange={e => setRotulo(e.target.value)}
                                placeholder="Presidencia, Tesorería…"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-sm"
                            />
                            <p className="text-[11px] text-gray-400">Es el nombre con el que aparece en el panel. La dirección no se puede cambiar: una dirección nueva es una cuenta nueva.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Contraseña nueva</label>
                                <input
                                    type="password" value={claveBuzon} onChange={e => setClaveBuzon(e.target.value)}
                                    autoComplete="new-password" placeholder="Dejar en blanco para no cambiarla"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Repetirla</label>
                                <input
                                    type="password" value={claveBuzon2} onChange={e => setClaveBuzon2(e.target.value)}
                                    autoComplete="new-password"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-sm"
                                />
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                            Es la que se escribe en un cliente de correo para leer y enviar desde esta dirección.
                            No se muestra la actual: el sistema nunca devuelve una contraseña guardada.
                        </p>

                        <button
                            onClick={guardarBuzon} disabled={guardandoBuzon}
                            className="w-full py-2.5 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-rotary-navy transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {guardandoBuzon && <Loader2 className="w-4 h-4 animate-spin" />}
                            Guardar el buzón
                        </button>
                    </section>

                    <div className="border-t border-gray-100" />

                    {/* ── El acceso al panel ───────────────────────────── */}
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-gray-400" />
                            <h4 className="text-sm font-bold text-gray-900">El acceso al panel</h4>
                        </div>

                        {!owner ? (
                            <div className="flex gap-2 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                <p className="text-[11px] text-gray-600 leading-relaxed">
                                    Esta cuenta es <strong>sólo buzón</strong>: recibe correo y no tiene ninguna persona
                                    detrás, así que no tiene contraseña de acceso al panel. Para dársela, asígnale un
                                    propietario desde <strong>Nueva Cuenta</strong>.
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className="text-[11px] text-gray-500 leading-relaxed">
                                    Con la que <strong>{owner.displayName || account.email}</strong> entra a Club Platform.
                                    Es <strong>distinta</strong> de la del buzón.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Contraseña nueva</label>
                                        <input
                                            type="password" value={claveAcceso} onChange={e => setClaveAcceso(e.target.value)}
                                            autoComplete="new-password" placeholder="Mínimo 8 caracteres"
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Repetirla</label>
                                        <input
                                            type="password" value={claveAcceso2} onChange={e => setClaveAcceso2(e.target.value)}
                                            autoComplete="new-password"
                                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-sm"
                                        />
                                    </div>
                                </div>

                                <label className="flex items-start gap-2 cursor-pointer">
                                    <input type="checkbox" checked={temporal} onChange={e => setTemporal(e.target.checked)} className="mt-0.5" />
                                    <span className="text-[11px] text-gray-600 leading-relaxed">
                                        <strong>Pedirle que la cambie al entrar</strong> — recomendado: la conoces tú, que no
                                        eres su dueño.
                                    </span>
                                </label>

                                <div className="flex gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-100">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-amber-900/80 leading-relaxed">
                                        Al cambiarla se <strong>cierran sus sesiones abiertas</strong>. Si prefieres no
                                        conocer su contraseña, usa <strong>«Enviar acceso»</strong>: le llega un enlace a su
                                        propio buzón y la credencial no pasa por nadie más.
                                    </p>
                                </div>

                                <button
                                    onClick={guardarAcceso} disabled={guardandoAcceso}
                                    className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {guardandoAcceso && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Cambiar la contraseña de acceso
                                </button>
                            </>
                        )}
                    </section>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex justify-end">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900 transition-all">Cerrar</button>
                </div>
            </div>
        </div>
    );
};

export default AccountEditModal;
