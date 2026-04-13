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
    rotexPoster?: ImgSlot;
    chatbotPublicAvatar?: ImgSlot;
    chatbotAdminAvatar?: ImgSlot;
}

const DEFAULTS = {
    yep: [
        { url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 1' },
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 2' },
        { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 3' },
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 4' },
        { url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 5' }
    ]
};

export function useSiteImages(): SiteImages & { _loading?: boolean } {
    const { club } = useClub();
    const [images, setImages] = useState<SiteImages & { _loading?: boolean }>({ _loading: true });
    const clubId = (club as any)?.id;

    useEffect(() => {
        if (!clubId) return;
        const API = import.meta.env.VITE_API_URL || '/api';
        fetch(`${API}/clubs/${clubId}/site-images?_t=${Date.now()}`)
            .then(r => r.ok ? r.json() : {})
            .then(data => {
                // Ensure array keys like 'yep' are expanded to their expected count
                if (data.yep && Array.isArray(data.yep)) {
                    const expandedYep = DEFAULTS.yep.map((def, i) => data.yep[i] || def);
                    data.yep = expandedYep;
                } else if (!data.yep) {
                    data.yep = DEFAULTS.yep;
                }
                setImages({ ...data, _loading: false });
            })
            .catch(() => setImages({ _loading: false }));
    }, [clubId]);

    return images;
}
