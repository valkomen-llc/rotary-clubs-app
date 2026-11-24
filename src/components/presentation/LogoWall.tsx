/**
 * Presentación comercial — muro de logotipos (v4.1356.0)
 *
 * Todos los logotipos ocupan la MISMA superficie (no la misma altura): uno muy
 * apaisado no queda diminuto ni uno compacto enorme. Sólo se fija el tamaño de
 * la caja; el archivo va con `object-fit: contain`, sin deformar ni recolorear.
 */
import type { CSSProperties } from 'react';
import { enter } from './motion';

export interface LogoItem { name: string; src: string; ratio: number }

/** Superficie objetivo de cada logotipo, en px² del lienzo de 1600 × 900. */
const AREA = 15500;
const MAX_W = 300;

/** Puro: caja de un logotipo de proporción `ratio` con la superficie común. */
export function logoBox(ratio: number, area = AREA, maxW = MAX_W) {
    const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 3;
    const w = Math.min(Math.sqrt(area * r), maxW);
    return { width: Math.round(w), height: Math.round(w / r) };
}

interface Props { label: string; logos: readonly LogoItem[]; columns: number; pending?: string; order: number }

export const LogoWall = ({ label, logos, columns, pending, order }: Props) => (
    <section className="cpd-wall cpd-in" style={enter(order)} aria-label={label}>
        <h3 className="cpd-wall__label">{label}</h3>
        {logos.length ? (
            <ul className="cpd-wall__grid" style={{ ['--cpd-cols' as string]: columns } as CSSProperties}>
                {logos.map(l => {
                    const box = logoBox(l.ratio);
                    return <li key={l.src} className="cpd-wall__cell"><img src={l.src} alt={l.name} width={box.width} height={box.height} loading="lazy" /></li>;
                })}
            </ul>
        ) : <p className="cpd-wall__pending">{pending}</p>}
    </section>
);
