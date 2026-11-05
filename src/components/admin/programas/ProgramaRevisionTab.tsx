/**
 * Programas — pestaña «Revisión editorial» (v4.1280.0).
 * Las solicitudes de cambio y su flujo: Enviado → En revisión → Ajustes /
 * Aprobado → Publicado (acción aparte) / Archivado. La revisión médica es
 * un paso adicional sólo para lo clasificado como clínico. Lo publicado sigue
 * publicado hasta que se publica el reemplazo.
 */
import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Stethoscope, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, can, qs } from './api';
import { Tarjeta, Campo, campo, btnPrimario, btnSecundario, Chip, Drawer, Paginacion, Cargando, PrivateFileField } from './ui';
import { EDITORIAL_STATES, CHANGE_KINDS, OPERATIONS, SCOPE_TYPES, CONTENT_KINDS, dateTimeLabel, requestNeedsReason } from '../../../lib/programSpec';
import { resumenDe } from './ProgramaContenidosTab';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

const Comparacion = ({ actual, propuesto }: { actual: any; propuesto: any }) => {
    const keys = Array.from(new Set([...Object.keys(actual || {}), ...Object.keys(propuesto || {})])).filter(k => k !== 'internal' && k !== 'embed');
    return (
        <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-500"><th className="py-1 w-1/5">Campo</th><th className="py-1 w-2/5">Vigente</th><th className="py-1 w-2/5">Propuesto</th></tr></thead>
            <tbody>
                {keys.map(k => {
                    const a = actual?.[k]; const b = propuesto?.[k];
                    const same = JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
                    const show = (v: any) => (v === undefined || v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
                    return <tr key={k} className={`border-t border-gray-100 align-top ${same ? 'text-gray-500' : 'bg-amber-50/60 text-gray-900'}`}><td className="py-1 pr-2 font-semibold">{k}</td><td className="py-1 pr-2 whitespace-pre-line break-words">{show(a)}</td><td className="py-1 whitespace-pre-line break-words">{show(b)}</td></tr>;
                })}
            </tbody>
        </table>
    );
};

const ProgramaRevisionTab = ({ data, onChanged, refInicial }: { data: Detalle; onChanged: () => void; refInicial?: string | null }) => {
    const [lista, setLista] = useState<any>(null);
    const [f, setF] = useState({ status: '', kind: '', scope: '', q: '', page: 1 });
    const [abierta, setAbierta] = useState<any>(null);
    const [motivo, setMotivo] = useState('');
    const [notaMedica, setNotaMedica] = useState('');

    const cargar = useCallback(async () => {
        try { setLista(await api(`/admin/${data.program.id}/changes?${qs(f)}`)); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cargar.'); }
    }, [data.program.id, f]);
    useEffect(() => { cargar(); }, [cargar]);
    const abrir = useCallback(async (ref: string) => {
        try { setAbierta(await api(`/admin/${data.program.id}/changes/${encodeURIComponent(ref)}`)); setMotivo(''); setNotaMedica(''); }
        catch (e: any) { toast.error(e?.message || 'No se pudo abrir.'); }
    }, [data.program.id]);
    useEffect(() => { if (refInicial) abrir(refInicial); }, [refInicial, abrir]);

    const accion = async (path: string, body: any, ok: string) => {
        try { await api(`/admin/${data.program.id}/changes/${abierta.request.id}/${path}`, { method: 'POST', body: JSON.stringify(body) }); toast.success(ok); await abrir(abierta.request.publicRef); cargar(); onChanged(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo completar.', { duration: 7000 }); }
    };
    const facet = (s: string) => (lista?.facets || []).find((x: any) => x.status === s)?.n || 0;

    if (!lista) return <Cargando />;
    const r = abierta?.request;
    const rol = (k: string) => CHANGE_KINDS.find(x => x.id === k)?.label || k;

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                {Object.values(EDITORIAL_STATES).map(s => <button key={s.id} type="button" onClick={() => setF(p => ({ ...p, status: p.status === s.id ? '' : s.id, page: 1 }))} className={`rounded-2xl border bg-white p-3 text-left ${f.status === s.id ? 'border-rotary-blue' : 'border-gray-100'}`}><p className="text-xl font-bold text-gray-900">{facet(s.id)}</p><p className="text-[11px] text-gray-600">{s.label}</p></button>)}
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 grid md:grid-cols-4 gap-3">
                <input className={campo} placeholder="Buscar por título o referencia" value={f.q} onChange={e => setF(p => ({ ...p, q: e.target.value, page: 1 }))} />
                <select className={campo} value={f.kind} onChange={e => setF(p => ({ ...p, kind: e.target.value, page: 1 }))}><option value="">Todos los tipos</option>{CHANGE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
                <select className={campo} value={f.scope} onChange={e => setF(p => ({ ...p, scope: e.target.value, page: 1 }))}><option value="">Todos los alcances</option>{SCOPE_TYPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            </div>
            <Tarjeta title={<span className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-rotary-blue" /> Solicitudes de cambio</span>}>
                {lista.rows.length === 0 ? <p className="text-sm text-gray-500">No hay solicitudes con ese filtro.</p> : (
                    <ul className="divide-y divide-gray-100">
                        {lista.rows.map((x: any) => (
                            <li key={x.id}><button type="button" onClick={() => abrir(x.publicRef)} className="w-full text-left py-3 px-2 rounded-lg hover:bg-gray-50 flex flex-wrap items-center gap-3">
                                <span className="font-mono text-xs text-gray-500">{x.publicRef}</span>
                                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-gray-900 truncate">{x.title}</span><span className="block text-xs text-gray-500">{rol(x.kind)} · {OPERATIONS.find(o => o.id === x.operation)?.label} · {SCOPE_TYPES.find(s => s.id === x.scopeType)?.label}{x.requiresMedicalReview ? ' · clínico' : ''}</span></span>
                                <span className="text-xs text-gray-500">{x.submittedByName || x.responsibleName}</span>
                                {x.requiresMedicalReview ? <span className={`text-[11px] rounded-full px-2 py-0.5 ${x.medicalReviewedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{x.medicalReviewedAt ? 'Médico: aprobado' : 'Médico: pendiente'}</span> : null}
                                <Chip spec={EDITORIAL_STATES} id={x.status} />
                                <span className="text-xs text-gray-400">{dateTimeLabel(x.updatedAt)}</span>
                            </button></li>
                        ))}
                    </ul>
                )}
                <Paginacion page={lista.page} total={lista.total} perPage={lista.perPage} onPage={p => setF(x => ({ ...x, page: p }))} />
            </Tarjeta>

            {abierta ? (
                <Drawer wide title={`${r.publicRef} · ${r.title}`} subtitle={`${rol(r.kind)} · ${OPERATIONS.find(o => o.id === r.operation)?.label} · ${SCOPE_TYPES.find(s => s.id === r.scopeType)?.label}${r.districtNumber ? ` D${r.districtNumber}` : ''} · enviada por ${r.submittedByName || r.responsibleName} ${dateTimeLabel(r.submittedAt)}`} onClose={() => setAbierta(null)}
                    footer={<>
                        {abierta.next.map((n: any) => <button key={n.id} type="button" className={btnSecundario} onClick={() => { if (requestNeedsReason(n.id) && motivo.trim().length < 5) { toast.error('Escribe el motivo u observación.'); return; } accion('status', { to: n.id, reason: motivo }, `Estado: ${n.label}.`); }}>{n.label}</button>)}
                        {abierta.canPublish || (can(data.grant, 'approve') && can(data.grant, 'publish') && ['enviado', 'en_revision'].includes(r.status) && (!r.requiresMedicalReview || r.medicalReviewedAt)) ? <button type="button" className={btnPrimario} onClick={() => accion('publish', {}, 'Publicado. Ya es la versión vigente.')}><CheckCircle2 className="w-4 h-4" /> {r.status === 'aprobado' ? 'Publicar' : 'Aprobar y publicar'}</button> : null}
                    </>}>
                    <div className="flex flex-wrap items-center gap-2"><Chip spec={EDITORIAL_STATES} id={r.status} />{r.statusReason ? <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{r.statusReason}</span> : null}{r.requiresMedicalReview ? <span className={`text-[11px] rounded-full px-2 py-0.5 ${r.medicalReviewedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}><Stethoscope className="w-3 h-3 inline mr-1" />{r.medicalReviewedAt ? `Aprobación médica: ${r.medicalReviewedByName} ${dateTimeLabel(r.medicalReviewedAt)}` : 'Requiere aprobación del revisor médico'}</span> : <span className="text-[11px] text-gray-500">No requiere revisión médica</span>}</div>

                    {r.body ? <Tarjeta title="Contenido / justificación"><p className="text-sm text-gray-800 whitespace-pre-line">{r.body}</p></Tarjeta> : null}
                    <Tarjeta title={r.operation === 'retirar' ? 'Motivo del retiro' : 'Lo propuesto frente a lo vigente'}>
                        {r.operation === 'retirar' ? <p className="text-sm text-gray-800">{r.payload?.reason}</p>
                            : r.kind === 'info' ? <div className="space-y-3">{Object.entries(r.payload).filter(([k]) => k !== 'clinical').map(([k, v]: any) => <div key={k}><p className="text-xs font-semibold text-gray-700 mb-1">{k}</p><Comparacion actual={k === 'identity' ? data.program : data.program[k]} propuesto={v} /></div>)}</div>
                            : r.kind === 'correction' ? <dl className="text-sm space-y-2"><div><dt className="text-gray-500 text-xs">Dónde</dt><dd>{r.payload?.field}</dd></div><div><dt className="text-gray-500 text-xs">Dice</dt><dd className="whitespace-pre-line">{r.payload?.current}</dd></div><div><dt className="text-gray-500 text-xs">Debe decir</dt><dd className="whitespace-pre-line font-semibold">{r.payload?.proposed}</dd></div></dl>
                            : <><p className="text-xs text-gray-500 mb-2">{abierta.current ? `Registro vigente: ${abierta.current.title} (v${abierta.current.version}) · ${resumenDe(abierta.current.kind, abierta.current.data)}` : 'Registro nuevo.'}</p><Comparacion actual={abierta.current?.data || {}} propuesto={r.payload} /></>}
                        {r.approvedPayload && JSON.stringify(r.approvedPayload) !== JSON.stringify(r.payload) ? <p className="text-xs text-rose-700 mt-2">El contenido cambió después de la aprobación.</p> : null}
                    </Tarjeta>
                    <Tarjeta title="Responsable, alcance y autorizaciones">
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                            <dt className="text-gray-500">Responsable</dt><dd>{r.responsibleName} · {r.responsibleEmail}{r.responsiblePhone ? ` · ${r.responsiblePhone}` : ''}</dd>
                            <dt className="text-gray-500">Alcance solicitado</dt><dd>{r.requestedReach || '—'}</dd>
                            <dt className="text-gray-500">Fecha sugerida</dt><dd>{r.suggestedDate ? String(r.suggestedDate).slice(0, 10) : '—'}</dd>
                            <dt className="text-gray-500">Sección de destino</dt><dd>{r.targetSection || (CONTENT_KINDS[r.kind]?.section ?? '—')}</dd>
                            <dt className="text-gray-500">Observaciones</dt><dd className="whitespace-pre-line">{r.observations || '—'}</dd>
                            <dt className="text-gray-500">Autorizaciones</dt><dd>{[r.authorizations?.imageRights ? 'derechos de imagen' : '', r.authorizations?.dataConsent ? 'consentimiento de datos' : '', r.authorizations?.sourceVerified ? 'fuente verificada' : '', r.authorizations?.medicalReviewRequested ? 'pidió revisión médica' : ''].filter(Boolean).join(', ') || 'ninguna declarada'}{r.authorizations?.note ? ` · ${r.authorizations.note}` : ''}</dd>
                            <dt className="text-gray-500">Enlaces</dt><dd>{(r.links || []).length ? r.links.map((l: string, i: number) => <a key={i} href={l} target="_blank" rel="noopener noreferrer" className="block text-rotary-blue hover:underline break-all">{l}</a>) : '—'}</dd>
                        </dl>
                        {abierta.attachments.length ? <div className="mt-3 space-y-2"><p className="text-xs font-semibold text-gray-700">Comprobantes y adjuntos (privados)</p>{abierta.attachments.map((a: any) => <PrivateFileField key={a.id} programId={data.program.id} kind={a.kind} value={a} onChange={() => {}} label={a.label || a.kind} />)}</div> : null}
                    </Tarjeta>
                    {abierta.canMedical ? (
                        <Tarjeta title={<span className="flex items-center gap-2"><Stethoscope className="w-4 h-4" /> Revisión médica</span>}>
                            <Campo label="Nota (opcional)"><input className={campo} value={notaMedica} onChange={e => setNotaMedica(e.target.value)} /></Campo>
                            <div className="flex gap-2 mt-2">{r.medicalReviewedAt ? <button type="button" className={btnSecundario} onClick={() => accion('medical', { approved: false, note: notaMedica }, 'Aprobación médica retirada.')}>Retirar aprobación</button> : <button type="button" className={btnPrimario} onClick={() => accion('medical', { approved: true, note: notaMedica }, 'Aprobación médica registrada.')}><CheckCircle2 className="w-4 h-4" /> Aprobar como revisor médico</button>}</div>
                        </Tarjeta>
                    ) : null}
                    {abierta.next.length ? <Campo label="Observación (obligatoria para «Ajustes solicitados» y «Archivado»)"><textarea className={campo} rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} /></Campo> : null}
                    <Tarjeta title="Historial"><ul className="text-xs text-gray-600 space-y-1">{(r.history || []).map((h: any, i: number) => <li key={i}>{dateTimeLabel(h.at)} · {h.actorName || 'Sistema'} · {h.type}{h.from || h.to ? ` (${EDITORIAL_STATES[h.from]?.label || '—'} → ${EDITORIAL_STATES[h.to]?.label || '—'})` : ''}{h.detail ? ` · ${h.detail}` : ''}</li>)}</ul></Tarjeta>
                    {r.status === 'publicado' ? <p className="text-xs text-emerald-700 flex items-center gap-1"><Send className="w-3 h-3" /> Publicado {dateTimeLabel(r.publishedAt)}{r.resultVersion ? ` · versión ${r.resultVersion} del registro` : ''}.</p> : null}
                </Drawer>
            ) : null}
        </div>
    );
};

export default ProgramaRevisionTab;
