import React from 'react';
import { FileText } from 'lucide-react';
import ModulePlaceholder from '../../components/admin/ModulePlaceholder';

const DianPage: React.FC = () => (
    <ModulePlaceholder
        icon={FileText}
        title="Estados Financieros (DIAN)"
        description="Publicación obligatoria de estados financieros y status ESAL para transparencia del club en Colombia."
        color="#2d3748"
    />
);

export default DianPage;
