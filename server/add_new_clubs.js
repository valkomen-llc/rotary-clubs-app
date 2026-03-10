import pg from 'pg';
const { Client } = pg;

const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
});

async function addClubs() {
    const clubsData = [
        {
            name: "Rotary Pasto",
            subdomain: "pasto",
            city: "Pasto",
            country: "Colombia",
            district: "4281",
            status: "active"
        },
        {
            name: "Rotary Bogotá Usaquén",
            subdomain: "usaquen",
            city: "Bogotá",
            country: "Colombia",
            district: "4281",
            status: "active"
        },
        {
            name: "Rotary Armenia International",
            subdomain: "armenia",
            city: "Armenia",
            country: "Colombia",
            district: "4281",
            status: "active"
        },
        {
            name: "Rotary Buenaventura Pacífico",
            subdomain: "buenaventura",
            city: "Buenaventura",
            country: "Colombia",
            district: "4281",
            status: "active"
        },
        {
            name: "Rotary Nuevo Cali",
            subdomain: "nuevocali",
            city: "Cali",
            country: "Colombia",
            district: "4281",
            status: "active"
        }
    ];

    try {
        await client.connect();
        for (const club of clubsData) {
            const query = `
                INSERT INTO "Club" (name, subdomain, city, country, district, status, "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                ON CONFLICT (subdomain) DO UPDATE 
                SET name = EXCLUDED.name, city = EXCLUDED.city, "updatedAt" = NOW();
            `;
            await client.query(query, [club.name, club.subdomain, club.city, club.country, club.district, club.status]);
            console.log(`Club ${club.name} procesado.`);
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.end();
    }
}

addClubs();
