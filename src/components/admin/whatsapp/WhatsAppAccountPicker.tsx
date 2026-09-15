// El selector de CUENTA de WhatsApp activa (v4.1060, multi-WABA).
//
// ⚠️ ES UNO SOLO, NO UNO POR PANTALLA. Lo montan Plantillas, Campañas,
// Automatización, Chat y Analíticas: escrito cinco veces, el día que se agregue
// un estado —o que cambie qué cuentas se ofrecen— la quinta se queda atrás y el
// panel se comporta distinto según por dónde se entre. Es exactamente lo que ya
// costó la casilla de distritos (v4.748) y el selector de pools (v4.877), y acá
// lo que se separaría es sobre qué número está operando alguien.
//
// ⚠️ Y LA CONSULTA DEL CATÁLOGO VIVE DENTRO. Con la lista pedida desde cada
// pantalla, la que se olvide de pedirla pinta un selector vacío y el fallo es
// MUDO: parece que el sitio no tiene cuentas. Es la regla de `SavedOutroPicker`
// (v4.1040).
//
// LO QUE ESTE COMPONENTE NO HACE: decidir. Qué se puede hacer con la cuenta
// elegida lo decide el SERVIDOR y viaja resuelto — la pantalla pinta.
import { useEffect, useState, useCallback } from 'react';
import { Phone, AlertTriangle, Star, ChevronDown } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

export interface WhatsAppAccount {
  id: string;
  displayName: string;
  phoneNumber: string | null;
  phoneNumberId: string;
  wabaId: string;
  status: string;
  statusLabel: string;
  isDefault: boolean;
  hasToken: boolean;
  lastError?: string | null;
}

/**
 * El rótulo de una cuenta, en UN solo sitio: «Feria de Proyectos Rotary
 * Colombia · +57 321 6937317». Es lo que pide el punto 1 del encargo y lo pintan
 * el selector, la cabecera de la sección y la ficha de una campaña.
 */
export function accountLabel(a?: WhatsAppAccount | null): string {
  if (!a) return 'Sin cuenta';
  return a.phoneNumber ? `${a.displayName} · ${a.phoneNumber}` : a.displayName;
}

/** Una cuenta con problema se OFRECE igual, marcada. Esconderla dejaría
 *  preguntándose dónde quedó (regla de v4.1013 con las Páginas de Meta). */
export function accountHasProblem(a?: WhatsAppAccount | null): boolean {
  if (!a) return false;
  return a.status === 'error' || !a.hasToken;
}

/** Lee la respuesta como TEXTO antes de parsear: una página de error HTML
 *  rompe `.json()` y el error resultante no nombra ninguna capa (v4.946). */
async function leerJson(res: Response): Promise<any> {
  const texto = await res.text();
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(
      `El servidor respondió ${res.status} con algo que no es JSON `
      + `(${res.headers.get('content-type') || 'sin tipo'}).`
    );
  }
}

/** El catálogo de cuentas del sitio. Compartido por todas las pantallas. */
export function useWhatsAppAccounts() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/crm/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await leerJson(res);
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      setAccounts(Array.isArray(data?.connections) ? data.connections : []);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las cuentas de WhatsApp.');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);
  return { accounts, loading, error, reload: cargar };
}

/**
 * Cuál se preselecciona. PRESELECCIONA; no aplica nada.
 *
 * Lo ya elegido manda sobre la principal —cambiarle la cuenta a quien ya eligió
 * sería desobedecerlo (regla de `preselectOutro`, v4.1040)— y una elección que
 * ya no está en la lista no se conserva: apuntaría a una línea desconectada.
 */
export function preselectAccount(
  accounts: WhatsAppAccount[],
  current?: string | null,
): string | null {
  if (!accounts.length) return null;
  if (current && accounts.some(a => a.id === current)) return current;
  return (accounts.find(a => a.isDefault) || accounts[0]).id;
}

interface Props {
  value: string | null;
  onChange: (id: string, account: WhatsAppAccount) => void;
  accounts: WhatsAppAccount[];
  loading?: boolean;
  /** Qué se está configurando, para el rótulo: «Configurando: …». */
  context?: string;
  /** Advertir antes de cambiar si hay cambios sin guardar (punto 10). */
  dirty?: boolean;
  compact?: boolean;
}

export default function WhatsAppAccountPicker({
  value, onChange, accounts, loading = false, context, dirty = false, compact = false,
}: Props) {
  const activa = accounts.find(a => a.id === value) || null;

  const cambiar = (id: string) => {
    if (id === value) return;
    // ⚠️ Punto 10 del encargo: cambiar de cuenta con cambios sin guardar los
    // pierde. Se advierte ANTES — descubrirlo después no se deshace.
    if (dirty && !window.confirm(
      'Tienes cambios sin guardar en esta cuenta.\n\n'
      + 'Si cambias de cuenta ahora se perderán. ¿Continuar?'
    )) return;
    const cuenta = accounts.find(a => a.id === id);
    if (cuenta) onChange(id, cuenta);
  };

  if (loading) {
    return <div className="h-10 w-72 animate-pulse rounded-lg bg-gray-100" />;
  }

  // Sin ninguna cuenta no se pinta un desplegable vacío: se dice qué falta y
  // dónde se resuelve. Un control que no controla nada es peor que ninguno
  // (v4.650).
  if (!accounts.length) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          No hay ninguna cuenta de WhatsApp conectada.{' '}
          <span className="font-semibold">Configuración → Cuentas de WhatsApp conectadas.</span>
        </span>
      </div>
    );
  }

  return (
    <div className={compact ? '' : 'rounded-xl border border-emerald-200 bg-emerald-50/60 p-3'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label
          htmlFor="wa-account-picker"
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800"
        >
          <Phone className="h-3.5 w-3.5" />
          {context ? `Configurando` : 'Cuenta de WhatsApp activa'}
        </label>

        <div className="relative min-w-0">
          <select
            id="wa-account-picker"
            value={value || ''}
            onChange={e => cambiar(e.target.value)}
            className="min-w-0 max-w-full appearance-none rounded-lg border border-emerald-300 bg-white py-2 pl-3 pr-9 text-sm font-medium text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {accountLabel(a)}
                {a.isDefault ? ' — principal' : ''}
                {accountHasProblem(a) ? ` (${!a.hasToken ? 'sin token' : a.statusLabel})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
        </div>

        {activa?.isDefault && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            <Star className="h-3 w-3" /> Principal
          </span>
        )}
      </div>

      {/* Lo que no se puede hacer con esta cuenta se dice con su SALIDA. Un
          bloqueo cuya única respuesta es «no se puede» se lee como una avería. */}
      {accountHasProblem(activa) && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {!activa?.hasToken
              ? 'Esta cuenta no tiene un token utilizable: no podrá enviar. Vuelve a guardarlo en Configuración.'
              : `Esta cuenta está «${activa?.statusLabel}». Revisa su diagnóstico en Configuración.`}
            {' '}El resto de las cuentas siguen funcionando.
          </span>
        </p>
      )}

      {context && activa && (
        <p className="mt-1.5 text-xs text-emerald-900">
          <span className="font-semibold">{accountLabel(activa)}</span>
          <span className="text-emerald-700"> · {context}</span>
        </p>
      )}
    </div>
  );
}
