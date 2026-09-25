"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { createExamScore, updateExamScore, deleteExamScore } from "@/actions/exam-scores";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { inputBaseClass } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { Trash2, Plus, TrendingUp, TrendingDown, Minus, Pencil, Check, X, ChartNoAxesColumn } from "lucide-react";
import type { ExamScore, ExamType } from "@/generated/prisma";
import { useSortableTable } from "@/hooks/use-sortable-table";
import {
  EmptyState,
  FilterChip,
  FormActions,
  FormField,
  Section,
  StatusBadge,
  TableCard,
  TONE_TEXT,
  type Tone,
} from "@/components/backoffice/ui";
import { SortHead } from "./sort-head";

interface Props {
  studentId: string;
  initialScores: ExamScore[];
}

type ViewMode = "all" | "rawScore" | "grade" | "percentile" | "table";

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  OFFICIAL_MOCK: "공식 모의고사",
  DUFF: "더프 모의고사",
  PRIVATE_MOCK: "사설 모의고사",
  SCHOOL_EXAM: "학교 내신",
};

const SUBJECTS = [
  "국어", "수학", "영어", "한국사",
  "사회", "과학",
  // 사회탐구
  "생활과윤리", "윤리와사상", "한국지리", "세계지리",
  "동아시아사", "세계사", "경제", "정치와법", "사회·문화",
  // 과학탐구
  "물리학Ⅰ", "물리학Ⅱ", "화학Ⅰ", "화학Ⅱ",
  "생명과학Ⅰ", "생명과학Ⅱ", "지구과학Ⅰ", "지구과학Ⅱ",
  // 직업탐구 / 제2외국어
  "직업탐구", "제2외국어",
];
const EXAM_TYPES: ExamType[] = ["OFFICIAL_MOCK", "PRIVATE_MOCK", "DUFF", "SCHOOL_EXAM"];

function fmtDate(d: Date | string) {
  const dt = new Date(d);
  return `${dt.getFullYear().toString().slice(2)}.${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

// ─── SEED 색 (차트는 CSS 변수 문자열) ────────────────────────────────

// 등급 구간 → 상태 톤: 1~2 정보 · 3~4 성공 · 5~6 주의 · 7~9 위험
type GradeTone = Extract<Tone, "info" | "ok" | "warn" | "bad">;
function gradeTone(g: number): GradeTone {
  if (g <= 2) return "info";
  if (g <= 4) return "ok";
  if (g <= 6) return "warn";
  return "bad";
}
const GRADE_FILL: Record<GradeTone, string> = {
  info: "var(--seed-color-palette-blue-700)",
  ok: "var(--seed-color-palette-green-700)",
  warn: "var(--seed-color-palette-yellow-700)",
  bad: "var(--seed-color-palette-red-700)",
};
function gradeFill(g?: number) {
  return g ? GRADE_FILL[gradeTone(g)] : "var(--seed-color-bg-neutral-weak)";
}
const GRADE_LEGEND: { label: string; tone: GradeTone }[] = [
  { label: "1~2등급", tone: "info" },
  { label: "3~4등급", tone: "ok" },
  { label: "5~6등급", tone: "warn" },
  { label: "7~9등급", tone: "bad" },
];

const SERIES = {
  rawScore: "var(--seed-color-bg-brand-solid)",
  percentile: "var(--seed-color-palette-blue-700)",
};
const SURFACE = "var(--seed-color-bg-layer-default)";
const GRID_STROKE = "var(--seed-color-stroke-neutral-muted)";

const TOOLTIP = {
  contentStyle: {
    background: "var(--seed-color-bg-neutral-inverted)",
    border: "none",
    borderRadius: 8,
    color: "var(--seed-color-fg-neutral-inverted)",
    fontSize: 12,
    padding: "8px 12px",
    boxShadow: "var(--seed-shadow-s2)",
  },
  itemStyle: { color: "var(--seed-color-fg-neutral-inverted)" },
  labelStyle: { color: "var(--seed-color-palette-gray-500)", fontSize: 12, marginBottom: 4 },
};
const LINE_CURSOR = { stroke: "var(--seed-color-stroke-neutral-weak)", strokeWidth: 1, strokeDasharray: "4 4" };
const BAR_CURSOR = { fill: "var(--seed-color-bg-neutral-weak)" };

// 차트 공통 axis 스타일
const AXIS_TICK = { fontSize: 12, fill: "var(--seed-color-fg-neutral-subtle)" };

// 표 안 편집 입력
const cellInput = cn(inputBaseClass, "h-8 px-x2 t3-regular");
const cellSelect = cn(inputBaseClass, "h-8 px-x1_5 t3-regular");
const fieldInput = cn(inputBaseClass, "h-10 px-x3");

// 데이터 범위 기반 동적 도메인 — 변화폭을 드라마틱하게 표현
function dynDomain(vals: (number | undefined)[], absMin: number, absMax: number, pad: number): [number, number] {
  const v = vals.filter((x): x is number => x != null);
  if (!v.length) return [absMin, absMax];
  return [
    Math.max(absMin, Math.min(...v) - pad),
    Math.min(absMax, Math.max(...v) + pad),
  ];
}

function Trend({ current, prev }: { current?: number; prev?: number }) {
  if (current == null || prev == null) return <span className="t3-regular text-fg-neutral-subtle">—</span>;
  const diff = current - prev;
  if (diff > 0) return (
    <span className="inline-flex items-center gap-x0_5 t3-medium text-fg-positive tabular-nums">
      <TrendingUp className="size-3.5" aria-hidden /> +{diff.toFixed(1)}
    </span>
  );
  if (diff < 0) return (
    <span className="inline-flex items-center gap-x0_5 t3-medium text-fg-critical tabular-nums">
      <TrendingDown className="size-3.5" aria-hidden /> {diff.toFixed(1)}
    </span>
  );
  return <span className="inline-flex items-center gap-x0_5 t3-regular text-fg-neutral-subtle"><Minus className="size-3.5" aria-hidden /> 0</span>;
}

/** 등급은 낮을수록 좋으므로 부호 반전 */
function GradeTrend({ current, prev }: { current?: number; prev?: number }) {
  if (current == null || prev == null) return <span className="t3-regular text-fg-neutral-subtle">—</span>;
  if (current < prev) return (
    <span className="inline-flex items-center gap-x0_5 t3-medium text-fg-positive tabular-nums">
      <TrendingUp className="size-3.5" aria-hidden /> {prev - current}등급 향상
    </span>
  );
  if (current > prev) return (
    <span className="inline-flex items-center gap-x0_5 t3-medium text-fg-critical tabular-nums">
      <TrendingDown className="size-3.5" aria-hidden /> {current - prev}등급 하락
    </span>
  );
  return <span className="inline-flex items-center gap-x0_5 t3-regular text-fg-neutral-subtle"><Minus className="size-3.5" aria-hidden /> 유지</span>;
}

function GradeText({ grade, className }: { grade: number; className?: string }) {
  return <span className={cn("t4-bold tabular-nums", TONE_TEXT[gradeTone(grade)], className)}>{grade}등급</span>;
}

/** 큰 숫자 + 단위 + 증감 (추이 차트 머리) */
function Headline({ label, value, unit, trend, valueClass }: { label: string; value: ReactNode; unit: string; trend: ReactNode; valueClass?: string }) {
  return (
    <div className="mb-x4 flex flex-wrap items-end gap-x-x3 gap-y-x1">
      <div>
        <p className="t3-medium text-fg-neutral-subtle">{label}</p>
        <p className="mt-x0_5 flex items-baseline gap-x0_5">
          <span className={cn("t9-bold tabular-nums text-fg-neutral", valueClass)}>{value}</span>
          <span className="t4-medium text-fg-neutral-subtle">{unit}</span>
        </p>
      </div>
      <div className="pb-x1">{trend}</div>
    </div>
  );
}

function IconAction({ label, onClick, disabled, tone, children }: { label: string; onClick: () => void; disabled?: boolean; tone?: "critical" | "positive"; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed disabled:pointer-events-none disabled:text-fg-disabled focus-visible:outline-2 focus-visible:outline-stroke-focus-ring",
        tone === "critical" && "hover:text-fg-critical",
        tone === "positive" && "text-fg-positive",
        !tone && "hover:text-fg-neutral",
      )}
    >
      {children}
    </button>
  );
}

function ExamTableView({ scores, filterType, studentId, onUpdate, onDelete }: {
  scores: ExamScore[];
  filterType: ExamType | "ALL";
  studentId: string;
  onUpdate?: (updated: ExamScore) => void;
  onDelete?: (score: ExamScore) => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [ef, setEf] = useState({ subject: "", rawScore: "", grade: "", percentile: "", notes: "" });
  const [pending, setPending] = useState(false);

  function startInlineEdit(s: ExamScore) {
    setEditId(s.id);
    setEf({
      subject: s.subject,
      rawScore: s.rawScore?.toString() ?? "",
      grade: s.grade?.toString() ?? "",
      percentile: s.percentile?.toString() ?? "",
      notes: s.notes ?? "",
    });
  }

  async function saveInlineEdit(s: ExamScore) {
    setPending(true);
    try {
      const updated = await updateExamScore(s.id, {
        studentId,
        examType: s.examType,
        examName: s.examName,
        examDate: new Date(s.examDate).toISOString().split("T")[0],
        subject: ef.subject,
        rawScore: ef.rawScore ? parseInt(ef.rawScore) : undefined,
        grade: ef.grade ? parseInt(ef.grade) : undefined,
        percentile: ef.percentile ? parseFloat(ef.percentile) : undefined,
        notes: ef.notes || undefined,
      });
      onUpdate?.(updated);
      setEditId(null);
    } catch { /* toast handled by parent */ }
    setPending(false);
  }

  const typeScores = filterType === "ALL" ? scores : scores.filter((s) => s.examType === filterType);
  const examGroups = new Map<string, { examName: string; examDate: Date; examType: ExamType; scores: ExamScore[] }>();
  for (const s of typeScores) {
    const key = `${s.examName}_${new Date(s.examDate).toISOString().slice(0, 10)}`;
    if (!examGroups.has(key)) examGroups.set(key, { examName: s.examName, examDate: new Date(s.examDate), examType: s.examType, scores: [] });
    examGroups.get(key)!.scores.push(s);
  }
  const groups = [...examGroups.values()].sort((a, b) => b.examDate.getTime() - a.examDate.getTime());
  // 평가원 성적표 순서(국·수·영·한·탐)로 정렬 — SUBJECTS 인덱스 기준, 미지정 과목은 뒤로.
  const subjIndex = (s: string) => { const i = SUBJECTS.indexOf(s); return i === -1 ? 999 : i; };
  const allSubjects = [...new Set(typeScores.map((s) => s.subject))].sort((a, b) => subjIndex(a) - subjIndex(b));

  if (groups.length === 0) return (
    <TableCard>
      <EmptyState
        icon={ChartNoAxesColumn}
        title={`${filterType === "ALL" ? "성적" : EXAM_TYPE_LABELS[filterType]} 기록이 없어요`}
        description="성적을 등록하면 시험별로 전체 과목을 모아 보여 줘요."
      />
    </TableCard>
  );

  return (
    <div className="flex flex-col gap-x4">
      {groups.map((g) => (
        <TableCard key={`${g.examName}_${g.examDate.toISOString()}`}>
          <div className="flex flex-wrap items-center gap-x2 px-x4 py-x3">
            <span className="t4-bold text-fg-neutral">{g.examName}</span>
            <span className="t3-regular text-fg-neutral-subtle tabular-nums">{new Date(g.examDate).toLocaleDateString("ko-KR")}</span>
            <StatusBadge>{EXAM_TYPE_LABELS[g.examType]}</StatusBadge>
            <span className="ml-auto t3-regular text-fg-neutral-subtle tabular-nums">{g.scores.length}과목</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>과목</TableHead>
                <TableHead className="text-right">원점수</TableHead>
                <TableHead className="text-right">등급</TableHead>
                <TableHead className="text-right">백분위</TableHead>
                <TableHead>메모</TableHead>
                <TableHead className="w-20"><span className="sr-only">관리</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.scores
                .sort((a, b) => allSubjects.indexOf(a.subject) - allSubjects.indexOf(b.subject))
                .map((s) => editId === s.id ? (
                <TableRow key={s.id} className="bg-bg-layer-fill hover:bg-bg-layer-fill">
                  <TableCell className="px-x2 py-x2">
                    <select value={ef.subject} onChange={(e) => setEf((f) => ({ ...f, subject: e.target.value }))}
                      aria-label="과목" className={cn(cellSelect, "w-full min-w-24")}>
                      {SUBJECTS.map((sub) => <option key={sub} value={sub}>{sub}</option>)}
                    </select>
                  </TableCell>
                  <TableCell className="px-x2 py-x2 text-right">
                    <input type="number" value={ef.rawScore} min={0} max={100} aria-label="원점수"
                      onChange={(e) => setEf((f) => ({ ...f, rawScore: e.target.value }))}
                      className={cn(cellInput, "w-16 text-right")} />
                  </TableCell>
                  <TableCell className="px-x2 py-x2 text-right">
                    <input type="number" value={ef.grade} min={1} max={9} aria-label="등급"
                      onChange={(e) => setEf((f) => ({ ...f, grade: e.target.value }))}
                      className={cn(cellInput, "w-14 text-right")} />
                  </TableCell>
                  <TableCell className="px-x2 py-x2 text-right">
                    <input type="number" value={ef.percentile} step={0.1} aria-label="백분위"
                      onChange={(e) => setEf((f) => ({ ...f, percentile: e.target.value }))}
                      className={cn(cellInput, "w-16 text-right")} />
                  </TableCell>
                  <TableCell className="px-x2 py-x2">
                    <input type="text" value={ef.notes} onChange={(e) => setEf((f) => ({ ...f, notes: e.target.value }))}
                      aria-label="메모" className={cn(cellInput, "w-full min-w-28")} placeholder="메모" />
                  </TableCell>
                  <TableCell className="px-x2 py-x2">
                    <div className="flex items-center justify-end gap-x0_5">
                      <IconAction label="저장" tone="positive" onClick={() => saveInlineEdit(s)} disabled={pending}>
                        <Check className="size-4" />
                      </IconAction>
                      <IconAction label="취소" onClick={() => setEditId(null)}>
                        <X className="size-4" />
                      </IconAction>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={s.id}>
                  <TableCell className="t4-medium">{s.subject}</TableCell>
                  <TableCell className="text-right">{s.rawScore != null ? `${s.rawScore}점` : <span className="text-fg-placeholder">—</span>}</TableCell>
                  <TableCell className="text-right">
                    {s.grade ? <GradeText grade={s.grade} /> : <span className="text-fg-placeholder">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-fg-neutral-muted">{s.percentile != null ? `${s.percentile}%` : "—"}</TableCell>
                  <TableCell className="t3-regular text-fg-neutral-muted">{s.notes || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-x0_5">
                      <IconAction label={`${s.subject} 성적 수정`} onClick={() => startInlineEdit(s)}>
                        <Pencil className="size-4" />
                      </IconAction>
                      {onDelete && (
                        <IconAction label={`${s.subject} 성적 삭제`} tone="critical" onClick={() => onDelete(s)}>
                          <Trash2 className="size-4" />
                        </IconAction>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      ))}
    </div>
  );
}

export function ExamScoreChart({ studentId, initialScores }: Props) {
  const [scores, setScores] = useState<ExamScore[]>(initialScores);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [filterType, setFilterType] = useState<ExamType | "ALL">("ALL");
  const [filterSubject, setFilterSubject] = useState<string>("국어");
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  // 삭제 확인 대상
  const [deleteTarget, setDeleteTarget] = useState<ExamScore | null>(null);

  const [form, setForm] = useState({
    examType: "OFFICIAL_MOCK" as ExamType,
    examName: "",
    examDate: "",
    subject: "",
    rawScore: "",
    grade: "",
    percentile: "",
    notes: "",
  });

  const filtered = scores.filter((s) => {
    const typeOk = filterType === "ALL" || s.examType === filterType;
    const subjectOk = s.subject === filterSubject;
    return typeOk && subjectOk;
  });

  // 성적 목록 테이블용 정렬 상태 (기본: 날짜 내림차순)
  const tableDefaultSorted = [...filtered].sort(
    (a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime()
  );
  const { rows: sortedForTable, sort: tableSort, toggle: tableToggle } = useSortableTable(tableDefaultSorted, {
    examDate: (s: ExamScore) => new Date(s.examDate).getTime(),
    examName: (s: ExamScore) => s.examName,
    examType: (s: ExamScore) => s.examType,
    subject: (s: ExamScore) => s.subject,
    rawScore: (s: ExamScore) => s.rawScore ?? -Infinity,
    grade: (s: ExamScore) => s.grade ?? -Infinity,
    percentile: (s: ExamScore) => s.percentile ?? -Infinity,
  });

  const chartData = [...filtered]
    .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime())
    .map((s) => ({
      label: fmtDate(s.examDate),
      fullLabel: `${fmtDate(s.examDate)} ${s.examName}`,
      rawScore: s.rawScore ?? undefined,
      grade: s.grade ?? undefined,
      // 막대 높이: 1등급=9(최대), 9등급=1(최소) — 높을수록 좋음을 시각적으로 표현
      gradeBar: s.grade != null ? 10 - s.grade : undefined,
      percentile: s.percentile != null ? Number(s.percentile.toFixed(1)) : undefined,
    }));

  const allSubjects = Array.from(new Set([...SUBJECTS, ...scores.map((s) => s.subject)]));

  // 최근값 & 직전값 (KPI 카드용)
  const last = chartData[chartData.length - 1];
  const prev = chartData[chartData.length - 2];

  function handleAdd() {
    if (!form.examName || !form.examDate) {
      toast.error("시험명과 날짜는 필수입니다");
      return;
    }
    startTransition(async () => {
      try {
        const created = await createExamScore({
          studentId,
          examType: form.examType,
          examName: form.examName,
          examDate: form.examDate,
          subject: form.subject,
          rawScore: form.rawScore ? parseInt(form.rawScore) : undefined,
          grade: form.grade ? parseInt(form.grade) : undefined,
          percentile: form.percentile ? parseFloat(form.percentile) : undefined,
          notes: form.notes || undefined,
        });
        setScores((prev) => [created, ...prev]);
        setForm({ examType: "OFFICIAL_MOCK", examName: "", examDate: "", subject: "", rawScore: "", grade: "", percentile: "", notes: "" });
        setShowForm(false);
        toast.success("성적이 등록되었습니다");
      } catch {
        toast.error("등록 실패");
      }
    });
  }

  // 수정 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    examType: "" as ExamType, examName: "", examDate: "", subject: "",
    rawScore: "", grade: "", percentile: "", notes: "",
  });

  function startEdit(s: ExamScore) {
    setEditingId(s.id);
    setEditForm({
      examType: s.examType,
      examName: s.examName,
      examDate: new Date(s.examDate).toISOString().split("T")[0],
      subject: s.subject,
      rawScore: s.rawScore?.toString() ?? "",
      grade: s.grade?.toString() ?? "",
      percentile: s.percentile?.toString() ?? "",
      notes: s.notes ?? "",
    });
  }

  function handleUpdate() {
    if (!editingId || !editForm.examName || !editForm.examDate) {
      toast.error("시험명과 날짜는 필수입니다");
      return;
    }
    startTransition(async () => {
      try {
        const updated = await updateExamScore(editingId, {
          studentId,
          examType: editForm.examType,
          examName: editForm.examName,
          examDate: editForm.examDate,
          subject: editForm.subject,
          rawScore: editForm.rawScore ? parseInt(editForm.rawScore) : undefined,
          grade: editForm.grade ? parseInt(editForm.grade) : undefined,
          percentile: editForm.percentile ? parseFloat(editForm.percentile) : undefined,
          notes: editForm.notes || undefined,
        });
        setScores((prev) => prev.map((s) => s.id === editingId ? updated : s));
        setEditingId(null);
        toast.success("수정되었습니다");
      } catch {
        toast.error("수정 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteExamScore(id, studentId);
        setScores((prev) => prev.filter((s) => s.id !== id));
        setDeleteTarget(null);
        toast.success("삭제되었습니다");
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  const typeLabel = filterType === "ALL" ? "전체 유형" : EXAM_TYPE_LABELS[filterType];
  const mode = viewMode === "table" ? "exam" : "trend";
  const existing = scores.filter((s) => s.examType === form.examType);

  return (
    <div className="flex flex-col gap-x4">
      {/* 시험 유형 필터 + 성적 등록 */}
      <div className="flex flex-wrap items-center gap-x2">
        <div className="flex flex-wrap gap-x1_5" role="group" aria-label="시험 유형">
          {([["ALL", "전체"], ...EXAM_TYPES.map((t) => [t, EXAM_TYPE_LABELS[t]])] as [string, string][]).map(([v, label]) => (
            <FilterChip key={v} selected={filterType === v} onClick={() => setFilterType(v as ExamType | "ALL")}>
              {label}
            </FilterChip>
          ))}
        </div>
        <Button
          size="sm"
          variant={showForm ? "secondary" : "default"}
          className="ml-auto"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? <X /> : <Plus />}
          {showForm ? "등록 닫기" : "성적 등록"}
        </Button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <Section title="성적 등록" description="시험명과 날짜는 꼭 입력해 주세요. 과목마다 한 건씩 등록해요.">
          <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="시험 유형" htmlFor="exam-form-type">
              <select
                id="exam-form-type"
                value={form.examType}
                onChange={(e) => setForm((f) => ({ ...f, examType: e.target.value as ExamType }))}
                className={fieldInput}
              >
                {EXAM_TYPES.map((t) => <option key={t} value={t}>{EXAM_TYPE_LABELS[t]}</option>)}
              </select>
            </FormField>
            <FormField label="시험명" htmlFor="exam-form-name" required>
              <input
                id="exam-form-name"
                type="text" placeholder="6월 모의고사" value={form.examName}
                onChange={(e) => setForm((f) => ({ ...f, examName: e.target.value }))}
                className={fieldInput}
              />
            </FormField>
            <FormField label="날짜" required>
              <DatePicker value={form.examDate || null} onChange={(d) => setForm((f) => ({ ...f, examDate: d ?? "" }))} placeholder="날짜 선택" />
            </FormField>
            <FormField label="과목" htmlFor="exam-form-subject">
              <select
                id="exam-form-subject"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                className={fieldInput}
              >
                <option value="">과목 선택</option>
                <optgroup label="공통">
                  <option value="국어">국어</option>
                  <option value="수학">수학</option>
                  <option value="영어">영어</option>
                  <option value="한국사">한국사</option>
                  <option value="사회">사회</option>
                  <option value="과학">과학</option>
                </optgroup>
                <optgroup label="사회탐구">
                  <option value="생활과윤리">생활과윤리</option>
                  <option value="윤리와사상">윤리와사상</option>
                  <option value="한국지리">한국지리</option>
                  <option value="세계지리">세계지리</option>
                  <option value="동아시아사">동아시아사</option>
                  <option value="세계사">세계사</option>
                  <option value="경제">경제</option>
                  <option value="정치와법">정치와법</option>
                  <option value="사회·문화">사회·문화</option>
                </optgroup>
                <optgroup label="과학탐구">
                  <option value="물리학Ⅰ">물리학Ⅰ</option>
                  <option value="물리학Ⅱ">물리학Ⅱ</option>
                  <option value="화학Ⅰ">화학Ⅰ</option>
                  <option value="화학Ⅱ">화학Ⅱ</option>
                  <option value="생명과학Ⅰ">생명과학Ⅰ</option>
                  <option value="생명과학Ⅱ">생명과학Ⅱ</option>
                  <option value="지구과학Ⅰ">지구과학Ⅰ</option>
                  <option value="지구과학Ⅱ">지구과학Ⅱ</option>
                </optgroup>
                <optgroup label="기타">
                  <option value="직업탐구">직업탐구</option>
                  <option value="제2외국어">제2외국어</option>
                </optgroup>
              </select>
            </FormField>
            <FormField label="원점수" htmlFor="exam-form-raw">
              <input
                id="exam-form-raw"
                type="number" placeholder="0~100" min={0} max={100} value={form.rawScore}
                onChange={(e) => setForm((f) => ({ ...f, rawScore: e.target.value }))}
                className={fieldInput}
              />
            </FormField>
            <FormField label="등급" htmlFor="exam-form-grade">
              <input
                id="exam-form-grade"
                type="number" placeholder="1~9" min={1} max={9} value={form.grade}
                onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                className={fieldInput}
              />
            </FormField>
            <FormField label="백분위" htmlFor="exam-form-pct">
              <input
                id="exam-form-pct"
                type="number" placeholder="0~100" min={0} max={100} step={0.1} value={form.percentile}
                onChange={(e) => setForm((f) => ({ ...f, percentile: e.target.value }))}
                className={fieldInput}
              />
            </FormField>
            <FormField label="메모" htmlFor="exam-form-notes">
              <input
                id="exam-form-notes"
                type="text" placeholder="특이사항..." value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={fieldInput}
              />
            </FormField>
          </div>
          <FormActions className="mt-x4">
            <Button variant="ghost" onClick={() => setShowForm(false)}>취소</Button>
            <Button onClick={handleAdd} disabled={isPending}>{isPending ? "등록 중…" : "등록"}</Button>
          </FormActions>

          {/* 선택된 시험유형의 기존 성적 */}
          {existing.length > 0 && (
            <div className="mt-x5 border-t border-stroke-neutral-muted pt-x4">
              <p className="mb-x2 t3-medium text-fg-neutral-subtle">
                {EXAM_TYPE_LABELS[form.examType]} 기존 성적 <span className="tabular-nums">{existing.length}건</span>
              </p>
              <div className="max-h-48 overflow-y-auto rounded-r3 border border-stroke-neutral-muted">
                <table className="w-full border-collapse t3-regular text-fg-neutral tabular-nums">
                  <thead>
                    <tr>
                      {["시험명", "날짜", "과목", "원점수", "등급", "백분위"].map((h, i) => (
                        <th
                          key={h}
                          className={cn(
                            "sticky top-0 border-b border-stroke-neutral-muted bg-bg-layer-fill px-x3 py-x1_5 t3-medium text-fg-neutral-subtle",
                            i >= 3 ? "text-right" : "text-left",
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {existing
                      .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime())
                      .map((s) => (
                      <tr key={s.id} className="border-b border-stroke-neutral-muted last:border-0">
                        <td className="px-x3 py-x1_5">{s.examName}</td>
                        <td className="px-x3 py-x1_5 text-fg-neutral-muted">{fmtDate(s.examDate)}</td>
                        <td className="px-x3 py-x1_5">{s.subject}</td>
                        <td className="px-x3 py-x1_5 text-right">{s.rawScore ?? "-"}</td>
                        <td className="px-x3 py-x1_5 text-right">{s.grade ?? "-"}</td>
                        <td className="px-x3 py-x1_5 text-right">{s.percentile ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* 보기 전환: 시험별 성적표 / 과목별 추이 */}
      <div className="flex flex-wrap items-center justify-between gap-x3">
        <Tabs
          value={mode}
          onValueChange={(v) => setViewMode(v === "exam" ? "table" : "all")}
        >
          <TabsList variant="segment" aria-label="성적 보기 방식">
            <TabsTrigger value="exam">시험별 성적표</TabsTrigger>
            <TabsTrigger value="trend">과목별 추이</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === "trend" && (
          <label className="flex items-center gap-x2">
            <span className="t3-medium text-fg-neutral-subtle">과목</span>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className={cn(inputBaseClass, "h-9 w-auto px-x3 t4-regular")}
            >
              {allSubjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* 시험별 전체 과목 테이블 뷰 */}
      {viewMode === "table" && (
        <ExamTableView
          scores={scores}
          filterType={filterType}
          studentId={studentId}
          onUpdate={(updated) => setScores((prev) => prev.map((s) => s.id === updated.id ? updated : s))}
          onDelete={(s) => setDeleteTarget(s)}
        />
      )}

      {/* 과목별 추이 */}
      {viewMode !== "table" && (
        <Section
          title={`${filterSubject} 성적 추이`}
          description={`${typeLabel} · ${chartData.length}회 응시`}
          actions={
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList variant="segment" aria-label="지표">
                <TabsTrigger value="all">요약</TabsTrigger>
                <TabsTrigger value="rawScore">원점수</TabsTrigger>
                <TabsTrigger value="grade">등급</TabsTrigger>
                <TabsTrigger value="percentile">백분위</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          {chartData.length === 0 ? (
            <EmptyState
              compact
              icon={ChartNoAxesColumn}
              title={`${filterSubject} 과목 데이터가 없어요`}
              description="다른 과목이나 시험 유형을 골라 보세요."
            />
          ) : (
            <>
              {/* 요약 — 지표 3개 + 스파크라인 */}
              {viewMode === "all" && (
                <div className="grid grid-cols-1 gap-x3 sm:grid-cols-3">
                  <div className="rounded-r3 bg-bg-layer-fill p-x4">
                    <p className="t3-medium text-fg-neutral-subtle">원점수</p>
                    <p className="mt-x1 flex items-baseline gap-x0_5">
                      <span className="t8-bold tabular-nums text-fg-neutral">{last?.rawScore != null ? last.rawScore : "—"}</span>
                      {last?.rawScore != null && <span className="t4-medium text-fg-neutral-subtle">점</span>}
                    </p>
                    <Trend current={last?.rawScore} prev={prev?.rawScore} />
                    <div className="mt-x3 h-14">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                          <YAxis domain={[0, 100]} hide />
                          <Area type="monotone" dataKey="rawScore" stroke={SERIES.rawScore} strokeWidth={2} fill={SERIES.rawScore} fillOpacity={0.1} dot={false} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-r3 bg-bg-layer-fill p-x4">
                    <p className="t3-medium text-fg-neutral-subtle">등급</p>
                    <p className="mt-x1 flex items-baseline gap-x0_5">
                      <span className={cn("t8-bold tabular-nums", last?.grade ? TONE_TEXT[gradeTone(last.grade)] : "text-fg-neutral")}>
                        {last?.grade != null ? last.grade : "—"}
                      </span>
                      {last?.grade != null && <span className="t4-medium text-fg-neutral-subtle">등급</span>}
                    </p>
                    <GradeTrend current={last?.grade} prev={prev?.grade} />
                    <div className="mt-x3 h-14">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barSize={8}>
                          <YAxis domain={[0, 9]} hide />
                          <Bar dataKey="gradeBar" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                            {chartData.map((d, i) => (
                              <Cell key={i} fill={gradeFill(d.grade)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-r3 bg-bg-layer-fill p-x4">
                    <p className="t3-medium text-fg-neutral-subtle">백분위</p>
                    <p className="mt-x1 flex items-baseline gap-x0_5">
                      <span className="t8-bold tabular-nums text-fg-neutral">{last?.percentile != null ? last.percentile : "—"}</span>
                      {last?.percentile != null && <span className="t4-medium text-fg-neutral-subtle">%</span>}
                    </p>
                    <Trend current={last?.percentile} prev={prev?.percentile} />
                    <div className="mt-x3 h-14">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                          <YAxis domain={[0, 100]} hide />
                          <Area type="monotone" dataKey="percentile" stroke={SERIES.percentile} strokeWidth={2} fill={SERIES.percentile} fillOpacity={0.1} dot={false} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* 원점수 */}
              {viewMode === "rawScore" && (() => {
                const domain = dynDomain(chartData.map(d => d.rawScore), 0, 100, 10);
                return (
                  <>
                    {last?.rawScore != null && (
                      <Headline label="최근 원점수" value={last.rawScore} unit="점" trend={<Trend current={last.rawScore} prev={prev?.rawScore} />} />
                    )}
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barSize={28}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                        <YAxis
                          domain={domain} tick={AXIS_TICK} tickLine={false} axisLine={false} width={28}
                          tickFormatter={(v) => `${v}`}
                        />
                        <Tooltip
                          {...TOOLTIP}
                          cursor={BAR_CURSOR}
                          formatter={(v) => [`${v}점`, "원점수"]}
                          labelFormatter={(l, p) => p[0]?.payload?.fullLabel ?? l}
                        />
                        <Bar dataKey="rawScore" name="원점수" fill={SERIES.rawScore} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                );
              })()}

              {/* 등급 */}
              {viewMode === "grade" && (() => {
                const gradeBarVals = chartData.map(d => d.gradeBar);
                const domain = dynDomain(gradeBarVals, 0, 9, 1);
                // Y축 tick: domain 안의 gradeBar 정수값만, 라벨은 실제 등급
                const ticks = Array.from({ length: 9 }, (_, i) => i + 1)
                  .filter(v => v >= domain[0] && v <= domain[1]);
                return (
                  <>
                    {last?.grade != null && (
                      <Headline
                        label="최근 등급 · 막대가 높을수록 좋아요"
                        value={last.grade}
                        unit="등급"
                        valueClass={TONE_TEXT[gradeTone(last.grade)]}
                        trend={<GradeTrend current={last.grade} prev={prev?.grade} />}
                      />
                    )}
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barSize={28}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                        <YAxis
                          domain={domain}
                          ticks={ticks}
                          tick={AXIS_TICK} tickLine={false} axisLine={false} width={40}
                          tickFormatter={(v) => `${10 - v}등급`}
                        />
                        <Tooltip
                          {...TOOLTIP}
                          cursor={BAR_CURSOR}
                          formatter={(_v, _n, item) => [`${item.payload.grade}등급`, "등급"]}
                          labelFormatter={(l, p) => p[0]?.payload?.fullLabel ?? l}
                        />
                        <Bar dataKey="gradeBar" name="등급" radius={[4, 4, 0, 0]}>
                          {chartData.map((d, i) => (
                            <Cell key={i} fill={gradeFill(d.grade)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {/* 등급 범례 */}
                    <div className="mt-x3 flex flex-wrap items-center gap-x4">
                      {GRADE_LEGEND.map((c) => (
                        <span key={c.label} className="flex items-center gap-x1_5 t3-regular text-fg-neutral-muted">
                          <span aria-hidden className="inline-block size-2.5 rounded-r0_5" style={{ background: GRADE_FILL[c.tone] }} />
                          {c.label}
                        </span>
                      ))}
                    </div>
                  </>
                );
              })()}

              {/* 백분위 */}
              {viewMode === "percentile" && (() => {
                const domain = dynDomain(chartData.map(d => d.percentile), 0, 100, 10);
                return (
                  <>
                    {last?.percentile != null && (
                      <Headline label="최근 백분위" value={last.percentile} unit="%" trend={<Trend current={last.percentile} prev={prev?.percentile} />} />
                    )}
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                        <YAxis
                          domain={domain} tick={AXIS_TICK} tickLine={false} axisLine={false} width={36}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          {...TOOLTIP}
                          cursor={LINE_CURSOR}
                          formatter={(v) => [`${v}%`, "백분위"]}
                          labelFormatter={(l, p) => p[0]?.payload?.fullLabel ?? l}
                        />
                        <Area
                          type="monotone" dataKey="percentile" name="백분위"
                          stroke={SERIES.percentile} strokeWidth={2}
                          fill={SERIES.percentile} fillOpacity={0.1}
                          dot={{ r: 4, fill: SERIES.percentile, strokeWidth: 2, stroke: SURFACE }}
                          activeDot={{ r: 6, fill: SERIES.percentile, strokeWidth: 2, stroke: SURFACE }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </>
                );
              })()}
            </>
          )}
        </Section>
      )}

      {/* 성적 목록 테이블 */}
      {viewMode !== "table" && filtered.length > 0 && (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead sortKey="examDate" activeKey={tableSort?.key} dir={tableSort?.dir} onToggle={tableToggle}>날짜</SortHead>
                <SortHead sortKey="examName" activeKey={tableSort?.key} dir={tableSort?.dir} onToggle={tableToggle}>시험명</SortHead>
                <SortHead sortKey="examType" activeKey={tableSort?.key} dir={tableSort?.dir} onToggle={tableToggle}>유형</SortHead>
                <SortHead sortKey="subject" activeKey={tableSort?.key} dir={tableSort?.dir} onToggle={tableToggle}>과목</SortHead>
                <SortHead sortKey="rawScore" activeKey={tableSort?.key} dir={tableSort?.dir} onToggle={tableToggle} align="right">원점수</SortHead>
                <TableHead>메모</TableHead>
                <SortHead sortKey="grade" activeKey={tableSort?.key} dir={tableSort?.dir} onToggle={tableToggle} align="right">등급</SortHead>
                <SortHead sortKey="percentile" activeKey={tableSort?.key} dir={tableSort?.dir} onToggle={tableToggle} align="right">백분위</SortHead>
                <TableHead className="w-20"><span className="sr-only">관리</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedForTable.map((s) => editingId === s.id ? (
                  <TableRow key={s.id} className="bg-bg-layer-fill hover:bg-bg-layer-fill">
                    <TableCell className="px-x2 py-x2">
                      <input type="date" value={editForm.examDate} aria-label="날짜" onChange={(e) => setEditForm((f) => ({ ...f, examDate: e.target.value }))}
                        className={cn(cellInput, "w-full")} />
                    </TableCell>
                    <TableCell className="px-x2 py-x2">
                      <input type="text" value={editForm.examName} aria-label="시험명" onChange={(e) => setEditForm((f) => ({ ...f, examName: e.target.value }))}
                        className={cn(cellInput, "w-full min-w-28")} />
                    </TableCell>
                    <TableCell className="px-x2 py-x2">
                      <select value={editForm.examType} aria-label="시험 유형" onChange={(e) => setEditForm((f) => ({ ...f, examType: e.target.value as ExamType }))}
                        className={cellSelect}>
                        {EXAM_TYPES.map((t) => <option key={t} value={t}>{EXAM_TYPE_LABELS[t]}</option>)}
                      </select>
                    </TableCell>
                    <TableCell className="px-x2 py-x2">
                      <select value={editForm.subject} aria-label="과목" onChange={(e) => setEditForm((f) => ({ ...f, subject: e.target.value }))}
                        className={cellSelect}>
                        {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </TableCell>
                    <TableCell className="px-x2 py-x2 text-right">
                      <input type="number" value={editForm.rawScore} min={0} max={100} aria-label="원점수"
                        onChange={(e) => setEditForm((f) => ({ ...f, rawScore: e.target.value }))}
                        className={cn(cellInput, "w-16 text-right")} />
                    </TableCell>
                    <TableCell className="px-x2 py-x2">
                      <input type="text" value={editForm.notes} aria-label="메모" onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                        className={cn(cellInput, "w-full min-w-24")} placeholder="메모" />
                    </TableCell>
                    <TableCell className="px-x2 py-x2 text-right">
                      <input type="number" value={editForm.grade} min={1} max={9} aria-label="등급"
                        onChange={(e) => setEditForm((f) => ({ ...f, grade: e.target.value }))}
                        className={cn(cellInput, "w-14 text-right")} />
                    </TableCell>
                    <TableCell className="px-x2 py-x2 text-right">
                      <input type="number" value={editForm.percentile} step={0.1} aria-label="백분위"
                        onChange={(e) => setEditForm((f) => ({ ...f, percentile: e.target.value }))}
                        className={cn(cellInput, "w-16 text-right")} />
                    </TableCell>
                    <TableCell className="px-x2 py-x2">
                      <div className="flex items-center justify-end gap-x0_5">
                        <IconAction label="저장" tone="positive" onClick={handleUpdate} disabled={isPending}>
                          <Check className="size-4" />
                        </IconAction>
                        <IconAction label="취소" onClick={() => setEditingId(null)}>
                          <X className="size-4" />
                        </IconAction>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap t3-regular text-fg-neutral-muted">
                      {new Date(s.examDate).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell className="t4-medium">{s.examName}</TableCell>
                    <TableCell>
                      <StatusBadge>{EXAM_TYPE_LABELS[s.examType]}</StatusBadge>
                    </TableCell>
                    <TableCell>{s.subject}</TableCell>
                    <TableCell className="text-right t4-medium">
                      {s.rawScore != null ? `${s.rawScore}점` : <span className="text-fg-placeholder">—</span>}
                    </TableCell>
                    <TableCell>
                      {s.notes ? (
                        <span className="block max-w-[140px] truncate t3-regular text-fg-neutral-muted" title={s.notes}>{s.notes}</span>
                      ) : <span className="text-fg-placeholder">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.grade ? <GradeText grade={s.grade} /> : <span className="text-fg-placeholder">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-fg-neutral-muted">
                      {s.percentile != null ? `${s.percentile}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-x0_5">
                        <IconAction label={`${s.examName} ${s.subject} 수정`} onClick={() => startEdit(s)} disabled={isPending}>
                          <Pencil className="size-4" />
                        </IconAction>
                        <IconAction label={`${s.examName} ${s.subject} 삭제`} tone="critical" onClick={() => setDeleteTarget(s)} disabled={isPending}>
                          <Trash2 className="size-4" />
                        </IconAction>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {/* 삭제 확인 */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !isPending && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>성적을 삭제할까요?</DialogTitle>
            <DialogDescription>
              {deleteTarget && `${deleteTarget.examName} · ${deleteTarget.subject} 성적이 사라지고 되돌릴 수 없어요.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isPending}>취소</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget.id)} disabled={isPending}>
              {isPending ? "삭제 중…" : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
