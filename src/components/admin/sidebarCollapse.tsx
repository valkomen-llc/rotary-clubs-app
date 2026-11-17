// ════════════════════════════════════════════════════════════════════
// Barra lateral del panel: minimizar / maximizar (v4.1333.0)
//
// Vale para TODOS los sitios del ecosistema (el panel de cualquier club,
// distrito, la Feria y el administrador central usan el mismo AdminLayout).
//
// · Minimizada: sólo los íconos (80 px); al pasar el cursor o llegar con el
//   teclado a un ícono aparece su título. Maximizada: como siempre (288 px).
// · Sólo en escritorio (≥ 1024 px). En el teléfono el menú es un cajón que se
//   abre entero: minimizarlo no ahorraría nada y escondería los nombres.
// · La preferencia se recuerda en ESTE navegador (es comodidad, no un dato):
//   si el almacenamiento falla, el menú arranca maximizado.
//
// ⚠️ EL TÍTULO FLOTANTE VA FUERA DE LA BARRA, con posición fija. La lista del
// menú tiene `overflow-y: auto`, y eso obliga también a recortar en
// horizontal: un título posicionado dentro de ella quedaría cortado contra el
// borde de los 80 px. Por eso se mide el ícono y se pinta un único globo fijo
// al lado.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';

export const SIDEBAR_COLLAPSED_KEY = 'admin-sidebar-collapsed';
const DESKTOP_QUERY = '(min-width: 1024px)';

const readCollapsed = () => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
};
const isDesktopNow = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_QUERY).matches
    : true);

/** Estado de la barra: preferencia guardada + si estamos en escritorio. */
export const useSidebarCollapse = () => {
    const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
    const [isDesktop, setIsDesktop] = useState<boolean>(isDesktopNow);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const mq = window.matchMedia(DESKTOP_QUERY);
        const on = () => setIsDesktop(mq.matches);
        on();
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    }, []);

    const setAndStore = useCallback((next: boolean) => {
        setCollapsed(next);
        try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* sin almacenamiento */ }
    }, []);
    // Sobre el estado actual, no sobre lo guardado: si el almacenamiento falla,
    // el botón tiene que seguir funcionando en los dos sentidos.
    const toggle = useCallback(() => setCollapsed(c => {
        const next = !c;
        try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* sin almacenamiento */ }
        return next;
    }), []);

    return { collapsed, isDesktop, mini: collapsed && isDesktop, setCollapsed: setAndStore, toggle };
};

export interface NavTip { label: string; top: number; left: number }

/**
 * El título flotante de los íconos. Devuelve el globo visible (o null) y los
 * manejadores para cada ícono. Con la barra maximizada no hace nada: el
 * título ya se lee al lado del ícono.
 */
export const useNavTooltip = (enabled: boolean) => {
    const [tip, setTip] = useState<NavTip | null>(null);
    useEffect(() => { if (!enabled) setTip(null); }, [enabled]);
    const show = useCallback((label: string) => (e: React.SyntheticEvent<HTMLElement>) => {
        if (!enabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
    }, [enabled]);
    const hide = useCallback(() => setTip(null), []);
    const propsFor = useCallback((label: string) => (enabled ? {
        onMouseEnter: show(label), onFocus: show(label), onMouseLeave: hide, onBlur: hide,
    } : {}), [enabled, show, hide]);
    return { tip, propsFor, hide };
};

/** El globo, con posición fija para que la barra no lo recorte. */
export const SidebarTooltip = ({ tip }: { tip: NavTip | null }) => (tip ? (
    <div role="tooltip"
        className="pointer-events-none fixed z-[200] -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-bold text-white shadow-xl"
        style={{ top: tip.top, left: tip.left }}>
        <span className="absolute left-0 top-1/2 -ml-1 h-2 w-2 -translate-y-1/2 rotate-45 bg-gray-900" aria-hidden="true" />
        {tip.label}
    </div>
) : null);
