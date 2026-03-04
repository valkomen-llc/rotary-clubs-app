import { Globe, Users, DollarSign } from 'lucide-react';

const stats = [
  {
    icon: Globe,
    value: '+1.2M',
    title: 'Somos más de 1.2 millones de rotarios en el mundo, dedicados a servir, mejorar y transformar nuestras comunidades.',
    color: 'text-rotary-blue'
  },
  {
    icon: Users,
    value: '+47M',
    title: 'Con más de aproximadamente 47 millones de horas de trabajo voluntario cada año. Somos Resiliencia y Continuidad.',
    color: 'text-purple-600'
  },
  {
    icon: DollarSign,
    value: '$291M',
    title: 'Hemos destinado 291 millones de dólares a iniciativas de servicio en el mundo y proyectos sostenibles.',
    color: 'text-rotary-gold'
  }
];

const StatsSection = () => {
  return (
    <section className="py-16 md:py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {stats.map((stat, index) => (
            <div 
              key={index} 
              className="bg-white rounded-lg shadow-md p-8 text-center hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-center mb-4">
                <stat.icon className={`w-10 h-10 ${stat.color}`} />
              </div>
              <h3 className={`text-4xl font-bold ${stat.color} mb-4`}>
                {stat.value}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {stat.title}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;
