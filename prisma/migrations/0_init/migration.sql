-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'MENTOR', 'STAFF', 'STUDENT');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AttendanceType" AS ENUM ('NORMAL', 'ABSENT', 'TARDY', 'EARLY_LEAVE', 'APPROVED_ABSENT', 'NOTIFIED_ABSENT');

-- CreateEnum
CREATE TYPE "MeritType" AS ENUM ('MERIT', 'DEMERIT');

-- CreateEnum
CREATE TYPE "MentoringStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsultationType" AS ENUM ('STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "ConsultationCategory" AS ENUM ('ENROLLED', 'NEW_ADMISSION', 'CONSIDERING');

-- CreateEnum
CREATE TYPE "ConsultationOwner" AS ENUM ('DIRECTOR', 'HEAD_TEACHER');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('ATTENDANCE', 'ABSENT', 'MERIT_DEMERIT', 'MENTORING', 'MONTHLY_REPORT', 'CONSULTATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('PARENT_REQUEST', 'STAFF_NOTE');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('OFFICIAL_MOCK', 'PRIVATE_MOCK', 'SCHOOL_EXAM');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('SCHOOL_EXAM', 'SCHOOL_EVENT', 'PERSONAL', 'PLATFORM');

-- CreateEnum
CREATE TYPE "WorkTagType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT');

-- CreateEnum
CREATE TYPE "VocabEnrollReason" AS ENUM ('AUTO_GRADE3', 'PARENT_REQUEST', 'MENTOR_ASSIGNED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "HandoverPriority" AS ENUM ('URGENT', 'NORMAL');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('OPEN', 'CLOSE', 'ALL');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "RequestCategory" AS ENUM ('BUG', 'FEATURE', 'IMPROVEMENT');

-- CreateEnum
CREATE TYPE "RequestPriority" AS ENUM ('URGENT', 'NORMAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clerkId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MENTOR',
    "isMentor" BOOLEAN NOT NULL DEFAULT false,
    "kakaoAccessToken" TEXT,
    "kakaoRefreshToken" TEXT,
    "kakaoTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "WorkTagType" NOT NULL,
    "taggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "editedById" TEXT,
    "editedByName" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hourlyRate" INTEGER NOT NULL,
    "weeklyHolidayPay" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "workMinutes" INTEGER NOT NULL,
    "baseWage" INTEGER NOT NULL,
    "weeklyHolidayWage" INTEGER NOT NULL DEFAULT 0,
    "totalWage" INTEGER NOT NULL,
    "hourlyRateAtCalc" INTEGER NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "parentPhone" TEXT NOT NULL,
    "parentEmail" TEXT,
    "grade" TEXT NOT NULL,
    "school" TEXT,
    "classGroup" TEXT,
    "seat" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "birthDate" DATE,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "internalScoreRange" TEXT,
    "mockScoreRange" TEXT,
    "targetUniversity" TEXT,
    "mentoringNotes" TEXT,
    "dailyNote" TEXT,
    "dailyNoteDate" DATE,
    "studentInfo" TEXT,
    "selectedSubjects" TEXT,
    "admissionType" TEXT,
    "onlineLectures" TEXT,
    "changeNote" TEXT,
    "vocabTestDate" DATE,
    "pledgeDate" DATE,
    "mockAnalysisDate" DATE,
    "schoolAnalysisDate" DATE,
    "plannerSentDate" DATE,
    "weeklyPlanDate" DATE,
    "mentorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSchedule" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "outStart" TIMESTAMP(3),
    "outEnd" TIMESTAMP(3),
    "type" "AttendanceType" NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "isAutoClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutingSchedule" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "outStart" TEXT NOT NULL,
    "outEnd" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyOuting" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "outStart" TIMESTAMP(3),
    "outEnd" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyOuting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeritDemerit" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "MeritType" NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "category" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeritDemerit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mentoring" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "scheduledTimeStart" TEXT,
    "scheduledTimeEnd" TEXT,
    "actualDate" TIMESTAMP(3),
    "actualStartTime" TEXT,
    "actualEndTime" TEXT,
    "status" "MentoringStatus" NOT NULL DEFAULT 'SCHEDULED',
    "content" TEXT,
    "previousIssues" TEXT,
    "improvements" TEXT,
    "weaknesses" TEXT,
    "nextGoals" TEXT,
    "notes" TEXT,
    "feedbackSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mentoring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorSchedule" (
    "id" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "timeStart" TEXT NOT NULL,
    "timeEnd" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentorSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicPlan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "weeklyGoals" JSONB,
    "subjects" JSONB,
    "overallGoal" TEXT,
    "reflection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorConsultation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT,
    "prospectName" TEXT,
    "prospectGrade" TEXT,
    "prospectPhone" TEXT,
    "type" "ConsultationType" NOT NULL DEFAULT 'STUDENT',
    "category" "ConsultationCategory" NOT NULL DEFAULT 'ENROLLED',
    "owner" "ConsultationOwner" NOT NULL DEFAULT 'DIRECTOR',
    "scheduledAt" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "status" "ConsultationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "agenda" TEXT,
    "notes" TEXT,
    "outcome" TEXT,
    "followUp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorConsultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientName" TEXT,
    "content" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "errorMsg" TEXT,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "attendanceDays" INTEGER NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "tardyCount" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveCount" INTEGER NOT NULL DEFAULT 0,
    "totalMerits" INTEGER NOT NULL DEFAULT 0,
    "totalDemerits" INTEGER NOT NULL DEFAULT 0,
    "mentoringCount" INTEGER NOT NULL DEFAULT 0,
    "totalStudyMinutes" INTEGER NOT NULL DEFAULT 0,
    "prevMonthStudyMinutes" INTEGER,
    "studyRankInRoom" INTEGER,
    "studyRankTotal" INTEGER,
    "gradeAvgMinutes" INTEGER,
    "outingCount" INTEGER NOT NULL DEFAULT 0,
    "totalOutingMinutes" INTEGER NOT NULL DEFAULT 0,
    "mentoringSummary" TEXT,
    "overallComment" TEXT,
    "shareToken" TEXT,
    "attachedPhotoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyAdmissionInfo" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "grade" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyAdmissionInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyAward" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "content" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamScore" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL,
    "examName" TEXT NOT NULL,
    "examDate" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "rawScore" INTEGER,
    "grade" INTEGER,
    "percentile" DOUBLE PRECISION,
    "notes" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "examDate" DATE NOT NULL,
    "room" TEXT NOT NULL DEFAULT 'H',
    "examType" "ExamType" NOT NULL DEFAULT 'OFFICIAL_MOCK',
    "subjects" TEXT[],
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "autoKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "folderId" TEXT,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "parsedDate" DATE,
    "parsedSeatNumber" INTEGER,
    "parsedName" TEXT,
    "studentId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSeatAssignment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSeatAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mentoringId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "dueDate" DATE,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "type" "CalendarEventType" NOT NULL,
    "studentId" TEXT,
    "schoolName" TEXT,
    "color" TEXT,
    "googleEventId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentReport" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mentoringId" TEXT,
    "studyPlanNote" TEXT,
    "studyPlanImages" TEXT[],
    "customNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "details" TEXT,
    "colorCode" TEXT NOT NULL DEFAULT 'blue',
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyPlanReport" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "images" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyPlanReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationReport" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "recipientName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabTestEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "reason" "VocabEnrollReason" NOT NULL DEFAULT 'CUSTOM',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enrolledById" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unenrolledAt" TIMESTAMP(3),

    CONSTRAINT "VocabTestEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabTestScore" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "testDate" DATE NOT NULL,
    "totalWords" INTEGER NOT NULL,
    "correctWords" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabTestScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL DEFAULT 'ALL',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverTask" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverChecklist" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "shiftType" TEXT NOT NULL DEFAULT 'ALL',
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "checkedById" TEXT,
    "checkedByName" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HandoverChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyNote" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "studentId" TEXT,
    "studentName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "priority" "HandoverPriority" NOT NULL DEFAULT 'NORMAL',
    "category" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientName" TEXT,
    "monthlyNotesSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverRead" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "dueDate" DATE,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingMinutes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "attendees" TEXT[],
    "team" TEXT NOT NULL DEFAULT '운영팀',
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingMinutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingMinutesRead" (
    "id" TEXT NOT NULL,
    "meetingMinutesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingMinutesRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "category" "RequestCategory" NOT NULL DEFAULT 'FEATURE',
    "priority" "RequestPriority" NOT NULL DEFAULT 'NORMAL',
    "relatedPage" TEXT,
    "requester" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureRequestComment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "featureRequestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureRequestComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleSheetsConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "sheetUrl" TEXT NOT NULL,
    "sheetName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleSheetsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarToken" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "connectedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "page" TEXT NOT NULL DEFAULT 'mentoring',
    "authorId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE INDEX "WorkTag_userId_taggedAt_idx" ON "WorkTag"("userId", "taggedAt");

-- CreateIndex
CREATE INDEX "WorkTag_taggedAt_idx" ON "WorkTag"("taggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSetting_userId_key" ON "PayrollSetting"("userId");

-- CreateIndex
CREATE INDEX "PayrollRecord_year_month_idx" ON "PayrollRecord"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRecord_userId_year_month_key" ON "PayrollRecord"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "AttendanceRecord_date_idx" ON "AttendanceRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_studentId_date_key" ON "AttendanceRecord"("studentId", "date");

-- CreateIndex
CREATE INDEX "DailyOuting_studentId_date_idx" ON "DailyOuting"("studentId", "date");

-- CreateIndex
CREATE INDEX "MeritDemerit_studentId_date_idx" ON "MeritDemerit"("studentId", "date");

-- CreateIndex
CREATE INDEX "MeritDemerit_date_idx" ON "MeritDemerit"("date");

-- CreateIndex
CREATE INDEX "Mentoring_studentId_scheduledAt_idx" ON "Mentoring"("studentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Mentoring_mentorId_scheduledAt_idx" ON "Mentoring"("mentorId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Mentoring_status_scheduledAt_idx" ON "Mentoring"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "MentorSchedule_mentorId_dayOfWeek_key" ON "MentorSchedule"("mentorId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicPlan_studentId_year_month_key" ON "AcademicPlan"("studentId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_shareToken_key" ON "MonthlyReport"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_studentId_year_month_key" ON "MonthlyReport"("studentId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyAdmissionInfo_year_month_grade_key" ON "MonthlyAdmissionInfo"("year", "month", "grade");

-- CreateIndex
CREATE INDEX "MonthlyAward_year_month_idx" ON "MonthlyAward"("year", "month");

-- CreateIndex
CREATE INDEX "ExamScore_sessionId_idx" ON "ExamScore"("sessionId");

-- CreateIndex
CREATE INDEX "ExamSession_examDate_idx" ON "ExamSession"("examDate");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoFolder_autoKey_key" ON "PhotoFolder"("autoKey");

-- CreateIndex
CREATE INDEX "PhotoFolder_parentId_idx" ON "PhotoFolder"("parentId");

-- CreateIndex
CREATE INDEX "Photo_folderId_idx" ON "Photo"("folderId");

-- CreateIndex
CREATE INDEX "Photo_parsedDate_idx" ON "Photo"("parsedDate");

-- CreateIndex
CREATE INDEX "Photo_parsedSeatNumber_idx" ON "Photo"("parsedSeatNumber");

-- CreateIndex
CREATE INDEX "Photo_studentId_idx" ON "Photo"("studentId");

-- CreateIndex
CREATE INDEX "ExamSeatAssignment_studentId_idx" ON "ExamSeatAssignment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeatAssignment_sessionId_seatNumber_key" ON "ExamSeatAssignment"("sessionId", "seatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeatAssignment_sessionId_studentId_key" ON "ExamSeatAssignment"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentReport_token_key" ON "ParentReport"("token");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_studentId_date_key" ON "DailyPlan"("studentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StudyPlanReport_token_key" ON "StudyPlanReport"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationReport_token_key" ON "ConsultationReport"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VocabTestEnrollment_studentId_key" ON "VocabTestEnrollment"("studentId");

-- CreateIndex
CREATE INDEX "MonthlyNote_year_month_idx" ON "MonthlyNote"("year", "month");

-- CreateIndex
CREATE INDEX "Handover_date_idx" ON "Handover"("date");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverRead_handoverId_userId_key" ON "HandoverRead"("handoverId", "userId");

-- CreateIndex
CREATE INDEX "Todo_authorId_idx" ON "Todo"("authorId");

-- CreateIndex
CREATE INDEX "Todo_assigneeId_idx" ON "Todo"("assigneeId");

-- CreateIndex
CREATE INDEX "MeetingMinutes_date_idx" ON "MeetingMinutes"("date");

-- CreateIndex
CREATE INDEX "MeetingMinutes_team_idx" ON "MeetingMinutes"("team");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingMinutesRead_meetingMinutesId_userId_key" ON "MeetingMinutesRead"("meetingMinutesId", "userId");

-- CreateIndex
CREATE INDEX "FeatureRequest_status_idx" ON "FeatureRequest"("status");

-- CreateIndex
CREATE INDEX "FeatureRequestComment_featureRequestId_idx" ON "FeatureRequestComment"("featureRequestId");

-- AddForeignKey
ALTER TABLE "WorkTag" ADD CONSTRAINT "WorkTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSetting" ADD CONSTRAINT "PayrollSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSchedule" ADD CONSTRAINT "AttendanceSchedule_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutingSchedule" ADD CONSTRAINT "OutingSchedule_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyOuting" ADD CONSTRAINT "DailyOuting_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeritDemerit" ADD CONSTRAINT "MeritDemerit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentoring" ADD CONSTRAINT "Mentoring_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentoring" ADD CONSTRAINT "Mentoring_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorSchedule" ADD CONSTRAINT "MentorSchedule_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicPlan" ADD CONSTRAINT "AcademicPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorConsultation" ADD CONSTRAINT "DirectorConsultation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyReport" ADD CONSTRAINT "MonthlyReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyAward" ADD CONSTRAINT "MonthlyAward_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamScore" ADD CONSTRAINT "ExamScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamScore" ADD CONSTRAINT "ExamScore_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoFolder" ADD CONSTRAINT "PhotoFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PhotoFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "PhotoFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeatAssignment" ADD CONSTRAINT "ExamSeatAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeatAssignment" ADD CONSTRAINT "ExamSeatAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentReport" ADD CONSTRAINT "ParentReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentReport" ADD CONSTRAINT "ParentReport_mentoringId_fkey" FOREIGN KEY ("mentoringId") REFERENCES "Mentoring"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentReport" ADD CONSTRAINT "ParentReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyPlanReport" ADD CONSTRAINT "StudyPlanReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationReport" ADD CONSTRAINT "ConsultationReport_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "DirectorConsultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabTestEnrollment" ADD CONSTRAINT "VocabTestEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabTestScore" ADD CONSTRAINT "VocabTestScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverTask" ADD CONSTRAINT "HandoverTask_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverChecklist" ADD CONSTRAINT "HandoverChecklist_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyNote" ADD CONSTRAINT "MonthlyNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverRead" ADD CONSTRAINT "HandoverRead_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMinutesRead" ADD CONSTRAINT "MeetingMinutesRead_meetingMinutesId_fkey" FOREIGN KEY ("meetingMinutesId") REFERENCES "MeetingMinutes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureRequestComment" ADD CONSTRAINT "FeatureRequestComment_featureRequestId_fkey" FOREIGN KEY ("featureRequestId") REFERENCES "FeatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

