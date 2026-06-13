import {
    Route53DomainsClient,
    CheckDomainAvailabilityCommand,
    RegisterDomainCommand,
    TransferDomainCommand,
    GetOperationDetailCommand,
    ListPricesCommand
} from '@aws-sdk/client-route-53-domains';
import {
    Route53Client,
    ListHostedZonesByNameCommand,
    CreateHostedZoneCommand,
    ChangeResourceRecordSetsCommand
} from '@aws-sdk/client-route-53';
import { PrismaClient } from '@prisma/client';
import VercelService from './VercelService.js';

const prisma = new PrismaClient();

const awsConfig = {
    region: 'us-east-1', // Route53 Domains solo opera en us-east-1
    credentials: {
        accessKeyId: process.env.ROTARY_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.ROTARY_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
    }
};

const route53DomainsClient = new Route53DomainsClient(awsConfig);
const route53Client = new Route53Client(awsConfig);

// Vercel sirve los apex con un A-record a esta IP y los www con CNAME.
const VERCEL_A_RECORD = '76.76.21.21';
const VERCEL_CNAME = 'cname.vercel-dns.com';

/**
 * Motor de aprovisionamiento de dominios de Club Platform.
 *
 * Soporta los tres caminos que el equipo pidió, todos restringidos a `.org`:
 *   - comprar    → registerDomain()  (Route53 RegisterDomain, costo real)
 *   - transferir → transferDomain()  (Route53 TransferDomain, requiere AuthCode/EPP)
 *   - conectar   → connectDomain()   (dominio externo: solo Vercel + instrucciones DNS)
 *
 * El registro y la transferencia son operaciones ASÍNCRONAS en AWS (devuelven un
 * OperationId y tardan minutos/horas). Por eso el dominio se asigna al club y se
 * agrega a Vercel de inmediato, y los registros DNS en Route53 se inyectan cuando
 * la operación llega a SUCCESSFUL (via getOperationStatus, que finaliza el DNS).
 */
class DomainProvisioningService {

    // ── Helpers de dominio ────────────────────────────────────────────────
    static normalizeDomain(domain) {
        if (!domain) return '';
        return String(domain)
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/')[0]
            .trim();
    }

    /** Política del equipo: todos los dominios deben ser `.org`. */
    static assertOrg(domain) {
        const clean = this.normalizeDomain(domain);
        if (!clean.endsWith('.org')) {
            const err = new Error('Solo se permiten dominios .org en Club Platform.');
            err.code = 'TLD_NOT_ALLOWED';
            throw err;
        }
        return clean;
    }

    /**
     * Datos WHOIS del titular. Por defecto usamos un contacto único de la
     * organización (configurable por env); con privacidad activada el WHOIS
     * público queda enmascarado de todas formas.
     */
    static getContactDetails() {
        return {
            FirstName: process.env.DOMAIN_CONTACT_FIRST_NAME || 'Daniel',
            LastName: process.env.DOMAIN_CONTACT_LAST_NAME || 'Pena',
            ContactType: 'COMPANY',
            OrganizationName: process.env.DOMAIN_CONTACT_ORG || 'Valkomen LLC',
            AddressLine1: process.env.DOMAIN_CONTACT_ADDRESS || '123 Rotary Ave',
            City: process.env.DOMAIN_CONTACT_CITY || 'Bogota',
            CountryCode: process.env.DOMAIN_CONTACT_COUNTRY || 'CO', // ISO 3166-1 alpha-2
            ZipCode: process.env.DOMAIN_CONTACT_ZIP || '110111',
            PhoneNumber: process.env.DOMAIN_CONTACT_PHONE || '+57.3000000000',
            Email: process.env.DOMAIN_CONTACT_EMAIL || 'daniel@valkomen.com'
        };
    }

    // ── Consultas (disponibilidad / precio) ───────────────────────────────
    static async checkAvailability(domain) {
        const clean = this.assertOrg(domain);
        const response = await route53DomainsClient.send(
            new CheckDomainAvailabilityCommand({ DomainName: clean })
        );
        return {
            domain: clean,
            status: response.Availability,
            isAvailable: response.Availability === 'AVAILABLE'
        };
    }

    /** Precio de registro/renovación/transferencia del TLD .org en USD. */
    static async getPrice() {
        try {
            const response = await route53DomainsClient.send(
                new ListPricesCommand({ Tld: 'org' })
            );
            const price = (response.Prices || [])[0];
            if (!price) return null;
            return {
                tld: 'org',
                currency: price.RegistrationPrice?.Currency || 'USD',
                registration: price.RegistrationPrice?.Price ?? null,
                renewal: price.RenewalPrice?.Price ?? null,
                transfer: price.TransferPrice?.Price ?? null
            };
        } catch (error) {
            console.error('[DomainProvisioning] Error obteniendo precio .org:', error.message);
            return null;
        }
    }

    // ── Comprar (registrar) ───────────────────────────────────────────────
    static async registerDomain(clubId, domain) {
        const clean = this.assertOrg(domain);
        console.log(`[DomainProvisioning] Registrando ${clean} para el club ${clubId}...`);

        const contact = this.getContactDetails();
        const response = await route53DomainsClient.send(new RegisterDomainCommand({
            DomainName: clean,
            DurationInYears: 1,
            AutoRenew: true,
            AdminContact: contact,
            RegistrantContact: contact,
            TechContact: contact,
            PrivacyProtectAdminContact: true,
            PrivacyProtectRegistrantContact: true,
            PrivacyProtectTechContact: true
        }));

        // Reservamos el dominio en el club y lo agregamos a Vercel de una vez.
        await this.assignToClub(clubId, clean);
        await VercelService.addDomain(clean);

        console.log(`[DomainProvisioning] Registro enviado. OperationId: ${response.OperationId}`);
        return { operationId: response.OperationId, domain: clean, mode: 'register' };
    }

    // ── Transferir ────────────────────────────────────────────────────────
    static async transferDomain(clubId, domain, authCode) {
        const clean = this.assertOrg(domain);
        if (!authCode) {
            const err = new Error('Falta el código de autorización (EPP) del registrador actual.');
            err.code = 'MISSING_AUTH_CODE';
            throw err;
        }
        console.log(`[DomainProvisioning] Transfiriendo ${clean} para el club ${clubId}...`);

        const contact = this.getContactDetails();
        const response = await route53DomainsClient.send(new TransferDomainCommand({
            DomainName: clean,
            DurationInYears: 1,
            AuthCode: authCode,
            AutoRenew: true,
            AdminContact: contact,
            RegistrantContact: contact,
            TechContact: contact,
            PrivacyProtectAdminContact: true,
            PrivacyProtectRegistrantContact: true,
            PrivacyProtectTechContact: true
        }));

        await this.assignToClub(clubId, clean);
        await VercelService.addDomain(clean);

        console.log(`[DomainProvisioning] Transferencia enviada. OperationId: ${response.OperationId}`);
        return { operationId: response.OperationId, domain: clean, mode: 'transfer' };
    }

    // ── Conectar (dominio externo, otro registrador) ──────────────────────
    static async connectDomain(clubId, domain) {
        const clean = this.assertOrg(domain);
        console.log(`[DomainProvisioning] Conectando dominio externo ${clean} al club ${clubId}...`);

        await this.assignToClub(clubId, clean);
        const vercel = await VercelService.addDomain(clean);

        // El dominio vive en otro registrador: devolvemos las instrucciones DNS
        // para que el dueño apunte el dominio a Vercel manualmente.
        return {
            domain: clean,
            mode: 'connect',
            vercel,
            dnsInstructions: this.getDnsInstructions(clean)
        };
    }

    // ── Estado de operación (registro/transferencia) ──────────────────────
    static async getOperationStatus(operationId, domain) {
        const response = await route53DomainsClient.send(
            new GetOperationDetailCommand({ OperationId: operationId })
        );
        const status = response.Status; // SUBMITTED | IN_PROGRESS | SUCCESSFUL | ERROR | FAILED

        // Cuando AWS termina, ya existe la Hosted Zone autocreada: inyectamos el DNS.
        if (status === 'SUCCESSFUL' && domain) {
            try {
                await this.provisionDns(this.normalizeDomain(domain));
            } catch (dnsError) {
                console.error('[DomainProvisioning] DNS post-operación falló:', dnsError.message);
            }
        }

        return {
            operationId,
            status,
            type: response.Type,
            domain: response.DomainName || domain,
            message: response.Message || null
        };
    }

    // ── DNS: apuntar el dominio a Vercel en Route53 ───────────────────────
    static async provisionDns(domain) {
        const clean = this.normalizeDomain(domain);

        // Al registrar/transferir, AWS autocrea una Hosted Zone pública.
        // La buscamos por nombre; si no existe (caso borde), la creamos.
        let hostedZoneId;
        const listed = await route53Client.send(
            new ListHostedZonesByNameCommand({ DNSName: `${clean}.` })
        );
        const match = (listed.HostedZones || []).find(
            (z) => z.Name === `${clean}.` && !z.Config?.PrivateZone
        );

        if (match) {
            hostedZoneId = match.Id.split('/').pop();
        } else {
            const created = await route53Client.send(new CreateHostedZoneCommand({
                Name: clean,
                CallerReference: `${Date.now()}-${clean}`,
                HostedZoneConfig: { Comment: `Zona gestionada por Club Platform`, PrivateZone: false }
            }));
            hostedZoneId = created.HostedZone.Id.split('/').pop();
        }

        await route53Client.send(new ChangeResourceRecordSetsCommand({
            HostedZoneId: hostedZoneId,
            ChangeBatch: {
                Comment: 'Apuntar dominio a Vercel (Club Platform)',
                Changes: [
                    {
                        Action: 'UPSERT',
                        ResourceRecordSet: {
                            Name: clean, Type: 'A', TTL: 300,
                            ResourceRecords: [{ Value: VERCEL_A_RECORD }]
                        }
                    },
                    {
                        Action: 'UPSERT',
                        ResourceRecordSet: {
                            Name: `www.${clean}`, Type: 'CNAME', TTL: 300,
                            ResourceRecords: [{ Value: VERCEL_CNAME }]
                        }
                    }
                ]
            }
        }));

        console.log(`[DomainProvisioning] DNS de ${clean} apuntado a Vercel (zona ${hostedZoneId}).`);
        return { hostedZoneId };
    }

    static getDnsInstructions(domain) {
        const clean = this.normalizeDomain(domain);
        return [
            { host: '@', type: 'A', value: VERCEL_A_RECORD, note: `Apex (${clean})` },
            { host: 'www', type: 'CNAME', value: VERCEL_CNAME, note: `www.${clean}` }
        ];
    }

    static async assignToClub(clubId, domain) {
        const clean = this.normalizeDomain(domain);
        await prisma.club.update({
            where: { id: clubId },
            data: { domain: clean }
        });
    }

    /**
     * Flujo completo "todo automático" (autoservicio del club tras activar el plan):
     * registra el dominio y deja el DNS encaminado. Mantiene compatibilidad con
     * cualquier llamada previa a provisionEcosystem.
     */
    static async provisionEcosystem(clubId, domainName) {
        return this.registerDomain(clubId, domainName);
    }
}

export default DomainProvisioningService;
