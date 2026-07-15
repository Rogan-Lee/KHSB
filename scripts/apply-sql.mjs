// 일회성: additive SQL을 prod + dev DB에 적용. `node scripts/apply-sql.mjs <file.sql>`
import { readFileSync } from "node:fs";
import pg from "pg";

const dotenv = await import("dotenv");
dotenv.config({ path: ".env.local" });

const file = process.argv[2];
if (!file) throw new Error("usage: node scripts/apply-sql.mjs <file.sql>");
const sql = readFileSync(file, "utf8");

// DATABASE_URL(prod pooler)은 DDL에 부적합할 수 있어 DIRECT_URL 우선. dev는 DATABASE_URL_DEV.
const targets = [
  ["prod", process.env.DIRECT_URL || process.env.DATABASE_URL],
  ["dev", process.env.DATABASE_URL_DEV],
];

for (const [name, url] of targets) {
  if (!url) { console.log(`⚠️  ${name}: URL 없음, 건너뜀`); continue; }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`✅ ${name} 적용 완료`);
  } catch (e) {
    console.error(`❌ ${name} 실패:`, e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
