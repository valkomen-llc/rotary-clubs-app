import { SITE_STATUSES, normalizeSiteStatus, statusInfo } from '../../lib/siteStatus';

/**
 * El selector de estado de un sitio, COMPARTIDO por las siete pantallas que
 * dan de alta sitios (Clubes, Distritos, Asociaciones, Zonas, Programas de
 * Intercambio, Ferias y Eventos).
 *
 * ⚠️ ES UNO SOLO A PROPÓSITO. Esas siete pantallas llevaban el mismo `<select>`
 * escrito a mano siete veces, y ése es exactamente el defecto que ya se pagó
 * con la casilla de distritos (v4.748): agregar «En construcción» en una y
 * olvidarla en otra dejaría sitios que no se pueden poner en construcción,
 * sin que nada avise. Al agregar un estado, se agrega en `siteStatus.ts` y
 * aparece en las siete.
 *
 * La ayuda de abajo NO es decorativa: «En construcción» y «Inactivo» se
 * parecen mucho leyendo sólo la etiqueta, y confundirlos es apagar un sitio
 * creyendo que se lo está preparando.
 */
export interface SiteStatusPickerProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    className?: string;
}

const SiteStatusPicker = ({ value, onChange, label = 'Estado', className = '' }: SiteStatusPickerProps) => {
    const actual = normalizeSiteStatus(value);
    const info = statusInfo(actual);

    return (
        <div className={className}>
            <label className="block text-sm font-bold text-gray-700 mb-1">{label}</label>
            <select
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all bg-white"
                value={actual}
                onChange={e => onChange(e.target.value)}
            >
                {SITE_STATUSES.map(s => (
                    <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
                ))}
            </select>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{info.help}</p>
        </div>
    );
};

export default SiteStatusPicker;
