/**
 * Programas — pestaña «Biblioteca de contenidos» (v4.1280.0).
 * El contenido VIVO (publicado o archivado) por tipo, con sus versiones.
 * Nada se edita acá: proponer un cambio o un retiro abre el formato de
 * «Gestión de contenidos», que pasa por el flujo editorial.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, History, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { api, qs } from './api';
import { Tarjeta, campo, btnSecundario, Drawer, Paginacion, Cargando } from './ui';
import { CONTENT_KINDS, CONTENT_KIND_IDS, dateTimeLabel } from '../../../lib/programSpec';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

export const resumenDe = (kind: string, d: any = {}) => {
    if (kind === 'clinic') return [d.institution, d.city, d.region].filter(Boolean).join(' · ');
    if (kind === 'team') return [d.role, d.institution].filter(Boolean).join(' · ');
    if (kind === 'story') return [d.location, d.date].filter(Boolean).join(' · ');
    if (kind === 'resource') return [d.type, d.audience, d.source].filter(Boolean).join(' · ');
    if (kind === 'news') return [d.type, d.date, d.location].filter(Boolean).join(' · ');
    if (kind === 'indicator') return `${d.value || ''} ${d.unit || ''} · ${d.mode === 'periodo' ? 'período' : 'acumulado'} ${d.period || ''}`;
    if (kind === 'donation') return [d.receiver, d.url].filter(Boolean).join(' · ');
    return '';
};

const ProgramaContenidosTab = ({ data, onGoGestion }: { data: Detalle; onGoGestion: () => void }) => {
    const [kind, setKind] = useState('clinic');
    const [status, setStatus] = useState('publicado');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [lista, setLista] = useState<any>(null);
    const [abierto, setAbierto] = useState<any>(null);

    const cargar = useCallback(async () => {
        try { setLista(await api(`/admin/${data.program.id}/content?${qs({ kind, status, q, page, perPage: 30 })}`)); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cargar.'); }
    }, [data.program.id, kind, status, q, page]);
    useEffect(() => { cargar(); }, [cargar]);

    const abrir = async (id: string) => {
        try { setAbierto(await api(`/admin/${data.program.id}/content/${id}`)); }
        catch (e: any) { toast.error(e?.message || 'No se pudo abrir.'); }
    };
    const proponer = (c: any, operation: 'actualizar' | 'retirar') => {
        sessionStorage.setItem(`programa:${data.program.id}:prefill`, JSON.stringify({ kind: c.kind, operation, contentId: c.id, scopeType: c.scopeType, districtNumber: c.districtNumber || '', clubActivationId: c.clubActivationId || '', title: `${operation === 'retirar' ? 'Retirar' : 'Actualizar'}: ${c.title}`, payload: operation === 'retirar' ? {} : c.data }));
        setAbierto(null); onGoGestion();
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-1.5">
                {CONTENT_KIND_IDS.map(k => <button key={k} type="button" onClick={() => { setKind(k); setPage(1); }} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${kind === k ? 'bg-rotary-blue text-white border-rotary-blue' : 'bg-white text-gray-700 border-gray-200'}`}>{CONTENT_KINDS[k].plural} {data.counts[k] ? <span className="opacity-70">({data.counts[k]})</span> : null}</button>)}
            </div>
            <Tarjeta actions={<div className="flex gap-2"><input className={campo} placeholder="Buscar" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /><select className={campo} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="publicado">Publicados</option><option value="archivado">Archivados</option><option value="">Todos</option></select></div>} title={CONTENT_KINDS[kind].plural}>
                {!lista ? <Cargando /> : lista.rows.length === 0 ? (
                    <div className="text-sm text-gray-500 py-6 text-center">No hay registros de este tipo. <button type="button" className="text-rotary-blue font-semibold hover:underline" onClick={onGoGestion}>Proponer el primero desde Gestión de contenidos</button>.</div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {lista.rows.map((c: any) => (
                            <li key={c.id}><button type="button" onClick={() => abrir(c.id)} className="w-full text-left py-3 px-2 rounded-lg hover:bg-gray-50 flex flex-wrap items-center gap-3">
                                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-gray-900 truncate">{c.title}</span><span className="block text-xs text-gray-500">{resumenDe(c.kind, c.data)}</span></span>
                                <span className="text-[11px] text-gray-500">{c.scopeType === 'club' ? c.clubName || 'local' : c.scopeType === 'district' ? `D${c.districtNumber}` : 'central'} · v{c.version}</span>
                                {c.status === 'archivado' ? <span className="text-[11px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">Archivado</span> : c.publicVisible ? <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Visible</span> : <span className="text-[11px] text-amber-700 inline-flex items-center gap-1"><EyeOff className="w-3 h-3" /> No visible (sin autorización o activo)</span>}
                            </button></li>
                        ))}
                    </ul>
                )}
                {lista ? <Paginacion page={lista.page} total={lista.total} perPage={lista.perPage} onPage={setPage} /> : null}
            </Tarjeta>

            {abierto ? (
                <Drawer title={abierto.content.title} subtitle={`${CONTENT_KINDS[abierto.content.kind]?.label} · versión ${abierto.content.version} · publicado ${dateTimeLabel(abierto.content.publishedAt)}`} onClose={() => setAbierto(null)}
                    footer={abierto.content.status === 'publicado' ? <><button type="button" className={btnSecundario} onClick={() => proponer(abierto.content, 'retirar')}>Solicitar retiro</button><button type="button" className={btnSecundario} onClick={() => proponer(abierto.content, 'actualizar')}><PenLine className="w-4 h-4" /> Proponer actualización</button></> : null}>
                    <Tarjeta title="Datos vigentes">
                        <dl className="grid grid-cols-3 gap-y-2 gap-x-3 text-sm">
                            {Object.entries(abierto.content.data || {}).filter(([k, v]) => k !== 'internal' && v !== '' && v !== null && v !== false && !(Array.isArray(v) && !v.length)).map(([k, v]) => <Fragment key={k}>
                                <dt className="text-gray-500 truncate">{k}</dt><dd className="col-span-2 text-gray-900 whitespace-pre-line break-words">{typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v)}</dd>
                            </Fragment>)}
                        </dl>
                        {abierto.content.data?.internal && Object.values(abierto.content.data.internal).some(Boolean) ? <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900"><p className="font-semibold mb-1">Datos internos (no se publican)</p>{Object.entries(abierto.content.data.internal).filter(([, v]) => v).map(([k, v]) => <p key={k}>{k}: {String(v)}</p>)}</div> : null}
                        {abierto.content.requiresMedicalReview ? <p className="text-xs text-emerald-700 mt-3">Contenido clínico · aprobación médica {abierto.content.medicalReviewedAt ? dateTimeLabel(abierto.content.medicalReviewedAt) : 'no registrada'}</p> : null}
                    </Tarjeta>
                    <Tarjeta title={<span className="flex items-center gap-2"><History className="w-4 h-4" /> Versiones</span>}>
                        <ul className="text-sm divide-y divide-gray-100">{abierto.versions.map((v: any) => <li key={v.id} className="py-2"><span className="font-semibold">v{v.version}</span> · {dateTimeLabel(v.createdAt)} · {v.createdByName || '—'}{v.note ? ` · ${v.note}` : ''}</li>)}</ul>
                    </Tarjeta>
                </Drawer>
            ) : null}
        </div>
    );
};

export default ProgramaContenidosTab;
