import { StudentForm } from "@/components/students/student-form";
import { NewOnlineStudentForm } from "@/components/online/new-online-student-form";
import { prisma } from "@/lib/prisma";
import { LinkTabs, PageHeader, Section } from "@/components/backoffice/ui";
import { isFullAccess } from "@/lib/roles";
import { parseSchool } from "@/lib/utils";
import { requireDashboardSession } from "../../_lib/page-guard";
import { onlineAssigneeOptions } from "../_components/online-students-view";

export default async function NewStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await requireDashboardSession();
  // 온라인 학생 등록은 원장급만 (createOnlineStudent 가 requireFullAccess)
  const canOnline = isFullAccess(session.user.role);
  const online = canOnline && (await searchParams).type === "online";

  const typeTabs = canOnline ? (
    <LinkTabs
      current={online ? "online" : "offline"}
      items={[
        { value: "offline", href: "/students/new?type=offline", label: "자습실" },
        { value: "online", href: "/students/new?type=online", label: "온라인" },
      ]}
    />
  ) : null;

  if (online) {
    const [mentors, consultants] = await onlineAssigneeOptions();
    return (
      <div className="max-w-3xl">
        <PageHeader
          back={{ href: "/students?type=online", label: "원생 관리" }}
          title="원생 등록"
          description="온라인 관리 학생을 새로 등록해요. 재원 중인 자습실 학생은 원생 관리 › 온라인의 학생 추가에서 전환할 수 있어요."
        />
        {typeTabs}
        <Section>
          <NewOnlineStudentForm mentors={mentors} consultants={consultants} />
        </Section>
      </div>
    );
  }

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
      {typeTabs}
      <Section>
        <StudentForm mentors={mentors} schools={schools} occupiedSeats={occupiedSeats} />
      </Section>
    </div>
  );
}
