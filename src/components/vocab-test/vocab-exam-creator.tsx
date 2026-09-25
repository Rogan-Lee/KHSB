"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, FormField, SearchField, Section, StatusBadge } from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BookOpen, Copy, Send, ClipboardCheck, Check } from "lucide-react";
import { createVocabExam } from "@/actions/vocab-online";
import type { VocabBookSummary } from "./vocab-book-manager";
import type { VocabExamDirection } from "@/generated/prisma";

export type RosterStudent = {
  id: string;
  name: string;
  grade: string;
  school: string | null;
  isOnlineManaged: boolean;
};

const DIRECTION_OPTIONS: { value: VocabExamDirection; label: string }[] = [
  { value: "EN_TO_KO", label: "영단어 → 뜻 (한글 입력)" },
  { value: "KO_TO_EN", label: "뜻 → 영단어 (영어 입력)" },
  { value: "MIXED", label: "혼합 (문항별 랜덤)" },
];

type ResultRow = { studentId: string; name: string; token: string; magicLinkToken: string | null };

export function VocabExamCreator({ books, students }: { books: VocabBookSummary[]; students: RosterStudent[] }) {
  const [isPending, startTransition] = useTransition();
  const activeBooks = books.filter((b) => !b.isArchived);

  const [bookId, setBookId] = useState<string>(activeBooks[0]?.id ?? "");
  const book = books.find((b) => b.id === bookId) ?? null;
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [direction, setDirection] = useState<VocabExamDirection>("EN_TO_KO");
  const [title, setTitle] = useState("");
  // 입력 중 필드를 완전히 비울 수 있도록 string state — 제출 시에만 숫자로 변환/검증
  const [questionCount, setQuestionCount] = useState("20");
  const [perQuestionSeconds, setPerQuestionSeconds] = useState("10");
  const [shuffle, setShuffle] = useState(true);
  const [notifyOnSlack, setNotifyOnSlack] = useState(false);

  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const filteredStudents = useMemo(
    () => students.filter((s) => !studentQuery.trim() || s.name.includes(studentQuery.trim())),
    [students, studentQuery]
  );

  const [result, setResult] = useState<{ examTitle: string; rows: ResultRow[] } | null>(null);

  const poolCount = useMemo(() => {
    if (!book) return 0;
    if (selectedUnits.length === 0) return book.entryCount;
    return book.units.filter((u) => selectedUnits.includes(u.unit)).reduce((s, u) => s + u.count, 0);
  }, [book, selectedUnits]);

  const toggleUnit = (u: string) =>
    setSelectedUnits((prev) => (prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]));

  // 단원 일괄/범위 선택 — book.units 는 숫자 인식 정렬됨(인덱스 기반 범위가 안전)
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");
  const selectAllUnits = () => setSelectedUnits((book?.units ?? []).map((u) => u.unit));
  const clearUnits = () => setSelectedUnits([]);
  const applyRange = () => {
    if (!book) return;
    const list = book.units;
    let i = list.findIndex((u) => u.unit === rangeStart);
    let j = list.findIndex((u) => u.unit === rangeEnd);
    if (i === -1 || j === -1) return toast.error("시작·끝 단원을 선택하세요");
    if (i > j) [i, j] = [j, i];
    const inRange = list.slice(i, j + 1).map((u) => u.unit);
    setSelectedUnits((prev) => Array.from(new Set([...prev, ...inRange])));
  };

  const toggleStudent = (id: string) =>
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const onSubmit = () => {
    if (!bookId) return toast.error("단어장을 선택하세요");
    if (poolCount === 0) return toast.error("선택한 범위에 단어가 없습니다");
    if (selectedStudentIds.length === 0) return toast.error("대상 학생을 1명 이상 선택하세요");
    const parsedCount = parseInt(questionCount, 10) || 0;
    const parsedSeconds = Math.max(0, parseInt(perQuestionSeconds, 10) || 0);
    if (parsedCount < 1) return toast.error("문항 수를 1 이상 입력하세요");
    const finalTitle = title.trim() || `${book?.name ?? "영단어"} 시험${selectedUnits.length ? ` (${selectedUnits.join(", ")})` : ""}`;
    startTransition(async () => {
      try {
        const res = await createVocabExam({
          title: finalTitle,
          bookId,
          direction,
          questionCount: parsedCount,
          perQuestionSeconds: parsedSeconds,
          units: selectedUnits,
          entryIds: [],
          shuffle,
          studentIds: selectedStudentIds,
          notifyOnSlack,
        });
        setResult({ examTitle: finalTitle, rows: res.attempts });
        setSelectedStudentIds([]);
        setTitle("");
        toast.success(`"${finalTitle}" 출제 완료 — 학생 ${res.attempts.length}명`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "출제 실패");
      }
    });
  };

  const bookUnits = book?.units ?? [];

  if (activeBooks.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={BookOpen}
          title="먼저 단어장을 만들어 주세요"
          description={"「단어장」 탭에서 단어장을 만들고 단어를 등록하면\n여기서 시험을 낼 수 있어요."}
        />
        {result && <ResultDialog examTitle={result.examTitle} rows={result.rows} onClose={() => setResult(null)} />}
      </Section>
    );
  }

  return (
    <div className="flex flex-col gap-x5">
      <div className="grid grid-cols-1 items-start gap-x5 lg:grid-cols-2">
        <Section title="시험 설정">
          <div className="flex flex-col gap-x5">
            <FormField label="단어장" required>
              <Select value={bookId} onValueChange={(v) => { setBookId(v); setSelectedUnits([]); }}>
                <SelectTrigger><SelectValue placeholder="단어장 선택" /></SelectTrigger>
                <SelectContent>
                  {activeBooks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name} ({b.entryCount}개)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {book && bookUnits.length > 0 && (
              <div className="flex flex-col gap-x2">
                {/* 헤더 — 라벨 + 선택 요약 + 전체 선택/해제 */}
                <div className="flex flex-wrap items-center justify-between gap-x2">
                  <span className="t4-medium text-fg-neutral">출제 범위 (단원)</span>
                  <div className="flex items-center gap-x1">
                    <span className="mr-x1 t3-regular tabular-nums text-fg-neutral-subtle">
                      {selectedUnits.length > 0
                        ? `${selectedUnits.length}단원 · 단어 ${poolCount}개`
                        : "선택 안 하면 단어장 전체"}
                    </span>
                    <Button type="button" variant="ghost" size="xs" onClick={selectAllUnits}>
                      전체 선택
                    </Button>
                    <Button type="button" variant="ghost" size="xs" onClick={clearUnits}>
                      전체 해제
                    </Button>
                  </div>
                </div>

                {/* 범위 빠른 선택 (연속 Day) */}
                <div className="flex flex-wrap items-center gap-x2 rounded-r3 bg-bg-layer-fill p-x3">
                  <span className="t3-medium text-fg-neutral-muted">범위</span>
                  <Select value={rangeStart} onValueChange={setRangeStart}>
                    <SelectTrigger className="h-9 w-28" aria-label="시작 단원"><SelectValue placeholder="시작" /></SelectTrigger>
                    <SelectContent>
                      {bookUnits.map((u) => <SelectItem key={u.unit} value={u.unit}>{u.unit}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="t4-regular text-fg-neutral-subtle">~</span>
                  <Select value={rangeEnd} onValueChange={setRangeEnd}>
                    <SelectTrigger className="h-9 w-28" aria-label="끝 단원"><SelectValue placeholder="끝" /></SelectTrigger>
                    <SelectContent>
                      {bookUnits.map((u) => <SelectItem key={u.unit} value={u.unit}>{u.unit}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={applyRange}>
                    범위 선택
                  </Button>
                </div>

                {/* 단원 칩 그리드 */}
                <div className="grid max-h-56 grid-cols-2 gap-x1_5 overflow-auto rounded-r3 border border-stroke-neutral-muted p-x2 sm:grid-cols-3 md:grid-cols-4">
                  {bookUnits.map((u) => {
                    const on = selectedUnits.includes(u.unit);
                    return (
                      <button
                        key={u.unit}
                        type="button"
                        onClick={() => toggleUnit(u.unit)}
                        aria-pressed={on}
                        className={cn(
                          "flex min-h-9 w-full items-center justify-between gap-x1 rounded-r2 px-x3 py-x1_5 t3-medium transition-colors",
                          on
                            ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
                            : "bg-bg-layer-default text-fg-neutral shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
                        )}
                      >
                        <span className="flex items-center gap-x1 truncate">
                          {on && <Check className="size-3.5 shrink-0" aria-hidden />}
                          <span className="truncate">{u.unit}</span>
                        </span>
                        <span className={cn("tabular-nums", on ? "opacity-70" : "text-fg-neutral-subtle")}>{u.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <FormField label="출제 유형" required>
              <Select value={direction} onValueChange={(v) => setDirection(v as VocabExamDirection)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIRECTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>

            <div className="grid grid-cols-2 gap-x3">
              <FormField label="문항 수" htmlFor="vocab-question-count" required hint={`선택 범위 단어 ${poolCount}개`}>
                <Input id="vocab-question-count" type="number" min={0} max={poolCount || 1} value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value)} className="tabular-nums" />
              </FormField>
              <FormField label="문항당 제한시간(초)" htmlFor="vocab-per-seconds" hint="0 = 무제한">
                <Input id="vocab-per-seconds" type="number" min={0} max={600} value={perQuestionSeconds}
                  onChange={(e) => setPerQuestionSeconds(e.target.value)} className="tabular-nums" />
              </FormField>
            </div>

            <FormField label="시험 이름" htmlFor="vocab-exam-title" hint="비워 두면 단어장·단원 이름으로 자동으로 지어요.">
              <Input id="vocab-exam-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 워드마스터 Day 12~13" />
            </FormField>

            <div className="flex flex-col gap-x3">
              <label htmlFor="shuffle" className="flex cursor-pointer items-center gap-x2_5 t4-regular text-fg-neutral">
                <Checkbox id="shuffle" checked={shuffle} onCheckedChange={(c) => setShuffle(!!c)} />
                단어 순서 섞기
              </label>
              <label htmlFor="slack" className="flex cursor-pointer items-center gap-x2_5 t4-regular text-fg-neutral">
                <Checkbox id="slack" checked={notifyOnSlack} onCheckedChange={(c) => setNotifyOnSlack(!!c)} />
                Slack 알림 보내기
              </label>
            </div>
          </div>
        </Section>

        <Section
          title="대상 학생"
          count={selectedStudentIds.length}
          description="선택한 학생마다 전용 응시 링크가 만들어져요."
          actions={
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelectedStudentIds(selectedStudentIds.length === filteredStudents.length ? [] : filteredStudents.map((s) => s.id))}
            >
              {selectedStudentIds.length === filteredStudents.length ? "전체 해제" : "보이는 전체 선택"}
            </Button>
          }
        >
          <div className="flex flex-col gap-x3">
            <SearchField
              placeholder="학생 이름 검색"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              className="sm:w-full"
              aria-label="학생 이름 검색"
            />
            <div className="max-h-[420px] divide-y divide-stroke-neutral-muted overflow-auto rounded-r3 border border-stroke-neutral-muted">
              {filteredStudents.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-x3 px-x4 py-x2_5 transition-colors hover:bg-bg-layer-default-pressed"
                >
                  <Checkbox checked={selectedStudentIds.includes(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="t4-medium text-fg-neutral">{s.name}</span>
                    <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">
                      {s.grade}{s.school ? ` · ${s.school}` : ""}
                    </span>
                  </span>
                  {s.isOnlineManaged && <StatusBadge tone="info">온라인</StatusBadge>}
                </label>
              ))}
              {filteredStudents.length === 0 && (
                <p className="px-x4 py-x6 text-center t4-regular text-fg-neutral-subtle">검색 결과가 없어요</p>
              )}
            </div>
          </div>
        </Section>
      </div>

      <div className="flex flex-col gap-x3 rounded-r4 bg-bg-layer-fill px-x5 py-x4 sm:flex-row sm:items-center sm:justify-between">
        <p className="t4-regular tabular-nums text-fg-neutral-muted">
          {book ? <span className="t4-medium text-fg-neutral">{book.name}</span> : "단어장 미선택"}
          {` · 단어 ${poolCount}개에서 ${questionCount || 0}문항 · 학생 ${selectedStudentIds.length}명`}
        </p>
        <Button onClick={onSubmit} disabled={isPending} size="lg" className="w-full sm:w-auto">
          <Send /> {isPending ? "출제 중…" : "시험 출제하고 링크 만들기"}
        </Button>
      </div>

      {result && <ResultDialog examTitle={result.examTitle} rows={result.rows} onClose={() => setResult(null)} />}
    </div>
  );
}

function ResultDialog({ examTitle, rows, onClose }: { examTitle: string; rows: ResultRow[]; onClose: () => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const takeUrl = (token: string) => `${origin}/v/${token}`;
  const portalUrl = (token: string) => `${origin}/s/${token}`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} 복사됨`)).catch(() => toast.error("복사 실패"));
  };
  const copyAll = () => {
    const text = rows.map((r) => `${r.name}: ${takeUrl(r.token)}`).join("\n");
    copy(text, "전체 링크");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>출제 완료</DialogTitle>
          <DialogDescription>
            {examTitle} · 학생마다 전용 응시 링크가 만들어졌어요. 카톡이나 문자로 보내 주세요.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[420px] divide-y divide-stroke-neutral-muted overflow-auto rounded-r3 border border-stroke-neutral-muted">
          {rows.map((r) => (
            <li key={r.studentId} className="flex flex-wrap items-center gap-x2 px-x4 py-x3">
              <span className="w-24 shrink-0 truncate t4-medium text-fg-neutral">{r.name}</span>
              <span className="min-w-0 flex-1 truncate t3-regular text-fg-neutral-subtle">{takeUrl(r.token)}</span>
              <Button variant="secondary" size="xs" onClick={() => copy(takeUrl(r.token), `${r.name} 응시 링크`)}>
                <Copy /> 응시 링크
              </Button>
              {r.magicLinkToken && (
                <Button variant="ghost" size="xs" onClick={() => copy(portalUrl(r.magicLinkToken!), `${r.name} 포털 링크`)}>
                  포털
                </Button>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={copyAll}><ClipboardCheck /> 전체 링크 복사</Button>
          <Button onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
