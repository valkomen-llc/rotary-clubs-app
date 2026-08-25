// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — el panel
// v4.895.0
//
// Configuración por INSTRUCCIONES. No hay lienzo, no hay capas, no hay
// coordenadas y no hay nada que posicionar: el administrador escribe cómo
// tiene que verse la pieza, sube referencias, prueba y publica.
//
// ── BORRADOR → PROBAR → PUBLICAR ────────────────────────────────────
//
// Guardar NO cambia lo que genera la gente. Es la regla 17 del pedido y la
// pantalla lo dice en todo momento: mientras el borrador difiera de lo
// publicado, la cabecera lo avisa. Sin ese aviso, alguien corrige una
// instrucción, abre el formulario público, no ve ningún cambio y no tiene
// forma de saber por qué.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Sparkles, Save, UploadCloud, Image as ImageIcon, Trash2, Star, FlaskConical,
    History, Rocket, AlertTriangle, CheckCircle2, Info, RotateCcw, Download, X, Loader2,
} from 'lucide-react';
import MediaPicker from '../../components/admin/content-studio/MediaPicker';
import EnginePanel from '../../components/admin/anniversaries/EnginePanel';
import { uploadMediaFiles } from '../../lib/mediaUpload';
import { renderAnniversary, downloadCanvas, safeFileName, type AnniversaryDocument } from '../../lib/anniversaryRender';
import { ACCEPTED_PHOTO_TYPES, ACCEPTED_PHOTO_LABEL, MAX_PHOTO_BYTES, YEARS_LIMITS } from '../../lib/anniversarySpec';

const API = import.meta.env.VITE_API_URL || '/api';
const auth = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

// ─── Formas ────────────────────────────────────────────────────────────

interface Reference { url: string; note: string; primary: boolean }
interface Config {
    name: string; enabled: boolean; format: string; resolution: number;
    scope: { mode: 'all' | 'clubs'; clubIds: string[] };
    references: Reference[];
    masterPrompt: string;
    textZone: 'auto' | 'left' | 'right' | 'bottom';
    promptOptions: { ambient: boolean; useReference: boolean; varyDecor: boolean };
    messageInstruction: string; restrictions: string;
    styleGuard: boolean;
    branding: { clubLogo: boolean; districtLine: boolean; footerImage: string | null; watermark: string | null };
    useFullClubName: boolean;
}
interface Catalog {
    label: string;
    formats: { id: string; label: string; aspect: string; available: boolean }[];
    resolutions: number[];
    brandingFields: { id: string; label: string; help: string }[];
    stages: { id: string; label: string; icon: string }[];
    maxReferences: number;
    defaults?: { masterPrompt?: string; messageInstruction?: string; restrictions?: string };
    masterVariables?: string[];
    footerReserve?: { y: number; h: number };
    engine: { model: string; configured: boolean; envKey: string };
}
interface VersionRow {
    id: string; version: number; label: string | null; fingerprint: string;
    publishedBy: string | null; createdAt: string; summary: string; current: boolean;
}

/**
 * Un fallo se DICE con su causa. 401 se corrige volviendo a entrar, 403
 * pidiéndole el permiso a un administrador y 502 mirando el proveedor: son
 * tres cosas que se arreglan en sitios distintos, y «no se pudo guardar» a
 * secas obliga a diagnosticar a ciegas (regla de `FeeRulesPanel`, v4.859).
 */
const mensajeDeFallo = async (r: Response | null, e?: unknown): Promise<string> => {
    if (!r) return `No hubo respuesta del servidor. ${e instanceof Error ? e.message : ''}`.trim();
    if (r.status === 401) return 'Tu sesión venció. Volvé a entrar; lo que escribiste sigue en la pantalla.';
    if (r.status === 403) return 'Esta configuración es del operador de la plataforma. Pedile el permiso a un administrador.';
    let detalle = '';
    try { detalle = (await r.json())?.error || ''; } catch { /* cuerpo no JSON */ }
    if (r.status === 502) return `El proveedor de IA rechazó la petición. ${detalle}`.trim();
    return detalle || `El servidor respondió ${r.status}.`;
};

// ─── Piezas de la pantalla ─────────────────────────────────────────────

const Card: React.FC<{ title: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }> =
    ({ title, hint, icon, children, action }) => (
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
                <div className="flex items-start gap-3">
                    {icon && <span className="mt-0.5 text-rotary-blue">{icon}</span>}
                    <div>
                        <h2 className="font-semibold text-gray-900">{title}</h2>
                        {hint && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}
                    </div>
                </div>
                {action}
            </header>
            <div className="p-5">{children}</div>
        </section>
    );

const Aviso: React.FC<{ tone: 'error' | 'warn' | 'ok' | 'info'; children: React.ReactNode }> = ({ tone, children }) => {
    const piel = {
        error: 'bg-red-50 border-red-200 text-red-800',
        warn: 'bg-amber-50 border-amber-200 text-amber-900',
        ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        info: 'bg-sky-50 border-sky-200 text-sky-900',
    }[tone];
    const Icono = { error: AlertTriangle, warn: AlertTriangle, ok: CheckCircle2, info: Info }[tone];
    return (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${piel}`}>
            <Icono className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">{children}</div>
        </div>
    );
};

const Instruccion: React.FC<{
    label: string; help: string; value: string; rows?: number;
    onChange: (v: string) => void; placeholder?: string; max: number;
}> = ({ label, help, value, rows = 5, onChange, placeholder, max }) => (
    <div>
        <label className="block text-sm font-medium text-gray-800">{label}</label>
        <p className="text-xs text-gray-500 mt-0.5 mb-2">{help}</p>
        <textarea
            value={value} rows={rows} placeholder={placeholder} maxLength={max}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rotary-blue/30 focus:border-rotary-blue"
        />
        <div className="mt-1 text-right text-xs text-gray-400">{value.length} / {max}</div>
    </div>
);

// ════════════════════════════════════════════════════════════════════

const AnniversaryStudio: React.FC = () => {
    // ⚠️ TODOS los hooks arriba, antes de cualquier `return`. React identifica
    // cada hook por su ORDEN de llamada: un hook debajo de un return temprano
    // no se ejecuta en el primer render y sí en el segundo, y el árbol entero
    // se cae dejando la pantalla EN BLANCO (`npm run check:hooks`, v4.689).
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [config, setConfig] = useState<Config | null>(null);
    const [dirty, setDirty] = useState(false);
    const [publishedAt, setPublishedAt] = useState<string | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    // La foto del borrador tal como quedó GUARDADO en el servidor (v4.904).
    // Los avisos, el «dirty» y la validación los calcula el servidor sobre lo
    // guardado: mientras lo que se ve difiera de eso, esos veredictos hablan
    // de OTRA configuración. Se reportó con captura: una referencia recién
    // agregada a la vista, el aviso «No hay ninguna referencia visual» debajo
    // y la franja verde «lo que ves es lo que genera el público» — tres
    // afirmaciones que no podían ser ciertas a la vez.
    const [savedJson, setSavedJson] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [publicando, setPublicando] = useState(false);
    const [fallo, setFallo] = useState<string | null>(null);
    const [nota, setNota] = useState<string | null>(null);
    const [versions, setVersions] = useState<VersionRow[]>([]);

    // Selector de la Biblioteca. UNO solo por pantalla, con `pickerTarget`
    // diciendo a dónde va lo elegido: uno por casilla los deja separarse.
    type PickerTarget = 'reference' | 'footerImage' | 'watermark';
    const [pickerTarget, setPickerTarget] = useState<PickerTarget>('reference');
    // `libraryOpen` es DISTINTO de `pickerTarget`: el destino dice a dónde va
    // lo elegido y este booleano dice si el diálogo está abierto. Con un solo
    // estado, pulsar «Subir» abría también la Biblioteca.
    const [libraryOpen, setLibraryOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [subiendo, setSubiendo] = useState(false);

    // Panel de pruebas
    const [testClub, setTestClub] = useState('');
    const [testYears, setTestYears] = useState('40');
    const [testPhoto, setTestPhoto] = useState<string | null>(null);
    const [clubOptions, setClubOptions] = useState<{ name: string; display: string; district: string }[]>([]);
    const [stage, setStage] = useState<string | null>(null);
    const [probando, setProbando] = useState(false);
    const [testError, setTestError] = useState<string | null>(null);
    const [testDoc, setTestDoc] = useState<AnniversaryDocument | null>(null);
    const [testInfo, setTestInfo] = useState<{ statusDetail: string | null; validation: any; copyWarnings: string[]; copyRepaired: string[]; request: any } | null>(null);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [renderWarnings, setRenderWarnings] = useState<string[]>([]);

    // ── Carga inicial ───────────────────────────────────────────────
    const cargar = useCallback(async () => {
        setCargando(true); setFallo(null);
        let r: Response | null = null;
        try {
            const [rc, rg, rv] = await Promise.all([
                fetch(`${API}/anniversaries/catalog`, { headers: auth() }),
                fetch(`${API}/anniversaries/config`, { headers: auth() }),
                fetch(`${API}/anniversaries/versions`, { headers: auth() }),
            ]);
            r = rc.ok ? rg : rc;
            if (!rc.ok || !rg.ok) throw new Error(await mensajeDeFallo(r));
            const cat = await rc.json();
            const cfg = await rg.json();
            setCatalog(cat);
            setConfig(cfg.config);
            setSavedJson(JSON.stringify(cfg.config));
            setDirty(!!cfg.dirty);
            setPublishedAt(cfg.publishedAt || null);
            setErrors(cfg.errors || []);
            setWarnings(cfg.warnings || []);
            if (rv.ok) setVersions((await rv.json()).versions || []);
        } catch (e) {
            setFallo(await mensajeDeFallo(r, e));
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    // ── Guardar ─────────────────────────────────────────────────────
    //
    // `persistir` es EL único camino que escribe el borrador, y lo comparten
    // Guardar, Publicar y Probar (v4.904). Publicar y Probar actúan sobre el
    // borrador GUARDADO en el servidor: sin este paso, publicaban o probaban
    // una configuración distinta de la que está a la vista — y lo hacían en
    // silencio, que es como una referencia recién agregada se quedaba fuera
    // de lo publicado sin que nada avisara.
    const persistir = useCallback(async (): Promise<{ ok: boolean; errors: string[] }> => {
        if (!config) return { ok: false, errors: [] };
        let r: Response | null = null;
        try {
            r = await fetch(`${API}/anniversaries/config`, {
                method: 'PUT', headers: auth(), body: JSON.stringify({ config }),
            });
            if (!r.ok) throw new Error(await mensajeDeFallo(r));
            const j = await r.json();
            setConfig(j.config);
            setSavedJson(JSON.stringify(j.config));
            setDirty(!!j.dirty);
            setErrors(j.errors || []); setWarnings(j.warnings || []);
            return { ok: true, errors: j.errors || [] };
        } catch (e) {
            setFallo(await mensajeDeFallo(r, e));
            return { ok: false, errors: [] };
        }
    }, [config]);

    const guardar = useCallback(async () => {
        setGuardando(true); setFallo(null); setNota(null);
        const res = await persistir();
        if (res.ok) setNota('Borrador guardado. Todavía no cambia lo que genera la gente: para eso hay que publicar.');
        setGuardando(false);
    }, [persistir]);

    // ¿Lo que se ve difiere de lo GUARDADO? Se compara contra la foto que
    // devolvió el servidor — no se reimplementa el criterio: cualquier edición
    // local cambia el JSON y con eso alcanza para saber que los veredictos de
    // abajo hablan de otra configuración.
    const sinGuardar = config !== null && savedJson !== null && JSON.stringify(config) !== savedJson;

    const publicar = useCallback(async () => {
        setPublicando(true); setFallo(null); setNota(null);
        let r: Response | null = null;
        try {
            // Publicar publica LO QUE SE VE: si hay cambios sin guardar, el
            // borrador se guarda primero (y se revalida). Publicar el borrador
            // viejo del servidor sería publicar otra cosa que la pantalla.
            if (sinGuardar) {
                const res = await persistir();
                if (!res.ok) throw new Error('No se pudo guardar el borrador, así que no se publicó nada.');
                if (res.errors.length) { throw new Error('La configuración todavía no se puede publicar.'); }
            }
            r = await fetch(`${API}/anniversaries/publish`, { method: 'POST', headers: auth(), body: '{}' });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                if (r.status === 422 && Array.isArray(j.errors)) { setErrors(j.errors); throw new Error('La configuración todavía no se puede publicar.'); }
                throw new Error(await mensajeDeFallo(r));
            }
            const j = await r.json();
            setDirty(false); setPublishedAt(j.publishedAt || new Date().toISOString());
            setNota(j.reused
                ? `Publicado. No cambió nada de lo que se imprime, así que sigue vigente la versión ${j.version.version}.`
                : `Publicado como versión ${j.version.version}. Desde ahora el formulario público genera con estas instrucciones.`);
            const rv = await fetch(`${API}/anniversaries/versions`, { headers: auth() });
            if (rv.ok) setVersions((await rv.json()).versions || []);
        } catch (e) {
            setFallo(await mensajeDeFallo(r, e));
        } finally { setPublicando(false); }
    }, [sinGuardar, persistir]);

    const despublicar = useCallback(async () => {
        if (!window.confirm('El formulario público va a dejar de generar aniversarios hasta que vuelvas a publicar. ¿Seguimos?')) return;
        let r: Response | null = null;
        try {
            r = await fetch(`${API}/anniversaries/unpublish`, { method: 'POST', headers: auth(), body: '{}' });
            if (!r.ok) throw new Error(await mensajeDeFallo(r));
            setPublishedAt(null); setDirty(true);
            setNota('Retirado. Las instrucciones y las versiones se conservan.');
        } catch (e) { setFallo(await mensajeDeFallo(r, e)); }
    }, []);

    const restaurar = useCallback(async (id: string, numero: number) => {
        if (!window.confirm(`Se va a traer la versión ${numero} al borrador. No se publica: vas a poder mirarla y probarla antes. ¿Seguimos?`)) return;
        let r: Response | null = null;
        try {
            r = await fetch(`${API}/anniversaries/versions/${id}/restore`, { method: 'POST', headers: auth(), body: '{}' });
            if (!r.ok) throw new Error(await mensajeDeFallo(r));
            const j = await r.json();
            setConfig(j.config); setSavedJson(JSON.stringify(j.config)); setDirty(true);
            setNota(`Versión ${j.restoredFrom} traída al borrador. Probala y publicá cuando quieras.`);
        } catch (e) { setFallo(await mensajeDeFallo(r, e)); }
    }, []);

    // ── Referencias e imágenes de branding ──────────────────────────
    const aplicarImagen = useCallback((url: string) => {
        setConfig(c => {
            if (!c) return c;
            if (pickerTarget === 'footerImage') return { ...c, branding: { ...c.branding, footerImage: url } };
            if (pickerTarget === 'watermark') return { ...c, branding: { ...c.branding, watermark: url } };
            if (c.references.length >= (catalog?.maxReferences ?? 6)) return c;
            const refs = [...c.references, { url, note: '', primary: c.references.length === 0 }];
            return { ...c, references: refs };
        });
    }, [pickerTarget, catalog]);

    const subirArchivo = useCallback(async (files: FileList | null) => {
        if (!files?.length) return;
        setSubiendo(true); setFallo(null);
        try {
            const r = await uploadMediaFiles(Array.from(files));
            for (const m of r.uploaded) aplicarImagen(m.url);
            if (r.failed.length) setFallo(`No se pudieron subir: ${r.failed.map(f => `${f.name} (${f.reason})`).join(', ')}`);
        } catch (e) {
            setFallo(e instanceof Error ? e.message : 'No se pudo subir la imagen.');
        } finally {
            setSubiendo(false);
            // Se limpia el input o volver a elegir EL MISMO archivo no dispara
            // `change` —el valor no cambió— y el botón parece roto justo cuando
            // alguien reintenta tras un fallo.
            if (fileRef.current) fileRef.current.value = '';
        }
    }, [aplicarImagen]);

    // ── El panel de pruebas ─────────────────────────────────────────
    //
    // Corre la MISMA cadena que el formulario público, contra el BORRADOR.
    const buscarClubes = useCallback(async (q: string) => {
        try {
            const r = await fetch(`${API}/anniversaries/clubs?q=${encodeURIComponent(q)}`, { headers: auth() });
            if (r.ok) setClubOptions((await r.json()).clubs || []);
        } catch { /* el buscador es una comodidad: si falla se escribe a mano */ }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => { buscarClubes(testClub); }, 250);
        return () => clearTimeout(t);
    }, [testClub, buscarClubes]);

    const leerFoto = useCallback((file: File | null) => {
        setTestError(null);
        if (!file) return;
        if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) { setTestError(`La fotografía tiene que ser ${ACCEPTED_PHOTO_LABEL}.`); return; }
        if (file.size > MAX_PHOTO_BYTES) { setTestError('La fotografía pesa demasiado. Probá con una de menos de 18 MB.'); return; }
        const fr = new FileReader();
        fr.onload = () => setTestPhoto(String(fr.result || ''));
        fr.onerror = () => setTestError('No se pudo leer el archivo.');
        fr.readAsDataURL(file);
    }, []);

    const probar = useCallback(async () => {
        if (!testPhoto) { setTestError('Subí una fotografía para la prueba.'); return; }
        setProbando(true); setTestError(null); setTestDoc(null); setTestInfo(null); setRenderWarnings([]);
        let r: Response | null = null;
        try {
            // La prueba corre contra el borrador GUARDADO: si hay cambios sin
            // guardar, se guardan primero — probar el borrador viejo probaría
            // otra configuración que la que está a la vista (v4.904).
            if (sinGuardar) {
                const res = await persistir();
                if (!res.ok) throw new Error('No se pudo guardar el borrador, así que la prueba habría corrido con la configuración anterior.');
            }
            setStage('prepare');
            r = await fetch(`${API}/anniversaries/test/photo`, {
                method: 'POST', headers: auth(),
                body: JSON.stringify({ clubName: testClub, years: Number(testYears), photo: testPhoto }),
            });
            if (!r.ok) throw new Error(await mensajeDeFallo(r));
            const { pieceId } = await r.json();

            setStage('compose');
            r = await fetch(`${API}/anniversaries/test/compose`, { method: 'POST', headers: auth(), body: JSON.stringify({ pieceId }) });
            if (!r.ok) throw new Error(await mensajeDeFallo(r));

            // Sondeo con tope. Sin él, una tarea que nunca termina deja la
            // pantalla girando para siempre y quien la abrió no sabe si esperar.
            const limite = Date.now() + 180_000;
            for (;;) {
                await new Promise(res => setTimeout(res, 3000));
                if (Date.now() > limite) throw new Error('La generación tardó más de lo esperado. Probá de nuevo.');
                r = await fetch(`${API}/anniversaries/test/piece/${pieceId}`, { headers: auth() });
                if (!r.ok) throw new Error(await mensajeDeFallo(r));
                const j = await r.json();
                if (j.retrying) { setStage('compose'); continue; }
                if (j.status === 'failed') throw new Error(j.statusDetail || 'La generación falló.');
                if (j.ready) {
                    setStage('done');
                    setTestDoc(j.document);
                    setTestInfo({ statusDetail: j.statusDetail, validation: j.validation, copyWarnings: j.copyWarnings || [], copyRepaired: j.copyRepaired || [], request: j.request || null });
                    break;
                }
                setStage('compose');
            }
        } catch (e) {
            setTestError(e instanceof Error ? e.message : 'No se pudo generar la prueba.');
            setStage(null);
        } finally { setProbando(false); }
    }, [testClub, testYears, testPhoto, sinGuardar, persistir]);

    // ── La vista previa ES el archivo ───────────────────────────────
    //
    // Se compone el canvas y se MONTA ese mismo canvas. Descargar exporta el
    // que está a la vista: no hay dos sistemas de composición.
    useEffect(() => {
        let vivo = true;
        if (!testDoc || !previewRef.current) return;
        // Mientras se compone se DICE (v4.911): sin esto, una carga lenta se ve
        // como una franja vacía indistinguible de un módulo roto.
        previewRef.current.innerHTML = '<div style="padding:3.5rem 1rem;text-align:center;color:#9ca3af;font-size:0.875rem">Componiendo la pieza…</div>';
        (async () => {
            try {
                const { canvas, warnings: w } = await renderAnniversary(testDoc);
                if (!vivo || !previewRef.current) return;
                canvas.style.width = '100%';
                canvas.style.height = 'auto';
                canvas.style.display = 'block';
                previewRef.current.innerHTML = '';
                previewRef.current.appendChild(canvas);
                canvasRef.current = canvas;
                setRenderWarnings(w);
            } catch (e) {
                setTestError(e instanceof Error ? e.message : 'No se pudo componer la vista previa.');
            }
        })();
        return () => { vivo = false; };
    }, [testDoc]);

    const descargar = useCallback(async () => {
        if (!canvasRef.current || !testDoc) return;
        await downloadCanvas(canvasRef.current, safeFileName(testDoc.clubName, testDoc.years));
    }, [testDoc]);

    const etapaActual = useMemo(
        () => (catalog?.stages || []).findIndex(s => s.id === stage),
        [catalog, stage]
    );

    // ── Render ──────────────────────────────────────────────────────
    if (cargando) {
        return (
            <div className="p-8 flex items-center gap-3 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" /> Cargando Aniversarios IA…
            </div>
        );
    }
    if (!config || !catalog) {
        return (
            <div className="p-8 max-w-2xl">
                <Aviso tone="error">{fallo || 'No se pudo abrir el módulo.'}</Aviso>
                <button onClick={cargar} className="mt-4 px-4 py-2 rounded-lg bg-rotary-blue text-white text-sm">Reintentar</button>
            </div>
        );
    }

    const set = <K extends keyof Config>(k: K, v: Config[K]) => setConfig(c => (c ? { ...c, [k]: v } : c));

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Cabecera */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-rotary-blue" /> Aniversarios IA
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                        Configurás con instrucciones en lenguaje natural cómo tiene que verse la pieza. Quien la necesita
                        elige su club, dice cuántos años cumple, sube una foto y pulsa un botón. No hay nada que diseñar.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={guardar} disabled={guardando}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                    >
                        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar borrador
                    </button>
                    <button
                        onClick={publicar} disabled={publicando || (!sinGuardar && errors.length > 0)}
                        title={!sinGuardar && errors.length ? 'Hay algo que corregir antes de publicar' : undefined}
                        className="px-4 py-2 rounded-lg bg-rotary-blue text-white text-sm font-medium hover:bg-rotary-navy disabled:opacity-50 flex items-center gap-2"
                    >
                        {publicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Publicar
                    </button>
                </div>
            </div>

            {/* Estado */}
            <div className="space-y-2">
                {fallo && <Aviso tone="error">{fallo}</Aviso>}
                {nota && <Aviso tone="ok">{nota}</Aviso>}
                {!catalog.engine.configured && (
                    <Aviso tone="error">
                        Falta la credencial del generador de imágenes (<code>{catalog.engine.envKey}</code>). Sin ella este
                        módulo no puede componer ninguna pieza, ni siquiera en el panel de pruebas.
                    </Aviso>
                )}
                {/* Con cambios sin guardar, los veredictos del servidor hablan
                    de OTRA configuración: se dice eso y se callan las franjas
                    que ya no son ciertas (v4.904). Hasta entonces la pantalla
                    mostraba a la vez una referencia recién agregada, el aviso
                    «no hay ninguna referencia» y la franja verde «lo que ves
                    es lo que genera el público» — tres cosas incompatibles. */}
                {sinGuardar ? (
                    <Aviso tone="warn">
                        Tenés cambios sin guardar. Se aplican al pulsar <strong>«Guardar borrador»</strong> — y
                        «Probar» y «Publicar» los guardan solos antes de actuar, así que ninguno trabaja con la
                        versión vieja. Los avisos se recalculan al guardar.
                    </Aviso>
                ) : publishedAt ? (
                    dirty
                        ? <Aviso tone="warn">
                            El borrador tiene cambios sin publicar. <strong>El formulario público sigue generando con lo
                            publicado.</strong> Probá acá abajo y, cuando te convenza, pulsá «Publicar».
                        </Aviso>
                        : <Aviso tone="ok">Lo que ves es exactamente lo que está generando el formulario público.</Aviso>
                ) : (
                    <Aviso tone="info">Todavía no se publicó nada, así que el formulario público no genera aniversarios. Podés probar acá abajo cuantas veces quieras.</Aviso>
                )}
                {!sinGuardar && errors.map((e, i) => <Aviso key={`e${i}`} tone="error">{e}</Aviso>)}
                {!sinGuardar && warnings.map((w, i) => <Aviso key={`w${i}`} tone="warn">{w}</Aviso>)}
            </div>

            {/* 1 — General */}
            <Card title="Configuración general" icon={<Info className="w-5 h-5" />}
                hint="El nombre es interno; lo demás decide qué se entrega y dónde está disponible.">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-1">Nombre interno</label>
                        <input value={config.name} onChange={e => set('name', e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-1">Formato de salida</label>
                        <select value={config.format} onChange={e => set('format', e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                            {catalog.formats.map(f => (
                                <option key={f.id} value={f.id} disabled={!f.available}>
                                    {f.label} ({f.aspect}){f.available ? '' : ' — Próximamente'}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-800 mb-1">Resolución de descarga</label>
                        <select value={config.resolution} onChange={e => set('resolution', Number(e.target.value))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                            {catalog.resolutions.map(r => <option key={r} value={r}>{r} px</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-6 pt-6">
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={config.enabled} onChange={e => set('enabled', e.target.checked)} />
                            Activo
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={config.useFullClubName}
                                onChange={e => set('useFullClubName', e.target.checked)} />
                            Escribir «Club Rotario …»
                        </label>
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-800 mb-1">Dónde está habilitado</label>
                        <select value={config.scope.mode}
                            onChange={e => set('scope', { mode: e.target.value as 'all' | 'clubs', clubIds: [] })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                            <option value="all">En todos los sitios de la plataforma</option>
                            <option value="clubs">Sólo en los sitios que enumere abajo</option>
                        </select>
                        {config.scope.mode === 'clubs' && (
                            <>
                                <input
                                    value={config.scope.clubIds.join(', ')}
                                    placeholder="Identificadores de sitio separados por coma"
                                    onChange={e => set('scope', {
                                        mode: 'clubs',
                                        clubIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                                    })}
                                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    El alcance lo comprueba el servidor mirando el dominio desde el que se pide, no la pantalla.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </Card>

            {/* 2 — Referencias */}
            <Card title="Identidad visual de Aniversarios" icon={<ImageIcon className="w-5 h-5" />}
                hint="El patrón visual obligatorio de todas las piezas. La referencia marcada como principal (ANNIVERSARY_STYLE_REFERENCE) viaja al modelo como guía de fondo, textura, paleta y decoración.">
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-600 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 mb-4">
                    <span><strong className="text-gray-800">Referencia de estilo:</strong>{' '}
                        {config.references.some(r => r.primary) ? 'activa' : 'sin cargar'}</span>
                    <span><strong className="text-gray-800">Fondo:</strong> blanco institucional</span>
                    <span><strong className="text-gray-800">Paleta:</strong> blanco + dorado + azul</span>
                    <span><strong className="text-gray-800">Fondos oscuros:</strong>{' '}
                        {config.styleGuard ? 'bloqueados (se regenera una vez)' : 'permitidos'}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                    {config.references.map((ref, i) => (
                        <div key={ref.url + i} className={`relative w-36 rounded-lg overflow-hidden border-2 ${ref.primary ? 'border-rotary-blue' : 'border-gray-200'}`}>
                            <img src={ref.url} alt="Referencia" className="w-36 h-36 object-cover bg-gray-50" />
                            <div className="absolute top-1 right-1 flex gap-1">
                                <button
                                    title={ref.primary ? 'Es la referencia principal' : 'Marcar como principal'}
                                    onClick={() => set('references', config.references.map((r, j) => ({ ...r, primary: j === i })))}
                                    className={`p-1 rounded ${ref.primary ? 'bg-rotary-blue text-white' : 'bg-white/90 text-gray-600'}`}
                                >
                                    <Star className="w-3.5 h-3.5" />
                                </button>
                                <button title="Quitar" onClick={() => set('references', config.references.filter((_, j) => j !== i))}
                                    className="p-1 rounded bg-white/90 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                            {ref.primary && <span className="absolute bottom-0 inset-x-0 bg-rotary-blue text-white text-[10px] text-center py-0.5">Principal</span>}
                        </div>
                    ))}
                    {config.references.length < catalog.maxReferences && (
                        <div className="w-36 h-36 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 text-xs text-gray-500">
                            {/* LAS DOS VÍAS, SIEMPRE (regla del sitio, v4.700): subir un archivo
                                nuevo o elegir uno que ya está en la Biblioteca. Con una sola,
                                reutilizar una referencia obliga a salir del módulo. */}
                            <button onClick={() => { setPickerTarget('reference'); fileRef.current?.click(); }}
                                disabled={subiendo}
                                className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center gap-1">
                                <UploadCloud className="w-3.5 h-3.5" /> Subir
                            </button>
                            <button onClick={() => { setPickerTarget('reference'); setLibraryOpen(true); }}
                                className="px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50">Biblioteca</button>
                        </div>
                    )}
                </div>
                <p className="text-xs text-gray-500 mt-3">
                    Las referencias son dirección creativa, no una plantilla: la IA no las copia, se inspira en su paleta,
                    su decoración y su aire. Máximo {catalog.maxReferences}. La ideal es una plantilla VACÍA —fondo y
                    decoración, sin fotografía de personas ni textos—: una pieza terminada invita al modelo a copiarla.
                </p>
                <label className="flex items-start gap-2 mt-3 text-sm text-gray-700">
                    <input type="checkbox" checked={config.styleGuard !== false}
                        onChange={e => set('styleGuard', e.target.checked)} className="mt-0.5" />
                    <span>
                        <strong>Patrón visual obligatorio.</strong> Si la pieza sale con fondo café, oscuro o negro, se
                        regenera UNA vez con la instrucción reforzada; si insiste, se entrega con su aviso — nunca se
                        descarta en silencio. Gasta una generación extra sólo cuando el modelo rompe el patrón.
                    </span>
                </label>
            </Card>

            {/* 3 — La instrucción base (v4.907: el flujo simple) */}
            <Card title="Prompt base" icon={<Sparkles className="w-5 h-5" />}
                hint="La instrucción que viaja al modelo TAL CUAL, con las variables sustituidas — junto con la fotografía del club (primera imagen, la base) y la referencia de estilo (segunda imagen, el ejemplo). Nada más se agrega."
                action={
                    <button
                        onClick={() => {
                            const predeterminado = catalog.defaults?.masterPrompt || '';
                            if (!predeterminado) return;
                            if (!window.confirm('Se reemplaza el Prompt base del borrador por el predeterminado del sistema. No se publica nada hasta que pulses «Publicar». ¿Seguimos?')) return;
                            set('masterPrompt', predeterminado);
                        }}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> Restaurar el predeterminado
                    </button>
                }>
                <div className="space-y-6">
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-600 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
                        <span><strong className="text-gray-800">Prompt base:</strong>{' '}
                            {publishedAt ? (dirty ? 'ACTIVO — con cambios sin publicar' : 'ACTIVO en producción') : 'Borrador (sin publicar)'}</span>
                        <span><strong className="text-gray-800">Versión:</strong>{' '}
                            {versions.find(v => v.current) ? `v${versions.find(v => v.current)!.version} · ${versions.find(v => v.current)!.fingerprint}` : '—'}</span>
                        <span><strong className="text-gray-800">Variables:</strong>{' '}
                            {/* Los marcadores son DATOS, no lenguaje (v4.662). */}
                            <span data-no-translate>{(catalog.masterVariables || []).join('  ')}</span></span>
                        <span><strong className="text-gray-800">Referencia visual:</strong>{' '}
                            {config.references.length ? 'viaja como SEGUNDA imagen — el ejemplo de estilo' : 'sin imagen cargada'}</span>
                        <span><strong className="text-gray-800">Pie institucional:</strong>{' '}
                            lo imprime la plataforma en el {Math.round((catalog.footerReserve?.h ?? 0.16) * 100)} % inferior</span>
                        <span><strong className="text-gray-800">Formato:</strong> {config.format === 'square' ? '1:1' : config.format}</span>
                        <button
                            onClick={() => document.getElementById('panel-probar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            className="ml-auto px-2.5 py-1 rounded border border-rotary-blue/40 text-rotary-blue font-medium hover:bg-sky-50 flex items-center gap-1"
                        >
                            <FlaskConical className="w-3.5 h-3.5" /> Probar generación
                        </button>
                    </div>
                    <Instruccion
                        label="Prompt base" max={4000} rows={12}
                        help="Se envía VERBATIM: lo que escribas acá es exactamente lo que recibe el modelo, con {NOMBRE_CLUB}, {ANOS_CLUB}, {FOTO_CLUB}, {VARIACION} y {FRASE} sustituidos — {VARIACION} lo llena la plataforma con un motivo decorativo distinto por pieza, y {FRASE} con una frase conmemorativa bien escrita de su catálogo, que el modelo copia letra por letra. El modelo dibuja también los textos de la pieza — si un nombre sale mal escrito, se regenera."
                        value={config.masterPrompt} onChange={v => set('masterPrompt', v)}
                    />
                    <Instruccion
                        label="Restricciones (opcional)" max={1200} rows={3}
                        help="Lo que no querés ver. Es lo ÚNICO extra que viaja, y va en el campo de negativos del modelo (los modelos que no lo declaran no lo reciben)."
                        value={config.restrictions} onChange={v => set('restrictions', v)}
                    />
                    <Aviso tone="info">
                        El flujo es el de una conversación simple: la <strong>referencia visual</strong> define el estilo, la{' '}
                        <strong>fotografía del club</strong> define el contenido humano y el <strong>Prompt base</strong> dice qué
                        cambia. El resultado del modelo se entrega TAL CUAL —sin puertas automáticas que lo descarten— y lo único
                        que la plataforma añade encima es el pie institucional, desde archivos reales.
                    </Aviso>
                </div>
            </Card>

            {/* 4 — Branding */}
            <Card title="Branding institucional" icon={<CheckCircle2 className="w-5 h-5" />}
                hint="La marca no la genera la IA: se imprime encima, desde archivos reales.">
                <div className="space-y-4">
                    {catalog.brandingFields.filter(f => f.id === 'clubLogo' || f.id === 'districtLine').map(f => (
                        <label key={f.id} className="flex items-start gap-3 text-sm">
                            <input type="checkbox" className="mt-1"
                                checked={(config.branding as any)[f.id]}
                                onChange={e => set('branding', { ...config.branding, [f.id]: e.target.checked })} />
                            <span><strong>{f.label}</strong><br /><span className="text-gray-500 text-xs">{f.help}</span></span>
                        </label>
                    ))}
                    {(['footerImage', 'watermark'] as const).map(k => {
                        const meta = catalog.brandingFields.find(f => f.id === k);
                        const url = config.branding[k];
                        return (
                            <div key={k} className="flex items-start gap-3">
                                <div className="w-24 h-16 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                                    {url ? <img src={url} alt={meta?.label} className="max-w-full max-h-full object-contain" />
                                        : <ImageIcon className="w-5 h-5 text-gray-300" />}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-800">{meta?.label}</p>
                                    <p className="text-xs text-gray-500 mb-2">{meta?.help}</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setPickerTarget(k); fileRef.current?.click(); }} disabled={subiendo}
                                            className="px-2 py-1 rounded border border-gray-300 text-xs hover:bg-gray-50 flex items-center gap-1">
                                            <UploadCloud className="w-3 h-3" /> Subir
                                        </button>
                                        <button onClick={() => { setPickerTarget(k); setLibraryOpen(true); }}
                                            className="px-2 py-1 rounded border border-gray-300 text-xs hover:bg-gray-50">Biblioteca</button>
                                        {url && <button onClick={() => set('branding', { ...config.branding, [k]: null })}
                                            className="px-2 py-1 rounded border border-red-200 text-xs text-red-600 hover:bg-red-50">Quitar</button>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* 4b — Motor de imagen y benchmark (v4.897). Vive en su propio
                componente para que esta pantalla no crezca sin freno; es la
                capa técnica que decide QUÉ modelo genera, con evidencia. */}
            <EnginePanel />

            {/* 5 — Probar */}
            <div id="panel-probar" />
            <Card title="Probar configuración" icon={<FlaskConical className="w-5 h-5" />}
                hint="Corre exactamente la misma cadena que el formulario público, pero con el BORRADOR. Editá una instrucción y volvé a probar.">
                <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Club</label>
                            {/* Sin `list=`: no hay ningún `<datalist>` detrás, y un
                                atributo colgante promete un desplegable que no existe.
                                Las sugerencias van abajo, como botones. */}
                            <input value={testClub} onChange={e => setTestClub(e.target.value)}
                                placeholder="Escribí para buscar…"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                            {/* Una lista de sugerencias, no un catálogo cerrado: el valor
                                sigue siendo libre. Se ofrece como botones y no como
                                `<datalist>` — la regla de v4.656. */}
                            <div className="flex flex-wrap gap-1 mt-2">
                                {clubOptions.slice(0, 8).map(c => (
                                    <button key={c.name} onClick={() => setTestClub(c.name)}
                                        className="px-2 py-0.5 rounded-full border border-gray-200 text-xs hover:bg-gray-50">
                                        {c.name} <span className="text-gray-400">· {c.district}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Años</label>
                            <input type="number" min={YEARS_LIMITS.min} max={YEARS_LIMITS.max} value={testYears}
                                onChange={e => setTestYears(e.target.value)}
                                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-800 mb-1">Fotografía</label>
                            <input type="file" accept={ACCEPTED_PHOTO_TYPES.join(',')}
                                onChange={e => leerFoto(e.target.files?.[0] || null)}
                                className="block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-sm" />
                            {testPhoto && <img src={testPhoto} alt="Prueba" className="mt-2 w-40 rounded-lg border border-gray-200" />}
                        </div>
                        <button onClick={probar} disabled={probando || !catalog.engine.configured}
                            className="px-4 py-2 rounded-lg bg-rotary-blue text-white text-sm font-medium hover:bg-rotary-navy disabled:opacity-50 flex items-center gap-2">
                            {probando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                            Generar prueba
                        </button>
                        {testError && <Aviso tone="error">{testError}</Aviso>}
                        {probando && (
                            <ol className="space-y-1 text-sm">
                                {catalog.stages.map((s, i) => (
                                    <li key={s.id} className={i <= etapaActual ? 'text-gray-900' : 'text-gray-400'}>
                                        <span className="mr-2">{s.icon}</span>{s.label}
                                        {i === etapaActual && <Loader2 className="inline w-3 h-3 ml-2 animate-spin" />}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>

                    <div>
                        {testDoc ? (
                            <>
                                <div ref={previewRef} className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50" />
                                <p className="text-xs text-gray-500 mt-2">
                                    Esto no es una aproximación: <strong>es el archivo</strong>. Al descargar se exporta este mismo lienzo.
                                </p>
                                <div className="flex gap-2 mt-3">
                                    <button onClick={descargar}
                                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 flex items-center gap-2">
                                        <Download className="w-4 h-4" /> Descargar PNG
                                    </button>
                                    <button onClick={probar} disabled={probando}
                                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
                                        <RotateCcw className="w-4 h-4" /> Volver a probar
                                    </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                    {testDoc.renderMode === 'plain' && (
                                        <Aviso tone="warn">
                                            La composición generada no se pudo usar{testInfo?.statusDetail ? `: ${testInfo.statusDetail}` : '.'} La
                                            pieza se armó con la fotografía intacta sobre fondo blanco. La imagen del modelo <strong>no se
                                            retocó</strong>: se descartó.
                                        </Aviso>
                                    )}
                                    {testDoc.renderMode === 'ai' && testInfo?.statusDetail && (
                                        <Aviso tone="warn">{testInfo.statusDetail}</Aviso>
                                    )}
                                    {(testInfo?.validation?.notes || []).map((n: string, i: number) => <Aviso key={i} tone="info">{n}</Aviso>)}
                                    {(testInfo?.copyRepaired || []).map((n, i) => <Aviso key={`r${i}`} tone="warn">{n}</Aviso>)}
                                    {(testInfo?.copyWarnings || []).map((n, i) => <Aviso key={`c${i}`} tone="warn">{n}</Aviso>)}
                                    {renderWarnings.map((n, i) => <Aviso key={`v${i}`} tone="warn">{n}</Aviso>)}
                                    {(testDoc.branding?.missing || []).map((n, i) => <Aviso key={`b${i}`} tone="info">{n}</Aviso>)}
                                    {/* «Ver solicitud enviada al modelo» (v4.907): EXACTAMENTE lo
                                        que viajó — es lo que permite comprobar que le mandamos al
                                        modelo lo que creemos que le mandamos. */}
                                    {testInfo?.request && (
                                        <details className="rounded-lg border border-gray-200 bg-gray-50">
                                            <summary className="px-3 py-2 text-xs font-medium text-gray-700 cursor-pointer select-none">
                                                Ver solicitud enviada al modelo
                                            </summary>
                                            <div className="px-3 pb-3 space-y-2 text-xs text-gray-600">
                                                <p><strong>Modelo:</strong> <span data-no-translate>{testInfo.request.model}</span>
                                                    {' '}· <strong>Proveedor:</strong> <span data-no-translate>{testInfo.request.provider}</span>
                                                    {' '}· <strong>Endpoint:</strong> <span data-no-translate>{testInfo.request.endpoint}</span>
                                                    {' '}· <strong>Tamaño:</strong> <span data-no-translate>{testInfo.request.size}</span></p>
                                                <div className="flex gap-3">
                                                    <div>
                                                        <p className="font-medium text-gray-700 mb-1">1ª imagen — fotografía (la base)</p>
                                                        {testInfo.request.photoUrl
                                                            ? <img src={testInfo.request.photoUrl} alt="Fotografía enviada" className="w-24 h-24 object-cover rounded border border-gray-200" />
                                                            : <p className="text-gray-400">—</p>}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-700 mb-1">2ª imagen — referencia (el ejemplo)</p>
                                                        {testInfo.request.referenceUrl
                                                            ? <img src={testInfo.request.referenceUrl} alt="Referencia enviada" className="w-24 h-24 object-cover rounded border border-gray-200" />
                                                            : <p className="text-gray-400">no viajó ninguna</p>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-700 mb-1">Prompt final (verbatim)</p>
                                                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-white border border-gray-200 rounded p-2 max-h-64 overflow-y-auto" data-no-translate>{testInfo.request.prompt}</pre>
                                                </div>
                                            </div>
                                        </details>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="h-full min-h-[280px] rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-sm text-gray-400 text-center px-6">
                                Elegí un club, los años y una fotografía, y pulsá «Generar prueba».
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* 6 — Versiones */}
            <Card title="Versiones publicadas" icon={<History className="w-5 h-5" />}
                hint="Se crea una versión al publicar, y sólo si cambió algo de lo que se imprime. Cada pieza guarda con cuál se generó.">
                {versions.length === 0 ? (
                    <p className="text-sm text-gray-500">Todavía no se publicó ninguna versión.</p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {versions.map(v => (
                            <li key={v.id} className="py-3 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900">
                                        Versión {v.version}
                                        {v.current && <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs">Vigente</span>}
                                        {v.label && <span className="ml-2 text-gray-500 font-normal">— {v.label}</span>}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{v.summary}</p>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        {new Date(v.createdAt).toLocaleString('es-CO')}
                                        {v.publishedBy ? ` · ${v.publishedBy}` : ''} · huella {v.fingerprint}
                                    </p>
                                </div>
                                {!v.current && (
                                    <button onClick={() => restaurar(v.id, v.version)}
                                        className="px-2 py-1 rounded border border-gray-300 text-xs hover:bg-gray-50 whitespace-nowrap">
                                        Traer al borrador
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {publishedAt && (
                    <button onClick={despublicar} className="mt-4 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50 flex items-center gap-2">
                        <X className="w-4 h-4" /> Retirar del aire
                    </button>
                )}
            </Card>

            {/* Entradas compartidas: UN solo selector y UN solo input de archivo. */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => subirArchivo(e.target.files)} />
            <MediaPicker
                isOpen={libraryOpen}
                onClose={() => setLibraryOpen(false)}
                maxSelection={1}
                mediaType="image"
                onSelect={(items) => { if (items[0]?.url) aplicarImagen(items[0].url); setLibraryOpen(false); }}
            />
        </div>
    );
};

export default AnniversaryStudio;
