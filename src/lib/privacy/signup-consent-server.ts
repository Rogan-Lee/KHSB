// 가입 동의 — 서버 쪽 순수 함수 (초대 조회·auth-server 훅이 같이 쓴다)

import { fullAge, todayConsentDate } from "@/lib/privacy/consent";
import {
  signupConsentItems,
  type SignupAudience,
  type SignupConsentKey,
} from "@/lib/privacy/signup-consent";

/** 만 14세 미만 여부. 학생 초대만 본다. 생년월일이 있으면 만 나이, 없으면 학년(초등·중1·중2)으로 보수적으로 본다 */
export function signupUnder14(
  type: SignupAudience,
  student: { birthDate: Date | null; grade: string } | null | undefined,
  today: Date = todayConsentDate(),
): boolean {
  if (type !== "STUDENT" || !student) return false;
  if (student.birthDate) return fullAge(student.birthDate, today) < 14;
  const grade = student.grade.replace(/\s/g, "");
  return /^(초|예비중)/.test(grade) || grade === "중1" || grade === "중2";
}

const ROW_KIND = { TERMS: "TERMS", PRIVACY: "PRIVACY_REQUIRED", MARKETING: "MARKETING" } as const;

export type SignupConsentRow = {
  kind: (typeof ROW_KIND)[keyof typeof ROW_KIND];
  agreed: boolean;
  under14: boolean | null;
};

/**
 * 가입 때 남길 ConsentRecord 행. 헤더가 없는 옛 앱은 이용약관 한 줄.
 * 보호자 확인(GUARDIAN)은 따로 행을 두지 않고 학생 PRIVACY_REQUIRED 행의 under14 로 남긴다.
 * 광고성 정보는 체크하지 않아도 agreed=false 로 남긴다.
 */
export function signupConsentRows(
  agreed: Set<SignupConsentKey> | null,
  audience: SignupAudience,
  under14: boolean,
): SignupConsentRow[] {
  if (!agreed) return [{ kind: "TERMS", agreed: true, under14: null }];
  return signupConsentItems(audience, { under14 }).flatMap((item) =>
    item.key === "GUARDIAN"
      ? []
      : [
          {
            kind: ROW_KIND[item.key],
            agreed: agreed.has(item.key),
            under14: item.key === "PRIVACY" && audience === "STUDENT" ? under14 : null,
          },
        ],
  );
}
