// Variables dinámicas de Campañas de Contenido — espejo navegador (v4.1166).
// Solo lo necesario para PINTAR: catálogo para los chips del editor,
// sustitución escapada para la vista previa y valores de prueba.
// Quien DECIDE (validar al guardar, resolver al enviar) es el servidor.
// La paridad se comprueba comparando SALIDAS en npm run test:content:activation.
export interface TemplateVar {
  id: string;
  label: string;
  ejemplo: string;
  canales: ('email' | 'whatsapp')[];
}

export const VARIABLE_CATALOG: TemplateVar[] = [
  { id: 'recipient_name', label: 'Nombre del contacto', ejemplo: 'Carolina', canales: ['email', 'whatsapp'] },
  { id: 'club_name', label: 'Nombre del club', ejemplo: 'Club Rotario Cali', canales: ['email', 'whatsapp'] },
  { id: 'district_name', label: 'Distrito', ejemplo: 'Distrito 4281', canales: ['email', 'whatsapp'] },
  { id: 'campaign_name', label: 'Nombre de la campaña', ejemplo: 'Rotary en Acción — Participación recurrente', canales: ['email', 'whatsapp'] },
  { id: 'form_url', label: 'URL del formulario (con token)', ejemplo: 'https://rotary4281.org/rotary-en-accion?ca_token=…', canales: ['email', 'whatsapp'] },
  { id: 'site_name', label: 'Sitio remitente', ejemplo: 'Distrito 4281 de Rotary International', canales: ['email', 'whatsapp'] },
  { id: 'fecha', label: 'Fecha de generación del mensaje', ejemplo: '5 de octubre de 2026', canales: ['email', 'whatsapp'] },
];

export const VARIABLE_IDS = VARIABLE_CATALOG.map((v) => v.id);

export const VARIABLE_ALIASES: Record<string, string> = {
  nombre_contacto: 'recipient_name',
  nombre: 'recipient_name',
  nombre_club: 'club_name',
  club: 'club_name',
  distrito: 'district_name',
  nombre_campaña: 'campaign_name',
  nombre_campana: 'campaign_name',
  url_rotary_en_accion: 'form_url',
  formulario_url: 'form_url',
};

export const canonicalVar = (name: string): string | null => {
  const k = String(name || '').trim();
  if (VARIABLE_IDS.includes(k)) return k;
  return VARIABLE_ALIASES[k] || null;
};

const esc = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sustituye {{vars}} escapando valores. Devuelve el texto y las faltantes. */
export const substituteVars = (text: string, vars: Record<string, string> = {}): { text: string; missing: string[] } => {
  const missing: string[] = [];
  const out = String(text ?? '').replace(/\{\{\s*([a-zA-Z0-9_áéíóúñü]+)\s*\}\}/g, (_m, name: string) => {
    const canon = canonicalVar(name);
    if (!canon) { missing.push(name); return _m; }
    const v = vars[canon];
    if (v === undefined || v === null || v === '') { missing.push(canon); return ''; }
    return esc(v);
  });
  return { text: out, missing: [...new Set(missing)] };
};

/** Valores de prueba para la vista previa del editor. */
export const TEST_VARS: Record<string, string> = {
  recipient_name: 'Carolina',
  club_name: 'Club Rotario Cali',
  district_name: 'Distrito 4281',
  campaign_name: 'Rotary en Acción — Participación recurrente',
  form_url: 'https://rotary4281.org/rotary-en-accion?ca_token=PRUEBA',
  site_name: 'Distrito 4281 de Rotary International',
  fecha: '5 de octubre de 2026',
};
