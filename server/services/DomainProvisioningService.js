import { Route53DomainsClient, RegisterDomainCommand } from '@aws-sdk/client-route-53-domains';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const route53DomainsClient = new Route53DomainsClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    }
});

class DomainProvisioningService {
    
    static async provisionEcosystem(clubId, domainName) {
        console.log(`[DomainProvisioning] Iniciando provisión del ecosistema para el club ${clubId} con el dominio ${domainName}`);
        
        try {
            // 1. Registrar el dominio en AWS Route 53
            // NOTA: Requiere que el usuario de AWS tenga permisos de route53domains:*
            console.log(`[DomainProvisioning] Enviando comando de registro a AWS para ${domainName}...`);
            const registerCommand = new RegisterDomainCommand({
                DomainName: domainName,
                DurationInYears: 1,
                // Admin/Registrant Contact details should technically match Valkomen LLC or the Club
                AdminContact: this.getContactDetails(),
                RegistrantContact: this.getContactDetails(),
                TechContact: this.getContactDetails(),
                AutoRenew: true,
                PrivacyProtectAdminContact: true,
                PrivacyProtectRegistrantContact: true,
                PrivacyProtectTechContact: true
            });

            // En producción, descomentar la siguiente línea cuando los permisos IAM estén listos.
            // const registerResponse = await route53DomainsClient.send(registerCommand);
            // console.log(`[DomainProvisioning] Dominio registrado exitosamente. Operation ID: ${registerResponse.OperationId}`);

            // 2. Aquí iría la lógica de Route 53 (Crear Hosted Zone y setear DNS)
            // (Se implementará en el siguiente paso de la fase técnica)

            // 3. Actualizar la base de datos (Asignar dominio al club)
            console.log(`[DomainProvisioning] Asignando el dominio al Club en la Base de Datos...`);
            await prisma.club.update({
                where: { id: clubId },
                data: { domain: domainName }
            });

            console.log(`[DomainProvisioning] Ecosistema para ${domainName} aprovisionado correctamente.`);
            return true;

        } catch (error) {
            console.error(`[DomainProvisioning] Error crítico al aprovisionar el dominio ${domainName}:`, error);
            throw error;
        }
    }

    static getContactDetails() {
        return {
            FirstName: 'Daniel',
            LastName: 'Pena',
            ContactType: 'COMPANY',
            OrganizationName: 'Valkomen LLC',
            AddressLine1: '123 Rotary Ave',
            City: 'Bogota',
            CountryCode: 'CO', // ISO 3166-1 alpha-2
            ZipCode: '110111',
            PhoneNumber: '+57.3000000000',
            Email: 'daniel@valkomen.com'
        };
    }
}

export default DomainProvisioningService;
