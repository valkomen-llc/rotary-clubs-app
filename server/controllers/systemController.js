import db from '../lib/db.js';

export const getFooterSkins = async (req, res) => {
    try {
        const skins = ['club', 'district', 'association', 'colrotarios'];
        const results = {};

        for (const type of skins) {
            const result = await db.query(
                'SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1',
                [`footer_skin_${type}`]
            );
            const setting = result.rows[0];
            results[type] = setting ? JSON.parse(setting.value) : getDefaultSkin(type);
        }

        res.json(results);
    } catch (error) {
        console.error('Error fetching footer skins:', error);
        res.status(500).json({ error: 'Error fetching footer skins' });
    }
};

export const updateFooterSkin = async (req, res) => {
    const { type } = req.params;
    const { config } = req.body;

    try {
        const key = `footer_skin_${type}`;
        const val = JSON.stringify(config);
        
        await db.query(`
            INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
            VALUES (gen_random_uuid(), $1, $2, NULL, NOW())
            ON CONFLICT (key) WHERE "clubId" IS NULL
            DO UPDATE SET value = $2, "updatedAt" = NOW()
        `, [key, val]);

        res.json({ message: `Skin ${type} actualizado exitosamente` });
    } catch (error) {
        console.error('Error updating footer skin:', error);
        res.status(500).json({ error: 'Error updating footer skin' });
    }
};

export const getFooterSkinPublic = async (req, res) => {
    try {
        const { type } = req.query;
        if (!type) return res.status(400).json({ error: 'Tipo requerido' });

        const result = await db.query(
            'SELECT value FROM "Setting" WHERE key = $1 AND "clubId" IS NULL LIMIT 1',
            [`footer_skin_${type}`]
        );
        const setting = result.rows[0];

        const config = setting ? JSON.parse(setting.value) : getDefaultSkin(type);
        res.json(config);
    } catch (error) {
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
