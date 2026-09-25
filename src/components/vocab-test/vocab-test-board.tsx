"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, inputBaseClass } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState, FormActions, FormField, SearchField, Section, StatusBadge, TableCard, Toolbar, type Tone,
} from "@/components/backoffice/ui";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  enrollVocabTest, unenrollVocabTest, createVocabScore, deleteVocabScore,
  bulkEnrollVocabTest,
} from "@/actions/vocab-test";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { useRouter } from "next/navigation";
import { Search, X, UserPlus, UserMinus, Trash2, ChevronDown, NotebookPen, Users } from "lucide-react";
import type { VocabTestEnrollment, VocabTestScore, VocabEnrollReason } from "@/generated/prisma";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";

type StudentBasic = { id: string; name: string; grade: string; school: string | null; seat: string | null; vocabEnrollment: VocabTestEnrollment | null };
type ScoreWithStudent = VocabTestScore & { student: { id: string; name: string; grade: string } };

const REASON_LABEL: Record<string, { label: string; tone: Tone }> = {
  AUTO_GRADE3: { label: "자동(3등급↓)", tone: "bad" },
  PARENT_REQUEST: { label: "학부모 신청", tone: "info" },
  MENTOR_ASSIGNED: { label: "멘토 지정", tone: "violet" },
  CUSTOM: { label: "기타", tone: "gray" },
};

const HEAD_CLASS = "h-10 whitespace-nowrap px-x4 t3-medium text-fg-neutral-subtle";

// 공용 DatePicker 를 폼 입력 규격(높이 40)으로 맞춘다
const DATE_FIELD_CLASS =
  "h-10 w-full justify-start gap-x2 rounded-r2 border-0 bg-bg-layer-default px-x3 t4-regular text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed";

// ── 대상자 관리 탭 — 전체 학생 리스트에서 체크박스로 선택/등록 ──
function EnrollmentTab({ students, enrollments }: { students: StudentBasic[]; enrollments: (VocabTestEnrollment & { student: { id: string; name: string; grade: string; school: string | null } })[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState<VocabEnrollReason>("CUSTOM");
  const [gradeFilter, setGradeFilter] = useState<string>("ALL");
  const { confirm, dialog } = useConfirmDialog();

  const enrolledMap = new Map(enrollments.map((e) => [e.studentId, e]));

  const q = query.trim().toLowerCase();
  const filteredBase = students.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q) && !(s.grade ?? "").toLowerCase().includes(q)) return false;
    if (gradeFilter !== "ALL" && !s.grade.includes(gradeFilter)) return false;
    return true;
  });

  const { rows: filtered, sort, toggle } = useSortableTable(filteredBase, {
    name: (s: StudentBasic) => s.name,
    grade: (s: StudentBasic) => s.grade,
    school: (s: StudentBasic) => s.school ?? "",
    enrolled: (s: StudentBasic) => (enrolledMap.get(s.id)?.isActive ? 1 : 0),
  });

  const enrolledCount = filtered.filter((s) => enrolledMap.get(s.id)?.isActive).length;

  function handleToggle(studentId: string) {
    const current = enrolledMap.get(studentId);
    startTransition(async () => {
      try {
        if (current?.isActive) {
          await unenrollVocabTest(studentId);
        } else {
          await enrollVocabTest(studentId, reason);
        }
        router.refresh();
      } catch { toast.error("처리 실패"); }
    });
  }

  // 필터된 미등록 학생 일괄 등록
  async function handleBulkEnroll() {
    const toEnroll = filtered.filter((s) => !enrolledMap.get(s.id)?.isActive).map((s) => s.id);
    if (!toEnroll.length) { toast.error("등록할 학생이 없습니다"); return; }
    const ok = await confirm({
      title: `${toEnroll.length}명을 일괄 등록할까요?`,
      description: `지금 목록에 보이는 미등록 학생을 「${REASON_LABEL[reason]?.label ?? reason}」 사유로 시험 대상자에 추가해요.`,
      confirmLabel: `${toEnroll.length}명 등록`,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await bulkEnrollVocabTest(toEnroll, reason);
        toast.success(`${toEnroll.length}명 등록 완료`);
        router.refresh();
      } catch { toast.error("일괄 등록 실패"); }
    });
  }

  // 필터된 등록 학생 일괄 해제
  async function handleBulkUnenroll() {
    const toUnenroll = filtered.filter((s) => enrolledMap.get(s.id)?.isActive).map((s) => s.id);
    if (!toUnenroll.length) return;
    const ok = await confirm({
      title: `${toUnenroll.length}명을 일괄 해제할까요?`,
      description: "지금 목록에 보이는 등록 학생을 시험 대상자에서 빼요.",
      confirmLabel: `${toUnenroll.length}명 해제`,
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        for (const id of toUnenroll) await unenrollVocabTest(id);
        toast.success(`${toUnenroll.length}명 해제 완료`);
        router.refresh();
      } catch { toast.error("일괄 해제 실패"); }
    });
  }

  const grades = [...new Set(students.map((s) => s.grade))].sort();

  return (
    <div>
      {/* 필터 + 액션 바 */}
      <Toolbar>
        <SearchField
          placeholder="이름·학년 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="학생 검색"
          className="sm:w-56"
        />
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="h-10 w-32" aria-label="학년 필터"><SelectValue placeholder="학년" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 학년</SelectItem>
            {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-x2">
          <span className="t3-medium text-fg-neutral-subtle">등록 사유</span>
          <Select value={reason} onValueChange={(v) => setReason(v as VocabEnrollReason)}>
            <SelectTrigger className="h-10 w-36" aria-label="새로 등록할 때 사유"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AUTO_GRADE3">자동(3등급↓)</SelectItem>
              <SelectItem value="PARENT_REQUEST">학부모 신청</SelectItem>
              <SelectItem value="MENTOR_ASSIGNED">멘토 지정</SelectItem>
              <SelectItem value="CUSTOM">기타</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex w-full flex-wrap items-center gap-x2 lg:ml-auto lg:w-auto">
          <span className="t3-regular tabular-nums text-fg-neutral-subtle">
            {filtered.length}명 중 <span className="t3-bold text-fg-brand">{enrolledCount}명</span> 등록
          </span>
          <Button variant="secondary" size="sm" onClick={handleBulkEnroll} disabled={isPending}>
            <UserPlus />보이는 학생 일괄 등록
          </Button>
          {enrolledCount > 0 && (
            <Button variant="ghost" size="sm" className="text-fg-critical" onClick={handleBulkUnenroll} disabled={isPending}>
              <UserMinus />일괄 해제
            </Button>
          )}
        </div>
      </Toolbar>

      {/* 전체 학생 리스트 */}
      <TableCard>
        <div className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader sortKey="enrolled" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="center" className={`${HEAD_CLASS} w-20`}>대상</SortableHeader>
                <SortableHeader sortKey="name" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={HEAD_CLASS}>이름</SortableHeader>
                <SortableHeader sortKey="grade" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={HEAD_CLASS}>학년</SortableHeader>
                <SortableHeader sortKey="school" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} className={HEAD_CLASS}>학교</SortableHeader>
                <TableHead>등록 사유</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState compact icon={Users} title="조건에 맞는 학생이 없어요" description="검색어나 학년 필터를 바꿔 보세요." />
                  </TableCell>
                </TableRow>
              ) : filtered.map((s) => {
                const enrollment = enrolledMap.get(s.id);
                const isEnrolled = enrollment?.isActive ?? false;
                return (
                  <TableRow key={s.id} data-state={isEnrolled ? "selected" : undefined}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={isEnrolled}
                        onCheckedChange={() => handleToggle(s.id)}
                        disabled={isPending}
                        aria-label={`${s.name} 시험 대상 ${isEnrolled ? "해제" : "등록"}`}
                      />
                    </TableCell>
                    <TableCell className="t4-medium">{s.name}</TableCell>
                    <TableCell className="text-fg-neutral-muted">{s.grade}</TableCell>
                    <TableCell className="text-fg-neutral-muted">{s.school || "—"}</TableCell>
                    <TableCell>
                      {isEnrolled && enrollment && (
                        <StatusBadge tone={REASON_LABEL[enrollment.reason]?.tone ?? "gray"}>
                          {REASON_LABEL[enrollment.reason]?.label ?? enrollment.reason}
                        </StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </TableCard>
      {dialog}
    </div>
  );
}

// ── 성적 입력/이력 탭 ──
function ScoresTab({ enrollments, scores }: {
  enrollments: { studentId: string; student: { id: string; name: string; grade: string } }[];
  scores: ScoreWithStudent[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [studentFilter, setStudentFilter] = useState<string>("ALL");
  const [studentQuery, setStudentQuery] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const studentNames = [...new Map(scores.map((s) => [s.student.id, s.student])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const sq = studentQuery.trim().toLowerCase();
  const comboOptions = sq
    ? studentNames.filter((s) => s.name.toLowerCase().includes(sq) || s.grade.toLowerCase().includes(sq))
    : studentNames;

  const selectedStudent = studentNames.find((s) => s.id === studentFilter);

  // 기본 정렬: 날짜 내림차순
  const filteredScoresDefaultSorted = (studentFilter === "ALL"
    ? scores
    : scores.filter((s) => s.student.id === studentFilter)
  ).slice().sort((a, b) => new Date(b.testDate).getTime() - new Date(a.testDate).getTime());

  const { rows: filteredScores, sort: scoreSort, toggle: scoreToggle } = useSortableTable(filteredScoresDefaultSorted, {
    testDate: (s: ScoreWithStudent) => new Date(s.testDate).getTime(),
    name: (s: ScoreWithStudent) => s.student.name,
    totalWords: (s: ScoreWithStudent) => s.totalWords,
    correctWords: (s: ScoreWithStudent) => s.correctWords,
    score: (s: ScoreWithStudent) => s.score,
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createVocabScore(fd);
        toast.success("성적 입력 완료");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } catch { toast.error("입력 실패"); }
    });
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "이 성적을 삭제할까요?", description: "삭제하면 되돌릴 수 없어요.", confirmLabel: "삭제", destructive: true });
    if (!ok) return;
    startTransition(async () => {
      try { await deleteVocabScore(id); toast.success("삭제됨"); router.refresh(); } catch { toast.error("삭제 실패"); }
    });
  }

  const scoreTone = (score: number): Tone => (score >= 80 ? "ok" : score >= 60 ? "gray" : "bad");

  return (
    <div className="flex flex-col gap-x6">
      {/* 입력 폼 */}
      <Section title="성적 입력" description="종이시험 채점 결과를 입력하면 점수(%)가 자동 계산돼요.">
        <form onSubmit={handleSubmit} className="flex flex-col gap-x4">
          <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2 lg:grid-cols-5">
            <FormField label="학생" htmlFor="vocab-score-student" required>
              <select
                id="vocab-score-student"
                name="studentId"
                required
                className={cn("h-10 border-0 pr-x2", inputBaseClass)}
              >
                <option value="">선택</option>
                {enrollments.map((e) => (
                  <option key={e.studentId} value={e.studentId}>{e.student.name} ({e.student.grade})</option>
                ))}
              </select>
            </FormField>
            <FormField label="시험 날짜" required>
              <DatePicker name="testDate" required defaultValue={new Date().toISOString().split("T")[0]} placeholder="날짜 선택" className={DATE_FIELD_CLASS} />
            </FormField>
            <FormField label="총 단어 수" htmlFor="vocab-score-total" required>
              <Input id="vocab-score-total" name="totalWords" type="number" min={1} required placeholder="50" className="tabular-nums" />
            </FormField>
            <FormField label="정답 수" htmlFor="vocab-score-correct" required>
              <Input id="vocab-score-correct" name="correctWords" type="number" min={0} required placeholder="45" className="tabular-nums" />
            </FormField>
            <FormField label="메모" htmlFor="vocab-score-notes">
              <Input id="vocab-score-notes" name="notes" placeholder="선택 사항" />
            </FormField>
          </div>
          <FormActions>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">{isPending ? "저장 중…" : "성적 입력"}</Button>
          </FormActions>
        </form>
      </Section>

      {/* 이력 */}
      <Section variant="plain" title="성적 이력" count={filteredScores.length}>
        <Toolbar>
          <div className="relative w-full sm:w-72">
            <label className="flex h-10 w-full items-center gap-x2 rounded-r2 bg-bg-neutral-weak px-x3 transition-shadow focus-within:bg-bg-layer-default focus-within:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]">
              <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
              <input
                type="text"
                value={comboOpen ? studentQuery : selectedStudent ? `${selectedStudent.name} (${selectedStudent.grade})` : ""}
                placeholder="학생으로 거르기"
                aria-label="학생으로 거르기"
                onChange={(e) => { setStudentQuery(e.target.value); setComboOpen(true); }}
                onFocus={() => { setStudentQuery(""); setComboOpen(true); }}
                onBlur={() => setTimeout(() => setComboOpen(false), 150)}
                className="h-full min-w-0 flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder"
              />
              {studentFilter !== "ALL" ? (
                <button
                  type="button"
                  onClick={() => { setStudentFilter("ALL"); setStudentQuery(""); }}
                  aria-label="학생 필터 해제"
                  className="grid size-6 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <ChevronDown className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
              )}
            </label>
            {comboOpen && (
              <div className="absolute left-0 top-full z-20 mt-x1 max-h-60 w-full overflow-y-auto rounded-r3 bg-bg-layer-floating p-x1_5 shadow-[var(--seed-shadow-s3)]">
                <button
                  type="button"
                  onMouseDown={() => { setStudentFilter("ALL"); setStudentQuery(""); setComboOpen(false); }}
                  className={cn(
                    "w-full rounded-r2 px-x3 py-x2 text-left t4-regular transition-colors hover:bg-bg-layer-floating-pressed",
                    studentFilter === "ALL" ? "t4-bold text-fg-neutral" : "text-fg-neutral",
                  )}
                >
                  전체 학생
                </button>
                {comboOptions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={() => { setStudentFilter(s.id); setStudentQuery(""); setComboOpen(false); }}
                    className={cn(
                      "w-full rounded-r2 px-x3 py-x2 text-left t4-regular text-fg-neutral transition-colors hover:bg-bg-layer-floating-pressed",
                      studentFilter === s.id && "t4-bold",
                    )}
                  >
                    {s.name} <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
                  </button>
                ))}
                {comboOptions.length === 0 && (
                  <div className="px-x3 py-x2 t4-regular text-fg-neutral-subtle">검색 결과가 없어요</div>
                )}
              </div>
            )}
          </div>
        </Toolbar>

        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader sortKey="testDate" activeKey={scoreSort?.key} dir={scoreSort?.dir} onToggle={scoreToggle} className={HEAD_CLASS}>날짜</SortableHeader>
                <SortableHeader sortKey="name" activeKey={scoreSort?.key} dir={scoreSort?.dir} onToggle={scoreToggle} className={HEAD_CLASS}>이름</SortableHeader>
                <SortableHeader sortKey="totalWords" activeKey={scoreSort?.key} dir={scoreSort?.dir} onToggle={scoreToggle} align="right" className={HEAD_CLASS}>총 단어</SortableHeader>
                <SortableHeader sortKey="correctWords" activeKey={scoreSort?.key} dir={scoreSort?.dir} onToggle={scoreToggle} align="right" className={HEAD_CLASS}>정답</SortableHeader>
                <SortableHeader sortKey="score" activeKey={scoreSort?.key} dir={scoreSort?.dir} onToggle={scoreToggle} align="right" className={HEAD_CLASS}>점수</SortableHeader>
                <TableHead>메모</TableHead>
                <TableHead className="w-14"><span className="sr-only">삭제</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredScores.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      compact
                      icon={NotebookPen}
                      title={studentFilter === "ALL" ? "아직 성적 이력이 없어요" : "이 학생의 성적 이력이 없어요"}
                      description={studentFilter === "ALL" ? "위의 성적 입력에서 첫 성적을 넣어 보세요." : undefined}
                    />
                  </TableCell>
                </TableRow>
              ) : filteredScores.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted">{formatDate(s.testDate)}</TableCell>
                  <TableCell className="t4-medium">{s.student.name}</TableCell>
                  <TableCell className="text-right">{s.totalWords}</TableCell>
                  <TableCell className="text-right">{s.correctWords}</TableCell>
                  <TableCell className="text-right">
                    <StatusBadge tone={scoreTone(s.score)}>{s.score}%</StatusBadge>
                  </TableCell>
                  <TableCell className="text-fg-neutral-muted">{s.notes || "—"}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      aria-label={`${s.student.name} 성적 삭제`}
                      className="grid size-8 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-critical-weak hover:text-fg-critical"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      </Section>
      {dialog}
    </div>
  );
}

// ── 메인 보드 ──
export function VocabTestBoard({ students, enrollments, scores }: {
  students: StudentBasic[];
  enrollments: (VocabTestEnrollment & { student: { id: string; name: string; grade: string; school: string | null } })[];
  scores: ScoreWithStudent[];
}) {
  return (
    <Tabs defaultValue="enrollment">
      <TabsList variant="segment">
        <TabsTrigger value="enrollment">
          대상자 관리
          <span className="tabular-nums text-fg-neutral-subtle">{enrollments.length}</span>
        </TabsTrigger>
        <TabsTrigger value="scores">성적 관리</TabsTrigger>
      </TabsList>
      <TabsContent value="enrollment">
        <EnrollmentTab students={students} enrollments={enrollments} />
      </TabsContent>
      <TabsContent value="scores">
        <ScoresTab enrollments={enrollments} scores={scores} />
      </TabsContent>
    </Tabs>
  );
}
