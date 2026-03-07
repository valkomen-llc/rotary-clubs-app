import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Plus, Edit2, Trash2, Search, Filter, FolderKanban, X, Upload, MapPin, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useClub } from '../../contexts/ClubContext';

// Hardcoded data from the public page to merge
const staticProjects = [
    {
        id: 'static-1',
        title: 'Origen H2O - Agua para Comunidades Rurales',
        description: 'Instalación de sistemas de agua potable en 15 comunidades rurales de Cundinamarca y Boyacá que actualmente no tienen acceso a agua limpia.',
        image: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&h=500&fit=crop',
        status: 'active',
        isStatic: true
    },
    {
        id: 'static-2',
        title: 'Becas Educativas para Jóvenes Líderes 2026',
        description: 'Programa de becas completas para 25 jóvenes destacados de comunidades vulnerables para acceder a educación universitaria.',
        image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&h=500&fit=crop',
        status: 'active',
        isStatic: true
    },
    {
        id: 'static-5',
        title: 'Campaña #TodoPorNuestrosHéroes',
        description: 'Entrega de 50,000 equipos de protección personal a trabajadores de la salud durante la pandemia.',
        image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&h=500&fit=crop',
        status: 'completed',
        isStatic: true
    }
];

interface Project {
    id: string;
    title: string;
    description: string;
    image: string | null;
    status: string;
    createdAt: string;
    isStatic?: boolean;
}

const ProjectsManagement: React.FC = () => {
    const { club } = useClub();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        image: '',
        status: 'planned',
    });

    useEffect(() => {
        if (club?.id) {
            fetchProjects();
        }
    }, [club?.id]);

    const fetchProjects = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const dbProjects = await response.json();

                // Concatenate static projects
                const mappedStatic: Project[] = staticProjects.map(p => ({
                    id: p.id,
                    title: p.title,
                    description: p.description,
                    image: p.image,
                    status: p.status,
                    createdAt: 'Enero 2024',
                    isStatic: true
                }));

                setProjects([...dbProjects, ...mappedStatic]);
            }
        } catch (error) {
            toast.error('Error al cargar proyectos');
        }
    };

    const handleOpenModal = (project?: Project) => {
        if (project) {
            if (project.isStatic) {
                setEditingProject(null);
                setFormData({
                    title: project.title,
                    description: project.description,
                    image: project.image || '',
                    status: project.status,
                });
                toast.info('Este es un proyecto estático. Al guardar, se creará una copia editable.');
            } else {
                setEditingProject(project);
                setFormData({
                    title: project.title,
                    description: project.description,
                    image: project.image || '',
                    status: project.status,
                });
            }
        } else {
            setEditingProject(null);
            setFormData({
                title: '',
                description: '',
                image: '',
                status: 'planned',
            });
        }
        setIsModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const uploadData = new FormData();
        uploadData.append('file', file);
        uploadData.append('folder', 'projects');

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const targetUrl = `${apiUrl}/media/upload?folder=projects&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://');

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: uploadData
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, image: data.url }));
                toast.success('Imagen subida con éxito');
            }
        } catch (error) {
            toast.error('Error al subir imagen');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const url = editingProject
                ? `${apiUrl}/admin/projects/${editingProject.id}`
                : `${apiUrl}/admin/projects`;

            const response = await fetch(url, {
                method: editingProject ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                toast.success(editingProject ? 'Proyecto actualizado' : 'Proyecto creado con éxito');
                setIsModalOpen(false);
                fetchProjects();
            } else {
                const data = await response.json();
                throw new Error(data.error || 'Error al procesar la solicitud');
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (project: Project) => {
        if (project.isStatic) return;

        if (!window.confirm(`¿Estás seguro de eliminar "${project.title}"?`)) return;

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects/${project.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success('Proyecto eliminado');
                fetchProjects();
            }
        } catch (error: any) {
            toast.error('No se pudo eliminar el proyecto');
        }
    };

    const filteredProjects = projects.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Gestión de Proyectos</h1>
                    <p className="text-gray-500 text-sm">Administra las iniciativas de servicio de tu club.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-colors"
                >
                    <Plus className="w-4 h-4" /> Nuevo Proyecto
                </button>
            </div>

            <div className="mb-6 flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar proyectos..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                    <Filter className="w-4 h-4" /> Filtros
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Proyecto</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Impacto</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredProjects.map((project) => (
                            <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                                            {project.image ? (
                                                <img src={project.image} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <FolderKanban className="w-6 h-6" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 line-clamp-1">{project.title}</p>
                                            <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                                <MapPin className="w-3 h-3" /> {club.city}
                                                {project.isStatic && <span className="text-rotary-gold font-bold ml-2">STATIC</span>}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${project.status === 'active' ? 'bg-blue-100 text-blue-700' :
                                        project.status === 'completed' ? 'bg-green-100 text-green-700' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>
                                        {project.status === 'active' ? 'Activo' :
                                            project.status === 'completed' ? 'Completado' : 'Planeado'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1 text-xs text-gray-500">
                                            <Target className="w-3 h-3" /> Meta
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-green-600 font-bold">
                                            <TrendingUp className="w-3 h-3" /> Logrado
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => handleOpenModal(project)}
                                            className="p-2 text-gray-400 hover:text-rotary-blue transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        {!project.isStatic && (
                                            <button
                                                onClick={() => handleDelete(project)}
                                                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-gray-800">
                                {editingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del Proyecto</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue transition-all"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="Ej: Planta de Tratamiento Vereda El Salto"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                                    <textarea
                                        required
                                        rows={6}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue transition-all resize-none"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Describe los objetivos y alcance del proyecto..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Estado</label>
                                    <select
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue transition-all"
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="planned">Planeado / En Diseño</option>
                                        <option value="active">Activo / Ejecución</option>
                                        <option value="completed">Completado / Impacto</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <label className="block text-sm font-bold text-gray-700">Imagen Destacada</label>
                                <div className="aspect-video rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 overflow-hidden relative">
                                    {formData.image ? (
                                        <img src={formData.image} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                    ) : (
                                        <FolderKanban className="w-12 h-12 text-gray-200" />
                                    )}
                                </div>
                                <label className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-bold cursor-pointer transition-all border border-gray-200">
                                    <Upload className="w-5 h-5" />
                                    {uploading ? 'Subiendo...' : 'Seleccionar Imagen del Proyecto'}
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                                </label>

                                <div className="pt-12 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-6 py-2 text-gray-500 font-bold"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || uploading}
                                        className="bg-rotary-blue text-white px-8 py-2 rounded-full font-bold hover:bg-sky-800 transition-all shadow-lg select-none disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Guardando...' : (editingProject ? 'Guardar Cambios' : 'Crear Proyecto')}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default ProjectsManagement;
