import React from 'react';
import { Briefcase } from 'lucide-react';
import ModulePlaceholder from '../../components/admin/ModulePlaceholder';

const NGSEPage: React.FC = () => (
    <ModulePlaceholder
        icon={Briefcase}
        title="Intercambios NGSE"
        description="Gestiona intercambios profesionales del New Generations Service Exchange: postulantes, vacantes y seguimiento."
        color="#009b3a"
    />
);

export default NGSEPage;
