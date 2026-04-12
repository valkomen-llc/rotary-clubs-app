import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const comments = [
  {
    firstName: "Liliana",
    lastName: "Ramírez",
    createdAt: new Date("2025-04-27T10:00:00Z"),
    text: "Apreciados amigos. Gracias por venir a Colombia. Quedamos llenos de felicidad de que haber disfrutado con estos bellos Amigos que hacen LATIR nuestro Corazón.",
    rating: 5
  },
  {
    firstName: "Karen",
    lastName: "Segura-Medina",
    createdAt: new Date("2025-04-29T10:00:00Z"),
    text: "De parte de nuestro equipo en RI, gracias a cada uno en LATIR por la invitación, el tremendo acogimiento, los aprendizajes y cada detalle inesperado que hizo de estos últimos días no solo un gran evento, pero la oportunidad de llevar y desarrollar ideas y recursos para seguir apoyando este programa. Me mi parte, nunca olvidaré el cariño brindado y llevo en mi corazón a nuevos amigos.",
    rating: 5
  },
  {
    firstName: "Liliana",
    lastName: "Ramírez",
    createdAt: new Date("2025-04-27T14:30:00Z"),
    text: "CALI es donde debes estar!!!",
    rating: 5
  },
  {
    firstName: "Maria de los Angeles",
    lastName: "Moscuzza",
    createdAt: new Date("2025-04-28T10:00:00Z"),
    text: "Excelente evento Latir Cali, cada detalle fue encantador y las conferencias nos dejaron muchos aprendizajes, sin duda ha sido todo un exito! Gracias por todo",
    rating: 5
  },
  {
    firstName: "Gustavo",
    lastName: "Angel CR Pasto Colombia",
    createdAt: new Date("2025-04-28T11:00:00Z"),
    text: "Gracias por todo el cariño, generosidad con el conocimiento, su sentido de amistad y el compromiso por un mejor ROTARY!\nFELICITACIONESSS POR TAN MARAVILLOSO EVENTO!",
    rating: 5
  },
  {
    firstName: "Jorge Raúl",
    lastName: "Ossa Botero",
    createdAt: new Date("2025-04-28T12:00:00Z"),
    text: "Felicitaciones al equipo directivo de LATIR y al grupo organizador por tan hermoso y exitoso evento. Fue una oportunidad de comprender más los diferentes tópicos del programa de intercambio de jóvenes. Mil felicitaciones y un millón de gracias",
    rating: 5
  },
  {
    firstName: "Valeria",
    lastName: "Romo Mejia",
    createdAt: new Date("2025-04-28T13:00:00Z"),
    text: "Gran evento! Importante reunir a tantas personas que además de la labor social resaltan por la conectividad que incentivan a través de jóvenes embajadores de paz. Feliz de haber participado y de seguir contribuyendo activamente. Muy agradecida.",
    rating: 5
  },
  {
    firstName: "Karyna",
    lastName: "",
    createdAt: new Date("2025-04-28T14:00:00Z"),
    text: "Hermosa reunión de líderes de intercambio latinos, feliz de haber participado y de haber conocido su maravilloso país, muchas gracias por ser tan excelentes anfitriones!",
    rating: 5
  },
  {
    firstName: "Ximena",
    lastName: "Caicedo",
    createdAt: new Date("2025-04-28T15:00:00Z"),
    text: "Maravilloso evento, la capacitaciones, las experiencias compartidas y el cariño de los organizadores, es lo mejor",
    rating: 5
  },
  {
    firstName: "Leonardo",
    lastName: "Mangoldt",
    createdAt: new Date("2025-04-29T11:00:00Z"),
    text: "Felicitaciones a la organización !! Excelente evento el Latir Cali 👏👏\nUn gran equipo y salió todo perfecto, gracias totales 🤗",
    rating: 5
  },
  {
    firstName: "Judy",
    lastName: "Ibañez/ club Tunja Hunza",
    createdAt: new Date("2025-04-29T12:00:00Z"),
    text: "Gracias a todos los organizadores del LATIR, cada detalle fue impecable y los momentos académicos y de amistad inolvidables!!",
    rating: 5
  }
];

const postId = "594b3005-3cf2-4532-a237-4be75c13bb3b";

async function main() {
  for (const c of comments) {
    await prisma.comment.create({
      data: {
        postId,
        ...c,
        email: "placeholder@valkomen.com",
        approved: true
      }
    });
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
