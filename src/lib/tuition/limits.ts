// 결제 시도 횟수 제한 — 학부모 앱과 청구서 링크(로그인 없음)가 같이 쓴다.
// 결제 시도 행은 코어가 하나씩 만든다. 신청↔철회를 되풀이하면 그때마다 운영진 알림이 가고,
// 링크 생성이 계속 실패하면 결제사 호출이 쌓이므로 학생별 하루 횟수를 막아 둔다 (정상 이용은 1~2회).

import type { TuitionPaymentMethod } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { TuitionError } from "@/lib/tuition/types";

export const CHECKOUT_DAILY_LIMIT = 20;
export const ONSITE_DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 최근 24시간 동안 이 학생에게 만들어진 결제 시도가 limit 이상이면 거절한다 */
export async function assertTuitionDailyAttempts(
  studentId: string,
  methods: TuitionPaymentMethod[],
  limit: number,
  message: string,
): Promise<void> {
  const recent = await prisma.tuitionPayment.count({
    where: {
      invoice: { studentId },
      method: { in: methods },
      createdAt: { gte: new Date(Date.now() - DAY_MS) },
    },
  });
  if (recent >= limit) throw new TuitionError("BUSY", message, 429);
}
