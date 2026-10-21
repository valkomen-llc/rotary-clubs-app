import { build } from 'esbuild';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const tempFile = resolve(process.cwd(), '.temp-test-render-district4281.mjs');

const runnerSrc = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from './src/components/admin/AdminLayout.tsx';
import { LanguageProvider } from './src/contexts/LanguageContext.tsx';
import { ClubContext } from './src/contexts/ClubContext.tsx';
import { AuthProvider } from './src/hooks/useAuth.tsx';

// Mock browser globals
globalThis.window = {
    location: {
        hostname: 'rotary4281.org',
        pathname: '/admin/analytics',
        search: '',
        protocol: 'https:',
        host: 'rotary4281.org',
        hash: ''
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: {
        getItem: (k) => {
            if (k === 'rotary_token') return 'mock_token_4281';
            if (k === 'rotary_user') return JSON.stringify({
                id: 'd1ce40a4-f481-4924-aa99-81870a08035c',
                email: 'rotarydistrito4281@gmail.com',
                role: 'club_admin',
                clubId: '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a'
            });
            if (k === 'rotary_club') return JSON.stringify({
                id: '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a',
                name: 'Distrito 4281 de Rotary International',
                domain: 'rotary4281.org',
                subdomain: 'distrito-4281-de-rotary-international',
                type: 'district',
                status: 'active'
            });
            return null;
        },
        setItem: () => {},
        removeItem: () => {}
    }
};

globalThis.document = {
    title: 'Distrito 4281',
    querySelector: () => null,
    getElementsByTagName: () => [{ appendChild: () => {} }],
    addEventListener: () => {},
    removeEventListener: () => {}
};

globalThis.localStorage = globalThis.window.localStorage;
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const mockClub = {
    id: '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a',
    name: 'Distrito 4281 de Rotary International',
    domain: 'rotary4281.org',
    subdomain: 'distrito-4281-de-rotary-international',
    type: 'district',
    status: 'active'
};

const mockClubContext = {
    club: mockClub,
    isLoading: false,
    isMainPlatform: false,
    isAppPortal: false,
    isDraft: false,
    bannerVisible: false,
    setBannerVisible: () => {},
    developmentBannerVisible: false,
    setDevelopmentBannerVisible: () => {},
    refreshClub: async () => {},
    isProduction: true
};

try {
    const html = renderToString(
        React.createElement(MemoryRouter, { initialEntries: ['/admin/analytics'] },
            React.createElement(ClubContext.Provider, { value: mockClubContext },
                React.createElement(AuthProvider, null,
                    React.createElement(LanguageProvider, null,
                        React.createElement(AdminLayout, { wide: true },
                            React.createElement('div', { id: 'test-child' }, 'Contenido del modulo de Analiticas')
                        )
                    )
                )
            )
        )
    );

    console.log('✅ RENDER EXITOSO de AdminLayout para Distrito 4281!');
    console.log('Longitud de HTML renderizado:', html.length, 'bytes');
    if (html.includes('Bóveda de Fondos') || html.includes('Conciliaciones y Desembolsos')) {
        console.log('✅ El ítem de Bóveda / Conciliaciones (con icono Landmark) se dibujó correctamente en el menú!');
    } else {
        console.log('ℹ️ HTML renderizado no contiene el texto de la bóveda (posiblemente condicionado a permisos), pero no lanzó excepción.');
    }
    process.exit(0);
} catch (err) {
    console.error('❌ FALLÓ EL RENDER de AdminLayout:', err);
    process.exit(1);
}
`;

writeFileSync(tempFile, runnerSrc);

try {
    await build({
        entryPoints: [tempFile],
        bundle: true,
        outfile: tempFile + '.bundle.mjs',
        platform: 'node',
        format: 'esm',
        packages: 'external',
        jsx: 'automatic',
        define: {
            'import.meta.env': '{}'
        }
    });

    const { execSync } = await import('node:child_process');
    const out = execSync(`node "${tempFile}.bundle.mjs"`, { encoding: 'utf8' });
    console.log(out);
} finally {
    try { unlinkSync(tempFile); } catch {}
    try { unlinkSync(tempFile + '.bundle.mjs'); } catch {}
}
