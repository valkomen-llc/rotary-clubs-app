import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import NgseAdmin from '../../components/admin/ngse/NgseAdmin';

const NgsePage: React.FC = () => {
    return (
        <AdminLayout>
            <NgseAdmin />
        </AdminLayout>
    );
};

export default NgsePage;
