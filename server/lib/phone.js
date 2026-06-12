/**
 * phone.js — Normalización de números para la WhatsApp Cloud API de Meta.
 *
 * Meta espera el número en formato internacional con código de país y SIN el '+'
 * (ej. "573124818114"). En la BD los contactos pueden estar guardados de varias
 * formas (importados sin código de país, con '+', con espacios, etc.), así que
 * normalizamos SIEMPRE al momento de enviar — sin tocar el dato almacenado.
 *
 * Reglas (Colombia por defecto, cc='57'):
 *  - "3124818114"      -> "573124818114"  (celular CO de 10 dígitos sin código)
 *  - "+57 312 481 8114" -> "573124818114" (limpia '+' y espacios)
 *  - "573124818114"     -> "573124818114" (ya tiene código, se deja igual)
 *  - "00573124818114"   -> "573124818114" (prefijo internacional 00)
 */
export function normalizeForMeta(phone, defaultCountryCode = '57') {
  if (!phone) return '';
  let digits = String(phone).replace(/[^0-9]/g, '');
  if (!digits) return '';

  // Prefijo internacional 00 -> quitarlo
  if (digits.startsWith('00')) digits = digits.slice(2);

  const cc = String(defaultCountryCode).replace(/[^0-9]/g, '');

  // Celular colombiano: 10 dígitos que empiezan en 3, sin código de país
  if (digits.length === 10 && digits.startsWith('3')) {
    digits = cc + digits;
  } else if (digits.length < 10 && cc) {
    // Número demasiado corto para tener código de país -> anteponerlo
    digits = cc + digits;
  }

  return digits;
}

export default normalizeForMeta;
