import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea un número para mostrarlo con el código de país (Colombia por defecto).
 * Solo afecta la VISUALIZACIÓN; no modifica el dato guardado.
 *
 *  "3124818114"      -> "+57 3124818114"
 *  "+573124818114"   -> "+57 3124818114"
 *  "573124818114"    -> "+57 3124818114"
 */
export function formatPhoneDisplay(phone?: string | null, countryCode: string = '57'): string {
  if (!phone) return '-'
  let digits = String(phone).replace(/[^0-9]/g, '')
  if (!digits) return '-'
  if (digits.startsWith('00')) digits = digits.slice(2)
  const cc = countryCode.replace(/[^0-9]/g, '')
  // Celular colombiano de 10 dígitos (empieza en 3) sin código de país
  if (digits.length === 10 && digits.startsWith('3')) {
    digits = cc + digits
  } else if (digits.length < 10) {
    digits = cc + digits
  }
  if (cc && digits.startsWith(cc)) {
    return `+${cc} ${digits.slice(cc.length)}`
  }
  return `+${digits}`
}
