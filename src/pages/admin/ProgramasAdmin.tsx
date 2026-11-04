/**
 * Programas — listado administrativo (v4.1280.0)
 *
 * `/admin/programas`. El servidor devuelve sólo lo que la sesión alcanza:
 * el operador todo; el sitio del distrito lo vinculado a sus distritos; el
 * sitio de un club lo disponible para activar y lo que activó; un responsable
 * con perfil, sus programas.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, RefreshCw, HeartHandshake, Building2, Users, Inbox, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import AdminLayout from '../../components/admin/AdminLayout';
import { api, qs, ApiError } from '../../components/admin/programas/api';
import { Chip, Campo, campo, btnPrimario, btnSecundario, Drawer, Paginacion, Vacio, Cargando } from '../../components/admin/programas/ui';
import { PROGRAM_STATES, PROGRAM_CATEGORIES, RELATION_TYPES, slugify } from '../../lib/programSpec';

interface Fila { id: string; slug: string; name: string; summary: string; category: string; status: string; logoUrl?: string; links: { districtNumber: number; status: string; relationType: string }[]; activeClubs: number; pendingChanges: number; newRequests: number; clinics: number; abilities: string[]; myActivation?: { id: string; status: string } | null }
interface Contexto { scope: { operator: boolean; siteAdmin: boolean; siteIsDistrict: boolean; siteName: string; districtNumbers: number[] }; canCreate: boolean; districts: { number: number; label: string }[] }

const ProgramasAdmin = () => {
    const navigate = useNavigate();
    const [ctx, setCtx] = useState<Contexto | null>(null);
    const [f, setF] = useState({ q: '', status: '', category: '', district: '', page: 1 });
    const [q, setQ] = useState('');
    const [data, setData] = useState<{ rows: Fila[]; total: number; perPage: number } | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const [nuevo, setNuevo] = useState(false);
    const [form, setForm] = useState({ name: '', slug: '', summary: '', category: 'salud', districtNumber: '', relationType: 'respaldo_institucional' });
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState<{ field: string; message: string }[]>([]);

    useEffect(() => { const t = setTimeout(() => setF(p => ({ ...p, q, page: 1 })), 350); return () => clearTimeout(t); }, [q]);

    const cargar = useCallback(async () => {
        setCargando(true); setError('');
        try {
            const [c, d] = await Promise.all([ctx ? Promise.resolve(ctx) : api<Contexto>('/admin/context'), api<any>(`/admin/list?${qs(f)}`)]);
            if (!ctx) { setCtx(c); setForm(p => ({ ...p, districtNumber: p.districtNumber || String(c.scope.districtNumbers[0] || '') })); }
            setData(d);
        } catch (e: any) { setError(e?.message || 'No se pudo cargar.'); }
        finally { setCargando(false); }
    }, [f, ctx]);
    useEffect(() => { cargar(); }, [cargar]);

    const crear = async (e: FormEvent) => {
        e.preventDefault();
        setGuardando(true); setErrores([]);
        try {
            const r = await api<{ program: { id: string } }>('/admin', { method: 'POST', body: JSON.stringify({ ...form, slug: form.slug || slugify(form.name) }) });
            toast.success('Programa creado en borrador.');
            navigate(`/admin/programas/${r.program.id}`);
        } catch (err: any) {
            if (err instanceof ApiError) setErrores(err.errors);
            toast.error(err?.message || 'No se pudo crear.');
        } finally { setGuardando(false); }
    };
    const errorDe = (k: string) => errores.find(x => x.field === k)?.message;

    return (
        <AdminLayout>
            <div className="space-y-5">
                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><HeartHandshake className="w-5 h-5 text-rotary-blue" /> Programas</h1>
                        <p className="text-sm text-gray-500 mt-1">{ctx?.scope.siteIsDistrict ? `Programas que el Distrito ${ctx.scope.districtNumbers.join(', ')} respalda, difunde o apoya.` : ctx?.scope.operator ? 'Todos los programas de la plataforma.' : 'Programas disponibles para tu club y los que activaste en tu sitio.'}</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className={btnSecundario} onClick={cargar}><RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar</button>
                        {ctx?.canCreate ? <button type="button" className={btnPrimario} onClick={() => setNuevo(true)}><Plus className="w-4 h-4" /> Nuevo programa</button> : null}
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <label className="relative"><Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" /><input className={`${campo} pl-9`} placeholder="Buscar por nombre o resumen" value={q} onChange={e => setQ(e.target.value)} /></label>
                    <select className={campo} value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value, page: 1 }))}><option value="">Todos los estados</option>{Object.values(PROGRAM_STATES).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                    <select className={campo} value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value, page: 1 }))}><option value="">Todas las categorías</option>{PROGRAM_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                    <select className={campo} value={f.district} onChange={e => setF(p => ({ ...p, district: e.target.value, page: 1 }))}><option value="">Todos los distritos</option>{(ctx?.districts || []).map(d => <option key={d.number} value={d.number}>{d.label}</option>)}</select>
                </div>

                {error ? <p role="alert" className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm">{error}</p> : null}
                {!data ? <Cargando /> : data.rows.length === 0 ? (
                    <Vacio texto={ctx?.canCreate ? 'Todavía no hay programas. Crea el primero en borrador y complétalo con calma.' : 'No hay programas disponibles para este sitio.'}>
                        {ctx?.canCreate ? <button type="button" className={btnPrimario} onClick={() => setNuevo(true)}><Plus className="w-4 h-4" /> Nuevo programa</button> : null}
                    </Vacio>
                ) : (
                    <ul className="grid md:grid-cols-2 gap-4">
                        {data.rows.map(p => (
                            <li key={p.id}>
                                <Link to={`/admin/programas/${p.id}`} className="block rounded-2xl border border-gray-100 bg-white shadow-sm p-5 hover:border-rotary-blue/40 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">{p.logoUrl ? <img src={p.logoUrl} alt="" className="w-full h-full object-contain" /> : <HeartHandshake className="w-6 h-6 text-gray-300" />}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-gray-900 truncate">{p.name}</h2><Chip spec={PROGRAM_STATES} id={p.status} />{p.myActivation?.status === 'activa' ? <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Activo en tu sitio</span> : null}</div>
                                            <p className="text-xs text-gray-500 mt-0.5">/programas/{p.slug} · {PROGRAM_CATEGORIES.find(c => c.id === p.category)?.label || p.category}</p>
                                            <p className="text-sm text-gray-600 mt-2 line-clamp-2">{p.summary || 'Sin resumen todavía.'}</p>
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-3">
                                                <span className="inline-flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {p.links.map(l => `D${l.districtNumber}`).join(', ') || 'Sin distrito'}</span>
                                                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {p.activeClubs} clubes</span>
                                                {p.pendingChanges ? <span className="inline-flex items-center gap-1 text-amber-700"><ClipboardList className="w-3.5 h-3.5" /> {p.pendingChanges} por revisar</span> : null}
                                                {p.newRequests ? <span className="inline-flex items-center gap-1 text-sky-700"><Inbox className="w-3.5 h-3.5" /> {p.newRequests} solicitudes nuevas</span> : null}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
                {data ? <Paginacion page={f.page} total={data.total} perPage={data.perPage} onPage={p => setF(x => ({ ...x, page: p }))} /> : null}
            </div>

            {nuevo ? (
                <Drawer title="Nuevo programa" subtitle="Se crea en borrador. Los requisitos de publicación se exigen sólo al publicar." onClose={() => setNuevo(false)}
                    footer={<><button type="button" className={btnSecundario} onClick={() => setNuevo(false)}>Cancelar</button><button type="submit" form="form-nuevo-programa" className={btnPrimario} disabled={guardando}>Crear en borrador</button></>}>
                    <form id="form-nuevo-programa" onSubmit={crear} className="space-y-4" noValidate>
                        <Campo label="Nombre oficial" error={errorDe('name')}><input className={campo} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value, slug: p.slug ? p.slug : '' }))} autoFocus /></Campo>
                        <Campo label="Dirección (slug)" hint={`La página pública será /programas/${form.slug || slugify(form.name) || '…'}`} error={errorDe('slug')}><input className={campo} value={form.slug} placeholder={slugify(form.name)} onChange={e => setForm(p => ({ ...p, slug: slugify(e.target.value) }))} /></Campo>
                        <Campo label="Resumen (opcional por ahora)"><textarea className={campo} rows={3} value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} /></Campo>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Campo label="Categoría"><select className={campo} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>{PROGRAM_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Campo>
                            <Campo label="Distrito que lo vincula" hint="Se crea la vinculación distrital inicial."><input className={campo} inputMode="numeric" value={form.districtNumber} disabled={!ctx?.scope.operator} onChange={e => setForm(p => ({ ...p, districtNumber: e.target.value.replace(/\D/g, '') }))} /></Campo>
                        </div>
                        <Campo label="Tipo de relación" hint="Ninguna implica que el distrito opere el servicio ni reciba donaciones; eso lo dice el texto de la vinculación."><select className={campo} value={form.relationType} onChange={e => setForm(p => ({ ...p, relationType: e.target.value }))}>{RELATION_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Campo>
                    </form>
                </Drawer>
            ) : null}
        </AdminLayout>
    );
};

export default ProgramasAdmin;
