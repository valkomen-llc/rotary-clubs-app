
export interface ClubConfig {
    id: string;
    name: string;
    description?: string;
    city?: string;
    country?: string;
    domain: string;
    subdomain?: string;
    logo?: string;
    footerLogo?: string;
    endPolioLogo?: string;
    favicon?: string;
    logoText: string;
    productsCount?: number;
    eventsCount?: number;
    storeActive?: boolean;
    logoHeaderSize?: number;
    onboardingCompleted?: boolean;
    onboardingStep?: number;
    status?: string;
    colors: {
        primary: string;
        secondary: string;
    };
    social: { platform: string; url: string }[];
    contact: {
        email: string;
        phone: string;
        address: string;
    };
    paymentConfigs?: any[];
    isMainPlatform?: boolean;
}

// Default/Fallback configuration for when API is loading or fails
export const DEFAULT_CLUB: ClubConfig = {
    id: 'loading',
    name: 'Cargando Club...',
    domain: 'localhost',
    logoText: 'Rotary',
    productsCount: 0,
    eventsCount: 0,
    storeActive: false,
    colors: {
        primary: '#013388', // Rotary Blue
        secondary: '#E29C00', // Rotary Gold
    },
    social: [],
    contact: {
        email: '',
        phone: '',
        address: '',
    }
};

export const getClubByHostname = (hostname: string): ClubConfig => {
    // This is now just a fallback. The real source of truth is the API in ClubContext.tsx
    return { ...DEFAULT_CLUB, domain: hostname };
};
