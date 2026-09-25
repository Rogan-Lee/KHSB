"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkCreateMentorings, quickStartMentoring, type MentorTodaySlot, type MatchCandidate } from "@/actions/mentoring";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, StatusBadge } from "@/components/backoffice/ui";
import { AlertCircle, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PRIORITY } from "./mentoring-status";

function QuickStartButton({ studentId, mentorId }: { studentId: string; mentorId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      try {
        const id = await quickStartMentoring(studentId, mentorId);
        router.push(`/mentoring/${id}`);
      } catch {
        toast.error("멘토링 시작 실패");
      }
    });
  }

  return (
    <Button size="xs" variant="soft" onClick={handleClick} disabled={isPending}>
      {isPending ? "시작 중…" : "바로 시작"}
    </Button>
  );
}

function CandidateRow({
  c,
  mentorId,
  checked,
  onToggle,
}: {
  c: MatchCandidate;
  mentorId: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const p = PRIORITY[c.priority];
  return (
    <div
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer select-none items-center gap-x3 border-b border-stroke-neutral-muted px-x4 py-x3 transition-colors last:border-0",
        checked ? "bg-bg-neutral-weak" : "hover:bg-bg-layer-default-pressed"
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={`${c.studentName} 선택`}
      />

      {/* 우선순위 */}
      <div className="w-14 shrink-0">
        <StatusBadge tone={p.tone}>{p.label}</StatusBadge>
      </div>

      {/* 원생 정보 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x1_5">
          <span className="t4-bold text-fg-neutral">{c.studentName}</span>
          <span className="t3-regular text-fg-neutral-subtle">{c.grade}</span>
          {c.isAssignedMentor && <StatusBadge tone="brand">담당</StatusBadge>}
          {c.attendanceStatus === "TARDY" && <StatusBadge tone="warn">지각</StatusBadge>}
        </div>
        {c.mentoringNotes && (
          <div className="mt-x0_5 flex items-center gap-x1 t3-regular text-fg-neutral-muted">
            <AlertCircle className="size-3.5 shrink-0 text-fg-warning" aria-hidden />
            <span className="truncate">{c.mentoringNotes}</span>
          </div>
        )}
      </div>

      {/* 마지막 멘토링 */}
      <div className="w-20 shrink-0 text-right t3-regular tabular-nums">
        {c.lastMentoringDate ? (
          <span className="t3-medium text-fg-neutral">{c.daysSinceLast}일 전</span>
        ) : (
          <span className="t3-bold text-fg-critical">이력 없음</span>
        )}
      </div>

      {/* 입실 상태 */}
      <div className="hidden w-12 shrink-0 items-center justify-end gap-x1 sm:flex">
        <span className="size-1.5 rounded-full bg-bg-positive-solid" aria-hidden />
        <span className="t3-medium text-fg-positive">입실</span>
      </div>

      {/* 바로 시작 */}
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <QuickStartButton studentId={c.studentId} mentorId={mentorId} />
      </div>
    </div>
  );
}

interface Props {
  slots: MentorTodaySlot[];
  today: string;
}

export function TodayMentoringPanel({ slots }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (slots.length === 0) {
    return (
      <EmptyState
        compact
        icon={Clock}
        title="오늘 등록된 근무 스케줄이 없어요"
        description="멘토 근무 시간을 등록하면 오늘 추천이 자동으로 나타나요"
      />
    );
  }

  const activeSlot = slots[selectedIdx];

  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checkedIds.size === activeSlot.candidates.length && activeSlot.candidates.length > 0) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(activeSlot.candidates.map((c) => c.studentId)));
    }
  }

  function handleSelectMentor(idx: number) {
    setSelectedIdx(idx);
    setCheckedIds(new Set());
  }

  function handleBulkCreate() {
    if (checkedIds.size === 0) return;
    startTransition(async () => {
      try {
        await bulkCreateMentorings([...checkedIds], activeSlot.mentor.id);
        toast.success(`${checkedIds.size}명 멘토링이 등록되었습니다`);
        setCheckedIds(new Set());
        router.refresh();
      } catch {
        toast.error("등록 실패");
      }
    });
  }

  const allChecked = checkedIds.size === activeSlot.candidates.length && activeSlot.candidates.length > 0;
  const someChecked = checkedIds.size > 0 && !allChecked;

  return (
    <div className="flex min-h-[240px] flex-col border-t border-stroke-neutral-muted md:flex-row">
      {/* 근무 멘토 — 모바일은 가로 스크롤, md 이상은 왼쪽 목록 */}
      <nav
        aria-label="근무 멘토"
        className="flex shrink-0 gap-x1 overflow-x-auto border-b border-stroke-neutral-muted p-x2 md:w-48 md:flex-col md:overflow-visible md:border-b-0 md:border-r"
      >
        {slots.map((slot, idx) => {
          const p1Count = slot.candidates.filter((c) => c.priority === 1).length;
          const isActive = idx === selectedIdx;
          return (
            <button
              key={slot.mentor.id}
              type="button"
              onClick={() => handleSelectMentor(idx)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "min-w-[140px] shrink-0 rounded-r2 px-x3 py-x2_5 text-left transition-colors md:min-w-0",
                isActive ? "bg-bg-neutral-weak" : "hover:bg-bg-transparent-pressed"
              )}
            >
              <div className={cn("t4-bold", isActive ? "text-fg-neutral" : "text-fg-neutral-muted")}>
                {slot.mentor.name}
              </div>
              <div className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
                {slot.schedule.timeStart}~{slot.schedule.timeEnd}
              </div>
              <div className="mt-x1_5 flex flex-wrap items-center gap-x1_5">
                <span className="inline-flex items-center gap-x1 t3-regular text-fg-neutral-subtle">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      slot.candidates.length > 0 ? "bg-bg-positive-solid" : "bg-bg-neutral-solid-muted"
                    )}
                  />
                  재실 {slot.candidates.length}명
                </span>
                {p1Count > 0 && <StatusBadge tone="bad">우선 {p1Count}</StatusBadge>}
              </div>
            </button>
          );
        })}
      </nav>

      {/* 원생 목록 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {activeSlot.candidates.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="지금 재실 중인 원생이 없어요"
            description={`${activeSlot.mentor.name} 멘토 근무 시간에 입실한 원생이 여기에 나타나요`}
            className="flex-1"
          />
        ) : (
          <>
            {/* 컬럼 헤더 */}
            <div className="flex shrink-0 items-center gap-x3 border-b border-stroke-neutral-muted bg-bg-layer-fill px-x4 py-x2 t3-medium text-fg-neutral-subtle">
              <Checkbox
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="전체 선택"
              />
              <span className="w-14 shrink-0">우선순위</span>
              <span className="flex-1">원생</span>
              <span className="w-20 shrink-0 text-right">마지막 멘토링</span>
              <span className="hidden w-12 shrink-0 text-right sm:block">상태</span>
              <span className="w-[68px] shrink-0" aria-hidden />
            </div>

            {/* 원생 행 (스크롤) */}
            <div className="max-h-80 flex-1 overflow-y-auto">
              {activeSlot.candidates.map((c) => (
                <CandidateRow
                  key={c.studentId}
                  c={c}
                  mentorId={activeSlot.mentor.id}
                  checked={checkedIds.has(c.studentId)}
                  onToggle={() => toggleCheck(c.studentId)}
                />
              ))}
            </div>

            {/* 일괄 등록 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x3 border-t border-stroke-neutral-muted px-x4 py-x3">
              <p className="t3-regular text-fg-neutral-subtle">
                {checkedIds.size > 0 ? (
                  <span className="t4-bold text-fg-neutral tabular-nums">{checkedIds.size}명 선택됨</span>
                ) : (
                  "원생을 고르면 한 번에 멘토링을 등록할 수 있어요"
                )}
              </p>
              <Button
                size="sm"
                disabled={checkedIds.size === 0 || isPending}
                onClick={handleBulkCreate}
              >
                {isPending ? "등록 중…" : `선택 ${checkedIds.size > 0 ? checkedIds.size + "명 " : ""}멘토링 등록`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
