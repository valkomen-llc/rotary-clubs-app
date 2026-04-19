import { useState, useEffect } from 'react';
import { useClub } from '../contexts/ClubContext';

interface ImgSlot { url: string; alt: string; }
export interface SiteImages {
    hero?: ImgSlot[];
    causes?: ImgSlot[];
    foundation?: ImgSlot;
    join?: ImgSlot;
    aboutHero?: ImgSlot;
    aboutCarousel?: ImgSlot[];
    causesHero?: ImgSlot;
    polio?: ImgSlot;
    history?: ImgSlot[];
    historyHero?: ImgSlot;
    historyImpact?: ImgSlot;
    historyTimeline?: ImgSlot[];
    historyFounders?: ImgSlot[];
    rotaract?: ImgSlot;
    interact?: ImgSlot;
    yep?: ImgSlot[];
    yepExperience?: ImgSlot;
    yepBanner?: ImgSlot;
    ngse?: ImgSlot;
    rotexHero?: ImgSlot;
    rotexCarousel?: ImgSlot[];
    paulHarrisAvatar?: ImgSlot;
    chatbotPublicAvatar?: ImgSlot;
    chatbotAdminAvatar?: ImgSlot;
    missionControl?: ImgSlot;
}

const DEFAULTS = {
    hero: [
        { url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&h=800&fit=crop', alt: 'Hero 1' },
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=800&fit=crop', alt: 'Hero 2' },
        { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1600&h=800&fit=crop', alt: 'Hero 3' },
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=800&fit=crop', alt: 'Hero 4' },
        { url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1600&h=800&fit=crop', alt: 'Hero 5' }
    ],
    aboutCarousel: [
        { url: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=1200&h=800&fit=crop', alt: 'Nosotros 1' },
        { url: 'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?w=1200&h=800&fit=crop', alt: 'Nosotros 2' },
        { url: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&h=800&fit=crop', alt: 'Nosotros 3' }
    ],
    history: [
        { url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&h=800&fit=crop', alt: 'Historia 1' },
        { url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&h=800&fit=crop', alt: 'Historia 2' },
        { url: 'https://images.unsplash.com/photo-1521791136064-7986c2959210?w=1200&h=800&fit=crop', alt: 'Historia 3' },
        { url: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=1200&h=800&fit=crop', alt: 'Historia 4' },
        { url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=800&fit=crop', alt: 'Historia 5' }
    ],
    historyHero: { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=500&fit=crop', alt: 'Hero Historia' },
    historyImpact: { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop', alt: 'Décadas de Impacto' },
    historyTimeline: [
        { url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=500&fit=crop', alt: 'Momento Histórico 1' },
        { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=500&fit=crop', alt: 'Momento Histórico 2' },
        { url: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=500&fit=crop', alt: 'Momento Histórico 3' }
    ],
    historyFounders: Array(7).fill({ url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop', alt: 'Socio Fundador' }),

    yep: [
        { url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 1' },
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 2' },
        { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 3' },
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 4' },
        { url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 5' }
    ],
    rotexCarousel: [
        { url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 1' },
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 2' },
        { url: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 3' },
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 4' },
        { url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1200&h=675&fit=crop', alt: 'Actividad Rotex 5' }
    ],
    causes: [
        { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/global/images/1774367759783-home-areas-of-focus-2025-Promoting-Peace-20250226_TR_003.jpg', alt: 'Promoción de la paz' },
        { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/global/images/1774367706205-home-areas-of-focus-2025-Fighting-Disease-20240613_IN_050.jpg', alt: 'Lucha contra las enfermedades' },
        { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/global/images/1774367749617-home-areas-of-focus-2025-Providing-Clean-Water-20211026_PK_030.jpg', alt: 'Suministro de agua salubre' },
        { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/global/images/1774367740639-home-areas-of-focus-2025-Improving-Maternal-and-Child-Health-20250408_PG_186.jpg', alt: 'Mejorando la salud materno-infantil' },
        { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/global/images/1774367754051-home-areas-of-focus-2025-Supporting-Education-20240620_PA_032.jpg', alt: 'Apoyo a la educación' },
        { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/global/images/1774367732873-home-areas-of-focus-2025-Growing-Local-Economies-20221008_TR_008.jpg', alt: 'Desarrollo de las economías locales' },
        { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/global/images/1774367725680-home-areas-of-focus-2025-Protecting-the-Environment-2024-04-012.jpg', alt: 'Protección del medioambiente' }
    ],
    paulHarrisAvatar: { url: 'https://www.rotary.org/sites/default/files/styles/w_600/public/Paul%20Harris%20portrait.jpg', alt: 'Paul Harris' },
    chatbotPublicAvatar: { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/null/images/1775750783080-imagen_2026-02-23_03-49-22_(1).png', alt: 'Chatbot Persona' },
    chatbotAdminAvatar: { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/null/images/1775750805930-imagen_2026-02-23_11-57-31_(3).png', alt: 'Admin Persona' },
    missionControl: { url: 'https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/null/images/1775761106234-Mision_Control_-_Rotary_Valkomen.png', alt: 'Mission Control' }
};
// Helper: detect if a URL is a default (not a real custom upload)
const isDefault = (url: string) => !url || url.includes('images.unsplash.com') || url.includes('/defaults/');


export function useSiteImages(): SiteImages & { _loading?: boolean } {
    const { club } = useClub();
    const clubId = (club as any)?.id;
    const clubSiteImages = (club as any)?.siteImages;

    const [images, setImages] = useState<SiteImages & { _loading?: boolean }>(() => {
        return { ...DEFAULTS, _loading: true };
    });

    useEffect(() => {
        if (!clubId) return;

        const API = import.meta.env.VITE_API_URL || '/api';
        const timestamp = Date.now();
        
        const fetchGlobal = fetch(`${API}/clubs/_global/site-images?_t=${timestamp}`).then(r => r.ok ? r.json() : {});
        const fetchClub = clubId === '_global' 
            ? Promise.resolve({}) 
            : fetch(`${API}/clubs/${clubId}/site-images?_t=${timestamp}`).then(r => r.ok ? r.json() : {});

        Promise.all([fetchGlobal, fetchClub])
            .then(([globalData, clubData]) => {
                const final: any = { ...DEFAULTS };

                // 1. Start with DEFAULTS
                // 2. Merge GLOBAL data (if not default)
                // 3. Merge CLUB data (if not default)

                const allKeys = [
                    'hero', 'aboutCarousel', 'history', 'yep', 'rotexCarousel', 'causes',
                    'foundation', 'join', 'aboutHero', 'causesHero', 'polio', 'rotaract', 
                    'interact', 'yepExperience', 'yepBanner', 'ngse', 'rotexHero', 
                    'historyHero', 'historyImpact', 'historyTimeline', 'historyFounders',
                    'paulHarrisAvatar', 'chatbotPublicAvatar', 'chatbotAdminAvatar', 'missionControl'
                ];

                allKeys.forEach(key => {
                    const gVal = globalData[key];
                    const cVal = clubData[key];
                    const dVal = (DEFAULTS as any)[key];

                    if (Array.isArray(dVal)) {
                        const merged = [...dVal];
                        // Apply Global
                        if (Array.isArray(gVal)) {
                            gVal.forEach((slot, i) => {
                                if (slot && slot.url && !isDefault(slot.url)) merged[i] = slot;
                            });
                        }
                        // Apply Club
                        if (Array.isArray(cVal)) {
                            cVal.forEach((slot, i) => {
                                if (slot && slot.url && !isDefault(slot.url)) merged[i] = slot;
                            });
                        }
                        final[key] = merged;
                    } else {
                        // Single item
                        // Start with default, then override with global, then override with club
                        let val = dVal;
                        if (gVal && gVal.url && !isDefault(gVal.url)) val = gVal;
                        if (Array.isArray(gVal) && gVal[0]?.url && !isDefault(gVal[0].url)) val = gVal[0];
                        
                        if (cVal && cVal.url && !isDefault(cVal.url)) val = cVal;
                        if (Array.isArray(cVal) && cVal[0]?.url && !isDefault(cVal[0].url)) val = cVal[0];
                        
                        final[key] = val;
                    }
                });

                setImages({ ...final, _loading: false });
            })
            .catch(() => setImages(prev => ({ ...prev, _loading: false })));
    }, [clubId, club]);

    return images;
}
