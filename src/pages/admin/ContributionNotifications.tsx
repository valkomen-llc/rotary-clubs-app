import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import MediaPicker from '../../components/admin/content-studio/MediaPicker';
import { toast } from 'sonner';
import {
    Mail, Plus, Save, Trash2, Send, Eye, Building2, Users, FileText,
    AlertTriangle, Info, Loader2, Monitor, Smartphone, History,
    Image as ImageIcon, Search, X,
} from 'lucide-react';

// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — el panel del Administrador Central
// v4.857.0 (Fase 2)
//
// Tres cosas y en este orden, que es el orden en que hay que configurarlas:
// la ENTIDAD que recibe, el PERFIL que decide a quién se le escribe y desde
// dónde, y la PLANTILLA del correo.
//
// ── DESDE v4.857 ESTO GOBIERNA EL RECIBO REAL ───────────────────────
//
// Un perfil activo que alcance a un sitio decide la confirmación de cada
// aporte de ese sitio. Un sitio sin perfil sigue recibiendo el recibo de
// siempre. La pantalla DICE desde qué dirección va a salir y por qué, porque
// «no salió desde mi dominio» es la pregunta que este módulo tiene que poder
// contestar sin que nadie mire el código.
// ════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const auth = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

interface Beneficiary {
    id: string; legalName: string; tradeName: string; taxId: string | null;
    logoUrl: string | null; email: string | null; website: string | null;
    phone: string | null; address: string | null; contactName: string | null;
    notes: string | null; active: boolean;
}
interface Validation { ok: boolean; errors: string[]; warnings: string[] }
interface Profile {
    id: string; name: string; active: boolean; isDefault: boolean; priority: number;
    beneficiaryId: string | null;
    identity: { fromName?: string; replyTo?: string; logoUrl?: string; signature?: string; primaryColor?: string; ctaColor?: string; footer?: string; legalText?: string };
    routing: { prefer?: string; allowSiteDomain?: boolean; localPart?: string };
    events: Record<string, Record<string, boolean>>;
    targeting: { mode: string; districts: string[]; clubIds: string[] };
    internalRecipients: string[];
    notes: string | null;
    beneficiary?: Beneficiary | null;
    validation?: Validation;
}
interface Block { type: string; text?: string; title?: string; align?: string; url?: string }
interface Template { subject: string; preheader: string; blocks: Block[] }
interface Sender {
    name: string | null; replyTo: string | null; address: string;
    level: number; reason: string; domain: string;
    site?: { id: string; name: string; domain: string } | null;
}
interface DomainReport {
    central: { domain: string; verified: boolean };
    domains: { domain: string; verified: boolean; status: string | null; checkedAt: string }[];
    sites: { id: string; name: string; domain: string; verified: boolean }[];
}
interface Options {
    events: { id: string; label: string; help: string }[];
    unavailableEvents: { id: string; label: string; help: string; source: string }[];
    recipientKinds: { id: string; label: string; help: string }[];
    preferredSenders: string[];
    variables: { id: string; label: string; sample: string }[];
    blockTypes: { id: string; label: string; fields: string[] }[];
    sites: { id: string; name: string; district: string | null; districtId: string | null }[];
    defaultEvents: Record<string, Record<string, boolean>>;
}

const lbl = 'text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] mb-2 block';
const field = 'w-full px-3 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-medium focus:border-blue-300 focus:outline-none';
const card = 'bg-white p-6 rounded-2xl shadow-sm border border-gray-100';

const perfilVacio = (): Profile => ({
    id: '', name: '', active: true, isDefault: false, priority: 0, beneficiaryId: null,
    identity: {}, routing: { prefer: 'site', allowSiteDomain: true },
    events: {}, targeting: { mode: 'clubs', districts: [], clubIds: [] },
    internalRecipients: [], notes: null,
});

const beneficiarioVacio = (): Beneficiary => ({
    id: '', legalName: '', tradeName: '', taxId: '', logoUrl: '', email: '',
    website: '', phone: '', address: '', contactName: '', notes: '', active: true,
});

const ContributionNotifications: React.FC = () => {
    // TODOS los hooks arriba, antes de cualquier `return`: es la regla de
    // `check:hooks` y el defecto que dejó una portada en blanco (v4.689).
    const [pestana, setPestana] = useState<'perfiles' | 'entidades'>('perfiles');
    const [opciones, setOpciones] = useState<Options | null>(null);
    const [perfiles, setPerfiles] = useState<Profile[]>([]);
    const [entidades, setEntidades] = useState<Beneficiary[]>([]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);

    const [perfil, setPerfil] = useState<Profile | null>(null);
    const [entidad, setEntidad] = useState<Beneficiary | null>(null);

    const [plantilla, setPlantilla] = useState<Template | null>(null);
    const [plantillaVersion, setPlantillaVersion] = useState<number | null>(null);
    const [plantillaOrigen, setPlantillaOrigen] = useState<string>('');
    // v4.858 — De QUIÉN es la plantilla que se está editando. El aviso interno
    // no puede llevar el mismo texto que la confirmación al aportante: uno
    // agradece y el otro informa de un movimiento.
    const [destinatario, setDestinatario] = useState('donor');
    const [vista, setVista] = useState<{ html: string; subject: string; missing: string[]; validation: Validation; sender?: Sender } | null>(null);
    const [ancho, setAncho] = useState<'desktop' | 'mobile'>('desktop');
    const [pruebaA, setPruebaA] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [pickerAbierto, setPickerAbierto] = useState(false);
    const [pickerDestino, setPickerDestino] = useState<'perfil' | 'entidad'>('perfil');
    const [buscaSitio, setBuscaSitio] = useState('');
    // El sitio con el que se previsualiza y se prueba. Sin él, la vista previa
    // muestra el remitente CENTRAL, que es el que verían los sitios sin dominio
    // propio; con uno elegido se ve la dirección real de ese sitio.
    const [sitioPrueba, setSitioPrueba] = useState('');
    const [dominios, setDominios] = useState<DomainReport | null>(null);
    const [comprobando, setComprobando] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const [o, p, b] = await Promise.all([
                fetch(`${API}/notification-profiles/options`, { headers: auth() }).then(r => r.json()),
                fetch(`${API}/notification-profiles`, { headers: auth() }).then(r => r.json()),
                fetch(`${API}/notification-profiles/beneficiaries`, { headers: auth() }).then(r => r.json()),
            ]);
            if (o?.error) throw new Error(o.error);
            setOpciones(o);
            setPerfiles(Array.isArray(p) ? p : []);
            setEntidades(Array.isArray(b) ? b : []);
            // Los dominios NO tumban la carga si fallan: son diagnóstico, y la
            // consulta sale a Resend.
            fetch(`${API}/notification-profiles/domains`, { headers: auth() })
                .then(r => r.json()).then(d => { if (!d?.error) setDominios(d); })
                .catch(() => { /* el panel se usa igual sin el diagnóstico */ });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo cargar la configuración');
        } finally { setCargando(false); }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    /** La plantilla del perfil abierto. Se pide al servidor porque la
     *  resolución tiene fallback —campaña, perfil, plataforma, fábrica— y
     *  reproducirla acá daría un segundo criterio que se separaría. */
    const cargarPlantilla = useCallback(async (profileId: string, kind = destinatario) => {
        try {
            const r = await fetch(`${API}/notification-profiles/templates?profileId=${encodeURIComponent(profileId)}&recipientKind=${encodeURIComponent(kind)}`, { headers: auth() });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'No se pudo cargar la plantilla');
            setPlantilla(d.template);
            setPlantillaVersion(d.version);
            setPlantillaOrigen(d.source);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo cargar la plantilla');
        }
        // `destinatario` VA en las dependencias: sin él, cambiar de
        // destinatario cargaría siempre la plantilla del aportante y se
        // guardaría encima de la otra.
    }, [destinatario]);

    const abrirPerfil = useCallback(async (p: Profile) => {
        setPerfil(p);
        setVista(null);
        if (p.id) await cargarPlantilla(p.id);
        else setPlantilla(null);
    }, [cargarPlantilla]);

    const guardarPerfil = useCallback(async () => {
        if (!perfil) return;
        setGuardando(true);
        try {
            const r = await fetch(`${API}/notification-profiles${perfil.id ? `/${perfil.id}` : ''}`, {
                method: perfil.id ? 'PUT' : 'POST',
                headers: auth(),
                body: JSON.stringify(perfil),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'No se pudo guardar');
            toast.success('Perfil guardado.');
            setPerfil(d);
            if (!perfil.id) await cargarPlantilla(d.id);
            await cargar();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
        } finally { setGuardando(false); }
    }, [perfil, cargar, cargarPlantilla]);

    const guardarEntidad = useCallback(async () => {
        if (!entidad) return;
        setGuardando(true);
        try {
            const r = await fetch(`${API}/notification-profiles/beneficiaries${entidad.id ? `/${entidad.id}` : ''}`, {
                method: entidad.id ? 'PUT' : 'POST',
                headers: auth(),
                body: JSON.stringify(entidad),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'No se pudo guardar');
            toast.success('Entidad guardada.');
            setEntidad(d);
            await cargar();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
        } finally { setGuardando(false); }
    }, [entidad, cargar]);

    const guardarPlantilla = useCallback(async () => {
        if (!perfil?.id || !plantilla) return;
        setGuardando(true);
        try {
            const r = await fetch(`${API}/notification-profiles/templates`, {
                method: 'POST', headers: auth(),
                body: JSON.stringify({ profileId: perfil.id, template: plantilla, recipientKind: destinatario }),
            });
            const d = await r.json();
            if (!r.ok) {
                // Los errores CONCRETOS, no «no se pudo guardar»: la plantilla
                // se valida antes de escribir justamente para poder decir qué
                // falta.
                throw new Error([d?.error, ...(d?.errors || [])].filter(Boolean).join(' · '));
            }
            setPlantillaVersion(d.version);
            setPlantillaOrigen('perfil');
            toast.success(`Plantilla guardada como versión ${d.version}.`);
            if (d.warnings?.length) toast.info(d.warnings[0], { duration: 8000 });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar', { duration: 10000 });
        } finally { setGuardando(false); }
    }, [perfil, plantilla, destinatario]);

    const previsualizar = useCallback(async () => {
        if (!perfil) return;
        try {
            const r = await fetch(`${API}/notification-profiles/preview`, {
                method: 'POST', headers: auth(),
                body: JSON.stringify({ profileId: perfil.id || null, template: plantilla, clubId: sitioPrueba || null, recipientKind: destinatario }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'No se pudo previsualizar');
            setVista(d);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo previsualizar');
        }
        // `plantilla` VA en las dependencias: sin ella la vista previa se
        // quedaría con la versión que había al crearse el manejador y
        // mostraría algo distinto de lo que se está editando. Es la lección
        // de `conQr` (v4.836) — el typecheck no lo ve.
        // `sitioPrueba` VA en las dependencias por el mismo motivo que
        // `plantilla`: sin él, elegir un sitio no cambiaría el remitente que se
        // muestra y la vista previa mentiría sobre desde dónde sale el correo.
    }, [perfil, plantilla, sitioPrueba, destinatario]);

    const enviarPrueba = useCallback(async () => {
        if (!perfil || !pruebaA.trim()) { toast.error('Escribí una dirección.'); return; }
        setEnviando(true);
        try {
            const r = await fetch(`${API}/notification-profiles/test`, {
                method: 'POST', headers: auth(),
                body: JSON.stringify({ profileId: perfil.id || null, template: plantilla, to: pruebaA, clubId: sitioPrueba || null }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error([d?.error, ...(d?.errors || [])].filter(Boolean).join(' · '));
            toast.success(`Prueba enviada a ${d.to} desde ${d.sender?.address}.`);
            if (d.sender?.level > 1) toast.info(`Salió por el nivel ${d.sender.level}: ${d.sender.reason}.`, { duration: 9000 });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo enviar', { duration: 10000 });
        } finally { setEnviando(false); }
    }, [perfil, plantilla, pruebaA, sitioPrueba]);

    const sitiosFiltrados = useMemo(() => {
        const q = buscaSitio.trim().toLowerCase();
        const todos = opciones?.sites || [];
        if (!q) return todos.slice(0, 40);
        return todos.filter(s => s.name.toLowerCase().includes(q) || String(s.district || '').includes(q)).slice(0, 40);
    }, [opciones, buscaSitio]);

    const entidadDelPerfil = useMemo(
        () => entidades.find(b => b.id === perfil?.beneficiaryId) || null,
        [entidades, perfil]
    );

    // ── Pintado ───────────────────────────────────────────────────────
    if (cargando) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center py-24 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando la configuración…
                </div>
            </AdminLayout>
        );
    }

    const setP = (patch: Partial<Profile>) => setPerfil(p => (p ? { ...p, ...patch } : p));
    const setIdent = (patch: Partial<Profile['identity']>) =>
        setPerfil(p => (p ? { ...p, identity: { ...p.identity, ...patch } } : p));

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                            <Mail className="w-6 h-6 text-blue-600" /> Notificaciones de Contribuciones
                        </h1>
                        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                            Cómo se le confirma un aporte a quien lo hace: con qué identidad, a quién más se avisa
                            y con qué texto. Se configura una vez y lo heredan todos los sitios que el perfil alcance.
                        </p>
                    </div>
                </div>

                {/* Qué gobierna esto y qué pasa si no hay nada configurado.
                    Sin esta línea, «¿por qué mi sitio manda con otra
                    dirección?» no tiene dónde contestarse. */}
                <div className="mb-6 rounded-2xl border-2 border-blue-100 bg-blue-50 p-4 flex gap-3">
                    <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                        <strong className="font-black">Un perfil activo gobierna la confirmación de los aportes de los sitios que alcanza.</strong>{' '}
                        Un sitio al que no llegue ningún perfil sigue recibiendo el recibo de siempre, con el
                        remitente central. El correo sale desde el dominio propio del sitio sólo si está
                        verificado en el proveedor; si no, desde el dominio central.
                    </div>
                </div>

                {/* El estado de los dominios. Es lo que contesta «¿por qué este
                    correo no salió desde rotary4281.org?» sin tener que leer el
                    código: puede ser que no esté verificado, que no esté dado
                    de alta, o que el perfil pida el central. */}
                {dominios && (
                    <div className={`${card} mb-6`}>
                        <div className="flex items-center justify-between mb-3">
                            <span className={`${lbl} mb-0`}>Dominios de envío</span>
                            <button type="button" disabled={comprobando}
                                onClick={async () => {
                                    setComprobando(true);
                                    try {
                                        const r = await fetch(`${API}/notification-profiles/domains?refresh=1`, { headers: auth() });
                                        const d = await r.json();
                                        if (!r.ok) throw new Error(d?.error || 'No se pudo comprobar');
                                        setDominios(d);
                                        toast.success('Comprobado con el proveedor.');
                                    } catch (e) {
                                        toast.error(e instanceof Error ? e.message : 'No se pudo comprobar');
                                    } finally { setComprobando(false); }
                                }}
                                className="text-[11px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wider disabled:opacity-40">
                                {comprobando ? 'Comprobando…' : 'Volver a comprobar'}
                            </button>
                        </div>
                        <p className="text-sm mb-3">
                            <strong className="font-black">Dominio central:</strong>{' '}
                            <span data-no-translate>{dominios.central.domain}</span>{' '}
                            {dominios.central.verified
                                ? <span className="text-green-700 font-bold">· verificado</span>
                                : <span className="text-red-700 font-bold">· NO verificado — todo saldrá por la identidad de respaldo</span>}
                        </p>
                        {dominios.sites.length > 0 && (
                            <div className="max-h-40 overflow-y-auto text-sm divide-y divide-gray-50">
                                {dominios.sites.map(s => (
                                    <div key={s.id} className="flex items-center justify-between py-1.5">
                                        <span className="truncate">{s.name}</span>
                                        <span className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-xs text-gray-500" data-no-translate>{s.domain}</span>
                                            {s.verified
                                                ? <span className="text-[10px] font-black uppercase text-green-700">verificado</span>
                                                : <span className="text-[10px] font-black uppercase text-gray-400">sin verificar</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-2 mb-6">
                    {([['perfiles', 'Perfiles', Users], ['entidades', 'Entidades beneficiarias', Building2]] as const).map(([id, label, Icon]) => (
                        <button key={id} type="button" onClick={() => setPestana(id)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-colors ${
                                pestana === id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                            <Icon className="w-4 h-4" /> {label}
                        </button>
                    ))}
                </div>

                {pestana === 'entidades' ? (
                    <div className="grid lg:grid-cols-2 gap-6 items-start">
                        <div className={card}>
                            <div className="flex items-center justify-between mb-4">
                                <span className={`${lbl} mb-0`}>Entidades</span>
                                <button type="button" onClick={() => setEntidad(beneficiarioVacio())}
                                    className="text-[11px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wider">
                                    <Plus className="w-3.5 h-3.5 inline" /> Nueva
                                </button>
                            </div>
                            {entidades.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                    Todavía no hay ninguna. Una entidad beneficiaria es la organización que gestiona
                                    lo recaudado —una fundación, un distrito— y es la que firma el correo.
                                </p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {entidades.map(b => (
                                        <li key={b.id}>
                                            <button type="button" onClick={() => setEntidad(b)}
                                                className="w-full text-left py-3 flex items-center gap-3 hover:bg-gray-50 rounded-lg px-2">
                                                {b.logoUrl
                                                    ? <img src={b.logoUrl} alt="" className="w-8 h-8 rounded object-contain bg-gray-50" />
                                                    : <span className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center"><Building2 className="w-4 h-4 text-gray-400" /></span>}
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm font-bold text-gray-900 truncate">{b.tradeName || b.legalName}</span>
                                                    <span className="block text-xs text-gray-500 truncate">{b.legalName}</span>
                                                </span>
                                                {!b.active && <span className="text-[10px] font-black uppercase text-gray-400">Inactiva</span>}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {entidad && (
                            <div className={card}>
                                <div className="flex items-center justify-between mb-4">
                                    <span className={`${lbl} mb-0`}>{entidad.id ? 'Editar entidad' : 'Nueva entidad'}</span>
                                    <button type="button" onClick={() => setEntidad(null)} className="text-gray-400 hover:text-gray-700">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    <label className="block">
                                        <span className={lbl}>Nombre legal</span>
                                        <input className={field} value={entidad.legalName}
                                            onChange={e => setEntidad({ ...entidad, legalName: e.target.value })}
                                            placeholder="Fundación Colombiana de Rotarios" />
                                    </label>
                                    <label className="block">
                                        <span className={lbl}>Nombre comercial</span>
                                        <input className={field} value={entidad.tradeName || ''}
                                            onChange={e => setEntidad({ ...entidad, tradeName: e.target.value })}
                                            placeholder="Colrotarios" />
                                        <span className="block text-xs text-gray-500 mt-1">
                                            Es el que firma el correo. Si se deja vacío se usa el legal.
                                        </span>
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="block">
                                            <span className={lbl}>NIT / identificación</span>
                                            <input className={field} value={entidad.taxId || ''}
                                                onChange={e => setEntidad({ ...entidad, taxId: e.target.value })} />
                                        </label>
                                        <label className="block">
                                            <span className={lbl}>Correo</span>
                                            <input className={field} value={entidad.email || ''} type="email"
                                                onChange={e => setEntidad({ ...entidad, email: e.target.value })} />
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="block">
                                            <span className={lbl}>Sitio web</span>
                                            <input className={field} value={entidad.website || ''}
                                                onChange={e => setEntidad({ ...entidad, website: e.target.value })} />
                                        </label>
                                        <label className="block">
                                            <span className={lbl}>Teléfono</span>
                                            <input className={field} value={entidad.phone || ''}
                                                onChange={e => setEntidad({ ...entidad, phone: e.target.value })} />
                                        </label>
                                    </div>
                                    <label className="block">
                                        <span className={lbl}>Dirección</span>
                                        <input className={field} value={entidad.address || ''}
                                            onChange={e => setEntidad({ ...entidad, address: e.target.value })} />
                                    </label>
                                    <label className="block">
                                        <span className={lbl}>Persona responsable</span>
                                        <input className={field} value={entidad.contactName || ''}
                                            onChange={e => setEntidad({ ...entidad, contactName: e.target.value })} />
                                    </label>

                                    {/* Las DOS vías, siempre (regla de v4.700). */}
                                    <div>
                                        <span className={lbl}>Logotipo</span>
                                        <div className="flex items-center gap-3">
                                            {entidad.logoUrl
                                                ? <img src={entidad.logoUrl} alt="" className="w-14 h-14 rounded-lg object-contain bg-gray-50 border border-gray-100" />
                                                : <span className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-gray-300" /></span>}
                                            <button type="button" onClick={() => { setPickerDestino('entidad'); setPickerAbierto(true); }}
                                                className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-[11px] font-black text-blue-700 hover:bg-blue-100">
                                                Biblioteca
                                            </button>
                                            <input className={`${field} flex-1`} value={entidad.logoUrl || ''} placeholder="…o pegá la dirección"
                                                onChange={e => setEntidad({ ...entidad, logoUrl: e.target.value })} />
                                        </div>
                                    </div>

                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                        <input type="checkbox" checked={entidad.active}
                                            onChange={e => setEntidad({ ...entidad, active: e.target.checked })} />
                                        Activa
                                    </label>

                                    <div className="flex gap-2 pt-2">
                                        <button type="button" onClick={guardarEntidad} disabled={guardando || !entidad.legalName.trim()}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black hover:bg-black disabled:opacity-40">
                                            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid lg:grid-cols-2 gap-6 items-start">
                        {/* ── Lista de perfiles ───────────────────────── */}
                        <div className="space-y-6">
                            <div className={card}>
                                <div className="flex items-center justify-between mb-4">
                                    <span className={`${lbl} mb-0`}>Perfiles</span>
                                    <button type="button" onClick={() => abrirPerfil(perfilVacio())}
                                        className="text-[11px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wider">
                                        <Plus className="w-3.5 h-3.5 inline" /> Nuevo
                                    </button>
                                </div>
                                {perfiles.length === 0 ? (
                                    <p className="text-sm text-gray-500">
                                        Todavía no hay ninguno. Un perfil dice con qué identidad se confirma un aporte
                                        y a quién más se le avisa.
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-gray-100">
                                        {perfiles.map(p => (
                                            <li key={p.id}>
                                                <button type="button" onClick={() => abrirPerfil(p)}
                                                    className={`w-full text-left py-3 px-2 rounded-lg hover:bg-gray-50 ${perfil?.id === p.id ? 'bg-blue-50' : ''}`}>
                                                    <span className="flex items-center gap-2">
                                                        <span className="flex-1 min-w-0">
                                                            <span className="block text-sm font-bold text-gray-900 truncate">{p.name}</span>
                                                            <span className="block text-xs text-gray-500 truncate">
                                                                {p.beneficiary?.tradeName || 'Sin entidad beneficiaria'}
                                                                {p.isDefault && ' · global'}
                                                            </span>
                                                        </span>
                                                        {!p.active && <span className="text-[10px] font-black uppercase text-gray-400">Apagado</span>}
                                                        {/* Un perfil que no puede notificar se ve así en la
                                                            LISTA, no sólo al abrirlo. */}
                                                        {p.validation && !p.validation.ok && (
                                                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                                        )}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {perfil && (
                                <>
                                    <div className={card}>
                                        <span className={lbl}>Identidad del remitente</span>
                                        <div className="space-y-3">
                                            <label className="block">
                                                <span className={lbl}>Nombre del perfil</span>
                                                <input className={field} value={perfil.name}
                                                    onChange={e => setP({ name: e.target.value })}
                                                    placeholder="Fundación Colombiana de Rotarios — Confirmación de aportes" />
                                            </label>
                                            <label className="block">
                                                <span className={lbl}>Entidad beneficiaria</span>
                                                <select className={field} value={perfil.beneficiaryId || ''}
                                                    onChange={e => setP({ beneficiaryId: e.target.value || null })}>
                                                    <option value="">— Elegí una entidad —</option>
                                                    {entidades.filter(b => b.active).map(b => (
                                                        <option key={b.id} value={b.id}>{b.tradeName || b.legalName}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="block">
                                                <span className={lbl}>Nombre visible del remitente</span>
                                                <input className={field} value={perfil.identity.fromName || ''}
                                                    onChange={e => setIdent({ fromName: e.target.value })}
                                                    placeholder="Fundación Colombiana de Rotarios" />
                                                <span className="block text-xs text-gray-500 mt-1">
                                                    Es lo que el aportante ve en su bandeja.
                                                </span>
                                            </label>
                                            <label className="block">
                                                <span className={lbl}>Dirección de respuesta</span>
                                                <input className={field} type="email" value={perfil.identity.replyTo || ''}
                                                    onChange={e => setIdent({ replyTo: e.target.value })}
                                                    placeholder="contacto@colrotarios.org" />
                                                <span className="block text-xs text-gray-500 mt-1">
                                                    A dónde llega lo que contesten. La dirección DESDE la que sale la
                                                    resuelve el servidor con el dominio del sitio de origen.
                                                </span>
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="block">
                                                    <span className={lbl}>Color principal</span>
                                                    <input className={field} value={perfil.identity.primaryColor || ''}
                                                        onChange={e => setIdent({ primaryColor: e.target.value })} placeholder="#0C2A5E" />
                                                </label>
                                                <label className="block">
                                                    <span className={lbl}>Color del botón</span>
                                                    <input className={field} value={perfil.identity.ctaColor || ''}
                                                        onChange={e => setIdent({ ctaColor: e.target.value })} placeholder="#F7A81B" />
                                                </label>
                                            </div>
                                            <div>
                                                <span className={lbl}>Logotipo del correo</span>
                                                <div className="flex items-center gap-3">
                                                    {perfil.identity.logoUrl
                                                        ? <img src={perfil.identity.logoUrl} alt="" className="w-14 h-14 rounded-lg object-contain bg-gray-50 border border-gray-100" />
                                                        : <span className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-gray-300" /></span>}
                                                    <button type="button" onClick={() => { setPickerDestino('perfil'); setPickerAbierto(true); }}
                                                        className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-[11px] font-black text-blue-700 hover:bg-blue-100">
                                                        Biblioteca
                                                    </button>
                                                    <input className={`${field} flex-1`} value={perfil.identity.logoUrl || ''} placeholder="…o pegá la dirección"
                                                        onChange={e => setIdent({ logoUrl: e.target.value })} />
                                                </div>
                                                {!perfil.identity.logoUrl && entidadDelPerfil?.logoUrl && (
                                                    <p className="text-xs text-gray-500 mt-2">
                                                        Sin logotipo propio se usa el de {entidadDelPerfil.tradeName}.
                                                    </p>
                                                )}
                                            </div>
                                            <label className="block">
                                                <span className={lbl}>Pie del correo</span>
                                                <input className={field} value={perfil.identity.footer || ''}
                                                    onChange={e => setIdent({ footer: e.target.value })}
                                                    placeholder="Colrotarios · NIT 800.000.000-0" />
                                            </label>
                                        </div>
                                    </div>

                                    <div className={card}>
                                        <span className={lbl}>Sitios conectados</span>
                                        <div className="flex gap-2 mb-3">
                                            {(['all', 'districts', 'clubs'] as const).map(m => (
                                                <button key={m} type="button"
                                                    onClick={() => setP({ targeting: { ...perfil.targeting, mode: m } })}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                                                        perfil.targeting.mode === m ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                                    {m === 'all' ? 'Todos' : m === 'districts' ? 'Por distrito' : 'Sitios específicos'}
                                                </button>
                                            ))}
                                        </div>
                                        {perfil.targeting.mode === 'districts' && (
                                            <input className={field} value={perfil.targeting.districts.join(', ')}
                                                onChange={e => setP({ targeting: { ...perfil.targeting, districts: e.target.value.split(/[^0-9]+/).filter(Boolean) } })}
                                                placeholder="4271, 4281" />
                                        )}
                                        {perfil.targeting.mode === 'clubs' && (
                                            <>
                                                <div className="relative mb-2">
                                                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                                    <input className={`${field} pl-9`} value={buscaSitio}
                                                        onChange={e => setBuscaSitio(e.target.value)} placeholder="Buscar un sitio…" />
                                                </div>
                                                <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                                                    {sitiosFiltrados.map(s => {
                                                        const marcado = perfil.targeting.clubIds.includes(s.id);
                                                        return (
                                                            <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                                                                <input type="checkbox" checked={marcado}
                                                                    onChange={() => setP({
                                                                        targeting: {
                                                                            ...perfil.targeting,
                                                                            clubIds: marcado
                                                                                ? perfil.targeting.clubIds.filter(x => x !== s.id)
                                                                                : [...perfil.targeting.clubIds, s.id],
                                                                        },
                                                                    })} />
                                                                <span className="flex-1 truncate">{s.name}</span>
                                                                {s.district && <span className="text-xs text-gray-400">{s.district}</span>}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}
                                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mt-3">
                                            <input type="checkbox" checked={perfil.isDefault}
                                                onChange={e => setP({ isDefault: e.target.checked })} />
                                            Usar como perfil global
                                        </label>
                                        <p className="text-xs text-gray-500 mt-1">
                                            El global es el último recurso: se usa cuando ningún otro perfil alcanza al sitio.
                                        </p>
                                    </div>

                                    <div className={card}>
                                        <span className={lbl}>A quién se le avisa</span>
                                        <p className="text-xs text-gray-500 mb-3">
                                            No se manda todo por omisión: se marca lo que corresponda.
                                        </p>
                                        {(opciones?.events || []).map(ev => (
                                            <div key={ev.id} className="mb-4">
                                                <div className="text-sm font-bold text-gray-900">{ev.label}</div>
                                                <div className="text-xs text-gray-500 mb-2">{ev.help}</div>
                                                <div className="flex flex-wrap gap-3">
                                                    {(opciones?.recipientKinds || []).map(rk => (
                                                        <label key={rk.id} className="flex items-center gap-1.5 text-sm" title={rk.help}>
                                                            <input type="checkbox"
                                                                checked={!!perfil.events?.[ev.id]?.[rk.id]}
                                                                onChange={e => setP({
                                                                    events: {
                                                                        ...perfil.events,
                                                                        [ev.id]: { ...(perfil.events?.[ev.id] || {}), [rk.id]: e.target.checked },
                                                                    },
                                                                })} />
                                                            {rk.label}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        <label className="block mt-3">
                                            <span className={lbl}>Direcciones internas</span>
                                            <input className={field} value={perfil.internalRecipients.join(', ')}
                                                onChange={e => setP({ internalRecipients: e.target.value.split(/[,;]/).map(x => x.trim()).filter(Boolean) })}
                                                placeholder="tesoreria@colrotarios.org, direccion@colrotarios.org" />
                                        </label>

                                        {/* Los eventos que todavía no tienen fuente se DICEN, con su
                                            motivo: ofrecerlos como casillas daría controles que no
                                            disparan nunca, y esconderlos haría creer que no están
                                            previstos. */}
                                        {!!opciones?.unavailableEvents?.length && (
                                            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-3">
                                                <div className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-2">Todavía no disponibles</div>
                                                <ul className="space-y-1">
                                                    {opciones.unavailableEvents.map(ev => (
                                                        <li key={ev.id} className="text-xs text-gray-500">
                                                            <strong className="text-gray-700">{ev.label}:</strong> {ev.help}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>

                                    {perfil.validation && (perfil.validation.errors.length > 0 || perfil.validation.warnings.length > 0) && (
                                        <div className={card}>
                                            {perfil.validation.errors.map((e, i) => (
                                                <p key={`e${i}`} className="text-sm text-red-700 flex gap-2 mb-2">
                                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{e}
                                                </p>
                                            ))}
                                            {perfil.validation.warnings.map((w, i) => (
                                                <p key={`w${i}`} className="text-sm text-amber-700 flex gap-2 mb-2">
                                                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />{w}
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button type="button" onClick={guardarPerfil} disabled={guardando || !perfil.name.trim()}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black hover:bg-black disabled:opacity-40">
                                            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar perfil
                                        </button>
                                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 px-2">
                                            <input type="checkbox" checked={perfil.active}
                                                onChange={e => setP({ active: e.target.checked })} />
                                            Activo
                                        </label>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ── La plantilla y su vista previa ──────────── */}
                        <div className="space-y-6">
                            {!perfil ? (
                                <div className={`${card} text-center py-16`}>
                                    <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                    <p className="text-sm text-gray-500">Elegí un perfil para editar su plantilla.</p>
                                </div>
                            ) : !perfil.id ? (
                                <div className={`${card} text-center py-16`}>
                                    <p className="text-sm text-gray-500">
                                        Guardá el perfil primero: la plantilla se crea con él.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className={card}>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className={`${lbl} mb-0`}>Plantilla del correo</span>
                                            <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                                                <History className="w-3.5 h-3.5" />
                                                {plantillaVersion ? `versión ${plantillaVersion}` : 'sin versión'} · {plantillaOrigen}
                                            </span>
                                        </div>
                                        {/* De quién es esta plantilla. El aviso interno y la
                                            confirmación al aportante son dos correos distintos y
                                            no pueden compartir texto. */}
                                        <div className="flex gap-2 mb-3">
                                            {(opciones?.recipientKinds || []).filter(rk => rk.id !== 'campaign').map(rk => (
                                                <button key={rk.id} type="button"
                                                    onClick={() => { setDestinatario(rk.id); if (perfil.id) cargarPlantilla(perfil.id, rk.id); setVista(null); }}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                                                        destinatario === rk.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                                    {rk.label}
                                                </button>
                                            ))}
                                        </div>
                                        {plantilla && (
                                            <div className="space-y-3">
                                                <label className="block">
                                                    <span className={lbl}>Asunto</span>
                                                    <input className={field} value={plantilla.subject}
                                                        onChange={e => setPlantilla({ ...plantilla, subject: e.target.value })} />
                                                </label>
                                                <label className="block">
                                                    <span className={lbl}>Línea de vista previa</span>
                                                    <input className={field} value={plantilla.preheader || ''}
                                                        onChange={e => setPlantilla({ ...plantilla, preheader: e.target.value })} />
                                                </label>
                                                <div>
                                                    <span className={lbl}>Bloques</span>
                                                    <div className="space-y-2">
                                                        {plantilla.blocks.map((b, i) => (
                                                            <div key={i} className="rounded-xl border border-gray-100 p-3">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                                                                        {opciones?.blockTypes.find(t => t.id === b.type)?.label || b.type}
                                                                    </span>
                                                                    <button type="button"
                                                                        onClick={() => setPlantilla({ ...plantilla, blocks: plantilla.blocks.filter((_, k) => k !== i) })}
                                                                        className="text-gray-300 hover:text-red-600">
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                                {'text' in b && (
                                                                    <textarea className={`${field} min-h-[64px]`} value={b.text || ''}
                                                                        onChange={e => setPlantilla({
                                                                            ...plantilla,
                                                                            blocks: plantilla.blocks.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)),
                                                                        })} />
                                                                )}
                                                                {'title' in b && (
                                                                    <input className={field} value={b.title || ''} placeholder="Título del bloque"
                                                                        onChange={e => setPlantilla({
                                                                            ...plantilla,
                                                                            blocks: plantilla.blocks.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)),
                                                                        })} />
                                                                )}
                                                                {'url' in b && (
                                                                    <input className={`${field} mt-2`} value={b.url || ''} placeholder="{{campaign_url}}"
                                                                        onChange={e => setPlantilla({
                                                                            ...plantilla,
                                                                            blocks: plantilla.blocks.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)),
                                                                        })} />
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <select className={`${field} mt-2`} value=""
                                                        onChange={e => {
                                                            if (!e.target.value) return;
                                                            setPlantilla({ ...plantilla, blocks: [...plantilla.blocks, { type: e.target.value }] });
                                                        }}>
                                                        <option value="">+ Agregar un bloque…</option>
                                                        {(opciones?.blockTypes || []).map(t => (
                                                            <option key={t.id} value={t.id}>{t.label}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <details className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                                                    <summary className="text-[11px] font-black uppercase tracking-wider text-gray-400 cursor-pointer">
                                                        Variables disponibles
                                                    </summary>
                                                    <div className="grid grid-cols-2 gap-1 mt-2">
                                                        {(opciones?.variables || []).map(v => (
                                                            <code key={v.id} className="text-[11px] text-gray-600" title={v.label}>
                                                                {`{{${v.id}}}`}
                                                            </code>
                                                        ))}
                                                    </div>
                                                </details>

                                                <div className="flex flex-wrap gap-2">
                                                    <button type="button" onClick={guardarPlantilla} disabled={guardando}
                                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black hover:bg-black disabled:opacity-40">
                                                        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar versión
                                                    </button>
                                                    <button type="button" onClick={previsualizar}
                                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border-2 border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50">
                                                        <Eye className="w-4 h-4" /> Vista previa
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {vista && (
                                        <div className={card}>
                                            <div className="flex items-center justify-between mb-3">
                                                <span className={`${lbl} mb-0`}>Vista previa</span>
                                                <div className="flex gap-1">
                                                    <button type="button" onClick={() => setAncho('desktop')}
                                                        className={`p-2 rounded-lg ${ancho === 'desktop' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                        <Monitor className="w-4 h-4" />
                                                    </button>
                                                    <button type="button" onClick={() => setAncho('mobile')}
                                                        className={`p-2 rounded-lg ${ancho === 'mobile' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                        <Smartphone className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-500 mb-2">
                                                <strong className="text-gray-700">Asunto:</strong> {vista.subject}
                                            </div>
                                            {/* El remitente REAL, no una promesa. Con el nivel y el
                                                motivo: «no está verificado» y «el perfil pide el
                                                central» se corrigen en sitios distintos. */}
                                            {vista.sender && (
                                                <div className="text-xs text-gray-500 mb-2">
                                                    <strong className="text-gray-700">Desde:</strong>{' '}
                                                    <span data-no-translate>{vista.sender.address}</span>
                                                    <span className={vista.sender.level === 1 ? 'text-green-700' : 'text-amber-700'}>
                                                        {' '}· nivel {vista.sender.level}
                                                    </span>
                                                    <span className="block text-gray-400">{vista.sender.reason}</span>
                                                </div>
                                            )}
                                            {/* Una variable sin valor NO se borra: queda el marcador y se
                                                dice. Un hueco donde iba el monto se publica sin que nadie
                                                lo note; «{'{{amount}}'}» impreso se ve y se corrige. */}
                                            {vista.missing?.length > 0 && (
                                                <p className="text-xs text-amber-700 mb-2 flex gap-2">
                                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                                    Con estos datos de ejemplo quedaron sin resolver: {vista.missing.join(', ')}.
                                                </p>
                                            )}
                                            <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50 flex justify-center">
                                                <iframe
                                                    title="Vista previa del correo"
                                                    // El correo se dibuja AISLADO: es HTML que se compone
                                                    // con datos de la campaña y no puede tocar el panel.
                                                    sandbox=""
                                                    srcDoc={vista.html}
                                                    style={{ width: ancho === 'mobile' ? 390 : '100%', height: 620, border: 0, background: '#fff' }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className={card}>
                                        <span className={lbl}>Probar como un sitio</span>
                                        <select className={`${field} mb-3`} value={sitioPrueba}
                                            onChange={e => setSitioPrueba(e.target.value)}>
                                            <option value="">Sin sitio — se ve el remitente central</option>
                                            {(dominios?.sites || []).map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} · {s.domain} {s.verified ? '(verificado)' : '(sin verificar)'}
                                                </option>
                                            ))}
                                        </select>
                                        <span className={lbl}>Enviar un correo de prueba</span>
                                        <div className="flex gap-2">
                                            <input className={`${field} flex-1`} type="email" value={pruebaA}
                                                onChange={e => setPruebaA(e.target.value)} placeholder="tu@correo.com" />
                                            <button type="button" onClick={enviarPrueba} disabled={enviando}
                                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-40">
                                                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
                                            </button>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">
                                            La prueba sale por el MISMO remitente que usaría un aporte real de ese sitio:
                                            una prueba que no prueba el camino que se va a usar no prueba nada.
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {pickerAbierto && (
                <MediaPicker
                    isOpen={pickerAbierto}
                    maxSelection={1}
                    onClose={() => setPickerAbierto(false)}
                    onSelect={items => {
                        const url = items[0]?.url;
                        if (url) {
                            if (pickerDestino === 'entidad') setEntidad(b => (b ? { ...b, logoUrl: url } : b));
                            else setIdent({ logoUrl: url });
                        }
                        setPickerAbierto(false);
                    }}
                />
            )}
        </AdminLayout>
    );
};

export default ContributionNotifications;
