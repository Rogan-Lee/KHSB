"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, SearchField, Skeleton, StatusBadge, type Tone } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ClipboardList, Copy, FileQuestion, MousePointerClick, Pencil, RefreshCw, RotateCcw, Trash2, UserPlus, Users, XCircle } from "lucide-react";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";
import {
  getVocabAttemptDetail, createRetakeFromAttempt, cancelVocabAttempt, reissueAttemptLink, assignExamToStudents,
  deleteVocabExam, overrideVocabItemCorrectness,
} from "@/actions/vocab-online";
import type { RosterStudent } from "./vocab-exam-creator";
import type { VocabAttemptStatus, VocabExamDirection } from "@/generated/prisma";

type AttemptRow = {
  id: string;
  token: string;
  status: VocabAttemptStatus;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  submittedAt: string | null;
  student: { id: string; name: string; grade: string };
};

export type ExamSummary = {
  id: string;
  title: string;
  bookName: string;
  direction: VocabExamDirection;
  questionCount: number;
  perQuestionSeconds: number;
  createdAt: string;
  isRetake: boolean;
  attempts: AttemptRow[];
};

const STATUS_META: Record<VocabAttemptStatus, { label: string; tone: Tone }> = {
  ASSIGNED: { label: "미응시", tone: "gray" },
  IN_PROGRESS: { label: "응시 중", tone: "info" },
  SUBMITTED: { label: "제출 완료", tone: "ok" },
  EXPIRED: { label: "취소/만료", tone: "bad" },
};

const PANE = "flex flex-col overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default";
const PANE_HEAD = "flex items-center justify-between gap-x2 border-b border-stroke-neutral-muted px-x4 py-x3 t3-medium text-fg-neutral-subtle";
const PANE_ITEM =
  "block w-full px-x4 py-x3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus-ring";
const DIR_LABEL: Record<VocabExamDirection, string> = { EN_TO_KO: "영→한", KO_TO_EN: "한→영", MIXED: "혼합" };

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

const firstAttemptId = (ex?: ExamSummary): string | null =>
  ex ? (ex.attempts.find((a) => a.status === "SUBMITTED") ?? ex.attempts[0])?.id ?? null : null;

export function VocabResultsBoard({ exams, students, canDelete = false }: { exams: ExamSummary[]; students: RosterStudent[]; canDelete?: boolean }) {
  const [examId, setExamId] = useState<string | null>(exams[0]?.id ?? null);
  const [attemptId, setAttemptId] = useState<string | null>(() => firstAttemptId(exams[0]));
  const [assignFor, setAssignFor] = useState<ExamSummary | null>(null);
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // 선택 시험이 갱신(revalidate)으로 사라지면 첫 항목으로 폴백 (렌더 파생, effect 불필요)
  const exam = exams.find((e) => e.id === examId) ?? exams[0] ?? null;
  const attempt = exam?.attempts.find((a) => a.id === attemptId) ?? null;

  const selectExam = (id: string) => {
    setExamId(id);
    setAttemptId(firstAttemptId(exams.find((e) => e.id === id)));
  };

  const copyLink = (token: string, name: string) => {
    navigator.clipboard.writeText(`${origin}/v/${token}`).then(() => toast.success(`${name} 응시 링크 복사됨`)).catch(() => toast.error("복사 실패"));
  };

  const act = (fn: () => Promise<unknown>, ok: string) =>
    startTransition(async () => {
      try { await fn(); toast.success(ok); }
      catch (e) { toast.error(e instanceof Error ? e.message : "실패"); }
    });

  if (exams.length === 0) {
    return (
      <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
        <EmptyState
          icon={ClipboardList}
          title="아직 출제한 시험이 없어요"
          description="「시험 출제」 탭에서 시험을 내면 여기서 응시 결과를 볼 수 있어요."
        />
      </div>
    );
  }

  const submittedOf = (ex: ExamSummary) => ex.attempts.filter((a) => a.status === "SUBMITTED");
  const avgOf = (ex: ExamSummary) => {
    const s = submittedOf(ex);
    return s.length ? Math.round((s.reduce((acc, a) => acc + (a.score ?? 0), 0) / s.length) * 10) / 10 : null;
  };

  return (
    <>
      <div className="grid min-h-[600px] grid-cols-1 gap-x3 lg:h-[calc(100dvh-15rem)] lg:grid-cols-[260px_300px_minmax(0,1fr)]">
        {/* ── 1) 시험 ── */}
        <aside className={PANE} aria-label="시험 목록">
          <div className={PANE_HEAD}>
            <span>시험</span>
            <span className="tabular-nums">총 {exams.length}건</span>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-stroke-neutral-muted overflow-y-auto">
            {exams.map((ex) => {
              const active = ex.id === exam?.id;
              const avg = avgOf(ex);
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => selectExam(ex.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(PANE_ITEM, active ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed")}
                >
                  <div className="flex items-center gap-x1_5">
                    <span className={cn("min-w-0 truncate t4-medium text-fg-neutral", active && "t4-bold")}>{ex.title}</span>
                    {ex.isRetake && (
                      <StatusBadge tone="warn" className="shrink-0">
                        <RotateCcw />재시험
                      </StatusBadge>
                    )}
                  </div>
                  <div className="mt-x0_5 truncate t3-regular text-fg-neutral-subtle">
                    {ex.bookName} · {DIR_LABEL[ex.direction]} · {ex.questionCount}문항
                  </div>
                  <div className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
                    대상 {ex.attempts.length} · 제출 {submittedOf(ex).length}
                    {avg !== null && <> · 평균 <span className="t3-medium text-fg-neutral">{avg}점</span></>}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── 2) 학생 ── */}
        <aside className={PANE} aria-label="응시 학생">
          <div className={PANE_HEAD}>
            <span className="truncate">{exam ? exam.title : "학생"}</span>
            {exam && <span className="shrink-0 tabular-nums">{submittedOf(exam).length}/{exam.attempts.length} 제출</span>}
          </div>
          {exam && (
            <div className="flex items-center gap-x1_5 border-b border-stroke-neutral-muted px-x3 py-x2">
              <Button variant="secondary" size="xs" onClick={() => setAssignFor(exam)}>
                <UserPlus />학생 배정
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-auto text-fg-critical"
                  disabled={isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "출제 이력을 삭제할까요?",
                      description: `"${exam.title}"\n응시 기록 ${exam.attempts.length}건(점수·답안 포함)이 영구 삭제되며 되돌릴 수 없어요.`,
                      confirmLabel: "삭제",
                      destructive: true,
                    });
                    if (!ok) return;
                    act(() => deleteVocabExam(exam.id), "출제 이력을 삭제했습니다");
                  }}
                >
                  <Trash2 />삭제
                </Button>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 divide-y divide-stroke-neutral-muted overflow-y-auto">
            {!exam ? (
              <EmptyState compact icon={MousePointerClick} title="왼쪽에서 시험을 골라 주세요" />
            ) : exam.attempts.length === 0 ? (
              <EmptyState compact icon={Users} title="배정된 학생이 없어요" description="학생 배정으로 응시자를 추가해 보세요." />
            ) : (
              exam.attempts.map((a) => {
                const active = a.id === attemptId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAttemptId(a.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(PANE_ITEM, active ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed")}
                  >
                    <div className="flex items-center gap-x1_5">
                      <span className={cn("truncate t4-medium text-fg-neutral", active && "t4-bold")}>{a.student.name}</span>
                      <span className="t3-regular text-fg-neutral-subtle">{a.student.grade}</span>
                      <StatusBadge tone={STATUS_META[a.status].tone} className="ml-auto shrink-0">
                        {STATUS_META[a.status].label}
                      </StatusBadge>
                    </div>
                    <div className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
                      {a.status === "SUBMITTED" ? (
                        <>
                          <span className="t3-bold text-fg-neutral">{a.score}점</span> ({a.correctCount}/{a.totalQuestions})
                        </>
                      ) : "—"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── 3) 내역 ── */}
        <main className={cn(PANE, "min-h-[600px] lg:min-h-0")}>
          {!attempt ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState compact icon={MousePointerClick} title="학생을 고르면 응시 내역이 보여요" />
            </div>
          ) : (
            <AttemptDetailPane
              key={attempt.id}
              attempt={attempt}
              isPending={isPending}
              onCopy={() => copyLink(attempt.token, attempt.student.name)}
              onRetake={async () => {
                const ok = await confirm({
                  title: "재시험을 만들까요?",
                  description: `${attempt.student.name} 학생의 오답 단어로 새 시험을 만들어요.`,
                  confirmLabel: "재시험 만들기",
                });
                if (ok) act(() => createRetakeFromAttempt(attempt.id), "재시험을 만들었습니다");
              }}
              onReissue={() => act(() => reissueAttemptLink(attempt.id), "링크를 재발급했습니다")}
              onCancel={async () => {
                const ok = await confirm({
                  title: "응시를 취소할까요?",
                  description: `${attempt.student.name} 학생의 응시 링크가 더 이상 열리지 않아요.`,
                  confirmLabel: "응시 취소",
                  cancelLabel: "닫기",
                  destructive: true,
                });
                if (ok) act(() => cancelVocabAttempt(attempt.id), "취소했습니다");
              }}
            />
          )}
        </main>
      </div>

      {assignFor && (
        <AssignDialog
          exam={assignFor}
          students={students}
          onClose={() => setAssignFor(null)}
          onAssigned={() => setAssignFor(null)}
        />
      )}
      {dialog}
    </>
  );
}

type ItemOverride = {
  id: string; previousCorrect: boolean | null; newCorrect: boolean;
  reason: string | null; changedByName: string; createdAt: string | Date;
};
type DetailItem = {
  id: string; order: number; direction: VocabExamDirection; prompt: string;
  word: string; meanings: string[]; expectedAnswers: string[];
  studentAnswer: string | null; isCorrect: boolean | null; timeMs: number | null;
  overrides: ItemOverride[];
};

function AttemptDetailPane({ attempt, isPending, onCopy, onRetake, onReissue, onCancel }: {
  attempt: AttemptRow;
  isPending: boolean;
  onCopy: () => void;
  onRetake: () => void;
  onReissue: () => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<DetailItem[] | null>(null);
  const [score, setScore] = useState<number | null>(attempt.score);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { prompt, dialog } = useConfirmDialog();

  const load = async () => {
    const d = await getVocabAttemptDetail(attempt.id);
    if (d) { setItems(d.items as unknown as DetailItem[]); setScore(d.score); }
  };
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getVocabAttemptDetail(attempt.id)
      .then((d) => { if (!cancelled && d) { setItems(d.items as unknown as DetailItem[]); setScore(d.score); } })
      .catch((e) => !cancelled && toast.error(e instanceof Error ? e.message : "로드 실패"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [attempt.id]);

  const toggleItem = async (it: DetailItem) => {
    const next = !it.isCorrect;
    const reason = await prompt({
      title: `${it.isCorrect ? "오답(X)" : "정답(O)"}으로 바꿀까요?`,
      description: `${it.prompt} · ${it.isCorrect ? "O → X" : "X → O"} 로 수정하고 점수를 다시 계산해요.`,
      label: "수정 사유 (선택)",
      placeholder: "비워 둬도 돼요",
      confirmLabel: "수정",
    });
    if (reason === null) return; // 취소
    setSaving(it.id);
    try {
      await overrideVocabItemCorrectness(it.id, next, reason);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(null);
    }
  };

  const correctCount = items?.filter((i) => i.isCorrect).length ?? attempt.correctCount;
  const total = items?.length ?? attempt.totalQuestions;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* header */}
      <div className="flex flex-wrap items-center gap-x3 border-b border-stroke-neutral-muted px-x5 py-x4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x2">
            <h3 className="t6-bold text-fg-neutral">{attempt.student.name}</h3>
            <span className="t3-regular text-fg-neutral-subtle">{attempt.student.grade}</span>
            <StatusBadge tone={STATUS_META[attempt.status].tone}>{STATUS_META[attempt.status].label}</StatusBadge>
          </div>
          <p className="mt-x1 t3-regular tabular-nums text-fg-neutral-subtle">
            {attempt.status === "SUBMITTED"
              ? <>점수 <span className="t3-bold text-fg-neutral">{score}점</span> · 정답 {correctCount}/{total} · 제출 {fmt(attempt.submittedAt)}</>
              : "아직 제출하지 않았어요"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-x1_5">
          {attempt.status !== "EXPIRED" && (
            <Button variant="secondary" size="xs" onClick={onCopy}><Copy />링크 복사</Button>
          )}
          {attempt.status === "SUBMITTED" && (
            <Button variant="secondary" size="xs" disabled={isPending} onClick={onRetake}><RotateCcw />재시험</Button>
          )}
          {attempt.status !== "SUBMITTED" && attempt.status !== "EXPIRED" && (
            <>
              <Button variant="secondary" size="xs" disabled={isPending} onClick={onReissue}><RefreshCw />재발급</Button>
              <Button variant="ghost" size="xs" className="text-fg-critical" disabled={isPending} onClick={onCancel}><XCircle />응시 취소</Button>
            </>
          )}
        </div>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col gap-x3 p-x5" aria-label="불러오는 중">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <EmptyState
            compact
            icon={FileQuestion}
            title={attempt.status === "SUBMITTED" ? "문항 데이터가 없어요" : "응시 후 문항별 결과가 보여요"}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-right">#</TableHead>
                <TableHead className="w-28">
                  정/오 <span className="t2-regular text-fg-placeholder">눌러서 수정</span>
                </TableHead>
                <TableHead>문제</TableHead>
                <TableHead>학생 답</TableHead>
                <TableHead>정답</TableHead>
                <TableHead className="w-20 text-right">시간</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id} className={it.isCorrect ? undefined : "bg-bg-critical-weak hover:bg-bg-critical-weak-pressed"}>
                  <TableCell className="text-right t3-regular text-fg-neutral-subtle">{it.order + 1}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => toggleItem(it)}
                      disabled={saving === it.id}
                      title="클릭하여 정/오답 수정"
                      aria-label={`${it.prompt} ${it.isCorrect ? "정답" : "오답"} — 눌러서 수정`}
                      className={cn(
                        "inline-flex h-8 items-center gap-x1 rounded-r2 bg-bg-layer-default px-x2_5 t4-bold transition-colors hover:bg-bg-layer-default-pressed disabled:text-fg-disabled",
                        it.isCorrect
                          ? "text-fg-positive shadow-[inset_0_0_0_1px_var(--seed-color-stroke-positive-weak)]"
                          : "text-fg-critical shadow-[inset_0_0_0_1px_var(--seed-color-stroke-critical-weak)]",
                      )}
                    >
                      {it.isCorrect ? "O" : "X"}
                      <Pencil className="size-3 text-fg-neutral-subtle" aria-hidden />
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="t4-medium">{it.prompt}</span>
                    <span className="ml-x1 t2-regular text-fg-neutral-subtle">{DIR_LABEL[it.direction]}</span>
                    {it.overrides?.length > 0 && (
                      <ul className="mt-x1 flex flex-col gap-x0_5 t2-regular text-fg-neutral-subtle">
                        {it.overrides.map((o) => (
                          <li key={o.id} className="flex items-center gap-x1">
                            <Pencil className="size-3 shrink-0" aria-hidden />
                            {o.changedByName} · {new Date(o.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {o.previousCorrect ? "O" : "X"}→{o.newCorrect ? "O" : "X"}{o.reason ? ` · ${o.reason}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell className={cn("whitespace-nowrap", !it.isCorrect && "text-fg-critical")}>
                    {it.studentAnswer || <span className="text-fg-placeholder">(미입력)</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap t3-regular">{it.direction === "EN_TO_KO" ? it.meanings.join(" / ") : it.word}</TableCell>
                  <TableCell className="text-right t3-regular tabular-nums text-fg-neutral-muted">{it.timeMs != null ? `${(it.timeMs / 1000).toFixed(1)}s` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {dialog}
    </div>
  );
}

function AssignDialog({ exam, students, onClose, onAssigned }: { exam: ExamSummary; students: RosterStudent[]; onClose: () => void; onAssigned: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const already = new Set(exam.attempts.map((a) => a.student.id));
  const list = students.filter((s) => !already.has(s.id) && (!q.trim() || s.name.includes(q.trim())));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>학생 추가 배정</DialogTitle>
          <DialogDescription>{exam.title} · 이미 배정된 학생은 목록에서 빠져 있어요.</DialogDescription>
        </DialogHeader>
        <SearchField placeholder="학생 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-full" aria-label="학생 이름 검색" />
        <div className="max-h-[300px] divide-y divide-stroke-neutral-muted overflow-auto rounded-r3 border border-stroke-neutral-muted">
          {list.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-x3 px-x4 py-x2_5 transition-colors hover:bg-bg-layer-default-pressed">
              <Checkbox checked={picked.includes(s.id)} onCheckedChange={() => setPicked((p) => p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])} />
              <span className="flex-1">
                <span className="t4-medium text-fg-neutral">{s.name}</span>
                <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">{s.grade}</span>
              </span>
              {s.isOnlineManaged && <StatusBadge tone="info">온라인</StatusBadge>}
            </label>
          ))}
          {list.length === 0 && <p className="px-x4 py-x6 text-center t4-regular text-fg-neutral-subtle">추가할 학생이 없어요</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button disabled={isPending || picked.length === 0}
            onClick={() => startTransition(async () => {
              try { const r = await assignExamToStudents(exam.id, picked); toast.success(`${r.added}명 배정${r.skipped ? ` (${r.skipped}명 이미 배정됨)` : ""}`); onAssigned(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "배정 실패"); }
            })}>
            {isPending ? "배정 중…" : `${picked.length}명 배정`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
