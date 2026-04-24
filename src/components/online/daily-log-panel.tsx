"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Search, X, CheckCircle2, Circle, Check, Filter,
  Eye, EyeOff, ExternalLink,
} from "lucide-react";
import { upsertDailyKakaoLog } from "@/actions/online/daily-kakao-log";
import { KAKAO_LOG_TAGS } from "@/lib/online/kakao-tags";

export type DailyLogRow = {
  studentId: string;
  studentName: string;
  grade: string;
  log: {
    id: string;
    summary: string;
    tags: string[];
    isParentVisible: boolean;
    authorName: string;
  } | null;
};

export function DailyLogPanel({
  rows,
  logDate,
  viewAll,
  canToggleAll,
}: {
  rows: DailyLogRow[];
  logDate: string; // "YYYY-MM-DD"
  viewAll: boolean;
  canToggleAll: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [activeStudentId, setActiveStudentId] = useState<string | null>(
    rows.find((r) => !r.log)?.studentId ?? rows[0]?.studentId ?? null
  );
  const [query, setQuery] = useState("");
  const [onlyUnrecorded, setOnlyUnrecorded] = useState(false);

  const activeRow = useMemo(
    () => rows.find((r) => r.studentId === activeStudentId) ?? null,
    [rows, activeStudentId]
  );

  // 편집 draft (활성 학생 바뀌면 리셋)
  const [summary, setSummary] = useState<string>(activeRow?.log?.summary ?? "");
  const [tags, setTags] = useState<string[]>(activeRow?.log?.tags ?? []);
  const [isParentVisible, setIsParentVisible] = useState<boolean>(
    activeRow?.log?.isParentVisible ?? true
  );
  const [saving, setSaving] = useState(false);

  // 활성 학생 변경 감지
  const activeKey = `${activeRow?.studentId ?? ""}/${activeRow?.log?.id ?? ""}`;
  const [lastKey, setLastKey] = useState(activeKey);
  if (activeKey !== lastKey) {
    setSummary(activeRow?.log?.summary ?? "");
    setTags(activeRow?.log?.tags ?? []);
    setIsParentVisible(activeRow?.log?.isParentVisible ?? true);
    setLastKey(activeKey);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyUnrecorded && r.log) return false;
      if (q) {
        const hay = (r.studentName + " " + r.grade).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, onlyUnrecorded]);

  const recordedCount = rows.filter((r) => r.log).length;
  const unrecordedCount = rows.length - recordedCount;

  const hasEdits =
    summary !== (activeRow?.log?.summary ?? "") ||
    tags.join(",") !== (activeRow?.log?.tags ?? []).join(",") ||
    isParentVisible !== (activeRow?.log?.isParentVisible ?? true);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSave = () => {
    if (!activeRow) return;
    if (!summary.trim()) {
      toast.error("요약을 입력하세요");
      return;
    }
    setSaving(true);
    startTransition(async () => {
      try {
        await upsertDailyKakaoLog({
          studentId: activeRow.studentId,
          logDate,
          summary,
          tags,
          isParentVisible,
        });
        toast.success("저장되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      } finally {
        setSaving(false);
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* 상단 툴바 */}
      <div className="flex items-center gap-2 flex-wrap bg-muted/40 rounded-md px-3 py-2">
        <span className="text-xs text-muted-foreground">
          총 <b className="text-foreground">{rows.length}</b>명 · 기록{" "}
          <b className="text-foreground">{recordedCount}</b>건
          {unrecordedCount > 0 && (
            <Badge variant="outline" className="ml-2 border-amber-300 text-amber-800 h-5 px-1.5 text-[10px]">
              미기록 {unrecordedCount}
            </Badge>
          )}
        </span>
        {canToggleAll && (
          <div className="ml-auto flex items-center gap-2 text-xs">
            <Link
              href="/online/daily-log"
              className={cn(
                "rounded-full px-3 py-1 font-medium",
                !viewAll ? "bg-foreground text-background" : "border bg-background text-muted-foreground"
              )}
            >
              내 학생만
            </Link>
            <Link
              href="/online/daily-log?all=1"
              className={cn(
                "rounded-full px-3 py-1 font-medium",
                viewAll ? "bg-foreground text-background" : "border bg-background text-muted-foreground"
              )}
            >
              전체
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 min-h-[600px]">
        {/* 좌측 학생 리스트 */}
        <div className="border rounded-lg bg-background overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b flex flex-col gap-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름/학년 검색"
                className="h-7 pl-7 text-xs"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyUnrecorded}
                onChange={(e) => setOnlyUnrecorded(e.target.checked)}
                className="rounded h-3 w-3"
              />
              <Filter className="h-3 w-3" />
              미기록만 보기
              <span className="ml-auto tabular-nums">
                {filtered.length}/{rows.length}
              </span>
            </label>
          </div>
          <div className="flex-1 overflow-y-auto divide-y max-h-[600px]">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {query || onlyUnrecorded ? "조건에 맞는 학생 없음" : "담당 학생이 없습니다"}
              </p>
            ) : (
              filtered.map((r) => {
                const isActive = activeStudentId === r.studentId;
                return (
                  <div
                    key={r.studentId}
                    onClick={() => setActiveStudentId(r.studentId)}
                    className={cn(
                      "cursor-pointer px-3 py-2.5 border-l-2 transition-colors",
                      isActive
                        ? "bg-primary/5 border-primary"
                        : "hover:bg-muted/40 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{r.studentName}</span>
                      <span className="text-[10px] text-muted-foreground">{r.grade}</span>
                      <div className="ml-auto shrink-0">
                        {r.log ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      {r.log ? (
                        <>
                          <span className="text-emerald-600">기록됨</span>
                          {r.log.tags.length > 0 && (
                            <span className="truncate">· {r.log.tags.join(", ")}</span>
                          )}
                          {!r.log.isParentVisible && (
                            <span className="text-slate-500">· 내부</span>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-600">미기록</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 우측: 상세 */}
        <div className="border rounded-lg bg-background flex flex-col min-h-[600px]">
          {!activeRow ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              좌측에서 학생을 선택하세요
            </div>
          ) : (
            <>
              {/* 헤더 */}
              <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base">{activeRow.studentName}</h3>
                    <span className="text-xs text-muted-foreground">{activeRow.grade}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {logDate}
                    {activeRow.log ? ` · ${activeRow.log.authorName} 기록` : " · 미기록"}
                  </p>
                </div>
                <Link
                  href={`/online/students/${activeRow.studentId}/daily-log`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  과거 기록
                </Link>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* 요약 */}
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    오늘 대화 요약
                  </h4>
                  <Textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={8}
                    placeholder="오늘 학생과 나눈 카톡 대화의 핵심 요약을 적어 주세요. 학부모 공개 시 보고서 자료로 활용됩니다."
                    className="text-sm leading-relaxed resize-y"
                  />
                </section>

                {/* 태그 */}
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    태그
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {KAKAO_LOG_TAGS.map((tag) => {
                      const active = tags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={cn(
                            "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
                            active
                              ? "bg-foreground text-background"
                              : "border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/20"
                          )}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* 학부모 공개 토글 */}
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    공개 여부
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsParentVisible((v) => !v)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                      isParentVisible
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-slate-300 bg-slate-50 text-slate-700"
                    )}
                  >
                    {isParentVisible ? (
                      <>
                        <Eye className="h-4 w-4" />
                        학부모 보고서에 포함
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4" />
                        내부 메모 (학부모 비공개)
                      </>
                    )}
                  </button>
                </section>

                {/* 저장 */}
                <section className="border-t pt-4">
                  <div className="flex items-center justify-end gap-2">
                    {hasEdits && (
                      <span className="text-[11px] text-amber-700">변경됨 — 저장 필요</span>
                    )}
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving || !summary.trim() || !hasEdits}
                    >
                      {saving ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      저장
                    </Button>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
