import React, { useEffect, useRef, useState } from 'react';
import { LAYOUT, getOffset, personElementId, computeLogoWidthFrac, type BannerTemplate, type BannerConfig, type Offset } from '../lib/bannerRender';

// Preview DOM del pendón. Usa unidades de container query (cqw/cqh) para que
// escale exactamente igual que la exportación a canvas (misma LAYOUT y mismos
// % de tamaño relativos al ancho). Compartido por el generador público y el
// configurador del admin.
//
// Modo interactivo (estilo Canva): cada elemento (logo, distrito, cada persona,
// pie) se puede seleccionar y arrastrar; el desplazamiento se guarda en
// config.offsets y lo aplica también el canvas/PDF.
interface Props {
    template: Pick<BannerTemplate, 'backgroundUrl' | 'widthCm' | 'heightCm'>;
    config: BannerConfig;
    heightCss?: string;
    className?: string;
    interactive?: boolean;
    lockFooter?: boolean; // si true, el pie no se puede seleccionar/arrastrar (config solo del admin)
    onOffsetsChange?: (offsets: Record<string, Offset>) => void;
}

const BannerPreview: React.FC<Props> = ({ template, config, heightCss = 'min(80vh, 1300px)', className, interactive = false, lockFooter = false, onOffsetsChange }) => {
    const widthCm = template.widthCm || 80;
    const heightCm = template.heightCm || 180;
    const people = (config.people || []).filter(p => p.name?.trim() || p.role?.trim());

    const containerRef = useRef<HTMLDivElement>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    // Drag de grupo: mueve TODOS los seleccionados con el mismo delta.
    const drag = useRef<{ ids: string[]; sx: number; sy: number; base: Record<string, Offset>; elRect?: DOMRect } | null>(null);
    const [dragging, setDragging] = useState(false);
    // Guías activas (snap) durante el arrastre.
    const [guides, setGuides] = useState<{ vc?: boolean; hc?: boolean; ml?: boolean; mr?: boolean; mt?: boolean; mb?: boolean }>({});
    // Dimensiones naturales del logo (para normalizar su tamaño por área).
    const [logoDims, setLogoDims] = useState<{ w: number; h: number } | null>(null);
    useEffect(() => { setLogoDims(null); }, [config.logo?.url]);
    const logoFw = computeLogoWidthFrac(logoDims?.w || 0, logoDims?.h || 0, config.logo?.scale ?? 1, widthCm, heightCm);

    const margins = { x: config.margins?.x ?? 6, y: config.margins?.y ?? 4 };
    const anyMarginGuide = !!(guides.ml || guides.mr || guides.mt || guides.mb);

    useEffect(() => {
        if (!dragging) return;
        const SNAP = 7; // px
        const onMove = (e: PointerEvent) => {
            const d = drag.current; const c = containerRef.current?.getBoundingClientRect();
            if (!d || !c) return;
            let dxPx = e.clientX - d.sx, dyPx = e.clientY - d.sy;
            const g: typeof guides = {};
            // Snap solo cuando se arrastra un único elemento (centrar/alinear).
            if (d.ids.length === 1 && d.elRect) {
                const r = d.elRect;
                const cCx = c.left + c.width / 2, cCy = c.top + c.height / 2;
                const mxPx = (margins.x / 100) * c.width, myPx = (margins.y / 100) * c.height;
                const mL = c.left + mxPx, mR = c.right - mxPx, mT = c.top + myPx, mB = c.bottom - myPx;
                const predL = r.left + dxPx, predT = r.top + dyPx, predR = predL + r.width, predB = predT + r.height;
                const predCx = predL + r.width / 2, predCy = predT + r.height / 2;
                if (Math.abs(predCx - cCx) <= SNAP) { dxPx += cCx - predCx; g.vc = true; }
                else if (Math.abs(predL - mL) <= SNAP) { dxPx += mL - predL; g.ml = true; }
                else if (Math.abs(predR - mR) <= SNAP) { dxPx += mR - predR; g.mr = true; }
                if (Math.abs(predCy - cCy) <= SNAP) { dyPx += cCy - predCy; g.hc = true; }
                else if (Math.abs(predT - mT) <= SNAP) { dyPx += mT - predT; g.mt = true; }
                else if (Math.abs(predB - mB) <= SNAP) { dyPx += mB - predB; g.mb = true; }
            }
            setGuides(g);
            const ddx = (dxPx / c.width) * 100, ddy = (dyPx / c.height) * 100;
            const next = { ...(config.offsets || {}) };
            for (const id of d.ids) next[id] = { x: d.base[id].x + ddx, y: d.base[id].y + ddy };
            onOffsetsChange?.(next);
        };
        const onUp = () => { setDragging(false); drag.current = null; setGuides({}); };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, [dragging, config.offsets, config.margins, onOffsetsChange]);

    const startDrag = (id: string) => (e: React.PointerEvent) => {
        if (!interactive) return;
        e.stopPropagation();
        const multi = e.shiftKey || e.metaKey || e.ctrlKey;
        if (multi) {
            // Shift/Ctrl/Cmd+clic: suma o quita de la selección (sin arrastrar).
            setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
            return;
        }
        // Clic normal: si el elemento ya está dentro de una multiselección, se
        // arrastra todo el grupo; si no, queda seleccionado solo él.
        const ids = (selectedIds.includes(id) && selectedIds.length > 1) ? selectedIds : [id];
        if (ids.length === 1) setSelectedIds([id]);
        const base: Record<string, Offset> = {};
        ids.forEach(k => { base[k] = getOffset(config, k); });
        const elRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        drag.current = { ids, sx: e.clientX, sy: e.clientY, base, elRect };
        setDragging(true);
    };

    // transform = base (centrado, etc.) + offset manual.
    const tf = (id: string, base = '') => {
        const o = getOffset(config, id);
        const t = `translate(${o.x}cqw, ${o.y}cqh)`;
        return base ? `${base} ${t}` : t;
    };
    const sel = (id: string): React.CSSProperties => !interactive ? {} : {
        cursor: 'move',
        ...(selectedIds.includes(id) ? { outline: '0.45cqw dashed #6366f1', outlineOffset: '0.5cqw', borderRadius: '0.5cqw' } : {}),
    };

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden select-none ${className || ''}`}
            style={{ aspectRatio: `${widthCm} / ${heightCm}`, height: heightCss, containerType: 'size' } as React.CSSProperties}
            onPointerDown={() => interactive && setSelectedIds([])}
        >
            {/* Fondo */}
            {template.backgroundUrl ? (
                <img src={template.backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} style={{ pointerEvents: 'none' }} />
            ) : (
                <div className="absolute inset-0" style={{ background: '#16357e', pointerEvents: 'none' }}>
                    <div className="absolute" style={{ left: '5%', right: '5%', top: '4%', height: '80%', background: '#eef1f6', borderRadius: '6cqw' }} />
                </div>
            )}

            {/* Cabecera: logo del club (subido) + distrito */}
            <div style={{ position: 'absolute', left: '50%', top: `${LAYOUT.logoTopFracH * 100}cqh`, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '90cqw' }}>
                {config.logo?.url ? (
                    <img src={config.logo.url} alt="Logo del club" draggable={false} onPointerDown={startDrag('logo')}
                        onLoad={e => setLogoDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                        style={{ width: `${logoFw * 100}cqw`, height: 'auto', transform: tf('logo'), ...sel('logo') }} />
                ) : interactive ? (
                    <div onPointerDown={startDrag('logo')} style={{
                        width: `${LAYOUT.logoWidthFracW * 100}cqw`, height: `${LAYOUT.logoMaxHeightFracH * 100}cqh`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                        border: '0.4cqw dashed rgba(100,116,139,0.7)', borderRadius: '1.5cqw', color: '#64748b',
                        fontSize: '3.2cqw', fontFamily: 'Arial, Helvetica, sans-serif', transform: tf('logo'), ...sel('logo'),
                    }}>Subí el logo del club</div>
                ) : null}
            </div>

            {/* Cuerpo: lista de personas */}
            <div style={{
                position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                top: `${LAYOUT.bodyTopFracH * 100}cqh`, height: `${(LAYOUT.bodyBottomFracH - LAYOUT.bodyTopFracH) * 100}cqh`,
                width: `${(1 - 2 * LAYOUT.sideFracW) * 100}cqw`,
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                gap: `${config.sizes.name * LAYOUT.personGapEm}cqw`, textAlign: 'center',
            }}>
                {people.map((p, i) => {
                    const id = personElementId(i);
                    return (
                        <div key={i} onPointerDown={startDrag(id)} style={{ width: '100%', fontFamily: 'Arial, Helvetica, sans-serif', transform: tf(id), ...sel(id) }}>
                            <div style={{ color: config.colors.name, fontSize: `${config.sizes.name}cqw`, fontWeight: 800, lineHeight: LAYOUT.lineHeight }}>{p.name}</div>
                            {p.role?.trim() && <div style={{ color: config.colors.role, fontSize: `${config.sizes.role}cqw`, fontWeight: 600, lineHeight: LAYOUT.lineHeight, marginTop: `${config.sizes.name * LAYOUT.nameToRoleEm}cqw` }}>{p.role}</div>}
                            {p.period?.trim() && <div style={{ color: config.colors.period, fontSize: `${config.sizes.period}cqw`, fontWeight: 400, lineHeight: LAYOUT.lineHeight, marginTop: `${config.sizes.role * LAYOUT.roleToPeriodEm}cqw` }}>{p.period}</div>}
                        </div>
                    );
                })}
            </div>

            {/* Pie: solo el logo (configurable únicamente desde el admin) */}
            {config.footer.show && (config.footer.logoUrl || (interactive && !lockFooter)) && (
                <div onPointerDown={lockFooter ? undefined : startDrag('footer')} style={{
                    position: 'absolute', left: '50%', top: `${LAYOUT.footerCenterFracH * 100}cqh`,
                    transform: tf('footer', 'translate(-50%, -50%)'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    ...(lockFooter ? {} : sel('footer')),
                }}>
                    {config.footer.logoUrl ? (
                        <img src={config.footer.logoUrl} alt="Logo del pie" draggable={false}
                            style={{ maxWidth: `${LAYOUT.footerLogoWidthFracW * (config.footer.logoScale ?? 1) * 100}cqw`, maxHeight: `${LAYOUT.footerLogoMaxHeightFracH * (config.footer.logoScale ?? 1) * 100}cqh`, objectFit: 'contain' }} />
                    ) : (
                        <div style={{ width: `${LAYOUT.footerLogoWidthFracW * 100}cqw`, height: `${LAYOUT.footerLogoMaxHeightFracH * 100}cqh`, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: '0.3cqw dashed rgba(255,255,255,0.7)', borderRadius: '1cqw', color: 'rgba(255,255,255,0.85)', fontSize: '2.2cqw', fontFamily: 'Arial, Helvetica, sans-serif' }}>Subí el logo del pie</div>
                    )}
                </div>
            )}

            {/* Reglas / guías (solo en edición; no se exportan al PDF) */}
            {interactive && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {/* Recuadro de márgenes */}
                    <div style={{
                        position: 'absolute', left: `${margins.x}%`, right: `${margins.x}%`, top: `${margins.y}%`, bottom: `${margins.y}%`,
                        border: `0.25cqw dashed ${anyMarginGuide ? '#ec4899' : 'rgba(99,102,241,0.35)'}`, borderRadius: '0.5cqw',
                    }} />
                    {/* Líneas de centro (al seleccionar/arrastrar) */}
                    {(dragging || selectedIds.length > 0) && (
                        <>
                            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeft: `0.25cqw ${guides.vc ? 'solid #ec4899' : 'dashed rgba(99,102,241,0.45)'}` }} />
                            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: `0.25cqw ${guides.hc ? 'solid #ec4899' : 'dashed rgba(99,102,241,0.45)'}` }} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default BannerPreview;
