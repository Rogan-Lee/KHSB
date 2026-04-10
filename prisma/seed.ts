import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // 시드용 Organization 생성
  const org = await prisma.organization.upsert({
    where: { slug: "seed-org" },
    update: {},
    create: {
      name: "시드 독서실",
      slug: "seed-org",
      plan: "STANDARD",
      status: "ACTIVE",
      maxStudents: 50,
    },
  });
  const orgId = org.id;

  // 원장 계정 생성 (Clerk 인증 사용 — password 필드 없음)
  const director = await prisma.user.upsert({
    where: { email: "director@studyroom.kr" },
    update: {},
    create: {
      email: "director@studyroom.kr",
      name: "원장님",
      role: "DIRECTOR",
    },
  });

  // Membership 생성
  await prisma.membership.upsert({
    where: { userId_orgId: { userId: director.id, orgId } },
    update: {},
    create: { userId: director.id, orgId, role: "DIRECTOR" },
  });

  // 멘토 계정 생성
  const mentor = await prisma.user.upsert({
    where: { email: "mentor1@studyroom.kr" },
    update: {},
    create: {
      email: "mentor1@studyroom.kr",
      name: "김멘토",
      role: "MENTOR",
    },
  });

  await prisma.membership.upsert({
    where: { userId_orgId: { userId: mentor.id, orgId } },
    update: {},
    create: { userId: mentor.id, orgId, role: "MENTOR" },
  });

  // 샘플 원생 생성
  const studentData = [
    { id: "seed-s001", name: "김지훈", grade: "고3", seat: "A-01", parentPhone: "010-1234-5678" },
    { id: "seed-s002", name: "이수연", grade: "고2", seat: "A-02", parentPhone: "010-2345-6789" },
    { id: "seed-s003", name: "박민준", grade: "N수", seat: "B-01", parentPhone: "010-3456-7890" },
    { id: "seed-s004", name: "최서아", grade: "고1", seat: "B-02", parentPhone: "010-4567-8901" },
    { id: "seed-s005", name: "정우성", grade: "고3", seat: "C-01", parentPhone: "010-5678-9012" },
  ];

  for (const data of studentData) {
    await prisma.student.upsert({
      where: { id: data.id },
      update: {},
      create: {
        ...data,
        startDate: new Date("2025-03-01"),
        mentorId: mentor.id,
        status: "ACTIVE",
        orgId,
      },
    });
  }

  console.log("✅ Seed completed");
  console.log("📧 원장:", director.email);
  console.log("📧 멘토:", mentor.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
