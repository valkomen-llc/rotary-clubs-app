/**
 * Programas — pestaña «Responsables y distritos» (v4.1280.0):
 * la vinculación distrital (tipo de relación, estado, presentación, contacto,
 * menú y catálogo) y los responsables con perfil por programa.
 */
import { useState } from 'react';
import { Plus, Save, Trash2, Building2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, can, ApiError } from './api';
import { Tarjeta, Campo, campo, btnPrimario, btnSecundario, Toggle, Chip } from './ui';
import { RELATION_TYPES, LINK_STATES, PROGRAM_ROLES } from '../../../lib/programSpec';
import type { Detalle } from '../../../pages/admin/ProgramaAdminDetalle';

const vacio = (districtNumber: number | string = '') => ({ districtNumber, relationType: 'respaldo_institucional', relationDescription: '', status: 'activa', presentation: '', contact: { name: '', role: '', email: '', phone: '', public: false }, disclaimer: '', showInMenu: true, showInCatalog: true, allowClubActivation: true });

const ProgramaVinculosTab = ({ data, onChanged }: { data: Detalle; onChanged: () => void }) => {
    const puedeVincular = can(data.grant, 'manageLinks');
    const puedeMiembros = can(data.grant, 'manageMembers');
    const [link, setLink] = useState<any>(null);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState<{ field: string; message: string }[]>([]);
    const [m, setM] = useState<any>({ email: '', name: '', roles: [] as string[], scopeType: 'central', districtNumber: data.scope.districtNumbers[0] || '', clubId: '' });
    const errorDe = (k: string) => errores.find(x => x.field === k)?.message;

    const guardarLink = async () => {
        setGuardando(true); setErrores([]);
        try { await api(`/admin/${data.program.id}/links`, { method: 'PUT', body: JSON.stringify(link) }); toast.success('Vinculación guardada.'); setLink(null); onChanged(); }
        catch (e: any) { if (e instanceof ApiError) setErrores(e.errors); toast.error(e?.message || 'No se pudo guardar.'); }
        finally { setGuardando(false); }
    };
    const guardarMiembro = async () => {
        setGuardando(true);
        try { await api(`/admin/${data.program.id}/members`, { method: 'POST', body: JSON.stringify(m) }); toast.success('Responsable guardado.'); setM({ ...m, email: '', name: '', roles: [] }); onChanged(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo guardar.'); }
        finally { setGuardando(false); }
    };
    const quitarMiembro = async (id: string) => {
        if (!window.confirm('¿Quitar este responsable del programa?')) return;
        try { await api(`/admin/${data.program.id}/members/${id}`, { method: 'DELETE' }); toast.success('Responsable retirado.'); onChanged(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo retirar.'); }
    };

    return (
        <div className="space-y-5">
            <Tarjeta title={<span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-rotary-blue" /> Vinculaciones distritales</span>}
                actions={puedeVincular ? <button type="button" className={btnSecundario} onClick={() => setLink(vacio(data.scope.operator ? '' : data.scope.districtNumbers[0] || ''))}><Plus className="w-4 h-4" /> Vincular distrito</button> : null}>
                <p className="text-[11px] text-gray-500 mb-3">Un programa es una identidad única: puede vincularse con varios distritos sin duplicarse. La relación institucional no implica que el distrito opere el servicio ni reciba donaciones.</p>
                {data.links.length === 0 ? <p className="text-sm text-gray-500">Sin vinculaciones todavía. El programa no se publica sin al menos una activa.</p> : (
                    <ul className="space-y-2">
                        {data.links.map((l: any) => (
                            <li key={l.id} className="rounded-xl border border-gray-100 p-3 flex flex-wrap items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 flex items-center gap-2">Distrito {l.districtNumber} <Chip spec={LINK_STATES} id={l.status} /></p>
                                    <p className="text-xs text-gray-500">{RELATION_TYPES.find(r => r.id === l.relationType)?.label}{l.relationDescription ? ` · ${l.relationDescription}` : ''} · {l.activeClubs} clubes activos · {l.showInMenu ? 'en el menú' : 'fuera del menú'} · {l.allowClubActivation ? 'clubes pueden activar' : 'sin activación por clubes'}</p>
                                </div>
                                {puedeVincular && (data.grant.all || data.grant.districtNumbers.includes(Number(l.districtNumber))) ? <button type="button" className={btnSecundario} onClick={() => { setErrores([]); setLink({ ...vacio(l.districtNumber), ...l, contact: l.contact || vacio().contact }); }}>Editar</button> : null}
                            </li>
                        ))}
                    </ul>
                )}
                {link ? (
                    <div className="mt-4 rounded-2xl border border-rotary-blue/20 bg-sky-50/40 p-4 space-y-3">
                        <div className="grid md:grid-cols-3 gap-3">
                            <Campo label="Distrito" error={errorDe('districtNumber')}><input className={campo} inputMode="numeric" value={link.districtNumber} disabled={!data.scope.operator || Boolean(link.id)} onChange={e => setLink({ ...link, districtNumber: e.target.value.replace(/\D/g, '') })} /></Campo>
                            <Campo label="Tipo de relación"><select className={campo} value={link.relationType} onChange={e => setLink({ ...link, relationType: e.target.value })}>{RELATION_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Campo>
                            <Campo label="Estado"><select className={campo} value={link.status} onChange={e => setLink({ ...link, status: e.target.value })}>{Object.values(LINK_STATES).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Campo>
                        </div>
                        <Campo label="Descripción de la relación" error={errorDe('relationDescription')}><input className={campo} value={link.relationDescription} onChange={e => setLink({ ...link, relationDescription: e.target.value })} placeholder="Qué hace y qué no hace el distrito respecto del programa" /></Campo>
                        <Campo label="Presentación distrital (se muestra en la página)"><textarea className={campo} rows={4} value={link.presentation} onChange={e => setLink({ ...link, presentation: e.target.value })} /></Campo>
                        <Campo label="Aclaración pública (opcional)" hint="Por ejemplo: «El Distrito difunde el programa; la atención la presta la fundación X.»"><input className={campo} value={link.disclaimer} onChange={e => setLink({ ...link, disclaimer: e.target.value })} /></Campo>
                        <div className="grid md:grid-cols-4 gap-2">
                            <input className={campo} placeholder="Contacto: nombre" value={link.contact.name} onChange={e => setLink({ ...link, contact: { ...link.contact, name: e.target.value } })} />
                            <input className={campo} placeholder="Cargo" value={link.contact.role} onChange={e => setLink({ ...link, contact: { ...link.contact, role: e.target.value } })} />
                            <input className={campo} placeholder="Correo" value={link.contact.email} onChange={e => setLink({ ...link, contact: { ...link.contact, email: e.target.value } })} />
                            <input className={campo} placeholder="Teléfono" value={link.contact.phone} onChange={e => setLink({ ...link, contact: { ...link.contact, phone: e.target.value } })} />
                        </div>
                        {errorDe('contact.email') ? <p className="text-xs text-rose-600">{errorDe('contact.email')}</p> : null}
                        <div className="grid md:grid-cols-2 gap-2">
                            <Toggle checked={link.contact.public === true} onChange={v => setLink({ ...link, contact: { ...link.contact, public: v } })} label="Publicar el contacto distrital" />
                            <Toggle checked={link.showInMenu !== false} onChange={v => setLink({ ...link, showInMenu: v })} label="Mostrar en el menú del sitio del distrito" />
                            <Toggle checked={link.showInCatalog !== false} onChange={v => setLink({ ...link, showInCatalog: v })} label="Mostrar en el catálogo público /programas" />
                            <Toggle checked={link.allowClubActivation !== false} onChange={v => setLink({ ...link, allowClubActivation: v })} label="Los clubes del distrito pueden activarlo" />
                        </div>
                        <div className="flex gap-2 justify-end"><button type="button" className={btnSecundario} onClick={() => setLink(null)}>Cancelar</button><button type="button" className={btnPrimario} disabled={guardando} onClick={guardarLink}><Save className="w-4 h-4" /> Guardar vinculación</button></div>
                    </div>
                ) : null}
            </Tarjeta>

            <Tarjeta title={<span className="flex items-center gap-2"><Users className="w-4 h-4 text-rotary-blue" /> Responsables y perfiles</span>}>
                <p className="text-[11px] text-gray-500 mb-3">Una persona puede asumir varios perfiles. El perfil abre acciones sobre ESTE programa; el acceso al panel lo da su cuenta de siempre.</p>
                {data.members.length === 0 ? <p className="text-sm text-gray-500">Sin responsables con perfil todavía.</p> : (
                    <ul className="divide-y divide-gray-100">
                        {data.members.filter((x: any) => x.active !== false).map((x: any) => (
                            <li key={x.id} className="py-2 flex flex-wrap items-center gap-3">
                                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900">{x.name || x.email}</p><p className="text-xs text-gray-500">{x.email}{x.userId ? '' : ' · sin cuenta en la plataforma todavía'} · {x.scopeType === 'club' ? 'club' : x.scopeType === 'district' ? `distrito ${x.districtNumber}` : 'central'}</p></div>
                                <div className="flex flex-wrap gap-1">{(x.roles || []).map((r: string) => <span key={r} className="text-[11px] bg-rotary-blue/10 text-rotary-blue rounded-full px-2 py-0.5">{PROGRAM_ROLES.find(p => p.id === r)?.label || r}</span>)}</div>
                                {puedeMiembros ? <button type="button" className="text-gray-400 hover:text-rose-600" onClick={() => quitarMiembro(x.id)} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button> : null}
                            </li>
                        ))}
                    </ul>
                )}
                {puedeMiembros ? (
                    <div className="mt-4 rounded-2xl border border-gray-100 p-4 space-y-3">
                        <div className="grid md:grid-cols-3 gap-2">
                            <input className={campo} placeholder="Correo" value={m.email} onChange={e => setM({ ...m, email: e.target.value })} />
                            <input className={campo} placeholder="Nombre" value={m.name} onChange={e => setM({ ...m, name: e.target.value })} />
                            <select className={campo} value={m.scopeType} onChange={e => setM({ ...m, scopeType: e.target.value })}><option value="central">Alcance: central</option><option value="district">Alcance: un distrito</option><option value="club">Alcance: un club</option></select>
                        </div>
                        {m.scopeType === 'district' ? <input className={campo} inputMode="numeric" placeholder="Número de distrito" value={m.districtNumber} onChange={e => setM({ ...m, districtNumber: e.target.value.replace(/\D/g, '') })} /> : null}
                        {m.scopeType === 'club' ? <select className={campo} value={m.clubId} onChange={e => setM({ ...m, clubId: e.target.value })}><option value="">Elige el club participante…</option>{data.activations.map((a: any) => <option key={a.id} value={a.clubId}>{a.clubName}</option>)}</select> : null}
                        <div className="grid sm:grid-cols-2 gap-2">
                            {PROGRAM_ROLES.map(r => <Toggle key={r.id} checked={m.roles.includes(r.id)} onChange={v => setM({ ...m, roles: v ? [...m.roles, r.id] : m.roles.filter((x: string) => x !== r.id) })} label={r.label} hint={r.help} />)}
                        </div>
                        <div className="flex justify-end"><button type="button" className={btnPrimario} disabled={guardando} onClick={guardarMiembro}><Plus className="w-4 h-4" /> Agregar responsable</button></div>
                    </div>
                ) : null}
            </Tarjeta>
        </div>
    );
};

export default ProgramaVinculosTab;
