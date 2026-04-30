/**
 * 정소율 멘토 계정 완전 삭제 스크립트 (Hard delete).
 *
 * 동작:
 *  1. name="정소율" User 조회 (없으면 abort)
 *  2. 영향 카운트 출력 (담당 학생, 멘토링, 스케줄, 리포트 등)
 *  3. CONFIRM=yes 환경변수 있을 때만 실제 삭제 수행 (안전장치)
 *  4. 단일 트랜잭션:
 *     - Student.mentorId / assignedMentorId / assignedConsultantId 를 null 로
 *     - Mentoring (mentor=정소율) 삭제
 *     - MentorSchedule 삭제
 *     - ParentReport (createdBy=정소율) 삭제
 *     - TimetableEntry (createdBy=정소율) 삭제
 *     - Announcement (author=정소율) 삭제
 *     - 테스트학생_정소율 Student 삭제 (cascade 로 attendance/mentoring/etc 함께)
 *     - User 삭제 (cascade 로 WorkTag/PayrollSetting/PayrollRecord 함께)
 *
 * 실행:
 *   npx tsx scripts/delete-mentor-jeongsoyul.ts            # dry-run
 *   CONFIRM=yes npx tsx scripts/delete-mentor-jeongsoyul.ts # 실제 삭제
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MENTOR_NAME = "정소율";
const TEST_STUDENT_NAME = "테스트학생_정소율";

async function main() {
  const dryRun = process.env.CONFIRM !== "yes";

  const mentor = await prisma.user.findFirst({ where: { name: MENTOR_NAME } });
  if (!mentor) {
    console.error(`✗ 멘토 "${MENTOR_NAME}" 를 찾을 수 없습니다.`);
    process.exit(1);
  }
  console.log(`✓ 대상: ${mentor.name} (id=${mentor.id}, email=${mentor.email}, role=${mentor.role}, isMentor=${mentor.isMentor})\n`);

  // ── 영향 카운트 ──
  const [
    assignedStudents,
    onlineMentorStudents,
    consultantStudents,
    mentorings,
    mentorSchedules,
    parentReports,
    timetableEntries,
    announcements,
    workTags,
    payrollSetting,
    payrollRecords,
    testStudent,
  ] = await Promise.all([
    prisma.student.count({ where: { mentorId: mentor.id } }),
    prisma.student.count({ where: { assignedMentorId: mentor.id } }),
    prisma.student.count({ where: { assignedConsultantId: mentor.id } }),
    prisma.mentoring.count({ where: { mentorId: mentor.id } }),
    prisma.mentorSchedule.count({ where: { mentorId: mentor.id } }),
    prisma.parentReport.count({ where: { createdById: mentor.id } }),
    prisma.timetableEntry.count({ where: { createdById: mentor.id } }),
    prisma.announcement.count({ where: { authorId: mentor.id } }),
    prisma.workTag.count({ where: { userId: mentor.id } }),
    prisma.payrollSetting.findUnique({ where: { userId: mentor.id }, select: { id: true } }),
    prisma.payrollRecord.count({ where: { userId: mentor.id } }),
    prisma.student.findFirst({ where: { name: TEST_STUDENT_NAME }, select: { id: true } }),
  ]);

  console.log("── 영향 카운트 ──");
  console.log(`  담당 학생 (mentorId)             : ${assignedStudents}  → null 처리`);
  console.log(`  온라인 담당 (assignedMentorId)   : ${onlineMentorStudents}  → null 처리`);
  console.log(`  컨설턴트 담당 (assignedConsultantId) : ${consultantStudents}  → null 처리`);
  console.log(`  멘토링 기록                       : ${mentorings}  → 삭제`);
  console.log(`  멘토 스케줄                       : ${mentorSchedules}  → 삭제`);
  console.log(`  학부모 리포트                     : ${parentReports}  → 삭제`);
  console.log(`  시간표 엔트리                     : ${timetableEntries}  → 삭제`);
  console.log(`  공지                              : ${announcements}  → 삭제`);
  console.log(`  WorkTag                           : ${workTags}  → User 삭제 시 cascade`);
  console.log(`  PayrollSetting                    : ${payrollSetting ? 1 : 0}  → User 삭제 시 cascade`);
  console.log(`  PayrollRecord                     : ${payrollRecords}  → User 삭제 시 cascade`);
  console.log(`  테스트학생_정소율                  : ${testStudent ? `있음(id=${testStudent.id})` : "없음"}  → cascade 로 삭제`);
  console.log("");

  if (dryRun) {
    console.log("✋ DRY RUN — 실제 삭제하지 않았습니다.");
    console.log("   실행: CONFIRM=yes npx tsx scripts/delete-mentor-jeongsoyul.ts");
    process.exit(0);
  }

  console.log("⚠️  CONFIRM=yes 감지 — 실제 삭제 진행합니다...\n");

  await prisma.$transaction(async (tx) => {
    // 1) Student FK null 처리
    await tx.student.updateMany({ where: { mentorId: mentor.id }, data: { mentorId: null } });
    await tx.student.updateMany({ where: { assignedMentorId: mentor.id }, data: { assignedMentorId: null } });
    await tx.student.updateMany({ where: { assignedConsultantId: mentor.id }, data: { assignedConsultantId: null } });

    // 2) RESTRICT FK 들 — 직접 삭제 (멘토링 기록은 hard delete 옵션이라 의도적)
    await tx.mentoring.deleteMany({ where: { mentorId: mentor.id } });
    await tx.mentorSchedule.deleteMany({ where: { mentorId: mentor.id } });
    await tx.parentReport.deleteMany({ where: { createdById: mentor.id } });
    await tx.timetableEntry.deleteMany({ where: { createdById: mentor.id } });
    await tx.announcement.deleteMany({ where: { authorId: mentor.id } });

    // 3) 테스트 학생 삭제 (cascade 로 attendance / mentoring 등 함께)
    if (testStudent) {
      await tx.student.delete({ where: { id: testStudent.id } });
    }

    // 4) User 삭제 — WorkTag/PayrollSetting/PayrollRecord 는 cascade
    await tx.user.delete({ where: { id: mentor.id } });
  });

  console.log(`✅ ${mentor.name} 계정 및 관련 데이터 삭제 완료.`);
}

main()
  .catch((e) => {
    console.error("✗ 실패:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
