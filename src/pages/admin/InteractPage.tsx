import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import SponsoredClubAdmin from '../../components/admin/sponsored-clubs/SponsoredClubAdmin';

const InteractPage: React.FC = () => {
    return (
        <AdminLayout>
            <SponsoredClubAdmin type="interact" />
        </AdminLayout>
    );
};

export default InteractPage;
