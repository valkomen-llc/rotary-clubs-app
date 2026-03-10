import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import MissionControl from '../../components/admin/MissionControl';

const Dashboard: React.FC = () => {
    const { user } = useAuth();

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Reporting overview</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-white transition-all">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        What's new?
                    </button>
                    <Link to="/" target="_blank" className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
                        View site <ExternalLink className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* Mission Control — AI Agents Panel */}
            <MissionControl />
        </AdminLayout>
    );
};

export default Dashboard;
