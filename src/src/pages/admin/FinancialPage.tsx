import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import FinancialAdmin from '../../components/admin/financial/FinancialAdmin';

const FinancialPage: React.FC = () => {
    return (
        <AdminLayout>
            <FinancialAdmin />
        </AdminLayout>
    );
};

export default FinancialPage;
