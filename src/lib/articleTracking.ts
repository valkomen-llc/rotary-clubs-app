// ════════════════════════════════════════════════════════════════════════════
// El tracking de un artículo en la página pública (v4.1000)
//
// Tres beacons hacia `POST /api/clubs/:clubId/posts/:postId/view`:
//   view   al cargar el artículo (referrer, query con UTM, ancho de pantalla)
//   leave  al salir (segundos de lectura y profundidad de desplazamiento)
//   click  al pulsar un enlace dentro del cuerpo del artículo
//
// `navigator.sendBeacon` sobrevive a la navegación —un `fetch` normal se
// cancela al salir—; con `keepalive` de respaldo donde no exista. No se guarda
// nada en el navegador y no se manda ningún identificador propio: el visitante
// lo deduce el servidor de lo que ya viaja en la petición, con hash y sal.
// ════════════════════════════════════════════════════════════════════════════

const API = import.meta.env.VITE_API_URL || '/api';

const viewIdFor = () => {
    try { return crypto.randomUUID(); } catch { return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
};

const enviar = (url: string, body: Record<string, unknown>) => {
    try {
        const json = JSON.stringify(body);
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            const ok = navigator.sendBeacon(url, new Blob([json], { type: 'application/json' }));
            if (ok) return;
        }
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true }).catch(() => { /* un beacon no falla */ });
    } catch { /* un beacon no falla */ }
};

/**
 * Empieza a medir y devuelve la función que deja de hacerlo. Se llama cuando
 * el artículo REAL (de la base) está en pantalla; los artículos estáticos de
 * muestra no se miden.
 */
export const startArticleTracking = ({ clubId, postId, bodySelector = '[data-article-body]' }: { clubId: string; postId: string; bodySelector?: string }) => {
    if (!clubId || !postId || typeof window === 'undefined') return () => { };
    const url = `${API}/clubs/${encodeURIComponent(clubId)}/posts/${encodeURIComponent(postId)}/view`;
    const viewId = viewIdFor();
    const inicio = Date.now();
    let maxScroll = 0;
    let cerrado = false;

    enviar(url, { kind: 'view', viewId, referrer: document.referrer || '', search: window.location.search || '', width: window.innerWidth || 0 });

    const medirScroll = () => {
        const doc = document.documentElement;
        const total = Math.max(1, (doc.scrollHeight || 0) - (window.innerHeight || 0));
        const pct = Math.min(100, Math.round(((window.scrollY || doc.scrollTop || 0) / total) * 100));
        if (pct > maxScroll) maxScroll = pct;
    };
    const salir = () => {
        if (cerrado) return;
        cerrado = true;
        medirScroll();
        enviar(url, { kind: 'leave', viewId, durationSec: Math.round((Date.now() - inicio) / 1000), scrollPct: maxScroll });
    };
    const alOcultar = () => { if (document.visibilityState === 'hidden') salir(); };
    const alClic = (e: MouseEvent) => {
        const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!a) return;
        const cuerpo = document.querySelector(bodySelector);
        const dentro = cuerpo ? cuerpo.contains(a) : false;
        const cta = a.closest('[data-article-cta]');
        if (!dentro && !cta) return;
        let target = '';
        try { target = new URL(a.href, window.location.href).host; } catch { target = ''; }
        enviar(url, { kind: 'click', viewId, target: cta ? `cta:${target}` : target });
    };

    window.addEventListener('scroll', medirScroll, { passive: true });
    window.addEventListener('pagehide', salir);
    document.addEventListener('visibilitychange', alOcultar);
    document.addEventListener('click', alClic, true);

    return () => {
        salir();
        window.removeEventListener('scroll', medirScroll);
        window.removeEventListener('pagehide', salir);
        document.removeEventListener('visibilitychange', alOcultar);
        document.removeEventListener('click', alClic, true);
    };
};

export default { startArticleTracking };
