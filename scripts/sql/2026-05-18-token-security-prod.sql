-- ============================================================================
-- 2026-05-18 prod token security: 매직링크/리포트 토큰 만료·취소·접근 로그
-- ============================================================================
-- 대상: 프로덕션 DB (ulefrypbhdgbtkjjlnco.supabase.com)
-- 출처: prisma migrate diff (feat/token-security 의 schema.prisma 기준)
-- 관련: PR #254 (feat: 매직링크/리포트 토큰 보안)
--
-- 변경 요약:
--   - ALTER TABLE 5건 (ConsultationReport / ParentReport / StudyPlanReport
--     / StudentMagicLink / VocabAttempt) — 전부 nullable 추가 + accessCount DEFAULT 0
--   - CREATE TABLE TokenGateAttempt (게이트 실패 시도 로그)
--   - CREATE INDEX 6건
--
-- 안전성:
--   - 전부 비파괴 (NOT NULL 컬럼은 DEFAULT 있어서 기존 row 안전, FK 없음)
--   - PostgreSQL 11+ 의 ADD COLUMN ... DEFAULT 는 메타데이터만 업데이트 → 빠름
--   - 트랜잭션 내 실행 → 실패 시 전체 롤백
--
-- 적용 순서 (중요):
--   1. MAGIC_LINK_GATE_SECRET 환경변수 등록 (Vercel)
--   2. **이 SQL 적용** (지금)
--   3. PR #254 머지 → Vercel 재배포
-- ============================================================================

BEGIN;

-- 사전 가드: 이미 적용된 상태면 중단
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'TokenGateAttempt'
  ) THEN
    RAISE EXCEPTION '이미 적용됨: TokenGateAttempt 테이블이 존재합니다. 중단.';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "ConsultationReport" ADD COLUMN     "accessCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lastAccessIp" TEXT,
ADD COLUMN     "lastAccessUa" TEXT,
ADD COLUMN     "lastAccessedAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ParentReport" ADD COLUMN     "accessCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lastAccessIp" TEXT,
ADD COLUMN     "lastAccessUa" TEXT,
ADD COLUMN     "lastAccessedAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StudentMagicLink" ADD COLUMN     "lastAccessIp" TEXT,
ADD COLUMN     "lastAccessUa" TEXT;

-- AlterTable
ALTER TABLE "StudyPlanReport" ADD COLUMN     "accessCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lastAccessIp" TEXT,
ADD COLUMN     "lastAccessUa" TEXT,
ADD COLUMN     "lastAccessedAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "VocabAttempt" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lastAccessIp" TEXT,
ADD COLUMN     "lastAccessUa" TEXT;

-- CreateTable
CREATE TABLE "TokenGateAttempt" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "ua" TEXT,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenGateAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenGateAttempt_scope_tokenHash_failedAt_idx" ON "TokenGateAttempt"("scope", "tokenHash", "failedAt");

-- CreateIndex
CREATE INDEX "TokenGateAttempt_ip_failedAt_idx" ON "TokenGateAttempt"("ip", "failedAt");

-- CreateIndex
CREATE INDEX "ConsultationReport_expiresAt_idx" ON "ConsultationReport"("expiresAt");

-- CreateIndex
CREATE INDEX "ParentReport_expiresAt_idx" ON "ParentReport"("expiresAt");

-- CreateIndex
CREATE INDEX "StudyPlanReport_expiresAt_idx" ON "StudyPlanReport"("expiresAt");

-- CreateIndex
CREATE INDEX "VocabAttempt_expiresAt_idx" ON "VocabAttempt"("expiresAt");

COMMIT;
