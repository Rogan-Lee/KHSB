-- 개인정보 보호 기록: 동의 이력 · 직원 접속 기록 · 외부 AI 전송 이력 + 리포트 AI '확인 대기'
-- 운영 Supabase SQL 편집기에서 실행. 여러 번 실행해도 안전하다 (기존 표·행을 지우거나 고치지 않는다).

ALTER TYPE "ReportAiJobStatus" ADD VALUE IF NOT EXISTS 'REVIEW';

BEGIN;

DO $$ BEGIN
  CREATE TYPE "ConsentKind" AS ENUM ('TERMS', 'PRIVACY_REQUIRED', 'PRIVACY_OPTIONAL', 'SENSITIVE', 'MARKETING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ConsentChannel" AS ENUM ('WEB_APPLY', 'SIGN_UP', 'PAPER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ConsentRecord" (
    "id" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "agreed" BOOLEAN NOT NULL,
    "docVersion" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "studentId" TEXT,
    "waitlistId" TEXT,
    "authUserId" TEXT,
    "agreedOn" DATE NOT NULL,
    "under14" BOOLEAN,
    "guardianName" TEXT,
    "guardianCheck" TEXT,
    "recordedById" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PersonalDataAccessLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "studentId" TEXT,
    "ip" TEXT,
    "bucket" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalDataAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiTransferLog" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "studentId" TEXT,
    "actorId" TEXT,
    "maskedNames" INTEGER NOT NULL DEFAULT 0,
    "maskedContacts" INTEGER NOT NULL DEFAULT 0,
    "droppedSensitive" INTEGER NOT NULL DEFAULT 0,
    "inputChars" INTEGER NOT NULL,
    "outputChars" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTransferLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConsentRecord_studentId_kind_createdAt_idx" ON "ConsentRecord"("studentId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "ConsentRecord_waitlistId_idx" ON "ConsentRecord"("waitlistId");
CREATE INDEX IF NOT EXISTS "ConsentRecord_authUserId_idx" ON "ConsentRecord"("authUserId");
CREATE INDEX IF NOT EXISTS "PersonalDataAccessLog_createdAt_idx" ON "PersonalDataAccessLog"("createdAt");
CREATE INDEX IF NOT EXISTS "PersonalDataAccessLog_studentId_createdAt_idx" ON "PersonalDataAccessLog"("studentId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PersonalDataAccessLog_actorId_action_path_bucket_key" ON "PersonalDataAccessLog"("actorId", "action", "path", "bucket");
CREATE INDEX IF NOT EXISTS "AiTransferLog_createdAt_idx" ON "AiTransferLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AiTransferLog_studentId_createdAt_idx" ON "AiTransferLog"("studentId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_waitlistId_fkey"
    FOREIGN KEY ("waitlistId") REFERENCES "Waitlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS: 정책 없이 켜 둔다 — 서버(Prisma, postgres 역할)만 접근하고 PostgREST(anon·authenticated)로는 못 읽는다.
ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PersonalDataAccessLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiTransferLog" ENABLE ROW LEVEL SECURITY;

COMMIT;
