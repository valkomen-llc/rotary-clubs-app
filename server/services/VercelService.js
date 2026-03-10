import axios from 'axios';

class VercelService {
    constructor() {
        this.apiToken = process.env.VERCEL_ACCESS_TOKEN;
        this.projectId = process.env.VERCEL_PROJECT_ID;
        this.teamId = process.env.VERCEL_TEAM_ID; // Opcional, si el proyecto está en un equipo en lugar de cuenta personal
        this.baseUrl = 'https://api.vercel.com';
    }

    /**
     * Agrega un nuevo dominio personalizado al proyecto en Vercel
     * @param {string} domain - El dominio a agregar (ej: rotarybogota.org)
     * @returns {Promise<Object>} Resultado de la operación
     */
    async addDomain(domain) {
        if (!this.apiToken || !this.projectId) {
            console.warn('⚠️ No se pueden automatizar dominios: Faltan credenciales de Vercel en el archivo .env (VERCEL_ACCESS_TOKEN, VERCEL_PROJECT_ID)');
            return { success: false, error: 'Credenciales Vercel no configuradas' };
        }

        try {
            // Documentación: https://vercel.com/docs/rest-api/endpoints/projects#add-a-domain-to-a-project
            let url = `${this.baseUrl}/v10/projects/${this.projectId}/domains`;
            if (this.teamId) {
                url += `?teamId=${this.teamId}`;
            }

            const response = await axios.post(
                url,
                { name: domain },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            console.log(`✅ Dominio ${domain} registrado exitosamente en Vercel.`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error(`❌ Error al registrar dominio ${domain} en Vercel:`, error.response?.data || error.message);
            // Si el dominio ya existe, Vercel suele retornar un error 400 (Domain is already in use)
            // Evaluamos si es ese caso para no botar la app
            const errorMessage = error.response?.data?.error?.message || 'Error desconocido';
            return {
                success: false,
                error: errorMessage,
                code: error.response?.data?.error?.code
            };
        }
    }

    /**
     * Verifica el estado de configuración DNS de un dominio en Vercel
     * @param {string} domain 
     */
    async verifyDomain(domain) {
        if (!this.apiToken || !this.projectId) return { success: false };

        try {
            let url = `${this.baseUrl}/v9/projects/${this.projectId}/domains/${domain}`;
            if (this.teamId) {
                url += `?teamId=${this.teamId}`;
            }

            const response = await axios.get(
                url,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return { success: true, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

export default new VercelService();
