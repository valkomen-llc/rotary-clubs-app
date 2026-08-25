// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — la pantalla pública
// v4.895.0
//
// Club, años, fotografía, botón. Nada más.
//
// ⚠️ LO QUE NO SE OFRECE ACÁ ES TAN DELIBERADO COMO LO QUE SE OFRECE. No hay
// tipografías, ni colores, ni posiciones, ni máscaras, ni capas, ni tamaños,
// ni elementos, ni lienzo, ni prompts. Todo eso lo decide la configuración que
// el operador publicó, y exponerlo convertiría esta pantalla en el editor que
// el módulo existe para no ser.
//
// ── LA VISTA PREVIA ES EL ARCHIVO ───────────────────────────────────
//
// Se monta el canvas que devuelve `renderAnniversary` y se descarga ESE mismo
// canvas. No hay una vista previa en DOM y un exportador aparte: no hay dos
// cosas que puedan diferir.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, UploadCloud, Download, RotateCcw, ImagePlus, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import {
    ACCEPTED_PHOTO_TYPES, ACCEPTED_PHOTO_LABEL, MAX_PHOTO_BYTES, YEARS_LIMITS, STAGES,
} from '../lib/anniversarySpec';
import {
    renderAnniversary, downloadCanvas, safeFileName, BACKDROP_FAILED_WARNING,
    type AnniversaryDocument,
} from '../lib/anniversaryRender';

const API = import.meta.env.VITE_API_URL || '/api';
const json = { 'Content-Type': 'application/json' };

interface ClubOption { name: string; display: string; district: string }

const AniversarioIA: React.FC = () => {
    useSEO({
        title: 'Generador de Aniversarios con IA',
        description: 'Creá la pieza del aniversario de tu club Rotary en un minuto: elegí el club, los años y una fotografía.',
    });

    // ⚠️ TODOS los hooks arriba de cualquier `return`: un hook debajo de un
    // return temprano deja la pantalla EN BLANCO al segundo render (v4.689).
    const [disponible, setDisponible] = useState<boolean | null>(null);
    const [motivo, setMotivo] = useState<string>('');
    const [titulo, setTitulo] = useState('Aniversarios IA');

    const [club, setClub] = useState('');
    const [opciones, setOpciones] = useState<ClubOption[]>([]);
    const [abierto, setAbierto] = useState(false);
    const [anios, setAnios] = useState('');
    const [foto, setFoto] = useState<string | null>(null);
    const [arrastrando, setArrastrando] = useState(false);

    const [etapa, setEtapa] = useState<string | null>(null);
    const [generando, setGenerando] = useState(false);
    const [fallo, setFallo] = useState<string | null>(null);
    const [doc, setDoc] = useState<AnniversaryDocument | null>(null);
    const [avisos, setAvisos] = useState<string[]>([]);
    const [sustituida, setSustituida] = useState<string | null>(null);
    // El diseño generado EXISTE pero su carga falló (v4.915): se ofrece volver
    // a componer SIN gastar una generación. El contador re-dispara el efecto.
    const [disenoCaido, setDisenoCaido] = useState(false);
    const [renderIntento, setRenderIntento] = useState(0);

    const previewRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    // ── ¿Está disponible en este sitio? ─────────────────────────────
    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${API}/anniversaries/public/config`, { headers: json });
                const j = await r.json();
                if (!vivo) return;
                setDisponible(!!j.available);
                setMotivo(j.reason || '');
                if (j.label) setTitulo(j.label);
            } catch {
                if (vivo) { setDisponible(false); setMotivo('El generador de aniversarios no está disponible en este momento.'); }
            }
        })();
        return () => { vivo = false; };
    }, []);

    // ── Buscador de clubes ──────────────────────────────────────────
    useEffect(() => {
        if (!disponible) return;
        const t = setTimeout(async () => {
            try {
                const r = await fetch(`${API}/anniversaries/public/clubs?q=${encodeURIComponent(club)}`);
                if (r.ok) setOpciones((await r.json()).clubs || []);
            } catch { /* el buscador es una comodidad: el campo sigue siendo libre */ }
        }, 250);
        return () => clearTimeout(t);
    }, [club, disponible]);

    // ── La fotografía ───────────────────────────────────────────────
    const tomarArchivo = useCallback((file: File | null) => {
        setFallo(null);
        if (!file) return;
        if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) { setFallo(`La fotografía tiene que ser ${ACCEPTED_PHOTO_LABEL}.`); return; }
        if (file.size > MAX_PHOTO_BYTES) { setFallo('La fotografía pesa demasiado. Probá con una de menos de 18 MB.'); return; }
        const fr = new FileReader();
        fr.onload = () => setFoto(String(fr.result || ''));
        fr.onerror = () => setFallo('No se pudo leer el archivo. Probá con otra fotografía.');
        fr.readAsDataURL(file);
        // Se limpia el input o volver a elegir EL MISMO archivo no dispara
        // `change` y el botón parece roto justo cuando alguien reintenta.
        if (fileRef.current) fileRef.current.value = '';
    }, []);

    // ── Generar ─────────────────────────────────────────────────────
    //
    // Cinco llamadas y cinco etapas. Cada una se muestra cuando OCURRIÓ, no
    // cuando la pantalla cree que va por ahí: un progreso inventado hace
    // esperar por nada.
    const generar = useCallback(async () => {
        if (!club.trim()) { setFallo('Elegí tu club.'); return; }
        const n = Number(anios);
        if (!Number.isInteger(n) || n < YEARS_LIMITS.min || n > YEARS_LIMITS.max) {
            setFallo(`¿Cuántos años cumple el club? Tiene que ser un número entre ${YEARS_LIMITS.min} y ${YEARS_LIMITS.max}.`);
            return;
        }
        if (!foto) { setFallo('Subí una fotografía del club.'); return; }

        setGenerando(true); setFallo(null); setDoc(null); setAvisos([]); setSustituida(null);
        const paso = async (url: string, body?: unknown) => {
            const r = await fetch(url, { method: 'POST', headers: json, body: JSON.stringify(body ?? {}) });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                throw new Error(j.error || 'No se pudo continuar. Probá de nuevo en un momento.');
            }
            return r.json();
        };
        try {
            setEtapa('prepare');
            const { pieceId, warnings } = await paso(`${API}/anniversaries/public/photo`, { clubName: club.trim(), years: n, photo: foto });
            if (Array.isArray(warnings) && warnings.length) setAvisos(a => [...a, ...warnings]);

            setEtapa('compose');
            await paso(`${API}/anniversaries/public/compose`, { pieceId });

            const limite = Date.now() + 180_000;
            for (;;) {
                await new Promise(res => setTimeout(res, 3000));
                if (Date.now() > limite) throw new Error('La generación está tardando más de lo normal. Probá de nuevo.');
                const r = await fetch(`${API}/anniversaries/public/piece/${pieceId}`);
                if (!r.ok) {
                    const j = await r.json().catch(() => ({}));
                    throw new Error(j.error || 'No se pudo consultar el estado de la pieza.');
                }
                const j = await r.json();
                if (j.retrying) { setEtapa('compose'); continue; }
                if (j.status === 'failed') throw new Error(j.statusDetail || 'No se pudo generar la pieza. Probá con otra fotografía.');
                if (j.ready) {
                    setEtapa('done');
                    setDoc(j.document);
                    if (j.document?.renderMode === 'plain') {
                        setSustituida(j.statusDetail || 'La composición generada no cumplió el control de calidad.');
                    } else if (j.statusDetail) {
                        // v4.910: la pieza se entrega igual, pero un fondo fuera del
                        // patrón no se presenta como si nada — se dice (directiva del
                        // cliente: nunca mostrar lo no conforme como conforme).
                        setAvisos(a => [...a, j.statusDetail]);
                    }
                    if (Array.isArray(j.copyRepaired)) setAvisos(a => [...a, ...j.copyRepaired]);
                    break;
                }
                setEtapa('compose');
            }
        } catch (e) {
            setFallo(e instanceof Error ? e.message : 'No se pudo generar el aniversario.');
            setEtapa(null);
        } finally { setGenerando(false); }
    }, [club, anios, foto]);

    // ── La vista previa ES el archivo ───────────────────────────────
    useEffect(() => {
        let vivo = true;
        if (!doc || !previewRef.current) return;
        // Mientras se compone se DICE (v4.911): sin esto, una carga lenta se ve
        // como una franja vacía indistinguible de un módulo roto.
        previewRef.current.innerHTML = '<div style="padding:3.5rem 1rem;text-align:center;color:#9ca3af;font-size:0.875rem">Componiendo la pieza…</div>';
        (async () => {
            try {
                const { canvas, warnings, backdropFailed } = await renderAnniversary(doc);
                if (!vivo || !previewRef.current) return;
                canvas.style.width = '100%';
                canvas.style.height = 'auto';
                canvas.style.display = 'block';
                previewRef.current.innerHTML = '';
                previewRef.current.appendChild(canvas);
                canvasRef.current = canvas;
                setDisenoCaido(!!backdropFailed);
                // Deduplicado: un reintento que vuelve a fallar no puede apilar
                // el mismo aviso dos veces.
                if (warnings.length) setAvisos(a => Array.from(new Set([...a, ...warnings])));
            } catch (e) {
                setFallo(e instanceof Error ? e.message : 'No se pudo componer la pieza.');
            }
        })();
        return () => { vivo = false; };
    }, [doc, renderIntento]);

    // Reintenta la CARGA del diseño ya generado — no gasta una generación:
    // la pieza está pagada y en el almacenamiento; lo único que falló fue el
    // viaje de la imagen al navegador (v4.915).
    const reintentarDiseno = useCallback(() => {
        setAvisos(a => a.filter(x => x !== BACKDROP_FAILED_WARNING));
        setDisenoCaido(false);
        setRenderIntento(n => n + 1);
    }, []);

    const descargar = useCallback(async () => {
        if (!canvasRef.current || !doc) return;
        await downloadCanvas(canvasRef.current, safeFileName(doc.clubName, doc.years));
    }, [doc]);

    const cambiarFoto = useCallback(() => {
        setDoc(null); setFoto(null); setAvisos([]); setSustituida(null); setEtapa(null);
        fileRef.current?.click();
    }, []);

    const indice = STAGES.findIndex(s => s.id === etapa);

    // ── Render ──────────────────────────────────────────────────────
    if (disponible === null) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );
    }
    if (!disponible) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center px-6">
                <div className="max-w-md text-center">
                    <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <h1 className="text-xl font-semibold text-gray-800">Aniversarios IA</h1>
                    <p className="text-gray-500 mt-2">{motivo}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-5xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-3xl font-light text-gray-900 flex items-center justify-center gap-3">
                        <Sparkles className="w-7 h-7 text-rotary-blue" /> {titulo}
                    </h1>
                    <p className="text-gray-500 mt-2 max-w-xl mx-auto">
                        Elegí tu club, decinos cuántos años cumple y subí una fotografía. Del diseño nos encargamos nosotros.
                    </p>
                </header>

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* ── El formulario ── */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
                        <div className="relative">
                            <label className="block text-sm font-medium text-gray-800 mb-1">Selecciona tu club</label>
                            <input
                                value={club}
                                onChange={e => { setClub(e.target.value); setAbierto(true); }}
                                onFocus={() => setAbierto(true)}
                                onBlur={() => setTimeout(() => setAbierto(false), 150)}
                                placeholder="Escribí el nombre de tu club…"
                                className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue"
                            />
                            {/* Lista de sugerencias propia, NUNCA un `<datalist>`: sugiere sin
                                restringir y el navegador lo despliega encima del formulario,
                                haciéndolo parecer obligatorio (regla del sitio, v4.656). */}
                            {abierto && opciones.length > 0 && (
                                <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                                    {opciones.map(o => (
                                        <li key={`${o.district}-${o.name}`}>
                                            <button type="button"
                                                onMouseDown={() => { setClub(o.name); setAbierto(false); }}
                                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                                                {o.display}
                                                <span className="text-gray-400 ml-2">Distrito {o.district}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                Si tu club no está en la lista, escribí su nombre igual.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">¿Cuántos años cumple el club?</label>
                            <input
                                type="number" inputMode="numeric" value={anios}
                                min={YEARS_LIMITS.min} max={YEARS_LIMITS.max}
                                onChange={e => setAnios(e.target.value)}
                                placeholder="40"
                                className="w-36 rounded-xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Fotografía del club</label>
                            <div
                                onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
                                onDragLeave={() => setArrastrando(false)}
                                onDrop={e => { e.preventDefault(); setArrastrando(false); tomarArchivo(e.dataTransfer.files?.[0] || null); }}
                                onClick={() => fileRef.current?.click()}
                                className={`rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition
                                    ${arrastrando ? 'border-rotary-blue bg-sky-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}`}
                            >
                                {foto ? (
                                    <img src={foto} alt="Tu fotografía" className="mx-auto max-h-44 rounded-lg" />
                                ) : (
                                    <>
                                        <UploadCloud className="w-7 h-7 mx-auto text-gray-400" />
                                        <p className="text-sm text-gray-600 mt-2">Arrastrá una fotografía o pulsá para elegirla</p>
                                        <p className="text-xs text-gray-400 mt-1">{ACCEPTED_PHOTO_LABEL}</p>
                                    </>
                                )}
                            </div>
                            <input ref={fileRef} type="file" className="hidden"
                                accept={ACCEPTED_PHOTO_TYPES.join(',')}
                                onChange={e => tomarArchivo(e.target.files?.[0] || null)} />
                        </div>

                        {fallo && (
                            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{fallo}</span>
                            </div>
                        )}

                        <button
                            onClick={generar} disabled={generando}
                            className="w-full py-3.5 rounded-xl bg-rotary-blue text-white font-medium hover:bg-rotary-navy disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {generando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                            {generando ? 'Generando…' : '✨ Generar aniversario con IA'}
                        </button>

                        {generando && (
                            <ol className="space-y-1.5 text-sm">
                                {STAGES.map((s, i) => (
                                    <li key={s.id} className={`flex items-center gap-2 ${i <= indice ? 'text-gray-900' : 'text-gray-400'}`}>
                                        <span className="w-5 text-center">{i < indice ? '✓' : s.icon}</span>
                                        {s.label}
                                        {i === indice && <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" />}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>

                    {/* ── El resultado ── */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        {doc ? (
                            <>
                                <div ref={previewRef} className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50" />
                                <p className="text-xs text-gray-400 mt-2 text-center">
                                    Lo que ves es exactamente lo que se descarga.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                                    <button onClick={descargar}
                                        className="py-2.5 rounded-xl bg-rotary-blue text-white text-sm font-medium hover:bg-rotary-navy flex items-center justify-center gap-2">
                                        <Download className="w-4 h-4" /> Descargar PNG
                                    </button>
                                    <button onClick={generar} disabled={generando}
                                        className="py-2.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2">
                                        <RotateCcw className="w-4 h-4" /> Regenerar
                                    </button>
                                    <button onClick={cambiarFoto}
                                        className="py-2.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50 flex items-center justify-center gap-2">
                                        <ImagePlus className="w-4 h-4" /> Cambiar fotografía
                                    </button>
                                </div>

                                {sustituida && (
                                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                        <span>
                                            El diseño generado no pasó el control de calidad ({sustituida}). Para no entregarte una
                                            pieza con la fotografía alterada, se armó con tu foto <strong>intacta</strong> sobre
                                            fondo blanco. Podés pulsar «Regenerar» para intentarlo otra vez.
                                        </span>
                                    </div>
                                )}
                                {disenoCaido && (
                                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                            <span>
                                                El diseño <strong>sí se generó</strong>, pero no se pudo descargar al navegador y la
                                                pieza se compuso con tu fotografía sobre fondo blanco. Reintentá la carga —
                                                no gasta una nueva generación.
                                            </span>
                                        </div>
                                        <button onClick={reintentarDiseno}
                                            className="mt-2 w-full py-2 rounded-lg border border-amber-300 bg-white text-sm font-medium text-amber-900 hover:bg-amber-100 flex items-center justify-center gap-2">
                                            <RotateCcw className="w-4 h-4" /> Reintentar el diseño (gratis)
                                        </button>
                                    </div>
                                )}
                                {avisos.filter(a => a !== BACKDROP_FAILED_WARNING).map((a, i) => (
                                    <p key={i} className="mt-2 text-xs text-gray-500 flex items-start gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />{a}
                                    </p>
                                ))}
                            </>
                        ) : (
                            <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-gray-400 px-6">
                                <Sparkles className="w-10 h-10 mb-3" />
                                <p className="text-sm">Tu pieza va a aparecer acá.</p>
                                <p className="text-xs mt-1">Tarda entre treinta segundos y un minuto y medio.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AniversarioIA;
