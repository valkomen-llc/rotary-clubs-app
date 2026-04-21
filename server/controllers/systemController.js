import db from '../lib/db.js';
import crypto from 'crypto';

// Ultra-fast in-memory cache (1 hour)
let skinsCache = null;
let lastCacheUpdate = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export const getFooterSkins = async (req, res) => {
    try {
        const now = Date.now();
        if (skinsCache && (now - lastCacheUpdate < CACHE_TTL)) {
            console.log("Serving footer skins from cache");
            return res.json(skinsCache);
        }

        const skins = ['club', 'district', 'association', 'colrotarios'];
        const result = await db.query(
            "SELECT key, value FROM \"Setting\" WHERE key IN ('footer_skin_club', 'footer_skin_district', 'footer_skin_association', 'footer_skin_colrotarios') AND \"clubId\" IS NULL"
        );

        const results = {};
        skins.forEach(type => {
            const key = `footer_skin_${type}`;
            const row = result.rows.find(r => r.key === key);
            results[type] = row ? JSON.parse(row.value) : getDefaultSkin(type);
        });

        // Update cache
        skinsCache = results;
        lastCacheUpdate = now;

        res.json(results);
    } catch (error) {
        console.error('Fatal error fetching footer skins:', error);
        res.status(500).json({ error: 'Error de carga en base de datos', details: error.message });
    }
};

export const updateFooterSkin = async (req, res) => {
    const { type } = req.params;
    const { config } = req.body;
    const key = `footer_skin_${type}`;

    try {
        const val = JSON.stringify(config);
        
        // Nuclear approach: Delete then Insert to bypass idiosyncratic Unique Constraint behaviors with NULLs
        await db.query('DELETE FROM "Setting" WHERE key = $1 AND "clubId" IS NULL', [key]);
        await db.query(
            'INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt") VALUES ($1, $2, $3, NULL, NOW())',
            [crypto.randomUUID(), key, val]
        );

        // Invalidate cache
        skinsCache = null;
        lastCacheUpdate = 0;

        res.json({ message: `Skin ${type} actualizado exitosamente` });
    } catch (error) {
        console.error('Error updating footer skin:', error);
        res.status(500).json({ 
            error: 'Error de Escritura DB', 
            details: error.message,
            code: error.code
        });
    }
};

export const getFooterSkinPublic = async (req, res) => {
    try {
        const { type } = req.query;
        if (!type) return res.status(400).json({ error: 'Tipo requerido' });

        const now = Date.now();
        // Use cache if available
        if (skinsCache && (now - lastCacheUpdate < CACHE_TTL)) {
            const cached = skinsCache[type];
            if (cached) return res.json(cached);
        }

        // If not in cache or expired, fetch it
        const setting = await prisma.setting.findFirst({
            where: {
                key: `footer_skin_${type}`,
                clubId: null
            }
        });

        const config = setting ? JSON.parse(setting.value) : getDefaultSkin(type);
        
        res.json(config);
    } catch (error) {
        console.error('Public footer fetch error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
};

const getDefaultSkin = (type) => {
    const baseMenu2 = [
        { label: 'Aporte Voluntario', href: '#/maneras-de-contribuir' },
        { label: 'Comunícate con nosotros', href: '#/contacto' },
        { label: 'Rotary.org', href: 'https://rotary.org', external: true },
        { label: 'Pongamos Fin a la Polio', href: 'https://endpolio.org', external: true }
    ];

    switch(type) {
        case 'association':
            return {
                logoTop: "https://app.clubplatform.org/rotary-logo-white.png",
                logoBottom: "https://app.clubplatform.org/logo-end-polio.svg",
                menu1Title: "Nuestra Red",
                menu1Items: [
                    { label: 'Acerca de Rotary', href: '#/quienes-somos' },
                    { label: 'Historia', href: '#/nuestra-historia' },
                    { label: 'Junta Directiva', href: '#/nuestra-junta-directiva' },
                    { label: 'Programa de Intercambios', href: '#/intercambio-jovenes' }
                ],
                menu2Title: "Realiza una Acción",
                menu2Items: baseMenu2
            };
        case 'district':
            return {
                logoTop: "https://app.clubplatform.org/rotary-logo-white.png",
                logoBottom: "https://app.clubplatform.org/logo-end-polio.svg",
                menu1Title: "El Distrito",
                menu1Items: [
                    { label: 'Gobernación', href: '#/gobernacion' },
                    { label: 'Clubes del Distrito', href: '#/clubes' },
                    { label: 'Historia del Distrito', href: '#/historia' },
                    { label: 'La Fundación Rotaria', href: '#/la-fundacion-rotaria' }
                ],
                menu2Title: "Realiza una Acción",
                menu2Items: baseMenu2
            };
        case 'colrotarios':
            return {
                logoTop: "https://app.clubplatform.org/rotary-logo-white.png",
                logoBottom: "https://app.clubplatform.org/logo-end-polio.svg",
                menu1Title: "Fundación",
                menu1Items: [
                    { label: 'Quiénes Somos', href: '#/quienes-somos' },
                    { label: 'Historia Institucional', href: '#/nuestra-historia' },
                    { label: 'Transparencia', href: '#/estados-financieros' },
                    { label: 'Programas', href: '#/proyectos' }
                ],
                menu2Title: "Acción Social",
                menu2Items: baseMenu2
            };
        case 'club':
        default:
            return {
                logoTop: "https://app.clubplatform.org/rotary-logo-white.png",
                logoBottom: "https://app.clubplatform.org/logo-end-polio.svg",
                menu1Title: "El Club",
                menu1Items: [
                    { label: 'Quiénes Somos', href: '#/quienes-somos' },
                    { label: 'Nuestra Historia', href: '#/nuestra-historia' },
                    { label: 'Junta Directiva', href: '#/nuestra-junta-directiva' },
                    { label: 'Hazte Socio', href: '#/contacto' }
                ],
                menu2Title: "Realiza una Acción",
                menu2Items: baseMenu2
            };
    }
};
