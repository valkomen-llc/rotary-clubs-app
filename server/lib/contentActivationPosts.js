// Publicaciones recientes del blog/sitio para emails de Campañas.
// Consulta Post del sitio remitente; nunca mezcla entre sitios.
import db from './db.js';

export async function getRecentPostsForSite(siteId, { limit = 4 } = {}) {
  if (!siteId) return [];
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.title, p.slug, p.image, p.images, p."createdAt",
              pc.name AS category_name, pc.color AS category_color,
              COALESCE(p."htmlContent", p.description, '') AS content
       FROM "Post" p
       LEFT JOIN "PostCategory" pc ON pc.id = p."categoryId"
       WHERE p."targetClubIds" @> ARRAY[$1]::uuid[]
         AND p.published = TRUE
         AND p."deletedAt" IS NULL
       ORDER BY p."createdAt" DESC
       LIMIT $2`,
      [siteId, limit]
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      image: r.image || (r.images?.[0] || null),
      category: r.category_name || '',
      categoryColor: r.category_color || '',
      excerpt: extractExcerpt(r.content, 160),
      url: r.slug,
      publishedAt: r.createdAt,
    }));
  } catch { return []; }
}

function extractExcerpt(html, maxLen = 160) {
  if (!html) return '';
  let t = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > maxLen) t = t.slice(0, maxLen).trim() + '…';
  return t;
}

// Resuelve la URL pública del post en el dominio del sitio.
export function postPublicUrl(siteHost, postSlug) {
  if (!siteHost || !postSlug) return '';
  const h = String(siteHost).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const s = String(postSlug).replace(/^\/+/, '');
  return `https://${h}/blog/${s}`;
}