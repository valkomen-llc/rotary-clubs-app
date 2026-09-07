import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Loader2, RefreshCw, Link2, Copy, AlertTriangle, ExternalLink,
    Image as ImageIcon, Film, Library, Megaphone, QrCode, Share2, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';
import SubmissionDetail from './SubmissionDetail';
import { SUBMISSION_STATES, stateLabel, stateChip, USAGE_CHANNELS } from '../../../lib/contentSubmissionSpec';
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



interface Props { campaignId: string; campaignName: string; onCountChange?: (n: number) => void; }

const fmtFecha = (v?: string) => v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * El teléfono, legible y con su país.
 *
 * El nombre del país se resuelve acá desde el catálogo ÚNICO a partir del ISO
 * guardado: guardarlo también en la base sería una segunda verdad sobre lo que
 * el ISO ya dice, y se separarían el día que el catálogo cambie una etiqueta.
 */

/**
 * ⚠️ SÓLO `http`/`https` LLEGAN A UN `href`. El enlace lo escribió alguien en
 * un formulario PÚBLICO: el servidor ya lo acota al guardarlo, y esto es la
 * segunda puerta, sobre las filas que se guardaron antes de que existiera.
 * `rel="noopener"` porque abre en otra pestaña.
 */

const SubmissionsPanel: React.FC<Props> = ({ campaignId, campaignName, onCountChange }) => {
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
    const [conteo, setConteo] = useState<{ total: number; porEstado: Record<string, number> }>({ total: 0, porEstado: {} });
    const [filtros, setFiltros] = useState({ status: '', club: '', city: '', from: '', to: '', kind: '' });
    const [abierta, setAbierta] = useState<string | null>(null);
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





    /**
     * Promocionar → Redes sociales.
     *
     * NO genera nada acá: manda al Generador de Publicaciones existente con la
     * campaña y la fotografía puestas. Construir un segundo generador sería el
     * módulo duplicado que el pedido prohíbe.
     */

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
                        <button key={s.id} onClick={() => setAbierta(s.id)}
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

            {/* ⚠️ LA FICHA ES LA MISMA QUE LA DE LA BANDEJA TRANSVERSAL
                (v4.999). Vivía acá dentro, así que la bandeja nueva habría
                sido una segunda copia — y una copia se separa en silencio: el
                día que se agregue una acción, una de las dos pantallas se
                queda sin ella y nadie se entera. */}
            {abierta && (
                <SubmissionDetail
                    campaignId={campaignId}
                    submissionId={abierta}
                    onClose={() => setAbierta(null)}
                    onChanged={cargar}
                />
            )}
        </div>
    );
};

export default SubmissionsPanel;
