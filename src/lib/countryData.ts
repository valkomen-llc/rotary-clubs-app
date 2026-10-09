/**
 * countryData.ts — Catálogo internacional de países e indicativos telefónicos
 * para normalización E.164 y selectores de Club Platform.
 */

export interface CountryInfo {
  code: string;       // ISO 3166-1 alpha-2 (ej. 'CO', 'US')
  name: string;       // Nombre en español
  nameEn: string;     // Nombre en inglés
  dialCode: string;   // Indicativo con '+' (ej. '+57', '+1')
  flag: string;       // Emoji de bandera (ej. '🇨🇴')
  popular?: boolean;  // Destacado para acceso rápido en Rotary
}

export const POPULAR_COUNTRY_CODES = ['CO', 'US', 'CA', 'MX', 'PE', 'AR', 'ES', 'PA', 'CL', 'BR', 'EC', 'VE'];

export const COUNTRIES: CountryInfo[] = [
  // ── Países más frecuentes en la red Rotary Colombia y Latinoamérica ──────────
  { code: 'CO', name: 'Colombia', nameEn: 'Colombia', dialCode: '+57', flag: '🇨🇴', popular: true },
  { code: 'US', name: 'Estados Unidos', nameEn: 'United States', dialCode: '+1', flag: '🇺🇸', popular: true },
  { code: 'CA', name: 'Canadá', nameEn: 'Canada', dialCode: '+1', flag: '🇨🇦', popular: true },
  { code: 'MX', name: 'México', nameEn: 'Mexico', dialCode: '+52', flag: '🇲🇽', popular: true },
  { code: 'PE', name: 'Perú', nameEn: 'Peru', dialCode: '+51', flag: '🇵🇪', popular: true },
  { code: 'AR', name: 'Argentina', nameEn: 'Argentina', dialCode: '+54', flag: '🇦🇷', popular: true },
  { code: 'ES', name: 'España', nameEn: 'Spain', dialCode: '+34', flag: '🇪🇸', popular: true },
  { code: 'PA', name: 'Panamá', nameEn: 'Panama', dialCode: '+507', flag: '🇵🇦', popular: true },
  { code: 'CL', name: 'Chile', nameEn: 'Chile', dialCode: '+56', flag: '🇨🇱', popular: true },
  { code: 'BR', name: 'Brasil', nameEn: 'Brazil', dialCode: '+55', flag: '🇧🇷', popular: true },
  { code: 'EC', name: 'Ecuador', nameEn: 'Ecuador', dialCode: '+593', flag: '🇪🇨', popular: true },
  { code: 'VE', name: 'Venezuela', nameEn: 'Venezuela', dialCode: '+58', flag: '🇻🇪', popular: true },

  // ── Centroamérica y Caribe ────────────────────────────────────────────────
  { code: 'CR', name: 'Costa Rica', nameEn: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { code: 'GT', name: 'Guatemala', nameEn: 'Guatemala', dialCode: '+502', flag: '🇬🇹' },
  { code: 'HN', name: 'Honduras', nameEn: 'Honduras', dialCode: '+504', flag: '🇭🇳' },
  { code: 'SV', name: 'El Salvador', nameEn: 'El Salvador', dialCode: '+503', flag: '🇸🇻' },
  { code: 'NI', name: 'Nicaragua', nameEn: 'Nicaragua', dialCode: '+505', flag: '🇳🇮' },
  { code: 'DO', name: 'República Dominicana', nameEn: 'Dominican Republic', dialCode: '+1', flag: '🇩🇴' },
  { code: 'PR', name: 'Puerto Rico', nameEn: 'Puerto Rico', dialCode: '+1', flag: '🇵🇷' },
  { code: 'CU', name: 'Cuba', nameEn: 'Cuba', dialCode: '+53', flag: '🇨🇺' },

  // ── Sudamérica ────────────────────────────────────────────────────────────
  { code: 'BO', name: 'Bolivia', nameEn: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
  { code: 'UY', name: 'Uruguay', nameEn: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { code: 'PY', name: 'Paraguay', nameEn: 'Paraguay', dialCode: '+595', flag: '🇵🇾' },

  // ── Europa ────────────────────────────────────────────────────────────────
  { code: 'GB', name: 'Reino Unido', nameEn: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'DE', name: 'Alemania', nameEn: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'Francia', nameEn: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'IT', name: 'Italia', nameEn: 'Italy', dialCode: '+39', flag: '🇮🇹' },
  { code: 'PT', name: 'Portugal', nameEn: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { code: 'CH', name: 'Suiza', nameEn: 'Switzerland', dialCode: '+41', flag: '🇨🇭' },
  { code: 'NL', name: 'Países Bajos', nameEn: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
  { code: 'BE', name: 'Bélgica', nameEn: 'Belgium', dialCode: '+32', flag: '🇧🇪' },
  { code: 'SE', name: 'Suecia', nameEn: 'Sweden', dialCode: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Noruega', nameEn: 'Norway', dialCode: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Dinamarca', nameEn: 'Denmark', dialCode: '+45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finlandia', nameEn: 'Finland', dialCode: '+358', flag: '🇫🇮' },
  { code: 'AT', name: 'Austria', nameEn: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { code: 'IE', name: 'Irlanda', nameEn: 'Ireland', dialCode: '+353', flag: '🇮🇪' },
  { code: 'PL', name: 'Polonia', nameEn: 'Poland', dialCode: '+48', flag: '🇵🇱' },

  // ── Oceanía y Asia ────────────────────────────────────────────────────────
  { code: 'AU', name: 'Australia', nameEn: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'NZ', name: 'Nueva Zelanda', nameEn: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
  { code: 'JP', name: 'Japón', nameEn: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'Corea del Sur', nameEn: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
  { code: 'CN', name: 'China', nameEn: 'China', dialCode: '+86', flag: '🇨🇳' },
  { code: 'IN', name: 'India', nameEn: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'IL', name: 'Israel', nameEn: 'Israel', dialCode: '+972', flag: '🇮🇱' },
  { code: 'AE', name: 'Emiratos Árabes Unidos', nameEn: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪' },
  { code: 'ZA', name: 'Sudáfrica', nameEn: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // Colombia

export function findCountryByCode(code: string | null | undefined): CountryInfo | undefined {
  if (!code) return undefined;
  const upper = code.trim().toUpperCase();
  return COUNTRIES.find(c => c.code === upper);
}

export function findCountryByDialCode(dialCode: string | null | undefined): CountryInfo | undefined {
  if (!dialCode) return undefined;
  const clean = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  return COUNTRIES.find(c => c.dialCode === clean);
}

export function findCountryByNameOrQuery(query: string): CountryInfo | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return COUNTRIES.find(c =>
    c.name.toLowerCase() === q ||
    c.nameEn.toLowerCase() === q ||
    c.code.toLowerCase() === q ||
    c.dialCode === q ||
    c.dialCode === `+${q}`
  );
}

export function searchCountries(query: string): CountryInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.nameEn.toLowerCase().includes(q) ||
    c.code.toLowerCase().includes(q) ||
    c.dialCode.includes(q)
  );
}
