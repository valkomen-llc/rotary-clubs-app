import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { isPlatformSuperAdmin } from '../../lib/platformAdmin';
import { useSiteModulesConfig } from '../../hooks/useSiteModulesConfig';

interface SiteModuleRouteGuardProps {
    moduleKey: string;
    children: React.ReactNode;
    fallbackPath?: string;
}

/**
 * Protector de ruta que restringe el acceso directo por URL si el módulo
 * está deshabilitado para la organización o sitio actual.
 * Los superadministradores de la plataforma conservan acceso irrestricto.
 */
export const SiteModuleRouteGuard: React.FC<SiteModuleRouteGuardProps> = ({
    moduleKey,
    children,
    fallbackPath = '/admin/dashboard'
}) => {
    const { user } = useAuth();
    const isSuperAdmin = isPlatformSuperAdmin(user);
    const { isModuleEnabled, loading } = useSiteModulesConfig();

    // El superadministrador global mantiene acceso completo para administración y diagnóstico
    if (isSuperAdmin) {
        return <>{children}</>;
    }

    // Mientras carga la configuración no se expulsa abruptamente
    if (loading) {
        return <>{children}</>;
    }

    if (!isModuleEnabled(moduleKey)) {
        return <Navigate to={fallbackPath} replace />;
    }

    return <>{children}</>;
};

export default SiteModuleRouteGuard;
