/**
 * 옵션 정리 스크립트: 매직링크/리포트 토큰의 expiresAt NULL 행을 백필.
 *
 * 배포 *전제 조건 아님* — `checkExpiry` 가 NULL 을 정상(레거시)으로 간주하므로
 * 이 스크립트를 안 돌려도 현존 링크가 무효화되지 않는다. 다만 NULL 인 링크는
 * 영구 유효이므로, 운영자가 자연 만료 정책을 적용하고 싶을 때 실행한다.
 *
 * 대상: ParentReport / StudyPlanReport / ConsultationReport / VocabAttempt 의 NULL expiresAt.
 * 정책: 실행 시점 +30일 (리포트류) / +14일 (Vocab) 로 설정.
 *
 * 안전 가드:
 * - 이미 NOT NULL 인 행은 건드리지 않음 (멱등).
 * - `--dry-run` 플래그로 변경 건수만 미리 확인 가능.
 * - DATABASE_URL 로 직접 접속하므로 .env.local 의 prod/dev 구분 주의.
 *
 * 사용:
 *   npx tsx scripts/backfill-token-expiry.ts --dry-run
 *   npx tsx scripts/backfill-token-expiry.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const REPORT_DAYS = 30;
const VOCAB_DAYS = 14;

function plusDays(days: number, base = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const reportExpiry = plusDays(REPORT_DAYS);
  const vocabExpiry = plusDays(VOCAB_DAYS);

  const [pr, sp, cr, va] = await Promise.all([
    prisma.parentReport.count({ where: { expiresAt: null } }),
    prisma.studyPlanReport.count({ where: { expiresAt: null } }),
    prisma.consultationReport.count({ where: { expiresAt: null } }),
    prisma.vocabAttempt.count({ where: { expiresAt: null } }),
  ]);

  console.log("─── 백필 대상 행 수 ───");
  console.log(`  ParentReport       : ${pr}`);
  console.log(`  StudyPlanReport    : ${sp}`);
  console.log(`  ConsultationReport : ${cr}`);
  console.log(`  VocabAttempt       : ${va}`);
  console.log(`  리포트류 만료일    : ${reportExpiry.toISOString()} (+${REPORT_DAYS}일)`);
  console.log(`  Vocab 만료일       : ${vocabExpiry.toISOString()} (+${VOCAB_DAYS}일)`);

  if (dryRun) {
    console.log("\n(--dry-run) 변경 없이 종료합니다.");
    await prisma.$disconnect();
    return;
  }

  const [u1, u2, u3, u4] = await Promise.all([
    prisma.parentReport.updateMany({
      where: { expiresAt: null },
      data: { expiresAt: reportExpiry },
    }),
    prisma.studyPlanReport.updateMany({
      where: { expiresAt: null },
      data: { expiresAt: reportExpiry },
    }),
    prisma.consultationReport.updateMany({
      where: { expiresAt: null },
      data: { expiresAt: reportExpiry },
    }),
    prisma.vocabAttempt.updateMany({
      where: { expiresAt: null },
      data: { expiresAt: vocabExpiry },
    }),
  ]);

  console.log("\n─── 백필 완료 ───");
  console.log(`  ParentReport       : ${u1.count}건`);
  console.log(`  StudyPlanReport    : ${u2.count}건`);
  console.log(`  ConsultationReport : ${u3.count}건`);
  console.log(`  VocabAttempt       : ${u4.count}건`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
