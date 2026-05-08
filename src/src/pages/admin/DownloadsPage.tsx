import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import DownloadsAdmin from '../../components/admin/downloads/DownloadsAdmin';

const DownloadsPage: React.FC = () => {
    return (
        <AdminLayout>
            <DownloadsAdmin />
        </AdminLayout>
    );
};

export default DownloadsPage;
