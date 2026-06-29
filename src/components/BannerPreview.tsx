import React, { useEffect, useRef, useState } from 'react';
import { LAYOUT, getOffset, personElementId, type BannerTemplate, type BannerConfig, type Offset } from '../lib/bannerRender';
import { logoDataUrl } from '../lib/rotaryLogo';

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
    onOffsetsChange?: (offsets: Record<string, Offset>) => void;
}

const BannerPreview: React.FC<Props> = ({ template, config, heightCss = 'min(80vh, 1300px)', className, interactive = false, onOffsetsChange }) => {
    const widthCm = template.widthCm || 80;
    const heightCm = template.heightCm || 180;
    const people = (config.people || []).filter(p => p.name?.trim() || p.role?.trim());

    const containerRef = useRef<HTMLDivElement>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const drag = useRef<{ id: string; sx: number; sy: number; bx: number; by: number } | null>(null);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: PointerEvent) => {
            const d = drag.current; const rect = containerRef.current?.getBoundingClientRect();
            if (!d || !rect) return;
            const nx = d.bx + ((e.clientX - d.sx) / rect.width) * 100;
            const ny = d.by + ((e.clientY - d.sy) / rect.height) * 100;
            onOffsetsChange?.({ ...(config.offsets || {}), [d.id]: { x: nx, y: ny } });
        };
        const onUp = () => { setDragging(false); drag.current = null; };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, [dragging, config.offsets, onOffsetsChange]);

    const startDrag = (id: string) => (e: React.PointerEvent) => {
        if (!interactive) return;
        e.stopPropagation();
        const o = getOffset(config, id);
        drag.current = { id, sx: e.clientX, sy: e.clientY, bx: o.x, by: o.y };
        setSelected(id);
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
        ...(selected === id ? { outline: '0.45cqw dashed #6366f1', outlineOffset: '0.5cqw', borderRadius: '0.5cqw' } : {}),
    };

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden select-none ${className || ''}`}
            style={{ aspectRatio: `${widthCm} / ${heightCm}`, height: heightCss, containerType: 'size' } as React.CSSProperties}
            onPointerDown={() => interactive && setSelected(null)}
        >
            {/* Fondo */}
            {template.backgroundUrl ? (
                <img src={template.backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} style={{ pointerEvents: 'none' }} />
            ) : (
                <div className="absolute inset-0" style={{ background: '#16357e', pointerEvents: 'none' }}>
                    <div className="absolute" style={{ left: '5%', right: '5%', top: '4%', height: '80%', background: '#eef1f6', borderRadius: '6cqw' }} />
                </div>
            )}

            {/* Cabecera: logo + distrito */}
            <div style={{ position: 'absolute', left: '50%', top: `${LAYOUT.logoTopFracH * 100}cqh`, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '90cqw' }}>
                <img src={logoDataUrl(config.logo.variant, config.logo.color)} alt="Rotary" draggable={false}
                    onPointerDown={startDrag('logo')}
                    style={{ width: `${LAYOUT.logoWidthFracW * 100}cqw`, height: 'auto', transform: tf('logo'), ...sel('logo') }} />
                {config.header.district?.trim() && (
                    <div onPointerDown={startDrag('district')} style={{
                        marginTop: `${LAYOUT.districtGapFracH * (heightCm / widthCm) * 100}cqw`,
                        color: config.header.color, fontSize: `${config.header.sizePct}cqw`, fontWeight: 600,
                        fontFamily: 'Arial, Helvetica, sans-serif', transform: tf('district'), ...sel('district'),
                    }}>{config.header.district}</div>
                )}
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

            {/* Pie */}
            {config.footer.show && (
                <div onPointerDown={startDrag('footer')} style={{
                    position: 'absolute', left: '50%', top: `${LAYOUT.footerCenterFracH * 100}cqh`,
                    transform: tf('footer', 'translate(-50%, -50%)'), width: '84cqw',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3cqw',
                    fontFamily: 'Arial, Helvetica, sans-serif', ...sel('footer'),
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <img src={logoDataUrl('completo', 'blanco')} alt="Rotary" draggable={false} style={{ width: `${LAYOUT.footerLogoWidthFracW * 100}cqw`, height: 'auto' }} />
                        {config.footer.district?.trim() && <div style={{ color: '#fff', fontSize: `${LAYOUT.footerDistrictSizePct}cqw`, fontWeight: 500, marginTop: '0.6cqw', paddingLeft: '3cqw' }}>{config.footer.district}</div>}
                    </div>
                    <div style={{ width: '0.35cqw', height: `${LAYOUT.footerTaglineSizePct * 2.6}cqw`, background: 'rgba(255,255,255,0.6)' }} />
                    {config.footer.tagline?.trim() && <div style={{ color: '#fff', fontSize: `${LAYOUT.footerTaglineSizePct}cqw`, fontWeight: 800, fontStyle: 'italic', lineHeight: 1.12, maxWidth: '36cqw', textAlign: 'left' }}>{config.footer.tagline}</div>}
                </div>
            )}
        </div>
    );
};

export default BannerPreview;
