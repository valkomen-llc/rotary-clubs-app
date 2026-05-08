import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import YouthExchangeAdmin from '../../components/admin/youth-exchange/YouthExchangeAdmin';

const YouthExchangePage: React.FC = () => {
    return (
        <AdminLayout>
            <YouthExchangeAdmin />
        </AdminLayout>
    );
};

export default YouthExchangePage;
