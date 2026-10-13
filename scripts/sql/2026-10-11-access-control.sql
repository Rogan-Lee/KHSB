-- 앱·사이트 사용 통제 (시설 와이파이) — 새 테이블 5개 + enum 4개 (2026-10-11)
-- additive: 기존 테이블·컬럼 변경 없음. Student 에는 FK 만 걸린다.
-- 적용: Supabase SQL 편집기에서 실행. 한 트랜잭션이라 중간에 실패하면 아무것도 남지 않는다.
-- 순서: 이 SQL 을 먼저 실행한 뒤 코드를 배포한다 (테이블이 없으면 통제 화면·신청 승인·장비 동기화가 실패한다).

BEGIN;

-- CreateEnum
CREATE TYPE "AccessAction" AS ENUM ('BLOCK', 'ALLOW');

-- CreateEnum
CREATE TYPE "AccessTargetKind" AS ENUM ('ALL', 'SERVICE', 'DOMAIN');

-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('GLOBAL', 'STUDENT');

-- CreateEnum
CREATE TYPE "AccessDeviceStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'EXEMPT');

-- CreateTable
CREATE TABLE "AccessRule" (
    "id" TEXT NOT NULL,
    "action" "AccessAction" NOT NULL,
    "targetKind" "AccessTargetKind" NOT NULL,
    "target" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL,
    "scope" "AccessScope" NOT NULL DEFAULT 'GLOBAL',
    "studentId" TEXT,
    "daysOfWeek" INTEGER[],
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessOverride" (
    "id" TEXT NOT NULL,
    "action" "AccessAction" NOT NULL,
    "targetKind" "AccessTargetKind" NOT NULL,
    "target" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL,
    "scope" "AccessScope" NOT NULL DEFAULT 'GLOBAL',
    "studentId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "networkRequestId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessDevice" (
    "id" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "hostname" TEXT,
    "lastIp" TEXT,
    "label" TEXT,
    "status" "AccessDeviceStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "studentId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "lastAppliedAt" TIMESTAMP(3),
    "appliedVersion" TEXT,
    "lastError" TEXT,
    "software" TEXT,
    "agentVersion" TEXT,
    "catalog" JSONB,
    "catalogHash" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessRule_enabled_idx" ON "AccessRule"("enabled");

-- CreateIndex
CREATE INDEX "AccessRule_studentId_idx" ON "AccessRule"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessOverride_networkRequestId_key" ON "AccessOverride"("networkRequestId");

-- CreateIndex
CREATE INDEX "AccessOverride_endAt_idx" ON "AccessOverride"("endAt");

-- CreateIndex
CREATE INDEX "AccessOverride_studentId_idx" ON "AccessOverride"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessDevice_mac_key" ON "AccessDevice"("mac");

-- CreateIndex
CREATE INDEX "AccessDevice_studentId_idx" ON "AccessDevice"("studentId");

-- CreateIndex
CREATE INDEX "AccessDevice_status_lastSeenAt_idx" ON "AccessDevice"("status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessAgent_tokenHash_key" ON "AccessAgent"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessEvent_createdAt_idx" ON "AccessEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AccessRule" ADD CONSTRAINT "AccessRule_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessOverride" ADD CONSTRAINT "AccessOverride_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessDevice" ADD CONSTRAINT "AccessDevice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS: 정책 없이 켜 둔다 — 서버(Prisma, postgres 역할)만 접근하고 PostgREST(anon·authenticated)로는 못 읽는다.
ALTER TABLE "AccessRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessAgent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessEvent" ENABLE ROW LEVEL SECURITY;

COMMIT;
