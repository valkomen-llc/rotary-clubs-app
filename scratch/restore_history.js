import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const CLUB_ID = "857498f8-4836-4c5b-95b2-80d8c073edfc";
const PAGE = "nuestra-historia";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const LosOrigenesDeRotary = `Rotary nació en Chicago en 1905, cuando Paul Harris, un joven abogado, reunió a profesionales de distintas áreas con el propósito de intercambiar ideas, cultivar la amistad y servir a la comunidad. Lo que empezó como un pequeño círculo pronto se expandió a todos los continentes, convirtiéndose en una red mundial de líderes comprometidos con la paz, la salud, la educación y el desarrollo sostenible. Hoy, más de 1,4 millones de rotarios en más de 200 países continúan soñando en grande y haciendo realidad proyectos que transforman vidas.`;

const ElNacimientoDeOrigen = `Siguiendo ese legado, en 2013 un grupo de jóvenes colombianos, con una sólida trayectoria en Interact y Rotaract, decidió crear un club rotario diferente: uno que derribara las barreras de la distancia y uniera a socios en un espacio 100% virtual. Tras un año de preparación, el 24 de junio de 2014, el Rotary E-Club Origen recibió su carta constitutiva (Charter), convirtiéndose en el primer club e-club (digital) del Distrito 4281.`;

const NuestraIdentidad = `Lo que nos define no es un lugar físico, sino nuestro ADN: la capacidad de conectar talentos sin fronteras. Somos un club de puertas abiertas, donde la innovación y el servicio se encuentran para generar impacto real en las comunidades que más lo necesitan, demostrando que la amistad rotaria no conoce límites geográficos.`;

const sections = [
  {
    section: 'header',
    content: {
      title: "Nuestra Historia",
      subtitle: "Rotary E-Club Origen"
    }
  },
  {
    section: 'intro',
    content: {
      p1: "Servir para cambiar vidas a través de la conexión virtual y el impacto real.",
      p2: "Desde nuestra fundación, hemos creído que el servicio no tiene fronteras."
    }
  },
  {
    section: 'quote',
    content: {
      text: "«Más allá de lo que Rotary signifique para nosotros, el mundo lo conocerá por las obras que realice.»",
      authorName: "Paul Harris",
      authorRole: "Fundador de Rotary",
      authorImage: "https://rotary-platform-assets.s3.us-east-1.amazonaws.com/defaults/paul-harris.jpg"
    }
  },
  {
    section: 'timeline_intro',
    content: {
      title: "Nuestra Trayectoria",
      description: "Un recorrido por el legado de Rotary y el nacimiento de nuestro club."
    }
  },
  {
    section: 'timeline',
    content: {
      items: [
        {
          year: "1905",
          title: "Los orígenes de Rotary",
          description: LosOrigenesDeRotary
        },
        {
          year: "2014",
          title: "El nacimiento de Origen",
          description: ElNacimientoDeOrigen
        },
        {
          year: "Hoy",
          title: "Nuestra Identidad",
          description: NuestraIdentidad
        }
      ]
    }
  }
];

async function run() {
  try {
    console.log('Connecting to database...');
    // Delete existing sections for this club/page to avoid conflicts
    await pool.query('DELETE FROM "ContentSection" WHERE "clubId" = $1 AND page = $2', [CLUB_ID, PAGE]);
    
    for (const s of sections) {
      console.log(`Inserting section: ${s.section}`);
      await pool.query(
        `INSERT INTO "ContentSection" (id, page, section, content, "clubId", "updatedAt") 
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
        [PAGE, s.section, JSON.stringify(s.content), CLUB_ID]
      );
    }
    
    console.log('SUCCESS: All history sections updated for Rotary E-Club Origen.');
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await pool.end();
  }
}

run();
