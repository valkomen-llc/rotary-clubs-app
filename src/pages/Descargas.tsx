import { useState } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Search,
  Filter,
  FileSpreadsheet,
  FileCheck,
  Monitor,
  FileCode,
  ArrowRight,
  Eye
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { toast } from 'sonner';
import { useEffect } from 'react';

interface DocumentoDescarga {
  id: string;
  nombre: string;
  tipo: 'pdf' | 'word' | 'excel' | 'presentation' | 'otros';
  categoria: string;
  fechaSubida: string;
  tamano: string;
  url?: string;
}

const tiposDescarga = [
  { value: 'todos', label: 'Todos los formatos' },
  { value: 'pdf', label: 'PDF' },
  { value: 'word', label: 'Word' },
  { value: 'excel', label: 'Excel' },
  { value: 'presentation', label: 'Presentación' },
  { value: 'otros', label: 'Otros' }
];

const iconosTipo: Record<string, React.ElementType> = {
  pdf: FileText,
  word: FileCheck,
  excel: FileSpreadsheet,
  presentation: Monitor,
  otros: FileCode
};

const API = import.meta.env.VITE_API_URL || '/api';

const Descargas = () => {
  const { club, isLoading: clubLoading } = useClub();
  const { sections, isLoading: cmsLoading } = useCMSContent('descargas', club?.id);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [documentos, setDocumentos] = useState<DocumentoDescarga[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    if (club?.id) {
      setLoadingDocs(true);
      fetch(`${API}/public/documents/${club.id}?t=${Date.now()}`)
        .then(r => r.json())
        .then(data => {
            console.log('[Descargas] Data fetched:', data);
            if (Array.isArray(data)) {
                const mapped = data.map((d: any) => ({
                    id: d.id,
                    nombre: d.fileName,
                    tipo: d.category || 'pdf',
                    categoria: (d.category === 'pdf' ? 'Branding' : d.category === 'word' ? 'Recurso' : d.category === 'excel' ? 'Plantilla' : d.category === 'presentation' ? 'Presentación' : 'Recurso'),
                    fechaSubida: new Date(d.createdAt).toLocaleDateString(),
                    tamano: (d.fileSize / 1024 / 1024).toFixed(2) + ' MB',
                    url: d.fileUrl
                }));
                setDocumentos(mapped);
            }
        })
        .catch(err => console.error('Error fetching docs:', err))
        .finally(() => setLoadingDocs(false));
    }
  }, [club?.id]);

  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  if (clubLoading || !club) {
    return (
        <div className="min-h-screen bg-white flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rotary-blue"></div>
        </div>
    );
  }

  const documentosFiltrados = documentos.filter(doc => {
    const matchTipo = filtroTipo === 'todos' || doc.tipo === filtroTipo;
    const matchBusqueda = doc.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchTipo && matchBusqueda;
  });

  const handleDownload = (doc: DocumentoDescarga) => {
    if (doc.url) {
        window.open(doc.url, '_blank');
    } else {
        toast.error('URL de descarga no disponible');
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundColor: '#0c3c7c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-block bg-rotary-gold text-white text-sm font-semibold px-4 py-1 rounded-full mb-4">
              Recursos
            </span>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
              {getC('header', 'title', "Centro de Descargas")}
            </h1>
            <p className="text-white/80 text-lg">
              {getC('header', 'description', "Encuentra y descarga presentaciones, manuales, formatos y plantillas oficiales.")}
            </p>
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
                placeholder="Buscar archivos..."
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
                {tiposDescarga.map(tipo => (
                  <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Lista de Documentos */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Archivos ({documentosFiltrados.length})
            </h2>
          </div>

          {loadingDocs ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1,2,3].map(i => (
                    <div key={i} className="bg-gray-100 h-64 rounded-xl"></div>
                ))}
            </div>
          ) : documentosFiltrados.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron archivos</h3>
              <p className="text-gray-500">Aún no hay recursos publicados en esta sección</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documentosFiltrados.map((doc) => {
                const Icono = iconosTipo[doc.tipo] || FileText;
                return (
                  <div key={doc.id} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-rotary-blue/10 rounded-lg flex items-center justify-center shrink-0">
                        <Icono className="w-6 h-6 text-rotary-blue" />
                      </div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{doc.categoria}</span>
                    </div>

                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 min-h-[3rem]">{doc.nombre}</h3>

                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
                      <span className="flex items-center gap-1 uppercase">
                        {doc.tipo}
                      </span>
                      <span>{doc.tamano}</span>
                    </div>

                    <div className="flex items-center gap-4 pt-4 border-t border-gray-100 mt-auto">
                      <span className="text-xs text-gray-400 mr-auto whitespace-nowrap">
                        Actualizado: {doc.fechaSubida}
                      </span>

                      <button
                        className="flex items-center gap-1.5 text-gray-500 font-medium text-sm hover:text-rotary-blue transition-colors"
                        onClick={() => window.open(doc.url, '_blank')}
                      >
                        <Eye className="w-4 h-4" />
                        Ver
                      </button>

                      <button
                        className="flex items-center gap-1.5 text-rotary-blue font-bold text-sm hover:underline"
                        onClick={() => handleDownload(doc)}
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

      <Footer />
    </div>
  );
};

export default Descargas;
