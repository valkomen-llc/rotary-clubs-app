import React, { useCallback, useEffect, useState } from 'react';
import {
    Loader2, ExternalLink, Check, UserCog,
    Image as ImageIcon, Film, Library, Megaphone, X, Share2,
    Users, Phone, Mail, MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { stateLabel, stateChip, USAGE_CHANNELS, usageIsMeasured, activityDateLabel } from '../../../lib/contentSubmissionSpec';
import { findCountry } from '../../../lib/countryPhones';
import SubmissionArticlePanel from './SubmissionArticlePanel';

// ════════════════════════════════════════════════════════════════════════════
// La FICHA de una solicitud de contenido — v4.999
//
// ⚠️ ES UNA SOLA Y LA MONTAN LOS DOS SITIOS DONDE SE TRABAJA UNA SOLICITUD: la
// sección dentro del editor de la campaña (`SubmissionsPanel`) y la bandeja
// transversal (`SubmissionsInbox`). Estaba escrita DENTRO del panel, así que
// la bandeja nueva habría sido una segunda copia — y una copia se separa en
// silencio: el día que se agregue una acción, una de las dos pantallas se
// queda sin ella y nadie se entera (la lección de la casilla de distritos,
// v4.748, y del selector de pools, v4.877).
//
// ⚠️ Y LAS ACCIONES SIGUEN ENTRANDO POR LA RUTA DE LA CAMPAÑA. La bandeja
// transversal es de sólo LECTURA a propósito: esas rutas ya comprueban la
// transición, ya dejan historial y ya pasan por `requireCampaignAccess`. Un
// segundo camino de escritura se separaría del primero en silencio (v4.967).
// Por eso este componente recibe SIEMPRE el `campaignId` de la solicitud.
// ════════════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

export interface ClubParticipante { id?: string; clubName: string; districtId?: string; source?: string }
export interface Publicacion { id?: string; platform: string; platformOther?: string; platformLabel?: string; url: string; host?: string }
export interface Archivo {
    id: string; kind: 'image' | 'video'; filename: string; bytes: number;
    url: string; inLibrary: boolean; mediaId?: string | null;
    promotedAt?: string | null; promoteError?: string | null;
}
export interface Evento {
    id: string; type: string; fromState?: string | null; toState?: string | null;
    channel?: string | null; detail?: string | null; actorName?: string | null; createdAt: string;
}
export interface Ficha {
    submission: any;
    files: Archivo[];
    events: Evento[];
    usage: Record<string, number>;
    nextStates: { id: string; label: string }[];
    clubs?: ClubParticipante[];
    posts?: Publicacion[];
}

const fmtPeso = (b: number) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

/** ⚠️ SÓLO `http`/`https` LLEGAN A UN `href`. El enlace lo escribió alguien en
 *  un formulario PÚBLICO y termina en el panel administrativo: aceptar
 *  cualquier esquema convertiría ese campo en un hueco por donde inyectar
 *  (regla del mapa de la sede, v4.717). */
const enlaceSeguro = (url: string) => /^https?:\/\//i.test(String(url || '')) ? url : '';

/**
 * El teléfono, legible y con su país.
 *
 * El nombre del país se resuelve acá desde el catálogo ÚNICO a partir del ISO
 * guardado: guardarlo también en la base sería una segunda verdad sobre lo que
 * el ISO ya dice, y se separarían el día que el catálogo cambie una etiqueta.
 */
const fmtTelefono = (s: any) => {
    if (!s?.senderPhoneE164) return s?.senderPhone || '';
    const pais = s.senderPhoneCountry ? findCountry(s.senderPhoneCountry) : null;
    const nacional = s.senderPhoneNational || '';
    const legible = `${s.senderPhoneDial || ''} ${nacional}`.trim();
    return pais ? `${legible} · ${pais.name}` : legible;
};

interface Props {
    campaignId: string;
    submissionId: string;
    onClose: () => void;
    /** Se llama después de CADA cambio: es lo que hace que el contador de la
     *  tarjeta baje de «15 sin revisar» a 14 sin recargar la página. */
    onChanged?: () => void;
}

const SubmissionDetail: React.FC<Props> = ({ campaignId, submissionId, onClose, onChanged }) => {
    const [ficha, setFicha] = useState<Ficha | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const abrir = useCallback(async () => {
        try {
            const r = await fetch(`${API}/contribution-campaigns/${campaignId}/submissions/${submissionId}`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            const texto = await r.text();
            let data: any;
            try { data = JSON.parse(texto); } catch {
                throw new Error(`El servidor respondió ${r.status} con ${r.headers.get('content-type') || 'contenido desconocido'} en vez de JSON.`);
            }
            if (!r.ok) throw new Error(data?.error || 'No se pudo abrir la solicitud.');
            setFicha(data);
        } catch (e: any) { toast.error(e?.message); onClose(); }
    }, [campaignId, submissionId, onClose]);

    useEffect(() => { setFicha(null); abrir(); }, [abrir]);

    /** Escape cierra. Un panel que sólo se cierra con su propia cruz atrapa a
     *  quien lo abrió sin querer. */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const trasCambiar = async () => { await abrir(); onChanged?.(); };

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
            await trasCambiar();
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
            await trasCambiar();
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
            await trasCambiar();
        } catch (e: any) { toast.error(e?.message); } finally { setOcupado(false); }
    };

    /** Quién queda a cargo. Va por la ruta TRANSVERSAL porque la solicitud se
     *  identifica sola: el responsable no depende de la campaña. */
    const asignar = async () => {
        if (!ficha) return;
        const actual = String(ficha.submission.assignee || '');
        const quien = window.prompt('¿Quién queda a cargo de esta solicitud? Dejalo vacío para quitar el responsable.', actual);
        if (quien === null) return;
        setOcupado(true);
        try {
            const r = await fetch(`${API}/contribution-campaigns/submissions/inbox/${ficha.submission.id}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ assignee: quien }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data?.error || 'No se pudo asignar.');
            toast.success(quien.trim() ? `A cargo de ${quien.trim()}` : 'Sin responsable');
            await trasCambiar();
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

    return (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-0 md:p-6 overflow-y-auto"
                    onClick={onClose}>
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
                                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
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
                                        {ficha.submission.warnings.map((w: string, i: number) => <p key={i} className="text-[11px] text-amber-800 mt-1">· {w}</p>)}
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
                                    {/* Los estados a los que se puede ir salen del
                                        SERVIDOR (`nextStates`), no de una lista acá: con
                                        el flujo escrito dos veces, la pantalla ofrecería
                                        un salto que el servidor rechaza. «Archivar» es
                                        uno más de ellos — no una acción aparte. */}
                                    {ficha.nextStates.map(n => (
                                        <button key={n.id} onClick={() => cambiarEstado(n.id)} disabled={ocupado}
                                            className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-black">
                                            {n.label.toUpperCase()}
                                        </button>
                                    ))}
                                    <button onClick={asignar} disabled={ocupado}
                                        className="px-4 py-3 rounded-xl bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-600 text-[11px] font-black flex items-center gap-2">
                                        <UserCog className="w-4 h-4" />
                                        {ficha.submission.assignee ? 'CAMBIAR RESPONSABLE' : 'ASIGNAR RESPONSABLE'}
                                    </button>
                                </div>

                                {/* Quién la tiene. Se dice SIEMPRE, también cuando no hay
                                    nadie: una solicitud sin responsable visible es una que
                                    todos dan por atendida. */}
                                <p className="text-[11px] text-gray-500">
                                    Responsable:{' '}
                                    {ficha.submission.assignee
                                        ? <b className="text-gray-800" data-no-translate>{ficha.submission.assignee}</b>
                                        : <span className="text-amber-600 font-bold">sin asignar</span>}
                                </p>

                                {/* El artículo de noticia que se genera solo desde esta
                                    solicitud (v4.1000). Va acá —entre las acciones y el
                                    uso— porque es la trazabilidad que el pedido describe:
                                    solicitud → material → borrador → publicación, todo en
                                    la misma ficha. El panel es UNO y lo usan las dos
                                    pantallas que montan esta ficha. */}
                                <SubmissionArticlePanel campaignId={campaignId} submissionId={ficha.submission.id} onChanged={trasCambiar} />

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
    );
};

export default SubmissionDetail;
