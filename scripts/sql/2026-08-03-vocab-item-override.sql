-- 2026-08-03 영단어 문항 정오답 수동 수정 이력 — VocabItemOverride (추가 전용, 멱등)
BEGIN;

CREATE TABLE IF NOT EXISTS "VocabItemOverride" (
  "id"              TEXT PRIMARY KEY,
  "itemId"          TEXT NOT NULL,
  "previousCorrect" BOOLEAN,
  "newCorrect"      BOOLEAN NOT NULL,
  "reason"          TEXT,
  "changedById"     TEXT NOT NULL,
  "changedByName"   TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VocabItemOverride_itemId_idx" ON "VocabItemOverride" ("itemId");

DO $$ BEGIN
  ALTER TABLE "VocabItemOverride" ADD CONSTRAINT "VocabItemOverride_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "VocabAttemptItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
