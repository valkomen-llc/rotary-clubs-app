import React from 'react';
import { LAYOUT, type BannerTemplate, type BannerConfig } from '../lib/bannerRender';
import { logoDataUrl } from '../lib/rotaryLogo';

// Preview DOM del pendón. Usa unidades de container query (cqw/cqh) para que
// escale exactamente igual que la exportación a canvas (misma LAYOUT).
// Compartido por el generador público y el configurador del admin.
interface Props {
    template: Pick<BannerTemplate, 'backgroundUrl' | 'widthCm' | 'heightCm'>;
    config: BannerConfig;
    heightCss?: string;
    className?: string;
}

const BannerPreview: React.FC<Props> = ({ template, config, heightCss = 'min(78vh, 1300px)', className }) => {
    const widthCm = template.widthCm || 80;
    const heightCm = template.heightCm || 180;
    const align = config.title.align;
    const flexAlign = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

    const logoTop = config.logo.placement === 'center'
        ? `${LAYOUT.logoCenterFracH * 100}cqh`
        : `${LAYOUT.logoTopFracH * 100}cqh`;
    const logoTransform = config.logo.placement === 'center' ? 'translate(-50%, -50%)' : 'translateX(-50%)';
    const textTop = (config.logo.placement === 'center' ? LAYOUT.textTopFracH_center : LAYOUT.textTopFracH_top) * 100;

    return (
        <div
            className={`relative bg-white shadow-2xl overflow-hidden ${className || ''}`}
            style={{
                aspectRatio: `${widthCm} / ${heightCm}`,
                height: heightCss,
                containerType: 'size',
            } as React.CSSProperties}
        >
            {template.backgroundUrl ? (
                <img src={template.backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-slate-200" />
            )}

            <img
                src={logoDataUrl(config.logo.variant, config.logo.color)}
                alt="Rotary"
                draggable={false}
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: logoTop,
                    transform: logoTransform,
                    width: `${LAYOUT.logoWidthFracW * 100}cqw`,
                    height: 'auto',
                }}
            />

            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: `${textTop}cqh`,
                    transform: 'translateX(-50%)',
                    width: `${(1 - 2 * LAYOUT.textSideFracW) * 100}cqw`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: flexAlign,
                    textAlign: align,
                }}
            >
                {config.title.text?.trim() && (
                    <div style={{
                        color: config.title.color,
                        fontSize: `${config.title.sizePct}cqw`,
                        fontWeight: 800,
                        lineHeight: LAYOUT.lineHeight,
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        width: '100%',
                    }}>{config.title.text}</div>
                )}
                {config.subtitle.text?.trim() && (
                    <div style={{
                        color: config.subtitle.color,
                        fontSize: `${config.subtitle.sizePct}cqw`,
                        fontWeight: 600,
                        lineHeight: LAYOUT.lineHeight,
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        marginTop: `${config.subtitle.sizePct * LAYOUT.subGapFracOfSub}cqw`,
                        width: '100%',
                    }}>{config.subtitle.text}</div>
                )}
            </div>
        </div>
    );
};

export default BannerPreview;
