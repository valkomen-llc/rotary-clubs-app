// ════════════════════════════════════════════════════════════════════
// Mi perfil — /admin/perfil
// v4.932.0
//
// La pantalla del propietario de una cuenta institucional: quién es, con qué
// buzón entra, su fotografía, su contraseña y qué herramientas le habilitaron.
//
// ⚠️ ACÁ NO SE EDITA NI EL ROL NI LOS PERMISOS, y su ausencia es deliberada:
// concedérselos a uno mismo sería el agujero entero. El servidor tampoco los
// acepta por `PATCH /institutional/me` —el catálogo de lo editable está en el
// controlador, no en esta pantalla—, así que esconderlos acá no es la
// protección: es la coherencia con la protección.
//
// La sirve cualquier sesión de plataforma, no sólo la institucional: un
// administrador sin fila de perfil también quiere poder cambiar su contraseña y
// ponerse una fotografía.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    User as UserIcon, Mail, Lock, Camera, ShieldCheck, LogOut,
    AlertTriangle, Loader2, Check, Briefcase, Clock,
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { uploadMediaFiles } from '../../lib/mediaUpload';
import {
    PERMISSIONS, PASSWORD_MIN, displayNameOf, initialsOf, INSTITUTIONAL_ROLE,
} from '../../lib/institutionalAccess';

interface MiPerfil {
    id: string;
    email: string;
    role: string;
    clubId: string | null;
    firstName: string | null;
    lastName: string | null;
    position: string | null;
    avatarUrl: string | null;
    mailbox: string | null;
    displayName: string;
    permissions: string[];
    status: string;
    mustChangePassword: boolean;
    lastLoginAt: string | null;
    hasProfile: boolean;
}

const api = (ruta: string, init: RequestInit = {}) =>
    fetch(`/api/institutional${ruta}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
            ...(init.headers || {}),
        },
    });

/**
 * Distingue los tres fallos que se corrigen en sitios distintos: la sesión
 * venció, no es tu permiso, o la petición no llegó. «No se pudo guardar» a
 * secas obliga a diagnosticar a ciegas (regla de `FeeRulesPanel`, v4.859).
 */
const mensajeDeFallo = (status: number | null, detalle?: string) => {
    if (status === null) return 'No hubo respuesta del servidor. Revisa tu conexión: lo que escribiste sigue acá.';
    if (status === 401) return 'Tu sesión venció. Vuelve a entrar; lo que escribiste sigue acá.';
    if (status === 403) return detalle || 'No tienes permiso para esto.';
    return detalle || 'No pudimos guardar el cambio.';
};

const Perfil: React.FC = () => {
    const { user, logout, login, token } = useAuth();
    const [params] = useSearchParams();
    const cambioForzado = params.get('cambiar') === '1';

    const [perfil, setPerfil] = useState<MiPerfil | null>(null);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);

    const [datos, setDatos] = useState({ firstName: '', lastName: '', position: '' });
    const [guardandoDatos, setGuardandoDatos] = useState(false);

    const [clave, setClave] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [guardandoClave, setGuardandoClave] = useState(false);

    const [subiendoFoto, setSubiendoFoto] = useState(false);
    const fotoRef = useRef<HTMLInputElement>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        setErrorCarga(null);
        try {
            const r = await api('/me');
            if (!r.ok) {
                const cuerpo = await r.json().catch(() => ({}));
                setErrorCarga(mensajeDeFallo(r.status, cuerpo?.error));
                return;
            }
            const data: MiPerfil = await r.json();
            setPerfil(data);
            setDatos({
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                position: data.position || '',
            });
        } catch {
            setErrorCarga(mensajeDeFallo(null));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    /**
     * Refresca la sesión del navegador con lo que acaba de cambiar.
     *
     * Sin esto, el avatar del encabezado seguiría mostrando la fotografía
     * anterior hasta la próxima vez que la persona vuelva a entrar — y el aviso
     * de contraseña temporal seguiría ahí después de cambiarla.
     */
    const refrescarSesion = useCallback((parche: Record<string, unknown>) => {
        if (!token || !user) return;
        login(token, { ...(user as any), ...parche });
    }, [token, user, login]);

    const guardarDatos = async () => {
        setGuardandoDatos(true);
        try {
            const r = await api('/me', { method: 'PATCH', body: JSON.stringify(datos) });
            const cuerpo = await r.json().catch(() => ({}));
            if (!r.ok) { toast.error(mensajeDeFallo(r.status, cuerpo?.error)); return; }
            toast.success('Tus datos quedaron guardados.');
            refrescarSesion({
                firstName: datos.firstName,
                lastName: datos.lastName,
                position: datos.position,
                displayName: displayNameOf(datos, perfil?.email || ''),
            });
            cargar();
        } catch {
            toast.error(mensajeDeFallo(null));
        } finally {
            setGuardandoDatos(false);
        }
    };

    /**
     * La fotografía va por `uploadMediaFiles`, el MISMO camino de toda subida
     * del sitio: un segundo camino a S3 se separaría en silencio del primero
     * (regla de v4.784). Se usa la URL que devuelve el servidor, no la que se
     * mandó — con un HEIC el servidor lo convierte y guarda otra dirección.
     */
    const subirFoto = async (file: File) => {
        setSubiendoFoto(true);
        try {
            const { uploaded, failed } = await uploadMediaFiles([file], {
                clubId: perfil?.clubId || undefined,
                maxDimension: 1024,
            });
            if (!uploaded.length) {
                toast.error(failed[0]?.reason || 'No pudimos subir la fotografía.');
                return;
            }
            const url = uploaded[0].url;
            const r = await api('/me', { method: 'PATCH', body: JSON.stringify({ avatarUrl: url }) });
            const cuerpo = await r.json().catch(() => ({}));
            if (!r.ok) { toast.error(mensajeDeFallo(r.status, cuerpo?.error)); return; }
            toast.success('Fotografía actualizada.');
            refrescarSesion({ avatarUrl: url });
            cargar();
        } catch {
            toast.error('No pudimos subir la fotografía.');
        } finally {
            setSubiendoFoto(false);
            if (fotoRef.current) fotoRef.current.value = '';
        }
    };

    const cambiarClave = async () => {
        if (clave.newPassword.length < PASSWORD_MIN) {
            toast.error(`La contraseña nueva debe tener al menos ${PASSWORD_MIN} caracteres.`);
            return;
        }
        if (clave.newPassword !== clave.confirmPassword) {
            toast.error('Las dos contraseñas nuevas no coinciden.');
            return;
        }
        setGuardandoClave(true);
        try {
            const r = await api('/me/password', { method: 'POST', body: JSON.stringify(clave) });
            const cuerpo = await r.json().catch(() => ({}));
            if (!r.ok) { toast.error(mensajeDeFallo(r.status, cuerpo?.error)); return; }
            toast.success('Tu contraseña quedó actualizada.');
            setClave({ currentPassword: '', newPassword: '', confirmPassword: '' });
            refrescarSesion({ mustChangePassword: false });
            cargar();
        } catch {
            toast.error(mensajeDeFallo(null));
        } finally {
            setGuardandoClave(false);
        }
    };

    const herramientas = useMemo(
        () => PERMISSIONS.filter(p => (perfil?.permissions || []).includes(p.key)),
        [perfil?.permissions]
    );

    const iniciales = initialsOf(perfil || {}, perfil?.email || user?.email || '');
    const debeCambiar = !!perfil?.mustChangePassword || cambioForzado;

    return (
        <AdminLayout>
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                        <UserIcon className="w-6 h-6 text-rotary-blue" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Mi perfil</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Tus datos, tu fotografía y tu contraseña.
                        </p>
                    </div>
                </div>

                {/* ⚠️ El aviso de contraseña temporal va ARRIBA del todo y con su
                    motivo dicho: la escribió el administrador, así que la conoce
                    alguien que no es su dueño. Sin decir POR QUÉ, se lee como un
                    trámite y se pospone. */}
                {debeCambiar && (
                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-900">
                            <p className="font-bold">Por seguridad, crea una contraseña nueva antes de continuar.</p>
                            <p className="mt-1 text-amber-800">
                                La que estás usando la escribió quien creó tu cuenta, así que la conoce
                                otra persona. Cámbiala abajo y deja de ser compartida.
                            </p>
                        </div>
                    </div>
                )}

                {errorCarga && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-800">
                        <p className="font-bold">No pudimos cargar tu perfil.</p>
                        <p className="mt-1">{errorCarga}</p>
                        <button onClick={cargar} className="mt-3 px-4 py-2 bg-white border border-red-200 rounded-xl text-xs font-bold text-red-700">
                            Reintentar
                        </button>
                    </div>
                )}

                {cargando ? (
                    <div className="flex items-center gap-3 p-8 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Cargando tu perfil…</span>
                    </div>
                ) : perfil && (
                    <>
                        {perfil.status === 'suspended' && (
                            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-800">
                                <p className="font-bold">Tu acceso está suspendido.</p>
                                <p className="mt-1">Escríbele al administrador del sitio para reactivarlo.</p>
                            </div>
                        )}

                        {/* Identidad */}
                        <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                                <div className="relative">
                                    {perfil.avatarUrl ? (
                                        <img
                                            src={perfil.avatarUrl}
                                            alt={perfil.displayName}
                                            className="w-24 h-24 rounded-3xl object-cover border-4 border-white shadow-lg"
                                        />
                                    ) : (
                                        <div className="w-24 h-24 rounded-3xl bg-rotary-blue flex items-center justify-center text-white font-black text-2xl border-4 border-white shadow-lg">
                                            {iniciales}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => fotoRef.current?.click()}
                                        disabled={subiendoFoto}
                                        title="Cambiar mi fotografía"
                                        className="absolute -bottom-1 -right-1 w-9 h-9 rounded-2xl bg-gray-900 text-white flex items-center justify-center shadow-lg hover:bg-rotary-blue transition-all disabled:opacity-60"
                                    >
                                        {subiendoFoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                                    </button>
                                    <input
                                        ref={fotoRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={e => {
                                            const f = e.target.files?.[0];
                                            if (f) subirFoto(f);
                                        }}
                                    />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <p className="text-xl font-bold text-gray-900 truncate">{perfil.displayName}</p>
                                    <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                        <Mail className="w-4 h-4 flex-shrink-0" />
                                        <span className="truncate" data-no-translate>{perfil.email}</span>
                                    </p>
                                    {perfil.position && (
                                        <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                            <Briefcase className="w-4 h-4 flex-shrink-0" />
                                            <span className="truncate">{perfil.position}</span>
                                        </p>
                                    )}
                                    {perfil.lastLoginAt && (
                                        <p className="text-xs text-gray-400 flex items-center gap-2 mt-2">
                                            <Clock className="w-3.5 h-3.5" />
                                            Último ingreso: {new Date(perfil.lastLoginAt).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Datos personales */}
                        <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8">
                            <h2 className="text-lg font-semibold text-gray-900">Datos personales</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Tu correo institucional y tu rol los define el administrador del sitio.
                            </p>
                            <div className="grid sm:grid-cols-2 gap-4 mt-6">
                                <label className="block">
                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Nombre</span>
                                    <input
                                        value={datos.firstName}
                                        onChange={e => setDatos({ ...datos, firstName: e.target.value })}
                                        className="mt-2 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-200"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Apellido</span>
                                    <input
                                        value={datos.lastName}
                                        onChange={e => setDatos({ ...datos, lastName: e.target.value })}
                                        className="mt-2 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-200"
                                    />
                                </label>
                                <label className="block sm:col-span-2">
                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Cargo o función</span>
                                    <input
                                        value={datos.position}
                                        onChange={e => setDatos({ ...datos, position: e.target.value })}
                                        placeholder="ej: Secretaría del club"
                                        className="mt-2 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-200"
                                    />
                                </label>
                            </div>
                            <button
                                onClick={guardarDatos}
                                disabled={guardandoDatos}
                                className="mt-6 px-6 py-3 bg-gray-900 text-white text-xs font-black rounded-2xl uppercase tracking-widest hover:bg-rotary-blue transition-all disabled:opacity-60"
                            >
                                {guardandoDatos ? 'Guardando…' : 'Guardar datos'}
                            </button>
                        </div>

                        {/* Contraseña */}
                        <div className={`bg-white border rounded-3xl p-6 sm:p-8 ${debeCambiar ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-200'}`}>
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Lock className="w-5 h-5 text-gray-400" />
                                Cambiar mi contraseña
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Se te pide la actual porque tener la sesión abierta no demuestra que la
                                cuenta sea tuya. Mínimo {PASSWORD_MIN} caracteres.
                            </p>
                            <div className="grid sm:grid-cols-3 gap-4 mt-6">
                                <label className="block">
                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Actual</span>
                                    <input
                                        type="password"
                                        autoComplete="current-password"
                                        value={clave.currentPassword}
                                        onChange={e => setClave({ ...clave, currentPassword: e.target.value })}
                                        className="mt-2 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-200"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Nueva</span>
                                    <input
                                        type="password"
                                        autoComplete="new-password"
                                        value={clave.newPassword}
                                        onChange={e => setClave({ ...clave, newPassword: e.target.value })}
                                        className="mt-2 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-200"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Repetir la nueva</span>
                                    <input
                                        type="password"
                                        autoComplete="new-password"
                                        value={clave.confirmPassword}
                                        onChange={e => setClave({ ...clave, confirmPassword: e.target.value })}
                                        className="mt-2 w-full px-4 py-3 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-sky-200"
                                    />
                                </label>
                            </div>
                            <button
                                onClick={cambiarClave}
                                disabled={guardandoClave || !clave.currentPassword || !clave.newPassword}
                                className="mt-6 px-6 py-3 bg-gray-900 text-white text-xs font-black rounded-2xl uppercase tracking-widest hover:bg-rotary-blue transition-all disabled:opacity-40"
                            >
                                {guardandoClave ? 'Cambiando…' : 'Cambiar contraseña'}
                            </button>
                        </div>

                        {/* Herramientas habilitadas */}
                        {perfil.role === INSTITUTIONAL_ROLE && (
                            <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8">
                                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5 text-gray-400" />
                                    Herramientas habilitadas
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Las asigna el administrador del sitio. Si te falta alguna, pídesela.
                                </p>
                                {herramientas.length === 0 ? (
                                    <p className="mt-6 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                        Todavía no tienes ninguna herramienta habilitada. Escríbele al
                                        administrador del sitio.
                                    </p>
                                ) : (
                                    <ul className="mt-6 grid sm:grid-cols-2 gap-3">
                                        {herramientas.map(p => (
                                            <li key={p.key} className="flex items-start gap-3 p-3 rounded-2xl bg-gray-50">
                                                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{p.label}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">{p.help}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {perfil.mailbox && (
                                    <p className="mt-4 text-xs text-gray-400">
                                        Tu bandeja se abre siempre en <span className="font-bold" data-no-translate>{perfil.mailbox}</span>.
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={logout}
                                className="flex items-center gap-2 px-6 py-3 text-xs font-black text-gray-500 hover:text-red-600 uppercase tracking-widest transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                                Cerrar sesión
                            </button>
                        </div>
                    </>
                )}
            </div>
        </AdminLayout>
    );
};

export default Perfil;
