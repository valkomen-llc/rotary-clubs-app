// ════════════════════════════════════════════════════════════════════
// Crear cuenta institucional — v4.932.0
//
// Sustituye al modal «Crear Correo», que pedía dirección y contraseña. Lo que
// se agrega es el PROPIETARIO: la persona detrás de la cuenta y lo que puede
// hacer con ella.
//
// ⚠️ LOS AVISOS SON DEL MISMO CRITERIO QUE EL SERVIDOR
// (`src/lib/institutionalAccess.ts`, espejo comparado por salidas). Con dos, la
// pantalla diría que algo está bien y el servidor lo rechazaría — que se lee
// como que el módulo está roto.
//
// ⚠️ Y AL TERMINAR NO SE MUESTRA LA CONTRASEÑA, ni recortada. Para entregársela
// a su dueño está «Enviar instrucciones de acceso», que manda un enlace de un
// solo uso en vez de poner una credencial compartida en circulación.
// ════════════════════════════════════════════════════════════════════
import React, { useMemo, useState } from 'react';
import { X, Lock, User as UserIcon, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import {
    PERMISSIONS, ACCESS_ROLES, INSTITUTIONAL_ROLE, PASSWORD_MIN,
    validateAccountPayload, buildInstitutionalEmail,
} from '../../../lib/institutionalAccess';

export interface AccountModalResult {
    account: { id: string; email: string };
    warnings?: string[];
    message?: string;
}

interface Props {
    domain: string;
    /**
     * Por qué no hay dominio, cuando el servidor no pudo resolver ninguno.
     * Se pinta en vez del formulario: dejar escribir una dirección que no se va
     * a poder crear es peor que decir qué falta.
     */
    blockedReason?: string | null;
    /** Sólo el operador de la plataforma puede nombrar administradores de sitio. */
    canGrantAdminRole: boolean;
    onClose: () => void;
    onCreated: (r: AccountModalResult) => void;
}

const InstitutionalAccountModal: React.FC<Props> = ({ domain, blockedReason = null, canGrantAdminRole, onClose, onCreated }) => {
    const [form, setForm] = useState({
        local: '',
        firstName: '',
        lastName: '',
        position: '',
        password: '',
        passwordConfirm: '',
        grantAccess: true,
        role: INSTITUTIONAL_ROLE,
        temporaryPassword: true,
    });
    const [permisos, setPermisos] = useState<string[]>(['mailbox']);
    const [enviando, setEnviando] = useState(false);
    const [errorServidor, setErrorServidor] = useState<string | null>(null);

    const direccion = buildInstitutionalEmail(form.local, domain);

    const revision = useMemo(
        () => validateAccountPayload({ ...form, permissions: permisos }, { domain }),
        [form, permisos, domain]
    );

    const roles = useMemo(
        () => ACCESS_ROLES.filter(r => !r.administrative || canGrantAdminRole),
        [canGrantAdminRole]
    );

    const alternar = (key: string) =>
        setPermisos(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]));

    const crear = async () => {
        setErrorServidor(null);
        setEnviando(true);
        try {
            const r = await fetch('/api/institutional/accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
                },
                body: JSON.stringify({ ...form, permissions: permisos }),
            });
            const cuerpo = await r.json().catch(() => ({}));
            if (!r.ok) {
                // El motivo se propaga TEXTUAL: «no se pudo crear» a secas
                // obliga a diagnosticar a ciegas.
                setErrorServidor(
                    r.status === 401 ? 'Tu sesión venció. Vuelve a entrar; lo que escribiste sigue acá.'
                    : r.status === 403 ? (cuerpo?.error || 'No tienes permiso para crear cuentas.')
                    : (cuerpo?.error || 'No pudimos crear la cuenta.')
                );
                return;
            }
            onCreated(cuerpo);
        } catch {
            setErrorServidor('No hubo respuesta del servidor. Revisa tu conexión: lo que escribiste sigue acá.');
        } finally {
            setEnviando(false);
        }
    };

    const institucional = form.role === INSTITUTIONAL_ROLE;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-md">
            <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Crear cuenta institucional</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Una dirección del sitio y, si quieres, su acceso al panel.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 rounded-xl">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    {/* Sin dominio no hay dirección que crear. Se dice con su
                        causa y qué hacer, en vez de dejar el formulario
                        fallando al enviar. */}
                    {!domain && (
                        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-900">
                                {blockedReason || 'Este sitio todavía no tiene un dominio propio conectado, así que no se pueden crear direcciones institucionales.'}
                            </p>
                        </div>
                    )}

                    {/* Propietario */}
                    <div>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <UserIcon className="w-3.5 h-3.5" /> Propietario
                        </p>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <input
                                value={form.firstName}
                                onChange={e => setForm({ ...form, firstName: e.target.value })}
                                placeholder="Nombre"
                                className="px-4 py-3 bg-gray-50 rounded-2xl outline-none text-sm focus:ring-2 focus:ring-sky-200"
                            />
                            <input
                                value={form.lastName}
                                onChange={e => setForm({ ...form, lastName: e.target.value })}
                                placeholder="Apellido"
                                className="px-4 py-3 bg-gray-50 rounded-2xl outline-none text-sm focus:ring-2 focus:ring-sky-200"
                            />
                        </div>
                        <input
                            value={form.position}
                            onChange={e => setForm({ ...form, position: e.target.value })}
                            placeholder="Cargo o función (opcional)"
                            className="mt-3 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none text-sm focus:ring-2 focus:ring-sky-200"
                        />
                    </div>

                    {/* Dirección */}
                    <div>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Dirección de correo</p>
                        <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-2xl mt-3">
                            <input
                                value={form.local}
                                onChange={e => setForm({ ...form, local: e.target.value })}
                                placeholder="ej: secretaria"
                                className="flex-1 min-w-0 bg-transparent border-none outline-none px-3 py-2 text-sm font-bold text-gray-900"
                            />
                            {/* El dominio del sitio, resuelto por el servidor. Se
                                muestra ENTERO: recortarlo con puntos suspensivos
                                deja al administrador sin poder comprobar en qué
                                dominio va a quedar la dirección, que es la única
                                pregunta que este control contesta. */}
                            <span
                                className="px-3 py-2 bg-white rounded-xl text-xs font-black text-sky-700 shadow-sm border border-sky-100 whitespace-nowrap flex-shrink-0"
                                title={domain ? `@${domain}` : undefined}
                                data-no-translate
                            >
                                @{domain || 'sin dominio'}
                            </span>
                        </div>
                        {direccion && (
                            <p className="mt-2 text-xs text-gray-400">
                                Se creará <span className="font-bold text-gray-600" data-no-translate>{direccion}</span>
                            </p>
                        )}
                    </div>

                    {/* Contraseña */}
                    <div>
                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5" /> Contraseña inicial
                        </p>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <input
                                type="password"
                                autoComplete="new-password"
                                value={form.password}
                                onChange={e => setForm({ ...form, password: e.target.value })}
                                placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
                                className="px-4 py-3 bg-gray-50 rounded-2xl outline-none text-sm focus:ring-2 focus:ring-sky-200"
                            />
                            <input
                                type="password"
                                autoComplete="new-password"
                                value={form.passwordConfirm}
                                onChange={e => setForm({ ...form, passwordConfirm: e.target.value })}
                                placeholder="Confirmar"
                                className="px-4 py-3 bg-gray-50 rounded-2xl outline-none text-sm focus:ring-2 focus:ring-sky-200"
                            />
                        </div>
                        <label className="flex items-start gap-3 mt-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.temporaryPassword}
                                onChange={e => setForm({ ...form, temporaryPassword: e.target.checked })}
                                className="mt-0.5 w-4 h-4 rounded accent-rotary-blue"
                            />
                            <span className="text-xs text-gray-600">
                                <span className="font-bold">Pedirle que la cambie al entrar.</span>{' '}
                                Recomendado: esta contraseña la conoces tú, así que hasta que la cambie es
                                una credencial compartida.
                            </span>
                        </label>
                    </div>

                    {/* Acceso */}
                    <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-100">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.grantAccess}
                                onChange={e => setForm({ ...form, grantAccess: e.target.checked })}
                                className="mt-0.5 w-4 h-4 rounded accent-rotary-blue"
                            />
                            <span className="text-sm text-gray-800">
                                <span className="font-bold">Crear acceso al panel para el propietario.</span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    Podrá entrar desde «Iniciar sesión» con este correo y esta contraseña.
                                    Sin esto se crea sólo el buzón.
                                </span>
                            </span>
                        </label>

                        {form.grantAccess && (
                            <div className="mt-4 space-y-4">
                                <div>
                                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Rol</p>
                                    <div className="mt-2 space-y-2">
                                        {roles.map(r => (
                                            <label key={r.key} className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-white border border-gray-100">
                                                <input
                                                    type="radio"
                                                    name="rol"
                                                    checked={form.role === r.key}
                                                    onChange={() => setForm({ ...form, role: r.key })}
                                                    className="mt-0.5 accent-rotary-blue"
                                                />
                                                <span className="text-xs">
                                                    <span className="font-bold text-gray-900 block">{r.label}</span>
                                                    <span className="text-gray-500">{r.help}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Las herramientas sólo se eligen para el usuario
                                    institucional: un administrador del sitio las tiene
                                    todas por su rol, y ofrecerle casillas haría creer
                                    que se le pueden quitar desde acá. */}
                                {institucional && (
                                    <div>
                                        <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <ShieldCheck className="w-3.5 h-3.5" /> Herramientas permitidas
                                        </p>
                                        <div className="mt-2 space-y-1.5">
                                            {PERMISSIONS.filter(p => !p.adminOnly).map(p => (
                                                <label key={p.key} className="flex items-start gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-white transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={permisos.includes(p.key)}
                                                        onChange={() => alternar(p.key)}
                                                        className="mt-0.5 w-4 h-4 rounded accent-rotary-blue"
                                                    />
                                                    <span className="text-xs">
                                                        <span className="font-bold text-gray-900 block">{p.label}</span>
                                                        <span className="text-gray-500">{p.help}</span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                        {/* Lo que NO se puede conceder se DICE, en vez de
                                            omitirlo: quien busca la casilla y no la
                                            encuentra concluye que falta la función. */}
                                        <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
                                            La administración de cuentas, de usuarios y la configuración del sitio
                                            no se conceden sueltas: exigen el rol de administrador del sitio.
                                            Un usuario institucional ve sólo su propia cuenta de correo.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Avisos en vivo, con el criterio del servidor */}
                    {revision.warnings.length > 0 && (
                        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                            {revision.warnings.map((w, i) => (
                                <p key={i} className="text-xs text-amber-800 flex items-start gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                    {w}
                                </p>
                            ))}
                        </div>
                    )}
                    {errorServidor && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl p-3">{errorServidor}</p>
                    )}
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-4 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 py-3 text-xs font-black text-gray-400 uppercase tracking-widest">
                        Cerrar
                    </button>
                    <button
                        onClick={crear}
                        disabled={!revision.ok || enviando || !domain}
                        title={!revision.ok ? revision.errors[0] : undefined}
                        className="flex-[2] py-3 bg-gray-900 text-white text-xs font-black rounded-2xl hover:bg-rotary-blue transition-all uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                        {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                        Crear y activar
                    </button>
                </div>
                {/* El motivo por el que el botón está apagado, A LA VISTA: uno
                    apagado sin explicación se lee como que el módulo está roto. */}
                {!revision.ok && (
                    <p className="px-6 pb-5 -mt-2 text-[11px] text-gray-400 bg-gray-50">{revision.errors[0]}</p>
                )}
            </div>
        </div>
    );
};

export default InstitutionalAccountModal;
