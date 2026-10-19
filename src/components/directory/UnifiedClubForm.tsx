import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Upload, Image as ImageIcon,
  CheckCircle2, ArrowLeft, ArrowRight, Save, Plus, Trash2,
  Camera, Heart, Check, Loader2, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { PublicStepNav, PublicFormCard } from '../common/PublicInstitutionalComponents';
import { flagEmoji } from '../../lib/countryPhones';

const API = import.meta.env.VITE_API_URL || '/api';

const PASOS = [
  'Identificación',
  'Identidad',
  'Liderazgo',
  'Proyectos',
  'Multimedia',
  'Contacto',
  'Revisión y Envío'
];

const AREAS_DE_INTERES = [
  'Paz y prevención de conflictos',
  'Prevención y tratamiento de enfermedades',
  'Agua, saneamiento e higiene',
  'Salud materno-infantil',
  'Educación básica e alfabetización',
  'Desarrollo económico de la comunidad',
  'Medioambiente',
  'Juventud y Nuevas Generaciones'
];

interface BoardMember {
  id: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
}

interface ProjectItem {
  id: string;
  title: string;
  description: string;
  impact?: string;
  year?: string;
  linkUrl?: string;
}

export interface ClubFormData {
  // Paso 1
  districtNumber: number;
  organizationType: 'rotary' | 'rotaract' | 'interact';
  submissionType: 'create' | 'update';
  profileId?: string;
  officialName: string;
  shortName: string;
  city: string;
  state: string;

  // Paso 2
  foundationYear: string;
  motto: string;
  description: string;
  history: string;
  mission: string;
  vision: string;
  serviceAreas: string[];
  logoUrl: string;
  coverImageUrl: string;

  // Paso 3
  currentPresident: string;
  rotaryPeriod: string;
  boardMembers: BoardMember[];
  memberCount: string;
  youthPrograms: string;
  joinInfo: string;

  // Paso 4
  featuredProjects: ProjectItem[];

  // Paso 5
  gallery: Array<{ url: string; caption?: string; isMain?: boolean }>;
  videoLinks: string[];

  // Paso 6
  meetingAddress: string;
  meetingSchedule: string;
  contactEmail: string;
  contactPhone: string;
  contactCountryCode: string;
  websiteUrl: string;
  socialMedia: {
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };

  // Paso 7
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantRole: string;
  dataConsent: boolean;
  draftToken?: string;
}

const INITIAL_FORM: ClubFormData = {
  districtNumber: 4281,
  organizationType: 'rotary',
  submissionType: 'update',
  officialName: '',
  shortName: '',
  city: '',
  state: '',
  foundationYear: '',
  motto: '',
  description: '',
  history: '',
  mission: '',
  vision: '',
  serviceAreas: [],
  logoUrl: '',
  coverImageUrl: '',
  currentPresident: '',
  rotaryPeriod: '2026–2027',
  boardMembers: [],
  memberCount: '',
  youthPrograms: '',
  joinInfo: '',
  featuredProjects: [],
  gallery: [],
  videoLinks: [],
  meetingAddress: '',
  meetingSchedule: '',
  contactEmail: '',
  contactPhone: '',
  contactCountryCode: 'CO',
  websiteUrl: '',
  socialMedia: {},
  applicantName: '',
  applicantEmail: '',
  applicantPhone: '',
  applicantRole: '',
  dataConsent: true
};

export const UnifiedClubForm: React.FC = () => {
  const [params] = useSearchParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<ClubFormData>(INITIAL_FORM);
  const [catalogClubs, setCatalogClubs] = useState<Array<{ name: string; display: string; slug: string }>>([]);
  const [existingProfiles, setExistingProfiles] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ trackingNumber: string; submissionId: string } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  // Cargar configuración de distrito y catálogo inicial
  useEffect(() => {
    let active = true;
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API}/district-clubs/config?district=4281`);
        if (!res.ok) throw new Error('Error al cargar catálogo distrital');
        const data = await res.json();
        if (active && data.ok) {
          setCatalogClubs(data.officialCatalog || []);
        }

        // Cargar perfiles existentes para verificar si ya existe perfil
        const resPublic = await fetch(`${API}/district-clubs/public?district=4281`);
        if (resPublic.ok) {
          const pubData = await resPublic.json();
          if (active && pubData.ok) {
            setExistingProfiles(pubData.clubs || []);
          }
        }
      } catch (err) {
        console.warn('Config fetch warning:', err);
      } finally {
        if (active) setLoadingConfig(false);
      }
    };
    fetchConfig();
    return () => { active = false; };
  }, []);

  // Pre-cargar desde borrador si existe en URL o LocalStorage
  useEffect(() => {
    const draftToken = params.get('draft') || localStorage.getItem('district_club_form_draft_token');
    if (draftToken) {
      fetch(`${API}/district-clubs/draft/${draftToken}`)
        .then(r => r.json())
        .then(data => {
          if (data.ok && data.payload) {
            setFormData(prev => ({ ...prev, ...data.payload, draftToken }));
            toast.info('Borrador previo recuperado automáticamente.');
          }
        })
        .catch(() => {});
    }
  }, [params]);

  // Si seleccionan un club del catálogo que ya tiene perfil en Distrito 4281
  const handleSelectOfficialClub = (selectedName: string) => {
    const matchedProfile = existingProfiles.find(p =>
      p.officialName.toLowerCase() === selectedName.toLowerCase() ||
      p.shortName.toLowerCase() === selectedName.toLowerCase() ||
      selectedName.toLowerCase().includes(p.shortName.toLowerCase())
    );

    if (matchedProfile) {
      setFormData(prev => ({
        ...prev,
        submissionType: 'update',
        profileId: matchedProfile.id,
        officialName: matchedProfile.officialName,
        shortName: matchedProfile.shortName,
        city: matchedProfile.city || prev.city,
        state: matchedProfile.state || prev.state,
        description: matchedProfile.description || prev.description,
        history: matchedProfile.history || prev.history,
        foundationYear: matchedProfile.foundationYear ? String(matchedProfile.foundationYear) : prev.foundationYear,
        logoUrl: matchedProfile.logoUrl || prev.logoUrl,
        coverImageUrl: matchedProfile.coverImageUrl || prev.coverImageUrl,
        currentPresident: matchedProfile.currentPresident || prev.currentPresident,
        rotaryPeriod: matchedProfile.rotaryPeriod || '2026–2027',
        meetingAddress: matchedProfile.meetingAddress || prev.meetingAddress,
        meetingSchedule: matchedProfile.meetingSchedule || prev.meetingSchedule,
        contactEmail: matchedProfile.contactEmail || prev.contactEmail,
        contactPhone: matchedProfile.contactPhone || prev.contactPhone,
        websiteUrl: matchedProfile.websiteUrl || prev.websiteUrl,
        socialMedia: matchedProfile.socialMedia || prev.socialMedia,
        serviceAreas: Array.isArray(matchedProfile.serviceAreas) ? matchedProfile.serviceAreas : prev.serviceAreas
      }));
      toast.success(`Perfil institucional encontrado para ${matchedProfile.officialName}. Los datos se han prellenado para su actualización.`);
    } else {
      setFormData(prev => ({
        ...prev,
        submissionType: 'create',
        profileId: undefined,
        officialName: selectedName.startsWith('Club Rotario') || selectedName.startsWith('Rotary') ? selectedName : `Club Rotario ${selectedName}`,
        shortName: selectedName.replace(/^(Club Rotario |Rotary Club |Rotary )/i, '')
      }));
    }
  };

  // Guardar borrador manual
  const handleSaveDraft = async () => {
    try {
      const token = formData.draftToken || `draft_${Date.now()}`;
      const res = await fetch(`${API}/district-clubs/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftToken: token, payload: formData })
      });
      const data = await res.json();
      if (data.ok) {
        setFormData(prev => ({ ...prev, draftToken: data.draftToken }));
        localStorage.setItem('district_club_form_draft_token', data.draftToken);
        toast.success('Borrador guardado correctamente. Puedes reanudar en cualquier momento.');
      }
    } catch {
      toast.error('No se pudo guardar el borrador.');
    }
  };

  // Subir imagen a través del servicio de presign S3
  const handleFileUpload = async (file: File, target: 'logo' | 'cover' | 'gallery') => {
    try {
      if (target === 'logo') setUploadingLogo(true);
      if (target === 'cover') setUploadingCover(true);
      if (target === 'gallery') setUploadingGallery(true);

      const presignRes = await fetch(`${API}/rotary-en-accion/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          prefix: 'directorio-clubes'
        })
      });

      if (!presignRes.ok) throw new Error('Error al preparar subida');
      const presignData = await presignRes.json();

      let finalUrl = presignData.publicUrl || presignData.url;

      if (presignData.uploadUrl) {
        const uploadRes = await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        });
        if (!uploadRes.ok) throw new Error('Fallo al subir a almacenamiento seguro');
      }

      if (target === 'logo') {
        setFormData(prev => ({ ...prev, logoUrl: finalUrl }));
        toast.success('Logotipo cargado exitosamente');
      } else if (target === 'cover') {
        setFormData(prev => ({ ...prev, coverImageUrl: finalUrl }));
        toast.success('Imagen de portada cargada exitosamente');
      } else if (target === 'gallery') {
        setFormData(prev => ({
          ...prev,
          gallery: [...prev.gallery, { url: finalUrl, isMain: prev.gallery.length === 0 }]
        }));
        toast.success('Fotografía agregada a la galería');
      }
    } catch (err: any) {
      console.error(err);
      toast.error('No se pudo cargar la imagen. Intenta con un archivo JPG o PNG de menor tamaño.');
    } finally {
      setUploadingLogo(false);
      setUploadingCover(false);
      setUploadingGallery(false);
    }
  };

  // Validaciones antes de avanzar paso
  const validateStep = (step: number): boolean => {
    if (step === 0) {
      if (!formData.officialName.trim()) {
        toast.error('Por favor escribe o selecciona el nombre del club.');
        return false;
      }
      if (!formData.city.trim()) {
        toast.error('Por favor indica la ciudad sede del club.');
        return false;
      }
    }
    if (step === 1) {
      if (!formData.description.trim()) {
        toast.error('Por favor ingresa una breve descripción o propósito institucional.');
        return false;
      }
    }
    if (step === 2) {
      if (!formData.currentPresident.trim()) {
        toast.error('Por favor indica el nombre del presidente actual del club.');
        return false;
      }
    }
    if (step === 5) {
      if (!formData.contactEmail.trim() && !formData.contactPhone.trim()) {
        toast.error('Por favor ingresa al menos un canal de contacto autorizado (correo o teléfono).');
        return false;
      }
    }
    if (step === 6) {
      if (!formData.applicantName.trim() || !formData.applicantEmail.trim()) {
        toast.error('Por favor ingresa tu nombre y correo como persona responsable de la solicitud.');
        return false;
      }
      if (!formData.dataConsent) {
        toast.error('Debes confirmar la autorización para publicar la información institucional.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(PASOS.length - 1, prev + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Enviar formulario final
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(6)) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/district-clubs/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Error al enviar la solicitud');
      }

      setSubmitResult({
        trackingNumber: data.trackingNumber,
        submissionId: data.submissionId
      });
      localStorage.removeItem('district_club_form_draft_token');
      toast.success('¡Solicitud enviada exitosamente!');
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar la solicitud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // PANTALLA DE CARGA INICIAL
  if (loadingConfig) {
    return (
      <PublicFormCard className="text-center py-20 px-6">
        <Loader2 className="w-10 h-10 text-rotary-blue animate-spin mx-auto mb-4" />
        <h3 className="text-base font-bold text-gray-700">Cargando catálogo oficial de clubes...</h3>
        <p className="text-xs text-gray-400 mt-1">Conectando con el Distrito 4281</p>
      </PublicFormCard>
    );
  }

  // PANTALLA DE ÉXITO
  if (submitResult) {
    return (
      <PublicFormCard className="text-center py-12 px-6">
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-100">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <span className="inline-block px-3 py-1 bg-rotary-blue/10 text-rotary-blue text-xs font-bold rounded-full mb-3 uppercase tracking-wider">
          Solicitud Registrada
        </span>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">
          ¡Información Recibida con Éxito!
        </h2>
        <p className="text-gray-600 max-w-lg mx-auto mb-6 text-sm leading-relaxed">
          Hemos recibido la solicitud de actualización para <strong>{formData.officialName}</strong>. El equipo distrital revisará los datos e imágenes para publicar el perfil en el Directorio Distrital Oficial.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 max-w-md mx-auto mb-8 text-left">
          <p className="text-xs text-gray-500 uppercase font-black tracking-wider mb-1">Número de Seguimiento</p>
          <p className="text-2xl font-mono font-bold text-rotary-blue tracking-wider">{submitResult.trackingNumber}</p>
          <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-600 space-y-1">
            <p><strong>Club:</strong> {formData.officialName}</p>
            <p><strong>Distrito:</strong> Distrito {formData.districtNumber}</p>
            <p><strong>Contacto notificado:</strong> {formData.applicantEmail}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/clubes"
            className="w-full sm:w-auto px-6 py-3 bg-rotary-blue hover:bg-blue-900 text-white font-bold rounded-xl shadow-md transition-all text-sm"
          >
            Ir al Directorio de Clubes
          </Link>
          <button
            onClick={() => {
              setSubmitResult(null);
              setFormData(INITIAL_FORM);
              setCurrentStep(0);
            }}
            className="w-full sm:w-auto px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all text-sm"
          >
            Registrar Otro Club
          </button>
        </div>
      </PublicFormCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de progreso interactiva */}
      <PublicStepNav
        steps={PASOS}
        currentStep={currentStep}
        onStepClick={(i) => {
          if (i < currentStep) setCurrentStep(i);
        }}
      />

      <form onSubmit={handleSubmit}>
        <PublicFormCard className="p-6 sm:p-10">

          {/* ════════════════════════════════════════════════════════════════
              PASO 1: IDENTIFICACIÓN DEL CLUB
             ════════════════════════════════════════════════════════════════ */}
          {currentStep === 0 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-gray-100 pb-4">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Paso 1 de 7</span>
                <h3 className="text-2xl font-extrabold text-gray-900 mt-1">Identificación del Club</h3>
                <p className="text-sm text-gray-500">Selecciona o escribe los datos oficiales del club en el Distrito 4281.</p>
              </div>

              {/* Selector de Tipo de Club (Rotary, Rotaract, Interact) */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                  Tipo de Club <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'rotary', label: 'Rotary', desc: 'Club Rotario', color: 'border-rotary-blue bg-blue-50/50 text-rotary-blue' },
                    { id: 'rotaract', label: 'Rotaract', desc: 'Jóvenes Líderes (18+)', color: 'border-[#D91B5C] bg-pink-50/50 text-[#D91B5C]' },
                    { id: 'interact', label: 'Interact', desc: 'Jóvenes (12 a 18 años)', color: 'border-[#005DAA] bg-sky-50/50 text-[#005DAA]' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, organizationType: t.id as any })}
                      className={`p-3.5 sm:p-4 rounded-2xl border-2 text-left transition-all ${
                        formData.organizationType === t.id
                          ? `${t.color} font-black shadow-sm`
                          : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <span className="block text-sm sm:text-base font-bold">{t.label}</span>
                      <span className="block text-[11px] text-gray-500 font-normal">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector inteligente desde el Catálogo Oficial */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Seleccionar Club del Catálogo Oficial Distrito 4281
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Si tu club ya está registrado en el directorio distrital, selecciónalo para cargar su ficha automáticamente.
                </p>
                <select
                  aria-label="Seleccionar Club del Catálogo Oficial Distrito 4281"
                  value={formData.shortName}
                  onChange={(e) => handleSelectOfficialClub(e.target.value)}
                  className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                >
                  <option value="">-- Elige tu club de la lista oficial (o escribe abajo) --</option>
                  {catalogClubs.map(c => (
                    <option key={c.name} value={c.name}>{c.display} ({c.name})</option>
                  ))}
                </select>
              </div>

              {/* Nombre oficial y Nombre corto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Nombre Oficial del Club <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Club Rotario Tuluá"
                    value={formData.officialName}
                    onChange={(e) => setFormData({ ...formData, officialName: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Nombre Corto / Ciudad Sede
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Tuluá"
                    value={formData.shortName}
                    onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              {/* Ubicación Geográfica */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Ciudad / Municipio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Tuluá, Cali, Bogotá, Pasto..."
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Departamento
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Valle del Cauca, Cundinamarca..."
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              {/* Aviso de tipo de solicitud */}
              <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-rotary-blue shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 leading-relaxed">
                  <strong>Directorio Centralizado Distrito 4281:</strong> Si tu club ya cuenta con un perfil, esta solicitud creará una versión de actualización que será revisada por el administrador distrital antes de su publicación automática.
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              PASO 2: IDENTIDAD INSTITUCIONAL
             ════════════════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-gray-100 pb-4">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Paso 2 de 7</span>
                <h3 className="text-2xl font-extrabold text-gray-900 mt-1">Identidad Institucional</h3>
                <p className="text-sm text-gray-500">Historia, propósito y elementos visuales del club.</p>
              </div>

              {/* Año de fundación y Lema */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Año o Fecha de Fundación
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 1954"
                    value={formData.foundationYear}
                    onChange={(e) => setFormData({ ...formData, foundationYear: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Lema o Eslogan Institucional
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Servir para Cambiar Vidas"
                    value={formData.motto}
                    onChange={(e) => setFormData({ ...formData, motto: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              {/* Descripción breve */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                  Descripción Institucional Breve <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Resumen del club, su vocación de servicio y presencia comunitaria..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm outline-none focus:border-rotary-blue resize-none"
                />
              </div>

              {/* Historia del club */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                  Historia del Club
                </label>
                <textarea
                  rows={4}
                  placeholder="Hitos, año de carta constitutiva, proyectos fundacionales y legado..."
                  value={formData.history}
                  onChange={(e) => setFormData({ ...formData, history: e.target.value })}
                  className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm outline-none focus:border-rotary-blue resize-none"
                />
              </div>

              {/* Áreas de servicio prioritarias */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                  Áreas de Enfoque y Servicio
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AREAS_DE_INTERES.map(area => {
                    const isSelected = formData.serviceAreas.includes(area);
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setFormData({ ...formData, serviceAreas: formData.serviceAreas.filter(a => a !== area) });
                          } else {
                            setFormData({ ...formData, serviceAreas: [...formData.serviceAreas, area] });
                          }
                        }}
                        className={`p-2.5 px-3 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition-all ${
                          isSelected ? 'bg-blue-50 border-rotary-blue text-rotary-blue' : 'bg-gray-50/60 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span>{area}</span>
                        {isSelected && <Check className="w-4 h-4 text-rotary-blue" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Carga de Logotipo y Portada */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                {/* Logo */}
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Logotipo Oficial del Club
                  </label>
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center hover:border-rotary-blue transition-colors">
                    {formData.logoUrl ? (
                      <div className="relative inline-block">
                        <img src={formData.logoUrl} alt="Logo preview" className="h-20 w-auto max-w-full object-contain mx-auto" />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, logoUrl: '' })}
                          className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full text-xs shadow-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-xs text-gray-500 mb-2">PNG transparente recomendado</p>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs cursor-pointer">
                          {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          <span>{uploadingLogo ? 'Subiendo...' : 'Subir Logotipo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'logo')}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Portada */}
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Imagen de Portada (Hero)
                  </label>
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center hover:border-rotary-blue transition-colors">
                    {formData.coverImageUrl ? (
                      <div className="relative inline-block w-full">
                        <img src={formData.coverImageUrl} alt="Portada preview" className="h-20 w-full object-cover rounded-lg mx-auto" />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, coverImageUrl: '' })}
                          className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full text-xs shadow-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-xs text-gray-500 mb-2">Fotografía panorámica del club (1600x600 px)</p>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs cursor-pointer">
                          {uploadingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          <span>{uploadingCover ? 'Subiendo...' : 'Subir Portada'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'cover')}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              PASO 3: LIDERAZGO Y MEMBRESÍA
             ════════════════════════════════════════════════════════════════ */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-gray-100 pb-4">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Paso 3 de 7</span>
                <h3 className="text-2xl font-extrabold text-gray-900 mt-1">Liderazgo y Membresía</h3>
                <p className="text-sm text-gray-500">Presidente actual, período rotario y miembros directivos autorizados.</p>
              </div>

              {/* Presidente y Período */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Presidente(a) en Ejercicio <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nombre completo del presidente"
                    value={formData.currentPresident}
                    onChange={(e) => setFormData({ ...formData, currentPresident: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Período Rotario
                  </label>
                  <input
                    type="text"
                    value={formData.rotaryPeriod}
                    onChange={(e) => setFormData({ ...formData, rotaryPeriod: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              {/* Número de Socios y Programas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Número de Socios Activos (Opcional)
                  </label>
                  <input
                    type="number"
                    placeholder="Ej. 28"
                    value={formData.memberCount}
                    onChange={(e) => setFormData({ ...formData, memberCount: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Programas Juveniles Patrocinados
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Rotaract Tuluá, Interact Tuluá, RYE..."
                    value={formData.youthPrograms}
                    onChange={(e) => setFormData({ ...formData, youthPrograms: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              {/* Oportunidad de Vinculación */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                  Información para Nuevos Socios / Voluntarios
                </label>
                <textarea
                  rows={3}
                  placeholder="¿Cómo puede una persona interesada acercarse y vincularse a las actividades del club?"
                  value={formData.joinInfo}
                  onChange={(e) => setFormData({ ...formData, joinInfo: e.target.value })}
                  className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm outline-none focus:border-rotary-blue resize-none"
                />
              </div>

              {/* Junta Directiva Dinámica */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider">
                    Junta Directiva (Opcional)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        boardMembers: [
                          ...formData.boardMembers,
                          { id: Date.now().toString(), name: '', role: 'Secretario(a)' }
                        ]
                      });
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-rotary-blue hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar Miembro
                  </button>
                </div>

                {formData.boardMembers.map((member, idx) => (
                  <div key={member.id} className="flex items-center gap-2 mb-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                    <input
                      type="text"
                      placeholder="Nombre del directivo"
                      value={member.name}
                      onChange={(e) => {
                        const updated = [...formData.boardMembers];
                        updated[idx].name = e.target.value;
                        setFormData({ ...formData, boardMembers: updated });
                      }}
                      className="flex-1 p-2 bg-white rounded-lg border border-gray-200 text-xs font-bold outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Cargo (ej. Tesorero, Imagen Pública...)"
                      value={member.role}
                      onChange={(e) => {
                        const updated = [...formData.boardMembers];
                        updated[idx].role = e.target.value;
                        setFormData({ ...formData, boardMembers: updated });
                      }}
                      className="w-1/3 p-2 bg-white rounded-lg border border-gray-200 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          boardMembers: formData.boardMembers.filter((_, i) => i !== idx)
                        });
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              PASO 4: PROYECTOS Y ACTIVIDADES
             ════════════════════════════════════════════════════════════════ */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-gray-100 pb-4">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Paso 4 de 7</span>
                <h3 className="text-2xl font-extrabold text-gray-900 mt-1">Proyectos y Actividades</h3>
                <p className="text-sm text-gray-500">Iniciativas de servicio, programas comunitarios y logros destacados.</p>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-gray-700 uppercase tracking-wider">
                  Iniciativas Destacadas del Club
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      featuredProjects: [
                        ...formData.featuredProjects,
                        { id: Date.now().toString(), title: '', description: '', impact: '' }
                      ]
                    });
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rotary-blue hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Proyecto
                </button>
              </div>

              {formData.featuredProjects.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
                  <Heart className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-500 mb-3">No has registrado proyectos destacados todavía.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        featuredProjects: [{ id: Date.now().toString(), title: '', description: '', impact: '' }]
                      });
                    }}
                    className="px-4 py-2 bg-rotary-blue text-white rounded-xl text-xs font-bold"
                  >
                    Agregar Primer Proyecto
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.featuredProjects.map((proj, idx) => (
                    <div key={proj.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-rotary-blue uppercase">Proyecto #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              featuredProjects: formData.featuredProjects.filter((_, i) => i !== idx)
                            });
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Título del proyecto (ej. Banco de Sillas de Ruedas)"
                          value={proj.title}
                          onChange={(e) => {
                            const updated = [...formData.featuredProjects];
                            updated[idx].title = e.target.value;
                            setFormData({ ...formData, featuredProjects: updated });
                          }}
                          className="p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none"
                        />
                        <input
                          type="text"
                          placeholder="Impacto / Beneficiarios (ej. +500 familias beneficiadas)"
                          value={proj.impact}
                          onChange={(e) => {
                            const updated = [...formData.featuredProjects];
                            updated[idx].impact = e.target.value;
                            setFormData({ ...formData, featuredProjects: updated });
                          }}
                          className="p-2.5 bg-white border border-gray-200 rounded-xl text-xs outline-none"
                        />
                      </div>

                      <textarea
                        rows={2}
                        placeholder="Breve resumen del objetivo, desarrollo y causas atendidas..."
                        value={proj.description}
                        onChange={(e) => {
                          const updated = [...formData.featuredProjects];
                          updated[idx].description = e.target.value;
                          setFormData({ ...formData, featuredProjects: updated });
                        }}
                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs outline-none resize-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              PASO 5: GALERÍA MULTIMEDIA
             ════════════════════════════════════════════════════════════════ */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-gray-100 pb-4">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Paso 5 de 7</span>
                <h3 className="text-2xl font-extrabold text-gray-900 mt-1">Galería Multimedia</h3>
                <p className="text-sm text-gray-500">Fotografías institucionales de actividades y enlaces de video.</p>
              </div>

              {/* Carga múltiple de fotos */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                  Fotografías Institucionales
                </label>
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-rotary-blue transition-colors mb-4">
                  <Camera className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-600 font-bold mb-1">Carga fotografías de servicio y compañerismo</p>
                  <p className="text-[11px] text-gray-400 mb-4">Formatos admitidos: JPG, PNG, WEBP (Hasta 10 MB cada una)</p>
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-rotary-blue hover:bg-blue-900 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm">
                    {uploadingGallery ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>{uploadingGallery ? 'Cargando imagen...' : 'Seleccionar Fotografía'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'gallery')}
                    />
                  </label>
                </div>

                {/* Grid de miniaturas cargadas */}
                {formData.gallery.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {formData.gallery.map((item, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200 aspect-video bg-black">
                        <img src={item.url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              gallery: formData.gallery.filter((_, i) => i !== idx)
                            });
                          }}
                          className="absolute top-1.5 right-1.5 p-1 bg-red-600/90 text-white rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Enlaces de video (YouTube / Vimeo) */}
              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                  Enlaces de Video (YouTube, Vimeo o institucional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    id="new-video-url-input"
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="flex-1 p-3 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-xs outline-none focus:border-rotary-blue"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('new-video-url-input') as HTMLInputElement;
                      if (input && input.value.trim()) {
                        setFormData({
                          ...formData,
                          videoLinks: [...formData.videoLinks, input.value.trim()]
                        });
                        input.value = '';
                      }
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl text-xs"
                  >
                    Agregar Enlace
                  </button>
                </div>

                {formData.videoLinks.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {formData.videoLinks.map((v, i) => (
                      <li key={i} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded-lg border border-gray-200">
                        <span className="truncate">{v}</span>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, videoLinks: formData.videoLinks.filter((_, idx) => idx !== i) })}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              PASO 6: CONTACTO Y UBICACIÓN
             ════════════════════════════════════════════════════════════════ */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-gray-100 pb-4">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Paso 6 de 7</span>
                <h3 className="text-2xl font-extrabold text-gray-900 mt-1">Contacto y Reuniones</h3>
                <p className="text-sm text-gray-500">Canales oficiales de comunicación y lugar habitual de sesión.</p>
              </div>

              {/* Sede y Horarios */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Lugar Habitual de Reunión
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Hotel Dann Carlton / Sede Campestre"
                    value={formData.meetingAddress}
                    onChange={(e) => setFormData({ ...formData, meetingAddress: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Día y Hora de Sesión
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Martes 7:00 PM (Semanal)"
                    value={formData.meetingSchedule}
                    onChange={(e) => setFormData({ ...formData, meetingSchedule: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              {/* Canales Oficiales: Correo y Teléfono */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Correo Electrónico Institucional
                  </label>
                  <input
                    type="email"
                    placeholder="contacto@clubrotarioejemplo.org"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Teléfono / WhatsApp Autorizado
                  </label>
                  <div className="flex gap-2">
                    <span className="h-full py-3.5 px-3 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 flex items-center gap-1">
                      {flagEmoji(formData.contactCountryCode)} +57
                    </span>
                    <input
                      type="tel"
                      placeholder="310 123 4567"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      className="flex-1 p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                    />
                  </div>
                </div>
              </div>

              {/* Sitio web y Redes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Sitio Web Oficial
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={formData.websiteUrl}
                    onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Instagram Oficial
                  </label>
                  <input
                    type="text"
                    placeholder="@rotarytulua"
                    value={formData.socialMedia.instagram || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      socialMedia: { ...formData.socialMedia, instagram: e.target.value }
                    })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Página de Facebook
                  </label>
                  <input
                    type="url"
                    placeholder="https://facebook.com/..."
                    value={formData.socialMedia.facebook || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      socialMedia: { ...formData.socialMedia, facebook: e.target.value }
                    })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                    Canal de YouTube / TikTok
                  </label>
                  <input
                    type="text"
                    placeholder="https://youtube.com/..."
                    value={formData.socialMedia.youtube || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      socialMedia: { ...formData.socialMedia, youtube: e.target.value }
                    })}
                    className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              PASO 7: REVISIÓN Y ENVÍO
             ════════════════════════════════════════════════════════════════ */}
          {currentStep === 6 && (
            <div className="space-y-6 animate-fade-in">
              <div className="border-b border-gray-100 pb-4">
                <span className="text-xs font-black text-rotary-blue uppercase tracking-widest">Paso 7 de 7</span>
                <h3 className="text-2xl font-extrabold text-gray-900 mt-1">Revisión y Autorización</h3>
                <p className="text-sm text-gray-500">Verifica la información antes de remitirla al equipo distrital.</p>
              </div>

              {/* Ficha Resumen */}
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 space-y-3 text-xs text-gray-700">
                <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                  <div>
                    <span className="inline-block px-2 py-0.5 bg-rotary-blue text-white rounded text-[10px] font-black uppercase tracking-wider mr-2">
                      {formData.organizationType}
                    </span>
                    <strong className="text-sm text-gray-900">{formData.officialName}</strong>
                  </div>
                  <span className="text-gray-500 font-bold">{formData.city}, {formData.state || 'Distrito 4281'}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <p><strong>Presidente:</strong> {formData.currentPresident} ({formData.rotaryPeriod})</p>
                  <p><strong>Fundación:</strong> {formData.foundationYear || 'No indicada'}</p>
                  <p><strong>Reuniones:</strong> {formData.meetingSchedule || 'No indicada'} ({formData.meetingAddress || 'Por definir'})</p>
                  <p><strong>Contacto:</strong> {formData.contactEmail || formData.contactPhone || 'No indicado'}</p>
                </div>

                {formData.description && (
                  <p className="pt-2 border-t border-gray-200 italic text-gray-600 line-clamp-2">
                    "{formData.description}"
                  </p>
                )}
              </div>

              {/* Datos de quien solicita la actualización */}
              <div className="border-t border-gray-100 pt-4 space-y-4">
                <h4 className="text-sm font-black text-gray-800 uppercase tracking-wider">
                  Persona Responsable de la Solicitud
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                      Tu Nombre Completo <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Juan Pérez"
                      value={formData.applicantName}
                      onChange={(e) => setFormData({ ...formData, applicantName: e.target.value })}
                      className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                      Correo Electrónico de Contacto <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="tu_correo@gmail.com"
                      value={formData.applicantEmail}
                      onChange={(e) => setFormData({ ...formData, applicantEmail: e.target.value })}
                      className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                      Teléfono de Contacto
                    </label>
                    <input
                      type="tel"
                      placeholder="Ej. 312 456 7890"
                      value={formData.applicantPhone}
                      onChange={(e) => setFormData({ ...formData, applicantPhone: e.target.value })}
                      className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-2">
                      Cargo o Rol en el Club
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Presidente, Secretario, Comité Imagen Pública..."
                      value={formData.applicantRole}
                      onChange={(e) => setFormData({ ...formData, applicantRole: e.target.value })}
                      className="w-full p-3.5 rounded-xl border-2 border-gray-100 bg-gray-50/60 text-sm font-semibold outline-none focus:border-rotary-blue"
                    />
                  </div>
                </div>
              </div>

              {/* Declaración de Privacidad y Consentimiento */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.dataConsent}
                    onChange={(e) => setFormData({ ...formData, dataConsent: e.target.checked })}
                    className="w-5 h-5 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue mt-0.5"
                  />
                  <span className="text-xs text-gray-600 leading-snug">
                    Declaro que la información y fotografías suministradas corresponden a las actividades y miembros autorizados de <strong>{formData.officialName || 'mi club'}</strong>, y autorizo a Rotary Distrito 4281 a revisarlas y publicarlas en el Directorio Distrital Oficial en internet.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* BOTONERA DE NAVEGACIÓN INFERIOR */}
          <div className="border-t border-gray-100 pt-6 mt-8 flex items-center justify-between gap-4">
            <div>
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold transition-all"
                >
                  <ArrowLeft className="w-4 h-4" /> Anterior
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold transition-all"
              >
                <Save className="w-4 h-4 text-gray-400" /> Guardar Borrador
              </button>

              {currentStep < PASOS.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white text-xs font-bold shadow-md transition-all"
                >
                  Continuar <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white text-sm font-black shadow-lg transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Enviar Solicitud Oficial
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

        </PublicFormCard>
      </form>
    </div>
  );
};

export default UnifiedClubForm;
