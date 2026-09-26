// DEV DB 대상으로 prisma CLI 명령을 안전하게 실행하는 wrapper.
// 프로덕션 DATABASE_URL 이 실수로 사용되지 않도록 가드.
// 사용: node scripts/prisma-dev.mjs <prisma-subcommand> [args...]
//   예) node scripts/prisma-dev.mjs migrate dev --name add_online_roles
import { config } from "dotenv";
import { spawnSync } from "child_process";
import { createHash } from "node:crypto";

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
// 프로덕션 Supabase project-ref 의 SHA-256. 공개 저장소라 원문 대신 해시로 비교한다.
const PROD_PROJECT_REF_SHA256 = "37276d3cbb4b3ab00f9978c8eb33b48f41a1a852506ebb19a9b890cae6db5247";
const hasProdProjectRef = (url) =>
  url
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((part) => createHash("sha256").update(part).digest("hex") === PROD_PROJECT_REF_SHA256);
if (hasProdProjectRef(devUrl)) {
  console.error("❌ DATABASE_URL_DEV 에 프로덕션 project-ref 포함. 중단.");
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
