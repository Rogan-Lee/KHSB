// DEV DB 대상으로 prisma CLI 명령을 안전하게 실행하는 wrapper.
// 프로덕션 DATABASE_URL 이 실수로 사용되지 않도록 가드.
// 사용: node scripts/prisma-dev.mjs <prisma-subcommand> [args...]
//   예) node scripts/prisma-dev.mjs migrate dev --name add_online_roles
import { config } from "dotenv";
import { spawnSync } from "child_process";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const devUrl = process.env.DATABASE_URL_DEV;
const prodUrl = process.env.DATABASE_URL;

if (!devUrl) {
  console.error("❌ DATABASE_URL_DEV 가 .env.local 에 없습니다. 중단.");
  process.exit(1);
}
if (prodUrl && devUrl === prodUrl) {
  console.error("❌ DATABASE_URL_DEV 가 프로덕션 DATABASE_URL 과 동일합니다. 중단.");
  process.exit(1);
}

// Transaction mode pooler 는 DDL 제약으로 migrate 에 부적합
if (devUrl.includes("pooler.supabase.com") && devUrl.includes(":6543")) {
  console.error("❌ DATABASE_URL_DEV 가 Transaction mode pooler(6543) 입니다. Session mode(5432) 로 변경하세요.");
  process.exit(1);
}

// 프로덕션 project-ref 가 DEV 에 섞이면 거부
const PROD_PROJECT_REF = "ulefrypbhdgbtkjjlnco";
if (devUrl.includes(PROD_PROJECT_REF)) {
  console.error(`❌ DATABASE_URL_DEV 에 프로덕션 project-ref(${PROD_PROJECT_REF}) 포함. 중단.`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("사용: node scripts/prisma-dev.mjs <prisma-subcommand> [args...]");
  process.exit(1);
}

const masked = devUrl.replace(/:[^:@/]+@/, ":***@");
console.error(`🔗 DEV DB 대상: ${masked}`);
console.error(`▶ prisma ${args.join(" ")}`);

const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: devUrl },
});

process.exit(result.status ?? 1);
