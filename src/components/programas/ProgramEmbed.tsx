/**
 * Programas — embebido seguro (v4.1280.0)
 *
 * Nunca HTML arbitrario: sólo un `src` que `resolveEmbed` reconoció (YouTube
 * nocookie, Spotify, Vimeo). Fachada perezosa: el iframe se carga al pulsar.
 */
import { useState } from 'react';
import { Play } from 'lucide-react';
import { resolveEmbed, type Embed } from '../../lib/programSpec';

interface Props {
    url?: string | null;
    embed?: Embed | null;
    title?: string;
    className?: string;
}

const ProgramEmbed = ({ url, embed, title = 'Contenido multimedia', className = '' }: Props) => {
    const [open, setOpen] = useState(false);
    const e = embed || resolveEmbed(url || '');
    if (!e) return null;
    const compact = e.provider === 'spotify';
    const height = e.aspect === 'compact' ? 152 : e.aspect === 'podcast' ? 232 : undefined;
    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`relative w-full rounded-2xl overflow-hidden bg-gray-900 text-white flex items-center justify-center gap-3 ${compact ? 'py-8' : 'aspect-video'} ${className}`}
                aria-label={`Reproducir: ${title}`}
            >
                <span className="w-14 h-14 rounded-full bg-white/90 text-rotary-blue flex items-center justify-center shadow-lg"><Play className="w-6 h-6 ml-0.5" /></span>
                <span className="text-sm font-medium">{e.provider === 'spotify' ? 'Escuchar en Spotify' : 'Reproducir video'}</span>
            </button>
        );
    }
    return (
        <div className={`rounded-2xl overflow-hidden bg-black ${compact ? '' : 'aspect-video'} ${className}`} style={compact ? { height } : undefined}>
            <iframe
                src={e.src}
                title={title}
                className="w-full h-full"
                style={compact ? { height } : undefined}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
            />
        </div>
    );
};

export default ProgramEmbed;
