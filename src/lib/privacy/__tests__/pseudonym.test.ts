import { describe, expect, it } from "vitest";
import { createPseudonymizer, dropSensitiveSentences, SENSITIVE_PLACEHOLDER } from "../pseudonym";

describe("createPseudonymizer", () => {
  it("성명과 이름만 부른 것을 모두 가리고, 되돌릴 때 조사를 맞춘다", () => {
    const p = createPseudonymizer([{ name: "김민준" }]);
    const masked = p.mask("김민준은 수학이 약함. 민준이는 노력했고 민준과 상담함");
    expect(masked).not.toMatch(/민준/);
    expect(p.unmask("학생A는 성실해요. 학생A가 노력했고 학생A를 칭찬했어요.")).toBe("김민준은 성실해요. 김민준이 노력했고 김민준을 칭찬했어요.");
  });

  it("받침 없는 이름과 ㄹ 받침의 조사", () => {
    expect(createPseudonymizer([{ name: "이서아" }]).unmask("학생A은 학생A으로")).toBe("이서아는 이서아로");
    expect(createPseudonymizer([{ name: "박한결" }]).unmask("학생A로 정함")).toBe("박한결로 정함");
  });

  it("조사가 아닌 글자가 이어지면 건드리지 않는다", () => {
    expect(createPseudonymizer([{ name: "김민준" }]).unmask("학생A가정 · 학생A 학생은")).toBe("김민준가정 · 김민준 학생은");
  });

  it("멘토는 다른 가명을 쓰고, 명단의 다른 학생 성명도 가린다", () => {
    const p = createPseudonymizer([{ name: "김민준" }, { name: "최지우", label: "멘토" }], ["박서준", "김민준", "이솔"]);
    const masked = p.mask("김민준이 박서준과 싸웠다고 최지우 멘토가 전함. 이솔직한 이야기");
    expect(masked).toContain("학생A");
    expect(masked).toContain("멘토A");
    expect(masked).not.toMatch(/김민준|박서준|최지우/);
    expect(masked).toContain("이솔직한"); // 두 글자 명단 이름은 가리지 않는다
    expect(p.unmask(masked)).toContain("박서준");
  });

  it("다른 낱말 속의 같은 글자는 가리지 않는다", () => {
    expect(createPseudonymizer([{ name: "박하나" }]).mask("문제 하나하나 풀이")).toBe("문제 하나하나 풀이");
  });

  it("연락처·이메일·주민등록번호는 되돌리지 않는다", () => {
    const p = createPseudonymizer([]);
    const masked = p.mask("010-1234-5678 a.b@naver.com 080101-3123456");
    expect(masked).toBe("[전화번호] [이메일] [주민등록번호]");
    expect(p.unmask(masked)).toBe(masked);
    expect(p.counts().contacts).toBe(3);
  });

  it("스물일곱 번째 이름부터도 섞이지 않는다", () => {
    const names = Array.from({ length: 30 }, (_, i) => `김가${String.fromCharCode(0xac00 + i * 28)}`);
    const p = createPseudonymizer([], names);
    const text = names.join(", ");
    expect(p.unmask(p.mask(text))).toBe(text);
  });
});

describe("dropSensitiveSentences", () => {
  it("건강·종교 문장만 빼고 나머지는 둔다", () => {
    const { text, dropped } = dropSensitiveSentences("수학 2등급 목표. 우울증으로 정신과 다님. 취약 단원 진단 완료.\n일요일 교회 감\n영어는 좋음");
    expect(dropped).toBe(2);
    expect(text).not.toMatch(/우울증|교회/);
    expect(text).toContain(SENSITIVE_PLACEHOLDER);
    expect(text).toContain("취약 단원 진단 완료.");
    expect(text).toContain("영어는 좋음");
  });

  it("해당 문장이 없으면 원문 그대로", () => {
    const src = "오늘 순공 8시간. 내일은 국어 먼저.";
    expect(dropSensitiveSentences(src)).toEqual({ text: src, dropped: 0 });
  });
});
