import { todayKST } from "@/lib/utils";

/** 동의받는 문구의 버전 = 개인정보 처리방침 시행일. 문구를 바꾸면 함께 올린다 */
export const CONSENT_DOC_VERSION = "2026-12-01";

export const PRIVACY_URL = "https://www.kanghanseonbae.com/privacy.html";
export const TERMS_URL = "https://www.kanghanseonbae.com/terms.html";

/** 동의한 날 (KST) — @db.Date 에 넣는다 */
export function todayConsentDate(): Date {
  return todayKST();
}

/** 법정대리인 동의 확인 방법 (개인정보 보호법 시행령 제17조의2 제1항 각 호) */
export const GUARDIAN_CHECKS = {
  PAPER_SIGN: "동의서에 서명·날인 (4호)",
  WEB_SMS: "온라인 동의 후 문자로 알림 (1호)",
  WEB_PHONE_AUTH: "온라인 동의 후 휴대전화 본인인증 (3호)",
  EMAIL: "동의 내용을 적은 이메일 회신 (5호)",
  PHONE: "전화로 알리고 동의 (6호)",
} as const;
export type GuardianCheck = keyof typeof GUARDIAN_CHECKS;

export const PAPER_CONSENT_KINDS = ["PRIVACY_REQUIRED", "PRIVACY_OPTIONAL", "MARKETING", "SENSITIVE"] as const;
export type PaperConsentKind = (typeof PAPER_CONSENT_KINDS)[number];

export const CONSENT_KIND_LABEL: Record<PaperConsentKind | "TERMS", string> = {
  TERMS: "이용약관",
  PRIVACY_REQUIRED: "필수 수집·이용",
  PRIVACY_OPTIONAL: "선택 항목",
  MARKETING: "광고성 정보 수신",
  SENSITIVE: "민감정보 (별도)",
};

/** 만 나이. 생일이 지나지 않았으면 한 살 적다 */
export function fullAge(birth: Date, on: Date): number {
  const age = on.getUTCFullYear() - birth.getUTCFullYear();
  const before =
    on.getUTCMonth() < birth.getUTCMonth() ||
    (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() < birth.getUTCDate());
  return before ? age - 1 : age;
}

export type PaperConsentInput = {
  studentId: string;
  /** "YYYY-MM-DD" 서명한 날 */
  agreedOn: string;
  under14: boolean;
  guardianName: string;
  guardianCheck: string;
  agreed: Partial<Record<PaperConsentKind, boolean>>;
};

type Parsed = {
  studentId: string;
  agreedOn: Date;
  under14: boolean;
  guardianName: string | null;
  guardianCheck: GuardianCheck | null;
  kinds: { kind: PaperConsentKind; agreed: boolean }[];
};

/** 서면 동의 등록값 검사. 실패하면 한국어 안내 문구 */
export function parsePaperConsent(
  input: PaperConsentInput,
  opts: { today: Date; birthDate: Date | null },
): { ok: true; value: Parsed } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!input || typeof input.studentId !== "string" || !input.studentId) return fail("학생을 찾을 수 없습니다");
  if (typeof input.agreedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.agreedOn)) return fail("서명한 날을 입력해주세요");
  const agreedOn = new Date(`${input.agreedOn}T00:00:00.000Z`);
  if (Number.isNaN(agreedOn.getTime())) return fail("서명한 날을 입력해주세요");
  if (agreedOn.getTime() > opts.today.getTime()) return fail("서명한 날이 오늘보다 늦을 수 없습니다");

  // 생년월일을 알면 그 값이 우선 — 잘못 고른 값으로 법정대리인 동의를 건너뛰지 않게
  const under14 = opts.birthDate ? fullAge(opts.birthDate, agreedOn) < 14 : input.under14 === true;
  const guardianName = typeof input.guardianName === "string" ? input.guardianName.trim().slice(0, 40) : "";
  const guardianCheck = (input.guardianCheck in GUARDIAN_CHECKS ? input.guardianCheck : null) as GuardianCheck | null;
  if (under14 && !guardianName) return fail("만 14세 미만은 법정대리인 이름이 필요합니다");
  if (under14 && !guardianCheck) return fail("만 14세 미만은 법정대리인 동의를 확인한 방법이 필요합니다");

  const kinds = PAPER_CONSENT_KINDS.filter((k) => typeof input.agreed?.[k] === "boolean").map((kind) => ({
    kind,
    agreed: input.agreed[kind] as boolean,
  }));
  if (!kinds.some((k) => k.kind === "PRIVACY_REQUIRED")) return fail("필수 수집·이용 동의 여부를 골라주세요");
  return { ok: true, value: { studentId: input.studentId, agreedOn, under14, guardianName: guardianName || null, guardianCheck, kinds } };
}
