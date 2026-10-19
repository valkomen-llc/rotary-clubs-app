// ════════════════════════════════════════════════════════════════════════════
// Portal de Autogestión del Club — Club Platform & Rotary Distrito 4281
// Espacio privado para que los responsables y juntas directivas de clubes
// Rotary, Rotaract e Interact administren su perfil institucional en tiempo real.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2, Sparkles, CheckCircle2, AlertTriangle, ShieldCheck,
  Save, Eye, LogOut, ArrowRight, Upload, Plus, Trash2, Globe,
  Mail, Phone, MapPin, Calendar, Users, Award, Camera, Info,
  Lock, RefreshCw, Check, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

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
}

interface ProjectItem {
  id: string;
  title: string;
  description: string;
  impact?: string;
  year?: string;
  linkUrl?: string;
}

export const ClubPortalPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user: platformUser, token: platformToken } = useAuth();

  const [portalToken, setPortalToken] = useState<string | null>(
    localStorage.getItem('rotary_club_portal_token')
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  // Modo de Autenticación si no hay sesión activa
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authSelectedClub, setAuthSelectedClub] = useState('');
  const [catalogClubs, setCatalogClubs] = useState<any[]>([]);
  const [authLoading, setAuthLoading] = useState(false);

  // Pestaña activa del portal de autogestión
  const [activeTab, setActiveTab] = useState<'identidad' | 'liderazgo' | 'proyectos' | 'multimedia' | 'contacto'>('identidad');

  // Formulario local editable
  const [formData, setFormData] = useState<any>({});
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // 1. Cargar catálogo distrital para el registro
  useEffect(() => {
    fetch(`${API}/district-clubs/config?district=4281`)
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.officialCatalog) {
          setCatalogClubs(data.officialCatalog);
        }
      })
      .catch(() => {});
  }, []);

  // 2. Intentar puente automático si el usuario ya está autenticado en Club Platform
  useEffect(() => {
    const tryPlatformLink = async () => {
      const activePlatformTok = platformToken || localStorage.getItem('token');
      if (!portalToken && activePlatformTok) {
        try {
          const res = await fetch(`${API}/district-clubs/portal/link`, {
            headers: { Authorization: `Bearer ${activePlatformTok}` }
          });
          const data = await res.json();
          if (data.hasClub && data.token) {
            localStorage.setItem('rotary_club_portal_token', data.token);
            setPortalToken(data.token);
            toast.success('Sesión iniciada automáticamente con tu cuenta de Club Platform.');
          }
        } catch {
          // Noop
        }
      }
    };
    tryPlatformLink();
  }, [platformToken, portalToken]);

  // 3. Cargar datos del club autenticado
  const loadPortalData = async (tok: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/district-clubs/portal/me`, {
        headers: { Authorization: `Bearer ${tok}` }
      });
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('rotary_club_portal_token');
          setPortalToken(null);
          toast.error('Tu sesión en el portal ha expirado. Por favor inicia sesión nuevamente.');
        }
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setAccount(data.account);
        setProfile(data.profile);
        setFormData({
          officialName: data.profile?.officialName || '',
          shortName: data.profile?.shortName || '',
          organizationType: data.profile?.organizationType || 'rotary',
          districtNumber: data.profile?.districtNumber || 4281,
          city: data.profile?.city || '',
          state: data.profile?.state || '',
          foundationYear: data.profile?.foundationYear || '',
          motto: data.profile?.motto || '',
          description: data.profile?.description || '',
          history: data.profile?.history || '',
          mission: data.profile?.mission || '',
          vision: data.profile?.vision || '',
          serviceAreas: Array.isArray(data.profile?.serviceAreas) ? data.profile.serviceAreas : [],
          currentPresident: data.profile?.currentPresident || '',
          rotaryPeriod: data.profile?.rotaryPeriod || '2026–2027',
          boardMembers: Array.isArray(data.profile?.boardMembers) ? data.profile.boardMembers : [],
          memberCount: data.profile?.memberCount || '',
          joinInfo: data.profile?.joinInfo || '',
          featuredProjects: Array.isArray(data.profile?.featuredProjects) ? data.profile.featuredProjects : [],
          logoUrl: data.profile?.logoUrl || '',
          coverImageUrl: data.profile?.coverImageUrl || '',
          gallery: Array.isArray(data.profile?.gallery) ? data.profile.gallery : [],
          meetingAddress: data.profile?.meetingAddress || '',
          meetingSchedule: data.profile?.meetingSchedule || '',
          meetingCity: data.profile?.meetingCity || data.profile?.city || '',
          contactEmail: data.profile?.contactEmail || '',
          contactPhone: data.profile?.contactPhone || '',
          websiteUrl: data.profile?.websiteUrl || '',
          socialMedia: data.profile?.socialMedia || {}
        });
      }
    } catch (e: any) {
      console.warn('Error al cargar portal:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (portalToken) {
      loadPortalData(portalToken);
    } else {
      setLoading(false);
    }
  }, [portalToken]);

  // Acciones de Login / Registro
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const res = await fetch(`${API}/district-clubs/portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword, remember: true })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Credenciales inválidas');

      localStorage.setItem('rotary_club_portal_token', data.token);
      setPortalToken(data.token);
      toast.success('Bienvenido al portal de autogestión de tu club.');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo iniciar sesión');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authSelectedClub) {
      toast.error('Por favor selecciona tu club del listado oficial.');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch(`${API}/district-clubs/portal/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          fullName: authFullName,
          phone: authPhone,
          clubName: authSelectedClub
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al crear cuenta');

      localStorage.setItem('rotary_club_portal_token', data.token);
      setPortalToken(data.token);
      toast.success('¡Cuenta creada y vinculada exitosamente!');
    } catch (err: any) {
      toast.error(err.message || 'Error al registrarte');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const res = await fetch(`${API}/district-clubs/portal/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail })
      });
      const data = await res.json();
      toast.info(data.message || 'Instrucciones enviadas a tu correo');
      setAuthMode('login');
    } catch {
      toast.error('No se pudo procesar la solicitud');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('rotary_club_portal_token');
    setPortalToken(null);
    setAccount(null);
    setProfile(null);
    toast.info('Sesión cerrada correctamente');
  };

  // Subir imagen con servicio de presign
  const handleUploadImage = async (file: File, target: 'logo' | 'cover') => {
    try {
      if (target === 'logo') setUploadingLogo(true);
      if (target === 'cover') setUploadingCover(true);

      const presignRes = await fetch(`${API}/rotary-en-accion/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          prefix: 'directorio-clubes'
        })
      });
      const presignData = await presignRes.json();
      const finalUrl = presignData.publicUrl || presignData.url;

      if (presignData.uploadUrl) {
        await fetch(presignData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        });
      }

      if (target === 'logo') {
        setFormData((prev: any) => ({ ...prev, logoUrl: finalUrl }));
        toast.success('Logotipo cargado exitosamente.');
      } else {
        setFormData((prev: any) => ({ ...prev, coverImageUrl: finalUrl }));
        toast.success('Imagen de portada cargada exitosamente.');
      }
    } catch {
      toast.error('No se pudo subir la imagen.');
    } finally {
      setUploadingLogo(false);
      setUploadingCover(false);
    }
  };

  // Guardar y Publicar Actualizaciones
  const handleSaveProfile = async () => {
    if (!portalToken) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/district-clubs/portal/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${portalToken}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar');

      setProfile(data.profile);
      if (data.hasProtectedChanges) {
        toast.warning(data.message);
      } else {
        toast.success(data.message || 'Perfil institucional actualizado y publicado en el directorio.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  // Cálculo visual de completitud y campos pendientes
  const { pct, pendingItems } = useMemo(() => {
    if (!formData) return { pct: 0, pendingItems: [] };
    const items: string[] = [];
    if (!formData.description || formData.description.length < 20) items.push('Descripción detallada del club');
    if (!formData.history || formData.history.length < 20) items.push('Reseña histórica y trayectoria');
    if (!formData.currentPresident) items.push('Presidente del período rotario actual');
    if (!formData.logoUrl) items.push('Logotipo institucional oficial');
    if (!formData.coverImageUrl) items.push('Fotografía de portada comunitaria');
    if (!formData.boardMembers || formData.boardMembers.length === 0) items.push('Junta directiva del club');
    if (!formData.featuredProjects || formData.featuredProjects.length === 0) items.push('Proyectos e iniciativas de impacto');
    if (!formData.meetingSchedule || !formData.meetingAddress) items.push('Lugar y horario de reuniones');
    if (!formData.contactEmail && !formData.contactPhone) items.push('Canal de contacto autorizado');

    const completion = profile?.completionPercentage || 0;
    return { pct: completion, pendingItems: items };
  }, [formData, profile]);

  // ── PANTALLA DE AUTENTICACIÓN (SI NO ESTÁ LOGUEADO) ───────────────────────
  if (!portalToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <Link to="/clubes" className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-rotary-blue mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver al Directorio de Clubes
          </Link>
          <div className="w-14 h-14 rounded-2xl bg-rotary-blue text-white flex items-center justify-center mx-auto shadow-md">
            <Building2 className="w-7 h-7" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">
            Portal de Autogestión
          </h2>
          <p className="mt-1.5 text-xs text-gray-500 max-w-sm mx-auto">
            Actualiza la información institucional, directiva y proyectos de tu club en el Directorio Distrital Oficial.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl shadow-xs border border-gray-100">
            {/* Pestañas Login vs Register */}
            <div className="flex border-b border-gray-100 pb-3 mb-6 gap-2">
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  authMode === 'login' ? 'bg-rotary-blue text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Iniciar Sesión
              </button>
              <button
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  authMode === 'register' ? 'bg-rotary-blue text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                Crear Cuenta
              </button>
            </div>

            {/* Formulario de Login */}
            {authMode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="socio@club.org"
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setAuthMode('forgot')}
                    className="text-rotary-blue font-bold hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3 px-4 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all"
                >
                  {authLoading ? 'Verificando...' : 'Entrar al Portal'}
                </button>
              </form>
            )}

            {/* Formulario de Registro */}
            {authMode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Seleccionar Club (Distrito 4281)
                  </label>
                  <select
                    required
                    value={authSelectedClub}
                    onChange={(e) => setAuthSelectedClub(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-bold outline-none focus:border-rotary-blue bg-white"
                  >
                    <option value="">-- Elige tu club --</option>
                    {catalogClubs.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    required
                    value={authFullName}
                    onChange={(e) => setAuthFullName(e.target.value)}
                    placeholder="Ej. Carlos Morales"
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Contraseña (mínimo 8 caracteres)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all"
                >
                  {authLoading ? 'Creando cuenta...' : 'Crear Cuenta y Gestionar Club'}
                </button>
              </form>
            )}

            {/* Recuperar Contraseña */}
            {authMode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-xs text-gray-500">
                  Ingresa tu correo electrónico registrado y te enviaremos las instrucciones de recuperación.
                </p>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3 px-4 rounded-xl bg-rotary-blue hover:bg-blue-900 text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all"
                >
                  {authLoading ? 'Enviando...' : 'Enviar Enlace de Recuperación'}
                </button>
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    className="text-xs text-gray-500 hover:text-gray-800 font-bold"
                  >
                    Volver a Iniciar Sesión
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── PANTALLA PRINCIPAL DEL PORTAL DE AUTOGESTIÓN ──────────────────────────
  const profileUrl = profile ? `/clubes/${profile.organizationType}/${profile.slug}` : '/clubes';

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-gray-900">
      {/* Barra Superior Institucional */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rotary-blue text-white flex items-center justify-center font-black shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-gray-900 leading-tight">
                  {profile?.officialName || account?.clubName || 'Mi Club Rotario'}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rotary-blue/10 text-rotary-blue">
                  Distrito {profile?.districtNumber || 4281}
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Portal de Autogestión Institucional · Responsable: {account?.fullName || account?.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={profileUrl}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold transition-all"
            >
              <Eye className="w-3.5 h-3.5" /> Ver Perfil Público
            </Link>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs transition-all"
            >
              <Save className="w-3.5 h-3.5" /> {saving ? 'Guardando...' : 'Publicar Cambios'}
            </button>
            <button
              onClick={handleLogout}
              title="Cerrar Sesión"
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Tarjeta de Completitud del Perfil (%) */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-rotary-blue bg-blue-50 px-2.5 py-1 rounded-full">
                Indicador de Calidad de Información
              </span>
              <h2 className="text-xl font-extrabold text-gray-900 mt-1">
                Avance del Perfil Institucional
              </h2>
              <p className="text-xs text-gray-500">
                Los perfiles con más del 80% de avance reciben mayor visibilidad en el directorio distrital y motores de búsqueda.
              </p>
            </div>
            <div className="text-right">
              <span className={`text-3xl font-black font-mono ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                {pct}%
              </span>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completado</p>
            </div>
          </div>

          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {pendingItems.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold text-gray-700 mb-2">Campos sugeridos para alcanzar el 100%:</p>
              <div className="flex flex-wrap gap-2">
                {pendingItems.map(item => (
                  <span key={item} className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-600 font-medium">
                    + {item}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pestañas de Edición */}
        <div className="flex border-b border-gray-200 gap-2 overflow-x-auto pb-1 text-xs font-black">
          {[
            { id: 'identidad', label: '1. Identidad Institucional', icon: Building2 },
            { id: 'liderazgo', label: '2. Liderazgo y Junta', icon: Users },
            { id: 'proyectos', label: '3. Proyectos y Obras', icon: Award },
            { id: 'multimedia', label: '4. Galería e Imágenes', icon: Camera },
            { id: 'contacto', label: '5. Contacto y Reuniones', icon: MapPin },
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all ${
                  activeTab === t.id
                    ? 'bg-rotary-blue text-white shadow-xs'
                    : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Contenido de Cada Pestaña */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-6">

          {/* TAB 1: IDENTIDAD */}
          {activeTab === 'identidad' && (
            <div className="space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-base font-extrabold text-gray-900">Identidad e Historia</h3>
                <p className="text-xs text-gray-500">Datos públicos y memoria institucional del club.</p>
              </div>

              {/* Aviso de Campo Protegido */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Nombre Oficial del Club (Campo Protegido):</strong> Cualquier cambio en la razón oficial requiere validación de la gobernación distrital. Los demás campos se publican en tiempo real.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Nombre Oficial
                  </label>
                  <input
                    type="text"
                    value={formData.officialName || ''}
                    onChange={(e) => setFormData({ ...formData, officialName: e.target.value })}
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Nombre Corto o Ciudad Sede
                  </label>
                  <input
                    type="text"
                    value={formData.shortName || ''}
                    onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Año de Fundación
                  </label>
                  <input
                    type="number"
                    value={formData.foundationYear || ''}
                    onChange={(e) => setFormData({ ...formData, foundationYear: e.target.value })}
                    placeholder="Ej. 1954"
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Ciudad / Municipio
                  </label>
                  <input
                    type="text"
                    value={formData.city || ''}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Departamento
                  </label>
                  <input
                    type="text"
                    value={formData.state || ''}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Lema o Frase Inspiradora
                </label>
                <input
                  type="text"
                  value={formData.motto || ''}
                  onChange={(e) => setFormData({ ...formData, motto: e.target.value })}
                  placeholder="Ej. Dar de sí antes de pensar en sí"
                  className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Descripción Institucional
                </label>
                <textarea
                  rows={3}
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-rotary-blue"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Historia y Memoria del Club
                </label>
                <textarea
                  rows={4}
                  value={formData.history || ''}
                  onChange={(e) => setFormData({ ...formData, history: e.target.value })}
                  className="w-full p-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:border-rotary-blue"
                />
              </div>
            </div>
          )}

          {/* TAB 2: LIDERAZGO */}
          {activeTab === 'liderazgo' && (
            <div className="space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-base font-extrabold text-gray-900">Junta Directiva y Liderazgo</h3>
                <p className="text-xs text-gray-500">Líderes que conducen el club en el período rotario.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Presidente Actual
                  </label>
                  <input
                    type="text"
                    value={formData.currentPresident || ''}
                    onChange={(e) => setFormData({ ...formData, currentPresident: e.target.value })}
                    placeholder="Nombre del presidente"
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Período Rotario
                  </label>
                  <input
                    type="text"
                    value={formData.rotaryPeriod || '2026–2027'}
                    onChange={(e) => setFormData({ ...formData, rotaryPeriod: e.target.value })}
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              {/* Miembros de Junta Directiva */}
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">
                    Integrantes de la Junta Directiva
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const newMember = { id: `m_${Date.now()}`, name: '', role: '', email: '', phone: '' };
                      setFormData({
                        ...formData,
                        boardMembers: [...(formData.boardMembers || []), newMember]
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rotary-blue/10 text-rotary-blue hover:bg-rotary-blue hover:text-white text-xs font-bold transition-all inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar Miembro
                  </button>
                </div>

                {(formData.boardMembers || []).map((m: BoardMember, idx: number) => (
                  <div key={m.id || idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-gray-50 border border-gray-200 items-center">
                    <input
                      type="text"
                      placeholder="Nombre Completo"
                      value={m.name}
                      onChange={(e) => {
                        const next = [...formData.boardMembers];
                        next[idx].name = e.target.value;
                        setFormData({ ...formData, boardMembers: next });
                      }}
                      className="p-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Cargo (ej. Secretario)"
                      value={m.role}
                      onChange={(e) => {
                        const next = [...formData.boardMembers];
                        next[idx].role = e.target.value;
                        setFormData({ ...formData, boardMembers: next });
                      }}
                      className="p-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold outline-none"
                    />
                    <input
                      type="email"
                      placeholder="Correo Electrónico"
                      value={m.email || ''}
                      onChange={(e) => {
                        const next = [...formData.boardMembers];
                        next[idx].email = e.target.value;
                        setFormData({ ...formData, boardMembers: next });
                      }}
                      className="p-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        placeholder="Teléfono"
                        value={m.phone || ''}
                        onChange={(e) => {
                          const next = [...formData.boardMembers];
                          next[idx].phone = e.target.value;
                          setFormData({ ...formData, boardMembers: next });
                        }}
                        className="p-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold outline-none flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = formData.boardMembers.filter((_: any, i: number) => i !== idx);
                          setFormData({ ...formData, boardMembers: next });
                        }}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: PROYECTOS */}
          {activeTab === 'proyectos' && (
            <div className="space-y-5">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">Proyectos e Iniciativas</h3>
                  <p className="text-xs text-gray-500">Obras destacadas del club que inspiran a la comunidad.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newProj = { id: `p_${Date.now()}`, title: '', description: '', impact: '', year: '2026' };
                    setFormData({
                      ...formData,
                      featuredProjects: [...(formData.featuredProjects || []), newProj]
                    });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-rotary-blue text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Proyecto
                </button>
              </div>

              {(formData.featuredProjects || []).length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-2xl border border-gray-200">
                  <Award className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500 font-bold">No hay proyectos destacados aún.</p>
                  <p className="text-[11px] text-gray-400">Agrega iniciativas para mostrarlas en la ficha pública de tu club.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(formData.featuredProjects || []).map((p: ProjectItem, idx: number) => (
                    <div key={p.id || idx} className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          placeholder="Título del Proyecto"
                          value={p.title}
                          onChange={(e) => {
                            const next = [...formData.featuredProjects];
                            next[idx].title = e.target.value;
                            setFormData({ ...formData, featuredProjects: next });
                          }}
                          className="p-2 rounded-xl border border-gray-200 bg-white text-sm font-bold outline-none flex-1 mr-3"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = formData.featuredProjects.filter((_: any, i: number) => i !== idx);
                            setFormData({ ...formData, featuredProjects: next });
                          }}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <textarea
                        rows={2}
                        placeholder="Descripción y beneficiarios de la iniciativa..."
                        value={p.description}
                        onChange={(e) => {
                          const next = [...formData.featuredProjects];
                          next[idx].description = e.target.value;
                          setFormData({ ...formData, featuredProjects: next });
                        }}
                        className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-xs outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MULTIMEDIA */}
          {activeTab === 'multimedia' && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-base font-extrabold text-gray-900">Multimedia e Identidad Visual</h3>
                <p className="text-xs text-gray-500">Logotipos y fotografías de impacto del club.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Logotipo */}
                <div className="p-5 rounded-2xl border border-gray-200 bg-gray-50 space-y-3 text-center">
                  <h4 className="text-xs font-black text-gray-700 uppercase">Logotipo Oficial</h4>
                  {formData.logoUrl ? (
                    <div className="w-28 h-28 mx-auto bg-white rounded-2xl p-2 border border-gray-200 flex items-center justify-center overflow-hidden">
                      <img src={formData.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-28 h-28 mx-auto bg-white rounded-2xl border border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                      <Camera className="w-6 h-6" />
                    </div>
                  )}

                  <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingLogo ? 'Cargando...' : 'Cambiar Logo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadImage(file, 'logo');
                      }}
                    />
                  </label>
                </div>

                {/* Portada */}
                <div className="p-5 rounded-2xl border border-gray-200 bg-gray-50 space-y-3 text-center">
                  <h4 className="text-xs font-black text-gray-700 uppercase">Imagen de Portada</h4>
                  {formData.coverImageUrl ? (
                    <div className="w-full h-28 bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <img src={formData.coverImageUrl} alt="Portada" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full h-28 bg-white rounded-2xl border border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                      <Camera className="w-6 h-6" />
                    </div>
                  )}

                  <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingCover ? 'Cargando...' : 'Cambiar Portada'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadImage(file, 'cover');
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CONTACTO */}
          {activeTab === 'contacto' && (
            <div className="space-y-5">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-base font-extrabold text-gray-900">Reuniones y Canales de Contacto</h3>
                <p className="text-xs text-gray-500">Datos para que la comunidad e interesados puedan acercarse al club.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Lugar / Dirección de Reunión
                  </label>
                  <input
                    type="text"
                    value={formData.meetingAddress || ''}
                    onChange={(e) => setFormData({ ...formData, meetingAddress: e.target.value })}
                    placeholder="Ej. Hotel Dann Carlton o Sede Campestre"
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Horario de Reunión
                  </label>
                  <input
                    type="text"
                    value={formData.meetingSchedule || ''}
                    onChange={(e) => setFormData({ ...formData, meetingSchedule: e.target.value })}
                    placeholder="Ej. Miércoles 7:30 PM"
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Correo Electrónico Oficial
                  </label>
                  <input
                    type="email"
                    value={formData.contactEmail || ''}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    placeholder="club@rotary4281.org"
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                    Teléfono / WhatsApp de Contacto
                  </label>
                  <input
                    type="tel"
                    value={formData.contactPhone || ''}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    placeholder="+57 310 123 4567"
                    className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Sitio Web Oficial
                </label>
                <input
                  type="url"
                  value={formData.websiteUrl || ''}
                  onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full p-3 rounded-xl border border-gray-200 text-sm font-semibold outline-none focus:border-rotary-blue"
                />
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider mb-3">Redes Sociales</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Instagram (ej. @rotaryclub)"
                    value={formData.socialMedia?.instagram || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      socialMedia: { ...formData.socialMedia, instagram: e.target.value }
                    })}
                    className="p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Facebook (ej. facebook.com/rotaryclub)"
                    value={formData.socialMedia?.facebook || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      socialMedia: { ...formData.socialMedia, facebook: e.target.value }
                    })}
                    className="p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none"
                  />
                  <input
                    type="text"
                    placeholder="LinkedIn (URL)"
                    value={formData.socialMedia?.linkedin || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      socialMedia: { ...formData.socialMedia, linkedin: e.target.value }
                    })}
                    className="p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none"
                  />
                  <input
                    type="text"
                    placeholder="YouTube (Canal)"
                    value={formData.socialMedia?.youtube || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      socialMedia: { ...formData.socialMedia, youtube: e.target.value }
                    })}
                    className="p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Botón flotante inferior para guardar */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">
              Los cambios en información ordinaria se reflejan de inmediato en tu perfil web público.
            </p>
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition-all"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar y Publicar en Tiempo Real'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ClubPortalPage;
