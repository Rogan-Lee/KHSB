"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Send, ClipboardCheck } from "lucide-react";
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
  const [questionCount, setQuestionCount] = useState(20);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState(10);
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
  const toggleStudent = (id: string) =>
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const onSubmit = () => {
    if (!bookId) return toast.error("단어장을 선택하세요");
    if (poolCount === 0) return toast.error("선택한 범위에 단어가 없습니다");
    if (selectedStudentIds.length === 0) return toast.error("대상 학생을 1명 이상 선택하세요");
    const finalTitle = title.trim() || `${book?.name ?? "영단어"} 시험${selectedUnits.length ? ` (${selectedUnits.join(", ")})` : ""}`;
    startTransition(async () => {
      try {
        const res = await createVocabExam({
          title: finalTitle,
          bookId,
          direction,
          questionCount,
          perQuestionSeconds,
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

  return (
    <div className="space-y-4">
      {activeBooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">먼저 「단어장」 탭에서 단어장을 만들고 단어를 등록하세요.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">시험 설정</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>단어장</Label>
                <Select value={bookId} onValueChange={(v) => { setBookId(v); setSelectedUnits([]); }}>
                  <SelectTrigger><SelectValue placeholder="단어장 선택" /></SelectTrigger>
                  <SelectContent>
                    {activeBooks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name} ({b.entryCount}개)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {book && book.units.length > 0 && (
                <div>
                  <Label>출제 범위 (단원)</Label>
                  <p className="text-xs text-muted-foreground mb-1">선택 안 하면 단어장 전체</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto">
                    {book.units.map((u) => (
                      <button
                        key={u.unit}
                        type="button"
                        onClick={() => toggleUnit(u.unit)}
                        className={`rounded-full border px-2.5 py-1 text-xs ${selectedUnits.includes(u.unit) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                      >
                        {u.unit} <span className="opacity-70">{u.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label>출제 유형</Label>
                <Select value={direction} onValueChange={(v) => setDirection(v as VocabExamDirection)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>문항 수</Label>
                  <Input type="number" min={1} max={poolCount || 1} value={questionCount}
                    onChange={(e) => setQuestionCount(Math.max(1, Number(e.target.value) || 1))} />
                  <p className="text-xs text-muted-foreground mt-0.5">선택 범위 단어 {poolCount}개</p>
                </div>
                <div>
                  <Label>문항당 제한시간(초)</Label>
                  <Input type="number" min={0} max={600} value={perQuestionSeconds}
                    onChange={(e) => setPerQuestionSeconds(Math.max(0, Number(e.target.value) || 0))} />
                  <p className="text-xs text-muted-foreground mt-0.5">0 = 무제한</p>
                </div>
              </div>

              <div>
                <Label>시험 이름 (선택)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 워드마스터 Day 12~13" />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="shuffle" checked={shuffle} onCheckedChange={(c) => setShuffle(!!c)} />
                <Label htmlFor="shuffle" className="font-normal">단어 순서 섞기</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="slack" checked={notifyOnSlack} onCheckedChange={(c) => setNotifyOnSlack(!!c)} />
                <Label htmlFor="slack" className="font-normal">Slack 알림 보내기</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>대상 학생 ({selectedStudentIds.length}명 선택)</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedStudentIds(selectedStudentIds.length === filteredStudents.length ? [] : filteredStudents.map((s) => s.id))}>
                  {selectedStudentIds.length === filteredStudents.length ? "전체 해제" : "보이는 전체 선택"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="학생 이름 검색" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} />
              <div className="max-h-[360px] overflow-auto rounded-md border divide-y">
                {filteredStudents.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={selectedStudentIds.includes(s.id)} onCheckedChange={() => toggleStudent(s.id)} />
                    <span className="flex-1">{s.name} <span className="text-xs text-muted-foreground">{s.grade}{s.school ? ` · ${s.school}` : ""}</span></span>
                    {s.isOnlineManaged && <Badge variant="secondary" className="text-[10px]">온라인</Badge>}
                  </label>
                ))}
                {filteredStudents.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">검색 결과 없음</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeBooks.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={isPending} size="lg">
            <Send className="h-4 w-4 mr-2" /> 시험 출제 & 링크 생성
          </Button>
        </div>
      )}

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
          <DialogTitle>출제 완료 — {examTitle}</DialogTitle>
          <DialogDescription>학생에게 아래 응시 링크를 전송하세요. (각 학생 전용 링크)</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[420px] overflow-auto">
          {rows.map((r) => (
            <div key={r.studentId} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <span className="w-24 shrink-0 font-medium truncate">{r.name}</span>
              <code className="flex-1 truncate text-xs text-muted-foreground">{takeUrl(r.token)}</code>
              <Button variant="outline" size="sm" onClick={() => copy(takeUrl(r.token), `${r.name} 응시 링크`)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> 응시 링크
              </Button>
              {r.magicLinkToken && (
                <Button variant="ghost" size="sm" onClick={() => copy(portalUrl(r.magicLinkToken!), `${r.name} 포털 링크`)}>
                  포털
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          <Button variant="outline" onClick={copyAll}><ClipboardCheck className="h-4 w-4 mr-1" /> 전체 링크 복사</Button>
          <Button onClick={onClose}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
