// db:push 실행 스크립트 — 반드시 DEV DB 에만.
// 우선순위: DATABASE_URL_DEV > DIRECT_URL. 프로덕션 DATABASE_URL 은 사용 금지.
import { config } from "dotenv";
import { spawnSync } from "child_process";

config({ path: ".env.local" });
config(); // .env 도 함께 로드 (.env.local 우선)

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
  console.error("   프로덕션 DATABASE_URL 은 db:push 에 사용하지 않습니다.");
  process.exit(1);
}

// 안전 가드 1: 프로덕션 URL 과 동일하면 거부
if (prodUrl && urlToUse === prodUrl) {
  console.error(`❌ ${source} 가 프로덕션 DATABASE_URL 과 동일합니다. 중단.`);
  process.exit(1);
}

// 안전 가드 2: pooler Transaction mode(6543) 는 DDL 제약 → 거부.
// Session mode(5432) 는 허용. direct(db.<ref>.supabase.co) 는 IPv6 필요.
if (urlToUse.includes("pooler.supabase.com") && urlToUse.includes(":6543")) {
  console.error(`❌ ${source} 가 Transaction mode pooler(6543) 입니다. DDL 에 부적합.`);
  console.error("   Session mode pooler(5432) 로 변경하세요.");
  process.exit(1);
}

// 안전 가드 3: 프로덕션 project-ref 가 DEV URL 에 포함되면 거부
const PROD_PROJECT_REF = "ulefrypbhdgbtkjjlnco";
if (urlToUse.includes(PROD_PROJECT_REF)) {
  console.error(`❌ ${source} 에 프로덕션 project-ref(${PROD_PROJECT_REF}) 가 포함됐습니다. 중단.`);
  process.exit(1);
}

const masked = urlToUse.replace(/:[^:@/]+@/, ":***@");
console.log(`🔗 ${source} 로 db:push 실행 중...`);
console.log(`   대상: ${masked}`);

const result = spawnSync("npx", ["prisma", "db", "push"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: urlToUse },
});

process.exit(result.status ?? 1);
