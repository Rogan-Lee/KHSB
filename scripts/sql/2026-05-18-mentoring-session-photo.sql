DO $$ BEGIN
  CREATE TYPE "MentoringPhotoTag" AS ENUM ('KDA', 'EXTRA', 'FREE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "MentoringSessionPhoto" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL REFERENCES "MentoringSession"("id") ON DELETE CASCADE,
  "url" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "mimeType" TEXT NOT NULL,
  "tag" "MentoringPhotoTag" NOT NULL DEFAULT 'FREE',
  "caption" TEXT,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "MentoringSessionPhoto_sessionId_idx" ON "MentoringSessionPhoto"("sessionId");

ALTER TABLE "MentoringSession" ADD COLUMN IF NOT EXISTS "studentSignatureUrl" TEXT;
ALTER TABLE "MentoringSession" ADD COLUMN IF NOT EXISTS "hostSignatureUrl" TEXT;
ALTER TABLE "MentoringSession" ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMP;
