-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'CONSULTANT';
ALTER TYPE "Role" ADD VALUE 'MANAGER_MENTOR';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "assignedConsultantId" TEXT,
ADD COLUMN     "assignedMentorId" TEXT,
ADD COLUMN     "isOnlineManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onlineStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StudentMagicLink" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "issuedById" TEXT,

    CONSTRAINT "StudentMagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentMagicLink_token_key" ON "StudentMagicLink"("token");

-- CreateIndex
CREATE INDEX "StudentMagicLink_studentId_revokedAt_idx" ON "StudentMagicLink"("studentId", "revokedAt");

-- CreateIndex
CREATE INDEX "StudentMagicLink_expiresAt_idx" ON "StudentMagicLink"("expiresAt");

-- CreateIndex
CREATE INDEX "Student_isOnlineManaged_status_idx" ON "Student"("isOnlineManaged", "status");

-- CreateIndex
CREATE INDEX "Student_assignedMentorId_idx" ON "Student"("assignedMentorId");

-- CreateIndex
CREATE INDEX "Student_assignedConsultantId_idx" ON "Student"("assignedConsultantId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_assignedMentorId_fkey" FOREIGN KEY ("assignedMentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_assignedConsultantId_fkey" FOREIGN KEY ("assignedConsultantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentMagicLink" ADD CONSTRAINT "StudentMagicLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
