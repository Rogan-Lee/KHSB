// additive SQL 적용 스크립트 — scripts/sql/*.sql 을 지정 DB에 statement 단위로 실행.
// 사용: node scripts/apply-additive-sql.mjs <sql파일> <ENV_KEY(.env.local의 URL 키)>
// 예:   node scripts/apply-additive-sql.mjs scripts/sql/2026-09-22-phase2-5-additive.sql DATABASE_URL_DEV
import { readFileSync } from "node:fs";
import pg from "pg";

const [, , sqlPath, envKey] = process.argv;
if (!sqlPath || !envKey) {
  console.error("usage: node scripts/apply-additive-sql.mjs <sql> <ENV_KEY>");
  process.exit(1);
}
// .env.local 직접 파싱 (dotenv 의존 없이)
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
let url = env[envKey];
if (!url) { console.error(`${envKey} not found in .env.local`); process.exit(1); }
// DDL은 pgbouncer transaction pooler(6543) 대신 session pooler(5432)로
url = url.replace(":6543/", ":5432/").replace(/[?&]pgbouncer=true/, "").replace(/[?&]connection_limit=\d+/, "").replace(/\?$/, "");

const sql = readFileSync(sqlPath, "utf8");
// 주석 제거 후 세미콜론 단위 분리 (DO $$...$$ 블록 보존)
const statements = [];
let buf = "", inDollar = false;
for (const line of sql.split("\n")) {
  const trimmed = line.trim();
  if (!inDollar && trimmed.startsWith("--")) continue;
  buf += line + "\n";
  const dollarCount = (buf.match(/\$\$/g) || []).length;
  inDollar = dollarCount % 2 === 1;
  if (!inDollar && trimmed.endsWith(";")) {
    const stmt = buf.trim();
    if (stmt && stmt !== ";") statements.push(stmt);
    buf = "";
  }
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const host = url.match(/@([^/]+)\//)?.[1] ?? "?";
const ref = url.match(/postgres\.([a-z]+):/)?.[1]?.slice(0, 8) ?? "?";
console.log(`Applying ${statements.length} statements to ${ref}… @ ${host}`);
let ok = 0;
for (const stmt of statements) {
  const head = stmt.split("\n")[0].slice(0, 70);
  try {
    await client.query(stmt);
    ok++;
  } catch (e) {
    console.error(`✗ ${head}\n  → ${e.message}`);
    await client.end();
    process.exit(1);
  }
}
console.log(`✓ ${ok}/${statements.length} 적용 완료`);
await client.end();
