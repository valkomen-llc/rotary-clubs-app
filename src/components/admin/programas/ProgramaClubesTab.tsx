/**
 * Programas — pestaña «Clubes participantes» (v4.1280.0).
 * El distrito ve todas las activaciones; el club ve la suya, activa el
 * programa en su sitio, pone su contacto local y la desactiva cuando quiera.
 */
import { useCallback, useEffect, useState } from 'react';
import { Power, Save, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, can } from './api';
import { Tarjeta, Campo, campo, btnPrimario, btnSecundario, btnPeligro, Toggle, Chip, Cargando } from './ui';
import { dateTimeLabel, ACTIVATION_STATES as ACTIVATION_STATES_SPEC } from '../../../lib/programSpec';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

interface Vista { activations: any[]; links: any[]; myActivation: any; canActivate: boolean; availableLink: { id: string; districtNumber: number } | null }

const ProgramaClubesTab = ({ data, onChanged }: { data: Detalle; onChanged: () => void }) => {
    const [v, setV] = useState<Vista | null>(null);
    const [form, setForm] = useState<any>({ localContact: { name: '', role: '', email: '', phone: '', public: false }, localNote: '', showInMenu: true });
    const [guardando, setGuardando] = useState(false);
    const cargar = useCallback(async () => {
        try { const r = await api<Vista>(`/admin/${data.program.id}/clubs`); setV(r); if (r.myActivation) setForm({ localContact: { name: '', role: '', email: '', phone: '', public: false, ...(r.myActivation.localContact || {}) }, localNote: r.myActivation.localNote || '', showInMenu: r.myActivation.showInMenu !== false }); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cargar.'); }
    }, [data.program.id]);
    useEffect(() => { cargar(); }, [cargar]);

    const activar = async () => {
        setGuardando(true);
        try { await api(`/admin/${data.program.id}/clubs/activate`, { method: 'POST', body: JSON.stringify(form) }); toast.success('Programa activado en tu sitio. Ya aparece en /programas y en el menú.'); await cargar(); onChanged(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo activar.'); }
        finally { setGuardando(false); }
    };
    const guardarLocal = async (id: string) => {
        setGuardando(true);
        try { await api(`/admin/${data.program.id}/clubs/${id}`, { method: 'PUT', body: JSON.stringify(form) }); toast.success('Contacto local guardado.'); await cargar(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo guardar.'); }
        finally { setGuardando(false); }
    };
    const desactivar = async (id: string, nombre: string) => {
        const reason = window.prompt(`¿Desactivar la participación de ${nombre}? Puedes indicar un motivo (opcional):`);
        if (reason === null) return;
        try { await api(`/admin/${data.program.id}/clubs/${id}/deactivate`, { method: 'POST', body: JSON.stringify({ reason }) }); toast.success('Participación desactivada.'); await cargar(); onChanged(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo desactivar.'); }
    };

    if (!v) return <Cargando />;
    const propia = v.myActivation && v.myActivation.status === 'activa' ? v.myActivation : null;
    const esClub = can(data.grant, 'activateClub') && !data.scope.siteIsDistrict;

    return (
        <div className="space-y-5">
            {esClub ? (
                <Tarjeta title={propia ? `Activo en ${data.scope.siteName}` : `Activar en ${data.scope.siteName}`} actions={propia ? <Chip spec={ACTIVATION_STATES_SPEC} id="activa" /> : null}>
                    <p className="text-[11px] text-gray-500 mb-3">Al activar, tu sitio muestra el programa con el contenido central aprobado (una sola fuente: no se copia nada). Tú agregas el contacto local y puedes proponer actividades y aportes locales desde «Gestión de contenidos».</p>
                    {!propia && !v.canActivate ? <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{data.program.status !== 'activo' ? 'El programa todavía no está publicado por el distrito.' : 'Este programa no está disponible para el distrito de tu club.'}</p> : null}
                    <div className="grid md:grid-cols-2 gap-3">
                        <Campo label="Contacto local: nombre"><input className={campo} value={form.localContact.name} onChange={e => setForm({ ...form, localContact: { ...form.localContact, name: e.target.value } })} /></Campo>
                        <Campo label="Cargo"><input className={campo} value={form.localContact.role} onChange={e => setForm({ ...form, localContact: { ...form.localContact, role: e.target.value } })} /></Campo>
                        <Campo label="Correo"><input className={campo} value={form.localContact.email} onChange={e => setForm({ ...form, localContact: { ...form.localContact, email: e.target.value } })} /></Campo>
                        <Campo label="Teléfono"><input className={campo} value={form.localContact.phone} onChange={e => setForm({ ...form, localContact: { ...form.localContact, phone: e.target.value } })} /></Campo>
                        <Campo label="Nota local (se muestra en la página)" className="md:col-span-2"><textarea className={campo} rows={3} value={form.localNote} onChange={e => setForm({ ...form, localNote: e.target.value })} /></Campo>
                        <Toggle checked={form.localContact.public === true} onChange={val => setForm({ ...form, localContact: { ...form.localContact, public: val } })} label="Publicar el contacto local" />
                        <Toggle checked={form.showInMenu !== false} onChange={val => setForm({ ...form, showInMenu: val })} label="Mostrar en el menú del sitio" />
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end mt-4">
                        {propia ? <>
                            <button type="button" className={btnPeligro} onClick={() => desactivar(propia.id, data.scope.siteName)}><Power className="w-4 h-4" /> Desactivar participación</button>
                            <button type="button" className={btnPrimario} disabled={guardando} onClick={() => guardarLocal(propia.id)}><Save className="w-4 h-4" /> Guardar contacto local</button>
                        </> : v.canActivate ? <button type="button" className={btnPrimario} disabled={guardando} onClick={activar}><Power className="w-4 h-4" /> Activar en nuestro sitio</button> : null}
                    </div>
                </Tarjeta>
            ) : null}

            {can(data.grant, 'manageClubs') ? (
                <Tarjeta title={<span className="flex items-center gap-2"><Users className="w-4 h-4 text-rotary-blue" /> Activaciones</span>}>
                    {v.activations.length === 0 ? <p className="text-sm text-gray-500">Ningún club ha activado el programa todavía. Los clubes lo activan desde su propio panel (Programas → Clubes participantes) o lo piden con el formulario «Mi club quiere participar».</p> : (
                        <ul className="divide-y divide-gray-100">
                            {v.activations.map((a: any) => (
                                <li key={a.id} className="py-2 flex flex-wrap items-center gap-3">
                                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 flex items-center gap-2">{a.clubName} <Chip spec={ACTIVATION_STATES_SPEC} id={a.status} /></p><p className="text-xs text-gray-500">Distrito {a.districtNumber} · activado {dateTimeLabel(a.activatedAt)}{a.deactivatedAt ? ` · desactivado ${dateTimeLabel(a.deactivatedAt)}` : ''} · {a.localItems} contenidos locales · {a.originRequests} solicitudes atribuidas</p></div>
                                    {a.status === 'activa' ? <button type="button" className={btnSecundario} onClick={() => desactivar(a.id, a.clubName)}><Power className="w-4 h-4" /> Desactivar</button> : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </Tarjeta>
            ) : null}
        </div>
    );
};

export default ProgramaClubesTab;
