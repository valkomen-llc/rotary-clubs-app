// El editor de un código QR: identificación, vigencia, diseño, vista previa y
// descargas (v4.1278).
//
// La vista previa es la MISMA imagen que se descarga: ambas salen de
// `qrRender.ts` sobre la dirección de seguimiento del código. Al crear, el
// código todavía no existe —lo asigna el servidor— así que la vista previa usa
// uno de muestra y lo dice; al guardar, la pantalla pasa a «listo» con el
// código real y los botones de descarga.
import { useEffect, useMemo, useState } from 'react';
import { X, Download, Copy, Check, Image as ImageIcon, AlertTriangle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import MediaPicker from '../content-studio/MediaPicker';
import {
    VALIDITY_PRESETS, QR_MEDIA, EC_LEVELS, EC_LABELS, DESIGN_DEFAULTS, SIZE_OPTIONS,
    normalizeDesign, trackingUrl, contrastRatio, type QrDesign,
} from '../../../lib/linkQr';
import { imageToDataUrl } from '../../../lib/qrRender';
import { api, type QrDto, type Redirect } from './api';
import { descargarQr, previewDataUri, urlDelQr } from './qrDownloads';

interface Props {
    link: Redirect;
    dominio: string;
    qr?: QrDto | null;
    siteLogo?: string;
    onCerrar: () => void;
    onGuardado: (qr: QrDto) => void;
}

interface Form {
    name: string;
    campaign: string;
    medium: string;
    label: string;
    preset: 'd30' | 'd90' | 'none' | 'custom';
    customDate: string;
    design: QrDesign;
}

const hoyMas = (dias: number) => {
    const d = new Date(Date.now() + dias * 86400000);
    return d.toISOString().slice(0, 10);
};

const campo = 'w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none text-sm';
const rotulo = 'block text-xs font-semibold text-gray-500 mb-2';

export default function QrEditor({ link, dominio, qr = null, siteLogo, onCerrar, onGuardado }: Props) {
    const editando = Boolean(qr);
    const [form, setForm] = useState<Form>(() => ({
        name: qr?.name || '',
        campaign: qr?.campaign || '',
        medium: qr?.medium || 'impreso',
        label: qr?.label || '',
        preset: qr?.validityPreset || 'none',
        customDate: qr?.expiresAt ? String(qr.expiresAt).slice(0, 10) : hoyMas(60),
        design: { ...DESIGN_DEFAULTS, ...(qr?.design || {}) },
    }));
    const [cambiarVigencia, setCambiarVigencia] = useState(!editando);
    const [guardando, setGuardando] = useState(false);
    const [creado, setCreado] = useState<QrDto | null>(null);
    const [copiado, setCopiado] = useState(false);
    const [pickerAbierto, setPickerAbierto] = useState(false);
    const [logoHref, setLogoHref] = useState('');
    const [logoFallo, setLogoFallo] = useState(false);
    const [descargando, setDescargando] = useState('');

    // El logotipo se incrusta en la vista previa como data URL: un SVG en un
    // `<img>` no puede traer recursos externos. Si no se puede, la vista
    // previa va sin logo y se avisa; la descarga lo intenta otra vez.
    useEffect(() => {
        let vivo = true;
        setLogoHref(''); setLogoFallo(false);
        if (!form.design.logoUrl) return;
        imageToDataUrl(form.design.logoUrl)
            .then(d => { if (vivo) setLogoHref(d); })
            .catch(() => { if (vivo) setLogoFallo(true); });
        return () => { vivo = false; };
    }, [form.design.logoUrl]);

    const chequeo = useMemo(() => normalizeDesign(form.design), [form.design]);
    const contraste = useMemo(() => contrastRatio(form.design.fg, form.design.bg), [form.design.fg, form.design.bg]);

    const objetivo = creado || qr;
    const texto = objetivo
        ? urlDelQr(objetivo, link, dominio)
        : trackingUrl({ host: dominio, slug: link.slug, code: 'vistaprevia' });
    const preview = useMemo(
        () => previewDataUri(texto, chequeo.design, logoHref || undefined),
        [texto, chequeo.design, logoHref]
    );

    const vence = useMemo(() => {
        if (form.preset === 'none') return 'Sin vencimiento: funciona hasta que lo pauses o deshabilites.';
        if (form.preset === 'custom') return form.customDate ? `Vence el ${form.customDate}.` : 'Elegí la fecha.';
        const dias = VALIDITY_PRESETS[form.preset].days || 0;
        return `Vence el ${hoyMas(dias)} (al final del día).`;
    }, [form.preset, form.customDate]);

    const setDesign = (patch: Partial<QrDesign>) => setForm(f => ({ ...f, design: { ...f.design, ...patch } }));

    const guardar = async () => {
        if (!form.name.trim()) { toast.error('Ponele un nombre al QR: «Afiche A3», «Instagram», «Invitación».'); return; }
        if (!chequeo.ok) { toast.error(chequeo.errors[0]); return; }
        if (form.preset === 'custom' && !form.customDate) { toast.error('Elegí la fecha de vencimiento.'); return; }
        setGuardando(true);
        try {
            const body: any = {
                name: form.name, campaign: form.campaign, medium: form.medium, label: form.label,
                design: chequeo.design,
            };
            if (cambiarVigencia) {
                body.validity = {
                    preset: form.preset,
                    customDate: form.preset === 'custom' ? `${form.customDate}T23:59:59` : null,
                };
            }
            if (editando && qr) {
                const r = await api(`/${link.id}/qrs/${qr.id}`, { method: 'PUT', body: JSON.stringify(body) });
                toast.success('QR actualizado. La imagen descargada sigue valiendo: el código no cambió.');
                onGuardado(r);
                onCerrar();
            } else {
                const r = await api(`/${link.id}/qrs`, { method: 'POST', body: JSON.stringify(body) });
                setCreado(r);
                onGuardado(r);
                toast.success('QR creado. Ya podés descargarlo.');
            }
            for (const w of (chequeo.warnings || [])) toast(w, { icon: 'ℹ️' });
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setGuardando(false);
        }
    };

    const copiar = async () => {
        if (!objetivo) return;
        try {
            await navigator.clipboard.writeText(urlDelQr(objetivo, link, dominio));
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1800);
        } catch { toast.error('El navegador no dejó copiar. La dirección es: ' + texto); }
    };

    const descargar = async (f: 'png' | 'svg' | 'pdf') => {
        if (!objetivo) return;
        setDescargando(f);
        try { await descargarQr(f, { ...objetivo, design: chequeo.design }, link, dominio); }
        finally { setDescargando(''); }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onCerrar}>
            <div
                className="bg-white rounded-3xl w-full max-w-5xl my-6 shadow-2xl grid grid-cols-1 lg:grid-cols-[1fr_340px]"
                onClick={e => e.stopPropagation()}
                role="dialog" aria-modal="true" aria-label={editando ? 'Editar código QR' : 'Generar código QR'}
            >
                {/* ── Formulario ── */}
                <div className="p-8 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1">
                        <h4 className="text-lg font-bold text-gray-800">
                            {creado ? 'Código QR listo' : editando ? 'Editar código QR' : 'Generar código QR'}
                        </h4>
                        <button onClick={onCerrar} aria-label="Cerrar" className="p-2 text-gray-300 hover:text-gray-600 lg:hidden">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mb-6">
                        Enlace: <strong className="text-gray-600">{link.name || link.slug}</strong>
                        <span className="font-mono ml-1">{dominio}{link.slug}</span> → <span className="truncate">{link.target}</span>
                    </p>

                    {creado ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 mb-6 text-sm text-emerald-800">
                            <p className="font-semibold mb-1">El código quedó creado y activo.</p>
                            <p className="text-xs text-emerald-700">
                                Su identidad es permanente: podés descargarlo las veces que quieras, cambiar el destino del
                                enlace, pausarlo o extender su vigencia, y la imagen impresa sigue sirviendo.
                            </p>
                        </div>
                    ) : null}

                    <fieldset disabled={Boolean(creado)} className="space-y-6">
                        <section>
                            <h5 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Identificación</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className={rotulo}>NOMBRE DEL QR</label>
                                    <input className={campo} value={form.name} placeholder="Afiche A3 · Instagram · Invitación impresa"
                                        onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80} autoFocus />
                                </div>
                                <div>
                                    <label className={rotulo}>CAMPAÑA O EVENTO (opcional)</label>
                                    <input className={campo} value={form.campaign} placeholder="Feria de Proyectos 2027"
                                        onChange={e => setForm({ ...form, campaign: e.target.value })} maxLength={80} />
                                </div>
                                <div>
                                    <label className={rotulo}>MEDIO DE DIFUSIÓN</label>
                                    <select className={campo} value={form.medium} onChange={e => setForm({ ...form, medium: e.target.value })}>
                                        {Object.entries(QR_MEDIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className={rotulo}>ETIQUETA INTERNA DE LA PIEZA (opcional)</label>
                                    <input className={campo} value={form.label} placeholder="Pendón de la entrada principal · lote 2"
                                        onChange={e => setForm({ ...form, label: e.target.value })} maxLength={120} />
                                </div>
                            </div>
                        </section>

                        <section>
                            <div className="flex items-center justify-between mb-3">
                                <h5 className="text-xs font-bold uppercase tracking-wide text-gray-400">Vigencia</h5>
                                {editando && !cambiarVigencia && (
                                    <button type="button" onClick={() => setCambiarVigencia(true)}
                                        className="text-xs font-bold text-rotary-blue hover:underline">
                                        Cambiar vigencia
                                    </button>
                                )}
                            </div>
                            {editando && !cambiarVigencia ? (
                                <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">
                                    {qr?.expiresAt
                                        ? <>Vence el <strong>{String(qr.expiresAt).slice(0, 10)}</strong>{qr.state === 'expired' ? <span className="text-amber-700"> · ya venció. Cambiá la vigencia para reactivarlo sin generar otra imagen.</span> : null}</>
                                        : <>Sin vencimiento.</>}
                                </p>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {(Object.keys(VALIDITY_PRESETS) as Form['preset'][]).map(k => (
                                            <button type="button" key={k} onClick={() => setForm({ ...form, preset: k })}
                                                className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                                                    form.preset === k ? 'bg-rotary-blue text-white border-rotary-blue' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                                }`}>
                                                {VALIDITY_PRESETS[k].label}
                                            </button>
                                        ))}
                                    </div>
                                    {form.preset === 'custom' && (
                                        <input type="date" className={`${campo} mt-3`} value={form.customDate} min={hoyMas(1)}
                                            onChange={e => setForm({ ...form, customDate: e.target.value })} />
                                    )}
                                    <p className="text-[11px] text-gray-400 mt-2">
                                        {vence} La fecha la calcula el servidor. Después podés extenderla sin cambiar la imagen.
                                    </p>
                                </>
                            )}
                        </section>

                        <section>
                            <h5 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Diseño</h5>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className={rotulo}>COLOR PRINCIPAL</label>
                                    <div className="flex items-center gap-2">
                                        <input type="color" value={form.design.fg} onChange={e => setDesign({ fg: e.target.value })}
                                            className="w-10 h-10 rounded-lg border border-gray-200 p-0.5 cursor-pointer" aria-label="Color principal" />
                                        <input className={`${campo} font-mono text-xs`} value={form.design.fg}
                                            onChange={e => setDesign({ fg: e.target.value })} maxLength={7} />
                                    </div>
                                </div>
                                <div>
                                    <label className={rotulo}>COLOR DE FONDO</label>
                                    <div className="flex items-center gap-2">
                                        <input type="color" value={form.design.bg} onChange={e => setDesign({ bg: e.target.value })}
                                            className="w-10 h-10 rounded-lg border border-gray-200 p-0.5 cursor-pointer" aria-label="Color de fondo" />
                                        <input className={`${campo} font-mono text-xs`} value={form.design.bg}
                                            onChange={e => setDesign({ bg: e.target.value })} maxLength={7} />
                                    </div>
                                </div>
                                <div>
                                    <label className={rotulo}>TAMAÑO DEL PNG</label>
                                    <select className={campo} value={form.design.size} onChange={e => setDesign({ size: Number(e.target.value) })}>
                                        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} px{s >= 2048 ? ' · gran formato' : s === 1024 ? ' · recomendado' : ''}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={rotulo}>MARGEN ({form.design.margin} módulos)</label>
                                    <input type="range" min={0} max={10} value={form.design.margin}
                                        onChange={e => setDesign({ margin: Number(e.target.value) })} className="w-full mt-3" aria-label="Margen de seguridad" />
                                </div>
                                <div className="col-span-2">
                                    <label className={rotulo}>CORRECCIÓN DE ERRORES</label>
                                    <select className={campo} value={form.design.ecLevel} disabled={Boolean(form.design.logoUrl)}
                                        onChange={e => setDesign({ ecLevel: e.target.value as QrDesign['ecLevel'] })}>
                                        {EC_LEVELS.map(l => <option key={l} value={l}>{EC_LABELS[l]}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className={rotulo}>ETIQUETA DEBAJO DEL CÓDIGO (opcional)</label>
                                    <input className={campo} value={form.design.caption} placeholder="Inscribite acá"
                                        onChange={e => setDesign({ caption: e.target.value })} maxLength={60} />
                                </div>
                                <div className="col-span-2 md:col-span-4">
                                    <label className={rotulo}>LOGOTIPO EN EL CENTRO (opcional)</label>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input className={`${campo} flex-1 min-w-[200px]`} value={form.design.logoUrl} placeholder="https://… o elegí uno de la Biblioteca"
                                            onChange={e => setDesign({ logoUrl: e.target.value })} />
                                        <button type="button" onClick={() => setPickerAbierto(true)}
                                            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:border-gray-300">
                                            <ImageIcon className="w-3.5 h-3.5" /> Biblioteca
                                        </button>
                                        {siteLogo && (
                                            <button type="button" onClick={() => setDesign({ logoUrl: siteLogo })}
                                                className="px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:border-gray-300">
                                                Logo del sitio
                                            </button>
                                        )}
                                        {form.design.logoUrl && (
                                            <button type="button" onClick={() => setDesign({ logoUrl: '' })}
                                                className="px-3 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-red-500">
                                                Quitar
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-2">
                                        Con logotipo la corrección se fija en H y el logo ocupa como máximo un quinto del lado: así el código sigue leyéndose.
                                        {logoFallo && <span className="text-amber-700"> El logotipo no se pudo cargar para la vista previa; la descarga lo intenta de nuevo.</span>}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 space-y-2">
                                <p className={`text-xs inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                                    contraste < 3 ? 'bg-red-50 text-red-600' : contraste < 4.5 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                                }`}>
                                    Contraste {contraste.toFixed(1)}:1 {contraste >= 4.5 ? '· óptimo para imprenta' : contraste >= 3 ? '· se lee, pero conviene más' : '· no se va a leer'}
                                </p>
                                {chequeo.errors.map((e, i) => (
                                    <p key={i} className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-start gap-2">
                                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {e}
                                    </p>
                                ))}
                                {chequeo.warnings.map((w, i) => (
                                    <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex items-start gap-2">
                                        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {w}
                                    </p>
                                ))}
                            </div>
                        </section>
                    </fieldset>

                    <div className="flex flex-wrap justify-end gap-3 mt-8">
                        {creado ? (
                            <button onClick={onCerrar} className="px-6 py-2.5 rounded-xl bg-rotary-blue text-white text-sm font-bold hover:bg-rotary-navy">
                                Listo
                            </button>
                        ) : (
                            <>
                                <button onClick={onCerrar} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
                                <button onClick={guardar} disabled={guardando || !chequeo.ok || !form.name.trim()}
                                    className="px-6 py-2.5 rounded-xl bg-rotary-blue text-white text-sm font-bold hover:bg-rotary-navy disabled:opacity-40 transition-colors">
                                    {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear código QR'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Vista previa y descargas ── */}
                <aside className="bg-gray-50 rounded-b-3xl lg:rounded-bl-none lg:rounded-r-3xl p-6 flex flex-col items-center border-t lg:border-t-0 lg:border-l border-gray-100">
                    <div className="w-full flex justify-end mb-2">
                        <button onClick={onCerrar} aria-label="Cerrar" className="p-2 text-gray-300 hover:text-gray-600 hidden lg:block">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 w-full max-w-[280px]">
                        {preview
                            ? <img src={preview} alt="Vista previa del código QR" className="w-full h-auto block" />
                            : <p className="text-xs text-red-600 p-4">La dirección no cabe en un código QR con este nivel de corrección.</p>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-3 text-center break-all font-mono">{texto}</p>
                    {!objetivo && (
                        <p className="text-[11px] text-gray-400 mt-1 text-center">
                            Código de muestra: el definitivo lo asigna el servidor al crear, y después no cambia nunca.
                        </p>
                    )}

                    {objetivo && (
                        <div className="w-full mt-5 space-y-2">
                            <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">Descargar</p>
                            <div className="grid grid-cols-3 gap-2">
                                {(['png', 'svg', 'pdf'] as const).map(f => (
                                    <button key={f} type="button" onClick={() => descargar(f)} disabled={Boolean(descargando)}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:border-rotary-blue hover:text-rotary-blue disabled:opacity-50">
                                        <Download className="w-3.5 h-3.5" /> {descargando === f ? '…' : f.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                            <button type="button" onClick={copiar}
                                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:border-rotary-blue hover:text-rotary-blue">
                                {copiado ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiado ? 'Copiado' : 'Copiar enlace del QR'}
                            </button>
                            <p className="text-[10px] text-gray-400 leading-relaxed">
                                PNG para redes y documentos, SVG para la imprenta y el diseñador, PDF listo para imprimir a 80 mm.
                            </p>
                        </div>
                    )}
                </aside>
            </div>

            <MediaPicker
                isOpen={pickerAbierto}
                onClose={() => setPickerAbierto(false)}
                maxSelection={1}
                onSelect={items => { if (items[0]?.url) setDesign({ logoUrl: items[0].url }); setPickerAbierto(false); }}
            />
        </div>
    );
}
