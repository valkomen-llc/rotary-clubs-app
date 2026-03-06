import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ClubConfig } from '../config/clubConfig';
import { getClubByHostname } from '../config/clubConfig';

interface ClubContextType {
    club: ClubConfig;
}

const ClubContext = createContext<ClubContextType | undefined>(undefined);

export const ClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [club, setClub] = useState<ClubConfig | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchClub = async () => {
            try {
                const hostname = window.location.hostname;
                const urlParams = new URLSearchParams(window.location.search);
                const clubOverride = urlParams.get('club');

                const queryDomain = clubOverride || hostname;
                const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/by-domain?domain=${queryDomain}`);

                if (response.ok) {
                    const data = await response.json();
                    setClub(data);
                    document.title = data.name;
                } else {
                    // Fallback to local config if API fails or club not found
                    setClub(getClubByHostname(hostname));
                }
            } catch (error) {
                console.error('Error loading club config:', error);
                setClub(getClubByHostname(window.location.hostname));
            } finally {
                setLoading(false);
            }
        };

        fetchClub();
    }, []);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-rotary-blue text-white">Cargando...</div>;
    }

    if (!club) {
        return <div className="min-h-screen flex items-center justify-center bg-red-600 text-white">Error: Club no encontrado</div>;
    }

    return (
        <ClubContext.Provider value={{ club }}>
            {children}
        </ClubContext.Provider>
    );
};

export const useClub = () => {
    const context = useContext(ClubContext);
    if (context === undefined) {
        throw new Error('useClub must be used within a ClubProvider');
    }
    return context;
};
