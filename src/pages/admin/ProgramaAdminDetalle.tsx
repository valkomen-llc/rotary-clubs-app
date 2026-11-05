/**
 * Programas — la ficha administrativa de un programa (v4.1280.0)
 *
 * `/admin/programas/:id?tab=…`. Las pestañas se pintan según lo que el
 * servidor dice que esta sesión puede hacer (`grant.abilities`); el servidor
 * vuelve a decidir en cada petición.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, RefreshCw, HeartHandshake } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../../components/admin/AdminLayout';
import { api, can, type Grant } from '../../components/admin/programas/api';
import { Chip, btnSecundario, Cargando } from '../../components/admin/programas/ui';
import { PROGRAM_STATES } from '../../lib/programSpec';
import ProgramaFichaTab from '../../components/admin/programas/ProgramaFichaTab';
import ProgramaVinculosTab from '../../components/admin/programas/ProgramaVinculosTab';
import ProgramaContenidosTab from '../../components/admin/programas/ProgramaContenidosTab';
import GestionContenidosPrograma from '../../components/admin/programas/GestionContenidosPrograma';
import ProgramaRevisionTab from '../../components/admin/programas/ProgramaRevisionTab';
import ProgramaSolicitudesTab from '../../components/admin/programas/ProgramaSolicitudesTab';
import ProgramaClubesTab from '../../components/admin/programas/ProgramaClubesTab';
import ProgramaHistorialTab from '../../components/admin/programas/ProgramaHistorialTab';

export interface Detalle {
    program: any; links: any[]; members: any[]; activations: any[]; myActivation: any; grant: Grant;
    counts: Record<string, number>; pendingChanges: { status: string; n: number }[]; requestsByStatus: { status: string; n: number }[];
    publishCheck: { ok: boolean; errors: { field: string; message: string }[] }; subscribers: number | null; catalogs: any;
    scope: { siteId: string | null; siteName: string; siteIsDistrict: boolean; districtNumbers: number[]; operator: boolean };
}

const TABS = [
    { id: 'ficha', label: 'Información', needs: ['view'] },
    { id: 'vinculos', label: 'Responsables y distritos', needs: ['manageMembers', 'manageLinks'] },
    { id: 'contenidos', label: 'Biblioteca de contenidos', needs: ['view'] },
    { id: 'gestion', label: 'Gestión de contenidos', needs: ['submit', 'localSubmit'] },
    { id: 'revision', label: 'Revisión editorial', needs: ['review', 'approve', 'medicalApprove', 'publish'] },
    { id: 'solicitudes', label: 'Solicitudes públicas', needs: ['manageRequests', 'viewRequestsSummary'] },
    { id: 'clubes', label: 'Clubes participantes', needs: ['manageClubs', 'activateClub'] },
    { id: 'historial', label: 'Historial y métricas', needs: ['viewAudit', 'viewMetrics'] },
];

const ProgramaAdminDetalle = () => {
    const { id = '' } = useParams();
    const [params, setParams] = useSearchParams();
    const [data, setData] = useState<Detalle | null>(null);
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true); setError('');
        try { setData(await api<Detalle>(`/admin/${id}`)); }
        catch (e: any) { setError(e?.message || 'No se pudo cargar el programa.'); }
        finally { setCargando(false); }
    }, [id]);
    useEffect(() => { cargar(); }, [cargar]);

    const tabs = useMemo(() => (data ? TABS.filter(t => t.needs.some(n => can(data.grant, n))) : []), [data]);
    const tab = tabs.find(t => t.id === params.get('tab'))?.id || tabs[0]?.id || 'ficha';
    const cambiarTab = (t: string) => { const next = new URLSearchParams(params); next.set('tab', t); next.delete('ref'); setParams(next, { replace: true }); };

    const vistaPrevia = async () => {
        if (!data) return;
        try {
            const r = await api<{ token: string; slug: string }>(`/admin/${id}/preview-token`, { method: 'POST' });
            window.open(`/programas/${encodeURIComponent(r.slug)}?t=${encodeURIComponent(r.token)}`, '_blank', 'noopener');
        } catch (e: any) { toast.error(e?.message || 'No se pudo abrir la vista previa.'); }
    };

    const pendientes = (data?.pendingChanges || []).filter(x => ['enviado', 'en_revision'].includes(x.status)).reduce((a, x) => a + x.n, 0);
    const nuevas = (data?.requestsByStatus || []).find(x => x.status === 'nueva')?.n || 0;

    return (
        <AdminLayout>
            <div className="space-y-5">
                <Link to="/admin/programas" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-rotary-blue"><ArrowLeft className="w-4 h-4" /> Programas</Link>
                {error ? <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm">{error}</p> : null}
                {!data ? <Cargando /> : (<>
                    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">{data.program.logoUrl ? <img src={data.program.logoUrl} alt="" className="w-full h-full object-contain" /> : <HeartHandshake className="w-6 h-6 text-gray-300" />}</div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-gray-900 truncate">{data.program.name}</h1><Chip spec={PROGRAM_STATES} id={data.program.status} /></div>
                                <p className="text-xs text-gray-500 mt-0.5">/programas/{data.program.slug}{data.scope.siteIsDistrict ? ` · Distrito ${data.scope.districtNumbers.join(', ')}` : data.scope.siteName ? ` · ${data.scope.siteName}` : ''}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" className={btnSecundario} onClick={cargar}><RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar</button>
                            <button type="button" className={btnSecundario} onClick={vistaPrevia}><Eye className="w-4 h-4" /> Vista previa</button>
                        </div>
                    </div>

                    <div role="tablist" className="flex gap-1.5 p-1.5 bg-gray-100/80 rounded-2xl overflow-x-auto">
                        {tabs.map(t => (
                            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => cambiarTab(t.id)}
                                className={`whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t.id ? 'bg-white shadow-sm border border-gray-200 text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>
                                {t.label}
                                {t.id === 'revision' && pendientes ? <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 rounded-full px-1.5 py-0.5">{pendientes}</span> : null}
                                {t.id === 'solicitudes' && nuevas && can(data.grant, 'manageRequests') ? <span className="ml-1.5 text-[10px] bg-sky-100 text-sky-800 rounded-full px-1.5 py-0.5">{nuevas}</span> : null}
                            </button>
                        ))}
                    </div>

                    {tab === 'ficha' ? <ProgramaFichaTab data={data} onChanged={cargar} /> : null}
                    {tab === 'vinculos' ? <ProgramaVinculosTab data={data} onChanged={cargar} /> : null}
                    {tab === 'contenidos' ? <ProgramaContenidosTab data={data} onGoGestion={() => cambiarTab('gestion')} /> : null}
                    {tab === 'gestion' ? <GestionContenidosPrograma data={data} onChanged={cargar} refInicial={params.get('ref')} /> : null}
                    {tab === 'revision' ? <ProgramaRevisionTab data={data} onChanged={cargar} refInicial={params.get('ref')} /> : null}
                    {tab === 'solicitudes' ? <ProgramaSolicitudesTab data={data} onChanged={cargar} refInicial={params.get('ref')} /> : null}
                    {tab === 'clubes' ? <ProgramaClubesTab data={data} onChanged={cargar} /> : null}
                    {tab === 'historial' ? <ProgramaHistorialTab data={data} /> : null}
                </>)}
            </div>
        </AdminLayout>
    );
};

export default ProgramaAdminDetalle;
