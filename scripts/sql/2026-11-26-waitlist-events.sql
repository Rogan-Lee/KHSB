-- 대기자 관리 2단계: 진행 기록(WaitlistEvent) + 들어온 경로(Waitlist.source)
-- 운영 Supabase SQL 편집기에서 실행. 여러 번 실행해도 안전하다 (기존 표·행을 지우거나 고치지 않는다).
-- 기존 신청은 모두 공개 폼으로 들어온 것이라 source 기본값 'WEB' 이 그대로 맞다.

BEGIN;

ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'WEB';

CREATE TABLE IF NOT EXISTS "WaitlistEvent" (
    "id" TEXT NOT NULL,
    "waitlistId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "method" TEXT,
    "status" TEXT,
    "detail" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WaitlistEvent_waitlistId_createdAt_idx" ON "WaitlistEvent"("waitlistId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "WaitlistEvent" ADD CONSTRAINT "WaitlistEvent_waitlistId_fkey"
    FOREIGN KEY ("waitlistId") REFERENCES "Waitlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "WaitlistEvent" ENABLE ROW LEVEL SECURITY;

COMMIT;
