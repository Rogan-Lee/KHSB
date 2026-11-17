-- 공부 타이머 — 새 테이블 1개 (additive)
-- 여러 번 실행해도 안전하다. Supabase SQL 편집기에서 통째로 실행.

BEGIN;

CREATE TABLE IF NOT EXISTS "StudySession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StudySession_studentId_startedAt_idx" ON "StudySession"("studentId", "startedAt");

DO $$ BEGIN
  ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS: 정책 없이 켜 둔다 — 서버(Prisma, postgres 역할)만 접근하고 PostgREST(anon·authenticated)로는 못 읽는다.
ALTER TABLE "StudySession" ENABLE ROW LEVEL SECURITY;

COMMIT;
