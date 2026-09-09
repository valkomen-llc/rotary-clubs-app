/**
 * Espejo MÍNIMO del criterio de las acciones en bloque sobre postulaciones.
 * v4.1024.0
 *
 * PARA QUÉ EXISTE: para pintar la previsión —«se eliminarán 3 y se archivarán
 * 5»— mientras se marcan casillas, sin pagar un viaje de red por cada clic.
 * Es el mismo reparto que `fxRates.ts`: el navegador MUESTRA, el servidor
 * DECIDE. La prueba compara las SALIDAS de los dos módulos sobre una matriz de
 * filas; con dos criterios, la pantalla prometería eliminar algo que el
 * servidor archiva y lo que se separaría en silencio es si un registro
 * financiero sobrevive.
 *
 * ⚠️ NO TRAE `BULK_CAPABILITY` NI `validateBulkPlan`, y su ausencia es
 * deliberada: quién puede eliminar y si el plan se ejecuta lo resuelve el
 * servidor. Con esas dos acá, la pantalla ofrecería una acción que la API
 * rechaza —o peor, la daría por hecha—. Lo comprueba una prueba que verifica
 * que NO estén.
 *
 * Al tocar `server/lib/projectFairBulk.js`, tocar este archivo.
 */

export const BULK_MAX = 300;

export type BulkAction = 'archive' | 'restore' | 'delete' | 'status' | 'tag';

export type BulkOutcome =
    | 'eliminada' | 'archivada' | 'restaurada' | 'actualizada'
    | 'sin_cambio' | 'no_existe' | 'error';

export const OUTCOME_LABELS: Record<string, string> = {
    eliminada: 'Eliminada definitivamente',
    archivada: 'Archivada',
    restaurada: 'Restaurada',
    actualizada: 'Actualizada',
    sin_cambio: 'Sin cambios',
    no_existe: 'No encontrada',
    error: 'Error',
};

export const REASON_LABELS: Record<string, string> = {
    tiene_cobro: 'registró un cobro — se archiva en vez de eliminarse',
    ya_archivada: 'ya estaba archivada',
    no_archivada: 'no estaba archivada',
    otra_edicion: 'pertenece a otra edición',
    mismo_estado: 'ya estaba en ese estado',
    ya_tenia_etiqueta: 'ya tenía esa etiqueta',
    no_tenia_etiqueta: 'no tenía esa etiqueta',
};

export interface BulkRow {
    id?: string | null;
    publicRef?: string | null;
    projectName?: string | null;
    clubName?: string | null;
    status?: string | null;
    paymentStatus?: string | null;
    paidAt?: string | null;
    refundedAt?: string | null;
    amountReceived?: number | null;
    refundedAmount?: number | null;
    stripeChargeId?: string | null;
    stripePaymentIntentId?: string | null;
    archivedAt?: string | null;
}

export interface BulkItem {
    id: string | null;
    label: string;
    outcome: BulkOutcome;
    reason: string | null;
}

export interface BulkPlan {
    action: BulkAction;
    items: BulkItem[];
    totals: Record<string, number>;
    count: number;
}

const OUTCOMES: BulkOutcome[] = ['eliminada', 'archivada', 'restaurada', 'actualizada', 'sin_cambio', 'no_existe', 'error'];

const numeric = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Las dos formas del mismo dato: la cruda de la base y la que llega mapeada. */
export const paymentStatusOf = (row?: BulkRow | null): string =>
    String(row?.status ?? row?.paymentStatus ?? '').trim();

/**
 * ¿Tocó dinero alguna vez? Basta una señal: equivocarse hacia «no cobró»
 * borra un registro financiero; hacia «cobró» sólo archiva de más, que se
 * deshace. Los identificadores de Stripe sólo llegan acá con permiso
 * financiero, así que pueden faltar — el veredicto que vale lo da el servidor.
 */
export const hasFinancialTrace = (row?: BulkRow | null): boolean => {
    if (!row) return false;
    const status = paymentStatusOf(row);
    if (status === 'paid' || status === 'refunded') return true;
    if (row.paidAt || row.refundedAt) return true;
    if (numeric(row.amountReceived) > 0 || numeric(row.refundedAmount) > 0) return true;
    return !!(row.stripeChargeId || row.stripePaymentIntentId);
};

export const isArchived = (row?: BulkRow | null): boolean => !!row?.archivedAt;

export const dispositionFor = (row: BulkRow | null | undefined, action: BulkAction): { outcome: BulkOutcome; reason: string | null } => {
    if (!row) return { outcome: 'no_existe', reason: null };

    if (action === 'delete') {
        if (hasFinancialTrace(row)) {
            return isArchived(row)
                ? { outcome: 'sin_cambio', reason: 'ya_archivada' }
                : { outcome: 'archivada', reason: 'tiene_cobro' };
        }
        return { outcome: 'eliminada', reason: null };
    }
    if (action === 'archive') {
        return isArchived(row)
            ? { outcome: 'sin_cambio', reason: 'ya_archivada' }
            : { outcome: 'archivada', reason: null };
    }
    if (action === 'restore') {
        return isArchived(row)
            ? { outcome: 'restaurada', reason: null }
            : { outcome: 'sin_cambio', reason: 'no_archivada' };
    }
    return { outcome: 'actualizada', reason: null };
};

export const labelOf = (row?: BulkRow | null): string => {
    const ref = String(row?.publicRef || '').trim();
    const name = String(row?.projectName || '').trim();
    const club = String(row?.clubName || '').trim();
    return [ref, name || club || null].filter(Boolean).join(' · ') || String(row?.id || '');
};

export const planBulk = (rows: (BulkRow | null | undefined)[], action: BulkAction): BulkPlan => {
    const items: BulkItem[] = (rows || []).map((row) => {
        const { outcome, reason } = dispositionFor(row, action);
        return { id: row?.id || null, label: labelOf(row), outcome, reason };
    });
    const totals: Record<string, number> = OUTCOMES.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as Record<string, number>);
    for (const it of items) totals[it.outcome] = (totals[it.outcome] || 0) + 1;
    return { action, items, totals, count: items.length };
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const describeBulkPlan = (plan: BulkPlan): string => {
    const t = plan?.totals || {};
    const partes: string[] = [];
    if (t.eliminada) partes.push(`se ${plan.action === 'delete' && t.eliminada === 1 ? 'eliminará' : 'eliminarán'} ${plural(t.eliminada, 'postulación', 'postulaciones')} definitivamente`);
    if (t.archivada) partes.push(`se ${t.archivada === 1 ? 'archivará' : 'archivarán'} ${plural(t.archivada, 'postulación', 'postulaciones')}`);
    if (t.restaurada) partes.push(`se ${t.restaurada === 1 ? 'restaurará' : 'restaurarán'} ${plural(t.restaurada, 'postulación', 'postulaciones')}`);
    if (t.actualizada) partes.push(`se ${t.actualizada === 1 ? 'actualizará' : 'actualizarán'} ${plural(t.actualizada, 'postulación', 'postulaciones')}`);
    if (t.sin_cambio) partes.push(`${plural(t.sin_cambio, 'queda', 'quedan')} sin cambios`);
    if (!partes.length) return 'No hay nada que hacer con la selección.';
    return `${partes.join(' y ')}.`;
};

export const bulkWarnings = (plan: BulkPlan): string[] => {
    const t = plan?.totals || {};
    const avisos: string[] = [];
    if (t.eliminada) {
        avisos.push('Lo eliminado NO se puede recuperar: se va con la postulación la cuenta con la que ese club entra a su panel, su Formulación, su solicitud del FDD y sus adjuntos.');
    }
    if (plan?.action === 'delete' && t.archivada) {
        avisos.push('Las que registraron un cobro no se eliminan: se archivan, salen del listado y se pueden restaurar.');
    }
    if (t.archivada && plan?.action === 'archive') {
        avisos.push('Archivar sale del listado y no borra nada: el club conserva su acceso y sus formularios.');
    }
    return avisos;
};

export const ARCHIVE_VIEWS = ['activas', 'archivadas', 'todas'] as const;
export type ArchiveView = typeof ARCHIVE_VIEWS[number];
export const ARCHIVE_VIEW_LABELS: Record<string, string> = {
    activas: 'Sin archivar',
    archivadas: 'Sólo archivadas',
    todas: 'Todas',
};
export const normalizeArchiveView = (value: unknown): ArchiveView => {
    const v = String(value ?? '').trim().toLowerCase();
    return (ARCHIVE_VIEWS as readonly string[]).includes(v) ? (v as ArchiveView) : 'activas';
};
