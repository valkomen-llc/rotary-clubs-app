// ════════════════════════════════════════════════════════════════════
// Editar una cuenta del sitio — v4.950.0
//
// ⚠️ SON DOS CONTRASEÑAS DISTINTAS Y LA PANTALLA LO DICE. La del BUZÓN es la
// que se escribe en un cliente de correo; la de ACCESO es con la que su
// propietario entra al panel, y sólo existe si la cuenta tiene propietario.
// Presentarlas como una sola deja a alguien fuera del panel —o el correo sin
// entregar— creyendo que cambió la otra.
//
// ⚠️ DISTINCIÓN CLARA ENTRE BUZÓN E IDENTIDAD DE ACCESO:
//   · Estado del buzón: Activo / Suspendido
//   · Estado del acceso administrativo: Sin acceso / Pendiente de activación / Activo / Suspendido
//   · Rol institucional asignado y Edición anual correspondiente
// ════════════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react';
import {
    X, AtSign, Key, ShieldCheck, Loader2, AlertTriangle, Info,
    UserCheck, Send, Sparkles, CheckCircle2, UserPlus, Ban
} from 'lucide-react';
import { toast } from 'sonner';

export interface CuentaEditable {
    id: string;
    email: string;
    label?: string | null;
    isPrimary?: boolean;
    verificationStatus?: string;
    verified?: boolean;
}

export interface DuenoDeCuenta {
    userId: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    position?: string;
    role?: string;
    roleKey?: string | null;
    roleLabel?: string | null;
    edition?: string | null;
    membershipStatus?: string | null;
    status?: string;
    permissions?: string[];
    mustChangePassword?: boolean;
}

interface Props {
    account: CuentaEditable;
    owner?: DuenoDeCuenta | null;
    token: string | null;
    startGrantAccess?: boolean;
    onClose: () => void;
    /** Se llama cuando algo cambió de verdad, para refrescar el listado. */
    onSaved: () => void;
}

const API = import.meta.env.VITE_API_URL || '/api';

const MODULES_FAIR_MANAGER = [
    { label: 'Analíticas', desc: 'Métricas, visitas y conversiones' },
    { label: 'Contactos & Leads', desc: 'Directorio de prospectos y seguimiento' },
    { label: 'Bandeja de Entrada', desc: 'Correo institucional propio' },
    { label: 'Postulación de Proyectos', desc: 'Convocatoria, inscripciones y pagos' },
    { label: 'Proyectos', desc: 'Banco de proyectos y publicación' },
    { label: 'Eventos', desc: 'Gestión de la feria y asistentes' },
    { label: 'Multimedia', desc: 'Biblioteca de medios y descargas' },
];

const AccountEditModal: React.FC<Props> = ({ account, owner, token, startGrantAccess = false, onClose, onSaved }) => {
    const [rotulo, setRotulo] = useState(account.label || '');
    const [claveBuzon, setClaveBuzon] = useState('');
    const [claveBuzon2, setClaveBuzon2] = useState('');
    const [guardandoBuzon, setGuardandoBuzon] = useState(false);

    // Formulario de contraseña de acceso (si ya tiene dueño)
    const [claveAcceso, setClaveAcceso] = useState('');
    const [claveAcceso2, setClaveAcceso2] = useState('');
    const [temporal, setTemporal] = useState(true);
    const [guardandoAcceso, setGuardandoAcceso] = useState(false);
    const [enviandoInstrucciones, setEnviandoInstrucciones] = useState(false);
    const [cambiandoEstado, setCambiandoEstado] = useState(false);

    // Formulario de "Habilitar acceso institucional" (si no tiene dueño)
    const [habilitandoAcceso, setHabilitandoAcceso] = useState(startGrantAccess);
    const [creandoAcceso, setCreandoAcceso] = useState(false);
    const [nombre, setNombre] = useState(() => {
        if (account.email.toLowerCase().includes('valledupar')) return 'Valledupar';
        return account.label || '';
    });
    const [apellido, setApellido] = useState(() => {
        if (account.email.toLowerCase().includes('valledupar')) return 'Feria de Proyectos 2027';
        return 'Comité Organizador';
    });
    const [cargo, setCargo] = useState(() => {
        if (account.email.toLowerCase().includes('valledupar')) return 'Administrador Institucional — XII Feria de Proyectos Rotarios';
        return 'Administrador Institucional';
    });
    const [rolSeleccionado, setRolSeleccionado] = useState('project_fair_manager');
    const [edicionSeleccionada, setEdicionSeleccionada] = useState('12-valledupar');
    const [tipoCredencial, setTipoCredencial] = useState<'password' | 'invite'>('password');
    const [claveNuevaAcceso, setClaveNuevaAcceso] = useState('');
    const [claveNuevaAcceso2, setClaveNuevaAcceso2] = useState('');
    const [nuevaTemporal, setNuevaTemporal] = useState(true);

    const [rolesDisponibles, setRolesDisponibles] = useState<Array<{ key: string; name: string; description: string }>>([]);

    const cabeceras = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    useEffect(() => {
        fetch(`${API}/institutional/catalog`, { headers: cabeceras })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.siteRoles && Array.isArray(data.siteRoles)) {
                    setRolesDisponibles(data.siteRoles);
                }
            })
            .catch(() => {});
    }, []);

    const explicar = async (r: Response, generico: string) => {
        if (r.status === 401) return 'Tu sesión venció. Vuelve a entrar; lo que escribiste sigue acá.';
        if (r.status === 403 || r.status === 400 || r.status === 409) {
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
            toast.success(d?.message || 'El buzón quedó actualizado sin alterar mensajes históricos.');
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
            toast.success(d?.message || 'Contraseña de acceso al panel actualizada.');
            setClaveAcceso(''); setClaveAcceso2('');
            onSaved();
        } catch {
            toast.error('No hubo respuesta del servidor. La petición no llegó a salir.');
        } finally {
            setGuardandoAcceso(false);
        }
    };

    const handleHabilitarAcceso = async () => {
        if (!nombre.trim()) { toast.error('Escribe el nombre del propietario institucional.'); return; }
        if (tipoCredencial === 'password') {
            if (!claveNuevaAcceso) { toast.error('Escribe la contraseña de acceso al panel.'); return; }
            if (claveNuevaAcceso.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres.'); return; }
            if (claveNuevaAcceso !== claveNuevaAcceso2) { toast.error('Las contraseñas de acceso no coinciden.'); return; }
        }

        setCreandoAcceso(true);
        try {
            const cuerpo = {
                firstName: nombre.trim(),
                lastName: apellido.trim() || undefined,
                position: cargo.trim() || undefined,
                role: 'institutional_user',
                siteRoleKey: rolSeleccionado,
                edition: edicionSeleccionada,
                status: tipoCredencial === 'password' ? 'active' : 'invited',
                grantAccess: true,
                ...(tipoCredencial === 'password' ? {
                    password: claveNuevaAcceso,
                    passwordConfirm: claveNuevaAcceso2,
                    temporaryPassword: nuevaTemporal,
                } : {})
            };

            const r = await fetch(`${API}/institutional/accounts/${account.id}/access`, {
                method: 'POST',
                headers: cabeceras,
                body: JSON.stringify(cuerpo),
            });

            if (!r.ok) {
                toast.error(await explicar(r, 'No pudimos habilitar el acceso institucional.'));
                return;
            }

            const data = await r.json();
            (data?.warnings || []).forEach((w: string) => toast.warning(w));

            if (tipoCredencial === 'invite' && data?.owner?.userId) {
                await fetch(`${API}/institutional/owners/${data.owner.userId}/instructions`, {
                    method: 'POST', headers: cabeceras,
                }).catch(() => {});
                toast.success('Acceso habilitado y correo de activación enviado al buzón.');
            } else {
                toast.success('Acceso institucional al panel habilitado con éxito.');
            }

            onSaved();
            onClose();
        } catch (e: any) {
            toast.error(e?.message || 'No hubo respuesta del servidor.');
        } finally {
            setCreandoAcceso(false);
        }
    };

    const toggleEstadoPropietario = async () => {
        if (!owner) return;
        const nuevoEstado = owner.status === 'suspended' ? 'active' : 'suspended';
        setCambiandoEstado(true);
        try {
            const r = await fetch(`${API}/institutional/owners/${owner.userId}`, {
                method: 'PATCH',
                headers: cabeceras,
                body: JSON.stringify({ status: nuevoEstado }),
            });
            if (!r.ok) { toast.error(await explicar(r, 'No pudimos cambiar el estado del acceso.')); return; }
            toast.success(nuevoEstado === 'active' ? 'Acceso administrativo activado.' : 'Acceso administrativo suspendido.');
            onSaved();
        } catch {
            toast.error('No hubo respuesta del servidor.');
        } finally {
            setCambiandoEstado(false);
        }
    };

    const enviarInstruccionesAcceso = async () => {
        if (!owner) return;
        setEnviandoInstrucciones(true);
        try {
            const r = await fetch(`${API}/institutional/owners/${owner.userId}/instructions`, {
                method: 'POST',
                headers: cabeceras,
            });
            if (!r.ok) { toast.error(await explicar(r, 'No pudimos enviar las instrucciones.')); return; }
            toast.success('Instrucciones y enlace de activación enviados al buzón.');
        } catch {
            toast.error('No hubo respuesta del servidor.');
        } finally {
            setEnviandoInstrucciones(false);
        }
    };

    const isFairAccount = account.email.toLowerCase().includes('valledupar') || account.email.toLowerCase().includes('projectfair');
    const rolActualLabel = owner?.roleLabel || (owner?.roleKey === 'project_fair_manager' ? 'Administrador Institucional de Feria de Proyectos' : (owner?.role === 'institutional_user' ? 'Usuario Institucional' : owner?.role || 'Sin rol'));
    const edicionActualLabel = owner?.edition ? (owner.edition === '12-valledupar' ? 'XII Feria de Proyectos Rotarios — Valledupar' : owner.edition) : (isFairAccount ? 'XII Feria de Proyectos Rotarios — Valledupar' : null);

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                {/* Cabecera */}
                <div className="p-6 border-b border-gray-100 flex items-start justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-gray-900">Editar cuenta institucional</h3>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 truncate">
                            <AtSign className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="font-bold text-rotary-blue truncate" data-no-translate>{account.email}</span>
                        </p>
                        {/* Estado Visual Diferenciado */}
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Buzón: Activo
                            </span>

                            {!owner ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200">
                                    Panel: Sin acceso
                                </span>
                            ) : owner.status === 'suspended' || owner.membershipStatus === 'suspended' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                                    Panel: Suspendido
                                </span>
                            ) : owner.membershipStatus === 'invited' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                                    Panel: Pendiente de activación
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-rotary-blue border border-blue-200">
                                    <ShieldCheck className="w-3 h-3 text-rotary-blue" />
                                    Panel: Activo
                                </span>
                            )}

                            {edicionActualLabel && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                                    Edición: {edicionActualLabel}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 rounded-2xl transition-all flex-shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-6 overflow-y-auto">
                    {/* ── El buzón ─────────────────────────────────────── */}
                    <section className="space-y-3 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Key className="w-4 h-4 text-rotary-blue" />
                                <h4 className="text-sm font-bold text-gray-900">Buzón de correo electrónico</h4>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                Mensajes históricos conservados
                            </span>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Rótulo identificador</label>
                            <input
                                type="text" value={rotulo} onChange={e => setRotulo(e.target.value)}
                                placeholder="12th Rotary Projects Fair Chair 2027…"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-sm bg-white"
                            />
                            <p className="text-[11px] text-gray-400">Nombre con el que aparece en el panel de cuentas. La dirección institucional y los correos recibidos no se alteran.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Contraseña del buzón</label>
                                <input
                                    type="password" value={claveBuzon} onChange={e => setClaveBuzon(e.target.value)}
                                    autoComplete="new-password" placeholder="Dejar en blanco para no cambiarla"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-sm bg-white"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Repetir contraseña</label>
                                <input
                                    type="password" value={claveBuzon2} onChange={e => setClaveBuzon2(e.target.value)}
                                    autoComplete="new-password"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-sm bg-white"
                                />
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                            Es la credencial SMTP/IMAP para clientes de correo. <strong>No modifica ni sobreescribe</strong> la clave de acceso al panel administrativo.
                        </p>

                        <button
                            onClick={guardarBuzon} disabled={guardandoBuzon}
                            className="w-full py-2 bg-rotary-blue text-white rounded-xl text-xs font-bold hover:bg-rotary-navy transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
                        >
                            {guardandoBuzon && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Actualizar datos del buzón
                        </button>
                    </section>

                    <div className="border-t border-gray-100" />

                    {/* ── El acceso al panel ───────────────────────────── */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-rotary-blue" />
                                <h4 className="text-sm font-bold text-gray-900">Acceso institucional al panel</h4>
                            </div>
                            {owner && (
                                <span className="text-[11px] font-semibold text-gray-500">
                                    {rolActualLabel}
                                </span>
                            )}
                        </div>

                        {!owner ? (
                            <div className="space-y-4">
                                {!habilitandoAcceso ? (
                                    <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/60 space-y-3">
                                        <div className="flex items-start gap-3">
                                            <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="text-xs font-bold text-amber-900">Esta cuenta opera actualmente como sólo buzón</p>
                                                <p className="text-[11px] text-amber-800/80 leading-relaxed">
                                                    Recibe correos institucionales, pero no tiene una identidad de usuario vinculada ni credenciales de acceso al administrador.
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setHabilitandoAcceso(true)}
                                            className="w-full py-2.5 px-4 bg-rotary-blue hover:bg-rotary-navy text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                                        >
                                            <UserPlus className="w-4 h-4" />
                                            Habilitar acceso institucional al panel
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-5 rounded-2xl bg-sky-50/40 border border-sky-100 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Sparkles className="w-4 h-4 text-rotary-blue" />
                                                <span className="text-xs font-bold text-gray-900">Configurar identidad de acceso institucional</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setHabilitandoAcceso(false)}
                                                className="text-[11px] font-bold text-gray-500 hover:text-gray-800"
                                            >
                                                Cancelar
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Nombre</label>
                                                <input
                                                    type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                                                    placeholder="Valledupar"
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue/20 bg-white"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Apellidos / Comité</label>
                                                <input
                                                    type="text" value={apellido} onChange={e => setApellido(e.target.value)}
                                                    placeholder="Feria de Proyectos 2027"
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue/20 bg-white"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Cargo institucional</label>
                                            <input
                                                type="text" value={cargo} onChange={e => setCargo(e.target.value)}
                                                placeholder="Administrador Institucional — XII Feria de Proyectos Rotarios"
                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue/20 bg-white"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Rol asignado</label>
                                                <select
                                                    value={rolSeleccionado}
                                                    onChange={e => setRolSeleccionado(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue/20 bg-white font-medium"
                                                >
                                                    <option value="project_fair_manager">Administrador Institucional de Feria de Proyectos</option>
                                                    {rolesDisponibles
                                                        .filter(r => r.key !== 'project_fair_manager')
                                                        .map(r => (
                                                            <option key={r.key} value={r.key}>{r.name}</option>
                                                        ))}
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Edición de la Feria</label>
                                                <select
                                                    value={edicionSeleccionada}
                                                    onChange={e => setEdicionSeleccionada(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue/20 bg-white font-medium"
                                                >
                                                    <option value="12-valledupar">XII Feria — Valledupar (2027)</option>
                                                    <option value="13-general">XIII Feria de Proyectos Rotarios</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Vista previa de módulos autorizados */}
                                        <div className="space-y-1.5 p-3 rounded-xl bg-white border border-gray-100">
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">7 Módulos operativos autorizados:</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {MODULES_FAIR_MANAGER.map((m, idx) => (
                                                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-gray-50 text-gray-700 border border-gray-200" title={m.desc}>
                                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                                                        {m.label}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Método de Credenciales */}
                                        <div className="space-y-3 pt-2">
                                            <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Credencial de acceso al panel:</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setTipoCredencial('password')}
                                                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-left flex items-center gap-2 ${tipoCredencial === 'password' ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                                >
                                                    <Key className="w-3.5 h-3.5" />
                                                    Definir contraseña
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTipoCredencial('invite')}
                                                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-left flex items-center gap-2 ${tipoCredencial === 'invite' ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                                >
                                                    <Send className="w-3.5 h-3.5" />
                                                    Invitación segura
                                                </button>
                                            </div>

                                            {tipoCredencial === 'password' ? (
                                                <div className="space-y-3 pt-1">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Contraseña</label>
                                                            <input
                                                                type="password" value={claveNuevaAcceso} onChange={e => setClaveNuevaAcceso(e.target.value)}
                                                                autoComplete="new-password" placeholder="Mínimo 8 caracteres"
                                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue/20 bg-white"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Repetirla</label>
                                                            <input
                                                                type="password" value={claveNuevaAcceso2} onChange={e => setClaveNuevaAcceso2(e.target.value)}
                                                                autoComplete="new-password"
                                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue/20 bg-white"
                                                            />
                                                        </div>
                                                    </div>
                                                    <label className="flex items-start gap-2 cursor-pointer">
                                                        <input type="checkbox" checked={nuevaTemporal} onChange={e => setNuevaTemporal(e.target.checked)} className="mt-0.5" />
                                                        <span className="text-[11px] text-gray-600 leading-relaxed">
                                                            <strong>Pedirle que la cambie al entrar</strong> (contraseña temporal de activación)
                                                        </span>
                                                    </label>
                                                </div>
                                            ) : (
                                                <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-[11px] text-rotary-blue space-y-1">
                                                    <p className="font-bold">Invitación segura directa al buzón</p>
                                                    <p className="text-gray-600">Se enviará un enlace de activación cifrado a <strong>{account.email}</strong>. El equipo podrá configurar su contraseña de manera privada.</p>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleHabilitarAcceso}
                                            disabled={creandoAcceso}
                                            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            {creandoAcceso ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                            Vincular y habilitar acceso institucional
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-rotary-blue font-bold text-sm">
                                            {owner.displayName ? owner.displayName[0]?.toUpperCase() : 'A'}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900">{owner.displayName || account.email}</p>
                                            <p className="text-[11px] text-gray-500">{owner.position || 'Administrador Institucional'}</p>
                                            <p className="text-[10px] text-gray-400 mt-1">Usuario ID: {owner.userId}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={toggleEstadoPropietario}
                                        disabled={cambiandoEstado}
                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-1.5 ${owner.status === 'suspended' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                                    >
                                        {cambiandoEstado ? <Loader2 className="w-3 h-3 animate-spin" /> : owner.status === 'suspended' ? <UserCheck className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                                        {owner.status === 'suspended' ? 'Reactivar acceso' : 'Suspender acceso'}
                                    </button>
                                </div>

                                {/* Actualizar contraseña de acceso */}
                                <div className="space-y-3 p-4 rounded-2xl bg-white border border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Modificar contraseña de acceso al panel</label>
                                        <button
                                            type="button"
                                            onClick={enviarInstruccionesAcceso}
                                            disabled={enviandoInstrucciones}
                                            className="text-[11px] font-bold text-rotary-blue hover:underline flex items-center gap-1"
                                        >
                                            {enviandoInstrucciones ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                            Reenviar enlace de activación
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Nueva contraseña</label>
                                            <input
                                                type="password" value={claveAcceso} onChange={e => setClaveAcceso(e.target.value)}
                                                autoComplete="new-password" placeholder="Mínimo 8 caracteres"
                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-xs bg-white"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Repetir contraseña</label>
                                            <input
                                                type="password" value={claveAcceso2} onChange={e => setClaveAcceso2(e.target.value)}
                                                autoComplete="new-password"
                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 text-xs bg-white"
                                            />
                                        </div>
                                    </div>

                                    <label className="flex items-start gap-2 cursor-pointer pt-1">
                                        <input type="checkbox" checked={temporal} onChange={e => setTemporal(e.target.checked)} className="mt-0.5" />
                                        <span className="text-[11px] text-gray-600 leading-relaxed">
                                            <strong>Pedirle que la cambie al entrar</strong> (cierra sesiones previas y exige actualización segura)
                                        </span>
                                    </label>

                                    <button
                                        onClick={guardarAcceso} disabled={guardandoAcceso}
                                        className="w-full py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
                                    >
                                        {guardandoAcceso && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Cambiar la contraseña de acceso al panel
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 transition-all rounded-xl">Cerrar</button>
                </div>
            </div>
        </div>
    );
};

export default AccountEditModal;
