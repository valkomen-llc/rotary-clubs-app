/**
 * Script para actualizar el contenido de "Nuestra Historia"
 * del Rotary E-Club Origen en producción.
 *
 * Uso:
 *   node update-historia-content.js <TOKEN>
 *
 * El TOKEN lo obtienes desde el navegador (ya logueado en app.clubplatform.org):
 *   localStorage.getItem('rotary_token')
 */

const API = 'https://app.clubplatform.org/api';
const token = process.argv[2];

if (!token) {
    console.error('❌  Proporciona el token como argumento:');
    console.error('    node update-historia-content.js <TOKEN>');
    process.exit(1);
}

const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
};

// ── 1. Obtener el clubId de rotary-e-club-origen ─────────────────────────────
async function getClubId() {
    const res = await fetch(`${API}/clubs/by-domain?domain=rotary-e-club-origen`);
    if (!res.ok) throw new Error(`No se pudo obtener el club: ${res.status}`);
    const data = await res.json();
    console.log(`✅  Club encontrado: ${data.name} (id: ${data.id})`);
    return data.id;
}

// ── 2. Contenido nuevo de la historia ────────────────────────────────────────
function buildSections() {
    return [
        {
            page: 'nuestra-historia',
            section: 'header',
            content: {
                title: 'Nuestra Historia',
                subtitle: 'Rotary E-Club Origen',
            },
        },
        {
            page: 'nuestra-historia',
            section: 'origins',
            content: {
                title: 'Los orígenes de Rotary',
                content:
                    'Rotary nació en Chicago en 1905, cuando Paul Harris, un joven abogado, reunió a profesionales de distintas áreas con el propósito de intercambiar ideas, cultivar la amistad y servir a la comunidad. Lo que empezó como un pequeño círculo pronto se expandió a todos los continentes, convirtiéndose en una red mundial de líderes comprometidos con la paz, la salud, la educación y el desarrollo sostenible. Hoy, más de 1,4 millones de rotarios en más de 200 países continúan soñando en grande y haciendo realidad proyectos que transforman vidas.',
            },
        },
        {
            page: 'nuestra-historia',
            section: 'local',
            content: {
                title: 'El nacimiento de Origen',
                content:
                    'Siguiendo ese legado, en 2013 un grupo de jóvenes colombianos, con una sólida trayectoria en Interact y Rotaract, decidió crear un club rotario diferente: uno que derribara las barreras de la distancia y uniera a socios en un espacio 100% virtual. Tras un año de preparación y consultas ante Rotary International, en 2015 nació oficialmente el Rotary E-Club Origen, el primero de su tipo en Colombia, fundado íntegramente por ex Interactianos y Rotaractianos.',
            },
        },
        {
            page: 'nuestra-historia',
            section: 'founders',
            content: {
                title: 'Los socios fundadores que dieron vida al sueño de Origen fueron:',
                list: `Ricardo Jaramillo (Past RDR 2008–2009)
Andrés Patiño (Past RDR 2009–2010)
Lucas Lasso (Past RDR 2010–2011)
Israel David Castellanos (Past RDR 2011–2012)
Luz Adriana Bermúdez (Past RDR 2012–2013)
Natalia Giraldo
Leidy Viviana Hurtado`,
            },
        },
        {
            page: 'nuestra-historia',
            section: 'timeline',
            content: {
                title: 'Una década de impacto',
                description:
                    'Desde entonces, el E-Club Origen ha liderado proyectos innovadores y solidarios en diversas regiones del país: la campaña #TodoPorNuestrosHéroes durante la pandemia de COVID-19, el programa Origen H2O que lleva agua segura a comunidades rurales, Origen Siembra para la reforestación y la educación ambiental, el embellecimiento urbano con Rotary Pinta Colombia, la entrega de sillas de ruedas a personas en condición de discapacidad, el fortalecimiento de hogares infantiles y juveniles, entre muchos otros.\n\nGracias a la virtualidad y a la pasión de sus socios, el club ha logrado llegar a más de 10 ciudades en Colombia y mantener vínculos internacionales con Guatemala y Brasil, demostrando que la amistad y el servicio rotario no tienen fronteras.',
            },
        },
        {
            page: 'nuestra-historia',
            section: 'future',
            content: {
                title: 'Mirando al futuro',
                content:
                    'Hoy, en 2025, celebramos 10 años de historia reafirmando nuestro compromiso con la visión global de Rotary: soñar en grande, construir puentes de paz y servir con creatividad e innovación. Somos una familia rotaria que une corazones, multiplica voluntades y transforma comunidades, con la certeza de que nuestra mejor obra siempre será la próxima.',
            },
        },
    ];
}

// ── 3. Enviar via batch-upsert ────────────────────────────────────────────────
async function pushContent(clubId) {
    const sections = buildSections();
    const res = await fetch(`${API}/admin/sections/batch-upsert`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ clubId, sections }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Error al guardar: ${res.status} — ${err}`);
    }
    const result = await res.json();
    console.log(`✅  ${result.length} secciones guardadas correctamente.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    try {
        const clubId = await getClubId();
        await pushContent(clubId);
        console.log('\n🎉  Contenido de "Nuestra Historia" actualizado en producción.');
        console.log('    Recarga https://app.clubplatform.org/?club=rotary-e-club-origen#/nuestra-historia');
    } catch (err) {
        console.error('❌  Error:', err.message);
        process.exit(1);
    }
})();
