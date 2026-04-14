"use client";

import { useState, useTransition } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { createExamScore, updateExamScore, deleteExamScore } from "@/actions/exam-scores";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { Trash2, Plus, TrendingUp, TrendingDown, Minus, Pencil, Check, X } from "lucide-react";
import type { ExamScore, ExamType } from "@/generated/prisma";

interface Props {
  studentId: string;
  initialScores: ExamScore[];
}

type ViewMode = "all" | "rawScore" | "grade" | "percentile" | "table";

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  OFFICIAL_MOCK: "공식 모의고사",
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
const EXAM_TYPES: ExamType[] = ["OFFICIAL_MOCK", "PRIVATE_MOCK", "SCHOOL_EXAM"];

function fmtDate(d: Date | string) {
  const dt = new Date(d);
  return `${dt.getFullYear().toString().slice(2)}.${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function gradeColor(g: number) {
  if (g <= 2) return "#3B82F6";
  if (g <= 4) return "#10B981";
  if (g <= 6) return "#F59E0B";
  return "#EF4444";
}

const DARK_TOOLTIP = {
  contentStyle: {
    background: "#1e293b",
    border: "none",
    borderRadius: "8px",
    color: "white",
    fontSize: 12,
    padding: "8px 12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#94a3b8", fontSize: 11, marginBottom: 4 },
  cursor: { stroke: "#e2e8f0", strokeWidth: 1, strokeDasharray: "4 4" },
};

// 차트 공통 axis 스타일
const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" };

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
  if (current == null || prev == null) return <span className="text-muted-foreground text-xs">—</span>;
  const diff = current - prev;
  if (diff > 0) return (
    <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-medium">
      <TrendingUp className="h-3 w-3" /> +{diff.toFixed(1)}
    </span>
  );
  if (diff < 0) return (
    <span className="flex items-center gap-0.5 text-red-500 text-xs font-medium">
      <TrendingDown className="h-3 w-3" /> {diff.toFixed(1)}
    </span>
  );
  return <span className="flex items-center gap-0.5 text-muted-foreground text-xs"><Minus className="h-3 w-3" /> 0</span>;
}

function ExamTableView({ scores, filterType, onEdit, onDelete }: {
  scores: ExamScore[];
  filterType: ExamType | "ALL";
  onEdit?: (score: ExamScore) => void;
  onDelete?: (id: string) => void;
}) {
  const typeScores = filterType === "ALL" ? scores : scores.filter((s) => s.examType === filterType);
  const examGroups = new Map<string, { examName: string; examDate: Date; examType: ExamType; scores: ExamScore[] }>();
  for (const s of typeScores) {
    const key = `${s.examName}_${new Date(s.examDate).toISOString().slice(0, 10)}`;
    if (!examGroups.has(key)) examGroups.set(key, { examName: s.examName, examDate: new Date(s.examDate), examType: s.examType, scores: [] });
    examGroups.get(key)!.scores.push(s);
  }
  const groups = [...examGroups.values()].sort((a, b) => b.examDate.getTime() - a.examDate.getTime());
  const allSubjects = [...new Set(typeScores.map((s) => s.subject))].sort();

  if (groups.length === 0) return (
    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground border rounded-lg bg-muted/20">
      {filterType === "ALL" ? "성적" : EXAM_TYPE_LABELS[filterType]} 데이터가 없습니다
    </div>
  );

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={`${g.examName}_${g.examDate.toISOString()}`} className="rounded-lg border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 flex items-center gap-2 border-b">
            <span className="font-medium text-sm">{g.examName}</span>
            <span className="text-xs text-muted-foreground">{new Date(g.examDate).toLocaleDateString("ko-KR")}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{EXAM_TYPE_LABELS[g.examType]}</span>
            <span className="text-xs text-muted-foreground ml-auto">{g.scores.length}과목</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b bg-muted/20">
                <th className="px-3 py-2 text-left font-medium">과목</th>
                <th className="px-3 py-2 text-right font-medium">원점수</th>
                <th className="px-3 py-2 text-right font-medium">등급</th>
                <th className="px-3 py-2 text-right font-medium">백분위</th>
                <th className="px-3 py-2 text-left font-medium">메모</th>
                {(onEdit || onDelete) && <th className="px-3 py-2 w-16"></th>}
              </tr>
            </thead>
            <tbody>
              {g.scores
                .sort((a, b) => allSubjects.indexOf(a.subject) - allSubjects.indexOf(b.subject))
                .map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{s.subject}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.rawScore != null ? `${s.rawScore}점` : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {s.grade ? <span className="font-bold tabular-nums" style={{ color: gradeColor(s.grade) }}>{s.grade}등급</span> : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.percentile != null ? `${s.percentile}%` : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s.notes || "—"}</td>
                  {(onEdit || onDelete) && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {onEdit && (
                          <button onClick={() => onEdit(s)} className="text-muted-foreground/50 hover:text-blue-600 transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {onDelete && (
                          <button onClick={() => onDelete(s.id)} className="text-muted-foreground/50 hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        toast.success("삭제되었습니다");
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  const VIEW_MODES: { key: ViewMode; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "rawScore", label: "원점수" },
    { key: "grade", label: "등급" },
    { key: "percentile", label: "백분위" },
    { key: "table", label: "시험별 전체 과목" },
  ];

  return (
    <div className="space-y-4">
      {/* 필터 행 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0">시험 유형</span>
          <div className="flex gap-1 flex-wrap">
            {([["ALL", "전체"], ...EXAM_TYPES.map((t) => [t, EXAM_TYPE_LABELS[t]])] as [string, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFilterType(v as ExamType | "ALL")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md font-medium border transition-colors",
                  filterType === v
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">과목</span>
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            >
              {allSubjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 shrink-0"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            성적 등록
          </Button>
        </div>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
          <p className="text-sm font-medium">성적 등록</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">시험 유형</label>
              <select
                value={form.examType}
                onChange={(e) => setForm((f) => ({ ...f, examType: e.target.value as ExamType }))}
                className="w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              >
                {EXAM_TYPES.map((t) => <option key={t} value={t}>{EXAM_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">시험명 *</label>
              <input
                type="text" placeholder="6월 모의고사" value={form.examName}
                onChange={(e) => setForm((f) => ({ ...f, examName: e.target.value }))}
                className="w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">날짜 *</label>
              <DatePicker value={form.examDate || null} onChange={(d) => setForm((f) => ({ ...f, examDate: d ?? "" }))} placeholder="날짜 선택" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">과목</label>
              <select
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                className="w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
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
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">원점수</label>
              <input
                type="number" placeholder="0~100" min={0} max={100} value={form.rawScore}
                onChange={(e) => setForm((f) => ({ ...f, rawScore: e.target.value }))}
                className="w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">등급</label>
              <input
                type="number" placeholder="1~9" min={1} max={9} value={form.grade}
                onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                className="w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">백분위</label>
              <input
                type="number" placeholder="0~100" min={0} max={100} step={0.1} value={form.percentile}
                onChange={(e) => setForm((f) => ({ ...f, percentile: e.target.value }))}
                className="w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground">메모</label>
              <input
                type="text" placeholder="특이사항..." value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(false)}>취소</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={isPending}>등록</Button>
          </div>

          {/* 선택된 시험유형의 기존 성적 */}
          {(() => {
            const existing = scores.filter((s) => s.examType === form.examType);
            if (existing.length === 0) return null;
            return (
              <div className="mt-3 border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  {EXAM_TYPE_LABELS[form.examType]} 기존 성적 ({existing.length}건)
                </p>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-1 px-1">시험명</th>
                        <th className="text-left py-1 px-1">날짜</th>
                        <th className="text-left py-1 px-1">과목</th>
                        <th className="text-right py-1 px-1">원점수</th>
                        <th className="text-right py-1 px-1">등급</th>
                        <th className="text-right py-1 px-1">백분위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existing
                        .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime())
                        .map((s) => (
                        <tr key={s.id} className="border-b border-dashed last:border-0">
                          <td className="py-1 px-1">{s.examName}</td>
                          <td className="py-1 px-1">{fmtDate(s.examDate)}</td>
                          <td className="py-1 px-1">{s.subject}</td>
                          <td className="text-right py-1 px-1">{s.rawScore ?? "-"}</td>
                          <td className="text-right py-1 px-1">{s.grade ?? "-"}</td>
                          <td className="text-right py-1 px-1">{s.percentile ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 뷰 탭 */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {VIEW_MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setViewMode(m.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150",
              viewMode === m.key
                ? "bg-card text-foreground shadow-[0_1px_3px_0_rgb(0,0,0,0.08)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 시험별 전체 과목 테이블 뷰 */}
      {viewMode === "table" && <ExamTableView scores={scores} filterType={filterType} onEdit={(s) => { startEdit(s); setViewMode("all"); setFilterSubject(s.subject); }} onDelete={handleDelete} />}

      {/* 데이터 없음 */}
      {chartData.length === 0 && viewMode !== "table" ? (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground border rounded-lg bg-muted/20">
          {filterSubject} 과목 데이터가 없습니다
        </div>
      ) : viewMode !== "table" ? (
        <>
          {/* 전체 뷰 — KPI 카드 3개 + 스파크라인 */}
          {viewMode === "all" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {/* 원점수 카드 */}
                <div className="rounded-lg border bg-card p-4 shadow-[0_1px_4px_0_rgb(0,0,0,0.06)]">
                  <p className="text-xs text-muted-foreground mb-1">원점수</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold tracking-tight">
                        {last?.rawScore != null ? last.rawScore : "—"}
                        {last?.rawScore != null && <span className="text-sm font-normal text-muted-foreground ml-0.5">점</span>}
                      </p>
                      <Trend current={last?.rawScore} prev={prev?.rawScore} />
                    </div>
                  </div>
                  <div className="mt-3 h-14">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
                        <defs>
                          <linearGradient id="g-raw-mini" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <YAxis domain={[0, 100]} hide />
                        <Area type="monotone" dataKey="rawScore" stroke="#3B82F6" strokeWidth={1.5} fill="url(#g-raw-mini)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 등급 카드 */}
                <div className="rounded-lg border bg-card p-4 shadow-[0_1px_4px_0_rgb(0,0,0,0.06)]">
                  <p className="text-xs text-muted-foreground mb-1">등급</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold tracking-tight" style={{ color: last?.grade ? gradeColor(last.grade) : undefined }}>
                        {last?.grade != null ? last.grade : "—"}
                        {last?.grade != null && <span className="text-sm font-normal text-muted-foreground ml-0.5">등급</span>}
                      </p>
                      {/* 등급은 낮을수록 좋으므로 부호 반전 */}
                      {last?.grade != null && prev?.grade != null ? (
                        <span className={cn("flex items-center gap-0.5 text-xs font-medium",
                          last.grade < prev.grade ? "text-emerald-600" : last.grade > prev.grade ? "text-red-500" : "text-muted-foreground"
                        )}>
                          {last.grade < prev.grade
                            ? <><TrendingUp className="h-3 w-3" /> {prev.grade - last.grade}등급 향상</>
                            : last.grade > prev.grade
                            ? <><TrendingDown className="h-3 w-3" /> {last.grade - prev.grade}등급 하락</>
                            : <><Minus className="h-3 w-3" /> 유지</>}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </div>
                  </div>
                  <div className="mt-3 h-14">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 2, right: 2, left: -30, bottom: 0 }} barSize={8}>
                        <YAxis domain={[0, 9]} hide />
                        <Bar dataKey="gradeBar" radius={[2, 2, 0, 0]}>
                          {chartData.map((d, i) => (
                            <Cell key={i} fill={d.grade ? gradeColor(d.grade) : "#e2e8f0"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 백분위 카드 */}
                <div className="rounded-lg border bg-card p-4 shadow-[0_1px_4px_0_rgb(0,0,0,0.06)]">
                  <p className="text-xs text-muted-foreground mb-1">백분위</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold tracking-tight">
                        {last?.percentile != null ? last.percentile : "—"}
                        {last?.percentile != null && <span className="text-sm font-normal text-muted-foreground ml-0.5">%</span>}
                      </p>
                      <Trend current={last?.percentile} prev={prev?.percentile} />
                    </div>
                  </div>
                  <div className="mt-3 h-14">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
                        <defs>
                          <linearGradient id="g-pct-mini" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <YAxis domain={[0, 100]} hide />
                        <Area type="monotone" dataKey="percentile" stroke="#8B5CF6" strokeWidth={1.5} fill="url(#g-pct-mini)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 원점수 뷰 */}
          {viewMode === "rawScore" && (() => {
            const domain = dynDomain(chartData.map(d => d.rawScore), 0, 100, 10);
            return (
              <div className="rounded-lg border bg-card p-5 shadow-[0_1px_4px_0_rgb(0,0,0,0.06)]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold">원점수 추이</p>
                    <p className="text-xs text-muted-foreground">{filterSubject} · {filterType === "ALL" ? "전체" : EXAM_TYPE_LABELS[filterType]}</p>
                  </div>
                  {last?.rawScore != null && (
                    <div className="text-right">
                      <p className="text-xl font-bold text-blue-600">{last.rawScore}<span className="text-sm font-normal text-muted-foreground ml-0.5">점</span></p>
                      <Trend current={last.rawScore} prev={prev?.rawScore} />
                    </div>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barSize={32}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                    <YAxis
                      domain={domain} tick={AXIS_TICK} tickLine={false} axisLine={false} width={28}
                      tickFormatter={(v) => `${v}`}
                    />
                    <Tooltip
                      {...DARK_TOOLTIP}
                      formatter={(v) => [`${v}점`, "원점수"]}
                      labelFormatter={(l, p) => p[0]?.payload?.fullLabel ?? l}
                    />
                    <Bar dataKey="rawScore" name="원점수" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* 등급 뷰 */}
          {viewMode === "grade" && (() => {
            const gradeBarVals = chartData.map(d => d.gradeBar);
            const domain = dynDomain(gradeBarVals, 0, 9, 1);
            // Y축 tick: domain 안의 gradeBar 정수값만, 라벨은 실제 등급
            const ticks = Array.from({ length: 9 }, (_, i) => i + 1)
              .filter(v => v >= domain[0] && v <= domain[1]);
            return (
              <div className="rounded-lg border bg-card p-5 shadow-[0_1px_4px_0_rgb(0,0,0,0.06)]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold">등급 추이</p>
                    <p className="text-xs text-muted-foreground">{filterSubject} · {filterType === "ALL" ? "전체" : EXAM_TYPE_LABELS[filterType]} · 막대 높을수록 좋음</p>
                  </div>
                  {last?.grade != null && (
                    <div className="text-right">
                      <p className="text-xl font-bold" style={{ color: gradeColor(last.grade) }}>
                        {last.grade}<span className="text-sm font-normal text-muted-foreground ml-0.5">등급</span>
                      </p>
                      {prev?.grade != null ? (
                        <span className={cn("flex items-center gap-0.5 text-xs font-medium justify-end",
                          last.grade < prev.grade ? "text-emerald-600" : last.grade > prev.grade ? "text-red-500" : "text-muted-foreground"
                        )}>
                          {last.grade < prev.grade
                            ? <><TrendingUp className="h-3 w-3" />{prev.grade - last.grade}등급 향상</>
                            : last.grade > prev.grade
                            ? <><TrendingDown className="h-3 w-3" />{last.grade - prev.grade}등급 하락</>
                            : <><Minus className="h-3 w-3" />유지</>}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barSize={32}>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                    <YAxis
                      domain={domain}
                      ticks={ticks}
                      tick={AXIS_TICK} tickLine={false} axisLine={false} width={32}
                      tickFormatter={(v) => `${10 - v}등급`}
                    />
                    <Tooltip
                      {...DARK_TOOLTIP}
                      formatter={(_v, _n, item) => [`${item.payload.grade}등급`, "등급"]}
                      labelFormatter={(l, p) => p[0]?.payload?.fullLabel ?? l}
                    />
                    <Bar dataKey="gradeBar" name="등급" radius={[4, 4, 0, 0]}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.grade ? gradeColor(d.grade) : "#e2e8f0"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              {/* 등급 범례 */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {[
                  { label: "1~2등급", color: "#3B82F6" },
                  { label: "3~4등급", color: "#10B981" },
                  { label: "5~6등급", color: "#F59E0B" },
                  { label: "7~9등급", color: "#EF4444" },
                ].map((c) => (
                  <span key={c.label} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c.color }} />
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
            );
          })()}

          {/* 백분위 뷰 */}
          {viewMode === "percentile" && (() => {
            const domain = dynDomain(chartData.map(d => d.percentile), 0, 100, 10);
            return (
              <div className="rounded-lg border bg-card p-5 shadow-[0_1px_4px_0_rgb(0,0,0,0.06)]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold">백분위 추이</p>
                    <p className="text-xs text-muted-foreground">{filterSubject} · {filterType === "ALL" ? "전체" : EXAM_TYPE_LABELS[filterType]}</p>
                  </div>
                  {last?.percentile != null && (
                    <div className="text-right">
                      <p className="text-xl font-bold text-violet-600">{last.percentile}<span className="text-sm font-normal text-muted-foreground ml-0.5">%</span></p>
                      <Trend current={last.percentile} prev={prev?.percentile} />
                    </div>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g-pct" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="0" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                    <YAxis
                      domain={domain} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      {...DARK_TOOLTIP}
                      formatter={(v) => [`${v}%`, "백분위"]}
                      labelFormatter={(l, p) => p[0]?.payload?.fullLabel ?? l}
                    />
                    <Area
                      type="monotone" dataKey="percentile" name="백분위"
                      stroke="#8B5CF6" strokeWidth={2.5}
                      fill="url(#g-pct)"
                      dot={{ r: 4, fill: "#8B5CF6", strokeWidth: 2, stroke: "#fff" }}
                      activeDot={{ r: 6, fill: "#8B5CF6", strokeWidth: 2, stroke: "#fff" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </>
      ) : null}

      {/* 성적 목록 테이블 */}
      {viewMode !== "table" && filtered.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/40 text-xs text-muted-foreground border-b">
                <th className="px-3 py-2.5 text-left font-medium">날짜</th>
                <th className="px-3 py-2.5 text-left font-medium">시험명</th>
                <th className="px-3 py-2.5 text-left font-medium">유형</th>
                <th className="px-3 py-2.5 text-left font-medium">과목</th>
                <th className="px-3 py-2.5 text-right font-medium">원점수</th>
                <th className="px-3 py-2.5 text-left font-medium">메모</th>
                <th className="px-3 py-2.5 text-right font-medium">등급</th>
                <th className="px-3 py-2.5 text-right font-medium">백분위</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {[...filtered]
                .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime())
                .map((s) => editingId === s.id ? (
                  <tr key={s.id} className="border-t bg-blue-50/50">
                    <td className="px-2 py-1.5">
                      <input type="date" value={editForm.examDate} onChange={(e) => setEditForm((f) => ({ ...f, examDate: e.target.value }))}
                        className="w-full border rounded px-1.5 py-1 text-xs bg-background" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="text" value={editForm.examName} onChange={(e) => setEditForm((f) => ({ ...f, examName: e.target.value }))}
                        className="w-full border rounded px-1.5 py-1 text-xs bg-background" />
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={editForm.examType} onChange={(e) => setEditForm((f) => ({ ...f, examType: e.target.value as ExamType }))}
                        className="border rounded px-1 py-1 text-xs bg-background">
                        {EXAM_TYPES.map((t) => <option key={t} value={t}>{EXAM_TYPE_LABELS[t]}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={editForm.subject} onChange={(e) => setEditForm((f) => ({ ...f, subject: e.target.value }))}
                        className="border rounded px-1 py-1 text-xs bg-background">
                        {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" value={editForm.rawScore} min={0} max={100}
                        onChange={(e) => setEditForm((f) => ({ ...f, rawScore: e.target.value }))}
                        className="w-16 border rounded px-1.5 py-1 text-xs bg-background text-right" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="text" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                        className="w-full border rounded px-1.5 py-1 text-xs bg-background" placeholder="메모" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" value={editForm.grade} min={1} max={9}
                        onChange={(e) => setEditForm((f) => ({ ...f, grade: e.target.value }))}
                        className="w-14 border rounded px-1.5 py-1 text-xs bg-background text-right" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" value={editForm.percentile} step={0.1}
                        onChange={(e) => setEditForm((f) => ({ ...f, percentile: e.target.value }))}
                        className="w-16 border rounded px-1.5 py-1 text-xs bg-background text-right" />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <button onClick={handleUpdate} disabled={isPending} className="text-green-600 hover:text-green-800 transition-colors">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(s.examDate).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{s.examName}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                        {EXAM_TYPE_LABELS[s.examType]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{s.subject}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {s.rawScore != null ? `${s.rawScore}점` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-left">
                      {s.notes ? (
                        <span className="text-xs text-muted-foreground max-w-[120px] truncate block" title={s.notes}>{s.notes}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {s.grade ? (
                        <span className="font-bold tabular-nums" style={{ color: gradeColor(s.grade) }}>
                          {s.grade}등급
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                      {s.percentile != null ? `${s.percentile}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => startEdit(s)} disabled={isPending} className="text-muted-foreground/50 hover:text-blue-600 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(s.id)} disabled={isPending} className="text-muted-foreground/50 hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
