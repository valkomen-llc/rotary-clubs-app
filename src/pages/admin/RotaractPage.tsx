import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import SponsoredClubAdmin from '../../components/admin/sponsored-clubs/SponsoredClubAdmin';

const RotaractPage: React.FC = () => {
    return (
        <AdminLayout>
            <SponsoredClubAdmin type="rotaract" />
        </AdminLayout>
    );
};

export default RotaractPage;
