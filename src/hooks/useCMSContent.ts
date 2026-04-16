import { useState, useEffect } from 'react';

interface CMSSection {
    id: string;
    page: string;
    section: string;
    content: string; // JSON string
}

export const useCMSContent = (page: string, clubId?: string) => {
    const [sections, setSections] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(true);

    const fetchSections = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            // We fetch both global (null clubId) and club-specific sections
            // Our backend getPublicSections handles one clubId at a time.
            // Simplified for now: fetch the specific club's sections.
            const response = await fetch(`${apiUrl}/clubs/${clubId || 'global'}/sections?page=${page}&clubId=${clubId || ''}`);

            if (response.ok) {
                const data: CMSSection[] = await response.json();
                const mapped: Record<string, any> = {};
                data.forEach(s => {
                    try {
                        mapped[s.section] = typeof s.content === 'string' ? JSON.parse(s.content) : s.content;
                    } catch (e) {
                        mapped[s.section] = s.content;
                    }
                });
                setSections(mapped);
            }
        } catch (error) {
            console.error('Error fetching CMS content:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSections();
    }, [page, clubId]);

    return { sections, isLoading, refresh: fetchSections };
};
