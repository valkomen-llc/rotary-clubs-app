
import pkg from "pg";
const { Client } = pkg;
const client = new Client({ connectionString: "postgres://rotary_owner:zY8Hk0lXpQjx@ep-weathered-haze-a5p1n3e7.us-east-2.aws.neon.tech/rotary?sslmode=require" });
await client.connect();
const res = await client.query("SELECT id, email, role, "clubId" FROM "User" WHERE email = 'admin@rotarypasto.org'");
console.log(JSON.stringify(res.rows, null, 2));
await client.end();
