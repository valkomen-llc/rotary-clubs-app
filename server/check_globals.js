import db from './lib/db.js';
async function run() {
  try {
    const posts = await db.query('SELECT id, title, "clubId", published FROM "Post" WHERE "clubId" IS NULL');
    console.log('Global Posts:', posts.rows);
    const projects = await db.query('SELECT id, title, "clubId" FROM "Project" WHERE "clubId" IS NULL');
    console.log('Global Projects:', projects.rows);
  } catch (e) { console.error(e) }
  process.exit(0);
}
run();
