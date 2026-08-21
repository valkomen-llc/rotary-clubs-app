import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import MediaPicker from '../../components/admin/content-studio/MediaPicker';
import IconPicker from '../../components/admin/IconPicker';
import SpotlightSection from '../../sections/SpotlightSection';
import { toast } from 'sonner';
import {
    LayoutTemplate, Plus, Save, ArrowLeft, Eye, Trash2, Copy, GripVertical,
    Image as ImageIcon, Upload, Monitor, Smartphone, AlertTriangle, Info,
    Power, PowerOff, Link2, Target, X, Loader2, Download,
} from 'lucide-react';
import {
    SLIDE_TYPES, slideTypeLabel, LINK_KINDS, OPEN_MODES, OPEN_MODE_LABELS,
    TARGETING_MODES, TARGETING_LABELS, SLIDE_STATE_LABELS,
    normalizeSlide, validateSlide, slideState,
    MIN_AUTOPLAY_MS, MAX_AUTOPLAY_MS, DEFAULT_AUTOPLAY_MS, MAX_SLIDES_PER_SITE,
    type Slide, type SlideState, type TargetingMode, type LinkKind, type OpenMode,
} from '../../lib/spotlightSpec';
import { uploadMediaFiles, IMAGE_ACCEPT } from '../../lib/mediaUpload';

// ════════════════════════════════════════════════════════════════════
// Slider Global / Llamados a la Acción — el panel del operador
//
// Publica UNA vez y alcanza a los sitios que se elijan. El contenedor donde
// se ve es el «Bloque Destacado» de la portada, el mismo de siempre: acá no
// hay una segunda sección ni un segundo previsualizador — la vista previa
// monta `SpotlightSection` de verdad, así que lo que se ve es exactamente lo
// que se va a publicar.
//
// El CRITERIO —validación, vigencia, catálogos— sale de `src/lib/spotlightSpec`,
// el mismo espejo que compara `npm run test:spotlight` contra el servidor. El
// alcance NO se calcula acá: se pregunta (`/:id/reach`), porque con dos
// criterios el panel podría afirmar un alcance distinto del que sirve la
// página.
// ════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';

const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
});

/** El servidor contesta tres cosas distintas y hay que decirlas distinto: la
 *  sesión venció, no es tu permiso, o la petición no llegó a salir. «No se
 *  pudo guardar» a secas obliga a diagnosticar a ciegas (regla de v4.859). */
const mensajeDeFallo = (status: number | null, detalle?: string) => {
    if (status === 401) return 'La sesión venció. Volvé a entrar — lo que escribiste sigue acá.';
    if (status === 403) return 'Esta pantalla es del operador de la plataforma.';
    if (status === null) return 'La petición no llegó a salir. Revisá la conexión.';
    return detalle || 'No se pudo completar la operación.';
};

// datetime-local ↔ ISO. El input trabaja en hora local y se guarda en ISO.
const toLocalInput = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

interface SlideRow extends Slide { state?: SlideState; updatedAt?: string }
interface ClubOption { id: string; name: string; type?: string; district?: string }
interface CampaignOption { id: string; name: string; status: string; effectiveStatus?: string }
interface Reach { total: number; reached: number; sample: { id: string; name: string; district?: string }[] }

const STATE_PILL: Record<SlideState, string> = {
    vigente: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    programado: 'bg-sky-50 text-sky-700 border-sky-200',
    vencido: 'bg-amber-50 text-amber-700 border-amber-200',
    inactivo: 'bg-gray-100 text-gray-500 border-gray-200',
};

const lbl = 'text-xs font-bold text-gray-500 uppercase tracking-wide';
const inp = 'w-full mt-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none';

/** Un slide nuevo. Nace APAGADO y con alcance «todos»: crear no publica nada,
 *  y encenderlo es un gesto aparte y visible. Es lo que hace seguro que el
 *  alcance por defecto sea el cómodo. */
const nuevoSlide = (): Slide => normalizeSlide({
    name: '', slideType: 'general', active: false,
    autoplayMs: DEFAULT_AUTOPLAY_MS,
    targeting: { mode: 'all', districts: [], clubIds: [], excludeClubIds: [] },
});

const SpotlightSlides: React.FC = () => {
    const [rows, setRows] = useState<SlideRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [clubs, setClubs] = useState<ClubOption[]>([]);
    const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);

    // El slide abierto en el editor. `null` = estamos en la lista.
    const [draft, setDraft] = useState<Slide | null>(null);
    const [editId, setEditId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [reach, setReach] = useState<Reach | null>(null);

    const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
    const [previewRow, setPreviewRow] = useState<SlideRow | null>(null);

    const [picker, setPicker] = useState<null | 'image' | 'imageMobile'>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploadTarget, setUploadTarget] = useState<'image' | 'imageMobile'>('image');
    const [uploading, setUploading] = useState(false);

    // El arrastre en curso, para reordenar. Vive en una ref: mover el ratón
    // no puede repintar la lista entera en cada píxel.
    const dragFrom = useRef<number | null>(null);
    const [dragOver, setDragOver] = useState<number | null>(null);

    const now = useMemo(() => new Date(), [rows]);

    // ── Carga ────────────────────────────────────────────────────────
    const cargar = useCallback(async () => {
        try {
            const r = await fetch(`${API}/spotlight-slides`, { headers: authHeaders() });
            if (!r.ok) { toast.error(mensajeDeFallo(r.status)); return; }
            const d = await r.json();
            setRows((d?.slides || []).map((s: any) => ({ ...normalizeSlide(s), state: s.state, updatedAt: s.updatedAt })));
        } catch {
            toast.error(mensajeDeFallo(null));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        cargar();
        // Los sitios y las campañas NO tumban la carga si fallan: los slides
        // se siguen editando y el selector queda vacío con su aviso.
        fetch(`${API}/admin/clubs`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : []))
            .then(d => setClubs((Array.isArray(d) ? d : []).map((x: any) => ({ id: x.id, name: x.name, type: x.type, district: x.district }))))
            .catch(() => { /* se configura igual sin la lista */ });
        fetch(`${API}/contribution-campaigns`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : { campaigns: [] }))
            .then(d => setCampaigns((d?.campaigns || []).map((c: any) => ({ id: c.id, name: c.name, status: c.status, effectiveStatus: c.effectiveStatus }))))
            .catch(() => { /* se configura igual sin la lista */ });
    }, [cargar]);

    // ── Editor ───────────────────────────────────────────────────────
    //
    // El borrador es LIBRE: `normalizeSlide` recorta espacios y descarta lo
    // vacío, que es lo correcto al leer y hace imposible escribir si se
    // aplica a cada pulsación — es el defecto que rompió el editor de la sede
    // en v4.718. Se normaliza al validar y al guardar, no antes.
    const patch = (p: Partial<Slide>) => setDraft(d => (d ? { ...d, ...p } : d));
    const patchTargeting = (p: any) => setDraft(d => (d ? { ...d, targeting: { ...d.targeting, ...p } } : d));

    const check = useMemo(() => (draft ? validateSlide(draft) : null), [draft]);

    const abrir = async (id: string) => {
        try {
            const r = await fetch(`${API}/spotlight-slides/${id}`, { headers: authHeaders() });
            if (!r.ok) { toast.error(mensajeDeFallo(r.status)); return; }
            const d = await r.json();
            setDraft(normalizeSlide(d.slide));
            setEditId(id);
            setReach(null);
            fetch(`${API}/spotlight-slides/${id}/reach`, { headers: authHeaders() })
                .then(x => (x.ok ? x.json() : null))
                .then(x => setReach(x))
                .catch(() => setReach(null));
        } catch {
            toast.error(mensajeDeFallo(null));
        }
    };

    const guardar = async () => {
        if (!draft || !check) return;
        // Encender exige un slide válido; apagarlo no. Publicar algo roto en
        // decenas de portadas es caro; retirarlo nunca puede quedar bloqueado.
        if (draft.active && !check.ok) { toast.error(check.errors[0]); return; }
        setSaving(true);
        try {
            const url = editId ? `${API}/spotlight-slides/${editId}` : `${API}/spotlight-slides`;
            const r = await fetch(url, {
                method: editId ? 'PUT' : 'POST',
                headers: authHeaders(),
                body: JSON.stringify(draft),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { toast.error(mensajeDeFallo(r.status, d?.errors?.[0] || d?.error)); return; }
            toast.success(editId ? 'Slide guardado' : 'Slide creado — nace apagado, encendelo cuando esté listo');
            (d?.warnings || []).forEach((w: string) => toast.warning(w));
            setDraft(null); setEditId(null); setReach(null);
            await cargar();
        } catch {
            toast.error(mensajeDeFallo(null));
        } finally {
            setSaving(false);
        }
    };

    // ── Acciones de la lista ─────────────────────────────────────────
    const alternar = async (row: SlideRow) => {
        const next = { ...row, active: !row.active };
        if (next.active) {
            const v = validateSlide(next);
            if (!v.ok) { toast.error(v.errors[0]); return; }
        }
        try {
            const r = await fetch(`${API}/spotlight-slides/${row.id}`, {
                method: 'PUT', headers: authHeaders(), body: JSON.stringify(next),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { toast.error(mensajeDeFallo(r.status, d?.errors?.[0] || d?.error)); return; }
            toast.success(next.active ? 'Publicado en los sitios alcanzados' : 'Retirado de todos los sitios');
            await cargar();
        } catch { toast.error(mensajeDeFallo(null)); }
    };

    const duplicar = async (row: SlideRow) => {
        try {
            const r = await fetch(`${API}/spotlight-slides/${row.id}/duplicate`, { method: 'POST', headers: authHeaders() });
            if (!r.ok) { toast.error(mensajeDeFallo(r.status)); return; }
            toast.success('Duplicado — nace apagado para que lo ajustes sin publicarlo');
            await cargar();
        } catch { toast.error(mensajeDeFallo(null)); }
    };

    const eliminar = async (row: SlideRow) => {
        if (!confirm(`¿Eliminar «${row.name}»?\n\nSe retira de todos los sitios donde se esté mostrando y no se puede deshacer.`)) return;
        try {
            const r = await fetch(`${API}/spotlight-slides/${row.id}`, { method: 'DELETE', headers: authHeaders() });
            if (!r.ok) { toast.error(mensajeDeFallo(r.status)); return; }
            toast.success('Slide eliminado');
            await cargar();
        } catch { toast.error(mensajeDeFallo(null)); }
    };

    // ── Reordenar ────────────────────────────────────────────────────
    //
    // El orden se pinta en el acto y se manda después. Si el servidor lo
    // rechaza, la lista se REVIERTE recargando: dejarla donde el usuario la
    // soltó sabiendo que no se guardó hace creer que el cambio quedó hecho
    // (la regla de los interruptores de la página de Proyectos, v4.750).
    const soltar = async (to: number) => {
        const from = dragFrom.current;
        dragFrom.current = null;
        setDragOver(null);
        if (from == null || from === to) return;

        const next = [...rows];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setRows(next);

        try {
            const r = await fetch(`${API}/spotlight-slides/order`, {
                method: 'PUT', headers: authHeaders(),
                body: JSON.stringify({ ids: next.map(s => s.id) }),
            });
            if (!r.ok) { toast.error(mensajeDeFallo(r.status)); await cargar(); return; }
        } catch { toast.error(mensajeDeFallo(null)); await cargar(); }
    };

    // ── Imágenes: las DOS vías, siempre (regla de v4.700) ────────────
    const subir = async (files: FileList | null) => {
        if (!files?.length) return;
        setUploading(true);
        try {
            const res = await uploadMediaFiles(Array.from(files));
            const first = res.uploaded?.[0];
            if (first?.url) patch({ [uploadTarget]: first.url } as any);
            (res.failed || []).forEach(f => toast.error(`${f.name}: ${f.reason}`));
        } catch {
            toast.error('No se pudo subir la imagen.');
        } finally {
            setUploading(false);
            // Sin esto, volver a elegir el MISMO archivo no dispara `change`
            // y el botón parece roto justo cuando alguien reintenta.
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const campoImagen = (key: 'image' | 'imageMobile', titulo: string, ayuda: string) => (
        <div>
            <label className={lbl}>{titulo}</label>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{ayuda}</p>
            <div className="flex items-start gap-3">
                <div className="w-40 h-24 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                    {(draft as any)?.[key]
                        ? <img src={(draft as any)[key]} alt="" className="w-full h-full object-cover" />
                        : <ImageIcon className="w-6 h-6 text-gray-300" />}
                </div>
                <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => setPicker(key)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" /> Biblioteca
                    </button>
                    <button type="button" onClick={() => { setUploadTarget(key); fileRef.current?.click(); }}
                        disabled={uploading}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-50">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir
                    </button>
                    {(draft as any)?.[key] && (
                        <button type="button" onClick={() => patch({ [key]: '' } as any)}
                            className="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 inline-flex items-center gap-2">
                            <X className="w-4 h-4" /> Quitar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    // ── Traer el Bloque Destacado que un sitio ya tiene ──────────────
    //
    // Un sitio puede llevar años con el suyo configurado (el END POLIO NOW del
    // Distrito 4281 es el caso que originó esto), repartido entre dos
    // pantallas: el texto en Configuración / Identidad y la imagen en
    // Imágenes del Sitio. Copiarlo a mano es la forma segura de equivocarse en
    // una URL o de perder el icono.
    const [importOpen, setImportOpen] = useState(false);
    const [importables, setImportables] = useState<any[] | null>(null);
    const [importando, setImportando] = useState('');
    // Marcada por omisión porque es el PROPÓSITO de importar: dejar de
    // administrar ese llamado en el sitio y pasarlo acá. Y hace las dos cosas
    // a la vez —publicar y vaciar— justamente para que el sitio no quede ni
    // duplicado ni vacío en ningún momento intermedio.
    const [reemplazar, setReemplazar] = useState(true);

    const abrirImportar = async () => {
        setImportOpen(true);
        setImportables(null);
        try {
            const r = await fetch(`${API}/spotlight-slides/importable`, { headers: authHeaders() });
            const d = await r.json();
            setImportables(Array.isArray(d?.sites) ? d.sites : []);
        } catch {
            setImportables([]);
        }
    };

    const importar = async (clubId: string) => {
        setImportando(clubId);
        try {
            const r = await fetch(`${API}/spotlight-slides/import`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ clubId, replace: reemplazar }),
            });
            const d = await r.json();
            if (!r.ok) {
                // El motivo se dice TEXTUAL —y el primer error concreto como
                // descripción—: «no se pudo importar» a secas manda a adivinar
                // qué le falta al bloque de ese sitio.
                toast.error(mensajeDeFallo(r.status, d?.error), { description: d?.errors?.[0] });
                return;
            }
            setImportOpen(false);
            await cargar();
            toast.success(
                d?.bloqueLocalVaciado
                    ? 'Importado y publicado. El sitio ya no administra ese llamado por su cuenta.'
                    : 'Importado. Nació apagado: revisá el alcance y encendelo cuando quieras.',
                { description: d?.warnings?.[0] }
            );
        } catch {
            toast.error(mensajeDeFallo(null));
        } finally {
            setImportando('');
        }
    };

    // ════════════════════════════════════════════════════════════════
    // LISTA
    // ════════════════════════════════════════════════════════════════
    if (!draft) {
        return (
            <AdminLayout>
                <div className="max-w-7xl mx-auto p-6 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                <LayoutTemplate className="w-7 h-7 text-rotary-blue" />
                                Slider Global / Llamados a la Acción
                            </h1>
                            <p className="text-sm text-gray-500 mt-1 max-w-3xl">
                                Se publican desde acá y aparecen en el último contenedor de la portada de los
                                sitios que elijas, antes del pie. Con un solo llamado activo el sitio lo muestra
                                como siempre; con varios, el contenedor se convierte solo en un carrusel.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button onClick={abrirImportar}
                                className="px-5 py-3 rounded-xl border border-gray-200 text-gray-700 font-bold inline-flex items-center gap-2 hover:bg-gray-50 transition">
                                <Download className="w-5 h-5" /> Traer el de un sitio
                            </button>
                            <button onClick={() => { setDraft(nuevoSlide()); setEditId(null); setReach(null); }}
                                className="px-5 py-3 rounded-xl bg-rotary-blue text-white font-bold inline-flex items-center gap-2 hover:bg-rotary-navy transition">
                                <Plus className="w-5 h-5" /> Nuevo slide
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 flex gap-3 text-sm text-sky-900">
                        <Info className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                            Un slide nuevo <strong>nace apagado</strong>: crearlo no publica nada en ninguna portada.
                            Cada sitio muestra como mucho <strong>{MAX_SLIDES_PER_SITE}</strong> llamados; si hubiera más,
                            entran los de mayor prioridad y el resto queda fuera (se anota en el registro del servidor).
                            El orden de esta lista es el orden en que se ven — arrastrá para cambiarlo.
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-20 text-center text-gray-400">Cargando…</div>
                    ) : rows.length === 0 ? (
                        <div className="py-20 text-center">
                            <LayoutTemplate className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                            <p className="text-gray-500 font-semibold">Todavía no hay ningún llamado a la acción.</p>
                            <p className="text-sm text-gray-400 mt-1">
                                Los sitios siguen mostrando su propio Bloque Destacado, si lo tienen configurado.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="hidden lg:grid grid-cols-[36px_180px_1fr_140px_130px_160px_150px] gap-3 px-4 py-3 bg-gray-50 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                                <span />
                                <span>Vista previa</span>
                                <span>Nombre / Tipo</span>
                                <span>Estado</span>
                                <span>Sitios</span>
                                <span>Vigencia</span>
                                <span className="text-right">Acciones</span>
                            </div>
                            {rows.map((row, i) => {
                                const st = row.state || slideState(row, now);
                                return (
                                    <div key={row.id}
                                        onDragOver={e => { e.preventDefault(); setDragOver(i); }}
                                        onDrop={e => { e.preventDefault(); soltar(i); }}
                                        onDragLeave={() => setDragOver(o => (o === i ? null : o))}
                                        className={`grid grid-cols-1 lg:grid-cols-[36px_180px_1fr_140px_130px_160px_150px] gap-3 items-center px-4 py-4 border-t border-gray-100 transition-colors ${dragOver === i ? 'bg-sky-50' : 'hover:bg-gray-50/60'}`}>
                                        <div draggable
                                            onDragStart={() => { dragFrom.current = i; }}
                                            onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}
                                            title="Arrastrar para cambiar el orden"
                                            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
                                            <GripVertical className="w-5 h-5" />
                                        </div>

                                        <div className="w-[180px] h-[68px] rounded-lg overflow-hidden bg-rotary-topbar relative shrink-0">
                                            {row.image
                                                ? <img src={row.image} alt="" className="w-full h-full object-cover" />
                                                : <div className="w-full h-full" />}
                                            <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/10" />
                                            <span className="absolute left-2 bottom-1.5 right-2 text-[10px] font-bold text-white leading-tight line-clamp-2">
                                                {row.title || '—'}
                                            </span>
                                        </div>

                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-900 truncate">{row.name}</p>
                                            <p className="text-xs text-gray-400">
                                                {slideTypeLabel(row.slideType)}
                                                {row.linkKind === 'campaign' && (
                                                    <span className="ml-2 inline-flex items-center gap-1 text-rotary-blue">
                                                        <Link2 className="w-3 h-3" />
                                                        {campaigns.find(c => c.id === row.campaignId)?.name || 'campaña vinculada'}
                                                    </span>
                                                )}
                                            </p>
                                        </div>

                                        <div>
                                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATE_PILL[st]}`}>
                                                {SLIDE_STATE_LABELS[st]}
                                            </span>
                                        </div>

                                        <div className="text-xs text-gray-500">
                                            {TARGETING_LABELS[row.targeting.mode]}
                                            {row.targeting.mode === 'districts' && ` (${row.targeting.districts.length})`}
                                            {row.targeting.mode === 'clubs' && ` (${row.targeting.clubIds.length})`}
                                            {row.targeting.excludeClubIds.length > 0 && (
                                                <span className="block text-amber-600">−{row.targeting.excludeClubIds.length} excluidos</span>
                                            )}
                                        </div>

                                        <div className="text-xs text-gray-500 leading-snug">
                                            {!row.startAt && !row.endAt
                                                ? <span className="text-gray-400">Permanente</span>
                                                : <>
                                                    {row.startAt && <span className="block">Desde {new Date(row.startAt).toLocaleDateString()}</span>}
                                                    {row.endAt && <span className="block">Hasta {new Date(row.endAt).toLocaleDateString()}</span>}
                                                </>}
                                        </div>

                                        <div className="flex items-center justify-start lg:justify-end gap-1">
                                            <button onClick={() => setPreviewRow(row)} title="Vista previa"
                                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Eye className="w-4 h-4" /></button>
                                            <button onClick={() => abrir(row.id)} title="Editar"
                                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Save className="w-4 h-4" /></button>
                                            <button onClick={() => duplicar(row)} title="Duplicar"
                                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><Copy className="w-4 h-4" /></button>
                                            <button onClick={() => alternar(row)} title={row.active ? 'Desactivar' : 'Activar'}
                                                className={`p-2 rounded-lg hover:bg-gray-100 ${row.active ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                {row.active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                                            </button>
                                            <button onClick={() => eliminar(row)} title="Eliminar"
                                                className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {previewRow && (
                    <VistaPrevia slide={previewRow} viewport={viewport} setViewport={setViewport}
                        onClose={() => setPreviewRow(null)} />
                )}

                {/* ── Traer el Bloque Destacado de un sitio ────────────────── */}
                {importOpen && (
                    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                        role="dialog" aria-modal="true" aria-label="Traer el Bloque Destacado de un sitio">
                        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Traer el Bloque Destacado de un sitio</h2>
                                    <p className="text-sm text-gray-500 mt-1 max-w-xl">
                                        Estos sitios ya muestran un llamado propio, configurado en su panel.
                                        Traerlo acá lo convierte en un slide administrable desde Club Platform,
                                        sin copiar nada a mano.
                                    </p>
                                </div>
                                <button onClick={() => setImportOpen(false)} aria-label="Cerrar"
                                    className="p-2 rounded-lg hover:bg-gray-100 shrink-0"><X className="w-5 h-5" /></button>
                            </div>

                            <label className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex gap-3 items-start cursor-pointer">
                                <input type="checkbox" checked={reemplazar} className="mt-1"
                                    onChange={e => setReemplazar(e.target.checked)} />
                                <span className="text-sm text-amber-900">
                                    <strong>Publicarlo y quitar el bloque propio del sitio.</strong>{' '}
                                    Es lo que hace que ese sitio pase de administrarlo por su cuenta a recibirlo
                                    desde acá, sin verse duplicado ni quedarse sin nada en el medio. El slide nace
                                    apuntando <strong>sólo a ese sitio</strong>: no se publica en toda la red por
                                    importarlo — para eso hay que ampliar el alcance a propósito.
                                    <br />
                                    Sin marcar, el slide se crea <strong>apagado</strong> y el sitio sigue mostrando el suyo.
                                </span>
                            </label>

                            <div className="p-6 overflow-y-auto space-y-3">
                                {importables === null ? (
                                    <div className="py-12 text-center text-gray-400 inline-flex items-center gap-2 justify-center w-full">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Buscando sitios…
                                    </div>
                                ) : importables.length === 0 ? (
                                    <div className="py-12 text-center">
                                        <LayoutTemplate className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                        <p className="text-gray-500 font-semibold">Ningún sitio tiene un Bloque Destacado configurado.</p>
                                        <p className="text-sm text-gray-400 mt-1">
                                            Se busca lo que cada sitio cargó en Configuración / Identidad e Imágenes del Sitio.
                                        </p>
                                    </div>
                                ) : importables.map(site => (
                                    <div key={site.clubId}
                                        className="rounded-xl border border-gray-200 overflow-hidden flex flex-col sm:flex-row">
                                        {site.image ? (
                                            <img src={site.image} alt="" className="w-full sm:w-40 h-28 object-cover shrink-0" />
                                        ) : (
                                            <div className="w-full sm:w-40 h-28 bg-gray-100 shrink-0 flex items-center justify-center">
                                                <ImageIcon className="w-6 h-6 text-gray-300" />
                                            </div>
                                        )}
                                        <div className="p-4 flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-gray-900" data-no-translate>{site.clubName}</span>
                                                {site.domain && (
                                                    <span className="text-xs text-gray-400" data-no-translate>{site.domain}</span>
                                                )}
                                                {site.yaTieneSlide && (
                                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">
                                                        ya tiene un llamado
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm font-semibold text-gray-700 mt-1 line-clamp-1">{site.title || '(sin título)'}</p>
                                            <p className="text-xs text-gray-500 line-clamp-2">{site.text}</p>
                                        </div>
                                        <div className="p-4 flex items-center shrink-0">
                                            <button onClick={() => importar(site.clubId)} disabled={!!importando}
                                                className="px-4 py-2 rounded-lg bg-rotary-blue text-white font-bold text-sm inline-flex items-center gap-2 hover:bg-rotary-navy transition disabled:opacity-50">
                                                {importando === site.clubId
                                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Trayendo…</>
                                                    : <><Download className="w-4 h-4" /> Traer</>}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </AdminLayout>
        );
    }

    // ════════════════════════════════════════════════════════════════
    // EDITOR
    // ════════════════════════════════════════════════════════════════
    const t = draft.targeting;

    return (
        <AdminLayout>
            <div className="max-w-7xl mx-auto p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <button onClick={() => { setDraft(null); setEditId(null); setReach(null); }}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800">
                        <ArrowLeft className="w-4 h-4" /> Volver a la lista
                    </button>
                    <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-sm font-bold cursor-pointer">
                            <input type="checkbox" checked={draft.active}
                                onChange={e => patch({ active: e.target.checked })}
                                className="w-4 h-4 accent-emerald-600" />
                            {draft.active ? 'Publicado' : 'Sin publicar'}
                        </label>
                        <button onClick={guardar} disabled={saving}
                            className="px-5 py-2.5 rounded-xl bg-rotary-blue text-white font-bold inline-flex items-center gap-2 hover:bg-rotary-navy disabled:opacity-50">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                        </button>
                    </div>
                </div>

                {/* Los avisos van ARRIBA, donde se mira primero: un diagnóstico
                    escondido al final de un formulario largo no lo lee nadie
                    (la lección de v4.790). */}
                {check && (check.errors.length > 0 || check.warnings.length > 0) && (
                    <div className="space-y-2">
                        {check.errors.map((e, i) => (
                            <div key={`e${i}`} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 flex gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{e}
                            </div>
                        ))}
                        {check.warnings.map((w, i) => (
                            <div key={`w${i}`} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 flex gap-2">
                                <Info className="w-4 h-4 shrink-0 mt-0.5" />{w}
                            </div>
                        ))}
                    </div>
                )}

                <div className="grid lg:grid-cols-[1fr_420px] gap-6 items-start">
                    <div className="space-y-6">
                        {/* ── Contenido ── */}
                        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                            <h2 className="font-bold text-gray-900">Contenido</h2>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={lbl}>Nombre interno</label>
                                    <input value={draft.name} onChange={e => patch({ name: e.target.value })}
                                        placeholder="Emergencia Chocó 2026" className={inp} />
                                    <p className="text-[11px] text-gray-400 mt-1">Sólo se ve acá: es como lo encontrás en la lista.</p>
                                </div>
                                <div>
                                    <label className={lbl}>Tipo</label>
                                    <select value={draft.slideType} onChange={e => patch({ slideType: e.target.value })}
                                        className={`${inp} bg-white`}>
                                        {SLIDE_TYPES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                                    </select>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        {SLIDE_TYPES.find(x => x.id === draft.slideType)?.hint}
                                        {' '}El tipo clasifica y filtra; no cambia cómo se ve la pieza.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className={lbl}>Título principal</label>
                                <textarea rows={2} value={draft.title} onChange={e => patch({ title: e.target.value })}
                                    placeholder="Acción constante, impacto duradero" className={`${inp} resize-y`} />
                            </div>
                            <div>
                                <label className={lbl}>Descripción</label>
                                <textarea rows={4} value={draft.text} onChange={e => patch({ text: e.target.value })}
                                    placeholder="Describe el llamado a la acción…" className={`${inp} resize-y`} />
                            </div>

                            {campoImagen('image', 'Imagen de fondo (escritorio)',
                                'Panorámica, idealmente 1600×700 px. El velo que garantiza la legibilidad lo pone el sistema.')}
                            <div>
                                <label className={lbl}>Texto alternativo de la imagen</label>
                                <input value={draft.imageAlt} onChange={e => patch({ imageAlt: e.target.value })}
                                    placeholder="Una niña recibe la vacuna contra la polio" className={inp} />
                            </div>

                            {campoImagen('imageMobile', 'Imagen para móvil (opcional)',
                                'Más vertical, para que el motivo no se recorte en un teléfono. Sin ella se usa la de escritorio.')}
                        </section>

                        {/* ── El botón ── */}
                        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                            <h2 className="font-bold text-gray-900">El botón</h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={lbl}>Texto del botón</label>
                                    <input value={draft.buttonText} onChange={e => patch({ buttonText: e.target.value })}
                                        placeholder="Más información" className={inp} />
                                </div>
                                <div>
                                    <label className={lbl}>Icono</label>
                                    <div className="mt-1">
                                        {/* La varita deduce el icono del texto de la
                                            pieza: sin `suggestFrom` no se dibuja, porque
                                            sugerir a partir de nada daría siempre lo mismo. */}
                                        <IconPicker value={draft.buttonIcon} onChange={v => patch({ buttonIcon: v })}
                                            label="" suggestFrom={{ title: draft.title, description: draft.text }} />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className={lbl}>A dónde lleva</label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {LINK_KINDS.map(k => (
                                        <button key={k} type="button" onClick={() => patch({ linkKind: k as LinkKind })}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition ${draft.linkKind === k ? 'border-sky-700 bg-sky-50 text-sky-800' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                                            {k === 'url' ? 'Una dirección' : 'Una campaña de Maneras de Contribuir'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {draft.linkKind === 'url' ? (
                                <div>
                                    <label className={lbl}>Dirección</label>
                                    <input value={draft.buttonUrl} onChange={e => patch({ buttonUrl: e.target.value })}
                                        placeholder="/proyectos o https://endpolio.org" className={inp} />
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Una ruta del propio sitio («/proyectos») o una dirección completa.
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label className={lbl}>Campaña</label>
                                    <select value={draft.campaignId} onChange={e => patch({ campaignId: e.target.value })}
                                        className={`${inp} bg-white`}>
                                        <option value="">— Elegí una campaña —</option>
                                        {campaigns.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}{c.effectiveStatus ? ` · ${c.effectiveStatus}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-[12px] text-sky-900 flex gap-2">
                                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>
                                            El enlace lo resuelve el sistema en <strong>cada sitio</strong>: el botón lleva a la
                                            página de contribución de ese sitio, con esta campaña ya cargada. Si la campaña
                                            deja de estar activa —o no alcanza a un sitio—, el slide <strong>no se muestra ahí</strong>,
                                            en vez de dejar un botón que no lleva a ninguna parte.
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className={lbl}>Cómo se abre</label>
                                <select value={draft.openMode} onChange={e => patch({ openMode: e.target.value as OpenMode })}
                                    className={`${inp} bg-white`}>
                                    {OPEN_MODES.map(m => <option key={m} value={m}>{OPEN_MODE_LABELS[m]}</option>)}
                                </select>
                                <p className="text-[11px] text-gray-400 mt-1">
                                    «Automático» es lo normal: una dirección de otro dominio abre pestaña nueva y una del
                                    propio sitio no. Forzá la pestaña nueva sólo para un PDF o un formulario que convenga
                                    abrir aparte.
                                </p>
                            </div>
                        </section>

                        {/* ── Publicación ── */}
                        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                            <h2 className="font-bold text-gray-900">Publicación</h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={lbl}>Se muestra desde</label>
                                    <input type="datetime-local" value={toLocalInput(draft.startAt)}
                                        onChange={e => patch({ startAt: fromLocalInput(e.target.value) })} className={inp} />
                                </div>
                                <div>
                                    <label className={lbl}>Hasta</label>
                                    <input type="datetime-local" value={toLocalInput(draft.endAt)}
                                        onChange={e => patch({ endAt: fromLocalInput(e.target.value) })} className={inp} />
                                </div>
                            </div>
                            <p className="text-[11px] text-gray-400 -mt-2">
                                Dejá las dos en blanco para una publicación permanente. Las fechas se evalúan solas: no hay
                                nada que apagar a mano cuando vence.
                            </p>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={lbl}>Prioridad</label>
                                    <input type="number" value={draft.priority}
                                        onChange={e => patch({ priority: Number(e.target.value) || 0 })} className={inp} />
                                    <p className="text-[11px] text-gray-400 mt-1">Mayor primero. También se ordena arrastrando en la lista.</p>
                                </div>
                                <div>
                                    <label className={lbl}>Cuánto se queda en pantalla</label>
                                    <div className="flex items-center gap-3 mt-2">
                                        <input type="range" min={MIN_AUTOPLAY_MS} max={MAX_AUTOPLAY_MS} step={500}
                                            value={draft.autoplayMs}
                                            onChange={e => patch({ autoplayMs: Number(e.target.value) })}
                                            className="flex-1 accent-sky-700" />
                                        <span className="text-sm font-bold text-gray-700 w-16 text-right">
                                            {(draft.autoplayMs / 1000).toFixed(1)} s
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Sólo actúa si el sitio muestra más de un llamado. Con uno solo no rota nada.
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* ── Destinos ── */}
                        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                            <h2 className="font-bold text-gray-900 flex items-center gap-2">
                                <Target className="w-5 h-5 text-rotary-blue" /> Destinos
                            </h2>
                            <div className="flex flex-wrap gap-2">
                                {TARGETING_MODES.map(m => (
                                    <button key={m} type="button" onClick={() => patchTargeting({ mode: m })}
                                        className={`px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition ${t.mode === m ? 'border-sky-700 bg-sky-50 text-sky-800' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                                        {TARGETING_LABELS[m as TargetingMode]}
                                    </button>
                                ))}
                            </div>

                            {t.mode === 'districts' && (
                                <div>
                                    <label className={lbl}>Distritos (números separados por coma)</label>
                                    <input value={t.districts.join(', ')}
                                        onChange={e => patchTargeting({ districts: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                        placeholder="4271, 4281" className={inp} />
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Alcanza a los sitios de esos distritos, incluidos los que pertenecen a varios.
                                    </p>
                                </div>
                            )}

                            {t.mode === 'clubs' && (
                                <div>
                                    <label className={lbl}>Sitios ({t.clubIds.length} elegidos)</label>
                                    <div className="mt-2 max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                                        {clubs.map(cl => (
                                            <label key={cl.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                                                <input type="checkbox" checked={t.clubIds.includes(cl.id)}
                                                    onChange={() => patchTargeting({
                                                        clubIds: t.clubIds.includes(cl.id)
                                                            ? t.clubIds.filter(x => x !== cl.id)
                                                            : [...t.clubIds, cl.id],
                                                    })}
                                                    className="w-4 h-4 accent-sky-700" />
                                                <span className="text-sm text-gray-700 truncate">{cl.name}</span>
                                                {cl.district && <span className="ml-auto text-[11px] text-gray-400">{cl.district}</span>}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className={lbl}>Excluir estos sitios ({t.excludeClubIds.length})</label>
                                <p className="text-[11px] text-gray-400 mt-0.5 mb-2">
                                    La exclusión gana siempre, incluso sobre un sitio elegido arriba.
                                </p>
                                <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                                    {clubs.map(cl => (
                                        <label key={cl.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                                            <input type="checkbox" checked={t.excludeClubIds.includes(cl.id)}
                                                onChange={() => patchTargeting({
                                                    excludeClubIds: t.excludeClubIds.includes(cl.id)
                                                        ? t.excludeClubIds.filter(x => x !== cl.id)
                                                        : [...t.excludeClubIds, cl.id],
                                                })}
                                                className="w-4 h-4 accent-amber-500" />
                                            <span className="text-sm text-gray-700 truncate">{cl.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* El alcance no se calcula acá: se PREGUNTA, con el
                                mismo criterio que sirve la página. Con dos
                                criterios, el panel afirmaría un alcance que la
                                portada no cumple. */}
                            {editId && (
                                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                                    {reach ? (
                                        <>
                                            <strong className="text-gray-900">{reach.reached}</strong>
                                            <span className="text-gray-600"> de {reach.total} sitios lo mostrarían</span>
                                            {reach.sample.length > 0 && (
                                                <p className="text-[11px] text-gray-400 mt-1 truncate">
                                                    {reach.sample.map(s => s.name).join(' · ')}
                                                    {reach.reached > reach.sample.length && ` … y ${reach.reached - reach.sample.length} más`}
                                                </p>
                                            )}
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Calculado con lo GUARDADO. Guardá para verlo con los cambios de esta pantalla.
                                            </p>
                                        </>
                                    ) : (
                                        <span className="text-gray-400">Calculando el alcance…</span>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* ── Vista previa ── */}
                    <div className="lg:sticky lg:top-6 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-gray-900">Vista previa</h2>
                            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                                <button type="button" onClick={() => setViewport('desktop')}
                                    className={`px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 ${viewport === 'desktop' ? 'bg-rotary-blue text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                    <Monitor className="w-3.5 h-3.5" /> Escritorio
                                </button>
                                <button type="button" onClick={() => setViewport('mobile')}
                                    className={`px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 ${viewport === 'mobile' ? 'bg-rotary-blue text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                    <Smartphone className="w-3.5 h-3.5" /> Móvil
                                </button>
                            </div>
                        </div>
                        <PreviewFrame slide={draft} viewport={viewport} />
                        <p className="text-[11px] text-gray-400">
                            Es el componente REAL de la portada, reducido a escala. Lo que se ve es lo que se publica.
                        </p>
                    </div>
                </div>
            </div>

            <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden"
                onChange={e => subir(e.target.files)} />

            {picker && (
                <MediaPicker
                    isOpen
                    onClose={() => setPicker(null)}
                    maxSelection={1}
                    onSelect={items => {
                        const it: any = items?.[0];
                        if (it?.url) patch({ [picker]: it.url } as any);
                        setPicker(null);
                    }}
                />
            )}
        </AdminLayout>
    );
};

// ─── Vista previa ───────────────────────────────────────────────────────
//
// Monta `SpotlightSection` DE VERDAD y lo reduce con `transform: scale`. Un
// previsualizador propio se separaría del componente real y la diferencia se
// vería como «la vista previa no es lo que se publicó» — el defecto que
// Plantillas IA existe para no tener.
const PreviewFrame: React.FC<{ slide: Slide; viewport: 'desktop' | 'mobile' }> = ({ slide, viewport }) => {
    // Ancho nominal de cada vista. Se pinta a ese ancho y se reduce, en vez de
    // pintarlo estrecho: así los puntos de corte responsive (`md:`) se evalúan
    // contra el ancho REAL del contenedor pintado y no contra el del panel.
    const ancho = viewport === 'mobile' ? 390 : 1440;
    const alto = viewport === 'mobile' ? 640 : 560;
    const marco = useRef<HTMLDivElement>(null);
    const [escala, setEscala] = useState(0.28);

    useEffect(() => {
        const medir = () => {
            const w = marco.current?.clientWidth || 0;
            if (w) setEscala(w / ancho);
        };
        medir();
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, [ancho]);

    const slides = useMemo(() => [{ ...normalizeSlide(slide), active: true }], [slide]);

    return (
        <div ref={marco} className="rounded-2xl border border-gray-200 bg-gray-100 overflow-hidden">
            <div style={{ height: alto * escala }} className="relative">
                <div style={{
                    width: ancho, transform: `scale(${escala})`, transformOrigin: 'top left',
                    position: 'absolute', top: 0, left: 0,
                }}>
                    <SpotlightSection previewSlides={slides} previewViewport={viewport} />
                </div>
            </div>
        </div>
    );
};

/** El mismo marco, en una ventana, para el botón «Vista previa» de la lista. */
const VistaPrevia: React.FC<{
    slide: Slide; viewport: 'desktop' | 'mobile';
    setViewport: (v: 'desktop' | 'mobile') => void; onClose: () => void;
}> = ({ slide, viewport, setViewport, onClose }) => (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 truncate">{slide.name}</h3>
                <div className="flex items-center gap-3">
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        <button onClick={() => setViewport('desktop')}
                            className={`px-3 py-1.5 text-xs font-bold ${viewport === 'desktop' ? 'bg-rotary-blue text-white' : 'text-gray-500'}`}>Escritorio</button>
                        <button onClick={() => setViewport('mobile')}
                            className={`px-3 py-1.5 text-xs font-bold ${viewport === 'mobile' ? 'bg-rotary-blue text-white' : 'text-gray-500'}`}>Móvil</button>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
                </div>
            </div>
            <div className="p-5"><PreviewFrame slide={slide} viewport={viewport} /></div>
        </div>
    </div>
);

export default SpotlightSlides;
