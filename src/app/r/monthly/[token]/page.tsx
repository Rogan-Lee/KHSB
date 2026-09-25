import { prisma } from "@/lib/prisma";
import { hasGatePass } from "@/lib/token-auth";
import { ParentGate } from "@/components/magic-link-gate/parent-gate";
import { TokenNotice, reasonToNotice } from "@/components/magic-link-gate/token-notice";
import { MonthlyExamTrendChart } from "@/components/reports/monthly-exam-trend-chart";
import { NotesSection } from "@/components/reports/notes-section";
import { VocabTrendMiniChart } from "@/components/reports/vocab-trend-mini-chart";
import { ReportHero, ReportShell } from "@/components/parent-report/report-shell";
import {
  AwardList,
  DirectorNote,
  MonthlySummary,
  PatrolSection,
  PhotoGrid,
  RecentExamGroups,
} from "@/components/parent-report/monthly-sections";
import { GroupLabel, Section } from "@/components/portal/ui";
import { Prose } from "@/components/portal/prose";

export default async function MonthlyParentReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const report = await prisma.monthlyReport.findUnique({
    where: { shareToken: token },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          school: true,
          grade: true,
          targetUniversity: true,
        },
      },
    },
  });

  if (!report) {
    // 월간 리포트는 만료 개념이 없어(shareToken 영구) 무효/삭제 토큰만 여기 도달.
    const n = reasonToNotice("not_found");
    return <TokenNotice title={n.title} body={n.body} />;
  }
  const { student, year, month } = report;

  const gated = await hasGatePass("PARENT", token, student.id);
  if (!gated) {
    return <ParentGate model="monthly" token={token} />;
  }

  // 월간 모의고사 성적
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  // 원생 기록(MonthlyNote) + 상벌점(MeritDemerit) — visibleInReport=true 만
  // + 순찰 특이사항(사유 텍스트) — 학부모가 무엇이 문제였는지 확인할 수 있도록
  const [monthlyNote, merits, patrolNoteRecords] = await Promise.all([
    prisma.monthlyNote.findFirst({
      where: { studentId: student.id, year, month, visibleInReport: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, content: true, visibleInReport: true, authorName: true, createdAt: true },
    }),
    prisma.meritDemerit.findMany({
      where: {
        studentId: student.id,
        date: { gte: start, lte: end },
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
    prisma.patrolRecord.findMany({
      where: {
        studentId: student.id,
        status: "NOTE",
        note: { not: null },
        round: { startedAt: { gte: start, lte: end } },
      },
      orderBy: { checkedAt: "asc" },
      select: { id: true, note: true, checkedAt: true },
    }),
  ]);

  // 순찰 특이사항 사유 목록 (빈 내용 제외, MM/DD 표기)
  const patrolNotes = patrolNoteRecords
    .filter((r) => r.note && r.note.trim())
    .map((r) => {
      const [, mm, dd] = new Date(r.checkedAt)
        .toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
        .split("-");
      return { id: r.id, date: `${Number(mm)}/${Number(dd)}`, note: r.note!.trim() };
    });

  const examScores = await prisma.examScore.findMany({
    where: {
      studentId: student.id,
      examDate: { lte: end },
      // 3-track 차트(공식 모의 / 사설 모의 / 내신) 모두 포함
      examType: { in: ["OFFICIAL_MOCK", "PRIVATE_MOCK", "SCHOOL_EXAM"] },
    },
    orderBy: { examDate: "asc" },
    take: 50,
  });

  // 최근 모의고사 그룹 (어떤 시험인지 명시: 직전 → 당월) — examDate+examName 기준 최신 2개
  const examTypeLabel: Record<string, string> = { OFFICIAL_MOCK: "공식 모의", PRIVATE_MOCK: "사설 모의", SCHOOL_EXAM: "내신" };
  const examGroupMap = new Map<string, { examName: string; examType: string; examDate: Date; isThisMonth: boolean; subjects: { subject: string; grade: number | null; percentile: number | null; rawScore: number | null }[] }>();
  for (const s of examScores) {
    const key = `${s.examDate.toISOString().slice(0, 10)}__${s.examName}`;
    let g = examGroupMap.get(key);
    if (!g) {
      g = { examName: s.examName, examType: s.examType, examDate: s.examDate, isThisMonth: s.examDate >= start && s.examDate <= end, subjects: [] };
      examGroupMap.set(key, g);
    }
    g.subjects.push({ subject: s.subject, grade: s.grade, percentile: s.percentile, rawScore: s.rawScore });
  }
  const recentExamGroups = Array.from(examGroupMap.values())
    .sort((a, b) => b.examDate.getTime() - a.examDate.getTime())
    .slice(0, 2)
    .reverse(); // 직전 → 당월 순

  // 입시 정보 (학년별 > 전체)
  const admissionInfo =
    (await prisma.monthlyAdmissionInfo.findFirst({
      where: { year, month, grade: student.grade },
    })) ??
    (await prisma.monthlyAdmissionInfo.findFirst({
      where: { year, month, grade: null },
    }));

  // 운영 공지 (Announcement page=monthly_notice)
  const operationsNotice = await prisma.announcement.findFirst({
    where: { page: "monthly_notice" },
    orderBy: { createdAt: "desc" },
  });

  // 이달의 시상 (전체)
  const awards = await prisma.monthlyAward.findMany({
    where: { year, month },
    include: { student: { select: { id: true, name: true } } },
  });

  // 이달의 권장 (Announcement page=monthly_recommendation)
  const recommendation = await prisma.announcement.findFirst({
    where: { page: "monthly_recommendation" },
    orderBy: { createdAt: "desc" },
  });

  // §2.22: 첨부 사진 조회 (attachedPhotoIds 순서 유지)
  const attachedPhotos = report.attachedPhotoIds.length > 0
    ? await prisma.photo.findMany({
        where: { id: { in: report.attachedPhotoIds } },
        select: { id: true, url: true, thumbnailUrl: true, parsedDate: true, fileName: true },
      })
    : [];
  const orderedPhotos = report.attachedPhotoIds
    .map((pid) => attachedPhotos.find((p) => p.id === pid))
    .filter((p): p is (typeof attachedPhotos)[number] => !!p);

  // 첫 화면 요약용 — 리포트에 보이는 상벌점 합계
  const meritSum = merits.filter((m) => m.type === "MERIT").reduce((sum, m) => sum + m.points, 0);
  const demeritSum = merits.filter((m) => m.type === "DEMERIT").reduce((sum, m) => sum + m.points, 0);
  const hasNotices = !!operationsNotice || awards.length > 0 || !!recommendation;

  return (
    <ReportShell
      label="월간 리포트"
      footer={
        <>
          {year}년 {month}월 기준으로 작성된 리포트예요.
          <br />
          학부모님께만 공유된 리포트이니 링크를 다른 사람에게 전달하지 말아 주세요.
        </>
      }
    >
      <ReportHero
        eyebrow={`${year}년 ${month}월 월간 리포트`}
        title={`${student.name} 학생`}
        meta={[
          student.school,
          student.grade,
          student.targetUniversity && `목표 ${student.targetUniversity}`,
        ]}
      >
        <MonthlySummary
          mentoringCount={report.mentoringCount}
          meritSum={meritSum}
          demeritSum={demeritSum}
          meritCount={merits.length}
          patrolNoteCount={report.patrolNoteCount}
        />
      </ReportHero>

      {/* ① 월간 멘토링 종합 의견 */}
      {report.mentoringSummary && (
        <Section
          title="월간 멘토링 종합 의견"
          description={report.mentoringCount > 0 ? `이번 달 멘토링 총 ${report.mentoringCount}회 진행했어요` : undefined}
        >
          <Prose source={report.mentoringSummary} />
        </Section>
      )}

      {/* ② 원장님 한마디 */}
      {report.overallComment && (
        <DirectorNote studentName={student.name} source={report.overallComment} />
      )}

      {/* ③ 모의고사 성적 — 최근 응시 시험(직전 → 당월) + 추이 차트 */}
      {examScores.length > 0 && (
        <Section title="모의고사 성적">
          {recentExamGroups.length > 0 && (
            <div className="mb-x6">
              <h3 className="mb-x3 t5-bold text-fg-neutral">최근 응시한 시험</h3>
              <RecentExamGroups groups={recentExamGroups} typeLabels={examTypeLabel} />
            </div>
          )}
          <h3 className="mb-x3 t5-bold text-fg-neutral">성적 추이</h3>
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
        </Section>
      )}

      {/* ④ 영단어 학습 추이 — 스코어 없으면 자동 hide */}
      <VocabTrendMiniChart studentId={student.id} fromDate={start} toDate={end} />

      {/* ⑤ 원생 기록 + 상벌점 */}
      <NotesSection
        studentId={student.id}
        year={year}
        month={month}
        monthlyNote={monthlyNote}
        merits={merits}
      />

      {/* ⑥ 순찰 점검 — 이상 기록(특이사항·자리비움) 요약 */}
      <PatrolSection
        noteCount={report.patrolNoteCount}
        absentCount={report.patrolAbsentCount}
        notes={patrolNotes}
      />

      {/* ⑦ 이달의 기록 사진 (§2.22 자동 첨부) */}
      {orderedPhotos.length > 0 && <PhotoGrid month={month} photos={orderedPhotos} />}

      {/* ⑧ 주요 입시 정보 */}
      {admissionInfo && (
        <Section title="주요 입시 정보">
          <Prose source={admissionInfo.content} />
        </Section>
      )}

      {/* ⑨ 독서실 공지사항 */}
      {hasNotices && (
        <div className="mt-x3 flex flex-col">
          <GroupLabel>독서실 공지사항</GroupLabel>
          <div className="flex flex-col gap-x3">
            {operationsNotice && (
              <Section title="운영 일정">
                <Prose source={operationsNotice.content} />
              </Section>
            )}
            {awards.length > 0 && <AwardList studentId={student.id} awards={awards} />}
            {recommendation && (
              <Section title="이달의 권장 과목 · 인강 · 교재">
                <Prose source={recommendation.content} />
              </Section>
            )}
          </div>
        </div>
      )}
    </ReportShell>
  );
}
