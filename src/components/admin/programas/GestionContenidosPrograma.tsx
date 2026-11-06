/**
 * Programas — formato interno «Gestión de contenidos del programa» (v4.1280.0)
 *
 * Formulario dinámico inspirado en Rotary en Acción, en tres pasos:
 *   1. ¿Qué deseas gestionar? (tipo, operación, registro, alcance, sección)
 *   2. Contenido (campos según el tipo, archivos y enlaces)
 *   3. Responsable, alcance solicitado, fecha, observaciones, autorizaciones
 * Guardar borrador · retomar · enviar a revisión · consultar estado · recibir
 * observaciones · corregir y reenviar · ver historial.
 *
 * Una solicitud NUNCA modifica lo publicado: lo hace la acción de publicar
 * de quien revisa, y hasta entonces sigue publicada la versión aprobada.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Save, Send, Plus, Trash2, FileEdit, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, can, qs, ApiError } from './api';
import { Tarjeta, Campo, campo, btnPrimario, btnSecundario, Toggle, Chip, Drawer, Cargando, ImageField, PrivateFileField } from './ui';
import {
    CHANGE_KINDS, OPERATIONS, SCOPE_TYPES, SECTIONS, CONTENT_KINDS, EDITORIAL_STATES, RESOURCE_TYPES, INDICATOR_MODES, PERMISSION_SCOPES,
    validateChangeRequestStep, dateTimeLabel, resolveEmbed, type FieldError,
} from '../../../lib/programSpec';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

type FieldDef = { key: string; label: string; type?: 'text' | 'textarea' | 'date' | 'select' | 'toggle' | 'url' | 'number' | 'image' | 'file'; options?: { id: string; label: string }[]; hint?: string; full?: boolean; fileKind?: string };

const FIELDS: Record<string, FieldDef[]> = {
    clinic: [
        { key: 'name', label: 'Nombre' }, { key: 'institution', label: 'Institución' }, { key: 'region', label: 'Departamento o región' }, { key: 'city', label: 'Ciudad' },
        { key: 'address', label: 'Dirección pública', full: true }, { key: 'phone', label: 'Teléfono público' }, { key: 'email', label: 'Correo público' },
        { key: 'url', label: 'Enlace oficial', type: 'url' }, { key: 'schedule', label: 'Horario' }, { key: 'referenceContact', label: 'Contacto o profesional de referencia (público)' },
        { key: 'careConditions', label: 'Condiciones de atención aprobadas', type: 'textarea', full: true, hint: 'Si trae texto, la solicitud pasa por el revisor médico.' },
        { key: 'active', label: 'Centro activo', type: 'toggle' }, { key: 'verifiedAt', label: 'Fecha de verificación', type: 'date' }, { key: 'verifiedBy', label: 'Responsable de verificación' },
        { key: 'internal.contactName', label: 'INTERNO · contacto', hint: 'No se publica.' }, { key: 'internal.phone', label: 'INTERNO · teléfono' }, { key: 'internal.email', label: 'INTERNO · correo' }, { key: 'internal.notes', label: 'INTERNO · notas', type: 'textarea', full: true },
    ],
    team: [
        { key: 'name', label: 'Nombre' }, { key: 'role', label: 'Rol' }, { key: 'institution', label: 'Institución' }, { key: 'sortOrder', label: 'Orden de aparición', type: 'number' },
        { key: 'bio', label: 'Reseña', type: 'textarea', full: true }, { key: 'photoUrl', label: 'Fotografía (pública, autorizada)', type: 'image', full: true },
        { key: 'publishAuthorized', label: 'Autorización de publicación registrada', type: 'toggle', full: true }, { key: 'authorizationFileId', label: 'Comprobante de autorización (privado)', type: 'file', fileKind: 'autorizacion', full: true },
    ],
    story: [
        { key: 'title', label: 'Título', full: true }, { key: 'summary', label: 'Resumen', type: 'textarea', full: true }, { key: 'body', label: 'Contenido', type: 'textarea', full: true },
        { key: 'location', label: 'Ubicación' }, { key: 'date', label: 'Fecha', type: 'date' }, { key: 'author', label: 'Autor o responsable' },
        { key: 'minorsInvolved', label: 'Aparecen menores de edad', type: 'toggle', hint: 'Nunca nombres de menores junto a cifras; sin fotografías clínicas.' },
        { key: 'guardianAuthorized', label: 'El representante legal autorizó la publicación', type: 'toggle', hint: 'Obligatorio para publicar si aparecen menores de edad (v4.1286).' },
        { key: 'usagePermission', label: 'Permiso de uso registrado', type: 'toggle' }, { key: 'usagePermissionScope', label: 'Alcance del permiso', type: 'select', options: PERMISSION_SCOPES },
        { key: 'authorizationFileId', label: 'Comprobante de permiso (privado)', type: 'file', fileKind: 'autorizacion', full: true },
    ],
    resource: [
        { key: 'title', label: 'Título', full: true }, { key: 'description', label: 'Descripción', type: 'textarea', full: true },
        { key: 'type', label: 'Tipo', type: 'select', options: RESOURCE_TYPES }, { key: 'url', label: 'URL (YouTube, Spotify, Vimeo o enlace)', type: 'url' },
        { key: 'fileId', label: 'Archivo (documento privado; se entrega bajo demanda)', type: 'file', fileKind: 'recurso', full: true },
        { key: 'audience', label: 'Público objetivo' }, { key: 'source', label: 'Fuente' }, { key: 'reviewedAt', label: 'Fecha de revisión', type: 'date' },
        { key: 'clinical', label: 'Es información clínica (requiere aprobación médica)', type: 'toggle', full: true },
    ],
    news: [
        { key: 'type', label: 'Tipo', type: 'select', options: [{ id: 'noticia', label: 'Noticia' }, { id: 'evento', label: 'Evento' }] }, { key: 'title', label: 'Título' },
        { key: 'summary', label: 'Resumen', type: 'textarea', full: true }, { key: 'body', label: 'Contenido', type: 'textarea', full: true },
        { key: 'date', label: 'Fecha', type: 'date' }, { key: 'endDate', label: 'Fecha fin (evento)', type: 'date' }, { key: 'location', label: 'Lugar' }, { key: 'url', label: 'Enlace', type: 'url' },
        { key: 'imageUrl', label: 'Imagen', type: 'image', full: true },
    ],
    indicator: [
        { key: 'name', label: 'Nombre' }, { key: 'definition', label: 'Definición (qué mide y cómo)', type: 'textarea', full: true }, { key: 'value', label: 'Valor' }, { key: 'unit', label: 'Unidad' },
        { key: 'mode', label: 'Acumulado o por período', type: 'select', options: INDICATOR_MODES, hint: 'No se suman acumulados con períodos.' }, { key: 'period', label: 'Período (p. ej. 2025, jul–dic 2025)' },
        { key: 'source', label: 'Fuente' }, { key: 'validatedBy', label: 'Responsable de validación' }, { key: 'updatedOn', label: 'Fecha de actualización', type: 'date' }, { key: 'sortOrder', label: 'Orden', type: 'number' },
    ],
    donation: [
        { key: 'buttonLabel', label: 'Texto del botón' }, { key: 'url', label: 'URL oficial', type: 'url' }, { key: 'receiver', label: 'Entidad que recibe y administra el aporte', full: true },
        { key: 'purpose', label: 'Destino o finalidad informada', type: 'textarea', full: true }, { key: 'disclaimer', label: 'Texto aclaratorio (sin afirmar beneficios tributarios ni certificaciones sin texto aprobado)', type: 'textarea', full: true },
        { key: 'verifiedBy', label: 'Responsable de verificación' }, { key: 'verifiedAt', label: 'Fecha de verificación', type: 'date' }, { key: 'sortOrder', label: 'Orden', type: 'number' },
    ],
};

const INFO_BLOCKS = [
    { key: 'identity', label: 'Identidad (nombre, resumen, descripción, sitio web)', fields: [{ key: 'name', label: 'Nombre oficial' }, { key: 'summary', label: 'Resumen', type: 'textarea', full: true }, { key: 'description', label: 'Descripción', type: 'textarea', full: true }, { key: 'website', label: 'Sitio web', type: 'url' }] as FieldDef[] },
    { key: 'care', label: 'Atención (público, cobertura, ruta de orientación, condiciones, canales, costos)', fields: [{ key: 'audience', label: 'Público', type: 'textarea', full: true }, { key: 'coverage', label: 'Cobertura', type: 'textarea', full: true }, { key: 'guidancePath', label: 'Ruta de orientación (clínico)', type: 'textarea', full: true }, { key: 'accessConditions', label: 'Condiciones de acceso (clínico)', type: 'textarea', full: true }, { key: 'officialChannels', label: 'Canales oficiales', type: 'textarea', full: true }, { key: 'costsText', label: 'Texto sobre costos (clínico)', type: 'textarea', full: true }] as FieldDef[] },
    { key: 'participation', label: 'Participación (formas de apoyar, clubes, voluntariado, alianzas)', fields: [{ key: 'waysToSupport', label: 'Formas de apoyar', type: 'textarea', full: true }, { key: 'clubParticipation', label: 'Participación de clubes', type: 'textarea', full: true }, { key: 'volunteering', label: 'Voluntariado', type: 'textarea', full: true }, { key: 'corporateAlliances', label: 'Alianzas empresariales', type: 'textarea', full: true }] as FieldDef[] },
];

const vacia = (ctx: { scopeType: string; clubActivationId?: string; districtNumber?: number | string; name: string; email: string }) => ({
    kind: '', operation: 'crear', contentId: '', scopeType: ctx.scopeType, districtNumber: ctx.districtNumber || '', clubActivationId: ctx.clubActivationId || '', targetSection: '',
    title: '', body: '', payload: {} as any, attachments: [] as { fileId: string; label: string; filename?: string }[], links: [] as string[],
    responsibleName: ctx.name, responsibleEmail: ctx.email, responsiblePhone: '', requestedReach: '', suggestedDate: '', observations: '',
    authorizations: { imageRights: false, dataConsent: false, sourceVerified: false, medicalReviewRequested: false, note: '' },
});

const getPath = (o: any, k: string) => k.split('.').reduce((a, b) => (a ? a[b] : undefined), o);
const setPath = (o: any, k: string, v: any) => { const n = structuredClone(o || {}); const ks = k.split('.'); let c = n; for (let i = 0; i < ks.length - 1; i++) { c[ks[i]] = c[ks[i]] ?? {}; c = c[ks[i]]; } c[ks[ks.length - 1]] = v; return n; };

/** Un campo del formato, FUERA del componente: declararlo adentro sería un tipo nuevo en cada render y el formulario perdería el foco en cada letra. */
const CampoDinamico = ({ f, base, form, errores, set, programId, siteId }: { f: FieldDef; base: string; form: any; errores: FieldError[]; set: (k: string, v: any) => void; programId: string; siteId: string | null }) => {
    const k = `${base}.${f.key}`;
    const v = getPath(form, k);
    const err = errores.find(e => e.field === k)?.message;
    if (f.type === 'toggle') return <div className={f.full ? 'md:col-span-2' : ''}><Toggle checked={v === true} onChange={x => set(k, x)} label={f.label} hint={f.hint} />{err ? <p className="text-xs text-rose-600 mt-1">{err}</p> : null}</div>;
    if (f.type === 'image') return <div className={f.full ? 'md:col-span-2' : ''}><ImageField label={f.label} value={v || ''} onChange={x => set(k, x)} alt={getPath(form, `${base}.${f.key === 'photoUrl' ? 'photoAlt' : 'imageAlt'}`) || ''} onAlt={x => set(`${base}.${f.key === 'photoUrl' ? 'photoAlt' : 'imageAlt'}`, x)} clubId={siteId} hint={f.hint || 'Sólo material autorizado para difusión. Nunca imágenes clínicas ni generadas con IA.'} />{err ? <p className="text-xs text-rose-600 mt-1">{err}</p> : null}</div>;
    if (f.type === 'file') return <div className={f.full ? 'md:col-span-2' : ''}><PrivateFileField programId={programId} kind={f.fileKind || 'documento_respaldo'} value={v ? { id: v, filename: getPath(form, `${base}.${f.key}Name`) || 'archivo adjunto' } : null} onChange={x => { set(k, x?.id || null); set(`${base}.${f.key}Name`, x?.filename || ''); }} label={f.label} hint={f.hint} relatedType={form.kind} /></div>;
    return (
        <Campo label={f.label} hint={f.hint} error={err} className={f.full ? 'md:col-span-2' : ''}>
            {f.type === 'textarea' ? <textarea className={campo} rows={4} value={v || ''} onChange={e => set(k, e.target.value)} />
                : f.type === 'select' ? <select className={campo} value={v || ''} onChange={e => set(k, e.target.value)}><option value="">Elige…</option>{(f.options || []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                : <input className={campo} type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} value={v ?? ''} onChange={e => set(k, e.target.value)} placeholder={f.type === 'url' ? 'https://…' : ''} />}
            {f.type === 'url' && v && resolveEmbed(v) ? <p className="text-[11px] text-emerald-700 mt-1">Se embeberá como {resolveEmbed(v)?.provider}.</p> : null}
        </Campo>
    );
};

const GestionContenidosPrograma = ({ data, onChanged, refInicial }: { data: Detalle; onChanged: () => void; refInicial?: string | null }) => {
    const miClub = data.myActivation && data.myActivation.status === 'activa' && data.grant.clubActivationIds.includes(data.myActivation.id) ? data.myActivation : null;
    const scopesPermitidos = useMemo(() => SCOPE_TYPES.filter(s => data.grant.all || data.grant.submitScopes.includes(s.id)), [data.grant]);
    const ctx = useMemo(() => ({ scopeType: scopesPermitidos.some(s => s.id === 'central') ? 'central' : (scopesPermitidos[0]?.id || 'central'), clubActivationId: miClub?.id, districtNumber: data.grant.districtNumbers[0] || data.scope.districtNumbers[0] || '', name: '', email: '' }), [scopesPermitidos, miClub, data]);
    const [lista, setLista] = useState<any>(null);
    const [abierta, setAbierta] = useState<any>(null);
    const [form, setForm] = useState<any>(null);
    const [paso, setPaso] = useState(1);
    const [errores, setErrores] = useState<FieldError[]>([]);
    const [guardando, setGuardando] = useState(false);
    const [registros, setRegistros] = useState<any[]>([]);
    const [enlace, setEnlace] = useState('');

    const cargar = useCallback(async () => {
        try { setLista(await api(`/admin/${data.program.id}/changes?${qs({ perPage: 50 })}`)); }
        catch (e: any) { toast.error(e?.message || 'No se pudo cargar.'); }
    }, [data.program.id]);
    useEffect(() => { cargar(); }, [cargar]);

    // Prefill desde la Biblioteca («Proponer actualización» / «Solicitar retiro»).
    useEffect(() => {
        const raw = sessionStorage.getItem(`programa:${data.program.id}:prefill`);
        if (!raw) return;
        sessionStorage.removeItem(`programa:${data.program.id}:prefill`);
        try { const pre = JSON.parse(raw); setForm({ ...vacia(ctx), ...pre }); setPaso(2); setErrores([]); } catch { /* nada */ }
    }, [data.program.id, ctx]);

    const abrir = useCallback(async (ref: string) => {
        try { setAbierta(await api(`/admin/${data.program.id}/changes/${encodeURIComponent(ref)}`)); }
        catch (e: any) { toast.error(e?.message || 'No se pudo abrir.'); }
    }, [data.program.id]);
    useEffect(() => { if (refInicial) abrir(refInicial); }, [refInicial, abrir]);

    useEffect(() => {
        if (!form?.kind || !CONTENT_KINDS[form.kind] || form.operation === 'crear') { setRegistros([]); return; }
        api(`/admin/${data.program.id}/content?${qs({ kind: form.kind, perPage: 200 })}`).then(r => setRegistros(r.rows || [])).catch(() => setRegistros([]));
    }, [form?.kind, form?.operation, data.program.id]);

    const set = (k: string, v: any) => setForm((f: any) => setPath(f, k, v));
    const errorDe = (k: string) => errores.find(e => e.field === k)?.message;
    const pasoConError = (n: number) => errores.some(e => e.step === n);

    const editar = (r: any) => {
        setForm({ ...vacia(ctx), ...r, districtNumber: r.districtNumber || '', clubActivationId: r.clubActivationId || '', suggestedDate: r.suggestedDate ? String(r.suggestedDate).slice(0, 10) : '', attachments: r.attachments || [], links: r.links || [], authorizations: { imageRights: false, dataConsent: false, sourceVerified: false, medicalReviewRequested: false, note: '', ...(r.authorizations || {}) } });
        setPaso(1); setErrores([]); setAbierta(null);
    };

    const guardar = async (submit: boolean) => {
        const errs = validateChangeRequestStep(form, { submit });
        setErrores(errs);
        if (errs.length) { setPaso(errs[0].step || 1); toast.error(errs[0].message); return; }
        setGuardando(true);
        try {
            const body = JSON.stringify({ ...form, submit });
            if (form.id) await api(`/admin/${data.program.id}/changes/${form.id}`, { method: 'PUT', body });
            else await api(`/admin/${data.program.id}/changes`, { method: 'POST', body });
            toast.success(submit ? 'Enviada a revisión. Lo publicado no cambia hasta que se apruebe y publique.' : 'Borrador guardado. Puedes retomarlo cuando quieras.');
            setForm(null); cargar(); onChanged();
        } catch (e: any) {
            if (e instanceof ApiError && e.errors.length) { setErrores(e.errors as FieldError[]); setPaso((e.errors[0] as any).step || paso); }
            toast.error(e?.message || 'No se pudo guardar.', { duration: 7000 });
        } finally { setGuardando(false); }
    };


    if (!lista) return <Cargando />;
    const kindSpec = form ? CHANGE_KINDS.find(k => k.id === form.kind) : null;

    return (
        <div className="space-y-5">
            {!form ? (
                <Tarjeta title="Mis solicitudes de contenido" actions={(can(data.grant, 'submit') || can(data.grant, 'localSubmit')) ? <button type="button" className={btnPrimario} onClick={() => { setForm(vacia(ctx)); setPaso(1); setErrores([]); }}><Plus className="w-4 h-4" /> Nueva solicitud</button> : null}>
                    <p className="text-[11px] text-gray-500 mb-3">{miClub ? `Como ${miClub.clubName} puedes proponer contenido LOCAL (equipo, historias, noticias y eventos) para tu activación. El contenido central lo gestiona el programa.` : 'Guarda borradores, envíalos a revisión, recibe observaciones y reenvíalos. Lo publicado no cambia hasta que la solicitud se apruebe y publique.'}</p>
                    {lista.rows.length === 0 ? <p className="text-sm text-gray-500">Todavía no has enviado solicitudes.</p> : (
                        <ul className="divide-y divide-gray-100">
                            {lista.rows.map((r: any) => (
                                <li key={r.id}><button type="button" onClick={() => abrir(r.publicRef)} className="w-full text-left py-3 px-2 rounded-lg hover:bg-gray-50 flex flex-wrap items-center gap-3">
                                    <span className="font-mono text-xs text-gray-500">{r.publicRef}</span>
                                    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold text-gray-900 truncate">{r.title}</span><span className="block text-xs text-gray-500">{CHANGE_KINDS.find(k => k.id === r.kind)?.label} · {OPERATIONS.find(o => o.id === r.operation)?.label} · {SCOPE_TYPES.find(s => s.id === r.scopeType)?.label}</span></span>
                                    <Chip spec={EDITORIAL_STATES} id={r.status} /><span className="text-xs text-gray-400">{dateTimeLabel(r.updatedAt)}</span>
                                </button></li>
                            ))}
                        </ul>
                    )}
                </Tarjeta>
            ) : (
                <Tarjeta title={form.id ? `Editar solicitud ${form.publicRef}` : 'Nueva solicitud de contenido'} actions={<button type="button" className={btnSecundario} onClick={() => setForm(null)}>Cancelar</button>}>
                    <ol className="flex gap-2 mb-5 text-xs">{[[1, '¿Qué deseas gestionar?'], [2, 'Contenido'], [3, 'Responsable y envío']].map(([n, l]) => <li key={String(n)}><button type="button" onClick={() => setPaso(Number(n))} className={`px-3 py-1.5 rounded-full border font-semibold ${paso === n ? 'bg-rotary-blue text-white border-rotary-blue' : pasoConError(Number(n)) ? 'border-rose-300 text-rose-700 bg-rose-50' : 'border-gray-200 text-gray-600 bg-white'}`}>{n}. {l}</button></li>)}</ol>

                    {paso === 1 ? (
                        <div className="space-y-4" data-paso="1">
                            <div>
                                <p className="text-sm font-semibold text-gray-800 mb-2">¿Qué deseas gestionar?</p>
                                {errorDe('kind') ? <p role="alert" className="text-xs text-rose-600 mb-2">{errorDe('kind')}</p> : null}
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {CHANGE_KINDS.filter(k => !(form.scopeType === 'club' && (k.id === 'info' || (CONTENT_KINDS[k.id] && !CONTENT_KINDS[k.id].localAllowed)))).map(k => <button key={k.id} type="button" onClick={() => setForm((f: any) => ({ ...f, kind: k.id, payload: f.kind === k.id ? f.payload : {}, targetSection: CONTENT_KINDS[k.id]?.section || f.targetSection }))} className={`text-left rounded-xl border p-3 ${form.kind === k.id ? 'border-rotary-blue bg-sky-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}><span className="block text-sm font-semibold text-gray-900">{k.label}</span>{k.help ? <span className="block text-[11px] text-gray-500 mt-0.5">{k.help}</span> : null}</button>)}
                                </div>
                            </div>
                            <div className="grid md:grid-cols-3 gap-3">
                                <Campo label="Tipo de operación"><select className={campo} value={form.operation} disabled={form.kind === 'info' || form.kind === 'correction'} onChange={e => set('operation', e.target.value)}>{OPERATIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Campo>
                                <Campo label="Alcance" error={errorDe('districtNumber') || errorDe('clubActivationId')}><select className={campo} value={form.scopeType} onChange={e => set('scopeType', e.target.value)}>{scopesPermitidos.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Campo>
                                <Campo label="Sección de destino"><select className={campo} value={form.targetSection || ''} onChange={e => set('targetSection', e.target.value)}><option value="">Automática</option>{SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Campo>
                                {form.scopeType === 'district' ? <Campo label="Distrito"><input className={campo} inputMode="numeric" value={form.districtNumber} onChange={e => set('districtNumber', e.target.value.replace(/\D/g, ''))} /></Campo> : null}
                                {form.scopeType === 'club' ? <Campo label="Club"><select className={campo} value={form.clubActivationId || ''} onChange={e => set('clubActivationId', e.target.value)}><option value="">Elige…</option>{(data.grant.all ? data.activations : data.activations.filter((a: any) => data.grant.clubActivationIds.includes(a.id))).map((a: any) => <option key={a.id} value={a.id}>{a.clubName}</option>)}</select></Campo> : null}
                            </div>
                            {form.operation !== 'crear' && CONTENT_KINDS[form.kind] ? (
                                <Campo label="Registro que se desea modificar o retirar" error={errorDe('contentId')}>
                                    <select className={campo} value={form.contentId || ''} onChange={e => { const c = registros.find(x => x.id === e.target.value); setForm((f: any) => ({ ...f, contentId: e.target.value, payload: form.operation === 'actualizar' && c ? c.data : f.payload, title: f.title || (c ? `${form.operation === 'retirar' ? 'Retirar' : 'Actualizar'}: ${c.title}` : '') })); }}><option value="">Elige…</option>{registros.map(c => <option key={c.id} value={c.id}>{c.title} ({c.scopeType === 'club' ? c.clubName || 'local' : c.scopeType})</option>)}</select>
                                </Campo>
                            ) : null}
                            <div className="flex justify-end"><button type="button" className={btnPrimario} onClick={() => setPaso(2)}>Siguiente <ChevronRight className="w-4 h-4" /></button></div>
                        </div>
                    ) : null}

                    {paso === 2 ? (
                        <div className="space-y-4" data-paso="2">
                            <Campo label="Título o asunto" error={errorDe('title')}><input className={campo} value={form.title} onChange={e => set('title', e.target.value)} /></Campo>
                            {!form.kind ? <p className="text-sm text-amber-700">Vuelve al paso 1 y elige qué deseas gestionar.</p> : form.operation === 'retirar' ? (
                                <Campo label="Motivo del retiro" error={errorDe('payload.reason')}><textarea className={campo} rows={4} value={form.payload?.reason || ''} onChange={e => set('payload.reason', e.target.value)} /></Campo>
                            ) : form.kind === 'correction' ? (
                                <div className="grid md:grid-cols-2 gap-3">
                                    <Campo label="Dónde está el error (sección, registro)" className="md:col-span-2"><input className={campo} value={form.payload?.field || ''} onChange={e => set('payload.field', e.target.value)} /></Campo>
                                    <Campo label="Dice"><textarea className={campo} rows={4} value={form.payload?.current || ''} onChange={e => set('payload.current', e.target.value)} /></Campo>
                                    <Campo label="Debe decir" error={errorDe('payload.proposed')}><textarea className={campo} rows={4} value={form.payload?.proposed || ''} onChange={e => set('payload.proposed', e.target.value)} /></Campo>
                                    <div className="md:col-span-2"><Toggle checked={form.payload?.clinical === true} onChange={v => set('payload.clinical', v)} label="La corrección toca texto clínico (pasa por revisión médica)" /></div>
                                </div>
                            ) : form.kind === 'info' ? (
                                <div className="space-y-4">
                                    {errorDe('payload') ? <p role="alert" className="text-xs text-rose-600">{errorDe('payload')}</p> : null}
                                    {INFO_BLOCKS.map(b => (
                                        <div key={b.key} className="rounded-xl border border-gray-100 p-3">
                                            <Toggle checked={form.payload?.[b.key] !== undefined} onChange={v => setForm((f: any) => { const p = { ...(f.payload || {}) }; if (v) p[b.key] = { ...(b.key === 'identity' ? { name: data.program.name, summary: data.program.summary, description: data.program.description, website: data.program.website } : data.program[b.key]) }; else delete p[b.key]; return { ...f, payload: p }; })} label={b.label} />
                                            {form.payload?.[b.key] !== undefined ? <div className="grid md:grid-cols-2 gap-3 mt-3">{b.fields.map(f => <CampoDinamico key={f.key} f={f} base={`payload.${b.key}`} form={form} errores={errores} set={set} programId={data.program.id} siteId={data.scope.siteId} />)}</div> : null}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid md:grid-cols-2 gap-3">
                                    {(FIELDS[form.kind] || []).map(f => <CampoDinamico key={f.key} f={f} base="payload" form={form} errores={errores} set={set} programId={data.program.id} siteId={data.scope.siteId} />)}
                                    {form.kind === 'story' ? (
                                        <div className="md:col-span-2 rounded-xl border border-gray-100 p-3 space-y-3">
                                            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-gray-800">Multimedia</p><button type="button" className={btnSecundario} onClick={() => set('payload.media', [...(form.payload?.media || []), { url: '', embedUrl: '', kind: 'image', alt: '', author: '', caption: '', permissionGranted: false, permissionScope: 'programa', verifiedBy: '', verifiedAt: '', authorizationFileId: null }])}><Plus className="w-4 h-4" /> Pieza</button></div>
                                            {errorDe('payload.media') ? <p className="text-xs text-rose-600">{errorDe('payload.media')}</p> : null}
                                            {(form.payload?.media || []).map((m: any, i: number) => (
                                                <div key={i} className="rounded-xl bg-gray-50 p-3 grid md:grid-cols-2 gap-2">
                                                    <ImageField label="Imagen (pública, autorizada)" value={m.url || ''} onChange={v => set(`payload.media.${i}.url`, v)} alt={m.alt || ''} onAlt={v => set(`payload.media.${i}.alt`, v)} clubId={data.scope.siteId} />
                                                    <div className="space-y-2">
                                                        <input className={campo} placeholder="o enlace de YouTube / Spotify / Vimeo" value={m.embedUrl || ''} onChange={e => set(`payload.media.${i}.embedUrl`, e.target.value)} />
                                                        <input className={campo} placeholder="Autor o fuente" value={m.author || ''} onChange={e => set(`payload.media.${i}.author`, e.target.value)} />
                                                        <input className={campo} placeholder="Pie de foto" value={m.caption || ''} onChange={e => set(`payload.media.${i}.caption`, e.target.value)} />
                                                        <Toggle checked={m.permissionGranted === true} onChange={v => set(`payload.media.${i}.permissionGranted`, v)} label="Permiso de publicación" />
                                                        <select className={campo} value={m.permissionScope || 'programa'} onChange={e => set(`payload.media.${i}.permissionScope`, e.target.value)}>{PERMISSION_SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                                                        <div className="grid grid-cols-2 gap-2"><input className={campo} placeholder="Verificado por" value={m.verifiedBy || ''} onChange={e => set(`payload.media.${i}.verifiedBy`, e.target.value)} /><input type="date" className={campo} value={m.verifiedAt || ''} onChange={e => set(`payload.media.${i}.verifiedAt`, e.target.value)} /></div>
                                                        <PrivateFileField programId={data.program.id} kind="autorizacion" value={m.authorizationFileId ? { id: m.authorizationFileId, filename: m.authorizationFileName || 'comprobante' } : null} onChange={x => { set(`payload.media.${i}.authorizationFileId`, x?.id || null); set(`payload.media.${i}.authorizationFileName`, x?.filename || ''); }} label="Comprobante de autorización (privado)" />
                                                        <button type="button" className="text-xs text-rose-600 inline-flex items-center gap-1" onClick={() => set('payload.media', form.payload.media.filter((_: any, k: number) => k !== i))}><Trash2 className="w-3 h-3" /> Quitar pieza</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            )}
                            <Campo label="Contenido adicional / justificación (opcional)"><textarea className={campo} rows={3} value={form.body} onChange={e => set('body', e.target.value)} /></Campo>
                            <div className="grid md:grid-cols-2 gap-3">
                                <div className="rounded-xl border border-gray-100 p-3 space-y-2">
                                    <p className="text-xs font-semibold text-gray-700">Archivos de respaldo (privados)</p>
                                    {(form.attachments || []).map((a: any, i: number) => <div key={a.fileId} className="flex items-center gap-2 text-xs"><span className="flex-1 truncate">{a.filename || a.label || a.fileId}</span><button type="button" className="text-rose-600" onClick={() => set('attachments', form.attachments.filter((_: any, k: number) => k !== i))} aria-label="Quitar"><Trash2 className="w-3 h-3" /></button></div>)}
                                    <PrivateFileField programId={data.program.id} kind="documento_respaldo" value={null} onChange={x => { if (x) set('attachments', [...(form.attachments || []), { fileId: x.id, label: x.filename, filename: x.filename }]); }} label="Adjuntar" relatedType={form.kind} />
                                </div>
                                <div className="rounded-xl border border-gray-100 p-3 space-y-2">
                                    <p className="text-xs font-semibold text-gray-700">Enlaces</p>
                                    {(form.links || []).map((l: string, i: number) => <div key={i} className="flex items-center gap-2 text-xs"><span className="flex-1 truncate">{l}</span><button type="button" className="text-rose-600" onClick={() => set('links', form.links.filter((_: string, k: number) => k !== i))} aria-label="Quitar"><Trash2 className="w-3 h-3" /></button></div>)}
                                    <div className="flex gap-2"><input className={campo} placeholder="https://…" value={enlace} onChange={e => setEnlace(e.target.value)} /><button type="button" className={btnSecundario} onClick={() => { if (enlace.trim()) { set('links', [...(form.links || []), enlace.trim()]); setEnlace(''); } }}><Plus className="w-4 h-4" /></button></div>
                                </div>
                            </div>
                            <div className="flex justify-between"><button type="button" className={btnSecundario} onClick={() => setPaso(1)}><ChevronLeft className="w-4 h-4" /> Anterior</button><button type="button" className={btnPrimario} onClick={() => setPaso(3)}>Siguiente <ChevronRight className="w-4 h-4" /></button></div>
                        </div>
                    ) : null}

                    {paso === 3 ? (
                        <div className="space-y-4" data-paso="3">
                            <div className="grid md:grid-cols-3 gap-3">
                                <Campo label="Persona responsable" error={errorDe('responsibleName')}><input className={campo} value={form.responsibleName} onChange={e => set('responsibleName', e.target.value)} /></Campo>
                                <Campo label="Correo" error={errorDe('responsibleEmail')}><input className={campo} value={form.responsibleEmail} onChange={e => set('responsibleEmail', e.target.value)} /></Campo>
                                <Campo label="Teléfono"><input className={campo} value={form.responsiblePhone || ''} onChange={e => set('responsiblePhone', e.target.value)} /></Campo>
                                <Campo label="Alcance solicitado" hint="Dónde debería verse: página del programa, sitio del distrito, clubes participantes…"><input className={campo} value={form.requestedReach || ''} onChange={e => set('requestedReach', e.target.value)} /></Campo>
                                <Campo label="Fecha sugerida de publicación"><input type="date" className={campo} value={form.suggestedDate || ''} onChange={e => set('suggestedDate', e.target.value)} /></Campo>
                                <Campo label="Observaciones" className="md:col-span-3"><textarea className={campo} rows={3} value={form.observations || ''} onChange={e => set('observations', e.target.value)} /></Campo>
                            </div>
                            <div className="rounded-xl border border-gray-100 p-3 space-y-2">
                                <p className="text-xs font-semibold text-gray-700">Autorizaciones necesarias</p>
                                <Toggle checked={form.authorizations.imageRights === true} onChange={v => set('authorizations.imageRights', v)} label="Cuento con la autorización de las personas que aparecen (imagen y testimonio)." />{errorDe('authorizations.imageRights') ? <p className="text-xs text-rose-600">{errorDe('authorizations.imageRights')}</p> : null}
                                <Toggle checked={form.authorizations.dataConsent === true} onChange={v => set('authorizations.dataConsent', v)} label="Tengo el consentimiento para el tratamiento de los datos personales incluidos." />{errorDe('authorizations.dataConsent') ? <p className="text-xs text-rose-600">{errorDe('authorizations.dataConsent')}</p> : null}
                                <Toggle checked={form.authorizations.sourceVerified === true} onChange={v => set('authorizations.sourceVerified', v)} label="La fuente de la información fue verificada." />{errorDe('authorizations.sourceVerified') ? <p className="text-xs text-rose-600">{errorDe('authorizations.sourceVerified')}</p> : null}
                                <Toggle checked={form.authorizations.medicalReviewRequested === true} onChange={v => set('authorizations.medicalReviewRequested', v)} label="Solicito revisión médica aunque el tipo no la exija." hint="La revisión médica obligatoria la decide el servidor según el tipo y el contenido." />
                                <input className={campo} placeholder="Nota sobre autorizaciones" value={form.authorizations.note || ''} onChange={e => set('authorizations.note', e.target.value)} />
                            </div>
                            <div className="flex flex-wrap justify-between gap-2">
                                <button type="button" className={btnSecundario} onClick={() => setPaso(2)}><ChevronLeft className="w-4 h-4" /> Anterior</button>
                                <div className="flex gap-2">
                                    {(!form.id || ['borrador', 'ajustes'].includes(form.status)) ? <button type="button" className={btnSecundario} disabled={guardando} onClick={() => guardar(false)}><Save className="w-4 h-4" /> Guardar borrador</button> : null}
                                    <button type="button" className={btnPrimario} disabled={guardando} onClick={() => guardar(!form.id || ['borrador', 'ajustes'].includes(form.status))}><Send className="w-4 h-4" /> {!form.id || ['borrador', 'ajustes'].includes(form.status) ? (form.status === 'ajustes' ? 'Corregir y reenviar' : 'Enviar a revisión') : 'Guardar cambios'}</button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </Tarjeta>
            )}

            {abierta ? (
                <Drawer title={`${abierta.request.publicRef} · ${abierta.request.title}`} subtitle={`${kindSpec?.label || CHANGE_KINDS.find(k => k.id === abierta.request.kind)?.label} · ${OPERATIONS.find(o => o.id === abierta.request.operation)?.label}`} onClose={() => setAbierta(null)}
                    footer={abierta.canEdit ? <button type="button" className={btnPrimario} onClick={() => editar(abierta.request)}><FileEdit className="w-4 h-4" /> {abierta.request.status === 'ajustes' ? 'Corregir y reenviar' : abierta.request.status === 'borrador' ? 'Retomar borrador' : 'Editar'}</button> : null}>
                    <div className="flex flex-wrap items-center gap-2"><Chip spec={EDITORIAL_STATES} id={abierta.request.status} />{abierta.request.requiresMedicalReview ? <span className="text-[11px] text-gray-600">Requiere revisión médica{abierta.request.medicalReviewedAt ? ' · aprobada' : ' · pendiente'}</span> : null}</div>
                    {abierta.request.statusReason ? <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"><p className="font-semibold text-xs mb-1">Observaciones del revisor</p>{abierta.request.statusReason}</div> : null}
                    <Tarjeta title="Lo propuesto"><pre className="text-xs whitespace-pre-wrap break-words text-gray-800">{abierta.request.operation === 'retirar' ? abierta.request.payload?.reason : JSON.stringify(abierta.request.payload, null, 2)}</pre></Tarjeta>
                    <Tarjeta title="Historial"><ul className="text-xs text-gray-600 space-y-1">{(abierta.request.history || []).map((h: any, i: number) => <li key={i}>{dateTimeLabel(h.at)} · {h.actorName || 'Sistema'} · {h.type}{h.to ? ` → ${EDITORIAL_STATES[h.to]?.label || h.to}` : ''}{h.detail ? ` · ${h.detail}` : ''}</li>)}</ul></Tarjeta>
                    {abierta.request.status === 'publicado' ? <p className="text-xs text-emerald-700">Publicada {dateTimeLabel(abierta.request.publishedAt)}.</p> : null}
                </Drawer>
            ) : null}
        </div>
    );
};

export default GestionContenidosPrograma;
