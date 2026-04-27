import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { MonthlyExamTrendChart } from "@/components/reports/monthly-exam-trend-chart";
import { User, TrendingUp, Award, BookOpen, Bell, GraduationCap, Trophy, Image as ImageIcon } from "lucide-react";

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
        {/* 1. 성적 추이 (학습 정량 분석은 멘토링 페이지로 이전) */}
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
