// 외부 AI 로 보내기 전에 이름·연락처·민감 문장을 가리고, 받은 글에서 이름만 되돌린다 (순수 함수).

/** 개인정보 보호법 제23조(건강·종교 등)에 걸릴 수 있는 문장을 고르는 낱말. 학습 문맥에서 흔히 쓰는 말(진단·처방·불안)은 뺀다 */
// ponytail: 낱말 목록 방식 — 돌려 말한 문장은 못 거른다. 걸러야 할 사례가 쌓이면 분류 모델로 올린다
const SENSITIVE_WORDS = [
  "병원", "의원", "진단서", "처방전", "복용", "우울증", "우울감", "공황", "불안장애", "자해", "자살", "정신과", "심리치료",
  "ADHD", "수술", "입원", "생리통", "임신", "장애등급", "교회", "성당", "사찰", "기독교", "천주교", "불교", "종교",
];
export const SENSITIVE_PLACEHOLDER = "[민감정보 제외]";

const PHONE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g;
const RESIDENT_NO = /\d{6}-[1-4]\d{6}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasBatchim = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};

/** 가명이 받침 있는 이름으로 바뀌면 조사도 맞춘다: 학생A는 → 김민준은 */
const PARTICLES: [batchim: string, open: string][] = [
  ["은", "는"],
  ["이", "가"],
  ["을", "를"],
  ["과", "와"],
  ["으로", "로"],
  ["아", "야"],
];

function withParticle(name: string, particle: string) {
  const pair = PARTICLES.find((p) => p.includes(particle));
  if (!pair) return name + particle;
  // ㄹ 받침 뒤에는 '로'
  const rieul = (name.charCodeAt(name.length - 1) - 0xac00) % 28 === 8;
  if (pair[0] === "으로") return name + (hasBatchim(name) && !rieul ? "으로" : "로");
  return name + (hasBatchim(name) ? pair[0] : pair[1]);
}

/** 앞글자가 한글이면 다른 낱말의 일부로 본다 */
const NOT_AFTER_HANGUL = "(?<![가-힣])";
/** 이름만 부를 때 뒤에 올 수 있는 것 */
const GIVEN_NAME_TAIL = "(?=이|은|는|가|을|를|아|야|의|에|도|와|과|[^가-힣]|$)";

export type MaskTarget = { name: string | null | undefined; label?: string };

export type Pseudonymizer = {
  mask: (text: string) => string;
  unmask: (text: string) => string;
  /** 지금까지 가린 이름·연락처·민감 문장 수 */
  counts: () => { names: number; contacts: number; sensitive: number };
};

/**
 * targets: 이 요청의 당사자(학생·멘토) — 이름만 부른 것까지 가린다.
 * roster: 그 밖에 글에 나올 수 있는 이름(재원생 명단) — 오탐을 줄이려고 세 글자 이상 성명만 가린다.
 */
export function createPseudonymizer(targets: MaskTarget[], roster: string[] = []): Pseudonymizer {
  const counts = { names: 0, contacts: 0, sensitive: 0 };
  const entries: { name: string; alias: string; given: string | null }[] = [];
  const perLabel = new Map<string, number>();
  const add = (raw: string | null | undefined, label: string, primary: boolean) => {
    const name = raw?.trim();
    if (!name || name.length < (primary ? 2 : 3) || entries.some((e) => e.name === name)) return;
    const n = perLabel.get(label) ?? 0;
    perLabel.set(label, n + 1);
    const letter = String.fromCharCode(65 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : "");
    const given = primary && /^[가-힣]{3}$/.test(name) ? name.slice(1) : null;
    entries.push({ name, alias: `${label}${letter}`, given });
  };
  for (const t of targets) add(t.name, t.label ?? "학생", true);
  for (const name of roster) add(name, "학생", false);

  // 긴 이름부터 — 짧은 이름이 긴 이름의 일부를 먼저 바꾸지 않게
  const byLength = [...entries].sort((a, b) => b.name.length - a.name.length);

  const mask = (text: string) => {
    let out = text;
    for (const e of byLength) {
      out = out.replace(new RegExp(`${NOT_AFTER_HANGUL}${escape(e.name)}`, "g"), () => (counts.names++, e.alias));
    }
    for (const e of byLength) {
      if (!e.given) continue;
      out = out.replace(new RegExp(`${NOT_AFTER_HANGUL}${escape(e.given)}${GIVEN_NAME_TAIL}`, "g"), () => (counts.names++, e.alias));
    }
    const contact = (label: string) => () => (counts.contacts++, label);
    return out.replace(RESIDENT_NO, contact("[주민등록번호]")).replace(PHONE, contact("[전화번호]")).replace(EMAIL, contact("[이메일]"));
  };

  const unmask = (text: string) => {
    // 긴 가명부터 (학생A1 이 학생A 로 먼저 바뀌지 않게)
    const aliases = [...entries].sort((a, b) => b.alias.length - a.alias.length);
    let out = text;
    for (const e of aliases) {
      const tail = PARTICLES.flat().sort((a, b) => b.length - a.length).join("|");
      out = out.replace(new RegExp(`${escape(e.alias)}(?![0-9A-Z])(?:(${tail})(?![가-힣]))?`, "g"), (_, particle?: string) =>
        particle ? withParticle(e.name, particle) : e.name,
      );
    }
    return out;
  };

  return { mask, unmask, counts: () => ({ ...counts }) };
}

/** 민감정보 낱말이 든 문장을 통째로 뺀다 */
export function dropSensitiveSentences(text: string): { text: string; dropped: number } {
  let dropped = 0;
  const out = text
    .split(/(?<=[.!?。\n])/)
    .map((sentence) => {
      if (!SENSITIVE_WORDS.some((w) => sentence.includes(w))) return sentence;
      dropped++;
      return `${SENSITIVE_PLACEHOLDER}${sentence.endsWith("\n") ? "\n" : " "}`;
    })
    .join("");
  return { text: dropped > 0 ? out : text, dropped };
}
