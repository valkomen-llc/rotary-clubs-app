import React, { useEffect, useState, useMemo } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import ProjectAIModal from '../../components/admin/ProjectAIModal';
import {
    Edit2, Trash2, Search, FolderKanban, X, Upload,
    MapPin, Target, Info, Users, DollarSign, Image as ImageIcon,
    Video, MessageSquare, CalendarDays, Rocket, CheckCircle, ChevronRight,
    LayoutGrid, Sparkles, RotateCcw, CheckSquare, Square, Trash, Quote
} from 'lucide-react';
import { toast } from 'sonner';
import { useClub } from '../../contexts/ClubContext';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Proyectos de demo — se muestran SOLO cuando no hay proyectos reales en la BD
// Son los mismos que aparecen en la página pública como fallback
const DEMO_PROJECTS = [
    {
        id: 'demo-1', title: 'Origen H2O - Agua para Comunidades Rurales',
        description: 'Instalación de sistemas de agua potable en 15 comunidades rurales de Cundinamarca y Boyacá.',
        image: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&h=500&fit=crop',
        status: 'active', category: 'Agua y Saneamiento', meta: 150000000,
        recaudado: 98500000, donantes: 342, beneficiarios: 8500,
        ubicacion: 'Cundinamarca & Boyacá', createdAt: '2024-01-01', isStatic: true,
    },
    {
        id: 'demo-2', title: 'Becas Educativas para Jóvenes Líderes 2026',
        description: 'Programa de becas completas para 25 jóvenes destacados de comunidades vulnerables.',
        image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&h=500&fit=crop',
        status: 'active', category: 'Educación', meta: 200000000,
        recaudado: 156000000, donantes: 518, beneficiarios: 25,
        ubicacion: 'Nacional', createdAt: '2024-01-01', isStatic: true,
    },
    {
        id: 'demo-3', title: 'Reforestación de Cuencas Hídricas',
        description: 'Plantación de 50,000 árboles nativos en cuencas hídricas degradadas.',
        image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&h=500&fit=crop',
        status: 'active', category: 'Medio Ambiente', meta: 80000000,
        recaudado: 42300000, donantes: 267, beneficiarios: 12000,
        ubicacion: 'Santander', createdAt: '2024-01-01', isStatic: true,
    },
    {
        id: 'demo-4', title: 'Viviendas Dignas para Familias Afectadas',
        description: 'Construcción de 30 viviendas sismorresistentes para familias damnificadas.',
        image: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800&h=500&fit=crop',
        status: 'active', category: 'Vivienda', meta: 450000000,
        recaudado: 289000000, donantes: 892, beneficiarios: 150,
        ubicacion: 'Cauca & Huila', createdAt: '2024-01-01', isStatic: true,
    },
    {
        id: 'demo-5', title: 'Campaña #TodoPorNuestrosHéroes',
        description: 'Entrega de 50,000 equipos de protección a trabajadores de la salud.',
        image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&h=500&fit=crop',
        status: 'completed', category: 'Salud', meta: 250000000,
        recaudado: 267000000, donantes: 1247, beneficiarios: 50000,
        ubicacion: 'Nacional', createdAt: '2024-01-01', isStatic: true,
    },
] as const;


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
    clubId?: string;
    club?: { id: string; name: string; subdomain: string | null };
}

const ProjectsManagement: React.FC = () => {
    const { club, isAppPortal } = useClub();

    // En el portal central (app.clubplatform.org) el super admin no filtra por club
    // En dominios de club específicos sía filtra por el club activo
    const clubIdForFetch = isAppPortal ? null : (club?.id && club.id !== 'loading' ? club.id : null);

    // Detectar si el usuario es super admin desde el JWT
    const isSuperAdmin = useMemo(() => {
        try {
            const token = localStorage.getItem('rotary_token');
            if (!token) return false;
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload?.role === 'administrator';
        } catch { return false; }
    }, []);

    const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
    const [filterClub, setFilterClub] = useState('all');

    const [projects, setProjects] = useState<Project[]>([]);
    const [trashedProjects, setTrashedProjects] = useState<Project[]>([]);
    const [showTrash, setShowTrash] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSelecting, setIsSelecting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [showNewProjectStep1, setShowNewProjectStep1] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterSort, setFilterSort] = useState('recent');
    const [activeTab, setActiveTab] = useState<'info' | 'crowd' | 'impact' | 'gallery'>('info');

    // ── Agentes para el Paso 1 de nuevo proyecto ──
    interface ProjectAgent { id: string; name: string; role: string; category: string; description: string; avatarSeed: string; avatarColor: string; greeting: string; capabilities: string[]; active: boolean; }
    const PROJECT_AGENT_CAPS = ['manage_projects', 'edit_testimonials', 'create_news', 'edit_content', 'create_media', 'upload_media', 'generate_captions', 'create_posts', 'calendar', 'edit_pages', 'site_config'];
    const [step1Agents, setStep1Agents] = useState<ProjectAgent[]>([]);
    const avatar = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;

    // ── Estado de Testimonios ──
    interface Testimonial { id: string; name: string; role: string; text: string; image?: string; isStatic?: boolean; }
    const DEMO_TESTIMONIALS: Testimonial[] = [
        { id: 'tdemo-1', name: 'María Elena Ríos', role: 'Beneficiaria, Vereda El Carmen', text: 'Gracias al proyecto Origen H2O, mi familia y yo tenemos agua limpia en nuestra casa. Antes caminábamos dos horas diarias para traer agua.', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop', isStatic: true },
        { id: 'tdemo-2', name: 'Carlos Andrés Martínez', role: 'Becario 2023, Ingeniería', text: 'La beca del Rotary cambió mi vida. Hoy estoy en cuarto semestre de ingeniería y sueño con devolver a mi comunidad todo lo que he recibido.', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop', isStatic: true },
        { id: 'tdemo-3', name: 'Dra. Carmen Vargas', role: 'Hospital Universitario', text: 'Durante la pandemia, los equipos donados por Rotary nos salvaron la vida. No teníamos cómo protegernos hasta que llegaron.', image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200&h=200&fit=crop', isStatic: true },
    ];
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [showTestimonialsPanel, setShowTestimonialsPanel] = useState(false);
    const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
    const [testimonialForm, setTestimonialForm] = useState({ name: '', role: '', text: '', image: '' });
    const [savingTestimonial, setSavingTestimonial] = useState(false);

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
        // Carga proyectos siempre (super admin sin club = todos; con club = del club)
        fetchProjects();
        fetchTrash();
        fetchTestimonials();
        fetchStep1Agents();
    }, [clubIdForFetch, isSuperAdmin]);

    const fetchStep1Agents = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/agents`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (r.ok) {
                const data = await r.json();
                const all: ProjectAgent[] = data.agents || [];
                // Filtra solo agentes activos que tengan al menos una capability de proyectos
                const filtered = all.filter(a => a.active && a.capabilities?.some(c => PROJECT_AGENT_CAPS.includes(c)));
                setStep1Agents(filtered);
            }
        } catch {}
    };

    // Cargar clubes para el selector (solo super admin)
    useEffect(() => {
        if (!isSuperAdmin) return;
        const token = localStorage.getItem('rotary_token');
        fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(r => r.ok ? r.json() : [])
            .then(data => setClubs(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, [isSuperAdmin]);
    const fetchProjects = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            // Si hay un clubId válido lo enviamos; si no, el backend retorna todos (para super admin)
            const params = clubIdForFetch ? `?clubId=${clubIdForFetch}` : '';
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const dbProjects = await response.json();
                // Si no hay proyectos reales, mostrar los de DEMO como referencia visual
                if (dbProjects.length === 0) {
                    setProjects(DEMO_PROJECTS as unknown as Project[]);
                } else {
                    setProjects(dbProjects);
                }
            } else {
                setProjects(DEMO_PROJECTS as unknown as Project[]);
            }
        } catch {
            setProjects(DEMO_PROJECTS as unknown as Project[]);
        }
    };

    const fetchTrash = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const params = clubIdForFetch ? `?clubId=${clubIdForFetch}` : '';
            const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects/trash${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (r.ok) setTrashedProjects(await r.json());
        } catch {}
    };

    const fetchTestimonials = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const params = clubIdForFetch ? `?clubId=${clubIdForFetch}` : '';
            const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/testimonials${params}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (r.ok) {
                const data = await r.json();
                setTestimonials(data.length > 0 ? data : DEMO_TESTIMONIALS);
            } else setTestimonials(DEMO_TESTIMONIALS);
        } catch { setTestimonials(DEMO_TESTIMONIALS); }
    };

    const saveTestimonial = async () => {
        if (!testimonialForm.name.trim() || !testimonialForm.text.trim()) {
            toast.error('Nombre y testimonio son obligatorios'); return;
        }
        setSavingTestimonial(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const url = editingTestimonial && !editingTestimonial.isStatic
                ? `${import.meta.env.VITE_API_URL || '/api'}/admin/testimonials/${editingTestimonial.id}`
                : `${import.meta.env.VITE_API_URL || '/api'}/admin/testimonials`;
            const method = editingTestimonial && !editingTestimonial.isStatic ? 'PUT' : 'POST';
            const body: any = { ...testimonialForm };
            if (clubIdForFetch) body.clubId = clubIdForFetch;
            else if (club?.id && club.id !== 'loading') body.clubId = club.id;
            const r = await fetch(url, { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (r.ok) {
                toast.success(editingTestimonial ? 'Testimonio actualizado' : 'Testimonio creado');
                setEditingTestimonial(null);
                setTestimonialForm({ name: '', role: '', text: '', image: '' });
                fetchTestimonials();
            } else toast.error('Error al guardar el testimonio');
        } catch { toast.error('Error al guardar el testimonio'); }
        finally { setSavingTestimonial(false); }
    };

    const deleteTestimonialHandler = async (t: Testimonial) => {
        if (t.isStatic) { toast.error('Los testimonios de ejemplo no se pueden eliminar'); return; }
        if (!confirm(`¿Eliminar testimonio de "${t.name}"?`)) return;
        const token = localStorage.getItem('rotary_token');
        await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/testimonials/${t.id}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
        });
        toast.success('Testimonio eliminado');
        fetchTestimonials();
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

    // Eliminación masiva — proyectos reales via API, estáticos se ocultan del estado local
    const handleBulkDelete = async () => {
        const total = selectedIds.size;
        if (total === 0) return;
        if (!window.confirm(`¿Mover ${total} proyecto(s) a la papelera?`)) return;

        const realIds = Array.from(selectedIds).filter(id => !projects.find(p => p.id === id)?.isStatic);
        const staticIds = Array.from(selectedIds).filter(id => projects.find(p => p.id === id)?.isStatic);

        let success = true;

        // Borrar proyectos reales via API
        if (realIds.length > 0) {
            try {
                const token = localStorage.getItem('rotary_token');
                const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/projects/bulk-delete`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: realIds })
                });
                if (!r.ok) { success = false; toast.error('Error al eliminar proyectos reales'); }
                else { fetchProjects(); fetchTrash(); }
            } catch { success = false; toast.error('Error al eliminar'); }
        }

        // Ocultar proyectos estáticos del estado local (solo en esta sesión)
        if (staticIds.length > 0) {
            setProjects(prev => prev.filter(p => !staticIds.includes(p.id)));
        }

        if (success) {
            const msg = staticIds.length > 0
                ? `${total} proyecto(s) eliminados (${staticIds.length} de ejemplo se ocultaron temporalmente)`
                : `${total} proyecto(s) movidos a la papelera`;
            toast.success(msg);
        }
        setSelectedIds(new Set());
        setIsSelecting(false);
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

    // Toggle selección individual — funciona para todos los proyectos
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // Seleccionar / deseleccionar todos los proyectos visibles
    const toggleSelectAll = () => {
        const allIds = filteredProjects.map(p => p.id);
        if (allIds.every(id => selectedIds.has(id))) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(allIds));
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
            const matchesClub = filterClub === 'all' || p.club?.id === filterClub || p.clubId === filterClub;
            return matchesSearch && matchesStatus && matchesCategory && matchesClub;
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
                    {/* Botón Testimonios */}
                    <button
                        onClick={() => setShowTestimonialsPanel(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-sm transition-all"
                    >
                        <Quote className="w-4 h-4" /> Testimonios
                    </button>
                    {/* Nuevo proyecto */}
                    <button
                        onClick={() => setShowNewProjectStep1(true)}
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

                    {/* Filtro por club — solo visible para super admins con múltiples clubes */}
                    {isSuperAdmin && clubs.length > 0 && (
                        <select
                            value={filterClub}
                            onChange={e => setFilterClub(e.target.value)}
                            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 outline-none focus:ring-2 focus:ring-rotary-blue/20 bg-white cursor-pointer"
                        >
                            <option value="all">🏢 Todos los clubes</option>
                            {clubs.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    )}
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

            {/* Banner demo: visible solo cuando todos los proyectos son de ejemplo */}
            {projects.length > 0 && projects.every(p => p.isStatic) && !showTrash && (
                <div className="mb-4 flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                    <span className="text-amber-500 text-lg">💡</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-amber-700 mb-0.5">Proyectos de ejemplo</p>
                        <p className="text-xs text-amber-600">
                            Estos proyectos son <strong>demostraciones visuales</strong> para mostrar a los clubes cómo pueden presentar sus campanAs de recaudación.
                            Al crear tu primer proyecto real, estos ejemplos desaparecerán automáticamente.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsAIModalOpen(true)}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-rotary-blue text-white text-xs font-bold rounded-lg hover:bg-sky-800 transition-all whitespace-nowrap">
                        <Sparkles className="w-3 h-3" /> Crear con IA
                    </button>
                </div>
            )}

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

            {filteredProjects.length === 0 && !showTrash && (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                    <FolderKanban className="w-14 h-14 text-gray-200 mx-auto mb-4" />
                    <h3 className="font-bold text-gray-600 text-lg mb-2">
                        {projects.length === 0 ? 'Aún no tienes proyectos' : 'Sin resultados para estos filtros'}
                    </h3>
                    <p className="text-gray-400 text-sm mb-6">
                        {projects.length === 0
                            ? 'Crea tu primer proyecto con la ayuda de la IA o manualmente.'
                            : 'Prueba cambiando los filtros o la búsqueda.'}
                    </p>
                    {projects.length === 0 && (
                        <button
                            onClick={() => setIsAIModalOpen(true)}
                            className="inline-flex items-center gap-2 bg-rotary-blue text-white px-6 py-3 rounded-xl font-bold hover:bg-sky-800 transition-all shadow-lg shadow-rotary-blue/20">
                            <Sparkles className="w-4 h-4" /> Crear primer proyecto con IA
                        </button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map((project) => (
                    <div key={project.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden group hover:shadow-md transition-all ${
                        selectedIds.has(project.id) ? 'border-rotary-blue ring-2 ring-rotary-blue/20' : 'border-gray-100'
                    }`}>
                        <div className="aspect-video relative overflow-hidden">
                            {/* Checkbox DENTRO del contenedor de imagen — mismo stacking context */}
                            {isSelecting && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleSelect(project.id); }}
                                    className="absolute top-3 left-3 z-20 w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer bg-black/25 hover:bg-black/40 backdrop-blur-sm transition-all"
                                >
                                    {selectedIds.has(project.id)
                                        ? <CheckSquare className="w-5 h-5 text-white" />
                                        : <Square className="w-5 h-5 text-white" />}
                                </button>
                            )}
                            {project.image ? (
                                <img src={project.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" crossOrigin="anonymous" />
                            ) : (
                                <div className="w-full h-full bg-gray-50 flex items-center justify-center text-gray-300">
                                    <FolderKanban className="w-12 h-12" />
                                </div>
                            )}
                            <div className="absolute top-3 right-3 flex gap-2 flex-wrap justify-end">
                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase backdrop-blur-md ${project.status === 'active' ? 'bg-blue-500/80 text-white' :
                                    project.status === 'completed' ? 'bg-green-500/80 text-white' :
                                        'bg-gray-500/80 text-white'
                                    }`}>
                                    {project.status === 'active' ? 'Activo' : project.status === 'completed' ? 'Éxito' : 'Plan'}
                                </span>
                                {/* Badge del club de origen (visible en vista global) */}
                                {project.club && (
                                    <span className="px-2 py-1 rounded-md bg-rotary-blue/80 text-white text-[10px] font-bold uppercase backdrop-blur-md max-w-[100px] truncate">
                                        {project.club.name}
                                    </span>
                                )}
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

        {/* ── Paso 1: Nuevo Proyecto — Guía e intervención de agentes ── */}
        {showNewProjectStep1 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

                    {/* Header con paso */}
                    <div className="flex items-center justify-between px-7 py-5 bg-gradient-to-r from-rotary-blue to-sky-700 text-white">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-white/70 uppercase tracking-widest">Paso 1 de 2</p>
                                <h2 className="text-lg font-black">Crear Nuevo Proyecto</h2>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Indicador de pasos */}
                            <div className="flex items-center gap-1.5">
                                <div className="w-6 h-1.5 rounded-full bg-white" />
                                <div className="w-6 h-1.5 rounded-full bg-white/30" />
                            </div>
                            <button onClick={() => setShowNewProjectStep1(false)}
                                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {/* Intro */}
                        <div className="px-7 pt-6 pb-4">
                            <h3 className="font-black text-gray-800 text-base mb-1">¿Cómo crear un proyecto exitoso?</h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                Antes de llenar el formulario, ten en cuenta que cada proyecto involucra a cuatro agentes especializados que trabajarán contigo para publicarlo y difundirlo de manera profesional.
                            </p>
                        </div>

                        {/* Flujo en 4 pasos */}
                        <div className="px-7 pb-5">
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { num: '1', emoji: '✍️', label: 'Rafael redacta', desc: 'Título, descripción e historia de impacto', color: '#10B981' },
                                    { num: '2', emoji: '📸', label: 'Camila define la imagen', desc: 'Portada, galería y video del proyecto', color: '#EC4899' },
                                    { num: '3', emoji: '💻', label: 'Santiago publica', desc: 'Verificación web, SEO y estado en admin', color: '#0EA5E9' },
                                    { num: '4', emoji: '📱', label: 'Andrés difunde', desc: 'Redes sociales y calendario de posts', color: '#F97316' },
                                ].map((step) => (
                                    <div key={step.num} className="relative bg-gray-50 rounded-2xl p-3 text-center border border-gray-100">
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black mx-auto mb-2"
                                            style={{ backgroundColor: step.color }}>
                                            {step.num}
                                        </div>
                                        <div className="text-xl mb-1">{step.emoji}</div>
                                        <p className="text-[11px] font-bold text-gray-700 leading-snug mb-1">{step.label}</p>
                                        <p className="text-[10px] text-gray-400 leading-snug">{step.desc}</p>

                                        {/* Flecha entre pasos */}
                                        {step.num !== '4' && (
                                            <ChevronRight className="absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 z-10 bg-white rounded-full" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Separator */}
                        <div className="mx-7 border-t border-gray-100 mb-5" />

                        {/* Agentes disponibles */}
                        <div className="px-7 pb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-black text-gray-800 text-base">
                                    Agentes disponibles para proyectos
                                </h3>
                                <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
                                    {step1Agents.length > 0 ? `${step1Agents.length} agentes` : 'Cargando...'}
                                </span>
                            </div>

                            {step1Agents.length === 0 ? (
                                /* Fallback estático si los agentes aún no cargaron */
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { name: 'Rafael', role: 'Copywriter / Storyteller Rotario', desc: 'Redacta descripciones, textos de recaudación y testimonios del proyecto.', color: '#10B981', emoji: '✍️', caps: ['Proyectos', 'Noticias', 'Blog'] },
                                        { name: 'Camila', role: 'Creadora de Contenido Multimedia', desc: 'Define imágenes, videos y brief visual para el proyecto.', color: '#EC4899', emoji: '📸', caps: ['Multimedia', 'Captions', 'Proyectos'] },
                                        { name: 'Santiago', role: 'Webmaster / Desarrollador Web', desc: 'Verifica publicación, SEO y configuración del proyecto en el sitio.', color: '#0EA5E9', emoji: '💻', caps: ['Web', 'SEO', 'Config'] },
                                        { name: 'Andrés', role: 'Gestor de Redes Sociales', desc: 'Crea el plan de redes y calendario de difusión del proyecto.', color: '#F97316', emoji: '📱', caps: ['Redes', 'Calendario', 'Analytics'] },
                                    ].map(a => (
                                        <div key={a.name} className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0 border-2 border-white shadow"
                                                style={{ background: a.color + '15' }}>
                                                {a.emoji}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm text-gray-800">{a.name}</p>
                                                <p className="text-xs font-medium mb-1" style={{ color: a.color }}>{a.role}</p>
                                                <p className="text-xs text-gray-400 leading-snug mb-2">{a.desc}</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {a.caps.map(c => (
                                                        <span key={c} className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                                                            style={{ background: a.color + '15', color: a.color }}>{c}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {step1Agents.map(a => {
                                        const capLabels: Record<string, string> = {
                                            manage_projects: 'Proyectos', edit_testimonials: 'Testimonios',
                                            create_news: 'Noticias', edit_content: 'Contenido', create_blog: 'Blog',
                                            create_media: 'Multimedia', upload_media: 'Subir archivos', generate_captions: 'Captions',
                                            create_posts: 'Redes', calendar: 'Calendario', analytics: 'Analytics',
                                            edit_pages: 'Páginas', site_config: 'Config web',
                                        };
                                        const relevantCaps = a.capabilities?.filter(c => PROJECT_AGENT_CAPS.includes(c)) || [];
                                        return (
                                            <div key={a.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-gray-200 transition-colors">
                                                <div className="flex-shrink-0 relative">
                                                    <img src={avatar(a.avatarSeed || a.name)} alt={a.name}
                                                        className="w-12 h-12 rounded-full object-cover border-2 border-white shadow"
                                                        style={{ background: (a.avatarColor || '#013388') + '20' }} />
                                                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white bg-emerald-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm text-gray-800">{a.name}</p>
                                                    <p className="text-xs font-medium mb-1.5 truncate" style={{ color: a.avatarColor || '#013388' }}>{a.role}</p>
                                                    <p className="text-xs text-gray-400 leading-snug mb-2 line-clamp-2">{a.description}</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {relevantCaps.slice(0, 3).map(c => (
                                                            <span key={c} className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
                                                                style={{ background: (a.avatarColor || '#013388') + '15', color: a.avatarColor || '#013388' }}>
                                                                {capLabels[c] || c}
                                                            </span>
                                                        ))}
                                                        {relevantCaps.length > 3 && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold text-gray-400 bg-gray-100">+{relevantCaps.length - 3}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-7 py-5 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
                            En el siguiente paso encontrarás el formulario completo para registrar el proyecto con ayuda de IA ✨
                        </p>
                        <button
                            onClick={() => { setShowNewProjectStep1(false); setIsAIModalOpen(true); }}
                            className="flex items-center gap-2.5 px-6 py-3 bg-rotary-blue text-white rounded-xl font-black text-sm hover:bg-sky-800 transition-all shadow-lg shadow-rotary-blue/25"
                        >
                            Continuar al formulario <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Modal IA */}
        {isAIModalOpen && (
            <ProjectAIModal
                onClose={() => setIsAIModalOpen(false)}
                onApply={handleAIApply}
            />
        )}

        {/* ── Modal de Testimonios ────────────────────────────────── */}
        {showTestimonialsPanel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rotary-blue/10 flex items-center justify-center">
                                <Quote className="w-5 h-5 text-rotary-blue" />
                            </div>
                            <div>
                                <h2 className="font-bold text-gray-800 text-lg">Gestión de Testimonios</h2>
                                <p className="text-xs text-gray-400">Aparecen en la sección de Proyectos del club</p>
                            </div>
                        </div>
                        <button onClick={() => { setShowTestimonialsPanel(false); setEditingTestimonial(null); setTestimonialForm({ name: '', role: '', text: '', image: '' }); }}
                            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                            <X className="w-4 h-4 text-gray-500" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-5">
                        {/* Banner demo */}
                        {testimonials.every(t => t.isStatic) && (
                            <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs">
                                <span className="text-amber-500 text-base mt-0.5">💡</span>
                                <p className="text-amber-700"><strong>Testimonios de ejemplo</strong> — Al crear tu primer testimonio real, estos desaparecerán automáticamente.</p>
                            </div>
                        )}

                        {/* Lista de testimonios */}
                        <div className="space-y-3">
                            {testimonials.map(t => (
                                <div key={t.id} className="flex items-start gap-4 p-4 rounded-2xl border border-gray-100 bg-gray-50 group">
                                    <img
                                        src={t.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name)}&background=013388&color=fff&size=80`}
                                        alt={t.name}
                                        className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-white shadow"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-bold text-sm text-gray-800">{t.name}</span>
                                            {t.isStatic
                                                ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-600">Demo</span>
                                                : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-green-100 text-green-600">Real</span>
                                            }
                                        </div>
                                        <p className="text-xs text-rotary-blue font-medium mb-1">{t.role}</p>
                                        <p className="text-xs text-gray-500 line-clamp-2">{t.text}</p>
                                    </div>
                                    <div className="flex gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => { setEditingTestimonial(t); setTestimonialForm({ name: t.name, role: t.role, text: t.text, image: t.image || '' }); }}
                                            className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:border-rotary-blue hover:text-rotary-blue transition-colors">
                                            <Edit2 className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => deleteTestimonialHandler(t)}
                                            className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:border-red-400 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Formulario crear/editar */}
                        <div className="border-t border-gray-100 pt-5">
                            <h3 className="font-bold text-sm text-gray-700 mb-4 flex items-center gap-2">
                                {editingTestimonial && !editingTestimonial.isStatic
                                    ? <><Edit2 className="w-3.5 h-3.5" /> Editar testimonio</>
                                    : <><Sparkles className="w-3.5 h-3.5 text-rotary-blue" /> {editingTestimonial?.isStatic ? 'Crear nuevo (basado en este)' : 'Nuevo testimonio'}</>}
                            </h3>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Nombre *</label>
                                    <input
                                        type="text" placeholder="Ej: María García"
                                        value={testimonialForm.name}
                                        onChange={e => setTestimonialForm(f => ({ ...f, name: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rotary-blue/20"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Rol / Cargo</label>
                                    <input
                                        type="text" placeholder="Ej: Beneficiaria, Bogotá"
                                        value={testimonialForm.role}
                                        onChange={e => setTestimonialForm(f => ({ ...f, role: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rotary-blue/20"
                                    />
                                </div>
                            </div>
                            <div className="mb-3">
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">URL de foto (opcional)</label>
                                <input
                                    type="url" placeholder="https://..."
                                    value={testimonialForm.image}
                                    onChange={e => setTestimonialForm(f => ({ ...f, image: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rotary-blue/20"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Testimonio *</label>
                                <textarea
                                    rows={3} placeholder="El testimonio del beneficiario..."
                                    value={testimonialForm.text}
                                    onChange={e => setTestimonialForm(f => ({ ...f, text: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rotary-blue/20 resize-none"
                                />
                            </div>
                            <div className="flex justify-between items-center">
                                {(editingTestimonial) && (
                                    <button
                                        onClick={() => { setEditingTestimonial(null); setTestimonialForm({ name: '', role: '', text: '', image: '' }); }}
                                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                                        Cancelar edición
                                    </button>
                                )}
                                <button
                                    onClick={saveTestimonial}
                                    disabled={savingTestimonial}
                                    className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-rotary-blue text-white text-sm font-bold rounded-xl hover:bg-sky-800 transition-all disabled:opacity-60">
                                    {savingTestimonial ? 'Guardando...' : editingTestimonial && !editingTestimonial.isStatic ? 'Actualizar' : 'Crear Testimonio'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default ProjectsManagement;
