import React from 'react';
import { LAYOUT, type BannerTemplate, type BannerConfig } from '../lib/bannerRender';
import { logoDataUrl } from '../lib/rotaryLogo';

// Preview DOM del pendón. Usa unidades de container query (cqw/cqh) para que
// escale exactamente igual que la exportación a canvas (misma LAYOUT y mismos
// % de tamaño de fuente relativos al ancho). Compartido por el generador
// público y el configurador del admin.
interface Props {
    template: Pick<BannerTemplate, 'backgroundUrl' | 'widthCm' | 'heightCm'>;
    config: BannerConfig;
    heightCss?: string;
    className?: string;
}

const BannerPreview: React.FC<Props> = ({ template, config, heightCss = 'min(80vh, 1300px)', className }) => {
    const widthCm = template.widthCm || 80;
    const heightCm = template.heightCm || 180;
    const people = (config.people || []).filter(p => p.name?.trim() || p.role?.trim());

    return (
        <div
            className={`relative overflow-hidden ${className || ''}`}
            style={{
                aspectRatio: `${widthCm} / ${heightCm}`,
                height: heightCss,
                containerType: 'size',
            } as React.CSSProperties}
        >
            {/* Fondo */}
            {template.backgroundUrl ? (
                <img src={template.backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
            ) : (
                <div className="absolute inset-0" style={{ background: '#16357e' }}>
                    <div className="absolute" style={{ left: '5%', right: '5%', top: '4%', height: '80%', background: '#eef1f6', borderRadius: '6cqw' }} />
                </div>
            )}

            {/* Cabecera: logo + distrito */}
            <div style={{
                position: 'absolute', left: '50%', top: `${LAYOUT.logoTopFracH * 100}cqh`,
                transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '90cqw',
            }}>
                <img src={logoDataUrl(config.logo.variant, config.logo.color)} alt="Rotary"
                    draggable={false} style={{ width: `${LAYOUT.logoWidthFracW * 100}cqw`, height: 'auto' }} />
                {config.header.district?.trim() && (
                    <div style={{
                        marginTop: `${LAYOUT.districtGapFracH * (heightCm / widthCm) * 100}cqw`,
                        color: config.header.color, fontSize: `${config.header.sizePct}cqw`, fontWeight: 600,
                        fontFamily: 'Arial, Helvetica, sans-serif',
                    }}>{config.header.district}</div>
                )}
            </div>

            {/* Cuerpo: lista de personas, centrada en la región body */}
            <div style={{
                position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                top: `${LAYOUT.bodyTopFracH * 100}cqh`,
                height: `${(LAYOUT.bodyBottomFracH - LAYOUT.bodyTopFracH) * 100}cqh`,
                width: `${(1 - 2 * LAYOUT.sideFracW) * 100}cqw`,
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                gap: `${config.sizes.name * LAYOUT.personGapEm}cqw`, textAlign: 'center',
            }}>
                {people.map((p, i) => (
                    <div key={i} style={{ width: '100%', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                        <div style={{ color: config.colors.name, fontSize: `${config.sizes.name}cqw`, fontWeight: 800, lineHeight: LAYOUT.lineHeight }}>{p.name}</div>
                        {p.role?.trim() && (
                            <div style={{ color: config.colors.role, fontSize: `${config.sizes.role}cqw`, fontWeight: 600, lineHeight: LAYOUT.lineHeight, marginTop: `${config.sizes.name * LAYOUT.nameToRoleEm}cqw` }}>{p.role}</div>
                        )}
                        {p.period?.trim() && (
                            <div style={{ color: config.colors.period, fontSize: `${config.sizes.period}cqw`, fontWeight: 400, lineHeight: LAYOUT.lineHeight, marginTop: `${config.sizes.role * LAYOUT.roleToPeriodEm}cqw` }}>{p.period}</div>
                        )}
                    </div>
                ))}
            </div>

            {/* Pie: logo blanco + distrito | divisor | lema */}
            {config.footer.show && (
                <div style={{
                    position: 'absolute', left: '50%', top: `${LAYOUT.footerCenterFracH * 100}cqh`,
                    transform: 'translate(-50%, -50%)', width: '84cqw',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3cqw',
                    fontFamily: 'Arial, Helvetica, sans-serif',
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <img src={logoDataUrl('completo', 'blanco')} alt="Rotary" draggable={false}
                            style={{ width: `${LAYOUT.footerLogoWidthFracW * 100}cqw`, height: 'auto' }} />
                        {config.footer.district?.trim() && (
                            <div style={{ color: '#fff', fontSize: `${LAYOUT.footerDistrictSizePct}cqw`, fontWeight: 500, marginTop: '0.6cqw', paddingLeft: '3cqw' }}>{config.footer.district}</div>
                        )}
                    </div>
                    <div style={{ width: '0.35cqw', height: `${LAYOUT.footerTaglineSizePct * 2.6}cqw`, background: 'rgba(255,255,255,0.6)' }} />
                    {config.footer.tagline?.trim() && (
                        <div style={{ color: '#fff', fontSize: `${LAYOUT.footerTaglineSizePct}cqw`, fontWeight: 800, fontStyle: 'italic', lineHeight: 1.12, maxWidth: '36cqw', textAlign: 'left' }}>{config.footer.tagline}</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BannerPreview;
