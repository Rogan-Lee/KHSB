"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateMonthlyReportsBulk } from "@/actions/reports";
import type { BulkReportResult } from "@/actions/reports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2, Search, X, CheckCircle2, Circle, Image as ImageIcon,
  AlertCircle, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ReportDetailPane, type ReportLite } from "./report-detail-pane";

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface Props {
  year: number;
  month: number;
  students: Student[];
  reports: ReportLite[];
}

function formatMinutes(minutes: number): string {
  const h = Math.round((minutes / 60) * 100) / 100;
  if (h < 1) return `${Math.round(minutes)}분`;
  return `${h}시간`;
}

export function MonthlyReportPanel({ year, month, students, reports }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeStudentId, setActiveStudentId] = useState<string | null>(students[0]?.id ?? null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<Record<string, "pending" | "success" | "failed">>({});
  const [bulkErrors, setBulkErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  const reportMap = useMemo(() => new Map(reports.map((r) => [r.studentId, r])), [reports]);

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      s.name.toLowerCase().includes(q) || (s.grade ?? "").toLowerCase().includes(q)
    );
  }, [students, query]);

  const activeStudent = useMemo(
    () => students.find((s) => s.id === activeStudentId) ?? null,
    [students, activeStudentId]
  );
  const activeReport = activeStudentId ? reportMap.get(activeStudentId) ?? null : null;

  // 통계: 전체 / 생성됨 / 발송완료
  const createdCount = reports.length;
  const sentCount = reports.filter((r) => r.sentAt).length;

  function toggleAll() {
    if (selectedIds.size === filteredStudents.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredStudents.map((s) => s.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(ids: string[]) {
    const initial: Record<string, "pending"> = {};
    for (const id of ids) initial[id] = "pending";
    setBulkProgress(initial);
    setBulkErrors({});
    setBulkGenerating(true);

    try {
      const results: BulkReportResult[] = await generateMonthlyReportsBulk(ids, year, month);
      const nextProg: Record<string, "success" | "failed"> = {};
      const nextErr: Record<string, string> = {};
      let ok = 0, ng = 0;
      for (const r of results) {
        nextProg[r.studentId] = r.status;
        if (r.status === "failed") { ng++; if (r.reason) nextErr[r.studentId] = r.reason; }
        else ok++;
      }
      setBulkProgress(nextProg);
      setBulkErrors(nextErr);
      toast.success(`생성 완료: ${ok}건${ng > 0 ? ` (실패 ${ng}건)` : ""}`);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 생성 실패");
    } finally {
      setBulkGenerating(false);
    }
  }

  async function handleBulkGenerate() {
    if (selectedIds.size === 0) {
      toast.error("학생을 선택하세요");
      return;
    }
    await runBulk(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  async function handleRetryFailed() {
    const failedIds = Object.entries(bulkProgress)
      .filter(([, s]) => s === "failed")
      .map(([id]) => id);
    if (failedIds.length === 0) return;
    await runBulk(failedIds);
  }

  const failedCount = Object.values(bulkProgress).filter((s) => s === "failed").length;

  return (
    <div className="space-y-3">
      {/* 상단 툴바: 요약 + 일괄 생성 */}
      <div className="flex items-center gap-3 flex-wrap bg-muted/40 rounded-md px-3 py-2">
        <span className="text-xs text-muted-foreground">
          총 <b className="text-foreground">{students.length}</b>명
          {" · "}
          생성 <b className="text-foreground">{createdCount}</b>
          {" · "}
          발송 <b className="text-foreground">{sentCount}</b>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {bulkGenerating && (
            <span className="text-xs text-muted-foreground">
              {Object.values(bulkProgress).filter((s) => s !== "pending").length}/{Object.keys(bulkProgress).length} 진행 중
            </span>
          )}
          {failedCount > 0 && !bulkGenerating && (
            <Button size="sm" variant="outline" onClick={handleRetryFailed}>
              실패 {failedCount}건 재시도
            </Button>
          )}
          <Button size="sm" onClick={handleBulkGenerate} disabled={bulkGenerating || selectedIds.size === 0}>
            {bulkGenerating ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />생성 중…</>
            ) : (
              <>선택 {selectedIds.size}명 리포트 생성</>
            )}
          </Button>
        </div>
      </div>

      {/* 2-col 마스터-디테일 */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 min-h-[600px]">
        {/* 좌측: 학생 리스트 */}
        <div className="border rounded-lg bg-background overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b flex items-center gap-2">
            <input
              type="checkbox"
              checked={filteredStudents.length > 0 && selectedIds.size === filteredStudents.length}
              onChange={toggleAll}
              className="rounded"
              title="화면에 보이는 학생 전체 선택"
            />
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름/학년 검색"
                className="h-7 pl-7 text-xs"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y">
            {filteredStudents.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {query ? "검색 결과 없음" : "학생이 없습니다"}
              </p>
            ) : (
              filteredStudents.map((s) => {
                const report = reportMap.get(s.id);
                const isActive = activeStudentId === s.id;
                const isChecked = selectedIds.has(s.id);
                const prog = bulkProgress[s.id];
                return (
                  <div
                    key={s.id}
                    onClick={() => setActiveStudentId(s.id)}
                    className={cn(
                      "w-full px-3 py-2 text-left cursor-pointer transition-colors border-l-2",
                      isActive
                        ? "bg-primary/5 border-primary"
                        : "hover:bg-muted/40 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => { e.stopPropagation(); toggleOne(s.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded shrink-0"
                      />
                      <span className="font-medium text-sm truncate">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground">{s.grade}</span>
                      <div className="ml-auto shrink-0 flex items-center gap-1">
                        {prog === "pending" ? (
                          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                        ) : prog === "failed" ? (
                          <span title={bulkErrors[s.id]}><XCircle className="h-3.5 w-3.5 text-red-500" /></span>
                        ) : report ? (
                          report.sentAt ? (
                            <Badge className="text-[9px] h-4 px-1">발송</Badge>
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          )
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
                        )}
                        {report && (
                          report.attachedPhotoIds.length > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-600">
                              <ImageIcon className="h-2.5 w-2.5" />
                              {report.attachedPhotoIds.length}
                            </span>
                          ) : (
                            <span title="사진 없음"><AlertCircle className="h-3 w-3 text-amber-500" /></span>
                          )
                        )}
                      </div>
                    </div>
                    {report && (
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{formatMinutes(report.totalStudyMinutes)}</span>
                        {report.studyRankInRoom != null && (
                          <span>· {report.studyRankInRoom}위</span>
                        )}
                        {report.tardyCount > 0 && <span className="text-amber-600">지각{report.tardyCount}</span>}
                        {report.absentDays > 0 && <span className="text-red-600">결석{report.absentDays}</span>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 우측: 디테일 */}
        <ReportDetailPane
          student={activeStudent}
          report={activeReport}
          year={year}
          month={month}
        />
      </div>
    </div>
  );
}
