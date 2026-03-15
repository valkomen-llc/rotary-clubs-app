import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import ProjectAIModal from '../../components/admin/ProjectAIModal';
import {
    Edit2, Trash2, Search, FolderKanban, X, Upload,
    MapPin, Target, Info, Users, DollarSign, Image as ImageIcon,
    Video, MessageSquare, CalendarDays, Rocket, CheckCircle, ChevronRight,
    LayoutGrid, Sparkles, RotateCcw, CheckSquare, Square, Trash
} from 'lucide-react';
import { toast } from 'sonner';
import { useClub } from '../../contexts/ClubContext';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Hardcoded data from the public page to merge
const staticProjects = [
    {
        id: 'static-1',
        title: 'Origen H2O - Agua para Comunidades Rurales',
        description: 'Instalación de sistemas de agua potable en 15 comunidades rurales de Cundinamarca y Boyacá que actualmente no tienen acceso a agua limpia.',
        image: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&h=500&fit=crop',
        status: 'active',
        category: 'Agua y Saneamiento',
        meta: 150000000,
        recaudado: 98500000,
        donantes: 342,
        beneficiarios: 8500,
        ubicacion: 'Cundinamarca & Boyacá',
        isStatic: true
    },
    {
        id: 'static-2',
        title: 'Becas Educativas para Jóvenes Líderes 2026',
        description: '<p>Programa de becas completas para 25 jóvenes destacados de comunidades vulnerables.</p>',
        image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&h=500&fit=crop',
        status: 'active',
        category: 'Educación',
        meta: 200000000,
        recaudado: 156000000,
        donantes: 518,
        beneficiarios: 25,
        ubicacion: 'Nacional',
        isStatic: true
    },
    {
        id: 'static-3',
        title: 'Reforestación de Cuencas Hídricas',
        description: 'Plantación de 50,000 árboles nativos en cuencas hídricas degradadas.',
        image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&h=500&fit=crop',
        status: 'active',
        category: 'Medio Ambiente',
        meta: 80000000,
        recaudado: 42300000,
        donantes: 267,
        beneficiarios: 12000,
        ubicacion: 'Santander',
        isStatic: true
    },
    {
        id: 'static-4',
        title: 'Viviendas Dignas para Familias Afectadas',
        description: 'Construcción de 30 viviendas sismorresistentes.',
        image: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800&h=500&fit=crop',
        status: 'active',
        category: 'Vivienda',
        meta: 450000000,
        recaudado: 289000000,
        donantes: 892,
        beneficiarios: 150,
        ubicacion: 'Cauca & Huila',
        isStatic: true
    },
    {
        id: 'static-5',
        title: 'Campaña #TodoPorNuestrosHéroes',
        description: 'Entrega de equipos de protección personal.',
        image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&h=500&fit=crop',
        status: 'completed',
        category: 'Salud',
        meta: 250000000,
        recaudado: 267000000,
        donantes: 1247,
        beneficiarios: 50000,
        ubicacion: 'Nacional',
        isStatic: true
    }
];

interface Project {
    id: string;
    title: string;
    description: string;
    image: string | null;
    status: string;
    category?: string;
    meta?: number;
    recaudado?: number;
    donantes?: number;
    beneficiarios?: number;
    ubicacion?: string;
    fechaEstimada?: string;
    videoUrl?: string;
    images?: string[];
    impacto?: string;
    actualizaciones?: string;
    createdAt: string;
    deletedAt?: string | null;
    isStatic?: boolean;
}

const ProjectsManagement: React.FC = () => {
    const { club } = useClub();
    const [projects, setProjects] = useState<Project[]>([]);
    const [trashedProjects, setTrashedProjects] = useState<Project[]>([]);
    const [showTrash, setShowTrash] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelecting, setIsSelecting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterSort, setFilterSort] = useState('recent');
    const [activeTab, setActiveTab] = useState<'info' | 'crowd' | 'impact' | 'gallery'>('info');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        image: '',
        status: 'planned',
        category: 'Servicio',
        meta: 0,
        recaudado: 0,
        donantes: 0,
        beneficiarios: 0,
        ubicacion: '',
        fechaEstimada: '',
        videoUrl: '',
        images: [] as string[],
        impacto: '',
        actualizaciones: '',
    });

    useEffect(() => {
        if (club?.id) {
            fetchProjects();
            fetchTrash();
        }
    }, [club?.id]);

    const fetchProjects = async () => {
        const mappedStatic: Project[] = staticProjects.map(p => ({
            ...p, id: p.id, createdAt: '2024-01-01', isStatic: true
        } as Project));
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const dbProjects = await response.json();
                setProjects([...dbProjects, ...mappedStatic]);
            } else setProjects(mappedStatic);
        } catch { setProjects(mappedStatic); }
    };

    const fetchTrash = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects/trash`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (r.ok) setTrashedProjects(await r.json());
        } catch {}
    };

    const handleOpenModal = (project?: Project) => {
        setActiveTab('info');
        if (project) {
            const initialData = {
                title: project.title || '',
                description: project.description || '',
                image: project.image || '',
                status: project.status || 'planned',
                category: project.category || 'Servicio',
                meta: project.meta || 0,
                recaudado: project.recaudado || 0,
                donantes: project.donantes || 0,
                beneficiarios: project.beneficiarios || 0,
                ubicacion: project.ubicacion || '',
                fechaEstimada: project.fechaEstimada ? new Date(project.fechaEstimada).toISOString().split('T')[0] : '',
                videoUrl: project.videoUrl || '',
                images: project.images || [],
                impacto: project.impacto || '',
                actualizaciones: project.actualizaciones || '',
            };

            if (project.isStatic) {
                setEditingProject(null);
                setFormData(initialData);
                toast.info('Clonando proyecto estático para edición.');
            } else {
                setEditingProject(project);
                setFormData(initialData);
            }
        } else {
            setEditingProject(null);
            setFormData({
                title: '',
                description: '',
                image: '',
                status: 'planned',
                category: 'Servicio',
                meta: 0,
                recaudado: 0,
                donantes: 0,
                beneficiarios: 0,
                ubicacion: club?.city || '',
                fechaEstimada: '',
                videoUrl: '',
                images: [],
                impacto: '',
                actualizaciones: '',
            });
        }
        setIsModalOpen(true);
    };

    // Aplica el JSON generado por ProyectIA al formulario
    const handleAIApply = (generated: any) => {
        setEditingProject(null);
        setActiveTab('info');
        setFormData({
            title:         generated.title        || '',
            description:   generated.description  || '',
            image:         '',
            status:        'planned',
            category:      generated.category     || 'Servicio',
            meta:          generated.meta         || 0,
            recaudado:     0,
            donantes:      0,
            beneficiarios: generated.beneficiarios || 0,
            ubicacion:     generated.ubicacion    || club?.city || '',
            fechaEstimada: generated.fechaEstimada || '',
            videoUrl:      '',
            images:        [],
            impacto:       generated.impacto       || '',
            actualizaciones: generated.actualizaciones || '',
        });
        setIsAIModalOpen(false);
        setIsModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isGallery = false) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        const token = localStorage.getItem('rotary_token');
        const apiUrl = import.meta.env.VITE_API_URL || '/api';

        try {
            for (let i = 0; i < files.length; i++) {
                const uploadData = new FormData();
                uploadData.append('file', files[i]);
                uploadData.append('folder', 'projects');

                const targetUrl = `${apiUrl}/media/upload?folder=projects&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://');
                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: uploadData
                });

                if (response.ok) {
                    const data = await response.json();
                    if (isGallery) {
                        setFormData(prev => ({ ...prev, images: [...prev.images, data.url] }));
                    } else {
                        setFormData(prev => ({ ...prev, image: data.url }));
                    }
                }
            }
            toast.success(isGallery ? 'Fotos añadidas a la galería' : 'Imagen principal actualizada');
        } catch (error) {
            toast.error('Error al subir imágenes');
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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                toast.success(editingProject ? 'Proyecto actualizado' : 'Proyecto creado');
                setIsModalOpen(false);
                fetchProjects();
            }
        } catch (error: any) {
            toast.error('Error al guardar proyecto');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Mover a papelera (soft delete)
    const handleDelete = async (project: Project) => {
        if (project.isStatic) { toast.error('Los proyectos estáticos no se pueden eliminar.'); return; }
        if (!window.confirm(`¿Mover "${project.title}" a la papelera?`)) return;
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects/${project.id}`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (r.ok) { toast.success('Proyecto movido a la papelera'); fetchProjects(); fetchTrash(); setIsModalOpen(false); }
            else toast.error('Error al eliminar');
        } catch { toast.error('Error al eliminar'); }
    };

    // Eliminación masiva
    const handleBulkDelete = async () => {
        const deletable = Array.from(selectedIds).filter(id => !projects.find(p => p.id === id)?.isStatic);
        if (deletable.length === 0) { toast.error('Solo puedes eliminar proyectos propios'); return; }
        if (!window.confirm(`¿Mover ${deletable.length} proyecto(s) a la papelera?`)) return;
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects/bulk-delete`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: deletable })
            });
            if (r.ok) {
                toast.success(`${deletable.length} proyecto(s) movidos a la papelera`);
                setSelectedIds(new Set()); setIsSelecting(false);
                fetchProjects(); fetchTrash();
            } else toast.error('Error al eliminar');
        } catch { toast.error('Error al eliminar'); }
    };

    // Restaurar desde papelera
    const handleRestore = async (id: string) => {
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects/${id}/restore`, {
                method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (r.ok) { toast.success('Proyecto restaurado'); fetchProjects(); fetchTrash(); }
            else toast.error('Error al restaurar');
        } catch { toast.error('Error al restaurar'); }
    };

    // Borrado permanente
    const handlePermanentDelete = async (id: string, title: string) => {
        if (!window.confirm(`¿Eliminar permanentemente "${title}"? Esta acción no se puede deshacer.`)) return;
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects/${id}/permanent`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
            });
            if (r.ok) { toast.success('Proyecto eliminado permanentemente'); fetchTrash(); }
            else toast.error('Error al eliminar permanentemente');
        } catch { toast.error('Error al eliminar'); }
    };

    // Toggle selección individual (solo proyectos no estáticos)
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // Seleccionar / deseleccionar todos los proyectos no estáticos visibles
    const toggleSelectAll = () => {
        const nonStaticIds = filteredProjects.filter(p => !p.isStatic).map(p => p.id);
        if (nonStaticIds.length === 0) {
            toast.info('Los proyectos de ejemplo no se pueden seleccionar');
            return;
        }
        if (nonStaticIds.every(id => selectedIds.has(id))) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(nonStaticIds));
        }
    };

    const formatCurrency = (val?: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val || 0);

    // Áreas de interés Rotary + categorías adicionales
    const AREAS_ROTARY = [
        { value: 'all',                  label: 'Todas las áreas',        icon: '🌐' },
        { value: 'Paz',                  label: 'Paz',                    icon: '☮️' },
        { value: 'Enfermedades',         label: 'Enfermedades',           icon: '🦠' },
        { value: 'Agua y Saneamiento',   label: 'Agua y Saneamiento',     icon: '💧' },
        { value: 'Salud Materna',        label: 'Salud Materna',          icon: '🤰' },
        { value: 'Educación',            label: 'Educación',              icon: '📚' },
        { value: 'Economía',             label: 'Economía Local',         icon: '💼' },
        { value: 'Medio Ambiente',       label: 'Medio Ambiente',         icon: '🌱' },
        { value: 'Salud',                label: 'Salud',                  icon: '❤️‍🩹' },
        { value: 'Vivienda',             label: 'Vivienda',               icon: '🏠' },
        { value: 'Servicio',             label: 'Servicio',               icon: '🤝' },
        { value: 'Tecnología',           label: 'Tecnología',             icon: '💻' },
    ];

    const allCategories = Array.from(new Set(projects.map(p => p.category).filter(Boolean) as string[]));
    const extraCategories = allCategories.filter(c => !AREAS_ROTARY.find(a => a.value === c));
    const allAreas = [
        ...AREAS_ROTARY,
        ...extraCategories.map(c => ({ value: c, label: c, icon: '📌' }))
    ];

    const filteredProjects = projects
        .filter(p => {
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q ||
                p.title.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                (p.category || '').toLowerCase().includes(q) ||
                (p.ubicacion || '').toLowerCase().includes(q);
            const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
            const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
            return matchesSearch && matchesStatus && matchesCategory;
        })
        .sort((a, b) => {
            if (filterSort === 'meta') return (b.meta || 0) - (a.meta || 0);
            if (filterSort === 'recaudado') return (b.recaudado || 0) - (a.recaudado || 0);
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // recent
        });

    const activeFiltersCount = [filterStatus !== 'all', filterCategory !== 'all', filterSort !== 'recent'].filter(Boolean).length;

    const quillModules = {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['link', 'clean']
        ],
    };

    return (
        <>
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Gestión de Proyectos</h1>
                    <p className="text-gray-500 text-sm">Administra proyectos, recaudación e historial de impacto.</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Modo selección */}
                    <button
                        onClick={() => { setIsSelecting(v => !v); setSelectedIds(new Set()); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                            isSelecting ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}>
                        {isSelecting ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                        {isSelecting ? 'Cancelar' : 'Seleccionar'}
                    </button>
                    {/* Papelera */}
                    <button
                        onClick={() => setShowTrash(v => !v)}
                        className={`relative flex items-center gap-2 px-4 py-2 rounded-lg border font-bold text-sm transition-all ${
                            showTrash ? 'bg-red-50 border-red-200 text-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}>
                        <Trash className="w-4 h-4" />
                        Papelera
                        {trashedProjects.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                                {trashedProjects.length}
                            </span>
                        )}
                    </button>
                    {/* Nuevo proyecto */}
                    <button
                        onClick={() => setIsAIModalOpen(true)}
                        className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-all font-bold shadow-lg shadow-rotary-blue/20"
                    >
                        <Sparkles className="w-4 h-4" /> Nuevo Proyecto
                    </button>
                </div>
            </div>

            {/* Barra de filtros */}
            <div className="mb-6 space-y-3">
                {/* Fila 1: búsqueda + ordenación */}
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, categoría, ubicación..."
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 transition-all text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <select
                        value={filterSort}
                        onChange={e => setFilterSort(e.target.value)}
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 outline-none focus:ring-2 focus:ring-rotary-blue/20 bg-white cursor-pointer"
                    >
                        <option value="recent">📅 Más recientes</option>
                        <option value="meta">🎯 Mayor meta</option>
                        <option value="recaudado">💰 Mayor recaudación</option>
                    </select>
                </div>

                {/* Fila 2: estado + área de interés */}
                <div className="flex gap-2 flex-wrap items-center">
                    {/* Estado */}
                    <div className="flex gap-1.5">
                        {[
                            { value: 'all',       label: 'Todos',       color: 'gray'  },
                            { value: 'active',    label: '✦ Activos',   color: 'blue'  },
                            { value: 'completed', label: '✔ Éxito',     color: 'green' },
                            { value: 'planned',   label: '◉ Planificados', color: 'orange' },
                        ].map(s => (
                            <button key={s.value}
                                onClick={() => setFilterStatus(s.value)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                                    filterStatus === s.value
                                        ? s.color === 'blue'   ? 'bg-blue-600 text-white border-blue-600'
                                        : s.color === 'green'  ? 'bg-emerald-600 text-white border-emerald-600'
                                        : s.color === 'orange' ? 'bg-orange-500 text-white border-orange-500'
                                        : 'bg-gray-800 text-white border-gray-800'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                }`}>
                                {s.label}
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-5 bg-gray-200" />

                    {/* Áreas de interés — scroll horizontal */}
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
                        {allAreas.map(area => (
                            <button key={area.value}
                                onClick={() => setFilterCategory(area.value)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                                    filterCategory === area.value
                                        ? 'bg-rotary-blue text-white border-rotary-blue'
                                        : 'bg-white text-gray-500 border-gray-200 hover:border-rotary-blue/50 hover:text-rotary-blue'
                                }`}>
                                <span>{area.icon}</span> {area.label}
                            </button>
                        ))}
                    </div>

                    {/* Contador de filtros activos + reset */}
                    {activeFiltersCount > 0 && (
                        <button
                            onClick={() => { setFilterStatus('all'); setFilterCategory('all'); setFilterSort('recent'); setSearchQuery(''); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 transition-all whitespace-nowrap">
                            <X className="w-3 h-3" /> Limpiar ({activeFiltersCount})
                        </button>
                    )}
                </div>

                {/* Contador de resultados */}
                <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400 font-medium">
                        {filteredProjects.length} proyecto{filteredProjects.length !== 1 ? 's' : ''}
                        {filterCategory !== 'all' && <> en <strong className="text-gray-600">{filterCategory}</strong></>}
                        {filterStatus !== 'all' && <> · estado <strong className="text-gray-600">{filterStatus}</strong></>}
                    </p>
                </div>
            </div>

            {/* ── Barra de selección masiva ── */}
            {isSelecting && (
                <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-rotary-blue/5 border border-rotary-blue/20 rounded-2xl">
                    <button onClick={toggleSelectAll}
                        className="flex items-center gap-2 text-xs font-bold text-rotary-blue hover:text-sky-800 transition-colors">
                        {filteredProjects.filter(p => !p.isStatic).every(p => selectedIds.has(p.id))
                            ? <><CheckSquare className="w-4 h-4" /> Deseleccionar todo</>
                            : <><Square className="w-4 h-4" /> Seleccionar todo</>}
                    </button>
                    <span className="text-xs text-gray-400 font-medium">
                        {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    {selectedIds.size > 0 && (
                        <button onClick={handleBulkDelete}
                            className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-all">
                            <Trash2 className="w-3.5 h-3.5" /> Mover a papelera ({selectedIds.size})
                        </button>
                    )}
                </div>
            )}

            {/* ── Vista de papelera ── */}
            {showTrash && (
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-red-50 rounded-xl"><Trash className="w-5 h-5 text-red-500" /></div>
                        <div>
                            <h2 className="font-black text-gray-800 text-base">Papelera de Proyectos</h2>
                            <p className="text-xs text-gray-400">{trashedProjects.length} proyecto{trashedProjects.length !== 1 ? 's' : ''} eliminado{trashedProjects.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    {trashedProjects.length === 0 ? (
                        <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <Trash className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                            <p className="text-sm text-gray-400 font-medium">La papelera está vacía</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {trashedProjects.map(p => (
                                <div key={p.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-5 py-3 shadow-sm">
                                    {p.image ? (
                                        <img src={p.image} alt="" className="w-12 h-12 object-cover rounded-xl flex-shrink-0" />
                                    ) : (
                                        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                            <FolderKanban className="w-5 h-5 text-gray-300" />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-700 text-sm truncate">{p.title}</p>
                                        <p className="text-[10px] text-gray-400">
                                            {p.category || 'Sin categoría'} · Eliminado {p.deletedAt ? new Date(p.deletedAt).toLocaleDateString('es-CO') : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button onClick={() => handleRestore(p.id)}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-all">
                                            <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                                        </button>
                                        <button onClick={() => handlePermanentDelete(p.id, p.title)}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all">
                                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <hr className="my-6 border-gray-100" />
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((project) => (
                    <div key={project.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden group hover:shadow-md transition-all relative ${
                        selectedIds.has(project.id) ? 'border-rotary-blue ring-2 ring-rotary-blue/20' : 'border-gray-100'
                    }`}>
                        {/* Checkbox de selección — aparece en TODOS los proyectos */}
                        {isSelecting && (
                            <button
                                onClick={() => !project.isStatic && toggleSelect(project.id)}
                                title={project.isStatic ? 'Los proyectos de ejemplo no se pueden eliminar' : ''}
                                className={`absolute top-3 left-3 z-20 w-6 h-6 rounded-lg flex items-center justify-center transition-all shadow ${
                                    project.isStatic ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                }`}
                            >
                                {selectedIds.has(project.id)
                                    ? <CheckSquare className="w-5 h-5 text-rotary-blue drop-shadow" />
                                    : <Square className="w-5 h-5 text-white drop-shadow" />}
                            </button>
                        )}
                        <div className="aspect-video relative overflow-hidden">
                            {project.image ? (
                                <img src={project.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" crossOrigin="anonymous" />
                            ) : (
                                <div className="w-full h-full bg-gray-50 flex items-center justify-center text-gray-300">
                                    <FolderKanban className="w-12 h-12" />
                                </div>
                            )}
                            <div className="absolute top-3 right-3 flex gap-2">
                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase backdrop-blur-md ${project.status === 'active' ? 'bg-blue-500/80 text-white' :
                                    project.status === 'completed' ? 'bg-green-500/80 text-white' :
                                        'bg-gray-500/80 text-white'
                                    }`}>
                                    {project.status === 'active' ? 'Activo' : project.status === 'completed' ? 'Éxito' : 'Plan'}
                                </span>
                                {project.isStatic && <span className="px-2 py-1 rounded-md bg-rotary-gold/90 text-white text-[10px] font-bold uppercase backdrop-blur-md">Estatíco</span>}
                            </div>
                        </div>
                        <div className="p-5">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-gray-800 line-clamp-1">{project.title}</h3>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {project.ubicacion || 'Global'}</span>
                                <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {project.category || 'Servicio'}</span>
                            </div>

                            {project.meta! > 0 && (
                                <div className="space-y-2 mb-4">
                                    <div className="flex justify-between text-[10px] font-bold">
                                        <span className="text-rotary-blue">{Math.round((project.recaudado! / project.meta!) * 100)}% Recaudado</span>
                                        <span className="text-gray-400">{formatCurrency(project.meta)} Meta</span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-rotary-blue" style={{ width: `${Math.min((project.recaudado! / project.meta!) * 100, 100)}%` }} />
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                                <div className="flex gap-1">
                                    <button onClick={() => handleOpenModal(project)} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-all">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    {!project.isStatic && (
                                        <button onClick={() => handleDelete(project)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase">
                                    <Users className="w-3 h-3" /> {project.donantes} Donantes
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in duration-200">
                        {/* Header */}
                        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">
                                    {editingProject ? 'Configurar Proyecto' : 'Crear Nueva Iniciativa'}
                                </h2>
                                <p className="text-xs text-gray-400 font-medium">Completa todos los detalles para publicar el proyecto.</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full text-gray-400 transition-colors shadow-sm">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Tabs Navigation */}
                        <div className="flex px-8 border-b border-gray-100 bg-white sticky top-0 z-10">
                            {[
                                { id: 'info', label: 'General', icon: Info },
                                { id: 'crowd', label: 'Crowdfunding', icon: DollarSign },
                                { id: 'impact', label: 'Impacto & Blog', icon: MessageSquare },
                                { id: 'gallery', label: 'Galería & Media', icon: ImageIcon }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === tab.id
                                        ? 'border-rotary-blue text-rotary-blue'
                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Form Content */}
                        <div className="flex-1 overflow-y-auto p-8 bg-white">
                            <form id="projectForm" onSubmit={handleSubmit} className="space-y-8">

                                {activeTab === 'info' && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in slide-in-from-right-4 duration-300">
                                        <div className="md:col-span-2 space-y-6">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Título del Proyecto</label>
                                                <input
                                                    type="text" required
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none transition-all font-bold text-lg"
                                                    value={formData.title}
                                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                    placeholder="Ej: Planta de Potabilización Vereda El Salto"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Descripción General (Editor Visual)</label>
                                                <div className="rounded-xl border border-gray-200 overflow-hidden">
                                                    <ReactQuill
                                                        theme="snow"
                                                        value={formData.description}
                                                        onChange={(val) => setFormData({ ...formData, description: val })}
                                                        modules={quillModules}
                                                        className="h-64 mb-12"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Categoría</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                                        value={formData.category}
                                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                                        placeholder="Ej: Agua y Saneamiento"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Ubicación</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                                        value={formData.ubicacion}
                                                        onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                                                        placeholder="Ciudad, Depto o Región"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Estado Actual</label>
                                                <select
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none font-bold bg-white"
                                                    value={formData.status}
                                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                                >
                                                    <option value="planned">Planeado (En Diseño)</option>
                                                    <option value="active">Activo (En Ejecución)</option>
                                                    <option value="completed">Completado (Éxito)</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Imagen Principal</label>
                                                <div className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center bg-gray-50 overflow-hidden relative group">
                                                    {formData.image ? (
                                                        <>
                                                            <img src={formData.image} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <button type="button" onClick={() => setFormData({ ...formData, image: '' })} className="bg-red-500 text-white p-2 rounded-full"><X className="w-4 h-4" /></button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="text-center p-4">
                                                            <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Click para subir foto</p>
                                                        </div>
                                                    )}
                                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleImageUpload(e)} disabled={uploading} />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Fecha Estimada / Entrega</label>
                                                <div className="relative">
                                                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="date"
                                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none font-medium"
                                                        value={formData.fechaEstimada}
                                                        onChange={(e) => setFormData({ ...formData, fechaEstimada: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'crowd' && (
                                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                                        <div className="flex items-center gap-4 p-6 bg-blue-50/50 rounded-2xl border border-blue-100 text-blue-800">
                                            <div className="p-3 bg-white rounded-xl shadow-sm"><DollarSign className="w-6 h-6 text-rotary-blue" /></div>
                                            <div>
                                                <h4 className="font-bold">Crowdfunding Social</h4>
                                                <p className="text-xs font-medium opacity-80">Define las metas financieras y el progreso del recaudo para transparencia de los donantes.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                            <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-2">
                                                <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Meta Financiera ($)</label>
                                                <input
                                                    type="number"
                                                    className="w-full text-xl font-bold border-none p-0 outline-none focus:ring-0 text-gray-800"
                                                    value={formData.meta}
                                                    onChange={(e) => setFormData({ ...formData, meta: parseFloat(e.target.value) || 0 })}
                                                    placeholder="0.00"
                                                />
                                                <p className="text-[10px] text-gray-500 font-medium">Costo total de ejecución</p>
                                            </div>

                                            <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-2">
                                                <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Recaudado Actual ($)</label>
                                                <input
                                                    type="number"
                                                    className="w-full text-xl font-bold border-none p-0 outline-none focus:ring-0 text-rotary-blue"
                                                    value={formData.recaudado}
                                                    onChange={(e) => setFormData({ ...formData, recaudado: parseFloat(e.target.value) || 0 })}
                                                    placeholder="0.00"
                                                />
                                                <p className="text-[10px] text-gray-500 font-medium">Dinero ya recibido</p>
                                            </div>

                                            <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-2">
                                                <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Total Donantes</label>
                                                <input
                                                    type="number"
                                                    className="w-full text-xl font-bold border-none p-0 outline-none focus:ring-0 text-gray-800"
                                                    value={formData.donantes}
                                                    onChange={(e) => setFormData({ ...formData, donantes: parseInt(e.target.value) || 0 })}
                                                    placeholder="0"
                                                />
                                                <p className="text-[10px] text-gray-500 font-medium">Número de personas</p>
                                            </div>

                                            <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-2">
                                                <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Beneficiarios</label>
                                                <input
                                                    type="number"
                                                    className="w-full text-xl font-bold border-none p-0 outline-none focus:ring-0 text-green-600"
                                                    value={formData.beneficiarios}
                                                    onChange={(e) => setFormData({ ...formData, beneficiarios: parseInt(e.target.value) || 0 })}
                                                    placeholder="0"
                                                />
                                                <p className="text-[10px] text-gray-500 font-medium">Impacto directo</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="block text-sm font-bold text-gray-700">Progreso Visual Proyectado</label>
                                            <div className="h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                                                <div className="h-full bg-gradient-to-r from-rotary-blue to-rotary-gold" style={{ width: `${Math.min((formData.recaudado / formData.meta) * 100, 100) || 0}%` }} />
                                            </div>
                                            <p className="text-center text-xs font-bold text-gray-400">
                                                {formatCurrency(formData.recaudado)} de {formatCurrency(formData.meta)} ({Math.round((formData.recaudado / formData.meta) * 100) || 0}%)
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'impact' && (
                                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-4">
                                                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                                                    <Rocket className="w-4 h-4 text-rotary-gold" /> Impacto Esperado
                                                </label>
                                                <div className="rounded-xl border border-gray-200 overflow-hidden">
                                                    <ReactQuill
                                                        theme="snow"
                                                        value={formData.impacto}
                                                        onChange={(val) => setFormData({ ...formData, impacto: val })}
                                                        modules={quillModules}
                                                        className="h-64 mb-12"
                                                        placeholder="Explica qué se logrará con este proyecto..."
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                                                    <CheckCircle className="w-4 h-4 text-green-500" /> Últimas Actualizaciones
                                                </label>
                                                <div className="rounded-xl border border-gray-200 overflow-hidden">
                                                    <ReactQuill
                                                        theme="snow"
                                                        value={formData.actualizaciones}
                                                        onChange={(val) => setFormData({ ...formData, actualizaciones: val })}
                                                        modules={quillModules}
                                                        className="h-64 mb-12"
                                                        placeholder="Bitácora de avances, fotos o hitos alcanzados..."
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'gallery' && (
                                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 border-dashed flex flex-col items-center justify-center text-center">
                                                <Video className="w-10 h-10 text-gray-300 mb-2" />
                                                <label className="block text-sm font-bold text-gray-700 mb-3">Enlace de Video (YouTube/Vimeo)</label>
                                                <input
                                                    type="url"
                                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm font-medium"
                                                    value={formData.videoUrl}
                                                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                                                    placeholder="https://youtube.com/watch?v=..."
                                                />
                                            </div>

                                            <div className="group relative p-6 bg-gray-900 border border-gray-800 rounded-2xl flex flex-col items-center justify-center text-center overflow-hidden">
                                                <div className="relative z-10">
                                                    <Upload className="w-10 h-10 text-rotary-gold mb-2 mx-auto" />
                                                    <label className="block text-sm font-bold text-white mb-1">Galería de Imágenes</label>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-4">Click para seleccionar múltiples</p>
                                                    <div className="flex justify-center gap-2">
                                                        <span className="px-3 py-1 bg-white/10 rounded-full text-white text-[10px] font-bold">PNG / JPG</span>
                                                        <span className="px-3 py-1 bg-white/10 rounded-full text-white text-[10px] font-bold">MAX 5MB</span>
                                                    </div>
                                                </div>
                                                <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleImageUpload(e, true)} disabled={uploading} />
                                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                                <ImageIcon className="w-4 h-4 text-rotary-blue" /> Imágenes en Galería ({formData.images.length})
                                            </h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                {formData.images.map((url, idx) => (
                                                    <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-gray-100 relative group shadow-sm bg-gray-50">
                                                        <img src={url} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))}
                                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {formData.images.length === 0 && (
                                                    <div className="aspect-square rounded-xl border-2 border-dashed border-gray-100 flex items-center justify-center text-gray-200">
                                                        <LayoutGrid className="w-8 h-8" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-8 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-500 font-bold hover:text-gray-700 transition-colors">Cancelar</button>
                                {editingProject && !editingProject.isStatic && (
                                    <button type="button"
                                        onClick={() => handleDelete(editingProject)}
                                        className="flex items-center gap-2 px-4 py-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl font-bold text-sm transition-all border border-red-100">
                                        <Trash2 className="w-4 h-4" /> Mover a papelera
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="hidden md:flex flex-col items-end">
                                    <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Paso Actual</span>
                                    <span className="text-xs font-bold text-rotary-blue">
                                        {activeTab === 'info' ? '1. Información General' :
                                            activeTab === 'crowd' ? '2. Metas de Recaudo' :
                                                activeTab === 'impact' ? '3. Detalles de Impacto' : '4. Multimedia'}
                                    </span>
                                </div>
                                <button
                                    form="projectForm"
                                    type="submit"
                                    disabled={isSubmitting || uploading}
                                    className="bg-rotary-blue text-white px-10 py-3 rounded-2xl font-bold hover:bg-sky-800 transition-all shadow-xl shadow-rotary-blue/20 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSubmitting ? 'Guardando...' : (editingProject ? 'Guardar Cambios' : 'Crear Proyecto')}
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>

        {/* Modal IA */}
        {isAIModalOpen && (
            <ProjectAIModal
                onClose={() => setIsAIModalOpen(false)}
                onApply={handleAIApply}
            />
        )}
        </>
    );
};

export default ProjectsManagement;
