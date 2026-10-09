/**
 * phoneUtils.ts — Utilidades frontend para normalización internacional E.164,
 * autocompletado y validación en tiempo real.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { COUNTRIES, CountryInfo, findCountryByCode, findCountryByDialCode } from './countryData';

export interface PhoneValidationResult {
  ok: boolean;
  status: 'valid' | 'pending_review' | 'invalid';
  rawInput: string;
  e164: string;           // Dígitos internacionales sin '+' para la API (ej. '12896598847')
  e164Formatted: string;  // Con '+' (ej. '+12896598847')
  displayFormatted: string; // Para mostrar amigable (ej. '+1 289 659 8847')
  country: CountryInfo | null;
  callingCode: string | null;
  reason: string;
  isAmbiguous: boolean;
}

export function cleanPhoneInput(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/^['"`]+|['"`]+$/g, '').trim();
}

/**
 * Valida y formatea un número en el cliente en tiempo real.
 */
export function validatePhoneClient(
  rawPhone: string,
  selectedCountryCode: string = 'CO'
): PhoneValidationResult {
  const clean = cleanPhoneInput(rawPhone);
  if (!clean) {
    return {
      ok: false,
      status: 'invalid',
      rawInput: '',
      e164: '',
      e164Formatted: '',
      displayFormatted: '',
      country: null,
      callingCode: null,
      reason: 'El número está vacío.',
      isAmbiguous: false,
    };
  }

  const digits = clean.replace(/[^0-9]/g, '');
  if (!digits) {
    return {
      ok: false,
      status: 'invalid',
      rawInput: clean,
      e164: '',
      e164Formatted: '',
      displayFormatted: clean,
      country: null,
      callingCode: null,
      reason: 'No contiene dígitos.',
      isAmbiguous: false,
    };
  }

  // 1. ¿El usuario escribió '+' explícito o '00'?
  const hasPlus = clean.startsWith('+') || clean.startsWith('00');
  const normalizedCandidate = clean.startsWith('00')
    ? '+' + clean.slice(2).replace(/[^0-9]/g, '')
    : hasPlus
    ? '+' + digits
    : null;

  if (normalizedCandidate) {
    const parsed = parsePhoneNumberFromString(normalizedCandidate);
    if (parsed && parsed.isValid()) {
      const e164 = parsed.format('E.164');
      const countryInfo = findCountryByCode(parsed.country) || null;
      return {
        ok: true,
        status: 'valid',
        rawInput: clean,
        e164: e164.replace('+', ''),
        e164Formatted: e164,
        displayFormatted: parsed.formatInternational(),
        country: countryInfo,
        callingCode: parsed.countryCallingCode,
        reason: '',
        isAmbiguous: false,
      };
    }

    if (digits.length >= 8 && digits.length <= 15) {
      return {
        ok: true,
        status: 'valid',
        rawInput: clean,
        e164: digits,
        e164Formatted: '+' + digits,
        displayFormatted: '+' + digits,
        country: findCountryByCode(parsed?.country) || null,
        callingCode: parsed?.countryCallingCode || null,
        reason: '',
        isAmbiguous: false,
      };
    }

    return {
      ok: false,
      status: 'invalid',
      rawInput: clean,
      e164: digits,
      e164Formatted: '+' + digits,
      displayFormatted: clean,
      country: null,
      callingCode: null,
      reason: `Longitud inválida para número internacional (${digits.length} dígitos).`,
      isAmbiguous: false,
    };
  }

  // 2. Reconocimiento de 11 dígitos Norteamérica (+1 NANP)
  if (digits.length === 11 && digits.startsWith('1')) {
    const parsed = parsePhoneNumberFromString('+' + digits);
    if (parsed && parsed.isValid()) {
      const e164 = parsed.format('E.164');
      const countryInfo = findCountryByCode(parsed.country || (selectedCountryCode === 'CA' ? 'CA' : 'US')) || null;
      return {
        ok: true,
        status: 'valid',
        rawInput: clean,
        e164: e164.replace('+', ''),
        e164Formatted: e164,
        displayFormatted: parsed.formatInternational(),
        country: countryInfo,
        callingCode: '1',
        reason: '',
        isAmbiguous: false,
      };
    }
  }

  // 3. Reconocimiento de 12 dígitos Colombia (57 + 10 dígitos)
  if (digits.length === 12 && digits.startsWith('57')) {
    const nat = digits.slice(2);
    if (nat.startsWith('3') || nat.startsWith('60')) {
      const countryInfo = findCountryByCode('CO') || null;
      return {
        ok: true,
        status: 'valid',
        rawInput: clean,
        e164: digits,
        e164Formatted: '+57' + nat,
        displayFormatted: `+57 ${nat.slice(0, 3)} ${nat.slice(3, 6)} ${nat.slice(6)}`,
        country: countryInfo,
        callingCode: '57',
        reason: '',
        isAmbiguous: false,
      };
    }
  }

  // 4. Probar si anteponiendo '+' es un número internacional completo (ej. Panamá 507..., México 52...)
  if (digits.length >= 10 && digits.length <= 15) {
    const parsedWithPlus = parsePhoneNumberFromString('+' + digits);
    const isColCandidate = digits.length === 10 && (digits.startsWith('3') || digits.startsWith('60'));
    if (parsedWithPlus && parsedWithPlus.isValid() && (!isColCandidate || selectedCountryCode !== 'CO')) {
      const e164 = parsedWithPlus.format('E.164');
      const countryInfo = findCountryByCode(parsedWithPlus.country) || null;
      return {
        ok: true,
        status: 'valid',
        rawInput: clean,
        e164: e164.replace('+', ''),
        e164Formatted: e164,
        displayFormatted: parsedWithPlus.formatInternational(),
        country: countryInfo,
        callingCode: parsedWithPlus.countryCallingCode,
        reason: '',
        isAmbiguous: false,
      };
    }
  }

  // 5. Número nacional de 10 dígitos interpretado con el país seleccionado
  const selectedCountry = findCountryByCode(selectedCountryCode) || COUNTRIES[0];
  const parsedWithSelected = parsePhoneNumberFromString(digits, selectedCountry.code as any);

  if (parsedWithSelected && parsedWithSelected.isValid()) {
    const e164 = parsedWithSelected.format('E.164');
    return {
      ok: true,
      status: 'valid',
      rawInput: clean,
      e164: e164.replace('+', ''),
      e164Formatted: e164,
      displayFormatted: parsedWithSelected.formatInternational(),
      country: selectedCountry,
      callingCode: parsedWithSelected.countryCallingCode,
      reason: '',
      isAmbiguous: false,
    };
  }

  // 6. Si es de 10 dígitos pero no coincide con Colombia (ej. 9546088844)
  if (digits.length === 10) {
    const testUS = parsePhoneNumberFromString(digits, 'US');
    if (testUS && testUS.isValid()) {
      return {
        ok: false,
        status: 'pending_review',
        rawInput: clean,
        e164: '1' + digits,
        e164Formatted: '+1' + digits,
        displayFormatted: `+1 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`,
        country: findCountryByCode('US') || null,
        callingCode: '1',
        reason: 'Número de 10 dígitos sin indicativo. Sugerencia: EE.UU. (+1). Confirma el país.',
        isAmbiguous: true,
      };
    }
  }

  return {
    ok: false,
    status: digits.length >= 7 && digits.length <= 15 ? 'pending_review' : 'invalid',
    rawInput: clean,
    e164: digits,
    e164Formatted: clean.startsWith('+') ? clean : `+${digits}`,
    displayFormatted: clean,
    country: selectedCountry,
    callingCode: selectedCountry.dialCode.replace('+', ''),
    reason: `Formato no reconocido (${digits.length} dígitos). Verifica el indicativo internacional.`,
    isAmbiguous: true,
  };
}

/**
 * Deduce el país inicial y el número nacional limpio a partir de un string guardado en la base de datos.
 */
export function extractCountryAndNationalNumber(savedPhone: string | null | undefined): {
  countryCode: string;
  nationalNumber: string;
  fullE164: string;
} {
  if (!savedPhone) return { countryCode: 'CO', nationalNumber: '', fullE164: '' };

  const clean = cleanPhoneInput(savedPhone);
  const validated = validatePhoneClient(clean, 'CO');

  if (validated.ok && validated.country) {
    const cc = validated.country.code;
    const dialDigits = validated.callingCode || '';
    let national = validated.e164;
    if (dialDigits && national.startsWith(dialDigits)) {
      national = national.slice(dialDigits.length);
    }
    return {
      countryCode: cc,
      nationalNumber: national,
      fullE164: validated.e164Formatted,
    };
  }

  // Si no se pudo validar con certeza, extraer dígitos
  const digits = clean.replace(/[^0-9]/g, '');
  if (clean.startsWith('+1') || (digits.length === 11 && digits.startsWith('1'))) {
    return { countryCode: 'US', nationalNumber: digits.slice(1), fullE164: `+1${digits.slice(1)}` };
  }
  if (clean.startsWith('+57') || (digits.length === 12 && digits.startsWith('57'))) {
    return { countryCode: 'CO', nationalNumber: digits.slice(2), fullE164: `+57${digits.slice(2)}` };
  }
  if (digits.length === 10 && (digits.startsWith('3') || digits.startsWith('60'))) {
    return { countryCode: 'CO', nationalNumber: digits, fullE164: `+57${digits}` };
  }

  return { countryCode: 'CO', nationalNumber: clean, fullE164: clean };
}
