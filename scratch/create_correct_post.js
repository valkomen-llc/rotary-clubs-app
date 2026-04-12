import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const clubId = 'a5868df5-6593-4711-b7e7-ad9936b96faf';
  
  const content = `
Fecha: 24 de abril de 2025

<h2>🌎 LATIR Juntos: ¡Bienvenidos a la IV Conferencia LATIR en Cali!</h2>
<p>Cali, Colombia – Abril 2025</p>

<p>Hay momentos que marcan historia, encuentros que se sienten como un nuevo comienzo. Hoy, el corazón de Latinoamérica late más fuerte que nunca, porque estamos a punto de vivir la IV Conferencia LATIR y la III Conferencia ROTEX en la vibrante ciudad de Cali.</p>

<p>Del 25 al 27 de abril, cientos de jóvenes, voluntarios y líderes rotarios de toda la región se reunirán para celebrar lo que nos une: el servicio, el intercambio, la paz y una visión compartida de un mundo mejor.</p>

<h3>Un encuentro que es más que un evento</h3>
<p>Este encuentro no es solo una conferencia. Es la materialización de un sueño compartido entre generaciones de rotarios que creen que la paz se construye una persona a la vez. Es la prueba de que cuando los jóvenes cruzan fronteras, aprenden otros idiomas y viven nuevas culturas, se convierten en embajadores de la empatía, la tolerancia y el cambio.</p>

<p>Cali se convierte esta semana en el epicentro de una Latinoamérica que cree en sus jóvenes, que apuesta por el intercambio como herramienta de desarrollo, y que se conecta con el mundo a través de Rotary International, una red global que desde hace más de un siglo transforma comunidades, erradica enfermedades, promueve la educación y teje lazos de hermandad planetaria.</p>

<h3>LATIR: el espíritu de un continente en movimiento</h3>
<p>LATIR es más que una asociación. Es un latido colectivo. Es la voz de los distritos hispanohablantes de Centro y Sudamérica que han decidido unirse para potenciar el Programa de Intercambio de Jóvenes de Rotary International desde una perspectiva regional, diversa y profundamente humana.</p>

<p>Nacimos con la convicción de que los jóvenes no son el futuro: son el presente. Y en esta conferencia, ese presente se hace visible, se escucha en los pasillos, se abraza en cada saludo, se proyecta en cada historia que será compartida por quienes han vivido la experiencia de intercambio, y por quienes están a punto de comenzarla.</p>

<h3>El valor de reencontrarnos</h3>
<p>Este evento representa también un reencuentro. Con nuestros ideales, con nuestras raíces, con nuestros pares. Es una oportunidad para fortalecer redes de cooperación, intercambiar aprendizajes, generar nuevas alianzas entre distritos, y renovar el compromiso con el rol transformador que tiene el Rotary Youth Exchange en la vida de miles de jóvenes.</p>

<p>Además, este año tenemos el honor de recibir a autoridades internacionales de Rotary, incluyendo al Presidente Electo de Rotary International, cuya presencia reafirma la importancia estratégica de nuestra región y el impacto global de este programa.</p>

<h3>¡Nos vemos en Cali!</h3>
<p>Con alegría, esperanza y compromiso, damos la bienvenida a todos los asistentes. Queremos que cada instante de esta conferencia sea una inspiración, una chispa que encienda nuevas ideas, una semilla de servicio que florezca en cada comunidad.</p>

<p>Bienvenidos a LATIR 2025. Bienvenidos a Cali. Bienvenidos a vivir una experiencia que transforma.</p>
  `.trim();

  const post = await prisma.post.create({
    data: {
      title: '🌎 LATIR Juntos: ¡Bienvenidos a la IV Conferencia LATIR en Cali!',
      content: content,
      image: 'https://img.youtube.com/vi/W5GuI2bQ1T8/maxresdefault.jpg',
      published: true,
      clubId: clubId,
      category: 'Eventos',
      videoUrl: 'https://www.youtube.com/watch?v=W5GuI2bQ1T8',
      createdAt: new Date('2025-04-24T12:00:00Z'),
      updatedAt: new Date()
    }
  });

  console.log('Post created:', post.id);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
