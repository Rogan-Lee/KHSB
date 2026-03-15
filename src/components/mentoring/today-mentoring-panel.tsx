"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkCreateMentorings, quickStartMentoring, type MentorTodaySlot, type MatchCandidate } from "@/actions/mentoring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle, Zap, Users, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRIORITY_CONFIG: Record<1 | 2 | 3, { label: string; className: string }> = {
  1: { label: "1순위", className: "bg-red-100 text-red-700 border-red-200" },
  2: { label: "2순위", className: "bg-orange-100 text-orange-700 border-orange-200" },
  3: { label: "일반", className: "bg-blue-100 text-blue-700 border-blue-200" },
};

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
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs px-2 whitespace-nowrap text-primary hover:text-primary"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "…" : "바로 시작"}
    </Button>
  );
}

function CandidateRow({
  c,
  idx,
  mentorId,
  checked,
  onToggle,
}: {
  c: MatchCandidate;
  idx: number;
  mentorId: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const cfg = PRIORITY_CONFIG[c.priority];
  return (
    <div
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 border-b last:border-0 cursor-pointer select-none transition-colors",
        checked ? "bg-primary/5" : "hover:bg-muted/30",
        idx === 0 && c.priority === 1 && !checked ? "bg-red-50/40" : ""
      )}
    >
      {/* 체크박스 */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="rounded flex-shrink-0 accent-primary cursor-pointer"
      />

      {/* 우선순위 */}
      <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium flex-shrink-0 w-14 justify-center", cfg.className)}>
        {cfg.label}
      </span>

      {/* 원생 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm">{c.studentName}</span>
          <span className="text-xs text-muted-foreground">{c.grade}</span>
          {c.isAssignedMentor && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-3.5 border-primary/50 text-primary leading-none">
              담당
            </Badge>
          )}
          {c.attendanceStatus === "TARDY" && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-3.5 border-orange-300 text-orange-600 leading-none">
              지각
            </Badge>
          )}
        </div>
        {c.mentoringNotes && (
          <div className="flex items-center gap-1 mt-0.5">
            <AlertCircle className="h-2.5 w-2.5 text-orange-500 flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground truncate">{c.mentoringNotes}</span>
          </div>
        )}
      </div>

      {/* 마지막 멘토링 */}
      <div className="w-20 flex-shrink-0 text-right">
        {c.lastMentoringDate ? (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{c.daysSinceLast}일 전</span>
          </div>
        ) : (
          <span className="text-xs text-red-600 font-semibold">이력없음</span>
        )}
      </div>

      {/* 입실 상태 */}
      <div className="flex items-center gap-1 w-10 flex-shrink-0 justify-end">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="text-[11px] text-green-700">입실</span>
      </div>

      {/* 바로 시작 */}
      <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
        <QuickStartButton studentId={c.studentId} mentorId={mentorId} />
      </div>
    </div>
  );
}

interface Props {
  slots: MentorTodaySlot[];
  today: string;
}

export function TodayMentoringPanel({ slots, today }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <Clock className="h-8 w-8 opacity-20" />
        <p className="text-sm font-medium">오늘 등록된 근무 스케줄이 없습니다</p>
        <p className="text-xs">멘토 근무 시간을 등록하면 오늘 추천이 자동으로 표시됩니다</p>
      </div>
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
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center gap-2 text-sm">
        <Zap className="h-4 w-4 text-yellow-500" />
        <span className="font-medium">오늘의 멘토링 추천</span>
        <span className="text-xs text-muted-foreground">{today} · 근무자별 재실 원생</span>
      </div>

      {/* 좌우 레이아웃 */}
      <div className="flex border rounded-lg overflow-hidden min-h-[220px]">
        {/* 좌측: 근무자 목록 */}
        <div className="w-40 border-r bg-muted/10 flex-shrink-0 flex flex-col">
          {slots.map((slot, idx) => {
            const p1Count = slot.candidates.filter((c) => c.priority === 1).length;
            const isActive = idx === selectedIdx;
            return (
              <button
                key={slot.mentor.id}
                type="button"
                onClick={() => handleSelectMentor(idx)}
                className={cn(
                  "w-full text-left px-3 py-3 border-b last:border-0 transition-colors",
                  isActive
                    ? "bg-background border-l-2 border-l-primary shadow-sm"
                    : "hover:bg-muted/30 border-l-2 border-l-transparent"
                )}
              >
                <div className={cn("font-semibold text-sm", isActive ? "text-primary" : "text-foreground")}>
                  {slot.mentor.name}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {slot.schedule.timeStart}~{slot.schedule.timeEnd}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <div className="flex items-center gap-1">
                    <div className={cn("w-1.5 h-1.5 rounded-full", slot.candidates.length > 0 ? "bg-green-500" : "bg-gray-300")} />
                    <span className="text-[11px] text-muted-foreground">재실 {slot.candidates.length}명</span>
                  </div>
                  {p1Count > 0 && (
                    <span className="inline-flex items-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                      우선 {p1Count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* 우측: 학생 목록 */}
        <div className="flex-1 min-w-0 flex flex-col">
          {activeSlot.candidates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-sm text-muted-foreground justify-center">
              <Users className="h-6 w-6 opacity-30" />
              <p>현재 재실 중인 학생이 없습니다</p>
            </div>
          ) : (
            <>
              {/* 컬럼 헤더 */}
              <div className="flex items-center gap-2.5 px-3 py-2 border-b bg-muted/20 text-xs text-muted-foreground flex-shrink-0">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={toggleAll}
                  className="rounded accent-primary cursor-pointer flex-shrink-0"
                />
                <span className="w-14 flex-shrink-0">우선순위</span>
                <span className="flex-1">원생</span>
                <span className="w-20 text-right flex-shrink-0">마지막 멘토링</span>
                <span className="w-10 text-right flex-shrink-0">상태</span>
                <span className="w-16 flex-shrink-0"></span>
              </div>

              {/* 학생 행 (스크롤) */}
              <div className="overflow-y-auto flex-1 max-h-72">
                {activeSlot.candidates.map((c, idx) => (
                  <CandidateRow
                    key={c.studentId}
                    c={c}
                    idx={idx}
                    mentorId={activeSlot.mentor.id}
                    checked={checkedIds.has(c.studentId)}
                    onToggle={() => toggleCheck(c.studentId)}
                  />
                ))}
              </div>

              {/* 하단: 일괄 등록 */}
              <div className="flex items-center justify-between px-3 py-2.5 border-t bg-muted/10 flex-shrink-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckSquare className="h-3.5 w-3.5" />
                  {checkedIds.size > 0
                    ? <span className="font-medium text-foreground">{checkedIds.size}명 선택됨</span>
                    : <span>학생을 선택하면 일괄 등록할 수 있습니다</span>
                  }
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs px-4"
                  disabled={checkedIds.size === 0 || isPending}
                  onClick={handleBulkCreate}
                >
                  {isPending ? "등록 중..." : `선택 ${checkedIds.size > 0 ? checkedIds.size + "명 " : ""}멘토링 등록`}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
