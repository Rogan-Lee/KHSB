// 코어 호출 결과 변환 — 서버 전용 (Prisma 오류 코드를 본다).

import { Prisma } from "@/generated/prisma/client";
import { TuitionError, type TuitionErrorCode, type TuitionResult } from "@/lib/tuition/types";

/** 코어 호출을 TuitionResult 로 감싼다. 예상하지 못한 오류는 로그를 남기고 INTERNAL 로 돌려준다 */
export async function runTuition<T>(fn: () => Promise<T>): Promise<TuitionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    const failure = toTuitionFailure(error);
    if (failure.code === "INTERNAL") console.error("[tuition]", error);
    return { ok: false, ...failure };
  }
}

export function toTuitionFailure(error: unknown): { code: TuitionErrorCode; error: string } {
  if (error instanceof TuitionError) return { code: error.code, error: error.message };
  // 트랜잭션 대기·시간 초과(P2028), 쓰기 충돌(P2034) — 같은 학생의 다른 처리와 겹쳤다
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2028" || error.code === "P2034")
  ) {
    return { code: "BUSY", error: "다른 처리가 진행 중입니다. 잠시 후 다시 시도해 주세요" };
  }
  return { code: "INTERNAL", error: "처리하지 못했습니다. 잠시 후 다시 시도해 주세요" };
}
