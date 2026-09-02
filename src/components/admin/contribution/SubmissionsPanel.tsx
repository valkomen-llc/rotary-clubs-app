import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Loader2, RefreshCw, Link2, Copy, ExternalLink, Check, AlertTriangle,
    Image as ImageIcon, Film, Library, Megaphone, X, QrCode, Share2, Inbox,
    Users, Phone, Mail, MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { SUBMISSION_STATES, stateLabel, stateChip, USAGE_CHANNELS, usageIsMeasured, activityDateLabel } from '../../../lib/contentSubmissionSpec';
import { findCountry } from '../../../lib/countryPhones';
import { qrToDataUri } from '../../../lib/qrcode';

// ════════════════════════════════════════════════════════════════════
// Solicitudes de contenido de una campaña — la bandeja (v4.972)
//
// Va DENTRO del editor de la campaña, como una sección más: la decisión se
// toma donde ya se está trabajando la campaña, y las pantallas que se olvidan
// son siempre las del segundo lugar.
//
// Los filtros los resuelve el SERVIDOR: con el filtro también acá, lo que se
// ve y lo que se opera podrían discrepar — la lección del panel de grupos
// (v4.876).
// ════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

/** Un club participante. Es de la ACTIVIDAD, no de quien la envía: la misma
 *  persona puede documentar lo que hicieron tres clubes. */
interface ClubParticipante { id?: string; clubName: string; districtId?: string; source?: string }

/** Una publicación que el club YA había hecho antes de mandar el material.
 *  `platformLabel` viene RESUELTO del servidor: el catálogo vive allá. */
interface Publicacion { id?: string; platform: string; platformOther?: string; platformLabel?: string; url: string; host?: string }

interface Solicitud {
    id: string; status: string; senderName: string; senderEmail: string; senderPhone?: string;
    senderPhoneCountry?: string; senderPhoneDial?: string; senderPhoneNational?: string; senderPhoneE164?: string;
    club?: string; district?: string; role?: string;
    title?: string; description?: string; story?: string; location?: string; city?: string;
    activityDate?: string; participatingClubs?: string; extra?: string;
    hasPosts?: boolean;
    statusDetail?: string; createdAt: string;
    imageCount: number; videoCount: number; promotedCount: number;
    warnings?: string[];
    usage?: Record<string, number>;
    clubs?: ClubParticipante[];
    posts?: Publicacion[];
}

interface Archivo {
    id: string; kind: 'image' | 'video'; filename?: string; bytes: number;
    url: string | null; inLibrary: boolean; mediaId?: string | null; promoteError?: string | null;
}

interface Evento {
    id: string; type: string; fromState?: string; toState?: string;
    channel?: string; detail?: string; actorName?: string; createdAt: string;
}

interface Props { campaignId: string; campaignName: string; onCountChange?: (n: number) => void; }

const fmtFecha = (v?: string) => v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * El teléfono, legible y con su país.
 *
 * El nombre del país se resuelve acá desde el catálogo ÚNICO a partir del ISO
 * guardado: guardarlo también en la base sería una segunda verdad sobre lo que
 * el ISO ya dice, y se separarían el día que el catálogo cambie una etiqueta.
 */
const fmtTelefono = (s: Solicitud) => {
    if (!s.senderPhoneE164) return s.senderPhone || '';
    const pais = s.senderPhoneCountry ? findCountry(s.senderPhoneCountry) : null;
    const nacional = s.senderPhoneNational || '';
    const legible = `${s.senderPhoneDial || ''} ${nacional}`.trim();
    return pais ? `${legible} · ${pais.name}` : legible;
};

/**
 * ⚠️ SÓLO `http`/`https` LLEGAN A UN `href`. El enlace lo escribió alguien en
 * un formulario PÚBLICO: el servidor ya lo acota al guardarlo, y esto es la
 * segunda puerta, sobre las filas que se guardaron antes de que existiera.
 * `rel="noopener"` porque abre en otra pestaña.
 */
const enlaceSeguro = (url: string) => /^https?:\/\//i.test(String(url || '')) ? url : '';
const fmtPeso = (b: number) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

const SubmissionsPanel: React.FC<Props> = ({ campaignId, campaignName, onCountChange }) => {
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
    const [conteo, setConteo] = useState<{ total: number; porEstado: Record<string, number> }>({ total: 0, porEstado: {} });
    const [filtros, setFiltros] = useState({ status: '', club: '', city: '', from: '', to: '', kind: '' });
    const [abierta, setAbierta] = useState<string | null>(null);
    const [ficha, setFicha] = useState<{ submission: Solicitud; files: Archivo[]; events: Evento[]; usage: Record<string, number>; nextStates: { id: string; label: string }[]; clubs?: ClubParticipante[]; posts?: Publicacion[] } | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [compartir, setCompartir] = useState<{ url: string; inviteMessage: string; enabled: boolean } | null>(null);
    const [verQr, setVerQr] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true); setError(null);
        try {
            const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][]);
            const r = await fetch(`${API}/contribution-campaigns/${campaignId}/submissions?${qs}`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            const texto = await r.text();
            let data: any;
            try { data = JSON.parse(texto); } catch {
                throw new Error(`El servidor respondió ${r.status} con ${r.headers.get('content-type') || 'contenido desconocido'} en vez de JSON.`);
            }
            if (!r.ok) throw new Error(data?.error || `El servidor respondió ${r.status}.`);
            setSolicitudes(data.submissions || []);
            setConteo(data.counts || { total: 0, porEstado: {} });
            onCountChange?.(data.counts?.total || 0);
        } catch (e: any) {
            setError(e?.message || 'No se pudieron cargar las solicitudes.');
        } finally { setCargando(false); }
    }, [campaignId, filtros, onCountChange]);

    useEffect(() => { cargar(); }, [cargar]);

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${API}/contribution-campaigns/${campaignId}/submissions/share`, {
                    headers: { Authorization: `Bearer ${token()}` },
                });
                if (r.ok) setCompartir(await r.json());
            } catch { /* el enlace es una comodidad: su fallo no rompe la bandeja */ }
        })();
    }, [campaignId]);

    const abrir = async (id: string) => {
        setAbierta(id); setFicha(null);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${campaignId}/submissions/${id}`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.error || 'No se pudo abrir la solicitud.');
            setFicha(data);
        } catch (e: any) { toast.error(e?.message); setAbierta(null); }
    };

    const cambiarEstado = async (to: string) => {
        if (!ficha) return;
        // `requiere_info` y `descartado` EXIGEN motivo: es lo que después le
        // llega a quien envió y lo que queda en la auditoría.
        let reason = '';
        if (to === 'requiere_info' || to === 'descartado') {
            reason = window.prompt(
                to === 'descartado'
                    ? '¿Por qué se descarta? Queda en el historial de la solicitud.'
                    : '¿Qué información falta? Es lo que hay que pedirle a quien la envió.'
            ) || '';
            if (!reason.trim()) return;
        }
        setOcupado(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${campaignId}/submissions/${ficha.submission.id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ to, reason }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.error || 'No se pudo cambiar el estado.');
            toast.success(`Ahora está en «${stateLabel(to)}»`);
            await abrir(ficha.submission.id); await cargar();
        } catch (e: any) { toast.error(e?.message); } finally { setOcupado(false); }
    };

    const aprobarYEnviar = async () => {
        if (!ficha) return;
        setOcupado(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${campaignId}/submissions/${ficha.submission.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({}),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.error || 'No se pudo aprobar.');
            // Lo que NO se pudo promover se dice: «aprobado» sobre una
            // promoción a medias haría creer que el material está disponible.
            if (data.ok) toast.success(data.message);
            else toast.warning(data.message, { duration: 15000 });
            await abrir(ficha.submission.id); await cargar();
        } catch (e: any) { toast.error(e?.message); } finally { setOcupado(false); }
    };

    const marcarUso = async (channel: string) => {
        if (!ficha) return;
        setOcupado(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/${campaignId}/submissions/${ficha.submission.id}/usage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ channel, detail: 'Marcado a mano' }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.error || 'No se pudo marcar.');
            toast.success(`Anotado el uso en ${USAGE_CHANNELS[channel]?.label || channel}`);
            await abrir(ficha.submission.id); await cargar();
        } catch (e: any) { toast.error(e?.message); } finally { setOcupado(false); }
    };

    /**
     * Promocionar → Redes sociales.
     *
     * NO genera nada acá: manda al Generador de Publicaciones existente con la
     * campaña y la fotografía puestas. Construir un segundo generador sería el
     * módulo duplicado que el pedido prohíbe.
     */
    const promocionar = () => {
        if (!ficha) return;
        const foto = ficha.files.find(f => f.kind === 'image' && f.inLibrary);
        if (!foto) { toast.error('Primero hay que aprobar y enviar a la Biblioteca: el generador trabaja con material ya aprobado.'); return; }
        const qs = new URLSearchParams({
            tab: 'create', ways: campaignId, submission: ficha.submission.id, image: foto.url || '',
            ...(foto.mediaId ? { mediaId: foto.mediaId } : {}),
        });
        window.location.href = `/admin/content-studio?${qs}`;
    };

    const copiar = async (texto: string, que: string) => {
        try { await navigator.clipboard.writeText(texto); toast.success(`${que} copiado`); }
        catch { toast.error('No se pudo copiar'); }
    };

    const estadosOrdenados = useMemo(
        () => Object.values(SUBMISSION_STATES).sort((a, b) => a.order - b.order),
        []
    );

    const bloqueCompartir = compartir && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black tracking-[0.15em] px-2.5 py-1 rounded-lg bg-rotary-blue text-white">ENLACE PÚBLICO</span>
                {!compartir.enabled && (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700">
                        El formulario está APAGADO — el enlace no recibe nada
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                <Link2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600 truncate flex-1" data-no-translate>{compartir.url}</span>
            </div>
            <div className="flex flex-wrap gap-2">
                <button onClick={() => copiar(compartir.url, 'Enlace')} className="text-[10px] font-black text-rotary-blue px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center gap-2">
                    <Copy className="w-3.5 h-3.5" /> COPIAR ENLACE
                </button>
                <button onClick={() => copiar(compartir.inviteMessage, 'Mensaje')} className="text-[10px] font-black text-rotary-blue px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 flex items-center gap-2">
                    <Share2 className="w-3.5 h-3.5" /> COPIAR MENSAJE
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(compartir.inviteMessage)}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-black text-emerald-700 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 flex items-center gap-2">
                    <Share2 className="w-3.5 h-3.5" /> WHATSAPP
                </a>
                <a href={`mailto:?subject=${encodeURIComponent(`Aporta contenido — ${campaignName}`)}&body=${encodeURIComponent(compartir.inviteMessage)}`}
                    className="text-[10px] font-black text-gray-600 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center gap-2">
                    <Share2 className="w-3.5 h-3.5" /> CORREO
                </a>
                <button onClick={() => setVerQr(v => !v)} className="text-[10px] font-black text-gray-600 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center gap-2">
                    <QrCode className="w-3.5 h-3.5" /> {verQr ? 'OCULTAR QR' : 'VER QR'}
                </button>
                <a href={compartir.url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-black text-gray-600 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center gap-2">
                    <ExternalLink className="w-3.5 h-3.5" /> PREVISUALIZAR
                </a>
            </div>
            {verQr && (
                <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4">
                    {/* El QR es el generador PROPIO del sitio (`src/lib/qrcode.ts`),
                        sin dependencias — el mismo de las inscripciones. */}
                    <img src={qrToDataUri(compartir.url, 160)} alt="Código QR del formulario" className="w-40 h-40" />
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                        Para imprimir o proyectar en una reunión de club. Lleva al mismo formulario que el enlace.
                    </p>
                </div>
            )}
            <p className="text-[11px] text-gray-500 leading-relaxed whitespace-pre-line bg-white rounded-xl border border-gray-200 p-3">{compartir.inviteMessage}</p>
        </div>
    );

    return (
        <div className="space-y-5">
            {bloqueCompartir}

            {/* Los contadores doblan como filtro: es el gesto natural sobre un
                contador y ahorra un desplegable. */}
            <div className="flex flex-wrap gap-2">
                <button onClick={() => setFiltros({ ...filtros, status: '' })}
                    className={`px-3 py-2 rounded-xl text-[11px] font-black border-2 ${!filtros.status ? 'border-rotary-blue bg-blue-50 text-rotary-blue' : 'border-gray-100 text-gray-400'}`}>
                    TODAS ({conteo.total})
                </button>
                {estadosOrdenados.map(e => (
                    <button key={e.id} onClick={() => setFiltros({ ...filtros, status: filtros.status === e.id ? '' : e.id })}
                        title={e.help}
                        className={`px-3 py-2 rounded-xl text-[11px] font-black border-2 ${filtros.status === e.id ? 'border-rotary-blue bg-blue-50 text-rotary-blue' : 'border-gray-100 text-gray-400'}`}>
                        {e.label.toUpperCase()} ({conteo.porEstado[e.id] || 0})
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <input value={filtros.club} onChange={e => setFiltros({ ...filtros, club: e.target.value })} placeholder="Club" className="p-2.5 rounded-xl border-2 border-gray-100 text-xs bg-gray-50 outline-none focus:border-rotary-blue" />
                <input value={filtros.city} onChange={e => setFiltros({ ...filtros, city: e.target.value })} placeholder="Ciudad o lugar" className="p-2.5 rounded-xl border-2 border-gray-100 text-xs bg-gray-50 outline-none focus:border-rotary-blue" />
                <input type="date" value={filtros.from} onChange={e => setFiltros({ ...filtros, from: e.target.value })} className="p-2.5 rounded-xl border-2 border-gray-100 text-xs bg-gray-50 outline-none focus:border-rotary-blue" />
                <input type="date" value={filtros.to} onChange={e => setFiltros({ ...filtros, to: e.target.value })} className="p-2.5 rounded-xl border-2 border-gray-100 text-xs bg-gray-50 outline-none focus:border-rotary-blue" />
                <select value={filtros.kind} onChange={e => setFiltros({ ...filtros, kind: e.target.value })} className="p-2.5 rounded-xl border-2 border-gray-100 text-xs bg-gray-50 font-bold outline-none focus:border-rotary-blue">
                    <option value="">Todo el contenido</option>
                    <option value="image">Con fotografías</option>
                    <option value="video">Con videos</option>
                </select>
            </div>

            {cargando ? (
                <div className="flex items-center gap-3 text-gray-400 py-8 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" /><span className="text-xs font-black tracking-widest">CARGANDO…</span>
                </div>
            ) : error ? (
                <div className="rounded-2xl border-2 border-amber-100 bg-amber-50/50 p-5">
                    <p className="text-sm font-bold text-gray-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> No se pudieron cargar</p>
                    <p className="text-xs text-gray-500 mt-1">{error}</p>
                    <button onClick={cargar} className="mt-3 text-[10px] font-black text-rotary-blue px-3 py-2 rounded-xl bg-blue-50 flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5" /> REINTENTAR
                    </button>
                </div>
            ) : solicitudes.length === 0 ? (
                <div className="text-center py-10">
                    <Inbox className="w-10 h-10 text-gray-200 mx-auto" />
                    <p className="text-sm font-bold text-gray-500 mt-3">
                        {conteo.total === 0 ? 'Todavía no llegó ningún aporte' : 'Ninguna solicitud coincide con el filtro'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        {conteo.total === 0
                            ? 'Compartí el enlace de arriba con los clubes para que empiecen a mandar su material.'
                            : `Hay ${conteo.total} en total. Quitá algún filtro para verlas.`}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {solicitudes.map(s => (
                        <button key={s.id} onClick={() => abrir(s.id)}
                            className="w-full text-left rounded-2xl border border-gray-100 hover:border-rotary-blue/40 bg-white p-4 transition-colors">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${stateChip(s.status)}`}>{stateLabel(s.status).toUpperCase()}</span>
                                <span className="text-sm font-bold text-gray-800 truncate">{s.title || 'Sin título'}</span>
                                <span className="text-[11px] text-gray-400 ml-auto">{fmtFecha(s.createdAt)}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1.5">
                                <span data-no-translate>{s.senderName}</span>
                                {s.club && <> · <span data-no-translate>{s.club}</span></>}
                                {(s.city || s.location) && <> · {s.city || s.location}</>}
                            </p>
                            {(s.story || s.description) && (
                                <p className="text-[12px] text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">{s.story || s.description}</p>
                            )}
                            {/* La participación y la difusión previa se ven SIN
                                abrir la ficha: son los dos ejes por los que el
                                equipo decide qué mirar primero. */}
                            {(s.clubs?.length || s.posts?.length) ? (
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    {(s.clubs || []).slice(0, 3).map(c => (
                                        <span key={c.id || c.clubName} data-no-translate
                                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rotary-blue/10 text-rotary-blue">{c.clubName}</span>
                                    ))}
                                    {(s.clubs?.length || 0) > 3 && (
                                        <span className="text-[10px] font-bold text-gray-400">+{(s.clubs?.length || 0) - 3}</span>
                                    )}
                                    {s.posts?.length ? (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 inline-flex items-center gap-1">
                                            <Share2 className="w-2.5 h-2.5" /> {s.posts.length} publicada{s.posts.length === 1 ? '' : 's'}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11px] text-gray-400 font-semibold">
                                <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />{s.imageCount}</span>
                                <span className="flex items-center gap-1"><Film className="w-3.5 h-3.5" />{s.videoCount}</span>
                                {s.promotedCount > 0 && (
                                    <span className="flex items-center gap-1 text-emerald-600"><Library className="w-3.5 h-3.5" />{s.promotedCount} en Biblioteca</span>
                                )}
                                {Object.keys(s.usage || {}).length > 0 && (
                                    <span className="flex items-center gap-1 text-blue-600">
                                        <Megaphone className="w-3.5 h-3.5" />
                                        {Object.keys(s.usage || {}).map(c => USAGE_CHANNELS[c]?.label || c).join(' · ')}
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {abierta && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-0 md:p-6 overflow-y-auto"
                    onClick={() => { setAbierta(null); setFicha(null); }}>
                    <div className="bg-white w-full md:max-w-3xl md:rounded-3xl min-h-screen md:min-h-0 md:max-h-[90vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        {!ficha ? (
                            <div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
                        ) : (
                            <div className="p-6 md:p-8 space-y-6">
                                <div className="flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${stateChip(ficha.submission.status)}`}>
                                            {stateLabel(ficha.submission.status).toUpperCase()}
                                        </span>
                                        <h3 className="text-xl font-light text-gray-800 mt-3">{ficha.submission.title || 'Sin título'}</h3>
                                        {/* El remitente, con lo suyo a un clic:
                                            el correo abre el cliente y el teléfono
                                            abre WhatsApp con el número en E.164,
                                            que es exactamente para lo que se
                                            guardó en partes. */}
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                                            <span className="font-bold text-gray-700" data-no-translate>{ficha.submission.senderName}</span>
                                            {ficha.submission.role && <span data-no-translate>{ficha.submission.role}</span>}
                                            <a href={`mailto:${ficha.submission.senderEmail}`} className="text-rotary-blue inline-flex items-center gap-1" data-no-translate>
                                                <Mail className="w-3.5 h-3.5" />{ficha.submission.senderEmail}
                                            </a>
                                            {ficha.submission.senderPhoneE164 ? (
                                                <a href={`https://wa.me/${ficha.submission.senderPhoneE164.replace(/\D/g, '')}`}
                                                    target="_blank" rel="noopener noreferrer"
                                                    className="text-rotary-blue inline-flex items-center gap-1" data-no-translate>
                                                    <Phone className="w-3.5 h-3.5" />{fmtTelefono(ficha.submission)}
                                                </a>
                                            ) : ficha.submission.senderPhone ? (
                                                /* Una solicitud anterior a v4.972 guardó el
                                                   teléfono como texto, sin país: NO se le
                                                   compone un `wa.me` deduciendo el
                                                   indicativo — es el error que `phone.js`
                                                   documenta como caro. Se muestra tal cual. */
                                                <span className="inline-flex items-center gap-1" data-no-translate>
                                                    <Phone className="w-3.5 h-3.5 text-gray-300" />{ficha.submission.senderPhone}
                                                </span>
                                            ) : null}
                                            {ficha.submission.club && <span data-no-translate>{ficha.submission.club}</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => { setAbierta(null); setFicha(null); }} className="p-2 rounded-xl hover:bg-gray-100">
                                        <X className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>

                                {ficha.submission.statusDetail && (
                                    <div className="rounded-2xl bg-amber-50/60 border border-amber-100 p-4">
                                        <p className="text-[11px] font-black text-amber-900 uppercase tracking-wider">Motivo</p>
                                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">{ficha.submission.statusDetail}</p>
                                    </div>
                                )}

                                {/* El material se MIRA acá, sin descargarlo. Lo que
                                    todavía no está en la Biblioteca se sirve con un
                                    enlace firmado que caduca: no existe una URL
                                    compartible de material sin aprobar. */}
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-3">
                                        Material ({ficha.files.length})
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {ficha.files.map(f => (
                                            <div key={f.id} className="relative rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 aspect-square">
                                                {f.kind === 'image'
                                                    ? (f.url ? <img src={f.url} alt={f.filename || ''} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon className="w-8 h-8" /></div>)
                                                    : (f.url ? <video src={f.url} controls playsInline className="w-full h-full object-cover bg-black" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Film className="w-8 h-8" /></div>)}
                                                <span className="absolute bottom-1.5 left-1.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-black/60 text-white">
                                                    {fmtPeso(f.bytes)}
                                                </span>
                                                {f.inLibrary && (
                                                    <span className="absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-white flex items-center gap-1">
                                                        <Check className="w-2.5 h-2.5" /> BIBLIOTECA
                                                    </span>
                                                )}
                                                {f.promoteError && (
                                                    <span className="absolute inset-x-0 bottom-0 text-[9px] font-bold p-1.5 bg-red-600/85 text-white leading-tight">{f.promoteError}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Lo que contó quien lo envió: es lo que después
                                    impide que la IA invente quién aparece. */}
                                <div className="rounded-2xl bg-gray-50/70 border border-gray-100 p-5 space-y-2.5">
                                    {ficha.submission.story && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{ficha.submission.story}</p>}
                                    {ficha.submission.description && ficha.submission.description !== ficha.submission.story && (
                                        <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{ficha.submission.description}</p>
                                    )}
                                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-500 font-semibold pt-1">
                                        {(ficha.submission.city || ficha.submission.location) && (
                                            <span className="inline-flex items-center gap-1">
                                                <MapPin className="w-3 h-3 text-gray-300" />
                                                {[ficha.submission.location, ficha.submission.city].filter(Boolean).join(', ')}
                                            </span>
                                        )}
                                        {ficha.submission.activityDate && <span>{activityDateLabel(ficha.submission.activityDate)}</span>}
                                    </div>
                                    {ficha.submission.extra && <p className="text-[11px] text-gray-500 leading-relaxed pt-1">{ficha.submission.extra}</p>}
                                </div>

                                {/* ── Participación ────────────────────────
                                    Distrito y clubes, de la ACTIVIDAD. Salen de
                                    la tabla; el texto legible de la solicitud es
                                    el respaldo para lo guardado antes de v4.972. */}
                                {(ficha.clubs?.length || ficha.submission.district || ficha.submission.participatingClubs) && (
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                                            <Users className="w-3.5 h-3.5" /> Participación
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {ficha.submission.district && (
                                                <span className="text-[11px] font-black px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600" data-no-translate>
                                                    Distrito {ficha.submission.district}
                                                </span>
                                            )}
                                            {ficha.clubs?.length ? ficha.clubs.map(c => (
                                                <span key={c.id || c.clubName} data-no-translate
                                                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-rotary-blue/10 text-rotary-blue">
                                                    {c.clubName}
                                                    {/* Un club escrito a mano se DICE: es lo que
                                                        distingue un club nuevo de un error de
                                                        tipeo, y no se puede deducir después. */}
                                                    {c.source === 'manual' && <span className="ml-1.5 font-semibold opacity-60">escrito a mano</span>}
                                                </span>
                                            )) : ficha.submission.participatingClubs ? (
                                                <span className="text-[11px] text-gray-500 font-semibold" data-no-translate>{ficha.submission.participatingClubs}</span>
                                            ) : null}
                                        </div>
                                    </div>
                                )}

                                {/* ── Difusión previa ──────────────────────
                                    Lo que el CLUB publicó antes de mandarnos el
                                    material. NO es lo mismo que el uso de más
                                    abajo, que es lo que hicimos NOSOTROS con él:
                                    juntarlos contaría dos veces la misma pieza. */}
                                {ficha.posts && ficha.posts.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                                            <Share2 className="w-3.5 h-3.5" /> Difusión previa del club ({ficha.posts.length})
                                        </p>
                                        <div className="space-y-1.5">
                                            {ficha.posts.map((p, i) => (
                                                <div key={p.id || i} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3.5 py-2.5">
                                                    <span className="text-[11px] font-black text-gray-600 w-24 flex-shrink-0" data-no-translate>
                                                        {p.platformLabel || p.platform}
                                                    </span>
                                                    {enlaceSeguro(p.url) ? (
                                                        <a href={enlaceSeguro(p.url)} target="_blank" rel="noopener noreferrer"
                                                            className="text-[11px] text-rotary-blue truncate flex items-center gap-1.5 min-w-0" data-no-translate>
                                                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                                            <span className="truncate">{p.url}</span>
                                                        </a>
                                                    ) : (
                                                        <span className="text-[11px] text-gray-400 truncate" data-no-translate>{p.url}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Que NO haya habido difusión previa también es
                                    un dato: sin decirlo, «no hay publicaciones»
                                    se lee igual que «no contestó». */}
                                {ficha.submission.hasPosts === false && !ficha.posts?.length && (
                                    <p className="text-[11px] text-gray-400">El club declaró que esta actividad todavía no se había publicado en ningún canal.</p>
                                )}

                                {Array.isArray(ficha.submission.warnings) && ficha.submission.warnings.length > 0 && (
                                    <div className="rounded-2xl bg-amber-50/50 border border-amber-100 p-4">
                                        <p className="text-[11px] font-black text-amber-900 uppercase tracking-wider">Faltó al enviar</p>
                                        {ficha.submission.warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-800 mt-1">· {w}</p>)}
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    <button onClick={aprobarYEnviar} disabled={ocupado}
                                        className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-black flex items-center gap-2 disabled:bg-gray-300">
                                        <Library className="w-4 h-4" /> APROBAR Y ENVIAR A BIBLIOTECA
                                    </button>
                                    <button onClick={promocionar} disabled={ocupado}
                                        className="px-4 py-3 rounded-xl bg-rotary-blue text-white text-[11px] font-black flex items-center gap-2 disabled:bg-gray-300">
                                        <Megaphone className="w-4 h-4" /> PROMOCIONAR EN REDES
                                    </button>
                                    {ficha.nextStates.map(n => (
                                        <button key={n.id} onClick={() => cambiarEstado(n.id)} disabled={ocupado}
                                            className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-black">
                                            {n.label.toUpperCase()}
                                        </button>
                                    ))}
                                </div>

                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-3">Dónde se usó</p>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.values(USAGE_CHANNELS).map(c => {
                                            const n = ficha.usage?.[c.id] || 0;
                                            const medido = usageIsMeasured(c.id);
                                            return (
                                                <button key={c.id}
                                                    onClick={() => !medido && marcarUso(c.id)}
                                                    disabled={medido || ocupado}
                                                    title={medido
                                                        ? 'Se anota solo cuando la publicación sale de verdad por este canal.'
                                                        : 'Este módulo no registra qué archivo usó: se marca a mano.'}
                                                    className={`px-3 py-2 rounded-xl text-[11px] font-black border-2 ${
                                                        n > 0 ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                            : medido ? 'border-gray-100 text-gray-300 cursor-default'
                                                                : 'border-gray-100 text-gray-400 hover:border-rotary-blue/40'
                                                    }`}>
                                                    {c.label.toUpperCase()}{n > 0 ? ` (${n})` : ''}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {/* Se DICE qué se midió y qué se declaró: presentar
                                        las dos cosas igual haría creer que se midió
                                        algo que alguien marcó a mano. */}
                                    <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                                        Las redes se anotan solas cuando la publicación sale de verdad. Correo, WhatsApp y sitio web se marcan a mano:
                                        esos módulos no registran hoy qué archivo usaron.
                                    </p>
                                </div>

                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-3">Historial</p>
                                    <div className="space-y-2">
                                        {ficha.events.map(ev => (
                                            <div key={ev.id} className="flex gap-3 text-[11px]">
                                                <span className="text-gray-400 flex-shrink-0 w-32" data-no-translate>
                                                    {new Date(ev.createdAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-gray-600 flex-1">
                                                    {ev.type === 'status' && <>{stateLabel(ev.fromState || '')} → <strong>{stateLabel(ev.toState || '')}</strong></>}
                                                    {ev.type === 'created' && 'Llegó por el formulario'}
                                                    {ev.type === 'library' && 'A la Biblioteca Multimedia'}
                                                    {ev.type === 'usage' && <>Se usó en <strong>{USAGE_CHANNELS[ev.channel || '']?.label || ev.channel}</strong></>}
                                                    {ev.detail && <span className="text-gray-400"> — {ev.detail}</span>}
                                                    {ev.actorName && <span className="text-gray-400" data-no-translate> · {ev.actorName}</span>}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubmissionsPanel;
