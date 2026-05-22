-- =============================================================================
-- 2026-05-23 PROD CATCH-UP — tmp-main → main 릴리스 스키마 동기화
-- =============================================================================
-- 생성: prisma migrate diff (origin/main schema → tmp-main schema)
-- 안전성: 전부 추가(additive)만 — DROP/RENAME/타입변경/NOT NULL 백필 없음.
--         모든 문장을 IF NOT EXISTS / 예외 처리로 멱등(idempotent)화 →
--         이미 prod 에 적용된 항목(예: visibleInReport)은 자동 skip.
--         NOT NULL 신규 컬럼은 모두 DEFAULT 보유 → 기존 행에 안전.
-- 적용: psql "<PROD_DIRECT_URL(non-pooler)>" -f scripts/sql/2026-05-23-prod-catchup-release.sql
-- 권장: main 머지/배포 직전 또는 직후 즉시 1회 실행. 트랜잭션으로 원자 적용.
-- =============================================================================

BEGIN;

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'TERMINATED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SuggestionCategory" AS ENUM ('FACILITY', 'CLASS', 'OPERATION', 'ETC'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SuggestionStatus" AS ENUM ('RECEIVED', 'REVIEWING', 'REFLECTED', 'DECLINED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "PatrolStatus" AS ENUM ('OK', 'NOTE', 'ABSENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "MentoringPhotoTag" AS ENUM ('KDA', 'EXTRA', 'FREE'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 기존 테이블 컬럼 추가 ─────────────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "terminationNote" TEXT;

ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "attentionFlag" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "attentionFlaggedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "attentionFlaggedById" TEXT,
  ADD COLUMN IF NOT EXISTS "attentionReason" TEXT;

ALTER TABLE "DailyOuting"
  ADD COLUMN IF NOT EXISTS "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "scheduleId" TEXT,
  ADD COLUMN IF NOT EXISTS "sequence" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "MeritDemerit"
  ADD COLUMN IF NOT EXISTS "visibleInReport" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "MonthlyReport"
  ADD COLUMN IF NOT EXISTS "patrolAbsentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "patrolNoteCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Photo"
  ADD COLUMN IF NOT EXISTS "mentoringId" TEXT,
  ADD COLUMN IF NOT EXISTS "mentoringTag" TEXT;

ALTER TABLE "MonthlyNote"
  ADD COLUMN IF NOT EXISTS "visibleInReport" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Todo"
  ADD COLUMN IF NOT EXISTS "targetRole" TEXT;

ALTER TABLE "FeatureRequest"
  ADD COLUMN IF NOT EXISTS "seenById" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "VocabAttempt"
  ADD COLUMN IF NOT EXISTS "shuffleSeed" INTEGER;

-- ── 신규 테이블 ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PayrollContract" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "hourlyRate" INTEGER NOT NULL,
    "monthlySalary" INTEGER,
    "weeklyHolidayPay" BOOLEAN NOT NULL DEFAULT true,
    "monthlyBonusKrw" INTEGER NOT NULL DEFAULT 0,
    "workDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "workStartTime" TEXT,
    "workEndTime" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "shiftStart" TIMESTAMP(3) NOT NULL,
    "shiftEnd" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "sourceTagInId" TEXT,
    "sourceTagOutId" TEXT,
    "hourlyRateAtCalc" INTEGER NOT NULL,
    "baseWage" INTEGER NOT NULL,
    "weekKey" TEXT NOT NULL,
    "editedById" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkHourEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "enteredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkHourEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkMonth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "extraMinutes" INTEGER NOT NULL DEFAULT 0,
    "extraNote" TEXT,
    "staffConfirmedAt" TIMESTAMP(3),
    "ownerConfirmedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkMonth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StudentSuggestion" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "category" "SuggestionCategory" NOT NULL DEFAULT 'ETC',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'RECEIVED',
    "staffReply" TEXT,
    "handledById" TEXT,
    "handledByName" TEXT,
    "handledAt" TIMESTAMP(3),
    "statusUpdatedAt" TIMESTAMP(3),
    "studentReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffMagicLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "lastAccessIp" TEXT,
    "lastAccessUa" TEXT,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "issuedById" TEXT,
    CONSTRAINT "StaffMagicLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PatrolRound" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "label" TEXT,
    "patrollerId" TEXT,
    "patrollerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatrolRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PatrolRecord" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "PatrolStatus" NOT NULL DEFAULT 'OK',
    "note" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatrolRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EnrollmentAdjustment" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "newCount" INTEGER,
    "leftCount" INTEGER,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnrollmentAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssignmentFile" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssignmentFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MentoringSessionPhoto" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "tag" "MentoringPhotoTag" NOT NULL DEFAULT 'FREE',
    "caption" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MentoringSessionPhoto_pkey" PRIMARY KEY ("id")
);

-- ── 인덱스 ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "PayrollContract_userId_effectiveFrom_idx" ON "PayrollContract"("userId", "effectiveFrom");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollContract_userId_effectiveFrom_key" ON "PayrollContract"("userId", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "WorkLog_userId_workDate_idx" ON "WorkLog"("userId", "workDate");
CREATE INDEX IF NOT EXISTS "WorkLog_weekKey_idx" ON "WorkLog"("weekKey");
CREATE INDEX IF NOT EXISTS "WorkHourEntry_userId_workDate_idx" ON "WorkHourEntry"("userId", "workDate");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkHourEntry_userId_workDate_key" ON "WorkHourEntry"("userId", "workDate");
CREATE INDEX IF NOT EXISTS "WorkMonth_year_month_idx" ON "WorkMonth"("year", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkMonth_userId_year_month_key" ON "WorkMonth"("userId", "year", "month");
CREATE INDEX IF NOT EXISTS "StudentSuggestion_studentId_idx" ON "StudentSuggestion"("studentId");
CREATE INDEX IF NOT EXISTS "StudentSuggestion_status_idx" ON "StudentSuggestion"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "StaffMagicLink_token_key" ON "StaffMagicLink"("token");
CREATE INDEX IF NOT EXISTS "StaffMagicLink_userId_revokedAt_idx" ON "StaffMagicLink"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "StaffMagicLink_expiresAt_idx" ON "StaffMagicLink"("expiresAt");
CREATE INDEX IF NOT EXISTS "PatrolRound_startedAt_idx" ON "PatrolRound"("startedAt");
CREATE INDEX IF NOT EXISTS "PatrolRecord_roundId_idx" ON "PatrolRecord"("roundId");
CREATE INDEX IF NOT EXISTS "PatrolRecord_studentId_idx" ON "PatrolRecord"("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "PatrolRecord_roundId_studentId_key" ON "PatrolRecord"("roundId", "studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "EnrollmentAdjustment_year_month_key" ON "EnrollmentAdjustment"("year", "month");
CREATE INDEX IF NOT EXISTS "AssignmentFile_assignmentId_idx" ON "AssignmentFile"("assignmentId");
CREATE INDEX IF NOT EXISTS "MentoringSessionPhoto_sessionId_idx" ON "MentoringSessionPhoto"("sessionId");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "Student_attentionFlag_idx" ON "Student"("attentionFlag");
CREATE INDEX IF NOT EXISTS "DailyOuting_studentId_date_sequence_idx" ON "DailyOuting"("studentId", "date", "sequence");
CREATE INDEX IF NOT EXISTS "Photo_mentoringId_idx" ON "Photo"("mentoringId");

-- ── 외래키 (멱등: pg_constraint 존재 확인 후 추가) ────────────────────────────
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PayrollContract_userId_fkey') THEN ALTER TABLE "PayrollContract" ADD CONSTRAINT "PayrollContract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WorkLog_userId_fkey') THEN ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WorkHourEntry_userId_fkey') THEN ALTER TABLE "WorkHourEntry" ADD CONSTRAINT "WorkHourEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='WorkMonth_userId_fkey') THEN ALTER TABLE "WorkMonth" ADD CONSTRAINT "WorkMonth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StudentSuggestion_studentId_fkey') THEN ALTER TABLE "StudentSuggestion" ADD CONSTRAINT "StudentSuggestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='StaffMagicLink_userId_fkey') THEN ALTER TABLE "StaffMagicLink" ADD CONSTRAINT "StaffMagicLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PatrolRecord_roundId_fkey') THEN ALTER TABLE "PatrolRecord" ADD CONSTRAINT "PatrolRecord_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "PatrolRound"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='PatrolRecord_studentId_fkey') THEN ALTER TABLE "PatrolRecord" ADD CONSTRAINT "PatrolRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Photo_mentoringId_fkey') THEN ALTER TABLE "Photo" ADD CONSTRAINT "Photo_mentoringId_fkey" FOREIGN KEY ("mentoringId") REFERENCES "Mentoring"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AssignmentFile_assignmentId_fkey') THEN ALTER TABLE "AssignmentFile" ADD CONSTRAINT "AssignmentFile_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='MentoringSessionPhoto_sessionId_fkey') THEN ALTER TABLE "MentoringSessionPhoto" ADD CONSTRAINT "MentoringSessionPhoto_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MentoringSession"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

COMMIT;

-- =============================================================================
-- 적용 후 검증 쿼리(선택):
--   SELECT tablename FROM pg_tables WHERE tablename IN
--     ('PayrollContract','WorkLog','WorkHourEntry','WorkMonth','StudentSuggestion',
--      'StaffMagicLink','PatrolRound','PatrolRecord','EnrollmentAdjustment',
--      'AssignmentFile','MentoringSessionPhoto');  -- 11건 기대
--   SELECT typname FROM pg_type WHERE typname IN
--     ('UserStatus','SuggestionCategory','SuggestionStatus','PatrolStatus','MentoringPhotoTag'); -- 5건
-- =============================================================================
