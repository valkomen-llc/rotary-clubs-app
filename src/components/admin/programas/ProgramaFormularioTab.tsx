/**
 * Programas — pestaña «Formulario institucional» (v4.1286.0)
 *
 * La bandeja de envíos del formulario público `/formulario-programas`, la
 * revisión POR ÍTEM (cada bloque de campos y cada registro, con lo vigente al
 * lado), y «Aplicar lo aprobado», que crea solicitudes del flujo editorial
 * (pestaña «Revisión editorial»). Nada se publica ni se sobrescribe desde
 * aquí. También: la configuración del formulario para ESTE programa, el banco
 * multimedia publicado y la correspondencia con los contenedores de la página.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Eye, Loader2, MessageCircle, RefreshCw, Send, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, can, qs } from './api';
import { Chip, Tarjeta, Campo, Toggle, Drawer, Paginacion, Cargando, campo, btnPrimario, btnSecundario, btnPeligro } from './ui';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

type Spec = Record<string, { id: string; label: string; tone: string }>;
const SUBTABS = [['envios', 'Envíos'], ['config', 'Configuración del formulario'], ['media', 'Banco multimedia'], ['mapa', 'Correspondencia']] as const;

const fmtFecha = (v?: string | null) => (v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Un valor propuesto, legible. Los archivos se muestran por nombre con su botón «Ver». */
const valorLegible = (v: any, files: Record<string, any>, opts?: { id: string; label: string }[]): string => {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (Array.isArray(v)) {
        if (v.every(x => x && typeof x === 'object' && 'id' in x)) return v.map(x => `${files[x.id]?.filename || 'archivo'}${x.description ? ` — ${x.description}` : ''}${x.alt ? ` (alt: ${x.alt})` : ''}`).join(' · ');
        return v.map(x => opts?.find(o => o.id === x)?.label || String(x)).join(', ');
    }
    if (typeof v === 'object') {
        if ('status' in v) return v.status === 'texto' ? v.text : v.status === 'no_aplica' ? 'No aplica' : 'Pendiente de suministrar';
        if ('x' in v && 'y' in v) return `Enfoque ${v.x}% · ${v.y}%`;
        return JSON.stringify(v);
    }
    return opts?.find(o => o.id === v)?.label || String(v);
};

const etiquetas = (form: any) => {
    const map: Record<string, { l: string; opt?: any[]; pub?: string; clinical?: boolean }> = {};
    for (const s of form?.sections || []) for (const f of s.fields || []) {
        map[`${s.k}.${f.k}`] = { l: f.l, opt: f.opt, pub: f.pub, clinical: f.clinical };
        for (const x of f.fields || []) map[`${s.k}.${f.k}.${x.k}`] = { l: x.l, opt: x.opt, pub: x.pub, clinical: x.clinical };
    }
    return map;
};

const FilaComparacion = ({ label, actual, propuesto, pub, clinical, fileIds, onVer }: { label: string; actual?: string; propuesto: string; pub?: string; clinical?: boolean; fileIds: string[]; onVer: (id: string) => void }) => {
    const cambia = actual !== undefined && String(actual || '') !== String(propuesto || '');
    return (
        <tr className="align-top border-t border-gray-100">
            <td className="py-2 pr-3 text-xs font-semibold text-gray-600 w-44">{label}{pub === 'interno' ? <span className="block text-[10px] text-gray-400">interno</span> : null}{clinical ? <span className="block text-[10px] text-violet-600">revisión médica</span> : null}</td>
            {actual !== undefined ? <td className="py-2 pr-3 text-xs text-gray-500 whitespace-pre-line max-w-xs">{actual || <span className="text-gray-300">vacío</span>}</td> : null}
            <td className={`py-2 text-xs whitespace-pre-line ${cambia ? 'text-gray-900 bg-amber-50/60' : 'text-gray-700'}`}>
                {propuesto}
                {fileIds.length ? <span className="flex flex-wrap gap-1 mt-1">{fileIds.map(id => <button key={id} type="button" onClick={() => onVer(id)} className="inline-flex items-center gap-1 text-[11px] text-rotary-blue font-semibold"><Eye className="w-3 h-3" /> Ver archivo</button>)}</span> : null}
            </td>
        </tr>
    );
};

const ItemRevision = ({ it, labels, files, decisions, onDecide, onVer, ocupado, editable }: { it: any; labels: ReturnType<typeof etiquetas>; files: Record<string, any>; decisions: Spec; onDecide: (key: string, status: string, note: string, sourceVerified: boolean) => void; onVer: (id: string) => void; ocupado: boolean; editable: boolean }) => {
    const [nota, setNota] = useState('');
    const [fuente, setFuente] = useState(Boolean(it.decision?.sourceVerified));
    const st = it.decision?.status || 'pendiente';
    const base = it.list ? `${it.section}.${it.list}` : it.section;
    const entries = Object.entries(it.data || {}).filter(([k]) => !k.startsWith('_'));
    const necesitaFuente = ['clinic', 'indicator', 'donation'].includes(it.target);
    const actualDe = (k: string) => {
        if (it.kind === 'fields') return valorLegible((it.current || {})[k], files, labels[`${base}.${k}`]?.opt);
        if (it.ref && it.current && !it.current.missing) return valorLegible((it.current.data || {})[k], files, labels[`${base}.${k}`]?.opt);
        return undefined;
    };
    const conActual = it.kind === 'fields' || (it.ref && it.current);
    return (
        <div className={`rounded-2xl border p-4 ${st === 'aplicado' ? 'border-blue-100 bg-blue-50/20' : st === 'aprobado' ? 'border-emerald-100' : st === 'ajustes' ? 'border-orange-200' : 'border-gray-100'} bg-white`}>
            <div className="flex flex-wrap items-center gap-2 justify-between">
                <p className="font-bold text-gray-900 text-sm">{it.label}{it.action && it.action !== 'crear' ? <span className="ml-2 text-[11px] font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">{it.action === 'retirar' ? 'Solicita retiro' : 'Actualiza un registro existente'}</span> : null}</p>
                <Chip spec={decisions} id={st} />
            </div>
            {it.ref && it.current?.missing ? <p className="text-xs text-rose-600 mt-1">El registro que se quiere actualizar ya no existe: aplícalo como nuevo o descártalo.</p> : null}
            <div className="overflow-x-auto mt-3">
                <table className="w-full min-w-[520px]">
                    <thead><tr className="text-[10px] uppercase tracking-wider text-gray-400 text-left"><th className="pb-1">Campo</th>{conActual ? <th className="pb-1">Actual</th> : null}<th className="pb-1">Propuesto</th></tr></thead>
                    <tbody>
                        {entries.map(([k, v]) => {
                            const meta = labels[`${base}.${k}`] || { l: k };
                            const ids = Array.isArray(v) && v.every((x: any) => x && typeof x === 'object' && 'id' in x) ? (v as any[]).map(x => x.id) : [];
                            return <FilaComparacion key={k} label={meta.l} pub={meta.pub} clinical={meta.clinical} actual={conActual ? actualDe(k) : undefined} propuesto={valorLegible(v, files, meta.opt)} fileIds={ids} onVer={onVer} />;
                        })}
                    </tbody>
                </table>
            </div>
            {st === 'aplicado' ? (
                <div className="mt-3 text-xs text-gray-600 space-y-1">
                    {(it.decision.changeRequests || []).map((c: any) => <p key={c.id}>Solicitud <b>{c.ref}</b> ({c.status === 'enviado' ? 'enviada a revisión editorial' : 'borrador en Gestión de contenidos'}{c.requiresMedicalReview ? ', requiere revisión médica' : ''})</p>)}
                    {it.decision.result ? <p>{it.decision.result}</p> : null}
                    {(it.decision.warnings || []).map((w: string, i: number) => <p key={i} className="text-amber-700">⚠ {w}</p>)}
                    <p className="text-gray-400">Aplicado por {it.decision.appliedBy || '—'} · {fmtFecha(it.decision.appliedAt)}</p>
                </div>
            ) : editable ? (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    {it.decision?.note ? <p className="text-xs text-gray-500">Nota: {it.decision.note} <span className="text-gray-400">({it.decision.byName}, {fmtFecha(it.decision.at)})</span></p> : null}
                    {it.decision?.previousNote ? <p className="text-xs text-orange-700">Ajuste pedido antes: {it.decision.previousNote}</p> : null}
                    {it.decision?.error ? <p className="text-xs text-rose-600">Error al aplicar: {it.decision.error}</p> : null}
                    {necesitaFuente ? <Toggle checked={fuente} onChange={setFuente} label="Verifiqué la fuente de este registro" hint="Obligatorio para aprobar sedes, indicadores y canales de donación." /> : null}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input className={campo} placeholder="Nota (obligatoria para pedir ajuste o descartar)" value={nota} onChange={e => setNota(e.target.value)} />
                        <div className="flex gap-2 shrink-0">
                            <button type="button" disabled={ocupado} className={btnPrimario} onClick={() => onDecide(it.key, 'aprobado', nota, fuente)}><CheckCircle2 className="w-4 h-4" /> Aprobar</button>
                            <button type="button" disabled={ocupado} className={btnSecundario} onClick={() => onDecide(it.key, 'ajustes', nota, fuente)}>Pedir ajuste</button>
                            <button type="button" disabled={ocupado} className={btnPeligro} onClick={() => onDecide(it.key, 'descartado', nota, fuente)}><XCircle className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

const DetalleEnvio = ({ programId, intakeId, onClose, onChanged, puedeRevisar }: { programId: string; intakeId: string; onClose: () => void; onChanged: () => void; puedeRevisar: boolean }) => {
    const [d, setD] = useState<any>(null);
    const [ocupado, setOcupado] = useState(false);
    const [nota, setNota] = useState('');
    const [enlace, setEnlace] = useState<{ link: string; emailSent: boolean } | null>(null);
    const cargar = useCallback(async () => { try { setD(await api(`/admin/${programId}/intakes/${intakeId}`)); } catch (e: any) { toast.error(e?.message); } }, [programId, intakeId]);
    useEffect(() => { cargar(); }, [cargar]);
    const labels = useMemo(() => etiquetas(d?.form), [d]);
    const files = useMemo(() => Object.fromEntries((d?.files || []).map((f: any) => [f.id, f])), [d]);
    const ver = async (fid: string) => { try { const r = await api<{ url: string }>(`/admin/${programId}/intakes/${intakeId}/files/${fid}/url`); window.open(r.url, '_blank', 'noopener'); } catch (e: any) { toast.error(e?.message); } };
    const decidir = async (key: string, status: string, note: string, sourceVerified: boolean) => {
        setOcupado(true);
        try { await api(`/admin/${programId}/intakes/${intakeId}/items`, { method: 'POST', body: JSON.stringify({ key, status, note, sourceVerified }) }); await cargar(); onChanged(); }
        catch (e: any) { toast.error(e?.message); } finally { setOcupado(false); }
    };
    const estado = async (to: string) => {
        setOcupado(true);
        try {
            const r = await api<any>(`/admin/${programId}/intakes/${intakeId}/status`, { method: 'POST', body: JSON.stringify({ to, note: nota }) });
            if (r.link) setEnlace({ link: r.link, emailSent: r.emailSent });
            setNota(''); await cargar(); onChanged();
            toast.success('Estado actualizado.');
        } catch (e: any) { toast.error(e?.message); } finally { setOcupado(false); }
    };
    const aplicar = async () => {
        setOcupado(true);
        try {
            const r = await api<any>(`/admin/${programId}/intakes/${intakeId}/apply`, { method: 'POST', body: JSON.stringify({}) });
            const crs = r.results.flatMap((x: any) => x.changeRequests || []);
            const errs = r.results.filter((x: any) => !x.ok);
            toast.success(`${r.results.length - errs.length} ítem(s) aplicados · ${crs.length} solicitud(es) en el flujo editorial${errs.length ? ` · ${errs.length} con error` : ''}.`);
            await cargar(); onChanged();
        } catch (e: any) { toast.error(e?.message); } finally { setOcupado(false); }
    };
    if (!d) return <Drawer title="Envío" onClose={onClose} wide><Cargando /></Drawer>;
    const i = d.intake; const s = i.sender || {};
    const aprobados = d.items.filter((x: any) => x.decision?.status === 'aprobado').length;
    const enRevision = ['enviado', 'en_revision', 'aplicado'].includes(i.status);
    const porSeccion: Record<string, any[]> = {};
    for (const it of d.items) (porSeccion[it.section] = porSeccion[it.section] || []).push(it);
    // v4.1287 — Cada sección dice a qué de los diez pasos del formulario pertenece.
    const pasoDe = Object.fromEntries((d.catalogs?.sections || []).map((x: any) => [x.k, x.step]));
    const titulos = Object.fromEntries((d.form?.sections || []).map((x: any) => [x.k, pasoDe[x.k] ? `Paso ${pasoDe[x.k]} · ${x.title}` : x.title]));
    return (
        <Drawer wide title={`Envío ${i.publicRef}`} subtitle={`${d.catalogs.submissionTypes.find((t: any) => t.id === i.submissionType)?.label || ''} · recibido ${fmtFecha(i.submittedAt)}`} onClose={onClose}
            footer={puedeRevisar ? <>
                {i.status === 'enviado' ? <button type="button" className={btnSecundario} disabled={ocupado} onClick={() => estado('en_revision')}>Pasar a «En revisión»</button> : null}
                <button type="button" className={btnPrimario} disabled={ocupado || !aprobados || !enRevision} onClick={aplicar}>{ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Aplicar lo aprobado ({aprobados})</button>
            </> : undefined}>
            <Tarjeta title="Quién envía (datos internos)">
                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div><dt className="text-[11px] text-gray-400">Nombre</dt><dd className="font-semibold">{[s.firstName, s.lastName].filter(Boolean).join(' ')}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Cargo · organización</dt><dd>{[s.role, s.organization].filter(Boolean).join(' · ') || '—'}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Correo · teléfono</dt><dd>{[s.email, s.phone].filter(Boolean).join(' · ')}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Relación</dt><dd>{(labels['remitente.relation']?.opt || []).find((o: any) => o.id === s.relation)?.label || s.relationOther || '—'}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Club</dt><dd>{s.clubMode === 'club' ? 'Pertenece a un club (ver ID)' : s.clubMode === 'otra_organizacion' ? (s.otherOrganization || 'Otra organización') : 'No pertenece a un club rotario'}</dd></div>
                    <div><dt className="text-[11px] text-gray-400">Crédito público</dt><dd>{s.publicCredit ? `${s.publicName || ''} ${s.publicRole ? `· ${s.publicRole}` : ''}` : 'No autorizado'}</dd></div>
                </dl>
                <p className="text-[11px] text-gray-500 mt-3 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Consentimientos: datos {i.consents?.data ? '✔' : '✘'} · derechos de uso {i.consents?.rights ? '✔' : '✘'} · novedades {i.consents?.newsletter ? '✔' : '✘'}. Registrar un nombre como responsable NO da permisos.</p>
            </Tarjeta>
            {puedeRevisar && enRevision ? (
                <Tarjeta title="Devolver o archivar el envío">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input className={campo} placeholder="Qué falta o por qué se archiva (lo verá quien envió)" value={nota} onChange={e => setNota(e.target.value)} />
                        <button type="button" className={btnSecundario} disabled={ocupado} onClick={() => estado('ajustes')}>Solicitar ajustes</button>
                        <button type="button" className={btnPeligro} disabled={ocupado} onClick={() => estado('archivado')}>Archivar</button>
                    </div>
                    {enlace ? (
                        <div className="mt-3 rounded-xl bg-sky-50 border border-sky-100 p-3 text-xs text-sky-900 space-y-2">
                            <p>{enlace.emailSent ? 'Enviamos el enlace por correo a quien envió.' : 'El correo de la plataforma no está configurado: comparte este enlace personal con quien envió.'}</p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={btnSecundario} onClick={() => navigator.clipboard?.writeText(enlace.link).then(() => toast.success('Enlace copiado.'))}><Copy className="w-4 h-4" /> Copiar enlace</button>
                                <a className={btnSecundario} href={`https://wa.me/?text=${encodeURIComponent(`Hola, te pedimos algunos ajustes en el envío ${i.publicRef}: ${enlace.link}`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
                                <a className={btnSecundario} href={`mailto:${encodeURIComponent(s.email || '')}?subject=${encodeURIComponent(`Ajustes en el envío ${i.publicRef}`)}&body=${encodeURIComponent(`Abre este enlace para ver los ajustes: ${enlace.link}`)}`}>Correo</a>
                            </div>
                        </div>
                    ) : null}
                </Tarjeta>
            ) : null}
            {Object.entries(porSeccion).map(([sec, items]) => (
                <section key={sec} className="space-y-3">
                    <h3 className="text-sm font-black text-gray-800">{titulos[sec] || sec}</h3>
                    {items.map((it: any) => <ItemRevision key={it.key} it={it} labels={labels} files={files} decisions={d.catalogs.decisions} onDecide={decidir} onVer={ver} ocupado={ocupado} editable={puedeRevisar && enRevision} />)}
                </section>
            ))}
            {d.items.length === 0 ? <p className="text-sm text-gray-500">El envío no trae información todavía.</p> : null}
            {d.changeRequests.length ? (
                <Tarjeta title="Solicitudes del flujo editorial creadas desde este envío">
                    <ul className="text-sm space-y-1">{d.changeRequests.map((c: any) => <li key={c.id}><a className="text-rotary-blue font-semibold" href={`/admin/programas/${programId}?tab=${c.status === 'borrador' ? 'gestion' : 'revision'}&ref=${encodeURIComponent(c.publicRef)}`}>{c.publicRef}</a> · {c.title} · {c.status}{c.publishedAt ? ' · publicada' : ''}</li>)}</ul>
                </Tarjeta>
            ) : null}
        </Drawer>
    );
};

const FilaCampo = ({ path, f, cfg, ro, setField }: { path: string; f: any; cfg: any; ro: boolean; setField: (path: string, patch: any) => void }) => {
    const c = cfg.fields[path] || {};
    return (
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-center py-2 border-t border-gray-100">
            <div className="min-w-0">
                <p className="text-sm text-gray-800">{f.l}{f.health ? <span className="text-[10px] text-violet-600 ml-1">solo salud</span> : null}{f.pub === 'interno' ? <span className="text-[10px] text-gray-400 ml-1">interno</span> : null}</p>
                <input className={`${campo} mt-1 text-xs`} disabled={ro} placeholder="Ayuda propia (opcional)" value={c.help || ''} onChange={e => setField(path, { help: e.target.value })} />
            </div>
            {f.need ? <span className="text-[11px] text-gray-400">Siempre obligatorio</span> : <Toggle checked={c.required === true} onChange={v => setField(path, { required: v, hidden: v ? false : c.hidden })} label="Obligatorio" />}
            {f.need ? <span /> : <Toggle checked={c.hidden === true} onChange={v => setField(path, { hidden: v, required: v ? false : c.required })} label="Ocultar" />}
        </div>
    );
};

const Configuracion = ({ programId }: { programId: string }) => {
    const [d, setD] = useState<any>(null);
    const [cfg, setCfg] = useState<any>(null);
    const [abierta, setAbierta] = useState<string>('');
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { api(`/admin/${programId}/intake-config`).then(r => { setD(r); setCfg(r.config); }).catch(e => toast.error(e?.message)); }, [programId]);
    if (!d || !cfg) return <Cargando />;
    const ro = !d.canEdit;
    const setSec = (k: string, patch: any) => setCfg((c: any) => ({ ...c, sections: { ...c.sections, [k]: { ...c.sections[k], ...patch } } }));
    const setField = (path: string, patch: any) => setCfg((c: any) => ({ ...c, fields: { ...c.fields, [path]: { required: false, hidden: false, help: '', ...(c.fields[path] || {}), ...patch } } }));
    const guardar = async () => {
        setGuardando(true);
        try { const r = await api<any>(`/admin/${programId}/intake-config`, { method: 'PUT', body: JSON.stringify({ config: cfg }) }); setCfg(r.config); toast.success('Configuración guardada.'); }
        catch (e: any) { toast.error(e?.message); } finally { setGuardando(false); }
    };
    return (
        <div className="space-y-4">
            <Tarjeta title="El formulario para este programa" actions={<button type="button" className={btnPrimario} disabled={ro || guardando} onClick={guardar}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Guardar</button>}>
                <div className="grid md:grid-cols-2 gap-4">
                    <Toggle checked={cfg.enabled !== false} onChange={v => setCfg({ ...cfg, enabled: v })} label="Recibir información por el formulario" hint="Apagado: el programa no aparece en el formulario público." />
                    <Campo label="Vocabulario" hint="Salud: pacientes, clínicas y revisión médica. General: beneficiarios, participantes y servicios.">
                        <select className={campo} disabled={ro} value={cfg.vocabulary} onChange={e => setCfg({ ...cfg, vocabulary: e.target.value })}>
                            <option value="auto">Automático (según la categoría)</option><option value="salud">Programa de salud</option><option value="general">Programa no médico</option>
                        </select>
                    </Campo>
                    <Campo label="Texto de bienvenida (opcional)" className="md:col-span-2"><textarea className={campo} rows={2} disabled={ro} value={cfg.intro || ''} onChange={e => setCfg({ ...cfg, intro: e.target.value })} /></Campo>
                </div>
                <p className="text-xs text-gray-500 mt-3">Dirección del formulario: <a className="text-rotary-blue font-semibold" href={d.formPath} target="_blank" rel="noopener noreferrer">{d.formPath}</a>. Lo mínimo para identificar un envío (nombre, correo, cargo y relación de quien envía, y el dato que identifica cada registro) es siempre obligatorio.</p>
            </Tarjeta>
            {d.raw.filter((s: any) => !s.always).map((s: any) => (
                <Tarjeta key={s.k} title={s.title} actions={<div className="flex items-center gap-3"><Toggle checked={cfg.sections[s.k]?.enabled !== false} onChange={v => setSec(s.k, { enabled: v })} label="Aplica" /><button type="button" className={btnSecundario} onClick={() => setAbierta(abierta === s.k ? '' : s.k)}>{abierta === s.k ? 'Cerrar' : 'Campos'}</button></div>}>
                    <p className="text-xs text-gray-500">Destino: {s.target}{s.landing ? ` · Página: ${s.landing}` : ''}</p>
                    {abierta === s.k ? (
                        <div className="mt-3">
                            <Campo label="Ayuda de la sección (opcional)"><input className={campo} disabled={ro} value={cfg.sections[s.k]?.help || ''} onChange={e => setSec(s.k, { help: e.target.value })} /></Campo>
                            {s.fields.map((f: any) => (f.t === 'list'
                                ? <div key={f.k} className="mt-3 rounded-xl bg-gray-50 p-3"><p className="text-xs font-bold text-gray-700">Lista: {f.l}</p>{f.fields.map((x: any) => <FilaCampo key={x.k} path={`${s.k}.${f.k}.${x.k}`} f={x} cfg={cfg} ro={ro} setField={setField} />)}</div>
                                : <FilaCampo key={f.k} path={`${s.k}.${f.k}`} f={f} cfg={cfg} ro={ro} setField={setField} />))}
                        </div>
                    ) : null}
                </Tarjeta>
            ))}
        </div>
    );
};

const BancoMultimedia = ({ programId }: { programId: string }) => {
    const [m, setM] = useState<any[] | null>(null);
    useEffect(() => { api<{ media: any[] }>(`/admin/${programId}/media-bank`).then(r => setM(r.media)).catch(e => toast.error(e?.message)); }, [programId]);
    if (!m) return <Cargando />;
    return (
        <Tarjeta title="Material publicado desde el formulario">
            <p className="text-xs text-gray-500 mb-4">Versiones web en la Biblioteca del sitio (carpeta del programa). Los originales siguen privados. El uso sugerido NO cambia la página: cópialo en el contenedor que corresponda desde «Página pública» (Biblioteca → elegir).</p>
            {m.length === 0 ? <p className="text-sm text-gray-500">Todavía no hay material aplicado.</p> : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {m.map(x => (
                        <div key={x.id} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
                            {x.kind === 'image' ? <img src={x.url} alt={x.alt || ''} className="w-full h-36 object-cover" style={x.focus ? { objectPosition: `${x.focus.x}% ${x.focus.y}%` } : undefined} /> : <div className="h-36 bg-gray-50 flex items-center justify-center text-xs text-gray-400">{x.kind}</div>}
                            <div className="p-3 space-y-1">
                                <p className="text-sm font-semibold text-gray-800 truncate">{x.title || x.filename}</p>
                                <p className="text-[11px] text-gray-500">{x.credit ? `Crédito: ${x.credit} · ` : ''}{x.intakeRef}</p>
                                {x.uses?.length ? <p className="text-[11px] text-sky-700">Sugerido: {x.uses.join(', ')}</p> : null}
                                <div className="flex gap-2 pt-1">
                                    <button type="button" className="text-[11px] font-bold text-rotary-blue inline-flex items-center gap-1" onClick={() => navigator.clipboard?.writeText(x.url).then(() => toast.success('URL copiada.'))}><Copy className="w-3 h-3" /> Copiar URL</button>
                                    <a className="text-[11px] font-bold text-rotary-blue inline-flex items-center gap-1" href={x.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" /> Abrir</a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Tarjeta>
    );
};

const ProgramaFormularioTab = ({ data, onChanged, refInicial }: { data: Detalle; onChanged: () => void; refInicial?: string | null }) => {
    const programId = data.program.id;
    const [sub, setSub] = useState<string>('envios');
    const [lista, setLista] = useState<any>(null);
    const [filtro, setFiltro] = useState({ status: '', q: '', page: 1 });
    const [abierto, setAbierto] = useState<string | null>(refInicial || null);
    const [mapa, setMapa] = useState<any[] | null>(null);
    const puedeRevisar = can(data.grant, 'review');
    const cargar = useCallback(async () => {
        if (!puedeRevisar) return;
        try { setLista(await api(`/admin/${programId}/intakes?${qs(filtro)}`)); } catch (e: any) { toast.error(e?.message); }
    }, [programId, filtro, puedeRevisar]);
    useEffect(() => { if (sub === 'envios') cargar(); }, [cargar, sub]);
    useEffect(() => { if (sub === 'mapa' && !mapa) api<any>(`/admin/${programId}/intake-config`).then(r => setMapa(r.catalogs.sections)).catch(() => {}); }, [sub, mapa, programId]);
    const formUrl = `${window.location.origin}/formulario-programas?programa=${encodeURIComponent(data.program.slug)}`;
    return (
        <div className="space-y-4">
            <Tarjeta title="Formulario institucional del programa" actions={<div className="flex gap-2"><button type="button" className={btnSecundario} onClick={() => navigator.clipboard?.writeText(formUrl).then(() => toast.success('Enlace copiado.'))}><Copy className="w-4 h-4" /> Copiar enlace</button><a className={btnSecundario} href={formUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /> Abrir</a></div>}>
                <p className="text-sm text-gray-600">Los líderes del programa comparten textos, documentos y materiales en <b>/formulario-programas</b>. Cada envío llega como propuesta: se revisa por sección o por registro, se compara con lo vigente y lo aprobado se aplica como solicitudes de la «Revisión editorial», con sus permisos y la revisión médica cuando corresponde.</p>
            </Tarjeta>
            <div role="tablist" className="flex gap-1.5 p-1 bg-gray-100/80 rounded-xl overflow-x-auto">
                {SUBTABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-semibold ${sub === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>{l}</button>)}
            </div>
            {sub === 'envios' ? (puedeRevisar ? (
                <Tarjeta title="Envíos recibidos" actions={<button type="button" className={btnSecundario} onClick={cargar}><RefreshCw className="w-4 h-4" /> Actualizar</button>}>
                    <div className="flex flex-col sm:flex-row gap-2 mb-4">
                        <input className={campo} placeholder="Buscar por referencia o nombre" value={filtro.q} onChange={e => setFiltro({ ...filtro, q: e.target.value, page: 1 })} />
                        <select className={campo} value={filtro.status} onChange={e => setFiltro({ ...filtro, status: e.target.value, page: 1 })}>
                            <option value="">Todos los estados</option>
                            {lista ? Object.values(lista.catalogs.states as Spec).map(s => <option key={s.id} value={s.id}>{s.label} ({(lista.facets.find((f: any) => f.status === s.id) || { n: 0 }).n})</option>) : null}
                        </select>
                    </div>
                    {!lista ? <Cargando /> : lista.rows.length === 0 ? <p className="text-sm text-gray-500">No hay envíos con ese filtro.</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[640px]">
                                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="py-2">Referencia</th><th>Quién envía</th><th>Tipo</th><th>Estado</th><th>Ítems</th><th>Fecha</th></tr></thead>
                                <tbody>
                                    {lista.rows.map((r: any) => (
                                        <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setAbierto(r.id)}>
                                            <td className="py-2.5 font-mono font-semibold text-rotary-blue">{r.publicRef}</td>
                                            <td>{[r.firstName, r.lastName].filter(Boolean).join(' ')}<span className="block text-[11px] text-gray-400">{r.organization || ''}</span></td>
                                            <td className="text-xs">{lista.catalogs.submissionTypes.find((t: any) => t.id === r.submissionType)?.label}</td>
                                            <td><Chip spec={lista.catalogs.states} id={r.status} /></td>
                                            <td className="text-xs">{r.items} · {r.pending} sin revisar · {r.approved} aprob. · {r.applied} aplic.</td>
                                            <td className="text-xs text-gray-500">{fmtFecha(r.submittedAt || r.lastSavedAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Paginacion page={lista.page} total={lista.total} perPage={lista.perPage} onPage={(p) => setFiltro({ ...filtro, page: p })} />
                        </div>
                    )}
                </Tarjeta>
            ) : <p className="text-sm text-gray-500">Tu perfil no revisa envíos de este programa.</p>) : null}
            {sub === 'config' ? <Configuracion programId={programId} /> : null}
            {sub === 'media' ? <BancoMultimedia programId={programId} /> : null}
            {sub === 'mapa' ? (
                <Tarjeta title="Correspondencia: de cada sección a su destino">
                    {!mapa ? <Cargando /> : (
                        <table className="w-full text-sm">
                            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="py-2">Paso</th><th>Sección del formulario</th><th>Destino en el administrador</th><th>Contenedor de la página</th></tr></thead>
                            <tbody>{mapa.map((s: any) => <tr key={s.k} className="border-t border-gray-100"><td className="py-2 text-xs text-gray-500 pr-2">{s.step}. {s.stepTitle}</td><td className="py-2 font-semibold">{s.title}</td><td className="text-xs text-gray-600">{s.target}</td><td className="text-xs text-gray-600">{s.landing || '—'}</td></tr>)}</tbody>
                        </table>
                    )}
                    <p className="text-xs text-gray-500 mt-3">Aplicar nunca cambia la diagramación de la página: los contenedores con fuente (directorio, historias, impacto, recursos, donaciones) se llenan solos con lo PUBLICADO; los textos y las imágenes de los demás se eligen en «Página pública».</p>
                </Tarjeta>
            ) : null}
            {abierto ? <DetalleEnvio programId={programId} intakeId={abierto} onClose={() => setAbierto(null)} onChanged={() => { cargar(); onChanged(); }} puedeRevisar={puedeRevisar} /> : null}
        </div>
    );
};

export default ProgramaFormularioTab;
