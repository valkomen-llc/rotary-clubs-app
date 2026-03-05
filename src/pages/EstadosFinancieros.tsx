import { useState } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Shield,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  FileSpreadsheet,
  FileBarChart,
  FileCheck,
  Lock
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

interface Documento {
  id: string;
  nombre: string;
  tipo: 'balance' | 'resultados' | 'anual' | 'tributario' | 'legal';
  anio: number;
  fechaSubida: string;
  tamano: string;
  estado: 'aprobado' | 'pendiente' | 'revisado';
  acceso: 'publico' | 'privado';
}

const documentosEjemplo: Documento[] = [
  {
    id: '1',
    nombre: 'Balance General 2024',
    tipo: 'balance',
    anio: 2024,
    fechaSubida: '15/01/2025',
    tamano: '2.4 MB',
    estado: 'aprobado',
    acceso: 'publico'
  },
  {
    id: '2',
    nombre: 'Estado de Resultados 2024',
    tipo: 'resultados',
    anio: 2024,
    fechaSubida: '15/01/2025',
    tamano: '1.8 MB',
    estado: 'aprobado',
    acceso: 'publico'
  },
  {
    id: '3',
    nombre: 'Informe Anual 2024',
    tipo: 'anual',
    anio: 2024,
    fechaSubida: '20/02/2025',
    tamano: '5.2 MB',
    estado: 'aprobado',
    acceso: 'publico'
  },
  {
    id: '4',
    nombre: 'Declaración de Renta 2024',
    tipo: 'tributario',
    anio: 2024,
    fechaSubida: '10/03/2025',
    tamano: '3.1 MB',
    estado: 'aprobado',
    acceso: 'privado'
  },
  {
    id: '5',
    nombre: 'Certificado de Existencia y Representación Legal',
    tipo: 'legal',
    anio: 2025,
    fechaSubida: '05/01/2025',
    tamano: '850 KB',
    estado: 'aprobado',
    acceso: 'publico'
  },
  {
    id: '6',
    nombre: 'Balance General 2023',
    tipo: 'balance',
    anio: 2023,
    fechaSubida: '20/01/2024',
    tamano: '2.1 MB',
    estado: 'aprobado',
    acceso: 'publico'
  },
  {
    id: '7',
    nombre: 'Estado de Resultados 2023',
    tipo: 'resultados',
    anio: 2023,
    fechaSubida: '20/01/2024',
    tamano: '1.6 MB',
    estado: 'aprobado',
    acceso: 'publico'
  },
  {
    id: '8',
    nombre: 'Informe Anual 2023',
    tipo: 'anual',
    anio: 2023,
    fechaSubida: '28/02/2024',
    tamano: '4.8 MB',
    estado: 'aprobado',
    acceso: 'publico'
  }
];

const tiposDocumento = [
  { value: 'todos', label: 'Todos los documentos' },
  { value: 'balance', label: 'Balance General' },
  { value: 'resultados', label: 'Estado de Resultados' },
  { value: 'anual', label: 'Informes Anuales' },
  { value: 'tributario', label: 'Documentos Tributarios' },
  { value: 'legal', label: 'Documentos Legales' }
];

const iconosTipo: Record<string, React.ElementType> = {
  balance: FileSpreadsheet,
  resultados: FileBarChart,
  anual: FileText,
  tributario: FileCheck,
  legal: Shield
};

const EstadosFinancieros = () => {
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroAnio, setFiltroAnio] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [documentos] = useState<Documento[]>(documentosEjemplo);

  const documentosFiltrados = documentos.filter(doc => {
    const matchTipo = filtroTipo === 'todos' || doc.tipo === filtroTipo;
    const matchAnio = filtroAnio === 'todos' || doc.anio.toString() === filtroAnio;
    const matchBusqueda = doc.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchTipo && matchAnio && matchBusqueda;
  });

  const aniosDisponibles = [...new Set(documentos.map(d => d.anio))].sort((a, b) => b - a);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundColor: '#263b4c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-block bg-rotary-gold text-white text-sm font-semibold px-4 py-1 rounded-full mb-4">
              Transparencia
            </span>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
              Estados Financieros
            </h1>
            <p className="text-white/80 text-lg">
              Documentación legal y tributaria del Rotary Club.
              Información transparente para nuestros socios y entidades de control.
            </p>
          </div>
        </div>
      </section>

      {/* Información Legal */}
      <section className="py-8 bg-amber-50 border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-amber-800 mb-1">Información para la DIAN</h2>
              <p className="text-amber-700 text-sm">
                Esta sección contiene la documentación tributaria y legal requerida por la
                Dirección de Impuestos y Aduanas Nacionales (DIAN). Los documentos marcados como
                privados requieren autenticación para su acceso.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Filtros y Búsqueda */}
      <section className="py-8 bg-gray-50 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Búsqueda */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar documentos..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none"
              />
            </div>

            {/* Filtro Tipo */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="pl-10 pr-8 py-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none appearance-none bg-white min-w-[200px]"
              >
                {tiposDocumento.map(tipo => (
                  <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                ))}
              </select>
            </div>

            {/* Filtro Año */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={filtroAnio}
                onChange={(e) => setFiltroAnio(e.target.value)}
                className="pl-10 pr-8 py-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none appearance-none bg-white min-w-[140px]"
              >
                <option value="todos">Todos los años</option>
                {aniosDisponibles.map(anio => (
                  <option key={anio} value={anio.toString()}>{anio}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Lista de Documentos */}
      <section className="py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Documentos ({documentosFiltrados.length})
            </h2>
            <span className="text-sm text-gray-500">
              Última actualización: Febrero 2025
            </span>
          </div>

          {documentosFiltrados.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron documentos</h3>
              <p className="text-gray-500">Intenta con otros filtros de búsqueda</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documentosFiltrados.map((doc) => {
                const Icono = iconosTipo[doc.tipo] || FileText;
                return (
                  <div key={doc.id} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-rotary-blue/10 rounded-lg flex items-center justify-center">
                        <Icono className="w-6 h-6 text-rotary-blue" />
                      </div>
                      {doc.acceso === 'privado' && (
                        <div className="flex items-center gap-1 text-amber-600 text-xs font-medium bg-amber-50 px-2 py-1 rounded-full">
                          <Lock className="w-3 h-3" />
                          Privado
                        </div>
                      )}
                      {doc.estado === 'aprobado' && (
                        <div className="flex items-center gap-1 text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          Aprobado
                        </div>
                      )}
                    </div>

                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{doc.nombre}</h3>

                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {doc.anio}
                      </span>
                      <span>{doc.tamano}</span>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <span className="text-xs text-gray-400">
                        Subido: {doc.fechaSubida}
                      </span>
                      <button
                        className="flex items-center gap-2 text-rotary-blue font-medium text-sm hover:underline"
                        onClick={() => alert(`Descargando: ${doc.nombre}`)}
                      >
                        <Download className="w-4 h-4" />
                        Descargar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>


      {/* Información de Contacto */}
      <section className="py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            ¿Necesitas información adicional?
          </h2>
          <p className="text-gray-600 mb-6">
            Si requieres documentos específicos o tienes dudas sobre nuestra información financiera,
            no dudes en contactarnos.
          </p>
          <a
            href="/contacto"
            className="inline-flex items-center justify-center gap-2 bg-rotary-blue text-white px-8 py-3 rounded-full font-semibold hover:bg-rotary-dark-blue transition-colors"
          >
            Contactar
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default EstadosFinancieros;
