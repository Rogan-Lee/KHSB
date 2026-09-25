"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "seed-design/ui/switch";
import {
  Loader2, Check, Eye, EyeOff, History, Sparkles,
} from "lucide-react";
import {
  FilterChip,
  Segmented,
  StatCard,
  StatCards,
  StatusBadge,
} from "@/components/backoffice/ui";
import {
  upsertDailyKakaoLog,
  summarizeKakaoRaw,
} from "@/actions/online/daily-kakao-log";
import { KAKAO_LOG_TAGS } from "@/lib/online/kakao-tags";
import {
  StudentFilterBar,
  defaultFilterState,
  matchesStudentFilter,
  deriveFilterOptions,
  type StudentFilterState,
} from "@/components/online/student-filter-bar";
import {
  DetailPane,
  DetailPaneEmpty,
  DetailPaneHeader,
  MasterDetail,
  PickerCount,
  PickerItem,
  PickerList,
} from "@/components/online/student-picker";

export type DailyLogRow = {
  studentId: string;
  studentName: string;
  grade: string;
  school: string | null;
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
  const [filter, setFilter] = useState<StudentFilterState>(defaultFilterState);
  const [onlyUnrecorded, setOnlyUnrecorded] = useState(false);
  const filterOptions = useMemo(() => deriveFilterOptions(rows), [rows]);

  const activeRow = useMemo(
    () => rows.find((r) => r.studentId === activeStudentId) ?? null,
    [rows, activeStudentId]
  );

  // 편집 draft (활성 학생 바뀌면 리셋)
  const [mode, setMode] = useState<"summary" | "raw">("summary");
  const [summary, setSummary] = useState<string>(activeRow?.log?.summary ?? "");
  const [tags, setTags] = useState<string[]>(activeRow?.log?.tags ?? []);
  const [rawContent, setRawContent] = useState<string>("");
  const [isParentVisible, setIsParentVisible] = useState<boolean>(
    activeRow?.log?.isParentVisible ?? true
  );
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummarized, setAiSummarized] = useState(false);

  // 활성 학생 변경 감지
  const activeKey = `${activeRow?.studentId ?? ""}/${activeRow?.log?.id ?? ""}`;
  const [lastKey, setLastKey] = useState(activeKey);
  if (activeKey !== lastKey) {
    setSummary(activeRow?.log?.summary ?? "");
    setTags(activeRow?.log?.tags ?? []);
    setRawContent("");
    setAiSummarized(false);
    setMode("summary");
    setIsParentVisible(activeRow?.log?.isParentVisible ?? true);
    setLastKey(activeKey);
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (onlyUnrecorded && r.log) return false;
      if (!matchesStudentFilter(r, filter)) return false;
      return true;
    });
  }, [rows, filter, onlyUnrecorded]);

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
          rawContent: rawContent || null,
          aiSummarized,
        });
        toast.success("저장되었습니다");
        setRawContent("");
        setAiSummarized(false);
        setMode("summary");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      } finally {
        setSaving(false);
      }
    });
  };

  const handleAiSummarize = async () => {
    if (!activeRow) return;
    if (!rawContent.trim()) {
      toast.error("원문을 붙여넣어 주세요");
      return;
    }
    setAiBusy(true);
    try {
      const result = await summarizeKakaoRaw({
        rawContent,
        studentName: activeRow.studentName,
      });
      setSummary(result.summary);
      setTags(result.tags);
      setAiSummarized(true);
      toast.success("AI 요약 — 검토 후 저장하세요");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI 실패");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-x6">
      {/* 오늘 현황 */}
      <StatCards cols={3}>
        <StatCard label={viewAll ? "전체 학생" : "담당 학생"} value={rows.length} unit="명" />
        <StatCard label="오늘 기록" value={recordedCount} unit="건" />
        <StatCard
          label="미기록"
          value={unrecordedCount}
          unit="명"
          tone={unrecordedCount > 0 ? "warn" : "gray"}
          sub={unrecordedCount > 0 ? "아직 오늘 보고가 없는 학생" : "모두 기록했어요"}
        />
      </StatCards>

      <div className="flex flex-col gap-x4">
        {/* 학생 필터 (학생/학년/학교) + 보기 범위 */}
        <StudentFilterBar
          value={filter}
          onChange={setFilter}
          availableGrades={filterOptions.grades}
          availableSchools={filterOptions.schools}
          hasUnknownSchool={filterOptions.hasUnknownSchool}
          rightSlot={
            canToggleAll ? (
              <div className="flex items-center gap-x1_5" role="group" aria-label="보기 범위">
                <ScopeLink href="/online/daily-log" selected={!viewAll}>
                  내 학생만
                </ScopeLink>
                <ScopeLink href="/online/daily-log?all=1" selected={viewAll}>
                  전체
                </ScopeLink>
              </div>
            ) : undefined
          }
        />

        <MasterDetail
          list={
            <PickerList
              header={
                <>
                  <FilterChip
                    selected={onlyUnrecorded}
                    count={unrecordedCount}
                    onClick={() => setOnlyUnrecorded((v) => !v)}
                  >
                    미기록만 보기
                  </FilterChip>
                  <PickerCount shown={filtered.length} total={rows.length} />
                </>
              }
              isEmpty={filtered.length === 0}
              emptyTitle={onlyUnrecorded && unrecordedCount === 0 ? "미기록 학생이 없어요" : undefined}
              emptyDescription={onlyUnrecorded && unrecordedCount === 0 ? "오늘 보고를 모두 기록했어요" : undefined}
            >
              {filtered.map((r) => (
                <PickerItem
                  key={r.studentId}
                  active={activeStudentId === r.studentId}
                  onClick={() => setActiveStudentId(r.studentId)}
                  name={r.studentName}
                  grade={r.grade}
                  badges={
                    r.log ? (
                      <StatusBadge tone="ok">기록됨</StatusBadge>
                    ) : (
                      <StatusBadge tone="warn">미기록</StatusBadge>
                    )
                  }
                  description={
                    r.log && (r.log.tags.length > 0 || !r.log.isParentVisible) ? (
                      <>
                        {r.log.tags.length > 0 && <span className="truncate">{r.log.tags.join(", ")}</span>}
                        {!r.log.isParentVisible && (
                          <span className="inline-flex items-center gap-x0_5">
                            <EyeOff className="size-3" aria-hidden />
                            내부
                          </span>
                        )}
                      </>
                    ) : undefined
                  }
                />
              ))}
            </PickerList>
          }
          detail={
            <DetailPane>
              {!activeRow ? (
                <DetailPaneEmpty />
              ) : (
                <>
                  <DetailPaneHeader
                    title={activeRow.studentName}
                    meta={<span className="t4-regular text-fg-neutral-subtle">{activeRow.grade}</span>}
                    description={
                      <>
                        <span className="tabular-nums">{logDate}</span>
                        <span aria-hidden>·</span>
                        {activeRow.log ? (
                          <span>{activeRow.log.authorName} 기록</span>
                        ) : (
                          <span className="t3-medium text-fg-warning">미기록</span>
                        )}
                      </>
                    }
                    actions={
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/online/students/${activeRow.studentId}/daily-log`}>
                          <History />
                          과거 기록
                        </Link>
                      </Button>
                    }
                  />

                  <div className="flex flex-col gap-x6 px-x5 py-x5">
                    {/* 모드 switcher */}
                    <Segmented
                      aria-label="작성 방식"
                      className="sm:w-auto sm:self-start"
                      value={mode}
                      onChange={setMode}
                      options={[
                        { value: "summary", label: "요약 직접 입력" },
                        {
                          value: "raw",
                          label: (
                            <span className="inline-flex items-center gap-x1">
                              <Sparkles className="size-4" aria-hidden />
                              원문 붙여넣기 + AI 요약
                            </span>
                          ),
                        },
                      ]}
                    />

                    {/* 원문 (AI 모드만) */}
                    {mode === "raw" && (
                      <div className="flex flex-col gap-x2">
                        <div className="flex items-center justify-between gap-x2">
                          <label htmlFor="daily-log-raw" className="t4-medium text-fg-neutral">
                            카톡 원문
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleAiSummarize}
                            disabled={aiBusy || !rawContent.trim()}
                          >
                            {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                            {aiBusy ? "요약 중…" : "AI 요약"}
                          </Button>
                        </div>
                        <Textarea
                          id="daily-log-raw"
                          value={rawContent}
                          onChange={(e) => setRawContent(e.target.value)}
                          rows={8}
                          placeholder="카톡 대화 원문을 그대로 붙여넣고 'AI 요약' 버튼을 누르면 요약·태그가 자동으로 채워집니다. (최대 20,000자)"
                          className="resize-y"
                        />
                        <p className="t3-regular text-fg-neutral-subtle">
                          원문은 저장되지만 학부모 공개 페이지에는 보이지 않아요. 요약만 보여요.
                        </p>
                      </div>
                    )}

                    {/* 요약 */}
                    <div className="flex flex-col gap-x2">
                      <div className="flex items-center gap-x2">
                        <label htmlFor="daily-log-summary" className="t4-medium text-fg-neutral">
                          {mode === "raw" ? "AI 추천 요약 (검토 후 저장)" : "오늘 대화 요약"}
                        </label>
                        {aiSummarized && (
                          <StatusBadge tone="violet">
                            <Sparkles aria-hidden />
                            AI 생성
                          </StatusBadge>
                        )}
                      </div>
                      <Textarea
                        id="daily-log-summary"
                        value={summary}
                        onChange={(e) => {
                          setSummary(e.target.value);
                          if (aiSummarized) setAiSummarized(false);
                        }}
                        rows={mode === "raw" ? 5 : 8}
                        placeholder="오늘 학생과 나눈 카톡 대화의 핵심 요약을 적어 주세요. 학부모 공개 시 보고서 자료로 활용됩니다."
                        className="resize-y"
                      />
                    </div>

                    {/* 태그 */}
                    <div className="flex flex-col gap-x2">
                      <p className="t4-medium text-fg-neutral">태그</p>
                      <div className="flex flex-wrap gap-x1_5">
                        {KAKAO_LOG_TAGS.map((tag) => (
                          <FilterChip
                            key={tag}
                            selected={tags.includes(tag)}
                            onClick={() => toggleTag(tag)}
                          >
                            {tag}
                          </FilterChip>
                        ))}
                      </div>
                    </div>

                    {/* 학부모 공개 토글 */}
                    <div className="flex items-center justify-between gap-x4 rounded-r3 bg-bg-layer-fill px-x4 py-x3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-x1_5 t4-medium text-fg-neutral">
                          {isParentVisible ? (
                            <Eye className="size-4 text-fg-positive" aria-hidden />
                          ) : (
                            <EyeOff className="size-4 text-fg-neutral-subtle" aria-hidden />
                          )}
                          {isParentVisible ? "학부모 보고서에 포함" : "내부 메모 (학부모 비공개)"}
                        </p>
                        <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">
                          끄면 직원만 볼 수 있는 내부 메모로 저장돼요
                        </p>
                      </div>
                      <Switch
                        size="24"
                        checked={isParentVisible}
                        onCheckedChange={(v) => setIsParentVisible(v)}
                        inputProps={{ "aria-label": "학부모 보고서에 포함" }}
                      />
                    </div>

                    {/* 저장 */}
                    <div className="flex flex-col-reverse items-stretch gap-x2 border-t border-stroke-neutral-muted pt-x4 sm:flex-row sm:items-center sm:justify-end">
                      {hasEdits && (
                        <span className="text-center t3-medium text-fg-warning sm:text-right">
                          변경됨 — 저장 필요
                        </span>
                      )}
                      <Button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !summary.trim() || !hasEdits}
                      >
                        {saving ? <Loader2 className="animate-spin" /> : <Check />}
                        {saving ? "저장 중…" : "저장"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </DetailPane>
          }
        />
      </div>
    </div>
  );
}

/** 보기 범위 전환 링크 — FilterChip 과 같은 모양의 URL 링크 */
function ScopeLink({
  href,
  selected,
  children,
}: {
  href: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full px-x3 t3-medium transition-colors",
        selected
          ? "bg-bg-neutral-inverted text-fg-neutral-inverted"
          : "bg-bg-layer-default text-fg-neutral-muted shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] hover:bg-bg-layer-default-pressed",
      )}
    >
      {children}
    </Link>
  );
}
