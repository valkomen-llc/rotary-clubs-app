// Base en memoria para `npm run test:redirects`.
//
// Cubre los dos caminos de resolución: un club con su propio dominio y un
// DISTRITO, cuyo dominio vive en su fila de `District` y cuyo contenido —las
// redirecciones incluidas— vive en la fila de `Club` de tipo distrito.

const SEED = () => ({
    clubs: [
        { id: 'cali', name: 'Rotary Club Cali', domain: 'rotaryclubcali.org', subdomain: 'cali', type: 'club' },
        {
            id: 'sitio-4281', name: 'Distrito 4281 de Rotary International', domain: null,
            subdomain: 'distrito-4281', type: 'district', district: '4281', districtId: 'dist-4281',
            updatedAt: '2026-08-01T00:00:00Z',
        },
    ],
    districts: [
        { id: 'dist-4281', number: 4281, name: 'Distrito 4281', domain: 'rotary4281.org', subdomain: null },
    ],
    settings: [
        { clubId: 'cali', key: 'link_redirects', value: JSON.stringify([{ from: '/donar', to: 'https://donar.org' }]) },
        {
            clubId: 'sitio-4281', key: 'link_redirects',
            value: JSON.stringify([{ from: '/conferencia', to: 'https://inscripciones.org', permanent: true }]),
        },
    ],
});

export let DATA = SEED();
export const reset = () => { DATA = SEED(); };

// Con `true`, toda consulta lanza: sirve para comprobar la degradación. Se
// cambia por función porque un binding exportado es de sólo lectura desde fuera.
let FAIL = false;
export const setFail = (v) => { FAIL = v; };

const lc = (v) => String(v ?? '').toLowerCase();

const db = {
    prisma: {},
    query: async (sql, params = []) => {
        if (FAIL) throw new Error('base caída (a propósito, en la prueba)');
        const s = String(sql).replace(/\s+/g, ' ');

        if (s.includes('FROM "Club"') && s.includes('domain') && !s.includes('settingsCount')) {
            const [candidates, label] = params;
            const hit = DATA.clubs.find(c =>
                (c.domain && candidates.includes(lc(c.domain))) ||
                (label && lc(c.subdomain) === label));
            return { rows: hit ? [{ id: hit.id }] : [] };
        }

        if (s.includes('FROM "District"')) {
            const [candidates, label] = params;
            const hit = DATA.districts.find(d =>
                (d.domain && candidates.includes(lc(d.domain))) ||
                (label && lc(d.subdomain) === label));
            return { rows: hit ? [{ id: hit.id, number: hit.number, subdomain: hit.subdomain }] : [] };
        }

        // Los candidatos a sitio del distrito (DISTRICT_SITE_SQL).
        if (s.includes('FROM "Club" c') && s.includes('settingsCount')) {
            const [districtId, number, subdomain] = params;
            const rows = DATA.clubs
                .filter(c =>
                    (districtId && c.districtId === districtId) ||
                    (c.district && String(c.district).trim() === number) ||
                    (subdomain && lc(c.subdomain) === subdomain))
                .map(c => ({
                    id: c.id, name: c.name, type: c.type, districtId: c.districtId, district: c.district,
                    subdomain: c.subdomain, updatedAt: c.updatedAt,
                    settingsCount: DATA.settings.filter(x => x.clubId === c.id).length,
                    isDistrictAdminSite: false,
                }));
            return { rows };
        }

        if (s.includes('FROM "Setting"')) {
            const [clubId, key] = params;
            const hit = DATA.settings.find(x => x.clubId === clubId && x.key === key);
            return { rows: hit ? [{ value: hit.value }] : [] };
        }

        return { rows: [] };
    },
};

export default db;
