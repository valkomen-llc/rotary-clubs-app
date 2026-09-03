import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import {
    Plus, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Loader2, Star,
    Pause, Play, Trash2, Bot, Stethoscope, Link2, ChevronDown, ChevronUp,
    Phone, Building2, ShieldCheck, X,
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

/**
 * Las cuentas de WhatsApp conectadas (v4.992, multi-WABA).
 *
 * Reemplaza al formulario suelto como PRIMERA cosa que se ve en Configuración:
 * hasta v4.991 el módulo trataba WhatsApp como una única configuración global y
 * no había dónde ver, ni mucho menos agregar, una segunda línea.
 *
 * ⚠️ EL TOKEN NO LLEGA ACÁ. El servidor manda `hasToken` y nada más, así que
 * esta pantalla no puede mostrarlo ni por descuido. El campo del formulario se
 * deja vacío al editar y sólo se manda si alguien escribe uno nuevo: es lo que
 * permite corregir el nombre de una línea sin volver a pegar la credencial.
 */

interface Agente {
    name: string | null;
    enabled: boolean;
    modelSlug?: string;
    source: 'connection' | 'site' | 'none' | 'connection_disabled';
    inherited: boolean;
}

interface Conexion {
    id: string;
    clubId: string;
    displayName: string;
    phoneNumber: string | null;
    phoneNumberId: string;
    wabaId: string;
    appId: string | null;
    webhookProvider: string;
    status: 'draft' | 'active' | 'paused' | 'error';
    statusLabel: string;
    isDefault: boolean;
    siteId: string | null;
    siteType: string | null;
    campaignId: string | null;
    projectId: string | null;
    eventId: string | null;
    notes: string | null;
    hasToken: boolean;
    hasVerifyToken: boolean;
    lastVerifiedAt: string | null;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    lastErrorAt: string | null;
    lastError: string | null;
    agent: Agente | null;
}

interface Aviso { field: string | null; message: string }

const VACIO = {
    displayName: '', phoneNumber: '', phoneNumberId: '', wabaId: '', appId: '',
    accessToken: '', verifyToken: '', projectId: '', campaignId: '', eventId: '',
    notes: '',
};

/** El aspecto de cada estado. La forma codifica el estado, no sólo el color. */
const PIEL: Record<string, { chip: string; icono: React.ReactNode }> = {
    active: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', icono: <CheckCircle2 className="w-3.5 h-3.5" /> },
    paused: { chip: 'bg-amber-50 text-amber-700 border-amber-200', icono: <Pause className="w-3.5 h-3.5" /> },
    error: { chip: 'bg-red-50 text-red-700 border-red-200', icono: <XCircle className="w-3.5 h-3.5" /> },
    draft: { chip: 'bg-gray-100 text-gray-600 border-gray-200', icono: <HelpCircle className="w-3.5 h-3.5" /> },
};

const fecha = (v: string | null) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return '—'; }
};

/** Qué representa esta línea, si representa algo además del sitio. */
const vinculo = (c: Conexion) => {
    if (c.projectId) return { etiqueta: 'Proyecto', valor: c.projectId };
    if (c.eventId) return { etiqueta: 'Evento', valor: c.eventId };
    if (c.campaignId) return { etiqueta: 'Campaña', valor: c.campaignId };
    return null;
};

const rotuloAgente = (a: Agente | null) => {
    if (!a || a.source === 'none') return { texto: 'Sin agente', tono: 'text-amber-700' };
    if (a.source === 'connection_disabled') return { texto: 'Agente propio, apagado', tono: 'text-amber-700' };
    if (a.source === 'site') return { texto: `${a.name || 'Asistente'} (del sitio)`, tono: 'text-gray-600' };
    return { texto: a.name || 'Asistente', tono: 'text-emerald-700' };
};

const WhatsAppConnections: React.FC<{ clubId?: string }> = ({ clubId }) => {
    const { token } = useAuth();
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [conexiones, setConexiones] = useState<Conexion[]>([]);
    const [webhook, setWebhook] = useState<{ url: string; note: string } | null>(null);
    const [abierta, setAbierta] = useState<string | null>(null);
    const [formulario, setFormulario] = useState<typeof VACIO | null>(null);
    const [editando, setEditando] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState<Aviso[]>([]);
    const [ocupada, setOcupada] = useState<string | null>(null);
    const [diagnostico, setDiagnostico] = useState<Record<string, any>>({});

    const cabeceras = useCallback(() => {
        const h: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (clubId) h['x-club-id'] = clubId;
        return h;
    }, [token, clubId]);

    /**
     * Ninguna respuesta se lee con `.json()` a ciegas: una página de error HTML
     * rompe el parseo y el error resultante no nombra ninguna capa (v4.946).
     */
    const leerJson = async (res: Response) => {
        const texto = await res.text();
        try { return JSON.parse(texto); }
        catch {
            throw new Error(
                `El servidor contestó ${res.status} y no era JSON ` +
                `(${res.headers.get('content-type') || 'sin tipo'}): ${texto.slice(0, 140)}`
            );
        }
    };

    const cargar = useCallback(async () => {
        setCargando(true); setError(null);
        try {
            const res = await fetch(`${API}/whatsapp/connections`, { headers: cabeceras() });
            const data = await leerJson(res);
            if (!res.ok) throw new Error(data.error || `El servidor contestó ${res.status}`);
            setConexiones(data.connections || []);
            setWebhook(data.webhook || null);
        } catch (e: any) {
            // El motivo a la vista, no un vacío: un listado vacío sin explicación
            // es indistinguible de «no hay ninguna cuenta» (v4.938).
            setError(e.message || 'No se pudieron cargar las cuentas conectadas.');
        } finally { setCargando(false); }
    }, [cabeceras]);

    useEffect(() => { cargar(); }, [cargar]);

    // ── Alta y edición ────────────────────────────────────────────────────
    const abrirNueva = () => { setEditando(null); setErrores([]); setFormulario({ ...VACIO }); };
    const abrirEdicion = (c: Conexion) => {
        setEditando(c.id); setErrores([]);
        setFormulario({
            displayName: c.displayName || '', phoneNumber: c.phoneNumber || '',
            phoneNumberId: c.phoneNumberId || '', wabaId: c.wabaId || '',
            appId: c.appId || '',
            // Vacío a propósito: el token no llega del servidor y dejarlo en
            // blanco es lo que permite editar el resto sin volver a pegarlo.
            accessToken: '', verifyToken: '',
            projectId: c.projectId || '', campaignId: c.campaignId || '',
            eventId: c.eventId || '', notes: c.notes || '',
        });
    };

    const guardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formulario) return;
        setGuardando(true); setErrores([]);
        try {
            const cuerpo: Record<string, string> = {};
            for (const [k, v] of Object.entries(formulario)) if (v) cuerpo[k] = v;
            const res = await fetch(
                editando ? `${API}/whatsapp/connections/${editando}` : `${API}/whatsapp/connections`,
                {
                    method: editando ? 'PUT' : 'POST',
                    headers: { ...cabeceras(), 'Content-Type': 'application/json' },
                    body: JSON.stringify(cuerpo),
                }
            );
            const data = await leerJson(res);
            if (!res.ok) {
                setErrores(data.errors || [{ field: null, message: data.error || 'No se pudo guardar.' }]);
                toast.error(data.error || 'No se pudo guardar.');
                return;
            }
            (data.warnings || []).forEach((w: Aviso) => toast.warning(w.message, { duration: 9000 }));
            toast.success(editando ? 'Cuenta actualizada' : 'Cuenta agregada. Verificá la conexión para activarla.');
            setFormulario(null); setEditando(null);
            cargar();
        } catch (e: any) {
            toast.error(e.message || 'Error de conexión');
        } finally { setGuardando(false); }
    };

    // ── Acciones sobre una fila ───────────────────────────────────────────
    const accion = async (id: string, ruta: string, opciones: RequestInit = {}, exito?: string) => {
        setOcupada(`${id}:${ruta}`);
        try {
            const res = await fetch(`${API}/whatsapp/connections/${id}${ruta}`, {
                method: 'POST', headers: { ...cabeceras(), 'Content-Type': 'application/json' }, ...opciones,
            });
            const data = await leerJson(res);
            if (!res.ok) {
                // La CAUSA técnica y qué hacer, no «no funciona» (regla del sitio).
                toast.error(
                    [data.cause?.title || data.error, data.cause?.fix, data.hint]
                        .filter(Boolean).join(' · '),
                    { duration: 12000 }
                );
                if (data.providerMessage) {
                    toast.message('Lo que contestó Meta', { description: data.providerMessage, duration: 12000 });
                }
                return null;
            }
            if (exito) toast.success(exito);
            if (data.note) toast.message('Qué implica', { description: data.note, duration: 9000 });
            cargar();
            return data;
        } catch (e: any) {
            toast.error(e.message || 'Error de conexión');
            return null;
        } finally { setOcupada(null); }
    };

    const verificar = (id: string) => accion(id, '/verify', {}, 'Meta aceptó la credencial');
    const suscribir = (id: string) => accion(id, '/subscribe', {}, 'Cuenta suscrita al webhook');
    const principal = (id: string) => accion(id, '/default', {}, 'Es la línea principal del sitio');
    const cambiarEstado = (id: string, status: string) =>
        accion(id, '/status', { body: JSON.stringify({ status }) },
            status === 'active' ? 'Cuenta activada' : 'Cuenta pausada');

    const desconectar = async (c: Conexion) => {
        // La confirmación DICE qué va a pasar, en vez de preguntar «¿estás
        // seguro?»: lo que hay que poder revisar es el hecho.
        const texto =
            `Desconectar «${c.displayName}» (${c.phoneNumber || c.phoneNumberId}).\n\n` +
            'Sus mensajes y conversaciones SE CONSERVAN: son el registro de lo que ocurrió.\n' +
            'Lo que deja de pasar es que esa línea reciba o responda.\n' +
            (c.isDefault ? '\nEs la línea principal del sitio, así que se ascenderá otra.\n' : '') +
            '\n¿Continuar?';
        if (!window.confirm(texto)) return;
        setOcupada(`${c.id}:del`);
        try {
            const res = await fetch(`${API}/whatsapp/connections/${c.id}`, {
                method: 'DELETE', headers: cabeceras(),
            });
            const data = await leerJson(res);
            if (!res.ok) { toast.error(data.error || 'No se pudo desconectar.'); return; }
            toast.success('Cuenta desconectada');
            if (data.note) toast.message('Qué pasó con el historial', { description: data.note, duration: 10000 });
            cargar();
        } catch (e: any) { toast.error(e.message); }
        finally { setOcupada(null); }
    };

    const diagnosticar = async (id: string) => {
        setOcupada(`${id}:diag`);
        try {
            const res = await fetch(`${API}/whatsapp/connections/${id}/diagnose`, { headers: cabeceras() });
            const data = await leerJson(res);
            if (!res.ok) { toast.error(data.error || 'No se pudo diagnosticar.'); return; }
            setDiagnostico((d) => ({ ...d, [id]: data }));
            setAbierta(id);
        } catch (e: any) { toast.error(e.message); }
        finally { setOcupada(null); }
    };

    // ── Pintado ───────────────────────────────────────────────────────────
    if (cargando) {
        return (
            <div className="flex items-center gap-3 p-8 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                Cargando las cuentas conectadas…
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Cabecera */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Phone className="w-5 h-5 text-emerald-600" />
                        Cuentas de WhatsApp conectadas
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                        Cada cuenta trabaja por separado: su número, sus credenciales, su agente y
                        sus conversaciones. Una respuesta sale siempre por la línea que recibió el
                        mensaje.
                    </p>
                </div>
                <button
                    onClick={abrirNueva}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >
                    <Plus className="w-4 h-4" /> Agregar cuenta
                </button>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <div className="font-semibold flex items-center gap-2">
                        <XCircle className="w-4 h-4" /> No se pudieron cargar las cuentas
                    </div>
                    <p className="mt-1">{error}</p>
                    <button onClick={cargar} className="mt-2 text-red-700 underline font-medium">
                        Reintentar
                    </button>
                </div>
            )}

            {/* El webhook es UNO. Se dice para que nadie configure uno por cuenta. */}
            {webhook && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                    <div className="font-semibold flex items-center gap-2">
                        <Link2 className="w-4 h-4" /> Un solo webhook para todas las cuentas
                    </div>
                    <p className="mt-1">{webhook.note}</p>
                    <code className="inline-block mt-2 px-2 py-1 rounded bg-white border border-sky-200 text-xs">
                        {webhook.url}
                    </code>
                </div>
            )}

            {/* Vacío: dice por qué está vacío y qué hacer */}
            {!error && conexiones.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
                    <Phone className="w-8 h-8 text-gray-300 mx-auto" />
                    <p className="mt-3 font-medium text-gray-700">Todavía no hay ninguna cuenta conectada</p>
                    <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
                        Con «Agregar cuenta» se conecta la primera. Vas a necesitar el ID del número,
                        el ID de la cuenta de WhatsApp Business (WABA) y un token de acceso, los tres
                        del panel de Meta Business.
                    </p>
                </div>
            )}

            {/* Las filas */}
            <div className="space-y-3">
                {conexiones.map((c) => {
                    const piel = PIEL[c.status] || PIEL.draft;
                    const v = vinculo(c);
                    const ag = rotuloAgente(c.agent);
                    const diag = diagnostico[c.id];
                    const esperando = (r: string) => ocupada === `${c.id}:${r}`;

                    return (
                        <div key={c.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                            <div className="p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold text-gray-900">{c.displayName}</span>
                                            {c.isDefault && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">
                                                    <Star className="w-3 h-3" /> Principal
                                                </span>
                                            )}
                                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${piel.chip}`}>
                                                {piel.icono} {c.statusLabel}
                                            </span>
                                            {!c.hasToken && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                                                    <AlertTriangle className="w-3 h-3" /> Sin credencial
                                                </span>
                                            )}
                                        </div>

                                        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-3">
                                            <div className="flex gap-1.5">
                                                <dt className="text-gray-400">Número</dt>
                                                <dd className="font-mono">{c.phoneNumber || `ID ${c.phoneNumberId}`}</dd>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <dt className="text-gray-400">WABA</dt>
                                                <dd className="font-mono">{c.wabaId}</dd>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <dt className="text-gray-400">Sitio</dt>
                                                <dd className="truncate">
                                                    <Building2 className="w-3 h-3 inline mr-1 -mt-0.5" />
                                                    {c.siteType === 'district' ? 'Distrito' : 'Club'} · {c.siteId || c.clubId}
                                                </dd>
                                            </div>
                                            {v && (
                                                <div className="flex gap-1.5">
                                                    <dt className="text-gray-400">{v.etiqueta}</dt>
                                                    <dd className="truncate">{v.valor}</dd>
                                                </div>
                                            )}
                                            <div className="flex gap-1.5">
                                                <dt className="text-gray-400">Agente</dt>
                                                <dd className={ag.tono}>
                                                    <Bot className="w-3 h-3 inline mr-1 -mt-0.5" />{ag.texto}
                                                </dd>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <dt className="text-gray-400">Última sincronización</dt>
                                                <dd>{fecha(c.lastVerifiedAt)}</dd>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <dt className="text-gray-400">Último entrante</dt>
                                                <dd>{fecha(c.lastInboundAt)}</dd>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <dt className="text-gray-400">Último saliente</dt>
                                                <dd>{fecha(c.lastOutboundAt)}</dd>
                                            </div>
                                        </dl>

                                        {c.lastError && (
                                            <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                                                <strong>Último error:</strong> {c.lastError}
                                            </p>
                                        )}
                                    </div>

                                    {/* Las acciones */}
                                    <div className="flex flex-wrap gap-2 shrink-0">
                                        <button onClick={() => verificar(c.id)} disabled={!!ocupada}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                            {esperando('/verify') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                            Verificar
                                        </button>
                                        <button onClick={() => diagnosticar(c.id)} disabled={!!ocupada}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                            {esperando('diag') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />}
                                            Diagnóstico
                                        </button>
                                        <button onClick={() => abrirEdicion(c)} disabled={!!ocupada}
                                            className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                            Editar
                                        </button>
                                        {c.status === 'active' ? (
                                            <button onClick={() => cambiarEstado(c.id, 'paused')} disabled={!!ocupada}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                                                <Pause className="w-3.5 h-3.5" /> Pausar
                                            </button>
                                        ) : (
                                            <button onClick={() => cambiarEstado(c.id, 'active')} disabled={!!ocupada}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-300 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                                                <Play className="w-3.5 h-3.5" /> Activar
                                            </button>
                                        )}
                                        {!c.isDefault && (
                                            <button onClick={() => principal(c.id)} disabled={!!ocupada}
                                                className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                                Definir como principal
                                            </button>
                                        )}
                                        <button onClick={() => suscribir(c.id)} disabled={!!ocupada}
                                            className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                            {esperando('/subscribe') ? 'Suscribiendo…' : 'Suscribir al webhook'}
                                        </button>
                                        <button onClick={() => desconectar(c)} disabled={!!ocupada}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-300 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                                            <Trash2 className="w-3.5 h-3.5" /> Desconectar
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* El diagnóstico, plegado */}
                            {diag && (
                                <div className="border-t border-gray-200 bg-gray-50">
                                    <button
                                        onClick={() => setAbierta(abierta === c.id ? null : c.id)}
                                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-700"
                                    >
                                        <span className="flex items-center gap-2">
                                            Diagnóstico de esta línea
                                            <span className="text-gray-400 font-normal">
                                                {diag.counts?.fail ? `${diag.counts.fail} fallo(s)` : ''}
                                                {diag.counts?.warn ? ` · ${diag.counts.warn} aviso(s)` : ''}
                                                {diag.counts?.unknown ? ` · ${diag.counts.unknown} sin comprobar` : ''}
                                            </span>
                                        </span>
                                        {abierta === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                    {abierta === c.id && (
                                        <ul className="px-4 pb-4 space-y-2">
                                            {(diag.checks || []).map((ch: any) => (
                                                <li key={ch.key} className="flex gap-2.5 text-xs">
                                                    <span className="mt-0.5 shrink-0">
                                                        {ch.state === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                                                        {ch.state === 'fail' && <XCircle className="w-4 h-4 text-red-600" />}
                                                        {ch.state === 'warn' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                                                        {/* `unknown` se pinta DISTINTO de «bien»: presentar «no se
                                                            pudo comprobar» como verde manda a buscar el problema
                                                            donde no está. */}
                                                        {ch.state === 'unknown' && <HelpCircle className="w-4 h-4 text-gray-400" />}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-gray-800">{ch.label}</p>
                                                        <p className="text-gray-600">{ch.detail}</p>
                                                        {ch.cause && (
                                                            <p className="mt-1 text-gray-700 bg-white border border-gray-200 rounded px-2 py-1.5">
                                                                <strong>{ch.cause.title}.</strong> {ch.cause.detail}
                                                                <br /><em>Qué hacer:</em> {ch.cause.fix}
                                                            </p>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* El formulario */}
            {formulario && (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
                    <form
                        onSubmit={guardar}
                        className="w-full max-w-2xl my-8 rounded-xl bg-white shadow-xl max-h-[calc(100vh-4rem)] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <h4 className="font-semibold text-gray-900">
                                {editando ? 'Editar cuenta de WhatsApp' : 'Agregar cuenta de WhatsApp'}
                            </h4>
                            <button type="button" onClick={() => setFormulario(null)}
                                className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {errores.length > 0 && (
                                <ul className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1 text-sm text-red-800">
                                    {errores.map((e, i) => <li key={i}>{e.message}</li>)}
                                </ul>
                            )}

                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Nombre de la conexión
                                </span>
                                <input
                                    value={formulario.displayName}
                                    onChange={(e) => setFormulario({ ...formulario, displayName: e.target.value })}
                                    placeholder="WhatsApp Feria de Proyectos"
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                                <span className="text-xs text-gray-500">
                                    Es lo que se lee al elegir desde qué línea se responde.
                                </span>
                            </label>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="block min-w-0">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        ID del número de teléfono
                                    </span>
                                    <input
                                        value={formulario.phoneNumberId}
                                        onChange={(e) => setFormulario({ ...formulario, phoneNumberId: e.target.value })}
                                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                    />
                                </label>
                                <label className="block min-w-0">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        ID de la WABA
                                    </span>
                                    <input
                                        value={formulario.wabaId}
                                        onChange={(e) => setFormulario({ ...formulario, wabaId: e.target.value })}
                                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                    />
                                </label>
                            </div>

                            <label className="block">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Token de acceso {editando && <span className="normal-case font-normal text-gray-400">— dejalo vacío para conservar el guardado</span>}
                                </span>
                                <input
                                    type="password"
                                    autoComplete="off"
                                    value={formulario.accessToken}
                                    onChange={(e) => setFormulario({ ...formulario, accessToken: e.target.value })}
                                    placeholder={editando ? '••••••••••••  (guardado)' : 'Token del usuario del sistema'}
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                />
                                <span className="text-xs text-gray-500">
                                    Se guarda cifrado y no vuelve a mostrarse. Necesita los permisos
                                    <code className="mx-1">whatsapp_business_messaging</code> para enviar y
                                    <code className="mx-1">whatsapp_business_management</code> para suscribir la cuenta.
                                </span>
                            </label>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="block min-w-0">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        ID de la aplicación <span className="normal-case font-normal text-gray-400">(opcional)</span>
                                    </span>
                                    <input
                                        value={formulario.appId}
                                        onChange={(e) => setFormulario({ ...formulario, appId: e.target.value })}
                                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                    />
                                </label>
                                <label className="block min-w-0">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Token de verificación <span className="normal-case font-normal text-gray-400">(opcional)</span>
                                    </span>
                                    <input
                                        type="password"
                                        autoComplete="off"
                                        value={formulario.verifyToken}
                                        onChange={(e) => setFormulario({ ...formulario, verifyToken: e.target.value })}
                                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                    />
                                    <span className="text-xs text-gray-500">
                                        Con una sola aplicación de Meta no hace falta: lo resuelve la
                                        configuración de la aplicación.
                                    </span>
                                </label>
                            </div>

                            <fieldset className="rounded-lg border border-gray-200 p-4">
                                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Qué representa esta línea <span className="normal-case font-normal text-gray-400">(opcional)</span>
                                </legend>
                                <p className="text-xs text-gray-500 mb-3">
                                    Los tres son opcionales y lo normal es dejarlos vacíos: una línea
                                    institucional del sitio no representa un proyecto ni un evento. Para
                                    la Feria de Proyectos, el identificador de su proyecto.
                                </p>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    {(['projectId', 'campaignId', 'eventId'] as const).map((k) => (
                                        <label key={k} className="block min-w-0">
                                            <span className="text-xs text-gray-500">
                                                {k === 'projectId' ? 'Proyecto' : k === 'campaignId' ? 'Campaña' : 'Evento'}
                                            </span>
                                            <input
                                                value={formulario[k]}
                                                onChange={(e) => setFormulario({ ...formulario, [k]: e.target.value })}
                                                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </fieldset>

                            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                Una cuenta nueva queda en <strong>borrador</strong>: no recibe ni responde
                                hasta que se verifique contra Meta. Es a propósito — una línea a medio
                                configurar que empieza a contestar es peor que una que todavía no está.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
                            <button type="button" onClick={() => setFormulario(null)}
                                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-white">
                                Cancelar
                            </button>
                            <button type="submit" disabled={guardando}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
                                {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editando ? 'Guardar cambios' : 'Agregar cuenta'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default WhatsAppConnections;
