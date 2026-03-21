import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import MissionControl from '../../components/admin/MissionControl';
import AgentProgressBar from '../../components/admin/AgentProgressBar';
import AgentActivityDashboard from '../../components/admin/AgentActivityDashboard';

const Dashboard: React.FC = () => {

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8 gap-4">
                <AgentProgressBar />
                <div className="flex items-center gap-3 flex-shrink-0">
                    <Link to="/" target="_blank" className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
                        View site <ExternalLink className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* Mission Control — AI Agents Panel */}
            <MissionControl />

            {/* Agent Activity Dashboard */}
            <div className="mt-8">
                <AgentActivityDashboard />
            </div>
        </AdminLayout>
    );
};

export default Dashboard;

