import { describe, expect, it } from "vitest";

import { MENTOR_QUESTIONS, type MentorQuestion } from "../entry";
import { parseEntryGrades, parseEntryMentor } from "../entry-validate";

describe("parseEntryGrades", () => {
  it("등급 1·9·null 통과, 모르는 과목은 버림, 이름 trim", () => {
    const r = parseEntryGrades({
      mock: { examName: "  10월 모의고사 ", scores: { 국어: 1, 수학: 9, 영어: null, 한국사: 3 } },
      school: null,
    });
    expect(r).toEqual({
      ok: true,
      value: { mock: { examName: "10월 모의고사", scores: { 국어: 1, 수학: 9, 영어: null } }, school: null },
    });
  });

  it("둘 다 null 이면 통과", () => {
    expect(parseEntryGrades({ mock: null, school: null })).toEqual({ ok: true, value: { mock: null, school: null } });
  });

  it.each([0, 10, 2.5, "3"])("등급 %s 는 거절", (g) => {
    expect(parseEntryGrades({ mock: null, school: { term: "1학기", scores: { 국어: g } } }).ok).toBe(false);
  });

  it("시험 이름 0자·41자 거절, 40자 통과", () => {
    expect(parseEntryGrades({ mock: { examName: "  ", scores: {} }, school: null })).toEqual({
      ok: false,
      error: "모의고사 이름을 입력해 주세요",
    });
    expect(parseEntryGrades({ mock: null, school: { term: "가".repeat(41), scores: {} } })).toEqual({
      ok: false,
      error: "내신 시기는 40자까지 입력할 수 있어요",
    });
    expect(parseEntryGrades({ mock: null, school: { term: "가".repeat(40), scores: {} } }).ok).toBe(true);
  });

  it("형식이 틀리면 거절", () => {
    expect(parseEntryGrades(null).ok).toBe(false);
    expect(parseEntryGrades({ mock: "x", school: null }).ok).toBe(false);
    expect(parseEntryGrades({ mock: { examName: "a", scores: [] }, school: null }).ok).toBe(false);
  });
});

const Q: MentorQuestion[] = [
  { key: "style", title: "스타일", kind: "single", options: ["A", "B"], required: true },
  { key: "focus", title: "도움", kind: "multi", options: ["x", "y", "z"], required: true },
  { key: "memo", title: "메모", kind: "text", required: false },
];

describe("parseEntryMentor", () => {
  it("정상 답, 모르는 key 버림, multi 는 보기 순서로", () => {
    expect(parseEntryMentor({ answers: { style: "B", focus: ["z", "x"], memo: " 안녕 ", hack: "1" } }, Q)).toEqual({
      ok: true,
      value: { answers: { style: "B", focus: ["x", "z"], memo: "안녕" } },
    });
  });

  it("선택 질문은 비우면 빠짐", () => {
    expect(parseEntryMentor({ answers: { style: "A", focus: ["y"], memo: "  " } }, Q)).toEqual({
      ok: true,
      value: { answers: { style: "A", focus: ["y"] } },
    });
  });

  it("필수 누락·보기 밖 값·multi 0개 거절", () => {
    expect(parseEntryMentor({ answers: { focus: ["x"] } }, Q)).toEqual({ ok: false, error: '"스타일"에 답해 주세요' });
    expect(parseEntryMentor({ answers: { style: "C", focus: ["x"] } }, Q).ok).toBe(false);
    expect(parseEntryMentor({ answers: { style: "A", focus: [] } }, Q).ok).toBe(false);
    expect(parseEntryMentor({ answers: { style: "A", focus: ["w"] } }, Q).ok).toBe(false);
    expect(parseEntryMentor({ answers: { style: "A", focus: "x" } }, Q).ok).toBe(false);
  });

  it("text 500자 경계", () => {
    const base = { style: "A", focus: ["x"] };
    expect(parseEntryMentor({ answers: { ...base, memo: "가".repeat(500) } }, Q).ok).toBe(true);
    expect(parseEntryMentor({ answers: { ...base, memo: "가".repeat(501) } }, Q).ok).toBe(false);
  });

  it("answers 가 없으면 거절", () => {
    expect(parseEntryMentor({}, Q).ok).toBe(false);
    expect(parseEntryMentor(null, Q).ok).toBe(false);
  });

  it("실제 임시 질문으로도 통과", () => {
    const answers = Object.fromEntries(
      MENTOR_QUESTIONS.filter((q) => q.required).map((q) => [q.key, q.kind === "multi" ? [q.options![0]] : q.options![0]]),
    );
    expect(parseEntryMentor({ answers }, MENTOR_QUESTIONS).ok).toBe(true);
  });
});
