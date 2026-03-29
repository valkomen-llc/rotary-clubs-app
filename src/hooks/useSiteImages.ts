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
    ngse?: ImgSlot;
    rotex?: ImgSlot;
    chatbotPublicAvatar?: ImgSlot;
    chatbotAdminAvatar?: ImgSlot;
}

export function useSiteImages(): SiteImages & { _loading?: boolean } {
    const { club } = useClub();
    const [images, setImages] = useState<SiteImages & { _loading?: boolean }>({ _loading: true });
    const clubId = (club as any)?.id;

    useEffect(() => {
        if (!clubId) return;
        const API = import.meta.env.VITE_API_URL || '/api';
        fetch(`${API}/clubs/${clubId}/site-images?_t=${Date.now()}`)
            .then(r => r.ok ? r.json() : {})
            .then(data => setImages({ ...data, _loading: false }))
            .catch(() => setImages({ _loading: false }));
    }, [clubId]);

    return images;
}
