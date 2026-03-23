import React from 'react';
import { Globe } from 'lucide-react';
import ModulePlaceholder from '../../components/admin/ModulePlaceholder';

const YouthExchangePage: React.FC = () => (
    <ModulePlaceholder
        icon={Globe}
        title="Intercambios de Jóvenes de Rotary"
        description="Gestiona los programas de intercambio juvenil del club: postulantes, anfitriones y documentación."
        color="#f7a81b"
    />
);

export default YouthExchangePage;
