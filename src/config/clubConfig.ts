
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
        actionBg?: string;
        joinBg?: string;
        areasBg?: string;
        footerBg?: string;
        copyrightBg?: string;
        copyrightText?: string;
        buttonBg?: string;
        buttonHoverBg?: string;
        buttonText?: string;
    };
    eventHeroImages?: { url: string; alt?: string }[];
    eventNavMenu?: { [key: string]: boolean };
    actionContent?: { title?: string; text?: string; buttonText?: string; buttonUrl?: string; icon?: string; iconColor?: string; titleHighlight?: string; titleHighlightColor?: string };
    type?: string;
    social: { platform: string; url: string }[];
    contact: {
        email: string;
        phone: string;
        address: string;
    };
    paymentConfigs?: any[];
    isMainPlatform?: boolean;
    archetype?: any;
    settings?: any;
    members?: any[];
    expirationBannerActive?: boolean;
    expirationBannerMessage?: string;
    developmentBannerActive?: boolean;
    developmentBannerMessage?: string;
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
