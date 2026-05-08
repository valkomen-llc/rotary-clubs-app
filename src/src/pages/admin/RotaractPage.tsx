import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import SponsoredClubAdmin from '../../components/admin/sponsored-clubs/SponsoredClubAdmin';
import { Users } from 'lucide-react';

const RotaractPage: React.FC = () => {
    return (
        <AdminLayout>
            <SponsoredClubAdmin 
                type="rotaract" 
                title="Club Rotaract"
                description="Gestiona el contenido del Club Rotaract patrocinado: miembros, proyectos y actividades juveniles."
                brandColor="#d91b5c"
                icon={Users}
            />
        </AdminLayout>
    );
};

export default RotaractPage;
