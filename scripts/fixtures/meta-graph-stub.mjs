// La Graph API de Meta, sustituida. Devuelve la MISMA forma que
// `server/services/metaService.js`: un doble con otra forma dejaría en verde
// un código que en producción no sabe leer la respuesta (la lección de v4.901).

let estado = { pages: [], instagram: {}, profile: { id: 'u', name: 'Usuario' } };
export const reset = (e = {}) => { estado = { pages: [], instagram: {}, profile: { id: 'u', name: 'Usuario' }, ...e }; };

export const META_SCOPES = [
    'pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
    'pages_manage_metadata', 'instagram_basic', 'instagram_content_publish', 'business_management',
];

export const getMetaUserProfile = async () => ({ ...estado.profile, avatar: null });

const comoPagina = (p) => ({
    id: p.id, name: p.name, category: p.category || null,
    accessToken: p.accessToken, avatar: p.avatar || null, tasks: p.tasks || [],
    sources: p.sources || ['rol directo'],
});

// La forma REAL del descubrimiento: `{ pages, sources, notes }`. Un doble con
// otra forma dejaría en verde un sincronizador que en producción no sabe leer
// lo que recibe (la lección de v4.901).
// Devuelve LA MISMA FORMA que el módulo real: un doble que devuelve de menos
// deja en verde a quien lee un campo que en producción sí llega (v4.1005).
export const discoverUserPages = async () => ({
    pages: estado.pages.map(comoPagina),
    sources: [{ source: 'me/accounts', count: estado.pages.length }],
    notes: estado.discoveryNotes || [],
    granted: estado.granted || [],
    unresolved: estado.unresolved || [],
});

export const getUserPages = async () => estado.pages.map(comoPagina);

export const getInstagramBusinessForPage = async ({ pageId }) => estado.instagram[pageId] || null;

export const buildAuthUrl = () => 'https://www.facebook.com/dialog/oauth';
export const exchangeCodeForUserToken = async () => ({ token: 'corto' });
export const exchangeForLongLivedUserToken = async () => ({ token: 'user-largo', expiresAt: null });
export const verifyToken = async () => true;
