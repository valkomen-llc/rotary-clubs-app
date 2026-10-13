// ════════════════════════════════════════════════════════════════════════════
// Solicitudes de contenido — Módulo Consolidado en Rotary en Acción (v4.1180)
//
// Esta vista ha sido unificada formalmente dentro de `Rotary en Acción`
// (/admin/rotary-en-accion?tab=solicitudes).
//
// Conserva 100% de compatibilidad con enlaces profundos existentes (?abrir,
// ?campana, filtros), redirige suavemente al módulo unificado y renderiza la
// sección de Solicitudes con sus capacidades intactas.
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { isContentSubmissionsAllowedSite } from '../../lib/submissionInbox';
import SubmissionDetail from '../../components/admin/contribution/SubmissionDetail';
import { toast } from 'sonner';
import RotaryEnAccionAdmin from './RotaryEnAccionAdmin';

const SubmissionsInbox: React.FC = () => {
    const { user } = useAuth();
    const { club } = useClub();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [abierta, setAbierta] = useState<{ id: string; campaignId: string } | null>(null);

    const isAllowed = useMemo(() => isContentSubmissionsAllowedSite({
        user,
        club,
        hostname: typeof window !== 'undefined' ? window.location.hostname : undefined,
    }), [user, club]);

    useEffect(() => {
        if (!isAllowed) {
            toast.error('El módulo de solicitudes de contenido y trazabilidad de Rotary en Acción sólo está habilitado para entidades autorizadas.');
            navigate('/admin/analytics', { replace: true });
            return;
        }

        // Redirige al módulo unificado en Rotary en Acción conservando todos los parámetros
        const nextParams = new URLSearchParams(params);
        if (!nextParams.get('tab')) {
            nextParams.set('tab', 'solicitudes');
        }
        navigate(`/admin/rotary-en-accion?${nextParams.toString()}`, { replace: true });
    }, [isAllowed, navigate, params]);

    if (!isAllowed) {
        return (
            <AdminLayout wide>
                <div className="p-8 max-w-xl mx-auto text-center space-y-4">
                    <h2 className="text-xl font-bold text-gray-800">Módulo no disponible</h2>
                    <p className="text-sm text-gray-500">
                        El módulo de solicitudes de contenido está reservado para entidades autorizadas de Club Platform.
                    </p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout wide>
            <RotaryEnAccionAdmin embedded={true} initialTab="solicitudes" />
            {abierta && (
                <SubmissionDetail
                    campaignId={abierta.campaignId}
                    submissionId={abierta.id}
                    onClose={() => setAbierta(null)}
                />
            )}
        </AdminLayout>
    );
};

export default SubmissionsInbox;
