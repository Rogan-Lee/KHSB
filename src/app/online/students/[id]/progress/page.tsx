import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { isOnlineStaff, isManagerMentor, isFullAccess } from "@/lib/roles";
import {
  SubjectProgressPanel,
  type ProgressEntry,
} from "@/components/online/subject-progress-panel";
import { DEFAULT_SUBJECTS } from "@/lib/online/subjects";
import { StudentDetailHeader } from "../_components/student-detail-header";

export default async function StudentProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  if (!isOnlineStaff(user?.role)) redirect("/");
  const canEdit = isManagerMentor(user?.role) || isFullAccess(user?.role);

  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      grade: true,
      status: true,
      isOnlineManaged: true,
      selectedSubjects: true,
    },
  });
  if (!student || !student.isOnlineManaged) notFound();

  // 학생이 selectedSubjects 에 "수학, 영어, 사탐" 같이 기록했으면 그걸 우선,
  // 없으면 DEFAULT_SUBJECTS. Phase 1 은 단순 문자열 split.
  const customSubjects = (student.selectedSubjects ?? "")
    .split(/[,\s/·]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const subjects = customSubjects.length > 0 ? customSubjects : [...DEFAULT_SUBJECTS];

  const allEntries = await prisma.subjectProgress.findMany({
    where: { studentId: id },
    orderBy: { recordedAt: "desc" },
    include: { author: { select: { name: true } } },
  });

  const entriesBySubject: Record<string, ProgressEntry[]> = {};
  for (const e of allEntries) {
    const row: ProgressEntry = {
      id: e.id,
      subject: e.subject,
      currentTopic: e.currentTopic,
      textbookPage: e.textbookPage,
      weeklyProgress: e.weeklyProgress,
      notes: e.notes,
      recordedAt: e.recordedAt.toISOString(),
      authorName: e.author.name,
    };
    (entriesBySubject[e.subject] ??= []).push(row);
  }

  return (
    <div>
      <StudentDetailHeader
        student={student}
        current="progress"
        description={`${student.grade} · 과목별 최신 상태와 기록 이력을 볼 수 있어요`}
      />

      <SubjectProgressPanel
        studentId={id}
        subjects={subjects}
        entriesBySubject={entriesBySubject}
        canEdit={canEdit}
      />
    </div>
  );
}
