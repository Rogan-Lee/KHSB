"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchField } from "@/components/backoffice/ui";
import { toast } from "sonner";
import { Shuffle, Users, X, Printer } from "lucide-react";
import { useConfirmDialog } from "@/components/exams/use-confirm-dialog";
import {
  assignExamSeatsRandomly,
  reshuffleExamSeats,
  manualAssignExamSeat,
  removeExamParticipant,
} from "@/actions/exam-sessions";

// ─── H룸 레이아웃 정의 (좌석 배치도와 동일) ─────────────────────────────────

const SEAT_H = 82;
const COLS_GAP = 16;
const SECTION_GAP = 32;
const H_COL_H = 960;

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
  const [confirm, confirmDialog] = useConfirmDialog();

  const takenSeatMap = useMemo(() => {
    const m = new Map<number, Assignment>();
    for (const a of assignments) m.set(a.seatNumber, a);
    return m;
  }, [assignments]);

  const participantIds = useMemo(() => new Set(assignments.map((a) => a.studentId)), [assignments]);

  async function handleReshuffle() {
    if (assignments.length === 0) {
      setPickerOpen(true);
      return;
    }
    const ok = await confirm({
      title: `응시자 ${assignments.length}명의 좌석을 다시 랜덤 배치할까요?`,
      description: "지금 배치된 좌석은 모두 새로 섞여요.",
      confirmLabel: "다시 배치",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await reshuffleExamSeats(sessionId);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "재배치 실패");
      }
    });
  }

  return (
    <div className="flex flex-col gap-x4">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-x2 print:hidden">
        <Button size="sm" onClick={() => setPickerOpen(true)} disabled={pending}>
          <Users />
          응시자 선택 / 변경
        </Button>
        <Button size="sm" variant="outline" onClick={handleReshuffle} disabled={pending || assignments.length === 0}>
          <Shuffle />
          랜덤 재배치
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer />
          인쇄
        </Button>
        <span className="t3-regular tabular-nums text-fg-neutral-subtle sm:ml-auto">
          응시자 <span className="t3-bold text-fg-neutral">{assignments.length}명</span> · H룸 33석 · 좌석을 누르면 개별로 바꿀 수 있어요
        </span>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-x4 t3-regular text-fg-neutral-muted">
        <span className="inline-flex items-center gap-x1_5">
          <span className="inline-block size-3 rounded-r1 border border-stroke-informative-solid bg-bg-informative-weak" /> 응시자 (위)
        </span>
        <span className="inline-flex items-center gap-x1_5">
          <span className="inline-block size-3 rounded-r1 border border-stroke-warning-solid bg-bg-warning-weak" /> 본 좌석 학생 (아래, 응시자와 다를 때만)
        </span>
        <span className="inline-flex items-center gap-x1_5">
          <span className="inline-block size-3 rounded-r1 border border-stroke-neutral-weak bg-bg-layer-fill" /> 빈 좌석
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
              toast.error(e instanceof Error ? e.message : "배치 실패");
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

      {confirmDialog}
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
    <div className="-mx-1 overflow-x-auto px-1 pb-1 print:mx-0 print:overflow-visible print:p-0">
    <div className="flex min-w-[720px] print:min-w-0" style={{ gap: COLS_GAP }}>
      {renderCol(H_COL_A, "A")}
      {renderCol(H_COL_66, "66")}
      <div style={{ width: SECTION_GAP, flexShrink: 0 }} />
      {H_COL_DEFS.map((seats, i) => renderCol(seats, `D${i}`))}
      <div style={{ flex: 1, minWidth: 0 }}>
        <SeatCell num={71} taker={takenSeatMap.get(71)} owner={seatOwnerMap[71]} onClick={() => onSeatClick(71)} />
      </div>
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

  const showOwnerRow = !sameAsOwner; // 응시자와 원래 학생이 다를 때만 분할

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: SEAT_H, width: "100%" }}
      aria-label={`${num}번 좌석${taker ? ` · 응시자 ${taker.studentName}` : " · 빈 좌석"}`}
      className={cn(
        "relative flex select-none flex-col items-stretch overflow-hidden rounded-r2 border text-center print:rounded-none print:border-[#333]",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
        occupied
          ? "border-stroke-informative-solid hover:border-fg-informative print:bg-white"
          : "border-stroke-neutral-weak hover:border-stroke-neutral-solid print:bg-white",
      )}
    >
      {/* 좌석 번호 (좌상단) */}
      <span
        className={cn(
          "absolute left-1 top-0.5 z-10 t1-bold tabular-nums",
          occupied ? "text-fg-informative" : "text-fg-placeholder"
        )}
      >
        {num}
      </span>

      {/* 응시자 영역 */}
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center px-x1",
          occupied ? "bg-bg-informative-weak" : "bg-bg-layer-fill"
        )}
      >
        <span className="t1-medium text-fg-informative">응시자</span>
        <span className={cn("max-w-full truncate t3-bold", occupied ? "text-fg-neutral" : "text-fg-placeholder")}>
          {taker?.studentName ?? "–"}
        </span>
      </div>

      {/* 본 좌석 학생 영역 — 응시자와 다를 때만 */}
      {showOwnerRow && (
        <div className="flex flex-1 flex-col items-center justify-center border-t border-stroke-warning-weak bg-bg-warning-weak px-x1 print:border-[#666] print:bg-white">
          <span className="t1-medium text-fg-warning">본 좌석 학생</span>
          <span className="max-w-full truncate t3-bold text-fg-warning-contrast">
            {owner?.name ?? "–"}
          </span>
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

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>시험 응시자 선택</DialogTitle>
          <DialogDescription>
            저장하면 기존 좌석 배치는 지워지고 새로 랜덤 배치돼요. H룸 좌석 수(33석)를 넘을 수 없어요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x2">
          <SearchField
            placeholder="이름·학교·좌석으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:w-64"
            aria-label="학생 검색"
          />
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-32" aria-label="학년 필터">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 학년</SelectItem>
              {grades.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="secondary" onClick={toggleAllFiltered} disabled={filtered.length === 0}>
            {allFilteredSelected ? "보이는 학생 전체 해제" : "보이는 학생 전체 선택"}
          </Button>
          <span className="t3-regular tabular-nums text-fg-neutral-subtle sm:ml-auto">
            <span className="t3-bold text-fg-brand">{selected.size}명</span> 선택 / {students.length}명
          </span>
        </div>

        <div className="max-h-[400px] overflow-y-auto rounded-r3 border border-stroke-neutral-muted">
          <table className="w-full t4-regular text-fg-neutral">
            <thead className="sticky top-0 z-10 bg-bg-layer-fill">
              <tr className="border-b border-stroke-neutral-muted">
                <th className="w-11 px-x3 py-x2">
                  <span className="sr-only">선택</span>
                </th>
                <th className="px-x3 py-x2 text-left t3-medium text-fg-neutral-subtle">이름</th>
                <th className="px-x3 py-x2 text-left t3-medium text-fg-neutral-subtle">학년</th>
                <th className="px-x3 py-x2 text-left t3-medium text-fg-neutral-subtle">학교</th>
                <th className="px-x3 py-x2 text-left t3-medium text-fg-neutral-subtle">기본 좌석</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const on = selected.has(s.id);
                return (
                  <tr
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={cn(
                      "cursor-pointer border-b border-stroke-neutral-muted transition-colors last:border-0",
                      on ? "bg-bg-brand-weak" : "hover:bg-bg-layer-default-pressed"
                    )}
                  >
                    {/* 체크박스 클릭이 행 클릭으로 한 번 더 토글되지 않도록 전파를 막는다 */}
                    <td className="px-x3 py-x2_5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={on} onCheckedChange={() => toggle(s.id)} aria-label={`${s.name} 선택`} />
                    </td>
                    <td className="px-x3 py-x2_5 t4-medium">{s.name}</td>
                    <td className="px-x3 py-x2_5 text-fg-neutral-muted">{s.grade}</td>
                    <td className="px-x3 py-x2_5 text-fg-neutral-subtle">{s.school ?? "–"}</td>
                    <td className="px-x3 py-x2_5 tabular-nums text-fg-neutral-subtle">{s.seat ?? "–"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-x4 py-x8 text-center t4-regular text-fg-neutral-subtle">
                    조건에 맞는 학생이 없어요
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-x3 sm:flex-row sm:items-center sm:justify-between">
          <p className="t3-regular text-fg-warning">
            {existingAssignmentCount > 0 && "기존 좌석 배치가 모두 초기화돼요."}
          </p>
          <DialogFooter className="pt-0">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button
              onClick={() => onConfirm(Array.from(selected))}
              disabled={pending || selected.size === 0}
            >
              {pending ? "배치 중…" : `${selected.size}명 랜덤 배치`}
            </Button>
          </DialogFooter>
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
  const participantIds = useMemo(() => new Set(assignments.map((a) => a.studentId)), [assignments]);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(current?.studentId ?? "");
  const [pending, startTransition] = useTransition();

  // 응시자로 등록된 학생만 노출 (좌석 이동/교환용)
  const participantStudents = useMemo(
    () => students.filter((s) => participantIds.has(s.id)),
    [students, participantIds]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return participantStudents
      .filter((s) => (!q ? true : s.name.toLowerCase().includes(q) || (s.grade ?? "").toLowerCase().includes(q)))
      .slice(0, 50);
  }, [participantStudents, query]);

  const [confirm, confirmDialog] = useConfirmDialog();

  function handleSave() {
    startTransition(async () => {
      try {
        await manualAssignExamSeat(sessionId, seatNumber, selectedId || null);
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "변경 실패");
      }
    });
  }

  async function handleRemoveParticipant() {
    if (!current) return;
    const ok = await confirm({
      title: `${current.studentName} 학생을 응시자에서 제외할까요?`,
      description: "이 좌석 배정이 지워지고 응시자 목록에서 빠져요.",
      confirmLabel: "제외",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removeExamParticipant(sessionId, current.studentId);
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "제외 실패");
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
                현재 <span className="t4-bold text-fg-neutral">{current.studentName}</span> ({current.studentGrade})
                {owner && owner.id !== current.studentId && (
                  <span className="text-fg-neutral-subtle"> · 본 좌석 학생 {owner.name}</span>
                )}
              </>
            ) : (
              <>빈 좌석 {owner ? `· 본 좌석 학생 ${owner.name}` : ""}</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-x3">
          <div className="flex items-center gap-x2">
            <SearchField
              placeholder="응시자 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="sm:w-auto sm:flex-1"
              aria-label="응시자 검색"
            />
            <span className="shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">
              응시자 {participantStudents.length}명 중
            </span>
          </div>
          <p className="t3-regular text-fg-neutral-subtle">
            응시자로 등록된 학생 중에서 골라요. 새 응시자는 &quot;응시자 선택 / 변경&quot;에서 추가하세요.
          </p>
          <div
            role="listbox"
            aria-label="좌석에 앉힐 응시자"
            className="max-h-64 divide-y divide-stroke-neutral-muted overflow-y-auto rounded-r3 border border-stroke-neutral-muted"
          >
            <button
              type="button"
              role="option"
              aria-selected={!selectedId}
              onClick={() => setSelectedId("")}
              className={cn(
                "flex w-full items-center px-x4 py-x2_5 text-left t4-regular text-fg-neutral-muted transition-colors",
                !selectedId ? "bg-bg-brand-weak t4-medium text-fg-neutral" : "hover:bg-bg-layer-default-pressed"
              )}
            >
              비워두기
            </button>
            {filtered.length === 0 ? (
              <p className="px-x4 py-x6 text-center t4-regular text-fg-neutral-subtle">
                {participantStudents.length === 0
                  ? "등록된 응시자가 없어요"
                  : "검색 결과가 없어요"}
              </p>
            ) : (
              filtered.map((s) => {
                const isCurrent = current?.studentId === s.id;
                const otherSeat = assignments.find((a) => a.studentId === s.id && a.seatNumber !== seatNumber);
                const isSelected = selectedId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-x3 px-x4 py-x2_5 text-left transition-colors",
                      isSelected ? "bg-bg-brand-weak" : "hover:bg-bg-layer-default-pressed"
                    )}
                  >
                    <span className="min-w-0 truncate">
                      <span className="t4-medium text-fg-neutral">{s.name}</span>
                      <span className="ml-x1 t3-regular text-fg-neutral-subtle">{s.grade}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 t3-regular tabular-nums",
                        isCurrent ? "text-fg-brand" : otherSeat ? "text-fg-informative" : "text-fg-neutral-subtle"
                      )}
                    >
                      {isCurrent ? "현재" : otherSeat ? `${otherSeat.seatNumber}번과 교환` : "미배치"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-x2 sm:flex-row sm:items-center sm:justify-between">
          {current ? (
            <Button
              variant="ghost"
              onClick={handleRemoveParticipant}
              disabled={pending}
              className="text-fg-critical"
            >
              <X />
              응시자 제외
            </Button>
          ) : (
            <span />
          )}
          <DialogFooter className="pt-0">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={pending}>
              {pending ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </div>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
