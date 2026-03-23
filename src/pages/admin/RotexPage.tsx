import React from 'react';
import { Award } from 'lucide-react';
import ModulePlaceholder from '../../components/admin/ModulePlaceholder';

const RotexPage: React.FC = () => (
    <ModulePlaceholder
        icon={Award}
        title="ROTEX"
        description="Gestiona la comunidad de ex-intercambistas Rotary (ROTEX): directorio, eventos y red de alumni."
        color="#8b5cf6"
    />
);

export default RotexPage;
