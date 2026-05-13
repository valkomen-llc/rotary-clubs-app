import React from 'react';
import { Globe, Search, ExternalLink, Eye } from 'lucide-react';

interface SEOPreviewProps {
    title: string;
    description: string;
    url: string;
    image?: string;
    /** Character limits for indicators */
    titleLimit?: number;
    descLimit?: number;
}

/**
 * SEOPreview — Simulates a Google SERP result in real-time.
 * Shows exactly how the page will appear in Google search results,
 * WhatsApp link preview, and Twitter/Facebook cards.
 *
 * Skills: SEO Content Writer + SEO Technical + React UI Patterns
 */
const SEOPreview: React.FC<SEOPreviewProps> = ({
    title,
    description,
    url,
    image,
    titleLimit = 60,
    descLimit = 160,
}) => {
    const displayTitle = title || 'Título de la página';
    const displayDesc = description || 'Agrega una meta descripción para mejorar la visibilidad en buscadores...';
    const displayUrl = url || 'https://tusitio.org';

    // Truncate to Google limits
    const truncTitle = displayTitle.length > titleLimit ? displayTitle.slice(0, titleLimit) + '...' : displayTitle;
    const truncDesc = displayDesc.length > descLimit ? displayDesc.slice(0, descLimit) + '...' : displayDesc;

    const titleLen = title.length;
    const descLen = description.length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
                    <Eye className="w-4 h-4 text-white" />
                </div>
                <div>
                    <h4 className="font-bold text-gray-800 text-sm">Previsualización SEO</h4>
                    <p className="text-[10px] text-gray-400 font-medium">Así se verá en Google y redes sociales</p>
                </div>
            </div>

            {/* Google SERP Preview */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <Search className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vista previa en Google</span>
                </div>
                <div className="space-y-1">
                    {/* URL breadcrumb */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Globe className="w-3 h-3 text-gray-400" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-600 truncate">{displayUrl}</p>
                        </div>
                    </div>
                    {/* Title */}
                    <h3 className="text-lg leading-snug" style={{ color: '#1a0dab', fontFamily: 'Arial, sans-serif' }}>
                        {truncTitle}
                    </h3>
                    {/* Description */}
                    <p className="text-sm leading-relaxed" style={{ color: '#4d5156', fontFamily: 'Arial, sans-serif' }}>
                        {truncDesc}
                    </p>
                </div>
            </div>

            {/* Social Card Preview (WhatsApp / Facebook) */}
            {image && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                        <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vista previa en redes sociales</span>
                    </div>
                    <div className="mx-5 mb-5 border border-gray-200 rounded-xl overflow-hidden">
                        <div className="h-40 bg-gray-100 overflow-hidden">
                            <img src={image} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="p-3 bg-gray-50 border-t border-gray-200">
                            <p className="text-[10px] text-gray-400 uppercase font-bold">{displayUrl.replace(/^https?:\/\//, '').split('/')[0]}</p>
                            <p className="text-sm font-bold text-gray-800 line-clamp-1 mt-0.5">{truncTitle}</p>
                            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{truncDesc}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Character Counters */}
            <div className="grid grid-cols-2 gap-4">
                <div className={`p-3 rounded-xl border ${titleLen > titleLimit ? 'bg-red-50 border-red-200' : titleLen > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Título</p>
                    <p className={`text-lg font-black ${titleLen > titleLimit ? 'text-red-600' : titleLen > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                        {titleLen}
                        <span className="text-xs font-bold text-gray-400">/{titleLimit}</span>
                    </p>
                    {titleLen > titleLimit && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">Google lo truncará</p>
                    )}
                </div>
                <div className={`p-3 rounded-xl border ${descLen > descLimit ? 'bg-red-50 border-red-200' : descLen > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Descripción</p>
                    <p className={`text-lg font-black ${descLen > descLimit ? 'text-red-600' : descLen > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                        {descLen}
                        <span className="text-xs font-bold text-gray-400">/{descLimit}</span>
                    </p>
                    {descLen > descLimit && (
                        <p className="text-[10px] text-red-500 font-medium mt-1">Google lo truncará</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SEOPreview;
