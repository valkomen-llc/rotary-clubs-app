import { useEffect, useRef } from 'react';
import { useClub } from '../contexts/ClubContext';

interface SEOProps {
    title: string;
    description?: string;
    path?: string;
    image?: string;
    type?: 'website' | 'article' | 'profile';
    jsonLd?: Record<string, any>;
    /** Marca la página como no indexable (paneles, pasos de pago, acuses). */
    noindex?: boolean;
}

/**
 * useSEO — mantiene el <head> al día durante la navegación de la SPA.
 *
 * ⚠️ NO es la fuente principal de las etiquetas SEO. Desde v4.703 el <head> lo
 * resuelve el SERVIDOR (`server/lib/seoRender.js`), antes de mandar el HTML.
 * Tiene que ser así porque los rastreadores de WhatsApp, Facebook, LinkedIn,
 * Slack y Telegram **no ejecutan JavaScript**: leen el documento tal como llega
 * y nunca verían nada de lo que hace este hook.
 *
 * Lo que este hook sigue haciendo, y hace falta, es la navegación interna: al
 * pasar de `/blog` a `/blog/una-noticia` sin recargar, el servidor no vuelve a
 * intervenir y el título del navegador se quedaría en el anterior.
 *
 * ── El defecto que se corrigió en v4.703 ──────────────────────────────────
 *
 * La dirección se componía como `${baseUrl}/#${path}`, herencia del HashRouter
 * que la aplicación abandonó hace decenas de versiones. Eso se escribía en la
 * etiqueta **canonical** de todas las páginas.
 *
 * Un buscador descarta todo lo que va después del `#`, así que
 * `https://sitio.org/#/blog/algo` y `https://sitio.org/#/proyectos/otro` se
 * leían las dos como `https://sitio.org/`. La canonical es la etiqueta con la
 * que una página declara cuál es su dirección buena: el sitio entero venía
 * declarando que **todas sus páginas son la portada**. El efecto es que el
 * buscador indexa una sola dirección por sitio y descarta el resto como
 * duplicados de ella.
 *
 * Nunca volver a componer una dirección pública con `#`.
 */
export function useSEO({ title, description, path, image, type = 'website', jsonLd, noindex }: SEOProps) {
    const { club } = useClub();
    const clubName = (club as any)?.name || 'Rotary';
    const domain = (club as any)?.domain || (typeof window !== 'undefined' ? window.location.host : 'clubplatform.org');
    const baseUrl = `https://${String(domain).replace(/^www\./, '')}`;
    const fullTitle = title.toLowerCase().includes(clubName.toLowerCase()) ? title : `${title} | ${clubName}`;
    const desc = description || `${clubName} — Club miembro de Rotary International. Servicio por encima del interés propio.`;

    // La dirección canónica es la ruta REAL, sin `#`. Si no se pasa `path` se
    // toma la del navegador, que con BrowserRouter ya es la correcta.
    const cleanPath = (path ?? (typeof window !== 'undefined' ? window.location.pathname : '/')) || '/';
    const url = `${baseUrl}${cleanPath === '/' ? '/' : cleanPath.replace(/\/+$/, '')}`;
    const ogImage = image || (club as any)?.logo || '';

    // Estabiliza la referencia del JSON-LD para no re-renderizar sin fin.
    const jsonLdStr = jsonLd ? JSON.stringify(jsonLd) : '';
    const prevJsonLdStr = useRef(jsonLdStr);
    if (jsonLdStr !== prevJsonLdStr.current) {
        prevJsonLdStr.current = jsonLdStr;
    }

    useEffect(() => {
        document.title = fullTitle;

        const metas: Record<string, string> = {
            'description': desc,
            'og:title': fullTitle,
            'og:description': desc,
            'og:url': url,
            'og:type': type,
            'og:image': ogImage,
            'og:site_name': clubName,
            'twitter:card': ogImage ? 'summary_large_image' : 'summary',
            'twitter:title': fullTitle,
            'twitter:description': desc,
            'twitter:image': ogImage,
        };
        if (noindex) metas['robots'] = 'noindex, follow';

        Object.entries(metas).forEach(([key, value]) => {
            if (!value) return;
            // Open Graph usa `property`; description, robots y las de Twitter
            // usan `name`. Poner una de Twitter con `property` es el error
            // clásico: la tarjeta cae al formato pequeño sin decir por qué.
            const attr = key.startsWith('og:') ? 'property' : 'name';
            let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement;
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute(attr, key);
                document.head.appendChild(el);
            }
            el.setAttribute('content', value);
        });

        let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.setAttribute('rel', 'canonical');
            document.head.appendChild(canonical);
        }
        canonical.setAttribute('href', url);

        // El JSON-LD del servidor lleva `id="seo-jsonld"` y describe la misma
        // página con más datos de los que tiene el navegador (la organización,
        // el sitio, las migas). Lo que aporte esta pantalla se escribe en un
        // nodo APARTE para no pisarlo.
        const ldId = 'seo-jsonld-client';
        let ldScript = document.getElementById(ldId) as HTMLScriptElement | null;
        if (prevJsonLdStr.current) {
            if (!ldScript) {
                ldScript = document.createElement('script');
                ldScript.id = ldId;
                ldScript.type = 'application/ld+json';
                document.head.appendChild(ldScript);
            }
            ldScript.textContent = prevJsonLdStr.current;
        } else if (ldScript) {
            ldScript.remove();
        }

        return () => {
            // Se retira SÓLO el nodo propio. Quitar el del servidor dejaría la
            // página sin datos estructurados tras la primera navegación.
            document.getElementById(ldId)?.remove();
        };
    }, [fullTitle, desc, url, type, ogImage, clubName, noindex, prevJsonLdStr.current]);
}

export default useSEO;
