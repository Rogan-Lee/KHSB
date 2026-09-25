import { StudentForm } from "@/components/students/student-form";
import { prisma } from "@/lib/prisma";
import { PageHeader, Section } from "@/components/backoffice/ui";
import { parseSchool } from "@/lib/utils";

export default async function NewStudentPage() {
  const [mentors, schoolRows, seatRows] = await Promise.all([
    prisma.user.findMany({
      // 신규 학생 등록 멘토 picker — 퇴사자 제외
      where: { status: "ACTIVE", role: { in: ["SUPER_ADMIN", "DIRECTOR", "HEAD_MENTOR", "MENTOR"] } },
      select: { id: true, name: true },
    }),
    prisma.student.findMany({ select: { school: true } }),
    prisma.student.findMany({
      where: { status: "ACTIVE", seat: { not: null } },
      select: { seat: true },
    }),
  ]);

  const schools = [...new Set(schoolRows.map((s) => parseSchool(s.school ?? "")).filter(Boolean))].sort();
  const occupiedSeats = seatRows.map((s) => s.seat!);

  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: "/students", label: "원생 관리" }}
        title="원생 등록"
        description="이름·학년·학부모 연락처·등원일만 채우면 바로 등록돼요. 나머지는 나중에 고쳐도 돼요."
      />
      <Section>
        <StudentForm mentors={mentors} schools={schools} occupiedSeats={occupiedSeats} />
      </Section>
    </div>
  );
}
