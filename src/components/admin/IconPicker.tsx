import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BLOCK_ICONS, BLOCK_ICON_KEYS, getBlockIconLabel } from '../../lib/paymentBlocks';

// ════════════════════════════════════════════════════════════════════
// Selector visual de icono — v4.811
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
// La VARITA vive acá por lo mismo — cableada en cada pantalla, la tercera se
// queda sin ella.
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
    /**
     * Texto de la caja (título y descripción) del que la varita deduce el
     * icono. Sin esto no se dibuja la varita: sugerir a partir de nada daría
     * siempre lo mismo.
     */
    suggestFrom?: { title?: string; description?: string };
}

const IconPicker: React.FC<IconPickerProps> = ({ value, onChange, label = 'Ícono', size = 'md', suggestFrom }) => {
    const [suggesting, setSuggesting] = useState(false);
    const box = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
    const glyph = size === 'sm' ? 'w-4 h-4' : 'w-[18px] h-[18px]';

    const texto = `${suggestFrom?.title || ''} ${suggestFrom?.description || ''}`.trim();
    const puedeSugerir = Boolean(suggestFrom) && texto.length > 0;

    // La varita es una COMODIDAD: si el servidor no contesta o el modelo no
    // está configurado, se dice y el selector sigue funcionando a mano. No
    // puede impedir configurar la caja.
    const suggest = async () => {
        if (!puedeSugerir || suggesting) return;
        setSuggesting(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const res = await fetch(`${apiUrl}/ai/suggest-icon`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title: suggestFrom?.title || '', description: suggestFrom?.description || '' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.icon) {
                // El motivo se DICE. «No se pudo sugerir» a secas deja sin
                // saber si falta texto, falta modelo o el texto no encaja.
                const motivo = data?.reason === 'sin_modelo'
                    ? 'No hay un modelo de IA configurado; elegí el ícono a mano.'
                    : data?.reason === 'modelo_no_disponible'
                        ? 'El modelo no respondió; elegí el ícono a mano.'
                        : data?.error || 'Ningún ícono encaja con ese texto; elegilo a mano.';
                toast.warning(motivo);
                return;
            }
            onChange(data.icon);
            toast.success(`Ícono sugerido: ${getBlockIconLabel(data.icon)}`);
        } catch {
            toast.warning('No se pudo sugerir el ícono; elegilo a mano.');
        } finally {
            setSuggesting(false);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between gap-2">
                {label && (
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider">{label}</label>
                )}
                {suggestFrom && (
                    <button
                        type="button"
                        onClick={suggest}
                        disabled={!puedeSugerir || suggesting}
                        title={puedeSugerir
                            ? 'Sugerir un ícono a partir del texto de la caja'
                            : 'Escribí primero el título de la caja'}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${puedeSugerir && !suggesting
                            ? 'text-rotary-blue bg-rotary-blue/5 hover:bg-rotary-blue/10'
                            : 'text-gray-300 bg-gray-50 cursor-not-allowed'}`}
                    >
                        {suggesting
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Sparkles className="w-3.5 h-3.5" />}
                        {suggesting ? 'Pensando…' : 'Sugerir con IA'}
                    </button>
                )}
            </div>
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
