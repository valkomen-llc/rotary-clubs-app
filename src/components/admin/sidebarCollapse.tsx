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
// · v4.1341 — ARRANCA MINIMIZADA, SIEMPRE. Lo pidió el cliente: el menú
//   minimizado se ve mejor y maximizarlo es opcional. Maximizar vale sólo
//   para la sesión de ESTA pestaña (sessionStorage, `admin-sidebar-expanded`):
//   sobrevive a navegar y a recargar, pero cada visita nueva vuelve a abrir
//   minimizada. La preferencia anterior (`admin-sidebar-collapsed` en
//   localStorage, v4.1333) se IGNORA a propósito: quien la guardó en «0»
//   quedaría maximizado para siempre. Si el almacenamiento falla, minimizada.
//
// ⚠️ EL TÍTULO FLOTANTE VA FUERA DE LA BARRA, con posición fija. La lista del
// menú tiene `overflow-y: auto`, y eso obliga también a recortar en
// horizontal: un título posicionado dentro de ella quedaría cortado contra el
// borde de los 80 px. Por eso se mide el ícono y se pinta un único globo fijo
// al lado.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';

/** «1» = maximizada en esta pestaña. Sin la marca: minimizada (lo de fábrica). */
export const SIDEBAR_EXPANDED_KEY = 'admin-sidebar-expanded';
const DESKTOP_QUERY = '(min-width: 1024px)';

const readCollapsed = () => {
    try { return sessionStorage.getItem(SIDEBAR_EXPANDED_KEY) !== '1'; } catch { return true; }
};
const storeCollapsed = (collapsed: boolean) => {
    try {
        if (collapsed) sessionStorage.removeItem(SIDEBAR_EXPANDED_KEY);
        else sessionStorage.setItem(SIDEBAR_EXPANDED_KEY, '1');
    } catch { /* sin almacenamiento */ }
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
        storeCollapsed(next);
    }, []);
    // Sobre el estado actual, no sobre lo guardado: si el almacenamiento falla,
    // el botón tiene que seguir funcionando en los dos sentidos.
    const toggle = useCallback(() => setCollapsed(c => {
        const next = !c;
        storeCollapsed(next);
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
