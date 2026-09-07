import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Eye, EyeOff, Film, Image as ImageIcon, Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';

// ════════════════════════════════════════════════════════════════════════════
// PORTADA Y GALERÍA DEL ARTÍCULO — v4.1003
//
// ⚠️ ES UN COMPONENTE COMPARTIDO, NO UNA COPIA POR PANTALLA. Lo montan la
// ficha de la solicitud (`SubmissionArticlePanel`) y el editor de Noticias.
// Hasta v4.1002 este selector vivía DENTRO del panel, así que quien revisaba
// el artículo en Noticias —que es donde el pedido dice que se edita el texto—
// no tenía ninguna forma de elegir la portada con el material del club: los
// dos campos de esa pantalla sólo ofrecían «subir un archivo». Copiarlo habría
// dejado dos selectores que se separan en silencio (regla de `SubmissionDetail`,
// v4.999).
//
// ⚠️ ESCRIBE POR EL CAMINO DE SIEMPRE. Guardar es `PUT …/article/media`
// (`updateArticleMedia`, que fija `isCover`, el orden y las exclusiones y
// después llama a `syncArticleMedia`); traer las fotos es
// `POST …/article/library` (`sendMediaToLibrary`, el MISMO que usa el
// workflow). Un segundo camino de escritura se separaría del primero en
// silencio — la regla del sitio desde v4.967.
//
// ⚠️ Y POR ESO LA VISTA COMPLETA VUELVE AL CONSUMIDOR (`onView`). El servidor
// acaba de reescribir el Post: si la pantalla que lo tiene abierto no se
// entera, su formulario guardaría encima la portada anterior.
// ════════════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

export interface ArticleMedia {
    fileId: string;
    kind: 'image' | 'video';
    role: string;
    roleLabel: string;
    isCover: boolean;
    sortOrder: number;
    excluded: boolean;
    excludedReason?: string | null;
    alt?: string | null;
    caption?: string | null;
    score?: number | null;
    reasons?: string[];
    url?: string | null;
    filename?: string | null;
    inLibrary: boolean;
}

export interface ArticleMediaPlan {
    cover?: string | null;
    coverReason?: string;
    coverWeak?: boolean;
    visionNote?: string | null;
}

interface Props {
    campaignId: string;
    submissionId: string;
    /**
     * El material que el consumidor YA tiene (la ficha de la solicitud). Sin
     * él, el componente lo pide: es lo que permite montarlo en Noticias, que
     * no conoce la forma de esta respuesta.
     */
    media?: ArticleMedia[];
    mediaPlan?: ArticleMediaPlan | null;
    /** La vista completa tras cargar, guardar o promover. */
    onView?: (vista: any) => void;
    /** Título del bloque; en Noticias conviene decir de dónde salen las fotos. */
    title?: string;
    hint?: string;
}

const leer = async (r: Response) => {
    const texto = await r.text();
    let data: any;
    try { data = JSON.parse(texto); } catch { throw new Error(`El servidor respondió ${r.status} con ${r.headers.get('content-type') || 'contenido desconocido'} en vez de JSON.`); }
    if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);
    return data;
};

const ArticleMediaPicker: React.FC<Props> = ({ campaignId, submissionId, media: mediaProp, mediaPlan, onView, title = 'Portada y galería', hint }) => {
    const base = `${API}/contribution-campaigns/${campaignId}/submissions/${submissionId}/article`;
    const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });
    // Lo que el componente pidió por su cuenta. Con `mediaProp` presente manda
    // el consumidor: dos copias de la misma lista se contradirían al guardar.
    const [propio, setPropio] = useState<ArticleMedia[] | null>(null);
    const [planPropio, setPlanPropio] = useState<ArticleMediaPlan | null>(null);
    const [borrador, setBorrador] = useState<ArticleMedia[] | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const controlado = Array.isArray(mediaProp);

    const cargar = useCallback(async () => {
        if (controlado) return;
        try {
            const data = await leer(await fetch(base, { headers: { Authorization: `Bearer ${token()}` } }));
            setPropio(data?.media || []);
            setPlanPropio(data?.article?.mediaPlan || null);
            setError(null);
            onView?.(data);
        } catch (e: any) { setError(e?.message || 'No se pudo cargar el material de la solicitud.'); }
        // `onView` no entra en las dependencias a propósito: un consumidor que
        // lo redefine en cada render dejaría esto pidiendo sin parar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base, controlado]);

    useEffect(() => { cargar(); }, [cargar]);

    const aplicar = (data: any) => {
        if (!controlado) {
            setPropio(data?.media || []);
            setPlanPropio(data?.article?.mediaPlan || null);
        }
        setBorrador(null);
        onView?.(data);
    };

    const media = borrador || (controlado ? (mediaProp as ArticleMedia[]) : (propio || []));
    const plan = controlado ? (mediaPlan || null) : planPropio;
    const esperando = media.filter(m => !m.inLibrary && !m.excluded).length;

    const guardar = async () => {
        if (!borrador) return;
        setOcupado(true);
        try {
            const data = await leer(await fetch(`${base}/media`, {
                method: 'PUT', headers: headers(),
                body: JSON.stringify({ items: borrador.map((m, i) => ({ fileId: m.fileId, role: m.role, isCover: m.isCover, sortOrder: i, excluded: m.excluded, alt: m.alt })) }),
            }));
            aplicar(data);
            toast.success('Portada y galería guardadas');
        } catch (e: any) { toast.error(e?.message); }
        finally { setOcupado(false); }
    };

    const enviarABiblioteca = async () => {
        // La consecuencia se dice COMPLETA: promover hace públicos los archivos
        // y aprueba la solicitud. Preguntar «¿estás seguro?» no informa de nada.
        if (!window.confirm(`Se aprueba el material de la solicitud y ${esperando} archivo(s) pasan a la Biblioteca Multimedia, donde quedan con URL pública. Después la portada y la galería quedan puestas en el borrador. El artículo NO se publica.`)) return;
        setOcupado(true);
        try {
            const data = await leer(await fetch(`${base}/library`, { method: 'POST', headers: headers(), body: '{}' }));
            aplicar(data);
            toast.success(data?.message || 'Material enviado a la Biblioteca Multimedia');
        } catch (e: any) { toast.error(e?.message); }
        finally { setOcupado(false); }
    };

    const parche = (i: number, patch: Partial<ArticleMedia>) => {
        setBorrador(prev => {
            const lista = [...(prev || media)];
            if (patch.isCover) lista.forEach((m, j) => { lista[j] = { ...m, isCover: false }; });
            lista[i] = { ...lista[i], ...patch };
            return lista;
        });
    };
    const mover = (i: number, d: number) => {
        setBorrador(prev => {
            const lista = [...(prev || media)];
            const j = i + d;
            if (j < 0 || j >= lista.length) return lista;
            [lista[i], lista[j]] = [lista[j], lista[i]];
            return lista;
        });
    };

    if (error) return <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-[11px] text-red-700">{title}: {error}</div>;
    if (!controlado && propio === null) {
        return <div className="rounded-xl bg-gray-50 p-3 flex items-center gap-2 text-[11px] text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando el material de la solicitud…</div>;
    }
    if (!media.length) {
        return <div className="rounded-xl border border-dashed border-gray-200 p-3 text-[11px] text-gray-500">La solicitud no trae fotografías ni videos, así que este artículo no tiene material propio del club.</div>;
    }

    return (
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{title}</p>
                <p className="text-[11px] text-gray-500">
                    {plan?.coverReason ? `Portada: ${plan.coverReason}.` : ''}
                    {plan?.coverWeak ? ' Conviene revisarla.' : ''}
                    {plan?.visionNote ? ` ${plan.visionNote}` : ''}
                </p>
            </div>
            {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
            {esperando > 0 && (
                <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <p>
                        <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                        <strong>{esperando} archivo(s) todavía no llegaron a la Biblioteca Multimedia</strong>, así que el borrador está sin portada o con la galería incompleta. El workflow las manda solo al terminar el borrador; si esa etapa falló —o está apagada en la campaña— acá se reintenta a mano.
                    </p>
                    <button
                        type="button" onClick={enviarABiblioteca} disabled={ocupado}
                        className="px-3 py-2 rounded-lg bg-amber-600 text-white text-[10px] font-black inline-flex items-center gap-1.5 disabled:opacity-50">
                        {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />} ENVIAR LAS FOTOS A LA BIBLIOTECA
                    </button>
                </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {media.map((m, i) => (
                    <div key={m.fileId} className={`rounded-xl border-2 overflow-hidden ${m.isCover ? 'border-rotary-gold' : m.excluded ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                        <div className="aspect-[4/3] bg-gray-100 relative">
                            {m.kind === 'video'
                                ? <video src={m.url || ''} className="w-full h-full object-cover" muted playsInline />
                                : <img src={m.url || ''} alt={m.alt || ''} className="w-full h-full object-cover" />}
                            {m.isCover && <span className="absolute top-1 left-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-rotary-gold text-white inline-flex items-center gap-1"><Star className="w-2.5 h-2.5" /> PORTADA</span>}
                            {m.kind === 'video' && <span className="absolute top-1 right-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-black/60 text-white inline-flex items-center gap-1"><Film className="w-2.5 h-2.5" /> VIDEO</span>}
                        </div>
                        <div className="p-2 space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="text-gray-500">{m.roleLabel}{typeof m.score === 'number' ? ` · ${m.score}/100` : ''}</span>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => mover(i, -1)} title="Subir" className="text-gray-400 hover:text-gray-700"><ChevronUp className="w-3.5 h-3.5" /></button>
                                    <button type="button" onClick={() => mover(i, 1)} title="Bajar" className="text-gray-400 hover:text-gray-700"><ChevronDown className="w-3.5 h-3.5" /></button>
                                    {m.kind === 'image' && !m.isCover && <button type="button" onClick={() => parche(i, { isCover: true, excluded: false })} title="Usar como portada" className="text-gray-400 hover:text-rotary-gold"><Star className="w-3.5 h-3.5" /></button>}
                                    <button type="button" onClick={() => parche(i, { excluded: !m.excluded, isCover: m.excluded ? m.isCover : false })} title={m.excluded ? 'Incluir en la galería' : 'Dejar fuera de la galería'} className="text-gray-400 hover:text-gray-700">{m.excluded ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                                </div>
                            </div>
                            {m.excluded && m.excludedReason && <p className="text-[10px] text-amber-700">Fuera: {m.excludedReason}</p>}
                            <input value={m.alt || ''} onChange={e => parche(i, { alt: e.target.value })} placeholder="Texto alternativo"
                                className="w-full text-[10px] border border-gray-200 rounded-md px-1.5 py-1" maxLength={125} />
                        </div>
                    </div>
                ))}
            </div>
            {borrador && (
                <div className="flex gap-2">
                    <button type="button" onClick={guardar} disabled={ocupado} className="px-3 py-2 rounded-lg bg-rotary-blue text-white text-[10px] font-black disabled:opacity-50">GUARDAR PORTADA Y ORDEN</button>
                    <button type="button" onClick={() => setBorrador(null)} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-[10px] font-black text-gray-600">DESHACER</button>
                </div>
            )}
        </div>
    );
};

export default ArticleMediaPicker;
