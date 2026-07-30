// ════════════════════════════════════════════════════════════════════
// Campos de formulario público — v4.655.0
//
// Estas piezas nacieron dentro de `FeriaProyectos.tsx` (Postular Proyecto) y
// se sacaron aquí para que el formulario de inscripción a un evento use
// EXACTAMENTE los mismos componentes, no una copia parecida. Cualquier ajuste
// —espaciado, tipografía, bordes, estados de error— se hace en un solo lugar y
// las dos pantallas lo heredan.
//
// Regla: no agregar aquí nada específico de un formulario. Si una pantalla
// necesita un control propio, lo define en su archivo y compone con `Field`.
// ════════════════════════════════════════════════════════════════════
import { useState, type ComponentType, type ReactNode } from 'react';
import { AlertCircle, ChevronDown, Eye, EyeOff, Phone } from 'lucide-react';
import { COUNTRIES, DEFAULT_COUNTRY, composePhone, findCountry, flagEmoji, parsePhone } from '../../lib/countryPhones';

export interface FieldOption { value: string; label: string }

const BLUE = '#17458F';

/** Longitud mínima de la contraseña. La misma que exige el servidor. */
export const PASSWORD_MIN = 8;

/**
 * Clases del control. Se exporta porque hay controles compuestos (la selección
 * múltiple, los acompañantes) que necesitan el mismo borde y el mismo foco sin
 * pasar por `Field`.
 */
export const controlCls = (invalid: boolean) =>
    `w-full rounded-xl border px-4 py-3 text-[15px] text-slate-900 bg-white transition
        placeholder:text-slate-400 focus:outline-none focus:ring-2
        ${invalid ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-[#17458F] focus:ring-[#17458F]/20'}`;

interface FieldProps {
    label: string;
    name: string;
    value: any;
    onChange: (e: any) => void;
    onBlur?: () => void;
    error?: string | null;
    touched?: boolean;
    required?: boolean;
    type?: string;
    placeholder?: string;
    icon?: ComponentType<any>;
    hint?: ReactNode;
    as?: 'input' | 'textarea' | 'select';
    options?: FieldOption[];
    rows?: number;
    maxLength?: number;
    /** Muestra el ojo para revelar el contenido. Sólo tiene sentido en type="password". */
    revealable?: boolean;
    children?: ReactNode;
}

export const Field = ({
    label, name, value, onChange, onBlur, error, touched, required = true,
    type = 'text', placeholder, icon: Icon, hint, as = 'input', options, rows = 6, maxLength,
    revealable = false, children,
}: FieldProps) => {
    const [revealed, setRevealed] = useState(false);
    const invalid = Boolean(touched && error);
    const base = controlCls(invalid);
    // El ojo se dibuja encima del control: sin el relleno extra tapa el texto.
    const showReveal = revealable && type === 'password';

    return (
        <div>
            <label htmlFor={name} className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                {Icon && <Icon size={15} className="text-slate-400" />}
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            {children ? children : as === 'textarea' ? (
                <textarea
                    id={name} name={name} value={value ?? ''} onChange={onChange} onBlur={onBlur}
                    rows={rows} maxLength={maxLength} placeholder={placeholder}
                    className={`${base} resize-y leading-relaxed`}
                />
            ) : as === 'select' ? (
                <select id={name} name={name} value={value ?? ''} onChange={onChange} onBlur={onBlur} className={`${base} cursor-pointer`}>
                    <option value="">- Seleccione -</option>
                    {(options || []).map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            ) : (
                <div className={showReveal ? 'relative' : undefined}>
                    <input
                        id={name} name={name} type={showReveal && revealed ? 'text' : type}
                        value={value ?? ''} onChange={onChange} onBlur={onBlur}
                        placeholder={placeholder} maxLength={maxLength}
                        inputMode={type === 'number' ? 'decimal' : undefined}
                        className={showReveal ? `${base} pr-11` : base}
                        autoComplete={type === 'password' ? 'new-password' : 'off'}
                    />
                    {showReveal && (
                        <button
                            type="button"
                            onClick={() => setRevealed(v => !v)}
                            aria-label={revealed ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-600"
                        >
                            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                    )}
                </div>
            )}
            {invalid ? (
                <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-red-600">
                    <AlertCircle size={13} /> {error}
                </p>
            ) : hint ? (
                <p className="mt-1.5 text-[13px] text-slate-500">{hint}</p>
            ) : null}
        </div>
    );
};

// Teléfono con selector de país: el indicativo se elige de una lista con
// banderas y el valor se guarda unificado ("+57 3001234567"). Colombia queda
// por defecto por ser el país anfitrión.
//
// El selector cerrado muestra sólo bandera e indicativo (🇨🇴 +57) para que el
// grueso del ancho quede libre para escribir el número. Como un <select>
// nativo siempre pinta el texto completo de la opción elegida, se usa el
// patrón de select transparente encima del texto visible: la lista desplegada
// conserva el nombre del país —necesario para encontrarlo entre 56— y en
// móvil se abre el selector nativo del sistema.
export const PhoneField = ({
    value, onChange, onBlur, error, touched,
    label = 'Número de contacto o WhatsApp', name = 'phone', required = true, hint,
}: {
    value: string; onChange: (v: string) => void; onBlur?: () => void;
    error?: string | null; touched?: boolean;
    label?: string; name?: string; required?: boolean; hint?: ReactNode;
}) => {
    const parsed = parsePhone(value);
    const [iso, setIso] = useState(parsed.iso || DEFAULT_COUNTRY);
    const national = parsed.national;
    const invalid = Boolean(touched && error);

    const update = (nextIso: string, nextNational: string) => {
        setIso(nextIso);
        onChange(composePhone(nextIso, nextNational));
    };

    return (
        <div>
            <label htmlFor={name} className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Phone size={15} className="text-slate-400" />
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <div className={`flex overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 ${
                invalid ? 'border-red-400 focus-within:ring-red-200' : 'border-slate-300 focus-within:border-[#17458F] focus-within:ring-[#17458F]/20'}`}>
                <div className="relative shrink-0 border-r border-slate-200 bg-slate-50">
                    <div aria-hidden className="flex items-center gap-1.5 py-3 pl-3 pr-2 text-[15px] font-semibold text-slate-700">
                        <span className="text-lg leading-none">{flagEmoji(iso)}</span>
                        {findCountry(iso).dial}
                        <ChevronDown size={14} className="text-slate-400" />
                    </div>
                    <select
                        aria-label="País del número de contacto"
                        value={iso}
                        onChange={e => update(e.target.value, national)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 focus:outline-none"
                    >
                        {COUNTRIES.map(c => (
                            <option key={c.iso} value={c.iso}>{flagEmoji(c.iso)} {c.name} ({c.dial})</option>
                        ))}
                    </select>
                </div>
                <input
                    id={name} name={name} type="tel" inputMode="tel"
                    value={national}
                    onChange={e => update(iso, e.target.value)}
                    onBlur={onBlur}
                    placeholder="300 000 0000"
                    className="w-full bg-transparent px-3 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
            </div>
            {invalid ? (
                <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-red-600">
                    <AlertCircle size={13} /> {error}
                </p>
            ) : hint ? (
                <p className="mt-1.5 text-[13px] text-slate-500">{hint}</p>
            ) : null}
        </div>
    );
};

export const SummaryRow = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <span className="text-[13px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-[15px] font-semibold text-slate-900 sm:max-w-[62%] sm:text-right">{value || '—'}</span>
    </div>
);

/** Barra de avance del asistente, igual en los dos formularios públicos. */
export const StepProgress = ({ step, total, title }: { step: number; total: number; title: string }) => {
    const progress = Math.round((step / total) * 100);
    return (
        <div className="mb-7">
            <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                <span className="font-semibold text-slate-700">Paso {step} de {total} — {title}</span>
                <span className="shrink-0 font-bold" style={{ color: BLUE }}>{progress}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: BLUE }} />
            </div>
        </div>
    );
};
