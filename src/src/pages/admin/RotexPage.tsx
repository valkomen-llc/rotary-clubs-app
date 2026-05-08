import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import RotexAdmin from '../../components/admin/rotex/RotexAdmin';

const RotexPage: React.FC = () => {
    return (
        <AdminLayout>
            <RotexAdmin />
        </AdminLayout>
    );
};

export default RotexPage;
