import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { MonthlyExamTrendChart } from "@/components/reports/monthly-exam-trend-chart";
import { MonthlyAttendanceDonut } from "@/components/reports/monthly-attendance-donut";
import { User, Clock, TrendingUp, TrendingDown, Award, BookOpen, Bell, GraduationCap, Trophy, Image as ImageIcon } from "lucide-react";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMinutes(minutes: number): string {
  const h = minutes / 60;
  const hRounded = round2(h);
  if (hRounded < 1) {
    return `${Math.round(minutes)}분`;
  }
  return `${hRounded}시간`;
}

function diffSign(curr: number, prev: number | null): { sign: "up" | "down" | "same"; diff: number } {
  if (prev == null) return { sign: "same", diff: 0 };
  if (curr > prev) return { sign: "up", diff: curr - prev };
  if (curr < prev) return { sign: "down", diff: prev - curr };
  return { sign: "same", diff: 0 };
}

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

  if (!report) notFound();
  const { student, year, month } = report;

  // 월간 모의고사 성적
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const examScores = await prisma.examScore.findMany({
    where: {
      studentId: student.id,
      examDate: { lte: end },
      examType: { in: ["OFFICIAL_MOCK", "PRIVATE_MOCK"] },
    },
    orderBy: { examDate: "asc" },
    take: 50,
  });

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

  const studyDiff = diffSign(report.totalStudyMinutes, report.prevMonthStudyMinutes);

  return (
    <div className="min-h-screen bg-[#f5f6fa] pb-10">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>{year}년 {month}월 학부모 리포트</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{student.name} 학생</h1>
              <p className="text-xs text-muted-foreground">
                {student.school ?? ""} {student.grade}
                {student.targetUniversity && ` · 목표: ${student.targetUniversity}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* 1. 학습 정량 분석 */}
        <section className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Clock className="h-4 w-4 text-blue-600" />
            학습 정량 분석
          </h2>

          {/* 순공 시간 + 전월 비교 */}
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-xs text-muted-foreground">월간 총 순공 시간</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{formatMinutes(report.totalStudyMinutes)}</p>
            {report.prevMonthStudyMinutes != null && (
              <div className="flex items-center gap-1 mt-2 text-xs">
                {studyDiff.sign === "up" && (
                  <span className="flex items-center gap-1 text-emerald-700">
                    <TrendingUp className="h-3 w-3" />
                    전월 대비 +{formatMinutes(studyDiff.diff)}
                  </span>
                )}
                {studyDiff.sign === "down" && (
                  <span className="flex items-center gap-1 text-red-600">
                    <TrendingDown className="h-3 w-3" />
                    전월 대비 -{formatMinutes(studyDiff.diff)}
                  </span>
                )}
                {studyDiff.sign === "same" && (
                  <span className="text-muted-foreground">전월과 동일</span>
                )}
              </div>
            )}
          </div>

          {/* 학년 평균 비교 */}
          {report.gradeAvgMinutes != null && report.gradeAvgMinutes > 0 && (
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground mb-2">{student.grade} 평균 학습 시간과 비교</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{student.name}</span>
                    <span>{formatMinutes(report.totalStudyMinutes)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{
                        width: `${Math.min(
                          100,
                          (report.totalStudyMinutes /
                            Math.max(report.totalStudyMinutes, report.gradeAvgMinutes)) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{student.grade} 평균</span>
                    <span className="text-muted-foreground">{formatMinutes(report.gradeAvgMinutes)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-400"
                      style={{
                        width: `${Math.min(
                          100,
                          (report.gradeAvgMinutes /
                            Math.max(report.totalStudyMinutes, report.gradeAvgMinutes)) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 출결 현황 */}
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground mb-3">출결 · 외출 현황</p>
            <MonthlyAttendanceDonut
              normal={report.attendanceDays}
              tardy={report.tardyCount}
              absent={report.absentDays}
              earlyLeave={report.earlyLeaveCount}
              outingCount={report.outingCount}
            />
          </div>
        </section>

        {/* 2. 성적 추이 */}
        {examScores.length > 0 && (
          <section className="bg-white rounded-xl border p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              모의고사 성적 추이
            </h2>
            <MonthlyExamTrendChart
              scores={examScores.map((s) => ({
                examDate: s.examDate.toISOString(),
                examName: s.examName,
                subject: s.subject,
                grade: s.grade,
                percentile: s.percentile,
              }))}
            />
          </section>
        )}

        {/* 3. 월간 멘토링 종합 의견 */}
        {report.mentoringSummary && (
          <section className="bg-white rounded-xl border p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
              <BookOpen className="h-4 w-4 text-emerald-600" />
              월간 멘토링 종합 의견
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                총 {report.mentoringCount}회 진행
              </span>
            </h2>
            <MarkdownViewer source={report.mentoringSummary} />
          </section>
        )}

        {/* 3.5 이달의 사진 (§2.22 자동 첨부) */}
        {orderedPhotos.length > 0 && (
          <section className="bg-white rounded-xl border p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
              <ImageIcon className="h-4 w-4 text-blue-600" />
              이달의 기록 사진
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                {orderedPhotos.length}장
              </span>
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {orderedPhotos.map((p) => (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-90 transition-opacity"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumbnailUrl ?? p.url}
                    alt={p.fileName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* 4. 익월 주요 입시 정보 */}
        {admissionInfo && (
          <section className="bg-white rounded-xl border p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold mb-3">
              <GraduationCap className="h-4 w-4 text-indigo-600" />
              주요 입시 정보
            </h2>
            <MarkdownViewer source={admissionInfo.content} />
          </section>
        )}

        {/* 5. 독서실 공지사항 */}
        {(operationsNotice || awards.length > 0 || recommendation) && (
          <section className="bg-white rounded-xl border p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Bell className="h-4 w-4 text-orange-600" />
              독서실 공지사항
            </h2>

            {operationsNotice && (
              <div>
                <h3 className="text-sm font-medium mb-2">운영 일정</h3>
                <div className="rounded-md bg-gray-50 p-3">
                  <MarkdownViewer source={operationsNotice.content} />
                </div>
              </div>
            )}

            {awards.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" />
                  이달의 시상
                </h3>
                <div className="space-y-2">
                  {awards.map((a) => {
                    const isMe = a.studentId === student.id;
                    const label =
                      a.category === "ATTITUDE"
                        ? "학습 태도 우수자"
                        : a.category === "MENTOR_PICK"
                        ? "멘토 선정 우수자"
                        : "진보상";
                    return (
                      <div
                        key={a.id}
                        className={`rounded-md border p-3 flex items-center gap-2 ${
                          isMe ? "bg-amber-50 border-amber-200" : "bg-gray-50"
                        }`}
                      >
                        <Award className={`h-4 w-4 ${isMe ? "text-amber-600" : "text-gray-400"}`} />
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-sm font-medium">
                            {a.student.name} {isMe && <span className="text-amber-600 text-xs ml-1">★ 우리 아이!</span>}
                          </p>
                          {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {recommendation && (
              <div>
                <h3 className="text-sm font-medium mb-2">이달의 권장 과목 · 인강 · 교재</h3>
                <div className="rounded-md bg-gray-50 p-3">
                  <MarkdownViewer source={recommendation.content} />
                </div>
              </div>
            )}
          </section>
        )}

        {/* 추가 코멘트 */}
        {report.overallComment && (
          <section className="bg-white rounded-xl border p-5">
            <h2 className="text-base font-semibold mb-3">원장님 한마디</h2>
            <MarkdownViewer source={report.overallComment} />
          </section>
        )}

        <p className="text-center text-xs text-muted-foreground py-4">
          이 리포트는 {year}년 {month}월 기준으로 생성되었습니다.
        </p>
      </div>
    </div>
  );
}
