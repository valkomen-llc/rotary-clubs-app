// ════════════════════════════════════════════════════════════════════
// Plantillas IA — el portal público
// v4.723.0
//
// Cualquiera con el enlace genera su pieza. Sin sesión, sin cuenta, sin saber
// nada del sistema. Mismo lugar que el Generador de Pendones en la aplicación:
// una ruta pública, fuera del panel.
//
// ── LO QUE ESTA PANTALLA NO TIENE, Y ES A PROPÓSITO ─────────────────
//
// No hay capas, ni propiedades, ni elementos, ni tiradores, ni zoom, ni nada
// técnico. El formulario y la vista previa, y ya. `DesignCanvas` se reutiliza
// en modo NO interactivo: es el mismo dibujo que el editor y que la
// exportación, sin las herramientas.
//
// ── EL FORMULARIO NO ESTÁ ESCRITO ACÁ ───────────────────────────────
//
// Los campos llegan del servidor, derivados de las variables que la plantilla
// publicada realmente usa (`buildPublicFields`). Por eso una plantilla nueva
// —bienvenida, reconocimiento, cambio de junta— no necesita tocar este archivo:
// su formulario aparece solo. Es el requisito de escalabilidad del pedido, y la
// razón de que esta pantalla dibuje campos genéricos en vez de un formulario a
// medida del aniversario.
//
// ── LA VISTA PREVIA ES LOCAL ────────────────────────────────────────
//
// El documento llega con lo institucional ya resuelto y sólo los marcadores del
// formulario pendientes; el navegador los sustituye con `applyVariables`, el
// MISMO que usa el editor. Una petición por pulsación para repintar sería lenta
// y frágil, y no compraría nada: lo que protege la pieza es que el diseño viene
// del servidor y no se puede pedir de otra forma.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    Download, Loader2, Sparkles, Upload, Image as ImageIcon, X,
    Share2, AlertTriangle, Check,
} from 'lucide-react';
import DesignCanvas from '../components/admin/design-studio/DesignCanvas';
import { applyPublicValues, formatOf, type DesignDocument } from '../lib/designSpec';
import { exportDocument, canvasToBlob, renderDocumentToCanvas } from '../lib/designRender';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

interface PublicField {
    key: string; type: 'text' | 'textarea' | 'number' | 'image';
    label: string; placeholder: string; help: string;
    maxChars: number | null; required: boolean; ai: boolean;
    /** Qué CLASE de dato es. Un logotipo y una fotografía comparten
     *  `type: 'image'` y no se tratan igual: el servidor lo usa para elegir la
     *  receta de adaptación y acá decide qué archivos ofrece el selector.
     *  Puede faltar en una plantilla publicada antes de v4.723. */
    kind?: string; accept?: string | null; defaultValue?: string;
}
interface PublicTemplate {
    slug: string; name: string; intro: string; category: string; format: string;
    document: DesignDocument; fields: PublicField[];
}
interface PhotoNote { level: string; reason: string; consequence: string }

const TONOS = [
    { id: 'emotivo', label: 'Más emotivo' },
    { id: 'institucional', label: 'Más institucional' },
    { id: 'corto', label: 'Más corto' },
    { id: 'elegante', label: 'Más elegante' },
    { id: 'inspirador', label: 'Más inspirador' },
];

const box = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600';

const PlantillaPublica: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();

    // TODOS los hooks arriba, antes de cualquier return: React identifica cada
    // hook por su orden de llamada y un return temprano en medio tumba el árbol
    // (regla del sitio, v4.689).
    const [tpl, setTpl] = useState<PublicTemplate | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    // Los avisos son POR CAMPO. Con una sola lista, subir el logotipo borraba
    // los avisos de la fotografía y —peor— los del logotipo se pintaban también
    // debajo de la foto: dos campos de imagen distintos compartiendo un mismo
    // renglón de advertencias no dicen nada de ninguno.
    const [photoNotes, setPhotoNotes] = useState<Record<string, PhotoNote[]>>({});
    // Cuál campo está subiendo. Con un solo indicador, subir una imagen dejaba
    // girando el de todas.
    const [uploadingKey, setUploadingKey] = useState<string | null>(null);
    const [busy, setBusy] = useState<'ia' | 'descarga' | 'compartir' | null>(null);
    const [aiNote, setAiNote] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<string | null>(null);
    const [zoom, setZoom] = useState(0.42);
    const [done, setDone] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Sin slug —alguien entró a `/plantillas` a secas— no hay nada que
        // pedir. Se dice, en vez de dejar la pantalla girando: la aplicación no
        // tiene ruta comodín, así que una dirección incompleta se ve como una
        // página en blanco y nadie entiende por qué.
        if (!slug) { setLoadError('SIN_SLUG'); return; }
        fetch(`${API}/public/design/${encodeURIComponent(slug)}`, { cache: 'no-store' })
            .then(async r => {
                const d = await r.json().catch(() => null);
                if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
                return d as PublicTemplate;
            })
            .then(t => {
                setTpl(t);
                // El valor por defecto que declaró quien publicó: el formulario
                // arranca con él en vez de vacío. Es lo que permite publicar una
                // plantilla que ya se ve completa y que sólo haya que cambiar lo
                // que cambia de un club a otro.
                const iniciales: Record<string, string> = {};
                for (const f of t.fields || []) if (f.defaultValue) iniciales[f.key] = f.defaultValue;
                if (Object.keys(iniciales).length) setValues(iniciales);
            })
            .catch(e => setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la plantilla.'));
    }, [slug]);

    // El lienzo se ajusta al ancho disponible. Sin esto, en un móvil la pieza
    // de 1080 px se sale de la pantalla y no se ve nada.
    useEffect(() => {
        const fit = () => {
            const el = stageRef.current;
            if (!el || !tpl) return;
            const fmt = formatOf(tpl.format);
            setZoom(Math.min((el.clientWidth - 8) / fmt.width, 620 / fmt.height));
        };
        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [tpl]);

    // Sustitución local: instantánea, sin ida y vuelta al servidor.
    //
    // `applyPublicValues`, no `applyVariables`: acá un nodo sin valor se QUITA.
    // En el editor un hueco vacío es donde el administrador va a poner algo; en
    // el portal es un defecto impreso —la placa blanca del logotipo flotando
    // sobre la foto— en una pieza que nadie puede corregir después.
    const doc = useMemo<DesignDocument | null>(() => {
        if (!tpl) return null;
        // Las claves del formulario viajan aparte: son las únicas que esta
        // pantalla puede llenar. Un marcador que no se ofrece —ni se congeló al
        // publicar— deja el nodo tal como se publicó, en vez de resolverse
        // contra un diccionario vacío y quedar en blanco. Sin esto, una
        // plantilla publicada con un dato al que nadie llega salía con el pie
        // institucional y hueco todo lo demás.
        const llenables = (tpl.fields || []).map(f => f.key);
        return { ...tpl.document, nodes: applyPublicValues(tpl.document.nodes, values, llenables) };
    }, [tpl, values]);

    const set = useCallback((key: string, v: string) => {
        setValues(prev => (prev[key] === v ? prev : { ...prev, [key]: v }));
    }, []);

    // La CLAVE del campo viaja con el archivo, y es lo que hace que un logotipo
    // se trate como un logotipo: con ella el servidor resuelve el recuadro de
    // ESE nodo y la receta de ESA clase de campo —sin recorte y conservando la
    // transparencia para un escudo, recorte al encuadre para una fotografía—.
    // Sin ella, toda imagen entraba por el camino de la fotografía.
    const subirImagen = useCallback(async (file: File | undefined, key: string) => {
        if (!file || !slug) return;
        const aviso = (reason: string, consequence: string) =>
            setPhotoNotes(prev => ({ ...prev, [key]: [{ level: 'warn', reason, consequence }] }));

        if (!file.type.startsWith('image/')) { aviso('Ese archivo no es una imagen.', 'Probá con un JPG o un PNG.'); return; }
        setUploadingKey(key);
        setPhotoNotes(prev => ({ ...prev, [key]: [] }));
        try {
            const form = new FormData();
            form.append('file', file);
            form.append('key', key);
            const r = await fetch(`${API}/public/design/${encodeURIComponent(slug)}/photo`, { method: 'POST', body: form });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || 'No se pudo procesar la imagen.');
            set(key, d.dataUrl);
            // Los avisos del recorte se MUESTRAN: si se va a perder a las
            // personas de los bordes, quien subió la foto es el único que puede
            // decidir subir otra.
            setPhotoNotes(prev => ({ ...prev, [key]: d.notes || [] }));
        } catch (e) {
            aviso(e instanceof Error ? e.message : 'No se pudo procesar la imagen.', 'Probá con otro archivo.');
        } finally { setUploadingKey(null); }
    }, [slug, set]);

    const escribirIA = useCallback(async (tone: string | null) => {
        if (!slug) return;
        setBusy('ia'); setAiNote(null);
        try {
            const r = await fetch(`${API}/public/design/${encodeURIComponent(slug)}/message`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ values, tone, text: tone ? values.mensaje || '' : '' }),
            });
            const d = await r.json().catch(() => null);
            if (!r.ok) throw new Error(d?.error || 'No se pudo escribir el mensaje.');
            set('mensaje', d.mensaje || '');
            if (d.degraded) setAiNote(d.note || 'El texto se escribió sin modelo de lenguaje.');
        } catch (e) {
            setAiNote(e instanceof Error ? e.message : 'No se pudo escribir el mensaje. Podés escribirlo a mano.');
        } finally { setBusy(null); }
    }, [slug, values, set]);

    const marcarUso = useCallback(() => {
        if (!slug) return;
        fetch(`${API}/public/design/${encodeURIComponent(slug)}/used`, { method: 'POST' }).catch(() => { /* no puede romper una descarga */ });
    }, [slug]);

    const descargar = useCallback(async () => {
        if (!doc || !tpl) return;
        setBusy('descarga');
        try {
            await exportDocument(doc, { format: 'png', title: `${tpl.name}-${values.club || ''}` });
            marcarUso();
            setDone(true);
            window.setTimeout(() => setDone(false), 2500);
        } catch (e) {
            setAiNote(e instanceof Error ? e.message : 'No se pudo generar la imagen.');
        } finally { setBusy(null); }
    }, [doc, tpl, values.club, marcarUso]);

    // Compartir usa la API del sistema cuando existe —en un móvil abre WhatsApp
    // directamente, que es donde esto se va a usar—. En un escritorio sin esa
    // API no se finge: se descarga, que es lo que se puede hacer de verdad.
    const compartir = useCallback(async () => {
        if (!doc || !tpl) return;
        setBusy('compartir');
        try {
            const canvas = await renderDocumentToCanvas(doc, { scale: 2, opaque: true });
            const blob = await canvasToBlob(canvas, 'image/png');
            const file = new File([blob], 'felicitacion.png', { type: 'image/png' });
            const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
            if (nav.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: tpl.name });
                marcarUso();
            } else {
                await descargar();
            }
        } catch (e) {
            // Cancelar el diálogo de compartir lanza AbortError: no es un fallo.
            if (!(e instanceof DOMException && e.name === 'AbortError')) {
                setAiNote(e instanceof Error ? e.message : 'No se pudo compartir.');
            }
        } finally { setBusy(null); }
    }, [doc, tpl, marcarUso, descargar]);

    const faltantes = useMemo(
        () => (tpl?.fields || []).filter(f => f.required && !values[f.key]?.trim()).map(f => f.label),
        [tpl, values]
    );

    if (loadError) {
        const sinSlug = loadError === 'SIN_SLUG';
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
                <div className="max-w-sm text-center">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-200 flex items-center justify-center mb-4">
                        <AlertTriangle className="w-6 h-6 text-gray-500" />
                    </div>
                    <h1 className="text-lg font-black text-gray-800 mb-1">
                        {sinSlug ? 'Falta el nombre de la plantilla' : 'Esta plantilla no está disponible'}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {sinSlug
                            ? 'Esta dirección necesita el enlace completo, del tipo /plantillas/aniversario. Pedíselo a quien te lo compartió.'
                            : loadError}
                    </p>
                </div>
            </div>
        );
    }

    if (!tpl || !doc) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
            </div>
        );
    }

    const fmt = formatOf(tpl.format);

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            <header className="bg-white border-b border-gray-200 px-5 py-4">
                <h1 className="text-lg font-black text-gray-900">{tpl.name}</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                    {tpl.intro || `Completá los datos y descargá tu pieza lista para publicar · ${fmt.width}×${fmt.height} px`}
                </p>
            </header>

            <div className="flex-1 flex flex-col lg:flex-row max-w-6xl w-full mx-auto">
                {/* ── Formulario ───────────────────────────────────── */}
                <div className="w-full lg:w-[400px] shrink-0 p-5 space-y-5">
                    {/* Sin campos no hay nada que completar, y una columna con
                        sólo dos botones no explica por qué. Se dice: para quien
                        usa el enlace es una pieza fija, y para quien lo publicó
                        es la pista de que le faltó marcar los campos. */}
                    {tpl.fields.length === 0 && (
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-sm font-bold text-gray-800 mb-1">Esta pieza no tiene datos para completar</p>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Descargala tal como está. Si esperabas poder escribir el nombre de tu club o subir una
                                foto, avisale a quien te compartió el enlace: los campos se marcan al publicar la
                                plantilla.
                            </p>
                        </div>
                    )}

                    {tpl.fields.map(field => {
                        if (field.type === 'image') {
                            const v = values[field.key];
                            const subiendo = uploadingKey === field.key;
                            const notas = photoNotes[field.key] || [];
                            // Un logotipo se PREVISUALIZA entero y sobre un fondo
                            // a cuadros: con `object-cover` —lo correcto para una
                            // fotografía— el escudo se ve recortado en la casilla
                            // aunque en la pieza entre completo, y eso hace creer
                            // que el sistema lo recortó.
                            const entera = field.kind ? field.kind !== 'foto' : field.key === 'logo';
                            return (
                                <div key={field.key}>
                                    <label className="block text-xs font-black text-gray-700 mb-1.5">
                                        {field.label}{field.required && <span className="text-red-500"> *</span>}
                                    </label>
                                    {v ? (
                                        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                                            <img src={v} alt="" className={`w-full h-40 ${entera ? 'object-contain p-3' : 'object-cover'}`} />
                                            <button onClick={() => { set(field.key, ''); setPhotoNotes(prev => ({ ...prev, [field.key]: [] })); }}
                                                className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow" title="Quitar">
                                                <X className="w-4 h-4 text-gray-700" />
                                            </button>
                                        </div>
                                    ) : (
                                        // Arrastrar y soltar, además del clic. En un escritorio es
                                        // el gesto natural y el pedido lo nombra explícitamente.
                                        <label
                                            onDragOver={e => { e.preventDefault(); setDragOver(field.key); }}
                                            onDragLeave={() => setDragOver(null)}
                                            onDrop={e => { e.preventDefault(); setDragOver(null); subirImagen(e.dataTransfer.files?.[0], field.key); }}
                                            className={`flex flex-col items-center justify-center gap-2 h-40 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${dragOver === field.key ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'}`}>
                                            {subiendo
                                                ? <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
                                                : <Upload className="w-6 h-6 text-gray-400" />}
                                            <span className="text-xs font-semibold text-gray-600">
                                                {subiendo ? 'Adaptando la imagen…' : 'Arrastrá el archivo o hacé clic'}
                                            </span>
                                            <input type="file" accept={field.accept || 'image/*'} className="hidden" disabled={subiendo}
                                                onChange={e => { subirImagen(e.target.files?.[0], field.key); e.target.value = ''; }} />
                                        </label>
                                    )}
                                    {field.help && <p className="mt-1 text-[11px] text-gray-400">{field.help}</p>}
                                    {notas.map((n, i) => (
                                        <p key={i} className="mt-2 flex gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            <span><strong>{n.reason}</strong> {n.consequence}</span>
                                        </p>
                                    ))}
                                </div>
                            );
                        }

                        if (field.type === 'textarea') {
                            const v = values[field.key] || '';
                            return (
                                <div key={field.key}>
                                    <label className="block text-xs font-black text-gray-700 mb-1.5">{field.label}</label>
                                    {field.ai && (
                                        <button onClick={() => escribirIA(null)} disabled={busy === 'ia'}
                                            className="w-full mb-2 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg px-4 py-2.5 transition-colors">
                                            {busy === 'ia' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                            {busy === 'ia' ? 'Escribiendo…' : 'Generar mensaje con IA'}
                                        </button>
                                    )}
                                    <textarea className={`${box} min-h-[130px] resize-y leading-relaxed`} value={v}
                                        maxLength={field.maxChars || undefined} placeholder={field.placeholder}
                                        onChange={e => set(field.key, e.target.value)} />
                                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                        <span>{v.length}{field.maxChars ? ` / ${field.maxChars}` : ''} caracteres</span>
                                        {aiNote && <span className="text-amber-600">{aiNote}</span>}
                                    </div>
                                    {field.ai && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {TONOS.map(t => (
                                                <button key={t.id} onClick={() => escribirIA(t.id)} disabled={busy === 'ia' || !v.trim()}
                                                    className="text-[11px] font-semibold rounded-full border border-gray-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-40 px-2.5 py-1 text-gray-600 transition-colors">
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <div key={field.key}>
                                <label className="block text-xs font-black text-gray-700 mb-1.5">
                                    {field.label}{field.required && <span className="text-red-500"> *</span>}
                                </label>
                                <input
                                    className={box}
                                    inputMode={field.type === 'number' ? 'numeric' : undefined}
                                    maxLength={field.maxChars || undefined}
                                    placeholder={field.placeholder}
                                    value={values[field.key] || ''}
                                    onChange={e => set(field.key, field.type === 'number' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                                />
                                {field.help && <p className="mt-1 text-[11px] text-gray-400">{field.help}</p>}
                            </div>
                        );
                    })}

                    <div className="pt-2 space-y-2">
                        <button onClick={descargar} disabled={!!busy || !!uploadingKey || faltantes.length > 0}
                            className="w-full flex items-center justify-center gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-50 text-white font-bold rounded-lg px-4 py-3 transition-colors">
                            {busy === 'descarga' ? <Loader2 className="w-4 h-4 animate-spin" />
                                : done ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                            {busy === 'descarga' ? 'Generando…' : done ? '¡Listo!' : 'Descargar PNG'}
                        </button>
                        <button onClick={compartir} disabled={!!busy || !!uploadingKey || faltantes.length > 0}
                            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-50 border border-gray-300 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors">
                            {busy === 'compartir' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                            Compartir
                        </button>
                        {faltantes.length > 0 && (
                            <p className="text-[11px] text-gray-500 text-center">Falta completar: {faltantes.join(', ')}.</p>
                        )}
                        <p className="text-[11px] text-gray-400 text-center pt-1">
                            La imagen se genera en tu navegador, a {fmt.width * 2}×{fmt.height * 2} px.
                        </p>
                    </div>
                </div>

                {/* ── Vista previa ─────────────────────────────────── */}
                <div className="flex-1 min-w-0 p-5 lg:pl-0">
                    <div className="lg:sticky lg:top-5">
                        <div ref={stageRef} className="flex justify-center">
                            {/* El MISMO componente del editor, sin herramientas.
                                Es lo que garantiza que esta vista previa sea la
                                pieza que se descarga. */}
                            <DesignCanvas doc={doc} zoom={zoom} interactive={false} showGuides={false} />
                        </div>
                        <p className="mt-3 text-center text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5" />
                            Se actualiza mientras escribís. Es exactamente lo que vas a descargar.
                        </p>
                    </div>
                </div>
            </div>

            <footer className="text-center py-6 text-[10px] text-gray-400">
                Generado con <span className="font-semibold">Club Platform for Rotary</span>
            </footer>
        </div>
    );
};

export default PlantillaPublica;
