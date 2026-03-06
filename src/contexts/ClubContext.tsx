import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ClubConfig } from '../config/clubConfig';
import { getClubByHostname } from '../config/clubConfig';

interface ClubContextType {
    club: ClubConfig;
}

const ClubContext = createContext<ClubContextType | undefined>(undefined);

export const ClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [club, setClub] = useState<ClubConfig>(getClubByHostname(window.location.hostname));

    useEffect(() => {
        const config = getClubByHostname(window.location.hostname);
        setClub(config);
        document.title = config.name;
    }, []);

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
