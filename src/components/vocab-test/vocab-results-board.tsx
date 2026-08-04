"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, RefreshCw, RotateCcw, XCircle, UserPlus, Trash2, Pencil } from "lucide-react";
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

const STATUS_META: Record<VocabAttemptStatus, { label: string; cls: string }> = {
  ASSIGNED: { label: "미응시", cls: "bg-gray-100 text-gray-700" },
  IN_PROGRESS: { label: "응시 중", cls: "bg-blue-100 text-blue-700" },
  SUBMITTED: { label: "제출 완료", cls: "bg-green-100 text-green-700" },
  EXPIRED: { label: "취소/만료", cls: "bg-red-100 text-red-700" },
};
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

  if (exams.length === 0) return <p className="text-sm text-muted-foreground">아직 출제한 시험이 없습니다.</p>;

  const submittedOf = (ex: ExamSummary) => ex.attempts.filter((a) => a.status === "SUBMITTED");
  const avgOf = (ex: ExamSummary) => {
    const s = submittedOf(ex);
    return s.length ? Math.round((s.reduce((acc, a) => acc + (a.score ?? 0), 0) / s.length) * 10) / 10 : null;
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[260px_300px_1fr] gap-3 min-h-[600px] lg:h-[calc(100dvh-15rem)]">
        {/* ── 1) 시험 ── */}
        <aside className="border rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b bg-muted/40 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>시험 선택</span>
            <span className="tabular-nums">총 {exams.length}건</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto divide-y">
            {exams.map((ex) => {
              const active = ex.id === exam?.id;
              const avg = avgOf(ex);
              return (
                <button key={ex.id} onClick={() => selectExam(ex.id)}
                  className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors block ${active ? "bg-primary/5 border-primary" : "hover:bg-muted/40 border-transparent"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 font-medium text-[13px] truncate">{ex.title}</span>
                    {ex.isRetake && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-medium leading-4 text-amber-700">
                        <RotateCcw className="h-2.5 w-2.5 shrink-0" />재시험
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground truncate">
                    {ex.bookName} · {DIR_LABEL[ex.direction]} · {ex.questionCount}문항
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                    대상 {ex.attempts.length} · 제출 {submittedOf(ex).length}{avg !== null ? ` · 평균 ${avg}점` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── 2) 학생 ── */}
        <aside className="border rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground truncate">{exam ? exam.title : "학생"}</span>
            {exam && <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{submittedOf(exam).length}/{exam.attempts.length} 제출</span>}
          </div>
          {exam && (
            <div className="flex items-center gap-1 border-b px-2 py-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAssignFor(exam)}><UserPlus className="h-3.5 w-3.5 mr-1" />배정</Button>
              {canDelete && (
                <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" disabled={isPending}
                  onClick={() => {
                    if (!confirm(`"${exam.title}" 출제 이력을 삭제할까요?\n응시 기록 ${exam.attempts.length}건(점수·답안 포함)이 영구 삭제되며 되돌릴 수 없습니다.`)) return;
                    act(() => deleteVocabExam(exam.id), "출제 이력을 삭제했습니다");
                  }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
                </Button>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y">
            {!exam ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">좌측에서 시험을 선택하세요</p>
            ) : exam.attempts.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">배정된 학생이 없습니다</p>
            ) : (
              exam.attempts.map((a) => {
                const active = a.id === attemptId;
                return (
                  <button key={a.id} onClick={() => setAttemptId(a.id)}
                    className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors block ${active ? "bg-primary/5 border-primary" : "hover:bg-muted/40 border-transparent"}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[13px] truncate">{a.student.name}</span>
                      <span className="text-[10.5px] text-muted-foreground">{a.student.grade}</span>
                      <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] ${STATUS_META[a.status].cls}`}>{STATUS_META[a.status].label}</span>
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                      {a.status === "SUBMITTED" ? <span className="font-semibold tabular-nums text-foreground">{a.score}점 ({a.correctCount}/{a.totalQuestions})</span> : "—"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── 3) 내역 ── */}
        <main className="border rounded-lg flex flex-col min-h-[600px] lg:min-h-0 overflow-hidden">
          {!attempt ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">학생을 선택하면 응시 내역이 표시됩니다</div>
          ) : (
            <AttemptDetailPane
              key={attempt.id}
              attempt={attempt}
              isPending={isPending}
              onCopy={() => copyLink(attempt.token, attempt.student.name)}
              onRetake={() => { if (confirm(`${attempt.student.name} 의 오답 단어로 재시험을 만들까요?`)) act(() => createRetakeFromAttempt(attempt.id), "재시험을 만들었습니다"); }}
              onReissue={() => act(() => reissueAttemptLink(attempt.id), "링크를 재발급했습니다")}
              onCancel={() => { if (confirm(`${attempt.student.name} 의 응시를 취소할까요?`)) act(() => cancelVocabAttempt(attempt.id), "취소했습니다"); }}
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
    const reason = window.prompt(`${it.prompt}: ${it.isCorrect ? "O→X" : "X→O"} 로 수정합니다.\n사유(선택, 비워도 됨):`);
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
    <div className="flex-1 flex flex-col min-h-0">
      {/* header */}
      <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-base">{attempt.student.name}</h3>
            <span className="text-xs text-muted-foreground">{attempt.student.grade}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_META[attempt.status].cls}`}>{STATUS_META[attempt.status].label}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {attempt.status === "SUBMITTED"
              ? <>점수 <b className="text-foreground">{score}점</b> · 정답 {correctCount}/{total} · 제출 {fmt(attempt.submittedAt)}</>
              : "아직 제출되지 않았습니다"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 shrink-0">
          {attempt.status !== "EXPIRED" && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCopy}><Copy className="h-3.5 w-3.5 mr-1" />링크</Button>
          )}
          {attempt.status === "SUBMITTED" && (
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={isPending} onClick={onRetake}><RotateCcw className="h-3.5 w-3.5 mr-1" />재시험</Button>
          )}
          {attempt.status !== "SUBMITTED" && attempt.status !== "EXPIRED" && (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={isPending} onClick={onReissue}><RefreshCw className="h-3.5 w-3.5 mr-1" />재발급</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" disabled={isPending} onClick={onCancel}><XCircle className="h-3.5 w-3.5 mr-1" />취소</Button>
            </>
          )}
        </div>
      </div>

      {/* body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">불러오는 중…</p>
        ) : !items || items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {attempt.status === "SUBMITTED" ? "문항 데이터가 없습니다." : "응시 후 문항별 결과가 표시됩니다."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead className="w-24">정/오 <span className="text-[10px] font-normal text-muted-foreground">(클릭 수정)</span></TableHead>
                <TableHead>문제</TableHead>
                <TableHead>학생 답</TableHead>
                <TableHead>정답</TableHead>
                <TableHead className="w-16">시간</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id} className={it.isCorrect ? "" : "bg-red-50/50"}>
                  <TableCell className="text-xs text-muted-foreground">{it.order + 1}</TableCell>
                  <TableCell>
                    <button type="button" onClick={() => toggleItem(it)} disabled={saving === it.id}
                      title="클릭하여 정/오답 수정"
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm font-bold cursor-pointer transition-colors hover:bg-muted disabled:opacity-40 ${it.isCorrect ? "border-green-300 text-green-700" : "border-red-300 text-red-700"}`}>
                      {it.isCorrect ? "O" : "X"}
                      <Pencil className="w-3 h-3 opacity-50" />
                    </button>
                  </TableCell>
                  <TableCell className="font-medium">
                    {it.prompt}<span className="ml-1 text-[10px] text-muted-foreground">{DIR_LABEL[it.direction]}</span>
                    {it.overrides?.length > 0 && (
                      <ul className="mt-0.5 space-y-0.5 text-[10px] font-normal text-muted-foreground">
                        {it.overrides.map((o) => (
                          <li key={o.id}>
                            ✏ {o.changedByName} · {new Date(o.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {o.previousCorrect ? "O" : "X"}→{o.newCorrect ? "O" : "X"}{o.reason ? ` · ${o.reason}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell className={it.isCorrect ? "" : "text-red-700"}>{it.studentAnswer || <span className="text-muted-foreground">(미입력)</span>}</TableCell>
                  <TableCell className="text-xs">{it.direction === "EN_TO_KO" ? it.meanings.join(" / ") : it.word}</TableCell>
                  <TableCell className="text-xs tabular-nums">{it.timeMs != null ? `${(it.timeMs / 1000).toFixed(1)}s` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
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
          <DialogTitle>학생 추가 배정 — {exam.title}</DialogTitle>
          <DialogDescription>이미 배정된 학생은 목록에서 제외됩니다.</DialogDescription>
        </DialogHeader>
        <Input placeholder="학생 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[300px] overflow-auto rounded-md border divide-y">
          {list.map((s) => (
            <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
              <Checkbox checked={picked.includes(s.id)} onCheckedChange={() => setPicked((p) => p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])} />
              <span className="flex-1">{s.name} <span className="text-xs text-muted-foreground">{s.grade}</span></span>
              {s.isOnlineManaged && <Badge variant="secondary" className="text-[10px]">온라인</Badge>}
            </label>
          ))}
          {list.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">추가할 학생이 없습니다.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button disabled={isPending || picked.length === 0}
            onClick={() => startTransition(async () => {
              try { const r = await assignExamToStudents(exam.id, picked); toast.success(`${r.added}명 배정${r.skipped ? ` (${r.skipped}명 이미 배정됨)` : ""}`); onAssigned(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "배정 실패"); }
            })}>
            {picked.length}명 배정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
