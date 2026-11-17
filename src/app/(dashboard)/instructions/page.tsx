import { prisma } from "@/lib/prisma";
import { getInstructionInbox } from "@/lib/student-instructions";
import { InstructionBoard } from "@/components/instructions/instruction-board";
import { PageHeader, StatusBadge } from "@/components/backoffice/ui";
import { requireDashboardSession } from "../_lib/page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "학생 지시" };

export default async function InstructionsPage() {
  // 온라인 직원 포함 직원 전체 (가족 톡방과 같은 기준)
  await requireDashboardSession();

  const [inbox, students] = await Promise.all([
    getInstructionInbox(),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, grade: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="학생 지시"
        meta={
          inbox.pending.length > 0 ? (
            <StatusBadge tone="warn" size="large">처리할 요청 {inbox.pending.length}건</StatusBadge>
          ) : undefined
        }
        description="학부모 요청을 학생에게 줄 지시로 바꿔 보내요. 학생에게는 보낸 사람 이름만 보여요."
      />

      <InstructionBoard inbox={inbox} students={students} />
    </>
  );
}
