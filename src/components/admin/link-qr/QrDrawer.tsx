// Los códigos QR de UN enlace (v4.1278): la lista, con vista previa, estado,
// vigencia, contadores y acciones; y la puerta al editor y a las estadísticas.
//
// Un enlace puede tener varios QR —afiche, Instagram, presentación,
// invitación— que llevan al mismo destino y se miden por separado. Esta
// pantalla existe para compararlos y administrarlos sin salir del enlace.
import { useCallback, useEffect, useState } from 'react';
import {
    X, Plus, QrCode, Download, Copy, Check, Pencil, Pause, Play, Ban, BarChart3, Trash2, AlertCircle, CalendarClock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { QR_STATE_LABELS, QR_STATE_HINT, QR_MEDIA_SHORT, daysLeft } from '../../../lib/linkQr';
import { api, type QrDto, type Redirect } from './api';
import { descargarQr, previewDataUri, urlDelQr, type Formato } from './qrDownloads';
import { EstadoPill, IconBtn, numero, haceCuanto, fechaCorta } from './StatsBits';
import QrEditor from './QrEditor';
import QrStatsModal from './QrStatsModal';

interface Props {
    link: Redirect;
    dominio: string;
    siteLogo?: string;
    onCerrar: () => void;
    /** Avisa al listado de enlaces que cambió la cantidad de QR. */
    onCambio: () => void;
}

export default function QrDrawer({ link, dominio, siteLogo, onCerrar, onCambio }: Props) {
    const [items, setItems] = useState<QrDto[]>([]);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState('');
    const [editor, setEditor] = useState<{ abierto: boolean; qr: QrDto | null }>({ abierto: false, qr: null });
    const [verStats, setVerStats] = useState<QrDto | null>(null);
    const [copiado, setCopiado] = useState('');
    const [descargando, setDescargando] = useState('');
    const [menuDescarga, setMenuDescarga] = useState('');

    const cargar = useCallback(async () => {
        setCargando(true); setFallo('');
        try {
            const d = await api(`/${link.id}/qrs`);
            setItems(d.items || []);
        } catch (e: any) {
            setFallo(e.message || 'No se pudieron cargar los códigos QR.');
        } finally {
            setCargando(false);
        }
    }, [link.id]);

    useEffect(() => { cargar(); }, [cargar]);

    const refrescar = async () => { await cargar(); onCambio(); };

    const copiar = async (q: QrDto) => {
        const url = urlDelQr(q, link, dominio);
        try {
            await navigator.clipboard.writeText(url);
            setCopiado(q.id);
            setTimeout(() => setCopiado(''), 1800);
        } catch { toast.error('El navegador no dejó copiar. La dirección es: ' + url); }
    };

    const descargar = async (q: QrDto, f: Formato) => {
        setMenuDescarga('');
        setDescargando(q.id + f);
        try { await descargarQr(f, q, link, dominio); }
        finally { setDescargando(''); }
    };

    const cambiarEstado = async (q: QrDto, status: 'active' | 'paused' | 'disabled') => {
        try {
            await api(`/${link.id}/qrs/${q.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
            toast.success(status === 'active'
                ? 'QR activo otra vez. La imagen impresa vuelve a funcionar tal cual.'
                : status === 'paused'
                    ? 'QR pausado: quien lo escanee verá «temporalmente fuera de servicio». Sus estadísticas se conservan.'
                    : 'QR deshabilitado: ya no conduce a ningún destino. Sus estadísticas se conservan.');
            await refrescar();
        } catch (e: any) { toast.error(e.message); }
    };

    const eliminar = async (q: QrDto) => {
        const ok = window.confirm(
            `Eliminar el QR «${q.name}».\n\n` +
            `Cada pieza donde ya esté impreso mostrará «este enlace ya no existe».\n` +
            `Sus ${numero(q.totalScans)} accesos quedan registrados en el historial.\n\n` +
            `Si sólo querés que deje de funcionar por un tiempo, pausalo en vez de eliminarlo.`
        );
        if (!ok) return;
        try {
            await api(`/${link.id}/qrs/${q.id}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
            toast.success('QR eliminado.');
            await refrescar();
        } catch (e: any) { toast.error(e.message); }
    };

    const reactivar = (q: QrDto) => {
        // Un código VENCIDO se reactiva extendiendo la vigencia; uno pausado o
        // deshabilitado, cambiando el estado. La pantalla lleva a lo que toca.
        if (q.state === 'expired') setEditor({ abierto: true, qr: q });
        else cambiarEstado(q, 'active');
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onCerrar}>
            <aside
                className="bg-white w-full max-w-3xl h-full overflow-y-auto shadow-2xl p-6 md:p-8"
                onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Códigos QR del enlace"
            >
                <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">Códigos QR de</p>
                        <h4 className="text-lg font-bold text-gray-800 truncate">{link.name || link.slug}</h4>
                        <p className="text-xs text-gray-400 font-mono truncate">{dominio}{link.slug} → {link.target}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button type="button" onClick={() => setEditor({ abierto: true, qr: null })}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-rotary-navy">
                            <Plus className="w-4 h-4" /> Generar código QR
                        </button>
                        <button onClick={onCerrar} aria-label="Cerrar" className="p-2 text-gray-300 hover:text-gray-600"><X className="w-5 h-5" /></button>
                    </div>
                </div>

                <p className="text-xs text-gray-400 mb-6 max-w-2xl">
                    Cada código lleva al mismo destino y se mide por separado: uno para el afiche, otro para Instagram,
                    otro para la presentación. El QR codifica una dirección de <strong className="text-gray-500">este sitio</strong>,
                    no el destino: si cambiás el destino del enlace, los códigos ya impresos siguen funcionando.
                </p>

                {fallo && (
                    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-4">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-700">
                            <p className="font-semibold">No se pudieron cargar los códigos.</p>
                            <p className="text-xs mt-1">{fallo}</p>
                            <button onClick={cargar} className="mt-2 text-xs font-bold underline">Reintentar</button>
                        </div>
                    </div>
                )}

                {cargando && <p className="text-sm text-gray-400 py-8 text-center">Cargando códigos…</p>}

                {!cargando && !fallo && items.length === 0 && (
                    <div className="text-center border-2 border-dashed border-gray-100 rounded-2xl py-12 px-6">
                        <QrCode className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                        <p className="text-sm text-gray-500 font-semibold">Este enlace todavía no tiene códigos QR.</p>
                        <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                            Generá uno por cada pieza —afiche, redes, invitación— y después vas a poder ver cuál trajo más gente.
                        </p>
                        <button type="button" onClick={() => setEditor({ abierto: true, qr: null })}
                            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-rotary-navy">
                            <Plus className="w-4 h-4" /> Generar el primero
                        </button>
                    </div>
                )}

                {!cargando && items.length > 0 && (
                    <ul className="space-y-3">
                        {items.map(q => {
                            const url = urlDelQr(q, link, dominio);
                            const dias = daysLeft(q.expiresAt);
                            const preview = previewDataUri(url, q.design);
                            return (
                                <li key={q.id} className="rounded-2xl border border-gray-100 p-4 flex gap-4 hover:border-gray-200 transition-colors">
                                    <div className="w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border border-gray-100 bg-white">
                                        {preview && <img src={preview} alt={`QR ${q.name}`} className="w-full h-full object-contain" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h5 className="font-bold text-gray-800 truncate">{q.name}</h5>
                                            <EstadoPill state={q.state} texto={QR_STATE_LABELS[q.state]} />
                                            <span className="text-[11px] text-gray-400">{QR_MEDIA_SHORT[q.medium] || q.medium}</span>
                                            {q.campaign && <span className="text-[11px] text-gray-400">· {q.campaign}</span>}
                                        </div>
                                        {q.label && <p className="text-xs text-gray-400 mt-0.5 truncate">{q.label}</p>}
                                        <p className="text-[11px] text-gray-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                            <span className="inline-flex items-center gap-1">
                                                <CalendarClock className="w-3 h-3" />
                                                {q.expiresAt
                                                    ? (q.state === 'expired' ? `venció el ${fechaCorta(q.expiresAt)}` : `vence el ${fechaCorta(q.expiresAt)}${dias !== null ? ` · ${dias} d` : ''}`)
                                                    : 'sin vencimiento'}
                                            </span>
                                            <span>creado el {fechaCorta(q.createdAt)}</span>
                                        </p>
                                        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mt-2 text-xs">
                                            <span><strong className="text-gray-800 tabular-nums text-base">{numero(q.totalScans)}</strong> <span className="text-gray-400">accesos</span></span>
                                            <span><strong className="text-gray-700 tabular-nums">{numero(q.uniqueVisitors)}</strong> <span className="text-gray-400">únicos</span></span>
                                            {q.blockedScans > 0 && <span><strong className="text-amber-700 tabular-nums">{numero(q.blockedScans)}</strong> <span className="text-gray-400">sin saltar</span></span>}
                                            <span className="text-gray-400">{haceCuanto(q.lastScanAt, 'sin accesos todavía')}</span>
                                        </div>
                                        {q.state !== 'active' && (
                                            <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2 inline-block">{QR_STATE_HINT[q.state]}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-1 mt-2 -ml-2 relative">
                                            <div className="relative">
                                                <button type="button" onClick={() => setMenuDescarga(menuDescarga === q.id ? '' : q.id)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rotary-blue hover:bg-sky-50">
                                                    <Download className="w-3.5 h-3.5" /> Descargar
                                                </button>
                                                {menuDescarga === q.id && (
                                                    <div className="absolute left-0 top-full mt-1 z-10 bg-white border border-gray-100 rounded-xl shadow-lg p-1 flex gap-1">
                                                        {(['png', 'svg', 'pdf'] as const).map(f => (
                                                            <button key={f} type="button" onClick={() => descargar(q, f)} disabled={Boolean(descargando)}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                                                {descargando === q.id + f ? '…' : f.toUpperCase()}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <IconBtn onClick={() => copiar(q)} title="Copiar enlace del QR">
                                                {copiado === q.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                            </IconBtn>
                                            <IconBtn onClick={() => setVerStats(q)} title={`Estadísticas de ${q.name}`}><BarChart3 className="w-4 h-4" /></IconBtn>
                                            <IconBtn onClick={() => setEditor({ abierto: true, qr: q })} title={`Editar ${q.name}`}><Pencil className="w-4 h-4" /></IconBtn>
                                            {q.state === 'active'
                                                ? <IconBtn onClick={() => cambiarEstado(q, 'paused')} title={`Pausar ${q.name}`}><Pause className="w-4 h-4" /></IconBtn>
                                                : <IconBtn onClick={() => reactivar(q)} title={q.state === 'expired' ? `Extender la vigencia de ${q.name}` : `Reactivar ${q.name}`}><Play className="w-4 h-4" /></IconBtn>}
                                            {q.status !== 'disabled' && (
                                                <IconBtn onClick={() => cambiarEstado(q, 'disabled')} title={`Deshabilitar ${q.name}`}><Ban className="w-4 h-4" /></IconBtn>
                                            )}
                                            <IconBtn onClick={() => eliminar(q)} title={`Eliminar ${q.name}`} peligro><Trash2 className="w-4 h-4" /></IconBtn>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <p className="text-[11px] text-gray-400 mt-6">
                    Se miden accesos a la dirección codificada en cada QR, no escaneos físicos: si alguien comparte esa
                    dirección por chat, su tráfico se atribuye al mismo QR. Ninguna cifra de acá es una inscripción confirmada.
                </p>
            </aside>

            {editor.abierto && (
                <QrEditor
                    link={link} dominio={dominio} qr={editor.qr} siteLogo={siteLogo}
                    onCerrar={() => setEditor({ abierto: false, qr: null })}
                    onGuardado={() => { refrescar(); }}
                />
            )}
            {verStats && <QrStatsModal qr={verStats} link={link} onCerrar={() => setVerStats(null)} />}
        </div>
    );
}
