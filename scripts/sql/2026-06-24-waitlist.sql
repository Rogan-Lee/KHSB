-- =============================================================================
-- 2026-06-24 대기자 관리 (Waitlist) — 신규 테이블/enum 추가
-- =============================================================================
-- 안전성: 전부 추가(additive)만 — DROP/RENAME/타입변경/기존행 백필 없음.
--         모든 문장 IF NOT EXISTS / 예외 처리로 멱등(idempotent) → 재실행 안전.
-- 적용: psql "<PROD_DIRECT_URL(non-pooler)>" -f scripts/sql/2026-06-24-waitlist.sql
-- =============================================================================

BEGIN;

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "BranchWaitStatus" AS ENUM ('WAITLIST_OPEN', 'ALMOST_FULL', 'IMMEDIATE', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "WaitGender" AS ENUM ('MALE', 'FEMALE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "WaitGradeType" AS ENUM ('REPEAT', 'ENROLLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'INVITED', 'ENROLLED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Branch" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "slug"       TEXT NOT NULL,
  "waitStatus" "BranchWaitStatus" NOT NULL DEFAULT 'WAITLIST_OPEN',
  "notice"     TEXT,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_slug_key" ON "Branch"("slug");

CREATE TABLE IF NOT EXISTS "WaitlistProgram" (
  "id"        TEXT NOT NULL,
  "branchId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "WaitlistProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Waitlist" (
  "id"               TEXT NOT NULL,
  "token"            TEXT NOT NULL,
  "branchId"         TEXT NOT NULL,
  "programId"        TEXT,
  "name"             TEXT NOT NULL,
  "phone"            TEXT NOT NULL,
  "gender"           "WaitGender" NOT NULL,
  "gradeType"        "WaitGradeType" NOT NULL,
  "note"             TEXT,
  "consentMarketing" BOOLEAN NOT NULL DEFAULT false,
  "phoneVerifiedAt"  TIMESTAMP(3),
  "status"           "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
  "invitedAt"        TIMESTAMP(3),
  "enrolledAt"       TIMESTAMP(3),
  "cancelledAt"      TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Waitlist_token_key" ON "Waitlist"("token");
CREATE INDEX IF NOT EXISTS "Waitlist_branchId_status_createdAt_idx" ON "Waitlist"("branchId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "PhoneVerification" (
  "id"           TEXT NOT NULL,
  "phone"        TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "verifiedAt"   TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PhoneVerification_phone_createdAt_idx" ON "PhoneVerification"("phone", "createdAt");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "WaitlistProgram" ADD CONSTRAINT "WaitlistProgram_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "WaitlistProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
