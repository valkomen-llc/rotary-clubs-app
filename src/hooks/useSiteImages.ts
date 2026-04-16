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
    rotaract?: ImgSlot;
    interact?: ImgSlot;
    yep?: ImgSlot[];
    yepExperience?: ImgSlot;
    yepBanner?: ImgSlot;
    ngse?: ImgSlot;
    rotexHero?: ImgSlot;
    rotexCarousel?: ImgSlot[];
    chatbotPublicAvatar?: ImgSlot;
    chatbotAdminAvatar?: ImgSlot;
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
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&h=500&fit=crop', alt: 'Promoción de la paz' },
        { url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=500&fit=crop', alt: 'Lucha contra las enfermedades' },
        { url: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=500&h=500&fit=crop', alt: 'Suministro de agua salubre' },
        { url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=500&h=500&fit=crop', alt: 'Mejorando la salud materno-infantil' },
        { url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=500&h=500&fit=crop', alt: 'Apoyo a la educación' },
        { url: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=500&h=500&fit=crop', alt: 'Desarrollo de las economías locales' },
        { url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=500&h=500&fit=crop', alt: 'Protección del medioambiente' }
    ]
};
// Helper: detect if a URL is a default (not a real custom upload)
const isDefault = (url: string) => !url || url.includes('images.unsplash.com') || url.includes('/defaults/');


export function useSiteImages(): SiteImages & { _loading?: boolean } {
    const { club } = useClub();
    
    // PRE-MERGE: Initialize state with DEFAULTS + whatever we have in the club object from the first fetch
    const [images, setImages] = useState<SiteImages & { _loading?: boolean }>(() => {
        const clubSiteImages = (club as any)?.siteImages || {};
        
        // Start with a clean slate based on DEFAULTS
        const initial = { ...DEFAULTS, _loading: true };
        
        // Standalone keys
        const simpleKeys = [
            'foundation', 'join', 'aboutHero', 'causesHero', 'polio', 
            'rotaract', 'interact', 'yepExperience', 'yepBanner', 'ngse', 
            'rotexHero', 'chatbotPublicAvatar', 'chatbotAdminAvatar'
        ];
        
        simpleKeys.forEach(key => {
            if (clubSiteImages[key]) (initial as any)[key] = clubSiteImages[key];
        });
        
        // Array keys
        const arrayKeys = ['hero', 'aboutCarousel', 'history', 'yep', 'rotexCarousel', 'causes'];
        arrayKeys.forEach(key => {
            if (Array.isArray(clubSiteImages[key]) && clubSiteImages[key].length > 0) {
                const clubArray = clubSiteImages[key];
                const defaultArray = (DEFAULTS as any)[key] || [];
                // If the club array has content, use it to override/pad defaults
                const merged = [...clubArray];
                if (merged.length < defaultArray.length) {
                    for (let i = merged.length; i < defaultArray.length; i++) {
                        merged.push(defaultArray[i]);
                    }
                }
                (initial as any)[key] = merged;
            }
        });
        
        return initial as any;
    });

    const clubId = (club as any)?.id;

    useEffect(() => {
        if (!clubId) return;

        // Immediate sync from club object if available (avoids flash)
        const clubSiteImages = (club as any)?.siteImages;
        if (clubSiteImages) {
            setImages(prev => {
                const updated = { ...prev };
                const simpleKeys = [
                    'foundation', 'join', 'aboutHero', 'causesHero', 'polio', 
                    'rotaract', 'interact', 'yepExperience', 'yepBanner', 'ngse', 
                    'rotexHero', 'chatbotPublicAvatar', 'chatbotAdminAvatar'
                ];
                
                simpleKeys.forEach(key => {
                    if (clubSiteImages[key]) (updated as any)[key] = clubSiteImages[key];
                });

                if (clubSiteImages.hero) updated.hero = clubSiteImages.hero;
                
                const arrayKeys = ['hero', 'aboutCarousel', 'history', 'yep', 'rotexCarousel', 'causes'];
                arrayKeys.forEach(key => {
                    if (Array.isArray(clubSiteImages[key]) && clubSiteImages[key].length > 0) {
                        const clubArray = clubSiteImages[key];
                        const defaultArray = (DEFAULTS as any)[key] || [];
                        const merged = [...clubArray];
                        for (let i = merged.length; i < defaultArray.length; i++) {
                            merged.push(defaultArray[i]);
                        }
                        (updated as any)[key] = merged;
                    }
                });
                return updated;
            });
        }

        const API = import.meta.env.VITE_API_URL || '/api';
        const timestamp = Date.now();
        
        // Fetch global and club images in parallel to ensure inheritance works even with old server code
        const fetchGlobal = fetch(`${API}/clubs/_global/site-images?_t=${timestamp}`).then(r => r.ok ? r.json() : {});
        const fetchClub = clubId === '_global' 
            ? Promise.resolve({}) 
            : fetch(`${API}/clubs/${clubId}/site-images?_t=${timestamp}`).then(r => r.ok ? r.json() : {});

        Promise.all([fetchGlobal, fetchClub])
            .then(([globalData, clubData]) => {
                const merged: any = { ...globalData };

                // Merge club data over global data
                Object.keys(clubData).forEach(key => {
                    const clubVal = clubData[key];
                    const globalVal = globalData[key];

                    if (Array.isArray(clubVal)) {
                        const globalArr = Array.isArray(globalVal) ? globalVal : [];
                        // Combine: use club value if not default, otherwise use global
                        merged[key] = (globalArr.length > 0 ? globalArr : clubVal).map((gSlot: any, i: number) => {
                            const cSlot = clubVal[i];
                            return (cSlot && cSlot.url && !isDefault(cSlot.url)) ? cSlot : gSlot;
                        });
                        // Append extra slots from club
                        if (clubVal.length > (globalArr.length || 0)) {
                            for (let i = (globalArr.length || 0); i < clubVal.length; i++) {
                                merged[key].push(clubVal[i]);
                            }
                        }
                    } else if (clubVal && typeof clubVal === 'object') {
                        if (clubVal.url && !isDefault(clubVal.url)) {
                            merged[key] = clubVal;
                        }
                    }
                });

                const arrayKeyConfigs = [
                    { key: 'hero', count: 5 },
                    { key: 'aboutCarousel', count: 3 },
                    { key: 'history', count: 5 },
                    { key: 'yep', count: 5 },
                    { key: 'rotexCarousel', count: 5 },
                    { key: 'causes', count: 7 }
                ];

                arrayKeyConfigs.forEach(conf => {
                    const key = conf.key as keyof typeof DEFAULTS;
                    if (merged[conf.key] && Array.isArray(merged[conf.key])) {
                        merged[conf.key] = (DEFAULTS[key] as any[]).map((def, i) => merged[conf.key][i] || def);
                    } else if (!merged[conf.key]) {
                        merged[conf.key] = DEFAULTS[key];
                    }
                });

                // Normalize single-slot keys: stored as arrays in DB but expected as objects
                const singleKeys = [
                    'foundation', 'join', 'aboutHero', 'causesHero', 'polio',
                    'rotaract', 'interact', 'yepExperience', 'yepBanner', 'ngse',
                    'rotexHero', 'chatbotPublicAvatar', 'chatbotAdminAvatar', 'missionControl'
                ];
                singleKeys.forEach(key => {
                    if (Array.isArray(merged[key]) && merged[key].length > 0) {
                        merged[key] = merged[key][0];
                    }
                });

                setImages({ ...merged, _loading: false });
            })
            .catch(() => setImages(prev => ({ ...prev, _loading: false })));
    }, [clubId, club]);

    return images;
}
