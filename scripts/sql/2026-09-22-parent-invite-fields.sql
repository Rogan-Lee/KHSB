-- 학부모 초대 페이로드를 AuthInvitation 정식 필드로 승격 (additive)
ALTER TABLE "AuthInvitation" ADD COLUMN IF NOT EXISTS "targetStudentIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "AuthInvitation" ADD COLUMN IF NOT EXISTS "parentRelation" TEXT;
