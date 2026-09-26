import type { ReactNode } from "react";
import { getParentReportDetailed } from "@/actions/parent-reports";
import type { SubjectTrend } from "@/actions/analytics";
import { computeStudentAnalytics } from "@/lib/student-analytics";
import { hasGatePass } from "@/lib/token-auth";
import { prisma } from "@/lib/prisma";
import { parseMentoringNote } from "@/lib/mentoring-note";
import { CalendarDays, Clock, FileText, UserRound, type LucideIcon } from "lucide-react";
import { ParentGate } from "@/components/magic-link-gate/parent-gate";
import { TokenNotice, reasonToNotice } from "@/components/magic-link-gate/token-notice";
import { NotesSection } from "@/components/reports/notes-section";
import { VocabTrendMiniChart } from "@/components/reports/vocab-trend-mini-chart";
import { MonthlyExamTrendChart } from "@/components/reports/monthly-exam-trend-chart";
import { ReportHero, ReportShell } from "@/components/parent-report/report-shell";
import {
  MentorMessageSection,
  MentoringNoteSections,
  hasMentoringNote,
} from "@/components/parent-report/mentoring-note-sections";
import { Badge, EmptyState, InfoRow, Section, StatGrid } from "@/components/portal/ui";
import { Prose } from "@/components/portal/prose";

export default async function ParentReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getParentReportDetailed(token);
  if (!result.ok) {
    const n = reasonToNotice(result.reason);
    return <TokenNotice title={n.title} body={n.body} />;
  }
  const report = result.report;

  const gated = await hasGatePass("PARENT", token, report.student.id);
  if (!gated) {
    return <ParentGate model="parent-report" token={token} />;
  }

  const { student, mentoring, studyPlanNote, studyPlanImages, customNote } = report;

  const analytics = await computeStudentAnalytics(student.id);

  // 성적 추이 차트용 원본 점수 (공식/사설 모의 + 내신, 최근 50개)
  const examScores = await prisma.examScore.findMany({
    where: {
      studentId: student.id,
      examType: { in: ["OFFICIAL_MOCK", "PRIVATE_MOCK", "SCHOOL_EXAM"] },
    },
    orderBy: { examDate: "desc" },
    take: 50,
  });
  // 최근 50개를 가져온 뒤 차트 표시용으로 시간순(오름차순) 복원
  examScores.reverse();

  // 노트·상벌점: 멘토링이 속한 달 기준으로 조회 (없으면 리포트 작성일 기준)
  const noteAnchor = new Date(
    mentoring ? (mentoring.actualDate ?? mentoring.scheduledAt) : report.createdAt
  );
  const noteYear = noteAnchor.getFullYear();
  const noteMonth = noteAnchor.getMonth() + 1;
  const noteMonthStart = new Date(noteYear, noteMonth - 1, 1);
  const noteMonthEnd = new Date(noteYear, noteMonth, 0, 23, 59, 59, 999);

  const [monthlyNote, merits] = await Promise.all([
    prisma.monthlyNote.findFirst({
      where: { studentId: student.id, year: noteYear, month: noteMonth, visibleInReport: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, content: true, visibleInReport: true, authorName: true, createdAt: true },
    }),
    prisma.meritDemerit.findMany({
      where: {
        studentId: student.id,
        date: { gte: noteMonthStart, lte: noteMonthEnd },
        visibleInReport: true,
      },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        type: true,
        points: true,
        reason: true,
        category: true,
        visibleInReport: true,
      },
    }),
  ]);

  const dateStr = mentoring
    ? new Date(mentoring.actualDate ?? mentoring.scheduledAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })
    : new Date(report.createdAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });

  // 머리글 한 줄용 짧은 날짜 ("9월 24일") — dateStr 와 같은 기준 시각
  const shortDateStr = new Date(
    mentoring ? (mentoring.actualDate ?? mentoring.scheduledAt) : report.createdAt
  ).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });

  const timeStr =
    mentoring?.actualStartTime && mentoring?.actualEndTime
      ? `${mentoring.actualStartTime} ~ ${mentoring.actualEndTime}`
      : null;

  const hasMentoringContent =
    mentoring &&
    (mentoring.content || mentoring.improvements || mentoring.weaknesses || mentoring.nextGoals || mentoring.notes);

  const hasStudyPlan = studyPlanNote || (studyPlanImages && studyPlanImages.length > 0);

  // AI 고도화 리포트: customNote 가 "[오늘 멘토링 내용]…" 형식이면 항목별로 나눠 원본과 같은 모양으로 보여준다.
  const parsedNote = parseMentoringNote(customNote);
  const aiNote = parsedNote && hasMentoringNote(parsedNote.fields, parsedNote.preamble) ? parsedNote : null;

  return (
    <ReportShell label="멘토링 리포트">
      <ReportHero
        eyebrow={`${shortDateStr} ${mentoring ? "멘토링" : "리포트"}`}
        title={`${student.name} 학생`}
        meta={[student.grade, student.school]}
        badge={mentoring?.status === "COMPLETED" ? <Badge tone="ok">완료</Badge> : undefined}
      >
        {/* 세션 정보 — 히어로 좌우 여백(px-x1)을 상쇄해 아래 카드들과 가장자리를 맞춘다 */}
        <div className="-mx-1 rounded-r5 bg-bg-layer-default px-x5 py-x3">
          <InfoRow label={<RowLabel icon={CalendarDays}>{mentoring ? "날짜" : "작성일"}</RowLabel>}>
            {dateStr}
          </InfoRow>
          {timeStr && (
            <InfoRow label={<RowLabel icon={Clock}>시간</RowLabel>}>
              <span className="tabular-nums">{timeStr}</span>
            </InfoRow>
          )}
          {mentoring?.mentor && (
            <InfoRow label={<RowLabel icon={UserRound}>담당 멘토</RowLabel>}>
              {mentoring.mentor.name}
            </InfoRow>
          )}
        </div>
      </ReportHero>

      {/* 멘토링 내용 */}
      {aiNote ? (
        <MentoringNoteSections fields={aiNote.fields} preamble={aiNote.preamble} />
      ) : (
        <>
          <MentorMessageSection source={customNote} />
          {!customNote?.trim() && !hasMentoringContent && (
            <Section>
              <EmptyState
                icon={FileText}
                title="아직 작성된 멘토링 내용이 없어요"
                description={"멘토링이 끝나면 담당 멘토가 내용을 정리해\n이곳에 올려 드려요."}
                className="py-x8"
              />
            </Section>
          )}
          {hasMentoringContent && (
            <MentoringNoteSections
              fields={{
                content: mentoring!.content,
                improvements: mentoring!.improvements,
                weaknesses: mentoring!.weaknesses,
                nextGoals: mentoring!.nextGoals,
                notes: mentoring!.notes,
              }}
            />
          )}
        </>
      )}

      {/* 영단어 테스트 결과 — 멘토링 해당 월 기준 (상벌점과 동일 스코프), 없으면 자동 hide */}
      <VocabTrendMiniChart
        studentId={student.id}
        fromDate={noteMonthStart}
        toDate={noteMonthEnd}
        title="이번 달 영단어 테스트 결과"
      />

      {/* 원생 기록 + 상벌점 */}
      <NotesSection
        studentId={student.id}
        year={noteYear}
        month={noteMonth}
        monthlyNote={monthlyNote}
        merits={merits}
      />

      {/* 학습 계획 */}
      {hasStudyPlan && (
        <Section title="학습 계획">
          <Prose source={studyPlanNote} />
          {studyPlanImages && studyPlanImages.length > 0 && (
            <div className={studyPlanNote ? "mt-x5" : undefined}>
              <div className="flex flex-col gap-x3">
                {studyPlanImages.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-r3 border border-stroke-neutral-subtle transition-opacity active:opacity-80"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`학습 계획 ${i + 1}`}
                      loading="lazy"
                      className="block h-auto w-full"
                    />
                  </a>
                ))}
              </div>
              <p className="mt-x2_5 t3-regular text-fg-neutral-subtle">사진을 누르면 원본 크기로 볼 수 있어요.</p>
            </div>
          )}
        </Section>
      )}

      {/* 성적 현황 */}
      {analytics && analytics.subjects.length > 0 && (
        <Section title="성적 현황">
          <StatGrid
            items={[
              {
                label: "평균 등급 변화",
                value:
                  analytics.avgImprovement !== null
                    ? `${analytics.avgImprovement > 0 ? "+" : ""}${analytics.avgImprovement}`
                    : "-",
                tone:
                  analytics.avgImprovement === null || analytics.avgImprovement === 0
                    ? "neutral"
                    : analytics.avgImprovement > 0
                      ? "positive"
                      : "critical",
              },
              { label: "멘토링 횟수", value: `${analytics.mentoringCount}회` },
              {
                label: "총 재원 시간",
                value: analytics.studyHours > 0 ? `${analytics.studyHours}시간` : "-",
              },
            ]}
          />

          {/* 모의고사 성적 추이 차트 */}
          {examScores.length >= 2 && (
            <div className="mt-x6">
              <SubHeading>모의고사 성적 추이</SubHeading>
              <div className="mt-x3">
                <MonthlyExamTrendChart
                  scores={examScores.map((s) => ({
                    examDate: s.examDate.toISOString(),
                    examName: s.examName,
                    subject: s.subject,
                    grade: s.grade,
                    percentile: s.percentile,
                    examType: s.examType,
                  }))}
                />
              </div>
            </div>
          )}

          {/* 과목별 처음 → 최근 등급 */}
          <div className="mt-x6">
            <SubHeading hint="처음 본 시험과 가장 최근 시험의 등급을 비교했어요.">과목별 등급 변화</SubHeading>
            <ul className="mt-x1 divide-y divide-stroke-neutral-subtle">
              {analytics.subjects.map((s) => (
                <SubjectRow key={s.subject} subject={s} />
              ))}
            </ul>
          </div>
        </Section>
      )}
    </ReportShell>
  );
}

/** 세션 정보 줄의 라벨 — 작은 아이콘 + 글자 */
function RowLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-x1_5">
      <Icon className="h-4 w-4 text-fg-neutral-subtle" strokeWidth={2} aria-hidden />
      {children}
    </span>
  );
}

/** 카드 안 소제목 (+ 보조 설명) */
function SubHeading({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <p className="t4-bold text-fg-neutral-muted">{children}</p>
      {hint != null && <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">{hint}</p>}
    </div>
  );
}

/** 과목 한 줄 — 과목명 · 처음 → 최근 등급 · 시험 이름, 오른쪽에 변화 배지 */
function SubjectRow({ subject: s }: { subject: SubjectTrend }) {
  const hasExamNames = !!(s.firstExamName || s.latestExamName);
  return (
    <li className="flex items-center gap-x3 py-x3_5">
      <div className="min-w-0 flex-1">
        <p className="t5-bold text-fg-neutral">{s.subject}</p>
        <p className="mt-x0_5 t4-regular text-fg-neutral-muted tabular-nums">
          처음 {s.firstGrade ? `${s.firstGrade}등급` : "-"}
          <span className="px-x1 text-fg-placeholder">→</span>
          최근 <span className="t4-bold text-fg-neutral">{s.latestGrade ? `${s.latestGrade}등급` : "-"}</span>
        </p>
        {hasExamNames && (
          <p className="mt-x0_5 break-keep t3-regular text-fg-neutral-subtle">
            {s.firstExamName ?? "-"} → {s.latestExamName ?? "-"}
          </p>
        )}
      </div>
      <ChangeBadge improvement={s.improvement} />
    </li>
  );
}

/** 등급 변화 배지 — 양수 = 등급 상승(좋아짐) */
function ChangeBadge({ improvement }: { improvement: number | null }) {
  if (improvement === null) {
    return <span className="shrink-0 t4-regular text-fg-neutral-subtle">-</span>;
  }
  if (improvement > 0) return <Badge tone="ok">▲ {improvement}</Badge>;
  if (improvement < 0) return <Badge tone="bad">▼ {Math.abs(improvement)}</Badge>;
  return <Badge tone="gray">변동 없음</Badge>;
}
