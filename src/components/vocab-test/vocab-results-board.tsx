"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, RefreshCw, RotateCcw, XCircle, Eye, UserPlus } from "lucide-react";
import {
  getVocabAttemptDetail, createRetakeFromAttempt, cancelVocabAttempt, reissueAttemptLink, assignExamToStudents,
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

export function VocabResultsBoard({ exams, students }: { exams: ExamSummary[]; students: RosterStudent[] }) {
  const [expanded, setExpanded] = useState<string | null>(exams[0]?.id ?? null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<ExamSummary | null>(null);
  const [isPending, startTransition] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const copyLink = (token: string, name: string) => {
    navigator.clipboard.writeText(`${origin}/v/${token}`).then(() => toast.success(`${name} 응시 링크 복사됨`)).catch(() => toast.error("복사 실패"));
  };

  const act = (fn: () => Promise<unknown>, ok: string) =>
    startTransition(async () => {
      try { await fn(); toast.success(ok); }
      catch (e) { toast.error(e instanceof Error ? e.message : "실패"); }
    });

  if (exams.length === 0) return <p className="text-sm text-muted-foreground">아직 출제한 시험이 없습니다.</p>;

  return (
    <div className="space-y-3">
      {exams.map((exam) => {
        const submitted = exam.attempts.filter((a) => a.status === "SUBMITTED");
        const avg = submitted.length ? Math.round((submitted.reduce((s, a) => s + (a.score ?? 0), 0) / submitted.length) * 10) / 10 : null;
        const open = expanded === exam.id;
        return (
          <Card key={exam.id}>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(open ? null : exam.id)}>
              <CardTitle className="text-base flex items-center gap-2">
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {exam.title}
                {exam.isRetake && <Badge variant="secondary">재시험</Badge>}
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {exam.bookName} · {DIR_LABEL[exam.direction]} · {exam.questionCount}문항 · {exam.perQuestionSeconds || "∞"}초 · {fmt(exam.createdAt)}
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground pl-6">
                대상 {exam.attempts.length}명 · 제출 {submitted.length}명{avg !== null ? ` · 평균 ${avg}점` : ""}
              </p>
            </CardHeader>
            {open && (
              <CardContent>
                <div className="flex justify-end mb-2">
                  <Button variant="outline" size="sm" onClick={() => setAssignFor(exam)}><UserPlus className="h-3.5 w-3.5 mr-1" /> 학생 추가 배정</Button>
                </div>
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>학생</TableHead>
                        <TableHead className="w-24">상태</TableHead>
                        <TableHead className="w-28">점수</TableHead>
                        <TableHead className="w-32">제출 시각</TableHead>
                        <TableHead>관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exam.attempts.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.student.name} <span className="text-xs text-muted-foreground">{a.student.grade}</span></TableCell>
                          <TableCell><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_META[a.status].cls}`}>{STATUS_META[a.status].label}</span></TableCell>
                          <TableCell>{a.status === "SUBMITTED" ? <span className="font-semibold tabular-nums">{a.score}점 <span className="text-xs font-normal text-muted-foreground">({a.correctCount}/{a.totalQuestions})</span></span> : "—"}</TableCell>
                          <TableCell className="text-xs">{fmt(a.submittedAt)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {a.status !== "EXPIRED" && (
                                <Button variant="ghost" size="sm" className="h-7" onClick={() => copyLink(a.token, a.student.name)} title="응시 링크 복사"><Copy className="h-3.5 w-3.5" /></Button>
                              )}
                              {a.status === "SUBMITTED" && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setDetailId(a.id)}><Eye className="h-3.5 w-3.5 mr-1" />상세</Button>
                                  <Button variant="ghost" size="sm" className="h-7" disabled={isPending}
                                    onClick={() => { if (confirm(`${a.student.name} 의 오답 단어로 재시험을 만들까요?`)) act(() => createRetakeFromAttempt(a.id), "재시험을 만들었습니다"); }}>
                                    <RotateCcw className="h-3.5 w-3.5 mr-1" />재시험
                                  </Button>
                                </>
                              )}
                              {a.status !== "SUBMITTED" && a.status !== "EXPIRED" && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7" disabled={isPending}
                                    onClick={() => act(() => reissueAttemptLink(a.id), "링크를 재발급했습니다")}><RefreshCw className="h-3.5 w-3.5 mr-1" />재발급</Button>
                                  <Button variant="ghost" size="sm" className="h-7 text-destructive" disabled={isPending}
                                    onClick={() => { if (confirm(`${a.student.name} 의 응시를 취소할까요?`)) act(() => cancelVocabAttempt(a.id), "취소했습니다"); }}><XCircle className="h-3.5 w-3.5 mr-1" />취소</Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {detailId && <AttemptDetailDialog attemptId={detailId} onClose={() => setDetailId(null)} />}
      {assignFor && (
        <AssignDialog
          exam={assignFor}
          students={students}
          onClose={() => setAssignFor(null)}
          onAssigned={() => setAssignFor(null)}
        />
      )}
    </div>
  );
}

type DetailItem = {
  id: string; order: number; direction: VocabExamDirection; prompt: string;
  word: string; meanings: string[]; expectedAnswers: string[];
  studentAnswer: string | null; isCorrect: boolean | null; timeMs: number | null;
};

function AttemptDetailDialog({ attemptId, onClose }: { attemptId: string; onClose: () => void }) {
  const [data, setData] = useState<{ studentName: string; examTitle: string; score: number | null; items: DetailItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getVocabAttemptDetail(attemptId)
      .then((d) => {
        if (cancelled || !d) return;
        setData({
          studentName: d.student.name,
          examTitle: d.exam.title,
          score: d.score,
          items: d.items as unknown as DetailItem[],
        });
      })
      .catch((e) => !cancelled && toast.error(e instanceof Error ? e.message : "로드 실패"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [attemptId]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{data ? `${data.studentName} — ${data.examTitle}` : "응시 상세"}</DialogTitle>
          {data && <DialogDescription>점수 {data.score}점 · 정답 {data.items.filter((i) => i.isCorrect).length}/{data.items.length}</DialogDescription>}
        </DialogHeader>
        {loading ? <p className="text-sm text-muted-foreground">불러오는 중…</p> : !data ? <p className="text-sm text-destructive">데이터를 찾을 수 없습니다.</p> : (
          <div className="max-h-[460px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead className="w-16">정/오</TableHead>
                  <TableHead>문제</TableHead>
                  <TableHead>학생 답</TableHead>
                  <TableHead>정답</TableHead>
                  <TableHead className="w-16">시간</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((it) => (
                  <TableRow key={it.id} className={it.isCorrect ? "" : "bg-red-50/50"}>
                    <TableCell className="text-xs text-muted-foreground">{it.order + 1}</TableCell>
                    <TableCell>{it.isCorrect ? <span className="text-green-600">O</span> : <span className="text-red-600">X</span>}</TableCell>
                    <TableCell className="font-medium">{it.prompt}<span className="ml-1 text-[10px] text-muted-foreground">{DIR_LABEL[it.direction]}</span></TableCell>
                    <TableCell className={it.isCorrect ? "" : "text-red-700"}>{it.studentAnswer || <span className="text-muted-foreground">(미입력)</span>}</TableCell>
                    <TableCell className="text-xs">{it.direction === "EN_TO_KO" ? it.meanings.join(" / ") : it.word}</TableCell>
                    <TableCell className="text-xs tabular-nums">{it.timeMs != null ? `${(it.timeMs / 1000).toFixed(1)}s` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter><Button onClick={onClose}>닫기</Button></DialogFooter>
      </DialogContent>
    </Dialog>
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
