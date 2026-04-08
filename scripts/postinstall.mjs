// Vercel 빌드 및 npm install 후 자동 실행
// prisma generate 후 삭제되는 index.ts를 자동 재생성
import { spawnSync } from "child_process";
import { writeFileSync } from "fs";

console.log("🔧 prisma generate 실행 중...");
const result = spawnSync("npx", ["prisma", "generate"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

writeFileSync(
  "src/generated/prisma/index.ts",
  `/* Auto-generated barrel — do not edit directly */
export * from './client'
export type * from './models'

// Prisma 7 compatibility: plain model names aliased from XxxModel
export type { AcademicPlanModel as AcademicPlan } from './models/AcademicPlan'
export type { AssignmentModel as Assignment } from './models/Assignment'
export type { AttendanceRecordModel as AttendanceRecord } from './models/AttendanceRecord'
export type { AttendanceScheduleModel as AttendanceSchedule } from './models/AttendanceSchedule'
export type { CalendarEventModel as CalendarEvent } from './models/CalendarEvent'
export type { CommunicationModel as Communication } from './models/Communication'
export type { DailyOutingModel as DailyOuting } from './models/DailyOuting'
export type { ExamScoreModel as ExamScore } from './models/ExamScore'
export type { FeatureRequestModel as FeatureRequest } from './models/FeatureRequest'
export type { FeatureRequestCommentModel as FeatureRequestComment } from './models/FeatureRequestComment'
export type { MentoringModel as Mentoring } from './models/Mentoring'
export type { MentorScheduleModel as MentorSchedule } from './models/MentorSchedule'
export type { OutingScheduleModel as OutingSchedule } from './models/OutingSchedule'
export type { StudentModel as Student } from './models/Student'
export type { UserModel as User } from './models/User'
export type { VocabTestEnrollmentModel as VocabTestEnrollment } from './models/VocabTestEnrollment'
export type { VocabTestScoreModel as VocabTestScore } from './models/VocabTestScore'
`
);
console.log("✅ src/generated/prisma/index.ts 재생성 완료");
