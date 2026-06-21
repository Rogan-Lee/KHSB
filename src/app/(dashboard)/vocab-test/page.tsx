export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VocabTestBoard } from "@/components/vocab-test/vocab-test-board";
import { VocabOnlinePanel } from "@/components/vocab-test/vocab-online-panel";
import { offlineStudentWhere } from "@/lib/student-filters";

export default async function VocabTestPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (!isStaff(session.user.role)) redirect("/");

  const [studentsRaw, enrollments, scores, books, unitRows, exams, rosterStudents] =
    await Promise.all([
      prisma.student.findMany({
        where: offlineStudentWhere({ status: "ACTIVE" }),
        select: { id: true, name: true, grade: true, school: true, seat: true, vocabEnrollment: true },
      }),
      prisma.vocabTestEnrollment.findMany({
        where: { isActive: true },
        include: { student: { select: { id: true, name: true, grade: true, school: true, seat: true, vocabTestDate: true } } },
      }),
      prisma.vocabTestScore.findMany({
        include: { student: { select: { id: true, name: true, grade: true } } },
        orderBy: { testDate: "desc" },
        take: 200,
      }),
      prisma.vocabBook.findMany({
        orderBy: [{ isArchived: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true, name: true, description: true, isArchived: true, updatedAt: true,
          _count: { select: { entries: true } },
        },
      }),
      prisma.vocabBookEntry.groupBy({ by: ["bookId", "unit"], _count: { _all: true } }),
      prisma.vocabExam.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          book: { select: { name: true } },
          attempts: {
            orderBy: { assignedAt: "asc" },
            include: { student: { select: { id: true, name: true, grade: true } } },
          },
        },
      }),
      prisma.student.findMany({
        where: { status: "ACTIVE" },
        orderBy: [{ isOnlineManaged: "desc" }, { grade: "asc" }, { name: "asc" }],
        select: { id: true, name: true, grade: true, school: true, isOnlineManaged: true },
      }),
    ]);

  const students = [...studentsRaw].sort((a, b) => {
    const na = a.seat && /^\d+$/.test(a.seat) ? parseInt(a.seat, 10) : Number.MAX_SAFE_INTEGER;
    const nb = b.seat && /^\d+$/.test(b.seat) ? parseInt(b.seat, 10) : Number.MAX_SAFE_INTEGER;
    if (na !== nb) return na - nb;
    return a.name.localeCompare(b.name, "ko");
  });

  // 단어장별 unit 목록 (null/빈 unit 은 제외)
  const unitsByBook: Record<string, { unit: string; count: number }[]> = {};
  for (const row of unitRows) {
    if (!row.unit) continue;
    (unitsByBook[row.bookId] ??= []).push({ unit: row.unit, count: row._count._all });
  }
  for (const k of Object.keys(unitsByBook)) {
    unitsByBook[k].sort((a, b) => a.unit.localeCompare(b.unit, "ko", { numeric: true }));
  }

  // 이번 주(직전 화요일 기준) 영단어 시험 미응시자 — 등록 학생 중 vocabTestDate 가 이번 주가 아닌 학생
  const lastTuesday = (() => {
    const now = new Date();
    const day = now.getDay();
    const daysBack = day === 0 ? 5 : day === 1 ? 6 : day - 2;
    const t = new Date(now);
    t.setDate(now.getDate() - daysBack);
    t.setHours(0, 0, 0, 0);
    return t;
  })();
  const noShows = enrollments
    .filter((e) => !(e.student.vocabTestDate && new Date(e.student.vocabTestDate) >= lastTuesday))
    .map((e) => e.student)
    .sort((a, b) => {
      const na = a.seat && /^\d+$/.test(a.seat) ? parseInt(a.seat, 10) : Number.MAX_SAFE_INTEGER;
      const nb = b.seat && /^\d+$/.test(b.seat) ? parseInt(b.seat, 10) : Number.MAX_SAFE_INTEGER;
      return na !== nb ? na - nb : a.name.localeCompare(b.name, "ko");
    });

  const booksForClient = books.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    isArchived: b.isArchived,
    entryCount: b._count.entries,
    units: unitsByBook[b.id] ?? [],
  }));

  const examsForClient = exams.map((e) => ({
    id: e.id,
    title: e.title,
    bookName: e.book.name,
    direction: e.direction,
    questionCount: e.questionCount,
    perQuestionSeconds: e.perQuestionSeconds,
    createdAt: e.createdAt.toISOString(),
    isRetake: !!e.retakeOfId,
    attempts: e.attempts.map((a) => ({
      id: a.id,
      token: a.token,
      status: a.status,
      score: a.score,
      correctCount: a.correctCount,
      totalQuestions: a.totalQuestions,
      submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
      student: a.student,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">영단어 시험 관리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          오프라인 종이시험 성적 입력과 온라인 시험 출제·응시 결과를 함께 관리합니다.
        </p>
      </div>
      <Tabs defaultValue="online">
        <TabsList>
          <TabsTrigger value="online">온라인 시험</TabsTrigger>
          <TabsTrigger value="offline">오프라인 성적 입력</TabsTrigger>
          <TabsTrigger value="noshow">
            미응시 현황
            {noShows.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{noShows.length}</span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="online" className="mt-4">
          <VocabOnlinePanel
            books={booksForClient}
            exams={examsForClient}
            students={rosterStudents}
          />
        </TabsContent>
        <TabsContent value="offline" className="mt-4">
          <VocabTestBoard students={students} enrollments={enrollments} scores={scores} />
        </TabsContent>
        <TabsContent value="noshow" className="mt-4">
          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5 text-sm">
              <span className="font-medium">이번 주 영단어 시험 미응시</span>
              <span className="text-muted-foreground">{noShows.length}명 / 등록 {enrollments.length}명</span>
            </div>
            {noShows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">이번 주 미응시자가 없습니다 🎉</p>
            ) : (
              <ul className="divide-y">
                {noShows.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-10 font-mono text-xs text-muted-foreground">{s.seat ?? "—"}</span>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.grade}</span>
                    <span className="text-xs text-muted-foreground">{s.school ?? ""}</span>
                    <span className="ml-auto rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">미응시</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
