// 대기 신청의 윈터 시즌 예비 학년 · 추천인 입력 규칙.
// 폼(apply-form)과 서버 액션(submitWaitlist)이 같은 규칙을 쓰도록 한 곳에 둔다.

export const WINTER_GRADES = ["pre_high1", "pre_high2", "pre_high3"] as const;
export type WinterGrade = (typeof WINTER_GRADES)[number];

export const WINTER_GRADE_LABEL: Record<WinterGrade, string> = {
  pre_high1: "예비고1",
  pre_high2: "예비고2",
  pre_high3: "예비고3",
};

export const REFERRER_NAME_MAX = 50;

export function isWinterGrade(value: unknown): value is WinterGrade {
  return typeof value === "string" && (WINTER_GRADES as readonly string[]).includes(value);
}

/**
 * 예비 학년을 받아야 하는 신청인지.
 * 윈터 시즌 입실을 고른 대기 신청만 해당. N수생은 예비고 학년이 없어서 받지 않는다.
 */
export function isWinterGradeRequired(input: {
  kind: "WAITLIST" | "INQUIRY";
  entryPreference: string | null | undefined;
  gradeType: string | null | undefined;
}): boolean {
  return input.kind === "WAITLIST" && input.entryPreference === "winter" && input.gradeType !== "REPEAT";
}

/**
 * 저장할 예비 학년 값. 받지 않는 신청(즉시 입실·문의·N수생)은 무엇이 오든 null,
 * 받아야 하는데 비었거나 허용값이 아니면 에러.
 */
export function resolveWinterGrade(input: {
  kind: "WAITLIST" | "INQUIRY";
  entryPreference: string | null | undefined;
  gradeType: string | null | undefined;
  winterGrade: unknown;
}): { ok: true; winterGrade: WinterGrade | null } | { ok: false; error: string } {
  if (!isWinterGradeRequired(input)) return { ok: true, winterGrade: null };
  if (!isWinterGrade(input.winterGrade)) return { ok: false, error: "윈터 시즌 예비 학년을 선택해주세요" };
  return { ok: true, winterGrade: input.winterGrade };
}

/** 관리자 화면 표시용 — 허용값 외(과거 데이터 등)는 null */
export function winterGradeLabel(value: string | null | undefined): string | null {
  return isWinterGrade(value) ? WINTER_GRADE_LABEL[value] : null;
}

/** 랜딩 예약 현황용 이름 마스킹 — 성(첫 글자)만 남긴다. 한글 이름이 아니면 null. */
export function maskReservationName(name: string | null | undefined): string | null {
  const first = name?.trim().charAt(0) ?? "";
  return /^[가-힣]$/.test(first) ? `${first}○○` : null;
}
