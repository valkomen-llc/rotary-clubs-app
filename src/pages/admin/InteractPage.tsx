import React from 'react';
import { Users } from 'lucide-react';
import ModulePlaceholder from '../../components/admin/ModulePlaceholder';

const InteractPage: React.FC = () => (
    <ModulePlaceholder
        icon={Users}
        title="Club Interact"
        description="Gestiona el contenido del Club Interact patrocinado: miembros, actividades y programas juveniles."
        color="#26a9e0"
    />
);

export default InteractPage;
