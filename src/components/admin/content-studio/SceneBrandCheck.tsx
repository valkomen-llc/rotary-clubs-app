/**
 * Fidelidad de identidad visual — v4.715
 * ======================================
 *
 * Qué pasó con los logotipos, emblemas y textos institucionales de la escena.
 *
 * Por qué existe aparte del control general: ese mira una comparación de la
 * escena ENTERA reducida a 640 px de alto, y a esa escala el estampado de una
 * camiseta llega con las letras a 9 px. No es que el modelo se equivocara al
 * decir que la marca estaba bien — es que no se le estaba enseñando la marca.
 * Medido sobre un logotipo destrozado: la comparación de escena completa baja
 * de 1,000 a 0,988 (invisible), y el recorte de la región baja a 0,717.
 *
 * Este bloque muestra el recorte ampliado que SÍ se comparó, para que el
 * veredicto se pueda revisar en vez de tener que creerlo.
 *
 * Vive en su propio archivo, como `ScenePeopleCheck`, porque lo usan el Creador
 * y la Biblioteca: duplicarlo los dejaría separarse en silencio.
 */

import React from 'react';
import type { BrandFidelity, BrandLogoCheck } from '../../../lib/reelSpec';

const pct = (v: number | null | undefined) =>
    v == null ? null : `${Math.round(v * 100)} %`;

const Row: React.FC<{ label: string; value: boolean | null; detail?: string | null }> = ({ label, value, detail }) => (
    <div className="flex items-start gap-1.5">
        <span className={`mt-[4px] w-1.5 h-1.5 rounded-full shrink-0 ${
            value === true ? 'bg-emerald-500' : value === false ? 'bg-red-500' : 'bg-gray-300'
        }`} />
        <span className="text-[10px] leading-tight text-gray-600">
            {label}
            {detail ? <span className="text-gray-400"> · {detail}</span> : null}
            {value === null ? <span className="text-gray-400"> · sin comprobar</span> : null}
        </span>
    </div>
);

const Logo: React.FC<{ logo: BrandLogoCheck }> = ({ logo }) => {
    const ok = !logo.altered;
    return (
        <div className={`rounded-lg border p-2 space-y-1 ${ok ? 'border-emerald-200 bg-white' : 'border-red-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-gray-900 truncate">{logo.label}</span>
                <span className={`text-[10px] font-black shrink-0 ${ok ? 'text-emerald-600' : 'text-red-600'}`}>
                    {logo.score != null ? `${logo.score}/10` : '—'}
                </span>
            </div>

            {/* El texto es la señal más dura: si el original decía «Rotary» y el
                clip dice otra cosa, no hay matiz posible. */}
            {logo.textOriginal ? (
                <p className="text-[10px] text-gray-500 leading-tight">
                    Texto: «{logo.textOriginal}» → «{logo.textRendered || '—'}»
                    {logo.textKeptRatio != null && (
                        <span className={logo.textKeptRatio < 0.6 ? 'text-red-600 font-bold' : 'text-gray-400'}>
                            {' '}· {pct(logo.textKeptRatio)} conservado
                        </span>
                    )}
                </p>
            ) : null}

            <Row label="Mismo diseño" value={logo.sameDesign} />
            <Row label="Sin letras inventadas" value={logo.inventedGlyphs == null ? null : !logo.inventedGlyphs} />
            <Row label="Geometría del símbolo" value={logo.geometryBroken == null ? null : !logo.geometryBroken} />
            <Row label="Colores institucionales" value={logo.colorChanged == null ? null : !logo.colorChanged} />
            <Row
                label="Estable entre fotogramas"
                value={logo.temporalScore == null ? null : logo.temporalScore >= 0.62}
                detail={pct(logo.temporalScore)}
            />
            <Row
                label="Parecido al original"
                value={logo.structuralScore == null ? null : logo.structuralScore >= 0.55}
                detail={pct(logo.structuralScore)}
            />

            <p className="text-[9px] text-gray-400 leading-tight">
                {logo.framesChecked} fotograma(s) · {logo.method}
                {/* «Sólo estructural» significa que se comparó el recorte sin
                    nadie capaz de distinguir un logotipo movido de uno
                    redibujado. Es información del usuario, no un detalle. */}
                {logo.decidedBy === 'metrics' && ' · sin modelo de visión: decide la comparación del recorte'}
            </p>

            {logo.issues?.length > 0 && (
                <ul className="text-[10px] text-red-700 list-disc list-inside leading-tight">
                    {logo.issues.map((i, n) => <li key={n}>{i}</li>)}
                </ul>
            )}

            {/* El recorte ampliado que se comparó de verdad. Poder mirarlo es lo
                que separa una comprobación de una afirmación. */}
            {logo.comparisonUrl && (
                <a href={logo.comparisonUrl} target="_blank" rel="noreferrer"
                   className="block rounded overflow-hidden border border-gray-200 hover:border-indigo-400">
                    <img src={logo.comparisonUrl} alt="" className="w-full" loading="lazy" />
                </a>
            )}
        </div>
    );
};

const SceneBrandCheck: React.FC<{ brand?: BrandFidelity | null; className?: string }> = ({ brand, className = '' }) => {
    // Sin logotipos declarados no se pinta nada: no se afirma haber mirado una
    // marca que el análisis nunca ubicó.
    if (!brand || !brand.logos?.length) return null;
    const ok = brand.state === 'ok';

    return (
        <div className={`mt-2 rounded-lg border p-2 space-y-2 ${
            ok ? 'bg-emerald-50/60 border-emerald-200' : 'bg-red-50/60 border-red-200'
        } ${className}`}>
            <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wide ${ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    Fidelidad de identidad visual
                </span>
                <span className={`text-[10px] font-bold ${ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {brand.label}
                </span>
            </div>

            <div className="space-y-2">
                {brand.logos.map((l, i) => <Logo key={i} logo={l} />)}
            </div>

            {!ok && brand.reason && (
                <p className="text-[10px] text-red-700 leading-tight">{brand.reason}</p>
            )}
        </div>
    );
};

export default SceneBrandCheck;
