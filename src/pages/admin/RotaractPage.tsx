import React from 'react';
import { Users } from 'lucide-react';
import SponsoredClubAdmin from '../../components/admin/sponsored-clubs/SponsoredClubAdmin';

const RotaractPage: React.FC = () => (
    <SponsoredClubAdmin
        type="rotaract"
        title="Club Rotaract"
        description="Gestiona el contenido del Club Rotaract patrocinado: miembros, proyectos y actividades juveniles (jóvenes de 18 a 30 años)."
        brandColor="#d4145a"
        icon={Users}
    />
);

export default RotaractPage;
