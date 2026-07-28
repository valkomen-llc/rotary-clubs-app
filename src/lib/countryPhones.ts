// ════════════════════════════════════════════════════════════════════
// Indicativos telefónicos por país
// v4.609.0
//
// La bandera NO se guarda como imagen: se calcula a partir del código ISO
// con los caracteres "indicador regional" de Unicode, así que el listado es
// sólo texto y no agrega peso a la aplicación.
//
// Colombia va de primera por ser el país anfitrión de la feria; el resto va
// alfabético para que se encuentren rápido.
// ════════════════════════════════════════════════════════════════════

export interface Country { iso: string; name: string; dial: string }

/** Bandera emoji a partir del código ISO-3166 alpha-2 (CO → 🇨🇴). */
export const flagEmoji = (iso: string): string =>
    String(iso || '')
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 2)
        .split('')
        .map(c => String.fromCodePoint(127397 + c.charCodeAt(0)))
        .join('');

export const DEFAULT_COUNTRY = 'CO';

const REST: Country[] = [
    { iso: 'DE', name: 'Alemania', dial: '+49' },
    { iso: 'AR', name: 'Argentina', dial: '+54' },
    { iso: 'AU', name: 'Australia', dial: '+61' },
    { iso: 'AT', name: 'Austria', dial: '+43' },
    { iso: 'BE', name: 'Bélgica', dial: '+32' },
    { iso: 'BZ', name: 'Belice', dial: '+501' },
    { iso: 'BO', name: 'Bolivia', dial: '+591' },
    { iso: 'BR', name: 'Brasil', dial: '+55' },
    { iso: 'CA', name: 'Canadá', dial: '+1' },
    { iso: 'CL', name: 'Chile', dial: '+56' },
    { iso: 'CN', name: 'China', dial: '+86' },
    { iso: 'KR', name: 'Corea del Sur', dial: '+82' },
    { iso: 'CR', name: 'Costa Rica', dial: '+506' },
    { iso: 'CU', name: 'Cuba', dial: '+53' },
    { iso: 'DK', name: 'Dinamarca', dial: '+45' },
    { iso: 'EC', name: 'Ecuador', dial: '+593' },
    { iso: 'SV', name: 'El Salvador', dial: '+503' },
    { iso: 'AE', name: 'Emiratos Árabes Unidos', dial: '+971' },
    { iso: 'ES', name: 'España', dial: '+34' },
    { iso: 'US', name: 'Estados Unidos', dial: '+1' },
    { iso: 'PH', name: 'Filipinas', dial: '+63' },
    { iso: 'FI', name: 'Finlandia', dial: '+358' },
    { iso: 'FR', name: 'Francia', dial: '+33' },
    { iso: 'GT', name: 'Guatemala', dial: '+502' },
    { iso: 'GY', name: 'Guyana', dial: '+592' },
    { iso: 'HT', name: 'Haití', dial: '+509' },
    { iso: 'HN', name: 'Honduras', dial: '+504' },
    { iso: 'IN', name: 'India', dial: '+91' },
    { iso: 'ID', name: 'Indonesia', dial: '+62' },
    { iso: 'IE', name: 'Irlanda', dial: '+353' },
    { iso: 'IL', name: 'Israel', dial: '+972' },
    { iso: 'IT', name: 'Italia', dial: '+39' },
    { iso: 'JM', name: 'Jamaica', dial: '+1876' },
    { iso: 'JP', name: 'Japón', dial: '+81' },
    { iso: 'MX', name: 'México', dial: '+52' },
    { iso: 'NI', name: 'Nicaragua', dial: '+505' },
    { iso: 'NO', name: 'Noruega', dial: '+47' },
    { iso: 'NZ', name: 'Nueva Zelanda', dial: '+64' },
    { iso: 'NL', name: 'Países Bajos', dial: '+31' },
    { iso: 'PA', name: 'Panamá', dial: '+507' },
    { iso: 'PY', name: 'Paraguay', dial: '+595' },
    { iso: 'PE', name: 'Perú', dial: '+51' },
    { iso: 'PL', name: 'Polonia', dial: '+48' },
    { iso: 'PT', name: 'Portugal', dial: '+351' },
    { iso: 'PR', name: 'Puerto Rico', dial: '+1787' },
    { iso: 'GB', name: 'Reino Unido', dial: '+44' },
    { iso: 'DO', name: 'República Dominicana', dial: '+1809' },
    { iso: 'ZA', name: 'Sudáfrica', dial: '+27' },
    { iso: 'SE', name: 'Suecia', dial: '+46' },
    { iso: 'CH', name: 'Suiza', dial: '+41' },
    { iso: 'SR', name: 'Surinam', dial: '+597' },
    { iso: 'TT', name: 'Trinidad y Tobago', dial: '+1868' },
    { iso: 'TR', name: 'Turquía', dial: '+90' },
    { iso: 'UY', name: 'Uruguay', dial: '+598' },
    { iso: 'VE', name: 'Venezuela', dial: '+58' },
];

export const COUNTRIES: Country[] = [
    { iso: 'CO', name: 'Colombia', dial: '+57' },
    ...REST,
];

export const findCountry = (iso?: string): Country =>
    COUNTRIES.find(c => c.iso === String(iso || '').toUpperCase()) || COUNTRIES[0];

/**
 * Une indicativo y número en un solo valor para guardar.
 * El número se limpia de todo lo que no sea dígito para que quede uniforme
 * en la base de datos y en las exportaciones.
 */
export const composePhone = (iso: string, national: string): string => {
    const digits = String(national || '').replace(/\D/g, '');
    if (!digits) return '';
    return `${findCountry(iso).dial} ${digits}`;
};

// Cuando varios países comparten indicativo (+1 es de Estados Unidos y
// Canadá a la vez), al releer un número guardado no hay forma de saber cuál
// era: se muestra el de esta lista. Quien sea de otro país con el mismo
// indicativo puede elegirlo de nuevo en el selector.
const SHARED_DIAL_PREFERENCE = ['US'];

/**
 * Separa un teléfono guardado en país + número nacional. Se prueba primero
 * con los indicativos más largos (+1876 antes que +1) para no confundir a
 * Jamaica con Estados Unidos.
 */
export const parsePhone = (value?: string): { iso: string; national: string } => {
    const raw = String(value || '').trim();
    if (!raw) return { iso: DEFAULT_COUNTRY, national: '' };
    if (!raw.startsWith('+')) return { iso: DEFAULT_COUNTRY, national: raw.replace(/\D/g, '') };

    const digits = raw.replace(/\D/g, '');
    const candidates = [...COUNTRIES].sort((a, b) => {
        if (b.dial.length !== a.dial.length) return b.dial.length - a.dial.length;
        const pa = SHARED_DIAL_PREFERENCE.indexOf(a.iso);
        const pb = SHARED_DIAL_PREFERENCE.indexOf(b.iso);
        return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    });
    for (const country of candidates) {
        const dialDigits = country.dial.replace(/\D/g, '');
        if (digits.startsWith(dialDigits)) {
            return { iso: country.iso, national: digits.slice(dialDigits.length) };
        }
    }
    return { iso: DEFAULT_COUNTRY, national: digits };
};
