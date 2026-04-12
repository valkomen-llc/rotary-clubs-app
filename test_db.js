import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function run() {
  await client.connect();
  const res = await client.query(`SELECT id, name, type, domain, subdomain FROM "Club" WHERE name ILIKE '%LATIR%';`);
  console.log(res.rows);
  
  if (res.rows.length > 0) {
      const id = res.rows[0].id;
      // Clear domain and set subdomain to latir
      await client.query(`UPDATE "Club" SET domain = null, subdomain = 'latir' WHERE id = $1`, [id]);
      console.log('Update successful!');
  }
  
  await client.end();
}

run();
