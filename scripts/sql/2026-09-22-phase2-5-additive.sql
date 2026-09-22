-- Phase 2~5 additive 마이그레이션 (2026-09-22)
-- 전부 additive: 신규 테이블/enum/컬럼만. 기존 데이터·컬럼 변경 없음.
-- 적용: psql "$DATABASE_URL" -f scripts/sql/2026-09-22-phase2-5-additive.sql
-- (pgbouncer pooler 말고 direct URL 권장)

BEGIN;

-- 기존 enum 확장 (ALTER TYPE ... ADD VALUE는 트랜잭션 안에서 불가 → COMMIT 뒤에서 별도 수행)
COMMIT;

ALTER TYPE "AuthInviteType" ADD VALUE IF NOT EXISTS 'PARENT';
ALTER TYPE "ExamType" ADD VALUE IF NOT EXISTS 'DUFF';

BEGIN;

-- 신규 enum
DO $$ BEGIN
  CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NapStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NetworkRequestKind" AS ENUM ('WIFI_UNBLOCK', 'DOMAIN_ALLOW', 'APP_UNBLOCK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PhoneCheckStatus" AS ENUM ('SUBMITTED', 'NOT_SUBMITTED', 'ABSENT', 'EXEMPT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 기존 테이블 컬럼 추가
ALTER TABLE "Student"  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "entryPreference" TEXT;

-- 포인트 상점
CREATE TABLE IF NOT EXISTS "RewardItem" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RewardRedemption" (
  "id" TEXT PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "itemId" TEXT NOT NULL REFERENCES "RewardItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "itemName" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RewardRedemption_studentId_createdAt_idx" ON "RewardRedemption"("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "RewardRedemption_status_idx" ON "RewardRedemption"("status");

-- 쪽잠 신청
CREATE TABLE IF NOT EXISTS "NapRequest" (
  "id" TEXT PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "date" DATE NOT NULL,
  "startTime" TEXT NOT NULL,
  "durationMin" INTEGER NOT NULL DEFAULT 20,
  "status" "NapStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "NapRequest_date_status_idx" ON "NapRequest"("date", "status");
CREATE INDEX IF NOT EXISTS "NapRequest_studentId_date_idx" ON "NapRequest"("studentId", "date");

-- 네트워크 사용 신청
CREATE TABLE IF NOT EXISTS "NetworkRequest" (
  "id" TEXT PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" "NetworkRequestKind" NOT NULL,
  "target" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "NapStatus" NOT NULL DEFAULT 'PENDING',
  "appliedAt" TIMESTAMP(3),
  "decidedById" TEXT,
  "decidedByName" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "NetworkRequest_status_startAt_idx" ON "NetworkRequest"("status", "startAt");
CREATE INDEX IF NOT EXISTS "NetworkRequest_studentId_createdAt_idx" ON "NetworkRequest"("studentId", "createdAt");

-- 휴대폰 제출 검사
CREATE TABLE IF NOT EXISTS "PhoneCheckRecord" (
  "id" TEXT PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "date" DATE NOT NULL,
  "status" "PhoneCheckStatus" NOT NULL,
  "checkedById" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PhoneCheckRecord_studentId_date_key" ON "PhoneCheckRecord"("studentId", "date");
CREATE INDEX IF NOT EXISTS "PhoneCheckRecord_date_idx" ON "PhoneCheckRecord"("date");

-- 학부모 연결
CREATE TABLE IF NOT EXISTS "ParentLink" (
  "id" TEXT PRIMARY KEY,
  "authUserId" TEXT NOT NULL REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "relation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ParentLink_authUserId_studentId_key" ON "ParentLink"("authUserId", "studentId");
CREATE INDEX IF NOT EXISTS "ParentLink_studentId_idx" ON "ParentLink"("studentId");

-- 콘텐츠 그릇
CREATE TABLE IF NOT EXISTS "ContentPost" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "url" TEXT NOT NULL,
  "coverImageUrl" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ContentPost_visible_publishedAt_idx" ON "ContentPost"("visible", "publishedAt");

-- 직원간 메시지
CREATE TABLE IF NOT EXISTS "StaffThread" (
  "id" TEXT PRIMARY KEY,
  "aUserId" TEXT NOT NULL,
  "bUserId" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffThread_aUserId_bUserId_key" ON "StaffThread"("aUserId", "bUserId");
CREATE INDEX IF NOT EXISTS "StaffThread_aUserId_lastMessageAt_idx" ON "StaffThread"("aUserId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "StaffThread_bUserId_lastMessageAt_idx" ON "StaffThread"("bUserId", "lastMessageAt");

CREATE TABLE IF NOT EXISTS "StaffThreadMessage" (
  "id" TEXT PRIMARY KEY,
  "threadId" TEXT NOT NULL REFERENCES "StaffThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "senderId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "attachments" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StaffThreadMessage_threadId_createdAt_idx" ON "StaffThreadMessage"("threadId", "createdAt");

COMMIT;
