// 지금 쓰는 결제사가 무엇이고 무엇을 할 수 있는지 — 어드민 화면이 버튼·안내를 맞춰 보여 줄 때 쓴다.
// 키·주소 같은 설정값은 내보내지 않는다.

import { getTuitionProvider } from "@/lib/tuition/provider-registry";

export type TuitionProviderInfo = {
  name: "payssam" | "toss" | "mock";
  /** 화면에 보이는 이름 */
  label: string;
  /** 결제사가 학부모에게 카카오 알림톡 청구서를 직접 보내 줄 수 있는지 */
  canNotify: boolean;
  /** 결제 금액 일부만 취소할 수 있는지. false 면 부분 환불은 직접 돌려준 뒤 기록한다 */
  partialCancel: boolean;
  /** 시험 환경(테스트 키·개발 서버·모의 결제) */
  testMode: boolean;
  /** 알림 발송에 선불 포인트를 쓰는 결제사인지 (잔액 조회 가능) */
  hasBalance: boolean;
};

const LABEL = { payssam: "결제선생", toss: "토스페이먼츠", mock: "모의 결제" } as const;

/** 결제사 연동이 없으면 null (온라인 결제 미사용) */
export function getTuitionProviderInfo(): TuitionProviderInfo | null {
  const provider = getTuitionProvider();
  if (!provider) return null;
  return {
    name: provider.name,
    label: LABEL[provider.name],
    canNotify: provider.canNotify,
    partialCancel: provider.partialCancel,
    testMode: provider.testMode,
    hasBalance: typeof provider.getBalance === "function",
  };
}

/** 선불 포인트 잔액 — 포인트를 쓰지 않는 결제사면 null. 조회 실패는 ProviderError 로 던진다 */
export async function getTuitionProviderBalance(): Promise<{ balance: number | null; chargeUrl: string | null } | null> {
  const provider = getTuitionProvider();
  if (!provider?.getBalance) return null;
  return provider.getBalance();
}
