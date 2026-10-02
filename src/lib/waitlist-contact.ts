// 대기 신청·문의의 학부모/학생 연락처 정리.
// 인증은 폼을 작성하는 사람의 휴대폰으로만 가능해서(그 폰에서 문자 전송), 작성자 번호 = 인증 번호이고
// 다른 한쪽 번호는 인증 없이 받는다.

export type WaitApplicant = "PARENT" | "STUDENT";

export const WAIT_APPLICANTS: readonly string[] = ["PARENT", "STUDENT"];

export const APPLICANT_LABEL: Record<WaitApplicant, string> = { PARENT: "학부모", STUDENT: "학생" };

/** 휴대폰 번호 정규화 — 숫자만. 한국 휴대폰(010, 11자리)만 허용. */
export function normalizePhone(raw: unknown): string | null {
  const digits = (typeof raw === "string" ? raw : "").replace(/\D/g, "");
  return /^01[0-9]\d{7,8}$/.test(digits) ? digits : null;
}

/** 대기 신청은 학부모 번호가 필수 (원생 등록 시 학부모 번호가 필수라서). 문의는 작성자 번호만. */
export function isOtherPhoneRequired(kind: "WAITLIST" | "INQUIRY", applicant: WaitApplicant) {
  return kind === "WAITLIST" && applicant === "STUDENT";
}

/**
 * 작성자 번호(정규화 완료)와 다른 쪽 입력값으로 학부모/학생 번호를 나눈다.
 * 다른 쪽은 비어 있으면 null, 형식이 틀리면 에러.
 */
export function splitContactPhones(input: {
  kind: "WAITLIST" | "INQUIRY";
  applicant: WaitApplicant;
  phone: string;
  otherPhone: unknown;
}): { ok: true; parentPhone: string | null; studentPhone: string | null } | { ok: false; error: string } {
  const otherLabel = APPLICANT_LABEL[input.applicant === "PARENT" ? "STUDENT" : "PARENT"];
  const otherRaw = typeof input.otherPhone === "string" ? input.otherPhone.trim() : "";
  let other: string | null = null;
  if (otherRaw) {
    other = normalizePhone(otherRaw);
    if (!other) return { ok: false, error: `${otherLabel} 휴대폰 번호를 확인해주세요` };
  } else if (isOtherPhoneRequired(input.kind, input.applicant)) {
    return { ok: false, error: `${otherLabel} 휴대폰 번호를 입력해주세요` };
  }
  return input.applicant === "PARENT"
    ? { ok: true, parentPhone: input.phone, studentPhone: other }
    : { ok: true, parentPhone: other, studentPhone: input.phone };
}

/** 관리자 화면 연락처 표시. 구분 입력 이전 신청은 phone 하나만 "연락처"로. */
export function contactPhonesForDisplay(e: {
  phone: string;
  parentPhone: string | null;
  studentPhone: string | null;
}): { label: string; phone: string; isApplicant: boolean }[] {
  if (!e.parentPhone && !e.studentPhone) {
    return e.phone ? [{ label: "연락처", phone: e.phone, isApplicant: true }] : [];
  }
  const rows: { label: string; phone: string; isApplicant: boolean }[] = [];
  if (e.parentPhone) rows.push({ label: "학부모", phone: e.parentPhone, isApplicant: e.parentPhone === e.phone });
  if (e.studentPhone) {
    // 두 칸에 같은 번호를 적었으면 인증 표시는 학부모 쪽에만
    const dupe = e.studentPhone === e.parentPhone;
    rows.push({ label: "학생", phone: e.studentPhone, isApplicant: !dupe && e.studentPhone === e.phone });
  }
  return rows;
}
