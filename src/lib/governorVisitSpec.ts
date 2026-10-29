// Visitas del Gobernador — espejo navegador del criterio (v4.1260.0).
// El servidor decide (`server/lib/governorVisitSpec.js`); esto pinta y
// adelanta los errores por paso. Al tocar uno, tocar el otro: la paridad la
// fija `scripts/test-governor-visits.mjs`.

export const VISIT_MAX_PHOTOS = 20;
export const VISIT_MAX_VIDEOS = 3;
export const VISIT_MAX_LINKS = 10;
export const VISIT_CAPTION_MAX = 300;

export type VisitStatus = 'recibida' | 'en_revision' | 'correcciones' | 'aprobada' | 'rechazada' | 'publicada';

export const VISIT_STATES: Record<VisitStatus, { label: string; chip: string }> = {
  recibida: { label: 'Recibida', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  en_revision: { label: 'En revisión', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  correcciones: { label: 'Correcciones solicitadas', chip: 'bg-orange-50 text-orange-700 border-orange-200' },
  aprobada: { label: 'Aprobada', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rechazada: { label: 'Rechazada', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  publicada: { label: 'Publicada', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
};

export const visitStateLabel = (id: string) => VISIT_STATES[id as VisitStatus]?.label || id;
export const visitStateChip = (id: string) => VISIT_STATES[id as VisitStatus]?.chip || 'bg-gray-50 text-gray-600 border-gray-200';
export const VISIT_REASON_REQUIRED = ['correcciones', 'rechazada'];

// Tres pasos (v4.1262): cada uno agrupa dos bloques del reporte.
export const VISIT_STEPS = [
  'Club y visita',
  'Memoria y galería',
  'Responsable y envío',
];

export interface VisitDraft {
  clubProfileId: string;
  visitDate: string;
  governorName: string;
  venue: string;
  title: string;
  reason: string;
  description: string;
  activities: string;
  topics: string;
  recognitions: string;
  agreements: string;
  commitments: string;
  highlights: string;
  links: { url: string; caption: string }[];
  responsibleName: string;
  responsibleRole: string;
  responsibleEmail: string;
  responsiblePhone: string;
  truthConfirmed: boolean;
  publicationConsent: boolean;
}

export const EMPTY_VISIT: VisitDraft = {
  clubProfileId: '', visitDate: '', governorName: '', venue: '', title: '', reason: '',
  description: '', activities: '', topics: '', recognitions: '', agreements: '', commitments: '', highlights: '',
  links: [], responsibleName: '', responsibleRole: '', responsibleEmail: '', responsiblePhone: '',
  truthConfirmed: false, publicationConsent: false,
};

/** Un enlace audiovisual: http(s), con host, sin credenciales. */
export const normalizeVisitLink = (raw: string): string | null => {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const len = (s: string) => String(s || '').trim().length;

/** Fecha local de hoy (no UTC): en Colombia, a las 8 p. m., UTC ya es mañana. */
export const todayLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Los errores de UN paso (1 a 3). `media` cuenta lo ya cargado con éxito.
 * Mismos mínimos que el servidor.
 */
export const validateVisitStep = (
  step: number,
  v: VisitDraft,
  media: { photos: number; videos: number; pending: number; failed: number } = { photos: 0, videos: 0, pending: 0, failed: 0 },
): Record<string, string> => {
  const e: Record<string, string> = {};
  if (step === 1) {
    if (!v.clubProfileId) e.clubProfileId = 'Selecciona el club visitado del catálogo oficial del Distrito 4281.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.visitDate)) e.visitDate = 'Indica la fecha real de la visita.';
    else if (v.visitDate > todayLocal()) e.visitDate = 'La fecha no puede ser posterior a hoy: se reporta una visita ya realizada.';
    else if (v.visitDate < '2000-01-01') e.visitDate = 'Revisa la fecha de la visita.';
    if (len(v.governorName) < 3) e.governorName = 'Escribe el nombre del Gobernador visitante.';
    if (len(v.venue) < 3) e.venue = 'Indica el lugar de la visita.';
    if (len(v.title) < 5) e.title = 'Escribe un título (mínimo 5 caracteres).';
    if (len(v.reason) < 10) e.reason = 'Describe brevemente el motivo del encuentro.';
  }
  if (step === 2) {
    if (len(v.description) < 80) e.description = `La descripción debe tener al menos 80 caracteres (llevas ${len(v.description)}).`;
    if (media.pending > 0) e.media = 'Espera a que terminen de cargarse los archivos.';
    else if (media.failed > 0) e.media = 'Hay archivos que no se cargaron: reintenta o quítalos.';
    else if (media.photos + media.videos + v.links.length === 0) e.media = 'Agrega al menos una fotografía, un video o un enlace audiovisual de la visita.';
    if (media.photos > VISIT_MAX_PHOTOS) e.media = `Máximo ${VISIT_MAX_PHOTOS} fotografías por visita.`;
    if (media.videos > VISIT_MAX_VIDEOS) e.media = `Máximo ${VISIT_MAX_VIDEOS} videos por visita.`;
  }
  if (step === 3) {
    if (len(v.responsibleName) < 3) e.responsibleName = 'Escribe tu nombre completo.';
    if (len(v.responsibleRole) < 3) e.responsibleRole = 'Indica tu cargo (por ejemplo, Secretario/a del club).';
    if (!EMAIL_RE.test(String(v.responsibleEmail || '').trim())) e.responsibleEmail = 'Escribe un correo electrónico válido.';
    const digits = String(v.responsiblePhone || '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) e.responsiblePhone = 'Escribe un número de WhatsApp válido.';
    if (!v.truthConfirmed) e.truthConfirmed = 'Confirma que la información es veraz.';
    if (!v.publicationConsent) e.publicationConsent = 'Autoriza el uso y la publicación del material.';
  }
  return e;
};

/** «29 oct 2026» a partir de «2026-10-29», sin pasar por la zona horaria. */
export const visitDateLabel = (iso?: string | null) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '—';
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(m[3])} ${meses[Number(m[2]) - 1]} ${m[1]}`;
};
