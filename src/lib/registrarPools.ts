// ════════════════════════════════════════════════════════════════════
// EL POOL REGISTRADOR DE UN DOMINIO — v4.877
//
// Cada dominio que la plataforma matricula pertenece a un POOL: la billetera
// que lo financió. La asignación se guarda como una fila de
// `CrowdfundActivation` (cuenta como dominio activo y genera su comisión
// recurrente), y se elige a mano desde la ficha del sitio.
//
// Este archivo es el CRITERIO y es PURO: sin red, sin base y sin DOM. Lo que
// vive acá es qué se puede elegir, cómo se rotula y —lo que más importa— qué
// significa cada valor al guardar.
//
// ── ⚠️ «NO LO TOQUES» Y «QUITAR LA ASIGNACIÓN» SON DOS COSAS ────────
//
// Es la regla de la que cuelga todo lo demás, porque equivocarse acá borra un
// dato de facturación sin que nadie se entere:
//
//   undefined → todavía no se sabe cuál es. La clave NO viaja en la petición
//               y el servidor no toca la activación (`if (registrarPoolId !==
//               undefined)` en `updateClub`).
//   ''        → el operador eligió «Sin asignar». La clave SÍ viaja, y el
//               servidor BORRA la activación.
//
// La distinción no es teórica. `GET /admin/clubs` devuelve `SELECT c.*` y
// `registrarPoolId` NO es una columna de `Club` —se deriva de la activación—,
// así que la lista nunca lo trae: sólo lo sabe el detalle. Tomando el valor
// ausente por «sin asignar», un detalle que falla convierte el siguiente
// guardado en un borrado silencioso de la activación. `JSON.stringify` omite
// las claves `undefined`, así que dejarlo sin definir es exactamente lo que
// hace que la petición no la mencione.
//
// ── EL VALOR ACTUAL SIEMPRE ES UNA OPCIÓN ───────────────────────────
//
// Aunque el pool esté sin cupo, y aunque ya no figure en el catálogo. Si no
// estuviera en la lista, el `select` se pintaría vacío y el primer guardado
// movería la asignación sin que nadie lo pidiera — el mismo defecto por otra
// puerta.
//
// ── SIN CUPO SE AVISA, NO SE BLOQUEA ────────────────────────────────
//
// Un pool lleno es un dato para decidir, no una prohibición: el operador puede
// saber que se amplió, y bloquearlo lo dejaría sin salida — «avisar sin dar
// salida deja un callejón». Mismo criterio que los avisos que no bloquean del
// panel de tarifas (v4.854) y que «la lista ayuda a escribir; no cierra los
// valores aceptados» (v4.706).
// ════════════════════════════════════════════════════════════════════

/** Lo que el operador eligió para dejar el dominio sin pool. */
export const SIN_ASIGNAR = '';

/** Una fila tal como la devuelve `GET /admin/crowdfund/pools`. */
export interface PoolRow {
    id: string;
    registrarName?: string | null;
    totalUnits?: number | null;
    activeUnits?: number | null;
    costPerUnit?: number | null;
    currency?: string | null;
}

export interface PoolCapacity {
    /** Cuántos dominios caben. */
    total: number;
    /** Cuántos hay activos hoy. */
    active: number;
    /** Cuántos quedan. Nunca negativo. */
    available: number;
    /** No queda cupo. */
    full: boolean;
}

export interface PoolOption {
    id: string;
    label: string;
    capacity: PoolCapacity | null;
    /** Es el pool asignado hoy a este sitio. */
    current: boolean;
    /** Está asignado y ya no figura en el catálogo. */
    missing: boolean;
    /** Sin cupo. Se puede elegir igual; se avisa. */
    full: boolean;
}

const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Limpia lo que devuelva el endpoint. Tolerante a propósito: una respuesta con
 * otra forma —una versión anterior de la API, un error devuelto como objeto—
 * no puede tumbar el formulario del sitio.
 */
export const normalizePools = (raw: unknown): PoolRow[] => {
    const lista = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { pools?: unknown })?.pools)
            ? (raw as { pools: unknown[] }).pools
            : [];
    const vistos = new Set<string>();
    const out: PoolRow[] = [];
    for (const p of lista) {
        const id = typeof (p as PoolRow)?.id === 'string' ? (p as PoolRow).id.trim() : '';
        if (!id || vistos.has(id)) continue;
        vistos.add(id);
        const row = p as PoolRow;
        out.push({
            id,
            registrarName: typeof row.registrarName === 'string' ? row.registrarName : null,
            totalUnits: num(row.totalUnits),
            activeUnits: num(row.activeUnits),
            costPerUnit: num(row.costPerUnit),
            currency: typeof row.currency === 'string' ? row.currency : null,
        });
    }
    return out;
};

/**
 * El cupo, DERIVADO de las dos cifras primitivas.
 *
 * El endpoint también manda `availableUnits`, y no se usa a propósito: con dos
 * fuentes, el número del aviso podría contradecir al «2/3» del propio rótulo.
 */
export const poolCapacity = (pool: PoolRow): PoolCapacity => {
    const total = Math.max(0, Math.round(num(pool.totalUnits)));
    const active = Math.max(0, Math.round(num(pool.activeUnits)));
    return { total, active, available: Math.max(0, total - active), full: active >= total };
};

/** Cómo se nombra un pool en el desplegable. */
export const poolLabel = (pool: PoolRow): string => {
    const cap = poolCapacity(pool);
    const nombre = (pool.registrarName || '').trim() || 'Pool sin club';
    return `POOL #${pool.id.slice(0, 8)} · ${nombre} (${cap.active}/${cap.total} dominios)`;
};

/**
 * Las opciones del desplegable para un sitio cuyo pool actual es `currentId`.
 *
 * `currentId` puede ser `undefined` (todavía no se sabe) o `''` (sin asignar);
 * en los dos casos no hay valor actual que preservar.
 */
export const buildPoolOptions = (pools: PoolRow[], currentId?: string | null): PoolOption[] => {
    const actual = typeof currentId === 'string' ? currentId.trim() : '';
    const out: PoolOption[] = pools.map(p => {
        const cap = poolCapacity(p);
        return {
            id: p.id,
            label: poolLabel(p),
            capacity: cap,
            current: !!actual && p.id === actual,
            missing: false,
            full: cap.full,
        };
    });

    // ⚠️ El pool asignado que ya no figura en el catálogo entra igual. Sin él,
    // el desplegable no tendría cómo representar el valor guardado y el primer
    // guardado lo movería solo.
    if (actual && !out.some(o => o.id === actual)) {
        out.push({
            id: actual,
            label: `POOL #${actual.slice(0, 8)} · ya no figura en el catálogo`,
            capacity: null,
            current: true,
            missing: true,
            full: false,
        });
    }
    return out;
};

/**
 * Si la clave `registrarPoolId` tiene que viajar en la petición.
 *
 * Es la otra mitad de la regla de arriba: mientras no se sepa cuál es, no se
 * manda, y entonces el servidor no la toca.
 */
export const shouldSendPool = (value: string | undefined | null): boolean =>
    typeof value === 'string';

/** Motivos por los que la asignación merece un aviso. Ninguno bloquea. */
export type PoolNoticeKind = 'missing' | 'full' | 'sin_dominio' | null;

export interface PoolNotice {
    kind: PoolNoticeKind;
    text: string;
}

/**
 * Qué hay que decirle al operador sobre lo que tiene elegido.
 *
 * `domain` es el dominio propio del sitio: la activación guarda el nombre del
 * dominio, así que asignar un pool a un sitio que todavía no lo tiene deja la
 * fila sin ese dato hasta que se guarde el dominio. Eso se dice; no se
 * esconde el control ni se impide la asignación.
 */
export const poolNotice = (options: PoolOption[], value: string | undefined | null, domain?: string | null): PoolNotice | null => {
    if (!value) return null;
    const elegido = options.find(o => o.id === value);
    if (!elegido) return null;

    if (elegido.missing) {
        return {
            kind: 'missing',
            text: 'El pool asignado ya no figura en el catálogo. Se conserva tal cual hasta que elijas otro; si lo cambias, no se puede volver a él desde acá.',
        };
    }
    if (elegido.full) {
        const cap = elegido.capacity;
        return {
            kind: 'full',
            text: `Este pool no tiene cupo libre (${cap?.active ?? 0}/${cap?.total ?? 0} dominios). Se puede asignar igual, pero quedará por encima de su capacidad declarada.`,
        };
    }
    if (!(domain || '').trim()) {
        return {
            kind: 'sin_dominio',
            text: 'Este sitio todavía no tiene dominio propio. La activación se registra igual y toma el nombre del dominio en cuanto lo guardes.',
        };
    }
    return null;
};
