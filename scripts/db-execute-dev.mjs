// One-off DDL runner — runs `prisma db execute --file <path>` against DATABASE_URL_DEV.
// Same safety gates as db-push.mjs.
import { config } from "dotenv";
import { spawnSync } from "child_process";

config({ path: ".env.local" });
config();

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/db-execute-dev.mjs <sql-file>");
  process.exit(1);
}

const devUrl = process.env.DATABASE_URL_DEV;
const directUrl = process.env.DIRECT_URL;
const prodUrl = process.env.DATABASE_URL;

let urlToUse;
let source;

if (devUrl) {
  urlToUse = devUrl;
  source = "DATABASE_URL_DEV";
} else if (directUrl) {
  urlToUse = directUrl;
  source = "DIRECT_URL";
} else {
  console.error("❌ DATABASE_URL_DEV 또는 DIRECT_URL 이 .env 에 없습니다.");
  process.exit(1);
}

if (prodUrl && urlToUse === prodUrl) {
  console.error(`❌ ${source} 가 프로덕션 DATABASE_URL 과 동일합니다. 중단.`);
  process.exit(1);
}
if (urlToUse.includes("pooler.supabase.com") && urlToUse.includes(":6543")) {
  console.error(`❌ ${source} 가 Transaction mode pooler(6543) — DDL 부적합. 중단.`);
  process.exit(1);
}
const PROD_PROJECT_REF = "ulefrypbhdgbtkjjlnco";
if (urlToUse.includes(PROD_PROJECT_REF)) {
  console.error(`❌ ${source} 에 프로덕션 project-ref(${PROD_PROJECT_REF}) 포함. 중단.`);
  process.exit(1);
}

const masked = urlToUse.replace(/:[^:@/]+@/, ":***@");
console.log(`🔗 ${source} 로 db execute 실행: ${file}`);
console.log(`   대상: ${masked}`);

const result = spawnSync("npx", ["prisma", "db", "execute", "--file", file], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: urlToUse, DIRECT_URL: urlToUse },
});
process.exit(result.status ?? 1);
