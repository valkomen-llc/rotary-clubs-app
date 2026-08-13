// ════════════════════════════════════════════════════════════════════
// Campaña de Emergencia — el formulario de contexto
// v4.783.0
//
// Lo que el club sabe de la emergencia, y NADA MÁS. Cada casilla que se deja
// vacía es una cosa que el guion no va a decir: es el mecanismo, no un
// descuido. Por eso los campos opcionales lo dicen en su ayuda —«si no lo
// completás, no se menciona»— en vez de limitarse a marcarse «opcional».
//
// Un formulario que insinúa que hay que rellenarlo todo empuja a inventar, y en
// una campaña de emergencia real un dato inventado es lo único que no se puede
// permitir. El aviso de arriba está para eso.
//
// Los CATÁLOGOS vienen del servidor (`/reels/options → emergency`): no se
// duplican acá, misma regla que el resto del módulo. Mientras no llegan, el
// formulario se pinta con las casillas de texto —que son la mayoría— y los
// desplegables aparecen en cuanto responde.
// ════════════════════════════════════════════════════════════════════

import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

export interface EmergencyContextInput {
    disasterType: string;
    customDisaster: string;
    country: string;
    region: string;
    eventDate: string;
    magnitude: string;
    description: string;
    communities: string;
    needs: string[];
    customNeed: string;
    ctas: string[];
    contactUrl: string;
}

interface CatalogItem { id: string; label: string }
interface DisasterItem extends CatalogItem { magnitudeHint: string; freeText: boolean }

interface Props {
    value: EmergencyContextInput;
    onChange: (next: EmergencyContextInput) => void;
    disasters?: DisasterItem[];
    needs?: CatalogItem[];
    ctas?: CatalogItem[];
    disabled?: boolean;
}

const labelCls = 'block text-xs font-semibold text-gray-700 mb-1';
const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rotary-blue/40 focus:border-rotary-blue disabled:bg-gray-50 disabled:text-gray-400';
const hintCls = 'mt-1 text-[11px] text-gray-500 leading-snug';

const EmergencyForm: React.FC<Props> = ({
    value, onChange, disasters = [], needs = [], ctas = [], disabled = false
}) => {
    const set = <K extends keyof EmergencyContextInput>(key: K, v: EmergencyContextInput[K]) =>
        onChange({ ...value, [key]: v });

    // Alternar un elemento de una selección múltiple. Se escribe una vez y la
    // usan necesidades y llamados a la acción: dos copias se separan solas.
    const toggle = (key: 'needs' | 'ctas', id: string) => {
        const current = value[key];
        set(key, current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
    };

    const selected = disasters.find(d => d.id === value.disasterType);
    // «Otro» es la única entrada con texto libre, y el catálogo lo declara con
    // `freeText`: preguntarlo por el id sería escribir el catálogo dos veces.
    const needsCustomName = selected?.freeText || value.disasterType === 'otro';

    return (
        <div className="space-y-5">
            {/* El aviso va ARRIBA, antes de la primera casilla: leído después de
                rellenar no cambia nada de lo que se escribió. */}
            <div className="flex gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                    <strong>Sólo datos verificados.</strong> El guion se escribe con lo que completes acá y
                    nada más: no se inventan cifras de víctimas, damnificados, magnitudes ni daños.
                    Lo que dejes vacío simplemente no se menciona, y el video se entiende igual.
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className={labelCls} htmlFor="emg-tipo">Tipo de emergencia</label>
                    <select
                        id="emg-tipo"
                        className={inputCls}
                        value={value.disasterType}
                        onChange={e => set('disasterType', e.target.value)}
                        disabled={disabled || !disasters.length}
                    >
                        {disasters.length
                            ? disasters.map(d => <option key={d.id} value={d.id}>{d.label}</option>)
                            : <option value={value.disasterType}>Cargando…</option>}
                    </select>
                </div>

                {needsCustomName && (
                    <div>
                        <label className={labelCls} htmlFor="emg-otro">¿Cuál?</label>
                        <input
                            id="emg-otro"
                            className={inputCls}
                            value={value.customDisaster}
                            onChange={e => set('customDisaster', e.target.value)}
                            placeholder="Ej: crisis por desplazamiento"
                            disabled={disabled}
                        />
                        <p className={hintCls}>Se usa para nombrar la emergencia en el guion.</p>
                    </div>
                )}

                <div>
                    <label className={labelCls} htmlFor="emg-pais">País afectado</label>
                    <input
                        id="emg-pais" className={inputCls} value={value.country}
                        onChange={e => set('country', e.target.value)}
                        placeholder="Ej: Colombia" disabled={disabled}
                    />
                </div>

                <div>
                    <label className={labelCls} htmlFor="emg-region">Ciudad, región o departamento</label>
                    <input
                        id="emg-region" className={inputCls} value={value.region}
                        onChange={e => set('region', e.target.value)}
                        placeholder="Ej: Valle del Cauca" disabled={disabled}
                    />
                    <p className={hintCls}>Sin ubicación, el guion habla de «la región» sin nombrarla.</p>
                </div>

                <div>
                    <label className={labelCls} htmlFor="emg-fecha">Fecha del evento</label>
                    <input
                        id="emg-fecha" type="date" className={inputCls} value={value.eventDate}
                        onChange={e => set('eventDate', e.target.value)} disabled={disabled}
                    />
                    <p className={hintCls}>Si no la completás, no se menciona ninguna fecha.</p>
                </div>

                <div>
                    <label className={labelCls} htmlFor="emg-magnitud">Magnitud o intensidad</label>
                    <input
                        id="emg-magnitud" className={inputCls} value={value.magnitude}
                        onChange={e => set('magnitude', e.target.value)}
                        placeholder={selected?.magnitudeHint || 'Sólo si hay dato oficial'}
                        disabled={disabled}
                    />
                    <p className={hintCls}>
                        {selected?.magnitudeHint || 'Sólo si hay una cifra oficial.'} Vacío, no se menciona.
                    </p>
                </div>
            </div>

            <div>
                <label className={labelCls} htmlFor="emg-desc">Qué ocurrió</label>
                <textarea
                    id="emg-desc" className={`${inputCls} min-h-[80px]`} value={value.description}
                    onChange={e => set('description', e.target.value)}
                    placeholder="Describí brevemente la situación, con lo que sepas con certeza."
                    disabled={disabled}
                />
                <p className={hintCls}>
                    Es la base del guion. Escribí sólo lo confirmado: lo que pongas acá es lo único
                    que el video puede afirmar.
                </p>
            </div>

            <div>
                <label className={labelCls} htmlFor="emg-comunidades">Comunidades afectadas</label>
                <input
                    id="emg-comunidades" className={inputCls} value={value.communities}
                    onChange={e => set('communities', e.target.value)}
                    placeholder="Ej: veredas del norte del municipio" disabled={disabled}
                />
                <p className={hintCls}>Vacío, el guion dice «comunidades» y «familias» en general.</p>
            </div>

            <div>
                <span className={labelCls}>Necesidades principales</span>
                <div className="flex flex-wrap gap-2">
                    {needs.map(n => {
                        const on = value.needs.includes(n.id);
                        return (
                            <button
                                key={n.id} type="button" disabled={disabled}
                                onClick={() => toggle('needs', n.id)}
                                aria-pressed={on}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                    on
                                        ? 'bg-rotary-blue text-white border-rotary-blue'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-rotary-blue'
                                } disabled:opacity-50`}
                            >
                                {n.label}
                            </button>
                        );
                    })}
                </div>
                <input
                    className={`${inputCls} mt-2`} value={value.customNeed}
                    onChange={e => set('customNeed', e.target.value)}
                    placeholder="Otra necesidad (opcional)" disabled={disabled}
                />
                <p className={hintCls}>
                    Sólo se nombran las que marques. No se deducen del tipo de emergencia.
                </p>
            </div>

            <div>
                <span className={labelCls}>Llamado a la acción</span>
                <div className="flex flex-wrap gap-2">
                    {ctas.map(c => {
                        const on = value.ctas.includes(c.id);
                        return (
                            <button
                                key={c.id} type="button" disabled={disabled}
                                onClick={() => toggle('ctas', c.id)}
                                aria-pressed={on}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                    on
                                        ? 'bg-rotary-gold text-rotary-navy border-rotary-gold'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-rotary-gold'
                                } disabled:opacity-50`}
                            >
                                {c.label}
                            </button>
                        );
                    })}
                </div>
                {!value.ctas.length && (
                    <p className="mt-1 text-[11px] text-amber-700">
                        Sin llamado a la acción el video informa pero no moviliza. Se usará «Donar».
                    </p>
                )}
            </div>

            <div>
                <label className={labelCls} htmlFor="emg-enlace">Enlace o contacto de la campaña</label>
                <input
                    id="emg-enlace" className={inputCls} value={value.contactUrl}
                    onChange={e => set('contactUrl', e.target.value)}
                    placeholder="Ej: rotary4281.org/emergencia" disabled={disabled}
                />
                <p className={hintCls}>Aparece en el cierre del video, junto al logo del club.</p>
            </div>

            <div className="flex gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-900 leading-relaxed">
                    El nombre del club, el distrito y el logo se toman del sitio automáticamente:
                    no hace falta escribirlos.
                </p>
            </div>
        </div>
    );
};

export default EmergencyForm;
