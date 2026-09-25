export const revalidate = 30;

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import { PartyPopper } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, Section, StatusBadge } from "@/components/backoffice/ui";
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
    <>
      <PageHeader
        title="영단어 시험"
        description="온라인 시험 출제·응시 결과와 오프라인 종이시험 성적을 함께 관리해요."
      />
      <Tabs defaultValue="online">
        <TabsList>
          <TabsTrigger value="online">온라인 시험</TabsTrigger>
          <TabsTrigger value="offline">오프라인 성적</TabsTrigger>
          <TabsTrigger value="noshow">
            미응시 현황
            {noShows.length > 0 && (
              <span className="t4-bold tabular-nums text-fg-warning">{noShows.length}</span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="online" className="mt-x6">
          <VocabOnlinePanel
            books={booksForClient}
            exams={examsForClient}
            students={rosterStudents}
            canDeleteExam
          />
        </TabsContent>
        <TabsContent value="offline" className="mt-x6">
          <VocabTestBoard students={students} enrollments={enrollments} scores={scores} />
        </TabsContent>
        <TabsContent value="noshow" className="mt-x6">
          <Section
            title="이번 주 영단어 시험 미응시"
            description={`직전 화요일 이후 응시 기록이 없는 대상자예요 · 등록 ${enrollments.length}명 중 ${noShows.length}명`}
            count={noShows.length}
            flush
            className="overflow-hidden"
          >
            {noShows.length === 0 ? (
              <div className="border-t border-stroke-neutral-muted">
                <EmptyState
                  compact
                  icon={PartyPopper}
                  title="이번 주 미응시자가 없어요"
                  description="등록된 대상자가 모두 시험을 봤어요."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">좌석</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>학년</TableHead>
                    <TableHead>학교</TableHead>
                    <TableHead className="w-24 text-right">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {noShows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="tabular-nums text-fg-neutral-subtle">{s.seat ?? "—"}</TableCell>
                      <TableCell className="t4-medium">{s.name}</TableCell>
                      <TableCell className="text-fg-neutral-muted">{s.grade}</TableCell>
                      <TableCell className="text-fg-neutral-muted">{s.school ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <StatusBadge tone="warn">미응시</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </>
  );
}
