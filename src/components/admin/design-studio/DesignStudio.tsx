// ════════════════════════════════════════════════════════════════════
// Plantillas IA — la pantalla
// v4.720.0
//
// Tres paneles: configuración a la izquierda, mesa de trabajo al centro, capas
// y propiedades a la derecha. Es el reparto del Generador de Pendones ampliado,
// y por eso se siente conocido desde el primer minuto.
//
// ── DÓNDE VIVE LA VERDAD ────────────────────────────────────────────
//
// `doc` es el documento y es lo único que se dibuja, se guarda y se exporta.
// El panel izquierdo NO recompila la plantilla en cada cambio: eso borraría
// todo lo que el usuario haya movido. Lo que hace es actualizar las VARIABLES,
// y `applyVariables` repinta sólo los nodos que siguen atados a ellas. Se
// vuelve al servidor únicamente cuando cambia la plantilla o cuando se pide
// otro mensaje: las dos veces el usuario está pidiendo, a propósito, una pieza
// nueva.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Download, Save, Loader2,
    Trash2, Copy, Grid3x3, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter,
    Sparkles, FolderOpen, FileImage, FileType2, ImageDown,
} from 'lucide-react';
import { toast } from 'sonner';
import MediaPicker from '../content-studio/MediaPicker';
import DesignCanvas from './DesignCanvas';
import DesignSidebar from './DesignSidebar';
import DesignInspector from './DesignInspector';
import {
    fetchCatalog, compose, listDesigns, createDesign, updateDesign, deleteDesign, uploadToLibrary,
    type Catalog, type ClubHit, type Branding, type DesignCopy, type SavedDesign, type ElementItem,
} from './designApi';
import {
    formatOf, applyVariables, duplicateNode, uid, isText, isImage,
    HISTORY_STEPS, PALETTE,
    type DesignDocument, type DesignNode, type TextNode,
} from '../../../lib/designSpec';
import { exportDocument, exportToFile, type ExportFormat } from '../../../lib/designRender';

const EMPTY_DOC: DesignDocument = { format: 'post_1_1', background: PALETTE.white, nodes: [] };

const DesignStudio: React.FC = () => {
    // ── Estado. TODOS los hooks van arriba, antes de cualquier return:
    //    React identifica cada hook por su ORDEN de llamada y un return
    //    temprano en medio tumba el árbol entero (regla del sitio, v4.689).
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [templateId, setTemplateId] = useState('aniversario_foto');
    const [club, setClub] = useState<ClubHit | null>(null);
    const [branding, setBranding] = useState<Branding | null>(null);
    const [years, setYears] = useState('');
    const [message, setMessage] = useState('');
    const [photo, setPhoto] = useState<string | null>(null);
    const [copy, setCopy] = useState<DesignCopy | null>(null);
    const [missing, setMissing] = useState<string[]>([]);

    const [doc, setDoc] = useState<DesignDocument>(EMPTY_DOC);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [zoom, setZoom] = useState(0.5);
    const [showGuides, setShowGuides] = useState(true);

    const [past, setPast] = useState<DesignDocument[]>([]);
    const [future, setFuture] = useState<DesignDocument[]>([]);

    const [generating, setGenerating] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [saved, setSaved] = useState<SavedDesign[]>([]);
    const [showSaved, setShowSaved] = useState(false);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [exportOpen, setExportOpen] = useState(false);

    const viewportRef = useRef<HTMLDivElement>(null);

    // ── Carga inicial ──────────────────────────────────────────────
    useEffect(() => {
        fetchCatalog()
            .then(setCatalog)
            .catch(e => toast.error(e instanceof Error ? e.message : 'No se pudo cargar el catálogo'));
        listDesigns().then(setSaved).catch(() => { /* el listado es secundario */ });
    }, []);

    // ── Historial ──────────────────────────────────────────────────
    // Un paso por ACCIÓN, no por píxel: el arrastre sólo confirma al soltar
    // (`commit`), o deshacer una vez retrocedería un píxel.
    const commit = useCallback((next: DesignDocument) => {
        setPast(p => [...p.slice(-(HISTORY_STEPS - 1)), doc]);
        setFuture([]);
        setDoc(next);
    }, [doc]);

    const undo = useCallback(() => {
        setPast(p => {
            if (!p.length) return p;
            const prev = p[p.length - 1];
            setFuture(f => [doc, ...f].slice(0, HISTORY_STEPS));
            setDoc(prev);
            return p.slice(0, -1);
        });
    }, [doc]);

    const redo = useCallback(() => {
        setFuture(f => {
            if (!f.length) return f;
            setPast(p => [...p, doc]);
            setDoc(f[0]);
            return f.slice(1);
        });
    }, [doc]);

    // ── Mutaciones ─────────────────────────────────────────────────
    const setNodes = useCallback((nodes: DesignNode[], doCommit: boolean) => {
        if (doCommit) commit({ ...doc, nodes });
        else setDoc(d => ({ ...d, nodes }));
    }, [commit, doc]);

    const patchNode = useCallback((id: string, patch: Partial<DesignNode>) => {
        commit({
            ...doc,
            nodes: doc.nodes.map(n => {
                if (n.id !== id) return n;
                // Editar el texto a mano lo DESLIGA de su variable: a partir de
                // ahí, cambiar «los años» en el panel ya no lo pisa. Sin esta
                // regla, el usuario corrige el título y el siguiente cambio de
                // variable se lo borra sin avisar.
                const unlink = isText(n) && 'text' in patch ? { srcText: null } : {};
                return { ...n, ...patch, ...unlink } as DesignNode;
            }),
        });
    }, [commit, doc]);

    const removeNode = useCallback((id: string) => {
        commit({ ...doc, nodes: doc.nodes.filter(n => n.id !== id) });
        setSelectedIds(s => s.filter(i => i !== id));
    }, [commit, doc]);

    const duplicate = useCallback((id: string) => {
        const n = doc.nodes.find(x => x.id === id);
        if (!n) return;
        const clone = duplicateNode(n);
        commit({ ...doc, nodes: [...doc.nodes, clone] });
        setSelectedIds([clone.id]);
    }, [commit, doc]);

    const reorder = useCallback((id: string, dir: -1 | 1) => {
        const i = doc.nodes.findIndex(n => n.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= doc.nodes.length) return;
        const nodes = [...doc.nodes];
        [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
        commit({ ...doc, nodes });
    }, [commit, doc]);

    const alignSelection = useCallback((axis: 'x' | 'y') => {
        if (!selectedIds.length) return;
        commit({
            ...doc,
            nodes: doc.nodes.map(n => selectedIds.includes(n.id) && !n.locked
                ? (axis === 'x' ? { ...n, x: 0.5 - n.w / 2 } : { ...n, y: 0.5 - n.h / 2 })
                : n),
        });
    }, [commit, doc, selectedIds]);

    const addText = useCallback(() => {
        const node: TextNode = {
            id: uid('text'), type: 'text', name: 'Texto nuevo',
            x: 0.15, y: 0.45, w: 0.7, h: 0.1, rotation: 0, opacity: 1,
            text: 'Escribí acá', srcText: null,
            fontSize: 0.04, fontFamily: 'sans', fontWeight: 700, color: PALETTE.royal,
            align: 'center', valign: 'middle', lineHeight: 1.2, letterSpacing: 0,
            italic: false, uppercase: false, autoFit: true, minFontSize: 0.018,
        };
        commit({ ...doc, nodes: [...doc.nodes, node] });
        setSelectedIds([node.id]);
    }, [commit, doc]);

    const addElement = useCallback((el: ElementItem) => {
        const size = 0.22;
        const node: DesignNode = {
            id: uid(el.id), type: el.path ? 'icon' : 'shape', name: el.label,
            x: 0.5 - size / 2, y: 0.5 - size / (el.ratio || 1) / 2,
            w: size, h: size / (el.ratio || 1),
            rotation: 0, opacity: 1,
            shape: el.shape || 'rect', path: el.path || null,
            fill: el.defaultFill, radius: 0, stroke: null, strokeWidth: 0,
        } as DesignNode;
        commit({ ...doc, nodes: [...doc.nodes, node] });
        setSelectedIds([node.id]);
    }, [commit, doc]);

    // ── Variables en vivo ──────────────────────────────────────────
    // El panel izquierdo escribe variables; esto las aplica a los nodos que
    // siguen atados a ellas, y a ninguno más.
    const liveVars = useMemo(() => ({
        anios: years,
        mensaje: message,
        imagen: photo || '',
        club: branding?.clubName || '',
        ciudad: branding?.city || '',
        distrito: branding?.district || '',
        gobernador: branding?.governor || '',
        presidente: branding?.president || '',
        periodo: branding?.period || '',
        logo: branding?.logo || '',
    }), [years, message, photo, branding]);

    useEffect(() => {
        setDoc(d => {
            if (!d.nodes.length) return d;
            const nodes = applyVariables(d.nodes, liveVars);
            return nodes === d.nodes || nodes.every((n, i) => n === d.nodes[i]) ? d : { ...d, nodes };
        });
    }, [liveVars]);

    // ── Componer ───────────────────────────────────────────────────
    const runCompose = useCallback(async (opts: { skipAI: boolean; tpl?: string }) => {
        setGenerating(true);
        try {
            const r = await compose({
                templateId: opts.tpl || templateId,
                subjectClubId: club?.id || null,
                skipAI: opts.skipAI,
                overrides: {
                    ...(years ? { anios: years } : {}),
                    ...(opts.skipAI && message ? { mensaje: message } : {}),
                    ...(photo ? { imagen: photo } : {}),
                },
            });
            setDoc(r.document);
            setPast([]); setFuture([]);
            setSelectedIds([]);
            setMissing(r.missing);
            if (r.branding && 'clubName' in r.branding) setBranding(r.branding as Branding);
            if (!opts.skipAI) {
                setCopy(r.copy);
                setMessage(r.copy?.mensaje || '');
                if (r.copy?.degraded) toast.warning(r.copy.note || 'El texto se escribió sin modelo de lenguaje.');
                else toast.success('Diseño generado.');
            }
            if (r.variables?.anios && !years) setYears(r.variables.anios);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo componer el diseño');
        } finally {
            setGenerating(false);
        }
    }, [templateId, club, years, message, photo]);

    // Cambiar de plantilla RECOMPONE, y eso descarta lo que se haya movido a
    // mano — es inevitable: el layout es otro. Se conserva lo que sí se puede
    // conservar (mensaje, foto, años), que es lo que costó trabajo.
    const changeTemplate = useCallback((id: string) => {
        setTemplateId(id);
        if (doc.nodes.length) runCompose({ skipAI: true, tpl: id });
    }, [doc.nodes.length, runCompose]);

    // ── Teclado ────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            // Dentro de un campo de texto los atajos son del campo, no del
            // lienzo: Ctrl+Z tiene que deshacer lo que se está escribiendo.
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
            if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
            if (mod && e.key.toLowerCase() === 'd' && selectedIds.length === 1) { e.preventDefault(); duplicate(selectedIds[0]); return; }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
                e.preventDefault();
                commit({ ...doc, nodes: doc.nodes.filter(n => !selectedIds.includes(n.id) || n.locked) });
                setSelectedIds([]);
                return;
            }
            if (e.key === 'Escape') { setSelectedIds([]); return; }
            if (e.key.startsWith('Arrow') && selectedIds.length) {
                e.preventDefault();
                const step = e.shiftKey ? 0.02 : 0.002;
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                commit({
                    ...doc,
                    nodes: doc.nodes.map(n => selectedIds.includes(n.id) && !n.locked ? { ...n, x: n.x + dx, y: n.y + dy } : n),
                });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [undo, redo, duplicate, commit, doc, selectedIds]);

    // Zoom "ajustar": el lienzo entero visible con un respiro alrededor.
    const fitZoom = useCallback(() => {
        const el = viewportRef.current;
        if (!el) return;
        const fmt = formatOf(doc.format);
        setZoom(Math.min((el.clientWidth - 64) / fmt.width, (el.clientHeight - 64) / fmt.height, 1));
    }, [doc.format]);

    useEffect(() => { fitZoom(); }, [fitZoom]);

    // ── Exportar y guardar ─────────────────────────────────────────
    const title = useMemo(
        () => `${catalog?.templates.find(t => t.id === templateId)?.name || 'Diseño'}${club ? ` · ${club.name}` : ''}`,
        [catalog, templateId, club]
    );

    const doExport = async (format: ExportFormat) => {
        setExportOpen(false);
        setExporting(true);
        try { await exportDocument(doc, { format, title }); toast.success(`Descargado en ${format.toUpperCase()}.`); }
        catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo exportar'); }
        finally { setExporting(false); }
    };

    // Guardar hace DOS cosas y las dos importan: sube el archivo a la
    // Biblioteca Multimedia (la fila de `Media` ES el archivo) y guarda la
    // ficha editable en `DesignProject`. Sin la ficha, el diseño no se puede
    // retomar; sin el archivo, no se puede publicar.
    const save = async () => {
        if (!doc.nodes.length) { toast.warning('Todavía no hay nada que guardar.'); return; }
        setSaving(true);
        try {
            const file = await exportToFile(doc, title);
            const media = await uploadToLibrary(file, club?.id || null);
            const body = {
                title, templateId, category: 'aniversario',
                document: doc, variables: liveVars, branding: branding || {}, copy: copy || {},
                subjectClubId: club?.id || null, imageUrl: media.url, mediaId: media.id,
            };
            const row = currentId ? await updateDesign(currentId, body) : await createDesign(body);
            setCurrentId(row.id);
            setSaved(await listDesigns());
            toast.success('Guardado en la Biblioteca Multimedia y en tus diseños.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    const openSaved = (d: SavedDesign) => {
        setDoc(d.document); setTemplateId(d.templateId); setCurrentId(d.id);
        setMessage(d.variables?.mensaje || ''); setYears(d.variables?.anios || '');
        setPhoto(d.variables?.imagen || null); setCopy(d.copy || null);
        setPast([]); setFuture([]); setSelectedIds([]); setShowSaved(false);
        toast.success('Diseño abierto.');
    };

    const removeSaved = async (id: string) => {
        try {
            await deleteDesign(id);
            setSaved(s => s.filter(d => d.id !== id));
            if (currentId === id) setCurrentId(null);
        } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo eliminar'); }
    };

    const fmt = formatOf(doc.format);
    const btn = 'p-2 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors';

    return (
        <div className="flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 260px)', minHeight: 620 }}>
            {/* ── Barra de herramientas ────────────────────────────── */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white shrink-0 flex-wrap">
                <button className={btn} onClick={undo} disabled={!past.length} title="Deshacer (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
                <button className={btn} onClick={redo} disabled={!future.length} title="Rehacer (Ctrl+Shift+Z)"><Redo2 className="w-4 h-4" /></button>
                <span className="w-px h-5 bg-gray-200 mx-1" />
                <button className={btn} onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} title="Alejar"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-xs font-bold text-gray-500 w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <button className={btn} onClick={() => setZoom(z => Math.min(3, z + 0.1))} title="Acercar"><ZoomIn className="w-4 h-4" /></button>
                <button className={btn} onClick={fitZoom} title="Ajustar a la ventana"><Maximize2 className="w-4 h-4" /></button>
                <button className={`${btn} ${showGuides ? 'bg-indigo-50 text-indigo-600' : ''}`} onClick={() => setShowGuides(g => !g)} title="Guías, márgenes y área segura"><Grid3x3 className="w-4 h-4" /></button>
                <span className="w-px h-5 bg-gray-200 mx-1" />
                <button className={btn} onClick={() => alignSelection('x')} disabled={!selectedIds.length} title="Centrar horizontalmente"><AlignHorizontalJustifyCenter className="w-4 h-4" /></button>
                <button className={btn} onClick={() => alignSelection('y')} disabled={!selectedIds.length} title="Centrar verticalmente"><AlignVerticalJustifyCenter className="w-4 h-4" /></button>
                <button className={btn} onClick={() => selectedIds[0] && duplicate(selectedIds[0])} disabled={selectedIds.length !== 1} title="Duplicar (Ctrl+D)"><Copy className="w-4 h-4" /></button>
                <button className={btn} onClick={() => selectedIds[0] && removeNode(selectedIds[0])} disabled={selectedIds.length !== 1} title="Eliminar (Supr)"><Trash2 className="w-4 h-4" /></button>

                <span className="ml-auto text-[11px] font-bold text-gray-400 mr-2 hidden sm:inline">
                    {fmt.label} · {fmt.width}×{fmt.height} px · {fmt.networks.slice(0, 3).join(', ')}
                </span>

                <button onClick={() => setShowSaved(s => !s)} className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-indigo-600 px-2.5 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                    <FolderOpen className="w-4 h-4" /> Mis diseños{saved.length > 0 && <span className="text-gray-400">({saved.length})</span>}
                </button>
                <button onClick={save} disabled={saving || !doc.nodes.length}
                    className="flex items-center gap-1.5 text-xs font-bold border border-gray-300 hover:border-indigo-400 disabled:opacity-40 rounded-lg px-3 py-2 text-gray-700 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                </button>
                <div className="relative">
                    <button onClick={() => setExportOpen(o => !o)} disabled={exporting || !doc.nodes.length}
                        className="flex items-center gap-1.5 text-xs font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg px-3.5 py-2 transition-colors">
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar
                    </button>
                    {exportOpen && (
                        <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-40 py-1">
                            {([
                                ['png', 'PNG', `${fmt.width * 2}×${fmt.height * 2} px`, FileImage],
                                ['jpg', 'JPG', 'más liviano', ImageDown],
                                ['pdf', 'PDF', 'listo para imprimir', FileType2],
                            ] as const).map(([f, label, hint, Icon]) => (
                                <button key={f} onClick={() => doExport(f)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 text-left">
                                    <Icon className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs font-bold text-gray-700">{label}</span>
                                    <span className="ml-auto text-[10px] text-gray-400">{hint}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Mis diseños ──────────────────────────────────────── */}
            {showSaved && (
                <div className="border-b border-gray-200 bg-gray-50 p-3 shrink-0 max-h-40 overflow-y-auto">
                    {saved.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">Todavía no guardaste ningún diseño.</p>
                    ) : (
                        <div className="flex gap-3 flex-wrap">
                            {saved.map(d => (
                                <div key={d.id} className="relative w-28 group">
                                    <button onClick={() => openSaved(d)} className="block w-28 h-28 rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-400 bg-white transition-colors">
                                        {d.imageUrl
                                            ? <img src={d.imageUrl} alt="" className="w-full h-full object-cover" />
                                            : <span className="text-[10px] text-gray-400 flex items-center justify-center h-full">Sin vista previa</span>}
                                    </button>
                                    <p className="mt-1 text-[10px] text-gray-500 truncate">{d.title}</p>
                                    <button onClick={() => removeSaved(d.id)}
                                        className="absolute top-1 right-1 bg-white/90 hover:bg-red-50 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Eliminar">
                                        <Trash2 className="w-3 h-3 text-red-500" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Tres paneles ─────────────────────────────────────── */}
            <div className="flex-1 flex min-h-0">
                <DesignSidebar
                    catalog={catalog}
                    templateId={templateId}
                    onTemplate={changeTemplate}
                    club={club}
                    onClub={(c, b) => { setClub(c); setBranding(b); if (b?.years != null) setYears(String(b.years)); }}
                    branding={branding}
                    years={years}
                    onYears={setYears}
                    message={message}
                    onMessage={setMessage}
                    copy={copy}
                    photo={photo}
                    onPhoto={() => setPickerOpen(true)}
                    onClearPhoto={() => setPhoto(null)}
                    generating={generating}
                    onGenerate={() => runCompose({ skipAI: false })}
                    missing={missing}
                />

                <main ref={viewportRef} className="flex-1 min-w-0 overflow-auto bg-gray-200/70 flex items-center justify-center p-8">
                    {doc.nodes.length === 0 ? (
                        <div className="text-center max-w-sm">
                            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
                                <Sparkles className="w-7 h-7 text-white" />
                            </div>
                            <h3 className="text-base font-black text-gray-800 mb-1">Elegí una plantilla y un club</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                La IA escribe el mensaje con los datos reales del club y armá la pieza desde ahí.
                                Todo lo que veas acá es exactamente lo que se descarga.
                            </p>
                        </div>
                    ) : (
                        <DesignCanvas
                            doc={doc}
                            selectedIds={selectedIds}
                            zoom={zoom}
                            showGuides={showGuides}
                            onSelect={setSelectedIds}
                            onNodesChange={setNodes}
                        />
                    )}
                </main>

                <DesignInspector
                    nodes={doc.nodes}
                    selectedIds={selectedIds}
                    elements={catalog?.elements || []}
                    onSelect={setSelectedIds}
                    onPatch={patchNode}
                    onReorder={reorder}
                    onDelete={removeNode}
                    onDuplicate={duplicate}
                    onAddElement={addElement}
                    onAddText={addText}
                />
            </div>

            {/* Las dos vías de siempre: subir o elegir de la Biblioteca (v4.700). */}
            {pickerOpen && (
                <MediaPicker
                    isOpen={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    maxSelection={1}
                    onSelect={items => {
                        const url = items?.[0]?.url;
                        if (url) {
                            setPhoto(url);
                            // Si la plantilla trae un nodo de foto que se descartó
                            // por no haber imagen, hay que recomponer: el nodo no
                            // existe y `applyVariables` no puede resucitarlo.
                            const hasPhotoNode = doc.nodes.some(n => isImage(n) && (n.srcVar === 'imagen' || n.role === 'foto'));
                            if (doc.nodes.length && !hasPhotoNode) runCompose({ skipAI: true });
                        }
                        setPickerOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default DesignStudio;
