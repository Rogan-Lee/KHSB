// Dev DB 전용 시드. .env.development.local 의 DATABASE_URL 로드 후 실행.
// 기본 원장/멘토/학생5명 + 본인 Clerk email SUPER_ADMIN + 온라인 학생 1명 전환.
import { config } from "dotenv";
import { spawnSync } from "child_process";
import { createHash } from "node:crypto";

config({ path: ".env.development.local", quiet: true });
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const devUrl = process.env.DATABASE_URL;
if (!devUrl) {
  console.error("❌ DATABASE_URL 이 없습니다.");
  process.exit(1);
}

// 안전 가드: 프로덕션 project-ref 차단
// 프로덕션 Supabase project-ref 의 SHA-256. 공개 저장소라 원문 대신 해시로 비교한다.
const PROD_PROJECT_REF_SHA256 = "37276d3cbb4b3ab00f9978c8eb33b48f41a1a852506ebb19a9b890cae6db5247";
const hasProdProjectRef = (url) =>
  url
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((part) => createHash("sha256").update(part).digest("hex") === PROD_PROJECT_REF_SHA256);
if (hasProdProjectRef(devUrl)) {
  console.error("❌ DATABASE_URL 에 프로덕션 project-ref 감지. 중단.");
  process.exit(1);
}

const masked = devUrl.replace(/:[^:@/]+@/, ":***@");
console.log(`🌱 Dev seed 실행 대상: ${masked}`);

// 1) 기존 prisma/seed.ts 실행 (원장/멘토/학생5명 upsert)
console.log("\n[1/2] 기본 seed 실행...");
const base = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: devUrl },
});
if (base.status !== 0) {
  console.error("❌ 기본 seed 실패");
  process.exit(base.status ?? 1);
}

// 2) 온라인 관리 증분 seed
console.log("\n[2/2] 온라인 관리 증분 seed 실행...");
const increment = spawnSync(
  "npx",
  ["tsx", "scripts/seed-dev-online-increment.ts"],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: devUrl } }
);
process.exit(increment.status ?? 1);
