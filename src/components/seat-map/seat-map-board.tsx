"use client";

import { useState, useTransition, useOptimistic } from "react";
import { cn } from "@/lib/utils";
import { updateStudentSeat, swapStudentSeats } from "@/actions/students";
import { X, ArrowRightLeft, Search, Check, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Notice, StatusBadge } from "@/components/backoffice/ui";

// ─── 타입 ────────────────────────────────────────────────────────────────────

type StudentInfo = { id: string; name: string; seat: string | null; grade: string };

// 좌석 셀 높이 (너비는 flex로 자동)
const SEAT_H = 44;    // px
const COLS_GAP = 16;   // 같은 구역 내 열 간격 px
const SECTION_GAP = 32; // 구역 간 구분 간격 px (벽↔내부, 내부↔벽)

// 열 고정 높이 (justify-between 으로 공간 자동 분배)
const K_COL_H = 700;
const H_COL_H = 630;


// ─── 좌석 배정 모달 ──────────────────────────────────────────────────────────

function AssignDialog({
  seatNum,
  current,
  allStudents,
  onClose,
  onAssign,
  isPending,
}: {
  seatNum: number;
  current: StudentInfo | undefined;
  allStudents: StudentInfo[];
  onClose: () => void;
  onAssign: (studentId: string | null) => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<string>(current?.id ?? "");
  const [query, setQuery] = useState("");

  const seatStr = String(seatNum);
  const assignedHere = allStudents.find((s) => s.seat === seatStr);

  // 검색 필터
  const q = query.trim().toLowerCase();
  const unassigned = allStudents.filter((s) => !s.seat && (!q || s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q)));
  const assignedElsewhere = allStudents.filter((s) => s.seat && s.seat !== seatStr && (!q || s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q)));

  // 교환 여부 판정
  const selectedStudent = allStudents.find((s) => s.id === selected);
  const isSwap = !!(selectedStudent?.seat && selectedStudent.seat !== seatStr && current);

  function pick(id: string) {
    setSelected(id);
    setQuery("");
  }

  // 목록 한 줄(선택지) — 선택되면 브랜드 약한 배경 + 체크
  const optionCls = (active: boolean) =>
    cn(
      "flex w-full items-center gap-x2 px-x3 py-x2_5 text-left t4-regular text-fg-neutral transition-colors hover:bg-bg-layer-default-pressed",
      active && "bg-bg-brand-weak hover:bg-bg-brand-weak",
    );
  const groupCls = "border-t border-stroke-neutral-muted bg-bg-layer-fill px-x3 py-x1 t2-medium text-fg-neutral-subtle";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        {/* 헤더 */}
        <DialogHeader>
          <DialogTitle className="tabular-nums">{seatNum}번 좌석</DialogTitle>
          <DialogDescription>
            {current ? `현재: ${current.name} (${current.grade})` : "빈 좌석"}
          </DialogDescription>
        </DialogHeader>

        {/* 교환 안내 */}
        {isSwap && (
          <Notice tone="warn" icon={ArrowRightLeft}>
            {current!.name}({seatNum}번) ↔ {selectedStudent!.name}({selectedStudent!.seat}번) 교환
          </Notice>
        )}

        {/* 원생 선택 — 검색 가능 */}
        <div className="flex flex-col gap-x2">
          <p className="t4-medium text-fg-neutral">원생 선택</p>

          {/* 선택된 학생 표시 */}
          {selected && selectedStudent && (
            <div className="flex items-center justify-between gap-x2 rounded-r2 bg-bg-brand-weak px-x3 py-x2">
              <span className="t4-bold text-fg-neutral">
                {selectedStudent.name} ({selectedStudent.grade})
                {selectedStudent.seat && selectedStudent.seat !== seatStr && (
                  <span className="ml-x1 t3-regular tabular-nums text-fg-neutral-subtle">[{selectedStudent.seat}번]</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setSelected("")}
                aria-label="선택 해제"
                className="grid size-7 shrink-0 place-items-center rounded-full text-fg-neutral-muted transition-colors hover:bg-bg-transparent-pressed"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* 검색 입력 */}
          <label className="flex h-10 items-center gap-x2 rounded-r2 bg-bg-neutral-weak px-x3 transition-shadow focus-within:bg-bg-layer-default focus-within:shadow-[inset_0_0_0_2px_var(--seed-color-stroke-neutral-contrast)]">
            <Search className="size-4 shrink-0 text-fg-neutral-subtle" aria-hidden />
            <input
              type="text"
              placeholder="이름으로 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="원생 이름 검색"
              className="h-full min-w-0 flex-1 bg-transparent t4-regular text-fg-neutral outline-none placeholder:text-fg-placeholder"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="검색어 지우기"
                className="grid size-6 shrink-0 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:text-fg-neutral"
              >
                <X className="size-4" />
              </button>
            )}
          </label>

          {/* 학생 목록 */}
          <div className="max-h-60 overflow-y-auto rounded-r3 border border-stroke-neutral-muted [&>*:first-child]:border-t-0">
            {/* 비우기 옵션 */}
            {!q && (
              <button type="button" onClick={() => pick("")} className={cn(optionCls(!selected), "text-fg-neutral-muted")}>
                <Check className={cn("size-4 shrink-0 text-fg-brand", !selected ? "opacity-100" : "opacity-0")} aria-hidden />
                비워두기
              </button>
            )}

            {/* 현재 배정 학생 */}
            {!q && assignedHere && (
              <button type="button" onClick={() => pick(assignedHere.id)} className={optionCls(selected === assignedHere.id)}>
                <Check className={cn("size-4 shrink-0 text-fg-brand", selected === assignedHere.id ? "opacity-100" : "opacity-0")} aria-hidden />
                <span>{assignedHere.name} ({assignedHere.grade})</span>
                <span className="ml-auto"><StatusBadge tone="brand">현재</StatusBadge></span>
              </button>
            )}

            {/* 미배정 */}
            {unassigned.length > 0 && (
              <>
                <div className={groupCls}>미배정</div>
                {unassigned.map((s) => (
                  <button type="button" key={s.id} onClick={() => pick(s.id)} className={optionCls(selected === s.id)}>
                    <Check className={cn("size-4 shrink-0 text-fg-brand", selected === s.id ? "opacity-100" : "opacity-0")} aria-hidden />
                    <span className="truncate">{s.name} ({s.grade})</span>
                  </button>
                ))}
              </>
            )}

            {/* 다른 좌석 (교환) */}
            {assignedElsewhere.length > 0 && (
              <>
                <div className={groupCls}>다른 좌석 (교환)</div>
                {assignedElsewhere.map((s) => (
                  <button type="button" key={s.id} onClick={() => pick(s.id)} className={optionCls(selected === s.id)}>
                    <Check className={cn("size-4 shrink-0 text-fg-brand", selected === s.id ? "opacity-100" : "opacity-0")} aria-hidden />
                    <span className="truncate">{s.name} ({s.grade})</span>
                    <span className="ml-auto shrink-0 t3-regular tabular-nums text-fg-neutral-subtle">{s.seat}번</span>
                  </button>
                ))}
              </>
            )}

            {q && unassigned.length === 0 && assignedElsewhere.length === 0 && (
              <p className="py-x6 text-center t4-regular text-fg-neutral-subtle">검색 결과가 없어요</p>
            )}
          </div>
        </div>

        {/* 버튼 */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="sm:flex-1">
            취소
          </Button>
          <Button
            disabled={isPending}
            onClick={() => {
              if (selected) {
                onAssign(selected);
              } else {
                if (current) onAssign(null);
                else onClose();
              }
            }}
            className="sm:flex-1"
          >
            {isPending ? "저장 중…" : isSwap ? "교환" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 좌석 셀 ─────────────────────────────────────────────────────────────────

function SeatCell({
  num,
  student,
  onClick,
  className,
}: {
  num: number;
  student: StudentInfo | undefined;
  onClick: () => void;
  className?: string;
}) {
  const occupied = !!student;
  return (
    <div style={{ width: "100%", height: SEAT_H, flexShrink: 0 }} className="flex gap-0">
      {/* 체크박스 3개 — 인쇄용 (화면에서는 숨김, 인쇄 시 표시) */}
      <div className="hidden flex-shrink-0 flex-col justify-center gap-[3px] pr-[3px] print:flex">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[10px] w-[10px] border border-palette-blue-600 bg-palette-static-white" />
        ))}
      </div>
      {/* 좌석 셀 */}
      <div className="relative flex-1" style={{ height: SEAT_H }}>
        <button
          type="button"
          onClick={onClick}
          aria-label={student ? `${num}번 좌석, ${student.name}` : `${num}번 좌석, 빈 좌석`}
          style={{ height: SEAT_H, position: "absolute", inset: 0 }}
          className={cn(
            "flex flex-col items-center justify-center rounded-r2 text-center select-none transition-colors duration-150",
            "print:rounded-none print:border print:border-palette-gray-1000 print:bg-palette-static-white print:shadow-none",
            occupied
              ? "bg-bg-brand-weak shadow-[inset_0_0_0_1px_var(--seed-color-stroke-brand-weak)] hover:bg-bg-brand-weak-pressed"
              : "bg-bg-layer-fill shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-muted)] hover:bg-bg-neutral-weak",
            className
          )}
        >
          <span className={cn(
            "t2-bold tabular-nums print:text-palette-static-black",
            occupied ? "text-fg-brand" : "text-fg-neutral-subtle print:text-palette-gray-700"
          )}>
            {num}
          </span>
          <span className={cn(
            "mt-x0_5 max-w-full truncate px-x1 t3-medium print:text-palette-static-black",
            occupied ? "text-fg-neutral" : "text-fg-placeholder print:text-palette-gray-400"
          )}>
            {student?.name ?? "–"}
          </span>
        </button>
      </div>
    </div>
  );
}

// 빈 공간 (레이아웃 정렬용)
function Spacer() {
  return <div style={{ width: "100%", height: SEAT_H, flexShrink: 0 }} />;
}

// 시설 표시
function FacilityBlock({ label, h, flex }: { label: string; h?: number; flex?: number }) {
  return (
    <div
      style={{ flex: flex ?? 1, height: h ?? 40, minWidth: 0 }}
      className="flex items-center justify-center rounded-r2 border border-dashed border-stroke-neutral-weak bg-bg-layer-fill t3-medium text-fg-neutral-subtle"
    >
      {label}
    </div>
  );
}

// 높이 고정 + justify-between 으로 아이템 상하 균등 분배
function JustifiedColumn({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, height, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      {children}
    </div>
  );
}

// ─── K룸 ────────────────────────────────────────────────────────────────────
// Col 1: [spacer, 7-1]          8 cells → gap ≈ 50px (넓음)
// Col 2: [8, 47-53]             8 cells → gap ≈ 50px
// Col 3: [9, 46-40]             8 cells → gap ≈ 50px
// Col 4: [10, 33-39]            8 cells → gap ≈ 50px
// Col 5: [11, 32-26]            8 cells → gap ≈ 50px
// Col 6: [12, 13-25]           14 cells → gap ≈ 5px (좁음)
// 모든 열 K_COL_H=700px 로 상하 정렬

// K룸 열 정의: null = 빈칸(spacer)
const K_COL_DEFS: (number | null)[][] = [
  [null, 7, 6, 5, 4, 3, 2, 1],
  [8, 47, 48, 49, 50, 51, 52, 53],
  [9, 46, 45, 44, 43, 42, 41, 40],
  [10, 33, 34, 35, 36, 37, 38, 39],
  [11, 32, 31, 30, 29, 28, 27, 26],
  [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
];

function KRoom({
  seatMap,
  onSeatClick,
}: {
  seatMap: Map<string, StudentInfo>;
  onSeatClick: (num: number) => void;
}) {
  const renderCol = (seats: (number | null)[], key: number) => (
    <JustifiedColumn key={key} height={K_COL_H}>
      {seats.map((n, ri) =>
        n === null ? (
          <Spacer key={`sp-${ri}`} />
        ) : (
          <SeatCell
            key={n}
            num={n}
            student={seatMap.get(String(n))}
            onClick={() => onSeatClick(n)}
          />
        )
      )}
    </JustifiedColumn>
  );

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {/* 메인 열 블록: 좌벽 | 구분 | 내부 4열 | 구분 | 우벽 */}
      <div className="flex" style={{ gap: COLS_GAP }}>
        {/* Col 1: 좌측 벽 (1-7) */}
        {renderCol(K_COL_DEFS[0], 0)}

        {/* 구역 구분 */}
        <div style={{ width: SECTION_GAP, flexShrink: 0 }} />

        {/* Cols 2-5: 내부 책상 4열 */}
        {K_COL_DEFS.slice(1, 5).map((seats, i) => renderCol(seats, i + 1))}

        {/* 구역 구분 */}
        <div style={{ width: SECTION_GAP, flexShrink: 0 }} />

        {/* Col 6: 우측 벽 (12-25) */}
        {renderCol(K_COL_DEFS[5], 5)}
      </div>

      {/* 하단: 사물함 — 조교 테이블(중앙) — 87,88,89(우측) */}
      <div style={{ display: "flex", alignItems: "center", gap: COLS_GAP }}>
        <FacilityBlock label="사물함" h={40} />
        <div style={{ width: SECTION_GAP, flexShrink: 0 }} />
        <FacilityBlock label="조교 테이블" h={40} flex={2} />
        <div style={{ width: SECTION_GAP, flexShrink: 0 }} />
        {[87, 88, 89].map((n) => (
          <div key={n} style={{ flex: 1 }}>
            <SeatCell num={n} student={seatMap.get(String(n))} onClick={() => onSeatClick(n)} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── H룸 ────────────────────────────────────────────────────────────────────

// H룸 열 정의 — 66을 별도 열로 분리하여 계단형 구현
//   row0: [_,  _,  sep, 67, 68, 69, 70, 71]
//   row1: [_, 66,  sep,  _,  _,  _,  _,  _]
//   row2: [65, _,  sep, 82, 81, 72,  _,  _]
const H_COL_A: (number | null)[] = [null, null, 65, 64, 63, 62, 61, 60, 59, 58];
const H_COL_66: (number | null)[] = [null, 66, null, null, null, null, null, null, null, null];
const H_COL_DEFS: (number | null)[][] = [
  [67, null, 82, 83, 84, 85, 86, null, null, 57],         // Col B
  [68, null, 81, 80, 79, 78, 77, null, null, 56],          // Col C
  [69, null, 72, 73, 74, 75, 76, null, null, 55],          // Col D
  [70, null, null, null, null, null, null, null, null, 54], // Col E
];

// 룸별 좌석 번호 목록 — 탭의 배정 현황(배정/전체) 표시용. 배치 정의(위 상수)에서 그대로 뽑는다.
const ROOM_SEATS: Record<"K" | "H", number[]> = {
  K: [...K_COL_DEFS.flat(), 87, 88, 89].filter((n): n is number => n !== null),
  H: [...H_COL_A, ...H_COL_66, ...H_COL_DEFS.flat(), 71].filter((n): n is number => n !== null),
};

function HRoom({
  seatMap,
  onSeatClick,
}: {
  seatMap: Map<string, StudentInfo>;
  onSeatClick: (num: number) => void;
}) {
  const renderCol = (seats: (number | null)[], key: number) => (
    <JustifiedColumn key={key} height={H_COL_H}>
      {seats.map((n, ri) =>
        n === null ? (
          <Spacer key={`sp-${ri}`} />
        ) : (
          <SeatCell
            key={n}
            num={n}
            student={seatMap.get(String(n))}
            onClick={() => onSeatClick(n)}
          />
        )
      )}
    </JustifiedColumn>
  );

  // 조교 테이블 Y 위치: row 8 of 10 items (justify-between)
  const facilityY = Math.round(8 * (H_COL_H - SEAT_H) / 9);

  return (
    <div>
      {/* 메인 열 블록 + 조교 테이블 오버레이 */}
      <div className="flex" style={{ gap: COLS_GAP, position: "relative" }}>
        {/* Col A: 좌측 벽 (65-58) */}
        {renderCol(H_COL_A, 0)}

        {/* Col 66: 계단 중간 */}
        {renderCol(H_COL_66, 100)}

        {/* 좌/우 영역 구분 공간 */}
        <div style={{ width: SECTION_GAP, flexShrink: 0 }} />

        {/* Cols B-E */}
        {H_COL_DEFS.map((seats, i) => renderCol(seats, i + 1))}

        {/* Col F: 71번 (상단 모서리) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <SeatCell num={71} student={seatMap.get("71")} onClick={() => onSeatClick(71)} />
        </div>

        {/* 조교 테이블: row 8 위치, 우측 ColE+ColF 영역 */}
        <div
          style={{
            position: "absolute",
            top: facilityY,
            left: 0,
            right: 0,
            display: "flex",
            gap: COLS_GAP,
            pointerEvents: "none",
          }}
        >
          <div style={{ flex: 1 }} />
          <div style={{ flex: 1 }} />
          <div style={{ width: SECTION_GAP, flexShrink: 0 }} />
          <div style={{ flex: 1 }} />
          <div style={{ flex: 1 }} />
          <div style={{ flex: 1 }} />
          <div style={{ flex: 2, pointerEvents: "auto" }}>
            <FacilityBlock label="조교 테이블" h={SEAT_H} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

export function SeatMapBoard({ students }: { students: StudentInfo[] }) {
  const [activeTab, setActiveTab] = useState<"K" | "H">("K");
  const [dialogSeat, setDialogSeat] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  type SeatUpdate = {
    studentId: string | null;
    seat: string | null;
    swapWithId?: string;
    swapWithSeat?: string;
  };

  const [optimisticStudents, updateOptimistic] = useOptimistic(
    students,
    (prev: StudentInfo[], update: SeatUpdate) => {
      // 교환 모드
      if (update.swapWithId && update.swapWithSeat) {
        return prev.map((s) => {
          if (s.id === update.studentId) return { ...s, seat: update.seat };
          if (s.id === update.swapWithId) return { ...s, seat: update.swapWithSeat! };
          return s;
        });
      }
      // 일반 배정/해제
      return prev.map((s) => {
        if (update.seat && s.seat === update.seat && s.id !== update.studentId) {
          return { ...s, seat: null };
        }
        if (s.id === update.studentId) return { ...s, seat: update.seat };
        return s;
      });
    }
  );

  const seatMap = new Map<string, StudentInfo>();
  for (const s of optimisticStudents) {
    if (s.seat?.trim()) seatMap.set(s.seat.trim(), s);
  }

  const occupiedCount = optimisticStudents.filter((s) => s.seat?.trim()).length;
  const totalSeats = 89;

  function handleAssign(studentId: string | null) {
    if (dialogSeat === null) return;
    const seatStr = String(dialogSeat);

    // 비워두기
    if (!studentId) {
      const prev = seatMap.get(seatStr);
      if (!prev) { setDialogSeat(null); return; }
      startTransition(async () => {
        updateOptimistic({ studentId: prev.id, seat: null });
        await updateStudentSeat(prev.id, null);
        setDialogSeat(null);
      });
      return;
    }

    const selectedStudent = optimisticStudents.find((s) => s.id === studentId);
    const currentOccupant = seatMap.get(seatStr);

    // 교환: 선택한 학생이 다른 좌석에 있고, 현재 좌석도 배정되어 있으면
    if (selectedStudent?.seat && selectedStudent.seat !== seatStr && currentOccupant) {
      startTransition(async () => {
        updateOptimistic({
          studentId,
          seat: seatStr,
          swapWithId: currentOccupant.id,
          swapWithSeat: selectedStudent.seat!,
        });
        await swapStudentSeats(currentOccupant.id, studentId);
        setDialogSeat(null);
      });
      return;
    }

    // 일반 배정 (빈 좌석에 배정 or 다른 좌석에서 이동)
    startTransition(async () => {
      updateOptimistic({ studentId, seat: seatStr });
      await updateStudentSeat(studentId, seatStr);
      setDialogSeat(null);
    });
  }

  const dialogStudent = dialogSeat !== null ? seatMap.get(String(dialogSeat)) : undefined;

  const todayStr = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });

  function handlePrint() {
    window.print();
  }

  const roomOccupied = {
    K: ROOM_SEATS.K.filter((n) => seatMap.has(String(n))).length,
    H: ROOM_SEATS.H.filter((n) => seatMap.has(String(n))).length,
  };

  return (
    <div>
      {/* 요약·범례 — 인쇄 시 숨김 */}
      <div className="mb-x4 flex flex-wrap items-center gap-x2 print:hidden">
        <StatusBadge tone="brand" size="large">배정 {occupiedCount}석</StatusBadge>
        <StatusBadge tone="gray" size="large">빈 좌석 {totalSeats - occupiedCount}석</StatusBadge>
        <span className="t3-regular tabular-nums text-fg-neutral-subtle">전체 {totalSeats}석</span>
        <Button variant="outline" size="sm" onClick={handlePrint} className="ml-auto">
          <Printer />
          인쇄
        </Button>
      </div>

      {/* 탭 — 인쇄 시 숨김 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "K" | "H")} className="mb-x5 print:hidden">
        <TabsList>
          {(["K", "H"] as const).map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tab}룸
              <span className="t4-bold tabular-nums text-fg-neutral-subtle">
                {roomOccupied[tab]}/{ROOM_SEATS[tab].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 인쇄 헤더 — 화면에서는 숨김, 인쇄 시 표시 */}
      <div className="mb-x4 hidden items-center justify-between print:flex">
        <h2 className="t6-bold">{activeTab}룸</h2>
        <span className="t4-regular">날짜: {todayStr}</span>
      </div>

      {/* 룸 맵 — 좁은 화면에서는 가로 스크롤(배치 비율 유지) */}
      <div className="overflow-x-auto rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default p-x5 print:overflow-visible print:rounded-none print:border-0 print:p-0">
        <div className="min-w-[720px] print:min-w-0">
          {activeTab === "K" ? (
            <KRoom seatMap={seatMap} onSeatClick={setDialogSeat} />
          ) : (
            <HRoom seatMap={seatMap} onSeatClick={setDialogSeat} />
          )}
        </div>
      </div>

      {/* 인쇄용 가이드 — 화면에서는 숨김 */}
      <div className="mt-x2 hidden border-t border-palette-gray-1000 pt-x3 print:block">
        <div className="flex items-center gap-x6 t2-regular">
          <span className="t2-bold">* Guide</span>
          <div className="flex items-center gap-x1">
            <div className="h-[10px] w-[10px] border border-palette-blue-600" />
            <span>휴대폰</span>
          </div>
          <div className="flex items-center gap-x1">
            <div className="h-[10px] w-[10px] border border-palette-blue-600" />
            <span>플래너</span>
          </div>
          <div className="flex items-center gap-x1">
            <div className="h-[10px] w-[10px] border border-palette-blue-600" />
            <span>주간 학습 계획</span>
          </div>
        </div>
      </div>

      {/* 배정 모달 */}
      {dialogSeat !== null && (
        <AssignDialog
          seatNum={dialogSeat}
          current={dialogStudent}
          allStudents={optimisticStudents}
          onClose={() => setDialogSeat(null)}
          onAssign={handleAssign}
          isPending={isPending}
        />
      )}
    </div>
  );
}
