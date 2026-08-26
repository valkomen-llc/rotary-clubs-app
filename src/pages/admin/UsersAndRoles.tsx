// ════════════════════════════════════════════════════════════════════
// Usuarios y permisos — v4.937.0
//
// Dos pestañas y una traza: quién entra a este sitio, con qué rol, y qué se
// tocó de los accesos.
//
// ⚠️ ESTA PANTALLA NO AUTORIZA NADA. Lo que esconde es lo que no se puede
// USAR, y quien escriba la dirección a mano llega igual y no obtiene ni un
// dato: cada petición choca contra `requirePermission` en el servidor.
// Esconder un control no protege un endpoint de quien lo conoce (v4.868).
//
// ⚠️ Y LA MATRIZ PINTA EN GRIS LO QUE ESTE ADMINISTRADOR NO PUEDE CONCEDER.
// La protección de verdad es `filterGrantable`, en el servidor y sobre lo que
// se guarda; que además se VEA es lo que evita que alguien marque una casilla,
// guarde, y el servidor la descarte sin que él entienda por qué.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Users, Shield, ScrollText, Plus, Copy, Trash2, Check, X, Loader2,
    AlertTriangle, Info, Search, RotateCcw, LogOut, ChevronDown, ChevronRight,
    Lock, UserCog, Save,
} from 'lucide-react';
import {
    ALL_ACTION_FORMS, actionLabel, describeRole, expandPermissions,
    MEMBERSHIP_STATUSES, type MatrixGroup,
} from '../../lib/rbacSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const auth = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

/**
 * ⚠️ UN FALLO SE DICE CON SU CAUSA. 401 se corrige volviendo a entrar, 403
 * pidiendo el permiso y 500 mirando el servidor: son tres cosas que se
 * resuelven en sitios distintos y «no se pudo guardar» a secas obliga a
 * diagnosticar a ciegas (regla de v4.859).
 */
const mensajeDeFallo = async (r: Response | null, accion: string): Promise<string> => {
    if (!r) return `No hubo respuesta del servidor al ${accion}. Revisa tu conexión: lo que escribiste sigue acá.`;
    let detalle = '';
    try { detalle = (await r.json())?.error || ''; } catch { /* respuesta sin cuerpo */ }
    if (r.status === 401) return 'Tu sesión venció. Vuelve a entrar; lo que escribiste sigue acá.';
    if (r.status === 403) return detalle || 'No tienes permiso para esta acción. Pídeselo a un administrador del sitio.';
    if (r.status === 409) return detalle || `No se pudo ${accion}.`;
    if (r.status === 422) return detalle || 'Revisa el formulario.';
    return detalle || `No se pudo ${accion} (error ${r.status}).`;
};

interface RoleRow {
    id: string | null;
    key: string;
    name: string;
    description: string;
    permissions: string[];
    scope: string;
    active: boolean;
    protected: boolean;
    custom: boolean;
    summary?: string;
    assignable?: boolean;
    administrative?: boolean;
    members?: number;
}

interface UserRow {
    userId: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    mailbox: string | null;
    platformRole: string | null;
    roleKey: string | null;
    roleId: string | null;
    roleLabel: string | null;
    extraPermissions: string[];
    deniedPermissions: string[];
    status: string;
    lastLoginAt: string | null;
    inherited: boolean;
    isSiteAdmin: boolean;
}

interface Catalogo {
    matrix: MatrixGroup[];
    roles: RoleRow[];
    grantable: string[];
    isPlatformOperator: boolean;
    can: { viewUsers: boolean; manageUsers: boolean; viewRoles: boolean; manageRoles: boolean; viewAudit: boolean };
}

const iniciales = (nombre?: string | null, correo?: string | null) => {
    const base = (nombre || correo || '?').trim();
    const partes = base.split(/[\s@.]+/).filter(Boolean);
    return (partes.slice(0, 2).map(p => p[0]).join('') || base[0] || '?').toUpperCase();
};

const fecha = (v?: string | null) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleString(); } catch { return '—'; }
};

const etiquetaEstado = (k: string) => MEMBERSHIP_STATUSES.find(s => s.key === k)?.label || k;

const colorEstado = (k: string) => ({
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    invited: 'bg-sky-50 text-sky-700 ring-sky-200',
    suspended: 'bg-red-50 text-red-700 ring-red-200',
    disabled: 'bg-gray-100 text-gray-600 ring-gray-200',
}[k] || 'bg-gray-100 text-gray-600 ring-gray-200');

// ── La matriz ────────────────────────────────────────────────────────

/**
 * La matriz de permisos.
 *
 * ⚠️ Marca ADEMÁS lo IMPLICADO, en gris y sin poder desmarcarlo por separado:
 * `manage` implica todas las acciones de su módulo y `edit` implica `edit_own`.
 * Sin verlo, el administrador marca «Administrar», guarda, y al reabrir se
 * encuentra siete casillas que él no puso — y no tiene forma de saber si es un
 * error del sistema. Las implicaciones las calcula el MISMO `expandPermissions`
 * que usa el servidor: son un solo criterio, espejado y probado por salidas.
 */
const MatrizDePermisos: React.FC<{
    matrix: MatrixGroup[];
    seleccion: string[];
    grantable: string[] | null;
    readOnly?: boolean;
    onChange: (permisos: string[]) => void;
}> = ({ matrix, seleccion, grantable, readOnly, onChange }) => {
    const [abiertos, setAbiertos] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(matrix.map(g => [g.group, true])));

    const marcados = useMemo(() => new Set(seleccion), [seleccion]);
    const efectivos = useMemo(() => new Set(expandPermissions(seleccion).permissions), [seleccion]);
    const puede = useMemo(() => (grantable ? new Set(grantable) : null), [grantable]);

    const alternar = (permiso: string) => {
        if (readOnly) return;
        if (puede && !puede.has(permiso)) return;
        onChange(marcados.has(permiso)
            ? seleccion.filter(p => p !== permiso)
            : [...seleccion, permiso]);
    };

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            {matrix.map(grupo => (
                <div key={grupo.group} className="border-b border-gray-200 last:border-b-0">
                    <button
                        type="button"
                        onClick={() => setAbiertos(a => ({ ...a, [grupo.group]: !a[grupo.group] }))}
                        className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-left"
                    >
                        {abiertos[grupo.group]
                            ? <ChevronDown className="w-4 h-4 text-gray-500" />
                            : <ChevronRight className="w-4 h-4 text-gray-500" />}
                        <span className="text-sm font-semibold text-gray-800">{grupo.group}</span>
                        <span className="text-xs text-gray-500">
                            {grupo.modules.filter(m => m.cells.some(c => c.permission && efectivos.has(c.permission))).length}
                            /{grupo.modules.length}
                        </span>
                    </button>

                    {abiertos[grupo.group] && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[820px]">
                                <thead>
                                    <tr className="border-t border-gray-200 bg-white">
                                        <th className="text-left font-medium text-gray-500 px-4 py-2 w-64">Módulo</th>
                                        {ALL_ACTION_FORMS.map(a => (
                                            <th key={a} className="px-2 py-2 text-[11px] font-medium text-gray-500 text-center whitespace-nowrap">
                                                {actionLabel(a)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {grupo.modules.map(mod => (
                                        <tr key={mod.key} className="border-t border-gray-100 hover:bg-gray-50/60">
                                            <td className="px-4 py-2 align-top">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-medium text-gray-800">{mod.label}</span>
                                                    {mod.sensitive && (
                                                        <span title="Es administración del sitio: concederlo convierte a quien lo recibe en administrador.">
                                                            <Lock className="w-3 h-3 text-amber-500" />
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{mod.help}</p>
                                            </td>
                                            {ALL_ACTION_FORMS.map(a => {
                                                const celda = mod.cells.find(c => c.action === a);
                                                if (!celda?.available || !celda.permission) {
                                                    return <td key={a} className="text-center text-gray-200 py-2">—</td>;
                                                }
                                                const p = celda.permission;
                                                const directo = marcados.has(p);
                                                const implicado = !directo && efectivos.has(p);
                                                const bloqueado = readOnly || (!!puede && !puede.has(p));
                                                return (
                                                    <td key={a} className="text-center py-2">
                                                        <button
                                                            type="button"
                                                            disabled={bloqueado}
                                                            onClick={() => alternar(p)}
                                                            title={
                                                                bloqueado && puede && !puede.has(p)
                                                                    ? 'No puedes conceder un permiso que tú mismo no tienes.'
                                                                    : implicado
                                                                        ? 'Lo concede otro permiso marcado en esta fila.'
                                                                        : p
                                                            }
                                                            className={`w-6 h-6 rounded-md border inline-flex items-center justify-center transition
                                                                ${directo ? 'bg-emerald-600 border-emerald-600 text-white'
                                                                    : implicado ? 'bg-emerald-100 border-emerald-200 text-emerald-600'
                                                                    : bloqueado ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                                                                    : 'bg-white border-gray-300 hover:border-emerald-400'}`}
                                                        >
                                                            {(directo || implicado) && <Check className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ))}

            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center gap-4 text-[11px] text-gray-600">
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-600 inline-block" /> Marcado
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200 inline-block" /> Lo concede otro permiso de la fila
                </span>
                {puede && (
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-gray-50 border border-gray-200 inline-block" /> No puedes concederlo
                    </span>
                )}
            </div>
        </div>
    );
};

// ── La pantalla ──────────────────────────────────────────────────────

const UsersAndRoles: React.FC = () => {
    const [tab, setTab] = useState<'usuarios' | 'roles' | 'auditoria'>('usuarios');
    const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
    const [usuarios, setUsuarios] = useState<UserRow[]>([]);
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [eventos, setEventos] = useState<Array<Record<string, unknown>>>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [buscar, setBuscar] = useState('');
    const [guardando, setGuardando] = useState(false);

    // El rol que se está editando. `null` es «ninguno»; un objeto sin `id` es
    // uno nuevo. Se distingue así y no con un booleano aparte: dos verdades
    // sobre el mismo estado se contradicen en cuanto alguien cierre el editor.
    const [editando, setEditando] = useState<RoleRow | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const [c, u, r] = await Promise.all([
                fetch(`${API}/rbac/catalog`, { headers: auth() }),
                fetch(`${API}/rbac/users`, { headers: auth() }),
                fetch(`${API}/rbac/roles`, { headers: auth() }),
            ]);
            if (!c.ok) { setError(await mensajeDeFallo(c, 'cargar los permisos')); setCargando(false); return; }
            const cat = await c.json();
            setCatalogo(cat);
            if (u.ok) setUsuarios((await u.json()).users || []);
            if (r.ok) setRoles((await r.json()).roles || []);
            if (cat?.can?.viewAudit) {
                const a = await fetch(`${API}/rbac/audit`, { headers: auth() });
                if (a.ok) setEventos((await a.json()).events || []);
            }
        } catch {
            setError(await mensajeDeFallo(null, 'cargar los permisos'));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    const pedir = async (url: string, init: RequestInit, accion: string) => {
        setGuardando(true);
        setError(null);
        setAviso(null);
        try {
            const r = await fetch(url, { ...init, headers: auth() });
            if (!r.ok) { setError(await mensajeDeFallo(r, accion)); return null; }
            const data = await r.json().catch(() => ({}));
            if (Array.isArray(data?.warnings) && data.warnings.length) setAviso(data.warnings.join(' · '));
            await cargar();
            return data;
        } catch {
            setError(await mensajeDeFallo(null, accion));
            return null;
        } finally {
            setGuardando(false);
        }
    };

    const usuariosFiltrados = useMemo(() => {
        const q = buscar.trim().toLowerCase();
        if (!q) return usuarios;
        return usuarios.filter(u =>
            [u.name, u.email, u.mailbox, u.roleLabel].filter(Boolean).join(' ').toLowerCase().includes(q));
    }, [usuarios, buscar]);

    const puedeUsuarios = !!catalogo?.can?.manageUsers;
    const puedeRoles = !!catalogo?.can?.manageRoles;
    const asignables = useMemo(() => roles.filter(r => r.assignable && r.active !== false), [roles]);

    if (cargando) {
        return (
            <div className="p-8 flex items-center gap-3 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" /> Cargando usuarios y permisos…
            </div>
        );
    }

    if (error && !catalogo) {
        return (
            <div className="p-8">
                <div className="max-w-xl bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-red-800">No pudimos abrir esta pantalla</p>
                        <p className="text-sm text-red-700 mt-1">{error}</p>
                        <button onClick={cargar} className="mt-3 text-sm font-medium text-red-800 underline">Reintentar</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <header className="mb-6">
                <h1 className="text-2xl font-light text-gray-900 flex items-center gap-2">
                    <UserCog className="w-6 h-6 text-rotary-blue" /> Usuarios y permisos
                </h1>
                <p className="text-sm text-gray-500 mt-1 max-w-3xl">
                    Quién entra al panel de este sitio y qué puede hacer. Un rol es un conjunto de permisos:
                    cambiarle el rol a alguien cambia lo que ve en el menú y lo que el servidor le responde.
                </p>
            </header>

            {(error || aviso) && (
                <div className={`mb-4 rounded-xl border p-3 flex gap-2 text-sm ${error ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    {error ? <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                    <span>{error || aviso}</span>
                    <button onClick={() => { setError(null); setAviso(null); }} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
            )}

            <nav className="flex gap-1 border-b border-gray-200 mb-6">
                {([
                    ['usuarios', 'Usuarios', Users],
                    ['roles', 'Roles', Shield],
                    ...(catalogo?.can?.viewAudit ? [['auditoria', 'Auditoría', ScrollText] as const] : []),
                ] as Array<[typeof tab, string, React.ElementType]>).map(([k, label, Icon]) => (
                    <button
                        key={k}
                        onClick={() => setTab(k)}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 transition
                            ${tab === k ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                        <Icon className="w-4 h-4" /> {label}
                    </button>
                ))}
            </nav>

            {/* ── USUARIOS ────────────────────────────────────────── */}
            {tab === 'usuarios' && (
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={buscar}
                                onChange={e => setBuscar(e.target.value)}
                                placeholder="Buscar por nombre, correo o rol…"
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue"
                            />
                        </div>
                        <span className="text-sm text-gray-500">{usuariosFiltrados.length} de {usuarios.length}</span>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[880px]">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="text-left font-medium px-4 py-3">Persona</th>
                                        <th className="text-left font-medium px-4 py-3">Rol en este sitio</th>
                                        <th className="text-left font-medium px-4 py-3">Estado</th>
                                        <th className="text-left font-medium px-4 py-3">Último acceso</th>
                                        <th className="text-right font-medium px-4 py-3">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {usuariosFiltrados.map(u => (
                                        <tr key={u.userId} className="border-t border-gray-100 hover:bg-gray-50/60">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {u.avatarUrl
                                                        ? <img src={u.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                                                        : <span className="w-9 h-9 rounded-full bg-rotary-blue/10 text-rotary-blue text-xs font-semibold flex items-center justify-center">
                                                            {iniciales(u.name, u.email)}
                                                        </span>}
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-gray-900 truncate">{u.name || u.email || 'Sin nombre'}</p>
                                                        <p className="text-xs text-gray-500 truncate" data-no-translate>{u.mailbox || u.email || '—'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={u.roleId || u.roleKey || ''}
                                                    disabled={!puedeUsuarios || guardando}
                                                    onChange={e => {
                                                        const v = e.target.value;
                                                        if (!v) return;
                                                        const rol = roles.find(r => (r.id || r.key) === v);
                                                        if (!rol) return;
                                                        pedir(`${API}/rbac/users/${u.userId}/role`, {
                                                            method: 'PUT',
                                                            body: JSON.stringify(rol.custom ? { roleId: rol.id } : { roleKey: rol.key }),
                                                        }, 'cambiar el rol');
                                                    }}
                                                    className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                                                >
                                                    <option value="">
                                                        {u.inherited ? `Heredado — ${u.platformRole || 'rol de siempre'}` : 'Sin rol asignado'}
                                                    </option>
                                                    {asignables.map(r => (
                                                        <option key={r.id || r.key} value={r.id || r.key}>{r.name}</option>
                                                    ))}
                                                </select>
                                                {u.inherited && (
                                                    // ⚠️ Se DICE que su acceso viene de su rol de siempre y no de
                                                    // un rol de este módulo: sin esa distinción, «¿por qué esta
                                                    // persona ve todo si no tiene rol asignado?» no se contesta.
                                                    <p className="text-[11px] text-gray-500 mt-1 max-w-xs leading-snug">
                                                        Entra con el rol que ya tenía antes de este módulo. Asignarle uno de la lista lo acota.
                                                    </p>
                                                )}
                                                {(u.extraPermissions?.length > 0 || u.deniedPermissions?.length > 0) && (
                                                    <p className="text-[11px] text-amber-700 mt-1">
                                                        Con excepciones: +{u.extraPermissions.length} / −{u.deniedPermissions.length}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs px-2 py-1 rounded-full ring-1 ${colorEstado(u.status)}`}>
                                                    {etiquetaEstado(u.status)}
                                                </span>
                                                {u.isSiteAdmin && (
                                                    <p className="text-[11px] text-gray-500 mt-1">Administrador del sitio</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap" data-no-translate>{fecha(u.lastLoginAt)}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    {puedeUsuarios && u.status !== 'suspended' && (
                                                        <button
                                                            title="Suspender el acceso. Cierra también sus sesiones abiertas."
                                                            disabled={guardando}
                                                            onClick={() => pedir(`${API}/rbac/users/${u.userId}/status`, {
                                                                method: 'PUT', body: JSON.stringify({ status: 'suspended' }),
                                                            }, 'suspender el acceso')}
                                                            className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"
                                                        ><X className="w-4 h-4" /></button>
                                                    )}
                                                    {puedeUsuarios && u.status === 'suspended' && (
                                                        <button
                                                            title="Reactivar el acceso"
                                                            disabled={guardando}
                                                            onClick={() => pedir(`${API}/rbac/users/${u.userId}/status`, {
                                                                method: 'PUT', body: JSON.stringify({ status: 'active' }),
                                                            }, 'reactivar el acceso')}
                                                            className="p-1.5 rounded-lg text-gray-500 hover:bg-emerald-50 hover:text-emerald-600"
                                                        ><RotateCcw className="w-4 h-4" /></button>
                                                    )}
                                                    {puedeUsuarios && !u.inherited && (
                                                        <button
                                                            title="Cerrar sus sesiones abiertas. Tendrá que volver a entrar."
                                                            disabled={guardando}
                                                            onClick={() => pedir(`${API}/rbac/users/${u.userId}/sessions/revoke`, { method: 'POST' }, 'cerrar las sesiones')}
                                                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                                                        ><LogOut className="w-4 h-4" /></button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {usuariosFiltrados.length === 0 && (
                                        <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                                            {buscar ? 'Ningún usuario coincide con esa búsqueda.' : 'Todavía no hay usuarios en este sitio.'}
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <p className="text-xs text-gray-500 mt-3 max-w-3xl leading-relaxed">
                        Las contraseñas no se muestran nunca, ni recortadas. Para entregarle el acceso a su dueño,
                        usa «Enviar acceso» desde Cuentas de correo: manda un enlace de un solo uso que vence.
                    </p>
                </section>
            )}

            {/* ── ROLES ──────────────────────────────────────────── */}
            {tab === 'roles' && (
                <section>
                    {editando ? (
                        <EditorDeRol
                            rol={editando}
                            matrix={catalogo?.matrix || []}
                            grantable={catalogo?.grantable || []}
                            guardando={guardando}
                            onCancel={() => setEditando(null)}
                            onSave={async (valores) => {
                                const hecho = editando.id
                                    ? await pedir(`${API}/rbac/roles/${editando.id}`, { method: 'PATCH', body: JSON.stringify(valores) }, 'guardar el rol')
                                    : await pedir(`${API}/rbac/roles`, { method: 'POST', body: JSON.stringify(valores) }, 'crear el rol');
                                if (hecho) setEditando(null);
                            }}
                        />
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm text-gray-500 max-w-2xl">
                                    Los roles del sistema no se editan ni se eliminan: viven en el código, así que una
                                    corrección llega a todos los sitios a la vez. Para adaptar uno, <strong>duplícalo</strong>.
                                </p>
                                {puedeRoles && (
                                    <button
                                        onClick={() => setEditando({
                                            id: null, key: '', name: '', description: '', permissions: [],
                                            scope: 'site', active: true, protected: false, custom: true,
                                        })}
                                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-rotary-blue text-white rounded-lg hover:bg-rotary-navy"
                                    ><Plus className="w-4 h-4" /> Crear rol</button>
                                )}
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                {roles.map(r => (
                                    <div key={r.id || r.key} className="bg-white border border-gray-200 rounded-xl p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                                    {r.name}
                                                    {r.protected && (
                                                        <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                            Del sistema
                                                        </span>
                                                    )}
                                                    {r.active === false && (
                                                        <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                                            Desactivado
                                                        </span>
                                                    )}
                                                </h3>
                                                <p className="text-sm text-gray-500 mt-1">{r.description}</p>
                                            </div>
                                            <span className="text-xs text-gray-500 whitespace-nowrap">
                                                {r.members ?? 0} {r.members === 1 ? 'persona' : 'personas'}
                                            </span>
                                        </div>

                                        <p className="text-xs text-gray-600 mt-3 leading-relaxed">
                                            {r.summary || describeRole(r.permissions)}
                                        </p>

                                        {!r.assignable && (
                                            <p className="text-[11px] text-amber-700 mt-2 flex items-start gap-1.5">
                                                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                                                No puedes asignarlo: tiene permisos que tú no tienes.
                                            </p>
                                        )}

                                        {puedeRoles && (
                                            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                                                <button
                                                    disabled={guardando}
                                                    onClick={() => pedir(`${API}/rbac/roles/duplicate`, {
                                                        method: 'POST',
                                                        body: JSON.stringify(r.custom ? { fromId: r.id } : { fromKey: r.key }),
                                                    }, 'duplicar el rol')}
                                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-rotary-blue"
                                                ><Copy className="w-3.5 h-3.5" /> Duplicar</button>

                                                {!r.protected && (
                                                    <>
                                                        <button
                                                            onClick={() => setEditando(r)}
                                                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-rotary-blue"
                                                        ><Save className="w-3.5 h-3.5" /> Editar</button>
                                                        <button
                                                            disabled={guardando}
                                                            onClick={() => pedir(`${API}/rbac/roles/${r.id}`, { method: 'PATCH', body: JSON.stringify({ active: r.active === false }) }, 'cambiar el estado del rol')}
                                                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-amber-600"
                                                        >{r.active === false ? 'Activar' : 'Desactivar'}</button>
                                                        <button
                                                            disabled={guardando}
                                                            onClick={() => pedir(`${API}/rbac/roles/${r.id}`, { method: 'DELETE' }, 'eliminar el rol')}
                                                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-red-600 ml-auto"
                                                        ><Trash2 className="w-3.5 h-3.5" /> Eliminar</button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* ── AUDITORÍA ──────────────────────────────────────── */}
            {tab === 'auditoria' && (
                <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <p className="text-xs text-gray-600">
                            Quién hizo qué y cuándo sobre los accesos de este sitio. El registro
                            <strong> sólo se agrega</strong>: corregir es escribir otro evento, nunca editar el anterior.
                            No guarda contraseñas, ni sus hashes, ni tokens.
                        </p>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-[32rem] overflow-y-auto">
                        {eventos.map((e, i) => (
                            <div key={String(e.id ?? i)} className="px-4 py-3 flex items-start gap-3 text-sm">
                                <span className="text-xs text-gray-400 whitespace-nowrap w-40 flex-shrink-0" data-no-translate>
                                    {fecha(e.createdAt as string)}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-gray-800">{String(e.kind)}</p>
                                    {!!e.detail && <p className="text-gray-500 text-xs mt-0.5">{String(e.detail)}</p>}
                                    <p className="text-gray-400 text-[11px] mt-0.5" data-no-translate>
                                        {String(e.actorLabel || e.actorKind || 'sistema')}
                                        {e.email ? ` → ${String(e.email)}` : ''}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {eventos.length === 0 && (
                            <p className="px-4 py-10 text-center text-gray-500 text-sm">Todavía no hay eventos registrados.</p>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
};

// ── El editor de un rol ──────────────────────────────────────────────

const EditorDeRol: React.FC<{
    rol: RoleRow;
    matrix: MatrixGroup[];
    grantable: string[];
    guardando: boolean;
    onCancel: () => void;
    onSave: (v: { name: string; description: string; permissions: string[] }) => void;
}> = ({ rol, matrix, grantable, guardando, onCancel, onSave }) => {
    const [name, setName] = useState(rol.name);
    const [description, setDescription] = useState(rol.description || '');
    const [permissions, setPermissions] = useState<string[]>(rol.permissions || []);

    // El resumen se DERIVA de los permisos marcados, no se escribe aparte: con
    // dos fuentes diría una cosa y la matriz otra, y quien asigna el rol
    // confiaría en la que se lee más fácil.
    const resumen = useMemo(() => describeRole(permissions), [permissions]);

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
                {rol.id ? `Editar «${rol.name}»` : 'Crear rol'}
            </h2>

            <div className="grid gap-4 md:grid-cols-2 mb-5">
                <label className="block">
                    <span className="text-sm font-medium text-gray-700">Nombre</span>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        maxLength={60}
                        placeholder="Equipo de Comunicaciones"
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue"
                    />
                </label>
                <label className="block">
                    <span className="text-sm font-medium text-gray-700">Descripción</span>
                    <input
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        maxLength={300}
                        placeholder="Responsables de contenido y comunicaciones del Distrito."
                        className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue"
                    />
                </label>
            </div>

            <div className="mb-3 rounded-lg bg-sky-50 border border-sky-200 p-3 text-sm text-sky-900">
                <strong className="font-medium">Con estos permisos: </strong>{resumen}
            </div>

            <MatrizDePermisos
                matrix={matrix}
                seleccion={permissions}
                grantable={grantable}
                onChange={setPermissions}
            />

            <div className="flex items-center gap-2 mt-5">
                <button
                    disabled={guardando || !name.trim()}
                    onClick={() => onSave({ name, description, permissions })}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-rotary-blue text-white rounded-lg hover:bg-rotary-navy disabled:opacity-50"
                >
                    {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {rol.id ? 'Guardar cambios' : 'Crear rol'}
                </button>
                <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                    Cancelar
                </button>
            </div>
        </div>
    );
};

export default UsersAndRoles;
