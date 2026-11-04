/**
 * Programas — pestaña «Información» (v4.1280.0): identidad, gobernanza,
 * atención, participación, secciones públicas, llamados de acción, SEO,
 * enrutamiento de solicitudes y publicación del programa.
 *
 * Con el programa ACTIVO, la ruta de orientación, las condiciones de acceso y
 * el texto de costos no se editan acá: van por «Gestión de contenidos →
 * Información institucional», que pasa por revisión (el servidor lo impone).
 */
import { useEffect, useState } from 'react';
import { Save, CheckCircle2, Archive, AlertTriangle, Plus, Trash2, ArrowUp, ArrowDown, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { api, can, ApiError } from './api';
import { Tarjeta, Campo, campo, btnPrimario, btnSecundario, btnPeligro, Toggle, ImageField } from './ui';
import { PROGRAM_CATEGORIES, SECTIONS } from '../../../lib/programSpec';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

const PERSONAS: { key: string; label: string; hint?: string }[] = [
    { key: 'coordinator', label: 'Coordinador' },
    { key: 'communications', label: 'Responsable de comunicaciones' },
    { key: 'medicalReviewer', label: 'Revisor médico', hint: 'Sólo si el programa publica información clínica o educativa que lo requiera.' },
    { key: 'requestsManager', label: 'Responsable de solicitudes' },
    { key: 'requestsBackup', label: 'Responsable alterno de solicitudes' },
];
const CTA_TARGETS = [
    { id: 'orientacion', label: 'Formulario: Necesito orientación' }, { id: 'apoyo', label: 'Formulario: Quiero apoyar' }, { id: 'club', label: 'Formulario: Mi club quiere participar' },
    { id: 'novedades', label: 'Formulario: Novedades' }, { id: 'clinicas', label: 'Ir al directorio de clínicas' }, { id: 'donar', label: 'Ir a Cómo ayudar' }, { id: 'enlace', label: 'Enlace externo' },
];

const ProgramaFichaTab = ({ data, onChanged }: { data: Detalle; onChanged: () => void }) => {
    const editable = can(data.grant, 'editProgram');
    const activo = data.program.status === 'activo';
    const [p, setP] = useState<any>(() => structuredClone(data.program));
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState<{ field: string; message: string }[]>([]);
    const [pendiente, setPendiente] = useState('');
    useEffect(() => { setP(structuredClone(data.program)); }, [data.program]);

    const set = (path: string, v: any) => setP((prev: any) => {
        const next = structuredClone(prev); const keys = path.split('.'); let o = next;
        for (let i = 0; i < keys.length - 1; i++) { o[keys[i]] = o[keys[i]] ?? {}; o = o[keys[i]]; }
        o[keys[keys.length - 1]] = v; return next;
    });
    const get = (path: string) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), p);
    const errorDe = (k: string) => errores.find(x => x.field === k)?.message;

    const guardar = async () => {
        setGuardando(true); setErrores([]);
        try {
            await api(`/admin/${p.id}`, { method: 'PUT', body: JSON.stringify(p) });
            toast.success('Información guardada.'); onChanged();
        } catch (e: any) {
            if (e instanceof ApiError) { setErrores(e.errors); if (e.code === 'CLINICAL_LOCKED') toast.warning(e.message, { duration: 8000 }); else toast.error(e.message); }
            else toast.error(e?.message || 'No se pudo guardar.');
        } finally { setGuardando(false); }
    };
    const cambiarEstado = async (status: string) => {
        const reason = status === 'archivado' ? window.prompt('Motivo del archivo (queda en el historial):') : '';
        if (status === 'archivado' && reason === null) return;
        try {
            await api(`/admin/${p.id}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) });
            toast.success(status === 'activo' ? 'Programa publicado.' : status === 'archivado' ? 'Programa archivado.' : 'Programa devuelto a borrador.'); onChanged();
        } catch (e: any) { if (e instanceof ApiError && e.errors.length) setErrores(e.errors); toast.error(e?.message || 'No se pudo cambiar el estado.'); }
    };
    const moverSeccion = (i: number, dir: -1 | 1) => {
        const arr = [...(p.sections || [])]; const j = i + dir; if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]]; set('sections', arr.map((s: any, k: number) => ({ ...s, order: k })));
    };
    const sections: any[] = (p.sections?.length ? p.sections : SECTIONS.map((s, i) => ({ key: s.key, enabled: s.defaultEnabled, order: i, title: '' })));
    const ro = !editable;
    const clinicoBloqueado = activo && editable;

    return (
        <div className="space-y-5">
            {/* Publicación */}
            <Tarjeta title="Publicación" actions={<div className="flex flex-wrap gap-2">
                {can(data.grant, 'publish') && !activo ? <button type="button" className={btnPrimario} onClick={() => cambiarEstado('activo')} disabled={!data.publishCheck.ok}><CheckCircle2 className="w-4 h-4" /> Publicar programa</button> : null}
                {can(data.grant, 'publish') && activo ? <button type="button" className={btnSecundario} onClick={() => cambiarEstado('borrador')}>Volver a borrador</button> : null}
                {can(data.grant, 'archiveProgram') && data.program.status !== 'archivado' ? <button type="button" className={btnPeligro} onClick={() => cambiarEstado('archivado')}><Archive className="w-4 h-4" /> Archivar</button> : null}
            </div>}>
                {data.publishCheck.ok ? <p className="text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Cumple los requisitos de publicación.</p> : (
                    <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Para publicar faltan:</p>
                        <ul className="list-disc ml-5 mt-1 space-y-0.5">{data.publishCheck.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
                    </div>
                )}
                {editable ? (
                    <div className="mt-4">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Datos pendientes de validación</label>
                        <p className="text-[11px] text-gray-500 mb-2">Lo que todavía no está confirmado (clínicas, responsables, aliados, enlaces de donación, cifras…). Mientras la lista no esté vacía, el programa no se publica.</p>
                        <ul className="space-y-1">{(p.pendingValidation || []).map((x: string, i: number) => <li key={i} className="flex items-center gap-2 text-sm text-gray-700"><span className="flex-1">{x}</span><button type="button" className="text-gray-400 hover:text-rose-600" onClick={() => set('pendingValidation', p.pendingValidation.filter((_: string, k: number) => k !== i))} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button></li>)}</ul>
                        <div className="flex gap-2 mt-2"><input className={campo} value={pendiente} onChange={e => setPendiente(e.target.value)} placeholder="Añadir un pendiente…" /><button type="button" className={btnSecundario} onClick={() => { if (pendiente.trim()) { set('pendingValidation', [...(p.pendingValidation || []), pendiente.trim()]); setPendiente(''); } }}><Plus className="w-4 h-4" /></button></div>
                    </div>
                ) : null}
            </Tarjeta>

            {/* Identidad */}
            <Tarjeta title="Identidad">
                <div className="grid md:grid-cols-2 gap-4">
                    <Campo label="Nombre oficial" error={errorDe('name')}><input className={campo} value={p.name || ''} disabled={ro} onChange={e => set('name', e.target.value)} /></Campo>
                    <Campo label="Dirección (slug)" hint={`/programas/${p.slug || ''}`} error={errorDe('slug')}><input className={campo} value={p.slug || ''} disabled={ro} onChange={e => set('slug', e.target.value)} /></Campo>
                    <Campo label="Categoría"><select className={campo} value={p.category || 'otro'} disabled={ro} onChange={e => set('category', e.target.value)}>{PROGRAM_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Campo>
                    <Campo label="Sitio web oficial"><input className={campo} value={p.website || ''} disabled={ro} onChange={e => set('website', e.target.value)} placeholder="https://…" /></Campo>
                    <Campo label="Resumen (catálogo y redes)" className="md:col-span-2" error={errorDe('summary')}><textarea className={campo} rows={2} value={p.summary || ''} disabled={ro} onChange={e => set('summary', e.target.value)} /></Campo>
                    <Campo label="Descripción" className="md:col-span-2" error={errorDe('description')}><textarea className={campo} rows={8} value={p.description || ''} disabled={ro} onChange={e => set('description', e.target.value)} /></Campo>
                    <ImageField label="Logo" value={p.logoUrl || ''} onChange={v => set('logoUrl', v)} clubId={data.scope.siteId} />
                    <ImageField label="Imagen principal" value={p.heroImageUrl || ''} onChange={v => set('heroImageUrl', v)} alt={p.heroImageAlt || ''} onAlt={v => set('heroImageAlt', v)} clubId={data.scope.siteId} hint="Nunca fotografías de pacientes ni imágenes clínicas generadas con IA." />
                </div>
                <div className="grid md:grid-cols-3 gap-3 mt-4">
                    {['facebook', 'instagram', 'youtube', 'x', 'linkedin', 'tiktok', 'whatsapp'].map(k => <Campo key={k} label={`Red: ${k}`}><input className={campo} value={p.social?.[k] || ''} disabled={ro} onChange={e => set(`social.${k}`, e.target.value)} placeholder="https://…" /></Campo>)}
                </div>
                <div className="mt-5">
                    <div className="flex items-center justify-between mb-2"><h4 className="text-sm font-semibold text-gray-800">Organizaciones aliadas</h4>{editable ? <button type="button" className={btnSecundario} onClick={() => set('partners', [...(p.partners || []), { name: '', logoUrl: '', url: '', logoAuthorized: false, note: '' }])}><Plus className="w-4 h-4" /> Aliado</button> : null}</div>
                    {errorDe('partners') ? <p className="text-xs text-rose-600 mb-2">{errorDe('partners')}</p> : null}
                    <div className="space-y-3">
                        {(p.partners || []).map((a: any, i: number) => (
                            <div key={i} className="rounded-xl border border-gray-100 p-3 grid md:grid-cols-4 gap-3 items-start">
                                <Campo label="Nombre"><input className={campo} value={a.name} disabled={ro} onChange={e => set(`partners.${i}.name`, e.target.value)} /></Campo>
                                <Campo label="Enlace"><input className={campo} value={a.url} disabled={ro} onChange={e => set(`partners.${i}.url`, e.target.value)} /></Campo>
                                <div className="md:col-span-2 space-y-2">
                                    <ImageField label="Logo (sólo si está autorizado)" value={a.logoUrl} onChange={v => set(`partners.${i}.logoUrl`, v)} clubId={data.scope.siteId} />
                                    <div className="flex items-center justify-between gap-2"><Toggle checked={a.logoAuthorized === true} onChange={v => set(`partners.${i}.logoAuthorized`, v)} label="Logo autorizado por la organización" />{editable ? <button type="button" className="text-gray-400 hover:text-rose-600" onClick={() => set('partners', p.partners.filter((_: any, k: number) => k !== i))} aria-label="Quitar aliado"><Trash2 className="w-4 h-4" /></button> : null}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Tarjeta>

            {/* Gobernanza */}
            <Tarjeta title="Gobernanza">
                <div className="grid md:grid-cols-2 gap-4">
                    {PERSONAS.map(per => (
                        <div key={per.key} className="rounded-xl border border-gray-100 p-3 space-y-2">
                            <p className="text-sm font-semibold text-gray-800">{per.label}</p>
                            {per.hint ? <p className="text-[11px] text-gray-500">{per.hint}</p> : null}
                            <input className={campo} placeholder="Nombre" value={get(`governance.${per.key}.name`) || ''} disabled={ro} onChange={e => set(`governance.${per.key}.name`, e.target.value)} />
                            <div className="grid grid-cols-2 gap-2">
                                <input className={campo} placeholder="Correo" value={get(`governance.${per.key}.email`) || ''} disabled={ro} onChange={e => set(`governance.${per.key}.email`, e.target.value)} />
                                <input className={campo} placeholder="Teléfono" value={get(`governance.${per.key}.phone`) || ''} disabled={ro} onChange={e => set(`governance.${per.key}.phone`, e.target.value)} />
                            </div>
                            {errorDe(`governance.${per.key}.email`) ? <p className="text-xs text-rose-600">{errorDe(`governance.${per.key}.email`)}</p> : null}
                            {per.key === 'coordinator' ? <Toggle checked={get('governance.coordinator.public') === true} onChange={v => set('governance.coordinator.public', v)} label="Mostrar su nombre en la página pública" /> : null}
                        </div>
                    ))}
                    <Campo label="Correo institucional" error={errorDe('governance.institutionalEmail')}><input className={campo} value={p.governance?.institutionalEmail || ''} disabled={ro} onChange={e => set('governance.institutionalEmail', e.target.value)} /><div className="mt-2"><Toggle checked={p.governance?.institutionalEmailPublic === true} onChange={v => set('governance.institutionalEmailPublic', v)} label="Publicar este correo" hint="Apagado: sólo recibe las solicitudes." /></div></Campo>
                    <Campo label="Teléfono institucional"><input className={campo} value={p.governance?.institutionalPhone || ''} disabled={ro} onChange={e => set('governance.institutionalPhone', e.target.value)} /><div className="mt-2"><Toggle checked={p.governance?.institutionalPhonePublic === true} onChange={v => set('governance.institutionalPhonePublic', v)} label="Publicar este teléfono" /></div></Campo>
                    <Campo label="Última verificación de la información" error={errorDe('governance.lastVerifiedAt')}><input type="date" className={campo} value={p.governance?.lastVerifiedAt || ''} disabled={ro} onChange={e => set('governance.lastVerifiedAt', e.target.value)} /></Campo>
                    <Campo label="Verificado por"><input className={campo} value={p.governance?.lastVerifiedBy || ''} disabled={ro} onChange={e => set('governance.lastVerifiedBy', e.target.value)} /></Campo>
                </div>
            </Tarjeta>

            {/* Atención */}
            <Tarjeta title="Atención" actions={clinicoBloqueado ? <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><Lock className="w-3 h-3" /> Texto clínico: cambia por solicitud</span> : null}>
                <div className="grid md:grid-cols-2 gap-4">
                    <Campo label="Público al que se dirige"><textarea className={campo} rows={3} value={p.care?.audience || ''} disabled={ro} onChange={e => set('care.audience', e.target.value)} /></Campo>
                    <Campo label="Cobertura territorial"><textarea className={campo} rows={3} value={p.care?.coverage || ''} disabled={ro} onChange={e => set('care.coverage', e.target.value)} /></Campo>
                    <Campo label="Ruta de orientación" hint={clinicoBloqueado ? 'Bloqueado con el programa activo: usa «Gestión de contenidos → Información institucional».' : 'Requiere revisión médica al publicar.'}><textarea className={campo} rows={5} value={p.care?.guidancePath || ''} disabled={ro || clinicoBloqueado} onChange={e => set('care.guidancePath', e.target.value)} /></Campo>
                    <Campo label="Condiciones de acceso" hint={clinicoBloqueado ? 'Bloqueado con el programa activo.' : undefined}><textarea className={campo} rows={5} value={p.care?.accessConditions || ''} disabled={ro || clinicoBloqueado} onChange={e => set('care.accessConditions', e.target.value)} /></Campo>
                    <Campo label="Canales oficiales"><textarea className={campo} rows={3} value={p.care?.officialChannels || ''} disabled={ro} onChange={e => set('care.officialChannels', e.target.value)} /></Campo>
                    <Campo label="Texto aprobado sobre costos, gratuidad o aseguramiento" error={errorDe('care.costsText')} hint={clinicoBloqueado ? 'Bloqueado con el programa activo.' : 'Sólo se publica si está marcado como aprobado.'}>
                        <textarea className={campo} rows={3} value={p.care?.costsText || ''} disabled={ro || clinicoBloqueado} onChange={e => set('care.costsText', e.target.value)} />
                        <div className="mt-2 space-y-2"><Toggle checked={p.care?.costsApproved === true} onChange={v => set('care.costsApproved', v)} label="Texto aprobado" /><div className="grid grid-cols-2 gap-2"><input className={campo} placeholder="Aprobado por" value={p.care?.costsApprovedBy || ''} disabled={ro} onChange={e => set('care.costsApprovedBy', e.target.value)} /><input type="date" className={campo} value={p.care?.costsApprovedAt || ''} disabled={ro} onChange={e => set('care.costsApprovedAt', e.target.value)} /></div></div>
                    </Campo>
                </div>
                {p.care?.medicalApprovedAt ? <p className="text-xs text-emerald-700 mt-3">Aprobación médica registrada el {p.care.medicalApprovedAt}{p.care.medicalApprovedBy ? ` por ${p.care.medicalApprovedBy}` : ''}.</p> : null}
            </Tarjeta>

            {/* Participación */}
            <Tarjeta title="Participación">
                <div className="grid md:grid-cols-2 gap-4">
                    <Campo label="Formas de apoyar"><textarea className={campo} rows={4} value={p.participation?.waysToSupport || ''} disabled={ro} onChange={e => set('participation.waysToSupport', e.target.value)} /></Campo>
                    <Campo label="Participación de clubes"><textarea className={campo} rows={4} value={p.participation?.clubParticipation || ''} disabled={ro} onChange={e => set('participation.clubParticipation', e.target.value)} /></Campo>
                    <Campo label="Voluntariado"><textarea className={campo} rows={3} value={p.participation?.volunteering || ''} disabled={ro} onChange={e => set('participation.volunteering', e.target.value)} /></Campo>
                    <Campo label="Alianzas empresariales"><textarea className={campo} rows={3} value={p.participation?.corporateAlliances || ''} disabled={ro} onChange={e => set('participation.corporateAlliances', e.target.value)} /></Campo>
                    <div className="md:col-span-2 rounded-xl border border-gray-100 p-3 space-y-2">
                        <Toggle checked={p.participation?.donationsEnabled === true} onChange={v => set('participation.donationsEnabled', v)} label="Mostrar donaciones" hint="Los enlaces de donación se cargan como contenido (Gestión de contenidos → Enlace de donación), con entidad receptora, finalidad y verificación. Sólo enlaces externos oficiales; la plataforma no procesa pagos." />
                        <input className={campo} placeholder="Texto introductorio del bloque de donaciones" value={p.participation?.donationsIntro || ''} disabled={ro} onChange={e => set('participation.donationsIntro', e.target.value)} />
                    </div>
                </div>
            </Tarjeta>

            {/* Secciones y CTAs */}
            <Tarjeta title="Secciones de la página pública">
                <p className="text-[11px] text-gray-500 mb-3">Activa, desactiva y ordena. Una sección activa sin contenido no se publica.</p>
                <ul className="space-y-2">
                    {sections.map((s: any, i: number) => (
                        <li key={s.key} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2">
                            <Toggle checked={s.enabled !== false} onChange={v => set(`sections.${i}.enabled`, v)} label={SECTIONS.find(x => x.key === s.key)?.label || s.key} />
                            <input className={`${campo} max-w-xs ml-auto`} placeholder="Título personalizado (opcional)" value={s.title || ''} disabled={ro} onChange={e => set(`sections.${i}.title`, e.target.value)} />
                            {editable ? <><button type="button" className="p-1 text-gray-400 hover:text-gray-700" onClick={() => moverSeccion(i, -1)} aria-label="Subir"><ArrowUp className="w-4 h-4" /></button><button type="button" className="p-1 text-gray-400 hover:text-gray-700" onClick={() => moverSeccion(i, 1)} aria-label="Bajar"><ArrowDown className="w-4 h-4" /></button></> : null}
                        </li>
                    ))}
                </ul>
                <div className="mt-5">
                    <div className="flex items-center justify-between mb-2"><h4 className="text-sm font-semibold text-gray-800">Llamados a la acción (portada)</h4>{editable ? <button type="button" className={btnSecundario} onClick={() => set('ctas', [...(p.ctas || []), { label: '', target: 'orientacion', href: '', enabled: true }])}><Plus className="w-4 h-4" /> Llamado</button> : null}</div>
                    {errorDe('ctas') ? <p className="text-xs text-rose-600 mb-2">{errorDe('ctas')}</p> : null}
                    <div className="space-y-2">
                        {(p.ctas || []).map((c: any, i: number) => (
                            <div key={i} className="grid md:grid-cols-4 gap-2 items-center rounded-xl border border-gray-100 p-2">
                                <input className={campo} placeholder="Texto del botón" value={c.label} disabled={ro} onChange={e => set(`ctas.${i}.label`, e.target.value)} />
                                <select className={campo} value={c.target} disabled={ro} onChange={e => set(`ctas.${i}.target`, e.target.value)}>{CTA_TARGETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
                                <input className={campo} placeholder="https://… (sólo enlace externo)" value={c.href || ''} disabled={ro || c.target !== 'enlace'} onChange={e => set(`ctas.${i}.href`, e.target.value)} />
                                <div className="flex items-center justify-between gap-2"><Toggle checked={c.enabled !== false} onChange={v => set(`ctas.${i}.enabled`, v)} label="Visible" />{editable ? <button type="button" className="text-gray-400 hover:text-rose-600" onClick={() => set('ctas', p.ctas.filter((_: any, k: number) => k !== i))} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button> : null}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </Tarjeta>

            {/* Formularios y enrutamiento */}
            <Tarjeta title="Formularios públicos y quién los atiende">
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        {[['orientacion', 'Necesito orientación'], ['apoyo', 'Quiero apoyar'], ['club', 'Mi club quiere participar']].map(([k, l]) => <Toggle key={k} checked={p.formsEnabled?.[k] !== false} onChange={v => set(`formsEnabled.${k}`, v)} label={l} />)}
                        <Toggle checked={p.newsletterEnabled !== false} onChange={v => set('newsletterEnabled', v)} label="Quiero recibir novedades" hint="Consentimiento independiente: quien pide orientación o apoyo no queda suscrito." />
                    </div>
                    <div className="space-y-3">
                        {[['orientacion', 'Orientación'], ['apoyo', 'Apoyo'], ['club', 'Clubes']].map(([k, l]) => (
                            <div key={k} className="rounded-xl border border-gray-100 p-3">
                                <p className="text-xs font-semibold text-gray-700 mb-1">Solicitudes de {l.toLowerCase()}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <select className={campo} value={p.requestRouting?.[k]?.assigneeUserId || ''} disabled={ro} onChange={e => { const m = data.members.find(x => x.userId === e.target.value); set(`requestRouting.${k}.assigneeUserId`, e.target.value); set(`requestRouting.${k}.assigneeName`, m?.name || m?.email || ''); }}>
                                        <option value="">Sin asignación automática</option>{data.members.filter(m => m.userId && m.active).map(m => <option key={m.id} value={m.userId}>{m.name || m.email}</option>)}
                                    </select>
                                    <select className={campo} value={p.requestRouting?.[k]?.backupUserId || ''} disabled={ro} onChange={e => { const m = data.members.find(x => x.userId === e.target.value); set(`requestRouting.${k}.backupUserId`, e.target.value); set(`requestRouting.${k}.backupName`, m?.name || m?.email || ''); }}>
                                        <option value="">Sin alterno</option>{data.members.filter(m => m.userId && m.active).map(m => <option key={m.id} value={m.userId}>{m.name || m.email}</option>)}
                                    </select>
                                </div>
                                <input className={`${campo} mt-2`} placeholder="Correos de aviso (separados por coma)" value={(p.requestRouting?.[k]?.notifyEmails || []).join(', ')} disabled={ro} onChange={e => set(`requestRouting.${k}.notifyEmails`, e.target.value.split(',').map(x => x.trim()).filter(Boolean))} />
                            </div>
                        ))}
                        <p className="text-[11px] text-gray-500">Los responsables se eligen entre quienes tienen perfil en el programa (pestaña «Responsables y distritos»).</p>
                    </div>
                </div>
            </Tarjeta>

            <Tarjeta title="SEO y compartir en redes">
                <div className="grid md:grid-cols-2 gap-4">
                    <Campo label="Título (máx. 70)"><input className={campo} maxLength={70} value={p.seo?.title || ''} disabled={ro} onChange={e => set('seo.title', e.target.value)} /></Campo>
                    <Campo label="Descripción (máx. 170)"><input className={campo} maxLength={170} value={p.seo?.description || ''} disabled={ro} onChange={e => set('seo.description', e.target.value)} /></Campo>
                    <ImageField label="Imagen para compartir" value={p.seo?.image || ''} onChange={v => set('seo.image', v)} clubId={data.scope.siteId} hint="Si falta, se usa la imagen principal o el logo." />
                </div>
            </Tarjeta>

            {editable ? <div className="sticky bottom-3 flex justify-end"><button type="button" className={btnPrimario} disabled={guardando} onClick={guardar}><Save className="w-4 h-4" /> Guardar información</button></div> : null}
        </div>
    );
};

export default ProgramaFichaTab;
