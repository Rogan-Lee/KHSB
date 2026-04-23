/**
 * 정소율 멘토를 시간표/주간 멘토링 계획에 노출시키는 1회성 활성화 스크립트.
 *
 * 배경: /mentoring/schedule 은 isMentor=true 로 필터, /mentoring-plan 은 mentorSchedules 존재 여부로 필터.
 * role=MENTOR 만 설정되어 있던 정소율이 두 페이지에 안 보이는 이슈 해결용.
 *
 * 동작:
 *   1. name="정소율" 로 User 조회 (없으면 abort)
 *   2. isMentor = true 로 업데이트
 *   3. MentorSchedule 이 하나도 없으면 기본(월~금 14:00-22:00) 추가
 *   4. 담당 테스트 학생 "테스트학생_정소율" 생성 (없는 경우만)
 *
 * 멱등성: 여러 번 실행해도 중복 생성되지 않음.
 *
 * 실행: `npx tsx scripts/activate-mentor-jeongsoyul.ts`
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MENTOR_NAME = "정소율";
const TEST_STUDENT_NAME = "테스트학생_정소율";
const DEFAULT_SCHEDULE_DAYS = [1, 2, 3, 4, 5]; // 월~금
const DEFAULT_START = "14:00";
const DEFAULT_END = "22:00";

async function main() {
  const mentor = await prisma.user.findFirst({ where: { name: MENTOR_NAME } });
  if (!mentor) {
    console.error(`✗ 멘토 "${MENTOR_NAME}" 를 찾을 수 없습니다. 먼저 /mentors 페이지에서 계정을 추가하세요.`);
    process.exit(1);
  }
  console.log(`✓ 멘토 찾음: ${mentor.name} (id=${mentor.id}, role=${mentor.role}, isMentor=${mentor.isMentor})`);

  // 1. isMentor 플래그 ON
  if (!mentor.isMentor) {
    await prisma.user.update({ where: { id: mentor.id }, data: { isMentor: true } });
    console.log(`✓ isMentor = true 로 업데이트됨`);
  } else {
    console.log(`- isMentor 이미 true`);
  }

  // 2. MentorSchedule 기본 근무일 보장
  const existingSchedules = await prisma.mentorSchedule.findMany({ where: { mentorId: mentor.id } });
  if (existingSchedules.length === 0) {
    for (const day of DEFAULT_SCHEDULE_DAYS) {
      await prisma.mentorSchedule.create({
        data: {
          mentorId: mentor.id,
          dayOfWeek: day,
          timeStart: DEFAULT_START,
          timeEnd: DEFAULT_END,
        },
      });
    }
    console.log(`✓ 기본 근무 스케줄 추가 (월~금 ${DEFAULT_START}-${DEFAULT_END})`);
  } else {
    console.log(`- MentorSchedule 이미 ${existingSchedules.length}개 존재, 추가 없음`);
  }

  // 3. 테스트 학생 생성
  const existingTestStudent = await prisma.student.findFirst({ where: { name: TEST_STUDENT_NAME } });
  if (!existingTestStudent) {
    const testStudent = await prisma.student.create({
      data: {
        name: TEST_STUDENT_NAME,
        parentPhone: "010-0000-0000",
        grade: "고2",
        startDate: new Date(),
        status: "ACTIVE",
        mentorId: mentor.id,
      },
    });
    console.log(`✓ 테스트 학생 생성: ${testStudent.name} (id=${testStudent.id}), mentorId=${mentor.id}`);
  } else {
    if (existingTestStudent.mentorId !== mentor.id) {
      await prisma.student.update({ where: { id: existingTestStudent.id }, data: { mentorId: mentor.id } });
      console.log(`✓ 기존 테스트 학생의 mentorId를 정소율로 재배정`);
    } else {
      console.log(`- 테스트 학생 이미 존재 (정소율 담당)`);
    }
  }

  console.log("\n완료. /mentoring/schedule 과 /mentoring-plan 에서 정소율 멘토가 보이는지 확인하세요.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
