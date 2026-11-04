/**
 * Programas — pestaña «Solicitudes públicas» (v4.1280.0).
 * Modo completo (gestor de solicitudes / coordinador / distrito): datos de
 * contacto, asignación, estados, notas internas, historial.
 * Modo origen (club participante): sólo referencia, tipo, estado y fecha de
 * las solicitudes que llegaron desde su sitio. Nunca los datos de la persona.
 */
import { useCallback, useEffect, useState } from 'react';
import { Inbox, UserCheck, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { api, qs } from './api';
import { Tarjeta, Campo, campo, btnPrimario, btnSecundario, Chip, Drawer, Paginacion, Cargando } from './ui';
import { REQUEST_STATES, PUBLIC_REQUEST_TYPES, SUPPORT_TYPES, CLUB_PARTICIPATION_TYPES, CONTACT_MEANS, dateTimeLabel } from '../../../lib/programSpec';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

const label = (list: { id: string; label: string }[], id: string) => list.find(x => x.id === id)?.label || id || '—';

const DatosSolicitud = ({ r }: { r: any }) => {
    const d = r.data || {};
    if (r.type === 'orientacion') return (
        <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">Adulto responsable</dt><dd className="text-gray-900">{d.adultName}</dd>
            <dt className="text-gray-500">Ciudad / departamento</dt><dd className="text-gray-900">{[d.city, d.region].filter(Boolean).join(', ')}</dd>
            <dt className="text-gray-500">Medio de contacto</dt><dd className="text-gray-900">{label(CONTACT_MEANS, d.contactMeans)}: {d.contactMeans === 'correo' ? d.email : d.phone}</dd>
            <dt className="text-gray-500">Motivo general</dt><dd className="text-gray-900 whitespace-pre-line">{d.reason}</dd>
        </dl>
    );
    if (r.type === 'apoyo') return (
        <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">Quién</dt><dd className="text-gray-900">{d.entityKind === 'empresa' ? `Empresa: ${d.organization}` : 'Persona'}</dd>
            <dt className="text-gray-500">Contacto</dt><dd className="text-gray-900">{d.contactName} · {[d.email, d.phone].filter(Boolean).join(' · ')}</dd>
            <dt className="text-gray-500">Tipo de apoyo</dt><dd className="text-gray-900">{label(SUPPORT_TYPES, d.supportType)}</dd>
            <dt className="text-gray-500">Mensaje</dt><dd className="text-gray-900 whitespace-pre-line">{d.message || '—'}</dd>
        </dl>
    );
    return (
        <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">Club</dt><dd className="text-gray-900">{d.clubName} · Distrito {d.districtNumber}</dd>
            <dt className="text-gray-500">Responsable</dt><dd className="text-gray-900">{d.responsibleName} · {[d.email, d.phone].filter(Boolean).join(' · ')}</dd>
            <dt className="text-gray-500">Participación</dt><dd className="text-gray-900">{label(CLUB_PARTICIPATION_TYPES, d.participationType)}</dd>
            <dt className="text-gray-500">Mensaje</dt><dd className="text-gray-900 whitespace-pre-line">{d.message || '—'}</dd>
        </dl>
    );
};

const ProgramaSolicitudesTab = ({ data, onChanged, refInicial }: { data: Detalle; onChanged: () => void; refInicial?: string | null }) => {
    const [lista, setLista] = useState<any>(null);
    const [f, setF] = useState({ status: '', type: '', q: '', page: 1 });
    const [abierta, setAbierta] = useState<any>(null);
    const [nota, setNota] = useState('');
    const [motivo, setMotivo] = useState('');
    const [derivadoA, setDerivadoA] = useState('');
    const [asignar, setAsignar] = useState({ assigneeUserId: '', backupUserId: '' });

    const cargar = useCallback(async () => {
        try { setLista(await api(`/admin/${data.program.id}/requests?${qs(f)}`)); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cargar.'); }
    }, [data.program.id, f]);
    useEffect(() => { cargar(); }, [cargar]);

    const abrir = useCallback(async (ref: string) => {
        try { const r = await api(`/admin/${data.program.id}/requests/${encodeURIComponent(ref)}`); setAbierta(r); setAsignar({ assigneeUserId: r.request.assigneeUserId || '', backupUserId: r.request.backupUserId || '' }); setMotivo(''); setDerivadoA(''); }
        catch (e: any) { toast.error(e?.message || 'No se pudo abrir.'); }
    }, [data.program.id]);
    useEffect(() => { if (refInicial && lista?.mode === 'full') abrir(refInicial); }, [refInicial, lista?.mode, abrir]);

    const accion = async (path: string, body: any, ok: string) => {
        try { await api(`/admin/${data.program.id}/requests/${abierta.request.id}/${path}`, { method: 'POST', body: JSON.stringify(body) }); toast.success(ok); await abrir(abierta.request.publicRef); cargar(); onChanged(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo completar.'); }
    };

    if (!lista) return <Cargando />;

    if (lista.mode === 'origin') {
        return (
            <Tarjeta title={<span className="flex items-center gap-2"><Inbox className="w-4 h-4 text-rotary-blue" /> Solicitudes atribuidas a tu sitio</span>}>
                <p className="text-[11px] text-gray-500 mb-3">Las solicitudes que llegaron desde tu sitio se atribuyen a tu club. Los datos de la persona o familia los atiende el equipo del programa; aquí ves sólo referencia, tipo y estado.</p>
                {lista.rows.length === 0 ? <p className="text-sm text-gray-500">Todavía no han llegado solicitudes desde tu sitio.</p> : (
                    <ul className="divide-y divide-gray-100 text-sm">{lista.rows.map((r: any) => <li key={r.publicRef} className="py-2 flex flex-wrap gap-3 items-center"><span className="font-mono text-xs">{r.publicRef}</span><span className="flex-1">{r.typeLabel}</span><Chip spec={REQUEST_STATES} id={r.status} /><span className="text-xs text-gray-400">{dateTimeLabel(r.receivedAt)}</span></li>)}</ul>
                )}
            </Tarjeta>
        );
    }

    const facet = (status: string) => (lista.facets || []).filter((x: any) => x.status === status).reduce((a: number, x: any) => a + x.n, 0);

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.values(REQUEST_STATES).map(s => <button key={s.id} type="button" onClick={() => setF(p => ({ ...p, status: p.status === s.id ? '' : s.id, page: 1 }))} className={`rounded-2xl border bg-white p-3 text-left ${f.status === s.id ? 'border-rotary-blue' : 'border-gray-100'}`}><p className="text-2xl font-bold text-gray-900">{facet(s.id)}</p><p className="text-xs text-gray-600">{s.label}</p></button>)}
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 grid md:grid-cols-3 gap-3">
                <input className={campo} placeholder="Buscar por referencia o contenido" value={f.q} onChange={e => setF(p => ({ ...p, q: e.target.value, page: 1 }))} />
                <select className={campo} value={f.type} onChange={e => setF(p => ({ ...p, type: e.target.value, page: 1 }))}><option value="">Todos los tipos</option>{Object.values(PUBLIC_REQUEST_TYPES).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
                <p className="text-[11px] text-gray-500 self-center">Suscritos a novedades: {data.subscribers ?? '—'} (consentimiento aparte).</p>
            </div>
            <Tarjeta>
                {lista.rows.length === 0 ? <p className="text-sm text-gray-500">No hay solicitudes con ese filtro.</p> : (
                    <ul className="divide-y divide-gray-100">
                        {lista.rows.map((r: any) => (
                            <li key={r.id}><button type="button" onClick={() => abrir(r.publicRef)} className="w-full text-left py-3 flex flex-wrap items-center gap-3 hover:bg-gray-50 rounded-lg px-2">
                                <span className="font-mono text-xs text-gray-500">{r.publicRef}</span>
                                <span className="text-sm font-semibold text-gray-900">{PUBLIC_REQUEST_TYPES[r.type]?.label}</span>
                                <span className="text-xs text-gray-500 flex-1">{r.summary}{r.originClubName ? ` · desde ${r.originClubName}` : ''}</span>
                                <span className="text-xs text-gray-500">{r.assigneeName ? `→ ${r.assigneeName}` : 'sin responsable'}</span>
                                <Chip spec={REQUEST_STATES} id={r.status} />
                                <span className="text-xs text-gray-400">{dateTimeLabel(r.createdAt)}</span>
                            </button></li>
                        ))}
                    </ul>
                )}
                <Paginacion page={lista.page} total={lista.total} perPage={lista.perPage} onPage={p => setF(x => ({ ...x, page: p }))} />
            </Tarjeta>

            {abierta ? (
                <Drawer title={`Solicitud ${abierta.request.publicRef}`} subtitle={`${PUBLIC_REQUEST_TYPES[abierta.request.type]?.label} · recibida ${dateTimeLabel(abierta.request.createdAt)}${abierta.request.originClubName ? ` · desde ${abierta.request.originClubName}` : ' · desde el sitio del distrito'}`} onClose={() => setAbierta(null)}>
                    <div className="flex items-center gap-2"><Chip spec={REQUEST_STATES} id={abierta.request.status} />{abierta.request.firstContactAt ? <span className="text-xs text-gray-500">Primer contacto: {dateTimeLabel(abierta.request.firstContactAt)}</span> : null}{abierta.request.closedAt ? <span className="text-xs text-gray-500">Cerrada: {abierta.request.closeReason}</span> : null}</div>
                    <Tarjeta title="Datos de la solicitud (privados)"><DatosSolicitud r={abierta.request} /><p className="text-[11px] text-gray-400 mt-3">Consentimiento registrado {dateTimeLabel(abierta.request.consentAt)}. Esta consulta queda en la auditoría.</p></Tarjeta>
                    <Tarjeta title={<span className="flex items-center gap-2"><UserCheck className="w-4 h-4" /> Responsable</span>}>
                        <div className="grid grid-cols-2 gap-2">
                            <select className={campo} value={asignar.assigneeUserId} onChange={e => setAsignar({ ...asignar, assigneeUserId: e.target.value })}><option value="">Elegir responsable…</option>{abierta.assignees.filter((a: any) => a.userId).map((a: any) => <option key={a.userId} value={a.userId}>{a.name || a.email}</option>)}</select>
                            <select className={campo} value={asignar.backupUserId} onChange={e => setAsignar({ ...asignar, backupUserId: e.target.value })}><option value="">Alterno (opcional)…</option>{abierta.assignees.filter((a: any) => a.userId).map((a: any) => <option key={a.userId} value={a.userId}>{a.name || a.email}</option>)}</select>
                        </div>
                        <div className="flex gap-2 mt-2"><button type="button" className={btnPrimario} onClick={() => accion('assign', asignar, 'Solicitud asignada.')} disabled={!asignar.assigneeUserId}>Asignar</button><button type="button" className={btnSecundario} onClick={() => accion('assign', { assignToMe: true }, 'Te la asignaste.')}>Asignármela</button></div>
                        <p className="text-xs text-gray-500 mt-2">Actual: {abierta.request.assigneeName || 'sin responsable'}{abierta.request.backupName ? ` · alterno ${abierta.request.backupName}` : ''}</p>
                    </Tarjeta>
                    <Tarjeta title="Cambiar estado">
                        <div className="flex flex-wrap gap-2">{abierta.next.map((n: any) => <button key={n.id} type="button" className={btnSecundario} onClick={() => { if (n.id === 'cerrada' && motivo.trim().length < 3) { toast.error('Indica el motivo de cierre.'); return; } accion('status', { to: n.id, reason: motivo, derivedTo: derivadoA }, `Estado: ${n.label}.`); }}>{n.label}</button>)}</div>
                        <div className="grid grid-cols-2 gap-2 mt-3"><Campo label="Motivo (cierre)"><input className={campo} value={motivo} onChange={e => setMotivo(e.target.value)} /></Campo><Campo label="Derivada a"><input className={campo} value={derivadoA} onChange={e => setDerivadoA(e.target.value)} placeholder="Institución o equipo" /></Campo></div>
                    </Tarjeta>
                    <Tarjeta title={<span className="flex items-center gap-2"><StickyNote className="w-4 h-4" /> Notas internas</span>}>
                        <ul className="space-y-2 text-sm">{(abierta.request.notes || []).map((n: any, i: number) => <li key={i} className="rounded-xl bg-gray-50 p-2"><p className="text-xs text-gray-500">{n.byName} · {dateTimeLabel(n.at)}</p><p className="text-gray-800 whitespace-pre-line">{n.text}</p></li>)}</ul>
                        <div className="flex gap-2 mt-2"><input className={campo} value={nota} onChange={e => setNota(e.target.value)} placeholder="Añadir nota…" /><button type="button" className={btnSecundario} onClick={async () => { if (nota.trim().length < 2) return; await accion('notes', { text: nota }, 'Nota guardada.'); setNota(''); }}>Guardar</button></div>
                    </Tarjeta>
                    <Tarjeta title="Historial"><ul className="text-xs text-gray-600 space-y-1">{(abierta.request.history || []).map((h: any, i: number) => <li key={i}>{dateTimeLabel(h.at)} · {h.actorName || 'Sistema'} · {h.type}{h.to ? ` → ${REQUEST_STATES[h.to]?.label || h.to}` : ''}{h.detail ? ` · ${h.detail}` : ''}</li>)}</ul></Tarjeta>
                </Drawer>
            ) : null}
        </div>
    );
};

export default ProgramaSolicitudesTab;
