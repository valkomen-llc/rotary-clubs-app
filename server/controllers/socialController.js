import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Configuración de la App de Facebook (deberían venir de .env)
const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const REDIRECT_URI = `${process.env.APP_URL}/api/social/callback/facebook`;

export const socialController = {
    // Paso 1: Generar URL de autorización
    getFacebookAuthUrl: (req, res) => {
        const scope = 'pages_show_list,pages_read_engagement,pages_manage_posts,public_profile';
        const url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${REDIRECT_URI}&scope=${scope}&display=popup`;
        res.json({ url });
    },

    // Paso 2: Callback y obtención de Token de larga duración
    handleFacebookCallback: async (req, res) => {
        const { code } = req.query;
        const hostname = req.hostname;
        
        if (!code) return res.redirect('/admin/social-hub?status=error&message=no_code');

        try {
            const club = await prisma.club.findFirst({ 
                where: { OR: [{ domain: hostname }, { subdomain: hostname.split('.')[0] }] } 
            });

            if (!club) throw new Error('Club no identificado');

            // Intreducir Token
            const tokenResponse = await axios.get(`https://graph.facebook.com/v18.0/oauth/access_token`, {
                params: {
                    client_id: FB_APP_ID,
                    client_secret: FB_APP_SECRET,
                    redirect_uri: REDIRECT_URI,
                    code
                }
            });

            const userAccessToken = tokenResponse.data.access_token;

            // Info del usuario y sus páginas
            const userInfo = await axios.get(`https://graph.facebook.com/v18.0/me?fields=id,name,picture`, {
                params: { access_token: userAccessToken }
            });

            // Guardar en SocialAccount
            await prisma.socialAccount.upsert({
                where: { id: `fb-${userInfo.data.id}` }, // ID único compuesto
                update: {
                    accessToken: userAccessToken,
                    accountName: userInfo.data.name,
                    avatar: userInfo.data.picture?.data?.url,
                    status: 'active',
                    updatedAt: new Date()
                },
                create: {
                    id: `fb-${userInfo.data.id}`,
                    clubId: club.id,
                    platform: 'facebook',
                    platformId: userInfo.data.id,
                    accountName: userInfo.data.name,
                    accessToken: userAccessToken,
                    avatar: userInfo.data.picture?.data?.url,
                    status: 'active'
                }
            });

            res.redirect('/admin/social-hub?status=success&platform=facebook');

        } catch (error) {
            console.error('Error en OAuth FB:', error.response?.data || error.message);
            res.redirect('/admin/social-hub?status=error&message=sync_failed');
        }
    },

    // Obtener cuentas vinculadas
    getConnectedAccounts: async (req, res) => {
        const hostname = req.hostname;
        try {
            const club = await prisma.club.findFirst({ 
                where: { OR: [{ domain: hostname }, { subdomain: hostname.split('.')[0] }] } 
            });
            if (!club) return res.status(404).json({ error: 'Club no encontrado' });

            const accounts = await prisma.socialAccount.findMany({
                where: { clubId: club.id }
            });
            res.json(accounts);
        } catch (error) {
            res.status(500).json({ error: 'Error al obtener cuentas' });
        }
    }
};
