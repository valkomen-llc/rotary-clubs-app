// Base de datos en memoria para `npm run test:district-site`.
//
// Reproduce el escenario real del Distrito 4281: la fila de `District` lleva el
// dominio propio; el contenido vive en una fila de `Club`; y conviven el club
// espejo vacío que crea el alta del distrito, el sitio configurado de verdad y
// un club rotario cualquiera que también pertenece al distrito.
//
// Sustituye a `server/lib/db.js` mediante un hook de resolución de módulos, así
// que la ruta que se ejercita es la de producción, sin tocarla.

const SEED = () => ({
    districts: [
        {
            id: 'dist-4281', number: 4281, name: 'Distrito 4281',
            subdomain: null, domain: 'rotary4281.org',
            logo: 'https://cdn/dist-4281.png', footerLogo: null, favicon: null,
            colors: { primary: '#013388', secondary: '#E29C00' }, logoHeaderSize: 200,
        },
    ],
    clubs: [
        { id: 'origen', name: 'Rotary ClubPlatform', subdomain: 'origen', domain: null, type: 'club', settings: [] },

        // El club espejo del alta de /admin/distritos: vinculado y sin ajustes.
        {
            id: 'espejo', name: 'Distrito 4281', subdomain: null, domain: null,
            type: 'district', district: '4281', districtId: 'dist-4281',
            updatedAt: '2026-01-01T00:00:00Z', settings: [],
        },

        // El sitio de verdad, configurado desde el panel.
        {
            id: 'sitio', name: 'Distrito 4281 de Rotary International',
            subdomain: 'distrito-4281-de-rotary-international', domain: null,
            type: 'district', district: '4281', districtId: 'dist-4281',
            updatedAt: '2026-08-01T00:00:00Z', logo: 'https://cdn/sitio-4281.png',
            settings: [
                { key: 'contact_email', value: 'distrito@rotary4281.org' },
                { key: 'color_primary', value: '#123456' },
                { key: 'member_count', value: '100+' },
            ],
        },

        // Un club rotario del distrito. Lleva «4281» en `district` y NO es el
        // sitio del distrito: es la confusión que el criterio tiene que evitar.
        {
            id: 'club-cali', name: 'Rotary Club Cali', subdomain: 'cali', domain: null,
            type: 'club', district: '4281', districtId: 'dist-4281',
            settings: [{ key: 'contact_email', value: 'cali@x.org' }],
        },
    ],
});

export let DATA = SEED();
export const reset = () => { DATA = SEED(); };

const lc = (v) => String(v ?? '').toLowerCase();

const matchOr = (row, or = []) => or.some((cond) => {
    if (cond.domain) return !!row.domain && lc(row.domain) === lc(cond.domain.equals);
    if (cond.subdomain) return !!row.subdomain && lc(row.subdomain) === lc(cond.subdomain.equals);
    return false;
});

const withInclude = (row) => (row ? { ...row, settings: row.settings || [], _count: { products: 0, events: 0 } } : null);

const db = {
    prisma: {
        club: {
            findFirst: async ({ where }) => withInclude(
                where.subdomain === 'origen'
                    ? DATA.clubs.find((c) => c.subdomain === 'origen')
                    : DATA.clubs.find((c) => matchOr(c, where.OR))
            ),
            findUnique: async ({ where }) => withInclude(DATA.clubs.find((c) => c.id === where.id)),
        },
        district: {
            findFirst: async ({ where }) => DATA.districts.find((d) => matchOr(d, where.OR)) || null,
            findUnique: async ({ where }) => DATA.districts.find((d) => d.id === where.id) || null,
        },
    },
    query: async (sql, params = []) => {
        const s = String(sql).replace(/\s+/g, ' ');

        // Los candidatos a sitio del distrito, con su cantidad de ajustes.
        if (s.includes('FROM "Club" c') && s.includes('settingsCount')) {
            const [districtId, types, number, subdomain] = params;
            const rows = DATA.clubs
                .filter((c) =>
                    (districtId && c.districtId === districtId) ||
                    (types.includes(lc(c.type)) && c.district && String(c.district).trim() === number) ||
                    (subdomain && lc(c.subdomain) === subdomain))
                .map((c) => ({
                    id: c.id, type: c.type, districtId: c.districtId, district: c.district,
                    subdomain: c.subdomain, updatedAt: c.updatedAt, settingsCount: (c.settings || []).length,
                }));
            return { rows };
        }

        // El segundo intento por dominio guardado «sucio»: en este escenario los
        // dominios están limpios, así que no rescata nada.
        if (/SELECT id FROM "(Club|District)"/.test(s)) return { rows: [] };

        return { rows: [] };
    },
};

export default db;
