"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Shuffle, Users, X, Printer } from "lucide-react";
import {
  assignExamSeatsRandomly,
  reshuffleExamSeats,
  manualAssignExamSeat,
  removeExamParticipant,
} from "@/actions/exam-sessions";

// ─── H룸 레이아웃 정의 (좌석 배치도와 동일) ─────────────────────────────────

const SEAT_H = 68;
const COLS_GAP = 16;
const SECTION_GAP = 32;
const H_COL_H = 820;

const H_COL_A: (number | null)[] = [null, null, 65, 64, 63, 62, 61, 60, 59, 58];
const H_COL_66: (number | null)[] = [null, 66, null, null, null, null, null, null, null, null];
const H_COL_DEFS: (number | null)[][] = [
  [67, null, 82, 83, 84, 85, 86, null, null, 57],
  [68, null, 81, 80, 79, 78, 77, null, null, 56],
  [69, null, 72, 73, 74, 75, 76, null, null, 55],
  [70, null, null, null, null, null, null, null, null, 54],
];

// ─── 타입 ─────────────────────────────────────────────────────────────────

type Student = {
  id: string;
  name: string;
  grade: string;
  seat: string | null;
  school: string | null;
};

type Assignment = {
  id: string;
  seatNumber: number;
  studentId: string;
  studentName: string;
  studentGrade: string;
};

type Props = {
  sessionId: string;
  assignments: Assignment[];
  students: Student[];
  seatOwnerMap: Record<number, { id: string; name: string }>;
};

// ─── 메인 ─────────────────────────────────────────────────────────────────

export function ExamSeatManager({ sessionId, assignments, students, seatOwnerMap }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [seatDialog, setSeatDialog] = useState<number | null>(null);

  const takenSeatMap = useMemo(() => {
    const m = new Map<number, Assignment>();
    for (const a of assignments) m.set(a.seatNumber, a);
    return m;
  }, [assignments]);

  const participantIds = useMemo(() => new Set(assignments.map((a) => a.studentId)), [assignments]);

  function handleReshuffle() {
    if (assignments.length === 0) {
      setPickerOpen(true);
      return;
    }
    if (!confirm(`응시자 ${assignments.length}명의 좌석을 다시 랜덤 배치할까요?`)) return;
    startTransition(async () => {
      try {
        await reshuffleExamSeats(sessionId);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "재배치 실패");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => setPickerOpen(true)} disabled={pending}>
          <Users className="h-4 w-4 mr-1" />
          응시자 선택 / 변경
        </Button>
        <Button size="sm" variant="outline" onClick={handleReshuffle} disabled={pending || assignments.length === 0}>
          <Shuffle className="h-4 w-4 mr-1" />
          랜덤 재배치
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" />
          인쇄
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          응시자 {assignments.length}명 · H룸 33석 · 좌석 클릭 시 개별 변경
        </span>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded border border-blue-500 bg-blue-50"/> 응시자 (상단)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded border border-amber-300 bg-amber-50"/> 원 좌석 주인 (하단, 응시자와 다를 때만)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded border border-gray-300 bg-gray-50"/> 빈 좌석
        </span>
      </div>

      {/* H룸 맵 */}
      <HRoomMap
        takenSeatMap={takenSeatMap}
        seatOwnerMap={seatOwnerMap}
        onSeatClick={(n) => setSeatDialog(n)}
      />

      {/* 응시자 선택 다이얼로그 */}
      <ParticipantPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        students={students}
        initialSelected={participantIds}
        existingAssignmentCount={assignments.length}
        onConfirm={(ids) => {
          startTransition(async () => {
            try {
              await assignExamSeatsRandomly(sessionId, ids);
              setPickerOpen(false);
              router.refresh();
            } catch (e) {
              alert(e instanceof Error ? e.message : "배치 실패");
            }
          });
        }}
        pending={pending}
      />

      {/* 개별 좌석 변경 다이얼로그 */}
      {seatDialog !== null && (
        <SingleSeatDialog
          seatNumber={seatDialog}
          sessionId={sessionId}
          assignments={assignments}
          students={students}
          seatOwnerMap={seatOwnerMap}
          onClose={() => setSeatDialog(null)}
          onDone={() => {
            setSeatDialog(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── H룸 맵 ───────────────────────────────────────────────────────────────

function HRoomMap({
  takenSeatMap,
  seatOwnerMap,
  onSeatClick,
}: {
  takenSeatMap: Map<number, Assignment>;
  seatOwnerMap: Record<number, { id: string; name: string }>;
  onSeatClick: (n: number) => void;
}) {
  const renderCol = (seats: (number | null)[], key: number | string) => (
    <div
      key={key}
      style={{ flex: 1, minWidth: 0, height: H_COL_H, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
    >
      {seats.map((n, ri) =>
        n === null ? (
          <div key={`sp-${ri}`} style={{ height: SEAT_H, flexShrink: 0 }} />
        ) : (
          <SeatCell
            key={n}
            num={n}
            taker={takenSeatMap.get(n)}
            owner={seatOwnerMap[n]}
            onClick={() => onSeatClick(n)}
          />
        )
      )}
    </div>
  );

  return (
    <div className="flex" style={{ gap: COLS_GAP }}>
      {renderCol(H_COL_A, "A")}
      {renderCol(H_COL_66, "66")}
      <div style={{ width: SECTION_GAP, flexShrink: 0 }} />
      {H_COL_DEFS.map((seats, i) => renderCol(seats, `D${i}`))}
      <div style={{ flex: 1, minWidth: 0 }}>
        <SeatCell num={71} taker={takenSeatMap.get(71)} owner={seatOwnerMap[71]} onClick={() => onSeatClick(71)} />
      </div>
    </div>
  );
}

function SeatCell({
  num,
  taker,
  owner,
  onClick,
}: {
  num: number;
  taker: Assignment | undefined;
  owner: { id: string; name: string } | undefined;
  onClick: () => void;
}) {
  const occupied = !!taker;
  const sameAsOwner = !!taker && !!owner && taker.studentId === owner.id;

  return (
    <button
      onClick={onClick}
      style={{ height: SEAT_H, width: "100%" }}
      className={cn(
        "rounded-lg border flex flex-col items-stretch text-center overflow-hidden print:rounded-none print:border-[#333]",
        "transition-all duration-150 select-none",
        occupied
          ? "border-blue-500 hover:border-blue-600 print:bg-white"
          : "border-gray-300 hover:border-gray-400 bg-gray-50 print:bg-white",
      )}
    >
      {/* 응시자 영역 (상단 2/3) */}
      <div
        className={cn(
          "flex-1 flex flex-col items-center justify-center px-1 py-0.5",
          occupied ? "bg-blue-50" : "bg-transparent"
        )}
      >
        <span className={cn("text-[10px] font-bold leading-none", occupied ? "text-blue-700" : "text-gray-400")}>
          {num}
        </span>
        <span className={cn("text-[12px] font-semibold truncate max-w-full leading-tight mt-[2px]", occupied ? "text-gray-900" : "text-gray-300")}>
          {taker?.studentName ?? "–"}
        </span>
      </div>
      {/* 원 주인 영역 (하단 1/3) — 응시자와 다를 때만 */}
      {!sameAsOwner && owner && (
        <div className="bg-amber-50 border-t border-amber-200 px-1 py-[1px] flex items-center justify-center gap-1 print:bg-white print:border-[#666]">
          <span className="text-[9px] font-semibold text-amber-700 shrink-0">원주인</span>
          <span className="text-[11px] text-amber-900 font-medium truncate">
            {owner.name}
          </span>
        </div>
      )}
      {!sameAsOwner && !owner && occupied && (
        <div className="bg-gray-50 border-t border-gray-200 px-1 py-[1px]">
          <span className="text-[9px] text-gray-400">원주인 없음</span>
        </div>
      )}
    </button>
  );
}

// ─── 응시자 선택 다이얼로그 ──────────────────────────────────────────────

function ParticipantPicker({
  open,
  onClose,
  students,
  initialSelected,
  existingAssignmentCount,
  onConfirm,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  students: Student[];
  initialSelected: Set<string>;
  existingAssignmentCount: number;
  onConfirm: (ids: string[]) => void;
  pending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string>("all");

  // reset when opened
  useEffect(() => {
    if (open) {
      setSelected(new Set(initialSelected));
      setQuery("");
      setGradeFilter("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grades = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => set.add(s.grade));
    return Array.from(set).sort();
  }, [students]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (gradeFilter !== "all" && s.grade !== gradeFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.school ?? "").toLowerCase().includes(q) ||
        (s.seat ?? "").toLowerCase().includes(q)
      );
    });
  }, [students, query, gradeFilter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = filtered.every((s) => next.has(s.id));
      for (const s of filtered) {
        if (allSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>시험 응시자 선택</DialogTitle>
          <DialogDescription>
            선택 후 저장하면 기존 좌석 배치는 삭제되고 새로 랜덤 배치됩니다. H룸 좌석 수(33석)를 넘을 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="이름/학교/좌석으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <select
            className="text-sm border rounded-md px-2 py-1.5 bg-background"
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            <option value="all">전체 학년</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={toggleAllFiltered}>
            {filtered.every((s) => selected.has(s.id)) && filtered.length > 0 ? "표시 전체 해제" : "표시 전체 선택"}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            선택 {selected.size}명 / {students.length}명
          </span>
        </div>

        <div className="max-h-[400px] overflow-y-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-xs">
              <tr>
                <th className="w-10 p-2"></th>
                <th className="p-2 text-left">이름</th>
                <th className="p-2 text-left">학년</th>
                <th className="p-2 text-left">학교</th>
                <th className="p-2 text-left">기본 좌석</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const on = selected.has(s.id);
                return (
                  <tr
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={cn("cursor-pointer hover:bg-muted/50 border-t", on && "bg-blue-50/60")}
                  >
                    <td className="p-2">
                      <Checkbox checked={on} onCheckedChange={() => toggle(s.id)} />
                    </td>
                    <td className="p-2 font-medium">{s.name}</td>
                    <td className="p-2 text-xs">{s.grade}</td>
                    <td className="p-2 text-xs text-muted-foreground">{s.school ?? "–"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{s.seat ?? "–"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                    조건에 맞는 학생이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center pt-2">
          <p className="text-xs text-muted-foreground">
            {existingAssignmentCount > 0 && "※ 기존 좌석 배치가 모두 초기화됩니다."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button
              onClick={() => onConfirm(Array.from(selected))}
              disabled={pending || selected.size === 0}
            >
              {pending ? "배치 중…" : `${selected.size}명 랜덤 배치`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 단일 좌석 변경 다이얼로그 ───────────────────────────────────────────

function SingleSeatDialog({
  seatNumber,
  sessionId,
  assignments,
  students,
  seatOwnerMap,
  onClose,
  onDone,
}: {
  seatNumber: number;
  sessionId: string;
  assignments: Assignment[];
  students: Student[];
  seatOwnerMap: Record<number, { id: string; name: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const current = assignments.find((a) => a.seatNumber === seatNumber);
  const owner = seatOwnerMap[seatNumber];
  const participantIds = new Set(assignments.map((a) => a.studentId));

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(current?.studentId ?? "");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students
      .filter((s) => (!q ? true : s.name.toLowerCase().includes(q) || (s.grade ?? "").toLowerCase().includes(q)))
      .slice(0, 50);
  }, [students, query]);

  function handleSave() {
    startTransition(async () => {
      try {
        await manualAssignExamSeat(sessionId, seatNumber, selectedId || null);
        onDone();
      } catch (e) {
        alert(e instanceof Error ? e.message : "변경 실패");
      }
    });
  }

  function handleRemoveParticipant() {
    if (!current) return;
    if (!confirm(`${current.studentName} 학생을 응시자에서 제외할까요?`)) return;
    startTransition(async () => {
      try {
        await removeExamParticipant(sessionId, current.studentId);
        onDone();
      } catch (e) {
        alert(e instanceof Error ? e.message : "제외 실패");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{seatNumber}번 좌석</DialogTitle>
          <DialogDescription>
            {current ? (
              <>
                현재: <b>{current.studentName}</b> ({current.studentGrade})
                {owner && owner.id !== current.studentId && (
                  <span className="text-muted-foreground"> · 원 주인: {owner.name}</span>
                )}
              </>
            ) : (
              <>빈 좌석 {owner ? `· 원 주인: ${owner.name}` : ""}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input placeholder="학생 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-64 overflow-y-auto border rounded">
            <button
              type="button"
              onClick={() => setSelectedId("")}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-muted border-b",
                !selectedId && "bg-muted/60 font-medium"
              )}
            >
              — 비워두기 —
            </button>
            {filtered.map((s) => {
              const inSession = participantIds.has(s.id);
              const isCurrent = current?.studentId === s.id;
              const otherSeat = assignments.find((a) => a.studentId === s.id && a.seatNumber !== seatNumber);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between border-b last:border-b-0",
                    selectedId === s.id && "bg-blue-50"
                  )}
                >
                  <span>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground ml-1">({s.grade})</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {isCurrent ? "현재" : otherSeat ? `${otherSeat.seatNumber}번 → 교환` : inSession ? "응시자" : "미응시"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between pt-2">
          {current ? (
            <Button variant="outline" size="sm" onClick={handleRemoveParticipant} disabled={pending} className="text-destructive">
              <X className="h-3.5 w-3.5 mr-1" />
              응시자 제외
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={pending}>
              {pending ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

