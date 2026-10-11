-- 신고·차단 (App Store 1.2 · Google Play UGC) — 새 테이블 2개, 기존 테이블은 건드리지 않는다 (additive)
-- 여러 번 실행해도 안전하다.
DO $$ BEGIN
  CREATE TYPE "SafetyActorType" AS ENUM ('STUDENT', 'STAFF', 'PARENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ContentReportStatus" AS ENUM ('OPEN', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ContentReport" (
    "id" TEXT NOT NULL,
    "reporterType" "SafetyActorType" NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "contextId" TEXT,
    "targetUserType" "SafetyActorType" NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetUserName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "snapshot" TEXT,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerType" "SafetyActorType" NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedType" "SafetyActorType" NOT NULL,
    "blockedId" TEXT NOT NULL,
    "blockedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ContentReport_status_createdAt_idx" ON "ContentReport"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ContentReport_reporterType_reporterId_createdAt_idx" ON "ContentReport"("reporterType", "reporterId", "createdAt");
CREATE INDEX IF NOT EXISTS "ContentReport_targetUserType_targetUserId_idx" ON "ContentReport"("targetUserType", "targetUserId");
CREATE INDEX IF NOT EXISTS "UserBlock_blockedType_blockedId_idx" ON "UserBlock"("blockedType", "blockedId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserBlock_blockerType_blockerId_blockedType_blockedId_key" ON "UserBlock"("blockerType", "blockerId", "blockedType", "blockedId");
