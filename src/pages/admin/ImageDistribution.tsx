import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Image as ImageIcon, Save, Loader2, Trash2, Upload, Plus,
    Monitor, ChevronDown, ChevronUp, CheckCircle, X, Search, AlertCircle, XCircle
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../../utils/cropImage';

const API = import.meta.env.VITE_API_URL || '/api';

// ── Default Unsplash images (fallbacks) ────────────────────────────────────
const DEFAULTS = {
    hero: [
        { url: '/defaults/hero/1-teamwork.png', alt: 'Trabajo en equipo' },
        { url: '/defaults/hero/2-peace.png', alt: 'Promoción de la paz' },
        { url: '/defaults/hero/3-health.png', alt: 'Lucha contra enfermedades' },
        { url: '/defaults/hero/4-education.png', alt: 'Educación' },
        { url: '/defaults/hero/5-economy.png', alt: 'Desarrollo económico' },
    ],
    causes: [
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&h=500&fit=crop', alt: 'Promoción de la paz' },
        { url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=500&fit=crop', alt: 'Lucha contra enfermedades' },
        { url: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=500&h=500&fit=crop', alt: 'Agua y saneamiento' },
        { url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=500&h=500&fit=crop', alt: 'Salud materno-infantil' },
        { url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=500&h=500&fit=crop', alt: 'Educación básica' },
        { url: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=500&h=500&fit=crop', alt: 'Desarrollo económico' },
        { url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=500&h=500&fit=crop', alt: 'Medio ambiente' },
    ],
    foundation: { url: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1600&h=800&fit=crop', alt: 'Fundación Rotaria' },
    join: { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=500&fit=crop', alt: 'Únete a Rotary' },
    aboutHero: { url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&h=500&fit=crop', alt: 'Quiénes Somos' },
    aboutCarousel: [
        { url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=250&fit=crop', alt: 'Protegemos el medio ambiente' },
        { url: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=400&h=250&fit=crop', alt: 'Somos gente de acción' },
        { url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=400&h=250&fit=crop', alt: 'Promovemos la paz' },
        { url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=250&fit=crop', alt: 'Combatimos enfermedades' },
        { url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=400&h=250&fit=crop', alt: 'Protegemos a madres e hijos' },
    ],
    causesHero: { url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1600&h=600&fit=crop', alt: 'Nuestras Causas' },
    polio: { url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=600&fit=crop', alt: 'Erradicación de la Polio' },
    history: [
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=500&fit=crop', alt: 'Hero Historia' },
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop', alt: 'Décadas de Impacto' },
        { url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=500&fit=crop', alt: 'Momento Histórico 1' },
        { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=500&fit=crop', alt: 'Momento Histórico 2' },
        { url: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=500&fit=crop', alt: 'Momento Histórico 3' },
    ],
    historyHero: { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=500&fit=crop', alt: 'Hero Historia' },
    historyImpact: { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop', alt: 'Décadas de Impacto' },
    historyTimeline: [
        { url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=500&fit=crop', alt: 'Momento Histórico 1' },
        { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=500&fit=crop', alt: 'Momento Histórico 2' },
        { url: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=500&fit=crop', alt: 'Momento Histórico 3' },
    ],
    historyFounders: Array(7).fill({ url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop', alt: 'Socio Fundador' }),
    paulHarrisAvatar: { url: 'https://www.rotary.org/sites/default/files/styles/w_600/public/Paul%20Harris%20portrait.jpg', alt: 'Paul Harris' },

    rotaract: { url: 'https://images.unsplash.com/photo-1529390079861-591de354faf5?w=1600&h=800&fit=crop', alt: 'Club Rotaract' },
    interact: { url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1600&h=800&fit=crop', alt: 'Club Interact' },
    yep: [
        { url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 1' },
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 2' },
        { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 3' },
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 4' },
        { url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 5' }
    ],
    yepExperience: { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=600&fit=crop', alt: 'Experiencia Internacional' },
    yepBanner: { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=800&fit=crop', alt: 'Banner de Intercambio' },
    ngse: { url: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1600&h=800&fit=crop', alt: 'NGSE' },
    rotexHero: { url: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=1600&h=800&fit=crop', alt: 'ROTEX Banner' },
    rotexCarousel: [
        { url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 1' },
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 2' },
        { url: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 3' },
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 4' },
        { url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 5' }
    ],
    chatbotPublicAvatar: { url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face', alt: 'Avatar Público' },
    chatbotAdminAvatar: { url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face', alt: 'Avatar Admin' },
    missionControl: { url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=100&fit=crop', alt: 'Mission Control Logo' },
};

interface ImgSlot { url: string; alt: string; }
interface SiteImages {
    hero: ImgSlot[];
    causes: ImgSlot[];
    foundation: ImgSlot;
    join: ImgSlot;
    aboutHero: ImgSlot;
    aboutCarousel: ImgSlot[];
    causesHero: ImgSlot;
    polio: ImgSlot;
    history: ImgSlot[];
    rotaract?: ImgSlot;
    interact?: ImgSlot;
    yep?: ImgSlot[];
    ngse?: ImgSlot;
    rotex?: ImgSlot;
    chatbotPublicAvatar?: ImgSlot;
    chatbotAdminAvatar?: ImgSlot;
    missionControl?: ImgSlot;
    [key: string]: ImgSlot | ImgSlot[] | undefined;
}

interface MediaItem { id: string; url: string; filename: string; type: string; }

// ── Container definitions ──────────────────────────────────────────────────
// A container can have either a flat key/count or grouped sub-sections.
interface SubGroup { key: string; subLabel: string; count: number; aspect: string; }
interface Container { key: string; label: string; desc: string; count: number; aspect: string; groups?: SubGroup[]; }

const BASE_CONTAINERS: Container[] = [
    { key: 'hero', label: 'Hero — Slider Principal', desc: '5 imágenes de slide con rotación automática. Tamaño ideal: 1600×700px, horizontal.', count: 5, aspect: '16/7' },
    { key: 'causes', label: 'Áreas de Interés — Causas', desc: '7 imágenes para las tarjetas de causas Rotary. Tamaño ideal: 500×500px, cuadrado.', count: 7, aspect: '1/1' },
    { key: 'foundation', label: 'Fundación Rotaria', desc: '1 imagen de fondo para la sección de la Fundación. Tamaño ideal: 1600×700px, panorámica.', count: 1, aspect: '16/7' },
    { key: 'join', label: 'Sección Únete', desc: '1 imagen motivacional para la sección de reclutamiento. Tamaño ideal: 800×600px.', count: 1, aspect: '4/3' },
    {
        key: 'about', label: 'Quiénes Somos', desc: 'Imágenes de las páginas Quiénes Somos y Nuestras Causas.', count: 8, aspect: '16/5',
        groups: [
            { key: 'aboutHero', subLabel: 'Hero — Banner (Quiénes Somos)', count: 1, aspect: '16/5' },
            { key: 'aboutCarousel', subLabel: 'Carrusel de Causas', count: 5, aspect: '8/5' },
            { key: 'causesHero', subLabel: 'Hero — Banner (Causas)', count: 1, aspect: '16/6' },
            { key: 'polio', subLabel: 'Erradicación a la Polio', count: 1, aspect: '4/3' },
        ],
    },
    {
        key: 'history-page', label: 'Nuestra Historia', desc: 'Personaliza todas las imágenes de la página institucional de Historia.', count: 15, aspect: '16/9',
        groups: [
            { key: 'historyHero', subLabel: 'Hero — Banner Superior', count: 1, aspect: '16/5' },
            { key: 'historyImpact', subLabel: 'Sección de Impacto', count: 1, aspect: '3/2' },
            { key: 'historyTimeline', subLabel: 'Momentos Históricos (Carrusel)', count: 5, aspect: '16/9' },
            { key: 'historyFounders', subLabel: 'Fotos de Fundadores', count: 7, aspect: '1/1' },
            { key: 'paulHarrisAvatar', subLabel: 'Avatar de Paul Harris', count: 1, aspect: '1/1' },
        ],
    },
];

const ImageDistribution: React.FC = () => {
    const { user } = useAuth();
    const { club } = useClub();
    
    // Compute dynamic containers based on club modules
    const activeContainers = React.useMemo(() => {
        const active: Container[] = [...BASE_CONTAINERS];
        const c = club as any;
        if (c?.modules?.rotaract) active.push({ key: 'rotaract', label: 'Club Rotaract', desc: 'Imagen de portada para la sección Rotaract.', count: 1, aspect: '16/7' });
        if (c?.modules?.interact) active.push({ key: 'interact', label: 'Club Interact', desc: 'Imagen de portada para la sección Interact.', count: 1, aspect: '16/7' });
        if (c?.modules?.youthExchange) {
            active.push({
                key: 'yep',
                label: 'Intercambio de Jóvenes (YEP)',
                desc: 'Configuración de imágenes para el portal de intercambios.',
                count: 5,
                aspect: '16/8',
                groups: [
                    { key: 'yep', subLabel: 'Slider Principal', desc: '5 imágenes para el carrusel superior del portal.', count: 5, aspect: '16/8' },
                    { key: 'yepExperience', subLabel: 'Sección de Experiencia', desc: 'Imagen lateral para la sección de intercambio internacional.', count: 1, aspect: '4/3' },
                    { key: 'yepBanner', subLabel: 'Banner Inferior', desc: 'Imagen de fondo para el banner de cierre.', count: 1, aspect: '16/8' }
                ]
            });
        }
        if (c?.modules?.ngse) active.push({ key: 'ngse', label: 'Intercambios NGSE', desc: 'Imagen de portada para la directiva de NGSE.', count: 1, aspect: '16/8' });
        if (c?.modules?.rotex || c?.name?.toLowerCase().includes('latir') || c?.subdomain?.toLowerCase().includes('latir')) {
            active.push({
                key: 'rotex',
                label: 'Red ROTEX',
                desc: 'Configuración de imágenes para la red de ex-becarios.',
                count: 2,
                aspect: '16/6',
                groups: [
                    { key: 'rotexHero', subLabel: 'Hero — Banner', desc: 'Imagen de portada superior.', count: 1, aspect: '16/6' },
                    { key: 'rotexCarousel', subLabel: 'Carrusel de Imágenes', desc: '5 imágenes que muestran las actividades de la red.', count: 5, aspect: '16/9' }
                ]
            });
        }
        
        if (c?.modules?.ecommerce) {
            active.push({ key: 'ecommerceBanner', label: 'Tienda Virtual (E-commerce)', desc: 'Banner superior para la página de la tienda.', count: 1, aspect: '16/5' });
        }
        if (c?.modules?.dian) {
            active.push({ key: 'dianBanner', label: 'Estados Financieros (DIAN)', desc: 'Imagen de cabecera para la página de transparencia.', count: 1, aspect: '16/5' });
        }
        
        // Superadmin feature
        if (user?.role === 'administrator') {
            active.push({ key: 'missionControl', label: 'Mission Control VIP', desc: 'Logotipo para el header del panel avanzado (Solo Global).', count: 1, aspect: 'auto' });
        }
        // ChatBot images (hidden for editors)
        if (user?.role !== 'editor') {
            active.push({
                key: 'chatbot', label: 'Asistente IA (ChatBot)', desc: 'Imágenes de avatar para el asistente en la plataforma.', count: 2, aspect: '1/1',
                groups: [
                    { key: 'chatbotPublicAvatar', subLabel: 'Avatar Público', count: 1, aspect: '1/1' },
                    { key: 'chatbotAdminAvatar', subLabel: 'Avatar Administrador', count: 1, aspect: '1/1' },
                ],
            });
        }

        return active;
    }, [club, user]);

    const [images, setImages] = useState<SiteImages | null>(null);
    const [baseImages, setBaseImages] = useState<SiteImages | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ hero: true, causes: false, foundation: false, join: false });

    // Media picker
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ key: string; index: number } | null>(null);
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [mediaSearch, setMediaSearch] = useState('');
    const [uploading, setUploading] = useState(false);

    // Cropping states
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [cropData, setCropData] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

    const token = () => localStorage.getItem('rotary_token');
    const isSuperAdmin = user?.role === 'administrator';
    
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const urlClubId = params.get('clubId');
    
    // If we are in the main /admin/imagenes-sitio without a ?clubId, we assume it's _global for superadmin
    const isGlobal = isSuperAdmin && !urlClubId;
    const viewClubId = isGlobal ? null : (isSuperAdmin ? urlClubId : (user?.clubId || (club as any)?.id));
    const clubId = viewClubId;

    // Build complete images object overlaying over DEFAULTS
    const buildImages = React.useCallback((src: any) => {
        const result: any = {};
        for (const key of Object.keys(DEFAULTS)) {
            const def = (DEFAULTS as any)[key];
            if (Array.isArray(def)) {
                // Merge existing array items with defaults for any new slots
                const clubArr = Array.isArray(src?.[key]) ? src[key] : [];
                result[key] = def.map((d: any, i: number) => clubArr[i] || { ...d });
            } else {
                result[key] = src?.[key] || { ...def };
            }
        }

        // --- Smart Migration Logic for Nuestra Historia ---
        const isDef = (url: string) => !url || url.includes('images.unsplash.com') || url.includes('/defaults/');
        const hist = src?.history;
        if (Array.isArray(hist) && hist.length >= 2) {
            if (isDef(result.historyHero?.url) && !isDef(hist[0]?.url)) result.historyHero = { ...hist[0] };
            if (isDef(result.historyImpact?.url) && !isDef(hist[1]?.url)) result.historyImpact = { ...hist[1] };
            
            if (Array.isArray(result.historyTimeline)) {
                result.historyTimeline.forEach((slot: any, i: number) => {
                    const oldIdx = i + 2;
                    if (isDef(slot.url) && hist[oldIdx] && !isDef(hist[oldIdx].url)) {
                        result.historyTimeline[i] = { ...hist[oldIdx] };
                    }
                });
            }
        }

        return result as SiteImages;
    }, []);

    // ── Load current site images ──────────────────────────────────────────
    useEffect(() => {
        if (!viewClubId && !isSuperAdmin) { setLoading(false); return; }
        (async () => {
            try {
                if (isSuperAdmin && !viewClubId) {
                    // Editing global templates
                    const res = await fetch(`${API}/clubs/_global/site-images?_t=${Date.now()}`);
                    const data = res.ok ? await res.json() : {};
                    setImages(buildImages(data));
                    setBaseImages(buildImages({}));
                } else {
                    // Editing specific club (whether Super Admin or Club Admin)
                    const res = await fetch(`${API}/clubs/${viewClubId}/site-images?_t=${Date.now()}`);
                    const data = res.ok ? await res.json() : {};
                    setImages(buildImages(data));

                    const gRes = await fetch(`${API}/clubs/_global/site-images?_t=${Date.now()}`);
                    const gData = gRes.ok ? await gRes.json() : {};
                    setBaseImages(buildImages(gData));
                }
            } catch { 
                const fallback = buildImages({});
                setImages(fallback);
                setBaseImages(fallback);
            }
            finally { setLoading(false); }
        })();
    }, [viewClubId, isSuperAdmin, buildImages]);

    // ── Save ──────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!images) return;
        if (!isSuperAdmin && !clubId) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/admin/sections/batch-upsert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({
                    clubId: clubId,
                    sections: [{ page: 'home', section: 'images', content: images }]
                })
            });
            if (res.ok) { toast.success('✅ Imágenes guardadas exitosamente'); setDirty(false); }
            else toast.error('Error al guardar');
        } catch { toast.error('Error de conexión'); }
        finally { setSaving(false); }
    };

    // ── Open media picker ─────────────────────────────────────────────────
    const openPicker = (key: string, index: number) => {
        setPickerTarget({ key, index });
        setPickerOpen(true);
        setMediaSearch('');
        fetchMedia();
    };

    const fetchMedia = async () => {
        setMediaLoading(true);
        try {
            const res = await fetch(`${API}/media?type=image${viewClubId ? `&clubId=${viewClubId}` : ''}`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMediaItems(Array.isArray(data) ? data : data.items || []);
            }
        } catch { }
        finally { setMediaLoading(false); }
    };

    // ── Upload logic execution ─────────────────────────────────────────────
    const performUpload = async (fileToUpload: File) => {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('clubId', viewClubId || '');
        let newUrl = null;
        try {
            const res = await fetch(`${API}/media/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token()}` },
                body: formData,
            });
            if (res.ok) {
                const data = await res.json();
                toast.success('✅ Imagen subida y seleccionada automáticamente.');
                await fetchMedia();
                
                // Extra: Automatically select the image avoiding the click in the gallery
                if (data.url) {
                    newUrl = data;
                }
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Error al subir imagen');
            }
        } catch { toast.error('Error de conexión'); }
        finally { setUploading(false); }
        
        return newUrl;
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (pickerTarget?.key.startsWith('chatbot') || ['hero', 'aboutHero', 'causesHero', 'yep', 'yepExperience', 'yepBanner', 'rotaract', 'interact', 'ngse', 'rotexHero', 'rotexCarousel', 'foundation', 'polio', 'history', 'historyHero', 'historyImpact', 'historyTimeline', 'historyFounders', 'paulHarrisAvatar'].includes(pickerTarget?.key || '')) {
            const reader = new FileReader();
            reader.onload = () => {
                setCropImageSrc(reader.result as string);
                setCropFile(file);
            };
            reader.readAsDataURL(file);
            e.target.value = '';
            return;
        }

        if (pickerTarget?.key === 'missionControl') {
            setUploading(true);
            try {
                const img = new Image();
                const url = URL.createObjectURL(file);
                const croppedBlob = await new Promise<Blob>((resolve) => {
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width; canvas.height = img.height;
                        const ctx = canvas.getContext('2d')!;
                        ctx.drawImage(img, 0, 0);
                        URL.revokeObjectURL(url);
                        const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
                        let top = height, bottom = 0, left = width, right = 0;
                        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                            const idx = (y * width + x) * 4;
                            if (data[idx + 3] > 10 && !(data[idx] > 225 && data[idx + 1] > 225 && data[idx + 2] > 225)) {
                                top = Math.min(top, y); bottom = Math.max(bottom, y);
                                left = Math.min(left, x); right = Math.max(right, x);
                            }
                        }
                        const pad = 4;
                        const cw = Math.min(width - 1, right + pad) - Math.max(0, left - pad) + 1;
                        const ch = Math.min(height - 1, bottom + pad) - Math.max(0, top - pad) + 1;
                        if (cw > 0 && ch > 0 && (cw < width || ch < height)) {
                            const c2 = document.createElement('canvas');
                            c2.width = cw; c2.height = ch;
                            c2.getContext('2d')!.drawImage(canvas, Math.max(0, left - pad), Math.max(0, top - pad), cw, ch, 0, 0, cw, ch);
                            c2.toBlob((b) => resolve(b || file), 'image/png');
                        } else canvas.toBlob((b) => resolve(b || file), 'image/png');
                    };
                    img.onerror = () => resolve(file);
                    img.src = url;
                });
                
                const processFile = new File([croppedBlob], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' });
                const uploadedData = await performUpload(processFile);
                if (uploadedData && uploadedData.url) {
                    selectMedia(uploadedData.url, processFile.name);
                }
            } catch (err) {
                console.error("Smart crop error:", err);
                toast.error("Error al procesar la imagen automáticamente.");
                setUploading(false);
            }
            e.target.value = '';
            return;
        }

        const data = await performUpload(file);
        if (data && data.url) {
            selectMedia(data.url, file.name);
            toast.success('Imagen recortada y actualizada con éxito');
        }
        e.target.value = '';
    };

    const handleCropSave = async () => {
        if (!cropImageSrc || !croppedAreaPixels || !cropFile) return;
        setUploading(true);
        try {
            const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
            const file = new File([croppedBlob], cropFile.name, { type: 'image/jpeg' });
            
            const data = await performUpload(file);
            setCropImageSrc(null);
            setCropFile(null);
            
            if (data && data.url) {
                selectMedia(data.url, file.name);
            }
        } catch (e: any) {
            console.error('Cropper error:', e);
            toast.error(e.message || 'Error al recortar la imagen (posible bloqueo CORS o imagen inválida)');
            setUploading(false);
        }
    };

    const handleMediaClick = (url: string, filename: string) => {
        if (pickerTarget?.key.startsWith('chatbot') || ['hero', 'aboutHero', 'causesHero', 'yep', 'yepExperience', 'yepBanner', 'rotaract', 'interact', 'ngse', 'rotexHero', 'rotexCarousel', 'foundation', 'polio', 'history', 'historyHero', 'historyImpact', 'historyTimeline', 'historyFounders', 'paulHarrisAvatar'].includes(pickerTarget?.key || '')) {
            setCropImageSrc(url);
            // Create a pseudo-file to carry over the original filename safely
            setCropFile(new File([], filename || 'image.jpg'));
            return;
        }
        selectMedia(url, filename);
    };

    const selectMedia = (url: string, filename: string) => {
        if (!images || !pickerTarget) return;
        const { key, index } = pickerTarget;
        const newImages: any = { ...images };
        const def = (DEFAULTS as any)[key];
        const alt = filename.replace(/\.[^/.]+$/, '');
        if (Array.isArray(def)) {
            newImages[key] = [...newImages[key]];
            newImages[key][index] = { url, alt };
        } else {
            newImages[key] = { url, alt };
        }
        setImages(newImages as SiteImages);
        setDirty(true);
        setPickerOpen(false);
    };

    // Handle updating just the label (alt text)
    const updateAlt = (key: string, index: number, alt: string) => {
        if (!images) return;
        const newImages: any = { ...images };
        const def = (DEFAULTS as any)[key];
        if (Array.isArray(def)) {
            newImages[key] = [...newImages[key]];
            newImages[key][index] = { ...newImages[key][index], alt };
        } else {
            newImages[key] = { ...newImages[key], alt };
        }
        setImages(newImages as SiteImages);
        setDirty(true);
    };

    // Handle entering a custom URL
    const handleCustomUrl = (key: string, index: number, url: string) => {
        if (!images) return;
        const newImages: any = { ...images };
        const def = (DEFAULTS as any)[key];
        if (Array.isArray(def)) {
            newImages[key] = [...newImages[key]];
            newImages[key][index] = { ...newImages[key][index], url };
        } else {
            newImages[key] = { ...newImages[key], url };
        }
        setImages(newImages as SiteImages);
        setDirty(true);
    };

    // Reset a slot to default
    const resetSlot = (key: string, index: number) => {
        if (!images) return;
        const newImages: any = { ...images };
        const baseDef = (baseImages || DEFAULTS) as any;
        const groupDef = baseDef[key];
        if (Array.isArray(groupDef)) {
            newImages[key] = [...newImages[key]];
            newImages[key][index] = { ...groupDef[index] };
        } else {
            newImages[key] = { ...groupDef };
        }
        setImages(newImages as SiteImages);
        setDirty(true);
    };

    const isDefault = (key: string, index: number): boolean => {
        if (!images) return true;
        const baseDef = (baseImages || DEFAULTS) as any;
        const groupDef = baseDef[key];
        const val = (images as any)[key];
        if (Array.isArray(groupDef)) return val?.[index]?.url === groupDef[index]?.url;
        return val?.url === groupDef?.url;
    };

    const getSlots = (key: string, expectedCount?: number): ImgSlot[] => {
        if (!images) return [];
        const val = (images as any)[key];
        let slots: ImgSlot[] = [];
        
        if (Array.isArray(val)) {
            slots = [...val];
        } else if (val) {
            slots = [val];
        }

        // Defensive padding: if we expect more slots than we have, pad with defaults
        if (expectedCount && slots.length < expectedCount) {
            const defs = (DEFAULTS as any)[key];
            const defArray = Array.isArray(defs) ? defs : [defs];
            for (let i = slots.length; i < expectedCount; i++) {
                slots.push(defArray[i] || defArray[0]);
            }
        }
        
        return slots;
    };

    const filteredMedia = mediaItems.filter(m =>
        m.type === 'image' && (mediaSearch === '' || m.filename.toLowerCase().includes(mediaSearch.toLowerCase()))
    );

    if (loading) return <AdminLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="space-y-6 max-w-5xl">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-white" />
                            </div>
                            Imágenes del Sitio
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Personaliza las imágenes de cada sección de tu sitio web. Los cambios se aplican al guardar.</p>
                    </div>
                    <button onClick={handleSave} disabled={saving || !dirty}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${dirty ? 'bg-rotary-blue text-white shadow-lg shadow-rotary-blue/20 hover:bg-sky-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>

                {dirty && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2 font-medium">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        Tienes cambios sin guardar. Haz clic en "Guardar Cambios" para aplicarlos.
                    </div>
                )}

                {activeContainers.map((container: Container) => {
                    // For grouped containers, calculate totals across groups
                    const subGroups = container.groups || [{ key: container.key, subLabel: '', count: container.count, aspect: container.aspect }];
                    const totalCount = subGroups.reduce((sum: number, g: SubGroup) => sum + g.count, 0);
                    const totalCustom = subGroups.reduce((sum: number, g: SubGroup) => {
                        const s = getSlots(g.key, g.count);
                        return sum + s.filter((_, i) => !isDefault(g.key, i)).length;
                    }, 0);
                    
                    const percentage = container.key === 'causes' ? 100 : Math.round((totalCustom / totalCount) * 100);
                    const isOpen = expanded[container.key];

                    return (
                        <div key={container.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            {/* Accordion Header */}
                            <button onClick={() => setExpanded(prev => ({ ...prev, [container.key]: !prev[container.key] }))}
                                className="w-full px-6 py-5 flex items-center gap-4 hover:bg-gray-50/50 transition-colors text-left">
                                <Monitor className="w-5 h-5 text-violet-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h3 className="font-bold text-gray-900">{container.label}</h3>
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                            {totalCount} {totalCount === 1 ? 'imagen' : 'imágenes'}
                                        </span>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${percentage === 100 ? 'bg-emerald-100 text-emerald-700' : percentage > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                            {percentage === 100 ? <CheckCircle className="w-3 h-3" /> : (percentage > 0 ? <AlertCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />)}
                                            {percentage}% personalizado
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">{container.desc}</p>
                                </div>
                                {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                            </button>

                            {/* Slots Grid — with support for sub-groups */}
                            {isOpen && (
                                <div className="px-6 pb-6 border-t border-gray-100 pt-4 space-y-6">
                                    {subGroups.map(group => {
                                        const slots = getSlots(group.key, group.count);
                                        return (
                                            <div key={group.key}>
                                                {/* Sub-label only for grouped containers */}
                                                {container.groups && (
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">
                                                            {group.subLabel}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-medium">
                                                            {group.count} {group.count === 1 ? 'imagen' : 'imágenes'}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className={`grid gap-4 ${group.count === 1 ? 'grid-cols-1 max-w-lg' : group.count <= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-5'}`}>
                                                    {slots.map((slot, idx) => {
                                                        const isDef = isDefault(group.key, idx);
                                                        return (
                                                            <div key={idx} className={`group relative rounded-xl overflow-hidden border-2 transition-all ${isDef ? 'border-gray-200 border-dashed' : 'border-emerald-300 shadow-md'}`}>
                                                                {/* Image preview */}
                                                                <div className="relative" style={{ aspectRatio: group.aspect }}>
                                                                    <img src={slot.url} alt={slot.alt}
                                                                        className="w-full h-full object-cover"
                                                                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULTS.hero[0].url; }} />

                                                                    {/* Overlay on hover */}
                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                                                        <button onClick={() => openPicker(group.key, idx)}
                                                                            className="px-3 py-2 bg-white rounded-lg text-xs font-bold text-gray-800 hover:bg-gray-100 transition-colors flex items-center gap-1.5 shadow-lg">
                                                                            <Upload className="w-3.5 h-3.5" /> Cambiar
                                                                        </button>
                                                                        {!isDef && (
                                                                            <button onClick={() => resetSlot(group.key, idx)}
                                                                                className="px-3 py-2 bg-red-500 rounded-lg text-xs font-bold text-white hover:bg-red-600 transition-colors flex items-center gap-1.5 shadow-lg">
                                                                                <Trash2 className="w-3.5 h-3.5" /> Reset
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {/* Status badge */}
                                                                    <div className="absolute top-2 left-2">
                                                                        {isDef ? (
                                                                            <span className="px-2 py-0.5 bg-gray-900/60 text-white text-[9px] font-bold rounded-full backdrop-blur-sm uppercase">
                                                                                Por Defecto
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded-full uppercase flex items-center gap-1">
                                                                                <CheckCircle className="w-2.5 h-2.5" /> Personalizada
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {/* Slot number */}
                                                                    {group.count > 1 && (
                                                                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 text-gray-800 text-[10px] font-black flex items-center justify-center shadow">
                                                                            {idx + 1}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Alt text / label — Now Editable! */}
                                                                <div className="p-2.5 bg-white space-y-1.5">
                                                                    <div className="flex items-center justify-between">
                                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Etiqueta / Título</p>
                                                                        {slot.alt !== ((baseImages || DEFAULTS) as any)[group.key]?.[idx]?.alt && (
                                                                            <span className="w-1 h-1 rounded-full bg-violet-500 animate-pulse" />
                                                                        )}
                                                                    </div>
                                                                    <input
                                                                        type="text"
                                                                        value={slot.alt}
                                                                        onChange={(e) => updateAlt(group.key, idx, e.target.value)}
                                                                        placeholder="Ej: Promoción de la Paz..."
                                                                        className="w-full text-[10px] font-bold text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-500/5 transition-all"
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Media Picker Modal ── */}
            {pickerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-violet-500" /> Seleccionar Imagen
                            </h2>
                            <div className="flex items-center gap-2">
                                <label className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-violet-600 text-white hover:bg-violet-700 shadow-lg'}`}>
                                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {uploading ? 'Subiendo...' : 'Subir imagen'}
                                    <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                                </label>
                                <button onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="px-6 py-3 border-b border-gray-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input type="text" placeholder="Buscar por nombre de archivo..."
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl outline-none text-sm focus:ring-2 focus:ring-violet-200"
                                    value={mediaSearch} onChange={e => setMediaSearch(e.target.value)} />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {mediaLoading ? (
                                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                            ) : filteredMedia.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">{mediaSearch ? 'No hay resultados.' : 'No hay imágenes en la Media Library.'}</p>
                                    <p className="text-xs mt-1">Sube imágenes desde la sección Multimedia.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                    {filteredMedia.map(item => (
                                        <button key={item.id} onClick={() => handleMediaClick(item.url, item.filename)}
                                            className="group relative rounded-xl overflow-hidden border-2 border-gray-200 hover:border-violet-500 hover:shadow-lg transition-all aspect-square">
                                            <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-violet-500/0 group-hover:bg-violet-500/20 transition-all flex items-center justify-center">
                                                <Plus className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent">
                                                <p className="text-[9px] text-white font-medium truncate">{item.filename}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* URL input fallback */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                            <p className="text-xs text-gray-500 mb-2 font-bold">O pega una URL de imagen directamente:</p>
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const input = (e.target as HTMLFormElement).elements.namedItem('customUrl') as HTMLInputElement;
                                if (input.value && pickerTarget) {
                                    if (pickerTarget.key.startsWith('chatbot')) {
                                        handleMediaClick(input.value, `custom-url-${Date.now()}.jpg`);
                                    } else {
                                        handleCustomUrl(pickerTarget.key, pickerTarget.index, input.value);
                                        setPickerOpen(false);
                                    }
                                }
                            }} className="flex gap-2">
                                <input name="customUrl" type="url" placeholder="https://ejemplo.com/imagen.jpg"
                                    className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-200" />
                                <button type="submit" className="px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors">
                                    Usar URL
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Crop Modal ── */}
            {cropImageSrc && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-violet-500" /> Recortar y Posicionar Imagen
                            </h2>
                            <button onClick={() => { setCropImageSrc(null); setCropFile(null); }} className="text-gray-400 hover:text-gray-600 p-1">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="relative w-full h-80 bg-gray-900">
                            <Cropper
                                image={cropImageSrc}
                                crop={cropData}
                                zoom={zoom}
                                aspect={
                                    pickerTarget?.key === 'hero' ? 16 / 7 :
                                    pickerTarget?.key === 'aboutHero' ? 16 / 5 :
                                    pickerTarget?.key === 'causesHero' || pickerTarget?.key === 'rotexHero' ? 16 / 6 :
                                    pickerTarget?.key === 'yepExperience' || pickerTarget?.key === 'polio' || pickerTarget?.key === 'join' ? 4 / 3 :
                                    pickerTarget?.key === 'history' || pickerTarget?.key === 'rotexCarousel' ? 16 / 9 :
                                    (['yep', 'yepBanner', 'rotaract', 'interact', 'ngse', 'foundation'].includes(pickerTarget?.key || '')) ? 16 / 7 :
                                    1
                                }
                                cropShape={pickerTarget?.key.startsWith('chatbot') ? 'round' : 'rect'}
                                showGrid={!pickerTarget?.key.startsWith('chatbot')}
                                onCropChange={setCropData}
                                onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                                onZoomChange={setZoom}
                            />
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                                <span className="text-xs font-bold text-gray-500">Zoom</span>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    aria-labelledby="Zoom"
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="flex-1 accent-violet-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => { setCropImageSrc(null); setCropFile(null); }}
                                    className="px-4 py-2 font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCropSave}
                                    disabled={uploading}
                                    className={`px-5 py-2 font-bold text-white rounded-xl shadow-lg transition-all flex items-center gap-2 ${uploading ? 'bg-violet-400' : 'bg-violet-600 hover:bg-violet-700'}`}
                                >
                                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {uploading ? 'Subiendo...' : 'Recortar y Subir'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default ImageDistribution;
