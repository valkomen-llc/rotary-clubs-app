/**
 * phone.js — Normalización y VALIDACIÓN internacional de números para WhatsApp y CRM.
 *
 * Estándar E.164 con `libphonenumber-js`.
 * Meta espera el número en formato internacional con código de país y SIN '+'
 * (ej. "573124818114" o "12896598847").
 *
 * Principios:
 *  1. NUNCA adivinamos ni inventamos países silenciosamente.
 *  2. Reconocemos indicativos explícitos (+/00) y también implícitos seguros
 *     (ej. exportaciones de Excel que eliminan '+' o anteponen comillas simples).
 *  3. Reconocemos formatos internacionales consolidados (ej. NANP +1 de 11 dígitos,
 *     Panamá +507 de 11 dígitos, etc.).
 *  4. Si un número es nacional (10 dígitos) y estamos en contexto Colombia, sólo se
 *     interpreta como Colombia si empieza por 3 (móvil) o 60 (fijo).
 *  5. Si un número de 10 dígitos NO coincide con Colombia ni tiene país seguro,
 *     se marca como `pending_review` (pendiente de validación) sin inventar +57.
 */

import { parsePhoneNumberFromString, getCountryCallingCode } from 'libphonenumber-js';

const DEFAULT_CC = '57';

/**
 * Limpia artefactos comunes de exportaciones Excel/CSV:
 * - Comilla simple inicial ('+12896598847) usada en Excel para forzar texto
 * - Comillas dobles ("+1...")
 * - Espacios en blanco, tabulaciones y saltos de línea
 */
export function sanitizeRawPhone(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  // Quitar comillas simples, dobles o backticks envolventes
  s = s.replace(/^['"`]+|['"`]+$/g, '').trim();
  return s;
}

export function onlyDigits(raw) {
  return String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
}

/**
 * Mapeo rápido de indicativos o nombres de país a código ISO-2
 */
export function resolveCountryIso(hint) {
  if (!hint) return null;
  const s = String(hint).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();

  const lower = s.toLowerCase();
  const countryMap = {
    'colombia': 'CO',
    'estados unidos': 'US',
    'united states': 'US',
    'usa': 'US',
    'eeuu': 'US',
    'ee.uu.': 'US',
    'canada': 'CA',
    'canadá': 'CA',
    'mexico': 'MX',
    'méxico': 'MX',
    'peru': 'PE',
    'perú': 'PE',
    'argentina': 'AR',
    'espana': 'ES',
    'españa': 'ES',
    'spain': 'ES',
    'panama': 'PA',
    'panamá': 'PA',
    'chile': 'CL',
    'brasil': 'BR',
    'brazil': 'BR',
    'ecuador': 'EC',
    'venezuela': 'VE',
    'bolivia': 'BO',
    'costa rica': 'CR',
    'guatemala': 'GT',
    'honduras': 'HN',
    'el salvador': 'SV',
    'nicaragua': 'NI',
    'uruguay': 'UY',
    'paraguay': 'PY',
    'dominican republic': 'DO',
    'republica dominicana': 'DO',
    'república dominicana': 'DO',
  };
  if (countryMap[lower]) return countryMap[lower];

  const digits = onlyDigits(s);
  const callingMap = {
    '57': 'CO',
    '1': 'US',
    '52': 'MX',
    '51': 'PE',
    '54': 'AR',
    '34': 'ES',
    '507': 'PA',
    '56': 'CL',
    '55': 'BR',
    '593': 'EC',
    '58': 'VE',
    '591': 'BO',
    '506': 'CR',
    '502': 'GT',
    '504': 'HN',
    '503': 'SV',
    '505': 'NI',
    '598': 'UY',
    '595': 'PY',
    '44': 'GB',
    '49': 'DE',
    '33': 'FR',
    '39': 'IT',
    '351': 'PT',
  };
  return callingMap[digits] || null;
}

/**
 * Valida un número colombiano ya con código de país (57 + 10 dígitos nacionales).
 * Móvil = 3XXXXXXXXX, Fijo = 60XXXXXXXX.
 */
function validateColombianDigits(digits, cc = '57') {
  const national = digits.slice(cc.length);
  if (national.length !== 10) {
    return {
      ok: false,
      status: 'invalid',
      e164: digits,
      e164Formatted: '+' + digits,
      country: 'CO',
      callingCode: '57',
      reason: `Número colombiano con longitud inválida (${national.length} dígitos nacionales).`,
      isAmbiguous: false,
    };
  }
  const isMobile = national.startsWith('3');
  const isLandline = national.startsWith('60');
  if (!isMobile && !isLandline) {
    return {
      ok: false,
      status: 'invalid',
      e164: digits,
      e164Formatted: '+' + digits,
      country: 'CO',
      callingCode: '57',
      reason: `Número colombiano no válido: debe ser móvil (3XXXXXXXXX) o fijo (60XXXXXXXX), se recibió "${national}".`,
      isAmbiguous: false,
    };
  }
  return {
    ok: true,
    status: 'valid',
    e164: digits,
    e164Formatted: '+57' + national,
    country: 'CO',
    callingCode: '57',
    reason: '',
    isAmbiguous: false,
  };
}

/**
 * Valida y normaliza un número con estándar internacional E.164.
 *
 * @param {string|number} rawPhone
 * @param {string|number|null} [countryHint] - Código ISO (ej. 'CO', 'US') o indicativo (ej. '57', '+1')
 * @returns {{
 *   ok: boolean,
 *   status: 'valid' | 'pending_review' | 'invalid',
 *   e164: string,          // Dígitos internacionales sin '+' para Meta Cloud API (ej. '12896598847')
 *   e164Formatted: string, // E.164 con '+' (ej. '+12896598847')
 *   country: string | null,// Código ISO-2 (ej. 'CA', 'US', 'CO')
 *   callingCode: string | null,// Código telefónico sin '+' (ej. '1', '57')
 *   reason: string,
 *   isAmbiguous: boolean
 * }}
 */
export function validatePhoneNumber(rawPhone, countryHint = null) {
  const clean = sanitizeRawPhone(rawPhone);
  if (!clean) {
    return {
      ok: false,
      status: 'invalid',
      e164: '',
      e164Formatted: '',
      country: null,
      callingCode: null,
      reason: 'Número vacío.',
      isAmbiguous: false,
    };
  }

  let digits = onlyDigits(clean);
  if (!digits) {
    return {
      ok: false,
      status: 'invalid',
      e164: '',
      e164Formatted: '',
      country: null,
      callingCode: null,
      reason: 'El número no contiene dígitos.',
      isAmbiguous: false,
    };
  }

  const defaultCountry = resolveCountryIso(countryHint);

  // ¿El número original tenía prefijo internacional explícito ('+' o '00')?
  let explicitIntl = clean.startsWith('+');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    explicitIntl = true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 1: Internacional explícito (+ o 00)
  // ──────────────────────────────────────────────────────────────────────────
  if (explicitIntl) {
    const parsed = parsePhoneNumberFromString('+' + digits);
    if (parsed && parsed.isValid()) {
      const formatted = parsed.format('E.164');
      return {
        ok: true,
        status: 'valid',
        e164: formatted.replace('+', ''),
        e164Formatted: formatted,
        country: parsed.country || null,
        callingCode: parsed.countryCallingCode || null,
        reason: '',
        isAmbiguous: false,
      };
    }
    // Si libphonenumber no lo da por estrictamente válido pero tiene longitud plausible E.164 (8 a 15)
    if (digits.length >= 8 && digits.length <= 15) {
      return {
        ok: true,
        status: 'valid',
        e164: digits,
        e164Formatted: '+' + digits,
        country: parsed?.country || null,
        callingCode: parsed?.countryCallingCode || null,
        reason: '',
        isAmbiguous: false,
      };
    }
    return {
      ok: false,
      status: 'invalid',
      e164: digits,
      e164Formatted: '+' + digits,
      country: null,
      callingCode: null,
      reason: `Número internacional con longitud inválida (${digits.length} dígitos).`,
      isAmbiguous: false,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 2: Sin '+' explícito, pero incluye código de país verificable
  // ──────────────────────────────────────────────────────────────────────────

  // 2a. Colombia con código 57 (57 + 10 dígitos = 12 dígitos)
  if (digits.length === 12 && digits.startsWith('57')) {
    return validateColombianDigits(digits, '57');
  }

  // 2b. Norteamérica (NANP +1: EE.UU., Canadá, etc.) -> 1 + 10 dígitos = 11 dígitos empezando por 1
  // Ejemplos directos de la Feria Rotary: 12896598847 (Ontario), 12072324839 (Maine), etc.
  if (digits.length === 11 && digits.startsWith('1')) {
    const parsed = parsePhoneNumberFromString('+' + digits);
    if (parsed && parsed.isValid()) {
      const formatted = parsed.format('E.164');
      return {
        ok: true,
        status: 'valid',
        e164: formatted.replace('+', ''),
        e164Formatted: formatted,
        country: parsed.country || (defaultCountry === 'CA' ? 'CA' : 'US'),
        callingCode: '1',
        reason: '',
        isAmbiguous: false,
      };
    }
  }

  // 2c. Otros países con indicativo si al anteponer '+' resulta un número internacional válido
  // (Ejemplo: Panamá 50766182929, México 52..., España 34..., Perú 51...)
  // Excluimos longitud 10 porque 10 dígitos es el formato estándar nacional (CO y NANP EE.UU./Canadá).
  if (digits.length >= 11 && digits.length <= 15) {
    const parsedWithPlus = parsePhoneNumberFromString('+' + digits);
    if (parsedWithPlus && parsedWithPlus.isValid()) {
      const formatted = parsedWithPlus.format('E.164');
      return {
        ok: true,
        status: 'valid',
        e164: formatted.replace('+', ''),
        e164Formatted: formatted,
        country: parsedWithPlus.country || null,
        callingCode: parsedWithPlus.countryCallingCode || null,
        reason: '',
        isAmbiguous: false,
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 3: Nacional de 10 dígitos (sin indicativo internacional)
  // ──────────────────────────────────────────────────────────────────────────
  if (digits.length === 10) {
    // Si viene con un país sugerido explícito distinto de Colombia (ej. 'US', 'CA', 'MX')
    if (defaultCountry && defaultCountry !== 'CO') {
      const parsedWithHint = parsePhoneNumberFromString(digits, defaultCountry);
      if (parsedWithHint && parsedWithHint.isValid()) {
        const formatted = parsedWithHint.format('E.164');
        return {
          ok: true,
          status: 'valid',
          e164: formatted.replace('+', ''),
          e164Formatted: formatted,
          country: parsedWithHint.country || defaultCountry,
          callingCode: parsedWithHint.countryCallingCode || null,
          reason: '',
          isAmbiguous: false,
        };
      }
    }

    // Si empieza por 3 (móvil) o 60 (fijo) -> Regla nacional Colombia (+57)
    if (digits.startsWith('3') || digits.startsWith('60')) {
      return validateColombianDigits('57' + digits, '57');
    }

    // Si tiene 10 dígitos pero NO empieza por 3 ni 60:
    // En Colombia NINGÚN teléfono empieza por 2, 4, 5, 7, 8, 9.
    // Muy probable formato local de EE.UU./Canadá (NANP de 10 dígitos: ej. 9546088844, 4036523794, 5037047793)
    const testNANP = parsePhoneNumberFromString(digits, 'US');
    if (testNANP && testNANP.isValid()) {
      return {
        ok: false,
        status: 'pending_review',
        e164: '1' + digits,
        e164Formatted: '+1' + digits,
        country: defaultCountry === 'CA' ? 'CA' : 'US',
        callingCode: '1',
        reason: `Número de 10 dígitos sin indicativo internacional (posible EE.UU./Canadá +1 ${digits}). Requiere confirmar país.`,
        isAmbiguous: true,
      };
    }

    // No es colombiano ni NANP válido
    return {
      ok: false,
      status: 'invalid',
      e164: digits,
      e164Formatted: digits,
      country: null,
      callingCode: null,
      reason: `Número colombiano no válido: debe ser móvil (3XXXXXXXXX) o fijo (60XXXXXXXX), se recibió "${digits}".`,
      isAmbiguous: true,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 4: Ambiguo o longitud no reconocida
  // ──────────────────────────────────────────────────────────────────────────
  return {
    ok: false,
    status: digits.length >= 7 && digits.length <= 15 ? 'pending_review' : 'invalid',
    e164: digits,
    e164Formatted: digits,
    country: null,
    callingCode: null,
    reason: `Número no reconocido como colombiano válido (${digits.length} dígitos). Si es internacional, guárdalo con '+' y código de país (ej. +1...). Si es colombiano, debe ser móvil de 10 dígitos (3XXXXXXXXX) o fijo (60XXXXXXXX).`,
    isAmbiguous: true,
  };
}

/**
 * Valida y normaliza un número para Meta SIN adivinar.
 * Compatible hacia atrás con llamadas existentes que esperan { ok, e164, reason }.
 */
export function validateForMeta(rawPhone, defaultCountryCode = DEFAULT_CC) {
  const result = validatePhoneNumber(rawPhone, defaultCountryCode);
  return {
    ok: result.ok,
    status: result.status,
    e164: result.e164,
    e164Formatted: result.e164Formatted,
    country: result.country,
    callingCode: result.callingCode,
    reason: result.reason,
    isAmbiguous: result.isAmbiguous,
  };
}

/**
 * Normalización compatible hacia atrás: devuelve string con los dígitos listos para Meta.
 */
export function normalizeForMeta(phone, defaultCountryCode = DEFAULT_CC) {
  const r = validateForMeta(phone, defaultCountryCode);
  return r.e164 || '';
}

export default normalizeForMeta;
