-- Additive migration: adds TodoVersion, Todo.lastEditor*, MeetingMinutes.visibleTo
-- Idempotent (IF NOT EXISTS). Safe to run multiple times.
-- 대상: tmp-main 이 바라보는 DB (Supabase dev 또는 운영).
-- prisma db push 를 쓰면 online-management 의 컬럼/테이블까지 drop 하려 하므로,
-- 여기서는 ADD 만 수행.

BEGIN;

-- ── 1) MeetingMinutes.visibleTo ─────────────────────────────────────────────
ALTER TABLE "MeetingMinutes"
  ADD COLUMN IF NOT EXISTS "visibleTo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ── 2) Todo 의 마지막 편집 메타 ───────────────────────────────────────────
ALTER TABLE "Todo"
  ADD COLUMN IF NOT EXISTS "lastEditorId"   TEXT,
  ADD COLUMN IF NOT EXISTS "lastEditorName" TEXT,
  ADD COLUMN IF NOT EXISTS "lastEditedAt"   TIMESTAMP(3);

-- ── 3) TodoVersion 테이블 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TodoVersion" (
    "id"           TEXT         NOT NULL,
    "todoId"       TEXT         NOT NULL,
    "version"      INTEGER      NOT NULL,
    "title"        TEXT         NOT NULL,
    "content"      TEXT,
    "dueDate"      DATE,
    "priority"     TEXT         NOT NULL,
    "assigneeId"   TEXT,
    "assigneeName" TEXT,
    "category"     TEXT,
    "editorId"     TEXT         NOT NULL,
    "editorName"   TEXT         NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TodoVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TodoVersion_todoId_version_key"
  ON "TodoVersion"("todoId", "version");

CREATE INDEX IF NOT EXISTS "TodoVersion_todoId_idx"
  ON "TodoVersion"("todoId");

-- FK 는 별도 DO 블록으로 중복 방지
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TodoVersion_todoId_fkey'
  ) THEN
    ALTER TABLE "TodoVersion"
      ADD CONSTRAINT "TodoVersion_todoId_fkey"
      FOREIGN KEY ("todoId") REFERENCES "Todo"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
