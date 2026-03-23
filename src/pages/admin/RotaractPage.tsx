import React from 'react';
import { Users } from 'lucide-react';
import ModulePlaceholder from '../../components/admin/ModulePlaceholder';

const RotaractPage: React.FC = () => (
    <ModulePlaceholder
        icon={Users}
        title="Club Rotaract"
        description="Gestiona el contenido del Club Rotaract patrocinado: miembros, proyectos y actividades juveniles."
        color="#d4145a"
    />
);

export default RotaractPage;
