import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const USER_EMAIL = "willi020105@gmail.com";
const TEST_ONLINE_STUDENT_ID = "seed-s001"; // 기본 seed 의 첫 학생 "김지훈"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1) 본인 계정을 SUPER_ADMIN 으로 upsert — Clerk 로그인 시 clerkId 자동 연결
  const me = await prisma.user.upsert({
    where: { email: USER_EMAIL },
    update: { role: "SUPER_ADMIN" },
    create: {
      email: USER_EMAIL,
      name: "이우혁",
      role: "SUPER_ADMIN",
    },
  });
  console.log(`✅ SUPER_ADMIN 계정: ${me.email}`);

  // 2) CONSULTANT / MANAGER_MENTOR 테스트 계정 (로그인 X, role 동작 확인용)
  const consultant = await prisma.user.upsert({
    where: { email: "consultant@test.local" },
    update: { role: "CONSULTANT" },
    create: {
      email: "consultant@test.local",
      name: "테스트 컨설턴트",
      role: "CONSULTANT",
    },
  });
  const managerMentor = await prisma.user.upsert({
    where: { email: "manager.mentor@test.local" },
    update: { role: "MANAGER_MENTOR" },
    create: {
      email: "manager.mentor@test.local",
      name: "테스트 관리멘토",
      role: "MANAGER_MENTOR",
    },
  });
  console.log(`✅ CONSULTANT 계정: ${consultant.email}`);
  console.log(`✅ MANAGER_MENTOR 계정: ${managerMentor.email}`);

  // 3) 학생 1명을 온라인 관리로 전환 + 담당자 배정
  const onlineStudent = await prisma.student.update({
    where: { id: TEST_ONLINE_STUDENT_ID },
    data: {
      isOnlineManaged: true,
      onlineStartedAt: new Date(),
      assignedMentorId: managerMentor.id,
      assignedConsultantId: consultant.id,
    },
  });
  console.log(`✅ 온라인 학생 전환: ${onlineStudent.name} (${onlineStudent.id})`);

  console.log("\n🎯 테스트 시나리오:");
  console.log(`  1. ${USER_EMAIL} 로 Clerk 로그인 → 자동 SUPER_ADMIN 연결`);
  console.log(`  2. /online 접근 → 대시보드 노출 확인`);
  console.log(`  3. /online/students → ${onlineStudent.name} 보이는지`);
  console.log(`  4. 매직링크 발급 → 시크릿 창에서 /s/[token] 접속`);
  console.log(`  5. /students (오프라인) → ${onlineStudent.name} 보이지 않는지 (격리 확인)`);
  console.log(`  6. DB 에서 본인 role 을 CONSULTANT 로 바꿔 재로그인 → /online 접근 가능 / / 접근 차단`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
