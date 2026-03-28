"use client";

import { useState, useTransition, useOptimistic } from "react";
import { cn } from "@/lib/utils";
import { updateStudentSeat, swapStudentSeats } from "@/actions/students";
import { X, ArrowRightLeft, Search, Check, Printer } from "lucide-react";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-80 p-5 z-10">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-[#1e2124]">{seatNum}번 좌석</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {current ? `현재: ${current.name} (${current.grade})` : "빈 좌석"}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-[#1e2124] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 교환 안내 */}
        {isSwap && (
          <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
            <ArrowRightLeft className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-xs text-amber-800">
              {current!.name}({seatNum}번) ↔ {selectedStudent!.name}({selectedStudent!.seat}번) 교환
            </span>
          </div>
        )}

        {/* 원생 선택 — 검색 가능 */}
        <div className="space-y-1.5 mb-4">
          <label className="text-xs text-muted-foreground font-medium">원생 선택</label>

          {/* 선택된 학생 표시 */}
          {selected && selectedStudent && (
            <div className="flex items-center justify-between border border-[#0066ff]/30 bg-[#eaf2fe] rounded-lg px-3 py-2">
              <span className="text-sm font-medium">
                {selectedStudent.name} ({selectedStudent.grade})
                {selectedStudent.seat && selectedStudent.seat !== seatStr && (
                  <span className="text-xs text-muted-foreground ml-1">[{selectedStudent.seat}번]</span>
                )}
              </span>
              <button onClick={() => setSelected("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* 검색 입력 */}
          <div className="flex items-center gap-2 border border-[#e1e2e4] rounded-lg px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="이름으로 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* 학생 목록 */}
          <div className="max-h-48 overflow-y-auto border border-[#e1e2e4] rounded-lg">
            {/* 비우기 옵션 */}
            {!q && (
              <button
                onClick={() => pick("")}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-muted-foreground",
                  !selected && "bg-muted/60"
                )}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", !selected ? "opacity-100" : "opacity-0")} />
                — 비워두기 —
              </button>
            )}

            {/* 현재 배정 학생 */}
            {!q && assignedHere && (
              <button
                onClick={() => pick(assignedHere.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left",
                  selected === assignedHere.id && "bg-accent/60"
                )}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0 text-primary", selected === assignedHere.id ? "opacity-100" : "opacity-0")} />
                <span>{assignedHere.name} ({assignedHere.grade})</span>
                <span className="text-[10px] text-muted-foreground ml-auto">현재</span>
              </button>
            )}

            {/* 미배정 */}
            {unassigned.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground bg-muted/40 border-t">미배정</div>
                {unassigned.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => pick(s.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left",
                      selected === s.id && "bg-accent/60"
                    )}
                  >
                    <Check className={cn("h-3.5 w-3.5 shrink-0 text-primary", selected === s.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{s.name} ({s.grade})</span>
                  </button>
                ))}
              </>
            )}

            {/* 다른 좌석 (교환) */}
            {assignedElsewhere.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground bg-muted/40 border-t">다른 좌석 (교환)</div>
                {assignedElsewhere.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => pick(s.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left",
                      selected === s.id && "bg-accent/60"
                    )}
                  >
                    <Check className={cn("h-3.5 w-3.5 shrink-0 text-primary", selected === s.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{s.name} ({s.grade})</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{s.seat}번</span>
                  </button>
                ))}
              </>
            )}

            {q && unassigned.length === 0 && assignedElsewhere.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">검색 결과 없음</p>
            )}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm border border-[#e1e2e4] rounded-lg hover:bg-muted transition-colors"
          >
            취소
          </button>
          <button
            disabled={isPending}
            onClick={() => {
              if (selected) {
                onAssign(selected);
              } else {
                if (current) onAssign(null);
                else onClose();
              }
            }}
            className={cn(
              "flex-1 px-3 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50",
              isSwap
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-[#0066ff] hover:bg-[#005eeb]"
            )}
          >
            {isPending ? "저장 중…" : isSwap ? "교환" : "저장"}
          </button>
        </div>
      </div>
    </div>
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
      <div className="hidden print:flex flex-col justify-center gap-[3px] pr-[3px] flex-shrink-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[10px] h-[10px] border border-[#4a90d9] bg-white" />
        ))}
      </div>
      {/* 좌석 셀 */}
      <div className="flex-1 relative" style={{ height: SEAT_H }}>
        <button
          onClick={onClick}
          style={{ height: SEAT_H, position: "absolute", inset: 0 }}
          className={cn(
            "rounded-lg border flex flex-col items-center justify-center text-center",
            "transition-all duration-150 select-none print:rounded-none print:border-[#333]",
            occupied
              ? "border-[#0066ff] bg-[#eaf2fe] hover:bg-[#dbeafe] hover:border-[#005eeb] print:bg-white"
              : "border-[#d1d5db] bg-[#f9fafb] hover:border-[#9ca3af] hover:bg-[#f3f4f6] print:bg-white",
            className
          )}
        >
          <span className={cn(
            "text-[11px] font-bold leading-none print:text-black",
            occupied ? "text-[#005eeb]" : "text-[#9ca3af] print:text-[#666]"
          )}>
            {num}
          </span>
          <span className={cn(
            "text-[11px] leading-tight mt-1 truncate px-1 max-w-full print:text-black",
            occupied ? "text-[#1e2124] font-medium" : "text-[#d1d5db] print:text-[#ccc]"
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
      className="rounded-lg border border-dashed border-[#d1d5db] bg-[#f9fafb] flex items-center justify-center text-[11px] text-[#9ca3af] font-medium"
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

  return (
    <div>
      {/* 요약 — 인쇄 시 숨김 */}
      <div className="flex items-center gap-4 mb-5 flex-wrap print:hidden">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded border border-[#0066ff] bg-[#eaf2fe]" />
          <span className="text-xs text-muted-foreground">배정됨 ({occupiedCount}석)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded border border-[#d1d5db] bg-[#f9fafb]" />
          <span className="text-xs text-muted-foreground">빈 좌석 ({totalSeats - occupiedCount}석)</span>
        </div>
        <span className="text-xs text-muted-foreground">전체 {totalSeats}석</span>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">
            좌석을 클릭하면 원생을 배정/변경할 수 있습니다
          </span>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            인쇄
          </button>
        </div>
      </div>

      {/* 탭 — 인쇄 시 숨김 */}
      <div className="flex gap-1 mb-5 border-b print:hidden">
        {(["K", "H"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab
                ? "border-[#0066ff] text-[#0066ff]"
                : "border-transparent text-[#6d7882] hover:text-[#1e2124]"
            )}
          >
            {tab}룸
          </button>
        ))}
      </div>

      {/* 인쇄 헤더 — 화면에서는 숨김, 인쇄 시 표시 */}
      <div className="hidden print:flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">{activeTab}룸</h2>
        <span className="text-sm">날짜: {todayStr}</span>
      </div>

      {/* 룸 맵 */}
      <div className="pb-6 print:pb-2">
        {activeTab === "K" ? (
          <KRoom seatMap={seatMap} onSeatClick={setDialogSeat} />
        ) : (
          <HRoom seatMap={seatMap} onSeatClick={setDialogSeat} />
        )}
      </div>

      {/* 인쇄용 가이드 — 화면에서는 숨김 */}
      <div className="hidden print:block border-t pt-3 mt-2">
        <div className="flex items-center gap-6 text-xs">
          <span className="font-bold">* Guide</span>
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] border border-[#4a90d9]" />
            <span>휴대폰</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] border border-[#4a90d9]" />
            <span>플래너</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] border border-[#4a90d9]" />
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
