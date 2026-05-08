import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import SponsoredClubAdmin from '../../components/admin/sponsored-clubs/SponsoredClubAdmin';
import { Users } from 'lucide-react';

const InteractPage: React.FC = () => {
    return (
        <AdminLayout>
            <SponsoredClubAdmin 
                type="interact" 
                title="Club Interact"
                description="Gestiona el contenido del Club Interact patrocinado: miembros, actividades y programas infantiles."
                brandColor="#005b9f"
                icon={Users}
            />
        </AdminLayout>
    );
};

export default InteractPage;
