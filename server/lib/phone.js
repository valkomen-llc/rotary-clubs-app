/**
 * phone.js — Normalización y VALIDACIÓN de números para la WhatsApp Cloud API.
 *
 * Meta espera el número en formato internacional con código de país y SIN '+'
 * (ej. "573124818114"). El problema crítico que evita este módulo: si se "adivina"
 * mal el número, se puede enviar a un TERCERO real (no al contacto), que recibe y
 * abre el mensaje. Entonces el tracker muestra "entregado/leído" para el contacto
 * correcto aunque el verdadero destinatario nunca recibió nada.
 *
 * Por eso NO adivinamos: validamos. Si un número no se puede normalizar con
 * confianza, `validateForMeta` lo marca como inválido y el envío se registra como
 * fallido (con motivo) en lugar de mandarlo a un número equivocado.
 *
 * Reglas (Colombia por defecto, cc='57'):
 *  - Móvil nacional de 10 dígitos  "3124818114"   -> "573124818114"
 *  - Fijo nacional de 10 dígitos   "6011234567"    -> "576011234567"  (¡antes se rompía!)
 *  - Ya con código de país          "573124818114" -> "573124818114"
 *  - Internacional explícito (+/00) "+1 312 481 8114" -> "13124818114" (se confía en él)
 *  - Cualquier otra forma ambigua (sin '+', longitud no nacional) -> INVÁLIDO (no se envía)
 */

const DEFAULT_CC = '57';

function onlyDigits(raw) {
  return String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
}

/**
 * Valida un número colombiano ya con código de país (cc + 10 dígitos nacionales).
 * Móvil = 3XXXXXXXXX, Fijo = 60XXXXXXXX.
 */
function validateColombian(digits, cc) {
  const national = digits.slice(cc.length);
  if (national.length !== 10) {
    return { ok: false, e164: digits, reason: `Número colombiano con longitud inválida (${national.length} dígitos nacionales).` };
  }
  const isMobile = national.startsWith('3');
  const isLandline = national.startsWith('60');
  if (!isMobile && !isLandline) {
    return { ok: false, e164: digits, reason: `Número colombiano no válido: debe ser móvil (3XXXXXXXXX) o fijo (60XXXXXXXX), se recibió "${national}".` };
  }
  return { ok: true, e164: digits, reason: '' };
}

/**
 * Valida y normaliza un número para Meta SIN adivinar.
 * @returns {{ ok: boolean, e164: string, reason: string }}
 */
export function validateForMeta(rawPhone, defaultCountryCode = DEFAULT_CC) {
  const cc = (String(defaultCountryCode).replace(/[^0-9]/g, '') || DEFAULT_CC);

  if (rawPhone == null || String(rawPhone).trim() === '') {
    return { ok: false, e164: '', reason: 'Número vacío.' };
  }

  const original = String(rawPhone).trim();
  let digits = onlyDigits(original);
  if (!digits) {
    return { ok: false, e164: '', reason: 'El número no contiene dígitos.' };
  }

  // ¿El usuario indicó explícitamente que es internacional? ('+' o prefijo '00')
  let explicitIntl = original.startsWith('+');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    explicitIntl = true;
  }

  // Caso 1: ya viene con el código de país colombiano (57 + 10 dígitos)
  if (digits.length === 12 && digits.startsWith(cc)) {
    return validateColombian(digits, cc);
  }

  // Caso 2: nacional de 10 dígitos (móvil 3XX o fijo 60X) -> anteponer el cc
  //   (NO se exige que empiece por 3: así se corrigen los fijos 60X que antes
  //    se enviaban sin código de país y caían en el país equivocado)
  if (!explicitIntl && digits.length === 10) {
    return validateColombian(cc + digits, cc);
  }

  // Caso 3: internacional explícito (+/00) -> confiar si tiene un largo E.164 plausible
  if (explicitIntl) {
    if (digits.length >= 8 && digits.length <= 15) {
      return { ok: true, e164: digits, reason: '' };
    }
    return { ok: false, e164: digits, reason: `Número internacional con longitud inválida (${digits.length} dígitos).` };
  }

  // Caso 4: ambiguo (sin '+', longitud que no es nacional) -> NO adivinar
  return {
    ok: false,
    e164: digits,
    reason: `Número no reconocido como colombiano válido (${digits.length} dígitos). Si es internacional, guárdalo con '+' y código de país (ej. +1...). Si es colombiano, debe ser móvil de 10 dígitos (3XXXXXXXXX) o fijo (60XXXXXXXX).`,
  };
}

/**
 * Normalización compatible hacia atrás: devuelve SIEMPRE un string (mejor esfuerzo).
 * Para envíos nuevos preferir `validateForMeta` y NO enviar si `ok === false`.
 */
export function normalizeForMeta(phone, defaultCountryCode = DEFAULT_CC) {
  const r = validateForMeta(phone, defaultCountryCode);
  return r.e164 || '';
}

export default normalizeForMeta;
