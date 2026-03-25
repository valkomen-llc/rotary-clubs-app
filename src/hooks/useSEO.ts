import { useEffect, useRef } from 'react';
import { useClub } from '../contexts/ClubContext';

interface SEOProps {
    title: string;
    description?: string;
    path?: string;
    image?: string;
    type?: 'website' | 'article' | 'profile';
    jsonLd?: Record<string, any>;
}

/**
 * useSEO — Lightweight alternative to react-helmet.
 * Dynamically updates <title>, meta description, OG tags, and injects JSON-LD.
 * 
 * Skills: SEO Technical + Programmatic SEO
 */
export function useSEO({ title, description, path, image, type = 'website', jsonLd }: SEOProps) {
    const { club } = useClub();
    const clubName = (club as any)?.name || 'Rotary';
    const domain = (club as any)?.domain || 'clubplatform.org';
    const baseUrl = `https://${domain}`;
    const fullTitle = `${title} | ${clubName}`;
    const desc = description || `${clubName} — Club miembro de Rotary International. Servicio por encima del interés propio.`;
    const url = path ? `${baseUrl}/#${path}` : baseUrl;
    const ogImage = image || (club as any)?.logo || '';

    // Stabilize jsonLd reference to prevent infinite re-render loops
    const jsonLdStr = jsonLd ? JSON.stringify(jsonLd) : '';
    const prevJsonLdStr = useRef(jsonLdStr);
    if (jsonLdStr !== prevJsonLdStr.current) {
        prevJsonLdStr.current = jsonLdStr;
    }

    useEffect(() => {
        // Title
        document.title = fullTitle;

        // Meta tags
        const metas: Record<string, string> = {
            'description': desc,
            'og:title': fullTitle,
            'og:description': desc,
            'og:url': url,
            'og:type': type,
            'og:image': ogImage,
            'og:site_name': clubName,
            'twitter:title': fullTitle,
            'twitter:description': desc,
            'twitter:image': ogImage,
        };

        Object.entries(metas).forEach(([key, value]) => {
            if (!value) return;
            const isOg = key.startsWith('og:') || key.startsWith('twitter:');
            const attr = isOg ? 'property' : 'name';
            let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement;
            if (!el) {
                el = document.createElement('meta');
                el.setAttribute(attr, key);
                document.head.appendChild(el);
            }
            el.setAttribute('content', value);
        });

        // Canonical
        let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.setAttribute('rel', 'canonical');
            document.head.appendChild(canonical);
        }
        canonical.setAttribute('href', url);

        // JSON-LD
        const ldId = 'seo-jsonld';
        let ldScript = document.getElementById(ldId) as HTMLScriptElement;
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
            // Cleanup JSON-LD on unmount
            document.getElementById(ldId)?.remove();
        };
    }, [fullTitle, desc, url, type, ogImage, clubName, prevJsonLdStr.current]);
}

export default useSEO;

