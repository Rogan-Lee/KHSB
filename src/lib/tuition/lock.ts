// 수강료 동시성 제어 — 학생 단위 트랜잭션 락.
//
// 규칙 (운영 DB 는 인스턴스당 연결 1개인 pgbouncer transaction pooler):
//  1. 청구서·결제·환불을 바꾸는 모든 쓰기는 prisma.$transaction 안에서 lockTuitionStudent 를 먼저 잡고,
//     필요한 행을 tx 로 다시 읽은 뒤 검증·갱신한다. 같은 학생의 발행·납부 확정·환불이 한 줄로 선다.
//  2. 트랜잭션 하나에 락은 하나만 잡는다 (여러 건 처리는 건마다 트랜잭션을 따로 연다 — 락 순서 문제 없음).
//  3. 트랜잭션 안에서는 tx 만 쓴다. 전역 prisma, 결제사 호출, 푸시, Slack, revalidatePath 는 커밋 뒤에.
//     (연결이 1개라 안에서 전역 prisma 를 부르면 자기 자신을 기다리다 시간 초과가 난다.)
//  4. pg_advisory_xact_lock 은 커밋·롤백 때 자동으로 풀린다. 세션 락(pg_advisory_lock)은 pooler 에서 쓰면 안 된다.

import type { Prisma } from "@/generated/prisma/client";

/** 수강료 트랜잭션 공통 옵션 — 락 대기 5초, 전체 10초. 넘으면 P2028 → BUSY 로 돌려준다 */
export const TUITION_TX = { maxWait: 5_000, timeout: 10_000 } as const;

export async function lockTuitionStudent(tx: Prisma.TransactionClient, studentId: string): Promise<void> {
  // pg_advisory_xact_lock 은 void 를 돌려주므로 서브쿼리로 감싼다 (request-decisions.ts 와 같은 형태)
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`tuition:${studentId}`}))) AS l`;
}
