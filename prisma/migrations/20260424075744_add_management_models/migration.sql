-- CreateTable
CREATE TABLE "SubjectProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "currentTopic" TEXT NOT NULL,
    "textbookPage" TEXT,
    "weeklyProgress" INTEGER,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "SubjectProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "goals" JSONB NOT NULL DEFAULT '{}',
    "studyHours" INTEGER,
    "retrospective" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyKakaoLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "logDate" DATE NOT NULL,
    "rawContent" TEXT,
    "summary" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isParentVisible" BOOLEAN NOT NULL DEFAULT true,
    "aiSummarized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyKakaoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectProgress_studentId_subject_recordedAt_idx" ON "SubjectProgress"("studentId", "subject", "recordedAt");

-- CreateIndex
CREATE INDEX "SubjectProgress_studentId_recordedAt_idx" ON "SubjectProgress"("studentId", "recordedAt");

-- CreateIndex
CREATE INDEX "WeeklyPlan_authorId_weekStart_idx" ON "WeeklyPlan"("authorId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlan_studentId_weekStart_key" ON "WeeklyPlan"("studentId", "weekStart");

-- CreateIndex
CREATE INDEX "DailyKakaoLog_authorId_logDate_idx" ON "DailyKakaoLog"("authorId", "logDate");

-- CreateIndex
CREATE INDEX "DailyKakaoLog_studentId_logDate_idx" ON "DailyKakaoLog"("studentId", "logDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyKakaoLog_studentId_logDate_key" ON "DailyKakaoLog"("studentId", "logDate");

-- AddForeignKey
ALTER TABLE "SubjectProgress" ADD CONSTRAINT "SubjectProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectProgress" ADD CONSTRAINT "SubjectProgress_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlan" ADD CONSTRAINT "WeeklyPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlan" ADD CONSTRAINT "WeeklyPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyKakaoLog" ADD CONSTRAINT "DailyKakaoLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyKakaoLog" ADD CONSTRAINT "DailyKakaoLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
