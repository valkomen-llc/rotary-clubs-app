import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Heart, 
  Users, 
  MapPin, 
  Calendar, 
  Target,
  CheckCircle2,
  Droplets,
  GraduationCap,
  TreePine,
  Home,
  Facebook,
  Twitter,
  Linkedin,
  X
} from 'lucide-react';
import { useState, useEffect } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const proyectosData: Record<number, {
  id: number;
  titulo: string;
  descripcion: string;
  descripcionLarga: string;
  imagen: string;
  imagenes: string[];
  categoria: string;
  icono: any;
  meta: number;
  recaudado: number;
  donantes: number;
  diasRestantes: number;
  beneficiarios: number;
  ubicacion: string;
  fechaInicio: string;
  fechaFin: string;
  completado: boolean;
  impacto: string[];
  actualizaciones: { fecha: string; titulo: string; contenido: string }[];
  donantesRecientes: { nombre: string; monto: number; tiempo: string }[];
}> = {
  1: {
    id: 1,
    titulo: 'Origen H2O - Agua para Comunidades Rurales',
    descripcion: 'Instalación de sistemas de agua potable en comunidades rurales',
    descripcionLarga: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        El acceso al agua potable es un derecho humano fundamental. Sin embargo, millones de colombianos en zonas rurales aún carecen de este recurso esencial. El proyecto Origen H2O nace con el compromiso de cambiar esta realidad.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">El problema</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        En las veredas de Cundinamarca y Boyacá, muchas familias deben caminar hasta dos horas diarias para conseguir agua, y a menudo esta no es segura para consumo. Esto afecta la salud, la educación y las oportunidades económicas de estas comunidades.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Nuestra solución</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Instalaremos 15 sistemas completos de agua potable que incluyen:
      </p>
      
      <ul class="list-disc list-inside space-y-3 text-gray-700 mb-8 ml-4">
        <li>Captación de agua de fuentes naturales</li>
        <li>Sistemas de filtración y purificación</li>
        <li>Redes de distribución domiciliaria</li>
        <li>Capacitación en mantenimiento a la comunidad</li>
        <li>Comités de agua para gestión sostenible</li>
      </ul>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Impacto esperado</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Con tu apoyo, 8,500 personas tendrán acceso a agua limpia y segura en sus hogares. Esto significa menos enfermedades, más tiempo para estudiar y trabajar, y una mejor calidad de vida para toda la comunidad.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=1200&h=600&fit=crop',
    imagenes: [
      'https://images.unsplash.com/photo-1541252260730-0412e8e2108e?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1538300342682-cf57afb97285?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1497493292307-e6098818d3bb?w=600&h=400&fit=crop'
    ],
    categoria: 'Agua y Saneamiento',
    icono: Droplets,
    meta: 150000000,
    recaudado: 98500000,
    donantes: 342,
    diasRestantes: 45,
    beneficiarios: 8500,
    ubicacion: 'Cundinamarca & Boyacá',
    fechaInicio: 'Enero 2026',
    fechaFin: 'Diciembre 2026',
    completado: false,
    impacto: [
      '8,500 personas con acceso a agua potable',
      '15 sistemas de agua instalados',
      'Reducción del 80% en enfermedades diarreicas',
      'Ahorro de 2 horas diarias por familia'
    ],
    actualizaciones: [
      {
        fecha: '15 de febrero, 2026',
        titulo: 'Inicia la fase de evaluación de terreno',
        contenido: 'Nuestro equipo técnico ha visitado las primeras 5 comunidades beneficiarias para evaluar las condiciones del terreno y planificar la instalación de los sistemas de agua.'
      },
      {
        fecha: '1 de febrero, 2026',
        titulo: 'Campaña de recaudación supera el 60%',
        contenido: 'Gracias al apoyo de 342 donantes, hemos alcanzado el 65% de nuestra meta. ¡Continuemos trabajando juntos para llegar al 100%!'
      }
    ],
    donantesRecientes: [
      { nombre: 'Carlos M.', monto: 100000, tiempo: 'hace 2 horas' },
      { nombre: 'María Elena R.', monto: 50000, tiempo: 'hace 5 horas' },
      { nombre: 'Empresa ABC', monto: 500000, tiempo: 'hace 1 día' },
      { nombre: 'Anónimo', monto: 25000, tiempo: 'hace 1 día' }
    ]
  },
  2: {
    id: 2,
    titulo: 'Becas Educativas para Jóvenes Líderes 2026',
    descripcion: 'Programa de becas completas para jóvenes destacados',
    descripcionLarga: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        La educación es la herramienta más poderosa para transformar vidas y comunidades. Nuestro programa de becas busca identificar y apoyar a jóvenes excepcionales que, por limitaciones económicas, no podrían acceder a educación universitaria.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">¿Qué incluye la beca?</h2>
      
      <ul class="list-disc list-inside space-y-3 text-gray-700 mb-8 ml-4">
        <li>Matrícula universitaria completa durante toda la carrera</li>
        <li>Apoyo para libros y materiales de estudio</li>
        <li>Transporte o alojamiento según necesidad</li>
        <li>Mentoría personalizada con un rotario</li>
        <li>Programas de desarrollo de liderazgo</li>
        <li>Oportunidades de pasantías y networking</li>
      </ul>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Criterios de selección</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Buscamos jóvenes entre 17 y 23 años con excelencia académica, historial de liderazgo comunitario y genuino compromiso con servir a sus comunidades. El proceso incluye aplicación, entrevistas y evaluación integral.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Impacto a largo plazo</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Los becarios se comprometen a "devolver" el apoyo recibido mediante horas de servicio comunitario y, una vez egresados, a mentorizar a nuevos becarios. Así creamos un círculo virtuoso de oportunidades.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=600&fit=crop',
    imagenes: [
      'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=600&h=400&fit=crop'
    ],
    categoria: 'Educación',
    icono: GraduationCap,
    meta: 200000000,
    recaudado: 156000000,
    donantes: 518,
    diasRestantes: 60,
    beneficiarios: 25,
    ubicacion: 'Nacional',
    fechaInicio: 'Febrero 2026',
    fechaFin: 'Noviembre 2026',
    completado: false,
    impacto: [
      '25 jóvenes con beca completa',
      '100% de cobertura de matrícula',
      'Programa de mentoría incluido',
      'Red de egresados para toda la vida'
    ],
    actualizaciones: [
      {
        fecha: '10 de febrero, 2026',
        titulo: 'Abierta la convocatoria 2026',
        contenido: 'Los jóvenes interesados ya pueden aplicar a través de nuestra web. La fecha límite es el 30 de marzo.'
      }
    ],
    donantesRecientes: [
      { nombre: 'Fundación Educa', monto: 1000000, tiempo: 'hace 3 horas' },
      { nombre: 'Pedro G.', monto: 100000, tiempo: 'hace 8 horas' },
      { nombre: 'Laura M.', monto: 50000, tiempo: 'hace 1 día' }
    ]
  },
  3: {
    id: 3,
    titulo: 'Reforestación de Cuencas Hídricas',
    descripcion: 'Plantación de 50,000 árboles nativos',
    descripcionLarga: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        Las cuencas hídricas de Santander y Norte de Santander han sufrido graves afectaciones por la deforestación, impactando la disponibilidad de agua para comunidades enteras. Este proyecto busca restaurar estos ecosistemas vitales.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">¿Por qué es importante?</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Los bosques son los pulmones de nuestro planeta y reguladores naturales del ciclo del agua. Sin ellos, las comunidades enfrentan sequías, inundaciones y pérdida de biodiversidad.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Nuestro enfoque</h2>
      
      <ul class="list-disc list-inside space-y-3 text-gray-700 mb-8 ml-4">
        <li>Plantación de especies nativas adaptadas al ecosistema local</li>
        <li>Trabajo conjunto con comunidades campesinas</li>
        <li>Monitoreo satelital del crecimiento de los árboles</li>
        <li>Educación ambiental en escuelas locales</li>
        <li>Generación de empleo verde en la región</li>
      </ul>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Beneficios esperados</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Además de capturar CO2 y proteger el agua, el proyecto generará empleo local, fortalecerá la resiliencia climática de la región y servirá como modelo replicable en otras cuencas del país.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1200&h=600&fit=crop',
    imagenes: [
      'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1511497584788-876760111969?w=600&h=400&fit=crop'
    ],
    categoria: 'Medio Ambiente',
    icono: TreePine,
    meta: 80000000,
    recaudado: 42300000,
    donantes: 267,
    diasRestantes: 90,
    beneficiarios: 12000,
    ubicacion: 'Santander & Norte de Santander',
    fechaInicio: 'Marzo 2026',
    fechaFin: 'Diciembre 2027',
    completado: false,
    impacto: [
      '50,000 árboles nativos plantados',
      '500 hectáreas reforestadas',
      '100 empleos verdes generados',
      'Protección de 5 fuentes hídricas'
    ],
    actualizaciones: [
      {
        fecha: '5 de febrero, 2026',
        titulo: 'Alianza con corporaciones ambientales',
        contenido: 'Hemos firmado convenios con Corpoboyacá y Codechocó para el apoyo técnico del proyecto.'
      }
    ],
    donantesRecientes: [
      { nombre: 'EcoEmpresas SAS', monto: 300000, tiempo: 'hace 4 horas' },
      { nombre: 'Diana C.', monto: 75000, tiempo: 'hace 12 horas' }
    ]
  },
  4: {
    id: 4,
    titulo: 'Viviendas Dignas para Familias Afectadas',
    descripcion: 'Construcción de 30 viviendas sismorresistentes',
    descripcionLarga: `
      <p class="text-lg text-gray-700 leading-relaxed mb-6">
        Desastres naturales recientes dejaron a cientos de familias sin hogar en el Cauca y Huila. Este proyecto busca reconstruir no solo casas, sino también la dignidad y la esperanza de estas comunidades.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Un hogar seguro</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Cada vivienda será construida con materiales sismorresistentes, diseño bioclimático y espacios adecuados para familias de hasta 5 personas. Incluirá baño, cocina, dos habitaciones y área de estar.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Participación comunitaria</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Las familias beneficiarias participarán activamente en la construcción mediante el sistema de "mano de obra comprometida", fortaleciendo el sentido de pertenencia y comunidad.
      </p>
      
      <h2 class="text-2xl font-bold text-gray-900 mt-8 mb-4">Sostenibilidad</h2>
      <p class="text-gray-700 leading-relaxed mb-6">
        Las viviendas incluirán sistemas de captación de agua de lluvia, paneles solares para iluminación y biodigestores para manejo de residuos, haciéndolas autosustentables a largo plazo.
      </p>
    `,
    imagen: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1200&h=600&fit=crop',
    imagenes: [
      'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=600&h=400&fit=crop'
    ],
    categoria: 'Vivienda',
    icono: Home,
    meta: 450000000,
    recaudado: 289000000,
    donantes: 892,
    diasRestantes: 120,
    beneficiarios: 150,
    ubicacion: 'Cauca & Huila',
    fechaInicio: 'Abril 2026',
    fechaFin: 'Diciembre 2027',
    completado: false,
    impacto: [
      '30 viviendas sismorresistentes',
      '150 personas con hogar digno',
      'Energía solar en cada vivienda',
      'Captación de agua lluvia incluida'
    ],
    actualizaciones: [
      {
        fecha: '1 de febrero, 2026',
        titulo: 'Selección de familias beneficiarias',
        contenido: 'Trabajando con las alcaldías locales para identificar las familias prioritarias para el proyecto.'
      }
    ],
    donantesRecientes: [
      { nombre: 'Constructora XYZ', monto: 2000000, tiempo: 'hace 1 hora' },
      { nombre: 'Familia Rodríguez', monto: 500000, tiempo: 'hace 6 horas' }
    ]
  }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatShort = (value: number) => {
  if (value >= 1000000000) return (value / 1000000000).toFixed(1) + 'B';
  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
  return value.toString();
};

const ProyectoDetalle = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const proyectoId = parseInt(id || '1');
  const proyecto = proyectosData[proyectoId];
  const [montoDonacion, setMontoDonacion] = useState<number>(50000);
  const [mostrarModal, setMostrarModal] = useState(false);

  // Scroll al inicio cuando se carga la página
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (!proyecto) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="py-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Proyecto no encontrado</h1>
          <Link to="/proyectos" className="text-rotary-blue hover:underline">
            Volver a proyectos
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const porcentaje = Math.round((proyecto.recaudado / proyecto.meta) * 100);
  const Icono = proyecto.icono;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="relative">
        <div className="relative h-[400px] md:h-[500px] overflow-hidden">
          <img 
            src={proyecto.imagen} 
            alt={proyecto.titulo}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 pb-8 md:pb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => navigate('/proyectos')}
              className="flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a proyectos
            </button>
            
            <span className="inline-flex items-center gap-2 bg-rotary-gold text-white text-sm font-semibold px-4 py-1 rounded-full mb-4">
              <Icono className="w-4 h-4" />
              {proyecto.categoria}
            </span>
            
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 max-w-4xl">
              {proyecto.titulo}
            </h1>
            
            <div className="flex flex-wrap items-center gap-4 md:gap-6 text-white/80 text-sm">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {proyecto.ubicacion}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {proyecto.beneficiarios.toLocaleString()} beneficiarios
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {proyecto.fechaInicio} - {proyecto.fechaFin}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Contenido Principal */}
      <section className="py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Columna Principal */}
            <div className="lg:col-span-2">
              {/* Descripción */}
              <div 
                className="prose prose-lg max-w-none mb-12"
                dangerouslySetInnerHTML={{ __html: proyecto.descripcionLarga }}
              />

              {/* Galería */}
              <div className="mb-12">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Galería del Proyecto</h2>
                <div className="grid grid-cols-3 gap-4">
                  {proyecto.imagenes.map((img, index) => (
                    <div key={index} className="aspect-[4/3] rounded-lg overflow-hidden">
                      <img 
                        src={img} 
                        alt={`Imagen ${index + 1}`}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Impacto */}
              <div className="mb-12">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Impacto Esperado</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {proyecto.impacto.map((item, index) => (
                    <div key={index} className="flex items-start gap-3 bg-gray-50 p-4 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actualizaciones */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Actualizaciones</h2>
                <div className="space-y-6">
                  {proyecto.actualizaciones.map((act, index) => (
                    <div key={index} className="border-l-4 border-rotary-blue pl-4">
                      <span className="text-sm text-gray-500">{act.fecha}</span>
                      <h3 className="font-semibold text-gray-900 mt-1">{act.titulo}</h3>
                      <p className="text-gray-600 mt-2">{act.contenido}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-24">
                {/* Progreso */}
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-3xl font-bold text-rotary-blue">{porcentaje}%</span>
                    <span className="text-gray-500 text-sm">de la meta</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                    <div 
                      className="h-full bg-gradient-to-r from-rotary-blue to-rotary-gold rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(porcentaje, 100)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <span className="text-2xl font-bold text-gray-900">{formatShort(proyecto.recaudado)}</span>
                    <span className="text-gray-500"> de {formatShort(proyecto.meta)}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6 py-4 border-t border-b border-gray-100">
                  <div className="text-center">
                    <Users className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">{proyecto.donantes}</div>
                    <div className="text-xs text-gray-500">donantes</div>
                  </div>
                  <div className="text-center">
                    <Target className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                    <div className="text-lg font-bold text-gray-900">{proyecto.diasRestantes}</div>
                    <div className="text-xs text-gray-500">días restantes</div>
                  </div>
                </div>

                {/* Botón Donar */}
                <button 
                  onClick={() => setMostrarModal(true)}
                  className="w-full bg-rotary-gold text-white py-4 rounded-full font-semibold hover:bg-[#c9a020] transition-colors flex items-center justify-center gap-2 mb-4"
                >
                  <Heart className="w-5 h-5" />
                  Donar Ahora
                </button>

                {/* Compartir */}
                <div className="flex justify-center gap-3">
                  <button className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700">
                    <Facebook className="w-5 h-5" />
                  </button>
                  <button className="w-10 h-10 flex items-center justify-center bg-sky-500 text-white rounded-full hover:bg-sky-600">
                    <Twitter className="w-5 h-5" />
                  </button>
                  <button className="w-10 h-10 flex items-center justify-center bg-blue-700 text-white rounded-full hover:bg-blue-800">
                    <Linkedin className="w-5 h-5" />
                  </button>
                </div>

                {/* Donantes recientes */}
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h4 className="font-semibold text-gray-900 mb-4">Donantes recientes</h4>
                  <div className="space-y-3">
                    {proyecto.donantesRecientes.map((donante, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium text-gray-900">{donante.nombre}</span>
                          <span className="text-gray-500 text-xs ml-2">{donante.tiempo}</span>
                        </div>
                        <span className="font-semibold text-rotary-blue">{formatCurrency(donante.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modal de Donación */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative">
            <button 
              onClick={() => setMostrarModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-rotary-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-rotary-blue" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Haz tu Donación</h3>
              <p className="text-gray-600 text-sm">
                Tu contribución al proyecto "{proyecto.titulo}"
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selecciona un monto
                </label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[25000, 50000, 100000, 200000, 500000, 1000000].map((monto) => (
                    <button
                      key={monto}
                      onClick={() => setMontoDonacion(monto)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        montoDonacion === monto
                          ? 'bg-rotary-blue text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {formatCurrency(monto)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Monto a donar:</span>
                  <span className="text-xl font-bold text-rotary-blue">{formatCurrency(montoDonacion)}</span>
                </div>
              </div>

              <button 
                onClick={() => setMostrarModal(false)}
                className="w-full bg-rotary-gold text-white py-3 rounded-full font-semibold hover:bg-[#c9a020] transition-colors"
              >
                Continuar con la Donación
              </button>

              <p className="text-center text-xs text-gray-500">
                Tu donación es segura y encriptada. Recibirás un recibo por email.
              </p>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default ProyectoDetalle;
