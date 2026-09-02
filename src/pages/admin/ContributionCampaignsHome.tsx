// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución — UNA dirección, dos vistas (v4.986)
//
// ⚠️ UN SOLO MÓDULO Y UN SOLO NOMBRE. Hasta v4.985 la misma funcionalidad
// existía dos veces: «Campañas de Contribución» en el Administrador del
// Sistema y «Maneras de Contribuir» en el panel de cada sitio. Eran dos
// conceptos para lo mismo —la segunda editaba justamente la información local
// de la primera— y por eso convivían en el menú sin que nadie supiera cuál
// abrir. `/admin/maneras-de-contribuir` REDIRIGE acá y no existe otra pantalla.
//
// ⚠️ QUIÉN VE CUÁL LO DECIDE EL CONTEXTO DE PLATAFORMA, no «si hay club».
// Un operador entra por el dominio de la plataforma y `by-domain` le devuelve
// el sitio «Origen», así que «no hay club» nunca es cierto para él — es la
// lección de la Bóveda Central (v4.853). El criterio vive en `platformAdmin.ts`
// y es el MISMO del resto del panel (`isUIAdmin` en AdminLayout, v4.863): rol
// de plataforma Y dominio de plataforma. Un operador que entra por el dominio
// de un club está mirando ESE club, y ve su vista de sitio.
//
// ⚠️ ESTO DECIDE QUÉ SE PINTA, NUNCA A QUÉ SE TIENE ACCESO. Los endpoints
// centrales siguen con `superAdminOnly` y los del sitio con su
// `requireRoleOrPermission`: quien escriba la dirección a mano llega a la
// pantalla y no obtiene ni un dato.
//
// Las dos vistas se cargan PEREZOSAS y por separado a propósito: la central
// pesa más de dos mil líneas y quien administra un sitio no tiene por qué
// descargarla para editar su contacto (la lección del peso del panel, v4.880).
// ════════════════════════════════════════════════════════════════════
import React, { Suspense } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isPlatformSuperAdmin, isOnPlatformDomain } from '../../lib/platformAdmin';
import { lazyWithRetry } from '../../lib/lazyWithRetry';
import AdminLayout from '../../components/admin/AdminLayout';

const CentralCampaigns = lazyWithRetry(() => import('./ContributionCampaigns'), 'ContributionCampaigns');
const SiteCampaigns = lazyWithRetry(() => import('./SiteContributionCampaigns'), 'SiteContributionCampaigns');

const Cargando = () => (
    <AdminLayout><div className="p-12 text-center text-gray-400 italic">Cargando…</div></AdminLayout>
);

const ContributionCampaignsHome: React.FC = () => {
    const { user } = useAuth();
    const central = isPlatformSuperAdmin(user) && isOnPlatformDomain();
    return (
        <Suspense fallback={<Cargando />}>
            {central ? <CentralCampaigns /> : <SiteCampaigns />}
        </Suspense>
    );
};

export default ContributionCampaignsHome;
