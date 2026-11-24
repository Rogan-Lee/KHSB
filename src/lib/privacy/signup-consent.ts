// 가입 화면 동의 항목 — 웹(src/components/auth/sign-up-form.tsx)과 앱(초대 가입)이 같은 문구를 쓴다.
// 앱은 src/ 를 가져다 쓸 수 없어 apps/mobile/src/features/safety/signup-consent.ts 에 같은 내용을 복사해 둔다. 고치면 둘 다 고친다.
//
// 전송: 클라이언트가 체크한 항목 key 를 쉼표로 이어 SIGNUP_CONSENT_HEADER 로 보낸다 (예: "TERMS,PRIVACY,MARKETING").
// 헤더가 없으면 이 화면이 없는 옛 앱이다 → 서버는 예전처럼 이용약관 동의만 기록한다.
//
// 개인정보 수집·이용은 필수 동의로 받는다(사용자 결정 2026-11-24). 처리방침 "처리하는 근거" 표(계약 근거)와 맞추는 건 처리방침 쪽 몫.
// 만 14세 미만 보호자 동의는 입회 때 서면 동의서로 확인한다(처리방침 제4조) → 앱 체크는 보호자에게 알렸다는 확인일 뿐이다.

import { PRIVACY_URL, TERMS_URL } from "@/lib/privacy/consent";

export const SIGNUP_CONSENT_HEADER = "x-studyroom-consent";

export const SIGNUP_CONSENT_KEYS = ["TERMS", "PRIVACY", "GUARDIAN", "MARKETING"] as const;
export type SignupConsentKey = (typeof SIGNUP_CONSENT_KEYS)[number];
export type SignupAudience = "STUDENT" | "PARENT" | "STAFF";

export type SignupConsentItem = {
  key: SignupConsentKey;
  required: boolean;
  /** 체크박스 옆 문구 ([필수]/[선택] 은 화면에서 붙인다) */
  label: string;
  /** "보기" 를 눌렀을 때 보여 줄 요약. strong 은 굵게 + 밑줄 (보유 기간 등 눈에 띄게 알릴 것) */
  rows: { label: string; text: string; strong?: boolean }[];
  /** 전문 링크 */
  doc?: { url: string; label: string };
};

const TERMS: SignupConsentItem = {
  key: "TERMS",
  required: true,
  label: "이용약관·운영정책 동의",
  rows: [
    { label: "지킬 것", text: "욕설·비방·괴롭힘, 성적이거나 불쾌한 내용, 다른 사람의 개인정보를 올리면 안 돼요." },
    { label: "신고·차단", text: "부적절한 메시지는 신고하거나 상대를 차단할 수 있어요. 신고는 원장님이 24시간 안에 확인해요." },
    { label: "위반하면", text: "글을 지우고, 경고하거나 앱 이용을 제한해요." },
  ],
  doc: { url: TERMS_URL, label: "이용약관 전문 보기" },
};

const PRIVACY_MEMBER: SignupConsentItem = {
  key: "PRIVACY",
  required: true,
  label: "개인정보 수집·이용 동의",
  rows: [
    { label: "목적", text: "회원 가입·본인 확인·계정 관리, 출결·학습·멘토링·메시지·알림 등 관리형 독서실 서비스 제공" },
    {
      label: "항목",
      text: "아이디, 이메일(비밀번호 재설정용), 비밀번호(암호화해 저장), 이름, 앱을 쓰면서 생기는 기록(출결, 학습 계획, 성적, 설문 응답, 메시지 등)",
    },
    {
      label: "보유 기간",
      text: "계정 정보는 탈퇴하면 바로 파기해요. 독서실 이용 기록은 이용 계약이 끝난 날부터 3년 보관한 뒤 파기해요.",
      strong: true,
    },
    { label: "거부", text: "동의하지 않을 수 있어요. 다만 동의하지 않으면 가입할 수 없어요." },
  ],
  doc: { url: PRIVACY_URL, label: "개인정보처리방침 전문 보기" },
};

const PRIVACY_STAFF: SignupConsentItem = {
  ...PRIVACY_MEMBER,
  rows: [
    { label: "목적", text: "운영진 계정 관리, 업무 처리, 개인정보처리시스템 접속 기록 보관" },
    { label: "항목", text: "아이디, 이메일, 비밀번호(암호화해 저장), 이름, 휴대전화번호, 근무 기록, 접속 기록(일시·접속지·연 화면)" },
    { label: "보유 기간", text: "계정 정보는 탈퇴하면 바로 파기해요. 접속 기록은 2년 보관해요.", strong: true },
    { label: "거부", text: "동의하지 않을 수 있어요. 다만 동의하지 않으면 가입할 수 없어요." },
  ],
};

const GUARDIAN: SignupConsentItem = {
  key: "GUARDIAN",
  required: true,
  label: "만 14세 미만 보호자 동의 확인",
  rows: [
    { label: "안내", text: "만 14세 미만은 개인정보를 처리할 때 보호자(법정대리인)의 동의가 필요해요." },
    { label: "확인 방법", text: "보호자 동의는 입회할 때 보호자가 서명한 동의서로 확인해요. 보호자에게 앱 가입을 알리고 동의를 받았는지 확인해 주세요." },
  ],
};

const MARKETING: SignupConsentItem = {
  key: "MARKETING",
  required: false,
  label: "광고성 정보 수신 동의",
  rows: [
    { label: "내용", text: "특강·이벤트 소식을 앱 알림으로 보내 드려요. 밤 9시부터 아침 8시까지는 보내지 않아요.", strong: true },
    { label: "선택", text: "동의하지 않아도 앱을 쓸 수 있어요. 출결·공지 같은 서비스 알림은 동의와 관계없이 받아요." },
    { label: "철회", text: "독서실에 말씀하시면 언제든 거둘 수 있어요." },
  ],
};

/** 가입하는 사람에게 보여 줄 항목 (필수 먼저, 선택 마지막) */
export function signupConsentItems(audience: SignupAudience, opts: { under14: boolean }): SignupConsentItem[] {
  if (audience === "STAFF") return [TERMS, PRIVACY_STAFF];
  if (audience === "PARENT") return [TERMS, PRIVACY_MEMBER, MARKETING];
  return opts.under14 ? [TERMS, PRIVACY_MEMBER, GUARDIAN, MARKETING] : [TERMS, PRIVACY_MEMBER, MARKETING];
}

/** 헤더 값 → 체크한 항목. 헤더가 없으면 null (옛 앱) */
export function parseSignupConsentHeader(raw: string | null | undefined): Set<SignupConsentKey> | null {
  if (raw == null) return null;
  const keys = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SignupConsentKey => (SIGNUP_CONSENT_KEYS as readonly string[]).includes(s));
  return new Set(keys);
}

export function formatSignupConsentHeader(keys: Iterable<SignupConsentKey>): string {
  return [...keys].join(",");
}

/** 필수 항목이 빠졌으면 한국어 안내 문구, 다 됐으면 null */
export function missingSignupConsent(agreed: Set<SignupConsentKey>, items: SignupConsentItem[]): string | null {
  const missing = items.find((item) => item.required && !agreed.has(item.key));
  return missing ? `필수 항목(${missing.label})을 확인해 주세요` : null;
}
