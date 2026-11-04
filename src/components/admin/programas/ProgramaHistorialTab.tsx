/**
 * Programas — pestaña «Historial y métricas» (v4.1280.0).
 * Auditoría (quién, cuándo, qué) y métricas digitales sin datos personales.
 * Se distingue actividad digital (visitas, clics, formularios) de la gestión
 * de solicitudes (estados, primer contacto); nunca se infieren resultados
 * asistenciales.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, can, qs } from './api';
import { Tarjeta, campo, Paginacion, Cargando } from './ui';
import { dateTimeLabel, REQUEST_STATES } from '../../../lib/programSpec';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

const ENTIDADES = [['', 'Todo'], ['program', 'Programa'], ['link', 'Vinculaciones'], ['activation', 'Activaciones'], ['member', 'Responsables'], ['change_request', 'Solicitudes de cambio'], ['public_request', 'Solicitudes públicas'], ['file', 'Archivos'], ['notification', 'Notificaciones']];

const ProgramaHistorialTab = ({ data }: { data: Detalle }) => {
    const [audit, setAudit] = useState<{ rows: any[]; total: number } | null>(null);
    const [page, setPage] = useState(1);
    const [entidad, setEntidad] = useState('');
    const [metrics, setMetrics] = useState<any>(null);
    const [rango, setRango] = useState({ from: '', to: '' });

    const cargarAudit = useCallback(async () => {
        if (!can(data.grant, 'viewAudit')) return;
        try { setAudit(await api(`/admin/${data.program.id}/audit?${qs({ page, perPage: 50, entityType: entidad })}`)); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cargar el historial.'); }
    }, [data, page, entidad]);
    const cargarMetrics = useCallback(async () => {
        if (!can(data.grant, 'viewMetrics')) return;
        try { setMetrics(await api(`/admin/${data.program.id}/metrics?${qs(rango)}`)); }
        catch (e: any) { toast.error(e?.message || 'No se pudieron cargar las métricas.'); }
    }, [data, rango]);
    useEffect(() => { cargarAudit(); }, [cargarAudit]);
    useEffect(() => { cargarMetrics(); }, [cargarMetrics]);

    const total = (k: string) => metrics?.totals?.find((t: any) => t.metric === k)?.total || 0;
    const uniques = metrics?.totals?.find((t: any) => t.metric === 'view')?.uniques || 0;

    return (
        <div className="space-y-5">
            {can(data.grant, 'viewMetrics') ? (
                <Tarjeta title="Métricas digitales" actions={<div className="flex gap-2"><input type="date" className={campo} value={rango.from} onChange={e => setRango({ ...rango, from: e.target.value })} aria-label="Desde" /><input type="date" className={campo} value={rango.to} onChange={e => setRango({ ...rango, to: e.target.value })} aria-label="Hasta" /></div>}>
                    {!metrics ? <Cargando /> : (<>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[['Visitas', total('view'), `${uniques} visitantes únicos`], ['Clics hacia clínicas', total('clinic_click'), ''], ['Clics en donar', total('donation_click'), 'interacciones, no donaciones'], ['Clics en recursos', total('resource_click'), ''],
                              ['Form. orientación', total('form_orientacion'), ''], ['Form. apoyo', total('form_apoyo'), ''], ['Form. club', total('form_club'), ''], ['Form. novedades', total('form_novedades'), '']].map(([l, n, h]) => (
                                <div key={String(l)} className="rounded-xl border border-gray-100 p-3"><p className="text-2xl font-bold text-gray-900">{n}</p><p className="text-xs text-gray-600">{l}</p>{h ? <p className="text-[11px] text-gray-400">{h}</p> : null}</div>
                            ))}
                        </div>
                        <div className="grid md:grid-cols-3 gap-4 mt-5">
                            <div className="rounded-xl border border-gray-100 p-3">
                                <p className="text-xs font-semibold text-gray-700 mb-2">Solicitudes por estado</p>
                                {(metrics.requestsByStatus || []).length === 0 ? <p className="text-xs text-gray-500">Sin solicitudes.</p> : <ul className="text-sm space-y-1">{metrics.requestsByStatus.map((r: any) => <li key={r.status} className="flex justify-between"><span>{REQUEST_STATES[r.status]?.label || r.status}</span><strong>{r.n}</strong></li>)}</ul>}
                            </div>
                            <div className="rounded-xl border border-gray-100 p-3">
                                <p className="text-xs font-semibold text-gray-700 mb-2">Tiempo hasta el primer contacto</p>
                                <p className="text-2xl font-bold text-gray-900">{metrics.firstContact?.avgHours != null ? `${metrics.firstContact.avgHours} h` : '—'}</p>
                                <p className="text-[11px] text-gray-400">promedio sobre {metrics.firstContact?.measured || 0} solicitudes con contacto</p>
                            </div>
                            <div className="rounded-xl border border-gray-100 p-3">
                                <p className="text-xs font-semibold text-gray-700 mb-2">Clubes activos</p>
                                <p className="text-2xl font-bold text-gray-900">{metrics.activeClubs}</p>
                                <p className="text-[11px] text-gray-400">con el programa activado en su sitio</p>
                            </div>
                        </div>
                        {(metrics.bySite || []).length ? <div className="mt-4"><p className="text-xs font-semibold text-gray-700 mb-1">Por sitio de origen</p><ul className="text-xs text-gray-600 grid md:grid-cols-2 gap-1">{metrics.bySite.map((b: any, i: number) => <li key={i}>{b.siteClubId || 'sin sitio'} · {metrics.labels?.[b.metric] || b.metric}: <strong>{b.total}</strong></li>)}</ul></div> : null}
                        <p className="text-[11px] text-gray-400 mt-4">Actividad digital, no resultados asistenciales. No se registran datos personales ni direcciones IP.</p>
                    </>)}
                </Tarjeta>
            ) : null}

            {can(data.grant, 'viewAudit') ? (
                <Tarjeta title="Historial y auditoría" actions={<select className={campo} value={entidad} onChange={e => { setEntidad(e.target.value); setPage(1); }}>{ENTIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}>
                    {!audit ? <Cargando /> : audit.rows.length === 0 ? <p className="text-sm text-gray-500">Sin eventos.</p> : (
                        <ul className="divide-y divide-gray-100 text-sm">
                            {audit.rows.map((r: any) => (
                                <li key={r.id} className="py-2 flex flex-wrap gap-x-3 gap-y-0.5">
                                    <span className="text-xs text-gray-400 w-36 shrink-0">{dateTimeLabel(r.createdAt)}</span>
                                    <span className="font-semibold text-gray-800">{r.actorName || 'Sistema'}</span>
                                    <span className="text-gray-600">{r.entityType} · {r.action}</span>
                                    {r.detail && Object.keys(r.detail).length ? <span className="text-xs text-gray-500 w-full md:w-auto">{Object.entries(r.detail).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ').slice(0, 300)}</span> : null}
                                </li>
                            ))}
                        </ul>
                    )}
                    {audit ? <Paginacion page={page} total={audit.total} perPage={50} onPage={setPage} /> : null}
                </Tarjeta>
            ) : null}
        </div>
    );
};

export default ProgramaHistorialTab;
