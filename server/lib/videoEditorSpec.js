// ════════════════════════════════════════════════════════════════════════════
// Especificaciones y Fuente de Verdad del Editor de Video — v4.1141.0
//
// Formatos, resoluciones, transiciones, estilos de texto, subtítulos y validaciones.
// ════════════════════════════════════════════════════════════════════════════

export const ASPECT_RATIOS = {
    '16:9': {
        key: '16:9',
        label: '16:9 Horizontal',
        description: 'YouTube, web, pantallas panorámicas y presentaciones',
        ratio: 16 / 9,
        resolutions: {
            '1080p': { width: 1920, height: 1080, label: '1080p Full HD' },
            '720p': { width: 1280, height: 720, label: '720p HD' }
        },
        defaultResolution: '1080p'
    },
    '9:16': {
        key: '9:16',
        label: '9:16 Vertical',
        description: 'Reels, Shorts, TikTok y Stories móviles',
        ratio: 9 / 16,
        resolutions: {
            '1080p': { width: 1080, height: 1920, label: '1080p Full HD' },
            '720p': { width: 720, height: 1280, label: '720p HD' }
        },
        defaultResolution: '1080p'
    },
    '1:1': {
        key: '1:1',
        label: '1:1 Cuadrado',
        description: 'Feed de Instagram, LinkedIn y publicaciones sociales',
        ratio: 1 / 1,
        resolutions: {
            '1080p': { width: 1080, height: 1080, label: '1080p' },
            '720p': { width: 720, height: 720, label: '720p' }
        },
        defaultResolution: '1080p'
    },
    '4:5': {
        key: '4:5',
        label: '4:5 Retrato',
        description: 'Instagram Feed vertical optimizado',
        ratio: 4 / 5,
        resolutions: {
            '1080p': { width: 1080, height: 1350, label: '1080p' },
            '720p': { width: 720, height: 900, label: '720p' }
        },
        defaultResolution: '1080p'
    }
};

export const TRANSITIONS = {
    fade: {
        key: 'fade',
        label: 'Fundido',
        description: 'Fundido a negro suave y elegante',
        ffmpegFilter: 'fade',
        defaultDuration: 0.5
    },
    dissolve: {
        key: 'dissolve',
        label: 'Disolución',
        description: 'Transición cruzada continua entre clips',
        ffmpegFilter: 'dissolve',
        defaultDuration: 0.5
    },
    slide_left: {
        key: 'slide_left',
        label: 'Desplazamiento Izq.',
        description: 'Movimiento horizontal dinámico hacia la izquierda',
        ffmpegFilter: 'slideleft',
        defaultDuration: 0.5
    },
    slide_right: {
        key: 'slide_right',
        label: 'Desplazamiento Der.',
        description: 'Movimiento horizontal dinámico hacia la derecha',
        ffmpegFilter: 'slideright',
        defaultDuration: 0.5
    },
    zoom_in: {
        key: 'zoom_in',
        label: 'Zoom Suave',
        description: 'Acercamiento cinemático fluido',
        ffmpegFilter: 'zoomin',
        defaultDuration: 0.5
    }
};

export const DEFAULT_SUBTITLE_STYLE = {
    fontFamily: 'Inter',
    fontSize: 28,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    position: 'bottom', // 'bottom' | 'center' | 'top'
    align: 'center',    // 'left' | 'center' | 'right'
    fontWeight: 'bold',
    borderRadius: 8,
    padding: '6px 14px'
};

export const DEFAULT_TRACKS = [
    {
        id: 'track-text',
        name: 'Texto',
        type: 'text',
        order: 1,
        muted: false,
        locked: false,
        visible: true
    },
    {
        id: 'track-subtitles',
        name: 'Subtítulos IA',
        type: 'subtitles',
        order: 2,
        muted: false,
        locked: false,
        visible: true
    },
    {
        id: 'track-video-overlay',
        name: 'Video / B-Roll',
        type: 'video',
        order: 3,
        muted: false,
        locked: false,
        visible: true
    },
    {
        id: 'track-video-main',
        name: 'Video Principal',
        type: 'video',
        order: 4,
        muted: false,
        locked: false,
        visible: true
    },
    {
        id: 'track-voice',
        name: 'Locución / Voz',
        type: 'audio',
        order: 5,
        muted: false,
        locked: false,
        visible: true
    },
    {
        id: 'track-music',
        name: 'Música de fondo',
        type: 'audio',
        order: 6,
        muted: false,
        locked: false,
        visible: true
    }
];

export function resolveDimensions(format = '16:9', resolution = '1080p') {
    const fmt = ASPECT_RATIOS[format] || ASPECT_RATIOS['16:9'];
    const res = fmt.resolutions[resolution] || fmt.resolutions['1080p'] || { width: 1920, height: 1080 };
    return {
        width: res.width,
        height: res.height,
        ratio: fmt.ratio,
        label: `${fmt.label} (${res.width}x${res.height})`
    };
}

export function formatTimecode(seconds = 0) {
    const s = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}
