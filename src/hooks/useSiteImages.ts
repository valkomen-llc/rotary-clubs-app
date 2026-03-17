import { useState, useEffect } from 'react';
import { useClub } from '../contexts/ClubContext';

interface ImgSlot { url: string; alt: string; }
export interface SiteImages {
    hero?: ImgSlot[];
    causes?: ImgSlot[];
    foundation?: ImgSlot;
    join?: ImgSlot;
}

const cache: Record<string, SiteImages> = {};

export function useSiteImages(): SiteImages {
    const { club } = useClub();
    const [images, setImages] = useState<SiteImages>({});
    const clubId = (club as any)?.id;

    useEffect(() => {
        if (!clubId) return;
        if (cache[clubId]) { setImages(cache[clubId]); return; }
        const API = import.meta.env.VITE_API_URL || '/api';
        fetch(`${API}/clubs/${clubId}/site-images`)
            .then(r => r.ok ? r.json() : {})
            .then(data => { cache[clubId] = data; setImages(data); })
            .catch(() => {});
    }, [clubId]);

    return images;
}
