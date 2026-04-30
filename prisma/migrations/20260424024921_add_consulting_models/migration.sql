-- CreateEnum
CREATE TYPE "PerformanceTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'NEEDS_REVISION', 'DONE');

-- CreateEnum
CREATE TYPE "TaskFeedbackStatus" AS ENUM ('COMMENT', 'NEEDS_REVISION', 'APPROVED');

-- CreateTable
CREATE TABLE "OnboardingSurvey" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceTask" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE NOT NULL,
    "scoreWeight" INTEGER,
    "format" TEXT,
    "status" "PerformanceTaskStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "files" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskFeedback" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "TaskFeedbackStatus" NOT NULL DEFAULT 'COMMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskResult" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "finalFiles" JSONB NOT NULL DEFAULT '[]',
    "score" TEXT,
    "consultantSummary" TEXT,
    "includeInReport" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSurvey_studentId_key" ON "OnboardingSurvey"("studentId");

-- CreateIndex
CREATE INDEX "PerformanceTask_studentId_dueDate_idx" ON "PerformanceTask"("studentId", "dueDate");

-- CreateIndex
CREATE INDEX "PerformanceTask_status_dueDate_idx" ON "PerformanceTask"("status", "dueDate");

-- CreateIndex
CREATE INDEX "TaskSubmission_studentId_submittedAt_idx" ON "TaskSubmission"("studentId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSubmission_taskId_version_key" ON "TaskSubmission"("taskId", "version");

-- CreateIndex
CREATE INDEX "TaskFeedback_submissionId_createdAt_idx" ON "TaskFeedback"("submissionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskResult_taskId_key" ON "TaskResult"("taskId");

-- CreateIndex
CREATE INDEX "TaskResult_studentId_finalizedAt_idx" ON "TaskResult"("studentId", "finalizedAt");

-- AddForeignKey
ALTER TABLE "OnboardingSurvey" ADD CONSTRAINT "OnboardingSurvey_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceTask" ADD CONSTRAINT "PerformanceTask_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceTask" ADD CONSTRAINT "PerformanceTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubmission" ADD CONSTRAINT "TaskSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PerformanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFeedback" ADD CONSTRAINT "TaskFeedback_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TaskSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFeedback" ADD CONSTRAINT "TaskFeedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskResult" ADD CONSTRAINT "TaskResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PerformanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskResult" ADD CONSTRAINT "TaskResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
