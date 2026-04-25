import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useClub } from '../contexts/ClubContext';
import { 
  Calendar, User, Clock, ArrowLeft, Share2, Facebook, Twitter, 
  Linkedin, Tag, ChevronRight, Star, Send, CheckCircle, MessageSquare,
  Maximize2, X as CloseIcon, Play, Video as VideoIcon, ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

interface Comment {
  id: string;
  firstName: string;
  lastName: string;
  text: string;
  rating: number;
  createdAt: string;
}

const articulosData: Record<number, {
// ... existing articulosData (truncated for brevity in this replace call, but I will keep it)
  id: number;
  titulo: string;
  contenido: string;
  imagen: string;
  fecha: string;
  autor: string;
  categoria: string;
  tiempoLectura: string;
}> = {
  1: {
    id: 1,
    titulo: 'Olayinka H. Babalola insta a los socios de Rotary a generar un impacto duradero',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        La presidenta de Rotary International para el año rotario 2025-26, Olayinka H. Babalola, ha compartido una poderosa visión sobre el futuro de la organización y el papel crucial que cada socio debe desempeñar para crear cambios significativos y duraderos en sus comunidades.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Un llamado a la acción</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Durante su reciente discurso en la Convención Internacional de Rotary, Babalola enfatizó que el verdadero impacto no se mide por la cantidad de proyectos realizados, sino por la profundidad del cambio que estos generan en la vida de las personas. "No se trata solo de hacer cosas buenas", declaró, "se trata de hacer cosas que realmente transformen vidas de manera sostenible".
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        La presidenta electa compartió su propia historia de cómo el Rotary cambió su vida cuando era una joven estudiante en Nigeria, recibiendo una beca que le permitió completar su educación y posteriormente convertirse en una exitosa empresaria y líder comunitaria.
      </p>
      
      <blockquote class="border-l-4 border-rotary-gold bg-rotary-gold/5 p-6 my-8 italic text-gray-700">
        "Cada uno de nosotros tiene el poder de ser un catalizador de cambio. No subestimen el impacto que pueden tener como individuos, porque cuando nos unimos, ese impacto se multiplica exponencialmente."
        <footer class="mt-2 font-semibold text-gray-900 not-italic">— Olayinka H. Babalola</footer>
      </blockquote>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Pilares de su presidencia</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Babalola ha establecido tres pilares fundamentales para su año de presidencia:
      </p>
      
      <ul class="list-disc list-inside space-y-3 text-gray-700 mb-8 ml-4">
        <li><strong>Empoderamiento de la juventud:</strong> Crear oportunidades para que los jóvenes lideren proyectos y desarrollen habilidades de liderazgo.</li>
        <li><strong>Sostenibilidad de proyectos:</strong> Asegurar que cada iniciativa tenga un plan de sostenibilidad a largo plazo.</li>
        <li><strong>Inclusión y diversidad:</strong> Ampliar la membresía para reflejar la diversidad de las comunidades que servimos.</li>
      </ul>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">El desafío para los socios</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Babalola desafió a cada socio a reflexionar sobre su contribución única al Rotary. "Pregúntense: ¿Cuál es mi superpoder? ¿Qué puedo hacer mejor que nadie más? Esa es su contribución al Rotary", instó a los asistentes.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        El Rotary Club se compromete a responder a este llamado, trabajando en proyectos que no solo aborden necesidades inmediatas sino que también creen las condiciones para un desarrollo sostenible en nuestras comunidades.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1200&h=600&fit=crop',
    fecha: '15 de febrero, 2026',
    autor: 'Rotary International',
    categoria: 'Eventos',
    tiempoLectura: '5 min'
  },
  2: {
    id: 2,
    titulo: 'Entrevista con Bill Gates: El optimista',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        En una conversación exclusiva con la Revista Rotary, Bill Gates compartió su perspectiva sobre el papel fundamental de Rotary en uno de los esfuerzos de salud pública más ambiciosos de la historia: la erradicación de la poliomielitis.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Una alianza histórica</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Desde 1988, Rotary y la Fundación Bill y Melinda Gates han trabajado juntos en la Iniciativa Mundial de Erradicación de la Polio. Esta colaboración ha logrado reducir los casos de polio en un 99.9%, pasando de aproximadamente 350,000 casos anuales a menos de 100 casos en la actualidad.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        "El Rotary ha sido el corazón de este esfuerzo", afirmó Gates. "Sus socios han donado no solo dinero, sino tiempo, energía y pasión. Han estado en el terreno, vacunando niños, educando comunidades y abogando por los recursos necesarios para terminar el trabajo".
      </p>
      
      <blockquote class="border-l-4 border-rotary-gold bg-rotary-gold/5 p-6 my-8 italic text-gray-700">
        "La polio puede ser la segunda enfermedad humana erradicada de la faz de la Tierra. Eso sería un logro histórico, y el Rotary será recordado como uno de los principales arquitectos de esta victoria."
        <footer class="mt-2 font-semibold text-gray-900 not-italic">— Bill Gates</footer>
      </blockquote>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">El poder de la colaboración</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Gates destacó que el éxito de la iniciativa contra la polio demuestra lo que es posible cuando organizaciones diversas trabajan juntas hacia un objetivo común. El Rotary, los gobiernos nacionales, la OMS, UNICEF y los Centros para el Control de Enfermedades han formado una alianza sin precedentes.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        "Lo que el Rotary ha demostrado es que un grupo de personas comprometidas puede cambiar el mundo", reflexionó Gates. "Esa es una lección que aplicamos en todo nuestro trabajo filantrópico".
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Mirando hacia el futuro</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        A pesar de los desafíos que enfrenta la erradicación final de la polio, Gates se muestra optimista. "Estamos más cerca que nunca", aseguró. "Con el compromiso continuo del Rotary y la comunidad global de salud, estoy convencido de que veremos el fin de la polio en los próximos años".
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        El Rotary Club se enorgullece de ser parte de esta historia de éxito global, contribuyendo con recursos y voluntariado para apoyar las campañas de vacunación y educación sobre la polio.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1200&h=600&fit=crop',
    fecha: '10 de febrero, 2026',
    autor: 'Revista Rotary',
    categoria: 'Fundación',
    tiempoLectura: '8 min'
  },
  3: {
    id: 3,
    titulo: 'Gente de Acción en todo el mundo',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        En cada rincón del planeta, rotarios están demostrando que las palabras se convierten en acción. Desde pequeños pueblos hasta grandes metrópolis, la red global de Rotary está creando un impacto tangible en las comunidades que sirven.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Historias de impacto</h2>
      
      <h3 class="text-xl font-semibold text-gray-900 mt-6 mb-3">India: Agua para todos</h3>
      <p class="text-gray-700 leading-relaxed mb-6">
        En el estado de Rajasthan, el Rotary Club de Jaipur ha instalado más de 500 sistemas de captación de agua de lluvia en escuelas rurales. Este proyecto ha beneficiado a más de 50,000 estudiantes que anteriormente tenían que caminar kilómetros para obtener agua potable.
      </p>
      
      <h3 class="text-xl font-semibold text-gray-900 mt-6 mb-3">Brasil: Educación que transforma</h3>
      <p class="text-gray-700 leading-relaxed mb-6">
        El Rotary Club de São Paulo desarrolló un programa de tutoría que ha ayudado a más de 2,000 jóvenes de comunidades marginadas a ingresar a la universidad. El programa incluye clases de preparación para exámenes, orientación vocacional y becas.
      </p>
      
      <h3 class="text-xl font-semibold text-gray-900 mt-6 mb-3">Filipinas: Reconstrucción después del desastre</h3>
      <p class="text-gray-700 leading-relaxed mb-6">
        Después del tifón Haiyan en 2013, rotarios de todo el mundo se unieron para ayudar en la reconstrucción. Hoy, gracias a esos esfuerzos, miles de familias tienen hogares resistentes a desastres y acceso a servicios de salud mejorados.
      </p>
      
      <blockquote class="border-l-4 border-rotary-gold bg-rotary-gold/5 p-6 my-8 italic text-gray-700">
        "El Rotary me enseñó que no necesitas ser millonario para cambiar el mundo. Solo necesitas el deseo de servir y la voluntad de actuar."
        <footer class="mt-2 font-semibold text-gray-900 not-italic">— María González, Rotaria en México</footer>
      </blockquote>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">El espíritu del servicio</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Lo que une a estos proyectos es el espíritu de servicio que caracteriza a los rotarios. No se trata solo de donar dinero, sino de involucrarse personalmente, de entender las necesidades reales de las comunidades y de trabajar codo a codo con los beneficiarios.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        El Rotary Club se inspira en estas historias globales y trabaja cada día para crear nuestro propio impacto en Colombia, llevando el espíritu de "Gente de Acción" a cada proyecto que emprendemos.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1200&h=600&fit=crop',
    fecha: '8 de febrero, 2026',
    autor: 'Equipo Editorial',
    categoria: 'Socios',
    tiempoLectura: '4 min'
  },
  4: {
    id: 4,
    titulo: 'Rotary celebra 10 años de impacto en comunidades rurales',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        Una década de trabajo incansable ha transformado la vida de miles de familias en zonas rurales de Colombia. El Rotary Club celebra 10 años de proyectos sostenibles que han dejado una huella imborrable en las comunidades más vulnerables del país.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Un viaje de transformación</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Desde nuestros inicios en 2016, hemos trabajado en más de 150 proyectos en comunidades rurales de 12 departamentos colombianos. Nuestro enfoque siempre ha sido el mismo: escuchar las necesidades reales de las comunidades y trabajar junto con ellas para encontrar soluciones sostenibles.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        "No venimos a imponer soluciones", explica nuestro presidente. "Venimos a escuchar, a aprender y a colaborar. Las comunidades saben mejor que nadie lo que necesitan. Nuestro rol es aportar recursos, conocimientos y acompañamiento para que esas necesidades se conviertan en realidades".
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Logros destacados</h2>
      
      <div class="bg-gray-50 p-6 rounded-xl my-8">
        <h3 class="text-xl font-semibold text-gray-900 mb-4">En números: 10 años de impacto</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="text-center p-4 bg-white rounded-lg shadow-sm">
            <div class="text-3xl font-bold text-rotary-blue">150+</div>
            <div class="text-sm text-gray-600">Proyectos</div>
          </div>
          <div class="text-center p-4 bg-white rounded-lg shadow-sm">
            <div class="text-3xl font-bold text-rotary-blue">50,000+</div>
            <div class="text-sm text-gray-600">Beneficiarios</div>
          </div>
          <div class="text-center p-4 bg-white rounded-lg shadow-sm">
            <div class="text-3xl font-bold text-rotary-blue">12</div>
            <div class="text-sm text-gray-600">Departamentos</div>
          </div>
          <div class="text-center p-4 bg-white rounded-lg shadow-sm">
            <div class="text-3xl font-bold text-rotary-blue">500+</div>
            <div class="text-sm text-gray-600">Voluntarios</div>
          </div>
        </div>
      </div>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Proyectos emblemáticos</h2>
      
      <h3 class="text-xl font-semibold text-gray-900 mt-6 mb-3">Programa Origen H2O</h3>
      <p class="text-gray-700 leading-relaxed mb-6">
        Nuestro programa de agua potable ha instalado más de 80 sistemas de agua en comunidades rurales, beneficiando a más de 25,000 personas que ahora tienen acceso a agua limpia y segura.
      </p>
      
      <h3 class="text-xl font-semibold text-gray-900 mt-6 mb-3">Becas educativas</h3>
      <p class="text-gray-700 leading-relaxed mb-6">
        Hemos otorgado más de 200 becas completas a jóvenes de comunidades rurales, permitiéndoles acceder a educación universitaria y técnica que de otro modo estaría fuera de su alcance.
      </p>
      
      <h3 class="text-xl font-semibold text-gray-900 mt-6 mb-3">Huertas comunitarias</h3>
      <p class="text-gray-700 leading-relaxed mb-6">
        El proyecto de agricultura sostenible ha establecido 45 huertas comunitarias que no solo proporcionan alimentos nutritivos, sino también fuentes de ingresos para las familias participantes.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Mirando al futuro</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Mientras celebramos estos logros, miramos hacia el futuro con renovado compromiso. Los próximos 10 años nos traerán nuevos desafíos y oportunidades, pero con el mismo espíritu de servicio que nos ha guiado hasta aquí, estamos listos para continuar transformando vidas.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1200&h=600&fit=crop',
    fecha: '5 de febrero, 2026',
    autor: 'Comunicaciones Rotary',
    categoria: 'Proyectos',
    tiempoLectura: '6 min'
  },
  5: {
    id: 5,
    titulo: 'Nuevos proyectos de agua potable benefician a miles de familias',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        El programa Origen H2O del Rotary Club expande significativamente su alcance con la inauguración de 5 nuevos puntos de agua en comunidades vulnerables de los departamentos de Cundinamarca y Boyacá.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Agua, fuente de vida</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        El acceso al agua potable es un derecho humano fundamental, pero millones de personas en Colombia aún carecen de este recurso esencial. Nuestro programa Origen H2O nació con la misión de cambiar esta realidad, comunidad por comunidad.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        Los nuevos sistemas, inaugurados en enero de 2026, incluyen tecnología de filtración avanzada, infraestructura de distribución y programas de capacitación para que las comunidades puedan mantener los sistemas de manera autónoma.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Las comunidades beneficiadas</h2>
      
      <ul class="list-disc list-inside space-y-3 text-gray-700 mb-8 ml-4">
        <li><strong>Vereda El Carmen (Cundinamarca):</strong> Sistema de captación de agua de lluvia con capacidad para 15,000 litros.</li>
        <li><strong>Corregimiento San José (Boyacá):</strong> Planta de tratamiento de agua que beneficia a 800 habitantes.</li>
        <li><strong>Vereda La Esperanza (Cundinamarca):</strong> Pozo profundo con sistema de bombeo solar.</li>
        <li><strong>Corregimiento El Progreso (Boyacá):</strong> Red de distribución de agua potable para 250 familias.</li>
        <li><strong>Vereda Alto de la Cruz (Cundinamarca):</strong> Sistema de filtración y purificación comunitario.</li>
      </ul>
      
      <blockquote class="border-l-4 border-rotary-gold bg-rotary-gold/5 p-6 my-8 italic text-gray-700">
        "Antes teníamos que caminar dos horas para traer agua, y ni siquiera era limpia. Ahora tenemos agua pura en nuestras casas. Esto ha cambiado nuestra vida por completo."
        <footer class="mt-2 font-semibold text-gray-900 not-italic">— María Elena Ríos, habitante de Vereda El Carmen</footer>
      </blockquote>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Sostenibilidad: la clave del éxito</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Cada proyecto incluye un componente de sostenibilidad que garantiza su funcionamiento a largo plazo. Las comunidades reciben capacitación en mantenimiento básico, gestión de recursos y administración del sistema.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        Además, establecemos juntas de agua comunitarias que se encargan de la operación y el mantenimiento, asegurando que los beneficios perduren generación tras generación.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Próximos pasos</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Para 2026, el programa Origen H2O tiene como meta instalar 15 sistemas adicionales, beneficiando a más de 10,000 personas. Con el apoyo de socios, donantes y voluntarios, estamos convencidos de que alcanzaremos esta meta.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=1200&h=600&fit=crop',
    fecha: '1 de febrero, 2026',
    autor: 'Proyectos Rotary',
    categoria: 'Proyectos',
    tiempoLectura: '3 min'
  },
  6: {
    id: 6,
    titulo: 'Introcamp 2024: Recibimos a 63 estudiantes de intercambio',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        Del 15 al 22 de enero de 2024, Colombia fue anfitriona de uno de los eventos más importantes del programa de Intercambio de Jóvenes de Rotary: el Introcamp. Durante una semana, 63 estudiantes de 12 países diferentes vivieron una experiencia inolvidable de intercambio cultural.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Una semana de descubrimiento</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        El Introcamp es el evento de bienvenida para los estudiantes de intercambio que llegan a Colombia. Durante esta semana, los jóvenes participan en actividades diseñadas para ayudarles a adaptarse a su nuevo entorno, conocer la cultura colombiana y establecer amistades que durarán toda la vida.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        Los 63 participantes provenían de Estados Unidos, Canadá, Alemania, Francia, Italia, España, Japón, Corea del Sur, Australia, Brasil, México y Argentina. Cada uno de ellos fue recibido con los brazos abiertos por familias anfitrionas comprometidas con el programa.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Actividades destacadas</h2>
      
      <h3 class="text-xl font-semibold text-gray-900 mt-6 mb-3">Talleres culturales</h3>
      <p class="text-gray-700 leading-relaxed mb-6">
        Los estudiantes participaron en talleres de salsa, cumbia y vallenato, aprendiendo los pasos básicos de las danzas más representativas de Colombia. También tuvieron clases de cocina donde prepararon arepas, empanadas y otros platos típicos.
      </p>
      
      <h3 class="text-xl font-semibold text-gray-900 mt-6 mb-3">Excursiones educativas</h3>
      <p class="text-gray-700 leading-relaxed mb-6">
        Las visitas incluyeron el Centro Histórico de Bogotá, el Museo del Oro, la Catedral de Sal de Zipaquirá y una finca cafetera en la región cafetera. Cada excursión fue diseñada para ofrecer una visión integral de la diversidad cultural y geográfica de Colombia.
      </p>
      
      <h3 class="text-xl font-semibold text-gray-900 mt-6 mb-3">Actividades de integración</h3>
      <p class="text-gray-700 leading-relaxed mb-6">
        Juegos, deportes, noches de talentos y fogatas crearon momentos de conexión genuina entre los participantes. Muchos de ellos describieron esta semana como "la mejor de sus vidas".
      </p>
      
      <blockquote class="border-l-4 border-rotary-gold bg-rotary-gold/5 p-6 my-8 italic text-gray-700">
        "Nunca imaginé que podría sentirme tan en casa en un país tan diferente al mío. Los colombianos son increíblemente acogedores, y he hecho amigos de todo el mundo. Este año cambiará mi vida para siempre."
        <footer class="mt-2 font-semibold text-gray-900 not-italic">— Emma Schmidt, estudiante de Alemania</footer>
      </blockquote>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">El impacto del intercambio</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        El programa de Intercambio de Jóvenes de Rotary es mucho más que un año en el extranjero. Es una oportunidad para desarrollar liderazgo, adaptabilidad, empatía y una visión global. Los estudiantes regresan a sus países como embajadores de la paz y el entendimiento internacional.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        El Rotary Club se enorgullece de ser parte de este programa transformador, contribuyendo con recursos, voluntariado y familias anfitrionas dedicadas.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1200&h=600&fit=crop',
    fecha: '28 de enero, 2026',
    autor: 'Intercambio Rotary',
    categoria: 'Intercambio',
    tiempoLectura: '7 min'
  },
  7: {
    id: 7,
    titulo: 'Campaña #TodoPorNuestrosHéroes supera expectativas',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        Durante los meses más críticos de la pandemia de COVID-19, el Rotary Club lanzó la campaña #TodoPorNuestrosHéroes con un objetivo ambicioso: recolectar equipos de protección personal (EPP) para el personal de salud colombiano. Los resultados superaron todas las expectativas.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Naciendo de la necesidad</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        En marzo de 2020, cuando la pandemia llegó a Colombia, los trabajadores de la salud enfrentaban una escasez crítica de equipos de protección. Médicos, enfermeras y personal de apoyo atendían a pacientes con COVID-19 sin la protección adecuada, poniendo en riesgo sus vidas.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        El Rotary Club no podía quedarse de brazos cruzados. En cuestión de días, lanzamos la campaña #TodoPorNuestrosHéroes, movilizando a nuestra red de socios, familias, amigos y aliados corporativos.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Resultados extraordinarios</h2>
      
      <div class="bg-gray-50 p-6 rounded-xl my-8">
        <h3 class="text-xl font-semibold text-gray-900 mb-4">Impacto de la campaña</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="text-center p-4 bg-white rounded-lg shadow-sm">
            <div class="text-3xl font-bold text-rotary-blue">50,000+</div>
            <div class="text-sm text-gray-600">Equipos donados</div>
          </div>
          <div class="text-center p-4 bg-white rounded-lg shadow-sm">
            <div class="text-3xl font-bold text-rotary-blue">120</div>
            <div class="text-sm text-gray-600">Hospitales beneficiados</div>
          </div>
          <div class="text-center p-4 bg-white rounded-lg shadow-sm">
            <div class="text-3xl font-bold text-rotary-blue">25</div>
            <div class="text-sm text-gray-600">Ciudades</div>
          </div>
          <div class="text-center p-4 bg-white rounded-lg shadow-sm">
            <div class="text-3xl font-bold text-rotary-blue">$2.5M</div>
            <div class="text-sm text-gray-600">Valor en pesos</div>
          </div>
        </div>
      </div>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Lo que donamos</h2>
      
      <ul class="list-disc list-inside space-y-3 text-gray-700 mb-8 ml-4">
        <li>Más de 30,000 mascarillas N95 y quirúrgicas</li>
        <li>15,000 batas de protección</li>
        <li>5,000 caretas faciales</li>
        <li>10,000 pares de guantes</li>
        <li>2,000 gafas de protección</li>
        <li>500 galones de desinfectante</li>
      </ul>
      
      <blockquote class="border-l-4 border-rotary-gold bg-rotary-gold/5 p-6 my-8 italic text-gray-700">
        "Cuando más lo necesitábamos, el Rotary estuvo ahí. Esos equipos no solo nos protegieron a nosotros, sino que nos permitieron seguir cuidando a nuestros pacientes sin temor."
        <footer class="mt-2 font-semibold text-gray-900 not-italic">— Dra. Carmen Vargas, Hospital Universitario</footer>
      </blockquote>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">El poder de la solidaridad</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        La campaña demostró el poder de la solidaridad en tiempos de crisis. Empresas donaron sus reservas de EPP, individuos organizaron colectas en sus barrios, y voluntarios trabajaron incansablemente para clasificar, empacar y distribuir los equipos.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        "Fue un esfuerzo de toda la comunidad", recuerda nuestro coordinador de proyectos. "Ver cómo todos se unieron por una causa común nos dio esperanza en los momentos más oscuros de la pandemia".
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Un legado de servicio</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        La campaña #TodoPorNuestrosHéroes es un testimonio del compromiso del Rotary Club con el servicio, incluso en las circunstancias más desafiantes. Nos enorgullece haber podido contribuir a proteger a quienes arriesgaron todo para cuidarnos.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&h=600&fit=crop',
    fecha: '25 de enero, 2026',
    autor: 'Fundación Rotaria',
    categoria: 'Fundación',
    tiempoLectura: '5 min'
  },
  8: {
    id: 8,
    titulo: 'Rotary Pinta Colombia embellece 10 ciudades',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        El proyecto Rotary Pinta Colombia ha dejado su huella colorida en barrios de 10 ciudades del país, transformando espacios públicos degradados en obras de arte comunitario que inspiran orgullo y unidad.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Arte que transforma comunidades</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Nacido en 2022, Rotary Pinta Colombia es una iniciativa que une el arte, el voluntariado y el servicio comunitario. La idea es simple pero poderosa: reunir a artistas locales, rotarios y miembros de la comunidad para pintar murales que embellezcan espacios públicos y cuenten historias de esperanza.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        "El arte tiene el poder de transformar no solo paredes, sino también actitudes", explica el coordinador del proyecto. "Cuando una comunidad se une para crear algo bello, surge un sentido de pertenencia y orgullo que trasciende el mural mismo".
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Las 10 ciudades pintadas</h2>
      
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4 my-8">
        <div class="bg-gray-50 p-4 rounded-lg text-center">
          <div class="font-semibold text-gray-900">Bogotá</div>
          <div class="text-sm text-gray-600">3 murales</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg text-center">
          <div class="font-semibold text-gray-900">Medellín</div>
          <div class="text-sm text-gray-600">2 murales</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg text-center">
          <div class="font-semibold text-gray-900">Cali</div>
          <div class="text-sm text-gray-600">2 murales</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg text-center">
          <div class="font-semibold text-gray-900">Barranquilla</div>
          <div class="text-sm text-gray-600">1 mural</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg text-center">
          <div class="font-semibold text-gray-900">Cartagena</div>
          <div class="text-sm text-gray-600">1 mural</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg text-center">
          <div class="font-semibold text-gray-900">Bucaramanga</div>
          <div class="text-sm text-gray-600">1 mural</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg text-center">
          <div class="font-semibold text-gray-900">Pereira</div>
          <div class="text-sm text-gray-600">1 mural</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg text-center">
          <div class="font-semibold text-gray-900">Manizales</div>
          <div class="text-sm text-gray-600">1 mural</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg text-center">
          <div class="font-semibold text-gray-900">Cúcuta</div>
          <div class="text-sm text-gray-600">1 mural</div>
        </div>
      </div>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Más que pintura</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Cada proyecto de Rotary Pinta Colombia incluye talleres de arte para niños y jóvenes de la comunidad, charlas sobre el valor del arte urbano y actividades de limpieza del espacio público. El objetivo es que la comunidad se apropie del proceso y del resultado.
      </p>
      
      <blockquote class="border-l-4 border-rotary-gold bg-rotary-gold/5 p-6 my-8 italic text-gray-700">
        "Antes, esta pared estaba llena de grafitis y basura. Ahora es un símbolo de nuestro barrio. Los niños vienen aquí a tomarse fotos, y los adultos se sienten orgullosos de mostrar a visitantes 'nuestro mural'."
        <footer class="mt-2 font-semibold text-gray-900 not-italic">— José Martínez, líder comunitario en Bogotá</footer>
      </blockquote>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Próximas ciudades</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Para 2026, Rotary Pinta Colombia planea expandirse a 5 ciudades adicionales, incluyendo Ibagué, Villavicencio y Pasto. También estamos explorando la posibilidad de crear un festival nacional de murales que reúna a artistas de todo el país.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1200&h=600&fit=crop',
    fecha: '20 de enero, 2026',
    autor: 'Proyectos Comunitarios',
    categoria: 'Proyectos',
    tiempoLectura: '4 min'
  },
  9: {
    id: 9,
    titulo: 'Nuevos socios se unen a la familia Rotary Club',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        Con gran alegría damos la bienvenida a cinco nuevos miembros que se han unido al Rotary Club. Cada uno de ellos aporta habilidades, experiencias y pasión únicas que enriquecerán nuestra misión de servicio.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Conociendo a los nuevos socios</h2>
      
      <div class="space-y-8 my-8">
        <div class="bg-gray-50 p-6 rounded-xl">
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Dra. Carolina Mendoza</h3>
          <p class="text-rotary-blue font-medium mb-3">Médica - Especialista en Salud Pública</p>
          <p class="text-gray-700 leading-relaxed">
            La Dra. Mendoza trabaja en el Ministerio de Salud y aportará su experiencia en el desarrollo de proyectos de salud comunitaria. "El Rotary me ofrece la oportunidad de llevar mi trabajo más allá de la oficina y tocar vidas directamente", comparte.
          </p>
        </div>
        
        <div class="bg-gray-50 p-6 rounded-xl">
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Ing. Andrés Felipe López</h3>
          <p class="text-rotary-blue font-medium mb-3">Ingeniero Civil - Experto en Infraestructura</p>
          <p class="text-gray-700 leading-relaxed">
            Andrés Felipe ha trabajado en proyectos de infraestructura en zonas rurales y liderará nuestros esfuerzos en el programa Origen H2O. "El acceso al agua potable es fundamental, y quiero usar mis habilidades para hacerlo realidad", afirma.
          </p>
        </div>
        
        <div class="bg-gray-50 p-6 rounded-xl">
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Prof. Diana Castro</h3>
          <p class="text-rotary-blue font-medium mb-3">Docente - Especialista en Educación</p>
          <p class="text-gray-700 leading-relaxed">
            Diana tiene 15 años de experiencia en educación y se unirá al comité de becas educativas. "La educación transforma vidas. Estoy emocionada de poder contribuir a que más jóvenes accedan a oportunidades", expresa.
          </p>
        </div>
        
        <div class="bg-gray-50 p-6 rounded-xl">
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Dr. Roberto Vega</h3>
          <p class="text-rotary-blue font-medium mb-3">Empresario - Sector Tecnológico</p>
          <p class="text-gray-700 leading-relaxed">
            Roberto es fundador de una startup tecnológica exitosa y aportará su visión empresarial a nuestros proyectos. "El Rotary combina lo mejor de dos mundos: el espíritu empresarial y el compromiso social", comenta.
          </p>
        </div>
        
        <div class="bg-gray-50 p-6 rounded-xl">
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Sra. Isabel Torres</h3>
          <p class="text-rotary-blue font-medium mb-3">Comunicadora Social - Experta en Marketing</p>
          <p class="text-gray-700 leading-relaxed">
            Isabel liderará nuestras iniciativas de comunicación y visibilidad. "Quiero ayudar a contar las historias del Rotary para inspirar a más personas a unirse a esta causa", dice.
          </p>
        </div>
      </div>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Un club en crecimiento</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        La llegada de estos cinco nuevos socios eleva nuestra membresía a 45 personas comprometidas con el servicio. Cada nuevo miembro fortalece nuestra capacidad de impactar positivamente en las comunidades que servimos.
      </p>
      
      <blockquote class="border-l-4 border-rotary-gold bg-rotary-gold/5 p-6 my-8 italic text-gray-700">
        "El crecimiento de nuestro club no se mide solo en números, sino en la diversidad de talentos y perspectivas que cada nuevo socio aporta. Juntos, somos más fuertes."
        <footer class="mt-2 font-semibold text-gray-900 not-italic">— Presidente del Rotary Club</footer>
      </blockquote>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">¿Te gustaría unirte?</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Si estás interesado en formar parte del Rotary Club, te invitamos a asistir a una de nuestras reuniones como invitado. Buscamos personas comprometidas con el servicio, dispuestas a usar sus habilidades para hacer del mundo un lugar mejor.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=1200&h=600&fit=crop',
    fecha: '15 de enero, 2026',
    autor: 'Membresía Rotary',
    categoria: 'Socios',
    tiempoLectura: '2 min'
  },
  10: {
    id: 10,
    titulo: 'Programa de becas para jóvenes líderes 2026',
    contenido: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        El Rotary Club abre la convocatoria para su programa de becas 2026, que otorgará apoyo financiero completo a 20 jóvenes colombianos destacados por su liderazgo y compromiso comunitario.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Invirtiendo en el futuro</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Desde 2018, nuestro programa de becas ha apoyado a más de 100 jóvenes de comunidades vulnerables para que accedan a educación universitaria y técnica. Creemos firmemente que invertir en la juventud es invertir en el futuro de Colombia.
      </p>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        "Estas becas no son solo dinero para la universidad", explica nuestra directora de programas educativos. "Son una inversión en líderes del mañana, personas que devolverán a sus comunidades el apoyo que recibieron".
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Detalles del programa 2026</h2>
      
      <div class="bg-gray-50 p-6 rounded-xl my-8">
        <h3 class="text-xl font-semibold text-gray-900 mb-4">Lo que incluye la beca</h3>
        <ul class="space-y-3 text-gray-700">
          <li class="flex items-start gap-3">
            <span class="text-rotary-gold font-bold">✓</span>
            <span>Matrícula universitaria completa durante toda la carrera</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="text-rotary-gold font-bold">✓</span>
            <span>Apoyo para libros y materiales de estudio</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="text-rotary-gold font-bold">✓</span>
            <span>Transporte o alojamiento según necesidad</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="text-rotary-gold font-bold">✓</span>
            <span>Mentoría personalizada con un rotario</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="text-rotary-gold font-bold">✓</span>
            <span>Acceso a programas de desarrollo de liderazgo</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="text-rotary-gold font-bold">✓</span>
            <span>Oportunidades de pasantías y networking</span>
          </li>
        </ul>
      </div>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Requisitos para aplicar</h2>
      
      <ul class="list-disc list-inside space-y-3 text-gray-700 mb-8 ml-4">
        <li>Tener entre 17 y 23 años al momento de aplicar</li>
        <li>Haber sido admitido o estar en proceso de admisión a una universidad o institución técnica</li>
        <li>Demostrar necesidad financiera</li>
        <li>Contar con un historial de liderazgo y servicio comunitario</li>
        <li>Residir en Colombia</li>
        <li>Compromiso de mantener un promedio académico mínimo de 3.5</li>
      </ul>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Proceso de selección</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        El proceso incluye la presentación de documentos, cartas de recomendación, una entrevista personal y una evaluación del historial académico y de servicio. Buscamos jóvenes que no solo tengan excelencia académica, sino también un genuino compromiso con servir a sus comunidades.
      </p>
      
      <blockquote class="border-l-4 border-rotary-gold bg-rotary-gold/5 p-6 my-8 italic text-gray-700">
        "La beca del Rotary cambió mi vida. No solo pude estudiar ingeniería, sino que descubrí mi pasión por el servicio comunitario. Hoy, como egresada, dedico parte de mi tiempo a mentorizar a otros jóvenes."
        <footer class="mt-2 font-semibold text-gray-900 not-italic">— Laura Jiménez, becaria 2020</footer>
      </blockquote>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Fechas importantes</h2>
      
      <div class="space-y-3 text-gray-700 mb-8">
        <p><strong>Apertura de convocatoria:</strong> 15 de febrero de 2026</p>
        <p><strong>Cierre de aplicaciones:</strong> 30 de marzo de 2026</p>
        <p><strong>Entrevistas:</strong> Abril de 2026</p>
        <p><strong>Anuncio de ganadores:</strong> 15 de mayo de 2026</p>
        <p><strong>Inicio de clases:</strong> Según calendario universitario</p>
      </div>
      
      <p class="text-gray-700 leading-relaxed mb-6">
        Para más información y para aplicar, visita nuestra sección de becas o contacta a nuestro comité de educación. ¡Esperamos recibir tu aplicación!
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=600&fit=crop',
    fecha: '10 de enero, 2026',
    autor: 'Educación Rotary',
    categoria: 'Eventos',
    tiempoLectura: '6 min'
  }
};

const articulosRelacionados = [
  { id: 1, titulo: 'Olayinka H. Babalola insta a los socios de Rotary a generar un impacto duradero', imagen: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=400&h=250&fit=crop', categoria: 'Eventos' },
  { id: 2, titulo: 'Entrevista con Bill Gates: El optimista', imagen: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&h=250&fit=crop', categoria: 'Fundación' },
  { id: 3, titulo: 'Gente de Acción en todo el mundo', imagen: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=400&h=250&fit=crop', categoria: 'Socios' }
];

const BlogPost = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { club } = useClub();
  
  const [articulo, setArticulo] = useState<any>(null);
  const [otrosArticulos, setOtrosArticulos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // Lightbox
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);

  // Comentarios
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState(false);
  const [commentForm, setCommentForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    country: 'Colombia',
    rating: 5,
    text: ''
  });

  const isStatic = id?.startsWith('static-');
  const articuloIdNumeric = isStatic ? parseInt(id!.replace('static-', '')) : (id && /^\d+$/.test(id) ? parseInt(id) : NaN);

  const fetchComments = async (postId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/${club.id}/posts/${postId}/comments`);
      if (response.ok) {
        const data = await response.json();
        setComments(data);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!articulo?.id) return;
    
    setSubmittingComment(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/${club.id}/posts/${articulo.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commentForm)
      });
      if (response.ok) {
        const newComment = await response.json();
        setComments(prev => [newComment, ...prev]);
        setCommentSuccess(true);
        setCommentForm({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          country: 'Colombia',
          rating: 5,
          text: ''
        });
        setTimeout(() => setCommentSuccess(false), 5000);
      }
    } catch (error) {
      console.error('Error submitting comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch current post
        let currentPost: any = null;
        if (!isNaN(articuloIdNumeric) && articulosData[articuloIdNumeric]) {
          currentPost = articulosData[articuloIdNumeric];
        } else {
          const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/${club.id}/posts/${id}`);
          if (response.ok) {
            const data = await response.json();
            currentPost = {
              ...data,
              titulo: data.title,
              contenido: data.content,
              imagen: data.image,
              fecha: new Date(data.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
              autor: 'Rotary Club',
              tiempoLectura: '5 min'
            };
          }
        }

        if (currentPost) {
          setArticulo(currentPost);
          fetchComments(currentPost.id);
          
          // 2. Fetch other posts for 'Related' section
          const relatedResponse = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/${club.id}/posts?limit=6`);
          if (relatedResponse.ok) {
            const posts = await relatedResponse.json();
            // Filtrar el actual
            const filtered = posts.filter((p: any) => p.id !== id && p.id !== articuloIdNumeric);
            setOtrosArticulos(filtered);
          }
        } else {
          setError(true);
        }
      } catch (err) {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    if (club.id) {
      fetchData();
    }
    window.scrollTo(0, 0);
  }, [id, club.id]);

  const allMedia = articulo ? [
    ...(articulo.videoGallery || []).map((v: string) => ({ url: v, type: 'video' })),
    ...(articulo.images || []).map((i: string) => ({ url: i, type: 'image' }))
  ] : [];

  const handleNextMedia = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (selectedMediaIndex !== null && allMedia.length > 0) {
      setSelectedMediaIndex((selectedMediaIndex + 1) % allMedia.length);
    }
  };

  const handlePrevMedia = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (selectedMediaIndex !== null && allMedia.length > 0) {
      setSelectedMediaIndex((selectedMediaIndex - 1 + allMedia.length) % allMedia.length);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedMediaIndex === null) return;
      if (e.key === 'ArrowRight') handleNextMedia();
      if (e.key === 'ArrowLeft') handlePrevMedia();
      if (e.key === 'Escape') setSelectedMediaIndex(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMediaIndex]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="py-40 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rotary-blue mx-auto mb-4"></div>
          <p className="text-gray-500">Cargando artículo...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !articulo) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="py-20 text-center px-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Artículo no encontrado</h1>
          <p className="text-gray-600 mb-6">El artículo que buscas no existe o ha sido eliminado.</p>
          <Link to="/blog" className="text-rotary-blue hover:underline">
            Volver al blog
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero del Artículo */}
      <section className="relative">
        <div className="relative h-[400px] md:h-[500px] overflow-hidden">
          <img
            src={articulo.imagen}
            alt={articulo.titulo}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 pb-8 md:pb-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Categoría */}
            <span className="inline-block bg-rotary-gold text-white text-sm font-semibold px-4 py-1 rounded-full mb-4">
              {articulo.categoria}
            </span>

            {/* Título */}
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
              {articulo.titulo}
            </h1>

            {/* Meta información */}
            <div className="flex flex-wrap items-center gap-4 md:gap-6 text-white/80 text-sm">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {articulo.fecha}
              </span>
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                {articulo.autor}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {articulo.tiempoLectura} de lectura
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Contenido del Artículo */}
      <article className="py-12 md:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Botón volver */}
          <button
            onClick={() => navigate('/blog')}
            className="flex items-center gap-2 text-gray-600 hover:text-rotary-blue transition-colors mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al blog
          </button>

          {/* Contenido */}
          <div
            className="prose max-w-none mb-12 w-full break-words"
            dangerouslySetInnerHTML={{ __html: articulo.contenido }}
          />

          {articulo.videoUrl && (
            <div className="mt-12 mb-16">
              <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl border-8 border-gray-100/50 group">
                {(articulo.videoUrl.includes('youtube.com') || articulo.videoUrl.includes('youtu.be')) ? (
                  <iframe
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube.com/embed/${articulo.videoUrl.split('v=')[1]?.split('&')[0] || articulo.videoUrl.split('/').pop()}`}
                    title="Video principal"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                ) : (
                  <video
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                    src={articulo.videoUrl}
                    controls
                    playsInline
                  />
                )}
              </div>
            </div>
          )}

          {/* Galería Adaptativa (Imágenes y Videos) */}
          {((articulo.images && articulo.images.length > 0) || (articulo.videoGallery && articulo.videoGallery.length > 0)) && (
            <div className="mt-12 mb-16">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-[20px] font-black text-gray-900 border-b-4 border-rotary-gold pb-1 inline-block uppercase tracking-tight">Galería Multimedia</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{articulo.images.length + (articulo.videoGallery?.length || 0)} ARCHIVOS</p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 auto-rows-[220px]">
                {/* Mezclar videos e imágenes */}
                {allMedia.map((item: any, index: number) => {
                   // Patrón para que la primera sea grande y ocupe 2x2 en un grid de 3 columnas
                   const isFirstLarge = index === 0;
                   const isYouTube = item.type === 'video' && (item.url.includes('youtube.com') || item.url.includes('youtu.be'));
                   
                   return (
                     <motion.div 
                       key={index} 
                       initial={{ opacity: 0, y: 20 }}
                       whileInView={{ opacity: 1, y: 0 }}
                       viewport={{ once: true }}
                       transition={{ delay: index * 0.05 }}
                       className={`relative rounded-2xl overflow-hidden shadow-md group cursor-pointer border border-gray-100 ${isFirstLarge ? 'md:col-span-2 md:row-span-2' : 'col-span-1'}`}
                       onClick={() => setSelectedMediaIndex(index)}
                     >
                       {item.type === 'video' ? (
                         <div className="w-full h-full bg-gray-900 flex items-center justify-center relative">
                            {isYouTube ? (
                              <div className="absolute inset-0 opacity-40">
                                <img 
                                  src={`https://img.youtube.com/vi/${item.url.split('v=')[1]?.split('&')[0] || item.url.split('/').pop()}/0.jpg`} 
                                  className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all"
                                  alt=""
                                />
                              </div>
                            ) : (
                              <video 
                                className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale group-hover:grayscale-0 transition-all"
                                src={item.url}
                                muted
                                preload="metadata"
                              />
                            )}
                            <div className="bg-rotary-blue text-white p-4 rounded-full relative z-10 group-hover:scale-110 transition-transform shadow-xl">
                              <Play className="w-6 h-6 fill-white" />
                            </div>
                            <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
                              <VideoIcon className="w-4 h-4 text-white" />
                              <span className="text-[10px] font-black text-white uppercase tracking-widest">Video</span>
                            </div>
                         </div>
                       ) : (
                         <>
                            <img
                             src={item.url}
                             alt={`Galería ${index + 1}`}
                             className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                           />
                           <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                              <Maximize2 className="w-5 h-5 text-white" />
                           </div>
                         </>
                       )}
                     </motion.div>
                   );
                })}
              </div>
            </div>
          )}

          {/* Lightbox Immersivo */}
          <AnimatePresence>
            {selectedMediaIndex !== null && allMedia[selectedMediaIndex] && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 p-4 md:p-10 backdrop-blur-sm"
                onClick={() => setSelectedMediaIndex(null)}
              >
                {/* Controles del Lightbox */}
                <div className="absolute top-6 right-6 flex items-center gap-6 z-[10000]">
                   <span className="text-white/50 text-xs font-black tracking-[0.2em]">
                     {selectedMediaIndex + 1} / {allMedia.length}
                   </span>
                   <button 
                     className="text-white hover:text-rotary-gold transition-colors"
                     onClick={(e) => { e.stopPropagation(); setSelectedMediaIndex(null); }}
                   >
                     <CloseIcon className="w-10 h-10" />
                   </button>
                </div>

                {/* Botones de Navegación Lateral */}
                {allMedia.length > 1 && (
                  <>
                   <button 
                     className="absolute left-4 md:left-10 top-1/2 -translate-y-1/2 p-3 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all z-[10000] border border-white/10 group backdrop-blur-md"
                     onClick={handlePrevMedia}
                   >
                     <ChevronLeft className="w-8 h-8 group-hover:-translate-x-1 transition-transform" />
                   </button>
                   <button 
                     className="absolute right-4 md:right-10 top-1/2 -translate-y-1/2 p-3 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all z-[10000] border border-white/10 group backdrop-blur-md"
                     onClick={handleNextMedia}
                   >
                     <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
                   </button>
                  </>
                )}

                <motion.div 
                  key={selectedMediaIndex} // Force re-animation on index change
                  initial={{ scale: 0.9, opacity: 0, x: 20 }}
                  animate={{ scale: 1, opacity: 1, x: 0 }}
                  exit={{ scale: 0.9, opacity: 0, x: -20 }}
                  className="max-w-7xl w-full max-h-full flex items-center justify-center relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  {allMedia[selectedMediaIndex].type === 'video' ? (
                    <div className="w-full aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black">
                      {(allMedia[selectedMediaIndex].url.includes('youtube.com') || allMedia[selectedMediaIndex].url.includes('youtu.be')) ? (
                        <iframe
                          className="w-full h-full border-none"
                          src={`https://www.youtube.com/embed/${allMedia[selectedMediaIndex].url.split('v=')[1]?.split('&')[0] || allMedia[selectedMediaIndex].url.split('/').pop()}?autoplay=1`}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      ) : (
                        <video
                          className="w-full h-full object-contain"
                          src={allMedia[selectedMediaIndex].url}
                          controls
                          autoPlay
                          playsInline
                        />
                      )}
                    </div>
                  ) : (
                    <img 
                      src={allMedia[selectedMediaIndex].url} 
                      className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl select-none"
                      alt="Full view"
                      crossOrigin="anonymous"
                    />
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compartir */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div>
                <span className="flex items-center gap-2 text-gray-600 font-medium mb-3">
                  <Share2 className="w-4 h-4" />
                  Compartir artículo
                </span>
                <div className="flex gap-3">
                  <button className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors">
                    <Facebook className="w-5 h-5" />
                  </button>
                  <button className="w-10 h-10 flex items-center justify-center bg-sky-500 text-white rounded-full hover:bg-sky-600 transition-colors">
                    <Twitter className="w-5 h-5" />
                  </button>
                  <button className="w-10 h-10 flex items-center justify-center bg-blue-700 text-white rounded-full hover:bg-blue-800 transition-colors">
                    <Linkedin className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Tag className="w-4 h-4" />
                <span>{articulo.categoria}</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* Comentarios y Calificaciones */}
      <section className="py-12 md:py-16 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-10">
            <MessageSquare className="w-6 h-6 text-rotary-blue" />
            <h2 className="text-2xl font-bold text-gray-900">Comentarios y Calificaciones</h2>
            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-medium">
              {comments.length}
            </span>
          </div>

          {/* Lista de Comentarios */}
          <div className="space-y-8 mb-16">
            {loadingComments ? (
               <div className="text-center py-10">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rotary-blue mx-auto"></div>
               </div>
            ) : comments.length > 0 ? (
              comments.map((comment) => (
                <div key={comment.id} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 transition-all hover:shadow-md">
                   <div className="flex justify-between items-start mb-4">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-rotary-blue/10 rounded-full flex items-center justify-center text-rotary-blue font-bold text-sm">
                         {comment.firstName?.[0] || 'U'}{comment.lastName?.[0] || ''}
                       </div>
                       <div>
                         <h4 className="font-semibold text-gray-900">{comment.firstName} {comment.lastName}</h4>
                         <p className="text-xs text-gray-500">
                           {new Date(comment.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                         </p>
                       </div>
                     </div>
                     <div className="flex gap-0.5">
                       {[...Array(5)].map((_, i) => (
                         <Star 
                           key={i} 
                           className={`w-4 h-4 ${i < comment.rating ? 'fill-rotary-gold text-rotary-gold' : 'text-gray-300'}`} 
                         />
                       ))}
                     </div>
                   </div>
                   <p className="text-gray-700 leading-relaxed text-sm whitespace-pre-line">
                     {comment.text}
                   </p>
                </div>
              ))
            ) : (
              <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-500">
                Aún no hay comentarios. ¡Sé el primero en compartir tu opinión!
              </div>
            )}
          </div>

          {/* Formulario */}
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl">
             <h3 className="text-xl font-bold text-gray-900 mb-6 font-rotary leading-tight">Deja un comentario</h3>
             
             {commentSuccess ? (
               <div className="bg-green-50 text-green-700 p-6 rounded-2xl flex items-center gap-4 mb-6 animate-in fade-in slide-in-from-top-4">
                 <CheckCircle className="w-8 h-8 flex-shrink-0" />
                 <div>
                   <p className="font-bold">¡Comentario enviado con éxito!</p>
                   <p className="text-sm">Gracias por tu opinión y calificación.</p>
                 </div>
               </div>
             ) : null}

             <form onSubmit={handleCommentSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-700">Nombre</label>
                     <input 
                       required 
                       type="text" 
                       value={commentForm.firstName}
                       onChange={(e) => setCommentForm({...commentForm, firstName: e.target.value})}
                       className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                       placeholder="Escribre tu nombre"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-700">Apellidos</label>
                     <input 
                       required 
                       type="text" 
                       value={commentForm.lastName}
                       onChange={(e) => setCommentForm({...commentForm, lastName: e.target.value})}
                       className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                       placeholder="Escribe tus apellidos"
                     />
                   </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-700">Correo electrónico</label>
                     <input 
                       required 
                       type="email" 
                       value={commentForm.email}
                       onChange={(e) => setCommentForm({...commentForm, email: e.target.value})}
                       className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                       placeholder="ejemplo@correo.com"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-700">Número de celular</label>
                     <input 
                       type="tel" 
                       value={commentForm.phone}
                       onChange={(e) => setCommentForm({...commentForm, phone: e.target.value})}
                       className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                       placeholder="+57 300 000 0000"
                     />
                   </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-700">País</label>
                     <select 
                       value={commentForm.country}
                       onChange={(e) => setCommentForm({...commentForm, country: e.target.value})}
                       className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                     >
                       <option value="Colombia">Colombia</option>
                       <option value="Argentina">Argentina</option>
                       <option value="México">México</option>
                       <option value="España">España</option>
                       <option value="Estados Unidos">Estados Unidos</option>
                       <option value="Chile">Chile</option>
                       <option value="Perú">Perú</option>
                       <option value="Ecuador">Ecuador</option>
                       <option value="Otro">Otro</option>
                     </select>
                   </div>
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-gray-700">Calificación</label>
                     <div className="flex gap-2 py-3">
                        {[1,2,3,4,5].map((star) => (
                           <button
                             type="button"
                             key={star}
                             onClick={() => setCommentForm({...commentForm, rating: star})}
                             className="transition-transform hover:scale-110"
                           >
                             <Star className={`w-6 h-6 ${commentForm.rating >= star ? 'fill-rotary-gold text-rotary-gold' : 'text-gray-300'}`} />
                           </button>
                        ))}
                     </div>
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-sm font-medium text-gray-700">Tu comentario</label>
                   <textarea 
                     required 
                     rows={4}
                     value={commentForm.text}
                     onChange={(e) => setCommentForm({...commentForm, text: e.target.value})}
                     className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all resize-none"
                     placeholder="Comparte tu experiencia..."
                   />
                </div>

                <button
                  type="submit"
                  disabled={submittingComment}
                  className="w-full bg-rotary-blue text-white font-bold py-4 rounded-xl hover:bg-rotary-blue/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rotary-blue/20"
                >
                  {submittingComment ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Enviar Comentario
                    </>
                  )}
                </button>
             </form>
          </div>
        </div>
      </section>

      {/* Artículos Relacionados - Solo mostrar si hay al menos 4 otros artículos (total 5) */}
      {otrosArticulos.length >= 4 && (
        <section className="py-12 md:py-16 bg-rotary-concrete">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">Artículos relacionados</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {otrosArticulos
                .slice(0, 3)
                .map((relacionado) => (
                  <Link
                    key={relacionado.id}
                    to={`/blog/${relacionado.slug || relacionado.id}`}
                    className="group bg-white rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <img
                        src={relacionado.image || relacionado.imagen}
                        alt={relacionado.title || relacionado.titulo}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <span className="absolute top-3 left-3 bg-rotary-gold text-white text-xs font-semibold px-2 py-1 rounded">
                        {relacionado.category || relacionado.categoria}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-rotary-blue transition-colors">
                        {relacionado.title || relacionado.titulo}
                      </h3>
                      <span className="flex items-center gap-1 text-rotary-blue text-sm mt-2 group-hover:underline">
                        Leer más
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
};

export default BlogPost;
