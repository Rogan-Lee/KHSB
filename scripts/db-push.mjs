// db:push 실행 스크립트.
// - DIRECT_URL(non-pooler 직결)이 있으면 그걸로 실행 — DDL 에 가장 안전.
// - 없으면 DATABASE_URL 로 폴백하되 경고. Supabase pooler(pgbouncer)는 일부 DDL 에 제약이 있을 수 있음.
import { config } from "dotenv";
import { spawnSync } from "child_process";

config({ path: ".env.local" });
config(); // .env 도 함께 로드 (.env.local 우선)

const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;

let urlToUse = directUrl;

if (!directUrl) {
  if (!databaseUrl) {
    console.error("❌ DIRECT_URL 과 DATABASE_URL 모두 .env 에 없습니다.");
    process.exit(1);
  }
  console.warn("⚠️  DIRECT_URL 미설정 — DATABASE_URL 로 대체 실행합니다.");
  console.warn("    Supabase pooler URL 에서는 일부 DDL 이 거부될 수 있습니다.");
  console.warn("    필요 시 Supabase Dashboard > Settings > Database > Connection string (direct) 를 DIRECT_URL 로 추가하세요.");
  urlToUse = databaseUrl;
} else {
  console.log("🔗 DIRECT_URL 로 db:push 실행 중...");
}

const result = spawnSync("npx", ["prisma", "db", "push"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: urlToUse },
});

process.exit(result.status ?? 1);
