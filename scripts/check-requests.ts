import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const results = await sql`
    SELECT id, title, description, category, priority, "relatedPage" 
    FROM "FeatureRequest" 
    WHERE status = 'PENDING' 
    ORDER BY CASE WHEN priority = 'URGENT' THEN 0 ELSE 1 END, "createdAt" ASC 
    LIMIT 1
  `;
  console.log(JSON.stringify(results, null, 2));
}

main().catch(e => { console.error(e.message); process.exit(1); });
