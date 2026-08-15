import React from 'react';
import { BLOCK_ICONS, BLOCK_ICON_KEYS, getBlockIconLabel } from '../../lib/paymentBlocks';

// ════════════════════════════════════════════════════════════════════
// Selector visual de icono — v4.810
//
// Se elige VIENDO el icono, no escribiendo su clave. Hasta v4.809 las cajas
// de «¿Cómo puedes ayudar?» y «Elementos que se requieren» tenían un campo de
// texto donde había que teclear «heart» o «gift» de memoria: quien configura
// una campaña no tiene por qué conocer los nombres internos, y en la pantalla
// se veía la palabra suelta en vez del icono.
//
// Es UN componente compartido, no una copia por pantalla: el editor de
// Bloques de Pago ya tenía esta rejilla escrita inline y ahora usa ésta.
// Duplicada, la segunda se queda sin los iconos que se agreguen a la primera.
//
// Los iconos salen del registro BLOCK_ICONS de paymentBlocks, que es el mismo
// que consume la página pública (`getBlockIcon`): lo que se elige acá es
// exactamente lo que se va a pintar allá.
// ════════════════════════════════════════════════════════════════════

export interface IconPickerProps {
    value: string;
    onChange: (key: string) => void;
    /** Rótulo encima de la rejilla. Se puede omitir si ya lo pone quien llama. */
    label?: string;
    /** Compacto para filas densas (listas de elementos). */
    size?: 'sm' | 'md';
}

const IconPicker: React.FC<IconPickerProps> = ({ value, onChange, label = 'Ícono', size = 'md' }) => {
    const box = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
    const glyph = size === 'sm' ? 'w-4 h-4' : 'w-[18px] h-[18px]';

    return (
        <div>
            {label && (
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">{label}</label>
            )}
            <div className="flex flex-wrap gap-2 mt-1.5">
                {BLOCK_ICON_KEYS.map(key => {
                    const Ico = BLOCK_ICONS[key];
                    const selected = value === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onChange(key)}
                            // El nombre legible, no la clave: `title` es lo que
                            // se lee al pasar el cursor y `aria-label` lo que
                            // anuncia el lector de pantalla.
                            title={getBlockIconLabel(key)}
                            aria-label={getBlockIconLabel(key)}
                            aria-pressed={selected}
                            className={`${box} rounded-lg flex items-center justify-center border-2 transition-all ${selected
                                ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue'
                                : 'border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'}`}
                        >
                            <Ico className={glyph} />
                        </button>
                    );
                })}
            </div>
            {value && (
                <p className="text-[11px] text-gray-400 mt-2">
                    Seleccionado: <span className="font-bold text-gray-500">{getBlockIconLabel(value)}</span>
                </p>
            )}
        </div>
    );
};

export default IconPicker;
