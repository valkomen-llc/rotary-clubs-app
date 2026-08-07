// ════════════════════════════════════════════════════════════════════
// Plantillas IA — la mesa de trabajo
// v4.726.0
//
// Seleccionar, mover, redimensionar, rotar, alinear y ordenar capas. Es la
// mitad visible del módulo; la otra es `designRender.ts`, que dibuja LOS MISMOS
// nodos para exportar.
//
// ── LA ESCENA SE PINTA A TAMAÑO NOMINAL Y SE ESCALA CON CSS ─────────
//
// El lienzo interno mide exactamente lo que mide el formato (1080×1080) y el
// zoom es un `transform: scale()` sobre el conjunto. Todo el cálculo interno
// —posiciones, tamaños de fuente, reparto de líneas— ocurre en píxeles del
// formato, que son LOS MISMOS que usa el exportador con `scale: 1`.
//
// La alternativa era el camino del Generador de Pendones: unidades de container
// query (cqw/cqh) proporcionales al ancho del contenedor. Funciona con tres
// elementos fijos, pero obliga a que cada medida exista en dos sistemas
// distintos y a confiar en que se comporten igual. Acá hay un solo sistema y el
// zoom no participa de ninguna cuenta salvo la conversión del puntero.
//
// ── EL TEXTO NO LO REPARTE EL NAVEGADOR ─────────────────────────────
//
// Cada nodo de texto se pinta LÍNEA POR LÍNEA con el reparto que devuelve
// `layoutFor`. Dejar que el navegador ajuste el texto sería más corto de
// escribir y rompería el WYSIWYG: el algoritmo de saltos de línea de CSS no es
// el mismo que el del canvas, así que un título de dos líneas en pantalla
// podría salir de tres en el archivo descargado. Es el mismo motivo por el que
// `layoutText` recibe el medidor inyectado.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    formatOf, fontStack, isText, isImage, isGradient,
    layoutFor, verticalOffset, shapePath, visibleNodes,
    SAFE_AREA, MARGIN, SNAP_PX,
    type DesignDocument, type DesignNode, type ImageNode, type ShapeNode, type Fill,
} from '../../../lib/designSpec';
import { displayUrl } from '../../../lib/designRender';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Un hueco que todavía no tiene contenido, con su etiqueta. En fracciones del
 *  lienzo, igual que un nodo — pero NO es un nodo, y ésa es toda la diferencia:
 *  no se exporta. */
export interface SlotHint {
    id: string; x: number; y: number; w: number; h: number; label: string;
    /** La imagen con la que se diseñó, SÓLO como ilustración: se dibuja dentro
     *  de la guía, atenuada y rotulada como ejemplo. No es el contenido del
     *  nodo —ése sigue vacío— y por lo tanto no se exporta. */
    sample?: string | null;
}

interface Props {
    doc: DesignDocument;
    selectedIds?: string[];
    zoom: number;
    showGuides?: boolean;
    /** El portal público lo usa en SÓLO LECTURA: misma vista previa, sin
     *  selección, sin tiradores y sin arrastre. Reutilizarlo es lo que impide
     *  que aparezca un segundo camino de maquetación — la duplicación que este
     *  módulo existe para evitar. */
    interactive?: boolean;
    /** Recuadros que marcan DÓNDE va a caer un dato que todavía está vacío.
     *
     *  No son nodos y por eso no se exportan nunca: el exportador lee
     *  `doc.nodes` y esto se dibuja aparte, igual que los márgenes y el área
     *  segura. Es lo que permite que el portal público enseñe el sitio del
     *  logotipo sin meterlo en el archivo que se descarga. */
    hints?: SlotHint[];
    onSelect?: (ids: string[]) => void;
    /** Cambio en curso (arrastre): no entra en el historial hasta soltar. */
    onNodesChange?: (nodes: DesignNode[], commit: boolean) => void;
}

interface DragState {
    mode: 'move' | 'resize' | 'rotate';
    handle?: Handle;
    startX: number; startY: number;
    base: Record<string, { x: number; y: number; w: number; h: number; rotation: number }>;
    ids: string[];
    centerX?: number; centerY?: number; startAngle?: number;
}

const cssFill = (fill: Fill): string => {
    if (!isGradient(fill)) return fill;
    const stops = fill.stops.map(s => `${s.color} ${Math.round(s.at * 100)}%`).join(', ');
    return fill.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${(fill.angle || 0) + 90}deg, ${stops})`;
};

const DesignCanvas: React.FC<Props> = ({
    doc, selectedIds = [], zoom, showGuides = true, interactive = true, hints, onSelect, onNodesChange,
}) => {
    const fmt = formatOf(doc.format);
    const W = fmt.width, H = fmt.height;

    const stageRef = useRef<HTMLDivElement>(null);
    const drag = useRef<DragState | null>(null);
    const [dragging, setDragging] = useState(false);
    const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

    const nodeById = useMemo(() => new Map(doc.nodes.map(n => [n.id, n])), [doc.nodes]);
    const selected = useMemo(() => selectedIds.map(id => nodeById.get(id)).filter(Boolean) as DesignNode[], [selectedIds, nodeById]);

    // Recuadro que envuelve a TODA la selección, en fracciones. Con un solo
    // nodo es su propio recuadro; con varios, el que los contiene — que es lo
    // que hace falta para dibujar un marco de grupo.
    const bounds = useMemo(() => {
        if (!selected.length) return null;
        const x0 = Math.min(...selected.map(n => n.x));
        const y0 = Math.min(...selected.map(n => n.y));
        const x1 = Math.max(...selected.map(n => n.x + n.w));
        const y1 = Math.max(...selected.map(n => n.y + n.h));
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }, [selected]);

    // ── Líneas a las que engancharse ───────────────────────────────
    // El lienzo (bordes, centro), los márgenes, el área segura y los bordes y
    // centros de los nodos NO seleccionados. Sin esas últimas, alinear dos
    // textos entre sí sería a ojo.
    const snapLines = useMemo(() => {
        const v = [0, 0.5, 1, MARGIN, 1 - MARGIN, SAFE_AREA, 1 - SAFE_AREA];
        const h = [0, 0.5, 1, MARGIN, 1 - MARGIN, SAFE_AREA, 1 - SAFE_AREA];
        for (const n of doc.nodes) {
            if (selectedIds.includes(n.id) || n.hidden) continue;
            v.push(n.x, n.x + n.w / 2, n.x + n.w);
            h.push(n.y, n.y + n.h / 2, n.y + n.h);
        }
        return { v, h };
    }, [doc.nodes, selectedIds]);

    const snap = useCallback((value: number, lines: number[], tol: number) => {
        let best = value, dist = tol;
        for (const l of lines) {
            const d = Math.abs(value - l);
            if (d < dist) { dist = d; best = l; }
        }
        return { value: best, hit: best !== value ? best : null };
    }, []);

    // ── Arrastre ───────────────────────────────────────────────────
    useEffect(() => {
        if (!dragging) return;

        const onMove = (e: PointerEvent) => {
            const d = drag.current;
            if (!d) return;
            // El zoom sólo participa acá: convertir el movimiento de pantalla a
            // unidades del lienzo. De ahí en adelante todo es nominal.
            const dx = (e.clientX - d.startX) / zoom / W;
            const dy = (e.clientY - d.startY) / zoom / H;
            const tol = SNAP_PX / zoom / Math.min(W, H);
            const hitsV: number[] = [], hitsH: number[] = [];

            const next = doc.nodes.map(node => {
                const b = d.base[node.id];
                if (!b) return node;

                if (d.mode === 'move') {
                    let nx = b.x + dx, ny = b.y + dy;
                    // Se engancha por el borde izquierdo, el centro o el
                    // derecho: el que esté más cerca gana. Con varios nodos
                    // seleccionados no se engancha nada — el grupo se mueve en
                    // bloque y ajustar uno desalinearía los demás.
                    if (d.ids.length === 1 && !e.altKey) {
                        const cands = [[nx, 0], [nx + node.w / 2, node.w / 2], [nx + node.w, node.w]] as const;
                        let bestDelta = Infinity, applied: number | null = null, line: number | null = null;
                        for (const [pos, off] of cands) {
                            const s = snap(pos, snapLines.v, tol);
                            if (s.hit !== null && Math.abs(s.value - pos) < bestDelta) { bestDelta = Math.abs(s.value - pos); applied = s.value - off; line = s.hit; }
                        }
                        if (applied !== null) { nx = applied; if (line !== null) hitsV.push(line); }

                        const candsY = [[ny, 0], [ny + node.h / 2, node.h / 2], [ny + node.h, node.h]] as const;
                        let bestDy = Infinity, appliedY: number | null = null, lineY: number | null = null;
                        for (const [pos, off] of candsY) {
                            const s = snap(pos, snapLines.h, tol);
                            if (s.hit !== null && Math.abs(s.value - pos) < bestDy) { bestDy = Math.abs(s.value - pos); appliedY = s.value - off; lineY = s.hit; }
                        }
                        if (appliedY !== null) { ny = appliedY; if (lineY !== null) hitsH.push(lineY); }
                    }
                    return { ...node, x: nx, y: ny };
                }

                if (d.mode === 'resize' && d.handle) {
                    const hd = d.handle;
                    let { x, y, w, h } = b;
                    const MIN = 0.015;
                    if (node.rotation) {
                        // Rotado, el redimensionado conserva el CENTRO. Anclar
                        // la esquina opuesta con el nodo girado hace que el
                        // elemento se desplace mientras se estira, que es
                        // exactamente lo que nadie espera.
                        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                        if (hd.includes('e')) w = Math.max(MIN, b.w + dx * 2);
                        if (hd.includes('w')) w = Math.max(MIN, b.w - dx * 2);
                        if (hd.includes('s')) h = Math.max(MIN, b.h + dy * 2);
                        if (hd.includes('n')) h = Math.max(MIN, b.h - dy * 2);
                        x = cx - w / 2; y = cy - h / 2;
                    } else {
                        if (hd.includes('e')) w = Math.max(MIN, b.w + dx);
                        if (hd.includes('s')) h = Math.max(MIN, b.h + dy);
                        if (hd.includes('w')) { w = Math.max(MIN, b.w - dx); x = b.x + b.w - w; }
                        if (hd.includes('n')) { h = Math.max(MIN, b.h - dy); y = b.y + b.h - h; }
                        // Shift mantiene la proporción — imprescindible con una
                        // fotografía o un logotipo.
                        if (e.shiftKey && (hd === 'nw' || hd === 'ne' || hd === 'se' || hd === 'sw')) {
                            const ratio = b.w / b.h;
                            h = w / ratio;
                            if (hd.includes('n')) y = b.y + b.h - h;
                        }
                    }
                    return { ...node, x, y, w, h };
                }

                if (d.mode === 'rotate' && d.centerX !== undefined && d.centerY !== undefined) {
                    const ang = Math.atan2(e.clientY - d.centerY, e.clientX - d.centerX) * 180 / Math.PI;
                    let rot = b.rotation + (ang - (d.startAngle || 0));
                    // Shift fija de 15 en 15 grados: sin eso, dejar algo
                    // perfectamente derecho a mano es imposible.
                    if (e.shiftKey) rot = Math.round(rot / 15) * 15;
                    return { ...node, rotation: ((rot % 360) + 360) % 360 };
                }
                return node;
            });

            setGuides({ v: hitsV, h: hitsH });
            onNodesChange?.(next, false);
        };

        const onUp = () => {
            setDragging(false);
            drag.current = null;
            setGuides({ v: [], h: [] });
            // Sólo al soltar entra en el historial: si cada píxel del arrastre
            // fuera un paso, deshacer una vez retrocedería un píxel.
            onNodesChange?.(doc.nodes, true);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [dragging, doc.nodes, zoom, W, H, snapLines, snap, onNodesChange]);

    const captureBase = (ids: string[]) => {
        const base: DragState['base'] = {};
        for (const id of ids) {
            const n = nodeById.get(id);
            if (n) base[id] = { x: n.x, y: n.y, w: n.w, h: n.h, rotation: n.rotation };
        }
        return base;
    };

    const startMove = (node: DesignNode) => (e: React.PointerEvent) => {
        if (!interactive || node.locked) return;
        e.stopPropagation();
        const multi = e.shiftKey || e.metaKey || e.ctrlKey;
        if (multi) {
            onSelect?.(selectedIds.includes(node.id) ? selectedIds.filter(i => i !== node.id) : [...selectedIds, node.id]);
            return;
        }
        const ids = selectedIds.includes(node.id) && selectedIds.length > 1 ? selectedIds : [node.id];
        if (ids.length === 1) onSelect?.([node.id]);
        drag.current = { mode: 'move', startX: e.clientX, startY: e.clientY, base: captureBase(ids), ids };
        setDragging(true);
    };

    const startResize = (handle: Handle) => (e: React.PointerEvent) => {
        e.stopPropagation();
        const ids = selectedIds.filter(id => !nodeById.get(id)?.locked);
        if (!ids.length) return;
        drag.current = { mode: 'resize', handle, startX: e.clientX, startY: e.clientY, base: captureBase(ids), ids };
        setDragging(true);
    };

    const startRotate = (e: React.PointerEvent) => {
        e.stopPropagation();
        const ids = selectedIds.filter(id => !nodeById.get(id)?.locked);
        if (!ids.length || !bounds || !stageRef.current) return;
        const r = stageRef.current.getBoundingClientRect();
        const centerX = r.left + (bounds.x + bounds.w / 2) * r.width;
        const centerY = r.top + (bounds.y + bounds.h / 2) * r.height;
        drag.current = {
            mode: 'rotate', startX: e.clientX, startY: e.clientY, base: captureBase(ids), ids,
            centerX, centerY, startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI,
        };
        setDragging(true);
    };

    // ── Pintado de un nodo ─────────────────────────────────────────
    const renderNode = (node: DesignNode) => {
        if (node.hidden) return null;
        const style: React.CSSProperties = {
            position: 'absolute',
            left: node.x * W, top: node.y * H, width: node.w * W, height: node.h * H,
            opacity: node.opacity,
            transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
            cursor: !interactive || node.locked ? 'default' : 'move',
            // Los tiradores se dibujan en una capa aparte: si el nodo capturara
            // el puntero sobre ellos, no se podría redimensionar.
            pointerEvents: 'auto',
        };

        if (isText(node)) {
            const layout = layoutFor(node, W, H);
            const top = verticalOffset(node, layout, node.h * H);
            return (
                <div key={node.id} style={style} onPointerDown={startMove(node)} data-node={node.id}>
                    <div style={{
                        position: 'absolute', left: 0, right: 0, top,
                        fontFamily: fontStack(node.fontFamily), fontWeight: node.fontWeight,
                        fontStyle: node.italic ? 'italic' : 'normal',
                        fontSize: layout.fontSize, lineHeight: `${layout.fontSize * node.lineHeight}px`,
                        color: node.color, textAlign: node.align,
                        letterSpacing: node.letterSpacing ? node.letterSpacing * W : undefined,
                        whiteSpace: 'pre', // las líneas ya vienen repartidas
                    }}>
                        {layout.lines.map((line, i) => <div key={i}>{line || ' '}</div>)}
                    </div>
                </div>
            );
        }

        if (isImage(node)) {
            const img = node as ImageNode;
            return (
                <div key={node.id} style={{
                    ...style,
                    borderRadius: img.circle ? '50%' : img.radius ? img.radius * Math.min(node.w * W, node.h * H) : undefined,
                    overflow: 'hidden',
                    background: img.src ? undefined : 'repeating-conic-gradient(#e5e7eb 0% 25%, #f3f4f6 0% 50%) 50% / 24px 24px',
                }} onPointerDown={startMove(node)} data-node={node.id}>
                    {img.src ? (
                        <img src={displayUrl(img.src)} alt="" draggable={false}
                            style={{ width: '100%', height: '100%', objectFit: img.fit, display: 'block', pointerEvents: 'none' }} />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: 22, fontFamily: 'Arial, sans-serif' }}>
                            Sin imagen
                        </div>
                    )}
                </div>
            );
        }

        const sh = node as ShapeNode;
        const w = node.w * W, h = node.h * H;
        // Mismo `d` que usa el exportador con `new Path2D(...)`.
        const d = sh.path ? sh.path : shapePath(sh.shape, w, h, { radius: sh.radius * Math.min(w, h) });
        const gradId = `g_${sh.id.replace(/[^a-zA-Z0-9_]/g, '')}`;
        const grad = isGradient(sh.fill) ? sh.fill : null;
        return (
            <div key={node.id} style={style} onPointerDown={startMove(node)} data-node={node.id}>
                <svg width={w} height={h} viewBox={sh.path ? '0 0 100 100' : `0 0 ${w} ${h}`} preserveAspectRatio="none"
                    style={{ display: 'block', pointerEvents: 'none', overflow: 'visible' }}>
                    {grad && (
                        <defs>
                            <linearGradient id={gradId} gradientTransform={`rotate(${grad.angle || 0} 0.5 0.5)`}>
                                {grad.stops.map((s, i) => <stop key={i} offset={`${s.at * 100}%`} stopColor={s.color} />)}
                            </linearGradient>
                        </defs>
                    )}
                    <path d={d} fill={grad ? `url(#${gradId})` : cssFill(sh.fill)} fillRule="evenodd"
                        stroke={sh.stroke || undefined} strokeWidth={sh.strokeWidth ? sh.strokeWidth * W : undefined} />
                </svg>
            </div>
        );
    };

    const stageW = W * zoom, stageH = H * zoom;

    return (
        <div className="relative" style={{ width: stageW, height: stageH }}>
            <div
                ref={stageRef}
                className="absolute top-0 left-0 origin-top-left shadow-2xl"
                style={{ width: W, height: H, transform: `scale(${zoom})`, background: doc.background, overflow: 'hidden' }}
                onPointerDown={() => interactive && onSelect?.([])}
            >
                {/* La MISMA regla que aplica el exportador. `slots` sólo en el
                    editor: ahí un hueco vacío se tiene que ver para poder
                    seleccionarlo y llenarlo; en el portal y en el archivo, no. */}
                {visibleNodes(doc.nodes, { slots: interactive }).map(renderNode)}

                {/* Guías: se dibujan DENTRO del lienzo y no se exportan nunca —
                    el exportador lee `doc.nodes`, y esto no es un nodo. */}
                {interactive && showGuides && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', left: MARGIN * W, top: MARGIN * H, right: MARGIN * W, bottom: MARGIN * H, border: '1px dashed rgba(99,102,241,0.35)' }} />
                        <div style={{ position: 'absolute', left: SAFE_AREA * W, top: SAFE_AREA * H, right: SAFE_AREA * W, bottom: SAFE_AREA * H, border: '1px dashed rgba(236,72,153,0.25)' }} />
                    </div>
                )}
                {/* Los huecos vacíos, marcados. Van DENTRO del lienzo para
                    caer en el sitio exacto, y aun así fuera del archivo: el
                    exportador dibuja `doc.nodes` y esto no lo es. Sin ellos, el
                    portal público muestra una pieza en blanco y quien la abre no
                    tiene forma de saber dónde va a quedar su logotipo. */}
                {hints && hints.length > 0 && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        {hints.map(h => (
                            <div key={h.id} data-hint={h.id}
                                style={{
                                    position: 'absolute',
                                    left: h.x * W, top: h.y * H, width: h.w * W, height: h.h * H,
                                    border: `${Math.max(2, W * 0.002)}px dashed rgba(99,102,241,0.55)`,
                                    borderRadius: W * 0.008,
                                    background: 'rgba(99,102,241,0.06)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    textAlign: 'center', padding: W * 0.006,
                                    overflow: 'hidden',
                                }}>
                                {/* La imagen con la que se diseñó, como
                                    ILUSTRACIÓN. Va atenuada y con el rótulo
                                    encima para que no se confunda con la propia:
                                    quien mira tiene que entender que ése no es
                                    su logotipo. Se encuadra con `contain`, que
                                    es como lo va a encuadrar el nodo. */}
                                {h.sample && (
                                    <img src={h.sample} alt="" data-hint-sample=""
                                        style={{
                                            position: 'absolute', inset: h.h * H * 0.06,
                                            width: 'auto', height: 'auto',
                                            maxWidth: `calc(100% - ${h.h * H * 0.12}px)`,
                                            maxHeight: `calc(100% - ${h.h * H * 0.12}px)`,
                                            margin: 'auto',
                                            objectFit: 'contain', opacity: 0.4,
                                        }} />
                                )}
                                <span style={{
                                    // Proporcional al lienzo, no en píxeles de
                                    // pantalla: el lienzo se escala con el zoom
                                    // y un tamaño fijo se vería enorme o
                                    // ilegible según cuánto se haya alejado.
                                    position: 'relative',
                                    fontFamily: fontStack('sans'),
                                    fontSize: Math.min(W * 0.022, h.h * H * 0.28),
                                    fontWeight: 700, color: 'rgba(67,56,202,0.9)', lineHeight: 1.15,
                                    // Sobre la imagen atenuada el texto necesita
                                    // su propio respaldo o deja de leerse.
                                    background: h.sample ? 'rgba(255,255,255,0.82)' : undefined,
                                    borderRadius: h.sample ? W * 0.004 : undefined,
                                    padding: h.sample ? `${W * 0.003}px ${W * 0.006}px` : undefined,
                                }}>
                                    {h.label}
                                    {h.sample && (
                                        <span style={{ display: 'block', fontWeight: 600, fontSize: '0.72em', opacity: 0.75 }}>
                                            ejemplo · subí el tuyo
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {dragging && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                        {guides.v.map((g, i) => <div key={`v${i}`} style={{ position: 'absolute', left: g * W, top: 0, bottom: 0, borderLeft: `${1 / zoom}px solid #ec4899` }} />)}
                        {guides.h.map((g, i) => <div key={`h${i}`} style={{ position: 'absolute', top: g * H, left: 0, right: 0, borderTop: `${1 / zoom}px solid #ec4899` }} />)}
                    </div>
                )}
            </div>

            {/* Marco de selección y tiradores. Van FUERA del lienzo escalado
                para que su grosor no crezca con el zoom: un tirador de 8 px que
                al 200 % mide 16 se vuelve impreciso justo cuando se está
                afinando. */}
            {interactive && bounds && (
                <div className="absolute pointer-events-none" style={{
                    left: bounds.x * W * zoom, top: bounds.y * H * zoom,
                    width: bounds.w * W * zoom, height: bounds.h * H * zoom,
                    outline: '1.5px solid #6366f1',
                    transform: selected.length === 1 && selected[0].rotation ? `rotate(${selected[0].rotation}deg)` : undefined,
                }}>
                    {selected.every(n => !n.locked) && (
                        <>
                            {HANDLES.map(hd => (
                                <div key={hd} onPointerDown={startResize(hd)}
                                    className="absolute bg-white border-2 border-indigo-500 rounded-sm pointer-events-auto"
                                    style={{
                                        width: 10, height: 10,
                                        left: hd.includes('w') ? -5 : hd.includes('e') ? undefined : 'calc(50% - 5px)',
                                        right: hd.includes('e') ? -5 : undefined,
                                        top: hd.includes('n') ? -5 : hd.includes('s') ? undefined : 'calc(50% - 5px)',
                                        bottom: hd.includes('s') ? -5 : undefined,
                                        cursor: `${hd}-resize`,
                                    }} />
                            ))}
                            <div onPointerDown={startRotate}
                                className="absolute bg-white border-2 border-indigo-500 rounded-full pointer-events-auto"
                                style={{ width: 12, height: 12, left: 'calc(50% - 6px)', top: -30, cursor: 'grab' }}
                                title="Rotar (Shift para saltos de 15°)" />
                            <div className="absolute bg-indigo-500" style={{ width: 1.5, height: 24, left: 'calc(50% - 0.75px)', top: -24 }} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default DesignCanvas;
