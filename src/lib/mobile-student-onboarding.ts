// 입실 준비 조회·저장 — 학생 앱 API 와 원생 상세 카드가 같이 쓴다. 계약은 @/lib/onboarding/entry.

import { prisma } from "@/lib/prisma";
import { sanitizeAttendance, sanitizeOutings, type AttendanceSlot, type OutingSlot } from "@/lib/online/schedule-commit";
import { toKSTDateTime, todayKST } from "@/lib/utils";
import {
  ENTRY_SCORE_NOTE,
  ENTRY_SECTION_KEY,
  ENTRY_SINCE,
  ENTRY_STEPS,
  ENTRY_STEP_LABEL,
  MENTOR_QUESTIONS,
  type EntryGrades,
  type EntryMentor,
  type EntryOnboardingResponse,
  type Saved,
} from "@/lib/onboarding/entry";

type Sections = Record<string, unknown>;

/**
 * eligible = ENTRY_SINCE 이후 만든 학생 계정 (원생 상세 카드는 이 학생에게만 등원 스케줄 제출을 입실 준비로 센다).
 * submitted = 가장 최근 등원 스케줄 제출 원본 (원생 상세 카드에서 등하원·학원 일정을 보여 준다)
 */
export async function loadEntryOnboarding(studentId: string): Promise<{
  eligible: boolean;
  data: EntryOnboardingResponse;
  submitted: { attendance: AttendanceSlot[]; outings: OutingSlot[] } | null;
}> {
  const [account, proposal, survey] = await Promise.all([
    prisma.authUser.findUnique({ where: { studentId }, select: { createdAt: true } }),
    prisma.scheduleProposal.findFirst({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true, submittedAttendance: true, submittedOutings: true },
    }),
    prisma.onboardingSurvey.findUnique({ where: { studentId }, select: { sections: true } }),
  ]);

  // 저장할 때 entry-validate 로 검사한 값만 들어간다
  const sections = (survey?.sections ?? {}) as Sections;
  const grades = (sections[ENTRY_SECTION_KEY.grades] ?? null) as Saved<EntryGrades> | null;
  const answers = (sections[ENTRY_SECTION_KEY.mentor] ?? null) as Saved<{ answers: EntryMentor }> | null;

  const done = { schedule: !!proposal, grades: !!grades, mentor: !!answers };
  const steps = ENTRY_STEPS.map((key) => ({ key, label: ENTRY_STEP_LABEL[key], done: done[key] }));
  const eligible = !!account && account.createdAt >= toKSTDateTime(ENTRY_SINCE, "00:00");

  return {
    eligible,
    data: {
      show: eligible && steps.some((s) => !s.done),
      steps,
      schedule: proposal ? { submittedAt: proposal.createdAt.toISOString(), status: proposal.status } : null,
      grades,
      mentor: { questions: MENTOR_QUESTIONS, answers },
    },
    submitted: proposal
      ? { attendance: sanitizeAttendance(proposal.submittedAttendance), outings: sanitizeOutings(proposal.submittedOutings) }
      : null,
  };
}

export async function getEntryOnboarding(studentId: string): Promise<EntryOnboardingResponse> {
  return (await loadEntryOnboarding(studentId)).data;
}

// ponytail: 읽고 펼쳐서 쓰는 방식(mobile-survey.ts 와 같음)이라 같은 학생이 두 단계를 동시에 내면 한쪽이 덮일 수 있다.
//           학생 한 명이 한 화면씩 내는 흐름이라 둔다. 문제가 되면 jsonb || 로 원자 병합.
async function saveSection(
  db: Pick<typeof prisma, "onboardingSurvey">,
  studentId: string,
  key: string,
  value: object,
) {
  const existing = await db.onboardingSurvey.findUnique({ where: { studentId }, select: { sections: true } });
  const sections = { ...((existing?.sections ?? {}) as Sections), [key]: { ...value, savedAt: new Date().toISOString() } };
  // submittedAt·version 은 온라인 설문 것이라 건드리지 않는다
  await db.onboardingSurvey.upsert({
    where: { studentId },
    update: { sections: sections as object },
    create: { studentId, sections: sections as object },
  });
}

/** 성적 원본 저장 + ExamScore 반영(입실 준비 표시 행만 지우고 다시 넣음) */
export async function saveEntryGrades(studentId: string, value: EntryGrades) {
  const examDate = todayKST();
  const rows = [
    ...(value.mock
      ? Object.entries(value.mock.scores).map(([subject, grade]) => ({
          examType: "OFFICIAL_MOCK" as const,
          examName: value.mock!.examName,
          subject,
          grade,
        }))
      : []),
    ...(value.school
      ? Object.entries(value.school.scores).map(([subject, grade]) => ({
          examType: "SCHOOL_EXAM" as const,
          examName: `${value.school!.term} 내신`,
          subject,
          grade,
        }))
      : []),
  ]
    .filter((r): r is typeof r & { grade: number } => r.grade != null)
    .map((r) => ({ ...r, studentId, examDate, notes: ENTRY_SCORE_NOTE }));

  await prisma.$transaction(async (tx) => {
    await saveSection(tx, studentId, ENTRY_SECTION_KEY.grades, value);
    await tx.examScore.deleteMany({ where: { studentId, notes: ENTRY_SCORE_NOTE } });
    if (rows.length > 0) await tx.examScore.createMany({ data: rows });
  });
  return getEntryOnboarding(studentId);
}

export async function saveEntryMentor(studentId: string, value: { answers: EntryMentor }) {
  await saveSection(prisma, studentId, ENTRY_SECTION_KEY.mentor, value);
  return getEntryOnboarding(studentId);
}
