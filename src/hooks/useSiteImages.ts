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
        { url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=500&fit=crop', alt: 'Lucha contra las enfermedades' },
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&h=500&fit=crop', alt: 'Promoción de la paz' },
        { url: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=500&h=500&fit=crop', alt: 'Suministro de agua salubre' },
        { url: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=500&h=500&fit=crop', alt: 'Apoyo a la educación' },
        { url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=500&h=500&fit=crop', alt: 'Mejorando la salud materno-infantil' },
        { url: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=500&h=500&fit=crop', alt: 'Desarrollo de las economías locales' },
        { url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=500&h=500&fit=crop', alt: 'Protección del medioambiente' }
    ]
};

export function useSiteImages(): SiteImages & { _loading?: boolean } {
    const { club } = useClub();
    
    // PRE-MERGE: Initialize state with DEFAULTS + whatever we have in the club object from the first fetch
    // This prevents the "flash" of default images while the authoritative merge fetch happens below.
    const [images, setImages] = useState<SiteImages & { _loading?: boolean }>(() => {
        const initial = { ...DEFAULTS, _loading: true };
        const clubSiteImages = (club as any)?.siteImages || {};
        
        // Merge simple keys
        if (clubSiteImages.hero) initial.hero = clubSiteImages.hero;
        if (clubSiteImages.join) initial.join = clubSiteImages.join;
        
        // Merge array keys safely
        const arrayKeys = ['hero', 'aboutCarousel', 'history', 'yep', 'rotexCarousel', 'causes'];
        arrayKeys.forEach(key => {
            if (Array.isArray(clubSiteImages[key]) && clubSiteImages[key].length > 0) {
                // We use the club's array but pad it with defaults if needed
                const clubArray = clubSiteImages[key];
                const defaultArray = (DEFAULTS as any)[key] || [];
                const merged = [...clubArray];
                for (let i = merged.length; i < defaultArray.length; i++) {
                    merged.push(defaultArray[i]);
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
                const arrayKeys = ['hero', 'aboutCarousel', 'history', 'yep', 'rotexCarousel', 'causes'];
                
                if (clubSiteImages.hero) updated.hero = clubSiteImages.hero;
                if (clubSiteImages.join) updated.join = clubSiteImages.join;
                
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
        fetch(`${API}/clubs/${clubId}/site-images?_t=${Date.now()}`)
            .then(r => r.ok ? r.json() : {})
            .then(data => {
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
                    if (data[conf.key] && Array.isArray(data[conf.key])) {
                        data[conf.key] = (DEFAULTS[key] as any[]).map((def, i) => data[conf.key][i] || def);
                    } else if (!data[conf.key]) {
                        data[conf.key] = DEFAULTS[key];
                    }
                });

                setImages({ ...data, _loading: false });
            })
            .catch(() => setImages(prev => ({ ...prev, _loading: false })));
    }, [clubId, club]);

    return images;
}
