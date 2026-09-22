// 학년 일괄 승급 매핑 (신학년도 시작 시 1회성 작업)
// Student.grade 는 free string 이므로 알려진 값만 매핑하고 나머지는 수동 확인.

export type PromotionAction = "change" | "keep" | "manual";

export interface PromotionResult {
  after: string;
  action: PromotionAction;
}

const GRADE_MAP: Record<string, string> = {
  중1: "중2",
  중2: "중3",
  중3: "예비고1",
  예비고1: "고1",
  고1: "고2",
  고2: "고3",
  고3: "고3(퇴원예정)",
};

/** grade 문자열 → 승급 결과. N수/재수 포함 시 유지, 매핑 불가 시 수동 확인. */
export function promoteGrade(grade: string): PromotionResult {
  const g = grade.trim();
  if (g.includes("N수") || g.includes("재수")) return { after: g, action: "keep" };
  const after = GRADE_MAP[g];
  if (after) return { after, action: "change" };
  return { after: g, action: "manual" };
}
