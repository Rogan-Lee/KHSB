import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // 원장 계정 생성
  const directorPassword = await bcrypt.hash("admin1234", 10);
  const director = await prisma.user.upsert({
    where: { email: "director@studyroom.kr" },
    update: {},
    create: {
      email: "director@studyroom.kr",
      name: "원장님",
      password: directorPassword,
      role: "DIRECTOR",
    },
  });

  // 멘토 계정 생성
  const mentorPassword = await bcrypt.hash("mentor1234", 10);
  const mentor = await prisma.user.upsert({
    where: { email: "mentor1@studyroom.kr" },
    update: {},
    create: {
      email: "mentor1@studyroom.kr",
      name: "김멘토",
      password: mentorPassword,
      role: "MENTOR",
    },
  });

  // 샘플 원생 생성
  const studentData = [
    { name: "김지훈", grade: "고3", seat: "A-01", parentPhone: "010-1234-5678" },
    { name: "이수연", grade: "고2", seat: "A-02", parentPhone: "010-2345-6789" },
    { name: "박민준", grade: "N수", seat: "B-01", parentPhone: "010-3456-7890" },
    { name: "최서아", grade: "고1", seat: "B-02", parentPhone: "010-4567-8901" },
    { name: "정우성", grade: "고3", seat: "C-01", parentPhone: "010-5678-9012" },
  ];

  for (const data of studentData) {
    await prisma.student.upsert({
      where: { id: `seed-${data.name}` },
      update: {},
      create: {
        id: `seed-${data.name}`,
        ...data,
        startDate: new Date("2025-03-01"),
        mentorId: mentor.id,
        status: "ACTIVE",
      },
    });
  }

  console.log("✅ Seed completed");
  console.log("📧 원장:", director.email, "/ 비밀번호: admin1234");
  console.log("📧 멘토:", mentor.email, "/ 비밀번호: mentor1234");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
