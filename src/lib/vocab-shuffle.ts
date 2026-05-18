/**
 * 학생별 영단어 시험 순서 셔플 유틸 (per-attempt isolation).
 *
 * VocabExam.shuffle = exam-level 토글 (전체 셔플 on/off)
 * VocabAttempt.shuffleSeed = per-student 시드 (학생마다 다른 순서)
 *
 * 결정론적 셔플: mulberry32 PRNG + Fisher–Yates.
 * - 같은 (배열, seed) → 항상 같은 결과
 * - 다른 seed → 거의 확실히 다른 순서
 * - seed=null/undefined 일 때는 셔플하지 않고 원본 그대로 반환 (레거시 호환)
 *
 * 추가 의존성 없이 인라인 구현. crypto 도 안 씀(결정론 보장).
 */

/**
 * mulberry32 PRNG.
 * 32-bit seed → [0, 1) 부동소수 반환. 빠르고 작고 충분히 균일.
 * 참고: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0; // 32-bit unsigned
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates 셔플(시드 기반, 비파괴).
 * seed=null/undefined 면 원본을 그대로 반환(레거시 attempt 호환).
 */
export function seededShuffle<T>(arr: readonly T[], seed: number | null | undefined): T[] {
  const copy = arr.slice();
  if (seed == null) return copy; // 레거시: 셔플 없이 원본 순서
  const rng = mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * VocabAttempt 생성 시 사용할 새 시드를 발급.
 * crypto.randomInt 로 [0, 2^31 - 1) — Postgres INTEGER 안전 범위.
 */
export function newShuffleSeed(): number {
  // Edge runtime 등 randomInt 미지원 환경 대비 fallback.
  const cryptoObj = globalThis.crypto as
    | (typeof globalThis.crypto & { randomInt?: (min: number, max: number) => number })
    | undefined;
  if (cryptoObj?.randomInt) {
    return cryptoObj.randomInt(0, 0x7fffffff);
  }
  // Node 내장 crypto.randomInt
  try {
    // 동적 require 없이 import 하지만 client 번들엔 안 들어가도록 lazy
    // (이 모듈은 server-only 컨텍스트에서만 호출됨)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
    return nodeCrypto.randomInt(0, 0x7fffffff);
  } catch {
    return Math.floor(Math.random() * 0x7fffffff);
  }
}
