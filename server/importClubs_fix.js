import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

const clubsData = [
  { name: 'Club Rotario Fonseca', domain: 'rotaryfonseca.org', email: 'admin@rotaryfonseca.org', passwordRaw: 'F9x@L2!mQa7', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Cúcuta Ciudad de Los Patios', domain: 'rotarycucutaciudaddelospatios.org', email: 'admin@rotarycucutaciudaddelospatios.org', passwordRaw: 'T4p@X!9LmQ2', districtName: 'Distrito 4271' },
  { name: 'Club Rotario San José de Cúcuta', domain: 'rotarysanjosedecucuta.org', email: 'admin@rotarysanjosedecucuta.org', passwordRaw: '8Lm@Q!xP3t6', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Programa de Intercambio de Jóvenes', domain: 'rotaryprogramadeintercambiodejovenes.org', email: 'admin@rotaryprogramadeintercambiodejovenes.org', passwordRaw: 'Q2t@Lm!X9p5', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Envigado Ayurá', domain: 'rotaryenvigadoayura.org', email: 'admin@rotaryenvigadoayura.org', passwordRaw: '7Xp@Lm!Q3t8', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Cúcuta Ciudad de los Árboles', domain: 'rotarycucutaciudaddelosarboles.org', email: 'admin@rotarycucutaciudaddelosarboles.org', passwordRaw: 'Lm@9Q!tX4p2', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Montería', domain: 'rotarymonteria.org', email: 'admin@rotarymonteria.org', passwordRaw: 'P3t@Lm!Q8x5', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Medellín Nutibara', domain: 'rotarymedellinnutibara.org', email: 'admin@rotarymedellinnutibara.org', passwordRaw: '5Lm@X!Q9t2', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Magangué', domain: 'rotarymagangue.org', email: 'admin@rotarymagangue.org', passwordRaw: '2Qx@Lm!T7p9', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Cartagena Caribe', domain: 'rotarycartagenacaribe.org', email: 'admin@rotarycartagenacaribe.org', passwordRaw: '9Lm@!XpT3q5', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Villa del Rosario', domain: 'rotaryvilladelrosario.org', email: 'admin@rotaryvilladelrosario.org', passwordRaw: '4Tq@Lm!X8p2', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Medellín Bolivariana', domain: 'rotarymedellinbolivariana.org', email: 'admin@rotarymedellinbolivariana.org', passwordRaw: '6Lm@Q!tX9p3', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Cúcuta II', domain: 'rotarycucuta2.org', email: 'admin@rotarycucuta2.org', passwordRaw: '8Xp@Lm!Q2t5', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Sabaneta', domain: 'rotarysabaneta.org', email: 'admin@rotarysabaneta.org', passwordRaw: 'Q9Lm@!tX3p7', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Caldas', domain: 'rotarycaldas.org', email: 'admin@rotarycaldas.org', passwordRaw: '3Tq@Lm!X8p1', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Santa Marta', domain: 'rotarysantamarta.org', email: 'admin@rotarysantamarta.org', passwordRaw: '7Lm@Q!Xp2t9', districtName: 'Distrito 4271' },
  { name: 'Club Rotario San Gil', domain: 'rotarysangil.org', email: 'admin@rotarysangil.org', passwordRaw: '5Xp@Lm!Q3t8', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Envigado', domain: 'rotaryenvigado.org', email: 'admin@rotaryenvigado.org', passwordRaw: '2Lm@Q!tX9p6', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Medellín El Poblado', domain: 'rotarymedellinelpoblado.org', email: 'admin@rotarymedellinelpoblado.org', passwordRaw: '9Tq@Lm!X4p3', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Nuevo Medellín', domain: 'rotarynuevomedellin.org', email: 'admin@rotarynuevomedellin.org', passwordRaw: '6Lm@Q!Xp7t2', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Itagüí Santa Marta', domain: 'rotaryitaguisantamarta.org', email: 'admin@rotaryitaguisantamarta.org', passwordRaw: '4Xp@Lm!Q8t1', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Cartagena', domain: 'rotarycartagena.org', email: 'admin@rotarycartagena.org', passwordRaw: '8Lm@Q!tX2p5', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Bucaramanga', domain: 'rotarybucaramanga.org', email: 'admin@rotarybucaramanga.org', passwordRaw: 'Q3t@Lm!X9p6', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Ciénaga', domain: 'rotarycienaga.org', email: 'admin@rotarycienaga.org', passwordRaw: '7Lm@Q!Xp4t2', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Cartagena Empresarial', domain: 'rotarycartagenaempresarial.org', email: 'admin@rotarycartagenaempresarial.org', passwordRaw: '5Xp@Lm!Q9t3', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Cartagena de Indias', domain: 'rotarycartagenadeindias.org', email: 'admin@rotarycartagenadeindias.org', passwordRaw: '2Lm@Q!tX8p7', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Bucaramanga Ciudad de los Parques', domain: 'rotarybucaramangaciudaddelosparques.org', email: 'admin@rotarybucaramangaciudaddelosparques.org', passwordRaw: '9Xp@Lm!Q4t1', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Bucaramanga Sur', domain: 'rotarybucaramangasur.org', email: 'admin@rotarybucaramangasur.org', passwordRaw: '6Lm@Q!Xp2t8', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Buenaventura Pacífico', domain: 'rotarybuenaventurapacifico.org', email: 'admin@rotarybuenaventurapacifico.org', passwordRaw: '3Xp@Lm!Q7t5', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Barranquilla Centro', domain: 'rotarybarranquillacentro.org', email: 'admin@rotarybarranquillacentro.org', passwordRaw: '8Lm@Q!Xp1t4', districtName: 'Distrito 4271' },
  { name: 'Club Rotario Global Zipaquirá', domain: 'rotaryglobalzipaquira.org', email: 'admin@rotaryglobalzipaquira.org', passwordRaw: '5Lm!Tq9@Xw2', districtName: 'Distrito 4281' },
];

async function run() {
  console.log(`Iniciando importación masiva de ${clubsData.length} clubes...`);

  for (const c of clubsData) {
    try {
      // 1. Buscar o crear el distrito
      let district = await prisma.district.findFirst({
        where: { name: c.districtName }
      });

      if (!district) {
        district = await prisma.district.create({
          data: {
            name: c.districtName,
            domain: c.districtName.replace(' ', '').toLowerCase() + '.org'
          }
        });
        console.log(`[OK] Distrito creado: ${district.name}`);
      }

      // 2. Verificar si el club ya existe por dominio o nombre
      const existingClub = await prisma.club.findFirst({
        where: {
          OR: [
            { domain: c.domain },
            { name: c.name }
          ]
        }
      });

      if (existingClub) {
        console.log(`[SKIP] El club ${c.name} o el dominio ${c.domain} ya existe.`);
        continue;
      }

      // 3. Crear el club
      const club = await prisma.club.create({
        data: {
          name: c.name,
          domain: c.domain,
          districtId: district.id,
        }
      });

      // 4. Crear el usuario administrador
      const hashedPassword = await bcryptjs.hash(c.passwordRaw, 10);
      const user = await prisma.user.create({
        data: {
          name: `Admin ${c.name}`,
          email: c.email,
          password: hashedPassword,
          role: 'club_admin',
          clubId: club.id
        }
      });

      console.log(`[OK] Club creado: ${club.name} | Admin: ${user.email}`);

    } catch (error) {
      console.error(`[ERROR] Falla al crear el club ${c.name}:`, error.message);
    }
  }

  console.log('Importación finalizada.');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
