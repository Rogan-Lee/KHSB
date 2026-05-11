/**
 * 영단어 시험 자동 채점 유틸.
 *
 * 채점 방침(확정): "정규화 + 복수 정답 인정"만. 오타 허용 없음.
 *  - 정규화: trim → 소문자 → 내부 공백 1칸 압축 → 후행 구두점 제거.
 *  - 복수 정답: 한 단어에 여러 뜻/철자를 등록하면 그 중 하나만 맞아도 정답.
 */

import type { VocabExamDirection } from "@/generated/prisma";

/** 후행 구두점/기호 (정답 비교 시 무시). */
const TRAILING_PUNCT = /[.,。·…!?！？\s]+$/u;
/** 선행 구두점/기호. */
const LEADING_PUNCT = /^[\s.,·]+/u;

/**
 * 답안 문자열 정규화.
 * 대소문자 무시, 앞뒤 공백/구두점 제거, 내부 연속 공백 1칸.
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(LEADING_PUNCT, "")
    .replace(TRAILING_PUNCT, "")
    .toLowerCase();
}

/**
 * 한글 뜻 문자열을 개별 정답 후보로 분해.
 * 예) "사과 / 사과나무, (속어) 멋진 것" → ["사과", "사과나무", "(속어) 멋진 것", "멋진 것"]
 * 구분자: 슬래시(/), 쉼표(,), 세미콜론(;), 가운뎃점(·), 줄바꿈.
 * 괄호 안의 보조 설명이 붙은 경우 괄호를 뗀 버전도 후보에 추가.
 */
export function splitMeaning(meaning: string): string[] {
  const parts = meaning
    .split(/[/,;·\n]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const p of parts) {
    out.add(p);
    const stripped = p.replace(/[（(][^（()）]*[)）]/gu, "").replace(/\s+/gu, " ").trim();
    if (stripped && stripped !== p) out.add(stripped);
  }
  return [...out];
}

/**
 * 단어 항목 + 출제 방향 → 정답 후보 배열(원문, 미정규화).
 *  - EN_TO_KO: 학생이 한글 뜻을 입력 → meanings 를 분해한 모든 후보.
 *  - KO_TO_EN: 학생이 영단어를 입력 → word (슬래시/쉼표로 여러 철자 표기 시 분해).
 */
export function expandExpected(
  entry: { word: string; meanings: string[] },
  direction: Exclude<VocabExamDirection, "MIXED">
): string[] {
  if (direction === "EN_TO_KO") {
    return entry.meanings.flatMap(splitMeaning).filter(Boolean);
  }
  // KO_TO_EN
  return entry.word
    .split(/[/,;]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 출제 방향 + 단어 항목 → 학생에게 보여줄 prompt 문자열. */
export function buildPrompt(
  entry: { word: string; meanings: string[] },
  direction: Exclude<VocabExamDirection, "MIXED">
): string {
  return direction === "EN_TO_KO" ? entry.word : entry.meanings.join(" / ");
}

/**
 * 학생 답안이 정답 후보 중 하나와 일치하는지.
 * 빈 답안("", null)은 항상 오답.
 */
export function isAnswerCorrect(
  studentAnswer: string | null | undefined,
  expectedAnswers: readonly string[]
): boolean {
  if (!studentAnswer) return false;
  const got = normalizeAnswer(studentAnswer);
  if (!got) return false;
  return expectedAnswers.some((e) => normalizeAnswer(e) === got);
}
