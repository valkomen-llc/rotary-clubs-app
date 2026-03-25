import React from 'react';
import { Users } from 'lucide-react';
import SponsoredClubAdmin from '../../components/admin/sponsored-clubs/SponsoredClubAdmin';

const InteractPage: React.FC = () => (
    <SponsoredClubAdmin
        type="interact"
        title="Club Interact"
        description="Gestiona el contenido del Club Interact patrocinado: miembros, proyectos y actividades juveniles (adolescentes de 12 a 18 años)."
        brandColor="#009fe3"
        icon={Users}
    />
);

export default InteractPage;
