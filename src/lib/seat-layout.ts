// 좌석 배치도 정의 — 웹 좌석 배치도(src/components/seat-map/seat-map-board.tsx)와
// 모바일 좌석 현황(GET /api/mobile/v1/staff/seat-map)이 같은 정의를 쓴다.
// 좌석 번호는 Student.seat 문자열과 1:1 (예: "12").

/** 열 정의에서 null = 빈칸(정렬용 spacer) */
export type SeatLayoutCell = number | null;

// ─── K룸 ────────────────────────────────────────────────────────────────────
// Col 1: [spacer, 7-1]          8 cells → gap ≈ 50px (넓음)
// Col 2: [8, 47-53]             8 cells → gap ≈ 50px
// Col 3: [9, 46-40]             8 cells → gap ≈ 50px
// Col 4: [10, 33-39]            8 cells → gap ≈ 50px
// Col 5: [11, 32-26]            8 cells → gap ≈ 50px
// Col 6: [12, 13-25]           14 cells → gap ≈ 5px (좁음)
// 모든 열 K_COL_H=700px 로 상하 정렬

/** K룸 열 고정 높이(px) — 열 안에서 좌석을 위아래로 균등 분배 */
export const K_COL_H = 700;
/** H룸 열 고정 높이(px) */
export const H_COL_H = 630;

// K룸 열 정의: null = 빈칸(spacer)
export const K_COL_DEFS: SeatLayoutCell[][] = [
  [null, 7, 6, 5, 4, 3, 2, 1],
  [8, 47, 48, 49, 50, 51, 52, 53],
  [9, 46, 45, 44, 43, 42, 41, 40],
  [10, 33, 34, 35, 36, 37, 38, 39],
  [11, 32, 31, 30, 29, 28, 27, 26],
  [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
];

/** K룸 하단 줄 오른쪽 좌석 (사물함 — 조교 테이블 — 87,88,89) */
export const K_BOTTOM_SEATS = [87, 88, 89] as const;

// ─── H룸 ────────────────────────────────────────────────────────────────────
// H룸 열 정의 — 66을 별도 열로 분리하여 계단형 구현
//   row0: [_,  _,  sep, 67, 68, 69, 70, 71]
//   row1: [_, 66,  sep,  _,  _,  _,  _,  _]
//   row2: [65, _,  sep, 82, 81, 72,  _,  _]
export const H_COL_A: SeatLayoutCell[] = [null, null, 65, 64, 63, 62, 61, 60, 59, 58];
export const H_COL_66: SeatLayoutCell[] = [null, 66, null, null, null, null, null, null, null, null];
export const H_COL_DEFS: SeatLayoutCell[][] = [
  [67, null, 82, 83, 84, 85, 86, null, null, 57], // Col B
  [68, null, 81, 80, 79, 78, 77, null, null, 56], // Col C
  [69, null, 72, 73, 74, 75, 76, null, null, 55], // Col D
  [70, null, null, null, null, null, null, null, null, 54], // Col E
];
/** H룸 오른쪽 위 모서리 좌석 (Col F) */
export const H_CORNER_SEAT = 71;
/** H룸 조교 테이블 위치 — 10칸 중 8번째 줄, 오른쪽 끝 두 열(Col E·F) 위 */
export const H_FACILITY_ROW = 8;

/** 전체 좌석 수 */
export const TOTAL_SEATS = 89;

// ─── 모바일용 정규화 레이아웃 ────────────────────────────────────────────────

export type SeatLayoutBottomItem =
  | { kind: "facility"; label: string; flex: number }
  | { kind: "seat"; seat: number }
  | { kind: "aisle" };

export type SeatLayoutRoom = {
  key: "K" | "H";
  label: string;
  /** 열 고정 높이(px) — 열마다 좌석을 위아래로 균등 분배 */
  colHeight: number;
  /** 통로(aisle)로 나뉜 열 묶음. 각 열은 위→아래 좌석 번호(null = 빈칸) */
  blocks: SeatLayoutCell[][][];
  /** 열 아래 한 줄 (시설·좌석) */
  bottom: SeatLayoutBottomItem[];
  /** 열 위에 겹쳐 그리는 시설 — row 번째 칸 높이, 오른쪽 끝 span 개 열 */
  overlay: { label: string; row: number; span: number } | null;
};

/** 웹 배치도와 같은 정의로 만든 룸 레이아웃 (모바일 API 응답용) */
export function getSeatLayoutRooms(): SeatLayoutRoom[] {
  const hRows = H_COL_A.length;
  return [
    {
      key: "K",
      label: "K룸",
      colHeight: K_COL_H,
      blocks: [[K_COL_DEFS[0]], K_COL_DEFS.slice(1, 5), [K_COL_DEFS[5]]],
      bottom: [
        { kind: "facility", label: "사물함", flex: 1 },
        { kind: "aisle" },
        { kind: "facility", label: "조교 테이블", flex: 2 },
        { kind: "aisle" },
        ...K_BOTTOM_SEATS.map((seat) => ({ kind: "seat" as const, seat })),
      ],
      overlay: null,
    },
    {
      key: "H",
      label: "H룸",
      colHeight: H_COL_H,
      blocks: [
        [H_COL_A, H_COL_66],
        [
          ...H_COL_DEFS,
          [H_CORNER_SEAT, ...Array.from({ length: hRows - 1 }, () => null)],
        ],
      ],
      bottom: [],
      overlay: { label: "조교 테이블", row: H_FACILITY_ROW, span: 2 },
    },
  ];
}
