// ════════════════════════════════════════════════════════════════════════════
// Página de Workspace Independiente del Editor de Video — v4.1143.0
//
// Ruta: /video-editor/:projectId (y /video-editor)
// Se ejecuta en una pestaña independiente dedicada a pantalla completa (100vh/100vw),
// sin sidebar administrativo, sin header del CMS y sin widgets flotantes.
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import VideoEditor from '../../components/admin/video-editor/VideoEditor';

export const VideoEditorWorkspacePage: React.FC = () => {
    const { projectId } = useParams<{ projectId?: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        document.title = 'Editor de Video Profesional · Club Platform';
    }, []);

    return (
        <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#F8FAFC] text-slate-800 font-sans z-[9999] select-none flex flex-col">
            <VideoEditor
                isStandalone={true}
                projectIdToLoad={projectId}
                clubId={user?.clubId || null}
                onClose={() => {
                    if (window.opener) {
                        window.close();
                    } else {
                        navigate('/admin/content-studio?tab=editor');
                    }
                }}
            />
        </div>
    );
};

export default VideoEditorWorkspacePage;
