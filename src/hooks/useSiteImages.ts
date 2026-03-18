import { useState, useEffect } from 'react';
import { useClub } from '../contexts/ClubContext';

interface ImgSlot { url: string; alt: string; }
export interface SiteImages {
    hero?: ImgSlot[];
    causes?: ImgSlot[];
    foundation?: ImgSlot;
    join?: ImgSlot;
    aboutHero?: ImgSlot;
}

export function useSiteImages(): SiteImages {
    const { club } = useClub();
    const [images, setImages] = useState<SiteImages>({});
    const clubId = (club as any)?.id;

    useEffect(() => {
        if (!clubId) return;
        const API = import.meta.env.VITE_API_URL || '/api';
        fetch(`${API}/clubs/${clubId}/site-images?_t=${Date.now()}`)
            .then(r => r.ok ? r.json() : {})
            .then(data => setImages(data))
            .catch(() => {});
    }, [clubId]);

    return images;
}
